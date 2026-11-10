/* Loads the game logic into a vm context (no DOM) and provides a bot that plays it. */
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
function load() {
  const ctx = vm.createContext({ console, Math: Object.create(Math), Date, JSON, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'), escape, unescape, encodeURIComponent, decodeURIComponent });
  for (const f of ['data', 'items', 'hero', 'combat', 'game']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  ctx.SW.headless = true;
  return ctx.SW;
}
const BUILDS = {
  hammer: { bar: ['strike', 'sunder', 'quake', 'ironskin', 'meteor'], passives: ['heavy', 'tempered', 'crush'] },
  ember:  { bar: ['cinder', 'wave', 'brand', 'forgeheart', 'eruption'], passives: ['kindling', 'combust', 'tempered'] },
  storm:  { bar: ['jab', 'chain', 'lance', 'overcharge', 'tempest'], passives: ['conduct', 'aftershock', 'quicken'] },
};
/* The bot: picks a loadout, equips anything flagged as an upgrade and melts the rest. Unless it is playing
   casually it also upgrades, imprints aspects, spends Kindling Orbs and commissions its weakest slot. */
function botTurn(SW, build, casual) {
  const G = SW.game, S = G.S, D = SW.data, I = SW.items, H = SW.hero;
  if (S.hero.bar.join() !== build.bar.join()) { S.hero.bar = build.bar.slice(); S.hero.passives = build.passives.slice(); G.recompute(); }
  for (let pass = 0; pass < 3; pass++) for (const it of S.bag.slice()) if (it && G.isUpgrade(it)) G.equip(it.id);
  G.salvageAll(4);
  if (casual) return;            // a casual player never touches the forge or the cube
  const gl = H.gearLevel(S.gear);
  for (const slot of ['weapon', 'chest', 'ring1', 'amulet', 'gloves', 'helm', 'pants', 'ring2', 'boots', 'offhand']) {
    const it = S.gear[slot]; if (!it) continue;
    if (it.ilvl >= gl - 2) while (S.orbs.add > 0 && G.cube(it.id, 'add'));       // finish the affixes before an imprint locks them
    if (it.rar === 2) for (const a of D.ASPECTS) if (S.codex[a.id] != null && a.cat !== 'util' && I.canImprint(it, a.id) && !D.SLOTS.some(s => S.gear[s] && S.gear[s].aspect && S.gear[s].aspect.id === a.id) && G.imprint(it.id, a.id)) break;
    if (it.rar >= 2 && it.ilvl >= gl - 4) while ((it.up || 0) < Math.min(4, I.maxUp(it)) && G.upgrade(it.id));
  }
  if (S.gold > I.commissionCost(G.areaLevel()) * 6) {
    let worst = null;
    for (const s of D.SLOTS) { const it = S.gear[s]; if (!it) { worst = s; break; } if (!worst || it.ilvl < S.gear[worst].ilvl) worst = s; }
    const it = G.commission(worst.replace(/\d/, '')); if (it && G.isUpgrade(it)) G.equip(it.id);
  }
}
/* play until `until(G)` or `maxT` seconds of game time. returns a log of area clears. */
function play(SW, o) {
  const G = SW.game, D = SW.data;
  SW.util.seed(o.seed || 1);
  G.listeners.length = 0;
  G.init(null);
  const S = G.S; S.opts.auto = true; S.opts.full = o.full !== false; S.opts.onClear = 'advance';
  const build = BUILDS[o.build || 'hammer'], log = [], setTimeout0 = [];
  let fights = 0, wins = 0, fightT = 0, fStart = 0, dz = { fight: [], elite: [], boss: [] }, bossT = 0;
  G.on((type, d) => {
    if (type === 'battleStart') fStart = S.stats.time;
    if (type === 'battleEnd') { fights++; if (d.win) wins++; fightT += S.stats.time - fStart; dz[d.bs.type].push(d.win ? d.bs.min : -0.01); if (d.bs.type === 'boss') bossT = d.bs.t; botTurn(SW, build, o.casual); }
    if (type === 'tierUnlock' && o.tiers !== false) setTimeout0.push(() => G.startExpedition(0, d.tier));
    if (type === 'chest' || type === 'fullClear') botTurn(SW, build, o.casual);
    if (type === 'areaClear' && d.first) { const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) : 100; const mn = a => a.length ? Math.round(Math.min(...a) * 100) : 100;
      log.push({ dz: `${avg(dz.fight)}/${avg(dz.elite)}/${mn(dz.boss)}`, bossT: Math.round(bossT), tier: d.tier, area: d.area, name: D.AREAS[d.area].name, t: Math.round(S.stats.time), lvl: SW.hero.gearLevel(S.gear), deaths: S.stats.deaths, power: G.C.rating.power, leg: S.stats.leg, uniq: S.stats.uniq, fights, avgFight: +(fightT / Math.max(1, fights)).toFixed(1), gold: Math.round(S.gold) }); dz = { fight: [], elite: [], boss: [] }; }
  });
  botTurn(SW, build, o.casual);
  const maxT = o.maxT || 3600;
  while (S.stats.time < maxT && !(o.until && o.until(G))) { G.update(0.05); while (setTimeout0.length) setTimeout0.pop()(); }
  return { log, S, fights, wins };
}
module.exports = { load, play, botTurn, BUILDS };
