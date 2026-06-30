# JCSO Quest — Self-Paced Game Modes Build

This build keeps the project in one flat folder for GitHub Pages uploads.

## Updated host flow

1. `index.html` → Host a Game
2. `modes.html` → choose the game mode
3. `host.html?mode=...` → choose question bank, category, question pool, and game options
4. Launch the PIN room and start the game

## Modes

- **Classic Quiz**: host-paced Kahoot-style quiz with question timer, reveal, and points leaderboard.
- **Gold Rush**: self-paced. Correct answers unlock three mystery chests. Chest rewards can give gold, triple gold, steal gold, raid gold, or take gold. The game ends at the gold goal or overall time limit.
- **Cadet Race**: self-paced. Correct answers unlock route cards and players race toward the distance goal.
- **Power Battle**: self-paced. Correct answers unlock tactical crates for power, shields, healing, siphons, and battle events.

## Upload notes

Upload all files to the same GitHub Pages folder/repo root. Do not move files into subfolders unless you also update every path.

Important files to replace:

- `index.html`
- `modes.html`
- `host.html`
- `play.html`
- `common.js`
- `host.js`
- `play.js`
- `styles.css`
- all included `.png`, `.svg`, `.js`, and `.mp3` files

After uploading, test with one host tab and at least two player tabs.


## 20260630 Gold Rush polish update

- Renamed the chest mode everywhere to **Gold Rush**.
- Uses the Gold Rush mode logo wherever the mode label appears in the player/host UI.
- Raised Gold Rush host goal options up to 10,000,000 gold.
- Gold Rush chests now include more frequent percent-based trap, steal, and raid outcomes.
- Fixed the player-side self-paced countdown so it updates locally every second instead of waiting for the next Firebase update.
- Kept the project flat for GitHub Pages uploads.


## Blend fix update

This build replaces the Gold Rush PNG art with transparent-background versions and cache-busts the image references so mobile browsers do not keep showing the old square/checkerboard backgrounds.

## Cadet Race asset update

- Integrated the custom Cadet Race gameplay assets into the player reward cards, opening screen, result screen, and host race board.
- Added transparent-background versions of:
  - `jcso-race-track-md.png`
  - `jcso-race-car-md.png`
  - `jcso-patrol-unit-md.png`
- Replaced generic route-card emoji UI with polished race cards.
- Updated the host race board to show a race arena and patrol car progress markers.
- Increased Cadet Race distance goal options up to 5,000 ft.
