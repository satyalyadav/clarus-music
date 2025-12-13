import { useState, useEffect } from 'react';
import { Song, getSongUrl, revokeSongUrl } from '../services/db';

/**
 * Hook to manage object URLs for songs
 * Automatically creates and cleans up object URLs
 */
export function useSongUrls(songs: Song[]) {
  const [songUrls, setSongUrls] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    const urlMap = new Map<number, string>();
    
    // Create object URLs for all songs
    const createUrls = async () => {
      for (const song of songs) {
        if (song.song_id) {
          try {
            const url = await getSongUrl(song);
            urlMap.set(song.song_id, url);
          } catch (err) {
            console.error(`Failed to create URL for song ${song.song_id}:`, err);
          }
        }
      }
      setSongUrls(new Map(urlMap));
    };

    createUrls();

    // Cleanup: revoke object URLs when component unmounts or songs change
    return () => {
      urlMap.forEach(url => revokeSongUrl(url));
    };
  }, [songs]);

  const getUrl = (songId: number | undefined): string | null => {
    if (!songId) return null;
    return songUrls.get(songId) || null;
  };

  const ensureUrl = async (song: Song): Promise<string> => {
    if (!song.song_id) throw new Error('Song has no ID');
    const existing = songUrls.get(song.song_id);
    if (existing) return existing;
    
    const url = await getSongUrl(song);
    setSongUrls(prev => new Map(prev).set(song.song_id!, url));
    return url;
  };

  return { songUrls, getUrl, ensureUrl };
}


