import * as THREE from 'three';
import { initAudio, sfx, toggleMute } from './audio';
import { buildWorld, makeWeaponModel, loadGunModels } from './world';
import {
  applyKneel, QS, MODEL_YAW, MAX_TWIST, TURN_RATE, TWIST_SIGN, AXIS_Y, wrapAngle, template, loadTemplate, makeModelCharacter, makeCharacter, type Character,
} from './characters';
import { loadProfile, saveProfile, addMatch, addTitle, type TeamPref } from './profile';
import { initMenu } from './menu';
import { Voice } from './voice';
import { actionFor, applyBinds, binds as currentBinds, keyLabel } from './keybinds';
import { startLanding, type Landing } from './landing';
import {
  Sim, movePlayer, PLAYER_SPEED, SCOPED_SPEED, CROUCH_SPEED, JUMP_SPEED, JUMP_TIME, JUMP_COOLDOWN, WALLS, WEAPONS, SITES, SPAWN_ZONES, WORLD_W, WORLD_H, PICKUP_R, MAX_HP, TICK_RATE, TEAM_SIZE, WINS_TO_WIN,
  ARMOR_ITEM, ARMOR_COST, SKIN_COUNT, TEAM_INFO, MULTI_NAMES, FIRST_BLOOD, MVP_TITLE, getMap, MAP_IDS, type MapDef,
  type Input, type Snapshot, type ServerMsg, type Team,
} from '@fight/shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- input sources ----------
const keys = { up: false, down: false, left: false, right: false, use: false, scope: false, crouch: false, jump: false };
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
  hold('tJump', () => { keys.jump = true; game?.queueJump(); }, () => { keys.jump = false; });
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
    case 'crouch': keys.crouch = v; break;
    case 'view': if (v) game?.toggleView(); break;
    case 'jump': keys.jump = v; if (v) game?.queueJump(); break;
    case 'buyArmor': if (v) game?.buy(ARMOR_ITEM); break;
    case 'rebuy': if (v) game?.rebuy(); break;
    case 'sidearm': if (v) game?.selectSlot(1); break;
    case 'primary': if (v) game?.selectSlot(2); break;
    case 'lastWeapon': if (v) game?.lastWeapon(); break;
    case 'mute': if (v) toggleMute(); break;
    case 'perf': if (v) game?.togglePerf(); break;
    case 'specNext': if (v) game?.specNext(); break;
    case 'talk': game?.talk(v); break;
    case 'replay': if (v) game?.watchAgain(); break;
    default: return false;
  }
  return true;
}
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; game?.look(e.movementX); });
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
interface Config { mode: 'single' | 'multi'; name: string; room: string; skin: number; sidearm: number; team: TeamPref; map: string }
interface Shown { x: number; y: number; angle: number; moved: number; vx: number; vy: number }

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
  private yaw = 0;                                       // the direction I look (radians, the same angle the sim uses)
  private viewGun: THREE.Group | null = null; private viewGunIdx = -1; private kick = 0;
  private releasing = false;
  private jumpPending = false;
  /** A quick tap must still count: keep the jump request until the next input has been sent. */
  queueJump() { this.jumpPending = true; }
  private endDismissed = false;
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
  private ev = { maxBullet: 0, maxImpact: -1, hp: MAX_HP, alive: true, phase: '', bomb: 'none', nextBeep: 0 };
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
      this.sim = new Sim({ rounds: true, map: cfg.map, invincible: QS.has('god') ? [this.myId] : [] }); // dev: ?god=1
      this.sim.join(this.myId, cfg.name, cfg.skin, cfg.sidearm, cfg.team);
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
    this.ws.onopen = () => { this.retries = 0; this.ws!.send(JSON.stringify({ type: 'join', name: this.cfg.name, room: this.cfg.room, skin: this.cfg.skin, sidearm: this.cfg.sidearm, team: this.cfg.team, map: this.cfg.map })); };
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as ServerMsg;
      if (m.type === 'pong') { this.pingMs = performance.now() - m.t; return; }
      if (m.type === 'welcome') {
        this.myId = m.id; this.status = `Room: ${m.room}`;
        if (!this.mapDef) this.buildWorld(getMap(m.map));
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

  private buildWorld(map: MapDef) {
    this.mapDef = map;
    buildWorld(this.scene, map);
    if (this.quality > 0) this.applyQuality();
  }

  private startVoice(id: string) {
    if (profile.options.voice === 'off' || this.voice) return;
    this.voice = new Voice(id, (msg) => { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }, profile.options.voice);
    void this.voice.enable();
  }
  toggleView() {
    this.fp = !this.fp;
    profile.options.view = this.fp ? 'fps' : 'top'; saveProfile(profile);
    const me = this.me(); if (this.fp && me) this.yaw = me.angle;
    document.body.classList.toggle('fp', this.fp);
    if (!this.fp && document.pointerLockElement) { this.releasing = true; document.exitPointerLock(); }
    this.toast(this.fp ? 'First-person view' : 'Top-down view');
  }
  /** Mouse movement turns the head in first-person (needs the captured mouse). */
  look(dx: number) { if (this.fpActive && document.pointerLockElement && !this.paused) this.yaw += dx * 0.0022; }
  /** The weapon in my hands, drawn on top of everything in front of the camera. */
  private updateViewGun(weapon: number | undefined, show: boolean, dt: number) {
    if (!this.viewGun) { this.viewGun = new THREE.Group(); this.camera.add(this.viewGun); if (!this.camera.parent) this.scene.add(this.camera); }
    const g = this.viewGun;
    g.visible = show && weapon !== undefined;
    if (weapon === undefined || weapon === this.viewGunIdx) { /* keep */ } else {
      g.clear();
      const m = makeWeaponModel(weapon);
      m.rotation.y = Math.PI / 2;                       // barrel points along +x in the model, the camera looks along -z
      m.traverse((o) => { const me = o as THREE.Mesh; if (!me.isMesh) return; me.castShadow = false; me.renderOrder = 999; for (const mat of ([] as THREE.Material[]).concat(me.material)) mat.depthTest = false; });
      g.add(m); this.viewGunIdx = weapon;
    }
    if (this.localInput?.fire) this.kick = 1;
    this.kick = Math.max(0, this.kick - dt * 9);
    g.position.set(10, -11 + this.kick * 0.8, -26 + this.kick * 4);
    g.rotation.x = this.kick * 0.06;
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
    const walls = this.mapDef?.walls;
    const frozen = !me.alive || this.snap?.round?.phase === 'buy' || !walls;
    if (!this.pred || frozen) { this.pred = { x: me.x, y: me.y }; return; }
    const len = Math.hypot(input.mx, input.my), k = len > 1 ? 1 / len : 1;
    this.predCd -= dt; if (this.predAir > 0) this.predAir -= dt;          // same jump rules as the server
    if (input.jump && this.predAir <= 0 && this.predCd <= 0) { this.predAir = JUMP_TIME; this.predCd = JUMP_COOLDOWN; }
    const air = this.predAir > 0;
    const speed = PLAYER_SPEED * (input.scoped && WEAPONS[me.weapon]?.cat === 'Sniper' ? SCOPED_SPEED : 1) * (air ? JUMP_SPEED : input.crouch ? CROUCH_SPEED : 1);
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
    const scoped = (mouse.right || keys.scope) && !!myP && myP.alive && WEAPONS[myP.weapon]?.cat === 'Sniper' && this.snap?.round?.phase !== 'buy';
    return { mx: wmx, my: wmy, angle, fire, weapon: this.pendingWeapon ?? undefined, use: keys.use, scoped, crouch: keys.crouch, jump: keys.jump || this.jumpPending };
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
      this.pendingWeapon = null; this.jumpPending = false;
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
        this.pendingWeapon = null; this.jumpPending = false;
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
    if (s) this.updateLabels(s);
  }

  private updateScene(s: Snapshot, dt: number, time: number) {
    const smooth = 1 - Math.exp(-dt / 0.05);  // frame-rate independent; hides 30Hz snapshots for other players and bots
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let d = this.shown.get(p.id);
      const local = !this.replay && p.id === this.myId && !!this.pred && !!this.localInput && p.alive;
      if (!d || Math.hypot(d.x - p.x, d.y - p.y) > 200) d = { x: p.x, y: p.y, angle: p.angle, moved: 0, vx: 0, vy: 0 };
      const px = d.x, py = d.y;
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
      if (c.gunIdx !== p.weapon) { // show the weapon this player currently holds
        c.gunHolder.clear();
        c.gunHolder.add(makeWeaponModel(p.weapon));
        c.gunIdx = p.weapon;
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
      c.root.position.set(d.x, hop, d.y);
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
      this.dummy.position.set(b.x - Math.cos(b.a) * st.len / 2, AIM_HEIGHT, b.y - Math.sin(b.a) * st.len / 2); // the head of the tracer is at the bullet
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
    const ease = this.scopeT * this.scopeT * (3 - 2 * this.scopeT);
    const fov = this.fpActive ? 78 - 48 * ease : 45 - 25 * ease;
    const near = this.fpActive ? 3 : 10;
    if (this.camera.near !== near) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const sc = $('scope');
    sc.style.opacity = String(Math.min(1, ease * 1.4));
    sc.style.transform = `scale(${(1.5 - 0.5 * ease).toFixed(3)})`;
    this.renderer.domElement.style.cursor = ease > 0.4 ? 'none' : '';
    if (me) {
      if (camId === this.myId) this.camTarget.set(me.x + (this.aimPoint.x - me.x) * 0.5 * ease, 0, me.y + (this.aimPoint.y - me.y) * 0.5 * ease); // rigid follow: a lagging camera would move the aim point while running
      else this.camTarget.lerp(this.tmp.set(me.x, 0, me.y), Math.min(1, dt * 8));
    }

    // bomb: on the carrier's back, dropped on the floor, or armed at the site
    const bomb = s.round?.bomb;
    this.bombMesh.visible = !!bomb && bomb.status !== 'none';
    if (bomb && this.bombMesh.visible) {
      const car = bomb.carrier ? this.shown.get(bomb.carrier) : undefined;
      if (bomb.status === 'carried' && car) this.bombMesh.position.set(car.x - Math.cos(car.angle) * 12, 38, car.y - Math.sin(car.angle) * 12);
      else this.bombMesh.position.set(bomb.x, 5, bomb.y);
      const blink = bomb.status === 'planted' ? 0.4 + 0.6 * Math.abs(Math.sin(time * (bomb.fuse < 10 ? 10 : 4))) : 0.3;
      (this.bombMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = blink * 2;
    }
    const zoom = QS.has('zoom') ? Number(QS.get('zoom')) : 1;
    const mePl = s.players.find((q) => q.id === this.myId);
    const fpNow = this.fpActive && camId === this.myId && !!me;
    this.updateViewGun(mePl?.weapon, fpNow && ease < 0.6, dt);
    $('xhair').style.display = fpNow && ease < 0.3 ? 'block' : 'none';
    $('fphint').style.display = fpNow && !isTouch && !document.pointerLockElement && !this.paused ? 'block' : 'none';
    if (fpNow && me) {
      const ch = this.chars.get(this.myId);
      const eye = 52 - 20 * (ch?.crouchK ?? 0) + (ch?.root.position.y ?? 0);   // eye height: lower when kneeling, higher in a jump
      this.camera.position.set(me.x, eye, me.y);
      this.camera.lookAt(me.x + Math.cos(this.yaw) * 100, eye, me.y + Math.sin(this.yaw) * 100);
    } else if (QS.has('top')) { // dev: straight-down camera, handy for checking which way characters face
      this.camera.position.set(this.camTarget.x, 640 * zoom, this.camTarget.z + 0.01);
      this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z);
    } else {
      this.camera.position.set(this.camTarget.x, 560 * zoom, this.camTarget.z + 430 * zoom);
      this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z + 10);
    }
  }

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
      this.tmp.set(d.x, 78, d.y).project(this.camera);
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
      this.spawnFx('flash', b.x - Math.cos(b.a) * 18, b.y - Math.sin(b.a) * 18, AIM_HEIGHT, 0, 0, 0, 0.07, size);
    }
    this.lastBulletFx = Math.max(this.lastBulletFx, maxB);

    const maxI = s.impacts.reduce((m, e) => Math.max(m, e.id), 0);
    if (this.lastImpactFx < 0) this.lastImpactFx = maxI;
    for (const e of s.impacts) {
      if (e.id <= this.lastImpactFx) continue;
      const wall = e.kind === 'wall';
      for (let i = 0; i < (wall ? 6 : 5); i++) {
        const a = Math.random() * Math.PI * 2, sp = 50 + Math.random() * 110;
        this.spawnFx(wall ? 'spark' : 'blood', e.x, e.y, AIM_HEIGHT, Math.cos(a) * sp, 30 + Math.random() * 70, Math.sin(a) * sp, 0.22 + Math.random() * 0.2, wall ? 4 : 5, -380);
      }
      if (wall) this.spawnFx('dust', e.x, e.y, AIM_HEIGHT, 0, 12, 0, 0.5, 16);
    }
    this.lastImpactFx = Math.max(this.lastImpactFx, maxI);

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
      row.innerHTML = `<span class="${k.killerTeam === 'CT' ? 'ct' : 't'}">${esc(k.killerName)}</span><span class="w">${esc(WEAPONS[k.weapon]?.name ?? '')}</span><span class="${k.victimTeam === 'CT' ? 'ct' : 't'}">${esc(k.victimName)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}`;
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
      for (const e of s.impacts) {
        if (e.id <= ev.maxImpact) continue;
        sfx.impact(e.kind, 1 - Math.hypot(e.x - me.x, e.y - me.y) / 800, (e.x - me.x) / 450);
      }
      ev.maxImpact = Math.max(ev.maxImpact, maxImp);
      if (me.hp < ev.hp && me.alive) {
        sfx.hurt(ev.hp - me.hp);
        const el = $('hurt'); el.style.transition = 'none'; el.style.opacity = '0.9';
        void el.offsetWidth; el.style.transition = 'opacity .35s ease-out'; el.style.opacity = '0';
      }
      if (ev.alive && !me.alive) sfx.death();
      ev.hp = me.hp; ev.alive = me.alive;
    }
    for (const b of s.bullets) if (b.id > ev.maxBullet) ev.maxBullet = b.id;
    if (r.phase !== ev.phase) {
      if (r.phase === 'buy') sfx.roundStart();
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

  private updateHud(s: Snapshot) {
    const r = s.round!;
    this.updateWeaponBar();
    const me = s.players.find((p) => p.id === this.myId);
    const myTeam: Team = me?.team ?? 'CT';
    $('ctw').textContent = `${TEAM_INFO.CT.short} ${r.ctWins}`;
    $('tw').textContent = `${r.tWins} ${TEAM_INFO.T.short}`;
    const clock = r.bomb.status === 'planted' ? `BOMB ${Math.ceil(r.bomb.fuse)}s` : r.phase === 'buy' ? 'BUY' : r.phase === 'live' ? fmt(r.timeLeft) : '';
    $('tm').textContent = `R${r.roundNo}  ${clock}`;

    // banner: round result, bomb actions, role hints
    const endEl = $('endscreen');
    if (r.phase === 'over' && !this.endDismissed) {
      const won = !!me && r.winner === me.team;
      endEl.classList.add('on');
      $('endtitle').textContent = won ? 'VICTORY' : 'DEFEAT'; $('endtitle').style.color = won ? '#7dff9c' : '#ff6b6b';
      $('endsub').textContent = `${TEAM_INFO[r.winner ?? 'CT'].name} win the game - ${r.reason}. +${this.lastCoins} coins saved to your profile.`;
      $('endnext').textContent = `A new game starts in ${Math.ceil(r.timeLeft)} s`;
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
    } else if (me?.alive && r.phase === 'buy') {
      sub = `You are ${TEAM_INFO[myTeam].name} (${TEAM_INFO[myTeam].role}). ` + (myTeam === 'T' ? (r.bomb.carrier === me.id ? 'You have the bomb: go to site A or B, ' + (isTouch ? 'hold PLANT' : 'hold E') + ' to plant' : 'Escort the bomb carrier') : 'Defend sites A and B');
    } else if (me?.alive && r.bomb.status === 'carried' && r.bomb.carrier === me.id) {
      sub = 'You carry the bomb - ' + (isTouch ? 'hold PLANT' : 'hold E') + ' inside a site to plant';
    } else if (r.bomb.status === 'planted') {
      sub = myTeam === 'CT' ? 'Bomb planted! Hold ' + (isTouch ? 'DEFUSE' : 'E') + ' next to it to defuse' : 'Bomb planted - protect it';
    } else if (r.bomb.status === 'dropped') {
      sub = 'The bomb was dropped';
    }
    $('bigtxt').textContent = big;
    $('subtxt').textContent = sub;
    const bar = $('bar');
    bar.style.display = prog > 0 ? 'block' : 'none';
    (bar.firstElementChild as HTMLElement).style.width = `${Math.min(1, prog) * 100}%`;

    // buy panel: only in the buy phase while alive
    const showBuy = !!me && me.alive && r.phase === 'buy';
    ($('rebuy') as HTMLButtonElement).disabled = !profile.pack;
    $('buy').style.display = showBuy ? 'block' : 'none';
    if (showBuy && me) {
      $('buytime').textContent = `${Math.ceil(r.timeLeft)}s   $${me.money}`;
      const key = `${me.money}|${me.owned}|${me.armor}`;
      if (key !== this.lastBuyState) {
        this.lastBuyState = key;
        $('buy').querySelectorAll('button[data-item]').forEach((btn) => {
          const item = Number((btn as HTMLElement).dataset.item);
          const cost = item === ARMOR_ITEM ? ARMOR_COST : WEAPONS[item].cost;
          const have = item === ARMOR_ITEM ? me.armor >= 100 : ((me.owned >> item) & 1) === 1;
          (btn as HTMLButtonElement).disabled = have || me.money < cost;
        });
      }
    }

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
  if (isTouch) { void goFullscreen(); bindTouch(); }
  if (!template) await loadTemplate();
  await loadGunModels();
  const map = QS.get('map') && MAP_IDS.includes(QS.get('map')!) ? QS.get('map')! : profile.map; // dev: ?map=dock|desert|town
  game = new Game({ mode, name, room, skin: profile.skin, sidearm: profile.sidearm, team: profile.team, map });
}
initMenu(profile, {
  onPlay: (mode) => void start(mode),
  onMap: (id) => landing?.setMap(id),
  onSkin: (i) => landing?.setSkin(i),
  onPrimary: (w) => landing?.setPrimary(w),
});

// the landing page: load the soldier model, then start the live 3D background (unless the game was started already)
void (async () => {
  if (new URLSearchParams(location.search).get('gallery')) return;
  await Promise.all([loadTemplate(), loadGunModels()]);
  if (started) return;
  landing = startLanding($('hero'), { map: profile.map, skin: profile.skin, primary: profile.autoBuy.primary });
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
