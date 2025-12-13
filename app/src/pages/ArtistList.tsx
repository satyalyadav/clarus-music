import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { artistService } from "../services/db";

interface Artist {
  artist_id?: number;
  name: string;
}

const ArtistList: React.FC = () => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    artistService
      .getAll()
      .then((artists) => {
        setArtists(artists);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading artists...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">artists</h1>

      {artists.length === 0 ? (
        <div className="empty">No artists found.</div>
      ) : (
        <div className="grid">
          {artists.map((artist) => (
            <div
              key={artist.artist_id}
              className="grid-item"
              onClick={() => navigate(`/artists/${artist.artist_id}`)}
            >
              <div
                className="grid-item-image"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "48px",
                }}
              >
                🎤
              </div>
              <div className="grid-item-content">
                <div className="grid-item-title">{artist.name}</div>
                <div className="grid-item-subtitle">artist</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArtistList;
