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
  michiganZ: 10,      // the E–W avenue (E. Michigan)
  southZ: -8,         // South St — the park's south edge, one block below Michigan
  roseX: -14,         // Rose St / River Rd
  riverX: 34,         // east-bank river centerline
  railZ: 40,          // the line, due north — just north of Kalamazoo St
  lovellZ: -26,       // Lovell St — the south end of the Mall (below South St)
  kalamazooZ: 28,     // Kalamazoo St — the bus-station / mission row
  northZ: 50,         // North St

  // the law: no one walks the water, no one loiters on the iron.
  river: { min: 22.5, max: 46 },
  rail: { min: 38, max: 42 },

  // depot platform stays reachable just north of the rail band.
  depotPlatformZ: 42.3,
};

// The street grid, in ONE place. N–S running streets carry an x; E–W running
// streets carry a z. The map is built off these; landmarks sit at intersections.
//   N–S (W→E):  Oakland −56, Westnedge −42, Park −28, Rose −14, Burdick 0, Portage 13, Pitcher 22, River 34
//   E–W (S→N):  Vine −44, Lovell −26, South −8, E. Michigan 10, Kalamazoo 28, North 50, Parsons 58
//   (real order: Lovell is the south end of the Mall; South St is the park's
//    south edge, one block below Michigan — the two used to be reversed here.)
// Oakland curves into E. Michigan at its south end (handled in world.js geometry).
// East of Burdick the real order out to the water is Burdick → (Edwards) →
// Portage → Pitcher → river (Pitcher hugs the river). Portage and Pitcher run
// only north of the avenue (the Mall/State own the blocks south). The grid runs
// well north now: past the rail (z 40) to North St and Parsons St, so the
// factory blocks (Gibson/Pro Co at 225 Parsons, Checker on N. Pitcher) sit right.
export const STREETS = {
  ns: { oakland: -56, westnedge: -42, park: -28, rose: -14, burdick: 0, portage: 13, pitcher: 22, river: 34 },
  ew: { vine: -44, lovell: -26, south: -8, michigan: 10, kalamazoo: 28, north: 50, parsons: 58 },
};

// Every named landmark's anchor, in ONE place — the single source of truth the
// builders read (world.js), so a position can never again disagree between files.
// Frame: +x East, +z North, Burdick at x=0, E. Michigan at z=10.
// Each entry carries the real address it stands for. Move one here, the engine follows.
export const PLACES = {
  // the spine & the crossings
  bridge:       { x: GEO.riverX, z: GEO.michiganZ, real: 'Michigan Ave crossing of the river' },
  burdick:      { x: GEO.burdickX, z: -9, real: 'Burdick St / the Kalamazoo Mall (Michigan→Lovell)' },

  // E. Michigan row — the Radisson seated on the avenue's south side in the block
  // between Burdick and Rose (Rose runs N–S, E. Michigan E–W; the hotel sits at
  // their corner), Club Soda just east of it. Anchors are the BUILT centers now.
  hotel:        { x: -8, z: 4, real: 'Burdick House → Radisson Plaza, 100 W. Michigan — south side of the avenue, Burdick–Rose block' },
  clubsoda:     { x: 8, z: 4, real: 'Club Soda, 1 Main — east of the Radisson, south side of E. Michigan' },
  railbldg:     { x: 24, z: 12, real: 'the old rail building, east of Club Soda on the north side of E. Michigan' },
  // Michigan News Agency — 308 W. Michigan, north side of the avenue, west of Rose.
  newsagency:   { x: -24, z: 16, real: 'Michigan News Agency, 308 W. Michigan — north side of the avenue, west of Rose' },

  // N. Burdick corridor (the spine, x≈0) by real street address, south→north:
  // Flipside (309) → Rickman (345) → Gospel Mission (448), alternating sides.
  // Shakespeare's is NOT on Burdick — it's 241 E. Kalamazoo Ave, in the old
  // Shakespeare fishing-rod building, east of the spine on the avenue.
  busstation:   { x: -9, z: 38, real: 'the bus stand, N. Burdick just south of the rail depot' },
  planetclaire: { x: -2, z: 15, real: 'Planet Claire — west side of N. Burdick (alt storefront)' },
  flipside:     { x: 5, z: 20, real: 'Flipside Records, 309 N. Burdick (moved across the street 1990, closed 2001)' },
  rickman:      { x: -5.5, z: 27, real: 'The Rickman House, 345 N. Burdick (Milner Hotel by 1944) — west side' },
  // the depot, the Gospel Mission and Shakespeare's sit in one E–W row just
  // SOUTH of the rail line (shared z), neighbors along the avenue — depot westmost.
  mission:      { x: 8, z: 34, real: 'Kalamazoo Gospel Mission, 448 N. Burdick — east side, by Kalamazoo Ave' },
  shakespeares: { x: 15, z: 34, real: "Shakespeare's Pub, 241 E. Kalamazoo Ave — the old Shakespeare rod building, east of Burdick" },
  depot:        { x: 0, z: 34, real: 'the Transportation Center / depot, 459 N. Burdick, just south of the Michigan Central line' },

  // Bronson Park & the west blocks — the square between Park St and Rose St,
  // one block south of Michigan; its south edge is South St. The library sits at
  // the park's south edge, on Rose.
  park:         { x: -21, z: 1, real: 'Bronson Park, between Park & Rose, one block south of E. Michigan' },
  library:      { x: -14, z: -8, real: "Central Library, 315 S. Rose St — at the park's south edge (South St)" },

  // the Burdick / Michigan core (the South Mall, between South St and Lovell) —
  // the State and the Gazette flank the pedestrian Mall, east and west, not in it.
  theatre:      { x: -6, z: -9, real: 'State Theatre, 404 S. Burdick — west side of the Mall' },
  gazette:      { x: 7, z: -9, real: 'Kalamazoo Gazette, 401 S. Burdick — east side of the Mall, across from the State' },

  // the Vine / south corridor — Fourth Coast at 816 S. Westnedge in the Vine
  // neighborhood; East Hall is WMU's first building, on the East Campus hill.
  fourthcoast:  { x: -38, z: -32, real: 'Fourth Coast Cafe, 816 S. Westnedge Ave — the Vine neighborhood, south of Lovell' },
  easthall:     { x: -30, z: -40, real: "East Hall → Heritage Hall, WMU's first building — the East Campus / Prospect Hill knoll SW of downtown" },
  upjohn:       { x: 15, z: -33, real: 'Upjohn, 301 John St / the Portage works (east, south of downtown)' },

  // the working ground (south & west) — off the surveyed downtown sheet.
  // the mill now sits just north of the superfund ground.
  mill:         { x: -14, z: -48, real: 'the mill ground / paper mill — just north of the superfund' },
  superfund:    { x: -14, z: -58, real: 'Allied Paper / Portage Creek Superfund ground' },
  flats:        { x: 3, z: -44, real: 'the Celery Flats, on Vine (swapped with Fourth Coast)' },
  tower:        { x: -50, z: -50, real: 'the Asylum (state hospital) water-tower hill, far southwest' },

  // the far landmarks — off the surveyed downtown sheet.
  // WMU lies further west than Oakland and further south than the Asylum tower.
  wmu:          { x: -68, z: -58, real: 'Western Michigan University, the hill west and south of town' },
  // the north factory blocks — past the rail (40) / North St (50) / Parsons (58),
  // toward the river: Gibson's 1917 daylight factory at 225 Parsons (Pro Co Sound
  // shared the complex), Checker's plant further north-and-east on N. Pitcher,
  // the Northwest Unit far west on Blakeslee.
  gibson:       { x: 16, z: 64, real: 'Gibson / Heritage, 225 Parsons St — the 1917 daylight factory, north toward the river' },
  proco:        { x: 16, z: 57, real: 'Pro Co Sound, 225 Parsons St — the RAT pedal born in the Gibson complex' },
  checker:      { x: 17, z: 80, real: 'Checker Motors, 2016 N. Pitcher St — north plant near the river' },
  northwest:    { x: -56, z: 64, real: 'KPH Northwest Unit / Blakeslee Ave — far northwest' },
};

// Shared predicates — imported by agents.js (movement) and smoke.mjs (fuzzing).
export const inRiver = x => x > GEO.river.min && x < GEO.river.max;
export const onRails = z => z > GEO.rail.min && z < GEO.rail.max;
