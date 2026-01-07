import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { searchAll, SearchResult, getSongUrl, revokeSongUrl, SongWithRelations } from "../services/db";
import { formatDuration } from "../utils/formatDuration";
import { buildQueueFromIndex } from "../utils/buildQueueFromIndex";

const SearchResults: React.FC = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songUrls, setSongUrls] = useState<Map<number, string>>(new Map());
  const navigate = useNavigate();
  const {
    playTrack,
    currentTrack,
    isPlaying,
    setQueue,
    togglePlayPause,
    addToQueue,
  } = useAudioPlayer();

  useEffect(() => {
    const performSearch = async () => {
      if (!query.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const searchResults = await searchAll(query);
        setResults(searchResults);

        // Create object URLs for all songs in results
        const urlMap = new Map<number, string>();
        for (const result of searchResults) {
          if (result.type === 'song' && result.song?.song_id) {
            try {
              const url = await getSongUrl(result.song);
              urlMap.set(result.song.song_id, url);
            } catch (err) {
              console.error(`Failed to create URL for song ${result.song.song_id}:`, err);
            }
          }
        }
        setSongUrls(urlMap);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    performSearch();

    // Cleanup: revoke object URLs when component unmounts
    return () => {
      songUrls.forEach(url => revokeSongUrl(url));
    };
  }, [query]);

  const handlePlayAll = async () => {
    const songResults = results.filter(r => r.type === 'song' && r.song);
    if (songResults.length === 0) {
      alert('No songs found to play');
      return;
    }
    try {
      const tracks = await Promise.all(
        songResults.map(async (result) => {
          if (!result.song) return null;
          const s = result.song;
          try {
            const url = s.song_id ? songUrls.get(s.song_id) : null;
            if (!url && s.song_id) {
              const newUrl = await getSongUrl(s);
              setSongUrls(prev => new Map(prev).set(s.song_id!, newUrl));
              return {
                url: newUrl,
                title: s.title,
                artist: s.artist_name || "",
                album: s.album_title || "",
                cover: s.cover_image || "",
                songId: s.song_id,
              };
            }
            return {
              url: url || "",
              title: s.title,
              artist: s.artist_name || "",
              album: s.album_title || "",
              cover: s.cover_image || "",
              songId: s.song_id,
            };
          } catch (err) {
            console.error(`Failed to get URL for song ${s.song_id}:`, err);
            return null;
          }
        })
      );
      const validTracks = tracks.filter((t): t is NonNullable<typeof t> => t !== null && t.url);
      if (validTracks.length === 0) {
        alert('No playable songs found');
        return;
      }
      setQueue(validTracks);
      if (validTracks[0]) playTrack(validTracks[0], 0);
    } catch (err) {
      console.error('Error playing all songs:', err);
      alert(`Failed to play songs: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleResultClick = async (result: SearchResult) => {
    if (result.type === 'song' && result.song) {
      handlePlaySong(result.song);
    } else if (result.type === 'album' && result.id) {
      navigate(`/albums/${result.id}`);
    } else if (result.type === 'artist' && result.id) {
      navigate(`/artists/${result.id}`);
    } else if (result.type === 'playlist' && result.id) {
      navigate(`/playlists/${result.id}`);
    }
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    try {
      // Get all songs from results for queue
      const songResults = results.filter(r => r.type === 'song' && r.song);
      const tracks = await Promise.all(
        songResults.map(async (result) => {
          if (!result.song) return null;
          const s = result.song;
          try {
            const url = s.song_id ? songUrls.get(s.song_id) : null;
            if (!url && s.song_id) {
              const newUrl = await getSongUrl(s);
              setSongUrls(prev => new Map(prev).set(s.song_id!, newUrl));
              return {
                url: newUrl,
                title: s.title,
                artist: s.artist_name || "",
                album: s.album_title || "",
                cover: s.cover_image || "",
                songId: s.song_id,
              };
            }
            return {
              url: url || "",
              title: s.title,
              artist: s.artist_name || "",
              album: s.album_title || "",
              cover: s.cover_image || "",
              songId: s.song_id,
            };
          } catch (err) {
            console.error(`Failed to get URL for song ${s.song_id}:`, err);
            return null;
          }
        })
      );
      const validTracks = tracks.filter(
        (t): t is NonNullable<typeof t> => t !== null && t.url
      );

      const songIndex = validTracks.findIndex(
        (t) => t.songId === song.song_id
      );

      if (songIndex !== -1) {
        const reorderedTracks = buildQueueFromIndex(validTracks, songIndex);
        setQueue(reorderedTracks);
        playTrack(reorderedTracks[0], 0);
      } else {
        setQueue(validTracks);
        const songUrl = song.song_id ? songUrls.get(song.song_id) : null;
        let finalUrl = songUrl;

        if (!songUrl && song.song_id) {
          try {
            finalUrl = await getSongUrl(song);
            setSongUrls(prev => new Map(prev).set(song.song_id!, finalUrl));
          } catch (err) {
            console.error(`Failed to get URL for song ${song.song_id}:`, err);
            alert(`Cannot play song: ${err instanceof Error ? err.message : 'Song file not available'}`);
            return;
          }
        }

        if (!finalUrl) {
          alert('Cannot play song: Song file not available');
          return;
        }

        playTrack({
          url: finalUrl,
          title: song.title,
          artist: song.artist_name || "",
          album: song.album_title || "",
          cover: song.cover_image || "",
          songId: song.song_id,
        });
      }
    } catch (err) {
      console.error('Error playing song:', err);
      alert(`Failed to play song: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddToQueue = async (song: SongWithRelations) => {
    try {
      const songUrl = song.song_id ? songUrls.get(song.song_id) : null;
      let finalUrl = songUrl;

      if (!songUrl && song.song_id) {
        finalUrl = await getSongUrl(song);
        setSongUrls(prev => new Map(prev).set(song.song_id!, finalUrl));
      }

      if (!finalUrl) {
        alert("Cannot queue song: Song file not available");
        return;
      }

      addToQueue({
        url: finalUrl,
        title: song.title,
        artist: song.artist_name || "",
        album: song.album_title || "",
        cover: song.cover_image || "",
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

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'song':
        return '🎵';
      case 'album':
        return '💿';
      case 'artist':
        return '🎤';
      case 'playlist':
        return '🎶';
      default:
        return '';
    }
  };

  if (loading) return <div className="loading">Searching...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">
        search results{query ? ` for "${query}"` : ""}
      </h1>

      {!query.trim() ? (
        <div className="empty">
          <p>Enter a search query to find songs, albums, artists, and playlists.</p>
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          <p>No results found matching "{query}".</p>
        </div>
      ) : (
        <>
          {results.some(r => r.type === 'song') && (
            <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
              <button
                className="btn btn-primary"
                onClick={handlePlayAll}
                disabled={!results.some(r => r.type === 'song')}
              >
                ▶ play all songs ({results.filter(r => r.type === 'song').length})
              </button>
            </div>
          )}

          <div className="list">
            {results.map((result) => {
              if (result.type === 'song' && result.song) {
                const song = result.song;
                const isCurrent = (song.song_id && currentTrack?.songId === song.song_id) ||
                                 (song.song_id && songUrls.get(song.song_id) && currentTrack?.url === songUrls.get(song.song_id));
                const isCurrentPlaying = isCurrent && isPlaying;

                return (
                  <div
                    key={`song-${song.song_id}`}
                    className="list-item"
                    onClick={() => isCurrent ? togglePlayPause() : handlePlaySong(song)}
                  >
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
                        {song.album_title && ` • ${song.album_title}`}
                      </div>
                    </div>
                    <div className="list-item-actions" onClick={(e) => e.stopPropagation()}>
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
                  </div>
                );
              } else {
                // Non-song results (albums, artists, playlists)
                return (
                  <div
                    key={`${result.type}-${result.id}`}
                    className="list-item"
                    onClick={() => handleResultClick(result)}
                  >
                    {result.image ? (
                      <img
                        src={result.image}
                        alt={result.title}
                        style={{
                          width: "50px",
                          height: "50px",
                          objectFit: "cover",
                          borderRadius: "4px",
                          marginRight: "12px",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "50px",
                          height: "50px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "24px",
                          background: "var(--button-hover)",
                          borderRadius: "4px",
                          marginRight: "12px",
                        }}
                      >
                        {getResultIcon(result.type)}
                      </div>
                    )}
                    <div className="list-item-content">
                      <div className="list-item-title">
                        {result.title}
                        <span style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          background: "var(--border-color)",
                          color: "var(--text-muted)",
                          borderRadius: "3px",
                          textTransform: "uppercase",
                          marginLeft: "8px",
                        }}>
                          {result.type}
                        </span>
                      </div>
                      <div className="list-item-subtitle">
                        {result.subtitle || ''}
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default SearchResults;
