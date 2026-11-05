// Re-targets animation clips made for the "Soldier Cole" skeleton onto Mixamo characters.
// Both are T-pose rigs with almost the same bone names (Mixamo adds a "mixamorig" prefix and has 3 spine bones).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const SAME = ['Hips', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];
/** Cole bone name -> Mixamo bone name */
export const COLE_TO_MIXAMO: Record<string, string> = {
  ...Object.fromEntries(SAME.map((n) => [n, `mixamorig${n}`])),
  Spine02: 'mixamorigSpine', Spine01: 'mixamorigSpine1', Spine: 'mixamorigSpine2', neck: 'mixamorigNeck',
};

/**
 * mode 0: copy each bone's rotation as it is (works when both rigs use the same local axes)
 * mode 1: copy the rotation relative to the rest pose, applied in the parent's frame:  target = A * restS^-1 * restT
 * mode 2: copy the rotation relative to the rest pose, applied in the bone's own frame: target = restT * restS^-1 * A
 */
export function retargetClip(clip: THREE.AnimationClip, srcRest: THREE.Object3D, dst: THREE.Object3D, mode: 0 | 1 | 2 = 0): THREE.AnimationClip {
  // Bone positions live in each skeleton's own units (Cole's are centimetres under a 0.01 parent scale), so the size ratio comes
  // from how high the hips sit at rest in each rig, which is correct whatever the units are.
  const srcHips = srcRest.getObjectByName('Hips'), dstHips = dst.getObjectByName('mixamorigHips');
  const ratio = srcHips && dstHips && Math.abs(srcHips.position.y) > 1e-6 ? dstHips.position.y / srcHips.position.y : 1;
  const tracks: THREE.KeyframeTrack[] = [];
  const qA = new THREE.Quaternion(), qOut = new THREE.Quaternion();

  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf('.');
    const bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
    const targetName = COLE_TO_MIXAMO[bone];
    const s = srcRest.getObjectByName(bone), d = dst.getObjectByName(targetName ?? '');
    if (!targetName || !s || !d) continue;

    if (prop === 'quaternion') {
      const restS = s.quaternion, restT = d.quaternion;
      const invS = restS.clone().invert();
      const out = new Float32Array(t.values.length);
      for (let i = 0; i < t.values.length; i += 4) {
        qA.fromArray(t.values as ArrayLike<number> as number[], i);
        if (mode === 0) qOut.copy(qA);
        else if (mode === 1) qOut.copy(qA).multiply(invS).multiply(restT);
        else qOut.copy(restT).multiply(invS).multiply(qA);
        qOut.toArray(out, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${targetName}.quaternion`, Array.from(t.times), Array.from(out)));
    } else if (prop === 'position' && bone === 'Hips') { // only the hips move: keep their up/down bounce, scaled to the target's size
      const rest = s.position, base = d.position;
      const out = new Float32Array(t.values.length);
      for (let i = 0; i < t.values.length; i += 3) {
        out[i] = base.x;                                   // no sideways / forward drift (animations are in place)
        out[i + 1] = base.y + (t.values[i + 1] - rest.y) * ratio;
        out[i + 2] = base.z;
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${targetName}.position`, Array.from(t.times), Array.from(out)));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Proper retarget between two T-pose rigs whose bones have different local axes.
 * For every frame it measures how far each Cole bone has rotated away from its T-pose in MODEL space, applies that same
 * model-space rotation to the matching Mixamo bone (starting from the Mixamo T-pose), then converts it to a local rotation.
 * The result is baked into a normal AnimationClip (30 samples per second), so playing it costs nothing extra.
 */
export function bakeRetarget(clip: THREE.AnimationClip, srcScene: THREE.Object3D, dstScene: THREE.Object3D, fps = 30): THREE.AnimationClip {
  const src = SkeletonUtils.clone(srcScene);
  src.updateMatrixWorld(true);

  const srcHips = src.getObjectByName('Hips'), dstHips = dstScene.getObjectByName('mixamorigHips');
  if (!srcHips || !dstHips) return clip;
  const ratio = Math.abs(srcHips.position.y) > 1e-6 ? dstHips.position.y / srcHips.position.y : 1;
  const srcHipsRest = srcHips.position.clone();

  // pairs in parent-before-child order (target hierarchy)
  const pairs: { s: THREE.Object3D; d: THREE.Object3D; parent: number; ws0Inv: THREE.Quaternion; wt0: THREE.Quaternion; name: string }[] = [];
  const indexOf = new Map<THREE.Object3D, number>();
  dstScene.updateMatrixWorld(true);
  dstScene.traverse((d) => {
    const cole = Object.keys(COLE_TO_MIXAMO).find((k) => COLE_TO_MIXAMO[k] === d.name);
    if (!cole) return;
    const s = src.getObjectByName(cole);
    if (!s) return;
    let p = d.parent, parent = -1;
    while (p && parent < 0) { parent = indexOf.get(p) ?? -1; p = p.parent; }
    indexOf.set(d, pairs.length);
    pairs.push({ s, d, parent, ws0Inv: s.getWorldQuaternion(new THREE.Quaternion()).invert(), wt0: d.getWorldQuaternion(new THREE.Quaternion()), name: d.name });
  });

  const mixer = new THREE.AnimationMixer(src);
  mixer.clipAction(clip).play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times: number[] = [];
  const quat = pairs.map(() => [] as number[]);
  const hipsPos: number[] = [];
  const prev = pairs.map(() => new THREE.Quaternion(0, 0, 0, 0));
  const wAnim = pairs.map(() => new THREE.Quaternion());
  const q = new THREE.Quaternion(), local = new THREE.Quaternion(), parentRest = new THREE.Quaternion();

  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times.push(t);
    mixer.setTime(t);
    src.updateMatrixWorld(true);
    pairs.forEach((pr, i) => {
      const ws = pr.s.getWorldQuaternion(q);
      wAnim[i].copy(ws).multiply(pr.ws0Inv).multiply(pr.wt0);            // delta (model space) applied to the target's rest orientation
      let parentW: THREE.Quaternion;
      if (pr.parent >= 0) parentW = wAnim[pr.parent];
      else { parentW = pr.d.parent ? pr.d.parent.getWorldQuaternion(parentRest) : parentRest.identity(); }
      local.copy(parentW).invert().multiply(wAnim[i]);
      if (prev[i].lengthSq() > 0 && prev[i].dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w); // keep the shortest path between frames
      prev[i].copy(local);
      quat[i].push(local.x, local.y, local.z, local.w);
    });
    hipsPos.push(dstHips.position.x, dstHips.position.y + (srcHips.position.y - srcHipsRest.y) * ratio, dstHips.position.z);
  }

  const tracks: THREE.KeyframeTrack[] = pairs.map((pr, i) => new THREE.QuaternionKeyframeTrack(`${pr.name}.quaternion`, times, quat[i]));
  tracks.push(new THREE.VectorKeyframeTrack('mixamorigHips.position', times, hipsPos));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
