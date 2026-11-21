/* Torment pacing: when each tier falls, how many deaths it cost, and what the smith was wearing. Usage: node tests/torment.cjs [seconds] [seeds] */
const { load, play } = require('./harness.cjs');
const maxT = +process.argv[2] || 40000, seeds = +process.argv[3] || 2;
for (const build of ['hammer', 'ember', 'storm']) for (let seed = 1; seed <= seeds; seed++) {
  const SW = load(), D = SW.data, G = SW.game;
  const snaps = {};
  G.on((type, d) => {
    if (type === 'areaClear' && d.first && (d.area === 4 || d.area === 2)) {
      const S = G.S, gear = D.SLOTS.map(s => S.gear[s]).filter(Boolean);
      snaps[`T${d.tier}${d.area === 4 ? 'end' : 'mid'}`] = `${(S.stats.time / 3600).toFixed(1)}h d${S.stats.deaths} anc${gear.filter(g => g.anc).length} rk${Math.round(gear.reduce((a, g) => a + (g.up || 0), 0) / gear.length)} ga${gear.reduce((a, g) => a + SW.items.greaterCount(g), 0)} p${SW.util.fmt(G.C.rating.power)}`;
    }
  });
  const hooks = G.listeners.slice();
  const r = play(SW, { build, maxT, seed, keep: hooks });
  const last = r.log[r.log.length - 1] || {};
  console.log(build.padEnd(7), seed, '| reached T' + last.tier + ' a' + last.area, 'avgF', last.avgFight, '|', Object.keys(snaps).filter(k => k[1] !== '0').map(k => k + ' ' + snaps[k]).join(' | '));
}
