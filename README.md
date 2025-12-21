# Clarus Music

A **local-first** music library application that works entirely in your browser.  
Built with React, TypeScript, and IndexedDB. It originally started as a class project for a database course, used PostgreSQL, and had a Express.js backend. But I decided to make it local first and deploy it.

## How It Works

This app uses **IndexedDB** (via Dexie.js) to store:

- Audio files as Blobs
- Song metadata (title, artist, album, genre, duration)
- Playlists and their song associations
- All other library data

Everything is stored locally in your browser. Your music library is tied to the browser/device you use.

## Prerequisites

- **Node.js** (v18 or later recommended)
- **npm** or **yarn**
- **Spotify Developer Account** (optional, for artist images)

## Installation

1. **Clone the Repository**

   ```bash
   git clone <your-repository-url>
   cd music_library
   ```

2. **Install Dependencies**

   ```bash
   cd app
   npm install
   ```

   This will install frontend dependencies.

3. **Configure Spotify API (Optional - for artist images)**

   Artist images are automatically fetched from Spotify API in the background. To enable this feature:

   - Register your app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
   - Create a new app and get your Client ID and Client Secret
   - Copy `app/.env.example` to `app/.env`
   - Add your credentials to `app/.env`:
     ```
     VITE_SPOTIFY_CLIENT_ID=your_client_id
     VITE_SPOTIFY_CLIENT_SECRET=your_client_secret
     ```

   **Note:** Without Spotify credentials, artist images won't be fetched, but the app will work normally with placeholder icons.

4. **Run the Application**

   ```bash
   npm run dev
   ```

   This will start the Vite development server. Open your browser to the URL shown (typically `http://localhost:5173`).

## Usage

1. **Add Songs**: Click "add song" and select audio files from your device
2. **Organize**: Create albums, artists, genres, and playlists
3. **Play Music**: Click any song to start playing
4. **Enjoy**: Your library persists in your browser - no login needed!

## Building for Production

```bash
npm run build
```

## Technical Details

- **Frontend Framework**: React with TypeScript
- **Database**: IndexedDB (via Dexie.js)
- **Build Tool**: Vite
- **Routing**: React Router
- **State Management**: React Context API
- **External APIs**: Spotify Web API (for artist images), iTunes Search API (for song search)

## Browser Compatibility

Works in all modern browsers that support:

- IndexedDB
- File API
- Audio API

## Limitations

- Library is tied to a single browser/device
- If you clear browser data, your library will be lost
- No cross-device synchronization (by design - keeps it simple and free)

## License

MIT License - see [LICENSE](LICENSE) file for details.
