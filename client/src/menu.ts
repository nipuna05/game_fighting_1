// Landing-page menu: Play / Loadout / Costume / Profile tabs.
import { WEAPONS, TEAM_INFO, MAPS, MAP_IDS, SKIN_COUNT, TITLE_RANK } from '@fight/shared';
import { ACTIONS, binds, applyBinds, keyLabel, hintText, resolveBinds } from './keybinds';
import { saveProfile, clearHistory, SKIN_PRICES, SIDEARM_PRICES, type Profile, type TeamPref } from './profile';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface MenuHooks {
  onPlay(mode: 'single' | 'multi'): void;
  onMap(id: string): void;
  onSkin(i: number): void;
  onPrimary(weapon: number | null): void;
}

export function initMenu(profile: Profile, hooks: MenuHooks) {
  let msgTimer = 0;
  const say = (text: string) => {
    const el = $('menumsg');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(msgTimer);
    msgTimer = window.setTimeout(() => el.classList.remove('on'), 3500);
  };
  const save = () => saveProfile(profile);
  const renderCoins = () => { $('coins').textContent = `Coins ${profile.coins}`; };

  // Unlocking needs a second click on the same card, so there are no browser pop-ups.
  let pending = '';
  const askUnlock = (key: string, label: string, price: number, grant: () => void, rerender: () => void): boolean => {
    if (profile.coins < price) { say(`${label} costs ${price} coins. You need ${price - profile.coins} more. Finish matches (win for a bonus) to earn coins.`); return false; }
    if (pending !== key) { pending = key; say(`Click ${label} again to unlock it for ${price} coins.`); window.setTimeout(() => { if (pending === key) pending = ''; }, 4000); return false; }
    pending = '';
    profile.coins -= price; grant(); save(); renderCoins(); rerender(); say(`${label} unlocked!`);
    return true;
  };

  // ---------- Play tab ----------
  const renderMaps = () => {
    const box = $('maps');
    box.innerHTML = '';
    for (const id of MAP_IDS) {
      const m = MAPS[id];
      const d = document.createElement('div');
      d.className = `mapcard${profile.map === id ? ' sel' : ''}`;
      d.innerHTML = `<div class="mapprev ${m.theme}"></div><div class="mi"><b>${esc(m.name)}</b><span>${esc(m.blurb)}</span></div>`;
      d.addEventListener('click', () => { profile.map = id; save(); hooks.onMap(id); renderMaps(); });
      box.appendChild(d);
    }
  };
  const TEAM_CHOICES: { id: TeamPref; label: string; sub: string; cls: string }[] = [
    { id: 'auto', label: 'Auto', sub: 'balanced', cls: '' },
    { id: 'CT', label: TEAM_INFO.CT.name, sub: TEAM_INFO.CT.role, cls: 'ct' },
    { id: 'T', label: TEAM_INFO.T.name, sub: TEAM_INFO.T.role, cls: 't' },
  ];
  const renderTeams = () => {
    const box = $('teams');
    box.innerHTML = '';
    for (const c of TEAM_CHOICES) {
      const d = document.createElement('div');
      d.className = `chip ${c.cls}${profile.team === c.id ? ' sel' : ''}`;
      d.innerHTML = `${esc(c.label)}<small>${esc(c.sub)}</small>`;
      d.addEventListener('click', () => { profile.team = c.id; save(); renderTeams(); });
      box.appendChild(d);
    }
  };

  // ---------- Loadout tab ----------
  const sidearms = WEAPONS.map((w, i) => ({ w, i })).filter((o) => o.w.slot === 'sidearm');
  const primaries = WEAPONS.map((w, i) => ({ w, i })).filter((o) => o.w.slot === 'primary');
  const renderSidearms = () => {
    const box = $('sidearms');
    box.innerHTML = '';
    for (const { w, i } of sidearms) {
      const owned = profile.unlocks.sidearms.includes(i);
      const d = document.createElement('div');
      d.className = `card${profile.sidearm === i ? ' sel' : ''}${owned ? '' : ' locked'}`;
      d.innerHTML = `<b>${esc(w.name)}</b><span>${w.dmg} dmg &middot; ${(1 / w.cooldown).toFixed(1)}/s</span>${owned ? '' : `<em>${SIDEARM_PRICES[i]} coins</em>`}`;
      d.addEventListener('click', () => {
        if (owned) { profile.sidearm = i; save(); renderSidearms(); return; }
        askUnlock(`sidearm${i}`, w.name, SIDEARM_PRICES[i], () => { profile.unlocks.sidearms.push(i); profile.sidearm = i; }, renderSidearms);
      });
      box.appendChild(d);
    }
  };
  const renderPrimaries = () => {
    const box = $('primaries');
    box.innerHTML = '';
    const none = document.createElement('div');
    none.className = `card${profile.autoBuy.primary === null ? ' sel' : ''}`;
    none.innerHTML = '<b>None</b><span>I will buy myself</span>';
    none.addEventListener('click', () => { profile.autoBuy.primary = null; save(); hooks.onPrimary(null); renderPrimaries(); });
    box.appendChild(none);
    for (const { w, i } of primaries) {
      const d = document.createElement('div');
      d.className = `card${profile.autoBuy.primary === i ? ' sel' : ''}`;
      d.innerHTML = `<b>${esc(w.name)}</b><span>${esc(w.cat)} &middot; $${w.cost}</span>`;
      d.addEventListener('click', () => { profile.autoBuy.primary = i; save(); hooks.onPrimary(i); renderPrimaries(); });
      box.appendChild(d);
    }
  };

  // ---------- Costume tab ----------
  let portraits = false; // true once the soldier portraits (client/public/models/thumbs) are known to exist
  const probe = new Image();
  probe.onload = () => { portraits = true; renderSkins(); };
  probe.src = '/models/thumbs/skin0.png';
  const renderSkins = () => {
    const box = $('skins');
    box.innerHTML = '';
    for (let i = 0; i < SKIN_COUNT; i++) {
      const owned = profile.unlocks.skins.includes(i);
      const d = document.createElement('div');
      d.className = `skin${profile.skin === i ? ' sel' : ''}${owned ? '' : ' locked'}`;
      d.style.backgroundImage = `url(${portraits ? `/models/thumbs/skin${i}.png` : `/models/kenney/thumb${i}.png`})`;
      if (portraits) d.classList.add('p');
      if (!owned) d.innerHTML = `<em>${SKIN_PRICES[i]} coins</em>`;
      d.addEventListener('click', () => {
        if (owned) { profile.skin = i; save(); hooks.onSkin(i); renderSkins(); return; }
        askUnlock(`skin${i}`, `Costume ${i + 1}`, SKIN_PRICES[i], () => { profile.unlocks.skins.push(i); profile.skin = i; hooks.onSkin(i); }, renderSkins);
      });
      box.appendChild(d);
    }
  };

  // ---------- Profile tab ----------
  let confirmClear = false;
  const renderProfile = () => {
    const t = profile.totals;
    $('pname').textContent = ($('name') as HTMLInputElement).value.trim() || profile.name || 'Player';
    const kd = t.deaths ? (t.kills / t.deaths).toFixed(2) : t.kills.toFixed(0);
    $('pstats').innerHTML = `<div><b>${profile.coins}</b>coins</div><div><b>${t.matches}</b>matches</div><div><b>${t.wins}</b>wins${t.matches ? ` (${Math.round((t.wins / t.matches) * 100)}%)` : ''}</div><div><b>${t.kills}/${t.deaths}</b>kills / deaths</div><div><b>${kd}</b>K/D</div>`;
    const earned = TITLE_RANK.filter((n) => (profile.titles[n] ?? 0) > 0);
    $('ptitles').innerHTML = earned.length
      ? `<div class="best">Top title: <b>${esc(earned[0])}</b></div>` + earned.map((n) => `<span class="ttl">${esc(n)} <i>&times;${profile.titles[n]}</i></span>`).join('')
      : 'No titles yet. Get two kills in quick succession, take the first kill of a round, or be the top fragger of a match.';
    const pack = profile.pack;
    $('ppack').textContent = pack ? [...pack.weapons.map((i) => WEAPONS[i]?.name).filter(Boolean), ...(pack.armor ? ['Armor'] : [])].join(' + ') || 'Sidearm only' : 'None yet. It is saved when a buy phase ends, and you can rebuy it with B.';
    $('phist').innerHTML = profile.history.length
      ? '<table><tr><th>When</th><th>Result</th><th>Score</th><th>K/D</th><th>Coins</th><th>Side</th><th>Mode</th></tr>' + profile.history.map((m) =>
        `<tr><td>${esc(new Date(m.t).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }))}</td><td class="${m.won ? 'w' : 'l'}">${m.won ? 'WIN' : 'LOSS'}</td><td>${m.team === 'CT' ? m.ctWins : m.tWins}-${m.team === 'CT' ? m.tWins : m.ctWins}</td><td>${m.kills}/${m.deaths}</td><td>${m.coins ?? '-'}</td><td>${esc(TEAM_INFO[m.team]?.name ?? m.team)}</td><td>${m.mode === 'multi' ? esc(m.room) : 'solo'}</td></tr>`).join('') + '</table>'
      : 'No fights saved yet. Finish a match (first to 6 rounds) and it shows up here.';
    $('pclear').textContent = confirmClear ? 'Click again to confirm' : 'Clear history';
  };

  // ---------- Controls tab: rebind the keyboard shortcuts ----------
  let capturing: { act: string; slot: number } | null = null;
  const renderHint = () => { const h = document.getElementById('hint'); if (h) h.textContent = hintText(); };
  const renderControls = () => {
    const box = $('controls');
    box.innerHTML = '';
    let group = '';
    for (const a of ACTIONS) {
      if (a.group !== group) { group = a.group; const h = document.createElement('h4'); h.textContent = group; box.appendChild(h); }
      const row = document.createElement('div');
      row.className = 'krow';
      row.innerHTML = `<span>${esc(a.label)}</span>`;
      for (let slot = 0; slot < 2; slot++) {
        const code = binds()[a.id][slot];
        const b = document.createElement('button');
        const waiting = capturing?.act === a.id && capturing.slot === slot;
        b.className = `kb${waiting ? ' wait' : ''}${code ? '' : ' empty'}`;
        b.textContent = waiting ? 'press a key...' : code ? keyLabel(code) : 'none';
        b.dataset.act = a.id; b.dataset.slot = String(slot);
        b.addEventListener('click', () => { capturing = { act: a.id, slot }; renderControls(); });
        row.appendChild(b);
      }
      box.appendChild(row);
    }
    renderHint();
  };
  const saveBinds = (next: Record<string, string[]>) => {
    profile.keybinds = next;
    applyBinds(next);
    saveProfile(profile);
  };
  // captured before the game's own key handler, so the key you press to rebind never also triggers an action
  window.addEventListener('keydown', (e) => {
    if (!capturing) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const { act, slot } = capturing;
    capturing = null;
    if (e.code === 'Escape') { renderControls(); return; }
    const next = resolveBinds(profile.keybinds);
    if (e.code === 'Backspace' || e.code === 'Delete') {
      next[act][slot] = '';
    } else {
      for (const a of ACTIONS) next[a.id] = next[a.id].map((c) => (c === e.code ? '' : c)); // a key can only do one thing: move it here
      next[act][slot] = e.code;
    }
    for (const a of ACTIONS) { next[a.id] = [next[a.id][0] ?? '', next[a.id][1] ?? '']; }
    saveBinds(next);
    renderControls();
    say(e.code === 'Backspace' || e.code === 'Delete' ? 'Key cleared.' : `${keyLabel(e.code)} is now set.`);
  }, true);
  const optReplay = $('optreplay') as HTMLInputElement;
  optReplay.checked = profile.options.replay;
  optReplay.addEventListener('change', () => { profile.options.replay = optReplay.checked; saveProfile(profile); });
  const optView = $('optview') as HTMLSelectElement;
  optView.value = profile.options.view;
  optView.addEventListener('change', () => { profile.options.view = optView.value as 'top' | 'fps'; saveProfile(profile); });
  const optVoice = $('optvoice') as HTMLSelectElement;
  optVoice.value = profile.options.voice;
  optVoice.addEventListener('change', () => { profile.options.voice = optVoice.value as 'off' | 'ptt' | 'open'; saveProfile(profile); });
  $('resetkeys').addEventListener('click', () => { saveBinds({}); renderControls(); say('Keys reset to the defaults.'); });

  // ---------- tabs and buttons ----------
  const showTab = (name: string) => {
    document.querySelectorAll<HTMLElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll<HTMLElement>('.pane').forEach((p) => p.classList.toggle('on', p.id === `tab-${name}`));
    if (name === 'profile') renderProfile();
  };
  document.querySelectorAll<HTMLElement>('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab!)));
  $('pclear').addEventListener('click', () => {
    if (!confirmClear) { confirmClear = true; renderProfile(); window.setTimeout(() => { confirmClear = false; renderProfile(); }, 3500); return; }
    confirmClear = false; clearHistory(profile); renderProfile(); renderCoins();
  });
  $('single').addEventListener('click', () => hooks.onPlay('single'));
  $('multi').addEventListener('click', () => hooks.onPlay('multi'));
  const armor = $('autoarmor') as HTMLInputElement;
  armor.checked = profile.autoBuy.armor;
  armor.addEventListener('change', () => { profile.autoBuy.armor = armor.checked; save(); });
  ($('name') as HTMLInputElement).value = profile.name;

  renderCoins(); renderMaps(); renderTeams(); renderSidearms(); renderPrimaries(); renderSkins(); renderControls();
}
