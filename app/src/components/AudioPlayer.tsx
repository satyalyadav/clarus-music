import React, { useRef, useState, useEffect, useCallback } from "react";
import { useAudioPlayer } from "../contexts/AudioPlayerContext";

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const AudioPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    togglePlayPause,
    seek,
    setVolume,
    playNext,
    playPrevious,
  } = useAudioPlayer();

  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [prevVolume, setPrevVolume] = useState(1);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume > 0 ? prevVolume : 1);
    }
  };

  const calculateSeekPosition = useCallback(
    (clientX: number) => {
      if (!sliderRef.current || duration <= 0) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      seek(percentage * duration);
    },
    [duration, seek]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    calculateSeekPosition(e.clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        calculateSeekPosition(e.clientX);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, calculateSeekPosition]);

  if (!currentTrack) {
    return (
      <div className="audio-player">
        <div className="audio-player-info">
          <div
            className="audio-player-title"
            style={{ color: "var(--text-muted)" }}
          >
            No track selected
          </div>
        </div>
      </div>
    );
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="audio-player">
      <div className="audio-player-info">
        {currentTrack.cover && (
          <img
            src={currentTrack.cover}
            alt={currentTrack.title || "cover art"}
            className="audio-player-cover"
          />
        )}
        <div className="audio-player-text">
          <div className="audio-player-title">
            {currentTrack.title || "Unknown"}
          </div>
          <div className="audio-player-subtitle">
            {currentTrack.artist || "Unknown Artist"}
            {currentTrack.album && ` • ${currentTrack.album}`}
          </div>
        </div>
      </div>

      <div className="audio-player-main">
        <div className="audio-player-controls">
          <button
            className="btn btn-icon"
            onClick={playPrevious}
            title="Previous"
          >
            <span className="btn-icon-content">⏮</span>
          </button>
          <button
            className="btn btn-icon btn-primary"
            onClick={togglePlayPause}
            title={isPlaying ? "Pause" : "Play"}
          >
            <span className="btn-icon-content">{isPlaying ? "⏸" : "▶"}</span>
          </button>
          <button className="btn btn-icon" onClick={playNext} title="Next">
            <span className="btn-icon-content">⏭</span>
          </button>
        </div>

        <div className="audio-player-progress">
          <span className="audio-player-time">{formatTime(currentTime)}</span>
          <div
            ref={sliderRef}
            className="audio-player-slider"
            onMouseDown={handleMouseDown}
          >
            <div
              className="audio-player-slider-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="audio-player-time">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="audio-player-volume">
        <button
          className="volume-btn"
          onClick={toggleMute}
          title={volume > 0 ? "Mute" : "Unmute"}
        >
          <svg
            className="volume-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            {volume === 0 && (
              <>
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </>
            )}
            {volume > 0 && volume <= 0.5 && (
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            )}
            {volume > 0.5 && (
              <>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </>
            )}
          </svg>
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={handleVolumeChange}
          className="volume-slider"
          style={
            { "--volume-percent": `${volume * 100}%` } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
};

export default AudioPlayer;
