import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { albumService } from "../services/db";

interface Album {
  album_id?: number;
  title: string;
  cover_image?: string | null;
}

const AlbumList: React.FC = () => {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    albumService
      .getAll()
      .then((albums) => {
        setAlbums(albums);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading albums...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">albums</h1>

      {albums.length === 0 ? (
        <div className="empty">
          <p>No albums found.</p>
        </div>
      ) : (
        <div className="grid">
          {albums.map((album) => (
            <div
              key={album.album_id}
              className="grid-item"
              onClick={() => navigate(`/albums/${album.album_id}`)}
            >
              {album.cover_image ? (
                <img
                  src={album.cover_image}
                  alt={album.title}
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
                  💿
                </div>
              )}
              <div className="grid-item-content">
                <div className="grid-item-title">{album.title}</div>
                <div className="grid-item-subtitle">album</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlbumList;
