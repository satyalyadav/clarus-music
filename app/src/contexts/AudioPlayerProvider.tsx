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
      setCurrentIndex(nextIndex);
      audioRef.current.src = nextTrack.url;
      setCurrentTrack(nextTrack);
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [queue, resolveCurrentIndex]);

  const playPrevious = useCallback(() => {
    const actualCurrentIndex = resolveCurrentIndex();
    if (actualCurrentIndex === -1) return;

    const prevIndex = actualCurrentIndex - 1;
    if (prevIndex >= 0 && prevIndex < queue.length) {
      const prevTrack = queue[prevIndex];
      setCurrentIndex(prevIndex);
      audioRef.current.src = prevTrack.url;
      setCurrentTrack(prevTrack);
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [queue, resolveCurrentIndex]);

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

  useEffect(() => {
    playNextRef.current = playNext;
  }, [playNext]);

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
      console.error(
        "Audio error:",
        e,
        "URL:",
        audio.src,
        "Error code:",
        (audio as any).error?.code
      );
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
