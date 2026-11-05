// Map and weapon graphics, all generated in code (no image or model files).
import * as THREE from 'three';
import { WALLS, SITES, SPAWN_ZONES, PICKUP_SPOTS, WORLD_W, WORLD_H, type Rect, type Team } from '@fight/shared';

// ---------- texture helpers ----------
type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;
function canvas(w: number, h: number, draw: Draw): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  return c;
}
function tex(c: HTMLCanvasElement, rx = 1, ry = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

function noise(g: CanvasRenderingContext2D, w: number, h: number, count: number, lo: number, hi: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rnd(lo, hi));
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 4));
  }
}

const concreteC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#7f8a9a'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1500, 90, 200, 0.25);
  g.strokeStyle = '#5d6676'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  g.fillStyle = 'rgba(30,35,45,0.18)';
  for (let i = 0; i < 6; i++) g.fillRect(rnd(0, w), rnd(0, 30), rnd(3, 9), rnd(30, 110)); // rain streaks
});

const brickC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#c9c0b2'; g.fillRect(0, 0, w, h); // mortar
  const bw = 64, bh = 32;
  for (let row = 0; row < h / bh; row++) {
    for (let col = -1; col < w / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      const r = 150 + rnd(-18, 18), gg = 78 + rnd(-10, 10), b = 62 + rnd(-8, 8);
      g.fillStyle = `rgb(${r},${gg},${b})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  noise(g, w, h, 600, 40, 120, 0.18);
});

const ribbedC = (color: number) => canvas(128, 128, (g, w, h) => {
  g.fillStyle = hex(color); g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) {
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 3, h);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, 0, 2, h);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  g.fillStyle = 'rgba(110,60,20,0.25)';
  for (let i = 0; i < 5; i++) g.fillRect(rnd(0, w), rnd(0, h), rnd(4, 14), rnd(10, 40)); // rust
});

const woodC = () => canvas(128, 128, (g, w, h) => {
  g.fillStyle = '#a8793f'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) {
    g.fillStyle = `rgba(${rnd(60, 100)},${rnd(35, 55)},15,0.35)`; g.fillRect(0, y, w, 2);
  }
  noise(g, w, h, 500, 40, 110, 0.2);
  g.strokeStyle = '#5a3a1a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  g.lineWidth = 6; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.moveTo(w - 8, 8); g.lineTo(8, h - 8); g.stroke();
});

const hazardC = () => canvas(128, 128, (g, w, h) => {
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1b1b1b';
  for (let i = -h; i < w + h; i += 32) {
    g.beginPath(); g.moveTo(i, h); g.lineTo(i + 16, h); g.lineTo(i + 16 + h, 0); g.lineTo(i + h, 0); g.closePath(); g.fill();
  }
});

const roofC = () => canvas(128, 128, (g, w, h) => {
  g.fillStyle = '#3b4048'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 500, 40, 100, 0.3);
  g.strokeStyle = '#2a2e35'; g.lineWidth = 2;
  for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
});

const floorC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#4a586b'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1500, 75, 125, 0.28);
  g.strokeStyle = '#2f3947'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
});

// ---------- walls by kind ----------
function faceMats(factory: () => HTMLCanvasElement, w: number, h: number, d: number, tile: number, top: THREE.Material): THREE.Material[] {
  const base = factory();
  const m = (width: number) => new THREE.MeshStandardMaterial({ map: tex(base, Math.max(1, Math.round(width / tile)), Math.max(1, Math.round(h / tile))), roughness: 0.85 });
  const sx = m(d), sz = m(w);
  return [sx, sx, top, top, sz, sz]; // +x, -x, +y, -y, +z, -z
}

const CONTAINER_COLORS = [0xb5483a, 0x2f6fb5, 0x3a8f5a, 0xc98a2e];

function addBox(scene: THREE.Scene, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material | THREE.Material[], shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m);
  return m;
}

function buildWall(scene: THREE.Scene, r: Rect, index: number) {
  const cx = r.x + r.w / 2, cz = r.y + r.h / 2;
  const metal = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35 });
  switch (r.kind) {
    case 'outer': {
      const H = 110;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(concreteC, r.w, H, r.h, 110, new THREE.MeshStandardMaterial({ color: 0x6b7686 })));
      const band = tex(hazardC(), Math.max(1, Math.round(Math.max(r.w, r.h) / 28)), 1);
      addBox(scene, r.w + 2, 6, r.h + 2, cx, H + 3, cz, new THREE.MeshStandardMaterial({ map: band, roughness: 0.7 }), false);
      break;
    }
    case 'container': {
      const H = 64, color = CONTAINER_COLORS[index % CONTAINER_COLORS.length];
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(() => ribbedC(color), r.w, H, r.h, 64, metal(0x50545c)));
      addBox(scene, r.w + 2, 3, r.h + 2, cx, H + 1.5, cz, metal(0x2b2e34), false); // roof rim
      for (const sx of [-1, 1]) addBox(scene, 2, H - 8, r.h - 6, cx + sx * (r.w / 2 + 0.5), H / 2, cz, metal(0x23262b), false); // door ends
      break;
    }
    case 'building': {
      const H = 92;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(brickC, r.w, H, r.h, 96, new THREE.MeshStandardMaterial({ map: tex(roofC(), 2, 3), roughness: 0.9 })));
      addBox(scene, r.w + 10, 6, r.h + 10, cx, H + 3, cz, new THREE.MeshStandardMaterial({ map: tex(roofC(), 2, 3), roughness: 0.9 })); // roof overhang
      addBox(scene, 28, 14, 28, cx - 14, H + 13, cz - 40, metal(0x9aa3ad)); // AC unit
      addBox(scene, 20, 10, 20, cx + 20, H + 11, cz + 50, metal(0x9aa3ad));
      const glow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
      for (const sx of [-1, 1]) {
        addBox(scene, 2, 44, 28, cx + sx * (r.w / 2 + 0.5), 22, cz, new THREE.MeshStandardMaterial({ color: 0x3b2a1b, roughness: 0.8 }), false); // door
        for (const dz of [-60, 60]) addBox(scene, 2, 16, 24, cx + sx * (r.w / 2 + 0.5), 62, cz + dz, glow, false); // lit windows
      }
      break;
    }
    case 'barrier': {
      const H = 44;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(concreteC, r.w, H, r.h, 80, new THREE.MeshStandardMaterial({ color: 0x8a95a5 })));
      const band = tex(hazardC(), Math.max(1, Math.round(Math.max(r.w, r.h) / 30)), 1);
      addBox(scene, r.w + 1.5, 10, r.h + 1.5, cx, H - 12, cz, new THREE.MeshStandardMaterial({ map: band, roughness: 0.7 }), false);
      break;
    }
    case 'crate': {
      const H = r.h;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(woodC, r.w, H, r.h, 44, new THREE.MeshStandardMaterial({ map: tex(woodC()), roughness: 0.9 })));
      break;
    }
    default:
      addBox(scene, r.w, 64, r.h, cx, 32, cz, new THREE.MeshStandardMaterial({ color: 0x8a9bb5 }));
  }
}

// ---------- painted floor markings (one big transparent decal) ----------
function decalCanvas(): HTMLCanvasElement {
  return canvas(WORLD_W, WORLD_H, (g) => {
    // tyre/wear smudges
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(10,14,20,${rnd(0.02, 0.05)})`;
      g.beginPath(); g.ellipse(rnd(60, WORLD_W - 60), rnd(60, WORLD_H - 60), rnd(30, 120), rnd(20, 70), rnd(0, 3), 0, Math.PI * 2); g.fill();
    }
    // lane markings
    g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 5; g.setLineDash([26, 22]);
    const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    line(300, 600, 730, 600); line(870, 600, 1300, 600);
    line(800, 340, 800, 490); line(800, 710, 800, 860);
    g.setLineDash([]);

    // pickup pads
    for (const sp of PICKUP_SPOTS) {
      g.strokeStyle = 'rgba(61,220,132,0.55)'; g.lineWidth = 4;
      g.beginPath(); g.arc(sp.x, sp.y, 30, 0, Math.PI * 2); g.stroke();
    }

    // bomb sites: painted pad with hazard border and a big letter
    for (const s of SITES) {
      const half = 112;
      g.fillStyle = 'rgba(255,211,77,0.10)'; g.fillRect(s.x - half, s.y - half, half * 2, half * 2);
      g.save();
      g.beginPath(); g.rect(s.x - half, s.y - half, half * 2, half * 2); g.rect(s.x - half + 12, s.y - half + 12, half * 2 - 24, half * 2 - 24);
      g.clip('evenodd');
      g.fillStyle = 'rgba(242,194,48,0.85)'; g.fillRect(s.x - half, s.y - half, half * 2, half * 2);
      g.strokeStyle = 'rgba(20,20,20,0.9)'; g.lineWidth = 9;
      for (let i = -half * 2; i < half * 4; i += 26) { g.beginPath(); g.moveTo(s.x - half + i, s.y + half); g.lineTo(s.x - half + i + half * 2, s.y - half); g.stroke(); }
      g.restore();
      g.fillStyle = 'rgba(255,211,77,0.6)'; g.font = 'bold 120px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.id, s.x, s.y + 6);
    }

    // team spawn pads with name and arrows pointing at the map centre
    (Object.keys(SPAWN_ZONES) as Team[]).forEach((t) => {
      const z = SPAWN_ZONES[t];
      const col = t === 'CT' ? '63,140,255' : '217,130,43';
      g.fillStyle = `rgba(${col},0.22)`; g.fillRect(z.x, z.y, z.w, z.h);
      g.strokeStyle = `rgba(${col},0.8)`; g.lineWidth = 5; g.strokeRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4);
      g.save(); g.translate(z.x + z.w / 2, z.y + z.h / 2); g.rotate(-Math.PI / 2);
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = 'bold 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t === 'CT' ? 'CT SPAWN' : 'T SPAWN', 0, 0); g.restore();
      const dir = t === 'T' ? 1 : -1;
      g.strokeStyle = `rgba(${col},0.7)`; g.lineWidth = 7; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ax = (t === 'T' ? z.x + z.w + 30 : z.x - 30) + dir * i * 22, ay = 600;
        g.beginPath(); g.moveTo(ax - dir * 12, ay - 20); g.lineTo(ax + dir * 6, ay); g.lineTo(ax - dir * 12, ay + 20); g.stroke();
      }
    });
  });
}

// ---------- the whole map ----------
export function buildWorld(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x0b0f14);
  scene.fog = new THREE.Fog(0x0b0f14, 900, 2200);

  scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x3a4252, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
  const cx = WORLD_W / 2, cz = WORLD_H / 2;
  sun.position.set(cx - 500, 900, cz + 400);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1100, right: 1100, top: 900, bottom: -900, near: 100, far: 2400 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    new THREE.MeshStandardMaterial({ map: tex(floorC(), WORLD_W / 200, WORLD_H / 200), roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); floor.receiveShadow = true;
  scene.add(floor);

  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_W, WORLD_H),
    new THREE.MeshBasicMaterial({ map: tex(decalCanvas()), transparent: true, depthWrite: false }),
  );
  decal.rotation.x = -Math.PI / 2; decal.position.set(cx, 0.5, cz);
  scene.add(decal);

  WALLS.forEach((w, i) => buildWall(scene, w, i));

  // lamp posts around each bomb site, with a warm light over the site itself
  const pole = new THREE.MeshStandardMaterial({ color: 0x20242b, metalness: 0.5, roughness: 0.5 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff0b8 });
  for (const s of SITES) {
    for (const dx of [-120, 120]) for (const dz of [-100, 100]) {
      const x = s.x + dx, z = s.y + dz;
      if (WALLS.some((w) => x > w.x - 6 && x < w.x + w.w + 6 && z > w.y - 6 && z < w.y + w.h + 6)) continue;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 120, 8), pole);
      p.position.set(x, 60, z); p.castShadow = true; scene.add(p);
      const head = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 14), lamp);
      head.position.set(x, 122, z); scene.add(head);
    }
    const light = new THREE.PointLight(0xffd9a0, 9000, 420, 2);
    light.position.set(s.x, 130, s.y);
    scene.add(light);
  }
}

// ---------- weapon models (barrel points along +x, origin at the grip) ----------
export function makeWeaponModel(idx: number): THREE.Group {
  const g = new THREE.Group();
  const mat = (c: number, metal = 0.4, rough = 0.5) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough });
  const dark = mat(0x23262c), steel = mat(0x4b5059, 0.7, 0.35), olive = mat(0x4a5238, 0.2, 0.7), wood = mat(0x7a4a24, 0.05, 0.8), black = mat(0x15171b);
  const part = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.rotation.z = rz; mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (idx) {
    case 0: // pistol: short slide on a angled grip
      part(15, 4.5, 3.6, steel, 7, 2); part(3, 2.4, 2.4, dark, 16, 2); part(4.2, 9.5, 3.4, black, 1, -3, 0, -0.18); part(5, 1.5, 3.6, dark, 5, -1.5);
      break;
    case 1: // rifle: olive body, magazine, stock, top rail
      part(26, 5.5, 4.2, olive, 12, 0); part(15, 2.2, 2.2, dark, 32, 0.6); part(5, 11, 3.6, black, 14, -8, 0, 0.15);
      part(14, 6.5, 3.8, black, -7, -1); part(11, 2, 2.4, dark, 14, 4); part(5, 3, 3.2, dark, 24, 2); part(3, 8, 3.2, black, 4, -6, 0, -0.2);
      break;
    case 2: // shotgun: long barrel, wooden pump and stock
      part(36, 3.6, 3.6, steel, 17, 1.2); part(11, 5.2, 5.8, wood, 20, -2.4); part(13, 6.5, 4.6, dark, 3, 0); part(15, 6.8, 4.2, wood, -10, -1.6, 0, -0.08);
      part(3, 5, 4, dark, 36, 1.2);
      break;
    default: { // sniper: very long barrel, big scope, bipod
      part(44, 2.8, 2.8, steel, 30, 0.8); part(25, 5.6, 4.2, mat(0x2f3b2c, 0.2, 0.7), 6, 0); part(17, 7.5, 4.2, mat(0x2f3b2c, 0.2, 0.7), -12, -1.5, 0, -0.1);
      part(6, 3.5, 3.5, dark, 53, 0.8);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 17, 12), black);
      scope.rotation.z = Math.PI / 2; scope.position.set(9, 6.6, 0); scope.castShadow = true; g.add(scope);
      for (const dx of [-9, 9]) {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.5, 12), new THREE.MeshBasicMaterial({ color: 0x66aaff }));
        lens.rotation.z = Math.PI / 2; lens.position.set(9 + dx, 6.6, 0); g.add(lens);
      }
      part(1.6, 8, 1.6, dark, 24, -3.5, 3, 0.35); part(1.6, 8, 1.6, dark, 24, -3.5, -3, -0.35);
    }
  }
  return g;
}
