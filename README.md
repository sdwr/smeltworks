# Smeltworks

An autobattler with Diablo-style loot. You fight down through a grid of battles, the fights play themselves, and
your job is the build: skills, gear, and what you remake at the forge.

## Play

Open `index.html` in a browser. There is no build step and nothing to install.
(If you prefer a server: `python -m http.server 8437` in this folder, then http://localhost:8437.)

The game saves to the browser's local storage after every battle. Settings (the gear icon) can copy a save out as
text, load one back in, or wipe it.

| Key | Does |
| --- | --- |
| Space | Pause / resume |
| A | Toggle Auto (explore and fight without waiting for you) |
| 1 2 3 | Speed 1×, 2×, 4× |
| G S F C | Gear, Skills, Forge, Codex |
| T | Travel |

Mouse: click a glowing tile to fight there. Click a bag item to equip it, right-click to salvage it (Shift for
Legendaries), Alt-click to lock it. In Skills, click to learn, right-click to refund, Shift-click to move a skill on
or off the bar.

## What is in it

- **The map.** Each area is a 7×5 grid under fog: monster packs, elites with modifiers, chests, shrines and a boss.
  Clear a tile to reveal its neighbours. Beat the boss to open the next area.
- **Fifteen areas in five acts**, each act with its own monsters and a scripted boss, then four Torment tiers that
  replay the descent at higher levels with better drops.
- **Loot.** Ten gear slots, five rarities, 27 affixes, 31 legendary aspects and 12 uniques. Item level follows
  monster level. Tooltips compare against what you are wearing.
- **The forge.** Upgrade (+5% per step, a masterwork every fourth), enchant (reroll one affix), imprint (stamp an
  aspect from the Codex onto a Rare), commission (pay gold for a random piece in a slot you choose), salvage.
- **Skills.** Three disciplines: Hammer (physical, stuns), Ember (burns), Storm (lightning, crits). Five skills on
  the bar; the smith picks the best Core skill for each moment. Free respec. Paragon points past level 50.
- **Auto.** Explores, fights, moves to the next area, and falls back to gather strength if it keeps dying.

## Code

Plain scripts, loaded in order by `index.html`, all hanging off one global `SW`.

| File | What it holds |
| --- | --- |
| `js/data.js` | All the content: affixes, aspects, uniques, skills, monsters, bosses, areas, tuning constants |
| `js/items.js` | Rolling items, reading their stats, forge operations |
| `js/hero.js` | The stat sheet, level curves, the power rating used for comparisons |
| `js/combat.js` | The battle engine. No DOM. Emits events for the renderer |
| `js/game.js` | Save state, map generation, drops, experience, the update loop, player actions |
| `js/sprites.js` | Every sprite, drawn as character grids and painted through palettes |
| `js/fx.js` | The arena canvas: actors, particles, damage numbers, loot beams |
| `js/audio.js` | Synthesised sound effects |
| `js/ui.js` | Everything in the DOM: map, gear, skills, forge, codex, tooltips, dialogs |
| `js/main.js` | Boot and the frame loop |

The first five files have no DOM in them, so they run under Node for tests.

## Tests and tuning

```
node tests/logic.test.cjs     # rule checks: items, forge, skills, battles, saves
node tests/balance.cjs hammer 5400 1    # one bot run: build, seconds of game time, seed
node tests/sweep.cjs 6000 3             # pacing across builds and seeds
node tests/sweep.cjs 6000 3 casual      # a player who never uses the forge
node tests/sweep.cjs 6000 3 casual-rush # ...and heads straight for every boss
node tests/deaths.cjs                   # what kills the bot, and where
```

`tests/sheet.html?set=mobs` (also `gear`, `glyph`) shows the sprite sheets.

The knobs that matter most for pacing are at the top of `js/data.js` (`FLAT_G`, `MOB_HP_G`, `MOB_DMG_G`,
`TIER_HP`, `TIER_DMG`) and the `mobHp`, `mobDmg` and `xpNeed` curves in `js/hero.js`.

## Art and sound

Everything is made in code: sprites are hand-drawn pixel grids in `sprites.js`, backgrounds are painted
procedurally, and sound is synthesised with Web Audio. There are no asset files.

The older idle-game prototypes are in `legacy/`.
