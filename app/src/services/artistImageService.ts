/**
 * Service for fetching artist images from various sources
 * Currently uses Spotify API as the primary source
 */

import { spotifyService } from "./spotifyService";
import { artistService, Artist } from "./db";

export const artistImageService = {
  /**
   * Fetches artist image URL
   * Prioritizes Bandcamp image if provided, falls back to Spotify API
   */
  async fetchArtistImage(
    artistName: string,
    bandcampArtistImage?: string,
    bandcampSourceUrl?: string
  ): Promise<{
    imageUrl: string;
    sourceUrl: string | null;
    sourceProvider: string;
  } | null> {
    if (!artistName || artistName.trim().length === 0) {
      return null;
    }

    // If Bandcamp artist image is provided, use it first
    if (bandcampArtistImage && bandcampArtistImage.trim().length > 0) {
      return {
        imageUrl: bandcampArtistImage,
        sourceUrl: bandcampSourceUrl || null,
        sourceProvider: "bandcamp",
      };
    }

    try {
      // Try Spotify as fallback
      const spotifyInfo = await spotifyService.getArtistInfo(
        artistName.trim()
      );
      if (spotifyInfo?.imageUrl) {
        return {
          imageUrl: spotifyInfo.imageUrl,
          sourceUrl: spotifyInfo.sourceUrl,
          sourceProvider: "spotify",
        };
      }
    } catch (error) {
      console.error(
        `Error fetching artist image from Spotify for ${artistName}:`,
        error
      );
    }

    // Could add fallback to other services here (iTunes, MusicBrainz, etc.)
    return null;
  },

  /**
   * Fetches and updates artist image in the database
   * Returns the image URL if successful, null otherwise
   */
  async fetchAndUpdateArtistImage(
    artistId: number,
    artistName: string,
    bandcampArtistImage?: string,
    bandcampSourceUrl?: string
  ): Promise<{
    imageUrl: string;
    sourceUrl: string | null;
    sourceProvider: string;
  } | null> {
    try {
      const info = await this.fetchArtistImage(
        artistName,
        bandcampArtistImage,
        bandcampSourceUrl
      );
      if (info?.imageUrl) {
        await artistService.update(artistId, {
          image_url: info.imageUrl,
          image_source_url: info.sourceUrl,
          image_source_provider: info.sourceProvider,
        });
        return info;
      }
    } catch (error) {
      console.error(`Error updating artist image for ${artistName}:`, error);
    }
    return null;
  },

  /**
   * Batch fetch images for multiple artists in the background
   * Only fetches for artists that don't already have images
   */
  async fetchImagesForArtists(artists: Artist[]): Promise<void> {
    // Filter artists that need images
    const artistsNeedingImages = artists.filter(
      (artist) => artist.artist_id && artist.name && !artist.image_url
    );

    if (artistsNeedingImages.length === 0) {
      return;
    }

    // Fetch images in parallel with a small delay between batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < artistsNeedingImages.length; i += batchSize) {
      const batch = artistsNeedingImages.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (artist) => {
          if (artist.artist_id && artist.name) {
            try {
              await this.fetchAndUpdateArtistImage(
                artist.artist_id,
                artist.name
              );
            } catch (error) {
              // Silently fail for individual artists to not block others
              console.error(`Failed to fetch image for ${artist.name}:`, error);
            }
          }
        })
      );

      // Small delay between batches to be respectful of rate limits
      if (i + batchSize < artistsNeedingImages.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  },
};
