// Map definitions. Collision, spawns, bomb sites and loot live here (shared by client and server);
// `theme` only tells the client how to draw the map.
export type TeamId = 'T' | 'CT';
export type WallKind = 'outer' | 'shop' | 'fountain' | 'barrier' | 'crate' | 'scooter';
export interface Rect { x: number; y: number; w: number; h: number; kind?: WallKind }
export interface Site { id: string; x: number; y: number; r: number }
export type MapTheme = 'town' | 'dock' | 'desert';

export interface MapDef {
  id: string;
  name: string;
  blurb: string;
  theme: MapTheme;
  walls: Rect[];                    // every rect blocks movement and bullets
  sites: Site[];                    // bomb sites A and B
  spawns: Record<TeamId, Rect>;
  heal: { x: number; y: number }[]; // health pickups (respawn)
  loot: { x: number; y: number }[]; // cash stacks (refill every round)
}

const W = 1600, H = 1200;
const outer = (): Rect[] => [
  { x: 0, y: 0, w: W, h: 20, kind: 'outer' },
  { x: 0, y: H - 20, w: W, h: 20, kind: 'outer' },
  { x: 0, y: 0, w: 20, h: H, kind: 'outer' },
  { x: W - 20, y: 0, w: 20, h: H, kind: 'outer' },
];
const SPAWNS: Record<TeamId, Rect> = { T: { x: 70, y: 420, w: 120, h: 360 }, CT: { x: 1410, y: 420, w: 120, h: 360 } };
/** Mirror a rect about the map centre (layouts are point-symmetric so both teams get the same map). */
const mirror = (r: Rect): Rect => ({ ...r, x: W - r.x - r.w, y: H - r.y - r.h });
const withMirror = (rects: Rect[]): Rect[] => rects.flatMap((r) => [r, mirror(r)]);

const town: MapDef = {
  id: 'town', name: 'Old Town', theme: 'town',
  blurb: 'Sunny Mediterranean plaza with plaster shops, a fountain wall and tight lanes.',
  walls: [
    ...outer(),
    { x: 400, y: 300, w: 200, h: 40, kind: 'shop' }, { x: 1000, y: 300, w: 200, h: 40, kind: 'shop' },
    { x: 400, y: 860, w: 200, h: 40, kind: 'shop' }, { x: 1000, y: 860, w: 200, h: 40, kind: 'shop' },
    { x: 740, y: 500, w: 120, h: 200, kind: 'fountain' },
    { x: 250, y: 560, w: 40, h: 160, kind: 'barrier' }, { x: 1310, y: 560, w: 40, h: 160, kind: 'barrier' },
    { x: 620, y: 150, w: 44, h: 44, kind: 'crate' }, { x: 936, y: 206, w: 44, h: 44, kind: 'crate' },
    { x: 936, y: 1006, w: 44, h: 44, kind: 'crate' }, { x: 620, y: 950, w: 44, h: 44, kind: 'crate' },
    { x: 560, y: 580, w: 44, h: 44, kind: 'crate' }, { x: 996, y: 576, w: 44, h: 44, kind: 'crate' },
    { x: 520, y: 230, w: 34, h: 16, kind: 'scooter' }, { x: 1046, y: 954, w: 34, h: 16, kind: 'scooter' },
  ],
  sites: [{ id: 'A', x: 800, y: 200, r: 90 }, { id: 'B', x: 800, y: 1000, r: 90 }],
  spawns: SPAWNS,
  heal: [{ x: 500, y: 600 }, { x: 1100, y: 600 }, { x: 800, y: 430 }, { x: 800, y: 770 }],
  loot: [{ x: 330, y: 170 }, { x: 1270, y: 1030 }, { x: 660, y: 600 }, { x: 940, y: 600 }, { x: 480, y: 720 }, { x: 1120, y: 480 }],
};

const dock: MapDef = {
  id: 'dock', name: 'Harbor Docks', theme: 'dock',
  blurb: 'Foggy container yard: long steel lanes, warehouses for cover and a floodlit site at each end.',
  walls: [
    ...outer(),
    ...withMirror([
      { x: 300, y: 240, w: 240, h: 44, kind: 'shop' },       // container rows
      { x: 560, y: 380, w: 44, h: 170, kind: 'shop' },
      { x: 290, y: 520, w: 130, h: 160, kind: 'fountain' },  // warehouses
      { x: 760, y: 330, w: 80, h: 30, kind: 'barrier' },
      { x: 600, y: 250, w: 44, h: 44, kind: 'crate' },
      { x: 1000, y: 250, w: 44, h: 44, kind: 'crate' },
    ]),
    { x: 680, y: 560, w: 240, h: 80, kind: 'shop' },         // container stack in the middle
  ],
  sites: [{ id: 'A', x: 700, y: 140, r: 90 }, { id: 'B', x: 900, y: 1060, r: 90 }],
  spawns: SPAWNS,
  heal: [{ x: 500, y: 600 }, { x: 1100, y: 600 }, { x: 800, y: 300 }, { x: 800, y: 900 }],
  loot: [{ x: 260, y: 160 }, { x: 1340, y: 1040 }, { x: 620, y: 720 }, { x: 980, y: 480 }, { x: 800, y: 470 }, { x: 800, y: 730 }],
};

const desert: MapDef = {
  id: 'desert', name: 'Dune Outpost', theme: 'desert',
  blurb: 'Open sand with scattered adobe ruins and a stone well. Long sight lines, so bring a rifle.',
  walls: [
    ...outer(),
    ...withMirror([
      { x: 330, y: 200, w: 170, h: 90, kind: 'shop' },       // adobe houses
      { x: 1100, y: 200, w: 170, h: 90, kind: 'shop' },
      { x: 520, y: 460, w: 90, h: 150, kind: 'shop' },
      { x: 200, y: 420, w: 120, h: 36, kind: 'barrier' },    // low sandstone walls
      { x: 640, y: 260, w: 44, h: 44, kind: 'crate' },
      { x: 930, y: 300, w: 44, h: 44, kind: 'crate' },
    ]),
    { x: 760, y: 540, w: 80, h: 120, kind: 'fountain' },     // the well
  ],
  sites: [{ id: 'A', x: 1100, y: 430, r: 90 }, { id: 'B', x: 500, y: 770, r: 90 }],
  spawns: SPAWNS,
  heal: [{ x: 430, y: 600 }, { x: 1170, y: 600 }, { x: 800, y: 300 }, { x: 800, y: 900 }],
  loot: [{ x: 360, y: 420 }, { x: 1240, y: 780 }, { x: 800, y: 180 }, { x: 800, y: 1020 }, { x: 660, y: 760 }, { x: 940, y: 440 }],
};

export const MAPS: Record<string, MapDef> = { town, dock, desert };
export const MAP_IDS = Object.keys(MAPS);
export const getMap = (id?: string): MapDef => (id && MAPS[id]) || MAPS.town;

// The first map doubles as the default / backwards-compatible set of constants.
export const WALLS = town.walls;
export const SITES = town.sites;
export const SPAWN_ZONES = town.spawns;
export const PICKUP_SPOTS = town.heal;
export const LOOT_SPOTS = town.loot;
