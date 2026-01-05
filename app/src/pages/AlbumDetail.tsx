import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import {
  albumService,
  songService,
  artistService,
  songArtistService,
  getSongUrl,
  SongWithRelations,
} from "../services/db";
import { formatDuration } from "../utils/formatDuration";
import { shuffleArray } from "../utils/shuffleArray";

interface Album {
  album_id?: number;
  title: string;
  cover_image?: string | null;
  songs: SongWithRelations[];
}

const AlbumDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    playTrack,
    currentTrack,
    isPlaying,
    setQueue,
    togglePlayPause,
    addToQueue,
  } = useAudioPlayer();

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
          const artistMap = new Map(artistsData.map((a) => [a.artist_id, a.name]));
          const albumMap = new Map(albumsData.map((a) => [a.album_id, a.title]));

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
                album_title: song.album_id ? albumMap.get(song.album_id) : undefined,
              };
            })
          );
          
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

  const buildTracks = async () => {
    if (!album) return [];
    return Promise.all(
      album.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: s.artist_name || "",
          album: album.title,
          cover: s.cover_image || album.cover_image || "",
          songId: s.song_id,
        };
      })
    );
  };

  const handlePlayAll = async () => {
    if (!album || album.songs.length === 0) return;
    const tracks = await buildTracks();
    setQueue(tracks);
    if (tracks[0]) playTrack(tracks[0], 0);
  };

  const handleShuffleAll = async () => {
    if (!album || album.songs.length === 0) return;
    const tracks = await buildTracks();
    const shuffledTracks = shuffleArray(tracks);
    setQueue(shuffledTracks);
    if (shuffledTracks[0]) playTrack(shuffledTracks[0], 0);
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    if (!album) return;
    const tracks = await buildTracks();
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
        album: album.title,
        cover: song.cover_image || album.cover_image || "",
        songId: song.song_id,
      });
    }
  };

  const handleAddToQueue = async (song: SongWithRelations) => {
    if (!album) return;
    try {
      const songUrl = await getSongUrl(song);
      addToQueue({
        url: songUrl,
        title: song.title,
        artist: song.artist_name || "",
        album: album.title,
        cover: song.cover_image || album.cover_image || "",
        songId: song.song_id,
      });
    } catch (err) {
      console.error("Error adding song to queue:", err);
      alert(
        `Failed to add to queue: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    }
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
        {(() => {
          const coverImage = album.cover_image || 
            (album.songs.length > 0 ? album.songs.find(s => s.cover_image)?.cover_image : null);
          return coverImage ? (
            <img
              src={coverImage}
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
              }}
            />
          );
        })()}
        <div>
          <h1 className="section-title" style={{ marginBottom: "16px" }}>
            {album.title}
          </h1>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            {album.songs.length} {album.songs.length === 1 ? "song" : "songs"}
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={handlePlayAll}
              disabled={album.songs.length === 0}
            >
              ▶ play album
            </button>
            <button
              className="btn"
              onClick={handleShuffleAll}
              disabled={album.songs.length === 0}
            >
              shuffle
            </button>
          </div>
        </div>
      </div>

      {album.songs.length === 0 ? (
        <div className="empty">No songs in this album.</div>
      ) : (
        <div className="list">
          {album.songs.map((song, index) => {
            // Use songId for reliable matching, fallback to title/artist matching
            const isCurrent = (song.song_id && currentTrack?.songId === song.song_id) ||
                             (currentTrack?.title === song.title && 
                              currentTrack?.artist === (song.artist_name || ""));
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div 
                key={song.song_id} 
                className="list-item"
                onClick={() => isCurrent ? togglePlayPause() : handlePlaySong(song)}
              >
                <span
                  style={{
                    width: "24px",
                    color: "var(--text-muted)",
                    textAlign: "center",
                  }}
                >
                  {index + 1}
                </span>
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
                <div
                  className="list-item-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="btn btn-small"
                    onClick={() => handleAddToQueue(song)}
                  >
                    queue
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlbumDetail;
