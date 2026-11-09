// Shared game simulation. Runs in the browser (single player) and on the server (multiplayer).
// Two modes: 'dm' (free-for-all deathmatch, used by tests) and 'rounds' (CS-style bomb defusal).

import { getMap, levelWalls, updateLevel, stairAt, stairEnd, FLOOR_H, WORLD_W, WORLD_H, type MapDef, type Rect, type Site } from './maps';
export * from './maps';

export const PLAYER_R = 18;
export const PLAYER_SPEED = 220;
export const MAX_HP = 100;
export const RESPAWN_TIME = 5;      // seconds down before you are back in the fight (unlimited lives)
export const SPAWN_PROTECT = 2;     // seconds nobody can hurt you after you respawn
export const TICK_RATE = 30;

export type WeaponSlot = 'sidearm' | 'primary';
export interface WeaponDef { id: string; name: string; slot: WeaponSlot; cat: string; cost: number; dmg: number; cooldown: number; speed: number; life: number; pellets: number; spread: number; mag: number; reload: number }
// Order is stable (it is part of the network protocol and saved profiles): sidearms first, then primaries.
export const WEAPONS: WeaponDef[] = [
  // sidearms: free, chosen in the menu
  { id: 'usp',     name: 'USP .45',      slot: 'sidearm', cat: 'Sidearm', cost: 0,    dmg: 20,  cooldown: 0.28,  speed: 700,  life: 0.9,  pellets: 1, spread: 0.03, mag: 12, reload: 1.4 },
  { id: 'deagle',  name: 'Desert Eagle', slot: 'sidearm', cat: 'Sidearm', cost: 0,    dmg: 48,  cooldown: 0.62,  speed: 780,  life: 1.0,  pellets: 1, spread: 0.02, mag: 7, reload: 1.6 },
  { id: 'glock',   name: 'Glock 18',     slot: 'sidearm', cat: 'Sidearm', cost: 0,    dmg: 11,  cooldown: 0.085, speed: 680,  life: 0.7,  pellets: 1, spread: 0.11, mag: 20, reload: 1.5 },
  // primaries: bought each round
  { id: 'mp5',     name: 'MP5',          slot: 'primary', cat: 'SMG',     cost: 1500, dmg: 12,  cooldown: 0.075, speed: 720,  life: 0.65, pellets: 1, spread: 0.10, mag: 30, reload: 1.9 },
  { id: 'p90',     name: 'P90',          slot: 'primary', cat: 'SMG',     cost: 2300, dmg: 10,  cooldown: 0.06,  speed: 740,  life: 0.7,  pellets: 1, spread: 0.12, mag: 50, reload: 2.2 },
  { id: 'spas12',  name: 'SPAS-12',      slot: 'primary', cat: 'Shotgun', cost: 1800, dmg: 14,  cooldown: 0.75,  speed: 650,  life: 0.55, pellets: 7, spread: 0.27, mag: 8, reload: 2.6 },
  { id: 'striker', name: 'Striker',      slot: 'primary', cat: 'Shotgun', cost: 2600, dmg: 10,   cooldown: 0.32,  speed: 650,  life: 0.5, pellets: 6, spread: 0.3, mag: 12, reload: 2.4 },
  { id: 'ak47',    name: 'AK-47',        slot: 'primary', cat: 'Rifle',   cost: 2700, dmg: 17,  cooldown: 0.10,  speed: 800,  life: 1.0,  pellets: 1, spread: 0.09, mag: 30, reload: 2.1 },
  { id: 'm4a1',    name: 'M4A1',         slot: 'primary', cat: 'Rifle',   cost: 3100, dmg: 14,  cooldown: 0.085, speed: 820,  life: 1.0,  pellets: 1, spread: 0.05, mag: 30, reload: 2.0 },
  { id: 'l118a',   name: 'L118A',        slot: 'primary', cat: 'Sniper',  cost: 4750, dmg: 100,  cooldown: 1.2,   speed: 1500, life: 1.3,  pellets: 1, spread: 0.0, mag: 5, reload: 2.8 },
  { id: 'm60e4',   name: 'M60E4',        slot: 'primary', cat: 'LMG',     cost: 5200, dmg: 13,  cooldown: 0.075, speed: 790,  life: 1.0,  pellets: 1, spread: 0.14, mag: 100, reload: 4.2 },
  { id: 'barrett', name: 'Barrett .50',  slot: 'primary', cat: 'Sniper',  cost: 5500, dmg: 120, cooldown: 1.6,   speed: 1700, life: 1.4,  pellets: 1, spread: 0.0, mag: 7, reload: 3.2 },
  // added later (appended, so saved profiles and the network protocol keep their weapon numbers)
  { id: 'vector',  name: 'Vector',       slot: 'primary', cat: 'SMG',     cost: 2000, dmg: 10,   cooldown: 0.05,  speed: 730,  life: 0.6,  pellets: 1, spread: 0.12, mag: 33, reload: 1.7 },
  { id: 'aug',     name: 'AUG',          slot: 'primary', cat: 'Rifle',   cost: 3000, dmg: 14,  cooldown: 0.08,  speed: 810,  life: 1.0,  pellets: 1, spread: 0.045, mag: 42, reload: 2.2 },
  { id: 'scar',    name: 'SCAR-H',       slot: 'primary', cat: 'Rifle',   cost: 3400, dmg: 21,  cooldown: 0.12,  speed: 830,  life: 1.0,  pellets: 1, spread: 0.06, mag: 20, reload: 2.3 },
  { id: 'svd',     name: 'SVD Marksman', slot: 'primary', cat: 'Rifle',   cost: 3800, dmg: 51,  cooldown: 0.48,  speed: 1250, life: 1.2,  pellets: 1, spread: 0.015, mag: 10, reload: 2.5 },
  { id: 'm870',    name: 'M870 Pump',    slot: 'primary', cat: 'Shotgun', cost: 1400, dmg: 17,  cooldown: 0.95,  speed: 640,  life: 0.5, pellets: 8, spread: 0.26, mag: 6, reload: 2.8 },
  { id: 'rpk',     name: 'RPK',          slot: 'primary', cat: 'LMG',     cost: 4300, dmg: 14,  cooldown: 0.09,  speed: 800,  life: 1.0,  pellets: 1, spread: 0.11, mag: 70, reload: 3.6 },
  { id: 'awm',     name: 'AWM',          slot: 'primary', cat: 'Sniper',  cost: 5000, dmg: 105, cooldown: 1.4,   speed: 1600, life: 1.35, pellets: 1, spread: 0.0, mag: 5, reload: 3.0 },
];
// ---- weapon customization: a small code per weapon = sight (bits 0-1) + foregrip (bit 2) + finish (bits 3-5) ----
export const SIGHT_NAMES = ['Iron sights', 'Holo sight', '4x scope', '8x scope'];
export const TINT_NAMES = ['Factory', 'Black', 'Desert', 'Olive', 'Arctic', 'Gold'];
export const SIGHT_GUNS = ['mp5', 'ak47', 'm4a1', 'l118a'];   // weapons that have a top rail model
export const GRIP_GUNS = ['ak47', 'm4a1'];                    // weapons that take the foregrip
export const TINT_GUNS = ['usp', 'deagle', 'glock', 'mp5', 'p90', 'spas12', 'striker', 'ak47', 'm4a1', 'l118a']; // weapons with a real model to repaint
const DEFAULT_CUSTOM: Record<string, number> = { mp5: 1, ak47: 1, m4a1: 2 | 4, l118a: 3 };   // how the guns look and play out of the box
export const defaultCustom = (weapon: number) => DEFAULT_CUSTOM[WEAPONS[weapon]?.id] ?? 0;
/** Makes any number a valid code for this weapon (so a modified client cannot send nonsense). */
export function cleanCustom(weaponId: string, code: unknown): number {
  let c = typeof code === 'number' && Number.isInteger(code) && code >= 0 && code < 64 ? code : 0;
  let sight = c & 3, grip = (c >> 2) & 1, tint = c >> 3;
  if (!SIGHT_GUNS.includes(weaponId)) sight = 0;
  if (!GRIP_GUNS.includes(weaponId)) grip = 0;
  if (!TINT_GUNS.includes(weaponId) || tint >= TINT_NAMES.length) tint = 0;
  return sight | (grip << 2) | (tint << 3);
}
/** What a customization costs and gives: better sights tighten the spread but slow you a little; a foregrip steadies the gun but slows the reload. */
export function customMods(code: number) {
  const sight = code & 3, grip = (code >> 2) & 1;
  return { spread: [1, 0.94, 0.88, 0.8][sight] * (grip ? 0.92 : 1), speed: [1, 1, 0.97, 0.93][sight], reload: grip ? 1.12 : 1 };
}
// ---- items: healing and throwables (PUBG style). Keys 3-9 use them; supply crates lie around the map; the bomb mission sells them ----
export interface ItemDef { id: string; name: string; kind: 'heal' | 'throw'; cost: number; max: number; use: number; heal: number }
export const ITEMS: ItemDef[] = [
  { id: 'bandage',    name: 'Bandage',        kind: 'heal',  cost: 100, max: 5, use: 2, heal: 25 },
  { id: 'medkit',     name: 'Medkit',         kind: 'heal',  cost: 400, max: 2, use: 4, heal: 75 },
  { id: 'adrenaline', name: 'Adrenaline',     kind: 'heal',  cost: 250, max: 3, use: 3, heal: 30 },
  { id: 'frag',       name: 'Frag grenade',   kind: 'throw', cost: 300, max: 2, use: 0, heal: 0 },
  { id: 'smoke',      name: 'Smoke grenade',  kind: 'throw', cost: 200, max: 2, use: 0, heal: 0 },
  { id: 'flash',      name: 'Flashbang',      kind: 'throw', cost: 200, max: 2, use: 0, heal: 0 },
  { id: 'molotov',    name: 'Molotov',        kind: 'throw', cost: 400, max: 2, use: 0, heal: 0 },
  // added later (appended, so item numbers keep their meaning)
  { id: 'painkiller', name: 'Painkillers',    kind: 'heal',  cost: 80,  max: 6, use: 1.2, heal: 15 },
  { id: 'firstaid',   name: 'First-aid kit',  kind: 'heal',  cost: 300, max: 3, use: 3, heal: 55 },
  { id: 'impact',     name: 'Impact grenade', kind: 'throw', cost: 350, max: 2, use: 0, heal: 0 },   // explodes the moment it hits a wall
];
export const ITEM_BASE = 100;       // buy() item id for ITEMS[k] is ITEM_BASE + k
export const FRAG_R = 115, FRAG_DMG = 125, FLASH_R = 300, SMOKE_R = 95, SMOKE_TIME = 10, FIRE_R = 75, FIRE_TIME = 7, FIRE_DPS = 16;
export const THROW_SPEED = 430, THROW_CD = 0.8, BOOST_TIME = 10, BOOST_SPEED = 1.2, SUPPLY_RESPAWN = 40;
const FUSE = [0, 0, 0, 2.3, 1.2, 1.4, 1.7, 0, 0, 3.5];                            // seconds until a throwable goes off (index = ITEMS index)
const SUPPLY_WEIGHTS = [30, 12, 10, 16, 12, 12, 8, 22, 7, 8];
const rollItem = () => { let r = Math.random() * SUPPLY_WEIGHTS.reduce((a, b) => a + b, 0); for (let i = 0; i < SUPPLY_WEIGHTS.length; i++) { r -= SUPPLY_WEIGHTS[i]; if (r <= 0) return i; } return 0; };
export interface GrenadeState { id: number; x: number; y: number; k: number; lv: number }
export interface ZoneState { id: number; x: number; y: number; r: number; k: 'smoke' | 'fire'; left: number; lv: number }
export interface BlastEvent { id: number; t: number; x: number; y: number; k: number; r: number; lv: number }
export interface SupplyState { id: number; x: number; y: number; item: number }
export const MAG_RESERVE = 5;      // spare magazines
export const EQUIP_TIME = 0.35;    // seconds before you can fire after switching weapons
export const SIDEARM_COUNT = WEAPONS.filter((w) => w.slot === 'sidearm').length; // sidearms occupy indexes 0..SIDEARM_COUNT-1
const SIDEARM_MASK = (1 << SIDEARM_COUNT) - 1;
const ALL_MASK = (1 << WEAPONS.length) - 1;
export const ARMOR_ITEM = WEAPONS.length; // buy() item id for body armor
export const ARMOR_COST = 650;

export const PICKUP_RESPAWN = 15;
export const PICKUP_R = 16;
export const HEAL_AMOUNT = 40;
// ---- round / bomb rules ----
export type Team = 'T' | 'CT';
// 'CT' / 'T' are internal ids (network protocol, saved profiles). Players only ever see these names.
export const TEAM_INFO: Record<Team, { name: string; short: string; role: string }> = {
  CT: { name: 'Sentinels', short: 'SEN', role: 'Defenders' },
  T: { name: 'Raiders', short: 'RDR', role: 'Attackers' },
};
export type Phase = 'buy' | 'live' | 'post' | 'over';
export const TEAM_SIZE = 3;
export const SKIN_BASE = 4;   // soldier models a player can choose from
/** Dress kits: colour outfits on top of a costume. The kit is packed into the costume number (skin = costume + SKIN_BASE * kit), so the network protocol did not change. */
export const KIT_NAMES = ['Standard', 'Woodland', 'Desert', 'Arctic', 'Urban', 'Crimson', 'Royal gold'];
export const SKIN_COUNT = SKIN_BASE * KIT_NAMES.length; // every costume + kit combination
export const BUY_TIME = 10;
export const LIVE_TIME = 150;   // the maps are bigger now
export const POST_TIME = 4;
export const OVER_TIME = 15;
// ---- game styles and weapon rules ----
export type GameMode = 'bomb' | 'tdm' | 'rescue' | 'collect' | 'point' | 'flag' | 'vip' | 'range';
export type WeaponSet = 'all' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'random';
export type PickMode = 'manual' | 'auto';
/** Bot skill: how far their aim wanders, how hard their bullets hit, and how fast they react. */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: { id: Difficulty; name: string; blurb: string; aim: number; dmg: number; think: number }[] = [
  { id: 'easy', name: 'Easy', blurb: 'Bots miss a lot, hit softer and react slowly. Good for learning.', aim: 0.26, dmg: 0.7, think: 1.4 },
  { id: 'normal', name: 'Normal', blurb: 'The standard bots.', aim: 0.12, dmg: 1, think: 1 },
  { id: 'hard', name: 'Hard', blurb: 'Accurate, harder-hitting bots that react fast.', aim: 0.04, dmg: 1.12, think: 0.7 },
];
export const GAME_MODES: { id: GameMode; name: string; blurb: string }[] = [
  { id: 'bomb', name: 'Bomb mission', blurb: 'Raiders plant the bomb at a site, Sentinels stop them. One round decides the game.' },
  { id: 'tdm', name: 'Team deathmatch', blurb: 'Kills only: the first team to reach the kill target wins. You respawn after 5 seconds.' },
  { id: 'rescue', name: 'Hostage rescue', blurb: 'Sentinels find the hostages, untie them and escort them to the extraction zone. Raiders must stop them before time runs out.' },
  { id: 'collect', name: 'Collect the intel', blurb: 'Both teams race to grab the intel cases scattered over the map. The first team to collect them all wins.' },
  { id: 'point', name: 'Control point', blurb: 'Hold the glowing zone in the middle of the map. Your team earns a point every second that it is inside with no enemy there. First to 100 points wins.' },
  { id: 'vip', name: 'VIP escort', blurb: 'One Sentinel is the VIP. The Sentinels must escort them to the extraction zone in the middle of the Raiders\' side; if the VIP dies, the Raiders win.' },
  { id: 'range', name: 'Practice range', blurb: 'Single player only. No enemy shoots back: knock down target dummies (some stand, some strafe), swap guns any time and try every attachment. It never ends.' },
  { id: 'flag', name: 'Capture the flag', blurb: 'Steal the enemy flag and carry it back to your own flag. Your flag must be at home to score. First team to 3 captures wins.' },
];
export const UNTIE_TIME = 1.2;          // seconds holding the use key next to a hostage
export const RESCUE_TIME = 270;
export const COLLECT_TIME = 240;
export const COLLECT_TARGET = 8;      // intel cases a team needs
export const POINT_TIME = 300, POINT_TARGET = 100, POINT_R = 140;   // control point: round time, points to win, zone radius
export const FLAG_TIME = 360, FLAG_TARGET = 3, FLAG_RETURN = 20, FLAG_TOUCH = 24;   // capture the flag: round time, captures to win, seconds before a dropped flag returns, pick-up reach
export const VIP_TIME = 300;          // VIP escort: round time
export const RANGE_TARGET_RESPAWN = 1.2;   // practice range: a knocked-down target stands up again after this many seconds
export const ITEM_RESPAWN = 25;       // a taken case comes back after this many seconds
const missionTime = (m: GameMode) => (m === 'tdm' ? TDM_TIME : m === 'rescue' ? RESCUE_TIME : m === 'collect' ? COLLECT_TIME : m === 'point' ? POINT_TIME : m === 'flag' ? FLAG_TIME : m === 'vip' ? VIP_TIME : m === 'range' ? 1e7 : LIVE_TIME);
export const WEAPON_SETS: { id: WeaponSet; name: string }[] = [
  { id: 'all', name: 'All guns (bomb mission: buy with cash)' }, { id: 'pistol', name: 'Pistols only' }, { id: 'smg', name: 'SMGs only' },
  { id: 'shotgun', name: 'Shotguns only' }, { id: 'rifle', name: 'Rifles only' }, { id: 'sniper', name: 'Snipers only' }, { id: 'random', name: 'Random weapon every life' },
];
export const KILL_TARGET = 25;   // team deathmatch: first team to this many kills
export const TDM_TIME = 300;     // team deathmatch: time limit in seconds
const SET_CAT: Record<string, string> = { smg: 'SMG', shotgun: 'Shotgun', rifle: 'Rifle', sniper: 'Sniper' };
/** Free loadouts: no cash. Team deathmatch always uses them; the bomb mission uses them whenever a weapon set other than "all" is chosen. */
export const isFreeLoadout = (mode: GameMode, set: WeaponSet) => mode !== 'bomb' || set !== 'all';
/** Weapon indexes a player may pick in a free-loadout game. */
export function allowedWeapons(set: WeaponSet): number[] {
  const out: number[] = [];
  WEAPONS.forEach((w, i) => {
    if (set === 'pistol' ? w.slot === 'sidearm' : set in SET_CAT ? w.cat === SET_CAT[set] : w.slot === 'primary') out.push(i);
  });
  return out;
}
export const WINS_TO_WIN = 1;   // a game is a single round: whoever wins it wins the game
export const START_MONEY = 1600;
export const WIN_MONEY = 3000;
export const LOSE_MONEY = 1400;
export const KILL_MONEY = 200;
export const LOOT_AMOUNT = 350; // cash stack lying on the map (once per round)
export const DROP_AMOUNT = 250; // bag dropped by a fallen player
export const MAX_MONEY = 16000;
export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 4;
export const BOMB_FUSE = 30;
export const DEFUSE_RANGE = 55;

export interface Input { mx: number; my: number; angle: number; fire: boolean; weapon?: number; use?: boolean; scoped?: boolean; crouch?: boolean; jump?: boolean; prone?: boolean; sneak?: boolean; reload?: boolean; item?: number }

export interface PlayerState {
  id: string; name: string; x: number; y: number; angle: number;
  hp: number; score: number; deaths: number; bot: boolean; alive: boolean; weapon: number;
  sh: number; ht: number; dd: number;   // match stats: bullets fired, bullets that hit someone, damage dealt
  team: Team; money: number; armor: number; owned: number; // owned = bitmask of WEAPONS indexes
  skin: number; // costume index, 0..SKIN_COUNT-1
  lv: number;    // floor: 0 ground, 1 upper
  z: number;     // height above the ground (follows stair ramps)
  st: 0 | 1 | 2 | 3; // posture: 0 standing, 1 kneeling (crouched), 2 in the air (jumping), 3 prone (lying flat)
  rs: number;    // seconds until I respawn (0 while alive)
  ch: number;    // the weapon I chose for my next spawn (free-loadout games), -1 = none
  am: number;    // rounds left in the magazine of the weapon I hold
  rv: number;    // spare rounds for it
  rl: number;    // seconds of reloading left (0 = not reloading)
  cu: number;    // customization code of the weapon I hold
  iv: number[];  // how many of each item I carry (indexes of ITEMS)
  us: number;    // item I am using right now (-1 = none)
  ul: number;    // seconds left of that
  bl: number;    // seconds I stay blinded by a flashbang
  bo: boolean;   // adrenaline boost is active
}
export interface BulletState { id: number; x: number; y: number; a: number; w: number; z: number } // a = direction (radians), w = weapon index
export interface ImpactEvent { id: number; t: number; x: number; y: number; kind: 'wall' | 'body'; z: number; o?: string; v?: string; a?: number }   // body hits also say who shot (o), who was hit (v) and the bullet's direction (a)
export interface PickupState { id: number; x: number; y: number; kind: 'heal' | 'cash'; amount?: number }
export type BombStatus = 'none' | 'carried' | 'dropped' | 'planted';
export interface BombState {
  lv?: number;       // the floor the bomb is on
  status: BombStatus; x: number; y: number; carrier: string | null;
  fuse: number;      // seconds until explosion (planted only)
  progress: number;  // 0..1 plant or defuse progress
  actor: string | null; // who is planting / defusing
}
export interface HostageState { id: number; x: number; y: number; carried: boolean; by: string | null; progress: number; actor: string | null }
export interface ItemState { id: number; x: number; y: number }
export interface FlagState { team: Team; x: number; y: number; hx: number; hy: number; carried: boolean; home: boolean; by?: string }   // the flag of `team`
export interface PointState { x: number; y: number; r: number; owner: 'T' | 'CT' | 'contested' | 'none' }
export interface RoundState {
  phase: Phase; timeLeft: number; tWins: number; ctWins: number; roundNo: number;
  winner: Team | null; reason: string; bomb: BombState;
  mode: GameMode; weaponSet: WeaponSet; pick: PickMode; free: boolean;       // how this game is played
  tKills: number; ctKills: number; killTarget: number;                      // team deathmatch score
  hostages: HostageState[]; rescued: number; hostageCount: number; extract: Rect;   // hostage rescue
  items: ItemState[]; tItems: number; ctItems: number; itemTarget: number;          // collect the intel
  cp: PointState | null; cpT: number; cpCT: number; cpTarget: number;                // control point
  flags: FlagState[]; capT: number; capCT: number; capTarget: number;               // capture the flag
  vip: string | null;                                                                // VIP escort: who the VIP is (the extraction zone is `extract`)
  goal: Record<Team, string>;                                                // the instruction text for each team
}
export interface KillEvent {
  id: number; t: number;
  killer: string; killerName: string; killerTeam: Team;
  victim: string; victimName: string; victimTeam: Team;
  weapon: number;   // index into WEAPONS
  multi: number;    // how many kills in a row the killer has made within MULTI_WINDOW seconds (1 = a single kill)
  first: boolean;   // the first kill of the round
}
// Titles: a different name for every multi-kill level, plus first blood of a round and the match MVP.
export const MULTI_NAMES = ['', '', 'DOUBLE STRIKE', 'TRIPLE THREAT', 'RAMPAGE', 'UNSTOPPABLE', 'LEGENDARY'];
export const FIRST_BLOOD = 'FIRST BLOOD';
export const MVP_TITLE = 'MATCH MVP';
/** Best title first (used to pick the title shown on a profile). */
export const TITLE_RANK = [...MULTI_NAMES.filter(Boolean).reverse(), MVP_TITLE, FIRST_BLOOD];
export const MULTI_WINDOW = 7;
export interface Snapshot { t: number; players: PlayerState[]; bullets: BulletState[]; pickups: PickupState[]; round: RoundState | null; kills: KillEvent[]; impacts: ImpactEvent[]; grenades: GrenadeState[]; zones: ZoneState[]; blasts: BlastEvent[]; supplies: SupplyState[] }

interface Player extends PlayerState {
  sidearm: number; input: Input; cooldown: number; respawnAt: number; botThink: number; botDir: { x: number; y: number };
  protect: number; // no damage until this time (just respawned)
  ammoIn: number[]; ammoRes: number[]; reloadUntil: number; equipUntil: number; custom: Record<number, number>;
  inv: number[]; usingItem: number; useUntil: number; boostUntil: number; blindUntil: number; throwCd: number; itemReq: number; botItemCd: number;
  air: number; jumpCd: number; // seconds left in the current jump / until the next jump is allowed
  dummy?: { x: number; y: number; move: boolean; ph: number };           // practice range: a target dummy that stays at (x, y), or strafes around it
  botGoal: number; stuckT: number; unstickUntil: number; unstickDir: { x: number; y: number };
}
interface Bullet extends Omit<BulletState, 'a' | 'w'> { lv: number; crouch: boolean; over: number; owner: string; team: Team; vx: number; vy: number; life: number; dmg: number; wid: number }

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

export function segmentHitsWalls(x1: number, y1: number, x2: number, y2: number, walls: Rect[]): boolean {
  // sample along the segment; coarse but cheap and good enough for bot line-of-sight
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 16);
  for (let i = 1; i < steps; i++) {
    const x = x1 + ((x2 - x1) * i) / steps, y = y1 + ((y2 - y1) * i) / steps;
    for (const w of walls) if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  }
  return false;
}

/** Moves a player one step with wall collision. The server and the client's prediction use this same function. */
export const SCOPED_SPEED = 0.5; // movement multiplier while scoped with a sniper
export const ADS_SPEED = 0.78;   // movement multiplier while aiming down the sights of any other gun
export const ADS_SPREAD = 0.55;  // aiming down the sights tightens the spread of any other gun to this fraction
/** Speed multiplier for holding the aim button with this weapon. */
export const adsSpeed = (cat: string, aiming: boolean) => (!aiming ? 1 : cat === 'Sniper' ? SCOPED_SPEED : ADS_SPEED);
export const CROUCH_SPEED = 0.5; // movement multiplier while kneeling
export const PRONE_SPEED = 0.22;  // crawling
export const SNEAK_SPEED = 0.45;  // slow walk (hold Shift)
export const PRONE_R = 12;        // a prone soldier is a much smaller target
export const JUMP_TIME = 0.65;   // seconds in the air: long enough to hop over a crate or a low wall
export const JUMP_COOLDOWN = 0.9;
export const JUMP_SPEED = 1.2;   // a little faster in the air, so a hop actually clears a 44 unit crate
/** Low cover (crates, low walls, wagons): you can jump over it, and shots pass over it unless the shooter is kneeling. */
export const isLow = (w: Rect) => w.kind === 'barrier' || w.kind === 'crate' || w.kind === 'scooter' || w.kind === 'window' || w.kind === 'rail';
export function movePlayer(p: { x: number; y: number }, mx: number, my: number, dt: number, walls: Rect[], speed = PLAYER_SPEED, airborne = false) {
  p.x += mx * speed * dt;
  p.y += my * speed * dt;
  for (const w of walls) { if (airborne && isLow(w)) continue; circleRectPush(p, PLAYER_R, w); }
}

export function siteAt(x: number, y: number, sites: Site[], lv = 0): Site | null {
  for (const s of sites) if ((s.lv ?? 0) === lv && Math.hypot(x - s.x, y - s.y) <= s.r) return s;
  return null;
}

export interface SimOptions { rounds?: boolean; map?: string; invincible?: string[]; mode?: GameMode; weaponSet?: WeaponSet; pick?: PickMode; difficulty?: Difficulty } // invincible: dev/testing only

export class Sim {
  time = 0;
  readonly rounds: boolean;
  private players = new Map<string, Player>();
  private bullets: Bullet[] = [];
  private nextBullet = 1;
  private nextBot = 1;
  readonly map: MapDef;
  private invincible: Set<string>;
  private pickupReadyAt: number[] = [];
  private lootTaken: boolean[] = [];
  private drops: { id: number; x: number; y: number; amount: number; lv: number }[] = [];
  private nextDrop = 1;
  private killLog: KillEvent[] = [];
  private firstBloodDone = false;
  private impactLog: ImpactEvent[] = [];
  private nextImpact = 1;
  private addImpact(x: number, y: number, kind: 'wall' | 'body', z = 0, who?: { o: string; v: string; a: number }) {
    this.impactLog.push({ id: this.nextImpact++, t: this.time, x: Math.round(x), y: Math.round(y), kind, z: Math.round(z), ...(who ? { o: who.o, v: who.v, a: Math.round(who.a * 100) / 100 } : {}) });
    if (this.impactLog.length > 40) this.impactLog.shift();
  }
  private nextKill = 1;
  private streaks = new Map<string, { n: number; t: number }>();

  // round state
  private phase: Phase = 'buy';
  private phaseEndsAt = 0;
  private tWins = 0;
  private ctWins = 0;
  private roundNo = 0;
  private pushUntil: Record<Team, number> = { T: 0, CT: 0 };
  private cp: { x: number; y: number; r: number } | null = null;                          // control point
  private cpOwner: PointState['owner'] = 'none'; private cpT = 0; private cpCT = 0;
  private flags: { team: Team; hx: number; hy: number; x: number; y: number; carrier: string | null; dropT: number }[] = [];   // capture the flag
  private capT = 0; private capCT = 0;
  private vipId: string | null = null; private vipExtract: Rect | null = null;           // VIP escort       // bots: the team attacks together until this time
  private winner: Team | null = null;
  private reason = '';
  private freshMatch = true;
  private bomb: BombState = { status: 'none', x: 0, y: 0, carrier: null, fuse: 0, progress: 0, actor: null };
  readonly mode: GameMode;
  readonly weaponSet: WeaponSet;
  readonly pick: PickMode;
  readonly diff: (typeof DIFFICULTIES)[number];
  private tKills = 0;
  private ctKills = 0;
  private hostages: { id: number; x: number; y: number; carrier: string | null; progress: number; actor: string | null; rescued: boolean }[] = [];
  private rescued = 0;
  private items: { id: number; x: number; y: number; readyAt: number }[] = [];
  private tItems = 0;
  private ctItems = 0;
  private grenades: { id: number; k: number; owner: string; team: Team; x: number; y: number; vx: number; vy: number; age: number; lv: number }[] = [];
  private zones: { id: number; x: number; y: number; r: number; k: 'smoke' | 'fire'; until: number; owner: string; team: Team; lv: number }[] = [];
  private blastLog: BlastEvent[] = [];
  private supplies: { id: number; x: number; y: number; item: number; readyAt: number }[] = [];
  private nextThrow = 1;
  /** The extraction zone for hostages: the Sentinels' spawn area, a little bigger. */
  private get extract(): Rect { if (this.mode === 'vip' && this.vipExtract) return this.vipExtract; const z = this.map.spawns.CT; return { x: z.x - 70, y: z.y - 70, w: z.w + 140, h: z.h + 140 }; }
  get free() { return this.rounds && isFreeLoadout(this.mode, this.weaponSet); }

  constructor(opts: SimOptions = {}) {
    this.rounds = !!opts.rounds;
    this.mode = opts.mode === 'tdm' || opts.mode === 'rescue' || opts.mode === 'collect' || opts.mode === 'point' || opts.mode === 'flag' || opts.mode === 'vip' || opts.mode === 'range' ? opts.mode : 'bomb';
    this.weaponSet = (['all', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'random'] as WeaponSet[]).includes(opts.weaponSet as WeaponSet) ? opts.weaponSet as WeaponSet : 'all';
    this.pick = opts.pick === 'auto' ? 'auto' : 'manual';
    this.diff = DIFFICULTIES.find((d) => d.id === opts.difficulty) ?? DIFFICULTIES[1];
    this.map = getMap(opts.map);
    this.invincible = new Set(opts.invincible ?? []);
    this.pickupReadyAt = this.map.heal.map(() => 0);
    this.lootTaken = this.map.loot.map(() => false);
    if (this.rounds) this.startRound();
  }

  // ---------- roster ----------
  /** Adds a human (rounds mode: to the team with fewer humans). */
  join(id: string, name: string, skin = 0, sidearm = 0, prefer: Team | 'auto' = 'auto', custom: Record<string, unknown> = {}) {
    const humans: Record<Team, number> = { T: 0, CT: 0 };
    for (const p of this.players.values()) if (!p.bot) humans[p.team]++;
    let team: Team = humans.CT <= humans.T ? 'CT' : 'T'; // default: the side with fewer humans
    if ((prefer === 'CT' || prefer === 'T') && humans[prefer] < TEAM_SIZE) team = prefer; // honour the choice if that side has room
    this.addPlayer(id, name, false, team, skin, sidearm);
    const p = this.players.get(id);
    if (p) WEAPONS.forEach((w, i) => { if (custom && custom[w.id] !== undefined) p.custom[i] = cleanCustom(w.id, custom[w.id]); });
  }
  private wallsAt(lv: number) { return levelWalls(this.map, lv); }
  private customOf(p: Player) { return p.custom[p.weapon] ?? defaultCustom(p.weapon); }

  addPlayer(id: string, name: string, bot = false, team: Team = 'T', skin = bot ? (team === 'CT' ? 2 : 0) + Math.floor(Math.random() * 2) : 0, sidearm = bot ? Math.floor(Math.random() * SIDEARM_COUNT) : 0) {
    sidearm = Math.max(0, Math.min(SIDEARM_COUNT - 1, Math.floor(sidearm) || 0));
    const p: Player = {
      id, name, x: 0, y: 0, angle: 0, hp: MAX_HP, score: 0, deaths: 0, bot, alive: true,
      sidearm, weapon: !this.rounds && bot ? SIDEARM_COUNT + Math.floor(Math.random() * (WEAPONS.length - SIDEARM_COUNT)) : sidearm,
      team, skin: Math.max(0, Math.min(SKIN_COUNT - 1, Math.floor(skin) || 0)), money: START_MONEY, armor: 0, owned: this.rounds ? 1 << sidearm : ALL_MASK,
      input: { mx: 0, my: 0, angle: 0, fire: false }, cooldown: 0, respawnAt: 0,
      lv: 0, z: 0, st: 0, rs: 0, ch: -1, am: 0, rv: 0, rl: 0, cu: 0, ammoIn: WEAPONS.map((w) => w.mag), sh: 0, ht: 0, dd: 0, ammoRes: WEAPONS.map((w) => w.mag * MAG_RESERVE), reloadUntil: 0, equipUntil: 0, custom: {}, inv: ITEMS.map(() => 0), usingItem: -1, useUntil: 0, boostUntil: 0, blindUntil: 0, throwCd: 0, itemReq: -1, botItemCd: 3 + Math.random() * 6, iv: [], us: -1, ul: 0, bl: 0, bo: false, protect: 0, air: 0, jumpCd: 0,
      botThink: 0, botDir: { x: 0, y: 0 }, botGoal: Math.floor(Math.random() * this.map.sites.length),
      stuckT: 0, unstickUntil: 0, unstickDir: { x: 0, y: 0 },
    };
    this.spawn(p);
    if (this.rounds && this.phase !== 'buy') p.alive = false; // late joiners wait for the next round
    this.players.set(id, p);
    if (this.rounds && bot && !this.free) this.botBuy(p);
    if (this.rounds && this.mode === 'bomb' && this.phase === 'buy' && team === 'T' && this.bomb.status === 'none') {
      this.bomb = { status: 'carried', x: p.x, y: p.y, carrier: id, fuse: 0, progress: 0, actor: null };
    }
  }

  /** Practice range: put target dummies in a lane in front of the Sentinels' spawn (some stand still, some strafe). */
  addDummies() {
    const z = this.map.spawns.CT, cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    const plan: { d: number; dy: number; move: boolean }[] = [
      { d: 170, dy: 0, move: false }, { d: 330, dy: -70, move: false }, { d: 490, dy: 70, move: false }, { d: 650, dy: -40, move: false }, { d: 820, dy: 50, move: false },
      { d: 250, dy: 90, move: true }, { d: 410, dy: -100, move: true }, { d: 570, dy: 110, move: true }, { d: 730, dy: -90, move: true },
    ];
    plan.forEach((t, i) => {
      const spot = this.freeSpot(cx - t.d, cy + t.dy, PLAYER_R + 40, false);
      const id = `dummy${i + 1}`;
      this.addPlayer(id, `Target ${i + 1}`, true, 'T');
      const p = this.players.get(id)!;
      p.dummy = { x: spot.x, y: spot.y, move: t.move, ph: i * 1.3 };
      p.x = spot.x; p.y = spot.y;
    });
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
  /** Team of a real (non-bot) player, or undefined. Used by the server to keep voice chat inside a team. */
  humanTeam(id: string): Team | undefined { const p = this.players.get(id); return p && !p.bot ? p.team : undefined; }
  humanCount() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  botCount() { let n = 0; for (const p of this.players.values()) if (p.bot) n++; return n; }

  setInput(id: string, i: Input) {
    const p = this.players.get(id);
    if (!p || !i || typeof i !== 'object') return;          // network data: anything can arrive here
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const mx = num(i.mx), my = num(i.my);
    const len = Math.hypot(mx, my);
    const k = len > 1 ? 1 / len : 1;
    p.input = { mx: mx * k, my: my * k, angle: num(i.angle), fire: !!i.fire, use: !!i.use, scoped: !!i.scoped, crouch: !!i.crouch, jump: !!i.jump, prone: !!i.prone, sneak: !!i.sneak, reload: !!i.reload };
    if (Number.isInteger(i.item) && i.item! >= 0 && i.item! < ITEMS.length) p.itemReq = i.item!;   // use / throw this item (latched until the next tick)
    if (!p.bot && Number.isInteger(i.weapon) && i.weapon! >= 0 && i.weapon! < WEAPONS.length && (p.owned >> i.weapon!) & 1 && i.weapon !== p.weapon) {
      p.weapon = i.weapon!; p.reloadUntil = 0; p.equipUntil = this.time + EQUIP_TIME; p.usingItem = -1;   // switching stops a reload and takes a moment to bring the new gun up
    }
  }

  /** Free-loadout games: choose the weapon for my next spawn (and take it right away during the buy phase). */
  pickWeapon(id: string, item: number): boolean {
    const p = this.players.get(id);
    if (!p || !this.free || this.pick === 'auto' || !Number.isInteger(item) || !allowedWeapons(this.weaponSet).includes(item)) return false;
    p.ch = item;
    if (p.alive && (this.phase === 'buy' || this.mode === 'range')) {
      this.giveLoadout(p);
      if (this.mode === 'range') { p.ammoIn = WEAPONS.map((w) => w.mag); p.ammoRes = WEAPONS.map((w) => w.mag * MAG_RESERVE); p.reloadUntil = 0; p.equipUntil = this.time + 0.35; }   // a fresh gun, ready after the swap
    }
    return true;
  }
  /** Gives a spawning player the weapon for this game: their own choice (manual) or a random one from the allowed set (automatic, bots). */
  private giveLoadout(p: Player) {
    const allowed = allowedWeapons(this.weaponSet);
    if (!allowed.length) return;
    const chosen = !p.bot && this.pick === 'manual' ? (allowed.includes(p.ch) ? p.ch : allowed[0]) : allowed[Math.floor(Math.random() * allowed.length)];
    p.owned = WEAPONS[chosen].slot === 'sidearm' ? 1 << chosen : (1 << p.sidearm) | (1 << chosen);
    p.weapon = chosen;
  }

  /** Buy a weapon (0..3) or armor (ARMOR_ITEM). Only allowed during the buy phase. */
  buy(id: string, item: number): boolean {
    if (!Number.isInteger(item)) return false;
    const p = this.players.get(id);
    if (item >= ITEM_BASE && item < ITEM_BASE + ITEMS.length) {          // equipment: healing and throwables
      const k = item - ITEM_BASE, d = ITEMS[k], cost = this.free ? 0 : d.cost;
      if (!p || !this.rounds || this.phase !== 'buy' || !p.alive || p.inv[k] >= d.max || p.money < cost) return false;
      p.money -= cost; p.inv[k]++; return true;
    }
    if (p && this.free) {                                               // free loadouts: nothing costs money; weapon clicks are picks
      if (item === ARMOR_ITEM) { if (!p.alive || this.phase !== 'buy' || p.armor >= 100) return false; p.armor = 100; return true; }
      return this.pickWeapon(id, item);
    }
    if (!p || !this.rounds || this.phase !== 'buy' || !p.alive) return false;
    if (item === ARMOR_ITEM) {
      if (p.armor >= 100 || p.money < ARMOR_COST) return false;
      p.money -= ARMOR_COST; p.armor = 100;
      return true;
    }
    if (!Number.isInteger(item) || item < 0 || item >= WEAPONS.length) return false;
    const w = WEAPONS[item];
    if (w.slot !== 'primary' || (p.owned >> item) & 1 || p.money < w.cost) return false;
    p.money -= w.cost;
    p.owned = (p.owned & SIDEARM_MASK) | (1 << item); // a new primary replaces the old one
    p.weapon = item;
    return true;
  }

  // ---------- spawning ----------
  private spawn(p: Player) {
    if (this.rounds) {
      const z = this.map.spawns[p.team];
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
        for (const w of this.map.walls) circleRectPush(q, PLAYER_R + 40, w);
        if (Math.hypot(q.x - p.x, q.y - p.y) < 0.5) break;
      }
    }
    if (p.dummy) { p.x = p.dummy.x; p.y = p.dummy.y; p.angle = 0; }
    p.hp = MAX_HP; p.alive = true; p.cooldown = 0; p.st = 0; p.air = 0; p.rs = 0; p.lv = 0; p.z = 0;
    p.ammoIn = WEAPONS.map((w) => w.mag); p.ammoRes = WEAPONS.map((w) => w.mag * MAG_RESERVE); p.reloadUntil = 0; p.equipUntil = 0;   // full magazines for a new life
    if (this.free) this.giveLoadout(p);
    this.resetItems(p);
    if (this.rounds && this.phase === 'live' && !p.dummy) { p.armor = 0; p.protect = this.time + SPAWN_PROTECT; }   // back from the dead: armor is gone, a short grace period
  }

  // ---------- rounds ----------
  private startRound() {
    this.phase = 'buy';
    this.phaseEndsAt = this.time + (this.mode === 'range' ? 2 : BUY_TIME);
    this.winner = null; this.reason = '';
    this.roundNo++;
    this.bullets = [];
    this.pickupReadyAt.fill(0);
    this.lootTaken.fill(false);
    this.drops = [];
    this.firstBloodDone = false;
    for (const p of this.players.values()) {
      const keep = p.alive && !this.freshMatch; // survivors keep their gear
      if (!keep) { p.owned = 1 << p.sidearm; p.weapon = p.sidearm; p.armor = 0; }
      this.spawn(p);
      p.input = { mx: 0, my: 0, angle: p.angle, fire: false };
      p.botGoal = Math.floor(Math.random() * this.map.sites.length);
      p.stuckT = 0; p.unstickUntil = 0;
    }
    this.freshMatch = false;
    this.hostages = this.mode === 'rescue' ? this.map.sites.slice(0, 2).map((s, i) => ({ id: i + 1, x: s.x, y: s.y, carrier: null, progress: 0, actor: null, rescued: false })) : [];
    this.rescued = 0;
    this.items = this.mode === 'collect' ? this.map.loot.slice(0, 12).map((l, i) => ({ id: i + 1, x: l.x, y: l.y, readyAt: 0 })) : [];
    this.tItems = 0; this.ctItems = 0;
    this.cpT = 0; this.cpCT = 0; this.cpOwner = 'none'; this.capT = 0; this.capCT = 0;
    this.vipId = null; this.vipExtract = null;
    if (this.mode === 'vip') {
      const tz = this.map.spawns.T, ex = this.freeSpot(tz.x + tz.w + 900, tz.y + tz.h / 2, 95, true);          // in front of the Raiders' spawn, where the flag would stand
      this.vipExtract = { x: ex.x - 90, y: ex.y - 90, w: 180, h: 180 };
      const cts = [...this.players.values()].filter((p) => p.team === 'CT');
      const vip = cts[Math.floor(Math.random() * cts.length)];
      if (vip) { this.vipId = vip.id; vip.armor = 100; }                                                          // the VIP is tougher: body armor from the start
    }
    this.cp = this.mode === 'point' ? { ...this.freeSpot(WORLD_W / 2, WORLD_H / 2, POINT_R * 0.55, true, true), r: POINT_R } : null;
    if (this.mode === 'flag') {                                         // the Raiders' flag first; the Sentinels' flag is its mirror image, so neither team is favoured
      const z = this.map.spawns.T, t = this.freeSpot(z.x + z.w + 680, z.y + z.h / 2, 34, false);
      const mx = WORLD_W - t.x, my = WORLD_H - t.y;
      const blocked = this.map.walls.some((w) => mx > w.x - 34 && mx < w.x + w.w + 34 && my > w.y - 34 && my < w.y + w.h + 34);
      const c = blocked ? this.freeSpot(mx, my, 34, false) : { x: mx, y: my };
      this.flags = [{ team: 'T', hx: t.x, hy: t.y, x: t.x, y: t.y, carrier: null, dropT: 0 }, { team: 'CT', hx: c.x, hy: c.y, x: c.x, y: c.y, carrier: null, dropT: 0 }];
    } else this.flags = [];
    this.grenades = []; this.zones = []; this.blastLog = [];
    this.supplies = (this.map.supply ?? []).map((sp, i) => ({ id: i + 1, x: sp.x, y: sp.y, item: rollItem(), readyAt: 0 }));
    const ts = [...this.players.values()].filter((p) => p.team === 'T');
    const carrier = this.mode === 'bomb' && ts.length ? ts[Math.floor(Math.random() * ts.length)] : null;
    this.bomb = carrier
      ? { status: 'carried', x: carrier.x, y: carrier.y, carrier: carrier.id, fuse: 0, progress: 0, actor: null }
      : { status: 'none', x: 0, y: 0, carrier: null, fuse: 0, progress: 0, actor: null };
    for (const p of this.players.values()) if (p.bot && !this.free) this.botBuy(p);
  }

  private botBuy(p: Player) {
    const options = WEAPONS.map((w, i) => ({ w, i })).filter((o) => o.w.slot === 'primary' && o.w.cost <= p.money).sort((a, b) => b.w.cost - a.w.cost);
    if (options.length && p.owned <= SIDEARM_MASK) { // only buy when the bot has no primary yet
      const pick = options[Math.min(options.length - 1, Math.floor(Math.random() * Math.min(3, options.length)))];
      p.money -= pick.w.cost; p.owned = (p.owned & SIDEARM_MASK) | (1 << pick.i); p.weapon = pick.i;
    }
    if (p.armor === 0 && p.money >= ARMOR_COST + 300) { p.money -= ARMOR_COST; p.armor = 100; }
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
    this.tWins = 0; this.ctWins = 0; this.roundNo = 0; this.freshMatch = true; this.tKills = 0; this.ctKills = 0;
    for (const p of this.players.values()) { p.money = START_MONEY; p.score = 0; p.deaths = 0; p.sh = 0; p.ht = 0; p.dd = 0; }
    this.startRound();
  }

  // ---------- hostage rescue ----------
  private stepRescue(dt: number) {
    const ex = this.extract;
    const inside = (x: number, y: number) => x >= ex.x && x <= ex.x + ex.w && y >= ex.y && y <= ex.y + ex.h;
    for (const h of this.hostages) {
      if (h.rescued) continue;
      if (h.carrier) {                                                   // being escorted: follows the soldier, rescued at the extraction zone
        const c = this.players.get(h.carrier);
        if (!c || !c.alive) { h.carrier = null; h.progress = 0; h.actor = null; continue; }   // the escort fell: the hostage stays tied where it is
        h.x = c.x - Math.cos(c.angle) * 16; h.y = c.y - Math.sin(c.angle) * 16;
        if (inside(c.x, c.y)) { h.rescued = true; this.rescued++; }
        continue;
      }
      let who: Player | null = null;                                     // a Sentinel standing next to it and holding the use key
      for (const p of this.players.values()) {
        if (p.team !== 'CT' || !p.alive || p.lv !== 0 || !p.input.use || Math.hypot(p.input.mx, p.input.my) > 0.1 || Math.hypot(p.x - h.x, p.y - h.y) > 46) continue;
        if (this.hostages.some((o) => o.carrier === p.id)) continue;     // one hostage at a time
        who = p; break;
      }
      if (who) { h.progress += dt / UNTIE_TIME; h.actor = who.id; if (h.progress >= 1) { h.carrier = who.id; h.progress = 0; h.actor = null; } }
      else { h.progress = 0; h.actor = null; }
    }
    if (this.rescued >= this.hostages.length) this.endRound('CT', 'All hostages rescued');
    else if (this.time >= this.phaseEndsAt) this.endRound('T', this.rescued ? `Time ran out: ${this.rescued} of ${this.hostages.length} rescued` : 'Time ran out: the hostages are still captive');
  }

  /** The nearest spot (spiralling out from x, y) with no wall within r; low cover counts only when lowOk is false. */
  private freeSpot(x: number, y: number, r: number, lowOk: boolean, vertical = false): { x: number; y: number } {
    const blocked = (px: number, py: number) => px < 60 || py < 60 || px > WORLD_W - 60 || py > WORLD_H - 60
      || this.map.walls.some((w) => !(lowOk && isLow(w)) && px > w.x - r && px < w.x + w.w + r && py > w.y - r && py < w.y + w.h + r);
    if (vertical) for (let rad = 0; rad <= 700; rad += 30) for (const sgn of rad ? [1, -1] : [1]) { const py = Math.round(y + sgn * rad); if (!blocked(x, py)) return { x, y: py }; }
    for (let rad = 0; rad <= 800; rad += 30) for (let k = 0; k < (rad ? 18 : 1); k++) {
      const a = (k / 18) * Math.PI * 2, px = Math.round(x + Math.cos(a) * rad), py = Math.round(y + Math.sin(a) * rad);
      if (!blocked(px, py)) return { x: px, y: py };
    }
    return { x, y };
  }

  // ---------- control point ----------
  private stepPoint(dt: number) {
    const cp = this.cp!;
    let nT = 0, nCT = 0;
    for (const p of this.players.values()) if (p.alive && p.lv === 0 && Math.hypot(p.x - cp.x, p.y - cp.y) <= cp.r) { if (p.team === 'T') nT++; else nCT++; }
    this.cpOwner = nT && nCT ? 'contested' : nT ? 'T' : nCT ? 'CT' : 'none';
    if (this.cpOwner === 'T') this.cpT += dt; else if (this.cpOwner === 'CT') this.cpCT += dt;
    if (this.cpT >= POINT_TARGET) this.endRound('T', `${TEAM_INFO.T.name} held the point for ${POINT_TARGET} seconds`);
    else if (this.cpCT >= POINT_TARGET) this.endRound('CT', `${TEAM_INFO.CT.name} held the point for ${POINT_TARGET} seconds`);
    else if (this.time >= this.phaseEndsAt) {
      const a = Math.floor(this.cpT), b = Math.floor(this.cpCT), tie = a === b, t = tie ? this.tKills > this.ctKills : a > b;
      this.endRound(t ? 'T' : 'CT', tie ? `Time up, tied ${a}-${b}: more kills wins` : `Time up: ${Math.max(a, b)}-${Math.min(a, b)} points`);
    }
  }

  // ---------- VIP escort ----------
  private stepVip() {
    let v = this.vipId ? this.players.get(this.vipId) : undefined;
    if (!v) { const cts = [...this.players.values()].filter((p) => p.team === 'CT' && p.alive); v = cts[Math.floor(Math.random() * cts.length)]; this.vipId = v?.id ?? null; if (v) v.armor = Math.max(v.armor, 100); }   // the VIP left the game: pick another
    const ex = this.extract;
    if (!v) this.endRound('T', 'The Sentinels have nobody left to escort');
    else if (!v.alive) this.endRound('T', `The VIP ${v.name} was killed`);
    else if (v.lv === 0 && v.x > ex.x && v.x < ex.x + ex.w && v.y > ex.y && v.y < ex.y + ex.h) this.endRound('CT', `The VIP ${v.name} reached the extraction zone`);
    else if (this.time >= this.phaseEndsAt) this.endRound('T', 'Time ran out: the VIP did not make it');
  }

  // ---------- capture the flag ----------
  private stepFlag(dt: number) {
    void dt;
    for (const f of this.flags) {
      if (f.carrier) {                                                  // the carrier drags it along; if they die it drops where they fell
        const c = this.players.get(f.carrier);
        if (!c || !c.alive) { f.carrier = null; f.dropT = this.time; if (c) { f.x = Math.round(c.x); f.y = Math.round(c.y); } }
        else { f.x = c.x; f.y = c.y; }
      }
      if (!f.carrier) {
        const atHome = Math.hypot(f.x - f.hx, f.y - f.hy) < 4;
        if (!atHome && this.time - f.dropT >= FLAG_RETURN) { f.x = f.hx; f.y = f.hy; }          // nobody touched it: it goes home by itself
        else for (const p of this.players.values()) {
          if (!p.alive || p.lv !== 0 || Math.hypot(p.x - f.x, p.y - f.y) > FLAG_TOUCH + PLAYER_R) continue;
          if (p.team === f.team) { if (!atHome) { f.x = f.hx; f.y = f.hy; } }                    // my own flag lying about: touching it sends it home
          else { f.carrier = p.id; break; }                                                      // an enemy picks it up
        }
      }
    }
    for (const f of this.flags) {                                       // a carrier who gets home with the enemy flag, while their own flag is home, scores
      if (!f.carrier) continue;
      const c = this.players.get(f.carrier), own = this.flags.find((o) => o.team !== f.team);
      if (!c || !own || own.carrier || Math.hypot(own.x - own.hx, own.y - own.hy) > 4 || Math.hypot(c.x - own.hx, c.y - own.hy) > 52) continue;
      if (c.team === 'T') this.capT++; else this.capCT++;
      c.score += 3; f.carrier = null; f.x = f.hx; f.y = f.hy;
    }
    if (this.capT >= FLAG_TARGET) this.endRound('T', `${TEAM_INFO.T.name} captured the flag ${FLAG_TARGET} times`);
    else if (this.capCT >= FLAG_TARGET) this.endRound('CT', `${TEAM_INFO.CT.name} captured the flag ${FLAG_TARGET} times`);
    else if (this.time >= this.phaseEndsAt) {
      const tie = this.capT === this.capCT, t = tie ? this.tKills > this.ctKills : this.capT > this.capCT;      // a tie goes to the team with more kills
      this.endRound(t ? 'T' : 'CT', tie ? `Time up, tied ${this.capT}-${this.capCT}: more kills wins` : `Time up: ${Math.max(this.capT, this.capCT)}-${Math.min(this.capT, this.capCT)} captures`);
    }
  }

  // ---------- collect the intel ----------
  private stepCollect(dt: number) {
    void dt;
    for (const it of this.items) {
      if (this.time < it.readyAt) continue;
      for (const p of this.players.values()) {
        if (!p.alive || p.lv !== 0 || Math.hypot(p.x - it.x, p.y - it.y) > PLAYER_R + 16) continue;
        it.readyAt = this.time + ITEM_RESPAWN;
        if (p.team === 'T') this.tItems++; else this.ctItems++;
        p.score++;
        break;
      }
    }
    if (this.tItems >= COLLECT_TARGET) this.endRound('T', `${TEAM_INFO.T.name} collected ${COLLECT_TARGET} intel cases`);
    else if (this.ctItems >= COLLECT_TARGET) this.endRound('CT', `${TEAM_INFO.CT.name} collected ${COLLECT_TARGET} intel cases`);
    else if (this.time >= this.phaseEndsAt) {
      const t = this.tItems > this.ctItems;
      this.endRound(t ? 'T' : 'CT', this.tItems === this.ctItems ? `Time up, tied ${this.tItems}-${this.ctItems}: the defenders hold` : `Time up: ${Math.max(this.tItems, this.ctItems)}-${Math.min(this.tItems, this.ctItems)}`);
    }
  }

  private stepRound(dt: number) {
    if (this.phase === 'buy') {
      if (this.time >= this.phaseEndsAt) { this.phase = 'live'; this.phaseEndsAt = this.time + missionTime(this.mode); }
      return;
    }
    if (this.phase === 'post') { if (this.time >= this.phaseEndsAt) this.startRound(); return; }
    if (this.phase === 'over') { if (this.time >= this.phaseEndsAt) this.resetMatch(); return; }

    // live
    if (this.mode === 'range') return;                          // the practice range never ends
    if (this.mode === 'tdm') {                                  // team deathmatch: kills only
      if (this.tKills >= KILL_TARGET) this.endRound('T', `${TEAM_INFO.T.name} reached ${KILL_TARGET} kills`);
      else if (this.ctKills >= KILL_TARGET) this.endRound('CT', `${TEAM_INFO.CT.name} reached ${KILL_TARGET} kills`);
      else if (this.time >= this.phaseEndsAt) {
        const t = this.tKills > this.ctKills;
        this.endRound(t ? 'T' : 'CT', this.tKills === this.ctKills ? `Time up, tied ${this.tKills}-${this.ctKills}: the defenders hold` : `Time up: ${t ? this.tKills : this.ctKills}-${t ? this.ctKills : this.tKills}`);
      }
      return;
    }
    if (this.mode === 'rescue') { this.stepRescue(dt); return; }
    if (this.mode === 'collect') { this.stepCollect(dt); return; }
    if (this.mode === 'point') { this.stepPoint(dt); return; }
    if (this.mode === 'flag') { this.stepFlag(dt); return; }
    if (this.mode === 'vip') { this.stepVip(); return; }
    const b = this.bomb;
    const standing = (p: Player) => Math.hypot(p.input.mx, p.input.my) < 0.1;
    if (b.status === 'carried') {
      const c = b.carrier ? this.players.get(b.carrier) : undefined;
      if (!c || !c.alive) {
        this.bomb = { ...b, status: 'dropped', carrier: null, progress: 0, actor: null };
      } else {
        b.x = c.x; b.y = c.y; b.lv = c.lv;
        if (c.input.use && standing(c) && siteAt(c.x, c.y, this.map.sites, c.lv)) {
          b.progress += dt / PLANT_TIME; b.actor = c.id;
          if (b.progress >= 1) { this.bomb = { status: 'planted', x: c.x, y: c.y, lv: c.lv, carrier: null, fuse: BOMB_FUSE, progress: 0, actor: null }; }
        } else { b.progress = 0; b.actor = null; }
      }
    } else if (b.status === 'dropped') {
      for (const p of this.players.values()) {
        if (p.team === 'T' && p.alive && p.lv === (b.lv ?? 0) && Math.hypot(p.x - b.x, p.y - b.y) < PLAYER_R + 14) {
          this.bomb = { status: 'carried', x: p.x, y: p.y, carrier: p.id, fuse: 0, progress: 0, actor: null };
          break;
        }
      }
    } else if (b.status === 'planted') {
      b.fuse -= dt;
      let defuser: Player | null = null;
      for (const p of this.players.values()) {
        if (p.team === 'CT' && p.alive && p.lv === (b.lv ?? 0) && p.input.use && standing(p) && Math.hypot(p.x - b.x, p.y - b.y) <= DEFUSE_RANGE) { defuser = p; break; }
      }
      if (defuser) { b.progress += dt / DEFUSE_TIME; b.actor = defuser.id; } else { b.progress = 0; b.actor = null; }
      if (b.progress >= 1) { this.endRound('CT', 'Bomb defused'); return; }
      if (b.fuse <= 0) { this.endRound('T', 'Bomb exploded'); return; }
    }

    let tAlive = 0, ctAlive = 0;
    for (const p of this.players.values()) if (p.alive) (p.team === 'T' ? tAlive++ : ctAlive++);
    // Everyone respawns, so a team can never be wiped out: the game ends when the bomb goes off (Raiders), the bomb is defused or the clock runs out (Sentinels).
    void tAlive; void ctAlive;
    if (this.time >= this.phaseEndsAt && this.bomb.status !== 'planted') this.endRound('CT', 'Time ran out');
  }

  // ---------- main step ----------
  step(dt: number) {
    this.time += dt;
    if (this.rounds) this.stepRound(dt);
    const frozen = this.rounds && this.phase === 'buy';
    const canFire = !this.rounds || this.phase === 'live';

    for (const p of this.players.values()) {
      if (!p.alive) {
        if (this.time >= p.respawnAt && (!this.rounds || this.phase === 'live')) this.spawn(p);   // unlimited lives: back after RESPAWN_TIME
        continue;
      }
      if (p.bot) { this.thinkBot(p, dt); if (this.time < p.blindUntil) p.input.fire = false; }
      if (!frozen) {
        const px = p.x, py = p.y;
        const scoped = !!p.input.scoped;
        p.jumpCd -= dt; if (p.air > 0) p.air -= dt;
        if (p.input.jump && p.air <= 0 && p.jumpCd <= 0 && !p.input.prone) { p.air = JUMP_TIME; p.jumpCd = JUMP_COOLDOWN; }
        p.st = p.air > 0 ? 2 : p.input.prone ? 3 : p.input.crouch ? 1 : 0;
        const mult = adsSpeed(WEAPONS[p.weapon].cat, scoped) * (p.st === 1 ? CROUCH_SPEED : p.st === 2 ? JUMP_SPEED : p.st === 3 ? PRONE_SPEED : p.input.sneak ? SNEAK_SPEED : 1);
        movePlayer(p, p.input.mx, p.input.my, dt, this.wallsAt(p.lv), PLAYER_SPEED * mult * customMods(this.customOf(p)).speed * (p.usingItem >= 0 ? 0.55 : 1) * (p.boostUntil > this.time ? BOOST_SPEED : 1), p.st === 2);
        updateLevel(this.map, p);
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
      this.stepItems(p, canFire);
      {
        const wd = WEAPONS[p.weapon], mods = customMods(this.customOf(p));
        if (p.reloadUntil > 0 && this.time >= p.reloadUntil) {                    // reload finished: top the magazine up from the spare rounds
          const take = Math.min(wd.mag - p.ammoIn[p.weapon], p.ammoRes[p.weapon]);
          p.ammoIn[p.weapon] += take; p.ammoRes[p.weapon] -= take; p.reloadUntil = 0;
        }
        if (p.reloadUntil === 0 && this.time >= p.equipUntil && p.ammoIn[p.weapon] < wd.mag && p.ammoRes[p.weapon] > 0 && (p.input.reload || p.ammoIn[p.weapon] === 0)) {
          p.reloadUntil = this.time + wd.reload * mods.reload;                    // R pressed, or the magazine ran dry
        }
      }
      if (canFire && p.input.fire && p.cooldown <= 0 && p.reloadUntil === 0 && this.time >= p.equipUntil && p.ammoIn[p.weapon] > 0 && p.usingItem < 0) {
        const w = WEAPONS[p.weapon];
        p.cooldown = w.cooldown;
        p.ammoIn[p.weapon]--;
        for (let i = 0; i < w.pellets; i++) {
          const base = w.cat === 'Sniper' ? (p.bot || p.input.scoped ? 0 : 0.09) : w.spread;
          const spread = base * customMods(this.customOf(p)).spread * (p.st === 3 ? 0.35 : p.st === 1 ? 0.55 : p.st === 2 ? 1.8 : p.input.sneak ? 0.8 : 1) * (w.cat !== 'Sniper' && p.input.scoped ? ADS_SPREAD : 1);   // lying is steadiest, kneeling steady, mid-air wild
          const a = p.angle + (Math.random() - 0.5) * 2 * spread;
          p.sh++;
          this.bullets.push({
            id: this.nextBullet++, owner: p.id, team: p.team, dmg: w.dmg * (p.bot ? this.diff.dmg : 1), wid: p.weapon, lv: p.lv, z: p.z, crouch: p.st === 1 || p.st === 3, over: 0,
            x: p.x + Math.cos(a) * (PLAYER_R + 4), y: p.y + Math.sin(a) * (PLAYER_R + 4),
            vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: w.life,
          });
        }
      }
      this.map.heal.forEach((sp, i) => {
        if (p.lv === 0 && this.time >= this.pickupReadyAt[i] && p.hp < MAX_HP && Math.hypot(p.x - sp.x, p.y - sp.y) < PLAYER_R + PICKUP_R) {
          p.hp = Math.min(MAX_HP, p.hp + HEAL_AMOUNT);
          this.pickupReadyAt[i] = this.time + PICKUP_RESPAWN;
        }
      });
      if (this.rounds && this.phase === 'live') { // cash loot: stacks on the map and bags dropped by fallen players
        this.map.loot.forEach((sp, i) => {
          if (p.lv === 0 && !this.lootTaken[i] && Math.hypot(p.x - sp.x, p.y - sp.y) < PLAYER_R + 18) { this.lootTaken[i] = true; p.money = Math.min(MAX_MONEY, p.money + LOOT_AMOUNT); }
        });
        this.drops = this.drops.filter((d) => {
          if (p.lv !== d.lv || Math.hypot(p.x - d.x, p.y - d.y) >= PLAYER_R + 16) return true;
          p.money = Math.min(MAX_MONEY, p.money + d.amount);
          return false;
        });
      }
    }

    const alive: Bullet[] = [];
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; b.over -= dt;
      if (b.life <= 0) continue;
      // Walls stop bullets. Low cover only stops shots from a kneeling shooter: a standing shooter fires over it, and a kneeling
      // target right behind it is then hidden (the bullet flew over their head). So: kneel behind cover to hide, stand up to shoot.
      let blocked = false;
      for (const w of this.wallsAt(b.lv)) {
        if (b.x < w.x || b.x > w.x + w.w || b.y < w.y || b.y > w.y + w.h) continue;
        if (isLow(w) && !b.crouch) b.over = 0.3; else { blocked = true; break; }
      }
      if (blocked) { this.addImpact(b.x - b.vx * dt, b.y - b.vy * dt, 'wall', b.z); continue; }
      let hit = false;
      for (const p of this.players.values()) {
        if (!p.alive || p.id === b.owner || p.lv !== b.lv) continue;
        if (this.rounds && p.team === b.team) continue; // no friendly fire
        if (this.time < p.protect) continue;                // just respawned: untouchable for a moment
        if (b.over > 0 && (p.st === 1 || p.st === 3)) continue;   // kneeling or lying behind the cover this shot just flew over
        if (Math.hypot(p.x - b.x, p.y - b.y) <= (p.st === 3 ? PRONE_R : PLAYER_R)) {
          const shooter = this.players.get(b.owner); if (shooter) shooter.ht++;
          this.addImpact(b.x, b.y, 'body', b.z, { o: b.owner, v: p.id, a: Math.atan2(b.vy, b.vx) });
          if (this.invincible.has(p.id)) { hit = true; break; }
          this.damage(p, b.dmg, b.owner, b.team, b.wid); hit = true;
          break;
        }
      }
      if (!hit) alive.push(b);
    }
    this.bullets = alive;
    this.stepThrowables(dt);
  }

  // ---------- damage and kills (bullets, grenades and fire all end up here) ----------
  private damage(p: Player, amount: number, ownerId: string, ownerTeam: Team, weapon: number) {
    if (!p.alive || this.invincible.has(p.id) || this.time < p.protect) return;
    let dmg = amount * (this.mode === 'vip' && p.id === this.vipId ? 0.6 : 1);       // the VIP is tougher
    if (p.armor > 0) { const soaked = Math.min(p.armor, dmg * 0.5); p.armor -= soaked; dmg -= soaked; }
    const dealer = this.players.get(ownerId); if (dealer && dealer !== p) dealer.dd += Math.min(dmg, Math.max(0, p.hp));   // damage dealt (not more than the victim had left)
    p.hp -= dmg;
    p.usingItem = -1;                                                  // being hurt interrupts using an item
    if (p.hp > 0) return;
    p.alive = false; p.deaths++; p.respawnAt = this.time + (p.dummy ? RANGE_TARGET_RESPAWN : RESPAWN_TIME); p.usingItem = -1;
    if (this.rounds) this.drops.push({ id: this.nextDrop++, x: p.x, y: p.y, amount: DROP_AMOUNT, lv: p.lv });
    const killer = this.players.get(ownerId);
    if (killer && killer !== p) { killer.score++; if (this.rounds) killer.money = Math.min(MAX_MONEY, killer.money + KILL_MONEY); }
    if (this.rounds) { if (ownerTeam === 'T') this.tKills++; else this.ctKills++; }
    const st = this.streaks.get(ownerId);
    const multi = st && this.time - st.t <= MULTI_WINDOW ? st.n + 1 : 1; // kills in quick succession build a multi-kill
    this.streaks.set(ownerId, { n: multi, t: this.time });
    this.killLog.push({
      id: this.nextKill++, t: this.time, killer: ownerId, killerName: killer?.name ?? '?', killerTeam: ownerTeam,
      victim: p.id, victimName: p.name, victimTeam: p.team, weapon, multi, first: this.rounds && !this.firstBloodDone,
    });
    this.firstBloodDone = true;
    if (this.killLog.length > 24) this.killLog.shift();
  }

  // ---------- items ----------
  private resetItems(p: Player) {
    p.inv = ITEMS.map(() => 0);
    if (p.bot || this.free) { p.inv[0] = 1; p.inv[3] = 1; p.inv[5] = 1; p.inv[7] = 1; }
    if (p.bot) { p.inv[9] = 1; p.inv[8] = Math.random() < 0.5 ? 1 : 0; }          // a bandage, a frag and a flashbang to start with
    p.usingItem = -1; p.useUntil = 0; p.boostUntil = 0; p.blindUntil = 0; p.throwCd = 0; p.itemReq = -1;
  }
  /** Healing in progress, new use / throw requests, and picking up supplies. */
  private stepItems(p: Player, canFire: boolean) {
    if (p.usingItem >= 0 && this.time >= p.useUntil) {                  // finished healing
      const d = ITEMS[p.usingItem];
      if (p.inv[p.usingItem] > 0) { p.inv[p.usingItem]--; p.hp = Math.min(MAX_HP, p.hp + d.heal); if (d.id === 'adrenaline') p.boostUntil = this.time + BOOST_TIME; }
      p.usingItem = -1;
    }
    const req = p.itemReq; p.itemReq = -1;
    if (req >= 0 && p.inv[req] > 0) {
      const d = ITEMS[req];
      if (d.kind === 'heal') {
        if (p.usingItem === req) p.usingItem = -1;                      // press again to cancel
        else if (p.usingItem < 0 && (p.hp < MAX_HP || d.id === 'adrenaline')) { p.usingItem = req; p.useUntil = this.time + d.use; p.reloadUntil = 0; }
      } else if (canFire && this.time >= p.throwCd && p.usingItem < 0) {
        const c = Math.cos(p.angle), sn = Math.sin(p.angle);
        this.grenades.push({ id: this.nextThrow++, k: req, owner: p.id, team: p.team, x: p.x + c * (PLAYER_R + 6), y: p.y + sn * (PLAYER_R + 6), vx: c * THROW_SPEED, vy: sn * THROW_SPEED, age: 0, lv: p.lv });
        p.inv[req]--; p.throwCd = this.time + THROW_CD;
      }
    }
    for (const sp of this.supplies) {                                   // supply crates: walk over to take the item
      if (p.lv !== 0 || this.time < sp.readyAt || Math.hypot(p.x - sp.x, p.y - sp.y) > PLAYER_R + 16 || p.inv[sp.item] >= ITEMS[sp.item].max) continue;
      p.inv[sp.item]++; sp.readyAt = this.time + SUPPLY_RESPAWN; sp.item = rollItem();
    }
  }
  private smokeBlocks(x1: number, y1: number, x2: number, y2: number, lv = 0) {
    for (const z of this.zones) {
      if (z.k !== 'smoke' || z.lv !== lv || this.time >= z.until) continue;
      const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((z.x - x1) * dx + (z.y - y1) * dy) / len2));
      if (Math.hypot(x1 + dx * t - z.x, y1 + dy * t - z.y) < z.r) return true;
    }
    return false;
  }
  private stepThrowables(dt: number) {
    const keep: typeof this.grenades = [];
    for (const g of this.grenades) {
      const walls = this.wallsAt(g.lv), inWall = (x: number, y: number) => walls.some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);
      g.age += dt;
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt;
      const hx = inWall(nx, g.y), hy = inWall(g.x, ny);
      if (hx) g.vx *= -0.45; else g.x = nx;
      if (hy) g.vy *= -0.45; else g.y = ny;
      const f = Math.max(0, 1 - 1.4 * dt); g.vx *= f; g.vy *= f;       // friction: it rolls to a stop
      if (g.age >= FUSE[g.k] || ((hx || hy) && (ITEMS[g.k].id === 'molotov' || ITEMS[g.k].id === 'impact'))) this.explode(g); else keep.push(g);
    }
    this.grenades = keep;
    this.zones = this.zones.filter((z) => this.time < z.until);
    for (const z of this.zones) {
      if (z.k !== 'fire') continue;
      for (const p of this.players.values()) {
        if (p.lv !== z.lv) continue;                         // standing in flames hurts everybody except the thrower's team
        if (p.alive && (p.id === z.owner || !this.rounds || p.team !== z.team) && Math.hypot(p.x - z.x, p.y - z.y) < z.r) this.damage(p, FIRE_DPS * dt, z.owner, z.team, WEAPONS.length + 6);
      }
    }
  }
  private explode(g: { id: number; k: number; owner: string; team: Team; x: number; y: number; lv?: number }) {
    const lv = g.lv ?? 0;
    const id = ITEMS[g.k].id === 'impact' ? 'frag' : ITEMS[g.k].id, r = id === 'frag' ? FRAG_R : id === 'flash' ? FLASH_R : id === 'smoke' ? SMOKE_R : FIRE_R;
    this.blastLog.push({ id: this.nextImpact++, t: this.time, x: Math.round(g.x), y: Math.round(g.y), k: g.k, r, lv });
    if (this.blastLog.length > 30) this.blastLog.shift();
    for (const p of this.players.values()) {
      if (!p.alive || p.lv !== lv) continue;
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d > r || (id !== 'smoke' && id !== 'molotov' && segmentHitsWalls(g.x, g.y, p.x, p.y, this.wallsAt(lv)))) continue;
      if (id === 'frag' && (p.id === g.owner || !this.rounds || p.team !== g.team)) this.damage(p, FRAG_DMG * Math.pow(1 - d / r, 0.8), g.owner, g.team, WEAPONS.length + g.k);
      if (id === 'flash') p.blindUntil = Math.max(p.blindUntil, this.time + 1.2 + 3 * (1 - d / r));
    }
    if (id === 'smoke') this.zones.push({ id: this.nextThrow++, x: g.x, y: g.y, r: SMOKE_R, k: 'smoke', until: this.time + SMOKE_TIME, owner: g.owner, team: g.team, lv });
    if (id === 'molotov') this.zones.push({ id: this.nextThrow++, x: g.x, y: g.y, r: FIRE_R, k: 'fire', until: this.time + FIRE_TIME, owner: g.owner, team: g.team, lv });
  }
  private botItems(p: Player, target: Player | null, dist: number, visible: boolean) {
    p.botItemCd -= 1 / TICK_RATE;
    if (p.usingItem >= 0 || p.botItemCd > 0) return;
    if (p.hp < 70 && !visible) {                                       // out of sight and hurt: pick the right heal for how bad it is
      const pick = p.hp < 35 && p.inv[8] > 0 ? 8 : p.hp < 30 && p.inv[1] > 0 ? 1 : p.hp < 55 && p.inv[0] > 0 ? 0 : p.inv[7] > 0 ? 7 : p.hp < 45 && p.inv[1] > 0 ? 1 : -1;
      if (pick >= 0) { p.itemReq = pick; p.botItemCd = 4; return; }
    }
    if (visible && target && this.phase === 'live') {
      if (dist > 160 && dist < 400 && p.inv[3] > 0 && Math.random() < 0.5) { p.itemReq = 3; p.botItemCd = 7 + Math.random() * 6; }
      else if (dist > 130 && dist < 360 && p.inv[9] > 0 && Math.random() < 0.35) { p.itemReq = 9; p.botItemCd = 8 + Math.random() * 6; }
      else if (dist < 320 && p.inv[5] > 0 && Math.random() < 0.4) { p.itemReq = 5; p.botItemCd = 8 + Math.random() * 6; }
    }
  }

  // ---------- bots ----------
  private thinkBot(p: Player, dt: number) {
    if (p.dummy) { p.input = { mx: p.dummy.move ? Math.cos(this.time * 0.8 + p.dummy.ph) * 0.7 : 0, my: 0, angle: Math.PI, fire: false }; return; }   // a target dummy: stands or strafes, never shoots
    p.botThink -= dt;
    let target: Player | null = null, best = Infinity;
    for (const o of this.players.values()) {
      if (o === p || !o.alive) continue;
      if (this.rounds && o.team === p.team) continue;
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < best) { best = d; target = o; }
    }
    const visible = !!target && target.lv === p.lv && best < 700 && !segmentHitsWalls(p.x, p.y, target.x, target.y, this.wallsAt(p.lv)) && !this.smokeBlocks(p.x, p.y, target.x, target.y, p.lv);
    this.botItems(p, target, best, visible);

    const carrying = this.mode === 'flag' && this.flags.some((f) => f.carrier === p.id);
    if (carrying && this.rounds) {                                     // a flag carrier runs home and only shoots on the way
      this.botObjective(p);
      if (visible && target) { p.input.angle = Math.atan2(target.y - p.y, target.x - p.x); p.input.fire = true; }
      if (this.time < p.unstickUntil) { p.input.mx = p.unstickDir.x; p.input.my = p.unstickDir.y; }
      return;
    }
    if (target && (visible || !this.rounds)) {
      const ang = Math.atan2(target.y - p.y, target.x - p.x);
      if (p.botThink <= 0) {
        p.botThink = (0.4 + Math.random() * 0.6) * this.diff.think;
        const strafe = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        const toward = best > 260 ? 0 : best < 160 ? Math.PI : strafe;
        const a = ang + toward + (visible ? 0 : (Math.random() - 0.5) * 1.2);
        p.botDir = { x: Math.cos(a) * 0.8, y: Math.sin(a) * 0.8 };
      }
      // aim is deliberately imperfect so bots are beatable
      const aim = ang + Math.sin(this.time * 3 + p.x) * this.diff.aim;
      const cat = WEAPONS[p.weapon].cat;
      p.input = { mx: p.botDir.x, my: p.botDir.y, angle: aim, fire: visible, scoped: visible && best > 240 && (cat === 'Rifle' || cat === 'SMG' || cat === 'LMG') };
    } else if (this.rounds) {
      this.botObjective(p);
    } else {
      p.input = { mx: 0, my: 0, angle: p.angle, fire: false };
    }
    if (this.time < p.unstickUntil) { p.input.mx = p.unstickDir.x; p.input.my = p.unstickDir.y; }
  }

  /** Walk to a point on floor `glv`: through the door, round the interior wall, up or down the stairs and back out, as the target needs. */
  private botGoLv(p: Player, gx: number, gy: number, glv: number, stopR: number, use = false) {
    const map = this.map, blds = map.buildings ?? [];
    const inRect = (r: Rect, x: number, y: number) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
    const here = blds.find((b) => inRect(b.rect, p.x, p.y)), there = blds.find((b) => inRect(b.rect, gx, gy));
    const onRamp = stairAt(map, p.x, p.y);
    const funnel = (b: NonNullable<typeof here>) => Math.abs(p.y - b.door.out.y) < 55 && (b.side === 'W' ? p.x > b.rect.x - 70 && p.x < b.rect.x + 70 : p.x > b.rect.x + b.rect.w - 70 && p.x < b.rect.x + b.rect.w + 70);
    // inside a house with a door on the east side, a partition separates the door from the stairs: line up with the gap, then cross
    const go = (tx: number, ty: number, r: number, u = false) => {
      if (here && here.side === 'E' && p.lv === 0 && inRect(here.rect, tx, ty)) {
        const px = here.rect.x + here.rect.w * 0.58, gapY = here.door.in.y + 25;
        if ((p.x > px) !== (tx > px)) {                                // the target is on the other side of the partition
          if (Math.abs(p.y - gapY) > 22 && Math.abs(p.x - px) < 70) this.botGo(p, p.x, gapY, 10);        // first line up with the gap below the partition ...
          else this.botGo(p, p.x > px ? px - 50 : px + 50, gapY, 10);                                       // ... then cross to the far side
          return;
        }
      }
      this.botGo(p, tx, ty, r, u);
    };
    if (onRamp) {                                                      // already on a ramp: keep going to the far end
      const e = stairEnd(onRamp.stair, glv >= 1 ? 1 : 0, 34); this.botGo(p, e.x, e.y, 10); return;      // (on a ramp the floor flips halfway, so aim for the end of the floor we want)
    }
    if (glv === p.lv && (!there || here === there) && (!here || there)) { go(gx, gy, stopR, use); return; }   // same floor, same place: just walk
    if (here && !there && p.lv === 0 && glv === 0) {                   // inside a building, the goal is outside: out through the door
      const beyond = here.side === 'E' ? p.x > here.door.in.x - 40 : p.x < here.door.in.x + 40;
      if (beyond) this.botGo(p, here.door.out.x, here.door.out.y, 18); else go(here.door.in.x, here.door.in.y, 16);
      return;
    }
    const b = there ?? here;
    if (!b) { this.botGo(p, gx, gy, stopR, use); return; }
    const st = map.stairs![b.stair];
    if (!here || here !== b) {                                         // outside the building: to the door, then in
      if (funnel(b) || Math.hypot(p.x - b.door.out.x, p.y - b.door.out.y) < 70) this.botGo(p, b.door.in.x, b.door.in.y, 18); else this.botGo(p, b.door.out.x, b.door.out.y, 12);
      return;
    }
    if (glv > p.lv) {                                                  // go up: to the foot of the stairs, then straight up the ramp
      const e = stairEnd(st, 0, 30);
      if (Math.hypot(p.x - e.x, p.y - e.y) < 34) { const f = stairEnd(st, 1, 40); this.botGo(p, f.x, f.y, 6); } else go(e.x, e.y, 14);
      return;
    }
    if (glv < p.lv) {                                                  // go down: to the top of the stairs, then straight down the ramp
      const e = stairEnd(st, 1, 30);
      if (Math.hypot(p.x - e.x, p.y - e.y) < 34) { const f = stairEnd(st, 0, 40); this.botGo(p, f.x, f.y, 6); } else this.botGo(p, e.x, e.y, 14);
      return;
    }
    go(gx, gy, stopR, use);                                            // arrived on the right floor
  }

  /** Walk toward a point (stop within stopR), optionally holding the use key. */
  private botGo(p: Player, gx: number, gy: number, stopR: number, use = false) {
    const d = Math.hypot(gx - p.x, gy - p.y), ang = Math.atan2(gy - p.y, gx - p.x), move = d > stopR && !use;
    p.input = { mx: move ? Math.cos(ang) * 0.75 : 0, my: move ? Math.sin(ang) * 0.75 : 0, angle: move ? ang : p.angle, fire: false, use };
  }
  private botMission(p: Player): boolean {
    if (this.mode === 'rescue') {
      const ex = this.extract, ec = { x: ex.x + ex.w / 2, y: ex.y + ex.h / 2 };
      if (p.team === 'CT') {
        const carrying = this.hostages.some((h) => h.carrier === p.id);
        if (carrying) { this.botGo(p, ec.x, ec.y, 30); return true; }
        let best: { x: number; y: number } | null = null, bd = Infinity;
        for (const h of this.hostages) if (!h.rescued && !h.carrier) { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } }
        if (best) {
          // lone bots walk into the guards one by one and die: gather half way first, then push together
          const stage = { x: ec.x + (best.x - ec.x) * 0.5, y: ec.y + (best.y - ec.y) * 0.5 };
          const mates = [...this.players.values()].filter((o) => o.alive && o.team === 'CT');
          const grouped = mates.filter((o) => Math.hypot(o.x - stage.x, o.y - stage.y) < 300).length;
          if (grouped >= Math.min(3, mates.length)) this.pushUntil.CT = Math.max(this.pushUntil.CT, this.time + 16);
          if (this.time < this.pushUntil.CT || bd < 380) { this.botGo(p, best.x, best.y, 14, bd <= 36); return true; }
          this.botGo(p, stage.x, stage.y, 90); return true;
        }
        this.botGo(p, ec.x, ec.y, 120); return true;
      }
      const live = this.hostages.filter((h) => !h.rescued), g = live.length ? live[p.botGoal % live.length] : null;   // Raiders guard the hostages
      if (g) this.botGo(p, g.x, g.y, 110); else this.botGo(p, ec.x, ec.y, 140);
      return true;
    }
    if (this.mode === 'point' && this.cp) {                              // everybody heads for the zone and holds it, spread around its middle
      const a = p.botGoal * 2.1 + (p.id.length + p.id.charCodeAt(p.id.length - 1)) * 0.7;
      this.botGo(p, this.cp.x + Math.cos(a) * this.cp.r * 0.45, this.cp.y + Math.sin(a) * this.cp.r * 0.45, 24);
      return true;
    }
    if (this.mode === 'vip' && this.vipId) {
      const vip = this.players.get(this.vipId), ex = this.extract, ec = { x: ex.x + ex.w / 2, y: ex.y + ex.h / 2 };
      if (!vip) return false;
      if (p.team === 'CT') {
        const sc = this.map.spawns.CT, start = { x: sc.x + sc.w / 2, y: sc.y + sc.h / 2 };
        const escorts = [...this.players.values()].filter((o) => o.alive && o.team === 'CT' && o.id !== vip.id);
        if (p.id === vip.id) {                                                                              // the VIP waits for company, then walks to the extraction zone
          const near = escorts.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) < 300).length;
          if (near >= Math.min(2, escorts.length) || this.time > this.phaseEndsAt - VIP_TIME + 60) this.botGo(p, ec.x, ec.y, 30);
          else this.botGo(p, start.x + 160, start.y, 30);
          return true;
        }
        const d = Math.hypot(ec.x - vip.x, ec.y - vip.y) || 1;                                              // escorts walk a little ahead of the VIP
        const lead = 110 + (p.botGoal % 3) * 40, side = (p.botGoal % 2 ? 1 : -1) * 70;
        this.botGo(p, vip.x + ((ec.x - vip.x) / d) * lead - ((ec.y - vip.y) / d) * side, vip.y + ((ec.y - vip.y) / d) * lead + ((ec.x - vip.x) / d) * side, 50);
        return true;
      }
      if (vip.alive && Math.hypot(vip.x - p.x, vip.y - p.y) < 560) { this.botGo(p, vip.x, vip.y, 70); return true; }   // the VIP is close: hunt them
      const sc = this.map.spawns.CT, from = { x: sc.x + sc.w / 2, y: sc.y + sc.h / 2 }, f = 0.45 + (p.botGoal % 3) * 0.2;   // otherwise wait in ambush along the way
      const dx = ec.x - from.x, dy = ec.y - from.y, dl = Math.hypot(dx, dy) || 1, off = (p.botGoal % 2 ? 1 : -1) * 170;
      this.botGo(p, from.x + dx * f - (dy / dl) * off, from.y + dy * f + (dx / dl) * off, 60);
      return true;
    }
    if (this.mode === 'flag' && this.flags.length) {
      const mine = this.flags.find((f) => f.team === p.team)!, theirs = this.flags.find((f) => f.team !== p.team)!;
      const mineHome = Math.hypot(mine.x - mine.hx, mine.y - mine.hy) < 4;
      if (theirs.carrier === p.id) { this.botGo(p, mine.hx, mine.hy, 30); return true; }                 // carrying: run home
      if (mine.carrier) { this.botGo(p, mine.x, mine.y, 24); return true; }                              // my flag was stolen: hunt the carrier
      if (!mineHome) { this.botGo(p, mine.x, mine.y, 12); return true; }                                 // my flag is lying about: send it home
      if (p.botGoal % 3 === 0) { this.botGo(p, mine.hx + (p.botGoal % 2 ? 60 : -60), mine.hy + 40, 70); return true; }   // defenders stay by the flag
      if (theirs.carrier) { this.botGo(p, mine.hx, mine.hy, 110); return true; }                         // a mate has it: cover the home base
      const stage = { x: mine.hx + (theirs.x - mine.hx) * 0.45, y: mine.hy + (theirs.y - mine.hy) * 0.45 };   // attackers gather first, then go together
      const mates = [...this.players.values()].filter((o) => o.alive && o.team === p.team && o.botGoal % 3 !== 0);
      if (mates.filter((o) => Math.hypot(o.x - stage.x, o.y - stage.y) < 320).length >= Math.min(3, mates.length)) this.pushUntil[p.team] = Math.max(this.pushUntil[p.team], this.time + 22);
      if (this.time < this.pushUntil[p.team] || Math.hypot(theirs.x - p.x, theirs.y - p.y) < 420) this.botGo(p, theirs.x, theirs.y, 16);
      else this.botGo(p, stage.x, stage.y, 90);
      return true;
    }
    if (this.mode === 'collect') {
      let best: { x: number; y: number } | null = null, bd = Infinity;
      for (const it of this.items) { if (this.time < it.readyAt) continue; const d = Math.hypot(it.x - p.x, it.y - p.y); if (d < bd) { bd = d; best = it; } }
      if (best) this.botGo(p, best.x, best.y, 6); else { const s = this.map.sites[p.botGoal % this.map.sites.length]; this.botGo(p, s.x, s.y, 90); }
      return true;
    }
    return false;
  }

  private botObjective(p: Player) {
    if (this.botMission(p)) return;
    if (this.phase === 'live' && !(p.team === 'CT' && this.bomb.status === 'planted')) { // grab loot that is close by
      let best: { x: number; y: number } | null = null, bd = 190;
      this.map.loot.forEach((sp, i) => { const d = Math.hypot(sp.x - p.x, sp.y - p.y); if (!this.lootTaken[i] && d < bd) { bd = d; best = sp; } });
      for (const dr of this.drops) { const d = Math.hypot(dr.x - p.x, dr.y - p.y); if (d < bd) { bd = d; best = dr; } }
      if (best) {
        const t = best as { x: number; y: number };
        const ang = Math.atan2(t.y - p.y, t.x - p.x);
        p.input = { mx: Math.cos(ang) * 0.75, my: Math.sin(ang) * 0.75, angle: ang, fire: false, use: false };
        return;
      }
    }
    const b = this.bomb;
    let gx: number, gy: number, stopR = 40, use = false;
    const site = this.map.sites[p.botGoal];
    const slv = site.lv ?? 0;
    if (p.team === 'T') {
      if (b.status === 'carried' && b.carrier === p.id) {
        gx = site.x; gy = site.y; stopR = 6;
        use = p.lv === slv && Math.hypot(p.x - gx, p.y - gy) <= stopR + 14;
      } else if (b.status === 'dropped') { gx = b.x; gy = b.y; stopR = 10; }
      else if (b.status === 'planted') { gx = b.x; gy = b.y; stopR = 130; } // guard the bomb
      else { gx = site.x; gy = site.y; stopR = 90; }                      // escort the carrier
    } else if (b.status === 'planted') {
      gx = b.x; gy = b.y; stopR = DEFUSE_RANGE - 12;
      use = p.lv === (b.lv ?? 0) && Math.hypot(p.x - gx, p.y - gy) <= DEFUSE_RANGE - 6;
    } else { gx = site.x; gy = site.y; stopR = 110; }                      // hold a site
    const glv = b.status === 'planted' || b.status === 'dropped' ? (b.lv ?? 0) : slv;
    this.botGoLv(p, gx, gy, glv, stopR, use);
  }

  // ---------- snapshot ----------
  snapshot(): Snapshot {
    const r = (n: number) => Math.round(n * 10) / 10;
    return {
      t: this.time,
      players: [...this.players.values()].map((p) => ({
        iv: [...p.inv], us: p.usingItem, ul: p.usingItem >= 0 ? Math.round(Math.max(0, p.useUntil - this.time) * 10) / 10 : 0, bl: Math.round(Math.max(0, p.blindUntil - this.time) * 10) / 10, bo: p.boostUntil > this.time,
        lv: p.lv, z: Math.round(p.z * 10) / 10, id: p.id, name: p.name, x: r(p.x), y: r(p.y), angle: r(p.angle * 100) / 100,
        hp: Math.round(p.hp), score: p.score, deaths: p.deaths, bot: p.bot, alive: p.alive, weapon: p.weapon, sh: p.sh, ht: p.ht, dd: Math.round(p.dd),
        team: p.team, money: p.money, armor: Math.round(p.armor), owned: p.owned, skin: p.skin, st: p.st, ch: p.ch, am: p.ammoIn[p.weapon] ?? 0, rv: p.ammoRes[p.weapon] ?? 0, rl: p.reloadUntil > 0 ? Math.round(Math.max(0, p.reloadUntil - this.time) * 10) / 10 : 0, cu: this.customOf(p), rs: p.alive ? 0 : Math.max(0, Math.round((p.respawnAt - this.time) * 10) / 10),
      })),
      bullets: this.bullets.map((b) => ({ id: b.id, x: r(b.x), y: r(b.y), a: Math.round(Math.atan2(b.vy, b.vx) * 100) / 100, w: b.wid, z: b.z })),
      pickups: [
        ...this.map.heal.map((sp, i) => ({ id: i, x: sp.x, y: sp.y, kind: 'heal' as const })).filter((_, i) => this.time >= this.pickupReadyAt[i]),
        ...(this.rounds ? this.map.loot.map((sp, i) => ({ id: 100 + i, x: sp.x, y: sp.y, kind: 'cash' as const, amount: LOOT_AMOUNT })).filter((_, i) => !this.lootTaken[i]) : []),
        ...this.drops.map((d) => ({ id: 1000 + d.id, x: Math.round(d.x), y: Math.round(d.y), kind: 'cash' as const, amount: d.amount })),
      ],
      kills: this.killLog.filter((k) => this.time - k.t < 10),
      impacts: this.impactLog.filter((e) => this.time - e.t < 0.5),
      grenades: this.grenades.map((g) => ({ id: g.id, x: r(g.x), y: r(g.y), k: g.k, lv: g.lv })),
      zones: this.zones.map((z) => ({ id: z.id, x: r(z.x), y: r(z.y), r: z.r, k: z.k, lv: z.lv, left: Math.round(Math.max(0, z.until - this.time) * 10) / 10 })),
      blasts: this.blastLog.filter((e) => this.time - e.t < 1.2),
      supplies: this.supplies.filter((sp) => this.time >= sp.readyAt).map((sp) => ({ id: sp.id, x: sp.x, y: sp.y, item: sp.item })),
      round: this.rounds ? {
        phase: this.phase, timeLeft: Math.max(0, this.phaseEndsAt - this.time),
        tWins: this.tWins, ctWins: this.ctWins, roundNo: this.roundNo,
        winner: this.winner, reason: this.reason, bomb: { ...this.bomb, x: r(this.bomb.x), y: r(this.bomb.y) },
        mode: this.mode, weaponSet: this.weaponSet, pick: this.pick, free: this.free,
        tKills: this.tKills, ctKills: this.ctKills, killTarget: KILL_TARGET,
        hostages: this.hostages.filter((h) => !h.rescued).map((h) => ({ id: h.id, x: r(h.x), y: r(h.y), carried: !!h.carrier, by: h.carrier, progress: Math.round(h.progress * 100) / 100, actor: h.actor })),
        rescued: this.rescued, hostageCount: this.hostages.length, extract: this.extract,
        items: this.items.filter((it) => this.time >= it.readyAt).map((it) => ({ id: it.id, x: it.x, y: it.y })),
        tItems: this.tItems, ctItems: this.ctItems, itemTarget: COLLECT_TARGET,
        vip: this.vipId,
        cp: this.cp ? { x: this.cp.x, y: this.cp.y, r: this.cp.r, owner: this.cpOwner } : null, cpT: Math.floor(this.cpT), cpCT: Math.floor(this.cpCT), cpTarget: POINT_TARGET,
        flags: this.flags.map((f) => ({ team: f.team, x: Math.round(f.x), y: Math.round(f.y), hx: f.hx, hy: f.hy, carried: !!f.carrier, home: Math.hypot(f.x - f.hx, f.y - f.hy) < 4, by: f.carrier ?? undefined })), capT: this.capT, capCT: this.capCT, capTarget: FLAG_TARGET,
        goal: this.mode === 'tdm'
          ? { T: `Eliminate the Sentinels: the first team to ${KILL_TARGET} kills wins`, CT: `Eliminate the Raiders: the first team to ${KILL_TARGET} kills wins` }
          : this.mode === 'rescue'
          ? { T: 'Stop the Sentinels from rescuing the hostages. Guard them until time runs out', CT: 'Find the hostages (marked on screen), hold E next to one to untie it, then escort it to the extraction zone at your spawn' }
          : this.mode === 'collect'
          ? { T: `Collect ${COLLECT_TARGET} intel cases before the Sentinels do. Walk over a case to take it`, CT: `Collect ${COLLECT_TARGET} intel cases before the Raiders do. Walk over a case to take it` }
          : this.mode === 'point'
          ? { T: `Stand in the glowing zone in the middle of the map with no enemy inside to earn points. First to ${POINT_TARGET} points wins`, CT: `Stand in the glowing zone in the middle of the map with no enemy inside to earn points. First to ${POINT_TARGET} points wins` }
          : this.mode === 'range'
          ? { T: 'Practice range', CT: 'Practice range: knock down the targets (some strafe). Click a gun in the list to swap, hold right mouse to aim down the sights. B hides or shows the list' }
          : this.mode === 'vip'
          ? { T: 'Kill the VIP (the Sentinel with the gold marker) before they reach the extraction zone. If they get there, the Sentinels win', CT: 'Escort the VIP (gold marker) to the green extraction zone on the Raiders\' side. If the VIP dies, you lose' }
          : this.mode === 'flag'
          ? { T: `Steal the Sentinels' flag and carry it back to your own flag. Your flag must be at home to score. First to ${FLAG_TARGET} captures wins`, CT: `Steal the Raiders' flag and carry it back to your own flag. Your flag must be at home to score. First to ${FLAG_TARGET} captures wins` }
          : { T: 'Plant the bomb at a bomb site (A, B or the one upstairs in the house), then protect it until it explodes', CT: 'Defend the bomb sites. If the bomb is planted, defuse it before it explodes' },
      } : null,
    };
  }
}

// ---- network protocol ----
export type ClientMsg =
  | { type: 'join'; name: string; room: string; skin?: number; sidearm?: number; team?: Team | 'auto'; map?: string; style?: GameMode; wset?: WeaponSet; pick?: PickMode; cu?: Record<string, number> }
  | { type: 'input'; input: Input }
  | { type: 'buy'; item: number }
  | { type: 'ping'; t: number }
  | { type: 'voice'; ready: boolean }              // I have a microphone ready for team voice chat
  | { type: 'rtc'; to: string; data: unknown };    // WebRTC set-up message for a teammate (relayed by the server)
export type ServerMsg =
  | { type: 'welcome'; id: string; room: string; map: string; mode?: GameMode }
  | { type: 'snap'; snap: Snapshot }
  | { type: 'pong'; t: number }
  | { type: 'voice'; from: string; ready: boolean }
  | { type: 'rtc'; from: string; data: unknown };

export { other as otherTeam };
