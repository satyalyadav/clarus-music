import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";

import SongList from "./pages/SongList";
import SongCreate from "./pages/SongCreate";
import SongEdit from "./pages/SongEdit";
import AlbumList from "./pages/AlbumList";
import AlbumDetail from "./pages/AlbumDetail";
import ArtistList from "./pages/ArtistList";
import ArtistDetail from "./pages/ArtistDetail";
import GenreList from "./pages/GenreList";
import GenreDetail from "./pages/GenreDetail";
import PlaylistList from "./pages/PlaylistList";
import PlaylistCreate from "./pages/PlaylistCreate";
import PlaylistDetail from "./pages/PlaylistDetail";
import PlaylistEdit from "./pages/PlaylistEdit";
import SearchResults from "./pages/SearchResults";

const App: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/songs" element={<SongList />} />
        <Route path="/songs/new" element={<SongCreate />} />
        <Route path="/songs/:id/edit" element={<SongEdit />} />

        <Route path="/albums" element={<AlbumList />} />
        <Route path="/albums/:id" element={<AlbumDetail />} />

        <Route path="/artists" element={<ArtistList />} />
        <Route path="/artists/:id" element={<ArtistDetail />} />

        <Route path="/genres" element={<GenreList />} />
        <Route path="/genres/:id" element={<GenreDetail />} />

        <Route path="/playlists" element={<PlaylistList />} />
        <Route path="/playlists/new" element={<PlaylistCreate />} />
        <Route path="/playlists/:id" element={<PlaylistDetail />} />
        <Route path="/playlists/:id/edit" element={<PlaylistEdit />} />

        <Route path="/search" element={<SearchResults />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/songs" replace />} />
        <Route path="*" element={<Navigate to="/songs" replace />} />
      </Routes>
    </Layout>
  );
};

export default App;
