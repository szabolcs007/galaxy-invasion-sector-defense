# Galaxy Invasion: Sector Defense

A faithful web remake of **Galaxy Invasion** (Big Five Software, Bill Hogue &
Jeff Konyu, 1980, TRS-80 Model I/III, 16K RAM). The game is a **Galaxian
clone, not Space Invaders**: fixed shooter, one shot at a time, an alien
formation with distinct roles (Bodyguards protecting the Flagship),
dive-bombers, double points for shooting an attacking alien, and the Flagship
Attack Alert that always ends in a fatal lightning strike. Inspiration was the
**1980 sound special edition** (the canonical release with the title-screen
tune, transition/fire/alien sounds and the flagship alert).

Small twist: a **linear sector-defense campaign** — an 8-sector tug-of-war on
the front line, layered on top of the classic arcade loop.

---

## Running

Node 20+ required.

```bash
npm install
npm run dev        # dev server -> http://localhost:5173
```

Production build and preview:

```bash
npm run build      # tsc strict + vite build into dist/
npm run preview    # local preview of the build
```

---

## Controls

| Key           | Action                                                |
| ------------- | ----------------------------------------------------- |
| `←` / `A`     | ship left                                             |
| `→` / `D`     | ship right                                            |
| `Space` / `↑` | fire (edge-triggered; only one shot alive at a time)  |
| `Enter`       | open star map / launch sector (new campaign if ended) |
| `Esc`         | abandon run (to the star map; no score)               |
| `T`           | phosphor tint: green → white → amber                  |

Gamepad: d-pad/left stick to move, button 0 (bottom face button) to fire.
No pause — the 1980 original had none either.

---

## Gameplay

- **Screen flow**: Title (with tune) → 2 s or any key → Attract (self-running
  formation demo) → any key → Star Map → Enter → gameplay → sector outcome →
  Star Map.
- **Ship**: bottom row, horizontal movement (60 blocks/s), 3 ships, +1 ship
  every 10 000 points.
- **Formation**: 4 rows × 10 aliens (Scout, Warrior, Bodyguard,
  Warrior-variant), oscillating in groups. Aliens animate between two poses
  (frame-synchronized, ~500 ms).
- **Dive-bombers**: on a timer an alien leaves the formation, swoops at the
  ship on a Bézier arc, drops a bomb at 0.3 of the arc, then either returns
  to the formation or kamikazes into the ship.
- **Flagship Attack Alert**: if a Flagship stays on screen for 20 s without
  being destroyed, a two-tone alert starts; 5 s later every living Flagship
  fires always-fatal lightning. Destroying a Flagship restarts the cycle.
  (The original's rare "near-miss" bug is not reproduced: the lightning is
  always fatal.)
- **Escalation**: above the sector threshold (sooner in deep sectors) the
  alert is continuous and the Flagship row grows with points until full.

---

## Scoring

`points = base × (attacking ? 2 : 1) × sector multiplier`

| Type      | Base |
| --------- | ---- |
| Scout     | 30   |
| Warrior   | 40   |
| Bodyguard | 50   |
| Flagship  | 80   |

Example (the plan's verification case): shooting a diving Scout in sector 2
(×2) scores `30 × 2 × 2 = 120` points.

The base values are a documented-rules + Galaxian-inspired reconstruction
(the instruction-screen OCR was done, but the values are illegible at the
available resolution — see `docs/adr/0003-fidelity-reconstruction.md`).

---

## The campaign

- **8 sectors** in a line; the front starts at 1 (outermost/weakest).
- **Win** (clear 5 waves): front +1. **Loss** (ships exhausted): front −1
  (sector retry — no campaign wipe, just a retreat).
- Front 0 = campaign lost; front 9 = campaign won.
- Fixed (non-adaptive) feedback per sector:
  - starting Flagships: `min(1 + (N−1), 16)`
  - dive-tempo multiplier: `1 + 0.15(N−1)`
  - score multiplier: `N`
- **Escalation threshold**: `200 000 / (8N)` (deeper = sooner, but sector 1
  never escalates), growth step `max(500, 40 000 / (8N))`.
- **Save**: `localStorage` key `gisector.v1` (front, bestFront,
  bestScores[8], stats: flagshipEscapes/sectorsWon/sectorsLost). Versioned;
  unknown version → defaults.

---

## Technical architecture

- **Platform**: TypeScript (strict, `noUncheckedIndexedAccess`) + Vite
  (vanilla-ts). No UI framework, no game engine.
- **Rendering**: 128×48 block framebuffer → Canvas2D integer upscale →
  hand-written WebGL2 CRT pass (scanlines every 3 rows, phosphor bloom +
  previous-frame persistence, barrel distortion + vignette). Without WebGL2:
  plain integer upscale — never crashes.
- **Audio**: WebAudio square `OscillatorNode`s (1-bit), 5 ms attack / 15 ms
  release envelope, through a compressor-limiter. Music runs on a lookahead
  scheduler (0.1 s ahead, 25 ms pump), independent of the render loop.
- **Loop**: `requestAnimationFrame` → accumulator (100 ms clamp) → fixed
  60 updates/s → render. Frame-rate independent at 60/120/144 Hz.

### Directory structure

```
src/
├── main.ts            # boot, fixed-timestep loop, state machine
├── game/
│   ├── state.ts       # GameState + transitions
│   ├── aliens.ts      # formation roles, dive paths, alert, escalation
│   ├── run.ts         # one sector run (scoring, waves, lives)
│   ├── ship.ts        # ship (movement, one-shot rule)
│   ├── shots.ts       # ship shot, alien shots, bombs, lightning
│   └── scoring.ts     # points (base values, extra ship, escalation)
├── render/
│   ├── framebuffer.ts # 128×48 block grid (the only drawing surface)
│   ├── crt.ts         # WebGL2 CRT pass (uTint is the only display surface)
│   ├── sprites.ts     # pixel-exact sprite sheet (2-frame animation)
│   └── text.ts        # 3×5 bitmap font
├── audio/
│   ├── sound.ts       # square-wave SFX set (click-free)
│   └── music.ts       # title tune with lookahead scheduler
├── input/
│   ├── keyboard.ts    # keyboard (edge-triggered fire)
│   └── gamepad.ts     # gamepad polling
└── meta/
    ├── campaign.ts    # tug-of-war rules, sector economy
    ├── starmap.ts     # the star map screen
    └── persistence.ts # gisector.v1 localStorage
```

### Sources

- Reference screenshots (trs-80.org), matrices resampled to the block grid
  and the extraction notes: `sprites-source/` (the sprite audit trail).
- Glossary: `CONTEXT.md`. Decisions: `docs/adr/0001..0003`.

---

## Testing / verification

During development, browser-driven smoke tests ran with the following key
checks (headless Chromium; framebuffer state and game state are readable
through `window.__*` debug hooks):

1. State flow: Title → Attract → StarMap → Playing → outcomes.
2. Ship movement (60 blocks/s, clamped), one-shot rule.
3. Scoring: formation Warrior = 40; formula 120 for the sector-2 diving Scout.
4. Flagship Alert: 20 s → alert → 5 s → lightning → cycle restarts.
5. Meta: 5 waves → front 2; still 2 after reload; loss → front 1;
   front 8 → CampaignWon; front 1 loss → CampaignLost.
6. Escalation: threshold reachable in deep sectors, the Flagship row grows.
7. CRT output: the displayed image is upright (not mirrored) — on the star
   map "SECTOR DEFENSE" is on top, the "ENTER ..." prompt at the bottom.
8. Ended campaign (front 0 or 9): Enter on the star map starts a new campaign
   (front 1; stats and per-sector best scores are kept).

Debug hooks (development): `window.__fb()`, `window.__state()`,
`window.__run()`, `window.__invuln(v)` (verification-only, does not affect
gameplay).

---

## Tuning

Every feel-affecting number is marked with a `// tunable` comment in the
source: ship/shot/bomb speed (`ship.ts`, `shots.ts`), dive arcs and timers
(`aliens.ts`), alert timings (`aliens.ts` — the 20 s/5 s are locked by the
plan), sector economy (`campaign.ts`), SFX/tune (`sound.ts`, `music.ts`).

---

## References

- Galaxy Invasion at trs-80.org: <http://www.trs-80.org/galaxy-invasion/>
- Super Nova (the Flagship's first appearance): <http://www.trs-80.org/super-nova/>
