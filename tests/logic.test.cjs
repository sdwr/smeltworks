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
    const m = G.genMap(i % 15, i % 3), start = m.cells.find(c => c.type === 'start');
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
    if (it.rar === 3) assert.ok(D.ASPECT_SLOTS[D.ASPECT[it.aspect.id].cat].includes(it.slot));
    if (it.rar === 4) assert.equal(D.BASES[D.UNIQUE[it.uniq].base].slot, it.slot);
    const st = I.stats(it); for (const k in st) assert.ok(st[k] > 0 && isFinite(st[k]), k);
  }
});
test('Each piece has one main stat, identical on every piece of its type and level', (SW, G, D, I) => {
  const one = { sword: 'dmg', axe: 'dmg', hammer: 'dmg', shield: 'armor', lantern: 'dmgPct', helm: 'armor', chest: 'armor', gloves: 'armor', pants: 'armor', boots: 'armor', amulet: 'life', ring: 'life' };
  for (const base in one) {
    const slot = D.BASES[base].slot, seen = new Set();
    for (let i = 0; i < 40; i++) { const imp = I.implicit(I.roll(25, { slot, base, rar: i % 4 })); assert.equal(Object.keys(imp).filter(k => k !== 'aps').join(), one[base], base); seen.add(imp[one[base]]); }
    assert.equal(seen.size, 1, base + ' main stat varies between pieces');
  }
  assert.ok(I.implicit(I.roll(40, { slot: 'weapon', base: 'sword', rar: 0 })).dmg > I.implicit(I.roll(10, { slot: 'weapon', base: 'sword', rar: 0 })).dmg * 8);
});
test('Every affix value sits inside the range shown for it', (SW, G, D, I) => {
  for (let i = 0; i < 800; i++) {
    const it = I.roll(1 + (i % 150), { rar: 1 + (i % 4), tier: i % 5 }); it.up = i % 9; if (it.up >= 4 && it.affixes.length) it.mw = [0];
    it.affixes.forEach((a, k) => {
      const m = I.affixRange(it, a, k).match(/^\[(.+)–(.+)\]$/); assert.ok(m, I.affixRange(it, a, k));
      const v = I.affixValue(it, a, k), lo = I.affixValue(it, { k: a.k, r: 0, g: a.g }, k), hi = I.affixValue(it, { k: a.k, r: 0.9999, g: a.g }, k);
      assert.ok(lo <= v && v <= hi, `${a.k}: ${lo} <= ${v} <= ${hi}`);
    });
  }
});
test('Affix counts: none on Common, 1-2 Magic, 3-4 Rare, 4 Legendary and Unique', (SW, G, D, I) => {
  const counts = [new Set(), new Set(), new Set(), new Set(), new Set()];
  for (let i = 0; i < 1500; i++) { const it = I.roll(1 + (i % 90), { rar: i % 5, slot: i % 5 === 4 ? 'ring' : undefined }); counts[it.rar].add(it.affixes.length); }
  const show = s => [...s].sort().join();
  assert.equal(show(counts[0]), '0'); assert.equal(show(counts[1]), '1,2'); assert.equal(show(counts[2]), '3,4'); assert.equal(show(counts[3]), '4'); assert.equal(show(counts[4]), '4');
});
test('Upgrades add 5% each and masterwork every fourth', (SW, G, D, I) => {
  const it = I.roll(30, { slot: 'chest', rar: 3 }), base = I.implicit(it).armor;
  G.S.bag[0] = it; G.S.gold = 1e9; G.S.mats = { scrap: 999, dust: 999, soul: 999 };
  for (let i = 0; i < 8; i++) assert.ok(G.upgrade(it.id));
  assert.equal(it.up, 8); assert.equal(it.mw.length, 2); assert.equal(G.upgrade(it.id), null, 'capped at 8');
  assert.ok(Math.abs(I.implicit(it).armor / base - 1.4) < 0.02);
});
test('Upgrades and imprints cannot be bought without the materials', (SW, G, D, I) => {
  const it = I.roll(20, { slot: 'ring', rar: 2 }); G.S.bag[0] = it; G.S.gold = 0;
  assert.equal(G.upgrade(it.id), null); assert.equal(it.up, 0);
  G.S.codex.twin = 0.5; assert.equal(G.imprint(it.id, 'twin'), false); assert.equal(it.rar, 2);
});
test('Enchanting locks the item to one affix slot', (SW, G, D, I) => {
  const it = I.roll(20, { slot: 'ring', rar: 2 }); G.S.bag[0] = it; G.S.gold = 1e9; G.S.mats.dust = 99;
  const before = it.affixes[1].k;
  assert.ok(G.enchant(it.id, 1)); assert.notEqual(it.affixes[1].k, before);
  assert.equal(G.enchant(it.id, 0), null, 'a different affix is refused'); assert.ok(G.enchant(it.id, 1));
});
test('Salvaging a legendary teaches its aspect; imprinting spends it onto a rare', (SW, G, D, I) => {
  const leg = I.roll(20, { slot: 'ring', rar: 3, aspect: 'twin' }), rare = I.roll(20, { slot: 'gloves', rar: 2 });
  leg.aspect.r = 0.8; G.S.bag[0] = leg; G.S.bag[1] = rare; G.S.gold = 1e9; G.S.mats = { scrap: 0, dust: 99, soul: 0 };
  assert.ok(G.salvage(leg.id)); assert.equal(G.S.codex.twin, 0.8); assert.equal(G.S.mats.soul, 1);
  assert.ok(G.imprint(rare.id, 'twin')); assert.equal(rare.rar, 3); assert.equal(rare.aspect.r, 0.8); assert.equal(G.S.mats.soul, 0);
  const worse = I.roll(20, { slot: 'ring', rar: 3, aspect: 'twin' }); worse.aspect.r = 0.2; G.S.bag[0] = worse; G.salvage(worse.id);
  assert.equal(G.S.codex.twin, 0.8, 'the better roll is kept');
  assert.equal(I.canImprint(I.roll(20, { slot: 'boots', rar: 2 }), 'twin'), false, 'offensive aspects do not fit boots');
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
  const before = G.S.bag.map(b => b.id).join(), leg = I.roll(10, { rar: 3, slot: 'ring', aspect: 'twin' }), soul = G.S.mats.soul;
  assert.equal(G.addItem(leg), 'salvaged'); assert.equal(G.S.bag.map(b => b.id).join(), before, 'nothing in the bag changed');
  assert.equal(G.S.mats.soul, soul + 1, 'its materials are kept'); assert.ok(G.S.codex.twin != null, 'and so is its aspect');
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
  for (const s of D.SLOTS) { const it = I.roll(200, { rar: 2, slot: s.replace(/\d/, '') }); it.affixes = [{ k: 'crit', r: 1, g: 1 }, { k: 'dodge', r: 1, g: 1 }, { k: 'dr', r: 1, g: 1 }, { k: 'cdr', r: 1, g: 1 }]; it.up = 8; S.gear[s] = it; }
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
test('The cube: Kindling adds an affix and lifts rarity, up to four', (SW, G, D, I) => {
  const S = G.S, it = I.roll(20, { rar: 0, slot: 'gloves' }); S.bag[0] = it; S.orbs.add = 9;
  assert.equal(it.affixes.length, 0);
  assert.ok(G.cube(it.id, 'add')); assert.equal(it.rar, 1, 'Common becomes Magic'); assert.equal(it.affixes.length, 1);
  G.cube(it.id, 'add'); assert.equal(it.rar, 1); G.cube(it.id, 'add'); assert.equal(it.rar, 2, 'a third affix makes it Rare');
  G.cube(it.id, 'add'); assert.equal(it.affixes.length, 4);
  assert.equal(G.cube(it.id, 'add'), null, 'no fifth affix'); assert.equal(S.orbs.add, 5, 'a refused recipe costs nothing');
  assert.equal(new Set(it.affixes.map(a => a.k)).size, 4);
  for (const a of it.affixes) assert.ok(D.AFFIX[a.k].slots.includes('gloves'));
});
test('The cube: Quenching removes one affix and keeps the bookkeeping straight', (SW, G, D, I) => {
  let it; do { it = I.roll(50, { rar: 2, slot: 'chest' }); } while (it.affixes.length < 4);
  const S = G.S; S.bag[0] = it; S.orbs.remove = 9; S.orbs.add = 0;
  it.ench = 3; it.mw = [3, 0]; const keys = it.affixes.map(a => a.k);
  SW.util.rng = () => 0;                                   // always removes the first affix
  const res = G.cube(it.id, 'remove');
  assert.ok(res.removed.length > 3); assert.equal(it.affixes.length, 3); assert.equal(it.affixes[0].k, keys[1]);
  assert.equal(it.ench, 2); assert.equal(it.mw.join(), '2'); assert.equal(it.rar, 2, 'rarity stays');
  assert.equal(G.cube(it.id, 'add'), null, 'no orb, no transmute');
  G.cube(it.id, 'remove'); G.cube(it.id, 'remove'); G.cube(it.id, 'remove'); assert.equal(it.affixes.length, 0);
  assert.equal(G.cube(it.id, 'remove'), null); assert.equal(S.orbs.remove, 5);
});
test('Affix pools: slot-limited like Diablo, and any type a slot has offers at least three affixes', (SW, G, D, I) => {
  const keys = ['weapon', 'shield', 'lantern', 'helm', 'chest', 'gloves', 'pants', 'boots', 'amulet', 'ring'];
  const pool = k => Object.values(D.AFFIX).filter(a => a.slots.includes(k));
  for (const k of keys) {
    const n = {}; for (const a of pool(k)) n[a.cat] = (n[a.cat] || 0) + 1;
    assert.ok(Object.keys(n).length >= 2, k + ' only rolls ' + Object.keys(n));
    for (const c in n) assert.ok(n[c] >= 3, `${k} has only ${n[c]} ${c} affix(es)`);
  }
  for (const a of Object.values(D.AFFIX)) for (const sl of a.slots) assert.ok(keys.includes(sl), a.id + ' lists an unknown slot ' + sl);
  const on = (id, k) => D.AFFIX[id].slots.includes(k);
  for (const k of ['helm', 'chest', 'pants', 'shield', 'boots']) for (const id of ['crit', 'critDmg', 'aspd', 'vuln']) assert.ok(!on(id, k), id + ' must not roll on ' + k);
  assert.ok(on('crit', 'weapon') && on('aspd', 'weapon'), 'weapons roll crit chance and attack speed');
  assert.ok(on('vuln', 'gloves') && !on('vuln', 'weapon'), 'Vulnerable is on gloves, not weapons');
  assert.equal(D.AFFIX.move.slots.join(), 'boots', 'Movement Speed is boots only');
  assert.ok(!pool('boots').some(a => a.cat === 'off'), 'boots carry no offence');
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
test('The comparison counts stats only: an aspect never outweighs real damage', (SW, G, D, I, H) => {
  const S = G.S, plain = I.roll(20, { rar: 2, slot: 'amulet' }), leg = I.roll(20, { rar: 3, slot: 'amulet', aspect: 'exec' });
  plain.affixes = [{ k: 'dmgPct', r: 0.5, g: 0 }, { k: 'dodge', r: 0.5, g: 0 }]; leg.affixes = [{ k: 'dodge', r: 0.5, g: 0 }, { k: 'gold', r: 0.5, g: 0 }];
  const withIt = it => H.compute(S, Object.assign({}, S.gear, { amulet: it })).rating;
  assert.ok(withIt(plain).off > withIt(leg).off, 'the piece with +damage rates as more damage');
  const bare = I.roll(20, { rar: 2, slot: 'amulet' }); bare.affixes = leg.affixes.map(a => Object.assign({}, a));
  assert.equal(withIt(leg).off, withIt(bare).off, 'the aspect itself adds nothing to the estimate');
  // cooldown reduction only counts when something on the bar has a cooldown worth shortening
  const cdr = I.roll(20, { rar: 2, slot: 'amulet' }); cdr.affixes = [{ k: 'cdr', r: 0.9, g: 0 }];
  const none = I.roll(20, { rar: 0, slot: 'amulet' });
  S.hero.bar = ['strike', 'sunder', null, null, null]; assert.equal(withIt(cdr).off, withIt(none).off);
  S.hero.bar = ['strike', 'sunder', 'meteor', null, null]; assert.ok(withIt(cdr).off > withIt(none).off);
  // swapping in a much higher-level piece must not make armor look worse
  const hi = I.roll(90, { rar: 0, slot: 'amulet' }); assert.ok(withIt(hi).def >= withIt(none).def);
});
test('Flask healing from gear makes the flask heal more', (SW, G, D, I) => {
  const S = G.S, pants = I.roll(10, { rar: 2, slot: 'pants' }); pants.affixes = [{ k: 'flask', r: 0.99, g: 0 }]; S.gear.pants = pants; G.recompute();
  assert.ok(G.C.st.flask >= 19);
  const B = new SW.Battle(G.C, {}, { waves: [[{ id: 'rat', lvl: 1 }]], lvl: 1 }, {}, true); B.step(0.5);
  B.h.hp = B.h.max * 0.36; B.hurtHero(B.h.max * 0.05, 'phys', null, { dot: 1 });
  assert.ok(B.ev.some(e => e.e === 'potion')); assert.ok(B.h.hp > B.h.max * (0.31 + 0.35 * 1.15), 'healed for more than the base 35%');
});
test('The cube can be aimed at an affix type, for adding and for removing', (SW, G, D, I) => {
  const S = G.S; S.orbs = { add: 999, remove: 99, chaos: 0, divine: 0 };
  for (const cat of ['off', 'def', 'util', 'skill']) for (let i = 0; i < 30; i++) {
    const it = I.roll(30, { rar: 0, slot: 'helm' }); S.bag[0] = it;
    assert.ok(G.cube(it.id, 'add', cat)); assert.equal(D.AFFIX[it.affixes[0].k].cat, cat, 'asked for ' + cat);
    assert.ok(D.AFFIX[it.affixes[0].k].slots.includes('helm'));
  }
  const boots = I.roll(30, { rar: 0, slot: 'boots' }); S.bag[0] = boots;
  assert.equal(G.cube(boots.id, 'add', 'skill'), null, 'boots cannot roll skill ranks'); assert.equal(S.orbs.add, 999 - 120, 'and the orb is not spent');
  const it = I.roll(30, { rar: 2, slot: 'chest' }); it.affixes = [{ k: 'life', r: 0.5, g: 0 }, { k: 'skEmber', r: 0.5, g: 0 }, { k: 'armor', r: 0.5, g: 0 }]; S.bag[0] = it;
  assert.equal(G.cube(it.id, 'remove', 'off'), null, 'nothing offensive to remove');
  assert.ok(G.cube(it.id, 'remove', 'skill')); assert.equal(it.affixes.map(a => a.k).join(), 'life,armor');
  assert.ok(G.cube(it.id, 'remove', 'def')); assert.equal(it.affixes.length, 1);
  for (const k in D.AFFIX) assert.ok(D.AFFIX_CAT[D.AFFIX[k].cat], k + ' has no type');
});
test('Affixes can crit into Greater affixes on drops, Tempering and enchanting, never from Kindling or Slag', (SW, G, D, I) => {
  const S = G.S; let n = 0, g = 0;
  for (let i = 0; i < 4000; i++) { const it = I.roll(20, { rar: 2 }); n += it.affixes.length; g += I.greaterCount(it); }
  assert.ok(g / n > 0.02 && g / n < 0.07, 'about 4% in Normal, got ' + (g / n * 100).toFixed(1) + '%');
  assert.ok(I.greaterChance(3) > I.greaterChance(0) * 2, 'likelier in Torment');
  const it = I.roll(20, { rar: 1, slot: 'ring' }); it.affixes = [{ k: 'life', r: 0.5, g: 0 }];
  const plain = I.affixValue(it, it.affixes[0], 0); it.affixes[0].g = 1;
  assert.ok(Math.abs(I.affixValue(it, it.affixes[0], 0) / plain - 1.5) < 0.02, 'Greater is half again as strong');
  // crafting with dice that always crit
  S.bag[0] = it; S.orbs = { add: 9, remove: 9, chaos: 9, divine: 9 }; it.affixes[0].g = 0;
  const real = SW.util.rng; SW.util.rng = () => 0.001;
  const res = G.cube(it.id, 'add'); assert.ok(!res.crit && !it.affixes[1].g, 'Kindling never rolls Greater');
  G.cube(it.id, 'chaos'); assert.equal(I.greaterCount(it), 0, 'nor does Slag');
  assert.ok(G.cube(it.id, 'divine').crit >= 1); assert.ok(it.affixes.every(a => a.g), 'Tempering can crit the ordinary ones');
  SW.util.rng = () => 0.999; G.cube(it.id, 'divine'); assert.ok(it.affixes.every(a => a.g), 'and never takes Greater away');
  S.gold = 1e9; S.mats.dust = 99; G.enchant(it.id, 0); assert.ok(it.affixes[0].g, 'an enchanted Greater affix stays Greater');
  SW.util.rng = () => 0.001; it.affixes[0].g = 0; G.enchant(it.id, 0); assert.ok(it.affixes[0].g, 'and an ordinary one can crit at the forge');
  SW.util.rng = real;
});
test('Legendaries cannot be cubed, but can be enchanted and Tempered', (SW, G, D, I) => {
  const S = G.S, leg = I.roll(30, { rar: 3, slot: 'gloves' }), rare = I.roll(30, { rar: 2, slot: 'gloves' });
  S.bag[0] = leg; S.bag[1] = rare; S.orbs = { add: 5, remove: 5, chaos: 5, divine: 5 }; S.gold = 1e9; S.mats = { scrap: 99, dust: 99, soul: 99 };
  const keys = leg.affixes.map(a => a.k).join();
  for (const orb of ['add', 'remove', 'chaos']) for (const cat of [null, 'off', 'def']) assert.equal(G.cube(leg.id, orb, cat), null, orb);
  assert.equal(leg.affixes.map(a => a.k).join(), keys); assert.equal(S.orbs.add + S.orbs.remove + S.orbs.chaos, 15, 'nothing was spent');
  assert.ok(G.cube(leg.id, 'divine'), 'Tempering rerolls its numbers'); assert.equal(leg.affixes.map(a => a.k).join(), keys);
  assert.ok(G.enchant(leg.id, 1), 'the forge can enchant one affix'); assert.notEqual(leg.affixes.map(a => a.k).join(), keys);
  assert.equal(G.enchant(leg.id, 0), null, 'and only that one'); assert.ok(leg.aspect, 'the aspect is untouched');
  assert.ok(G.upgrade(leg.id), 'upgrades work too');
  // a Rare can be cubed freely until an imprint makes it Legendary
  assert.ok(G.cube(rare.id, 'remove')); assert.ok(G.cube(rare.id, 'add'));
  S.codex.twin = 0.5; assert.ok(G.imprint(rare.id, 'twin')); assert.equal(rare.rar, 3);
  assert.equal(G.cube(rare.id, 'add'), null); assert.equal(G.cube(rare.id, 'remove'), null); assert.ok(G.enchant(rare.id, 0));
  const u = I.roll(30, { rar: 4, unique: 'coil', slot: 'ring' }); S.bag[2] = u; assert.equal(G.enchant(u.id, 0), null, 'Uniques stay fixed');
});
test('The cube: Slag rerolls every affix, Tempering only the numbers, and Uniques resist', (SW, G, D, I) => {
  const S = G.S, it = I.roll(30, { rar: 2, slot: 'ring' }), u = I.roll(30, { rar: 4, unique: 'coil', slot: 'ring' });
  S.bag[0] = it; S.bag[1] = u; S.orbs = { add: 5, remove: 5, chaos: 5, divine: 5 };
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
  S.orbs.add = 1; assert.ok(G.cube(keep.id, 'add'), 'stashed gear can be crafted in place'); assert.equal(keep.affixes.length, 1);
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
test('Every aspect and unique power runs in battle without breaking the numbers', (SW, G, D, I) => {
  const S = G.S; S.hero.bar = ['cinder', 'sunder', 'chain', 'forgeheart', 'meteor']; S.hero.passives = ['kindling', 'aftershock', 'crush'];
  const fight = () => { G.recompute(); const B = new SW.Battle(G.C, { heat: 80 }, { waves: [[{ id: 'ghoul', lvl: 28, elite: ['molten'] }, { id: 'skeleton', lvl: 28 }, { id: 'wisp', lvl: 28 }]], lvl: 28 }, {}, false); for (let t = 0; t < 40 && !B.over; t += 0.05) B.step(0.05); assert.ok(isFinite(B.h.hp) && isFinite(B.dmgDone) && B.dmgDone > 0); };
  for (const a of D.ASPECTS) { const slot = D.ASPECT_SLOTS[a.cat][0]; for (const s of D.SLOTS) S.gear[s] = null; S.gear.weapon = I.roll(30, { slot: 'weapon', rar: 2 }); S.gear[slot === 'ring' ? 'ring1' : slot] = I.roll(30, { slot, rar: 3, aspect: a.id }); fight(); }
  for (const u of D.UNIQUES) { for (const s of D.SLOTS) S.gear[s] = null; const it = I.roll(30, { rar: 4, unique: u.id, slot: D.BASES[u.base].slot }); assert.equal(it.uniq, u.id); S.gear.weapon = I.roll(30, { slot: 'weapon', rar: 2 }); S.gear[it.slot === 'ring' ? 'ring1' : it.slot] = it; fight(); assert.ok(I.powerText(it).length > 10 && !I.powerText(it).includes('{')); }
});
test('Clearing the boss unlocks the next area; the last one unlocks Torment', (SW, G, D) => {
  const W = G.S.world, boss = () => W.map.cells.find(c => c.type === 'boss');
  assert.equal(G.isUnlocked(1, 0), false);
  G.completeCell(boss()); assert.ok(G.isUnlocked(1, 0)); assert.equal(G.isUnlocked(0, 1), false);
  W.cleared[0] = 14; G.startExpedition(14, 0); G.completeCell(boss());
  assert.ok(G.isUnlocked(0, 1)); assert.equal(D.areaLevel(0, 1), 50); assert.ok(D.areaLevel(14, 4) > D.areaLevel(0, 4));
});
test('Saves survive an export and import', (SW, G, D, I) => {
  G.S.gold = 4242; G.S.bag[3] = I.roll(12, { rar: 3 }); G.S.orbs.chaos = 7;
  const str = G.exportSave(), name = G.S.bag[3].name;
  G.init(null); assert.equal(G.S.gold, 0);
  assert.ok(G.importSave(str)); assert.equal(G.S.gold, 4242); assert.equal(G.S.bag[0].name, name, 'the bag is packed to the front on load'); assert.equal(G.S.orbs.chaos, 7);
  assert.equal(G.importSave('not a save'), false);
  const it = I.roll(5, {}); assert.ok(it.id > G.S.bag[0].id, 'new item ids never collide with loaded ones');
});
test('Auto-explore clears the first area without help, and never stalls', () => {
  const SW = load();
  const r = play(SW, { build: 'hammer', seed: 5, maxT: 2400, until: g => g.S.world.cleared[0] >= 1 });
  assert.ok(r.S.world.cleared[0] >= 1, 'first area not cleared in 40 minutes');
});
test('A rushing, forge-less player still finishes Act I through the fallback loop', () => {
  const SW = load();
  const r = play(SW, { build: 'ember', seed: 9, maxT: 6000, full: false, casual: true, until: g => g.S.world.cleared[0] >= 3 });
  assert.ok(r.S.world.cleared[0] >= 3, 'Act I not finished in 100 minutes');
});
console.log(n + ' checks passed.');
