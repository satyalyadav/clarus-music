import Dexie, { Table } from 'dexie';

// Type definitions matching the backend schema
export interface Song {
  song_id?: number;
  title: string;
  artist_id: number;
  album_id?: number | null;
  genre_id: number;
  duration: string; // HH:MM:SS format
  file_blob?: Blob; // Audio file stored as Blob
  file_handle?: FileSystemFileHandle; // Alternative: File System Access API handle
  cover_image?: string | null;
  created_at?: number; // Timestamp
}

export interface Album {
  album_id?: number;
  title: string;
  release_date?: string | null;
  cover_image?: string | null;
  artist_id: number;
  created_at?: number;
}

export interface Artist {
  artist_id?: number;
  name: string;
  image_url?: string | null;
  created_at?: number;
}

export interface Genre {
  genre_id?: number;
  name: string;
  created_at?: number;
}

export interface Playlist {
  playlist_id?: number;
  title: string;
  cover_image?: string | null;
  date_created?: string;
  created_at?: number;
}

export interface PlaylistSong {
  playlist_id: number;
  song_id: number;
}

// Join table for many-to-many relationship between songs and artists
export interface SongArtist {
  song_id: number;
  artist_id: number;
}

// Database class
class MusicLibraryDB extends Dexie {
  songs!: Table<Song, number>;
  albums!: Table<Album, number>;
  artists!: Table<Artist, number>;
  genres!: Table<Genre, number>;
  playlists!: Table<Playlist, number>;
  playlistSongs!: Table<PlaylistSong, [number, number]>;
  songArtists!: Table<SongArtist, [number, number]>;

  constructor() {
    super('MusicLibraryDB');
    
    this.version(1).stores({
      songs: '++song_id, title, artist_id, album_id, genre_id, created_at',
      albums: '++album_id, title, artist_id, created_at',
      artists: '++artist_id, name, created_at',
      genres: '++genre_id, name, created_at',
      playlists: '++playlist_id, title, created_at',
      playlistSongs: '[playlist_id+song_id], playlist_id, song_id',
    });

    // Add songArtists many-to-many table in version 2
    this.version(2).stores({
      songArtists: '[song_id+artist_id], song_id, artist_id',
    });

    // Add image_url field to artists in version 3
    this.version(3).stores({
      artists: '++artist_id, name, image_url, created_at',
    });
  }
}

// Create singleton instance
const db = new MusicLibraryDB();

// Song operations
export const songService = {
  async getAll(): Promise<Song[]> {
    return await db.songs.toArray();
  },

  async getById(id: number): Promise<Song | undefined> {
    return await db.songs.get(id);
  },

  async create(song: Omit<Song, 'song_id' | 'created_at'>): Promise<number> {
    const now = Date.now();
    const id = await db.songs.add({
      ...song,
      created_at: now,
    } as Song);
    return id as number;
  },

  async update(id: number, updates: Partial<Omit<Song, 'song_id'>>): Promise<void> {
    await db.songs.update(id, updates);
  },

  async delete(id: number): Promise<void> {
    // Get the song first to check for cascade deletion
    const song = await db.songs.get(id);
    if (!song) return;

    const artistId = song.artist_id;
    const albumId = song.album_id;
    const genreId = song.genre_id;

    // Remove from playlists, song-artist mappings, and delete the song
    await db.playlistSongs.where('song_id').equals(id).delete();
    await db.songArtists.where('song_id').equals(id).delete();
    await db.songs.delete(id);

    // Cascade delete: Check if artist, album, or genre should be deleted
    // (only if no other songs reference them)

    // Check and delete artist if no songs remain
    if (artistId) {
      const remainingSongsForArtist = await db.songs.where('artist_id').equals(artistId).count();
      if (remainingSongsForArtist === 0) {
        // Delete albums by this artist first (they won't have songs anymore)
        const albums = await db.albums.where('artist_id').equals(artistId).toArray();
        for (const album of albums) {
          if (album.album_id) {
            await db.albums.delete(album.album_id);
          }
        }
        // Delete the artist
        await db.artists.delete(artistId);
      }
    }

    // Check and delete album if no songs remain
    if (albumId) {
      const remainingSongsForAlbum = await db.songs.where('album_id').equals(albumId).count();
      if (remainingSongsForAlbum === 0) {
        await db.albums.delete(albumId);
      }
    }

    // Check and delete genre if no songs remain
    if (genreId) {
      const remainingSongsForGenre = await db.songs.where('genre_id').equals(genreId).count();
      if (remainingSongsForGenre === 0) {
        await db.genres.delete(genreId);
      }
    }
  },

  async getByArtist(artistId: number): Promise<Song[]> {
    // Songs where this artist is the primary artist
    const primarySongs = await db.songs
      .where('artist_id')
      .equals(artistId)
      .toArray();

    // Songs linked through the songArtists join table
    const joinRows = await db.songArtists
      .where('artist_id')
      .equals(artistId)
      .toArray();
    const songIds = Array.from(
      new Set(joinRows.map((r) => r.song_id).filter((id) => id != null))
    );

    let relatedSongs: Song[] = [];
    if (songIds.length > 0) {
      relatedSongs = await db.songs.where('song_id').anyOf(songIds).toArray();
    }

    // Merge and deduplicate by song_id
    const all = [...primarySongs, ...relatedSongs];
    const seen = new Set<number>();
    const deduped: Song[] = [];
    for (const s of all) {
      if (s.song_id == null) {
        deduped.push(s);
        continue;
      }
      if (!seen.has(s.song_id)) {
        seen.add(s.song_id);
        deduped.push(s);
      }
    }
    return deduped;
  },

  async getByAlbum(albumId: number): Promise<Song[]> {
    return await db.songs.where('album_id').equals(albumId).toArray();
  },

  async getByGenre(genreId: number): Promise<Song[]> {
    return await db.songs.where('genre_id').equals(genreId).toArray();
  },
};

// Album operations
export const albumService = {
  async getAll(): Promise<Album[]> {
    return await db.albums.toArray();
  },

  async getById(id: number): Promise<Album | undefined> {
    return await db.albums.get(id);
  },

  async create(album: Omit<Album, 'album_id' | 'created_at'>): Promise<number> {
    const now = Date.now();
    const id = await db.albums.add({
      ...album,
      created_at: now,
    } as Album);
    return id as number;
  },

  async update(id: number, updates: Partial<Omit<Album, 'album_id'>>): Promise<void> {
    await db.albums.update(id, updates);
  },

  async delete(id: number): Promise<void> {
    // Set album_id to null for songs referencing this album
    await db.songs.where('album_id').equals(id).modify({ album_id: null });
    await db.albums.delete(id);
  },

  async getByArtist(artistId: number): Promise<Album[]> {
    return await db.albums.where('artist_id').equals(artistId).toArray();
  },
};

// Artist operations
export const artistService = {
  async getAll(): Promise<Artist[]> {
    return await db.artists.toArray();
  },

  async getById(id: number): Promise<Artist | undefined> {
    return await db.artists.get(id);
  },

  async create(artist: Omit<Artist, 'artist_id' | 'created_at'>): Promise<number> {
    const now = Date.now();
    const id = await db.artists.add({
      ...artist,
      created_at: now,
    } as Artist);
    return id as number;
  },

  async update(id: number, updates: Partial<Omit<Artist, 'artist_id'>>): Promise<void> {
    await db.artists.update(id, updates);
  },

  async delete(id: number): Promise<void> {
    // Remove song-artist relationships for this artist
    await db.songArtists.where('artist_id').equals(id).delete();

    // Delete all songs where this is the primary artist (cascade)
    const songs = await db.songs.where('artist_id').equals(id).toArray();
    for (const song of songs) {
      if (song.song_id) {
        await songService.delete(song.song_id);
      }
    }
    // Delete all albums by this artist
    const albums = await db.albums.where('artist_id').equals(id).toArray();
    for (const album of albums) {
      if (album.album_id) {
        await albumService.delete(album.album_id);
      }
    }
    await db.artists.delete(id);
  },
};

// Genre operations
export const genreService = {
  async getAll(): Promise<Genre[]> {
    return await db.genres.toArray();
  },

  async getById(id: number): Promise<Genre | undefined> {
    return await db.genres.get(id);
  },

  async create(genre: Omit<Genre, 'genre_id' | 'created_at'>): Promise<number> {
    const now = Date.now();
    const id = await db.genres.add({
      ...genre,
      created_at: now,
    } as Genre);
    return id as number;
  },

  async update(id: number, updates: Partial<Omit<Genre, 'genre_id'>>): Promise<void> {
    await db.genres.update(id, updates);
  },

  async delete(id: number): Promise<void> {
    // Check if any songs use this genre
    const songs = await db.songs.where('genre_id').equals(id).toArray();
    if (songs.length > 0) {
      throw new Error('Cannot delete genre: songs are using it');
    }
    await db.genres.delete(id);
  },
};

// Playlist operations
export const playlistService = {
  async getAll(): Promise<Playlist[]> {
    return await db.playlists.toArray();
  },

  async getById(id: number): Promise<Playlist | undefined> {
    return await db.playlists.get(id);
  },

  async create(playlist: Omit<Playlist, 'playlist_id' | 'created_at'>): Promise<number> {
    const now = Date.now();
    const id = await db.playlists.add({
      ...playlist,
      date_created: playlist.date_created || new Date().toISOString().split('T')[0],
      created_at: now,
    } as Playlist);
    return id as number;
  },

  async update(id: number, updates: Partial<Omit<Playlist, 'playlist_id'>>): Promise<void> {
    await db.playlists.update(id, updates);
  },

  async delete(id: number): Promise<void> {
    // Delete all playlist-song relationships
    await db.playlistSongs.where('playlist_id').equals(id).delete();
    await db.playlists.delete(id);
  },

  async getSongs(playlistId: number): Promise<Song[]> {
    const playlistSongIds = await db.playlistSongs
      .where('playlist_id')
      .equals(playlistId)
      .toArray();
    
    const songIds = playlistSongIds.map(ps => ps.song_id);
    if (songIds.length === 0) return [];
    
    return await db.songs.where('song_id').anyOf(songIds).toArray();
  },

  async addSong(playlistId: number, songId: number): Promise<void> {
    await db.playlistSongs.add({
      playlist_id: playlistId,
      song_id: songId,
    });
  },

  async removeSong(playlistId: number, songId: number): Promise<void> {
    await db.playlistSongs.where('[playlist_id+song_id]').equals([playlistId, songId]).delete();
  },

  async setSongs(playlistId: number, songIds: number[]): Promise<void> {
    // Remove all existing songs
    await db.playlistSongs.where('playlist_id').equals(playlistId).delete();
    // Add new songs
    await db.playlistSongs.bulkAdd(
      songIds.map(songId => ({ playlist_id: playlistId, song_id: songId }))
    );
  },
};

// Song-artist join operations
export const songArtistService = {
  async setArtistsForSong(songId: number, artistIds: number[]): Promise<void> {
    // Remove existing mappings
    await db.songArtists.where('song_id').equals(songId).delete();
    if (artistIds.length === 0) return;

    // Add new mappings (deduplicated)
    const uniqueIds = Array.from(new Set(artistIds));
    await db.songArtists.bulkAdd(
      uniqueIds.map((artistId) => ({ song_id: songId, artist_id: artistId }))
    );
  },

  async getArtistIdsForSong(songId: number): Promise<number[]> {
    const rows = await db.songArtists.where('song_id').equals(songId).toArray();
    return rows.map((r) => r.artist_id);
  },

  async getSongIdsForArtist(artistId: number): Promise<number[]> {
    const rows = await db.songArtists.where('artist_id').equals(artistId).toArray();
    return rows.map((r) => r.song_id);
  },
};

// Helper function to get song with related data (for display)
export interface SongWithRelations extends Song {
  // All associated artist names (primary + featured/secondary)
  artist_names?: string[];
  // Backwards-compatible combined artist string for display
  artist_name?: string;
  album_title?: string;
  album_cover_image?: string | null;
  genre_name?: string;
}

export async function getSongsWithRelations(): Promise<SongWithRelations[]> {
  const songs = await songService.getAll();
  const artists = await artistService.getAll();
  const albums = await albumService.getAll();
  const genres = await genreService.getAll();

  const artistMap = new Map(artists.map(a => [a.artist_id, a.name]));
  const albumMap = new Map(albums.map(a => [a.album_id, a.title]));
  const genreMap = new Map(genres.map(g => [g.genre_id, g.name]));

   // Load song-artist mappings for all songs in one go
  const songIds = songs
    .map((s) => s.song_id)
    .filter((id): id is number => id !== undefined);

  let songArtistRows: SongArtist[] = [];
  if (songIds.length > 0) {
    songArtistRows = await db.songArtists
      .where('song_id')
      .anyOf(songIds)
      .toArray();
  }

  const songIdToArtistIds = new Map<number, number[]>();
  for (const row of songArtistRows) {
    if (!songIdToArtistIds.has(row.song_id)) {
      songIdToArtistIds.set(row.song_id, []);
    }
    songIdToArtistIds.get(row.song_id)!.push(row.artist_id);
  }

  return songs.map(song => ({
    ...song,
    artist_names: (() => {
      const ids = new Set<number>();
      if (song.artist_id != null) {
        ids.add(song.artist_id);
      }
      const extraIds = song.song_id ? songIdToArtistIds.get(song.song_id) : undefined;
      (extraIds || []).forEach((id) => ids.add(id));
      const names = Array.from(ids)
        .map((id) => artistMap.get(id))
        .filter((n): n is string => !!n);
      return names;
    })(),
    artist_name: (() => {
      const names = (() => {
        const ids = new Set<number>();
        if (song.artist_id != null) {
          ids.add(song.artist_id);
        }
        const extraIds = song.song_id ? songIdToArtistIds.get(song.song_id) : undefined;
        (extraIds || []).forEach((id) => ids.add(id));
        const list = Array.from(ids)
          .map((id) => artistMap.get(id))
          .filter((n): n is string => !!n);
        return list;
      })();
      return names.length > 0 ? names.join(', ') : artistMap.get(song.artist_id);
    })(),
    album_title: song.album_id ? albumMap.get(song.album_id) : undefined,
    genre_name: genreMap.get(song.genre_id),
  }));
}

// Helper function to create object URL from song file
export async function getSongUrl(song: Song): Promise<string> {
  if (song.file_blob) {
    return URL.createObjectURL(song.file_blob);
  }
  
  if (song.file_handle) {
    // File System Access API - get file and create blob URL
    const file = await song.file_handle.getFile();
    return URL.createObjectURL(file);
  }
  
  throw new Error('Song has no file data');
}

// Helper function to revoke object URL
export function revokeSongUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export default db;


