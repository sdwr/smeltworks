/* Smeltworks — the hero: levels, stat sheet, skill ranks, and a power rating used for comparisons. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, I = SW.items;
const H = SW.hero = {};

H.xpNeed = function (lvl) {
  // fights-per-level grows slowly; xp per on-level kill grows with the monster curve
  return Math.round(D.mobXp(lvl) * Math.min(46, (5 + lvl * 0.95) * 2.6));
};
H.paragonNeed = function (p, lvl) { return Math.round(D.mobXp(50) * 75 * Math.pow(1.11, p)); };
D.mobXp = l => 10 * Math.pow(1.085, l - 1);
D.mobHp = l => 32 * Math.pow(D.MOB_HP_G, l - 1) * (1 + Math.min(l, 50) * 0.055);
D.mobDmg = l => 12 * Math.pow(D.MOB_DMG_G, l - 1) * (1 + Math.min(l, 50) * 0.022);
D.mobGold = l => 2.2 * Math.pow(1.08, l - 1);

H.baseLife = lvl => Math.round(85 * Math.pow(1.06, lvl - 1) + 15 * lvl);
H.skillPoints = S => (S.hero.level - 1) + (S.hero.bonusPts || 0);
H.spentPoints = S => Object.values(S.hero.ranks).reduce((a, b) => a + b, 0);
H.paragonSpent = S => Object.values(S.hero.paragon).reduce((a, b) => a + b, 0);

/* numbers for a skill at an effective rank */
H.skillNums = function (sk, rank) {
  const r = Math.max(1, rank), f = 1 + D.SKILL_RANK * (r - 1);
  const o = { rank: r };
  if (sk.mult) o.mult = Math.round(sk.mult * f);
  if (sk.burn) o.burn = Math.round(sk.burn * f);
  if (sk.gen) o.gen = sk.gen;
  if (sk.val != null) o.val = sk.type === 'passive' ? Math.round(sk.val * r * 100) / 100 : sk.val + (sk.valRank || 0) * (r - 1);
  if (sk.cd) o.cd = sk.cd;
  if (sk.cost) o.cost = sk.cost;
  if (sk.dur) o.dur = sk.dur;
  return o;
};

/* Build the full combat sheet from the save state. gearOverride lets the UI ask "what if". */
H.compute = function (S, gearOverride) {
  const gear = gearOverride || S.gear, lvl = S.hero.level;
  const st = { dmg: 0, aps: 1, dmgPct: 0, physPct: 0, firePct: 0, lightPct: 0, dot: 0, crit: 5, critDmg: 50, aspd: 0, vuln: 0, elite: 0,
    life: 0, lifePct: 0, armor: 0, armorPct: 0, dodge: 0, dr: 0, loh: 0, regen: 0, thorns: 0, cdr: 0, heat: 0, gold: 0, mf: 0, xp: 0,
    skHammer: 0, skEmber: 0, skStorm: 0, skAll: 0 };
  const mods = {};
  let hasWeapon = false, nOff = 0, nDef = 0, nUtil = 0;
  for (const slot of D.SLOTS) {
    const it = gear[slot]; if (!it) continue;
    const s = I.stats(it);
    for (const k in s) { if (k === 'aps') st.aps = s.aps; else st[k] = (st[k] || 0) + s[k]; }
    if (it.slot === 'weapon') hasWeapon = true;
    const m = I.mods(it);
    for (const k in m) { if (k in st) st[k] += m[k]; else mods[k] = (mods[k] || 0) + m[k]; }
    if (it.aspect) { const c = D.ASPECT[it.aspect.id].cat; if (c === 'off') nOff++; else if (c === 'def') nDef++; else nUtil++; }
    if (it.uniq) nOff++;
  }
  if (!hasWeapon) { st.dmg = Math.round(4 * D.flat(lvl)); st.aps = 1; }
  // paragon
  for (const p of D.PARAGON) st[p.stat] += (S.hero.paragon[p.id] || 0) * p.per;
  // skills
  const ranks = {};
  for (const sk of D.SKILLS) {
    const pts = S.hero.ranks[sk.id] || 0;
    if (!pts) continue;
    ranks[sk.id] = pts + st.skAll + st['sk' + D.DISC[sk.disc].name];
  }
  const pv = id => ranks[id] ? H.skillNums(D.SKILL[id], Math.min(ranks[id], D.SKILL[id].max + 4)).val : 0;
  st.critDmg += pv('heavy');
  st.lifePct += pv('tempered'); st.armorPct += pv('tempered');
  st.crit += pv('conduct');
  const addMod = (k, v) => { if (v) mods[k] = (mods[k] || 0) + v; };
  addMod('crush', pv('crush')); addMod('burnMult', pv('kindling')); addMod('burnWeak', pv('backdraft'));
  addMod('burnCritCh', pv('combust')); addMod('aftershock', pv('aftershock')); addMod('critCdr', pv('quicken'));
  // totals & caps
  st.maxLife = Math.round((H.baseLife(lvl) + st.life) * (1 + st.lifePct / 100));
  st.armor = Math.round(st.armor * (1 + st.armorPct / 100));
  if (mods.armorThorns) st.thorns += Math.round(st.armor * mods.armorThorns / 100);
  st.crit = Math.min(75, st.crit); st.dodge = Math.min(60, st.dodge); st.dr = Math.min(50, st.dr);
  st.cdr = Math.min(60, st.cdr); st.aspd = Math.min(200, st.aspd);
  const bar = S.hero.bar.filter(id => id && ranks[id]);
  const C = { st, mods, ranks, bar, lvl, nOff, nDef, nUtil };
  C.rating = H.rating(C);
  return C;
};
H.armorDR = (armor, attackerLvl) => Math.min(0.85, armor / (armor + D.ARMOR_K * D.flat(attackerLvl)));

/* A rough offence × defence estimate. Good enough to tell an upgrade from a sidegrade. */
H.rating = function (C) {
  const st = C.st, m = C.mods;
  const els = { phys: 0, fire: 0, light: 0 }; let n = 0, burn = 0;
  for (const id of C.bar) { const sk = D.SKILL[id]; if (sk.mult) { els[sk.el] += sk.type === 'basic' ? 2 : 1; n += sk.type === 'basic' ? 2 : 1; if (sk.burn) burn++; } }
  if (!n) { els.phys = 1; n = 1; }
  const elPct = (els.phys * st.physPct + els.fire * st.firePct + els.light * st.lightPct) / n;
  const crit = Math.min(80, st.crit + (m.hotCrit || 0) * 0.5 + (m.burnCritCh || 0) * 0.5) / 100;
  let off = st.dmg * st.aps * (1 + st.aspd / 100)
    * (1 + (st.dmgPct + elPct + st.elite * 0.3 + (burn ? st.dot * 0.35 * burn / C.bar.length : 0)) / 100)
    * (1 + crit * st.critDmg / 100) * (1 + (20 + st.vuln) / 100 * 0.35)
    * (1 + st.cdr / 100 * 0.25) * (1 + st.heat / 100 * 0.25);
  let rk = 0, rn = 0;
  for (const id of C.bar) { rk += Math.min(C.ranks[id], 12); rn++; }
  off *= 1 + D.SKILL_RANK * (rn ? rk / rn - 1 : 0) * 0.8;
  off *= Math.pow(1.13, C.nOff);
  off += st.thorns * 0.6;
  const dr = H.armorDR(st.armor, C.lvl);
  let def = st.maxLife / ((1 - dr) * (1 - st.dr / 100) * (1 - st.dodge / 100));
  def += (st.regen + st.loh * st.aps * (1 + st.aspd / 100) * 1.2) * 9;
  def *= Math.pow(1.1, C.nDef);
  return { off, def, power: Math.round(Math.sqrt(off * def) * 1.2 * Math.pow(1.02, C.nUtil)) };
};
})();
