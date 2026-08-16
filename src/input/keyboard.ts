/**
 * Keyboard input. Held keys are tracked in a Set keyed on event.code
 * (keydown adds, keyup deletes; event.repeat is ignored).
 *
 * Fire is edge-triggered on keydown — the game allows only one shot at a time,
 * so holding Space must not auto-fire.
 *
 * Escape abandons the current run and returns to the star map (forfeit, no
 * score recorded). No pause: the 1980 original had none.
 */
export class Keyboard {
  private held = new Set<string>();
  private fireQueued = false;
  private escapeQueued = false;
  private enterQueued = false;
  private anyQueued = false;

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private onDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.held.add(e.code);
    if (e.code === "Space" || e.code === "ArrowUp") {
      this.fireQueued = true;
      e.preventDefault();
    }
    if (e.code === "Escape") {
      this.escapeQueued = true;
      e.preventDefault();
    }
    if (e.code === "Enter") {
      this.enterQueued = true;
    }
    if (e.code === "Enter" || e.code === "ArrowLeft" || e.code === "ArrowRight" || e.code === "KeyA" || e.code === "KeyD" || e.code === "Space" || e.code === "ArrowUp") {
      this.anyQueued = true;
    }
  };

  private onUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private onBlur = (): void => {
    this.held.clear();
  };

  get left(): boolean {
    return this.held.has("ArrowLeft") || this.held.has("KeyA");
  }

  get right(): boolean {
    return this.held.has("ArrowRight") || this.held.has("KeyD");
  }

  /** Edge-triggered fire request (consumed by the game loop). */
  consumeFire(): boolean {
    const f = this.fireQueued;
    this.fireQueued = false;
    return f;
  }

  /** Edge-triggered Enter request (star-map launch). */
  consumeEnter(): boolean {
    const e = this.enterQueued;
    this.enterQueued = false;
    return e;
  }

  /** Clear all queued edge-triggered requests (used on screen transitions). */
  drain(): void {
    this.fireQueued = false;
    this.escapeQueued = false;
    this.enterQueued = false;
    this.anyQueued = false;
  }

  /** Edge-triggered Escape request. */
  consumeEscape(): boolean {
    const e = this.escapeQueued;
    this.escapeQueued = false;
    return e;
  }

  /** Edge-triggered "any gameplay key" request (title/attract skip). */
  consumeAny(): boolean {
    const a = this.anyQueued;
    this.anyQueued = false;
    return a;
  }
}
