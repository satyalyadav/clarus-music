import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { playlistService, getSongsWithRelations, SongWithRelations } from "../services/db";
import { PlaylistCover } from "../utils/playlistCover";

interface Playlist {
  playlist_id?: number;
  title: string;
  cover_image?: string | null;
  date_created?: string;
}

interface PlaylistWithSongs extends Playlist {
  songs: SongWithRelations[];
}

const PlaylistList: React.FC = () => {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<PlaylistWithSongs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      const playlistsData = await playlistService.getAll();
      const allSongs = await getSongsWithRelations();
      
      // Fetch songs for each playlist and create enriched playlists
      const playlistsWithSongs = await Promise.all(
        playlistsData.map(async (playlist) => {
          if (!playlist.playlist_id) return { ...playlist, songs: [] as SongWithRelations[] };
          const playlistSongs = await playlistService.getSongs(playlist.playlist_id);
          // Enrich with relations - ensure we get SongWithRelations with cover images
          const enrichedSongs: SongWithRelations[] = playlistSongs.map((song) => {
            const enriched = allSongs.find((s) => s.song_id === song.song_id);
            if (enriched) {
              return enriched;
            }
            // If not found, create a SongWithRelations from the basic song
            // This ensures cover_image and album_cover_image are available
            return {
              ...song,
              artist_name: undefined,
              artist_names: undefined,
              album_title: undefined,
              album_cover_image: null,
            } as SongWithRelations;
          });
          return { ...playlist, songs: enrichedSongs };
        })
      );
      
      setPlaylists(playlistsWithSongs);
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
              <div 
                className="grid-item-image" 
                style={{ 
                  padding: 0, 
                  overflow: "hidden", 
                  borderRadius: "8px 8px 0 0",
                  display: "block",
                  width: "100%",
                  aspectRatio: "1",
                }}
              >
                <PlaylistCover songs={playlist.songs} fillContainer={true} />
              </div>
              <div className="grid-item-content">
                <div className="grid-item-title">{playlist.title}</div>
                <div className="grid-item-subtitle">
                  {playlist.date_created ? new Date(playlist.date_created).toLocaleDateString() : ''}
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
                    onClick={(e) => playlist.playlist_id && handleDelete(playlist.playlist_id, e)}
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
