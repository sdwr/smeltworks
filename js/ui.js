/* Smeltworks — everything drawn in the DOM: top bar, map, gear, skills, forge, tooltips, dialogs. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, I = SW.items, Hr = SW.hero, G = SW.game, SP = SW.sprites, A = SW.audio;
const UI = SW.ui = { tab: 'craft', dirty: {}, forgeId: null, cubeLast: null, dragId: null, lastGold: -1 };
const $ = id => document.getElementById(id);
/* colour for a monster level against your gear level. In Torment gear is capped while monsters keep rising,
   so the comparison says nothing there and the level is left uncoloured. */
const lvlCls = (lvl, tier, good) => { if (tier > 0) return ''; const dl = lvl - Hr.gearLevel(G.S.gear); return dl >= 3 ? 'neg' : dl >= 1 ? 'warn' : good ? 'pos' : ''; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const RC = i => D.RARITY[i].color;
const mark = (...keys) => { for (const k of keys) UI.dirty[k] = 1; };
const pct = v => (Math.round(v * 10) / 10) + '%';
/* ---------------------------------------------------------------- juice
   Crafting effects. Sparks and rings live in a layer over the page, thrown from wherever the player last pressed;
   everything else is a short-lived class on the crafting panel (the panel element itself is never rebuilt, only its
   contents), which the stylesheet turns into flashes, strikes and rows sliding in. */
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function juiceLayer() { let l = $('juice'); if (!l) { l = document.createElement('div'); l.id = 'juice'; document.body.appendChild(l); } return l; }
function origin() { if (UI.px != null && performance.now() - UI.pxT < 1500) return [UI.px, UI.py]; const r = $('tab-craft').getBoundingClientRect(); return [r.left + r.width / 2, r.top + Math.min(r.height, innerHeight) / 3]; }
function sparks(color, n, power, at, up) {
  if (calm()) return; const L = juiceLayer(), o = at || origin();
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'), a = up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2, d = power * (0.3 + Math.random() * 0.7);
    p.className = 'spark'; p.style.cssText = `left:${o[0]}px;top:${o[1]}px;--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px;--c:${Array.isArray(color) ? U.pick(color) : color};--s:${(3 + Math.random() * 4).toFixed(1)}px;animation-duration:${Math.round(420 + Math.random() * 480)}ms`;
    L.appendChild(p); p.addEventListener('animationend', () => p.remove());
  }
}
function ring(color, at, big) { if (calm()) return; const o = at || origin(), r = document.createElement('i'); r.className = 'jring' + (big ? ' big' : ''); r.style.cssText = `left:${o[0]}px;top:${o[1]}px;--c:${color}`; juiceLayer().appendChild(r); r.addEventListener('animationend', () => r.remove()); }
function centerOf(sel) { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }
function pulse(cls, color, ms) {
  const t = $('tab-craft'); if (color) t.style.setProperty('--jc', color);
  t.classList.remove(cls); void t.offsetWidth; t.classList.add(cls); clearTimeout(pulse[cls]); pulse[cls] = setTimeout(() => t.classList.remove(cls), ms || 750);
}
const JUICE = {
  offer() { sparks(['#ffb347', '#ffe9a8'], 10, 60); pulse('j-offer', '#ffb347', 700); for (let n = 1; n < 3; n++) setTimeout(() => sparks(['#ffb347', '#ffe9a8'], 6, 45), n * DEAL_STEP); },
  cube(d) {
    if (d.res.op === 'cancel') { sparks(d.res.lost ? ['#ff6b5a', '#8a8478'] : '#8a8478', d.res.lost ? 12 : 6, 55); if (d.res.lost) pulse('j-cube', '#ff6b5a'); return; }      // an offer thrown away: the tier it cost, in red
    const col = I.CUBE_COLOR[I.cubeLabel(d.res.o).fam], big = ['recast', 'tiers', 'sacrifice'].includes(d.res.op), bad = !!d.res.removed;
    if (d.res.op === 'pass') { sparks('#8a8478', 6, 40); return; }
    sparks(col, big ? 30 : 18, big ? 120 : 85); ring(col); pulse('j-cube', col);
    if (d.res.from != null) { const at = centerOf('.an-item .it'); sparks([RC(d.it.rar), '#fff'], 26, 110, at); ring(RC(d.it.rar), at, true); pulse('j-up', RC(d.it.rar), 900); }
    if (bad) pulse('j-rm', col);
  },
  upgrade(d) {
    const tip = (() => { const b = document.querySelector('.mw-bar'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width * Math.min(1, (d.it.up || 0) / D.MW_MAX), r.top + r.height / 2]; })();
    sparks(['#ffb347', '#ff7a2a', '#ffe9a8'], 10 + 6 * (d.ranks || 0), 70 + 18 * (d.ranks || 0), tip, true); pulse('j-mw', '#ff9a3c', 600);
    if (d.mw >= 0) { const at = centerOf('.an-item .it'); sparks(['#ffd27a', '#fff3c4', '#ffb347'], 44, 170, at); ring('#ffd27a', at, true); ring('#fff3c4', at); pulse('j-cap', '#ffd27a', 1300); }
  },
  enchant() { sparks(['#9be3ff', '#d6f3ff', '#58b8e8'], 16, 80); ring('#9be3ff'); pulse('j-ench', '#9be3ff'); },
  transfigure(d) {
    const k = d.res.kind, col = k === 'replace' ? ['#ff7a6a', '#ffb0a6'] : k === 'indes' ? ['#8a8478', '#b9b2a6'] : ['#b896ff', '#e4d6ff', '#ffd27a'];
    sparks(col, k === 'indes' ? 10 : 46, k === 'indes' ? 60 : 180); ring(col[0], null, k !== 'indes'); if (k !== 'indes') ring(col[1]);
    pulse('j-tf', col[0], 1200); if (k === 'greater') { const at = centerOf('.an-item .it'); sparks(['#ffd27a', '#fff3c4'], 30, 140, at); }
  },
  commission(d) { sparks([RC(d.it.rar), '#ffd27a'], 20, 100); ring(RC(d.it.rar)); },
  salvage(d) { sparks(['#ffb347', '#8a8478', '#c9ccd6'], d.n > 1 ? 26 : 12, d.n > 1 ? 110 : 65); },
};
/* the tier badge on an affix: bright when it is the best this piece can roll, dimmer the further below */
function tierTag(it, a) {
  if (D.AFFIX[a.k].int) return '';
  const t = I.affixTier(it, a), max = D.tierOf(it.ilvl), d = Math.max(0, max - t);
  return `<b class="tier-tag d${Math.min(3, d)}" data-tip="Tier ${t} of ${D.TIER_MAX}. ${d === 0 ? `The best a level ${it.ilvl} piece can roll.` : `A level ${it.ilvl} piece can roll up to tier ${max}.`} Each tier is a higher band of values than the last; the range shown is this tier's.${max < D.TIER_MAX ? ` Tier ${max + 1} starts at item level ${D.TIER_LVL[max]}.` : ''}">T${t}</b>`;
}
const MAT_NAME = { gold: 'gold', dust: 'ember dust' };

/* the cube deals its three options one at a time, this many milliseconds apart */
const DEAL_STEP = 480;
/* ------------------------------------------------------------- pieces */
function itemCell(it, extra, idx, box) {
  const bag = idx == null ? '' : ` data-${box || 'bag'}="${idx}"`;
  if (!it) return `<div class="it empty ${extra || ''}"${bag}></div>`;
  const k = I.spriteKey(it);
  return `<div class="it r${it.rar} ${it.isNew ? 'new' : ''} ${I.greaterCount(it) ? 'has-ga' : ''} ${it.upg ? 'upg' : ''} ${it.lock ? 'lock' : ''} ${it.offer ? (I.offerHidden(it) ? 'offer-free' : 'offer-wait') : ''} ${it.ilvl >= D.GEAR_CAP ? 'top' : ''} ${it.tf && it.tf.length ? (it.sealed ? 'tfd sealed' : 'tfd') : ''} ${extra || ''}" data-item="${it.id}"${bag} draggable="true">` +
    `<img src="${SP.url(k.spr, k.pal, 3)}" alt="">` +
    (it.upg ? '<b class="up">▲</b>' : '') + (I.greaterCount(it) ? `<b class="ga">★${I.greaterCount(it) > 1 ? I.greaterCount(it) : ''}</b>` : '') + (it.lock ? '<b class="lk">●</b>' : '') + (it.tf && it.tf.length ? '<b class="tfm">✧</b>' : '') + (it.up ? `<b class="pl${it.up >= D.MW_MAX ? ' max' : ''}">${it.up}</b>` : '') +
    `<span class="il">${it.ilvl}</span></div>`;
}
function skillIcon(id, cls) {
  const sk = D.SKILL[id];
  return `<span class="sk d-${sk ? sk.disc : 'none'} ${sk && sk.type === 'passive' ? 'passive' : ''} ${cls || ''}"><img src="${SP.url('g_' + id, 'glyph', 3)}" alt=""></span>`;
}
function costHtml(c) {
  return Object.keys(c).map(k => `<span class="cost ${G.canPay({ [k]: c[k] }) ? '' : 'short'}"><i class="ci ${k}"></i>${U.fmt(c[k])}</span>`).join('');
}
/* How wearing this piece would change the estimate. A ring is compared against each ring you are wearing, since
   it could replace either: both lines are shown, the better swap first (that is the one right-click makes).
   The numbers are shown even when the piece cannot be worn because you already wear the same Unique:
   they say what it would do in its slot, and the line under them says what is in the way. */
function compareHtml(it) {
  const S = G.S, all = it.slot === 'ring' ? ['ring1', 'ring2'] : [it.slot], ok = G.equipSlots(it);
  const cur = G.C.rating, d = (a, b) => (b ? (a / b - 1) * 100 : 100);
  const line = (label, v) => `<span class="${v > 0.5 ? 'pos' : v < -0.5 ? 'neg' : 'zero'}">${label} ${v > 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 10 ? 1 : 0)}%</span>`;
  let rows = all.map(s => { const g = Object.assign({}, S.gear); g[s] = it; const r = Hr.compute(S, g).rating; return { s, r, dp: d(r.power, cur.power), worn: S.gear[s], ok: ok.includes(s) }; });
  rows.sort((a, b) => (b.ok - a.ok) || (b.r.power - a.r.power));           // swaps that are allowed first, the better one on top
  const both = rows.length === 2 && rows[0].worn && rows[1].worn;
  if (!both) rows = rows.filter(o => o.ok).concat(rows.filter(o => !o.ok)).slice(0, 1);       // an empty ring slot is simply where it would go
  const twin = !ok.length || rows.some(o => !o.ok) ? S.gear[G.twinOf(it, ok[0])] || S.gear[G.twinOf(it)] : null;
  const how = (o, i) => !o.ok ? ' <i class="neg">not possible</i>' : i === 0 ? ' <i>right-click does this</i>' : ' <i>drag onto that ring to do this</i>';
  let h = rows.map((o, i) => (both ? `<div class="tt-vs">In place of <b style="color:${RC(o.worn.rar)}">${esc(o.worn.name)}</b>${how(o, i)}</div>` : '') +
    `<div class="tt-cmp ${both ? 'vs' : ''} ${o.ok ? '' : 'blocked'}"><b class="${o.dp > 0.5 ? 'pos' : o.dp < -0.5 ? 'neg' : 'zero'}">${o.dp > 0.5 ? '▲ Upgrade' : o.dp < -0.5 ? '▼ Weaker' : '◆ Sidegrade'}</b>${line('Damage', d(o.r.off, cur.off))}${line('Toughness', d(o.r.def, cur.def))}</div>`).join('');
  if (twin) h += `<div class="tt-block"><b>✕ ${ok.length ? 'Cannot replace the other ring' : 'Cannot be worn'}</b> while you wear ${esc(twin.name)}: it is the same Unique, and a Unique can only be worn once.${ok.length ? '' : ' Take that piece off first.'}</div>`;
  if (it.uniq || rows.some(o => o.worn && o.worn.uniq)) h += '<div class="tt-note">From stats and your current skills only. Unique powers are not counted.</div>';
  return h;
}
function itemTooltip(it, o) {
  o = o || {};
  const imp = I.implicit(it);
  let h = `<div class="tt r${it.rar}">`;
  if (o.label) h += `<div class="tt-label">${o.label}</div>`;
  h += `<div class="tt-name">${esc(it.name)}</div>`;
  h += `<div class="tt-type">${I.typeLine(it)}<span>${I.itemPower(it)} Item Power</span></div>`;
  if (it.ilvl >= D.GEAR_CAP) h += `<div class="tt-anc">Top item level<span>its affixes can reach tier ${D.TIER_MAX}</span></div>`;
  if (it.up || it.tq) h += `<div class="tt-mw"><em>Masterwork rank ${it.up || 0}/${D.MW_MAX}${it.tq ? ` <b class="tf">+${it.tq} quality</b>` : ''}</em><span>+${(it.up || 0) + (it.tq || 0)}% to everything on it</span></div>`;
  if (it.tf && it.tf.length) h += `<div class="tt-tf">✧ Transfigured${it.indes ? ' · Indestructible' : ''}<span>${it.sealed ? 'sealed: it cannot be changed again' : 'still open to change'}</span></div>`;
  if (imp.dmg) h += `<div class="tt-base"><b>${U.fmt(imp.dmg)}</b> damage per hit<span>${imp.aps.toFixed(2)} attacks per second</span></div>`;
  else if (imp.armor) h += `<div class="tt-base"><b>${U.fmt(imp.armor)}</b> armor</div>`;
  else if (imp.life) h += `<div class="tt-base"><b>${U.fmt(imp.life)}</b> life</div>`;
  else if (imp.dmgPct) h += `<div class="tt-base"><b>+${imp.dmgPct}%</b> damage</div>`;
  if (it.affixes.length) {
    h += '<ul class="tt-aff">' + it.affixes.map((a, i) => {
      const mw = I.masterworked(it, i);
      return `<li class="${a.g ? 'great' : ''} ${mw ? 'mw' : ''} ${it.ench === i ? 'ench' : ''}">${tierTag(it, a)}${I.affixText(it, a, i)} <span class="rng">${I.affixRange(it, a, i)}</span>${a.g ? ' <i>greater</i>' : ''}${mw ? ' <i>masterworked</i>' : ''}${a.t ? ' <i class="tf">transfigured</i>' : ''}${D.AFFIX[a.k].note ? `<small>${D.AFFIX[a.k].note}</small>` : ''}</li>`;
    }).join('') + '</ul>';
  }
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
  if (D.TECH[id]) { const cur = (G.S.hero.tech || {})[id]; h += '<div class="tt-tech">' + D.TECH[id].map(t => `<div class="${cur === t.id ? 'on' : ''}"><b>${cur === t.id ? '◆ ' : ''}${t.name}</b> <i>${t.stat}</i><br>${t.desc}</div>`).join('') + '</div>'; }
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
      // beside it: what you are wearing in that slot. For a ring, both rings, since it could replace either
      const worn = (it.slot === 'ring' ? [S.gear.ring1, S.gear.ring2] : [S.gear[it.slot]]).filter(Boolean);
      const side = worn.map((w, i) => itemTooltip(w, { label: worn.length > 1 ? `Equipped · ring ${i + 1} of 2` : 'Equipped' })).join('');
      showTip(itemTooltip(it, { compare: 1, hint }), x, y, side ? `<div class="tt-stack">${side}</div>` : null);
      if (it.isNew) { it.isNew = 0; el.classList.remove('new'); }
    } else showTip(itemTooltip(it, { label: f.where === 'gear' ? 'Equipped' : null, hint: f.where === 'gear' ? 'Click to craft · Right-click to take it off' : null }), x, y);
  } else if (el.dataset.skill) showTip(skillTooltip(el.dataset.skill, { tree: el.dataset.tree }), x, y);
  else if (el.dataset.tile) {
    const [tx, ty] = el.dataset.tile.split(',').map(Number), c = G.cell(tx, ty);
    showTip(tileTip(c), x, y);
  } else if (el.dataset.tip) showTip(`<div class="tt plain">${el.dataset.tip}</div>`, x, y);
}
function tileTip(c) {
  const names = { fight: 'Monster pack', elite: 'Elite pack', boss: 'The boss', chest: 'Treasure chest', shrine: 'Shrine', start: 'Camp', wall: 'Impassable rock' };
  const desc = { fight: 'A fight. Gold and the odd piece of gear.', elite: 'An empowered monster with special powers. Always drops Magic gear or better.',
    boss: G.S.world.map.name ? `${G.S.world.map.name} guards the way on. Beat it to open the next area.` : 'The master of this act. Bring your best gear.',
    chest: 'Free loot. No fight.', shrine: `Restores your Life, and gives a blessing that lasts ${D.SHRINE_FIGHTS} battles.`, start: 'Where you came in.', wall: '' };
  if (c.type === 'wall') return '<div class="tt plain"><b>Impassable rock</b><br>Solid stone. There is no way through: the smith has to go round.</div>';
  const stop = G.route.indexOf(c);
  const plan = stop >= 0 ? `<br><i class="hot">Stop ${stop + 1} on your route. Click to take it off${stop < G.route.length - 1 ? ', and every stop after it' : G.target === c && G.phase === 'travel' ? ': the smith stops walking there' : ''}.</i>` : G.canRoute(c) ? `<br><i>Click to ${G.route.length ? 'add it to your route' : G.phase === 'travel' && G.canEnter(c) ? 'head here instead' : 'go here'}.</i>` : '';
  if (c.state === 'hidden') return `<div class="tt plain"><b>Unexplored</b><br>Clear a neighbouring tile to see what is here.${plan}</div>`;
  let h = `<div class="tt plain"><b>${names[c.type]}</b>` + (c.type !== 'start' && c.type !== 'wall' && c.type !== 'shrine' ? ` <span class="${lvlCls(c.lvl, G.S.world.tier, true)}">Level ${c.lvl}</span>` : '') + `<br>${desc[c.type]}`;
  if (c.state === 'done') h += '<br><i>Cleared.</i>';
  else if (!plan && c.type !== 'wall') h += '<br><i>Clear a path to it first.</i>';
  h += plan;
  if (c.deaths) h += `<br><span class="neg">You have fallen here ${c.deaths === 1 ? 'once' : c.deaths + ' times'}.</span>`;
  return h + '</div>';
}

/* ------------------------------------------------------------- top bar */
function renderTop() {
  const S = G.S, W = S.world, area = D.AREAS[W.area], lvl = D.areaLevel(W.area, W.tier);
  $('where-act').textContent = (W.tier ? D.TIERS[W.tier].name + ' · ' : '') + D.ACTS[area.act].name;
  $('where-area').textContent = area.name;
  $('where-lvl').textContent = `Lv ${lvl}–${lvl + D.areaSpan(W.tier)}`;
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', +b.dataset.speed === S.opts.speed));
  { const b = $('btn-auto'), held = !!(S.held && S.opts.auto); b.classList.toggle('on', !!S.opts.auto && !held); b.classList.toggle('start', held); b.textContent = held ? '▶ Start' : 'Auto'; }
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
  if (G.leaving && UI.vic && UI.vic.moving) {                // the walk to the next level, in step with the game's count
    const L = G.leaving, f = U.clamp(1 - L.t / D.LEAVE_TIME, 0, 1), e = f * f * (3 - 2 * f), n = D.AREAS.length - 1, x = (L.from + (L.to - L.from) * e) / n * 100, m = $('vic-mark'), fl = $('vic-fill');
    if (m) { m.style.left = x + '%'; m.classList.toggle('walk', G.S.opts.speed > 0); m.classList.toggle('back', L.to < L.from); }
    if (fl) { const a = Math.min(L.from, L.to) / n * 100; fl.style.left = (L.to >= L.from ? L.from / n * 100 : x) + '%'; fl.style.width = Math.abs(x - L.from / n * 100) + '%'; }
  }
  const S = G.S, B = G.battle, h = B ? B.h : null, st = G.C.st;
  const hp = G.lifeFrac(), heat = (h ? h.heat : G.persist.heat == null ? 30 : G.persist.heat) / D.HEAT_MAX;
  const oh = $('orb-hp'); oh.firstElementChild.style.height = Math.max(0, hp * 100) + '%';
  oh.children[1].style.height = h && h.barrier > 0 ? Math.min(100, h.barrier / h.max * 100) + '%' : '0%';
  oh.lastElementChild.textContent = U.fmt(h ? Math.ceil(h.hp) : Math.ceil(st.maxLife * hp));
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
  for (const k of ['dust']) { const e = $('cur-' + k), v = U.fmt(S.mats[k] || 0); if (e.textContent !== v) e.textContent = v; }
  if (performance.now() - meterT > 250) { meterT = performance.now(); renderMeter(); }
  // the transmute bar, and the wait before a new run
  { const need = D.XP_NEED, xp = Math.min(need, S.xp || 0), full = xp >= need, e = $('xpbar');
    e.firstElementChild.style.width = xp / need * 100 + '%'; e.classList.toggle('full', full);
    const t = full ? 'Free transmute ready: no worn piece is free to take it' : `Next free transmute  ${Math.floor(xp)} / ${need}`; if (e.lastElementChild.textContent !== t) e.lastElementChild.textContent = t;
    const n = G.freeWaiting().length, fb = $('xpfree'), ft = n ? `✦ ${n} free` : ''; if (fb.textContent !== ft) { fb.textContent = ft; fb.classList.toggle('hidden', !n); }      // how many are waiting to be taken
    const W = S.world, cool = W.cool > 0 && G.phase === 'idle', c = $('combat'); c.classList.toggle('cooling', cool);
    if (cool) { const t2 = `<b>${W.coolWhy === 'left' ? 'Run abandoned' : 'You fell'}</b><i>${Math.ceil(W.cool)}</i><span>A new run can begin when the count is done. Use the wait: wear what dropped, masterwork it, take your transmutes.</span>`; if (UI.coolHtml !== t2) { UI.coolHtml = t2; $('cooldown').innerHTML = t2; } }
  }
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

/* A large line under the purse, in the middle of the character pane: green and rising for what a salvage gave, red
   and sinking for what a craft cost, each amount with its material's icon. Quick repeats of the same kind add up in
   the line that is still showing; anything else replaces it. */
const POP_ORDER = ['gold', 'dust'];
function pursePop(vals, sign) {
  const host = $('purse-pops'); if (!host) return; const now = performance.now();
  let p = UI.pop;
  if (p && p.sign === sign && now - p.t < 500 && p.el.isConnected) { for (const k in vals) p.vals[k] = (p.vals[k] || 0) + vals[k]; }
  else { host.textContent = ''; const el = document.createElement('div'); el.className = 'pop ' + sign; host.appendChild(el); el.addEventListener('animationend', () => el.remove()); p = UI.pop = { el, sign, t: now, vals: Object.assign({}, vals) }; }
  p.el.innerHTML = POP_ORDER.filter(k => p.vals[k]).map(k => `<span><i class="ci ${k}"></i>${sign === 'up' ? '+' : '−'}${U.fmt(p.vals[k])}</span>`).join('');
}
const purseGain = y => pursePop(y, 'up'), purseSpend = c => pursePop(c, 'dn');
/* -------------------------------------------------------- damage meter */
const SRC_NAME = { burn: 'Burn', bleed: 'Bleed', thorns: 'Thorns', proc: 'Unique powers and procs', punch: 'Punch' };
let meterT = 0;
/* bars are coloured by the type of damage, not by the skill's school: a skill that deals two types takes the colour
   of the larger share, and its tooltip gives the split */
const METER_EL = { phys: '#b9bfcc', fire: '#ff8a2a', light: '#5fbfff', poison: '#7fc94f', shadow: '#a678e6' };
function renderMeter() {
  const B = G.battle, live = B && B.ft > 0.3 ? B.dmgDone / B.ft : null;
  let dmg = 0, ft = 0; const by = {}, byEl = {};
  const fights = live != null ? G.meter.slice(-9).concat([{ dmg: B.dmgDone, ft: B.ft, by: B.by, byEl: B.byEl }]) : G.meter;
  for (const m of fights) { dmg += m.dmg; ft += m.ft; for (const k in m.by) by[k] = (by[k] || 0) + m.by[k];
    for (const k in m.byEl || {}) { const t = byEl[k] || (byEl[k] = {}); for (const e in m.byEl[k]) t[e] = (t[e] || 0) + m.byEl[k][e]; } }
  const avg = ft > 0 ? dmg / ft : 0, last = G.meter.length ? G.meter[G.meter.length - 1] : null;
  const rows = Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 6), top = rows.length ? by[rows[0]] : 1;
  let h = `<div class="m-top"><span>${live != null ? 'DPS this fight' : 'DPS last fight'}</span><b>${live != null ? U.fmt(live) : last ? U.fmt(last.dmg / last.ft) : '–'}</b></div>`;
  h += `<div class="m-avg"><span>${fights.length ? 'Last ' + fights.length + ' fight' + (fights.length === 1 ? '' : 's') : 'No fights yet'}</span><b>${fights.length ? U.fmt(avg) : ''}</b></div>`;
  for (const k of rows) {
    const sk = D.SKILL[k], name = sk ? sk.name : SRC_NAME[k] || k;
    const els = Object.keys(byEl[k] || {}).sort((a, b) => byEl[k][b] - byEl[k][a]), main = els[0] || (sk ? sk.el || D.DISC[sk.disc].el : k === 'burn' ? 'fire' : 'phys'), tot = els.reduce((a, e) => a + byEl[k][e], 0) || 1;
    const types = els.length > 1 ? els.filter(e => byEl[k][e] / tot >= 0.005).map(e => `${D.EL_NAME[e] || e} ${Math.round(byEl[k][e] / tot * 100)}%`).join(', ') : (D.EL_NAME[main] || main) + ' damage';
    const kind = k === 'burn' ? 'Damage over time from your Fire hits. ' : k === 'bleed' ? 'Damage over time from your Physical hits. ' : k === 'thorns' ? 'Dealt back to monsters that hit you. ' : '';
    h += `<div class="m-row" data-tip="<b>${esc(name)}</b>: ${types}. ${kind}${Math.round(by[k] / dmg * 100)}% of your damage over ${fights.length === 1 ? 'this fight' : 'these ' + fights.length + ' fights'}."><i style="width:${by[k] / top * 100}%;background:${METER_EL[main] || '#8a8478'}"></i><span><u style="background:${METER_EL[main] || '#8a8478'}"></u>${name}</span><b>${Math.round(by[k] / dmg * 100)}%</b></div>`;
  }
  if (UI.meterHtml !== h) { UI.meterHtml = h; $('meter').innerHTML = h; }
  // rooms cleared this run, in the last run, and the most ever in one run on this level
  const W = G.S.world, r = G.depthRec(W.area, W.tier), show = v => (v == null ? '–' : v);
  const dh = `<p>Rooms cleared</p><div><span>This run</span><b>${show(r.now)}</b></div><div><span>Last run</span><b>${show(r.last)}</b></div><div><span>Best</span><b>${show(r.best)}</b></div>`;
  if (UI.depthHtml !== dh) { UI.depthHtml = dh; $('depth').innerHTML = dh; }
}

/* ----------------------------------------------------------------- map */
const TILE_ICON = { fight: ['i_fight', 'icon'], elite: ['i_elite', 'icon'], boss: ['i_boss', 'boss'], chest: ['i_chest', 'icon'], shrine: ['i_shrine', 'shrine'], start: ['i_start', 'icon'] };
function renderMap() {
  const S = G.S, map = S.world.map, area = D.AREAS[map.area];
  let h = '';
  for (const c of map.cells) {
    const can = G.canEnter(c), stop = G.route.indexOf(c);
    let cls = `tile t-${c.type} s-${c.state}${can ? ' can' : ''}${c.deaths ? ' died' : ''}${G.target === c && G.phase !== 'idle' ? ' now' : ''}${stop >= 0 ? ' rt' : !can && G.canRoute(c) ? ' cr' : ''}`;
    let inner = '';
    if (c.type === 'wall') inner = `<img src="${SP.url('i_rock', 'stone', 3)}" alt="">`;      // rock is always in plain sight, explored or not
    else if (c.state !== 'hidden') {
      const ic = TILE_ICON[c.type];
      inner = `<img src="${SP.url(ic[0], ic[1], 3)}" alt="">`;
      if (c.state !== 'done' && c.type !== 'chest' && c.type !== 'shrine') inner += `<span class="lv ${lvlCls(c.lvl, map.tier)}">${c.lvl}</span>`;
    }
    if (stop >= 0) inner += `<b class="stop">${stop + 1}</b>`;
    h += `<div class="${cls}" data-tile="${c.x},${c.y}" style="grid-column:${c.x + 1};grid-row:${c.y + 1}">${inner}</div>`;
  }
  h += `<div id="token"><img src="${SP.url('hero', 'hero', 3)}" alt=""></div>`;
  $('map').innerHTML = h;
  moveToken();
  $('map-name').textContent = area.name;
  const left = map.cells.filter(c => c.type !== 'wall' && c.state !== 'done').length;
  $('map-sub').textContent = map.bossDone ? (map.allDone ? 'Cleared out. Nothing left here.' : `Boss down. ${left} tile${left === 1 ? '' : 's'} left.`) : `${D.ACTS[area.act].name}${S.world.tier ? ' · ' + D.TIERS[S.world.tier].name : ''}`;
  const rb = $('btn-route'); rb.classList.toggle('hidden', !G.route.length); rb.textContent = `Clear route (${G.route.length})`;
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
  if (S.held && S.opts.auto) t = 'Press Start and the smith explores and fights alone. Or click a glowing tile to pick the first fight yourself.';
  else if (!S.seen.fought) t = 'Click a glowing tile on the map to fight there.';
  else if (S.world.falls && S.world.falls.n > 0 && S.world.falls.key === S.world.tier + ':' + S.world.area && !map.bossDone && map.cells.filter(c => c.state === 'done').length <= 3)
    t = emptySlots() > 0 ? `You fell, and a new run begins. You have ${emptySlots()} empty skill slot${emptySlots() > 1 ? 's' : ''}: open Skills and fill them.`
      : S.bag.some(b => b && b.upg) ? 'You fell, and a new run begins. Something in your bag is better than what you wear: look for the green arrow.'
        : 'You fell, and a new run begins. That is how a level goes: each run drops more gear and dust, so wear the best of it, masterwork it, and you will get a room or two deeper.';
  else if (G.route.length > 1) t = 'The smith follows your route in order. Click a numbered tile to take it off, and every stop after it.';
  else if (!S.seen.route && S.stats.kills > 6 && emptySlots() === 0) t = 'Click several tiles to plan a route: the smith visits them in the order shown, with Auto on or off.';
  else if (emptySlots() > 0) t = `You have ${emptySlots()} empty skill slot${emptySlots() > 1 ? 's' : ''}. Open Skills and fill them: every skill is free.`;
  else if (S.bag.some(b => b && b.upg)) t = 'Something in your bag is better than what you are wearing. Look for the green arrow.';
  else if (!S.opts.auto && S.stats.kills > 12 && !S.seen.auto) t = 'Tired of clicking tiles? Turn on Auto and the smith explores alone.';
  else if (map.bossDone && !S.opts.auto) t = 'This area is beaten. Use the area name at the top to travel on.';
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
  // the two halves of Power, side by side: the same Damage and Toughness the gear tooltips compare against
  h += `<div class="power two"><div data-tip="Damage: a score for how hard you hit, from your stats and the skills and techniques on your bar. Weapon damage, attack speed, damage bonuses, Strength, critical strikes and Vulnerable all go in. It is on the same scale as Toughness, so it is not your damage per second: the meter in the arena shows that. Unique powers are not counted."><span>Damage</span><b>${U.fmt(C.rating.off)}</b></div>` +
    `<div class="tough" data-tip="Toughness: a score for how much punishment you can take. Your Life, divided by what armor, damage reduction and dodge let through against monsters of this area, plus a few seconds of healing. It is on the same scale as Damage: a build with the two about level is balanced."><span>Toughness</span><b>${U.fmt(C.rating.def)}</b></div></div></div>`;
  h += '<div class="dcol">' + DOLL_R.map(dollSlot).join('') + '</div></div>';
  $('tab-gear').innerHTML = h;
  h = '<div class="stats"><div class="scol"><h4>Offence</h4>';
  h += row('Damage per hit', U.fmt(st.dmg), 'Weapon damage. Every skill is a percentage of this.');
  h += row('Attacks / sec', (st.aps * (1 + st.aspd / 100)).toFixed(2));
  if (st.str) h += row('Strength', `${U.fmt(st.str)} <i>×${(1 + st.str / 100).toFixed(2)}</i>`, 'Your main stat. Each point is +1% to all damage, multiplying everything else.');
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
  h += row('Cooldowns', '−' + pct(st.cdr)) + row('Heat gain', '+' + pct(st.heat)) + row('Gold find', '+' + pct(st.gold)) + row('Magic find', '+' + pct(st.mf), 'Raises the odds of Rare and Unique drops.') + (st.flask ? row('Flask healing', '+' + pct(st.flask)) : '') + row('Movement', '+' + pct(st.move), 'How fast you walk between tiles. Only boots roll it.') + (st.orbFind ? row('Orb find', '+' + pct(st.orbFind)) : '');
  h += '</div></div>';
  $('gear-stats').innerHTML = h;
}
function renderBag() {
  const S = G.S, n = G.bagCount();
  let h = `<span class="bcount ${n >= D.BAG_SIZE ? 'full' : ''}">Bag <b>${n}</b>/${D.BAG_SIZE}</span>`;
  h += '<button class="small" data-act="sort" data-tip="Sort by rarity, then slot.">Sort</button>';
  h += '<span class="sep"></span><span class="lbl">Salvage</span>';
  h += ['Common', 'Magic', 'Rare'].map((nm, i) => `<button class="small r${i}" data-act="salv" data-rar="${i}" data-tip="Salvage every unlocked ${nm} item${i ? ' or lower' : ''} in your bag. Anything marked as an upgrade is kept.">${i ? nm : 'Com.'}</button>`).join('');
  h += '<span class="autos"><span class="lbl" data-tip="Tick a rarity to salvage those drops the moment you pick them up. Upgrades are always kept.">Auto</span>';
  h += ['C', 'M', 'R'].map((nm, i) => `<label class="chk mini r${i}" data-tip="Auto-salvage ${D.RARITY[i].name} drops"><input type="checkbox" data-autosalv="${i}" ${S.opts.salv[i] ? 'checked' : ''}><span>${nm}</span></label>`).join('') + '</span>';
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
  // techniques: one of two for each skill on the bar, each leaning the skill toward a stat
  const active = hero.bar.filter(id => id && D.TECH[id]);
  h += '<div class="tech"><div class="tech-head"><b>Techniques</b><span>One for each skill on your bar. Each makes a different stat worth more, and the upgrade arrows follow.</span></div>';
  if (!active.length) h += '<p class="note">Put a skill on the bar to choose its technique.</p>';
  for (const id of active) {
    const cur = (hero.tech || {})[id];
    const on = D.TECH[id].find(t => t.id === cur);
    h += `<div class="tech-row d-${D.SKILL[id].disc}"><div class="node on has" data-skill="${id}">${skillIcon(id)}</div><div class="tech-body"><div class="tech-opts">` +
      D.TECH[id].map(t => `<button class="tech-opt ${cur === t.id ? 'on' : ''}" data-tech="${id}:${t.id}" data-tip="<b>${t.name}</b> · ${D.SKILL[id].name}<br>${esc(t.desc)}<br><i>Makes ${t.stat} worth more.${cur === t.id ? ' Click to take it off.' : ''}</i>"><b>${t.name}</b><i>${t.stat}</i></button>`).join('') +
      `</div><p class="tech-say ${on ? '' : 'none'}">${on ? on.desc : 'No technique chosen. Hover one to see what it does.'}</p></div></div>`;
  }
  h += '</div>';
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
/* What the piece on the bench adds to Damage and Toughness. After anything is done to it (cube, reroll, masterwork,
   transfigure) the change rises in green or sinks in red beside each number for a moment. A redraw part-way through
   picks the animation up where it was, by starting it in the past. */
const WORTH_MS = 2600, AGE = '\u0001age';
function worthHtml(it) {
  const w = G.itemWorth(it); UI.worth = { id: it.id, off: w.off, def: w.def };
  const age = UI.worthLast && UI.worthLast.id === it.id ? performance.now() - UI.worthLast.t : Infinity, wl = age < WORTH_MS ? UI.worthLast : null, d = `style="animation-delay:${AGE}ms"`;      // AGE is filled in only when the panel is really redrawn (see put)
  const chip = v => (!wl ? '' : v ? `<em class="${v > 0 ? 'up' : 'dn'}" ${d}>${v > 0 ? '▲' : '▼'} ${U.fmt(Math.abs(v))}</em>` : `<em class="eq" ${d}>◆ same</em>`);
  const box = (cls, label, v, dv) => `<div class="${cls} ${wl && dv ? (dv > 0 ? 'up' : 'dn') : ''}" ${wl && dv ? d : ''}><span>${label}</span><b>${v < 0 ? '−' : '+'}${U.fmt(Math.abs(v))}</b>${chip(dv)}</div>`;
  return `<div class="an-worth" data-tip="What this piece adds for you: your Damage and Toughness with it worn, against the same slot left empty (for a weapon, bare hands that swing as fast). It depends on the rest of your gear and the skills on your bar, and counts stats only, not a Unique's power.">` +
    box('dmg', 'Damage', w.off, wl ? wl.off : 0) + box('tough', 'Toughness', w.def, wl ? wl.def : 0) + '</div>';
}
/* what one affix adds, beside it on the bench: Damage and Toughness, each only when it is not nothing */
function affWorth(w) {
  if (!w || (!w.off && !w.def)) return '<i class="aw none" data-tip="This affix changes neither your Damage nor your Toughness rating with the build you have now.">–</i>';
  const n = (v, cls) => (v ? `<b class="${cls}">${v < 0 ? '−' : '+'}${Math.abs(v) < 10 ? Math.abs(v) : U.fmt(Math.abs(v))}</b>` : '');
  return `<i class="aw" data-tip="What this affix alone adds for you: <b style=&quot;color:var(--hot)&quot;>Damage</b> and <b style=&quot;color:#8fd0ff&quot;>Toughness</b>, with it on the piece against the piece without it. The affixes multiply each other, so they do not quite add up to the total above.">${n(w.off, 'd')}${n(w.def, 't')}</i>`;
}
/* called when something has just been done to a piece: compare with what the bench last showed */
function worthChanged(it) {
  if (!it || it.id !== UI.forgeId || !UI.worth || UI.worth.id !== it.id) return;
  const w = G.itemWorth(it);
  UI.worthLast = { id: it.id, off: w.off - UI.worth.off, def: w.def - UI.worth.def, t: performance.now() };
}
/* One bench for everything done to a single piece: its affixes (with enchant rerolls), the cube, then the forge. */
function renderCraft() {
  const S = G.S, f = UI.forgeId ? G.findItem(UI.forgeId) : null;
  if (!f) { UI.forgeId = null; UI.cubeLast = null; }
  let h = '';
  if (!f) h += '<div class="anvil empty"><b>The bench is empty</b><p>Click any piece of gear, worn or in your bag or stash, to bring it here. Then buy transmutes at the cube to change its affixes, or the forge to masterwork it, reroll an affix and, last of all, transfigure it.</p></div>';
  else {
    const it = f.it, last = UI.cubeLast && UI.cubeLast.itemId === it.id ? UI.cubeLast : {}, ec = I.enchantCost(it);
    h += `<div class="anvil"><div class="an-item">${itemCell(it, 'big')}<div><b style="color:${RC(it.rar)}">${esc(it.name)}</b><span>${I.typeLine(it)} · ${I.itemPower(it)} Item Power · ${f.where === 'gear' ? 'worn' : f.where === 'stash' ? 'in stash' : 'in bag'}</span></div>` +
      `<div class="an-btns">${f.where === 'gear' ? '' : '<button class="small" data-act="equip-one">Equip</button>'}<button class="small" data-act="bench-clear" data-tip="Take this piece off the bench. It stays ${f.where === 'gear' ? 'equipped' : f.where === 'stash' ? 'in your stash' : 'in your bag'}.">Clear</button></div></div>`;
    h += worthHtml(it);
    const imp = I.implicit(it);
    h += `<div class="main-stat">${imp.dmg ? `<b>${U.fmt(imp.dmg)}</b> damage per hit, ${imp.aps.toFixed(2)} attacks per second` : imp.armor ? `<b>${U.fmt(imp.armor)}</b> armor` : imp.life ? `<b>${U.fmt(imp.life)}</b> life` : `<b>+${imp.dmgPct}%</b> damage`}</div>`;
    // each row carries its index, so hovering one of the cube's offers can light up the affixes it could touch
    const moved = {}; for (const m of (last.up || []).concat(last.down || [])) moved[m[0]] = m[1];
    h += '<ul class="aff-list">';
    const aw = G.affixWorth(it);
    it.affixes.forEach((a, i) => {
      if (it.pend && it.pend.idx === i) {      // a reroll waiting to be chosen: the old affix and the new one on one line
        const na = it.pend.a, dot = x => `<u style="background:${D.AFFIX_CAT[I.catOf(it, x.k)].color}" data-tip="${D.AFFIX_CAT[I.catOf(it, x.k)].name}"></u>`, one = (x, w, cls) => `<span class="${cls}">${dot(x)}${tierTag(it, x)}${x.g ? '<b class="gst">★</b>' : ''}<span class="p-txt" data-tip="${esc(I.affixText(it, x, i))} ${I.affixRange(it, x, i)}">${I.affixText(it, x, i)}</span>${affWorth(w)}</span>`;
        h += `<li class="pend" data-ai="${i}"><span class="p-line">${one(a, aw[i], 'p-old')}<span class="p-go"><b class="p-arrow">→</b>${one(na, G.pendWorth(it), 'p-new')}</span></span><span class="p-btns"><button class="small" data-act="ench-keep" data-tip="Keep the affix you had. The gold is spent either way.">Keep old</button><button class="small go" data-act="ench-take" data-tip="${a.g ? '<b class=&quot;neg&quot;>The old affix is Greater, and the new one is not.</b> ' : ''}Take the new affix in its place.">Take new</button></span></li>`;
        return;
      }
      const fresh = last.idx === i || (last.idxs || []).includes(i) || (UI.tfLast && UI.tfLast.id === it.id && UI.tfLast.res.idx === i), ok = I.canEnchant(it, i);
      h += `<li class="${fresh ? 'fresh' : ''} ${it.ench === i ? 'ench' : ''} ${I.masterworked(it, i) ? 'mw' : ''}" data-ai="${i}"><span><u style="background:${D.AFFIX_CAT[I.catOf(it, a.k)].color}" data-tip="${D.AFFIX_CAT[I.catOf(it, a.k)].name}"></u>${tierTag(it, a)}${a.g ? '<b class="gst">★</b>' : ''}${I.affixText(it, a, i)} <span class="rng">${I.affixRange(it, a, i)}</span></span>` +
        (a.t ? '<em class="tft" data-tip="Added by transfiguring. It may be an affix this slot could never roll.">✧ transfigured</em>' : '') + (I.masterworked(it, i) ? '<em class="mwt" data-tip="Masterworked: this affix is 25% stronger (or +1 on a skills affix). Masterwork again at rank 25 to move it to another affix.">◆ masterworked</em>' : '') + (last.idx === i ? '<em>new</em>' : moved[i] != null ? `<em class="${moved[i] < 0 ? 'dnt' : ''}">${moved[i] > 0 ? '▲ ' + moved[i] + (moved[i] > 1 ? ' tiers' : ' tier') : moved[i] < 0 ? '▼ ' + -moved[i] + (moved[i] < -1 ? ' tiers' : ' tier') : 'already at the top'}</em>` : (last.idxs || []).includes(i) ? `<em>${last.op === 'shuffle' ? 'moved' : last.op === 'reroll' || last.op === 'recast' ? 'new' : 'rerolled'}</em>` : '') + (it.ench === i && !it.sealed && !it.uniq ? `<em class="sft" data-tip="You rerolled this affix at the forge, so it is locked: nothing the cube does will remove it, replace it, renumber it or change its tier. Only the forge changes it now.">locked</em>` : '') + affWorth(aw[i]) + (ok ? `<button class="small" data-act="enchant" data-idx="${i}" ${G.canPay(ec) ? '' : 'disabled'} data-tip="${a.g ? '<b class=&quot;neg&quot;>This affix is Greater, and rerolling it gives that up:</b> the new affix will be an ordinary one. ' : ''}Reroll this affix into another, and then choose between the new one and the old one. Once you pick an affix, it is the only one this piece can have rerolled, and the cube will not touch it. Each reroll on a piece costs a little more gold, up to five times the first price.">Reroll</button>` : '') + '</li>';
    });
    if (last.removed) h += `<li class="gone"><span>${last.removed}</span><em>removed</em></li>`;
    if (!it.affixes.length && !last.removed) h += '<li class="no"><span>No affixes yet.</span></li>';
    h += '</ul>';
    if (it.uniq) h += `<div class="an-asp">✦ ${I.powerText(it)}</div>`;
    h += `<div class="an-foot"><span>${it.affixes.length} of ${D.MAX_AFFIXES} affixes</span>${it.sealed ? '<span>✧ Sealed</span>' : it.affixes.length ? `<span>Reroll costs ${costHtml(ec)}</span>` : ''}</div></div>`;
  }
  // ---- the cube: buy a transmute, get three offers for this piece, take one
  h += '<h4 class="sect">The cube</h4><div class="cube">';
  if (!f) h += `<div class="cube-box"><button class="big" disabled>Buy a transmute ${costHtml(I.offerCost())}</button></div><p class="cube-say no">Bring a piece of gear to the bench first.</p>`;
  else if (I.offerHidden(f.it)) {      // a free transmute, face down: one click turns the three options over
    h += `<div class="cube-box free"><button class="big reveal" data-act="reveal-transmute" data-tip="Turn over the three things the cube offers for this piece. It costs nothing, and you then take one of them (or cancel).">✦ Reveal the free transmute</button></div><p class="cube-say"><b class="free">A free transmute is waiting on this piece.</b> Reveal it to see the cube's three options.</p>`;
  } else if (f.it.offer) {
    const it = f.it, deal = UI.deal && UI.deal.id === it.id ? performance.now() - UI.deal.t0 : 1e9, dealing = deal < DEAL_STEP * 3 + 600, names = l => l.map(i => affName(it.affixes[i].k)), short = (l, n) => (l.length > n ? l.slice(0, n).join(', ') + ' and ' + (l.length - n) + ' more' : l.join(', '));
    h += `<p class="cube-say">${it.offerFree ? '<b class="free">✦ A free transmute.</b> ' : ''}The cube offers three things it could do. Take one: hover a card to see what it could touch.</p><div class="offer ${dealing ? 'deal' : ''}">`;
    it.offer.forEach((o, n) => {
      const L = I.cubeLabel(o), tg = I.cubeValid(it, o) ? I.cubeTargets(it, o) : [], col = I.CUBE_COLOR[L.fam];
      let on = '';
      if (o.op === 'add' || o.op === 'convert') { const pool = I.affixPool(I.poolKey(it), it.affixes.map(a => a.k), o.op === 'add' ? o.cat : o.to).map(a => affName(a.id)); on = (o.op === 'convert' && tg.length ? (tg.length === 1 ? 'Takes ' : 'Takes one of: ') + short(names(tg), 3) + '. ' : '') + (pool.length === 1 ? 'Adds ' : `Adds one of ${pool.length}: `) + short(pool, 5); }
      else if (o.op === 'raise' && tg.length) { const a = it.affixes[tg[0]], t = I.affixTier(it, a); on = `${affName(a.k)}: T${t} to T${t + 1}`; }
      else if (o.op === 'recast') on = `Replaces ${tg.length} affix${tg.length === 1 ? '' : 'es'}`;
      else if (o.op === 'shuffle' || o.op === 'pass') on = '';
      else if (tg.length) on = (o.op === 'tiers' ? 'Three of: ' : ['values', 'polish'].includes(o.op) ? 'On: ' : tg.length === 1 ? 'Hits ' : `One of ${tg.length}: `) + short(names(tg), 4);
      h += `<button class="offer-card f-${L.fam}" data-pick="${n}" data-tg="${tg.join()}" style="--c:${col}${dealing ? `;animation-delay:${Math.round(n * DEAL_STEP - deal)}ms` : ''}"><img src="${SP.url('orb', I.CUBE_PAL[L.fam], 3)}" alt=""><b>${L.title}</b><span>${L.desc}</span>${on ? `<small>${on}</small>` : ''}</button>`;
    });
    h += '</div>';
    { const t = I.cancelTargets(it), armed = UI.cancelArm === it.id;
      h += `<div class="offer-cancel"><button class="small ${armed ? 'danger' : ''}" data-act="cancel-transmute" data-tg="${t.join()}" style="--c:#ff6b5a" data-tip="Throw this offer away without taking any of it. ${t.length ? 'The cube takes its due: <b class=&quot;neg&quot;>one random affix loses a tier</b> (never the affix you rerolled at the forge, a Greater affix or a skill rank).' : 'Nothing on this piece has a tier to lose, so it costs nothing more.'}${it.offerFree ? '' : ' The ember dust you paid is not returned.'}">${armed ? 'Really cancel?' : 'Cancel the transmute'}</button><span>${t.length ? 'costs one affix a tier' : 'nothing to lose: free'}</span></div>`; }
  } else {
    const why = I.offerCheck(f.it) || (G.canPay(I.offerCost(f.it)) ? null : `This transmute costs ${I.offerCost(f.it).dust} ember dust and you have ${U.fmt(S.mats.dust || 0)}. Salvage gear for more; elites and bosses always carry some.`);
    h += `<div class="cube-box"><button class="big" data-act="buy-transmute" ${why ? 'disabled' : ''} data-tip="The cube draws three things it could do to this piece: add, remove or reroll an affix (sometimes of one type, sometimes the first or last), renumber it, move its tiers, and a few rarer ones. You then have to take one of the three before you can buy another transmute for this piece. The first transmute for a piece costs ${D.CUBE_COST.first} ember dust and each one after costs ${D.CUBE_COST.step} more, up to ${D.CUBE_COST.cap}. Free transmutes cost nothing and do not raise the price.">Buy a transmute <span class="cost ${G.canPay(I.offerCost(f.it)) ? '' : 'short'}"><i class="ci dust"></i>${I.offerCost(f.it).dust}</span></button></div>`;
    const last = UI.cubeLast && UI.cubeLast.itemId === f.it.id && UI.cubeLast.o ? UI.cubeLast : null;      // (a forge reroll also sets cubeLast, without an option)
    const gone = UI.cubeLast && UI.cubeLast.itemId === f.it.id && UI.cubeLast.op === 'cancel' ? UI.cubeLast : null;
    h += `<p class="cube-say ${why ? 'no' : ''}">${why || (gone ? `<b class="neg">Offer cancelled.</b> ${gone.lost ? `${affName(gone.lost.k)} fell to tier ${gone.lost.ti}. ` : 'Nothing was lost. '}Buy another to see three new options.` : last ? `<b style="color:${I.CUBE_COLOR[I.cubeLabel(last.o).fam]}">${I.cubeLabel(last.o).title}.</b> ${last.removed ? 'Lost ' + last.removed + '. ' : ''}${last.was ? 'Gave up ' + last.was + '. ' : ''}${last.op === 'pass' ? 'Nothing changed. ' : ''}Buy another to see three new offers.` : 'You do not choose what the cube does: it offers three things, and you take one. The affix you rerolled at the forge is never touched.')}</p>`;
  }
  h += '</div>';
  // ---- the forge
  h += '<h4 class="sect">The forge</h4>';
  if (!f) h += '<p class="note">Masterworking, transfiguring and salvage appear here once a piece is on the bench.</p>';
  else {
    const it = f.it, max = D.MW_MAX, up = it.up || 0, c = I.upgradeCost(it), no = I.upgradeCheck(it);
    const gain = UI.mwLast && UI.mwLast.id === it.id && UI.mwLast.ranks ? UI.mwLast.ranks : 0, has = it.mw && it.mw.length ? it.mw[0] : -1;
    if (it.sealed) h += '<div class="sealed"><b>✧ Sealed</b> This piece has been transfigured. It can still be worn, stashed and salvaged, but nothing more can be done to it at the forge or in the cube.</div>';
    else {
    h += `<div class="op first"><div class="op-t"><b>Masterwork</b><span>Each strike adds 1 to 3 ranks, and every rank is +1% to everything on the piece. At rank ${max}, strike once more to masterwork one random affix for +25%. Striking again moves it to a different affix.</span></div>`;
    h += `<div class="mw-bar ${up >= max ? 'full' : ''}"><i style="width:${up / max * 100}%;--from:${Math.max(0, up - gain) / max * 100}%"></i><b>Rank ${up}/${max}</b>${gain ? `<em>+${gain}</em>` : ''}</div>`;
    if (up >= max) h += `<div class="mw-aff">${has >= 0 && it.affixes[has] ? '◆ Masterworked: ' + I.affixText(it, it.affixes[has], has) : it.affixes.length ? 'No affix is masterworked yet.' : ''}</div>`;
    h += `<div class="op-a">${no ? `<i>${no}</i>` : costHtml(c) + `<button data-act="upgrade" ${G.canPay(c) ? '' : 'disabled'}>${up < max ? 'Masterwork<small>+1 to 3 ranks</small>' : has >= 0 ? 'Masterwork a different affix' : 'Masterwork an affix'}</button>`}</div>`;
    h += '</div>';
    }
    h += transfigHtml(it);
    if (f.where === 'bag') { const y = I.salvageYield(it); h += `<div class="op slim"><div class="op-t"><b>Salvage</b><span>Break it down for ${Object.keys(y).map(k => y[k] + ' ' + MAT_NAME[k]).join(', ')}${I.salvageBack(it) ? `, of which ${I.salvageBack(it)} is half of what went into masterworking it` : ''}.</span></div><div class="op-a"><button class="danger" data-act="salvage-one">Salvage</button></div></div>`; }
  }
  put('tab-craft', h, x => x.split(AGE).join(String(-Math.round(UI.worthLast ? performance.now() - UI.worthLast.t : 0))));
}
/* Transfiguring: the last step. Shows the odds for this kind of piece, and asks twice, because it is final. */
const TF_TIP = { indes: 'Indestructible: nothing changes. This is the dud.', quality: `Item Quality: +1 to +${D.TRANSFIG_QUALITY}% to everything on the piece, beyond its masterwork ranks.`, affix: 'A fifth affix. It can be one this slot could never roll.',
  greater: 'One ordinary affix becomes Greater: its maximum roll, and half again. Only on gear of the top item level.', replace: 'One affix, chosen at random, is replaced by a new random one. It can take your best affix, a Greater one included.' };
function transfigHtml(it) {
  const kind = I.tfKind(it), last = UI.tfLast && UI.tfLast.id === it.id ? UI.tfLast.res : null;
  let h = '<div class="op tfig"><div class="op-t"><b>Transfigure</b><span>The last step. One roll on the table below, and then the piece is almost always sealed for good: no more masterworking, rerolling or cube. Any piece can be transfigured, whatever its rarity. Finish everything else first.</span></div>';
  if (last) {
    const what = last.kind === 'indes' ? 'Nothing changed. That was the dud.' : last.kind === 'quality' ? `+${last.v}: everything on it is ${last.v}% stronger.` : last.kind === 'affix' ? I.affixText(it, it.affixes[last.idx], last.idx) + '.'
      : last.kind === 'greater' ? I.affixText(it, it.affixes[last.idx], last.idx) + '.' : `${last.was} became ${I.affixText(it, it.affixes[last.idx], last.idx)}.`;
    h += `<div class="tf-res ${last.kind === 'replace' ? 'bad' : last.kind === 'indes' ? 'dud' : 'good'}"><b>${D.TRANSFIG_NAME[last.kind]}</b> ${what} ${last.open ? '<i>And it was not sealed: you can keep working on it, or transfigure it again.</i>' : ''}</div>`;
  }
  if (it.sealed) return h + '</div>';
  const odds = D.TRANSFIG[kind], c = I.transfigCost(it), armed = UI.tfArm === it.id, unfinished = (it.up || 0) < D.MW_MAX;
  h += '<div class="tf-odds">' + D.TRANSFIG_KINDS.filter(k => odds[k]).map(k => `<span class="${k === 'replace' ? 'bad' : k === 'indes' ? 'dud' : ''}" data-tip="${TF_TIP[k]}"><b>${odds[k]}%</b>${D.TRANSFIG_NAME[k]}</span>`).join('') +
    `<span class="open" data-tip="The chance the piece is not sealed afterwards. It can then be worked on as before, or transfigured again."><b>${odds.open}%</b>Stays open</span></div>`;
  if (it.offer) h += '<p class="note warn">The cube\'s offer for this piece is still waiting. If the piece is sealed, the offer is lost.</p>';
  if (unfinished) h += `<p class="note warn">This piece is at masterwork rank ${it.up || 0} of ${D.MW_MAX}. Once sealed it cannot be masterworked further.</p>`;
  h += `<div class="op-a">${costHtml(c)}<button class="${armed ? 'danger' : ''}" data-act="transfigure" ${G.canPay(c) ? '' : 'disabled'}>${armed ? 'Yes, transfigure it<small>this cannot be undone</small>' : 'Transfigure'}</button></div></div>`;
  return h;
}
function renderCommission() {
  const S = G.S, lvl = G.areaLevel(), cc = { gold: I.commissionCost(lvl) }, cap = D.gearCap(S.world.tier);
  let h = `<div class="cx-head"><b>Commission</b><span>Pay the smelter to cast a random piece for a slot of your choice. It comes at item level ${Math.min(lvl, cap)}${lvl > cap ? `, the most gear can be in ${S.world.tier ? D.TIERS[S.world.tier].name : 'the campaign'}` : ", this area's level"}, and is never Common. It lands in your bag.</span></div>`;
  h += `<div class="op-a" style="justify-content:flex-start">${costHtml(cc)}<span class="note">each. You have ${U.fmt(S.gold)} gold${G.bagCount() >= D.BAG_SIZE ? ', but your bag is full' : ''}.</span></div><div class="com-row">` +
    D.ITEM_SLOTS.map(s => { const worn = (s === 'ring' ? [S.gear.ring1, S.gear.ring2] : [S.gear[s]]).map(x => (x ? x.ilvl : '–')).join(' / ');
      return `<button class="com" data-act="commission" data-slot="${s}" ${G.canPay(cc) ? '' : 'disabled'} data-tip="Cast a ${D.SLOT_NAME[s].toLowerCase()}. You are wearing item level ${worn}."><img src="${SP.url(D.BASES[D.BASES_BY_SLOT[s][0]].spr, D.material(lvl).pal, 3)}" alt=""><b>${D.SLOT_NAME[s]}</b><span>wearing ${worn}</span></button>`; }).join('') + '</div>';
  put('tab-commission', h);
}

function recordsHtml() {
  const S = G.S, t = S.stats.time, hh = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60);
  return '<div class="rec">' + [['Time played', (hh ? hh + 'h ' : '') + mm + 'm'], ['Monsters slain', U.fmt(S.stats.kills)], ['Elites slain', U.fmt(S.stats.elites || 0)], ['Areas cleared', S.stats.clears], ['Times fallen', S.stats.deaths], ['Uniques found', S.stats.uniq], ['Best power', U.fmt(S.stats.best || 0)]].map(r => `<div class="st"><span>${r[0]}</span><b>${r[1]}</b></div>`).join('') + '</div>';
}

/* -------------------------------------------------------------- render */
/* Replace a panel's markup only when it has changed. A redraw swaps every button for a new one, and a click only
   counts if the press and the release land on the same element, so needless redraws eat clicks. */
const lastHtml = {};
function put(id, h, fill) { if (lastHtml[id] !== h) { lastHtml[id] = h; $(id).innerHTML = fill ? fill(h) : h; } }
UI.render = function () {
  // while a button is held down nothing is redrawn under it: the changes wait for the release (or 1.2 s, whichever
  // comes first). Kills pay gold many times a second in a fight, and each payment used to redraw the forge.
  if (UI.pressT && performance.now() - UI.pressT < 1200) return;
  const d = UI.dirty; UI.dirty = {};
  if (d.top) renderTop();
  if (d.hud) renderHudBar();
  if (d.map) renderMap(); else if (d.hint) renderHint();
  if (d.gear) renderGear();
  if (d.bag || d.gear || d.forge || d.cube) renderBag();
  if (d.skills && UI.tab === 'skills') renderSkills();
  if ((d.forge || d.cube || d.bag) && UI.tab === 'craft') renderCraft();
  if ((d.forge || d.bag || d.map) && UI.tab === 'commission') renderCommission();
};
UI.setTab = function (t) {
  UI.tab = t;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  for (const k of ['skills', 'craft', 'commission', 'stats']) $('tab-' + k).classList.toggle('hidden', k !== t);
  $('panel').scrollTop = 0;
  mark(t === 'craft' || t === 'commission' ? 'forge' : t === 'stats' ? 'gear' : t); hideTip();
};
/* bring a piece of gear to the crafting bench */
UI.craft = function (id) {
  UI.forgeId = id; UI.cubeLast = null; UI.mwLast = null; UI.worthLast = null; UI.worth = null; UI.tfArm = null; UI.cancelArm = null; UI.tfLast = null;
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
/* ---- a boss has fallen: the celebration card over the arena, and the walk to the next level ----
   The card names the boss and the level, says what the level cost, and shows the five levels as a track. When the
   smith sets off (G.leave) a marker moves along the track to where they are going; UI.frame keeps it in step with
   the game's own count, so pausing pauses it. With Auto off the card offers the choice instead. */
const CONFETTI = ['#ffd27a', '#ff8a2a', '#fff3c4', '#7fd4ff', '#9be36a', '#ff5a3a', '#c9b8ff'];
function levelTrack(tier, from, to) {
  const W = G.S.world, n = D.AREAS.length;
  let h = '<div class="vic-track"><div class="vt-line"><i id="vic-fill"></i></div>';
  D.AREAS.forEach((a, i) => { const done = W.cleared[tier] != null && i < W.cleared[tier]; h += `<div class="vt-node ${done ? 'done' : ''} ${i === from ? 'from' : ''} ${i === to ? 'to' : ''}" style="left:${i / (n - 1) * 100}%" data-tip="${esc(D.ACTS[a.act].name)}: level ${D.areaLevel(i, tier)}–${D.areaLevel(i, tier) + D.areaSpan(tier)}"><b>${done ? '✓' : i + 1}</b><span>${esc(D.ACTS[a.act].name)}</span></div>`; });
  return h + `<img id="vic-mark" src="${SP.url('hero', 'hero', 2)}" alt="" style="left:${from / (n - 1) * 100}%"></div>`;
}
UI.victoryCard = function (d) {
  const S = G.S, area = D.AREAS[d.area], act = D.ACTS[area.act], boss = D.BOSSES[act.boss], last = d.area === D.AREAS.length - 1, next = last ? null : D.AREAS[d.area + 1];
  let conf = ''; for (let i = 0; i < 44; i++) { const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 230; conf += `<i style="--x:${Math.round(Math.cos(a) * r)}px;--y:${Math.round(Math.sin(a) * r * 0.7 - 30)}px;--r:${Math.round(Math.random() * 720 - 360)}deg;--c:${CONFETTI[i % CONFETTI.length]};--d:${Math.round(Math.random() * 260)}ms;--s:${5 + Math.round(Math.random() * 6)}px"></i>`; }
  let h = `<div class="vic-card"><div class="vic-burst">${conf}</div><button class="vic-x" data-vic="close" title="Close">×</button>`;
  h += `<div class="vic-kicker">${d.first ? 'First kill' : 'Slain again'}${d.tier ? ' · ' + D.TIERS[d.tier].name : ''}</div><h2>${esc(boss.name)}</h2><p class="vic-sub">${esc(act.name)} is cleared.${d.first && next ? ' The way down is open.' : ''}</p>`;
  h += `<div class="vic-stats"><span><b>${d.rooms}</b>room${d.rooms === 1 ? '' : 's'} this run</span><span><b>${d.falls}</b>fall${d.falls === 1 ? '' : 's'} on the way</span><span><b>${Hr.gearLevel(S.gear)}</b>gear level</span></div>`;
  h += levelTrack(d.tier, d.area, d.area) + '<div class="vic-move" id="vic-move"></div>';
  h += `<div class="vic-btns" id="vic-btns">${next ? `<button class="big" data-vic="go" data-to="${next.idx}">On to ${esc(D.ACTS[next.act].name)}</button>` : '<button class="big" data-vic="travel">Travel</button>'}<button data-vic="again">Run it again</button><button data-vic="close">Stay and finish the map</button></div></div>`;
  const v = $('victory'); v.innerHTML = h; v.className = 'show burst' + (S.opts.auto ? ' auto' : ''); UI.vic = { d, moving: false };
  $('combat').classList.add('won-flash'); setTimeout(() => $('combat').classList.remove('won-flash'), 900);
  clearTimeout(UI.vicT); if (S.opts.auto) UI.vicT = setTimeout(() => { if (UI.vic && !UI.vic.moving) UI.victoryClose(); }, 6500);      // Auto may still have rooms to clear: do not sit on the fight
};
UI.victoryClose = function () { clearTimeout(UI.vicT); $('victory').className = 'hidden'; UI.vic = null; };
/* the smith sets off: say where to, and let the marker walk there */
UI.victoryMove = function (L) {
  const v = $('victory'), to = D.AREAS[L.to], act = D.ACTS[to.act], lvl = D.areaLevel(L.to, L.tier);
  if (!UI.vic) { v.innerHTML = `<div class="vic-card slim">${levelTrack(L.tier, L.from, L.to)}<div class="vic-move" id="vic-move"></div></div>`; v.className = 'show'; UI.vic = { d: null }; }      // set off later, after the rest of the map
  UI.vic.moving = true; clearTimeout(UI.vicT); v.classList.add('moving');
  v.querySelectorAll('.vt-node').forEach((n, i) => n.classList.toggle('to', i === L.to));
  const verb = L.to > L.from ? 'Descending to' : L.to < L.from ? 'Climbing back to' : 'Another run of';
  $('vic-move').innerHTML = `<span>${verb} <b>${esc(act.name)}</b> · level ${lvl}–${lvl + D.areaSpan(L.tier)}</span>`;
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
  if (fate === 'salvaged') { if (it.rar >= 2) UI.feed(`<span class="dim">Salvaged</span> <b style="color:${RC(it.rar)}" data-item="${it.id}">${esc(it.name)}</b>`, 'sal'); return; }
  if (it.rar === 0 && !it.upg) return;
  UI.feed(`${it.upg ? '<i class="pos">▲</i> ' : ''}${I.greaterCount(it) ? '<i class="hot">' + '★'.repeat(I.greaterCount(it)) + '</i> ' : ''}<b style="color:${RC(it.rar)}" data-item="${it.id}">${esc(it.name)}</b> <span class="dim">${I.typeLine(it)}</span>`, 'r' + it.rar);
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
UI.closeModal = function () { const was = $('modal-box').className, open = !$('modal').classList.contains('hidden'); $('modal').classList.add('hidden'); if (open && was === 'welcome') UI.askPlayData(); };      // the question about play data follows the welcome
UI.travel = function (tier) {
  const S = G.S, W = S.world; tier = tier == null ? W.tier : tier;
  let h = '<h2>Travel</h2><p class="sub">Five levels to a difficulty, each ending in a boss. Inside a level the monsters climb a level with every room you go deeper. A new map is drawn each time you arrive.</p><div class="tiers">';
  D.TIERS.forEach((t, i) => { const open = W.cleared[i] != null; h += `<button class="tier ${i === tier ? 'on' : ''}" ${open ? '' : 'disabled'} data-tier="${i}" style="--c:${t.color}">${t.name}${open ? '' : ' <small>locked</small>'}</button>`; });
  h += '</div><div class="acts">';
  for (const a of D.AREAS) {
    const act = D.ACTS[a.act], open = G.isUnlocked(a.idx, tier), done = W.cleared[tier] > a.idx, lvl = D.areaLevel(a.idx, tier), here = W.area === a.idx && W.tier === tier, boss = D.BOSSES[act.boss];
    h += `<button class="area ${done ? 'done' : ''} ${here ? 'here' : ''}" ${open ? '' : 'disabled'} data-go="${a.idx}" data-gotier="${tier}"><b>${a.idx + 1}. ${act.name}</b><span><em class="${lvlCls(lvl, tier)}">Level ${lvl}–${lvl + D.areaSpan(tier)}</em> · ${boss.name}, ${boss.title}</span><i>${here ? 'You are here' : done ? 'Cleared' : open ? 'New' : 'Locked'}</i></button>`;
  }
  h += `</div><div class="mfoot"><span class="note">${tier ? `In ${D.TIERS[tier].name} gear drops up to item level ${D.gearCap(tier)}${D.gearCap(tier) >= D.GEAR_CAP ? `, where affixes reach tier ${D.TIER_MAX}` : D.gearCap(tier) > D.gearCap(0) ? '' : ', as in the campaign'}. More Uniques and Greater affixes too.` : `Gear stops at item level ${D.gearCap(0)} in the campaign. Beat Vulkar in Hellforge to unlock Torment: gear rises to ${D.gearCap(2)} in Torment II and to ${D.GEAR_CAP}, with the last affix tier, in Torment III.`}</span><button data-close="1">Close</button></div>`;
  UI.modal(h, 'travel');
};
UI.settings = function () {
  const S = G.S;
  UI.modal(`<h2>Settings</h2>
    <div class="set"><label>Volume</label><input type="range" id="set-vol" min="0" max="100" value="${Math.round(S.opts.vol * 100)}"></div>
    <div class="set"><label>Flask</label><label class="chk"><input type="checkbox" id="set-flask" ${S.opts.autoFlask !== false ? 'checked' : ''}><span>Drink it automatically below 35% Life. You can always drink it yourself with Q.</span></label></div>
    <div class="set"><label>Keys</label><span class="note">Q drinks the flask. Space pauses. A toggles Auto. 1, 2, 3 set the speed. S, F, O and C open Skills, Crafting, Commission and Stats. T travels.</span></div>
    <div class="set"><label>Records</label>${recordsHtml()}</div>
    ${SW.telemetry.hosted() ? `<div class="set"><label>Play data</label><label class="chk"><input type="checkbox" id="set-tele" ${SW.telemetry.enabled() ? 'checked' : ''}><span>Send anonymous notes on how your runs go (where they end, how long levels take, what you craft, and errors) to help balance the game. No name, no address, nothing typed.</span></label></div>` : ''}
    <div class="set"><label>Save</label><div><button class="small" id="set-export">Copy save to clipboard</button> <button class="small" id="set-import">Load a save from text</button><textarea id="set-text" class="hidden" placeholder="Paste a save here, then press Load again"></textarea></div></div>
    <div class="set"><label>Start over</label><div><button class="small danger" id="set-wipe">Delete this save</button> <span class="note">There is no undo.</span></div></div>
    <div class="mfoot"><span class="note">Smeltworks saves in this browser after every battle.</span><button data-close="1">Close</button></div>`, 'settings');
};
/* Asked once, and only on the hosted game: may it send anonymous play data? Nothing is sent before the answer. */
UI.askPlayData = function () {
  const T = SW.telemetry;
  if (!T.hosted() || T.asked() || !$('modal').classList.contains('hidden')) return;
  UI.modal(`<h2>Help balance the game?</h2>
    <p>Smeltworks can send anonymous notes on how your runs go: which level, how many rooms, where and to what you fell, how long it took, what you crafted, and any errors. They are used to tune the game.</p>
    <p class="note">No name, no address and nothing you type is sent, only a random id for this browser. You can change your mind in Settings.</p>
    <div class="mfoot"><button id="tele-no">No thanks</button><button id="tele-yes" class="big">Share play data</button></div>`, 'ask');
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
    <p><b style="color:${D.TIERS[1].color}">Torment I is open.</b> The same descent, far deadlier. No Common gear drops there, Uniques come faster and more affixes roll Greater. From Torment II gear rises above item level 50, and in Torment III it reaches 55, where the last affix tier is.</p>
    <div class="mfoot"><button data-close="1">Keep farming here</button><button class="big" data-go="0" data-gotier="1">Enter Torment I</button></div>`, 'welcome');
};
/* ------------------------------------------------------ game → ui glue */
UI.onGame = function (type, d) {
  const S = G.S;
  switch (type) {
    case 'stats': mark('gear', 'top', 'hud', 'forge', 'cube', 'skills', 'map'); break;
    case 'map': mark('map', 'top'); break;
    case 'moved': A.play('step', 0.1); break;
    case 'expedition': UI.victoryClose(); mark('map', 'top'); SW.fx.clear(); SW.fx.setScene(D.ACTS[D.AREAS[S.world.area].act].bg); UI.banner(D.ACTS[D.AREAS[S.world.area].act].name, `${D.AREAS[S.world.area].name} · Level ${G.areaLevel()}–${G.areaLevel() + D.areaSpan(S.world.tier)}`, 'area', 1800); break;
    case 'rerun': UI.victoryClose(); mark('map', 'top'); SW.fx.clear(); SW.fx.setScene(D.ACTS[D.AREAS[S.world.area].act].bg); break;
    case 'battleStart':
      SW.fx.battleStart(); S.seen.fought = 1; mark('map');
      if (d.spec.boss) { const b = D.BOSSES[d.spec.boss]; UI.banner(b.name, b.title, 'boss', 2600); }
      break;
    case 'travel': mark('map'); break;
    case 'route': mark('map'); break;
    case 'begin': mark('top', 'hint'); break;
    case 'battleEnd': if (!d.win) SW.fx.clear(); mark('bag', 'map', 'top', 'skills', 'forge', 'gear'); break;
    case 'death': UI.banner('You fell', `The run is over. You keep everything you found. A new map opens in ${D.RUN_COOLDOWN} seconds.`, 'dead', 2400); mark('map'); break;
    case 'areaClear':
      A.play('clear'); setTimeout(() => A.play('master'), 320); UI.victoryCard(d);
      if (d.first && d.area === D.AREAS.length - 1 && d.tier === 0) setTimeout(() => UI.victory(), 2600);
      mark('top', 'map');
      break;
    case 'leaving': UI.victoryMove(d); break;
    case 'stay': if (UI.vic) { UI.vic.moving = false; $('victory').classList.remove('moving', 'auto'); $('vic-move').innerHTML = ''; } break;
    case 'tierUnlock': setTimeout(() => UI.banner(D.TIERS[d.tier].name + ' unlocked', D.gearCap(d.tier) > D.gearCap(d.tier - 1) ? `Gear drops there up to item level ${D.gearCap(d.tier)}` : 'More Uniques and Greater affixes drop there', 'boss', 3600), 2600); UI.feed(`<b style="color:${D.TIERS[d.tier].color}">${D.TIERS[d.tier].name} unlocked.</b> Open Travel to begin.`, 'r3'); break;
    case 'chest': A.play('chest'); SW.fx.spill(d.items, d.fate); UI.feed(`Chest: <b class="gold">${U.fmt(d.gold)} gold</b> and ${d.dust} ember dust`, ''); d.items.forEach((it, i) => UI.feedItem(it, d.fate[i])); mark('bag', 'map'); break;
    case 'fullClear': SW.fx.spill(d.items, d.fate); UI.feed(`Map cleared out: <b class="gold">${U.fmt(d.gold)} gold</b>, ${d.dust} ember dust and a bonus piece`, 'r2'); d.items.forEach((it, i) => UI.feedItem(it, d.fate[i])); mark('bag'); break;
    case 'shrine': { const s = D.SHRINES[d.id]; A.play('shrine'); SW.fx.heroGlow(s.color); UI.banner(s.name, `Life restored. ${s.desc} for ${D.SHRINE_FIGHTS} battles`, 'shrine', 1800); break; }
    case 'drink': A.play('potion'); SW.fx.heroGlow('#ff5a5a'); break;
    case 'equip': A.play('equip'); mark('gear', 'bag', 'forge', 'hint'); hideTip(); break;
    case 'bag': mark('bag'); break;
    case 'salvage': A.play('salvage'); purseGain(d.y); JUICE.salvage({ n: 1 }); mark('bag', 'forge', 'hint', 'top'); break;
    case 'autoSalvage': purseGain(d.y); break;
    case 'spend': purseSpend(d.cost); mark('top'); break;
    case 'salvageAll': A.play('salvage'); purseGain(d.y); JUICE.salvage({ n: 9 }); UI.toast(`Salvaged ${d.n} item${d.n === 1 ? '' : 's'}: ${Object.keys(d.y).map(k => d.y[k] + ' ' + MAT_NAME[k]).join(', ')}`); mark('bag', 'forge', 'hint'); break;
    case 'bagfull': if (!UI.fullT || Date.now() - UI.fullT > 8000) { UI.fullT = Date.now(); UI.toast('Bag full. New drops are being salvaged until you make room.', 'bad'); } break;
    case 'offer':      // the three options are dealt one at a time, each with a tick as it lands
      UI.deal = { id: d.it.id, t0: performance.now() }; A.play('click'); JUICE.offer();
      for (let n = 0, len = d.it.offer.length; n < len; n++) setTimeout(() => { if (d.it.offer && UI.deal && UI.deal.id === d.it.id && UI.forgeId === d.it.id && UI.tab === 'craft') A.play(n === len - 1 ? 'forge' : 'click', 0.5); }, 120 + n * DEAL_STEP);
      mark('cube', 'bag', 'gear', 'forge', 'top'); break;
    case 'freeTransmute': { A.play('shrine', 0.5); UI.feed(`<i class="hot">✦ Free transmute</i> for <b style="color:${RC(d.it.rar)}">${esc(d.it.name)}</b>: open it and reveal the three offers`, '');
      const at = centerOf(`.doll .dslot[data-slot="${D.SLOTS.find(sl => S.gear[sl] === d.it)}"]`); if (at) { sparks(['#ffe9a8', '#fff', '#ffb347'], 22, 90, at); ring('#ffe9a8', at); }
      mark('gear', 'bag', 'forge', 'cube'); break; }
    case 'coolEnd': A.play('click'); mark('map', 'hint'); break;
    case 'cube': A.play(d.res.removed ? 'salvage' : 'forge'); UI.cubeLast = Object.assign({ itemId: d.it.id }, d.res); worthChanged(d.it); JUICE.cube(d); mark('cube', 'bag', 'gear', 'forge');
      if (d.res.from != null) UI.toast(`It is now ${D.RARITY[d.it.rar].name}.`, 'good');
      break;
    case 'forge': A.play(d.kind === 'upgrade' && d.mw >= 0 ? 'master' : d.kind === 'commission' ? 'drop' + d.it.rar : 'forge'); mark('forge', 'bag', 'gear', 'top');
      if (d.kind !== 'commission') worthChanged(d.it);
      if (JUICE[d.kind]) JUICE[d.kind](d);
      if (d.kind === 'enchantPick') { UI.cubeLast = d.take ? { itemId: d.it.id, idx: d.idx, op: 'ench' } : null; JUICE.enchant(d); if (d.lostGreater) UI.toast('The Greater affix is gone: the new one is ordinary.', 'bad'); }      // a taken affix is shown as new
      { const n = d.kind === 'enchant' ? d.swapped : d.kind === 'transfigure' ? d.res.offer : 0;      // what became of the cube's waiting offer
        if (n < 0) UI.toast('Sealed: the cube\'s offer for this piece is lost.', 'bad');
        else if (n > 0) UI.toast(n === 1 ? 'One of the cube\'s options no longer applies. It is now "Leave it be".' : `${n} of the cube's options no longer apply. They are now "Leave it be".`); }
      if (d.kind === 'transfigure') { UI.tfLast = { id: d.it.id, res: d.res }; A.play(d.res.kind === 'replace' ? 'salvage' : d.res.kind === 'indes' ? 'forge' : 'master'); UI.toast(`Transfigured: ${D.TRANSFIG_NAME[d.res.kind]}${d.res.kind === 'quality' ? ' +' + d.res.v : d.res.kind === 'indes' ? ' (nothing changed)' : ''}${d.res.open ? '. It was not sealed.' : ''}`, d.res.kind === 'replace' ? 'bad' : d.res.kind === 'indes' ? '' : 'good'); }
      if (d.kind === 'upgrade') { UI.mwLast = { id: d.it.id, ranks: d.ranks, t: performance.now() }; if (d.mw >= 0) UI.toast('Masterworked: ' + I.affixText(d.it, d.it.affixes[d.mw], d.mw), 'good'); }
      if (d.kind === 'commission') { UI.feedItem(d.it, 'bag'); UI.forgeFlash = d.it.id; }
      break;
    case 'skills': mark('skills', 'hud', 'top', 'hint'); break;
    case 'fallback': UI.toast(`Three runs ended at the door. Auto is stepping back to ${d.to} to gather strength.`, 'bad'); break;
  }
};
/* battle events the DOM cares about */
UI.onBattle = function (ev) {
  if (ev.e === 'die' && ev.drops) {
    const d = ev.drops;
    d.items.forEach((it, i) => { UI.feedItem(it, d.fate[i]); if (it.uniq) UI.banner(it.name, 'A Unique drops', 'unique', 2600); });
    if (d.items.length) mark('bag', 'hint');
    if (d.first) UI.feed('First kill: a <b style="color:' + RC(2) + '">Rare</b> with a guaranteed <i class="hot">★ Greater affix</i>');
  }
};

/* --------------------------------------------------------------- input */
function setSpeed(v) { const S = G.S; if (v === 0) { if (S.opts.speed === 0) v = UI.prevSpeed || 1; else UI.prevSpeed = S.opts.speed; } S.opts.speed = v; mark('top'); }
function drink() { const why = G.drink(); if (why) deny(why); }
function toggleAuto() { const S = G.S; if (S.held && S.opts.auto) { G.begin(); mark('top', 'hint'); A.play('click'); if (S.opts.speed === 0) setSpeed(1); return; }      // a new save: the first press starts the run, with Auto left on
  S.opts.auto = !S.opts.auto; S.held = 0; S.seen.auto = 1; mark('top', 'hint'); A.play('click'); if (S.opts.auto && S.opts.speed === 0) setSpeed(1); }
function go(area, tier) {
  if (!G.isUnlocked(area, tier)) return;
  G.startExpedition(area, tier); UI.closeModal(); G.save();
}
UI.bind = function () {
  const release = () => { UI.pressT = 0; };
  document.addEventListener('pointerdown', e => { UI.pressT = e.button === 0 ? performance.now() : 0; UI.px = e.clientX; UI.py = e.clientY; UI.pxT = performance.now(); }, true);
  for (const ev of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(ev, release, true);
  window.addEventListener('blur', release);
  // hovering one of the cube's offers lights up the affixes it could touch, in the offer's colour
  document.addEventListener('mouseover', e => {
    const c = e.target.closest ? e.target.closest('.offer-card, [data-act=cancel-transmute]') : null; if (c === UI.hoverCard && (!c || c.isConnected)) return; UI.hoverCard = c;
    document.querySelectorAll('.aff-list li.tg').forEach(x => x.classList.remove('tg'));
    if (c) for (const i of (c.dataset.tg || '').split(',').filter(Boolean)) { const li = document.querySelector(`.aff-list li[data-ai="${i}"]`); if (li) { li.classList.add('tg'); li.style.setProperty('--tc', c.style.getPropertyValue('--c')); } }
  });
  document.addEventListener('pointerdown', () => A.unlock(), { once: false, passive: true });
  document.addEventListener('mousemove', e => {
    const el = e.target.closest && e.target.closest('[data-item],[data-skill],[data-tile],[data-tip]');
    if (!el || UI.dragId) { if (tipEl) hideTip(); return; }
    const key = (el.dataset.item || el.dataset.skill || el.dataset.tile || el.dataset.tip) + '|' + UI.tab;
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
      if (slot.replace(/\d/, '') !== f.it.slot) deny(`That is a ${D.SLOT_NAME[f.it.slot].toLowerCase()}, not a ${D.SLOT_NAME[slot].toLowerCase()}.`); else if (!G.equip(id, slot)) deny(G.equipWhy(id, slot) || 'That cannot go there.');
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
        else if (!G.equip(f.it.id)) deny(G.equipWhy(f.it.id) || 'That cannot be equipped.');
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
    if ((el = t.closest('[data-vic]'))) {
      const act = el.dataset.vic, W = S.world; A.play('click');
      if (act === 'close') UI.victoryClose();
      else if (act === 'travel') { UI.victoryClose(); UI.travel(); }
      else G.leave(act === 'go' ? +el.dataset.to : W.area, W.tier, true);      // on to the next level, or this one again
      return;
    }
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
    if (t.closest('#btn-route')) { G.clearRoute(); A.play('click'); return; }
    if (t.closest('#xpfree')) { const w = G.freeWaiting(), at = w.findIndex(it => it.id === UI.forgeId), it = w[(at + 1) % w.length]; if (it) { UI.craft(it.id); A.play('click'); } return; }      // each click goes on to the next one
    if ((el = t.closest('[data-tile]'))) {
      const [x, y] = el.dataset.tile.split(',').map(Number), c = G.cell(x, y);
      const r = G.routeToggle(c);
      if (r === 'added' || r === 'redirected') { A.play('click'); if (G.phase === 'idle') G.phaseT = 0; if (G.route.length > 1) S.seen.route = 1; }
      else if (r === 'removed') A.play('click');
      else if (r === 'busy') deny('The fight for that room has already begun.');
      else if (c.type !== 'wall' && c.state !== 'done') deny('That tile is not connected yet. Pick one next to a cleared tile, or next to a tile already on your route.');
      tipKey = ''; hideTip();
      return;
    }
    if ((el = t.closest('[data-tech]'))) { const [sk, id] = el.dataset.tech.split(':'); if (G.setTech(sk, id)) A.play('click'); hideTip(); return; }
    if ((el = t.closest('[data-pick]'))) { if (UI.deal && UI.deal.id === UI.forgeId && performance.now() - UI.deal.t0 < +el.dataset.pick * DEAL_STEP) return;      // not dealt yet
      if (!G.pickTransmute(UI.forgeId, +el.dataset.pick)) { const f = G.findItem(UI.forgeId); deny(f && f.it.pend ? I.PEND_FIRST : 'That offer is gone.'); } return; }
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
      else if (act === 'salv') { if (!G.salvageAll(+el.dataset.rar)) deny('Nothing to salvage at that rarity. Upgrades and locked pieces are kept.'); }
      else if (act === 'clear-skills') { G.clearSkills(); A.play('salvage'); }
      else if (act === 'buy-transmute') { if (!G.buyTransmute(UI.forgeId)) deny(I.offerCheck(G.findItem(UI.forgeId).it) || 'Not enough ember dust.'); }
      else if (act === 'equip-one') { if (!G.equip(UI.forgeId)) deny(G.equipWhy(UI.forgeId) || 'That cannot be equipped.'); }
      else if (act === 'bench-clear') { UI.forgeId = null; UI.cubeLast = null; hideTip(); mark('forge', 'bag', 'gear'); A.play('click'); }
      else if (act === 'upgrade') { if (!G.upgrade(UI.forgeId)) deny('You cannot afford that.'); }
      else if (act === 'transfigure') {
        if (UI.tfArm !== UI.forgeId) { UI.tfArm = UI.forgeId; A.play('click'); mark('forge'); }       // first click arms it, the second does it
        else { UI.tfArm = null; if (!G.transfigure(UI.forgeId)) { const f = G.findItem(UI.forgeId); deny((f && I.transfigCheck(f.it)) || 'You cannot afford that.'); } }
      }
      else if (act === 'enchant') { if (!G.enchant(UI.forgeId, +el.dataset.idx)) deny('You cannot afford to reroll this.'); }
      else if (act === 'ench-keep' || act === 'ench-take') G.enchantPick(UI.forgeId, act === 'ench-take');
      else if (act === 'reveal-transmute') { if (!G.revealOffer(UI.forgeId)) deny('There is nothing to reveal.'); }
      else if (act === 'cancel-transmute') {
        const f = G.findItem(UI.forgeId), free = f && !I.cancelTargets(f.it).length;
        if (!free && UI.cancelArm !== UI.forgeId) { UI.cancelArm = UI.forgeId; A.play('click'); mark('forge'); }      // it costs a tier: ask twice
        else { UI.cancelArm = null; if (!G.cancelTransmute(UI.forgeId)) deny(f && f.it.pend ? I.PEND_FIRST : 'There is no offer to cancel.'); }
      }
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
    else if (t.id === 'set-tele') SW.telemetry.setEnabled(t.checked);
    else if (t.id === 'opt-advance') { S.opts.onClear = t.checked ? 'advance' : 'repeat'; G.save(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'set-vol') { G.S.opts.vol = e.target.value / 100; A.setVol(G.S.opts.vol); } });
  $('modal').addEventListener('click', e => {
    const id = e.target.id;
    if (id === 'set-export') { const s = G.exportSave(); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).then(() => UI.toast('Save copied.'), () => { const ta = $('set-text'); ta.classList.remove('hidden'); ta.value = s; ta.select(); }); }
    else if (id === 'set-import') { const ta = $('set-text'); if (ta.classList.contains('hidden') || !ta.value.trim()) { ta.classList.remove('hidden'); ta.value = ''; ta.focus(); } else if (G.importSave(ta.value)) { UI.closeModal(); UI.fresh(); UI.toast('Save loaded.'); } else deny('That does not look like a Smeltworks save.'); }
    else if (id === 'tele-yes' || id === 'tele-no') { SW.telemetry.setEnabled(id === 'tele-yes'); UI.closeModal(); if (id === 'tele-yes') UI.toast('Thank you. You can turn this off in Settings.'); }
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
    else if (k === 's') UI.setTab('skills'); else if (k === 'f') UI.setTab('craft'); else if (k === 'o') UI.setTab('commission'); else if (k === 'c') UI.setTab('stats');
    else if (k === 't') UI.travel();
  });
  window.addEventListener('resize', () => SW.fx.resize());
};
/* full repaint, used at boot and after loading a save */
/* redraw every panel from the current state, without resetting anything (the bench, the arena) */
UI.redraw = function () { mark('top', 'hud', 'map', 'gear', 'bag', 'skills', 'forge'); };
UI.fresh = function () {
  const S = G.S;
  A.on = S.opts.sound; A.setVol(S.opts.vol);
  UI.forgeId = null; UI.cubeLast = null; UI.lastGold = -1;
  SW.fx.clear(); SW.fx.setScene(D.ACTS[D.AREAS[S.world.area].act].bg);
  mark('top', 'hud', 'map', 'gear', 'bag', 'skills', 'forge');
  UI.setTab(UI.tab);
};
})();
