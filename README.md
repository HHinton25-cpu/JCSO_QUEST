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
