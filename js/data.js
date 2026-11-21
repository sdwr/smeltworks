/* Smeltworks — static game data: rarities, gear, affixes, uniques, skills, monsters, world. */
(function () {
'use strict';
const SW = globalThis.SW = globalThis.SW || {};

/* ---------------------------------------------------------------- util */
const U = SW.util = {
  rng: Math.random,
  seed(n) { let a = n >>> 0; U.rng = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  rand(a, b) { return a + U.rng() * (b - a); },
  irand(a, b) { return Math.floor(a + U.rng() * (b - a + 1)); },
  chance(p) { return U.rng() < p; },
  pick(arr) { return arr[Math.floor(U.rng() * arr.length)]; },
  wpick(arr, wf) { let tot = 0; for (const x of arr) tot += wf(x); let r = U.rng() * tot; for (const x of arr) { r -= wf(x); if (r <= 0) return x; } return arr[arr.length - 1]; },
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(U.rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  fmt(n) {
    if (!isFinite(n)) return '∞';
    const neg = n < 0; n = Math.abs(n);
    let s;
    if (n < 1000) s = String(Math.round(n));
    else if (n < 1e4) s = Math.round(n).toLocaleString('en-US');
    else {
      const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
      let u = -1;
      while (n >= 1000 && u < units.length - 1) { n /= 1000; u++; }
      s = (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + units[u];
    }
    return neg ? '-' + s : s;
  },
  fmt1(n) { return Math.abs(n) >= 100 || Number.isInteger(n) ? U.fmt(n) : (Math.round(n * 10) / 10).toString(); },
};

/* ------------------------------------------------------------ scaling */
const D = SW.data = {};
D.FLAT_G = 1.085;      // growth of flat gear stats per item level
D.MOB_HP0 = 36; D.MOB_DMG0 = 15;      // a level 1 monster's life and damage, before its own multipliers
D.MOB_SOFT = [0.8, 0.9];               // the first monsters are softer than the curve: this share of it at level 0, the whole of it by level 12
D.MOB_HP_G = 1.08;     // monster life per level
D.MOB_DMG_G = 1.071;   // monster damage per level
/* Gear stops at item level 50. Torment monsters keep rising (levels 50 to 89), but only gently, because from there
   the player grows by Ancestral gear (item level 55, Torment only), masterworking, greater affixes and better rolls. */
D.GEAR_CAP = 50;
D.ANC_LEVEL = 55;
D.ANC_CHANCE = [0, 0.03, 0.06, 0.10, 0.15];   // chance for a Torment drop to be Ancestral, by tier
D.MOB_HP_G2 = 1.046;   // ...and past level 50
D.MOB_DMG_G2 = 1.052;
D.flat = l => Math.pow(D.FLAT_G, l - 1);
/* gold from monsters and the price of forge work: 8% a level to 50, then 3% a level, since gear no longer grows with it */
D.goldScale = l => Math.pow(1.08, Math.min(l, D.GEAR_CAP) - 1) * Math.pow(1.03, Math.max(0, l - D.GEAR_CAP));
D.pct = l => 1 + l / 70;
D.BAG_SIZE = 24;        // three rows of eight
D.STASH_SIZE = 16;      // two rows kept safe from salvage, for crafting
D.HEAT_MAX = 100;

D.RARITY = [
  { id: 'common',    name: 'Common',    color: '#b9b4aa', affixes: [0, 0] },
  { id: 'magic',     name: 'Magic',     color: '#6f9dff', affixes: [1, 2] },
  { id: 'rare',      name: 'Rare',      color: '#ffd84a', affixes: [3, 4] },
  { id: 'unique',    name: 'Unique',    color: '#e6c79a', affixes: [4, 4] },
];

D.SLOTS = ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring1', 'ring2'];
D.SLOT_NAME = { weapon: 'Weapon', offhand: 'Offhand', helm: 'Helm', chest: 'Chest', gloves: 'Gloves', pants: 'Pants', boots: 'Boots', amulet: 'Amulet', ring: 'Ring', ring1: 'Ring', ring2: 'Ring' };
D.ITEM_SLOTS = ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring'];
D.SLOT_WEIGHT = { weapon: 14, offhand: 9, helm: 10, chest: 10, gloves: 10, pants: 10, boots: 10, amulet: 7, ring: 14 };

/* base item types. Each has exactly one main stat, the same on every piece of that type at a given item level:
   weapons damage (dmg, with a fixed attack rate), armour and shields armor, jewellery life, lanterns % damage. */
D.BASES = {
  sword:   { slot: 'weapon',  name: 'Sword',   dmg: 1.00, aps: 1.30, spr: 'sword' },
  axe:     { slot: 'weapon',  name: 'Axe',     dmg: 1.20, aps: 1.10, spr: 'axe' },
  hammer:  { slot: 'weapon',  name: 'Hammer',  dmg: 1.52, aps: 0.90, spr: 'hammer' },
  shield:  { slot: 'offhand', name: 'Shield',  armor: 1.5, spr: 'shield' },
  lantern: { slot: 'offhand', name: 'Lantern', pct: 12, spr: 'lantern' },
  helm:    { slot: 'helm',    name: 'Helm',    armor: 0.7, spr: 'helm' },
  chest:   { slot: 'chest',   name: 'Plate',   armor: 1.2, spr: 'chest' },
  gloves:  { slot: 'gloves',  name: 'Gauntlets', armor: 0.5, spr: 'gloves' },
  pants:   { slot: 'pants',   name: 'Greaves', armor: 0.9, spr: 'pants' },
  boots:   { slot: 'boots',   name: 'Boots',   armor: 0.5, spr: 'boots' },
  amulet:  { slot: 'amulet',  name: 'Amulet',  life: 1.5, spr: 'amulet' },
  ring:    { slot: 'ring',    name: 'Ring',    life: 1.0, spr: 'ring' },
};
D.BASES_BY_SLOT = {};
for (const k in D.BASES) { D.BASES[k].id = k; (D.BASES_BY_SLOT[D.BASES[k].slot] = D.BASES_BY_SLOT[D.BASES[k].slot] || []).push(k); }
D.WEAPON_DMG = 8;     // weapon damage at item level 1 (× base.dmg)
D.ARMOR_BASE = 10;    // armour at item level 1 (× base.armor)
D.JEWEL_LIFE = 14;    // life on rings and amulets at item level 1 (× base.life)
D.ARMOR_K = 50;       // armour needed for 50% reduction vs a level-1 attacker

/* material tiers — name prefix for commons and the palette used for the icon */
D.MATERIALS = [
  { to: 9,    name: 'Rusted',      pal: 'rust' },
  { to: 19,   name: 'Iron',        pal: 'iron' },
  { to: 29,   name: 'Steel',       pal: 'steel' },
  { to: 39,   name: 'Darksteel',   pal: 'dark' },
  { to: 54,   name: 'Runed',       pal: 'rune' },
  { to: 9999, name: 'Starmetal',   pal: 'star' },      // Ancestral gear
];
D.material = l => D.MATERIALS.find(m => l <= m.to);

/* ------------------------------------------------------------- affix tiers
   Every affix comes in seven tiers, each a band of values that starts where the one below it ends. A piece can roll
   tiers up to the one its item level has reached: tier 1 from level 1, tier 2 from 10, then 20, 30 and 40 (one
   for each level of the campaign), tier 6 from 50 (Torment) and tier 7 at 55 (Ancestral). Inside a tier the item
   level does not matter. So the gear of each new level is a clear step above the last, and so is each roll. */
D.TIER_LVL = [1, 10, 20, 30, 40, 50, 55];
D.TIER_MAX = D.TIER_LVL.length;
D.tierOf = l => { let t = 1; for (let i = 1; i < D.TIER_LVL.length; i++) if (l >= D.TIER_LVL[i]) t = i + 1; return t; };
/* which tier a new affix rolls, by how far below the piece's best tier: 62% are the best, 26% one lower, 9% two
   lower, and the last 3% are shared among anything lower still */
D.TIER_PICK = [62, 26, 9, 3];
/* the growth of flat amounts (Life, Armor, Thorns...) from tier to tier follows the monsters: what a flat stat is
   worth at a typical item level of each tier */
D.TIER_FLAT = [4, 13, 23, 33, 43, 50, 55].map(l => Math.pow(D.FLAT_G, l - 1));
/* [lo, hi] of an affix at a tier, before slot multipliers, masterwork and the rest.
   flat: tier 1 is lo-hi at the first tier's worth, and each later tier runs from the top of the last to hi at its own
   pct (damage percentages): seven equal bands from half of lo to 1.75 times hi
   none (the rest): seven equal bands from 0.35 of lo to hi */
D.tierBand = function (def, t) {
  t = Math.max(1, Math.min(D.TIER_MAX, t));
  if (def.sc === 'flat') return [t === 1 ? def.lo * D.TIER_FLAT[0] : def.hi * D.TIER_FLAT[t - 2], def.hi * D.TIER_FLAT[t - 1]];
  const a = def.sc === 'pct' ? def.lo * 0.5 : def.lo * 0.35, b = def.sc === 'pct' ? def.hi * 1.75 : def.hi, step = (b - a) / D.TIER_MAX;
  return [a + step * (t - 1), a + step * t];
};

/* The version the game reports with its play data: the date of the last change that matters to balance. */
D.VERSION = '2026.11.21';
/* Play data (see js/telemetry.js). Sent only from the hosted game, and only once the player has said yes. */
D.TELEMETRY = { url: 'https://smeltworks-logging.sdwr.workers.dev/ingest', hosts: ['sdwr.github.io'] };

/* ------------------------------------------------------------- affixes
   sc: how the tiers are spaced (see D.tierBand): 'flat' grows like the monsters, 'pct' and 'none' in even steps.
   dp: decimals shown. w: roll weight.

   Which slot can roll what follows Diablo's logic. Offhands are split by type (shield / lantern).
   - Strength is the main stat and can roll on every slot: each point multiplies all damage by 1%. It is the one
     offensive affix body armour and boots can carry, so those slots are a real choice between hitting and surviving.
   - The big damage multipliers (crit chance, crit damage, attack speed) roll on the pieces that strike or adorn
     the hands: weapon, gloves, rings, amulet (crit chance on the lantern too). Vulnerable is gloves and rings only.
     Gloves also roll Thorns, damage to Elites and damage over time, so their Offence is not all prizes.
   - Body armour (helm, chest, pants) and shields are where life, armor and mitigation live. Their other offence is
     the lesser kind: Thorns, damage to Elites, damage over time.
   - Boots are the travel slot: Movement Speed rolls nowhere else.
   - Damage Reduction is chest, pants and shield. Dodge is pants, boots and amulet. % Total Armor is amulet and shield.
   - Cooldown Reduction is helm, amulet, rings and offhand. Heat (the resource) is gloves, rings, amulet, lantern, chest and boots.
   - Skill ranks are helm, gloves and amulet.
   - The amulet is the wildcard: something from nearly every group, but no flat life or armor.
   Uniques ignore all this. */
D.AFFIX = {
  // offence. A single damage type rolls about a fifth higher than all-damage: enough to prefer it on a one-element
  // bar, not so much that plain Damage is a wasted affix (the two add together).
  str:     { t: '+{v} Strength',                lo: 3,  hi: 7,   sc: 'none', w: 9,  note: '+1% to all damage per point, multiplying everything else', slots: ['weapon', 'shield', 'lantern', 'helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring'] },
  wdmg:    { t: '+{v}% Weapon Damage',          lo: 6,  hi: 12,  sc: 'none', w: 8,  note: 'raises the damage of the weapon itself, so it multiplies everything else', slots: ['weapon'] },
  dmgPct:  { t: '+{v}% Damage',                 lo: 6,  hi: 10,  sc: 'pct',  w: 10, slots: ['weapon', 'lantern', 'ring', 'amulet'] },
  physPct: { t: '+{v}% Physical Damage',        lo: 7,  hi: 12,  sc: 'pct',  w: 6,  slots: ['weapon', 'lantern', 'ring', 'amulet'] },
  firePct: { t: '+{v}% Fire Damage',            lo: 7,  hi: 12,  sc: 'pct',  w: 6,  slots: ['weapon', 'lantern', 'ring', 'amulet'] },
  lightPct:{ t: '+{v}% Lightning Damage',       lo: 7,  hi: 12,  sc: 'pct',  w: 6,  slots: ['weapon', 'lantern', 'ring', 'amulet'] },
  dot:     { t: '+{v}% Burn and Bleed Damage',  lo: 12, hi: 20,  sc: 'pct',  w: 6,  slots: ['weapon', 'gloves', 'ring', 'amulet'] },
  crit:    { t: '+{v}% Critical Strike Chance', lo: 2,  hi: 4.5, sc: 'none', w: 8,  dp: 1, slots: ['weapon', 'gloves', 'lantern', 'ring', 'amulet'] },
  critDmg: { t: '+{v}% Critical Strike Damage', lo: 10, hi: 18,  sc: 'pct',  w: 8,  slots: ['weapon', 'gloves', 'ring', 'amulet'] },
  aspd:    { t: '+{v}% Attack Speed',           lo: 3,  hi: 7,   sc: 'none', w: 8,  dp: 1, slots: ['weapon', 'gloves', 'ring', 'amulet'] },
  vuln:    { t: '+{v}% Vulnerable Damage',      lo: 8,  hi: 14,  sc: 'pct',  w: 6,  slots: ['gloves', 'ring'] },
  elite:   { t: '+{v}% Damage to Elites',       lo: 10, hi: 16,  sc: 'pct',  w: 6,  slots: ['weapon', 'lantern', 'gloves'] },
  thorns:  { t: '+{v} Thorns',                  lo: 5,  hi: 9,   sc: 'flat', w: 6,  slots: ['shield', 'helm', 'chest', 'gloves', 'pants'] },
  // defence
  life:    { t: '+{v} Maximum Life',            lo: 14, hi: 22,  sc: 'flat', w: 12, slots: ['weapon', 'shield', 'helm', 'chest', 'gloves', 'pants', 'boots', 'ring'] },
  lifePct: { t: '+{v}% Maximum Life',           lo: 3,  hi: 6,   sc: 'none', w: 5,  dp: 1, slots: ['chest', 'amulet'] },
  armor:   { t: '+{v} Armor',                   lo: 4,  hi: 7,   sc: 'flat', w: 9,  slots: ['shield', 'helm', 'chest', 'gloves', 'pants', 'boots'] },
  armorPct:{ t: '+{v}% Total Armor',            lo: 4,  hi: 8,   sc: 'none', w: 5,  dp: 1, slots: ['shield', 'amulet'] },
  dodge:   { t: '+{v}% Dodge Chance',           lo: 2,  hi: 4,   sc: 'none', w: 6,  dp: 1, slots: ['pants', 'boots', 'amulet'] },
  dr:      { t: '+{v}% Damage Reduction',       lo: 2,  hi: 4,   sc: 'none', w: 5,  dp: 1, slots: ['shield', 'chest', 'pants'] },
  loh:     { t: '+{v} Life on Hit',             lo: 0.9, hi: 1.6, sc: 'flat', w: 6, slots: ['weapon', 'gloves', 'ring'] },
  regen:   { t: '+{v} Life per Second',         lo: 1.2, hi: 2.2, sc: 'flat', w: 6, slots: ['weapon', 'helm', 'chest', 'pants', 'boots', 'ring'] },
  barrier: { t: '+{v}% Barrier Strength',       lo: 8,  hi: 16,  sc: 'none', w: 4,  slots: ['shield', 'lantern', 'helm', 'chest', 'pants', 'amulet'] },
  // utility
  cdr:     { t: '+{v}% Cooldown Reduction',     lo: 3,  hi: 6,   sc: 'none', w: 6,  dp: 1, slots: ['shield', 'lantern', 'helm', 'amulet', 'ring'] },
  heat:    { t: '+{v}% Heat Generation',        lo: 5,  hi: 10,  sc: 'none', w: 6,  slots: ['lantern', 'chest', 'gloves', 'boots', 'ring', 'amulet'] },
  move:    { t: '+{v}% Movement Speed',         lo: 15, hi: 30,  sc: 'none', w: 9,  slots: ['boots'] },
  // skills
  skHammer:{ t: '+{v} to Hammer Skills',        lo: 1,  hi: 2.49, sc: 'none', w: 4, int: 1, slots: ['shield', 'helm', 'chest', 'gloves', 'pants', 'amulet'] },
  skEmber: { t: '+{v} to Ember Skills',         lo: 1,  hi: 2.49, sc: 'none', w: 4, int: 1, slots: ['shield', 'helm', 'chest', 'gloves', 'pants', 'amulet'] },
  skStorm: { t: '+{v} to Storm Skills',         lo: 1,  hi: 2.49, sc: 'none', w: 4, int: 1, slots: ['shield', 'helm', 'chest', 'gloves', 'pants', 'amulet'] },
};
/* Transfiguring: the last thing done to a piece, of any rarity. One roll on the table below, and then the piece is almost always
   sealed: no more masterworking, rerolling or cube. The chances are Diablo 4's, as measured by players
   (no Tuning Prism), per kind of item, in percent:
     indes    Indestructible. There is no durability here, so it does nothing at all: the dud, as in Diablo
     quality  Item Quality: +1 to +15% to everything on the piece, on top of its masterwork ranks
     affix    a fifth affix, which may be one its slot could never roll
     greater  one ordinary affix becomes Greater (Ancestral gear only). The one way crafting makes a Greater affix
     replace  one affix, chosen at random, is replaced by a new random one. The gamble: it can take your best
     open     the chance the piece is NOT sealed and can still be worked on, or transfigured again */
D.TRANSFIG = {
  gear:    { indes: 22, quality: 27, affix: 38, greater: 0,  replace: 13, open: 4 },      // Diablo's Legendary row: here, anything that is not a Unique
  uniq:    { indes: 18, quality: 26, affix: 44, greater: 0,  replace: 13, open: 3 },
  ancGear: { indes: 14, quality: 20, affix: 28, greater: 28, replace: 10, open: 4 },
  ancUniq: { indes: 15, quality: 22, affix: 27, greater: 25, replace: 11, open: 4 },
};
D.TRANSFIG_KINDS = ['indes', 'quality', 'affix', 'greater', 'replace'];
D.TRANSFIG_NAME = { indes: 'Indestructible', quality: 'Item Quality', affix: 'A fifth affix', greater: 'An affix made Greater', replace: 'An affix replaced' };
D.TRANSFIG_QUALITY = 15;     // the most Item Quality one transfiguration can add
/* The same affix is worth more on some slots than others. The reasoning is opportunity cost: a slot that could
   have rolled a strong offensive affix has to be paid more to carry a defensive one, or nobody would take it.
     weapon   everything x2. The weapon is the piece a build is made around: whatever it rolls, it rolls at twice
              what the same affix would be on armour (Weapon Damage, which only weapons have, included).
     gloves   Defence x1.5. They are the crit and speed slot, so life and armor there come dear.
     ring     Defence x1.25. The same argument, more gently, so that an amulet still beats a ring.
     amulet   everything x1.5. The one-of-a-kind slot.
   Body armour, boots and offhands are the baseline. Cooldown Reduction, Attack Speed, Movement Speed and skill ranks
   are the same on every slot: they are capped or counted in whole steps, and a bigger roll on one slot would just
   make that slot the only place to take them. */
D.SLOT_MULT = {
  weapon: { off: 2, def: 2, util: 2 },
  gloves: { def: 1.5 },
  ring:   { def: 1.25 },
  amulet: { off: 1.5, def: 1.5, util: 1.5 },
};
D.SLOT_FLAT = ['cdr', 'aspd', 'move', 'skHammer', 'skEmber', 'skStorm'];
/* The armour slots are not for offence. Helm, chest, pants and shield roll no damage affixes and are never offered
   the Offence type; what they have instead is Skills: Strength and ranks for each discipline. (Strength and Thorns
   still roll there, and count as Skills and Utility.) */
D.NO_OFFENCE = ['helm', 'chest', 'pants', 'shield'];
/* Affix types: what the cube's offers can be for. Four of them, after Diablo 4's tuning
   prisms (Aggressive, Protector's, Pragmatic, Adept's), and a few affixes sit in two:
     Strength             Offence and Skills
     Thorns               Offence and Utility
     Life per Second      Defence and Utility
     Barrier Strength     Defence and Utility
   Two rules shape them. No type holds only affixes a build wants: Offence carries the damage types you do not use,
   Skills carries the two disciplines you do not play, Utility carries Thorns and regen beside cooldown and Heat.
   So aiming an orb narrows the roll but never makes it safe. And the overlap is where the cleverness is: an unwanted
   Life per Second on a chest shares Defence with the life and armor you mean to keep, but in Utility it may stand
   alone, so Quench aimed at Utility takes it cleanly.
   Each affix's first type is its family (D.AFFIX[k].cat), which gives it its colour.
   A slot only offers a type it has at least two affixes for (I.slotCats). */
D.AFFIX_CAT = {
  off:   { name: 'Offence', color: '#ff8a6a', desc: 'Anything that adds damage, wanted or not.', keys: ['str', 'wdmg', 'dmgPct', 'physPct', 'firePct', 'lightPct', 'dot', 'crit', 'critDmg', 'aspd', 'vuln', 'elite', 'thorns'] },
  def:   { name: 'Defence', color: '#8fd0ff', desc: 'Life, armor and everything else that keeps you standing.', keys: ['life', 'lifePct', 'armor', 'armorPct', 'dodge', 'dr', 'loh', 'regen', 'barrier'] },
  util:  { name: 'Utility', color: '#9be36a', desc: 'Cooldowns, Heat and movement, with Thorns, regeneration and Barrier mixed in.', keys: ['cdr', 'heat', 'move', 'thorns', 'regen', 'barrier'] },
  skill: { name: 'Skills',  color: '#ffd27a', desc: 'Strength, and ranks for one of the three disciplines.', keys: ['skHammer', 'skEmber', 'skStorm', 'str'] },
};
for (const k in D.AFFIX) D.AFFIX[k].cats = [];
for (const c in D.AFFIX_CAT) for (const k of D.AFFIX_CAT[c].keys) { if (!D.AFFIX[k].cats.length) D.AFFIX[k].cat = c; D.AFFIX[k].cats.push(c); }
for (const k in D.AFFIX) D.AFFIX[k].id = k;
/* labels for the stat sheet */
D.STAT_LABEL = { str: 'Strength', wdmg: 'Weapon damage', dmgPct: 'Damage', physPct: 'Physical', firePct: 'Fire', lightPct: 'Lightning', dot: 'Burn/Bleed', crit: 'Crit chance', critDmg: 'Crit damage',
  aspd: 'Attack speed', vuln: 'Vulnerable', elite: 'vs Elites', life: 'Life', armor: 'Armor', dodge: 'Dodge', dr: 'Dmg reduction', loh: 'Life on hit',
  regen: 'Life / sec', thorns: 'Thorns', flask: 'Flask healing', barrier: 'Barrier strength', move: 'Movement speed', orbFind: 'Orb find', cdr: 'Cooldown red.', heat: 'Heat gen', gold: 'Gold find', mf: 'Magic find' };

/* ------------------------------------------------------------- uniques */
D.UNIQUES = [
  { id: 'slagbrand', name: 'Slagbrand', base: 'sword', minLvl: 18, affixes: ['firePct', 'dot', 'crit', 'aspd'], pal: 'u_fire',
    mods: { burnCrit: [1, 1], burnMult: [40, 80] }, desc: 'Your Burn can critically strike and deals +{burnMult}% damage.',
    flavor: 'Quenched once, in the wrong river.' },
  { id: 'worldbreaker', name: 'Worldbreaker', base: 'hammer', minLvl: 22, affixes: ['physPct', 'critDmg', 'vuln', 'elite'], pal: 'u_stone',
    mods: { coreStun: [1, 1], stunDmg: [60, 120] }, desc: 'Hammer Core skills Stun for 1 second. Deal +{stunDmg}% damage to Stunned enemies.',
    flavor: 'The anvil it was forged on did not survive.' },
  { id: 'stormgrasp', name: 'Stormgrasp', base: 'gloves', minLvl: 20, affixes: ['lightPct', 'crit', 'aspd', 'skStorm'], pal: 'u_storm',
    mods: { chainGrow: [8, 16] }, desc: 'Chain Lightning arcs 3 more times and each arc deals {chainGrow}% more damage instead of less.',
    flavor: 'Hold it up in a storm. Go on.' },
  { id: 'anvilheart', name: 'Anvilheart', base: 'chest', minLvl: 20, affixes: ['life', 'armor', 'dr', 'thorns'], pal: 'u_stone',
    mods: { barrierPower: [50, 100], barrierDmg: [25, 25] }, desc: 'Your Barriers are {barrierPower}% stronger. While you have a Barrier, deal +25% damage.',
    flavor: 'It rings when struck. So does whoever struck it.' },
  { id: 'bellows', name: 'The Last Bellows', base: 'lantern', minLvl: 24, affixes: ['dmgPct', 'cdr', 'heat', 'firePct'], pal: 'u_fire',
    mods: { buffDur: [50, 100], buffHeat: [25, 25] }, desc: 'Your buff skills last {buffDur}% longer and grant 25 Heat when used.',
    flavor: 'One breath left in it. It never runs out.' },
  { id: 'quench', name: 'Quenchwater Loop', base: 'ring', minLvl: 18, affixes: ['dmgPct', 'heat', 'critDmg', 'life'], pal: 'u_storm',
    mods: { heatRefund: [20, 35] }, desc: 'Core skills have a {heatRefund}% chance to cost no Heat.',
    flavor: 'Always cool to the touch.' },
  { id: 'emberwake', name: 'Emberwake Treads', base: 'boots', minLvl: 20, affixes: ['move', 'dodge', 'life', 'firePct'], pal: 'u_fire',
    mods: { burnHaste: [6, 12] }, desc: 'Gain +{burnHaste}% Attack Speed for each Burning enemy.',
    flavor: 'The footprints are still warm.' },
  { id: 'crown', name: 'Crown of the First Smith', base: 'helm', minLvl: 26, affixes: ['life', 'cdr', 'crit', 'armor'], pal: 'u_gold',
    mods: { skAll: [2, 2], ultCdr: [15, 30] }, desc: '+2 to all skills. Your Ultimate recharges {ultCdr}% faster.',
    flavor: 'Heavy. It was meant to be.' },
  { id: 'doombell', name: 'Doombell', base: 'amulet', minLvl: 24, affixes: ['dmgPct', 'critDmg', 'cdr', 'lifePct'], pal: 'u_gold',
    mods: { doom: [150, 300] }, desc: 'Every 8 seconds, your next skill deals +{doom}% damage.',
    flavor: 'It tolls once. That is usually enough.' },
  { id: 'colossus', name: 'Greaves of the Colossus', base: 'pants', minLvl: 20, affixes: ['armor', 'lifePct', 'thorns', 'dr'], pal: 'u_stone',
    mods: { armorThorns: [20, 40] }, desc: 'Gain Thorns equal to {armorThorns}% of your Armor.',
    flavor: 'Stand still. Let them come.' },
  { id: 'emberking', name: 'Ring of the Ember King', base: 'ring', minLvl: 22, affixes: ['firePct', 'dot', 'crit', 'life'], pal: 'u_fire',
    mods: { burnSpread: [60, 100] }, desc: 'When a Burning enemy dies, its Burn leaps to every other enemy at {burnSpread}% strength.',
    flavor: 'His court burned with him. He considered that loyalty.' },
  { id: 'coil', name: 'Tempest Coil', base: 'ring', minLvl: 22, affixes: ['lightPct', 'crit', 'critDmg', 'aspd'], pal: 'u_storm',
    mods: { critUlt: [0.3, 0.6] }, desc: 'Critical strikes take {critUlt} seconds off your Ultimate cooldown.',
    flavor: 'Wound tight. Do not unwind.' },
];
D.UNIQUE = {}; D.UNIQUES.forEach(u => D.UNIQUE[u.id] = u);
/* text for the mods a unique grants that are plain stats */
D.PLAIN_STATS = { gold: 1, mf: 1, skAll: 1 };

/* -------------------------------------------------------------- skills
   Every skill is available from the start. Picking one gives rank 1; higher ranks come only from gear.
   type: basic | core | def | buff | ult | passive.  mult = % weapon damage at rank 1. */
D.DISC = {
  hammer: { name: 'Hammer', el: 'phys',  color: '#c9ccd6', blurb: 'Heavy physical blows. Stuns, Vulnerable and brutal crits.' },
  ember:  { name: 'Ember',  el: 'fire',  color: '#ff8a2a', blurb: 'Fire that lingers. Burns stack up and spread.' },
  storm:  { name: 'Storm',  el: 'light', color: '#7fd4ff', blurb: 'Fast lightning. Chains between enemies and crits often.' },
};
D.EL_NAME = { phys: 'Physical', fire: 'Fire', light: 'Lightning', poison: 'Poison', shadow: 'Shadow' };
D.EL_COLOR = { phys: '#f1ede4', fire: '#ff9a3c', light: '#8fdcff', poison: '#9be36a', shadow: '#c79bff' };
D.SKILLS = [
  /* Hammer */
  { id: 'strike', disc: 'hammer', type: 'basic', name: 'Strike', mult: 100, gen: 11, tgt: 'single',
    desc: s => `Hit an enemy for ${s.mult}% damage. Every third Strike makes the target Vulnerable for 3 seconds. Generates ${s.gen} Heat.` },
  { id: 'sunder', disc: 'hammer', type: 'core', name: 'Sunder', mult: 230, cost: 30, tgt: 'cleave',
    desc: s => `Smash an enemy for ${s.mult}% damage. The shockwave hits the others for half and makes them Bleed.` },
  { id: 'quake', disc: 'hammer', type: 'core', name: 'Earthshaker', mult: 125, cost: 35, tgt: 'all',
    desc: s => `Slam the ground: ${s.mult}% damage to all enemies and Stun them for 1 second.` },
  { id: 'ironskin', disc: 'hammer', type: 'def', name: 'Iron Skin', cd: 16, val: 30, valRank: 4,
    desc: s => `When you drop below 60% Life, gain a Barrier for ${s.val}% of your Life for 6 seconds.` },
  { id: 'meteor', disc: 'hammer', type: 'ult', name: 'Meteor Hammer', mult: 800, cd: 45, tgt: 'all',
    desc: s => `Bring the hammer down: ${s.mult}% damage to your target, 40% of that to the rest, and Stun everything for 2 seconds.` },
  { id: 'heavy', disc: 'hammer', type: 'passive', name: 'Heavy Hands', max: 3, val: 15,
    desc: s => `+${s.val}% Critical Strike Damage.` },
  { id: 'tempered', disc: 'hammer', type: 'passive', name: 'Tempered Body', max: 3, val: 6,
    desc: s => `+${s.val}% Maximum Life and Armor.` },
  { id: 'crush', disc: 'hammer', type: 'passive', name: 'Crushing Blows', max: 3, val: 10,
    desc: s => `Deal +${s.val}% damage to Vulnerable and Stunned enemies.` },

  /* Ember */
  { id: 'cinder', disc: 'ember', type: 'basic', name: 'Cinder Slash', mult: 80, gen: 10, tgt: 'single', burn: 60,
    desc: s => `Slash for ${s.mult}% damage and Burn the target for ${s.burn}% more over 3 seconds. Generates ${s.gen} Heat.` },
  { id: 'wave', disc: 'ember', type: 'core', name: 'Flame Wave', mult: 110, cost: 30, tgt: 'all', burn: 70,
    desc: s => `A wave of fire: ${s.mult}% damage to all enemies and Burn them for ${s.burn}% over 3 seconds.` },
  { id: 'brand', disc: 'ember', type: 'core', name: 'Searing Brand', mult: 170, cost: 30, tgt: 'single', burn: 260,
    desc: s => `Brand an enemy for ${s.mult}% damage and a heavy Burn of ${s.burn}% over 4 seconds.` },
  { id: 'forgeheart', disc: 'ember', type: 'buff', name: 'Forge Heart', cd: 20, val: 25, valRank: 5, dur: 7,
    desc: s => `Stoke yourself: +${s.val}% damage and double Heat generation for 7 seconds.` },
  { id: 'eruption', disc: 'ember', type: 'ult', name: 'Eruption', mult: 130, cd: 45, tgt: 'all', burn: 60,
    desc: s => `The ground erupts five times, each for ${s.mult}% damage to all enemies, and each leaves a Burn.` },
  { id: 'kindling', disc: 'ember', type: 'passive', name: 'Kindling', max: 3, val: 12,
    desc: s => `Your Burn deals +${s.val}% damage.` },
  { id: 'backdraft', disc: 'ember', type: 'passive', name: 'Backdraft', max: 3, val: 6,
    desc: s => `Burning enemies deal ${s.val}% less damage.` },
  { id: 'combust', disc: 'ember', type: 'passive', name: 'Combustion', max: 3, val: 8,
    desc: s => `+${s.val}% Critical Strike Chance against Burning enemies.` },

  /* Storm */
  { id: 'jab', disc: 'storm', type: 'basic', name: 'Spark Jab', mult: 54, gen: 6, tgt: 'single', hits: 2,
    desc: s => `Two quick jabs for ${s.mult}% damage each, with +10% Critical Strike Chance. Each generates ${s.gen} Heat.` },
  { id: 'chain', disc: 'storm', type: 'core', name: 'Chain Lightning', mult: 135, cost: 30, tgt: 'chain',
    desc: s => `Lightning strikes for ${s.mult}% damage and arcs 4 times, losing 15% each arc. With few enemies it arcs back.` },
  { id: 'lance', disc: 'storm', type: 'core', name: 'Thunder Lance', mult: 290, cost: 35, tgt: 'single',
    desc: s => `Impale an enemy for ${s.mult}% damage. Always a critical strike against Vulnerable or Stunned enemies.` },
  { id: 'overcharge', disc: 'storm', type: 'buff', name: 'Overcharge', cd: 18, val: 30, valRank: 5, dur: 6,
    desc: s => `+${s.val}% Attack Speed for 6 seconds.` },
  { id: 'tempest', disc: 'storm', type: 'ult', name: 'Tempest', mult: 110, cd: 45, tgt: 'random',
    desc: s => `Call the storm: 12 bolts strike random enemies for ${s.mult}% damage each.` },
  { id: 'conduct', disc: 'storm', type: 'passive', name: 'Conductivity', max: 3, val: 3,
    desc: s => `+${s.val}% Critical Strike Chance.` },
  { id: 'aftershock', disc: 'storm', type: 'passive', name: 'Aftershock', max: 3, val: 12,
    desc: s => `Critical strikes arc to another enemy for ${s.val}% of the damage.` },
  { id: 'quicken', disc: 'storm', type: 'passive', name: 'Quickening', max: 3, val: 0.15, dp: 2,
    desc: s => `Critical strikes take ${s.val} seconds off your cooldowns.` },
];
/* Techniques: every skill on the bar can take one of two. Each bends the skill toward a stat, so the same skill wants
   different gear depending on how it is used: Strike with Tempo wants Attack Speed, Strike with Expose wants Vulnerable
   Damage. They mostly work by making a condition happen more often (enemies Vulnerable, hits critical) and leave the
   size of the payoff to gear, which is what makes that stat worth chasing.
     stat   the affix the technique rewards, shown on its button
     rate   [key, weight]: how much the gear comparison leans toward that stat while the technique is chosen (H.rating) */
D.TECH = {
  strike: [
    { id: 'tempo',  name: 'Tempo',  stat: 'Attack Speed', rate: ['aspd', 0.4], desc: 'Strike deals +1% damage for every 1% Attack Speed you have.' },
    { id: 'expose', name: 'Expose', stat: 'Vulnerable Damage', rate: ['vulnUp', 0.4], desc: 'Every Strike makes its target Vulnerable, not just every third.' } ],
  sunder: [
    { id: 'rend',   name: 'Rend',   stat: 'Burn/Bleed Damage', rate: ['dot', 0.5], desc: "Sunder's Bleed is three times as strong and opens on the main target too." },
    { id: 'brutal', name: 'Brutal', stat: 'Critical Strike Damage', rate: ['critDmg', 0.3], desc: 'Your Critical Strike Damage bonus counts double for Sunder.' } ],
  quake: [
    { id: 'spikes',  name: 'Spiked Ground', stat: 'Thorns', rate: ['thorns', 1.2], desc: 'Earthshaker also deals 250% of your Thorns to every enemy.' },
    { id: 'shatter', name: 'Shatter', stat: 'Vulnerable Damage', rate: ['vulnUp', 0.25], desc: 'The Stun lasts twice as long, and the Stunned are Vulnerable for 3 seconds.' } ],
  ironskin: [
    { id: 'bulwark', name: 'Bulwark', stat: 'Barrier Strength', rate: ['barrier', 0.25], desc: 'Iron Skin goes up below 90% Life instead of 60%, and comes back 5 seconds sooner.' },
    { id: 'barbs',   name: 'Barbs',   stat: 'Thorns', rate: ['thorns', 0.8], desc: 'While the Barrier holds, your Thorns are tripled.' } ],
  meteor: [
    { id: 'aftermath',  name: 'Aftermath',  stat: 'Vulnerable Damage', rate: ['vulnUp', 0.15], desc: 'Everything Meteor Hammer hits is Vulnerable for 6 seconds.' },
    { id: 'relentless', name: 'Relentless', stat: 'Cooldown Reduction', rate: ['cdr', 0.3], desc: 'Your Cooldown Reduction counts double for Meteor Hammer.' } ],
  cinder: [
    { id: 'bellows',  name: 'Bellows',  stat: 'Heat Generation', rate: ['heat', 0.6], desc: 'Cinder Slash deals +2% damage for every 1% Heat Generation you have.' },
    { id: 'smoulder', name: 'Smoulder', stat: 'Burn/Bleed Damage', rate: ['dot', 0.4], desc: "Cinder Slash's Burn is twice as strong." } ],
  wave: [
    { id: 'flashfire', name: 'Flashfire', stat: 'Critical Strike Damage', rate: ['critDmg', 0.3], desc: 'Flame Wave always critically strikes enemies that are already Burning.' },
    { id: 'scorch',    name: 'Scorch',    stat: 'Vulnerable Damage', rate: ['vulnUp', 0.3], desc: 'Flame Wave leaves every enemy it hits Vulnerable for 3 seconds.' } ],
  brand: [
    { id: 'deep',     name: 'Deep Brand', stat: 'Burn/Bleed Damage', rate: ['dot', 0.5], desc: "Your Burn/Bleed Damage bonus counts double for Searing Brand's Burn." },
    { id: 'detonate', name: 'Detonate',   stat: 'Critical Strike Damage', rate: ['critDmg', 0.4], desc: "Against an enemy that is already Burning, Searing Brand's hit is doubled and always a critical strike." } ],
  forgeheart: [
    { id: 'stoked',    name: 'Stoked',     stat: 'Heat Generation', rate: ['heat', 0.4], desc: "Every Core skill you cast takes 1.5 seconds off Forge Heart's cooldown." },
    { id: 'whiteheat', name: 'White Heat', stat: 'Critical Strike Damage', rate: ['critDmg', 0.25], desc: 'While Forge Heart burns, +15% Critical Strike Chance.' } ],
  eruption: [
    { id: 'pyroclasm', name: 'Pyroclasm', stat: 'Critical Strike Damage', rate: ['critDmg', 0.2], desc: 'Eruption always critically strikes enemies that are already Burning.' },
    { id: 'magma',     name: 'Magma',     stat: 'Burn/Bleed Damage', rate: ['dot', 0.3], desc: 'The Burns Eruption leaves are three times as strong.' } ],
  jab: [
    { id: 'flurry', name: 'Flurry', stat: 'Critical Strike Chance', rate: ['crit', 0.8], desc: 'A third jab whenever one of the first two critically strikes.' },
    { id: 'static', name: 'Static', stat: 'Vulnerable Damage', rate: ['vulnUp', 0.3], desc: 'A jab that critically strikes makes its target Vulnerable for 3 seconds.' } ],
  chain: [
    { id: 'fork',  name: 'Fork',  stat: 'Critical Strike Chance', rate: ['crit', 0.8], desc: 'Each arc that critically strikes adds another arc, up to three more.' },
    { id: 'surge', name: 'Surge', stat: 'Attack Speed', rate: ['aspd', 0.3], desc: 'Chain Lightning deals +1% damage for every 1% Attack Speed you have.' } ],
  lance: [
    { id: 'skewer',   name: 'Skewer',   stat: 'Critical Strike Damage', rate: ['critDmg', 0.3], desc: 'Your Critical Strike Damage bonus counts double for Thunder Lance.' },
    { id: 'piercing', name: 'Piercing', stat: 'Vulnerable Damage', rate: ['vulnUp', 0.3], desc: 'Thunder Lance leaves its target Vulnerable for 4 seconds, and your Vulnerable Damage bonus counts triple for it.' } ],
  overcharge: [
    { id: 'capacitor', name: 'Capacitor', stat: 'Attack Speed', rate: ['aspd', 0.25], desc: 'While Overcharged, gain Critical Strike Damage equal to your Attack Speed bonus.' },
    { id: 'livewire',  name: 'Live Wire', stat: 'Critical Strike Chance', rate: ['crit', 0.6], desc: 'Each critical strike extends Overcharge by 0.3 seconds, up to 6 seconds more.' } ],
  tempest: [
    { id: 'gale',        name: 'Gale',        stat: 'Attack Speed', rate: ['aspd', 0.2], desc: 'Tempest throws one more bolt for every 8% Attack Speed you have, up to 12 more.' },
    { id: 'thunderhead', name: 'Thunderhead', stat: 'Critical Strike Chance', rate: ['crit', 0.5], desc: "Each bolt that critically strikes takes 1 second off Tempest's cooldown." } ],
};
D.SKILL = {};
D.SKILLS.forEach(s => { D.SKILL[s.id] = s; s.el = D.DISC[s.disc].el; if (!s.max) s.max = 5; });
D.SKILL_RANK = 0.12;         // each rank past the first adds 12% of the base
D.BAR_SIZE = 5;
D.PASSIVE_SLOTS = 3;
D.TYPE_NAME = { basic: 'Basic', core: 'Core', def: 'Defensive', buff: 'Buff', ult: 'Ultimate', passive: 'Passive' };

/* The cube. A bought transmute costs ember dust, and more for each one already bought for that piece: the first is
   nearly free, and the price stops climbing at the cap. Free transmutes cost nothing and do not raise it. Each
   transmute offers CUBE_OFFER options (see I.cubeOffer in items.js). */
D.CUBE_COST = { first: 2, step: 3, cap: 25 };      // 2, 5, 8, 11, 14, 17, 20, 23, then 25 from the ninth on
D.CUBE_OFFER = 3;
/* After a level's boss falls, the walk to the next level takes this many real seconds: time to see where you are going. */
D.LEAVE_TIME = 4;
/* Free transmutes. Kills fill a bar; when it is full, one worn piece that has no offer waiting gets a transmute for
   nothing. Monsters far below your gear level are worth less, and nothing at 13 levels below, so the first level
   cannot be farmed for them. */
D.XP_NEED = 30; D.XP_KILL = 1; D.XP_ELITE = 4; D.XP_BOSS = 12;
D.xpShare = (mobLvl, gearLvl) => Math.max(0, Math.min(1, 1 - (gearLvl - mobLvl - 3) / 10));
/* seconds before a new run can begin after a fall, or after walking away from a run in progress */
D.RUN_COOLDOWN = 10;
/* Ember dust from kills: an ordinary monster sometimes carries a pinch, anything bigger always does. Salvage is the
   other source (see I.salvageYield). */
D.DUST = { chance: 0.05, kill: 2, elite: 4, flee: 8, champ: 10, boss: 25, bossTorment: 5, chest: [2, 4], clear: 6 };
D.MAX_AFFIXES = 4;
/* Masterworking: 25 ranks, +1% to everything on the piece per rank, and each strike at the forge adds 1 to 3 ranks.
   At rank 25 one more strike masterworks a single affix (+25%, or +1 on a "+ to skills" affix); striking again moves it. */
D.MW_MAX = 25;
D.MW_STEP = 0.01;
D.MW_BONUS = 1.25;

/* ------------------------------------------------------------ monsters
   hp/dmg are multipliers on the level curve; int = seconds between attacks. */
const M = (id, name, spr, pal, hp, dmg, int, o) => Object.assign({ id, name, spr, pal, hp, dmg, int, el: 'phys' }, o || {});
D.MOBS = [
  // Act I — Ashen Hollow
  M('rat',      'Ash Rat',         'rat',    'ash',    0.55, 0.60, 1.25, { swarm: 1 }),
  M('wolf',     'Soot Wolf',       'wolf',   'soot',   0.90, 1.00, 1.50),
  M('bandit',   'Cinder Bandit',   'bandit', 'bandit', 1.00, 1.00, 1.70),
  M('archer',   'Bandit Archer',   'caster', 'bandit', 0.70, 1.15, 2.10, { ranged: 1 }),
  M('boar',     'Ember Boar',      'boar',   'boar',   1.50, 2.10, 3.00, { windup: 1.0 }),
  // Act II — Cinder Mines
  M('kobold',   'Kobold Digger',   'imp',    'kobold', 0.60, 0.70, 1.30, { swarm: 1 }),
  M('bat',      'Ember Bat',       'bat',    'ember',  0.60, 0.80, 1.00, { el: 'fire', dodge: 15 }),
  M('slime',    'Slag Ooze',       'slime',  'slag',   1.20, 0.90, 1.90, { split: 'slimelet', el: 'fire' }),
  M('slimelet', 'Slag Droplet',    'slime',  'slag',   0.35, 0.50, 1.40, { small: 1, noSpawn: 1, el: 'fire' }),
  M('golem',    'Slag Golem',      'golem',  'slag',   2.00, 1.90, 3.00, { windup: 1.1, armor: 20 }),
  M('shaman',   'Kobold Shaman',   'caster', 'kobold', 0.80, 0.90, 2.20, { ranged: 1, heal: 0.12 }),
  // Act III — Drowned Crypt
  M('skeleton', 'Drowned Bones',   'skeleton', 'bone', 0.90, 1.00, 1.60),
  M('skarcher', 'Bone Archer',     'skeleton', 'boneb', 0.65, 1.20, 2.00, { ranged: 1 }),
  M('ghoul',    'Crypt Ghoul',     'ghoul',  'ghoul',  1.25, 1.10, 1.50, { leech: 0.5 }),
  M('wraith',   'Tide Wraith',     'wraith', 'wraith', 0.80, 1.20, 1.70, { dodge: 30, el: 'shadow' }),
  M('necro',    'Necromancer',     'caster', 'necro',  0.90, 0.90, 2.40, { ranged: 1, summon: 'skeleton', el: 'shadow' }),
  // Act IV — Stormspire
  M('harpy',    'Gale Harpy',      'bat',    'harpy',  0.75, 0.95, 1.05, { dodge: 20 }),
  M('cultist',  'Storm Cultist',   'caster', 'storm',  0.85, 1.15, 2.00, { ranged: 1, el: 'light', slow: 1 }),
  M('gargoyle', 'Gargoyle',        'golem',  'stone',  1.90, 1.80, 2.80, { windup: 1.0, armor: 30 }),
  M('wisp',     'Spark Wisp',      'wisp',   'spark',  0.50, 0.70, 1.40, { explode: 1.6, el: 'light', swarm: 1 }),
  M('wyrmling', 'Wyrmling',        'wyrm',   'wyrm',   1.20, 0.90, 1.60, { poison: 0.5, el: 'poison' }),
  // Act V — Hellforge
  M('imp',      'Forge Imp',       'imp',    'hell',   0.60, 0.80, 1.15, { swarm: 1, el: 'fire' }),
  M('hound',    'Hellhound',       'wolf',   'hell',   1.00, 1.10, 1.25, { el: 'fire', poison: 0.3 }),
  M('brute',    'Chain Brute',     'ghoul',  'hell',   1.90, 2.00, 2.80, { windup: 1.0 }),
  M('hknight',  'Hell Knight',     'knight', 'hell',   1.50, 1.30, 1.80, { armor: 30, barrier: 0.3 }),
  M('witch',    'Ember Witch',     'caster', 'hell',   0.90, 1.20, 2.20, { ranged: 1, heal: 0.10, el: 'fire' }),
  // Anywhere
  M('goblin',   'Slag Hoarder',    'goblin', 'gold',   2.60, 0.00, 99,   { flee: 9, noSpawn: 1 }),
];
D.MOB = {}; D.MOBS.forEach(m => D.MOB[m.id] = m);

/* bosses: abilities are scripted in the combat engine */
D.BOSSES = {
  grukk:   { id: 'grukk', name: 'Grukk', title: 'the Slag Ogre', spr: 'ogre', pal: 'ogre', hp: 20, dmg: 1.6, int: 2.0, el: 'phys',
             abil: [{ t: 'slam', cd: 9, mult: 2.4, wind: 1.6, name: 'Club Slam' }, { t: 'enrage', after: 45 }] },
  foreman: { id: 'foreman', name: 'The Foreman', title: 'Warden of the Deep Works', spr: 'bgolem', pal: 'slag', hp: 25, dmg: 1.5, int: 2.2, el: 'phys', armor: 20,
             abil: [{ t: 'slam', cd: 10, mult: 2.5, wind: 1.6, name: 'Piledriver' }, { t: 'summon', at: [0.7, 0.4], mob: 'kobold', n: 3 }, { t: 'enrage', after: 50 }] },
  morvane: { id: 'morvane', name: 'Morvane', title: 'the Drowned Lich', spr: 'lich', pal: 'lich', hp: 24, dmg: 1.45, int: 1.9, el: 'shadow',
             abil: [{ t: 'summon', at: [0.8, 0.55, 0.3], mob: 'skeleton', n: 2 }, { t: 'nova', cd: 11, mult: 1.6, wind: 1.4, name: 'Grave Tide', slow: 4 }, { t: 'enrage', after: 55 }] },
  wyrm:    { id: 'wyrm', name: 'Azzurath', title: 'the Tempest Wyrm', spr: 'dragon', pal: 'storm', hp: 28, dmg: 1.4, int: 1.7, el: 'light',
             abil: [{ t: 'slam', cd: 9, mult: 2.3, wind: 1.5, name: 'Lightning Breath' }, { t: 'summon', at: [0.6, 0.3], mob: 'wisp', n: 3 }, { t: 'enrage', after: 55 }] },
  vulkar:  { id: 'vulkar', name: 'Vulkar', title: 'the Forge Tyrant', spr: 'demon', pal: 'hell', hp: 30, dmg: 1.5, int: 1.8, el: 'fire',
             abil: [{ t: 'slam', cd: 10, mult: 2.7, wind: 1.5, name: 'Worldforge Slam' }, { t: 'aura', dps: 0.13 }, { t: 'summon', at: [0.75, 0.5, 0.25], mob: 'imp', n: 3 }, { t: 'enrage', after: 60 }] },
};

/* elite modifiers */
D.ELITE = {
  molten:    { name: 'Molten',     desc: 'Pulses fire and explodes on death', color: '#ff7a2a' },
  vampiric:  { name: 'Vampiric',   desc: 'Heals when it hits you', color: '#d0354a' },
  shielded:  { name: 'Shielded',   desc: 'Raises a barrier every few seconds', color: '#8fd0ff' },
  frenzied:  { name: 'Frenzied',   desc: 'Attacks much faster', color: '#ffcf4a' },
  stoneskin: { name: 'Stoneskin',  desc: 'Takes less damage and cannot be stunned', color: '#a9a393' },
  chilling:  { name: 'Chilling',   desc: 'Its hits slow your attacks', color: '#9be3ff' },
  venomous:  { name: 'Venomous',   desc: 'Its hits poison you', color: '#9be36a' },
  hulking:   { name: 'Hulking',    desc: 'Far more life, hits harder', color: '#e0b58a' },
};
D.ELITE_IDS = Object.keys(D.ELITE);

/* --------------------------------------------------------------- world */
/* Five levels to a difficulty, one for each act, each ending in that act's boss. Inside a level the monsters climb
   a level with every room you go deeper (D.areaSpan), so a run gets harder as it goes and the gear it drops gets
   better; the next level starts a few monster levels above where the last one ended. */
D.ACTS = [
  { name: 'Ashen Hollow',  bg: 'ash',   mobs: ['rat', 'wolf', 'bandit', 'archer', 'boar'], boss: 'grukk',
    areas: [["Grukk's Hollow", 1]] },
  { name: 'Cinder Mines',  bg: 'mine',  mobs: ['kobold', 'bat', 'slime', 'golem', 'shaman'], boss: 'foreman',
    areas: [['The Deep Works', 10]] },
  { name: 'Drowned Crypt', bg: 'crypt', mobs: ['skeleton', 'skarcher', 'ghoul', 'wraith', 'necro'], boss: 'morvane',
    areas: [["Morvane's Vault", 20]] },
  { name: 'Stormspire',    bg: 'storm', mobs: ['harpy', 'cultist', 'gargoyle', 'wisp', 'wyrmling'], boss: 'wyrm',
    areas: [['The Eyrie', 30]] },
  { name: 'Hellforge',     bg: 'hell',  mobs: ['imp', 'hound', 'brute', 'hknight', 'witch'], boss: 'vulkar',
    areas: [['The Crucible', 40]] },
];
D.AREAS = [];
D.ACTS.forEach((act, ai) => act.areas.forEach((a, i) => D.AREAS.push({ idx: D.AREAS.length, act: ai, name: a[0], lvl: a[1], final: i === act.areas.length - 1 })));
D.TIERS = [
  { name: 'Normal',      short: 'N',  color: '#b9b4aa' },
  { name: 'Torment I',   short: 'T1', color: '#ff8a2a' },
  { name: 'Torment II',  short: 'T2', color: '#ff5a3a' },
  { name: 'Torment III', short: 'T3', color: '#e0354a' },
  { name: 'Torment IV',  short: 'T4', color: '#c04bff' },
];
/* Torment multiplies monster life and damage on top of their level */
D.TIER_HP = [1, 2.0, 2.3, 2.5, 2.8];
D.TIER_DMG = [1, 1.7, 1.8, 1.9, 2.0];
/* Monster level at the door of a level. Each Torment tier covers about ten monster levels: 50-61, 60-71, ... */
D.areaLevel = (area, tier) => tier === 0 ? D.AREAS[area].lvl : 50 + (tier - 1) * 10 + area * 2;
/* ...and how many levels higher its last room and its boss are. In the campaign that is one level a room, which is
   where the gear comes from; in Torment gear has stopped growing, so the climb is gentler. */
D.areaSpan = tier => (tier === 0 ? 6 : 3);
D.MAP_W = 7; D.MAP_H = 5;
D.TRAVEL_STEP = 3;      // seconds to walk from one room to the next, before Movement Speed
D.DOOR = 0.5;           // how far towards a room the smith stands while fighting for it: the doorway. The rest is walked after the win
D.SHRINES = {
  fury:  { name: 'Shrine of Fury',  desc: '+40% damage', color: '#ff5a3a' },
  stone: { name: 'Shrine of Stone', desc: '35% less damage taken', color: '#a9a393' },
  greed: { name: 'Shrine of Greed', desc: 'Triple gold, +60% Magic Find', color: '#ffd84a' },
  storm: { name: 'Shrine of Haste', desc: '+35% Attack Speed', color: '#7fd4ff' },
};
D.SHRINE_FIGHTS = 4;
/* Life is not refilled after a battle: what you end a fight with is what you start the next one with. While walking
   the smith gets a little back (this share of maximum Life a second, plus Life per Second), and the flask keeps
   refilling. A shrine, a fall, or a new map restores it all. */
D.WALK_HEAL = 0.01;
})();
