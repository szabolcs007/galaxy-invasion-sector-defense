# 0002 — Sector-defense meta-layer

Date: 2026-08-15

Added a linear 8-sector tug-of-war campaign as the twist: winning a sector
moves the front +1 toward the enemy core, losing moves it −1 toward home;
front 0 = campaign lost, front 9 = campaign won. Each sector fixes its own
difficulty and score multipliers (Flagships `min(1+(N−1),16)`, dive tempo
`1+0.15(N−1)`, score multiplier `N`). The feedback is deliberately
non-adaptive — it depends only on the sector index, never on player
performance — to preserve the original's learnable, score-based arcade loop.
Sector-retry stakes (lost sector = retreat, not campaign wipe) keep the
campaign forgiving while the tug-of-war gives every run a persistent
consequence and a goal beyond the high score.
