/**
 * Sprite sheet — pixel-exact, traced from the trs-80.org Galaxy Invasion
 * screenshots (128x48 semigraphics block grid; one cell = one block).
 *
 * Extraction: the 280x210 PNGs were resampled onto the game's 128x48 block
 * grid (block pitch 2.1875 x 4.375 px, offset x=0 y=1, lit = mean > 60) and
 * every block read off the matrices (sprites-source/img3..8.npy), adjudicated
 * against raw pixels. Evidence per sprite is in the inline comments.
 *
 * Formation aliens animate between two poses (frame A / frame B) — see
 * FORMATION_FRAMES; the animation interval is tunable in aliens.ts.
 *
 * Each sprite is a string[] of rows; '#' = lit block, '.' = empty block.
 * Sprites are raw 1-block-per-char rows anchored at their top-left origin.
 */

export interface Sprite {
  /** sprite name */
  name: string;
  /** width in blocks */
  w: number;
  /** height in blocks */
  h: number;
  /** rows; '#' lit, '.' empty */
  rows: readonly string[];
}

function s(name: string, rows: readonly string[]): Sprite {
  const w = Math.max(...rows.map((r) => r.length));
  return { name, w, h: rows.length, rows };
}

/** Player ship (7x4) — galaxyinvasion-3.png rows 44-47 cols 54-60; confirmed
 *  img4 rows 44-47 cols 106-112 (centered 1/3/5/7 pyramid). */
export const SHIP: Sprite = s("ship", [
  "...#...",
  "..###..",
  ".#####.",
  "#######",
]);

/** Flagship at rest (7x3) — galaxyinvasion-7.png rows 3-5 cols 8-14,
 *  9 identical occurrences at pitch 10. */
export const FLAGSHIP: Sprite = s("flagship", [
  ".#####.",
  "#..#..#",
  ".#####.",
]);

/** Bodyguard — the alien type that escorts the Flagship (7x3) —
 *  galaxyinvasion-4.png rows 3-5 cols 23-29/44-50; img3/5. */
export const BODYGUARD: Sprite = s("bodyguard", [
  "#.###.#",
  ".#####.",
  "#.###.#",
]);

/** Formation scout, frame A — galaxyinvasion-3.png rows 8-10 cols 26-32; img6. */
export const ALIEN_SCOUT_A: Sprite = s("scout-a", [
  "..###..",
  "##.#.##",
  "#.###.#",
]);

/** Formation scout, frame B (rest pose) — galaxyinvasion-4.png rows 8-10
 *  cols 13-19; img5/7/8. */
export const ALIEN_SCOUT_B: Sprite = s("scout-b", [
  "#.###.#",
  "##.#.##",
  "..###..",
]);

/** Formation warrior, frame A — galaxyinvasion-3.png rows 13-15 cols 26-32;
 *  img6. */
export const ALIEN_WARRIOR_A: Sprite = s("warrior-a", [
  "..###..",
  "###.###",
  "..###..",
]);

/** Formation warrior, frame B (rest pose) — galaxyinvasion-4.png rows 13-15
 *  cols 13-19; img7/8. */
export const ALIEN_WARRIOR_B: Sprite = s("warrior-b", [
  "..###.#",
  "##...##",
  "#.###..",
]);

/** Formation guard, frame A — galaxyinvasion-3.png rows 18-20 cols 26-32;
 *  img6. */
export const ALIEN_GUARD_A: Sprite = s("guard-a", [
  "..###..",
  "#######",
  "#..#..#",
]);

/** Formation guard, frame B (rest pose) — galaxyinvasion-4.png rows 18-20
 *  cols 13-19; img5/7/8. */
export const ALIEN_GUARD_B: Sprite = s("guard-b", [
  "..###..",
  ".#####.",
  "#..#..#",
]);

/** Formation scout2, frame A — galaxyinvasion-3.png rows 23-25 cols 26-32;
 *  img6. */
export const ALIEN_SCOUT2_A: Sprite = s("scout2-a", [
  "..###..",
  ".##.##.",
  "#.###.#",
]);

/** Formation scout2, frame B (rest pose) — galaxyinvasion-4.png rows 23-25
 *  cols 13-19; img5/7/8. */
export const ALIEN_SCOUT2_B: Sprite = s("scout2-b", [
  "#.###.#",
  ".##.##.",
  "..###..",
]);

/**
 * Flagship diving wedge (7x6) — galaxyinvasion-4.png rows 31-36 cols 107-113:
 * flagship (rows 1-3) leading, escort (rows 4-6) trailing, one composite unit.
 */
export const FLAGSHIP_DIVE: Sprite = s("flagship-dive", [
  ".#####.",
  "#...#.#",
  ".#####.",
  "#######",
  ".#####.",
  "#.###.#",
]);

/** Bomb dropped by a diving alien at the apex of its swoop (2x2). Not visible
 *  in the stills; Galaxian-style. Tunable. */
export const BOMB: Sprite = s("bomb", [
  "##",
  "##",
]);

/** Lightning bolt head (5x2) — tip of the Flagship's always-fatal bolt.
 *  Tip width from galaxyinvasion-6.png strike tip rows 44-47 cols 30-36;
 *  origins (3-block sparks) from img8 rows 6-7. Tunable. */
export const LIGHTNING_HEAD: Sprite = s("lightning-head", [
  ".###.",
  "#####",
]);

/** Explosion frame (7x4). No explosion captured in the stills; Galaxian-style
 *  expanding diamond. Tunable. */
export const EXPLOSION: Sprite = s("explosion", [
  "##.#.##",
  "#.###.#",
  "#.###.#",
  "##.#.##",
]);

/**
 * Two-frame animation pairs per formation row (index 0..3), frame A = the
 * alternate pose (img3/img6), frame B = the rest pose (img4/5/7/8). The
 * formation animates synchronously (one shared counter in aliens.ts).
 */
export const FORMATION_FRAMES: readonly [Sprite, Sprite][] = [
  [ALIEN_SCOUT_A, ALIEN_SCOUT_B],
  [ALIEN_WARRIOR_A, ALIEN_WARRIOR_B],
  [ALIEN_GUARD_A, ALIEN_GUARD_B],
  [ALIEN_SCOUT2_A, ALIEN_SCOUT2_B],
];

export const ALL_SPRITES: readonly Sprite[] = [
  SHIP,
  FLAGSHIP,
  BODYGUARD,
  ALIEN_SCOUT_A,
  ALIEN_SCOUT_B,
  ALIEN_WARRIOR_A,
  ALIEN_WARRIOR_B,
  ALIEN_GUARD_A,
  ALIEN_GUARD_B,
  ALIEN_SCOUT2_A,
  ALIEN_SCOUT2_B,
  FLAGSHIP_DIVE,
  BOMB,
  LIGHTNING_HEAD,
  EXPLOSION,
];
