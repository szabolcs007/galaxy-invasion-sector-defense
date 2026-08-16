/**
 * Star map — the only new screen the twist adds: a line of 8 sector nodes,
 * the front node highlighted, each node's per-sector best score underneath.
 * Enter/click launches the front sector; Esc returns to the title.
 *
 * Layout (finalized by the meta-layer designer at 128x48 blocks):
 *   y=2   "SECTOR DEFENSE"
 *   y=9   "FRONT SECTOR <N>" + HOME/CORE axis labels
 *   y=16  divider
 *   y=19  sector numbers 1..8
 *   y=24  node line; front node filled AND one row taller
 *   y=34  compact best scores (K-format, never overlaps the 16-block pitch)
 *   y=43  prompt
 */
import { Framebuffer, FB_W } from "../render/framebuffer";
import { drawHLine, drawNode, drawText, drawTextCentered } from "../render/text";
import { SECTORS } from "./campaign";
import type { SaveData } from "./persistence";

export class StarMap {
  private save: SaveData;
  private launchQueued = false;
  private backQueued = false;

  constructor(save: SaveData) {
    this.save = save;
  }

  /** Feed input; returns the sector to launch (0 = none). */
  update(enterPressed: boolean, escPressed: boolean): void {
    if (enterPressed) this.launchQueued = true;
    if (escPressed) this.backQueued = true;
  }

  /** Consume queued actions (called once per frame by the driver). */
  pollActions(): "launch" | "back" | null {
    if (this.backQueued) {
      this.backQueued = false;
      return "back";
    }
    if (this.launchQueued) {
      this.launchQueued = false;
      return "launch";
    }
    return null;
  }

  /** Mouse/touch click support: a click on the front node launches. */
  handleClick(blockX: number): void {
    const front = this.save.campaign.front;
    if (front < 1 || front > SECTORS) return;
    const nodeX = this.nodeX(front);
    if (Math.abs(blockX - (nodeX + 1.5)) <= 5) {
      this.launchQueued = true;
    }
  }

  private nodeX(sector: number): number {
    const pitch = Math.floor((FB_W - 16) / (SECTORS - 1));
    return 8 + (sector - 1) * pitch;
  }

  draw(fb: Framebuffer): void {
    fb.clear();
    const front = this.save.campaign.front;
    const pitch = Math.floor((FB_W - 16) / (SECTORS - 1));

    drawTextCentered(fb, 2, "SECTOR DEFENSE");

    // Status + HOME/CORE axis on one row (direction legibility).
    if (front === 0) {
      drawTextCentered(fb, 9, "HOME SECTOR LOST");
    } else if (front > SECTORS) {
      drawTextCentered(fb, 9, "ENEMY CORE CLEARED");
    } else {
      drawTextCentered(fb, 9, `FRONT SECTOR ${front}`);
    }
    drawText(fb, 2, 9, "HOME");
    drawText(fb, 110, 9, "CORE");

    drawHLine(fb, 20, FB_W - 21, 16);

    // Sector numbers above the nodes.
    for (let s = 1; s <= SECTORS; s++) {
      drawText(fb, 8 + (s - 1) * pitch + 1, 19, String(s));
    }

    // Node line: baseline, then nodes; front node is filled and taller.
    drawHLine(fb, 8, 8 + (SECTORS - 1) * pitch, 26);
    for (let s = 1; s <= SECTORS; s++) {
      const x = 8 + (s - 1) * pitch;
      const isFront = s === front;
      drawNode(fb, x, 24, isFront, isFront ? 5 : 4);
    }

    // Best scores beneath the nodes (compact so the 16-block pitch never
    // overlaps).
    for (let s = 1; s <= SECTORS; s++) {
      const x = 8 + (s - 1) * pitch;
      const label = formatScore(this.save.bestScores[s - 1] ?? 0);
      const w = label.length * 4 - 1;
      drawText(fb, x + 2 - Math.floor(w / 2), 34, label);
    }

    if (front === 0 || front > SECTORS) {
      drawTextCentered(fb, 43, "ENTER NEW CAMPAIGN  ESC TITLE");
    } else {
      drawTextCentered(fb, 43, "ENTER LAUNCH  ESC TITLE");
    }
  }
}

/** Compact score label: "-" unplayed, raw below 1000, else "24K" style.
 *  Max width 4 glyphs ("100K" = 15 blocks) fits the 16-block node pitch. */
function formatScore(v: number): string {
  if (v <= 0) return "-";
  if (v < 1000) return String(v);
  return `${Math.round(v / 1000)}K`; // tunable
}
