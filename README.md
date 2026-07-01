# JCSO Quest — Power Battle UI + Reaction Time Build

Single-folder GitHub Pages build. Upload all files in this zip into the repo root.

## Included in this build

- Gold Rush fixes from the previous build remain intact.
- Cadet Race custom assets remain intact.
- Power Battle now uses the new custom battle UI assets:
  - VS screen
  - losing screen
  - countdown 3 / 2 / 1 images
  - custom health-bar images
- Power Battle now tracks reaction times:
  - each player's latest reaction time
  - each player's best correct reaction time
  - the fastest reaction time for the round
  - best reaction-time leaders on the host reveal and final screens
- Power Battle scoring remains lives first, then wins, then best reaction time.

## Upload note

Keep the structure flat. Do not put files into folders.


Update note: This build restores answer-position randomization for every selected question before a game PIN is created, so self-paced modes no longer show the correct answer in the first/triangle slot every time.


Updated with the Power Battle UI pack, 5-life battle flow, simultaneous pairings, and reaction-time tracking.


## Lightweight upload note
This build keeps the Power Battle redesign but compresses the large artwork to WebP and removes unused duplicate assets so GitHub can process it more easily. Extract first, then upload the extracted files into the repo root.


## Power Battle native UI fix
This build removes the large proof/mockup images from live Power Battle gameplay. Power Battle now uses responsive native HTML/CSS components for matchup, countdown/question, waiting, reveal, host board, and final results. The proof images are no longer rendered as page content.


## Power Battle automatic flow update
Power Battle now uses a separate matchup/countdown screen before the question appears, reveals the question after the countdown, automatically resolves once active players answer or time expires, shows results for 10 seconds, then automatically launches the next randomized matchup. The host screen is display-only for matchups, standings, and final podium.


## Power Battle auto-flow v2
Fixes readability, restores a safer host display board, and corrects the automatic reveal/next-question flow using the actual Firebase `state.phase` and `answers/questionIndex` paths.


## Gold Rush separated screen flow
Gold Rush player UI now uses separate screens/phases to avoid overcrowding and scroll-jump glitches:
- question-only screen with just the question and answer choices
- chest-only screen after a correct answer
- selected chest opening animation where the chosen chest takes focus
- reward result screen
- leaderboard screen
Players double-tap the reward result to show the leaderboard, then double-tap the leaderboard to continue to the next question.


## Gold Rush stability v2
- Result and leaderboard instructions now say tap instead of double-tap.
- Steal chests open a dedicated target-selection screen.
- Gold changes from other players no longer force full screen re-renders.
- If someone steals from you or your gold changes, a small notification popup appears instead of jumping the screen.
