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
import { artistImageService } from "../services/artistImageService";

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
  artistImageSourceUrl?: string;
  coverArt: string;
  tracks: AlbumTrack[];
  pageUrl: string;
}

type AddMode = "upload" | "bandcamp";

interface FileFormState {
  title: string;
  albumId: string;
  artistId: string;
  coverImage: string;
  selectedArtistIds: number[];
  searchQuery: string;
  searchResults: SearchResult[];
  showResults: boolean;
  pendingArtistNames?: string[]; // Track pending artists for this file
  pendingAlbumName?: string | null; // Track pending album for this file
  pendingAlbumCoverArt?: string | null; // Track pending album cover art for this file
}

const SongCreate = (): React.ReactElement => {
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

  // Multiple file upload state
  const [files, setFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number | null>(null);
  const [fileMetadata, setFileMetadata] = useState<
    Map<
      number,
      {
        duration: string;
        objectUrl: string;
        durationSeconds: number;
        coverArt?: string;
      }
    >
  >(new Map());
  const [playingFileIndex, setPlayingFileIndex] = useState<number | null>(null);
  const [playbackTimes, setPlaybackTimes] = useState<Map<number, number>>(
    new Map(),
  );
  const [fileFormStates, setFileFormStates] = useState<
    Map<number, FileFormState>
  >(new Map());
  // Counter to force sync useEffect to run when fileFormStates changes
  const [fileFormStatesVersion, setFileFormStatesVersion] = useState(0);
  const [useSpotifyMetadata, setUseSpotifyMetadata] = useState<boolean>(true);
  const [incompleteFiles, setIncompleteFiles] = useState<Set<number>>(
    new Set(),
  );
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [albums, setAlbums] = useState<(Album & { album_id: number })[]>([]);
  const [artists, setArtists] = useState<(Artist & { artist_id: number })[]>(
    [],
  );
  const [selectedArtistIds, setSelectedArtistIds] = useState<number[]>([]);

  // Pending artist/album names from search results (not created until form submission)
  const [pendingArtistNames, setPendingArtistNames] = useState<string[]>([]);
  const [pendingAlbumName, setPendingAlbumName] = useState<string | null>(null);
  const [pendingAlbumCoverArt, setPendingAlbumCoverArt] = useState<
    string | null
  >(null);
  const [pendingSpotifyArtistIds, setPendingSpotifyArtistIds] = useState<
    string[]
  >([]);
  const [pendingArtistNameToIdMap, setPendingArtistNameToIdMap] = useState<
    Map<string, string>
  >(new Map());
  const [pendingBandcampMetadata, setPendingBandcampMetadata] =
    useState<any>(null);

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

  // Cleanup object URLs when component unmounts or files change
  useEffect(() => {
    return () => {
      fileMetadata.forEach((metadata) => {
        URL.revokeObjectURL(metadata.objectUrl);
      });
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  // Auto-save form state when form fields change (only for multi-file mode)
  useEffect(() => {
    // Don't auto-save if we're currently restoring state for this file
    if (
      isRestoringStateRef.current &&
      restoringFileIndexRef.current === currentFileIndex
    ) {
      return;
    }

    if (currentFileIndex !== null && files.length > 1) {
      setFileFormStates((prev) => {
        const newMap = new Map(prev);
        const currentState = prev.get(currentFileIndex);
        
        // If albumId is set, look up the album name to store as pendingAlbumName
        let resolvedPendingAlbumName = pendingAlbumName;
        if (!resolvedPendingAlbumName && albumId) {
          const selectedAlbum = albums.find(
            (a) => a.album_id?.toString() === albumId
          );
          if (selectedAlbum?.title) {
            resolvedPendingAlbumName = selectedAlbum.title;
          }
        }
        // Fallback to existing pendingAlbumName if nothing new
        if (!resolvedPendingAlbumName) {
          resolvedPendingAlbumName = currentState?.pendingAlbumName || null;
        }
        
        newMap.set(currentFileIndex, {
          title,
          albumId,
          artistId,
          coverImage,
          selectedArtistIds: [...selectedArtistIds],
          searchQuery,
          searchResults: [...searchResults],
          showResults,
          // Preserve pendingArtistNames if they exist
          pendingArtistNames:
            pendingArtistNames.length > 0
              ? [...pendingArtistNames]
              : currentState?.pendingArtistNames,
          // Preserve pendingAlbumName - use new value if set, otherwise keep existing
          pendingAlbumName: resolvedPendingAlbumName,
          // Preserve pendingAlbumCoverArt
          pendingAlbumCoverArt:
            pendingAlbumCoverArt !== null
              ? pendingAlbumCoverArt
              : currentState?.pendingAlbumCoverArt || null,
        });

        // Increment version to trigger sync useEffect
        setFileFormStatesVersion((v) => v + 1);

        return newMap;
      });

      // Update incomplete files set - remove from incomplete if now complete
      // A file is complete if it has a title AND (an artistId OR pending artist names)
      const currentState = fileFormStates.get(currentFileIndex);
      const hasPendingArtists =
        currentState?.pendingArtistNames &&
        currentState.pendingArtistNames.length > 0;
      const isComplete = !!(title.trim() && (artistId || hasPendingArtists));

      setIncompleteFiles((prev) => {
        const newSet = new Set(prev);
        if (isComplete) {
          newSet.delete(currentFileIndex);
        } else {
          newSet.add(currentFileIndex);
        }
        return newSet;
      });
    }
  }, [
    title,
    albumId,
    artistId,
    coverImage,
    selectedArtistIds,
    searchQuery,
    searchResults,
    showResults,
    pendingArtistNames,
    pendingAlbumName,
    pendingAlbumCoverArt,
    albums,
    currentFileIndex,
    files.length,
  ]);

  // Keep incompleteFiles in sync with fileFormStates (for button validation)
  // Use fileFormStatesVersion instead of fileFormStates in deps to ensure we run after state updates
  useEffect(() => {
    // Don't sync if we're currently restoring state
    if (isRestoringStateRef.current) {
      return;
    }

    if (files.length > 1) {
      const incomplete = new Set<number>();
      for (let i = 0; i < files.length; i++) {
        const state = fileFormStates.get(i);
        // A file is complete if it has a title AND (an artistId OR pending artist names)
        const hasPendingArtists =
          state?.pendingArtistNames && state.pendingArtistNames.length > 0;
        const isComplete = state
          ? !!(state.title.trim() && (state.artistId || hasPendingArtists))
          : false;
        if (!isComplete) {
          incomplete.add(i);
        }
      }

      setIncompleteFiles(incomplete);
    }
  }, [fileFormStatesVersion, files.length, fileFormStates]);

  // When files are selected, extract metadata and set current file
  const handleFilesSelected = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const fileArray = Array.from(selectedFiles);
    setFiles(fileArray);
    setCurrentFileIndex(0);
    setError(null);

    // Extract metadata for all files
    const metadataMap = new Map<
      number,
      {
        duration: string;
        objectUrl: string;
        durationSeconds: number;
        coverArt?: string;
      }
    >();
    const id3MetadataMap = new Map<
      number,
      {
        title?: string;
        artist?: string;
        album?: string;
        coverArt?: string;
      }
    >();

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const objectUrl = URL.createObjectURL(file);
      let coverArt: string | undefined;

      try {
        const audio = new Audio();
        audio.src = objectUrl;

        const { durationStr, durationSeconds } = await new Promise<{
          durationStr: string;
          durationSeconds: number;
        }>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => {
            const durationSeconds = Math.floor(audio.duration);
            const hours = Math.floor(durationSeconds / 3600);
            const minutes = Math.floor((durationSeconds % 3600) / 60);
            const seconds = durationSeconds % 60;
            const durationStr = `${String(hours).padStart(2, "0")}:${String(
              minutes,
            ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
            resolve({ durationStr, durationSeconds });
          });
          audio.addEventListener("error", reject);
        });

        // Try to extract metadata from ID3 tags (cover art, album, artist, title)
        let id3Album: string | undefined;
        let id3Artist: string | undefined;
        let id3Title: string | undefined;
        try {
          const { parseBuffer } = await import("music-metadata");
          const arrayBuffer = await file.arrayBuffer();
          const metadata = await parseBuffer(new Uint8Array(arrayBuffer));

          if (metadata.common.picture && metadata.common.picture.length > 0) {
            const picture = metadata.common.picture[0];
            try {
              // Convert Uint8Array/Buffer to base64 properly (handles large arrays)
              // Process in chunks to avoid "Maximum call stack size exceeded" errors
              let data: Uint8Array;
              
              // Handle different data types (Uint8Array, Buffer, etc.)
              if (picture.data instanceof Uint8Array) {
                data = picture.data;
              } else if (Buffer.isBuffer(picture.data)) {
                data = new Uint8Array(picture.data);
              } else if (Array.isArray(picture.data)) {
                data = new Uint8Array(picture.data);
              } else {
                // Try to convert to Uint8Array
                data = new Uint8Array(picture.data as any);
              }
              
              let binaryString = '';
              const chunkSize = 8192; // Process 8KB chunks at a time
              
              for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
                // Convert chunk to array for apply()
                const chunkArray = Array.from(chunk);
                binaryString += String.fromCharCode.apply(null, chunkArray);
              }
              
              const base64 = btoa(binaryString);
              const format = picture.format || "image/jpeg";
              coverArt = `data:${format};base64,${base64}`;
              
              if (import.meta.env.DEV) {
                console.log(`Successfully extracted cover art for ${file.name} (${data.length} bytes, format: ${format})`);
              }
            } catch (base64Error) {
              console.warn(`Failed to convert cover art to base64 for ${file.name}:`, base64Error);
              // coverArt remains undefined, will be handled gracefully
            }
          } else {
            if (import.meta.env.DEV) {
              console.debug(`No cover art found in metadata for ${file.name}`);
            }
          }

          // Extract album, artist, and title from ID3 tags
          if (metadata.common.album) {
            id3Album = metadata.common.album;
          }
          if (metadata.common.artist) {
            id3Artist = metadata.common.artist;
          }
          if (metadata.common.title) {
            id3Title = metadata.common.title;
          }
        } catch (coverArtError) {
          // Log error but don't fail the whole operation
          if (import.meta.env.DEV) {
            console.warn(`Error extracting metadata from ${file.name}:`, coverArtError);
          }
        }

        metadataMap.set(i, {
          duration: durationStr,
          objectUrl,
          durationSeconds,
          coverArt,
        });

        // Store ID3 metadata for later use
        if (id3Title || id3Artist || id3Album || coverArt) {
          id3MetadataMap.set(i, {
            title: id3Title,
            artist: id3Artist,
            album: id3Album,
            coverArt,
          });
        } else {
        }
      } catch (err) {
        console.error(`Error extracting duration for file ${file.name}:`, err);
        // Still create object URL even if duration extraction fails
        const objectUrl = URL.createObjectURL(file);
        metadataMap.set(i, {
          duration: "00:00:00",
          objectUrl,
          durationSeconds: 0,
          coverArt,
        });
      }
    }

    // Initialize file form states with ID3 metadata
    setFileFormStates((prev) => {
      const newMap = new Map(prev);
      for (let i = 0; i < fileArray.length; i++) {
        const id3Data = id3MetadataMap.get(i);
        if (id3Data) {
          const existingState = newMap.get(i);
          const pendingAlbumName = id3Data.album || existingState?.pendingAlbumName || null;
          const pendingArtistNames = id3Data.artist
            ? splitArtistNames(id3Data.artist)
                .map((name) => name.trim())
                .filter(Boolean)
            : existingState?.pendingArtistNames;
          newMap.set(i, {
            title: id3Data.title || existingState?.title || "",
            albumId: existingState?.albumId || "",
            artistId: existingState?.artistId || "",
            coverImage: id3Data.coverArt || existingState?.coverImage || "",
            selectedArtistIds: existingState?.selectedArtistIds || [],
            searchQuery: existingState?.searchQuery || "",
            searchResults: existingState?.searchResults || [],
            showResults: existingState?.showResults || false,
            // Store ID3 metadata as pending values (will be created on submission)
            pendingArtistNames,
            pendingAlbumName,
            pendingAlbumCoverArt: id3Data.coverArt || existingState?.pendingAlbumCoverArt || null,
          });
        }
      }
      setFileFormStatesVersion((v) => v + 1);
      return newMap;
    });

    setFileMetadata(metadataMap);

    // Mark all files as incomplete initially
    const allIncomplete = new Set(fileArray.map((_, i) => i));
    setIncompleteFiles(allIncomplete);

    // Set the first file as current and sync ID3 metadata
    if (fileArray.length > 0) {
      setCurrentFileIndex(0);
      setFile(fileArray[0]);
      const firstMetadata = metadataMap.get(0);
      const firstId3Data = id3MetadataMap.get(0);
      if (firstMetadata) {
        setDuration(firstMetadata.duration);
        // Set cover image from embedded cover art if available
        if (firstMetadata.coverArt) {
          setCoverImage(firstMetadata.coverArt);
        }
      }
      // Sync ID3 metadata to main form state for first file
      if (firstId3Data) {
        if (firstId3Data.title) {
          setTitle(firstId3Data.title);
        }
        if (firstId3Data.artist) {
          const artistNames = splitArtistNames(firstId3Data.artist)
            .map((name) => name.trim())
            .filter(Boolean);
          if (artistNames.length > 0) {
            setPendingArtistNames(artistNames);
          }
        }
        if (firstId3Data.album) {
          setPendingAlbumName(firstId3Data.album);
        }
        if (firstId3Data.coverArt) {
          setPendingAlbumCoverArt(firstId3Data.coverArt);
        }
      }
    }
  };

  // Preview audio playback
  const handlePreviewPlay = (index: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const metadata = fileMetadata.get(index);
    if (!metadata) return;

    // If clicking the same file that's playing, pause it
    if (playingFileIndex === index && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPlayingFileIndex(null);
      setPlaybackTimes((prev) => {
        const newMap = new Map(prev);
        newMap.delete(index);
        return newMap;
      });
      return;
    }

    // Stop current playback if any
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    // Clear previous playback time
    setPlaybackTimes((prev) => {
      const newMap = new Map(prev);
      if (playingFileIndex !== null) {
        newMap.delete(playingFileIndex);
      }
      return newMap;
    });

    // Play the selected file
    const audio = new Audio(metadata.objectUrl);
    previewAudioRef.current = audio;
    setPlayingFileIndex(index);

    // Update playback time
    const updateTime = () => {
      if (audio && !audio.paused) {
        setPlaybackTimes((prev) => {
          const newMap = new Map(prev);
          newMap.set(index, audio.currentTime);
          return newMap;
        });
      }
    };

    let timeInterval: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      if (timeInterval) {
        clearInterval(timeInterval);
        timeInterval = null;
      }
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
      }
      if (playingFileIndex === index) {
        setPlayingFileIndex(null);
        setPlaybackTimes((prev) => {
          const newMap = new Map(prev);
          newMap.set(index, 0);
          return newMap;
        });
      }
    };

    timeInterval = setInterval(updateTime, 100);
    audio.addEventListener("timeupdate", updateTime);
    audio.addEventListener("ended", cleanup);
    audio.addEventListener("error", cleanup);

    audio.play().catch((err) => {
      console.error("Error playing preview:", err);
      cleanup();
    });
  };

  // Save current form state for a file
  const saveCurrentFormState = (fileIndex: number | null) => {
    if (fileIndex === null) return;

    setFileFormStates((prev) => {
      const newMap = new Map(prev);
      const currentState = prev.get(fileIndex);
      newMap.set(fileIndex, {
        title,
        albumId,
        artistId,
        coverImage,
        selectedArtistIds: [...selectedArtistIds],
        searchQuery,
        searchResults: [...searchResults],
        showResults,
        // Save pending artist names and album info from global state
        pendingArtistNames:
          pendingArtistNames.length > 0
            ? [...pendingArtistNames]
            : currentState?.pendingArtistNames,
        pendingAlbumName:
          pendingAlbumName !== null
            ? pendingAlbumName
            : currentState?.pendingAlbumName,
        pendingAlbumCoverArt:
          pendingAlbumCoverArt !== null
            ? pendingAlbumCoverArt
            : currentState?.pendingAlbumCoverArt,
      });
      // Increment version to trigger sync useEffect
      setFileFormStatesVersion((v) => v + 1);
      return newMap;
    });
  };

  // Ref to track when we're restoring state (to prevent useEffect from overwriting)
  const isRestoringStateRef = useRef(false);
  const restoringFileIndexRef = useRef<number | null>(null);

  // Handle clicking on a file to set it as current
  const handleFileClick = (index: number) => {
    // Save current form state before switching
    if (currentFileIndex !== null && currentFileIndex !== index) {
      saveCurrentFormState(currentFileIndex);
    }

    // Stop any playing preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPlayingFileIndex(null);

    // Set flags to prevent useEffect from overwriting restored state
    isRestoringStateRef.current = true;
    restoringFileIndexRef.current = index;

    setCurrentFileIndex(index);
    setFile(files[index]);
    const metadata = fileMetadata.get(index);
    if (metadata) {
      setDuration(metadata.duration);
    }

    // Restore form state for the selected file, or reset if no saved state
    const savedState = fileFormStates.get(index);
    if (savedState) {
      // Use React's batching to update all state at once
      setTitle(savedState.title);
      setAlbumId(savedState.albumId);
      setArtistId(savedState.artistId);
      // Use saved cover image, or fall back to embedded cover art if no saved image
      setCoverImage(savedState.coverImage || metadata?.coverArt || "");
      setSelectedArtistIds(savedState.selectedArtistIds);
      setSearchQuery(savedState.searchQuery);
      setSearchResults(savedState.searchResults);
      setShowResults(savedState.showResults);
      // Restore pending artist names from saved state
      if (
        savedState.pendingArtistNames &&
        savedState.pendingArtistNames.length > 0
      ) {
        setPendingArtistNames([...savedState.pendingArtistNames]);
      } else {
        setPendingArtistNames([]);
      }
      // Restore pending album info from saved state
      if (savedState.pendingAlbumName !== undefined) {
        setPendingAlbumName(savedState.pendingAlbumName);
      }
      if (savedState.pendingAlbumCoverArt !== undefined) {
        setPendingAlbumCoverArt(savedState.pendingAlbumCoverArt);
      }

      // Update incomplete files set based on restored state
      // A file is complete if it has a title AND (an artistId OR pending artist names)
      const hasPendingArtists =
        savedState.pendingArtistNames &&
        savedState.pendingArtistNames.length > 0;
      const isComplete = !!(
        savedState.title.trim() &&
        (savedState.artistId || hasPendingArtists)
      );
      setIncompleteFiles((prev) => {
        const newSet = new Set(prev);
        if (isComplete) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
        return newSet;
      });
    } else {
      // Reset form for the selected file if no saved state
      setTitle("");
      setAlbumId("");
      setArtistId("");
      // Use embedded cover art if available
      setCoverImage(metadata?.coverArt || "");
      setSelectedArtistIds([]);
      setSearchQuery("");
      setSearchResults([]);
      setShowResults(false);
      // Clear pending artist names and album info when switching to a file with no saved state
      setPendingArtistNames([]);
      setPendingAlbumName(null);
      setPendingAlbumCoverArt(null);

      // Mark as incomplete
      setIncompleteFiles((prev) => {
        const newSet = new Set(prev);
        newSet.add(index);
        return newSet;
      });
    }

    // Clear the flags after state updates (use setTimeout to ensure it runs after all state updates)
    setTimeout(() => {
      isRestoringStateRef.current = false;
      restoringFileIndexRef.current = null;
    }, 0);

    setError(null);
  };

  // Handle removing a file from the list
  const handleRemoveFile = (index: number, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    // Stop playback if this file is playing
    if (playingFileIndex === index && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPlayingFileIndex(null);
    }

    // Clean up object URL
    const metadata = fileMetadata.get(index);
    if (metadata) {
      URL.revokeObjectURL(metadata.objectUrl);
    }

    // Remove the file from arrays and maps
    const newFiles = files.filter((_, i) => i !== index);
    setFiles(newFiles);

    // Rebuild metadata map with new indices
    const newMetadata = new Map<
      number,
      {
        duration: string;
        objectUrl: string;
        durationSeconds: number;
        coverArt?: string;
      }
    >();
    const newFileFormStates = new Map<number, FileFormState>();
    const newIncompleteFiles = new Set<number>();
    const newPlaybackTimes = new Map<number, number>();

    for (let newIndex = 0; newIndex < newFiles.length; newIndex++) {
      // Map new index to old index: if newIndex < removed index, no change; otherwise shift up by 1
      const oldIndex = newIndex < index ? newIndex : newIndex + 1;
      const oldMetadata = fileMetadata.get(oldIndex);
      const oldState = fileFormStates.get(oldIndex);
      const oldPlaybackTime = playbackTimes.get(oldIndex);

      if (oldMetadata) {
        newMetadata.set(newIndex, oldMetadata);
      }
      if (oldState) {
        newFileFormStates.set(newIndex, oldState);
      }
      if (incompleteFiles.has(oldIndex)) {
        newIncompleteFiles.add(newIndex);
      }
      if (oldPlaybackTime !== undefined) {
        newPlaybackTimes.set(newIndex, oldPlaybackTime);
      }
    }

    setFileMetadata(newMetadata);
    setFileFormStates(newFileFormStates);
    setIncompleteFiles(newIncompleteFiles);
    setPlaybackTimes(newPlaybackTimes);

    // Handle current file index
    if (newFiles.length === 0) {
      // No files left, reset everything
      setCurrentFileIndex(null);
      setFile(null);
      setTitle("");
      setAlbumId("");
      setArtistId("");
      setCoverImage("");
      setSelectedArtistIds([]);
      setDuration("");
    } else {
      // Adjust current file index
      let newCurrentIndex = currentFileIndex;
      if (currentFileIndex === index) {
        // If we removed the current file, switch to the next one (or previous if it was the last)
        newCurrentIndex = index < newFiles.length ? index : newFiles.length - 1;
      } else if (currentFileIndex !== null && currentFileIndex > index) {
        // If we removed a file before the current one, decrement the index
        newCurrentIndex = currentFileIndex - 1;
      }

      setCurrentFileIndex(newCurrentIndex);
      if (newCurrentIndex !== null) {
        setFile(newFiles[newCurrentIndex]);
        const currentMetadata = newMetadata.get(newCurrentIndex);
        if (currentMetadata) {
          setDuration(currentMetadata.duration);
        }

        // Restore form state for the new current file
        const savedState = newFileFormStates.get(newCurrentIndex);
        if (savedState) {
          setTitle(savedState.title);
          setAlbumId(savedState.albumId);
          setArtistId(savedState.artistId);
          // Use saved cover image, or fall back to embedded cover art if no saved image
          setCoverImage(
            savedState.coverImage || currentMetadata?.coverArt || "",
          );
          setSelectedArtistIds(savedState.selectedArtistIds);
          setSearchQuery(savedState.searchQuery);
          setSearchResults(savedState.searchResults);
          setShowResults(savedState.showResults);
        } else {
          setTitle("");
          setAlbumId("");
          setArtistId("");
          // Use embedded cover art if available
          setCoverImage(currentMetadata?.coverArt || "");
          setSelectedArtistIds([]);
          setSearchQuery("");
          setSearchResults([]);
          setShowResults(false);
        }
      }
    }
  };

  // Handle progress bar seek
  const handleProgressSeek = (
    index: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    e.stopPropagation();
    const metadata = fileMetadata.get(index);
    if (!metadata || !previewAudioRef.current || playingFileIndex !== index)
      return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * metadata.durationSeconds;

    previewAudioRef.current.currentTime = newTime;
    setPlaybackTimes((prev) => {
      const newMap = new Map(prev);
      newMap.set(index, newTime);
      return newMap;
    });
  };

  useEffect(() => {
    Promise.all([albumService.getAll(), artistService.getAll()]).then(
      ([albums, artists]) => {
        // Filter out items without IDs since the UI requires them
        setAlbums(
          albums.filter(
            (a): a is Album & { album_id: number } => a.album_id !== undefined,
          ),
        );
        setArtists(
          artists.filter(
            (a): a is Artist & { artist_id: number } =>
              a.artist_id !== undefined,
          ),
        );
      },
    );
  }, []);

  // Check if input is a Bandcamp URL
  const isBandcampUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
      const urlObj = new URL(trimmed);
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        return false;
      }
      if (urlObj.hostname.toLowerCase().endsWith("bandcamp.com")) {
        return true;
      }
      return (
        urlObj.pathname.includes("/track/") ||
        urlObj.pathname.includes("/album/")
      );
    } catch (e) {
      return /bandcamp\.com/.test(trimmed);
    }
  };

  const normalizeMatchValue = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");

  const isBandcampArtistMismatch = (
    artistName: string,
    pageUrl?: string,
  ): boolean => {
    if (!artistName || !pageUrl) return false;
    try {
      const urlObj = new URL(pageUrl);
      const hostname = urlObj.hostname.toLowerCase();
      const normalizedArtist = normalizeMatchValue(artistName);
      if (!normalizedArtist) return false;

      if (hostname.endsWith("bandcamp.com")) {
        const subdomain = hostname.replace(/\.bandcamp\.com$/, "");
        const normalizedSubdomain = normalizeMatchValue(subdomain);
        if (!normalizedSubdomain) return false;
        return (
          !normalizedSubdomain.includes(normalizedArtist) &&
          !normalizedArtist.includes(normalizedSubdomain)
        );
      }

      const normalizedHost = normalizeMatchValue(hostname);
      if (!normalizedHost) return false;
      return (
        !normalizedHost.includes(normalizedArtist) &&
        !normalizedArtist.includes(normalizedHost)
      );
    } catch (e) {
      return false;
    }
  };

  const fetchBandcampArtistImage = async (
    artistName: string,
  ): Promise<{ imageUrl: string; sourceUrl: string | null } | null> => {
    if (!artistName || !artistName.trim()) return null;
    try {
      const response = await fetch(
        `/api/bandcamp-artist-image?artist=${encodeURIComponent(artistName)}`,
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.imageUrl) {
        return null;
      }
      return {
        imageUrl: data.imageUrl,
        sourceUrl: data.sourceUrl || null,
      };
    } catch (err) {
      console.error(`Error fetching Bandcamp image for ${artistName}:`, err);
      return null;
    }
  };

  const getBandcampResultType = (result: SearchResult): string | null => {
    const rawType = result.raw?.type;
    if (rawType) {
      return rawType;
    }
    const url = result.raw?.url || "";
    if (!isBandcampUrl(url)) {
      return null;
    }
    if (url.includes("/track/")) {
      return "track";
    }
    if (url.includes("/album/")) {
      return "album";
    }
    return null;
  };

  // Extract Bandcamp metadata from backend
  const extractBandcampMetadata = async (
    url: string,
  ): Promise<SearchResult | null> => {
    try {
      const response = await fetch(
        `/api/bandcamp-metadata?url=${encodeURIComponent(url)}`,
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: response.statusText }));
        throw new Error(
          errorData.error ||
            `Failed to fetch Bandcamp metadata: ${response.statusText}`,
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
          source: "bandcamp",
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
      /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/i,
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

  const normalizeArtistName = (value: string): string =>
    value.toLowerCase().replace(/\s+/g, " ").trim();

  // Validate and fetch a reliable artist image from Spotify
  const validateAndGetArtistImage = async (
    artistId: string,
  ): Promise<{ imageUrl: string; sourceUrl: string | null } | null> => {
    try {
      const response = await fetch(`/api/spotify-artist/${artistId}`);
      if (!response.ok) {
        console.warn(
          `Failed to fetch artist ${artistId} from Spotify: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      // Check if response is actually JSON (not HTML error page)
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.warn(
          `Spotify API returned non-JSON response for artist ${artistId}: ${contentType}`,
        );
        return null;
      }

      const artistData = await response.json();

      if (Array.isArray(artistData.images) && artistData.images.length > 0) {
        // Spotify typically returns largest image first
        const imageUrl = artistData.images[0].url;
        const sourceUrl = artistData.external_urls?.spotify || null;

        try {
          // Optional: basic validation that URL responds
          const headResponse = await fetch(imageUrl, { method: "HEAD" });
          if (headResponse.ok) {
            return { imageUrl, sourceUrl };
          }
        } catch (e) {
          // If HEAD fails (CORS, etc.), still return URL
          console.warn("Artist image HEAD validation failed:", e);
        }

        return { imageUrl, sourceUrl };
      }

      return null;
    } catch (error) {
      // Handle JSON parsing errors (e.g., when API returns HTML error page)
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        console.warn(
          `Spotify API returned invalid JSON for artist ${artistId} (likely HTML error page)`,
        );
      } else {
        console.error("Error validating artist image from Spotify:", error);
      }
      return null;
    }
  };

  // Debounced search - different behavior for upload vs bandcamp mode
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmedQuery = searchQuery.trim();

    // Upload mode: require a file to be added before searching
    if (addMode === "upload") {
      // Disable search if no file is added
      if (!file && files.length === 0) {
        setSearchResults([]);
        setShowResults(false);
        setError(null);
        return;
      }

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
          // Bandcamp mode:
          // - If it's a Bandcamp URL, extract metadata from the URL
          // - Otherwise, perform a Bandcamp search (albums/tracks)
          if (isBandcampUrl(trimmedQuery)) {
            const result = await extractBandcampMetadata(trimmedQuery);
            if (result === null) {
              // It's an album - fetch the album data separately
              const response = await fetch(
                `/api/bandcamp-metadata?url=${encodeURIComponent(trimmedQuery)}`,
              );
              if (!response.ok) {
                throw new Error("Failed to fetch album data");
              }
              const albumData: AlbumResult = await response.json();
              if (albumData.type === "album" && albumData.tracks.length > 0) {
                setAlbumResult(albumData);

                // Select all tracks with valid audio URLs by default
                const validTrackIndices = albumData.tracks
                  .map((track, i) => {
                    const isValidAudioUrl =
                      track.audioUrl &&
                      (track.audioUrl.includes("bcbits.com") ||
                        track.audioUrl.includes(".mp3") ||
                        track.audioUrl.includes(".ogg") ||
                        track.audioUrl.includes(".flac"));
                    return isValidAudioUrl ? i : null;
                  })
                  .filter((index): index is number => index !== null);

                setSelectedTracks(new Set(validTrackIndices));
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
          } else {
            // Free-text Bandcamp search
            if (trimmedQuery.length < 2) {
              setSearchResults([]);
              setShowResults(false);
              setError(null);
              return;
            }

            const response = await fetch(
              `/api/bandcamp-search?q=${encodeURIComponent(trimmedQuery)}`,
            );
            if (!response.ok) {
              throw new Error("Failed to search Bandcamp");
            }
            const data = await response.json();

            // Map results and fetch missing cover art for albums
            const resultsPromises = (data.results || []).map(
              async (item: any) => {
                let coverArt = item.coverArt || "";

                // If it's an album and we don't have cover art, try to fetch it from metadata
                if (item.type === "album" && !coverArt && item.url) {
                  try {
                    const metaResp = await fetch(
                      `/api/bandcamp-metadata?url=${encodeURIComponent(
                        item.url,
                      )}`,
                    );
                    if (metaResp.ok) {
                      const meta = await metaResp.json();
                      if (meta.coverArt) {
                        coverArt = meta.coverArt;
                      }
                    }
                  } catch (e) {
                    // Silently fail - we'll just show without cover art
                    if (import.meta.env.DEV) {
                      console.warn(
                        "Failed to fetch cover art for album:",
                        item.url,
                        e,
                      );
                    }
                  }
                }

                return {
                  title: item.title || "",
                  album: "", // Don't show album in subtitle - for albums it's redundant, for tracks we don't have it
                  artist: item.artist || "",
                  coverArt: coverArt,
                  raw: {
                    ...item,
                    source: "bandcamp",
                  },
                };
              },
            );

            const results = await Promise.all(resultsPromises);

            setAlbumResult(null);
            setShowAlbumSelection(false);
            setSearchResults(results);
            setShowResults(true);
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
              `/api/spotify-search?q=${term}&type=track&limit=25`,
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
            },
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
              : "Failed to search Spotify"),
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

    // Store metadata for later use (album, artist, artistImage)
    let bandcampMetadata: any = null;

    const isBandcampResult =
      result.raw?.source === "bandcamp" ||
      (result.raw?.url && isBandcampUrl(result.raw.url));
    const bandcampUrl = result.raw?.url || "";

    // If this is a Bandcamp result, store the audio stream URL (prefer audioUrl over page URL)
    if (isBandcampResult) {
      if (!bandcampUrl) {
        setError("Bandcamp URL missing from search result.");
        setSongUrl("");
        setBandcampPageUrl("");
        return;
      }
      // Try to use a pre-extracted audio URL if present (from direct URL paste flow)
      let audioStreamUrl: string | undefined = result.raw.audioUrl;

      const hasValidAudioUrl =
        audioStreamUrl &&
        (audioStreamUrl.includes("bcbits.com") ||
          audioStreamUrl.includes(".mp3") ||
          audioStreamUrl.includes(".ogg") ||
          audioStreamUrl.includes(".flac"));

      // Always fetch metadata for Bandcamp results to get album/artist info
      // (even if we already have a valid audio URL)
      try {
        const resp = await fetch(
          `/api/bandcamp-metadata?url=${encodeURIComponent(bandcampUrl)}`,
        );
        if (!resp.ok) {
          throw new Error("Failed to extract Bandcamp metadata from URL");
        }

        const meta = await resp.json();
        bandcampMetadata = meta;

        // Album result: open album selection UI instead of treating as single track
        if (meta.type === "album" && Array.isArray(meta.tracks)) {
          const albumData = meta as AlbumResult;

          setAlbumResult(albumData);

          // Select all tracks with valid audio URLs by default
          const validTrackIndices = albumData.tracks
            .map((track, i) => {
              const isValidAudioUrl =
                track.audioUrl &&
                (track.audioUrl.includes("bcbits.com") ||
                  track.audioUrl.includes(".mp3") ||
                  track.audioUrl.includes(".ogg") ||
                  track.audioUrl.includes(".flac"));
              return isValidAudioUrl ? i : null;
            })
            .filter((index): index is number => index !== null);

          setSelectedTracks(new Set(validTrackIndices));
          setShowAlbumSelection(true);
          setError(null);
          return; // Album flow handled; skip single-track handling below
        }

        // Track result: use extracted audio URL and duration (if we don't already have one)
        if (meta.type === "track") {
          if (!hasValidAudioUrl && meta.audioUrl) {
            audioStreamUrl = meta.audioUrl;
          }
          if (meta.duration) {
            setDuration(meta.duration);
          }
          // Update title if metadata has a better one
          if (meta.title && meta.title.trim()) {
            setTitle(meta.title);
          }
          // Update cover image if metadata has one
          if (meta.coverArt && meta.coverArt.trim()) {
            setCoverImage(meta.coverArt);
          }
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn(
            "Failed to extract Bandcamp metadata from search result URL:",
            e,
          );
        }
      }

      const isValidAudioUrl =
        audioStreamUrl &&
        (audioStreamUrl.includes("bcbits.com") ||
          audioStreamUrl.includes(".mp3") ||
          audioStreamUrl.includes(".ogg") ||
          audioStreamUrl.includes(".flac"));

      if (isValidAudioUrl && audioStreamUrl) {
        setSongUrl(audioStreamUrl);
        // Store the original page URL (prefer pageUrl from metadata, then from result, then url)
        const pageUrl =
          bandcampMetadata?.pageUrl || result.raw.pageUrl || bandcampUrl || "";
        setBandcampPageUrl(pageUrl);
        setFile(null); // Clear file when URL is set

        if (import.meta.env.DEV) {
          console.log("Stored valid Bandcamp audio URL:", audioStreamUrl);
          console.log("Stored Bandcamp page URL:", pageUrl);
        }
      } else {
        // If we couldn't extract a valid audio URL, show an error
        setError(
          "Could not extract audio stream URL from Bandcamp. Unfortunately, this track may not be available for streaming. Please try uploading an audio file instead.",
        );
        setSongUrl(""); // Don't store invalid URL
        if (import.meta.env.DEV) {
          console.warn(
            "Failed to extract valid audio URL from Bandcamp page. Got:",
            audioStreamUrl,
            "Page URL:",
            bandcampUrl,
          );
        }
      }
    } else {
      setSongUrl(""); // Clear URL for non-Bandcamp results
      setBandcampPageUrl(""); // Clear page URL for non-Bandcamp results
    }

    try {
      // Use metadata from Bandcamp if available (more accurate than search results)
      let bandcampArtist = result.artist;
      let bandcampAlbum = result.album;
      let bandcampCoverArt = result.coverArt;

      if (isBandcampResult && bandcampMetadata) {
        // Use artist from metadata if available, and clean it
        // Note: For track pages, this is the track artist, not the album artist
        if (bandcampMetadata.artist) {
          bandcampArtist = bandcampMetadata.artist;
          // Clean up artist name: remove patterns like "from [album] by [artist]" -> "[artist]"
          bandcampArtist = bandcampArtist
            .replace(/^from\s+.+?\s+by\s+/i, "")
            .trim();
        }
        // Use album from metadata if available
        if (bandcampMetadata.album) {
          bandcampAlbum = bandcampMetadata.album;
        }
        // Use cover art from metadata if available
        if (bandcampMetadata.coverArt) {
          bandcampCoverArt = bandcampMetadata.coverArt;
        }
      }

      let effectiveNames: string[] = [];

      if (isBandcampResult) {
        // For Bandcamp, split only on explicit collaboration separators
        if (bandcampArtist) {
          const bandcampNames = splitArtistNames(bandcampArtist, {
            includeFeaturing: false,
          });
          effectiveNames =
            bandcampNames.length > 0 ? bandcampNames : [bandcampArtist];
        }
      } else {
        // For Spotify, parse artist names (including featured artists)
        const mainArtistNames = splitArtistNames(result.artist || "");
        const featuredFromTitle = extractFeaturedFromTitle(result.title || "");
        const allNames = Array.from(
          new Set([...mainArtistNames, ...featuredFromTitle]),
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

      // Store artist names and album name for later creation (only create on form submission)
      effectiveNames = effectiveNames
        .map((name) => name.trim())
        .filter(Boolean);

      // Store pending artist names (will be created on form submission)
      setPendingArtistNames(effectiveNames);

      // Store Spotify metadata for artist image updates later
      const spotifyArtistIds: string[] =
        (result.raw && Array.isArray(result.raw.artistIds)
          ? result.raw.artistIds
          : []) || [];
      setPendingSpotifyArtistIds(spotifyArtistIds);

      const artistNameToIdMap: Map<string, string> =
        result.raw?.artistNameToIdMap || new Map();
      setPendingArtistNameToIdMap(artistNameToIdMap);

      // Store Bandcamp metadata if available
      if (isBandcampResult) {
        setPendingBandcampMetadata(bandcampMetadata);
      } else {
        setPendingBandcampMetadata(null);
      }

      // Try to find existing artists to pre-select (but don't create new ones)
      const existingArtistIds: number[] = [];
      for (const name of effectiveNames) {
        const normalizedName = normalizeArtistName(name);
        const existing = artists.find(
          (a) => normalizeArtistName(a.name) === normalizedName,
        );
        if (existing?.artist_id != null) {
          existingArtistIds.push(existing.artist_id);
        }
      }

      // If we found existing artists, pre-select the first one
      if (existingArtistIds.length > 0) {
        setArtistId(existingArtistIds[0].toString());
        setSelectedArtistIds(existingArtistIds);
      } else {
        // No existing artists found - clear selection (will be created on submit)
        setArtistId("");
        setSelectedArtistIds([]);
      }

      // Store album name for later creation (only create on form submission)
      if (bandcampAlbum) {
        setPendingAlbumName(bandcampAlbum);
        setPendingAlbumCoverArt(bandcampCoverArt || null);

        // Try to find existing album to pre-select (but don't create new one)
        const existingAlbum = albums.find((a) => a.title === bandcampAlbum);
        if (existingAlbum?.album_id) {
          setAlbumId(existingAlbum.album_id.toString());
        } else {
          // No existing album found - clear selection (will be created on submit)
          setAlbumId("");
        }
      } else {
        setPendingAlbumName(null);
        setPendingAlbumCoverArt(null);
        setAlbumId("");
      }

      // In multi-file mode, immediately save the current form state after setting metadata
      // This ensures the state is saved even if the user switches files before the useEffect runs
      if (files.length > 1 && currentFileIndex !== null) {
        // Save pending artist names and album info to fileFormState so validation can check for them
        setFileFormStates((prev) => {
          const newMap = new Map(prev);
          const currentState = newMap.get(currentFileIndex) || {
            title,
            albumId,
            artistId,
            coverImage,
            selectedArtistIds: [...selectedArtistIds],
            searchQuery,
            searchResults: [...searchResults],
            showResults,
          };
          newMap.set(currentFileIndex, {
            ...currentState,
            pendingArtistNames:
              effectiveNames.length > 0 ? effectiveNames : undefined,
            pendingAlbumName: bandcampAlbum || null,
            pendingAlbumCoverArt: bandcampCoverArt || null,
          });
          setFileFormStatesVersion((v) => v + 1);
          return newMap;
        });
      }
    } catch (err: any) {
      console.error("Error setting metadata:", err);
      setError(err.message || "Failed to set metadata");
    }
  };

  // Validate if a file has complete metadata
  const isFileComplete = (fileIndex: number): boolean => {
    const state = fileFormStates.get(fileIndex);
    if (!state) return false;
    // A file is complete if it has a title AND (an artistId OR pending artist names)
    const hasPendingArtists =
      state.pendingArtistNames && state.pendingArtistNames.length > 0;
    return !!(state.title.trim() && (state.artistId || hasPendingArtists));
  };

  // Validate all files when in multi-file mode
  const validateAllFiles = (): boolean => {
    if (files.length <= 1) {
      // Single file mode - validate current form
      return !!(title.trim() && artistId);
    }

    // Multi-file mode - validate all files
    const incomplete = new Set<number>();
    for (let i = 0; i < files.length; i++) {
      if (!isFileComplete(i)) {
        incomplete.add(i);
      }
    }

    setIncompleteFiles(incomplete);
    return incomplete.size === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // For multi-file mode, validate all files first
    if (files.length > 1) {
      if (!validateAllFiles()) {
        const incompleteCount = incompleteFiles.size;
        setError(
          `${incompleteCount} file${
            incompleteCount !== 1 ? "s" : ""
          } missing required metadata. Please fill in title and artist for all files.`,
        );
        // Scroll to first incomplete file
        const firstIncomplete = Array.from(incompleteFiles)[0];
        if (firstIncomplete !== undefined) {
          setCurrentFileIndex(firstIncomplete);
          handleFileClick(firstIncomplete);
        }
        return;
      }
    }

    // Require either file or URL
    if (!file && !songUrl) {
      setError("Please select an audio file or provide a Bandcamp URL");
      return;
    }

    // Check if we're using Spotify metadata (pending artist names without Bandcamp metadata)
    const isUsingSpotifyMetadata =
      pendingArtistNames.length > 0 && !pendingBandcampMetadata;

    if (!isUsingSpotifyMetadata) {
      // Only require title and artist when not using Spotify metadata
      if (!title.trim()) {
        setError("Title is required");
        return;
      }

      if (!artistId) {
        setError("Artist is required");
        return;
      }
    } else {
      // When using Spotify metadata, ensure we have a title from the search result
      if (!title.trim()) {
        setError("Title is required");
        return;
      }
    }

    // Duration is only required for file uploads
    // For URL-based songs, try to get it from metadata or set a default
    let finalDuration = duration;
    if (!finalDuration && songUrl) {
      // Try to get duration from search result if available
      const bandcampResult = searchResults.find(
        (r) => r.raw?.audioUrl === songUrl || r.raw?.url,
      );
      if (bandcampResult?.raw?.duration) {
        finalDuration = bandcampResult.raw.duration;
      } else {
        // Set a default duration for URL-based songs (can be updated later)
        finalDuration = "00:00:00";
      }
    } else if (!finalDuration && file) {
      setError(
        "Duration could not be extracted from the audio file. Please try again.",
      );
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Track the primary artist ID for song creation (used when artists are created from pending names)
      let resolvedPrimaryArtistId: number | null = null;
      let resolvedSelectedArtistIds: number[] = [];
      // Track the resolved album ID (used when album is created from pending name)
      let resolvedAlbumId: number | null = null;

      // Create artists and albums from pending names (from search results) before creating the song
      if (pendingArtistNames.length > 0) {
        const createdArtistsByName = new Map<string, Artist>();
        const allArtistIds: number[] = [];
        let primaryArtistId: number | null = null;

        // Helper to get or create artist
        const getOrCreateArtist = async (
          rawName: string,
        ): Promise<Artist | null> => {
          const trimmedName = rawName.trim();
          if (!trimmedName) return null;
          const normalizedName = normalizeArtistName(trimmedName);

          // Check if already created in this operation
          if (createdArtistsByName.has(normalizedName)) {
            return createdArtistsByName.get(normalizedName)!;
          }

          // Check if exists in database
          const existing = artists.find(
            (a) => normalizeArtistName(a.name) === normalizedName,
          );
          if (existing) {
            createdArtistsByName.set(normalizedName, existing);
            return existing;
          }

          // Create new artist
          const newId = await artistService.create({ name: trimmedName });
          const artist = { artist_id: newId, name: trimmedName };
          createdArtistsByName.set(normalizedName, artist);
          setArtists((prev) => [...prev, artist]);
          return artist;
        };

        // Create all artists
        for (const name of pendingArtistNames) {
          const artist = await getOrCreateArtist(name);
          if (artist?.artist_id != null) {
            allArtistIds.push(artist.artist_id);
            if (primaryArtistId == null) {
              primaryArtistId = artist.artist_id;
            }
          }
        }

        // Update artist images using Spotify validation if we have Spotify artist IDs
        if (pendingSpotifyArtistIds.length > 0 && allArtistIds.length > 0) {
          const imageUpdatePromises = pendingArtistNames.map(
            async (artistName, index) => {
              const dbArtistId = allArtistIds[index];
              if (!dbArtistId) return;

              // Try to find Spotify ID by artist name (most reliable)
              let spotifyArtistId: string | undefined =
                pendingArtistNameToIdMap.get(artistName);

              // REMOVED: Index-based fallback is unsafe - can match wrong artist
              // If name lookup fails, we should not assign an image rather than risk wrong assignment
              // The background service will fetch images later by name search

              if (spotifyArtistId) {
                try {
                  const validated =
                    await validateAndGetArtistImage(spotifyArtistId);
                  if (validated?.imageUrl) {
                    await artistService.update(dbArtistId, {
                      image_url: validated.imageUrl,
                      image_source_url: validated.sourceUrl,
                      image_source_provider: "spotify",
                    });
                    // Update local state
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
                  console.error(
                    `Error updating artist image from Spotify for "${artistName}":`,
                    err,
                  );
                  // Don't fail the whole operation if image validation fails
                }
              }
            },
          );

          // Wait for all image updates to complete (but don't block on errors)
          await Promise.allSettled(imageUpdatePromises);
        } else if (pendingBandcampMetadata?.artistImage) {
          // Fallback: if no Spotify IDs, still use Bandcamp image when available
          if (primaryArtistId != null) {
            try {
              const sourceUrl =
                pendingBandcampMetadata?.artistImageSourceUrl ||
                pendingBandcampMetadata?.pageUrl ||
                null;
              await artistService.update(primaryArtistId, {
                image_url: pendingBandcampMetadata.artistImage,
                image_source_url: sourceUrl,
                image_source_provider: "bandcamp",
              });
              setArtists((prev) =>
                prev.map((a) =>
                  a.artist_id === primaryArtistId
                    ? {
                        ...a,
                        image_url: pendingBandcampMetadata.artistImage,
                        image_source_url: sourceUrl,
                        image_source_provider: "bandcamp",
                      }
                    : a,
                ),
              );
            } catch (err) {
              console.error("Error updating artist image from Bandcamp:", err);
            }
          }
        }

        // Update artistId and selectedArtistIds with created artists
        if (primaryArtistId != null) {
          resolvedPrimaryArtistId = primaryArtistId;
          resolvedSelectedArtistIds = allArtistIds;
          setArtistId(primaryArtistId.toString());
          setSelectedArtistIds(allArtistIds);
        }

        // Clear pending artist names
        setPendingArtistNames([]);
        setPendingSpotifyArtistIds([]);
        setPendingArtistNameToIdMap(new Map());
      } else {
        // Use existing artistId if no pending artists
        if (artistId) {
          resolvedPrimaryArtistId = parseInt(artistId);
          resolvedSelectedArtistIds = selectedArtistIds;
        }
      }

      // Create album from pending name if needed
      if (pendingAlbumName) {
        let album = albums.find((a) => a.title === pendingAlbumName);

        if (!album) {
          // Determine album artist ID
          let albumArtistId: number | null = null;

          // Use resolved primary artist ID if available (prefer this over state variable)
          if (resolvedPrimaryArtistId !== null) {
            albumArtistId = resolvedPrimaryArtistId;
          } else if (artistId) {
            // Fallback to state variable if resolved ID not available
            albumArtistId = parseInt(artistId);
          }

          // Check if this is a "Various Artists" compilation (from Bandcamp metadata)
          const bandcampAlbumArtist = pendingBandcampMetadata?.albumArtist;
          const isVariousArtists =
            bandcampAlbumArtist &&
            /various\s+artists?/i.test(bandcampAlbumArtist.trim());

          if (
            !isVariousArtists &&
            bandcampAlbumArtist &&
            bandcampAlbumArtist.trim()
          ) {
            // Check if the album artist looks like a label name
            const albumArtistName = bandcampAlbumArtist.trim();
            const trackArtistName = pendingArtistNames[0] || "";

            const isLikelyLabel =
              albumArtistName !== trackArtistName &&
              !/various\s+artists?/i.test(albumArtistName) &&
              (albumArtistName.includes("-") ||
                albumArtistName.includes("Music") ||
                albumArtistName.includes("Records") ||
                albumArtistName.includes("Label"));

            if (!isLikelyLabel) {
              // Create or find album artist
              const normalizedName = normalizeArtistName(albumArtistName);
              const existingAlbumArtist = artists.find(
                (a) => normalizeArtistName(a.name) === normalizedName,
              );

              if (existingAlbumArtist) {
                albumArtistId = existingAlbumArtist.artist_id;
              } else {
                const newId = await artistService.create({
                  name: albumArtistName,
                });
                const newArtist = { artist_id: newId, name: albumArtistName };
                setArtists((prev) => [...prev, newArtist]);
                albumArtistId = newId;
              }
            }
          }

          // Ensure we have a valid artist ID for the album
          // Use resolvedPrimaryArtistId as fallback if albumArtistId is still null
          if (albumArtistId === null && resolvedPrimaryArtistId !== null) {
            albumArtistId = resolvedPrimaryArtistId;
          } else if (albumArtistId === null && artistId) {
            // Final fallback to state variable
            albumArtistId = parseInt(artistId);
          }

          // Only create album if we have a valid artist ID
          if (albumArtistId !== null) {
            // Create album
            const albumId = await albumService.create({
              title: pendingAlbumName,
              artist_id: albumArtistId,
              cover_image: pendingAlbumCoverArt || null,
            });
            album = {
              album_id: albumId,
              title: pendingAlbumName,
              artist_id: albumArtistId,
              cover_image: pendingAlbumCoverArt || null,
            };
            setAlbums([...albums, album]);
          } else {
            // Skip album creation if no valid artist ID available
            console.warn(
              "Skipping album creation: no valid artist ID available",
            );
          }
        }

        if (album?.album_id) {
          resolvedAlbumId = album.album_id;
          setAlbumId(album.album_id.toString());
        }

        // Clear pending album data
        setPendingAlbumName(null);
        setPendingAlbumCoverArt(null);
        setPendingBandcampMetadata(null);
      }

      // If multi-file mode, submit all files at once
      if (files.length > 1) {
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        // Track artists and albums created in this batch to prevent duplicates
        const createdArtistsInBatch = new Map<string, Artist>();
        const createdAlbumsInBatch = new Map<string, Album & { album_id: number }>();

        // Helper to get or create artist (reused for each file)
        const getOrCreateArtist = async (
          rawName: string,
        ): Promise<Artist | null> => {
          const trimmedName = rawName.trim();
          if (!trimmedName) {
            return null;
          }
          const normalizedName = normalizeArtistName(trimmedName);


          // Check if already created in this batch
          if (createdArtistsInBatch.has(normalizedName)) {
            return createdArtistsInBatch.get(normalizedName)!;
          }

          // Check if exists in database - query directly instead of relying on stale state
          // First check state (fast), then query DB if not found (more reliable)
          let existing: (Artist & { artist_id: number }) | undefined = artists.find(
            (a) => normalizeArtistName(a.name) === normalizedName,
          );
          
          // If not found in state, query database directly to avoid stale state issues
          if (!existing) {
            const allArtists = await artistService.getAll();
            const found = allArtists.find(
              (a) => normalizeArtistName(a.name) === normalizedName && a.artist_id !== undefined,
            );
            if (found && found.artist_id !== undefined) {
              existing = found as Artist & { artist_id: number };
            }
          }
          
          if (existing) {
            createdArtistsInBatch.set(normalizedName, existing);
            return existing;
          }


          // Create new artist
          const newId = await artistService.create({ name: trimmedName });
          const artist = { artist_id: newId, name: trimmedName };
          createdArtistsInBatch.set(normalizedName, artist);
          setArtists((prev) => [...prev, artist]);
          
          return artist;
        };

        for (let i = 0; i < files.length; i++) {
          // Update currentFileIndex to show progress in UI
          setCurrentFileIndex(i);
          
          const fileToSubmit = files[i];
          const fileState = fileFormStates.get(i);
          const fileMeta = fileMetadata.get(i);

          if (!fileState || !fileMeta) {
            errorCount++;
            errors.push(`File ${i + 1}: Missing metadata`);
            continue;
          }


          // Check for title and (artistId OR pendingArtistNames)
          const hasPendingArtists =
            fileState.pendingArtistNames &&
            fileState.pendingArtistNames.length > 0;
          if (
            !fileState.title.trim() ||
            (!fileState.artistId && !hasPendingArtists)
          ) {
            errorCount++;
            errors.push(`File ${i + 1}: Missing required fields`);
            continue;
          }

          try {
            // If we have pending artists, create them first
            let finalArtistId: number | null = null;
            let finalSelectedArtistIds: number[] = [];

            if (hasPendingArtists && fileState.pendingArtistNames) {
              // Filter out empty artist names before processing
              const validArtistNames = fileState.pendingArtistNames.filter(
                (name) => name && name.trim().length > 0
              );
              // Create all pending artists
              const allArtistIds: number[] = [];
              for (const name of validArtistNames) {
                const artist = await getOrCreateArtist(name);
                if (artist?.artist_id != null) {
                  allArtistIds.push(artist.artist_id);
                  if (finalArtistId == null) {
                    finalArtistId = artist.artist_id;
                  }
                }
              }
              finalSelectedArtistIds = allArtistIds;
            } else if (fileState.artistId) {
              // Use existing artistId
              finalArtistId = parseInt(fileState.artistId);
              finalSelectedArtistIds = Array.from(
                new Set([finalArtistId, ...fileState.selectedArtistIds]),
              );
            }

            if (!finalArtistId) {
              errorCount++;
              errors.push(`File ${i + 1}: Failed to resolve artist ID`);
              continue;
            }

            // Handle album creation if we have pending album name
            let finalAlbumId: number | null = null;
            
            // If we have albumId but no pendingAlbumName, look up the album name
            // This handles the case where user selected an album from dropdown
            let resolvedPendingAlbumName = fileState.pendingAlbumName;
            if (!resolvedPendingAlbumName && fileState.albumId) {
              const selectedAlbum = albums.find(
                (a) => a.album_id?.toString() === fileState.albumId
              );
              if (selectedAlbum?.title) {
                resolvedPendingAlbumName = selectedAlbum.title;
              }
              // If still not found, query database
              if (!resolvedPendingAlbumName && fileState.albumId) {
                const allAlbums = await albumService.getAll();
                const foundAlbum = allAlbums.find(
                  (a) => a.album_id?.toString() === fileState.albumId
                );
                if (foundAlbum?.title) {
                  resolvedPendingAlbumName = foundAlbum.title;
                }
              }
            }
            
            if (resolvedPendingAlbumName) {
              
              // Validate album name is not empty
              const trimmedAlbumName = resolvedPendingAlbumName.trim();
              if (!trimmedAlbumName) {
                // Skip album creation if name is empty
              } else {
                // Check if already created in this batch
                let album = createdAlbumsInBatch.get(trimmedAlbumName);
                
                if (!album) {
                  // Check if album already exists in database - query directly to avoid stale state
                  album = albums.find(
                    (a) => a.title === trimmedAlbumName,
                  ) as Album & { album_id: number } | undefined;
                  
                  // If not found in state, query database directly
                  if (!album) {
                    const allAlbums = await albumService.getAll();
                    album = allAlbums.find(
                      (a) => a.title === trimmedAlbumName,
                    ) as Album & { album_id: number } | undefined;
                  }
                }

                if (!album) {
                  // Create album with the resolved artist
                  const albumId = await albumService.create({
                    title: trimmedAlbumName,
                    artist_id: finalArtistId,
                    cover_image: fileState.pendingAlbumCoverArt || null,
                  });
                  album = {
                    album_id: albumId,
                    title: trimmedAlbumName,
                    artist_id: finalArtistId,
                    cover_image: fileState.pendingAlbumCoverArt || null,
                  };
                  createdAlbumsInBatch.set(trimmedAlbumName, album);
                  setAlbums((prev) => [
                    ...prev,
                    album as Album & { album_id: number },
                  ]);
                } else {
                }
                finalAlbumId = album.album_id;
              }
            } else if (fileState.albumId) {
              finalAlbumId = parseInt(fileState.albumId);
            }

            // Read file as Blob
            const fileBlob = await fileToSubmit
              .arrayBuffer()
              .then((buf) => new Blob([buf], { type: fileToSubmit.type }));

            // Create song in IndexedDB
            const newSongId = await songService.create({
              title: fileState.title.trim(),
              artist_id: finalArtistId,
              album_id: finalAlbumId,
              duration: fileMeta.duration,
              file_blob: fileBlob,
              url: null,
              bandcamp_page_url: null,
              cover_image: fileState.coverImage || null,
            });

            // Associate artists with this song (many-to-many)
            await songArtistService.setArtistsForSong(
              newSongId,
              finalSelectedArtistIds,
            );

            successCount++;
          } catch (err: any) {
            errorCount++;
            errors.push(
              `File ${i + 1}: ${err.message || "Failed to create song"}`,
            );
            console.error(`Error creating song for file ${i + 1}:`, err);
          }
        }


        // Reset currentFileIndex after upload completes
        setCurrentFileIndex(null);

        setLoading(false);
        
        if (errorCount > 0) {
          setError(
            `Successfully added ${successCount} song(s). ${errorCount} song(s) failed:\n${errors.join(
              "\n",
            )}`,
          );
          // Don't navigate if there were errors - let user see the error
          if (successCount === 0) {
            // All failed, stay on page
            return;
          }
        }

        // All successful or some successful - navigate
        navigate("/songs");
        return;
      }

      // Single file mode - original behavior
      let fileBlob: Blob | undefined = undefined;

      // Read file as Blob if file is provided
      if (file) {
        fileBlob = await file
          .arrayBuffer()
          .then((buf) => new Blob([buf], { type: file.type }));
      }

      // Use resolved artist ID (from pending names) or fall back to state
      const finalArtistId =
        resolvedPrimaryArtistId ?? (artistId ? parseInt(artistId) : null);
      const finalSelectedArtistIds =
        resolvedSelectedArtistIds.length > 0
          ? resolvedSelectedArtistIds
          : selectedArtistIds;
      // Use resolved album ID (from pending name) or fall back to state
      const finalAlbumId =
        resolvedAlbumId ?? (albumId ? parseInt(albumId) : null);

      if (!finalArtistId) {
        setError("Artist is required");
        setLoading(false);
        return;
      }

      // Create song in IndexedDB
      const newSongId = await songService.create({
        title: title.trim(),
        artist_id: finalArtistId,
        album_id: finalAlbumId,
        duration: finalDuration,
        file_blob: fileBlob,
        url: songUrl || null,
        bandcamp_page_url: bandcampPageUrl || null,
        cover_image: coverImage || null,
      });

      // Associate artists with this song (many-to-many)
      // Always associate all detected artists; Bandcamp uses explicit separators only
      const artistIdsToAssociate = Array.from(
        new Set([finalArtistId, ...finalSelectedArtistIds]),
      );

      if (import.meta.env.DEV) {
        console.log("Associating song with artists:", {
          songId: newSongId,
          primaryArtistId: finalArtistId,
          allArtistIds: artistIdsToAssociate,
          selectedArtistIds: finalSelectedArtistIds,
          isBandcampSong:
            !!bandcampPageUrl || (songUrl && isBandcampUrl(songUrl)),
        });
      }

      await songArtistService.setArtistsForSong(
        newSongId,
        artistIdsToAssociate,
      );

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
      setError(
        "No tracks with valid audio URLs selected. Please select tracks that have audio available.",
      );
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Check if album artist is "Various Artists" or similar compilation indicator
      const isVariousArtists =
        albumResult.artist &&
        /various\s+artists?/i.test(albumResult.artist.trim());

      // For "Various Artists" albums, we don't create an artist entity
      // Each track will have its own individual artist
      let albumArtistId: number | null = null;
      let albumArtistForTracks: Artist | null = null;
      let albumArtistsForTracks: Artist[] = [];

      if (!isVariousArtists && albumResult.artist) {
        // Create album artist only if it's not "Various Artists"
        const parsedAlbumArtistNames = splitArtistNames(albumResult.artist, {
          includeFeaturing: false,
        });
        const albumArtistNames =
          parsedAlbumArtistNames.length > 0
            ? parsedAlbumArtistNames
            : [albumResult.artist];

        for (const artistName of albumArtistNames) {
          let albumArtist = artists.find((a) => a.name === artistName);
          if (!albumArtist) {
            const newId = await artistService.create({ name: artistName });
            albumArtist = { artist_id: newId, name: artistName };
            setArtists((prev) => [...prev, albumArtist!]);
          }
          if (albumArtist) {
            albumArtistsForTracks.push(albumArtist);
          }
        }

        const primaryAlbumArtist = albumArtistsForTracks[0] || null;
        if (primaryAlbumArtist?.artist_id != null) {
          albumArtistId = primaryAlbumArtist.artist_id;
          albumArtistForTracks = primaryAlbumArtist;

          const hasArtistMismatch = isBandcampArtistMismatch(
            primaryAlbumArtist.name,
            albumResult.pageUrl,
          );

          if (hasArtistMismatch) {
            try {
              const bandcampImage = await fetchBandcampArtistImage(
                primaryAlbumArtist.name,
              );
              const resolvedImage = await artistImageService.fetchArtistImage(
                primaryAlbumArtist.name,
                bandcampImage?.imageUrl,
                bandcampImage?.sourceUrl || undefined,
              );

              if (resolvedImage?.imageUrl) {
                await artistService.update(primaryAlbumArtist.artist_id, {
                  image_url: resolvedImage.imageUrl,
                  image_source_url: resolvedImage.sourceUrl,
                  image_source_provider: resolvedImage.sourceProvider,
                });
                albumArtistForTracks = {
                  ...primaryAlbumArtist,
                  image_url: resolvedImage.imageUrl,
                  image_source_url: resolvedImage.sourceUrl,
                  image_source_provider: resolvedImage.sourceProvider,
                };
                setArtists((prev) =>
                  prev.map((a) =>
                    a.artist_id === primaryAlbumArtist.artist_id
                      ? {
                          ...a,
                          image_url: resolvedImage.imageUrl,
                          image_source_url: resolvedImage.sourceUrl,
                          image_source_provider: resolvedImage.sourceProvider,
                        }
                      : a,
                  ),
                );
              }
            } catch (err) {
              console.error("Error resolving artist image:", err);
            }
          } else if (albumResult.artistImage) {
            // Update artist image if Bandcamp provided one
            try {
              const sourceUrl =
                albumResult.artistImageSourceUrl || albumResult.pageUrl || null;
              await artistService.update(primaryAlbumArtist.artist_id, {
                image_url: albumResult.artistImage,
                image_source_url: sourceUrl,
                image_source_provider: "bandcamp",
              });
              albumArtistForTracks = {
                ...primaryAlbumArtist,
                image_url: albumResult.artistImage,
                image_source_url: sourceUrl,
                image_source_provider: "bandcamp",
              };
              setArtists((prev) =>
                prev.map((a) =>
                  a.artist_id === primaryAlbumArtist.artist_id
                    ? {
                        ...a,
                        image_url: albumResult.artistImage,
                        image_source_url: sourceUrl,
                        image_source_provider: "bandcamp",
                      }
                    : a,
                ),
              );
            } catch (err) {
              console.error("Error updating artist image:", err);
            }
          }
        }
      }

      // Create songs for selected tracks (only valid ones)
      const selectedTrackIndices = validSelectedTracks.sort();
      let successCount = 0;
      let errorCount = 0;
      let firstTrackArtistId: number | null = null;

      // Track created artists during this operation to avoid duplicates
      const createdArtistsMap = new Map<string, Artist>();

      // Helper function to get or create artist(s) from a name string
      // Handles multiple artists separated by "/", "&", ",", etc.
      const getOrCreateArtists = async (
        artistNameString: string,
      ): Promise<Artist[]> => {
        if (!artistNameString || !artistNameString.trim()) {
          return [];
        }

        // Split artist name into multiple artists if needed
        const artistNames = splitArtistNames(artistNameString)
          .map((name) => name.trim())
          .filter((name) => name.length > 0); // Filter out empty names

        if (artistNames.length === 0) {
          return [];
        }

        const resultArtists: Artist[] = [];

        for (const artistName of artistNames) {
          // Skip empty names
          if (!artistName || artistName.trim().length === 0) {
            continue;
          }

          // Check if we already created it in this operation
          if (createdArtistsMap.has(artistName)) {
            resultArtists.push(createdArtistsMap.get(artistName)!);
            continue;
          }

          // Check if it exists in the database
          let artist = artists.find((a) => a.name === artistName);
          if (!artist) {
            const newId = await artistService.create({ name: artistName });
            artist = { artist_id: newId, name: artistName };
            setArtists((prev) => [...prev, artist!]);

            // Try to fetch Bandcamp image for this artist
            try {
              const response = await fetch(
                `/api/bandcamp-artist-image?artist=${encodeURIComponent(
                  artistName,
                )}`,
              );
              if (response.ok) {
                const data = await response.json();
                if (data.imageUrl) {
                  const sourceUrl = data.sourceUrl || null;
                  await artistService.update(newId, {
                    image_url: data.imageUrl,
                    image_source_url: sourceUrl,
                    image_source_provider: "bandcamp",
                  });
                  artist = {
                    ...artist,
                    image_url: data.imageUrl,
                    image_source_url: sourceUrl,
                    image_source_provider: "bandcamp",
                  };
                  setArtists((prev) =>
                    prev.map((a) =>
                      a.artist_id === newId
                        ? {
                            ...a,
                            image_url: data.imageUrl,
                            image_source_url: sourceUrl,
                            image_source_provider: "bandcamp",
                          }
                        : a,
                    ),
                  );
                }
              }
            } catch (err) {
              console.error(
                `Error fetching Bandcamp image for ${artistName}:`,
                err,
              );
              // Continue without image - Spotify fallback will handle it later
            }
          } else if (!artist.image_source_url) {
            try {
              const response = await fetch(
                `/api/bandcamp-artist-image?artist=${encodeURIComponent(
                  artistName,
                )}`,
              );
              if (response.ok) {
                const data = await response.json();
                if (data.sourceUrl || data.imageUrl) {
                  const sourceUrl = data.sourceUrl || null;
                  const imageUrl = data.imageUrl || artist.image_url || null;
                  await artistService.update(artist.artist_id!, {
                    image_url: imageUrl,
                    image_source_url: sourceUrl,
                    image_source_provider: sourceUrl ? "bandcamp" : null,
                  });
                  artist = {
                    ...artist,
                    image_url: imageUrl,
                    image_source_url: sourceUrl,
                    image_source_provider: sourceUrl ? "bandcamp" : null,
                  };
                  setArtists((prev) =>
                    prev.map((a) =>
                      a.artist_id === artist?.artist_id
                        ? {
                            ...a,
                            image_url: imageUrl,
                            image_source_url: sourceUrl,
                            image_source_provider: sourceUrl
                              ? "bandcamp"
                              : null,
                          }
                        : a,
                    ),
                  );
                }
              }
            } catch (err) {
              console.error(
                `Error backfilling Bandcamp source for ${artistName}:`,
                err,
              );
            }
          }

          if (artist) {
            createdArtistsMap.set(artistName, artist);
            resultArtists.push(artist);
          }
        }

        return resultArtists;
      };

      // First pass: determine first track's artist for album creation
      if (!albumArtistId && selectedTrackIndices.length > 0) {
        const firstTrack = albumResult.tracks[selectedTrackIndices[0]];
        if (firstTrack) {
          let trackTitle = firstTrack.title || "";
          let trackArtistName: string | null = null;

          if ((firstTrack as any).artist) {
            trackArtistName = (firstTrack as any).artist;
          } else if (isVariousArtists) {
            // Only parse "Artist - Track Name" format for compilation albums
            // Parse "Artist - Track Name" format
            // Use lastIndexOf to find the separator (handles artist names with hyphens like "NA-3LDK")
            const lastSeparatorIndex = trackTitle.lastIndexOf(" - ");
            if (lastSeparatorIndex > 0) {
              trackArtistName = trackTitle
                .substring(0, lastSeparatorIndex)
                .trim();
            } else {
              // Fallback: try pattern with spaces
              const titleMatch = trackTitle.match(/^(.+?)\s+-\s+(.+)$/);
              if (titleMatch) {
                trackArtistName = titleMatch[1].trim();
              }
            }
          }
          // For regular albums, trackArtistName stays null and we'll use album artist

          if (trackArtistName) {
            const trackArtists = await getOrCreateArtists(trackArtistName);
            if (trackArtists.length > 0) {
              firstTrackArtistId = trackArtists[0].artist_id!;
            }
          }
        }
      }

      // Find or create album (use albumArtistId, or first track's artist for "Various Artists")
      let album = albums.find((a) => a.title === albumResult.album);
      if (!album && albumResult.album) {
        // For "Various Artists" albums, use first track's artist as placeholder
        // (database requires artist_id, but display will show "Various Artists")
        const albumId = await albumService.create({
          title: albumResult.album,
          artist_id: albumArtistId || firstTrackArtistId || 1,
        });
        album = {
          album_id: albumId,
          title: albumResult.album,
          artist_id: albumArtistId || firstTrackArtistId || 1,
        };
        setAlbums([...albums, album]);
      }

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
            console.warn(
              `Skipping track "${track.title}" - no valid audio URL`,
            );
            errorCount++;
            continue;
          }

          // Parse track title to extract artist and title
          // Backend may have already parsed it, but handle both cases
          let trackTitle = track.title || "";
          let trackArtistName: string | null = null;

          // Only parse "Artist - Track Name" format if this is a "Various Artists" compilation
          // For regular albums, all tracks are by the album artist
          if (isVariousArtists) {
            // Check if backend already extracted the artist
            if ((track as any).artist) {
              trackArtistName = (track as any).artist;
            } else {
              // Parse "Artist - Track Name" format
              // Use lastIndexOf to find the separator (handles artist names with hyphens like "NA-3LDK")
              const lastSeparatorIndex = trackTitle.lastIndexOf(" - ");
              if (lastSeparatorIndex > 0) {
                trackArtistName = trackTitle
                  .substring(0, lastSeparatorIndex)
                  .trim();
                trackTitle = trackTitle
                  .substring(lastSeparatorIndex + 3)
                  .trim();
              } else {
                // Fallback: try pattern with spaces
                const titleMatch = trackTitle.match(/^(.+?)\s+-\s+(.+)$/);
                if (titleMatch) {
                  trackArtistName = titleMatch[1].trim();
                  trackTitle = titleMatch[2].trim();
                }
              }
            }
          } else {
            // For regular albums, use the album artist for all tracks
            // Don't parse the title - keep it as-is
            trackArtistName = null; // Will use album artist as fallback
          }

          // Get or create track artist(s) - handles multiple artists like "NA-3LDK / DEFRIC"
          let trackArtists: Artist[] = [];
          if (trackArtistName) {
            trackArtists = await getOrCreateArtists(trackArtistName);
          }

          if (!isVariousArtists && trackArtists.length === 0) {
            trackArtists = albumArtistsForTracks;
          }

          // Fallback: use album artist if no track artist found
          if (trackArtists.length === 0) {
            if (!albumArtistId) {
              throw new Error(
                `Could not determine artist for track "${track.title}"`,
              );
            }
            const albumArtist =
              albumArtistForTracks ||
              artists.find((a) => a.artist_id === albumArtistId);
            if (albumArtist) {
              trackArtists = [albumArtist];
            }
          }

          // Use first artist as primary artist_id (required by database)
          const primaryTrackArtistId = trackArtists[0]?.artist_id;
          if (!primaryTrackArtistId) {
            throw new Error(
              `Could not determine artist for track "${track.title}"`,
            );
          }

          const newSongId = await songService.create({
            title: trackTitle,
            artist_id: primaryTrackArtistId,
            album_id: album?.album_id || null,
            duration: track.duration || "00:00:00",
            url: track.audioUrl,
            bandcamp_page_url: albumResult.pageUrl || null,
            cover_image: albumResult.coverArt || null,
          });

          // Associate all track artists with this song (handles multiple artists)
          const trackArtistIds = trackArtists
            .map((a) => a.artist_id)
            .filter((id): id is number => id !== null && id !== undefined);
          await songArtistService.setArtistsForSong(newSongId, trackArtistIds);
          successCount++;
        } catch (err: any) {
          console.error(`Failed to create song "${track.title}":`, err);
          errorCount++;
        }
      }

      if (successCount > 0) {
        if (errorCount > 0) {
          setError(
            `Added ${successCount} track(s) successfully. ${errorCount} track(s) could not be added (no valid audio URL found).`,
          );
          // Still navigate but show the error
          setTimeout(() => navigate("/songs"), 2000);
        } else {
          navigate("/songs");
        }
      } else {
        setError(
          `Failed to add tracks. ${
            errorCount > 0
              ? `${errorCount} track(s) had errors - some tracks may not have valid audio URLs available from Bandcamp.`
              : ""
          }`,
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
      validTrackIndices.includes(index),
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
              <div
                style={{ color: "var(--text-secondary)", marginBottom: "4px" }}
              >
                {albumResult.artist}
              </div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.85em",
                  marginTop: "8px",
                }}
              >
                {albumResult.tracks.length} track
                {albumResult.tracks.length !== 1 ? "s" : ""}
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
                const validSelectedCount = Array.from(selectedTracks).filter(
                  (index) => validTrackIndices.includes(index),
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
                const validSelectedCount = Array.from(selectedTracks).filter(
                  (index) => {
                    const track = albumResult.tracks[index];
                    if (!track) return false;
                    const isValidAudioUrl =
                      track.audioUrl &&
                      (track.audioUrl.includes("bcbits.com") ||
                        track.audioUrl.includes(".mp3") ||
                        track.audioUrl.includes(".ogg") ||
                        track.audioUrl.includes(".flac"));
                    return isValidAudioUrl;
                  },
                ).length;
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
                    onChange={() =>
                      isValidAudioUrl && toggleTrackSelection(index)
                    }
                    onClick={(e) => e.stopPropagation()}
                    disabled={!isValidAudioUrl}
                    style={{
                      cursor: isValidAudioUrl ? "pointer" : "not-allowed",
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: selectedTracks.has(index)
                          ? "bold"
                          : "normal",
                        color: isValidAudioUrl
                          ? "var(--text-primary)"
                          : "var(--text-muted)",
                        marginBottom: "4px",
                      }}
                    >
                      {track.trackNumber}.{" "}
                      {track.title || `Track ${track.trackNumber}`}
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
                : (() => {
                    const validSelectedCount = Array.from(
                      selectedTracks,
                    ).filter((index) => {
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

                    return `Add ${validSelectedCount} Track${
                      validSelectedCount !== 1 ? "s" : ""
                    }`;
                  })()}
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
            // Stop preview audio if playing
            if (previewAudioRef.current) {
              previewAudioRef.current.pause();
              previewAudioRef.current = null;
            }
            setPlayingFileIndex(null);

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
            // Stop preview audio if playing
            if (previewAudioRef.current) {
              previewAudioRef.current.pause();
              previewAudioRef.current = null;
            }
            setPlayingFileIndex(null);

            setAddMode("bandcamp");
            setError(null);
            // Clear file when switching to Bandcamp
            setFile(null);
            setFiles([]);
            setCurrentFileIndex(null);
            setFileMetadata(new Map());
            setDuration("");
          }}
        >
          Bandcamp
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {addMode === "upload" ? (
          <>
            <div className="form-group">
              <label className="form-label">//audio file</label>
              <div className="file-input-row">
                <label className="btn btn-primary file-input-button">
                  {files.length > 1 ? "choose files" : "choose file"}
                  <input
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={async (e) => {
                      const selectedFiles = e.target.files;
                      if (selectedFiles && selectedFiles.length > 0) {
                        if (selectedFiles.length === 1) {
                          // Single file - use old behavior
                          const selectedFile = selectedFiles[0];
                          setFile(selectedFile);
                          setFiles([selectedFile]);
                          setCurrentFileIndex(null);

                          // Extract duration from audio file
                          try {
                            const audio = new Audio();
                            const objectUrl = URL.createObjectURL(selectedFile);
                            audio.src = objectUrl;

                            await new Promise((resolve, reject) => {
                              audio.addEventListener("loadedmetadata", () => {
                                const durationSeconds = Math.floor(
                                  audio.duration,
                                );
                                const hours = Math.floor(
                                  durationSeconds / 3600,
                                );
                                const minutes = Math.floor(
                                  (durationSeconds % 3600) / 60,
                                );
                                const seconds = durationSeconds % 60;

                                const durationStr = `${String(hours).padStart(
                                  2,
                                  "0",
                                )}:${String(minutes).padStart(2, "0")}:${String(
                                  seconds,
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
                              "Failed to extract duration from audio file. Please try another file.",
                            );
                          }
                        } else {
                          // Multiple files - use new multi-file flow
                          await handleFilesSelected(selectedFiles);
                        }
                      } else {
                        setFile(null);
                        setFiles([]);
                        setCurrentFileIndex(null);
                        setDuration("");
                        setFileMetadata(new Map());
                      }
                    }}
                  />
                </label>
                <div className="file-input-name">
                  {files.length > 1
                    ? `${files.length} file${
                        files.length !== 1 ? "s" : ""
                      } selected`
                    : file
                      ? file.name
                      : "no file selected"}
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

            {/* File list with preview - only show when multiple files selected */}
            {files.length > 1 && (
              <div className="form-group">
                <label className="form-label">//files ({files.length})</label>
                <div
                  style={{
                    maxHeight: "300px",
                    overflowY: "auto",
                    border: "1px solid var(--border-color)",
                    borderRadius: "4px",
                    backgroundColor: "var(--card-bg)",
                  }}
                >
                  {files.map((f, index) => {
                    const metadata = fileMetadata.get(index);
                    const isCurrent = currentFileIndex === index;
                    const isPlaying = playingFileIndex === index;
                    const fileState = fileFormStates.get(index);
                    // A file is complete if it has a title AND (an artistId OR pending artist names)
                    const hasPendingArtists =
                      fileState?.pendingArtistNames &&
                      fileState.pendingArtistNames.length > 0;
                    const isFileComplete = fileState
                      ? !!(
                          fileState.title.trim() &&
                          (fileState.artistId || hasPendingArtists)
                        )
                      : false;
                    // Calculate isIncomplete from fileFormStates to keep it in sync
                    const isIncomplete = !isFileComplete;
                    const durationStr = metadata?.duration || "00:00:00";
                    const currentTime = playbackTimes.get(index) || 0;
                    const durationSeconds = metadata?.durationSeconds || 0;
                    const progress =
                      durationSeconds > 0
                        ? (currentTime / durationSeconds) * 100
                        : 0;

                    const formatTime = (seconds: number): string => {
                      const mins = Math.floor(seconds / 60);
                      const secs = Math.floor(seconds % 60);
                      return `${mins}:${secs.toString().padStart(2, "0")}`;
                    };

                    return (
                      <div
                        key={index}
                        onClick={() => handleFileClick(index)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          padding: "12px",
                          borderBottom:
                            index < files.length - 1
                              ? "1px solid var(--border-color)"
                              : "none",
                          borderLeft: isIncomplete
                            ? "3px solid var(--error-color, #ef4444)"
                            : "none",
                          backgroundColor: isCurrent
                            ? "var(--button-hover)"
                            : isIncomplete
                              ? "rgba(239, 68, 68, 0.1)"
                              : "transparent",
                          cursor: "pointer",
                          transition: "background-color 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!isCurrent) {
                            e.currentTarget.style.backgroundColor =
                              "var(--card-bg)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isCurrent) {
                            e.currentTarget.style.backgroundColor =
                              "transparent";
                          }
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              minWidth: "24px",
                              textAlign: "center",
                              color: isCurrent
                                ? "var(--text-primary)"
                                : "var(--text-muted)",
                              fontWeight: isCurrent ? "600" : "normal",
                            }}
                          >
                            {index + 1}
                          </div>
                          {(metadata?.coverArt || fileState?.coverImage) && (
                            <img
                              src={metadata?.coverArt || fileState?.coverImage || ""}
                              alt="Cover art"
                              style={{
                                width: "40px",
                                height: "40px",
                                objectFit: "cover",
                                borderRadius: "4px",
                                flexShrink: 0,
                              }}
                              onError={(e) => {
                                // Hide broken images
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          )}
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: "0.9em",
                                fontWeight: isCurrent ? "600" : "500",
                                color: "var(--text-primary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                marginBottom: "4px",
                              }}
                              title={f.name}
                            >
                              {f.name}
                            </div>
                            <div
                              style={{
                                fontSize: "0.8em",
                                color: "var(--text-muted)",
                              }}
                            >
                              {durationStr}
                              {isCurrent && (
                                <span
                                  style={{
                                    marginLeft: "8px",
                                    color: "var(--text-secondary)",
                                    fontWeight: "500",
                                  }}
                                >
                                  • Processing
                                </span>
                              )}
                              {isIncomplete && (
                                <span
                                  style={{
                                    marginLeft: "8px",
                                    color: "var(--error-color, #ef4444)",
                                    fontWeight: "600",
                                  }}
                                >
                                  • Missing metadata
                                </span>
                              )}
                              {!isIncomplete && isFileComplete && (
                                <span
                                  style={{
                                    marginLeft: "8px",
                                    color: "var(--playing-color)",
                                    fontWeight: "500",
                                  }}
                                >
                                  • Complete
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="btn btn-small"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handlePreviewPlay(index, e);
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                            style={{
                              minWidth: "60px",
                              pointerEvents: "auto",
                            }}
                          >
                            {isPlaying ? "⏸ pause" : "▶ play"}
                          </button>
                          <button
                            className="btn btn-small btn-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleRemoveFile(index, e);
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                            style={{
                              minWidth: "32px",
                              width: "32px",
                              padding: "4px 10px",
                              pointerEvents: "auto",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "18px",
                              lineHeight: "1",
                            }}
                          >
                            ×
                          </button>
                        </div>

                        {/* Progress bar */}
                        {isPlaying && durationSeconds > 0 && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginTop: "4px",
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span
                              style={{
                                fontSize: "0.75em",
                                color: "var(--text-muted)",
                                minWidth: "40px",
                              }}
                            >
                              {formatTime(currentTime)}
                            </span>
                            <div
                              onClick={(e) => handleProgressSeek(index, e)}
                              style={{
                                flex: 1,
                                height: "4px",
                                backgroundColor: "var(--border-color)",
                                borderRadius: "2px",
                                cursor: "pointer",
                                position: "relative",
                              }}
                            >
                              <div
                                style={{
                                  width: `${progress}%`,
                                  height: "100%",
                                  backgroundColor: "var(--playing-color)",
                                  borderRadius: "2px",
                                  transition: "width 0.1s linear",
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontSize: "0.75em",
                                color: "var(--text-muted)",
                                minWidth: "40px",
                                textAlign: "right",
                              }}
                            >
                              {formatTime(durationSeconds)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {currentFileIndex !== null && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "8px 12px",
                      backgroundColor: "var(--button-hover)",
                      borderRadius: "4px",
                      fontSize: "0.9em",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Processing file {currentFileIndex + 1} of {files.length}:{" "}
                    <strong>{files[currentFileIndex]?.name}</strong>
                  </div>
                )}
              </div>
            )}

            {/* Metadata source toggle */}
            <div className="form-group">
              <label className="form-label">//metadata source</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "8px 12px",
                  backgroundColor: "var(--card-bg)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "0.9em",
                    color: useSpotifyMetadata
                      ? "var(--text-muted)"
                      : "var(--text-primary)",
                    fontWeight: useSpotifyMetadata ? "normal" : "600",
                  }}
                >
                  Manual
                </span>
                <button
                  type="button"
                  onClick={() => setUseSpotifyMetadata(!useSpotifyMetadata)}
                  style={{
                    width: "44px",
                    height: "24px",
                    borderRadius: "12px",
                    border: "none",
                    backgroundColor: useSpotifyMetadata
                      ? "var(--button-hover)"
                      : "var(--border-color)",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background-color 0.2s ease",
                  }}
                  aria-label={useSpotifyMetadata ? "Use Spotify" : "Use Manual"}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      backgroundColor: useSpotifyMetadata
                        ? "var(--text-primary)"
                        : "var(--card-bg)",
                      position: "absolute",
                      top: "2px",
                      left: useSpotifyMetadata ? "22px" : "2px",
                      transition: "left 0.2s ease, background-color 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
                <span
                  style={{
                    fontSize: "0.9em",
                    color: useSpotifyMetadata
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    fontWeight: useSpotifyMetadata ? "600" : "normal",
                  }}
                >
                  Spotify
                </span>
              </div>
            </div>

            {/* Search song section - appears after file selection, only if Spotify is enabled */}
            {useSpotifyMetadata && (
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
                  placeholder={
                    file || files.length > 0
                      ? "type song name or paste Spotify link..."
                      : "add a file first to search for metadata..."
                  }
                  disabled={!file && files.length === 0}
                  onFocus={() =>
                    searchResults.length > 0 && setShowResults(true)
                  }
                  style={{
                    opacity: !file && files.length === 0 ? 0.6 : 1,
                    cursor:
                      !file && files.length === 0 ? "not-allowed" : "text",
                  }}
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
                      searchResults.map((result, index) => {
                        const resultType = getBandcampResultType(result);
                        return (
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
                              e.currentTarget.style.backgroundColor =
                                "var(--card-bg)";
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
                                {resultType && (
                                  <span
                                    style={{
                                      textTransform: "capitalize",
                                      marginLeft: "6px",
                                      padding: "2px 6px",
                                      backgroundColor:
                                        "var(--card-bg, rgba(255, 255, 255, 0.1))",
                                      border:
                                        "1px solid var(--border-color, rgba(255, 255, 255, 0.2))",
                                      borderRadius: "3px",
                                      fontSize: "0.85em",
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {resultType}
                                  </span>
                                )}
                                {result.album && ` • ${result.album}`}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div
            className="form-group"
            ref={searchContainerRef}
            style={{ position: "relative" }}
          >
            <label className="form-label">//bandcamp search or url</label>
            <input
              type="text"
              className="form-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="type album or track, or paste Bandcamp URL..."
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
                  searchResults.map((result, index) => {
                    const resultType = getBandcampResultType(result);
                    return (
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
                          e.currentTarget.style.backgroundColor =
                            "var(--card-bg)";
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
                            {resultType && (
                              <span
                                style={{
                                  textTransform: "capitalize",
                                  marginLeft: "6px",
                                  padding: "2px 6px",
                                  backgroundColor:
                                    "var(--card-bg, rgba(255, 255, 255, 0.1))",
                                  border:
                                    "1px solid var(--border-color, rgba(255, 255, 255, 0.2))",
                                  borderRadius: "3px",
                                  fontSize: "0.85em",
                                  color: "var(--text-primary)",
                                }}
                              >
                                {resultType}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
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
                  searchResults.map((result, index) => {
                    const resultType = getBandcampResultType(result);
                    return (
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
                          e.currentTarget.style.backgroundColor =
                            "var(--card-bg)";
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
                            {resultType && (
                              <span
                                style={{
                                  textTransform: "capitalize",
                                  marginLeft: "6px",
                                  padding: "2px 6px",
                                  backgroundColor:
                                    "var(--card-bg, rgba(255, 255, 255, 0.1))",
                                  border:
                                    "1px solid var(--border-color, rgba(255, 255, 255, 0.2))",
                                  borderRadius: "3px",
                                  fontSize: "0.85em",
                                  color: "var(--text-primary)",
                                }}
                              >
                                {resultType}
                              </span>
                            )}
                            {result.album && ` • ${result.album}`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {addMode === "upload" ? (
          <>
            {/* Only show title, artist, and album fields when in manual metadata mode */}
            {!useSpotifyMetadata && (
              <>
                <div className="form-group">
                  <label className="form-label">//title</label>
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
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
                      onChange={(e) => {
                        setAlbumId(e.target.value);
                        // Clear pending album if user manually changes selection
                        if (e.target.value) {
                          setPendingAlbumName(null);
                          setPendingAlbumCoverArt(null);
                        }
                      }}
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
                      onChange={(e) => {
                        setArtistId(e.target.value);
                        // Clear pending artists if user manually changes selection
                        if (e.target.value) {
                          setPendingArtistNames([]);
                          setPendingSpotifyArtistIds([]);
                          setPendingArtistNameToIdMap(new Map());
                        }
                      }}
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
            )}

            {/* Show metadata preview when using Spotify and a result is selected */}
            {useSpotifyMetadata &&
              pendingArtistNames.length > 0 &&
              !pendingBandcampMetadata &&
              title && (
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
                      <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                        {title}
                      </div>
                      <div
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: "14px",
                        }}
                      >
                        {pendingArtistNames.join(", ")}
                        {pendingAlbumName && ` • ${pendingAlbumName}`}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                    {artists.find((a) => a.artist_id?.toString() === artistId)
                      ?.name || "Unknown Artist"}
                  </div>
                  {albums.find((a) => a.album_id?.toString() === albumId) && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                      }}
                    >
                      {
                        albums.find((a) => a.album_id?.toString() === albumId)
                          ?.title
                      }
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              loading ||
              (addMode === "bandcamp" &&
                (searchLoading || !songUrl || !title.trim() || !artistId)) ||
              (files.length > 1 && incompleteFiles.size > 0)
            }
          >
            {loading
              ? addMode === "bandcamp"
                ? "adding..."
                : files.length > 1 && currentFileIndex !== null
                  ? `uploading ${currentFileIndex + 1}/${files.length}...`
                  : "uploading..."
              : addMode === "bandcamp"
                ? searchLoading
                  ? "processing..."
                  : !songUrl
                    ? "waiting for url..."
                    : "add song"
                : files.length > 1
                  ? incompleteFiles.size > 0
                    ? `add all songs (${files.length - incompleteFiles.size}/${files.length} complete)`
                    : `add all songs (${files.length})`
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
