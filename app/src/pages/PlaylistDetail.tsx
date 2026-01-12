import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useSongUrls } from "../hooks/useSongUrls";
import {
  playlistService,
  artistService,
  albumService,
  songArtistService,
  SongWithRelations,
} from "../services/db";
import { formatDuration } from "../utils/formatDuration";
import { getErrorMessage } from "../utils/errorUtils";
import { playQueueFromIndex, playQueueFromStart } from "../utils/queuePlayback";
import { buildTracksFromSongs, createTrackFromSong } from "../utils/trackUtils";

interface Playlist {
  playlist_id?: number;
  title: string;
  cover_image?: string | null;
  date_created?: string;
  songs: SongWithRelations[];
}

const PlaylistDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { playTrack, currentTrack, setQueue, togglePlayPause, addToQueue } =
    useAudioPlayer();
  const { getOrCreateSongUrl } = useSongUrls();

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
        const artistMap = new Map(
          artistsData.map((a) => [a.artist_id, a.name])
        );
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
              album_title: song.album_id
                ? albumMap.get(song.album_id)
                : undefined,
            };
          })
        );

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
    const tracks = await buildTracksFromSongs(
      playlist.songs,
      getOrCreateSongUrl
    );
    playQueueFromStart(tracks, setQueue, playTrack);
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    if (!playlist) return;
    const tracks = await buildTracksFromSongs(
      playlist.songs,
      getOrCreateSongUrl
    );

    // Find the index of the song being played in the queue
    const songIndex = tracks.findIndex((t) => t.songId === song.song_id);

    if (songIndex !== -1) {
      playQueueFromIndex(tracks, songIndex, setQueue, playTrack);
    } else {
      setQueue(tracks);
      try {
        const songUrl = await getOrCreateSongUrl(song);
        playTrack(createTrackFromSong(song, songUrl));
      } catch (err) {
        console.error(`Failed to get URL for song ${song.song_id}:`, err);
        alert(
          `Cannot play song: ${getErrorMessage(err, "Song file not available")}`
        );
      }
    }
  };

  const handleAddToQueue = async (song: SongWithRelations) => {
    try {
      const songUrl = await getOrCreateSongUrl(song);
      addToQueue(createTrackFromSong(song, songUrl));
    } catch (err) {
      console.error("Error adding song to queue:", err);
      alert(`Failed to add to queue: ${getErrorMessage(err, "Unknown error")}`);
    }
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

  const movePlaylistSong = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || !playlist || !id) return;
    
    const playlistId = parseInt(id);
    const newSongs = [...playlist.songs];
    const [moved] = newSongs.splice(fromIndex, 1);
    newSongs.splice(toIndex, 0, moved);
    
    // Update local state immediately for responsive UI
    setPlaylist({ ...playlist, songs: newSongs });
    
    // Save new order to database
    try {
      const songIds = newSongs
        .map((s) => s.song_id)
        .filter((id): id is number => id !== undefined);
      await playlistService.setSongs(playlistId, songIds);
    } catch (err: any) {
      // Revert on error
      fetchPlaylist();
      alert(err.message || "Failed to reorder songs");
    }
  };

  const handleDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    e.preventDefault();
    const fromIndex =
      dragIndex !== null
        ? dragIndex
        : Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!Number.isNaN(fromIndex)) {
      movePlaylistSong(fromIndex, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
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
          {playlist.date_created && (
            <p
              style={{
                color: "var(--text-muted)",
                marginBottom: "16px",
                fontSize: "12px",
              }}
            >
              Created {new Date(playlist.date_created).toLocaleDateString()}
            </p>
          )}
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
            // Use songId for reliable matching, fallback to title/artist matching
            const isCurrent =
              (song.song_id && currentTrack?.songId === song.song_id) ||
              (currentTrack?.title === song.title &&
                currentTrack?.artist === (song.artist_name || ""));
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index;

            return (
              <div
                key={song.song_id}
                className={`list-item${isDragging ? " dragging" : ""}${
                  isDragOver ? " drag-over" : ""
                }`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (dragIndex === null) {
                    isCurrent ? togglePlayPause() : handlePlaySong(song);
                  }
                }}
                style={{
                  cursor: isDragging ? "grabbing" : "grab",
                  opacity: isDragging ? 0.5 : 1,
                  backgroundColor: isDragOver
                    ? "var(--button-hover)"
                    : undefined,
                  transition: "background-color 0.2s ease",
                }}
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
                    {song.artist_name || "Unknown Artist"} •{" "}
                    {song.album_title || "Unknown Album"}
                  </div>
                </div>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  {formatDuration(song.duration)}
                </span>
                <span
                  className="queue-drag-handle"
                  aria-hidden="true"
                  style={{ marginRight: "8px" }}
                >
                  :::
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
                  {song.song_id && (
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => {
                        if (song.song_id) {
                          handleRemoveSong(song.song_id);
                        }
                      }}
                      title="Remove from playlist"
                    >
                      x
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PlaylistDetail;
