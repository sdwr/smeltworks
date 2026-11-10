/* Smeltworks — the arena: draws the battle and turns engine events into motion, sparks and numbers. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, SP = SW.sprites, I = SW.items;
const FX = SW.fx = {};
let cv, ctx, W = 800, H = 300, dpr = 1, S = 5, ground = 240;
let bg = null, bgTheme = 'ash', time = 0, shake = 0, flash = 0, flashCol = '#fff';
let ents = new Map(), parts = [], floats = [], bolts = [], rings = [], slashes = [], projs = [], drops = [], pillars = [], amb = [];
const hero = { x: 0, y: 0, lunge: 0, swing: 0, flash: 0, hurt: 0, cast: 0, dead: 0, bubble: 0, glow: 0, glowCol: '#fff', walk: 0, tx: 0 };
const rnd = (a, b) => a + Math.random() * (b - a);
const EL = D.EL_COLOR;

FX.init = function (canvas) { cv = canvas; ctx = cv.getContext('2d'); FX.resize(); };
FX.resize = function () {
  const r = cv.parentElement.getBoundingClientRect();
  W = Math.max(320, Math.round(r.width)); H = Math.max(180, Math.round(r.height));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  S = Math.max(3, Math.min(7, Math.floor(H / 58)));
  ground = Math.round(Math.min(H * 0.76, H - 112));
  hero.x = hero.tx = W * 0.2; hero.y = ground + H * 0.03;
  bg = null;
  for (const e of ents.values()) place(e, true);
};
FX.setScene = function (theme) { if (theme !== bgTheme) { bgTheme = theme; bg = null; amb = []; } };

/* ---------------------------------------------------------- background */
function seeded(n) { let a = n; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; }
const THEME = {
  ash:   { sky: ['#120d12', '#2a1716', '#5a2a18'], far: '#1a1114', near: '#100b0e', floor: ['#241a1a', '#120d0f'], glow: 'rgba(255,120,40,.28)', ember: '#ff8a3a', seed: 11 },
  mine:  { sky: ['#0b0a0e', '#15110f', '#2a1c12'], far: '#17120f', near: '#0c0a09', floor: ['#211a15', '#0f0c0a'], glow: 'rgba(255,170,70,.16)', ember: '#ffb05a', seed: 23 },
  crypt: { sky: ['#070b0f', '#0d1a22', '#143039'], far: '#0c171d', near: '#070d11', floor: ['#12212a', '#080f13'], glow: 'rgba(90,220,230,.14)', ember: '#7fe0e8', seed: 37 },
  storm: { sky: ['#090d1c', '#16234a', '#2f4a82'], far: '#101832', near: '#090e1e', floor: ['#1a2440', '#0b1020'], glow: 'rgba(140,190,255,.18)', ember: '#b4dcff', seed: 41 },
  hell:  { sky: ['#140405', '#3a0c08', '#8a2408'], far: '#200808', near: '#120405', floor: ['#2a0e0c', '#120506'], glow: 'rgba(255,90,20,.36)', ember: '#ff6a2a', seed: 53 },
};
function paintBg() {
  const T = THEME[bgTheme] || THEME.ash, c = document.createElement('canvas'), r = seeded(T.seed);
  c.width = W * dpr; c.height = H * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const hz = ground - H * 0.16;                      // horizon
  let g = x.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, T.sky[0]); g.addColorStop(0.6, T.sky[1]); g.addColorStop(1, T.sky[2]);
  x.fillStyle = g; x.fillRect(0, 0, W, hz + 2);
  g = x.createRadialGradient(W * 0.62, hz, 10, W * 0.62, hz, W * 0.6);
  g.addColorStop(0, T.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, hz + 2);
  // two ranges of silhouettes, stepped so they read as pixel art
  const ridge = (col, base, amp, step, spike) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, hz + 2);
    let y = base;
    for (let px = 0; px <= W + step; px += step) {
      y += (r() - 0.5) * amp; y = Math.max(base - amp * 2.2, Math.min(base + amp, y));
      const yy = r() < spike ? y - amp * (1 + r() * 2.5) : y;
      x.lineTo(px, Math.round(yy / 3) * 3); x.lineTo(px + step, Math.round(yy / 3) * 3);
    }
    x.lineTo(W, hz + 2); x.closePath(); x.fill();
  };
  ridge(T.far, hz - H * 0.2, H * 0.05, 14, bgTheme === 'storm' ? 0.14 : 0.06);
  ridge(T.near, hz - H * 0.08, H * 0.035, 9, 0.1);
  // set dressing
  if (bgTheme === 'mine' || bgTheme === 'crypt') {
    x.fillStyle = T.near;
    for (let i = 0; i < 16; i++) { const px = r() * W, hh = H * (0.06 + r() * 0.2), ww = 5 + r() * 12; x.beginPath(); x.moveTo(px - ww, 0); x.lineTo(px + ww, 0); x.lineTo(px, hh); x.fill(); }
    for (let i = 0; i < 5; i++) {
      const px = W * (0.08 + i * 0.22) + r() * 30, ww = bgTheme === 'crypt' ? 22 : 12;
      x.fillStyle = T.near; x.fillRect(px, hz - H * 0.42, ww, H * 0.44);
      x.fillStyle = 'rgba(255,255,255,.035)'; x.fillRect(px, hz - H * 0.42, 3, H * 0.44);
      if (bgTheme === 'mine') { x.fillStyle = T.near; x.fillRect(px - 40, hz - H * 0.42, 92, 9); const lg = x.createRadialGradient(px + 6, hz - H * 0.3, 2, px + 6, hz - H * 0.3, 46); lg.addColorStop(0, 'rgba(255,190,90,.5)'); lg.addColorStop(1, 'rgba(255,190,90,0)'); x.fillStyle = lg; x.fillRect(px - 44, hz - H * 0.5, 100, 100); x.fillStyle = '#ffd27a'; x.fillRect(px + 4, hz - H * 0.31, 5, 6); }
    }
  }
  if (bgTheme === 'ash') {
    x.strokeStyle = T.near; x.lineWidth = 4;
    for (let i = 0; i < 7; i++) { const px = r() * W, hh = H * (0.14 + r() * 0.16); x.beginPath(); x.moveTo(px, hz + 2); x.lineTo(px + (r() - 0.5) * 8, hz - hh); x.stroke(); x.lineWidth = 2; for (let k = 0; k < 3; k++) { const yy = hz - hh * (0.4 + r() * 0.5); x.beginPath(); x.moveTo(px, yy); x.lineTo(px + (r() - 0.5) * 44, yy - 8 - r() * 14); x.stroke(); } x.lineWidth = 4; }
  }
  if (bgTheme === 'hell') {
    x.strokeStyle = '#0c0304'; x.lineWidth = 3; x.setLineDash([5, 4]);
    for (let i = 0; i < 6; i++) { const px = r() * W; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (r() - 0.5) * 30, H * (0.15 + r() * 0.3)); x.stroke(); }
    x.setLineDash([]);
    x.fillStyle = 'rgba(255,110,30,.5)'; for (let i = 0; i < 5; i++) x.fillRect(r() * W, hz - 2, 30 + r() * 70, 3);
  }
  // floor
  g = x.createLinearGradient(0, hz, 0, H);
  g.addColorStop(0, T.floor[0]); g.addColorStop(1, T.floor[1]);
  x.fillStyle = g; x.fillRect(0, hz, W, H - hz);
  x.strokeStyle = 'rgba(255,255,255,.035)'; x.lineWidth = 1;
  for (let i = 1; i < 7; i++) { const yy = hz + Math.pow(i / 7, 1.7) * (H - hz); x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke(); }
  for (let i = -8; i <= 8; i++) { x.beginPath(); x.moveTo(W / 2 + i * 34, hz); x.lineTo(W / 2 + i * 150, H); x.stroke(); }
  for (let i = 0; i < 70; i++) { const yy = hz + r() * (H - hz), px = r() * W; x.fillStyle = r() < 0.12 ? T.ember : 'rgba(0,0,0,.35)'; x.globalAlpha = r() * 0.6; x.fillRect(px, yy, 2 + r() * 5, 2); }
  x.globalAlpha = 1;
  g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.3, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  return c;
}

/* ------------------------------------------------------------ entities */
function slotPos(m) {
  if (m.boss) return { x: W * 0.68, y: ground + H * 0.03 };
  const s = m.slot, back = s >= 3, row = (s % 3) - 1;
  return { x: W * (back ? 0.83 : 0.58) + (row === 0 ? -W * 0.045 : 0) + (m.big ? W * 0.02 : 0), y: ground + H * 0.03 + row * Math.min(H * 0.095, 34) };
}
function mobScale(m) { return m.boss ? S + 1 : m.champ ? S + 2 : m.elite ? S + 1 : m.def.small ? S - 2 : m.def.swarm ? S - 1 : S; }
function place(e, snap) { const p = slotPos(e.m); e.bx = p.x; e.by = p.y; if (snap) { e.x = p.x; e.y = p.y; } }
function entOf(uid) { return ents.get(uid); }
function head(e) { return { x: e.x, y: e.y - SP.size(e.m.def.spr).h * e.sc }; }
function mid(e) { return { x: e.x, y: e.y - SP.size(e.m.def.spr).h * e.sc * 0.5 }; }
const heroMid = () => ({ x: hero.x, y: hero.y - 9 * (S + 1) });

FX.battleStart = function () { ents.clear(); drops = drops.filter(d => d.fly); hero.dead = 0; hero.bubble = 0; projs = []; pillars = []; };
FX.clear = function () { ents.clear(); hero.dead = 0; projs = []; };
const newEnt = m => ({ m, sc: mobScale(m), flash: 0, lunge: 0, die: 0, spawn: 0, wind: 0, windDur: 1, hpLag: m.hp / m.max, shk: 0, ph: Math.random() * 6 });
/* Rebuild the arena from the battle as it stands. The game keeps playing while the tab is in the background, but
   nothing is drawn then, so monsters that arrived meanwhile would have no sprite when you come back. */
FX.sync = function (B) {
  ents.clear(); projs = []; pillars = []; bolts = []; rings = []; slashes = [];
  if (!B) { hero.dead = 0; return; }
  if (B.h.hp > 0) hero.dead = 0;
  for (const m of B.mobs) if (!m.dead && m.hp > 0) { const e = newEnt(m); place(e, true); ents.set(m.uid, e); }
};
FX.entCount = () => ents.size;

/* ------------------------------------------------------------ emitters */
function spark(x, y, col, n, sp, life, size, grav) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rnd(sp * 0.3, sp); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.2, life: rnd(life * 0.5, life), max: life, col, size: size || 3, grav: grav == null ? 500 : grav }); }
}
function float(x, y, text, col, size, o) {
  floats.push(Object.assign({ x: x + rnd(-10, 10), y, vy: -70, vx: rnd(-18, 18), text, col, size, life: 0.85, max: 0.85, pop: 0 }, o || {}));
  if (floats.length > 70) floats.splice(0, floats.length - 70);
}
function bolt(x1, y1, x2, y2, col, w) {
  const pts = [[x1, y1]], n = Math.max(3, Math.round(Math.hypot(x2 - x1, y2 - y1) / 28));
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([x1 + (x2 - x1) * t + rnd(-12, 12), y1 + (y2 - y1) * t + rnd(-12, 12)]); }
  pts.push([x2, y2]); bolts.push({ pts, life: 0.18, max: 0.18, col: col || EL.light, w: w || 3 });
}
function ring(x, y, r, col, life, w, flat) { rings.push({ x, y, r0: 6, r, col, life, max: life, w: w || 4, flat: flat !== false }); }
function slash(x, y, col, size, rot) { slashes.push({ x, y, col, size: size || 46, rot: rot == null ? rnd(-0.9, -0.3) : rot, life: 0.16, max: 0.16 }); }
const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function quake(n) { if (!calm) shake = Math.max(shake, n); }
FX.heroGlow = function (col) { hero.glow = 0.9; hero.glowCol = col; spark(hero.x, hero.y - 40, col, 26, 260, 0.9, 4, -120); };
FX.heroWalk = function (on) { hero.walk = on ? 1 : 0; };

function dropItem(e, it, fate) {
  const key = I.spriteKey(it);
  drops.push({ x: e.x, y: e.y - 30, vx: rnd(-90, 60), vy: rnd(-330, -230), gy: e.y + rnd(-4, 14), rar: it.rar, spr: key.spr, pal: key.pal, t: 0, landed: 0, fate, fly: 0, life: 0 });
}

/* ------------------------------------------------------------- events */
const BIG_SKILL = { sunder: 1, quake: 1, meteor: 1, wave: 1, brand: 1, eruption: 1, chain: 1, lance: 1, tempest: 1, ironskin: 1, forgeheart: 1, overcharge: 1 };
FX.handle = function (ev, B) {
  const A = SW.audio;
  switch (ev.e) {
    case 'spawn': {
      const e = newEnt(ev.m); e.spawn = 0.3; e.hpLag = 1;
      place(e, true); ents.set(ev.m.uid, e);
      spark(e.x, e.y - 20, '#3a3340', 8, 120, 0.4, 5, 0);
      if (ev.m.boss) { quake(10); A.play('boss'); }
      break;
    }
    case 'cast': {
      const sk = D.SKILL[ev.id], el = sk ? sk.el : 'phys', col = EL[el];
      if (ev.instant) {
        hero.glow = 0.5; hero.glowCol = ev.id === 'ironskin' ? '#8fd0ff' : col;
        ring(hero.x, hero.y - 6, 70, hero.glowCol, 0.4, 4);
        float(hero.x, hero.y - 130, sk.name, hero.glowCol, 14, { vx: 0, life: 1.1, max: 1.1 });
        A.play(ev.id === 'ironskin' ? 'barrier' : 'cast');
        break;
      }
      hero.swing = 0.22; hero.lunge = 0.22;
      const t = entOf(ev.tgt);
      if (sk && BIG_SKILL[ev.id]) float(hero.x + 20, hero.y - 128, sk.name, col, sk.type === 'ult' ? 18 : 13, { vx: 0, life: 1, max: 1 });
      if (sk && sk.type === 'ult') { A.play('ult'); flash = 0.25; flashCol = col; quake(8); }
      if (t) {
        const p = mid(t);
        if (ev.id === 'quake' || ev.id === 'meteor') { ring(W * 0.68, ground + H * 0.05, W * 0.3, col, 0.45, 6); quake(ev.id === 'meteor' ? 16 : 8); A.play('big'); if (ev.id === 'meteor') pillars.push({ x: p.x, y: t.y, life: 0.3, max: 0.3, col: '#ffd27a', w: 60, hammer: 1 }); }
        else if (ev.id === 'wave') { for (let i = 0; i < 26; i++) parts.push({ x: hero.x + 40 + i * 6, y: ground - rnd(0, 60), vx: rnd(380, 620), vy: rnd(-40, 40), life: rnd(0.3, 0.55), max: 0.55, col: i % 3 ? EL.fire : '#ffd27a', size: rnd(4, 8), grav: -60 }); A.play('fire'); }
        else if (ev.id === 'lance') { bolt(hero.x + 30, hero.y - 60, p.x, p.y, EL.light, 5); bolt(hero.x + 30, hero.y - 60, p.x, p.y, '#ffffff', 2); }
        else if (ev.id !== 'chain' && ev.id !== 'tempest' && ev.id !== 'eruption') slash(p.x, p.y, col, 30 + t.sc * 6);
      }
      break;
    }
    case 'chain': {
      let prev = { x: hero.x + 30, y: hero.y - 70 };
      for (const uid of ev.path) { const e = entOf(uid); if (!e) continue; const p = mid(e); bolt(prev.x, prev.y, p.x, p.y, EL.light, 3); prev = p; }
      A.play('light');
      break;
    }
    case 'bolt': { const e = entOf(ev.m); if (e) { const p = mid(e); bolt(p.x + rnd(-40, 40), -10, p.x, p.y, EL.light, 4); flash = Math.max(flash, 0.08); flashCol = EL.light; } A.play('light'); break; }
    case 'pulse': { for (const e of ents.values()) if (!e.m.dead) pillars.push({ x: e.x, y: e.y, life: 0.35, max: 0.35, col: EL.fire, w: 26 + e.sc * 3 }); quake(6); A.play('fire'); break; }
    case 'hit': {
      const e = entOf(ev.m); if (!e) break;
      const p = mid(e), col = ev.absorbed ? '#8fd0ff' : EL[ev.el] || '#fff';
      if (!ev.dot) { e.flash = 0.09; e.shk = ev.crit ? 7 : 3; spark(p.x, p.y, col, ev.crit ? 9 : 4, ev.crit ? 260 : 170, 0.35, 3); }
      else if (Math.random() < 0.5) parts.push({ x: p.x + rnd(-12, 12), y: p.y + rnd(-10, 16), vx: rnd(-20, 20), vy: -rnd(40, 90), life: 0.5, max: 0.5, col, size: 4, grav: -80 });
      const size = ev.dot ? 12 : ev.crit ? (ev.big ? 26 : 21) : ev.big ? 17 : 14;
      float(p.x, p.y - e.sc * 6, U.fmt(ev.amt) + (ev.crit ? '!' : ''), ev.crit && !ev.dot ? '#ffe36a' : col, size, ev.dot ? { vy: -42, life: 0.6, max: 0.6 } : ev.crit ? { pop: 1 } : null);
      if (ev.crit && !ev.dot) { quake(ev.big ? 9 : 4); A.play('crit'); }
      else if (!ev.dot) A.play(ev.el === 'fire' ? 'fire' : ev.el === 'light' ? 'light' : 'hit');
      break;
    }
    case 'miss': { const e = entOf(ev.m); if (e) { const p = head(e); float(p.x, p.y, 'Miss', '#9a94a0', 12); } break; }
    case 'status': { const e = entOf(ev.m); if (e) { const p = head(e); float(p.x, p.y - 8, ev.s === 'stun' ? 'Stunned' : 'Vulnerable', ev.s === 'stun' ? '#ffe36a' : '#d59bff', 12, { vx: 0 }); if (ev.s === 'stun') A.play('stun'); } break; }
    case 'die': {
      const e = entOf(ev.m); if (!e) break;
      e.die = 0.45; const p = mid(e);
      spark(p.x, p.y, '#d8d2c8', 12, 260, 0.5, 4); spark(p.x, p.y, '#5a1418', 8, 200, 0.6, 5);
      A.play('die');
      const d = ev.drops;
      if (d) {
        const n = Math.min(10, 2 + Math.round(Math.log10(d.gold + 1) * 2));
        for (let i = 0; i < n; i++) parts.push({ x: p.x, y: p.y, vx: rnd(-140, 140), vy: rnd(-320, -120), life: rnd(0.6, 0.9), max: 0.9, col: i % 2 ? '#ffd27a' : '#ffb347', size: 4, grav: 900, floor: e.y + rnd(-4, 10) });
        if (d.gold > 0) A.play('coin', 0.12);
        let best = -1;
        d.items.forEach((it, i) => { dropItem(e, it, d.fate[i]); if (d.fate[i] === 'bag') best = Math.max(best, it.rar); });
        if (best >= 0) A.play('drop' + best, best >= 3 ? 0 : 0.08);
        if (best >= 3) { flash = 0.3; flashCol = D.RARITY[best].color; }
      }
      break;
    }
    case 'flee': { const e = entOf(ev.m); if (e) { e.die = 0.3; e.fled = 1; const p = mid(e); spark(p.x, p.y, '#ffd27a', 16, 200, 0.5, 4, 0); float(p.x, p.y - 30, 'Escaped!', '#ffd27a', 15); } break; }
    case 'mobAtk': {
      const e = entOf(ev.m); if (!e) break;
      const hm = heroMid();
      if (ev.kind === 'ranged') { const p = mid(e); projs.push({ x: p.x, y: p.y, sx: p.x, sy: p.y, tx: hm.x, ty: hm.y, t: 0, dur: 0.14, col: EL[e.m.el] || '#fff' }); }
      else if (ev.kind === 'pulse') ring(e.x, e.y - 6, W * 0.5, EL.fire, 0.5, 5);
      else if (ev.kind === 'slam' || ev.kind === 'nova') { e.lunge = 0.3; ring(hero.x, hero.y - 4, 120, EL[e.m.el] || '#fff', 0.45, 7); quake(18); flash = 0.15; flashCol = EL[e.m.el] || '#ff5a3a'; }
      else e.lunge = 0.2;
      e.wind = 0;
      break;
    }
    case 'hurt': {
      const hm = heroMid();
      if (!ev.dot) { hero.flash = 0.1; hero.hurt = 0.18; spark(hm.x, hm.y, ev.absorbed ? '#8fd0ff' : '#ff5a4a', ev.big ? 12 : 5, 200, 0.35, 3); if (ev.big) quake(10); else quake(2); A.play(ev.big ? 'hurtBig' : 'hurt'); }
      float(hm.x - 26, hm.y - 40, '-' + U.fmt(ev.amt), ev.absorbed ? '#8fd0ff' : ev.dot ? (EL[ev.el] || '#ff8a7a') : '#ff5a4a', ev.dot ? 12 : ev.big ? 22 : 15, { vx: rnd(-40, -10) });
      break;
    }
    case 'dodge': { const hm = heroMid(); float(hm.x - 20, hm.y - 50, 'Dodge', '#b9e6ff', 13); A.play('dodge'); break; }
    case 'heal': { if (ev.amt > B.h.max * 0.015) { const hm = heroMid(); float(hm.x - 6, hm.y - 60, '+' + U.fmt(ev.amt), '#7dff8a', 13); } break; }
    case 'potion': { const hm = heroMid(); float(hm.x, hm.y - 70, 'Flask', '#ff7a7a', 15, { vx: 0 }); spark(hm.x, hm.y, '#ff5a5a', 18, 160, 0.8, 4, -200); A.play('potion'); break; }
    case 'barrier': { hero.bubble = 0.4; A.play('barrier'); break; }
    case 'phoenix': { const hm = heroMid(); flash = 0.5; flashCol = '#ffb347'; ring(hm.x, hm.y, 220, '#ffb347', 0.7, 8, false); float(hm.x, hm.y - 90, 'Phoenix!', '#ffb347', 22, { vx: 0, life: 1.3, max: 1.3 }); spark(hm.x, hm.y, '#ffb347', 40, 380, 1, 5, -100); A.play('level'); break; }
    case 'windup': { const e = entOf(ev.m); if (e) { e.wind = ev.dur; e.windDur = ev.dur; if (ev.name) { const p = head(e); float(p.x, p.y - 14, ev.name, '#ff5a3a', 17, { vx: 0, vy: -16, life: ev.dur, max: ev.dur }); } A.play('windup', 0.3); } break; }
    case 'mobCast': { const e = entOf(ev.m); if (e) { const p = head(e); ring(e.x, e.y - 6, 50, EL[e.m.el] || '#c79bff', 0.4, 3); if (ev.name) float(p.x, p.y - 10, ev.name, '#ffb347', 14, { vx: 0 }); } break; }
    case 'mobHeal': { const e = entOf(ev.m); if (e) { const p = head(e); float(p.x, p.y, '+' + U.fmt(ev.amt), '#7dff8a', 12); spark(p.x, p.y + 20, '#7dff8a', 6, 90, 0.5, 3, -150); } break; }
    case 'mobShield': { const e = entOf(ev.m); if (e) ring(e.x, e.y - 30, 46, '#8fd0ff', 0.4, 4, false); break; }
    case 'shieldBreak': { const e = entOf(ev.m); if (e) { const p = mid(e); spark(p.x, p.y, '#8fd0ff', 14, 260, 0.5, 4); } break; }
    case 'boom': {
      const e = entOf(ev.m), col = EL[ev.el] || EL.fire;
      if (e) { const p = mid(e); ring(p.x, p.y, ev.onHero ? W * 0.45 : 130, col, 0.4, 7, false); spark(p.x, p.y, col, 22, 380, 0.55, 5); }
      quake(9); A.play('big', 0.1);
      break;
    }
    case 'proc': {
      const hm = heroMid();
      if (ev.id === 'hammerfall') { ring(W * 0.68, ground + H * 0.05, W * 0.26, '#e6ebf5', 0.4, 5); quake(7); for (const e of ents.values()) if (!e.m.dead) pillars.push({ x: e.x, y: e.y, life: 0.25, max: 0.25, col: '#e6ebf5', w: 22, hammer: 1 }); }
      else float(hm.x + 10, hm.y - 84, ev.id === 'twin' ? 'Twin strike' : ev.id === 'echo' ? 'Echo' : 'Doom!', ev.id === 'doom' ? '#ffd27a' : '#c9ccd6', ev.id === 'doom' ? 18 : 12, { vx: 0 });
      break;
    }
    case 'buff': { if (ev.id === 'doom') { hero.glow = 0.6; hero.glowCol = '#ffd27a'; } break; }
    case 'slowed': { const hm = heroMid(); if (Math.random() < 0.4) float(hm.x, hm.y - 60, 'Slowed', '#9be3ff', 12, { vx: 0 }); break; }
    case 'wave': { if (ev.of > 1 && ev.n > 0) float(W * 0.5, H * 0.3, 'Wave ' + (ev.n + 1) + ' of ' + ev.of, '#e9dfcd', 17, { vx: 0, vy: -14, life: 1.2, max: 1.2 }); break; }
    case 'enrage': { const e = entOf(ev.m); if (e) { const p = head(e); float(p.x, p.y - 20, 'Enraged!', '#ff3a2a', 22, { vx: 0, life: 1.4, max: 1.4 }); quake(10); } break; }
    case 'frenzy': float(W * 0.6, H * 0.28, 'The enemy goes berserk!', '#ff3a2a', 18, { vx: 0, vy: -10, life: 1.6, max: 1.6 }); break;
    case 'end': {
      if (ev.win) { for (const d of drops) if (!d.fly) d.fly = 0.001; A.play('win', 0.5); }
      else { hero.dead = 0.001; quake(14); A.play('death'); }
      break;
    }
  }
};
/* loot that did not come from a kill (chests, clear bonuses) pops out next to the hero */
FX.spill = function (items, fate) {
  const e = { x: hero.x + 90, y: hero.y };
  items.forEach((it, i) => { dropItem(e, it, fate[i]); });
  for (const d of drops) if (!d.fly) d.autoFly = 0.9;
  spark(e.x, e.y - 20, '#ffd27a', 22, 300, 0.8, 4);
};

/* -------------------------------------------------------------- update */
FX.update = function (dt, B, phase) {
  time += dt;
  const T = THEME[bgTheme] || THEME.ash;
  shake = Math.max(0, shake - dt * 60); if (flash > 0) flash -= dt;
  for (const k of ['lunge', 'swing', 'flash', 'hurt', 'bubble', 'glow']) if (hero[k] > 0) hero[k] = Math.max(0, hero[k] - dt);
  if (hero.dead > 0) hero.dead = Math.min(1, hero.dead + dt * 2);
  // ambient motes
  if (amb.length < 26 && Math.random() < dt * 9) amb.push({ x: rnd(0, W), y: bgTheme === 'storm' || bgTheme === 'crypt' ? -5 : H + 5, vy: bgTheme === 'storm' ? rnd(380, 520) : bgTheme === 'crypt' ? rnd(50, 110) : -rnd(18, 60), vx: bgTheme === 'storm' ? -90 : rnd(-12, 12), life: 9, s: rnd(1.5, 3.5), a: rnd(0.25, 0.8) });
  for (const p of amb) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  amb = amb.filter(p => p.life > 0 && p.y > -10 && p.y < H + 10);
  if (bgTheme === 'storm' && Math.random() < dt * 0.12) { flash = Math.max(flash, 0.12); flashCol = '#b4dcff'; }
  for (const e of ents.values()) {
    const m = e.m;
    place(e);
    e.x += (e.bx - e.x) * Math.min(1, dt * 10); e.y += (e.by - e.y) * Math.min(1, dt * 10);
    for (const k of ['flash', 'lunge', 'spawn']) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
    if (e.shk > 0) e.shk = Math.max(0, e.shk - dt * 40);
    if (e.wind > 0) e.wind = Math.max(0, e.wind - dt);
    if (e.die > 0) { e.die -= dt; if (e.die <= 0) ents.delete(m.uid); continue; }
    const fr = m.hp / m.max; e.hpLag += (fr - e.hpLag) * Math.min(1, dt * 5);
    if (m.burns.length && Math.random() < dt * 14) { const p = mid(e); parts.push({ x: p.x + rnd(-14, 14), y: p.y + rnd(-6, 22), vx: rnd(-14, 14), vy: -rnd(50, 110), life: 0.5, max: 0.5, col: Math.random() < 0.3 ? '#ffd27a' : EL.fire, size: rnd(3, 6), grav: -60 }); }
    if (m.bleeds.length && Math.random() < dt * 6) { const p = mid(e); parts.push({ x: p.x + rnd(-10, 10), y: p.y, vx: 0, vy: 30, life: 0.5, max: 0.5, col: '#c0202a', size: 3, grav: 500 }); }
  }
  for (const p of parts) { p.vy += (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.floor && p.y > p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.5; } p.life -= dt; }
  parts = parts.filter(p => p.life > 0); if (parts.length > 500) parts.splice(0, parts.length - 500);
  for (const f of floats) { f.y += f.vy * dt; f.x += (f.vx || 0) * dt; f.vy *= 1 - dt * 1.6; f.life -= dt; }
  floats = floats.filter(f => f.life > 0);
  for (const a of [bolts, rings, slashes, pillars]) for (const o of a) o.life -= dt;
  bolts = bolts.filter(o => o.life > 0); rings = rings.filter(o => o.life > 0); slashes = slashes.filter(o => o.life > 0); pillars = pillars.filter(o => o.life > 0);
  for (const p of projs) { p.t += dt; const k = Math.min(1, p.t / p.dur); p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 18; }
  projs = projs.filter(p => p.t < p.dur);
  // loot: arc out, sit under its beam, then fly to the bag
  for (const d of drops) {
    d.t += dt;
    if (d.autoFly != null && !d.fly) { d.autoFly -= dt; if (d.autoFly <= 0) d.fly = 0.001; }
    if (!d.landed) { d.vy += 1100 * dt; d.x += d.vx * dt; d.y += d.vy * dt; if (d.y >= d.gy && d.vy > 0) { d.y = d.gy; d.landed = 1; if (d.fate === 'salvaged') { d.life = 0.35; spark(d.x, d.y - 8, '#8f8778', 6, 90, 0.4, 3, -100); } } }
    else if (d.fate === 'salvaged') d.life -= dt;
    else if (d.fly) { d.fly += dt * 2.2; const k = Math.min(1, d.fly); d.fx = d.x + (W + 30 - d.x) * k * k; d.fy = d.y + (H * 0.3 - d.y) * k - Math.sin(k * Math.PI) * 40; }
  }
  drops = drops.filter(d => !(d.fly >= 1) && !(d.fate === 'salvaged' && d.landed && d.life <= 0) && d.t < 60);
};

/* ---------------------------------------------------------------- draw */
function shadow(x, y, w) { ctx.fillStyle = 'rgba(0,0,0,.42)'; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.26, 0, 0, Math.PI * 2); ctx.fill(); }
function text(t, x, y, size, col, alpha, bold) {
  ctx.font = (bold === false ? '600 ' : '800 ') + size + 'px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.globalAlpha = alpha == null ? 1 : alpha;
  ctx.lineWidth = Math.max(3, size * 0.22); ctx.strokeStyle = 'rgba(8,6,12,.9)'; ctx.lineJoin = 'round';
  ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); ctx.globalAlpha = 1;
}
function drawHero(B, phase) {
  const G = SW.game, hs = S + 1, w = G.S.gear.weapon;
  const walking = phase === 'travel';
  const bob = walking ? Math.abs(Math.sin(time * 14)) * 4 : Math.sin(time * 2.6) * 1.5;
  const lx = hero.lunge > 0 ? Math.sin((1 - hero.lunge / 0.22) * Math.PI) * 30 : 0;
  const hx = hero.x + lx + (hero.hurt > 0 ? -5 : 0), hy = hero.y - bob;
  shadow(hero.x + lx, hero.y + 2, 9 * hs);
  ctx.save();
  if (hero.dead > 0) { ctx.translate(hx, hy); ctx.rotate(-hero.dead * 1.45); ctx.translate(-hx, -hy); ctx.globalAlpha = 1 - hero.dead * 0.5; }
  if (hero.glow > 0) { const g = ctx.createRadialGradient(hx, hy - 50, 4, hx, hy - 50, 100); g.addColorStop(0, hero.glowCol); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = Math.min(0.6, hero.glow); ctx.fillStyle = g; ctx.fillRect(hx - 100, hy - 150, 200, 200); ctx.globalAlpha = 1; }
  // weapon swings around the hand
  if (w) {
    const key = I.spriteKey(w);
    let rot = 0.15 + Math.sin(time * 2.6) * 0.04;
    if (hero.swing > 0) { const k = 1 - hero.swing / 0.22; rot = k < 0.3 ? -1.0 * (k / 0.3) : -1.0 + 2.3 * ((k - 0.3) / 0.7); }
    SP.draw(ctx, key.spr, key.pal, hx + 5.4 * hs, hy - 8.5 * hs, hs, { rot, ax: 0.22, ay: 0.82 });
  }
  SP.draw(ctx, 'hero', 'hero', hx, hy, hs, hero.flash > 0 ? { mode: 'flash' } : null);
  ctx.restore();
  if (B && B.h.barrier > 0) {
    const a = 0.3 + Math.sin(time * 6) * 0.06 + hero.bubble;
    ctx.strokeStyle = 'rgba(150,215,255,' + Math.min(0.9, a + 0.25) + ')'; ctx.fillStyle = 'rgba(120,190,255,' + a * 0.4 + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(hx, hy - 9 * hs, 11 * hs, 11.5 * hs, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
function drawMob(e) {
  const m = e.m, def = m.def, sz = SP.size(def.spr), h = sz.h * e.sc, w = sz.w * e.sc;
  const fly = def.spr === 'bat' || def.spr === 'wisp' || def.spr === 'wraith';
  const bob = Math.sin(time * (fly ? 5 : 2.4) + e.ph) * (fly ? 5 : 1.5) - (fly ? 14 : 0);
  let x = e.x, y = e.y + bob, alpha = 1, sx = 1, sy = 1;
  if (e.lunge > 0) x -= Math.sin((1 - e.lunge / (m.boss ? 0.3 : 0.2)) * Math.PI) * (m.boss ? 60 : 34);
  if (e.shk > 0) x += (Math.random() - 0.5) * e.shk;
  if (e.wind > 0) { x += (Math.random() - 0.5) * 5; const k = 1 - e.wind / e.windDur; sx = 1 + k * 0.08; sy = 1 + k * 0.08; }
  if (e.spawn > 0) { alpha = 1 - e.spawn / 0.3; y -= e.spawn * 40; }
  if (e.die > 0) { alpha = Math.max(0, e.die / 0.45); sy = 0.4 + alpha * 0.6; sx = 1 + (1 - alpha) * 0.3; if (e.fled) x += (1 - alpha) * 120; }
  shadow(e.x, e.y + 2, w * 0.36);
  if ((m.elite || m.boss) && e.die <= 0) {
    const col = m.boss ? '#ff5a3a' : D.ELITE[m.elite[0]].color;
    ctx.globalAlpha = 0.28 + Math.sin(time * 4 + e.ph) * 0.08; ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, w * 0.52, w * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (e.wind > 0) { const k = 1 - e.wind / e.windDur; ctx.globalAlpha = 0.25 + k * 0.4; ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.ellipse(e.x, e.y + 2, w * (0.4 + k * 0.5), w * (0.12 + k * 0.14), 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
  SP.draw(ctx, def.spr, def.pal, x, y, e.sc, { alpha, sx, sy, mode: e.flash > 0 ? 'flash' : null });
  if (m.stunT > 0 && e.die <= 0) for (let i = 0; i < 3; i++) { const a = time * 6 + i * 2.1; ctx.fillStyle = '#ffe36a'; ctx.fillRect(x + Math.cos(a) * w * 0.3 - 2, y - h - 6 + Math.sin(a) * 4, 5, 5); }
  if (m.barrier > 0 && e.die <= 0) { ctx.strokeStyle = 'rgba(150,215,255,.75)'; ctx.fillStyle = 'rgba(120,190,255,.14)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y - h * 0.5, w * 0.6, h * 0.6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  if (e.die > 0 || m.boss) return;
  // life bar
  const bw = Math.max(34, w * 0.8), bx = e.x - bw / 2, by = e.y - h - (fly ? 26 : 12) - (m.elite ? 4 : 0), bh = m.elite ? 6 : 4;
  ctx.fillStyle = 'rgba(8,6,12,.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
  ctx.fillStyle = '#f1ede4'; ctx.fillRect(bx, by, bw * Math.max(0, e.hpLag), bh);
  ctx.fillStyle = m.vulnT > 0 ? '#c05aff' : m.elite ? '#ff8a2a' : '#d0303a'; ctx.fillRect(bx, by, bw * Math.max(0, m.hp / m.max), bh);
  if (m.barrier > 0) { ctx.fillStyle = '#8fd0ff'; ctx.fillRect(bx, by - 3, bw * Math.min(1, m.barrier / (m.max * 0.3)), 2); }
  if (m.elite) {
    text(m.name, e.x, by - 16, 12, D.ELITE[m.elite[0]].color);
    text(m.elite.map(k => D.ELITE[k].name).join(' · '), e.x, by - 4, 10, '#c9c2b4', 0.9, false);
  }
}
FX.draw = function (B, phase) {
  if (!bg) bg = paintBg();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(bg, 0, 0, W, H);
  const T = THEME[bgTheme] || THEME.ash;
  for (const p of amb) { ctx.globalAlpha = p.a * Math.min(1, p.life); ctx.fillStyle = T.ember; if (bgTheme === 'storm') ctx.fillRect(p.x, p.y, 1.5, 9); else ctx.fillRect(p.x, p.y, p.s, p.s); }
  ctx.globalAlpha = 1;
  ctx.save();
  if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.7);
  // beams under dropped loot
  for (const d of drops) {
    if (!d.landed || d.fate === 'salvaged' || d.rar < 2 || d.fly) continue;
    const col = D.RARITY[d.rar].color, hh = d.rar >= 3 ? H : H * 0.42, ww = d.rar >= 3 ? 16 : 9;
    const g = ctx.createLinearGradient(0, d.y - hh, 0, d.y); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, col);
    ctx.globalAlpha = 0.5 + Math.sin(time * 7 + d.x) * 0.12; ctx.fillStyle = g; ctx.fillRect(d.x - ww / 2, d.y - hh, ww, hh);
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.fillRect(d.x - 1, d.y - hh, 2, hh);
    ctx.globalAlpha = 0.55; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(d.x, d.y, 24, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  for (const r of rings) {
    const k = 1 - r.life / r.max, rr = r.r0 + (r.r - r.r0) * (1 - Math.pow(1 - k, 2));
    ctx.globalAlpha = (1 - k) * 0.85; ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - k * 0.6);
    ctx.beginPath(); ctx.ellipse(r.x, r.y, rr, r.flat ? rr * 0.3 : rr, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // actors, back to front
  const list = [...ents.values()].sort((a, b) => a.y - b.y);
  let heroDrawn = false;
  for (const e of list) { if (!heroDrawn && e.y > hero.y) { drawHero(B, phase); heroDrawn = true; } drawMob(e); }
  if (!heroDrawn) drawHero(B, phase);
  for (const p of pillars) {
    const k = p.life / p.max;
    if (p.hammer) { ctx.globalAlpha = k; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.w * 0.12, p.y - H, p.w * 0.24, H); ctx.fillRect(p.x - p.w / 2, p.y - 40 - (1 - k) * 10, p.w, 34); }
    else { const g = ctx.createLinearGradient(0, p.y - 150, 0, p.y); g.addColorStop(0, 'rgba(255,200,90,0)'); g.addColorStop(0.5, '#ffd27a'); g.addColorStop(1, p.col); ctx.globalAlpha = k * 0.9; ctx.fillStyle = g; ctx.fillRect(p.x - p.w / 2 * k, p.y - 150 * (1.2 - k * 0.2), p.w * k, 150 * (1.2 - k * 0.2)); }
  }
  ctx.globalAlpha = 1;
  for (const s of slashes) {
    const k = 1 - s.life / s.max;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = s.col; ctx.lineWidth = 7 * (1 - k) + 1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, s.size * 0.5, s.size, -Math.PI * 0.82 + k * 0.6, -Math.PI * 0.18 + k * 0.6); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const b of bolts) {
    const k = b.life / b.max;
    for (const [col, w] of [[b.col, b.w * 2.2], ['#ffffff', b.w * 0.7]]) { ctx.globalAlpha = k * (w > b.w ? 0.55 : 1); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); b.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  for (const p of projs) { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill(); }
  for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6); ctx.fillStyle = p.col; const s = p.size; ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); }
  ctx.globalAlpha = 1;
  for (const d of drops) {
    const x = d.fly ? d.fx : d.x, y = d.fly ? d.fy : d.y, a = d.fate === 'salvaged' && d.landed ? Math.max(0, d.life / 0.35) : 1;
    if (d.landed && !d.fly && d.fate !== 'salvaged') { ctx.strokeStyle = D.RARITY[d.rar].color; ctx.globalAlpha = 0.9; ctx.lineWidth = 2; ctx.strokeRect(x - 15, y - 31, 30, 30); ctx.fillStyle = 'rgba(10,8,14,.7)'; ctx.fillRect(x - 14, y - 30, 28, 28); ctx.globalAlpha = 1; }
    SP.draw(ctx, d.spr, d.pal, x, y - 1 - (d.landed && !d.fly ? Math.abs(Math.sin(d.t * 3)) * 2 : 0), d.fly ? 2 - d.fly * 0.8 : 1.5, { alpha: a, rot: d.landed ? 0 : d.t * 6, ay: d.landed ? 1 : 0.5 });
  }
  for (const f of floats) {
    const k = f.life / f.max, sz = f.size * (f.pop ? 1 + Math.max(0, k - 0.75) * 2.4 : 1);
    text(f.text, f.x, f.y, sz, f.col, Math.min(1, k * 2.2));
  }
  ctx.restore();
  if (flash > 0 && !calm) { ctx.globalAlpha = Math.min(0.35, flash); ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
};
FX.width = () => W;
})();
