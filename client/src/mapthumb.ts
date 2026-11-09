import { WORLD_W, WORLD_H, type MapDef } from '@fight/shared';

// A small top-down picture of a map, drawn from its real layout (buildings, cover, bomb sites and both spawns),
// so the map list shows what each map is like. Drawn once per map, no image files needed.
const PALETTE: Record<string, { ground: string; wall: string; edge: string; cover: string }> = {
  town:    { ground: '#c9906a', wall: '#7a4a36', edge: '#b97a5a', cover: '#efe0bd' },
  dock:    { ground: '#5c636e', wall: '#2c3848', edge: '#546479', cover: '#d08a2a' },
  desert:  { ground: '#dcbc82', wall: '#a8743c', edge: '#c8955a', cover: '#7a5a30' },
  village: { ground: '#6e8a4a', wall: '#6a4630', edge: '#8a6448', cover: '#e3d3a6' },
  base:    { ground: '#7b8568', wall: '#3a4232', edge: '#566049', cover: '#b5bc9f' },
  jungle:  { ground: '#3d5a2a', wall: '#77745f', edge: '#99957c', cover: '#a8a58a' },
  arctic:  { ground: '#e2ebf3', wall: '#7b90a8', edge: '#a3b6cc', cover: '#9fb3c8' },
};
const cache = new Map<string, string>();

export function mapThumb(m: MapDef): string {
  const hit = cache.get(m.id);
  if (hit) return hit;
  const W = 192, H = Math.round((192 * WORLD_H) / WORLD_W), k = W / WORLD_W;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (!g) return '';
  const pal = PALETTE[m.theme] ?? PALETTE.town;
  g.fillStyle = pal.ground; g.fillRect(0, 0, W, H);
  const shade = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.62);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)'); shade.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = shade; g.fillRect(0, 0, W, H);
  for (const f of m.floors ?? []) { g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(f.x * k, f.y * k, f.w * k, f.h * k); }
  for (const w of m.walls) {
    if (w.kind === 'outer' || w.kind === 'window' || w.kind === 'rail') continue;
    const low = w.kind === 'crate' || w.kind === 'barrier' || w.kind === 'scooter';
    g.fillStyle = low ? pal.cover : pal.wall;
    const x = w.x * k, y = w.y * k, ww = Math.max(1.5, w.w * k), hh = Math.max(1.5, w.h * k);
    g.fillRect(x, y, ww, hh);
    if (!low) { g.strokeStyle = pal.edge; g.lineWidth = 0.8; g.strokeRect(x + 0.4, y + 0.4, Math.max(0, ww - 0.8), Math.max(0, hh - 0.8)); }
  }
  // the spawn zones (Raiders orange on the left, Sentinels blue on the right)
  (['T', 'CT'] as const).forEach((t) => {
    const z = m.spawns[t];
    g.fillStyle = t === 'T' ? 'rgba(235,140,40,0.75)' : 'rgba(70,140,255,0.75)'; g.fillRect(z.x * k, z.y * k, z.w * k, z.h * k);
  });
  // bomb sites A, B and the one upstairs (C)
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 12px system-ui, sans-serif';
  for (const s of m.sites) {
    g.beginPath(); g.arc(s.x * k, s.y * k, Math.max(8, s.r * k), 0, Math.PI * 2);
    g.fillStyle = s.lv ? 'rgba(255,170,60,0.32)' : 'rgba(255,225,80,0.30)'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = s.lv ? '#ffaa3c' : '#ffe150'; g.stroke();
    g.fillStyle = '#fff'; g.shadowColor = '#000'; g.shadowBlur = 3; g.fillText(s.id, s.x * k, s.y * k + 0.5); g.shadowBlur = 0;
  }
  g.lineWidth = 3; g.strokeStyle = 'rgba(8,10,14,0.85)'; g.strokeRect(0, 0, W, H);
  const url = c.toDataURL('image/png');
  cache.set(m.id, url);
  return url;
}
