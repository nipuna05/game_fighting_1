// Team voice chat: peer-to-peer audio (WebRTC) between teammates. The game server only relays the set-up messages and only
// between real players on the same team, so enemies can never join the call. Audio itself never passes through the server.
import type { ClientMsg, ServerMsg } from '@fight/shared';

export type VoiceMode = 'ptt' | 'open';
export type VoiceStatus = 'off' | 'asking' | 'ready' | 'denied' | 'unsupported';

interface Peer {
  id: string; pc: RTCPeerConnection; audio: HTMLAudioElement;
  analyser?: AnalyserNode; buf?: Uint8Array<ArrayBuffer>; level: number;
  pendingIce: RTCIceCandidateInit[]; hasRemote: boolean;
}

const ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export class Voice {
  readonly peers = new Map<string, Peer>();
  status: VoiceStatus = 'off';
  talking = false;
  micLevel = 0;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micBuf: Uint8Array<ArrayBuffer> | null = null;

  constructor(private myId: string, private send: (m: ClientMsg) => void, private mode: VoiceMode) {}

  /** Ask for the microphone and tell my teammates I am ready. */
  async enable() {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined' || !window.isSecureContext) { this.status = 'unsupported'; return; }
    this.status = 'asking';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch { this.status = 'denied'; return; }
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.micAnalyser = this.ctx.createAnalyser(); this.micAnalyser.fftSize = 256;
    this.micBuf = new Uint8Array(new ArrayBuffer(this.micAnalyser.fftSize));
    src.connect(this.micAnalyser);
    this.applyTalking();
    this.status = 'ready';
    this.send({ type: 'voice', ready: true });
  }

  disable() {
    this.send({ type: 'voice', ready: false });
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; void this.ctx?.close(); this.ctx = null;
    this.status = 'off';
  }

  /** Push-to-talk: hold the key to talk. In open-mic mode the microphone is always live. */
  setTalking(on: boolean) { this.talking = on; this.applyTalking(); }
  private applyTalking() {
    const live = this.mode === 'open' || this.talking;
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = live; });
    if (live && this.ctx?.state === 'suspended') void this.ctx.resume();
  }
  get live() { return this.status === 'ready' && (this.mode === 'open' || this.talking); }

  isSpeaking(id: string): boolean { return (this.peers.get(id)?.level ?? 0) > 0.035; }

  /** Call every frame: measures how loud each teammate (and I) are, for the speaking indicators. */
  update() {
    const level = (an?: AnalyserNode | null, buf?: Uint8Array<ArrayBuffer> | null) => {
      if (!an || !buf) return 0;
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
      return peak / 128;
    };
    this.micLevel = this.live ? level(this.micAnalyser, this.micBuf) : 0;
    for (const p of this.peers.values()) p.level = level(p.analyser, p.buf);
  }

  // ---------- signalling ----------
  handle(m: ServerMsg) {
    if (m.type === 'voice') {
      if (!m.ready) { this.closePeer(m.from); return; }
      if (this.status !== 'ready') return;                          // I have no microphone ready: nothing to connect
      if (this.myId < m.from) void this.call(m.from);               // the player with the smaller id makes the offer (no clash)
    } else if (m.type === 'rtc') {
      void this.onSignal(m.from, m.data as { kind: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit });
    }
  }

  private makePeer(id: string): Peer {
    const existing = this.peers.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection(ICE);
    const audio = document.createElement('audio');
    audio.autoplay = true;
    const peer: Peer = { id, pc, audio, level: 0, pendingIce: [], hasRemote: false };
    this.stream?.getTracks().forEach((t) => pc.addTrack(t, this.stream!));
    pc.onicecandidate = (e) => { if (e.candidate) this.send({ type: 'rtc', to: id, data: { kind: 'ice', ice: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      audio.srcObject = e.streams[0];
      void audio.play().catch(() => { /* needs a user gesture first: the next key press starts it */ });
      if (this.ctx) {
        const an = this.ctx.createAnalyser(); an.fftSize = 256;
        this.ctx.createMediaStreamSource(e.streams[0]).connect(an);
        peer.analyser = an; peer.buf = new Uint8Array(new ArrayBuffer(an.fftSize));
      }
    };
    this.peers.set(id, peer);
    return peer;
  }

  private async call(id: string) {
    const peer = this.makePeer(id);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    this.send({ type: 'rtc', to: id, data: { kind: 'offer', sdp: peer.pc.localDescription!.toJSON() } });
  }

  private async onSignal(from: string, d: { kind: string; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }) {
    if (this.status !== 'ready') return;
    const peer = this.makePeer(from);
    if (d.kind === 'offer' && d.sdp) {
      await peer.pc.setRemoteDescription(d.sdp);
      peer.hasRemote = true;
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      this.send({ type: 'rtc', to: from, data: { kind: 'answer', sdp: peer.pc.localDescription!.toJSON() } });
      for (const c of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
    } else if (d.kind === 'answer' && d.sdp) {
      await peer.pc.setRemoteDescription(d.sdp);
      peer.hasRemote = true;
      for (const c of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(c).catch(() => undefined);
    } else if (d.kind === 'ice' && d.ice) {
      if (peer.hasRemote) await peer.pc.addIceCandidate(d.ice).catch(() => undefined);
      else peer.pendingIce.push(d.ice);
    }
  }

  private closePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close(); p.audio.srcObject = null;
    this.peers.delete(id);
  }
}
