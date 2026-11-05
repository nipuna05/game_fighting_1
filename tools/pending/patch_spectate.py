import os
ROOT = r'D:\my\project\Game\Fight'

def rep(s, a, b):
    assert s.count(a) >= 1, 'NOT FOUND: ' + a[:90]
    return s.replace(a, b, 1)

def load(*parts):
    return open(os.path.join(ROOT, *parts), newline='').read().replace('\r\n', '\n')

def save(s, *parts):
    open(os.path.join(ROOT, *parts), 'w', newline='', encoding='utf-8').write(s)

# ======================= keybinds.ts =======================
s = load('client', 'src', 'keybinds.ts')
s = rep(s, "  { id: 'mute', label: 'Mute sound', group: 'Other', defaults: ['KeyM'] },",
"""  { id: 'specNext', label: 'Next player to watch / skip the replay', group: 'When you are out', defaults: ['Space'] },
  { id: 'replay', label: 'Watch my death again in slow motion', group: 'When you are out', defaults: ['KeyR'] },
  { id: 'mute', label: 'Mute sound', group: 'Other', defaults: ['KeyM'] },""")
save(s, 'client', 'src', 'keybinds.ts')

# ======================= profile.ts: options =======================
s = load('client', 'src', 'profile.ts')
s = rep(s, "export interface Profile { keybinds:", "export interface Options { replay: boolean; voice: 'ptt' | 'open' | 'off' } // replay = slow-motion kill cam; voice = team voice chat mode\nexport interface Profile { options: Options; keybinds:")
s = rep(s, "const fresh = (): Profile => ({ keybinds: {},", "const fresh = (): Profile => ({ options: { replay: true, voice: 'ptt' }, keybinds: {},")
s = rep(s, "      keybinds: p.keybinds && typeof p.keybinds === 'object'", """      options: {
        replay: p.options?.replay !== false,
        voice: p.options?.voice === 'open' || p.options?.voice === 'off' ? p.options.voice : 'ptt',
      },
      keybinds: p.keybinds && typeof p.keybinds === 'object'""")
save(s, 'client', 'src', 'profile.ts')

# ======================= index.html =======================
s = load('client', 'index.html')
s = rep(s, '    .skin.p {', '''    #replay { position: fixed; inset: 0; z-index: 5; pointer-events: none; display: none; }
    #replay.on { display: block; }
    #replay .bar { position: absolute; left: 0; right: 0; height: 9vh; background: #000; } #replay .bt { top: 0; } #replay .bb { bottom: 0; }
    #replay .txt { position: absolute; top: calc(9vh + 14px); left: 50%; transform: translateX(-50%); text-align: center; text-shadow: 0 2px 10px #000; white-space: nowrap; }
    #replay .txt b { display: block; font: 900 30px Impact, 'Arial Black', system-ui; letter-spacing: .12em; color: #ff6b6b; } #replay .txt span { font: 600 15px system-ui; color: #fff; }
    #replay .skip { position: absolute; bottom: calc(9vh + 14px); left: 50%; transform: translateX(-50%); font: 600 14px system-ui; color: #cfd8e3; text-shadow: 0 2px 8px #000; }
    #spec { position: fixed; left: 50%; bottom: 13%; transform: translateX(-50%); z-index: 4; display: none; text-align: center; background: #000a; padding: 8px 18px; border-radius: 10px; pointer-events: none; font: 600 14px system-ui; color: #cfd8e3; }
    #spec b { display: block; font: 800 20px system-ui; color: #fff; letter-spacing: .04em; margin-bottom: 2px; }
    .opt { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #cdd7e4; padding: 5px 0; } .opt select { background: rgba(21,28,38,.9); color: #fff; border: 1px solid #2f3d52; border-radius: 8px; padding: 6px 8px; font-size: 13px; }
    .skin.p {''')
s = rep(s, '  <div id="hud"></div>', '  <div id="replay"><i class="bar bt"></i><i class="bar bb"></i><div class="txt"><b>KILL CAM</b><span id="replaywho"></span></div><div class="skip" id="replayskip"></div></div>\n  <div id="spec"></div>\n  <div id="hud"></div>')
s = rep(s, '          <div id="controls"></div>', '          <h4>Options</h4>\n          <label class="opt"><input type="checkbox" id="optreplay" /> Show a slow-motion replay of how I died</label>\n          <div id="controls"></div>')
save(s, 'client', 'index.html')

# ======================= menu.ts: the replay option =======================
s = load('client', 'src', 'menu.ts')
s = rep(s, "  $('resetkeys').addEventListener('click'", """  const optReplay = $('optreplay') as HTMLInputElement;
  optReplay.checked = profile.options.replay;
  optReplay.addEventListener('change', () => { profile.options.replay = optReplay.checked; saveProfile(profile); });
  $('resetkeys').addEventListener('click'""")
save(s, 'client', 'src', 'menu.ts')

# ======================= main.ts =======================
s = load('client', 'src', 'main.ts')
s = rep(s, "    case 'perf': if (v) game?.togglePerf(); break;", "    case 'perf': if (v) game?.togglePerf(); break;\n    case 'specNext': if (v) game?.specNext(); break;\n    case 'replay': if (v) game?.watchAgain(); break;")
s = rep(s, "if (e.button === 0 && !isTouch) mouse.down = true; if (e.button === 2) mouse.right = true; });", "if (e.button === 0 && !isTouch) mouse.down = true; if (e.button === 2) mouse.right = true; if (e.button === 0) this.specNext(true); });")

s = rep(s, "  private lastKill = -1;", """  private lastKill = -1;
  // death replay (kill cam) and spectating
  private history: { t: number; snap: Snapshot }[] = [];
  private lastHistoryT = 0;
  private replay: { frames: { t: number; snap: Snapshot }[]; clock: number; end: number; killer: string; speed: number; snap: Snapshot } | null = null;
  private lastDeath: { frames: { t: number; snap: Snapshot }[]; killer: string } | null = null;
  private specId: string | null = null;""")

# draw(): use the replay snapshot while replaying
s = rep(s, "  private draw(dt: number, time: number) {\n    const s = this.snap;\n    if (s) this.updateScene(s, dt, time);",
"""  private draw(dt: number, time: number) {
    this.record(this.snap);
    if (this.replay) this.advanceReplay(dt * 1000);
    const s = this.replay ? this.replay.snap : this.snap;
    if (s) this.updateScene(s, this.replay ? dt * this.replay.speed : dt, time);""")

# scene: while replaying nobody is "local"; camera follows the killer; spectating picks a target
s = rep(s, "      const local = p.id === this.myId && !!this.pred && !!this.localInput && p.alive;", "      const local = !this.replay && p.id === this.myId && !!this.pred && !!this.localInput && p.alive;")
s = rep(s, """    let camId = this.myId;
    if (meP && !meP.alive) { // spectate a living teammate while dead
      const mate = s.players.find((q) => q.alive && q.team === meP.team) ?? s.players.find((q) => q.alive);
      if (mate) camId = mate.id;""", """    let camId = this.myId;
    if (this.replay) {
      camId = this.replay.killer;                       // the kill cam follows whoever got the kill
    } else if (meP && !meP.alive) {                     // spectate a living teammate (or anyone, if none are left)
      camId = this.pickSpectate(s) ?? camId;
      if (false as boolean) {""")
s = rep(s, "    const wantScope = !!this.localInput?.scoped && camId === this.myId;", "    const wantScope = !!this.localInput?.scoped && camId === this.myId && !this.replay;")
# the HUD/audio/profile hooks must not run on replayed (old) snapshots
s = rep(s, "    if (s.round) { this.updateHud(s); this.audioEvents(s, performance.now() / 1000); this.trackProfile(s); this.lootEvents(s); this.killEvents(s); }",
           "    if (s.round && !this.replay) { this.updateHud(s); this.audioEvents(s, performance.now() / 1000); this.trackProfile(s); this.lootEvents(s); this.killEvents(s); this.updateSpectate(s); }")

# methods
s = rep(s, "  private spawnFx(kind:", r"""  // ---------- kill cam and spectating ----------
  /** Keeps the last few seconds of snapshots so the death can be replayed. */
  private record(live: Snapshot | null) {
    if (!live) return;
    const now = performance.now();
    if (now - this.lastHistoryT < 30 || this.history[this.history.length - 1]?.snap === live) return;
    this.lastHistoryT = now;
    this.history.push({ t: now, snap: live });
    while (this.history.length && this.history[0].t < now - 7000) this.history.shift();
  }

  private startReplay(killer: string, frames?: { t: number; snap: Snapshot }[]) {
    const f = frames ?? this.history.filter((h) => h.t >= performance.now() - 1900);
    if (f.length < 6 || !f[f.length - 1].snap.players.some((p) => p.id === killer)) return;
    this.lastDeath = { frames: f, killer };
    this.replay = { frames: f, clock: f[0].t, end: f[f.length - 1].t + 450, killer, speed: 0.4, snap: f[0].snap };
    this.shown.clear();                                 // no smoothing across the jump back in time
    const name = f[f.length - 1].snap.players.find((p) => p.id === killer)?.name ?? '?';
    $('replaywho').textContent = `Killed by ${name}  -  slow motion`;
    $('replayskip').textContent = `${keyLabel(currentBinds().specNext[0])} skips`;
    $('replay').classList.add('on');
    this.renderer.domElement.style.filter = 'saturate(.65) contrast(1.08) sepia(.22)';
  }

  private advanceReplay(deltaMs: number) {
    const r = this.replay;
    if (!r) return;
    r.clock += deltaMs * r.speed;
    let i = 0;
    while (i + 1 < r.frames.length && r.frames[i + 1].t <= r.clock) i++;
    r.snap = r.frames[i].snap;
    if (r.clock >= r.end) this.endReplay();
  }

  private endReplay() {
    this.replay = null;
    this.shown.clear();
    $('replay').classList.remove('on');
    this.renderer.domElement.style.filter = '';
  }

  /** "Watch again": replays the last death. */
  watchAgain() {
    if (this.replay || !this.lastDeath || this.me()?.alive) return;
    this.startReplay(this.lastDeath.killer, this.lastDeath.frames);
  }

  private spectateTargets(s: Snapshot) {
    const me = s.players.find((p) => p.id === this.myId);
    const mates = s.players.filter((p) => p.alive && p.id !== this.myId && p.team === me?.team);
    return mates.length ? mates : s.players.filter((p) => p.alive && p.id !== this.myId);
  }
  private pickSpectate(s: Snapshot): string | null {
    const list = this.spectateTargets(s);
    if (!list.length) return null;
    if (!this.specId || !list.some((p) => p.id === this.specId)) this.specId = list[0].id;
    return this.specId;
  }
  /** Space (or a click) skips the replay, or switches to the next player while you are out. */
  specNext(fromClick = false) {
    if (this.replay) { if (!fromClick) this.endReplay(); return; }
    const s = this.snap, me = this.me();
    if (!s || !me || me.alive) return;
    const list = this.spectateTargets(s);
    if (!list.length) return;
    const i = list.findIndex((p) => p.id === this.specId);
    this.specId = list[(i + 1) % list.length].id;
  }
  private updateSpectate(s: Snapshot) {
    const me = s.players.find((p) => p.id === this.myId);
    const el = $('spec');
    if (!me || me.alive || this.replay) { el.style.display = 'none'; return; }
    const target = s.players.find((p) => p.id === this.pickSpectate(s));
    if (!target) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const b = currentBinds();
    el.innerHTML = `<b>SPECTATING ${esc(target.name)} <span class="${target.team === 'CT' ? 'ct' : 't'}" style="font-size:13px">${TEAM_INFO[target.team].short}</span></b>${keyLabel(b.specNext[0])} or click: next player${this.lastDeath ? ` &middot; ${keyLabel(b.replay[0])}: watch my death again` : ''}`;
  }

  private spawnFx(kind:""")

# start the kill cam when the local player is killed
s = rep(s, "      if (mine) {\n        sfx.kill();", "      if (victimIsMe && profile.options.replay && this.snap?.round && !mine) this.startReplay(k.killer);\n      if (mine) {\n        sfx.kill();")
save(s, 'client', 'src', 'main.ts')
print('spectate patched')
