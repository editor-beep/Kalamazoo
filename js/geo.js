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
  southZ: -26,        // South St
  roseX: -14,         // Rose St / River Rd
  riverX: 34,         // east-bank river centerline
  railZ: 40,          // the line, due north — just north of Kalamazoo St
  lovellZ: -8,        // Lovell St — north edge of Bronson Park
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
//   N–S (W→E):  Oakland −56, Westnedge −42, Park −28, Rose −14, Burdick 0, Pitcher 13, Portage 22, River 34
//   E–W (S→N):  Vine −44, South −26, Lovell −8, E. Michigan 10, Kalamazoo 28, North 50, Parsons 58
// Oakland curves into E. Michigan at its south end (handled in world.js geometry).
// East of Burdick the order out to the water is Burdick → Pitcher → Portage →
// river; Pitcher and Portage run only north of the avenue (the Mall/State own the
// blocks south). The grid runs well north now: past the rail (z 40) to North St
// and Parsons St, so the factory blocks (Gibson at 225 Parsons, Checker) sit on
// real streets.
export const STREETS = {
  ns: { oakland: -56, westnedge: -42, park: -28, rose: -14, burdick: 0, pitcher: 13, portage: 22, river: 34 },
  ew: { vine: -44, south: -26, lovell: -8, michigan: 10, kalamazoo: 28, north: 50, parsons: 58 },
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
  hotel:        { x: -8, z: 2, real: 'Burdick House → Radisson Plaza, 100 W. Michigan — south side of the avenue, Burdick–Rose block' },
  clubsoda:     { x: 8, z: 3, real: 'Club Soda, 1 Main — east of the Radisson, south side of E. Michigan' },
  railbldg:     { x: 24, z: 12, real: 'the old rail building, east of Club Soda on the north side of E. Michigan' },
  // Michigan News Agency — 308 W. Michigan, north side of the avenue, west of Rose.
  newsagency:   { x: -24, z: 16, real: 'Michigan News Agency, 308 W. Michigan — north side of the avenue, west of Rose' },

  // N. Burdick corridor (the spine, x≈0) reading south→north. East side, climbing
  // toward the rails: Shakespeare's → Rickman → Pro Co. West side, opposite them:
  // Planet Claire → the Gospel Mission → Flipside. None of it drifts east toward
  // Portage/Pitcher anymore — these are Burdick addresses, so they sit on Burdick.
  busstation:   { x: -9, z: 38, real: 'the bus stand, N. Burdick just south of the rail depot' },
  shakespeares: { x: 5, z: 15, real: "Shakespeare's Lower Level, N. Burdick at the Michigan corner — east side" },
  rickman:      { x: 5, z: 22, real: 'The Rickman / Milner Hotel, N. Burdick — east side, climbing toward the rails' },
  proco:        { x: 5, z: 30, real: 'Pro Co Sound — the Sound Factory block, N. Burdick by the rails (east side)' },
  planetclaire: { x: -5.5, z: 19, real: 'Planet Claire — west side of N. Burdick, opposite the Rickman' },
  mission:      { x: -5.5, z: 26, real: 'Kalamazoo Gospel Mission, 448 N. Burdick — west side, opposite the pubs' },
  flipside:     { x: -6, z: 33, real: 'Flipside Records, 309 N. Burdick after the 1990 move — west side near the rails' },
  depot:        { x: 8, z: 45.2, real: 'the depot, just north of the Michigan Central line' },

  // Bronson Park & the west blocks — the park is the square bounded by
  // Rose / Lovell / E. Michigan / South. The library sits at its east edge on Lovell.
  park:         { x: -21, z: 1, real: 'Bronson Park, the square between Rose, Lovell, E. Michigan and South' },
  library:      { x: -14, z: -8, real: 'Central Library, 315 S. Rose St — east edge of the park on Lovell' },

  // the Burdick / Michigan core (the Mall, south of Lovell) — the State and the
  // Gazette flank the pedestrian Mall, east and west, not standing in it.
  theatre:      { x: 9.5, z: -9, real: 'State Theatre, 404 S. Burdick — east side of the Mall' },
  gazette:      { x: -8.1, z: -9, real: 'Kalamazoo Gazette, 401 S. Burdick — west side of the Mall, across from the State' },

  // the Vine / south corridor — Fourth Coast pulled in toward downtown (it sat
  // too far south); East Hall is WMU's first building, on the East Campus hill.
  fourthcoast:  { x: -30, z: -20, real: 'Fourth Coast Cafe, the south-downtown corridor (Westnedge/Vine)' },
  easthall:     { x: -52, z: -50, real: "East Hall → Heritage Hall, WMU's first building on the East Campus hill" },
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
  // the north factory blocks — past the rail (40) and North St (50): Gibson on
  // Parsons St (58), Checker directly north of it, the Northwest Unit far west
  // on the same Parsons line. Spread north so nothing sits on top of anything.
  gibson:       { x: 12, z: 64, real: 'Gibson / Heritage, 225 Parsons St — north of North St' },
  checker:      { x: 12, z: 76, real: 'Checker Motors cab plant — directly north of Gibson, north of Parsons' },
  northwest:    { x: -56, z: 64, real: 'KPH Northwest Unit / Blakeslee — far west, on the Parsons line' },
};

// Shared predicates — imported by agents.js (movement) and smoke.mjs (fuzzing).
export const inRiver = x => x > GEO.river.min && x < GEO.river.max;
export const onRails = z => z > GEO.rail.min && z < GEO.rail.max;
