import React from "react";
import { Track } from "../contexts/AudioPlayerContext";

interface QueuePanelProps {
  show: boolean;
  queue: Track[];
  currentTrack: Track | null;
  queueListRef: React.RefObject<HTMLDivElement | null>;
  currentTrackRef: React.RefObject<HTMLDivElement | null>;
  dragIndex: number | null;
  dragOverIndex: number | null;
  onClose: () => void;
  onItemClick: (index: number) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnd: () => void;
}

const QueuePanel: React.FC<QueuePanelProps> = ({
  show,
  queue,
  currentTrack,
  queueListRef,
  currentTrackRef,
  dragIndex,
  dragOverIndex,
  onClose,
  onItemClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  if (!show) return null;

  return (
    <div className="queue-panel">
      <div className="queue-panel-header">
        <span>Queue ({queue.length})</span>
        <button
          className="btn btn-icon queue-close"
          onClick={onClose}
          aria-label="Close queue"
          title="Close queue"
        >
          <span className="btn-icon-content">x</span>
        </button>
      </div>
      {queue.length === 0 ? (
        <div className="queue-empty">Queue is empty.</div>
      ) : (
        <div className="queue-list" ref={queueListRef}>
          {queue.map((track, index) => {
            const isCurrent =
              (track.songId !== undefined &&
                track.songId === currentTrack?.songId) ||
              track.url === currentTrack?.url;
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index;
            const trackKey = track.songId
              ? `track-${track.songId}-${index}`
              : `track-${track.url}-${index}`;
            return (
              <div
                key={trackKey}
                ref={isCurrent ? currentTrackRef : null}
                className={`queue-item${isCurrent ? " current" : ""}${
                  isDragging ? " dragging" : ""
                }${isDragOver ? " drag-over" : ""}`}
                draggable
                onDragStart={(e) => onDragStart(e, index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={(e) => onDrop(e, index)}
                onDragEnd={onDragEnd}
                onClick={() => onItemClick(index)}
              >
                <span className="queue-item-index">
                  {isCurrent ? (
                    <span
                      className="queue-item-playing-indicator"
                      aria-label="Now playing"
                    >
                      {"\u25B6"}
                    </span>
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="queue-item-info">
                  <div
                    className={`queue-item-title ${isCurrent ? "playing" : ""}`}
                  >
                    {track.title || "Unknown"}
                  </div>
                  <div className="queue-item-subtitle">
                    {track.artist || "Unknown Artist"}
                    {track.album ? ` \u2022 ${track.album}` : ""}
                  </div>
                </div>
                <span className="queue-drag-handle" aria-hidden="true">
                  :::
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QueuePanel;
