import React from "react";
import { SongWithRelations } from "../services/db";

/**
 * Get unique cover arts from playlist songs based on album_id
 * Returns up to 4 unique cover images
 */
export function getUniqueCoverArts(songs: SongWithRelations[]): string[] {
  const seenAlbums = new Set<number | null>();
  const uniqueCovers: string[] = [];

  for (const song of songs) {
    // Skip if we already have 4 unique covers
    if (uniqueCovers.length >= 4) break;

    // Normalize album_id: convert undefined to null
    const albumId = song.album_id ?? null;

    // Skip if we've already seen this album
    if (albumId !== null && seenAlbums.has(albumId)) {
      continue;
    }

    // Get cover image (prefer song cover_image, fallback to album cover)
    const coverImage = song.cover_image || song.album_cover_image;

    if (coverImage) {
      uniqueCovers.push(coverImage);
      if (albumId !== null) {
        seenAlbums.add(albumId);
      }
    }
  }

  return uniqueCovers;
}

/**
 * Playlist cover component that shows a collage or single image
 */
export const PlaylistCover: React.FC<{
  songs: SongWithRelations[];
  size?: number;
  className?: string;
  fillContainer?: boolean;
}> = ({ songs, size = 200, className, fillContainer = false }) => {
  const uniqueCovers = getUniqueCoverArts(songs);

  const containerStyle: React.CSSProperties = fillContainer
    ? {
        width: "100%",
        height: "100%",
      }
    : {
        width: `${size}px`,
        height: `${size}px`,
      };

  // If we have 4 unique covers, show collage
  if (uniqueCovers.length === 4) {
    return (
      <div
        className={className}
        style={{
          ...containerStyle,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 0,
          borderRadius: fillContainer ? "0" : "8px",
          overflow: "hidden",
        }}
      >
        {uniqueCovers.map((cover, index) => (
          <img
            key={index}
            src={cover}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ))}
      </div>
    );
  }

  // Otherwise, show single image (first song's cover) or placeholder
  const firstCover = uniqueCovers[0];

  if (firstCover) {
    return (
      <img
        src={firstCover}
        alt=""
        className={className}
        style={{
          ...containerStyle,
          objectFit: "cover",
          borderRadius: fillContainer ? "0" : "8px",
        }}
      />
    );
  }

  // Fallback placeholder
  return (
    <div
      className={className}
      style={{
        ...containerStyle,
        background: "var(--card-bg)",
        borderRadius: fillContainer ? "0" : "8px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: fillContainer ? "48px" : `${size * 0.4}px`,
      }}
    >
      🎶
    </div>
  );
};
