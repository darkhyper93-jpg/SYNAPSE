// Animated, interactive "neural network" background: drifting neurons, synapses and
// travelling signals in neon colours. Touch it and it reacts (shockwave + firing neurons).
// Calms down automatically during challenges so it never interferes with perception tasks.

const PALETTE = ['#b07bff', '#2ee6ff', '#ff4fd8', '#ffc53d', '#34f5c5', '#4d8dff', '#ff5470', '#9dff4a'];
const CONFETTI = ['#ff4fd8', '#b07bff', '#2ee6ff', '#34f5c5', '#ffc53d', '#ff5470', '#ffffff'];

export class NeuralBackground {
  constructor(canvas, { lowPower = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lowPower = lowPower;
    this.nodes = [];
    this.signals = [];
    this.particles = [];
    this.confettiBits = [];
    this.waves = [];
    this.mode = 'full';
    this.level = 1; // smoothed intensity 0..1
    this.target = 1;
    this.running = false;
    this.last = 0;
    this.time = 0;
    this.offset = { x: 0, y: 0, tx: 0, ty: 0 }; // parallax (device tilt / mouse)
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
    this.resize();
  }

  get reduced() {
    return document.body.classList.contains('reduce-motion');
  }

  resize() {
    const dpr = Math.min(this.lowPower ? 1.25 : 1.75, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    const cap = this.lowPower ? 60 : 130;
    const n = Math.round(Math.min(cap, Math.max(34, (this.w * this.h) / 12000)));
    this.nodes = Array.from({ length: n }, (_, i) => this.nodes[i] || this.makeNode());
    this.nodes.forEach((p) => {
      p.x = Math.min(p.x, this.w);
      p.y = Math.min(p.y, this.h);
    });
    this.linkDist = Math.max(100, Math.min(170, Math.max(this.w, this.h) / 8));
    if (!this.running) this.drawFrame(0);
  }

  makeNode() {
    const a = Math.random() * Math.PI * 2;
    const s = 6 + Math.random() * 14;
    const vx = Math.cos(a) * s;
    const vy = Math.sin(a) * s;
    return {
      x: Math.random() * (this.w || 400),
      y: Math.random() * (this.h || 800),
      vx,
      vy,
      bvx: vx,
      bvy: vy,
      r: 1 + Math.random() * 2.2,
      c: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      phase: Math.random() * Math.PI * 2,
      glow: 0,
    };
  }

  /** full | calm | off */
  setMode(mode) {
    this.mode = mode;
    document.body.dataset.bg = mode;
    this.target = mode === 'full' ? 1 : mode === 'calm' ? 0.28 : 0;
    if (mode === 'off') this.signals = [];
    this.start();
  }

  /** Parallax offset in px (from device tilt or pointer). */
  setParallax(x, y) {
    this.offset.tx = x;
    this.offset.ty = y;
    this.start();
  }

  start() {
    if (this.running || document.hidden) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
  }

  /** Celebration particles at screen coords. */
  burst(x, y, color = '#2ee6ff', count = 36) {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 380;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: Math.random() < 0.3 ? '#ffffff' : color, r: 1.5 + Math.random() * 2.5 });
    }
    this.start();
  }

  /** Falling confetti from the top of the screen. */
  confetti(count = 120) {
    if (this.reduced) return;
    for (let i = 0; i < count; i++) {
      this.confettiBits.push({
        x: Math.random() * this.w,
        y: -20 - Math.random() * this.h * 0.4,
        vx: (Math.random() - 0.5) * 120,
        vy: 120 + Math.random() * 220,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        c: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
        sway: Math.random() * Math.PI * 2,
      });
    }
    this.start();
  }

  /** Touch interaction: shockwave, pushed neurons and fired signals. */
  touch(x, y) {
    if (this.reduced || this.mode !== 'full') return;
    const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    this.waves.push({ x, y, r: 4, life: 1, c: color });
    const R = 190;
    const near = [];
    for (const n of this.nodes) {
      const dx = n.x + this.offset.x - x;
      const dy = n.y + this.offset.y - y;
      const d = Math.hypot(dx, dy);
      if (d < R && d > 0.1) {
        const k = (1 - d / R) * 320;
        n.vx += (dx / d) * k;
        n.vy += (dy / d) * k;
        n.glow = 1;
        near.push([d, n]);
      }
    }
    near.sort((a, b) => a[0] - b[0]);
    near.slice(0, 5).forEach(([, n]) => this.spawnSignal(color, n));
    this.start();
  }

  /** Finger dragging across the background leaves a sparkle trail. */
  trail(x, y) {
    if (this.reduced || this.mode !== 'full') return;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 20 + Math.random() * 60;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7, c: PALETTE[Math.floor(Math.random() * PALETTE.length)], r: 1 + Math.random() * 2 });
    }
    this.start();
  }

  /** Fire a wave of signals (e.g. on level up). */
  surge(color) {
    for (let i = 0; i < 24; i++) this.spawnSignal(color);
  }

  spawnSignal(color, from) {
    if (this.nodes.length < 2) return;
    const a = from || this.nodes[Math.floor(Math.random() * this.nodes.length)];
    let best = null;
    let bestD = Infinity;
    for (const b of this.nodes) {
      if (b === a) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < this.linkDist && d < bestD && Math.random() < 0.7) {
        best = b;
        bestD = d;
      }
    }
    if (best) this.signals.push({ a, b: best, t: 0, speed: 0.6 + Math.random() * 1.1, c: color || a.c, hops: 2 + Math.floor(Math.random() * 4) });
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.level += (this.target - this.level) * Math.min(1, dt * 3);
    this.time += dt;
    const busy = this.particles.length || this.confettiBits.length || this.waves.length;
    this.drawFrame(this.reduced && !busy ? 0 : dt);
    const idle = this.mode === 'off' && this.level < 0.01 && !busy;
    if ((this.reduced && !busy) || idle) {
      this.running = false;
      return;
    }
    requestAnimationFrame(this.loop);
  }

  drawFrame(dt) {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const L = this.level;
    const speed = 0.25 + 0.75 * L;
    const o = this.offset;
    o.x += (o.tx - o.x) * Math.min(1, dt * 4);
    o.y += (o.ty - o.y) * Math.min(1, dt * 4);

    for (const p of this.nodes) {
      // relax back to the cruising velocity after a touch impulse
      p.vx += (p.bvx - p.vx) * Math.min(1, dt * 1.6);
      p.vy += (p.bvy - p.vy) * Math.min(1, dt * 1.6);
      p.x += p.vx * dt * speed;
      p.y += p.vy * dt * speed;
      p.glow = Math.max(0, p.glow - dt * 1.2);
      if (p.x < -30) p.x = w + 30;
      if (p.x > w + 30) p.x = -30;
      if (p.y < -30) p.y = h + 30;
      if (p.y > h + 30) p.y = -30;
    }

    const alpha = 0.1 + 0.9 * L;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (L > 0.01) {
      // synapses
      ctx.lineWidth = 1;
      const D = this.linkDist;
      for (let i = 0; i < this.nodes.length; i++) {
        const a = this.nodes[i];
        for (let j = i + 1; j < this.nodes.length; j++) {
          const b = this.nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > D * D) continue;
          const k = 1 - Math.sqrt(d2) / D;
          const g = Math.max(a.glow, b.glow);
          ctx.strokeStyle = g > 0.05 ? `rgba(220,200,255,${(k * (0.16 + 0.5 * g) * alpha).toFixed(3)})` : `rgba(150,170,255,${(k * 0.16 * alpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      // neurons
      for (const p of this.nodes) {
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 1.6 + p.phase);
        ctx.globalAlpha = Math.min(1, (0.35 + 0.5 * pulse + p.glow) * alpha);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.8 + 0.4 * pulse + p.glow * 1.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // signals
    if (dt && L > 0.5 && Math.random() < dt * 6 * L) this.spawnSignal();
    ctx.globalCompositeOperation = 'lighter';
    const D = this.linkDist;
    for (let i = this.signals.length - 1; i >= 0; i--) {
      const s = this.signals[i];
      s.t += dt * s.speed * (0.5 + L);
      const x = s.a.x + (s.b.x - s.a.x) * s.t;
      const y = s.a.y + (s.b.y - s.a.y) * s.t;
      const tx = s.a.x + (s.b.x - s.a.x) * Math.max(0, s.t - 0.35);
      const ty = s.a.y + (s.b.y - s.a.y) * Math.max(0, s.t - 0.35);
      const g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, s.c);
      ctx.strokeStyle = g;
      ctx.globalAlpha = Math.max(alpha, 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = s.c;
      if (!this.lowPower) {
        ctx.shadowColor = s.c;
        ctx.shadowBlur = 12;
      }
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (s.t >= 1) {
        this.signals.splice(i, 1);
        s.b.glow = Math.max(s.b.glow, 0.6);
        if (s.hops > 1) {
          const nb = this.nodes.find((n) => n !== s.a && n !== s.b && Math.hypot(n.x - s.b.x, n.y - s.b.y) < D && Math.random() < 0.5);
          if (nb) this.signals.push({ a: s.b, b: nb, t: 0, speed: s.speed, c: s.c, hops: s.hops - 1 });
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // touch shockwaves (screen space)
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.r += dt * 420;
      wv.life -= dt * 1.6;
      if (wv.life <= 0) {
        this.waves.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = wv.life * 0.8;
      ctx.strokeStyle = wv.c;
      ctx.lineWidth = 2 + 4 * wv.life;
      ctx.beginPath();
      ctx.arc(wv.x, wv.y, wv.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = wv.life * 0.35;
      ctx.beginPath();
      ctx.arc(wv.x, wv.y, wv.r * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 2.2;
      p.vy *= 1 - dt * 2.2;
      p.vy += 60 * dt;
      p.life -= dt * 1.1;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // confetti
    for (let i = this.confettiBits.length - 1; i >= 0; i--) {
      const c = this.confettiBits[i];
      c.sway += dt * 3;
      c.x += (c.vx + Math.sin(c.sway) * 40) * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > h + 30) {
        this.confettiBits.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.scale(1, Math.cos(c.sway * 1.7));
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = c.c;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
