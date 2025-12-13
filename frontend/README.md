# Music Library Frontend

A local-first music library application built with React, TypeScript, and IndexedDB.

## Features

- 🎵 **100% Browser-Based** - All data stored locally in IndexedDB
- 🚀 **No Backend Required** - Works entirely in the browser
- 📱 **Works Offline** - Full functionality without internet
- 🎨 **Modern UI** - Clean, responsive design with dark/light themes
- 🎧 **Audio Player** - Built-in player with queue management

## Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start the development server:**

   ```bash
   npm run dev
   ```

3. **Open in browser:**
   Navigate to the URL shown (typically `http://localhost:5173`)

## Project Structure

```
frontend/
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   │   ├── AudioPlayer.tsx
│   │   └── Layout.tsx
│   ├── contexts/        # React contexts
│   │   ├── AudioPlayerContext.tsx
│   │   ├── AuthContext.tsx
│   │   └── ThemeContext.tsx
│   ├── hooks/           # Custom hooks
│   │   └── useSongUrls.ts
│   ├── pages/           # Page components
│   │   ├── SongList.tsx / SongCreate.tsx / SongEdit.tsx
│   │   ├── AlbumList.tsx / AlbumDetail.tsx
│   │   ├── ArtistList.tsx / ArtistDetail.tsx
│   │   ├── GenreList.tsx / GenreDetail.tsx
│   │   └── PlaylistList.tsx / PlaylistCreate.tsx / PlaylistDetail.tsx / PlaylistEdit.tsx
│   ├── services/        # Data services
│   │   └── db.ts        # IndexedDB service layer
│   ├── styles/
│   │   └── global.css   # Global styles
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
└── vite.config.ts       # Vite configuration
```

## Tech Stack

- **React 19** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router 7** - Client-side routing
- **Dexie.js** - IndexedDB wrapper
- **CSS Variables** - Theming system

## Building for Production

```bash
npm run build
```

This creates an optimized production build in `dist/` that can be deployed to any static hosting service.

## Data Storage

All data is stored in IndexedDB:
- Songs (with audio file blobs)
- Albums, Artists, Genres
- Playlists and playlist-song relationships

The database is automatically created and managed by Dexie.js. No configuration needed!

## Browser Support

Works in all modern browsers that support:
- IndexedDB
- File API
- Audio API

Tested in Chrome, Firefox, Safari, and Edge.
