import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

interface Song {
  song_id: number;
  title: string;
  duration: any;
  file_path: string;
  artist_name?: string;
  album_title?: string;
}

function formatDuration(d: any): string {
  if (typeof d === "string") return d;
  const h = d.hours || 0;
  const m = String(d.minutes || 0).padStart(2, "0");
  const s = String(d.seconds || 0).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
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
    }));
    setQueue(tracks);
    playTrack({
      url: `${baseUrl}${song.file_path}`,
      title: song.title,
      artist: song.artist_name || "",
      album: song.album_title || "",
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
