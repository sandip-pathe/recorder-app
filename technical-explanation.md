# technical explanation

## how local storage works

so here's the deal. this uses two storage systems:

**OPFS (origin private file system)** - the main player. it's basically a private filesystem that browsers give you. videos get written in 1-second chunks while you're recording, so even if the app crashes, you keep everything up to that point. it's fast, reliable, and can handle gigs of data.

**indexedDB** - stores metadata (video id, timestamp, upload status, etc) and acts as fallback if OPFS isn't available.

when you hit record, chunks go straight to OPFS via a web worker (for performance). metadata goes to indexedDB. when you stop, video's already saved locally. no waiting, no network needed.

## platform limitations (iOS vs android)

**android** - pretty much works everywhere. chrome, firefox, samsung browser. OPFS support is solid. quota limits are generous (usually several GB).

**iOS/safari** - here's where it gets messy:
- safari added OPFS support in iOS 15.2+ but it's... quirky
- quota is stingy (might be just a few hundred MB)
- PWA support is there but apple's intentionally limited it
- need to "add to home screen" for full PWA features
- some older iOS versions might fall back to indexedDB only

basically android = smooth sailing, iOS = works but with caveats.

## is this viable long-term?

**for personal use?** absolutely. works great for recording quick clips on your phone when you need them.

**for production/scale?** eh, depends:

pros:
- zero backend storage costs (videos stay local until uploaded)
- works offline
- good UX on modern devices

cons:
- storage quotas vary wildly (android: 6GB+, iOS: maybe 500MB)
- users can clear browser data and lose everything
- no guarantee uploads will complete if they keep videos offline
- OPFS is still relatively new, browser bugs happen

**realistic take:** perfect for a demo/POC or personal tool. for something serious, you'd want to:
- upload ASAP (don't rely on long-term local storage)
- have backend quota enforcement
- show clear storage warnings
- maybe add optional account sync

but yeah, for what it is - a screen recorder that works on mobile without needing a server - it's pretty solid. just don't expect it to replace google drive.
