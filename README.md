# Video Recorder PWA

A mobile-first Progressive Web App for video recording with resilient local storage and automatic cloud upload retry.

## Features

- 📹 **Native Camera Recording** - Front/rear camera support with real-time streaming
- 💾 **OPFS Storage** - Videos persist through browser crashes using Origin Private File System
- 📤 **Smart Upload Queue** - Automatic retry with exponential backoff
- 🎬 **Gallery View** - Manage recordings with status tracking (Pending, Uploading, Failed, Completed)
- 📊 **Storage Monitoring** - Real-time quota tracking with warnings
- 🔄 **Offline Support** - Record and queue videos even without internet
- 📱 **Mobile Optimized** - iOS Safe Area support, haptic feedback, native-like UI

## Tech Stack

- **Next.js 14+** (App Router) with TypeScript
- **MediaRecorder API** for video capture
- **OPFS (Origin Private File System)** for primary storage
- **IndexedDB** for metadata and fallback storage
- **Tailwind CSS** for styling

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app. It will redirect to the gallery.

## Usage Flow

1. **Record Video:**
   - Tap FAB (+) button in gallery
   - Grant camera permissions
   - Toggle front/rear camera
   - Start recording (saves 1-second chunks to OPFS)
   - Stop recording → auto-navigates to gallery

2. **View Gallery:**
   - Videos display with status badges
   - Tap thumbnail to play in modal
   - Download button triggers browser download
   - Delete removes from OPFS and queue

3. **Upload Management:**
   - Videos auto-queue for upload on save
   - Background retry every 5 seconds
   - Failed uploads show "Retry" button
   - Batch actions: "Retry All Failed", "Delete Uploaded"

## Testing Scenarios

### Crash Resilience
1. Start recording
2. Close browser tab mid-recording
3. Reopen app → video should be in gallery with pending status

### Network Failure
1. Turn on airplane mode
2. Record video → saves to OPFS
3. Turn off airplane mode → auto-uploads

## Browser Support

- **Chrome/Edge 86+** - Full OPFS support
- **Safari 15.2+** - OPFS support (iOS 15.2+)
- **Firefox** - Falls back to IndexedDB

## Mock Upload API

The app includes a mock upload function that simulates 80% success rate. Replace `mockUpload()` in `lib/upload-queue.ts` with real API calls.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
