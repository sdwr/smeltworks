/* Smeltworks — everything drawn in the DOM: top bar, map, gear, skills, forge, codex, tooltips, dialogs. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, I = SW.items, Hr = SW.hero, G = SW.game, SP = SW.sprites, A = SW.audio;
const UI = SW.ui = { tab: 'skills', dirty: {}, forgeId: null, forgeAspect: null, cubeOrb: 'add', cubeCat: null, cubeLast: null, dragId: null, lastGold: -1 };
const $ = id => document.getElementById(id);
/* colour for a monster level against your gear level. In Torment gear is capped while monsters keep rising,
   so the comparison says nothing there and the level is left uncoloured. */
const lvlCls = (lvl, tier, good) => { if (tier > 0) return ''; const dl = lvl - Hr.gearLevel(G.S.gear); return dl >= 3 ? 'neg' : dl >= 1 ? 'warn' : good ? 'pos' : ''; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const RC = i => D.RARITY[i].color;
const mark = (...keys) => { for (const k of keys) UI.dirty[k] = 1; };
const pct = v => (Math.round(v * 10) / 10) + '%';
const MAT_NAME = { gold: 'gold', scrap: 'scrap', dust: 'ember dust', soul: 'soulsteel' };

/* ------------------------------------------------------------- pieces */
function itemCell(it, extra, idx, box) {
  const bag = idx == null ? '' : ` data-${box || 'bag'}="${idx}"`;
  if (!it) return `<div class="it empty ${extra || ''}"${bag}></div>`;
  const k = I.spriteKey(it);
  return `<div class="it r${it.rar} ${it.isNew ? 'new' : ''} ${I.greaterCount(it) ? 'has-ga' : ''} ${it.upg ? 'upg' : ''} ${it.lock ? 'lock' : ''} ${it.anc ? 'anc' : ''} ${extra || ''}" data-item="${it.id}"${bag} draggable="true">` +
    `<img src="${SP.url(k.spr, k.pal, 3)}" alt="">` +
    (it.upg ? '<b class="up">▲</b>' : '') + (I.greaterCount(it) ? `<b class="ga">★${I.greaterCount(it) > 1 ? I.greaterCount(it) : ''}</b>` : '') + (it.lock ? '<b class="lk">●</b>' : '') + (it.up ? `<b class="pl${it.up >= D.MW_MAX ? ' max' : ''}">${it.up}</b>` : '') +
    `<span class="il">${it.ilvl}</span></div>`;
}
function skillIcon(id, cls) {
  const sk = D.SKILL[id];
  return `<span class="sk d-${sk ? sk.disc : 'none'} ${sk && sk.type === 'passive' ? 'passive' : ''} ${cls || ''}"><img src="${SP.url('g_' + id, 'glyph', 3)}" alt=""></span>`;
}
function costHtml(c) {
  return Object.keys(c).map(k => `<span class="cost ${G.canPay({ [k]: c[k] }) ? '' : 'short'}"><i class="ci ${k}"></i>${U.fmt(c[k])}</span>`).join('');
}
function compareHtml(it) {
  const S = G.S, slots = it.slot === 'ring' ? ['ring1', 'ring2'] : [it.slot];
  let best = null;
  for (const s of slots) {
    const g = Object.assign({}, S.gear); g[s] = it;
    const r = Hr.compute(S, g).rating;
    if (!best || r.power > best.r.power) best = { r, s };
  }
  const cur = G.C.rating, d = (a, b) => (b ? (a / b - 1) * 100 : 100);
  const line = (label, v) => `<span class="${v > 0.5 ? 'pos' : v < -0.5 ? 'neg' : 'zero'}">${label} ${v > 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%</span>`;
  const dp = d(best.r.power, cur.power), worn = S.gear[best.s];
  const note = it.aspect || it.uniq || (worn && (worn.aspect || worn.uniq)) ? '<div class="tt-note">From stats and your current skills only. Aspect and unique powers are not counted.</div>' : '';
  return `<div class="tt-cmp"><b class="${dp > 0.5 ? 'pos' : dp < -0.5 ? 'neg' : 'zero'}">${dp > 0.5 ? '▲ Upgrade' : dp < -0.5 ? '▼ Weaker' : '◆ Sidegrade'}</b>${line('Damage', d(best.r.off, cur.off))}${line('Toughness', d(best.r.def, cur.def))}</div>${note}`;
}
function itemTooltip(it, o) {
  o = o || {};
  const imp = I.implicit(it);
  let h = `<div class="tt r${it.rar}">`;
  if (o.label) h += `<div class="tt-label">${o.label}</div>`;
  h += `<div class="tt-name">${esc(it.name)}</div>`;
  h += `<div class="tt-type">${I.typeLine(it)}<span>${I.itemPower(it)} Item Power</span></div>`;
  if (it.anc) h += `<div class="tt-anc">Ancestral<span>item level ${it.ilvl}, above the cap of ${D.GEAR_CAP}</span></div>`;
  if (it.up) h += `<div class="tt-mw">Masterwork rank ${it.up}/${D.MW_MAX}<span>+${it.up}% to everything on it</span></div>`;
  if (imp.dmg) h += `<div class="tt-base"><b>${U.fmt(imp.dmg)}</b> damage per hit<span>${imp.aps.toFixed(2)} attacks per second</span></div>`;
  else if (imp.armor) h += `<div class="tt-base"><b>${U.fmt(imp.armor)}</b> armor</div>`;
  else if (imp.life) h += `<div class="tt-base"><b>${U.fmt(imp.life)}</b> life</div>`;
  else if (imp.dmgPct) h += `<div class="tt-base"><b>+${imp.dmgPct}%</b> damage</div>`;
  if (it.affixes.length) {
    h += '<ul class="tt-aff">' + it.affixes.map((a, i) => {
      const mw = I.masterworked(it, i);
      return `<li class="${a.g ? 'great' : ''} ${mw ? 'mw' : ''} ${it.ench === i ? 'ench' : ''}">${I.affixText(it, a, i)} <span class="rng">${I.affixRange(it, a, i)}</span>${a.g ? ' <i>greater</i>' : ''}${mw ? ' <i>masterworked</i>' : ''}</li>`;
    }).join('') + '</ul>';
  }
  if (it.aspect) { const a = D.ASPECT[it.aspect.id], r = I.aspectRange(a, it.slot); h += `<div class="tt-asp">${I.powerText(it)} <span>[${r[0]}–${r[1]}]</span></div>`; }
  if (it.uniq) h += `<div class="tt-asp uq">${I.powerText(it)}</div><div class="tt-flavor">${esc(D.UNIQUE[it.uniq].flavor)}</div>`;
  if (o.compare) h += compareHtml(it);
  if (o.hint) h += `<div class="tt-hint">${o.hint}</div>`;
  return h + '</div>';
}
function skillTooltip(id, o) {
  const sk = D.SKILL[id], st = G.C.st, on = G.skillOn(id), disc = D.DISC[sk.disc];
  const bonus = st.skAll + st['sk' + disc.name], rank = sk.type === 'passive' ? Math.min(1 + bonus, sk.max + 4) : 1 + bonus;
  let h = `<div class="tt skill d-${sk.disc}"><div class="tt-name">${sk.name}</div>`;
  h += `<div class="tt-type">${disc.name} · ${D.TYPE_NAME[sk.type]}<span>Rank ${rank}${bonus ? ' (1 +' + (rank - 1) + ' from gear)' : ''}</span></div>`;
  const facts = [];
  if (sk.cost) facts.push(sk.cost + ' Heat');
  if (sk.cd) facts.push(sk.cd + 's cooldown');
  if (sk.mult) facts.push(D.EL_NAME[sk.el]);
  if (facts.length) h += `<div class="tt-facts">${facts.join(' · ')}</div>`;
  h += `<div class="tt-desc">${sk.desc(Hr.skillNums(sk, rank))}</div>`;
  h += `<div class="tt-next"><b>With one more rank from gear</b> ${sk.desc(Hr.skillNums(sk, rank + 1))}</div>`;
  if (o && o.tree) h += `<div class="tt-hint">${on ? 'Click to take it off' : 'Click to use it'} · Gear with "+ to ${disc.name} Skills" raises its rank</div>`;
  return h + '</div>';
}

/* ------------------------------------------------------------ tooltips */
let tipEl = null, tipKey = '';
function placeTip(el, x, y, w2) {
  const r = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
  let left = x + 18, top = y + 14;
  if (left + r.width + (w2 || 0) > vw - 8) left = x - r.width - 18;
  if (left < 8) left = 8;
  if (top + r.height > vh - 8) top = Math.max(8, vh - r.height - 8);
  el.style.left = left + 'px'; el.style.top = top + 'px';
  return { left, top, w: r.width };
}
function showTip(html, x, y, html2) {
  const t = $('tooltip'), t2 = $('tooltip2');
  t.innerHTML = html; t.classList.remove('hidden');
  if (html2) { t2.innerHTML = html2; t2.classList.remove('hidden'); } else t2.classList.add('hidden');
  const w2 = html2 ? t2.getBoundingClientRect().width + 8 : 0;
  const p = placeTip(t, x, y, w2);
  if (html2) { let l2 = p.left + p.w + 8; if (l2 + w2 > window.innerWidth) l2 = p.left - w2; t2.style.left = Math.max(4, l2) + 'px'; const r2 = t2.getBoundingClientRect(); t2.style.top = Math.max(8, Math.min(p.top, window.innerHeight - r2.height - 8)) + 'px'; }
}
function hideTip() { $('tooltip').classList.add('hidden'); $('tooltip2').classList.add('hidden'); tipKey = ''; tipEl = null; }
function tipFor(el, x, y) {
  const S = G.S;
  if (el.dataset.item) {
    const f = G.findItem(+el.dataset.item) || (UI.shown && UI.shown[el.dataset.item] ? { it: UI.shown[el.dataset.item], where: 'show' } : null);
    if (!f) return hideTip();
    const it = f.it;
    if (f.where === 'bag' || f.where === 'stash') {
      const hint = f.where === 'stash' ? 'Click to craft · Right-click to equip · Ctrl-click to move it to the bag'
        : `Click to craft · Right-click to equip · Shift-right-click to salvage · Ctrl-click to stash · Alt-click to ${it.lock ? 'unlock' : 'lock'}`;
      let cmp = null;
      if (it.slot === 'ring') { cmp = S.gear.ring1 && S.gear.ring2 ? (Hr.compute(S, Object.assign({}, S.gear, { ring1: null })).rating.power > Hr.compute(S, Object.assign({}, S.gear, { ring2: null })).rating.power ? S.gear.ring1 : S.gear.ring2) : null; }
      else cmp = S.gear[it.slot];
      showTip(itemTooltip(it, { compare: 1, hint }), x, y, cmp ? itemTooltip(cmp, { label: 'Equipped' }) : null);
      if (it.isNew) { it.isNew = 0; el.classList.remove('new'); }
    } else showTip(itemTooltip(it, { label: f.where === 'gear' ? 'Equipped' : null, hint: f.where === 'gear' ? 'Click to craft · Right-click to take it off' : null }), x, y);
  } else if (el.dataset.skill) showTip(skillTooltip(el.dataset.skill, { tree: el.dataset.tree }), x, y);
  else if (el.dataset.aspect) {
    const a = D.ASPECT[el.dataset.aspect], r = G.S.codex[a.id];
    const v = r == null ? null : (a.hi < 5 ? Math.round(U.lerp(a.lo, a.hi, r) * 100) / 100 : Math.round(U.lerp(a.lo, a.hi, r)));
    showTip(`<div class="tt r3"><div class="tt-name">${a.name.startsWith('of ') ? 'Aspect ' + a.name : a.name + ' Aspect'}</div><div class="tt-type">${D.ASPECT_CAT_NAME[a.cat]}<span>${D.ASPECT_SLOTS[a.cat].map(s => D.SLOT_NAME[s]).join(', ')}</span></div><div class="tt-asp">${a.desc.replace('{v}', v == null ? a.lo + '–' + a.hi : v)} <span>[${a.lo}–${a.hi}]</span></div>${r == null ? '<div class="tt-hint warn">Salvage a Legendary carrying this aspect to learn it.</div>' : '<div class="tt-hint">Imprint it onto Rare or Legendary gear in Crafting. Amulets get 50% more.</div>'}</div>`, x, y);
  } else if (el.dataset.tile) {
    const [tx, ty] = el.dataset.tile.split(',').map(Number), c = G.cell(tx, ty);
    showTip(tileTip(c), x, y);
  } else if (el.dataset.tip) showTip(`<div class="tt plain">${el.dataset.tip}</div>`, x, y);
}
function tileTip(c) {
  const names = { fight: 'Monster pack', elite: 'Elite pack', boss: 'Area boss', chest: 'Treasure chest', shrine: 'Shrine', start: 'Camp', wall: 'Impassable rock' };
  const desc = { fight: 'A fight. Gold, experience and the odd piece of gear.', elite: 'An empowered monster with special powers. Always drops Magic gear or better.',
    boss: G.S.world.map.name ? `${G.S.world.map.name} guards the way on. Beat it to open the next area.` : 'The master of this act. Bring your best gear.',
    chest: 'Free loot. No fight.', shrine: `A blessing that lasts ${D.SHRINE_FIGHTS} battles.`, start: 'Where you came in.', wall: '' };
  if (c.state === 'hidden') return '<div class="tt plain"><b>Unexplored</b><br>Clear a neighbouring tile to see what is here.</div>';
  let h = `<div class="tt plain"><b>${names[c.type]}</b>` + (c.type !== 'start' && c.type !== 'wall' && c.type !== 'shrine' ? ` <span class="${lvlCls(c.lvl, G.S.world.tier, true)}">Level ${c.lvl}</span>` : '') + `<br>${desc[c.type]}`;
  if (c.state === 'done') h += '<br><i>Cleared.</i>';
  else if (!G.canEnter(c) && c.type !== 'wall') h += '<br><i>Clear a path to it first.</i>';
  if (c.deaths) h += `<br><span class="neg">You have fallen here ${c.deaths === 1 ? 'once' : c.deaths + ' times'}.</span>`;
  return h + '</div>';
}

/* ------------------------------------------------------------- top bar */
function renderTop() {
  const S = G.S, W = S.world, area = D.AREAS[W.area], lvl = D.areaLevel(W.area, W.tier);
  $('where-act').textContent = (W.tier ? D.TIERS[W.tier].name + ' · ' : '') + D.ACTS[area.act].name;
  $('where-area').textContent = area.name;
  $('where-lvl').textContent = `Lv ${lvl}–${lvl + 3}`;
  $('hud-level').textContent = Hr.gearLevel(S.gear); $('hud-power').textContent = U.fmt(G.C.rating.power);
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === S.opts.speed));
  $('btn-auto').classList.toggle('on', !!S.opts.auto);
  $('btn-sound').classList.toggle('off', !S.opts.sound);
  $('opt-full').checked = !!S.opts.full; $('opt-advance').checked = S.opts.onClear === 'advance';
  const pts = emptySlots();
  $('pts-badge').textContent = pts > 0 ? pts : ''; $('pts-badge').classList.toggle('hidden', pts <= 0);
}
function renderHudBar() {
  const S = G.S;
  let h = '';
  for (let i = 0; i < D.BAR_SIZE; i++) {
    const id = S.hero.bar[i];
    h += id ? `<div class="slot" data-skill="${id}" data-bar="${i}">${skillIcon(id)}<i class="cd"></i><em></em></div>` : '<div class="slot none" data-tip="Empty skill slot. Learn skills in the Skills tab."></div>';
  }
  h += `<div class="slot flask" data-act="drink" data-tip="Flask (Q). Drink it to restore 35% of your Life. Refills over 22 seconds.${S.opts.autoFlask !== false ? ' It also drinks itself if you fall below 35% Life; you can turn that off in Settings.' : ' It will not drink itself: that is turned off in Settings.'}"><img src="${SP.url('i_flask', 'icon', 3)}" alt=""><i class="cd"></i><em></em><kbd>Q</kbd></div>`;
  $('bar').innerHTML = h;
}
/* per-frame: orbs, cooldowns, xp, purse, boss bar */
UI.frame = function () {
  moveToken();
  const S = G.S, B = G.battle, h = B ? B.h : null, st = G.C.st;
  const hp = h ? h.hp / h.max : 1, heat = (h ? h.heat : G.persist.heat == null ? 30 : G.persist.heat) / D.HEAT_MAX;
  const oh = $('orb-hp'); oh.firstElementChild.style.height = Math.max(0, hp * 100) + '%';
  oh.children[1].style.height = h && h.barrier > 0 ? Math.min(100, h.barrier / h.max * 100) + '%' : '0%';
  oh.lastElementChild.textContent = U.fmt(h ? Math.ceil(h.hp) : st.maxLife);
  oh.classList.toggle('low', hp < 0.35);
  const ot = $('orb-heat'); ot.firstElementChild.style.height = heat * 100 + '%'; ot.lastElementChild.textContent = Math.round(heat * D.HEAT_MAX);
  const cds = h ? h.cds : G.persist.cds || {};
  document.querySelectorAll('#bar .slot').forEach(el => {
    if (el.classList.contains('none')) return;
    let frac = 0, txt = '', dim = false;
    if (el.classList.contains('flask')) { const c = h ? h.potCd : G.persist.potCd || 0; frac = c / 22; txt = c > 0 ? Math.ceil(c) : ''; }
    else if (el.dataset.skill) {
      const sk = D.SKILL[el.dataset.skill], c = cds[sk.id] || 0;
      if (sk.cd) { frac = c / sk.cd; txt = c > 0 ? Math.ceil(c) : ''; }
      if (sk.cost) dim = heat * D.HEAT_MAX < sk.cost;
      el.classList.toggle('active', !!(h && h.buffs[sk.id]));
    }
    el.children[1].style.height = Math.min(100, frac * 100) + '%';
    if (el.children[2].textContent !== String(txt)) el.children[2].textContent = txt;
    el.classList.toggle('dim', dim);
  });
  if (UI.lastGold !== S.gold) { if (UI.lastGold >= 0 && S.gold > UI.lastGold) { const e = $('cur-gold').parentElement; e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } UI.lastGold = S.gold; $('cur-gold').textContent = U.fmt(S.gold); mark('forge'); }
  for (const k of ['scrap', 'dust', 'soul']) { const e = $('cur-' + k), v = U.fmt(S.mats[k] || 0); if (e.textContent !== v) e.textContent = v; }
  if (performance.now() - meterT > 250) { meterT = performance.now(); renderMeter(); }
  // boss bar
  const bb = $('bossbar'), boss = B ? B.mobs.find(m => !m.dead && (m.boss || m.champ)) : null;
  bb.classList.toggle('hidden', !boss);
  if (boss) {
    const nm = boss.boss ? `${boss.name}, ${D.BOSSES[boss.id].title}` : boss.name;
    if (bb.firstElementChild.textContent !== nm) { bb.firstElementChild.textContent = nm; bb.lastElementChild.textContent = boss.elite ? boss.elite.map(k => D.ELITE[k].name).join(' · ') : ''; }
    bb.children[1].firstElementChild.style.width = Math.max(0, boss.hp / boss.max * 100) + '%';
    bb.children[1].lastElementChild.textContent = `${U.fmt(boss.hp)} / ${U.fmt(boss.max)}`;
    bb.classList.toggle('rage', boss.enraged > 0);
  }
  // buffs
  let bh = '';
  if (S.world.shrine && S.world.shrineN > 0) { const s = D.SHRINES[S.world.shrine]; bh += `<span class="buff" style="--c:${s.color}" data-tip="${s.name}: ${s.desc}. ${S.world.shrineN} more battle${S.world.shrineN > 1 ? 's' : ''}."><b>${s.name.replace('Shrine of ', '')}</b>${S.world.shrineN}</span>`; }
  if (h) {
    for (const k in h.buffs) bh += `<span class="buff" style="--c:${D.DISC[D.SKILL[k].disc].color}"><b>${D.SKILL[k].name}</b>${Math.ceil(h.buffs[k].t)}s</span>`;
    if (h.slowT > 0) bh += '<span class="buff bad"><b>Slowed</b></span>';
    if (h.poison.length) bh += `<span class="buff bad"><b>Poisoned</b>${h.poison.length}</span>`;
    if (h.doomReady) bh += '<span class="buff" style="--c:#ffd27a"><b>Doom ready</b></span>';
  }
  if (UI.buffHtml !== bh) { UI.buffHtml = bh; $('buffs').innerHTML = bh; }
};

/* -------------------------------------------------------- damage meter */
const SRC_NAME = { burn: 'Burn', bleed: 'Bleed', thorns: 'Thorns', proc: 'Aspects and procs', punch: 'Punch' };
let meterT = 0;
function renderMeter() {
  const B = G.battle, live = B && B.ft > 0.3 ? B.dmgDone / B.ft : null;
  let dmg = 0, ft = 0; const by = {};
  const fights = live != null ? G.meter.slice(-9).concat([{ dmg: B.dmgDone, ft: B.ft, by: B.by }]) : G.meter;
  for (const m of fights) { dmg += m.dmg; ft += m.ft; for (const k in m.by) by[k] = (by[k] || 0) + m.by[k]; }
  const avg = ft > 0 ? dmg / ft : 0, last = G.meter.length ? G.meter[G.meter.length - 1] : null;
  const rows = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 6), top = rows.length ? by[rows[0]] : 1;
  let h = `<div class="m-top"><span>${live != null ? 'DPS this fight' : 'DPS last fight'}</span><b>${live != null ? U.fmt(live) : last ? U.fmt(last.dmg / last.ft) : '–'}</b></div>`;
  h += `<div class="m-avg"><span>${fights.length ? 'Last ' + fights.length + ' fight' + (fights.length === 1 ? '' : 's') : 'No fights yet'}</span><b>${fights.length ? U.fmt(avg) : ''}</b></div>`;
  for (const k of rows) { const sk = D.SKILL[k]; h += `<div class="m-row"><i style="width:${by[k] / top * 100}%;background:${sk ? D.DISC[sk.disc].color : k === 'burn' ? '#ff9a3c' : k === 'bleed' ? '#c0303a' : '#8a8478'}"></i><span>${sk ? sk.name : SRC_NAME[k] || k}</span><b>${Math.round(by[k] / dmg * 100)}%</b></div>`; }
  if (UI.meterHtml !== h) { UI.meterHtml = h; $('meter').innerHTML = h; }
}

/* ----------------------------------------------------------------- map */
const TILE_ICON = { fight: ['i_fight', 'icon'], elite: ['i_elite', 'icon'], boss: ['i_boss', 'boss'], chest: ['i_chest', 'icon'], shrine: ['i_shrine', 'shrine'], start: ['i_start', 'icon'] };
function renderMap() {
  const S = G.S, map = S.world.map, area = D.AREAS[map.area];
  let h = '';
  for (const c of map.cells) {
    const can = G.canEnter(c);
    let cls = `tile t-${c.type} s-${c.state}${can ? ' can' : ''}${c.deaths ? ' died' : ''}${G.target === c && G.phase !== 'idle' ? ' now' : ''}`;
    let inner = '';
    if (c.type !== 'wall' && c.state !== 'hidden') {
      const ic = TILE_ICON[c.type];
      inner = `<img src="${SP.url(ic[0], ic[1], 3)}" alt="">`;
      if (c.state !== 'done' && c.type !== 'chest' && c.type !== 'shrine') inner += `<span class="lv ${lvlCls(c.lvl, map.tier)}">${c.lvl}</span>`;
    }
    h += `<div class="${cls}" data-tile="${c.x},${c.y}" style="grid-column:${c.x + 1};grid-row:${c.y + 1}">${inner}</div>`;
  }
  h += `<div id="token"><img src="${SP.url('hero', 'hero', 3)}" alt=""></div>`;
  $('map').innerHTML = h;
  moveToken();
  $('map-name').textContent = area.name;
  const left = map.cells.filter(c => c.type !== 'wall' && c.state !== 'done').length;
  $('map-sub').textContent = map.bossDone ? (map.allDone ? 'Cleared out. Nothing left here.' : `Boss down. ${left} tile${left === 1 ? '' : 's'} left.`) : `${D.ACTS[area.act].name}${S.world.tier ? ' · ' + D.TIERS[S.world.tier].name : ''}`;
  renderHint();
}
/* The token is placed from the game state every frame (G.tokenPos): while travelling it sits part-way between the tile it left and the
   next one on the path, it fights from the doorway of a room, and walks in once the room is won. So it glides at any game speed, holds still when paused, and a redraw of the map never makes it jump. */
function moveToken() {
  const t = $('token'); if (!t) return;
  const map = G.S.world.map, p = G.tokenPos();
  const l = ((p.x + 0.5) / map.w * 100).toFixed(2) + '%', tp = ((p.y + 0.5) / map.h * 100).toFixed(2) + '%';
  if (t.style.left !== l) t.style.left = l;
  if (t.style.top !== tp) t.style.top = tp;
  t.classList.toggle('walk', (G.phase === 'travel' || G.phase === 'won') && G.S.opts.speed > 0);
}
const emptySlots = () => G.S.hero.bar.concat(G.S.hero.passives).filter(x => !x).length;
function renderHint() {
  const S = G.S, map = S.world.map;
  let t = '';
  if (!S.seen.fought) t = 'Click a glowing tile on the map to fight there.';
  else if (emptySlots() > 0) t = `You have ${emptySlots()} empty skill slot${emptySlots() > 1 ? 's' : ''}. Open Skills and fill them: every skill is free.`;
  else if (S.bag.some(b => b && b.upg)) t = 'Something in your bag is better than what you are wearing. Look for the green arrow.';
  else if (!S.opts.auto && S.stats.kills > 12 && !S.seen.auto) t = 'Tired of clicking tiles? Turn on Auto and the smith explores alone.';
  else if (map.bossDone && !S.opts.auto) t = 'This area is beaten. Use the area name at the top to travel on.';
  else if (!Object.keys(S.codex).length && S.stats.leg > 0) t = 'Salvage a Legendary to keep its aspect in the Codex, then imprint it on better gear in Crafting.';
  $('hint').textContent = t;
}

/* ---------------------------------------------------------------- gear */
const DOLL_L = ['helm', 'chest', 'gloves', 'pants', 'boots'], DOLL_R = ['weapon', 'offhand', 'amulet', 'ring1', 'ring2'];
function dollSlot(slot) {
  const it = G.S.gear[slot];
  return `<div class="dslot" data-slot="${slot}">${it ? itemCell(it, 'big' + (it.id === UI.forgeId ? ' sel' : '')) : `<div class="it empty big" data-tip="${D.SLOT_NAME[slot]}: nothing equipped"><span class="ph">${D.SLOT_NAME[slot]}</span></div>`}</div>`;
}
function renderGear() {
  const S = G.S, C = G.C, st = C.st, w = S.gear.weapon, wk = w ? I.spriteKey(w) : null;
  const dr = Hr.armorDR(st.armor, C.ref);
  const row = (l, v, tip) => `<div class="st" ${tip ? `data-tip="${tip}"` : ''}><span>${l}</span><b>${v}</b></div>`;
  let h = '<div class="doll"><div class="dcol">' + DOLL_L.map(dollSlot).join('') + '</div>';
  h += `<div class="dmid"><div class="portrait">${wk ? `<img class="pw" src="${SP.url(wk.spr, wk.pal, 6)}" alt="">` : ''}<img class="ph" src="${SP.url('hero', 'hero', 8)}" alt=""></div>`;
  h += `<div class="power" data-tip="A rough measure of how hard you hit and how much you can take. Use it to compare, not as gospel."><span>Power</span><b>${U.fmt(C.rating.power)}</b></div></div>`;
  h += '<div class="dcol">' + DOLL_R.map(dollSlot).join('') + '</div></div>';
  $('tab-gear').innerHTML = h;
  h = '<div class="stats"><div class="scol"><h4>Offence</h4>';
  h += row('Damage per hit', U.fmt(st.dmg), 'Weapon damage. Every skill is a percentage of this.');
  h += row('Attacks / sec', (st.aps * (1 + st.aspd / 100)).toFixed(2));
  h += row('Damage', '+' + pct(st.dmgPct));
  for (const k of ['physPct', 'firePct', 'lightPct', 'dot', 'elite']) if (st[k]) h += row(D.STAT_LABEL[k], '+' + pct(st[k]));
  h += row('Crit chance', pct(st.crit)) + row('Crit damage', '+' + pct(st.critDmg));
  h += row('Vulnerable', '+' + pct(20 + st.vuln), 'Vulnerable enemies take this much more damage from you.');
  h += '</div><div class="scol"><h4>Defence</h4>';
  h += row('Life', U.fmt(st.maxLife));
  h += row('Armor', `${U.fmt(st.armor)} <i>${Math.round(dr * 100)}%</i>`, 'Armor reduces direct hits. The percentage is against monsters in this area; poison and auras ignore it.');
  if (st.dr) h += row('Dmg reduction', pct(st.dr));
  if (st.dodge) h += row('Dodge', pct(st.dodge));
  if (st.loh) h += row('Life on hit', U.fmt(st.loh));
  if (st.regen) h += row('Life / sec', U.fmt(st.regen));
  if (st.thorns) h += row('Thorns', U.fmt(st.thorns), 'Damage dealt back to anything that hits you.');
  if (st.barrier) h += row('Barrier', '+' + pct(st.barrier), 'Makes every Barrier you gain stronger.');
  h += '</div><div class="scol"><h4>Utility</h4>';
  h += row('Cooldowns', '−' + pct(st.cdr)) + row('Heat gain', '+' + pct(st.heat)) + row('Gold find', '+' + pct(st.gold)) + row('Magic find', '+' + pct(st.mf), 'Raises the odds of Rare, Legendary and Unique drops.') + (st.flask ? row('Flask healing', '+' + pct(st.flask)) : '') + row('Movement', '+' + pct(st.move), 'How fast you walk between tiles. Only boots roll it.') + (st.orbFind ? row('Orb find', '+' + pct(st.orbFind)) : '');
  h += '</div></div>';
  $('gear-stats').innerHTML = h;
}
function renderBag() {
  const S = G.S, n = G.bagCount();
  let h = `<span class="bcount ${n >= D.BAG_SIZE ? 'full' : ''}">Bag <b>${n}</b>/${D.BAG_SIZE}</span>`;
  h += '<button class="small" data-act="sort" data-tip="Sort by rarity, then slot.">Sort</button>';
  h += '<span class="sep"></span><span class="lbl">Salvage</span>';
  h += ['Common', 'Magic', 'Rare'].map((nm, i) => `<button class="small r${i}" data-act="salv" data-rar="${i}" data-tip="Salvage every unlocked ${nm} item${i ? ' or lower' : ''} in your bag. Anything marked as an upgrade is kept.">${i ? nm : 'Com.'}</button>`).join('');
  h += '<span class="lbl" style="margin-left:8px" data-tip="Tick a rarity to salvage those drops the moment you pick them up. Upgrades are always kept.">Auto</span>';
  h += ['C', 'M', 'R', 'L'].map((nm, i) => `<label class="chk mini r${i}" data-tip="Auto-salvage ${D.RARITY[i].name} drops${i === 3 ? '. Their aspects still go to your Codex.' : ''}"><input type="checkbox" data-autosalv="${i}" ${S.opts.salv[i] ? 'checked' : ''}><span>${nm}</span></label>`).join('');
  $('baghead').innerHTML = h;
  const sel = it => (it && it.id === UI.forgeId ? 'sel' : '');
  let b = '';
  for (let i = 0; i < S.bag.length; i++) b += itemCell(S.bag[i] || null, sel(S.bag[i]), i, 'bag');
  $('bag').innerHTML = b;
  const m = G.stashCount();
  $('stashhead').innerHTML = `<span class="bcount ${m >= D.STASH_SIZE ? 'full' : ''}">Stash <b>${m}</b>/${D.STASH_SIZE}</span><span class="note">Never salvaged. Drag here or Ctrl-click.</span>`;
  b = '';
  for (let i = 0; i < S.stash.length; i++) b += itemCell(S.stash[i] || null, sel(S.stash[i]), i, 'stash');
  $('stash').innerHTML = b;
}

/* -------------------------------------------------------------- skills */
function renderSkills() {
  const S = G.S, hero = S.hero;
  const slot = (id, kind) => id ? `<div class="node on has" data-skill="${id}" data-tree="1">${skillIcon(id)}</div>` : `<div class="node none ${kind}"></div>`;
  let h = '<div class="sk-head"><div>Every skill is yours from the start. <span class="note">Their ranks come from gear.</span></div><button class="small" data-act="clear-skills" data-tip="Empty the bar and the passive slots.">Clear</button></div>';
  h += '<div class="sk-bar"><div><span class="lbl">Bar</span>' + hero.bar.map(id => slot(id, '')).join('') + '</div><div><span class="lbl">Passives</span>' + hero.passives.map(id => slot(id, 'round')).join('') + '</div></div>';
  h += '<p class="note">Five skills on the bar, one Basic and one Ultimate at most, and three passives. The smith picks the best Core skill for each moment.</p>';
  for (const d in D.DISC) {
    const disc = D.DISC[d], list = D.SKILLS.filter(s => s.disc === d), bonus = G.C.st.skAll + G.C.st['sk' + disc.name];
    h += `<div class="disc d-${d}"><div class="disc-head"><b>${disc.name}</b><span>${disc.blurb}</span>${bonus ? `<i>+${bonus} ranks from gear</i>` : ''}</div><div class="nodes">`;
    for (const sk of [...list.filter(s => s.type !== 'passive'), ...list.filter(s => s.type === 'passive')]) {
      const on = G.skillOn(sk.id);
      h += `<div class="node ${on ? 'has on' : ''}" data-skill="${sk.id}" data-tree="1">${skillIcon(sk.id)}<span class="rk">${on ? 'Rank ' + G.C.ranks[sk.id] : '&nbsp;'}</span><span class="ty">${D.TYPE_NAME[sk.type]}</span></div>`;
    }
    h += '</div></div>';
  }
  $('tab-skills').innerHTML = h;
}

/* --------------------------------------------------------------- forge */
/* an affix's name without its number. Flat and percent Maximum Life would read the same, so the percent one says so */
const affBare = k => D.AFFIX[k].t.replace(/\+?\{v\}%? ?(to )?/, '');
const affName = k => { const n = affBare(k); return D.AFFIX[k].t.includes('{v}%') && Object.keys(D.AFFIX).some(o => o !== k && affBare(o) === n) ? '% ' + n : n; };
/* One bench for everything done to a single piece: its affixes (with enchant rerolls), the cube, then the forge. */
function renderCraft() {
  const S = G.S, f = UI.forgeId ? G.findItem(UI.forgeId) : null;
  if (!f) { UI.forgeId = null; UI.cubeLast = null; }
  let h = '';
  if (!f) h += '<div class="anvil empty"><b>The bench is empty</b><p>Click any piece of gear, worn or in your bag or stash, to bring it here. Then use the cube to add and remove affixes, or the forge to upgrade it, reroll an affix or imprint a legendary aspect.</p></div>';
  else {
    const it = f.it, last = UI.cubeLast || {}, ec = I.enchantCost(it);
    h += `<div class="anvil"><div class="an-item">${itemCell(it, 'big')}<div><b style="color:${RC(it.rar)}">${esc(it.name)}</b><span>${I.typeLine(it)} · ${I.itemPower(it)} Item Power · ${f.where === 'gear' ? 'worn' : f.where === 'stash' ? 'in stash' : 'in bag'}</span></div>` +
      `<div class="an-btns">${f.where === 'gear' ? '' : '<button class="small" data-act="equip-one">Equip</button>'}<button class="small" data-act="bench-clear" data-tip="Take this piece off the bench. It stays ${f.where === 'gear' ? 'equipped' : f.where === 'stash' ? 'in your stash' : 'in your bag'}.">Clear</button></div></div>`;
    const imp = I.implicit(it);
    h += `<div class="main-stat">${imp.dmg ? `<b>${U.fmt(imp.dmg)}</b> damage per hit, ${imp.aps.toFixed(2)} attacks per second` : imp.armor ? `<b>${U.fmt(imp.armor)}</b> armor` : imp.life ? `<b>${U.fmt(imp.life)}</b> life` : `<b>+${imp.dmgPct}%</b> damage`}</div>`;
    h += '<ul class="aff-list">';
    it.affixes.forEach((a, i) => {
      const fresh = last.idx === i || last.orb === 'chaos' || last.orb === 'divine', ok = I.canEnchant(it, i);
      h += `<li class="${fresh ? 'fresh' : ''} ${it.ench === i ? 'ench' : ''} ${I.masterworked(it, i) ? 'mw' : ''}"><span><u style="background:${D.AFFIX_CAT[D.AFFIX[a.k].cat].color}" data-tip="${D.AFFIX_CAT[D.AFFIX[a.k].cat].name}"></u>${a.g ? '<b class="gst">★</b>' : ''}${I.affixText(it, a, i)} <span class="rng">${I.affixRange(it, a, i)}</span></span>` +
        (I.masterworked(it, i) ? '<em class="mwt" data-tip="Masterworked: this affix is 25% stronger (or +1 on a skills affix). Masterwork again at rank 25 to move it to another affix.">◆ masterworked</em>' : '') + (last.idx === i ? '<em>new</em>' : '') + (ok ? `<button class="small" data-act="enchant" data-idx="${i}" ${G.canPay(ec) ? '' : 'disabled'} data-tip="Enchant: reroll this affix into another. Once you pick an affix, it is the only one this piece can have rerolled. Each reroll on a piece costs a little more, up to five times the first price.">Reroll</button>` : '') + '</li>';
    });
    if (last.removed) h += `<li class="gone"><span>${last.removed}</span><em>removed</em></li>`;
    if (!it.affixes.length && !last.removed) h += '<li class="no"><span>No affixes yet.</span></li>';
    h += '</ul>';
    if (it.aspect || it.uniq) h += `<div class="an-asp">✦ ${I.powerText(it)}</div>`;
    h += `<div class="an-foot"><span>${it.affixes.length} of ${D.MAX_AFFIXES} affixes</span>${it.uniq ? '<span>A Unique\'s affixes cannot be rerolled</span>' : it.affixes.length ? `<span>Reroll costs ${costHtml(ec)}</span>` : ''}</div></div>`;
  }
  // ---- the cube
  const orb = UI.cubeOrb, O = D.ORBS[orb], aims = orb === 'add' || orb === 'remove', cat = aims ? UI.cubeCat : null;
  const why = !f ? 'Bring a piece of gear to the bench first.' : !(S.orbs[orb] > 0) ? `You have no ${O.name}s. They drop from ${D.ORB_BASIC.includes(orb) ? 'ordinary monsters, and always from elites and bosses' : 'elites, bosses and chests'}.` : I.cubeCheck(f.it, orb, cat);
  h += `<h4 class="sect">The cube</h4><div class="cube"><div class="cube-box"><div class="cslot">${f ? itemCell(f.it, 'big') : '<span>Gear</span>'}</div><b>+</b><div class="cslot" style="--c:${O.color}"><img src="${SP.url('orb', O.pal, 4)}" alt=""><em>${S.orbs[orb] || 0}</em></div><b>→</b><button class="big" data-act="transmute" ${why ? 'disabled' : ''}>Transmute</button></div>`;
  if (aims) {
    // tooltips: a Kindling Orb lists what could roll on this slot, a Quenching Orb lists what is on the piece and could go
    const aimTip = c => {
      if (orb === 'remove') {
        if (!f) return c ? 'Removes one random ' + D.AFFIX_CAT[c].name + ' affix.' : 'Removes one random affix of any type.';
        const on = f.it.affixes.map((a, i) => ({ a, i })).filter(o => !c || D.AFFIX[o.a.k].cat === c).map(o => I.affixText(f.it, o.a, o.i));
        const what = c ? D.AFFIX_CAT[c].name + ' affix' : 'affix';
        const list = on.map(t => '<br>• ' + t).join('');
        return !on.length ? `This piece has no ${what}${c ? '' : 'es'} to remove.` : on.length === 1 ? `The only ${what} on this piece, so it is the one removed:${list}` : `One of these ${on.length} ${what}es is removed at random:${list}`;
      }
      const keys = (c ? D.AFFIX_CAT[c].keys : Object.keys(D.AFFIX)).filter(k => !f || (D.AFFIX[k].slots.includes(I.poolKey(f.it)) && !f.it.affixes.some(a => a.k === k)));
      return (f ? `Can roll on this ${D.BASES[f.it.base].name.toLowerCase()}: ` : 'Can roll: ') + (keys.map(affName).join(', ') || 'nothing');
    };
    h += '<div class="aim"><span class="lbl">Aim at</span>' + [null, ...Object.keys(D.AFFIX_CAT)].map(c => {
      const no = c && f && I.cubeCheck(f.it, orb, c) && !I.cubeCheck(f.it, orb, null);
      return `<button class="small ${c === cat || (!c && !cat) ? 'on' : ''}" data-aim="${c || ''}" ${no ? 'disabled' : ''} style="--c:${c ? D.AFFIX_CAT[c].color : '#e9dfcd'}" data-tip="${esc(aimTip(c))}">${c ? D.AFFIX_CAT[c].name : 'Any type'}</button>`;
    }).join('') + '</div>';
  }
  const say = why || (cat ? (orb === 'add' ? `Adds one random ${D.AFFIX_CAT[cat].name} affix.` : `Removes one random ${D.AFFIX_CAT[cat].name} affix.`) : orb === 'add' ? 'Adds one random affix of any type.' : orb === 'remove' ? 'Removes one random affix of any type.' : O.desc);
  h += `<p class="cube-say ${why ? 'no' : ''}">${say}</p></div>`;
  h += '<div class="orbs">' + D.ORB_IDS.map(k => `<button class="orb-btn ${k === orb ? 'on' : ''}" data-orb="${k}" style="--c:${D.ORBS[k].color}" data-tip="${D.ORBS[k].desc}"><img src="${SP.url('orb', D.ORBS[k].pal, 3)}" alt=""><b>${D.ORBS[k].name}</b><span>${D.ORBS[k].short}</span><i>${S.orbs[k] || 0}</i></button>`).join('') + '</div>';
  // ---- the forge
  h += '<h4 class="sect">The forge</h4>';
  if (!f) h += '<p class="note">Upgrades, legendary aspects and salvage appear here once a piece is on the bench.</p>';
  else {
    const it = f.it, max = D.MW_MAX, up = it.up || 0, c = I.upgradeCost(it), no = I.upgradeCheck(it);
    const gain = UI.mwLast && UI.mwLast.id === it.id && UI.mwLast.ranks ? UI.mwLast.ranks : 0, has = it.mw && it.mw.length ? it.mw[0] : -1;
    h += `<div class="op first"><div class="op-t"><b>Masterwork</b><span>Each strike adds 1 to 3 ranks, and every rank is +1% to everything on the piece. At rank ${max}, strike once more to masterwork one random affix for +25%. Striking again moves it to a different affix.</span></div>`;
    h += `<div class="mw-bar ${up >= max ? 'full' : ''}"><i style="width:${up / max * 100}%"></i><b>Rank ${up}/${max}</b>${gain ? `<em>+${gain}</em>` : ''}</div>`;
    if (up >= max) h += `<div class="mw-aff">${has >= 0 && it.affixes[has] ? '◆ Masterworked: ' + I.affixText(it, it.affixes[has], has) : it.affixes.length ? 'No affix is masterworked yet.' : ''}</div>`;
    h += `<div class="op-a">${no ? `<i>${no}</i>` : costHtml(c) + `<button data-act="upgrade" ${G.canPay(c) ? '' : 'disabled'}>${up < max ? 'Masterwork<small>+1 to 3 ranks</small>' : has >= 0 ? 'Masterwork a different affix' : 'Masterwork an affix'}</button>`}</div>`;
    h += '</div>';
    if (!it.uniq) {
      h += '<div class="op"><div class="op-t"><b>Imprint a legendary aspect</b><span>Stamp an aspect you have learned onto a Rare or Legendary piece. It replaces any aspect already there. A Rare becomes Legendary, and a Legendary cannot be cubed, so add and remove affixes first.</span></div>';
      if (it.rar < 2) h += '<div class="op-a"><i>Only Rare and Legendary gear can hold an aspect.</i></div>';
      else {
        const list = D.ASPECTS.filter(a => S.codex[a.id] != null && I.canImprint(it, a.id));
        if (!list.length) h += `<div class="op-a"><i>${Object.keys(S.codex).length ? 'None of the aspects you know fit this slot.' : 'You know no aspects yet.'} Salvage a Legendary to learn its aspect.</i></div>`;
        else {
          if (!list.some(a => a.id === UI.forgeAspect)) UI.forgeAspect = null;
          const c = I.imprintCost(it);
          h += '<div class="asp-pick">' + list.map(a => `<button class="asp ${UI.forgeAspect === a.id ? 'on' : ''} c-${a.cat}" data-pick="${a.id}" data-aspect="${a.id}">${a.name.replace(/^of (the )?/, '')}</button>`).join('') + '</div>';
          h += `<div class="op-a">${costHtml(c)}<button data-act="imprint" ${UI.forgeAspect && G.canPay(c) ? '' : 'disabled'}>${UI.forgeAspect ? 'Imprint ' + D.ASPECT[UI.forgeAspect].name : 'Choose an aspect'}</button></div>`;
        }
      }
      h += '</div>';
    }
    if (f.where === 'bag') { const y = I.salvageYield(it); h += `<div class="op slim"><div class="op-t"><b>Salvage</b><span>Break it down for ${Object.keys(y).map(k => y[k] + ' ' + MAT_NAME[k]).join(', ')}${it.aspect ? '. Its aspect goes into your Codex.' : '.'}</span></div><div class="op-a"><button class="danger" data-act="salvage-one">Salvage</button></div></div>`; }
  }
  $('tab-craft').innerHTML = h;
}
function renderCommission() {
  const S = G.S, lvl = G.areaLevel(), cc = { gold: I.commissionCost(lvl) }, anc = D.ANC_CHANCE[S.world.tier] || 0;
  let h = `<div class="cx-head"><b>Commission</b><span>Pay the smelter to cast a random piece for a slot of your choice. It comes at item level ${Math.min(lvl, D.GEAR_CAP)}${lvl > D.GEAR_CAP ? ', the cap' : ", this area's level"}, and is never Common.${anc ? ` In ${D.TIERS[S.world.tier].name} it has a ${Math.round(anc * 100)}% chance to be Ancestral (item level ${D.ANC_LEVEL}).` : ''} It lands in your bag.</span></div>`;
  h += `<div class="op-a" style="justify-content:flex-start">${costHtml(cc)}<span class="note">each. You have ${U.fmt(S.gold)} gold${G.bagCount() >= D.BAG_SIZE ? ', but your bag is full' : ''}.</span></div><div class="com-row">` +
    D.ITEM_SLOTS.map(s => { const worn = (s === 'ring' ? [S.gear.ring1, S.gear.ring2] : [S.gear[s]]).map(x => (x ? x.ilvl : '–')).join(' / ');
      return `<button class="com" data-act="commission" data-slot="${s}" ${G.canPay(cc) ? '' : 'disabled'} data-tip="Cast a ${D.SLOT_NAME[s].toLowerCase()}. You are wearing item level ${worn}."><img src="${SP.url(D.BASES[D.BASES_BY_SLOT[s][0]].spr, D.material(lvl).pal, 3)}" alt=""><b>${D.SLOT_NAME[s]}</b><span>wearing ${worn}</span></button>`; }).join('') + '</div>';
  $('tab-commission').innerHTML = h;
}

/* --------------------------------------------------------------- codex */
function renderCodex() {
  const S = G.S, have = Object.keys(S.codex).length;
  let h = `<div class="cx-head"><b>${have}</b> of ${D.ASPECTS.length} aspects learned<span>Salvage a Legendary to learn its aspect; a better roll replaces a worse one. To put one on gear, click it here (or open a Rare or Legendary piece in Crafting) and use Imprint.</span></div>`;
  for (const cat of ['off', 'def', 'util']) {
    h += `<h4 class="c-${cat}">${D.ASPECT_CAT_NAME[cat]}<span>${D.ASPECT_SLOTS[cat].map(s => D.SLOT_NAME[s]).join(', ')}</span></h4><div class="cx-list">`;
    for (const a of D.ASPECTS.filter(x => x.cat === cat)) {
      const r = S.codex[a.id], v = r == null ? null : (a.hi < 5 ? Math.round(U.lerp(a.lo, a.hi, r) * 100) / 100 : Math.round(U.lerp(a.lo, a.hi, r)));
      h += `<div class="cx ${r == null ? 'no' : 'has'}" data-aspect="${a.id}" ${r == null ? '' : `data-usecodex="${a.id}"`}><b>${a.name}</b><span>${r == null ? 'Not found yet' : a.desc.replace('{v}', '<em>' + v + '</em>')}</span>${r == null ? '' : `<i style="--p:${Math.round(r * 100)}%"></i>`}</div>`;
    }
    h += '</div>';
  }
  const t = S.stats.time, hh = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60);
  h += '<h4>Records</h4><div class="rec">' + [['Time played', (hh ? hh + 'h ' : '') + mm + 'm'], ['Monsters slain', U.fmt(S.stats.kills)], ['Elites slain', U.fmt(S.stats.elites || 0)], ['Areas cleared', S.stats.clears], ['Times fallen', S.stats.deaths], ['Legendaries found', S.stats.leg], ['Uniques found', S.stats.uniq], ['Best power', U.fmt(S.stats.best || 0)]].map(r => `<div class="st"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('') + '</div>';
  $('tab-codex').innerHTML = h;
}

/* -------------------------------------------------------------- render */
UI.render = function () {
  const d = UI.dirty; UI.dirty = {};
  if (d.top) renderTop();
  if (d.hud) renderHudBar();
  if (d.map) renderMap(); else if (d.hint) renderHint();
  if (d.gear) renderGear();
  if (d.bag || d.gear || d.forge || d.cube) renderBag();
  if (d.skills && UI.tab === 'skills') renderSkills();
  if ((d.forge || d.cube || d.bag) && UI.tab === 'craft') renderCraft();
  if ((d.forge || d.bag || d.map) && UI.tab === 'commission') renderCommission();
  if (d.codex && UI.tab === 'codex') renderCodex();
};
UI.setTab = function (t) {
  UI.tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  for (const k of ['skills', 'craft', 'commission', 'codex']) $('tab-' + k).classList.toggle('hidden', k !== t);
  $('panel').scrollTop = 0;
  mark(t === 'craft' || t === 'commission' ? 'forge' : t); hideTip();
};
/* bring a piece of gear to the crafting bench */
UI.craft = function (id) {
  UI.forgeId = id; UI.forgeAspect = UI.pendingAspect || null; UI.pendingAspect = null; UI.cubeLast = null; UI.mwLast = null;
  UI.setTab('craft'); mark('forge', 'bag', 'gear');
  // when the panes are stacked (narrow windows), the bench is further down the page: go to it
  if (matchMedia('(max-width: 1240px)').matches) $('craft').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ------------------------------------------------- banners, feed, toast */
let bannerT = null;
UI.banner = function (title, sub, cls, ms) {
  const b = $('banner');
  b.className = 'show ' + (cls || ''); b.innerHTML = `<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}`;
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.className = ''; }, ms || 2200);
};
UI.feed = function (html, cls) {
  const f = $('feed'), d = document.createElement('div');
  d.className = 'fd ' + (cls || ''); d.innerHTML = html; f.appendChild(d);
  while (f.children.length > 7) f.removeChild(f.firstChild);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 600); }, 5200);
};
UI.feedItem = function (it, fate) {
  UI.shown = UI.shown || {}; UI.shown[it.id] = it;
  UI.shownIds = UI.shownIds || []; UI.shownIds.push(it.id); if (UI.shownIds.length > 40) delete UI.shown[UI.shownIds.shift()];
  if (fate === 'salvaged') { if (it.rar >= 2 || it.anc) UI.feed(`<span class="dim">Salvaged</span> <b style="color:${RC(it.rar)}" data-item="${it.id}">${esc(it.name)}</b>${it.anc ? ' <span class="anc-t">Ancestral</span>' : ''}`, 'sal'); return; }
  if (it.rar === 0 && !it.upg) return;
  UI.feed(`${it.upg ? '<i class="pos">▲</i> ' : ''}${I.greaterCount(it) ? '<i class="hot">' + '★'.repeat(I.greaterCount(it)) + '</i> ' : ''}<b style="color:${RC(it.rar)}" data-item="${it.id}">${esc(it.name)}</b> <span class="${it.anc ? 'anc-t' : 'dim'}">${I.typeLine(it)}</span>`, 'r' + it.rar + (it.anc ? ' anc' : ''));
};
UI.toast = function (msg, cls) {
  const t = $('toasts'), d = document.createElement('div');
  d.className = 'toast ' + (cls || ''); d.textContent = msg; t.appendChild(d);
  while (t.children.length > 3) t.removeChild(t.firstChild);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 2600);
};
const deny = msg => { UI.toast(msg, 'bad'); A.play('deny'); };

/* -------------------------------------------------------------- modals */
UI.modal = function (html, cls) { $('modal-box').className = cls || ''; $('modal-box').innerHTML = html; $('modal').classList.remove('hidden'); hideTip(); };
UI.closeModal = function () { $('modal').classList.add('hidden'); };
UI.travel = function (tier) {
  const S = G.S, W = S.world; tier = tier == null ? W.tier : tier;
  let h = '<h2>Travel</h2><p class="sub">Go back to farm, or press on. A new map is drawn each time you arrive.</p><div class="tiers">';
  D.TIERS.forEach((t, i) => { const open = W.cleared[i] != null; h += `<button class="tier ${i === tier ? 'on' : ''}" ${open ? '' : 'disabled'} data-tier="${i}" style="--c:${t.color}">${t.name}${open ? '' : ' <small>locked</small>'}</button>`; });
  h += '</div><div class="acts">';
  D.ACTS.forEach((act, ai) => {
    h += `<div class="act"><h3>${act.name}</h3>`;
    for (const a of D.AREAS.filter(x => x.act === ai)) {
      const open = G.isUnlocked(a.idx, tier), done = W.cleared[tier] > a.idx, lvl = D.areaLevel(a.idx, tier), here = W.area === a.idx && W.tier === tier;
      h += `<button class="area ${done ? 'done' : ''} ${here ? 'here' : ''}" ${open ? '' : 'disabled'} data-go="${a.idx}" data-gotier="${tier}"><b>${a.name}</b><span class="${lvlCls(lvl, tier)}">Level ${lvl}–${lvl + 3}</span><i>${here ? 'You are here' : done ? 'Cleared' : open ? (a.final ? 'Act boss' : 'New') : 'Locked'}</i></button>`;
    }
    h += '</div>';
  });
  h += `</div><div class="mfoot"><span class="note">${tier ? `Gear stops at item level ${D.GEAR_CAP}, but in ${D.TIERS[tier].name} ${Math.round(D.ANC_CHANCE[tier] * 100)}% of drops are Ancestral: item level ${D.ANC_LEVEL}. More Legendaries, Uniques and greater affixes too.` : `Gear stops at item level ${D.GEAR_CAP}. Beat The Crucible to unlock Torment, where Ancestral gear drops.`}</span><button data-close="1">Close</button></div>`;
  UI.modal(h, 'travel');
};
UI.settings = function () {
  const S = G.S;
  UI.modal(`<h2>Settings</h2>
    <div class="set"><label>Volume</label><input type="range" id="set-vol" min="0" max="100" value="${Math.round(S.opts.vol * 100)}"></div>
    <div class="set"><label>Flask</label><label class="chk"><input type="checkbox" id="set-flask" ${S.opts.autoFlask !== false ? 'checked' : ''}><span>Drink it automatically below 35% Life. You can always drink it yourself with Q.</span></label></div>
    <div class="set"><label>Keys</label><span class="note">Q drinks the flask. Space pauses. A toggles Auto. 1, 2, 3 set the speed. S, F, O, C open Skills, Crafting, Commission and the Codex. T travels.</span></div>
    <div class="set"><label>Save</label><div><button class="small" id="set-export">Copy save to clipboard</button> <button class="small" id="set-import">Load a save from text</button><textarea id="set-text" class="hidden" placeholder="Paste a save here, then press Load again"></textarea></div></div>
    <div class="set"><label>Start over</label><div><button class="small danger" id="set-wipe">Delete this save</button> <span class="note">There is no undo.</span></div></div>
    <div class="mfoot"><span class="note">Smeltworks saves in this browser after every battle.</span><button data-close="1">Close</button></div>`, 'settings');
};
UI.welcome = function () {
  UI.modal(`<h1>Smeltworks</h1>
    <p class="lead">The forges under the mountain have gone cold, and something down there is keeping them that way.</p>
    <p>You are the last smith. Fight your way down tile by tile. Battles play themselves: your part is the build. Pick skills, wear what drops, and remake the rest at the forge.</p>
    <ul class="how"><li><b>Map</b>Click a glowing tile to fight there. Reach the boss to open the next area.</li><li><b>Gear</b>A green arrow marks an upgrade. Right-click to equip, click to craft.</li><li><b>Skills</b>All open from the start. Pick five and three passives; gear raises their ranks.</li></ul>
    <div class="mfoot"><span></span><button data-close="1" class="big">Go down</button></div>`, 'welcome');
};
UI.victory = function () {
  const S = G.S, t = S.stats.time, hh = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60);
  UI.modal(`<h1>The forges burn again</h1>
    <p class="lead">Vulkar is slag. Heat climbs back up through the mountain, shaft by shaft, and somewhere above you a bellows starts to breathe.</p>
    <p>You finished the descent in ${hh ? hh + 'h ' : ''}${mm}m, with gear level ${Hr.gearLevel(S.gear)}, after ${U.fmt(S.stats.kills)} kills and ${S.stats.deaths} fall${S.stats.deaths === 1 ? '' : 's'}.</p>
    <p><b style="color:${D.TIERS[1].color}">Torment I is open.</b> The same descent, far deadlier. No Common gear drops there, Legendaries and Uniques come faster, and affixes can roll greater. </p>
    <div class="mfoot"><button data-close="1">Keep farming here</button><button class="big" data-go="0" data-gotier="1">Enter Torment I</button></div>`, 'welcome');
};
UI.areaDone = function (d) {
  const S = G.S, W = S.world, area = D.AREAS[d.area], last = d.area === D.AREAS.length - 1, next = last ? null : D.AREAS[d.area + 1];
  let h = `<h2>${area.name} cleared</h2>`;
  if (area.final && d.first && d.tier === 0) h += `<p class="lead">${D.ACTS[area.act].name} is yours. The act boss left a Legendary and a bonus skill point.</p>`;
  else if (d.first) h += '<p class="lead">The way on is open.</p>'; else h += '<p class="lead">Cleared again.</p>';
  if (last && d.first && W.cleared[d.tier + 1] != null) h += `<p><b style="color:${D.TIERS[d.tier + 1].color}">${D.TIERS[d.tier + 1].name} unlocked.</b> The whole descent again, far deadlier, with better loot. Open Travel to start it.</p>`;
  h += '<div class="mfoot"><button data-close="1">Stay and finish the map</button><button data-again="1">Run it again</button>' + (next ? `<button class="big" data-go="${next.idx}" data-gotier="${d.tier}">On to ${next.name}</button>` : '<button class="big" data-travel="1">Travel</button>') + '</div>';
  UI.modal(h, 'done');
};

/* ------------------------------------------------------ game → ui glue */
UI.onGame = function (type, d) {
  const S = G.S;
  switch (type) {
    case 'stats': mark('gear', 'top', 'hud', 'forge', 'cube', 'skills', 'map'); break;
    case 'map': mark('map', 'top'); break;
    case 'moved': A.play('step', 0.1); break;
    case 'expedition': mark('map', 'top'); SW.fx.clear(); SW.fx.setScene(D.ACTS[D.AREAS[S.world.area].act].bg); UI.banner(D.AREAS[S.world.area].name, `${D.ACTS[D.AREAS[S.world.area].act].name} · Level ${G.areaLevel()}–${G.areaLevel() + 3}`, 'area', 1800); break;
    case 'battleStart':
      SW.fx.battleStart(); S.seen.fought = 1; mark('map');
      if (d.spec.boss) { const b = D.BOSSES[d.spec.boss]; UI.banner(b.name, b.title, 'boss', 2600); }
      else if (d.spec.champ) UI.banner(d.spec.champ, 'Champion of ' + D.AREAS[S.world.area].name, 'boss', 2200);
      break;
    case 'travel': mark('map'); break;
    case 'battleEnd': if (!d.win) SW.fx.clear(); mark('bag', 'map', 'top', 'skills', 'forge', 'gear'); break;
    case 'death': UI.banner('You fell', 'Nothing is lost. Catch your breath and try again.', 'dead', 2400); break;
    case 'areaClear':
      A.play('clear'); UI.banner(D.AREAS[d.area].name + ' cleared', d.first ? 'The way on is open' : '', 'clear', 2400);
      if (d.first && d.area === D.AREAS.length - 1 && d.tier === 0) setTimeout(() => UI.victory(), 1600);
      else if (!S.opts.auto) setTimeout(() => { if (!S.opts.auto && $('modal').classList.contains('hidden')) UI.areaDone(d); }, 1500);
      mark('top', 'map');
      break;
    case 'tierUnlock': setTimeout(() => UI.banner(D.TIERS[d.tier].name + ' unlocked', `Ancestral gear drops there: ${Math.round(D.ANC_CHANCE[d.tier] * 100)}% of all drops`, 'boss', 3600), 2600); UI.feed(`<b style="color:${D.TIERS[d.tier].color}">${D.TIERS[d.tier].name} unlocked.</b> Open Travel to begin.`, 'r3'); break;
    case 'chest': A.play('chest'); SW.fx.spill(d.items, d.fate); UI.feed(`Chest: <b class="gold">${U.fmt(d.gold)} gold</b>`, ''); d.items.forEach((it, i) => UI.feedItem(it, d.fate[i])); mark('bag', 'map'); break;
    case 'fullClear': SW.fx.spill(d.items, d.fate); UI.feed(`Map cleared out: <b class="gold">${U.fmt(d.gold)} gold</b> and a bonus piece`, 'r2'); d.items.forEach((it, i) => UI.feedItem(it, d.fate[i])); mark('bag'); break;
    case 'shrine': { const s = D.SHRINES[d.id]; A.play('shrine'); SW.fx.heroGlow(s.color); UI.banner(s.name, `${s.desc} for ${D.SHRINE_FIGHTS} battles`, 'shrine', 1800); break; }
    case 'equip': A.play('equip'); mark('gear', 'bag', 'forge', 'hint'); hideTip(); break;
    case 'bag': mark('bag'); break;
    case 'salvage': A.play('salvage'); mark('bag', 'forge', 'hint'); break;
    case 'salvageAll': A.play('salvage'); UI.toast(`Salvaged ${d.n} item${d.n === 1 ? '' : 's'}: ${Object.keys(d.y).map(k => d.y[k] + ' ' + MAT_NAME[k]).join(', ')}`); mark('bag', 'forge', 'hint'); break;
    case 'codex': mark('codex', 'forge'); UI.feed(`${d.isNew ? 'New aspect learned' : 'Aspect improved'}: <b style="color:${RC(3)}" data-aspect="${d.id}">${D.ASPECT[d.id].name}</b>`, 'r3'); break;
    case 'bagfull': if (!UI.fullT || Date.now() - UI.fullT > 8000) { UI.fullT = Date.now(); UI.toast('Bag full. New drops are being salvaged until you make room.', 'bad'); } break;
    case 'cube': A.play(d.res.orb === 'remove' ? 'salvage' : 'forge'); UI.cubeLast = d.res; mark('cube', 'bag', 'gear', 'forge');
      if (d.res.from != null) UI.toast(`It is now ${D.RARITY[d.it.rar].name}.`, 'good');
      if (d.res.crit) { A.play('master'); UI.toast(d.res.crit > 1 ? `${d.res.crit} Greater affixes!` : 'It crit: a Greater affix!', 'good'); }
      break;
    case 'orbs': { const n = {}; for (const k of d.list) n[k] = (n[k] || 0) + 1;
      UI.feed('Orb: ' + Object.keys(n).map(k => `<b style="color:${D.ORBS[k].color}">${n[k] > 1 ? n[k] + ' × ' : ''}${D.ORBS[k].name}</b>`).join(', ') + (S.seen.orb ? '' : ' <span class="dim">Click a piece of gear and use it in Crafting</span>'), 'orb');
      S.seen.orb = 1; A.play('shrine', 0.3); mark('cube', 'top'); break; }
    case 'forge': A.play(d.kind === 'upgrade' && d.mw >= 0 ? 'master' : d.kind === 'commission' ? 'drop' + d.it.rar : 'forge'); mark('forge', 'bag', 'gear', 'top');
      if (d.kind === 'enchant' && d.a && d.a.g && !d.was) UI.toast('It crit: a Greater affix!', 'good');
      if (d.kind === 'upgrade') { UI.mwLast = { id: d.it.id, ranks: d.ranks, t: performance.now() }; if (d.mw >= 0) UI.toast('Masterworked: ' + I.affixText(d.it, d.it.affixes[d.mw], d.mw), 'good'); }
      if (d.kind === 'commission') { UI.feedItem(d.it, 'bag'); UI.forgeFlash = d.it.id; }
      break;
    case 'skills': mark('skills', 'hud', 'top', 'hint'); break;
    case 'fallback': UI.toast(d.same ? `Not strong enough yet. Running ${d.to} again for loot and experience.` : `Too strong for now. Falling back to ${d.to} to gather strength.`, 'bad'); break;
  }
};
/* battle events the DOM cares about */
UI.onBattle = function (ev) {
  if (ev.e === 'die' && ev.drops) {
    const d = ev.drops;
    d.items.forEach((it, i) => { UI.feedItem(it, d.fate[i]); if (it.rar === 4) UI.banner(it.name, 'A Unique drops', 'unique', 2600); });
    if (d.items.length) mark('bag', 'hint');
    if (d.first) UI.feed('First kill: a guaranteed <b style="color:' + RC(3) + '">Legendary</b>', 'r3');
  }
};

/* --------------------------------------------------------------- input */
function setSpeed(v) { const S = G.S; if (v === 0) { if (S.opts.speed === 0) v = UI.prevSpeed || 1; else UI.prevSpeed = S.opts.speed; } S.opts.speed = v; mark('top'); }
function drink() { const why = G.drink(); if (why) deny(why); }
function toggleAuto() { const S = G.S; S.opts.auto = !S.opts.auto; S.seen.auto = 1; mark('top', 'hint'); A.play('click'); if (S.opts.auto && S.opts.speed === 0) setSpeed(1); }
function go(area, tier) {
  if (!G.isUnlocked(area, tier)) return;
  G.startExpedition(area, tier); UI.closeModal(); G.save();
}
UI.bind = function () {
  document.addEventListener('pointerdown', () => A.unlock(), { once: false, passive: true });
  document.addEventListener('mousemove', e => {
    const el = e.target.closest && e.target.closest('[data-item],[data-skill],[data-aspect],[data-tile],[data-tip]');
    if (!el || UI.dragId) { if (tipEl) hideTip(); return; }
    const key = (el.dataset.item || el.dataset.skill || el.dataset.aspect || el.dataset.tile || el.dataset.tip) + '|' + UI.tab;
    if (el !== tipEl || key !== tipKey) { tipEl = el; tipKey = key; tipFor(el, e.clientX, e.clientY); }
    else { const t = $('tooltip'); if (!t.classList.contains('hidden') && $('tooltip2').classList.contains('hidden')) placeTip(t, e.clientX, e.clientY); }
  });
  document.addEventListener('mouseleave', hideTip);
  // drag items around the bag, onto the paper doll, or off it
  document.addEventListener('dragstart', e => {
    const el = e.target.closest && e.target.closest('[data-item]'), f = el && G.findItem(+el.dataset.item);
    if (!f) { e.preventDefault(); return; }
    UI.dragId = f.it.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(f.it.id)); hideTip();
  });
  document.addEventListener('dragover', e => { if (UI.dragId && e.target.closest('[data-bag],[data-stash],.dslot')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
  document.addEventListener('dragend', () => { UI.dragId = null; });
  document.addEventListener('drop', e => {
    const id = UI.dragId; UI.dragId = null;
    if (!id) return;
    e.preventDefault();
    const cell = e.target.closest('[data-bag],[data-stash]'), doll = e.target.closest('.dslot'), f = G.findItem(id);
    if (!f) return;
    if (cell) { const to = cell.dataset.stash != null ? 'stash' : 'bag'; if (!G.moveItem(id, to, +cell.dataset[to]) && f.where === 'gear') deny('That slot holds a different kind of gear.'); }
    else if (doll && f.where !== 'gear') {
      const slot = doll.dataset.slot;
      if (slot.replace(/\d/, '') !== f.it.slot) deny(`That is a ${D.SLOT_NAME[f.it.slot].toLowerCase()}, not a ${D.SLOT_NAME[slot].toLowerCase()}.`); else G.equip(id, slot);
    }
  });
  document.addEventListener('contextmenu', e => {
    const el = e.target.closest('[data-item],[data-skill]');
    if (!el) return;
    e.preventDefault();
    if (el.dataset.item) {
      const f = G.findItem(+el.dataset.item);
      if (!f) return;
      hideTip();
      if (!e.shiftKey) {                         // right-click wears it, or takes it off
        if (f.where === 'gear') { if (!G.unequip(f.slot)) deny('Your bag is full.'); }
        else G.equip(f.it.id);
        return;
      }
      if (f.where === 'gear') return deny('Take it off before salvaging it.');
      if (f.where === 'stash') return deny('Stashed gear is safe. Move it to your bag to salvage it.');
      if (f.it.lock) return deny('That piece is locked. Alt-click to unlock it.');
      if (UI.forgeId === f.it.id) UI.forgeId = null;
      G.salvage(f.it.id);
    }
  });
  document.addEventListener('click', e => {
    const t = e.target, S = G.S;
    let el;
    if ((el = t.closest('[data-close]'))) return UI.closeModal();
    if (t.id === 'modal') return UI.closeModal();
    if ((el = t.closest('[data-tier]'))) return UI.travel(+el.dataset.tier);
    if ((el = t.closest('[data-go]'))) return go(+el.dataset.go, +el.dataset.gotier);
    if ((el = t.closest('[data-again]'))) { G.startExpedition(S.world.area, S.world.tier); return UI.closeModal(); }
    if ((el = t.closest('[data-travel]'))) return UI.travel();
    if ((el = t.closest('#tabs button'))) { UI.setTab(el.dataset.tab); return A.play('click'); }
    if ((el = t.closest('[data-speed]'))) { setSpeed(+el.dataset.speed); return A.play('click'); }
    if (t.closest('#btn-auto')) return toggleAuto();
    if (t.closest('#btn-travel')) return UI.travel();
    if (t.closest('#btn-menu')) return UI.settings();
    if (t.closest('#btn-sound')) { S.opts.sound = !S.opts.sound; A.on = S.opts.sound; mark('top'); return; }
    if (t.closest('#btn-restart')) { G.startExpedition(S.world.area, S.world.tier); return; }
    if ((el = t.closest('[data-tile]'))) {
      const [x, y] = el.dataset.tile.split(',').map(Number), c = G.cell(x, y);
      if (!G.canEnter(c)) { if (c.state === 'seen' && c.type !== 'wall') deny('Clear a path to that tile first.'); return; }
      if (G.phase !== 'idle') { G.wish = c; UI.toast('Heading there next.'); return; }
      G.phaseT = 0; if (G.enterCell(c)) { A.play('click'); hideTip(); }
      return;
    }
    if ((el = t.closest('[data-usecodex]'))) {
      // from the Codex: carry the aspect over to the bench
      const id = el.dataset.usecodex, f = UI.forgeId ? G.findItem(UI.forgeId) : null;
      if (f && I.canImprint(f.it, id)) { UI.forgeAspect = id; UI.setTab('craft'); }
      else { UI.pendingAspect = id; UI.setTab('craft'); UI.toast(`${D.ASPECT[id].name}: now click a Rare or Legendary ${D.ASPECT_SLOTS[D.ASPECT[id].cat].map(x => D.SLOT_NAME[x].toLowerCase()).join(', ')} to imprint it.`); }
      A.play('click'); return;
    }
    if ((el = t.closest('[data-pick]'))) { UI.forgeAspect = el.dataset.pick; mark('forge'); return; }
    if ((el = t.closest('[data-aim]'))) { UI.cubeCat = el.dataset.aim || null; mark('cube'); A.play('click'); return; }
    if ((el = t.closest('[data-orb]'))) { UI.cubeOrb = el.dataset.orb; mark('cube'); A.play('click'); return; }
    if ((el = t.closest('[data-skill][data-tree]'))) {
      const id = el.dataset.skill, was = G.skillOn(id), msg = G.toggleSkill(id);
      if (msg) deny(msg); else A.play(was ? 'click' : 'learn');
      tipKey = '';
      return;
    }
    if ((el = t.closest('[data-act]'))) {
      const act = el.dataset.act;
      if (act === 'drink') drink();
      else if (act === 'sort') { G.sortBag(); A.play('click'); }
      else if (act === 'salv') { if (!G.salvageAll(+el.dataset.rar)) deny('Nothing to salvage at that rarity. Upgrades, locked and Ancestral pieces are kept.'); }
      else if (act === 'clear-skills') { G.clearSkills(); A.play('salvage'); }
      else if (act === 'transmute') { if (!G.cube(UI.forgeId, UI.cubeOrb, UI.cubeCat)) deny('The cube does nothing.'); }
      else if (act === 'equip-one') G.equip(UI.forgeId);
      else if (act === 'bench-clear') { UI.forgeId = null; UI.forgeAspect = null; UI.cubeLast = null; hideTip(); mark('forge', 'bag', 'gear'); A.play('click'); }
      else if (act === 'upgrade') { if (!G.upgrade(UI.forgeId)) deny('You cannot afford that.'); }
      else if (act === 'enchant') { if (!G.enchant(UI.forgeId, +el.dataset.idx)) deny('You cannot afford to enchant this.'); }
      else if (act === 'imprint') { if (!G.imprint(UI.forgeId, UI.forgeAspect)) deny('You cannot afford that imprint.'); else UI.forgeAspect = null; }
      else if (act === 'salvage-one') { const id = UI.forgeId; UI.forgeId = null; G.salvage(id); }
      else if (act === 'commission') { if (G.bagCount() >= D.BAG_SIZE) deny('Your bag is full.'); else if (!G.commission(el.dataset.slot)) deny('Not enough gold.'); }
      return;
    }
    if ((el = t.closest('[data-item]'))) {
      const f = G.findItem(+el.dataset.item);
      if (!f) return;
      if (e.altKey) { G.toggleLock(f.it.id); hideTip(); return; }
      if ((e.ctrlKey || e.metaKey) && f.where !== 'gear') { if (!G.stashToggle(f.it.id)) deny(f.where === 'bag' ? 'Your stash is full.' : 'Your bag is full.'); else A.play('equip'); hideTip(); return; }
      UI.craft(f.it.id); A.play('click');
      return;
    }
  });
  document.addEventListener('change', e => {
    const t = e.target, S = G.S;
    if (t.dataset.autosalv != null) { S.opts.salv[+t.dataset.autosalv] = t.checked; G.save(); }
    else if (t.id === 'opt-full') { S.opts.full = t.checked; G.save(); }
    else if (t.id === 'set-flask') { G.setAutoFlask(t.checked); mark('hud'); }
    else if (t.id === 'opt-advance') { S.opts.onClear = t.checked ? 'advance' : 'repeat'; G.save(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'set-vol') { G.S.opts.vol = e.target.value / 100; A.setVol(G.S.opts.vol); } });
  $('modal').addEventListener('click', e => {
    const id = e.target.id;
    if (id === 'set-export') { const s = G.exportSave(); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => UI.toast('Save copied.'), () => { const ta = $('set-text'); ta.classList.remove('hidden'); ta.value = s; ta.select(); }); }
    else if (id === 'set-import') { const ta = $('set-text'); if (ta.classList.contains('hidden') || !ta.value.trim()) { ta.classList.remove('hidden'); ta.value = ''; ta.focus(); } else if (G.importSave(ta.value)) { UI.closeModal(); UI.fresh(); UI.toast('Save loaded.'); } else deny('That does not look like a Smeltworks save.'); }
    else if (id === 'set-wipe') { if (e.target.dataset.sure) { G.wipe(); G.init(null); UI.closeModal(); UI.fresh(); UI.welcome(); } else { e.target.dataset.sure = 1; e.target.textContent = 'Click again to delete everything'; } }
  });
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') UI.closeModal();
    else if (k === ' ') { e.preventDefault(); setSpeed(0); }
    else if (k === 'a') toggleAuto();
    else if (k === 'q') drink();
    else if (k === '1') setSpeed(1); else if (k === '2') setSpeed(2); else if (k === '3') setSpeed(4);
    else if (k === 's') UI.setTab('skills'); else if (k === 'f') UI.setTab('craft'); else if (k === 'o') UI.setTab('commission'); else if (k === 'c') UI.setTab('codex');
    else if (k === 't') UI.travel();
  });
  window.addEventListener('resize', () => SW.fx.resize());
};
/* full repaint, used at boot and after loading a save */
UI.fresh = function () {
  const S = G.S;
  A.on = S.opts.sound; A.setVol(S.opts.vol);
  UI.forgeId = null; UI.cubeLast = null; UI.lastGold = -1;
  SW.fx.clear(); SW.fx.setScene(D.ACTS[D.AREAS[S.world.area].act].bg);
  mark('top', 'hud', 'map', 'gear', 'bag', 'skills', 'forge', 'codex');
  UI.setTab(UI.tab);
};
})();
