// Dev tool: http://localhost:5173/preview.html?file=/models/mixamo/erika.fbx[&anim=/models/mixamo/run.fbx]
// Shows an FBX/GLB model on a turntable and prints its stats (size, bones, animations, textures).
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const file = q.get('file') ?? '';
const info = document.getElementById('info')!;
const log = (t: string) => { info.textContent += '\n' + t; console.info(t); };

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3140);
scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(2, 4, 3); scene.add(sun);
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 5000);

async function main() {
  const t0 = performance.now();
  const isGlb = /\.(glb|gltf)$/i.test(file);
  const obj: THREE.Object3D & { animations?: THREE.AnimationClip[] } = isGlb
    ? (await new GLTFLoader().loadAsync(file)).scene
    : await new FBXLoader().loadAsync(file);
  const clips = isGlb ? [] : obj.animations ?? [];
  info.textContent = `${file}\nloaded in ${(performance.now() - t0).toFixed(0)} ms`;

  let meshes = 0, tris = 0, bones = 0;
  const textures = new Map<string, string>();
  const boneNames: string[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.Bone).isBone) { bones++; boneNames.push(o.name); }
    if (!m.isMesh) return;
    meshes++;
    const idx = m.geometry.index;
    tris += idx ? idx.count / 3 : (m.geometry.getAttribute('position')?.count ?? 0) / 3;
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      for (const [k, v] of Object.entries(mat as unknown as Record<string, unknown>)) {
        const t = v as THREE.Texture;
        if (t && t.isTexture && t.image) textures.set(`${mat.name}.${k}`, `${t.image.width}x${t.image.height}`);
      }
    }
  });
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  log(`meshes ${meshes}   triangles ${Math.round(tris)}   bones ${bones}`);
  log(`size ${size.x.toFixed(1)} x ${size.y.toFixed(1)} x ${size.z.toFixed(1)} (height ${size.y.toFixed(1)})`);
  log(`animations ${clips.length}: ${clips.map((c) => `${c.name}(${c.duration.toFixed(2)}s)`).join(', ') || 'none'}`);
  log(`textures: ${[...textures.entries()].map(([k, v]) => `${k}=${v}`).join(', ') || 'none embedded'}`);
  log(`bones: ${boneNames.slice(0, 14).join(' | ')}${boneNames.length > 14 ? ' ...' : ''}`);

  // fit to view
  const h = size.y || 1;
  obj.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  const holder = new THREE.Group(); holder.add(obj); scene.add(holder);
  camera.position.set(0, h * 0.55, h * 2.1); camera.lookAt(0, h * 0.5, 0);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(h * 0.6, 32), new THREE.MeshStandardMaterial({ color: 0x59606b }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  const turn = Number(q.get('turn') ?? 0.4);
  let t = 0;
  const tick = () => { t += 0.016; holder.rotation.y = q.has('yaw') ? Number(q.get('yaw')) : t * turn; renderer.render(scene, camera); requestAnimationFrame(tick); };
  tick();
  (window as unknown as { ready: boolean }).ready = true;
}
main().catch((e) => { log('ERROR: ' + (e?.message ?? e)); });
