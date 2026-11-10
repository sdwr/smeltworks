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
const MAGIC_PRE = { str: 'Mighty', dmgPct: 'Brutal', physPct: 'Jagged', firePct: 'Smoldering', lightPct: 'Crackling', dot: 'Festering', crit: 'Keen', critDmg: 'Savage', aspd: 'Quick',
  vuln: 'Exposing', elite: 'Slaying', life: 'Stout', lifePct: 'Hale', armor: 'Sturdy', armorPct: 'Plated', dodge: 'Nimble', dr: 'Warding', loh: 'Thirsting', regen: 'Mending',
  thorns: 'Barbed', flask: 'Brimming', barrier: 'Shielding', move: 'Fleet', orbFind: 'Seeking', cdr: 'Tireless', heat: 'Stoked', gold: 'Gilded', mf: 'Lucky', skHammer: "Smith's", skEmber: "Pyre's", skStorm: "Tempest's" };

/* ---------------------------------------------------------------- rolling */
I.rarityWeights = function (lvl, mf, tier, boost) {
  mf = mf || 0; tier = tier || 0; boost = boost || 1;
  const w = [
    70 * (lvl < 10 ? 1 : Math.max(0.2, 1 - lvl / 55)),
    45,
    Math.min(46, 9 + lvl * 0.75) * (1 + mf / 200) * (boost > 1 ? 1.8 : 1),
    lvl < 6 ? 0 : Math.min(8.5, 1 + lvl * 0.1) * (1 + tier * 0.6) * (1 + mf / 100) * boost,
    lvl < 18 ? 0 : (0.14 + tier * 0.15) * (1 + mf / 100) * boost,
  ];
  if (tier > 0) { w[0] = 0; w[1] *= 0.4; }
  return w;
};
I.rollRarity = function (lvl, mf, tier, boost, minRar) {
  const w = I.rarityWeights(lvl, mf, tier, boost);
  for (let i = 0; i < (minRar || 0); i++) w[i] = 0;
  let tot = w.reduce((a, b) => a + b, 0), r = U.rng() * tot;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return minRar || 0;
};
/* An affix can crit when a piece drops (or is commissioned) and come out Greater: half again as strong. Likelier in
   Torment. Greater affixes are found, never crafted: the forge's reroll and every cube orb roll plain affixes. */
I.greaterChance = tier => 0.04 + 0.03 * (tier || 0);
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
I.slotCats = function (it) {
  const key = I.poolKey(it), out = [], seen = [];
  for (const c in D.AFFIX_CAT) {
    const ks = D.AFFIX_CAT[c].keys.filter(k => D.AFFIX[k].slots.includes(key));
    if (ks.length < 2) continue;
    const sig = ks.slice().sort().join();
    if (!seen.includes(sig)) { seen.push(sig); out.push(c); }
  }
  return out;
};
function rollAffix(slot, have, tier, cat, plain) {
  const a = U.wpick(I.affixPool(slot, have, cat), x => x.w);
  return { k: a.id, r: U.rng(), g: !plain && U.chance(I.greaterChance(tier)) ? 1 : 0 };   // plain: cube rolls never crit
}
/* opts: slot, base, rar, minRar, mf, tier, boost, unique (id) */
I.roll = function (ilvl, o) {
  o = o || {};
  ilvl = U.clamp(Math.round(ilvl), 1, D.GEAR_CAP);         // gear stops at the cap; only Ancestral gear is above it
  const slot = o.slot || U.wpick(D.ITEM_SLOTS, s => D.SLOT_WEIGHT[s]);
  let rar = o.rar != null ? o.rar : I.rollRarity(ilvl, o.mf, o.tier, o.boost, o.minRar);
  let base = o.base || U.pick(D.BASES_BY_SLOT[slot]);
  if (o.anc) ilvl = D.ANC_LEVEL;
  const it = { id: uid++, slot, base, rar, ilvl, anc: o.anc ? 1 : 0, affixes: [], aspect: null, uniq: null, up: 0, mw: [], ench: -1, enchN: 0, lock: 0, isNew: 1 };
  if (rar === 4) {
    const pool = D.UNIQUES.filter(u => (o.unique ? u.id === o.unique : D.BASES[u.base].slot === slot && u.minLvl <= ilvl));
    if (!pool.length) rar = it.rar = 3;
    else {
      const u = U.pick(pool);
      it.uniq = u.id; it.base = u.base; it.slot = D.BASES[u.base].slot;
      it.affixes = u.affixes.map(k => ({ k, r: 0.35 + U.rng() * 0.65, g: U.chance(I.greaterChance(o.tier) * 1.25) ? 1 : 0 }));
      it.ur = U.rng();
      it.name = u.name;
      return it;
    }
  }
  const [lo, hi] = D.RARITY[rar].affixes;
  const n = U.irand(lo, hi);
  for (let i = 0; i < n; i++) it.affixes.push(rollAffix(I.poolKey(it), it.affixes.map(a => a.k), o.tier || 0));
  if (rar === 3) {
    const pool = D.ASPECTS.filter(a => D.ASPECT_SLOTS[a.cat].includes(it.slot));
    it.aspect = { id: (o.aspect || U.pick(pool).id), r: U.rng() };
  }
  it.name = I.makeName(it);
  return it;
};
I.makeName = function (it) {
  const base = D.BASES[it.base].name;
  if (it.uniq) return D.UNIQUE[it.uniq].name;
  if (it.rar === 3 && it.aspect) { const a = D.ASPECT[it.aspect.id]; return a.name.startsWith('of ') ? base + ' ' + a.name : a.name + ' ' + base; }
  if (it.rar === 2) return U.pick(RARE_PRE) + ' ' + U.pick(RARE_SUF[it.slot]);
  if (it.rar === 1 && it.affixes.length) return MAGIC_PRE[it.affixes[0].k] + ' ' + base;
  return D.material(it.ilvl).name + ' ' + base;
};

/* ------------------------------------------------------------------ stats */
I.upMult = it => 1 + D.MW_STEP * (it.up || 0);        // it.up is the masterwork rank, 0 to 25
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
  let v = U.lerp(def.lo, def.hi, a.g ? I.MAX_ROLL : a.r);
  if (def.int) return Math.floor(v) + (a.g ? 1 : 0) + (idx != null && I.masterworked(it, idx) ? 1 : 0);
  if (def.sc === 'flat') v *= D.flat(it.ilvl); else if (def.sc === 'pct') v *= D.pct(it.ilvl);
  v *= I.slotMult(it, a.k);
  if (a.g) v *= 1.5;
  v *= I.upMult(it);
  if (idx != null && I.masterworked(it, idx)) v *= D.MW_BONUS;
  if (def.dp) return Math.round(v * 10) / 10;
  return Math.max(1, Math.round(v));
};
/* the lowest and highest this affix could have rolled on this item, as "[lo–hi]". A Greater affix has no range: it is the maximum */
I.affixRange = function (it, a, idx) {
  if (a.g) return '[max]';
  const lo = I.affixValue(it, { k: a.k, r: 0, g: a.g }, idx), hi = I.affixValue(it, { k: a.k, r: 0.9999, g: a.g }, idx);
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
/* special modifiers (aspect or unique power) → {key: value} */
I.aspectValue = function (it) {
  if (!it.aspect) return 0;
  const a = D.ASPECT[it.aspect.id];
  let v = U.lerp(a.lo, a.hi, it.aspect.r) * (it.slot === 'amulet' ? 1.5 : 1);
  return a.hi < 5 ? Math.round(v * 100) / 100 : Math.round(v);
};
I.mods = function (it) {
  const out = {};
  if (it.aspect) out[D.ASPECT[it.aspect.id].mod] = I.aspectValue(it);
  if (it.uniq) {
    const u = D.UNIQUE[it.uniq];
    for (const k in u.mods) { const [lo, hi] = u.mods[k]; const v = U.lerp(lo, hi, it.ur == null ? 0.5 : it.ur); out[k] = hi < 5 ? Math.round(v * 100) / 100 : Math.round(v); }
  }
  return out;
};
I.powerText = function (it) {
  if (it.aspect) return D.ASPECT[it.aspect.id].desc.replace('{v}', I.aspectValue(it));
  if (it.uniq) { const m = I.mods(it); return D.UNIQUE[it.uniq].desc.replace(/\{(\w+)\}/g, (_, k) => m[k]); }
  return '';
};
I.aspectRange = function (a, slot) {
  const m = slot === 'amulet' ? 1.5 : 1, f = v => a.hi < 5 ? Math.round(v * m * 100) / 100 : Math.round(v * m);
  return [f(a.lo), f(a.hi)];
};
I.itemPower = it => it.ilvl * 10 + (it.up || 0) * 2;
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
  if (it.rar === 0) return { scrap: 1 + (it.ilvl > 20 ? 1 : 0) };
  if (it.rar === 1) return { scrap: 3 };
  if (it.rar === 2) return { scrap: 2, dust: 2 + Math.floor(up / 6) };
  if (it.rar === 3) return { dust: 4 + Math.floor(up / 3), soul: 1 };
  return { dust: 4, soul: 3 };
};
I.goldScale = D.goldScale;
/* One strike of masterworking. Below rank 25 the price follows the rank you are at; at 25 it is the price of
   masterworking an affix, and of moving that masterwork to another one. */
I.upgradeCost = function (it) {
  const n = it.up || 0, gs = I.goldScale(it.ilvl);
  if (n >= D.MW_MAX) return { gold: Math.round(180 * gs), dust: 6, soul: 2 };
  const c = { gold: Math.round(14 * gs * Math.pow(1 + n / 5, 1.3)) };
  if (n < 8) c.scrap = 3; else if (n < 16) { c.scrap = 4; c.dust = 1; } else { c.dust = 3; if (n >= 20) c.soul = 1; }
  return c;
};
/* null when a strike would do something, otherwise the reason it would not */
I.upgradeCheck = function (it) {
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
/* Legendaries and Uniques cannot be cubed (no adding, removing or rerolling affixes), though a Tempering Orb can
   reroll their numbers. The forge can still enchant one affix on a Legendary; a Unique's affixes are fixed. */
I.fixed = it => !!it.uniq || it.rar >= 3;
I.canEnchant = (it, idx) => !it.uniq && it.affixes.length > 0 && (it.ench < 0 || it.ench === idx);
I.enchant = function (it, idx, tier) {
  const have = it.affixes.map(a => a.k);
  const na = rollAffix(I.poolKey(it), have, tier || 0, null, true);      // plain: crafting never makes a Greater affix, so rerolling a Greater one gives it up
  it.affixes[idx] = na; it.ench = idx; it.enchN = (it.enchN || 0) + 1;
  if (it.rar === 1) it.name = I.makeName(it);
  return na;
};
I.imprintCost = it => ({ gold: Math.round(80 * I.goldScale(it.ilvl)), dust: 4, soul: 1 });
I.canImprint = (it, aspectId) => !it.uniq && it.rar >= 2 && D.ASPECT_SLOTS[D.ASPECT[aspectId].cat].includes(it.slot);
I.imprint = function (it, aspectId, r) {
  it.aspect = { id: aspectId, r }; it.rar = 3; it.name = I.makeName(it);
};
I.commissionCost = lvl => Math.round(55 * I.goldScale(lvl));

/* ------------------------------------------------------------------- cube
   Orbs change affixes at random. Returns a reason string when the recipe cannot run. */
I.cubeCheck = function (it, orb, cat) {
  const n = it.affixes.length, C = cat && (orb === 'add' || orb === 'remove') ? D.AFFIX_CAT[cat] : null;
  if (orb === 'divine') return n ? null : 'It has no affixes to reroll.';
  if (I.fixed(it)) return it.uniq ? 'A Unique is fixed. Only a Tempering Orb works on it.' : 'A Legendary cannot be cubed. A Tempering Orb can reroll its numbers, and the forge can enchant one affix.';
  if (C && I.affixPool(I.poolKey(it), [], cat).length < 2) return `A ${D.BASES[it.base].name.toLowerCase()} cannot be aimed at ${C.name}.`;
  if (orb === 'add') {
    if (n >= D.MAX_AFFIXES) return 'It already has ' + D.MAX_AFFIXES + ' affixes.';
    if (C && !I.affixPool(I.poolKey(it), it.affixes.map(a => a.k), cat).length) return `No ${C.name} affix is left that fits a ${D.BASES[it.base].name.toLowerCase()}.`;
    return null;
  }
  if (!n) return 'It has no affixes.';
  if (orb === 'remove' && C && !it.affixes.some(a => I.inCat(a.k, cat))) return `It has no ${C.name} affix to remove.`;
  return null;
};
/* cat aims Kindling (what to add) and Quenching (what to remove) at one affix type; the roll inside it is still random */
I.cube = function (it, orb, tier, cat) {
  const res = { orb };
  if (orb === 'add') {
    const a = rollAffix(I.poolKey(it), it.affixes.map(x => x.k), tier || 0, cat, true);
    it.affixes.push(a); res.idx = it.affixes.length - 1;
    const rar = Math.max(it.rar, it.affixes.length >= 3 ? 2 : 1);
    if (rar !== it.rar) { res.from = it.rar; it.rar = rar; }
  } else if (orb === 'remove') {
    const idxs = it.affixes.map((a, k) => k).filter(k => !cat || I.inCat(it.affixes[k].k, cat));
    const i = idxs[Math.floor(U.rng() * idxs.length)];
    res.removed = I.affixText(it, it.affixes[i], i);
    it.affixes.splice(i, 1);
    if (it.ench === i) it.ench = -1; else if (it.ench > i) it.ench--;
    it.mw = (it.mw || []).filter(x => x !== i).map(x => (x > i ? x - 1 : x));
  } else if (orb === 'chaos') {
    const n = it.affixes.length; it.affixes = [];
    for (let i = 0; i < n; i++) it.affixes.push(rollAffix(I.poolKey(it), it.affixes.map(x => x.k), tier || 0, null, true));
    it.ench = -1;
  } else if (orb === 'divine') {
    for (const a of it.affixes) a.r = it.uniq ? 0.35 + U.rng() * 0.65 : U.rng();      // new numbers only: what is Greater stays Greater (and so stays at its maximum), and nothing becomes Greater
  }
  if (!it.uniq && it.rar < 3) it.name = I.makeName(it);
  return res;
};
I.costText = c => Object.keys(c).map(k => U.fmt(c[k]) + ' ' + ({ gold: 'gold', scrap: 'scrap', dust: 'ember dust', soul: 'soulsteel' })[k]).join(', ');
})();
