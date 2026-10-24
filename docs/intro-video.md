# Opening film

The 18-second 1280×720 WebM opening film uses the existing `src/assets/menu.jpg` key art, animated camera crops, particles, captions, fades and an original synthesized instrumental score. It is an animated artwork introduction, not generated live-action footage.

Run `node tools/make-intro.mjs` to regenerate `public/video/realms-intro.webm` using Chrome and MediaRecorder. No remote assets or music licences are required.

The opening plays muted once per tab, offers Enable sound and Skip intro, supports Escape, and respects reduced-motion preferences. `?intro=1` replays it; `?intro=0` skips it. A loading failure returns to the menu. Music volume follows the saved music settings. Run `node test/introVideo.mjs` after `npm run build:web` to verify playback and navigation.
