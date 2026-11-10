/* Smeltworks — boot and the frame loop. */
(function () {
'use strict';
const SW = globalThis.SW, G = SW.game, UI = SW.ui, FX = SW.fx;

/* advance the game by dt seconds, feeding battle events to the renderer as they happen */
function advance(dt, draw) {
  let left = dt, guard = 0;
  while (left > 1e-6 && guard++ < 4000) {
    const s = Math.min(0.05, left); left -= s;
    G.update(s);
    const B = G.battle;
    if (B && B.ev.length) {
      if (draw) for (const ev of B.ev) { FX.handle(ev, B); UI.onBattle(ev); }
      B.ev.length = 0;
    }
  }
}

function boot() {
  const saved = G.load();
  G.on(UI.onGame);
  G.init(saved);
  FX.init(document.getElementById('cv'));
  UI.bind();
  UI.fresh();
  if (!saved) UI.welcome();

  let last = performance.now(), saveT = 0, hiddenAt = 0;
  function frame(now) {
    const real = Math.min(0.1, (now - last) / 1000); last = now;
    const speed = G.S.opts.speed;
    if (speed > 0) advance(real * speed, true);
    FX.update(real * (speed ? Math.min(speed, 3) : 0), G.battle, G.phase);
    FX.draw(G.battle, G.phase);
    UI.frame();
    UI.render();
    saveT += real; if (saveT > 20) { saveT = 0; G.save(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // keep playing while the tab is in the background (no drawing, same rules)
  document.addEventListener('visibilitychange', () => { if (document.hidden) hiddenAt = performance.now(); else { last = performance.now(); UI.fresh(); } });
  setInterval(() => {
    if (!document.hidden) return;
    const now = performance.now(), el = Math.min(30, (now - hiddenAt) / 1000); hiddenAt = now;
    if (G.S.opts.speed > 0) advance(el * G.S.opts.speed, false);
  }, 1000);
  window.addEventListener('beforeunload', () => G.save());
  SW.debug = { G, advance };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
