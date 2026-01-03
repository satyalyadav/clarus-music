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
  external_urls?: {
    spotify?: string;
  };
}

interface SpotifySearchResponse {
  artists: {
    items: SpotifyArtist[];
  };
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

      const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`;
      
      const response = await fetch(searchUrl, {
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
      
      if (artists.length > 0) {
        return artists[0];
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
