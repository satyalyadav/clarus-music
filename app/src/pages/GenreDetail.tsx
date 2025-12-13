import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";
import { genreService, songService, getSongUrl } from "../services/db";
import { SongWithRelations } from "../services/db";

interface Genre {
  genre_id?: number;
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

const GenreDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [genre, setGenre] = useState<Genre | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { playTrack, currentTrack, isPlaying, setQueue, togglePlayPause } = useAudioPlayer();

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const genreId = parseInt(id);
        const [genreData, songsData] = await Promise.all([
          genreService.getById(genreId),
          songService.getByGenre(genreId),
        ]);
        
        if (genreData) {
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
          
          setGenre({
            ...genreData,
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
    if (!genre || genre.songs.length === 0) return;
    const tracks = await Promise.all(
      genre.songs.map(async (s) => {
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
    if (!genre) return;
    const tracks = await Promise.all(
      genre.songs.map(async (s) => {
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

  if (loading) return <div className="loading">Loading genre...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!genre) return <div className="error">Genre not found</div>;

  return (
    <div>
      <button
        className="btn btn-small"
        onClick={() => navigate("/genres")}
        style={{ marginBottom: "16px" }}
      >
        ← back to genres
      </button>

      <h1 className="section-title" style={{ marginBottom: "16px" }}>
        {genre.name}
      </h1>

      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <button
          className="btn btn-primary"
          onClick={handlePlayAll}
          disabled={genre.songs.length === 0}
        >
          ▶ play all
        </button>
        <span style={{ color: "var(--text-muted)", alignSelf: "center" }}>
          {genre.songs.length} {genre.songs.length === 1 ? "song" : "songs"}
        </span>
      </div>

      {genre.songs.length === 0 ? (
        <div className="empty">No songs in this genre.</div>
      ) : (
        <div className="list">
          {genre.songs.map((song) => {
            const isCurrent = currentTrack?.title === song.title && 
                             currentTrack?.artist === (song.artist_name || "");
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
                    {song.artist_name || "Unknown Artist"} •{" "}
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

export default GenreDetail;
