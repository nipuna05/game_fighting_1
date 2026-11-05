// Shared game simulation. Runs in the browser (single player) and on the server (multiplayer).
// Two modes: 'dm' (free-for-all deathmatch, used by tests) and 'rounds' (CS-style bomb defusal).

export const WORLD_W = 1600;
export const WORLD_H = 1200;
export const PLAYER_R = 18;
export const PLAYER_SPEED = 220;
export const MAX_HP = 100;
export const RESPAWN_TIME = 2.5; // dm only
export const TICK_RATE = 30;

export interface WeaponDef { name: string; cost: number; dmg: number; cooldown: number; speed: number; life: number; pellets: number; spread: number }
export const WEAPONS: WeaponDef[] = [
  { name: 'Pistol',  cost: 0,    dmg: 20, cooldown: 0.28, speed: 700,  life: 0.9,  pellets: 1, spread: 0.03 },
  { name: 'Rifle',   cost: 2700, dmg: 14, cooldown: 0.11, speed: 800,  life: 1.0,  pellets: 1, spread: 0.07 },
  { name: 'Shotgun', cost: 1200, dmg: 12, cooldown: 0.8,  speed: 650,  life: 0.45, pellets: 6, spread: 0.30 },
  { name: 'Sniper',  cost: 4750, dmg: 80, cooldown: 1.2,  speed: 1400, life: 1.2,  pellets: 1, spread: 0.0 },
];
export const ARMOR_ITEM = 4; // buy() item id for body armor (0..3 are WEAPONS)
export const ARMOR_COST = 650;

export const PICKUP_RESPAWN = 15;
export const PICKUP_R = 16;
export const HEAL_AMOUNT = 40;
export const PICKUP_SPOTS = [{ x: 500, y: 600 }, { x: 1100, y: 600 }, { x: 800, y: 430 }, { x: 800, y: 770 }];

// ---- round / bomb rules ----
export type Team = 'T' | 'CT';
export type Phase = 'buy' | 'live' | 'post' | 'over';
export const TEAM_SIZE = 3;
export const BUY_TIME = 10;
export const LIVE_TIME = 100;
export const POST_TIME = 4;
export const OVER_TIME = 8;
export const WINS_TO_WIN = 6;
export const START_MONEY = 1600;
export const WIN_MONEY = 3000;
export const LOSE_MONEY = 1400;
export const KILL_MONEY = 300;
export const MAX_MONEY = 16000;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const BOMB_FUSE = 30;
export const DEFUSE_RANGE = 55;

export interface Site { id: string; x: number; y: number; r: number }
export const SITES: Site[] = [{ id: 'A', x: 800, y: 200, r: 90 }, { id: 'B', x: 800, y: 1000, r: 90 }];
export const SPAWN_ZONES: Record<Team, Rect> = {
  T: { x: 70, y: 420, w: 120, h: 360 },
  CT: { x: 1410, y: 420, w: 120, h: 360 },
};

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

export interface Input { mx: number; my: number; angle: number; fire: boolean; weapon?: number; use?: boolean }

export interface PlayerState {
  id: string; name: string; x: number; y: number; angle: number;
  hp: number; score: number; deaths: number; bot: boolean; alive: boolean; weapon: number;
  team: Team; money: number; armor: number; owned: number; // owned = bitmask of WEAPONS indexes
}
export interface BulletState { id: number; x: number; y: number }
export interface PickupState { id: number; x: number; y: number }
export type BombStatus = 'none' | 'carried' | 'dropped' | 'planted';
export interface BombState {
  status: BombStatus; x: number; y: number; carrier: string | null;
  fuse: number;      // seconds until explosion (planted only)
  progress: number;  // 0..1 plant or defuse progress
  actor: string | null; // who is planting / defusing
}
export interface RoundState {
  phase: Phase; timeLeft: number; tWins: number; ctWins: number; roundNo: number;
  winner: Team | null; reason: string; bomb: BombState;
}
export interface Snapshot { t: number; players: PlayerState[]; bullets: BulletState[]; pickups: PickupState[]; round: RoundState | null }

interface Player extends PlayerState {
  input: Input; cooldown: number; respawnAt: number; botThink: number; botDir: { x: number; y: number };
  botGoal: number; stuckT: number; unstickUntil: number; unstickDir: { x: number; y: number };
}
interface Bullet extends BulletState { owner: string; team: Team; vx: number; vy: number; life: number; dmg: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const other = (t: Team): Team => (t === 'T' ? 'CT' : 'T');

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

export function siteAt(x: number, y: number): Site | null {
  for (const s of SITES) if (Math.hypot(x - s.x, y - s.y) <= s.r) return s;
  return null;
}

export interface SimOptions { rounds?: boolean }

export class Sim {
  time = 0;
  readonly rounds: boolean;
  private players = new Map<string, Player>();
  private bullets: Bullet[] = [];
  private nextBullet = 1;
  private nextBot = 1;
  private pickupReadyAt = PICKUP_SPOTS.map(() => 0);

  // round state
  private phase: Phase = 'buy';
  private phaseEndsAt = 0;
  private tWins = 0;
  private ctWins = 0;
  private roundNo = 0;
  private winner: Team | null = null;
  private reason = '';
  private freshMatch = true;
  private bomb: BombState = { status: 'none', x: 0, y: 0, carrier: null, fuse: 0, progress: 0, actor: null };

  constructor(opts: SimOptions = {}) {
    this.rounds = !!opts.rounds;
    if (this.rounds) this.startRound();
  }

  // ---------- roster ----------
  /** Adds a human (rounds mode: to the team with fewer humans). */
  join(id: string, name: string) {
    let humansT = 0, humansCT = 0;
    for (const p of this.players.values()) if (!p.bot) (p.team === 'T' ? humansT++ : humansCT++);
    this.addPlayer(id, name, false, humansCT <= humansT ? 'CT' : 'T');
  }

  addPlayer(id: string, name: string, bot = false, team: Team = 'T') {
    const p: Player = {
      id, name, x: 0, y: 0, angle: 0, hp: MAX_HP, score: 0, deaths: 0, bot, alive: true,
      weapon: !this.rounds && bot ? 1 + Math.floor(Math.random() * (WEAPONS.length - 1)) : 0,
      team, money: START_MONEY, armor: 0, owned: this.rounds ? 1 : 0b1111,
      input: { mx: 0, my: 0, angle: 0, fire: false }, cooldown: 0, respawnAt: 0,
      botThink: 0, botDir: { x: 0, y: 0 }, botGoal: Math.floor(Math.random() * SITES.length),
      stuckT: 0, unstickUntil: 0, unstickDir: { x: 0, y: 0 },
    };
    this.spawn(p);
    if (this.rounds && this.phase !== 'buy') p.alive = false; // late joiners wait for the next round
    this.players.set(id, p);
    if (this.rounds && bot) this.botBuy(p);
    if (this.rounds && this.phase === 'buy' && team === 'T' && this.bomb.status === 'none') {
      this.bomb = { status: 'carried', x: p.x, y: p.y, carrier: id, fuse: 0, progress: 0, actor: null };
    }
  }

  /** Rounds mode: pad every team with bots up to `size` players (humans count toward the size). */
  fillBots(size: number) {
    for (const team of ['CT', 'T'] as Team[]) {
      const mine = [...this.players.values()].filter((p) => p.team === team);
      const humans = mine.filter((p) => !p.bot).length;
      const bots = mine.filter((p) => p.bot);
      const want = Math.max(0, Math.max(size, humans) - humans);
      bots.sort((a, b) => Number(a.alive) - Number(b.alive)); // drop dead bots first
      while (bots.length > want) this.removePlayer(bots.shift()!.id);
      while (bots.length < want) {
        const n = this.nextBot++;
        const id = `bot${n}`;
        this.addPlayer(id, `Bot ${n}`, true, team);
        bots.push(this.players.get(id)!);
      }
    }
  }

  removePlayer(id: string) {
    this.players.delete(id);
    if (this.bomb.carrier === id) this.bomb = { ...this.bomb, status: 'dropped', carrier: null };
  }
  has(id: string) { return this.players.has(id); }
  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  botCount() { let n = 0; for (const p of this.players.values()) if (p.bot) n++; return n; }

  setInput(id: string, i: Input) {
    const p = this.players.get(id);
    if (!p) return;
    const len = Math.hypot(i.mx, i.my);
    const k = len > 1 ? 1 / len : 1;
    p.input = { mx: i.mx * k, my: i.my * k, angle: Number.isFinite(i.angle) ? i.angle : 0, fire: !!i.fire, use: !!i.use };
    if (!p.bot && Number.isInteger(i.weapon) && i.weapon! >= 0 && i.weapon! < WEAPONS.length && (p.owned >> i.weapon!) & 1) p.weapon = i.weapon!;
  }

  /** Buy a weapon (0..3) or armor (ARMOR_ITEM). Only allowed during the buy phase. */
  buy(id: string, item: number): boolean {
    const p = this.players.get(id);
    if (!p || !this.rounds || this.phase !== 'buy' || !p.alive) return false;
    if (item === ARMOR_ITEM) {
      if (p.armor >= 100 || p.money < ARMOR_COST) return false;
      p.money -= ARMOR_COST; p.armor = 100;
      return true;
    }
    if (!Number.isInteger(item) || item < 0 || item >= WEAPONS.length) return false;
    const w = WEAPONS[item];
    if ((p.owned >> item) & 1 || p.money < w.cost) return false;
    p.money -= w.cost; p.owned |= 1 << item; p.weapon = item;
    return true;
  }

  // ---------- spawning ----------
  private spawn(p: Player) {
    if (this.rounds) {
      const z = SPAWN_ZONES[p.team];
      for (let tries = 0; tries < 30; tries++) {
        p.x = z.x + Math.random() * z.w;
        p.y = z.y + Math.random() * z.h;
        let clear = true;
        for (const o of this.players.values()) if (o !== p && o.alive && Math.hypot(o.x - p.x, o.y - p.y) < PLAYER_R * 2.4) clear = false;
        if (clear) break;
      }
      p.angle = p.team === 'T' ? 0 : Math.PI;
    } else {
      for (let tries = 0; tries < 30; tries++) {
        p.x = 80 + Math.random() * (WORLD_W - 160);
        p.y = 80 + Math.random() * (WORLD_H - 160);
        const q = { x: p.x, y: p.y };
        for (const w of WALLS) circleRectPush(q, PLAYER_R + 40, w);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 0.5) break;
      }
    }
    p.hp = MAX_HP; p.alive = true; p.cooldown = 0;
  }

  // ---------- rounds ----------
  private startRound() {
    this.phase = 'buy';
    this.phaseEndsAt = this.time + BUY_TIME;
    this.winner = null; this.reason = '';
    this.roundNo++;
    this.bullets = [];
    this.pickupReadyAt.fill(0);
    for (const p of this.players.values()) {
      const keep = p.alive && !this.freshMatch; // survivors keep their gear
      if (!keep) { p.owned = 1; p.weapon = 0; p.armor = 0; }
      this.spawn(p);
      p.input = { mx: 0, my: 0, angle: p.angle, fire: false };
      p.botGoal = Math.floor(Math.random() * SITES.length);
      p.stuckT = 0; p.unstickUntil = 0;
    }
    this.freshMatch = false;
    const ts = [...this.players.values()].filter((p) => p.team === 'T');
    const carrier = ts.length ? ts[Math.floor(Math.random() * ts.length)] : null;
    this.bomb = carrier
      ? { status: 'carried', x: carrier.x, y: carrier.y, carrier: carrier.id, fuse: 0, progress: 0, actor: null }
      : { status: 'none', x: 0, y: 0, carrier: null, fuse: 0, progress: 0, actor: null };
    for (const p of this.players.values()) if (p.bot) this.botBuy(p);
  }

  private botBuy(p: Player) {
    for (const item of [1, 2]) { // rifle, else shotgun
      if (p.owned > 1) break;
      this.buyFor(p, item);
    }
    if (p.armor === 0 && p.money >= ARMOR_COST + 300) { p.money -= ARMOR_COST; p.armor = 100; }
  }
  private buyFor(p: Player, item: number) {
    const w = WEAPONS[item];
    if ((p.owned >> item) & 1 || p.money < w.cost) return;
    p.money -= w.cost; p.owned |= 1 << item; p.weapon = item;
  }

  private endRound(winner: Team, reason: string) {
    if (this.phase !== 'live') return;
    this.winner = winner; this.reason = reason;
    if (winner === 'T') this.tWins++; else this.ctWins++;
    for (const p of this.players.values()) {
      p.money = Math.min(MAX_MONEY, p.money + (p.team === winner ? WIN_MONEY : LOSE_MONEY));
    }
    const matchOver = this.tWins >= WINS_TO_WIN || this.ctWins >= WINS_TO_WIN;
    this.phase = matchOver ? 'over' : 'post';
    this.phaseEndsAt = this.time + (matchOver ? OVER_TIME : POST_TIME);
  }

  private resetMatch() {
    this.tWins = 0; this.ctWins = 0; this.roundNo = 0; this.freshMatch = true;
    for (const p of this.players.values()) { p.money = START_MONEY; p.score = 0; p.deaths = 0; }
    this.startRound();
  }

  private stepRound(dt: number) {
    if (this.phase === 'buy') {
      if (this.time >= this.phaseEndsAt) { this.phase = 'live'; this.phaseEndsAt = this.time + LIVE_TIME; }
      return;
    }
    if (this.phase === 'post') { if (this.time >= this.phaseEndsAt) this.startRound(); return; }
    if (this.phase === 'over') { if (this.time >= this.phaseEndsAt) this.resetMatch(); return; }

    // live
    const b = this.bomb;
    const standing = (p: Player) => Math.hypot(p.input.mx, p.input.my) < 0.1;
    if (b.status === 'carried') {
      const c = b.carrier ? this.players.get(b.carrier) : undefined;
      if (!c || !c.alive) {
        this.bomb = { ...b, status: 'dropped', carrier: null, progress: 0, actor: null };
      } else {
        b.x = c.x; b.y = c.y;
        if (c.input.use && standing(c) && siteAt(c.x, c.y)) {
          b.progress += dt / PLANT_TIME; b.actor = c.id;
          if (b.progress >= 1) { this.bomb = { status: 'planted', x: c.x, y: c.y, carrier: null, fuse: BOMB_FUSE, progress: 0, actor: null }; }
        } else { b.progress = 0; b.actor = null; }
      }
    } else if (b.status === 'dropped') {
      for (const p of this.players.values()) {
        if (p.team === 'T' && p.alive && Math.hypot(p.x - b.x, p.y - b.y) < PLAYER_R + 14) {
          this.bomb = { status: 'carried', x: p.x, y: p.y, carrier: p.id, fuse: 0, progress: 0, actor: null };
          break;
        }
      }
    } else if (b.status === 'planted') {
      b.fuse -= dt;
      let defuser: Player | null = null;
      for (const p of this.players.values()) {
        if (p.team === 'CT' && p.alive && p.input.use && standing(p) && Math.hypot(p.x - b.x, p.y - b.y) <= DEFUSE_RANGE) { defuser = p; break; }
      }
      if (defuser) { b.progress += dt / DEFUSE_TIME; b.actor = defuser.id; } else { b.progress = 0; b.actor = null; }
      if (b.progress >= 1) { this.endRound('CT', 'Bomb defused'); return; }
      if (b.fuse <= 0) { this.endRound('T', 'Bomb exploded'); return; }
    }

    let tAlive = 0, ctAlive = 0;
    for (const p of this.players.values()) if (p.alive) (p.team === 'T' ? tAlive++ : ctAlive++);
    if (ctAlive === 0) this.endRound('T', 'Counter-terrorists eliminated');
    else if (tAlive === 0 && this.bomb.status !== 'planted') this.endRound('CT', 'Terrorists eliminated');
    else if (this.time >= this.phaseEndsAt && this.bomb.status !== 'planted') this.endRound('CT', 'Time ran out');
  }

  // ---------- main step ----------
  step(dt: number) {
    this.time += dt;
    if (this.rounds) this.stepRound(dt);
    const frozen = this.rounds && this.phase === 'buy';
    const canFire = !this.rounds || this.phase === 'live';

    for (const p of this.players.values()) {
      if (!p.alive) {
        if (!this.rounds && this.time >= p.respawnAt) this.spawn(p);
        continue;
      }
      if (p.bot) this.thinkBot(p, dt);
      if (!frozen) {
        const px = p.x, py = p.y;
        p.x += p.input.mx * PLAYER_SPEED * dt;
        p.y += p.input.my * PLAYER_SPEED * dt;
        for (const w of WALLS) circleRectPush(p, PLAYER_R, w);
        if (p.bot && (p.input.mx || p.input.my)) { // detect a bot pinned against a wall and nudge it sideways
          if (Math.hypot(p.x - px, p.y - py) < PLAYER_SPEED * dt * 0.3) p.stuckT += dt; else p.stuckT = 0;
          if (p.stuckT > 0.35) {
            p.stuckT = 0; p.unstickUntil = this.time + 0.7;
            const a = Math.atan2(p.input.my, p.input.mx) + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
            p.unstickDir = { x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.9 };
          }
        }
      }
      p.angle = p.input.angle;
      p.cooldown -= dt;
      if (canFire && p.input.fire && p.cooldown <= 0) {
        const w = WEAPONS[p.weapon];
        p.cooldown = w.cooldown;
        for (let i = 0; i < w.pellets; i++) {
          const a = p.angle + (Math.random() - 0.5) * 2 * w.spread;
          this.bullets.push({
            id: this.nextBullet++, owner: p.id, team: p.team, dmg: w.dmg,
            x: p.x + Math.cos(a) * (PLAYER_R + 4), y: p.y + Math.sin(a) * (PLAYER_R + 4),
            vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: w.life,
          });
        }
      }
      PICKUP_SPOTS.forEach((sp, i) => {
        if (this.time >= this.pickupReadyAt[i] && p.hp < MAX_HP && Math.hypot(p.x - sp.x, p.y - sp.y) < PLAYER_R + PICKUP_R) {
          p.hp = Math.min(MAX_HP, p.hp + HEAL_AMOUNT);
          this.pickupReadyAt[i] = this.time + PICKUP_RESPAWN;
        }
      });
    }

    const alive: Bullet[] = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0) continue;
      if (WALLS.some((w) => b.x >= w.x && b.x <= w.x + w.w && b.y >= w.y && b.y <= w.y + w.h)) continue;
      let hit = false;
      for (const p of this.players.values()) {
        if (!p.alive || p.id === b.owner) continue;
        if (this.rounds && p.team === b.team) continue; // no friendly fire
        if (Math.hypot(p.x - b.x, p.y - b.y) <= PLAYER_R) {
          let dmg = b.dmg;
          if (p.armor > 0) { const soaked = Math.min(p.armor, dmg * 0.5); p.armor -= soaked; dmg -= soaked; }
          p.hp -= dmg; hit = true;
          if (p.hp <= 0) {
            p.alive = false; p.deaths++; p.respawnAt = this.time + RESPAWN_TIME;
            const killer = this.players.get(b.owner);
            if (killer) { killer.score++; if (this.rounds) killer.money = Math.min(MAX_MONEY, killer.money + KILL_MONEY); }
          }
          break;
        }
      }
      if (!hit) alive.push(b);
    }
    this.bullets = alive;
  }

  // ---------- bots ----------
  private thinkBot(p: Player, dt: number) {
    p.botThink -= dt;
    let target: Player | null = null, best = Infinity;
    for (const o of this.players.values()) {
      if (o === p || !o.alive) continue;
      if (this.rounds && o.team === p.team) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < best) { best = d; target = o; }
    }
    const visible = !!target && best < 700 && !segmentHitsWalls(p.x, p.y, target.x, target.y);

    if (target && (visible || !this.rounds)) {
      const ang = Math.atan2(target.y - p.y, target.x - p.x);
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
    } else if (this.rounds) {
      this.botObjective(p);
    } else {
      p.input = { mx: 0, my: 0, angle: p.angle, fire: false };
    }
    if (this.time < p.unstickUntil) { p.input.mx = p.unstickDir.x; p.input.my = p.unstickDir.y; }
  }

  private botObjective(p: Player) {
    const b = this.bomb;
    let gx: number, gy: number, stopR = 40, use = false;
    const site = SITES[p.botGoal];
    if (p.team === 'T') {
      if (b.status === 'carried' && b.carrier === p.id) {
        gx = site.x; gy = site.y; stopR = 6;
        use = Math.hypot(p.x - gx, p.y - gy) <= stopR + 14;
      } else if (b.status === 'dropped') { gx = b.x; gy = b.y; stopR = 10; }
      else if (b.status === 'planted') { gx = b.x; gy = b.y; stopR = 130; } // guard the bomb
      else { gx = site.x; gy = site.y; stopR = 90; }                      // escort the carrier
    } else if (b.status === 'planted') {
      gx = b.x; gy = b.y; stopR = DEFUSE_RANGE - 12;
      use = Math.hypot(p.x - gx, p.y - gy) <= DEFUSE_RANGE - 6;
    } else { gx = site.x; gy = site.y; stopR = 110; }                      // hold a site
    const d = Math.hypot(gx - p.x, gy - p.y);
    const ang = Math.atan2(gy - p.y, gx - p.x);
    const move = d > stopR && !use;
    p.input = { mx: move ? Math.cos(ang) * 0.75 : 0, my: move ? Math.sin(ang) * 0.75 : 0, angle: move ? ang : p.angle, fire: false, use };
  }

  // ---------- snapshot ----------
  snapshot(): Snapshot {
    const r = (n: number) => Math.round(n * 10) / 10;
    return {
      t: this.time,
      players: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, x: r(p.x), y: r(p.y), angle: r(p.angle * 100) / 100,
        hp: Math.round(p.hp), score: p.score, deaths: p.deaths, bot: p.bot, alive: p.alive, weapon: p.weapon,
        team: p.team, money: p.money, armor: Math.round(p.armor), owned: p.owned,
      })),
      bullets: this.bullets.map((b) => ({ id: b.id, x: r(b.x), y: r(b.y) })),
      pickups: PICKUP_SPOTS.map((sp, i) => ({ id: i, x: sp.x, y: sp.y })).filter((_, i) => this.time >= this.pickupReadyAt[i]),
      round: this.rounds ? {
        phase: this.phase, timeLeft: Math.max(0, this.phaseEndsAt - this.time),
        tWins: this.tWins, ctWins: this.ctWins, roundNo: this.roundNo,
        winner: this.winner, reason: this.reason, bomb: { ...this.bomb, x: r(this.bomb.x), y: r(this.bomb.y) },
      } : null,
    };
  }
}

// ---- network protocol ----
export type ClientMsg =
  | { type: 'join'; name: string; room: string }
  | { type: 'input'; input: Input }
  | { type: 'buy'; item: number };
export type ServerMsg =
  | { type: 'welcome'; id: string; room: string }
  | { type: 'snap'; snap: Snapshot };

export { other as otherTeam };
