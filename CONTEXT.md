# CONTEXT.md — Galaxy Invasion: Sector Defense

A faithful web remake of **Galaxy Invasion** (Big Five Software, Bill Hogue &
Jeff Konyu, 1980, TRS-80 Model I/III, 16K RAM), targeting the **1980 sound
special edition**. It is a **Galaxian clone, not Space Invaders**. The twist is
a persistent linear sector-defense campaign layered on the classic arcade loop.

Project language: English.

## Glossary

- **Sector**: one node of the 8-sector campaign map; a run of `WAVES_PER_SECTOR`
  waves at a fixed difficulty/score multiplier.
- **Front**: the current campaign position (sector index); +1 on a win, −1 on
  a loss. Front at 0 = campaign lost; front at 9 = campaign won.
- **Flagship Attack Alert**: the timed two-tone warning before Flagships fire
  always-fatal lightning. _Avoid_: "alarm".
- **Dive-bomber**: an alien that leaves formation, swoops at the player, drops
  a bomb, and may kamikaze.
- **Bodyguard**: the alien type that escorts and protects the Flagship.
- **Wave**: one full alien formation (4 rows × 10 aliens). _Avoid_: "level"
  (a sector contains waves).
- **Phosphor**: the selectable CRT tint (green/white/amber).
- **1-bit audio**: square-wave sound produced by toggling the cassette output
  line (CASOUT port 0xFF bit 0) in the original; reproduced with WebAudio
  square `OscillatorNode`s. _Avoid_: "beep" for the composed tune.

_Avoid globally_: "Space Invaders" (this is a Galaxian clone); "invaders" for
the aliens (use the type names: Scout, Warrior, Bodyguard, Flagship).

## Architecture at a glance

- `src/main.ts` — boot, fixed-timestep loop (60 updates/s, clamped delta), state
  machine (Title → Attract → StarMap → Playing → SectorClear/SectorLost → …).
- `src/game/` — `state.ts` (state machine), `aliens.ts` (formation roles,
  dive-bomber paths, Flagship Attack Alert, 200k escalation), `ship.ts`,
  `shots.ts` (player shot, alien shots, bombs, lightning bolts), `run.ts`
  (one sector run: scoring, extra ships, waves), `scoring.ts`.
- `src/render/` — `framebuffer.ts` (128×48 block grid), `crt.ts` (WebGL2
  phosphor/scanline pass, `uTint` is the only display-config surface),
  `sprites.ts` (pixel-traced sheet), `text.ts` (3×5 bitmap font).
- `src/audio/` — `sound.ts` (square-wave SFX inventory), `music.ts`
  (lookahead title-tune scheduler).
- `src/input/` — `keyboard.ts`, `gamepad.ts`.
- `src/meta/` — `campaign.ts` (tug-of-war rules), `starmap.ts` (the map
  screen), `persistence.ts` (`localStorage` key `gisector.v1`).

## Decisions

See `docs/adr/` for the three recorded decisions (web platform, sector-defense
meta-layer, fidelity reconstruction). Key locked values: Flagship Attack
Alert grace 20 s then 5 s of two-tone alert then always-fatal lightning; extra
ship every 10,000 points; 3 starting ships; 200,000-point escalation (alert
always on, Flagship row grows); derived scoring Scout 30 / Warrior 40 /
Bodyguard 50 / Flagship 80 (double while diving) × sector multiplier.
