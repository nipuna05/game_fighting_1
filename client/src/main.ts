import Phaser from 'phaser';
import {
  Sim, WALLS, WORLD_W, WORLD_H, PLAYER_R, MAX_HP, TICK_RATE,
  type Input, type Snapshot, type ServerMsg,
} from '@fight/shared';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- input sources ----------
const keys = { up: false, down: false, left: false, right: false };
const stick = { mx: 0, my: 0, aimAngle: 0, aiming: false };

function bindTouch() {
  const layer = $('touch');
  layer.style.display = 'block';
  const setup = (el: HTMLElement, knob: HTMLElement, onMove: (nx: number, ny: number, active: boolean) => void) => {
    let pid = -1;
    const R = 65;
    const update = (e: PointerEvent) => {
      const b = el.getBoundingClientRect();
      let dx = e.clientX - (b.left + b.width / 2), dy = e.clientY - (b.top + b.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > R) { dx = (dx / len) * R; dy = (dy / len) * R; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      onMove(dx / R, dy / R, true);
    };
    el.addEventListener('pointerdown', (e) => { pid = e.pointerId; el.setPointerCapture(pid); update(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) update(e); });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1; knob.style.transform = ''; onMove(0, 0, false);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  };
  setup($('stickL'), $('knobL'), (x, y) => { stick.mx = x; stick.my = y; });
  setup($('stickR'), $('knobR'), (x, y, active) => {
    stick.aiming = active && Math.hypot(x, y) > 0.2;
    if (active && Math.hypot(x, y) > 0.05) stick.aimAngle = Math.atan2(y, x);
  });
}

window.addEventListener('keydown', (e) => setKey(e.code, true));
window.addEventListener('keyup', (e) => setKey(e.code, false));
function setKey(code: string, v: boolean) {
  if (code === 'KeyW' || code === 'ArrowUp') keys.up = v;
  if (code === 'KeyS' || code === 'ArrowDown') keys.down = v;
  if (code === 'KeyA' || code === 'ArrowLeft') keys.left = v;
  if (code === 'KeyD' || code === 'ArrowRight') keys.right = v;
}

// ---------- game scene ----------
interface Config { mode: 'single' | 'multi'; name: string; room: string }

class GameScene extends Phaser.Scene {
  private cfg!: Config;
  private gfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private sim?: Sim;
  private ws?: WebSocket;
  private myId = 'me';
  private snap: Snapshot | null = null;
  private shown = new Map<string, { x: number; y: number }>();
  private acc = 0;
  private mouseDown = false;
  private status = '';

  constructor() { super('game'); }
  init(cfg: Config) { this.cfg = cfg; }

  create() {
    this.gfx = this.add.graphics();
    this.hud = this.add.text(10, 10, '', { fontSize: '14px', color: '#e8eef5', backgroundColor: '#00000066', padding: { x: 6, y: 4 } })
      .setScrollFactor(0).setDepth(100);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.input.on('pointerdown', () => { if (!isTouch) this.mouseDown = true; });
    this.input.on('pointerup', () => { this.mouseDown = false; });
    this.input.mouse?.disableContextMenu();

    if (this.cfg.mode === 'single') {
      this.sim = new Sim();
      this.sim.addPlayer(this.myId, this.cfg.name);
      for (let i = 1; i <= 3; i++) this.sim.addPlayer(`bot${i}`, `Bot ${i}`, true);
    } else {
      this.status = 'Connecting...';
      const url = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8080`;
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.ws!.send(JSON.stringify({ type: 'join', name: this.cfg.name, room: this.cfg.room }));
      this.ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data) as ServerMsg;
        if (m.type === 'welcome') { this.myId = m.id; this.status = `Room: ${m.room}`; }
        else this.snap = m.snap;
      };
      this.ws.onclose = () => { this.status = 'Disconnected (is the server running?)'; };
    }
  }

  private readInput(): Input {
    const cam = this.cameras.main;
    const me = this.snap?.players.find((p) => p.id === this.myId);
    let mx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stick.mx;
    let my = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) + stick.my;
    let angle = me?.angle ?? 0;
    let fire = this.mouseDown;
    if (isTouch) {
      angle = stick.aimAngle;
      fire = stick.aiming;
    } else if (me) {
      const p = this.input.activePointer;
      angle = Math.atan2(p.y + cam.scrollY - me.y, p.x + cam.scrollX - me.x);
    }
    return { mx, my, angle, fire };
  }

  update(_t: number, delta: number) {
    const input = this.readInput();
    if (this.sim) {
      this.sim.setInput(this.myId, input);
      this.acc += delta / 1000;
      const dt = 1 / TICK_RATE;
      while (this.acc >= dt) { this.sim.step(dt); this.acc -= dt; }
      this.snap = this.sim.snapshot();
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendAcc += delta;
      if (this.sendAcc >= 1000 / TICK_RATE) {
        this.sendAcc = 0;
        this.ws.send(JSON.stringify({ type: 'input', input }));
      }
    }
    this.draw(delta);
  }
  private sendAcc = 0;

  private draw(delta: number) {
    const g = this.gfx;
    g.clear();
    g.fillStyle(0x121a24).fillRect(0, 0, WORLD_W, WORLD_H);
    g.lineStyle(1, 0x1c2735);
    for (let x = 0; x <= WORLD_W; x += 100) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += 100) g.lineBetween(0, y, WORLD_W, y);
    g.fillStyle(0x3a4a60);
    for (const w of WALLS) g.fillRect(w.x, w.y, w.w, w.h);

    const s = this.snap;
    if (!s) { this.hud.setText(this.status); return; }

    g.fillStyle(0xffd34d);
    for (const b of s.bullets) g.fillCircle(b.x, b.y, 4);

    const smooth = 1 - Math.pow(0.0001, delta / 1000); // frame-rate independent lerp, hides 30Hz snapshots
    const seen = new Set<string>();
    for (const p of s.players) {
      seen.add(p.id);
      let d = this.shown.get(p.id);
      if (!d || !this.sim && Math.hypot(d.x - p.x, d.y - p.y) > 200) d = { x: p.x, y: p.y };
      else if (!this.sim) { d.x += (p.x - d.x) * smooth; d.y += (p.y - d.y) * smooth; }
      else { d.x = p.x; d.y = p.y; }
      this.shown.set(p.id, d);

      let label = this.labels.get(p.id);
      if (!label) {
        label = this.add.text(0, 0, p.name, { fontSize: '12px', color: '#fff' }).setOrigin(0.5).setDepth(50);
        this.labels.set(p.id, label);
      }
      label.setVisible(p.alive).setPosition(d.x, d.y - PLAYER_R - 22);
      if (!p.alive) continue;

      const mine = p.id === this.myId;
      g.fillStyle(mine ? 0x4da3ff : p.bot ? 0xc96b6b : 0xe0a34d).fillCircle(d.x, d.y, PLAYER_R);
      g.lineStyle(5, 0xffffff).lineBetween(d.x, d.y, d.x + Math.cos(p.angle) * (PLAYER_R + 12), d.y + Math.sin(p.angle) * (PLAYER_R + 12));
      g.fillStyle(0x000000, 0.6).fillRect(d.x - 20, d.y - PLAYER_R - 12, 40, 5);
      g.fillStyle(0x3ddc84).fillRect(d.x - 20, d.y - PLAYER_R - 12, 40 * (p.hp / MAX_HP), 5);
    }
    for (const [id, l] of this.labels) if (!seen.has(id)) { l.destroy(); this.labels.delete(id); this.shown.delete(id); }

    const me = s.players.find((p) => p.id === this.myId);
    const cam = this.cameras.main;
    const md = this.shown.get(this.myId);
    if (md) cam.centerOn(md.x, md.y);
    const board = [...s.players].sort((a, b) => b.score - a.score).slice(0, 6)
      .map((p) => `${p.id === this.myId ? '> ' : '  '}${p.name}  ${p.score}/${p.deaths}`).join('\n');
    this.hud.setText(`${this.status ? this.status + '\n' : ''}${me && !me.alive ? 'Respawning...\n' : ''}${board}`);
  }
}

// ---------- boot ----------
function start(mode: 'single' | 'multi') {
  const name = ($('name') as HTMLInputElement).value.trim() || 'Player';
  const room = ($('room') as HTMLInputElement).value.trim();
  $('menu').style.display = 'none';
  if (isTouch) bindTouch();
  new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', backgroundColor: '#0b0f14',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [],
  }).scene.add('game', GameScene, true, { mode, name, room });
}
$('single').addEventListener('click', () => start('single'));
$('multi').addEventListener('click', () => start('multi'));
