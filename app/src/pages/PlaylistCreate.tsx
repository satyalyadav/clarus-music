import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { playlistService } from "../services/db";

const PlaylistCreate: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const playlistId = await playlistService.create({
        title,
      });
      navigate(`/playlists/${playlistId}`);
    } catch (err: any) {
      setError(err.message || "Failed to create playlist");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "500px" }}>
      <h1 className="section-title">create playlist</h1>

      {error && (
        <div className="error" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">//playlist name</label>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="enter playlist name"
            required
          />
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "creating..." : "create playlist"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate("/playlists")}
          >
            cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default PlaylistCreate;
