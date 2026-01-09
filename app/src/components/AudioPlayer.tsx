import React, { useRef, useState, useEffect, useCallback } from "react";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import QueuePanel from "./QueuePanel";

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
    playTrack,
    queue,
    setQueue,
  } = useAudioPlayer();

  const sliderRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const titleWrapperRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const subtitleWrapperRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [prevVolume, setPrevVolume] = useState(1);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [scrollDistance, setScrollDistance] = useState(0);
  const [shouldScrollSubtitle, setShouldScrollSubtitle] = useState(false);
  const [scrollDistanceSubtitle, setScrollDistanceSubtitle] = useState(0);
  const [dragTime, setDragTime] = useState<number | null>(null);
  const dragTimeRef = useRef<number | null>(null);
  const hasMovedRef = useRef(false);
  const [showQueue, setShowQueue] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const queueListRef = useRef<HTMLDivElement>(null);
  const currentTrackRef = useRef<HTMLDivElement>(null);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume > 0 ? prevVolume : 1);
    }
  };

  const calculateSeekPosition = useCallback(
    (clientX: number, shouldPreview: boolean = false) => {
      if (!sliderRef.current || duration <= 0) return 0;
      const rect = sliderRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percentage = x / rect.width;
      const targetTime = percentage * duration;

      if (shouldPreview) {
        dragTimeRef.current = targetTime;
        setDragTime(targetTime);
      }

      return targetTime;
    },
    [duration]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      (e.pointerType === "mouse" && e.button !== 0) ||
      duration <= 0 ||
      !sliderRef.current
    ) {
      return;
    }

    e.preventDefault();
    sliderRef.current.setPointerCapture(e.pointerId);

    setIsDragging(true);
    hasMovedRef.current = false;
    // Don't mute yet - only mute if the pointer actually moves

    calculateSeekPosition(e.clientX, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    
    // Only mute on first movement (actual dragging, not just a click)
    if (!hasMovedRef.current) {
      hasMovedRef.current = true;
      setPrevVolume(volume);
      setVolume(0);
    }
    
    calculateSeekPosition(e.clientX, true);
  };

  const endDrag = useCallback(
    (clientX: number) => {
      const finalTime =
        dragTimeRef.current !== null
          ? dragTimeRef.current
          : calculateSeekPosition(clientX, false);

      seek(finalTime);
      setDragTime(null);
      dragTimeRef.current = null;
      setIsDragging(false);
      
      // Only restore volume if we actually muted (i.e., if there was movement)
      if (hasMovedRef.current) {
        setVolume(prevVolume);
        hasMovedRef.current = false;
      }
    },
    [calculateSeekPosition, prevVolume, seek, setVolume]
  );

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    if (sliderRef.current?.hasPointerCapture?.(e.pointerId)) {
      sliderRef.current.releasePointerCapture(e.pointerId);
    }

    endDrag(e.clientX);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    if (sliderRef.current?.hasPointerCapture?.(e.pointerId)) {
      sliderRef.current.releasePointerCapture(e.pointerId);
    }

    endDrag(e.clientX);
  };

  // If the component unmounts mid-drag, restore the volume mute change
  useEffect(() => {
    return () => {
      if (isDragging && hasMovedRef.current) {
        setVolume(prevVolume);
      }
    };
  }, [isDragging, prevVolume, setVolume]);

  // Check if title text overflows and calculate scroll distance
  useEffect(() => {
    const checkOverflow = () => {
      if (titleRef.current && titleWrapperRef.current) {
        const titleWidth = titleRef.current.scrollWidth;
        const wrapperWidth = titleWrapperRef.current.offsetWidth;
        const needsScroll = titleWidth > wrapperWidth;
        setShouldScroll(needsScroll);
        if (needsScroll) {
          // Calculate how much we need to scroll (text width - container width)
          setScrollDistance(titleWidth - wrapperWidth);
        } else {
          setScrollDistance(0);
        }
      }
    };

    checkOverflow();
    
    // Recheck on window resize
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [currentTrack?.title]);

  // Check if subtitle text overflows and calculate scroll distance
  useEffect(() => {
    const checkSubtitleOverflow = () => {
      if (subtitleRef.current && subtitleWrapperRef.current) {
        const subtitleWidth = subtitleRef.current.scrollWidth;
        const wrapperWidth = subtitleWrapperRef.current.offsetWidth;
        const needsScroll = subtitleWidth > wrapperWidth;
        setShouldScrollSubtitle(needsScroll);
        if (needsScroll) {
          // Calculate how much we need to scroll (text width - container width)
          setScrollDistanceSubtitle(subtitleWidth - wrapperWidth);
        } else {
          setScrollDistanceSubtitle(0);
        }
      }
    };

    checkSubtitleOverflow();
    
    // Recheck on window resize
    window.addEventListener('resize', checkSubtitleOverflow);
    return () => window.removeEventListener('resize', checkSubtitleOverflow);
  }, [currentTrack?.artist, currentTrack?.album]);

  const toggleQueue = () => {
    setShowQueue((prev) => !prev);
  };

  // Auto-scroll to current track only when queue opens (not on track changes)
  const prevShowQueueRef = useRef(false);
  useEffect(() => {
    // Only scroll when queue first opens, not when tracks change
    if (showQueue && !prevShowQueueRef.current && currentTrackRef.current && queueListRef.current) {
      // Small delay to ensure the DOM has updated
      setTimeout(() => {
        currentTrackRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    }
    prevShowQueueRef.current = showQueue;
  }, [showQueue]);

  const moveQueueItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      setQueue((prev) => {
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prev.length ||
          toIndex >= prev.length
        ) {
          return prev;
        }
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    [setQueue]
  );

  const handleQueueDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleQueueDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleQueueDrop = (
    e: React.DragEvent<HTMLDivElement>,
    index: number
  ) => {
    e.preventDefault();
    const fromIndex =
      dragIndex !== null
        ? dragIndex
        : Number.parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!Number.isNaN(fromIndex)) {
      moveQueueItem(fromIndex, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleQueueDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleQueueItemClick = (index: number) => {
    if (dragIndex !== null) return;
    const track = queue[index];
    if (!track) return;
    const matchesCurrent =
      (track.songId !== undefined && track.songId === currentTrack?.songId) ||
      track.url === currentTrack?.url;
    if (!matchesCurrent) {
      playTrack(track, index);
    }
  };

  const queuePanel = (
    <QueuePanel
      key={`queue-${queue.length}`}
      show={showQueue}
      queue={queue}
      currentTrack={currentTrack}
      queueListRef={queueListRef}
      currentTrackRef={currentTrackRef}
      dragIndex={dragIndex}
      dragOverIndex={dragOverIndex}
      onClose={toggleQueue}
      onItemClick={handleQueueItemClick}
      onDragStart={handleQueueDragStart}
      onDragOver={handleQueueDragOver}
      onDrop={handleQueueDrop}
      onDragEnd={handleQueueDragEnd}
    />
  );

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
        <div style={{ flex: 1 }} />
        <div className="audio-player-volume">
          <button
            className="btn btn-icon queue-toggle"
            onClick={toggleQueue}
            aria-label="Open queue"
            aria-pressed={showQueue}
            title="Queue"
          >
            <svg
              className="queue-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6h16" />
              <path d="M4 12h16" />
              <path d="M4 18h12" />
            </svg>
          </button>
        </div>
        {queuePanel}
      </div>
    );
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value));
  };
  
  // Show drag preview while scrubbing, otherwise mirror the playing time
  const displayTime = isDragging
    ? (dragTimeRef.current ?? dragTime ?? currentTime)
    : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;

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
          <div 
            ref={titleWrapperRef}
            className="audio-player-title-wrapper"
          >
            <div 
              ref={titleRef}
              className={`audio-player-title ${shouldScroll ? 'scroll' : ''}`}
              style={
                shouldScroll
                  ? ({
                      "--scroll-distance": `-${scrollDistance}px`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {currentTrack.title || "Unknown"}
            </div>
          </div>
          <div 
            ref={subtitleWrapperRef}
            className="audio-player-subtitle-wrapper"
          >
            <div 
              ref={subtitleRef}
              className={`audio-player-subtitle ${shouldScrollSubtitle ? 'scroll' : ''}`}
              style={
                shouldScrollSubtitle
                  ? ({
                      "--scroll-distance": `-${scrollDistanceSubtitle}px`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {currentTrack.artist || "Unknown Artist"}
              {currentTrack.album && ` • ${currentTrack.album}`}
            </div>
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
          <span className="audio-player-time">{formatTime(displayTime)}</span>
          <div
            ref={sliderRef}
            className="audio-player-slider"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
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
        <button
          className="btn btn-icon queue-toggle"
          onClick={toggleQueue}
          aria-label="Open queue"
          aria-pressed={showQueue}
          title="Queue"
        >
          <svg
            className="queue-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 6h16" />
            <path d="M4 12h16" />
            <path d="M4 18h12" />
          </svg>
        </button>
      </div>
      {queuePanel}
    </div>
  );
};

export default AudioPlayer;
