import * as THREE from 'three';
import { initAudio, sfx, toggleMute } from './audio';
import { buildWorld, makeWeaponModel, loadGunModels } from './world';
import {
  QS, MODEL_YAW, MAX_TWIST, TURN_RATE, TWIST_SIGN, AXIS_Y, wrapAngle, template, loadTemplate, makeModelCharacter, makeCharacter, type Character,
} from './characters';
import { loadProfile, saveProfile, addMatch, type TeamPref } from './profile';
import { initMenu } from './menu';
import { startLanding, type Landing } from './landing';
import {
  Sim, WALLS, WEAPONS, SITES, SPAWN_ZONES, WORLD_W, WORLD_H, PICKUP_R, MAX_HP, TICK_RATE, TEAM_SIZE, WINS_TO_WIN,
  ARMOR_ITEM, ARMOR_COST, SKIN_COUNT, TEAM_INFO, getMap, MAP_IDS, type MapDef,
  type Input, type Snapshot, type ServerMsg, type Team,
} from '@fight/shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- input sources ----------
const keys = { up: false, down: false, left: false, right: false, use: false };
const BUY_KEYS: Record<string, number> = { KeyV: ARMOR_ITEM };
const profile = loadProfile();
let game: Game | null = null;
const stick = { mx: 0, my: 0, aimAngle: 0, aiming: false };
const mouse = { x: 0, y: 0, down: false };

function bindTouch() {
  const layer = $('touch');
  layer.style.display = 'block';
  const setup = (el: HTMLElement, knob: HTMLElement, onMove: (nx: number, ny: number, active: boolean) => void) => {
    let pid = -1;
    const R = 65;
    const update = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
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
  setup($('stickL'), $('knobL'), (x, y) => { stick.mx = x; stick.my = y; });
  setup($('stickR'), $('knobR'), (x, y, active) => {
    stick.aiming = active && Math.hypot(x, y) > 0.2;
    if (active && Math.hypot(x, y) > 0.05) stick.aimAngle = Math.atan2(y, x);
  });
}

window.addEventListener('keydown', (e) => setKey(e.code, true));
window.addEventListener('keyup', (e) => setKey(e.code, false));
function setKey(code: string, v: boolean) {
  const m = /^Digit(\d)$/.exec(code);
  if (m && v) game?.selectSlot(Number(m[1]));
  if (v && code === 'KeyQ') game?.lastWeapon();
  if (v && code === 'KeyB') game?.rebuy();
  if (v && code in BUY_KEYS) game?.buy(BUY_KEYS[code]);
  if (code === 'KeyE') keys.use = v;
  if (v && code === 'KeyM') toggleMute();
  if (code === 'KeyW' || code === 'ArrowUp') keys.up = v;
  if (code === 'KeyS' || code === 'ArrowDown') keys.down = v;
  if (code === 'KeyA' || code === 'ArrowLeft') keys.left = v;
  if (code === 'KeyD' || code === 'ArrowRight') keys.right = v;
}
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
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
  private matchLoot = 0;
  private lastCoins = 0;
  private ev = { maxBullet: 0, hp: MAX_HP, alive: true, phase: '', bomb: 'none', nextBeep: 0 };
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
  private last = performance.now();
  private status = '';
  private tmp = new THREE.Vector3();
  private dummy = new THREE.Object3D();

  constructor(private cfg: Config) {
    const host = $('game');
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(45, 1, 10, 4000);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 0 && !isTouch) mouse.down = true; });
    window.addEventListener('mouseup', () => { mouse.down = false; });
    this.renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

    if (cfg.mode === 'single') this.buildWorld(getMap(cfg.map)); // multiplayer builds it when the server says which map the room uses
    const bg = new THREE.SphereGeometry(5, 6, 4);
    this.bullets = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffd34d }), 600);
    this.bullets.frustumCulled = false;
    this.scene.add(this.bullets);
    this.bombMesh = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 12), new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xff2200, emissiveIntensity: 0.5 }));
    this.bombMesh.castShadow = true; this.bombMesh.visible = false;
    this.scene.add(this.bombMesh);
    this.buildBuyMenu();
    $('wbar').addEventListener('click', (e) => { const w = (e.target as HTMLElement).closest('button')?.dataset.w; if (w !== undefined) this.selectWeapon(Number(w)); });

    if (cfg.mode === 'single') {
      this.sim = new Sim({ rounds: true, map: cfg.map });
      this.sim.join(this.myId, cfg.name, cfg.skin, cfg.sidearm, cfg.team);
      this.sim.fillBots(TEAM_SIZE);
    } else {
      this.connect();
    }
    requestAnimationFrame(() => this.frame());
  }

  private connect() {
    this.status = 'Connecting...';
    const url = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080`;
    this.ws = new WebSocket(url);
    this.ws.onopen = () => this.ws!.send(JSON.stringify({ type: 'join', name: this.cfg.name, room: this.cfg.room, skin: this.cfg.skin, sidearm: this.cfg.sidearm, team: this.cfg.team, map: this.cfg.map }));
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as ServerMsg;
      if (m.type === 'welcome') { this.myId = m.id; this.status = `Room: ${m.room}`; this.buildWorld(getMap(m.map)); }
      else this.snap = m.snap;
    };
    this.ws.onclose = () => { this.status = 'Disconnected (is the server running?)'; };
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
    armor.innerHTML = `[V] Armor<small>$${ARMOR_COST}</small>`;
    armor.addEventListener('click', () => this.buy(ARMOR_ITEM));
    const rebuy = document.createElement('button');
    rebuy.id = 'rebuy';
    rebuy.innerHTML = '[B] Rebuy<small>last pack</small>';
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
    buildWorld(this.scene, map);
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private readInput(): Input {
    const me = this.shown.get(this.myId);
    const mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stick.mx;
    const my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + stick.my;
    let angle = this.snap?.players.find((p) => p.id === this.myId)?.angle ?? 0;
    let fire = mouse.down;
    if (isTouch) {
      angle = stick.aimAngle; fire = stick.aiming;
    } else if (me) {
      const ndc = new THREE.Vector2((mouse.x / window.innerWidth) * 2 - 1, -(mouse.y / window.innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      if (this.raycaster.ray.intersectPlane(this.aimPlane, this.tmp)) angle = Math.atan2(this.tmp.z - me.y, this.tmp.x - me.x);
    }
    return { mx, my, angle, fire, weapon: this.pendingWeapon ?? undefined, use: keys.use };
  }

  private frame() {
    const now = performance.now();
    const delta = Math.min(now - this.last, 100);
    this.last = now;

    const input = this.readInput();
    if (this.sim) {
      this.sim.setInput(this.myId, input);
      this.pendingWeapon = null;
      this.acc += (delta / 1000) * (QS.has('timescale') ? Number(QS.get('timescale')) : 1); // dev: ?timescale=40 fast-forwards single player
      const dt = 1 / TICK_RATE;
      while (this.acc >= dt) { this.sim.step(dt); this.acc -= dt; }
      this.snap = this.sim.snapshot();
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendAcc += delta;
      if (this.sendAcc >= 1000 / TICK_RATE) {
        this.sendAcc = 0;
        this.ws.send(JSON.stringify({ type: 'input', input }));
        this.pendingWeapon = null;
      }
    }
    this.draw(delta / 1000, now / 1000);
    requestAnimationFrame(() => this.frame());
  }

  private draw(dt: number, time: number) {
    const s = this.snap;
    if (s) this.updateScene(s, dt, time);
    this.renderer.render(this.scene, this.camera);
    if (s) this.updateLabels(s);
  }

  private updateScene(s: Snapshot, dt: number, time: number) {
    const smooth = 1 - Math.pow(0.0001, dt); // frame-rate independent, hides 30Hz network snapshots
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let d = this.shown.get(p.id);
      if (!d || (!this.sim && Math.hypot(d.x - p.x, d.y - p.y) > 200)) d = { x: p.x, y: p.y, angle: p.angle, moved: 0, vx: 0, vy: 0 };
      const px = d.x, py = d.y;
      if (this.sim) { d.x = p.x; d.y = p.y; } else { d.x += (p.x - d.x) * smooth; d.y += (p.y - d.y) * smooth; }
      let da = p.angle - d.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      d.angle += da * Math.min(1, dt * 20);
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
      c.root.visible = p.alive;
      c.root.position.set(d.x, 0, d.y);
      c.root.rotation.y = -d.angle;
      const speed = Math.min(1, d.moved / 220);
      if (c.mixer) { // loaded model: blend between its idle and run animations
        const w = Math.min(1, speed * 1.6);
        c.run?.setEffectiveWeight(w); c.idle?.setEffectiveWeight(1 - w);
        if (c.run) c.run.timeScale = 0.6 + speed * 0.8;

        // Realistic turning: the legs/body face the direction of travel and turn at a limited speed;
        // the upper body twists to face the aim direction (up to MAX_TWIST away from the legs).
        const aim = d.angle;
        c.legYaw ??= aim;
        let target = c.legYaw;
        if (d.moved > 40) {
          const diff = wrapAngle(aim - Math.atan2(d.vy, d.vx));
          target = aim - Math.max(-MAX_TWIST, Math.min(MAX_TWIST, diff));
        } else {
          const diff = wrapAngle(aim - c.legYaw);
          if (Math.abs(diff) > MAX_TWIST) target = aim - Math.sign(diff) * MAX_TWIST * 0.5; // feet shuffle round once the torso is twisted too far
        }
        const step = TURN_RATE * dt;
        c.legYaw += Math.max(-step, Math.min(step, wrapAngle(target - c.legYaw) * Math.min(1, dt * 14)));
        const twist = Math.max(-1.7, Math.min(1.7, wrapAngle(aim - c.legYaw)));
        if (c.holder) c.holder.rotation.y = MODEL_YAW + twist; // lower body faces c.legYaw, root faces the aim
        c.mixer.update(dt);
        if (c.spine) c.spine.rotateOnAxis(AXIS_Y, TWIST_SIGN * twist * 0.8); // after the animation pose is applied
        if (c.neck) c.neck.rotateOnAxis(AXIS_Y, TWIST_SIGN * twist * 0.15);
      } else {
        c.phase += dt * 11 * speed;
        const swing = Math.sin(c.phase) * 0.8 * speed;
        c.legL.rotation.z = swing; c.legR.rotation.z = -swing;
        c.root.position.y = Math.abs(Math.sin(c.phase)) * 1.5 * speed;
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
      this.dummy.position.set(s.bullets[i].x, AIM_HEIGHT, s.bullets[i].y);
      this.dummy.updateMatrix();
      this.bullets.setMatrixAt(i, this.dummy.matrix);
    }
    this.bullets.count = n;
    this.bullets.instanceMatrix.needsUpdate = true;

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
    if (meP && !meP.alive) { // spectate a living teammate while dead
      const mate = s.players.find((q) => q.alive && q.team === meP.team) ?? s.players.find((q) => q.alive);
      if (mate) camId = mate.id;
    }
    const me = this.shown.get(camId);
    if (me) this.camTarget.lerp(this.tmp.set(me.x, 0, me.y), Math.min(1, dt * 8));

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
    this.camera.position.set(this.camTarget.x, 560 * zoom, this.camTarget.z + 430 * zoom);
    this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z + 10);
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
      if (!p.alive || !d) { el.style.display = 'none'; continue; }
      this.tmp.set(d.x, 78, d.y).project(this.camera);
      el.style.display = 'block';
      el.style.transform = `translate(${(this.tmp.x * 0.5 + 0.5) * w}px, ${(-this.tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      (el.querySelector('b') as HTMLElement).style.width = `${(p.hp / MAX_HP) * 100}%`;
    }

    if (s.round) { this.updateHud(s); this.audioEvents(s, performance.now() / 1000); this.trackProfile(s); this.lootEvents(s); }
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
      this.lastCoins = 50 + (won ? 100 : 0) + me.score * 5 + Math.floor(this.matchLoot / 100);
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
      let fresh = 0, nearest = Infinity;
      for (const b of s.bullets) {
        if (b.id > ev.maxBullet) { fresh++; nearest = Math.min(nearest, Math.hypot(b.x - me.x, b.y - me.y)); }
      }
      if (fresh > 0) sfx.shot(Math.max(0, 1 - nearest / 1000), fresh >= 4);
      if (me.hp < ev.hp && me.alive) {
        sfx.hurt();
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
    let big = '', sub = '', prog = 0;
    if (r.phase === 'post' || r.phase === 'over') {
      big = `${TEAM_INFO[r.winner ?? 'CT'].name.toUpperCase()} WIN${r.phase === 'over' ? ' THE MATCH' : ''}`;
      sub = r.phase === 'over' ? `${r.reason}  -  +${this.lastCoins} coins saved to your profile` : r.reason;
    } else if (r.bomb.progress > 0) {
      big = r.bomb.status === 'carried' ? 'PLANTING...' : 'DEFUSING...';
      prog = r.bomb.progress;
    } else if (me && !me.alive && r.phase === 'live') {
      sub = 'You are dead - spectating';
    } else if (me?.alive && r.phase === 'buy') {
      sub = `You are ${TEAM_INFO[myTeam].name} (${TEAM_INFO[myTeam].role}). ` + (myTeam === 'T' ? (r.bomb.carrier === me.id ? 'You have the bomb: go to site A or B, hold E to plant' : 'Escort the bomb carrier') : 'Defend sites A and B');
    } else if (me?.alive && r.bomb.status === 'carried' && r.bomb.carrier === me.id) {
      sub = 'You carry the bomb - hold E inside a site to plant';
    } else if (r.bomb.status === 'planted') {
      sub = myTeam === 'CT' ? 'Bomb planted! Hold E next to it to defuse' : 'Bomb planted - protect it';
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
  if (isTouch) bindTouch();
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
  WEAPONS.forEach((_, i) => { const m = makeWeaponModel(i); m.position.set((i % 3) * 78 - 70, -Math.floor(i / 3) * 24 + 36, 0); sc.add(m); });
  const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 500);
  cam.position.set(40, 0, 190); cam.lookAt(40, 0, 0);
  r.render(sc, cam);
})();
