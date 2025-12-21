import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import {
  genreService,
  songService,
  artistService,
  albumService,
  songArtistService,
  getSongUrl,
  SongWithRelations,
} from "../services/db";
import { formatDuration } from "../utils/formatDuration";

interface Genre {
  genre_id?: number;
  name: string;
  songs: SongWithRelations[];
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
          const artistMap = new Map(artistsData.map((a) => [a.artist_id, a.name]));
          const albumMap = new Map(
            albumsData.map((a) => [
              a.album_id,
              { title: a.title, cover_image: a.cover_image },
            ])
          );

          const songsWithRelations: SongWithRelations[] = await Promise.all(
            songsData.map(async (song) => {
              const extraArtistIds = song.song_id
                ? await songArtistService.getArtistIdsForSong(song.song_id)
                : [];
              const ids = new Set<number>();
              if (song.artist_id != null) ids.add(song.artist_id);
              extraArtistIds.forEach((id) => ids.add(id));
              const artistNames = Array.from(ids)
                .map((id) => artistMap.get(id))
                .filter((n): n is string => !!n);
              const artistDisplay =
                artistNames.length > 0
                  ? artistNames.join(", ")
                  : song.artist_id
                  ? artistMap.get(song.artist_id)
                  : undefined;

              return {
                ...song,
                artist_names: artistNames,
                artist_name: artistDisplay,
                album_title: song.album_id
                  ? albumMap.get(song.album_id)?.title
                  : undefined,
                album_cover_image: song.album_id
                  ? albumMap.get(song.album_id)?.cover_image
                  : undefined,
              };
            })
          );
          
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
          cover: s.cover_image || s.album_cover_image || "",
          songId: s.song_id,
        };
      })
    );
    setQueue(tracks);
    if (tracks[0]) playTrack(tracks[0], 0);
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
          cover: s.cover_image || s.album_cover_image || "",
          songId: s.song_id,
        };
      })
    );
    setQueue(tracks);
    
    // Find the index of the song being played in the queue
    const songIndex = tracks.findIndex(t => t.songId === song.song_id);
    
    if (songIndex !== -1) {
      playTrack(tracks[songIndex], songIndex);
    } else {
      // Fallback: play directly if not found in queue
      const songUrl = await getSongUrl(song);
      playTrack({
        url: songUrl,
        title: song.title,
        artist: song.artist_name || "",
        album: song.album_title || "",
        cover: song.cover_image || song.album_cover_image || "",
        songId: song.song_id,
      });
    }
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
            // Use songId for reliable matching, fallback to title/artist matching
            const isCurrent = (song.song_id && currentTrack?.songId === song.song_id) ||
                             (currentTrack?.title === song.title && 
                              currentTrack?.artist === (song.artist_name || ""));
            const isCurrentPlaying = isCurrent && isPlaying;

            const coverImage = song.cover_image || song.album_cover_image;

            return (
              <div 
                key={song.song_id} 
                className="list-item"
                onClick={() => isCurrent ? togglePlayPause() : handlePlaySong(song)}
              >
                {coverImage && (
                  <img
                    src={coverImage}
                    alt={song.title}
                    style={{
                      width: "50px",
                      height: "50px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      marginRight: "12px",
                    }}
                  />
                )}
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
