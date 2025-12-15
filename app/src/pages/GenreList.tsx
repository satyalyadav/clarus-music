import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { genreService, songService, albumService } from "../services/db";

interface Genre {
  genre_id?: number;
  name: string;
}

interface GenreWithCovers extends Genre {
  covers: string[];
}

// Helper function to get cover images from songs
function getGenreCovers(songs: any[], albumMap: Map<number, { cover_image?: string | null }>): string[] {
  const covers: string[] = [];
  
  for (const song of songs) {
    // Prefer song cover_image, fallback to album cover_image
    const cover = song.cover_image || 
                  (song.album_id ? albumMap.get(song.album_id)?.cover_image : null);
    if (cover) {
      covers.push(cover);
    }
  }
  
  // Remove duplicates
  const uniqueCovers = [...new Set(covers)];
  
  if (uniqueCovers.length === 0) return [];
  if (uniqueCovers.length <= 4) return uniqueCovers;
  
  // For 4+ covers, randomly select 4
  const shuffled = [...uniqueCovers].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4);
}

const GenreList: React.FC = () => {
  const [genres, setGenres] = useState<GenreWithCovers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadGenres = async () => {
      try {
        const [genresData, albumsData] = await Promise.all([
          genreService.getAll(),
          albumService.getAll(),
        ]);

        // Create album map for cover image lookup
        const albumMap = new Map(
          albumsData.map(a => [a.album_id, { cover_image: a.cover_image }])
        );

        // Fetch songs for each genre and get covers
        const genresWithCovers = await Promise.all(
          genresData.map(async (genre) => {
            if (!genre.genre_id) {
              return { ...genre, covers: [] };
            }
            const songs = await songService.getByGenre(genre.genre_id);
            const covers = getGenreCovers(songs, albumMap);
            return { ...genre, covers };
          })
        );

        setGenres(genresWithCovers);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadGenres();
  }, []);

  if (loading) return <div className="loading">Loading genres...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const renderGenreCover = (genre: GenreWithCovers) => {
    const { covers } = genre;
    
    if (covers.length === 0) {
      // Fallback: show empty placeholder
      return (
        <div
          className="grid-item-image"
          style={{
            backgroundColor: "var(--card-bg)",
          }}
        />
      );
    }

    if (covers.length === 1) {
      // Single cover - full image
      return (
        <img
          src={covers[0]}
          alt={genre.name}
          className="grid-item-image"
          style={{ objectFit: "cover" }}
        />
      );
    }

    if (covers.length === 2) {
      // Two covers - split vertically
      return (
        <div className="grid-item-image genre-cover-split-2">
          <img src={covers[0]} alt="" style={{ objectFit: "cover" }} />
          <img src={covers[1]} alt="" style={{ objectFit: "cover" }} />
        </div>
      );
    }

    if (covers.length === 3) {
      // Three covers - one full on left, two stacked on right
      return (
        <div className="grid-item-image genre-cover-split-3">
          <img src={covers[0]} alt="" style={{ objectFit: "cover" }} />
          <div className="genre-cover-right">
            <img src={covers[1]} alt="" style={{ objectFit: "cover" }} />
            <img src={covers[2]} alt="" style={{ objectFit: "cover" }} />
          </div>
        </div>
      );
    }

    // Four covers - 2x2 grid
    return (
      <div className="grid-item-image genre-cover-grid-4">
        <img src={covers[0]} alt="" style={{ objectFit: "cover" }} />
        <img src={covers[1]} alt="" style={{ objectFit: "cover" }} />
        <img src={covers[2]} alt="" style={{ objectFit: "cover" }} />
        <img src={covers[3]} alt="" style={{ objectFit: "cover" }} />
      </div>
    );
  };

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
              {renderGenreCover(genre)}
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
