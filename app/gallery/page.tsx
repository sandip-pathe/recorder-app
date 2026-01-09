"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { videoStorage } from "@/lib/video-storage";
import { uploadQueue } from "@/lib/upload-queue";
import { VideoMetadata } from "@/lib/types";
import VideoCard from "@/components/video-card";
import StorageMeter from "@/components/storage-meter";

export default function GalleryPage() {
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<VideoMetadata | null>(
    null
  );
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const router = useRouter();

  useEffect(() => {
    loadVideos();

    // Refresh videos every 5 seconds to update status
    const interval = setInterval(loadVideos, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadVideos = async () => {
    try {
      await videoStorage.initialize();
      await uploadQueue.initialize();

      const metadata = await videoStorage.getAllMetadata();

      // Sort by date (newest first)
      metadata.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setVideos(metadata);
      setLoading(false);
    } catch (err) {
      console.error("Failed to load videos:", err);
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadVideos();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handlePlayVideo = async (video: VideoMetadata) => {
    try {
      const blob = await videoStorage.getVideo(video.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setSelectedVideo(video);
      }
    } catch (err) {
      console.error("Failed to load video:", err);
    }
  };

  const handleClosePlayer = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(null);
    setSelectedVideo(null);
  };

  const handleDownloadVideo = async (video: VideoMetadata) => {
    try {
      const blob = await videoStorage.getVideo(video.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = video.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to download video:", err);
    }
  };

  const handleDeleteVideo = async (video: VideoMetadata) => {
    if (!confirm(`Delete ${video.filename}?`)) return;

    try {
      await videoStorage.deleteVideo(video.id);
      await uploadQueue.removeFromQueue(video.id);
      await loadVideos();
    } catch (err) {
      console.error("Failed to delete video:", err);
    }
  };

  const handleRetryUpload = async (video: VideoMetadata) => {
    try {
      await uploadQueue.retryVideo(video.id);
      await loadVideos();
    } catch (err) {
      console.error("Failed to retry upload:", err);
    }
  };

  const handleRetryAllFailed = async () => {
    try {
      await uploadQueue.retryAllFailed();
      await loadVideos();
    } catch (err) {
      console.error("Failed to retry all:", err);
    }
  };

  const handleDeleteUploaded = async () => {
    const uploaded = videos.filter((v) => v.status === "completed");
    if (uploaded.length === 0) return;

    if (
      !confirm(
        `Delete ${uploaded.length} uploaded video(s)?\n\nNote: Videos are kept locally even after successful upload to demonstrate local persistence.`
      )
    )
      return;

    try {
      for (const video of uploaded) {
        await videoStorage.deleteVideo(video.id);
      }
      await loadVideos();
    } catch (err) {
      console.error("Failed to delete uploaded videos:", err);
    }
  };

  const failedCount = videos.filter((v) => v.status === "failed").length;
  const uploadedCount = videos.filter((v) => v.status === "completed").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4"></div>
          <div className="text-gray-700 text-lg font-medium">
            Loading videos...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="p-4 max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Recent Projects
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {videos.length} video{videos.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className={`p-2 hover:bg-gray-100 rounded-full transition-colors ${
                refreshing ? "animate-spin" : ""
              }`}
            >
              <svg
                className="w-6 h-6 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          <StorageMeter />

          {/* Batch actions */}
          {(failedCount > 0 || uploadedCount > 0) && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {failedCount > 0 && (
                <button
                  onClick={handleRetryAllFailed}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-sm font-medium shadow-sm transition-all"
                >
                  🔄 Retry Failed ({failedCount})
                </button>
              )}
              {uploadedCount > 0 && (
                <button
                  onClick={handleDeleteUploaded}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-full text-sm font-medium transition-all"
                >
                  🗑️ Delete Uploaded ({uploadedCount})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Video grid */}
      <div className="p-4 max-w-7xl mx-auto">
        {videos.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
              <svg
                className="w-12 h-12 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">
              No videos yet
            </h2>
            <p className="text-gray-500 mb-6">
              Start recording your first video
            </p>
            <button
              onClick={() => router.push("/record")}
              className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-full font-medium shadow-lg transition-all transform hover:scale-105"
            >
              📹 Record Now
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onPlay={handlePlayVideo}
                onDownload={handleDownloadVideo}
                onDelete={handleDeleteVideo}
                onRetry={handleRetryUpload}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating action button */}
      <button
        onClick={() => router.push("/record")}
        className="fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-br from-orange-400 to-pink-500 hover:from-orange-500 hover:to-pink-600 text-white rounded-full shadow-2xl flex items-center justify-center z-20 transition-all transform hover:scale-110 active:scale-95"
        title="Record video"
      >
        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="10" cy="10" r="7" />
        </svg>
      </button>

      {/* Video player modal */}
      {selectedVideo && videoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClosePlayer}
        >
          <div
            className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleClosePlayer}
              className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center text-gray-700 shadow-lg transition-all"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full bg-black"
            />
            <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100">
              <div className="text-lg font-semibold text-gray-900 mb-2">
                {selectedVideo.filename}
              </div>
              <div className="text-sm text-gray-600">
                {new Date(selectedVideo.date).toLocaleString()} ·{" "}
                {(selectedVideo.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
