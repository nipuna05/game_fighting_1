// Shared game simulation. Runs in the browser (single player) and on the server (multiplayer).

export const WORLD_W = 1600;
export const WORLD_H = 1200;
export const PLAYER_R = 18;
export const PLAYER_SPEED = 220;
export const BULLET_SPEED = 700;
export const BULLET_LIFE = 0.9;
export const BULLET_DMG = 25;
export const FIRE_COOLDOWN = 0.18;
export const MAX_HP = 100;
export const RESPAWN_TIME = 2.5;
export const TICK_RATE = 30;

export interface Rect { x: number; y: number; w: number; h: number }

export const WALLS: Rect[] = [
  { x: 0, y: 0, w: WORLD_W, h: 20 },
  { x: 0, y: WORLD_H - 20, w: WORLD_W, h: 20 },
  { x: 0, y: 0, w: 20, h: WORLD_H },
  { x: WORLD_W - 20, y: 0, w: 20, h: WORLD_H },
  { x: 400, y: 300, w: 200, h: 40 },
  { x: 1000, y: 300, w: 200, h: 40 },
  { x: 400, y: 860, w: 200, h: 40 },
  { x: 1000, y: 860, w: 200, h: 40 },
  { x: 740, y: 500, w: 120, h: 200 },
  { x: 250, y: 560, w: 40, h: 160 },
  { x: 1310, y: 560, w: 40, h: 160 },
];

export interface Input { mx: number; my: number; angle: number; fire: boolean }

export interface PlayerState {
  id: string; name: string; x: number; y: number; angle: number;
  hp: number; score: number; deaths: number; bot: boolean; alive: boolean;
}
export interface BulletState { id: number; x: number; y: number }
export interface Snapshot { t: number; players: PlayerState[]; bullets: BulletState[] }

interface Player extends PlayerState {
  input: Input; cooldown: number; respawnAt: number; botThink: number; botDir: { x: number; y: number };
}
interface Bullet extends BulletState { owner: string; vx: number; vy: number; life: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function circleRectPush(p: { x: number; y: number }, r: number, rect: Rect) {
  const cx = clamp(p.x, rect.x, rect.x + rect.w);
  const cy = clamp(p.y, rect.y, rect.y + rect.h);
  const dx = p.x - cx, dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  if (d2 === 0) { p.y = rect.y - r; return; }
  const d = Math.sqrt(d2);
  p.x = cx + (dx / d) * r;
  p.y = cy + (dy / d) * r;
}

export function segmentHitsWalls(x1: number, y1: number, x2: number, y2: number): boolean {
  // sample along the segment; coarse but cheap and good enough for bot line-of-sight
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 16);
  for (let i = 1; i < steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps, y = y1 + ((y2 - y1) * i) / steps;
    for (const w of WALLS) if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

export class Sim {
  time = 0;
  private players = new Map<string, Player>();
  private bullets: Bullet[] = [];
  private nextBullet = 1;

  addPlayer(id: string, name: string, bot = false) {
    const p: Player = {
      id, name, x: 0, y: 0, angle: 0, hp: MAX_HP, score: 0, deaths: 0, bot, alive: true,
      input: { mx: 0, my: 0, angle: 0, fire: false }, cooldown: 0, respawnAt: 0,
      botThink: 0, botDir: { x: 0, y: 0 },
    };
    this.spawn(p);
    this.players.set(id, p);
  }

  removePlayer(id: string) { this.players.delete(id); }
  has(id: string) { return this.players.has(id); }
  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  botCount() { let n = 0; for (const p of this.players.values()) if (p.bot) n++; return n; }

  setInput(id: string, i: Input) {
    const p = this.players.get(id);
    if (!p) return;
    const len = Math.hypot(i.mx, i.my);
    const k = len > 1 ? 1 / len : 1;
    p.input = { mx: i.mx * k, my: i.my * k, angle: Number.isFinite(i.angle) ? i.angle : 0, fire: !!i.fire };
  }

  private spawn(p: Player) {
    for (let tries = 0; tries < 30; tries++) {
      p.x = 80 + Math.random() * (WORLD_W - 160);
      p.y = 80 + Math.random() * (WORLD_H - 160);
      const q = { x: p.x, y: p.y };
      for (const w of WALLS) circleRectPush(q, PLAYER_R + 40, w);
      if (Math.hypot(q.x - p.x, q.y - p.y) < 0.5) break;
    }
    p.hp = MAX_HP; p.alive = true; p.cooldown = 0;
  }

  step(dt: number) {
    this.time += dt;
    for (const p of this.players.values()) {
      if (!p.alive) {
        if (this.time >= p.respawnAt) this.spawn(p);
        continue;
      }
      if (p.bot) this.thinkBot(p, dt);
      p.x += p.input.mx * PLAYER_SPEED * dt;
      p.y += p.input.my * PLAYER_SPEED * dt;
      for (const w of WALLS) circleRectPush(p, PLAYER_R, w);
      p.angle = p.input.angle;
      p.cooldown -= dt;
      if (p.input.fire && p.cooldown <= 0) {
        p.cooldown = FIRE_COOLDOWN;
        this.bullets.push({
          id: this.nextBullet++, owner: p.id,
          x: p.x + Math.cos(p.angle) * (PLAYER_R + 4), y: p.y + Math.sin(p.angle) * (PLAYER_R + 4),
          vx: Math.cos(p.angle) * BULLET_SPEED, vy: Math.sin(p.angle) * BULLET_SPEED, life: BULLET_LIFE,
        });
      }
    }

    const alive: Bullet[] = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      if (WALLS.some((w) => b.x >= w.x && b.x <= w.x + w.w && b.y >= w.y && b.y <= w.y + w.h)) continue;
      let hit = false;
      for (const p of this.players.values()) {
        if (!p.alive || p.id === b.owner) continue;
        if (Math.hypot(p.x - b.x, p.y - b.y) <= PLAYER_R) {
          p.hp -= BULLET_DMG; hit = true;
          if (p.hp <= 0) {
            p.alive = false; p.deaths++; p.respawnAt = this.time + RESPAWN_TIME;
            const killer = this.players.get(b.owner);
            if (killer) killer.score++;
          }
          break;
        }
      }
      if (!hit) alive.push(b);
    }
    this.bullets = alive;
  }

  private thinkBot(p: Player, dt: number) {
    p.botThink -= dt;
    let target: Player | null = null, best = Infinity;
    for (const o of this.players.values()) {
      if (o === p || !o.alive) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < best) { best = d; target = o; }
    }
    if (!target) { p.input = { mx: 0, my: 0, angle: p.angle, fire: false }; return; }
    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    const visible = best < 700 && !segmentHitsWalls(p.x, p.y, target.x, target.y);
    if (p.botThink <= 0) {
      p.botThink = 0.4 + Math.random() * 0.6;
      const strafe = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      const toward = best > 260 ? 0 : best < 160 ? Math.PI : strafe;
      const a = ang + toward + (visible ? 0 : (Math.random() - 0.5) * 1.2);
      p.botDir = { x: Math.cos(a) * 0.8, y: Math.sin(a) * 0.8 };
    }
    // aim is deliberately imperfect so bots are beatable
    const aim = ang + Math.sin(this.time * 3 + p.x) * 0.12;
    p.input = { mx: p.botDir.x, my: p.botDir.y, angle: aim, fire: visible };
  }

  snapshot(): Snapshot {
    const r = (n: number) => Math.round(n * 10) / 10;
    return {
      t: this.time,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, x: r(p.x), y: r(p.y), angle: r(p.angle * 100) / 100,
        hp: p.hp, score: p.score, deaths: p.deaths, bot: p.bot, alive: p.alive,
      })),
      bullets: this.bullets.map((b) => ({ id: b.id, x: r(b.x), y: r(b.y) })),
    };
  }
}

// ---- network protocol ----
export type ClientMsg =
  | { type: 'join'; name: string; room: string }
  | { type: 'input'; input: Input };
export type ServerMsg =
  | { type: 'welcome'; id: string; room: string }
  | { type: 'snap'; snap: Snapshot };
