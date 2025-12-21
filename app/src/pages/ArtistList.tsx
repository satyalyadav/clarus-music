import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { artistService, Artist } from "../services/db";
import { artistImageService } from "../services/artistImageService";

const ArtistList: React.FC = () => {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    artistService
      .getAll()
      .then(async (artists) => {
        setArtists(artists);
        setError(null);
        
        // Fetch images in background for artists without images
        // This runs asynchronously and updates state as images are fetched
        artistImageService.fetchImagesForArtists(artists).then(() => {
          // Refresh artists list to show newly fetched images
          artistService.getAll().then((updatedArtists) => {
            setArtists(updatedArtists);
          });
        });
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
                  overflow: "hidden",
                  background: artist.image_url ? "transparent" : "var(--card-bg)",
                }}
              >
                {artist.image_url ? (
                  <img
                    src={artist.image_url}
                    alt={artist.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    onError={(e) => {
                      // Fallback to emoji if image fails to load
                      e.currentTarget.style.display = "none";
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.innerHTML = "🎤";
                        parent.style.display = "flex";
                        parent.style.alignItems = "center";
                        parent.style.justifyContent = "center";
                      }
                    }}
                  />
                ) : (
                  <span>🎤</span>
                )}
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
