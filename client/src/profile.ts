import { WEAPONS, cleanCustom, type GameMode, type WeaponSet, type PickMode } from '@fight/shared';
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
}
export interface Pack { weapons: number[]; armor: boolean }
export interface AutoBuy { primary: number | null; armor: boolean } // buy this automatically at the start of every buy phase
export interface Totals { matches: number; wins: number; kills: number; deaths: number }
export type TeamPref = 'auto' | 'CT' | 'T';
// Costumes and sidearms can be unlocked with coins earned from finished matches (index = costume / weapon index).
export const SKIN_PRICES = [0, 0, 300, 400];
export const KIT_PRICES = [0, 0, 200, 300, 300, 500, 900];   // dress kits: Standard and Woodland are free
export const SIDEARM_PRICES = [0, 500, 250]; // USP, Desert Eagle, Glock 18
export const START_COINS = 400;
export interface Unlocks { skins: number[]; sidearms: number[]; tints: number[]; kits: number[] }
export interface Daily { claimed: number; last: string }     // days claimed in this 28-day cycle, and the date of the last claim (YYYY-MM-DD)
export const TINT_PRICES = [0, 0, 0, 0, 400, 900];          // weapon finishes: Factory, Black, Desert, Olive are free; Arctic and Gold cost coins or come from daily rewards
export interface Options { replay: boolean; voice: 'ptt' | 'open' | 'off'; view: 'top' | 'fps'; viewSet?: boolean; music: number } // replay = slow-motion kill cam; voice = team voice chat mode
export interface Profile { options: Options; keybinds: Record<string, string[]>; titles: Record<string, number>; unlocks: Unlocks; coins: number; name: string; skin: number; kit: number; team: TeamPref; sidearm: number; map: string; style: GameMode; weaponSet: WeaponSet; pick: PickMode; custom: Record<string, number>; daily: Daily; autoBuy: AutoBuy; pack: Pack | null; packVer: number; history: MatchEntry[]; totals: Totals }
const PACK_VERSION = 2; // bump when weapon indexes change, so old saved packs are dropped

const KEY = 'fight.profile.v1';
const MAX_HISTORY = 20;

const fresh = (): Profile => ({ options: { replay: true, voice: 'off', view: 'fps', viewSet: false, music: 55 }, keybinds: {}, titles: {}, unlocks: { skins: [0, 1], sidearms: [0], tints: [0, 1, 2, 3], kits: [0, 1] }, coins: START_COINS, name: '', skin: 0, kit: 0, team: 'auto', sidearm: 0, map: 'town', style: 'bomb', weaponSet: 'all', pick: 'manual', custom: {}, daily: { claimed: 0, last: '' }, autoBuy: { primary: null, armor: false }, pack: null, packVer: PACK_VERSION, history: [], totals: { matches: 0, wins: 0, kills: 0, deaths: 0 } });

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
      style: p.style === 'tdm' || p.style === 'rescue' || p.style === 'collect' ? p.style : 'bomb',
      weaponSet: (['all', 'pistol', 'smg', 'shotgun', 'rifle', 'sniper', 'random'] as string[]).includes(p.weaponSet as string) ? p.weaponSet as WeaponSet : 'all',
      pick: p.pick === 'auto' ? 'auto' : 'manual',
      custom: p.custom && typeof p.custom === 'object' ? Object.fromEntries(WEAPONS.filter((w) => (p.custom as Record<string, unknown>)[w.id] !== undefined).map((w) => [w.id, cleanCustom(w.id, (p.custom as Record<string, unknown>)[w.id])])) : {},
      autoBuy: {
        primary: p.autoBuy && Number.isInteger(p.autoBuy.primary) && (p.autoBuy.primary as number) >= 3 ? (p.autoBuy.primary as number) : null,
        armor: !!p.autoBuy?.armor,
      },
      packVer: PACK_VERSION,
      pack: p.packVer === PACK_VERSION && p.pack && Array.isArray(p.pack.weapons) ? { weapons: p.pack.weapons.filter(Number.isInteger), armor: !!p.pack.armor } : null,
      history: Array.isArray(p.history) ? p.history.slice(0, MAX_HISTORY) : [],
      totals: { ...base.totals, ...(p.totals ?? {}) },
    };
  } catch {
    return fresh(); // storage blocked or corrupt: start clean, the game still works
  }
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode / quota: ignore */ }
}

export function addMatch(p: Profile, e: MatchEntry) {
  p.history.unshift(e);
  p.history = p.history.slice(0, MAX_HISTORY);
  p.totals.matches++;
  if (e.won) p.totals.wins++;
  p.totals.kills += e.kills;
  p.totals.deaths += e.deaths;
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
  p.totals = { matches: 0, wins: 0, kills: 0, deaths: 0 };
  p.pack = null;
  p.titles = {};
  saveProfile(p);
}
