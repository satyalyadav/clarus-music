import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { searchAll, SearchResult, getSongUrl, playlistService } from "../services/db";
import { useAudioPlayer } from "../hooks/useAudioPlayer";

const SearchBar: React.FC = () => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const navigate = useNavigate();
  const { playTrack, setQueue } = useAudioPlayer();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true);
      try {
        const searchResults = await searchAll(query);
        setResults(searchResults.slice(0, 12)); // Limit to 12 results
        setShowResults(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error("Search error:", error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => 
        prev < results.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        handleResultClick(results[selectedIndex]);
      } else if (query.trim()) {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        setQuery("");
        setShowResults(false);
      }
    } else if (e.key === "Escape") {
      setShowResults(false);
      inputRef.current?.blur();
    }
  };

  const handleResultClick = async (result: SearchResult) => {
    if (result.type === 'song' && result.song) {
      // Play song
      try {
        const song = result.song;
        const url = await getSongUrl(song);
        playTrack({
          url,
          title: song.title,
          artist: song.artist_name || "",
          album: song.album_title || "",
          cover: song.cover_image || "",
          songId: song.song_id,
        });
      } catch (err) {
        console.error("Error playing song:", err);
        alert(`Failed to play song: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    } else if (result.type === 'playlist' && result.id) {
      // Navigate to playlist
      navigate(`/playlists/${result.id}`);
    } else if (result.type === 'album' && result.id) {
      // Navigate to album
      navigate(`/albums/${result.id}`);
    } else if (result.type === 'artist' && result.id) {
      // Navigate to artist
      navigate(`/artists/${result.id}`);
    } else if (result.type === 'genre' && result.id) {
      // Navigate to genre
      navigate(`/genres/${result.id}`);
    }

    setQuery("");
    setShowResults(false);
    inputRef.current?.blur();
  };

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'song':
        return '🎵';
      case 'album':
        return '💿';
      case 'artist':
        return '🎤';
      case 'genre':
        return '🎹';
      case 'playlist':
        return '🎶';
      default:
        return '';
    }
  };

  const handleViewAll = () => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery("");
      setShowResults(false);
    }
  };

  return (
    <div ref={searchRef} className="search-bar-container">
      <div className="search-bar-form">
        <input
          ref={inputRef}
          type="text"
          className="search-bar-input"
          placeholder="search..."
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) {
              setShowResults(true);
            }
          }}
        />
        {loading && (
          <div className="search-bar-loading">
            <div className="spinner" />
          </div>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="search-results-dropdown">
          {results.map((result, index) => (
            <div
              key={`${result.type}-${result.id}`}
              className={`search-result-item ${
                index === selectedIndex ? "selected" : ""
              }`}
              onClick={() => handleResultClick(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {result.image ? (
                <img
                  src={result.image}
                  alt={result.title}
                  className="search-result-image"
                />
              ) : (
                <div className="search-result-icon">
                  {getResultIcon(result.type)}
                </div>
              )}
              <div className="search-result-content">
                <div className="search-result-title">
                  {result.title}
                  <span className="search-result-type-badge">{result.type}</span>
                </div>
                <div className="search-result-subtitle">
                  {result.subtitle || ''}
                </div>
              </div>
            </div>
          ))}
          {results.length >= 12 && (
            <div className="search-result-view-all" onClick={handleViewAll}>
              View all results for "{query}" →
            </div>
          )}
        </div>
      )}

      {showResults && query.trim() && results.length === 0 && !loading && (
        <div className="search-results-dropdown">
          <div className="search-result-empty">No results found</div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;

