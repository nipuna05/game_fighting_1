// Configurable keyboard shortcuts. Every action has up to two keys; the profile stores only what the player changed.
export interface ActionDef { id: string; label: string; group: string; defaults: string[] }
export type Binds = Record<string, string[]>;

export const ACTIONS: ActionDef[] = [
  { id: 'up', label: 'Move up', group: 'Movement', defaults: ['KeyW', 'ArrowUp'] },
  { id: 'down', label: 'Move down', group: 'Movement', defaults: ['KeyS', 'ArrowDown'] },
  { id: 'left', label: 'Move left', group: 'Movement', defaults: ['KeyA', 'ArrowLeft'] },
  { id: 'right', label: 'Move right', group: 'Movement', defaults: ['KeyD', 'ArrowRight'] },
  { id: 'use', label: 'Plant / defuse the bomb (hold)', group: 'Round', defaults: ['KeyE'] },
  { id: 'buyArmor', label: 'Buy armor', group: 'Round', defaults: ['KeyV'] },
  { id: 'rebuy', label: 'Rebuy last weapon pack', group: 'Round', defaults: ['KeyB'] },
  { id: 'sidearm', label: 'Select sidearm', group: 'Weapons', defaults: ['Digit1'] },
  { id: 'primary', label: 'Select primary weapon', group: 'Weapons', defaults: ['Digit2'] },
  { id: 'lastWeapon', label: 'Switch to the last weapon', group: 'Weapons', defaults: ['KeyQ'] },
  { id: 'scope', label: 'Sniper scope (hold)', group: 'Weapons', defaults: ['KeyZ'] },
  { id: 'mute', label: 'Mute sound', group: 'Other', defaults: ['KeyM'] },
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
