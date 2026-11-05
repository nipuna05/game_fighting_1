// Character models: the animated Kenney soldier (with a blocky fallback) plus the loaders for it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Team } from '@fight/shared';

export interface Character {
  root: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; phase: number;
  gunHolder: THREE.Group; gunIdx: number; // the weapon model currently shown in the hands
  holder?: THREE.Group; spine?: THREE.Object3D; neck?: THREE.Object3D; legYaw?: number; backward?: boolean; // loaded models: lower-body facing + torso bones
  mixer?: THREE.AnimationMixer; idle?: THREE.AnimationAction; run?: THREE.AnimationAction; // set for loaded models
}

// ---- real character model (Kenney "Animated Characters 2", CC0). Falls back to the blocky soldier if missing. ----
const MODEL_GLB = '/models/character.glb';                       // optional: a rigged, animated glb overrides everything below
const KENNEY = '/models/kenney';
// costume index -> texture (same order as the menu thumbnails)
const SKIN_URLS = ['survivorMaleB', 'survivorFemaleA', 'zombieA', 'zombieC'].map((n) => `${KENNEY}/${n}.png`);
export const QS = new URLSearchParams(location.search); // dev overrides: ?yaw=<radians>&zoom=<0.2..1>
export const MODEL_YAW = QS.has('yaw') ? Number(QS.get('yaw')) : Math.PI / 2; // the model faces +Z; the game faces +X. Change if a model faces the wrong way.
const MODEL_HEIGHT = 58;
export const MAX_TWIST = 1.75;                                  // 100 degrees: how far the torso may turn away from the legs
export const TURN_RATE = 9;                                     // rad/s, how fast the body can turn (about 515 degrees/s)
export const TWIST_SIGN = QS.has('twist') ? Number(QS.get('twist')) : -1; // spine twist direction for this rig (dev: ?twist=1)
export const AXIS_Y = new THREE.Vector3(0, 1, 0);
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));       // world units; the model is auto-scaled to this height
interface Template { scene: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number; offsetY: number; skins?: THREE.Material[] }
export let template: Template | null = null;

function finishTemplate(scene: THREE.Object3D, clips: THREE.AnimationClip[], skins?: Template['skins']): Template {
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y;
  if (!(h > 0)) throw new Error('empty model');
  const scale = MODEL_HEIGHT / h;
  return { scene, clips, scale, offsetY: -box.min.y * scale, skins };
}

export async function loadTemplate(): Promise<void> {
  template = null;
  try { // 1) a user-supplied glb
    const gltf = await new GLTFLoader().loadAsync(MODEL_GLB);
    template = finishTemplate(gltf.scene, gltf.animations);
    return;
  } catch { /* none, try the bundled FBX pack */ }
  try { // 2) bundled Kenney FBX model + separate idle/run animation files + per-team skins
    const loader = new FBXLoader();
    const [model, idle, run] = await Promise.all([
      loader.loadAsync(`${KENNEY}/characterMedium.fbx`),
      loader.loadAsync(`${KENNEY}/idle.fbx`),
      loader.loadAsync(`${KENNEY}/run.fbx`),
    ]);
    const clips: THREE.AnimationClip[] = [];
    // each file also holds a one-frame "Targeting Pose" clip, so take the longest clip, which is the real animation
    const longest = (f: THREE.Object3D) => f.animations.reduce<THREE.AnimationClip | null>((a, b) => (!a || b.duration > a.duration ? b : a), null);
    const idleClip = longest(idle), runClip = longest(run);
    if (idleClip) { idleClip.name = 'idle'; clips.push(idleClip); }
    if (runClip) { runClip.name = 'run'; clips.push(runClip); }
    const skins: THREE.Material[] = [];
    const tl = new THREE.TextureLoader();
    for (const url of SKIN_URLS) {
      const tex = await tl.loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      skins.push(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    }
    template = finishTemplate(model, clips, skins);
    console.info(`Loaded character model, animations: ${clips.map((c) => c.name).join(', ')}`);
    if (QS.has('debuganim')) {
      const bones: string[] = [];
      model.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o.name); });
      console.info('DEBUG bones:', bones.filter((n) => /hips|spine|neck|head|shoulder|arm/i.test(n)).join(' | '), `(total ${bones.length})`);
      for (const [label, f] of [['idle.fbx', idle], ['run.fbx', run], ['model', model]] as const) console.info('DEBUG file', label, 'animations:', f.animations.map((c) => `${c.name}(${c.duration.toFixed(2)}s,${c.tracks.length})`).join(', ') || 'none');
      for (const c of clips) console.info('DEBUG clip', c.name, 'dur', c.duration.toFixed(2), 'tracks', c.tracks.length, c.tracks.slice(0, 6).map((t) => t.name).join(' | '));
    }
  } catch (e) {
    console.info('Character model not loaded, using blocky soldier', e);
    template = null;
  }
}

export function makeModelCharacter(skinIdx: number, color: number): Character {
  const t = template!;
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(t.scene) as THREE.Group;
  model.scale.setScalar(t.scale);
  model.position.y = t.offsetY;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    const skin = t.skins?.[skinIdx];
    if (skin) m.material = skin;
  });
  const holder = new THREE.Group();
  holder.rotation.y = MODEL_YAW;
  holder.add(model);
  root.add(holder);

  // team-coloured ring under the feet, so teams read clearly whatever the model looks like
  const ring = new THREE.Mesh(new THREE.RingGeometry(15, 21, 28), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 1;
  root.add(ring);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(8, 33, 9);
  root.add(gunHolder);

  const mixer = new THREE.AnimationMixer(model);
  const find = (re: RegExp) => t.clips.find((c) => re.test(c.name));
  const idleClip = find(/idle/i) ?? t.clips[0];
  const runClip = find(/run|jog|walk/i) ?? idleClip;
  const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
  const run = runClip ? mixer.clipAction(runClip) : undefined;
  idle?.play(); run?.play();
  const dummy = () => new THREE.Group();
  return { root, legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), phase: 0, gunHolder, gunIdx: -1, holder, spine: model.getObjectByName('Spine') ?? undefined, neck: model.getObjectByName('Neck') ?? undefined, mixer, idle, run };
}

export function makeCharacter(color: number): Character {
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

  const gunHolder = new THREE.Group();
  gunHolder.position.set(10, 34, 0);
  root.add(gunHolder);
  void metal;

  return { root, legL, legR, armL, armR, phase: Math.random() * 6, gunHolder, gunIdx: -1 };
}

