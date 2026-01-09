import { Track } from "../contexts/AudioPlayerContext";
import { buildQueueFromIndex } from "./buildQueueFromIndex";

type SetQueue = (tracks: Track[] | ((prev: Track[]) => Track[])) => void;
type PlayTrack = (track: Track, index?: number) => void;

export const playQueueFromStart = (
  tracks: Track[],
  setQueue: SetQueue,
  playTrack: PlayTrack
) => {
  if (tracks.length === 0) return;
  setQueue(tracks);
  playTrack(tracks[0], 0);
};

export const playQueueFromIndex = (
  tracks: Track[],
  startIndex: number,
  setQueue: SetQueue,
  playTrack: PlayTrack
) => {
  if (tracks.length === 0) return;
  const reorderedTracks = buildQueueFromIndex(tracks, startIndex);
  setQueue(reorderedTracks);
  playTrack(reorderedTracks[0], 0);
};
