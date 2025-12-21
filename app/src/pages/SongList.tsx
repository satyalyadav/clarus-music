import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { getSongsWithRelations, getSongUrl, revokeSongUrl } from "../services/db";
import { formatDuration } from "../utils/formatDuration";

interface Song {
  song_id?: number;
  title: string;
  duration: string;
  cover_image?: string | null;
  artist_name?: string;
  album_title?: string;
  file_blob?: Blob;
  file_handle?: FileSystemFileHandle;
}

const SongList: React.FC = () => {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [songUrls, setSongUrls] = useState<Map<number, string>>(new Map());
  const navigate = useNavigate();
  const { playTrack, currentTrack, isPlaying, setQueue, togglePlayPause } =
    useAudioPlayer();

  useEffect(() => {
    const loadSongs = async () => {
      try {
        const songsData = await getSongsWithRelations();
        setSongs(songsData);
        
        // Create object URLs for all songs
        const urlMap = new Map<number, string>();
        for (const song of songsData) {
          if (song.song_id) {
            try {
              const url = await getSongUrl(song);
              urlMap.set(song.song_id, url);
            } catch (err) {
              console.error(`Failed to create URL for song ${song.song_id}:`, err);
            }
          }
        }
        setSongUrls(urlMap);
        setError(null);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    loadSongs();

    // Cleanup: revoke object URLs when component unmounts
    return () => {
      songUrls.forEach(url => revokeSongUrl(url));
    };
  }, []);

  const handlePlayAll = async () => {
    if (songs.length === 0) return;
    try {
      const tracks = await Promise.all(
        songs.map(async (s) => {
          try {
            const url = s.song_id ? songUrls.get(s.song_id) : null;
            if (!url && s.song_id) {
              // Create URL if not already created
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
            return {
              url: "",
              title: s.title,
              artist: s.artist_name || "",
              album: s.album_title || "",
              cover: s.cover_image || "",
              songId: s.song_id,
            };
          }
        })
      );
      // Filter out tracks with no URL
      const validTracks = tracks.filter(t => t.url);
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

  const handlePlaySong = async (song: Song) => {
    try {
      const tracks = await Promise.all(
        songs.map(async (s) => {
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
            return {
              url: "",
              title: s.title,
              artist: s.artist_name || "",
              album: s.album_title || "",
              cover: s.cover_image || "",
              songId: s.song_id,
            };
          }
        })
      );
      const validTracks = tracks.filter(t => t.url);
      setQueue(validTracks);
      
      // Find the index of the song being played
      const songIndex = validTracks.findIndex(t => t.songId === song.song_id);
      
      if (songIndex !== -1) {
        playTrack(validTracks[songIndex], songIndex);
      } else {
        // Fallback: try to get URL and play directly
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

  if (loading) return <div className="loading">Loading songs...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">songs</h1>

      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <button
          className="btn btn-primary"
          onClick={handlePlayAll}
          disabled={songs.length === 0}
        >
          ▶ play all
        </button>
        <button className="btn" onClick={() => navigate("/songs/new")}>
          + add song
        </button>
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
            const isCurrent = (song.song_id && currentTrack?.songId === song.song_id) ||
                             (song.song_id && songUrls.get(song.song_id) && currentTrack?.url === songUrls.get(song.song_id));
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div 
                key={song.song_id} 
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
                  </div>
                </div>
                <div className="list-item-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn btn-small"
                    onClick={() => navigate(`/songs/${song.song_id}/edit`)}
                  >
                    edit
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

export default SongList;
