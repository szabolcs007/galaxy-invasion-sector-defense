/**
 * 1-bit audio — square-wave SFX inventory.
 *
 * The original toggled the cassette output line (CASOUT port 0xFF bit 0 on the
 * Model I), producing raw square waves. We reproduce that with WebAudio square
 * OscillatorNodes through a click-free gain envelope:
 *   osc(square) -> gain (5 ms attack, 15 ms release) -> master -> compressor -> out
 *
 * Frequencies stay in the 200-2000 Hz range (the original's practical
 * square-wave band via the cassette-output line).
 *
 * The AudioContext is created lazily on the first user gesture (call
 * `unlock()` from a keydown/click handler); `resume()` is invoked then.
 */
export type SfxName =
  | "shot"
  | "diveScout"
  | "diveWarrior"
  | "diveBodyguard"
  | "diveFlagship"
  | "transition"
  | "flagshipAlert"
  | "explosion"
  | "extraShip";

interface SfxDef {
  /** start frequency in Hz */
  f0: number;
  /** end frequency in Hz (sweep target; same = steady tone) */
  f1: number;
  /** duration in ms */
  durMs: number;
  /** repeat while active (flagship alert) */
  loop?: boolean;
}

/** Tunable sound inventory. Tuned by the audio specialist against a reference
 *  gameplay video (YouTube SAPPvqsc5V4): shot ~860 Hz blip, dives 340-560 Hz
 *  downward sweeps, explosion low boom; alert kept as the locked 660/440
 *  two-tone (the original's ~2.15 kHz constant exceeds the locked 2000 Hz
 *  band). */
export const SFX: Record<SfxName, SfxDef> = {
  shot: { f0: 880, f1: 880, durMs: 40 },
  diveScout: { f0: 600, f1: 400, durMs: 200 },
  diveWarrior: { f0: 500, f1: 300, durMs: 200 },
  diveBodyguard: { f0: 400, f1: 250, durMs: 200 },
  diveFlagship: { f0: 700, f1: 350, durMs: 200 },
  transition: { f0: 220, f1: 220, durMs: 80 },
  flagshipAlert: { f0: 660, f1: 440, durMs: 240, loop: true },
  explosion: { f0: 200, f1: 80, durMs: 150 },
  extraShip: { f0: 660, f1: 990, durMs: 200 },
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** interval handle for the looping flagship alert */
  private alertTimer: number | null = null;

  /** Create/resume the AudioContext; must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 12;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(comp);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private get ready(): boolean {
    return this.ctx !== null && this.master !== null;
  }

  /** Current context time in seconds (0 if the context was never created). */
  currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * Schedule a bare square tone (used by the music lookahead scheduler).
   * `at` is in context time seconds.
   */
  scheduleSquare(freqHz: number, at: number, durSec: number, level = 0.35): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freqHz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.004);
    g.gain.setValueAtTime(level, at + Math.max(0.004, durSec - 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, at + durSec);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(at);
    osc.stop(at + durSec + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** Play one shot. `when` (ctx time) optional for scheduling. */
  play(name: SfxName, when?: number): void {
    if (!this.ready) return;
    const def = SFX[name];
    const ctx = this.ctx!;
    const t0 = when ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(def.f0, t0);
    if (def.f1 !== def.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(def.f1, 1), t0 + def.durMs / 1000);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.005);
    g.gain.setValueAtTime(0.5, t0 + Math.max(0.005, def.durMs / 1000 - 0.015));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + def.durMs / 1000);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + def.durMs / 1000 + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  /** Start the looping flagship alert (alternating 660/440 Hz). No-op if active. */
  startAlert(): void {
    if (!this.ready || this.alertTimer !== null) return;
    const def = SFX.flagshipAlert;
    const halfSec = def.durMs / 2 / 1000;
    const playCycle = () => {
      if (!this.ready) return;
      const ctx = this.ctx!;
      const t0 = ctx.currentTime;
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = i === 0 ? def.f0 : def.f1;
        const g = ctx.createGain();
        const t = t0 + i * halfSec;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + halfSec - 0.01);
        osc.connect(g);
        g.connect(this.master!);
        osc.start(t);
        osc.stop(t + halfSec);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
      }
    };
    playCycle();
    this.alertTimer = window.setInterval(playCycle, def.durMs);
  }

  /** Stop the looping flagship alert. */
  stopAlert(): void {
    if (this.alertTimer !== null) {
      window.clearInterval(this.alertTimer);
      this.alertTimer = null;
    }
  }
}

export const sound = new SoundManager();
