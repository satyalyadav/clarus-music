import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { 
  songService, 
  albumService, 
  artistService,
  songArtistService,
  Song,
  Album,
  Artist,
} from "../services/db";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { getErrorMessage } from "../utils/errorUtils";

interface SearchResult {
  title: string;
  album: string;
  artist: string;
  artistImage?: string;
  coverArt: string;
  raw: any;
}

const SongEdit: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentTrack, stop } = useAudioPlayer();
  const [song, setSong] = useState<Song | null>(null);
  const [title, setTitle] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [artistId, setArtistId] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isBandcampSong, setIsBandcampSong] = useState(false);

  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selectedArtistIds, setSelectedArtistIds] = useState<number[]>([]);

  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchMode, setSearchMode] = useState<"spotify" | "manual">("spotify");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Pending metadata from search
  const [pendingArtistNames, setPendingArtistNames] = useState<string[]>([]);
  const [pendingAlbumName, setPendingAlbumName] = useState<string | null>(null);
  const [pendingAlbumCoverArt, setPendingAlbumCoverArt] = useState<string | null>(null);
  const [pendingSpotifyArtistIds, setPendingSpotifyArtistIds] = useState<string[]>([]);
  const [pendingArtistNameToIdMap, setPendingArtistNameToIdMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      const songId = parseInt(id);
      const [songData, albumsData, artistsData] = await Promise.all([
        songService.getById(songId),
        albumService.getAll(),
        artistService.getAll(),
      ]);
      
      if (songData) {
        setSong(songData);
        setTitle(songData.title);
        setAlbumId(songData.album_id?.toString() || "");
        setArtistId(songData.artist_id?.toString() || "");
        setCoverImage(songData.cover_image || "");

        // Check if this is a Bandcamp song
        const isBandcamp = !!(songData.url && songData.bandcamp_page_url);
        setIsBandcampSong(isBandcamp);

        // Load associated artists
        if (songData.song_id) {
          const associatedArtistIds = await songArtistService.getArtistIdsForSong(songData.song_id);
          const allArtistIds = songData.artist_id ? [songData.artist_id, ...associatedArtistIds] : associatedArtistIds;
          setSelectedArtistIds(Array.from(new Set(allArtistIds)));
        } else {
          setSelectedArtistIds(songData.artist_id ? [songData.artist_id] : []);
        }
      }
      setAlbums(albumsData);
      setArtists(artistsData);
    };
    loadData();
  }, [id]);

  // Utility functions
  const normalizeArtistName = (value: string): string =>
    value.toLowerCase().replace(/\s+/g, " ").trim();

  const splitArtistNames = (
    raw: string,
    options?: { includeFeaturing?: boolean },
  ): string[] => {
    if (!raw) return [];
    const includeFeaturing = options?.includeFeaturing !== false;
    const cleaned = includeFeaturing
      ? raw.replace(/\s+feat\.?/gi, ",").replace(/\s+featuring/gi, ",")
      : raw;
    return cleaned
      .split(/,|&| x | X |\/|\\/gi)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const extractFeaturedFromTitle = (rawTitle: string): string[] => {
    if (!rawTitle) return [];
    const match =
      rawTitle.match(/\(feat\.([^)]*)\)/i) ||
      rawTitle.match(/\(featuring([^)]*)\)/i);
    if (!match) return [];
    return match[1]
      .split(/,|&| x | X |\/|\\/gi)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const extractSpotifyTrackId = (query: string): string | null => {
    const trimmed = query.trim();
    const trackUrlMatch = trimmed.match(
      /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i,
    );
    if (trackUrlMatch) {
      return trackUrlMatch[1];
    }
    return null;
  };

  const validateAndGetArtistImage = async (
    artistId: string,
  ): Promise<{ imageUrl: string; sourceUrl: string | null } | null> => {
    try {
      const response = await fetch(`/api/spotify-artist/${artistId}`);
      if (!response.ok) {
        return null;
      }
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return null;
      }
      const data = await response.json();
      if (data.images && data.images.length > 0) {
        return {
          imageUrl: data.images[0].url,
          sourceUrl: data.external_urls?.spotify || null,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  // Spotify search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = searchQuery.trim();

    if (searchMode !== "spotify" || trimmedQuery.length === 0) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setError(null);

      try {
        const spotifyId = extractSpotifyTrackId(trimmedQuery);
        const isLookup = spotifyId !== null;

        if (!isLookup && trimmedQuery.length < 2) {
          setSearchResults([]);
          setShowResults(false);
          return;
        }

        let spotifyData: any;

        if (isLookup && spotifyId) {
          const response = await fetch(`/api/spotify-track/${spotifyId}`);
          if (!response.ok) {
            throw new Error(`Spotify API error: ${response.statusText}`);
          }
          const track = await response.json();
          spotifyData = { tracks: { items: [track] } };
        } else {
          const term = encodeURIComponent(trimmedQuery);
          const response = await fetch(
            `/api/spotify-search?q=${term}&type=track&limit=25`,
          );
          if (!response.ok) {
            throw new Error(`Spotify API error: ${response.statusText}`);
          }
          spotifyData = await response.json();
        }

        const results: SearchResult[] = (spotifyData.tracks?.items || []).map(
          (item: any) => {
            let albumArt = "";
            if (item.album?.images?.length > 0) {
              albumArt = item.album.images[0].url;
            }

            const artistNames =
              item.artists?.map((a: any) => a.name).join(", ") || "";

            const artistNameToIdMap = new Map<string, string>();
            if (Array.isArray(item.artists)) {
              item.artists.forEach((a: any) => {
                if (a.name && a.id) {
                  artistNameToIdMap.set(a.name, a.id);
                }
              });
            }

            return {
              title: item.name || "",
              album: item.album?.name || "",
              artist: artistNames,
              coverArt: albumArt,
              raw: {
                ...item,
                artistIds: Array.isArray(item.artists)
                  ? item.artists.map((a: any) => a.id).filter(Boolean)
                  : [],
                artistNameToIdMap: artistNameToIdMap,
              },
            };
          },
        );

        setSearchResults(results);
        setShowResults(true);
      } catch (err) {
        console.error("Search error:", err);
        setError(getErrorMessage(err, "Failed to search Spotify"));
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchMode]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Handle selecting a search result
  const handleSelectResult = async (result: SearchResult) => {
    setSearchQuery("");
    setShowResults(false);
    setTitle(result.title || "");
    setCoverImage(result.coverArt || "");

    // Parse artist names from Spotify result
    const mainArtistNames = splitArtistNames(result.artist || "");
    const featuredFromTitle = extractFeaturedFromTitle(result.title || "");
    const allNames = Array.from(
      new Set([...mainArtistNames, ...featuredFromTitle]),
    );

    const effectiveNames =
      allNames.length > 0 && mainArtistNames.length > 0
        ? allNames
        : result.artist
          ? [result.artist]
          : [];

    const trimmedNames = effectiveNames
      .map((name) => name.trim())
      .filter(Boolean);

    setPendingArtistNames(trimmedNames);

    const spotifyArtistIds: string[] =
      (result.raw && Array.isArray(result.raw.artistIds)
        ? result.raw.artistIds
        : []) || [];
    setPendingSpotifyArtistIds(spotifyArtistIds);

    const artistNameToIdMap: Map<string, string> =
      result.raw?.artistNameToIdMap || new Map();
    setPendingArtistNameToIdMap(artistNameToIdMap);

    // Try to find existing artists to pre-select
    const existingArtistIds: number[] = [];
    for (const name of trimmedNames) {
      const normalizedName = normalizeArtistName(name);
      const existing = artists.find(
        (a) => normalizeArtistName(a.name) === normalizedName,
      );
      if (existing?.artist_id != null) {
        existingArtistIds.push(existing.artist_id);
      }
    }

    if (existingArtistIds.length > 0) {
      setArtistId(existingArtistIds[0].toString());
      setSelectedArtistIds(existingArtistIds);
    } else {
      setArtistId("");
      setSelectedArtistIds([]);
    }

    // Handle album
    if (result.album) {
      setPendingAlbumName(result.album);
      setPendingAlbumCoverArt(result.coverArt || null);

      const existingAlbum = albums.find((a) => a.title === result.album);
      if (existingAlbum?.album_id) {
        setAlbumId(existingAlbum.album_id.toString());
      } else {
        setAlbumId("");
      }
    } else {
      setPendingAlbumName(null);
      setPendingAlbumCoverArt(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!id || !song) return;
      const songId = parseInt(id);
      const oldAlbumId = song.album_id;

      // Resolve artists
      let resolvedPrimaryArtistId: number | null = null;
      let resolvedSelectedArtistIds: number[] = [];

      if (pendingArtistNames.length > 0) {
        // Create or find artists from pending names
        const createdArtistsByName = new Map<string, Artist>();
        const allArtistIds: number[] = [];
        let primaryArtistId: number | null = null;

        const getOrCreateArtist = async (
          rawName: string,
        ): Promise<Artist | null> => {
          const trimmedName = rawName.trim();
          if (!trimmedName) return null;
          const normalizedName = normalizeArtistName(trimmedName);

          if (createdArtistsByName.has(normalizedName)) {
            return createdArtistsByName.get(normalizedName)!;
          }

          const existing = artists.find(
            (a) => normalizeArtistName(a.name) === normalizedName,
          );
          if (existing) {
            createdArtistsByName.set(normalizedName, existing);
            return existing;
          }

          const newId = await artistService.create({ name: trimmedName });
          const artist = { artist_id: newId, name: trimmedName };
          createdArtistsByName.set(normalizedName, artist);
          setArtists((prev) => [...prev, artist]);
          return artist;
        };

        for (const name of pendingArtistNames) {
          const artist = await getOrCreateArtist(name);
          if (artist?.artist_id != null) {
            allArtistIds.push(artist.artist_id);
            if (primaryArtistId == null) {
              primaryArtistId = artist.artist_id;
            }
          }
        }

        // Update artist images from Spotify if available
        if (pendingSpotifyArtistIds.length > 0 && allArtistIds.length > 0) {
          const imageUpdatePromises = pendingArtistNames.map(
            async (artistName, index) => {
              const dbArtistId = allArtistIds[index];
              if (!dbArtistId) return;

              const spotifyArtistId = pendingArtistNameToIdMap.get(artistName);
              if (spotifyArtistId) {
                try {
                  const validated = await validateAndGetArtistImage(spotifyArtistId);
                  if (validated?.imageUrl) {
                    await artistService.update(dbArtistId, {
                      image_url: validated.imageUrl,
                      image_source_url: validated.sourceUrl,
                      image_source_provider: "spotify",
                    });
                    setArtists((prev) =>
                      prev.map((a) =>
                        a.artist_id === dbArtistId
                          ? {
                              ...a,
                              image_url: validated.imageUrl,
                              image_source_url: validated.sourceUrl,
                              image_source_provider: "spotify",
                            }
                          : a,
                      ),
                    );
                  }
                } catch (err) {
                  console.error(`Error updating artist image:`, err);
                }
              }
            },
          );
          await Promise.allSettled(imageUpdatePromises);
        }

        if (primaryArtistId != null) {
          resolvedPrimaryArtistId = primaryArtistId;
          resolvedSelectedArtistIds = allArtistIds;
        }
      } else if (artistId) {
        resolvedPrimaryArtistId = parseInt(artistId);
        resolvedSelectedArtistIds = selectedArtistIds.length > 0 ? selectedArtistIds : [parseInt(artistId)];
      }

      if (!resolvedPrimaryArtistId) {
        setError("Artist is required");
        setLoading(false);
        return;
      }

      // Resolve album
      let resolvedAlbumId: number | null = null;

      if (pendingAlbumName) {
        // Find or create album
        let album = albums.find((a) => a.title === pendingAlbumName);

        if (!album) {
          // Create new album
          const newAlbumId = await albumService.create({
            title: pendingAlbumName,
            artist_id: resolvedPrimaryArtistId,
            cover_image: pendingAlbumCoverArt,
          });
          album = { album_id: newAlbumId, title: pendingAlbumName, artist_id: resolvedPrimaryArtistId, cover_image: pendingAlbumCoverArt };
          setAlbums((prev) => [...prev, album as Album]);
        }

        resolvedAlbumId = album.album_id || null;
      } else if (albumId) {
        resolvedAlbumId = parseInt(albumId);
      }

      // Update song
      await songService.update(songId, {
        title: title.trim(),
        album_id: resolvedAlbumId,
        artist_id: resolvedPrimaryArtistId,
        cover_image: coverImage || null,
      });

      // Update song-artist relationships
      if (songId) {
        await songArtistService.setArtistsForSong(songId, resolvedSelectedArtistIds);
      }

      // Check if old album should be deleted (if it's different from new album and has no songs)
      if (oldAlbumId && oldAlbumId !== resolvedAlbumId) {
        const remainingSongs = await songService.getByAlbum(oldAlbumId);
        if (remainingSongs.length === 0) {
          await albumService.delete(oldAlbumId);
          setAlbums((prev) => prev.filter((a) => a.album_id !== oldAlbumId));
        }
      }

      // Clear pending metadata
      setPendingArtistNames([]);
      setPendingAlbumName(null);
      setPendingAlbumCoverArt(null);
      setPendingSpotifyArtistIds([]);
      setPendingArtistNameToIdMap(new Map());

      navigate("/songs");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update song"));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this song?")) return;
    setDeleting(true);
    try {
      if (!id) return;
      const songId = parseInt(id);
      
      const isCurrentSong = currentTrack?.songId === songId;
      
      await songService.delete(songId);
      
      if (isCurrentSong) {
        stop();
      }
      
      navigate("/songs");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete song"));
      setDeleting(false);
    }
  };

  if (isBandcampSong) {
    return (
      <div style={{ maxWidth: "500px" }}>
        <h1 className="section-title">edit song</h1>
        <div className="error" style={{ marginBottom: "16px" }}>
          Metadata editing is not available for Bandcamp songs. Only uploaded songs can have their metadata edited.
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => navigate("/songs")}
        >
          back to songs
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "600px" }}>
      <h1 className="section-title">edit song</h1>

      {error && (
        <div className="error" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
          <button
            type="button"
            className={searchMode === "spotify" ? "btn btn-primary" : "btn"}
            onClick={() => {
              setSearchMode("spotify");
              setSearchQuery("");
              setSearchResults([]);
              setShowResults(false);
            }}
          >
            search spotify
          </button>
          <button
            type="button"
            className={searchMode === "manual" ? "btn btn-primary" : "btn"}
            onClick={() => {
              setSearchMode("manual");
              setSearchQuery("");
              setSearchResults([]);
              setShowResults(false);
            }}
          >
            enter manually
          </button>
        </div>

        {searchMode === "spotify" && (
          <div className="form-group" style={{ position: "relative" }} ref={searchContainerRef}>
            <label className="form-label">//search spotify</label>
            <input
              type="text"
              className="form-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="type song name or paste Spotify link..."
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
            />
            {searchLoading && (
              <div style={{ marginTop: "8px", color: "var(--text-secondary)" }}>
                searching...
              </div>
            )}
            {showResults && searchResults.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  backgroundColor: "var(--card-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "6px",
                  maxHeight: "400px",
                  overflowY: "auto",
                  marginTop: "4px",
                }}
              >
                {searchResults.map((result, index) => (
                  <div
                    key={index}
                    onClick={() => handleSelectResult(result)}
                    style={{
                      padding: "12px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border-color)",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      backgroundColor: "var(--card-bg)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--button-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--card-bg)";
                    }}
                  >
                    {result.coverArt && (
                      <img
                        src={result.coverArt}
                        alt=""
                        style={{
                          width: "50px",
                          height: "50px",
                          objectFit: "cover",
                          borderRadius: "4px",
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: "bold",
                          color: "var(--text-primary)",
                          marginBottom: "4px",
                        }}
                      >
                        {result.title}
                      </div>
                      <div
                        style={{
                          fontSize: "0.9em",
                          color: "var(--text-secondary)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {result.artist}
                        {result.album && ` • ${result.album}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {searchMode === "manual" && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">//title</label>
              <input
                type="text"
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="song title"
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">//album</label>
                {pendingAlbumName ? (
                  <div style={{ padding: "8px", backgroundColor: "var(--card-bg)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    {pendingAlbumName} (will be created)
                  </div>
                ) : (
                  <select
                    className="form-input"
                    value={albumId}
                    onChange={(e) => {
                      setAlbumId(e.target.value);
                      setPendingAlbumName(null);
                    }}
                  >
                    <option value="">select album</option>
                    {albums.map((a) => (
                      <option key={a.album_id} value={a.album_id}>
                        {a.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">//artist</label>
                {pendingArtistNames.length > 0 ? (
                  <div style={{ padding: "8px", backgroundColor: "var(--card-bg)", borderRadius: "4px", border: "1px solid var(--border-color)" }}>
                    {pendingArtistNames.join(", ")} (will be created)
                  </div>
                ) : (
                  <select
                    className="form-input"
                    value={artistId}
                    onChange={(e) => {
                      setArtistId(e.target.value);
                      setPendingArtistNames([]);
                    }}
                  >
                    <option value="">select artist</option>
                    {artists.map((a) => (
                      <option key={a.artist_id} value={a.artist_id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {coverImage && (
              <div className="form-group">
                <label className="form-label">//cover image</label>
                <img
                  src={coverImage}
                  alt="Cover"
                  style={{
                    width: "150px",
                    height: "150px",
                    objectFit: "cover",
                    borderRadius: "4px",
                    marginTop: "8px",
                  }}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "saving..." : "save changes"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => navigate("/songs")}
              >
                cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "deleting..." : "delete"}
              </button>
            </div>
          </form>
        )}

        {searchMode === "spotify" && (pendingAlbumName || pendingArtistNames.length > 0 || title) && (
          <form onSubmit={handleSubmit} style={{ marginTop: "24px" }}>
            <div style={{ marginBottom: "16px", padding: "16px", backgroundColor: "var(--card-bg)", borderRadius: "6px", border: "1px solid var(--border-color)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                {coverImage && (
                  <img
                    src={coverImage}
                    alt="Cover"
                    style={{
                      width: "120px",
                      height: "120px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {title && (
                    <div style={{ fontSize: "18px", fontWeight: "bold", color: "var(--text-primary)", marginBottom: "8px" }}>
                      {title}
                    </div>
                  )}
                  {pendingArtistNames.length > 0 && (
                    <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      {pendingArtistNames.join(", ")}
                      <span style={{ fontSize: "12px", marginLeft: "4px", color: "var(--text-secondary)" }}>
                        {" "}(will be created)
                      </span>
                    </div>
                  )}
                  {!pendingArtistNames.length && artistId && (
                    <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                      {artists.find(a => a.artist_id?.toString() === artistId)?.name || "Unknown Artist"}
                    </div>
                  )}
                  {pendingAlbumName && (
                    <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      {pendingAlbumName}
                      <span style={{ fontSize: "12px", marginLeft: "4px", color: "var(--text-secondary)" }}>
                        (will be created)
                      </span>
                    </div>
                  )}
                  {!pendingAlbumName && albumId && (
                    <div style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
                      {albums.find(a => a.album_id?.toString() === albumId)?.title || "Unknown Album"}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "saving..." : "save changes"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => navigate("/songs")}
              >
                cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "deleting..." : "delete"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SongEdit;
