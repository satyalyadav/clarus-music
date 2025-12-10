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
  album_title?: string;
}

interface Genre {
  genre_id: number;
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

const GenreDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [genre, setGenre] = useState<Genre | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, setQueue } = useAudioPlayer();
  const baseUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    Promise.all([
      api.get<{ genre_id: number; name: string }>(`/genres/${id}`),
      api.get<Song[]>(`/genres/${id}/songs`),
    ])
      .then(([genreRes, songsRes]) => {
        setGenre({
          ...genreRes.data,
          songs: songsRes.data,
        });
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handlePlayAll = () => {
    if (!genre || genre.songs.length === 0) return;
    const tracks = genre.songs.map((s) => ({
      url: `${baseUrl}${s.file_path}`,
      title: s.title,
      artist: s.artist_name || "",
      album: s.album_title || "",
    }));
    setQueue(tracks);
    playTrack(tracks[0]);
  };

  const handlePlaySong = (song: Song) => {
    if (!genre) return;
    const tracks = genre.songs.map((s) => ({
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

  if (loading) return <div className="loading">Loading genre...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!genre) return <div className="error">Genre not found</div>;

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate("/genres")}
        style={{ marginBottom: "16px" }}
      >
        ← back to genres
      </button>

      <h1 className="section-title" style={{ marginBottom: "16px" }}>
        {genre.name}
      </h1>

      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <button
          className="btn btn-primary"
          onClick={handlePlayAll}
          disabled={genre.songs.length === 0}
        >
          ▶ play all
        </button>
        <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>
          {genre.songs.length} {genre.songs.length === 1 ? "song" : "songs"}
        </span>
      </div>

      {genre.songs.length === 0 ? (
        <div className="empty">No songs in this genre.</div>
      ) : (
        <div className="list">
          {genre.songs.map((song) => {
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
                    {song.artist_name || "Unknown Artist"} •{" "}
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

export default GenreDetail;
