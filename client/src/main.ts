import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { initAudio, sfx, toggleMute } from './audio';
import {
  Sim, WALLS, WEAPONS, SITES, SPAWN_ZONES, WORLD_W, WORLD_H, PICKUP_R, MAX_HP, TICK_RATE, TEAM_SIZE, WINS_TO_WIN,
  ARMOR_ITEM, ARMOR_COST,
  type Input, type Snapshot, type ServerMsg, type Team,
} from '@fight/shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- input sources ----------
const keys = { up: false, down: false, left: false, right: false, use: false };
const BUY_KEYS: Record<string, number> = { KeyZ: 2, KeyX: 1, KeyC: 3, KeyV: ARMOR_ITEM };
let game: Game | null = null;
const stick = { mx: 0, my: 0, aimAngle: 0, aiming: false };
const mouse = { x: 0, y: 0, down: false };
let weapon = 0;

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
  if (m && v) { const n = Number(m[1]) - 1; if (n >= 0 && n < WEAPONS.length) weapon = n; }
  if (v && code in BUY_KEYS) game?.buy(BUY_KEYS[code]);
  if (code === 'KeyE') keys.use = v;
  if (v && code === 'KeyM') toggleMute();
  if (code === 'KeyW' || code === 'ArrowUp') keys.up = v;
  if (code === 'KeyS' || code === 'ArrowDown') keys.down = v;
  if (code === 'KeyA' || code === 'ArrowLeft') keys.left = v;
  if (code === 'KeyD' || code === 'ArrowRight') keys.right = v;
}
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

// ---------- 3D building blocks ----------
const AIM_HEIGHT = 34; // height of the gun, used when turning the mouse position into an aim direction

interface Character {
  root: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; phase: number;
  mixer?: THREE.AnimationMixer; idle?: THREE.AnimationAction; run?: THREE.AnimationAction; // set for loaded models
}

// ---- optional real character model: drop a .glb at client/public/models/character.glb ----
const MODEL_URL = '/models/character.glb';
const MODEL_YAW = Math.PI / 2; // most glTF characters face +Z; the game faces +X. Change if your model faces the wrong way.
const MODEL_HEIGHT = 58;       // world units; the model is auto-scaled to this height
interface Template { scene: THREE.Group; clips: THREE.AnimationClip[]; scale: number; offsetY: number }
let template: Template | null = null;

async function loadTemplate(): Promise<void> {
  try {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const h = box.max.y - box.min.y;
    if (!(h > 0)) throw new Error('empty model');
    const scale = MODEL_HEIGHT / h;
    template = { scene: gltf.scene, clips: gltf.animations, scale, offsetY: -box.min.y * scale };
    console.info(`Loaded character model (${gltf.animations.length} animations: ${gltf.animations.map((a) => a.name).join(', ')})`);
  } catch {
    template = null; // no model file (or unreadable): the built-in blocky soldier is used instead
  }
}

function makeModelCharacter(color: number): Character {
  const t = template!;
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(t.scene) as THREE.Group;
  model.scale.setScalar(t.scale);
  model.position.y = t.offsetY;
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  const holder = new THREE.Group();
  holder.rotation.y = MODEL_YAW;
  holder.add(model);
  root.add(holder);

  // team-coloured ring under the feet, so teams read clearly whatever the model looks like
  const ring = new THREE.Mesh(new THREE.RingGeometry(15, 21, 28), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 1;
  root.add(ring);
  // simple weapon so the aim direction is always visible
  const gun = new THREE.Mesh(new THREE.BoxGeometry(28, 5, 5), new THREE.MeshStandardMaterial({ color: 0x16181d }));
  gun.position.set(18, 36, 8); gun.castShadow = true;
  root.add(gun);

  const mixer = new THREE.AnimationMixer(model);
  const find = (re: RegExp) => t.clips.find((c) => re.test(c.name));
  const idleClip = find(/idle/i) ?? t.clips[0];
  const runClip = find(/run|jog|walk/i) ?? idleClip;
  const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
  const run = runClip ? mixer.clipAction(runClip) : undefined;
  idle?.play(); run?.play();
  const dummy = () => new THREE.Group();
  return { root, legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), phase: 0, mixer, idle, run };
}

function makeCharacter(color: number): Character {
  const root = new THREE.Group();
  const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05 });
  const part = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };
  const body = mat(color), dark = mat(0x2a2f3a), skin = mat(0xf0c8a0), metal = mat(0x16181d);

  // character faces +x
  root.add(part(new THREE.BoxGeometry(12, 22, 20), body, 0, 33, 0));      // torso
  root.add(part(new THREE.SphereGeometry(8.5, 16, 12), skin, 0, 53, 0));   // head
  const helmet = part(new THREE.SphereGeometry(9.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), dark, 0, 54, 0);
  root.add(helmet);
  root.add(part(new THREE.BoxGeometry(2, 4, 12), dark, 8, 53, 0));         // visor band

  const leg = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 22, z);
    g.add(part(new THREE.BoxGeometry(8, 22, 8), dark, 0, -11, 0));
    root.add(g);
    return g;
  };
  const legL = leg(-5), legR = leg(5);

  const arm = (z: number) => {
    const g = new THREE.Group();
    g.position.set(0, 42, z);
    g.add(part(new THREE.BoxGeometry(6, 6, 18), body, 0, 0, 0));
    root.add(g);
    return g;
  };
  const armL = arm(-13), armR = arm(13);
  armL.rotation.y = 0; armR.rotation.y = 0;
  // arms reach forward to hold the weapon
  armL.children[0].position.set(8, -4, 3); armL.children[0].rotation.y = -0.5;
  armR.children[0].position.set(8, -4, -3); armR.children[0].rotation.y = 0.5;

  const gun = new THREE.Group();
  gun.add(part(new THREE.BoxGeometry(28, 5, 5), metal, 18, 36, 0));
  gun.add(part(new THREE.BoxGeometry(8, 8, 4), metal, 10, 32, 0));
  root.add(gun);

  return { root, legL, legR, armL, armR, phase: Math.random() * 6 };
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

function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#44546a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    const v = 70 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v + 8},${v + 18},0.30)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
  g.strokeStyle = '#2b3646'; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(WORLD_W / 200, WORLD_H / 200);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- game ----------
interface Config { mode: 'single' | 'multi'; name: string; room: string }
interface Shown { x: number; y: number; angle: number; moved: number }

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

    this.buildWorld();
    const bg = new THREE.SphereGeometry(5, 6, 4);
    this.bullets = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffd34d }), 600);
    this.bullets.frustumCulled = false;
    this.scene.add(this.bullets);
    this.bombMesh = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 12), new THREE.MeshStandardMaterial({ color: 0xc0392b, emissive: 0xff2200, emissiveIntensity: 0.5 }));
    this.bombMesh.castShadow = true; this.bombMesh.visible = false;
    this.scene.add(this.bombMesh);
    $('buy').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.buy(Number((b as HTMLElement).dataset.item))));

    if (cfg.mode === 'single') {
      this.sim = new Sim({ rounds: true });
      this.sim.join(this.myId, cfg.name);
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
    this.ws.onopen = () => this.ws!.send(JSON.stringify({ type: 'join', name: this.cfg.name, room: this.cfg.room }));
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as ServerMsg;
      if (m.type === 'welcome') { this.myId = m.id; this.status = `Room: ${m.room}`; }
      else this.snap = m.snap;
    };
    this.ws.onclose = () => { this.status = 'Disconnected (is the server running?)'; };
  }

  buy(item: number) {
    sfx.buy();
    if (this.sim) this.sim.buy(this.myId, item);
    else if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'buy', item }));
  }

  private buildWorld() {
    const s = this.scene;
    s.background = new THREE.Color(0x0b0f14);
    s.fog = new THREE.Fog(0x0b0f14, 900, 2200);

    s.add(new THREE.HemisphereLight(0xdbe8ff, 0x3a4252, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    const cx = WORLD_W / 2, cz = WORLD_H / 2;
    sun.position.set(cx - 500, 900, cz + 400);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -1100, right: 1100, top: 900, bottom: -900, near: 100, far: 2400 });
    sun.shadow.bias = -0.0005;
    s.add(sun, sun.target);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_W, WORLD_H),
      new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    s.add(floor);

    // team spawn zones (tinted) and bomb sites (ringed letters)
    (Object.keys(SPAWN_ZONES) as Team[]).forEach((t) => {
      const z = SPAWN_ZONES[t];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: t === 'CT' ? 0x3f8cff : 0xd9822b, transparent: true, opacity: 0.18 }));
      m.rotation.x = -Math.PI / 2; m.position.set(z.x + z.w / 2, 0.6, z.y + z.h / 2);
      s.add(m);
    });
    for (const site of SITES) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 8, site.r, 48), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.8 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(site.x, 0.8, site.y);
      const fill = new THREE.Mesh(new THREE.CircleGeometry(site.r - 8, 48), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.08 }));
      fill.rotation.x = -Math.PI / 2; fill.position.set(site.x, 0.7, site.y);
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d')!; g.fillStyle = '#ffd34d'; g.font = 'bold 100px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(site.id, 64, 70);
      const letter = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.55 }));
      letter.rotation.x = -Math.PI / 2; letter.position.set(site.x, 0.9, site.y);
      s.add(ring, fill, letter);
    }

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x8a9bb5, roughness: 0.8 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xb4c4dc, roughness: 0.6 });
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x56657c, roughness: 0.9 });
    WALLS.forEach((w, i) => {
      const outer = i < 4;
      const h = outer ? 110 : 64;
      const box = new THREE.Mesh(new THREE.BoxGeometry(w.w, h, w.h), outer ? outerMat : wallMat);
      box.position.set(w.x + w.w / 2, h / 2, w.y + w.h / 2);
      box.castShadow = box.receiveShadow = true;
      s.add(box);
      if (!outer) { // lighter cap so the shape reads clearly from above
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w.w + 2, 4, w.h + 2), edgeMat);
        cap.position.set(w.x + w.w / 2, h + 2, w.y + w.h / 2);
        cap.castShadow = true;
        s.add(cap);
      }
    });
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
    return { mx, my, angle, fire, weapon, use: keys.use };
  }

  private frame() {
    const now = performance.now();
    const delta = Math.min(now - this.last, 100);
    this.last = now;

    const input = this.readInput();
    if (this.sim) {
      this.sim.setInput(this.myId, input);
      this.acc += delta / 1000;
      const dt = 1 / TICK_RATE;
      while (this.acc >= dt) { this.sim.step(dt); this.acc -= dt; }
      this.snap = this.sim.snapshot();
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendAcc += delta;
      if (this.sendAcc >= 1000 / TICK_RATE) {
        this.sendAcc = 0;
        this.ws.send(JSON.stringify({ type: 'input', input }));
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
      if (!d || (!this.sim && Math.hypot(d.x - p.x, d.y - p.y) > 200)) d = { x: p.x, y: p.y, angle: p.angle, moved: 0 };
      const px = d.x, py = d.y;
      if (this.sim) { d.x = p.x; d.y = p.y; } else { d.x += (p.x - d.x) * smooth; d.y += (p.y - d.y) * smooth; }
      let da = p.angle - d.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      d.angle += da * Math.min(1, dt * 20);
      d.moved = Math.hypot(d.x - px, d.y - py) / Math.max(dt, 1e-3); // units/sec, drives the walk cycle
      this.shown.set(p.id, d);

      let c = this.chars.get(p.id);
      if (!c) {
        const teamColor = p.team === 'CT' ? 0x3f8cff : 0xd9822b;
        c = template ? makeModelCharacter(teamColor) : makeCharacter(teamColor);
        this.chars.set(p.id, c);
        this.scene.add(c.root);
      }
      c.root.visible = p.alive;
      c.root.position.set(d.x, 0, d.y);
      c.root.rotation.y = -d.angle;
      const speed = Math.min(1, d.moved / 220);
      if (c.mixer) { // loaded model: blend between its idle and run animations
        const w = Math.min(1, speed * 1.6);
        c.run?.setEffectiveWeight(w); c.idle?.setEffectiveWeight(1 - w);
        if (c.run) c.run.timeScale = 0.6 + speed * 0.8;
        c.mixer.update(dt);
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
      if (!m) { m = makePickup(); this.pickupMeshes.set(k.id, m); this.scene.add(m); }
      m.position.set(k.x, 22 + Math.sin(time * 2 + k.id) * 4, k.y);
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
    this.camera.position.set(this.camTarget.x, 560, this.camTarget.z + 430);
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

    if (s.round) { this.updateHud(s); this.audioEvents(s, performance.now() / 1000); }
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
    const me = s.players.find((p) => p.id === this.myId);
    const myTeam: Team = me?.team ?? 'CT';
    $('ctw').textContent = `CT ${r.ctWins}`;
    $('tw').textContent = `${r.tWins} T`;
    const clock = r.bomb.status === 'planted' ? `BOMB ${Math.ceil(r.bomb.fuse)}s` : r.phase === 'buy' ? 'BUY' : r.phase === 'live' ? fmt(r.timeLeft) : '';
    $('tm').textContent = `R${r.roundNo}  ${clock}`;

    // banner: round result, bomb actions, role hints
    let big = '', sub = '', prog = 0;
    if (r.phase === 'post' || r.phase === 'over') {
      big = r.phase === 'over' ? `${r.winner} WIN THE MATCH` : `${r.winner === 'CT' ? 'COUNTER-TERRORISTS' : 'TERRORISTS'} WIN`;
      sub = r.reason;
    } else if (r.bomb.progress > 0) {
      big = r.bomb.status === 'carried' ? 'PLANTING...' : 'DEFUSING...';
      prog = r.bomb.progress;
    } else if (me && !me.alive && r.phase === 'live') {
      sub = 'You are dead - spectating';
    } else if (me?.alive && r.phase === 'buy') {
      sub = myTeam === 'T' ? (r.bomb.carrier === me.id ? 'You have the bomb: go to site A or B, hold E to plant' : 'Escort the bomb carrier') : 'Defend sites A and B';
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
    $('buy').style.display = showBuy ? 'block' : 'none';
    if (showBuy && me) {
      $('buytime').textContent = `${Math.ceil(r.timeLeft)}s   $${me.money}`;
      const key = `${me.money}|${me.owned}|${me.armor}`;
      if (key !== this.lastBuyState) {
        this.lastBuyState = key;
        $('buy').querySelectorAll('button').forEach((btn) => {
          const item = Number((btn as HTMLElement).dataset.item);
          const cost = item === ARMOR_ITEM ? ARMOR_COST : WEAPONS[item].cost;
          const have = item === ARMOR_ITEM ? me.armor >= 100 : ((me.owned >> item) & 1) === 1;
          (btn as HTMLButtonElement).disabled = have || me.money < cost;
        });
      }
    }

    const owned = WEAPONS.map((w, i) => (((me?.owned ?? 1) >> i) & 1 ? `${i + 1}:${w.name}` : '')).filter(Boolean).join('  ');
    const board = [...s.players]
      .sort((a, b) => (a.team === b.team ? b.score - a.score : a.team === 'CT' ? -1 : 1))
      .map((p) => `${p.id === this.myId ? '&gt;' : '&nbsp;'}${p.team === 'CT' ? 'CT' : 'T&nbsp;'} ${esc(p.name)} ${p.score}/${p.deaths}${p.alive ? '' : ' x'}`)
      .join('<br>');
    this.hud.innerHTML = `${this.status ? esc(this.status) + '<br>' : ''}$${me?.money ?? 0} &nbsp;HP ${me?.hp ?? 0} &nbsp;Armor ${me?.armor ?? 0}<br>Weapon: ${me ? WEAPONS[me.weapon].name : ''} [${owned}]<br>${board}`;
  }
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------- boot ----------
async function start(mode: 'single' | 'multi') {
  const name = ($('name') as HTMLInputElement).value.trim() || 'Player';
  const room = ($('room') as HTMLInputElement).value.trim();
  $('menu').style.display = 'none';
  initAudio();
  if (isTouch) bindTouch();
  await loadTemplate();
  game = new Game({ mode, name, room });
}
$('single').addEventListener('click', () => void start('single'));
$('multi').addEventListener('click', () => void start('multi'));

// dev shortcut: http://localhost:5173/?mode=single (or multi) skips the menu
const auto = new URLSearchParams(location.search).get('mode');
if (auto === 'single' || auto === 'multi') void start(auto);
