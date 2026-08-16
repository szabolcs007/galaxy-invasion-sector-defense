/**
 * Gamepad input. Polls navigator.getGamepads() every frame; d-pad left/right
 * or the left stick X axis moves the ship; face button 0 fires
 * (edge-triggered, mirroring the keyboard fire rule).
 */
export class GamepadInput {
  private lastButtons = new Map<number, boolean[]>();

  constructor() {
    window.addEventListener("gamepadconnected", this.onConnect);
    window.addEventListener("gamepaddisconnected", this.onDisconnect);
  }

  dispose(): void {
    window.removeEventListener("gamepadconnected", this.onConnect);
    window.removeEventListener("gamepaddisconnected", this.onDisconnect);
  }

  private onConnect = (): void => {
    this.lastButtons.clear();
  };

  private onDisconnect = (): void => {
    this.lastButtons.clear();
  };

  private pad(): globalThis.Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (p) return p;
    }
    return null;
  }

  get left(): boolean {
    const p = this.pad();
    if (!p) return false;
    const ax = p.axes[0] ?? 0;
    return (p.buttons[14]?.pressed ?? false) || ax < -0.4;
  }

  get right(): boolean {
    const p = this.pad();
    if (!p) return false;
    const ax = p.axes[0] ?? 0;
    return (p.buttons[15]?.pressed ?? false) || ax > 0.4;
  }

  /** Edge-triggered fire (face button 0), consumed by the game loop. */
  consumeFire(): boolean {
    const p = this.pad();
    if (!p) return false;
    const id = p.index;
    const prev = this.lastButtons.get(id) ?? [];
    const now = Array.from(p.buttons, (b) => b.pressed);
    this.lastButtons.set(id, now);
    return (now[0] ?? false) && !(prev[0] ?? false);
  }
}
