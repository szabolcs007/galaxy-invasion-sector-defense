/**
 * Scoring rules.
 *
 * Base values are a documented-rule reconstruction (see the fidelity ADR).
 * Step I of the plan (OCR of the trs-80.org instruction screen,
 * galaxyinvasion-2.png) was attempted: the screen uses the game's own dense
 * semigraphics font and could not be decoded confidently without the binary;
 * no alternative per-type values were found. The derived table below stands
 * (Scout 30 / Warrior 40 / Bodyguard 50 / Flagship 80, Galaxian-inspired).
 * Formula:
 *   points = base x (attacking ? 2 : 1) x sectorMultiplier
 * where "attacking" = the alien was diving/swooping (the original's double
 * points for shooting an attacking alien).
 *
 * Extra ship every EXTRA_SHIP_EVERY points; the player starts with
 * START_SHIPS ships.
 */
export const BASE_SCORES = {
  scout: 30,
  warrior: 40,
  bodyguard: 50,
  flagship: 80,
} as const;

export type AlienTypeName = keyof typeof BASE_SCORES;

export const EXTRA_SHIP_EVERY = 10_000;
export const START_SHIPS = 3;

/** Score at which the Flagship Attack Alert is permanently active. */
export const ESCALATION_SCORE = 200_000;
export const ESCALATION_STEP = 40_000;

/**
 * Formation row -> alien type. Rows are indexed top (0) to bottom (3);
 * the 4th row reuses the Warrior type (the original had 4 sprite rows but
 * only 3 regular types plus the Flagship).
 */
export const ROW_TYPES: readonly AlienTypeName[] = [
  "scout",
  "warrior",
  "bodyguard",
  "warrior",
];

export function pointsFor(
  type: AlienTypeName,
  attacking: boolean,
  sectorMultiplier: number,
): number {
  return BASE_SCORES[type] * (attacking ? 2 : 1) * sectorMultiplier;
}
