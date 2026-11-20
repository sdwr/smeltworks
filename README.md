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
| S F O | Skills, Crafting, Commission |
| T | Travel |

The screen is three panes. Left: Skills, Crafting and Commission. Middle: your character, bag and
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
  3-4 on Rare, 4 on a Unique. Skill ranks come from "+ to skills" affixes.
- **Loot.** Ten gear slots, four rarities (Common, Magic, Rare, Unique), 28 affixes and 12 Uniques, each with a
  power of its own. There are no Legendaries and no aspects: a Rare is made by what you do to it. Item level follows
  monster level up to 50, and drops lean towards the slots where your gear has fallen behind. Tooltips compare against what
  you are wearing. The bag holds 24; when it is full, new drops are salvaged on the spot.
- **Stash.** Sixteen slots under the bag for gear you are keeping to craft with. Nothing in it is ever salvaged,
  so it is where you park pieces between trips to the crafting bench.
- **Greater affixes.** When a piece drops or is commissioned, each affix has a small chance to crit and come out
  Greater: the maximum roll for that affix, and then half again on top, marked with a gold star. A Greater affix
  never rolls low, and its value sits above the range shown beside it. The chance rises in Torment. Greater affixes are found,
  never crafted: the forge's reroll and every cube orb roll ordinary affixes. A Tempering Orb leaves a Greater
  affix Greater, but rerolling one at the forge or melting it with a Slag Orb gives it up.
- **The crafting bench.** The cube and the forge share one page and work on whichever piece you last clicked.
- **The forge.** Masterwork, enchant (the Reroll button beside an affix), transfigure and salvage. Rerolling costs a
  little more each time on the same piece and levels off at five times the first price.
- **Masterworking.** 25 ranks, each +1% to everything on the piece. A strike at the forge adds 1 to 3 ranks. At
  rank 25, one more strike masterworks a single random affix (+25%, or +1 on a skills affix); striking again moves
  the masterwork to a different affix. Saves from the old system convert each upgrade to five ranks.
- **What a piece is worth.** The bench shows what the piece on it adds to your Damage and Toughness: your numbers
  with it worn, against the same slot left empty (a weapon against bare hands that swing as fast). Whenever you add, remove or reroll an affix, masterwork or
  transfigure, the change rises in green or sinks in red beside each number.
- **Weapon Damage.** An Offence affix that only weapons roll: +6 to 12% to the weapon's own damage at any item
  level. Every skill is a percentage of weapon damage, so it multiplies everything else, as Strength does.
- **The cube shows its aim on the piece.** With a Quenching Orb chosen, the affixes it could take are marked on the
  piece with their odds ("1 in 3"). With a Kindling Orb, the piece gains an empty line for the affix to come, and the
  cube lists what it could be.
- **Soulsteel.** From bosses, and from salvaging the exceptional: 3 for a Unique, 1 for each Greater affix on a
  piece, 1 more if it is Ancestral. A boss's first kill pays a Rare with a guaranteed Greater affix.
- **Commission.** Its own page: pay gold for a random piece in a slot you choose, at the area's level.
- **The flask.** Restores 35% of your Life and refills over 22 seconds. Drink it with Q. By default it also drinks
  itself below 35% Life, so Auto can run unattended; Settings turns that off.
- **The cube.** Put in a piece of gear and an orb, press Transmute, take what you get. Kindling Orbs add a random
  affix (up to four, lifting Common to Magic to Rare on the way), Quenching Orbs remove one at random, Slag Orbs
  reroll them all, Tempering Orbs reroll the numbers (but not on Greater affixes, nor on the affix rerolled at the forge). Kindling and Quenching can be aimed at an affix type (see
  "Cube types" below); the affix within the type is still random. Uniques cannot
  be cubed, except that Tempering rerolls their numbers; the forge can still enchant one affix on them. Kindling and Quenching Orbs are everyday materials: ordinary monsters drop them (5% a kill), and every elite and boss carries some. Slag and Tempering Orbs come from elites, bosses, chests and full clears.
- **Skills.** Three disciplines: Hammer (physical, stuns), Ember (burns), Storm (lightning, crits). Every skill is
  available from the start: pick five for the bar and three passives. The smith picks the best Core skill for each
  moment.
- **Techniques.** Every skill on the bar can take one of two techniques, chosen freely on the Skills page. Each
  bends the skill toward a stat, so the same skill wants different gear: Strike with Tempo gains 1% damage per 1%
  Attack Speed, Strike with Expose makes every hit Vulnerable and so wants Vulnerable Damage. Between them the 30
  techniques give a reason to chase Attack Speed, Critical Strike Chance, Critical Strike Damage, Vulnerable Damage,
  Burn/Bleed Damage, Thorns, Cooldown Reduction, Heat Generation and Barrier Strength. The gear comparison leans
  toward the stats your techniques reward, so the upgrade arrows follow the build.
- **Transfiguring.** The last step, on any piece of gear whatever its rarity. One roll on a table, and then the piece is almost
  always sealed for good: no more masterworking, rerolling or cube. The chances are Diablo 4's, as
  measured by players for a transfiguration without a Tuning Prism:

  | | Indestructible | Item Quality | Fifth affix | Affix made Greater | Affix replaced | Stays open |
  | --- | --- | --- | --- | --- | --- | --- |
  | Common, Magic, Rare | 22% | 27% | 38% | – | 13% | 4% |
  | Unique | 18% | 26% | 44% | – | 13% | 3% |
  | Ancestral Common, Magic, Rare | 14% | 20% | 28% | 28% | 10% | 4% |
  | Ancestral Unique | 15% | 22% | 27% | 25% | 11% | 4% |

  Item Quality is +1 to +15% to everything on the piece, on top of masterwork ranks. The fifth affix can be one the
  slot could never roll. Making an affix Greater is Ancestral only, and is the one way crafting produces a Greater
  affix. A replaced affix is chosen at random and can be your best. There is no durability in this game, so
  Indestructible does nothing: it is the dud, as in Diablo. A piece that stays open can be worked on as
  before, or transfigured again. A piece with nothing to replace gains an affix instead, and gaining affixes
  lifts its rarity as the cube does.
- **One of each Unique.** The same Unique cannot be worn twice: a second copy of a ring can only replace the first.
- **Old saves.** Legendaries become Rares and keep their affixes, masterwork ranks and rerolls; their aspects and
  the Codex are gone. Uniques are untouched.
- **Damage meter.** The arena shows measured DPS for the current fight, the average over the last ten, and which
  skills, burns and procs it came from.
- **Auto.** Explores, fights, moves to the next area, and falls back to gather strength if it keeps dying.

## Which affixes roll where

Slots have different pools, on Diablo's pattern. Shields and lanterns count as different slots.

| Slot | Offence | Defence | Utility | Skills |
| --- | --- | --- | --- | --- |
| Weapon | Strength, Weapon damage, Damage, Physical, Fire, Lightning, Burn/Bleed, Crit chance, Crit damage, Attack speed, Elites | Life, Life on hit, Life per second |  |  |
| Shield | Strength, Damage, Elites, Thorns | Life, Armor, % Armor, Damage reduction, Barrier | Cooldown |  |
| Lantern | Strength, Damage, Physical, Fire, Lightning, Crit chance, Elites | Barrier | Cooldown, Heat |  |
| Helm | Strength, Burn/Bleed, Elites, Thorns | Life, Armor, Life per second, Barrier | Cooldown | yes |
| Chest | Strength, Burn/Bleed, Elites, Thorns | Life, % Life, Armor, Damage reduction, Life per second, Barrier | Heat |  |
| Gloves | Strength, Burn/Bleed, Crit chance, Crit damage, Attack speed, Vulnerable, Elites, Thorns | Life, Armor, Life on hit | Heat | yes |
| Pants | Strength, Burn/Bleed, Elites, Thorns | Life, Armor, Dodge, Damage reduction, Life per second, Barrier |  |  |
| Boots | Strength | Life, Armor, Dodge, Life per second | Heat, Movement speed |  |
| Amulet | Strength, Damage, Physical, Fire, Lightning, Burn/Bleed, Crit chance, Crit damage, Attack speed | % Life, % Armor, Dodge, Barrier | Cooldown, Heat | yes |
| Ring | Strength, Damage, Physical, Fire, Lightning, Burn/Bleed, Crit chance, Crit damage, Attack speed, Vulnerable | Life, Life on hit, Life per second | Cooldown, Heat |  |

Each affix is listed under its family, which is also its colour in the game. Strength is the main stat: it can roll
on every slot, and each point multiplies all damage by 1%, separately from the other damage affixes. Walking from
one room to the next takes three seconds; Movement Speed (boots only) shortens it. A room that has to be fought for
is approached as far as its doorway, fought from there, and walked into once it is won.

The reasoning is in the comment above `D.AFFIX` in `js/data.js`. Uniques ignore these pools.

### Affix values by slot

The same affix is worth more on some slots than others. The idea is opportunity cost: a slot that could have
rolled a strong offensive affix has to be paid more to carry a defensive one.

| Slot | What is worth more there |
| --- | --- |
| Weapon | Defence affixes ×2, Strength ×2 |
| Gloves | Defence affixes ×1.5 |
| Ring | Defence affixes ×1.25 |
| Amulet | everything ×1.5 |

Body armour, boots and offhands are the baseline. Cooldown Reduction, Attack Speed, Movement Speed and skill ranks
are the same on every slot. The range shown beside each affix on a piece already includes its slot's multiplier,
and the cube marks boosted affixes (×1.5) in its list of what it could add.

### Cube types

Kindling and Quenching Orbs can be aimed at one of four types, after Diablo 4's tuning prisms. They are the four
families above, except that four affixes sit in two types:

| Affix | Types |
| --- | --- |
| Strength | Offence and Skills |
| Thorns | Offence and Utility |
| Life per second | Defence and Utility |
| Barrier | Defence and Utility |

So Utility is Cooldown, Heat, Movement speed, Thorns, Life per second and Barrier, and Skills is the three
disciplines plus Strength.

Two rules shape the types. No type on any slot holds only affixes a build wants, so aiming narrows a roll without
making it safe. And the overlap is where the skill is: an unwanted Life per second on a chest shares Defence with
the life and armor you mean to keep, but in Utility it may stand alone, so a Quenching Orb aimed at Utility takes
it cleanly. A piece only offers a type its slot has at least two affixes for.

## Code

Plain scripts, loaded in order by `index.html`, all hanging off one global `SW`.

| File | What it holds |
| --- | --- |
| `js/data.js` | All the content: affixes, uniques, skills, monsters, bosses, areas, tuning constants |
| `js/items.js` | Rolling items, reading their stats, forge operations |
| `js/hero.js` | The stat sheet, level curves, the power rating used for comparisons |
| `js/combat.js` | The battle engine. No DOM. Emits events for the renderer |
| `js/game.js` | Save state, map generation, drops, experience, the update loop, player actions |
| `js/sprites.js` | Every sprite, drawn as character grids and painted through palettes |
| `js/fx.js` | The arena canvas: actors, particles, damage numbers, loot beams |
| `js/audio.js` | Synthesised sound effects |
| `js/ui.js` | Everything in the DOM: map, gear, skills, forge, tooltips, dialogs |
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
