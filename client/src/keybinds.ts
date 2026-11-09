// Configurable keyboard shortcuts. Every action has up to two keys; the profile stores only what the player changed.
export interface ActionDef { id: string; label: string; group: string; defaults: string[] }
export type Binds = Record<string, string[]>;

export const ACTIONS: ActionDef[] = [
  { id: 'up', label: 'Move up', group: 'Movement', defaults: ['KeyW', 'ArrowUp'] },
  { id: 'down', label: 'Move down', group: 'Movement', defaults: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Move left', group: 'Movement', defaults: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Move right', group: 'Movement', defaults: ['KeyD', 'ArrowRight'] },
  { id: 'jump', label: 'Jump (over low cover)', group: 'Movement', defaults: ['Space'] },
  { id: 'crouch', label: 'Kneel down (hold)', group: 'Movement', defaults: ['KeyC', 'ControlLeft'] },
  { id: 'prone', label: 'Lie down / get up (prone, crawl)', group: 'Movement', defaults: ['KeyX'] },
  { id: 'sneak', label: 'Walk slowly / sneak (hold)', group: 'Movement', defaults: ['ShiftLeft'] },
  { id: 'use', label: 'Plant / defuse the bomb (hold)', group: 'Round', defaults: ['KeyE'] },
  { id: 'buyArmor', label: 'Buy armor', group: 'Round', defaults: ['KeyV'] },
  { id: 'rebuy', label: 'Rebuy last weapon pack', group: 'Round', defaults: ['KeyB'] },
  { id: 'sidearm', label: 'Select sidearm', group: 'Weapons', defaults: ['Digit1'] },
  { id: 'primary', label: 'Select primary weapon', group: 'Weapons', defaults: ['Digit2'] },
  { id: 'item0', label: 'Use a bandage (+25 HP)', group: 'Items', defaults: ['Digit3'] },
  { id: 'item1', label: 'Use a medkit (+75 HP)', group: 'Items', defaults: ['Digit4'] },
  { id: 'item2', label: 'Use adrenaline (+30 HP, speed boost)', group: 'Items', defaults: ['Digit5'] },
  { id: 'item3', label: 'Throw a frag grenade', group: 'Items', defaults: ['Digit6'] },
  { id: 'item4', label: 'Throw a smoke grenade', group: 'Items', defaults: ['Digit7'] },
  { id: 'item5', label: 'Throw a flashbang', group: 'Items', defaults: ['Digit8'] },
  { id: 'item6', label: 'Throw a molotov', group: 'Items', defaults: ['Digit9'] },
  { id: 'item7', label: 'Use painkillers (+15 HP, quick)', group: 'Items', defaults: ['Digit0'] },
  { id: 'item8', label: 'Use a first-aid kit (+55 HP)', group: 'Items', defaults: ['KeyF'] },
  { id: 'item9', label: 'Throw an impact grenade (bursts on contact)', group: 'Items', defaults: ['KeyH'] },
  { id: 'reload', label: 'Reload', group: 'Weapons', defaults: ['KeyR'] },
  { id: 'lastWeapon', label: 'Switch to the last weapon', group: 'Weapons', defaults: ['KeyQ'] },
  { id: 'scope', label: 'Sniper scope (hold)', group: 'Weapons', defaults: ['KeyZ'] },
  { id: 'specNext', label: 'Next player to watch / skip the replay', group: 'When you are out', defaults: ['Enter', 'KeyN'] },
  { id: 'replay', label: 'Watch my death again in slow motion', group: 'When you are out', defaults: ['KeyG'] },
  { id: 'talk', label: 'Talk to my team (hold)', group: 'Voice chat', defaults: ['KeyT'] },
  { id: 'view', label: 'Camera: top-down / first-person', group: 'Other', defaults: ['KeyP'] },
  { id: 'mute', label: 'Mute sound', group: 'Other', defaults: ['KeyM'] },
  { id: 'help', label: 'Show the controls cheat sheet', group: 'Other', defaults: ['F1'] },
  { id: 'perf', label: 'FPS and ping overlay', group: 'Other', defaults: ['F3'] },
];

/** Defaults with the player's changes on top (a changed action replaces both of its keys). */
export function resolveBinds(over: Binds = {}): Binds {
  const out: Binds = {};
  for (const a of ACTIONS) out[a.id] = Array.isArray(over[a.id]) ? over[a.id].slice(0, 2) : a.defaults.slice();
  return out;
}

let current: Binds = resolveBinds();
let lookup = new Map<string, string>();

export function applyBinds(over: Binds = {}) {
  current = resolveBinds(over);
  lookup = new Map();
  for (const a of ACTIONS) for (const code of current[a.id]) if (code) lookup.set(code, a.id);
}
applyBinds();

export const binds = () => current;
export const actionFor = (code: string) => lookup.get(code);

/** Human-friendly key name. */
export function keyLabel(code: string | undefined): string {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const map: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Enter: 'Enter', CapsLock: 'Caps',
  };
  return map[code] ?? code;
}

/** One-line controls reminder built from the current bindings. */
export function hintText(): string {
  const k = (id: string) => keyLabel(current[id][0]);
  return `${k('up')} ${k('left')} ${k('down')} ${k('right')} move · mouse aim · click shoot · hold right mouse (or ${k('scope')}) to scope a sniper · hold ${k('use')} plant / defuse · buy menu (${k('buyArmor')} armor, ${k('rebuy')} rebuy) · ${k('sidearm')} sidearm / ${k('primary')} primary / wheel / ${k('lastWeapon')} switch · ${k('mute')} mute · ${k('perf')} fps`;
}
