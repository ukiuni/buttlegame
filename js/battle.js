// Battle simulation (pure logic, no DOM).
import { computeStats, cellToField, mulberry32, SMALL_GRID } from './data.js';

export const ATTACK_ANIM = 0.45;   // attack motion length (s)
export const HIT_TIME = 0.22;      // when the hit lands within the attack motion
export const DYING_TIME = 0.9;     // falling-down motion length before removal
export const TIME_LIMIT = 90;

let uidSeq = 1;

export function makeUnit({ team, type, rank, equip, cell, mult = 1, charId = null, grid = SMALL_GRID }) {
  const st = computeStats(type, rank, equip, mult);
  const p = cellToField(team, cell, grid);
  return {
    uid: uidSeq++, charId, team, type, rank,
    x: p.x, y: p.y,
    hp: st.maxHp, maxHp: st.maxHp, atk: st.atk, def: st.def,
    range: st.range, speed: st.speed, interval: st.interval, magic: st.magic, heal: st.heal,
    atk0: computeStats(type, rank, {}, mult).atk,   // attack without equipment (weapons scale magic)
    prey: st.prey, charge: st.charge, chant: st.chant, buff: st.buff, ward: st.ward, guard: st.guard,
    buffUntil: 0, buffAmt: 0, chargeLeft: 0, chargeDx: 0, chargeDy: 0, chargeHit: null,
    assassin: st.assassin, fly: st.fly, poison: st.poison, slam: st.slam, stun: st.stun, pierce: st.pierce, summon: st.summon,
    mult, casts: 0, summoner: null,
    poisonDps: 0, poisonUntil: 0, poisonTick: 0, stunUntil: 0,
    cd: 0.3 + (cell % grid.cols) * 0.05,
    state: 'idle', stateTime: 0, animTime: 0,
    facing: team === 'ally' ? 1 : -1,
    targetUid: null, action: null, hitDone: false,
  };
}

export class Battle {
  constructor({ allies, enemies, seed = 1, grid = SMALL_GRID }) {
    this.grid = grid;
    this.units = [...allies, ...enemies];
    this.removed = [];
    this.events = [];      // consumed by renderer
    this.trace = null;     // optional array for tests
    this.time = 0;
    this.over = false;
    this.winner = null;
    this.rnd = mulberry32(seed);
  }

  get(uid) { return this.units.find((u) => u.uid === uid); }
  alive(u) { return u && u.state !== 'dying' && u.state !== 'dead'; }
  enemiesOf(u) { return this.units.filter((o) => o.team !== u.team && this.alive(o)); }
  alliesOf(u) { return this.units.filter((o) => o.team === u.team && o !== u && this.alive(o)); }
  dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  nearest(u, list) {
    let best = null, bd = Infinity;
    for (const o of list) { const d = this.dist(u, o); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  chooseTarget(u) {
    if (u.type === 'healer') {
      const hurt = this.alliesOf(u).filter((a) => a.hp < a.maxHp * 0.95)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (hurt) return { target: hurt, action: 'heal' };
    }
    if (u.buff) {
      // enchanter: go to the nearest ally whose attack buff is missing or about to expire
      const needy = this.alliesOf(u).filter((a) => a.buffUntil < this.time + 0.5);
      if (needy.length) return { target: this.nearest(u, needy), action: 'buff' };
    }
    const foes = this.enemiesOf(u);
    let t;
    if (u.assassin) {
      // bats skip the front line and go for the target with the lowest HP
      t = foes.sort((a, b) => a.hp - b.hp || this.dist(u, a) - this.dist(u, b))[0];
    } else if (u.prey) {
      // thieves prefer enemies with low HP and high attack (attack / HP is highest)
      t = foes.sort((a, b) => this.atkOf(b) / b.hp - this.atkOf(a) / a.hp || this.dist(u, a) - this.dist(u, b))[0];
    } else t = this.nearest(u, foes);
    if (!t) return null;
    if (u.summon && !u.chant && (u.casts + 1) % 3 === 0 && this.summonsOf(u).length < 2) return { target: t, action: 'summon' };
    return { target: t, action: 'attack' };
  }

  // Attack including an enchanter's buff.
  atkOf(u) { return u.buffUntil > this.time ? Math.round(u.atk * (1 + u.buffAmt)) : u.atk; }

  applyBuff(u) {
    const b = u.buff;
    for (const a of [u, ...this.alliesOf(u)]) {
      if (this.dist(u, a) > b.radius) continue;
      a.buffAmt = Math.max(a.buffUntil > this.time ? a.buffAmt : 0, b.amount);
      a.buffUntil = this.time + b.dur;
    }
    this.events.push({ type: 'buff', uid: u.uid });
  }

  // The strongest shielder guarding `u` (same team, alive, within its guard radius), or null.
  guardOf(u) {
    let best = null;
    for (const w of this.units) {
      if (!w.guard || w === u || w.team !== u.team || !this.alive(w) || this.dist(w, u) > w.guard.radius) continue;
      if (!best || w.def * w.guard.share > best.def * best.guard.share) best = w;
    }
    return best;
  }
  // Defence including a nearby shielder's guard (+share of the shielder's defence; does not stack).
  defOf(u) { const g = this.guardOf(u); return u.def + (g ? Math.round(g.def * g.guard.share) : 0); }

  // Damage only applies between opposing teams. Returns damage dealt.
  // Defence reduces damage proportionally: dmg = power * power / (power + def)
  // (def = power halves the damage), so it keeps working however big the numbers get.
  applyDamage(attacker, target, power) {
    if (!attacker || !target || attacker.team === target.team) return 0;
    if (!this.alive(target)) return 0;
    const base = power != null ? power : this.atkOf(attacker);
    const raw = base * (0.9 + this.rnd() * 0.2);
    const dmg = Math.max(1, Math.round((raw * raw) / (raw + this.defOf(target))));
    target.hp = Math.max(0, target.hp - dmg);
    this.events.push({ type: 'damage', uid: target.uid, amount: dmg, from: attacker.uid });
    if (this.trace) this.trace.push({ t: this.time, kind: 'damage', from: attacker.uid, to: target.uid, amount: dmg, hp: target.hp });
    if (target.hp <= 0) this.kill(target);
    return dmg;
  }

  // Magic: every enemy within the radius around `center` loses a share of its max HP (ignores defence).
  // Weapons and the enchanter's buff raise the share in proportion to the attack they add.
  // A living warder on the target's team whose barrier covers the target (null if unprotected).
  wardOf(target) {
    for (const w of this.units) {
      if (w.ward && w.team === target.team && this.alive(w) && this.dist(w, target) <= w.ward.radius) return w;
    }
    return null;
  }
  magicPct(u) { return u.magic.pct * (this.atkOf(u) / Math.max(1, u.atk0)); }
  applyMagic(u, center) {
    const pct = this.magicPct(u);
    this.events.push({ type: 'magic', uid: u.uid, x: center.x, y: center.y, r: u.magic.radius });
    for (const o of this.enemiesOf(u)) {
      if (o !== center && this.dist(o, center) > u.magic.radius) continue;
      if (!this.alive(o)) continue;
      const w = this.wardOf(o);
      if (w) {   // inside a warder's barrier: the spell is nullified
        this.events.push({ type: 'nullify', uid: o.uid, warder: w.uid, from: u.uid });
        if (this.trace) this.trace.push({ t: this.time, kind: 'nullify', from: u.uid, to: o.uid, warder: w.uid });
        continue;
      }
      const dmg = Math.max(1, Math.round(o.maxHp * pct * (0.95 + this.rnd() * 0.1)));
      o.hp = Math.max(0, o.hp - dmg);
      this.events.push({ type: 'damage', uid: o.uid, amount: dmg, from: u.uid, kind: 'magic' });
      if (this.trace) this.trace.push({ t: this.time, kind: 'damage', magic: true, from: u.uid, to: o.uid, amount: dmg, hp: o.hp });
      if (o.hp <= 0) this.kill(o);
    }
  }

  // Poison damage (ignores defence). `src` is the poisoner (must be on the other team).
  applyPoison(src, target, amount) {
    if (!target || src.team === target.team || !this.alive(target)) return 0;
    const dmg = Math.max(1, Math.round(amount));
    target.hp = Math.max(0, target.hp - dmg);
    this.events.push({ type: 'damage', uid: target.uid, amount: dmg, from: null, kind: 'poison' });
    if (target.hp <= 0) this.kill(target);
    return dmg;
  }

  summonsOf(u) { return this.units.filter((o) => o.summoner === u.uid && this.alive(o)); }

  doSummon(u, toward) {
    const m = makeUnit({ team: u.team, type: u.summon, rank: u.rank, cell: 0, mult: u.mult, grid: this.grid });
    const d = Math.max(0.01, this.dist(u, toward));
    m.x = u.x + ((toward.x - u.x) / d) * 0.7; m.y = u.y + ((toward.y - u.y) / d) * 0.7;
    m.summoner = u.uid; m.facing = u.facing;
    this.units.push(m);
    this.events.push({ type: 'summon', uid: m.uid, from: u.uid });
    return m;
  }

  applyHeal(healer, target) {
    if (!healer || !target || healer.team !== target.team || !this.alive(target)) return 0;
    const amt = Math.min(target.maxHp - target.hp, healer.heal);
    target.hp += amt;
    this.events.push({ type: 'heal', uid: target.uid, amount: amt });
    return amt;
  }

  kill(u) {
    u.state = 'dying'; u.stateTime = 0; u.hp = 0; u.diedAt = this.time;
    this.events.push({ type: 'dying', uid: u.uid });
    if (this.trace) this.trace.push({ t: this.time, kind: 'dying', uid: u.uid });
  }

  setState(u, s) { if (u.state !== s) { u.state = s; u.stateTime = 0; } }

  step(dt) {
    if (this.over) return;
    this.time += dt;
    for (const u of [...this.units]) {
      u.stateTime += dt; u.animTime += dt;
      if (u.state === 'dying') {
        if (this.time - u.diedAt >= DYING_TIME - 1e-9) {
          u.state = 'dead';
          this.units.splice(this.units.indexOf(u), 1);
          this.removed.push(u);
          this.events.push({ type: 'removed', uid: u.uid });
          if (this.trace) this.trace.push({ t: this.time, kind: 'removed', uid: u.uid });
        }
        continue;
      }
      // poison ticks every 0.5s
      if (u.poisonUntil > this.time) {
        u.poisonTick -= dt;
        if (u.poisonTick <= 0) {
          u.poisonTick += 0.5;
          this.applyPoison(u.poisonFrom, u, u.poisonDps * 0.5);
          if (!this.alive(u)) continue;
        }
      }
      // stunned units can't act
      if (u.stunUntil > this.time) { this.setState(u, 'idle'); continue; }
      u.cd -= dt;
      // summoner: chanting (interrupted by stuns), then the summon appears
      if (u.state === 'cast') {
        if (u.stateTime >= u.chant) {
          const foe = this.nearest(u, this.enemiesOf(u));
          this.doSummon(u, foe || { x: u.x, y: u.y + (u.team === 'ally' ? -1 : 1) });
          this.setState(u, 'idle'); u.cd = u.interval;
        }
        continue;
      }
      if (u.chant && u.state !== 'attack' && this.summonsOf(u).length === 0 && this.enemiesOf(u).length) {
        this.setState(u, 'cast');
        this.events.push({ type: 'chant', uid: u.uid });
        continue;
      }
      // lancer: wind-up, then a straight charge of fixed length (even if the target moved away)
      if (u.state === 'windup') {
        if (u.stateTime >= u.charge.windup) {
          u.state = 'charge'; u.stateTime = 0;
          this.events.push({ type: 'charge', uid: u.uid });
        }
        continue;
      }
      if (u.state === 'charge') {
        this.chargeStep(u, dt);
        continue;
      }
      if (u.state === 'attack') {
        const tgt = this.get(u.targetUid);
        if (!u.hitDone && u.stateTime >= HIT_TIME) {
          u.hitDone = true;
          if (tgt && this.alive(tgt)) this.resolveHit(u, tgt);
        }
        if (u.stateTime < ATTACK_ANIM) continue;
        this.setState(u, 'idle');
      }
      const choice = this.chooseTarget(u);
      if (!choice) { this.setState(u, 'idle'); continue; }
      const { target, action } = choice;
      u.targetUid = target.uid; u.action = action;
      const d = this.dist(u, target);
      if (Math.abs(target.x - u.x) > 0.05) u.facing = target.x > u.x ? 1 : -1;
      if (d > u.range) {
        if (this.trace) this.trace.push({ t: this.time, kind: 'walk', uid: u.uid, dist: d, range: u.range });
        this.setState(u, 'walk');
        const mv = Math.min(u.speed * dt, d - u.range + 0.01);
        u.x += ((target.x - u.x) / d) * mv;
        u.y += ((target.y - u.y) / d) * mv;
      } else if (u.cd <= 0 && u.charge && action === 'attack') {
        u.cd = u.interval;
        u.chargeDx = (target.x - u.x) / Math.max(d, 0.01); u.chargeDy = (target.y - u.y) / Math.max(d, 0.01);
        u.chargeLeft = u.charge.dist; u.chargeHit = new Set();
        u.state = 'windup'; u.stateTime = 0;
        if (this.trace) this.trace.push({ t: this.time, kind: 'attack', uid: u.uid, team: u.team, target: target.uid, targetTeam: target.team, action: 'charge', dist: d, range: u.range });
        this.events.push({ type: 'attack', uid: u.uid, target: target.uid, action: 'charge', unitType: u.type });
      } else if (u.cd <= 0) {
        u.cd = u.interval;
        u.hitDone = false;
        u.state = 'attack'; u.stateTime = 0;
        if (this.trace) this.trace.push({ t: this.time, kind: 'attack', uid: u.uid, team: u.team, target: target.uid, targetTeam: target.team, action, dist: d, range: u.range });
        this.events.push({ type: 'attack', uid: u.uid, target: target.uid, action, unitType: u.type });
      } else {
        this.setState(u, 'idle');
      }
    }
    this.separate();
    this.checkEnd();
  }

  chargeStep(u, dt) {
    const mv = Math.min(u.charge.speed * dt, u.chargeLeft);
    const nx = u.x + u.chargeDx * mv, ny = u.y + u.chargeDy * mv;
    u.x = Math.min(this.grid.cols - 0.3, Math.max(0.3, nx)); u.y = Math.min(this.grid.fieldRows - 0.3, Math.max(0.3, ny));
    u.chargeLeft -= mv;
    if (u.x !== nx || u.y !== ny) u.chargeLeft = 0; // hit the edge of the field
    for (const o of this.enemiesOf(u)) {
      if (u.chargeHit.has(o.uid) || this.dist(u, o) > 0.55) continue;
      u.chargeHit.add(o.uid);
      this.applyDamage(u, o, this.atkOf(u) * u.charge.power);
    }
    if (u.chargeLeft <= 1e-6) { this.setState(u, 'idle'); u.cd = Math.max(u.cd, 0.4); }
  }

  resolveHit(u, tgt) {
    if (u.action === 'heal') { this.applyHeal(u, tgt); return; }
    if (u.action === 'buff') { this.applyBuff(u); return; }
    if (u.action === 'summon') { u.casts++; this.doSummon(u, tgt); return; }
    u.casts++;
    if (u.magic) { this.applyMagic(u, tgt); return; }
    this.applyDamage(u, tgt);
    if (u.poison && this.alive(tgt)) {
      // (re)apply poison: deals atk * poison per second for 4s
      tgt.poisonDps = Math.max(tgt.poisonUntil > this.time ? tgt.poisonDps : 0, this.atkOf(u) * u.poison);
      tgt.poisonUntil = this.time + 4; tgt.poisonFrom = u;
      if (tgt.poisonTick <= 0) tgt.poisonTick = 0.5;
      this.events.push({ type: 'poisoned', uid: tgt.uid });
    }
    if (u.slam) {
      this.events.push({ type: 'slam', uid: u.uid, x: tgt.x, y: tgt.y });
      const hit = [tgt, ...this.enemiesOf(u).filter((o) => o !== tgt && this.dist(o, tgt) <= u.slam)];
      for (const o of hit) {
        if (o !== tgt) this.applyDamage(u, o, this.atkOf(u) * 0.6);
        if (this.alive(o)) { o.stunUntil = this.time + u.stun; this.events.push({ type: 'stun', uid: o.uid }); }
      }
    }
    if (u.pierce) {
      // breath travels along the line attacker -> target and continues `pierce` cells past it
      const d = Math.max(0.01, this.dist(u, tgt)), dx = (tgt.x - u.x) / d, dy = (tgt.y - u.y) / d;
      this.events.push({ type: 'breath', uid: u.uid, x2: u.x + dx * (d + u.pierce), y2: u.y + dy * (d + u.pierce) });
      for (const o of this.enemiesOf(u)) {
        if (o === tgt) continue;
        const px = o.x - u.x, py = o.y - u.y, along = px * dx + py * dy;
        if (along > 0 && along <= d + u.pierce && Math.abs(px * dy - py * dx) <= 0.5) this.applyDamage(u, o, this.atkOf(u) * 0.7);
      }
    }
  }

  separate() {
    const list = this.units.filter((u) => this.alive(u));
    const minD = 0.62;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        // flyers/thieves slip past ground units; charging lancers run straight through
        if (a.fly !== b.fly || a.state === 'charge' || b.state === 'charge') continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= minD) continue;
        if (d < 1e-4) { dx = (a.uid % 2 ? 1 : -1) * 0.01; dy = 0; d = 0.01; }
        const push = (minD - d) / 2;
        const ax = a.state === 'attack' ? 0.3 : 1, bx = b.state === 'attack' ? 0.3 : 1;
        a.x -= (dx / d) * push * ax; a.y -= (dy / d) * push * ax;
        b.x += (dx / d) * push * bx; b.y += (dy / d) * push * bx;
      }
    }
    for (const u of list) {
      u.x = Math.min(this.grid.cols - 0.3, Math.max(0.3, u.x));
      u.y = Math.min(this.grid.fieldRows - 0.3, Math.max(0.3, u.y));
    }
  }

  checkEnd() {
    const a = this.units.filter((u) => u.team === 'ally').length;
    const e = this.units.filter((u) => u.team === 'enemy').length;
    if (a === 0 || e === 0) {
      this.over = true;
      this.winner = a > 0 ? 'ally' : 'enemy';
    } else if (this.time >= TIME_LIMIT) {
      const ratio = (t) => {
        const us = this.units.filter((u) => u.team === t);
        return us.reduce((s, u) => s + u.hp / u.maxHp, 0);
      };
      this.over = true;
      this.winner = ratio('ally') > ratio('enemy') ? 'ally' : 'enemy';
    }
    if (this.over) this.events.push({ type: 'over', winner: this.winner });
  }
}
