"use client";

import { VideoMetadata } from "@/lib/types";

interface VideoCardProps {
  video: VideoMetadata;
  onPlay: (video: VideoMetadata) => void;
  onDownload: (video: VideoMetadata) => void;
  onDelete: (video: VideoMetadata) => void;
  onRetry: (video: VideoMetadata) => void;
}

export default function VideoCard({
  video,
  onPlay,
  onDownload,
  onDelete,
  onRetry,
}: VideoCardProps) {
  const getStatusBadge = () => {
    const badges = {
      uploading: { text: "Uploading", color: "bg-blue-500", icon: "⬆️" },
      pending: { text: "Pending", color: "bg-amber-500", icon: "⏳" },
      failed: { text: "Failed", color: "bg-red-500", icon: "⚠️" },
      completed: { text: "Completed", color: "bg-green-500", icon: "✓" },
    };

    const badge = badges[video.status];
    return (
      <span
        className={`${badge.color} text-white text-xs px-3 py-1 rounded-full font-medium shadow-md flex items-center gap-1`}
      >
        <span>{badge.icon}</span>
        <span>{badge.text}</span>
      </span>
    );
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (date: Date): string => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return `Today ${d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else {
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100">
      {/* Thumbnail placeholder */}
      <div
        className="relative aspect-video bg-gradient-to-br from-gray-100 to-gray-200 cursor-pointer hover:from-gray-200 hover:to-gray-300 transition-all flex items-center justify-center group"
        onClick={() => onPlay(video)}
      >
        <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
          <svg
            className="w-8 h-8 text-gray-700 ml-1"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
        <div className="absolute top-3 left-3">{getStatusBadge()}</div>
        <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full font-medium">
          {formatDuration(video.duration)}
        </div>
      </div>

      {/* Metadata */}
      <div className="p-4">
        <div className="text-gray-900 text-sm font-semibold truncate mb-2">
          {video.filename}
        </div>
        <div className="text-gray-500 text-xs mb-3 flex items-center gap-2">
          <span>{formatDate(video.date)}</span>
          <span>·</span>
          <span>{formatSize(video.size)}</span>
        </div>

        {/* Error message */}
        {video.error && (
          <div className="text-red-500 text-xs mb-3 p-2 bg-red-50 rounded-lg truncate">
            ⚠️ {video.error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onPlay(video)}
            className="flex-1 px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs rounded-lg font-medium transition-colors"
          >
            ▶️ Play
          </button>
          <button
            onClick={() => onDownload(video)}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-lg transition-colors"
            title="Download"
          >
            ⬇️
          </button>
          {(video.status === "failed" || video.status === "pending") && (
            <button
              onClick={() => onRetry(video)}
              className="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs rounded-lg transition-colors"
              title="Retry"
            >
              🔄
            </button>
          )}
          <button
            onClick={() => onDelete(video)}
            className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-xs rounded-lg transition-colors"
            title="Delete"
          >
            🗑️
          </button>
        </div>

        {/* Upload attempts */}
        {video.uploadAttempts && video.uploadAttempts > 0 && (
          <div className="text-gray-400 text-xs mt-2">
            Upload attempts: {video.uploadAttempts}
          </div>
        )}
      </div>
    </div>
  );
}
