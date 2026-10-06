// Animated "neural network" background: drifting neurons, synapses and travelling
// signals in neon colours. Calms down automatically during challenges so it never
// interferes with perception tasks.

const PALETTE = ['#b07bff', '#2ee6ff', '#ff4fd8', '#ffc53d', '#34f5c5', '#4d8dff', '#ff5470', '#9dff4a'];

export class NeuralBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.signals = [];
    this.particles = [];
    this.mode = 'full';
    this.level = 1; // smoothed intensity 0..1
    this.target = 1;
    this.running = false;
    this.last = 0;
    this.time = 0;
    this.resize = this.resize.bind(this);
    this.loop = this.loop.bind(this);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
    this.resize();
  }

  resize() {
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    const n = Math.round(Math.min(130, Math.max(36, (this.w * this.h) / 14000)));
    this.nodes = Array.from({ length: n }, (_, i) => this.nodes[i] || this.makeNode());
    this.nodes.forEach((p) => {
      p.x = Math.min(p.x, this.w);
      p.y = Math.min(p.y, this.h);
    });
    this.linkDist = Math.max(110, Math.min(170, this.w / 9));
    if (!this.running) this.drawFrame(0);
  }

  makeNode() {
    const a = Math.random() * Math.PI * 2;
    const s = 6 + Math.random() * 14;
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      r: 1 + Math.random() * 2.2,
      c: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      phase: Math.random() * Math.PI * 2,
    };
  }

  /** full | calm | off */
  setMode(mode) {
    this.mode = mode;
    document.body.dataset.bg = mode;
    this.target = mode === 'full' ? 1 : mode === 'calm' ? 0.28 : 0;
    if (mode === 'off') {
      this.signals = [];
    }
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
    if (document.body.classList.contains('reduce-motion')) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 120 + Math.random() * 380;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: Math.random() < 0.3 ? '#ffffff' : color, r: 1.5 + Math.random() * 2.5 });
    }
    this.start();
  }

  /** Fire a wave of signals (e.g. on level up). */
  surge(color) {
    for (let i = 0; i < 24; i++) this.spawnSignal(color);
  }

  spawnSignal(color) {
    if (this.nodes.length < 2) return;
    const a = this.nodes[Math.floor(Math.random() * this.nodes.length)];
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
    const reduce = document.body.classList.contains('reduce-motion');
    this.level += (this.target - this.level) * Math.min(1, dt * 3);
    this.time += dt;
    this.drawFrame(reduce ? 0 : dt);
    const idle = this.mode === 'off' && this.level < 0.01 && !this.particles.length;
    if ((reduce && !this.particles.length) || idle) {
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

    for (const p of this.nodes) {
      p.x += p.vx * dt * speed;
      p.y += p.vy * dt * speed;
      if (p.x < -20) p.x = w + 20;
      if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20;
      if (p.y > h + 20) p.y = -20;
    }

    const alpha = 0.1 + 0.9 * L;
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
        ctx.strokeStyle = `rgba(150,170,255,${(k * 0.16 * alpha).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    // neurons
    for (const p of this.nodes) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 1.6 + p.phase);
      ctx.globalAlpha = (0.35 + 0.5 * pulse) * alpha;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.8 + 0.4 * pulse), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // signals
    if (dt && L > 0.5 && Math.random() < dt * 6 * L) this.spawnSignal();
    ctx.globalCompositeOperation = 'lighter';
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
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = s.c;
      ctx.shadowColor = s.c;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (s.t >= 1) {
        this.signals.splice(i, 1);
        if (s.hops > 1) {
          // propagate to a neighbour of b
          const nb = this.nodes.find((n) => n !== s.a && n !== s.b && Math.hypot(n.x - s.b.x, n.y - s.b.y) < D && Math.random() < 0.5);
          if (nb) this.signals.push({ a: s.b, b: nb, t: 0, speed: s.speed, c: s.c, hops: s.hops - 1 });
        }
      }
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
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
