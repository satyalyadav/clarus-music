# Music Library

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

## Installation

1. **Clone the Repository**

   ```bash
   git clone <your-repository-url>
   cd music_library
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

   This will install frontend dependencies.

3. **Run the Application**

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

## Browser Compatibility

Works in all modern browsers that support:

- IndexedDB
- File API
- Audio API

Tested and working in:

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Limitations

- Library is tied to a single browser/device
- If you clear browser data, your library will be lost
- No cross-device synchronization (by design - keeps it simple and free)

## License

MIT License - see [LICENSE](LICENSE) file for details.
