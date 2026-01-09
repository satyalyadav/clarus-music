import { useCallback, useEffect, useRef, useState } from "react";
import { getSongUrl, revokeSongUrl, Song } from "../services/db";

type SongUrlMap = Map<number, string>;

export const useSongUrls = () => {
  const [songUrls, setSongUrls] = useState<SongUrlMap>(new Map());
  const songUrlsRef = useRef<SongUrlMap>(songUrls);

  useEffect(() => {
    songUrlsRef.current = songUrls;
  }, [songUrls]);

  const setSongUrl = useCallback((songId: number, url: string) => {
    setSongUrls((prev) => {
      const next = new Map(prev);
      const existing = next.get(songId);
      if (existing && existing !== url) {
        revokeSongUrl(existing);
      }
      next.set(songId, url);
      songUrlsRef.current = next;
      return next;
    });
  }, []);

  const getOrCreateSongUrl = useCallback(
    async (song: Song) => {
      if (song.song_id && songUrlsRef.current.has(song.song_id)) {
        return songUrlsRef.current.get(song.song_id)!;
      }

      const url = await getSongUrl(song);
      if (song.song_id) {
        setSongUrl(song.song_id, url);
      }
      return url;
    },
    [setSongUrl]
  );

  const prefetchSongUrls = useCallback(
    async (songs: Song[]) => {
      await Promise.all(
        songs.map(async (song) => {
          try {
            await getOrCreateSongUrl(song);
          } catch (err) {
            console.error(
              `Failed to create URL for song ${song.song_id}:`,
              err
            );
          }
        })
      );
    },
    [getOrCreateSongUrl]
  );

  const syncSongUrls = useCallback((songs: Song[]) => {
    const ids = new Set(
      songs.map((song) => song.song_id).filter((id): id is number => !!id)
    );
    setSongUrls((prev) => {
      const next = new Map(prev);
      for (const [songId, url] of next.entries()) {
        if (!ids.has(songId)) {
          revokeSongUrl(url);
          next.delete(songId);
        }
      }
      songUrlsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      songUrlsRef.current.forEach((url) => revokeSongUrl(url));
    };
  }, []);

  return {
    songUrls,
    getOrCreateSongUrl,
    prefetchSongUrls,
    syncSongUrls,
  };
};
