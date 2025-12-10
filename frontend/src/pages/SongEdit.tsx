import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

interface Song {
  song_id: number;
  title: string;
  album_id: number | null;
  artist_id: number | null;
  genre_id: number | null;
}

const SongEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [artistId, setArtistId] = useState("");
  const [genreId, setGenreId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<Song>(`/songs/${id}`),
      api.get<Album[]>("/albums"),
      api.get<Artist[]>("/artists"),
      api.get<Genre[]>("/genres"),
    ]).then(([songRes, albumsRes, artistsRes, genresRes]) => {
      const song = songRes.data;
      setTitle(song.title);
      setAlbumId(song.album_id?.toString() || "");
      setArtistId(song.artist_id?.toString() || "");
      setGenreId(song.genre_id?.toString() || "");
      setAlbums(albumsRes.data);
      setArtists(artistsRes.data);
      setGenres(genresRes.data);
    });
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.put(`/songs/${id}`, {
        title,
        album_id: albumId || null,
        artist_id: artistId || null,
        genre_id: genreId || null,
      });
      navigate("/songs");
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to update song");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this song?")) return;
    setDeleting(true);
    try {
      await api.delete(`/songs/${id}`);
      navigate("/songs");
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to delete song");
      setDeleting(false);
    }
  };

  return (
    <div style={{ maxWidth: "500px" }}>
      <h1 className="section-title">edit song</h1>

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
            {loading ? "saving..." : "save changes"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate("/songs")}
          >
            cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "deleting..." : "delete"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SongEdit;
