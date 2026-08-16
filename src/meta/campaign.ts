/**
 * Campaign — the linear sector-defense meta-layer (the twist).
 *
 * 8 sectors in a line; the front starts at 1 (outermost/weakest) and moves
 * +1 on a win, -1 on a loss. Front at 0 = CampaignLost; front at 9
 * (SECTORS+1) = CampaignWon. A sector is won by clearing WAVES_PER_SECTOR
 * waves; lost when all ships are destroyed (sector-retry: only a retreat,
 * never a campaign wipe).
 *
 * Per-sector fixed feedback — depends only on the sector index N, never on
 * player performance (deliberately non-adaptive):
 *   - flagships at sector start: min(1 + (N-1), 16)
 *   - dive-tempo multiplier:     1 + 0.15*(N-1)
 *   - score multiplier:          N
 */
import { MAX_FLAGSHIPS } from "../game/aliens";
import { ESCALATION_SCORE, ESCALATION_STEP } from "../game/scoring";

export const SECTORS = 8;
export const WAVES_PER_SECTOR = 5;

/**
 * Effective escalation threshold for a sector. Run scores reset every sector
 * and the per-sector ceiling is ~17k (5 waves x 1600 cell base x 2 diving,
 * plus one-time flagship/escort kills — flagships do not recur across waves),
 * so both the literal 200k and a plain 200k/N are unreachable. Scaling by
 * 1/(8N) keeps the plan's locked intent — "deep sectors reach the 200,000
 * escalation faster by design" — non-adaptive (depends only on sector N), and
 * keeps N=1 above the ceiling (tutorial never escalates) while N>=2 escalates
 * progressively faster. Verified against the sector score ceiling.
 */
export function escalationThresholdForSector(n: number): number {
  return Math.round(ESCALATION_SCORE / (8 * n)); // tunable divisor
}

/**
 * Flagship-row growth step: one more Flagship per step points above the
 * threshold. Scaled with the same 1/(8N) factor as the threshold, so the
 * growth is reachable inside a single deep sector (the literal 40,000 step
 * could never fire below the ~17k ceiling).
 */
export function escalationStepForSector(n: number): number {
  return Math.max(500, Math.round(ESCALATION_STEP / (8 * n))); // tunable
}


export function flagshipsForSector(n: number): number {
  return Math.min(1 + (n - 1), MAX_FLAGSHIPS);
}

export function diveTempoForSector(n: number): number {
  return 1 + 0.15 * (n - 1);
}

export function scoreMultiplierForSector(n: number): number {
  return n;
}
