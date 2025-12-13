import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { playlistService } from "../services/db";

interface Playlist {
  playlist_id?: number;
  title: string;
  cover_image?: string | null;
  date_created?: string;
}

const PlaylistList: React.FC = () => {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      const playlists = await playlistService.getAll();
      setPlaylists(playlists);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this playlist?")) return;
    try {
      await playlistService.delete(id);
      fetchPlaylists();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="loading">Loading playlists...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">playlists</h1>

      <div style={{ marginBottom: "24px" }}>
        <button
          className="btn btn-primary"
          onClick={() => navigate("/playlists/new")}
        >
          + create playlist
        </button>
      </div>

      {playlists.length === 0 ? (
        <div className="empty">
          <p>No playlists yet.</p>
          <p style={{ marginTop: "8px" }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/playlists/new")}
            >
              create your first playlist
            </button>
          </p>
        </div>
      ) : (
        <div className="grid">
          {playlists.map((playlist) => (
            <div
              key={playlist.playlist_id}
              className="grid-item"
              onClick={() => navigate(`/playlists/${playlist.playlist_id}`)}
            >
              {playlist.cover_image ? (
                <img
                  src={playlist.cover_image}
                  alt={playlist.title}
                  className="grid-item-image"
                />
              ) : (
                <div
                  className="grid-item-image"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "48px",
                  }}
                >
                  🎶
                </div>
              )}
              <div className="grid-item-content">
                <div className="grid-item-title">{playlist.title}</div>
                <div className="grid-item-subtitle">
                  {new Date(playlist.date_created).toLocaleDateString()}
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <button
                    className="btn btn-small"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/playlists/${playlist.playlist_id}/edit`);
                    }}
                  >
                    edit
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={(e) => handleDelete(playlist.playlist_id, e)}
                  >
                    delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlaylistList;
