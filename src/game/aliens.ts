/**
 * Aliens — the fidelity-critical module: formation roles, dive-bomber paths,
 * the Flagship Attack Alert, and the 200k escalation.
 *
 * Formation: 4 rows x 10 cols of block-aligned aliens that oscillate
 * horizontally as a group. Each row maps to an alien type (Scout, Warrior,
 * Bodyguard, Warrior) with a base score; shooting a diving alien pays double.
 *
 * Flagship row: sits above the formation. At sector start there are
 * F = min(1 + (sector-1), 16) flagships; while F <= 4 each flagship is
 * flanked by two Bodyguard escorts ([B F B] groups, as traced from
 * galaxyinvasion-4/5.png). Above 200,000 points the alert is permanently
 * active and the flagship count grows with the score until the row fills.
 *
 * Flagship Attack Alert: if no flagship is destroyed within ALERT_GRACE_MS,
 * the two-tone alert starts; after ALERT_DURATION_MS more, every on-screen
 * flagship fires an always-fatal lightning bolt (the original's rare near-miss
 * was a bug and is not reproduced). Destroying a flagship resets the cycle.
 */
import { FB_H, FB_W } from "../render/framebuffer";
import {
  BODYGUARD,
  FLAGSHIP,
  FLAGSHIP_DIVE,
  FORMATION_FRAMES,
} from "../render/sprites";
import type { Sprite } from "../render/sprites";
import { sound } from "../audio/sound";
import type { AlienTypeName } from "./scoring";
import { ESCALATION_SCORE, ESCALATION_STEP, ROW_TYPES } from "./scoring";
import { AlienShot, Bomb, Bolt } from "./shots";

export const FORMATION_COLS = 10;
export const FORMATION_ROWS = 4;
/** row pitch (blocks) traced from the screenshots */
export const ROW_PITCH = 5;
export const COL_PITCH = 10;
/** formation top row y */
export const FORMATION_Y = 8;
/** flagship row y */
export const FLAGSHIP_Y = 3;

/** oscillation: amplitude 8 blocks, period 4 s (tunable) */
export const OSC_AMPLITUDE = 8; // tunable
export const OSC_PERIOD = 4; // tunable

/** Dive duration (s) — readable swoop, threatening pace. */
export const DIVE_DURATION = 1.5; // tunable
export const FLAGSHIP_DIVE_DURATION = 1.6; // tunable

/**
 * Dive arc: the bezier control point sits DIVE_ARC blocks below the chord
 * midpoint, dipping the curve DIVE_ARC/2 below the straight line at t=0.5 —
 * a visible swoop instead of a degenerate straight diagonal.
 */
export const DIVE_ARC = 6; // tunable
export const FLAGSHIP_DIVE_ARC = 8; // tunable

/** Bomb drops early in the dive (t=0.3), just below the formation, so the
 *  bomb has a readable fall while the diver keeps swooping. */
export const BOMB_DROP_T = 0.3; // tunable

/** Dive trigger base interval (s), divided by sector tempo and wave factor. */
export const DIVE_TRIGGER_MIN = 2; // tunable
export const DIVE_TRIGGER_MAX = 4; // tunable

/** flagship alert timing (plan): 20 s grace, 5 s alert, then bolts. */
export const ALERT_GRACE_MS = 20_000;
export const ALERT_DURATION_MS = 5_000;
export const MAX_FLAGSHIPS = 16;

/** Formation animation: alternate between frame A and frame B every
 *  ANIM_INTERVAL seconds, synchronously across the whole formation. */
const ANIM_INTERVAL = 0.5; // tunable

export interface AlienCell {
  row: number;
  col: number;
  type: AlienTypeName;
  alive: boolean;
  /** true while part of the formation grid */
  inFormation: boolean;
  /** dive progress 0..1 */
  diveT: number;
  diveDur: number;
  p0x: number;
  p0y: number;
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  bombDropped: boolean;
  spriteIdx: number;
  flash: number;
}

export interface FlagshipEnt {
  index: number;
  alive: boolean;
  /** flagships are stationary in the top row; dive state when attacking */
  diving: boolean;
  diveT: number;
  diveDur: number;
  p0x: number;
  p0y: number;
  p1x: number;
  p1y: number;
  p2x: number;
  p2y: number;
  bombDropped: boolean;
  x: number;
  flash: number;
}

export interface EscortEnt {
  x: number;
  alive: boolean;
  flying: boolean; // diving with its flagship
  flash: number;
}

export interface DiveCallbacks {
  onDiveChirp: (type: AlienTypeName) => void;
  onBombDropped: (x: number, y: number) => void;
  onAlienShot: () => void;
  onBolt: (x: number, y: number, drift: number) => void;
}

const ALIEN_SHOT_MIN = 1.4; // s between alien shots (base; tunable)
const ALIEN_SHOT_MAX = 3.2;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class Aliens {
  cells: AlienCell[] = [];
  flagships: FlagshipEnt[] = [];
  escorts: EscortEnt[] = [];
  private time = 0;
  private animTime = 0;
  private oscPhase = 0;
  /** formation left-edge base x (center 64 minus half width) */
  private baseX = 64 - (FORMATION_COLS * COL_PITCH) / 2;
  private diveTimer = 2;
  private shotTimer = 2;
  /** milliseconds since a flagship was destroyed (alert cycle) */
  flagshipTimer = 0;
  /** true while the two-tone alert is sounding */
  alertActive = false;
  /** last bolt fire timestamp (for the post-200k periodic bolts) */
  private boltTimer = 0;
  private escalationF = 0;

  private readonly flagshipsAtStart: number;
  private readonly diveTempo: number;
  private readonly waveIndex: number;
  private readonly cb: DiveCallbacks;
  /** per-sector 200k escalation threshold (see meta/campaign.ts) */
  private readonly escalationThreshold: number;
  /** per-sector flagship-row growth step */
  private readonly escalationStep: number;

  constructor(
    flagshipsAtStart: number,
    diveTempo: number,
    waveIndex: number,
    cb: DiveCallbacks,
    escalationThreshold: number = ESCALATION_SCORE,
    escalationStep: number = ESCALATION_STEP,
  ) {
    this.flagshipsAtStart = flagshipsAtStart;
    this.diveTempo = diveTempo;
    this.waveIndex = waveIndex;
    this.cb = cb;
    this.escalationThreshold = escalationThreshold;
    this.escalationStep = escalationStep;
    for (let row = 0; row < FORMATION_ROWS; row++) {
      for (let col = 0; col < FORMATION_COLS; col++) {
        this.cells.push({
          row,
          col,
          type: ROW_TYPES[row] ?? "scout",
          alive: true,
          inFormation: true,
          diveT: 0,
          diveDur: 1.5,
          p0x: 0,
          p0y: 0,
          p1x: 0,
          p1y: 0,
          p2x: 0,
          p2y: 0,
          bombDropped: false,
          spriteIdx: row,
          flash: 0,
        });
      }
    }
    this.buildFlagshipRow(this.flagshipsAtStart);
  }

  /** Formation oscillation offset in blocks. */
  get oscOffset(): number {
    return Math.sin(this.oscPhase) * OSC_AMPLITUDE;
  }

  cellFormationX(c: AlienCell): number {
    return this.baseX + this.oscOffset + c.col * COL_PITCH;
  }

  cellFormationY(c: AlienCell): number {
    return FORMATION_Y + c.row * ROW_PITCH;
  }

  get formationCleared(): boolean {
    return this.cells.every((c) => !c.alive || !c.inFormation);
  }

  get anyAliveFlagShip(): boolean {
    return this.flagships.some((f) => f.alive && !f.diving);
  }

  private buildFlagshipRow(f: number): void {
    const flagships = Math.min(f, MAX_FLAGSHIPS);
    this.flagships = [];
    this.escorts = [];
    this.escalationF = flagships;
    if (flagships <= 4) {
      // Groups of [Bodyguard, Flagship, Bodyguard] — traced from screenshots.
      const groupPitch = 30;
      const total = flagships * 3;
      const startX = (FB_W - (total - 1) * 10 - 7) / 2;
      for (let i = 0; i < flagships; i++) {
        const gx = startX + i * groupPitch;
        this.escorts.push({ x: gx, alive: true, flying: false, flash: 0 });
        this.flagships.push({
          index: i, alive: true, diving: false, diveT: 0, diveDur: 1.5,
          p0x: 0, p0y: 0, p1x: 0, p1y: 0, p2x: 0, p2y: 0, bombDropped: false,
          x: gx + 10, flash: 0,
        });
        this.escorts.push({ x: gx + 20, alive: true, flying: false, flash: 0 });
      }
    } else {
      // Row of flagships only (the row cannot fit escorts once full).
      const pitch = Math.max(8, Math.floor(112 / flagships));
      const startX = (FB_W - (flagships - 1) * pitch - 7) / 2;
      for (let i = 0; i < flagships; i++) {
        this.flagships.push({
          index: i, alive: true, diving: false, diveT: 0, diveDur: 1.5,
          p0x: 0, p0y: 0, p1x: 0, p1y: 0, p2x: 0, p2y: 0, bombDropped: false,
          x: startX + i * pitch, flash: 0,
        });
      }
    }
    this.flagshipTimer = 0;
    this.alertActive = false;
    sound.stopAlert();
  }

  /** Grow the flagship row toward the max (200k escalation). */
  escalateFlagships(score: number): void {
    if (score < this.escalationThreshold) return;
    const extra = Math.floor((score - this.escalationThreshold) / this.escalationStep);
    const target = Math.min(MAX_FLAGSHIPS, this.escalationF + extra);
    const current = this.flagships.filter((f) => f.alive).length;
    if (target <= current || target <= this.flagships.length) return;
    // Append new flagships, then re-lay the whole alive row at a uniform pitch
    // (an append-only layout would overlap as the row fills).
    const startX = (FB_W - (target - 1) * 10 - 7) / 2;
    for (let i = this.flagships.length; i < target; i++) {
      this.flagships.push({
        index: i, alive: true, diving: false, diveT: 0, diveDur: 1.5,
        p0x: 0, p0y: 0, p1x: 0, p1y: 0, p2x: 0, p2y: 0, bombDropped: false,
        x: startX + i * 10, flash: 0,
      });
    }
    const alive = this.flagships.filter((f) => f.alive);
    const pitch = Math.max(8, Math.floor(112 / alive.length));
    const ax = (FB_W - (alive.length - 1) * pitch - 7) / 2;
    alive.forEach((f, i) => {
      f.x = ax + i * pitch;
    });
    // Escorts only make sense while the row is sparse; drop them on growth.
    if (alive.length >= 5) {
      for (const e of this.escorts) e.alive = false;
    }
  }

  update(dt: number, score: number, shipX: number): void {
    this.time += dt;
    this.animTime += dt;
    // Formation oscillation; speed +2% per wave (after wave 1).
    const waveSpeed = 1 + 0.02 * Math.max(0, this.waveIndex - 1);
    this.oscPhase += (2 * Math.PI * dt) / OSC_PERIOD * waveSpeed;

    // Dive trigger.
    this.diveTimer -= dt;
    if (this.diveTimer <= 0) {
      this.triggerDive(shipX);
      this.diveTimer =
        (DIVE_TRIGGER_MIN + Math.random() * (DIVE_TRIGGER_MAX - DIVE_TRIGGER_MIN)) /
        this.diveTempo *
        (1 - 0.05 * this.waveIndex);
    }

    // Alien straight-down shots.
    this.shotTimer -= dt;
    if (this.shotTimer <= 0 && this.cells.some((c) => c.alive && c.inFormation)) {
      this.cb.onAlienShot();
      this.shotTimer = ALIEN_SHOT_MIN + Math.random() * (ALIEN_SHOT_MAX - ALIEN_SHOT_MIN);
    }

    // Flagship alert cycle.
    this.flagshipTimer += dt * 1000;
    if (!this.alertActive && this.anyAliveFlagShip) {
      if (score >= this.escalationThreshold || this.flagshipTimer >= ALERT_GRACE_MS) {
        this.alertActive = true;
        sound.startAlert();
      }
    }
    if (this.alertActive) {
      if (score < this.escalationThreshold && this.flagshipTimer >= ALERT_GRACE_MS + ALERT_DURATION_MS) {
        this.fireBolts(shipX);
        this.flagshipTimer = 0;
        this.alertActive = false;
        sound.stopAlert();
      } else if (score >= this.escalationThreshold) {
        this.boltTimer += dt * 1000;
        if (this.boltTimer >= ALERT_DURATION_MS) {
          this.fireBolts(shipX);
          this.boltTimer = 0;
        }
      }
    }

    this.updateDivers(dt);

    // Flash decay.
    for (const c of this.cells) c.flash = Math.max(0, c.flash - dt);
    for (const f of this.flagships) f.flash = Math.max(0, f.flash - dt);
    for (const e of this.escorts) e.flash = Math.max(0, e.flash - dt);
  }

  private pickDiver(): AlienCell | null {
    const candidates = this.cells.filter((c) => c.alive && c.inFormation);
    if (candidates.length === 0) return null;
    // Weight toward the top rows (scouts dive more, like Galaxian).
    const weights = candidates.map((c) => 4 - c.row);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return candidates[i]!;
    }
    return candidates[candidates.length - 1]!;
  }

  private triggerDive(shipX: number): void {
    // Flagship dive: takes its two bodyguard escorts.
    const flagship = this.flagships.find((f) => f.alive && !f.diving);
    if (flagship && Math.random() < 0.4) {
      this.startFlagshipDive(flagship, shipX);
      return;
    }
    const alien = this.pickDiver();
    if (alien) this.startAlienDive(alien, shipX);
  }

  private startAlienDive(a: AlienCell, shipX: number): void {
    a.inFormation = false;
    a.diveT = 0;
    a.diveDur = DIVE_DURATION;
    a.bombDropped = false;
    a.p0x = this.cellFormationX(a);
    a.p0y = this.cellFormationY(a);
    const targetX = Math.min(FB_W - 7, Math.max(0, shipX));
    const targetY = FB_H + 6;
    a.p1x = (a.p0x + targetX) / 2;
    a.p1y = clamp((a.p0y + targetY) / 2 + DIVE_ARC, a.p0y + 2, FB_H - 4);
    a.p2x = targetX;
    a.p2y = targetY;
    this.cb.onDiveChirp(a.type);
  }

  private startFlagshipDive(f: FlagshipEnt, shipX: number): void {
    f.diving = true;
    f.diveT = 0;
    f.diveDur = FLAGSHIP_DIVE_DURATION;
    f.bombDropped = false;
    f.p0x = f.x;
    f.p0y = FLAGSHIP_Y;
    const targetX = Math.min(FB_W - 7, Math.max(0, shipX));
    const targetY = FB_H + 6;
    f.p1x = (f.p0x + targetX) / 2;
    f.p1y = clamp((FLAGSHIP_Y + targetY) / 2 + FLAGSHIP_DIVE_ARC, FLAGSHIP_Y + 2, FB_H - 4);
    f.p2x = targetX;
    f.p2y = targetY;
    // Escorts fly with their flagship (the two flanking it).
    const idx = this.flagships.indexOf(f);
    for (const e of this.escorts) {
      if (e.alive && Math.abs(e.x - f.x) <= 12) e.flying = true;
    }
    this.cb.onDiveChirp("flagship");
    void idx;
  }

  /** Position of a diver at progress t along the quadratic bezier. */
  bezier(t: number, p0: number, p1: number, p2: number): number {
    const u = 1 - t;
    return u * u * p0 + 2 * u * t * p1 + t * t * p2;
  }

  private updateDivers(dt: number): void {
    for (const c of this.cells) {
      if (c.inFormation || !c.alive) continue;
      c.diveT += dt / c.diveDur;
      if (!c.bombDropped && c.diveT >= BOMB_DROP_T) {
        c.bombDropped = true;
        const bx = this.bezier(c.diveT, c.p0x, c.p1x, c.p2x);
        const by = this.bezier(c.diveT, c.p0y, c.p1y, c.p2y);
        this.cb.onBombDropped(bx, by);
      }
      if (c.diveT >= 1) {
        // Swoop finished: kamikaze if still on screen, else return to formation.
        const y = this.bezier(1, c.p0y, c.p1y, c.p2y);
        if (y < FB_H - 2) {
          c.alive = false; // kamikaze — died below the screen edge
        } else {
          c.inFormation = true;
        }
        c.diveT = 0;
      }
    }
    for (const f of this.flagships) {
      if (!f.diving) continue;
      f.diveT += dt / f.diveDur;
      if (!f.bombDropped && f.diveT >= BOMB_DROP_T) {
        f.bombDropped = true;
        this.cb.onBombDropped(this.bezier(f.diveT, f.p0x, f.p1x, f.p2x), this.bezier(f.diveT, f.p0y, f.p1y, f.p2y));
      }
      if (f.diveT >= 1) {
        const y = this.bezier(1, f.p0y, f.p1y, f.p2y);
        if (y < FB_H - 2) {
          f.alive = false;
        } else {
          f.diving = false;
          f.x = this.bezier(1, f.p0x, f.p1x, f.p2x);
        }
        f.diveT = 0;
      }
    }
    for (const e of this.escorts) {
      if (e.flying) {
        // Escorts follow their flagship's dive; they return when it does.
        const f = this.flagships.find((fs) => Math.abs(fs.x - e.x) <= 12 && fs.diving);
        if (!f) e.flying = false;
      }
    }
  }

  /** All alive flagships fire a lightning bolt toward the ship. */
  private fireBolts(shipX: number): void {
    for (const f of this.flagships) {
      if (!f.alive) continue;
      const dx = (shipX + 3.5) - (f.x + 3.5);
      const drift = dx / FB_H; // drift per block descended
      this.cb.onBolt(f.x + 3, FLAGSHIP_Y + 3, drift);
    }
  }

  /** Carry the alert state across a wave refill. */
  setAlertState(active: boolean): void {
    if (active) {
      this.alertActive = true;
      sound.startAlert();
    }
  }

  /** Called when a flagship is destroyed: reset the alert cycle. */
  onFlagshipDestroyed(): void {
    this.flagshipTimer = 0;
    if (this.alertActive) {
      this.alertActive = false;
      sound.stopAlert();
    }
  }

  /** Current position of a flagship (top row or diving). */
  flagshipPos(f: FlagshipEnt): { x: number; y: number } {
    if (f.diving) {
      return {
        x: this.bezier(f.diveT, f.p0x, f.p1x, f.p2x),
        y: this.bezier(f.diveT, f.p0y, f.p1y, f.p2y),
      };
    }
    return { x: f.x, y: FLAGSHIP_Y };
  }

  escortPos(e: EscortEnt): { x: number; y: number } {
    if (e.flying) {
      const f = this.flagships.find((fs) => Math.abs(fs.x - e.x) <= 12 && fs.diving);
      if (f) {
        const t = f.diveT;
        const side = e.x < f.x ? -1 : 1;
        return {
          x: this.bezier(t, f.p0x, f.p1x, f.p2x) + side * 7,
          y: this.bezier(t, f.p0y, f.p1y, f.p2y) + 1,
        };
      }
    }
    return { x: e.x, y: FLAGSHIP_Y };
  }

  // --- collision helpers -------------------------------------------------

  /** Collect alive cells for collision (formation + diving). */
  aliveCells(): AlienCell[] {
    return this.cells.filter((c) => c.alive);
  }

  cellRect(c: AlienCell): { x: number; y: number; w: number; h: number } {
    if (c.inFormation) {
      return { x: this.cellFormationX(c), y: this.cellFormationY(c), w: 7, h: 3 };
    }
    return {
      x: this.bezier(c.diveT, c.p0x, c.p1x, c.p2x),
      y: this.bezier(c.diveT, c.p0y, c.p1y, c.p2y),
      w: 7,
      h: 3,
    };
  }

  flagshipRect(f: FlagshipEnt): { x: number; y: number; w: number; h: number } {
    const p = this.flagshipPos(f);
    return { x: p.x, y: p.y, w: 7, h: 3 };
  }

  escortRect(e: EscortEnt): { x: number; y: number; w: number; h: number } {
    const p = this.escortPos(e);
    return { x: p.x, y: p.y, w: 7, h: 3 };
  }

  private hasFlyingEscorts(f: FlagshipEnt): boolean {
    return this.escorts.some((e) => e.alive && e.flying && Math.abs(e.x - f.x) <= 12);
  }

  spriteFor(c: AlienCell): Sprite {
    const frames = FORMATION_FRAMES[c.row];
    if (!frames) return FORMATION_FRAMES[0]?.[1] ?? BODYGUARD;
    const phase = Math.floor(this.animTime / ANIM_INTERVAL) % 2;
    return frames[phase]!;
  }

  /** Draw everything into the framebuffer (offscreen render helper). */
  draw(drawSprite: (s: Sprite, x: number, y: number) => void): void {
    for (const c of this.cells) {
      if (!c.alive) continue;
      const s = this.spriteFor(c);
      if (c.inFormation) {
        drawSprite(s, this.cellFormationX(c), this.cellFormationY(c));
      } else {
        drawSprite(s, this.bezier(c.diveT, c.p0x, c.p1x, c.p2x), this.bezier(c.diveT, c.p0y, c.p1y, c.p2y));
      }
    }
    for (const f of this.flagships) {
      if (!f.alive) continue;
      const p = this.flagshipPos(f);
      if (f.diving && this.hasFlyingEscorts(f)) {
        // The dive unit is the flagship + escort composite (traced from
        // galaxyinvasion-4.png rows 31-36); rows 0-2 = flagship (matches the
        // collision rect), rows 3-5 = escort trailing.
        drawSprite(FLAGSHIP_DIVE, p.x, p.y);
        continue;
      }
      drawSprite(FLAGSHIP, p.x, p.y);
    }
    for (const e of this.escorts) {
      if (!e.alive || e.flying) continue;
      const p = this.escortPos(e);
      drawSprite(BODYGUARD, p.x, p.y);
    }
  }
}

export type { AlienShot, Bomb, Bolt };
