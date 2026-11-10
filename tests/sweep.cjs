/* Campaign pacing across builds and seeds. Usage: node tests/sweep.cjs [seconds] [seeds] */
const { load, play } = require('./harness.cjs');
const maxT = +process.argv[2] || 6000, seeds = +process.argv[3] || 3;
for (const build of ['hammer', 'ember', 'storm']) for (let seed = 1; seed <= seeds; seed++) {
  const SW = load();
  const mode = process.argv[4] || '';
  const r = play(SW, { build, maxT, seed, full: !mode.includes('rush'), casual: mode.includes('casual') });
  const acts = [2, 5, 8, 11, 14].map(a => { const l = r.log.find(x => x.tier === 0 && x.area === a); return l ? `${String(l.t).padStart(5)}s G${l.lvl} d${l.deaths}` : '      -      '; });
  const last = r.log[r.log.length - 1] || {};
  const tiers = [1, 2, 3, 4].map(t => { const l = r.log.find(x => x.tier === t && x.area === 14); return l ? `T${t} ${(l.t / 3600).toFixed(1)}h` : ''; }).filter(Boolean).join(' ');
  console.log(build.padEnd(7), 'seed', seed, '|', acts.join(' | '), '| reached T' + (last.tier || 0) + ' a' + (last.area || 0), 'deaths', r.S.stats.deaths, 'avgF', last.avgFight, 'leg', r.S.stats.leg, 'uq', r.S.stats.uniq, 'orbs', JSON.stringify(r.S.orbs), tiers);
}
