import { Track } from "../contexts/AudioPlayerContext";
import { SongWithRelations } from "../services/db";

export const createTrackFromSong = (
  song: SongWithRelations,
  url: string,
  overrides: Partial<Track> = {}
): Track => ({
  url,
  title: song.title,
  artist: song.artist_name || "",
  album: song.album_title || "",
  cover: song.cover_image || "",
  songId: song.song_id,
  ...overrides,
});

export const buildTracksFromSongs = async (
  songs: SongWithRelations[],
  getUrl: (song: SongWithRelations) => Promise<string>,
  overrides?: (song: SongWithRelations) => Partial<Track>
): Promise<Track[]> => {
  const tracks = await Promise.all(
    songs.map(async (song) => {
      try {
        const url = await getUrl(song);
        return createTrackFromSong(
          song,
          url,
          overrides ? overrides(song) : undefined
        );
      } catch (err) {
        console.error(`Failed to get URL for song ${song.song_id}:`, err);
        return null;
      }
    })
  );

  return tracks.filter((track): track is Track => Boolean(track?.url));
};
