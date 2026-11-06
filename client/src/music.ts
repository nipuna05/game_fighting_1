// Background music, generated live with Web Audio (no audio files): a tense military "mission" score in E minor.
//   calm     - menus / briefing: a low drone, sonar pings, slow brass swells, distant snare
//   game     - during play: pulsing bass ostinato, string riff in a 3+3+2 rhythm, marching snare with fills, taiko, brass stabs, a ticking clock
//   intense  - the bomb is planted or the score is tight: faster, snare rolls, siren-like tritone, everything louder
import { getAudio, isMuted } from './audio';

export type MusicMode = 'off' | 'calm' | 'game' | 'intense';

// four bars: Em | C | D | B (the last one is the dominant, it keeps asking for the next loop)
const CHORD = [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]];       // E3 G3 B3 | C3 E3 G3 | D3 F#3 A3 | B2 D#3 F#3
const BASS = [40, 40, 40, 35];                                                  // E pedal, B under the dominant
const BRASS = [64, 60, 62, 59];                                                 // the slow theme in calm: E4 C4 D4 B3
const RIFF: number[][] = [                                                      // string ostinato (semitones above the chord root + octave), 3+3+2 per half bar
  [0, 3, 7], [0, 3, 7], [0, 4, 7], [0, 3, 7],
];
const BPM: Record<MusicMode, number> = { off: 100, calm: 84, game: 126, intense: 146 };
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private mode: MusicMode = 'off';
  private vol = 0.55;
  private step = 0;
  private next = 0;
  private started = false;

  /** Call after the first user gesture (browsers only allow sound then). */
  start() {
    const a = getAudio();
    if (!a || this.started) return;
    this.started = true;
    this.ctx = a;
    this.out = a.createGain(); this.out.gain.value = 0; this.out.connect(a.destination);
    this.noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.next = a.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), 40);
    this.apply();
  }
  setMode(m: MusicMode) { if (m === this.mode) return; this.mode = m; this.apply(); }
  /** 0..1 */
  setVolume(v: number) { this.vol = Math.max(0, Math.min(1, v)); this.apply(); }
  /** Follows the M key (mute) as well. */
  refreshMute() { this.apply(); }
  stop() { window.clearInterval(this.timer); this.started = false; }
  get current() { return this.mode; }

  private apply() {
    if (!this.ctx || !this.out) return;
    const target = this.mode === 'off' || isMuted() ? 0 : this.vol * 0.6;
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);        // smooth fades between moods and when muting
  }

  private tick() {
    const c = this.ctx;
    if (!c || !this.out) return;
    if (c.state === 'suspended') { void c.resume(); return; }
    if (this.mode === 'off' || isMuted() || this.vol <= 0.01) { this.next = Math.max(this.next, c.currentTime + 0.05); return; }
    const spb = 60 / BPM[this.mode];
    while (this.next < c.currentTime + 0.25) {
      this.schedule(this.step, this.next, spb);
      this.next += spb / 4;                                                 // one step = a sixteenth note
      this.step = (this.step + 1) % 64;                                     // four bars
    }
  }

  // ---- instruments ----
  private env(g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }
  private tone(type: OscillatorType, midi: number, t: number, peak: number, attack: number, hold: number, release: number, cutoff: number, detune = 0) {
    const c = this.ctx!, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = type; o.frequency.value = mtof(midi); o.detune.value = detune;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    this.env(g, t, peak, attack, hold, release);
    o.connect(f).connect(g).connect(this.out!);
    o.start(t); o.stop(t + attack + hold + release + 0.05);
  }
  private hit(t: number, type: BiquadFilterType, hz: number, peak: number, dur: number, q = 0.8) {
    const c = this.ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = hz; f.Q.value = q;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out!); s.start(t, Math.random() * 0.4, dur + 0.02);
  }
  private boom(t: number, from: number, to: number, peak: number, dur: number) {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out!); o.start(t); o.stop(t + dur + 0.03);
  }
  private snare(t: number, peak: number) { this.hit(t, 'bandpass', 2100, peak, 0.12, 0.9); this.hit(t, 'highpass', 5000, peak * 0.5, 0.07); this.boom(t, 220, 140, peak * 0.4, 0.08); }
  private ping(t: number, peak: number) { for (const [dt, k] of [[0, 1], [0.34, 0.45], [0.68, 0.2]]) this.tone('sine', 88, t + dt, peak * k, 0.004, 0.02, 1.0, 5000); }     // a sonar ping with echoes (E6)
  private brass(notes: number[], t: number, peak: number, attack: number, hold: number, release: number, cutoff: number) {
    for (const n of notes) for (const dt of [-7, 7]) this.tone('sawtooth', n, t, peak, attack, hold, release, cutoff, dt);
  }

  private schedule(step: number, t: number, spb: number) {
    const m = this.mode, bar = (step >> 4) & 3, s = step & 15, beat = s >> 2;
    const calm = m === 'calm', intense = m === 'intense';
    const chord = CHORD[bar], root = BASS[bar];

    if (calm) {
      if (s === 0) {
        for (const n of [root - 12, root, root + 7]) this.tone('sawtooth', n, t, 0.024, 1.6, spb * 3, spb * 1.6, 220, n === root ? 5 : -5);     // the low drone
        this.brass([BRASS[bar]], t, 0.012, 1.2, spb * 2, spb * 1.2, 1300);                                                                  // a slow brass swell on the theme note
        if (bar === 0 || bar === 2) this.ping(t + spb * 0.5, 0.05);                                                                          // sonar
        if (bar === 3) this.boom(t + spb * 3, 70, 38, 0.2, 0.9);                                                                             // a distant boom into the loop
      }
      if (bar === 3 && s >= 8 && s % 2 === 0) this.hit(t, 'bandpass', 1900, 0.014 + (s - 8) * 0.004, 0.06);                                // a snare roll builds up
      if (s % 8 === 4) this.boom(t, 90, 45, 0.1, 0.5);                                                                                      // slow heartbeat
      return;
    }

    // ---- pulse: a ticking clock, the 3+3+2 bass ostinato and the taiko ----
    const accent = s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14;                   // 3 + 3 + 2, twice a bar
    if (s % 2 === 0) this.tone('sine', 108, t, s % 4 === 0 ? 0.045 : 0.025, 0.002, 0.004, 0.03, 9000);   // tick
    if (accent) this.tone('sawtooth', root + (s === 14 ? 12 : 0), t, intense ? 0.13 : 0.11, 0.004, spb * 0.2, spb * 0.2, intense ? 520 : 430);
    if (s === 0) this.boom(t, 80, 40, 0.34, 0.5);                                                       // taiko on the one
    if (s === 8 && bar !== 1) this.boom(t, 90, 45, 0.22, 0.4);
    if (intense && s % 4 === 0) this.boom(t, 90, 45, 0.18, 0.3);

    // ---- strings: a short riff on the chord tones in the same rhythm ----
    if (accent) {
      const tones = RIFF[bar];
      const k = s === 0 || s === 8 ? 0 : s === 3 || s === 11 ? 1 : 2;
      const note = chord[0] + tones[k] + (s === 14 ? 12 : 12);
      this.tone('sawtooth', note, t, intense ? 0.05 : 0.04, 0.005, spb * 0.18, spb * 0.22, 1900);
      this.tone('square', note + 12, t, 0.012, 0.005, spb * 0.12, spb * 0.2, 2600);
    }

    // ---- marching snare, ghost notes and a fill at the end of every four bars ----
    if (s === 4 || s === 12) this.snare(t, intense ? 0.2 : 0.16);
    if (s === 7 || s === 15) this.hit(t, 'bandpass', 2100, 0.035, 0.05);
    if (intense && s % 2 === 1) this.hit(t, 'bandpass', 2100, 0.03, 0.04);
    if (bar === 3 && s >= 12) this.snare(t, 0.07 + (s - 12) * 0.045);                                  // a roll into the next loop

    // ---- brass stabs on the chord changes ----
    if (s === 0) this.brass(chord, t, intense ? 0.02 : 0.016, 0.012, spb * 0.5, spb * 0.9, 1500);
    if (s === 10) this.brass(chord, t, 0.013, 0.01, spb * 0.25, spb * 0.5, 1400);
    if (intense && s === 0) this.tone('sawtooth', 88 + (bar & 1 ? 6 : 0), t, 0.012, 0.3, spb * 2.5, spb, 3000);          // a siren-like tritone
  }
}

export const music = new Music();
