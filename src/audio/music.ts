/**
 * Title-screen tune — a Galaxian-style 1-bit march, played with a lookahead
 * scheduler decoupled from the render loop.
 *
 * Each note is a square OscillatorNode scheduled via start(now)/stop(now+dur)
 * with now = ctx.currentTime + 0.1 s lookahead, driven by a 25 ms setInterval.
 * The melody is a reconstruction (the original title tune is unrecoverable
 * without the binary); it is a faithful-style 1-bit march in the 200-2000 Hz
 * band, ≤16 notes as planned.
 */
import { sound } from "./sound";

export interface Note {
  freqHz: number;
  durMs: number;
}

/** 16-note 1-bit march — composed by the audio specialist against a reference
 *  gameplay video (YouTube SAPPvqsc5V4): fundamentals 330-523 Hz at ~150 ms
 *  note density, matching the measured title melody. All tunable. */
export const TITLE_TUNE: readonly Note[] = [
  { freqHz: 523, durMs: 150 },
  { freqHz: 440, durMs: 150 },
  { freqHz: 494, durMs: 150 },
  { freqHz: 523, durMs: 300 },
  { freqHz: 523, durMs: 150 },
  { freqHz: 494, durMs: 150 },
  { freqHz: 440, durMs: 150 },
  { freqHz: 349, durMs: 300 },
  { freqHz: 330, durMs: 150 },
  { freqHz: 349, durMs: 150 },
  { freqHz: 440, durMs: 150 },
  { freqHz: 523, durMs: 300 },
  { freqHz: 494, durMs: 150 },
  { freqHz: 440, durMs: 150 },
  { freqHz: 349, durMs: 150 },
  { freqHz: 440, durMs: 450 },
];

class MusicPlayer {
  private timer: number | null = null;
  private idx = 0;
  private nextAt = 0;
  private playing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    if (this.playing) return;
    sound.unlock();
    if (!this.ctxReady()) return;
    this.playing = true;
    this.idx = 0;
    this.nextAt = this.ctxTime() + 0.1;
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop(): void {
    this.playing = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private ctxReady(): boolean {
    return (
      typeof AudioContext !== "undefined" ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext === "function"
    );
  }

  private ctxTime(): number {
    // Sound manager owns the shared context; expose its currentTime.
    return sound.currentTime();
  }

  private pump(): void {
    if (!this.playing) return;
    const now = this.ctxTime();
    while (this.idx < TITLE_TUNE.length && this.nextAt <= now + 0.1) {
      const note = TITLE_TUNE[this.idx]!;
      sound.scheduleSquare(note.freqHz, this.nextAt, note.durMs / 1000, 0.35);
      this.nextAt += note.durMs / 1000;
      this.idx++;
    }
    if (this.idx >= TITLE_TUNE.length) {
      this.stop();
    }
  }
}

export const music = new MusicPlayer();
