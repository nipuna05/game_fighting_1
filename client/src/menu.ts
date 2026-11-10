// Landing-page menu: Play / Loadout / Costume / Profile tabs.
import { WEAPONS, TEAM_INFO, MAPS, MAP_IDS, SKIN_BASE, KIT_NAMES, TITLE_RANK, GAME_MODES, WEAPON_SETS, DIFFICULTIES, isFreeLoadout, SIGHT_NAMES, TINT_NAMES, SIGHT_GUNS, GRIP_GUNS, TINT_GUNS, defaultCustom, cleanCustom, customMods, type GameMode, type WeaponSet } from '@fight/shared';
import { ACTIONS, binds, applyBinds, keyLabel, hintText, resolveBinds } from './keybinds';
import { saveProfile, clearHistory, makeChallenges, ensureChallenges, claimChallenge, challengesReady, SKIN_PRICES, KIT_PRICES, SIDEARM_PRICES, TINT_PRICES, type Profile, type TeamPref } from './profile';

import { music } from './music';
import { asset, isStaticHost, getServerUrl, setServerUrl, validServerUrl } from './assets';
import { mapThumb } from './mapthumb';
import { weaponPic } from './weaponpic';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export interface MenuHooks {
  onPlay(mode: 'single' | 'multi'): void;
  onMap(id: string): void;
  onSkin(i: number): void;
  onPrimary(weapon: number | null): void;
  onCustom(): void;
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
  // ---------- rank: a simple level from how much you have played ----------
  const RANKS = ['Recruit', 'Bronze I', 'Bronze II', 'Bronze III', 'Silver I', 'Silver II', 'Silver III', 'Gold I', 'Gold II', 'Gold III', 'Platinum', 'Diamond', 'Elite'];
  const RANK_XP = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4200, 5500, 7500];
  const xpOf = () => profile.totals.matches * 20 + profile.totals.wins * 100 + profile.totals.kills * 10;
  const rankOf = () => {
    const xp = xpOf(); let i = 0; while (i + 1 < RANK_XP.length && xp >= RANK_XP[i + 1]) i++;
    const next = RANK_XP[i + 1], pct = next === undefined ? 100 : Math.round(((xp - RANK_XP[i]) / (next - RANK_XP[i])) * 100);
    return { name: RANKS[i], xp, next, pct };
  };
  const renderChip = () => {
    const r = rankOf();
    $('chip').innerHTML = `<div class="av">${esc((profile.name || 'P').slice(0, 1).toUpperCase())}</div><div style="flex:1"><b>${esc(profile.name || 'Player')}</b><small>${esc(r.name)}</small><div class="xp"><i style="width:${r.pct}%"></i></div></div>`;
  };
  const renderCoins = () => { $('coins').textContent = `Coins ${profile.coins}`; renderChip(); };

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
      d.title = m.blurb;
      d.innerHTML = `<div class="mapprev ${m.theme}" style="background-image:url(${asset(`/maps/${id}.jpg`)}),url(${mapThumb(m)})"></div><div class="mi"><b>${esc(m.name)}</b><span>${esc(m.blurb)}</span></div>`;
      d.addEventListener('click', () => { profile.map = id; save(); hooks.onMap(id); renderMaps(); });
      box.appendChild(d);
    }
  };
  const TEAM_CHOICES: { id: TeamPref; label: string; sub: string; cls: string }[] = [
    { id: 'auto', label: 'Auto', sub: 'balanced', cls: '' },
    { id: 'CT', label: TEAM_INFO.CT.name, sub: TEAM_INFO.CT.role, cls: 'ct' },
    { id: 'T', label: TEAM_INFO.T.name, sub: TEAM_INFO.T.role, cls: 't' },
  ];
  const renderRules = () => {
    const st = $('style') as HTMLSelectElement, ws = $('wset') as HTMLSelectElement, pk = $('wpick') as HTMLSelectElement;
    if (!st.options.length) {
      st.innerHTML = GAME_MODES.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
      ws.innerHTML = WEAPON_SETS.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
      st.addEventListener('change', () => { profile.style = st.value as GameMode; if (profile.style !== 'bomb' && profile.weaponSet === 'all') profile.weaponSet = 'random'; save(); renderRules(); });
      ws.addEventListener('change', () => { profile.weaponSet = ws.value as WeaponSet; save(); renderRules(); });
      pk.addEventListener('change', () => { profile.pick = pk.value as 'manual' | 'auto'; save(); renderRules(); });
    }
    st.value = profile.style; ws.value = profile.weaponSet; pk.value = profile.pick;
    const df = $('diff') as HTMLSelectElement;
    df.innerHTML = DIFFICULTIES.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    df.value = profile.difficulty;
    const diffNote = () => { $('diffnote').textContent = (DIFFICULTIES.find((d) => d.id === profile.difficulty)?.blurb ?? '') + ' (single player; the multiplayer server uses Normal bots)'; };
    diffNote();
    df.addEventListener('change', () => { profile.difficulty = df.value as typeof profile.difficulty; save(); diffNote(); });
    const free = isFreeLoadout(profile.style, profile.weaponSet);
    // "All guns" means buying with cash, which only exists in the bomb mission
    Array.from(ws.options).forEach((o) => { o.disabled = profile.style !== 'bomb' && o.value === 'all'; });
    $('wpickrow').style.display = free ? 'flex' : 'none';
    $('stylenote').textContent = GAME_MODES.find((m) => m.id === profile.style)?.blurb ?? '';
    $('wsetnote').textContent = !free ? 'You start with $1600 and buy guns in the buy phase.'
      : profile.pick === 'auto' ? 'Everyone gets a random weapon from this set each time they spawn. Nothing to buy.'
      : 'Everyone gets a free weapon from this set. Pick yours in the weapon panel (before the game and while waiting to respawn).';
  };
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
  // a picture of each gun: the real-model render when it exists on this PC, otherwise the built-in one (the second layer shows if the first file is missing)
  const wpic = (id: string) => weaponPic(id);
  const renderSidearms = () => {
    const box = $('sidearms');
    box.innerHTML = '';
    for (const { w, i } of sidearms) {
      const owned = profile.unlocks.sidearms.includes(i);
      const d = document.createElement('div');
      d.className = `card${profile.sidearm === i ? ' sel' : ''}${owned ? '' : ' locked'}`;
      d.innerHTML = `${wpic(w.id)}<b>${esc(w.name)}</b><span>${w.dmg} dmg &middot; ${(1 / w.cooldown).toFixed(1)}/s</span>${owned ? '' : `<em>${SIDEARM_PRICES[i]} coins</em>`}`;
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
    none.innerHTML = '<div class="wpic none">&#8855;</div><b>None</b><span>I buy myself</span>';
    none.addEventListener('click', () => { profile.autoBuy.primary = null; save(); hooks.onPrimary(null); renderPrimaries(); });
    box.appendChild(none);
    for (const { w, i } of primaries) {
      const d = document.createElement('div');
      d.className = `card${profile.autoBuy.primary === i ? ' sel' : ''}`;
      d.title = `${w.name}: ${w.cat}, $${w.cost}, ${w.dmg} dmg, ${(1 / w.cooldown).toFixed(1)}/s, ${w.mag} rounds`;
      d.innerHTML = `${wpic(w.id)}<b>${esc(w.name)}</b><span>${esc(w.cat)}</span>`;
      d.addEventListener('click', () => { profile.autoBuy.primary = i; save(); hooks.onPrimary(i); renderPrimaries(); });
      box.appendChild(d);
    }
  };

  // ---------- weapon customization (Loadout tab): sight, foregrip, finish ----------
  let custSel = TINT_GUNS[3];
  const TINT_CSS = ['#9aa3ad', '#3a3d42', '#cdb27a', '#7d8c55', '#dfe8f0', '#e6bf3a'];
  const renderCustom = () => {
    const pick = $('custwep'), opts = $('custopts');
    pick.innerHTML = '';
    for (const id of TINT_GUNS) {
      const i = WEAPONS.findIndex((w) => w.id === id);
      const b = document.createElement('button');
      b.className = `cbtn${custSel === id ? ' on' : ''}`; b.innerHTML = `${weaponPic(id, 'wpic sm')}${esc(WEAPONS[i].name)}`;
      b.addEventListener('click', () => { custSel = id; hooks.onPrimary(i); renderCustom(); });
      pick.appendChild(b);
    }
    const wi = WEAPONS.findIndex((w) => w.id === custSel);
    const code = cleanCustom(custSel, profile.custom[custSel] ?? defaultCustom(wi));
    const set = (next: number) => { profile.custom[custSel] = cleanCustom(custSel, next); save(); hooks.onCustom(); renderCustom(); };
    const sight = code & 3, grip = (code >> 2) & 1, tint = code >> 3;
    const m = customMods(code);
    let html = '';
    if (SIGHT_GUNS.includes(custSel)) html += `<h4>Sight</h4><div class="crow">${SIGHT_NAMES.map((n, k) => `<button class="cbtn${sight === k ? ' on' : ''}" data-sight="${k}">${esc(n)}</button>`).join('')}</div>`;
    if (GRIP_GUNS.includes(custSel)) html += `<h4>Foregrip</h4><div class="crow"><button class="cbtn${grip ? '' : ' on'}" data-grip="0">None</button><button class="cbtn${grip ? ' on' : ''}" data-grip="1">Tactical foregrip</button></div>`;
    html += `<h4>Finish</h4><div class="crow">${TINT_NAMES.map((n, k) => `<button class="cbtn${tint === k ? ' on' : ''}${profile.unlocks.tints.includes(k) ? '' : ' locked'}" data-tint="${k}"><i class="sw" style="background:${TINT_CSS[k]}"></i>${esc(n)}${profile.unlocks.tints.includes(k) ? '' : ' &#128274;'}</button>`).join('')}</div>`;
    html += `<p class="note">Spread ${m.spread < 1 ? Math.round((1 - m.spread) * 100) + '% tighter' : 'normal'} &middot; move speed ${m.speed < 1 ? Math.round((1 - m.speed) * 100) + '% slower' : 'normal'} &middot; reload ${m.reload > 1 ? Math.round((m.reload - 1) * 100) + '% slower' : 'normal'}. Better sights tighten your aim but slow you down; a foregrip steadies the gun but slows the reload.</p>`;
    opts.innerHTML = html;
    opts.querySelectorAll<HTMLElement>('[data-sight]').forEach((el) => el.addEventListener('click', () => set((code & ~3) | Number(el.dataset.sight))));
    opts.querySelectorAll<HTMLElement>('[data-grip]').forEach((el) => el.addEventListener('click', () => set((code & ~4) | (Number(el.dataset.grip) << 2))));
    opts.querySelectorAll<HTMLElement>('[data-tint]').forEach((el) => el.addEventListener('click', () => {
      const k = Number(el.dataset.tint);
      if (!profile.unlocks.tints.includes(k)) { say(`${TINT_NAMES[k]} finish is locked: unlock it in the Shop (${TINT_PRICES[k]} coins) or win it in the daily rewards.`); return; }
      set((code & 7) | (k << 3));
    }));
  };

  // ---------- Costume tab ----------
  let portraits = false; // true once the soldier portraits (client/public/models/thumbs) are known to exist
  const probe = new Image();
  probe.onload = () => { portraits = true; renderSkins(); };
  probe.src = asset('/models/thumbs/skin0.png');
  const renderSkins = () => {
    const box = $('skins');
    box.innerHTML = '';
    for (let i = 0; i < SKIN_BASE; i++) {
      const owned = profile.unlocks.skins.includes(i);
      const d = document.createElement('div');
      d.className = `skin${profile.skin === i ? ' sel' : ''}${owned ? '' : ' locked'}`;
      d.style.backgroundImage = `url(${portraits ? asset(`/models/thumbs/skin${i}.png`) : asset(`/models/kenney/thumb${i}.png`)})`;
      if (portraits) d.classList.add('p');
      if (!owned) d.innerHTML = `<em>${SKIN_PRICES[i]} coins</em>`;
      d.addEventListener('click', () => {
        if (owned) { profile.skin = i; save(); hooks.onSkin(i + SKIN_BASE * profile.kit); renderSkins(); return; }
        askUnlock(`skin${i}`, `Costume ${i + 1}`, SKIN_PRICES[i], () => { profile.unlocks.skins.push(i); profile.skin = i; hooks.onSkin(i + SKIN_BASE * profile.kit); }, renderSkins);
      });
      box.appendChild(d);
    }
  };

  // dress kits: colour outfits over the chosen costume
  const KIT_CSS = ['#8d98a6', '#7e9a52', '#d9b46e', '#dbe6f2', '#5c6572', '#c8483a', '#e6b72a'];
  const renderKits = () => {
    const box = $('kits');
    box.innerHTML = KIT_NAMES.map((n, k) => { const own = profile.unlocks.kits.includes(k); return `<button class="cbtn${profile.kit === k ? ' on' : ''}${own ? '' : ' locked'}" data-kit="${k}"><i class="sw" style="background:${KIT_CSS[k]}"></i>${esc(n)}${own ? '' : ' &#128274; ' + KIT_PRICES[k]}</button>`; }).join('');
    box.querySelectorAll<HTMLElement>('[data-kit]').forEach((b) => b.addEventListener('click', () => {
      const k = Number(b.dataset.kit);
      const pick = () => { profile.kit = k; save(); hooks.onSkin(profile.skin + SKIN_BASE * k); renderKits(); };
      if (profile.unlocks.kits.includes(k)) pick();
      else askUnlock(`kit${k}`, `${KIT_NAMES[k]} dress kit`, KIT_PRICES[k], () => { profile.unlocks.kits.push(k); profile.kit = k; hooks.onSkin(profile.skin + SKIN_BASE * k); }, () => { renderKits(); renderShop(); });
    }));
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
    // lifetime stats (from the totals, plus the per-mission results of the recent fights)
    const acc = t.shots ? `${Math.round((t.hits / t.shots) * 100)}%` : '-';
    const top = Object.entries(t.byWeapon).sort((a, b) => b[1] - a[1]).slice(0, 6), topMax = top.length ? top[0][1] : 1;
    const byMode = new Map<string, { w: number; l: number }>();
    for (const m of profile.history) { const k = GAME_MODES.find((g) => g.id === m.style)?.name ?? 'Older games'; const e = byMode.get(k) ?? { w: 0, l: 0 }; if (m.won) e.w++; else e.l++; byMode.set(k, e); }
    $('pstat2').innerHTML = t.matches
      ? `<div class="sg"><div class="sc"><b>${acc}</b><small>Accuracy</small></div><div class="sc"><b>${t.statGames ? Math.round(t.dmg / t.statGames) : '-'}</b><small>Damage / game</small></div><div class="sc"><b>${t.bestKills}</b><small>Best game (score)</small></div><div class="sc"><b>${t.bestStreak || '-'}</b><small>Best streak</small></div></div>`
        + `<h4>Favourite weapons (kills)</h4>${top.length ? top.map(([id, n]) => `<div class="wb"><span style="text-align:left;font-weight:400">${esc(WEAPONS.find((w) => w.id === id)?.name ?? id)}</span><i style="width:${Math.max(6, Math.round((n / topMax) * 100))}%"></i><span>${n}</span></div>`).join('') : '<p class="note">Kills with each weapon are counted from now on.</p>'}`
        + `<h4>Results by mission (recent fights)</h4><div class="mw">${[...byMode].map(([k, e]) => `<div>${esc(k)}: <b>${e.w}</b> won, <b>${e.l}</b> lost</div>`).join('')}</div>`
        + `<p class="note">${t.shots} shots fired, ${t.hits} hit, over ${t.statGames} games (${t.matches} played in all). Stats are saved in this browser.</p>`
      : 'Play a game to start your stats: accuracy, favourite weapons, your best game and your results per mission.';
  };

  // ---------- sub-tabs: split a long pane into short pages so nothing needs scrolling ----------
  // Blocks carry data-s="page ids"; the buttons show one page at a time (class .sh hides the rest).
  const subs: Record<string, { apply(): void; set(id: string): void }> = {};
  const subTabs = (paneId: string, pages: [string, string][], after?: string) => {
    const pane = $(paneId);
    const bar = document.createElement('div'); bar.className = 'subbar';
    let cur = pages[0][0];
    const set = (id: string) => {
      cur = id;
      bar.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.sub === id));
      pane.querySelectorAll<HTMLElement>('[data-s]').forEach((el) => el.classList.toggle('sh', !el.dataset.s!.split(' ').includes(id)));
    };
    for (const [id, label] of pages) { const b = document.createElement('button'); b.dataset.sub = id; b.textContent = label; b.addEventListener('click', () => set(id)); bar.appendChild(b); }
    const anchor = after ? pane.querySelector(after) : null;
    if (anchor) anchor.after(bar); else pane.insertBefore(bar, pane.firstChild);
    set(cur);
    return (subs[paneId] = { apply: () => set(cur), set });
  };

  // ---------- Controls tab: rebind the keyboard shortcuts ----------
  let capturing: { act: string; slot: number } | null = null;
  const renderHint = () => { const h = document.getElementById('hint'); if (h) h.textContent = hintText(); };
  const renderControls = () => {
    const box = $('controls');
    box.innerHTML = '';
    let group = '';
    for (const a of ACTIONS) {
      const page = a.group === 'Movement' ? 'move' : a.group === 'Round' || a.group === 'Weapons' ? 'weapons' : a.group === 'Items' ? 'items' : 'other';
      if (a.group !== group) { group = a.group; const h = document.createElement('h4'); h.textContent = group; h.dataset.s = page; box.appendChild(h); }
      const row = document.createElement('div');
      row.className = 'krow'; row.dataset.s = page;
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
    subs['tab-controls']?.apply();
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
  const optMusic = $('optmusic') as HTMLInputElement;
  optMusic.value = String(profile.options.music);
  $('optmusicv').textContent = `${profile.options.music}%`;
  optMusic.addEventListener('input', () => {
    profile.options.music = Number(optMusic.value); $('optmusicv').textContent = `${optMusic.value}%`;
    saveProfile(profile); music.setVolume(profile.options.music / 100);
  });
  const optView = $('optview') as HTMLSelectElement;
  optView.value = profile.options.view;
  optView.addEventListener('change', () => { profile.options.view = optView.value as 'top' | 'fps'; profile.options.viewSet = true; saveProfile(profile); });
  const optVoice = $('optvoice') as HTMLSelectElement;
  optVoice.value = profile.options.voice;
  optVoice.addEventListener('change', () => { profile.options.voice = optVoice.value as 'off' | 'ptt' | 'open'; saveProfile(profile); });
  $('resetkeys').addEventListener('click', () => { saveBinds({}); renderControls(); say('Keys reset to the defaults.'); });

  // ---------- credits (data lives in client/public/credits.json so it can be edited without touching code) ----------
  let creditsDone = false;
  const renderCredits = async () => {
    if (creditsDone) return;
    const box = $('creditslist');
    try {
      const data = await (await fetch(asset('/credits.json'))).json() as { entries: { what: string; by: string; licence: string; link?: string }[] };
      box.innerHTML = data.entries.map((e) => `<div class="cr"><b>${esc(e.what)}</b><span>by ${esc(e.by)} &middot; ${esc(e.licence)}${e.link && /^https:\/\//.test(e.link) ? ` &middot; <a href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">${esc(e.link.replace('https://', ''))}</a>` : ''}</span></div>`).join('');
      creditsDone = true;
    } catch { box.textContent = 'Credits could not be loaded.'; }
  };

  // ---------- daily rewards: one per day you log in, 28 in a cycle ----------
  type Reward = { kind: 'coins' | 'skin' | 'sidearm' | 'tint'; v: number };
  const C = (v: number): Reward => ({ kind: 'coins', v });
  const REWARDS: Reward[] = [
    C(100), C(150), { kind: 'sidearm', v: 1 }, C(150), C(200), { kind: 'tint', v: 4 }, C(300),
    C(150), C(200), { kind: 'skin', v: 2 }, C(200), C(250), C(300), { kind: 'sidearm', v: 2 },
    C(250), C(300), { kind: 'tint', v: 5 }, C(300), C(350), { kind: 'skin', v: 3 }, C(400),
    C(300), C(350), C(400), C(450), C(500), C(500), C(1000),
  ];
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const canClaim = () => profile.daily.last !== today();
  const rewardInfo = (r: Reward) => {
    if (r.kind === 'coins') return { icon: '<i class="coin"></i>', label: `${r.v} coins` };
    if (r.kind === 'skin') return { icon: '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.6 9.4a4.4 4.4 0 0 1 8.8 0z"/><path d="M6.6 9.4h10.8"/><path d="M9.6 12.2c.7 1 1.5 1.5 2.4 1.5s1.7-.5 2.4-1.5"/><path d="M4.4 21c.7-4.3 3.7-6.7 7.6-6.7s6.9 2.4 7.6 6.7"/></svg></span>', label: `Costume ${r.v + 1}` };
    if (r.kind === 'sidearm') return { icon: '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.8 7.2h15.6l2.1 1.6v2.5H11.8l-.7 3.2c-.2.8-.9 1.4-1.7 1.4H7.6c-1 0-1.7-.9-1.5-1.8l.9-2.8H2.8z"/><path d="M12.2 11.3v2.1M5.2 7.2V5.9h2.2v1.3"/></svg></span>', label: WEAPONS[r.v].name };
    return { icon: '<span class="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7.5" y="9.5" width="8" height="11.5" rx="1.6"/><path d="M9.5 9.5V7h4v2.5M10.5 4.6h2"/><path d="M7.5 14.5h8"/><path d="M18 5.6h.01M20.2 7.6h.01M18.4 8.6h.01M20 4.2h.01"/></svg></span>', label: `${TINT_NAMES[r.v]} finish` };
  };
  const grant = (r: Reward) => {
    if (r.kind === 'coins') profile.coins += r.v;
    else if (r.kind === 'skin' && !profile.unlocks.skins.includes(r.v)) profile.unlocks.skins.push(r.v);
    else if (r.kind === 'sidearm' && !profile.unlocks.sidearms.includes(r.v)) profile.unlocks.sidearms.push(r.v);
    else if (r.kind === 'tint' && !profile.unlocks.tints.includes(r.v)) profile.unlocks.tints.push(r.v);
  };
  const claimDaily = () => {
    if (!canClaim()) return;
    if (profile.daily.claimed >= 28) profile.daily.claimed = 0;                 // a new cycle begins
    const r = REWARDS[profile.daily.claimed];
    grant(r); profile.daily.claimed++; profile.daily.last = today(); save();
    renderCoins(); renderRewards(); renderShop(); renderSidearms(); renderSkins(); renderKits(); renderCustom(); renderPlayExtra();
    say(`Day ${profile.daily.claimed} reward claimed: ${rewardInfo(r).label}!`);
  };
  const untilTomorrow = () => { const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); const ms = t.getTime() - n.getTime(); return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`; };
  const renderRewards = () => {
    const done = profile.daily.claimed, claimable = canClaim();
    const nextIdx = done >= 28 ? 0 : done;
    $('days').innerHTML = REWARDS.map((r, i) => {
      const info = rewardInfo(r), isDone = i < done && !(done >= 28 && claimable), isNext = claimable ? i === nextIdx : false;
      return `<div data-s="${i < 14 ? 'w1' : 'w2'}" class="day${isDone ? ' done' : ''}${isNext ? ' next' : ''}${i === 27 ? ' big' : ''}"><small>DAY ${i + 1}</small>${info.icon}<b>${esc(info.label)}</b></div>`;
    }).join('');
    subs['tab-rewards']?.apply();
    const shown = done >= 28 && claimable ? 0 : done;
    $('dayprog').textContent = `DAY ${Math.min(28, shown + (claimable ? 1 : 0))} / 28`;
    ($('dayfill') as HTMLElement).style.width = `${Math.round((shown / 28) * 100)}%`;
    const btn = $('claimbtn') as HTMLButtonElement;
    btn.disabled = !claimable;
    btn.textContent = claimable ? `Claim day ${nextIdx + 1}: ${rewardInfo(REWARDS[nextIdx]).label}` : 'Claimed today';
    $('claimnote').textContent = claimable ? 'Your reward for today is ready.' : `Next reward in ${untilTomorrow()}`;
    $('rdot').classList.toggle('on', claimable || challengesReady(profile));
    renderChallenges();
  };
  const renderChallenges = () => {
    const ch = ensureChallenges(profile), defs = makeChallenges(ch.date);
    const n = new Date(), ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime() - n.getTime();
    $('chlist').innerHTML = `<p class="note" style="margin:0 0 8px">Three new challenges every day, counted from the games you finish (not the practice range). New ones in ${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m.</p>`
      + defs.map((d, i) => {
        const prog = ch.progress[i], full = prog >= d.target, claimed = ch.claimed[i];
        return `<div class="chc${claimed ? ' done' : ''}" data-s="ch"><b>${esc(d.text)}</b><div class="chb"><i style="width:${Math.round((prog / d.target) * 100)}%"></i></div>`
          + `<small>${Math.min(prog, d.target)} / ${d.target} &middot; reward ${d.reward} coins</small>`
          + (claimed ? '<button class="btn ghost" disabled>Claimed</button>' : full ? `<button class="btn go" data-chclaim="${i}">Claim ${d.reward}</button>` : '<button class="btn ghost" disabled>In progress</button>') + '</div>';
      }).join('');
    $('chlist').querySelectorAll<HTMLElement>('[data-chclaim]').forEach((b) => b.addEventListener('click', () => {
      const got = claimChallenge(profile, Number(b.dataset.chclaim));
      if (got) { renderCoins(); renderRewards(); say(`Challenge complete: +${got} coins!`); }
    }));
    subs['tab-rewards']?.apply();
  };
  $('claimbtn').addEventListener('click', claimDaily);
  window.setInterval(() => { if ($('tab-rewards').classList.contains('on') || true) renderRewards(); }, 30000);

  // ---------- shop: everything that can be unlocked with coins ----------
  const renderShop = () => {
    const box = $('shopbox');
    const sec = (key: string, title: string, items: { key: string; name: string; sub: string; owned: boolean; price: number; buy: () => void }[]) =>
      `<div class="shopsec" data-s="${key}"><h4>${title}</h4><div class="shopgrid">${items.map((it) => `<div class="shopitem${it.owned ? ' own' : ''}"><b>${esc(it.name)}</b><span>${esc(it.sub)}</span>${it.owned ? '<span class="tag2">OWNED</span>' : `<button class="btn ghost" data-buy="${it.key}">Unlock &middot; ${it.price} coins</button>`}</div>`).join('')}</div></div>`;
    const list: Record<string, { name: string; price: number; buy: () => void }> = {};
    const skins = [2, 3].map((i) => { list[`skin${i}`] = { name: `Costume ${i + 1}`, price: SKIN_PRICES[i], buy: () => { profile.unlocks.skins.push(i); } }; return { key: `skin${i}`, name: `Costume ${i + 1}`, sub: 'A new soldier look', owned: profile.unlocks.skins.includes(i), price: SKIN_PRICES[i], buy: () => undefined }; });
    const sides = [1, 2].map((i) => { list[`sidearm${i}`] = { name: WEAPONS[i].name, price: SIDEARM_PRICES[i], buy: () => { profile.unlocks.sidearms.push(i); } }; return { key: `sidearm${i}`, name: WEAPONS[i].name, sub: 'Sidearm', owned: profile.unlocks.sidearms.includes(i), price: SIDEARM_PRICES[i], buy: () => undefined }; });
    const tints = [4, 5].map((i) => { list[`tint${i}`] = { name: `${TINT_NAMES[i]} finish`, price: TINT_PRICES[i], buy: () => { profile.unlocks.tints.push(i); } }; return { key: `tint${i}`, name: `${TINT_NAMES[i]} weapon finish`, sub: 'Paint any gun', owned: profile.unlocks.tints.includes(i), price: TINT_PRICES[i], buy: () => undefined }; });
    const kits = [2, 3, 4, 5, 6].map((i) => { list[`kit${i}`] = { name: `${KIT_NAMES[i]} dress kit`, price: KIT_PRICES[i], buy: () => { profile.unlocks.kits.push(i); } }; return { key: `kit${i}`, name: `${KIT_NAMES[i]} dress kit`, sub: 'A new colour outfit for any costume', owned: profile.unlocks.kits.includes(i), price: KIT_PRICES[i], buy: () => undefined }; });
    box.innerHTML = sec('costumes', 'Costumes', skins) + sec('kits', 'Dress kits', kits) + sec('sidearms', 'Sidearms', sides) + sec('finishes', 'Weapon finishes', tints);
    subs['tab-shop']?.apply();
    box.querySelectorAll<HTMLElement>('[data-buy]').forEach((b) => b.addEventListener('click', () => {
      const it = list[b.dataset.buy!];
      askUnlock(b.dataset.buy!, it.name, it.price, () => it.buy(), () => { renderShop(); renderSidearms(); renderSkins(); renderKits(); renderCustom(); });
    }));
  };

  // ---------- Play page extras: rank progress and today's reward ----------
  const renderPlayExtra = () => {
    const r = rankOf();
    $('playextra').innerHTML = `<div class="rankbox">RANK <b>${esc(r.name)}</b> &middot; ${r.xp} XP${r.next !== undefined ? ` &middot; ${r.next - r.xp} XP to the next rank` : ' &middot; top rank!'}<div class="bar"><i style="width:${r.pct}%"></i></div></div>`
      + (canClaim() ? `<div class="minireward"><span><svg viewBox=\"0 0 24 24\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"vertical-align:-3px;color:#ffd27a\"><rect x=\"4\" y=\"10.2\" width=\"16\" height=\"10\" rx=\"1.6\"/><path d=\"M3 7h18v3.2H3zM12 7v13.2\"/><path d=\"M12 7C9.6 2.8 5.6 4.2 7 7M12 7c2.4-4.2 6.4-2.8 5 0\"/></svg> Your daily reward is ready: <b>${esc(rewardInfo(REWARDS[profile.daily.claimed >= 28 ? 0 : profile.daily.claimed]).label)}</b></span><button class="btn go" id="minclaim">Claim</button></div>` : '');
    const mc = document.getElementById('minclaim'); if (mc) mc.addEventListener('click', () => { claimDaily(); });
  };

  const renderLast = () => {
    const m = MAPS[profile.map]?.name ?? '', st = GAME_MODES.find((g) => g.id === profile.style)?.name ?? '', ws = WEAPON_SETS.find((w) => w.id === profile.weaponSet)?.name ?? '';
    $('lastplay').textContent = `Last setup: ${m} · ${st} · ${ws.replace(/ \(.*\)/, '')}`;
  };

  // ---------- tabs and buttons ----------
  let eqSub: 'loadout' | 'custom' | 'costume' = 'loadout';
  const showTab = (name: string) => {
    document.querySelectorAll<HTMLElement>('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === (name === 'setup' ? 'play' : name)));
    const pane = name === 'loadout' ? `tab-${eqSub}` : `tab-${name}`;                      // Equipment has sub-tabs: Weapons, Customize, Outfit
    document.querySelectorAll<HTMLElement>('.pane').forEach((p) => p.classList.toggle('on', p.id === pane));
    $('subtabs').classList.toggle('on', name === 'loadout');
    document.querySelectorAll<HTMLElement>('#subtabs button').forEach((b) => b.classList.toggle('on', b.dataset.sub === eqSub));
    $('panel').classList.toggle('wide', name !== 'play');
    if (name === 'rewards') renderRewards();
    if (name === 'shop') renderShop();
    if (name === 'play') { renderPlayExtra(); renderLast(); }
    if (name === 'profile') renderProfile();
    if (name === 'credits') void renderCredits();
  };
  document.querySelectorAll<HTMLElement>('#tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab!)));
  document.querySelectorAll<HTMLElement>('#subtabs button').forEach((b) => b.addEventListener('click', () => { eqSub = b.dataset.sub as typeof eqSub; showTab('loadout'); }));
  $('pclear').addEventListener('click', () => {
    if (!confirmClear) { confirmClear = true; renderProfile(); window.setTimeout(() => { confirmClear = false; renderProfile(); }, 3500); return; }
    confirmClear = false; clearHistory(profile); renderProfile(); renderCoins();
  });
  // the home screen only picks single player or multiplayer; the details are on the next screen
  let setupMode: 'single' | 'multi' = 'single';
  // the GitHub page has no game server of its own: multiplayer needs a server address (typed here, or in the link as ?server=wss://...)
  const serverBox = $('serveraddr') as HTMLInputElement;
  const showServerState = () => {
    const cur = getServerUrl();
    serverBox.value = cur ?? '';
    $('servernote').textContent = cur ? 'Players on this site connect to this server. Clear the box to go back to the default.'
      : isStaticHost() ? 'This website has no game server yet. Paste the server address you were given (it starts with wss://) to play multiplayer.' : 'Optional. Leave empty to use the server on this PC / network.';
    const mb = $('homeMulti').querySelector('span');
    if (mb) mb.textContent = isStaticHost() ? 'Play with friends online: you need the address of a game server (you can paste it on the next screen).' : 'Play with friends in a room, or join the public game for your chosen style.';
  };
  serverBox.addEventListener('change', () => {
    const v = serverBox.value.trim();
    if (v && !validServerUrl(v)) { $('servernote').textContent = 'That does not look right: it must start with wss:// (for example wss://name.trycloudflare.com).'; return; }
    setServerUrl(v); showServerState();
  });
  showServerState();
  const showSetup = (mode: 'single' | 'multi') => {
    setupMode = mode;
    $('setuptitle').textContent = mode === 'single' ? 'Single player: match setup' : 'Multiplayer: match setup';
    $('roomrow').style.display = mode === 'multi' ? 'block' : 'none';
    $('serverrow').style.display = mode === 'multi' ? 'block' : 'none';
    $('startgo').textContent = mode === 'single' ? 'Start the game' : 'Join the game';
    showTab('setup');
  };
  $('homeSingle').addEventListener('click', () => showSetup('single'));
  $('homeMulti').addEventListener('click', () => showSetup('multi'));
  $('setupback').addEventListener('click', () => showTab('play'));
  $('startgo').addEventListener('click', () => {
    if (setupMode === 'multi' && isStaticHost()) { say('Multiplayer needs a game server address: paste it into the Game server box first.'); return; }
    if (setupMode === 'multi' && profile.style === 'range') { say('The practice range is single player only: choose another game style for multiplayer.'); return; }
    hooks.onPlay(setupMode);
  });
  const armor = $('autoarmor') as HTMLInputElement;
  armor.checked = profile.autoBuy.armor;
  armor.addEventListener('change', () => { profile.autoBuy.armor = armor.checked; save(); });
  ($('name') as HTMLInputElement).value = profile.name;

  renderCoins(); renderMaps(); renderRules(); renderCustom(); renderTeams(); renderRewards(); renderShop(); renderPlayExtra(); renderSidearms(); renderPrimaries(); renderSkins(); renderKits(); renderControls();
  subTabs('tab-profile', [['over', 'Overview'], ['stats', 'Stats'], ['hist', 'History']], '#pname');
  subTabs('tab-setup', [['map', 'Map'], ['match', 'Game'], ['player', 'Player']], '.setuphead');
  subTabs('tab-controls', [['opts', 'Options'], ['move', 'Movement'], ['weapons', 'Weapons'], ['items', 'Items'], ['other', 'Other']]);
  subTabs('tab-rewards', [['w1', 'Days 1-14'], ['w2', 'Days 15-28'], ['ch', 'Daily challenges']], '.dprog');
  subTabs('tab-shop', [['costumes', 'Costumes'], ['kits', 'Dress kits'], ['sidearms', 'Sidearms'], ['finishes', 'Finishes']], '.rhead');
  if (profile.daily.claimed >= 14 && profile.daily.claimed < 28) subs['tab-rewards'].set('w2');
}
