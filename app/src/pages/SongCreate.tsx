import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  songService, 
  albumService, 
  artistService, 
  genreService 
} from "../services/db";

interface Album {
  album_id: number;
  title: string;
}

interface Artist {
  artist_id: number;
  name: string;
}

interface Genre {
  genre_id: number;
  name: string;
}

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
  const [duration, setDuration] = useState<string>("");
  const [coverImage, setCoverImage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);

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
      setAlbums(albums);
      setArtists(artists);
      setGenres(genres);
    });
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        // Call iTunes API directly from frontend
        const term = encodeURIComponent(searchQuery.trim());
        const url = `https://itunes.apple.com/search?term=${term}&entity=musicTrack&limit=10`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`iTunes API error: ${response.statusText}`);
        }
        const data = await response.json();
        const results: SearchResult[] = (data.results || []).map((item: any) => ({
          title: item.trackName || '',
          album: item.collectionName || '',
          artist: item.artistName || '',
          genre: item.primaryGenreName || '',
          coverArt: item.artworkUrl100 || item.artworkUrl60 || '',
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

    try {
      // Find or create artist
      let artist = artists.find((a) => a.name === result.artist);
      if (!artist && result.artist) {
        const artistId = await artistService.create({
          name: result.artist,
        });
        artist = { artist_id: artistId, name: result.artist };
        setArtists([...artists, artist]);
      }
      if (artist && artist.artist_id) {
        setArtistId(artist.artist_id.toString());
      }

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

      // Find or create album (requires artist_id)
      if (result.album && artist && artist.artist_id) {
        let album = albums.find((a) => a.title === result.album);
        if (!album) {
          const albumId = await albumService.create({
            title: result.album,
            artist_id: artist.artist_id,
          });
          album = { album_id: albumId, title: result.album, artist_id: artist.artist_id };
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
    if (!file) {
      setError("Please select an audio file");
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

    if (!duration) {
      setError(
        "Duration could not be extracted from the audio file. Please try again."
      );
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Read file as Blob
      if (!file) {
        throw new Error("File is required");
      }

      // Store file as Blob in IndexedDB
      const fileBlob = await file.arrayBuffer().then(buf => new Blob([buf], { type: file.type }));

      // Create song in IndexedDB
      await songService.create({
        title: title.trim(),
        artist_id: parseInt(artistId),
        genre_id: parseInt(genreId),
        album_id: albumId ? parseInt(albumId) : null,
        duration: duration,
        file_blob: fileBlob,
        cover_image: coverImage || null,
      });

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
          <div className="file-input-row">
            <label className="btn btn-primary file-input-button">
              choose file
              <input
                type="file"
                accept="audio/*"
                onChange={async (e) => {
                  const selectedFile = e.target.files?.[0] || null;
                  setFile(selectedFile);

                  // Extract duration from audio file
                  if (selectedFile) {
                    try {
                      const audio = new Audio();
                      const objectUrl = URL.createObjectURL(selectedFile);
                      audio.src = objectUrl;

                      await new Promise((resolve, reject) => {
                        audio.addEventListener("loadedmetadata", () => {
                          const durationSeconds = Math.floor(audio.duration);
                          const hours = Math.floor(durationSeconds / 3600);
                          const minutes = Math.floor((durationSeconds % 3600) / 60);
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
                required
              />
            </label>
            <div className="file-input-name">
              {file ? file.name : "no file selected"}
            </div>
          </div>
          {duration && (
            <div style={{ marginTop: "4px", fontSize: "0.9em", color: "#666" }}>
              Duration: {duration}
            </div>
          )}
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
            placeholder="type song name to search..."
            onFocus={() => searchResults.length > 0 && setShowResults(true)}
          />
          {showResults && searchResults.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                backgroundColor: "white",
                border: "1px solid #ccc",
                borderRadius: "4px",
                maxHeight: "300px",
                overflowY: "auto",
                zIndex: 1000,
                marginTop: "4px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              {searchLoading && (
                <div style={{ padding: "12px", textAlign: "center" }}>
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
                      borderBottom: "1px solid #eee",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f5f5f5";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "white";
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
                      <div style={{ fontWeight: "bold" }}>
                        {result.title || "Unknown"}
                      </div>
                      <div style={{ fontSize: "0.9em", color: "#666" }}>
                        {result.artist || "Unknown Artist"}
                        {result.album && ` • ${result.album}`}
                      </div>
                      {result.genre && (
                        <div style={{ fontSize: "0.8em", color: "#999" }}>
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
