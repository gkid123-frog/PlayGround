# PlayGround

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://go.ondev.store/).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://go.ondev.store/gkid123-frog/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/gkid123-frog/PlayGround)

- 🎮 [Open the project](https://go.ondev.store/gkid123-frog/PlayGround).
- ✨ [Remix this project](https://go.ondev.store/gkid123-frog/PlayGround?remix=1).
- 💻 [Explore the source](https://github.com/gkid123-frog/PlayGround).
- 🛠️ [Check build runs](https://github.com/gkid123-frog/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/gkid123-frog/PlayGround/issues).
- 👤 [Explore the creator's projects](https://go.ondev.store/gkid123-frog).
- 🌍 [Create with OMGithub](https://go.ondev.store/).
<!-- omgithub:readme:end -->

## Morning Mayhem — Dad Duty

A single-file browser RPG about getting three kids through a busy morning. Open `index.html` (or run `npm run serve`) and press **Start game**.

- **Move:** WASD / arrow keys / on-screen pad
- **Interact:** E or the on-screen action button
- **Dad break:** B or the sidebar button (restores patience/focus; has a cooldown)
- **Coffee:** interact with the kitchen coffee maker when focus dips

Complete breakfast, showers, laundry, lunch, dishes, afternoon activities, and dinner in order, then tuck in all three girls and get Dad to bed.

**Backyard breather:** walk Dad into the exit door (or interact with it) and confirm to head outside. Fresh air restores some focus and patience, lifts the girls’ moods, and banks a cooperation boost for Dad’s next request. Charlie patrols the fence and barks at passing cars. Call the girls out to the sandbox for a bonding boost, play fetch with Charlie, then head back inside when it’s time to tackle the next chore.

## Tests

```sh
npm install
npm test
```

The suite starts a local static server and runs the full-day browser playtest, the mechanics checks, the Charlie nap/obstacle checks, the opening-break regression test, and the backyard purpose checks. See `tests/` for the individual scripts.
