import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  songService,
  albumService,
  artistService,
  songArtistService,
  Album,
  Artist,
} from "../services/db";

interface SearchResult {
  title: string;
  album: string;
  artist: string;
  artistImage?: string;
  coverArt: string;
  raw: any;
}

interface AlbumTrack {
  title: string;
  duration: string;
  audioUrl: string;
  trackNumber: number;
}

interface AlbumResult {
  type: "album";
  album: string;
  artist: string;
  artistImage?: string;
  coverArt: string;
  tracks: AlbumTrack[];
  pageUrl: string;
}

type AddMode = "upload" | "bandcamp";

const SongCreate: React.FC = () => {
  const navigate = useNavigate();
  const [addMode, setAddMode] = useState<AddMode>("upload"); // Default to upload
  const [title, setTitle] = useState("");
  const [albumId, setAlbumId] = useState("");
  const [artistId, setArtistId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [songUrl, setSongUrl] = useState<string>(""); // For Bandcamp/external URLs
  const [bandcampPageUrl, setBandcampPageUrl] = useState<string>(""); // Original Bandcamp page URL for refreshing expired URLs
  const [duration, setDuration] = useState<string>("");
  const [coverImage, setCoverImage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [albums, setAlbums] = useState<(Album & { album_id: number })[]>([]);
  const [artists, setArtists] = useState<(Artist & { artist_id: number })[]>(
    []
  );
  const [selectedArtistIds, setSelectedArtistIds] = useState<number[]>([]);

  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Album selection state
  const [albumResult, setAlbumResult] = useState<AlbumResult | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());
  const [showAlbumSelection, setShowAlbumSelection] = useState(false);

  useEffect(() => {
    Promise.all([
      albumService.getAll(),
      artistService.getAll(),
    ]).then(([albums, artists]) => {
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

      // If it's an album, return null and handle separately
      if (data.type === "album") {
        return null; // Will be handled by album selection UI
      }

      // For single tracks, return the normal structure
      return {
        title: data.title || "",
        album: data.album || "",
        artist: data.artist || "",
        artistImage: data.artistImage || undefined,
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

  // Extract Spotify track ID from various formats
  const extractSpotifyTrackId = (query: string): string | null => {
    const trimmed = query.trim();

    // Extract from Spotify track URL: open.spotify.com/track/TRACK_ID
    const trackUrlMatch = trimmed.match(
      /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i
    );
    if (trackUrlMatch) {
      return trackUrlMatch[1];
    }

    // Extract from Spotify URI: spotify:track:TRACK_ID
    const uriMatch = trimmed.match(/spotify:track:([a-zA-Z0-9]+)/i);
    if (uriMatch) {
      return uriMatch[1];
    }

    // If it's just an alphanumeric ID (Spotify IDs are typically 22 chars)
    if (/^[a-zA-Z0-9]{22}$/.test(trimmed)) {
      return trimmed;
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

  // Validate and fetch a reliable artist image from Spotify
  const validateAndGetArtistImage = async (
    artistId: string
  ): Promise<string | null> => {
    try {
      const response = await fetch(`/api/spotify-artist/${artistId}`);
      if (!response.ok) {
        console.warn(
          `Failed to fetch artist ${artistId} from Spotify: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const artistData = await response.json();

      if (Array.isArray(artistData.images) && artistData.images.length > 0) {
        // Spotify typically returns largest image first
        const imageUrl = artistData.images[0].url;

        try {
          // Optional: basic validation that URL responds
          const headResponse = await fetch(imageUrl, { method: "HEAD" });
          if (headResponse.ok) {
            return imageUrl;
          }
        } catch (e) {
          // If HEAD fails (CORS, etc.), still return URL
          console.warn("Artist image HEAD validation failed:", e);
        }

        return imageUrl;
      }

      return null;
    } catch (error) {
      console.error("Error validating artist image from Spotify:", error);
      return null;
    }
  };

  // Debounced search - different behavior for upload vs bandcamp mode
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = searchQuery.trim();

    // Bandcamp mode: only process Bandcamp URLs
    if (addMode === "bandcamp") {
      if (!isBandcampUrl(trimmedQuery)) {
        setSearchResults([]);
        setShowResults(false);
        if (trimmedQuery.length > 0) {
          setError("Please enter a valid Bandcamp URL");
        } else {
          setError(null);
        }
        return;
      }
    }

    // Upload mode: skip if empty or if it's a Bandcamp URL (should use Bandcamp mode for that)
    if (addMode === "upload") {
      if (trimmedQuery.length === 0) {
        setSearchResults([]);
        setShowResults(false);
        setError(null);
        return;
      }
      // If user enters Bandcamp URL in upload mode, suggest switching
      if (isBandcampUrl(trimmedQuery)) {
        setSearchResults([]);
        setShowResults(false);
        setError("Please switch to Bandcamp mode for Bandcamp URLs");
        return;
      }
    }

    // Process search based on mode
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setError(null);
      
      try {
        if (addMode === "bandcamp") {
          // Bandcamp mode: extract metadata from Bandcamp URL
          const result = await extractBandcampMetadata(trimmedQuery);
          if (result === null) {
            // It's an album - fetch the album data separately
            const response = await fetch(
              `/api/bandcamp-metadata?url=${encodeURIComponent(trimmedQuery)}`
            );
            if (!response.ok) {
              throw new Error("Failed to fetch album data");
            }
            const albumData: AlbumResult = await response.json();
            if (albumData.type === "album" && albumData.tracks.length > 0) {
              setAlbumResult(albumData);
              setSelectedTracks(new Set(albumData.tracks.map((_, i) => i))); // Select all by default
              setShowAlbumSelection(true);
              setSearchResults([]);
              setShowResults(false);
            } else {
              setSearchResults([]);
              setError("Could not extract album data from Bandcamp URL");
            }
          } else if (result) {
            setSearchResults([result]);
            setShowResults(true);
            setAlbumResult(null);
            setShowAlbumSelection(false);
          } else {
            setSearchResults([]);
            setError("Could not extract metadata from Bandcamp URL");
          }
        } else if (addMode === "upload") {
          // Upload mode: search Spotify
          const spotifyId = extractSpotifyTrackId(trimmedQuery);
          const isLookup = spotifyId !== null;

          if (!isLookup && trimmedQuery.length < 2) {
            setSearchResults([]);
            setShowResults(false);
            return;
          }

          let spotifyData: any;

          if (isLookup && spotifyId) {
            // Use track lookup API when we detect a Spotify ID
            const response = await fetch(`/api/spotify-track/${spotifyId}`);
            if (!response.ok) {
              throw new Error(`Spotify API error: ${response.statusText}`);
            }
            const track = await response.json();
            // Normalize to search results shape
            spotifyData = { tracks: { items: [track] } };
          } else {
            // Use search API for regular text queries
            const term = encodeURIComponent(trimmedQuery);
            const response = await fetch(
              `/api/spotify-search?q=${term}&type=track&limit=25`
            );
            if (!response.ok) {
              throw new Error(`Spotify API error: ${response.statusText}`);
            }
            spotifyData = await response.json();
          }

          const results: SearchResult[] = (spotifyData.tracks?.items || []).map(
            (item: any) => {
              // Spotify album images array, usually sorted largest -> smallest
              let albumArt = "";
              if (item.album?.images?.length > 0) {
                albumArt = item.album.images[0].url;
              }

              const artistNames =
                item.artists?.map((a: any) => a.name).join(", ") || "";

              // Create a map of artist name -> Spotify ID for reliable matching
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
                  // Keep artist IDs for later image validation
                  artistIds: Array.isArray(item.artists)
                    ? item.artists.map((a: any) => a.id).filter(Boolean)
                    : [],
                  // Map artist names to Spotify IDs for reliable matching
                  artistNameToIdMap: artistNameToIdMap,
                },
              };
            }
          );

          setSearchResults(results);
          setShowResults(true);
        }
      } catch (err: any) {
        console.error("Search error:", err);
        setError(
          err.message || 
          (addMode === "bandcamp" 
            ? "Failed to extract metadata from Bandcamp URL"
            : "Failed to search Spotify")
        );
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
  }, [searchQuery, addMode]);


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
        // Store the original page URL (prefer pageUrl from backend, fallback to url)
        const pageUrl = result.raw.pageUrl || result.raw.url;
        setBandcampPageUrl(pageUrl);
        setFile(null); // Clear file when URL is set
        if (import.meta.env.DEV) {
          console.log("Stored valid Bandcamp audio URL:", audioStreamUrl);
          console.log("Stored Bandcamp page URL:", pageUrl);
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
      setBandcampPageUrl(""); // Clear page URL for non-Bandcamp results
    }

    try {
      // For Bandcamp results, try to use artist name as-is first (Bandcamp is source of truth)
      // Only split if there are clear indicators of multiple artists (like "feat." in title)
      const isBandcampResult =
        result.raw?.url && isBandcampUrl(result.raw.url);
      const hasFeaturedInTitle = /\(feat\.|\(featuring/i.test(result.title || "");
      
      let effectiveNames: string[] = [];
      
      if (isBandcampResult && !hasFeaturedInTitle) {
        // For Bandcamp without featured artists in title, use artist name as-is
        if (result.artist) {
          effectiveNames = [result.artist];
        }
      } else {
        // For non-Bandcamp (Spotify) or when there are featured artists, parse artist names
        const mainArtistNames = splitArtistNames(result.artist || "");
        const featuredFromTitle = extractFeaturedFromTitle(result.title || "");
        const allNames = Array.from(
          new Set([...mainArtistNames, ...featuredFromTitle])
        );

        // Fallback: if parsing failed, use raw artist string as single artist
        effectiveNames =
          allNames.length > 0 && mainArtistNames.length > 0
            ? allNames
            : result.artist
            ? [result.artist]
            : [];
        
        if (import.meta.env.DEV) {
          console.log("Parsed artists from Spotify result:", {
            rawArtist: result.artist,
            mainArtistNames,
            featuredFromTitle,
            effectiveNames,
          });
        }
      }

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

      if (import.meta.env.DEV) {
        console.log("Created/found artists:", {
          effectiveNames,
          allArtistIds,
          primaryArtistId,
        });
      }

      if (primaryArtistId != null) {
        setArtistId(primaryArtistId.toString());
        // Update artist images using Spotify validation if we have Spotify artist IDs
        const spotifyArtistIds: string[] =
          (result.raw && Array.isArray(result.raw.artistIds)
            ? result.raw.artistIds
            : []) || [];

        if (spotifyArtistIds.length > 0) {
          // Validate and update images for ALL artists, not just the primary one
          // Match artists by name using the artistNameToIdMap for reliable matching
          const artistNameToIdMap: Map<string, string> =
            result.raw?.artistNameToIdMap || new Map();

          const imageUpdatePromises = effectiveNames.map(async (artistName, index) => {
            const dbArtistId = allArtistIds[index];
            if (!dbArtistId) return;

            // Try to find Spotify ID by artist name (most reliable)
            let spotifyArtistId: string | undefined = artistNameToIdMap.get(artistName);
            
            // Fallback to index-based matching if name lookup fails
            if (!spotifyArtistId && index < spotifyArtistIds.length) {
              spotifyArtistId = spotifyArtistIds[index];
            }

            if (spotifyArtistId) {
              try {
                const validatedImageUrl = await validateAndGetArtistImage(spotifyArtistId);
                if (validatedImageUrl) {
                  await artistService.update(dbArtistId, {
                    image_url: validatedImageUrl,
                  });
                  // Update local state
                  setArtists((prev) =>
                    prev.map((a) =>
                      a.artist_id === dbArtistId
                        ? { ...a, image_url: validatedImageUrl }
                        : a
                    )
                  );
                }
              } catch (err) {
                console.error(`Error updating artist image from Spotify for "${artistName}":`, err);
                // Don't fail the whole operation if image validation fails
              }
            }
          });

          // Wait for all image updates to complete (but don't block on errors)
          await Promise.allSettled(imageUpdatePromises);
        } else if (result.artistImage && isBandcampResult) {
          // Fallback: if no Spotify IDs, still use Bandcamp image when available
          try {
            await artistService.update(primaryArtistId, {
              image_url: result.artistImage,
            });
            setArtists((prev) =>
              prev.map((a) =>
                a.artist_id === primaryArtistId
                  ? { ...a, image_url: result.artistImage }
                  : a
              )
            );
          } catch (err) {
            console.error("Error updating artist image from Bandcamp:", err);
          }
        }
      }
      setSelectedArtistIds(allArtistIds);

      // Find or create album (requires primary artist_id)
      if (result.album && primaryArtistId != null) {
        let album = albums.find((a) => a.title === result.album);
        if (!album) {
          const albumId = await albumService.create({
            title: result.album,
            artist_id: primaryArtistId,
            cover_image: result.coverArt || null, // Include cover image from search result
          });
          album = {
            album_id: albumId,
            title: result.album,
            artist_id: primaryArtistId,
            cover_image: result.coverArt || null,
          };
          setAlbums([...albums, album]);
        } else {
          // Update album cover image if it's missing but we have one from the search result
          if (!album.cover_image && result.coverArt) {
            try {
              await albumService.update(album.album_id!, {
                cover_image: result.coverArt,
              });
              // Update local state
              setAlbums((prev) =>
                prev.map((a) =>
                  a.album_id === album.album_id
                    ? { ...a, cover_image: result.coverArt }
                    : a
                )
              );
            } catch (err) {
              console.error("Error updating album cover image:", err);
            }
          }
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
        album_id: albumId ? parseInt(albumId) : null,
        duration: finalDuration,
        file_blob: fileBlob,
        url: songUrl || null,
        bandcamp_page_url: bandcampPageUrl || null,
        cover_image: coverImage || null,
      });

      // Associate all detected artists with this song (many-to-many)
      const primaryId = parseInt(artistId);
      // Ensure we include all artists from selectedArtistIds, plus the primary artist
      const allIds = Array.from(
        new Set([primaryId, ...selectedArtistIds])
      );
      
      if (import.meta.env.DEV) {
        console.log("Associating song with artists:", {
          songId: newSongId,
          primaryArtistId: primaryId,
          allArtistIds: allIds,
          selectedArtistIds: selectedArtistIds,
        });
      }
      
      await songArtistService.setArtistsForSong(newSongId, allIds);

      navigate("/songs");
    } catch (err: any) {
      setError(err.message || "Failed to create song");
    } finally {
      setLoading(false);
    }
  };

  // Handle adding selected album tracks
  const handleAddAlbumTracks = async () => {
    if (!albumResult || selectedTracks.size === 0) {
      setError("Please select at least one track with a valid audio URL");
      return;
    }
    
    // Filter out tracks without valid audio URLs from selection
    const validSelectedTracks = Array.from(selectedTracks).filter((index) => {
      const track = albumResult.tracks[index];
      if (!track) return false;
      const isValidAudioUrl =
        track.audioUrl &&
        (track.audioUrl.includes("bcbits.com") ||
          track.audioUrl.includes(".mp3") ||
          track.audioUrl.includes(".ogg") ||
          track.audioUrl.includes(".flac"));
      return isValidAudioUrl;
    });
    
    if (validSelectedTracks.length === 0) {
      setError("No tracks with valid audio URLs selected. Please select tracks that have audio available.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // For Bandcamp albums, use artist name as-is (Bandcamp is source of truth)
      // Albums are always from Bandcamp when using this handler, so don't split
      const allNames = albumResult.artist ? [albumResult.artist] : [];

      let primaryArtistId: number | null = null;
      const allArtistIds: number[] = [];

      for (const name of allNames) {
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

      if (primaryArtistId == null) {
        throw new Error("Could not create or find artist");
      }

      // Update artist image if Bandcamp provided one
      if (albumResult.artistImage) {
        try {
          await artistService.update(primaryArtistId, {
            image_url: albumResult.artistImage,
          });
          // Update local state
          setArtists((prev) =>
            prev.map((a) =>
              a.artist_id === primaryArtistId
                ? { ...a, image_url: albumResult.artistImage }
                : a
            )
          );
        } catch (err) {
          console.error("Error updating artist image:", err);
          // Don't fail the whole operation if image update fails
        }
      }

      // Find or create album
      let album = albums.find((a) => a.title === albumResult.album);
      if (!album && albumResult.album) {
        const albumId = await albumService.create({
          title: albumResult.album,
          artist_id: primaryArtistId,
        });
        album = {
          album_id: albumId,
          title: albumResult.album,
          artist_id: primaryArtistId,
        };
        setAlbums([...albums, album]);
      }

      // Create songs for selected tracks (only valid ones)
      const selectedTrackIndices = validSelectedTracks.sort();
      let successCount = 0;
      let errorCount = 0;

      for (const trackIndex of selectedTrackIndices) {
        const track = albumResult.tracks[trackIndex];
        if (!track) continue;

        try {
          const isValidAudioUrl =
            track.audioUrl &&
            (track.audioUrl.includes("bcbits.com") ||
              track.audioUrl.includes(".mp3") ||
              track.audioUrl.includes(".ogg") ||
              track.audioUrl.includes(".flac"));

          if (!isValidAudioUrl) {
            console.warn(`Skipping track "${track.title}" - no valid audio URL`);
            errorCount++;
            // Don't continue silently - show which tracks failed
            continue;
          }

          const newSongId = await songService.create({
            title: track.title || "",
            artist_id: primaryArtistId,
            album_id: album?.album_id || null,
            duration: track.duration || "00:00:00",
            url: track.audioUrl,
            bandcamp_page_url: albumResult.pageUrl || null,
            cover_image: albumResult.coverArt || null,
          });

          // Associate all artists with this song
          await songArtistService.setArtistsForSong(newSongId, allArtistIds);
          successCount++;
        } catch (err: any) {
          console.error(`Failed to create song "${track.title}":`, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        if (errorCount > 0) {
          setError(
            `Added ${successCount} track(s) successfully. ${errorCount} track(s) could not be added (no valid audio URL found).`
          );
          // Still navigate but show the error
          setTimeout(() => navigate("/songs"), 2000);
        } else {
          navigate("/songs");
        }
      } else {
        setError(
          `Failed to add tracks. ${errorCount > 0 ? `${errorCount} track(s) had errors - some tracks may not have valid audio URLs available from Bandcamp.` : ""}`
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to add album tracks");
    } finally {
      setLoading(false);
    }
  };

  // Toggle track selection
  const toggleTrackSelection = (index: number) => {
    setSelectedTracks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // Select/deselect all tracks (only tracks with valid audio URLs)
  const toggleSelectAll = () => {
    if (!albumResult) return;
    
    // Get all valid track indices
    const validTrackIndices = albumResult.tracks
      .map((track, index) => {
        const isValidAudioUrl =
          track.audioUrl &&
          (track.audioUrl.includes("bcbits.com") ||
            track.audioUrl.includes(".mp3") ||
            track.audioUrl.includes(".ogg") ||
            track.audioUrl.includes(".flac"));
        return isValidAudioUrl ? index : null;
      })
      .filter((index): index is number => index !== null);
    
    const validSelectedCount = Array.from(selectedTracks).filter((index) =>
      validTrackIndices.includes(index)
    ).length;
    
    if (validSelectedCount === validTrackIndices.length) {
      // Deselect all
      setSelectedTracks(new Set());
    } else {
      // Select all valid tracks
      setSelectedTracks(new Set(validTrackIndices));
    }
  };

  // If showing album selection, render that instead
  if (showAlbumSelection && albumResult) {
    return (
      <div style={{ maxWidth: "600px" }}>
        <h1 className="section-title">add album</h1>

        {error && (
          <div className="error" style={{ marginBottom: "16px" }}>
            {error}
          </div>
        )}

        <div
          style={{
            padding: "16px",
            backgroundColor: "var(--card-bg)",
            borderRadius: "4px",
            border: "1px solid var(--border-color)",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
            {albumResult.coverArt && (
              <img
                src={albumResult.coverArt}
                alt={albumResult.album}
                style={{
                  width: "120px",
                  height: "120px",
                  objectFit: "cover",
                  borderRadius: "4px",
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1 }}>
              <h2 style={{ margin: "0 0 8px 0", color: "var(--text-primary)" }}>
                {albumResult.album}
              </h2>
              <div style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>
                {albumResult.artist}
              </div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85em",
                  marginTop: "8px",
                }}
              >
                {albumResult.tracks.length} track{albumResult.tracks.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginBottom: "16px",
              paddingBottom: "16px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <button
              type="button"
              className="btn btn-small"
              onClick={toggleSelectAll}
            >
              {(() => {
                const validTrackIndices = albumResult.tracks
                  .map((track, index) => {
                    const isValidAudioUrl =
                      track.audioUrl &&
                      (track.audioUrl.includes("bcbits.com") ||
                        track.audioUrl.includes(".mp3") ||
                        track.audioUrl.includes(".ogg") ||
                        track.audioUrl.includes(".flac"));
                    return isValidAudioUrl ? index : null;
                  })
                  .filter((index): index is number => index !== null);
                const validSelectedCount = Array.from(selectedTracks).filter((index) =>
                  validTrackIndices.includes(index)
                ).length;
                return validSelectedCount === validTrackIndices.length
                  ? "Deselect All"
                  : "Select All";
              })()}
            </button>
            <div
              style={{
                flex: 1,
                textAlign: "right",
                lineHeight: "32px",
                color: "var(--text-secondary)",
                fontSize: "0.9em",
              }}
            >
              {(() => {
                const validTrackCount = albumResult.tracks.filter((track) => {
                  const isValidAudioUrl =
                    track.audioUrl &&
                    (track.audioUrl.includes("bcbits.com") ||
                      track.audioUrl.includes(".mp3") ||
                      track.audioUrl.includes(".ogg") ||
                      track.audioUrl.includes(".flac"));
                  return isValidAudioUrl;
                }).length;
                const validSelectedCount = Array.from(selectedTracks).filter((index) => {
                  const track = albumResult.tracks[index];
                  if (!track) return false;
                  const isValidAudioUrl =
                    track.audioUrl &&
                    (track.audioUrl.includes("bcbits.com") ||
                      track.audioUrl.includes(".mp3") ||
                      track.audioUrl.includes(".ogg") ||
                      track.audioUrl.includes(".flac"));
                  return isValidAudioUrl;
                }).length;
                return `${validSelectedCount} of ${validTrackCount} available selected`;
              })()}
            </div>
          </div>

          <div
            style={{
              maxHeight: "400px",
              overflowY: "auto",
              marginBottom: "16px",
            }}
          >
            {albumResult.tracks.map((track, index) => {
              const isValidAudioUrl =
                track.audioUrl &&
                (track.audioUrl.includes("bcbits.com") ||
                  track.audioUrl.includes(".mp3") ||
                  track.audioUrl.includes(".ogg") ||
                  track.audioUrl.includes(".flac"));
              
              return (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px",
                    borderRadius: "4px",
                    backgroundColor: selectedTracks.has(index)
                      ? "var(--button-hover)"
                      : "transparent",
                    cursor: isValidAudioUrl ? "pointer" : "not-allowed",
                    marginBottom: "4px",
                    opacity: isValidAudioUrl ? 1 : 0.6,
                  }}
                  onClick={() => isValidAudioUrl && toggleTrackSelection(index)}
                  onMouseEnter={(e) => {
                    if (isValidAudioUrl && !selectedTracks.has(index)) {
                      e.currentTarget.style.backgroundColor = "var(--card-bg)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (isValidAudioUrl && !selectedTracks.has(index)) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTracks.has(index)}
                    onChange={() => isValidAudioUrl && toggleTrackSelection(index)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={!isValidAudioUrl}
                    style={{ cursor: isValidAudioUrl ? "pointer" : "not-allowed" }}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: selectedTracks.has(index) ? "bold" : "normal",
                        color: isValidAudioUrl ? "var(--text-primary)" : "var(--text-muted)",
                        marginBottom: "4px",
                      }}
                    >
                      {track.trackNumber}. {track.title || `Track ${track.trackNumber}`}
                      {!isValidAudioUrl && (
                        <span
                          style={{
                            fontSize: "0.85em",
                            color: "var(--error-color, #dc3545)",
                            marginLeft: "8px",
                          }}
                        >
                          (no audio URL)
                        </span>
                      )}
                    </div>
                    {track.duration && (
                      <div
                        style={{
                          fontSize: "0.85em",
                          color: "var(--text-muted)",
                        }}
                      >
                        {track.duration}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddAlbumTracks}
              disabled={loading || selectedTracks.size === 0}
            >
              {loading
                ? "Adding..."
                : `Add ${selectedTracks.size} Track${selectedTracks.size !== 1 ? "s" : ""}`}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setShowAlbumSelection(false);
                setAlbumResult(null);
                setSelectedTracks(new Set());
                setSearchQuery("");
              }}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "500px" }}>
      <h1 className="section-title">add song</h1>

      {error && (
        <div className="error" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {/* Mode selection buttons */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <button
          type="button"
          className={addMode === "upload" ? "btn btn-primary" : "btn"}
          onClick={() => {
            setAddMode("upload");
            setError(null);
            // Clear Bandcamp-specific state when switching to upload
            setSongUrl("");
            setBandcampPageUrl("");
            setSearchQuery("");
            setSearchResults([]);
            setShowResults(false);
            setAlbumResult(null);
            setShowAlbumSelection(false);
          }}
        >
          Upload File
        </button>
        <button
          type="button"
          className={addMode === "bandcamp" ? "btn btn-primary" : "btn"}
          onClick={() => {
            setAddMode("bandcamp");
            setError(null);
            // Clear file when switching to Bandcamp
            setFile(null);
            setDuration("");
          }}
        >
          Bandcamp
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {addMode === "upload" ? (
          <>
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
                  placeholder="type song name or paste Spotify link..."
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                />
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
                      </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

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
            </div>
          </>
        ) : (
          <div
            className="form-group"
            ref={searchContainerRef}
            style={{ position: "relative" }}
          >
            <label className="form-label">//bandcamp url</label>
            <input
              type="text"
              className="form-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="paste Bandcamp URL..."
            />
            {songUrl && (
              <div
                style={{
                  marginTop: "8px",
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
                  Bandcamp stream ready
                </div>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => {
                    setSongUrl("");
                    setBandcampPageUrl("");
                    setSearchQuery("");
                    setSearchResults([]);
                    setShowResults(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
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
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {addMode === "upload" ? (
          <>
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
          </>
        ) : (
          // Bandcamp mode: show metadata preview
          songUrl && (
            <div
              style={{
                padding: "16px",
                backgroundColor: "var(--card-bg)",
                borderRadius: "4px",
                border: "1px solid var(--border-color)",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", gap: "16px" }}>
                {coverImage && (
                  <img
                    src={coverImage}
                    alt="Cover"
                    style={{
                      width: "80px",
                      height: "80px",
                      objectFit: "cover",
                      borderRadius: "4px",
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "1.1em",
                      color: "var(--text-primary)",
                      marginBottom: "4px",
                    }}
                  >
                    {title || "Unknown"}
                  </div>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      marginBottom: "4px",
                    }}
                  >
                    {artists.find((a) => a.artist_id?.toString() === artistId)?.name || "Unknown Artist"}
                  </div>
                  {albums.find((a) => a.album_id?.toString() === albumId) && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                      }}
                    >
                      {albums.find((a) => a.album_id?.toString() === albumId)?.title}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading
              ? addMode === "bandcamp"
                ? "adding..."
                : "uploading..."
              : addMode === "bandcamp"
              ? "add song"
              : "create song"}
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
