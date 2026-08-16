/**
 * Persistence — a single versioned, namespaced localStorage key `gisector.v1`.
 *
 * On load: if the key is absent or the version is unknown, the defaults are
 * used (no migration, no crash). Written on every front/bestScore/stats
 * change.
 */
export const STORAGE_KEY = "gisector.v1";
export const SECTORS = 8;

export interface CampaignState {
  front: number;
  bestFront: number;
}

export interface Stats {
  flagshipEscapes: number;
  sectorsWon: number;
  sectorsLost: number;
}

export interface SaveData {
  version: 1;
  campaign: CampaignState;
  bestScores: number[]; // length SECTORS
  stats: Stats;
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    campaign: { front: 1, bestFront: 1 },
    bestScores: new Array<number>(SECTORS).fill(0),
    stats: { flagshipEscapes: 0, sectorsWon: 0, sectorsLost: 0 },
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) return defaultSave();
    const d = defaultSave();
    if (parsed.campaign && typeof parsed.campaign.front === "number") {
      d.campaign.front = clampInt(parsed.campaign.front, 0, SECTORS + 1);
      d.campaign.bestFront = clampInt(
        parsed.campaign.bestFront ?? d.campaign.front,
        0,
        SECTORS + 1,
      );
    }
    if (Array.isArray(parsed.bestScores)) {
      d.bestScores = parsed.bestScores.slice(0, SECTORS).map((v) => (typeof v === "number" ? v : 0));
      while (d.bestScores.length < SECTORS) d.bestScores.push(0);
    }
    if (parsed.stats) {
      d.stats.flagshipEscapes = parsed.stats.flagshipEscapes ?? 0;
      d.stats.sectorsWon = parsed.stats.sectorsWon ?? 0;
      d.stats.sectorsLost = parsed.stats.sectorsLost ?? 0;
    }
    return d;
  } catch {
    return defaultSave();
  }
}

export function saveData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode) — play without persistence */
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(v)));
}
