import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

interface Song {
  song_id: number;
  title: string;
  duration: any;
  file_path: string;
  artist_name?: string;
  cover_image?: string;
}

interface Album {
  album_id: number;
  title: string;
  cover_image: string | null;
  songs: Song[];
}

function formatDuration(d: any): string {
  if (typeof d === "string") return d;
  const h = d.hours || 0;
  const m = String(d.minutes || 0).padStart(2, "0");
  const s = String(d.seconds || 0).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const AlbumDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, setQueue, togglePlayPause } =
    useAudioPlayer();
  const baseUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    Promise.all([
      api.get<{ album_id: number; title: string; cover_image: string | null }>(
        `/albums/${id}`
      ),
      api.get<Song[]>(`/albums/${id}/songs`),
    ])
      .then(([albumRes, songsRes]) => {
        setAlbum({
          ...albumRes.data,
          songs: songsRes.data,
        });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePlayAll = () => {
    if (!album || album.songs.length === 0) return;
    const tracks = album.songs.map((s) => ({
      url: `${baseUrl}${s.file_path}`,
      title: s.title,
      artist: s.artist_name || "",
      album: album.title,
      cover: s.cover_image || album.cover_image || "",
    }));
    setQueue(tracks);
    playTrack(tracks[0]);
  };

  const handlePlaySong = (song: Song) => {
    if (!album) return;
    const tracks = album.songs.map((s) => ({
      url: `${baseUrl}${s.file_path}`,
      title: s.title,
      artist: s.artist_name || "",
      album: album.title,
      cover: s.cover_image || album.cover_image || "",
    }));
    setQueue(tracks);
    playTrack({
      url: `${baseUrl}${song.file_path}`,
      title: song.title,
      artist: song.artist_name || "",
      album: album.title,
      cover: song.cover_image || album.cover_image || "",
    });
  };

  if (loading) return <div className="loading">Loading album...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!album) return <div className="error">Album not found</div>;

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate("/albums")}
        style={{ marginBottom: "16px" }}
      >
        ← back to albums
      </button>

      <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
        {album.cover_image ? (
          <img
            src={album.cover_image}
            alt={album.title}
            style={{
              width: "200px",
              height: "200px",
              objectFit: "cover",
              borderRadius: "8px",
            }}
          />
        ) : (
          <div
            style={{
              width: "200px",
              height: "200px",
              background: "var(--card-bg)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "80px",
            }}
          >
            💿
          </div>
        )}
        <div>
          <h1 className="section-title" style={{ marginBottom: "16px" }}>
            {album.title}
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            {album.songs.length} {album.songs.length === 1 ? "song" : "songs"}
          </p>
          <button
            className="btn btn-primary"
            onClick={handlePlayAll}
            disabled={album.songs.length === 0}
          >
            ▶ play album
          </button>
        </div>
      </div>

      {album.songs.length === 0 ? (
        <div className="empty">No songs in this album.</div>
      ) : (
        <div className="list">
          {album.songs.map((song, index) => {
            const trackUrl = `${baseUrl}${song.file_path}`;
            const isCurrent = currentTrack?.url === trackUrl;
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div key={song.song_id} className="list-item">
                <span
                  style={{
                    width: "24px",
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {index + 1}
                </span>
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
                    {song.artist_name || "Unknown Artist"}
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

export default AlbumDetail;
