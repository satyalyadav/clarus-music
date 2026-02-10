const STORAGE_KEY = "clarus-music-queue-state";

export interface PersistedQueueState {
  songIds: number[];
  currentIndex: number;
  currentTime: number;
  wasPlaying: boolean;
}

export function saveQueueState(state: PersistedQueueState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Failed to persist queue state:", e);
  }
}

export function loadQueueState(): PersistedQueueState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as unknown;
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray((data as PersistedQueueState).songIds)
    ) {
      return null;
    }
    const s = data as PersistedQueueState;
    return {
      songIds: s.songIds.filter((id): id is number => typeof id === "number"),
      currentIndex: typeof s.currentIndex === "number" ? s.currentIndex : 0,
      currentTime: typeof s.currentTime === "number" ? s.currentTime : 0,
      wasPlaying: Boolean(s.wasPlaying),
    };
  } catch {
    return null;
  }
}
