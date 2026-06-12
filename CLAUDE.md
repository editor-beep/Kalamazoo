# CLAUDE.md — kalamazoo • through time

Live: **https://kalamazoo.vercel.app/**

A living elegy in six eras. One city — Kalamazoo, Michigan — remembered six times
(1855, 1905, 1959, 1985, 2026, 2050). The river, Burdick Street, Bronson Park, the
rail line, the mill ground, and the celery flats hold their coordinates in every
era; only time changes their clothes. Hand-written residents carry the city's real
history. The river speaks when clicked. The emotional brief, in order: **the
suffering of Kalamazoo, and also the magic, and the poetry.**

## What this is, technically

- **Static site, zero build step.** No bundler, no framework, no root
  `package.json` (deliberate — see invariants). Deploys to Vercel as-is
  (`npx vercel deploy --prod`; framework preset "Other", no build command).
- **Three.js r165, vendored** under `/vendor/three` (MIT). No CDN dependencies.
- Everything visual is **procedural** — no models, no image assets. Brick, signs,
  murals, and ground are canvas textures generated at runtime.

```
index.html          UI shell + import map ("three" → vendored module)
css/style.css       hand-rolled glassmorphism; Fraunces (serif/poetry) + Inter (UI)
js/data.js          THE HEART — all content (see below)
js/shaders.js       sky dome, animated water, film-grade post pass (GLSL)
js/world.js         shared geography assembled six ways → EraWorld objects
js/agents.js        people (walk cycles, hats, props, chats), vehicles, train, particles
js/ui.js            DOM layer (cards, HUD, modals, toasts, story panel)
js/main.js          engine: lighting/day-night, picking, events, compare mode, input
scripts/smoke.mjs   headless test — REQUIRED to pass before any push
vercel.json         caching + headers
```

## Run & verify

```bash
python3 -m http.server 8000        # or: npx serve .   (ES modules need HTTP)
node scripts/smoke.mjs             # builds + simulates all six eras in Node, no browser
```

The smoke test validates every resident record, every landmark stratum, builds all
six worlds, simulates 30 frames each, fuzzes 400 wander targets per era against
the safety bands, and cross-checks every DOM id referenced from JS against
`index.html`. **Run it after every change.** There is no browser in some dev
environments — the code is structured so this is meaningful verification.

## Load-bearing invariants (break these and things quietly rot)

1. **No root `package.json`.** Vercel stays zero-config static, and Node 22's ESM
   syntax auto-detection lets the smoke test import the browser modules directly.
2. **Node-importable modules.** `data.js`, `shaders.js`, `agents.js`, `world.js`,
   `ui.js` must import without a DOM: canvas textures are guarded by `HAS_DOM` in
   `world.js`; all DOM lookups in `ui.js` are lazy (inside functions). Only
   `main.js` may use bare `three/addons/` specifiers (import-map only — it gets a
   syntax check, not an import, in CI).
3. **Three.js is imported via relative path** (`../vendor/three/three.module.min.js`)
   in every module; the import map resolves bare `three` (used by vendored addons)
   to the same URL, so there is exactly one THREE instance.
4. **The shared geography.** Anchored coordinates, identical in every era:
   | Place | Coords | Place | Coords |
   |---|---|---|---|
   | River centerline | x ≈ −34 | Burdick St (the Mall z −24..6) | x = 0 |
   | Michigan Ave | z = 10 | Rail line | z = 40 |
   | Bronson Park | (20, −14) | Mill ground | (−22, −27) |
   | Celery flats | (36, −40) | Allied/superfund | (−18, −52) |
   | Asylum tower hill | (−56, −54) | WMU hill | (−64, 36) |
   | Gibson/Heritage | (28, 50) | State Theatre | (10, −10.5) |
   | Depot | (12, ~45) | Bridge | (−34, 10) |
5. **Safety bands.** Residents must never walk on the river (x ∈ −46..−22.5) or
   loiter on the rails (z ∈ 38..42; depot platform z ≈ 42.3 stays reachable).
   `Agent.pickTarget()` clamps; the smoke test fuzzes it. New anchors/walk logic
   must respect these.
6. **The lighting pass owns emissives.** `applyEnvironment()` in `main.js` writes
   every glow intensity (windows, lamps, marquees, string lights) every frame.
   Per-mesh effects (e.g., 1985's flicker) are flagged via `material.userData`
   and applied *inside* that pass — anything set elsewhere gets overwritten.
7. **Era ordering** is by `era.key` through `since(era, key)` / `only(era, ...keys)`
   in `world.js`: `boiling → celery → mall → paper → living → returns`.

## Content model (`js/data.js`)

- `ERAS[6]` — each: card text, `epigraph` (the transition poem), `welcome` toast,
  `vis` (full visual config: sky/fog/water/grade/foliage/lamps), `riverLines`
  (the river's spoken lines), `events` (kind: `bright | ache | wonder` — ache
  triggers the grief desaturation pulse), and `people`.
- **People** (7–13/era): `name, role, age, look {body, skin, hat, prop}, mood,
  roots (0–100), doing[≥2], memory (what they carry), lines[≥2] (spoken via
  typewriter), thread?` — threads are lineages recurring across eras (`LINEAGES`:
  the Doorns ❧, Harrises ❧, water-keepers 〜, luthiers ♪, Destiny ✶, Whitlocks ❧).
- `STRATA` — per-landmark: `title, kicker, body{eraKey}` (the per-era story shown
  on click) and `layers{eraKey}` (one-liners shown only in the collapsed
  "what stood here in other years" expander).

### Tone guardrails (these made it land — keep them)

- Melancholic **and** hopeful, never one without the other. "Anyway" is the toast.
- Real names only for historical figures (Enoch Harris, Orville Gibson, Caroline
  Bartlett Crane). All living-era people are fictional composites.
- February 2016 is carried gently and **namelessly**. No spectacle, ever.
- Potawatomi presence is real, present-tense, first-name-only characters; the land
  acknowledgment stays. "We were never gone; you just stopped looking."
- The river is the oldest character and gets the last word.

## What's working (per live feedback — don't regress)

Era selection feels poetic *and* grounded; the 3D differentiates eras (river/mill
early, pedestrian mall mid/late); resident dialogue's melancholic-hopeful tone
fits the actual city; City Event + time-of-day give replay value. Golden hour
(`G`) is the showcase light.

---

# Roadmap

Ranked by alignment with the project's taste. Each item lists concrete first
moves mapped to files. Keep the smoke test green; extend it with each feature.

### 1. Deeper layered mythic feel — *the palimpsest pass* (highest priority)
Make eras visibly stacked on each other, not just swapped.
- `world.js`: new `buildEchoes(era, world)` builder — faint remnants of other
  layers, opacity ~0.10–0.18, slightly desaturated: ghost streetcar rails inlaid
  in the 2026/2050 Mall paving; mill foundation outlines in the 2050 ruins lawn;
  the Fountain of the Pioneers' ring as a pale circle in the 2026 park bed;
  celery-row striping bleeding through the 1985 parking lot (the Greta scene,
  literalized); pale survey stakes of the *future* mall visible in 1905 at night
  (echoes can run forward, not just back).
- Tie echo opacity to golden hour / night (`applyEnvironment` already computes
  `eveAmt` — echoes shimmer in at dusk: "memory hour").
- `data.js`: add `era.echoes[]` — ambient one-line toasts surfaced rarely by the
  idle loop ("Under the asphalt, the muck still breathes. Someone planted these
  rows once."). Residents already reference old layers in `lines`; echoes make
  the *city* do it unprompted.
- Smoke: assert every era has ≥2 echoes once added.

### 2. Stronger Kalamazoo specificity
- Street-name signs at intersections (`signTex` already exists — small green
  blades: BURDICK · MICHIGAN · ROSE · SOUTH · PORTAGE).
- Riverwalk in 2026/2050: boardwalk strip + benches + overlook rail along the
  east bank (`buildRiver`, `since(era,'living')`) — the bank the anchors already
  point at.
- WMU energy in 2026/2050: brown-and-gold lamp banners, more `book`-prop
  students near the hill anchor, a Bronco shuttle on the loop.
- One tall 1970s office slab downtown for 1985+ (massing honesty: downtown
  wasn't all 3 stories by then).
- A few more era-true storefront names in `SIGNS` (keep real brands light).

### 3. Better time-travel UX
- **In-scene era scrubber:** a 6-dot timeline rail in the bottom HUD. Switching
  mid-scene keeps the camera where it stands (add `soft` option to `enterEra` —
  skip the camera reset, shorten the epigraph to a ~900ms veil). The payoff:
  stand at the mill and scrub 1905 → 1985 → 2050 without moving.
- **Blend compare:** alternative to the split divider — render era B to a render
  target and crossfade via a mix uniform in a small composite pass (slider in
  the compare HUD). Split mode stays; blend is the "two realities at once" mode.
- Known gap to fix opportunistically: compare mode currently bypasses
  bloom/grade (scissored split vs. full-buffer bloom).

### 4. More expressive agents
- `oldTimer` flag (or derive from `age` + `roots`): extra `remembers[]` lines
  referencing earlier eras — wired into the ask-rotation after `lines` exhaust.
- Time-of-day schedules: weight anchors per phase (mill gate at morning, diner
  at noon, porch at dusk) — extend `Agent.pickTarget` with the current phase.
- Bench-sitting idle (snap to bench seats, fold legs), age-scaled walk speed
  (cane = slower, kids dart).
- Lineage encounters: when two thread-marked agents chat, surface a tiny toast
  ("Two Doorns on the same corner, a century apart in their pockets.").

### 5. Visual & performance polish
- **Seeded determinism (do this first):** replace `Math.random()` in `world.js`
  with a per-era mulberry32 PRNG so the city is *the same city* every visit —
  philosophically load-bearing, not just tidy. (Agent wander stays random.)
- Houses: shutters, porch rails, foundation skirts per era; tighter palettes.
- Shadows: tighten the shadow camera to downtown; consider a second static-bake
  pass for far landmarks.
- Mobile: residents panel as a bottom sheet (<900px it's currently hidden),
  bigger tap targets, `treeCount` reduction on small screens.
- Boot veil: "the city is remembering…" until first rendered frame.
- If perf ever dips: `InstancedMesh` for trees, merged static geometry.

### 6. Weirder / more conceptual — *the city remembers you*
- **Dwell deepening:** track minutes-in-era; thresholds unlock `deepLines` on
  residents and raise echo frequency. Staying somewhere should be rewarded the
  way staying in a real place is.
- **Cross-era consequence (small, magical, cheap):** persist tiny flags in
  `localStorage` — if you heard Greta's seed-jar line in 1985, Marisol's 2050
  greeting acknowledges it ("You're the one Aunt Greta told about the jars.").
  If you watched the sturgeon shadow pass in 2050 first, Ray's 1985 line gains a
  parenthetical. A handful of hand-written pairs beats any system.
- The river could keep count: after N river clicks across all eras, one new line
  exists nowhere else: it addresses you directly.

## Working agreements

- Content changes (new people, lines, strata) go in `data.js` only; the engine
  should never contain prose.
- Every clickable thing must answer in the era's own voice — per-era `body` in
  `STRATA`; the full timeline stays behind the expander (user preference).
- Commit style: what changed and *why it serves the feeling*, not just the tech.
- `node scripts/smoke.mjs` before every push. Extend it alongside features.
