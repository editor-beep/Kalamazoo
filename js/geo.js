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
// Frame: +x East, +z North, Burdick at x=0, Michigan Ave at z=10. Each entry
// carries the real Kalamazoo address/cross-streets it stands for, so this map can
// be checked against a real one. Move a landmark here and the whole engine follows.
export const PLACES = {
  // the spine & the crossing
  bridge:       { x: GEO.riverX, z: GEO.michiganZ, real: 'Michigan Ave crossing of the river' },
  burdick:      { x: GEO.burdickX, z: -9, real: 'Burdick St / the Kalamazoo Mall (Michigan→Lovell)' },

  // the Burdick / Michigan core
  hotel:        { x: 11.5, z: 18.4, real: 'Burdick House → Radisson Plaza, 100 W. Michigan' },
  theatre:      { x: 10, z: -10.5, real: 'State Theatre, 404 S. Burdick (east side of the Mall)' },
  gazette:      { x: -8.2, z: -10.5, real: 'Kalamazoo Gazette, 401 S. Burdick (across from the State)' },
  shakespeares: { x: 16, z: -7, real: "Shakespeare's, 241 E. Michigan" },
  proco:        { x: 16, z: -13, real: 'Pro Co Sound, E. Michigan (the Sound Factory block)' },

  // N. Burdick toward the rails
  rickman:      { x: 10, z: 33.5, real: 'The Rickman / Milner Hotel, N. Burdick near the rails' },
  mission:      { x: -8.4, z: 34.25, real: 'Kalamazoo Gospel Mission, 448 N. Burdick' },
  flipside:     { x: 8.8, z: 26, real: 'Flipside Records, 309 N. Burdick (post-1990)' },
  depot:        { x: 12, z: 45.2, real: 'the depot, just north of the Michigan Central line' },

  // Bronson Park & the west blocks
  park:         { x: -22, z: -6, real: 'Bronson Park, between Park St & Rose St' },
  library:      { x: -19.9, z: -36.5, real: 'Central Library, 315 S. Rose St' },
  clubsoda:     { x: -20.2, z: 16.6, real: 'Club Soda, 1 Main (compressed to the Michigan/Main edge)' },
  planetclaire: { x: -20.2, z: 22.5, real: 'Planet Claire, a Mall-era alternative storefront' },

  // the Vine / south corridor
  fourthcoast:  { x: 3, z: -33, real: 'Fourth Coast Cafe, the Vine neighborhood' },
  upjohn:       { x: 15, z: -33, real: 'Upjohn, 301 John St / the Portage works' },

  // the working ground (south & west)
  mill:         { x: -22, z: -27, real: 'the mill ground / paper mill on the race' },
  flats:        { x: -42, z: -40, real: 'the Celery Flats, the black muck southwest' },
  superfund:    { x: -18, z: -52, real: 'Allied Paper / Portage Creek Superfund ground' },
  tower:        { x: -56, z: -54, real: 'the Asylum (state hospital) water-tower hill' },

  // the far landmarks
  wmu:          { x: -64, z: 36, real: 'Western Michigan University, the hill west of town' },
  gibson:       { x: 16, z: 52, real: 'Gibson / Heritage, 225 Parsons St (north of the rails)' },
  northwest:    { x: -72, z: -16, real: 'KPH Northwest Unit / Blakeslee (the old TB sanatorium)' },
};

// Shared predicates — imported by agents.js (movement) and smoke.mjs (fuzzing).
export const inRiver = x => x > GEO.river.min && x < GEO.river.max;
export const onRails = z => z > GEO.rail.min && z < GEO.rail.max;
