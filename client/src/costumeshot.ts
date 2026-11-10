// Dev tool: /costumeshot.html?skin=0&real=1  renders ONE soldier costume (waist up, holding a rifle) on a transparent background,
// for the costume pictures in the menus. real=0 uses only the free Kenney soldier (those pictures can be committed);
// real=1 also loads the downloaded soldier models, if present.
import * as THREE from 'three';
import { WEAPONS, defaultCustom } from '@fight/shared';
import { loadTemplate, makeModelCharacter, applyArmIK } from './characters';
import { makeWeaponModel, loadGunModels } from './world';

const q = new URLSearchParams(location.search);
const skin = Number(q.get('skin') ?? 0), real = q.get('real') === '1';
const W = 360, H = 400;
if (!real) {                                                         // pretend the downloaded models are not there
  const orig = window.fetch.bind(window);
  window.fetch = ((i: RequestInfo | URL, init?: RequestInit) => (/\/models\/(cole|mixamo)\//.test(String(i)) ? Promise.reject(new Error('skipped')) : orig(i, init))) as typeof fetch;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x4a3f33, 1.7));
const key = new THREE.DirectionalLight(0xfff0d6, 3.2); key.position.set(60, 120, 140); scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb4ff, 2.0); rim.position.set(-120, 60, -90); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-80, 20, 120); scene.add(fill);

void (async () => {
  if (real) await loadGunModels();
  await loadTemplate();
  const c = makeModelCharacter(skin, 0xffffff);
  c.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.type === 'RingGeometry') m.visible = false; });   // no team ring under the feet
  const ak = Math.max(0, WEAPONS.findIndex((w) => w.id === 'ak47'));
  c.gunHolder.add(makeWeaponModel(ak, defaultCustom(ak)));
  c.idle?.setEffectiveWeight(1); c.run?.setEffectiveWeight(0);
  c.mixer?.update(0.6); applyArmIK(c);
  c.root.rotation.y = -0.6;                                          // three-quarter view, as on the home screen
  scene.add(c.root);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(c.root), h = box.max.y - box.min.y;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  const camera = new THREE.PerspectiveCamera(22, W / H, 1, 2000);
  const top = box.max.y + h * 0.02, bottom = box.min.y + h * 0.50;   // chest up
  const dist = ((top - bottom) / 2) / Math.tan(THREE.MathUtils.degToRad(22 / 2)) * 1.2;
  const mid = cx + h * 0.08;                                         // the rifle points to the right: centre on soldier + rifle
  camera.position.set(mid, (top + bottom) / 2, cz + dist); camera.lookAt(mid, (top + bottom) / 2 - 1, cz);
  renderer.render(scene, camera);
  (window as unknown as { __ready: boolean }).__ready = true;
})();
