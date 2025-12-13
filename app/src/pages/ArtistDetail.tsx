import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";
import { artistService, songService, albumService, getSongUrl } from "../services/db";
import { SongWithRelations } from "../services/db";

interface Artist {
  artist_id?: number;
  name: string;
  songs: SongWithRelations[];
}

function formatDuration(d: any): string {
  if (typeof d === "string") return d;
  const h = d.hours || 0;
  const m = String(d.minutes || 0).padStart(2, "0");
  const s = String(d.seconds || 0).padStart(2, "0");
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

const ArtistDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, setQueue, togglePlayPause } = useAudioPlayer();

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const artistId = parseInt(id);
        const [artistData, songsData] = await Promise.all([
          artistService.getById(artistId),
          songService.getByArtist(artistId),
        ]);
        
        if (artistData) {
          // Get songs with relations
          const albums = await albumService.getAll();
          const albumMap = new Map(albums.map(a => [a.album_id, { title: a.title, cover_image: a.cover_image }]));
          
          const songsWithRelations = songsData.map(song => ({
            ...song,
            album_title: song.album_id ? albumMap.get(song.album_id)?.title : undefined,
            album_cover_image: song.album_id ? albumMap.get(song.album_id)?.cover_image : undefined,
          }));
          
          setArtist({
            ...artistData,
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
    if (!artist || artist.songs.length === 0) return;
    const tracks = await Promise.all(
      artist.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: artist.name,
          album: s.album_title || "",
          cover: s.cover_image || s.album_cover_image || "",
        };
      })
    );
    setQueue(tracks);
    if (tracks[0]) playTrack(tracks[0]);
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    if (!artist) return;
    const tracks = await Promise.all(
      artist.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: artist.name,
          album: s.album_title || "",
          cover: s.cover_image || s.album_cover_image || "",
        };
      })
    );
    setQueue(tracks);
    const songUrl = await getSongUrl(song);
    playTrack({
      url: songUrl,
      title: song.title,
      artist: artist.name,
      album: song.album_title || "",
      cover: song.cover_image || song.album_cover_image || "",
    });
  };

  if (loading) return <div className="loading">Loading artist...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!artist) return <div className="error">Artist not found</div>;

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate("/artists")}
        style={{ marginBottom: "16px" }}
      >
        ← back to artists
      </button>

      <div style={{ display: "flex", gap: "24px", marginBottom: "32px" }}>
        <div
          style={{
            width: "200px",
            height: "200px",
            background: "var(--card-bg)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "80px",
          }}
        >
          🎤
        </div>
        <div>
          <h1 className="section-title" style={{ marginBottom: "16px" }}>
            {artist.name}
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            {artist.songs.length} {artist.songs.length === 1 ? "song" : "songs"}
          </p>
          <button
            className="btn btn-primary"
            onClick={handlePlayAll}
            disabled={artist.songs.length === 0}
          >
            ▶ play all
          </button>
        </div>
      </div>

      {artist.songs.length === 0 ? (
        <div className="empty">No songs by this artist.</div>
      ) : (
        <div className="list">
          {artist.songs.map((song) => {
            const isCurrent = currentTrack?.title === song.title && 
                             currentTrack?.artist === artist.name;
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div key={song.song_id} className="list-item">
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
                    {song.album_title || "Unknown Album"}
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

export default ArtistDetail;
