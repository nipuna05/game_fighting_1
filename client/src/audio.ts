// Tiny synthesized sound effects (WebAudio). No audio files needed.
let ctx: AudioContext | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

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
  } catch { /* audio is optional */ }
}

export function toggleMute(): boolean { muted = !muted; return muted; }

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

export const sfx = {
  /** vol 0..1 (distance based); heavy = shotgun-style blast */
  shot(vol: number, heavy = false) {
    if (vol <= 0.02) return;
    if (heavy) { noise(0.28, 0.5 * vol, 1400); tone(90, 0.2, 'sawtooth', 0.35 * vol, 40); }
    else { noise(0.09, 0.35 * vol, 4200); tone(220, 0.07, 'square', 0.12 * vol, 90); }
  },
  hurt() { tone(160, 0.18, 'sawtooth', 0.3, 70); noise(0.1, 0.2, 800); },
  death() { tone(220, 0.6, 'sawtooth', 0.3, 40); },
  beep() { tone(1400, 0.07, 'square', 0.12); },
  plant() { tone(520, 0.12, 'square', 0.2); tone(780, 0.18, 'square', 0.2, 780, 0.13); },
  defuse() { tone(600, 0.1, 'sine', 0.25); tone(900, 0.1, 'sine', 0.25, 900, 0.1); tone(1200, 0.25, 'sine', 0.25, 1200, 0.2); },
  explode() { noise(1.2, 0.9, 500); tone(70, 1.0, 'sawtooth', 0.5, 25); },
  roundStart() { tone(440, 0.1, 'triangle', 0.25); tone(660, 0.2, 'triangle', 0.25, 660, 0.12); },
  win() { tone(523, 0.14, 'triangle', 0.3); tone(659, 0.14, 'triangle', 0.3, 659, 0.15); tone(784, 0.3, 'triangle', 0.3, 784, 0.3); },
  lose() { tone(330, 0.25, 'triangle', 0.3, 300); tone(247, 0.4, 'triangle', 0.3, 200, 0.25); },
  cash() { tone(1200, 0.07, 'square', 0.18); tone(1800, 0.16, 'square', 0.18, 1800, 0.07); },
  buy() { tone(900, 0.06, 'square', 0.15); tone(1300, 0.08, 'square', 0.15, 1300, 0.06); },
};
