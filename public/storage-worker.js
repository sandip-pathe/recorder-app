// Web Worker for OPFS synchronous writes (performance optimization)
// This worker handles high-performance file writes using OPFS synchronous access

self.addEventListener("message", async (event) => {
  const { action, videoId, chunk, isFirstChunk } = event.data;

  try {
    if (action === "write") {
      // Get OPFS root
      const opfsRoot = await navigator.storage.getDirectory();
      const fileHandle = await opfsRoot.getFileHandle(`${videoId}.webm`, {
        create: true,
      });

      // Use synchronous access handle for better performance
      const accessHandle = await fileHandle.createSyncAccessHandle();

      try {
        if (isFirstChunk) {
          // Truncate file and write from beginning
          accessHandle.truncate(0);
          const buffer = await chunk.arrayBuffer();
          accessHandle.write(buffer, { at: 0 });
        } else {
          // Append to end of file
          const size = accessHandle.getSize();
          const buffer = await chunk.arrayBuffer();
          accessHandle.write(buffer, { at: size });
        }

        accessHandle.flush();
        self.postMessage({ success: true, videoId });
      } finally {
        accessHandle.close();
      }
    } else if (action === "delete") {
      const opfsRoot = await navigator.storage.getDirectory();
      await opfsRoot.removeEntry(`${videoId}.webm`);
      self.postMessage({ success: true, videoId });
    }
  } catch (error) {
    self.postMessage({
      success: false,
      videoId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
