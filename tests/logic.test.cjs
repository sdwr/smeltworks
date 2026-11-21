/* Rule checks for the game logic. Run: node tests/logic.test.cjs */
const assert = require('node:assert/strict');
const { load, play } = require('./harness.cjs');
let n = 0;
function test(name, fn) { const SW = load(); SW.util.seed(1234 + n); SW.game.init(null); fn(SW, SW.game, SW.data, SW.items, SW.hero); n++; console.log('PASS ' + name); }

test('A fresh save starts with a weapon, a basic skill and a map', (SW, G, D) => {
  const S = G.S;
  assert.ok(S.gear.weapon && S.gear.chest); assert.ok(S.hero.bar.includes('strike')); assert.equal(G.C.ranks.strike, 1);
  assert.equal(S.bag.length, D.BAG_SIZE); assert.equal(D.BAG_SIZE, 24);
  assert.ok(S.world.map && S.world.map.cells.length === 35);
});
test('Every map is fully reachable and has one boss', (SW, G, D) => {
  for (let i = 0; i < 200; i++) {
    const m = G.genMap(i % 5, i % 3), start = m.cells.find(c => c.type === 'start');
    const seen = new Set([start]), q = [start];
    while (q.length) { const c = q.pop(); for (const x of G.neighbors(m, c)) if (x.type !== 'wall' && !seen.has(x)) { seen.add(x); q.push(x); } }
    assert.equal(seen.size, m.cells.filter(c => c.type !== 'wall').length, 'unreachable tile');
    assert.equal(m.cells.filter(c => c.type === 'boss').length, 1);
    assert.ok(m.cells.filter(c => c.type === 'elite').length >= 2);
  }
});
test('Rolled items only carry affixes allowed on their slot, never twice', (SW, G, D, I) => {
  for (let i = 0; i < 3000; i++) {
    const it = I.roll(1 + (i % 120), { mf: 200, tier: i % 5, boost: 3 });
    const keys = it.affixes.map(a => a.k);
    assert.equal(new Set(keys).size, keys.length);
    if (!it.uniq) for (const k of keys) assert.ok(D.AFFIX[k].slots.includes(I.poolKey(it)), `${k} on ${I.poolKey(it)}`);   // uniques break the slot rules on purpose
    assert.ok(it.rar >= 0 && it.rar <= 3 && it.aspect === undefined, 'four rarities and no aspects'); assert.equal(it.rar === 3, !!it.uniq, 'the top rarity is Unique');
    if (it.uniq) assert.equal(D.BASES[D.UNIQUE[it.uniq].base].slot, it.slot);
    const st = I.stats(it); for (const k in st) assert.ok(st[k] > 0 && isFinite(st[k]), k);
  }
});
test('Each piece has one main stat, identical on every piece of its type and level', (SW, G, D, I) => {
  const one = { sword: 'dmg', axe: 'dmg', hammer: 'dmg', shield: 'armor', lantern: 'dmgPct', helm: 'armor', chest: 'armor', gloves: 'armor', pants: 'armor', boots: 'armor', amulet: 'life', ring: 'life' };
  for (const base in one) {
    const slot = D.BASES[base].slot, seen = new Set();
    for (let i = 0; i < 40; i++) { const imp = I.implicit(I.roll(25, { slot, base, rar: i % 3 })); assert.equal(Object.keys(imp).filter(k => k !== 'aps').join(), one[base], base); seen.add(imp[one[base]]); }
    assert.equal(seen.size, 1, base + ' main stat varies between pieces');
  }
  assert.ok(I.implicit(I.roll(40, { slot: 'weapon', base: 'sword', rar: 0 })).dmg > I.implicit(I.roll(10, { slot: 'weapon', base: 'sword', rar: 0 })).dmg * 8);
});
test('Every affix value sits inside the range shown for it', (SW, G, D, I) => {
  for (let i = 0; i < 800; i++) {
    const it = I.roll(1 + (i % 150), { rar: 1 + (i % 3), tier: i % 5 }); it.up = i % 26; if (it.up >= 25 && it.affixes.length) it.mw = [0];
    it.affixes.forEach((a, k) => {
      if (a.g) { const g = I.affixRange(it, a, k).match(/^\[(.+)–(.+)\]$/); assert.ok(g && I.affixValue(it, a, k) > I.affixValue(it, { k: a.k, r: 0.9999, g: 0 }, k), `a Greater ${a.k} shows the ordinary range and sits above it`); return; }
      const m = I.affixRange(it, a, k).match(/^\[(.+)–(.+)\]$/); assert.ok(m, I.affixRange(it, a, k));
      const v = I.affixValue(it, a, k), lo = I.affixValue(it, { k: a.k, r: 0, g: a.g }, k), hi = I.affixValue(it, { k: a.k, r: 0.9999, g: a.g }, k);
      assert.ok(lo <= v && v <= hi, `${a.k}: ${lo} <= ${v} <= ${hi}`);
    });
  }
});
test('Four rarities: none on Common, 1-2 affixes on Magic, 3-4 on Rare, 4 on a Unique', (SW, G, D, I) => {
  assert.equal(D.RARITY.map(r => r.name).join(), 'Common,Magic,Rare,Unique'); assert.equal(D.ASPECTS, undefined); assert.equal(I.imprint, undefined); assert.equal(G.imprint, undefined);
  const counts = [new Set(), new Set(), new Set(), new Set()];
  for (let i = 0; i < 1500; i++) { const it = I.roll(1 + (i % 90), { rar: i % 4, slot: i % 4 === 3 ? 'ring' : undefined }); counts[it.rar].add(it.affixes.length); }
  const show = s => [...s].sort().join();
  assert.equal(show(counts[0]), '0'); assert.equal(show(counts[1]), '1,2'); assert.equal(show(counts[2]), '3,4'); assert.equal(show(counts[3]), '4');
  assert.equal(I.rarityWeights(40, 0, 2, 3).length, 4);
  const w = I.roll(3, { rar: 3, slot: 'ring' }); assert.equal(w.rar, 2, 'where no Unique exists yet, a Rare drops instead'); assert.ok(!w.uniq);
});
test('Masterworking: 25 ranks of +1%, 1 to 3 ranks a strike, then one affix that later strikes move', (SW, G, D, I) => {
  const gains = new Set();
  for (let n = 0; n < 40; n++) {
    const it = I.roll(30, { slot: 'chest', rar: 2 }), base = I.implicit(it).armor;
    G.S.bag[0] = it; G.S.gold = 1e12; G.S.mats = { dust: 9999, soul: 9999 };
    let strikes = 0;
    while (it.up < 25) { const was = it.up || 0, r = G.upgrade(it.id); assert.ok(r); assert.equal(r.mw, -1); assert.equal(it.up - was, r.ranks); assert.ok(r.ranks >= 1 && r.ranks <= 3); if (it.up < 25) gains.add(r.ranks); strikes++; assert.ok(!it.mw || !it.mw.length, 'no affix is masterworked before rank 25'); }
    assert.equal(it.up, 25); assert.ok(strikes >= 9 && strikes <= 25, 'strikes ' + strikes);
    assert.ok(Math.abs(I.implicit(it).armor / base - 1.25) < 0.02, '25 ranks are +25%');
    const before = it.affixes.map((a, i) => I.affixValue(it, a, i));
    const r = G.upgrade(it.id); assert.equal(it.up, 25, 'rank stays at 25'); assert.equal(r.ranks, 0); assert.equal(it.mw.length, 1); assert.equal(it.mw[0], r.mw);
    const a = it.affixes[r.mw], v = I.affixValue(it, a, r.mw);
    if (D.AFFIX[a.k].int) assert.equal(v, before[r.mw] + 1); else assert.ok(v >= before[r.mw] && Math.abs(v - before[r.mw] * 1.25) <= Math.max(1, before[r.mw] * 0.08), `${a.k} ${before[r.mw]} -> ${v}`);
    for (let k = 0; k < 6; k++) { const was = it.mw[0], r2 = G.upgrade(it.id); assert.equal(it.mw.length, 1, 'only ever one'); assert.notEqual(it.mw[0], was, 'a strike always moves it'); assert.equal(r2.mw, it.mw[0]); }
    it.affixes.forEach((x, i) => { if (i !== it.mw[0]) assert.equal(I.affixValue(it, x, i), before[i], 'the others go back to normal'); });
  }
  assert.equal([...gains].sort().join(), '1,2,3');
  const plain = I.roll(30, { slot: 'chest', rar: 0 }); plain.up = 25; G.S.bag[1] = plain; assert.equal(G.upgrade(plain.id), null, 'nothing to masterwork on a Common');
  const one = I.roll(30, { slot: 'chest', rar: 1 }); one.affixes = one.affixes.slice(0, 1); one.up = 25; G.S.bag[2] = one;
  assert.ok(G.upgrade(one.id)); assert.equal(G.upgrade(one.id), null, 'a single affix cannot be moved');
});
test('Old saves: an upgrade becomes five masterwork ranks, and one masterworked affix is kept', (SW, G, D, I) => {
  const S = G.fresh(); delete S.mwv;
  const a = I.roll(30, { slot: 'chest', rar: 2 }); a.up = 3; const b = I.roll(30, { slot: 'ring', rar: 2 }); b.up = 8; b.mw = [2, 0];
  S.gear.chest = a; S.bag[0] = b; G.init(S);
  assert.equal(a.up, 15); assert.equal(b.up, 25); assert.equal(b.mw.join(), '2'); assert.equal(S.mwv, 1);
  G.init(S); assert.equal(a.up, 15, 'only converted once');
});
test('Gear stops at item level 50; Ancestral gear is 55 and only drops in Torment', (SW, G, D, I, H) => {
  assert.equal(I.roll(999, { rar: 2 }).ilvl, 50); assert.equal(I.roll(50, { rar: 2 }).anc, 0);
  const a = I.roll(12, { rar: 2, anc: true }); assert.equal(D.ANC_LEVEL, 55); assert.equal(a.ilvl, 55); assert.equal(a.anc, 1); assert.ok(I.typeLine(a).startsWith('Ancestral Rare'));
  const w50 = I.roll(50, { slot: 'weapon', base: 'sword', rar: 0 }), w55 = I.roll(50, { slot: 'weapon', base: 'sword', rar: 0, anc: true });
  const step = I.implicit(w55).dmg / I.implicit(w50).dmg; assert.ok(step > 1.4 && step < 1.6, 'five item levels is about half again: ' + step);
  const S = G.S, rate = tier => { S.world.tier = tier; let n = 0; for (let i = 0; i < 4000; i++) { const it = G.rollLoot(D.areaLevel(4, tier) + 3, { tier }); assert.ok(it.ilvl === (it.anc ? 55 : Math.min(50, it.ilvl))); assert.ok(it.ilvl <= 55); if (it.anc) n++; } return n / 4000; };
  assert.equal(rate(0), 0, 'never outside Torment');
  const r = [1, 2, 3, 4].map(rate); for (let i = 0; i < 4; i++) assert.ok(Math.abs(r[i] - D.ANC_CHANCE[i + 1]) < 0.025, `T${i + 1}: ${r[i]}`);
  assert.ok(r[0] < r[1] && r[1] < r[2] && r[2] < r[3], 'the chance rises with every tier');
  S.world.tier = 4; S.gold = 1e15; let anc = 0; for (let i = 0; i < 300; i++) { S.bag.fill(null); const it = G.commission('ring'); assert.ok(it.ilvl === 50 || (it.anc && it.ilvl === 55)); if (it.anc) anc++; }
  assert.ok(anc > 15, 'commissions can come out Ancestral in Torment: ' + anc);
  S.world.tier = 0; S.bag.fill(null);
});
test('Torment: each tier is ten monster levels, and monsters only ever get harder', (SW, G, D, I, H) => {
  assert.equal(D.areaLevel(0, 1), 50); assert.equal(D.areaLevel(4, 1) + D.areaSpan(1), 61); assert.equal(D.areaLevel(0, 2), 60); assert.equal(D.areaLevel(4, 4), 88);
  let hp = 0, dmg = 0;
  for (let tier = 0; tier <= 4; tier++) for (let a = 0; a < 5; a++) { const l = D.areaLevel(a, tier), h = D.mobHp(l) * D.TIER_HP[tier], d = D.mobDmg(l) * D.TIER_DMG[tier]; assert.ok(h >= hp && d >= dmg, `T${tier} a${a}`); hp = h; dmg = d; }
  assert.equal(H.armorDR(5000, 50), H.armorDR(5000, 89), 'armor is not devalued past the gear cap');
  assert.ok(D.goldScale(89) / D.goldScale(50) < 4, 'gold stops inflating once gear stops growing');
});
test('Ancestral gear is never auto-salvaged or bulk-salvaged', (SW, G, D, I) => {
  const S = G.S; S.opts.salv = [true, true, true, true]; S.world.tier = 2;
  const plain = I.roll(50, { rar: 2, slot: 'ring' }), anc = I.roll(50, { rar: 2, slot: 'ring', anc: true });
  G.isUpgrade = () => false;
  assert.equal(G.addItem(plain), 'salvaged'); assert.equal(G.addItem(anc), 'bag');
  assert.equal(G.salvageAll(4), 0, 'the bulk buttons skip it'); assert.ok(S.bag.includes(anc));
  assert.equal(G.salvage(anc.id), true, 'but it can be salvaged by hand');
});
test('Old saves: gear above item level 50 comes down to the cap and a Torment map is redrawn', (SW, G, D, I) => {
  const S = G.fresh(); delete S.capv;
  const a = I.roll(50, { slot: 'chest', rar: 2 }); a.ilvl = 138; const b = I.roll(30, { slot: 'ring', rar: 2 });
  const old = I.roll(50, { slot: 'helm', rar: 2, anc: true }); old.ilvl = 60; S.bag[1] = old;
  S.gear.chest = a; S.bag[0] = b; S.world.tier = 2; S.world.area = 3; S.world.cleared = [5, 5, 3]; S.world.map = { stale: true, cells: [] };
  G.init(S);
  assert.equal(a.ilvl, 50); assert.equal(b.ilvl, 30); assert.equal(old.ilvl, 55, 'an Ancestral piece saved at 60 becomes 55'); assert.equal(S.capv, 1); assert.ok(!S.world.map.stale && S.world.map.cells.length === 35);
  assert.ok(S.world.map.cells.every(c => c.lvl >= 66 && c.lvl <= 69), 'Torment II, fourth level');
});
test('On the map the smith fights from the doorway and walks in after the win', (SW, G, D, I) => {
  const S = G.S, W = S.world, c = W.map.cells.find(x => G.canEnter(x) && G.isFight(x)), from = { x: W.pos.x, y: W.pos.y }, step = G.stepTime();
  const near = (a, b) => Math.abs(a - b) < 1e-6, at = f => { const p = G.tokenPos(); return near(p.x, from.x + (c.x - from.x) * f) && near(p.y, from.y + (c.y - from.y) * f); };
  G.phase = 'idle'; assert.ok(G.enterCell(c)); assert.ok(at(0));
  G.phaseT = step * D.DOOR * 0.5; assert.ok(at(D.DOOR * 0.5), 'walking up to it');
  G.phaseT = step * D.DOOR + 0.001; G.update(0); assert.equal(G.phase, 'battle'); assert.ok(at(D.DOOR), 'fights from the doorway');
  assert.equal(W.pos.x, from.x, 'not in the room yet');
  for (const m of G.battle.mobs) m.hp = 1; G.S.gear.weapon = I.roll(50, { slot: 'weapon', rar: 2 }); G.recompute();
  for (let i = 0; i < 4000 && G.phase === 'battle'; i++) { G.battle.h.hp = G.battle.h.max; for (const m of G.battle.mobs) m.hp = Math.min(m.hp, 1); G.update(0.05); }
  assert.equal(G.phase, 'won'); assert.ok(at(D.DOOR), 'the walk in starts at the doorway'); assert.ok(G.wonT >= step * (1 - D.DOOR) - 1e-9);
  G.phaseT = G.wonT / 2; assert.ok(at(D.DOOR + (1 - D.DOOR) / 2), 'half-way in');
  G.phaseT = 0.0001; G.update(0.01); assert.equal(G.phase, 'idle'); assert.equal(W.pos.x, c.x); assert.equal(W.pos.y, c.y); assert.ok(near(G.tokenPos().x, c.x));
});
test('Ember dust is the one crafting material: what drops it, what it buys, and what old saves get for their orbs', (SW, G, D, I) => {
  const def = Object.values(D.MOB).find(m => !m.flee); let kills = 6000, hits = 0;
  for (let i = 0; i < kills; i++) { const d = G.dropsFor({ def, id: def.id, lvl: 20 }); assert.equal(d.orbs, undefined, 'nothing drops orbs'); if (d.mats) { assert.equal(d.mats.dust, D.DUST.kill); hits++; } }
  assert.ok(Math.abs(hits / kills - D.DUST.chance) < 0.015, 'an ordinary monster carries a pinch about 5% of the time: ' + hits / kills);
  assert.equal(G.dropsFor({ def, id: def.id, lvl: 20, minion: 1 }).mats, undefined, 'summoned minions carry none');
  assert.equal(G.dropsFor({ def, id: def.id, lvl: 20, elite: ['fast'] }).mats.dust, D.DUST.elite, 'an elite always carries some');
  // salvage pays dust for every rarity, more for better pieces
  const y = r => I.salvageYield(Object.assign(I.roll(30, { rar: r, slot: 'helm' }), { affixes: [] })); assert.equal(y(0).dust, 1); assert.equal(y(1).dust, 2); assert.equal(y(2).dust, 4); assert.equal(y(0).scrap, undefined);
  // one purse: masterworking and all four cube recipes cost dust and nothing else
  const S = G.S, it = I.roll(30, { rar: 2, slot: 'helm' }); S.bag[0] = it;
  for (const up of [0, 7, 8, 15, 16, 24, 25]) { it.up = up; assert.equal(Object.keys(I.upgradeCost(it)).join(), 'dust', 'masterwork at rank ' + up); } it.up = 0;
  for (const k of D.ORB_IDS) { assert.equal(Object.keys(I.cubeCost(k)).join(), 'dust'); assert.ok(D.ORBS[k].cost >= 1); }
  assert.equal(S.orbs, undefined); assert.equal(S.mats.scrap, undefined); assert.equal(Object.keys(G.fresh().mats).join(), 'dust,soul');
  S.gold = 0; S.mats = { dust: 0, soul: 0 }; assert.equal(G.cube(it.id, 'divine'), null, 'no dust, no cube'); assert.equal(G.upgrade(it.id), null, 'and no masterwork');
  S.mats.dust = D.ORBS.divine.cost + I.upgradeCost(it).dust; assert.ok(G.cube(it.id, 'divine')); assert.ok(G.upgrade(it.id), 'with no gold at all'); assert.equal(S.mats.dust, 0, 'both came out of the same purse');
  // an old save: orbs become what their recipe costs, three scrap make one dust
  const old = G.fresh(); delete old.curv; old.mats = { scrap: 31, dust: 5, soul: 2 }; old.orbs = { add: 4, remove: 1, chaos: 2, divine: 3 }; G.init(old);
  assert.equal(old.mats.dust, 5 + 10 + 4 * D.ORBS.add.cost + D.ORBS.remove.cost + 2 * D.ORBS.chaos.cost + 3 * D.ORBS.divine.cost); assert.equal(old.mats.soul, 2); assert.equal(old.orbs, undefined); assert.equal(old.mats.scrap, undefined);
  const d = old.mats.dust; G.init(old); assert.equal(old.mats.dust, d, 'only converted once');
});
test('A clicked route is followed in order, with Auto on or off, and can be laid through fog', (SW, G, D, I) => {
  const S = G.S, W = S.world, map = W.map; S.opts.auto = false;
  // carve a straight corridor of ordinary fights east of the camp so the walk is predictable
  const row = [1, 2, 3, 4].map(x => G.cell(x, 2)); row.forEach(c => { c.type = 'fight'; });
  assert.equal(G.routeToggle(row[2]), null, 'a tile out in the fog with nothing leading to it cannot be added');
  assert.equal(G.routeToggle(row[0]), 'added'); assert.equal(G.routeToggle(row[1]), 'added', 'next to a routed tile is enough'); assert.equal(G.routeToggle(row[2]), 'added');
  assert.equal(G.route.map(c => c.x).join(), '1,2,3');
  assert.equal(G.routeToggle(row[1]), 'removed'); assert.equal(G.route.map(c => c.x).join(), '1', 'what hung off the removed tile goes with it');
  G.routeToggle(row[1]); G.routeToggle(row[2]);
  S.gear.weapon = I.roll(50, { slot: 'weapon', rar: 2 }); S.gear.chest = I.roll(50, { slot: 'chest', rar: 2 }); G.recompute();
  const order = []; G.on((t, d) => { if (t === 'battleEnd' && d.win) order.push(G.target.x); });
  G.phase = 'idle'; G.phaseT = 0;
  for (let i = 0; i < 40000 && (G.route.length || G.phase !== 'idle'); i++) { if (G.battle) G.battle.h.hp = G.battle.h.max; G.update(0.05); }
  assert.equal(order.join(), '1,2,3', 'visited in the order clicked, without Auto'); assert.equal(G.route.length, 0); assert.equal(W.pos.x, 3);
  for (let i = 0; i < 200; i++) G.update(0.05); assert.equal(G.phase, 'idle', 'and then stops, because Auto is off');
  assert.equal(G.routeToggle(row[3]), 'added'); G.update(0.05); assert.equal(G.phase, 'travel'); assert.equal(G.routeToggle(row[3]), 'busy');
});
test('With no route, clicking a room while walking sends the smith there instead', (SW, G, D, I) => {
  const S = G.S, W = S.world; S.opts.auto = false;
  const near = (a, b) => Math.abs(a - b) < 1e-6, pos = () => G.tokenPos();
  // the camp is at (0,2); open two rooms, one above and one to the right
  const up = G.cell(0, 1), right = G.cell(1, 2); up.type = 'fight'; up.state = 'seen'; right.type = 'fight'; right.state = 'seen';
  assert.ok(G.enterCell(right)); assert.equal(G.route.length, 0, 'travelling with an empty route, as Auto does');
  const step = G.stepTime(); G.phaseT = step * 0.3; const before = pos(); assert.ok(near(before.x, 0.3));
  assert.equal(G.routeToggle(up), 'redirected'); assert.equal(G.target, up); assert.ok(G.route.length === 1 && G.route[0] === up);
  const after = pos(); assert.ok(near(after.x, before.x) && near(after.y, before.y), 'no jump when the course changes');
  G.update(step * 0.1); assert.ok(pos().x < before.x, 'walking back the way it came');
  for (let i = 0; i < 400 && G.phase === 'travel'; i++) G.update(0.05);
  assert.equal(G.phase, 'battle'); assert.equal(G.target, up); assert.ok(near(pos().x, 0) && near(pos().y, 2 - D.DOOR), 'at the doorway of the new room');
  assert.equal(right.state, 'seen', 'the first room was left alone');
});
test('A fall ends the run: a fresh map of the same level, everything kept, and the route cleared', (SW, G, D, I) => {
  const S = G.S; S.opts.auto = false; const a = G.cell(1, 2), b = G.cell(2, 2); a.type = b.type = 'fight'; a.state = 'seen';
  G.routeToggle(a); G.routeToggle(b); assert.equal(G.route.length, 2);
  S.gold = 777; S.bag[5] = I.roll(3, { rar: 1 }); const keep = S.bag[5].id, old = S.world.map; let rerun = null; G.on((type, d) => { if (type === 'rerun') rerun = d; });
  for (let i = 0; i < 4000 && G.phase !== 'battle'; i++) G.update(0.05);
  G.battle.h.hp = 0; G.battle.over = 'lose';
  for (let i = 0; i < 4000 && (G.phase === 'battle' || G.phase === 'dead'); i++) G.update(0.05);
  assert.equal(S.stats.deaths, 1); assert.equal(G.route.length, 0); assert.equal(G.phase, 'idle');
  assert.notEqual(S.world.map, old, 'a new map is drawn'); assert.equal(S.world.area, 0); assert.equal(S.world.pos.x, 0); assert.equal(S.world.map.cells.filter(c => c.state === 'done').length, 1, 'only the door is open');
  assert.equal(G.lifeFrac(), 1, 'at full Life'); assert.equal(S.gold, 777); assert.equal(S.bag[5].id, keep, 'with everything found so far');
  assert.ok(rerun && rerun.area === 0 && rerun.falls === 1); assert.equal(S.world.falls.n, 1);
});
test('Auto remembers a boss that beat it, and steps back a level after three runs that end at the door', (SW, G, D, I) => {
  const S = G.S, W = S.world; S.opts.auto = true; S.opts.full = false; W.cleared = [2]; G.startExpedition(1, 0, true);
  const fall = (pick) => { const c = pick(W.map); c.state = 'seen'; G.target = c; G.battle = new SW.Battle(G.C, {}, G.makeSpec(c), {}, false); G.battle.h.hp = 0; G.battle.over = 'lose'; G.phase = 'dead'; G.phaseT = 0; G.update(0.05); };
  // a fall to the boss: the next map knows, and a rushing Auto clears rooms before it tries again
  fall(m => m.cells.find(c => c.type === 'boss')); assert.equal(W.area, 1); assert.equal(W.map.bossFalls, 1);
  const pick = G.autoPick(); assert.notEqual(pick.type, 'boss'); assert.ok(pick.x <= 1, 'it starts with the nearest rooms');
  // three runs in a row ending in the first two columns: back a level
  let fb = null; G.on((type, d) => { if (type === 'fallback') fb = d; });
  fall(m => m.cells.find(c => c.x === 1 && c.type !== 'wall')); assert.equal(W.area, 1); fall(m => m.cells.find(c => c.x === 1 && c.type !== 'wall')); assert.equal(W.area, 1, 'two is not three');
  fall(m => m.cells.find(c => c.x === 3 && c.type !== 'wall')); assert.equal(W.falls.early, 0, 'a deeper run breaks the streak');
  for (let i = 0; i < 3; i++) fall(m => m.cells.find(c => c.x === 1 && c.type !== 'wall'));
  assert.equal(W.area, 0, 'stepped back'); assert.equal(fb.to, D.AREAS[0].name);
  // by hand, nothing steps back for you
  S.opts.auto = false; G.startExpedition(1, 0, true); for (let i = 0; i < 5; i++) fall(m => m.cells.find(c => c.x === 1 && c.type !== 'wall')); assert.equal(W.area, 1);
});
test('Five levels to a difficulty: one boss each, a level a room inside, a jump between, and old saves folded down', (SW, G, D, I) => {
  assert.equal(D.AREAS.length, 5); assert.ok(D.AREAS.every(a => a.final)); assert.equal(D.AREAS.map(a => a.lvl).join(), '1,10,20,30,40');
  for (let a = 0; a < 5; a++) { const m = G.genMap(a, 0), base = D.areaLevel(a, 0);
    for (const c of m.cells) assert.equal(c.lvl, base + c.x, 'one monster level a room deeper');
    const boss = m.cells.find(c => c.type === 'boss'), spec = (G.S.world.area = a, G.S.world.map = m, G.makeSpec(boss)); assert.equal(spec.boss, D.ACTS[a].boss); assert.equal(spec.waves.length, 1); assert.equal(spec.waves[0][0].lvl, base + 6);
    if (a < 4) assert.ok(D.areaLevel(a + 1, 0) >= base + 6 + 3, 'the next level starts at least three levels above this boss'); }
  for (let t = 1; t <= 4; t++) { const m = G.genMap(2, t); assert.equal(Math.min(...m.cells.map(c => c.lvl)), 50 + (t - 1) * 10 + 4); assert.equal(Math.max(...m.cells.map(c => c.lvl)), 50 + (t - 1) * 10 + 7, 'Torment climbs more gently'); }
  // an old save: fifteen areas become five levels
  const old = G.fresh(); delete old.lvlv; old.world.cleared = [15, 7]; old.world.tier = 1; old.world.area = 7; old.world.map = { stale: 1, cells: [] }; G.init(old);
  assert.equal(old.world.cleared.join(), '5,2'); assert.equal(old.world.area, 2); assert.ok(!old.world.map.stale && old.world.map.area === 2 && old.world.map.tier === 1); assert.equal(old.lvlv, 1);
  const mid = G.fresh(); delete mid.lvlv; mid.world.cleared = [4]; mid.world.area = 4; mid.world.map = null; G.init(mid); assert.equal(mid.world.cleared[0], 1); assert.equal(mid.world.area, 1);
});
test('Rares and Greater affixes come in gradually', (SW, G, D, I) => {
  const share = (lvl, o) => { const w = I.rarityWeights(lvl, 0, (o && o.tier) || 0, (o && o.boost) || 1), tot = w.reduce((a, b) => a + b, 0); return w.map(x => x / tot); };
  assert.equal(share(1)[2], 0); assert.equal(share(4)[2], 0, 'the first rooms drop Common and Magic and nothing else'); assert.ok(share(1)[0] > 0.6, 'mostly Common at the very start');
  assert.ok(share(7)[2] > 0 && share(7)[2] < 0.05, 'a first few by the end of level one: ' + share(7)[2]);
  let last = 0; for (const lvl of [7, 13, 23, 33, 43]) { const r = share(lvl)[2]; assert.ok(r > last, 'more Rares each level'); last = r; } assert.ok(last > 0.35 && last < 0.55, 'nearly half by the last level: ' + last);
  for (let lvl = 1; lvl <= 50; lvl++) assert.ok(share(lvl)[0] + share(lvl)[1] > 0.5 || lvl > 40);
  for (let i = 0; i < 300; i++) assert.ok(I.roll(1 + (i % 4), {}).rar <= 1);
  assert.equal(I.roll(7, { minRar: 2 }).rar, 2, 'a boss still pays a Rare, even where none drop'); for (let i = 0; i < 50; i++) assert.equal(I.roll(3, { minRar: 2 }).rar, 2);
  // Greater affixes: none before level 20, a trickle after, Torment in earnest
  assert.equal(I.greaterChance(0, 5), 0); assert.equal(I.greaterChance(0, 19), 0); assert.ok(I.greaterChance(0, 20) > 0); assert.ok(I.greaterChance(0, 45) > I.greaterChance(0, 25)); assert.ok(I.greaterChance(1, 50) > 2 * I.greaterChance(0, 50) - 1e-9);
  let g = 0; for (let i = 0; i < 1500; i++) g += I.greaterCount(I.roll(1 + (i % 19), { rar: 2 })); assert.equal(g, 0, 'no Greater affix drops in the first two levels');
  g = 0; for (let i = 0; i < 1500; i++) g += I.greaterCount(I.roll(45, { rar: 2 })); assert.ok(g > 60 && g < 320, 'some by the last level: ' + g);
  // the boss's first kill: a Rare, with a Greater affix from the third level on
  const first = (area, tier) => { const S = G.S; S.stats.bosses = {}; S.world.tier = tier; const id = D.ACTS[area].boss, d = G.dropsFor({ def: D.BOSSES[id], id, lvl: D.areaLevel(area, tier) + D.areaSpan(tier), boss: true }); assert.ok(d.first); return d.items[d.items.length - 1]; };
  for (let i = 0; i < 20; i++) { assert.equal(I.greaterCount(first(0, 0)), 0); assert.equal(I.greaterCount(first(1, 0)), 0); assert.ok(I.greaterCount(first(2, 0)) >= 1); assert.ok(I.greaterCount(first(0, 1)) >= 1); assert.equal(first(0, 0).rar, 2); }
});
test('A Unique can have one affix rerolled at the forge, and can be Tempered, but takes no other cube recipe', (SW, G, D, I) => {
  const S = G.S; S.gold = 1e12; S.mats = { dust: 999, soul: 999 }; S.mats.dust = 1e6;
  for (const u of D.UNIQUES) {
    const it = I.roll(50, { unique: u.id, rar: 3 }); S.bag[0] = it;
    assert.equal(it.uniq, u.id); const power = I.powerText(it), name = it.name, keys = it.affixes.map(a => a.k);
    for (let i = 0; i < it.affixes.length; i++) assert.ok(I.canEnchant(it, i), u.id + ': any one affix to begin with');
    assert.ok(G.enchant(it.id, 1), u.id); assert.equal(it.ench, 1); assert.equal(it.affixes.length, keys.length);
    assert.notEqual(it.affixes[1].k, keys[1], 'it becomes a different affix'); assert.ok(D.AFFIX[it.affixes[1].k].slots.includes(I.poolKey(it)), 'one its slot can roll'); assert.ok(!it.affixes[1].g, 'never Greater');
    assert.equal(new Set(it.affixes.map(a => a.k)).size, it.affixes.length, 'no doubles'); it.affixes.forEach((a, i) => { if (i !== 1) assert.equal(a.k, keys[i], 'the others are untouched'); });
    assert.equal(G.enchant(it.id, 0), null, 'only the affix first chosen, as on any gear'); assert.ok(G.enchant(it.id, 1), 'and that one again');
    assert.equal(it.name, name); assert.equal(I.powerText(it), power, 'its unique power is untouched'); assert.equal(it.rar, 3);
    for (const orb of ['add', 'remove', 'chaos']) assert.equal(G.cube(it.id, orb), null, u.id + ' refuses ' + orb);
    assert.ok(G.cube(it.id, 'divine'), 'Tempering still works');
  }
});
test('Techniques: two for every skill that can go on the bar, chosen freely, counted only while the skill is on the bar', (SW, G, D, I, H) => {
  const S = G.S, ids = new Set(), stats = new Set();
  for (const sk of D.SKILLS) {
    if (sk.type === 'passive') { assert.ok(!D.TECH[sk.id], sk.id); continue; }
    const list = D.TECH[sk.id]; assert.ok(list && list.length === 2, sk.id + ' needs two techniques');
    for (const t of list) { assert.ok(t.name && t.desc && t.stat, sk.id); assert.ok(!ids.has(t.id), 'duplicate id ' + t.id); ids.add(t.id); stats.add(t.rate[0]); assert.ok(t.rate[1] > 0); }
    assert.notEqual(list[0].stat, list[1].stat, sk.id + ': the two should pull toward different stats');
  }
  for (const k of ['aspd', 'crit', 'critDmg', 'vulnUp', 'dot', 'thorns', 'cdr', 'heat', 'barrier']) assert.ok(stats.has(k), 'no technique rewards ' + k);
  S.hero.bar = ['strike', 'sunder', null, null, null]; S.hero.tech = {}; G.recompute();
  assert.ok(G.setTech('strike', 'expose')); assert.equal(G.C.tech.strike, 'expose');
  assert.ok(G.setTech('strike', 'tempo')); assert.equal(G.C.tech.strike, 'tempo', 'choosing the other swaps');
  assert.ok(G.setTech('strike', 'tempo')); assert.equal(G.C.tech.strike, undefined, 'choosing it again takes it off');
  assert.equal(G.setTech('strike', 'rend'), false, "another skill's technique is refused"); assert.equal(G.setTech('heavy', 'x'), false);
  G.setTech('strike', 'expose'); G.setTech('quake', 'shatter'); assert.equal(G.C.tech.quake, undefined, 'Earthshaker is not on the bar, so its technique does nothing yet');
  S.hero.bar[2] = 'quake'; G.recompute(); assert.equal(G.C.tech.quake, 'shatter', 'and applies once it is');
  const copy = JSON.parse(JSON.stringify(S)); G.init(copy); assert.equal(G.S.hero.tech.strike, 'expose', 'saved with the game');
  const old = G.fresh(); delete old.hero.tech; G.init(old); assert.ok(G.S.hero.tech && !Object.keys(G.S.hero.tech).length, 'an old save simply has none');
});
test('Techniques do what they say in a fight', (SW, G, D, I, H) => {
  const S = G.S; S.gear.weapon = I.roll(30, { slot: 'weapon', base: 'sword', rar: 0 });
  // a fight against three immortal rats, with the dice fixed: st overrides let each case isolate one stat
  const fight = (bar, tech, st) => {
    S.hero.bar = bar.concat([null, null, null, null, null]).slice(0, 5); S.hero.tech = tech; G.recompute(); Object.assign(G.C.st, { crit: 0 }, st || {});
    SW.util.seed(7); const B = new SW.Battle(G.C, {}, { waves: [[{ id: 'rat', lvl: 1 }, { id: 'rat', lvl: 1 }, { id: 'rat', lvl: 1 }]], lvl: 1 }, {}, true);
    while (B.mobs.length < 3) B.step(0.05);
    B.mobs.sort((x, y) => x.slot - y.slot);                // mobs[0] is the one skills aim at
    for (const m of B.mobs) { m.hp = m.max = 1e12; m.dodge = 0; m.dmg = 0; } B.h.heat = 100; B.ev.length = 0;
    return B;
  };
  const lost = m => 1e12 - m.hp, near = (a, b, msg) => assert.ok(Math.abs(a / b - 1) < 0.02, `${msg}: ${a} against ${b}`);
  const cast = (B, id) => { SW.util.seed(11); B.cast(id, true); for (let i = 0; i < 80; i++) { const due = B.pending.filter(p => p.t <= 0); B.pending = B.pending.filter(p => p.t > 0); due.forEach(p => p.fn()); B.pending.forEach(p => { p.t -= 0.05; }); } };
  // Expose: Vulnerable from the first Strike, not the third
  let B = fight(['strike'], {}); cast(B, 'strike'); assert.ok(!(B.mobs[0].vulnT > 0));
  B = fight(['strike'], { strike: 'expose' }); cast(B, 'strike'); assert.ok(B.mobs[0].vulnT > 0, 'Expose');
  // Tempo: +1% Strike damage per 1% Attack Speed
  B = fight(['strike'], {}, { aspd: 40 }); cast(B, 'strike'); const plain = lost(B.mobs[0]);
  B = fight(['strike'], { strike: 'tempo' }, { aspd: 40 }); cast(B, 'strike'); near(lost(B.mobs[0]), plain * 1.4, 'Tempo');
  // Brutal: Critical Strike Damage counts double for Sunder
  B = fight(['sunder'], {}, { crit: 100, critDmg: 80 }); cast(B, 'sunder'); const s0 = lost(B.mobs[0]);
  B = fight(['sunder'], { sunder: 'brutal' }, { crit: 100, critDmg: 80 }); cast(B, 'sunder'); near(lost(B.mobs[0]), s0 * 2.6 / 1.8, 'Brutal');
  // Rend: the main target bleeds too, three times as hard
  B = fight(['sunder'], {}); cast(B, 'sunder'); assert.equal(B.mobs[0].bleeds.length, 0); const b0 = B.mobs[1].bleeds[0].dps;
  B = fight(['sunder'], { sunder: 'rend' }); cast(B, 'sunder'); assert.equal(B.mobs[0].bleeds.length, 1); near(B.mobs[1].bleeds[0].dps, b0 * 3, 'Rend');
  // Spiked Ground: Earthshaker adds 250% of Thorns to everyone
  B = fight(['quake'], {}, { thorns: 400 }); cast(B, 'quake'); const q0 = lost(B.mobs[2]);
  B = fight(['quake'], { quake: 'spikes' }, { thorns: 400 }); cast(B, 'quake'); assert.ok(lost(B.mobs[2]) - q0 > 400 * 2.5 * 0.5, 'Spiked Ground adds thorns damage');
  // Shatter: longer stun, and Vulnerable
  B = fight(['quake'], { quake: 'shatter' }); cast(B, 'quake'); assert.ok(B.mobs[1].vulnT > 0 && B.mobs[1].stunT > 1.5, 'Shatter');
  // Relentless and Bulwark change cooldowns; Bulwark also raises the trigger
  B = fight(['meteor', 'ironskin'], {}, { cdr: 20 }); assert.equal(Math.round(B.cdOf(D.SKILL.meteor)), 36); const ic = B.cdOf(D.SKILL.ironskin);
  B.h.hp = B.h.max * 0.8; B.autoCasts(); assert.ok(!(B.h.barrier > 0), 'Iron Skin waits for 60% without Bulwark');
  B = fight(['meteor', 'ironskin'], { meteor: 'relentless', ironskin: 'bulwark' }, { cdr: 20 }); assert.equal(Math.round(B.cdOf(D.SKILL.meteor)), 27, 'Relentless'); near(B.cdOf(D.SKILL.ironskin), ic - 5, 'Bulwark cooldown');
  B.h.hp = B.h.max * 0.8; B.autoCasts(); assert.ok(B.h.barrier > 0, 'Bulwark goes up below 90%');
  // Aftermath
  B = fight(['meteor'], { meteor: 'aftermath' }); cast(B, 'meteor'); assert.ok(B.mobs.every(m => m.vulnT >= 5.9), 'Aftermath');
  // Smoulder, Deep Brand, Magma: stronger burns
  B = fight(['cinder'], {}); cast(B, 'cinder'); const c0 = B.mobs[0].burns[0].dps;
  B = fight(['cinder'], { cinder: 'smoulder' }); cast(B, 'cinder'); near(B.mobs[0].burns[0].dps, c0 * 2, 'Smoulder');
  B = fight(['brand'], {}, { dot: 50 }); cast(B, 'brand'); const d0 = B.mobs[0].burns[0].dps;
  B = fight(['brand'], { brand: 'deep' }, { dot: 50 }); cast(B, 'brand'); near(B.mobs[0].burns[0].dps, d0 * 1.5, 'Deep Brand');
  // Bellows: +2% Cinder damage per 1% Heat Generation
  B = fight(['cinder'], {}, { heat: 30 }); cast(B, 'cinder'); const h0 = lost(B.mobs[0]);
  B = fight(['cinder'], { cinder: 'bellows' }, { heat: 30 }); cast(B, 'cinder'); near(lost(B.mobs[0]), h0 * 1.6, 'Bellows');
  // Scorch and Flashfire
  B = fight(['wave'], { wave: 'scorch' }); cast(B, 'wave'); assert.ok(B.mobs.every(m => m.vulnT > 0), 'Scorch');
  B = fight(['wave'], { wave: 'flashfire' }, { critDmg: 100 }); cast(B, 'wave'); const w1 = lost(B.mobs[0]); B.mobs[0].hp = 1e12; cast(B, 'wave'); assert.ok(lost(B.mobs[0]) > w1 * 1.6, 'Flashfire crits what is already burning');
  // Detonate: doubled and critical against a burning target
  B = fight(['brand'], { brand: 'detonate' }, { critDmg: 100 }); cast(B, 'brand'); const f1 = lost(B.mobs[0]); B.mobs[0].hp = 1e12; cast(B, 'brand'); assert.ok(lost(B.mobs[0]) > f1 * 3.2, 'Detonate');
  // Storm: Static, Flurry, Fork, Skewer, Piercing, Gale, Thunderhead, Live Wire, Capacitor
  B = fight(['jab'], { jab: 'static' }, { crit: 100 }); cast(B, 'jab'); assert.ok(B.mobs[0].vulnT > 0, 'Static');
  const hits = B2 => B2.ev.filter(e => e.e === 'hit' && !e.dot).length;
  B = fight(['jab'], {}, { crit: 100 }); cast(B, 'jab'); assert.equal(hits(B), 2);
  B = fight(['jab'], { jab: 'flurry' }, { crit: 100 }); cast(B, 'jab'); assert.equal(hits(B), 3, 'Flurry adds a third jab on a crit');
  B = fight(['jab'], { jab: 'flurry' }, { crit: -100 }); cast(B, 'jab'); assert.equal(hits(B), 2, 'and not otherwise');
  B = fight(['chain'], {}, { crit: 100 }); cast(B, 'chain'); const arcs = hits(B);
  B = fight(['chain'], { chain: 'fork' }, { crit: 100 }); cast(B, 'chain'); assert.equal(hits(B), arcs + 3, 'Fork');
  B = fight(['lance'], {}, { crit: 100, critDmg: 100 }); cast(B, 'lance'); const l0 = lost(B.mobs[0]);
  B = fight(['lance'], { lance: 'skewer' }, { crit: 100, critDmg: 100 }); cast(B, 'lance'); near(lost(B.mobs[0]), l0 * 1.5, 'Skewer');
  B = fight(['lance'], { lance: 'piercing' }, { vuln: 40 }); cast(B, 'lance'); assert.ok(B.mobs[0].vulnT > 3.5, 'Piercing leaves it Vulnerable');
  B = fight(['tempest'], {}, { aspd: 40 }); cast(B, 'tempest'); assert.equal(hits(B), 12);
  B = fight(['tempest'], { tempest: 'gale' }, { aspd: 40 }); cast(B, 'tempest'); assert.equal(hits(B), 17, 'Gale: one more bolt per 8% Attack Speed');
  B = fight(['tempest'], { tempest: 'thunderhead' }, { crit: 100 }); B.h.cds.tempest = 45; cast(B, 'tempest'); assert.equal(Math.round(B.h.cds.tempest), 33, 'Thunderhead: a second off per critical bolt');
  B = fight(['overcharge', 'jab'], { overcharge: 'livewire' }, { crit: 100 }); B.h.buffs.overcharge = { t: 6, v: 30 }; cast(B, 'jab'); near(B.h.buffs.overcharge.t, 6.6, 'Live Wire');
  B = fight(['overcharge', 'lance'], {}, { crit: 100, critDmg: 50, aspd: 50 }); B.h.buffs.overcharge = { t: 6, v: 30 }; cast(B, 'lance'); const o0 = lost(B.mobs[0]);
  B = fight(['overcharge', 'lance'], { overcharge: 'capacitor' }, { crit: 100, critDmg: 50, aspd: 50 }); B.h.buffs.overcharge = { t: 6, v: 30 }; cast(B, 'lance'); near(lost(B.mobs[0]), o0 * 2 / 1.5, 'Capacitor');
  // Stoked, White Heat, Barbs
  B = fight(['forgeheart', 'wave'], { forgeheart: 'stoked' }); B.h.cds.forgeheart = 10; cast(B, 'wave'); assert.equal(B.h.cds.forgeheart, 8.5, 'Stoked');
  B = fight(['forgeheart', 'cinder'], { forgeheart: 'whiteheat' }, { crit: 85, critDmg: 100 }); B.h.buffs.forgeheart = { t: 7, v: 0 }; let crits = 0; SW.util.seed(3); for (let i = 0; i < 300; i++) { B.lastCrit = false; B.hit(B.mobs[0], 100, 'fire', {}); if (B.lastCrit) crits++; } assert.equal(crits, 300, 'White Heat: 85% + 15% always crits');
});
test('Choosing a technique changes which gear looks better', (SW, G, D, I, H) => {
  const S = G.S; S.gear.weapon = I.roll(40, { slot: 'weapon', base: 'sword', rar: 0 }); S.hero.bar = ['strike', 'sunder', null, null, null];
  const ring = k => { const r = I.roll(40, { rar: 2, slot: 'ring' }); r.affixes = [{ k, r: 0.9, g: 0 }]; return r; };
  const gain = (tech, k) => { S.hero.tech = tech; S.gear.ring1 = null; G.recompute(); const base = G.C.rating.off; S.gear.ring1 = ring(k); G.recompute(); return G.C.rating.off / base; };
  assert.ok(gain({ strike: 'expose' }, 'vuln') > gain({}, 'vuln') * 1.02, 'Expose makes Vulnerable Damage worth more');
  assert.ok(gain({ strike: 'tempo' }, 'aspd') > gain({}, 'aspd') * 1.02, 'Tempo makes Attack Speed worth more');
  assert.ok(gain({ sunder: 'brutal' }, 'critDmg') > gain({}, 'critDmg') * 1.002, 'Brutal makes Critical Strike Damage worth more');
  assert.ok(gain({ sunder: 'rend' }, 'dot') > gain({}, 'dot') * 1.02, 'Rend makes Burn/Bleed Damage worth something to a Hammer bar');
  // and so the better ring flips with the technique
  const vuln = ring('vuln'), speed = ring('aspd'), pick = tech => { S.hero.tech = tech; S.gear.ring1 = vuln; G.recompute(); const a = G.C.rating.power; S.gear.ring1 = speed; G.recompute(); return a > G.C.rating.power ? 'vuln' : 'aspd'; };
  assert.equal(pick({ strike: 'tempo' }), 'aspd');
});
test('The same Unique cannot be worn twice', (SW, G, D, I) => {
  const S = G.S, u1 = I.roll(40, { unique: 'coil', rar: 3 }), u2 = I.roll(40, { unique: 'coil', rar: 3 }), u3 = I.roll(40, { unique: 'coil', rar: 3 }); S.bag[6] = u1; S.bag[7] = u2; S.bag[8] = u3;
  assert.ok(G.equip(u1.id)); assert.equal(S.gear.ring1, u1);
  assert.equal(G.equip(u2.id, 'ring2'), false, 'a second copy cannot go on the other ring'); assert.ok(/only be worn once/.test(G.equipWhy(u2.id, 'ring2'))); assert.equal(G.isUpgrade(u2), true, 'though the empty ring slot still marks it');
  assert.ok(G.equip(u2.id), 'the second copy replaces the first'); assert.equal([S.gear.ring1, S.gear.ring2].filter(x => x && x.uniq === 'coil').length, 1);
  const other = D.UNIQUES.find(u => u.id !== 'coil' && D.BASES[u.base].slot === 'ring');
  if (other) { const o = I.roll(50, { unique: other.id, rar: 3 }); S.bag[9] = o; assert.ok(G.equip(o.id, 'ring2'), 'a different Unique is fine'); assert.ok(G.unequip('ring2')); }
  // ordinary gear is never restricted, however alike
  const a = I.roll(40, { rar: 2, slot: 'ring' }), b = I.roll(40, { rar: 2, slot: 'ring' }); b.affixes = JSON.parse(JSON.stringify(a.affixes)); S.gear.ring1 = null; S.gear.ring2 = null; S.bag[10] = a; S.bag[11] = b;
  assert.equal(G.powerKey(a), null); assert.ok(G.equip(a.id)); assert.ok(G.equip(b.id)); assert.ok(S.gear.ring1 && S.gear.ring2);
});
test('Transfiguring: the last step, with Diablo 4\'s odds, and it seals the piece', (SW, G, D, I) => {
  const S = G.S; S.gold = 1e15; S.mats = { dust: 1e6, soul: 1e6 }; S.mats.dust = 1e6;
  const leg = anc => { const it = I.roll(50, { rar: 2, slot: 'ring', anc }); it.affixes = [{ k: 'life', r: 0.5, g: 0 }, { k: 'crit', r: 0.5, g: 0 }, { k: 'firePct', r: 0.5, g: 0 }, { k: 'heat', r: 0.5, g: 0 }]; return it; };
  const uniq = anc => I.roll(50, { unique: 'coil', rar: 3, anc });
  // who may: anything, whatever its rarity, and it costs
  for (const rar of [0, 1, 2]) { const x = I.roll(50, { rar, slot: 'ring' }); S.bag[0] = x; assert.equal(I.transfigCheck(x), null); assert.equal(I.tfKind(x), 'gear'); assert.ok(G.transfigure(x.id), D.RARITY[rar].name + ' gear can be transfigured'); }
  // a Common piece has nothing to replace or make Greater, so those outcomes turn into a new affix or quality, and a gained affix makes it Magic
  const plainForce = (it, kind) => { const real = SW.util.wpick; SW.util.wpick = (arr, wf) => (arr === D.TRANSFIG_KINDS ? kind : real(arr, wf)); const r = I.transfigure(it); SW.util.wpick = real; return r; };
  let cm = I.roll(50, { rar: 0, slot: 'helm' }); assert.equal(plainForce(cm, 'replace').kind, 'affix'); assert.equal(cm.affixes.length, 1); assert.equal(cm.rar, 1, 'a Common with an affix is Magic');
  cm = I.roll(50, { rar: 0, slot: 'helm', anc: true }); assert.equal(plainForce(cm, 'greater').kind, 'quality'); assert.equal(cm.rar, 0);
  const mg = I.roll(50, { rar: 1, slot: 'helm' }); mg.affixes = mg.affixes.slice(0, 1); plainForce(mg, 'affix'); assert.equal(mg.rar, 1); mg.sealed = 0; plainForce(mg, 'affix'); assert.equal(mg.affixes.length, 3); assert.equal(mg.rar, 2, 'three affixes make a Rare');
  const a = leg(false); S.bag[0] = a; const gold = S.gold; assert.ok(G.transfigure(a.id)); assert.ok(S.gold < gold, 'it costs gold'); assert.equal(a.tf.length, 1);
  // the odds follow the table, for each kind of item
  const makers = { gear: () => leg(false), uniq: () => uniq(false), ancGear: () => leg(true), ancUniq: () => uniq(true) };
  for (const kind in makers) {
    const n = {}, N = 6000; let open = 0;
    for (let i = 0; i < N; i++) { const it = makers[kind](); assert.equal(I.tfKind(it), kind); const r = I.transfigure(it); n[r.kind] = (n[r.kind] || 0) + 1; if (r.open) open++; assert.equal(it.sealed, r.open ? 0 : 1); }
    const odds = D.TRANSFIG[kind], tot = D.TRANSFIG_KINDS.reduce((x, k) => x + odds[k], 0);
    for (const k of D.TRANSFIG_KINDS) assert.ok(Math.abs((n[k] || 0) / N - odds[k] / tot) < 0.02, `${kind} ${k}: ${((n[k] || 0) / N * 100).toFixed(1)}% against ${odds[k]}%`);
    assert.ok(Math.abs(open / N - odds.open / 100) < 0.012, `${kind} stays open ${(open / N * 100).toFixed(1)}%`);
    if (!kind.startsWith('anc')) assert.ok(!n.greater, 'only Ancestral gear can have an affix made Greater');
  }
  assert.equal(D.TRANSFIG.gear.greater, 0); assert.equal(D.TRANSFIG.ancGear.greater, 28); assert.equal(D.TRANSFIG.gear.replace, 13); assert.equal(D.TRANSFIG.gear.open, 4);
  // what each outcome does (the dice are steered to pick it)
  const force = (it, kind) => { const real = SW.util.wpick; SW.util.wpick = (arr, wf) => (arr === D.TRANSFIG_KINDS ? kind : real(arr, wf)); const r = I.transfigure(it); SW.util.wpick = real; return r; };
  let it = leg(false), base = I.implicit(it).life, v0 = I.affixValue(it, it.affixes[0], 0);
  let r = force(it, 'quality'); assert.ok(r.v >= 1 && r.v <= 15); assert.equal(it.tq, r.v); assert.ok(Math.abs(I.implicit(it).life / base - (1 + r.v / 100)) < 0.01, 'Item Quality lifts the main stat'); assert.ok(I.affixValue(it, it.affixes[0], 0) >= v0);
  it = leg(false); base = I.implicit(it).life; const before = JSON.stringify(I.stats(it)); force(it, 'indes'); assert.ok(it.indes); assert.equal(I.implicit(it).life, base); assert.equal(JSON.stringify(I.stats(it)), before, 'Indestructible changes nothing');
  it = leg(false); r = force(it, 'affix'); assert.equal(it.affixes.length, 5); assert.equal(r.idx, 4); assert.ok(it.affixes[4].t && !it.affixes[4].g); assert.equal(new Set(it.affixes.map(x => x.k)).size, 5, 'a fifth affix it did not have');
  let off = 0; for (let i = 0; i < 300; i++) { const x = leg(false); force(x, 'affix'); if (!D.AFFIX[x.affixes[4].k].slots.includes('ring')) off++; } assert.ok(off > 20, 'and often one a ring could never roll: ' + off);
  it = leg(true); it.affixes[0].g = 1; r = force(it, 'greater'); assert.ok(r.idx > 0 && it.affixes[r.idx].g === 1, 'an ordinary affix becomes Greater'); assert.equal(I.greaterCount(it), 2);
  it = leg(true); for (const x of it.affixes) x.g = 1; r = force(it, 'greater'); assert.equal(r.kind, 'quality', 'with nothing left to make Greater it gives quality instead');
  it = leg(false); const keys = it.affixes.map(x => x.k); r = force(it, 'replace'); assert.equal(it.affixes.length, 4); assert.ok(r.was && it.affixes[r.idx].k !== keys[r.idx] && it.affixes[r.idx].t, 'one affix is swapped for a new one'); assert.equal(it.affixes.filter((x, i) => x.k === keys[i]).length, 3);
  // sealed means sealed
  it = leg(false); S.bag[0] = it; it.up = 10; do { it.sealed = 0; it.tf = []; force(it, 'quality'); } while (!it.sealed);
  assert.equal(G.upgrade(it.id), null, 'no masterworking'); assert.equal(G.enchant(it.id, 0), null, 'no reroll');
  for (const orb of ['add', 'remove', 'chaos', 'divine']) assert.equal(G.cube(it.id, orb), null, 'no ' + orb); assert.equal(G.transfigure(it.id), null, 'and no second transfiguration');
  assert.ok(/sealed/.test(I.cubeCheck(it, 'divine')) && /sealed/.test(I.upgradeCheck(it)));
  assert.ok(G.equip(it.id), 'it can still be worn'); assert.ok(G.unequip('ring1')); assert.equal(G.salvage(it.id), true, 'and salvaged');
  // the rare one that stays open can be worked on and transfigured again
  it = leg(false); S.bag[0] = it; do { it.sealed = 0; it.tf = []; it.tq = 0; force(it, 'quality'); } while (it.sealed);
  assert.ok(G.upgrade(it.id), 'still open: masterworking works'); const q = it.tq; assert.ok(G.transfigure(it.id), 'and so does a second transfiguration'); assert.equal(it.tf.length, 2); assert.ok(it.tq >= q);
});
test('Cooldown Reduction rolls on rings and amulets, at the same value on both', (SW, G, D, I) => {
  for (const k of ['ring', 'amulet', 'helm', 'shield', 'lantern']) assert.ok(D.AFFIX.cdr.slots.includes(k), k);
  const S = G.S; S.mats.dust = 1e6; let got = 0;
  for (let i = 0; i < 300; i++) { const r = I.roll(40, { rar: 0, slot: 'ring' }); S.bag[0] = r; G.cube(r.id, 'add', 'util'); assert.ok(['cdr', 'heat', 'regen'].includes(r.affixes[0].k)); if (r.affixes[0].k === 'cdr') got++; }
  assert.ok(got > 40, 'a ring aimed at Utility can come up Cooldown Reduction: ' + got);
  const val = slot => { const it = I.roll(50, { rar: 2, slot }); it.affixes = [{ k: 'cdr', r: 0.5, g: 0 }]; return I.affixValue(it, it.affixes[0], 0); };
  assert.equal(val('ring'), val('amulet'));
});
test('A single damage type rolls only a little higher than all-damage', (SW, G, D, I) => {
  const top = k => { const it = I.roll(50, { rar: 2, slot: 'ring' }); return I.affixValue(it, { k, r: 0.9999, g: 0 }, 0); }, low = k => { const it = I.roll(50, { rar: 2, slot: 'ring' }); return I.affixValue(it, { k, r: 0, g: 0 }, 0); };
  for (const k of ['physPct', 'firePct', 'lightPct']) { assert.ok(top(k) > top('dmgPct') && top(k) <= top('dmgPct') * 1.25, `${k} tops out at ${top(k)} against ${top('dmgPct')}`); assert.ok(low(k) > low('dmgPct') && low(k) <= low('dmgPct') * 1.25); }
  assert.equal(top('physPct'), top('firePct')); assert.equal(top('firePct'), top('lightPct'));
});
test('Rerolling an affix gets dearer gently and levels off', (SW, G, D, I) => {
  const it = I.roll(40, { slot: 'ring', rar: 2 }), first = I.enchantCost(it).gold;
  let prev = first;
  for (let n = 1; n <= 30; n++) { it.enchN = n; const c = I.enchantCost(it).gold; assert.ok(c >= prev && c <= prev * 1.45, `step ${n}: ${prev} -> ${c}`); prev = c; }
  assert.ok(prev <= first * 5.05, 'never more than five times the first price'); assert.ok(I.enchantCost(it).dust <= 5);
});
test('Masterworking cannot be bought without the materials', (SW, G, D, I) => {
  const it = I.roll(20, { slot: 'ring', rar: 2 }); G.S.bag[0] = it; G.S.gold = 0;
  assert.equal(G.upgrade(it.id), null); assert.equal(it.up, 0);
});
test('Enchanting locks the item to one affix slot', (SW, G, D, I) => {
  const it = I.roll(20, { slot: 'ring', rar: 2 }); G.S.bag[0] = it; G.S.gold = 1e9; G.S.mats.dust = 99;
  const before = it.affixes[1].k;
  assert.ok(G.enchant(it.id, 1)); assert.notEqual(it.affixes[1].k, before);
  assert.equal(G.enchant(it.id, 0), null, 'a different affix is refused'); assert.ok(G.enchant(it.id, 1));
});
test('Soulsteel comes from Uniques, Greater affixes and Ancestral gear', (SW, G, D, I) => {
  const rare = I.roll(20, { slot: 'ring', rar: 2 }); rare.affixes.forEach(a => { a.g = 0; });
  assert.equal(I.salvageYield(rare).soul, undefined, 'an ordinary Rare has none'); assert.ok(I.salvageYield(rare).dust >= 2);
  rare.affixes[0].g = 1; assert.equal(I.salvageYield(rare).soul, 1); rare.affixes[1].g = 1; assert.equal(I.salvageYield(rare).soul, 2, 'one for each Greater affix');
  const anc = I.roll(50, { slot: 'ring', rar: 2, anc: true }); anc.affixes.forEach(a => { a.g = 0; }); assert.equal(I.salvageYield(anc).soul, 1, 'and one for being Ancestral');
  assert.equal(I.salvageYield(I.roll(50, { unique: 'coil', rar: 3 })).soul, 3);
  G.S.bag[0] = rare; G.S.mats = { dust: 0, soul: 0 }; assert.ok(G.salvage(rare.id)); assert.equal(G.S.mats.soul, 2); assert.equal(G.S.codex, undefined, 'there is no Codex to learn into');
  // a boss's first kill pays a Rare that always has one
  for (let i = 0; i < 60; i++) { const it = I.roll(30, { rar: 2, greater: 1 }); assert.ok(I.greaterCount(it) >= 1); }
});
test('Old saves: Legendaries become Rares that keep their affixes, Uniques keep their powers, the Codex goes', (SW, G, D, I) => {
  const S = G.fresh(); delete S.rarv; S.mwv = 1; S.codex = { twin: 0.8 }; S.stats.leg = 7; S.opts.salv = [true, false, true, true];
  const leg = I.roll(40, { slot: 'gloves', rar: 2 }); leg.rar = 3; leg.aspect = { id: 'twin', r: 0.8 }; leg.name = 'Twinned Grips'; leg.up = 12; leg.mw = []; const keys = leg.affixes.map(a => a.k + a.r).join();
  const uq = I.roll(40, { unique: 'coil', rar: 3 }); uq.rar = 4; const power = I.powerText(uq), rare = I.roll(40, { slot: 'helm', rar: 2 }), rn = rare.name;
  S.gear.gloves = leg; S.bag[0] = uq; S.stash[0] = rare; G.init(S);
  assert.equal(leg.rar, 2); assert.equal(leg.aspect, undefined); assert.equal(leg.affixes.map(a => a.k + a.r).join(), keys, 'its affixes are untouched'); assert.equal(leg.up, 12); assert.notEqual(leg.name, 'Twinned Grips');
  assert.equal(uq.rar, 3); assert.equal(uq.uniq, 'coil'); assert.equal(I.powerText(uq), power); assert.equal(rare.rar, 2); assert.equal(rare.name, rn);
  assert.equal(S.codex, undefined); assert.equal(S.opts.salv.join(), 'true,false,true'); assert.equal(S.rarv, 1);
  assert.equal(I.cubeCheck(leg, 'remove'), null, 'and what was a Legendary can be cubed again');
  const name = leg.name; G.init(S); assert.equal(leg.rar, 2); assert.equal(leg.name, name, 'only converted once'); assert.equal(uq.rar, 3);
  assert.equal(G.fresh().rarv, 1); assert.equal(G.fresh().opts.salv.length, 3);
});
test('Locked items are never salvaged', (SW, G, D, I) => {
  const it = I.roll(5, { rar: 0, slot: 'boots' }); G.S.gear.boots = I.roll(50, { rar: 2, slot: 'boots' }); G.recompute();
  G.S.bag[0] = it; it.lock = 1; G.refreshUpgrades();
  assert.equal(G.salvage(it.id), false); assert.equal(G.salvageAll(4), 0); assert.ok(G.S.bag[0]);
});
test('The auto-salvage filter keeps upgrades and melts the rest', (SW, G, D, I) => {
  G.S.opts.salv = [true, true, false, false];
  assert.equal(G.addItem(I.roll(1, { rar: 1, slot: 'helm' })), 'bag', 'an empty slot is always an upgrade');
  G.equip(G.S.bag.find(Boolean).id);
  G.S.gear.helm = I.roll(40, { rar: 2, slot: 'helm' }); G.recompute();
  assert.equal(G.addItem(I.roll(1, { rar: 0, slot: 'helm' })), 'salvaged');
  assert.equal(G.addItem(I.roll(1, { rar: 2, slot: 'helm' })), 'bag', 'rares are not filtered');
});
test('A full bag salvages the new drop and leaves the bag alone', (SW, G, D, I) => {
  for (let i = 0; i < D.BAG_SIZE; i++) G.S.bag[i] = I.roll(10, { rar: 0, slot: 'boots' });
  const before = G.S.bag.map(b => b.id).join(), leg = I.roll(10, { rar: 2, slot: 'ring', greater: 1 }), soul = G.S.mats.soul, g = I.greaterCount(leg);
  assert.equal(G.addItem(leg), 'salvaged'); assert.equal(G.S.bag.map(b => b.id).join(), before, 'nothing in the bag changed');
  assert.equal(G.S.mats.soul, soul + g, 'its materials are kept');
  G.S.bag[5] = null; assert.equal(G.addItem(I.roll(10, { rar: 1, slot: 'ring' })), 'bag', 'a free slot is used again');
});
test('Skills need no points: pick five and three passives, one Basic and one Ultimate', (SW, G, D) => {
  const h = G.S.hero;
  G.clearSkills(); assert.equal(h.bar.filter(Boolean).length, 0);
  for (const id of ['strike', 'sunder', 'quake', 'meteor', 'wave']) assert.equal(G.toggleSkill(id), null);
  assert.ok(G.toggleSkill('chain'), 'a sixth skill is refused with a reason'); assert.ok(!h.bar.includes('chain'));
  assert.equal(G.toggleSkill('cinder'), null); assert.ok(h.bar.includes('cinder') && !h.bar.includes('strike'), 'a second Basic replaces the first');
  assert.equal(G.toggleSkill('tempest'), null); assert.ok(h.bar.includes('tempest') && !h.bar.includes('meteor'), 'a second Ultimate replaces the first');
  for (const id of ['heavy', 'kindling', 'conduct']) assert.equal(G.toggleSkill(id), null);
  assert.ok(G.toggleSkill('crush'), 'a fourth passive is refused');
  assert.equal(G.toggleSkill('heavy'), null); assert.ok(!h.passives.includes('heavy')); assert.equal(G.C.ranks.heavy, undefined);
});
test('Skill ranks come only from gear', (SW, G, D, I) => {
  const S = G.S; S.hero.bar = ['strike', 'cinder', null, null, null]; S.hero.bar[1] = null; S.hero.bar[1] = 'wave'; G.recompute();
  assert.equal(G.C.ranks.strike, 1); assert.equal(G.C.ranks.wave, 1);
  const helm = I.roll(20, { rar: 2, slot: 'helm' }); helm.affixes = [{ k: 'skHammer', r: 0.99, g: 0 }]; S.gear.helm = helm; G.recompute();
  assert.equal(G.C.ranks.strike, 3, 'Hammer gear raises Hammer skills'); assert.equal(G.C.ranks.wave, 1, 'and leaves Ember alone');
  assert.equal(G.C.ranks.sunder, undefined, 'skills that are not picked stay off');
});
test('Stat caps hold', (SW, G, D, I) => {
  const S = G.S;
  for (const s of D.SLOTS) { const it = I.roll(200, { rar: 2, slot: s.replace(/\d/, '') }); it.affixes = [{ k: 'crit', r: 1, g: 1 }, { k: 'dodge', r: 1, g: 1 }, { k: 'dr', r: 1, g: 1 }, { k: 'cdr', r: 1, g: 1 }]; it.up = 25; S.gear[s] = it; }
  G.recompute(); const st = G.C.st;
  assert.ok(st.crit <= 75 && st.dodge <= 60 && st.dr <= 50 && st.cdr <= 60);
});
test('There are no levels: life and power come from what is worn', (SW, G, D, I, H) => {
  const S = G.S;
  assert.equal(S.hero.level, undefined); assert.equal(G.addXp, undefined);
  for (const s of D.SLOTS) S.gear[s] = null; G.recompute();
  assert.equal(G.C.st.maxLife, H.BASE_LIFE); const naked = G.C.rating.power;
  S.gear.ring1 = I.roll(30, { rar: 0, slot: 'ring' }); S.gear.helm = I.roll(10, { rar: 0, slot: 'helm' }); G.recompute();
  assert.ok(G.C.st.maxLife > H.BASE_LIFE + 100, 'rings carry life'); assert.ok(G.C.st.armor > 0, 'armour carries armor'); assert.ok(G.C.rating.power > naked);
  assert.equal(H.gearLevel(S.gear), 20);
});
test('Drops favour the slots that have fallen behind', (SW, G, D, I) => {
  const S = G.S;
  for (const s of D.SLOTS) S.gear[s] = I.roll(40, { rar: 2, slot: s.replace(/\d/, '') });
  S.gear.boots = I.roll(5, { rar: 0, slot: 'boots' });
  let boots = 0; for (let i = 0; i < 2000; i++) if (G.rollLoot(40, { rar: 1 }).slot === 'boots') boots++;
  assert.ok(boots > 2000 * 0.25, 'boots came up ' + boots + ' times in 2000');
});
test('The cube: Kindle adds an affix and lifts rarity, up to four', (SW, G, D, I) => {
  const S = G.S, it = I.roll(20, { rar: 0, slot: 'gloves' }); S.bag[0] = it; S.mats.dust = 9 * D.ORBS.add.cost;
  assert.equal(it.affixes.length, 0);
  assert.ok(G.cube(it.id, 'add')); assert.equal(it.rar, 1, 'Common becomes Magic'); assert.equal(it.affixes.length, 1);
  G.cube(it.id, 'add'); assert.equal(it.rar, 1); G.cube(it.id, 'add'); assert.equal(it.rar, 2, 'a third affix makes it Rare');
  G.cube(it.id, 'add'); assert.equal(it.affixes.length, 4);
  assert.equal(G.cube(it.id, 'add'), null, 'no fifth affix'); assert.equal(S.mats.dust, 5 * D.ORBS.add.cost, 'a refused recipe costs nothing');
  assert.equal(new Set(it.affixes.map(a => a.k)).size, 4);
  for (const a of it.affixes) assert.ok(D.AFFIX[a.k].slots.includes('gloves'));
});
test('The cube: Quench removes one affix and keeps the bookkeeping straight', (SW, G, D, I) => {
  let it; do { it = I.roll(50, { rar: 2, slot: 'chest' }); } while (it.affixes.length < 4);
  const S = G.S; S.bag[0] = it; S.mats.dust = 9 * D.ORBS.remove.cost;
  it.ench = 3; it.mw = [3]; const keys = it.affixes.map(a => a.k);
  SW.util.rng = () => 0;                                   // always removes the first affix
  const res = G.cube(it.id, 'remove');
  assert.ok(res.removed.length > 3); assert.equal(it.affixes.length, 3); assert.equal(it.affixes[0].k, keys[1]);
  assert.equal(it.ench, 2); assert.equal(it.mw.join(), '2'); assert.equal(it.rar, 2, 'rarity stays');
  { const d = S.mats.dust; S.mats.dust = D.ORBS.add.cost - 1; assert.equal(G.cube(it.id, 'add'), null, 'not enough dust, no transmute'); assert.equal(it.affixes.length, 3); S.mats.dust = d; }
  // the affix rerolled at the forge is never the one taken, aimed or not
  const enchKey = it.affixes[2].k; assert.equal(I.removable(it).join(), '0,1');
  G.cube(it.id, 'remove'); G.cube(it.id, 'remove'); assert.equal(it.affixes.length, 1); assert.equal(it.affixes[0].k, enchKey); assert.equal(it.ench, 0);
  assert.equal(G.cube(it.id, 'remove'), null, 'with only that affix left there is nothing to remove'); assert.ok(/left alone/.test(I.cubeCheck(it, 'remove'))); assert.equal(S.mats.dust, 6 * D.ORBS.remove.cost);
  const fam = D.AFFIX[enchKey].cats[0]; if (I.slotCats(it).includes(fam)) assert.ok(/left alone/.test(I.cubeCheck(it, 'remove', fam)), 'aimed at its own type too');
  it.ench = -1; assert.ok(G.cube(it.id, 'remove'), 'an ordinary last affix can go'); assert.equal(it.affixes.length, 0);
});
test('The cube: Recast rerolls every affix except the one rerolled at the forge', (SW, G, D, I) => {
  const S = G.S; S.mats.dust = 1e6;
  let it; do { it = I.roll(50, { rar: 2, slot: 'ring' }); } while (it.affixes.length < 4);
  it.affixes[1] = { k: 'crit', r: 0.77, g: 1 }; it.affixes = it.affixes.filter((a, i) => i === 1 || a.k !== 'crit'); it.ench = 1; S.bag[0] = it; const n = it.affixes.length;
  let changed = 0;
  for (let i = 0; i < 60; i++) { const before = it.affixes.map(a => a.k + a.r).join(), res = G.cube(it.id, 'chaos'); assert.ok(res); assert.ok(!res.idxs.includes(1));
    assert.equal(it.affixes.length, n); assert.equal(it.affixes[1].k, 'crit'); assert.equal(it.affixes[1].r, 0.77); assert.equal(it.affixes[1].g, 1, 'kept exactly, Greater and all'); assert.equal(it.ench, 1);
    assert.equal(new Set(it.affixes.map(a => a.k)).size, n, 'and never duplicated by a new roll'); if (it.affixes.map(a => a.k + a.r).join() !== before) changed++; }
  assert.equal(changed, 60, 'the others are new every time');
  it.affixes = [it.affixes[1]]; it.ench = 0; assert.equal(G.cube(it.id, 'chaos'), null); assert.ok(/left alone/.test(I.cubeCheck(it, 'chaos')));
  it.ench = -1; assert.ok(G.cube(it.id, 'chaos'), 'with nothing rerolled at the forge, everything melts as before');
});
test('Affix pools: slot-limited like Diablo, and every slot can be aimed at two types or more', (SW, G, D, I) => {
  const keys = ['weapon', 'shield', 'lantern', 'helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring'];
  const pool = k => Object.values(D.AFFIX).filter(a => a.slots.includes(k));
  for (const k of keys) {
    assert.ok(pool(k).length >= 7, `${k} has only ${pool(k).length} affixes to roll`);
    const types = Object.keys(D.AFFIX_CAT).filter(c => pool(k).filter(a => a.cats.includes(c)).length >= 2);
    assert.ok(types.length >= 2, k + ' can only be aimed at ' + types);
  }
  for (const a of Object.values(D.AFFIX)) for (const sl of a.slots) assert.ok(keys.includes(sl), a.id + ' lists an unknown slot ' + sl);
  const on = (id, k) => D.AFFIX[id].slots.includes(k);
  for (const k of ['helm', 'chest', 'pants', 'shield', 'boots']) for (const id of ['crit', 'critDmg', 'aspd', 'vuln']) assert.ok(!on(id, k), id + ' must not roll on ' + k);
  assert.ok(on('crit', 'weapon') && on('aspd', 'weapon'), 'weapons roll crit chance and attack speed');
  assert.ok(on('vuln', 'gloves') && !on('vuln', 'weapon'), 'Vulnerable is on gloves, not weapons');
  assert.equal(D.AFFIX.move.slots.join(), 'boots', 'Movement Speed is boots only');
  assert.equal(pool('boots').filter(a => a.cat === 'off').map(a => a.id).join(), 'str', 'the only offence boots carry is Strength');
  assert.ok(!on('armor', 'ring') && !on('armor', 'amulet') && !on('dr', 'gloves'));
  // shields and lanterns draw from different pools
  for (let i = 0; i < 300; i++) {
    const sh = I.roll(30, { slot: 'offhand', base: 'shield', rar: 2 }), la = I.roll(30, { slot: 'offhand', base: 'lantern', rar: 2 });
    for (const a of sh.affixes) assert.ok(on(a.k, 'shield'), a.k + ' on a shield'); for (const a of la.affixes) assert.ok(on(a.k, 'lantern'), a.k + ' on a lantern');
  }
});
test('Movement Speed on boots shortens the walk between tiles', (SW, G, D, I) => {
  const S = G.S, base = G.stepTime(); assert.equal(base, D.TRAVEL_STEP);
  const boots = I.roll(10, { rar: 2, slot: 'boots' }); boots.affixes = [{ k: 'move', r: 0.99, g: 0 }]; S.gear.boots = boots; G.recompute();
  assert.ok(G.C.st.move >= 29); assert.ok(G.stepTime() < base * 0.8, 'at least a fifth faster');
  // walking three tiles really does take less game time
  const walk = () => { G.startExpedition(0, 0); const m = S.world.map; for (const c of m.cells) if (c.y === 2 && c.x <= 3) { c.type = c.x ? 'fight' : 'start'; c.state = c.x < 3 ? 'done' : 'seen'; }
    G.phaseT = 0; assert.ok(G.enterCell(G.cell(3, 2))); let t = 0; while (G.phase === 'travel' && t < 60) { G.update(0.01); t += 0.01; } return t; };
  const fast = walk(); S.gear.boots = null; G.recompute(); const slow = walk();
  assert.ok(fast < slow * 0.82, `${fast.toFixed(2)}s with boots against ${slow.toFixed(2)}s without`);
});
test('The comparison counts stats only: a Unique power never outweighs real damage', (SW, G, D, I, H) => {
  const S = G.S, plain = I.roll(20, { rar: 2, slot: 'ring' }), uq = I.roll(40, { unique: 'coil', rar: 3 });
  plain.affixes = [{ k: 'dmgPct', r: 0.5, g: 0 }, { k: 'dodge', r: 0.5, g: 0 }]; uq.ilvl = 20; uq.affixes = [{ k: 'dodge', r: 0.5, g: 0 }, { k: 'heat', r: 0.5, g: 0 }];
  const withIt = it => H.compute(S, Object.assign({}, S.gear, { ring1: it })).rating;
  assert.ok(withIt(plain).off > withIt(uq).off, 'the piece with +damage rates as more damage');
  const bare = I.roll(20, { rar: 2, slot: 'ring' }); bare.affixes = uq.affixes.map(a => Object.assign({}, a));
  assert.equal(withIt(uq).off, withIt(bare).off, 'the power itself adds nothing to the estimate');
  // cooldown reduction only counts when something on the bar has a cooldown worth shortening
  const cdr = I.roll(20, { rar: 2, slot: 'amulet' }); cdr.affixes = [{ k: 'cdr', r: 0.9, g: 0 }];
  const none = I.roll(20, { rar: 0, slot: 'amulet' });
  S.hero.bar = ['strike', 'sunder', null, null, null]; assert.equal(withIt(cdr).off, withIt(none).off);
  S.hero.bar = ['strike', 'sunder', 'meteor', null, null]; assert.ok(withIt(cdr).off > withIt(none).off);
  // swapping in a much higher-level piece must not make armor look worse
  const hi = I.roll(90, { rar: 0, slot: 'amulet' }); assert.ok(withIt(hi).def >= withIt(none).def);
});
test('Strength is the main stat: every slot can roll it and each point multiplies all damage by 1%', (SW, G, D, I, H) => {
  const S = G.S;
  for (const k of ['weapon', 'shield', 'lantern', 'helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring']) assert.ok(D.AFFIX.str.slots.includes(k), k);
  assert.equal(D.AFFIX.str.cats.join(), 'off,skill', 'Offence and Skills');
  S.gear.weapon = I.roll(30, { slot: 'weapon', base: 'sword', rar: 0 }); G.recompute(); const off0 = G.C.rating.off;
  const helm = I.roll(30, { rar: 2, slot: 'helm' }); helm.affixes = [{ k: 'str', r: 0.9999, g: 0 }]; S.gear.helm = helm; G.recompute();
  const v = I.affixValue(helm, helm.affixes[0], 0); assert.ok(v >= 3 && v <= 7, 'between 3 and 7 a piece: ' + v); assert.equal(G.C.st.str, v);
  assert.ok(Math.abs(G.C.rating.off / off0 - (1 + v / 100)) < 0.002, 'the estimate rises by exactly that much');
  // and the same in a real fight: identical swings, with and without it
  const swing = () => { SW.util.seed(5); const B = new SW.Battle(G.C, {}, { waves: [[{ id: 'rat', lvl: 1 }]], lvl: 1 }, {}, true); while (!B.mobs.length) B.step(0.05); const m = B.mobs[0]; m.hp = m.max = 1e9; m.dodge = 0; SW.util.seed(9); B.hit(m, 100, 'phys', {}); return 1e9 - m.hp; };
  const withStr = swing(); S.gear.helm = null; G.recompute(); const without = swing();
  assert.ok(without > 0 && Math.abs(withStr / without - (1 + v / 100)) < 0.03, `${withStr} against ${without}`);
});
test('Affix values depend on the slot: defence pays more where offence competes, amulets beat rings', (SW, G, D, I) => {
  const val = (base, k, r) => { const it = I.roll(50, Object.assign({ rar: 2 }, base)); it.affixes = [{ k, r: r == null ? 0.5 : r, g: 0 }]; return I.affixValue(it, it.affixes[0], 0); };
  const near = (a, b, f, msg) => assert.ok(Math.abs(a - b * f) <= Math.max(0.6, b * f * 0.035),      // within rounding of a whole number
    `${msg}: ${a} / ${b} = ${(a / b).toFixed(3)}, wanted ${f}`);
  near(val({ slot: 'gloves' }, 'life'), val({ slot: 'chest' }, 'life'), 1.5, 'life on gloves'); near(val({ slot: 'gloves' }, 'armor'), val({ slot: 'chest' }, 'armor'), 1.5, 'armor on gloves');
  near(val({ slot: 'weapon' }, 'life'), val({ slot: 'chest' }, 'life'), 2, 'life on a weapon'); near(val({ slot: 'weapon' }, 'str', 0.9999), val({ slot: 'helm' }, 'str', 0.9999), 2, 'Strength on a weapon');
  near(val({ slot: 'ring' }, 'life'), val({ slot: 'chest' }, 'life'), 1.25, 'life on a ring');
  for (const k of ['dmgPct', 'firePct', 'critDmg', 'dot']) near(val({ slot: 'amulet' }, k), val({ slot: 'ring' }, k), 1.5, k + ' on an amulet against a ring');
  near(val({ slot: 'amulet' }, 'str', 0.9999), val({ slot: 'ring' }, 'str', 0.9999), 1.5, 'Strength on an amulet'); near(val({ slot: 'amulet' }, 'lifePct'), val({ slot: 'chest' }, 'lifePct'), 1.5, '% life on an amulet');
  // the flat ones are the same wherever they roll
  for (const r of [0, 0.5, 0.9999]) {
    assert.equal(val({ slot: 'amulet' }, 'aspd', r), val({ slot: 'ring' }, 'aspd', r)); assert.equal(val({ slot: 'weapon' }, 'aspd', r), val({ slot: 'gloves' }, 'aspd', r));
    assert.equal(val({ slot: 'amulet' }, 'cdr', r), val({ slot: 'helm' }, 'cdr', r)); assert.equal(val({ slot: 'amulet' }, 'cdr', r), val({ slot: 'offhand', base: 'shield' }, 'cdr', r));
    assert.equal(val({ slot: 'amulet' }, 'skHammer', r), val({ slot: 'helm' }, 'skHammer', r));
  }
  // baseline slots are untouched, and offence on a weapon or ring is not inflated
  assert.equal(val({ slot: 'helm' }, 'life'), val({ slot: 'chest' }, 'life')); assert.equal(val({ slot: 'weapon' }, 'critDmg'), val({ slot: 'ring' }, 'critDmg')); assert.equal(val({ slot: 'gloves' }, 'critDmg'), val({ slot: 'ring' }, 'critDmg'));
  // the range shown on the piece moves with it
  const am = I.roll(50, { rar: 2, slot: 'amulet' }); am.affixes = [{ k: 'dmgPct', r: 0.5, g: 0 }]; const rg = I.roll(50, { rar: 2, slot: 'ring' }); rg.affixes = [{ k: 'dmgPct', r: 0.5, g: 0 }];
  assert.notEqual(I.affixRange(am, am.affixes[0], 0), I.affixRange(rg, rg.affixes[0], 0));
});
test('Flask Healing, Gold Find, Magic Find and Orb Find are gone, and old gear has them rerolled', (SW, G, D, I) => {
  for (const k of ['flask', 'gold', 'mf', 'orbFind']) assert.ok(!D.AFFIX[k], k);
  const S = G.fresh(); delete S.afxv;
  const boots = I.roll(40, { rar: 2, slot: 'boots' }); boots.affixes = [{ k: 'move', r: 0.5, g: 0 }, { k: 'gold', r: 0.7, g: 1 }, { k: 'mf', r: 0.2, g: 0 }, { k: 'orbFind', r: 0.4, g: 0 }];
  S.gear.boots = boots; G.init(S);
  assert.equal(boots.affixes.length, 4); assert.equal(boots.affixes[0].k, 'move'); assert.equal(boots.affixes[1].g, 1, 'a greater affix stays greater');
  for (const a of boots.affixes) assert.ok(D.AFFIX[a.k] && D.AFFIX[a.k].slots.includes('boots'), a.k);
  assert.equal(new Set(boots.affixes.map(a => a.k)).size, 4, 'no doubles'); assert.equal(S.afxv, 1);
});
test('The cube can be aimed at an affix type, for adding and for removing', (SW, G, D, I) => {
  const S = G.S; S.mats.dust = 1e6;
  for (const cat of ['off', 'def', 'util', 'skill']) for (let i = 0; i < 30; i++) {
    const it = I.roll(30, { rar: 0, slot: 'helm' }); S.bag[0] = it;
    assert.ok(G.cube(it.id, 'add', cat)); assert.ok(I.inCat(it.affixes[0].k, cat), 'asked for ' + cat);
    assert.ok(D.AFFIX[it.affixes[0].k].slots.includes('helm'));
  }
  const boots = I.roll(30, { rar: 0, slot: 'boots' }); S.bag[0] = boots;
  assert.equal(G.cube(boots.id, 'add', 'skill'), null, 'boots cannot roll skill ranks'); assert.equal(S.mats.dust, 1e6 - 120 * D.ORBS.add.cost, 'and nothing is spent');
  const it = I.roll(30, { rar: 2, slot: 'helm' }); it.affixes = [{ k: 'life', r: 0.5, g: 0 }, { k: 'skEmber', r: 0.5, g: 0 }, { k: 'armor', r: 0.5, g: 0 }]; S.bag[0] = it;
  assert.equal(G.cube(it.id, 'remove', 'off'), null, 'nothing offensive to remove');
  assert.ok(G.cube(it.id, 'remove', 'skill')); assert.equal(it.affixes.map(a => a.k).join(), 'life,armor');
  assert.ok(G.cube(it.id, 'remove', 'def')); assert.equal(it.affixes.length, 1);
  for (const k in D.AFFIX) assert.ok(D.AFFIX_CAT[D.AFFIX[k].cat], k + ' has no type');
});
test('Cube types: four of them, a few affixes in two, and none that holds only what a build wants', (SW, G, D, I) => {
  const S = G.S; S.mats.dust = 1e6;
  assert.equal(Object.keys(D.AFFIX_CAT).join(), 'off,def,util,skill');
  for (const k in D.AFFIX) { assert.ok(D.AFFIX[k].cats.length >= 1 && D.AFFIX[k].cats.length <= 2, k); assert.equal(D.AFFIX[k].cat, D.AFFIX[k].cats[0]); }
  const two = Object.keys(D.AFFIX).filter(k => D.AFFIX[k].cats.length === 2).sort().join();
  assert.equal(two, 'barrier,regen,str,thorns'); assert.equal(D.AFFIX.thorns.cats.join(), 'off,util'); assert.equal(D.AFFIX.regen.cats.join(), 'def,util'); assert.equal(D.AFFIX.barrier.cats.join(), 'def,util');
  assert.equal(D.AFFIX_CAT.util.keys.slice().sort().join(), 'barrier,cdr,heat,move,regen,thorns');
  // a slot only offers a type it has two or more affixes for
  const offered = base => I.slotCats(I.roll(30, Object.assign({ rar: 0 }, base))).join();
  assert.equal(offered({ slot: 'weapon' }), 'off,def'); assert.equal(offered({ slot: 'offhand', base: 'shield' }), 'off,def,util'); assert.equal(offered({ slot: 'offhand', base: 'lantern' }), 'off,util');
  assert.equal(offered({ slot: 'helm' }), 'off,def,util,skill'); assert.equal(offered({ slot: 'chest' }), 'off,def,util'); assert.equal(offered({ slot: 'gloves' }), 'off,def,util,skill');
  assert.equal(offered({ slot: 'pants' }), 'off,def,util'); assert.equal(offered({ slot: 'boots' }), 'def,util'); assert.equal(offered({ slot: 'amulet' }), 'off,def,util,skill'); assert.equal(offered({ slot: 'ring' }), 'off,def,util');
  const boots = I.roll(30, { rar: 0, slot: 'boots' }); S.bag[0] = boots; assert.equal(G.cube(boots.id, 'add', 'off'), null, 'boots have one Offence affix, so Offence cannot be aimed at');
  // no type is a sure thing for a build: each offered type on each slot has something a hammer build would not pick
  const wanted = ['str', 'dmgPct', 'physPct', 'crit', 'critDmg', 'aspd', 'vuln', 'life', 'lifePct', 'armor', 'armorPct', 'dr', 'cdr', 'heat', 'skHammer'];
  for (const base of [{ slot: 'weapon' }, { slot: 'offhand', base: 'shield' }, { slot: 'offhand', base: 'lantern' }, { slot: 'helm' }, { slot: 'chest' }, { slot: 'gloves' }, { slot: 'pants' }, { slot: 'boots' }, { slot: 'amulet' }, { slot: 'ring' }]) {
    const it = I.roll(30, Object.assign({ rar: 0 }, base)), key = I.poolKey(it);
    for (const c of I.slotCats(it)) { const ks = I.affixPool(key, [], c).map(a => a.id); assert.ok(ks.some(k => !wanted.includes(k)), `${key} ${c} is all good: ${ks}`); }
  }
  // the clever removal: regen shares Defence with life and armor, but stands alone in Utility
  for (let i = 0; i < 40; i++) {
    const chest = I.roll(40, { rar: 2, slot: 'chest' }); chest.affixes = [{ k: 'life', r: 0.5, g: 0 }, { k: 'armor', r: 0.5, g: 0 }, { k: 'regen', r: 0.5, g: 0 }]; S.bag[0] = chest;
    assert.ok(G.cube(chest.id, 'remove', 'util')); assert.equal(chest.affixes.map(a => a.k).join(), 'life,armor');
  }
  // and Strength can be chased through Skills where the slot has skill ranks
  let got = 0; for (let i = 0; i < 400; i++) { const helm = I.roll(40, { rar: 0, slot: 'helm' }); S.bag[0] = helm; G.cube(helm.id, 'add', 'skill'); assert.ok(['str', 'skHammer', 'skEmber', 'skStorm'].includes(helm.affixes[0].k)); if (helm.affixes[0].k === 'str') got++; }
  assert.ok(got > 60 && got < 340, 'Strength is one of four outcomes there, not a certainty: ' + got);
});
test('Greater affixes come from drops only: no cube orb and no forge reroll can make one', (SW, G, D, I) => {
  const S = G.S; let n = 0, g = 0;
  for (let i = 0; i < 4000; i++) { const it = I.roll(45, { rar: 2 }); n += it.affixes.length; g += I.greaterCount(it); }
  assert.ok(g / n > 0.015 && g / n < 0.05, 'about 3% at the end of the campaign, got ' + (g / n * 100).toFixed(1) + '%');
  assert.ok(I.greaterChance(3, 50) > I.greaterChance(0, 50) * 2, 'likelier in Torment');
  const it = I.roll(20, { rar: 1, slot: 'ring' }); it.affixes = [{ k: 'life', r: 0.5, g: 0 }];
  const plain = I.affixValue(it, it.affixes[0], 0); it.affixes[0].g = 1;
  const top = I.affixValue(it, { k: 'life', r: 0.9999, g: 0 }, 0);
  assert.ok(Math.abs(I.affixValue(it, it.affixes[0], 0) / top - 1.5) < 0.02, 'Greater is the maximum roll and half again');
  const vals = new Set(); for (const r of [0, 0.2, 0.5, 0.8, 0.9999]) { it.affixes[0].r = r; vals.add(I.affixValue(it, it.affixes[0], 0)); } assert.equal(vals.size, 1, 'one value only: ' + [...vals]);
  for (let i = 0; i < 3000; i++) { const d = I.roll(50, { rar: 2, tier: 4 }); d.affixes.forEach((a, k) => { if (a.g && !D.AFFIX[a.k].int) { const mx = I.affixValue(d, { k: a.k, r: 0.9999, g: 0 }, k); assert.ok(I.affixValue(d, a, k) >= mx * 1.5 - Math.max(0.6, mx * 0.05), `${a.k} dropped Greater at ${I.affixValue(d, a, k)}, max ordinary ${mx}`); } }); }
  it.affixes[0].r = 0.5;
  // crafting with dice that always crit
  S.bag[0] = it; S.mats.dust = 1e6; it.affixes[0].g = 0;
  const real = SW.util.rng; SW.util.rng = () => 0.001;
  const res = G.cube(it.id, 'add'); assert.ok(!res.crit && !it.affixes[1].g, 'Kindling never rolls Greater');
  G.cube(it.id, 'chaos'); assert.equal(I.greaterCount(it), 0, 'nor does Slag');
  assert.ok(!G.cube(it.id, 'divine').crit); assert.equal(I.greaterCount(it), 0, 'nor does Tempering');
  S.gold = 1e12; S.mats.dust = 9999; for (let k = 0; k < 20; k++) { G.enchant(it.id, 0); assert.equal(I.greaterCount(it), 0, 'nor does the forge reroll'); }
  // what is already Greater: Tempering keeps it, a forge reroll gives it up
  for (const a of it.affixes) a.g = 1; const was = it.affixes.map(a => a.k).join();
  const dustBefore = S.mats.dust; assert.equal(G.cube(it.id, 'divine'), null, 'with every affix Greater there is nothing for Tempering to do'); assert.equal(S.mats.dust, dustBefore, 'and nothing is spent');
  assert.ok(it.affixes.every(a => a.g) && it.affixes.map(a => a.k).join() === was);
  G.enchant(it.id, 0); assert.equal(it.affixes[0].g, 0, 'the rerolled affix is ordinary'); assert.equal(it.affixes[1].g, 1, 'the others are untouched');
  S.world.cleared = [5]; G.startExpedition(4, 0, true);      // the last level: Greater affixes drop there
  for (let k = 0; k < 2000; k++) { const c = G.commission('ring'); if (c && I.greaterCount(c)) { g = -1; break; } S.bag.fill(null); S.bag[0] = it; }
  assert.equal(g, -1, 'a commissioned piece is a fresh roll, so it can still come with one');
  SW.util.rng = real;
});
test('Uniques cannot be cubed, but can be enchanted and Tempered; everything else can be cubed', (SW, G, D, I) => {
  const S = G.S, u = I.roll(30, { rar: 3, unique: 'coil', slot: 'ring' }), rare = I.roll(30, { rar: 2, slot: 'gloves' });
  u.affixes.forEach(a => { a.g = 0; }); S.bag[0] = u; S.bag[1] = rare; S.gold = 1e9; S.mats = { dust: 99, soul: 99 };
  const keys = u.affixes.map(a => a.k).join();
  for (const orb of ['add', 'remove', 'chaos']) for (const cat of [null, 'off', 'def']) assert.equal(G.cube(u.id, orb, cat), null, orb);
  assert.equal(u.affixes.map(a => a.k).join(), keys); assert.equal(S.mats.dust, 99, 'nothing was spent');
  assert.ok(G.cube(u.id, 'divine'), 'Tempering rerolls its numbers'); assert.equal(u.affixes.map(a => a.k).join(), keys);
  assert.ok(G.enchant(u.id, 1), 'the forge can enchant one affix'); assert.notEqual(u.affixes.map(a => a.k).join(), keys);
  assert.equal(G.enchant(u.id, 0), null, 'and only that one'); assert.equal(u.uniq, 'coil');
  assert.ok(G.upgrade(u.id), 'masterworking works too');
  // a Rare stays cubable whatever is done to it, and keeps its name
  const name = rare.name;
  assert.ok(G.cube(rare.id, 'remove')); assert.ok(G.cube(rare.id, 'add')); assert.ok(G.enchant(rare.id, 0)); assert.ok(G.upgrade(rare.id));
  assert.ok(G.cube(rare.id, 'remove')); assert.ok(G.cube(rare.id, 'add')); assert.equal(rare.rar, 2); assert.equal(rare.name, name);
});
test('Tempering leaves Greater affixes and the forge-rerolled affix alone', (SW, G, D, I) => {
  const S = G.S; S.mats.dust = 1e6;
  const it = I.roll(40, { rar: 2, slot: 'ring' }); it.affixes = [{ k: 'life', r: 0.11, g: 0 }, { k: 'crit', r: 0.22, g: 1 }, { k: 'firePct', r: 0.33, g: 0 }, { k: 'heat', r: 0.44, g: 0 }]; it.ench = 2; S.bag[0] = it;
  assert.equal(I.temperable(it).join(), '0,3');
  for (let i = 0; i < 50; i++) { const res = G.cube(it.id, 'divine'); assert.ok(res); assert.equal(res.idxs.join(), '0,3'); assert.equal(it.affixes[1].r, 0.22, 'the Greater affix is untouched'); assert.equal(it.affixes[2].r, 0.33, 'so is the affix rerolled at the forge'); }
  assert.ok(it.affixes[0].r !== 0.11 && it.affixes[3].r !== 0.44, 'the others did change');
  assert.equal(it.affixes.map(a => a.k).join(), 'life,crit,firePct,heat'); assert.equal(it.ench, 2);
  it.affixes = [{ k: 'crit', r: 0.5, g: 1 }, { k: 'firePct', r: 0.5, g: 0 }]; it.ench = 1; assert.ok(/left alone/.test(I.cubeCheck(it, 'divine'))); assert.equal(G.cube(it.id, 'divine'), null);
});
test('The cube: Slag rerolls every affix, Tempering only the numbers, and Uniques resist', (SW, G, D, I) => {
  const S = G.S, it = I.roll(30, { rar: 2, slot: 'ring' }), u = I.roll(30, { rar: 3, unique: 'coil', slot: 'ring' });
  S.bag[0] = it; S.bag[1] = u; S.mats.dust = 1e6;
  const keys = it.affixes.map(a => a.k).join(), rolls = it.affixes.map(a => a.r).join();
  G.cube(it.id, 'divine'); assert.equal(it.affixes.map(a => a.k).join(), keys); assert.notEqual(it.affixes.map(a => a.r).join(), rolls);
  const n = it.affixes.length; G.cube(it.id, 'chaos'); assert.equal(it.affixes.length, n);
  for (const orb of ['add', 'remove', 'chaos']) assert.equal(G.cube(u.id, orb), null, orb + ' must not touch a Unique');
  const ur = u.affixes.map(a => a.r).join(); assert.ok(G.cube(u.id, 'divine')); assert.notEqual(u.affixes.map(a => a.r).join(), ur);
  assert.equal(u.affixes.map(a => a.k).join(), D.UNIQUE.coil.affixes.join());
});
test('Bag items can be moved and swapped, and gear dropped into the bag', (SW, G, D, I) => {
  const S = G.S, a = I.roll(5, { slot: 'boots', rar: 1 }), b = I.roll(5, { slot: 'ring', rar: 1 });
  S.bag[0] = a; S.bag[1] = b;
  assert.ok(G.moveItem(a.id, 'bag', 10)); assert.equal(S.bag[10], a); assert.equal(S.bag[0], null);
  assert.ok(G.moveItem(b.id, 'bag', 10)); assert.equal(S.bag[10], b); assert.equal(S.bag[1], a, 'dropping on an item swaps them');
  assert.equal(G.moveItem(a.id, 'bag', 99), false);
  const worn = S.gear.chest; assert.ok(G.moveItem(worn.id, 'bag', 5)); assert.equal(S.bag[5], worn); assert.equal(S.gear.chest, null);
  assert.equal(G.moveItem(S.gear.weapon.id, 'bag', 10), false, 'worn gear only swaps with its own kind');
  assert.ok(G.moveItem(b.id, 'stash', 3)); assert.equal(S.stash[3], b); assert.equal(S.bag[10], null);
  G.sortBag(); assert.equal(S.bag.length, D.BAG_SIZE); assert.ok(S.bag[0] && S.bag[1] && !S.bag[2]); assert.equal(S.stash[3], b, 'sorting the bag leaves the stash alone');
});
test('The stash keeps gear safe: salvage, sort and the full-bag rule never touch it', (SW, G, D, I) => {
  const S = G.S, keep = I.roll(8, { slot: 'boots', rar: 0 }), junk = I.roll(8, { slot: 'boots', rar: 0 });
  S.gear.boots = I.roll(60, { slot: 'boots', rar: 2 }); G.recompute();
  S.bag[0] = keep; S.bag[1] = junk; G.refreshUpgrades();
  assert.equal(S.stash.length, D.STASH_SIZE);
  assert.ok(G.stashToggle(keep.id)); assert.equal(S.stash[0], keep); assert.equal(S.bag[0], null);
  assert.equal(G.salvage(keep.id), false); assert.equal(G.salvageAll(4), 1); assert.equal(S.stash[0], keep, 'salvage-all skips the stash');
  for (let i = 0; i < D.BAG_SIZE; i++) S.bag[i] = I.roll(5, { rar: 0, slot: 'helm' });
  assert.equal(G.stashToggle(keep.id), false, 'no room in the bag, so it stays put');
  assert.ok(G.moveItem(keep.id, 'stash', 9)); assert.equal(S.stash[9], keep);
  S.mats.dust = 9; assert.ok(G.cube(keep.id, 'add'), 'stashed gear can be crafted in place'); assert.equal(keep.affixes.length, 1);
  const worn = S.gear.boots; assert.ok(G.equip(keep.id)); assert.equal(S.gear.boots, keep); assert.equal(S.stash[9], worn, 'the swapped-out piece takes its place in the stash');
});
test('The damage meter adds up to the damage dealt and ignores overkill', (SW, G, D) => {
  const B = new SW.Battle(G.C, {}, { waves: [[{ id: 'rat', lvl: 1 }, { id: 'wolf', lvl: 1 }, { id: 'bandit', lvl: 1 }]], lvl: 1 }, {}, false);
  const hp = B.spec.waves[0].reduce((t, s) => t + B.mkMob(s).max, 0);
  while (!B.over) B.step(0.05);
  const bs = B.summary(), sum = Object.values(bs.by).reduce((a, b) => a + b, 0);
  assert.equal(B.over, 'win'); assert.equal(sum, bs.dmg); assert.equal(bs.dmg, hp, 'damage counted equals the life removed');
  assert.ok(bs.ft > 0 && bs.ft <= bs.t); assert.ok(bs.by.strike > 0);
  G.record(bs); assert.equal(G.meter.length, 1);
});
test('A fresh smith beats a rat and loses to an act boss', (SW, G, D) => {
  const run = spec => { const B = new SW.Battle(G.C, {}, spec, {}, false); let t = 0; while (!B.over && t < 400) { B.step(0.05); t += 0.05; } return B; };
  assert.equal(run({ waves: [[{ id: 'rat', lvl: 1 }]], lvl: 1 }).over, 'win');
  assert.equal(run({ waves: [[{ id: 'vulkar', lvl: 50, boss: true }]], lvl: 50, boss: 'vulkar' }).over, 'lose');
});
test('No battle can stall: every fight ends, even hopeless ones against healers', (SW, G, D) => {
  for (let i = 0; i < 60; i++) {
    const act = D.ACTS[i % 5], lvl = 5 + i;
    const spec = { waves: [act.mobs.map(id => ({ id, lvl })), [{ id: act.mobs[2], lvl, elite: ['vampiric', 'shielded', 'stoneskin'], champ: true }, { id: act.mobs[4], lvl }]], lvl };
    const B = new SW.Battle(G.C, {}, spec, {}, false); let t = 0;
    while (!B.over && t < 300) { B.step(0.05); t += 0.05; }
    assert.ok(B.over, 'battle still running after 300s');
  }
});
test('Every skill can be cast without errors and deals damage', (SW, G, D) => {
  const S = G.S;
  for (const sk of D.SKILLS.filter(s => s.type !== 'passive')) {
    S.hero.bar = sk.type === 'basic' ? [sk.id, null, null, null, null] : ['strike', sk.id, null, null, null];
    G.recompute();
    const B = new SW.Battle(G.C, { heat: 100 }, { waves: [[{ id: 'golem', lvl: 1 }, { id: 'bat', lvl: 1 }, { id: 'kobold', lvl: 1 }]], lvl: 1 }, {}, true);
    B.h.hp = B.h.max * 0.5;                       // lets defensive skills trigger
    for (let t = 0; t < 12 && !B.over; t += 0.05) B.step(0.05);
    assert.ok(B.ev.some(e => e.e === 'cast' && e.id === sk.id), sk.id + ' was never used');
    assert.ok(B.dmgDone > 0 && isFinite(B.dmgDone));
  }
});
test('Every unique power runs in battle without breaking the numbers', (SW, G, D, I) => {
  const S = G.S; S.hero.bar = ['cinder', 'sunder', 'chain', 'forgeheart', 'meteor']; S.hero.passives = ['kindling', 'aftershock', 'crush'];
  const fight = () => { G.recompute(); const B = new SW.Battle(G.C, { heat: 80 }, { waves: [[{ id: 'ghoul', lvl: 28, elite: ['molten'] }, { id: 'skeleton', lvl: 28 }, { id: 'wisp', lvl: 28 }]], lvl: 28 }, {}, false); for (let t = 0; t < 40 && !B.over; t += 0.05) B.step(0.05); assert.ok(isFinite(B.h.hp) && isFinite(B.dmgDone) && B.dmgDone > 0); };
  for (const u of D.UNIQUES) { for (const s of D.SLOTS) S.gear[s] = null; const it = I.roll(30, { rar: 3, unique: u.id, slot: D.BASES[u.base].slot }); assert.equal(it.uniq, u.id); S.gear.weapon = I.roll(30, { slot: 'weapon', rar: 2 }); S.gear[it.slot === 'ring' ? 'ring1' : it.slot] = it; fight(); assert.ok(I.powerText(it).length > 10 && !I.powerText(it).includes('{')); }
});
test('Clearing the boss unlocks the next level; the last one unlocks Torment', (SW, G, D) => {
  const W = G.S.world, boss = () => W.map.cells.find(c => c.type === 'boss');
  assert.equal(G.isUnlocked(1, 0), false);
  G.completeCell(boss()); assert.ok(G.isUnlocked(1, 0)); assert.equal(G.isUnlocked(0, 1), false);
  W.cleared[0] = 4; G.startExpedition(4, 0); G.completeCell(boss());
  assert.ok(G.isUnlocked(0, 1)); assert.equal(D.areaLevel(0, 1), 50); assert.ok(D.areaLevel(4, 4) > D.areaLevel(0, 4));
});
test('Item worth: what a piece adds to Damage and Toughness against an empty slot, and how crafting moves it', (SW, G, D, I) => {
  const S = G.S; S.gold = 1e12; S.mats = { dust: 9999, soul: 9999 }; S.mats.dust = 1e6;
  const ring = I.roll(30, { rar: 2, slot: 'ring' }); ring.affixes = [{ k: 'dmgPct', r: 0.5, g: 0 }, { k: 'life', r: 0.5, g: 0 }]; S.bag[0] = ring;
  const w0 = G.itemWorth(ring); assert.ok(w0.off > 0 && w0.def > 0, 'a ring with damage and life adds to both');
  const before = JSON.stringify(S.gear); G.itemWorth(ring); assert.equal(JSON.stringify(S.gear), before, 'asking does not touch what is worn');
  // worn or in the bag, the answer is the same: it is always judged against its slot left empty
  assert.ok(G.equip(ring.id)); const worn = G.itemWorth(ring); assert.equal(worn.off, w0.off); assert.equal(worn.def, w0.def);
  const c0 = G.C.rating; S.gear.ring1 = null; G.recompute(); assert.equal(Math.round(c0.off - G.C.rating.off), w0.off, 'and it is exactly what taking it off costs'); S.gear.ring1 = ring; G.recompute();
  // masterworking raises both, removing the damage affix takes the damage away and leaves the life
  while (ring.up < 25) assert.ok(G.upgrade(ring.id)); const w1 = G.itemWorth(ring); assert.ok(w1.off > w0.off && w1.def > w0.def, 'masterwork ranks lift both');
  assert.ok(G.cube(ring.id, 'remove', 'off')); const w2 = G.itemWorth(ring); assert.equal(ring.affixes.map(a => a.k).join(), 'life'); assert.equal(w2.off, 0); assert.ok(w2.def > 0);
  // a slow weapon does not cost Toughness: Life on Hit elsewhere is judged at the weapon's own speed, with and without it
  const loh = I.roll(30, { rar: 2, slot: 'ring' }); loh.affixes = [{ k: 'loh', r: 0.9, g: 0 }]; S.gear.ring2 = loh;
  for (const base of ['hammer', 'sword', 'axe']) { const wpn = I.roll(30, { rar: 0, slot: 'weapon', base }), ww = G.itemWorth(wpn); assert.equal(ww.def, 0, base + ' with no affixes adds no Toughness, and takes none'); assert.ok(ww.off > 0); }
  const lw = I.roll(30, { rar: 2, slot: 'weapon', base: 'hammer' }); lw.affixes = [{ k: 'life', r: 0.5, g: 0 }]; assert.ok(G.itemWorth(lw).def > 0, 'Life on a weapon still counts');
  const plain = I.roll(30, { rar: 0, slot: 'ring' }), wp = G.itemWorth(plain); assert.equal(wp.off, 0); assert.ok(wp.def > 0, 'a Common ring is only its life');
});
test('Weapon Damage: an Offence affix for weapons that raises the weapon\'s own damage', (SW, G, D, I, H) => {
  const A = D.AFFIX.wdmg; assert.equal(A.slots.join(), 'weapon'); assert.ok(I.inCat('wdmg', 'off')); assert.equal(A.cat, 'off'); assert.ok(D.AFFIX_CAT.off.keys.includes('wdmg'));
  let seen = 0; for (let i = 0; i < 400; i++) { const it = I.roll(30, { rar: 2 }); if (it.affixes.some(a => a.k === 'wdmg')) { seen++; assert.equal(it.slot, 'weapon'); } } assert.ok(seen > 3, 'it does roll: ' + seen);
  const S = G.S, w = I.roll(30, { rar: 2, slot: 'weapon', base: 'sword' }); w.affixes = [{ k: 'life', r: 0.5, g: 0 }]; S.gear.weapon = w; G.recompute();
  const base = G.C.st.dmg, off = G.C.rating.off; assert.equal(base, I.implicit(w).dmg);
  w.affixes.push({ k: 'wdmg', r: 0.5, g: 0 }); G.recompute(); const v = I.affixValue(w, w.affixes[1], 1); assert.ok(v >= 8 && v <= 10, '6 to 12 percent at any level, so about 9 at a middling roll: ' + v); assert.equal(I.affixRange(w, w.affixes[1], 1), I.affixRange(Object.assign({}, w, { ilvl: 5 }), w.affixes[1], 1), 'the same range at every item level');
  assert.equal(G.C.st.dmg, Math.round(base * (1 + v / 100)), 'the weapon hits that much harder'); assert.ok(Math.abs(G.C.rating.off / off - (1 + v / 100)) < 0.005, 'and so does everything built on it');
  assert.ok(I.affixText(w, w.affixes[1], 1).includes('Weapon Damage')); assert.ok(G.itemWorth(w).off > 0);
  // the cube can aim for it and at it
  S.mats.dust = 1e6; S.bag[0] = I.roll(30, { rar: 0, slot: 'weapon' }); const c = S.bag[0]; let got = false;
  for (let i = 0; i < 40 && !got; i++) { c.affixes = []; c.rar = 0; G.cube(c.id, 'add', 'off'); got = c.affixes[0].k === 'wdmg'; } assert.ok(got, 'Kindling aimed at Offence can add it');
  assert.ok(G.cube(c.id, 'remove', 'off')); assert.equal(c.affixes.length, 0, 'and Quenching aimed at Offence takes it');
});
test('Damage and Toughness share a scale, and Power is what it always was', (SW, G, D, I, H) => {
  const S = G.S; for (const s of D.SLOTS) S.gear[s] = I.roll(40, { rar: 2, slot: s.replace(/\d/, '') }); G.recompute();
  const r = G.C.rating, raw = { off: r.off / H.RATING_SCALE, def: r.def * H.RATING_SCALE };
  assert.equal(r.power, Math.round(Math.sqrt(raw.off * raw.def) * 1.2 * (1 + G.C.st.move / 100 * 0.04)), 'Power comes from the unscaled pair');
  assert.ok(Math.abs(Math.sqrt(r.off * r.def) / Math.sqrt(raw.off * raw.def) - 1) < 1e-9, 'scaling one up and the other down leaves their product alone');
  const ratio = r.def / r.off; assert.ok(ratio > 0.1 && ratio < 10, 'a fully dressed smith has the two within one order of magnitude: ' + ratio.toFixed(2));
});
test('Life is not refilled after a battle: it carries to the next, and walking, the flask, shrines, a fall and a new map bring it back', (SW, G, D, I) => {
  const S = G.S; G.recompute(); const C = G.C, spec = { waves: [[{ id: 'skeleton', lvl: 1 }]], lvl: 1, type: 'fight' };
  let B = new SW.Battle(C, {}, spec, {}, false); assert.equal(B.h.hp, B.h.max, 'a fresh smith starts whole');
  B.h.hp = Math.round(B.h.max * 0.4); const p = B.persist(); assert.ok(Math.abs(p.hp - 0.4) < 0.01, 'what is left is carried out');
  B = new SW.Battle(C, p, spec, {}, false); assert.ok(Math.abs(B.h.hp / B.h.max - 0.4) < 0.02, 'and into the next fight'); assert.ok(B.minFrac <= 0.41);
  B.h.hp = 0; B.over = 'lose'; assert.equal(B.persist().hp, 1, 'a fall sends the smith back whole');
  // walking brings a little back; standing still brings nothing
  G.persist = { hp: 0.4, potCd: 22 }; G.battle = null; G.rest(10);
  const want = 0.4 + 10 * (D.WALK_HEAL + C.st.regen / C.st.maxLife); assert.ok(Math.abs(G.persist.hp - want) < 1e-9, 'ten seconds of walking'); assert.equal(G.persist.potCd, 12, 'and the flask refilled for ten seconds');
  assert.ok(D.WALK_HEAL > 0 && D.WALK_HEAL <= 0.02, 'a trickle, not a refill');
  G.persist.hp = 0.4; G.phase = 'idle'; S.opts.auto = false; G.update(5); assert.equal(G.persist.hp, 0.4, 'waiting in a room heals nothing');
  G.rest(1e6); assert.equal(G.persist.hp, 1, 'never past full'); assert.equal(G.lifeFrac(), 1);
  // the flask works between fights too
  G.persist = { hp: 0.3, potCd: 0 }; assert.equal(G.drink(), null); assert.ok(Math.abs(G.persist.hp - 0.65) < 0.01, '35% back'); assert.equal(G.persist.potCd, 22);
  assert.ok(/refilling/.test(G.drink())); G.persist = { hp: 1, potCd: 0 }; assert.ok(/full Life/.test(G.drink()));
  // a shrine restores everything, and so does a new map
  const sh = S.world.map.cells.find(c => c.type === 'shrine'); G.persist = { hp: 0.2 }; if (sh) { G.arrive(sh); assert.equal(G.persist.hp, 1, 'a shrine restores your Life'); }
  G.persist.hp = 0.2; G.startExpedition(0, 0, true); assert.equal(G.persist.hp, 1, 'a new map is begun whole');
  // and it is saved, so reloading the page is no heal
  G.persist.hp = 0.37; S.hp = G.persist.hp; const copy = JSON.parse(JSON.stringify(S)); G.init(copy); assert.equal(G.persist.hp, 0.37); G.init(null); assert.equal(G.lifeFrac(), 1);
});
test('The first level is a gear check: the starting kit cannot finish it, a smith wearing its drops beats the boss', (SW, G, D, I) => {
  const { BUILDS } = require('./harness.cjs');
  const run = (dress, build, N) => { let win = 0;
    for (let s = 1; s <= N; s++) {
      SW.util.seed(s * 13 + 5); G.init(null); const S = G.S, b = BUILDS[build];
      S.hero.bar = b.bar.slice(); S.hero.passives = b.passives.slice(); S.hero.tech = Object.assign({}, b.tech);
      if (dress) for (const slot of D.SLOTS) S.gear[slot] = I.roll(slot === 'weapon' ? 7 : 6, { slot: slot.replace(/\d/, ''), rar: 1, base: slot === 'weapon' ? 'hammer' : undefined });
      G.recompute();
      const c = S.world.map.cells.find(x => x.type === 'boss'), spec = G.makeSpec(c); assert.equal(spec.boss, 'grukk'); assert.equal(c.lvl, 7);
      const B = new SW.Battle(G.C, {}, spec, { autoFlask: true }, false); for (let i = 0; i < 4000 && !B.over; i++) B.step(0.05);
      if (B.over === 'win') win++;
    } return win / N; };
  for (const build of ['hammer', 'ember', 'storm']) {
    const bare = run(false, build, 30), kit = run(true, build, 30);
    assert.ok(bare <= 0.1, `${build} in the starting hammer and apron should fall to Grukk: won ${Math.round(bare * 100)}%`);
    assert.ok(kit >= 0.8, `${build} in Magic gear of the level's last rooms should beat him: won ${Math.round(kit * 100)}%`);
  }
});
test('Saves survive an export and import', (SW, G, D, I) => {
  G.S.gold = 4242; G.S.bag[3] = I.roll(12, { rar: 2 }); G.S.mats.dust = 7;
  const str = G.exportSave(), name = G.S.bag[3].name;
  G.init(null); assert.equal(G.S.gold, 0);
  assert.ok(G.importSave(str)); assert.equal(G.S.gold, 4242); assert.equal(G.S.bag[0].name, name, 'the bag is packed to the front on load'); assert.equal(G.S.mats.dust, 7);
  assert.equal(G.importSave('not a save'), false);
  const it = I.roll(5, {}); assert.ok(it.id > G.S.bag[0].id, 'new item ids never collide with loaded ones');
});
test('Auto-explore clears the first level without help, and never stalls', () => {
  const SW = load();
  const r = play(SW, { build: 'hammer', seed: 5, maxT: 2400, until: g => g.S.world.cleared[0] >= 1 });
  assert.ok(r.S.world.cleared[0] >= 1, 'first level not cleared in 40 minutes'); assert.ok(r.S.stats.deaths <= 8, 'falls on the way: ' + r.S.stats.deaths);
});
test('A rushing, forge-less player still gets through the first two levels, by falling and coming back', () => {
  const SW = load();
  const r = play(SW, { build: 'ember', seed: 9, maxT: 7200, full: false, casual: true, until: g => g.S.world.cleared[0] >= 2 });
  assert.ok(r.S.world.cleared[0] >= 2, 'two levels not finished in two hours'); assert.ok(r.S.stats.deaths >= 2, 'and not without falling: ' + r.S.stats.deaths);
});
console.log(n + ' checks passed.');
