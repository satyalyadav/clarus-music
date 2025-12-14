import React, {
  createContext,
  useContext,
  useState,
  useRef,
  ReactNode,
  useEffect,
} from "react";

export interface Track {
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  cover?: string;
  songId?: number;
}

interface AudioPlayerContextProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playTrack: (track: Track) => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  queue: Track[];
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
}

export const AudioPlayerContext = createContext<AudioPlayerContextProps | undefined>(
  undefined
);

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

  const playTrack = (track: Track) => {
    try {
      if (!track.url) {
        console.error('Cannot play track: no URL provided');
        return;
      }
      
      if (currentTrack?.url !== track.url) {
        audioRef.current.src = track.url;
        setCurrentTrack(track);

        // Find index in queue
        const idx = queue.findIndex((t) => t.url === track.url);
        if (idx !== -1) {
          setCurrentIndex(idx);
        }
      }
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((error) => {
            console.error('Error playing audio:', error);
            setIsPlaying(false);
          });
      } else {
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error in playTrack:', error);
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
    const onLoadedMeta = () => setDuration(audio.duration);
    const onEnded = () => {
      setIsPlaying(false);
      playNext();
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentIndex, queue]);

  return (
    <AudioPlayerContext.Provider
      value={{
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
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
};

