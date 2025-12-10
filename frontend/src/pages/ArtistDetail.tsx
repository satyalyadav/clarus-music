import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

interface Song {
  song_id: number;
  title: string;
  duration: any;
  file_path: string;
  album_title?: string;
}

interface Artist {
  artist_id: number;
  name: string;
  songs: Song[];
}

function formatDuration(d: any): string {
  if (typeof d === "string") return d;
  const h = d.hours || 0;
  const m = String(d.minutes || 0).padStart(2, "0");
  const s = String(d.seconds || 0).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const ArtistDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, setQueue } = useAudioPlayer();
  const baseUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    Promise.all([
      api.get<{ artist_id: number; name: string }>(`/artists/${id}`),
      api.get<Song[]>(`/artists/${id}/songs`),
    ])
      .then(([artistRes, songsRes]) => {
        setArtist({
          ...artistRes.data,
          songs: songsRes.data,
        });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePlayAll = () => {
    if (!artist || artist.songs.length === 0) return;
    const tracks = artist.songs.map((s) => ({
      url: `${baseUrl}${s.file_path}`,
      title: s.title,
      artist: artist.name,
      album: s.album_title || "",
    }));
    setQueue(tracks);
    playTrack(tracks[0]);
  };

  const handlePlaySong = (song: Song) => {
    if (!artist) return;
    const tracks = artist.songs.map((s) => ({
      url: `${baseUrl}${s.file_path}`,
      title: s.title,
      artist: artist.name,
      album: s.album_title || "",
    }));
    setQueue(tracks);
    playTrack({
      url: `${baseUrl}${song.file_path}`,
      title: song.title,
      artist: artist.name,
      album: song.album_title || "",
    });
  };

  if (loading) return <div className="loading">Loading artist...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!artist) return <div className="error">Artist not found</div>;

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate("/artists")}
        style={{ marginBottom: "16px" }}
      >
        ← back to artists
      </button>

      <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
        <div
          style={{
            width: "200px",
            height: "200px",
            background: "var(--card-bg)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "80px",
          }}
        >
          🎤
        </div>
        <div>
          <h1 className="section-title" style={{ marginBottom: "16px" }}>
            {artist.name}
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            {artist.songs.length} {artist.songs.length === 1 ? "song" : "songs"}
          </p>
          <button
            className="btn btn-primary"
            onClick={handlePlayAll}
            disabled={artist.songs.length === 0}
          >
            ▶ play all
          </button>
        </div>
      </div>

      {artist.songs.length === 0 ? (
        <div className="empty">No songs by this artist.</div>
      ) : (
        <div className="list">
          {artist.songs.map((song) => {
            const trackUrl = `${baseUrl}${song.file_path}`;
            const isCurrent = currentTrack?.url === trackUrl;
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div key={song.song_id} className="list-item">
                <button
                  className={`btn btn-icon ${
                    isCurrentPlaying ? "btn-primary" : ""
                  }`}
                  onClick={() => handlePlaySong(song)}
                >
                  {isCurrentPlaying ? "⏸" : "▶"}
                </button>
                <div className="list-item-content">
                  <div
                    className={`list-item-title ${isCurrent ? "playing" : ""}`}
                  >
                    {song.title}
                  </div>
                  <div className="list-item-subtitle">
                    {song.album_title || "Unknown Album"}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                  {formatDuration(song.duration)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ArtistDetail;
