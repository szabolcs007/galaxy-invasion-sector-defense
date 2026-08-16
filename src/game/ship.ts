/**
 * Player ship: bottom row, horizontal only. Speed is tunable (the feel/flow
 * specialist pass finalizes it). Fire is edge-triggered and the game allows
 * only one shot at a time — a second fire request is ignored until the
 * current shot resolves.
 */
import { FB_W } from "../render/framebuffer";
import { SHIP } from "../render/sprites";

/** Ship speed in blocks per second (default; tunable). */
export const SHIP_SPEED = 60;
/** Ship y (top-left of its 4-row sprite). */
export const SHIP_Y = 44;
export const SHIP_W = SHIP.w;
export const SHIP_H = SHIP.h;

export class Ship {
  /** x is the sprite's top-left in blocks (may be fractional). */
  x = (FB_W - SHIP_W) / 2;
  alive = true;
  /** time until respawn (seconds); 0 = no respawn pending */
  respawnTimer = 0;
  readonly moveSpeed: number;
  private readonly onShoot: () => boolean;

  constructor(moveSpeed: number = SHIP_SPEED, onShoot: () => boolean) {
    this.moveSpeed = moveSpeed;
    this.onShoot = onShoot;
  }

  update(dt: number, left: boolean, right: boolean): void {
    if (!this.alive) return;
    const dx = (left ? -1 : 0) + (right ? 1 : 0);
    this.x += dx * this.moveSpeed * dt;
    const minX = 0;
    const maxX = FB_W - SHIP_W;
    if (this.x < minX) this.x = minX;
    if (this.x > maxX) this.x = maxX;
  }

  /** Attempt to fire; returns true if a shot was created (one-shot rule). */
  tryFire(): boolean {
    if (!this.alive) return false;
    return this.onShoot();
  }

  /** Ship center x (for collision). */
  get centerX(): number {
    return this.x + SHIP_W / 2;
  }
}
