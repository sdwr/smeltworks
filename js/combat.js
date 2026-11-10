/* Smeltworks — the battle engine. Pure logic: no DOM, no timers. Emits events for the renderer. */
(function () {
'use strict';
const SW = globalThis.SW, D = SW.data, U = SW.util, Hr = SW.hero;
const TICK = 0.5;            // burn / bleed tick length
const MAX_MOBS = 6;

class Battle {
  /* C: computed hero sheet. persist: {cds, heat, potCd} carried between battles.
     spec: {waves:[[{id,lvl,elite,boss,champ,name}]], shrine}. hooks: {onKill(mob)} */
  constructor(C, persist, spec, hooks, rec) {
    this.C = C; this.st = C.st; this.mods = C.mods; this.spec = spec; this.hooks = hooks || {};
    this.rec = rec !== false; this.ev = [];
    this.t = 0; this.over = null; this.nextId = 1;
    this.mobs = []; this.wave = -1; this.waveDelay = 0.45; this.pending = [];
    this.killed = 0; this.dmgDone = 0; this.dmgTaken = 0; this.minFrac = 1;
    const p = persist || {};
    this.h = { hp: C.st.maxLife, max: C.st.maxLife, barrier: 0, barrierT: 0, heat: p.heat == null ? 30 : p.heat, cds: Object.assign({}, p.cds || {}),
      act: 0.35, potCd: p.potCd || 0, buffs: {}, strikeN: 0, attackN: 0, charge: 0, hasteT: 0, hasteV: 0, killHasteT: 0, armorStacks: 0, armorT: 0,
      cheat: false, doomT: 8, doomReady: false, slowT: 0, poison: [], poisonAcc: 0, boltIcd: 0, protT: 0, ultAfterT: 0, regenAcc: 0 };
    this.shrine = spec.shrine || null;
    this.basic = C.bar.find(id => D.SKILL[id].type === 'basic') || null;
  }
  emit(o) { if (this.rec) this.ev.push(o); }
  alive() { return this.mobs.filter(m => !m.dead); }
  persist() { return { cds: this.h.cds, heat: this.h.heat, potCd: this.h.potCd }; }
  summary() { return { min: this.minFrac, t: this.t, type: this.spec.type, dmg: this.dmgDone, taken: this.dmgTaken, kills: this.killed }; }
  setHero(C) {
    const r = this.h.hp / this.h.max;
    this.C = C; this.st = C.st; this.mods = C.mods; this.h.max = C.st.maxLife; this.h.hp = Math.min(this.h.max, Math.max(1, r * this.h.max));
    this.basic = C.bar.find(id => D.SKILL[id].type === 'basic') || null;
  }

  /* ----------------------------------------------------------- spawning */
  mkMob(s) {
    const boss = s.boss ? D.BOSSES[s.id] : null, def = boss || D.MOB[s.id], lvl = s.lvl;
    const el = s.elite || null, has = k => el && el.includes(k);
    let hp = D.mobHp(lvl) * def.hp, dmg = D.mobDmg(lvl) * def.dmg, int = def.int;
    if (el) { hp *= 4.2; dmg *= 1.3; }
    if (s.champ) { hp *= 2.3; dmg *= 1.15; }
    if (has('hulking')) { hp *= 1.6; dmg *= 1.25; }
    if (has('frenzied')) int *= 0.62;
    let dr = (def.armor || 0) / 100;
    if (has('stoneskin')) dr = 1 - (1 - dr) * 0.7;
    const m = { uid: this.nextId++, def, id: def.id, name: s.name || def.name, lvl, boss: !!boss, elite: el, champ: !!s.champ, minion: !!s.minion,
      max: Math.round(hp), hp: Math.round(hp), dmg, int, atkT: int * U.rand(0.55, 1), dr, dodge: def.dodge || 0,
      burns: [], bleeds: [], dotAcc: 0, stunT: 0, vulnT: 0, barrier: 0, barrierT: 0, dead: false, age: 0, wound: false, tm: {}, enraged: 0,
      el: def.el || 'phys', ranged: !!def.ranged, big: !!(boss || s.champ) };
    m.xp = D.mobXp(lvl) * (boss ? 32 : s.champ ? 14 : el ? 6 : s.minion ? 0.3 : def.hp) * (def.flee ? 2 : 1);
    if (def.barrier) { m.barrier = m.max * def.barrier; m.barrierT = 999; }
    if (boss) for (const a of boss.abil) { if (a.cd) m.tm[a.t] = a.cd * 0.6; if (a.at) m.tm['sum' + boss.abil.indexOf(a)] = 0; }
    return m;
  }
  spawn(s) {
    const live = this.alive();
    if (live.length >= MAX_MOBS) return null;
    const m = this.mkMob(s), used = live.map(x => x.slot);
    const order = m.boss ? [1] : m.ranged ? [4, 3, 5, 1, 0, 2] : [1, 0, 2, 4, 3, 5];
    m.slot = order.find(i => !used.includes(i)); if (m.slot == null) m.slot = [0, 1, 2, 3, 4, 5].find(i => !used.includes(i));
    this.mobs.push(m);
    this.emit({ e: 'spawn', m });
    return m;
  }
  nextWave() {
    this.wave++;
    this.mobs = this.mobs.filter(m => !m.dead);
    for (const s of this.spec.waves[this.wave]) this.spawn(s);
    this.emit({ e: 'wave', n: this.wave, of: this.spec.waves.length });
    const h = this.h;
    if (this.mods.eliteBarrier && this.alive().some(m => m.elite || m.boss)) { this.addBarrier(this.mods.eliteBarrier, 8); h.protT = 12; }
  }

  /* --------------------------------------------------------------- loop */
  step(dt) {
    if (this.over) return;
    this.t += dt;
    const h = this.h;
    if (this.wave < 0 || (!this.alive().length && this.wave < this.spec.waves.length - 1)) {
      this.waveDelay -= dt;
      this.tickCds(dt);
      if (this.waveDelay <= 0) { this.nextWave(); this.waveDelay = 0.7; }
      return;
    }
    // delayed effects (multi-hit skills)
    if (this.pending.length) {
      for (const p of this.pending) p.t -= dt;
      const due = this.pending.filter(p => p.t <= 0); this.pending = this.pending.filter(p => p.t > 0);
      for (const p of due) { p.fn(); if (this.over) return; }
    }
    this.tickCds(dt);
    this.tickHero(dt);
    if (this.over) return;
    // hero acts
    this.autoCasts();
    h.act -= dt;
    let guard = 0;
    while (h.act <= 0 && !this.over && guard++ < 6) {
      if (!this.alive().length) { h.act = 0.1; break; }
      h.act += this.heroAct();
    }
    // no battle lasts forever: after a while the enemy goes berserk
    if (!this.spec.boss && this.t > 45) { if (!this.frenzy) this.emit({ e: 'frenzy' }); this.frenzy = (this.frenzy || 0) + dt * 0.12; }
    // monsters
    for (const m of this.mobs.slice()) { if (!m.dead) this.tickMob(m, dt); if (this.over) return; }
    this.checkEnd();
  }
  checkEnd() {
    if (this.over) return;
    if (this.h.hp <= 0) { this.over = 'lose'; this.emit({ e: 'end', win: false }); return; }
    if (!this.alive().length && this.wave >= this.spec.waves.length - 1 && !this.pendingSpawns) { this.over = 'win'; this.emit({ e: 'end', win: true }); }
  }
  tickCds(dt) {
    const h = this.h;
    for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] = Math.max(0, h.cds[k] - dt);
    if (h.potCd > 0) h.potCd = Math.max(0, h.potCd - dt);
  }
  tickHero(dt) {
    const h = this.h, st = this.st, mods = this.mods;
    for (const k in h.buffs) { h.buffs[k].t -= dt; if (h.buffs[k].t <= 0) delete h.buffs[k]; }
    if (h.barrier > 0) { h.barrierT -= dt; if (h.barrierT <= 0) h.barrier = 0; }
    if (h.hasteT > 0) h.hasteT -= dt;
    if (h.killHasteT > 0) h.killHasteT -= dt;
    if (h.armorT > 0) { h.armorT -= dt; if (h.armorT <= 0) h.armorStacks = 0; }
    if (h.slowT > 0) h.slowT -= dt;
    if (h.boltIcd > 0) h.boltIcd -= dt;
    if (h.ultAfterT > 0) h.ultAfterT -= dt;
    if (mods.doom && !h.doomReady) { h.doomT -= dt; if (h.doomT <= 0) { h.doomReady = true; this.emit({ e: 'buff', id: 'doom' }); } }
    if (mods.eliteBarrier && h.protT > 0) { h.protT -= dt; if (h.protT <= 0 && this.alive().some(m => m.elite || m.boss)) { this.addBarrier(mods.eliteBarrier, 8); h.protT = 12; } }
    if (st.regen > 0 && h.hp < h.max) { h.regenAcc += st.regen * dt; if (h.regenAcc >= 1) { const a = Math.floor(h.regenAcc); h.regenAcc -= a; h.hp = Math.min(h.max, h.hp + a); } }
    if (h.poison.length) {
      h.poisonAcc += dt;
      if (h.poisonAcc >= TICK) {
        h.poisonAcc -= TICK;
        let tot = 0; for (const p of h.poison) { tot += p.dps * TICK; p.t -= TICK; }
        h.poison = h.poison.filter(p => p.t > 0);
        if (tot > 0) this.hurtHero(tot, 'poison', null, { dot: 1 });
      }
    }
  }

  /* ---------------------------------------------------------- hero side */
  rank(id) { return this.C.ranks[id] || 0; }
  nums(id) { return Hr.skillNums(D.SKILL[id], this.rank(id)); }
  cdOf(sk) {
    let cd = sk.cd * (1 - this.st.cdr / 100);
    if (sk.type === 'ult' && this.mods.ultCdr) cd *= 1 - this.mods.ultCdr / 100;
    return cd;
  }
  estDps() {
    const st = this.st;
    return st.dmg * st.aps * (1 + st.aspd / 100) * 1.5 * (1 + st.dmgPct / 100) * (1 + st.crit / 100 * st.critDmg / 100);
  }
  worth() {
    const live = this.alive();
    if (live.some(m => m.elite || m.boss)) return true;
    let hp = 0; for (const m of live) hp += m.hp;
    return hp > this.estDps() * 3.5 || this.h.hp < this.h.max * 0.5;
  }
  autoCasts() {
    const h = this.h;
    if (!this.alive().length) return;
    for (const id of this.C.bar) {
      const sk = D.SKILL[id];
      if (h.cds[id] > 0) continue;
      if (sk.type === 'def' && h.hp < h.max * 0.6) {
        const n = this.nums(id);
        this.addBarrier(n.val, 6); h.cds[id] = this.cdOf(sk);
        this.emit({ e: 'cast', id, instant: 1 });
      } else if (sk.type === 'buff' && this.worth()) {
        const n = this.nums(id), dur = sk.dur * (1 + (this.mods.buffDur || 0) / 100);
        h.buffs[id] = { t: dur, v: n.val };
        if (this.mods.buffHeat) this.gainHeat(this.mods.buffHeat, true);
        h.cds[id] = this.cdOf(sk);
        this.emit({ e: 'cast', id, instant: 1 });
      }
    }
  }
  expect(sk, n, live) {
    const k = live.length;
    if (sk.tgt === 'all') return n.mult * k + (n.burn || 0) * k;
    if (sk.tgt === 'cleave') return n.mult * (1 + 0.5 * (k - 1)) + 30 * (k - 1);
    if (sk.tgt === 'chain') { const arcs = Math.min(k === 1 ? 3 : 5 + (this.mods.chainGrow ? 3 : 0), 8); let s = 0, f = 1; for (let i = 0; i < arcs; i++) { s += f; f *= this.mods.chainGrow ? 1 + this.mods.chainGrow / 100 : 0.85; } return n.mult * s; }
    let v = n.mult + (n.burn || 0);
    if (sk.id === 'lance' && live[0] && (live[0].vulnT > 0 || live[0].stunT > 0)) v *= 1 + this.st.critDmg / 100 * (1 - this.st.crit / 100);
    return v;
  }
  /* choose and perform one action; returns the time it takes */
  heroAct() {
    const h = this.h, st = this.st, mods = this.mods, live = this.alive();
    let pick = null, best = 0;
    for (const id of this.C.bar) {
      const sk = D.SKILL[id];
      if (sk.type === 'ult') { if (!(h.cds[id] > 0) && this.worth()) { pick = id; break; } }
      else if (sk.type === 'core' && h.heat >= sk.cost) { const v = this.expect(sk, this.nums(id), live); if (v > best) { best = v; pick = id; } }
    }
    if (!pick) pick = this.basic;
    let speed = st.aps * (1 + (st.aspd + (h.buffs.overcharge ? h.buffs.overcharge.v : 0) + (h.hasteT > 0 ? h.hasteV : 0) + (h.killHasteT > 0 ? mods.killHaste || 0 : 0)
      + (this.shrine === 'storm' ? 35 : 0) + (mods.burnHaste ? mods.burnHaste * live.filter(m => m.burns.length).length : 0)) / 100);
    if (h.slowT > 0) speed *= 0.72;
    const sk = pick ? D.SKILL[pick] : null;
    if (sk && sk.type === 'basic' && mods.basicAspd) speed *= 1 + mods.basicAspd / 100;
    this.cast(pick, false);
    h.attackN++;
    if (mods.nthHammer && h.attackN % 6 === 0) {
      this.emit({ e: 'proc', id: 'hammerfall' });
      for (const m of this.alive()) this.hit(m, mods.nthHammer, 'phys', { proc: 1 });
    }
    return 1 / speed;
  }
  gainHeat(n, raw) {
    const h = this.h;
    if (!raw) n *= (1 + this.st.heat / 100) * (h.buffs.forgeheart ? 2 : 1);
    h.heat = Math.min(D.HEAT_MAX, h.heat + n);
  }
  cast(id, free) {
    const h = this.h, mods = this.mods;
    let live = this.alive(); if (!live.length) return;
    const tgt = live.reduce((a, b) => (b.slot < a.slot ? b : a));
    if (!id) { this.emit({ e: 'cast', id: 'punch', tgt: tgt.uid }); this.hit(tgt, 70, 'phys', { basic: 1 }); this.gainHeat(8); return; }
    const sk = D.SKILL[id], n = this.nums(id), el = sk.el;
    const o = { skill: id, [sk.type]: 1 };
    // per-cast bonuses
    o.bonus = 0;
    if (h.doomReady) { o.bonus += mods.doom; h.doomReady = false; h.doomT = 8; this.emit({ e: 'proc', id: 'doom' }); }
    if (sk.type === 'core' && h.charge && mods.basicCharge) { o.bonus += h.charge * mods.basicCharge; h.charge = 0; }
    if (mods.heatDmg) o.bonus += mods.heatDmg * h.heat / D.HEAT_MAX;
    if (sk.cost && !free) { if (!(mods.heatRefund && U.chance(mods.heatRefund / 100))) h.heat -= sk.cost; }
    if (sk.cd && !free) h.cds[id] = this.cdOf(sk);
    this.emit({ e: 'cast', id, tgt: tgt.uid });
    const others = live.filter(m => m !== tgt);
    switch (id) {
      case 'strike':
        this.hit(tgt, n.mult, el, o); h.strikeN++;
        if (h.strikeN % 3 === 0 && !tgt.dead) this.vuln(tgt, 3);
        break;
      case 'sunder':
        this.hit(tgt, n.mult, el, o);
        for (const m of others) { this.hit(m, n.mult * 0.5, el, o); if (!m.dead) this.dotAdd(m, 'bleeds', 60 * (1 + D.SKILL_RANK * (n.rank - 1)), 4, 'phys'); }
        if (mods.coreStun) for (const m of live) this.stun(m, 1);
        break;
      case 'quake':
        for (const m of live) { this.hit(m, n.mult, el, o); this.stun(m, 1); }
        break;
      case 'meteor':
        this.hit(tgt, n.mult, el, o);
        for (const m of others) this.hit(m, n.mult * 0.4, el, o);
        for (const m of live) this.stun(m, 2);
        break;
      case 'cinder':
        this.hit(tgt, n.mult, el, o); if (!tgt.dead) this.dotAdd(tgt, 'burns', n.burn, 3, 'fire');
        break;
      case 'wave':
        for (const m of live) { this.hit(m, n.mult, el, o); if (!m.dead) this.dotAdd(m, 'burns', n.burn, 3, 'fire'); }
        break;
      case 'brand':
        this.hit(tgt, n.mult, el, o); if (!tgt.dead) this.dotAdd(tgt, 'burns', n.burn, 4, 'fire');
        break;
      case 'eruption':
        for (let i = 0; i < 5; i++) this.pending.push({ t: i * 0.4, fn: () => { this.emit({ e: 'pulse', id }); for (const m of this.alive()) { this.hit(m, n.mult, el, o); if (!m.dead) this.dotAdd(m, 'burns', n.burn, 3, 'fire'); } } });
        break;
      case 'jab':
        this.hit(tgt, n.mult, el, o);
        this.pending.push({ t: 0.14, fn: () => { const l = this.alive(); if (l.length) { this.hit(tgt.dead ? l[0] : tgt, n.mult, el, o); this.gainHeat(n.gen); } } });
        break;
      case 'chain': {
        const grow = mods.chainGrow;
        let arcs = (live.length === 1 ? 3 : 5) + (grow ? 3 : 0), f = 1, i = live.indexOf(tgt);
        const path = [];
        for (let a = 0; a < arcs; a++) {
          const l = this.alive(); if (!l.length) break;
          const m = l[i % l.length]; path.push(m.uid);
          this.hit(m, n.mult * f, el, o);
          f *= grow ? 1 + grow / 100 : 0.85; i++;
        }
        this.emit({ e: 'chain', path });
        break;
      }
      case 'lance':
        this.hit(tgt, n.mult, el, Object.assign({ forceCrit: tgt.vulnT > 0 || tgt.stunT > 0 }, o));
        break;
      case 'tempest':
        for (let i = 0; i < 12; i++) this.pending.push({ t: i * 0.13, fn: () => { const l = this.alive(); if (l.length) { const m = U.pick(l); this.emit({ e: 'bolt', m: m.uid }); this.hit(m, n.mult, el, o); } } });
        break;
    }
    if (sk.gen) this.gainHeat(sk.gen + (mods.basicHeat || 0));
    if (sk.type === 'basic') {
      if (mods.basicCharge) h.charge = Math.min(3, h.charge + 1);
      if (!free && mods.basicTwice && U.chance(mods.basicTwice / 100)) { this.emit({ e: 'proc', id: 'twin' }); this.cast(id, true); }
    }
    if (sk.type === 'core' && !free && mods.coreEcho && U.chance(mods.coreEcho / 100)) { this.emit({ e: 'proc', id: 'echo' }); this.pending.push({ t: 0.22, fn: () => this.cast(id, true) }); }
    if (sk.type === 'ult' && mods.ultAfter) h.ultAfterT = 8;
  }
  vuln(m, t) { if (m.dead) return; if (m.vulnT <= 0) this.emit({ e: 'status', m: m.uid, s: 'vuln' }); m.vulnT = Math.max(m.vulnT, t); }
  stun(m, t) {
    if (m.dead || (m.elite && m.elite.includes('stoneskin'))) return;
    if (m.boss) t *= 0.3; else if (m.elite) t *= 0.6;
    if (m.stunT <= 0) this.emit({ e: 'status', m: m.uid, s: 'stun' });
    m.stunT = Math.max(m.stunT, t);
  }
  dotAdd(m, list, pct, dur, el, rawDps) {
    const st = this.st, mods = this.mods;
    let dps = rawDps != null ? rawDps
      : st.dmg * pct / 100 * (1 + (st.dmgPct + st[el + 'Pct'] + st.dot + (m.elite || m.boss ? st.elite : 0) + this.buffDmg()) / 100) / dur;
    if (rawDps == null && list === 'burns' && mods.burnMult) dps *= 1 + mods.burnMult / 100;
    const arr = m[list];
    if (arr.length >= 6) { let w = 0; for (let i = 1; i < arr.length; i++) if (arr[i].dps * arr[i].t < arr[w].dps * arr[w].t) w = i; arr.splice(w, 1); }
    arr.push({ dps, t: dur });
  }
  buffDmg() {
    const h = this.h, mods = this.mods;
    let b = 0;
    if (h.buffs.forgeheart) b += h.buffs.forgeheart.v;
    if (this.shrine === 'fury') b += 40;
    if (h.ultAfterT > 0) b += mods.ultAfter || 0;
    if (h.barrier > 0 && mods.barrierDmg) b += mods.barrierDmg;
    if (mods.perEnemyDmg) b += mods.perEnemyDmg * Math.min(5, this.alive().length);
    return b;
  }
  /* direct hit on a monster. mult is % weapon damage. */
  hit(m, mult, el, o) {
    if (m.dead) return 0;
    o = o || {};
    const h = this.h, st = this.st, mods = this.mods;
    if (m.dodge && !o.proc && U.chance(m.dodge / 100)) { this.emit({ e: 'miss', m: m.uid }); return 0; }
    let add = st.dmgPct + (st[el + 'Pct'] || 0) + this.buffDmg() + (o.bonus || 0);
    if (m.elite || m.boss) add += st.elite;
    const frac = m.hp / m.max;
    if (mods.execute && frac < 0.35) add += mods.execute;
    if (mods.opener && frac > 0.8) add += mods.opener;
    if (mods.stunDmg && m.stunT > 0) add += mods.stunDmg;
    if (mods.crush && (m.vulnT > 0 || m.stunT > 0)) add += mods.crush;
    let dmg = st.dmg * U.rand(0.9, 1.1) * mult / 100 * (1 + add / 100);
    let cc = st.crit + (o.skill === 'jab' ? 10 : 0);
    if (mods.hotCrit && h.heat >= 70) cc += mods.hotCrit;
    if (mods.burnCritCh && m.burns.length) cc += mods.burnCritCh;
    const crit = !o.noCrit && (o.forceCrit || U.chance(cc / 100));
    if (crit) dmg *= 1 + st.critDmg / 100;
    if (m.vulnT > 0) dmg *= 1 + (20 + st.vuln) / 100;
    this.apply(m, dmg, el, crit, o);
    if (!o.proc) {
      if (st.loh) this.heal(st.loh, true);
      if (mods.hitArmor) { h.armorStacks = Math.min(10, h.armorStacks + 1); h.armorT = 4; }
      if (crit) {
        if (mods.critHaste) { h.hasteT = 3; h.hasteV = mods.critHaste; }
        if (mods.critCdr) for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] = Math.max(0, h.cds[k] - mods.critCdr);
        if (mods.critUlt) for (const k in h.cds) if (h.cds[k] > 0 && D.SKILL[k].type === 'ult') h.cds[k] = Math.max(0, h.cds[k] - mods.critUlt);
        if (mods.critBleed && el === 'phys' && !m.dead) this.dotAdd(m, 'bleeds', mods.critBleed, 4, 'phys');
        if (mods.aftershock) { const l = this.alive().filter(x => x !== m); if (l.length) this.apply(U.pick(l), dmg * mods.aftershock / 100, 'light', false, { proc: 1 }); }
        if (mods.critBolt && h.boltIcd <= 0) { h.boltIcd = 0.5; const l = this.alive(); if (l.length) { const x = U.pick(l); this.emit({ e: 'bolt', m: x.uid }); this.hit(x, mods.critBolt, 'light', { proc: 1 }); } }
      }
    }
    return dmg;
  }
  /* final damage application after hero-side multipliers */
  apply(m, dmg, el, crit, o) {
    if (m.dead) return;
    dmg *= 1 - m.dr;
    if (m.barrier > 0) { const a = Math.min(m.barrier, dmg); m.barrier -= a; dmg -= a; if (m.barrier <= 0) { m.barrier = 0; this.emit({ e: 'shieldBreak', m: m.uid }); } if (dmg <= 0) { this.emit({ e: 'hit', m: m.uid, amt: a, crit, el, absorbed: 1, dot: o && o.dot }); return; } }
    dmg = Math.max(1, Math.round(dmg));
    m.hp -= dmg; this.dmgDone += dmg;
    this.emit({ e: 'hit', m: m.uid, amt: dmg, crit, el, dot: o && o.dot ? 1 : 0, proc: o && o.proc ? 1 : 0, big: o && (o.ult || o.core) ? 1 : 0 });
    if (m.hp <= 0) this.kill(m);
  }
  kill(m) {
    if (m.dead) return;
    m.dead = true; m.hp = 0; this.killed++;
    const h = this.h, mods = this.mods;
    const drops = this.hooks.onKill ? this.hooks.onKill(m, this) : null;
    this.emit({ e: 'die', m: m.uid, drops });
    if (mods.killHeal) this.heal(h.max * mods.killHeal / 100);
    if (mods.killHaste) h.killHasteT = 3;
    if (mods.killCdr) for (const k in h.cds) if (h.cds[k] > 0) h.cds[k] = Math.max(0, h.cds[k] - mods.killCdr);
    const others = this.alive();
    if (m.burns.length) {
      if (mods.burnBoom) { this.emit({ e: 'boom', m: m.uid, el: 'fire' }); for (const x of others) this.hit(x, mods.burnBoom, 'fire', { proc: 1 }); }
      if (mods.burnSpread) { let dps = 0, t = 0; for (const b of m.burns) { dps += b.dps; t = Math.max(t, b.t); } for (const x of this.alive()) this.dotAdd(x, 'burns', 0, Math.max(2, t), 'fire', dps * mods.burnSpread / 100); }
    }
    if (m.def.split) for (let i = 0; i < 2; i++) this.spawn({ id: m.def.split, lvl: m.lvl, minion: 1 });
    const molten = m.elite && m.elite.includes('molten');
    if (m.def.explode || molten) {
      this.emit({ e: 'boom', m: m.uid, el: m.el, onHero: 1 });
      this.hurtHero(m.dmg * (m.def.explode || 1.6), molten ? 'fire' : m.el, null, { nododge: 1 });
    }
  }
  heal(a, quiet) {
    const h = this.h; if (h.hp <= 0) return;
    const before = h.hp; h.hp = Math.min(h.max, h.hp + a);
    if (!quiet && h.hp - before >= 1) this.emit({ e: 'heal', amt: h.hp - before });
  }
  addBarrier(pct, dur) {
    const h = this.h;
    const v = h.max * pct / 100 * (1 + (this.mods.barrierPower || 0) / 100);
    h.barrier = Math.max(h.barrier, v); h.barrierT = dur;
    this.emit({ e: 'barrier', amt: v });
  }
  /* damage to the hero before mitigation */
  hurtHero(dmg, el, m, o) {
    const h = this.h, st = this.st, mods = this.mods; o = o || {};
    if (h.hp <= 0) return;
    if (!o.dot && !o.nododge && st.dodge && U.chance(st.dodge / 100)) { this.emit({ e: 'dodge' }); return; }
    const lvl = m ? m.lvl : this.spec.lvl || this.C.lvl;
    if (!o.dot) {
      const armor = st.armor * (1 + (mods.hitArmor ? mods.hitArmor * h.armorStacks : 0) / 100);
      dmg *= 1 - Hr.armorDR(armor, lvl);
    }
    dmg *= 1 - st.dr / 100;
    if (this.shrine === 'stone') dmg *= 0.65;
    if (m) {
      if (mods.burnWeak && m.burns.length) dmg *= 1 - mods.burnWeak / 100;
      if (mods.ccDR && (m.burns.length || m.bleeds.length || m.stunT > 0 || m.vulnT > 0)) dmg *= 1 - mods.ccDR / 100;
    }
    if (mods.barrierDR && h.barrier > 0) dmg *= 1 - mods.barrierDR / 100;
    if (mods.lowLifeDR && h.hp < h.max * 0.5) dmg *= 1 - mods.lowLifeDR / 100;
    let shown = dmg;
    if (h.barrier > 0) { const a = Math.min(h.barrier, dmg); h.barrier -= a; dmg -= a; }
    dmg = Math.round(dmg);
    h.hp -= dmg; this.dmgTaken += dmg;
    if (h.hp / h.max < this.minFrac) this.minFrac = Math.max(0, h.hp / h.max);
    this.emit({ e: 'hurt', amt: Math.round(shown), el, dot: o.dot ? 1 : 0, big: o.big ? 1 : 0, absorbed: dmg <= 0 ? 1 : 0 });
    if (h.hp <= 0) {
      if (mods.cheatDeath && !h.cheat) { h.cheat = true; h.hp = h.max * mods.cheatDeath / 100; this.emit({ e: 'phoenix' }); }
      else { h.hp = 0; this.over = 'lose'; this.emit({ e: 'end', win: false }); return; }
    }
    if (h.hp < h.max * 0.35 && h.potCd <= 0) {
      const plus = mods.potionPlus || 0;
      this.heal(h.max * 0.35 * (1 + plus / 100), true); h.potCd = 22 * (plus ? 0.8 : 1);
      this.emit({ e: 'potion' });
    }
  }

  /* ------------------------------------------------------- monster side */
  mobHits(m, mult, kind, o) {
    const h = this.h, st = this.st, mods = this.mods;
    this.emit({ e: 'mobAtk', m: m.uid, kind });
    const before = h.hp + h.barrier;
    this.hurtHero(m.dmg * mult * U.rand(0.9, 1.1) * (1 + m.enraged * 0.08 + (this.frenzy || 0)), m.el, m, o);
    if (this.over) return;
    const landed = h.hp + h.barrier < before;
    if (!landed) return;
    const el = m.elite || [];
    if (m.def.leech) this.mobHeal(m, m.max * (m.elite ? 0.015 : 0.04));
    if (el.includes('vampiric')) this.mobHeal(m, m.max * 0.025);
    if (m.def.poison || el.includes('venomous')) { if (h.poison.length < 5) h.poison.push({ dps: m.dmg * (m.def.poison || 0.5) / 4, t: 4 }); else h.poison[0].t = 4; }
    if (m.def.slow || el.includes('chilling') || (o && o.slow)) { h.slowT = (o && o.slow) || 2.5; this.emit({ e: 'slowed' }); }
    if (st.thorns > 0 && !m.dead) {
      const td = st.thorns * (1 + (st.dmgPct + st.physPct) / 100);
      this.apply(m, td, 'phys', false, { proc: 1, thorns: 1 });
      if (mods.thornsAll) for (const x of this.alive()) if (x !== m) this.apply(x, td * mods.thornsAll / 100, 'phys', false, { proc: 1 });
    }
  }
  mobHeal(m, a) { if (m.dead || this.frenzy) return; const b = m.hp; m.hp = Math.min(m.max, m.hp + a); if (m.hp - b >= 1) this.emit({ e: 'mobHeal', m: m.uid, amt: Math.round(m.hp - b) }); }
  tickMob(m, dt) {
    const def = m.def;
    m.age += dt;
    if (m.vulnT > 0) m.vulnT -= dt;
    if (m.barrier > 0 && m.barrierT < 900) { m.barrierT -= dt; if (m.barrierT <= 0) m.barrier = 0; }
    // damage over time
    if (m.burns.length || m.bleeds.length) {
      m.dotAcc += dt;
      if (m.dotAcc >= TICK) {
        m.dotAcc -= TICK;
        for (const [list, el] of [['burns', 'fire'], ['bleeds', 'phys']]) {
          const arr = m[list]; if (!arr.length) continue;
          let tot = 0; for (const b of arr) { tot += b.dps * TICK; b.t -= TICK; }
          m[list] = arr.filter(b => b.t > 0);
          let crit = false;
          if (list === 'burns' && this.mods.burnCrit && U.chance(this.st.crit / 100)) { crit = true; tot *= 1 + this.st.critDmg / 100; }
          if (m.vulnT > 0) tot *= 1 + (20 + this.st.vuln) / 100;
          this.apply(m, tot, el, crit, { dot: 1, proc: 1 });
          if (m.dead) return;
        }
      }
    }
    if (def.flee) { if (m.age >= def.flee) { m.dead = true; m.fled = true; this.emit({ e: 'flee', m: m.uid }); } return; }
    if (m.stunT > 0) { m.stunT -= dt; return; }
    const el = m.elite || [];
    // periodic abilities
    const every = (key, cd, fn) => { m.tm[key] = (m.tm[key] == null ? cd : m.tm[key]) - dt; if (m.tm[key] <= 0) { m.tm[key] = cd; fn(); } };
    if (def.heal) every('heal', 5, () => { const l = this.alive().filter(x => x.hp < x.max); if (l.length) { const t = l.reduce((a, b) => (b.hp / b.max < a.hp / a.max ? b : a)); this.emit({ e: 'mobCast', m: m.uid }); this.mobHeal(t, t.max * def.heal * (t.elite || t.boss ? 0.4 : 1)); } });
    if (def.summon) every('summon', 7, () => { if (this.alive().length < 5) { this.emit({ e: 'mobCast', m: m.uid }); this.spawn({ id: def.summon, lvl: m.lvl, minion: 1 }); } });
    if (el.includes('molten')) every('molten', 4.5, () => this.mobHits(m, 0.7, 'pulse', { nododge: 1 }));
    if (el.includes('shielded')) every('shield', 9, () => { m.barrier = m.max * 0.1; m.barrierT = 4; this.emit({ e: 'mobShield', m: m.uid }); });
    if (this.over) return;
    if (m.boss) { this.tickBoss(m, dt); if (this.over || m.dead) return; if (m.casting) return; }
    // basic attack
    m.atkT -= dt;
    if (def.windup && !m.wound && m.atkT <= def.windup) { m.wound = true; this.emit({ e: 'windup', m: m.uid, dur: Math.max(0.1, m.atkT) }); }
    if (m.atkT <= 0) {
      m.atkT += m.int; m.wound = false;
      this.mobHits(m, 1, m.ranged ? 'ranged' : def.windup ? 'heavy' : 'melee', def.windup ? { big: 1 } : null);
    }
  }
  tickBoss(m, dt) {
    const B = D.BOSSES[m.id];
    if (m.casting) {
      m.casting.t -= dt;
      if (m.casting.t <= 0) { const a = m.casting.a; m.casting = null; this.mobHits(m, a.mult, a.t, { big: 1, slow: a.slow }); }
      return;
    }
    B.abil.forEach((a, i) => {
      if (this.over || m.casting) return;
      if (a.t === 'slam' || a.t === 'nova') {
        m.tm[a.t] -= dt;
        if (m.tm[a.t] <= 0) { m.tm[a.t] = a.cd; m.casting = { a, t: a.wind }; this.emit({ e: 'windup', m: m.uid, dur: a.wind, name: a.name, boss: 1 }); }
      } else if (a.t === 'summon') {
        const k = 'sum' + i;
        if (m.tm[k] < a.at.length && m.hp / m.max <= a.at[m.tm[k]]) {
          m.tm[k]++; this.emit({ e: 'mobCast', m: m.uid, name: 'Reinforcements' });
          for (let j = 0; j < a.n; j++) this.spawn({ id: a.mob, lvl: m.lvl, minion: 1 });
        }
      } else if (a.t === 'enrage') {
        if (m.age >= a.after) { if (!m.enraged) this.emit({ e: 'enrage', m: m.uid }); m.tm.enr = (m.tm.enr || 0) + dt; if (m.tm.enr >= 1) { m.tm.enr -= 1; m.enraged++; } }
      } else if (a.t === 'aura') {
        m.tm.aura = (m.tm.aura || 0) + dt;
        if (m.tm.aura >= 1) { m.tm.aura -= 1; this.hurtHero(m.dmg * a.dps, m.el, m, { dot: 1 }); }
      }
    });
  }
}
SW.Battle = Battle;
})();
