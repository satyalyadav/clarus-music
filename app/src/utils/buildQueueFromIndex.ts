export const buildQueueFromIndex = <T,>(
  items: T[],
  startIndex: number
): T[] => {
  if (items.length === 0) return [];
  const safeIndex = Math.max(0, Math.min(startIndex, items.length - 1));
  if (safeIndex === 0) {
    return [...items];
  }
  return [...items.slice(safeIndex), ...items.slice(0, safeIndex)];
};
