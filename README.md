# Smeltworks

An autobattler with Diablo-style loot. You fight down through a grid of battles, the fights play themselves, and
your job is the build: skills, gear, and what you remake at the forge.

## Play

Open `index.html` in a browser. There is no build step and nothing to install.
(If you prefer a server: `python -m http.server 8437` in this folder, then http://localhost:8437.)

To share it as a single file, `node build-single.cjs` writes `dist/smeltworks.html` with everything inlined.

The game saves to the browser's local storage after every battle. Settings (the gear icon) can copy a save out as
text, load one back in, or wipe it.

| Key | Does |
| --- | --- |
| Space | Pause / resume |
| A | Toggle Auto (explore and fight without waiting for you) |
| 1 2 3 | Speed 1×, 2×, 4× |
| G S F U C | Gear, Skills, Forge, Cube, Codex |
| T | Travel |

Mouse: click a glowing tile to fight there. Click a bag item to equip it, right-click to salvage it (Shift for
Legendaries), Alt-click to lock it, Ctrl-click to send it to the stash (or back). Drag items to rearrange the bag
and stash, onto the paper doll to equip, or off it to unequip. In Skills, click a skill to use it and click again to drop it.

## What is in it

- **The map.** Each area is a 7×5 grid under fog: monster packs, elites with modifiers, chests, shrines and a boss.
  Clear a tile to reveal its neighbours. Beat the boss to open the next area.
- **Fifteen areas in five acts**, each act with its own monsters and a scripted boss, then four Torment tiers that
  replay the descent at higher levels with better drops.
- **Gear is the only progression.** There are no character levels or experience. Every piece has one fixed main stat
  for its type and level (weapons damage, armour armor, rings and amulets life) plus random affixes: 1-2 on Magic,
  3-4 on Rare, 4 on Legendary. Skill ranks come from "+ to skills" affixes.
- **Loot.** Ten gear slots, five rarities, 26 affixes, 30 legendary aspects and 12 uniques. Item level follows
  monster level, and drops lean towards the slots where your gear has fallen behind. Tooltips compare against what
  you are wearing. The bag holds 24; when it is full, new drops are salvaged on the spot.
- **Stash.** Sixteen slots under the bag for gear you are keeping to craft with. Nothing in it is ever salvaged,
  and it is what the Cube tab offers you alongside what you are wearing.
- **The forge.** Upgrade (+5% per step, a masterwork every fourth), enchant (reroll one affix), imprint (stamp an
  aspect from the Codex onto a Rare), commission (pay gold for a random piece in a slot you choose), salvage.
- **The cube.** Put in a piece of gear and an orb, press Transmute, take what you get. Kindling Orbs add a random
  affix (up to four, lifting Common to Magic to Rare on the way), Quenching Orbs remove one at random, Slag Orbs
  reroll them all, Tempering Orbs reroll the numbers. Kindling and Quenching can be aimed at a type (Offence,
  Defence, Utility or Skills); the affix within the type is still random. Orbs drop from elites, bosses, chests and full clears.
- **Skills.** Three disciplines: Hammer (physical, stuns), Ember (burns), Storm (lightning, crits). Every skill is
  available from the start: pick five for the bar and three passives. The smith picks the best Core skill for each
  moment.
- **Damage meter.** The arena shows measured DPS for the current fight, the average over the last ten, and which
  skills, burns and procs it came from.
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
node tests/logic.test.cjs     # rule checks: items, forge, cube, skills, battles, saves
node tests/balance.cjs hammer 5400 1    # one bot run: build, seconds of game time, seed
node tests/sweep.cjs 6000 3             # pacing across builds and seeds
node tests/sweep.cjs 6000 3 casual      # a player who never uses the forge
node tests/sweep.cjs 6000 3 casual-rush # ...and heads straight for every boss
node tests/deaths.cjs                   # what kills the bot, and where
```

`tests/sheet.html?set=mobs` (also `gear`, `glyph`) shows the sprite sheets.

The knobs that matter most for pacing are at the top of `js/data.js` (`FLAT_G`, `MOB_HP_G`, `MOB_DMG_G`,
`TIER_HP`, `TIER_DMG`) and the `mobHp` and `mobDmg` curves in `js/hero.js`. Drop rates are in `dropsFor` in `js/game.js`.

## Art and sound

Everything is made in code: sprites are hand-drawn pixel grids in `sprites.js`, backgrounds are painted
procedurally, and sound is synthesised with Web Audio. There are no asset files.

The older idle-game prototypes are in `legacy/`.
