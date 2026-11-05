// Dev tool: http://localhost:5173/preview.html?file=/models/mixamo/erika.fbx[&anim=/models/mixamo/run.fbx]
// Shows an FBX/GLB model on a turntable and prints its stats (size, bones, animations, textures).
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { retargetClip, bakeRetarget } from './retarget';

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
  log(`bones: ${boneNames.join(' | ')}`);

  // fit to view
  const h = size.y || 1;
  obj.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  const holder = new THREE.Group(); holder.add(obj); scene.add(holder);
  camera.position.set(0, h * 0.55, h * 2.1); camera.lookAt(0, h * 0.5, 0);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(h * 0.6, 32), new THREE.MeshStandardMaterial({ color: 0x59606b }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);

  // ?retarget=1&anim=run&t=0.2&mode=0 : play a Cole animation on this Mixamo character, next to Cole himself
  if (q.has('retarget')) {
    const cole = await new GLTFLoader().loadAsync('/models/cole/cole.glb');
    const anims = (await (await fetch('/models/cole/anims.json')).json()) as Record<string, object>;
    const name = q.get('anim') ?? 'run', time = Number(q.get('t') ?? 0.2), mode = Number(q.get('mode') ?? 3);
    const src = THREE.AnimationClip.parse(anims[name] as Parameters<typeof THREE.AnimationClip.parse>[0]);
    const clip = mode === 3 ? bakeRetarget(src, cole.scene, obj) : retargetClip(src, cole.scene, obj, mode as 0 | 1 | 2);
    log(`retarget ${name} mode ${mode} t=${time}: ${src.tracks.length} source tracks -> ${clip.tracks.length}`);
    const ch = cole.scene.getObjectByName('Hips'), srcHipsTrack = src.tracks.find((t) => t.name === 'Hips.position');
    log(`cole rest hips ${ch?.position.toArray().map((n) => n.toFixed(3)).join(', ')} | cole anim hips y samples ${Array.from(srcHipsTrack?.values.slice(0, 9) ?? []).map((n) => n.toFixed(3)).join(', ')} | soldier rest hips ${obj.getObjectByName('mixamorigHips')?.position.toArray().map((n) => n.toFixed(1)).join(', ')} | soldier parent scale ${obj.getObjectByName('mixamorigHips')?.parent?.scale.toArray().map((n) => n.toFixed(3)).join(', ')} (${obj.getObjectByName('mixamorigHips')?.parent?.name})`);
    const mx = new THREE.AnimationMixer(obj); mx.clipAction(clip).play(); mx.setTime(time);
    const k = h / 1.7;                      // Cole is in metres: scale him up to the same height and stand him beside
    const cs = cole.scene; cs.scale.setScalar(k); cs.position.set(h * 0.55, 0, 0); holder.add(cs);
    const mc = new THREE.AnimationMixer(cs); mc.clipAction(src).play(); mc.setTime(time);
    obj.position.x -= h * 0.25;
    obj.updateMatrixWorld(true);
    const wp = (n: string) => { const o = obj.getObjectByName(n); const v = new THREE.Vector3(); o?.getWorldPosition(v); return o ? `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})` : 'missing'; };
    log(`soldier hips ${wp('mixamorigHips')}  head ${wp('mixamorigHead')}  left foot ${wp('mixamorigLeftFoot')}  right hand ${wp('mixamorigRightHand')}`);
    const hips = obj.getObjectByName('mixamorigHips');
    log(`hips local position ${hips?.position.toArray().map((n) => n.toFixed(1)).join(', ')}  rest quaternion ${hips?.quaternion.toArray().map((n) => n.toFixed(2)).join(', ')}`);
    log(`clip first tracks: ${clip.tracks.slice(0, 4).map((t) => `${t.name}[${t.values.length}]`).join(' | ')}  hips pos track sample: ${Array.from(clip.tracks.find((t) => t.name === 'mixamorigHips.position')?.values.slice(0, 3) ?? []).map((n) => n.toFixed(1)).join(', ')}`);
    if (q.has('solo')) cs.visible = false;
  }

  if (q.has('portrait')) { // head-and-shoulders view for the menu thumbnails
    floor.visible = false; info.style.display = 'none';
    camera.fov = 22; camera.updateProjectionMatrix();
    camera.position.set(0, h * 0.8, h * 1.5); camera.lookAt(0, h * 0.77, 0);
  }

  const turn = Number(q.get('turn') ?? 0.4);
  let t = 0;
  const tick = () => { t += 0.016; holder.rotation.y = q.has('yaw') ? Number(q.get('yaw')) : t * turn; renderer.render(scene, camera); requestAnimationFrame(tick); };
  tick();
  (window as unknown as { ready: boolean }).ready = true;
}
main().catch((e) => { log('ERROR: ' + (e?.message ?? e)); });
