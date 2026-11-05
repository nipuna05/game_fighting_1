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
export interface Profile { coins: number; name: string; skin: number; team: TeamPref; sidearm: number; map: string; autoBuy: AutoBuy; pack: Pack | null; packVer: number; history: MatchEntry[]; totals: Totals }
const PACK_VERSION = 2; // bump when weapon indexes change, so old saved packs are dropped

const KEY = 'fight.profile.v1';
const MAX_HISTORY = 20;

const fresh = (): Profile => ({ coins: 0, name: '', skin: 0, team: 'auto', sidearm: 0, map: 'town', autoBuy: { primary: null, armor: false }, pack: null, packVer: PACK_VERSION, history: [], totals: { matches: 0, wins: 0, kills: 0, deaths: 0 } });

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw) as Partial<Profile>;
    const base = fresh();
    return {
      coins: Number.isFinite(p.coins) ? Math.max(0, Math.floor(p.coins as number)) : 0,
      name: typeof p.name === 'string' ? p.name.slice(0, 14) : base.name,
      skin: Number.isInteger(p.skin) ? Math.max(0, Math.min(3, p.skin as number)) : 0,
      team: p.team === 'CT' || p.team === 'T' ? p.team : 'auto',
      sidearm: Number.isInteger(p.sidearm) ? Math.max(0, Math.min(2, p.sidearm as number)) : 0,
      map: typeof p.map === 'string' ? p.map.slice(0, 20) : base.map,
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

export function clearHistory(p: Profile) {
  p.history = [];
  p.totals = { matches: 0, wins: 0, kills: 0, deaths: 0 };
  p.pack = null;
  saveProfile(p);
}
