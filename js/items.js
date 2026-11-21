/* Smeltworks — items: rolling, stat lines, naming, and everything the forge does to them. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util;
const I = SW.items = {};
let uid = 1;
I.setUid = n => { uid = Math.max(uid, n | 0); };
I.getUid = () => uid;

const RARE_PRE = ['Doom', 'Ash', 'Grim', 'Storm', 'Blood', 'Iron', 'Cinder', 'Dread', 'Hollow', 'Soot', 'Wrath', 'Ember', 'Gloom', 'Rune', 'Bitter', 'Stone', 'Night', 'Flint', 'Scorch', 'Thunder', 'Bleak', 'Molten', 'Brim', 'Havoc'];
const RARE_SUF = {
  weapon: ['Bite', 'Edge', 'Fang', 'Reaver', 'Breaker', 'Song', 'Maul', 'Cleaver', 'Spike', 'Verdict'],
  offhand: ['Ward', 'Bulwark', 'Guard', 'Beacon', 'Aegis', 'Wall', 'Glow'],
  helm: ['Crown', 'Visage', 'Casque', 'Brow', 'Mask', 'Cowl'],
  chest: ['Shell', 'Hide', 'Carapace', 'Mantle', 'Cage', 'Husk'],
  gloves: ['Grasp', 'Clutch', 'Fists', 'Grip', 'Touch', 'Knuckles'],
  pants: ['Stride', 'Legguards', 'Tassets', 'Cuisses', 'March'],
  boots: ['Tread', 'Stompers', 'Trail', 'Spurs', 'Step', 'Road'],
  amulet: ['Heart', 'Eye', 'Tear', 'Locket', 'Charm', 'Star', 'Knot'],
  ring: ['Band', 'Loop', 'Coil', 'Circle', 'Signet', 'Spiral'],
};
const MAGIC_PRE = { str: 'Mighty', wdmg: 'Honed', dmgPct: 'Brutal', physPct: 'Jagged', firePct: 'Smoldering', lightPct: 'Crackling', dot: 'Festering', crit: 'Keen', critDmg: 'Savage', aspd: 'Quick',
  vuln: 'Exposing', elite: 'Slaying', life: 'Stout', lifePct: 'Hale', armor: 'Sturdy', armorPct: 'Plated', dodge: 'Nimble', dr: 'Warding', loh: 'Thirsting', regen: 'Mending',
  thorns: 'Barbed', flask: 'Brimming', barrier: 'Shielding', move: 'Fleet', orbFind: 'Seeking', cdr: 'Tireless', heat: 'Stoked', gold: 'Gilded', mf: 'Lucky', skHammer: "Smith's", skEmber: "Pyre's", skStorm: "Tempest's" };

/* ---------------------------------------------------------------- rolling */
/* Rarity by level. The first rooms drop Common and Magic gear and nothing else; Rares come in from level 5 and
   grow to nearly half of all drops by level 45. Elites, bosses and chests (boost) lean harder towards Rare. */
I.rarityWeights = function (lvl, mf, tier, boost) {
  mf = mf || 0; tier = tier || 0; boost = boost || 1;
  const rare = lvl < 5 ? 0 : Math.min(46, (lvl - 4) * 1.15);
  const w = [
    70 * (lvl < 10 ? 1 : Math.max(0.2, 1 - lvl / 55)),
    Math.min(45, 28 + lvl * 1.7),
    rare * (1 + mf / 200) * (boost > 1 ? 1.8 : 1) + (lvl < 12 ? 0 : Math.min(8.5, 1 + lvl * 0.1) * (1 + tier * 0.6) * (1 + mf / 100) * (boost - 1) / 2),
    lvl < 18 ? 0 : (0.14 + tier * 0.15) * (1 + mf / 100) * boost,                 // Unique
  ];
  if (tier > 0) { w[0] = 0; w[1] *= 0.4; }
  return w;
};
I.rollRarity = function (lvl, mf, tier, boost, minRar) {
  const w = I.rarityWeights(lvl, mf, tier, boost);
  for (let i = 0; i < (minRar || 0); i++) w[i] = 0;
  let tot = w.reduce((a, b) => a + b, 0), r = U.rng() * tot;
  for (let i = minRar || 0; i < w.length; i++) { r -= w[i]; if (r <= 0 && w[i] > 0) return i; }
  return minRar || 0;
};
/* An affix can crit when a piece drops (or is commissioned) and come out Greater: half again as strong. Likelier in
   Torment. Greater affixes are found, never crafted: the forge's reroll and every cube recipe roll plain affixes. */
/* The chance for each affix on a drop to be Greater. None before level 20; a trickle through the later campaign;
   Torment is where they are found in earnest. */
I.greaterChance = (tier, lvl) => (tier > 0 ? 0.04 + 0.03 * tier : lvl == null || lvl >= 40 ? 0.03 : lvl >= 30 ? 0.02 : lvl >= 20 ? 0.01 : 0);
I.greaterCount = it => it.affixes.reduce((n, a) => n + (a.g ? 1 : 0), 0);
/* the affixes a slot can still gain, optionally of one type */
I.poolKey = it => (it.slot === 'offhand' ? it.base : it.slot);      // shields and lanterns roll different affixes
I.inCat = (k, cat) => D.AFFIX[k].cats.includes(cat);
/* a save may hold affixes that no longer exist (Flask Healing, Gold Find, Magic Find and Orb Find were removed):
   each is rerolled into one the slot can still take. Returns how many were replaced. */
I.fixAffixes = function (it) {
  let n = 0;
  it.affixes.forEach((a, i) => { if (D.AFFIX[a.k]) return; const have = it.affixes.filter(x => D.AFFIX[x.k]).map(x => x.k); const pool = I.affixPool(I.poolKey(it), have); if (pool.length) { it.affixes[i] = { k: U.wpick(pool, x => x.w).id, r: a.r, g: a.g }; n++; } });
  const m = it.affixes.length; it.affixes = it.affixes.filter(a => D.AFFIX[a.k]);
  if (it.affixes.length !== m) { it.mw = []; it.ench = -1; }
  return n;
};
I.affixPool = (key, have, cat) => Object.values(D.AFFIX).filter(a => a.slots.includes(key) && !have.includes(a.id) && (!cat || a.cats.includes(cat)));
/* The types the cube can be aimed at for this piece: those its slot has at least two affixes for. A narrow type that
   would offer exactly what a type before it does (Precision on gloves is all of their Offence) is left out. */
/* the type an affix counts as on this piece: its family, unless the slot does not have that type (Strength on a
   helm is a Skills affix), in which case the first of its types the slot does have */
I.catOf = function (it, k) { const A = D.AFFIX[k], cats = I.slotCats(it); return cats.includes(A.cat) ? A.cat : A.cats.find(c => cats.includes(c)) || A.cat; };
I.slotCats = function (it) {
  const key = I.poolKey(it), out = [], seen = [];
  for (const c in D.AFFIX_CAT) {
    if (c === 'off' && D.NO_OFFENCE.includes(key)) continue;      // armour has no Offence type: its Strength is a Skills affix, its Thorns a Utility one
    const ks = D.AFFIX_CAT[c].keys.filter(k => D.AFFIX[k].slots.includes(key));
    if (ks.length < 2) continue;
    const sig = ks.slice().sort().join();
    if (!seen.includes(sig)) { seen.push(sig); out.push(c); }
  }
  return out;
};
/* the tier a new affix takes on a piece of this item level (see D.TIER_PICK) */
I.rollTier = function (lvl) {
  const max = D.tierOf(lvl), opts = []; for (let t = 1; t <= max; t++) opts.push(t);
  return U.wpick(opts, t => { const d = max - t; return d < 3 ? D.TIER_PICK[d] : D.TIER_PICK[3] / (max - 3); });
};
/* the tier an affix is: its own, or the best the piece can have for a Greater affix and for gear from before tiers */
I.affixTier = (it, a) => { const max = D.tierOf(it.ilvl); return a.g || !a.ti ? max : Math.min(a.ti, D.TIER_MAX); };
function rollAffix(slot, have, tier, cat, plain, lvl) {
  const a = U.wpick(I.affixPool(slot, have, cat), x => x.w), g = !plain && U.chance(I.greaterChance(tier, lvl)) ? 1 : 0;   // plain: cube rolls never crit
  return { k: a.id, r: U.rng(), g, ti: g ? D.tierOf(lvl) : I.rollTier(lvl) };      // a Greater affix is always of the best tier
}
/* opts: slot, base, rar, minRar, mf, tier, boost, unique (id), anc, greater (at least one Greater affix) */
I.roll = function (ilvl, o) {
  o = o || {};
  ilvl = U.clamp(Math.round(ilvl), 1, D.GEAR_CAP);         // gear stops at the cap; only Ancestral gear is above it
  const slot = o.slot || U.wpick(D.ITEM_SLOTS, s => D.SLOT_WEIGHT[s]);
  let rar = o.rar != null ? U.clamp(o.rar, 0, D.RARITY.length - 1) : I.rollRarity(ilvl, o.mf, o.tier, o.boost, o.minRar);
  let base = o.base || U.pick(D.BASES_BY_SLOT[slot]);
  if (o.anc) ilvl = D.ANC_LEVEL;
  const it = { id: uid++, slot, base, rar, ilvl, anc: o.anc ? 1 : 0, affixes: [], uniq: null, up: 0, mw: [], ench: -1, enchN: 0, lock: 0, isNew: 1 };
  if (rar === 3) {
    const pool = D.UNIQUES.filter(u => (o.unique ? u.id === o.unique : D.BASES[u.base].slot === slot && u.minLvl <= ilvl));
    if (!pool.length) rar = it.rar = 2;                    // no Unique for this slot at this level: a Rare instead
    else {
      const u = U.pick(pool);
      it.uniq = u.id; it.base = u.base; it.slot = D.BASES[u.base].slot;
      it.affixes = u.affixes.map(k => ({ k, r: 0.35 + U.rng() * 0.65, g: U.chance(I.greaterChance(o.tier, ilvl) * 1.25) ? 1 : 0, ti: D.tierOf(ilvl) }));      // a Unique's affixes are always of the best tier
      it.ur = U.rng();
      it.name = u.name;
      return it;
    }
  }
  const [lo, hi] = D.RARITY[rar].affixes;
  const n = U.irand(lo, hi);
  for (let i = 0; i < n; i++) it.affixes.push(rollAffix(I.poolKey(it), it.affixes.map(a => a.k), o.tier || 0, null, false, ilvl));
  if (o.greater && it.affixes.length && !it.affixes.some(a => a.g)) { const a = U.pick(it.affixes); a.g = 1; a.ti = D.tierOf(ilvl); }
  it.name = I.makeName(it);
  return it;
};
I.makeName = function (it) {
  const base = D.BASES[it.base].name;
  if (it.uniq) return D.UNIQUE[it.uniq].name;
  if (it.rar === 2) return U.pick(RARE_PRE) + ' ' + U.pick(RARE_SUF[it.slot]);
  if (it.rar === 1 && it.affixes.length) return MAGIC_PRE[it.affixes[0].k] + ' ' + base;
  return D.material(it.ilvl).name + ' ' + base;
};

/* ------------------------------------------------------------------ stats */
I.upMult = it => 1 + D.MW_STEP * ((it.up || 0) + (it.tq || 0));        // it.up is the masterwork rank, 0 to 25; it.tq is Item Quality from transfiguring
I.maxUp = () => D.MW_MAX;
I.masterworked = (it, idx) => !!it.mw && it.mw.includes(idx);   // it.mw holds the index of the one masterworked affix
/* how much more an affix is worth on this piece's slot than on the baseline (see D.SLOT_MULT) */
I.slotMult = function (it, k) {
  const m = D.SLOT_MULT[I.poolKey(it)];
  if (!m || D.SLOT_FLAT.includes(k)) return 1;
  return m[k] || m[D.AFFIX[k].cat] || 1;
};
/* A Greater affix is always the top of its range, and then half again on top: it never rolls low. */
I.MAX_ROLL = 0.9999;
I.affixValue = function (it, a, idx) {
  const def = D.AFFIX[a.k];
  if (def.int) return Math.floor(U.lerp(def.lo, def.hi, a.g ? I.MAX_ROLL : a.r)) + (a.g ? 1 : 0) + (idx != null && I.masterworked(it, idx) ? 1 : 0);      // skill ranks have no tiers
  const band = D.tierBand(def, I.affixTier(it, a));
  let v = U.lerp(band[0], band[1], a.g ? I.MAX_ROLL : a.r);
  v *= I.slotMult(it, a.k);
  if (a.g) v *= 1.5;
  v *= I.upMult(it);
  if (idx != null && I.masterworked(it, idx)) v *= D.MW_BONUS;
  if (def.dp || def.sc !== 'flat' || v < 10) return Math.max(0.1, Math.round(v * 10) / 10);      // percentages and small amounts keep a decimal, so neighbouring tiers never read the same
  return Math.round(v);
};
/* the lowest and highest this affix can roll on this item at its tier, as "[lo–hi]". It is the ordinary range even for a Greater
   affix, so a Greater affix visibly sits above the top of it */
I.affixRange = function (it, a, idx) {
  const ti = I.affixTier(it, a), lo = I.affixValue(it, { k: a.k, r: 0, g: 0, ti }, idx), hi = I.affixValue(it, { k: a.k, r: I.MAX_ROLL, g: 0, ti }, idx);
  return '[' + U.fmt1(lo) + '–' + U.fmt1(hi) + ']';
};
I.affixText = function (it, a, idx) {
  return D.AFFIX[a.k].t.replace('{v}', U.fmt1(I.affixValue(it, a, idx)));
};
/* the main stat: fixed by base type and item level, never rolled. Forge upgrades raise it. */
I.implicit = function (it) {
  const b = D.BASES[it.base], out = {}, f = D.flat(it.ilvl) * I.upMult(it);
  if (b.dmg) { out.dmg = Math.max(1, Math.round(D.WEAPON_DMG * b.dmg * f)); out.aps = b.aps; }
  if (b.armor) out.armor = Math.max(1, Math.round(D.ARMOR_BASE * b.armor * f));
  if (b.life) out.life = Math.max(1, Math.round(D.JEWEL_LIFE * b.life * f));
  if (b.pct) out.dmgPct = Math.round(b.pct * D.pct(it.ilvl) * I.upMult(it));
  return out;
};
/* every stat the item grants, summed */
I.stats = function (it) {
  const out = I.implicit(it);
  it.affixes.forEach((a, i) => { out[a.k] = (out[a.k] || 0) + I.affixValue(it, a, i); });
  return out;
};
/* special modifiers (a Unique's power) → {key: value} */
I.mods = function (it) {
  const out = {};
  if (it.uniq) {
    const u = D.UNIQUE[it.uniq];
    for (const k in u.mods) { const [lo, hi] = u.mods[k]; const v = U.lerp(lo, hi, it.ur == null ? 0.5 : it.ur); out[k] = hi < 5 ? Math.round(v * 100) / 100 : Math.round(v); }
  }
  return out;
};
I.powerText = function (it) {
  if (it.uniq) { const m = I.mods(it); return D.UNIQUE[it.uniq].desc.replace(/\{(\w+)\}/g, (_, k) => m[k]); }
  return '';
};
I.itemPower = it => it.ilvl * 10 + ((it.up || 0) + (it.tq || 0)) * 2;
I.typeLine = function (it) {
  const b = D.BASES[it.base];
  return (it.anc ? 'Ancestral ' : '') + D.RARITY[it.rar].name + ' ' + (b.slot === 'weapon' || b.slot === 'offhand' ? b.name : D.SLOT_NAME[it.slot]);
};
I.spriteKey = function (it) {
  return { spr: D.BASES[it.base].spr, pal: it.uniq ? D.UNIQUE[it.uniq].pal : D.material(it.ilvl).pal };
};

/* ------------------------------------------------------------------ forge */
I.salvageYield = function (it) {
  const up = it.up || 0;
  if (it.rar === 0) return { dust: 1 };
  if (it.rar === 1) return { dust: 2 };
  if (it.uniq) return { dust: 12 };
  /* the exceptional pays more: three for each Greater affix, five more for an Ancestral piece */
  return { dust: 4 + Math.floor(up / 6) + 3 * I.greaterCount(it) + (it.anc ? 5 : 0) };
};
I.goldScale = D.goldScale;
/* One strike of masterworking. Below rank 25 the price follows the rank you are at; at 25 it is the price of
   masterworking an affix, and of moving that masterwork to another one. */
I.upgradeCost = function (it) {
  const n = it.up || 0;
  return { dust: n >= D.MW_MAX ? 12 : n < 8 ? 2 : n < 16 ? 4 : 6 };       // ember dust and nothing else, like the cube
};
/* null when a strike would do something, otherwise the reason it would not */
I.upgradeCheck = function (it) {
  if (it.sealed) return I.SEALED;
  if ((it.up || 0) < D.MW_MAX) return null;
  if (!it.affixes.length) return 'It has no affixes to masterwork.';
  if (it.affixes.length === 1 && I.masterworked(it, 0)) return 'Its only affix is already masterworked.';
  return null;
};
/* Returns { ranks, mw }: ranks gained (1-3, 0 at the cap) and the index of the affix masterworked, or -1. */
I.upgrade = function (it) {
  const n = it.up || 0;
  if (n < D.MW_MAX) { const g = Math.min(D.MW_MAX - n, 1 + Math.floor(U.rng() * 3)); it.up = n + g; return { ranks: g, mw: -1 }; }
  const pool = it.affixes.map((a, i) => i).filter(i => !I.masterworked(it, i));    // always a different affix from the current one
  if (!pool.length) return null;
  const i = pool[Math.floor(U.rng() * pool.length)];
  it.mw = [i];
  return { ranks: 0, mw: i };
};
/* Rerolling an affix costs more each time on the same piece, but gently: +40% of the first price per reroll, levelling off at five times it. */
I.enchantCost = it => { const n = Math.min(10, it.enchN || 0); return { gold: Math.round(45 * I.goldScale(it.ilvl) * (1 + 0.4 * n)), dust: 2 + Math.min(3, Math.floor(n / 3)) }; };
/* Uniques cannot be cubed (no adding, removing or rerolling affixes), though Temper can reroll their
   numbers and the forge can enchant one affix. */
I.fixed = it => !!it.uniq;
/* any piece with affixes, Uniques included: one affix of your choosing, and then only that one */
I.canEnchant = (it, idx) => !it.sealed && it.affixes.length > 0 && (it.ench == null || it.ench < 0 || it.ench === idx);
I.enchant = function (it, idx, tier) {
  const have = it.affixes.map(a => a.k);
  const na = rollAffix(I.poolKey(it), have, tier || 0, null, true, it.ilvl);      // plain: crafting never makes a Greater affix, so rerolling a Greater one gives it up
  it.affixes[idx] = na; it.ench = idx; it.enchN = (it.enchN || 0) + 1;
  if (it.rar === 1) it.name = I.makeName(it);
  return na;
};
I.commissionCost = lvl => Math.round(55 * I.goldScale(lvl));

/* ------------------------------------------------------------------- cube
   Each recipe changes affixes at random. Returns a reason string when the recipe cannot run. */
/* ---- transfiguring: the last step (see D.TRANSFIG) ---- */
I.SEALED = 'It has been transfigured and is sealed: nothing more can be done to it.';
/* any piece can be transfigured; Uniques and Ancestral gear roll on their own rows of the table */
I.tfKind = it => (it.uniq ? (it.anc ? 'ancUniq' : 'uniq') : it.anc ? 'ancGear' : 'gear');
I.transfigCost = it => ({ gold: Math.round(500 * I.goldScale(it.ilvl)), dust: 40 });      // gold and ember dust: nothing that only bosses drop
I.OFFER_FIRST = 'The cube has made its offer for this piece. Pick one of the three first.';
I.transfigCheck = it => (it.sealed ? I.SEALED : null);
/* Roll the table once. Returns { kind, v?, idx?, was?, open } and changes the piece. */
I.transfigure = function (it) {
  const odds = D.TRANSFIG[I.tfKind(it)];
  let kind = U.wpick(D.TRANSFIG_KINDS, k => odds[k]);
  const plain = it.affixes.map((a, i) => i).filter(i => !it.affixes[i].g);
  if (kind === 'greater' && !plain.length) kind = 'quality';                 // nothing left to make Greater
  if (kind === 'replace' && !it.affixes.length) kind = 'affix';
  // a transfigured affix can be anything the piece does not already have, whatever its slot normally rolls
  const fresh = () => { const have = it.affixes.map(a => a.k), pool = Object.values(D.AFFIX).filter(a => !have.includes(a.id)); return { k: U.wpick(pool, a => a.w).id, r: U.rng(), g: 0, t: 1, ti: I.rollTier(it.ilvl) }; };
  const res = { kind };
  if (kind === 'indes') it.indes = 1;                        // a label and nothing more
  else if (kind === 'quality') { res.v = 1 + Math.floor(U.rng() * D.TRANSFIG_QUALITY); it.tq = (it.tq || 0) + res.v; }
  else if (kind === 'affix') { it.affixes.push(fresh()); res.idx = it.affixes.length - 1; }
  else if (kind === 'greater') { res.idx = U.pick(plain); it.affixes[res.idx].g = 1; it.affixes[res.idx].ti = D.tierOf(it.ilvl); }
  else { res.idx = Math.floor(U.rng() * it.affixes.length); res.was = I.affixText(it, it.affixes[res.idx], res.idx); res.lostGreater = !!it.affixes[res.idx].g; it.affixes[res.idx] = fresh(); }
  if (!it.uniq) { const rar = Math.max(it.rar, it.affixes.length >= 3 ? 2 : it.affixes.length ? 1 : 0); if (rar !== it.rar) { it.rar = rar; it.name = I.makeName(it); } }
  res.open = U.chance(odds.open / 100);
  it.sealed = res.open ? 0 : 1;
  (it.tf = it.tf || []).push(kind);
  return res;
};
/* the affixes Temper will touch: not the Greater ones (already at their maximum), and not the one affix
   rerolled at the forge, whose number you chose to keep working on there */
I.temperable = it => it.affixes.map((a, i) => i).filter(i => !it.affixes[i].g && i !== it.ench);
/* ------------------------------------------------------------------ the cube
   You do not tell the cube what to do. You buy a transmute for a piece and it offers three things it could do to
   that piece; one of them has to be taken before another transmute can be bought for it. The offer is drawn from
   everything below that would do something to the piece as it stands.

   An option is { op, cat, pos, to }:
     add        add an affix (of type cat, or any)
     remove     remove one affix: a random one (of type cat, or any), or the first / last of them (pos)
     reroll     replace one affix with a new random one, chosen the same ways
     convert    remove a random cat affix and add a random `to` affix
     recast     replace every affix
     values     reroll the numbers inside each affix's tier (all of them, or only type cat)
     polish     reroll the numbers, and keep each old one if it was better
     perfect    one random affix gets the best number of its tier
     tiers      two random affixes rise a tier or two, one falls a tier or two
     raise      the lowest-tier affix rises one tier
     sacrifice  remove one random affix; every other affix rises one tier
     shuffle    change the order of the affixes (which decides what "first" and "last" mean)
     pass       nothing happens
   The one affix rerolled at the forge is locked: nothing here removes it, replaces it, renumbers it or moves its
   tier. Greater affixes keep their number and their tier, though they can still be removed or replaced. */
I.removable = (it, cat) => it.affixes.map((a, i) => i).filter(i => i !== it.ench && (!cat || I.inCat(it.affixes[i].k, cat)));
/* affixes whose tier the cube may move: not the locked one, not Greater (always the best tier), not skill ranks */
I.tiered = it => it.affixes.map((a, i) => i).filter(i => i !== it.ench && !it.affixes[i].g && !D.AFFIX[it.affixes[i].k].int);
I.cubeKey = o => [o.op, o.cat || '', o.pos || '', o.to || ''].join(':');
const maxTier = it => D.tierOf(it.ilvl);
/* the affixes an option could touch, for showing on the piece. `one` says a single one of them is picked at random. */
I.cubeTargets = function (it, o) {
  const pick = l => (o.pos === 'first' ? l.slice(0, 1) : o.pos === 'last' ? l.slice(-1) : l);
  switch (o.op) {
    case 'remove': case 'reroll': case 'convert': case 'sacrifice': return pick(I.removable(it, o.cat));
    case 'recast': return I.removable(it);
    case 'values': case 'polish': case 'perfect': return I.temperable(it).filter(i => !o.cat || I.inCat(it.affixes[i].k, o.cat));
    case 'tiers': { const pl = I.tierPlan(it); return pl ? I.tiered(it).filter(i => pl.ups.includes(i) || pl.downs.includes(i)) : []; }
    case 'raise': { const t = I.tiered(it).filter(i => I.affixTier(it, it.affixes[i]) < maxTier(it)); if (!t.length) return []; const lo = Math.min(...t.map(i => I.affixTier(it, it.affixes[i]))); return [t.find(i => I.affixTier(it, it.affixes[i]) === lo)]; }
    case 'shuffle': return it.affixes.map((a, i) => i);
    default: return [];
  }
};
/* Two up, one down needs two affixes with room above them and a third with room below it: on a piece whose affixes
   are all tier 1, or all at the top, there is nothing for it to do. Returns who may rise and who may fall, or null. */
I.tierPlan = function (it) {
  const max = maxTier(it), T = i => I.affixTier(it, it.affixes[i]), t = I.tiered(it);
  const ups = t.filter(i => T(i) < max), downs = t.filter(i => T(i) > 1 && ups.filter(u => u !== i).length >= 2);
  return downs.length ? { ups, downs } : null;
};
const pool = (it, cat) => I.affixPool(I.poolKey(it), it.affixes.map(a => a.k), cat);
/* would this option do anything to the piece as it stands? */
I.cubeValid = function (it, o) {
  if (it.sealed) return false;
  const n = it.affixes.length, t = I.cubeTargets(it, o), cats = I.slotCats(it);
  if (it.uniq) return ['values', 'polish', 'perfect'].includes(o.op) && t.length > 0 && (!o.cat || t.length < I.temperable(it).length) && (o.op !== 'perfect' || t.some(i => it.affixes[i].r < 0.95));      // a Unique's affixes are fixed: only their numbers move
  if (o.cat && !cats.includes(o.cat)) return false; if (o.to && !cats.includes(o.to)) return false;
  switch (o.op) {
    case 'add': return n < D.MAX_AFFIXES && pool(it, o.cat).length > 0;
    case 'remove': return t.length > 0 && (!o.pos || I.removable(it, o.cat).length > 1);          // "first" and "last" only mean something with two or more to choose from
    case 'reroll': return t.length > 0 && (!o.pos || I.removable(it, o.cat).length > 1) && pool(it).length > 0;
    case 'convert': return o.cat !== o.to && t.length > 0 && pool(it, o.to).length > 0;
    case 'recast': return t.length > 0;
    case 'values': return t.length > 0 && (!o.cat || t.length < I.temperable(it).length);       // a type that covers everything is just "all values"
    case 'polish': return t.length > 0;
    case 'perfect': return t.some(i => it.affixes[i].r < 0.95);
    case 'tiers': return n >= 3 && !!I.tierPlan(it);
    case 'raise': return t.length > 0;
    case 'sacrifice': return t.length > 0 && n >= 2 && I.tiered(it).filter(i => I.affixTier(it, it.affixes[i]) < maxTier(it)).length >= 2;
    case 'shuffle': return n >= 2;
    case 'pass': return true;
  }
  return false;
};
/* how often each kind of option turns up, shared among its valid variants. Adding is much the commonest: a piece
   with room for another affix is offered a way to add one more than nine times in ten, and two ways more often than not. */
I.CUBE_W = { add: 100, remove: 20, reroll: 20, convert: 8, recast: 7, values: 12, polish: 5, perfect: 4, tiers: 10, raise: 5, sacrifice: 4, shuffle: 3, pass: 3 };
I.cubeOptions = function (it) {
  const cats = I.slotCats(it), out = [], C = [null].concat(cats);
  for (const cat of C) { out.push({ op: 'add', cat }); out.push({ op: 'remove', cat }); out.push({ op: 'reroll', cat }); out.push({ op: 'values', cat });
    for (const pos of ['first', 'last']) { out.push({ op: 'remove', cat, pos }); out.push({ op: 'reroll', cat, pos }); }
    if (cat) for (const to of cats) out.push({ op: 'convert', cat, to }); }
  for (const op of ['recast', 'polish', 'perfect', 'tiers', 'raise', 'sacrifice', 'shuffle', 'pass']) out.push({ op });
  return out.map(o => { for (const k in o) if (o[k] == null) delete o[k]; return o; }).filter(o => I.cubeValid(it, o));
};
/* Three of them, each kind as likely as its weight says. They are of different kinds where the piece allows it,
   except adding: a piece with room is often offered two ways to add (I.CUBE_TWICE), though never three while there
   is anything else to offer. */
I.CUBE_TWICE = { add: 2 };
I.cubeOffer = function (it, n) {
  const all = I.cubeOptions(it), offer = []; n = n || D.CUBE_OFFER;
  while (offer.length < n && all.length) {
    const fresh = all.filter(o => offer.filter(x => x.op === o.op).length < (I.CUBE_TWICE[o.op] || 1)), from = fresh.length ? fresh : all, count = {};
    for (const o of from) count[o.op] = (count[o.op] || 0) + 1;
    const o = U.wpick(from, x => I.CUBE_W[x.op] / count[x.op]);
    offer.push(o); all.splice(all.indexOf(o), 1);
  }
  return offer;
};
/* The forge and the transfiguring table may change a piece while the cube's offer for it waits. An option that
   would no longer do anything (the forge has locked the affix it was aimed at, say) turns into "Leave it be" where
   it stands; a piece that has been sealed loses its offer. Returns how many were turned, or -1 when the offer is gone. */
I.offerMend = function (it) {
  if (!it.offer) return 0;
  if (it.sealed) { delete it.offer; delete it.offerFree; return -1; }
  let n = 0;
  it.offer = it.offer.map(o => (I.cubeValid(it, o) ? o : (n++, { op: 'pass' })));
  return n;
};
/* null when a transmute can be bought for this piece, or why not */
I.offerCheck = function (it) {
  if (it.sealed) return I.SEALED;
  if (it.offer) return I.OFFER_FIRST;
  return I.cubeOptions(it).some(o => o.op !== 'pass') ? null : it.uniq ? 'Every affix on this Unique is Greater or locked. There is nothing left for the cube to renumber.' : 'There is nothing the cube can do with this piece.';
};
I.offerCost = () => ({ dust: D.CUBE_COST });
/* what an option says on its card */
I.cubeLabel = function (o) {
  const T = c => (c ? D.AFFIX_CAT[c].name + ' ' : ''), which = (o.pos ? 'the ' + o.pos + ' ' : o.cat ? 'a ' : 'an ') + T(o.cat) + 'affix';
  switch (o.op) {
    case 'add': return { title: `Add ${which}`, desc: 'A random one this slot can roll, at a random tier.', fam: 'add' };
    case 'remove': return { title: `Remove ${which}`, desc: o.pos ? 'Exactly that one.' : 'One of them, at random.', fam: 'remove' };
    case 'reroll': return { title: `Reroll ${which}`, desc: (o.pos ? 'Exactly that one is' : 'One of them, at random, is') + ' replaced by a new random affix of any type.', fam: 'reroll' };
    case 'convert': return { title: `Turn ${T(o.cat)}into ${D.AFFIX_CAT[o.to].name}`, desc: `Removes a random ${T(o.cat)}affix and adds a random ${D.AFFIX_CAT[o.to].name} one.`, fam: 'reroll' };
    case 'recast': return { title: 'Reroll all affixes', desc: 'Every affix is replaced by a new random one.', fam: 'recast' };
    case 'values': return { title: o.cat ? `Reroll ${T(o.cat)}values` : 'Reroll all values', desc: 'New numbers, each inside its own tier. Greater affixes keep theirs.', fam: 'values' };
    case 'polish': return { title: 'Polish the values', desc: 'Every number is rolled again, and only kept if it is better.', fam: 'values' };
    case 'perfect': return { title: 'Perfect one value', desc: 'One random affix gets the best number of its tier.', fam: 'values' };
    case 'tiers': return { title: 'Two up, one down', desc: 'Two random affixes rise a tier or two, as far as this piece allows. Another falls a tier or two.', fam: 'tiers' };
    case 'raise': return { title: 'Raise the lowest tier', desc: 'The lowest-tier affix rises one tier.', fam: 'tiers' };
    case 'sacrifice': return { title: 'Sacrifice an affix', desc: 'One random affix is removed. Every other affix rises one tier.', fam: 'tiers' };
    case 'shuffle': return { title: 'Shuffle the order', desc: 'The affixes change places, which changes what "first" and "last" will hit.', fam: 'misc' };
    default: return { title: 'Leave it be', desc: 'Nothing happens.', fam: 'misc' };
  }
};
I.CUBE_COLOR = { add: '#ffb347', remove: '#7fd4ff', reroll: '#c98bff', recast: '#c98bff', values: '#ffe9a8', tiers: '#9be36a', misc: '#b9b2a6' };
I.CUBE_PAL = { add: 'orb_add', remove: 'orb_remove', reroll: 'orb_chaos', recast: 'orb_chaos', values: 'orb_divine', tiers: 'orb_divine', misc: 'orb_remove' };
/* carry out an option. Returns what happened: idxs (affixes changed), idx (one added), removed (text of one taken),
   from (the rarity it had, if that rose), up / down (tier moves). */
I.cubeApply = function (it, o, tier) {
  const res = { op: o.op, o, idxs: [] }, A = it.affixes, max = maxTier(it);
  const one = l => l[Math.floor(U.rng() * l.length)], tgt = I.cubeTargets(it, o);
  const rarity = () => { const rar = Math.max(it.rar, A.length >= 3 ? 2 : A.length ? 1 : 0); if (rar !== it.rar) { res.from = it.rar; it.rar = rar; } };
  const add = cat => { A.push(rollAffix(I.poolKey(it), A.map(x => x.k), tier || 0, cat, true, it.ilvl)); res.idx = A.length - 1; rarity(); };
  const removeAt = i => { res.removed = I.affixText(it, A[i], i); A.splice(i, 1); if (it.ench === i) it.ench = -1; else if (it.ench > i) it.ench--; it.mw = (it.mw || []).filter(x => x !== i).map(x => (x > i ? x - 1 : x)); };
  const replaceAt = i => { res.was = I.affixText(it, A[i], i); A[i] = rollAffix(I.poolKey(it), A.map(x => x.k), tier || 0, null, true, it.ilvl); res.idxs.push(i); };
  const move = (i, d) => { const a = A[i], t0 = I.affixTier(it, a); a.ti = U.clamp(t0 + d, 1, max); return a.ti - t0; };
  const step = () => (U.chance(0.3) ? 2 : 1);
  switch (o.op) {
    case 'add': add(o.cat); break;
    case 'remove': removeAt(one(tgt)); break;
    case 'reroll': replaceAt(one(tgt)); break;
    case 'convert': removeAt(one(tgt)); add(o.to); break;
    case 'recast': {      // every affix but the locked one, which stays where it is
      const kept = it.ench >= 0 ? A[it.ench] : null, out = []; res.idxs = tgt.slice();
      for (let i = 0; i < A.length; i++) out.push(i === it.ench ? kept : rollAffix(I.poolKey(it), out.map(x => x.k).concat(kept ? [kept.k] : []), tier || 0, null, true, it.ilvl));
      it.affixes = out; break; }
    case 'values': for (const i of tgt) { A[i].r = it.uniq ? 0.35 + U.rng() * 0.65 : U.rng(); res.idxs.push(i); } break;
    case 'polish': for (const i of tgt) { const r = it.uniq ? 0.35 + U.rng() * 0.65 : U.rng(); if (r > A[i].r) { A[i].r = r; res.idxs.push(i); } } break;
    case 'perfect': { const i = one(tgt.filter(k => A[k].r < 0.95)); A[i].r = I.MAX_ROLL; res.idxs.push(i); break; }
    case 'tiers': {
      const pl = I.tierPlan(it), dn = one(pl.downs), l = pl.ups.filter(i => i !== dn); res.up = []; res.down = [];      // all three really move
      for (let k = 0; k < 2; k++) { const i = l.splice(Math.floor(U.rng() * l.length), 1)[0]; res.idxs.push(i); res.up.push([i, move(i, step())]); }
      res.idxs.push(dn); res.down.push([dn, move(dn, -step())]);
      break; }
    case 'raise': move(tgt[0], 1); res.idxs.push(tgt[0]); res.up = [[tgt[0], 1]]; break;
    case 'sacrifice': { removeAt(one(tgt)); res.up = []; for (const i of I.tiered(it)) { const d = move(i, 1); if (d) { res.idxs.push(i); res.up.push([i, d]); } } break; }
    case 'shuffle': {
      const order = A.map((a, i) => i); let tries = 0;
      do { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(U.rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } } while (order.every((v, i) => v === i) && ++tries < 20);
      it.affixes = order.map(i => A[i]); if (it.ench >= 0) it.ench = order.indexOf(it.ench); it.mw = (it.mw || []).map(x => order.indexOf(x)); res.idxs = order.map((v, i) => i).filter(i => order[i] !== i); break; }
  }
  if (!it.uniq && (res.from != null || it.rar < 2)) it.name = I.makeName(it);      // a Rare keeps its name
  return res;
};
I.costText = c => Object.keys(c).map(k => U.fmt(c[k]) + ' ' + ({ gold: 'gold', dust: 'ember dust' })[k]).join(', ');
})();
