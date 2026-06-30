# JCSO Quest - Blooket-Inspired Live Quiz

This version keeps your existing Firebase live PIN-room architecture and DOCJT question banks, but changes the experience from a simple Kahoot-style quiz into an original Blooket-inspired classroom game.

## What changed

- New **JCSO Quest** professional logo branding across the landing, host, and player screens.
- Host can choose a **game mode** before creating the PIN.
- Players choose an original DOCJT-themed **avatar** before joining.
- Lobby now shows avatar cards instead of plain player names.
- Reveal screens now show mode rewards and enhanced leaderboards.
- Player records now track extra mode stats:
  - `coins`
  - `distance`
  - `power`
  - `lastCoins`
  - `lastDistance`
  - `lastPower`
  - `lastModeLabel`

## Game modes

1. **Classic Quiz** - speed points and streak bonuses.
2. **Coin Rush** - correct answers earn coins, with occasional lucky doubled chests.
3. **Cadet Race** - correct answers move avatars down a race track.
4. **Power Battle** - correct answers charge battle power.

These are inspired by game-mode classroom quiz mechanics but use original names, art, styling, and code.

## Question bank options

On `host.html`, use the **Question set** dropdown to choose:

1. Original JCSO Questions (`questions.js`)
2. Refined Questions (`refined_questions.js`)
3. Legal Scenarios (`legal_scenarios_questions.js`)

## Upload instructions

1. Unzip this package.
2. Upload every file and folder inside it to your existing GitHub Pages repo.
3. Replace the older files.
4. Make sure these files are uploaded together:
   - `questions.js`
   - `refined_questions.js`
   - `legal_scenarios_questions.js`
   - `common.js`
   - `host.js`
   - `play.js`
   - `host.html`
   - `play.html`
   - `index.html`
   - `firebase-config.js`
   - `firebase-rules.json`
   - `styles.css`
   - `quiz-click-sprint.mp3`

## Firebase

No Firebase rule change is required for these updates if your previous live version was already working. The existing rules allow players to write their own player profile/avatar fields and allow the host to update scores and mode rewards.

## Use

Host screen:

`host.html`

Player screen:

`play.html`


## Character avatar update

This build replaces the temporary emoji avatars with the supplied law-enforcement square character SVGs. The assets live in ``, and `common.js` maps each selectable character to a local relative path so the images work correctly on GitHub Pages subfolders.

Available characters include Patrol Pals, Detective Chip, K-9 Keeper, Traffic Tango, Forensics Finn, Sheriff Spark, Dispatcher Dot, Ranger Rye, Court Captain, Marine Marshal, Mounted Milo, and Rescue Rookie.


## Avatar display fix / GitHub Pages cache note

This package is a flat, single-folder upload. The avatar artwork is embedded directly inside `common.js`, so the character selector no longer depends on a separate avatar folder path.

The HTML files also use cache-busted URLs such as `common.js?v=20260630-avatarfix` and `styles.css?v=20260630-avatarfix`. This prevents phones/browsers from continuing to run an older cached version that still showed the emoji avatars.

When updating GitHub Pages, upload/replace **all files in this zip** in the repo root. After GitHub finishes publishing, open the site in a private/incognito tab or hard refresh once.
