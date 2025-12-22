import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  songService,
  albumService,
  artistService,
  genreService,
  songArtistService,
  Album,
  Artist,
  Genre,
} from "../services/db";

interface SearchResult {
  title: string;
  album: string;
  artist: string;
  genre: string;
  coverArt: string;
  raw: any;
}

const SongCreate: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [artistId, setArtistId] = useState("");
  const [genreId, setGenreId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [songUrl, setSongUrl] = useState<string>(""); // For Bandcamp/external URLs
  const [duration, setDuration] = useState<string>("");
  const [coverImage, setCoverImage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [albums, setAlbums] = useState<(Album & { album_id: number })[]>([]);
  const [artists, setArtists] = useState<(Artist & { artist_id: number })[]>(
    []
  );
  const [genres, setGenres] = useState<(Genre & { genre_id: number })[]>([]);
  const [selectedArtistIds, setSelectedArtistIds] = useState<number[]>([]);

  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      albumService.getAll(),
      artistService.getAll(),
      genreService.getAll(),
    ]).then(([albums, artists, genres]) => {
      // Filter out items without IDs since the UI requires them
      setAlbums(
        albums.filter(
          (a): a is Album & { album_id: number } => a.album_id !== undefined
        )
      );
      setArtists(
        artists.filter(
          (a): a is Artist & { artist_id: number } => a.artist_id !== undefined
        )
      );
      setGenres(
        genres.filter(
          (g): g is Genre & { genre_id: number } => g.genre_id !== undefined
        )
      );
    });
  }, []);

  // Check if input is a Bandcamp URL
  const isBandcampUrl = (url: string): boolean => {
    return /bandcamp\.com/.test(url.trim());
  };

  // Extract Bandcamp metadata from backend
  const extractBandcampMetadata = async (
    url: string
  ): Promise<SearchResult | null> => {
    try {
      const response = await fetch(
        `/api/bandcamp-metadata?url=${encodeURIComponent(url)}`
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        throw new Error(
          errorData.error ||
            `Failed to fetch Bandcamp metadata: ${response.statusText}`
        );
      }
      const data = await response.json();

      return {
        title: data.title || "",
        album: data.album || "",
        artist: data.artist || "",
        genre: data.genre || "",
        coverArt: data.coverArt || "",
        raw: {
          ...data,
          url, // Original page URL
          audioUrl: data.audioUrl || null, // Actual audio stream URL (may be null if extraction failed)
          duration: data.duration || null,
        },
      };
    } catch (error: any) {
      console.error("Error extracting Bandcamp metadata:", error);
      throw error;
    }
  };

  // Extract Apple Music track ID from various formats
  const extractAppleMusicTrackId = (query: string): string | null => {
    const trimmed = query.trim();

    // If it's just a numeric ID (8+ digits), use it directly
    if (/^\d{8,}$/.test(trimmed)) {
      return trimmed;
    }

    // Extract from Apple Music song URL: music.apple.com/.../song/.../TRACK_ID
    const songUrlMatch = trimmed.match(
      /music\.apple\.com\/[^/]+\/song\/[^/]+\/(\d{8,})/i
    );
    if (songUrlMatch) {
      return songUrlMatch[1];
    }

    // Extract from album URL with track parameter: .../album/...?i=TRACK_ID
    const albumUrlMatch = trimmed.match(/[?&]i=(\d{8,})/i);
    if (albumUrlMatch) {
      return albumUrlMatch[1];
    }

    // Extract from full Apple Music URL
    const fullUrlMatch = trimmed.match(
      /apple\.com\/[^/]+\/(?:song|album)\/[^/]+\/(\d{8,})/i
    );
    if (fullUrlMatch) {
      return fullUrlMatch[1];
    }

    return null;
  };

  // Split artist names on common separators and normalize
  const splitArtistNames = (raw: string): string[] => {
    if (!raw) return [];
    const cleaned = raw
      .replace(/\s+feat\.?/gi, ",")
      .replace(/\s+featuring/gi, ",");
    return cleaned
      .split(/,|&| x | X |\/|\\/gi)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  // Extract featured artists from title patterns like "Song (feat. X, Y & Z)"
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

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = searchQuery.trim();

    // Check if it's a Bandcamp URL
    if (isBandcampUrl(trimmedQuery)) {
      searchTimeoutRef.current = setTimeout(async () => {
        setSearchLoading(true);
        setError(null);
        try {
          const result = await extractBandcampMetadata(trimmedQuery);
          if (result) {
            setSearchResults([result]);
            setShowResults(true);
          } else {
            setSearchResults([]);
            setError("Could not extract metadata from Bandcamp URL");
          }
        } catch (err: any) {
          console.error("Bandcamp extraction error:", err);
          setError(
            err.message || "Failed to extract metadata from Bandcamp URL"
          );
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      }, 500);
      return;
    }

    // Allow lookup even with just an ID (no minimum length)
    const appleId = extractAppleMusicTrackId(trimmedQuery);
    const isLookup = appleId !== null;

    if (!isLookup && trimmedQuery.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setError(null);
      try {
        let url: string;

        if (isLookup && appleId) {
          // Use lookup API when we detect an Apple Music ID
          url = `https://itunes.apple.com/lookup?id=${appleId}&entity=song&country=us`;
        } else {
          // Use search API for regular text queries
          const term = encodeURIComponent(trimmedQuery);
          url = `https://itunes.apple.com/search?term=${term}&media=music&entity=musicTrack&limit=25&country=us`;
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`iTunes API error: ${response.statusText}`);
        }
        const data = await response.json();

        // Get maximum quality artwork by replacing size in URL
        const getHighQualityArtwork = (url: string | undefined): string => {
          if (!url) return "";
          // Replace size parameters to get maximum quality (1200x1200)
          // iTunes URLs format: .../source/100x100bb.jpg or .../source/60x60bb.png
          return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/1200x1200bb.$1");
        };

        const results: SearchResult[] = (data.results || [])
          .filter(
            (item: any) => item.kind === "song" || item.wrapperType === "track"
          )
          .map((item: any) => ({
            title: item.trackName || "",
            album: item.collectionName || "",
            artist: item.artistName || "",
            genre: item.primaryGenreName || "",
            coverArt:
              getHighQualityArtwork(item.artworkUrl100) ||
              getHighQualityArtwork(item.artworkUrl60) ||
              "",
            raw: item,
          }));

        setSearchResults(results);
        setShowResults(true);
      } catch (err: any) {
        console.error("Search error:", err);
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
  }, [searchQuery]);

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

    // If this is a Bandcamp result, store the audio stream URL (prefer audioUrl over page URL)
    if (result.raw?.url && isBandcampUrl(result.raw.url)) {
      // Use audioUrl if available (actual stream URL), otherwise we can't play it
      const audioStreamUrl = result.raw.audioUrl;

      // Validate that we got a REAL audio URL (should be from bcbits.com CDN or contain .mp3/.ogg/.flac)
      const isValidAudioUrl =
        audioStreamUrl &&
        (audioStreamUrl.includes("bcbits.com") ||
          audioStreamUrl.includes(".mp3") ||
          audioStreamUrl.includes(".ogg") ||
          audioStreamUrl.includes(".flac"));

      if (isValidAudioUrl) {
        setSongUrl(audioStreamUrl);
        setFile(null); // Clear file when URL is set
        if (import.meta.env.DEV) {
          console.log("Stored valid Bandcamp audio URL:", audioStreamUrl);
        }
      } else {
        // If we couldn't extract a valid audio URL, show an error
        setError(
          "Could not extract audio stream URL from Bandcamp. Unfortunately, this track may not be available for streaming. Please try uploading an audio file instead."
        );
        setSongUrl(""); // Don't store invalid URL
        if (import.meta.env.DEV) {
          console.warn(
            "Failed to extract valid audio URL from Bandcamp page. Got:",
            audioStreamUrl,
            "Page URL:",
            result.raw.url
          );
        }
      }

      // Set duration if available from Bandcamp metadata
      if (result.raw.duration) {
        setDuration(result.raw.duration);
        if (import.meta.env.DEV) {
          console.log("Extracted duration:", result.raw.duration);
        }
      }
    } else {
      setSongUrl(""); // Clear URL for non-Bandcamp results
    }

    try {
      // Parse all artist names (main + featured)
      const mainArtistNames = splitArtistNames(result.artist || "");
      const featuredFromTitle = extractFeaturedFromTitle(result.title || "");
      const allNames = Array.from(
        new Set([...mainArtistNames, ...featuredFromTitle])
      );

      // Fallback: if parsing failed, use raw artist string as single artist
      const effectiveNames =
        allNames.length > 0 && mainArtistNames.length > 0
          ? allNames
          : result.artist
          ? [result.artist]
          : [];

      let primaryArtistId: number | null = null;
      const allArtistIds: number[] = [];

      for (const name of effectiveNames) {
        let artist = artists.find((a) => a.name === name);
        if (!artist) {
          const newId = await artistService.create({ name });
          artist = { artist_id: newId, name };
          setArtists((prev) => [...prev, artist!]);
        }
        if (artist.artist_id != null) {
          allArtistIds.push(artist.artist_id);
          if (primaryArtistId == null) {
            primaryArtistId = artist.artist_id;
          }
        }
      }

      if (primaryArtistId != null) {
        setArtistId(primaryArtistId.toString());
      }
      setSelectedArtistIds(allArtistIds);

      // Find or create genre
      let genre = genres.find((g) => g.name === result.genre);
      if (!genre && result.genre) {
        const genreId = await genreService.create({
          name: result.genre,
        });
        genre = { genre_id: genreId, name: result.genre };
        setGenres([...genres, genre]);
      }
      if (genre && genre.genre_id) {
        setGenreId(genre.genre_id.toString());
      }

      // Find or create album (requires primary artist_id)
      if (result.album && primaryArtistId != null) {
        let album = albums.find((a) => a.title === result.album);
        if (!album) {
          const albumId = await albumService.create({
            title: result.album,
            artist_id: primaryArtistId,
          });
          album = {
            album_id: albumId,
            title: result.album,
            artist_id: primaryArtistId,
          };
          setAlbums([...albums, album]);
        }
        if (album && album.album_id) {
          setAlbumId(album.album_id.toString());
        }
      }
    } catch (err: any) {
      console.error("Error setting metadata:", err);
      setError(err.message || "Failed to set metadata");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Require either file or URL
    if (!file && !songUrl) {
      setError("Please select an audio file or provide a Bandcamp URL");
      return;
    }

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (!artistId) {
      setError("Artist is required");
      return;
    }

    if (!genreId) {
      setError("Genre is required");
      return;
    }

    // Duration is only required for file uploads
    // For URL-based songs, try to get it from metadata or set a default
    let finalDuration = duration;
    if (!finalDuration && songUrl) {
      // Try to get duration from search result if available
      const bandcampResult = searchResults.find(
        (r) => r.raw?.audioUrl === songUrl || r.raw?.url
      );
      if (bandcampResult?.raw?.duration) {
        finalDuration = bandcampResult.raw.duration;
      } else {
        // Set a default duration for URL-based songs (can be updated later)
        finalDuration = "00:00:00";
      }
    } else if (!finalDuration && file) {
      setError(
        "Duration could not be extracted from the audio file. Please try again."
      );
      return;
    }

    setError(null);
    setLoading(true);

    try {
      let fileBlob: Blob | undefined = undefined;

      // Read file as Blob if file is provided
      if (file) {
        fileBlob = await file
          .arrayBuffer()
          .then((buf) => new Blob([buf], { type: file.type }));
      }

      // Create song in IndexedDB
      const newSongId = await songService.create({
        title: title.trim(),
        artist_id: parseInt(artistId),
        genre_id: parseInt(genreId),
        album_id: albumId ? parseInt(albumId) : null,
        duration: finalDuration,
        file_blob: fileBlob,
        url: songUrl || null,
        cover_image: coverImage || null,
      });

      // Associate all detected artists with this song (many-to-many)
      const primaryId = parseInt(artistId);
      const allIds =
        selectedArtistIds.length > 0
          ? Array.from(new Set([primaryId, ...selectedArtistIds]))
          : [primaryId];
      await songArtistService.setArtistsForSong(newSongId, allIds);

      navigate("/songs");
    } catch (err: any) {
      setError(err.message || "Failed to create song");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "500px" }}>
      <h1 className="section-title">add song</h1>

      {error && (
        <div className="error" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">//audio file</label>
          {songUrl ? (
            <div
              style={{
                padding: "12px",
                backgroundColor: "var(--card-bg)",
                borderRadius: "4px",
                border: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  fontSize: "0.9em",
                  color: "var(--text-secondary)",
                }}
              >
                Using Bandcamp stream
              </div>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setSongUrl("");
                  setFile(null);
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <>
              <div className="file-input-row">
                <label className="btn btn-primary file-input-button">
                  choose file
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={async (e) => {
                      const selectedFile = e.target.files?.[0] || null;
                      setFile(selectedFile);

                      // Clear URL when file is selected
                      if (selectedFile) {
                        setSongUrl("");
                      }

                      // Extract duration from audio file
                      if (selectedFile) {
                        try {
                          const audio = new Audio();
                          const objectUrl = URL.createObjectURL(selectedFile);
                          audio.src = objectUrl;

                          await new Promise((resolve, reject) => {
                            audio.addEventListener("loadedmetadata", () => {
                              const durationSeconds = Math.floor(
                                audio.duration
                              );
                              const hours = Math.floor(durationSeconds / 3600);
                              const minutes = Math.floor(
                                (durationSeconds % 3600) / 60
                              );
                              const seconds = durationSeconds % 60;

                              // Format as PostgreSQL interval: Always use HH:MM:SS format to avoid ambiguity
                              // PostgreSQL interprets MM:SS as hours:minutes, so we use 00:MM:SS for songs under 1 hour
                              const durationStr = `${String(hours).padStart(
                                2,
                                "0"
                              )}:${String(minutes).padStart(2, "0")}:${String(
                                seconds
                              ).padStart(2, "0")}`;

                              setDuration(durationStr);
                              URL.revokeObjectURL(objectUrl);
                              resolve(null);
                            });
                            audio.addEventListener("error", reject);
                          });
                        } catch (err) {
                          console.error("Error extracting duration:", err);
                          setDuration("");
                          setError(
                            "Failed to extract duration from audio file. Please try another file."
                          );
                        }
                      } else {
                        setDuration("");
                      }
                    }}
                  />
                </label>
                <div className="file-input-name">
                  {file ? file.name : "no file selected"}
                </div>
              </div>
              {duration && (
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "0.9em",
                    color: "var(--text-muted)",
                  }}
                >
                  Duration: {duration}
                </div>
              )}
            </>
          )}
          <div
            style={{
              marginTop: "8px",
              fontSize: "0.85em",
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            {songUrl ? "" : "Or paste a Bandcamp URL in the search field above"}
          </div>
        </div>

        <div
          className="form-group"
          ref={searchContainerRef}
          style={{ position: "relative" }}
        >
          <label className="form-label">//search song</label>
          <input
            type="text"
            className="form-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="type song name or paste Apple Music / Bandcamp link..."
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
          />
          <div
            style={{
              marginTop: "4px",
              fontSize: "0.85em",
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            Tip: If search doesn't find it, paste the Apple Music link or track
            ID
          </div>
          {showResults && searchResults.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                backgroundColor: "var(--card-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "4px",
                maxHeight: "300px",
                overflowY: "auto",
                zIndex: 1000,
                marginTop: "4px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              {searchLoading && (
                <div
                  style={{
                    padding: "12px",
                    textAlign: "center",
                    color: "var(--text-primary)",
                  }}
                >
                  searching...
                </div>
              )}
              {!searchLoading &&
                searchResults.map((result, index) => (
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
                      e.currentTarget.style.backgroundColor =
                        "var(--button-hover)";
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
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: "bold",
                          color: "var(--text-primary)",
                        }}
                      >
                        {result.title || "Unknown"}
                      </div>
                      <div
                        style={{
                          fontSize: "0.9em",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {result.artist || "Unknown Artist"}
                        {result.album && ` • ${result.album}`}
                      </div>
                      {result.genre && (
                        <div
                          style={{
                            fontSize: "0.8em",
                            color: "var(--text-muted)",
                          }}
                        >
                          {result.genre}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">//title</label>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {coverImage && (
              <img
                src={coverImage}
                alt="Cover"
                style={{
                  width: "60px",
                  height: "60px",
                  objectFit: "cover",
                  borderRadius: "4px",
                  flexShrink: 0,
                }}
              />
            )}
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="song title"
              required
              style={{ flex: 1 }}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">//album</label>
            <select
              className="form-input"
              value={albumId}
              onChange={(e) => setAlbumId(e.target.value)}
            >
              <option value="">select album</option>
              {albums.map((a) => (
                <option key={a.album_id} value={a.album_id}>
                  {a.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">//artist</label>
            <select
              className="form-input"
              value={artistId}
              onChange={(e) => setArtistId(e.target.value)}
            >
              <option value="">select artist</option>
              {artists.map((a) => (
                <option key={a.artist_id} value={a.artist_id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">//genre</label>
          <select
            className="form-input"
            value={genreId}
            onChange={(e) => setGenreId(e.target.value)}
          >
            <option value="">select genre</option>
            {genres.map((g) => (
              <option key={g.genre_id} value={g.genre_id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "uploading..." : "create song"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => navigate("/songs")}
          >
            cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default SongCreate;
