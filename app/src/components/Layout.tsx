import React, { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import AudioPlayer from "./AudioPlayer";

interface LayoutProps {
  children: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="app-container">
      {/* Top Header Bar */}
      <header className="header">
        <span className="header-title" onClick={() => navigate("/songs")}>
          music library
        </span>
        <div className="header-spacer" />
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? (
            <svg
              className="theme-toggle-icon"
              viewBox="0 0 24 24"
              role="presentation"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="3" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="21" />
              <line x1="3" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="21" y2="12" />
              <line x1="5.2" y1="5.2" x2="7.4" y2="7.4" />
              <line x1="16.6" y1="16.6" x2="18.8" y2="18.8" />
              <line x1="5.2" y1="18.8" x2="7.4" y2="16.6" />
              <line x1="16.6" y1="7.4" x2="18.8" y2="5.2" />
            </svg>
          ) : (
            <svg
              className="theme-toggle-icon"
              viewBox="0 0 24 24"
              role="presentation"
              aria-hidden="true"
            >
              <path d="M18 14.5c-1.1 2.5-3.6 4.1-6.4 4.1-3.9 0-7.1-3.1-7.1-7 0-2.8 1.7-5.3 4.1-6.4-.2.6-.3 1.2-.3 1.8 0 3.9 3.1 7 7 7 .6 0 1.2-.1 1.7-.3z" />
            </svg>
          )}
        </button>
      </header>

      {/* Navigation */}
      <nav className="nav">
        <NavLink
          to="/songs"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          //songs
        </NavLink>
        <NavLink
          to="/albums"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          //albums
        </NavLink>
        <NavLink
          to="/artists"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          //artists
        </NavLink>
        <NavLink
          to="/genres"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          //genres
        </NavLink>
        <NavLink
          to="/playlists"
          className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
        >
          //playlists
        </NavLink>
      </nav>

      {/* Main Content */}
      <main className="main-content">{children}</main>

      {/* Audio Player */}
      <AudioPlayer />
    </div>
  );
};

export default Layout;
