import { asset } from './assets';
// Tiny synthesized sound effects (WebAudio). No audio files needed.
let ctx: AudioContext | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;
let master: GainNode | null = null;       // everything realistic (guns, impacts) goes through here
let wet: ConvolverNode | null = null;     // short outdoor "room" reverb for the gun tails
const samples = new Map<string, AudioBuffer>(); // optional real recordings: client/public/sounds/guns/<weapon id>.ogg

/** Call from a user gesture (e.g. the Start click) so the browser allows audio. */
export function initAudio() {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!master) {
      master = ctx.createGain(); master.gain.value = 0.75;
      const limiter = ctx.createDynamicsCompressor();  // keeps the big guns from distorting when several fire at once
      limiter.threshold.value = -9; limiter.knee.value = 4; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.15;
      master.connect(limiter).connect(ctx.destination);
      // generated impulse response: a 1.3 s decaying, slightly dull noise tail = the echo of a shot between buildings
      const len = Math.floor(ctx.sampleRate * 1.3), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c); let lp = 0;
        for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.35; d[i] = lp * Math.pow(1 - i / len, 3.2); }
      }
      wet = ctx.createConvolver(); wet.buffer = ir;
      const wg = ctx.createGain(); wg.gain.value = 0.7; wet.connect(wg).connect(master);
      for (const id of Object.keys(VOICES)) { // real recordings are optional: use them when the files exist
        fetch(asset(`/sounds/guns/${id}.ogg`)).then((r) => (r.ok && /audio|ogg|octet/.test(r.headers.get('content-type') ?? '') ? r.arrayBuffer() : null))
          .then((ab) => (ab ? ctx!.decodeAudioData(ab) : null)).then((b) => { if (b) samples.set(id, b); }).catch(() => undefined);
      }
    }
  } catch { /* audio is optional */ }
}

export function toggleMute(): boolean { muted = !muted; return muted; }
/** For the music module: the shared audio context (null until the first user gesture) and the mute flag. */
export const getAudio = (): AudioContext | null => ctx;
export const isMuted = () => muted;

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = freq, delay = 0) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, lowpass: number, delay = 0) {
  if (!ctx || muted || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = lowpass;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(ctx.destination);
  s.start(t, Math.random() * 0.5, dur + 0.02);
}

// ---------- realistic gunshots: every weapon has its own voice (crack + body + boom + sub, a reverb tail, distance filtering) ----------
interface Voice { crack: number; crackHz: number; body: number; bodyHz: number; boomHz: number; dur: number; tail: number; sub?: number; mech?: 'pump' | 'bolt' }
const VOICES: Record<string, Voice> = {
  usp:     { crack: 0.55, crackHz: 2600, body: 0.45, bodyHz: 1800, boomHz: 170, dur: 0.16, tail: 0.25 },
  deagle:  { crack: 0.80, crackHz: 2200, body: 0.90, bodyHz: 1400, boomHz: 110, dur: 0.32, tail: 0.55, sub: 0.5 },
  glock:   { crack: 0.60, crackHz: 3000, body: 0.40, bodyHz: 2000, boomHz: 190, dur: 0.13, tail: 0.22 },
  mp5:     { crack: 0.55, crackHz: 3200, body: 0.40, bodyHz: 2200, boomHz: 200, dur: 0.12, tail: 0.20 },
  p90:     { crack: 0.50, crackHz: 4200, body: 0.30, bodyHz: 2600, boomHz: 260, dur: 0.09, tail: 0.15 },
  spas12:  { crack: 0.70, crackHz: 1800, body: 1.00, bodyHz: 900,  boomHz: 80,  dur: 0.42, tail: 0.50, sub: 0.6, mech: 'pump' },
  striker: { crack: 0.65, crackHz: 2000, body: 0.90, bodyHz: 1000, boomHz: 90,  dur: 0.36, tail: 0.45, sub: 0.5 },
  ak47:    { crack: 0.85, crackHz: 2400, body: 0.85, bodyHz: 1200, boomHz: 120, dur: 0.26, tail: 0.45, sub: 0.35 },
  m4a1:    { crack: 0.80, crackHz: 3000, body: 0.60, bodyHz: 1700, boomHz: 150, dur: 0.20, tail: 0.38 },
  l118a:   { crack: 1.00, crackHz: 2000, body: 0.95, bodyHz: 1100, boomHz: 100, dur: 0.50, tail: 0.75, sub: 0.5, mech: 'bolt' },
  m60e4:   { crack: 0.80, crackHz: 1800, body: 1.00, bodyHz: 800,  boomHz: 85,  dur: 0.30, tail: 0.50, sub: 0.6 },
  barrett: { crack: 1.00, crackHz: 1600, body: 1.10, bodyHz: 700,  boomHz: 70,  dur: 0.80, tail: 0.95, sub: 0.8, mech: 'bolt' },
  vector:  { crack: 0.50, crackHz: 3800, body: 0.35, bodyHz: 2400, boomHz: 230, dur: 0.09, tail: 0.15 },
  aug:     { crack: 0.78, crackHz: 3100, body: 0.58, bodyHz: 1800, boomHz: 155, dur: 0.19, tail: 0.36 },
  scar:    { crack: 0.88, crackHz: 2300, body: 0.90, bodyHz: 1150, boomHz: 115, dur: 0.27, tail: 0.46, sub: 0.4 },
  svd:     { crack: 0.95, crackHz: 2100, body: 0.85, bodyHz: 1100, boomHz: 105, dur: 0.38, tail: 0.6, sub: 0.45 },
  m870:    { crack: 0.70, crackHz: 1700, body: 1.00, bodyHz: 850,  boomHz: 78,  dur: 0.44, tail: 0.5, sub: 0.6, mech: 'pump' },
  rpk:     { crack: 0.82, crackHz: 1900, body: 1.00, bodyHz: 850,  boomHz: 90,  dur: 0.27, tail: 0.48, sub: 0.5 },
  awm:     { crack: 1.00, crackHz: 1900, body: 1.00, bodyHz: 900,  boomHz: 85,  dur: 0.62, tail: 0.85, sub: 0.6, mech: 'bolt' },
};

/** A gain that jumps to `peak` and dies away over `dur` seconds. */
function env(g: GainNode, t: number, peak: number, dur: number) {
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
/** Where a sound ends up: volume, air absorption (far = duller), stereo position and an optional send to the reverb. */
function bus(vol: number, pan: number, far: number, tail: number): GainNode {
  const c = ctx!, g = c.createGain(); g.gain.value = vol;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700 + 15000 * Math.pow(1 - far, 2);
  const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(lp).connect(p).connect(master!);
  if (tail > 0 && wet) { const send = c.createGain(); send.gain.value = tail * (0.35 + far * 0.65); p.connect(send).connect(wet); }
  return g;
}
function nz(out: AudioNode, t: number, type: BiquadFilterType, hz: number, q: number, peak: number, dur: number) {
  const c = ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = hz; f.Q.value = q;
  env(g, t, peak, dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5, dur + 0.03);
}
function osc(out: AudioNode, t: number, type: OscillatorType, from: number, to: number, peak: number, dur: number) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  env(g, t, peak, dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.03);
}

/** One gunshot. far: 0 = right next to me, 1 = at the edge of hearing. own: it is my own gun (adds the pump / bolt sound). */
function gunShot(id: string, vol: number, pan: number, far: number, own: boolean) {
  if (!ctx || muted || !noiseBuf || !master || vol <= 0.02) return;
  const v = VOICES[id] ?? VOICES.usp, t = ctx.currentTime + 0.004, j = 0.92 + Math.random() * 0.16;
  const out = bus(vol, pan, far, v.tail);
  const rec = samples.get(id);
  if (rec) { // a real recording beats the synthesised one
    const s = ctx.createBufferSource(); s.buffer = rec; s.playbackRate.value = j; s.connect(out); s.start(t);
    return;
  }
  nz(out, t, 'bandpass', v.crackHz * j, 0.7, v.crack, 0.045 + v.dur * 0.12);       // supersonic crack
  nz(out, t, 'lowpass', v.bodyHz * j, 0.7, v.body * 0.8, v.dur);                    // the blast itself
  osc(out, t, 'sine', v.boomHz * j, 38, v.body * 0.7, v.dur * 0.9);                 // chest-thump of the boom
  if (v.sub) osc(out, t, 'sine', 62 * j, 30, v.sub, v.dur * 1.5);                   // sub rumble for the big guns
  if (own && v.mech === 'pump') { nz(out, t + 0.40, 'bandpass', 1700, 2, 0.28, 0.03); nz(out, t + 0.52, 'bandpass', 1300, 2, 0.32, 0.035); }          // shotgun pump
  if (own && v.mech === 'bolt') { nz(out, t + 0.55, 'bandpass', 2200, 3, 0.3, 0.03); osc(out, t + 0.55, 'triangle', 1500, 900, 0.07, 0.05); nz(out, t + 0.72, 'bandpass', 1500, 2, 0.3, 0.035); } // rifle bolt
}

/** Bullet hits: flesh (thud + wet slap) or wall (crisp tick, sometimes a ricochet whine). */
function impact(kind: 'wall' | 'body', vol: number, pan: number) {
  if (!ctx || muted || !noiseBuf || !master || vol <= 0.03) return;
  const t = ctx.currentTime + 0.003, j = 0.9 + Math.random() * 0.2, out = bus(vol, pan, 1 - vol, 0.12);
  if (kind === 'body') {
    nz(out, t, 'lowpass', 700, 0.7, 0.7, 0.1);
    osc(out, t, 'sine', 150 * j, 55, 0.6, 0.11);
    nz(out, t, 'bandpass', 2200 * j, 1.2, 0.28, 0.035);
  } else {
    nz(out, t, 'bandpass', 3200 * j, 1, 0.6, 0.05);
    osc(out, t, 'triangle', 1900 * j, 900, 0.09, 0.09);
    if (Math.random() < 0.35) osc(out, t + 0.01, 'sine', 2800 * j, 1100, 0.07, 0.24); // ricochet whine
  }
}

/** A short voiced "ugh" made from a falling sawtooth through two vowel-like filters. */
function grunt(out: AudioNode, t: number, from: number, to: number, dur: number, peak: number) {
  const c = ctx!, o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur);
  for (const [hz, q, k] of [[720, 5, 1], [1150, 6, 0.6]] as const) {
    const f = c.createBiquadFilter(), g = c.createGain(); f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak * k, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out);
  }
  o.start(t); o.stop(t + dur + 0.03);
}

export const sfx = {
  /** weapon id, loudness 0..1, stereo -1..1, distance 0..1, my own gun */
  gun: gunShot,
  impact,
  /** I was hit: flesh thud, a pained grunt (louder for bigger hits). */
  hurt(dmg = 20) {
    if (!ctx || muted || !noiseBuf || !master) return;
    const t = ctx.currentTime + 0.002, k = Math.min(1, 0.45 + dmg / 60), out = bus(0.9, 0, 0, 0.08);
    nz(out, t, 'lowpass', 600, 0.7, 0.8 * k, 0.13); osc(out, t, 'sine', 130, 50, 0.7 * k, 0.15);
    grunt(out, t + 0.03, 150 + Math.random() * 25, 90, 0.2, 0.55 * k);
  },
  /** I died: a longer groan, then the body hits the ground. */
  death() {
    if (!ctx || muted || !noiseBuf || !master) return;
    const t = ctx.currentTime + 0.002, out = bus(0.95, 0, 0, 0.15);
    grunt(out, t, 160, 62, 0.55, 0.6);
    nz(out, t + 0.32, 'lowpass', 260, 0.7, 0.9, 0.3); osc(out, t + 0.32, 'sine', 90, 36, 0.8, 0.3);
  },
  /** Reload: magazine out, magazine in, then the bolt, spread over `total` seconds. */
  reload(total: number) {
    if (!ctx || muted || !noiseBuf || !master) return;
    const t = ctx.currentTime, out = bus(0.8, 0, 0, 0);
    nz(out, t + 0.08, 'bandpass', 900, 3, 0.45, 0.05); osc(out, t + 0.1, 'triangle', 300, 150, 0.2, 0.08);                         // magazine out
    nz(out, t + total * 0.55, 'bandpass', 700, 2, 0.5, 0.07); osc(out, t + total * 0.55, 'triangle', 220, 120, 0.3, 0.09);         // magazine in
    nz(out, t + Math.max(0.3, total - 0.18), 'bandpass', 2000, 3, 0.5, 0.04); nz(out, t + Math.max(0.36, total - 0.1), 'bandpass', 1500, 3, 0.45, 0.05); // bolt
  },
  /** Trigger pulled on an empty gun. */
  dry() { if (!ctx || muted || !noiseBuf || !master) return; const t = ctx.currentTime, out = bus(0.6, 0, 0, 0); nz(out, t, 'bandpass', 2600, 4, 0.5, 0.03); },
  /** Bringing another weapon up. */
  swap() { if (!ctx || muted || !noiseBuf || !master) return; const t = ctx.currentTime, out = bus(0.6, 0, 0, 0); nz(out, t, 'bandpass', 1100, 2, 0.4, 0.06); nz(out, t + 0.12, 'bandpass', 1900, 3, 0.4, 0.04); },
  /** Grenade sounds: vol 0..1 by distance, pan -1..1. */
  throwGrenade() { if (!ctx || muted || !noiseBuf || !master) return; const t = ctx.currentTime, out = bus(0.6, 0, 0, 0); nz(out, t, 'bandpass', 700, 1.2, 0.25, 0.18); osc(out, t, 'sine', 420, 180, 0.12, 0.15); },
  frag(vol: number, pan: number) {
    if (!ctx || muted || !noiseBuf || !master || vol <= 0.03) return;
    const t = ctx.currentTime + 0.002, out = bus(vol, pan, 1 - vol, 0.8);
    nz(out, t, 'lowpass', 1400, 0.7, 1.0, 0.7); nz(out, t, 'bandpass', 2400, 0.7, 0.8, 0.12); osc(out, t, 'sine', 95, 30, 1.0, 0.9); osc(out, t, 'sine', 55, 25, 0.9, 1.3);
  },
  bang(vol: number, pan: number) {
    if (!ctx || muted || !noiseBuf || !master || vol <= 0.03) return;
    const t = ctx.currentTime + 0.002, out = bus(vol, pan, 1 - vol, 0.5);
    nz(out, t, 'highpass', 3500, 0.7, 0.9, 0.25); osc(out, t, 'sine', 2600, 2000, 0.25, 0.9);                                              // a crack and a ringing whine
  },
  hiss(vol: number, pan: number) { if (!ctx || muted || !noiseBuf || !master || vol <= 0.03) return; const t = ctx.currentTime, out = bus(vol * 0.7, pan, 1 - vol, 0.2); nz(out, t, 'bandpass', 4200, 0.6, 0.25, 1.4); },
  whoomph(vol: number, pan: number) { if (!ctx || muted || !noiseBuf || !master || vol <= 0.03) return; const t = ctx.currentTime, out = bus(vol, pan, 1 - vol, 0.3); nz(out, t, 'lowpass', 900, 0.7, 0.7, 0.5); osc(out, t, 'sine', 120, 40, 0.6, 0.5); },
  pickup() { if (!ctx || muted || !noiseBuf || !master) return; const t = ctx.currentTime, out = bus(0.5, 0, 0, 0); osc(out, t, 'triangle', 660, 660, 0.18, 0.08); osc(out, t + 0.07, 'triangle', 990, 990, 0.18, 0.12); },
  healStart() { if (!ctx || muted || !noiseBuf || !master) return; const t = ctx.currentTime, out = bus(0.5, 0, 0, 0); nz(out, t, 'bandpass', 1500, 2, 0.3, 0.08); nz(out, t + 0.18, 'bandpass', 1100, 2, 0.25, 0.08); },
  healDone() { if (!ctx || muted || !noiseBuf || !master) return; const t = ctx.currentTime, out = bus(0.55, 0, 0, 0); osc(out, t, 'sine', 523, 523, 0.2, 0.25); osc(out, t + 0.12, 'sine', 784, 784, 0.2, 0.35); },
  beep() { tone(1400, 0.07, 'square', 0.12); },
  plant() { tone(520, 0.12, 'square', 0.2); tone(780, 0.18, 'square', 0.2, 780, 0.13); },
  defuse() { tone(600, 0.1, 'sine', 0.25); tone(900, 0.1, 'sine', 0.25, 900, 0.1); tone(1200, 0.25, 'sine', 0.25, 1200, 0.2); },
  explode() { noise(1.2, 0.9, 500); tone(70, 1.0, 'sawtooth', 0.5, 25); },
  roundStart() { tone(440, 0.1, 'triangle', 0.25); tone(660, 0.2, 'triangle', 0.25, 660, 0.12); },
  win() { tone(523, 0.14, 'triangle', 0.3); tone(659, 0.14, 'triangle', 0.3, 659, 0.15); tone(784, 0.3, 'triangle', 0.3, 784, 0.3); },
  lose() { tone(330, 0.25, 'triangle', 0.3, 300); tone(247, 0.4, 'triangle', 0.3, 200, 0.25); },
  multi(level: number) { for (let i = 0; i <= Math.min(level, 5); i++) tone(520 + i * 130, 0.16, 'triangle', 0.28, 520 + i * 130, i * 0.09); tone(1040 + level * 80, 0.35, 'sine', 0.22, 1040 + level * 80, Math.min(level, 5) * 0.09 + 0.05); },
  scope(on: boolean) { if (on) { tone(300, 0.07, 'square', 0.12, 700); tone(900, 0.05, 'sine', 0.1, 900, 0.07); } else tone(700, 0.08, 'square', 0.1, 300); },
  kill() { tone(180, 0.09, 'square', 0.22, 110); },
  cash() { tone(1200, 0.07, 'square', 0.18); tone(1800, 0.16, 'square', 0.18, 1800, 0.07); },
  buy() { tone(900, 0.06, 'square', 0.15); tone(1300, 0.08, 'square', 0.15, 1300, 0.06); },
};
