// Map and weapon graphics, all generated in code (no image or model files).
// Theme: a sunny Mediterranean old town (terracotta pavers, plaster shopfronts, tiled roofs, a fountain).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WEAPONS, TEAM_INFO, WORLD_W, WORLD_H, defaultCustom, type MapDef, type Rect, type Team } from '@fight/shared';

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
const shade = (n: number, f: number) => {
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
};

function noise(g: CanvasRenderingContext2D, w: number, h: number, count: number, lo: number, hi: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rnd(lo, hi));
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 4));
  }
}

/** Painted plaster wall, optionally with a shuttered window. */
const plasterC = (color: number, window: boolean, shutter = 0x3f6b4a) => canvas(256, 256, (g, w, h) => {
  g.fillStyle = hex(color); g.fillRect(0, 0, w, h);
  noise(g, w, h, 1400, 90, 220, 0.12);
  g.fillStyle = 'rgba(60,40,25,0.10)';
  for (let i = 0; i < 7; i++) g.fillRect(rnd(0, w), rnd(0, 40), rnd(3, 10), rnd(40, 150)); // weathering streaks
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, h - 22, w, 22);                            // dirty base
  if (window) {
    const wx = 88, wy = 70, ww = 80, wh = 112;
    g.fillStyle = shade(color, 0.7); g.fillRect(wx - 10, wy - 10, ww + 20, wh + 20);          // surround
    const grd = g.createLinearGradient(0, wy, 0, wy + wh); grd.addColorStop(0, '#6f8fa8'); grd.addColorStop(1, '#2d3f52');
    g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);                                            // glass
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(wx + 6, wy + 6, 14, wh - 12);
    g.fillStyle = '#2b2b2b'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh / 2 - 2, ww, 4); // frame
    g.fillStyle = hex(shutter);                                                               // shutters
    g.fillRect(wx - 34, wy, 30, wh); g.fillRect(wx + ww + 4, wy, 30, wh);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let y = wy + 8; y < wy + wh; y += 10) { g.beginPath(); g.moveTo(wx - 34, y); g.lineTo(wx - 4, y); g.moveTo(wx + ww + 4, y); g.lineTo(wx + ww + 34, y); g.stroke(); }
    g.fillStyle = '#d8cfc0'; g.fillRect(wx - 14, wy + wh + 10, ww + 28, 8);                   // sill
  }
});

const roofTileC = () => canvas(128, 128, (g, w, h) => {
  g.fillStyle = '#9c4a2a'; g.fillRect(0, 0, w, h);
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 9; col++) {
      const x = col * 16 + (row % 2 ? 8 : 0), y = row * 16;
      g.fillStyle = `rgb(${175 + rnd(-18, 18)},${88 + rnd(-10, 10)},${52 + rnd(-8, 8)})`;
      g.beginPath(); g.arc(x + 8, y + 8, 9, 0, Math.PI); g.lineTo(x - 1, y + 8); g.fill();
      g.strokeStyle = 'rgba(60,20,10,0.45)'; g.lineWidth = 1.5; g.stroke();
    }
  }
});

const paverC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#7d5c4a'; g.fillRect(0, 0, w, h); // mortar
  const bw = 64, bh = 32;
  for (let row = 0; row < h / bh; row++) {
    for (let col = -1; col < w / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      g.fillStyle = `rgb(${186 + rnd(-20, 20)},${128 + rnd(-14, 14)},${98 + rnd(-12, 12)})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  noise(g, w, h, 900, 60, 160, 0.14);
});

const stoneC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#9d8b6a'; g.fillRect(0, 0, w, h);
  const bw = 64, bh = 42;
  for (let row = 0; row < h / bh + 1; row++) {
    for (let col = -1; col < w / bw + 1; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh;
      const v = rnd(-14, 14);
      g.fillStyle = `rgb(${208 + v},${186 + v},${146 + v})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  noise(g, w, h, 700, 90, 200, 0.14);
});

const awningC = () => canvas(128, 64, (g, w, h) => {
  for (let x = 0; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#f1ead9' : '#b8352b'; g.fillRect(x, 0, 16, h); }
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, h - 10, w, 10);
});

const woodC = () => canvas(128, 128, (g, w, h) => {
  g.fillStyle = '#a8793f'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) { g.fillStyle = `rgba(${rnd(60, 100)},${rnd(35, 55)},15,0.35)`; g.fillRect(0, y, w, 2); }
  noise(g, w, h, 500, 40, 110, 0.2);
  g.strokeStyle = '#5a3a1a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
  g.lineWidth = 6; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.moveTo(w - 8, 8); g.lineTo(8, h - 8); g.stroke();
});

/** Front of the fountain wall: red plaster upper part and a stone arched niche with a spout. */
const fountainFaceC = (upper = '#b5483a', lower = '#cdb48a') => canvas(256, 128, (g, w, h) => {
  g.fillStyle = upper; g.fillRect(0, 0, w, h);
  noise(g, w, h, 600, 90, 200, 0.12);
  g.fillStyle = '#d9cdb6'; g.fillRect(0, h * 0.52, w, 6);                                   // cornice
  g.fillStyle = lower; g.fillRect(0, h * 0.52 + 6, w, h);                               // stone lower half
  const cx = w / 2, top = h * 0.5;
  g.fillStyle = '#e7dcc4'; g.beginPath(); g.moveTo(cx - 44, h); g.lineTo(cx - 44, top + 30); g.arc(cx, top + 30, 44, Math.PI, 0); g.lineTo(cx + 44, h); g.fill(); // arch frame
  g.fillStyle = '#3a342d'; g.beginPath(); g.moveTo(cx - 34, h); g.lineTo(cx - 34, top + 32); g.arc(cx, top + 32, 34, Math.PI, 0); g.lineTo(cx + 34, h); g.fill(); // recess
  g.fillStyle = '#b9a47c'; g.beginPath(); g.arc(cx, top + 34, 11, 0, Math.PI * 2); g.fill(); // spout medallion
  g.fillStyle = '#6fa8d8'; g.fillRect(cx - 3, top + 40, 6, h - top - 40);                   // water
});

const floorC = paverC;

// ---- dock / desert textures ----
const concreteC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#7f8a9a'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1500, 90, 200, 0.25);
  g.strokeStyle = '#5d6676'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
  g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
  g.fillStyle = 'rgba(30,35,45,0.18)';
  for (let i = 0; i < 6; i++) g.fillRect(rnd(0, w), rnd(0, 30), rnd(3, 9), rnd(30, 110));
});
const brickC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#c9c0b2'; g.fillRect(0, 0, w, h);
  const bw = 64, bh = 32;
  for (let row = 0; row < h / bh; row++) for (let col = -1; col < w / bw + 1; col++) {
    g.fillStyle = `rgb(${150 + rnd(-18, 18)},${78 + rnd(-10, 10)},${62 + rnd(-8, 8)})`;
    g.fillRect(col * bw + (row % 2 ? bw / 2 : 0) + 2, row * bh + 2, bw - 4, bh - 4);
  }
  noise(g, w, h, 600, 40, 120, 0.18);
});
const ribbedC = (color: number) => canvas(128, 128, (g, w, h) => {
  g.fillStyle = hex(color); g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, 0, 3, h); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 3, 0, 2, h); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  g.fillStyle = 'rgba(110,60,20,0.25)';
  for (let i = 0; i < 5; i++) g.fillRect(rnd(0, w), rnd(0, h), rnd(4, 14), rnd(10, 40));
});
const hazardC = () => canvas(128, 128, (g, w, h) => {
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b';
  for (let i = -h; i < w + h; i += 32) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 16, h); g.lineTo(i + 16 + h, 0); g.lineTo(i + h, 0); g.closePath(); g.fill(); }
});
const sandstoneC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#a98a5c'; g.fillRect(0, 0, w, h);
  const bw = 64, bh = 42;
  for (let row = 0; row < h / bh + 1; row++) for (let col = -1; col < w / bw + 1; col++) {
    const v = rnd(-16, 16);
    g.fillStyle = `rgb(${222 + v},${186 + v},${132 + v})`;
    g.fillRect(col * bw + (row % 2 ? bw / 2 : 0) + 2, row * bh + 2, bw - 4, bh - 4);
  }
  noise(g, w, h, 800, 100, 220, 0.14);
});
const dockFloorC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#59606b'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 1800, 70, 150, 0.3);
  g.strokeStyle = '#3a4048'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
  g.fillStyle = 'rgba(15,15,20,0.25)';
  for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(rnd(30, 226), rnd(30, 226), rnd(10, 40), rnd(6, 20), rnd(0, 3), 0, Math.PI * 2); g.fill(); } // oil stains
});
const sandFloorC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#d9b97d'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 2200, 160, 245, 0.28);
  g.strokeStyle = 'rgba(150,110,60,0.18)'; g.lineWidth = 3;
  for (let y = 10; y < h; y += 26) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.08 + y) * 3); g.stroke(); } // wind ripples
});

// ---------- walls by kind ----------
function faceMats(factory: () => HTMLCanvasElement, w: number, h: number, d: number, tile: number, top: THREE.Material): THREE.Material[] {
  const base = factory();
  const m = (width: number) => new THREE.MeshStandardMaterial({ map: tex(base, Math.max(1, Math.round(width / tile)), Math.max(1, Math.round(h / tile))), roughness: 0.9 });
  const sx = m(d), sz = m(w);
  return [sx, sx, top, top, sz, sz]; // +x, -x, +y, -y, +z, -z
}

function addBox(scene: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material | THREE.Material[], shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  scene.add(m);
  return m;
}

const PLASTERS = [0xc8553d, 0xd9a441, 0xe8dcc0, 0xc4793f]; // red, ochre, cream, terracotta
const SHUTTERS = [0x3f6b4a, 0x2f5f86, 0x6b3b2a, 0x3f6b4a];
const roofMat = () => new THREE.MeshStandardMaterial({ map: tex(roofTileC(), 3, 1), roughness: 0.8 });

function buildWallTown(scene: THREE.Scene, r: Rect, index: number) {
  const cx = r.x + r.w / 2, cz = r.y + r.h / 2;
  const std = (c: number, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  switch (r.kind) {
    case 'outer': { // tall town facades along the map edge
      const H = 120, c = PLASTERS[index % PLASTERS.length];
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(() => plasterC(c, true, SHUTTERS[index % SHUTTERS.length]), r.w, H, r.h, 120, std(shade(c, 0.9) === '' ? c : c)));
      addBox(scene, r.w + 8, 10, r.h + 8, cx, H + 5, cz, roofMat(), false); // clay-tile roof edge
      break;
    }
    case 'shop': { // low plaster shopfronts with an awning
      const H = 72, i = index % PLASTERS.length, c = PLASTERS[i];
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(() => plasterC(c, true, SHUTTERS[i]), r.w, H, r.h, 90, std(0x7a3a28)));
      addBox(scene, r.w + 6, 6, r.h + 6, cx, H + 3, cz, roofMat(), false);
      for (const sz of [-1, 1]) {
        const aw = addBox(scene, r.w - 20, 3, 16, cx, 46, cz + sz * (r.h / 2 + 7), new THREE.MeshStandardMaterial({ map: tex(awningC(), Math.round(r.w / 40), 1), roughness: 0.9 }), false);
        aw.rotation.x = sz * -0.35; // sloped awning
      }
      break;
    }
    case 'fountain': { // the red-and-stone fountain wall in the middle of the plaza
      const H = 96;
      const face = new THREE.MeshStandardMaterial({ map: tex(fountainFaceC()), roughness: 0.85 });
      const side = new THREE.MeshStandardMaterial({ map: tex(stoneC(), 1, 1), roughness: 0.9 });
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, [face, face, std(0x8a4a38), std(0x6e5a44), side, side]);
      addBox(scene, r.w + 8, 8, r.h + 8, cx, H + 4, cz, roofMat(), false);
      for (const sx of [-1, 1]) { // basins with water in front of the niches
        addBox(scene, 26, 14, 70, cx + sx * (r.w / 2 + 14), 7, cz, std(0xcdb48a, 0.9));
        addBox(scene, 20, 2, 60, cx + sx * (r.w / 2 + 14), 13, cz, new THREE.MeshStandardMaterial({ color: 0x5aa0d8, roughness: 0.15, metalness: 0.1 }), false);
      }
      break;
    }
    case 'barrier': { // low sandstone wall with a capstone
      const H = 40;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(stoneC, r.w, H, r.h, 80, std(0xd8c7a0)));
      addBox(scene, r.w + 4, 5, r.h + 4, cx, H + 2.5, cz, std(0xe3d6b4), false);
      break;
    }
    case 'crate': {
      const H = r.h;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(woodC, r.w, H, r.h, 44, new THREE.MeshStandardMaterial({ map: tex(woodC()), roughness: 0.9 })));
      break;
    }
    case 'scooter': {
      const g = makeScooter();
      g.position.set(cx, 0, cz);
      scene.add(g);
      break;
    }
    default:
      addBox(scene, r.w, 64, r.h, cx, 32, cz, std(0xb8a58a));
  }
}

const CONTAINER_COLORS = [0xb5483a, 0x2f6fb5, 0x3a8f5a, 0xc98a2e];

function buildWallDock(scene: THREE.Scene, r: Rect, index: number) {
  const cx = r.x + r.w / 2, cz = r.y + r.h / 2;
  const std = (c: number, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });
  const metal = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.35 });
  switch (r.kind) {
    case 'outer': {
      const H = 110;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(concreteC, r.w, H, r.h, 110, std(0x6b7686)));
      addBox(scene, r.w + 2, 6, r.h + 2, cx, H + 3, cz, new THREE.MeshStandardMaterial({ map: tex(hazardC(), Math.max(1, Math.round(Math.max(r.w, r.h) / 28)), 1), roughness: 0.7 }), false);
      break;
    }
    case 'shop': { // shipping containers
      const H = 64, color = CONTAINER_COLORS[index % CONTAINER_COLORS.length];
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(() => ribbedC(color), r.w, H, r.h, 64, metal(0x50545c)));
      addBox(scene, r.w + 2, 3, r.h + 2, cx, H + 1.5, cz, metal(0x2b2e34), false);
      for (const sx of [-1, 1]) addBox(scene, 2, H - 8, r.h - 6, cx + sx * (r.w / 2 + 0.5), H / 2, cz, metal(0x23262b), false);
      break;
    }
    case 'fountain': { // brick warehouse
      const H = 92;
      const roof = new THREE.MeshStandardMaterial({ map: tex(roofTileC(), 2, 3), roughness: 0.9 });
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(brickC, r.w, H, r.h, 96, roof));
      addBox(scene, r.w + 10, 6, r.h + 10, cx, H + 3, cz, std(0x3b4048, 0.9));
      addBox(scene, 28, 14, 28, cx - 14, H + 13, cz - 20, metal(0x9aa3ad));
      const glow = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
      for (const sx of [-1, 1]) {
        addBox(scene, 2, 44, 28, cx + sx * (r.w / 2 + 0.5), 22, cz, std(0x3b2a1b), false);
        for (const dz of [-r.h / 3, r.h / 3]) addBox(scene, 2, 16, 22, cx + sx * (r.w / 2 + 0.5), 62, cz + dz, glow, false);
      }
      break;
    }
    case 'barrier': {
      const H = 44;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(concreteC, r.w, H, r.h, 80, std(0x8a95a5)));
      addBox(scene, r.w + 1.5, 10, r.h + 1.5, cx, H - 12, cz, new THREE.MeshStandardMaterial({ map: tex(hazardC(), Math.max(1, Math.round(Math.max(r.w, r.h) / 30)), 1), roughness: 0.7 }), false);
      break;
    }
    default: buildWallTown(scene, r, index);
  }
}

function buildWallDesert(scene: THREE.Scene, r: Rect, index: number) {
  const cx = r.x + r.w / 2, cz = r.y + r.h / 2;
  const std = (c: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  switch (r.kind) {
    case 'outer': {
      const H = 100;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(sandstoneC, r.w, H, r.h, 100, std(0xc9a46a)));
      addBox(scene, r.w + 6, 8, r.h + 6, cx, H + 4, cz, std(0xb08850));
      break;
    }
    case 'shop': { // adobe house with a flat roof and wooden beam ends
      const H = 68;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(() => plasterC(0xd9b98a, true, 0x7a4a2a), r.w, H, r.h, 90, std(0xc4a070)));
      addBox(scene, r.w + 8, 6, r.h + 8, cx, H + 3, cz, std(0xb8925c));
      const beam = std(0x5a3a1c);
      for (let i = 0; i < 3; i++) for (const sz of [-1, 1]) addBox(scene, 4, 4, 14, cx - r.w / 3 + i * (r.w / 3), H - 10, cz + sz * (r.h / 2 + 6), beam, false);
      break;
    }
    case 'fountain': { // stone well / shrine
      const H = 84;
      const face = new THREE.MeshStandardMaterial({ map: tex(fountainFaceC('#c79a5b', '#d8c08c')), roughness: 0.9 });
      const side = new THREE.MeshStandardMaterial({ map: tex(sandstoneC(), 1, 1), roughness: 0.9 });
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, [side, side, std(0x9a7a4a), std(0x6e5a44), face, face]);
      addBox(scene, r.w + 8, 8, r.h + 8, cx, H + 4, cz, std(0xb08850));
      for (const sz of [-1, 1]) {
        addBox(scene, 60, 14, 26, cx, 7, cz + sz * (r.h / 2 + 14), std(0xd8c08c));
        addBox(scene, 52, 2, 20, cx, 13, cz + sz * (r.h / 2 + 14), new THREE.MeshStandardMaterial({ color: 0x5aa0d8, roughness: 0.15 }), false);
      }
      break;
    }
    case 'barrier': {
      const H = 36;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(sandstoneC, r.w, H, r.h, 80, std(0xe0c690)));
      addBox(scene, r.w + 4, 5, r.h + 4, cx, H + 2.5, cz, std(0xe8d3a0), false);
      break;
    }
    default: buildWallTown(scene, r, index);
  }
}

// ---------- medieval village (CC0 Quaternius "Medieval Village MegaKit" pieces in /models/village + painted textures) ----------
const KIT = '/models/village/';
function kitTex(name: string, rx: number, ry: number): THREE.Texture {
  const t = new THREE.TextureLoader().load(KIT + name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const kitLoader = new GLTFLoader();
const kitCache = new Map<string, Promise<THREE.Object3D>>();
const kitModel = (name: string) => {
  let p = kitCache.get(name);
  if (!p) { p = kitLoader.loadAsync(`${KIT}${name}.gltf`).then((g) => g.scene); kitCache.set(name, p); }
  return p;
};
/** Load a kit piece, stretch it to the given footprint / height and put it on top of `baseY`. Returns false if the file is missing. */
function placeKit(scene: THREE.Scene, name: string, cx: number, cz: number, baseY: number, fw: number, fh: number, fd: number, turn: boolean, fallback?: () => void) {
  kitModel(name).then((src) => {
    const inner = src.clone(true); inner.rotation.y = turn ? Math.PI / 2 : 0;
    const outer = new THREE.Group(); outer.add(inner); outer.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(outer); const size = box.getSize(new THREE.Vector3());
    outer.scale.set(fw / size.x, fh / size.y, fd / size.z); outer.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(outer); const c = box.getCenter(new THREE.Vector3());
    outer.position.set(cx - c.x, baseY - box.min.y, cz - c.z);
    outer.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(outer);
  }).catch(() => fallback?.());
}
const dirtFloorC = () => canvas(256, 256, (g, w, h) => {
  g.fillStyle = '#7d6648'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 2400, 60, 170, 0.3);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(${rnd(60, 90)},${rnd(95, 125)},${rnd(40, 60)},0.35)`; g.beginPath(); g.ellipse(rnd(0, w), rnd(0, h), rnd(8, 26), rnd(5, 14), rnd(0, 3), 0, Math.PI * 2); g.fill(); } // grass tufts
  g.fillStyle = 'rgba(40,28,18,0.25)';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(rnd(20, 236), rnd(20, 236), rnd(10, 30), rnd(4, 9), rnd(0, 3), 0, Math.PI * 2); g.fill(); } // puddles / mud
  g.strokeStyle = 'rgba(30,20,10,0.22)'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 70); g.lineTo(w, 82); g.moveTo(0, 176); g.lineTo(w, 168); g.stroke(); // cart ruts
});
function stoneFaces(w: number, h: number, d: number, tile: number, top: THREE.Material, tint = 0xffffff): THREE.Material[] {
  const m = (width: number) => new THREE.MeshStandardMaterial({ map: kitTex('T_UnevenBrick_BaseColor.jpg', Math.max(1, width / tile), Math.max(1, h / tile)), color: tint, roughness: 0.95 });
  const sx = m(d), sz = m(w);
  return [sx, sx, top, top, sz, sz];
}
const COTTAGE = [0xe8dcc0, 0xd9b98a, 0xcdbf9f, 0xe2c9a0];
function buildWallVillage(scene: THREE.Scene, r: Rect, index: number) {
  const cx = r.x + r.w / 2, cz = r.y + r.h / 2;
  const std = (c: number, rough = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  switch (r.kind) {
    case 'outer': { // dry-stone boundary wall with a mossy cap
      const H = 96;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, stoneFaces(r.w, H, r.h, 100, std(0x6f6a5c)));
      addBox(scene, r.w + 6, 7, r.h + 6, cx, H + 3.5, cz, std(0x5f6f4a), false);
      break;
    }
    case 'shop': { // cottage: plaster walls with shuttered windows, timber corner posts and a real tiled roof
      const H = 78, c = COTTAGE[index % COTTAGE.length];
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, faceMats(() => plasterC(c, true, SHUTTERS[index % SHUTTERS.length]), r.w, H, r.h, 90, std(0x7a6a55)));
      const wood = std(0x4a3320);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(scene, 6, H + 2, 6, cx + sx * r.w / 2, H / 2, cz + sz * r.h / 2, wood, false);
      for (const sz of [-1, 1]) addBox(scene, r.w + 4, 5, 4, cx, H - 2, cz + sz * (r.h / 2 + 1), wood, false);       // timber beam under the roof
      addBox(scene, r.w + 12, 5, r.h + 12, cx, H + 2, cz, std(0x6b4f33), false);                                     // temporary roof deck (visible if the kit is missing)
      placeKit(scene, 'Roof_RoundTiles_6x8', cx, cz, H, r.w + 22, 46, r.h + 22, r.w > r.h);
      break;
    }
    case 'fountain': { // stone mill tower with a round-tile cap
      const H = 130;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, stoneFaces(r.w, H, r.h, 80, std(0x6f6a5c), 0xe6e0d0));
      addBox(scene, r.w + 8, 6, r.h + 8, cx, H + 1, cz, std(0x50483b), false);
      placeKit(scene, 'Roof_Tower_RoundTiles', cx, cz, H, r.w + 26, 64, r.h + 26, false);
      for (const sz of [-1, 1]) addBox(scene, 34, 3, 22, cx, 2, cz + sz * (r.h / 2 + 12), std(0x5c4a35), false); // worn doorstep
      break;
    }
    case 'barrier': { // low fieldstone wall
      const H = 38;
      addBox(scene, r.w, H, r.h, cx, H / 2, cz, stoneFaces(r.w, H, r.h, 70, std(0x77705f)));
      addBox(scene, r.w + 4, 5, r.h + 4, cx, H + 2.5, cz, std(0x6c7d4c), false);
      break;
    }
    case 'crate': {
      const box = () => { const f = faceMats(woodC, r.w, r.h, r.h, 44, new THREE.MeshStandardMaterial({ map: tex(woodC()), roughness: 0.9 })); addBox(scene, r.w, r.h, r.h, cx, r.h / 2, cz, f); };
      placeKit(scene, 'Prop_Crate', cx, cz, 0, r.w, r.h, r.h, false, box);
      break;
    }
    case 'scooter': { // hay wagon
      placeKit(scene, 'Prop_Wagon', cx, cz, 0, r.h + 8, 26, r.w + 8, false, () => addBox(scene, r.w, 14, r.h, cx, 7, cz, std(0x6b4f33)));
      break;
    }
    default: buildWallTown(scene, r, index);
  }
}

function buildWall(scene: THREE.Scene, r: Rect, index: number, theme: MapDef['theme']) {
  if (theme === 'village') buildWallVillage(scene, r, index);
  else if (theme === 'dock') buildWallDock(scene, r, index);
  else if (theme === 'desert') buildWallDesert(scene, r, index);
  else buildWallTown(scene, r, index);
}

function makeScooter(): THREE.Group {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.35, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.7 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d4da, roughness: 0.25, metalness: 0.8 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z = 0, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.set(rx, 0, rz); mesh.castShadow = true; g.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(18, 13, 11), paint, -7, 13);                  // rear body
  add(new THREE.BoxGeometry(4, 22, 10), paint, 9, 15, 0, 0, -0.2);         // front shield
  add(new THREE.BoxGeometry(13, 3, 8), dark, -6, 21);                      // seat
  add(new THREE.BoxGeometry(2, 2.2, 15), chrome, 11, 27);                  // handlebar
  add(new THREE.SphereGeometry(2.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3c0 }), 12.5, 24);
  for (const wx of [-12, 12]) add(new THREE.CylinderGeometry(6, 6, 4, 14), dark, wx, 6, 0, Math.PI / 2);
  return g;
}

// ---------- painted floor markings (one big transparent decal) ----------
function decalCanvas(map: MapDef, mode?: string): HTMLCanvasElement {
  return canvas(WORLD_W, WORLD_H, (g) => {
    for (let i = 0; i < 30; i++) { // worn patches
      g.fillStyle = `rgba(40,20,10,${rnd(0.02, 0.05)})`;
      g.beginPath(); g.ellipse(rnd(60, WORLD_W - 60), rnd(60, WORLD_H - 60), rnd(30, 120), rnd(20, 70), rnd(0, 3), 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(255,245,225,0.35)'; g.lineWidth = 5; g.setLineDash([26, 22]);
    const line = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
    const mx = WORLD_W / 2, my = WORLD_H / 2;
    line(mx - 520, my, mx - 70, my); line(mx + 70, my, mx + 520, my);
    line(mx, my - 260, mx, my - 110); line(mx, my + 110, mx, my + 260);
    g.setLineDash([]);

    for (const sp of map.heal) {
      g.strokeStyle = 'rgba(61,220,132,0.7)'; g.lineWidth = 4;
      g.beginPath(); g.arc(sp.x, sp.y, 30, 0, Math.PI * 2); g.stroke();
    }

    for (const s of map.sites) { // bomb sites: hazard-bordered pad with a big letter
      const half = 112;
      g.fillStyle = 'rgba(255,225,120,0.12)'; g.fillRect(s.x - half, s.y - half, half * 2, half * 2);
      g.save();
      g.beginPath(); g.rect(s.x - half, s.y - half, half * 2, half * 2); g.rect(s.x - half + 12, s.y - half + 12, half * 2 - 24, half * 2 - 24);
      g.clip('evenodd');
      g.fillStyle = 'rgba(242,194,48,0.9)'; g.fillRect(s.x - half, s.y - half, half * 2, half * 2);
      g.strokeStyle = 'rgba(20,20,20,0.9)'; g.lineWidth = 9;
      for (let i = -half * 2; i < half * 4; i += 26) { g.beginPath(); g.moveTo(s.x - half + i, s.y + half); g.lineTo(s.x - half + i + half * 2, s.y - half); g.stroke(); }
      g.restore();
      g.fillStyle = 'rgba(255,240,170,0.7)'; g.font = 'bold 120px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(s.id, s.x, s.y + 6);
    }

    (Object.keys(map.spawns) as Team[]).forEach((t) => {
      const z = map.spawns[t];
      const col = t === 'CT' ? '63,140,255' : '235,140,40';
      g.fillStyle = `rgba(${col},0.28)`; g.fillRect(z.x, z.y, z.w, z.h);
      g.strokeStyle = `rgba(${col},0.9)`; g.lineWidth = 5; g.strokeRect(z.x + 2, z.y + 2, z.w - 4, z.h - 4);
      g.save(); g.translate(z.x + z.w / 2, z.y + z.h / 2); g.rotate(-Math.PI / 2);
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(mode === 'rescue' && t === 'CT' ? 'SENTINELS SPAWN - EXTRACTION' : `${TEAM_INFO[t].name.toUpperCase()} SPAWN`, 0, 0); g.restore();
      if (mode === 'rescue' && t === 'CT') {                                   // the extraction zone: a green pad around the spawn
        g.fillStyle = 'rgba(61,220,132,0.22)'; g.fillRect(z.x - 70, z.y - 70, z.w + 140, z.h + 140);
        g.strokeStyle = 'rgba(61,220,132,0.95)'; g.lineWidth = 7; g.setLineDash([22, 14]); g.strokeRect(z.x - 68, z.y - 68, z.w + 136, z.h + 136); g.setLineDash([]);
      }
      const dir = t === 'T' ? 1 : -1;
      g.strokeStyle = `rgba(${col},0.85)`; g.lineWidth = 7; g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ax = (t === 'T' ? z.x + z.w + 30 : z.x - 30) + dir * i * 22, ay = WORLD_H / 2;
        g.beginPath(); g.moveTo(ax - dir * 12, ay - 20); g.lineTo(ax + dir * 6, ay); g.lineTo(ax - dir * 12, ay + 20); g.stroke();
      }
    });
  });
}

// ---------- bunting strung between lamp posts ----------
function bunting(a: THREE.Vector3, b: THREE.Vector3): THREE.Object3D {
  const g = new THREE.Group();
  const N = 14, sag = 12;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * sag, a.z + (b.z - a.z) * t));
  }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
  const colors = [0xd23b3b, 0xf2c230, 0x3b82d2, 0xf5f0e6, 0x3ba65b];
  const verts: number[] = [], cols: number[] = [];
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  for (let i = 0; i < N; i++) {
    const p = pts[i].clone().lerp(pts[i + 1], 0.5), half = a.distanceTo(b) / N * 0.32;
    const c = new THREE.Color(colors[i % colors.length]);
    const l = p.clone().addScaledVector(dir, -half), r = p.clone().addScaledVector(dir, half), tip = p.clone().add(new THREE.Vector3(0, -12, 0));
    for (const v of [l, r, tip]) { verts.push(v.x, v.y, v.z); cols.push(c.r, c.g, c.b); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  return g;
}

// ---------- the whole map ----------
const THEMES = {
  town:   { sky: 0xa9ccee, fogNear: 1300, fogFar: 3600, hemi: [0xdcecff, 0x9a7456, 1.9], sun: [0xfff0d2, 2.8], ground: 0x8a6a4e, bunting: true },
  dock:   { sky: 0x8ea1b5, fogNear: 1000, fogFar: 2800, hemi: [0xd5deea, 0x5a5f66, 1.6], sun: [0xe3ecff, 2.1], ground: 0x4a5058, bunting: false },
  desert: { sky: 0xe9cf9f, fogNear: 1400, fogFar: 3800, hemi: [0xfff0d8, 0xb08a5a, 2.1], sun: [0xffe2b0, 3.1], ground: 0xcfa96c, bunting: false },
  village: { sky: 0xb9cfdc, fogNear: 1100, fogFar: 3200, hemi: [0xdbe8f2, 0x5d6b3c, 1.8], sun: [0xffe9c4, 2.5], ground: 0x55703a, bunting: false },
} as const;

export function buildWorld(scene: THREE.Scene, map: MapDef, mode?: string) {
  const T = THEMES[map.theme];
  scene.background = new THREE.Color(T.sky);
  scene.fog = new THREE.Fog(T.sky, T.fogNear, T.fogFar);

  scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
  const sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
  const cx = WORLD_W / 2, cz = WORLD_H / 2;
  sun.position.set(cx - 750, 1300, cz + 600);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(3072, 3072);
  Object.assign(sun.shadow.camera, { left: -WORLD_W * 0.72, right: WORLD_W * 0.72, top: WORLD_H * 0.62, bottom: -WORLD_H * 0.62, near: 100, far: 3600 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: T.ground, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -1, cz);
  scene.add(ground);

  const floorMap = map.theme === 'dock' ? tex(dockFloorC(), WORLD_W / 160, WORLD_H / 160)
    : map.theme === 'desert' ? tex(sandFloorC(), WORLD_W / 220, WORLD_H / 220)
    : map.theme === 'village' ? tex(dirtFloorC(), WORLD_W / 200, WORLD_H / 200)
    : tex(floorC(), WORLD_W / 110, WORLD_H / 110);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0, cz); floor.receiveShadow = true;
  scene.add(floor);

  const decal = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshBasicMaterial({ map: tex(decalCanvas(map, mode)), transparent: true, depthWrite: false }));
  decal.rotation.x = -Math.PI / 2; decal.position.set(cx, 0.5, cz);
  scene.add(decal);

  map.walls.forEach((w, i) => buildWall(scene, w, i, map.theme));

  // lamp posts around each bomb site (and bunting on the town map), with a warm light over the site itself
  const iron = new THREE.MeshStandardMaterial({ color: 0x1c1d21, metalness: 0.6, roughness: 0.45 });
  const glass = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const s of map.sites) {
    const tops: THREE.Vector3[] = [];
    for (const dx of [-120, 120]) for (const dz of [-100, 100]) {
      const x = s.x + dx, z = s.y + dz;
      if (map.walls.some((w) => x > w.x - 6 && x < w.x + w.w + 6 && z > w.y - 6 && z < w.y + w.h + 6)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 110, 8), iron);
      pole.position.set(x, 55, z); pole.castShadow = true; pole.userData.lamp = true; scene.add(pole);
      const lantern = new THREE.Mesh(new THREE.BoxGeometry(9, 12, 9), glass); lantern.position.set(x, 116, z); lantern.userData.lamp = true; scene.add(lantern);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(8, 7, 4), iron); cap.position.set(x, 125, z); cap.rotation.y = Math.PI / 4; cap.userData.lamp = true; scene.add(cap);
      tops.push(new THREE.Vector3(x, 108, z));
    }
    if (T.bunting) {
      for (const [i, j] of [[0, 2], [1, 3]]) if (tops[i] && tops[j] && Math.abs(tops[i].x - tops[j].x) < 1) scene.add(bunting(tops[i], tops[j]));
      for (const [i, j] of [[0, 1], [2, 3]]) if (tops[i] && tops[j] && Math.abs(tops[i].z - tops[j].z) < 1) scene.add(bunting(tops[i], tops[j]));
    }
    const light = new THREE.PointLight(0xffd9a0, 9000, 420, 2);
    light.position.set(s.x, 130, s.y);
    scene.add(light);
  }
}

// ---------- real gun models (optional GLB files in /models/guns/<weapon id>.glb) ----------
// Each file is turned so the barrel points along +x, scaled to a sensible length and moved so the grip sits near the origin.
// Any weapon without a file keeps its built-in low-poly model.
const GUN_LENGTH: Record<string, number> = {
  usp: 12, deagle: 14, glock: 11, mp5: 23, p90: 21, spas12: 32, striker: 28, ak47: 32, m4a1: 31, l118a: 42, m60e4: 38, barrett: 44,
};
// The automatic "barrel is the light end" guess is wrong for these models (their stock end came out in front), so flip them.
const GUN_FLIP = new Set(['deagle', 'glock', 'mp5', 'p90', 'spas12', 'striker', 'ak47']);
let gunLoad: Promise<void> | null = null;

function prepareGun(src: THREE.Object3D, targetLen: number, flip: boolean): THREE.Group {
  const obj = src.clone(true);
  const wrap = new THREE.Group();
  wrap.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.z > size.x) wrap.rotation.y = Math.PI / 2;                 // longest axis -> x
  wrap.updateMatrixWorld(true);

  // the heavy end (stock, grip, magazine) holds most of the vertices, so the barrel is the opposite end
  let sum = 0, n = 0;
  const v = new THREE.Vector3();
  wrap.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); sum += v.x; n++; }
  });
  box.setFromObject(wrap);
  if (n && sum / n > (box.min.x + box.max.x) / 2) { wrap.rotation.y += Math.PI; wrap.updateMatrixWorld(true); }
  if (flip) { wrap.rotation.y += Math.PI; wrap.updateMatrixWorld(true); }

  box.setFromObject(wrap);
  const k = targetLen / Math.max(0.0001, box.max.x - box.min.x);
  const out = new THREE.Group();
  out.add(wrap);
  wrap.scale.setScalar(k);
  out.updateMatrixWorld(true);
  box.setFromObject(out);
  wrap.position.x -= box.min.x + 0.3 * (box.max.x - box.min.x);       // grip about 30% from the back
  wrap.position.y -= (box.min.y + box.max.y) / 2;                     // centred vertically
  out.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return out;
}

// ---------- real gun models + customization (sights, foregrip, finish) ----------
// Gun GLBs are in /models/guns, the sights and grip (CuiGames kit, not redistributable) in /models/accessories. Every combination of
// choices is built once from the plain gun and cached. A weapon without a file keeps its built-in low-poly model.
const ACC_FILES: Record<number, string> = { 1: 'H02_Holo', 2: 'P42_4x', 3: 'R8_8x' };
const SIGHT_LEN: Record<number, number> = { 1: 3.8, 2: 6.5, 3: 10 };
const SIGHT_AT: Record<string, number> = { mp5: 0.48, l118a: 0.46 };
export const TINT_COLORS = [0xffffff, 0x4a4d52, 0xd9bd85, 0x8b9a5c, 0xe6eef6, 0xffd24a];
const gunBase = new Map<string, THREE.Group>();
const accScenes = new Map<string, THREE.Object3D>();
const variantCache = new Map<string, THREE.Group>();

function mountAccessory(gun: THREE.Group, name: string, len: number, at: number, top: boolean) {
  const acc = accScenes.get(name);
  if (!acc) return;
  gun.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gun);
  const meshes: THREE.Object3D[] = [];
  gun.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
  const part = acc.clone(true);
  const size = new THREE.Box3().setFromObject(part).getSize(new THREE.Vector3());
  part.scale.setScalar(len / Math.max(0.0001, size.x));                         // the kit files already point along +x once loaded, like the guns
  const wrap = new THREE.Group(); wrap.add(part);
  const x = box.min.x + (box.max.x - box.min.x) * at;
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(x, top ? box.max.y + 20 : box.min.y - 20, 0), new THREE.Vector3(0, top ? -1 : 1, 0));
  const hit = ray.intersectObjects(meshes, false)[0];                            // the real surface of the gun at that spot
  const y = hit ? hit.point.y : top ? box.max.y : box.min.y;
  wrap.position.set(x, y + (top ? -0.25 : 0.25), 0);
  wrap.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  gun.add(wrap);
}

function buildVariant(id: string, base: THREE.Group, code: number): THREE.Group {
  const g = base.clone(true);
  const sight = code & 3, grip = (code >> 2) & 1, tint = code >> 3;
  if (tint > 0) {                                                                // repaint: own copies of the materials, multiplied by the finish colour
    const col = new THREE.Color(TINT_COLORS[tint]);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const paint = (mt: THREE.Material) => { const c = mt.clone() as THREE.MeshStandardMaterial; if (c.color) c.color.multiply(col); if (tint === 5) { c.metalness = 0.9; c.roughness = 0.28; } return c; };
      m.material = Array.isArray(m.material) ? m.material.map(paint) : paint(m.material);
    });
  }
  if (sight && ACC_FILES[sight]) mountAccessory(g, ACC_FILES[sight], SIGHT_LEN[sight], SIGHT_AT[id] ?? 0.5, true);
  if (grip) mountAccessory(g, 'FG01_Foregrip', 2.4, 0.74, false);
  return g;
}

export function loadGunModels(): Promise<void> {
  gunLoad ??= (async () => {
    const loader = new GLTFLoader();
    await Promise.all(Object.values(ACC_FILES).concat('FG01_Foregrip').map(async (n) => {
      try { accScenes.set(n, (await loader.loadAsync(`/models/accessories/${n}.glb`)).scene); } catch { /* kit not installed */ }
    }));
    await Promise.all(WEAPONS.map(async (w) => {
      try {
        const gltf = await loader.loadAsync(`/models/guns/${w.id}.glb`);
        gunBase.set(w.id, prepareGun(gltf.scene, GUN_LENGTH[w.id] ?? 30, GUN_FLIP.has(w.id)));
      } catch { /* no file for this weapon: the built-in model is used */ }
    }));
    if (gunBase.size) console.info(`Loaded ${gunBase.size} gun models: ${[...gunBase.keys()].join(', ')}`);
  })();
  return gunLoad;
}

// ---------- weapon models (low-poly originals; barrel points along +x, origin at the grip) ----------
export function makeWeaponModel(idx: number, custom?: number): THREE.Group {
  const id = WEAPONS[idx]?.id ?? 'usp';
  const base = gunBase.get(id);
  if (base) {
    const code = custom ?? defaultCustom(idx);
    const key = `${id}|${code}`;
    let v = variantCache.get(key);
    if (!v) { v = buildVariant(id, base, code); variantCache.set(key, v); }
    return v.clone(true);
  }
  const g = new THREE.Group();
  const mat = (c: number, metal = 0.35, rough = 0.5, opacity = 1) => new THREE.MeshStandardMaterial({ color: c, metalness: metal, roughness: rough, transparent: opacity < 1, opacity });
  const M = {
    black: mat(0x17181b, 0.3, 0.55), gun: mat(0x2a2d33, 0.55, 0.4), steel: mat(0x6a707a, 0.75, 0.3), poly: mat(0x25282a, 0.1, 0.8),
    olive: mat(0x4a5238, 0.2, 0.7), tan: mat(0xb39d6b, 0.2, 0.7), wood: mat(0x7a4a24, 0.05, 0.8), brass: mat(0xb08a2a, 0.8, 0.35), glass: mat(0x66aaff, 0, 0.1),
    rubber: mat(0x0e0f11, 0, 0.95), mag: mat(0x4a4f56, 0.1, 0.5, 0.75),
  };
  // box part: size w,h,d at x,y,z with optional rotation about z
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z = 0, rz = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z); mesh.rotation.z = rz; mesh.castShadow = true; g.add(mesh); return mesh;
  };
  // cylinder along x (barrels, scopes) or along z (drums)
  const cyl = (r: number, len: number, m: THREE.Material, x: number, y: number, z = 0, along: 'x' | 'z' = 'x') => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), m);
    if (along === 'x') mesh.rotation.z = Math.PI / 2; else mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh;
  };
  const bipod = (x: number, len: number) => { box(1.5, len, 1.5, M.gun, x, -len / 2 + 1, 3.4, 0.3); box(1.5, len, 1.5, M.gun, x, -len / 2 + 1, -3.4, -0.3); };

  switch (id) {
    case 'usp':
      box(17, 5, 3.6, M.steel, 8, 2.5); box(14, 3.4, 3.4, M.poly, 6, -0.5); box(4.5, 10, 3.4, M.black, 0, -4.5, 0, -0.2); box(3, 2.4, 2.4, M.gun, 17, 2.6); box(5, 1.4, 3.6, M.gun, 5, -2.2);
      break;
    case 'deagle':
      box(23, 6.6, 4.2, M.steel, 11, 3.2); box(17, 4, 4, M.gun, 8, -0.8); box(5, 11, 4.2, M.black, 0, -5, 0, -0.18); box(4, 3.4, 3.4, M.gun, 24.5, 3.4); box(10, 1.6, 2, M.black, 11, 7); box(5.5, 1.6, 4.2, M.gun, 6, -2.8);
      break;
    case 'glock':
      box(16, 5, 3.4, M.black, 8, 2.5); box(13, 3.2, 3.2, M.poly, 5.5, -0.4); box(4.2, 9, 3.2, M.poly, 0, -4, 0, -0.2); box(3.6, 14, 3, M.black, -0.8, -7.5, 0, -0.2); box(3, 2.2, 2.2, M.gun, 16.5, 2.6);
      break;
    case 'mp5':
      box(24, 6, 4.5, M.black, 10, 1.5); cyl(2.9, 16, M.gun, 28, 1.2); box(4, 2.4, 2.4, M.gun, 38, 1.2); box(4.5, 13, 3.4, M.black, 15, -8, 0, 0.2); box(4, 9, 3.6, M.black, 3, -6, 0, -0.22);
      box(12, 1.4, 3.4, M.gun, -8, 2); box(1.8, 8, 4, M.gun, -14.5, -1.6); box(3, 2.5, 2.5, M.gun, 12, 5.2); box(8, 3, 4, M.poly, 25, -2.2);
      break;
    case 'p90':
      box(32, 9, 6.4, M.black, 5, 0.5); box(27, 3.8, 5.4, M.mag, 5, 6.2); box(8, 3, 5, M.poly, 14, -4.5); box(4, 8, 4, M.black, 3, -6, 0, -0.1); box(10, 5, 6, M.poly, 19, 0.5);
      box(6, 2.4, 2.4, M.gun, 24, 1.4); box(7, 3, 3.4, M.glass, 14, 9.4); box(2.4, 9, 5, M.rubber, -11.5, 0.5);
      break;
    case 'spas12':
      cyl(1.9, 40, M.steel, 20, 2.6); cyl(1.7, 28, M.gun, 15, -0.6); box(9, 5, 5.4, M.poly, 22, -2.8); box(15, 6.6, 4.6, M.black, 4, 0.5);
      box(14, 1.8, 3.6, M.gun, -9, 0.8, 0, -0.08); box(1.8, 9, 3.6, M.gun, -17, -3, 0, 0.1); box(4.2, 9, 3.6, M.black, 1, -6, 0, -0.22); box(3, 2.2, 2.2, M.gun, 40, 2.6);
      break;
    case 'striker':
      cyl(7.4, 7.6, M.gun, 14, 0.2, 0, 'z'); cyl(5, 8, M.steel, 14, 0.2, 0, 'z'); box(22, 5.6, 4.6, M.black, 6, 2); cyl(2.1, 20, M.steel, 26, 2.6);
      box(14, 1.6, 3.4, M.gun, -9, 0.8); box(1.8, 8, 3.6, M.gun, -16, -2.6); box(4.2, 9, 3.6, M.black, 1, -6, 0, -0.22);
      break;
    case 'ak47':
      box(18, 6, 4.4, M.gun, 10, 1.2); box(15, 5, 4.4, M.wood, 26, 0.6); cyl(1.2, 12, M.steel, 38, 1.4); cyl(1.1, 18, M.steel, 24, 4.2); box(1.4, 3, 1.4, M.gun, 37, 4);
      box(4.4, 15, 3.4, M.black, 15, -9.5, 0, 0.5); box(17, 6.5, 3.8, M.wood, -10, -0.8, 0, -0.12); box(4, 9, 3.6, M.wood, 4, -6, 0, -0.24); box(3, 3, 2.6, M.gun, 40, 1.4);
      break;
    case 'm4a1':
      box(20, 6, 4.4, M.black, 9, 1.5); box(17, 2.4, 2.6, M.black, 10, 5.4); box(19, 5.2, 4.8, M.poly, 27, 1.2); cyl(1.1, 9, M.steel, 40, 1.4); box(4, 3, 3, M.gun, 45.5, 1.4);
      box(4.6, 12, 3.6, M.black, 11, -7.5, 0, 0.08); box(14, 5.4, 3.8, M.poly, -9, 0.2, 0, -0.05); cyl(1.8, 9, M.gun, -3, 1.6); box(4, 8.5, 3.6, M.black, 3, -6, 0, -0.22); box(2, 3.4, 1.6, M.gun, 36, 4.6);
      break;
    case 'l118a':
      box(22, 5.6, 4.2, M.olive, 8, 1); cyl(1.5, 46, M.steel, 34, 1.4); cyl(2.3, 5, M.gun, 59, 1.4); box(20, 7, 4.2, M.olive, -12, -0.6, 0, -0.1); box(10, 2.4, 3.6, M.olive, -9, 4);
      cyl(3.2, 18, M.black, 10, 7.4); cyl(4.1, 4, M.black, 20, 7.4); cyl(3.5, 1.4, M.glass, 21.2, 7.4); box(2, 2.6, 4, M.gun, 4, 4.7); box(2, 2.6, 4, M.gun, 15, 4.7);
      box(5, 6, 3, M.black, 9, -4, 0, 0.1); box(1.4, 5, 1.4, M.gun, 2, 2.4, 4.2); bipod(30, 11);
      break;
    case 'm60e4':
      box(24, 8, 6, M.black, 9, 1.2); box(26, 1.8, 5, M.gun, 9, 5.8); cyl(1.8, 24, M.steel, 31, 2.6); cyl(2.6, 12, M.poly, 24, 2.6); cyl(1.2, 14, M.gun, 28, 6.4);
      box(11, 10, 9, M.olive, 8, -7.5); box(3, 7, 2, M.brass, 8, -1.5, 3.8); box(3, 4, 2, M.brass, 9, 0.8, 3.8); box(8, 1.6, 1.6, M.gun, 33, 6.2);
      box(16, 7.4, 4.2, M.black, -11, -0.8, 0, -0.08); box(4, 9, 3.8, M.black, 2, -6.5, 0, -0.2); bipod(37, 12);
      break;
    case 'barrett':
      cyl(2.1, 50, M.steel, 34, 2.4); cyl(2.9, 34, M.gun, 30, 2.4); box(9, 7, 7, M.black, 60.5, 2.4); box(31, 8.4, 5.4, M.tan, 10, 1.6);
      cyl(3.8, 22, M.black, 12, 9.6); cyl(4.6, 4, M.black, 24, 9.6); cyl(4, 1.4, M.glass, 25.8, 9.6); box(28, 1.8, 3.2, M.gun, 11, 6.4);
      box(9, 7, 3.6, M.black, 8, -6.2); box(18, 9, 5, M.tan, -14, -1.4, 0, -0.08); box(2.6, 11, 6, M.rubber, -23.5, -1.8, 0, -0.08); box(4.2, 9.5, 4, M.black, 0, -7, 0, -0.22); box(12, 2, 2, M.gun, 20, 6.6);
      bipod(38, 13);
      break;
  }
  g.scale.setScalar(id === 'barrett' ? 0.5 : id === 'm60e4' ? 0.58 : 0.72); // built-in models are drawn large: bring them in proportion with the soldier
  return g;
}
