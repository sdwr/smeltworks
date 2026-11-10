const { load, play } = require('./harness.cjs');
const hist = {};
for (const build of ['hammer', 'ember', 'storm']) for (let seed = 1; seed <= 3; seed++) {
  const SW = load(); const G = SW.game;
  let cur = null;
  const orig = SW.Battle.prototype.hurtHero;
  SW.Battle.prototype.hurtHero = function (dmg, el, m, o) { const hp0 = this.h.hp; orig.call(this, dmg, el, m, o); if (this.over === 'lose' && !this._logged) { this._logged = 1; const k = `act${SW.data.AREAS[G.S.world.area].act + 1} ${this.spec.type.padEnd(5)} by ${m ? m.id + (m.elite ? '[' + m.elite.join(',') + ']' : '') : 'dot/' + el}${o && o.big ? ' BIG' : ''}${o && o.dot ? ' dot' : ''} lvlgap ${(this.spec.lvl - G.S.hero.level)}`; hist[k] = (hist[k] || 0) + 1; } };
  play(SW, { build, maxT: 6000, seed, tiers: false, until: g => g.S.world.cleared[0] >= 15 });
}
Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log(String(v).padStart(3), k));
