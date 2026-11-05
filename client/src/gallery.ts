// Dev tool: /gallery.html?dir=/models/_preview_guns/&files=a.glb|b.glb|c.glb&cols=6
// Lays models out on a grid, scaled to the same length, with a label (name, triangles, size) under each.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const dir = q.get('dir') ?? '/';
const files = (q.get('files') ?? '').split('|').filter(Boolean);
const cols = Number(q.get('cols') ?? 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3140);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(2, 4, 3); scene.add(sun);

const rows = Math.ceil(files.length / cols), cellW = 1.5, cellH = 1.05;
const camera = new THREE.OrthographicCamera(-cellW * cols / 2, cellW * cols / 2, cellH * rows / 2, -cellH * rows / 2, 0.1, 100);
camera.position.set(0, 0, 10);

const loader = new GLTFLoader();
const labels: { el: HTMLDivElement; x: number; y: number }[] = [];

files.forEach(async (f, i) => {
  const col = i % cols, row = Math.floor(i / cols);
  const cx = (col + 0.5) * cellW - (cellW * cols) / 2, cy = (cellH * rows) / 2 - (row + 0.5) * cellH;
  const el = document.createElement('div'); el.className = 'lb'; el.textContent = f; document.body.appendChild(el);
  labels.push({ el, x: cx, y: cy - cellH * 0.38 });
  try {
    const gltf = await loader.loadAsync(dir + f);
    const obj = gltf.scene;
    let tris = 0, meshes = 0;
    obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; tris += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.getAttribute('position').count / 3; } });
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const longest = Math.max(size.x, size.y, size.z);
    const k = 1.15 / longest;
    // side view: put the longest axis along screen-x (rotate about Y if it is Z)
    const g = new THREE.Group(); g.add(obj);
    obj.position.sub(box.getCenter(new THREE.Vector3()));
    if (size.z > size.x) g.rotation.y = Math.PI / 2;
    g.scale.setScalar(k); g.position.set(cx, cy + 0.02, 0);
    scene.add(g);
    el.textContent = `${f.replace('.glb', '')}\n${Math.round(tris)} tris, ${meshes} meshes\n${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
  } catch (e) { el.textContent = f + '\nERROR'; }
});

function tick() {
  for (const l of labels) {
    const v = new THREE.Vector3(l.x, l.y, 0).project(camera);
    l.el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
    l.el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
