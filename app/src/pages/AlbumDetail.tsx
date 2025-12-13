import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";
import { 
  albumService, 
  songService, 
  artistService,
  getSongUrl 
} from "../services/db";
import { SongWithRelations } from "../services/db";

interface Album {
  album_id?: number;
  title: string;
  cover_image?: string | null;
  songs: SongWithRelations[];
}

function formatDuration(d: any): string {
  if (typeof d === "string") return d;
  const h = d.hours || 0;
  const m = String(d.minutes || 0).padStart(2, "0");
  const s = String(d.seconds || 0).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const AlbumDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, setQueue, togglePlayPause } =
    useAudioPlayer();

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const albumId = parseInt(id);
        const [albumData, songsData] = await Promise.all([
          albumService.getById(albumId),
          songService.getByAlbum(albumId),
        ]);
        
        if (albumData) {
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
          
          setAlbum({
            ...albumData,
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
    loadData();
  }, [id]);

  const handlePlayAll = async () => {
    if (!album || album.songs.length === 0) return;
    const tracks = await Promise.all(
      album.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: s.artist_name || "",
          album: album.title,
          cover: s.cover_image || album.cover_image || "",
        };
      })
    );
    setQueue(tracks);
    if (tracks[0]) playTrack(tracks[0]);
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    if (!album) return;
    const tracks = await Promise.all(
      album.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: s.artist_name || "",
          album: album.title,
          cover: s.cover_image || album.cover_image || "",
        };
      })
    );
    setQueue(tracks);
    const songUrl = await getSongUrl(song);
    playTrack({
      url: songUrl,
      title: song.title,
      artist: song.artist_name || "",
      album: album.title,
      cover: song.cover_image || album.cover_image || "",
    });
  };

  if (loading) return <div className="loading">Loading album...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!album) return <div className="error">Album not found</div>;

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate("/albums")}
        style={{ marginBottom: "16px" }}
      >
        ← back to albums
      </button>

      <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
        {album.cover_image ? (
          <img
            src={album.cover_image}
            alt={album.title}
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
            💿
          </div>
        )}
        <div>
          <h1 className="section-title" style={{ marginBottom: "16px" }}>
            {album.title}
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            {album.songs.length} {album.songs.length === 1 ? "song" : "songs"}
          </p>
          <button
            className="btn btn-primary"
            onClick={handlePlayAll}
            disabled={album.songs.length === 0}
          >
            ▶ play album
          </button>
        </div>
      </div>

      {album.songs.length === 0 ? (
        <div className="empty">No songs in this album.</div>
      ) : (
        <div className="list">
          {album.songs.map((song, index) => {
            // Note: We can't easily compare object URLs, so we'll check by title/artist
            // In a real app, you might want to store the song ID in the track object
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
                    {song.artist_name || "Unknown Artist"}
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                  {formatDuration(song.duration)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlbumDetail;
