// DesignOS site: springs, gestures and a live demo library. No dependencies.
// Every animation starts from the on-screen value, inherits gesture velocity, projects
// momentum and can be grabbed mid-flight, following Apple's fluid-interface guidance.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

/* ---------- Motion ---------- */

// Apple's designer-facing spring: response (seconds) and damping ratio, unit mass.
class Spring {
  constructor(v, eps) { this.v = this.t = v; this.vel = 0; this.eps = eps; this.tune(0.4, 1); }
  tune(response, damping) { this.k = (2 * Math.PI / response) ** 2; this.c = (4 * Math.PI * damping) / response; }
  step(dt) {
    if (this.v === this.t && !this.vel) return false;
    const n = Math.ceil(dt / 0.004), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vel += (-this.k * (this.v - this.t) - this.c * this.vel) * h;
      this.v += this.vel * h;
    }
    if (Math.abs(this.v - this.t) < this.eps && Math.abs(this.vel) < this.eps * 20) { this.v = this.t; this.vel = 0; return false; }
    return true;
  }
}

const live = new Set();
let raf = 0, last = 0;
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 1 / 30);
  last = now;
  for (const b of live) if (!b.tick(dt)) live.delete(b);
  raf = live.size ? requestAnimationFrame(frame) : 0;
}
function wake(b) {
  live.add(b);
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
}

// A set of named springs drawn together. `to` re-targets from the live value and keeps
// velocity, so any animation can be interrupted by a new one without a jump.
class Body {
  constructor(init, draw) {
    this.s = {};
    for (const k in init) this.s[k] = new Spring(init[k], k === 's' || k === 'o' || k === 'v' ? 0.0005 : 0.05);
    this.draw = draw;
    this.onRest = null;
    draw(this);
  }
  get(k) { return this.s[k].v; }
  set(t) {
    this.onRest = null;
    for (const k in t) { const sp = this.s[k]; sp.v = sp.t = t[k]; sp.vel = 0; }
    this.draw(this);
  }
  to(t, { response = 0.4, damping = 1, velocity = {}, onRest = null } = {}) {
    if (reduce.matches) { this.set(t); onRest?.(); return; }
    for (const k in t) { const sp = this.s[k]; sp.t = t[k]; sp.tune(response, damping); if (k in velocity) sp.vel = velocity[k]; }
    this.onRest = onRest;
    wake(this);
  }
  tick(dt) {
    let moving = false;
    for (const k in this.s) if (this.s[k].step(dt)) moving = true;
    this.draw(this);
    if (!moving && this.onRest) { const f = this.onRest; this.onRest = null; f(); }
    for (const k in this.s) if (this.s[k].v !== this.s[k].t || this.s[k].vel) return true;
    return false;
  }
}
const place = (el, prefix = '') => (b) => {
  el.style.transform = `${prefix}translate3d(${b.get('x')}px,${b.get('y')}px,0) rotate(${b.get('r')}deg) scale(${b.get('s')})`;
};

// Velocity from the last 100 ms of pointer history, not just the final event.
function tracker() {
  let pts = [];
  return {
    add(e) { const t = performance.now(); pts.push([e.clientX, e.clientY, t]); pts = pts.filter((p) => t - p[2] < 100); },
    velocity() {
      const now = performance.now(), p = pts.filter((q) => now - q[2] < 100);
      if (p.length < 2) return { x: 0, y: 0 };
      const a = p[0], b = p[p.length - 1], dt = Math.max((b[2] - a[2]) / 1000, 0.008);
      return { x: (b[0] - a[0]) / dt, y: (b[1] - a[1]) / dt };
    },
  };
}
// Where a flick comes to rest, using scroll-style exponential deceleration.
const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
// Progressive resistance past a boundary instead of a hard stop.
const rubber = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
const band = (v, lo, hi, dim) => (v < lo ? lo - rubber(lo - v, dim) : v > hi ? hi + rubber(v - hi, dim) : v);

// Pointer drag with capture, a small slop before committing, and release velocity.
function drag(el, { start, move, end, slop = 4 }) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = tracker(), x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    t.add(e);
    const ctx = start?.(e);
    try { el.setPointerCapture(e.pointerId); } catch {}
    const onMove = (ev) => {
      t.add(ev);
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved && Math.hypot(dx, dy) < slop) return;
      moved = true;
      move?.(dx, dy, t.velocity(), ctx);
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      end?.(moved, t.velocity(), ctx);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  });
}

/* ---------- Shared bits ---------- */

const arOf = (id) => +$(`#ref-${id}`).style.getPropertyValue('--ar');
function art(id) {
  const a = $(`#ref-${id} .art`).cloneNode(true);
  a.style.setProperty('--ar', arOf(id));
  return a;
}
let toastTimer = 0;
function toast(msg) {
  const t = $('.toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
function store(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {}
}

/* ---------- Hero: the folio ---------- */

function hero() {
  const pile = $('.pile'), copyBox = $('.hero-copy'), back = $('.folio-back'), front = $('.folio-front'), hint = $('.folio-hint');
  const wide = [[0.1, 0.27, -7], [0.15, 0.58, 5], [0.09, 0.86, -3], [0.23, 0.86, 9], [0.9, 0.27, 6], [0.85, 0.58, -5], [0.91, 0.86, 4], [0.77, 0.86, -8]];
  const narrow = [[0.15, 0.74, -8], [0.85, 0.72, 7], [0.14, 0.91, 5], [0.86, 0.92, -6]];
  let W = 0, H = 0, cw = 0, F = null, spots = wide, z = 100, seq = 0, touched = false, slot = 0;

  const squash = new Body({ v: 0 }, (b) => {
    const v = b.get('v');
    back.style.transform = v ? `scale(${1 + v * 0.015}, ${1 - v * 0.03})` : '';
    front.style.transform = v ? `scale(${1 + v * 0.05}, ${1 - v * 0.08})` : '';
  });
  const thump = (amount = 1) => squash.to({ v: 0 }, { response: 0.45, damping: 0.45, velocity: { v: 7 * amount } });

  const cards = pile.dataset.cards.split(' ').map((spec) => {
    const [id, home] = spec.split(':');
    const el = document.createElement('div');
    el.className = 'ref';
    el.append(art(id));
    pile.insertBefore(el, front);
    const c = { el, ar: arOf(id), pocketHome: home === 'pocket', slot: home === 'pocket' ? -1 : slot++, saved: false, landed: true, order: 0, jitter: Math.random() * 6 - 3 };
    // Drawing also notices the moment a thrown card drops into the pocket.
    c.body = new Body({ x: 0, y: 0, r: 0, s: 1 }, (b) => {
      place(el)(b);
      if (!F || c.landed || !c.saved) return;
      const cx = b.get('x') + cw / 2, cy = b.get('y') + cw / c.ar / 2;
      if (cy > F.y + F.size * 0.3 && Math.abs(cx - (F.x + F.size / 2)) < F.size / 2) { c.landed = true; thump(); }
    });
    return c;
  });
  const h = (c) => cw / c.ar;
  const inPocketByDefault = (c) => c.pocketHome || c.slot >= spots.length;

  function measure() {
    W = pile.clientWidth; H = pile.clientHeight;
    spots = W < 700 ? narrow : wide;
    cw = clamp(W * 0.125, 92, 184);
    F = { x: back.offsetLeft, y: back.offsetTop, size: back.offsetWidth };
    for (const c of cards) c.el.style.width = `${cw}px`;
  }
  function home(c) {
    if (c.slot >= 0 && c.slot < spots.length) {
      const [fx, fy, r] = spots[c.slot];
      return { x: fx * W - cw / 2, y: clamp(fy * H - h(c) / 2, 70, H - h(c) - 8), r, s: 1 };
    }
    // Cards that live in the folio get tossed just above it.
    const x = F.x + F.size / 2 - cw / 2 + (Math.random() < 0.5 ? -1 : 1) * F.size * (0.9 + Math.random() * 0.5);
    return { x: clamp(x, 8, W - cw - 8), y: F.y - h(c) * 0.75, r: c.jitter * 2, s: 1 };
  }
  // Fan the saved cards in the pocket, like the app icon.
  function fan() {
    const saved = cards.filter((c) => c.saved).sort((a, b) => a.order - b.order);
    for (const c of cards) c.el.classList.toggle('pocket', c.saved);
    const n = saved.length, S = F.size, s = (S * 0.37) / cw;
    saved.forEach((c, i) => {
      const k = n > 1 ? i / (n - 1) - 0.5 : 0;
      const spread = Math.min(S * 0.42, (n - 1) * S * 0.13);
      const cx = F.x + S / 2 + k * spread, cy = F.y + S * 0.22 + (h(c) * s) / 2 + Math.abs(k) * S * 0.05;
      c.el.style.zIndex = 2 + i;
      c.target = { x: cx - cw / 2, y: cy - h(c) / 2, r: k * 24 + c.jitter, s };
    });
    return saved;
  }
  const refan = (except) => { for (const d of fan()) if (d !== except) d.body.to(d.target, { response: 0.45, damping: 0.9 }); };

  function save(c, v = { x: 0, y: 0 }) {
    c.saved = true; c.landed = false; c.order = ++seq;
    c.el.style.translate = '';
    refan(c);
    c.body.to(c.target, { response: 0.5, damping: 0.8, velocity: v });
    touched = true;
    updateHint();
  }
  function release(c, v = { x: 0, y: 0 }) {
    c.saved = false;
    c.el.style.zIndex = 50 + Math.max(c.slot, 8);
    c.target = home(c);
    c.body.to(c.target, { response: 0.55, damping: 0.8, velocity: v });
    refan();
    updateHint();
  }
  function land(c, v, x, y) {
    x = clamp(x, -cw * 0.1, W - cw * 0.9);
    y = clamp(y, 64, H - h(c) * 0.9);
    // References can't come to rest over the headline or buttons.
    const p = pile.getBoundingClientRect(), r = copyBox.getBoundingClientRect();
    const over = x < r.right - p.left - 12 && x + cw > r.left - p.left + 12 && y < r.bottom - p.top - 12 && y + h(c) > r.top - p.top + 12;
    if (over) return release(c, v);
    c.target = { x, y, r: clamp(v.x / 120, -10, 10) + c.jitter, s: 1 };
    c.body.to(c.target, { response: 0.6, damping: 0.8, velocity: v });
  }
  const nearFolio = (x, y) => {
    const m = F.size * 0.15;
    return x > F.x - m && x < F.x + F.size + m && y > F.y - m && y < F.y + F.size + m;
  };
  function updateHint() {
    const n = cards.filter((c) => c.saved).length;
    hint.firstElementChild.textContent = touched ? `${n} saved` : 'Throw a reference in';
    hint.lastElementChild.textContent = !touched ? 'or tap one' : n === cards.length ? 'Now find them below' : 'Tap the folio to spill';
  }

  for (const c of cards) {
    drag(c.el, {
      start() {
        const was = c.saved;
        if (was) { c.saved = false; refan(); }
        c.dragging = true;
        c.el.style.zIndex = ++z;
        c.el.classList.add('lifted');
        c.body.to({ s: 1.05 }, { response: 0.3 });
        return { was, x: c.body.get('x'), y: c.body.get('y') };
      },
      move(dx, dy, v, ctx) {
        c.body.set({ x: band(ctx.x + dx, -cw * 0.3, W - cw * 0.7, W), y: band(ctx.y + dy, 0, H - h(c) * 0.6, H) });
        c.body.to({ r: clamp(v.x / 60, -14, 14), s: 1.05 }, { response: 0.35, damping: 0.8 });
      },
      end(moved, v, ctx) {
        c.dragging = false;
        c.el.classList.remove('lifted');
        if (!moved) return ctx.was ? release(c) : save(c);
        const cx = c.body.get('x') + cw / 2, cy = c.body.get('y') + h(c) / 2;
        const px = cx + project(v.x), py = cy + project(v.y);
        if (nearFolio(cx, cy) || nearFolio(px, py) || nearFolio((cx + px) / 2, (cy + py) / 2)) return save(c, v);
        land(c, v, px - cw / 2, py - h(c) / 2);
      },
    });
  }
  front.addEventListener('click', () => {
    const out = cards.filter((c) => c.saved && !inPocketByDefault(c));
    if (!out.length) return thump(0.6);
    out.forEach((c, i) => setTimeout(() => release(c, { x: 0, y: -900 }), i * 50));
  });

  function layout() {
    measure();
    for (const c of cards) if (!c.saved && !c.dragging && c.slot >= spots.length) { c.saved = true; c.order = ++seq; }
    fan();
    for (const c of cards) {
      if (c.dragging) continue;
      if (!c.saved) c.target = home(c);
      c.body.to(c.target, { response: 0.5 });
    }
  }

  // Everything starts inside the folio, then spills out to where it rests.
  measure();
  for (const c of cards) if (inPocketByDefault(c)) { c.saved = true; c.order = ++seq; }
  fan();
  const inside = (c) => ({ x: F.x + F.size / 2 - cw / 2, y: F.y + F.size * 0.3, r: 0, s: (F.size * 0.3) / cw });
  // The folio rises first; its cards fan up, then the rest spill out across the page.
  for (const c of cards) c.body.set(inside(c));
  setTimeout(() => pile.classList.add('ready'), 380);
  cards.filter((c) => c.saved).forEach((c) => setTimeout(() => c.body.to(c.target, { response: 0.5, damping: 0.8 }), 460));
  cards.filter((c) => !c.saved).forEach((c, i) => {
    c.el.style.zIndex = 50 + c.slot;
    c.target = home(c);
    setTimeout(() => c.body.to(c.target, { response: 0.6, damping: 0.8 }), 700 + i * 70);
  });

  // Loose cards drift against the pointer at different depths, so the pile reads as layered.
  for (const c of cards) c.depth = 0.35 + Math.random() * 0.9;
  const look = new Body({ x: 0, y: 0 }, (b) => {
    for (const c of cards) if (!c.dragging) c.el.style.translate = c.saved ? '' : `${b.get('x') * c.depth}px ${b.get('y') * c.depth}px`;
  });
  $('.hero').addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') look.to({ x: (e.clientX / innerWidth - 0.5) * -40, y: (e.clientY / innerHeight - 0.5) * -28 }, { response: 1.1 });
  });
  updateHint();
  let size = `${W}x${H}`;
  addEventListener('resize', () => requestAnimationFrame(() => {
    if (`${pile.clientWidth}x${pile.clientHeight}` !== size) { layout(); size = `${W}x${H}`; }
  }));
}

/* ---------- Find: a live, searchable library ---------- */

const FAMILY = Object.fromEntries($$('.swatches button').map((b) => [b.dataset.color, b.style.getPropertyValue('--c')]));

// Average colour of an image, named the way the colour filter names it.
function family(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  let r = 0, gr = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
  const n = (d.length / 4) * 255;
  r /= n; gr /= n; b /= n;
  const max = Math.max(r, gr, b), min = Math.min(r, gr, b), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  if (l < 0.2) return 'dark';
  if (s < 0.18 || l > 0.9) return 'neutral';
  let hue = max === r ? ((gr - b) / (max - min)) % 6 : max === gr ? (b - r) / (max - min) + 2 : (r - gr) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  return hue < 15 || hue >= 340 ? 'red' : hue < 42 ? 'orange' : hue < 70 ? 'yellow' : hue < 170 ? 'green' : hue < 255 ? 'blue' : 'violet';
}

function library(openDetail) {
  const grid = $('.grid'), input = $('#q'), count = $('#count'), empty = $('.lib-empty'), swatches = $$('.swatches button');
  let color = null;

  function item(el) {
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${el.dataset.title}. Open details`);
    const it = { el, ar: +el.style.getPropertyValue('--ar'), shown: true, placed: false, ocr: $$('.ocr', el) };
    it.tags = el.dataset.tags.split(' ');
    it.colors = el.dataset.colors.split(' ');
    it.text = `${el.dataset.title} ${el.dataset.tags} ${it.ocr.map((o) => o.textContent).join(' ')}`.toLowerCase();
    it.body = new Body({ x: 0, y: 0, r: 0, s: 1 }, place(el));
    el.addEventListener('click', () => openDetail(it));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(it); }
    });
    return it;
  }
  const items = $$('.grid .ref').map(item);

  // Free text matches titles, tags and recognised text; tag:, color: and source: narrow it.
  function matches(it, q) {
    return q.split(/\s+/).filter(Boolean).every((w) => {
      const [k, val] = w.includes(':') ? w.split(':') : ['', w];
      if (k === 'color' || k === 'colour') return it.colors.includes(val);
      if (k === 'tag') return it.tags.includes(val);
      if (k === 'source') return it.el.dataset.source.toLowerCase().includes(val);
      return it.text.includes(w);
    });
  }

  function layout(animate) {
    const W = grid.clientWidth, cols = W < 520 ? 2 : W < 860 ? 3 : 4, gap = W < 520 ? 10 : 14;
    const w = (W - gap * (cols - 1)) / cols, hs = new Array(cols).fill(0);
    for (const it of items) {
      it.el.style.width = `${w}px`;
      if (!it.shown) { if (animate) it.body.to({ s: 0.94 }, { response: 0.3 }); continue; }
      const c = hs.indexOf(Math.min(...hs)), t = { x: c * (w + gap), y: hs[c], s: 1 };
      hs[c] += w / it.ar + gap;
      if (!animate || !it.placed) it.body.set(t);
      else if (it.fresh) { it.body.set({ x: t.x, y: t.y, s: 0.94 }); it.body.to({ s: 1 }, { response: 0.35 }); }
      else it.body.to(t, { response: 0.45 });
      it.placed = true;
      it.fresh = false;
    }
    grid.style.height = `${Math.max(0, Math.max(...hs) - gap)}px`;
  }

  function apply() {
    const q = input.value.trim().toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 1 && !w.includes(':'));
    let n = 0;
    for (const it of items) {
      const show = matches(it, q) && (!color || it.colors.includes(color));
      if (show && !it.shown) it.fresh = true;
      it.shown = show;
      it.el.classList.toggle('out', !show);
      it.el.inert = !show;
      for (const o of it.ocr) o.classList.toggle('hit', show && words.some((w) => o.textContent.toLowerCase().includes(w)));
      n += show;
    }
    count.textContent = n ? `${n} reference${n === 1 ? '' : 's'}` : 'No matches';
    empty.hidden = n > 0;
    layout(true);
  }
  function reset() {
    input.value = '';
    color = null;
    swatches.forEach((s) => s.setAttribute('aria-pressed', 'false'));
  }

  input.addEventListener('input', apply);
  $$('[data-q]').forEach((b) => b.addEventListener('click', () => { input.value = b.dataset.q; apply(); }));
  swatches.forEach((b) => b.addEventListener('click', () => {
    color = color === b.dataset.color ? null : b.dataset.color;
    swatches.forEach((s) => s.setAttribute('aria-pressed', String(s.dataset.color === color)));
    apply();
  }));
  $('[data-clear]').addEventListener('click', () => { reset(); apply(); input.focus(); });
  addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.target.closest('input, textarea, dialog')) return;
    e.preventDefault();
    input.scrollIntoView({ block: 'center' });
    input.focus({ preventScroll: true });
  });
  let w = grid.clientWidth;
  addEventListener('resize', () => requestAnimationFrame(() => { if (grid.clientWidth !== w) { w = grid.clientWidth; layout(true); } }));
  layout(false);

  // The first time the grid scrolls into view, cards rise into place one after another.
  grid.classList.add('pre');
  new IntersectionObserver(([e], o) => {
    if (!e.isIntersecting) return;
    o.disconnect();
    items.forEach((it, i) => {
      const y = it.body.get('y');
      if (!reduce.matches) it.body.set({ y: y + 160, s: 0.9 });
      setTimeout(() => { it.el.classList.add('up'); it.body.to({ y, s: 1 }, { response: 0.8, damping: 0.86 }); }, 40 + i * 50);
    });
  }, { threshold: 0.05 }).observe(grid);
  grid.addEventListener('pointermove', (e) => {
    const f = e.pointerType === 'mouse' && e.target.closest('.ref');
    if (!f) return;
    const r = f.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    f.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
    f.style.setProperty('--rx', `${(0.5 - y) * 14}deg`);
    f.style.setProperty('--gx', `${x * 100}%`);
    f.style.setProperty('--gy', `${y * 100}%`);
  });
  grid.addEventListener('pointerout', (e) => {
    const f = e.target.closest('.ref');
    if (f && !f.contains(e.relatedTarget)) { f.style.removeProperty('--rx'); f.style.removeProperty('--ry'); }
  });

  // Your own images join the library. Object URLs only: nothing is uploaded.
  async function add(file) {
    const img = new Image();
    img.alt = '';
    img.src = URL.createObjectURL(file);
    try { await img.decode(); } catch { return toast('That image could not be read.'); }
    const name = file.name && !/^image\.\w+$/.test(file.name) ? file.name.replace(/\.[^.]+$/, '') : 'Pasted image';
    const el = document.createElement('figure');
    el.className = 'ref mine up';
    el.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(4));
    Object.assign(el.dataset, { title: name, tags: 'yours mine dropped', colors: family(img), source: 'this tab' });
    const a = document.createElement('div');
    a.className = 'art';
    a.append(img);
    el.append(a);
    grid.prepend(el);
    const it = item(el);
    items.unshift(it);
    reset();
    apply();
    it.body.set({ s: 0.85 });
    it.body.to({ s: 1 }, { response: 0.4, damping: 0.75 });
    toast(`Saved “${name}”. It stays in this tab.`);
    const r = grid.getBoundingClientRect();
    if (r.top > innerHeight || r.bottom < 0) grid.scrollIntoView({ block: 'start' });
  }
  const zone = $('.drop');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  let depth = 0;
  addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; zone.classList.add('on'); } });
  addEventListener('dragleave', (e) => { if (hasFiles(e) && --depth <= 0) { depth = 0; zone.classList.remove('on'); } });
  addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    zone.classList.remove('on');
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')).slice(0, 12);
    files.length ? files.forEach(add) : toast('Drop an image file to save it.');
  });
  addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/')).slice(0, 12);
    if (!files.length) return;
    e.preventDefault();
    files.forEach(add);
  });
}

/* ---------- Detail: opens from the card, drags away to close ---------- */

function detailer() {
  const dlg = $('#detail'), media = $('.d-media', dlg), scrim = $('.d-scrim', dlg);
  const mb = new Body({ x: 0, y: 0, s: 1 }, (b) => { media.style.transform = `translate3d(${b.get('x')}px,${b.get('y')}px,0) scale(${b.get('s')})`; });
  const sb = new Body({ o: 0 }, (b) => { scrim.style.opacity = b.get('o'); });
  let cur = null;

  // The source card's position relative to the centred media, as an offset and scale.
  function origin() {
    const a = cur.el.getBoundingClientRect(), m = media.getBoundingClientRect(), s = mb.get('s');
    const mx = m.left + m.width / 2 - mb.get('x'), my = m.top + m.height / 2 - mb.get('y');
    return { x: a.left + a.width / 2 - mx, y: a.top + a.height / 2 - my, s: a.width / (m.width / s) };
  }
  function open(it) {
    cur = it;
    media.style.setProperty('--ar', it.ar);
    media.replaceChildren(it.el.querySelector('.art').cloneNode(true));
    $('.d-title', dlg).textContent = it.el.dataset.title;
    $('.d-source', dlg).textContent = `Saved from ${it.el.dataset.source}`;
    $('.d-tags', dlg).replaceChildren(...it.tags.slice(0, 6).map((t) => Object.assign(document.createElement('span'), { textContent: t })));
    $('.d-colors', dlg).replaceChildren(...it.colors.map((c) => {
      const i = document.createElement('i');
      i.style.setProperty('--c', FAMILY[c]);
      i.title = c;
      return i;
    }));
    $('.d-text', dlg).textContent = it.ocr.map((o) => o.textContent).join(' · ') || 'None';
    document.documentElement.style.overflow = 'hidden';
    dlg.showModal();
    mb.set({ x: 0, y: 0, s: 1 });
    mb.set(origin());
    it.el.style.visibility = 'hidden';
    mb.to({ x: 0, y: 0, s: 1 }, { response: 0.45 });
    sb.to({ o: 1 }, { response: 0.35 });
    dlg.classList.add('shown');
  }
  // Return along the path it came, carrying whatever velocity the gesture gave it.
  function close(v = { x: 0, y: 0 }) {
    if (!cur) return;
    const it = cur;
    dlg.classList.remove('shown');
    sb.to({ o: 0 }, { response: 0.35 });
    mb.to(origin(), {
      response: 0.42,
      velocity: v,
      onRest: () => {
        it.el.style.visibility = '';
        dlg.close();
        document.documentElement.style.overflow = '';
        cur = null;
      },
    });
  }
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target === scrim || e.target.matches('.d-wrap')) close(); });
  $('.d-close', dlg).addEventListener('click', () => close());
  drag(media, {
    start: () => ({ x: mb.get('x'), y: mb.get('y') }),
    move(dx, dy, v, ctx) {
      dlg.classList.add('shown');
      const x = ctx.x + dx, y = ctx.y + dy, p = Math.min(Math.hypot(x, y) / 600, 1);
      mb.set({ x, y, s: 1 - p * 0.3 });
      sb.set({ o: 1 - p * 0.85 });
    },
    end(moved, v) {
      if (!moved) return;
      if (Math.hypot(mb.get('x') + project(v.x), mb.get('y') + project(v.y)) > 220) return close(v);
      mb.to({ x: 0, y: 0, s: 1 }, { response: 0.4, damping: 0.8, velocity: v });
      sb.to({ o: 1 }, { response: 0.3 });
    },
  });
  return open;
}

/* ---------- Capture: a context menu that saves into the inbox ---------- */

function capture() {
  const menu = $('#ctx'), list = $('.inbox-list'), n = $('.inbox-n');
  let shot = null, count = 0;

  function openMenu(x, y, s) {
    shot = s;
    menu.hidden = false;
    menu.style.left = `${Math.min(x, innerWidth - menu.offsetWidth - 8)}px`;
    menu.style.top = `${Math.min(y, innerHeight - menu.offsetHeight - 8)}px`;
    menu.querySelector('button').focus({ preventScroll: true });
  }
  function closeMenu(restore) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (restore) shot?.focus({ preventScroll: true });
  }
  function entry(thumb, title, sub) {
    list.querySelector('.inbox-empty')?.remove();
    const li = document.createElement('li');
    li.innerHTML = '<span class="thumb"></span><span><b></b><small></small></span>';
    li.firstChild.append(thumb);
    li.querySelector('b').textContent = title;
    li.querySelector('small').textContent = sub;
    list.prepend(li);
    n.textContent = ++count;
    while (list.children.length > 5) list.lastElementChild.remove();
    return li;
  }
  function saveImage(s) {
    const src = s.querySelector('.art');
    const li = entry(src.cloneNode(true), $(`#ref-${s.dataset.clone}`).dataset.title, 'lumen.studio · just now');
    li.style.visibility = 'hidden';
    s.classList.add('saved');
    const a = src.getBoundingClientRect(), b = li.firstChild.getBoundingClientRect(), k = b.width / a.width;
    const fly = src.cloneNode(true);
    fly.classList.add('flyer');
    fly.style.width = `${a.width}px`;
    document.body.append(fly);
    const body = new Body({ x: a.left, y: a.top, r: 0, s: 1 }, place(fly));
    // Separate X and Y responses give the flight a gentle arc toward the inbox.
    body.to({ x: b.left, s: k }, { response: 0.5 });
    body.to({ y: b.top + (b.height - a.height * k) / 2 }, {
      response: 0.38,
      onRest: () => { fly.remove(); li.style.visibility = ''; },
    });
  }
  function savePage() {
    const ico = document.createElement('span');
    ico.className = 'link-ico';
    ico.textContent = '↗';
    entry(ico, 'Selected work, 2026', 'Page · lumen.studio');
  }

  for (const s of $$('.shot')) {
    s.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu(e.clientX, e.clientY, s); });
    s.addEventListener('click', (e) => {
      const r = s.getBoundingClientRect();
      e.detail ? openMenu(e.clientX, e.clientY, s) : openMenu(r.left + r.width / 2, r.top + r.height / 2, s);
    });
  }
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-save]');
    if (!b) return;
    closeMenu(false);
    b.dataset.save === 'image' ? saveImage(shot) : savePage();
  });
  menu.addEventListener('keydown', (e) => {
    const items = $$('button:not([aria-disabled])', menu), i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') closeMenu(true);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); }
    else if (e.key === 'Tab') closeMenu(true);
  });
  addEventListener('pointerdown', (e) => { if (!menu.contains(e.target)) closeMenu(false); }, true);
  addEventListener('scroll', () => closeMenu(false), { passive: true });
}

/* ---------- Spaces: a board you can rearrange ---------- */

function spaces() {
  const space = $('.space'), board = $('.board'), inner = $('.board-inner'), zoom = $('.zoom output'), present = $('[data-present]');
  const BW = 1200, BH = 680;
  let k = 1, z = 10, selected = null;
  const items = $$('.item', board).map((el) => ({ el, body: new Body({ x: +el.dataset.x, y: +el.dataset.y, r: +(el.dataset.r || 0), s: 1 }, place(el)) }));

  function fit() {
    const full = document.fullscreenElement === space, w = board.clientWidth;
    k = Math.min(w / BW, full ? (space.clientHeight - 140) / BH : Infinity);
    inner.style.transform = `scale(${k})`;
    inner.style.left = `${(w - BW * k) / 2}px`;
    board.style.height = `${BH * k}px`;
    zoom.textContent = `${Math.round(k * 100)}%`;
  }
  function select(it) {
    selected?.el.classList.remove('sel');
    selected = it;
    it?.el.classList.add('sel');
  }
  for (const it of items) {
    drag(it.el, {
      start() {
        select(it);
        it.el.style.zIndex = ++z;
        it.el.classList.add('drag');
        it.body.to({ s: 1.03 }, { response: 0.25 });
        return { x: it.body.get('x'), y: it.body.get('y') };
      },
      move(dx, dy, v, c) {
        const w = it.el.offsetWidth, h = it.el.offsetHeight;
        it.body.set({ x: band(c.x + dx / k, 0, BW - w, BW / 2), y: band(c.y + dy / k, 0, BH - h, BH / 2) });
      },
      end(moved, v) {
        it.el.classList.remove('drag');
        const w = it.el.offsetWidth, h = it.el.offsetHeight, vx = moved ? v.x / k : 0, vy = moved ? v.y / k : 0;
        const x = clamp(it.body.get('x') + project(vx, 0.996), 0, BW - w), y = clamp(it.body.get('y') + project(vy, 0.996), 0, BH - h);
        it.body.to({ x, y, s: 1 }, { response: 0.5, damping: moved ? 0.8 : 1, velocity: { x: vx, y: vy } });
      },
    });
  }
  board.addEventListener('pointerdown', (e) => { if (e.target === board || e.target === inner) select(null); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });
  if (space.requestFullscreen) {
    present.addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : space.requestFullscreen()));
    document.addEventListener('fullscreenchange', () => {
      present.lastChild.textContent = document.fullscreenElement ? ' Stop' : ' Present';
      fit();
    });
  } else present.hidden = true;
  new ResizeObserver(fit).observe(board);
  fit();
}

/* ---------- Rediscover: swipe to sort ---------- */

function rediscover() {
  const stack = $('.stack'), status = $('#stack-status');
  const tags = { right: $('.verdict.keep', stack), left: $('.verdict.trash', stack), up: $('.verdict.file', stack) };
  const words = { right: 'Kept', left: 'Moved to Trash', up: 'Added to a collection' };
  let order = $$('.ref', stack).map((el) => ({ el, body: new Body({ x: 0, y: 0, r: 0, s: 1 }, place(el, 'translate(-50%, -50%) ')) }));
  const top = () => order[order.length - 1];

  function arrange(animate, skip) {
    order.forEach((c, i) => {
      if (c === skip) return;
      const depth = order.length - 1 - i;
      c.el.style.zIndex = i;
      const t = { x: 0, y: depth * 14, r: depth ? (depth % 2 ? 3 : -3) : 0, s: 1 - depth * 0.05 };
      animate ? c.body.to(t, { response: 0.45 }) : c.body.set(t);
    });
  }
  const show = (dir, p) => { for (const d in tags) tags[d].style.opacity = d === dir ? p : 0; };
  const dirOf = (x, y) => (Math.abs(y) > Math.abs(x) ? (y < 0 ? 'up' : null) : x > 0 ? 'right' : 'left');

  function fling(dir, v = { x: 0, y: 0 }) {
    const c = top(), W = stack.clientWidth, H = stack.clientHeight;
    const out = dir === 'up'
      ? { x: c.body.get('x'), y: -H, r: 0 }
      : { x: (dir === 'right' ? 1 : -1) * W, y: c.body.get('y') + project(v.y) * 0.3, r: dir === 'right' ? 16 : -16 };
    status.textContent = words[dir];
    show(dir, 1);
    order = [c, ...order.slice(0, -1)];
    c.el.style.zIndex = 99;
    arrange(true, c);
    // Once it has left, it slides back in at the bottom of the pile.
    c.body.to({ ...out, s: 1 }, { response: 0.5, velocity: v, onRest: () => { show(null, 0); arrange(true); } });
  }
  drag(stack, {
    start() {
      const c = top();
      return { c, x: c.body.get('x'), y: c.body.get('y') };
    },
    move(dx, dy, v, { c, x, y }) {
      const nx = x + dx, ny = y + dy, d = dirOf(nx, ny);
      c.body.set({ x: nx, y: ny, r: nx / 14 });
      show(d, d ? clamp(Math.hypot(nx, ny) / 120, 0, 1) : 0);
    },
    end(moved, v, { c }) {
      if (!moved) return;
      const px = c.body.get('x') + project(v.x), py = c.body.get('y') + project(v.y), d = dirOf(px, py);
      if (d && Math.hypot(px, py) > 140) return fling(d, v);
      show(null, 0);
      c.body.to({ x: 0, y: 0, r: 0 }, { response: 0.4, damping: 0.75, velocity: v });
    },
  });
  const keyDir = { ArrowRight: 'right', ArrowLeft: 'left', ArrowUp: 'up' };
  stack.addEventListener('keydown', (e) => { if (keyDir[e.key]) { e.preventDefault(); fling(keyDir[e.key]); } });
  $$('[data-swipe]').forEach((b) => b.addEventListener('click', () => fling(b.dataset.swipe)));
  arrange(false);
}

/* ---------- Small pieces ---------- */

function explore() {
  for (const p of $$('.post')) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'heart';
    b.setAttribute('aria-label', `Save ${$(`#ref-${p.dataset.clone}`).dataset.title}`);
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.4-4.5-9.4-9C1.2 8.2 3.2 4.5 6.8 4.5c2.2 0 3.8 1.2 5.2 3 1.4-1.8 3-3 5.2-3 3.6 0 5.6 3.7 4.2 7-2 4.5-9.4 9-9.4 9z"/></svg>';
    b.addEventListener('click', () => b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')));
    p.append(b);
  }
}

function keycaps() {
  const caps = $$('.t-keys kbd');
  const light = (key) => caps.forEach((k) => { if (k.textContent === key) k.classList.add('lit'); });
  const clear = () => caps.forEach((k) => k.classList.remove('lit'));
  addEventListener('keydown', (e) => {
    if (e.key === 'Meta' || e.metaKey) light('⌘');
    if (e.metaKey && e.key.length === 1) light(e.key.toUpperCase());
  });
  addEventListener('keyup', clear);
  addEventListener('blur', clear);
}

function terminal() {
  const term = $('.term'), steps = $$('[data-step]', term), typed = $('.typed', term), text = typed.textContent;
  let timers = [];
  function play() {
    timers.forEach(clearTimeout);
    timers = [];
    steps.forEach((s) => s.classList.remove('in'));
    typed.textContent = text;
    if (reduce.matches) return steps.forEach((s) => s.classList.add('in'));
    typed.textContent = '';
    typed.classList.add('typing');
    steps[0].classList.add('in');
    let t = 350;
    for (let i = 1; i <= text.length; i++) timers.push(setTimeout(() => { typed.textContent = text.slice(0, i); }, (t += 22 + Math.random() * 28)));
    timers.push(setTimeout(() => typed.classList.remove('typing'), (t += 250)));
    [700, 500, 500, 900].forEach((d, i) => timers.push(setTimeout(() => steps[i + 1].classList.add('in'), (t += d))));
  }
  new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); play(); } }, { threshold: 0.35 }).observe(term);
  $('.replay', term).addEventListener('click', play);
}

function nav() {
  const bar = $('.nav'), thumb = $('.seg-thumb'), links = $$('.seg a'), secs = links.map((a) => $(a.hash));
  const tb = new Body({ x: 0, w: 0, o: 0 }, (b) => {
    thumb.style.transform = `translateX(${b.get('x')}px)`;
    thumb.style.width = `${b.get('w')}px`;
    thumb.style.opacity = b.get('o');
  });
  let cur = -1, queued = false;
  const darks = $$('.dark');
  function update() {
    queued = false;
    bar.classList.toggle('scrolled', scrollY > 8);
    // Over a dark section the bar takes the dark appearance, like a material adapting.
    bar.classList.toggle('dark', heroDark || darks.some((d) => { const r = d.getBoundingClientRect(); return r.top < 40 && r.bottom > 40; }));
    let i = -1;
    secs.forEach((s, j) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) i = j; });
    if (i === cur) return;
    cur = i;
    links.forEach((a, j) => (j === i ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    links.forEach((a, j) => a.classList.toggle('on', j === i));
    if (i < 0) return tb.to({ o: 0 }, { response: 0.3 });
    const a = links[i], t = { x: a.offsetLeft, w: a.offsetWidth };
    if (tb.get('o') < 0.05) { tb.set(t); tb.to({ o: 1 }, { response: 0.3 }); }
    else tb.to({ ...t, o: 1 }, { response: 0.4 });
  }
  addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

const THEMES = ['system', 'light', 'dark'];
const themeNow = () => document.documentElement.dataset.theme || 'system';
const titleCase = (s) => s[0].toUpperCase() + s.slice(1);
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(themeNow()) + 1) % THEMES.length];
  if (next === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  store('theme', next === 'system' ? null : next);
  toast(`Appearance: ${titleCase(next)}`);
}

function palette() {
  const dlg = $('#palette'), q = $('#pq'), opts = $$('#pl [role=option]');
  let idx = 0;
  const visible = () => opts.filter((o) => !o.hidden);
  function mark(i) {
    const v = visible();
    idx = clamp(i, 0, v.length - 1);
    opts.forEach((o) => o.setAttribute('aria-selected', 'false'));
    const o = v[idx];
    if (!o) return q.removeAttribute('aria-activedescendant');
    o.setAttribute('aria-selected', 'true');
    q.setAttribute('aria-activedescendant', o.id);
    o.scrollIntoView({ block: 'nearest' });
  }
  function filter() {
    const s = q.value.trim().toLowerCase();
    opts.forEach((o) => { o.hidden = !!s && !o.textContent.toLowerCase().includes(s); });
    mark(0);
  }
  function open() {
    q.value = '';
    $('.theme-now', dlg).textContent = titleCase(themeNow());
    filter();
    if (!dlg.open) dlg.showModal();
    q.focus();
  }
  async function run(o) {
    dlg.close();
    const href = o.dataset.href;
    if (o.dataset.act === 'copy') toast((await copy($('#install-cmd').textContent)) ? 'Install command copied' : 'Copy failed. Select the command instead.');
    else if (o.dataset.act === 'theme') cycleTheme();
    else if (href.startsWith('#')) $(href).scrollIntoView();
    else location.href = href;
  }
  opts.forEach((o, i) => {
    o.id = `cmd-${i}`;
    o.addEventListener('click', () => run(o));
    o.addEventListener('pointermove', () => mark(visible().indexOf(o)));
  });
  q.addEventListener('input', filter);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); mark(idx + (e.key === 'ArrowDown' ? 1 : -1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = visible()[idx]; if (o) run(o); }
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); dlg.open ? dlg.close() : open(); }
  });
  $$('[data-open-palette]').forEach((b) => b.addEventListener('click', open));
}

function tabs() {
  const all = $$('.win-tabs [role=tab]');
  const pick = (t) => all.forEach((u) => {
    const on = u === t;
    u.setAttribute('aria-selected', String(on));
    u.tabIndex = on ? 0 : -1;
    $(`#${u.getAttribute('aria-controls')}`).hidden = !on;
  });
  all.forEach((t, i) => {
    t.addEventListener('click', () => pick(t));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const n = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      pick(n);
      n.focus();
    });
  });
  pick(all[0]);
  return { pick, all };
}

function copyButtons() {
  for (const b of $$('[data-copy]')) {
    b.addEventListener('click', async () => {
      b.textContent = (await copy($(b.dataset.copy).textContent)) ? 'Copied' : 'Select to copy';
      setTimeout(() => { b.textContent = 'Copy'; }, 1800);
    });
  }
}

// Show the current release without editing the page for each version.
function version() {
  fetch('https://api.github.com/repos/dhruv465/DesignOS/releases/latest')
    .then((r) => (r.ok ? r.json() : null))
    .then((r) => {
      const v = r?.tag_name?.match(/\d+\.\d+(\.\d+)?/)?.[0];
      if (v) $$('[data-version]').forEach((e) => { e.textContent = v; });
    })
    .catch(() => {});
}

/* ---------- Scroll scenes ---------- */

const scenes = [];
const ease = (t) => t * t * (3 - 2 * t);
const span = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
// Progress through a pinned track: 0 as it pins, 1 as it lets go.
const pinned = (el, stick = innerHeight) => clamp(-el.getBoundingClientRect().top / Math.max(1, el.offsetHeight - stick), 0, 1);
let heroDark = false, sceneQueued = false;
function runScenes() { sceneQueued = false; for (const f of scenes) f(); }
const queueScenes = () => { if (!sceneQueued) { sceneQueued = true; requestAnimationFrame(runScenes); } };

function splitWords(el) {
  const out = [];
  (function walk(node) {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 1) { walk(n); continue; }
      if (n.nodeType !== 3) continue;
      const frag = document.createDocumentFragment();
      for (const part of n.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(part); continue; }
        const w = document.createElement('span');
        w.className = 'w';
        w.textContent = part;
        frag.append(w);
        out.push(w);
      }
      n.replaceWith(frag);
    }
  })(el);
  out.forEach((w, i) => w.style.setProperty('--i', i));
  return out;
}

// Scrolling flies the camera into the folio until the screen is the inside of it.
function dive() {
  const track = $('.dive'), heroEl = $('.hero'), copyBox = $('.hero-copy'), pile = $('.pile'), back = $('.folio-back');
  const fading = [$('.folio-hint'), $('.scroll-cue')], line = $('.dive-line');
  scenes.push(() => {
    const vh = innerHeight, p = pinned(track, heroEl.offsetHeight), F = back.offsetWidth;
    const ox = back.offsetLeft + F / 2, oy = back.offsetTop + F * 0.3, cy = vh / 2 - heroEl.getBoundingClientRect().top;
    const end = 1.7 * Math.max(vh / 2 / (0.3 * F), innerWidth / 2 / (0.5 * F), vh / 2 / (0.6 * F));
    const t = span(p, 0, 0.4);
    heroEl.classList.toggle('diving', p > 0.01);
    heroEl.style.setProperty('--p', p);
    heroEl.style.setProperty('--blk', span(p, 0.8, 0.96));
    copyBox.style.opacity = 1 - t;
    copyBox.style.transform = p ? `translate3d(0, ${-p * 200}px, 0) scale(${1 - t * 0.12})` : '';
    copyBox.style.filter = t > 0.01 ? `blur(${t * 16}px)` : '';
    for (const f of fading) f.style.opacity = 1 - span(p, 0, 0.1);
    pile.style.transformOrigin = `${ox}px ${oy}px`;
    pile.style.transform = p ? `translate3d(0, ${(cy - oy) * ease(span(p, 0, 0.7))}px, 0) scale(${1 + (end - 1) * p ** 2.4})` : '';
    pile.style.setProperty('--fade', 1 - span(p, 0.1, 0.4));
    pile.style.opacity = 1 - span(p, 0.84, 0.96);
    const l = span(p, 0.76, 0.94);
    line.style.opacity = l;
    line.style.top = `${cy}px`;
    line.style.transform = `translateY(-50%) scale(${0.9 + 0.1 * ease(l)})`;
    line.style.filter = l < 1 ? `blur(${(1 - l) * 12}px)` : '';
    heroDark = p > 0.85 && heroEl.getBoundingClientRect().bottom > 40;
  });
}

// The app window tilts up into place, then the scroll switches it from Library to Spaces.
function showcase({ pick, all }) {
  const track = $('.show'), stage = $('.show-stage'), win = $('.window');
  let shown = 0;
  scenes.push(() => {
    const vh = innerHeight, p = pinned(track), enter = span(vh - track.getBoundingClientRect().top, 0, vh);
    const a = ease(span(enter + p * 4, 0.35, 1.6));
    win.style.transform = `perspective(1600px) translateY(${(1 - a) * 90}px) rotateX(${(1 - a) * 32}deg) scale(${0.84 + 0.16 * a + span(p, 0.6, 1) * 0.04})`;
    win.style.opacity = 0.3 + 0.7 * a;
    stage.style.setProperty('--sp', p);
    const want = p < 0.5 ? 0 : 1;
    if (want !== shown) { shown = want; pick(all[want]); }
  });
}

// A sentence that lights up word by word, with references drifting past at different depths.
function statement() {
  const track = $('.statement'), words = splitWords($('.words')), drifts = $$('.drift', track);
  scenes.push(() => {
    const p = pinned(track), n = words.length, r = track.getBoundingClientRect();
    words.forEach((w, i) => w.style.setProperty('--o', 0.12 + 0.88 * clamp(p * 1.3 * n - i, 0, 1)));
    const g = span(innerHeight - r.top, 0, r.height + innerHeight);
    for (const d of drifts) {
      const k = +d.style.getPropertyValue('--d');
      d.style.transform = `translate3d(0, ${(0.5 - g) * k * 280}px, 0) rotate(${(g - 0.5) * k * 16}deg)`;
    }
  });
}

function buildRail() {
  const ids = $$('.grid .ref').map((f) => f.id.slice(4));
  $$('.row').forEach((row, r) => {
    for (let i = 0; i < 26; i++) {
      const id = ids[(i * 5 + r * 7) % ids.length], d = document.createElement('div');
      d.className = 'post';
      d.dataset.clone = id;
      d.style.setProperty('--ar', arOf(id));
      row.append(d);
    }
  });
}
// Rows slide sideways in opposite directions while the page scrolls down.
function railScene() {
  const track = $('.rail'), rows = $$('.row'), wrap = $('.rows');
  scenes.push(() => {
    const g = span(innerHeight - track.getBoundingClientRect().top, 0, track.offsetHeight);
    rows.forEach((row, i) => {
      const range = Math.max(0, row.offsetWidth - wrap.offsetWidth), k = row.dataset.dir === '1' ? g : 1 - g;
      row.style.transform = `translate3d(${-k * range * (i === 1 ? 0.9 : 1)}px, 0, 0)`;
    });
  });
}

// Dark sections open out to full width as they arrive, and tuck back in as they leave.
function darkOpen() {
  for (const el of $$('.sec.dark, .show')) {
    const show = el.classList.contains('show');
    scenes.push(() => {
      const r = el.getBoundingClientRect(), vh = innerHeight;
      const q = Math.min(show ? 1 : span(vh - r.top, 0, vh * 0.7), span(r.bottom, 0, vh * 0.7)), k = 1 - ease(q);
      el.style.setProperty('--ci', `${k * Math.min(innerWidth * 0.05, 64)}px`);
      el.style.setProperty('--cr', `${k * 44}px`);
    });
  }
  const mark = $('.wordmark');
  scenes.push(() => {
    const r = mark.getBoundingClientRect();
    mark.style.setProperty('--wy', `${(1 - span(innerHeight - r.top, 0, r.height * 0.9)) * 60}%`);
  });
}

// Headlines rise word by word; blocks settle in the first time they scroll into view.
function reveals() {
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  for (const h of $$('h1, .sec-head h2')) { splitWords(h); h.classList.add('split'); io.observe(h); }
  $('h1').style.setProperty('--d0', '120ms');
  const groups = ['.hero-copy > :not(h1)', '.sec-head > :not(h2)', '.capture > *', '.sync-row', '.trio > article', '.facts > div', '.lib-bar', '.lib-sub', '.drop-note', '.space', '.caption', '.tile', '.term', '.tool-list > div', '.finder', '.download .inner > :not(.dl-cards)', '.dl-card', '.foot > :not(.wordmark)'];
  for (const sel of groups) {
    const seen = new Map();
    for (const el of $$(sel)) {
      const i = seen.get(el.parentNode) || 0;
      seen.set(el.parentNode, i + 1);
      el.classList.add('rv');
      el.style.setProperty('--d', i + (el.closest('.hero-copy') ? 4 : 0));
      io.observe(el);
    }
  }
}

function spotlight() {
  for (const t of $$('.tile, .dl-card')) {
    t.addEventListener('pointermove', (e) => {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${e.clientX - r.left}px`);
      t.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }
}

// Mouse wheels glide instead of stepping. Trackpads, keys and touch keep native scrolling.
function smoothWheel() {
  if (!matchMedia('(pointer: fine)').matches) return;
  let target = scrollY, cur = scrollY, running = false, last = 0, wheelFrame = 0;
  const max = () => document.documentElement.scrollHeight - innerHeight;
  function step(now) {
    wheelFrame = 0;
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    cur += (target - cur) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - cur) < 0.5) { cur = target; running = false; }
    scrollTo({ top: cur, behavior: 'instant' });
    if (running) wheelFrame = requestAnimationFrame(step);
  }
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || $('dialog[open]') || document.documentElement.style.overflow === 'hidden') return;
    // Small, fractional deltas come from trackpads, which already glide.
    if (e.deltaMode === 0 && Math.abs(e.deltaY) < 40 && !Number.isInteger(e.deltaY)) return;
    e.preventDefault();
    if (!running) { target = cur = scrollY; }
    target = clamp(target + e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? innerHeight : 1), 0, max());
    if (!running) { running = true; last = performance.now(); wheelFrame = requestAnimationFrame(step); }
  }, { passive: false });
  const stop = () => { running = false; cancelAnimationFrame(wheelFrame); wheelFrame = 0; };
  addEventListener('keydown', stop);
  addEventListener('pointerdown', stop);
}

/* ---------- Start ---------- */

buildRail();
for (const el of $$('[data-clone]')) el.append(art(el.dataset.clone));
hero();
library(detailer());
capture();
spaces();
rediscover();
explore();
keycaps();
terminal();
nav();
const shots = tabs();
reveals();
spotlight();
if (!reduce.matches) {
  dive();
  showcase(shots);
  statement();
  railScene();
  darkOpen();
  smoothWheel();
  addEventListener('scroll', queueScenes, { passive: true });
  addEventListener('resize', queueScenes);
  runScenes();
}
palette();
copyButtons();
version();
