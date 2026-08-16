/**
 * Boot: owns the canvas, the fixed-timestep loop, the state machine and all
 * screen orchestration.
 *
 * Loop: requestAnimationFrame -> accumulate elapsed ms (clamped to 100 ms so a
 * tab restore never teleports entities) -> run fixed 60 updates/sec -> render
 * once per rAF. Frame-rate independent at 60/120/144 Hz.
 */
import "./style.css";
import { Framebuffer, FB_W, FB_H } from "./render/framebuffer";
import { CrtRenderer } from "./render/crt";
import type { Tint } from "./render/crt";
import { drawTextCentered } from "./render/text";
import { Keyboard } from "./input/keyboard";
import { GamepadInput } from "./input/gamepad";
import { GameState, INTERSTITIAL_SECONDS, TITLE_SECONDS } from "./game/state";
import { SectorRun } from "./game/run";
import { Aliens } from "./game/aliens";
import type { Sprite } from "./render/sprites";
import { StarMap } from "./meta/starmap";
import { loadSave, saveData } from "./meta/persistence";
import type { SaveData } from "./meta/persistence";
import { music } from "./audio/music";
import { sound } from "./audio/sound";

const STEP = 1 / 60;

class Game {
  /** Debug/verification accessors. */
  fbData(): number[] {
    return Array.from(this.fb.data);
  }
  stateName(): string {
    return this.state;
  }

  private fb = new Framebuffer();
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private crt: CrtRenderer | null = null;
  private temp: HTMLCanvasElement;
  private tempCtx: CanvasRenderingContext2D;
  private keyboard = new Keyboard();
  private gamepad = new GamepadInput();
  private save: SaveData = loadSave();

  private state: GameState = GameState.Title;
  private titleTimer = 0;
  private attractTimer = 0;
  private interstitialTimer = 0;
  /** current sector run (null outside Playing) */
  run: SectorRun | null = null;
  private starmap: StarMap | null = null;
  private attractAliens: Aliens | null = null;
  private tint: Tint = "green";
  private lastT = 0;
  private acc = 0;

  constructor() {
    this.canvas = document.querySelector<HTMLCanvasElement>("#screen")!;
    this.temp = document.createElement("canvas");
    this.temp.width = FB_W;
    this.temp.height = FB_H;
    this.tempCtx = this.temp.getContext("2d")!;

    const crt = CrtRenderer.create(this.canvas);
    if (crt) {
      this.crt = crt;
    } else {
      this.crt = null;
      this.ctx2d = this.canvas.getContext("2d");
      if (this.ctx2d) this.ctx2d.imageSmoothingEnabled = false;
      console.warn("WebGL2 unavailable - falling back to plain integer upscale (no CRT effects).");
    }

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.canvas.addEventListener("click", (e) => this.onClick(e));

    // Tint selection (T key cycles green/white/amber).
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyT") {
        this.tint = this.tint === "green" ? "white" : this.tint === "white" ? "amber" : "green";
        this.crt?.setTint(this.tint);
        e.preventDefault();
      }
    });

    // First user gesture unlocks audio.
    const unlock = () => sound.unlock();
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("pointerdown", unlock, { once: true });

    requestAnimationFrame(this.frame);
  }

  private resize(): void {
    const scale = this.pickScale();
    this.canvas.width = FB_W * scale;
    this.canvas.height = FB_H * scale;
    this.canvas.style.width = `${FB_W * scale}px`;
    this.canvas.style.height = `${FB_H * scale}px`;
    this.crt?.resize(this.canvas.width, this.canvas.height);
  }

  private pickScale(): number {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.max(2, Math.min(Math.floor(vw / FB_W), Math.floor(vh / FB_H)));
    return scale;
  }

  private onClick(e: MouseEvent): void {
    sound.unlock();
    if (this.state === GameState.StarMap && this.starmap) {
      const rect = this.canvas.getBoundingClientRect();
      const scale = this.canvas.width / rect.width;
      const px = (e.clientX - rect.left) * scale;
      const blockX = (px / this.canvas.width) * FB_W;
      this.starmap.handleClick(blockX);
    }
  }

  private frame = (t: number): void => {
    const elapsed = Math.min(100, t - this.lastT);
    this.lastT = t;
    this.acc += elapsed;
    while (this.acc >= STEP * 1000) {
      this.update(STEP);
      this.acc -= STEP * 1000;
    }
    this.render();
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    switch (this.state) {
      case GameState.Title:
        this.updateTitle(dt);
        break;
      case GameState.Attract:
        this.updateAttract(dt);
        break;
      case GameState.StarMap:
        this.updateStarMap(dt);
        break;
      case GameState.Playing:
        this.updatePlaying(dt);
        break;
      case GameState.SectorClear:
      case GameState.SectorLost:
        this.updateInterstitial(dt);
        break;
      case GameState.CampaignWon:
      case GameState.CampaignLost:
        this.updateEnd(dt);
        break;
    }
  }

  private enterState(s: GameState): void {
    this.state = s;
    this.titleTimer = 0;
    this.interstitialTimer = 0;
    // A press that triggered the transition must not leak into the next screen.
    this.keyboard.drain();
    switch (s) {
      case GameState.Title:
        music.start();
        break;
      case GameState.Attract:
        music.stop();
        this.attractAliens = new Aliens(2, 1, 1, {
          onDiveChirp: () => undefined,
          onBombDropped: () => undefined,
          onAlienShot: () => undefined,
          onBolt: () => undefined,
        });
        break;
      case GameState.StarMap:
        music.stop();
        sound.stopAlert();
        this.keyboard.drain();
        this.starmap = new StarMap(this.save);
        break;
      case GameState.Playing:
        break;
      case GameState.SectorClear:
      case GameState.SectorLost:
        music.stop();
        break;
      case GameState.CampaignWon:
      case GameState.CampaignLost:
        music.stop();
        break;
    }
  }

  private updateTitle(dt: number): void {
    this.titleTimer += dt;
    if (this.keyboard.consumeAny()) {
      this.enterState(GameState.Attract);
      return;
    }
    if (this.titleTimer >= TITLE_SECONDS) {
      this.enterState(GameState.Attract);
    }
  }

  private updateAttract(dt: number): void {
    this.attractTimer += dt;
    this.attractAliens?.update(dt, 0, 64);
    if (this.keyboard.consumeAny()) {
      this.enterState(GameState.StarMap);
    }
  }

  private updateStarMap(dt: number): void {
    void dt;
    const enter = this.keyboard.consumeEnter() || this.keyboard.consumeFire() || this.gamepad.consumeFire();
    const esc = this.keyboard.consumeEscape();
    this.starmap?.update(enter, esc);
    const action = this.starmap?.pollActions() ?? null;
    if (action === "back") {
      this.enterState(GameState.Title);
    } else if (action === "launch") {
      const front = this.save.campaign.front;
      if (front >= 1 && front <= 8) {
        this.startSector(front);
      } else {
        // Terminal campaign state (front 0 lost / 9 won): Enter starts a
        // new campaign from sector 1. Lifetime best scores and stats stay.
        this.save.campaign.front = 1;
        this.save.campaign.bestFront = 1;
        saveData(this.save);
        this.startSector(1);
      }
    }
  }

  private startSector(sector: number): void {
    sound.play("transition");
    this.run = new SectorRun(sector, this.save.stats);
    this.enterState(GameState.Playing);
  }

  private updatePlaying(dt: number): void {
    if (!this.run) return;
    if (this.keyboard.consumeEscape()) {
      this.run.abandon();
      this.finishSector(this.run, true);
      return;
    }
    const fire = this.keyboard.consumeFire() || this.gamepad.consumeFire();
    this.run.update(dt, this.keyboard.left || this.gamepad.left, this.keyboard.right || this.gamepad.right, fire);

    const outcome = this.run.outcomeValue;
    if (outcome === "won" || outcome === "lost") {
      this.finishSector(this.run, false);
    }
  }

  /** Apply the campaign tug-of-war + persistence after a sector ends. */
  private finishSector(run: SectorRun, abandoned: boolean): void {
    const sector = run.sector;
    const outcome = run.outcomeValue;
    if (outcome === "won") {
      this.save.campaign.front = Math.min(9, this.save.campaign.front + 1);
      this.save.campaign.bestFront = Math.max(this.save.campaign.bestFront, this.save.campaign.front);
      this.save.bestScores[sector - 1] = Math.max(this.save.bestScores[sector - 1] ?? 0, run.score);
      this.interstitialTimer = INTERSTITIAL_SECONDS;
      this.enterState(GameState.SectorClear);
    } else if (outcome === "lost") {
      this.save.campaign.front = Math.max(0, this.save.campaign.front - 1);
      this.save.bestScores[sector - 1] = Math.max(this.save.bestScores[sector - 1] ?? 0, run.score);
      this.interstitialTimer = INTERSTITIAL_SECONDS;
      this.enterState(GameState.SectorLost);
    } else if (abandoned) {
      // Forfeit: front unchanged, no score.
      this.enterState(GameState.StarMap);
    }
    saveData(this.save);
    run.commitStats();
  }

  private updateInterstitial(dt: number): void {
    this.interstitialTimer -= dt;
    if (this.interstitialTimer <= 0) {
      if (this.save.campaign.front > 8) {
        this.enterState(GameState.CampaignWon);
      } else if (this.save.campaign.front < 1) {
        this.enterState(GameState.CampaignLost);
      } else {
        this.enterState(GameState.StarMap);
      }
    }
  }

  private updateEnd(dt: number): void {
    void dt;
    if (this.keyboard.consumeAny()) {
      this.enterState(GameState.Title);
    }
  }

  private render(): void {
    const fb = this.fb;
    switch (this.state) {
      case GameState.Title:
        this.drawTitle(fb);
        break;
      case GameState.Attract:
        this.drawAttract(fb);
        break;
      case GameState.StarMap:
        this.starmap?.draw(fb);
        break;
      case GameState.Playing:
        this.run?.draw(fb, { tint: this.tint });
        break;
      case GameState.SectorClear:
        this.drawInterstitial(fb, "SECTOR CLEAR");
        break;
      case GameState.SectorLost:
        this.drawInterstitial(fb, "SECTOR LOST");
        break;
      case GameState.CampaignWon:
        this.drawEnd(fb, "CAMPAIGN WON", "THE ENEMY CORE IS OURS");
        break;
      case GameState.CampaignLost:
        this.drawEnd(fb, "CAMPAIGN LOST", "THE HOME SECTOR HAS FALLEN");
        break;
    }

    // Present.
    const img = fb.blitToImageData();
    this.tempCtx.putImageData(img, 0, 0);
    if (this.crt) {
      this.crt.render(this.temp, true);
    } else if (this.ctx2d) {
      this.ctx2d.imageSmoothingEnabled = false;
      this.ctx2d.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx2d.drawImage(this.temp, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  private drawTitle(fb: Framebuffer): void {
    fb.clear();
    drawTextCentered(fb, 8, "GALAXY INVASION");
    drawTextCentered(fb, 15, "SECTOR DEFENSE");
    // Decorative formation line.
    const line = ".##..##..##";
    for (let i = 0; i < 8; i++) {
      for (let c = 0; c < line.length; c++) {
        if (line[c] === "#") fb.set(20 + i * 11 + c, 24, 1);
      }
    }
    drawTextCentered(fb, 34, "PRESS ANY KEY");
    drawTextCentered(fb, 41, "T: PHOSPHOR TINT");
  }

  private drawAttract(fb: Framebuffer): void {
    fb.clear();
    this.attractAliens?.draw((spr: Sprite, x: number, y: number) =>
      fb.blitSprite(x, y, spr.rows, spr.w),
    );
    drawTextCentered(fb, 44, "GALAXY INVASION");
  }

  private drawInterstitial(fb: Framebuffer, title: string): void {
    fb.clear();
    drawTextCentered(fb, 20, title);
    if (this.run) {
      drawTextCentered(fb, 27, `SCORE ${this.run.score}`);
    }
    drawTextCentered(fb, 36, `FRONT ${this.save.campaign.front}`);
    drawTextCentered(fb, 41, "PREPARE");
  }

  private drawEnd(fb: Framebuffer, title: string, sub: string): void {
    fb.clear();
    drawTextCentered(fb, 16, title);
    drawTextCentered(fb, 23, sub);
    drawTextCentered(fb, 32, `BEST ${this.save.campaign.bestFront}`);
    drawTextCentered(fb, 40, "PRESS ANY KEY");
  }
}

const game = new Game();
void game;

// Debug/verification hook: framebuffer readback (128x48 of 0/1).
declare global {
  interface Window {
    __fb?: () => number[];
    __state?: () => string;
    __game?: Game;
    __run?: () => SectorRun | null;
    __invuln?: (v: boolean) => void;
  }
}
window.__fb = () => Array.from(game.fbData());
window.__state = () => game.stateName();
window.__game = game;
window.__run = () => game.run;
window.__invuln = (v: boolean) => {
  if (game.run) game.run.testInvuln = v;
};
