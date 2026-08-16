/**
 * Projectiles: the player's single shot, alien straight-down shots, bombs
 * dropped by diving aliens, and Flagship lightning bolts.
 *
 * Collision is block-axis aligned: an entity occupies the block rect of its
 * sprite (player shot 1x1, alien shot 1x1, bomb 2x2, bolt 1x1 head).
 */
import { FB_H } from "../render/framebuffer";
import { BOMB, LIGHTNING_HEAD } from "../render/sprites";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const SHOT_SPEED = 220; // tunable
export const ALIEN_SHOT_SPEED = 100; // tunable
export const BOMB_SPEED = 24; // tunable
export const BOLT_SPEED = 120; // tunable

export class PlayerShot {
  x: number;
  y: number;
  active = true;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  update(dt: number): void {
    this.y -= SHOT_SPEED * dt;
    if (this.y < 0) this.active = false;
  }
  rect(): Rect {
    return { x: this.x, y: this.y, w: 1, h: 2 };
  }
}

export class AlienShot {
  x: number;
  y: number;
  active = true;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  update(dt: number): void {
    this.y += ALIEN_SHOT_SPEED * dt;
    if (this.y > FB_H) this.active = false;
  }
  rect(): Rect {
    return { x: this.x, y: this.y, w: 1, h: 2 };
  }
}

export class Bomb {
  x: number;
  y: number;
  active = true;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  update(dt: number): void {
    this.y += BOMB_SPEED * dt;
    if (this.y > FB_H) this.active = false;
  }
  rect(): Rect {
    return { x: this.x, y: this.y, w: BOMB.w, h: BOMB.h };
  }
}

/** Flagship lightning bolt: always fatal on contact. */
export class Bolt {
  x: number;
  y: number;
  /** horizontal drift per block descended (e.g. 0.6 = angles right) */
  drift: number;
  active = true;
  speed = BOLT_SPEED; // blocks/sec along the diagonal
  constructor(x: number, y: number, drift: number) {
    this.x = x;
    this.y = y;
    this.drift = drift;
  }
  update(dt: number): void {
    const d = this.speed * dt;
    this.y += d;
    this.x += d * this.drift;
    if (this.y > FB_H + 2) this.active = false;
  }
  rect(): Rect {
    return { x: this.x - 1, y: this.y - 1, w: LIGHTNING_HEAD.w - 2, h: LIGHTNING_HEAD.h };
  }
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
