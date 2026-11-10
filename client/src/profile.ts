import { WEAPONS, cleanCustom, type GameMode, type WeaponSet, type PickMode, type Difficulty } from '@fight/shared';
// Player profile, saved in this browser's localStorage (name, costume, last weapon pack, recent fights).
// It is per browser. Accounts that follow you across devices need a server database (a later step).
import type { Team } from '@fight/shared';

export interface MatchEntry {
  t: number;                      // when the match ended (ms since epoch)
  mode: 'single' | 'multi';
  room: string;
  team: Team;
  won: boolean;
  tWins: number;
  ctWins: number;
  kills: number;
  deaths: number;
  coins?: number; // coins earned for this match
  style?: GameMode; map?: string; shots?: number; hits?: number; dmg?: number;   // what was played and how well (older entries do not have these)
}
export interface Pack { weapons: number[]; armor: boolean }
export interface AutoBuy { primary: number | null; armor: boolean } // buy this automatically at the start of every buy phase
export interface Totals { matches: number; wins: number; kills: number; deaths: number; shots: number; hits: number; dmg: number; bestKills: number; bestStreak: number; byWeapon: Record<string, number>; statGames: number }   // statGames: games recorded with shot / damage counts
const emptyTotals = (): Totals => ({ matches: 0, wins: 0, kills: 0, deaths: 0, shots: 0, hits: 0, dmg: 0, bestKills: 0, bestStreak: 0, byWeapon: {}, statGames: 0 });
export type TeamPref = 'auto' | 'CT' | 'T';
// Costumes and sidearms can be unlocked with coins earned from finished matches (index = costume / weapon index).
export const SKIN_PRICES = [0, 0, 300, 400];
export const KIT_PRICES = [0, 0, 200, 300, 300, 500, 900];   // dress kits: Standard and Woodland are free
export const SIDEARM_PRICES = [0, 500, 250]; // USP, Desert Eagle, Glock 18
export const START_COINS = 400;
export interface Unlocks { skins: number[]; sidearms: number[]; tints: number[]; kits: number[] }
export interface Daily { claimed: number; last: string }     // days claimed in this 28-day cycle, and the date of the last claim (YYYY-MM-DD)
export const TINT_PRICES = [0, 0, 0, 0, 400, 900];          // weapon finishes: Factory, Black, Desert, Olive are free; Arctic and Gold cost coins or come from daily rewards
export interface Options { replay: boolean; voice: 'ptt' | 'open' | 'off'; view: 'top' | 'fps'; viewSet?: boolean; music: number; helpSeen?: boolean; sens?: number; adsSens?: number; quality?: 'auto' | 'high' | 'medium' | 'low' | 'min' } // replay = slow-motion kill cam; voice = team voice chat mode
export interface Challenges { date: string; progress: number[]; claimed: boolean[] }   // today's three daily challenges (what they are comes from the date)
export interface Profile { challenges?: Challenges; options: Options; keybinds: Record<string, string[]>; titles: Record<string, number>; unlocks: Unlocks; coins: number; name: string; skin: number; kit: number; team: TeamPref; sidearm: number; map: string; style: GameMode; weaponSet: WeaponSet; pick: PickMode; difficulty: Difficulty; custom: Record<string, number>; daily: Daily; autoBuy: AutoBuy; pack: Pack | null; packVer: number; history: MatchEntry[]; totals: Totals }
const PACK_VERSION = 2; // bump when weapon indexes change, so old saved packs are dropped

const KEY = 'fight.profile.v1';
const MAX_HISTORY = 20;

const fresh = (): Profile => ({ options: { replay: true, voice: 'off', view: 'fps', viewSet: false, music: 55, helpSeen: false, sens: 100, adsSens: 70, quality: 'auto' }, keybinds: {}, titles: {}, unlocks: { skins: [0, 1], sidearms: [0], tints: [0, 1, 2, 3], kits: [0, 1] }, coins: START_COINS, name: '', skin: 0, kit: 0, team: 'auto', sidearm: 0, map: 'town', style: 'bomb', weaponSet: 'all', pick: 'manual', difficulty: 'normal', custom: {}, daily: { claimed: 0, last: '' }, autoBuy: { primary: null, armor: false }, pack: null, packVer: PACK_VERSION, history: [], totals: emptyTotals() });

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Profile>;
    const base = fresh();
    return {
      options: {
        replay: p.options?.replay !== false,
        voice: p.options?.voice === 'open' || p.options?.voice === 'ptt' ? p.options.voice : 'off',
        // first-person (through the soldier's eyes) is the default; a saved choice only counts once the player has picked one themselves
        view: p.options?.viewSet ? (p.options.view === 'top' ? 'top' : 'fps') : 'fps',
        viewSet: !!p.options?.viewSet,
        helpSeen: !!p.options?.helpSeen,
        sens: typeof p.options?.sens === 'number' && Number.isFinite(p.options.sens) ? Math.max(20, Math.min(300, Math.round(p.options.sens))) : 100,
        adsSens: typeof p.options?.adsSens === 'number' && Number.isFinite(p.options.adsSens) ? Math.max(20, Math.min(100, Math.round(p.options.adsSens))) : 70,
        quality: (['auto', 'high', 'medium', 'low', 'min'] as string[]).includes(p.options?.quality as string) ? p.options!.quality : 'auto',
        music: typeof p.options?.music === 'number' && Number.isFinite(p.options.music) ? Math.max(0, Math.min(100, Math.round(p.options.music))) : 55,
      },
      keybinds: p.keybinds && typeof p.keybinds === 'object'
        ? Object.fromEntries(Object.entries(p.keybinds).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k.slice(0, 20), (v as unknown[]).filter((c) => typeof c === 'string').slice(0, 2).map((c) => String(c).slice(0, 20))]))
        : {},
      titles: p.titles && typeof p.titles === 'object'
        ? Object.fromEntries(Object.entries(p.titles).filter(([k, v]) => typeof k === 'string' && Number.isFinite(v) && v > 0).map(([k, v]) => [k.slice(0, 24), Math.floor(v as number)]))
        : {},
      unlocks: {
        skins: [...new Set([0, 1, ...(Array.isArray(p.unlocks?.skins) ? p.unlocks!.skins.filter((n) => Number.isInteger(n) && n >= 0 && n < SKIN_PRICES.length) : [])])],
        sidearms: [...new Set([0, ...(Array.isArray(p.unlocks?.sidearms) ? p.unlocks!.sidearms.filter((n) => Number.isInteger(n) && n >= 0 && n < SIDEARM_PRICES.length) : [])])],
        tints: [...new Set([0, 1, 2, 3, ...(Array.isArray(p.unlocks?.tints) ? p.unlocks!.tints.filter((n) => Number.isInteger(n) && n >= 0 && n < TINT_PRICES.length) : [])])],
        kits: [...new Set([0, 1, ...(Array.isArray(p.unlocks?.kits) ? p.unlocks!.kits.filter((n) => Number.isInteger(n) && n >= 0 && n < KIT_PRICES.length) : [])])],
      },
      daily: { claimed: Number.isInteger(p.daily?.claimed) ? Math.max(0, Math.min(28, p.daily!.claimed)) : 0, last: typeof p.daily?.last === 'string' ? p.daily.last.slice(0, 10) : '' },
      coins: Number.isFinite(p.coins) ? Math.max(0, Math.floor(p.coins as number)) : START_COINS,
      name: typeof p.name === 'string' ? p.name.slice(0, 14) : base.name,
      skin: Number.isInteger(p.skin) ? Math.max(0, Math.min(3, p.skin as number)) : 0,
      kit: Number.isInteger(p.kit) ? Math.max(0, Math.min(KIT_PRICES.length - 1, p.kit as number)) : 0,
      team: p.team === 'CT' || p.team === 'T' ? p.team : 'auto',
      sidearm: Number.isInteger(p.sidearm) ? Math.max(0, Math.min(2, p.sidearm as number)) : 0,
      map: typeof p.map === 'string' ? p.map.slice(0, 20) : base.map,
      style: (['tdm', 'rescue', 'collect', 'point', 'flag', 'vip', 'range'] as string[]).includes(p.style as string) ? p.style as GameMode : 'bomb',
      weaponSet: (['all', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'random'] as string[]).includes(p.weaponSet as string) ? p.weaponSet as WeaponSet : 'all',
      pick: p.pick === 'auto' ? 'auto' : 'manual',
      difficulty: p.difficulty === 'easy' || p.difficulty === 'hard' ? p.difficulty : 'normal',
      custom: p.custom && typeof p.custom === 'object' ? Object.fromEntries(WEAPONS.filter((w) => (p.custom as Record<string, unknown>)[w.id] !== undefined).map((w) => [w.id, cleanCustom(w.id, (p.custom as Record<string, unknown>)[w.id])])) : {},
      autoBuy: {
        primary: p.autoBuy && Number.isInteger(p.autoBuy.primary) && (p.autoBuy.primary as number) >= 3 ? (p.autoBuy.primary as number) : null,
        armor: !!p.autoBuy?.armor,
      },
      packVer: PACK_VERSION,
      pack: p.packVer === PACK_VERSION && p.pack && Array.isArray(p.pack.weapons) ? { weapons: p.pack.weapons.filter(Number.isInteger), armor: !!p.pack.armor } : null,
      history: Array.isArray(p.history) ? p.history.slice(0, MAX_HISTORY) : [],
      challenges: p.challenges && typeof p.challenges.date === 'string' && Array.isArray(p.challenges.progress) && Array.isArray(p.challenges.claimed) ? { date: p.challenges.date.slice(0, 10), progress: p.challenges.progress.slice(0, 3).map((n) => (Number.isFinite(n) ? Math.max(0, n) : 0)), claimed: p.challenges.claimed.slice(0, 3).map(Boolean) } : undefined,
      totals: { ...base.totals, ...(p.totals ?? {}), byWeapon: p.totals?.byWeapon && typeof p.totals.byWeapon === 'object' ? p.totals.byWeapon : {} },
    };
  } catch {
    return fresh(); // storage blocked or corrupt: start clean, the game still works
  }
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode / quota: ignore */ }
}

// ---------- daily challenges: three per day, the same for everybody, picked from the date ----------
export interface ChallengeDef { kind: 'catKills' | 'winMode' | 'damage' | 'streak' | 'accuracy' | 'play' | 'kills'; arg?: string; text: string; target: number; reward: number }
export const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const MODE_NAMES: Record<string, string> = { bomb: 'Bomb mission', tdm: 'Team deathmatch', rescue: 'Hostage rescue', collect: 'Collect the intel', point: 'Control point', flag: 'Capture the flag', vip: 'VIP escort' };
export function makeChallenges(date: string): ChallengeDef[] {
  let h = 2166136261; for (const ch of date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };   // a small seeded random generator
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const cat = pick(['SMG', 'Rifle', 'Shotgun', 'Sniper', 'LMG']), mode = pick(['bomb', 'tdm', 'rescue', 'collect', 'point', 'flag', 'vip']);
  const catTarget: Record<string, number> = { SMG: 12, Rifle: 12, Shotgun: 8, Sniper: 6, LMG: 10 };
  const pool: ChallengeDef[] = [
    { kind: 'catKills', arg: cat, text: `Get ${catTarget[cat]} kills with ${cat === 'SMG' ? 'SMGs' : cat === 'LMG' ? 'LMGs' : `${cat.toLowerCase()}s`}`, target: catTarget[cat], reward: 150 },
    { kind: 'winMode', arg: mode, text: `Win a game of ${MODE_NAMES[mode]}`, target: 1, reward: 200 },
    { kind: 'damage', text: 'Deal 1500 damage in total', target: 1500, reward: 150 },
    { kind: 'streak', text: 'Get a 3-kill streak in one game', target: 3, reward: 150 },
    { kind: 'accuracy', text: 'Finish a game with 30% accuracy (at least 20 shots)', target: 1, reward: 200 },
    { kind: 'play', text: 'Finish 3 games', target: 3, reward: 100 },
    { kind: 'kills', text: 'Get 20 kills in total', target: 20, reward: 120 },
  ];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3);
}
/** Today's progress: a new day starts three fresh challenges. */
export function ensureChallenges(p: Profile): Challenges {
  const today = localDate();
  if (!p.challenges || p.challenges.date !== today || p.challenges.progress.length !== 3) p.challenges = { date: today, progress: [0, 0, 0], claimed: [false, false, false] };
  return p.challenges;
}
export function claimChallenge(p: Profile, i: number): number {
  const ch = ensureChallenges(p), d = makeChallenges(ch.date)[i];
  if (!d || ch.claimed[i] || ch.progress[i] < d.target) return 0;
  ch.claimed[i] = true; p.coins += d.reward; saveProfile(p);
  return d.reward;
}
export const challengesReady = (p: Profile) => { const ch = ensureChallenges(p), defs = makeChallenges(ch.date); return defs.some((d, i) => !ch.claimed[i] && ch.progress[i] >= d.target); };
function countChallenges(p: Profile, e: MatchEntry, extra?: { byWeapon: Record<string, number>; bestStreak: number }) {
  const ch = ensureChallenges(p), defs = makeChallenges(ch.date);
  defs.forEach((d, i) => {
    let v = ch.progress[i];
    switch (d.kind) {
      case 'catKills': v += Object.entries(extra?.byWeapon ?? {}).reduce((n, [id, k]) => n + (WEAPONS.find((w) => w.id === id)?.cat === d.arg ? k : 0), 0); break;
      case 'winMode': if (e.won && e.style === d.arg) v += 1; break;
      case 'damage': v += e.dmg ?? 0; break;
      case 'streak': v = Math.max(v, extra?.bestStreak ?? 0); break;
      case 'accuracy': if ((e.shots ?? 0) >= 20 && (e.hits ?? 0) / (e.shots ?? 1) >= 0.3) v += 1; break;
      case 'play': v += 1; break;
      case 'kills': v += e.kills; break;
    }
    ch.progress[i] = Math.min(d.target, v);
  });
}

export function addMatch(p: Profile, e: MatchEntry, extra?: { byWeapon: Record<string, number>; bestStreak: number }) {
  countChallenges(p, e, extra);
  p.history.unshift(e);
  p.history = p.history.slice(0, MAX_HISTORY);
  p.totals.matches++;
  if (e.won) p.totals.wins++;
  p.totals.kills += e.kills;
  p.totals.deaths += e.deaths;
  if (e.shots !== undefined) p.totals.statGames++;
  p.totals.shots += e.shots ?? 0; p.totals.hits += e.hits ?? 0; p.totals.dmg += e.dmg ?? 0;
  p.totals.bestKills = Math.max(p.totals.bestKills, e.kills);
  if (extra) {
    p.totals.bestStreak = Math.max(p.totals.bestStreak, extra.bestStreak);
    for (const [w, n] of Object.entries(extra.byWeapon)) p.totals.byWeapon[w] = (p.totals.byWeapon[w] ?? 0) + n;
  }
  p.coins += e.coins ?? 0;
  saveProfile(p);
}

/** Count a title earned (first blood, a multi-kill, match MVP) and save it. */
export function addTitle(p: Profile, name: string) {
  p.titles[name] = (p.titles[name] ?? 0) + 1;
  saveProfile(p);
}

export function clearHistory(p: Profile) {
  p.history = [];
  p.totals = emptyTotals();
  p.pack = null;
  p.titles = {};
  saveProfile(p);
}
