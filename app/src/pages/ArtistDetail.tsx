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
import { shuffleArray } from "../utils/shuffleArray";

interface Artist {
  artist_id?: number;
  name: string;
  image_url?: string | null;
  image_source_url?: string | null;
  image_source_provider?: string | null;
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
              .then((imageInfo) => {
                if (imageInfo?.imageUrl) {
                  setArtist((prev) =>
                    prev
                      ? {
                          ...prev,
                          image_url: imageInfo.imageUrl,
                          image_source_url: imageInfo.sourceUrl,
                          image_source_provider: imageInfo.sourceProvider,
                        }
                      : null
                  );
                }
              })
              .catch((err) => {
                console.error("Error fetching artist image:", err);
              });
          } else if (
            artistData.artist_id &&
            artistData.name &&
            artistData.image_url &&
            !artistData.image_source_url &&
            (artistData.image_url.includes("bcbits.com") ||
              artistData.image_url.includes("bandcamp.com"))
          ) {
            try {
              const response = await fetch(
                `/api/bandcamp-artist-image?artist=${encodeURIComponent(
                  artistData.name
                )}`
              );
              if (response.ok) {
                const data = await response.json();
                if (data.sourceUrl || data.imageUrl) {
                  const sourceUrl = data.sourceUrl || null;
                  const imageUrl = data.imageUrl || artistData.image_url;
                  await artistService.update(artistData.artist_id, {
                    image_url: imageUrl,
                    image_source_url: sourceUrl,
                    image_source_provider: sourceUrl ? "bandcamp" : null,
                  });
                  setArtist((prev) =>
                    prev
                      ? {
                          ...prev,
                          image_url: imageUrl,
                          image_source_url: sourceUrl,
                          image_source_provider: sourceUrl ? "bandcamp" : null,
                        }
                      : null
                  );
                }
              }
            } catch (err) {
              console.error("Error backfilling Bandcamp source:", err);
            }
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

  const buildTracks = async () => {
    if (!artist) return [];
    return Promise.all(
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
  };

  const handlePlayAll = async () => {
    if (!artist || artist.songs.length === 0) return;
    const tracks = await buildTracks();
    setQueue(tracks);
    if (tracks[0]) playTrack(tracks[0], 0);
  };

  const handleShuffleAll = async () => {
    if (!artist || artist.songs.length === 0) return;
    const tracks = await buildTracks();
    const shuffledTracks = shuffleArray(tracks);
    setQueue(shuffledTracks);
    if (shuffledTracks[0]) playTrack(shuffledTracks[0], 0);
  };

  const handlePlaySong = async (song: SongWithRelations) => {
    if (!artist) return;
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "16px",
            }}
          >
            <h1 className="section-title" style={{ margin: 0 }}>
              {artist.name}
            </h1>
            {artist.image_source_url && (
              <a
                href={artist.image_source_url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${artist.image_source_provider || "artist"} page`}
                title={`Open ${artist.image_source_provider || "artist"} page`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "24px",
                  height: "24px",
                  color: "var(--text-secondary)",
                  borderRadius: "6px",
                  border: "1px solid var(--border-color)",
                  textDecoration: "none",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M14 3h7v7h-2V6.41l-8.29 8.3-1.42-1.42 8.3-8.29H14V3z" />
                  <path d="M5 5h6v2H7v10h10v-4h2v6H5V5z" />
                </svg>
              </a>
            )}
          </div>
          <p style={{ color: "var(--text-muted)", marginBottom: "16px" }}>
            {artist.songs.length} {artist.songs.length === 1 ? "song" : "songs"}
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={handlePlayAll}
              disabled={artist.songs.length === 0}
            >
              ▶ play all
            </button>
            <button
              className="btn"
              onClick={handleShuffleAll}
              disabled={artist.songs.length === 0}
            >
              shuffle
            </button>
          </div>
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
