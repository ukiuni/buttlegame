// Battle simulation (pure logic, no DOM).
import { computeStats, cellToField, mulberry32, COLS, FIELD_ROWS } from './data.js';

export const ATTACK_ANIM = 0.45;   // attack motion length (s)
export const HIT_TIME = 0.22;      // when the hit lands within the attack motion
export const DYING_TIME = 0.9;     // falling-down motion length before removal
export const TIME_LIMIT = 90;

let uidSeq = 1;

export function makeUnit({ team, type, rank, equip, cell, mult = 1, charId = null }) {
  const st = computeStats(type, rank, equip, mult);
  const p = cellToField(team, cell);
  return {
    uid: uidSeq++, charId, team, type, rank,
    x: p.x, y: p.y,
    hp: st.maxHp, maxHp: st.maxHp, atk: st.atk, def: st.def,
    range: st.range, speed: st.speed, interval: st.interval, splash: st.splash, heal: st.heal,
    cd: 0.3 + (cell % COLS) * 0.05,
    state: 'idle', stateTime: 0, animTime: 0,
    facing: team === 'ally' ? 1 : -1,
    targetUid: null, action: null, hitDone: false,
  };
}

export class Battle {
  constructor({ allies, enemies, seed = 1 }) {
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
    const t = this.nearest(u, this.enemiesOf(u));
    return t ? { target: t, action: 'attack' } : null;
  }

  // Damage only applies between opposing teams. Returns damage dealt.
  applyDamage(attacker, target, power) {
    if (!attacker || !target || attacker.team === target.team) return 0;
    if (!this.alive(target)) return 0;
    const base = power != null ? power : attacker.atk;
    const dmg = Math.max(1, Math.round(base * (0.9 + this.rnd() * 0.2) - target.def * 0.5));
    target.hp = Math.max(0, target.hp - dmg);
    this.events.push({ type: 'damage', uid: target.uid, amount: dmg, from: attacker.uid });
    if (this.trace) this.trace.push({ t: this.time, kind: 'damage', from: attacker.uid, to: target.uid, amount: dmg, hp: target.hp });
    if (target.hp <= 0) this.kill(target);
    return dmg;
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
      u.cd -= dt;
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

  resolveHit(u, tgt) {
    if (u.action === 'heal') { this.applyHeal(u, tgt); return; }
    this.applyDamage(u, tgt);
    if (u.splash) {
      for (const o of this.enemiesOf(u)) {
        if (o !== tgt && this.dist(o, tgt) <= u.splash) this.applyDamage(u, o, u.atk * 0.5);
      }
    }
  }

  separate() {
    const list = this.units.filter((u) => this.alive(u));
    const minD = 0.62;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
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
      u.x = Math.min(COLS - 0.3, Math.max(0.3, u.x));
      u.y = Math.min(FIELD_ROWS - 0.3, Math.max(0.3, u.y));
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
