# Changelog

## [1.1.2] - 2025-02-21
### Added
- **Explicit Cheatcode Prompt:** Tapping the *Shields* HUD chip now directly prompts the user to enter a secret code ("GODMODE") for mobile users who prefer not to use the double-tap sequence.
- **PWA Capabilities:** The application can now be properly installed as a standalone Progressive Web App (PWA) on Mobile and Desktop devices directly from the browser.
- **Improved Help Menu:** Added documentation explaining how to toggle sound via keyboard or UI buttons.

## [1.1.1] - 2025-02-21
### Fixed
- **Mobile Portrait Overhaul:** Narrowed the width of wall obstacles and heavily scaled down gravity and thrust physics specifically for portrait mode devices, making the game far more playable on completely vertical screens.
- **Start Sequence:** Redesigned the "3, 2, 1, GO!" animation to pulse dynamically with a neon glow, and corrected a bug that caused the countdown to run too slowly on mobile.
- **Progressive Web App:** Changed the manifest orientation default to "any" to allow both Landscape and Portrait.

## [1.1.0] - 2025-02-21
### Added
- **High Score Persistence:** Best scores are now saved locally and tracked in the HUD.
- **Dynamic Feedback:** Added celebratory fireworks upon reaching a new High Score and random "Try Again" messaging upon game over.
- **Mobile Optimizations:** Implemented aspect-ratio-based speed scaling so mobile portrait mode has the same reaction time as desktop.
- **UI Scaling:** Added responsive CSS media queries to cleanly resize HUD elements and buttons on smaller screens.

### Changed
- **Code Organization:** Extracted inline styles and scripts from `index.html` into `style.css` and `script.js` respectively.
- **Visuals:** Cleaned up overlay text and polished the Game Over screens.

## [1.0.0] - Initial Release
- Core gameplay loop with obstacles, items, and progressive difficulty.