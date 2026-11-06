// Map definitions. Collision, spawns, bomb sites and loot live here (shared by client and server);
// `theme` only tells the client how to draw the map.
export type TeamId = 'T' | 'CT';
export type WallKind = 'outer' | 'shop' | 'fountain' | 'barrier' | 'crate' | 'scooter';
export interface Rect { x: number; y: number; w: number; h: number; kind?: WallKind }
export interface Site { id: string; x: number; y: number; r: number }
export type MapTheme = 'town' | 'dock' | 'desert' | 'village';

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
  supply?: { x: number; y: number }[]; // spots where supply items (medkits, grenades) lie
}

const W = 1600, H = 1200;                 // the layouts below are drawn on this base grid ...
export const MAP_SCALE = 1.5;                // ... and then enlarged: 2.25x the playing area, with extra cover to hide behind
export const WORLD_W = W * MAP_SCALE;        // 2400
export const WORLD_H = H * MAP_SCALE;        // 1800
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

const village: MapDef = {
  id: 'village', name: 'Medieval Village', theme: 'village',
  blurb: 'Plaster cottages with tiled roofs, a stone mill tower and muddy lanes. Close fights around the houses.',
  walls: [
    ...outer(),
    ...withMirror([
      { x: 340, y: 220, w: 210, h: 120, kind: 'shop' },      // cottages
      { x: 600, y: 380, w: 110, h: 150, kind: 'shop' },
      { x: 330, y: 800, w: 150, h: 200, kind: 'shop' },
      { x: 240, y: 540, w: 40, h: 150, kind: 'barrier' },    // low stone walls
      { x: 520, y: 600, w: 44, h: 44, kind: 'crate' },
      { x: 900, y: 330, w: 44, h: 44, kind: 'crate' },
      { x: 700, y: 140, w: 34, h: 16, kind: 'scooter' },     // hay wagons
    ]),
    { x: 740, y: 520, w: 120, h: 160, kind: 'fountain' },    // the mill tower in the middle
  ],
  sites: [{ id: 'A', x: 800, y: 170, r: 90 }, { id: 'B', x: 800, y: 1030, r: 90 }],
  spawns: SPAWNS,
  heal: [{ x: 520, y: 430 }, { x: 1080, y: 770 }, { x: 800, y: 360 }, { x: 800, y: 840 }],
  loot: [{ x: 300, y: 150 }, { x: 1300, y: 1050 }, { x: 560, y: 720 }, { x: 1040, y: 480 }, { x: 660, y: 330 }, { x: 940, y: 870 }],
};

// ---------- enlarge every map ----------
const isLow = (r: Rect) => r.kind === 'crate' || r.kind === 'barrier' || r.kind === 'scooter';
const overlaps = (a: Rect, b: Rect, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const K = MAP_SCALE;
/** Positions stretch by K, buildings grow by 1.25 (so the streets between them get wide), low cover keeps its size. */
const grow = (r: Rect): Rect => {
  const sz = isLow(r) ? 1 : 1.25, w = r.w * sz, h = r.h * sz;
  return { ...r, x: Math.round((r.x + r.w / 2) * K - w / 2), y: Math.round((r.y + r.h / 2) * K - h / 2), w: Math.round(w), h: Math.round(h) };
};
const spot = (p: { x: number; y: number }) => ({ x: Math.round(p.x * K), y: Math.round(p.y * K) });

/**
 * Low cover scattered over the open ground: crates and low walls you can jump over, kneel behind (hidden from standing shooters)
 * and stand up from to shoot. Defined on the base grid and mirrored. Any piece that would land on a building, a spawn or a
 * bomb site is dropped automatically, so the same candidates work on every map.
 */
const COVER: Rect[] = [
  { x: 430, y: 470, w: 44, h: 44, kind: 'crate' }, { x: 474, y: 470, w: 44, h: 44, kind: 'crate' },
  { x: 300, y: 700, w: 44, h: 44, kind: 'crate' }, { x: 640, y: 700, w: 96, h: 28, kind: 'barrier' },
  { x: 1000, y: 150, w: 96, h: 28, kind: 'barrier' }, { x: 260, y: 330, w: 28, h: 96, kind: 'barrier' },
  { x: 700, y: 880, w: 44, h: 44, kind: 'crate' }, { x: 560, y: 1000, w: 34, h: 16, kind: 'scooter' },
  { x: 560, y: 120, w: 44, h: 44, kind: 'crate' }, { x: 820, y: 420, w: 96, h: 28, kind: 'barrier' },
  { x: 380, y: 880, w: 28, h: 96, kind: 'barrier' }, { x: 900, y: 700, w: 44, h: 44, kind: 'crate' },
  { x: 1180, y: 520, w: 34, h: 16, kind: 'scooter' }, { x: 700, y: 1080, w: 96, h: 28, kind: 'barrier' },
];

function enlarge(m: MapDef): MapDef {
  const keep = m.walls.filter((r) => r.kind !== 'outer');
  const base = [...keep];
  const extra: Rect[] = [];
  for (const c of withMirror(COVER)) {
    if (extra.some((e) => overlaps(e, c, 6))) continue;
    if (base.some((b) => overlaps(b, c, 30))) continue;                                   // not on / against a building
    if (m.sites.some((st) => Math.hypot(c.x + c.w / 2 - st.x, c.y + c.h / 2 - st.y) < st.r + 40)) continue; // keep bomb sites clear
    if (Object.values(m.spawns).some((z) => overlaps(z, c, 50))) continue;                // keep spawns clear
    extra.push(c);
  }
  const outerBig = (): Rect[] => [
    { x: 0, y: 0, w: WORLD_W, h: 20, kind: 'outer' }, { x: 0, y: WORLD_H - 20, w: WORLD_W, h: 20, kind: 'outer' },
    { x: 0, y: 0, w: 20, h: WORLD_H, kind: 'outer' }, { x: WORLD_W - 20, y: 0, w: 20, h: WORLD_H, kind: 'outer' },
  ];
  const sp = (z: Rect): Rect => ({ ...z, y: Math.round((z.y + z.h / 2) * K - z.h / 2) });
  return {
    ...m,
    walls: [...outerBig(), ...[...keep, ...extra].map(grow)],
    sites: m.sites.map((st) => ({ ...st, ...spot(st), r: 100 })),
    spawns: { T: sp(m.spawns.T), CT: { ...sp(m.spawns.CT), x: WORLD_W - m.spawns.CT.w - 70 } },
    heal: m.heal.map(spot),
    supply: extra.map((e) => { const g = grow(e); return { x: Math.round(g.x + g.w / 2), y: Math.round(g.y - 28) }; })
      .filter((sp) => !([...keep, ...extra].map(grow).some((w) => sp.x > w.x - 22 && sp.x < w.x + w.w + 22 && sp.y > w.y - 22 && sp.y < w.y + w.h + 22)) && sp.x > 60 && sp.x < WORLD_W - 60 && sp.y > 60 && sp.y < WORLD_H - 60)
      .slice(0, 14),
    loot: [...m.loot.map(spot), ...extra.filter((e) => e.kind === 'crate').slice(0, 6).map((e) => { const g = grow(e); return { x: g.x + g.w / 2, y: g.y + g.h + 26 }; })],
  };
}

export const MAPS: Record<string, MapDef> = { town: enlarge(town), dock: enlarge(dock), desert: enlarge(desert), village: enlarge(village) };
export const MAP_IDS = Object.keys(MAPS);
export const getMap = (id?: string): MapDef => (id && MAPS[id]) || MAPS.town;

// The first map doubles as the default / backwards-compatible set of constants.
export const WALLS = MAPS.town.walls;
export const SITES = MAPS.town.sites;
export const SPAWN_ZONES = MAPS.town.spawns;
export const PICKUP_SPOTS = MAPS.town.heal;
export const LOOT_SPOTS = MAPS.town.loot;
