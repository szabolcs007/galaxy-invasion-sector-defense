/**
 * Tiny 3x5 bitmap font for HUD labels, the title screen, the star map and the
 * instruction text. Each glyph is 5 rows of 3 chars; glyph advance is 4 blocks
 * (3 + 1 gap). Case-insensitive: lowercase maps to the same glyphs.
 */
import { Framebuffer, FB_H, FB_W } from "./framebuffer";

const GLYPHS: Record<string, readonly string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
  I: ["###", ".#.", ".#.", ".#.", "###"],
  J: ["..#", "..#", "..#", "#.#", ".#."],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  M: ["#.#", "###", "#.#", "#.#", "#.#"],
  N: ["#.#", "###", "###", "#.#", "#.#"],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  P: ["##.", "#.#", "##.", "#..", "#.."],
  Q: [".#.", "#.#", "#.#", "#.#", ".##"],
  R: ["##.", "#.#", "##.", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  T: ["###", ".#.", ".#.", ".#.", ".#."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  V: ["#.#", "#.#", "#.#", "#.#", ".#."],
  W: ["#.#", "#.#", "#.#", "###", "#.#"],
  X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
  Y: ["#.#", "#.#", ".#.", ".#.", ".#."],
  Z: ["###", "..#", ".#.", "#..", "###"],
  "0": [".#.", "#.#", "#.#", "#.#", ".#."],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["##.", "..#", ".#.", "#..", "###"],
  "3": ["##.", "..#", ".##", "..#", "##."],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "##.", "..#", "##."],
  "6": [".##", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", "#..", "#.."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", ".##"],
  ".": ["...", "...", "...", "...", ".#."],
  "-": ["...", "...", "###", "...", "..."],
  ":": ["...", ".#.", "...", ".#.", "..."],
  "!": [".#.", ".#.", ".#.", "...", ".#."],
  "?": ["##.", "..#", ".#.", "...", ".#."],
  " ": ["...", "...", "...", "...", "..."],
};

const SPACE: readonly string[] = ["...", "...", "...", "...", "..."];

export const CHAR_W = 3;
export const CHAR_ADV = 4;
export const CHAR_H = 5;

export function textWidth(str: string): number {
  return str.length * CHAR_ADV - 1;
}

/** Draw text; returns the width used. `v` selects the block value (0/1). */
export function drawText(
  fb: Framebuffer,
  x: number,
  y: number,
  str: string,
  v: 0 | 1 = 1,
): number {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const g = GLYPHS[ch] ?? SPACE;
    if (v === 1) {
      fb.blitSprite(cx, y, g, CHAR_W);
    } else {
      fb.setBlock(cx, y, CHAR_W, CHAR_H, 0);
    }
    cx += CHAR_ADV;
  }
  return cx - x;
}

/** Center text horizontally; no-op if it would overflow. */
export function drawTextCentered(
  fb: Framebuffer,
  y: number,
  str: string,
  v: 0 | 1 = 1,
): void {
  const w = textWidth(str);
  const x = Math.round((FB_W - w) / 2);
  if (x < 0) return;
  drawText(fb, x, y, str, v);
}

/** Draw a 1-block horizontal line. */
export function drawHLine(fb: Framebuffer, x0: number, x1: number, y: number): void {
  for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(FB_W - 1, Math.floor(x1)); x++) {
    fb.set(x, y, 1);
  }
}

/** Draw a 1-block vertical line. */
export function drawVLine(fb: Framebuffer, x: number, y0: number, y1: number): void {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(FB_H - 1, Math.floor(y1)); y++) {
    fb.set(x, y, 1);
  }
}

/** Draw an outlined (or filled) square node marker. */
export function drawNode(
  fb: Framebuffer,
  x: number,
  y: number,
  filled: boolean,
  size = 3,
): void {
  const s = size;
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      const edge = i === 0 || j === 0 || i === s - 1 || j === s - 1;
      if (filled || edge) fb.set(x + i, y + j, 1);
    }
  }
}
