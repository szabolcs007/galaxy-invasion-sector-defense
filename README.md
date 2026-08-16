# Galaxy Invasion: Sector Defense

Egy hűséges webes remake a **Galaxy Invasion**-ről (Big Five Software, Bill
Hogue & Jeff Konyu, 1980, TRS-80 Model I/III, 16K RAM). A játék **Galaxian
klón, nem Space Invaders**: fix lövő, egyszerre egy lövés, alien-formáció
külön szerepekkel (Bodyguard őrzi a Flagshipet), dive-bombázók, dupla pont a
támadó alienre lövésért, és a Flagship Attack Alert, amelynek lejárta mindig
halálos villámcsapást szabadít el. A célváltozat az **1980-as sound special
edition** (a címképernyős dallammal, átmenet/lövés/alien-hangokkal és a
flagship-riadóval rendelkező kanonikus kiadás).

A csavar: egy **lineáris szektor-védelmi kampány** — 8 szektor kötélhúzása a
frontvonalon, a klasszikus árkád-loop tetejére rétegezve.

---

## Futtatás

Node 20+ szükséges.

```bash
npm install
npm run dev        # fejlesztői szerver -> http://localhost:5173
```

Gyártási build és előnézet:

```bash
npm run build      # tsc strict + vite build a dist/-be
npm run preview    # a build helyi előnézete
```

---

## Irányítás

| Billentyű     | Művelet                                                              |
| ------------- | -------------------------------------------------------------------- |
| `←` / `A`     | hajó balra                                                           |
| `→` / `D`     | hajó jobbra                                                          |
| `Space` / `↑` | lövés (él-vezérelt; egyszerre csak egy lövés él)                     |
| `Enter`       | star map indítása / szektor indítása (lezárt kampánynál: új kampány) |
| `Esc`         | futás feladása (a star mapra; pontszám nem számít)                   |
| `T`           | foszfor szín váltása: zöld → fehér → borostyán                       |

Gamepad: d-pad/bal-stick mozgatás, 0-s gomb (alsó arcképgomb) lövés.
Szünet nincs — az 1980-as eredetiben sem volt.

---

## Játékmenet

- **Képernyőfolyam**: Title (dallammal) → 2s vagy bármely billentyű → Attract
  (a formáció önműködő demója) → bármely billentyű → Star Map → Enter →
  játékmenet → szektor-kimenetel → Star Map.
- **Hajó**: alsó sor, vízszintes mozgás (60 blokk/s), 3 hajó, minden
  10 000 pont után +1 hajó.
- **Formáció**: 4 sor × 10 alien (Scout, Warrior, Bodyguard, Warrior-változat),
  csoportosan oszcillál. Az alienek két póz között animálnak (képkockánként
  szinkronban, ~500 ms).
- **Dive-bombázók**: időzítőre egy alien elhagyja a formációt, Bézier-ívű
  bukásban a hajó alá süvíti, az ív 0.3-nál egy bombát ejt, majd vagy
  visszatér a formációba, vagy kamikaze-ként a hajóba csapódik.
- **Flagship Attack Alert**: ha egy Flagship 20 mp-ig a képernyőn marad
  megsemmisítés nélkül, két-tónusú riasztó indul; 5 mp múlva minden élő
  Flagship mindig-halálos villámot lő. Egy Flagship lelövése újraindítja a
  ciklust. (Az eredeti ritka "közel-miss" hibája nem reprodukált: a villám
  mindig halálos.)
- **Eszkaláció**: a szektor-küszöb felett (mély szektorokban hamarabb) a
  riasztó folyamatos, és a Flagship-sor pontokkal nő, amíg meg nem telik.

---

## Pontozás

`pont = alap × (támadó ? 2 : 1) × szektor-szorzó`

| Típus     | Alap  |
| --------- | ----- |
| Scout     | 30    |
| Warrior   | 40    |
| Bodyguard | 50    |
| Flagship  | 80    |

Példa (a terv verifikációs esete): 2. szektorban (×2) egy búvó Scout lelövése
`30 × 2 × 2 = 120` pont.

Az alapértékek a dokumentált szabályok + Galaxian-mintájú rekonstrukció
(az instrukció-képernyő OCR-je megtörtént, de az értékek olvashatatlanok a
felbontásban — lásd `docs/adr/0003-fidelity-reconstruction.md`).

---

## A kampány (a twist)

- **8 szektor** egy vonalban; a front az 1.-nél indul (legkülső/leggyengébb).
- **Győzelem** (5 hullám törlése): front +1. **Vereség** (hajók elfogytak):
  front −1 (szektor-újrapróbálás — nincs kampány-törlés, csak visszavonulás).
- Front 0 = kampány vesztve; front 9 = kampány nyerve.
- Szektoronként rögzített (nem adaptív) visszajelzés:
  - Flagship-ek induláskor: `min(1 + (N−1), 16)`
  - dive-tempó szorzó: `1 + 0.15(N−1)`
  - pontszorzó: `N`
- **Eszkalációs küszöb**: `200 000 / (8N)` (mély = hamarabb, de az 1. szektor
  sosem eszkalálódik), növekedési lépés `max(500, 40 000 / (8N))`.
- **Mentés**: `localStorage` kulcs `gisector.v1` (front, bestFront,
  bestScores[8], stats: flagshipEscapes/sectorsWon/sectorsLost). Verziózott,
  ismeretlen verzió → alapértékek.

---

## Technikai felépítés

- **Platform**: TypeScript (strict, `noUncheckedIndexedAccess`) + Vite
  (vanilla-ts). Nincs UI-framework, nincs játékmotor.
- **Renderelés**: 128×48 blokk-framebuffer → Canvas2D integer upscale →
  kézzel írt WebGL2 CRT pass (scanline 3 soronként, foszfor-bloom +
  előző-kép persistence, barrel-torzítás + vignette). WebGL2 hiányában sima
  integer upscale, soha nem omlik össze.
- **Hang**: WebAudio square `OscillatorNode` (1-bit), 5 ms attack / 15 ms
  release burkoló, kompresszor-limitern keresztül. A zene lookahead
  schedulerrel (0.1 s előre, 25 ms-os pump), a render-looptól függetlenül.
- **Hurok**: `requestAnimationFrame` → felhalmozó (100 ms clamp) → fix
  60 update/s → renderelés. Képkocka-független 60/120/144 Hz-en.

### Könyvtárstruktúra

```
src/
├── main.ts            # boot, fix-timestep loop, állapotgép
├── game/
│   ├── state.ts       # GameState + átmenetek
│   ├── aliens.ts      # formáció-szerepek, dive-útvonalak, riasztó, eszkaláció
│   ├── run.ts         # egy szektor futása (pontozás, hullámok, életek)
│   ├── ship.ts        # hajó (mozgás, egy-lövés szabály)
│   ├── shots.ts       # hajólövés, alien-lövések, bombák, villámok
│   └── scoring.ts     # pontszámítás (alapértékek, extra hajó, eszkaláció)
├── render/
│   ├── framebuffer.ts # 128×48 blokk-rács (az egyetlen rajzfelület)
│   ├── crt.ts         # WebGL2 CRT pass (uTint = egyetlen megjelenítési felület)
│   ├── sprites.ts     # pixel-pontos sprite-sheet (2-frame animáció)
│   └── text.ts        # 3×5 bitmap font
├── audio/
│   ├── sound.ts       # square-wave SFX-készlet (click-free)
│   └── music.ts       # címdallam lookahead schedulerrel
├── input/
│   ├── keyboard.ts    # billentyűzet (él-vezérelt tűz)
│   └── gamepad.ts     # gamepad pollozás
└── meta/
    ├── campaign.ts    # tug-of-war szabályok, szektor-gazdaság
    ├── starmap.ts     # a csillagtérkép képernyő
    └── persistence.ts # gisector.v1 localStorage
```

### Forráshivatkozások

- Referencia képernyőképek (trs-80.org), a blokk-rácsra resample-elt mátrixok
  és az extrakciós jegyzetek: `sprites-source/` (a sprite-ok audit-nyoma).
- Fogalomtár: `CONTEXT.md`. Döntések: `docs/adr/0001..0003`.

---

## Tesztelés / verifikáció

A fejlesztés során böngésző-vezérelt smoke-tesztek futottak az alábbi
kulcsellenőrzésekkel (headless Chromium, a framebuffer-állapot és a
játék-állapot egy `window.__*` debug-hookon keresztül olvasható):

1. Állapotfolyam: Title → Attract → StarMap → Playing → kimenetelek.
2. Hajó-mozgás (60 blokk/s, clampelt), egy-lövés szabály.
3. Pontozás: formatio-warrior = 40; képlet 120 a szektor-2 búvó Scoutra.
4. Flagship Alert: 20 s → riasztó → 5 s → villám → ciklus újraindul.
5. Meta: 5 hullám → front 2; reload után is 2; vesztés → front 1;
   front 8 → CampaignWon; front 1 vesztés → CampaignLost.
6. Eszkaláció: mély szektorban a küszöb elérhető, a Flagship-sor nő.
7. CRT-kimenet: a megjelenített kép álló (nem tükrözött) — a star mapen a
   „SECTOR DEFENSE" felül, az „ENTER ..." prompt alul látszik.
8. Lezárt kampány (front 0 vagy 9): Enter a star mapről új kampányt indít
   (front 1; statisztika és szektoronkénti legjobb pontok megmaradnak).

Debug-hookok (fejlesztéshez): `window.__fb()`, `window.__state()`,
`window.__run()`, `window.__invuln(v)` (verifikáció-only, a játékmenetet nem
érinti).

---

## Hangolás

Minden érzésre ható szám konstans `// tunable` megjegyzéssel van jelölve a
forrásban: hajó/lövés/bomba sebesség (`ship.ts`, `shots.ts`), dive-ívek és
időzítők (`aliens.ts`), riasztó-időzítések (`aliens.ts` — a 20 s/5 s a terv
által rögzített), szektor-gazdaság (`campaign.ts`), SFX/dallam
(`sound.ts`, `music.ts`).

---

## Hivatkozások

- Galaxy Invasion a trs-80.org-on: <http://www.trs-80.org/galaxy-invasion/>
- Super Nova (a Flagship első megjelenése): <http://www.trs-80.org/super-nova/>
- Referencia gameplay-videó (hang-elemzéshez): YouTube `SAPPvqsc5V4`
