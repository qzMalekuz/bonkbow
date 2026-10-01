// The duel as a plain object mutated once per rendered frame. The 3D scene
// (Duel3D) reads it to position meshes and the camera; game.tsx hears about it
// only through `GameEvent`s. Everything that affects the outcome runs on the
// fixed physics step so both multiplayer phones agree; bullet time only
// stretches how long those steps take on screen.
import {
  AI,
  HP,
  MAX_STUCK,
  PHYS,
  TURN_SECONDS,
  damageFor,
  enemyNoise,
  handPoint,
  hitTest,
  layoutFor,
  onLedge,
  simulateShot,
  solveLaunchAngle,
  stepArrow,
  surfaceHit,
  HEAD_Y,
  type FlightResult,
  type HitZone,
  type Layout,
  type Surface,
  type Zone,
} from '@/game3d/world';

export type { HitZone, Surface, Zone };

export type Who = 'player' | 'enemy';

export type GameEvent =
  | { type: 'aimStart' }
  | { type: 'drawTick'; power: number }
  | { type: 'release' }
  // My arrow left the bow — online mode broadcasts this so the opponent animates it.
  | { type: 'shotFired'; angle: number; power: number }
  // My arrow landed — authoritative outcome for the opponent's health.
  | { type: 'shotResolved'; zone: Zone; hp: number; shield: number }
  // My arrow missed; `long` = it flew past the target (vs. fell short).
  | { type: 'playerMiss'; long: boolean }
  | { type: 'enemyHit'; zone: HitZone; hp: number; shield: number; dmg: number; shieldDmg: number }
  | { type: 'playerHit'; zone: HitZone; hp: number; shield: number; dmg: number; shieldDmg: number }
  | { type: 'shieldBreak'; who: Who }
  | { type: 'enemyRespawn'; hp: number; shield: number }
  | { type: 'playerHeal'; hp: number; shield: number }
  | { type: 'enemyMiss' }
  | { type: 'turnStart'; who: Who; seconds: number }
  | { type: 'turnTimeout' }
  // Presentation-only events (sound cues).
  | { type: 'enemyDraw' }
  | { type: 'enemyFired' }
  | { type: 'footstep' }
  | { type: 'impact'; surface: Surface };

export type GameMode = 'ai' | 'online';
export type Phase = 'intro' | 'player' | 'flight' | 'enemyThink' | 'waitRemote' | 'over';

// Face the rig shows; reactions set one for a moment, then it relaxes.
export type Mood = 'neutral' | 'angry' | 'happy' | 'hurt' | 'laugh' | 'sad' | 'shock' | 'dead' | 'smug' | 'wink' | 'sleepy' | 'scared';
// Whole-body animations layered over the idle pose.
export type Gesture =
  | 'cheer'
  | 'laugh'
  | 'facepalm'
  | 'shrug'
  | 'wave'
  | 'stomp'
  | 'thumbs'
  | 'flag'
  | 'cry'
  | 'bow'
  | 'flex'
  | 'think'
  | 'salute'
  | 'dance'
  | 'yawn';

// Ragdoll-lite death: the body is knocked back as one piece while the limbs
// go limp (the renderer flails them from `t`).
export type Death = { t: number; x: number; y: number; vx: number; vy: number; rot: number; spin: number; landed: boolean };

export type Archer = {
  x: number;
  top: number; // ledge height = feet height
  facing: 1 | -1;
  angle: number; // aim, world radians, y-up
  draw: number; // 0..1 bowstring pull
  hp: number;
  shield: number;
  flash: number; // hit flash 1 → 0
  flinch: number; // hit recoil 1 → 0
  shieldFlash: number; // blue shimmer when the shield soaks a hit
  death: Death | null;
  walk: number; // metres still to walk in (enters from behind)
  stepT: number; // walk cycle phase
  mood: Mood;
  moodUntil: number;
  gesture: Gesture | null;
  gestureT: number; // seconds since the gesture started
  recoil: number; // 1 → 0 after a release: string vibration + arm kick
  aimTo: number;
  drawTo: number;
};

// Arrow left in the world. owner 0 = scenery (world coords); 1 = player body,
// 2 = enemy body (offset from the archer's feet at impact, world axes).
export type Stuck = { id: number; x: number; y: number; angle: number; owner: 0 | 1 | 2; shooter: Who };

export const P_STRIDE = 8; // x, y, z, vx, vy, vz, life, kind
export const P_BLOOD = 0;
export const P_SPARK = 1;
export const P_DUST = 2;
export const P_SHIELD = 3;
export const P_POOL = 140;

type Timer = { at: number; fn: () => void };

export type SimOptions = {
  mode: GameMode;
  seed: number;
  role: 'host' | 'guest';
  myTurnFirst: boolean;
};

export const GESTURE_SECONDS: Record<Gesture, number> = {
  cheer: 2.4,
  laugh: 2.2,
  facepalm: 1.8,
  shrug: 1.4,
  wave: 1.6,
  stomp: 1.4,
  thumbs: 1.5,
  flag: 2.2,
  cry: 2.2,
  bow: 2.0,
  flex: 2.2,
  think: 2.4,
  salute: 1.8,
  dance: 2.6,
  yawn: 2.4,
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
  private afterIntro: Who;
  winner: Who | null = null;

  // clocks
  time = 0; // sim seconds (scaled)
  real = 0; // real seconds
  timeScale = 1;
  private slowUntil = 0; // real time until which a kill slow-mo holds
  private acc = 0;
  turnEnds = 0; // sim time the current player turn times out

  // aim input (player)
  aiming = false;
  aimAngle = 0.5;
  aimPower = 0;
  // Raw finger input; aimAngle/aimPower chase it every frame so the arm,
  // bow and trajectory move smoothly instead of jittering with the finger.
  private rawAngle = 0.5;
  private rawPower = 0;
  private lastNotch = 0;
  private touch = { x: 0, y: 0 };
  // My previous shot, drawn as ghost dots while aiming.
  prevShot: { angle: number; power: number } | null = null;

  // arrow in flight
  arrow = { active: false, shooter: 'player' as Who, x: 0, y: 0, vx: 0, vy: 0, angle: 0, power: 0 };
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
  private pendingRemote: { zone: Zone; hp: number; shield: number } | null = null;

  private timers: Timer[] = [];
  private events: GameEvent[] = [];

  constructor(opts: SimOptions) {
    this.online = opts.mode === 'online';
    this.seed = opts.seed;
    this.role = opts.role;
    this.layout = layoutFor(opts.seed, 0);
    const mine = opts.role === 'host' ? this.layout.hostLedge : this.layout.guestLedge;
    const theirs = opts.role === 'host' ? this.layout.guestLedge : this.layout.hostLedge;
    this.player = newArcher(0, mine, 1, HP.shield);
    // vs AI the first rival has no armour; each new one wears a bit more.
    this.enemy = newArcher(this.layout.gap, theirs, -1, this.online ? HP.shield : 0);
    this.player.walk = 2.6;
    this.enemy.walk = 2.6;
    this.afterIntro = opts.myTurnFirst ? 'player' : 'enemy';
    this.later(2.6, () => {
      if (this.phase === 'intro') this.startTurn(this.afterIntro);
    });
  }

  // ---- input -----------------------------------------------------------------
  canAim() {
    return this.phase === 'player' && this.inputEnabled && !this.player.death;
  }

  // Touch-down position in screen px; the drag is measured from here.
  aimBegin(x: number, y: number) {
    this.touch = { x, y };
    if (!this.canAim()) return;
    this.aiming = true;
    this.aimPower = 0;
    this.rawPower = 0;
    this.rawAngle = this.player.angle;
    this.aimAngle = this.player.angle;
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
    this.rawPower = Math.min(1, dist / PHYS.maxDrawPx);
    // Clamp to the forward half.
    if (dist > 6) this.rawAngle = clamp(Math.atan2(-dy, dx), -1.2, 1.45);
    const notch = Math.floor(this.rawPower * 8);
    if (notch !== this.lastNotch) {
      this.lastNotch = notch;
      if (this.rawPower >= PHYS.minPower) this.emit({ type: 'drawTick', power: this.rawPower });
    }
  }

  aimEnd() {
    if (!this.aiming) return;
    this.aiming = false;
    // Fire what the finger asked for (the smoothed values trail it by a frame).
    if (this.phase !== 'player' || this.rawPower < PHYS.minPower) {
      this.aimPower = 0;
      this.rawPower = 0;
      return;
    }
    this.release(this.rawAngle, this.rawPower);
  }

  private release(angle: number, power: number) {
    this.player.aimTo = angle;
    this.player.drawTo = 0;
    this.player.recoil = 1; // string snaps; the rig plays the follow-through
    this.aimPower = 0;
    this.rawPower = 0;
    this.aiming = false;
    this.prevShot = { angle, power };
    this.emit({ type: 'release' });
    this.emit({ type: 'shotFired', angle, power });
    this.fire('player', angle, power);
  }

  // Emote: the archer acts it out and pulls the matching face.
  gesture(who: Who, g: Gesture, mood: Mood) {
    const a = who === 'player' ? this.player : this.enemy;
    if (a.death) return;
    a.gesture = g;
    a.gestureT = 0;
    this.setMood(a, mood, GESTURE_SECONDS[g]);
  }

  // ---- online ----------------------------------------------------------------
  // Opponent's shot in THEIR frame (they shoot to the right too): mirror it.
  fireRemote(angle: number, power: number) {
    if (this.phase === 'over') return;
    const mirrored = Math.PI - angle;
    this.enemy.angle = mirrored;
    this.enemy.aimTo = mirrored;
    this.fire('enemy', mirrored, power);
  }

  applyRemoteResult(r: { zone: Zone; hp: number; shield: number }) {
    if (this.phase === 'over') return;
    // Their arrow is still flying on my screen: land it first.
    if (this.arrow.active && this.arrow.shooter === 'enemy') {
      this.pendingRemote = r;
      return;
    }
    this.applyRemote(r);
  }

  private applyRemote(r: { zone: Zone; hp: number; shield: number }) {
    this.pendingRemote = null;
    if (r.zone === 'miss') {
      this.emit({ type: 'enemyMiss' });
      this.startTurn('player');
      return;
    }
    const p = this.player;
    const dmg = Math.max(0, p.hp - r.hp);
    const shieldDmg = Math.max(0, p.shield - r.shield);
    this.applyDamage(p, 'enemy', r.zone, r.hp, r.shield, dmg, shieldDmg);
    if (r.hp <= 0) this.endMatch('enemy');
    else this.startTurn('player');
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
      const dmg = damageFor(this.predicted.zone, this.arrow.power, victim.shield);
      const lethal = this.predicted.zone === 'head' || dmg.hp >= victim.hp;
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

    // Ease the aim toward the finger (fast, frame-rate independent).
    if (this.aiming) {
      const k = 1 - Math.exp(-rdt * 30);
      this.aimAngle += (this.rawAngle - this.aimAngle) * k;
      this.aimPower += (this.rawPower - this.aimPower) * k;
    }

    // Turn timer: running out releases whatever is drawn, or fumbles a weak
    // shot into the cliff so the turn always passes (same on both phones).
    if (this.phase === 'player' && this.time > this.turnEnds) {
      this.emit({ type: 'turnTimeout' });
      if (this.aiming && this.rawPower >= PHYS.minPower) this.release(this.rawAngle, this.rawPower);
      else this.release(-0.9, 0.14);
    }

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
    const surf = surfaceHit(a.x, a.y, victim, own);
    if (surf) return this.resolve('miss', surf);
    if (Math.abs(a.x - own.x) > 90 || a.y < -5) return this.resolve('miss', 'none');
  }

  // ---- turns -------------------------------------------------------------------
  private startTurn(who: Who) {
    if (this.phase === 'over') return;
    if (who === 'player') {
      this.phase = 'player';
      this.turnEnds = this.time + TURN_SECONDS;
      this.emit({ type: 'turnStart', who: 'player', seconds: TURN_SECONDS });
      return;
    }
    this.phase = this.online ? 'waitRemote' : 'enemyThink';
    this.emit({ type: 'turnStart', who: 'enemy', seconds: this.online ? TURN_SECONDS : 2 });
    if (!this.online) {
      this.later(0.9, () => this.enemyAim());
      this.later(0.9 + AI.thinkMs / 1000, () => this.enemyShoot());
    }
  }

  // ---- firing ----------------------------------------------------------------
  private fire(shooter: Who, angle: number, power: number) {
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
      power,
    });
    this.acc = 0;
    this.trail = [];
    this.predicted = simulateShot(from, angle, power, them, me);
    this.phase = 'flight';
    me.draw = 0;
    me.drawTo = 0;
    me.recoil = 1;
    if (shooter === 'enemy') this.emit({ type: 'enemyFired' });
  }

  private resolve(zone: Zone, surface: Surface) {
    const a = this.arrow;
    a.active = false;
    this.trail = [];
    this.predicted = null;
    const shooterWho = a.shooter;
    const shooter = shooterWho === 'player' ? this.player : this.enemy;
    const victim = shooterWho === 'player' ? this.enemy : this.player;

    if (zone !== 'miss') {
      const owner = shooterWho === 'player' ? 2 : 1;
      // Bury the tip a little into the body.
      const tipX = a.x + Math.cos(a.angle) * 0.12;
      const tipY = a.y + Math.sin(a.angle) * 0.12;
      this.addStuck({ x: tipX - victim.x, y: tipY - victim.top, angle: a.angle, owner, shooter: shooterWho });
    } else if (surface !== 'none') {
      const y = surface === 'ground' ? Math.max(0.02, a.y) : a.y;
      this.addStuck({ x: a.x, y, angle: a.angle, owner: 0, shooter: shooterWho });
      this.burst(a.x, y, 12, P_DUST, Math.PI / 2, 2.2, 2.4);
      this.emit({ type: 'impact', surface });
    }
    this.lastImpact = { x: a.x, y: a.y, at: this.real, kill: false, head: zone === 'head' };

    // Misses: the shooter is annoyed, the target smug.
    if (zone === 'miss') {
      this.setMood(shooter, 'angry', 1.4);
      if (!victim.death) this.setMood(victim, 'happy', 1.2);
    }

    if (shooterWho === 'player') {
      if (zone === 'miss') {
        this.emit({ type: 'shotResolved', zone, hp: this.enemy.hp, shield: this.enemy.shield });
        this.emit({ type: 'playerMiss', long: a.x > this.enemy.x });
        this.startTurn('enemy');
        return;
      }
      const d = damageFor(zone, a.power, this.enemy.shield);
      const hp = Math.max(0, this.enemy.hp - d.hp);
      const shield = this.enemy.shield - d.shield;
      this.emit({ type: 'shotResolved', zone, hp, shield });
      this.applyDamage(this.enemy, 'player', zone, hp, shield, d.hp, d.shield);
      if (hp > 0) return this.startTurn('enemy');
      if (this.online) return this.endMatch('player');
      // vs AI: the next rival walks in once this one has fallen.
      this.phase = 'enemyThink';
      this.later(AI.respawnMs / 1000, () => this.spawnEnemy());
      return;
    }

    // Opponent's arrow landed on my side.
    if (this.online) {
      // Only visual here: the shooter's result is authoritative.
      if (zone !== 'miss') this.hitFx(this.player, zone, false);
      if (this.pendingRemote) this.applyRemote(this.pendingRemote);
      else this.phase = 'waitRemote';
      return;
    }
    if (zone === 'miss') {
      this.emit({ type: 'enemyMiss' });
      this.startTurn('player');
      return;
    }
    const d = damageFor(zone, a.power, this.player.shield);
    const hp = Math.max(0, this.player.hp - d.hp);
    this.applyDamage(this.player, 'enemy', zone, hp, this.player.shield - d.shield, d.hp, d.shield);
    if (hp <= 0) this.endMatch('enemy');
    else this.startTurn('player');
  }

  // Health/shield change plus every visual consequence of a hit.
  private applyDamage(victim: Archer, by: Who, zone: HitZone, hp: number, shield: number, dmg: number, shieldDmg: number) {
    const who: Who = victim === this.player ? 'player' : 'enemy';
    const hadShield = victim.shield > 0;
    victim.hp = hp;
    victim.shield = shield;
    // Online, my own hit effects already played when their arrow landed.
    if (!(this.online && who === 'player')) this.hitFx(victim, zone, shieldDmg > 0 && dmg === 0);
    if (shieldDmg > 0) victim.shieldFlash = 1;
    this.emit(
      who === 'enemy'
        ? { type: 'enemyHit', zone, hp, shield, dmg, shieldDmg }
        : { type: 'playerHit', zone, hp, shield, dmg, shieldDmg },
    );
    if (hadShield && shield <= 0) this.emit({ type: 'shieldBreak', who });
    const shooter = by === 'player' ? this.player : this.enemy;
    if (hp <= 0) {
      this.kill(victim, who === 'enemy' ? 1 : -1);
      this.setMood(shooter, 'laugh', 2.5);
    } else {
      this.setMood(victim, 'hurt', 1.1);
      this.setMood(shooter, 'happy', 1.3);
    }
  }

  private hitFx(victim: Archer, zone: HitZone, shieldOnly: boolean) {
    const { x, y, angle } = this.arrow;
    if (shieldOnly) {
      this.burst(x, y, 16, P_SHIELD, angle + Math.PI, 6, 2.6);
    } else {
      this.burst(x, y, zone === 'head' ? 34 : 22, P_BLOOD, angle, 7, 1.6);
      this.burst(x, y, 10, P_BLOOD, angle + Math.PI, 3, 2.2);
      if (zone === 'head') this.burst(x, y, 10, P_SPARK, angle + Math.PI, 8, 2.6);
    }
    victim.flash = shieldOnly ? 0.4 : 1;
    victim.flinch = 1;
    this.shake = Math.max(this.shake, zone === 'head' ? 0.24 : 0.16);
  }

  private endMatch(winner: Who) {
    this.phase = 'over';
    this.winner = winner;
    const w = winner === 'player' ? this.player : this.enemy;
    this.setMood(w, 'laugh', 99);
    this.later(1.2, () => this.gesture(winner, 'cheer', 'laugh'));
  }

  private kill(a: Archer, dir: 1 | -1) {
    a.death = { t: 0, x: a.x, y: a.top, vx: 2.6 * dir, vy: 3.4, rot: 0, spin: -dir * 4.2, landed: false };
    a.draw = 0;
    a.drawTo = 0;
    a.gesture = null;
    a.mood = 'dead';
    a.moodUntil = Infinity;
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
    this.layout = { ...this.layout, gap: l.gap, guestLedge: l.guestLedge };
    const e = newArcher(l.gap, l.guestLedge, -1, Math.min(HP.shield, this.round * 20));
    e.walk = 4;
    this.enemy = e;
    this.stuck = this.stuck.filter((s) => s.owner !== 2);
    // Patch me up between rivals.
    const p = this.player;
    p.hp = Math.min(HP.max, p.hp + 25);
    p.shield = Math.min(HP.shield, p.shield + 20);
    this.emit({ type: 'playerHeal', hp: p.hp, shield: p.shield });
    this.emit({ type: 'enemyRespawn', hp: e.hp, shield: e.shield });
    // Hold on the new rival walking in, then hand over.
    this.phase = 'enemyThink';
    this.later(2, () => {
      if (this.phase === 'enemyThink' && !this.arrow.active) this.startTurn('player');
    });
  }

  // ---- animation ---------------------------------------------------------------
  private animateArchers(dt: number) {
    for (const a of [this.player, this.enemy]) {
      if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 4);
      if (a.flinch > 0) a.flinch = Math.max(0, a.flinch - dt * 2.6);
      if (a.shieldFlash > 0) a.shieldFlash = Math.max(0, a.shieldFlash - dt * 2.5);
      if (a.mood !== 'dead' && a.mood !== 'neutral' && this.time > a.moodUntil) a.mood = 'neutral';
      if (a.gesture) {
        a.gestureT += dt;
        if (a.gestureT > GESTURE_SECONDS[a.gesture] && this.phase !== 'over') a.gesture = null;
      }
      if (a.walk > 0) {
        const before = a.stepT;
        a.walk = Math.max(0, a.walk - dt * 2.1);
        a.stepT += dt * 2.6;
        if (Math.floor(before * 2) !== Math.floor(a.stepT * 2)) this.emit({ type: 'footstep' });
        if (a.walk === 0) a.stepT = 0;
      }
      if (a.recoil > 0) a.recoil = Math.max(0, a.recoil - dt * 2.2);
      if (a === this.player && this.aiming) {
        // The bow follows the (already smoothed) aim directly.
        a.angle = this.aimAngle;
        a.draw = this.aimPower;
      } else {
        const k = 1 - Math.exp(-dt * 6);
        a.angle += (a.aimTo - a.angle) * k;
        // Released strings snap instantly; drawing up eases in.
        a.draw = a.drawTo < a.draw && a.recoil > 0 ? a.drawTo : a.draw + (a.drawTo - a.draw) * k;
      }
      const d = a.death;
      if (d && !d.landed) {
        d.t += dt;
        d.vy -= PHYS.gravity * 0.8 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.spin * dt;
        const floor = onLedge(a.x, a.facing, d.x) ? a.top : 0;
        if (d.y <= floor && d.vy < 0) {
          d.y = floor;
          d.landed = true;
          d.rot = Math.sign(d.spin || 1) * (Math.PI / 2);
          this.burst(d.x, floor + 0.05, 16, P_DUST, Math.PI / 2, 3, 3);
          this.burst(d.x, floor + 0.3, 10, P_BLOOD, Math.PI / 2, 2, 2.4);
          this.shake = Math.max(this.shake, 0.14);
        }
      } else if (d) {
        d.t += dt;
      }
    }
    if (this.aiming) this.player.aimTo = this.aimAngle;
  }

  private setMood(a: Archer, mood: Mood, seconds: number) {
    if (a.mood === 'dead') return;
    a.mood = mood;
    a.moodUntil = this.time + seconds;
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
      const g = kind === P_DUST ? 1.2 : kind === P_SHIELD ? 4 : 16;
      p[i + 4] -= g * dt;
      if (kind === P_DUST) {
        p[i + 3] *= Math.exp(-2.5 * dt);
        p[i + 5] *= Math.exp(-2.5 * dt);
      }
      p[i] += p[i + 3] * dt;
      p[i + 1] += p[i + 4] * dt;
      p[i + 2] += p[i + 5] * dt;
      // Blood and sparks settle on whatever rock is below.
      const floor = this.floorAt(p[i]);
      if (p[i + 1] < floor + 0.02 && kind !== P_DUST) {
        p[i + 1] = floor + 0.02;
        p[i + 3] *= 0.2;
        p[i + 4] = 0;
        p[i + 5] *= 0.2;
      }
      p[i + 6] -= dt * (kind === P_DUST ? 0.9 : kind === P_BLOOD ? 0.45 : 1.3);
    }
  }

  private floorAt(x: number) {
    if (onLedge(this.player.x, 1, x)) return this.player.top;
    if (onLedge(this.enemy.x, -1, x)) return this.enemy.top;
    return 0;
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

function newArcher(x: number, top: number, facing: 1 | -1, shield: number): Archer {
  const rest = facing === 1 ? 0.35 : Math.PI - 0.35;
  return {
    x,
    top,
    facing,
    angle: rest,
    draw: 0,
    hp: HP.max,
    shield,
    flash: 0,
    flinch: 0,
    shieldFlash: 0,
    death: null,
    walk: 0,
    stepT: 0,
    mood: 'neutral',
    moodUntil: 0,
    gesture: null,
    gestureT: 0,
    recoil: 0,
    aimTo: rest,
    drawTo: 0,
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
