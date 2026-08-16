# Repository Guidelines

## Project Overview

Galaxy Invasion: Sector Defense — browser remake of the 1980 Big Five TRS-80 arcade game "Galaxy Invasion" (a Galaxian clone, never "Space Invaders"). 128×48 block framebuffer, optional WebGL2 CRT post-process, 1-bit square-wave audio via WebAudio, plus a persistent 8-sector tug-of-war campaign (the twist) saved to localStorage. Code comments and docs are Hungarian; the domain glossary (`CONTEXT.md`) is English — quote its terms verbatim.

## Architecture & Data Flow

- Boot: `src/main.ts` `class Game` is the only entry point; `index.html` loads it as a native ES module.
- Loop: rAF → clamp elapsed to 100 ms (tab-restore guard) → fixed 60 Hz `update(STEP)` with `STEP = 1/60` → one `render()` per frame. Both dispatch on `switch (this.state)` over the `GameState` FSM (`src/game/state.ts`).
- State: `Game` holds screen-level state, per-screen timers, `run: SectorRun | null`, `starmap: StarMap | null`, `save: SaveData`. Per-sector gameplay lives in `SectorRun` (`src/game/run.ts`); persistence in `SaveData` (`src/meta/persistence.ts`), saved on every sector end.
- Flow: input classes (edge-triggered `consumeXxx()` + held-state getters) → `SectorRun.update(dt, left, right, fire)` (run.ts:284) → entities mutate and trigger the `sound`/`music` singletons → everything draws into one shared `Framebuffer` (128×48 `Uint8Array` of 0/1) → `blitToImageData()` → temp canvas → `CrtRenderer` (WebGL2) or integer-2D upscale fallback.
- Layering: `meta/` imports game-tuning constants from `game/`; `render/`, `input/`, `audio/` are leaves. No cycles; type-only imports are explicit `import type` lines.

## Key Directories

- `src/render/` — `framebuffer.ts` (single drawing surface, `FB_W=128`/`FB_H=48`), `sprites.ts` (every pixel sprite is code-defined string rows; `FORMATION_FRAMES`), `text.ts` (3×5 bitmap font), `crt.ts` (hand-written WebGL2 CRT/scanline/phosphor shader; returns null → 2D fallback).
- `src/game/` — gameplay: `state.ts` (GameState FSM), `run.ts` (SectorRun orchestrator), `aliens.ts` (formation, dive-bomber bézier paths, Flagship Attack Alert, escalation), `ship.ts`, `shots.ts`, `scoring.ts`.
- `src/meta/` — the campaign twist: `campaign.ts` (8-sector tuning), `starmap.ts` (sector-node screen), `persistence.ts` (localStorage save).
- `src/input/` — `keyboard.ts` (`event.code` held-Set + edge triggers), `gamepad.ts` (polls `navigator.getGamepads()`).
- `src/audio/` — `sound.ts` (SFX singleton `sound`), `music.ts` (title tune singleton `music`).
- `src/assets/` — leftover Vite scaffold images, unused by game code.
- `sprites-source/` — sprite-extraction audit trail (source PNGs, `.npy` resample matrices, `notes/extraction.md`); outside the build.

## Development Commands

- `npm run dev` — Vite dev server with HMR.
- `npm run build` — `tsc && vite build`: type-check first, then production build.
- `npm run preview` — serve the production build locally.
- `npm install` — npm only; `package-lock.json` is lockfileVersion 3 (no bun lockfile).
- No test/lint/format scripts exist.

## Code Conventions & Common Patterns

- Naming: kebab-case files; PascalCase classes; UPPER_SNAKE exported config constants (`FB_W`, `SHIP_SPEED`, `WAVES_PER_SECTOR`); PascalCase interfaces (`SaveData`, `Sprite`); lowercase file-private helpers.
- Enum idiom: `as const` object + derived union — `export const GameState = {...} as const; export type GameState = (typeof GameState)[keyof typeof GameState];` (`src/game/state.ts`, `src/game/scoring.ts`). Reuse it; never introduce TS `enum` (`erasableSyntaxOnly` forbids it anyway).
- Entities are classes with `update(dt, ...)` and `draw(fb, ...)` (aliens use inverted-callback draw: `aliens.draw((spr, x, y) => fb.blitSprite(...))`).
- Singletons are exported consts: `export const sound = new SoundManager()`; import, never construct.
- Every module: Hungarian JSDoc header stating purpose; `// tunable` marks tuning knobs; provenance comments cite evidence (sprite trace source, audio reference) — preserve them when editing.
- Error handling is tolerant: CRT creation returns null (2D fallback), localStorage wrapped in try/catch with defaults, audio no-ops without a context. No thrown user-facing errors.
- `// verification hook` fields (e.g. `SectorRun.testInvuln`, the `window.__*` globals) are dev-only; never route gameplay through them.
- No formatter/linter config exists; `tsconfig.json` strict flags (`noUnusedLocals`, `noUncheckedIndexedAccess`, …) are the only guardrails.

### Agent workflow (this repo's process conventions)

- **Issue tracker** — issues and specs are local markdown under `.scratch/<feature>/`. Whenever a skill says "publish to the issue tracker" or "fetch the relevant ticket", or mentions wayfinding (map, frontier, claim/resolve): read `docs/agents/issue-tracker.md` first.
- **Triage roles** — when a skill names a triage role, use the canonical label strings from `docs/agents/triage-labels.md` (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`).
- **Domain** — single-context repo: one `CONTEXT.md` + `docs/adr/` at the root. Before exploring the codebase, read `CONTEXT.md` and any ADR touching the area; use the glossary verbatim: Sector, Front, Wave (never "level"), Flagship Attack Alert (never "alarm"), Phosphor, 1-bit audio; aliens are Scout/Warrior/Bodyguard/Flagship (never "invaders"). Conflicts with an ADR get flagged, not silently overridden. See `docs/agents/domain.md`.

## Important Files

- `src/main.ts` — boot, game loop, `Game` FSM; exposes verification globals `window.__fb/__state/__game/__run/__invuln`.
- `src/render/framebuffer.ts` + `sprites.ts` — the drawing surface and every sprite.
- `src/game/run.ts` — `SectorRun`, per-sector orchestration.
- `src/game/aliens.ts` — formation, dives, Flagship Attack Alert (`MAX_FLAGSHIPS=16`).
- `src/game/scoring.ts` — `BASE_SCORES` (Scout 30 / Warrior 40 / Bodyguard 50 / Flagship 80, ×2 diving), `pointsFor`.
- `src/meta/campaign.ts` — `SECTORS=8`, `WAVES_PER_SECTOR=5`, per-sector difficulty/score tuning.
- `src/meta/persistence.ts` — `STORAGE_KEY='gisector.v1'`, `SaveData`, `loadSave`/`saveData`.
- `index.html` — DOM shell (`<canvas id="screen">`, module script tag). `src/style.css` — presentation.
- `CONTEXT.md` — domain glossary + architecture-at-a-glance.
- `docs/adr/0001-web-platform.md`, `0002-sector-defense-meta-layer.md`, `0003-fidelity-reconstruction.md` — platform choice, campaign twist, reconstruction provenance.
- Config: `package.json`, `tsconfig.json`, `.gitignore`. `skills-lock.json` is harness infrastructure, not app config.

## Runtime/Tooling Preferences

- Browser-only game, no server: modern evergreen browsers (tsconfig target `es2023`, lib `ES2023`+`DOM`).
- npm + Vite 8 (rolldown) + TypeScript 6; ESM (`"type": "module"`), `moduleResolution: "bundler"`, `verbatimModuleSyntax`, `noEmit`. Node ≥ 20.19 or ≥ 22.12 (Vite 8 engine requirement, enforced by the lockfile).
- Framework-free core by ADR-0001; no `vite.config.*` — Vite runs on defaults.
- Browser APIs in use: Canvas 2D + optional WebGL2, WebAudio, localStorage, Gamepad API, `requestAnimationFrame`. Don't pull in abstractions over these.

## Testing & QA

- No automated test suite: no test files, no runner, no `test` script. Do not add a runner unless asked.
- QA is documented browser-driven smoke testing (README "Tesztelés / verifikáció"): headless Chromium reading framebuffer and game state through the `window.__*` hooks.
- Canonical checks to re-run after behavioral changes: state flow (Title → Attract → StarMap → Playing → outcomes); ship movement (60 blocks/s, clamped) + one-shot rule; scoring (formation Warrior = 40; sector-2 diving Scout = 30×2×2 = 120); Flagship Alert (20 s grace → 5 s alert → lightning → restart); campaign (5 waves → front +1, loss → −1, front 8 → CampaignWon, front 1 loss → CampaignLost, reload persistence); escalation (deep-sector threshold reachable, Flagship row grows).
