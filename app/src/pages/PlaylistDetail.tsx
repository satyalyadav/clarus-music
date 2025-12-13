import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";
import { 
  playlistService, 
  artistService,
  albumService,
  getSongUrl 
} from "../services/db";
import { SongWithRelations } from "../services/db";

interface Playlist {
  playlist_id?: number;
  title: string;
  cover_image?: string | null;
  date_created?: string;
  songs: SongWithRelations[];
}

function formatDuration(d: any): string {
  if (typeof d === "string") return d;
  const h = d.hours || 0;
  const m = String(d.minutes || 0).padStart(2, "0");
  const s = String(d.seconds || 0).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const PlaylistDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, setQueue, togglePlayPause } =
    useAudioPlayer();

  const fetchPlaylist = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const playlistId = parseInt(id);
      const [playlistData, songsData] = await Promise.all([
        playlistService.getById(playlistId),
        playlistService.getSongs(playlistId),
      ]);
      
      if (playlistData) {
        // Get songs with relations
        const [artistsData, albumsData] = await Promise.all([
          artistService.getAll(),
          albumService.getAll(),
        ]);
        const artistMap = new Map(artistsData.map(a => [a.artist_id, a.name]));
        const albumMap = new Map(albumsData.map(a => [a.album_id, a.title]));
        
        const songsWithRelations = songsData.map(song => ({
          ...song,
          artist_name: song.artist_id ? artistMap.get(song.artist_id) : undefined,
          album_title: song.album_id ? albumMap.get(song.album_id) : undefined,
        }));
        
        setPlaylist({
          ...playlistData,
          songs: songsWithRelations,
        });
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

  const handlePlayAll = async () => {
    if (!playlist || playlist.songs.length === 0) return;
    const tracks = await Promise.all(
      playlist.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: s.artist_name || "",
          album: s.album_title || "",
          cover: s.cover_image || "",
        };
      })
    );
    setQueue(tracks);
    if (tracks[0]) playTrack(tracks[0]);
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    if (!playlist) return;
    const tracks = await Promise.all(
      playlist.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: s.artist_name || "",
          album: s.album_title || "",
          cover: s.cover_image || "",
        };
      })
    );
    setQueue(tracks);
    const songUrl = await getSongUrl(song);
    playTrack({
      url: songUrl,
      title: song.title,
      artist: song.artist_name || "",
      album: song.album_title || "",
      cover: song.cover_image || "",
    });
  };

  const handleRemoveSong = async (songId: number) => {
    try {
      if (!id) return;
      const playlistId = parseInt(id);
      await playlistService.removeSong(playlistId, songId);
      fetchPlaylist();
    } catch (err: any) {
      alert(err.message || "Failed to remove song");
    }
  };

  if (loading) return <div className="loading">Loading playlist...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!playlist) return <div className="error">Playlist not found</div>;

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate("/playlists")}
        style={{ marginBottom: "16px" }}
      >
        ← back to playlists
      </button>

      <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
        {playlist.cover_image ? (
          <img
            src={playlist.cover_image}
            alt={playlist.title}
            style={{
              width: "200px",
              height: "200px",
              objectFit: "cover",
              borderRadius: "8px",
            }}
          />
        ) : (
          <div
            style={{
              width: "200px",
              height: "200px",
              background: "var(--card-bg)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "80px",
            }}
          >
            🎶
          </div>
        )}
        <div>
          <h1 className="section-title" style={{ marginBottom: "16px" }}>
            {playlist.title}
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "8px" }}>
            {playlist.songs.length}{" "}
            {playlist.songs.length === 1 ? "song" : "songs"}
          </p>
          <p
            style={{
              color: "var(--text-muted)",
              marginBottom: "16px",
              fontSize: "12px",
            }}
          >
            Created {new Date(playlist.date_created).toLocaleDateString()}
          </p>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              className="btn btn-primary"
              onClick={handlePlayAll}
              disabled={playlist.songs.length === 0}
            >
              ▶ play all
            </button>
            <button
              className="btn"
              onClick={() => navigate(`/playlists/${id}/edit`)}
            >
              edit
            </button>
          </div>
        </div>
      </div>

      {playlist.songs.length === 0 ? (
        <div className="empty">
          <p>This playlist is empty.</p>
          <p style={{ marginTop: "8px" }}>
            <button
              className="btn"
              onClick={() => navigate(`/playlists/${id}/edit`)}
            >
              add songs
            </button>
          </p>
        </div>
      ) : (
        <div className="list">
          {playlist.songs.map((song, index) => {
            const isCurrent = currentTrack?.title === song.title && 
                             currentTrack?.artist === (song.artist_name || "");
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div key={song.song_id} className="list-item">
                <span
                  style={{
                    width: "24px",
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {index + 1}
                </span>
                <button
                  className={`btn btn-icon ${
                    isCurrentPlaying ? "btn-primary" : ""
                  }`}
                  onClick={() =>
                    isCurrent ? togglePlayPause() : handlePlaySong(song)
                  }
                  title={isCurrentPlaying ? "Pause" : "Play"}
                >
                  <span className="btn-icon-content">
                    {isCurrentPlaying ? "⏸" : "▶"}
                  </span>
                </button>
                <div className="list-item-content">
                  <div
                    className={`list-item-title ${isCurrent ? "playing" : ""}`}
                  >
                    {song.title}
                  </div>
                  <div className="list-item-subtitle">
                    {song.artist_name || "Unknown Artist"} •{" "}
                    {song.album_title || "Unknown Album"}
                  </div>
                </div>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginRight: "12px",
                  }}
                >
                  {formatDuration(song.duration)}
                </span>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => handleRemoveSong(song.song_id)}
                  title="Remove from playlist"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlaylistDetail;
