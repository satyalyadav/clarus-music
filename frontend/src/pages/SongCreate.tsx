import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

interface Album {
  album_id: number;
  title: string;
}

interface Artist {
  artist_id: number;
  name: string;
}

interface Genre {
  genre_id: number;
  name: string;
}

const SongCreate: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [artistId, setArtistId] = useState("");
  const [genreId, setGenreId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Album[]>("/albums"),
      api.get<Artist[]>("/artists"),
      api.get<Genre[]>("/genres"),
    ]).then(([albumsRes, artistsRes, genresRes]) => {
      setAlbums(albumsRes.data);
      setArtists(artistsRes.data);
      setGenres(genresRes.data);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select an audio file");
      return;
    }

    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("title", title);
    if (albumId) formData.append("album_id", albumId);
    if (artistId) formData.append("artist_id", artistId);
    if (genreId) formData.append("genre_id", genreId);
    formData.append("audio", file);

    try {
      await api.post("/songs", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate("/songs");
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create song");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "500px" }}>
      <h1 className="section-title">add song</h1>

      {error && (
        <div className="error" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">//title</label>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="song title"
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">//audio file</label>
          <input
            type="file"
            className="form-input"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">//album</label>
            <select
              className="form-input"
              value={albumId}
              onChange={(e) => setAlbumId(e.target.value)}
            >
              <option value="">select album</option>
              {albums.map((a) => (
                <option key={a.album_id} value={a.album_id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">//artist</label>
            <select
              className="form-input"
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
            >
              <option value="">select artist</option>
              {artists.map((a) => (
                <option key={a.artist_id} value={a.artist_id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">//genre</label>
          <select
            className="form-input"
            value={genreId}
            onChange={(e) => setGenreId(e.target.value)}
          >
            <option value="">select genre</option>
            {genres.map((g) => (
              <option key={g.genre_id} value={g.genre_id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "uploading..." : "create song"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate("/songs")}
          >
            cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default SongCreate;
