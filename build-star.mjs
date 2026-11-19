// Renders a spinning 3D ASCII star into a self-contained animated SVG (works in a GitHub README).
// Usage: node build-star.mjs   ->  writes star.svg
import { writeFileSync } from 'node:fs';

const W = 226, H = 80;           // character grid (fine 6px cells = more detail)
const N = 60, PERIOD = 5;        // frames, seconds per HALF turn (the star looks identical after 180°, so half a turn loops seamlessly)
const FS = 6, CW = 3.62, LH = 6.8; // font size and approx monospace cell size
const RAMP = " .'`,:;-~=+*il1t7I3456290$%#&@";

// ---- geometry: faceted compass star: 4 long main points, 4 short diagonals, thin waist ----
const POINTS = 8;
const R = 1, DIAG = 0.52, r = 0.16, depth = 0.3;
const rim = Array.from({ length: POINTS * 2 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / POINTS, rad = k % 2 ? r : k % 4 ? DIAG : R;
  return [Math.cos(a) * rad, Math.sin(a) * rad, 0];
});
const F = [0, 0, depth], B = [0, 0, -depth];
const tris = [];
for (let k = 0; k < POINTS * 2; k++) {
  const a = rim[k], b = rim[(k + 1) % rim.length];
  tris.push([F, a, b], [B, b, a]);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };

function rotate(p, ry, rx, rz) {
  let [x, y, z] = p;
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return [x, y, z];
}

// y points down on screen, camera at +z looking toward -z
const LIGHT = norm([-0.55, -0.6, 0.85]), VIEW = [0, 0, 1];
const CAM = 3.4, SY = 36, SX = SY * (LH / CW);

function renderFrame(i) {
  const t = (i / N) * Math.PI;      // 0..180°
  const rot = p => rotate(p, t, 0, 0);   // spin on the vertical axis only, horizontal arms stay level
  const zbuf = Array.from({ length: H }, () => new Float64Array(W).fill(-Infinity));
  const out = Array.from({ length: H }, () => Array(W).fill(' '));

  for (const tri of tris) {
    const v = tri.map(rot);
    let n = norm(cross(sub(v[1], v[0]), sub(v[2], v[0])));
    const c = v.reduce((s, p) => s.map((x, j) => x + p[j] / 3), [0, 0, 0]);
    if (dot(n, c) < 0) n = n.map(x => -x);          // keep normals outward
    if (n[2] <= 0) continue;                          // back face
    const diff = Math.max(0, dot(n, LIGHT));
    const refl = sub(n.map(x => x * 2 * dot(n, LIGHT)), LIGHT);
    const spec = Math.pow(Math.max(0, dot(refl, VIEW)), 18);
    const shade = Math.min(1, 0.3 + 0.7 * diff + 0.55 * spec);

    const s = v.map(([x, y, z]) => {
      const f = CAM / (CAM - z);
      return [W / 2 + x * SX * f, H / 2 + y * SY * f, z];
    });
    const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
    if (Math.abs(area) < 1e-9) continue;
    const x0 = Math.max(0, Math.floor(Math.min(...s.map(p => p[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...s.map(p => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...s.map(p => p[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...s.map(p => p[1]))));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // 2x2 sub-samples so thin star tips still hit a cell
      let w0 = -1, w1 = -1, w2 = -1;
      for (const [ox, oy] of [[0.5, 0.5], [0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) {
        const px = x + ox, py = y + oy;
        w0 = ((s[1][0] - px) * (s[2][1] - py) - (s[2][0] - px) * (s[1][1] - py)) / area;
        w1 = ((s[2][0] - px) * (s[0][1] - py) - (s[0][0] - px) * (s[2][1] - py)) / area;
        w2 = 1 - w0 - w1;
        if (w0 >= 0 && w1 >= 0 && w2 >= 0) break;
      }
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * s[0][2] + w1 * s[1][2] + w2 * s[2][2];
      if (z <= zbuf[y][x]) continue;
      zbuf[y][x] = z;
      // depth gradient: nearer cells brighter, so one facet spans several digits
      // glitter: per-cell, per-frame jitter plus rare bright sparkles
      const h = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + i * 37.719) * 43758.5453) % 1;
      // ridge highlight: cells near the crease edges running from the apex out to the rim
      const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      const ridge = Math.min(w1 * Math.abs(area) / len(s[0], s[2]), w2 * Math.abs(area) / len(s[0], s[1]));
      const glint = ridge < 0.7 ? 0.28 * (1 - ridge / 0.7) : 0;
      const lit = h > 0.965 ? 1 : Math.min(1, Math.max(0, shade * (0.78 + 0.32 * z) + glint + (h - 0.5) * 0.3));
      out[y][x] = RAMP[1 + Math.round(lit * (RAMP.length - 2))];
    }
  }
  return out.map(row => row.join(''));
}

const frames = Array.from({ length: N }, (_, i) => renderFrame(i));

// self-check: every frame has the full grid and a visible star
for (const f of frames) {
  console.assert(f.length === H && f.every(l => l.length === W), 'bad frame size');
  console.assert(f.join('').replace(/ /g, '').length > 60, 'star missing from frame');
}

// ---- SVG ----
const PAD = 22;
const SVG_W = Math.round(W * CW + PAD * 2 + 20);
const gridTop = 18;


const QUOTE = ['Look at the sky tonight' ,
'All of the stars have a reason' ,
' A reason to shine, a reason like mine'
,'— star shopping, lil peep']; 

// optional shining lines under the star
const QFS = 11, QCW = 6.6, QX = PAD, QTOP = 30, QGAP = 17, TYPE = 0.045;   // small typed quote, top-left; TYPE = seconds per char
const SVG_H = gridTop + H * LH + 18;
const CX = SVG_W / 2;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// starfield only in cells no frame ever touches
const used = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) =>
  frames.some(f => [-2, -1, 0, 1, 2].some(dy => [-4, -3, -2, -1, 0, 1, 2, 3, 4].some(dx => f[y + dy]?.[x + dx] && f[y + dy][x + dx] !== ' ')))));
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const stars = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  if (!used[y][x] && !(CX - (W * CW) / 2 + (x + 0.5) * CW < QX + Math.max(0, ...QUOTE.map(q => q.trim().length)) * QCW + 24 && gridTop + y * LH < QTOP + QUOTE.length * QGAP + 6) && rnd() < 0.011) stars.push({ x, y, size: (1.8 + rnd() * rnd() * 5).toFixed(1), d: (rnd() * 3).toFixed(2), dur: (2.2 + rnd() * 2).toFixed(1) });
// mini copy of the main star outline (same R / DIAG / r), unit size, centred on 0,0
const miniStar = 'M' + rim.map(([px, py]) => `${px.toFixed(3)} ${py.toFixed(3)}`).join('L') + 'Z';
const gx = x => (CX - (W * CW) / 2 + (x + 0.5) * CW).toFixed(1);
const gy = y => +(gridTop + y * LH).toFixed(1);   // + drops a trailing .0 to save bytes

const frameStep = PERIOD / N;
const frameSvg = frames.map((f, i) => {
  let c0 = W, c1 = -1;
  for (const l of f) { const a = l.search(/[^ ]/); if (a >= 0) { c0 = Math.min(c0, a); c1 = Math.max(c1, l.trimEnd().length - 1); } }
  const bx = +(CX + ((c0 + c1 + 1) / 2 - W / 2) * CW).toFixed(1);
  const lines = f.map((l, y) => l.trim() ? `<tspan x="${bx}" y="${gy(y)}">${esc(l.slice(c0, c1 + 1))}</tspan>` : '').join('');
  console.assert(c1 >= c0, `frame ${i} trimmed to nothing`);
  return `<g class="f" style="animation-delay:${(-((N - i) % N) * frameStep).toFixed(3)}s">` +
    `<text class="star">${lines}</text></g>`;
}).join('\n');

// typed quote: each line is revealed one char at a time by an animated clip, with a block cursor; lines type one after another
// typed quote: human rhythm (jittered keystrokes, pauses after punctuation), idle blinking cursor first,
// credit line set apart by a small gap; each line is revealed by an animated clip with a block cursor
const QL = QUOTE.map(q => q.trim());
const IDLE = 1.1;                                     // cursor blinks this long before typing starts
let qt = IDLE;
const quoteSvg = `<rect x="${QX}" y="${QTOP - QFS + 1}" width="${QCW}" height="${QFS + 1}" fill="#c9d1d9" opacity=".85">` +
  `<animate attributeName="opacity" values=".85;0" dur="0.55s" calcMode="discrete" repeatCount="indefinite" end="${IDLE}s"/><set attributeName="visibility" to="hidden" begin="${IDLE}s"/></rect>` +
  QL.map((q, k) => {
  const last = k === QL.length - 1;
  const y = QTOP + k * QGAP + (last && QL.length > 1 ? 6 : 0), n = q.length;
  // per-keystroke delays: base speed with jitter, longer after , . ! ? and a small hitch after spaces
  const gaps = [...q].map(ch => TYPE * (0.55 + rnd() * 0.9) + (/[,.!?]/.test(ch) ? 0.22 : ch === ' ' ? 0.03 : 0));
  const d = Math.max(0.2, gaps.reduce((a, b) => a + b, 0));
  const kt = [0]; let acc = 0; for (const g of gaps) { acc += g; kt.push(+(acc / d).toFixed(4)); }
  kt[kt.length - 1] = 1;
  const st = qt.toFixed(2), en = (qt + d).toFixed(2);
  qt += d + 0.35;
  const steps = Array.from({ length: n + 1 }, (_, j) => +(j * QCW).toFixed(1));
  const keyTimes = kt.join(';');
  return `<clipPath id="qc${k}"><rect x="${QX}" y="${y - QFS}" width="0" height="${QFS + 4}"><animate attributeName="width" values="${steps.join(';')}" keyTimes="${keyTimes}" begin="${st}s" dur="${d.toFixed(2)}s" calcMode="discrete" fill="freeze"/><set attributeName="width" to="${steps[n] + 8}" begin="${en}s"/></rect></clipPath>` +
    `<text class="q${last ? ' dim' : ''}" x="${QX}" y="${y}" clip-path="url(#qc${k})">${esc(q)}</text>` +
    `<rect x="${QX}" y="${y - QFS + 1}" width="${QCW}" height="${QFS + 1}" fill="#c9d1d9" opacity="0"><set attributeName="opacity" to=".85" begin="${st}s"/>` +
    `<animate attributeName="x" values="${steps.map(v => +(QX + v).toFixed(1)).join(';')}" keyTimes="${keyTimes}" begin="${st}s" dur="${d.toFixed(2)}s" calcMode="discrete" fill="freeze"/>` +
    (last ? `<animate attributeName="opacity" values=".85;0" begin="${en}s" dur="1.1s" calcMode="discrete" repeatCount="indefinite"/>` : `<set attributeName="opacity" to="0" begin="${en}s"/>`) + '</rect>';
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}" role="img" aria-label="A 3D star made of numbers and characters spinning">
<title>Spinning ASCII star</title>
<defs>
  <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${CX - 240}" y1="${gridTop}" x2="${CX + 240}" y2="${gridTop + H * LH}">
    <stop offset="0" stop-color="#f0f3f6"/><stop offset="0.35" stop-color="#9aa4b1"/><stop offset="0.6" stop-color="#e6ebf0"/><stop offset="1" stop-color="#7d8590"/>
  </linearGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#c9d1d9" stop-opacity=".12"/><stop offset="1" stop-color="#c9d1d9" stop-opacity="0"/></radialGradient>
  <filter id="glow" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur stdDeviation="2.2" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <path id="mini" d="${miniStar}"/>
  <!-- shimmer: a bright band sweeps across the quote -->
  <linearGradient id="shine" gradientUnits="userSpaceOnUse" x1="${CX - 320}" y1="0" x2="${CX + 320}" y2="0">
    <stop offset="0" stop-color="#8b949e"/><stop offset="0.42" stop-color="#c9d1d9"/><stop offset="0.5" stop-color="#ffffff"/><stop offset="0.58" stop-color="#c9d1d9"/><stop offset="1" stop-color="#8b949e"/>
    <animateTransform attributeName="gradientTransform" type="translate" values="-640 0;640 0" dur="4s" repeatCount="indefinite"/>
  </linearGradient>
</defs>
<style>
  text { font-family: "Cascadia Mono", "Cascadia Code", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: ${FS}px; white-space: pre; }
  .star { fill: url(#g); text-anchor: middle; }
  .f { visibility: hidden; animation: show ${PERIOD}s step-end infinite; }
  @keyframes show { 0% { visibility: visible; } ${(100 / N).toFixed(4)}% { visibility: hidden; } }
  .tw { fill: #e6ebf0; animation: tw 3s ease-in-out infinite; }
  @keyframes tw { 0%,100% { opacity: .2; transform: scale(.45) rotate(0deg); } 50% { opacity: 1; transform: scale(1) rotate(12deg); } }
  .q { fill: #c9d1d9; font-size: ${QFS}px; }
  .q.dim { fill: #8b949e; }
  .halo { animation: pulse 5s ease-in-out infinite; transform-origin: ${CX}px ${gridTop + (H * LH) / 2}px; }
  @keyframes pulse { 0%,100% { opacity: .7; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.04); } }
  @media (prefers-reduced-motion: reduce) { .f, .tw, .halo, .q { animation: none; } .f:first-of-type { visibility: visible; } }
</style>
<rect width="${SVG_W}" height="${SVG_H}" rx="8" fill="#0d1117"/>
<ellipse class="halo" cx="${CX}" cy="${gridTop + (H * LH) / 2 - 4}" rx="230" ry="${H * LH * 0.48}" fill="url(#halo)"/>
<g filter="url(#glow)">${stars.map(s => `<g transform="translate(${gx(s.x)} ${gy(s.y)}) scale(${s.size})"><use href="#mini" class="tw" style="animation-duration:${s.dur}s;animation-delay:-${s.d}s"/></g>`).join('')}</g>
<g filter="url(#glow)">
${frameSvg}
</g>
<g>${quoteSvg}</g>
</svg>
`;

writeFileSync(new URL('./star.svg', import.meta.url), svg);
console.log(`star.svg  ${SVG_W}x${SVG_H}  ${N} frames  ${(svg.length / 1024).toFixed(0)} KB`);
