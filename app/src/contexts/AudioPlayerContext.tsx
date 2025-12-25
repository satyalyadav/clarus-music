import { createContext } from "react";

export interface Track {
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  cover?: string;
  songId?: number;
}

export interface AudioPlayerContextProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playTrack: (track: Track, index?: number) => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  stop: () => void;
  queue: Track[];
  setQueue: (tracks: Track[]) => void;
  addToQueue: (track: Track) => void;
}

export const AudioPlayerContext = createContext<
  AudioPlayerContextProps | undefined
>(undefined);
