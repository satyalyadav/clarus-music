import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";

interface Song {
  song_id: number;
  title: string;
  artist_name?: string;
}

interface Playlist {
  playlist_id: number;
  title: string;
  songs: Song[];
}

const PlaylistEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Playlist>(`/playlists/${id}`),
      api.get<Song[]>("/songs"),
    ]).then(([playlistRes, songsRes]) => {
      setTitle(playlistRes.data.title);
      setPlaylistSongs(playlistRes.data.songs || []);
      setAllSongs(songsRes.data);
    });
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.put(`/playlists/${id}`, { title });
      navigate(`/playlists/${id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update playlist");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSong = async (songId: number) => {
    setAdding(true);
    try {
      await api.post(`/playlists/${id}/songs`, { song_id: songId });
      // Refresh playlist songs
      const res = await api.get<Playlist>(`/playlists/${id}`);
      setPlaylistSongs(res.data.songs || []);
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to add song");
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveSong = async (songId: number) => {
    try {
      await api.delete(`/playlists/${id}/songs/${songId}`);
      setPlaylistSongs((prev) => prev.filter((s) => s.song_id !== songId));
    } catch (err: any) {
      alert(err.response?.data?.error || "Failed to remove song");
    }
  };

  const playlistSongIds = new Set(playlistSongs.map((s) => s.song_id));
  const availableSongs = allSongs.filter(
    (s) => !playlistSongIds.has(s.song_id)
  );

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate(`/playlists/${id}`)}
        style={{ marginBottom: "16px" }}
      >
        ← back to playlist
      </button>

      <h1 className="section-title">edit playlist</h1>

      {error && (
        <div className="error" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ marginBottom: "32px" }}>
        <div className="form-group">
          <label className="form-label">//playlist name</label>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="enter playlist name"
            required
            style={{ maxWidth: "400px" }}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? "saving..." : "save changes"}
        </button>
      </form>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}
      >
        <div>
          <h3 style={{ marginBottom: "16px", color: "var(--text-primary)" }}>
            //current songs ({playlistSongs.length})
          </h3>
          {playlistSongs.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>No songs in playlist</p>
          ) : (
            <div className="list">
              {playlistSongs.map((song) => (
                <div key={song.song_id} className="list-item">
                  <div className="list-item-content">
                    <div className="list-item-title">{song.title}</div>
                    <div className="list-item-subtitle">
                      {song.artist_name || "Unknown Artist"}
                    </div>
                  </div>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => handleRemoveSong(song.song_id)}
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 style={{ marginBottom: "16px", color: "var(--text-primary)" }}>
            //available songs ({availableSongs.length})
          </h3>
          {availableSongs.length === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>All songs added</p>
          ) : (
            <div className="list">
              {availableSongs.map((song) => (
                <div key={song.song_id} className="list-item">
                  <div className="list-item-content">
                    <div className="list-item-title">{song.title}</div>
                    <div className="list-item-subtitle">
                      {song.artist_name || "Unknown Artist"}
                    </div>
                  </div>
                  <button
                    className="btn btn-small btn-primary"
                    onClick={() => handleAddSong(song.song_id)}
                    disabled={adding}
                  >
                    add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaylistEdit;
