/* Smeltworks — play data.

   Anonymous notes on how runs go, sent to a small collector so the game can be balanced from what really happens:
   where runs end, how long levels take, what gets crafted, and errors. Nothing is sent unless the game is running
   on its hosted address (D.TELEMETRY.hosts) and the player has said yes; the choice is in Settings.

   One event is one JSON object on one line:
     { type, game, version, install, session, run, time, host, os, data }
       install   a random id kept in this browser (not in the save, so starting over keeps it)
       session   a random id for this page load
       run       a random id for the run on the current map
   and the types are
     session_start  { tier, area, level, playtime, kills, falls, gear, off, def, bar, build, fresh }
     run_end        { why: fell|left|cleared, tier, area, level, rooms, secs, kills, gear, off, def, bar, build,
                      boss, killer, first, falls, playtime, craft: { ... counts since the last run_end } }
     error          { message, stack }
   Events wait in a queue in localStorage and are posted together; a failed post leaves them for next time. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, G = SW.game, Hr = SW.hero;
const T = SW.telemetry = { on: false, ready: false, session: '', run: '', craft: {}, errs: 0 };
const PREF = 'smeltworks.tele', QUEUE = 'smeltworks.tq', MAX_QUEUE = 150000, MAX_ERRS = 5;

const uid = () => { let s = ''; for (let i = 0; i < 4; i++) s += Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1); return s + '-' + Date.now().toString(36); };
/* ---- where things are kept and how they leave: replaced in tests */
T.env = {
  host: () => (typeof location !== 'undefined' ? location.hostname : ''),
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* storage blocked or full */ } },
  post: (url, body) => fetch(url, { method: 'POST', body, keepalive: body.length < 60000, headers: { 'Content-Type': 'text/plain' } }).then(r => r.ok, () => false),
  beacon: (url, body) => (typeof navigator !== 'undefined' && navigator.sendBeacon ? navigator.sendBeacon(url, body) : false),
  os: () => { const u = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''; return /Android/.test(u) ? 'Android' : /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Other'; },
};
/* ---- the player's choice: { id, on, asked } */
T.pref = function () { let p = null; try { p = JSON.parse(T.env.get(PREF) || 'null'); } catch (e) { /* unreadable: start again */ } if (!p || !p.id) { p = { id: uid(), on: false, asked: false }; T.env.set(PREF, JSON.stringify(p)); } return p; };
/* is this the hosted game? Anywhere else (a file on disk, a local server, an embedded copy) nothing is ever sent or asked */
T.hosted = () => D.TELEMETRY.hosts.includes(T.env.host());
T.asked = () => T.pref().asked;
T.enabled = () => T.hosted() && T.pref().on;
T.setEnabled = function (on) {
  const p = T.pref(), was = p.on; p.on = !!on; p.asked = true; T.env.set(PREF, JSON.stringify(p));
  if (!p.on) T.env.set(QUEUE, null);                       // saying no also throws away anything not yet sent
  else if (!was && T.ready) T.sessionStart();
};
/* ---- the queue */
T.push = function (type, data) {
  if (!T.enabled()) return false;
  const line = JSON.stringify({ type, game: 'SMELTWORKS', version: D.VERSION, install: T.pref().id, session: T.session, run: T.run, time: new Date().toISOString(), host: T.env.host(), os: T.env.os(), data });
  let q = (T.env.get(QUEUE) || '') + line + '\n';
  while (q.length > MAX_QUEUE) q = q.slice(q.indexOf('\n') + 1);      // offline for a long time: the oldest go first
  T.env.set(QUEUE, q);
  return true;
};
T.flush = function () {
  if (!T.enabled() || T.busy) return null;
  const body = T.env.get(QUEUE); if (!body) return null;
  T.busy = true;
  return Promise.resolve(T.env.post(D.TELEMETRY.url, body)).then(ok => {
    T.busy = false;
    if (ok) { const now = T.env.get(QUEUE) || ''; T.env.set(QUEUE, now.startsWith(body) ? now.slice(body.length) || null : now); }      // keep whatever was queued meanwhile
    return ok;
  });
};
/* the page is going away: hand whatever is left to the browser to send */
T.farewell = function () { if (!T.enabled()) return; const body = T.env.get(QUEUE); if (body && T.env.beacon(D.TELEMETRY.url, body)) T.env.set(QUEUE, null); };

/* ---- what is said */
/* the discipline most of the bar belongs to, or 'mixed' when no one has three of the five */
const build = bar => { const n = {}; for (const id of bar) { const d = D.SKILL[id] && D.SKILL[id].disc; if (d) n[d] = (n[d] || 0) + 1; } const top = Object.keys(n).sort((a, b) => n[b] - n[a])[0]; return top && n[top] >= 3 ? top : bar.length ? 'mixed' : 'none'; };
const snap = () => { const S = G.S, r = (G.C && G.C.rating) || {}, bar = S.hero.bar.filter(Boolean); return { gear: Hr.gearLevel(S.gear), off: Math.round(r.off || 0), def: Math.round(r.def || 0), bar, build: build(bar) }; };
const newRun = () => { const S = G.S; T.run = uid(); T.mark = { time: S.stats.time, kills: S.stats.kills }; T.killer = null; };
T.sessionStart = function () {
  const S = G.S, W = S.world;
  T.push('session_start', Object.assign({ tier: W.tier, area: W.area, level: D.areaLevel(W.area, W.tier), playtime: Math.round(S.stats.time), kills: S.stats.kills, falls: S.stats.deaths, fresh: !S.stats.kills }, snap()));
  T.flush();
};
T.runEnd = function (why, d) {
  const S = G.S, W = S.world, area = d.area, tier = d.tier, m = T.mark || { time: S.stats.time, kills: S.stats.kills };
  T.push('run_end', Object.assign({ why, tier, area, level: D.areaLevel(area, tier), rooms: d.rooms, secs: Math.round(S.stats.time - m.time), kills: S.stats.kills - m.kills,
    boss: !!d.boss, killer: why === 'fell' ? T.killer : null, first: !!d.first, falls: S.stats.deaths, playtime: Math.round(S.stats.time), craft: T.craft }, snap()));
  T.craft = {}; newRun(); T.flush();
};
const count = (k, n) => { T.craft[k] = (T.craft[k] || 0) + (n == null ? 1 : n); };
T.onGame = function (type, d) {
  switch (type) {
    case 'death': {      // remember what was standing over the smith: the boss if there was one, else the toughest thing left
      const t = G.target, alive = G.battle ? G.battle.alive() : [], mob = alive.find(m => m.boss) || alive.find(m => m.champ || m.elite) || alive[0];
      T.killer = { name: mob ? mob.def.name : null, boss: !!(t && t.type === 'boss'), room: t ? t.type : null }; break; }
    case 'runOver': T.runEnd(d.why, { area: d.area, tier: d.tier, rooms: d.rooms, boss: !!(T.killer && T.killer.boss) }); break;
    case 'areaClear': T.runEnd('cleared', { area: d.area, tier: d.tier, rooms: G.depthRec(d.area, d.tier).now, boss: true, first: d.first }); break;
    case 'offer': if (!d.free) count('bought'); break;      // a free one is counted when it lands, not again when it is revealed
    case 'freeTransmute': count('free'); break;
    case 'cube': count('pick_' + d.res.op); break;
    case 'forge': count(d.kind === 'transfigure' ? 'transfigure_' + d.res.kind : d.kind === 'enchantPick' ? (d.take ? 'reroll_take' : 'reroll_keep') : d.kind); break;
    case 'salvage': case 'autoSalvage': count('salvage'); break;
    case 'salvageAll': count('salvage', d.n); break;
  }
};
T.error = function (message, stack) {
  if (T.errs >= MAX_ERRS) return; T.errs++;
  const clean = s => String(s || '').replace(/(?:https?|file):\/\/[^\s)]*\/([^\s/):]+)/g, '$1').slice(0, 1500);      // file names and line numbers, never whole addresses
  T.push('error', { message: clean(message).slice(0, 300), stack: clean(stack) }); T.flush();
};
/* Start listening. Called once at boot, after the save is loaded. */
T.init = function () {
  T.session = uid(); T.craft = {}; T.errs = 0; newRun();
  G.on(T.onGame); T.ready = true;
  if (T.enabled()) T.sessionStart();
  if (typeof window !== 'undefined') {
    window.addEventListener('error', e => T.error(e.message, e.error && e.error.stack));
    window.addEventListener('unhandledrejection', e => T.error(e.reason && e.reason.message || String(e.reason), e.reason && e.reason.stack));
    window.addEventListener('pagehide', T.farewell);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') T.farewell(); });
  }
};
})();
