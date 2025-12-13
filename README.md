# Music Library

A **local-first** music library application that works entirely in your browser.  
Built with React, TypeScript, and IndexedDB. No backend required!

## Features

- 🎵 **100% Local Storage** - All your music and metadata stored in your browser
- 🚀 **Zero Backend Costs** - No server, no database, no file storage needed
- 📱 **Works Offline** - Full functionality without internet connection
- 🎨 **Modern UI** - Clean, responsive interface
- 🎧 **Audio Player** - Built-in player with queue support
- 📚 **Organize Music** - Songs, Albums, Artists, Genres, and Playlists

## How It Works

This app uses **IndexedDB** (via Dexie.js) to store:
- Audio files as Blobs
- Song metadata (title, artist, album, genre, duration)
- Playlists and their song associations
- All other library data

Everything is stored locally in your browser. Your music library is tied to the browser/device you use, but there are **zero hosting costs** and it works completely offline.

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

This creates an optimized production build in `frontend/dist/` that can be deployed to:
- **Vercel** (recommended - free static hosting)
- **Netlify**
- **GitHub Pages**
- Any static file hosting service

## Deployment to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Set build command: `cd frontend && npm run build`
4. Set output directory: `frontend/dist`
5. Deploy!

**That's it!** Zero backend costs, zero database costs, zero file storage costs.

## Technical Details

- **Frontend Framework**: React 19 with TypeScript
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

ISC
