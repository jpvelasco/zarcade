# Changelog

All notable changes to Starlight Arcade are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- On desktop, full screen no longer drops when you open a game or go back to
  the arcade. Games now open in a full-window frame on the arcade page, and
  Esc or the "Exit full screen" pill still leaves full screen. Phones and
  tablets are unchanged.

## [1.0.0] - 2026-10-23

The first tagged release of the arcade and its games, as deployed to
<https://jpvelasco.github.io/zarcade/>. The game list lives in
`arcade/games.js`.

### Added

- The arcade can be installed as a mobile app: a web manifest, home-screen
  icons, an offline service worker for the arcade shell, an Install button
  where the browser offers one, and an "Add to Home Screen" hint on iOS
  Safari (#360).

### Fixed

- Every game screen that left a touch player with only a forward path now
  has a way back to the arcade. This matters most in the installed iPhone
  app, which has no browser back button. Affected screens: Glowloop's
  results, Jungle Blaster's stage clear, Keyboard Knights' "Who's playing?",
  Clue Critters' case intro, Sprout Valley's welcome and bedtime cards, and
  Globe GP's race loading screen (#367, #368).
- In Lanternwood, Escape and gamepad Start now pause during conversations,
  item pickups, the down screen and the ending, as the on-screen pause
  button already did (#367).
- The crash screen no longer appears for the browser's harmless
  "ResizeObserver loop" notice; the notice is logged as a warning and play
  continues. Real errors still show the crash screen (#366).
- The Android maskable app icon is centred in the safe zone. It used to sit
  about 52 px up and to the left (#366).
- The Install button hides when the arcade is installed from the browser's
  own menu, not only from the button (#366).
- Pinch-zoom is locked during play on the ten pages that still allowed it
  (#364).

[Unreleased]: https://github.com/jpvelasco/zarcade/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jpvelasco/zarcade/releases/tag/v1.0.0
