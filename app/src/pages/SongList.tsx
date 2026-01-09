import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { useSongUrls } from "../hooks/useSongUrls";
import { getSongsWithRelations, songService, SongWithRelations } from "../services/db";
import { formatDuration } from "../utils/formatDuration";
import { getErrorMessage } from "../utils/errorUtils";
import { shuffleArray } from "../utils/shuffleArray";
import { playQueueFromIndex, playQueueFromStart } from "../utils/queuePlayback";
import { buildTracksFromSongs, createTrackFromSong } from "../utils/trackUtils";

const SongList: React.FC = () => {
  const [songs, setSongs] = useState<SongWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSongs, setSelectedSongs] = useState<Set<number>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { songUrls, getOrCreateSongUrl, prefetchSongUrls, syncSongUrls } =
    useSongUrls();
  const {
    playTrack,
    currentTrack,
    setQueue,
    togglePlayPause,
    stop,
    addToQueue,
  } = useAudioPlayer();

  useEffect(() => {
    const loadSongs = async () => {
      try {
        const songsData = await getSongsWithRelations();
        setSongs(songsData);

        syncSongUrls(songsData);
        await prefetchSongUrls(songsData);
        setError(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    loadSongs();

  }, [prefetchSongUrls, syncSongUrls]);

  const buildTracks = async () => {
    return buildTracksFromSongs(songs, getOrCreateSongUrl);
  };

  const handlePlayAll = async () => {
    if (songs.length === 0) return;
    try {
      const validTracks = await buildTracks();
      if (validTracks.length === 0) {
        alert("No playable songs found");
        return;
      }
      playQueueFromStart(validTracks, setQueue, playTrack);
    } catch (err) {
      console.error("Error playing all songs:", err);
      alert(
        `Failed to play songs: ${
          getErrorMessage(err, "Unknown error")
        }`
      );
    }
  };

  const handleShuffleAll = async () => {
    if (songs.length === 0) return;
    try {
      const validTracks = await buildTracks();
      if (validTracks.length === 0) {
        alert("No playable songs found");
        return;
      }
      const shuffledTracks = shuffleArray(validTracks);
      playQueueFromStart(shuffledTracks, setQueue, playTrack);
    } catch (err) {
      console.error("Error shuffling songs:", err);
      alert(
        `Failed to shuffle songs: ${
          getErrorMessage(err, "Unknown error")
        }`
      );
    }
  };

  const toggleSongSelection = (
    songId: number | undefined,
    e?: React.MouseEvent
  ) => {
    if (e) {
      e.stopPropagation();
    }
    if (!songId) return;
    setSelectedSongs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(songId)) {
        newSet.delete(songId);
      } else {
        newSet.add(songId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSongs.size === songs.length) {
      setSelectedSongs(new Set());
    } else {
      const allIds = new Set(
        songs.map((s) => s.song_id).filter((id): id is number => !!id)
      );
      setSelectedSongs(allIds);
    }
  };

  const toggleSelectionMode = () => {
    if (selectionMode) {
      // Exiting selection mode - clear selections
      setSelectedSongs(new Set());
    }
    setSelectionMode(!selectionMode);
  };

  const handleBulkDelete = async () => {
    if (selectedSongs.size === 0) return;

    const count = selectedSongs.size;
    const confirmMessage = `Are you sure you want to delete ${count} song${
      count !== 1 ? "s" : ""
    }? This action cannot be undone.`;

    if (!window.confirm(confirmMessage)) return;

    setDeleting(true);
    setError(null);

    try {
      // Check if any of the songs being deleted is currently playing
      const deletedSongIds = Array.from(selectedSongs);
      const isCurrentSongDeleted =
        currentTrack?.songId && deletedSongIds.includes(currentTrack.songId);

      // Delete all selected songs
      const deletePromises = Array.from(selectedSongs).map((songId) =>
        songService.delete(songId).catch((err) => {
          console.error(`Failed to delete song ${songId}:`, err);
          return { error: true, songId };
        })
      );

      const results = await Promise.all(deletePromises);
      const errors = results.filter(
        (r) => r && typeof r === "object" && "error" in r
      );

      if (errors.length > 0) {
        setError(
          `Failed to delete ${errors.length} song(s). Please try again.`
        );
      }

      // Stop playback if the currently playing song was deleted
      if (isCurrentSongDeleted) {
        stop();
      }

      // Clear selection, exit selection mode, and reload songs
      setSelectedSongs(new Set());
      setSelectionMode(false);
      const songsData = await getSongsWithRelations();
      setSongs(songsData);

      syncSongUrls(songsData);
      await prefetchSongUrls(songsData);
    } catch (err: any) {
      setError(err.message || "Failed to delete songs");
    } finally {
      setDeleting(false);
    }
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    try {
      const validTracks = await buildTracks();

      // Find the index of the song being played
      const songIndex = validTracks.findIndex((t) => t.songId === song.song_id);

      if (songIndex !== -1) {
        // Play in order starting from selected song
        playQueueFromIndex(validTracks, songIndex, setQueue, playTrack);
      } else {
        setQueue(validTracks);
        try {
          const finalUrl = await getOrCreateSongUrl(song);
          playTrack(createTrackFromSong(song, finalUrl));
        } catch (err) {
          console.error(`Failed to get URL for song ${song.song_id}:`, err);
          alert(
            `Cannot play song: ${
              getErrorMessage(err, "Song file not available")
            }`
          );
        }
      }
    } catch (err) {
      console.error("Error playing song:", err);
      alert(
        `Failed to play song: ${
          getErrorMessage(err, "Unknown error")
        }`
      );
    }
  };

  const handleAddToQueue = async (song: SongWithRelations) => {
    try {
      const finalUrl = await getOrCreateSongUrl(song);
      if (!finalUrl) {
        alert("Cannot queue song: Song file not available");
        return;
      }

      addToQueue(createTrackFromSong(song, finalUrl));
    } catch (err) {
      console.error("Error adding song to queue:", err);
      alert(
        `Failed to add to queue: ${
          getErrorMessage(err, "Unknown error")
        }`
      );
    }
  };

  if (loading) return <div className="loading">Loading songs...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">songs</h1>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          className="btn btn-primary"
          onClick={handlePlayAll}
          disabled={songs.length === 0 || selectionMode}
        >
          ▶ play all
        </button>
        <button
          className="btn"
          onClick={handleShuffleAll}
          disabled={songs.length === 0 || selectionMode}
        >
          shuffle
        </button>
        <button
          className="btn"
          onClick={() => navigate("/songs/new")}
          disabled={selectionMode}
        >
          + add song
        </button>
        {songs.length > 0 && (
          <>
            <button
              className={selectionMode ? "btn btn-primary" : "btn"}
              onClick={toggleSelectionMode}
            >
              {selectionMode ? "cancel" : "select"}
            </button>
            {selectionMode && (
              <>
                <button className="btn" onClick={toggleSelectAll}>
                  {selectedSongs.size === songs.length
                    ? "deselect all"
                    : "select all"}
                </button>
                {selectedSongs.size > 0 && (
                  <button
                    className="btn"
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    style={{
                      backgroundColor: "var(--error-color, #dc3545)",
                      color: "white",
                    }}
                  >
                    {deleting
                      ? "deleting..."
                      : `delete ${selectedSongs.size} song${
                          selectedSongs.size !== 1 ? "s" : ""
                        }`}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      {songs.length === 0 ? (
        <div className="empty">
          <p>No songs found.</p>
          <p style={{ marginTop: "8px" }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/songs/new")}
            >
              add your first song
            </button>
          </p>
        </div>
      ) : (
        <div className="list">
          {songs.map((song) => {
            // Use songId for reliable matching, fallback to URL matching
            const isCurrent =
              (song.song_id && currentTrack?.songId === song.song_id) ||
              (song.song_id &&
                songUrls.get(song.song_id) &&
                currentTrack?.url === songUrls.get(song.song_id));

            const isSelected = song.song_id
              ? selectedSongs.has(song.song_id)
              : false;

            return (
              <div
                key={song.song_id}
                className="list-item"
                onClick={() => {
                  if (selectionMode) {
                    toggleSongSelection(song.song_id);
                  } else {
                    isCurrent ? togglePlayPause() : handlePlaySong(song);
                  }
                }}
                style={{
                  backgroundColor: isSelected
                    ? "var(--button-hover, rgba(0,0,0,0.05))"
                    : undefined,
                  cursor: selectionMode ? "pointer" : undefined,
                }}
              >
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSongSelection(song.song_id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginRight: "12px",
                      cursor: "pointer",
                      width: "18px",
                      height: "18px",
                    }}
                  />
                )}
                {song.cover_image && (
                  <img
                    src={song.cover_image}
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
                    {formatDuration(song.duration)}
                  </div>
                </div>
                {!selectionMode && (
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
                    <button
                      className="btn btn-small"
                      onClick={() => navigate(`/songs/${song.song_id}/edit`)}
                    >
                      edit
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SongList;
