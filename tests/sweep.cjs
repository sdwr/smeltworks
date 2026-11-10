/* Campaign pacing across builds and seeds. Usage: node tests/sweep.cjs [seconds] [seeds] */
const { load, play } = require('./harness.cjs');
const maxT = +process.argv[2] || 6000, seeds = +process.argv[3] || 3;
for (const build of ['hammer', 'ember', 'storm']) for (let seed = 1; seed <= seeds; seed++) {
  const SW = load();
  const r = play(SW, { build, maxT, seed, full: process.argv[4] !== 'rush' });
  const acts = [2, 5, 8, 11, 14].map(a => { const l = r.log.find(x => x.tier === 0 && x.area === a); return l ? `${String(l.t).padStart(5)}s L${l.lvl} d${l.deaths}` : '      -      '; });
  const last = r.log[r.log.length - 1] || {};
  console.log(build.padEnd(7), 'seed', seed, '|', acts.join(' | '), '| reached T' + (last.tier || 0) + ' a' + (last.area || 0), 'deaths', r.S.stats.deaths, 'avgF', last.avgFight, 'leg', r.S.stats.leg, 'uq', r.S.stats.uniq);
}
