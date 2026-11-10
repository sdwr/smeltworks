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
const MAGIC_PRE = { dmgPct: 'Brutal', physPct: 'Jagged', firePct: 'Smoldering', lightPct: 'Crackling', dot: 'Festering', crit: 'Keen', critDmg: 'Savage', aspd: 'Quick',
  vuln: 'Exposing', elite: 'Slaying', life: 'Stout', lifePct: 'Hale', armor: 'Sturdy', armorPct: 'Plated', dodge: 'Nimble', dr: 'Warding', loh: 'Thirsting', regen: 'Mending',
  thorns: 'Barbed', cdr: 'Tireless', heat: 'Stoked', gold: 'Gilded', mf: 'Lucky', skHammer: "Smith's", skEmber: "Pyre's", skStorm: "Tempest's" };

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
function rollAffix(slot, have, tier) {
  const pool = Object.values(D.AFFIX).filter(a => a.slots.includes(slot) && !have.includes(a.id));
  const a = U.wpick(pool, x => x.w);
  return { k: a.id, r: U.rng(), g: tier > 0 && U.chance(0.05 + 0.03 * tier) ? 1 : 0 };
}
/* opts: slot, base, rar, minRar, mf, tier, boost, unique (id) */
I.roll = function (ilvl, o) {
  o = o || {};
  ilvl = Math.max(1, Math.round(ilvl));
  const slot = o.slot || U.wpick(D.ITEM_SLOTS, s => D.SLOT_WEIGHT[s]);
  let rar = o.rar != null ? o.rar : I.rollRarity(ilvl, o.mf, o.tier, o.boost, o.minRar);
  let base = o.base || U.pick(D.BASES_BY_SLOT[slot]);
  const it = { id: uid++, slot, base, rar, ilvl, affixes: [], aspect: null, uniq: null, up: 0, mw: [], ench: -1, enchN: 0, lock: 0, isNew: 1, br: U.rng() };
  if (rar === 4) {
    const pool = D.UNIQUES.filter(u => (o.unique ? u.id === o.unique : D.BASES[u.base].slot === slot && u.minLvl <= ilvl));
    if (!pool.length) rar = it.rar = 3;
    else {
      const u = U.pick(pool);
      it.uniq = u.id; it.base = u.base; it.slot = D.BASES[u.base].slot;
      it.affixes = u.affixes.map(k => ({ k, r: 0.35 + U.rng() * 0.65, g: (o.tier || 0) > 0 && U.chance(0.08 + 0.04 * o.tier) ? 1 : 0 }));
      it.ur = U.rng();
      it.name = u.name;
      return it;
    }
  }
  const [lo, hi] = D.RARITY[rar].affixes;
  let n = U.irand(lo, hi);
  if (rar >= 2 && ilvl >= 45) n++;                 // late rares and legendaries carry a fourth affix
  for (let i = 0; i < n; i++) it.affixes.push(rollAffix(it.slot, it.affixes.map(a => a.k), o.tier || 0));
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
I.upMult = it => 1 + 0.05 * (it.up || 0);
I.maxUp = it => it.rar >= 3 ? 8 : it.rar === 2 ? 5 : 3;
I.affixValue = function (it, a, idx) {
  const def = D.AFFIX[a.k];
  let v = U.lerp(def.lo, def.hi, a.r);
  if (def.int) return Math.floor(v) + (a.g ? 1 : 0);
  if (def.sc === 'flat') v *= D.flat(it.ilvl); else if (def.sc === 'pct') v *= D.pct(it.ilvl);
  if (a.g) v *= 1.5;
  v *= I.upMult(it);
  if (idx != null && it.mw) for (const m of it.mw) if (m === idx) v *= 1.25;
  if (def.dp) return Math.round(v * 10) / 10;
  return Math.max(1, Math.round(v));
};
I.affixText = function (it, a, idx) {
  return D.AFFIX[a.k].t.replace('{v}', U.fmt1(I.affixValue(it, a, idx)));
};
/* implicit stats from the base type */
I.implicit = function (it) {
  const b = D.BASES[it.base], out = {};
  const q = (0.92 + 0.16 * (it.br == null ? 0.5 : it.br)) * I.upMult(it) * (1 + it.rar * 0.03);
  if (b.dmg) { out.dmg = Math.max(1, Math.round(D.WEAPON_DMG * b.dmg * D.flat(it.ilvl) * q)); out.aps = b.aps; }
  if (b.armor) out.armor = Math.max(1, Math.round(D.ARMOR_BASE * b.armor * D.flat(it.ilvl) * q));
  if (b.armor && b.slot !== 'offhand') out.life = Math.max(1, Math.round(D.ARMOR_LIFE * b.armor * D.flat(it.ilvl) * q));   // armour carries the smith's life
  if (b.imp) for (const k in b.imp) out[k] = b.imp[k];
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
I.itemPower = it => it.ilvl * 10 + (it.up || 0) * 5;
I.typeLine = function (it) {
  const b = D.BASES[it.base];
  return D.RARITY[it.rar].name + ' ' + (b.slot === 'weapon' || b.slot === 'offhand' ? b.name : D.SLOT_NAME[it.slot]);
};
I.spriteKey = function (it) {
  return { spr: D.BASES[it.base].spr, pal: it.uniq ? D.UNIQUE[it.uniq].pal : D.material(it.ilvl).pal };
};

/* ------------------------------------------------------------------ forge */
I.salvageYield = function (it) {
  const up = it.up || 0;
  if (it.rar === 0) return { scrap: 1 + (it.ilvl > 20 ? 1 : 0) };
  if (it.rar === 1) return { scrap: 3 };
  if (it.rar === 2) return { scrap: 2, dust: 2 + Math.floor(up / 2) };
  if (it.rar === 3) return { dust: 4 + up, soul: 1 };
  return { dust: 4, soul: 3 };
};
I.goldScale = l => Math.pow(1.08, l - 1);
I.upgradeCost = function (it) {
  const n = it.up || 0;
  const c = { gold: Math.round(30 * I.goldScale(it.ilvl) * Math.pow(n + 1, 1.4)) };
  if (n < 2) c.scrap = 4 + n * 4; else if (n < 5) { c.scrap = 6; c.dust = 2 + (n - 2) * 2; } else { c.dust = 8 + (n - 5) * 3; c.soul = 1 + (n - 5); }
  return c;
};
I.upgrade = function (it) {
  it.up = (it.up || 0) + 1;
  if (it.up % 4 === 0 && it.affixes.length) { it.mw = it.mw || []; it.mw.push(Math.floor(U.rng() * it.affixes.length)); return it.mw[it.mw.length - 1]; }
  return -1;
};
I.enchantCost = it => ({ gold: Math.round(45 * I.goldScale(it.ilvl) * Math.pow(1.6, Math.min(8, it.enchN || 0))), dust: 2 });
I.canEnchant = (it, idx) => !it.uniq && it.affixes.length > 0 && (it.ench < 0 || it.ench === idx);
I.enchant = function (it, idx, tier) {
  const have = it.affixes.map(a => a.k);
  const na = rollAffix(it.slot, have, tier || 0);
  na.g = it.affixes[idx].g;
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
I.cubeCheck = function (it, orb) {
  const n = it.affixes.length;
  if (orb === 'divine') return n ? null : 'It has no affixes to reroll.';
  if (it.uniq) return 'Uniques are fixed. Only a Tempering Orb works on them.';
  if (orb === 'add') return n >= D.MAX_AFFIXES ? 'It already has ' + D.MAX_AFFIXES + ' affixes.' : null;
  return n ? null : 'It has no affixes.';
};
I.cube = function (it, orb, tier) {
  const res = { orb };
  if (orb === 'add') {
    const a = rollAffix(it.slot, it.affixes.map(x => x.k), tier || 0);
    it.affixes.push(a); res.idx = it.affixes.length - 1;
    const rar = Math.max(it.rar, it.affixes.length >= 3 ? 2 : 1);
    if (rar !== it.rar) { res.from = it.rar; it.rar = rar; }
  } else if (orb === 'remove') {
    const i = Math.floor(U.rng() * it.affixes.length);
    res.removed = I.affixText(it, it.affixes[i], i);
    it.affixes.splice(i, 1);
    if (it.ench === i) it.ench = -1; else if (it.ench > i) it.ench--;
    it.mw = (it.mw || []).filter(x => x !== i).map(x => (x > i ? x - 1 : x));
  } else if (orb === 'chaos') {
    const n = it.affixes.length; it.affixes = [];
    for (let i = 0; i < n; i++) it.affixes.push(rollAffix(it.slot, it.affixes.map(x => x.k), tier || 0));
    it.ench = -1;
  } else if (orb === 'divine') {
    for (const a of it.affixes) a.r = it.uniq ? 0.35 + U.rng() * 0.65 : U.rng();
  }
  if (!it.uniq && it.rar < 3) it.name = I.makeName(it);
  return res;
};
I.costText = c => Object.keys(c).map(k => U.fmt(c[k]) + ' ' + ({ gold: 'gold', scrap: 'scrap', dust: 'ember dust', soul: 'soulsteel' })[k]).join(', ');
})();
