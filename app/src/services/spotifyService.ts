/**
 * Spotify Web API service for fetching artist images
 * 
 * Note: For production, you should use a backend proxy to keep credentials secure.
 * This client-side implementation works but exposes credentials in the bundle.
 * 
 * Setup:
 * 1. Register your app at https://developer.spotify.com/dashboard/
 * 2. Get your Client ID and Client Secret
 * 3. Add them to .env file:
 *    VITE_SPOTIFY_CLIENT_ID=your_client_id
 *    VITE_SPOTIFY_CLIENT_SECRET=your_client_secret
 */

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface SpotifyImage {
  url: string;
  height: number;
  width: number;
}

interface SpotifyArtist {
  id: string;
  name: string;
  images: SpotifyImage[];
  popularity?: number;
  external_urls?: {
    spotify?: string;
  };
}

interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
  };
}

function normalizeArtistName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function pickBestArtist(
  candidates: Array<{ artist: SpotifyArtist }>
): SpotifyArtist | null {
  if (candidates.length === 0) return null;
  return candidates
    .slice()
    .sort(
      (a, b) =>
        (b.artist.popularity ?? 0) - (a.artist.popularity ?? 0)
    )[0].artist;
}

class SpotifyService {
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
    this.clientSecret = import.meta.env.VITE_SPOTIFY_CLIENT_SECRET || '';
  }

  /**
   * Get access token using Client Credentials flow
   * Tokens are cached until expiry
   */
  private async getAccessToken(): Promise<string | null> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.clientId || !this.clientSecret) {
      console.warn('Spotify credentials not configured. Set VITE_SPOTIFY_CLIENT_ID and VITE_SPOTIFY_CLIENT_SECRET in .env');
      return null;
    }

    try {
      const credentials = btoa(`${this.clientId}:${this.clientSecret}`);
      
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: 'grant_type=client_credentials',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to get Spotify token:', errorText);
        return null;
      }

      const data: SpotifyTokenResponse = await response.json();
      this.accessToken = data.access_token;
      // Set expiry to 5 minutes before actual expiry for safety
      this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
      
      return this.accessToken;
    } catch (error) {
      console.error('Error getting Spotify token:', error);
      return null;
    }
  }

  /**
   * Search for an artist by name
   */
  async searchArtist(artistName: string): Promise<SpotifyArtist | null> {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return null;
      }

      const searchUrl = new URL("https://api.spotify.com/v1/search");
      searchUrl.searchParams.append("q", artistName);
      searchUrl.searchParams.append("type", "artist");
      searchUrl.searchParams.append("limit", "10");
      
      const response = await fetch(searchUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, clear cache and retry once
          this.accessToken = null;
          this.tokenExpiry = 0;
          const newToken = await this.getAccessToken();
          if (newToken) {
            return this.searchArtist(artistName);
          }
        }
        console.error(`Spotify API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: SpotifySearchResponse = await response.json();
      const artists = data.artists?.items || [];
      
      if (artists.length === 0) {
        return null;
      }

      const normalizedQuery = normalizeArtistName(artistName.trim());
      const normalizedArtists = artists.map((artist) => ({
        artist,
        normalized: normalizeArtistName(artist.name || ""),
      }));
      const normalizedCandidates = normalizedArtists.filter(
        (entry) => entry.normalized.length > 0
      );
      const nonLatinCandidates = normalizedArtists.filter(
        (entry) => entry.normalized.length === 0
      );

      const exactMatches = normalizedCandidates.filter(
        (entry) => entry.normalized === normalizedQuery
      );
      const exactMatch = pickBestArtist(exactMatches);
      if (exactMatch) {
        return exactMatch;
      }

      const partialMatches = normalizedCandidates.filter(
        (entry) =>
          entry.normalized.includes(normalizedQuery) ||
          normalizedQuery.includes(entry.normalized)
      );
      const partialMatch = pickBestArtist(partialMatches);
      if (partialMatch) {
        return partialMatch;
      }

      if (normalizedQuery.length > 0 && normalizedCandidates.length > 0) {
        const scored = normalizedCandidates.map((entry) => ({
          artist: entry.artist,
          distance: levenshteinDistance(normalizedQuery, entry.normalized),
        }));
        scored.sort(
          (a, b) =>
            a.distance - b.distance ||
            (b.artist.popularity ?? 0) - (a.artist.popularity ?? 0)
        );

        const best = scored[0];
        const maxDistance = normalizedQuery.length <= 6 ? 1 : 2;
        if (best && best.distance <= maxDistance) {
          return best.artist;
        }
      }

      const nonLatinFallback = pickBestArtist(nonLatinCandidates);
      if (nonLatinFallback) {
        return nonLatinFallback;
      }

      if (normalizedCandidates.length === 0) {
        return artists[0] || null;
      }

      return null;
    } catch (error) {
      console.error(`Error searching for artist ${artistName}:`, error);
      return null;
    }
  }

  /**
   * Get artist image URL (returns the largest available image)
   */
  async getArtistInfo(
    artistName: string
  ): Promise<{ imageUrl: string | null; sourceUrl: string | null } | null> {
    try {
      const artist = await this.searchArtist(artistName);
      if (!artist || !artist.images || artist.images.length === 0) {
        return null;
      }

      return {
        imageUrl: artist.images[0].url,
        sourceUrl: artist.external_urls?.spotify || null,
      };
    } catch (error) {
      console.error(`Error getting artist image for ${artistName}:`, error);
      return null;
    }
  }

  async getArtistImage(artistName: string): Promise<string | null> {
    const info = await this.getArtistInfo(artistName);
    return info?.imageUrl || null;
  }
}

// Export singleton instance
export const spotifyService = new SpotifyService();
