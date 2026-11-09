// Dev tool: /weaponshot.html?w=ak47&real=1  renders ONE weapon on a transparent background (for the weapon pictures in the menus).
// real=0 uses the built-in low-poly models only (those pictures can be committed); real=1 also loads the downloaded gun models, if present.
import * as THREE from 'three';
import { WEAPONS, defaultCustom } from '@fight/shared';
import { makeWeaponModel, loadGunModels } from './world';

const q = new URLSearchParams(location.search);
const id = q.get('w') ?? 'ak47', real = q.get('real') === '1';
const W = 480, H = 240;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a3226, 1.9));
const key = new THREE.DirectionalLight(0xfff1d6, 3.0); key.position.set(2.5, 4, 3.5); scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb4ff, 1.6); rim.position.set(-3, 1.5, -3); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.8); fill.position.set(-2, -1, 3); scene.add(fill);

void (async () => {
  if (real) await loadGunModels();
  const idx = Math.max(0, WEAPONS.findIndex((w) => w.id === id));
  const gun = makeWeaponModel(idx, defaultCustom(idx));
  gun.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = false; });
  const holder = new THREE.Group(); holder.add(gun);
  // the model's barrel points along +x with the origin at the grip: centre it, then show it a little from the front and above
  const box = new THREE.Box3().setFromObject(gun), centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  gun.position.sub(centre);
  const k = 3.1 / Math.max(size.x, size.y * 2.1, 0.001);
  holder.scale.setScalar(k);
  holder.rotation.set(0.2, -0.5, 0);
  scene.add(holder);
  const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 50);
  camera.position.set(0, 0.35, 5.2); camera.lookAt(0, -0.05, 0);
  renderer.render(scene, camera);
  (window as unknown as { __ready: boolean }).__ready = true;
})();
