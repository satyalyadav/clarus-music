import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

interface Song {
  song_id: number;
  title: string;
  duration: any;
  file_path: string;
  cover_image?: string;
  artist_name?: string;
  album_title?: string;
}

function formatDuration(d: any): string {
  if (typeof d === "string") {
    // Handle PostgreSQL interval string format (e.g., "3:45" or "1:23:45" or "3:45.123" or "5:12:00")
    const parts = d.split(":");
    if (parts.length === 2) {
      // MM:SS format - remove milliseconds if present
      const secondsPart = parts[1].split(".")[0]; // Remove decimal part
      return `${parts[0]}:${secondsPart.padStart(2, "0")}`;
    } else if (parts.length === 3) {
      // Could be HH:MM:SS format
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const secondsPart = parts[2].split(".")[0]; // Remove decimal part
      const seconds = parseInt(secondsPart, 10);
      
      // If hours is 0, show as MM:SS
      if (hours === 0) {
        return `${minutes}:${secondsPart.padStart(2, "0")}`;
      }
      
      // Heuristic: If hours < 60 and total duration < 2 hours (7200 seconds),
      // it's likely stored incorrectly as HH:MM:SS when it should be MM:SS
      // Treat hours as minutes in this case
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      if (hours < 60 && totalSeconds < 7200 && seconds === 0) {
        // Likely meant to be MM:SS format
        return `${hours}:${String(minutes).padStart(2, "0")}`;
      }
      
      // For songs with hours, show HH:MM:SS
      return `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart.padStart(2, "0")}`;
    }
    return d;
  }
  // Handle object format from database (PostgreSQL interval)
  const h = d.hours || 0;
  const m = d.minutes || 0;
  const s = Math.floor(d.seconds || 0); // Floor to remove milliseconds
  
  // Heuristic: If hours < 60 and total duration < 2 hours,
  // it's likely stored incorrectly - treat hours as minutes
  const totalSeconds = (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
  if (h > 0 && h < 60 && totalSeconds < 7200 && s === 0) {
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  
  // Format: MM:SS if no hours, HH:MM:SS if hours > 0
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SongList: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, setQueue, togglePlayPause } =
    useAudioPlayer();
  const baseUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    api
      .get<Song[]>("/songs")
      .then((r) => {
        setSongs(r.data);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handlePlayAll = () => {
    if (songs.length === 0) return;
    const tracks = songs.map((s) => ({
      url: `${baseUrl}${s.file_path}`,
      title: s.title,
      artist: s.artist_name || "",
      album: s.album_title || "",
      cover: s.cover_image || "",
    }));
    setQueue(tracks);
    playTrack(tracks[0]);
  };

  const handlePlaySong = (song: Song) => {
    const tracks = songs.map((s) => ({
      url: `${baseUrl}${s.file_path}`,
      title: s.title,
      artist: s.artist_name || "",
      album: s.album_title || "",
      cover: s.cover_image || "",
    }));
    setQueue(tracks);
    playTrack({
      url: `${baseUrl}${song.file_path}`,
      title: song.title,
      artist: song.artist_name || "",
      album: song.album_title || "",
      cover: song.cover_image || "",
    });
  };

  if (loading) return <div className="loading">Loading songs...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">songs</h1>

      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <button
          className="btn btn-primary"
          onClick={handlePlayAll}
          disabled={songs.length === 0}
        >
          ▶ play all
        </button>
        <button className="btn" onClick={() => navigate("/songs/new")}>
          + add song
        </button>
      </div>

      {songs.length === 0 ? (
        <div className="empty">
          <p>No songs found.</p>
          <p style={{ marginTop: "8px" }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/songs/new")}
            >
              add your first song
            </button>
          </p>
        </div>
      ) : (
        <div className="list">
          {songs.map((song) => {
            const trackUrl = `${baseUrl}${song.file_path}`;
            const isCurrent = currentTrack?.url === trackUrl;
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div key={song.song_id} className="list-item">
                {song.cover_image && (
                  <img
                    src={song.cover_image}
                    alt={song.title}
                    style={{
                      width: "50px",
                      height: "50px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      marginRight: "12px",
                    }}
                  />
                )}
                <button
                  className={`btn btn-icon ${
                    isCurrentPlaying ? "btn-primary" : ""
                  }`}
                  onClick={() =>
                    isCurrent ? togglePlayPause() : handlePlaySong(song)
                  }
                  title={isCurrentPlaying ? "Pause" : "Play"}
                >
                  <span className="btn-icon-content">
                    {isCurrentPlaying ? "⏸" : "▶"}
                  </span>
                </button>
                <div className="list-item-content">
                  <div
                    className={`list-item-title ${isCurrent ? "playing" : ""}`}
                  >
                    {song.title}
                  </div>
                  <div className="list-item-subtitle">
                    {song.artist_name || "Unknown Artist"} •{" "}
                    {formatDuration(song.duration)}
                  </div>
                </div>
                <div className="list-item-actions">
                  <button
                    className="btn btn-small"
                    onClick={() => navigate(`/songs/${song.song_id}/edit`)}
                  >
                    edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SongList;
