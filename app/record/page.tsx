"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { videoStorage } from "@/lib/video-storage";
import { uploadQueue } from "@/lib/upload-queue";
import { VideoMetadata } from "@/lib/types";

type FacingMode = "user" | "environment";

export default function RecordPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const currentVideoIdRef = useRef<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    // Initialize storage and camera on mount
    const init = async () => {
      try {
        await videoStorage.initialize();
        await uploadQueue.initialize();
        // Auto-start camera
        await startCamera();
      } catch (err) {
        console.error("Initialization failed:", err);
        setError("Failed to initialize");
      }
    };
    init();

    return () => {
      stopCamera();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const getMimeType = (): string => {
    // Try different MIME types based on browser support
    const types = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "video/webm"; // Fallback
  };

  const startCamera = async () => {
    setIsInitializing(true);
    setError(null);

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsInitializing(false);
    } catch (err) {
      console.error("Camera access failed:", err);
      setError("Failed to access camera. Please grant camera permissions.");
      setIsInitializing(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startRecording = async () => {
    if (!streamRef.current) {
      await startCamera();
      if (!streamRef.current) return;
    }

    try {
      const mimeType = getMimeType();
      const options: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: 2500000, // 2.5 Mbps
      };

      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Generate unique video ID
      const videoId = `video-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      currentVideoIdRef.current = videoId;

      let chunkIndex = 0;

      // Handle data available (1-second chunks)
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);

          // Save chunk to storage immediately
          try {
            await videoStorage.saveVideoChunk(
              videoId,
              event.data,
              chunkIndex === 0
            );
            chunkIndex++;
            console.log(`Saved chunk ${chunkIndex} for ${videoId}`);
          } catch (err) {
            console.error("Failed to save chunk:", err);
          }
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: mimeType });

          // Create metadata
          const metadata: VideoMetadata = {
            id: videoId,
            filename: `${videoId}.webm`,
            duration: recordingTime,
            size: blob.size,
            date: new Date(),
            mimeType,
            status: "pending",
            uploadAttempts: 0,
          };

          try {
            // Save final video and metadata
            await videoStorage.saveVideo(videoId, blob, metadata);

            // Add to upload queue
            await uploadQueue.addToQueue(videoId);

            console.log(`Recording saved: ${videoId} (${blob.size} bytes)`);

            // Vibrate on completion
            if ("vibrate" in navigator) {
              navigator.vibrate(200);
            }
          } catch (err) {
            console.error("Failed to save recording:", err);
            setError("Failed to save recording");
          }
        }

        chunksRef.current = [];
        currentVideoIdRef.current = null;
      };

      // Start recording with 1-second chunks
      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);

      // Vibrate on start
      if ("vibrate" in navigator) {
        navigator.vibrate(100);
      }

      // Start timer
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording:", err);
      setError("Failed to start recording");
    }
  };

  const pauseRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resumeRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "paused"
    ) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);

      // Resume timer
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);

      // Navigate to gallery after short delay
      setTimeout(() => {
        router.push("/gallery");
      }, 1000);
    }
  };

  const toggleCamera = async () => {
    const newMode: FacingMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);

    if (streamRef.current && !isRecording) {
      stopCamera();
      await startCamera();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex justify-between items-center text-white">
          <button
            onClick={() => router.push("/gallery")}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors"
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
          <div className="text-xl font-mono font-semibold">
            {isRecording ? formatTime(recordingTime) : "00:00"}
          </div>
          <button
            onClick={toggleCamera}
            disabled={isRecording}
            className={`w-12 h-12 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-all ${
              isRecording ? "opacity-30" : "hover:bg-black/70"
            }`}
          >
            <svg
              className="w-6 h-6 text-white"
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
      </div>

      {/* Video preview */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Recording indicator */}
        {isRecording && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-full flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-white animate-pulse" />
            <span>REC</span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg max-w-xs text-center">
            {error}
          </div>
        )}

        {/* Loading */}
        {isInitializing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="text-white text-lg">Initializing camera...</div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex justify-center items-center gap-12">
          {!isRecording ? (
            <>
              {/* Gallery button */}
              <button
                onClick={() => router.push("/gallery")}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all"
              >
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
              {/* Record button */}
              <button
                onClick={startRecording}
                disabled={!streamRef.current || isInitializing}
                className="w-20 h-20 rounded-full bg-red-500 border-4 border-white disabled:opacity-30 shadow-2xl hover:scale-105 transition-transform active:scale-95 flex items-center justify-center"
              >
                <div className="w-16 h-16 rounded-full bg-red-600"></div>
              </button>
              {/* Switch camera button */}
              <button
                onClick={toggleCamera}
                disabled={isRecording || isInitializing}
                className="w-14 h-14 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-all disabled:opacity-30"
              >
                <svg
                  className="w-7 h-7 text-white"
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
            </>
          ) : (
            <>
              {/* Gallery button (disabled during recording) */}
              <button
                disabled
                className="w-14 h-14 flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm opacity-30"
              >
                <svg
                  className="w-7 h-7 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
              {/* Stop button */}
              <button
                onClick={stopRecording}
                className="w-20 h-20 rounded-full bg-white border-4 border-red-500 shadow-2xl hover:scale-105 transition-transform active:scale-95 flex items-center justify-center"
              >
                <div className="w-8 h-8 rounded bg-red-500"></div>
              </button>
              {/* Pause/Resume button */}
              {!isPaused ? (
                <button
                  onClick={pauseRecording}
                  className="w-14 h-14 rounded-full bg-amber-500 border-3 border-white shadow-xl hover:scale-105 transition-transform active:scale-95 flex items-center justify-center"
                >
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={resumeRecording}
                  className="w-14 h-14 rounded-full bg-green-500 border-3 border-white shadow-xl hover:scale-105 transition-transform active:scale-95 flex items-center justify-center"
                >
                  <svg
                    className="w-6 h-6 text-white ml-1"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
