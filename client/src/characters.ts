// Character models: the animated Kenney soldier (with a blocky fallback) plus the loaders for it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Team } from '@fight/shared';
import { bakeRetarget } from './retarget';

export interface Character {
  root: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; phase: number;
  gunHolder: THREE.Group; gunIdx: number; // the weapon model currently shown in the hands
  holder?: THREE.Group; legYaw?: number; backward?: boolean; // loaded models: lower-body facing
  twistBones?: { bone: THREE.Object3D; k: number }[];         // torso/neck bones that share the upper-body twist toward the aim
  mixer?: THREE.AnimationMixer; idle?: THREE.AnimationAction; run?: THREE.AnimationAction; // set for loaded models
  runBase?: number; runGain?: number;                         // run animation speed = runBase + runGain * (how fast the character moves)
  walk?: THREE.AnimationAction; strideWalk?: number; strideRun?: number; // ground speed (units/s) that the walk / run clips cover at normal playback speed
  arms?: { side: number; upper: THREE.Object3D; fore: THREE.Object3D; hand: THREE.Object3D }[]; armGunIdx?: number; gunLen?: number; gunH?: number;
  gunOnBody?: boolean;                                                           // the weapon follows the chest bone (so it needs no separate offset)
  airT?: number; crouchK?: number; gunBaseY?: number;                            // jump timer, and how far into the kneel pose (0..1) the character is
  kneel?: { hips: THREE.Object3D; hipsY: number; thighs: THREE.Object3D[]; shins: THREE.Object3D[] };
  death?: THREE.AnimationAction; dead?: boolean; ring?: THREE.Object3D; // realistic soldier: falls down and stays down until the next round
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
interface Template { rig: 'cole' | 'mixamo' | 'kenney' | 'other'; scene: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number; offsetY: number; skins?: THREE.Material[] }
export let rigName: Template['rig'] | null = null; // which character is loaded (the menu uses this to pick costume thumbnails)
// Costumes 0..3 are four different soldiers: 0 = Soldier Cole, 1..3 = Mixamo soldiers (Ch15, Ch35, Ch18) wearing Cole's animations.
// A costume whose model file is missing falls back to Cole with a colour tint of his camo.
const COLE_TINTS = [0xffffff, 0xaec0d6, 0xe6d3a2, 0x80838c];
const MIXAMO_SKINS: [number, string][] = [[1, 'ch15'], [2, 'ch35'], [3, 'ch18']];
const templates: Record<number, Template> = {};
export let template: Template | null = null; // the default (costume 0) template; null means: use the blocky soldier

function finishTemplate(rig: Template['rig'], scene: THREE.Object3D, clips: THREE.AnimationClip[], skins?: Template['skins']): Template {
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y;
  if (!(h > 0)) throw new Error('empty model');
  const scale = MODEL_HEIGHT / h;
  return { rig, scene, clips, scale, offsetY: -box.min.y * scale, skins };
}

export async function loadTemplate(): Promise<void> {
  template = null;
  rigName = null;
  for (const k of Object.keys(templates)) delete templates[Number(k)];
  try { // 1) a user-supplied glb
    const gltf = await new GLTFLoader().loadAsync(MODEL_GLB);
    template = finishTemplate('other', gltf.scene, gltf.animations);
    rigName = 'other';
    return;
  } catch { /* none, try Soldier Cole */ }
  if (!QS.has('kenney')) {
    try { // 2) "Soldier Cole": realistic soldier (compact glb made by client/src/coleprep.ts) + animation clips
      const [gltf, anims] = await Promise.all([
        new GLTFLoader().loadAsync('/models/cole/cole.glb'),
        fetch('/models/cole/anims.json').then((r) => { if (!r.ok) throw new Error('no anims'); return r.json() as Promise<Record<string, object>>; }),
      ]);
      const order = ['idle', 'run', 'walk', 'death', 'jump'];
      const clips = order.filter((n) => anims[n]).map((n) => THREE.AnimationClip.parse(anims[n] as Parameters<typeof THREE.AnimationClip.parse>[0]));
      if (!clips.some((c) => c.name === 'idle') || !clips.some((c) => c.name === 'run')) throw new Error('idle/run missing');
      template = finishTemplate('cole', gltf.scene, clips);
      templates[0] = template;
      rigName = 'cole';
      console.info(`Loaded Soldier Cole, animations: ${clips.map((c) => c.name).join(', ')}`);
      // the other three costumes: Mixamo soldiers (optional files), animated by re-targeting Cole's clips onto their skeleton
      await Promise.all(MIXAMO_SKINS.map(async ([skin, file]) => {
        try {
          const mg = await new GLTFLoader().loadAsync(`/models/mixamo/${file}.glb`);
          const baked = clips.filter((c) => ['idle', 'run', 'walk', 'death', 'jump'].includes(c.name)).map((c) => bakeRetarget(c, gltf.scene, mg.scene));
          if (!baked.some((c) => c.name === 'idle' && c.tracks.length) || !baked.some((c) => c.name === 'run' && c.tracks.length)) throw new Error('retarget produced no tracks');
          templates[skin] = finishTemplate('mixamo', mg.scene, baked);
          console.info(`Loaded ${file} for costume ${skin}`);
        } catch { /* file missing: this costume uses a tinted Cole */ }
      }));
      return;
    } catch { /* not available: fall back to the Kenney character */ }
  }
  try { // 3) bundled Kenney FBX model + separate idle/run animation files + per-team skins
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
    template = finishTemplate('kenney', model, clips, skins);
    rigName = 'kenney';
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
  const t = templates[skinIdx] ?? template!;
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
    if (t.rig === 'cole') { // costume = tint of the camo texture (each character gets its own material copy)
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.color.setHex(COLE_TINTS[skinIdx % COLE_TINTS.length]);
      m.material = mat;
    }
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
  const named = (n: string) => t.clips.find((c) => c.name === n);
  const idleClip = named('idle') ?? t.clips.find((c) => /idle/i.test(c.name)) ?? t.clips[0];
  const runClip = named('run') ?? t.clips.find((c) => /run|jog|walk/i.test(c.name)) ?? idleClip;
  const idle = idleClip ? mixer.clipAction(idleClip) : undefined;
  const run = runClip ? mixer.clipAction(runClip) : undefined;
  const walkClip = named('walk');
  const walk = walkClip ? mixer.clipAction(walkClip) : undefined;
  idle?.play(); run?.play(); walk?.play();
  const stride = strideOf(t, root, model, mixer, [walkClip, runClip]);
  const deathClip = named('death');
  const death = deathClip ? mixer.clipAction(deathClip) : undefined;
  if (death) { death.setLoop(THREE.LoopOnce, 1); death.clampWhenFinished = true; }
  // bones that share the upper-body twist (the names differ between the two rigs)
  const pick = (name: string, k: number) => { const bone = model.getObjectByName(name); return bone ? [{ bone, k }] : []; };
  const twistBones = t.rig === 'cole'
    ? [...pick('Spine01', 0.55), ...pick('Spine', 0.45), ...pick('neck', 0.1)]   // the chest gets the whole twist (0.55 + 0.45), so a gun carried on the chest points exactly where the soldier aims
    : t.rig === 'mixamo'
      ? [...pick('mixamorigSpine1', 0.55), ...pick('mixamorigSpine2', 0.45), ...pick('mixamorigNeck', 0.1)]
      : [...pick('Spine', 0.8), ...pick('Neck', 0.15)];
  const pre = t.rig === 'mixamo' ? 'mixamorig' : '';
  const bone = (n: string) => model.getObjectByName(pre + n);
  const hips = bone('Hips');
  const kneel = hips && t.rig !== 'other' && bone('LeftUpLeg') && bone('RightUpLeg') && bone('LeftLeg') && bone('RightLeg')
    ? { hips, hipsY: hips.position.y, thighs: [bone('LeftUpLeg')!, bone('RightUpLeg')!], shins: [bone('LeftLeg')!, bone('RightLeg')!] } : undefined;
  // The weapon rides on the chest bone, not on the fixed root: whenever the body turns, leans, bobs, kneels or jumps, the gun moves with it.
  // attach() keeps the weapon exactly where it is now (the rest pose) and only changes what it follows from here on.
  const chest = model.getObjectByName(t.rig === 'mixamo' ? 'mixamorigSpine2' : 'Spine');
  let gunOnBody = false;
  if (chest) {
    root.updateMatrixWorld(true);
    // carry it centred in front of the chest, a little below shoulder height and just ahead of the shoulders, where both arms can reach it
    const sp = t.rig === 'mixamo' ? 'mixamorig' : '', rS = model.getObjectByName(`${sp}RightArm`), lS = model.getObjectByName(`${sp}LeftArm`);
    if (rS && lS) {
      const m = root.worldToLocal(rS.getWorldPosition(new THREE.Vector3())).add(root.worldToLocal(lS.getWorldPosition(new THREE.Vector3()))).multiplyScalar(0.5);
      gunHolder.position.set(m.x + 4, m.y - 6, m.z);
    }
    chest.attach(gunHolder); gunOnBody = true;
  }
  const pre2 = t.rig === 'mixamo' ? 'mixamorig' : '';
  const armBones = (side: 'Left' | 'Right', k: number) => {
    const upper = model.getObjectByName(`${pre2}${side}Arm`), fore = model.getObjectByName(`${pre2}${side}ForeArm`), hand = model.getObjectByName(`${pre2}${side}Hand`);
    return upper && fore && hand ? [{ side: k, upper, fore, hand }] : [];
  };
  const arms = gunOnBody && (t.rig === 'cole' || t.rig === 'mixamo') ? [...armBones('Right', 1), ...armBones('Left', -1)] : undefined;
  const dummy = () => new THREE.Group();
  const cole = t.rig === 'cole' || t.rig === 'mixamo';
  return {
    root, legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), phase: 0, gunHolder, gunIdx: -1, gunOnBody, arms, holder, twistBones, mixer, idle, run, walk, strideWalk: stride.walk, strideRun: stride.run, death, ring, kneel,
    runBase: cole ? 0.8 : 0.6, runGain: cole ? 0.5 : 0.8,
  };
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


/** Kneel pose, applied after the animation each frame: hips drop, thighs come forward, shins fold back. k = 0..1 (eased in by the caller). */
export const KNEEL = { thigh: QS.has('kt') ? Number(QS.get('kt')) : -1.15, shin: QS.has('ks') ? Number(QS.get('ks')) : 1.85, drop: 0.36 };
export function applyKneel(c: Character, k: number) {
  if (!c.gunOnBody) {                                                          // simple rigs: lower the weapon by hand
    c.gunBaseY ??= c.gunHolder.position.y;
    c.gunHolder.position.y = c.gunBaseY - 11 * k * 0.6;
  }
  if (k < 0.01) { if (!c.mixer) c.root.scale.y = 1; return; }
  if (!c.kneel) { c.root.scale.y = 1 - 0.3 * k; return; }                // simple rigs: squash the body down instead
  const kn = c.kneel;
  kn.hips.position.y = kn.hipsY * (1 - KNEEL.drop * k) + (kn.hips.position.y - kn.hipsY);   // keep the animation's own bounce
  for (const b of kn.thighs) b.rotateX(KNEEL.thigh * k);
  for (const b of kn.shins) b.rotateX(KNEEL.shin * k);
}

// ---- gait: how fast the ground slides past the feet in each clip, so the animation can be played at the speed that matches the movement ----
const strideCache = new WeakMap<Template, { walk: number; run: number }>();
function strideOf(t: Template, root: THREE.Object3D, model: THREE.Object3D, _mixer: THREE.AnimationMixer, clips: (THREE.AnimationClip | undefined)[]): { walk: number; run: number } {
  const cached = strideCache.get(t);
  if (cached) return cached;
  const out = { walk: 55, run: 110 };                                         // sensible defaults when the feet cannot be found
  const pre = t.rig === 'mixamo' ? 'mixamorig' : '';
  const find = (n: string) => model.getObjectByName(pre + n);
  const hips = find('Hips'), feet = [find('LeftFoot'), find('RightFoot')];
  if (hips && feet[0] && feet[1]) {
    const temp = new THREE.AnimationMixer(model);
    const hp = new THREE.Vector3(), fp = new THREE.Vector3();
    clips.forEach((clip, idx) => {
      if (!clip) return;
      const N = 48, dur = clip.duration, rows: number[][][] = [];
      const act = temp.clipAction(clip); act.play();
      for (let i = 0; i <= N; i++) {
        temp.setTime((i / N) * dur * 0.9999);
        root.updateMatrixWorld(true);
        const h = root.worldToLocal(hips.getWorldPosition(hp.set(0, 0, 0)).clone());
        rows.push(feet.map((f) => { const w = f!.getWorldPosition(fp.set(0, 0, 0)); const l = root.worldToLocal(w.clone()); return [l.x - h.x, w.y]; }));
      }
      const speeds: number[] = [], dt = dur / N;
      for (let k = 0; k < 2; k++) {                                            // while a foot is planted (low), it moves backwards past the hips at ground speed
        const ys = rows.map((r) => r[k][1]), lo = Math.min(...ys), hi = Math.max(...ys);
        if (hi - lo < 0.5) continue;
        for (let i = 0; i < N; i++) if (Math.min(ys[i], ys[i + 1]) < lo + (hi - lo) * 0.25) speeds.push(-(rows[i + 1][k][0] - rows[i][k][0]) / dt);
      }
      speeds.sort((a, b) => a - b);
      const med = speeds.length ? speeds[Math.floor(speeds.length / 2)] : 0;
      if (med > 20 && med < 400) { if (idx === 0) out.walk = med; else out.run = med; }
      temp.stopAllAction();
    });
    temp.uncacheRoot(model);
  }
  if (QS.has('debug')) console.info(`gait ${t.rig}: walk covers ${out.walk.toFixed(0)} units/s, run ${out.run.toFixed(0)} units/s`);
  strideCache.set(t, out);
  return out;
}

// ---- hands on the weapon: two-bone arm IK. The right hand takes the pistol grip, the left hand the foregrip, whatever pose the animation is in ----
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _C = new THREE.Vector3(), _T = new THREE.Vector3(), _E = new THREE.Vector3();
const _dir = new THREE.Vector3(), _pole = new THREE.Vector3(), _side = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
function aimBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  _q.setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
  bone.getWorldQuaternion(_wq); _wq.premultiply(_q);                              // new world rotation
  bone.parent!.getWorldQuaternion(_pq);
  bone.quaternion.copy(_pq.invert().multiply(_wq));
  bone.updateMatrixWorld(true);
}
export function applyArmIK(c: Character, weight = 1) {
  if (!c.arms || !c.gunOnBody || !c.gunHolder.visible || c.dead) return;
  if (c.armGunIdx !== c.gunIdx) {                                                // measure the weapon once per weapon
    const g = c.gunHolder.children[0];
    const box = g ? new THREE.Box3().setFromObject(g) : null;
    c.gunLen = box ? box.max.x - box.min.x : 30; c.gunH = box ? box.max.y - box.min.y : 6;
    c.armGunIdx = c.gunIdx;
  }
  const L = c.gunLen ?? 30, pistol = L < 18;
  c.root.updateMatrixWorld(true);
  const rootQ = c.root.getWorldQuaternion(new THREE.Quaternion());
  for (const a of c.arms) {
    const right = a.side > 0;
    // grip points in the weapon's own space (x = along the barrel, y = up)
    const target = right ? _T.set(-0.03 * L, -(c.gunH ?? 6) * 0.25, 0) : _T.set(pistol ? 0.02 * L : Math.min(0.2 * L, 5.5), -(c.gunH ?? 6) * (pistol ? 0.4 : 0.2), 0);
    c.gunHolder.localToWorld(target);
    a.upper.updateWorldMatrix(true, false);
    a.upper.getWorldPosition(_A); a.fore.getWorldPosition(_B); a.hand.getWorldPosition(_C);
    const l1 = _B.distanceTo(_A), l2 = _C.distanceTo(_B);
    const reach = _T.distanceTo(_A), d = Math.max(0.0001, Math.min(reach, (l1 + l2) * 0.995));
    _dir.copy(_T).sub(_A).normalize();
    // the elbow bends down and outward (pole vector), at the distance given by the law of cosines
    _side.set(0, 0, a.side).applyQuaternion(rootQ);
    _pole.set(0, -1, 0).addScaledVector(_side, 0.7); _pole.addScaledVector(_dir, -_pole.dot(_dir)).normalize();
    const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    _E.copy(_A).addScaledVector(_dir, along).addScaledVector(_pole, h);
    if (weight < 1) { /* blend: not used yet, kept for easing in and out */ }
    aimBone(a.upper, _B.clone().sub(_A), _E.clone().sub(_A));
    a.fore.getWorldPosition(_B); a.hand.getWorldPosition(_C);
    aimBone(a.fore, _C.clone().sub(_B), _T.clone().sub(_B));
    // the hand follows the weapon's direction so the fingers wrap around the grip
    a.hand.getWorldQuaternion(_wq); const gq = c.gunHolder.getWorldQuaternion(new THREE.Quaternion());
    void gq;
  }
}
