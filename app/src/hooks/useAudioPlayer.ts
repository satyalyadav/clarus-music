import { useContext } from "react";
import { AudioPlayerContext } from "../contexts/AudioPlayerContext";

export const useAudioPlayer = () => {
  const ctx = useContext(AudioPlayerContext);
  if (!ctx)
    throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  return ctx;
};




