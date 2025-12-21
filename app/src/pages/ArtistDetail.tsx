import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import {
  artistService,
  songService,
  albumService,
  songArtistService,
  getSongUrl,
  SongWithRelations,
} from "../services/db";
import { artistImageService } from "../services/artistImageService";
import { formatDuration } from "../utils/formatDuration";

interface Artist {
  artist_id?: number;
  name: string;
  image_url?: string | null;
  songs: SongWithRelations[];
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
          const [albums, allArtists] = await Promise.all([
            albumService.getAll(),
            artistService.getAll(),
          ]);
          const albumMap = new Map(
            albums.map((a) => [
              a.album_id,
              { title: a.title, cover_image: a.cover_image },
            ])
          );
          const artistMap = new Map(allArtists.map((a) => [a.artist_id, a.name]));

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
                artistNames.length > 0 ? artistNames.join(", ") : artistData.name;

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
          
          setArtist({
            ...artistData,
            songs: songsWithRelations,
          });

          // Fetch image in background if not present
          if (artistData.artist_id && artistData.name && !artistData.image_url) {
            artistImageService
              .fetchAndUpdateArtistImage(artistData.artist_id, artistData.name)
              .then((imageUrl) => {
                if (imageUrl) {
                  setArtist((prev) => (prev ? { ...prev, image_url: imageUrl } : null));
                }
              })
              .catch((err) => {
                console.error("Error fetching artist image:", err);
              });
          }
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
          artist: s.artist_name || artist.name,
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
    if (!artist) return;
    const tracks = await Promise.all(
      artist.songs.map(async (s) => {
        const url = await getSongUrl(s);
        return {
          url,
          title: s.title,
          artist: s.artist_name || artist.name,
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
        artist: song.artist_name || artist.name,
        album: song.album_title || "",
        cover: song.cover_image || song.album_cover_image || "",
        songId: song.song_id,
      });
    }
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
            background: artist.image_url ? "transparent" : "var(--card-bg)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "80px",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {artist.image_url ? (
            <img
              src={artist.image_url}
              alt={artist.name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={(e) => {
                // Fallback to emoji if image fails to load
                e.currentTarget.style.display = "none";
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  parent.innerHTML = "🎤";
                  parent.style.background = "var(--card-bg)";
                }
              }}
            />
          ) : (
            <span>🎤</span>
          )}
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
            // Use songId for reliable matching, fallback to title/artist matching
            const isCurrent = (song.song_id && currentTrack?.songId === song.song_id) ||
                             (currentTrack?.title === song.title && 
                              currentTrack?.artist === artist.name);
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
