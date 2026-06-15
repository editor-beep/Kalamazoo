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
//   N–S (W→E):  Oakland −56, Westnedge −42, Park −28, Rose −14, Burdick 0, River 34
//   E–W (S→N):  Vine −44, South −26, Lovell −8, E. Michigan 10, Kalamazoo 28, North 50
// Oakland curves into E. Michigan at its south end (handled in world.js geometry).
export const STREETS = {
  ns: { oakland: -56, westnedge: -42, park: -28, rose: -14, burdick: 0, river: 34 },
  ew: { vine: -44, south: -26, lovell: -8, michigan: 10, kalamazoo: 28, north: 50 },
};

// Every named landmark's anchor, in ONE place — the single source of truth the
// builders read (world.js), so a position can never again disagree between files.
// Frame: +x East, +z North, Burdick at x=0, E. Michigan at z=10.
// Each entry carries the real address it stands for. Move one here, the engine follows.
export const PLACES = {
  // the spine & the crossings
  bridge:       { x: GEO.riverX, z: GEO.michiganZ, real: 'Michigan Ave crossing of the river' },
  burdick:      { x: GEO.burdickX, z: -9, real: 'Burdick St / the Kalamazoo Mall (Michigan→Lovell)' },

  // E. Michigan row — Radisson on the SE corner of E. Michigan & Rose, Club Soda
  // just east on the south side, the old rail building east again on the north side.
  hotel:        { x: -10, z: 10, real: 'Burdick House → Radisson Plaza, 100 W. Michigan — SE corner of E. Michigan & Rose' },
  clubsoda:     { x: 8, z: 9, real: 'Club Soda, 1 Main — east of the Radisson, south side of E. Michigan' },
  railbldg:     { x: 24, z: 12, real: 'the old rail building, east of Club Soda on the north side of E. Michigan' },

  // Kalamazoo St row — bus station, then the Gospel Mission directly east of it,
  // then Shakespeare's and Pro Co continuing east on the same street.
  busstation:   { x: -9, z: 28, real: 'the bus station, N. Burdick at Kalamazoo St' },
  mission:      { x: 7, z: 28, real: 'Kalamazoo Gospel Mission, 448 N. Burdick — directly east of the bus station' },
  shakespeares: { x: 24, z: 28, real: "Shakespeare's, 241 E. Michigan — east on Kalamazoo St" },
  proco:        { x: 33, z: 32, real: 'Pro Co Sound — the Sound Factory block, east on Kalamazoo St' },

  // N. Burdick toward the rails — Rickman directly south of the Mission.
  rickman:      { x: 7, z: 18, real: 'The Rickman / Milner Hotel, N. Burdick — directly south of the Mission' },
  flipside:     { x: 4, z: 20, real: 'Flipside Records, 309 N. Burdick, post-1990' },
  planetclaire: { x: 4, z: 16, real: 'Planet Claire, a Mall-era alternative storefront — just south of Flipside' },
  depot:        { x: 8, z: 45.2, real: 'the depot, just north of the Michigan Central line' },

  // Bronson Park & the west blocks — the park is the square bounded by
  // Rose / Lovell / E. Michigan / South. The library sits at its east edge on Lovell.
  park:         { x: -21, z: 1, real: 'Bronson Park, the square between Rose, Lovell, E. Michigan and South' },
  library:      { x: -14, z: -8, real: 'Central Library, 315 S. Rose St — east edge of the park on Lovell' },

  // the Burdick / Michigan core (the Mall, south of Lovell)
  theatre:      { x: 4, z: -16, real: 'State Theatre, 404 S. Burdick — east side of the Mall' },
  gazette:      { x: -4, z: -16, real: 'Kalamazoo Gazette, 401 S. Burdick — across the Mall from the State' },

  // the Vine / south corridor — East Hall just west of Fourth Coast.
  fourthcoast:  { x: -42, z: -52, real: 'Fourth Coast Cafe, the far southwest ground (swapped with the Flats)' },
  easthall:     { x: -52, z: -54, real: 'East Hall, just west of Fourth Coast' },
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
  gibson:       { x: 16, z: 52, real: 'Gibson / Heritage, 225 Parsons St — north of the rails' },
  checker:      { x: 14, z: 60, real: 'the Checker Factory, north of Gibson' },
  northwest:    { x: -56, z: 48, real: 'KPH Northwest Unit / Blakeslee — the far northwest corner' },
};

// Shared predicates — imported by agents.js (movement) and smoke.mjs (fuzzing).
export const inRiver = x => x > GEO.river.min && x < GEO.river.max;
export const onRails = z => z > GEO.rail.min && z < GEO.rail.max;
