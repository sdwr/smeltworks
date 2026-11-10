/* Prints how a bot progresses through the campaign. Usage: node tests/balance.cjs [build] [seconds] [seed] */
const { load, play } = require('./harness.cjs');
const build = process.argv[2] || 'hammer', maxT = +process.argv[3] || 5400, seed = +process.argv[4] || 1;
const SW = load();
const t0 = Date.now();
const r = play(SW, { build, maxT, seed });
console.log(`build=${build} seed=${seed} simulated ${Math.round(r.S.stats.time)}s in ${Date.now() - t0}ms, fights ${r.fights} (${r.wins} won)`);
console.log('tier area name                 time  gear deaths power   leg uq fights avgF  minHP% fight/elite/boss  bossT');
let prev = 0;
for (const l of r.log) { console.log(`${l.tier}    ${String(l.area).padStart(2)}   ${l.name.padEnd(18)} ${String(l.t).padStart(5)} (+${String(l.t - prev).padStart(4)}) ${String(l.lvl).padStart(2)}  ${String(l.deaths).padStart(4)}  ${String(l.power).padStart(7)} ${String(l.leg).padStart(3)} ${l.uniq}  ${String(l.fights).padStart(5)} ${l.avgFight}  ${l.dz}  ${l.bossT}s`); prev = l.t; }
const S = r.S;
console.log('final: gear level', SW.hero.gearLevel(S.gear), 'kills', S.stats.kills, 'deaths', S.stats.deaths, 'gold', Math.round(S.gold), 'mats', JSON.stringify(S.mats), 'area', S.world.area, 'tier', S.world.tier);
console.log('gear:', SW.data.SLOTS.map(s => S.gear[s] ? `${s}:${['C','M','R','L','U'][S.gear[s].rar]}${S.gear[s].ilvl}+${S.gear[s].up}` : s + ':-').join(' '));
const st = SW.game.C.st; console.log('stats:', JSON.stringify({ dmg: st.dmg, aps: st.aps, dmgPct: st.dmgPct, crit: st.crit, critDmg: st.critDmg, aspd: st.aspd, life: st.maxLife, armor: st.armor, dr: st.dr, dodge: st.dodge }));
