import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

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
      api.get<Album[]>("/albums"),
      api.get<Artist[]>("/artists"),
      api.get<Genre[]>("/genres"),
    ]).then(([albumsRes, artistsRes, genresRes]) => {
      setAlbums(albumsRes.data);
      setArtists(artistsRes.data);
      setGenres(genresRes.data);
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
        const response = await api.get<{ results: SearchResult[] }>(
          `/api/metadata/search?query=${encodeURIComponent(searchQuery)}`
        );
        setSearchResults(response.data.results);
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

    try {
      // Find or create artist
      let artist = artists.find((a) => a.name === result.artist);
      if (!artist && result.artist) {
        const artistRes = await api.post<Artist>("/artists", {
          name: result.artist,
        });
        artist = artistRes.data;
        setArtists([...artists, artist]);
      }
      if (artist) {
        setArtistId(artist.artist_id.toString());
      }

      // Find or create genre
      let genre = genres.find((g) => g.name === result.genre);
      if (!genre && result.genre) {
        const genreRes = await api.post<Genre>("/genres", {
          name: result.genre,
        });
        genre = genreRes.data;
        setGenres([...genres, genre]);
      }
      if (genre) {
        setGenreId(genre.genre_id.toString());
      }

      // Find or create album (requires artist_id)
      if (result.album && artist) {
        let album = albums.find((a) => a.title === result.album);
        if (!album) {
          const albumRes = await api.post<Album>("/albums", {
            title: result.album,
            artist_id: artist.artist_id,
          });
          album = albumRes.data;
          setAlbums([...albums, album]);
        }
        if (album) {
          setAlbumId(album.album_id.toString());
        }
      }
    } catch (err: any) {
      console.error("Error setting metadata:", err);
      setError(err.response?.data?.error || "Failed to set metadata");
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

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("artist_id", artistId);
    formData.append("genre_id", genreId);
    formData.append("duration", duration);
    if (albumId) formData.append("album_id", albumId);
    formData.append("audio", file);

    try {
      await api.post("/songs", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      navigate("/songs");
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create song");
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
          <input
            type="file"
            className="form-input"
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

                      // Format as PostgreSQL interval: HH:MM:SS or MM:SS
                      const durationStr =
                        hours > 0
                          ? `${hours}:${String(minutes).padStart(
                              2,
                              "0"
                            )}:${String(seconds).padStart(2, "0")}`
                          : `${minutes}:${String(seconds).padStart(2, "0")}`;

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
