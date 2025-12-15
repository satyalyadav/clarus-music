import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { albumService, songService } from "../services/db";

interface Album {
  album_id?: number;
  title: string;
  cover_image?: string | null;
}

interface AlbumWithCover extends Album {
  displayCover?: string | null;
}

const AlbumList: React.FC = () => {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<AlbumWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAlbums = async () => {
      try {
        const [albumsData, songsData] = await Promise.all([
          albumService.getAll(),
          songService.getAll(),
        ]);

        // Create a map of album_id to first song with cover_image
        const albumCoverMap = new Map<number, string>();
        for (const song of songsData) {
          if (song.album_id && song.cover_image && !albumCoverMap.has(song.album_id)) {
            albumCoverMap.set(song.album_id, song.cover_image);
          }
        }

        // Enrich albums with cover images from songs if album doesn't have one
        const albumsWithCovers: AlbumWithCover[] = albumsData.map(album => ({
          ...album,
          displayCover: album.cover_image || (album.album_id ? albumCoverMap.get(album.album_id) : null),
        }));

        setAlbums(albumsWithCovers);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadAlbums();
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
              {album.displayCover ? (
                <img
                  src={album.displayCover}
                  alt={album.title}
                  className="grid-item-image"
                />
              ) : (
                <div
                  className="grid-item-image"
                  style={{
                    backgroundColor: "var(--card-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
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
