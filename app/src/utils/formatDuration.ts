/**
 * Formats duration to M:SS format (e.g., "5:12" instead of "00:05:12")
 * Handles both string formats (HH:MM:SS, MM:SS) and object formats
 */
export function formatDuration(d: any): string {
  let totalSeconds = 0;

  if (typeof d === "string") {
    // Handle string formats like "00:05:12", "5:12", "1:23:45"
    const parts = d.split(":");
    if (parts.length === 2) {
      // MM:SS format
      const minutes = parseInt(parts[0], 10) || 0;
      const secondsPart = parts[1].split(".")[0]; // Remove decimal part
      const seconds = parseInt(secondsPart, 10) || 0;
      totalSeconds = minutes * 60 + seconds;
    } else if (parts.length === 3) {
      // HH:MM:SS format - convert to total seconds
      const hours = parseInt(parts[0], 10) || 0;
      const minutes = parseInt(parts[1], 10) || 0;
      const secondsPart = parts[2].split(".")[0]; // Remove decimal part
      const seconds = parseInt(secondsPart, 10) || 0;
      totalSeconds = hours * 3600 + minutes * 60 + seconds;
    } else {
      // Fallback: try to parse as number of seconds
      const parsed = parseFloat(d);
      if (!isNaN(parsed)) {
        totalSeconds = Math.floor(parsed);
      } else {
        return d; // Return as-is if can't parse
      }
    }
  } else if (typeof d === "number") {
    // Already in seconds
    totalSeconds = Math.floor(d);
  } else if (d && typeof d === "object") {
    // Handle object format from database (PostgreSQL interval)
    const h = d.hours || 0;
    const m = d.minutes || 0;
    const s = Math.floor(d.seconds || 0);
    totalSeconds = h * 3600 + m * 60 + s;
  } else {
    return String(d || "0:00");
  }

  // Convert total seconds to M:SS format
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

