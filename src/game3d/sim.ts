// The duel as a plain object mutated once per rendered frame. The 3D scene
// (Duel3D) reads it to position meshes and the camera; game.tsx hears about it
// only through `GameEvent`s. Everything that affects the outcome runs on the
// fixed physics step so both multiplayer phones agree; bullet time only
// stretches how long those steps take on screen.
import {
  AI,
  ARROW_LEN,
  HP,
  MAX_STUCK,
  PHYS,
  PILLAR_HALF,
  enemyNoise,
  handPoint,
  hitTest,
  layoutFor,
  simulateShot,
  solveLaunchAngle,
  stepArrow,
  surfaceHit,
  HEAD_Y,
  type FlightResult,
  type Layout,
  type Surface,
  type Zone,
} from '@/game3d/world';

export type { Surface, Zone };

export type GameEvent =
  | { type: 'aimStart' }
  | { type: 'drawTick' }
  | { type: 'release' }
  // My arrow left the bow — online mode broadcasts this so the opponent animates it.
  | { type: 'shotFired'; angle: number; power: number }
  // My arrow landed — authoritative outcome for the opponent's HP.
  | { type: 'shotResolved'; zone: Zone; hp: number }
  // My arrow missed; `long` = it flew past the target (vs. fell short).
  | { type: 'playerMiss'; long: boolean }
  | { type: 'enemyHit'; hp: number; zone: 'head' | 'body' }
  | { type: 'enemyRespawn' }
  | { type: 'enemyMiss' }
  | { type: 'playerHit'; hp: number; zone: 'head' | 'body' }
  // Presentation-only events (sound cues).
  | { type: 'enemyDraw' }
  | { type: 'enemyFired' }
  | { type: 'impact'; surface: Surface };

export type GameMode = 'ai' | 'online';
export type Shooter = 'player' | 'enemy';
export type Phase = 'intro' | 'player' | 'flight' | 'enemyThink' | 'waitRemote' | 'over';

// Ragdoll-lite death: the body is knocked off its pillar as one piece while
// the limbs go limp (the renderer flails them from `t`).
export type Death = { t: number; x: number; y: number; vx: number; vy: number; rot: number; spin: number; landed: boolean };

export type Archer = {
  x: number;
  top: number; // pillar top = feet height
  facing: 1 | -1;
  angle: number; // aim, world radians, y-up
  draw: number; // 0..1 bowstring pull
  hp: number;
  flash: number; // hit flash 1 → 0
  flinch: number; // hit recoil 1 → 0
  death: Death | null;
  drop: number; // spawn drop-in height above the pillar (m), eases to 0
  // AI aim animation targets
  aimTo: number;
  drawTo: number;
};

// Arrow left in the world. owner 0 = scenery (world coords); 1 = player body,
// 2 = enemy body (offset from the archer's feet at impact, world axes).
export type Stuck = { id: number; x: number; y: number; angle: number; owner: 0 | 1 | 2 };

export const P_STRIDE = 8; // x, y, z, vx, vy, vz, life, kind
export const P_BLOOD = 0;
export const P_SPARK = 1;
export const P_DUST = 2;
export const P_POOL = 90;

type Timer = { at: number; fn: () => void };

export type SimOptions = {
  mode: GameMode;
  seed: number;
  role: 'host' | 'guest';
  myTurnFirst: boolean;
};

export class DuelSim {
  readonly online: boolean;
  readonly seed: number;
  readonly role: 'host' | 'guest';
  round = 0;
  layout: Layout;
  player: Archer;
  enemy: Archer;
  phase: Phase = 'intro';
  private afterIntro: Phase;

  // clocks
  time = 0; // sim seconds (scaled)
  real = 0; // real seconds
  timeScale = 1;
  private slowUntil = 0; // real time until which a kill slow-mo holds
  private acc = 0;

  // aim input (player)
  aiming = false;
  aimAngle = 0.5;
  aimPower = 0;
  private lastNotch = 0;

  // arrow in flight
  arrow = { active: false, shooter: 'player' as Shooter, x: 0, y: 0, vx: 0, vy: 0, angle: 0 };
  predicted: FlightResult | null = null;
  trail: number[] = []; // x, y pairs, oldest first

  stuck: Stuck[] = [];
  private stuckId = 0;
  parts = new Float32Array(P_POOL * P_STRIDE);
  shake = 0;
  // Last impact, for the camera to linger on.
  lastImpact = { x: 0, y: 0, at: -10, kill: false, head: false };

  // gameplay context from React
  score = 0;
  skill = 0;
  inputEnabled = true;

  // online reconciliation
  private pendingRemote: { zone: Zone; hp: number } | null = null;

  private timers: Timer[] = [];
  private events: GameEvent[] = [];

  constructor(opts: SimOptions) {
    this.online = opts.mode === 'online';
    this.seed = opts.seed;
    this.role = opts.role;
    this.layout = layoutFor(opts.seed, 0);
    const mine = opts.role === 'host' ? this.layout.hostPillar : this.layout.guestPillar;
    const theirs = opts.role === 'host' ? this.layout.guestPillar : this.layout.hostPillar;
    this.player = newArcher(0, mine, 1);
    this.enemy = newArcher(this.layout.gap, theirs, -1);
    this.afterIntro = opts.myTurnFirst ? 'player' : 'waitRemote';
    this.later(2.4, () => {
      if (this.phase === 'intro') this.phase = this.afterIntro;
    });
  }

  // ---- input -----------------------------------------------------------------
  canAim() {
    return this.phase === 'player' && this.inputEnabled && !this.player.death;
  }

  private touch = { x: 0, y: 0 };

  // Touch-down position in screen px; the drag is measured from here.
  aimBegin(x: number, y: number) {
    this.touch = { x, y };
    if (!this.canAim()) return;
    this.aiming = true;
    this.aimPower = 0;
    this.lastNotch = 0;
    this.emit({ type: 'aimStart' });
  }

  // Finger position in screen px (y down). Slingshot: pulling back-left and
  // down from the touch-down point aims right and up.
  aimMove(x: number, y: number) {
    if (!this.aiming || this.phase !== 'player') return;
    const dx = this.touch.x - x;
    const dy = this.touch.y - y;
    const dist = Math.hypot(dx, dy);
    this.aimPower = Math.min(1, dist / PHYS.maxDrawPx);
    // Pull back-left and down → shoot right and up. Clamp to the forward half.
    if (dist > 6) this.aimAngle = clamp(Math.atan2(-dy, dx), -1.2, 1.45);
    const notch = Math.floor(this.aimPower * 8);
    if (notch !== this.lastNotch) {
      this.lastNotch = notch;
      if (this.aimPower >= PHYS.minPower) this.emit({ type: 'drawTick' });
    }
  }

  aimEnd() {
    if (!this.aiming) return;
    this.aiming = false;
    if (this.phase !== 'player' || this.aimPower < PHYS.minPower) {
      this.aimPower = 0;
      return;
    }
    const angle = this.aimAngle;
    const power = this.aimPower;
    this.player.angle = angle;
    this.player.draw = 0;
    this.aimPower = 0;
    this.emit({ type: 'release' });
    this.emit({ type: 'shotFired', angle, power });
    this.fire('player', angle, power);
  }

  // ---- online ----------------------------------------------------------------
  // Opponent's shot in THEIR frame (they shoot to the right too): mirror it.
  fireRemote(angle: number, power: number) {
    if (this.phase === 'over') return;
    if (this.phase === 'intro') this.phase = 'waitRemote';
    const mirrored = Math.PI - angle;
    this.enemy.angle = mirrored;
    this.enemy.aimTo = mirrored;
    this.fire('enemy', mirrored, power);
  }

  applyRemoteResult(r: { zone: Zone; hp: number }) {
    if (this.phase === 'over') return;
    // Their arrow is still flying on my screen: land it first.
    if (this.arrow.active && this.arrow.shooter === 'enemy') {
      this.pendingRemote = r;
      return;
    }
    this.applyRemote(r);
  }

  private applyRemote(r: { zone: Zone; hp: number }) {
    this.pendingRemote = null;
    if (r.zone === 'miss') {
      this.emit({ type: 'enemyMiss' });
      this.phase = 'player';
      return;
    }
    this.player.hp = r.hp;
    this.emit({ type: 'playerHit', hp: r.hp, zone: r.zone });
    if (r.hp <= 0) {
      if (!this.player.death) this.kill(this.player, -1);
      this.phase = 'over';
    } else {
      this.phase = 'player';
    }
  }

  // ---- frame -----------------------------------------------------------------
  // Advance by `realDt` seconds of wall time; returns events to deliver.
  update(realDt: number): GameEvent[] {
    const rdt = Math.min(realDt, 1 / 20);
    this.real += rdt;

    // Bullet time: a predicted headshot or kill slows down on approach.
    let target = 1;
    if (this.arrow.active && this.predicted && this.predicted.zone !== 'miss') {
      const victim = this.arrow.shooter === 'player' ? this.enemy : this.player;
      const lethal = this.predicted.zone === 'head' || victim.hp <= HP.body;
      const dist = Math.hypot(this.predicted.x - this.arrow.x, this.predicted.y - this.arrow.y);
      if (lethal && dist < 5.5) target = 0.16;
    }
    if (this.real < this.slowUntil) target = Math.min(target, 0.3);
    this.timeScale += (target - this.timeScale) * Math.min(1, rdt * (target < this.timeScale ? 14 : 5));
    const dt = rdt * this.timeScale;
    this.time += dt;

    this.runTimers();
    this.animateArchers(dt);
    this.updateParticles(dt);
    if (this.shake > 0.001) this.shake *= Math.exp(-7 * rdt);
    else this.shake = 0;

    if (this.aiming) this.player.draw = this.aimPower;

    if (this.arrow.active) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= PHYS.step && steps < 12 && this.arrow.active) {
        this.acc -= PHYS.step;
        steps += 1;
        this.stepFlight();
      }
      if (this.arrow.active) {
        this.trail.push(this.arrow.x, this.arrow.y);
        if (this.trail.length > 40) this.trail.splice(0, this.trail.length - 40);
      }
    }

    const out = this.events;
    this.events = [];
    return out;
  }

  private stepFlight() {
    const a = this.arrow;
    const r = stepArrow(a.x, a.y, a.vx, a.vy);
    a.x = r.x;
    a.y = r.y;
    a.vy = r.vy;
    a.angle = Math.atan2(a.vy, a.vx);
    const victim = a.shooter === 'player' ? this.enemy : this.player;
    const own = a.shooter === 'player' ? this.player : this.enemy;
    const zone = victim.death ? null : hitTest(victim.x, victim.top, a.x, a.y);
    if (zone) return this.resolve(zone, 'none');
    const surf = surfaceHit(a.x, a.y, { x: victim.x, top: victim.top }, own.x, Math.sign(a.vx));
    if (surf) return this.resolve('miss', surf);
    if (Math.abs(a.x - own.x) > 90 || a.y < -5) return this.resolve('miss', 'none');
  }

  // ---- firing ----------------------------------------------------------------
  private fire(shooter: Shooter, angle: number, power: number) {
    const me = shooter === 'player' ? this.player : this.enemy;
    const them = shooter === 'player' ? this.enemy : this.player;
    const from = handPoint(me.x, me.top, angle);
    const v = power * PHYS.maxSpeed;
    Object.assign(this.arrow, {
      active: true,
      shooter,
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      angle,
    });
    this.acc = 0;
    this.trail = [];
    this.predicted = simulateShot(from, angle, power, { x: them.x, top: them.top }, me.x);
    this.phase = 'flight';
    me.draw = 0;
    me.drawTo = 0;
    if (shooter === 'enemy') this.emit({ type: 'enemyFired' });
  }

  private resolve(zone: Zone, surface: Surface) {
    const a = this.arrow;
    a.active = false;
    this.trail = [];
    this.predicted = null;
    const shooter = a.shooter;
    const victim = shooter === 'player' ? this.enemy : this.player;

    if (zone !== 'miss') {
      const owner = shooter === 'player' ? 2 : 1;
      // Bury the tip a little into the body.
      const tipX = a.x + Math.cos(a.angle) * 0.12;
      const tipY = a.y + Math.sin(a.angle) * 0.12;
      this.addStuck({ x: tipX - victim.x, y: tipY - victim.top, angle: a.angle, owner });
      const n = zone === 'head' ? 26 : 16;
      this.burst(a.x, a.y, n, P_BLOOD, a.angle, 7, 1.5);
      if (zone === 'head') this.burst(a.x, a.y, 10, P_SPARK, a.angle + Math.PI, 8, 2.6);
      victim.flash = 1;
      victim.flinch = 1;
    } else if (surface !== 'none') {
      const y = surface === 'ground' ? Math.max(0.02, a.y) : a.y;
      this.addStuck({ x: a.x, y, angle: a.angle, owner: 0 });
      this.burst(a.x, y, 10, P_DUST, Math.PI / 2, 2.2, 2.4);
      this.emit({ type: 'impact', surface });
    }
    this.lastImpact = { x: a.x, y: a.y, at: this.real, kill: false, head: zone === 'head' };

    const dmg = zone === 'head' ? HP.headshot : HP.body;

    if (shooter === 'player') {
      if (zone !== 'miss') this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
      this.emit({ type: 'shotResolved', zone, hp: this.enemy.hp });
      if (zone === 'miss') {
        this.emit({ type: 'playerMiss', long: a.x > this.enemy.x });
        this.handTurnToEnemy();
        return;
      }
      this.shake = this.enemy.hp <= 0 ? 0.32 : 0.16;
      this.emit({ type: 'enemyHit', hp: this.enemy.hp, zone });
      if (this.enemy.hp <= 0) {
        this.kill(this.enemy, 1);
        if (this.online) this.phase = 'over';
        else {
          this.phase = 'enemyThink'; // lock input while the body falls
          this.later(AI.respawnMs / 1000, () => this.spawnEnemy());
        }
      } else {
        this.handTurnToEnemy();
      }
      return;
    }

    // Opponent's arrow landed on my side.
    if (zone !== 'miss') this.shake = 0.16;
    if (this.online) {
      // Only visual here: the shooter's result is authoritative.
      if (this.pendingRemote) this.applyRemote(this.pendingRemote);
      else this.phase = 'waitRemote';
      return;
    }
    if (zone === 'miss') {
      this.emit({ type: 'enemyMiss' });
      this.phase = 'player';
      return;
    }
    this.player.hp = Math.max(0, this.player.hp - dmg);
    this.emit({ type: 'playerHit', hp: this.player.hp, zone });
    if (this.player.hp <= 0) {
      this.shake = 0.32;
      this.kill(this.player, -1);
      this.phase = 'over';
    } else {
      this.phase = 'player';
    }
  }

  private handTurnToEnemy() {
    this.phase = this.online ? 'waitRemote' : 'enemyThink';
    if (!this.online) {
      this.later(0.9, () => this.enemyAim());
      this.later(0.9 + AI.thinkMs / 1000, () => this.enemyShoot());
    }
  }

  private kill(a: Archer, dir: 1 | -1) {
    a.death = { t: 0, x: a.x, y: a.top, vx: 2.6 * dir, vy: 3.4, rot: 0, spin: -dir * 4.2, landed: false };
    a.draw = 0;
    a.drawTo = 0;
    this.slowUntil = this.real + 0.7;
    this.lastImpact.kill = true;
    this.shake = 0.34;
  }

  // ---- AI --------------------------------------------------------------------
  private plannedAngle = Math.PI - 0.5;

  private enemyAim() {
    if (this.phase !== 'enemyThink' || this.enemy.death) return;
    const rest = Math.PI - 0.35;
    const from = handPoint(this.enemy.x, this.enemy.top, rest);
    const target = { x: this.player.x, y: this.player.top + HEAD_Y };
    const v = PHYS.maxSpeed * AI.speedFraction;
    let a = solveLaunchAngle(target.x - from.x, target.y - from.y, v);
    // Out of range: max-distance 45° lob toward the player.
    if (a === null) a = Math.PI - Math.PI / 4;
    a += (Math.random() * 2 - 1) * enemyNoise(this.score, this.skill);
    this.plannedAngle = a;
    this.enemy.aimTo = a;
    this.enemy.drawTo = AI.speedFraction;
    this.emit({ type: 'enemyDraw' });
  }

  private enemyShoot() {
    if (this.phase !== 'enemyThink' || this.enemy.death) return;
    this.enemy.angle = this.plannedAngle;
    this.fire('enemy', this.plannedAngle, AI.speedFraction);
  }

  private spawnEnemy() {
    this.round += 1;
    const l = layoutFor(this.seed, this.round);
    this.layout = { ...this.layout, gap: l.gap, guestPillar: l.guestPillar };
    const e = newArcher(l.gap, l.guestPillar, -1);
    e.drop = 9;
    this.enemy = e;
    this.stuck = this.stuck.filter((s) => s.owner !== 2);
    // Hold on the new rival dropping onto its tower, then hand over.
    this.phase = 'enemyThink';
    this.emit({ type: 'enemyRespawn' });
    this.later(1.3, () => {
      if (this.phase === 'enemyThink' && !this.arrow.active) this.phase = 'player';
    });
  }

  // ---- animation ---------------------------------------------------------------
  private animateArchers(dt: number) {
    for (const a of [this.player, this.enemy]) {
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 4);
      if (a.flinch > 0) a.flinch = Math.max(0, a.flinch - dt * 3);
      if (a.drop > 0) {
        const before = a.drop;
        a.drop = Math.max(0, a.drop - dt * (6 + (9 - a.drop) * 3));
        if (before > 0 && a.drop === 0) {
          this.burst(a.x, a.top + 0.05, 12, P_DUST, Math.PI / 2, 2.6, 3);
          this.shake = Math.max(this.shake, 0.12);
          this.emit({ type: 'impact', surface: 'pillar' });
        }
      }
      if (a !== this.player || !this.aiming) {
        const k = 1 - Math.exp(-dt * 5);
        a.angle += (a.aimTo - a.angle) * k;
        a.draw += (a.drawTo - a.draw) * k;
      }
      const d = a.death;
      if (d && !d.landed) {
        d.t += dt;
        d.vy -= PHYS.gravity * 0.8 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.spin * dt;
        const floor = Math.abs(d.x - a.x) < PILLAR_HALF ? a.top : 0;
        if (d.y <= floor && d.vy < 0) {
          d.y = floor;
          d.landed = true;
          d.rot = Math.sign(d.spin || 1) * (Math.PI / 2);
          this.burst(d.x, floor + 0.05, 14, P_DUST, Math.PI / 2, 3, 3);
          this.shake = Math.max(this.shake, 0.14);
        }
      } else if (d) {
        d.t += dt;
      }
    }
    if (this.aiming) this.player.aimTo = this.aimAngle;
  }

  // ---- particles ----------------------------------------------------------------
  private burst(x: number, y: number, count: number, kind: number, dir: number, speed: number, spread: number) {
    const p = this.parts;
    let spawned = 0;
    for (let i = 0; i < p.length && spawned < count; i += P_STRIDE) {
      if (p[i + 6] > 0) continue;
      const ang = dir + (Math.random() - 0.5) * spread;
      const v = speed * (0.3 + Math.random() * 0.7);
      p[i] = x;
      p[i + 1] = y;
      p[i + 2] = (Math.random() - 0.5) * 0.4;
      p[i + 3] = Math.cos(ang) * v;
      p[i + 4] = Math.sin(ang) * v;
      p[i + 5] = (Math.random() - 0.5) * v * 0.8;
      p[i + 6] = 1;
      p[i + 7] = kind;
      spawned += 1;
    }
  }

  private updateParticles(dt: number) {
    const p = this.parts;
    for (let i = 0; i < p.length; i += P_STRIDE) {
      if (p[i + 6] <= 0) continue;
      const kind = p[i + 7];
      const g = kind === P_DUST ? 1.2 : 16;
      p[i + 4] -= g * dt;
      if (kind === P_DUST) {
        p[i + 3] *= Math.exp(-2.5 * dt);
        p[i + 5] *= Math.exp(-2.5 * dt);
      }
      p[i] += p[i + 3] * dt;
      p[i + 1] += p[i + 4] * dt;
      p[i + 2] += p[i + 5] * dt;
      if (p[i + 1] < 0.02 && kind !== P_DUST) {
        p[i + 1] = 0.02;
        p[i + 3] *= 0.2;
        p[i + 4] = 0;
        p[i + 5] *= 0.2;
      }
      p[i + 6] -= dt * (kind === P_DUST ? 0.9 : kind === P_BLOOD ? 0.55 : 1.3);
    }
  }

  // ---- helpers ------------------------------------------------------------------
  private addStuck(s: Omit<Stuck, 'id'>) {
    this.stuckId += 1;
    this.stuck = this.stuck.concat([{ ...s, id: this.stuckId }]);
    if (this.stuck.length > MAX_STUCK) this.stuck = this.stuck.slice(this.stuck.length - MAX_STUCK);
  }

  private later(sec: number, fn: () => void) {
    this.timers.push({ at: this.time + sec, fn });
  }

  private runTimers() {
    if (this.timers.length === 0) return;
    const due = this.timers.filter((t) => t.at <= this.time);
    if (due.length === 0) return;
    this.timers = this.timers.filter((t) => t.at > this.time);
    for (const t of due) t.fn();
  }

  private emit(e: GameEvent) {
    this.events.push(e);
  }
}

function newArcher(x: number, top: number, facing: 1 | -1): Archer {
  const rest = facing === 1 ? 0.35 : Math.PI - 0.35;
  return {
    x,
    top,
    facing,
    angle: rest,
    draw: 0,
    hp: HP.max,
    flash: 0,
    flinch: 0,
    death: null,
    drop: 0,
    aimTo: rest,
    drawTo: 0,
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export { ARROW_LEN };
