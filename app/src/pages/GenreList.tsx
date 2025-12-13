import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { genreService } from "../services/db";

interface Genre {
  genre_id?: number;
  name: string;
}

const genreEmojis: Record<string, string> = {
  rock: "🎸",
  pop: "🎤",
  jazz: "🎷",
  classical: "🎻",
  electronic: "🎹",
  hiphop: "🎧",
  "hip-hop": "🎧",
  rnb: "🎵",
  "r&b": "🎵",
  country: "🤠",
  metal: "🤘",
  blues: "🎺",
  folk: "🪕",
  reggae: "🌴",
  soul: "❤️",
  punk: "⚡",
  indie: "🌟",
  alternative: "🔀",
  dance: "💃",
  disco: "🪩",
};

function getGenreEmoji(name: string): string {
  const normalized = name.toLowerCase().replace(/\s+/g, "");
  return genreEmojis[normalized] || "🎵";
}

const GenreList: React.FC = () => {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    genreService
      .getAll()
      .then((genres) => {
        setGenres(genres);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading genres...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">genres</h1>

      {genres.length === 0 ? (
        <div className="empty">No genres found.</div>
      ) : (
        <div className="grid">
          {genres.map((genre) => (
            <div
              key={genre.genre_id}
              className="grid-item"
              onClick={() => navigate(`/genres/${genre.genre_id}`)}
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
                {getGenreEmoji(genre.name)}
              </div>
              <div className="grid-item-content">
                <div className="grid-item-title">{genre.name}</div>
                <div className="grid-item-subtitle">genre</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GenreList;
