# Changelog

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