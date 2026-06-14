// The shared geography — the one contract every module agrees on.
// Node-importable (no DOM), so world.js (browser), agents.js, and the smoke
// test all read the same numbers. The safety bands used to live as raw literals
// duplicated in agents.js AND smoke.mjs; they live here now, once.
//
// Survey-true frame (per the reference map, un-mirrored): +x = East, +z = North.
// Burdick St is the N–S spine at x = 0; the river runs down the EAST edge.
// (Pre-survey the river sat on the west — that was the city remembered backwards.)

export const GEO = {
  burdickX: 0,        // the Mall / N–S spine
  michiganZ: 10,      // the E–W avenue
  southZ: -26,        // South St
  roseX: -14,         // Rose St / River Rd
  portageX: 20,       // Portage St — the drawn road & the loop's east leg (was 31,
                      //   a stale value that matched neither the road nor the loop)
  railZ: 40,          // the line, due north
  riverX: 34,         // east-bank river centerline

  // the law: no one walks the water, no one loiters on the iron.
  river: { min: 22.5, max: 46 },
  rail: { min: 38, max: 42 },

  // depot platform stays reachable just north of the rail band.
  depotPlatformZ: 42.3,
};

// Every named landmark's anchor, in ONE place — the single source of truth the
// builders read (world.js), so a position can never again disagree between files.
// Frame: +x East, +z North, Burdick at x=0, Michigan Ave at z=10.
//
// DOWNTOWN anchors are projected from the real Kalamazoo street grid (the
// hand-surveyed map), where Burdick & Michigan = grid (5.5, 4.5):
//     x = (gx − 5.5) × 14     z = 10 + (gy − 4.5) × 18
// These scales are exactly the ones that keep Rose at −14 and South at −26, so
// every building now sits on its real corner. Grid streets (W→E): Oakland 1.5,
// Westnedge 2.5, Park 3.5, Rose 4.5, Burdick 5.5, Portage 6.5, Pitcher 7.5;
// (S→N): Vine 1.5, South 2.5, Lovell 3.5, Michigan 4.5, Kalamazoo 6.0, North 7.5.
// OFF-MAP anchors (mill, flats, superfund, tower, WMU, Gibson, Northwest) lie
// outside the surveyed downtown sheet and stay at their established artistic spots.
// Each entry carries the real address it stands for. Move one here, the engine follows.
export const PLACES = {
  // the spine & the crossing
  bridge:       { x: GEO.riverX, z: GEO.michiganZ, real: 'Michigan Ave crossing of the river' },
  burdick:      { x: GEO.burdickX, z: -9, real: 'Burdick St / the Kalamazoo Mall (Michigan→Lovell)' },

  // the Burdick / Michigan core
  hotel:        { x: -7, z: 19, real: 'Burdick House → Radisson Plaza, 100 W. Michigan (grid 5.0, 5.0)' },
  theatre:      { x: 8, z: -10, real: 'State Theatre, 404 S. Burdick — lining the Mall east side' },
  gazette:      { x: -8, z: -10, real: 'Kalamazoo Gazette, 401 S. Burdick — Mall west side, facing the State' },
  shakespeares: { x: 16, z: -7, real: "Shakespeare's, 241 E. Michigan — east of the Mall, clear of the office slab" },
  proco:        { x: 16, z: -13, real: 'Pro Co Sound, E. Michigan — the Sound Factory block' },

  // N. Burdick toward the rails
  rickman:      { x: 4.2, z: 35.2, real: 'The Rickman / Milner Hotel, N. Burdick near the rails (grid 5.8, 5.9)' },
  mission:      { x: -4.2, z: 37, real: 'Kalamazoo Gospel Mission, 448 N. Burdick (grid 5.2, 6.0)' },
  flipside:     { x: 5.6, z: 24.4, real: 'Flipside Records, 309 N. Burdick, post-1990 (grid 5.9, 5.3)' },
  depot:        { x: 7, z: 45.2, real: 'the depot, just north of the Michigan Central line (grid 6.0)' },

  // Bronson Park & the west blocks
  park:         { x: -21, z: -17, real: 'Bronson Park — the Park↔Rose × Lovell↔South block (grid 4.0, 3.0)' },
  library:      { x: -10, z: -31, real: 'Central Library, 315 S. Rose St — just south of South St' },
  clubsoda:     { x: -16.8, z: 13.6, real: 'Club Soda, 1 Main, the west Michigan edge (grid 4.3, 4.7)' },
  planetclaire: { x: -16.8, z: 22.6, real: 'Planet Claire, a Mall-era alternative storefront (grid 4.3, 5.2)' },

  // the Vine / south corridor
  fourthcoast:  { x: -12.6, z: -40.4, real: 'Fourth Coast Cafe, the Vine neighborhood (grid 4.6, 1.7)' },
  upjohn:       { x: 9.8, z: -35, real: 'Upjohn, 301 John St / the Portage works, east of Burdick (grid 6.2, 2.0)' },

  // the working ground (south & west) — off the surveyed downtown sheet
  mill:         { x: -22, z: -27, real: 'the mill ground / paper mill on the race' },
  flats:        { x: -42, z: -40, real: 'the Celery Flats, the black muck southwest' },
  superfund:    { x: -18, z: -52, real: 'Allied Paper / Portage Creek Superfund ground' },
  tower:        { x: -56, z: -54, real: 'the Asylum (state hospital) water-tower hill' },

  // the far landmarks — off the surveyed downtown sheet
  wmu:          { x: -64, z: 36, real: 'Western Michigan University, the hill west of town' },
  gibson:       { x: 16, z: 52, real: 'Gibson / Heritage, 225 Parsons St (north of the rails)' },
  northwest:    { x: -72, z: -16, real: 'KPH Northwest Unit / Blakeslee (the old TB sanatorium)' },
};

// Shared predicates — imported by agents.js (movement) and smoke.mjs (fuzzing).
export const inRiver = x => x > GEO.river.min && x < GEO.river.max;
export const onRails = z => z > GEO.rail.min && z < GEO.rail.max;
