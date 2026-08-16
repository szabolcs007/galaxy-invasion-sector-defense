# Sprite extraction notes (audit trail)

Source: `sprites-source/galaxyinvasion-1..8.png` (280x210 each, GIF-converted
from trs-80.org). The game framebuffer is 128x48 semigraphics blocks.

Resample mapping verified empirically by blockiness search:
block (i, j) covers `x = i*2.1875 .. (i+1)*2.1875`, `y = 1 + j*4.375 .. 1 + (j+1)*4.375`,
lit if the region mean > ~60. Resampled float matrices: `sprites-source/img3..8.npy`.

## Final sprites (1 char = 1 block)

| Sprite | Rows | Source |
|---|---|---|
| Ship (7x4) | `...#.../..###../.#####./#######` | img3 rows 44-47 cols 54-60; img4 cols 106-112 |
| Flagship (7x3) | `.#####./#..#..#/.#####.` | img7 rows 3-5 cols 8-14 (9 occurrences) |
| Bodyguard (7x3) | `#.###.#/.#####./#.###.#` | img4 rows 3-5 cols 23-29/44-50; img3/5 |
| Scout frame A | `..###../##.#.##/#.###.#` | img3 rows 8-10 cols 26-32; img6 |
| Scout frame B | `#.###.#/##.#.##/..###..` | img4 rows 8-10 cols 13-19; img5/7/8 |
| Warrior frame A | `..###../###.###/..###..` | img3 rows 13-15 cols 26-32; img6 |
| Warrior frame B | `..###.#/##...##/#.###..` | img4 rows 13-15 cols 13-19; img7/8 |
| Guard frame A | `..###../#######/#..#..#` | img3 rows 18-20 cols 26-32; img6 |
| Guard frame B | `..###../.#####./#..#..#` | img4 rows 18-20 cols 13-19; img5/7/8 |
| Scout2 frame A | `..###../.##.##./#.###.#` | img3 rows 23-25 cols 26-32; img6 |
| Scout2 frame B | `#.###.#/.##.##./..###..` | img4 rows 23-25 cols 13-19; img5/7/8 |
| Flagship dive (7x6) | `.#####./#...#.#/.#####./#######/.#####./#.###.#` | img4 rows 31-36 cols 107-113 |
| Bomb (2x2) | `##/##` | not in stills; Galaxian-style, tunable |
| Lightning head (5x2) | `.###./#####` | img6 strike tip rows 44-47 cols 30-36 |
| Explosion (7x4) | `##.#.##/#.###.#/#.###.#/##.#.##` | not in stills; Galaxian-style, tunable |

## Findings

- Formation aliens animate between two poses (frame A: img3+img6; frame B:
  img4/5/7/8), synchronized across the formation; both frames shipped as
  `FORMATION_FRAMES` in src/render/sprites.ts.
- Flagship row = groups of [Bodyguard, Flagship, Bodyguard] at pitch ~10,
  groups ~25-30 apart; escorts drop at >= 5 flagships; screenshots max out at
  9 flagships (plan caps at 16).
- Formation: 4 rows x 10 cols, row pitch 5 (y 8,13,18,23), col pitch 10.
- Instruction screen (galaxyinvasion-2.png) OCR: partially legible; the exact
  per-type score values are illegible at this resolution (3-4 px digits).
  The derived table stands (Scout 30 / Warrior 40 / Bodyguard 50 / Flagship 80).
