// Left-hand stage: mixer -> mould -> curing tank -> compression testing machine (CTM).
// Everything is drawn in one SVG (viewBox 0 0 1000 540). The prediction is already known when
// run() is called; the animation only reveals it.

const NS = 'http://www.w3.org/2000/svg';
const FLOOR = 480;
const CUBE = 80;                      // drawn cube size (represents a 150 mm cube)
const MAX_DIAL_KN = 2000;             // dial full scale
const DIAL = { cx: 887, cy: 335, r: 68, a0: -120, a1: 120 };
const DRUM = { cx: 140, cy: 170, r: 70, inner: 58 };
const POS = {
  mould: { x: 100, y: FLOOR - CUBE },
  tankIn: { x: 350, y: 390 },
  ctm: { x: 620, y: 365 },
  lift: 250,
};
const PLATEN_REST = 200, PLATEN_CONTACT = POS.ctm.y - 14;

const COLORS = {
  steel: '#6b7380', steelDark: '#3c434d', steelLight: '#aab2bd',
  drum: '#d9822b', drumDark: '#b5651a',
  ink3: '#8a8983', crack: '#2a2723',
  peak: '#e34948', lcd: '#0f1a14', lcdText: '#9cf5a8', lcdDim: '#5f9c69',
};

// ---------------------------------------------------------------- helpers
function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}
const ease = {
  linear: t => t,
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: t => 1 - (1 - t) ** 3,
  in: t => t * t,
};
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''); }
function mixHex(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(...A.map((v, i) => lerp(v, B[i], t))); }

/** Concrete colour from binder make-up: fly ash darkens, slag lightens. */
export function concreteColor(mix, cured = true) {
  const c = mix.cement, s = mix.blast_furnace_slag, f = mix.fly_ash, tot = c + s + f || 1;
  const base = hexToRgb('#9a958c'), slag = hexToRgb('#cfc8b4'), fa = hexToRgb('#5f6166');
  const rgb = base.map((v, i) => (v * c + slag[i] * s + fa[i] * f) / tot);
  const hex = rgbToHex(...rgb);
  return cured ? mixHex(hex, '#ffffff', 0.18) : mixHex(hex, '#2a2826', 0.38);
}

// ---------------------------------------------------------------- Stage
export class Stage {
  constructor(svg, { onStep = () => {} } = {}) {
    this.svg = svg;
    this.onStep = onStep;
    this.raf = new Set();
    this.build();
    this.reset();
  }

  tween(ms, fn, e = ease.inOut) {
    if (this.instant || ms <= 0) { fn(1); return Promise.resolve(); }
    return new Promise(resolve => {
      const t0 = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - t0) / ms);
        fn(e(t));
        if (t < 1) { const id = requestAnimationFrame(tick); this.raf.add(id); }
        else resolve();
      };
      this.raf.add(requestAnimationFrame(tick));
    });
  }
  sleep(ms) { return this.instant ? Promise.resolve() : new Promise(r => setTimeout(r, ms)); }

  // ------------------------------------------------------------ scene
  build() {
    const s = this.svg;
    s.innerHTML = '';
    const defs = el('defs', {}, s);
    const clip = el('clipPath', { id: 'drumClip' }, defs);
    el('circle', { cx: DRUM.cx, cy: DRUM.cy, r: DRUM.inner }, clip);
    const g = el('linearGradient', { id: 'steelGrad', x1: 0, x2: 1 }, defs);
    el('stop', { offset: 0, 'stop-color': '#8a929e' }, g);
    el('stop', { offset: 0.5, 'stop-color': '#c3c9d1' }, g);
    el('stop', { offset: 1, 'stop-color': '#79818d' }, g);

    // floor
    el('rect', { x: 0, y: FLOOR, width: 1000, height: 60, fill: '#ebe9e3' }, s);
    el('line', { x1: 0, x2: 1000, y1: FLOOR, y2: FLOOR, stroke: '#cfccc3', 'stroke-width': 2 }, s);

    // ---- mixer
    const mixer = el('g', {}, s);
    for (const [x1, x2] of [[100, 76], [180, 204]])
      el('line', { x1, y1: 215, x2, y2: FLOOR, stroke: COLORS.steelDark, 'stroke-width': 7, 'stroke-linecap': 'round' }, mixer);
    el('line', { x1: 84, y1: 380, x2: 196, y2: 380, stroke: COLORS.steelDark, 'stroke-width': 4 }, mixer);
    el('polygon', { points: '112,236 168,236 150,292 130,292', fill: COLORS.steelLight, stroke: COLORS.steel, 'stroke-width': 2 }, mixer);
    el('circle', { cx: DRUM.cx, cy: DRUM.cy, r: DRUM.r, fill: COLORS.drum, stroke: COLORS.drumDark, 'stroke-width': 4 }, mixer);
    for (let i = 0; i < 12; i++) {           // rivets
      const a = (i / 12) * Math.PI * 2;
      el('circle', { cx: DRUM.cx + Math.cos(a) * 64, cy: DRUM.cy + Math.sin(a) * 64, r: 2, fill: COLORS.drumDark }, mixer);
    }
    el('circle', { cx: DRUM.cx, cy: DRUM.cy, r: DRUM.inner, fill: '#2b2f35' }, mixer);
    const contentsG = el('g', { 'clip-path': 'url(#drumClip)' }, mixer);
    this.contents = el('rect', { x: DRUM.cx - DRUM.inner, width: DRUM.inner * 2, y: DRUM.cy + DRUM.inner, height: DRUM.inner * 2, fill: '#8d7f6a' }, contentsG);
    this.blades = el('g', {}, mixer);
    for (const a of [0, 60, 120])
      el('line', { x1: DRUM.cx - 52, y1: DRUM.cy, x2: DRUM.cx + 52, y2: DRUM.cy, stroke: '#c9ced6', 'stroke-width': 5,
        'stroke-linecap': 'round', transform: `rotate(${a} ${DRUM.cx} ${DRUM.cy})`, opacity: 0.9 }, this.blades);
    el('circle', { cx: DRUM.cx, cy: DRUM.cy, r: 9, fill: '#c9ced6', stroke: COLORS.steelDark, 'stroke-width': 2 }, this.blades);
    this.drumTarget = el('circle', { cx: DRUM.cx, cy: DRUM.cy, r: 20, fill: 'none' }, mixer);

    this.stream = el('rect', { x: 135, y: 292, width: 10, height: 0, rx: 3 }, s);

    // ---- curing tank (back)
    el('rect', { x: 300, y: 340, width: 180, height: 140, rx: 4, fill: '#e3ebf2', stroke: '#8ea3b5', 'stroke-width': 3 }, s);
    const day = el('g', {}, s);
    el('rect', { x: 345, y: 262, width: 90, height: 58, rx: 8, fill: '#ffffff', stroke: '#cfd6de', 'stroke-width': 2 }, day);
    el('rect', { x: 345, y: 262, width: 90, height: 16, rx: 8, fill: COLORS.peak }, day);
    el('rect', { x: 345, y: 270, width: 90, height: 8, fill: COLORS.peak }, day);
    el('text', { x: 390, y: 274, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#fff', 'letter-spacing': 1 }, day).textContent = 'CURING DAY';
    this.dayText = el('text', { x: 390, y: 311, 'text-anchor': 'middle', 'font-size': 28, 'font-weight': 700, fill: '#1f242a',
      'font-family': 'Consolas, monospace' }, day);

    // ---- CTM frame
    const ctm = el('g', {}, s);
    el('rect', { x: 560, y: 460, width: 200, height: 20, rx: 3, fill: COLORS.steelDark }, ctm);
    for (const x of [572, 732]) el('rect', { x, y: 90, width: 16, height: 372, fill: 'url(#steelGrad)', stroke: COLORS.steel }, ctm);
    el('rect', { x: 556, y: 76, width: 208, height: 34, rx: 4, fill: COLORS.steelDark }, ctm);
    el('rect', { x: 610, y: 445, width: 100, height: 15, rx: 2, fill: '#9aa3ae', stroke: COLORS.steel }, ctm);

    // ---- console
    const con = el('g', {}, s);
    el('rect', { x: 790, y: 110, width: 195, height: 340, rx: 14, fill: '#2f353d' }, con);
    el('rect', { x: 870, y: 450, width: 36, height: 30, fill: '#2f353d' }, con);
    el('rect', { x: 806, y: 126, width: 163, height: 122, rx: 6, fill: COLORS.lcd }, con);
    const lcdT = (y, size, fill, w = 400) => el('text', { x: 818, y, 'font-size': size, fill, 'font-weight': w,
      'font-family': 'Consolas, monospace' }, con);
    lcdT(144, 10, COLORS.lcdDim).textContent = 'LOAD  kN';
    this.loadText = lcdT(176, 28, COLORS.lcdText, 700);
    lcdT(198, 10, COLORS.lcdDim).textContent = 'STRESS  MPa';
    this.stressText = lcdT(226, 26, COLORS.lcdText, 700);
    this.rangeText = el('text', { x: 960, y: 226, 'text-anchor': 'end', 'font-size': 11, fill: COLORS.lcdDim,
      'font-family': 'Consolas, monospace' }, con);
    this.statusText = el('text', { x: 960, y: 144, 'text-anchor': 'end', 'font-size': 10, fill: COLORS.lcdDim,
      'font-weight': 700, 'font-family': 'Consolas, monospace' }, con);

    // dial
    el('circle', { cx: DIAL.cx, cy: DIAL.cy, r: DIAL.r, fill: '#f4f3ef', stroke: '#1f242a', 'stroke-width': 4 }, con);
    for (let kn = 0; kn <= MAX_DIAL_KN; kn += 100) {
      const major = kn % 500 === 0;
      const a = (lerp(DIAL.a0, DIAL.a1, kn / MAX_DIAL_KN) - 90) * Math.PI / 180;
      const r1 = DIAL.r - 6, r2 = r1 - (major ? 10 : 5);
      el('line', { x1: DIAL.cx + Math.cos(a) * r1, y1: DIAL.cy + Math.sin(a) * r1, x2: DIAL.cx + Math.cos(a) * r2, y2: DIAL.cy + Math.sin(a) * r2,
        stroke: '#1f242a', 'stroke-width': major ? 2 : 1 }, con);
      if (major) el('text', { x: DIAL.cx + Math.cos(a) * (r2 - 10), y: DIAL.cy + Math.sin(a) * (r2 - 10) + 3, 'text-anchor': 'middle',
        'font-size': 8, fill: '#52514e' }, con).textContent = kn;
    }
    el('text', { x: DIAL.cx, y: DIAL.cy + 32, 'text-anchor': 'middle', 'font-size': 9, fill: '#52514e', 'font-weight': 700 }, con).textContent = 'kN';
    this.peakNeedle = el('line', { x1: DIAL.cx, y1: DIAL.cy, x2: DIAL.cx, y2: DIAL.cy - 56, stroke: COLORS.peak, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, con);
    this.needle = el('line', { x1: DIAL.cx, y1: DIAL.cy + 10, x2: DIAL.cx, y2: DIAL.cy - 58, stroke: '#1f242a', 'stroke-width': 3, 'stroke-linecap': 'round' }, con);
    el('circle', { cx: DIAL.cx, cy: DIAL.cy, r: 6, fill: '#1f242a' }, con);
    el('text', { x: 887, y: 432, 'text-anchor': 'middle', 'font-size': 9, fill: '#aab2bd', 'letter-spacing': 1 }, con).textContent = 'RED = PEAK HOLD';

    // ---- cube (hourglass failure: core + two side wedges that spall off)
    this.cube = el('g', {}, s);
    const cubeShapes = el('g', {}, this.cube);
    this.wedgeL = el('polygon', { points: '0,0 24,40 0,80', 'stroke-width': 0.8 }, cubeShapes);
    this.wedgeR = el('polygon', { points: '80,0 56,40 80,80', 'stroke-width': 0.8 }, cubeShapes);
    this.core = el('polygon', { points: '0,0 80,0 56,40 80,80 0,80 24,40', 'stroke-width': 0.8 }, cubeShapes);
    for (const w of [this.wedgeL, this.wedgeR]) { w.style.transformBox = 'fill-box'; w.style.transformOrigin = 'center'; }
    this.speckles = el('g', { opacity: 0.35 }, this.cube);
    [[12, 14], [30, 9], [55, 18], [68, 30], [20, 34], [44, 44], [62, 58], [15, 62], [36, 70], [70, 72], [48, 28], [28, 52]]
      .forEach(([x, y], i) => el('circle', { cx: x, cy: y, r: 1 + (i % 3) * 0.6, fill: '#3b3833' }, this.speckles));
    this.outline = el('rect', { x: 0, y: 0, width: CUBE, height: CUBE, fill: 'none', stroke: 'rgba(0,0,0,.25)', 'stroke-width': 1.5 }, this.cube);
    const crackAttrs = { fill: 'none', stroke: COLORS.crack, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1 };
    this.cracks1 = ['M10 5 l6 9 l-2 8', 'M70 75 l-5 -8 l3 -7', 'M67 6 l-4 9 l2 5', 'M13 74 l5 -8 l-1 -5']
      .map(d => el('path', { d, ...crackAttrs }, this.cube));
    this.cracks2 = ['M2 3 L12 19 L23 40 L13 61 L2 78', 'M78 3 L68 20 L57 40 L67 60 L78 78', 'M40 1 L37 17 L43 31', 'M38 79 L42 63 L37 52']
      .map(d => el('path', { d, ...crackAttrs, 'stroke-width': 1.8 }, this.cube));

    // ---- mould (in front of cube until demoulded)
    this.mouldFill = el('rect', { x: POS.mould.x, width: CUBE, y: FLOOR, height: 0 }, s);
    this.mouldWalls = el('g', {}, s);
    el('rect', { x: POS.mould.x - 7, y: POS.mould.y - 4, width: 7, height: CUBE + 4, fill: COLORS.steel }, this.mouldWalls);
    el('rect', { x: POS.mould.x + CUBE, y: POS.mould.y - 4, width: 7, height: CUBE + 4, fill: COLORS.steel }, this.mouldWalls);
    el('rect', { x: POS.mould.x - 7, y: FLOOR - 3, width: CUBE + 14, height: 3, fill: COLORS.steelDark }, this.mouldWalls);

    // ---- tank front (water over the cube)
    el('rect', { x: 303, y: 365, width: 174, height: 112, fill: '#7dbbe8', opacity: 0.5 }, s);
    el('path', { d: 'M303 365 q14 -5 29 0 t29 0 t29 0 t29 0 t29 0 t29 0', fill: 'none', stroke: '#5a9fd6', 'stroke-width': 2 }, s);

    // ---- CTM top platen + ram (in front)
    this.ram = el('rect', { x: 650, y: 110, width: 20, height: 0, fill: 'url(#steelGrad)', stroke: COLORS.steel }, s);
    this.platen = el('rect', { x: 610, y: PLATEN_REST, width: 100, height: 14, rx: 2, fill: '#9aa3ae', stroke: COLORS.steel }, s);

    this.debris = el('g', {}, s);

    // labels
    const lbl = (x, t) => { el('text', { x, y: 512, 'text-anchor': 'middle', 'font-size': 12, fill: COLORS.ink3,
      'letter-spacing': 1.2, 'font-weight': 600 }, s).textContent = t; };
    lbl(140, 'MIXER'); lbl(390, 'CURING TANK'); lbl(660, 'TESTING MACHINE'); lbl(887, 'CONSOLE');
  }

  // ------------------------------------------------------------ state setters
  setCube(x, y) { this.cubePos = { x, y }; this.cube.setAttribute('transform', `translate(${x} ${y})`); }
  setCubeColor(c) { for (const p of [this.core, this.wedgeL, this.wedgeR]) { p.setAttribute('fill', c); p.setAttribute('stroke', c); } }
  setContents(level, color) {
    const h = level * DRUM.inner * 2 * 0.72;
    this.contents.setAttribute('y', DRUM.cy + DRUM.inner - h);
    if (color) this.contents.setAttribute('fill', color);
  }
  setPlaten(y) { this.platen.setAttribute('y', y); this.ram.setAttribute('height', Math.max(0, y - 110)); }
  setDial(needle, kn) {
    const a = lerp(DIAL.a0, DIAL.a1, Math.min(kn, MAX_DIAL_KN) / MAX_DIAL_KN);
    needle.setAttribute('transform', `rotate(${a} ${DIAL.cx} ${DIAL.cy})`);
  }
  setDisplay(kn, status) {
    this.loadText.textContent = kn.toFixed(1).padStart(7, ' ');
    this.stressText.textContent = (kn / 22.5).toFixed(2).padStart(6, ' ');
    if (status !== undefined) this.statusText.textContent = status;
  }
  drawCracks(paths, t) { for (const p of paths) { p.style.strokeDasharray = 1; p.style.strokeDashoffset = 1 - t; p.style.opacity = t > 0 ? 1 : 0; } }
  setStep(step) { this.onStep(step); }

  reset() {
    for (const id of this.raf) cancelAnimationFrame(id);
    this.raf.clear();
    this.instant = false;
    this.setContents(0, '#8d7f6a');
    this.blades.setAttribute('transform', '');
    this.stream.setAttribute('height', 0);
    this.mouldFill.setAttribute('height', 0);
    this.mouldFill.setAttribute('y', FLOOR);
    this.mouldWalls.setAttribute('transform', '');
    this.mouldWalls.style.opacity = 1;
    this.cube.style.opacity = 0;
    this.setCube(POS.mould.x, POS.mould.y);
    this.outline.style.opacity = 1;
    for (const w of [this.wedgeL, this.wedgeR]) { w.style.transform = ''; w.style.opacity = 1; }
    this.drawCracks([...this.cracks1, ...this.cracks2], 0);
    this.debris.innerHTML = '';
    this.dayText.textContent = '0';
    this.setPlaten(PLATEN_REST);
    this.setDial(this.needle, 0);
    this.setDial(this.peakNeedle, 0);
    this.setDisplay(0, 'READY');
    this.rangeText.textContent = '';
    this.setStep(null);
  }

  // ------------------------------------------------------------ the sequence
  /**
   * @param result  /api/predict response
   * @param mix     the mix that was predicted
   * @param opts    { skip: bool, flyers: [{el: Element, color: string}] }
   */
  async run(result, mix, { skip = false, flyers = [] } = {}) {
    this.reset();
    this.instant = skip;
    const wet = concreteColor(mix, false), cured = concreteColor(mix, true);
    const P = result.failure_load_kn;

    // 1. charge
    this.setStep('charge');
    await this.charge(flyers, skip);

    // 2. mix
    this.setStep('mix');
    const rawColor = this.contents.getAttribute('fill');
    await this.tween(1600, t => {
      this.blades.setAttribute('transform', `rotate(${t * 1080} ${DRUM.cx} ${DRUM.cy})`);
      this.setContents(0.95, mixHex(rawColor, wet, Math.min(1, t * 1.4)));
    });

    // 3. cast
    this.setStep('cast');
    this.stream.setAttribute('fill', wet);
    this.mouldFill.setAttribute('fill', wet);
    await this.tween(250, t => this.stream.setAttribute('height', t * (FLOOR - 292)), ease.in);
    await this.tween(1000, t => {
      const h = t * CUBE;
      this.mouldFill.setAttribute('y', FLOOR - h);
      this.mouldFill.setAttribute('height', h);
      this.stream.setAttribute('height', FLOOR - h - 292);
      this.setContents(0.95 * (1 - t));
    }, ease.linear);
    await this.tween(200, t => this.stream.setAttribute('height', (1 - t) * (FLOOR - CUBE - 292)));
    this.setCubeColor(wet);
    this.cube.style.opacity = 1;
    this.mouldFill.setAttribute('height', 0);
    await this.tween(500, t => {
      this.mouldWalls.setAttribute('transform', `translate(0 ${-t * 70})`);
      this.mouldWalls.style.opacity = 1 - t;
    }, ease.out);

    // 4. cure
    this.setStep('cure');
    await this.moveCube([[POS.mould.x, POS.lift], [POS.tankIn.x, POS.lift], [POS.tankIn.x, POS.tankIn.y]], 750);
    const age = mix.age;
    await this.tween(1200, t => {
      this.dayText.textContent = Math.round(t * age);
      this.setCubeColor(mixHex(wet, cured, Math.min(1, t * 1.3)));
    }, ease.out);
    await this.moveCube([[POS.tankIn.x, POS.lift], [POS.ctm.x, POS.lift], [POS.ctm.x, POS.ctm.y]], 800);

    // 5. test
    this.setStep('test');
    this.setDisplay(0, 'CONTACT');
    await this.tween(500, t => this.setPlaten(lerp(PLATEN_REST, PLATEN_CONTACT, t)), ease.inOut);
    this.setDisplay(0, 'LOADING');
    await this.load(P);
    await this.fail(result);
    this.setStep('done');
  }

  async charge(flyers, skip) {
    const active = flyers.filter(f => f.amount > 0);
    const total = active.reduce((a, f) => a + f.amount, 0) || 1;
    let level = 0, color = null;
    const addToDrum = f => {
      level += f.amount / total;
      color = color ? mixHex(color, f.color, f.amount / total / Math.max(level, 1e-6)) : f.color;
      this.setContents(Math.min(1, level) * 0.95, color);
    };
    if (skip) { active.forEach(addToDrum); return; }

    const target = this.drumTarget.getBoundingClientRect();
    const tx = target.left + target.width / 2, ty = target.top + target.height / 2;
    await Promise.all(active.map((f, i) => new Promise(resolve => {
      const r = f.el.getBoundingClientRect();
      const clone = document.createElement('div');
      clone.className = 'flyer';
      Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      clone.appendChild(f.el.cloneNode(true));
      document.body.appendChild(clone);
      const dx = tx - (r.left + r.width / 2), dy = ty - (r.top + r.height / 2);
      const anim = clone.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 90}px) scale(0.85)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.25)`, opacity: 0.3 },
      ], { duration: 800, delay: i * 140, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
      anim.onfinish = () => { clone.remove(); addToDrum(f); resolve(); };
    })));
    await this.sleep(150);
  }

  async moveCube(points, ms) {
    const per = ms / points.length;
    for (const [x, y] of points) {
      const { x: x0, y: y0 } = this.cubePos;
      await this.tween(per, t => this.setCube(lerp(x0, x, t), lerp(y0, y, t)), ease.inOut);
    }
  }

  async load(P) {
    // Load rises fast then slows near failure; cracks start at ~70% and spread at ~90%.
    const ramp = t => 1 - (1 - t) ** 2.2;
    await this.tween(2600, t => {
      const f = ramp(t), kn = P * f;
      this.setDisplay(kn);
      this.setDial(this.needle, kn);
      this.setDial(this.peakNeedle, kn);
      this.drawCracks(this.cracks1, Math.max(0, Math.min(1, (f - 0.7) / 0.15)));
      this.drawCracks(this.cracks2, Math.max(0, Math.min(1, (f - 0.9) / 0.1)));
    }, ease.linear);
  }

  async fail(result) {
    const P = result.failure_load_kn;
    this.setDisplay(P, 'FAILURE');
    this.setDial(this.peakNeedle, P);
    this.stressText.textContent = result.strength_mpa.toFixed(2).padStart(6, ' ');
    this.rangeText.textContent = `±${result.rmse_mpa.toFixed(1)}`;
    this.outline.style.opacity = 0;
    this.drawCracks([...this.cracks1, ...this.cracks2], 1);
    this.spawnDebris();
    await Promise.all([
      this.tween(900, t => {
        this.wedgeL.style.transform = `translate(${-46 * t}px, ${70 * t * t}px) rotate(${-40 * t}deg)`;
        this.wedgeR.style.transform = `translate(${46 * t}px, ${70 * t * t}px) rotate(${40 * t}deg)`;
        for (const w of [this.wedgeL, this.wedgeR]) w.style.opacity = 1 - t * 0.85;
      }, ease.linear),
      this.tween(500, t => this.setPlaten(PLATEN_CONTACT + 6 * t), ease.out),
      this.tween(900, t => this.setDial(this.needle, P * (1 - t)), ease.out),
    ]);
    await this.tween(700, t => this.setPlaten(lerp(PLATEN_CONTACT + 6, PLATEN_REST, t)), ease.inOut);
  }

  spawnDebris() {
    const { x, y } = this.cubePos;
    const color = this.core.getAttribute('fill');
    const bits = Array.from({ length: 14 }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      const p = el('polygon', { points: '0,0 5,-2 7,3 2,5', fill: color }, this.debris);
      return { p, x0: x + (side > 0 ? CUBE - 4 : 4), y0: y + 10 + (i * 5) % 60,
        vx: side * (40 + (i * 37) % 70), vy: -30 - (i * 23) % 60, rot: (i * 47) % 360 };
    });
    this.tween(1000, t => {
      for (const b of bits) {
        const bx = b.x0 + b.vx * t, by = Math.min(FLOOR - 4, b.y0 + b.vy * t + 260 * t * t);
        b.p.setAttribute('transform', `translate(${bx} ${by}) rotate(${b.rot + t * 300})`);
        b.p.style.opacity = 1 - t * 0.4;
      }
    }, ease.linear);
  }
}
