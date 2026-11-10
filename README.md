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
| Q | Drink the flask |
| S F O C | Skills, Crafting, Commission, Codex |
| T | Travel |

The screen is three panes. Left: Skills, Crafting, Commission and the Codex. Middle: your character, bag and
stash, centred. Right: the fight and the map, the same width as the left pane. On a window narrower than 1240px they stack instead.

Mouse: click a glowing tile to fight there. Click more tiles to lay a route: they are numbered 1, 2, 3 and visited
in that order whether Auto is on or off (Auto only chooses when the route is empty). A route can run through
unexplored tiles, a click on a numbered tile takes it off, and falling clears it. If the smith is walking with no
route set, a click sends them to that room instead. Click any piece of gear to put it on the crafting bench. Right-click
a piece to equip it, or to take it off if you are wearing it. The bench's Clear button only empties the bench. Shift-right-click salvages it, Alt-click locks it,
Ctrl-click sends it to the stash (or back). Drag items to rearrange the bag and stash, onto the paper doll to
equip, or off it to unequip. In Skills, click a skill to use it and click again to drop it. Click the flask on
the skill bar to drink it.

## What is in it

- **The map.** Each area is a 7×5 grid under fog: monster packs, elites with modifiers, chests, shrines and a boss.
  Clear a tile to reveal its neighbours. Beat the boss to open the next area.
- **Fifteen areas in five acts**, each act with its own monsters and a scripted boss, then four Torment tiers that
  replay the descent against tougher monsters with better drops.
- **Gear caps at item level 50.** Torment monsters keep climbing (levels 50-59 in Torment I up to 80-89 in
  Torment IV), but gear does not. From there you grow through Ancestral gear, masterworking, greater affixes and
  better rolls.
- **Ancestral gear.** In Torment any drop, chest piece or commission can come out Ancestral: item level 55, about
  one and a half times the main stat of a level 50 piece. The chance is 3% in Torment I, then 6%, 10% and 15%. Ancestral gear
  has a bright frame and a gold item level, and is never auto-salvaged or caught by the bulk salvage buttons.
- **Gear is the only progression.** There are no character levels or experience. Every piece has one fixed main stat
  for its type and level (weapons damage, armour armor, rings and amulets life) plus random affixes: 1-2 on Magic,
  3-4 on Rare, 4 on Legendary. Skill ranks come from "+ to skills" affixes.
- **Loot.** Ten gear slots, five rarities, 30 affixes, 30 legendary aspects and 12 uniques. Item level follows
  monster level up to 50, and drops lean towards the slots where your gear has fallen behind. Tooltips compare against what
  you are wearing. The bag holds 24; when it is full, new drops are salvaged on the spot.
- **Stash.** Sixteen slots under the bag for gear you are keeping to craft with. Nothing in it is ever salvaged,
  so it is where you park pieces between trips to the crafting bench.
- **Greater affixes.** Any affix has a small chance to crit when it is rolled, on a drop or at the cube or forge,
  and come out Greater: half again as strong, marked with a gold star. The chance rises in Torment. It applies to
  drops, forge enchants and Tempering Orbs; Kindling and Slag rolls never crit.
- **The crafting bench.** The cube and the forge share one page and work on whichever piece you last clicked.
- **The forge.** Masterwork, enchant (the Reroll button beside an affix), imprint and salvage. Rerolling costs a
  little more each time on the same piece and levels off at five times the first price.
- **Masterworking.** 25 ranks, each +1% to everything on the piece. A strike at the forge adds 1 to 3 ranks. At
  rank 25, one more strike masterworks a single random affix (+25%, or +1 on a skills affix); striking again moves
  the masterwork to a different affix. Saves from the old system convert each upgrade to five ranks.
- **Legendary aspects.** Salvaging a Legendary teaches its aspect to the Codex. To put one on gear, open a Rare or
  Legendary piece on the bench and use Imprint, or click the aspect in the Codex and then the piece. A Rare
  becomes Legendary.
- **Commission.** Its own page: pay gold for a random piece in a slot you choose, at the area's level.
- **The flask.** Restores 35% of your Life and refills over 22 seconds. Drink it with Q. By default it also drinks
  itself below 35% Life, so Auto can run unattended; Settings turns that off.
- **The cube.** Put in a piece of gear and an orb, press Transmute, take what you get. Kindling Orbs add a random
  affix (up to four, lifting Common to Magic to Rare on the way), Quenching Orbs remove one at random, Slag Orbs
  reroll them all, Tempering Orbs reroll the numbers. Kindling and Quenching can be aimed at a type (Offence,
  Defence, Utility or Skills); the affix within the type is still random. Legendaries and Uniques cannot
  be cubed, except that Tempering rerolls their numbers; the forge can still enchant one affix on a Legendary. Kindling and Quenching Orbs are everyday materials: ordinary monsters drop them (5% a kill), and every elite and boss carries some. Slag and Tempering Orbs come from elites, bosses, chests and full clears.
- **Skills.** Three disciplines: Hammer (physical, stuns), Ember (burns), Storm (lightning, crits). Every skill is
  available from the start: pick five for the bar and three passives. The smith picks the best Core skill for each
  moment.
- **Damage meter.** The arena shows measured DPS for the current fight, the average over the last ten, and which
  skills, burns and procs it came from.
- **Auto.** Explores, fights, moves to the next area, and falls back to gather strength if it keeps dying.

## Which affixes roll where

Slots have different pools, on Diablo's pattern. Shields and lanterns count as different slots.

| Slot | Offence | Defence | Utility | Skills |
| --- | --- | --- | --- | --- |
| Weapon | Damage, Physical, Fire, Lightning, Burn/Bleed, Crit chance, Crit damage, Attack speed, Elites | Life, Life on hit, Life per second | | |
| Shield | Thorns, Damage, Elites | Life, Armor, % Armor, Damage reduction, Barrier | Cooldown, Flask healing, Gold find | |
| Lantern | Damage, Physical, Fire, Lightning, Crit chance, Elites | | Cooldown, Heat, Magic find, Orb find | |
| Helm | Thorns, Elites, Burn/Bleed | Life, Armor, Life per second, Barrier | Cooldown, Magic find, Orb find | yes |
| Chest | Thorns, Elites, Burn/Bleed | Life, % Life, Armor, Damage reduction, Life per second, Barrier | Flask healing, Heat, Gold find | |
| Gloves | Crit chance, Crit damage, Attack speed, Vulnerable | Life, Armor, Life on hit | Heat, Gold find, Orb find | yes |
| Pants | Thorns, Elites, Burn/Bleed | Life, Armor, Dodge, Damage reduction, Life per second, Barrier | Flask healing, Gold find, Magic find | |
| Boots | | Life, Armor, Dodge | Movement speed, Gold find, Magic find, Orb find | |
| Amulet | Damage, Physical, Fire, Lightning, Burn/Bleed, Crit chance, Crit damage, Attack speed | % Life, % Armor, Dodge, Barrier | Cooldown, Heat, Gold find, Magic find, Orb find | yes |
| Ring | Damage, Physical, Fire, Lightning, Burn/Bleed, Crit chance, Crit damage, Attack speed, Vulnerable | Life, Life on hit, Life per second | Heat, Magic find, Orb find | |

A slot does not have every type, but any type it has offers at least three affixes. Walking from one room to the
next takes three seconds; Movement Speed (boots only) shortens it. A room that has to be fought for is approached
as far as its doorway, fought from there, and walked into once it is won.

The reasoning is in the comment above `D.AFFIX` in `js/data.js`. Uniques ignore these pools.

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
node tests/torment.cjs 50000 2          # when each Torment tier falls, and in what gear
node tests/deaths.cjs                   # what kills the bot, and where
```

`tests/sheet.html?set=mobs` (also `gear`, `glyph`) shows the sprite sheets.

The knobs that matter most for pacing are at the top of `js/data.js` (`FLAT_G`, `MOB_HP_G`, `MOB_DMG_G`,
`TIER_HP`, `TIER_DMG`) and the `mobHp` and `mobDmg` curves in `js/hero.js`. Drop rates are in `dropsFor` in `js/game.js`.

## Art and sound

Everything is made in code: sprites are hand-drawn pixel grids in `sprites.js`, backgrounds are painted
procedurally, and sound is synthesised with Web Audio. There are no asset files.

The older idle-game prototypes are in `legacy/`.
