import React, {
  useState,
  useRef,
  ReactNode,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import {
  AudioPlayerContext,
  Track,
  AudioPlayerContextProps,
} from "./AudioPlayerContext";
import { saveQueueState, loadQueueState } from "../utils/queuePersistence";
import { getSongsWithRelations, getSongUrl } from "../services/db";
import { createTrackFromSong } from "../utils/trackUtils";
import type { SongWithRelations } from "../services/db";

export const AudioPlayerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [lastQueueInsertIndex, setLastQueueInsertIndex] = useState<number>(-1);
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const lastSavedStructuralRef = useRef({
    queueLen: 0,
    index: -1,
    songId: null as number | null,
  });

  const playTrack = (track: Track, index?: number) => {
    try {
      if (!track.url) {
        console.error("Cannot play track: no URL provided");
        return;
      }

      const isNewSource = currentTrack?.url !== track.url;

      if (isNewSource) {
        // For external URLs (like Bandcamp), we might need to set crossOrigin
        if (
          track.url.startsWith("http://") ||
          track.url.startsWith("https://")
        ) {
          // Try anonymous crossOrigin for external URLs
          audioRef.current.crossOrigin = "anonymous";
        } else {
          audioRef.current.crossOrigin = null;
        }

        audioRef.current.src = track.url;
      }

      setCurrentTrack(track);

      // Log for debugging (development only)
      if (import.meta.env.DEV && isNewSource) {
        console.log("Setting audio source:", track.url);
      }

      // Use setQueue callback to access the latest queue state
      setQueue((prevQueue) => {
        // Find index in queue - prefer songId matching over URL matching for reliability
        let idx = -1;
        if (index !== undefined && index >= 0 && index < prevQueue.length) {
          // Use provided index if valid
          idx = index;
        } else if (track.songId !== undefined) {
          // Try to find by songId first (more reliable)
          idx = prevQueue.findIndex((t) => t.songId === track.songId);
        }

        // Fallback to URL matching if songId didn't work
        if (idx === -1) {
          idx = prevQueue.findIndex((t) => t.url === track.url);
        }

        // If track not found in queue, add it to the end and use that index
        if (idx === -1) {
          const newIndex = prevQueue.length;
          setCurrentIndex(newIndex);
          // Return new array
          return [...prevQueue, track];
        } else {
          setCurrentIndex(idx);
          // Always return a new array reference so consumers re-render
          return [...prevQueue];
        }
      });

      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((error) => {
            console.error("Error playing audio:", error);
            setIsPlaying(false);
          });
      } else {
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Error in playTrack:", error);
      setIsPlaying(false);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const seek = (time: number) => {
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const setVolume = (vol: number) => {
    audioRef.current.volume = vol;
    setVolumeState(vol);
  };

  const resolveCurrentIndex = useCallback(() => {
    if (queue.length === 0 || !currentTrack) return -1;

    let actualCurrentIndex = currentIndex;
    if (currentIndex < 0 || currentIndex >= queue.length) {
      actualCurrentIndex = -1;
    } else {
      const trackAtCurrentIndex = queue[currentIndex];
      const matches =
        currentTrack.songId !== undefined
          ? trackAtCurrentIndex.songId === currentTrack.songId
          : trackAtCurrentIndex.url === currentTrack.url;
      if (!matches) {
        actualCurrentIndex = -1;
      }
    }

    if (actualCurrentIndex === -1) {
      actualCurrentIndex =
        currentTrack.songId !== undefined
          ? queue.findIndex((t) => t.songId === currentTrack.songId)
          : queue.findIndex((t) => t.url === currentTrack.url);
    }

    return actualCurrentIndex;
  }, [queue, currentTrack, currentIndex]);

  const playNext = useCallback(() => {
    const actualCurrentIndex = resolveCurrentIndex();
    if (actualCurrentIndex === -1) return;

    const nextIndex = actualCurrentIndex + 1;
    if (nextIndex >= 0 && nextIndex < queue.length) {
      const nextTrack = queue[nextIndex];
      // Use playTrack instead of directly setting src to ensure proper error handling
      // and blob URL validation
      playTrack(nextTrack, nextIndex);
    }
  }, [queue, resolveCurrentIndex, playTrack]);

  const playPrevious = useCallback(() => {
    const actualCurrentIndex = resolveCurrentIndex();
    if (actualCurrentIndex === -1) return;

    const prevIndex = actualCurrentIndex - 1;
    if (prevIndex >= 0 && prevIndex < queue.length) {
      const prevTrack = queue[prevIndex];
      // Use playTrack instead of directly setting src to ensure proper error handling
      // and blob URL validation
      playTrack(prevTrack, prevIndex);
    }
  }, [queue, resolveCurrentIndex, playTrack]);

  const addToQueue = (track: Track) => {
    setQueue((prev) => {
      // Handle empty queue
      if (prev.length === 0) {
        setLastQueueInsertIndex(0);
        return [track];
      }
      
      // Determine the reference point: after currently playing song, or after top song if nothing is playing
      let referenceIndex: number;
      
      if (currentIndex >= 0 && currentIndex < prev.length) {
        // Something is playing: insert after the current song
        referenceIndex = currentIndex;
      } else {
        // Nothing is playing: insert after the top song (index 0)
        referenceIndex = 0;
      }
      
      // Determine where to insert:
      // - If we've already inserted songs after the reference point, insert after the last one
      // - Otherwise, insert right after the reference point
      let insertPosition: number;
      
      if (lastQueueInsertIndex >= referenceIndex && lastQueueInsertIndex < prev.length) {
        // We've already added songs after the reference point, insert after the last one
        insertPosition = lastQueueInsertIndex + 1;
      } else {
        // First song being added after the reference point
        insertPosition = referenceIndex + 1;
      }
      
      // Ensure insertPosition is within bounds
      insertPosition = Math.min(insertPosition, prev.length);
      
      // Insert the track at the calculated position
      const newQueue = [...prev];
      newQueue.splice(insertPosition, 0, track);
      
      // Update the last insertion index
      setLastQueueInsertIndex(insertPosition);

      return newQueue;
    });
  };

  const stop = () => {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTrack(null);
    setCurrentTime(0);
    setDuration(0);
  };

  // Reset insertion index when currentIndex changes (new song is playing)
  useEffect(() => {
    setLastQueueInsertIndex(-1);
  }, [currentIndex]);

  const playNextRef = useRef(playNext);
  const playPreviousRef = useRef(playPrevious);
  const togglePlayPauseRef = useRef(togglePlayPause);
  const queueRef = useRef(queue);
  const currentTrackRef = useRef(currentTrack);
  const currentIndexRef = useRef(currentIndex);

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

  useEffect(() => {
    playPreviousRef.current = playPrevious;
  }, [playPrevious]);

  useEffect(() => {
    togglePlayPauseRef.current = togglePlayPause;
  }, [togglePlayPause]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMeta = () => {
      setDuration(audio.duration);
      if (import.meta.env.DEV) {
        console.log(
          "Audio metadata loaded. Duration:",
          audio.duration,
          "URL:",
          audio.src
        );
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      playNextRef.current();
    };
    const onError = (e: Event) => {
      const error = (audio as any).error;
      const errorCode = error?.code;
      const errorMessage = error?.message || "Unknown error";
      
      console.error(
        "Audio error:",
        e,
        "URL:",
        audio.src,
        "Error code:",
        errorCode,
        "Error message:",
        errorMessage
      );
      
      // Check if it's a blob URL that failed (error code 4 = MEDIA_ELEMENT_ERROR: Format error)
      // This often happens when blob URLs are revoked or invalid
      if (audio.src.startsWith("blob:") && (errorCode === 4 || errorCode === 2)) {
        console.error(
          "Blob URL appears to be invalid or revoked:",
          audio.src,
          "This can happen when blob URLs are revoked while still in use."
        );
        // Try to continue to next track if available
        const currentTrack = currentTrackRef.current;
        const queue = queueRef.current;
        const currentIndex = currentIndexRef.current;
        
        if (currentTrack && queue.length > 0 && currentIndex >= 0 && currentIndex < queue.length - 1) {
          console.log("Attempting to play next track after blob URL error");
          setTimeout(() => {
            playNextRef.current();
          }, 100);
        }
      }
      
      setIsPlaying(false);
    };
    const onCanPlay = () => {
      if (import.meta.env.DEV) {
        console.log("Audio can play:", audio.src);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  // Keyboard shortcuts for media controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Space bar for play/pause
      if (e.code === "Space" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        togglePlayPauseRef.current();
        return;
      }

      // Arrow keys for next/previous
      if (e.code === "ArrowRight" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        playNextRef.current();
        return;
      }

      if (e.code === "ArrowLeft" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        playPreviousRef.current();
        return;
      }

      // Media keys (if supported)
      if (e.code === "MediaTrackNext") {
        e.preventDefault();
        playNextRef.current();
        return;
      }

      if (e.code === "MediaTrackPrevious") {
        e.preventDefault();
        playPreviousRef.current();
        return;
      }

      if (e.code === "MediaPlayPause") {
        e.preventDefault();
        togglePlayPauseRef.current();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Media Session API for Bluetooth/OS media controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    const mediaSession = navigator.mediaSession;

    // Set up action handlers
    mediaSession.setActionHandler("play", () => {
      togglePlayPauseRef.current();
    });

    mediaSession.setActionHandler("pause", () => {
      togglePlayPauseRef.current();
    });

    mediaSession.setActionHandler("previoustrack", () => {
      playPreviousRef.current();
    });

    mediaSession.setActionHandler("nexttrack", () => {
      playNextRef.current();
    });

    // Cleanup
    return () => {
      try {
        mediaSession.setActionHandler("play", null);
        mediaSession.setActionHandler("pause", null);
        mediaSession.setActionHandler("previoustrack", null);
        mediaSession.setActionHandler("nexttrack", null);
      } catch (e) {
        // Ignore errors during cleanup
      }
    };
  }, []);

  // Update Media Session metadata when track changes
  useEffect(() => {
    if (!("mediaSession" in navigator) || !currentTrack) {
      return;
    }

    const mediaSession = navigator.mediaSession;
    mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || "Unknown",
      artist: currentTrack.artist || "Unknown Artist",
      album: currentTrack.album || "",
      artwork: currentTrack.cover
        ? [
            {
              src: currentTrack.cover,
              sizes: "512x512",
              type: "image/png",
            },
          ]
        : [],
    });

    // Update playback state
    mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [currentTrack, isPlaying]);

  // Wrapped setQueue that resets insertion index when queue is replaced
  const wrappedSetQueue = (tracks: Track[] | ((prev: Track[]) => Track[])) => {
    if (typeof tracks === "function") {
      setQueue((prev) => {
        const result = tracks(prev);
        return Array.isArray(result) ? [...result] : result;
      });
    } else {
      setQueue([...tracks]);
    }
    setLastQueueInsertIndex(-1);
  };

  // Restore queue and position from localStorage on mount (once)
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const stored = loadQueueState();
    if (!stored?.songIds?.length) return;

    isRestoringRef.current = true;
    const clearRestoring = () => {
      isRestoringRef.current = false;
    };

    getSongsWithRelations()
      .then((allSongs) => {
        const byId = new Map(
          allSongs
            .filter((s): s is SongWithRelations & { song_id: number } =>
              Boolean(s.song_id)
            )
            .map((s) => [s.song_id, s])
        );
        const ordered = stored.songIds
          .map((id) => byId.get(id))
          .filter(Boolean) as SongWithRelations[];
        if (ordered.length === 0) {
          clearRestoring();
          return;
        }
        return Promise.all(
          ordered.map((song) =>
            getSongUrl(song)
              .then((url) => createTrackFromSong(song, url))
              .catch(() => null)
          )
        ).then((tracks) => {
          const validTracks = tracks.filter(
            (t): t is Track => t !== null && Boolean(t?.url)
          );
          if (validTracks.length === 0) {
            clearRestoring();
            return;
          }
          const idx = Math.min(
            Math.max(0, stored.currentIndex),
            validTracks.length - 1
          );
          wrappedSetQueue(validTracks);
          setTimeout(() => {
            playTrack(validTracks[idx], idx);
            seek(stored.currentTime);
            if (!stored.wasPlaying) {
              audioRef.current.pause();
              setIsPlaying(false);
            }
            clearRestoring();
          }, 100);
        });
      })
      .catch(clearRestoring);
  }, []);

  // Persist queue and position: save immediately when queue/current track change (so refresh keeps state), debounce when only time/playing changes
  useEffect(() => {
    if (isRestoringRef.current) return;
    const songIds = queue
      .filter((t): t is Track & { songId: number } => t.songId != null)
      .map((t) => t.songId);
    if (songIds.length === 0) return;

    const currentIdx =
      currentIndex >= 0 && currentIndex < queue.length
        ? currentIndex
        : queue.findIndex(
            (t) =>
              t.songId === currentTrack?.songId || t.url === currentTrack?.url
          );
    // Persist index in songIds space so restore (which only has those tracks) gets the right song
    const indexInSongIds =
      currentTrack?.songId != null
        ? songIds.indexOf(currentTrack.songId)
        : -1;
    const indexToSave = indexInSongIds >= 0 ? indexInSongIds : 0;

    const structural = {
      queueLen: queue.length,
      index: currentIdx,
      songId: currentTrack?.songId ?? null,
    };
    const structuralChanged =
      lastSavedStructuralRef.current.queueLen !== structural.queueLen ||
      lastSavedStructuralRef.current.index !== structural.index ||
      lastSavedStructuralRef.current.songId !== structural.songId;

    const doSave = () => {
      saveQueueState({
        songIds,
        currentIndex: indexToSave,
        currentTime,
        wasPlaying: isPlaying,
      });
    };

    if (structuralChanged) {
      lastSavedStructuralRef.current = structural;
      doSave();
      return;
    }

    const timeoutId = setTimeout(
      () => {
        doSave();
      },
      1500
    );
    return () => clearTimeout(timeoutId);
  }, [queue, currentIndex, currentTrack, currentTime, isPlaying]);

  // Create context value - create new object on every render to ensure updates are detected
  const value: AudioPlayerContextProps = useMemo(
    () => ({
      currentTrack,
      isPlaying,
      currentTime,
      duration,
      volume,
      playTrack,
      togglePlayPause,
      seek,
      setVolume,
      playNext,
      playPrevious,
      stop,
      queue,
      setQueue: wrappedSetQueue,
      addToQueue,
    }),
    [queue, currentTrack, isPlaying, currentTime, duration, volume]
  );

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
};
