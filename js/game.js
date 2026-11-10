/* Smeltworks — game state, the expedition map, loot, progression and the main update loop. No DOM here. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, I = SW.items, Hr = SW.hero;
const SAVE_KEY = 'smeltworks.autobattler.v2';
const G = SW.game = { S: null, C: null, battle: null, phase: 'idle', phaseT: 0, path: [], target: null, persist: {}, deathStreak: 0, listeners: [], log: [], meter: [] };

G.on = fn => G.listeners.push(fn);
G.emit = (type, data) => { for (const fn of G.listeners) fn(type, data || {}); };

/* ------------------------------------------------------------------ state */
G.fresh = function () {
  const S = {
    v: 2,
    hero: { bar: ['strike', 'sunder', 'ironskin', null, null], passives: ['heavy', null, null], tech: {} },
    gear: {}, bag: [], stash: [], gold: 0, mats: { scrap: 0, dust: 0, soul: 0 }, orbs: { add: 0, remove: 0, chaos: 0, divine: 0 }, codex: {},
    world: { tier: 0, area: 0, cleared: [0], map: null, pos: null, shrine: null, shrineN: 0 },
    opts: { speed: 1, auto: false, full: true, onClear: 'advance', salv: [false, false, false, false], sound: true, vol: 0.6, autoFlask: true },
    stats: { kills: 0, deaths: 0, leg: 0, uniq: 0, time: 0, clears: 0, elites: 0, bosses: {}, best: 0 },
    seen: {}, uid: 1,
  };
  for (const s of D.SLOTS) S.gear[s] = null;
  const w = I.roll(1, { slot: 'weapon', base: 'hammer', rar: 0 }); w.name = "Apprentice's Hammer"; w.isNew = 0;
  const c = I.roll(1, { slot: 'chest', rar: 0 }); c.name = 'Singed Apron'; c.isNew = 0;
  S.gear.weapon = w; S.gear.chest = c;
  return S;
};
G.init = function (saved) {
  G.S = saved || G.fresh();
  const S = G.S;
  S.bag = S.bag.filter(Boolean); while (S.bag.length < D.BAG_SIZE) S.bag.push(null);   // fixed slots, so items can be arranged
  S.orbs = Object.assign({ add: 0, remove: 0, chaos: 0, divine: 0 }, S.orbs || {});
  if (!S.hero.tech) S.hero.tech = {};
  if (!S.mwv) {
    // saves from before masterwork ranks: an old upgrade was +5%, so it becomes five ranks (25 at most), and a piece keeps one masterworked affix
    for (const it of Object.values(S.gear).concat(S.bag, S.stash || [])) if (it) { it.up = Math.min(D.MW_MAX, (it.up || 0) * 5); if (it.mw && it.mw.length > 1) it.mw = [it.mw[0]]; }
    S.mwv = 1;
  }
  for (const it of Object.values(S.gear).concat(S.bag, S.stash || [])) if (it && it.anc) it.ilvl = D.ANC_LEVEL;      // Ancestral is one fixed level, whatever it was when the save was made
  if (!S.afxv) {
    // saves from before Strength: the four affixes that were removed are rerolled into something the slot can take
    for (const it of Object.values(S.gear).concat(S.bag, S.stash || [])) if (it && !it.uniq) I.fixAffixes(it);
    S.afxv = 1;
  }
  if (!S.capv) {
    // saves from before the gear cap: anything above item level 50 comes down to it, and a Torment map is redrawn at the new monster levels
    for (const it of Object.values(S.gear).concat(S.bag, S.stash || [])) if (it && it.ilvl > D.GEAR_CAP && !it.anc) it.ilvl = D.GEAR_CAP;
    if (S.world.tier > 0) S.world.map = null;
    S.capv = 1;
  }
  let mx = 1;
  for (const s of D.SLOTS) if (S.gear[s]) mx = Math.max(mx, S.gear[s].id);
  S.stash = (S.stash || []).slice(0, Math.max(D.STASH_SIZE, (S.stash || []).length)); while (S.stash.length < D.STASH_SIZE) S.stash.push(null);
  for (const it of S.bag.concat(S.stash)) if (it) mx = Math.max(mx, it.id);
  I.setUid(mx + 1);
  G.battle = null; G.phase = 'idle'; G.phaseT = 0; G.persist = {}; G.deathStreak = 0; G.meter = [];
  G.recompute();
  if (!S.world.map) G.startExpedition(S.world.area, S.world.tier, true);
};
G.save = function () {
  if (typeof localStorage === 'undefined') return;
  try { G.S.uid = I.getUid(); localStorage.setItem(SAVE_KEY, JSON.stringify(G.S)); } catch (e) { /* storage full or blocked */ }
};
G.load = function () {
  if (typeof localStorage === 'undefined') return null;
  try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const S = JSON.parse(raw); return S && S.v === 2 && S.hero && S.world ? S : null; } catch (e) { return null; }
};
G.wipe = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };
G.exportSave = () => btoa(unescape(encodeURIComponent(JSON.stringify(G.S))));
G.importSave = function (str) {
  try { const S = JSON.parse(decodeURIComponent(escape(atob(str.trim())))); if (S && S.v === 2 && S.hero && S.world) { G.init(S); G.save(); return true; } } catch (e) {}
  return false;
};
G.recompute = function () {
  G.C = Hr.compute(G.S);
  if (G.battle && !G.battle.over) G.battle.setHero(G.C);
  G.S.stats.best = Math.max(G.S.stats.best || 0, G.C.rating.power);
  G.emit('stats');
};

/* -------------------------------------------------------------------- map */
const NAMES = ['Gorefang', 'Ashmaw', 'Varo the Cruel', 'Old Cinder', 'Skarn', 'Mother Soot', 'The Quarryman', 'Brakk Ironjaw', 'Sister Pyre', 'Hollow Jack', 'The Tallowman', 'Vex', 'Red Molly', 'Grist', 'The Stoker'];
G.areaLevel = () => D.areaLevel(G.S.world.area, G.S.world.tier);
G.genMap = function (area, tier) {
  const W = D.MAP_W, H = D.MAP_H, base = D.areaLevel(area, tier), first = area === 0 && tier === 0;
  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cells.push({ x, y, type: 'fight', state: 'hidden', lvl: base + Math.round(x / (W - 1) * 3), deaths: 0 });
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : cells[y * W + x]);
  const start = at(0, 2), boss = at(W - 1, U.irand(0, H - 1));
  start.type = 'start'; boss.type = 'boss';
  const reach = () => {
    const seen = new Set([start]), q = [start];
    while (q.length) { const c = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(c.x + dx, c.y + dy); if (n && n.type !== 'wall' && !seen.has(n)) { seen.add(n); q.push(n); } } }
    return seen.size;
  };
  let walls = 0; const want = first ? 5 : U.irand(6, 9);
  for (const c of U.shuffle(cells.filter(c => c.type === 'fight' && !(c.x <= 1 && c.y === 2)))) {
    if (walls >= want) break;
    c.type = 'wall';
    if (reach() === cells.length - walls - 1) walls++; else c.type = 'fight';
  }
  const free = U.shuffle(cells.filter(c => c.type === 'fight'));
  const take = (n, type, minX) => { let k = 0; for (const c of free) { if (k >= n) break; if (c.type === 'fight' && c.x >= minX) { c.type = type; k++; } } };
  take(first ? 2 : 3 + (tier > 0 ? 1 : 0), 'elite', first ? 3 : 2);
  take(2, 'chest', 1);
  take(2, 'shrine', 1);
  const map = { w: W, h: H, cells, area, tier, bossDone: false, allDone: false, name: null };
  if (!D.AREAS[area].final) map.name = U.pick(NAMES);
  start.state = 'done';
  boss.state = 'seen';
  G.reveal(map, start);
  return map;
};
G.cell = (x, y) => { const m = G.S.world.map; return x < 0 || y < 0 || x >= m.w || y >= m.h ? null : m.cells[y * m.w + x]; };
G.neighbors = function (map, c) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx, y = c.y + dy; if (x >= 0 && y >= 0 && x < map.w && y < map.h) out.push(map.cells[y * map.w + x]); }
  return out;
};
G.reveal = function (map, c) { for (const n of G.neighbors(map, c)) if (n.state === 'hidden') n.state = 'seen'; };
G.canEnter = function (c) {
  const map = G.S.world.map;
  return c && c.type !== 'wall' && c.state === 'seen' && G.neighbors(map, c).some(n => n.state === 'done');
};
/* path through cleared cells from the hero to a cell next to (or at) the target */
G.findPath = function (to, from) {
  const map = G.S.world.map, pos = G.S.world.pos; from = from || map.cells[pos.y * map.w + pos.x];
  const prev = new Map([[from, null]]), q = [from];
  while (q.length) {
    const c = q.shift();
    if (c === to) break;
    for (const n of G.neighbors(map, c)) if (!prev.has(n) && (n.state === 'done' || n === to)) { prev.set(n, c); q.push(n); }
  }
  if (!prev.has(to)) return null;
  const path = []; for (let c = to; c && c !== from; c = prev.get(c)) path.unshift(c);
  return path;
};
G.startExpedition = function (area, tier, quiet) {
  const W = G.S.world;
  W.area = area; W.tier = tier;
  W.map = G.genMap(area, tier);
  W.pos = { x: 0, y: 2 }; W.shrine = null; W.shrineN = 0;
  G.battle = null; G.phase = 'idle'; G.phaseT = 0.4; G.path = []; G.target = null; G.route = [];
  if (!quiet) G.emit('expedition');
  G.emit('map');
};
G.isUnlocked = (area, tier) => G.S.world.cleared[tier] != null && area <= G.S.world.cleared[tier] && area < D.AREAS.length;

/* ------------------------------------------------------------ battle spec */
G.makeSpec = function (c) {
  const W = G.S.world, area = D.AREAS[W.area], act = D.ACTS[area.act], tier = W.tier, lvl = c.lvl;
  const pool = act.mobs.map(id => D.MOB[id]);
  const first = W.area === 0 && tier === 0;
  const cost = m => (m.swarm ? 0.55 : m.hp > 1.4 ? 1.7 : m.ranged ? 1.1 : 1);
  const pack = budget => {
    const main = U.pick(pool), out = [];
    while (budget > 0.3 && out.length < 5) {
      const m = out.length === 0 || U.chance(0.65) ? main : U.pick(pool);
      if ((m.heal || m.summon) && out.filter(x => x.id === m.id).length >= 1) { budget -= 0.2; continue; }
      out.push({ id: m.id, lvl }); budget -= cost(m);
    }
    return out;
  };
  const affixes = n => U.shuffle(D.ELITE_IDS.slice()).slice(0, n);
  const spec = { waves: [], lvl, tier, shrine: W.shrineN > 0 ? W.shrine : null, type: c.type };
  if (c.type === 'boss' && area.final) {
    spec.waves.push([{ id: act.boss, lvl, boss: true }]); spec.boss = act.boss;
  } else if (c.type === 'boss') {
    const m = U.pick(pool.filter(m => !m.swarm && !m.heal && !m.summon));
    spec.waves.push(pack(1.2 + tier * 0.5));
    spec.waves.push([{ id: m.id, lvl, champ: true, elite: affixes(lvl >= 30 || tier > 0 ? 2 : 1), name: W.map.name }, ...pack(1.1)]);
    spec.champ = W.map.name;
  } else if (c.type === 'elite') {
    const m = U.pick(pool.filter(m => !m.swarm));
    spec.waves.push([{ id: m.id, lvl, elite: affixes(1 + (lvl >= 24 ? 1 : 0) + (tier >= 2 ? 1 : 0)) }, ...pack(first ? 0.6 : 1.2)]);
  } else {
    const nW = first && c.x < 2 ? 1 : (U.chance(0.45) ? 2 : 1) + (tier > 0 && U.chance(0.3) ? 1 : 0);
    for (let i = 0; i < nW; i++) spec.waves.push(pack(first ? 0.9 + c.x * 0.32 + U.rand(0, 0.5) : 1.7 + c.x * 0.2 + U.rand(0, 1.2) + (tier ? 0.5 : 0)));
    if (lvl >= 3 && U.chance(0.045)) spec.waves[0].push({ id: 'goblin', lvl });
  }
  return spec;
};

/* ------------------------------------------------------------------- loot */
G.bagCount = () => G.S.bag.filter(Boolean).length;
/* A legendary power can be worn once. The slot of a worn piece that carries the same aspect or is the same Unique as
   `it`, or null. `except` is a slot to ignore: the one `it` would replace. */
G.powerKey = it => (it ? (it.uniq ? 'u:' + it.uniq : it.aspect ? 'a:' + it.aspect.id : null) : null);
G.twinOf = function (it, except) {
  const k = G.powerKey(it); if (!k) return null;
  for (const s of D.SLOTS) { const w = G.S.gear[s]; if (s !== except && w && w !== it && G.powerKey(w) === k) return s; }
  return null;
};
/* the slots this piece may go in: its own, minus any that would leave the same power worn twice */
G.equipSlots = function (it, slotHint) {
  let slots = it.slot === 'ring' ? ['ring1', 'ring2'] : [it.slot];
  if (slotHint && slots.includes(slotHint)) slots = [slotHint];
  return slots.filter(s => !G.twinOf(it, s));
};
/* why a piece cannot be equipped (there), or null */
G.equipWhy = function (id, slotHint) {
  const f = G.findItem(id); if (!f || f.where === 'gear') return null;
  if (G.equipSlots(f.it, slotHint).length) return null;
  const s = G.twinOf(f.it, slotHint && f.it.slot === 'ring' ? slotHint : null) || G.twinOf(f.it), w = G.S.gear[s];
  return `You already wear ${f.it.uniq ? 'that Unique' : 'the ' + D.ASPECT[f.it.aspect.id].name + ' aspect'}${w ? ' (' + w.name + ')' : ''}. Each legendary power can only be worn once.`;
};
G.isUpgrade = function (it) {
  const S = G.S, slots = G.equipSlots(it);
  for (const s of slots) {
    if (!S.gear[s]) return true;
    const g = Object.assign({}, S.gear); g[s] = it;
    if (Hr.compute(S, g).rating.power > G.C.rating.power * 1.005) return true;
  }
  return false;
};
G.gainMats = function (y) { for (const k in y) G.S.mats[k] = (G.S.mats[k] || 0) + y[k]; };
G.salvageItem = function (it, quiet) {
  const y = I.salvageYield(it);
  G.gainMats(y);
  if (it.aspect) {
    const cur = G.S.codex[it.aspect.id];
    if (cur == null || it.aspect.r > cur) { G.S.codex[it.aspect.id] = it.aspect.r; G.emit('codex', { id: it.aspect.id, isNew: cur == null }); }
  }
  if (!quiet) G.emit('salvage', { it, y });
  return y;
};
/* put an item in the bag, honouring the auto-salvage filter and a full bag. returns 'bag' | 'salvaged' */
G.addItem = function (it) {
  const S = G.S;
  if (it.rar === 3) S.stats.leg++; if (it.rar === 4) S.stats.uniq++;
  it.upg = G.isUpgrade(it) ? 1 : 0;
  if (it.rar <= 3 && S.opts.salv[it.rar] && !it.upg && !it.anc) { G.salvageItem(it, true); return 'salvaged'; }      // Ancestral gear is never auto-salvaged
  // no room: the new piece is salvaged where it drops. Nothing already in the bag is touched.
  if (G.bagCount() >= D.BAG_SIZE) { G.salvageItem(it, true); G.emit('bagfull'); return 'salvaged'; }
  let i = S.bag.indexOf(null); if (i < 0) i = S.bag.length;
  S.bag[i] = it;
  return 'bag';
};
/* Drops lean towards the slots where the smith's gear has fallen furthest behind, so fewer drops still keep pace. */
/* in Torment any piece of gear, from any source, has a chance to be Ancestral */
G.ancestral = () => U.chance(D.ANC_CHANCE[G.S.world.tier] || 0);
G.rollLoot = function (ilvl, o) {
  o.anc = G.ancestral();
  const gear = G.S.gear, dl = o.anc ? D.ANC_LEVEL : Math.min(ilvl, D.GEAR_CAP);     // the level the piece will really have
  const lag = s => {
    const worn = s === 'ring' ? [gear.ring1, gear.ring2] : [gear[s]];
    let worst = 0; for (const it of worn) worst = Math.max(worst, it ? U.clamp((dl - it.ilvl) / 5, 0, 3) : 4);
    return worst;
  };
  o.slot = U.wpick(D.ITEM_SLOTS, s => D.SLOT_WEIGHT[s] * (1 + lag(s)));
  return I.roll(ilvl, o);
};
G.rollOrb = () => U.wpick(D.ORB_IDS, k => D.ORBS[k].w);
G.rollBasicOrb = () => U.wpick(D.ORB_BASIC, k => D.ORBS[k].w);      // Kindling or Quenching
G.gainOrbs = function (list) { for (const k of list) G.S.orbs[k]++; if (list.length) G.emit('orbs', { list }); };
G.dropsFor = function (m) {
  const S = G.S, st = G.C.st, tier = S.world.tier, greed = G.battle && G.battle.shrine === 'greed';
  const mf = st.mf + (greed ? 60 : 0);
  const out = { gold: 0, items: [], orbs: [] };
  const weight = m.boss ? 45 : m.champ ? 16 : m.elite ? 6 : m.def.flee ? 30 : m.minion ? 0.3 : m.def.hp;
  out.gold = Math.max(1, Math.round(D.mobGold(m.lvl) * weight * U.rand(0.7, 1.3) * (1 + st.gold / 100) * (greed ? 3 : 1)));
  let n = 0, boost = 1, minRar = 0;
  if (m.boss) { n = 3; boost = 6; minRar = 2; }
  else if (m.champ) { n = 2; boost = 4; minRar = 1; }
  else if (m.elite) { n = 1 + (U.chance(0.2) ? 1 : 0); boost = 3; minRar = 1; }
  else if (m.def.flee) { n = 2; boost = 4; minRar = 1; }
  else if (U.chance((m.minion ? 0.012 : 0.05 + (m.def.hp > 1.4 ? 0.03 : 0)) * (1 + mf / 300))) n = 1;
  for (let i = 0; i < n; i++) out.items.push(G.rollLoot(Math.max(1, m.lvl + U.irand(-1, 1)), { mf, tier, boost, minRar }));
  if (m.boss) {
    const key = m.id + tier;
    if (!S.stats.bosses[key]) {
      S.stats.bosses[key] = 1; out.first = true;
      out.items.push(I.roll(m.lvl + 1, { rar: 3, tier, anc: G.ancestral() }));
    } else S.stats.bosses[key]++;
    out.mats = { soul: 1 + tier, dust: 3 };
  } else if (m.champ) out.mats = { dust: 2 };
  else if (m.elite && U.chance(0.4)) out.mats = { dust: 1 };
  // Kindling and Quenching Orbs (add and remove an affix) are everyday materials: ordinary monsters drop them, and
  // anything bigger always carries some. Orbs of any kind, Slag and Tempering included, come from the bigger kills.
  const of = 1 + st.orbFind / 100;
  const basic = m.boss ? 3 : m.champ ? 2 : m.elite || m.def.flee ? 1 : m.minion ? 0 : (U.chance(D.ORB_COMMON * of) ? 1 : 0);
  for (let i = 0; i < basic; i++) out.orbs.push(G.rollBasicOrb());
  const orbs = m.boss ? 2 + (tier > 0 ? 1 : 0) : m.def.flee ? 1 : m.champ ? (U.chance(0.5 * of) ? 1 : 0) : m.elite ? (U.chance(0.15 * of) ? 1 : 0) : 0;
  for (let i = 0; i < orbs; i++) out.orbs.push(G.rollOrb());
  return out;
};
G.onKill = function (m) {
  const S = G.S, d = G.dropsFor(m);
  S.stats.kills++; if (m.elite) S.stats.elites++;
  S.gold += d.gold;
  if (d.mats) G.gainMats(d.mats);
  d.fate = d.items.map(it => G.addItem(it));
  G.gainOrbs(d.orbs);
  return d;
};
G.openChest = function (c) {
  const S = G.S, st = G.C.st, items = [];
  const n = U.irand(1, 2);
  for (let i = 0; i < n; i++) items.push(G.rollLoot(c.lvl, { mf: st.mf, tier: S.world.tier, boost: 2, minRar: 1 }));
  const gold = Math.round(D.mobGold(c.lvl) * 14 * U.rand(0.8, 1.3) * (1 + st.gold / 100));
  S.gold += gold;
  const fate = items.map(it => G.addItem(it));
  G.emit('chest', { c, items, gold, fate });
  if (U.chance(0.15 * (1 + st.orbFind / 100))) G.gainOrbs([G.rollOrb()]);
};

/* -------------------------------------------------------------- game loop */
/* seconds to walk one tile: Movement Speed (boots) shortens it */
G.stepTime = () => D.TRAVEL_STEP / (1 + G.C.st.move / 100);
/* ---- the route: tiles the player has clicked, visited in the order they were clicked ---- */
G.route = [];
/* a tile can join the route if it touches a cleared tile or one already on the route, so a path can be laid through fog */
G.canRoute = function (c) {
  if (!c || c.type === 'wall' || c.state === 'done' || G.route.includes(c)) return false;
  return G.neighbors(G.S.world.map, c).some(n => n.state === 'done' || G.route.includes(n));
};
/* Click a tile: add it to the route, or take it off again. Returns 'added', 'redirected', 'removed', 'busy' or null. */
G.routeToggle = function (c) {
  const i = G.route.indexOf(c);
  if (i >= 0) {
    if (c === G.target && G.phase !== 'idle') return 'busy';              // already walking there or fighting for it
    G.route.splice(i, 1);
    // anything further along that was only reachable through the removed tile goes too
    const keep = []; for (const x of G.route) if (G.neighbors(G.S.world.map, x).some(n => n.state === 'done' || keep.includes(n))) keep.push(x);
    G.route = keep; G.emit('route'); return 'removed';
  }
  if (!G.canRoute(c)) return null;
  const turn = !G.route.length && G.phase === 'travel' && c !== G.target && G.canEnter(c);    // on the move with no route: go there now
  G.route.push(c);
  const res = turn && G.redirect(c) ? 'redirected' : 'added';
  G.emit('route'); return res;
};
G.clearRoute = function () { G.route = G.phase !== 'idle' && G.route[0] === G.target ? [G.target] : []; G.emit('route'); };
/* Change course mid-walk. The smith either finishes the step under way and goes on from that tile, or turns round,
   whichever gets to the new room sooner. */
G.redirect = function (c) {
  const W = G.S.world, step = G.stepTime(), next = G.path[0], from = G.cell(W.pos.x, W.pos.y);
  if (G.phase !== 'travel' || !next) return false;
  const f = U.clamp(G.phaseT / step, 0, 1);
  const on = G.path.length > 1 ? G.findPath(c, next) : null;           // carry on to the next tile (only if it is a cleared one)
  const back = from.state === 'done' ? G.findPath(c, from) : null;     // turn back to the tile just left
  if (!on && !back) return false;
  if (on && (!back || (1 - f) + on.length <= f + back.length)) G.path = [next].concat(on);
  else { W.pos = { x: next.x, y: next.y }; G.phaseT = step - G.phaseT; G.path = [from].concat(back); }     // same spot, now walking the other way
  G.target = c; G.emit('travel', { path: G.path });
  return true;
};
G.isFight = c => !!c && c.type !== 'chest' && c.type !== 'shrine';
/* Where the smith stands on the map right now, in tile units. Walking: part-way to the next tile. Fighting: in the
   doorway of the room being fought for. After a win: walking the rest of the way in. After a fall: back where they came from. */
G.tokenPos = function () {
  const p = G.S.world.pos, t = G.target; let to = null, f = 0;
  if (G.phase === 'travel' && G.path.length) { to = G.path[0]; f = U.clamp(G.phaseT / G.stepTime(), 0, G.path.length === 1 && G.isFight(t) ? D.DOOR : 1); }
  else if (G.phase === 'battle' && t) { to = t; f = D.DOOR; }
  else if (G.phase === 'won' && t) { to = t; f = D.DOOR + (1 - D.DOOR) * U.clamp(1 - G.phaseT / (G.wonT || 0.9), 0, 1); }
  else if (G.phase === 'dead' && t) { to = t; f = D.DOOR * U.clamp(G.phaseT / 0.6, 0, 1); }      // steps back in the last moments
  return to ? { x: p.x + (to.x - p.x) * f, y: p.y + (to.y - p.y) * f } : { x: p.x, y: p.y };
};
G.enterCell = function (c) {
  if (G.phase !== 'idle' || !G.canEnter(c)) return false;
  const path = G.findPath(c);
  if (!path) return false;
  G.path = path; G.target = c; G.phase = 'travel'; G.phaseT = 0;
  G.emit('travel', { path });
  return true;
};
G.autoPick = function () {
  const map = G.S.world.map, pos = G.S.world.pos, opts = G.S.opts;
  const cands = map.cells.filter(G.canEnter);
  if (!cands.length) return null;
  const boss = map.cells.find(c => c.type === 'boss');
  const rank = { shrine: 0, chest: 1, fight: 2, elite: 3, boss: 9 };
  const score = c => {
    const d = Math.abs(c.x - pos.x) + Math.abs(c.y - pos.y);
    // heading straight for the boss, unless it has already beaten us: then gather strength from the rest of the map first
    if (!opts.full && !map.bossDone && !boss.deaths) return (c.type === 'boss' ? -100 : 0) + (Math.abs(c.x - boss.x) + Math.abs(c.y - boss.y)) * 10 + d + c.deaths * 50;
    return c.deaths * 200 + rank[c.type] * 30 + c.lvl * 4 + d * 20;     // every room walked costs time, so nearer wins
  };
  return cands.reduce((a, b) => (score(b) < score(a) ? b : a));
};
G.finishArea = function () {
  const S = G.S, W = S.world, map = W.map;
  if (!S.opts.auto) return;
  let area = W.area;
  if (S.opts.onClear === 'advance') area = Math.min(W.cleared[W.tier], D.AREAS.length - 1);
  G.startExpedition(area, W.tier);
};
G.update = function (dt) {
  const S = G.S, W = S.world, map = W.map;
  S.stats.time += dt;
  if (G.phase === 'idle') {
    if (G.phaseT > 0) { G.phaseT -= dt; return; }
    // the player's route comes first, whether Auto is on or off; Auto only chooses when the route is empty
    if (G.route.length) {
      const n = G.route.length;
      while (G.route.length && !G.canEnter(G.route[0])) G.route.shift();      // cleared already, or the way to it never opened
      if (G.route.length !== n) G.emit('route');
      if (G.route.length) { G.enterCell(G.route[0]); return; }
    }
    if (!S.opts.auto) return;
    const done = map.bossDone && (map.allDone || !S.opts.full);
    if (done) { G.finishArea(); return; }
    const c = G.autoPick();
    if (c) G.enterCell(c); else if (map.bossDone) G.finishArea();
    return;
  }
  if (G.phase === 'travel') {
    G.phaseT += dt;
    const step = G.stepTime();
    while (G.path.length > 1 && G.phaseT >= step) { G.phaseT -= step; const c = G.path.shift(); W.pos = { x: c.x, y: c.y }; G.emit('moved'); }
    // a room that has to be fought for is approached only as far as its doorway; chests and shrines are walked straight into
    const last = G.isFight(G.target) ? step * D.DOOR : step;
    if (!G.path.length || (G.path.length === 1 && G.phaseT >= last)) { G.arrive(G.target); }     // nothing to walk when you are already standing there
    return;
  }
  if (G.phase === 'battle') {
    let left = dt;
    while (left > 1e-6 && !G.battle.over) { const s = Math.min(0.05, left); G.battle.step(s); left -= s; }
    // after a win the smith walks the rest of the way in, at walking pace (never less than the 0.9s victory beat)
    if (G.battle.over) { G.phase = G.battle.over === 'win' ? 'won' : 'dead'; G.phaseT = G.wonT = G.battle.over === 'win' ? Math.max(0.9, G.stepTime() * (1 - D.DOOR)) : 2.4; if (G.phase === 'dead') { S.stats.deaths++; G.target.deaths++; G.deathStreak++; const lost = G.route.length; G.route = []; G.emit('death', { route: lost }); } }
    return;
  }
  if (G.phase === 'won') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) G.winCell();
    return;
  }
  if (G.phase === 'dead') {
    G.phaseT -= dt;
    if (G.phaseT <= 0) {
      const bs = G.battle.summary(); G.record(bs); G.persist = G.battle.persist(); G.battle = null; G.phase = 'idle'; G.phaseT = 0.3; G.emit('battleEnd', { win: false, bs });
      if (S.opts.auto && G.deathStreak >= 3) {
        // three falls in a row: stop banging on the same door. If only the boss is too much, run this area again
        // for its loot; if the ordinary packs are too much, step back an area.
        G.deathStreak = 0;
        const bossOnly = G.target && G.target.type === 'boss' && map.cells.filter(c => c.type !== 'wall' && c.state !== 'done').length <= 3;
        const to = bossOnly || W.area === 0 ? W.area : W.area - 1;
        G.emit('fallback', { to: D.AREAS[to].name, same: to === W.area });
        G.startExpedition(to, W.tier);
      }
      G.save();
    }
    return;
  }
};
G.arrive = function (c) {
  const S = G.S, W = S.world;
  if (c.type === 'chest') { W.pos = { x: c.x, y: c.y }; G.openChest(c); G.completeCell(c); G.phase = 'idle'; G.phaseT = 0.7; return; }
  if (c.type === 'shrine') {
    W.pos = { x: c.x, y: c.y };
    const id = U.pick(Object.keys(D.SHRINES)); W.shrine = id; W.shrineN = D.SHRINE_FIGHTS;
    G.emit('shrine', { id, c }); G.completeCell(c); G.phase = 'idle'; G.phaseT = 0.7; return;
  }
  const spec = G.makeSpec(c);
  G.battle = new SW.Battle(G.C, G.persist, spec, { onKill: G.onKill, autoFlask: G.S.opts.autoFlask !== false }, !SW.headless);
  G.phase = 'battle';
  G.emit('battleStart', { c, spec });
};
G.completeCell = function (c) {
  const S = G.S, W = S.world, map = W.map;
  c.state = 'done'; W.pos = { x: c.x, y: c.y };
  if (G.route.includes(c)) { G.route = G.route.filter(x => x !== c); G.emit('route'); }
  G.reveal(map, c);
  if (c.type === 'boss') {
    map.bossDone = true; S.stats.clears++;
    const first = W.cleared[W.tier] === W.area;
    if (first) {
      W.cleared[W.tier] = W.area + 1;
      if (W.area === D.AREAS.length - 1 && W.tier < D.TIERS.length - 1 && W.cleared[W.tier + 1] == null) { W.cleared[W.tier + 1] = 0; G.emit('tierUnlock', { tier: W.tier + 1 }); }
    }
    G.emit('areaClear', { first, area: W.area, tier: W.tier });
  }
  if (!map.allDone && map.cells.every(x => x.type === 'wall' || x.state === 'done')) {
    map.allDone = true;
    const items = [G.rollLoot(c.lvl + 1, { mf: G.C.st.mf, tier: W.tier, boost: 5, minRar: 2 })];
    const gold = Math.round(D.mobGold(c.lvl) * 40 * (1 + G.C.st.gold / 100)); S.gold += gold;
    const fate = items.map(it => G.addItem(it));
    G.emit('fullClear', { items, gold, fate });
    G.gainOrbs([G.rollOrb()]);
  }
  G.emit('map');
};
/* the damage meter averages over the last ten battles */
G.record = function (bs) { if (bs.ft > 0.2) { G.meter.push({ dmg: bs.dmg, ft: bs.ft, by: bs.by }); if (G.meter.length > 10) G.meter.shift(); } };
G.winCell = function () {
  const S = G.S, W = S.world, c = G.target;
  const bs = G.battle.summary(); G.record(bs);
  G.persist = G.battle.persist(); G.battle = null; G.deathStreak = 0;
  if (W.shrineN > 0) { W.shrineN--; if (!W.shrineN) W.shrine = null; }
  G.phase = 'idle'; G.phaseT = 0.25;
  G.emit('battleEnd', { win: true, bs });
  G.completeCell(c);
  G.recompute();
  G.save();
};

/* -------------------------------------------------------- player actions */
G.findItem = function (id) {
  const S = G.S;
  for (const s of D.SLOTS) if (S.gear[s] && S.gear[s].id === id) return { it: S.gear[s], where: 'gear', slot: s };
  for (const where of ['bag', 'stash']) { const i = S[where].findIndex(b => b && b.id === id); if (i >= 0) return { it: S[where][i], where, idx: i }; }
  return null;
};
G.equip = function (id, slotHint) {
  const S = G.S, f = G.findItem(id);
  if (!f || f.where === 'gear') return false;
  const it = f.it;
  const slots = G.equipSlots(it, slotHint);
  if (!slots.length) return false;                         // the same legendary power is already worn elsewhere (G.equipWhy says where)
  let slot = slots[0];
  if (slots.length > 1) {
    if (!S.gear.ring1) slot = 'ring1'; else if (!S.gear.ring2) slot = 'ring2';
    else {
      // replace whichever ring gains more
      const g1 = Object.assign({}, S.gear, { ring1: it }), g2 = Object.assign({}, S.gear, { ring2: it });
      slot = Hr.compute(S, g1).rating.power >= Hr.compute(S, g2).rating.power ? 'ring1' : 'ring2';
    }
  }
  const old = S.gear[slot];
  S.gear[slot] = it; it.isNew = 0; it.upg = 0;
  S[f.where][f.idx] = old || null;            // what was worn goes back where the new piece came from
  G.recompute(); G.refreshUpgrades(); G.emit('equip', { it }); G.save();
  return true;
};
G.unequip = function (slot) {
  const S = G.S, it = S.gear[slot];
  if (!it || G.bagCount() >= D.BAG_SIZE) return false;
  let i = S.bag.indexOf(null); if (i < 0) i = S.bag.length;
  S.bag[i] = it; S.gear[slot] = null;
  G.recompute(); G.refreshUpgrades(); G.emit('equip', { it }); G.save();
  return true;
};
/* drag and drop: move an item to a slot in the bag or the stash (swapping with what is there), or drop worn gear into one */
G.moveItem = function (id, to, toIdx) {
  const S = G.S, f = G.findItem(id), box = S[to];
  if (!f || (to !== 'bag' && to !== 'stash') || toIdx < 0 || toIdx >= box.length) return false;
  const there = box[toIdx] || null;
  if (f.where === 'gear') {
    if (there && there.slot !== f.it.slot) return false;       // worn gear only swaps with a piece for the same slot
    box[toIdx] = f.it; S.gear[f.slot] = there;
    if (there) { there.isNew = 0; there.upg = 0; }
    G.recompute(); G.refreshUpgrades(); G.emit('equip', { it: f.it }); G.save();
    return true;
  }
  if (f.where === to && f.idx === toIdx) return false;
  box[toIdx] = f.it; S[f.where][f.idx] = there;
  G.emit('bag'); G.save();
  return true;
};
/* send a bag item to the first free stash slot, or a stashed one back to the bag */
G.stashToggle = function (id) {
  const S = G.S, f = G.findItem(id);
  if (!f || f.where === 'gear') return false;
  const to = f.where === 'bag' ? 'stash' : 'bag', i = S[to].indexOf(null);
  if (i < 0) return false;
  return G.moveItem(id, to, i);
};
G.stashCount = () => G.S.stash.filter(Boolean).length;
G.refreshUpgrades = function () { for (const b of G.S.bag.concat(G.S.stash)) if (b) b.upg = G.isUpgrade(b) ? 1 : 0; };
G.salvage = function (id) {
  const f = G.findItem(id);
  if (!f || f.where !== 'bag' || f.it.lock) return false;
  G.S.bag[f.idx] = null; G.salvageItem(f.it); G.save();
  return true;
};
/* the bulk buttons leave upgrades, locked pieces and Ancestral gear alone (anc: true takes Ancestral too) */
G.salvageAll = function (maxRar, anc) {
  const S = G.S; let n = 0; const tot = {};
  S.bag.forEach((b, i) => { if (b && !b.lock && b.rar <= maxRar && !b.upg && (anc || !b.anc)) { S.bag[i] = null; const y = G.salvageItem(b, true); for (const k in y) tot[k] = (tot[k] || 0) + y[k]; n++; } });
  if (n) { G.emit('salvageAll', { n, y: tot }); G.save(); }
  return n;
};
G.toggleLock = function (id) { const f = G.findItem(id); if (f) { f.it.lock = f.it.lock ? 0 : 1; G.emit('bag'); } };
G.sortBag = function () {
  const S = G.S, order = D.ITEM_SLOTS;
  const items = S.bag.filter(Boolean).sort((a, b) => b.rar - a.rar || order.indexOf(a.slot) - order.indexOf(b.slot) || b.ilvl - a.ilvl);
  while (items.length < D.BAG_SIZE) items.push(null);
  S.bag = items; G.emit('bag');
};
G.canPay = c => Object.keys(c).every(k => (k === 'gold' ? G.S.gold : G.S.mats[k] || 0) >= c[k]);
G.pay = function (c) { if (!G.canPay(c)) return false; for (const k in c) { if (k === 'gold') G.S.gold -= c[k]; else G.S.mats[k] -= c[k]; } return true; };
G.upgrade = function (id) {
  const f = G.findItem(id); if (!f) return null;
  const it = f.it;
  if (I.upgradeCheck(it) || !G.pay(I.upgradeCost(it))) return null;
  const r = I.upgrade(it);
  G.recompute(); G.refreshUpgrades(); G.emit('forge', { kind: 'upgrade', it, mw: r.mw, ranks: r.ranks }); G.save();
  return r;
};
G.enchant = function (id, idx) {
  const f = G.findItem(id); if (!f) return null;
  const it = f.it;
  if (!I.canEnchant(it, idx) || !G.pay(I.enchantCost(it))) return null;
  const was = it.affixes[idx].g, a = I.enchant(it, idx, G.S.world.tier);
  G.recompute(); G.refreshUpgrades(); G.emit('forge', { kind: 'enchant', it, a, was }); G.save();
  return a;
};
G.imprint = function (id, aspectId) {
  const f = G.findItem(id); if (!f) return false;
  const it = f.it, r = G.S.codex[aspectId];
  if (r == null || !I.canImprint(it, aspectId)) return false;
  if (f.where === 'gear' && G.wornAspect(aspectId, f.slot)) return false;      // it is already on another piece you are wearing
  if (!G.pay(I.imprintCost(it))) return false;
  I.imprint(it, aspectId, r);
  G.recompute(); G.refreshUpgrades(); G.emit('forge', { kind: 'imprint', it }); G.save();
  return true;
};
/* the slot of a worn piece carrying this aspect, other than `except` */
G.wornAspect = function (aspectId, except) { for (const s of D.SLOTS) { const w = G.S.gear[s]; if (s !== except && w && w.aspect && w.aspect.id === aspectId) return s; } return null; };
G.commission = function (slot) {
  const S = G.S, ilvl = G.areaLevel(), cost = { gold: I.commissionCost(ilvl) };
  if (G.bagCount() >= D.BAG_SIZE || !G.pay(cost)) return null;
  const it = I.roll(ilvl, { slot, mf: G.C.st.mf + 40, tier: S.world.tier, minRar: 1, boost: 1.5, anc: G.ancestral() });
  it.upg = G.isUpgrade(it) ? 1 : 0;
  if (it.rar === 3) S.stats.leg++; if (it.rar === 4) S.stats.uniq++;
  let i = S.bag.indexOf(null); if (i < 0) i = S.bag.length; S.bag[i] = it;
  G.emit('forge', { kind: 'commission', it }); G.save();
  return it;
};

/* The cube: one item, one orb, a random result. */
G.cube = function (id, orb, cat) {
  const S = G.S, f = G.findItem(id);
  if (!D.AFFIX_CAT[cat]) cat = null;
  if (!f || !D.ORBS[orb] || !(S.orbs[orb] > 0) || I.cubeCheck(f.it, orb, cat)) return null;
  S.orbs[orb]--;
  const res = I.cube(f.it, orb, S.world.tier, cat);
  G.recompute(); G.refreshUpgrades(); G.emit('cube', { it: f.it, res }); G.save();
  return res;
};

/* Skills: no points and no levels. Pick up to five for the bar and three passives; gear supplies the ranks. */
G.skillOn = id => Hr.selected(G.S).includes(id);
/* drink the flask by hand. Returns null, or a line saying why not */
G.drink = function () {
  const B = G.battle;
  if (!B || B.over) return 'Your Life refills between battles. Save the flask for a fight.';
  const r = B.drink();
  return r === 'cooldown' ? `The flask is still refilling (${Math.ceil(B.h.potCd)}s).` : r === 'full' ? 'You are at full Life.' : r ? 'Too late for that.' : null;
};
G.setAutoFlask = function (on) { G.S.opts.autoFlask = !!on; if (G.battle) G.battle.autoFlask = !!on; G.save(); };
G.toggleSkill = function (id) {
  const S = G.S, sk = D.SKILL[id], h = S.hero;
  if (!sk) return 'No such skill.';
  const list = sk.type === 'passive' ? h.passives : h.bar;
  let i = list.indexOf(id), msg = null;
  if (i >= 0) list[i] = null;
  else {
    if (sk.type === 'basic' || sk.type === 'ult') i = list.findIndex(x => x && D.SKILL[x].type === sk.type);   // one of each: swap it
    if (i < 0) i = list.indexOf(null);
    if (i < 0) msg = sk.type === 'passive' ? 'All three passive slots are taken. Click one to free it.' : 'Your bar is full. Click a skill on it to free a slot.';
    else list[i] = id;
  }
  if (!msg) { G.recompute(); G.emit('skills'); G.save(); }
  return msg;
};
/* choose a technique for a skill, or pass the one already chosen to take it off again */
G.setTech = function (skill, id) {
  const h = G.S.hero, list = D.TECH[skill];
  if (!list || !list.some(t => t.id === id)) return false;
  if (!h.tech) h.tech = {};
  if (h.tech[skill] === id) delete h.tech[skill]; else h.tech[skill] = id;
  G.recompute(); G.emit('skills'); G.save();
  return true;
};
G.clearSkills = function () { const h = G.S.hero; h.bar = h.bar.map(() => null); h.passives = h.passives.map(() => null); G.recompute(); G.emit('skills'); G.save(); };
})();
