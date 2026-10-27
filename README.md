# game-profile: a local player profile for the board game sites

Two small files, `profile.js` (~28 KB) and `profile.css`, give a game a **player profile**:
name + picture (16 original icons, shared by every game on the site), stats per game (games,
wins, losses, draws, per mode and per computer level, win streaks), a **local Elo** against the
computer levels, **achievements** (each game supplies its own list), a **Daily game** helper
(date-seeded random numbers, played today, daily streak) and a compact **"My stats" panel**.
Export / import as a JSON file.

Everything stays in `localStorage` on the player's device. No network, no Firebase, $0.
Every storage access is wrapped in try/catch: with storage blocked (private mode, full, iframe)
the profile keeps working in memory until the page closes. Nothing ever throws into the game.

Demo: <https://timothyhadfield.github.io/game-profile/demo.html> · Tests: `npm test`

## 1. Copy it in

1. Copy `profile.js` to `js/profile.js` and `profile.css` to `css/profile.css`, **unchanged**
   (mark both `-text` in `.gitattributes`, like the other shared kits).
2. `<link rel="stylesheet" href="css/profile.css">`, then load the script either way (it sets `window.Profile`):
   - classic: `<script src="js/profile.js"></script>` before your app script
   - module: `import "./profile.js";` at the top of your module, then use `Profile`
3. Call `Profile.init({...})` once at start-up (below).
4. Put a button somewhere visible that calls `Profile.openPanel()`. Class `pf-open` gives it an
   avatar slot: `btn.innerHTML = Profile.avatarSVG(Profile.avatar, 28) + "My stats"`.
5. Call `Profile.recordResult({...})` **once** when a game ends (guard against Undo / re-render
   counting it twice, e.g. with a game id).
6. Optional: a Daily game. Build today's deal with `Profile.daily.rng()` and pass `daily: true`
   to `recordResult` for that game.

## 2. API

```js
Profile.init({
  game: "connect-four",               // a-z 0-9 - _ ; stats are stored under "profile:<game>"
  levels: [{ id: "easy", name: "Easy", rating: 1200 }, ...],   // the computer levels and their Elo
  achievements: [{ id, title, desc, test: ctx => bool }, ...], // test may throw: treated as false
  modes: { friends: { name: "2 players" }, online: { name: "Online" } },  // names in the panel; { hide: true } hides one
  daily: { title: "Daily game", onPlay: () => startDaily() },  // omit for no Daily tab
  name: "Tim",                        // used only if the profile has no name yet
  toast: true,                        // show the achievement banner (plays FX "ding" if game-fx is loaded)
  onUnlock: a => {}, onChange: what => {},   // what: result | me | import | reset | open | close
  now: () => new Date(),              // for tests
});

Profile.recordResult({ mode: "computer", level: "easy", won: true | false | null, draw, score, daily, extra, date, quiet })
// -> { unlocked: [{ id, title, desc }], elo: { before, after, change } | null, streak, daily: info | null }
//   won: null = a game with no winner of mine (pass-and-play), counted as played only.
//   level must be one of init's levels for the game to be rated. extra = anything your tests need.
//   date ("YYYY-MM-DD") + quiet: bring in older games without banners.

Profile.openPanel({ tab: "levels" | "awards" | "daily", edit }) / Profile.closePanel() / Profile.isOpen()
Profile.stats()        // a copy: games, wins, losses, draws, streak, bestStreak, byMode, byLevel, elo, ach, daily, recent, name, avatar
Profile.name, Profile.avatar, Profile.elo, Profile.storageBlocked, Profile.avatars, Profile.version
Profile.setName(s), Profile.setAvatar(id), Profile.avatarSVG(id, size)
Profile.levelRating(id)
Profile.export() -> JSON string; Profile.import(text) -> { ok, games, error }   // the panel has buttons for both
Profile.reset()        // this game's stats only
Profile.onChange(fn)   // returns an unsubscribe function

Profile.daily.date()            // "YYYY-MM-DD", the player's local day
Profile.daily.seed(day, salt)   // 32-bit seed: same for every player on that day of that game
Profile.daily.rng(day, salt)    // seeded Math.random replacement for building today's deal
Profile.daily.played(day), Profile.daily.result(day), Profile.daily.streak() -> { cur, best }, Profile.daily.info()
```

**Achievement test context** `ctx`: `{ stats, last, levels, daily }`. `last` is the game just
recorded: `{ mode, level, won, draw, result, score, daily, dailyNew, elo, extra }` (null when
`init` re-checks the list, so a newly added achievement that is already true unlocks quietly).

**Elo**: you start at 1200. K = 40 for your first 10 rated games, then 24; floor 100. Only games
against a listed computer level are rated. Give each level a rating from measured games between
the levels (score p between two levels → difference = 400·log10(p / (1 − p))).

**Panel**: phone = bottom sheet with tabs (Levels / Awards / Daily) and a fixed height, so nothing
jumps when you switch tabs; laptop (≥ 900 px wide) = a centred card with the sections side by
side; phone on its side = full-height card. Only the list inside scrolls, never the page. Tap your
name to change name and picture, export or import. Esc, ✕ or a tap outside closes it. Colours
come from the game's `--card --line --text --muted --accent --good --bad` variables.

**Storage**: `profile:me` (name + picture, shared by every game on the site) and
`profile:<game>` (that game's stats). Everything read back is cleaned (bad numbers → 0, unknown
fields dropped, at most 30 recent games and 120 daily days), so a hand-edited or old file can't
break the page.

## 3. Changelog

- **1.0.0** (2026-10-27): first version. Name + 16 original avatars, per-game stats per mode and
  level, streaks, local Elo vs computer levels, achievements with banner, Daily helper
  (date-seeded RNG, played today, daily streak, 14-day strip), My stats panel (phone / laptop /
  landscape), export / import JSON, in-memory fallback when storage is blocked. Pilot: Connect Four.
