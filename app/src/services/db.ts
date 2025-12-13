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

// Database class
class MusicLibraryDB extends Dexie {
  songs!: Table<Song, number>;
  albums!: Table<Album, number>;
  artists!: Table<Artist, number>;
  genres!: Table<Genre, number>;
  playlists!: Table<Playlist, number>;
  playlistSongs!: Table<PlaylistSong, [number, number]>;

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
    // Also remove from playlists
    await db.playlistSongs.where('song_id').equals(id).delete();
    await db.songs.delete(id);
  },

  async getByArtist(artistId: number): Promise<Song[]> {
    return await db.songs.where('artist_id').equals(artistId).toArray();
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
    // Delete all songs by this artist (cascade)
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

// Helper function to get song with related data (for display)
export interface SongWithRelations extends Song {
  artist_name?: string;
  album_title?: string;
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

  return songs.map(song => ({
    ...song,
    artist_name: artistMap.get(song.artist_id),
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


