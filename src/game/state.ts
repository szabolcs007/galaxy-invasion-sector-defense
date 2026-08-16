/**
 * Game state machine. Screen-level states and their transitions:
 *
 *   Title   --2s or key--> Attract --key--> StarMap --Enter/click--> Playing
 *   Playing --sector outcome--> SectorClear | SectorLost --2s--> StarMap
 *   StarMap --front 9 cleared--> CampaignWon
 *   StarMap --front retreated past 0--> CampaignLost
 *
 * Escape during Playing abandons the run (forfeit, no score) and returns to
 * StarMap.
 */
export const GameState = {
  Title: "Title",
  Attract: "Attract",
  StarMap: "StarMap",
  Playing: "Playing",
  SectorClear: "SectorClear",
  SectorLost: "SectorLost",
  CampaignWon: "CampaignWon",
  CampaignLost: "CampaignLost",
} as const;

export type GameState = (typeof GameState)[keyof typeof GameState];

export const POST_SECTOR_STATES: ReadonlySet<GameState> = new Set([
  GameState.SectorClear,
  GameState.SectorLost,
]);

/** Duration of the sector-outcome interstitial in seconds. */
export const INTERSTITIAL_SECONDS = 2.5;

/** Duration of the title screen before the attract mode auto-starts. */
export const TITLE_SECONDS = 2.0;
