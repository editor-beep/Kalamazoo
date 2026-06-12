# kalamazoo • through time

*A living elegy in six eras.*

One city, remembered six times. The river, Burdick Street, Bronson Park, the rail
line, the mill ground, the celery flats — every place holds its coordinates in every
era. Only time moves. Walk through **1855, 1905, 1959, 1985, 2026, and 2050** and meet
hand-written residents who carry the city's real history: the Potawatomi who stayed,
the corset strike brewing, the first pedestrian mall in America, the tornado of 1980,
the PCBs in the river, the guitars that left and the craftsmen who didn't, the
anonymous Promise, the vaccine that circled the world, and a sturgeon under the
Michigan Avenue bridge like a returned letter.

Everything is procedural — no models, no assets, no build step. Three.js, custom
shaders (sky, water, film grade), and a lot of love for one Michigan city.

## Run it locally

Any static file server works:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL. (Opening `index.html` from disk won't work — ES modules
need HTTP.)

## Deploy to Vercel

Zero configuration — it's a static site:

```bash
npx vercel deploy --prod
```

Or import the repository in the Vercel dashboard: **Framework preset: Other**, no
build command, output directory = repository root. `vercel.json` handles caching
and headers. Three.js is vendored under `/vendor`, so there are no CDN
dependencies and no install step.

## How to be in this city

- **Click anyone** — hear what they're doing, what they carry, then ask about
  their Kalamazoo (some families recur across eras — look for the ❧ marks).
- **Click buildings and ground** — the mill, the Mall, the park, the depot, the
  asylum tower, the superfund cap, the flats — each tells its story *for the era
  you're standing in*. The full column of time waits behind a small
  "what stood here in other years" expander.
- **Click the river.** It has the longest memory of all. Every third click it
  tells you the whole story.
- **City Event** (`E`) lets something happen — bright, aching, or strange.
- **Compare** (`C`) holds two eras side by side with a draggable divider — same
  camera, same streets, different decades.
- Time of day controls, `T` to advance 2h, *Let time flow* for a full day in ~7
  minutes. Golden hour is the city's best light. Night brings the windows on.

| Key | Action |
|-----|--------|
| `1`–`6` | Jump between eras |
| `T` | Advance two hours |
| `M` `D` `G` `N` | Morning · noon · golden hour · night |
| `E` | City event |
| `C` | Compare two eras |
| `P` | Replay the era's poem |
| `R` | Reset the view |
| `Esc` | Close / back |

## Structure

```
index.html          UI shell + import map
css/style.css       glassmorphic UI, no framework
js/data.js          THE HEART: ~60 residents, river voices, poems, landmark strata
js/shaders.js       sky dome, living water, cinematic grade pass
js/world.js         shared geography built six ways
js/agents.js        people (walk cycles, hats, chats), vehicles, the train, particles
js/ui.js            DOM layer
js/main.js          engine: lighting, picking, events, compare mode
vendor/three/       three.js r165 (MIT), vendored — no CDN
scripts/smoke.mjs   headless build-all-six-eras test (node scripts/smoke.mjs)
```

## Honesty notes

Residents are fictional composites, except where history offers its own people
(Enoch Harris, Orville Gibson, Caroline Bartlett Crane), used with respect. Recent
grief — February 2016 — is carried gently and namelessly, the way the city carries
it. The Sandburg lines are from "The Sins of Kalamazoo" (1920, public domain).
Nothing here is historically perfect; everything is meant to be emotionally true.

Built on the homelands of the Potawatomi — the Match-E-Be-Nash-She-Wish Band and
the Pokagon Band among them — who are still here. The water kept its name.
