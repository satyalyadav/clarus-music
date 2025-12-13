import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";
import { getSongsWithRelations, getSongUrl, revokeSongUrl } from "../services/db";

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

function formatDuration(d: any): string {
  if (typeof d === "string") {
    // Handle PostgreSQL interval string format (e.g., "3:45" or "1:23:45" or "3:45.123" or "5:12:00")
    const parts = d.split(":");
    if (parts.length === 2) {
      // MM:SS format - remove milliseconds if present
      const secondsPart = parts[1].split(".")[0]; // Remove decimal part
      return `${parts[0]}:${secondsPart.padStart(2, "0")}`;
    } else if (parts.length === 3) {
      // Could be HH:MM:SS format
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const secondsPart = parts[2].split(".")[0]; // Remove decimal part
      const seconds = parseInt(secondsPart, 10);
      
      // If hours is 0, show as MM:SS
      if (hours === 0) {
        return `${minutes}:${secondsPart.padStart(2, "0")}`;
      }
      
      // Heuristic: If hours < 60 and total duration < 2 hours (7200 seconds),
      // it's likely stored incorrectly as HH:MM:SS when it should be MM:SS
      // Treat hours as minutes in this case
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      if (hours < 60 && totalSeconds < 7200 && seconds === 0) {
        // Likely meant to be MM:SS format
        return `${hours}:${String(minutes).padStart(2, "0")}`;
      }
      
      // For songs with hours, show HH:MM:SS
      return `${hours}:${String(minutes).padStart(2, "0")}:${secondsPart.padStart(2, "0")}`;
    }
    return d;
  }
  // Handle object format from database (PostgreSQL interval)
  const h = d.hours || 0;
  const m = d.minutes || 0;
  const s = Math.floor(d.seconds || 0); // Floor to remove milliseconds
  
  // Heuristic: If hours < 60 and total duration < 2 hours,
  // it's likely stored incorrectly - treat hours as minutes
  const totalSeconds = (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
  if (h > 0 && h < 60 && totalSeconds < 7200 && s === 0) {
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  
  // Format: MM:SS if no hours, HH:MM:SS if hours > 0
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
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
    const tracks = await Promise.all(
      songs.map(async (s) => {
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
          };
        }
        return {
          url: url || "",
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

  const handlePlaySong = async (song: Song) => {
    const tracks = await Promise.all(
      songs.map(async (s) => {
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
          };
        }
        return {
          url: url || "",
          title: s.title,
          artist: s.artist_name || "",
          album: s.album_title || "",
          cover: s.cover_image || "",
        };
      })
    );
    setQueue(tracks);
    
    const songUrl = song.song_id ? songUrls.get(song.song_id) : null;
    if (!songUrl && song.song_id) {
      const newUrl = await getSongUrl(song);
      setSongUrls(prev => new Map(prev).set(song.song_id!, newUrl));
      playTrack({
        url: newUrl,
        title: song.title,
        artist: song.artist_name || "",
        album: song.album_title || "",
        cover: song.cover_image || "",
      });
    } else {
      playTrack({
        url: songUrl || "",
        title: song.title,
        artist: song.artist_name || "",
        album: song.album_title || "",
        cover: song.cover_image || "",
      });
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
            const trackUrl = song.song_id ? songUrls.get(song.song_id) : null;
            const isCurrent = trackUrl && currentTrack?.url === trackUrl;
            const isCurrentPlaying = isCurrent && isPlaying;

            return (
              <div key={song.song_id} className="list-item">
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
                    {formatDuration(song.duration)}
                  </div>
                </div>
                <div className="list-item-actions">
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
