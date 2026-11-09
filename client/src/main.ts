import * as THREE from 'three';
import { initAudio, sfx, toggleMute } from './audio';
import { music } from './music';
import { buildWorld, makeWeaponModel, loadGunModels, type World } from './world';
import {
  applyKneel, applyProne, applyArmIK, QS, MODEL_YAW, MAX_TWIST, TURN_RATE, TWIST_SIGN, AXIS_Y, wrapAngle, template, loadTemplate, makeModelCharacter, makeCharacter, type Character,
} from './characters';
import { loadProfile, saveProfile, addMatch, addTitle, type TeamPref } from './profile';
import { initMenu } from './menu';
import { Voice } from './voice';
import { actionFor, applyBinds, binds as currentBinds, keyLabel } from './keybinds';
import { startLanding, type Landing } from './landing';
import {
  Sim, movePlayer, PLAYER_SPEED, adsSpeed, ADS_SPREAD, CROUCH_SPEED, PRONE_SPEED, SNEAK_SPEED, JUMP_SPEED, JUMP_TIME, JUMP_COOLDOWN, WALLS, WEAPONS, SITES, SPAWN_ZONES, WORLD_W, WORLD_H, PICKUP_R, MAX_HP, TICK_RATE, TEAM_SIZE, WINS_TO_WIN,
  levelWalls, FLOOR_H, GAME_MODES, type PlayerState, ITEMS, ITEM_BASE, SMOKE_R, customMods, allowedWeapons, type GameMode, type WeaponSet, type PickMode, type Difficulty, ARMOR_ITEM, ARMOR_COST, SKIN_COUNT, SKIN_BASE, TEAM_INFO, MULTI_NAMES, FIRST_BLOOD, MVP_TITLE, FRAG_R, getMap, MAP_IDS, type MapDef,
  type Input, type Snapshot, type ServerMsg, type Team,
} from '@fight/shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- input sources ----------
const keys = { up: false, down: false, left: false, right: false, use: false, scope: false, crouch: false, jump: false, prone: false, sneak: false, reload: false };
const profile = loadProfile();
applyBinds(profile.keybinds); // the player's own key bindings (Controls tab in the menu)
let game: Game | null = null;
const stick = { mx: 0, my: 0, aimAngle: 0, aiming: false, tx: 0, fireBtn: false };
const mouse = { x: 0, y: 0, down: false, right: false };

function bindTouch() {
  const layer = $('touch');
  layer.style.display = 'block';
  const setup = (el: HTMLElement, knob: HTMLElement, onMove: (nx: number, ny: number, active: boolean) => void) => {
    let pid = -1;
    const update = (e: PointerEvent) => {
      const b = el.getBoundingClientRect(), R = b.width / 2;
      knob.dataset.r = String(R);
      let dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      onMove(dx / R, dy / R, true);
    };
    el.addEventListener('pointerdown', (e) => { pid = e.pointerId; el.setPointerCapture(pid); update(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) update(e); });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1; knob.style.transform = ''; onMove(0, 0, false);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  document.body.classList.add('touch', 'playing');
  // action buttons: hold USE to plant / defuse, SCOPE toggles the sniper zoom, SWAP flips to the other weapon, TALK is push-to-talk
  const hold = (id: string, down: () => void, up: () => void) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); el.classList.add('on'); down(); });
    const end = () => { el.classList.remove('on'); up(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  };
  hold('tUse', () => { keys.use = true; }, () => { keys.use = false; });
  hold('tTalk', () => game?.talk(true), () => game?.talk(false));
  hold('tFire', () => { stick.fireBtn = true; }, () => { stick.fireBtn = false; });
  hold('tReload', () => { keys.reload = true; game?.queueReload(); }, () => { keys.reload = false; });
  hold('tJump', () => { keys.jump = true; game?.queueJump(); }, () => { keys.jump = false; });
  $('tProne').addEventListener('pointerdown', () => { keys.prone = !keys.prone; $('tProne').classList.toggle('on', keys.prone); });
  $('tCrouch').addEventListener('pointerdown', () => { keys.crouch = !keys.crouch; $('tCrouch').classList.toggle('on', keys.crouch); });
  $('tSwap').addEventListener('pointerdown', () => game?.lastWeapon());
  $('tScope').addEventListener('pointerdown', () => { keys.scope = !keys.scope; $('tScope').classList.toggle('on', keys.scope); });
  $('tFull').addEventListener('pointerdown', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void goFullscreen(); });
  setup($('stickL'), $('knobL'), (x, y) => { stick.mx = x; stick.my = y; });
  setup($('stickR'), $('knobR'), (x, y, active) => {
    stick.tx = active ? x : 0;                    // first-person: the right stick only turns
    stick.aiming = active && Math.hypot(x, y) > 0.2;
    if (active && Math.hypot(x, y) > 0.05) stick.aimAngle = Math.atan2(y, x);
  });
}

/** Phones: fill the screen and stay in landscape (the browser only allows this after a tap, so it is called from the Play button). */
async function goFullscreen() {
  try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); } catch { /* not allowed (e.g. iPhone Safari): the game still works */ }
  try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'); } catch { /* not supported */ }
}

/** Back to the main menu from anywhere in a game (the page is simply reloaded without the dev parameters). */
function leaveGame() { try { game?.leave(); } finally { location.assign(location.pathname); } }

/** smooth 0..1 ramp between two values */
const smooth01 = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const typing = (e: KeyboardEvent) => ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement | null)?.tagName ?? '');
window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && game) { game.togglePause(); return; } if (typing(e) || e.repeat) return; if (setKey(e.code, true) && game) e.preventDefault(); });
window.addEventListener('keyup', (e) => { setKey(e.code, false); });
/** Handles one key press / release using the current bindings. Returns true if the key is bound to something. */
function setKey(code: string, v: boolean): boolean {
  const act = actionFor(code);
  switch (act) {
    case 'up': keys.up = v; break;
    case 'down': keys.down = v; break;
    case 'left': keys.left = v; break;
    case 'right': keys.right = v; break;
    case 'use': keys.use = v; break;
    case 'scope': keys.scope = v; break;
    case 'crouch': if (v && keys.prone) keys.prone = false; keys.crouch = v; break;                // kneeling from the ground: get up on one knee
    case 'prone': if (v) keys.prone = !keys.prone; break;                                         // lie down / get up
    case 'sneak': keys.sneak = v; break;
    case 'reload': keys.reload = v; if (v) game?.queueReload(); break;
    case 'item0': case 'item1': case 'item2': case 'item3': case 'item4': case 'item5': case 'item6': case 'item7': case 'item8': case 'item9': if (v) game?.useItem(Number(act.slice(4))); break;
    case 'view': if (v) game?.toggleView(); break;
    case 'jump': if (v && keys.prone) { keys.prone = false; break; } keys.jump = v; if (v) game?.queueJump(); break;   // from the ground the first press only gets you up
    case 'buyArmor': if (v) game?.buy(ARMOR_ITEM); break;
    case 'rebuy': if (v) game?.rebuy(); break;
    case 'sidearm': if (v) game?.selectSlot(1); break;
    case 'primary': if (v) game?.selectSlot(2); break;
    case 'lastWeapon': if (v) game?.lastWeapon(); break;
    case 'mute': if (v) { toggleMute(); music.refreshMute(); } break;
    case 'perf': if (v) game?.togglePerf(); break;
    case 'help': if (v) game?.toggleHelp(); break;
    case 'specNext': if (v) game?.specNext(); break;
    case 'talk': game?.talk(v); break;
    case 'replay': if (v) game?.watchAgain(); break;
    default: return false;
  }
  return true;
}
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; game?.look(e.movementX, e.movementY); });
window.addEventListener('wheel', (e) => { if (e.deltaY !== 0) game?.cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });

// ---------- 3D building blocks ----------
const AIM_HEIGHT = 34; // height of the gun, used when turning the mouse position into an aim direction

function makeCash(): THREE.Group {
  const g = new THREE.Group();
  const bill = new THREE.MeshStandardMaterial({ color: 0x3fae5f, roughness: 0.6, emissive: 0x14532d, emissiveIntensity: 0.5 });
  const band = new THREE.MeshStandardMaterial({ color: 0xe8f5e9, roughness: 0.7 });
  for (let i = 0; i < 3; i++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 14), bill);
    slab.position.set(0, 3 + i * 5.2, 0); slab.rotation.y = (i - 1) * 0.18; slab.castShadow = true; g.add(slab);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(5, 5.4, 14.4), band);
    strap.position.copy(slab.position); strap.rotation.y = slab.rotation.y; g.add(strap);
  }
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 2, 20), new THREE.MeshStandardMaterial({ color: 0xffd34d, metalness: 0.8, roughness: 0.25, emissive: 0x8a6a00, emissiveIntensity: 0.6 }));
  coin.position.y = 22; coin.rotation.x = Math.PI / 2; g.add(coin);
  return g;
}

function makePickup(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x3ddc84, emissive: 0x1e8e5a, emissiveIntensity: 0.6 });
  const a = new THREE.Mesh(new THREE.BoxGeometry(PICKUP_R * 2, 10, 10), m);
  const b = new THREE.Mesh(new THREE.BoxGeometry(10, 10, PICKUP_R * 2), m);
  a.castShadow = b.castShadow = true;
  g.add(a, b);
  return g;
}

// ---------- bullet tracers and effects ----------
const TRACER = { Sniper: [46, 2.4, 0xdff2ff], Shotgun: [7, 1.7, 0xffc766], LMG: [22, 2.2, 0xff9d3d], Rifle: [18, 1.8, 0xffcf5a], SMG: [12, 1.5, 0xffd980], Sidearm: [13, 1.6, 0xffe9a8] } as const;
const tracerCache: { len: number; th: number; color: THREE.Color }[] = [];
function tracerStyle(w: number) {
  return tracerCache[w] ??= (() => { const t = TRACER[(WEAPONS[w]?.cat ?? 'Sidearm') as keyof typeof TRACER] ?? TRACER.Sidearm; return { len: t[0], th: t[1], color: new THREE.Color(t[2]) }; })();
}
const FLASH_SIZE: Record<string, number> = { Sniper: 46, Shotgun: 36, LMG: 32, Rifle: 28, SMG: 22, Sidearm: 20 };

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, inner); grad.addColorStop(0.35, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
interface Particle { s: THREE.Sprite; vx: number; vy: number; vz: number; life: number; max: number; size: number; grav: number }

// ---------- game ----------
interface Config { mode: 'single' | 'multi'; name: string; room: string; skin: number; sidearm: number; team: TeamPref; map: string; style: GameMode; weaponSet: WeaponSet; pick: PickMode; difficulty: Difficulty }
interface Shown { x: number; y: number; z: number; angle: number; moved: number; vx: number; vy: number }

class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private chars = new Map<string, Character>();
  private labels = new Map<string, HTMLDivElement>();
  private pickupMeshes = new Map<number, THREE.Group>();
  private bullets: THREE.InstancedMesh;
  private bombMesh: THREE.Mesh;
  private lastBuyState = '';
  private lastWbar = '';
  private pendingWeapon: number | null = null; // a weapon switch the player asked for, sent once then cleared
  private curWeapon = 0;
  private prevWeapon = 0;
  private tp = { phase: '', recorded: false };
  private prevCash = new Map<number, { x: number; y: number; amount: number }>();
  private lastKill = -1;
  // death replay (kill cam) and spectating
  private history: { t: number; snap: Snapshot }[] = [];
  private lastHistoryT = 0;
  private replay: { frames: { t: number; snap: Snapshot }[]; clock: number; end: number; killer: string; speed: number; snap: Snapshot } | null = null;
  private lastDeath: { frames: { t: number; snap: Snapshot }[]; killer: string } | null = null;
  private specId: string | null = null;
  private voice: Voice | null = null;               // team voice chat (multiplayer, if the player turned it on)
  private micAcc = 0;
  paused = false;
  // first-person ("through the soldier's eyes") camera
  private fp = QS.get('view') ? QS.get('view') === 'fps' : profile.options.view === 'fps';
  private fpActive = false;                              // first-person is on AND I am alive and not watching a replay
  private pitch = 0;                                     // looking up / down (first-person; a view effect, shots stay level)
  private yaw = 0;                                       // the direction I look (radians, the same angle the sim uses)
  private viewGun: THREE.Group | null = null; private viewGunIdx = -1; private kick = 0;
  private releasing = false;
  private jumpPending = false;
  /** A quick tap must still count: keep the jump request until the next input has been sent. */
  queueJump() { this.jumpPending = true; }
  private reloadPending = false;
  queueReload() { this.reloadPending = true; }
  private pendingItem: number | null = null;
  /** Use a healing item / throw a grenade (latched until it has been sent). */
  useItem(k: number) { this.pendingItem = k; }
  // ---------- controls cheat sheet (F1; shown by itself in your first game) ----------
  private helpTimer = 0; private helpAuto = false;
  toggleHelp() { if ($('help').classList.contains('on')) this.hideHelp(); else this.showHelp(false); }
  private showHelp(auto: boolean) {
    const b = currentBinds(), k = (id: string) => keyLabel(b[id]?.[0] ?? '');
    const rows: [string, string][] = [
      ['Move', `${k('up')} ${k('left')} ${k('down')} ${k('right')}`], ['Look / aim', 'Mouse'], ['Shoot', 'Left click'], ['Aim down the sights (scope)', 'Hold right click'],
      ['Reload', k('reload')], ['Jump over cover', k('jump')], ['Kneel (hold)', k('crouch')], ['Lie down', k('prone')], ['Walk slowly (hold)', k('sneak')],
      ['Use: plant, defuse, untie', k('use')], ['Sidearm / primary', `${k('sidearm')} / ${k('primary')}`], ['Last weapon', k('lastWeapon')],
      ['Heal / throw items', `${k('item0')} ... ${k('item6')}  ${k('item7')}  ${k('item8')}  ${k('item9')}`], ['Camera: first-person / top-down', k('view')],
      ['Talk to team', k('talk')], ['Mute', k('mute')], ['Menu / leave', 'Esc'], ['This sheet', k('help')],
    ];
    $('helpgrid').innerHTML = rows.map(([a, c]) => `<div class="hr"><span>${esc(a)}</span><b>${esc(c)}</b></div>`).join('');
    $('helpkey').textContent = k('help');
    $('help').classList.add('on'); this.helpAuto = auto;
    window.clearTimeout(this.helpTimer);
    if (auto) this.helpTimer = window.setTimeout(() => this.hideHelp(), 16000);
  }
  private hideHelp() {
    window.clearTimeout(this.helpTimer);
    $('help').classList.remove('on');
    if (!profile.options.helpSeen) { profile.options.helpSeen = true; saveProfile(profile); }
  }
  private helpQueued = false;
  private game_alive() { return game === this && !this.paused && !!this.me()?.alive; }
  private endDismissed = false;
  private statsKey = '';
  private mkStat = { byWeapon: new Map<number, number>(), bestMulti: 0 };            // my kills per weapon and my best multi-kill this game
  private introUntil = 0;
  private predAir = 0; private predCd = 0;      // local copy of the jump timers (for prediction)
  // bullet effects and the sniper scope
  private lastBulletFx = -1;
  private lastImpactFx = -1;
  private fxParts: Particle[] = [];
  private fxMat: Record<'flash' | 'spark' | 'blood' | 'dust', THREE.SpriteMaterial> | null = null;
  private scopeT = 0;                                   // 0 = not scoped, 1 = fully zoomed (animated)
  private wasScoped = false;
  private aimPoint = { x: 0, y: 0 };                     // the ground point under the mouse (used to shift the camera while scoped)
  private matchLoot = 0;
  private lastCoins = 0;
  private lastMvp = false;
  private ev = { vip: '', fsig: '', capT: -1, capCT: -1, cpOwner: '', maxKill: -1, maxBullet: 0, maxImpact: -1, hp: MAX_HP, alive: true, phase: '', bomb: 'none', nextBeep: 0, am: 0, rl: 0, weapon: -1, us: -1, iv: [] as number[], rescued: -1, mine: -1, theirs: -1 };
  private shown = new Map<string, Shown>();
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -AIM_HEIGHT);
  private camTarget = new THREE.Vector3(WORLD_W / 2, 0, WORLD_H / 2);
  private hud = $('hud');
  private labelLayer = $('labels');

  private sim?: Sim;
  private ws?: WebSocket;
  private myId = 'me';
  private snap: Snapshot | null = null;
  private acc = 0;
  private sendAcc = 0;
  // smoothness: client-side prediction of the local player, adaptive quality, performance overlay
  private pred: { x: number; y: number } | null = null;   // predicted position of the local player (no waiting for the server)
  private localInput: Input | null = null;
  private mapDef: MapDef | null = null;
  private frameMs = 16;                                    // smoothed frame time
  private slowFor = 0;                                     // seconds spent below ~40 fps
  private quality = 0;                                     // 0 full, 1 lower resolution, 2 smaller shadows, 3 no shadows
  private pingMs = 0;
  private pingAcc = 0;
  private perfOn = false;
  private perfAcc = 0;
  private last = performance.now();
  private status = '';
  private tmp = new THREE.Vector3();
  private dummy = new THREE.Object3D();

  constructor(private cfg: Config) {
    const host = $('game');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    if (QS.has('debug')) (window as unknown as { __game: Game }).__game = this; // dev: inspect the game from the console
    if (QS.has('debug')) (window as unknown as { __sfx: typeof sfx }).__sfx = sfx;   // dev: play sounds from the console
    if (QS.has('lowq')) { this.quality = Number(QS.get('lowq')); }
    this.camera = new THREE.PerspectiveCamera(45, 1, 10, 4000);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0 && !isTouch) mouse.down = true; if (e.button === 2) mouse.right = true; if (e.button === 0) this.specNext(true); });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.right = false; });
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    if (cfg.mode === 'single') this.buildWorld(getMap(cfg.map)); // multiplayer builds it when the server says which map the room uses
    this.bullets = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 600); // stretched into tracers below
    this.bullets.frustumCulled = false;
    this.scene.add(this.bullets);
    this.bombMesh = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 12), new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xff2200, emissiveIntensity: 0.5 }));
    this.bombMesh.castShadow = true; this.bombMesh.visible = false;
    this.scene.add(this.bombMesh);
    this.buildBuyMenu();
    $('menubtn').addEventListener('click', () => this.togglePause(true));
    document.body.classList.toggle('fp', this.fp);
    this.renderer.domElement.addEventListener('mousedown', () => this.lockMouse());
    document.addEventListener('pointerlockchange', () => {   // Esc gives the mouse back: treat it as "open the menu"
      if (this.releasing) { this.releasing = false; return; }
      if (!document.pointerLockElement && this.fpActive && !this.paused) this.togglePause(true);
    });
    $('resumebtn').addEventListener('click', () => this.togglePause(false));
    $('leavebtn').addEventListener('click', leaveGame);
    $('endleave').addEventListener('click', leaveGame);
    $('endstay').addEventListener('click', () => { this.endDismissed = true; $('endscreen').classList.remove('on'); });
    document.body.classList.add('playing');
    $('wbar').addEventListener('click', (e) => { const w = (e.target as HTMLElement).closest('button')?.dataset.w; if (w !== undefined) this.selectWeapon(Number(w)); });

    if (cfg.mode === 'single') {
      this.sim = new Sim({ rounds: true, map: cfg.map, mode: cfg.style, weaponSet: cfg.weaponSet, pick: cfg.pick, difficulty: cfg.difficulty, invincible: QS.has('god') ? [this.myId] : [] }); // dev: ?god=1
      this.sim.join(this.myId, cfg.name, cfg.skin, cfg.sidearm, cfg.team, profile.custom);
      this.sim.fillBots(TEAM_SIZE);
    } else {
      this.connect();
    }
    requestAnimationFrame(() => this.frame());
  }

  private retries = 0;
  private connect() {
    this.status = this.retries ? 'Reconnecting...' : 'Connecting...';
    const url = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:${import.meta.env.VITE_WS_PORT ?? 8080}`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => { this.retries = 0; this.ws!.send(JSON.stringify({ type: 'join', name: this.cfg.name, room: this.cfg.room, skin: this.cfg.skin, sidearm: this.cfg.sidearm, team: this.cfg.team, map: this.cfg.map, style: this.cfg.style, wset: this.cfg.weaponSet, pick: this.cfg.pick, cu: profile.custom })); };
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as ServerMsg;
      if (m.type === 'pong') { this.pingMs = performance.now() - m.t; return; }
      if (m.type === 'welcome') {
        this.myId = m.id; this.status = `Room: ${m.room}`;
        if (!this.mapDef) { this.worldMode = m.mode ?? this.cfg.style; this.buildWorld(getMap(m.map)); }
        this.voice?.disable(); this.voice = null; this.startVoice(m.id);   // a reconnect is a new player id
      }
      else if (m.type === 'snap') this.snap = m.snap;
      else this.voice?.handle(m);               // 'voice' / 'rtc': team voice chat set-up
    };
    this.ws.onclose = (ev) => {
      if (ev.code === 1013) { this.status = 'Room is full - go back and pick another room code'; this.toast('Room is full'); return; }
      // the connection dropped (server restart, wifi change, phone sleep): try again instead of leaving the player stuck
      this.snap = null;
      if (this.retries >= 20) { this.status = 'Disconnected (is the server running?)'; return; }
      this.retries++; this.status = `Connection lost - reconnecting (${this.retries})...`;
      setTimeout(() => this.connect(), Math.min(4000, 500 * this.retries));
    };
  }

  private me() { return this.snap?.players.find((p) => p.id === this.myId); }

  /** Switch to weapon `i` (0-based) if the player owns it. */
  selectWeapon(i: number) {
    const me = this.me();
    if (!me || !me.alive || !Number.isInteger(i) || i < 0 || i >= WEAPONS.length || !((me.owned >> i) & 1) || i === me.weapon) return;
    this.pendingWeapon = i;
  }
  /** Keys 1 / 2: the sidearm / primary slot. */
  selectSlot(n: number) {
    const me = this.me();
    const want = n === 1 ? 'sidearm' : n === 2 ? 'primary' : null;
    if (!me || !want) return;
    const i = WEAPONS.findIndex((w, k) => w.slot === want && ((me.owned >> k) & 1));
    if (i >= 0) this.selectWeapon(i);
  }
  /** Mouse wheel: next / previous owned weapon. */
  cycleWeapon(dir: number) {
    const me = this.me();
    if (!me) return;
    const owned = WEAPONS.map((_, i) => i).filter((i) => (me.owned >> i) & 1);
    if (owned.length < 2) return;
    const at = Math.max(0, owned.indexOf(this.pendingWeapon ?? me.weapon));
    this.selectWeapon(owned[(at + dir + owned.length) % owned.length]);
  }
  /** Q: flip back to the previously used weapon. */
  lastWeapon() { this.selectWeapon(this.prevWeapon); }

  /** B: buy whatever was in the last saved weapon pack (best weapon first, then armor). */
  rebuy() {
    const me = this.me();
    const pack = profile.pack;
    if (!pack || !me || !me.alive || this.snap?.round?.phase !== 'buy') return;
    for (const i of [...pack.weapons].sort((a, b) => WEAPONS[b].cost - WEAPONS[a].cost)) if (!((me.owned >> i) & 1)) this.buy(i);
    if (pack.armor && me.armor < 100) this.buy(ARMOR_ITEM);
  }

  /** Builds the buy menu: primaries grouped by type, plus armor and rebuy. */
  private menuKind: 'buy' | 'loadout' | '' = '';
  private loadoutKey = '';
  /** Free-loadout games (team deathmatch, weapon sets): no cash, just choose your weapon for the next spawn. */
  private updateLoadout(r: NonNullable<Snapshot['round']>, me: Snapshot['players'][number] | undefined, show: boolean) {
    const box = $('buy');
    box.style.display = show ? 'block' : 'none';
    if (!show || !me) return;
    const key = `${r.weaponSet}|${r.pick}|${me.ch}|${me.owned}|${me.alive}|${me.armor}`;
    $('buytime').textContent = me.alive ? `${Math.ceil(r.timeLeft)}s` : `respawn in ${Math.ceil(me.rs)}s`;
    if (this.menuKind === 'loadout' && key === this.loadoutKey) return;
    this.menuKind = 'loadout'; this.loadoutKey = key;
    const h3 = box.querySelector('h3'); if (h3) h3.innerHTML = `${me.alive ? 'CHOOSE YOUR WEAPON' : 'NEXT SPAWN'} &mdash; <span id="buytime"></span>`;
    $('buytime').textContent = me.alive ? `${Math.ceil(r.timeLeft)}s` : `respawn in ${Math.ceil(me.rs)}s`;
    const grid = $('buygrid'); grid.innerHTML = '';
    if (r.pick === 'auto') {
      grid.innerHTML = '<div class="pickhint">Automatic: you get a random weapon from the set every time you spawn.</div>';
    } else {
      const note = document.createElement('div'); note.className = 'pickhint';
      note.textContent = me.alive ? 'Pick your weapon (you keep it until you are down, then your pick applies again):' : 'Pick the weapon you want when you respawn:';
      grid.appendChild(note);
      const row = document.createElement('div'); row.className = 'row'; row.style.justifyContent = 'center';
      for (const i of allowedWeapons(r.weaponSet)) {
        const b = document.createElement('button');
        b.dataset.item = String(i);
        b.className = (me.ch === i || (me.ch < 0 && ((me.owned >> i) & 1))) ? 'cur' : '';
        b.innerHTML = `${esc(WEAPONS[i].name)}<small>${esc(WEAPONS[i].cat)}</small>`;
        b.addEventListener('click', () => this.buy(i));
        row.appendChild(b);
      }
      grid.appendChild(row);
    }
    if (me.alive && r.phase === 'buy') {
      const armor = document.createElement('button'); armor.dataset.item = String(ARMOR_ITEM); armor.disabled = me.armor >= 100;
      armor.innerHTML = `[${keyLabel(currentBinds().buyArmor[0])}] Armor<small>free</small>`; armor.style.marginTop = '8px';
      armor.addEventListener('click', () => this.buy(ARMOR_ITEM));
      grid.appendChild(armor);
    }
  }

  private buildBuyMenu() {
    const grid = $('buygrid');
    grid.innerHTML = '';
    for (const cat of ['SMG', 'Shotgun', 'Rifle', 'Sniper', 'LMG']) {
      const col = document.createElement('div');
      col.className = 'grp';
      col.innerHTML = `<h4>${cat}</h4>`;
      WEAPONS.forEach((w, i) => {
        if (w.cat !== cat || w.slot !== 'primary') return;
        const b = document.createElement('button');
        b.dataset.item = String(i);
        b.innerHTML = `${esc(w.name)}<small>$${w.cost}</small>`;
        b.addEventListener('click', () => this.buy(i));
        col.appendChild(b);
      });
      grid.appendChild(col);
    }
    const gear = document.createElement('div');
    gear.className = 'grp';
    gear.innerHTML = '<h4>Gear</h4>';
    const armor = document.createElement('button');
    armor.dataset.item = String(ARMOR_ITEM);
    armor.innerHTML = `[${keyLabel(currentBinds().buyArmor[0])}] Armor<small>$${ARMOR_COST}</small>`;
    armor.addEventListener('click', () => this.buy(ARMOR_ITEM));
    const rebuy = document.createElement('button');
    rebuy.id = 'rebuy';
    rebuy.innerHTML = `[${keyLabel(currentBinds().rebuy[0])}] Rebuy<small>last pack</small>`;
    rebuy.addEventListener('click', () => this.rebuy());
    gear.append(armor, rebuy);
    grid.appendChild(gear);
    const eq = document.createElement('div');
    eq.className = 'grp';
    eq.innerHTML = '<h4>Equipment</h4>';
    ITEMS.forEach((d, k) => {
      const b = document.createElement('button');
      b.dataset.item = String(ITEM_BASE + k);
      b.innerHTML = `${esc(d.name)}<small>$${d.cost}</small>`;
      b.addEventListener('click', () => this.buy(ITEM_BASE + k));
      eq.appendChild(b);
    });
    grid.appendChild(eq);
  }

  /** Menu "auto-buy": at the start of each buy phase, buy the favourite primary (and armor). */
  private autoBuy(me: Snapshot['players'][number]) {
    const ab = profile.autoBuy;
    if (ab.primary !== null && !((me.owned >> ab.primary) & 1)) this.buy(ab.primary);
    if (ab.armor && me.armor < 100) this.buy(ARMOR_ITEM);
  }

  buy(item: number) {
    sfx.buy();
    if (this.sim) this.sim.buy(this.myId, item);
    else if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'buy', item }));
  }

  private worldMode: string = '';
  private world: World | null = null;
  /** The upper floor of a house is hidden while the camera's player is on the ground floor inside it, so the ground floor stays visible. */
  private updateUpperFloors(s: Snapshot, camId: string) {
    const p = s.players.find((q) => q.id === camId), d = this.shown.get(camId);
    for (const b of this.world?.buildings ?? []) {
      const inside = !!p && !!d && p.lv === 0 && d.x > b.rect.x - 12 && d.x < b.rect.x + b.rect.w + 12 && d.y > b.rect.y - 12 && d.y < b.rect.y + b.rect.h + 12;
      b.upper.visible = !inside;
    }
  }
  private buildWorld(map: MapDef) {
    this.mapDef = map;
    this.world = buildWorld(this.scene, map, this.worldMode || this.cfg.style);
    if (this.quality > 0) this.applyQuality();
  }

  private startVoice(id: string) {
    if (profile.options.voice === 'off' || this.voice) return;
    this.voice = new Voice(id, (msg) => { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }, profile.options.voice);
    void this.voice.enable();
  }
  toggleView() {
    this.fp = !this.fp; if (!this.fp) this.pitch = 0;
    profile.options.view = this.fp ? 'fps' : 'top'; profile.options.viewSet = true; saveProfile(profile);
    const me = this.me(); if (this.fp && me) this.yaw = me.angle;
    document.body.classList.toggle('fp', this.fp);
    if (!this.fp && document.pointerLockElement) { this.releasing = true; document.exitPointerLock(); }
    this.toast(this.fp ? 'First-person view' : 'Top-down view');
  }
  /** Mouse movement turns the head in first-person (needs the captured mouse). */
  look(dx: number, dy = 0) { if (this.fpActive && document.pointerLockElement && !this.paused) { this.yaw += dx * 0.0022; this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch - dy * 0.0022)); } }   // mouse up = look up
  /** The weapon in my hands, drawn on top of everything in front of the camera. */
  private viewGunKey = '';
  private viewFlash: THREE.Sprite | null = null;
  private adsEase = 0; private recoilPitch = 0; private bobT = 0;
  private flashT = 0; private equipAnim = 0; private reloadTotal = 0; private lastDry = 0;
  private casings: { m: THREE.Mesh; v: THREE.Vector3; life: number; spin: THREE.Vector3 }[] = [];
  private casingMats = { brass: new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 }), shell: new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 }) };

  /** The weapon in my hands (first-person): the right sights / finish, a muzzle flash, recoil, and the reload and swap movements. */
  private updateViewGun(weapon: number | undefined, cu: number, show: boolean, dt: number, rl: number) {
    if (!this.viewGun) { this.viewGun = new THREE.Group(); this.camera.add(this.viewGun); if (!this.camera.parent) this.scene.add(this.camera); }
    const g = this.viewGun;
    g.visible = show && weapon !== undefined;
    const key = `${weapon}|${cu}`;
    if (weapon !== undefined && key !== this.viewGunKey) {
      g.clear();
      const m = makeWeaponModel(weapon, cu);
      const box = new THREE.Box3().setFromObject(m);
      m.rotation.y = Math.PI / 2;                       // barrel points along +x in the model, the camera looks along -z
      m.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; me.castShadow = false; me.renderOrder = 999; for (const mat of ([] as THREE.Material[]).concat(me.material)) mat.depthTest = false; });
      if (!this.viewFlash) {
        this.viewFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,244,200,1)', 'rgba(255,150,30,0)'), transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
        this.viewFlash.renderOrder = 1000; this.viewFlash.scale.setScalar(12);
      }
      this.viewFlash.position.set(box.max.x + 2, 0.5, 0); m.add(this.viewFlash);        // flash at the end of the barrel
      g.add(m); this.viewGunKey = key;
    }
    this.flashT = Math.max(0, this.flashT - dt);
    if (this.viewFlash) this.viewFlash.visible = this.flashT > 0;
    this.kick = Math.max(0, this.kick - dt * 9);
    this.equipAnim = Math.max(0, this.equipAnim - dt * 4);
    const rp = rl > 0 && this.reloadTotal > 0 ? Math.sin(Math.PI * Math.min(1, Math.max(0, 1 - rl / this.reloadTotal))) : 0;   // 0 -> 1 -> 0 during a reload
    const inp = this.localInput, moving = !!inp && (inp.mx !== 0 || inp.my !== 0) && !inp.crouch && !inp.prone;
    this.bobT += dt * (moving ? (inp?.sneak ? 5 : 9.5) : 1.6);          // the gun sways as you walk and breathes when you stand
    const bobAmp = (moving ? (inp?.sneak ? 0.25 : 0.7) : 0.12) * (1 - 0.7 * this.adsEase);
    const bx = Math.sin(this.bobT) * bobAmp, by = Math.abs(Math.cos(this.bobT)) * bobAmp * 0.8;
    this.recoilPitch *= Math.exp(-dt * 7);                              // the muzzle climbs with every shot and settles back
    g.position.set(10 - 7.5 * this.adsEase + bx, -11 + 3.2 * this.adsEase + this.kick * 0.8 - this.equipAnim * 9 - rp * 7 - by, -26 + this.kick * 4 + 4 * this.adsEase);
    g.rotation.set(this.kick * 0.06 - rp * 0.35, 0, rp * 0.5 + this.equipAnim * 0.4 + bx * 0.015);
  }

  /** My own shot (first-person): flash at the barrel, recoil and a casing thrown out to the right. */
  private onLocalShot(me: Snapshot['players'][number]) {
    const cat = WEAPONS[me.weapon]?.cat ?? 'Sidearm';
    const power: Record<string, number> = { Sidearm: 0.6, SMG: 0.35, Rifle: 0.55, LMG: 0.7, Shotgun: 1.2, Sniper: 1.6 };   // how hard each class kicks
    this.kick = Math.min(1.6, 0.6 + (power[cat] ?? 0.6) * 0.6);
    this.recoilPitch = Math.min(0.12, this.recoilPitch + (power[cat] ?? 0.6) * 0.016 * (1 - 0.35 * this.adsEase));
    if (!this.fpActive) { this.shake = Math.max(this.shake, (power[cat] ?? 0.6) * 0.12); return; }   // top-down: a tiny camera jolt instead
    this.flashT = 0.06;
    const c = this.camera; c.updateMatrixWorld(true);
    const pos = new THREE.Vector3(9, -6, -22).applyMatrix4(c.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(c.matrixWorld), up = new THREE.Vector3(0, 1, 0).transformDirection(c.matrixWorld), fwd = new THREE.Vector3(0, 0, -1).transformDirection(c.matrixWorld);
    this.spawnCasing(pos, right.multiplyScalar(26 + Math.random() * 14).add(up.multiplyScalar(20 + Math.random() * 14)).add(fwd.multiplyScalar(Math.random() * 8 - 6)), WEAPONS[me.weapon]?.cat ?? 'Sidearm');
  }

  /** A spent casing that flies out, bounces on the floor and fades. */
  private spawnCasing(pos: THREE.Vector3, vel: THREE.Vector3, cat: string) {
    let c = this.casings.find((q) => q.life <= 0);
    if (!c) {
      if (this.casings.length >= 28) return;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.casingMats.brass);
      this.scene.add(m);
      c = { m, v: new THREE.Vector3(), life: 0, spin: new THREE.Vector3() };
      this.casings.push(c);
    }
    const dims: Record<string, [number, number]> = { Sniper: [1.5, 5], Rifle: [1, 3.4], LMG: [1.1, 3.6], Shotgun: [1.8, 4.2], SMG: [0.8, 2.2], Sidearm: [0.8, 2] };
    const [w, l] = dims[cat] ?? [1, 3];
    c.m.material = cat === 'Shotgun' ? this.casingMats.shell : this.casingMats.brass;
    c.m.scale.set(l, w, w); c.m.position.copy(pos); c.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    c.v.copy(vel); c.life = 1.6; c.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30); c.m.visible = true;
  }
  /** The X on the aim cross when my bullet hits somebody (red and bigger for a kill), with a tick sound. */
  private hitMarker(kill: boolean) {
    const el = $('hitmark');
    const c = this.aimXY.x || window.innerWidth / 2, d = this.aimXY.y || window.innerHeight / 2;
    el.style.left = `${c}px`; el.style.top = `${d}px`;
    el.className = kill ? 'kill' : '';
    void el.offsetWidth;                                                  // restart the animation
    el.classList.add('show');
    sfx.hitTick(kill);
  }
  /** A red arc around the screen centre pointing at whoever shot me. a = the bullet's direction, so the shooter is the other way. */
  private damageArc(a: number) {
    const yaw = this.fpActive ? this.yaw : -Math.PI / 2;                  // "up" on the screen: where I look (first-person) or away from the camera (top-down)
    const el = document.createElement('div');
    el.className = 'dmgarc'; el.style.transform = `rotate(${(a + Math.PI - yaw).toFixed(3)}rad)`;
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1150);
  }
  private rings: { m: THREE.Mesh; age: number; max: number; r: number }[] = [];
  /** A shockwave ring that sweeps out over the ground from an explosion. */
  private spawnRing(x: number, y: number, z: number, r: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.setScalar(8); this.scene.add(m);
    this.rings.push({ m, age: 0, max: 0.4, r });
  }
  private updateRings(dt: number) {
    for (const g of this.rings) {
      g.age += dt; const k = Math.min(1, g.age / g.max);
      g.m.scale.setScalar(8 + (g.r - 8) * (1 - Math.pow(1 - k, 2)));
      (g.m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
    }
    this.rings = this.rings.filter((g) => { if (g.age < g.max) return true; this.scene.remove(g.m); g.m.geometry.dispose(); (g.m.material as THREE.Material).dispose(); return false; });
  }
  private updateCasings(dt: number) {
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.m.visible = false; continue; }
      c.v.y -= 720 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt; c.m.rotation.z += c.spin.z * dt;
      if (c.m.position.y < 0.6) { c.m.position.y = 0.6; c.v.y = Math.abs(c.v.y) > 40 ? -c.v.y * 0.3 : 0; c.v.x *= 0.55; c.v.z *= 0.55; c.spin.multiplyScalar(0.5); }
      if (c.life < 0.3) c.m.visible = ((c.life * 30) | 0) % 2 === 0;       // blink out
    }
  }
  private lockMouse() { if (this.fpActive && !isTouch && !document.pointerLockElement) { try { void (this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => undefined); } catch { /* the browser refused: the hint stays visible */ } } }

  togglePause(force?: boolean) {
    this.paused = force ?? !this.paused;
    $('pause').classList.toggle('on', this.paused);
    $('pausenote').textContent = this.sim ? 'The game is paused.' : 'The match keeps running for the other players while this menu is open.';
    if (this.paused) { keys.up = keys.down = keys.left = keys.right = keys.use = keys.crouch = keys.jump = false; mouse.down = false; }
  }
  /** Tidy up before returning to the menu: tell the server we are gone and release the microphone. */
  leave() {
    this.retries = 99;                           // do not auto-reconnect
    this.voice?.disable();
    try { this.ws?.close(); } catch { /* already closed */ }
  }
  /** Hold-to-talk key (push-to-talk mode). */
  talk(on: boolean) { this.voice?.setTalking(on); }

  togglePerf() { this.perfOn = !this.perfOn; $('perf').style.display = this.perfOn ? 'block' : 'none'; }

  /** Lower the graphics cost one step at a time when the frame rate stays low (never raises it again, to avoid flicker). */
  private applyQuality() {
    const q = this.quality;
    if (q >= 1) this.renderer.setPixelRatio(1);
    this.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isDirectionalLight) {
        if (q >= 3) l.castShadow = false;
        else if (q >= 2) { l.shadow.mapSize.set(1024, 1024); l.shadow.map?.dispose(); l.shadow.map = null; }
      }
    });
    if (q >= 3) {
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material; if (m) for (const mm of ([] as THREE.Material[]).concat(m)) mm.needsUpdate = true; });
    }
    this.resize();
  }

  /** Move the local player right away using the same movement code as the server, and drift back if it strays far from the server's copy. */
  private predict(dt: number, input: Input) {
    const me = this.me();
    if (!me) return;
    const walls = this.mapDef ? levelWalls(this.mapDef, me.lv) : undefined;      // the walls of the floor I am on
    const frozen = !me.alive || this.snap?.round?.phase === 'buy' || !walls;
    if (!this.pred || frozen) { this.pred = { x: me.x, y: me.y }; return; }
    const len = Math.hypot(input.mx, input.my), k = len > 1 ? 1 / len : 1;
    this.predCd -= dt; if (this.predAir > 0) this.predAir -= dt;          // same jump rules as the server
    if (input.jump && this.predAir <= 0 && this.predCd <= 0) { this.predAir = JUMP_TIME; this.predCd = JUMP_COOLDOWN; }
    const air = this.predAir > 0;
    const speed = PLAYER_SPEED * adsSpeed(WEAPONS[me.weapon]?.cat ?? '', !!input.scoped) * (air ? JUMP_SPEED : input.prone ? PRONE_SPEED : input.crouch ? CROUCH_SPEED : input.sneak ? SNEAK_SPEED : 1) * customMods(me.cu ?? 0).speed;
    movePlayer(this.pred, input.mx * k, input.my * k, dt, walls, speed, air);
    // The server's copy is a little behind (network delay + tick). Aim at where it will be by now, so the correction is
    // gentle while running and settles exactly onto the server position once the player stops.
    const lag = this.ws ? Math.min(0.25, this.pingMs / 2000 + 1 / TICK_RATE) : 1 / TICK_RATE;
    const moving = len > 0.05;
    const tx = me.x + input.mx * k * speed * lag, ty = me.y + input.my * k * speed * lag;
    const ex = tx - this.pred.x, ey = ty - this.pred.y;
    if (Math.hypot(ex, ey) > 140) { this.pred.x = tx; this.pred.y = ty; }            // far off (respawn, lag spike): snap
    else { const f = Math.min(1, dt * (moving ? 5 : 14)); this.pred.x += ex * f; this.pred.y += ey * f; }
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private readInput(): Input {
    const me = this.pred ?? this.shown.get(this.myId);
    const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stick.mx;
    const my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + stick.my;
    let angle = this.snap?.players.find((p) => p.id === this.myId)?.angle ?? 0;
    let fire = mouse.down;
    let wmx = mx, wmy = my;
    if (this.fpActive) {                               // first-person: the keys move me relative to where I am looking
      if (isTouch) this.yaw += stick.tx * 2.8 * this.fpDt;
      const fwd = (keys.up ? 1 : 0) - (keys.down ? 1 : 0) - stick.my, str = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stick.mx;
      wmx = fwd * Math.cos(this.yaw) - str * Math.sin(this.yaw);
      wmy = fwd * Math.sin(this.yaw) + str * Math.cos(this.yaw);
      angle = this.yaw; fire = isTouch ? stick.fireBtn : mouse.down;
    } else if (isTouch) {
      angle = stick.aimAngle; fire = stick.aiming;
    } else if (me) {
      const ndc = new THREE.Vector2((mouse.x / window.innerWidth) * 2 - 1, -(mouse.y / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      if (this.raycaster.ray.intersectPlane(this.aimPlane, this.tmp)) { angle = Math.atan2(this.tmp.z - me.y, this.tmp.x - me.x); this.aimPoint = { x: this.tmp.x, y: this.tmp.z }; }
    }
    const myP = this.me();
    const scoped = (mouse.right || keys.scope) && !!myP && myP.alive && this.snap?.round?.phase !== 'buy';   // right mouse: aim down the sights (any gun; a sniper gets the scope view)
    return { mx: wmx, my: wmy, angle, fire, weapon: this.pendingWeapon ?? undefined, use: keys.use, scoped, crouch: keys.crouch, jump: keys.jump || this.jumpPending, prone: keys.prone, sneak: keys.sneak, reload: keys.reload || this.reloadPending, item: this.pendingItem ?? undefined };
  }

  private fpDt = 0.016;
  private frame() {
    const now = performance.now();
    const delta = Math.min(now - this.last, 100);
    this.last = now;
    this.fpDt = delta / 1000;
    this.fpActive = this.fp && !this.replay && !!this.me()?.alive;

    const input = this.paused ? { mx: 0, my: 0, angle: this.snap?.players.find((p) => p.id === this.myId)?.angle ?? 0, fire: false } : this.readInput();
    this.localInput = input;
    this.predict(delta / 1000, input);
    this.monitor(delta);
    if (this.sim) {
      this.sim.setInput(this.myId, input);
      this.pendingWeapon = null; this.jumpPending = false; this.reloadPending = false; this.pendingItem = null;
      this.acc += (delta / 1000) * (QS.has('timescale') ? Number(QS.get('timescale')) : 1); // dev: ?timescale=40 fast-forwards single player
      const dt = 1 / TICK_RATE;
      while (this.acc >= dt) { if (!this.paused) this.sim.step(dt); this.acc -= dt; }
      this.snap = this.sim.snapshot();
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.pingAcc += delta;
      if (this.pingAcc >= 2000) { this.pingAcc = 0; this.ws.send(JSON.stringify({ type: 'ping', t: performance.now() })); }
      this.sendAcc += delta;
      if (this.sendAcc >= 1000 / TICK_RATE) {
        this.sendAcc = 0;
        this.ws.send(JSON.stringify({ type: 'input', input }));
        this.pendingWeapon = null; this.jumpPending = false; this.reloadPending = false; this.pendingItem = null;
      }
    }
    this.draw(delta / 1000, now / 1000);
    requestAnimationFrame(() => this.frame());
  }

  /** Frame-rate watchdog (drops graphics quality when slow) and the F3 overlay. */
  /** Show the SCOPE button only while holding a sniper, and TALK only when push-to-talk voice is on. */
  private touchUi() {
    const me = this.me();
    const sniper = !!me && me.alive && WEAPONS[me.weapon]?.cat === 'Sniper';
    $('tScope').classList.toggle('hide', !sniper);
    if (!sniper && keys.scope) { keys.scope = false; $('tScope').classList.remove('on'); }
    $('tTalk').classList.toggle('hide', !(this.voice && profile.options.voice === 'ptt' && this.voice.status === 'ready'));
  }

  private monitor(deltaMs: number) {
    if (isTouch) this.touchUi();
    if (this.voice) {
      this.voice.update();
      this.micAcc += deltaMs;
      if (this.micAcc > 150) {
        this.micAcc = 0;
        const v = this.voice, el = $('mic'), key = keyLabel(currentBinds().talk[0]);
        const text: Record<string, string> = { asking: 'Mic: allow access in the browser...', denied: 'Mic blocked: voice chat is off', unsupported: 'Voice chat needs https or localhost', off: '' };
        el.style.display = 'block';
        if (v.status !== 'ready') { el.textContent = text[v.status] ?? ''; el.className = 'bad'; }
        else {
          const mates = v.peers.size;
          el.className = v.live ? 'talk' : '';
          el.textContent = `${v.live ? '\u25CF TALKING' : profile.options.voice === 'open' ? 'Mic muted' : `Hold ${key} to talk`}  \u00b7  ${mates} teammate${mates === 1 ? '' : 's'} on voice`;
        }
      }
    }
    this.frameMs += (deltaMs - this.frameMs) * 0.05;
    if (!QS.has('noadapt')) {
      if (this.frameMs > 26) this.slowFor += deltaMs / 1000; else this.slowFor = Math.max(0, this.slowFor - deltaMs / 1000);
      if (this.slowFor > 3 && this.quality < 3) { this.quality++; this.slowFor = 0; this.applyQuality(); }
    }
    this.perfAcc += deltaMs;
    if (this.perfOn && this.perfAcc > 500) {
      this.perfAcc = 0;
      $('perf').textContent = `${Math.round(1000 / Math.max(1, this.frameMs))} fps   ${this.ws ? `ping ${Math.round(this.pingMs)} ms` : 'single player'}\nquality ${['full', 'lower resolution', 'smaller shadows', 'no shadows'][this.quality]}`;
    }
  }

  private draw(dt: number, time: number) {
    this.record(this.snap);
    this.updateRespawn();
    if (this.replay) this.advanceReplay(dt * 1000);
    const s = this.replay ? this.replay.snap : this.snap;
    if (s) this.updateScene(s, this.replay ? dt * this.replay.speed : dt, time);
    this.renderer.render(this.scene, this.camera);
    if (s) { this.updateLabels(s); this.updateMarkers(s); }
  }

  private updateScene(s: Snapshot, dt: number, time: number) {
    const smooth = 1 - Math.exp(-dt / 0.05);  // frame-rate independent; hides 30Hz snapshots for other players and bots
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let d = this.shown.get(p.id);
      const local = !this.replay && p.id === this.myId && !!this.pred && !!this.localInput && p.alive;
      if (!d || Math.hypot(d.x - p.x, d.y - p.y) > 200) d = { x: p.x, y: p.y, z: p.z, angle: p.angle, moved: 0, vx: 0, vy: 0 };
      const px = d.x, py = d.y;
      d.z += (p.z - d.z) * Math.min(1, smooth * 1.6);                      // climbing a stair ramp: the height follows the server's
      if (local) { // the local player is drawn where the player's own input put it, with no wait for the server
        d.x = this.pred!.x; d.y = this.pred!.y; d.angle = this.localInput!.angle;
      } else {
        d.x += (p.x - d.x) * smooth; d.y += (p.y - d.y) * smooth;
        let da = p.angle - d.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        d.angle += da * Math.min(1, dt * 20);
      }
      const inst = Math.hypot(d.x - px, d.y - py) / Math.max(dt, 1e-3);   // units/sec this frame
      d.moved += (inst - d.moved) * Math.min(1, dt * 12);                  // smoothed: sim ticks at 30Hz, frames at 60Hz
      const k = Math.min(1, dt * 12);
      d.vx += ((d.x - px) / Math.max(dt, 1e-3) - d.vx) * k;
      d.vy += ((d.y - py) / Math.max(dt, 1e-3) - d.vy) * k;
      if (QS.has('forcerun')) d.moved = 220;                               // dev: ?forcerun=1 shows the run animation
      this.shown.set(p.id, d);

      let c = this.chars.get(p.id);
      if (!c) {
        const teamColor = p.team === 'CT' ? 0x3f8cff : 0xd9822b;
        c = template ? makeModelCharacter(p.skin, teamColor) : makeCharacter(teamColor);
        this.chars.set(p.id, c);
        this.scene.add(c.root);
      }
      if (c.gunIdx !== p.weapon || c.gunCu !== p.cu) { // show the weapon this player currently holds, with its sights and finish
        c.gunHolder.clear();
        c.gunHolder.add(makeWeaponModel(p.weapon, p.cu));
        c.gunIdx = p.weapon; c.gunCu = p.cu; c.armGunIdx = -2;
      }
      if (c.death) { // falls down with the death animation and stays down until the player is alive again
        if (!p.alive && !c.dead) {
          c.dead = true;
          c.idle?.stop(); c.run?.stop();
          c.death.reset().setEffectiveWeight(1).play();
        } else if (p.alive && c.dead) {
          c.dead = false;
          c.death.stop();
          c.idle?.reset().play(); c.run?.reset().play();
        }
      }
      c.root.visible = (p.alive || !!c.dead) && !(this.fpActive && p.id === this.myId);   // no own body in first-person
      c.gunHolder.visible = p.alive;
      if (c.ring) c.ring.visible = p.alive;
      const posture = p.alive ? (p.st ?? 0) : 0;
      c.airT = posture === 2 ? (c.airT ?? 0) + dt : 0;
      const hop = posture === 2 ? Math.sin(Math.PI * Math.min(1, c.airT / JUMP_TIME)) * 34 : 0;   // the jump arc
      c.crouchK = (c.crouchK ?? 0) + ((posture === 1 ? 1 : 0) - (c.crouchK ?? 0)) * Math.min(1, dt * 12);
      c.proneK = (c.proneK ?? 0) + ((posture === 3 ? 1 : 0) - (c.proneK ?? 0)) * Math.min(1, dt * 7);
      c.root.position.set(d.x, hop + d.z, d.y);
      c.root.rotation.y = -d.angle;
      const speed = Math.min(1, d.moved / 220);
      if (c.dead && c.mixer) { c.mixer.update(dt); continue; }
      if (c.mixer) { // loaded model: blend between its idle and run animations
        if (c.walk) { // idle -> walk -> run, blended by speed (the old half-and-half idle/run mix looked like gliding)
          const a = smooth01(0.04, 0.16, speed), b = smooth01(0.26, 0.46, speed);
          c.idle?.setEffectiveWeight(1 - a); c.walk.setEffectiveWeight(a * (1 - b)); c.run?.setEffectiveWeight(a * b);
        } else {
          const w = Math.min(1, speed * 1.6);
          c.run?.setEffectiveWeight(w); c.idle?.setEffectiveWeight(1 - w);
        }
        // Turning: the legs always line up with the direction of travel. When moving toward the aim they run forward;
        // when moving away from it they backpedal (the run animation plays in reverse) facing the aim. The upper body
        // twists to face the aim. The local player uses the keys pressed (instant); other players use their velocity.
        const aim = d.angle;
        c.legYaw ??= aim;
        const li = this.localInput;
        const dirX = local && li ? li.mx : d.vx, dirY = local && li ? li.my : d.vy;
        const travelling = local && li ? Math.hypot(li.mx, li.my) > 0.05 && d.moved > 20 : d.moved > 40;
        let target = c.legYaw;
        if (travelling) {
          const md = Math.atan2(dirY, dirX);
          const away = Math.abs(wrapAngle(aim - md));
          c.backward = c.backward ? away > 1.66 : away > 1.83;   // hysteresis around 95 / 105 degrees, so it does not flicker
          target = c.backward ? md + Math.PI : md;
        } else {
          c.backward = false;
          const diff = wrapAngle(aim - c.legYaw);
          if (Math.abs(diff) > MAX_TWIST) target = aim - Math.sign(diff) * MAX_TWIST * 0.5; // feet shuffle round once the torso is twisted too far
        }
        const step = TURN_RATE * dt;
        c.legYaw += Math.max(-step, Math.min(step, wrapAngle(target - c.legYaw) * Math.min(1, dt * 14)));
        const twist = Math.max(-MAX_TWIST - 0.2, Math.min(MAX_TWIST + 0.2, wrapAngle(aim - c.legYaw)));
        const dir = c.backward ? -1 : 1;
        if (c.walk && c.run) {                                  // play each clip at the speed where the planted foot stays put on the ground
          c.walk.timeScale = dir * Math.max(0.35, Math.min(2.2, d.moved / (c.strideWalk ?? 55)));
          c.run.timeScale = dir * Math.max(0.5, Math.min(2.6, d.moved / (c.strideRun ?? 110)));
          const b = smooth01(0.26, 0.46, speed);
          if (b > 0.02 && b < 0.98) c.run.time = (c.walk.time / c.walk.getClip().duration) * c.run.getClip().duration; // keep the two strides in step while they blend
        } else if (c.run) c.run.timeScale = dir * ((c.runBase ?? 0.6) + speed * (c.runGain ?? 0.8));
        if (c.holder) c.holder.rotation.y = MODEL_YAW + twist; // lower body faces c.legYaw, root faces the aim
        c.mixer.update(dt);
        for (const tb of c.twistBones ?? []) tb.bone.rotateOnAxis(AXIS_Y, TWIST_SIGN * twist * tb.k); // after the animation pose is applied
        applyKneel(c, (c.crouchK ?? 0) * (1 - 0.4 * Math.min(1, speed * 2.5)));   // less folded while creeping along
        applyProne(c, c.proneK ?? 0);
        applyArmIK(c);                                                              // hands on the weapon, whatever the body is doing
      } else {
        c.phase += dt * 11 * speed;
        const swing = Math.sin(c.phase) * 0.8 * speed;
        c.legL.rotation.z = swing; c.legR.rotation.z = -swing;
        c.root.position.y = hop + Math.abs(Math.sin(c.phase)) * 1.5 * speed;
        applyKneel(c, c.crouchK ?? 0);
      }
    }
    for (const [id, c] of this.chars) {
      if (seen.has(id)) continue;
      this.scene.remove(c.root); this.chars.delete(id); this.shown.delete(id);
      this.labels.get(id)?.remove(); this.labels.delete(id);
    }

    // bullets
    const n = Math.min(s.bullets.length, 600);
    for (let i = 0; i < n; i++) {
      const b = s.bullets[i], st = tracerStyle(b.w);
      this.dummy.position.set(b.x - Math.cos(b.a) * st.len / 2, AIM_HEIGHT + b.z, b.y - Math.sin(b.a) * st.len / 2); // the head of the tracer is at the bullet
      this.dummy.rotation.set(0, -b.a, 0);
      this.dummy.scale.set(st.len, st.th, st.th);
      this.dummy.updateMatrix();
      this.bullets.setMatrixAt(i, this.dummy.matrix);
      this.bullets.setColorAt(i, st.color);
    }
    this.bullets.count = n;
    this.bullets.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;
    this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(1, 1, 1);
    this.fxEvents(s, dt);

    // pickups
    const live = new Set(s.pickups.map((k) => k.id));
    for (const k of s.pickups) {
      let m = this.pickupMeshes.get(k.id);
      if (!m) { m = k.kind === 'cash' ? makeCash() : makePickup(); this.pickupMeshes.set(k.id, m); this.scene.add(m); }
      m.position.set(k.x, (k.kind === 'cash' ? 8 : 22) + Math.sin(time * 2 + k.id) * 3, k.y);
      m.rotation.y = time * 1.5;
    }
    for (const [id, m] of this.pickupMeshes) if (!live.has(id)) { this.scene.remove(m); this.pickupMeshes.delete(id); }

    // camera follows the player from an angled third-person view
    const meP = s.players.find((q) => q.id === this.myId);
    let camId = this.myId;
    if (this.replay) {
      camId = this.replay.killer;                       // the kill cam follows whoever got the kill
    } else if (meP && !meP.alive) {                     // spectate a living teammate (or anyone, if none are left)
      camId = this.pickSpectate(s) ?? camId;
    }
    const me = this.shown.get(camId);
    // sniper scope: zoom in with an ease, and look toward where the player aims
    const wantScope = !!this.localInput?.scoped && camId === this.myId && !this.replay;
    this.scopeT += ((wantScope ? 1 : 0) - this.scopeT) * Math.min(1, dt * 9);
    if (Math.abs(this.scopeT - (wantScope ? 1 : 0)) < 0.002) this.scopeT = wantScope ? 1 : 0;
    if (wantScope !== this.wasScoped) { sfx.scope(wantScope); this.wasScoped = wantScope; }
    const eased = this.scopeT * this.scopeT * (3 - 2 * this.scopeT);
    const camP = s.players.find((q) => q.id === camId);
    const sniperGun = WEAPONS[camP?.weapon ?? 0]?.cat === 'Sniper';
    const ease = sniperGun ? eased : 0;                                // the scope overlay and look-ahead camera are for snipers only
    this.adsEase = sniperGun ? 0 : eased;                              // other guns: a lighter zoom, the gun slides to the centre
    const fov = this.fpActive ? 78 - 48 * ease - 14 * this.adsEase : 45 - 25 * ease - 7 * this.adsEase;
    const near = this.fpActive ? 3 : 10;
    if (this.camera.near !== near) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const sc = $('scope');
    sc.style.opacity = String(Math.min(1, ease * 1.4));
    sc.style.transform = `scale(${(1.5 - 0.5 * ease).toFixed(3)})`;
    this.renderer.domElement.style.cursor = ease > 0.4 ? 'none' : '';
    if (me) {
      if (camId === this.myId) this.camTarget.set(me.x + (this.aimPoint.x - me.x) * 0.5 * ease, me.z, me.y + (this.aimPoint.y - me.y) * 0.5 * ease); // rigid follow: a lagging camera would move the aim point while running
      else this.camTarget.lerp(this.tmp.set(me.x, me.z, me.y), Math.min(1, dt * 8));
    }

    this.syncObjectives(s, time);
    this.syncItems(s, time, dt);
    this.updateUpperFloors(s, camId);
    // bomb: on the carrier's back, dropped on the floor, or armed at the site
    const bomb = s.round?.bomb;
    this.bombMesh.visible = !!bomb && bomb.status !== 'none';
    if (bomb && this.bombMesh.visible) {
      const car = bomb.carrier ? this.shown.get(bomb.carrier) : undefined;
      if (bomb.status === 'carried' && car) this.bombMesh.position.set(car.x - Math.cos(car.angle) * 12, 38 + car.z, car.y - Math.sin(car.angle) * 12);
      else this.bombMesh.position.set(bomb.x, 5 + (bomb.lv ?? 0) * FLOOR_H, bomb.y);
      const blink = bomb.status === 'planted' ? 0.4 + 0.6 * Math.abs(Math.sin(time * (bomb.fuse < 10 ? 10 : 4))) : 0.3;
      (this.bombMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = blink * 2;
    }
    const zoom = QS.has('zoom') ? Number(QS.get('zoom')) : 1;
    const mePl = s.players.find((q) => q.id === this.myId);
    const fpNow = this.fpActive && camId === this.myId && !!me;
    this.updateViewGun(mePl?.weapon, mePl?.cu ?? 0, fpNow && ease < 0.6, dt, mePl?.rl ?? 0);
    $('fphint').style.display = fpNow && !isTouch && !document.pointerLockElement && !this.paused ? 'block' : 'none';
    if (fpNow && me) {
      const ch = this.chars.get(this.myId);
      const eye = 52 - 20 * (ch?.crouchK ?? 0) - 38 * (ch?.proneK ?? 0) + (ch?.root.position.y ?? 0);   // eye height: lower when kneeling, higher in a jump
      this.camera.position.set(me.x, eye, me.y);
      const cp = Math.cos(this.pitch);
      const cpt = Math.min(1.3, this.pitch + this.recoilPitch), cq = Math.cos(cpt);
      this.camera.lookAt(me.x + Math.cos(this.yaw) * 100 * cq, eye + Math.sin(cpt) * 100, me.y + Math.sin(this.yaw) * 100 * cq);
    } else if (QS.has('top')) { // dev: straight-down camera, handy for checking which way characters face
      this.camera.position.set(this.camTarget.x, 640 * zoom + this.camTarget.y, this.camTarget.z + 0.01);
      this.camera.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z);
    } else {
      this.camera.position.set(this.camTarget.x, 560 * zoom + this.camTarget.y, this.camTarget.z + 430 * zoom);
      this.camera.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z + 10);
    }
    if (this.shake > 0.02) {                                           // explosion shake
      this.camera.position.x += (Math.random() - 0.5) * 9 * this.shake; this.camera.position.y += (Math.random() - 0.5) * 6 * this.shake; this.camera.position.z += (Math.random() - 0.5) * 9 * this.shake;
      this.shake *= Math.exp(-dt * 5);
    } else this.shake = 0;
    this.updateAim(mePl, fpNow, ease, camId === this.myId && !this.replay, dt);
  }

  // ---------- weapon aim marker: a cross whose gap is the real bullet spread (same rules as the server's shot code) ----------
  private aimGap = 8;
  private aimXY = { x: 0, y: 0 };                         // where the aim cross is on screen (hit markers appear there)
  private updateAim(me: PlayerState | undefined, fpNow: boolean, ease: number, mine: boolean, dt: number) {
    const xh = $('xhair'), line = $('aimline');
    const live = !!me?.alive && mine && !this.paused && ease < 0.3 && !(isTouch && !fpNow);
    if (!live || !me) { xh.style.display = 'none'; line.style.display = 'none'; return; }
    const w = WEAPONS[me.weapon], input = this.localInput;
    const base = w.cat === 'Sniper' ? (input?.scoped ? 0 : 0.09) : w.spread;
    const spread = base * customMods(me.cu ?? 0).spread * (me.st === 3 ? 0.35 : me.st === 1 ? 0.55 : me.st === 2 ? 1.8 : input?.sneak ? 0.8 : 1) * (w.cat !== 'Sniper' && input?.scoped ? ADS_SPREAD : 1);
    const moving = !!input && (input.mx !== 0 || input.my !== 0) && me.st !== 2;
    const eff = spread * (moving ? 1.25 : 1);                          // running blurs the aim a little more on screen
    const H = window.innerHeight;
    let px: number, cx = window.innerWidth / 2, cy = H / 2;
    if (fpNow) {
      px = Math.tan(eff) * (H / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    } else {                                                           // top-down: sit on the ground point under the mouse, sized for that distance
      const p = this.tmp.set(this.aimPoint.x, 0, this.aimPoint.y).project(this.camera);
      cx = (p.x + 1) / 2 * window.innerWidth; cy = (1 - p.y) / 2 * H;
      const d = this.camera.position.distanceTo(this.tmp.set(this.aimPoint.x, 0, this.aimPoint.y));
      const mine2 = this.shown.get(this.myId);
      const dist = mine2 ? Math.hypot(this.aimPoint.x - mine2.x, this.aimPoint.y - mine2.y) : 200;
      px = Math.tan(eff) * Math.max(dist, 60) * (H / 2) / (d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
      if (mine2) {                                                     // faint aim line from the soldier to the marker
        const q = this.tmp.set(mine2.x, 18 + mine2.z, mine2.y).project(this.camera);
        const sx = (q.x + 1) / 2 * window.innerWidth, sy = (1 - q.y) / 2 * H;
        line.style.display = 'block'; line.style.width = `${Math.hypot(cx - sx, cy - sy)}px`;
        line.style.transform = `translate(${sx}px, ${sy}px) rotate(${Math.atan2(cy - sy, cx - sx)}rad)`;
      }
    }
    this.aimGap += (Math.min(70, Math.max(3, px)) - this.aimGap) * Math.min(1, dt * 14);   // eased, so it breathes with your movement
    xh.style.display = 'block';
    xh.style.left = `${cx}px`; xh.style.top = `${cy}px`; this.aimXY = { x: cx, y: cy };
    xh.style.setProperty('--g', `${this.aimGap.toFixed(1)}px`);
    xh.classList.toggle('empty', me.am === 0 && me.rl === 0);        // red: the magazine is empty
    xh.classList.toggle('rl', (me.rl ?? 0) > 0);                       // amber: reloading
    if (!fpNow) this.renderer.domElement.style.cursor = 'none';
  }

  // ---------- mission objectives: hostages, intel cases and the markers that point at them ----------
  private objects = new Map<string, THREE.Object3D>();
  private markers = new Map<string, HTMLElement>();
  private beamMat(color: number) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }); }
  private makeHostage(): THREE.Object3D {
    const c = makeCharacter(0xe9e2cf), g = new THREE.Group();
    c.root.scale.set(1, 0.85, 1); g.add(c.root);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 170, 10, 1, true), this.beamMat(0x66ffaa)); beam.position.y = 85; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(16, 22, 28), new THREE.MeshBasicMaterial({ color: 0x66ffaa, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 1; g.add(ring);
    g.userData.beam = beam;
    return g;
  }
  private makeCase(): THREE.Object3D {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(13, 8, 5), new THREE.MeshStandardMaterial({ color: 0xff9a2e, emissive: 0xff6a00, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.4 }));
    box.castShadow = true; g.add(box);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 1.6), new THREE.MeshStandardMaterial({ color: 0x222222 })); handle.position.y = 5; g.add(handle);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 150, 8, 1, true), this.beamMat(0xffb15e)); beam.position.y = 70; g.add(beam);
    g.userData.box = box;
    return g;
  }
  private static OWNER_COLOR: Record<string, number> = { none: 0xffffff, T: 0xe08a2c, CT: 0x3f8cff, contested: 0xff4040 };
  private makePoint(r: number): THREE.Object3D {
    const g = new THREE.Group(), mats: THREE.MeshBasicMaterial[] = [];
    const mk = (geo: THREE.BufferGeometry, op: number, y: number, rotX = true, add = false) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
      const o = new THREE.Mesh(geo, m); if (rotX) o.rotation.x = -Math.PI / 2; o.position.y = y; g.add(o); mats.push(m); return o;
    };
    mk(new THREE.CircleGeometry(r, 56), 0.16, 1.4);
    mk(new THREE.RingGeometry(r - 7, r, 64), 0.85, 1.8);
    mk(new THREE.CylinderGeometry(r, r, 230, 40, 1, true), 0.14, 115, false, true);
    g.userData.mats = mats;
    return g;
  }
  private makeFlag(color: number): THREE.Object3D {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 64, 8), new THREE.MeshStandardMaterial({ color: 0xcfd6df, metalness: 0.6, roughness: 0.4 })); pole.position.y = 32; pole.castShadow = true; g.add(pole);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(26, 15, 1.2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.7 })); cloth.position.set(14, 54, 0); cloth.castShadow = true; g.add(cloth);
    const ring = new THREE.Mesh(new THREE.RingGeometry(14, 20, 28), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 1; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 190, 8, 1, true), this.beamMat(color)); beam.position.y = 95; g.add(beam);
    g.userData.cloth = cloth; g.userData.ring = ring;
    return g;
  }
  private syncObjectives(s: Snapshot, time: number) {
    const r = s.round, want = new Set<string>();
    if (r && !this.replay) {
      for (const h of r.hostages) {
        const k = `h${h.id}`; want.add(k);
        let o = this.objects.get(k); if (!o) { o = this.makeHostage(); this.objects.set(k, o); this.scene.add(o); }
        o.position.set(h.x, 0, h.y); (o.userData.beam as THREE.Object3D).visible = !h.carried;
      }
      if (r.cp) {
        want.add('cp');
        let o = this.objects.get('cp'); if (!o) { o = this.makePoint(r.cp.r); this.objects.set('cp', o); this.scene.add(o); }
        o.position.set(r.cp.x, 0, r.cp.y);
        const col = new THREE.Color(Game.OWNER_COLOR[r.cp.owner] ?? 0xffffff);
        for (const m of o.userData.mats as THREE.MeshBasicMaterial[]) m.color.copy(col);
      }
      if (r.mode === 'vip' && r.vip) {
        const e = r.extract, k = 'vex'; want.add(k);
        let o = this.objects.get(k); if (!o) { o = this.makePoint(Math.max(e.w, e.h) / 2); this.objects.set(k, o); this.scene.add(o); for (const m of o.userData.mats as THREE.MeshBasicMaterial[]) m.color.setHex(0x3ddc84); }
        o.position.set(e.x + e.w / 2, 0, e.y + e.h / 2);
        const v = s.players.find((q) => q.id === r.vip);
        if (v && v.alive) {
          let b = this.objects.get('vipb');
          if (!b) { b = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 210, 8, 1, true), this.beamMat(0xffd24a)); this.objects.set('vipb', b); this.scene.add(b); }
          b.position.set(v.x, 105 + v.z, v.y); want.add('vipb');
        }
      }
      for (const f of r.flags) {
        const k = `f${f.team}`; want.add(k);
        let o = this.objects.get(k); if (!o) { o = this.makeFlag(f.team === 'T' ? 0xe08a2c : 0x3f8cff); this.objects.set(k, o); this.scene.add(o); }
        o.position.set(f.x, f.carried ? 30 : 0, f.y);
        (o.userData.cloth as THREE.Object3D).rotation.y = Math.sin(time * 4 + (f.team === 'T' ? 0 : 2)) * 0.35;
        (o.userData.ring as THREE.Object3D).visible = !f.carried;
      }
      for (const it of r.items) {
        const k = `i${it.id}`; want.add(k);
        let o = this.objects.get(k); if (!o) { o = this.makeCase(); this.objects.set(k, o); this.scene.add(o); }
        o.position.set(it.x, 8 + Math.sin(time * 3 + it.id) * 2, it.y); (o.userData.box as THREE.Object3D).rotation.y = time * 1.6 + it.id;
      }
    }
    for (const [k, o] of this.objects) if (!want.has(k)) { this.scene.remove(o); this.objects.delete(k); }
  }
  /** Screen markers with distances (clamped to the screen edge when the target is off screen or behind you). */
  private updateMarkers(s: Snapshot) {
    const r = s.round, me = s.players.find((p) => p.id === this.myId);
    const list: { key: string; x: number; y: number; text: string; cls: string }[] = [];
    if (r && me && me.alive && (r.phase === 'live' || r.phase === 'buy') && !this.replay) {
      if (r.mode === 'rescue') {
        for (const h of r.hostages) if (!h.carried) list.push({ key: `h${h.id}`, x: h.x, y: h.y, text: 'HOSTAGE', cls: 'host' });
        if (r.hostages.some((h) => h.by === this.myId)) list.push({ key: 'ex', x: r.extract.x + r.extract.w / 2, y: r.extract.y + r.extract.h / 2, text: 'EXTRACTION', cls: 'ext' });
      } else if (r.mode === 'vip' && r.vip) {
        const v = s.players.find((q) => q.id === r.vip);
        if (v && v.id !== me.id && v.alive) list.push({ key: 'vip', x: v.x, y: v.y, text: me.team === 'CT' ? 'YOUR VIP' : 'VIP', cls: 'vip' });
        if (me.team === 'CT') list.push({ key: 'ex', x: r.extract.x + r.extract.w / 2, y: r.extract.y + r.extract.h / 2, text: 'EXTRACTION', cls: 'ext' });
      } else if (r.mode === 'point' && r.cp) {
        list.push({ key: 'cp', x: r.cp.x, y: r.cp.y, text: 'ZONE', cls: 'ext' });
      } else if (r.mode === 'flag') {
        const mine = r.flags.find((f) => f.team === me.team), theirs = r.flags.find((f) => f.team !== me.team);
        if (theirs && theirs.by !== this.myId) list.push({ key: 'ef', x: theirs.x, y: theirs.y, text: theirs.carried ? 'OUR CARRIER' : 'ENEMY FLAG', cls: 'item' });
        if (theirs?.by === this.myId && mine) list.push({ key: 'home', x: mine.hx, y: mine.hy, text: 'YOUR BASE', cls: 'ext' });
        if (mine && !mine.home) list.push({ key: 'mf', x: mine.x, y: mine.y, text: mine.carried ? 'KILL THE CARRIER' : 'YOUR FLAG', cls: 'host' });
        else if (mine && !theirs?.carried) list.push({ key: 'mh', x: mine.hx, y: mine.hy, text: 'YOUR FLAG', cls: 'host' });
      } else if (r.mode === 'collect') {
        [...r.items].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y)).slice(0, 4)
          .forEach((it) => list.push({ key: `i${it.id}`, x: it.x, y: it.y, text: 'INTEL', cls: 'item' }));
      }
    }
    const w = window.innerWidth, h = window.innerHeight, seen = new Set<string>();
    for (const m of list) {
      seen.add(m.key);
      let el = this.markers.get(m.key);
      if (!el) { el = document.createElement('div'); el.className = `mk ${m.cls}`; this.labelLayer.appendChild(el); this.markers.set(m.key, el); }
      el.textContent = `${m.text}  ${Math.round(Math.hypot(m.x - me!.x, m.y - me!.y) / 30)} m`;
      this.tmp.set(m.x, 70, m.y).project(this.camera);
      let nx = this.tmp.x, ny = this.tmp.y;
      if (this.tmp.z > 1) { nx = -nx; ny = -ny; }                                   // behind the camera: flip so it points the right way round
      nx = Math.max(-0.85, Math.min(0.76, nx)); ny = Math.max(-0.6, Math.min(0.72, ny));   // keep clear of the ammo counter (bottom right) and the top bar
      el.style.transform = `translate(${(nx * 0.5 + 0.5) * w}px, ${(-ny * 0.5 + 0.5) * h}px) translate(-50%, -50%)`;
      el.style.display = 'block';
    }
    for (const [k, el] of this.markers) if (!seen.has(k)) { el.remove(); this.markers.delete(k); }
  }

  // ---------- items: supply boxes, grenades in flight, smoke and fire clouds, explosions, and the item bar ----------
  private supplyMeshes = new Map<number, THREE.Object3D>();
  private grenadeMeshes = new Map<number, THREE.Object3D>();
  private zoneSprites = new Map<number, THREE.Sprite[]>();
  private lastBlast = -1;
  private lastGrenades = new Set<number>();
  private smokeTex: THREE.CanvasTexture | null = null;
  private itemColor = [0xf2f2f2, 0xf2f2f2, 0xffd34d, 0x3f7f3f, 0x9aa3ad, 0xf5e04a, 0xe8772e, 0xe85a5a, 0xcfeccf, 0x3fa3d9];
  private makeSupply(k: number): THREE.Object3D {
    const g = new THREE.Group(), d = ITEMS[k], c = this.itemColor[k];
    const body = d.kind === 'heal'
      ? new THREE.Mesh(new THREE.BoxGeometry(11, 8, 8), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }))
      : new THREE.Mesh(k === 6 ? new THREE.CylinderGeometry(3.2, 3.2, 11, 10) : new THREE.SphereGeometry(5.2, 12, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }));
    body.castShadow = true; g.add(body);
    if (d.kind === 'heal') { const cross = new THREE.MeshBasicMaterial({ color: k === 2 ? 0xffb400 : 0xd62d2d }); const a = new THREE.Mesh(new THREE.BoxGeometry(6, 8.2, 2), cross), b = new THREE.Mesh(new THREE.BoxGeometry(2, 8.2, 6), cross); g.add(a, b); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 90, 8, 1, true), this.beamMat(d.kind === 'heal' ? 0x66ff99 : 0xffb15e)); beam.position.y = 45; g.add(beam);
    g.userData.body = body;
    return g;
  }
  private smokePuff(): THREE.CanvasTexture {
    if (!this.smokeTex) this.smokeTex = glowTexture('rgba(190,196,204,0.95)', 'rgba(150,156,164,0)');
    return this.smokeTex;
  }
  private syncItems(s: Snapshot, time: number, dt: number) {
    const live = new Set<number>();
    for (const sp of s.supplies) {                                       // supply boxes on the floor
      live.add(sp.id);
      let o = this.supplyMeshes.get(sp.id);
      if (!o || o.userData.item !== sp.item) { if (o) this.scene.remove(o); o = this.makeSupply(sp.item); o.userData.item = sp.item; this.supplyMeshes.set(sp.id, o); this.scene.add(o); }
      o.position.set(sp.x, 9 + Math.sin(time * 2.4 + sp.id) * 2, sp.y); (o.userData.body as THREE.Object3D).rotation.y = time * 1.2 + sp.id;
    }
    for (const [id, o] of this.supplyMeshes) if (!live.has(id)) { this.scene.remove(o); this.supplyMeshes.delete(id); }

    const gl = new Set<number>();                                        // grenades in flight
    for (const g of s.grenades) {
      gl.add(g.id);
      let o = this.grenadeMeshes.get(g.id);
      if (!o) {
        o = new THREE.Mesh(g.k === 6 ? new THREE.CylinderGeometry(2.6, 2.6, 8, 8) : new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshStandardMaterial({ color: this.itemColor[g.k], roughness: 0.5 }));
        (o as THREE.Mesh).castShadow = true; this.grenadeMeshes.set(g.id, o); this.scene.add(o);
        if (!this.lastGrenades.has(g.id)) sfx.throwGrenade();
      }
      o.position.set(g.x, 10 + g.lv * FLOOR_H + Math.abs(Math.sin(time * 9 + g.id)) * 3, g.y); o.rotation.x = time * 10;
    }
    for (const [id, o] of this.grenadeMeshes) if (!gl.has(id)) { this.scene.remove(o); this.grenadeMeshes.delete(id); }
    this.lastGrenades = gl;

    const zl = new Set<number>();                                        // smoke and fire clouds
    for (const z of s.zones) {
      zl.add(z.id);
      let sprites = this.zoneSprites.get(z.id);
      if (!sprites) {
        sprites = [];
        const n = z.k === 'smoke' ? 16 : 12;
        for (let i = 0; i < n; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial(z.k === 'smoke'
            ? { map: this.smokePuff(), transparent: true, depthWrite: false, opacity: 0.85 }
            : { map: glowTexture('rgba(255,210,90,1)', 'rgba(220,60,10,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          sp.userData.a = (i / n) * Math.PI * 2; sp.userData.rr = Math.random(); sp.userData.ph = Math.random() * 6;
          this.scene.add(sp); sprites.push(sp);
        }
        this.zoneSprites.set(z.id, sprites);
      }
      const fade = Math.min(1, z.left / 1.5);
      for (const sp of sprites) {
        const a = sp.userData.a + time * (z.k === 'smoke' ? 0.12 : 0.6), rr = z.r * (0.25 + 0.65 * sp.userData.rr);
        if (z.k === 'smoke') { sp.position.set(z.x + Math.cos(a) * rr, z.lv * FLOOR_H + 28 + Math.sin(time * 0.8 + sp.userData.ph) * 8 + sp.userData.rr * 26, z.y + Math.sin(a) * rr); sp.scale.setScalar(z.r * 0.95); (sp.material as THREE.SpriteMaterial).opacity = 0.82 * fade; }
        else { sp.position.set(z.x + Math.cos(a) * rr, z.lv * FLOOR_H + 8 + ((time * 40 + sp.userData.ph * 20) % 34), z.y + Math.sin(a) * rr); sp.scale.setScalar(26 + Math.sin(time * 14 + sp.userData.ph) * 6); (sp.material as THREE.SpriteMaterial).opacity = 0.9 * fade; }
      }
    }
    for (const [id, sprites] of this.zoneSprites) if (!zl.has(id)) { for (const sp of sprites) { this.scene.remove(sp); sp.material.dispose(); } this.zoneSprites.delete(id); }

    const me = s.players.find((p) => p.id === this.myId);              // explosions: flash, sound and a screen shake near the blast
    let maxB = this.lastBlast;
    if (this.lastBlast < 0) this.lastBlast = Math.max(0, ...s.blasts.map((b) => b.id));
    for (const b of s.blasts) {
      maxB = Math.max(maxB, b.id);
      if (b.id <= this.lastBlast) continue;
      const d = me ? Math.hypot(b.x - me.x, b.y - me.y) : 999, vol = Math.max(0, 1 - d / 1100), pan = me ? (b.x - me.x) / 500 : 0;
      const id = ITEMS[b.k].id;
      if (id === 'frag' || id === 'impact') {
        sfx.frag(vol, pan);
        this.spawnRing(b.x, 3 + b.lv * FLOOR_H, b.y, FRAG_R * 1.25);
        this.spawnFx('flash', b.x, b.y, 26 + b.lv * FLOOR_H, 0, 0, 0, 0.16, 150);
        for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 190; this.spawnFx('spark', b.x, b.y, 22, Math.cos(a) * sp, 60 + Math.random() * 140, Math.sin(a) * sp, 0.45, 6, -380); }
        for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2; this.spawnFx('dust', b.x + Math.cos(a) * 14, b.y + Math.sin(a) * 14, 20, Math.cos(a) * 30, 24, Math.sin(a) * 30, 0.9, 38); }
        if (d < 380) this.shake = Math.max(this.shake, 1 - d / 380);
      } else if (id === 'flash') { sfx.bang(vol, pan); this.spawnFx('flash', b.x, b.y, 30, 0, 0, 0, 0.3, 230); }
      else if (id === 'smoke') sfx.hiss(vol, pan);
      else sfx.whoomph(vol, pan);
    }
    this.lastBlast = maxB;
    if (me && me.bl > 0 && me.alive) { const f = $('flashfx'); f.style.opacity = String(Math.min(1, me.bl * 0.7)); } else $('flashfx').style.opacity = '0';   // blinded: the screen whites out and fades

    // item bar (owned items, with the key to press) and the "using" progress
    const bar = $('items');
    if (me && me.alive) {
      const key = me.iv.join(',') + `|${me.us}|${me.bo}`;
      if (key !== this.itemBarKey) {
        this.itemBarKey = key;
        bar.innerHTML = ITEMS.map((d, k) => me.iv[k] > 0 ? `<button data-k="${k}" class="${me.us === k ? 'use' : ''}${k === 2 && me.bo ? ' boost' : ''}"><b>${keyLabel(currentBinds()['item' + k]?.[0] ?? '')}</b>${esc(d.name.split(' ')[0])} x${me.iv[k]}</button>` : '').join('');
        bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.useItem(Number((b as HTMLElement).dataset.k))));
      }
      bar.style.display = 'flex';
    } else bar.style.display = 'none';
    const ub = $('usebar');
    if (me && me.alive && me.us >= 0) {
      ub.style.display = 'block';
      $('usetxt').textContent = `USING ${ITEMS[me.us].name.toUpperCase()}`;
      ($('usebar').querySelector('i') as HTMLElement).style.width = `${Math.max(0, Math.min(1, 1 - me.ul / ITEMS[me.us].use)) * 100}%`;
    } else ub.style.display = 'none';
    void dt; void SMOKE_R;
  }
  private itemBarKey = '';
  private shake = 0;

  private updateLabels(s: Snapshot) {
    const w = window.innerWidth, h = window.innerHeight;
    for (const p of s.players) {
      let el = this.labels.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `lbl ${p.team === 'CT' ? 'ct' : 't'}`;
        el.innerHTML = '<span></span><i><b></b></i>';
        el.querySelector('span')!.textContent = p.name;
        this.labelLayer.appendChild(el);
        this.labels.set(p.id, el);
      }
      const d = this.shown.get(p.id);
      el.classList.toggle('speaking', p.id === this.myId ? (this.voice?.micLevel ?? 0) > 0.035 : !!this.voice?.isSpeaking(p.id));
      if (!p.alive || !d) { el.style.display = 'none'; continue; }
      this.tmp.set(d.x, 78 + d.z, d.y).project(this.camera);
      if (this.tmp.z > 1 || (this.fpActive && p.id === this.myId)) { el.style.display = 'none'; continue; }   // behind the camera / my own tag in first-person
      el.style.display = 'block';
      el.style.transform = `translate(${(this.tmp.x * 0.5 + 0.5) * w}px, ${(-this.tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      (el.querySelector('b') as HTMLElement).style.width = `${(p.hp / MAX_HP) * 100}%`;
    }

    if (s.round && !this.replay) { this.updateHud(s); this.audioEvents(s, performance.now() / 1000); this.trackProfile(s); this.lootEvents(s); this.killEvents(s); this.updateSpectate(s); }
  }

  // ---------- kill cam and spectating ----------
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
  /** "RESPAWN IN 5": the countdown while I am down (unlimited lives), and the end of the kill cam when I am back. */
  private respawnWas = false;
  private updateRespawn() {
    const me = this.snap?.players.find((p) => p.id === this.myId);
    const el = $('respawn');
    if (!me || !this.snap?.round) { el.style.display = 'none'; return; }
    if (me.alive) {
      if (this.respawnWas) { keys.prone = false; }
      if (this.respawnWas) { this.respawnWas = false; this.toast('BACK IN THE FIGHT'); }
      if (this.replay) this.endReplay();                       // the kill cam stops when I am alive again
      el.style.display = 'none';
      return;
    }
    this.respawnWas = true;
    const live = this.snap.round.phase === 'live';
    el.style.display = 'block';
    el.innerHTML = live ? `<span>YOU ARE DOWN</span><b>${Math.max(0, Math.ceil(me.rs))}</b><span>RESPAWNING</span>` : `<span>YOU ARE DOWN</span><b>&middot;</b><span>BACK NEXT ROUND</span>`;
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

  private spawnFx(kind: 'flash' | 'spark' | 'blood' | 'dust', x: number, z: number, y: number, vx: number, vy: number, vz: number, life: number, size: number, grav = 0) {
    if (!this.fxMat) {
      const mk = (map: THREE.Texture, additive: boolean) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      this.fxMat = {
        flash: mk(glowTexture('rgba(255,244,200,1)', 'rgba(255,150,30,0)'), true), spark: mk(glowTexture('rgba(255,235,160,1)', 'rgba(255,140,20,0)'), true),
        blood: mk(glowTexture('rgba(190,25,25,1)', 'rgba(120,10,10,0)'), false), dust: mk(glowTexture('rgba(190,175,150,0.8)', 'rgba(150,135,110,0)'), false),
      };
    }
    let p = this.fxParts.find((q) => q.life <= 0);
    if (!p) {
      if (this.fxParts.length > 160) return;
      p = { s: new THREE.Sprite(this.fxMat[kind]), vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grav: 0 };
      this.scene.add(p.s);
      this.fxParts.push(p);
    }
    p.s.material = this.fxMat[kind];
    p.s.position.set(x, y, z);
    Object.assign(p, { vx, vy, vz, life, max: life, size, grav });
    p.s.visible = true; p.s.scale.set(size, size, 1);
  }

  /** Muzzle flashes for new shots and sparks / dust / blood where bullets land. */
  private fxEvents(s: Snapshot, dt: number) {
    const maxB = s.bullets.reduce((m, b) => Math.max(m, b.id), 0);
    if (this.lastBulletFx < 0) this.lastBulletFx = maxB;
    const flashed: { x: number; y: number }[] = [];
    for (const b of s.bullets) {
      if (b.id <= this.lastBulletFx) continue;
      if (flashed.some((f) => Math.hypot(f.x - b.x, f.y - b.y) < 14)) continue; // one flash per shot, even for 7 shotgun pellets
      flashed.push(b);
      const size = FLASH_SIZE[WEAPONS[b.w]?.cat ?? 'Sidearm'] ?? 20;
      const mine = this.fpActive && !!this.pred && Math.hypot(b.x - this.pred.x, b.y - this.pred.y) < 40;   // my own shots in first-person use the flash on my barrel
      if (!mine) {
        this.spawnFx('flash', b.x - Math.cos(b.a) * 18, b.y - Math.sin(b.a) * 18, AIM_HEIGHT + b.z, 0, 0, 0, 0.07, size);
        this.spawnFx('dust', b.x - Math.cos(b.a) * 12, b.y - Math.sin(b.a) * 12, AIM_HEIGHT + b.z, Math.cos(b.a) * 10, 14, Math.sin(b.a) * 10, 0.4, 7);   // a puff of muzzle smoke
        const rx = -Math.sin(b.a), rz = Math.cos(b.a);                                                                                           // the casing is thrown out to the right of the gun
        this.spawnCasing(new THREE.Vector3(b.x - Math.cos(b.a) * 10, AIM_HEIGHT - 4 + b.z, b.y - Math.sin(b.a) * 10), new THREE.Vector3(rx * (28 + Math.random() * 12) - Math.cos(b.a) * 6, 24 + Math.random() * 12, rz * (28 + Math.random() * 12) - Math.sin(b.a) * 6), WEAPONS[b.w]?.cat ?? 'Sidearm');
      }
    }
    this.lastBulletFx = Math.max(this.lastBulletFx, maxB);

    const maxI = s.impacts.reduce((m, e) => Math.max(m, e.id), 0);
    if (this.lastImpactFx < 0) this.lastImpactFx = maxI;
    for (const e of s.impacts) {
      if (e.id <= this.lastImpactFx) continue;
      const wall = e.kind === 'wall';
      for (let i = 0; i < (wall ? 6 : 5); i++) {
        const a = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 110;
        this.spawnFx(wall ? 'spark' : 'blood', e.x, e.y, AIM_HEIGHT + e.z, Math.cos(a) * sp, 30 + Math.random() * 70, Math.sin(a) * sp, 0.22 + Math.random() * 0.2, wall ? 4 : 5, -380);
      }
      if (wall) this.spawnFx('dust', e.x, e.y, AIM_HEIGHT + e.z, 0, 12, 0, 0.5, 16);
    }
    this.lastImpactFx = Math.max(this.lastImpactFx, maxI);

    this.updateCasings(dt);
    this.updateRings(dt);
    for (const p of this.fxParts) { // animate
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.vy += p.grav * dt;
      p.s.position.x += p.vx * dt; p.s.position.y = Math.max(1, p.s.position.y + p.vy * dt); p.s.position.z += p.vz * dt;
      const sz = p.size * (p.grav ? k : 0.5 + 0.5 * k);
      p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = Math.min(1, k * 1.6);
    }
  }

  /** Kill feed (who killed whom, with what) and the multi-kill banner. */
  private killEvents(s: Snapshot) {
    const maxId = s.kills.reduce((m, k) => Math.max(m, k.id), 0);
    if (this.lastKill < 0) { this.lastKill = maxId; return; } // first snapshot: skip events from before we joined
    for (const k of s.kills) {
      if (k.id <= this.lastKill) continue;
      const mine = k.killer === this.myId, victimIsMe = k.victim === this.myId;
      const multiName = k.multi >= 2 ? MULTI_NAMES[Math.min(k.multi, 6)] : '';
      const tag = multiName || (k.first ? FIRST_BLOOD : '');   // a multi-kill name wins over first blood in the feed
      const row = document.createElement('div');
      row.className = `k${mine ? ' me' : ''}${victimIsMe ? ' you' : ''}`;
      row.innerHTML = `<span class="${k.killerTeam === 'CT' ? 'ct' : 't'}">${esc(k.killerName)}</span><span class="w">${esc(WEAPONS[k.weapon]?.name ?? ITEMS[k.weapon - WEAPONS.length]?.name ?? '')}</span><span class="${k.victimTeam === 'CT' ? 'ct' : 't'}">${esc(k.victimName)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}`;
      const feed = $('feed');
      feed.appendChild(row);
      while (feed.children.length > 6) feed.firstElementChild!.remove();
      window.setTimeout(() => row.remove(), 6200);
      if (victimIsMe && profile.options.replay && this.snap?.round && !mine) this.startReplay(k.killer);
      if (mine) {
        sfx.kill();
        // every title you earn is counted in your saved profile
        if (k.first) addTitle(profile, FIRST_BLOOD);
        if (multiName) addTitle(profile, multiName);
        if (multiName || k.first) {
          const b = $('multi');
          $('multit').textContent = tag;
          $('multis').textContent = multiName ? `${k.multi} kills in a row${k.first ? ' - and first blood!' : ''}` : 'first kill of the round';
          b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
          sfx.multi(multiName ? k.multi : 1);
        }
      }
    }
    this.lastKill = maxId;
  }

  private toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** A cash pickup that vanishes next to the player was collected by them: play a sound and show "+$". */
  private lootEvents(s: Snapshot) {
    const me = this.me();
    const now = new Map<number, { x: number; y: number; amount: number }>();
    for (const k of s.pickups) if (k.kind === 'cash') now.set(k.id, { x: k.x, y: k.y, amount: k.amount ?? 0 });
    if (me && me.alive) {
      for (const [id, c] of this.prevCash) {
        if (!now.has(id) && Math.hypot(c.x - me.x, c.y - me.y) < 70) { sfx.cash(); this.toast(`+$${c.amount}`); this.matchLoot += c.amount; }
      }
    }
    this.prevCash = now;
  }

  /** Remember the weapon pack and save finished matches to the profile. */
  private trackProfile(s: Snapshot) {
    const r = s.round!, me = this.me();
    if (!me) return;
    if (me.weapon !== this.curWeapon) { this.prevWeapon = this.curWeapon; this.curWeapon = me.weapon; }
    if (r.phase === 'buy' && this.tp.phase !== 'buy' && me.alive) this.autoBuy(me);
    if (this.tp.phase === 'buy' && r.phase === 'live' && me.alive) {
      const weapons = WEAPONS.map((_, i) => i).filter((i) => WEAPONS[i].slot === 'primary' && ((me.owned >> i) & 1));
      if (weapons.length || me.armor > 0) { profile.pack = { weapons, armor: me.armor > 0 }; saveProfile(profile); }
    }
    if (r.phase === 'over' && !this.tp.recorded && r.winner) {
      this.tp.recorded = true;
      const won = r.winner === me.team;
      // coins: 50 for finishing, +100 for winning, +5 per kill, +1 per $100 of loot you collected
      const top = Math.max(...s.players.map((p) => p.score));
      const mvp = me.score > 0 && me.score >= top; // top fragger of the match (ties count)
      this.lastMvp = mvp;
      if (mvp) addTitle(profile, MVP_TITLE);
      this.lastCoins = 50 + (won ? 100 : 0) + me.score * 5 + Math.floor(this.matchLoot / 100) + (mvp ? 50 : 0);
      addMatch(profile, { t: Date.now(), mode: this.cfg.mode, room: this.cfg.room || 'public', team: me.team, won, tWins: r.tWins, ctWins: r.ctWins, kills: me.score, deaths: me.deaths, coins: this.lastCoins });
      this.matchLoot = 0;
    }
    if (r.phase !== 'over') this.tp.recorded = false;
    this.tp.phase = r.phase;
  }

  private updateWeaponBar() {
    const me = this.me();
    const key = me ? `${me.owned}|${me.weapon}` : '';
    if (key === this.lastWbar) return;
    this.lastWbar = key;
    const slotWeapon = (slot: string) => WEAPONS.findIndex((w, i) => w.slot === slot && ((me!.owned >> i) & 1));
    $('wbar').innerHTML = me ? [slotWeapon('sidearm'), slotWeapon('primary')].map((i, n) => i >= 0
      ? `<button data-w="${i}" class="${me.weapon === i ? 'cur' : ''}"><b>${n + 1}</b>${esc(WEAPONS[i].name)}</button>`
      : `<button class="off"><b>${n + 1}</b>Primary</button>`).join('') : '';
  }

  private audioEvents(s: Snapshot, time: number) {
    const r = s.round!;
    const me = s.players.find((p) => p.id === this.myId);
    const ev = this.ev;
    if (me) {
      // gunshots: any bullet we have not seen before; louder when closer
      const shots = new Map<number, { d: number; x: number }>(); // one sound per weapon per snapshot (a shotgun blast is one bang, not 7)
      for (const b of s.bullets) {
        if (b.id <= ev.maxBullet) continue;
        const d = Math.hypot(b.x - me.x, b.y - me.y), cur = shots.get(b.w);
        if (!cur || d < cur.d) shots.set(b.w, { d, x: b.x });
      }
      for (const [w, sh] of shots) {
        const far = Math.min(1, sh.d / 1100);
        sfx.gun(WEAPONS[w]?.id ?? 'usp', Math.pow(1 - far, 1.3), (sh.x - me.x) / 450, far, sh.d < 50);
      }
      // bullets hitting things: flesh or walls, panned and louder when close
      const maxImp = s.impacts.reduce((m, e) => Math.max(m, e.id), 0);
      if (ev.maxImpact < 0) ev.maxImpact = maxImp;
      let hitEnemy = false;
      for (const e of s.impacts) {
        if (e.id <= ev.maxImpact) continue;
        sfx.impact(e.kind, 1 - Math.hypot(e.x - me.x, e.y - me.y) / 800, (e.x - me.x) / 450);
        if (e.kind === 'body' && e.o === this.myId && e.v !== this.myId) hitEnemy = true;                 // my bullet hit someone
        if (e.kind === 'body' && e.v === this.myId && e.a !== undefined && me.alive) this.damageArc(e.a);   // I was shot: show where from
      }
      ev.maxImpact = Math.max(ev.maxImpact, maxImp);
      const maxKill = s.kills.reduce((m, k) => Math.max(m, k.id), 0);
      if (ev.maxKill < 0) ev.maxKill = maxKill;
      for (const k of s.kills) if (k.id > ev.maxKill && k.killer === this.myId && k.victim !== this.myId) { this.mkStat.byWeapon.set(k.weapon, (this.mkStat.byWeapon.get(k.weapon) ?? 0) + 1); this.mkStat.bestMulti = Math.max(this.mkStat.bestMulti, k.multi); }
      const myKill = s.kills.some((k) => k.id > ev.maxKill && k.killer === this.myId && k.victim !== this.myId);
      ev.maxKill = Math.max(ev.maxKill, maxKill);
      if ((hitEnemy || myKill) && me.alive) this.hitMarker(myKill);
      if (me.hp < ev.hp && me.alive) {
        sfx.hurt(ev.hp - me.hp);
        const el = $('hurt'); el.style.transition = 'none'; el.style.opacity = '0.9';
        void el.offsetWidth; el.style.transition = 'opacity .35s ease-out'; el.style.opacity = '0';
      }
      if (me.alive) {                                                       // ammo: shots, reloads and weapon swaps
        if (ev.weapon >= 0 && me.weapon === ev.weapon && me.am < ev.am) this.onLocalShot(me);
        if (me.rl > 0 && ev.rl === 0) { this.reloadTotal = me.rl; sfx.reload(me.rl); }
        if (ev.weapon >= 0 && me.weapon !== ev.weapon) { sfx.swap(); this.equipAnim = 1; }
        if (this.localInput?.fire && me.am === 0 && me.rl === 0 && time - this.lastDry > 0.35) { sfx.dry(); this.lastDry = time; }
      }
      ev.am = me.am; ev.rl = me.rl; ev.weapon = me.weapon;
      if (me.us >= 0 && ev.us < 0) sfx.healStart();
      if (me.us < 0 && ev.us >= 0 && me.hp > ev.hp) sfx.healDone();
      ev.us = me.us;
      const taken = me.iv.some((n, i) => n > (ev.iv[i] ?? 0));
      if (taken && ev.iv.length && !(ev.us >= 0)) { sfx.pickup(); const k = me.iv.findIndex((n, i) => n > (ev.iv[i] ?? 0)); if (k >= 0) this.toast(`+1 ${ITEMS[k].name}`); }
      if (ev.iv.length && me.iv.some((n, i) => n < (ev.iv[i] ?? 0)) && me.us < 0 && ev.us < 0 && !(me.hp > ev.hp)) { /* thrown: the throw sound comes with the grenade appearing */ }
      ev.iv = [...me.iv];
      if (r.mode === 'rescue' && r.rescued > ev.rescued && ev.rescued >= 0) { this.toast(`HOSTAGE RESCUED (${r.rescued}/${r.hostageCount})`); sfx.win(); }
      if (r.mode === 'collect') {
        const mineNow = me.team === 'CT' ? r.ctItems : r.tItems, theirs = me.team === 'CT' ? r.tItems : r.ctItems;
        if (ev.mine >= 0 && mineNow > ev.mine) { this.toast(`+1 INTEL CASE (${mineNow}/${r.itemTarget})`); sfx.cash(); }
        else if (ev.theirs >= 0 && theirs > ev.theirs) sfx.beep();
        ev.mine = mineNow; ev.theirs = theirs;
      } else { ev.mine = -1; ev.theirs = -1; }
      if (r.mode === 'flag' && r.flags.length) {                          // capture the flag: say what just happened
        const sig = r.flags.map((f) => (f.carried ? 'c' : f.home ? 'h' : 'd')).join('');
        if (ev.fsig) r.flags.forEach((f, i) => {
          const was = ev.fsig[i], now = sig[i];
          if (was === now) return;
          if (now === 'c') { this.toast(f.by === this.myId ? 'YOU HAVE THE FLAG! RUN HOME' : f.team === me.team ? 'YOUR FLAG WAS STOLEN!' : 'YOUR TEAM HAS THE ENEMY FLAG'); sfx.beep(); }
          else if (was === 'c' && now === 'd') this.toast(f.team === me.team ? 'YOUR FLAG IS DOWN: TOUCH IT' : 'ENEMY FLAG DROPPED: GRAB IT');
          else if (now === 'h' && was === 'd') this.toast(f.team === me.team ? 'YOUR FLAG IS BACK HOME' : 'ENEMY FLAG RETURNED');
        });
        if (ev.capT >= 0 && (r.capT > ev.capT || r.capCT > ev.capCT)) { const mineCap = (r.capT > ev.capT) === (me.team === 'T'); this.toast(mineCap ? 'YOUR TEAM CAPTURED THE FLAG!' : 'THE ENEMY CAPTURED YOUR FLAG'); (mineCap ? sfx.win : sfx.lose)(); }
        ev.fsig = sig; ev.capT = r.capT; ev.capCT = r.capCT;
      } else { ev.fsig = ''; ev.capT = -1; ev.capCT = -1; }
      if (r.mode === 'vip' && r.vip) { if (r.vip === this.myId && ev.vip !== r.vip) { this.toast('YOU ARE THE VIP'); sfx.beep(); } ev.vip = r.vip; } else ev.vip = '';
      if (r.mode === 'point' && r.cp) {
        if (ev.cpOwner && r.cp.owner !== ev.cpOwner) {
          if (r.cp.owner === 'contested') this.toast('ZONE CONTESTED');
          else if (r.cp.owner === me.team) this.toast('YOUR TEAM HOLDS THE ZONE');
          else if (r.cp.owner !== 'none') this.toast('THE ENEMY HOLDS THE ZONE');
        }
        ev.cpOwner = r.cp.owner;
      } else ev.cpOwner = '';
      ev.rescued = r.mode === 'rescue' ? r.rescued : -1;
      if (ev.alive && !me.alive) sfx.death();
      ev.hp = me.hp; ev.alive = me.alive;
    }
    for (const b of s.bullets) if (b.id > ev.maxBullet) ev.maxBullet = b.id;
    if (r.phase !== ev.phase) {
      if (r.phase === 'buy') { sfx.roundStart(); this.mkStat = { byWeapon: new Map(), bestMulti: 0 }; }
      if ((r.phase === 'post' || r.phase === 'over') && me) (r.winner === me.team ? sfx.win : sfx.lose)();
      ev.phase = r.phase;
    }
    if (r.bomb.status !== ev.bomb) {
      if (r.bomb.status === 'planted') sfx.plant();
      if (ev.bomb === 'planted') (r.phase === 'live' ? sfx.explode : sfx.defuse)();
      ev.bomb = r.bomb.status;
    }
    if (r.bomb.status === 'planted' && r.phase === 'live' && time >= ev.nextBeep) {
      sfx.beep();
      ev.nextBeep = time + (r.bomb.fuse > 10 ? 1 : r.bomb.fuse > 5 ? 0.5 : 0.2);
    }
  }

  /** The end-of-game screen: my own numbers, then everybody's scoreboard. */
  private renderEndStats(s: Snapshot, me: Snapshot['players'][number] | undefined) {
    const key = `${s.round?.roundNo}|${s.players.map((p) => `${p.id}:${p.score}:${p.deaths}:${p.sh}:${p.ht}:${p.dd}`).join(',')}`;
    if (key === this.statsKey) return;                                   // only rebuild when something changed (the countdown ticks every frame)
    this.statsKey = key;
    const acc = (p: { sh: number; ht: number }) => (p.sh ? `${Math.round((p.ht / p.sh) * 100)}%` : '-');
    let html = '';
    if (me) {
      const kd = me.deaths ? (me.score / me.deaths).toFixed(2) : me.score.toFixed(0);
      let bestW = '', bestN = 0; for (const [w, n] of this.mkStat.byWeapon) if (n > bestN) { bestN = n; bestW = WEAPONS[w]?.name ?? ''; }
      html += `<div class="sg"><div class="sc"><b>${me.score}</b><small>Score</small></div><div class="sc"><b>${me.deaths}</b><small>Deaths</small></div><div class="sc"><b>${kd}</b><small>K / D</small></div><div class="sc"><b>${acc(me)}</b><small>Accuracy</small></div><div class="sc"><b>${me.dd}</b><small>Damage</small></div></div>`;
      const bits = [bestW ? `Best weapon: ${esc(bestW)} (${bestN} kills)` : '', this.mkStat.bestMulti >= 2 ? `Best streak: ${this.mkStat.bestMulti} kills in a row` : '', `${me.sh} shots, ${me.ht} hits`].filter(Boolean);
      html += `<p class="best">${bits.join('  &middot;  ')}</p>`;
    }
    const rows = [...s.players].sort((a, b) => b.score - a.score || a.deaths - b.deaths).slice(0, 14);
    html += `<table><tr><th>Player</th><th>Score</th><th>Deaths</th><th>Acc</th><th>Damage</th></tr>${rows.map((p) => `<tr class="${p.id === this.myId ? 'me' : ''}"><td><span class="${p.team === 'CT' ? 'tc' : 'tt'}">${TEAM_INFO[p.team].short}</span> ${esc(p.name)}</td><td>${p.score}</td><td>${p.deaths}</td><td>${acc(p)}</td><td>${p.dd}</td></tr>`).join('')}</table>`;
    $('endstats').innerHTML = html;
  }

  private updateHud(s: Snapshot) {
    const r = s.round!;
    this.updateWeaponBar();
    const me = s.players.find((p) => p.id === this.myId);
    const myTeam: Team = me?.team ?? 'CT';
    const tdm = r.mode === 'tdm';
    const tense = (r.mode === 'point' && Math.max(r.cpT, r.cpCT) >= r.cpTarget - 15) || (r.mode === 'flag' && r.flags.some((f) => f.carried)) || r.bomb.status === 'planted' || (r.mode === 'rescue' && r.hostages.some((h) => h.carried)) || (r.mode === 'collect' && Math.max(r.tItems, r.ctItems) >= r.itemTarget - 2) || (tdm && Math.max(r.tKills, r.ctKills) >= r.killTarget - 4) || (r.phase === 'live' && r.timeLeft < 20);
    music.setMode(r.phase === 'live' ? (tense ? 'intense' : 'game') : 'calm');                // the soundtrack follows the action
    const rescue = r.mode === 'rescue', collect = r.mode === 'collect', point = r.mode === 'point', flag = r.mode === 'flag', vipMode = r.mode === 'vip';
    const ctScore = tdm ? r.ctKills : collect ? r.ctItems : point ? r.cpCT : flag ? r.capCT : rescue ? r.rescued : r.ctWins, tScore = tdm ? r.tKills : collect ? r.tItems : point ? r.cpT : flag ? r.capT : r.tWins;
    $('ctw').textContent = `${TEAM_INFO.CT.short} ${ctScore}${rescue ? `/${r.hostageCount}` : ''}`;
    $('tw').textContent = rescue ? TEAM_INFO.T.short : `${tScore} ${TEAM_INFO.T.short}`;
    const clock = r.bomb.status === 'planted' ? `BOMB ${Math.ceil(r.bomb.fuse)}s` : r.phase === 'buy' ? (r.free ? 'GET READY' : 'BUY') : r.phase === 'live' ? fmt(r.timeLeft) : '';
    $('tm').textContent = tdm ? `FIRST TO ${r.killTarget}  ${clock}` : collect ? `CASES ${r.itemTarget}  ${clock}` : point ? `ZONE ${r.cpTarget}  ${clock}` : vipMode ? `VIP  ${clock}` : flag ? `FLAG ${r.capTarget}  ${clock}` : rescue ? `RESCUE  ${clock}` : `R${r.roundNo}  ${clock}`;
    const tenseMission = (rescue && r.hostages.some((h) => h.carried)) || (collect && Math.max(r.tItems, r.ctItems) >= r.itemTarget - 2);
    const goalEl = $('goal');                                       // the instruction text: what do we have to do in this game?
    goalEl.style.display = r.phase === 'live' || r.phase === 'buy' ? 'block' : 'none';
    const modeName = (GAME_MODES.find((m) => m.id === r.mode)?.name ?? 'Mission').toUpperCase();
    const progress = tdm ? `Kills  ${TEAM_INFO[myTeam].short} ${myTeam === 'CT' ? r.ctKills : r.tKills}  -  ${myTeam === 'CT' ? r.tKills : r.ctKills} ${TEAM_INFO[myTeam === 'CT' ? 'T' : 'CT'].short}  (target ${r.killTarget})`
      : collect ? `Intel cases  you ${myTeam === 'CT' ? r.ctItems : r.tItems} / ${r.itemTarget}  -  enemy ${myTeam === 'CT' ? r.tItems : r.ctItems}`
      : point ? `Zone points  you ${myTeam === 'CT' ? r.cpCT : r.cpT} / ${r.cpTarget}  -  enemy ${myTeam === 'CT' ? r.cpT : r.cpCT}   |   ${!r.cp || r.cp.owner === 'none' ? 'zone empty' : r.cp.owner === 'contested' ? 'CONTESTED' : r.cp.owner === myTeam ? 'YOU HOLD IT' : 'ENEMY HOLDS IT'}`
      : vipMode ? (() => { const v = s.players.find((q) => q.id === r.vip); const d = v ? Math.round(Math.hypot(r.extract.x + r.extract.w / 2 - v.x, r.extract.y + r.extract.h / 2 - v.y) / 30) : 0; return v ? `VIP ${v.name}  ${Math.max(0, Math.round(v.hp))} hp  -  ${d} m from the extraction` : ''; })()
      : flag ? `Captures  you ${myTeam === 'CT' ? r.capCT : r.capT} / ${r.capTarget}  -  enemy ${myTeam === 'CT' ? r.capT : r.capCT}`
      : rescue ? `Hostages rescued  ${r.rescued} / ${r.hostageCount}`
      : r.bomb.status === 'planted' ? `Bomb planted - ${Math.ceil(r.bomb.fuse)} s` : '';
    goalEl.innerHTML = `<b class="gt">${modeName}</b><span class="gx"></span><span class="gp"></span>`;
    (goalEl.querySelector('.gx') as HTMLElement).textContent = r.goal[myTeam];
    (goalEl.querySelector('.gp') as HTMLElement).textContent = progress;
    if (r.phase === 'buy' && !profile.options.helpSeen && !isTouch && !this.helpQueued) { this.helpQueued = true; window.setTimeout(() => { if (this.game_alive()) this.showHelp(true); }, 7000); }   // a new player: show the controls after the mission banner
    if (r.phase === 'buy') this.introUntil = performance.now() + 6000;   // a big "your aim" banner while the game starts
    const intro = performance.now() < this.introUntil && r.phase !== 'over' && r.phase !== 'post';

    // banner: round result, bomb actions, role hints
    const endEl = $('endscreen');
    if (r.phase === 'over' && !this.endDismissed) {
      const won = !!me && r.winner === me.team;
      endEl.classList.add('on');
      $('endtitle').textContent = won ? 'VICTORY' : 'DEFEAT'; $('endtitle').style.color = won ? '#7dff9c' : '#ff6b6b';
      $('endsub').textContent = `${TEAM_INFO[r.winner ?? 'CT'].name} win the game - ${r.reason}. +${this.lastCoins} coins saved to your profile.`;
      $('endnext').textContent = `A new game starts in ${Math.ceil(r.timeLeft)} s`;
      this.renderEndStats(s, me);
    } else {
      endEl.classList.remove('on');
      if (r.phase !== 'over') this.endDismissed = false;
    }
    let big = '', sub = '', prog = 0;
    if (r.phase === 'post' || r.phase === 'over') {
      big = `${TEAM_INFO[r.winner ?? 'CT'].name.toUpperCase()} WIN${r.phase === 'over' ? ' THE MATCH' : ''}`;
      sub = r.phase === 'over' ? `${r.reason}  -  +${this.lastCoins} coins saved to your profile${this.tp.recorded && this.lastMvp ? '  (MATCH MVP!)' : ''}` : r.reason;
    } else if (r.bomb.progress > 0) {
      big = r.bomb.status === 'carried' ? 'PLANTING...' : 'DEFUSING...';
      prog = r.bomb.progress;
    } else if (me && !me.alive && r.phase === 'live') {
      sub = '';   // the spectator banner at the bottom says who you are watching
    } else if (me?.alive && r.phase === 'buy' && tdm) {
      sub = `You are ${TEAM_INFO[myTeam].name}. ${r.goal[myTeam]}`;
    } else if (me?.alive && r.phase === 'buy') {
      sub = `You are ${TEAM_INFO[myTeam].name} (${TEAM_INFO[myTeam].role}). ` + (myTeam === 'T' ? (r.bomb.carrier === me.id ? 'You have the bomb: go to a bomb site (A, B, or C upstairs in the house), ' + (isTouch ? 'hold PLANT' : 'hold E') + ' to plant' : 'Escort the bomb carrier') : 'Defend the bomb sites (A, B and C upstairs)');
    } else if (me?.alive && r.bomb.status === 'carried' && r.bomb.carrier === me.id) {
      sub = 'You carry the bomb - ' + (isTouch ? 'hold PLANT' : 'hold E') + ' inside a site to plant';
    } else if (r.bomb.status === 'planted') {
      sub = myTeam === 'CT' ? 'Bomb planted! Hold ' + (isTouch ? 'DEFUSE' : 'E') + ' next to it to defuse' : 'Bomb planted - protect it';
    } else if (r.bomb.status === 'dropped') {
      sub = 'The bomb was dropped';
    }
    if (rescue && me?.alive && r.phase === 'live') {                       // hostage rescue: what to do right now
      const mine = r.hostages.find((h) => h.by === this.myId), untying = r.hostages.find((h) => h.actor === this.myId);
      if (untying) { big = 'UNTYING...'; prog = untying.progress; }
      else if (mine) sub = 'Hostage freed! Escort it to the green EXTRACTION zone at your spawn';
      else if (myTeam === 'CT') {
        const near = r.hostages.find((h) => !h.carried && Math.hypot(h.x - me.x, h.y - me.y) < 70);
        sub = near ? 'Hold ' + (isTouch ? 'USE' : 'E') + ' next to the hostage to untie it' : '';
      }
    }
    if (intro && !big && me?.alive) { big = `YOUR AIM: ${modeName}`; if (!sub) sub = r.goal[myTeam]; }
    if (vipMode && me?.alive && r.phase === 'live') {
      if (r.vip === this.myId) sub = 'You are the VIP! Stay with your escort and reach the green extraction zone';
      else if (myTeam === 'CT') sub = 'Protect the VIP and walk with them to the green extraction zone';
      else sub = 'Find and kill the VIP (gold marker) before they reach the extraction zone';
    }
    if (flag && me?.alive && r.phase === 'live') {                       // capture the flag: what to do right now
      const theirs = r.flags.find((f) => f.team !== myTeam), mine = r.flags.find((f) => f.team === myTeam);
      if (theirs?.by === this.myId) sub = mine?.home ? 'You have the flag! Run to your own flag to score' : 'You have the flag, but yours is not home: get your flag back first';
      else if (mine && !mine.home && !mine.carried) sub = 'Your flag is lying outside: touch it to send it home';
    }
    $('bigtxt').textContent = big;
    $('subtxt').textContent = sub;
    const bar = $('bar');
    bar.style.display = prog > 0 ? 'block' : 'none';
    (bar.firstElementChild as HTMLElement).style.width = `${Math.min(1, prog) * 100}%`;

    // buy panel: only in the buy phase while alive
    const showBuy = !!me && (r.free ? (r.phase === 'buy' || (!me.alive && r.phase === 'live')) : me.alive && r.phase === 'buy');
    if (r.free) { this.updateLoadout(r, me, showBuy); }
    else {
    if (this.menuKind !== 'buy') { this.buildBuyMenu(); this.menuKind = 'buy'; const h3 = $('buy').querySelector('h3'); if (h3) h3.innerHTML = 'BUY &mdash; <span id="buytime"></span>'; }
    ($('rebuy') as HTMLButtonElement).disabled = !profile.pack;
    $('buy').style.display = showBuy ? 'block' : 'none';
    if (showBuy && me) {
      $('buytime').textContent = `${Math.ceil(r.timeLeft)}s   $${me.money}`;
      const key = `${me.money}|${me.owned}|${me.armor}|${me.iv.join(',')}`;
      if (key !== this.lastBuyState) {
        this.lastBuyState = key;
        $('buy').querySelectorAll('button[data-item]').forEach((btn) => {
          const item = Number((btn as HTMLElement).dataset.item);
          const isEq = item >= ITEM_BASE;
          const cost = isEq ? ITEMS[item - ITEM_BASE].cost : item === ARMOR_ITEM ? ARMOR_COST : WEAPONS[item].cost;
          const have = isEq ? me.iv[item - ITEM_BASE] >= ITEMS[item - ITEM_BASE].max : item === ARMOR_ITEM ? me.armor >= 100 : ((me.owned >> item) & 1) === 1;
          (btn as HTMLButtonElement).disabled = have || me.money < cost;
        });
      }
    }
    }

    const ammoEl = $('ammo');                                              // ammo counter and reload bar
    if (me && me.alive) {
      const wd = WEAPONS[me.weapon], low = me.am <= Math.ceil(wd.mag * 0.25), rk = keyLabel(currentBinds().reload[0]);
      ammoEl.style.display = 'block';
      $('ammoname').textContent = wd.name;
      $('ammonum').innerHTML = `${me.am}<small> / ${me.rv}</small>`;
      ammoEl.classList.toggle('low', low && me.am > 0); ammoEl.classList.toggle('empty', me.am === 0);
      const rbar = ammoEl.querySelector('.rbar') as HTMLElement;
      rbar.style.display = me.rl > 0 ? 'block' : 'none';
      if (me.rl > 0) (rbar.firstElementChild as HTMLElement).style.width = `${Math.max(0, Math.min(1, 1 - me.rl / (this.reloadTotal || wd.reload))) * 100}%`;
      $('ammohint').textContent = me.rl > 0 ? 'RELOADING' : me.am === 0 && me.rv === 0 ? 'OUT OF AMMO' : me.am === 0 ? `PRESS ${rk}` : low && me.rv > 0 ? `RELOAD (${rk})` : '';
    } else ammoEl.style.display = 'none';
    const owned = WEAPONS.filter((_, i) => ((me?.owned ?? 1) >> i) & 1).map((w) => w.name).join(' / ');
    const board = [...s.players]
      .sort((a, b) => (a.team === b.team ? b.score - a.score : a.team === 'CT' ? -1 : 1))
      .map((p) => `${p.id === this.myId ? '&gt;' : '&nbsp;'}${TEAM_INFO[p.team].short} ${esc(p.name)} ${p.score}/${p.deaths}${p.alive ? '' : ' x'}`)
      .join('<br>');
    this.hud.innerHTML = `${this.status ? esc(this.status) + '<br>' : ''}$${me?.money ?? 0} &nbsp;HP ${me?.hp ?? 0} &nbsp;Armor ${me?.armor ?? 0}<br>Weapon: ${me ? WEAPONS[me.weapon].name : ''} [${owned}]<br>${board}`;
  }
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------- boot ----------
let landing: Landing | null = null;
let started = false;

async function start(mode: 'single' | 'multi') {
  started = true;
  landing?.stop();
  landing = null;
  const name = ($('name') as HTMLInputElement).value.trim() || 'Player';
  const room = ($('room') as HTMLInputElement).value.trim();
  profile.name = name === 'Player' ? profile.name : name;
  saveProfile(profile);
  $('menu').style.display = 'none';
  initAudio();
  music.setVolume(profile.options.music / 100); music.start(); music.setMode('calm');
  if (isTouch) { void goFullscreen(); bindTouch(); }
  if (!template) await loadTemplate();
  await loadGunModels();
  const map = QS.get('map') && MAP_IDS.includes(QS.get('map')!) ? QS.get('map')! : profile.map; // dev: ?map=dock|desert|town
  const style = (['bomb', 'tdm', 'rescue', 'collect', 'point', 'flag', 'vip'].includes(QS.get('style') ?? '') ? QS.get('style') : profile.style) as GameMode;       // dev: ?style=tdm&wset=sniper&pick=auto
  const wset = (QS.get('wset') ?? profile.weaponSet) as WeaponSet;
  const pick = (QS.get('pick') ?? profile.pick) as PickMode;
  game = new Game({ mode, name, room, skin: profile.skin + SKIN_BASE * profile.kit, sidearm: profile.sidearm, team: profile.team, map, style, weaponSet: wset, pick, difficulty: (['easy', 'normal', 'hard'].includes(QS.get('diff') ?? '') ? QS.get('diff') : profile.difficulty) as Difficulty });
}
if (QS.has('debug')) (window as unknown as { __music: typeof music }).__music = music;   // dev: test the soundtrack from the console
const wakeMusic = () => {
  initAudio();
  music.setVolume(profile.options.music / 100); music.start();
  if (!started) music.setMode('calm');
  window.removeEventListener('pointerdown', wakeMusic); window.removeEventListener('keydown', wakeMusic);
};
window.addEventListener('pointerdown', wakeMusic); window.addEventListener('keydown', wakeMusic);
initMenu(profile, {
  onPlay: (mode) => void start(mode),
  onMap: (id) => landing?.setMap(id),
  onSkin: (i) => landing?.setSkin(i),
  onPrimary: (w) => landing?.setPrimary(w),
  onCustom: () => landing?.refresh(),
});

// the landing page: load the soldier model, then start the live 3D background (unless the game was started already)
void (async () => {
  if (new URLSearchParams(location.search).get('gallery')) return;
  await Promise.all([loadTemplate(), loadGunModels()]);
  if (started) return;
  landing = startLanding($('hero'), { map: profile.map, skin: profile.skin + SKIN_BASE * profile.kit, primary: profile.autoBuy.primary, custom: (w) => profile.custom[WEAPONS[w].id] });
})();

// dev shortcut: http://localhost:5173/?mode=single (or multi) skips the menu
const auto = new URLSearchParams(location.search).get('mode');
if (auto === 'single' || auto === 'multi') void start(auto);

// dev view: http://localhost:5173/?gallery=1 shows the four weapon models side by side
if (QS.get('gallery')) void (async () => {
  await loadGunModels();
  $('menu').style.display = 'none';
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setSize(window.innerWidth, window.innerHeight);
  $('game').appendChild(r.domElement);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x2a3140);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.4));
  const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(40, 90, 80); sc.add(dl);
  WEAPONS.forEach((w, i) => {
    const m = makeWeaponModel(i);
    m.position.set((i % 3) * 78 - 70, -Math.floor(i / 3) * 24 + 36, 0);
    sc.add(m);
    const box = new THREE.Box3().setFromObject(m);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 })); // red dot = where the game thinks the FRONT (muzzle) is
    dot.position.set(box.max.x + 2, m.position.y, 0); sc.add(dot);
    const lab = document.createElement('div'); lab.textContent = w.id; lab.style.cssText = 'position:fixed;color:#fff;font:12px monospace;background:#000a;padding:1px 4px';
    lab.style.left = `${(i % 3) * 33 + 2}%`; lab.style.top = `${Math.floor(i / 3) * 22 + 6}%`; document.body.appendChild(lab);
  });
  const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 500);
  cam.position.set(40, 0, 190); cam.lookAt(40, 0, 0);
  r.render(sc, cam);
})();
