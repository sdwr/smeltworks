/* Rule checks for the game logic. Run: node tests/logic.test.cjs */
const assert = require('node:assert/strict');
const { load, play } = require('./harness.cjs');
let n = 0;
function test(name, fn) { const SW = load(); SW.util.seed(1234 + n); SW.game.init(null); fn(SW, SW.game, SW.data, SW.items, SW.hero); n++; console.log('PASS ' + name); }

test('A fresh save starts with a weapon, a basic skill and a map', (SW, G) => {
  const S = G.S;
  assert.ok(S.gear.weapon && S.gear.chest); assert.equal(S.hero.ranks.strike, 1); assert.equal(G.pointsLeft(), 0);
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
    if (!it.uniq) for (const k of keys) assert.ok(D.AFFIX[k].slots.includes(it.slot), `${k} on ${it.slot}`);   // uniques break the slot rules on purpose
    if (it.rar === 3) assert.ok(D.ASPECT_SLOTS[D.ASPECT[it.aspect.id].cat].includes(it.slot));
    if (it.rar === 4) assert.equal(D.BASES[D.UNIQUE[it.uniq].base].slot, it.slot);
    const st = I.stats(it); for (const k in st) assert.ok(st[k] > 0 && isFinite(st[k]), k);
  }
});
test('Higher item levels and rarities are worth more', (SW, G, D, I) => {
  const a = I.roll(10, { slot: 'weapon', base: 'sword', rar: 0 }), b = I.roll(40, { slot: 'weapon', base: 'sword', rar: 0 });
  assert.ok(I.implicit(b).dmg > I.implicit(a).dmg * 8);
  assert.equal(I.roll(30, { rar: 2, slot: 'helm' }).affixes.length, 3);
  assert.equal(I.roll(50, { rar: 2, slot: 'helm' }).affixes.length, 4);
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
test('A full bag makes room by melting its least valuable piece', (SW, G, D, I) => {
  for (let i = 0; i < D.BAG_SIZE; i++) G.S.bag[i] = I.roll(10, { rar: 1, slot: 'boots' });
  const leg = I.roll(10, { rar: 3, slot: 'ring' });
  assert.equal(G.addItem(leg), 'bag'); assert.equal(G.bagCount(), D.BAG_SIZE); assert.ok(G.S.bag.includes(leg));
});
test('Skill points: one per level, refundable, level-gated', (SW, G, D) => {
  const S = G.S;
  assert.equal(G.learn('sunder'), false, 'no points at level 1');
  S.hero.level = 5; G.recompute();
  assert.ok(G.learn('sunder')); assert.ok(S.hero.bar.includes('sunder'));
  assert.equal(G.learn('meteor'), false, 'ultimates need level 18');
  assert.ok(G.learn('cinder')); assert.ok(!S.hero.bar.includes('cinder'), 'a second basic waits for the player');
  G.barToggle('cinder'); assert.ok(S.hero.bar.includes('cinder') && !S.hero.bar.includes('strike'));
  G.respec(); assert.equal(G.pointsLeft(), 5); assert.equal(S.hero.bar.filter(Boolean).length, 0);
});
test('Gear can raise skill ranks past what points bought', (SW, G, D, I) => {
  const S = G.S; S.hero.level = 20; S.hero.ranks = { strike: 2 };
  const helm = I.roll(20, { rar: 2, slot: 'helm' }); helm.affixes = [{ k: 'skHammer', r: 0.99, g: 0 }]; S.gear.helm = helm; G.recompute();
  assert.equal(G.C.ranks.strike, 4); assert.equal(G.C.ranks.sunder, undefined, 'unlearned skills stay unlearned');
});
test('Stat caps hold', (SW, G, D, I) => {
  const S = G.S;
  for (const s of D.SLOTS) { const it = I.roll(200, { rar: 2, slot: s.replace(/\d/, '') }); it.affixes = [{ k: 'crit', r: 1, g: 1 }, { k: 'dodge', r: 1, g: 1 }, { k: 'dr', r: 1, g: 1 }, { k: 'cdr', r: 1, g: 1 }]; it.up = 8; S.gear[s] = it; }
  G.recompute(); const st = G.C.st;
  assert.ok(st.crit <= 75 && st.dodge <= 60 && st.dr <= 50 && st.cdr <= 60);
});
test('Experience levels the hero and overflows into paragon at 50', (SW, G, D, I, H) => {
  const S = G.S;
  G.addXp(H.xpNeed(1) + 1, 1); assert.equal(S.hero.level, 2); assert.equal(G.pointsLeft(), 1);
  S.hero.level = 49; S.hero.xp = 0; G.addXp(H.xpNeed(49) + 10, 49); assert.equal(S.hero.level, 50);
  G.addXp(H.paragonNeed(0) * 2.2, 50); assert.ok(S.hero.plevel >= 1); assert.ok(G.paragon('might')); assert.ok(G.C.st.dmgPct >= 3);
});
test('Far weaker monsters give little experience', (SW, G) => {
  G.S.hero.level = 20; const a = G.addXp(1000, 20); const b = G.addXp(1000, 8);
  assert.ok(b < a * 0.3);
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
  const S = G.S; S.hero.level = 50;
  for (const sk of D.SKILLS.filter(s => s.type !== 'passive')) {
    S.hero.ranks = { strike: 1, [sk.id]: 3 }; S.hero.bar = ['strike', sk.id, null, null, null].filter((x, i, a) => a.indexOf(x) === i);
    if (sk.type === 'basic') S.hero.bar = [sk.id];
    G.recompute();
    const B = new SW.Battle(G.C, { heat: 100 }, { waves: [[{ id: 'golem', lvl: 1 }, { id: 'bat', lvl: 1 }, { id: 'kobold', lvl: 1 }]], lvl: 1 }, {}, true);
    B.h.hp = B.h.max * 0.5;                       // lets defensive skills trigger
    for (let t = 0; t < 12 && !B.over; t += 0.05) B.step(0.05);
    assert.ok(B.ev.some(e => e.e === 'cast' && e.id === sk.id), sk.id + ' was never used');
    assert.ok(B.dmgDone > 0 && isFinite(B.dmgDone));
  }
});
test('Every aspect and unique power runs in battle without breaking the numbers', (SW, G, D, I) => {
  const S = G.S; S.hero.level = 30; S.hero.ranks = { cinder: 3, sunder: 3, chain: 3, forgeheart: 1, ironskin: 1, meteor: 1 }; S.hero.bar = ['cinder', 'sunder', 'chain', 'forgeheart', 'meteor'];
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
  G.S.gold = 4242; G.S.bag[3] = I.roll(12, { rar: 3 }); G.S.hero.level = 9;
  const str = G.exportSave(), name = G.S.bag[3].name;
  G.init(null); assert.equal(G.S.gold, 0);
  assert.ok(G.importSave(str)); assert.equal(G.S.gold, 4242); assert.equal(G.S.bag[3].name, name); assert.equal(G.S.hero.level, 9);
  assert.equal(G.importSave('not a save'), false);
  const it = I.roll(5, {}); assert.ok(it.id > G.S.bag[3].id, 'new item ids never collide with loaded ones');
});
test('Auto-explore clears the first area without help, and never stalls', () => {
  const SW = load();
  const r = play(SW, { build: 'hammer', seed: 5, maxT: 900, until: g => g.S.world.cleared[0] >= 1 });
  assert.ok(r.S.world.cleared[0] >= 1, 'first area not cleared in 15 minutes'); assert.ok(r.S.hero.level >= 4);
});
test('A rushing, forge-less player still finishes Act I through the fallback loop', () => {
  const SW = load();
  const r = play(SW, { build: 'ember', seed: 9, maxT: 2400, full: false, casual: true, until: g => g.S.world.cleared[0] >= 3 });
  assert.ok(r.S.world.cleared[0] >= 3, 'Act I not finished in 40 minutes');
});
console.log(n + ' checks passed.');
