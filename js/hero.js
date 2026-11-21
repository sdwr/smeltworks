/* Smeltworks — the hero: stat sheet, skill ranks from gear, and a power rating used for comparisons. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, I = SW.items;
const H = SW.hero = {};

/* monster curves. Levels 1-12 ramp in gently so the opening fights are quick */
/* past level 50 (Torment) monsters grow faster than gear does, so the endgame keeps getting harder */
const grow = (g, g2, l) => Math.pow(g, Math.min(l, 50) - 1) * Math.pow(g2, Math.max(0, l - 50));
D.mobHp = l => D.MOB_HP0 * grow(D.MOB_HP_G, D.MOB_HP_G2, l) * (1 + Math.min(l, 50) * 0.055) * Math.min(1, D.MOB_SOFT[0] + l / 24);
D.mobDmg = l => D.MOB_DMG0 * grow(D.MOB_DMG_G, D.MOB_DMG_G2, l) * (1 + Math.min(l, 50) * 0.022) * Math.min(1, D.MOB_SOFT[1] + l / 32);
D.mobGold = l => 2.2 * D.goldScale(l);

/* There are no character levels: everything the smith is comes from what the smith wears. */
H.BASE_LIFE = 100;
H.gearLevel = function (gear) {
  let n = 0, tot = 0;
  for (const s of D.SLOTS) if (gear[s]) { n++; tot += gear[s].ilvl; }
  return n ? Math.max(1, Math.round(tot / n)) : 1;
};
H.selected = S => S.hero.bar.concat(S.hero.passives).filter(Boolean);

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
/* bareAps: how fast empty hands swing (1 a second unless told otherwise; see G.itemWorth) */
H.compute = function (S, gearOverride, bareAps) {
  const gear = gearOverride || S.gear, lvl = H.gearLevel(gear);
  const st = { dmg: 0, aps: 1, str: 0, wdmg: 0, dmgPct: 0, physPct: 0, firePct: 0, lightPct: 0, dot: 0, crit: 5, critDmg: 50, aspd: 0, vuln: 0, elite: 0,
    life: 0, lifePct: 0, armor: 0, armorPct: 0, dodge: 0, dr: 0, loh: 0, regen: 0, thorns: 0, cdr: 0, heat: 0, gold: 0, mf: 0, flask: 0, move: 0, orbFind: 0, barrier: 0,
    skHammer: 0, skEmber: 0, skStorm: 0, skAll: 0 };
  const mods = {};
  let hasWeapon = false;
  for (const slot of D.SLOTS) {
    const it = gear[slot]; if (!it) continue;
    const s = I.stats(it);
    for (const k in s) { if (k === 'aps') st.aps = s.aps; else st[k] = (st[k] || 0) + s[k]; }
    if (it.slot === 'weapon') hasWeapon = true;
    const m = I.mods(it);
    for (const k in m) { if (k in st) st[k] += m[k]; else mods[k] = (mods[k] || 0) + m[k]; }
  }
  if (!hasWeapon) { st.dmg = Math.round(4 * D.flat(lvl)); st.aps = bareAps || 1; }
  if (st.wdmg) st.dmg = Math.round(st.dmg * (1 + st.wdmg / 100));      // Weapon Damage: the weapon's own number, before anything else multiplies it
  // skills
  const ranks = {};
  for (const id of H.selected(S)) { const sk = D.SKILL[id]; ranks[id] = 1 + st.skAll + st['sk' + D.DISC[sk.disc].name]; }
  const pv = id => ranks[id] ? H.skillNums(D.SKILL[id], Math.min(ranks[id], D.SKILL[id].max + 4)).val : 0;
  st.critDmg += pv('heavy');
  st.lifePct += pv('tempered'); st.armorPct += pv('tempered');
  st.crit += pv('conduct');
  const addMod = (k, v) => { if (v) mods[k] = (mods[k] || 0) + v; };
  addMod('crush', pv('crush')); addMod('burnMult', pv('kindling')); addMod('burnWeak', pv('backdraft'));
  addMod('burnCritCh', pv('combust')); addMod('aftershock', pv('aftershock')); addMod('critCdr', pv('quicken'));
  // totals & caps
  st.maxLife = Math.round((H.BASE_LIFE + st.life) * (1 + st.lifePct / 100));
  st.armor = Math.round(st.armor * (1 + st.armorPct / 100));
  if (mods.armorThorns) st.thorns += Math.round(st.armor * mods.armorThorns / 100);
  st.crit = Math.min(75, st.crit); st.dodge = Math.min(60, st.dodge); st.dr = Math.min(50, st.dr);
  st.cdr = Math.min(60, st.cdr); st.aspd = Math.min(200, st.aspd); st.move = Math.min(100, st.move);
  const bar = S.hero.bar.filter(id => id && ranks[id]);
  // techniques: only for skills on the bar, and only ones that exist
  const tech = {}, chosen = S.hero.tech || {};
  for (const id of bar) if (D.TECH[id] && D.TECH[id].some(t => t.id === chosen[id])) tech[id] = chosen[id];
  // armor is judged against the monsters of the area you are in, so swapping one piece never moves the yardstick
  const ref = S.world ? D.areaLevel(S.world.area, S.world.tier) + 2 : lvl;
  const C = { st, mods, ranks, bar, tech, lvl, ref };
  C.rating = H.rating(C);
  return C;
};
/* armor is measured against the attacker's level, up to the gear cap: past it monsters hit harder instead of piercing more */
H.armorDR = (armor, attackerLvl) => Math.min(0.85, armor / (armor + D.ARMOR_K * D.flat(Math.min(attackerLvl, D.GEAR_CAP))));

/* A rough offence × defence estimate from the stat sheet, used for the upgrade arrow and the tooltip comparison.
   It counts stats only. Unique powers are left out on purpose: most are conditional, and a guess at
   their worth would let a Unique look like more damage than a piece that simply has more damage on it.
   Damage   = weapon damage × attacks per second × (1 + additive damage %) × (1 + Strength %) × crit × Vulnerable uptime × skill ranks,
              with small credit for cooldown reduction and Heat generation when the bar has skills that use them.
   Toughness = life ÷ (what armor, damage reduction and dodge let through), plus a few seconds of healing. */
H.RATING_SCALE = 3;
H.rating = function (C) {
  const st = C.st, m = C.mods;
  const els = { phys: 0, fire: 0, light: 0 }; let n = 0, burn = 0, cds = 0, cores = 0;
  for (const id of C.bar) {
    const sk = D.SKILL[id];
    if (sk.mult) { els[sk.el] += sk.type === 'basic' ? 2 : 1; n += sk.type === 'basic' ? 2 : 1; if (sk.burn) burn++; }
    if (sk.type === 'ult' || sk.type === 'buff') cds++;
    if (sk.type === 'core') cores++;
  }
  if (!n) { els.phys = 1; n = 1; }
  // techniques lean the estimate toward the stat they reward, so the upgrade arrow follows the build
  const lean = { aspd: 0, crit: 0, critDmg: 0, dot: 0, heat: 0, cdr: 0, thorns: 0, barrier: 0, vulnUp: 0 };
  for (const id in C.tech || {}) { const t = D.TECH[id].find(x => x.id === C.tech[id]); if (t) lean[t.rate[0]] += t.rate[1] / Math.max(3, C.bar.length) * 3; }
  const elPct = (els.phys * st.physPct + els.fire * st.firePct + els.light * st.lightPct) / n;   // weighted by the skills in use
  const crit = Math.min(80, st.crit + (m.burnCritCh || 0) * 0.5) / 100;
  let off = st.dmg * st.aps * (1 + st.aspd / 100)
    * (1 + (st.dmgPct + elPct + st.elite * 0.3 + (burn ? st.dot * 0.35 * burn / C.bar.length : 0)) / 100)
    * (1 + st.str / 100) * (1 + crit * st.critDmg / 100 * (1 + lean.critDmg)) * (1 + (20 + st.vuln) / 100 * Math.min(0.9, 0.35 + lean.vulnUp))
    * (1 + st.aspd / 100 * lean.aspd) * (1 + st.crit / 100 * lean.crit) * (1 + st.dot / 100 * lean.dot) * (1 + st.heat / 100 * lean.heat) * (1 + st.cdr / 100 * lean.cdr)
    * (1 + st.cdr / 100 * 0.12 * cds) * (1 + st.heat / 100 * 0.12 * Math.min(2, cores));
  let rk = 0, rn = 0;
  for (const id of C.bar) { rk += Math.min(C.ranks[id], 12); rn++; }
  off *= 1 + D.SKILL_RANK * (rn ? rk / rn - 1 : 0) * 0.8;
  off += st.thorns * (0.6 + lean.thorns);
  const dr = H.armorDR(st.armor, C.ref);
  let def = st.maxLife / ((1 - dr) * (1 - st.dr / 100) * (1 - st.dodge / 100));
  def += (st.regen + st.loh * st.aps * (1 + st.aspd / 100) * 1.2) * 9;
  def *= (1 + st.flask / 100 * 0.06) * (1 + (C.bar.includes('ironskin') ? st.barrier / 100 * (0.06 + lean.barrier) : 0));
  /* Damage and Toughness are shown side by side, so they are put on one scale. Raw, they are damage per second and
     effective Life, and Life runs about nine times the larger across builds and stages of the game. Damage is
     tripled and Toughness cut to a third: their product, and so Power, is exactly what it was. */
  const power = Math.round(Math.sqrt(off * def) * 1.2 * (1 + st.move / 100 * 0.04));   // a nod to Movement Speed, which is neither
  return { off: off * H.RATING_SCALE, def: def / H.RATING_SCALE, power };
};
})();
