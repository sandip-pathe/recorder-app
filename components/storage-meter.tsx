"use client";

import { useState, useEffect } from "react";
import { videoStorage } from "@/lib/video-storage";

export default function StorageMeter() {
  const [quota, setQuota] = useState({ usage: 0, quota: 0, percentUsed: 0 });
  const [warning, setWarning] = useState(false);

  useEffect(() => {
    updateQuota();

    // Poll every 5 seconds when active
    const interval = setInterval(updateQuota, 5000);

    return () => clearInterval(interval);
  }, []);

  const updateQuota = async () => {
    try {
      const quotaInfo = await videoStorage.getStorageQuota();
      setQuota(quotaInfo);

      // Warn at 80%
      setWarning(quotaInfo.percentUsed >= 80);
    } catch (err) {
      console.error("Failed to get storage quota:", err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  if (quota.quota === 0) {
    return (
      <div className="bg-gray-100 rounded-xl p-3">
        <div className="text-gray-500 text-sm">Storage info unavailable</div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-4 ${
        warning
          ? "bg-amber-50 border border-amber-300"
          : "bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-100"
      }`}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="text-gray-900 text-sm font-semibold">💾 Storage</div>
        <div
          className={`text-xs font-medium ${
            warning ? "text-amber-700" : "text-gray-600"
          }`}
        >
          {formatBytes(quota.usage)} / {formatBytes(quota.quota)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full transition-all ${
            warning
              ? "bg-gradient-to-r from-amber-400 to-orange-500"
              : "bg-gradient-to-r from-blue-500 to-purple-600"
          }`}
          style={{ width: `${Math.min(quota.percentUsed, 100)}%` }}
        />
      </div>

      {warning && (
        <div className="text-amber-700 text-xs mt-2 font-medium">
          ⚠️ Storage is running low. Consider deleting old videos.
        </div>
      )}

      <div
        className={`text-xs mt-1 font-medium ${
          warning ? "text-amber-600" : "text-gray-500"
        }`}
      >
        {quota.percentUsed.toFixed(1)}% used
      </div>
    </div>
  );
}
