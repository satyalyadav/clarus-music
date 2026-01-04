import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { albumService, songService, artistService } from "../services/db";

interface Album {
  album_id?: number;
  title: string;
  cover_image?: string | null;
  artist_id: number;
}

interface AlbumWithCover extends Album {
  displayCover?: string | null;
  artistName?: string;
}

const AlbumList: React.FC = () => {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState<AlbumWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const normalizeMatchValue = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");

  const isBandcampHostMismatch = (
    artistName: string | null,
    pageUrl?: string | null
  ): boolean => {
    if (!artistName || !pageUrl) return false;
    try {
      const url = new URL(pageUrl);
      const hostname = url.hostname.toLowerCase();
      if (!hostname.endsWith("bandcamp.com")) {
        return false;
      }
      const subdomain = hostname.replace(/\.bandcamp\.com$/, "");
      const normalizedArtist = normalizeMatchValue(artistName);
      const normalizedSubdomain = normalizeMatchValue(subdomain);
      if (!normalizedArtist || !normalizedSubdomain) return false;
      return (
        !normalizedSubdomain.includes(normalizedArtist) &&
        !normalizedArtist.includes(normalizedSubdomain)
      );
    } catch (e) {
      return false;
    }
  };

  useEffect(() => {
    const loadAlbums = async () => {
      try {
        const [albumsData, songsData, artistsData] = await Promise.all([
          albumService.getAll(),
          songService.getAll(),
          artistService.getAll(),
        ]);

        // Create maps for lookups
        const artistMap = new Map(artistsData.map((a) => [a.artist_id, a.name]));
        const albumCoverMap = new Map<number, string>();
        
        // Create a map of album_id to unique primary artist IDs from songs
        const albumArtistIdsMap = new Map<number, Set<number>>();
        
        for (const song of songsData) {
          if (song.album_id) {
            // Track cover images
            if (song.cover_image && !albumCoverMap.has(song.album_id)) {
              albumCoverMap.set(song.album_id, song.cover_image);
            }
            
            // Track unique artists per album
            if (!albumArtistIdsMap.has(song.album_id)) {
              albumArtistIdsMap.set(song.album_id, new Set());
            }
            const artistIds = albumArtistIdsMap.get(song.album_id)!;
            
            // Add primary artist
            if (song.artist_id) {
              artistIds.add(song.artist_id);
            }
          }
        }

        // Enrich albums with cover images and artist names
        const albumsWithCovers: AlbumWithCover[] = albumsData.map((album) => {
            const albumArtistIds = albumArtistIdsMap.get(album.album_id || 0) || new Set();
            const uniqueArtistCount = albumArtistIds.size;
            
            // Get songs for this album to check for compilation indicators
            const albumSongs = songsData.filter((s) => s.album_id === album.album_id);
            
            // Check if songs have "Artist - Track Name" format (indicates compilation tracks)
            // This pattern suggests the album is a compilation even if only one track is added
            const hasCompilationTrackFormat = albumSongs.some((song) => {
              // Pattern: "Artist - Track Name" or "Artist1 / Artist2 - Track Name"
              // Use lastIndexOf to handle cases like "NA-3LDK / DEFRIC - False Fiction"
              const lastDashIndex = song.title.lastIndexOf(" - ");
              if (lastDashIndex > 0 && lastDashIndex < song.title.length - 3) {
                // Has " - " separator, likely a compilation track
                return true;
              }
              return false;
            });
            
            // Check if this might be a "Various Artists" compilation from Bandcamp
            // Heuristic: If album has Bandcamp songs with track URLs (not album URLs),
            // and album artist_id matches song artist_id, it's likely a single track
            // from a compilation where we used the track artist as placeholder
            const hasBandcampTrackSongs = albumSongs.some((song) => 
              song.bandcamp_page_url && 
              song.bandcamp_page_url.includes("/track/") // Track page, not album page
            );
            const albumArtistName = album.artist_id
              ? artistMap.get(album.artist_id) ?? null
              : null;
            const hasBandcampHostMismatch = albumSongs.some((song) =>
              isBandcampHostMismatch(
                albumArtistName,
                song.bandcamp_page_url ?? null
              )
            );
            const isLikelyCompilationFromBandcamp = 
              hasBandcampTrackSongs && 
              albumSongs.length > 0 &&
              album.artist_id &&
              albumSongs.every((song) => song.artist_id === album.artist_id) &&
              // If all songs have the same artist_id as the album, and they're from Bandcamp track pages,
              // it's likely a compilation where we used the track artist as placeholder
              uniqueArtistCount === 1 &&
              hasBandcampHostMismatch;
            
            // Determine artist name to display
            let artistName: string;
            
            // Check if it's a "Various Artists" compilation
            // Criteria: 
            // 1. Multiple different artists, OR
            // 2. Album artist is "Various Artists", OR
            // 3. Songs have compilation track format ("Artist - Track Name"), OR
            // 4. Likely a Bandcamp compilation (single track with matching artist_id as placeholder)
            const isVariousArtists = 
              uniqueArtistCount > 1 || // Multiple different artists
              (albumArtistName && /various\s+artists?/i.test(albumArtistName.trim())) || // Album artist is "Various Artists"
              hasCompilationTrackFormat || // Songs have compilation track format
              isLikelyCompilationFromBandcamp; // Likely Bandcamp compilation with placeholder artist_id
            
            if (isVariousArtists) {
              artistName = "Various Artists";
            } else {
              // Use album's artist_id, or first song's artist, or "Unknown Artist"
              artistName = albumArtistName || 
                          (albumArtistIds.size > 0 
                            ? artistMap.get(Array.from(albumArtistIds)[0]) 
                            : null) || 
                          "Unknown Artist";
            }
            
          return {
            ...album,
            displayCover: album.cover_image || (album.album_id ? albumCoverMap.get(album.album_id) : null),
            artistName,
          };
        });

        setAlbums(albumsWithCovers);
        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadAlbums();
  }, []);

  if (loading) return <div className="loading">Loading albums...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div>
      <h1 className="section-title">albums</h1>

      {albums.length === 0 ? (
        <div className="empty">
          <p>No albums found.</p>
        </div>
      ) : (
        <div className="grid">
          {albums.map((album) => (
            <div
              key={album.album_id}
              className="grid-item"
              onClick={() => navigate(`/albums/${album.album_id}`)}
            >
              {album.displayCover ? (
                <img
                  src={album.displayCover}
                  alt={album.title}
                  className="grid-item-image"
                />
              ) : (
                <div
                  className="grid-item-image"
                  style={{
                    backgroundColor: "var(--card-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
              )}
              <div className="grid-item-content">
                <div className="grid-item-title">{album.title}</div>
                <div className="grid-item-subtitle">{album.artistName || "Unknown Artist"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlbumList;
