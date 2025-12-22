import React, { useState, useRef, ReactNode, useEffect } from "react";
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
  const audioRef = useRef<HTMLAudioElement>(new Audio());

  const playTrack = (track: Track, index?: number) => {
    try {
      if (!track.url) {
        console.error("Cannot play track: no URL provided");
        return;
      }

      if (currentTrack?.url !== track.url) {
        // For external URLs (like Bandcamp), we might need to set crossOrigin
        if (track.url.startsWith('http://') || track.url.startsWith('https://')) {
          // Try anonymous crossOrigin for external URLs
          audioRef.current.crossOrigin = 'anonymous';
        } else {
          audioRef.current.crossOrigin = null;
        }
        
        audioRef.current.src = track.url;
        setCurrentTrack(track);
        
        // Log for debugging (development only)
        if (import.meta.env.DEV) {
          console.log('Setting audio source:', track.url);
        }

        // Find index in queue - prefer songId matching over URL matching for reliability
        let idx = -1;
        if (index !== undefined && index >= 0 && index < queue.length) {
          // Use provided index if valid
          idx = index;
        } else if (track.songId !== undefined) {
          // Try to find by songId first (more reliable)
          idx = queue.findIndex((t) => t.songId === track.songId);
        }

        // Fallback to URL matching if songId didn't work
        if (idx === -1) {
          idx = queue.findIndex((t) => t.url === track.url);
        }

        if (idx !== -1) {
          setCurrentIndex(idx);
        } else {
          // If track not found in queue, reset index
          setCurrentIndex(-1);
        }
      }

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

  const playNext = () => {
    if (queue.length > 0 && currentIndex < queue.length - 1) {
      const nextTrack = queue[currentIndex + 1];
      setCurrentIndex(currentIndex + 1);
      audioRef.current.src = nextTrack.url;
      setCurrentTrack(nextTrack);
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const playPrevious = () => {
    if (queue.length > 0 && currentIndex > 0) {
      const prevTrack = queue[currentIndex - 1];
      setCurrentIndex(currentIndex - 1);
      audioRef.current.src = prevTrack.url;
      setCurrentTrack(prevTrack);
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const addToQueue = (track: Track) => {
    setQueue((prev) => [...prev, track]);
  };

  useEffect(() => {
    const audio = audioRef.current;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMeta = () => {
      setDuration(audio.duration);
      if (import.meta.env.DEV) {
        console.log('Audio metadata loaded. Duration:', audio.duration, 'URL:', audio.src);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      playNext();
    };
    const onError = (e: Event) => {
      console.error('Audio error:', e, 'URL:', audio.src, 'Error code:', (audio as any).error?.code);
      setIsPlaying(false);
    };
    const onCanPlay = () => {
      if (import.meta.env.DEV) {
        console.log('Audio can play:', audio.src);
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [currentIndex, queue]);

  const value: AudioPlayerContextProps = {
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
    queue,
    setQueue,
    addToQueue,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
};
