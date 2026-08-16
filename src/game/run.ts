/**
 * SectorRun — one playable sector: ship, formation, flagships, projectiles,
 * scoring, extra ships, wave progression, win/lose rules.
 *
 * A sector is won by clearing WAVES_PER_SECTOR waves and lost when all ships
 * are destroyed (sector-retry: the campaign only retreats one step).
 */
import { Framebuffer, FB_H, FB_W } from "../render/framebuffer";
import { BOMB, EXPLOSION, LIGHTNING_HEAD, SHIP } from "../render/sprites";
import type { Sprite } from "../render/sprites";
import { drawText } from "../render/text";
import { sound } from "../audio/sound";
import { Ship, SHIP_Y } from "./ship";
import {
  AlienShot,
  Bomb,
  Bolt,
  PlayerShot,
  rectsOverlap,
} from "./shots";
import type { Rect } from "./shots";
import { Aliens } from "./aliens";
import type { AlienCell } from "./aliens";
import { ALERT_GRACE_MS } from "./aliens";
import {
  EXTRA_SHIP_EVERY,
  pointsFor,
  START_SHIPS,
} from "./scoring";
import type { AlienTypeName } from "./scoring";
import {
  diveTempoForSector,
  escalationStepForSector,
  escalationThresholdForSector,
  flagshipsForSector,
  scoreMultiplierForSector,
  WAVES_PER_SECTOR,
} from "../meta/campaign";

export type RunOutcome = "won" | "lost" | "abandoned";

/** Respawn delay after death (s): explosion plays out, player re-orients. */
const SHIP_RESPAWN_DELAY = 1.6; // tunable
/** Invulnerability after respawn (s), with the 12 Hz blink. */
const SHIP_INVULN = 1.2; // tunable

interface Explosion {
  x: number;
  y: number;
  t: number;
  big: boolean;
}

export class SectorRun {
  score = 0;
  lives = START_SHIPS;
  waveIndex = 1;
  /** verification hook only — never set by gameplay */
  testInvuln = false;
  /** recent score events (type, attacking, points) for verification */
  scoreEvents: { type: AlienTypeName; attacking: boolean; pts: number; t: number }[] = [];
  ship: Ship;
  aliens: Aliens;
  playerShot: PlayerShot | null = null;
  alienShots: AlienShot[] = [];
  bombs: Bomb[] = [];
  bolts: Bolt[] = [];
  private explosions: Explosion[] = [];
  private extraShipNext = EXTRA_SHIP_EVERY;
  private shipDeadTimer = 0;
  private invuln = 0;
  private waveClearedTimer = 0;
  private waveCleared = false;
  private outcome: RunOutcome | null = null;
  /** alert was active at least once (for the verification stats) */
  private flagshipEscapeFired = false;
  /** keep a reference to the save stats for mutation on exit */
  private pendingStats: { flagshipEscapes: number } = { flagshipEscapes: 0 };

  readonly sector: number;
  private readonly stats: {
    flagshipEscapes: number;
    sectorsWon: number;
    sectorsLost: number;
  };

  constructor(
    sector: number,
    stats: { flagshipEscapes: number; sectorsWon: number; sectorsLost: number },
  ) {
    this.sector = sector;
    this.stats = stats;
    const flagships = flagshipsForSector(sector);
    const tempo = diveTempoForSector(sector); // wave factor applied inside aliens.ts
    this.ship = new Ship(undefined, () => this.fire());
    this.aliens = new Aliens(flagships, tempo, this.waveIndex, this.aliensCallbacks(), escalationThresholdForSector(this.sector), escalationStepForSector(this.sector));
  }

  get outcomeValue(): RunOutcome | null {
    return this.outcome;
  }

  /** Commit per-run stat deltas into the campaign save stats. */
  commitStats(): void {
    this.stats.flagshipEscapes += this.pendingStats.flagshipEscapes;
  }

  private aliensCallbacks(): ConstructorParameters<typeof Aliens>[3] {
    return {
      onDiveChirp: (t) => this.chirp(t),
      onBombDropped: (x, y) => this.bombs.push(new Bomb(x, y)),
      onAlienShot: () => this.spawnAlienShot(),
      onBolt: (x, y, drift) => {
        this.bolts.push(new Bolt(x, y, drift));
        if (!this.flagshipEscapeFired) {
          this.flagshipEscapeFired = true;
          this.pendingStats.flagshipEscapes++;
        }
      },
    };
  }

  private chirp(t: AlienTypeName): void {
    switch (t) {
      case "scout":
        sound.play("diveScout");        break;
      case "warrior":
        sound.play("diveWarrior");
        break;
      case "bodyguard":
        sound.play("diveBodyguard");
        break;
      case "flagship":
        sound.play("diveFlagship");
        break;
    }
  }

  private fire(): boolean {
    if (this.playerShot) return false; // one shot at a time
    this.playerShot = new PlayerShot(this.ship.x + SHIP.w / 2 - 0.5, SHIP_Y - 2);
    sound.play("shot");
    return true;
  }

  private spawnAlienShot(): void {
    const shooters = this.aliens.cells.filter((c) => c.alive && c.inFormation);
    if (shooters.length === 0) return;
    const c = shooters[Math.floor(Math.random() * shooters.length)]!;
    const x = this.aliens.cellFormationX(c);
    const y = this.aliens.cellFormationY(c);
    this.alienShots.push(new AlienShot(x + 3, y + 3));
  }

  update(dt: number, left: boolean, right: boolean, fire: boolean): void {
    if (this.outcome === "won" || this.outcome === "lost") {
      // Brief interstitial is handled by the driver; nothing to update here.
      return;
    }

    // Ship control.
    if (this.shipDeadTimer > 0) {
      this.shipDeadTimer -= dt;
      if (this.shipDeadTimer <= 0) {
        if (this.lives > 0) {
          this.ship.alive = true;
          this.ship.x = (FB_W - SHIP.w) / 2;
          this.invuln = SHIP_INVULN;
        } else {
          this.outcome = "lost";
          this.commitStats();
          this.stats.sectorsLost++;
          sound.play("transition");
          return;
        }
      }
    } else {
      this.ship.update(dt, left, right);
      if (fire && this.ship.tryFire()) {
        /* shot created */
      }
      this.invuln = Math.max(0, this.invuln - dt);
    }

    // Aliens (formation, dives, alert, escalation).
    this.aliens.update(dt, this.score, this.ship.centerX);
    this.aliens.escalateFlagships(this.score);

    // Projectiles.
    if (this.playerShot) {
      this.playerShot.update(dt);
      if (!this.playerShot.active) this.playerShot = null;
    }
    for (const s of this.alienShots) s.update(dt);
    for (const b of this.bombs) b.update(dt);
    for (const bolt of this.bolts) bolt.update(dt);
    this.alienShots = this.alienShots.filter((s) => s.active);
    this.bombs = this.bombs.filter((b) => b.active);
    this.bolts = this.bolts.filter((b) => b.active);

    // Collisions.
    this.collideShots();
    this.collideShip();

    // Explosion timers.
    for (const e of this.explosions) e.t -= dt;
    this.explosions = this.explosions.filter((e) => e.t > 0);

    // Wave progression.
    if (this.aliens.formationCleared && !this.waveCleared) {
      this.waveCleared = true;
      this.waveClearedTimer = 1.2;
      sound.play("transition");
    }
    if (this.waveCleared) {
      this.waveClearedTimer -= dt;
      if (this.waveClearedTimer <= 0) {
        this.waveCleared = false;
        if (this.waveIndex >= WAVES_PER_SECTOR) {
          this.outcome = "won";
          this.commitStats();
          this.stats.sectorsWon++;
          sound.play("transition");
        } else {
          this.waveIndex++;
          this.refillFormation();
        }
      }
    }
  }

  private refillFormation(): void {
    const flagships = flagshipsForSector(this.sector);
    const tempo = diveTempoForSector(this.sector); // wave factor applied inside aliens.ts
    // Keep the flagship row state; rebuild the alien grid with the new wave.
    const old = this.aliens;
    this.aliens = new Aliens(flagships, tempo, this.waveIndex, this.aliensCallbacks(), escalationThresholdForSector(this.sector), escalationStepForSector(this.sector));
    // Carry the flagship row (persistent across waves within a sector).
    this.aliens.flagships = old.flagships;
    this.aliens.escorts = old.escorts;
    this.aliens.setAlertState(old.alertActive);
  }

  private collideShots(): void {
    if (!this.playerShot) return;
    const shot = this.playerShot;
    const sr = shot.rect();

    // vs formation aliens (formation or diving).
    for (const c of this.aliens.aliveCells()) {
      if (rectsOverlap(sr, this.aliens.cellRect(c))) {
        this.destroyAlien(c);
        shot.active = false;
        this.playerShot = null;
        return;
      }
    }
    // vs escorts.
    for (const e of this.aliens.escorts) {
      if (!e.alive) continue;
      if (rectsOverlap(sr, this.aliens.escortRect(e))) {
        e.alive = false;
        this.addScore("bodyguard", e.flying);
        this.explosions.push({ x: this.aliens.escortPos(e).x, y: this.aliens.escortPos(e).y, t: 0.35, big: false });
        sound.play("explosion");
        shot.active = false;
        this.playerShot = null;
        return;
      }
    }
    // vs flagships.
    for (const f of this.aliens.flagships) {
      if (!f.alive) continue;
      if (rectsOverlap(sr, this.aliens.flagshipRect(f))) {
        f.alive = false;
        this.aliens.onFlagshipDestroyed();
        this.addScore("flagship", f.diving);
        this.explosions.push({ x: this.aliens.flagshipPos(f).x, y: this.aliens.flagshipPos(f).y, t: 0.5, big: true });
        sound.play("explosion");
        shot.active = false;
        this.playerShot = null;
        return;
      }
    }
  }

  private destroyAlien(c: AlienCell): void {
    c.alive = false;
    const attacking = !c.inFormation;
    this.addScore(c.type, attacking);
    const r = this.aliens.cellRect(c);
    this.explosions.push({ x: r.x, y: r.y, t: 0.3, big: false });
    sound.play("explosion");
  }

  private addScore(type: AlienTypeName, attacking: boolean): void {
    const pts = pointsFor(type, attacking, scoreMultiplierForSector(this.sector));
    this.score += pts;
    this.scoreEvents.push({ type, attacking, pts, t: performance.now() });
    if (this.scoreEvents.length > 12) this.scoreEvents.shift();
    if (this.score >= this.extraShipNext) {
      this.extraShipNext += EXTRA_SHIP_EVERY;
      this.lives++;
      sound.play("extraShip");
    }
  }

  private collideShip(): void {
    if (!this.ship.alive || this.invuln > 0) return;
    if (this.testInvuln) return; // verification hook only
    const shipRect: Rect = { x: this.ship.x, y: SHIP_Y, w: SHIP.w, h: SHIP.h };

    for (const s of this.alienShots) {
      if (rectsOverlap(shipRect, s.rect())) {
        s.active = false;
        this.killShip();
        return;
      }
    }
    for (const b of this.bombs) {
      if (rectsOverlap(shipRect, b.rect())) {
        b.active = false;
        this.killShip();
        return;
      }
    }
    for (const bolt of this.bolts) {
      if (rectsOverlap(shipRect, bolt.rect())) {
        bolt.active = false;
        this.killShip();
        return;
      }
    }
    // Diving aliens kamikaze into the ship.
    for (const c of this.aliens.aliveCells()) {
      if (c.inFormation) continue;
      if (rectsOverlap(shipRect, this.aliens.cellRect(c))) {
        c.alive = false;
        this.explosions.push({ x: this.aliens.cellRect(c).x, y: this.aliens.cellRect(c).y, t: 0.35, big: false });
        this.killShip();
        return;
      }
    }
    // Diving flagships kamikaze into the ship.
    for (const f of this.aliens.flagships) {
      if (!f.alive || !f.diving) continue;
      if (rectsOverlap(shipRect, this.aliens.flagshipRect(f))) {
        f.alive = false;
        this.aliens.onFlagshipDestroyed();
        this.explosions.push({ x: this.aliens.flagshipPos(f).x, y: this.aliens.flagshipPos(f).y, t: 0.5, big: true });
        this.killShip();
        return;
      }
    }
  }

  private killShip(): void {
    this.ship.alive = false;
    this.lives--;
    this.explosions.push({ x: this.ship.x, y: SHIP_Y, t: 0.6, big: true });
    sound.play("explosion");
    this.shipDeadTimer = SHIP_RESPAWN_DELAY;
    this.playerShot = null;
    // Clear threats near the wreck (grace).
    this.alienShots = [];
    this.bombs = [];
    this.bolts = [];
  }

  /** Abandon the run (Escape): forfeit, no score recorded. */
  abandon(): void {
    this.outcome = "abandoned";
    this.commitStats();
    sound.stopAlert();
  }

  draw(fb: Framebuffer, ctx: { tint: string }): void {
    fb.clear();

    // Aliens.
    this.aliens.draw((spr: Sprite, x: number, y: number) => fb.blitSprite(x, y, spr.rows, spr.w));

    // Projectiles.
    if (this.playerShot) {
      fb.set(Math.round(this.playerShot.x), Math.round(this.playerShot.y), 1);
      fb.set(Math.round(this.playerShot.x), Math.round(this.playerShot.y) + 1, 1);
    }
    for (const s of this.alienShots) {
      fb.set(Math.round(s.x), Math.round(s.y), 1);
      fb.set(Math.round(s.x), Math.round(s.y) + 1, 1);
    }
    for (const b of this.bombs) {
      fb.blitSprite(b.x, b.y, BOMB.rows, BOMB.w);
    }
    for (const bolt of this.bolts) {
      this.drawBolt(fb, bolt);
    }

    // Explosions.
    for (const e of this.explosions) {
      const t = e.t / (e.big ? 0.6 : 0.35);
      fb.blitSprite(e.x, e.y, EXPLOSION.rows, EXPLOSION.w);
      if (t < 0.5) fb.set(Math.round(e.x + 1), Math.round(e.y + 1), 1);
    }

    // Ship (blink while invulnerable).
    if (this.ship.alive) {
      if (this.invuln <= 0 || Math.floor(this.invuln * 12) % 2 === 0) {
        fb.blitSprite(this.ship.x, SHIP_Y, SHIP.rows, SHIP.w);
      }
    }

    // HUD.
    drawText(fb, 1, 0, `S${this.sector} W${this.waveIndex}`);
    drawText(fb, 1, 1, `${this.score}`);
    for (let i = 0; i < this.lives && i < 6; i++) {
      fb.blitSprite(FB_W - 6 - i * 7, 0, SHIP.rows, SHIP.w);
    }
    void ctx;
  }

  private drawBolt(fb: Framebuffer, bolt: Bolt): void {
    // Zigzag tail: 1-block cells alternating horizontal offset, plus the
    // traced 5x2 LIGHTNING_HEAD at the tip (galaxyinvasion-6.png strike tip).
    const headY = Math.round(bolt.y);
    const headX = Math.round(bolt.x);
    fb.blitSprite(headX - 2, headY, LIGHTNING_HEAD.rows, LIGHTNING_HEAD.w);
    let x = headX;
    for (let y = headY + 2; y < FB_H && y < headY + 14; y++) {
      x = Math.round(headX - (y - headY) * bolt.drift * 0.7);
      fb.set(x, y, 1);
    }
  }

  /** Exposed for the verification: current alert timing state. */
  alertInfo(): { graceMs: number; alertActive: boolean } {
    return {
      graceMs: ALERT_GRACE_MS,
      alertActive: this.aliens.alertActive,
    };
  }

  /** Used by the flagship-check verification. */
  get flagshipTimerMs(): number {
    return this.aliens.flagshipTimer;
  }
}


