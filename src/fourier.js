// Fourier math: resampling, real series for x(t)/y(t), complex series for z(t) = x + iy.
// Shapes are stored in normalized coordinates: centered on 0, largest side = 1.

export const TAU = Math.PI * 2;
export const M = 1024;     // samples along the outline
export const MAXN = 300;   // highest harmonic computed

const COS = new Float64Array(M);
const SIN = new Float64Array(M);
for (let j = 0; j < M; j++) {
  COS[j] = Math.cos(TAU * j / M);
  SIN[j] = Math.sin(TAU * j / M);
}

/** Center a polyline on 0 and scale so its larger side is 1. */
export function normalize(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const s = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return points.map(([x, y]) => [(x - cx) / s, (y - cy) / s]);
}

/** Resample a closed polyline to m points spaced evenly by arc length. */
export function resample(p, m) {
  const n = p.length, cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[n], out = new Array(m);
  let j = 0;
  for (let i = 0; i < m; i++) {
    const s = total * i / m;
    while (j < n - 1 && cum[j + 1] < s) j++;
    const a = p[j], b = p[(j + 1) % n], seg = cum[j + 1] - cum[j];
    const u = seg > 0 ? (s - cum[j]) / seg : 0;
    out[i] = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  }
  return out;
}

// v(t) ≈ a0 + Σ (a_k cos kt + b_k sin kt) = a0 + Σ R_k cos(kt − φ_k)
function realSeries(v) {
  let a0 = 0;
  for (let j = 0; j < M; j++) a0 += v[j];
  a0 /= M;
  const terms = [];
  for (let k = 1; k <= MAXN; k++) {
    let a = 0, b = 0;
    for (let j = 0; j < M; j++) {
      const idx = (k * j) % M;
      a += v[j] * COS[idx];
      b += v[j] * SIN[idx];
    }
    a *= 2 / M; b *= 2 / M;
    terms.push({ k, a, b, R: Math.hypot(a, b), ph: Math.atan2(b, a) });
  }
  return { a0, terms };
}

// z(t) ≈ Σ c_n e^{int},  c_n = (1/M) Σ z_j e^{−i n t_j}.  Terms ordered n = 1, −1, 2, −2, …
function complexSeries(pts) {
  let re0 = 0, im0 = 0;
  for (const [x, y] of pts) { re0 += x; im0 += y; }
  const terms = [];
  for (let k = 1; k <= MAXN; k++) {
    for (const n of [k, -k]) {
      let re = 0, im = 0;
      for (let j = 0; j < M; j++) {
        const idx = ((n * j) % M + M) % M;
        const [x, y] = pts[j];
        re += x * COS[idx] + y * SIN[idx];
        im += y * COS[idx] - x * SIN[idx];
      }
      re /= M; im /= M;
      terms.push({ n, re, im, R: Math.hypot(re, im), ph: Math.atan2(im, re) });
    }
  }
  return { c0: [re0 / M, im0 / M], terms };
}

export class Model {
  constructor(norm) {
    this.points = resample(norm, M);
    this.X = realSeries(this.points.map(p => p[0]));
    this.Y = realSeries(this.points.map(p => p[1]));
    this.Z = complexSeries(this.points);
    let v = 0;
    for (const [x, y] of this.points) v += (x - this.X.a0) ** 2 + (y - this.Y.a0) ** 2;
    this.variance = v / M || 1;
  }

  /** Pick the active terms for a mode ('two' or 'one') and harmonic count N. */
  configure(mode, N) {
    const byRadius = (p, q) => q.R - p.R;
    if (mode === 'two') {
      let e = 0;
      for (let i = 0; i < N; i++) e += (this.X.terms[i].R ** 2 + this.Y.terms[i].R ** 2) / 2;
      return {
        mode, N,
        ax: this.X.terms.slice(0, N).sort(byRadius),
        ay: this.Y.terms.slice(0, N).sort(byRadius),
        energy: Math.min(1, e / this.variance),
      };
    }
    const az = this.Z.terms.slice(0, 2 * N);
    let e = 0;
    for (const q of az) e += q.R ** 2;
    return { mode, N, az: az.sort(byRadius), energy: Math.min(1, e / this.variance) };
  }

  /** Point on the N-term curve at angle t, in normalized coordinates. */
  evalAt(cfg, t) {
    if (cfg.mode === 'two') {
      let x = this.X.a0, y = this.Y.a0;
      for (const q of cfg.ax) x += q.R * Math.cos(q.k * t - q.ph);
      for (const q of cfg.ay) y += q.R * Math.cos(q.k * t - q.ph);
      return [x, y];
    }
    let [x, y] = this.Z.c0;
    for (const q of cfg.az) {
      const th = q.n * t + q.ph;
      x += q.R * Math.cos(th);
      y += q.R * Math.sin(th);
    }
    return [x, y];
  }

  curve(cfg, steps = 900) {
    const out = [];
    for (let i = 0; i < steps; i++) out.push(this.evalAt(cfg, TAU * i / steps));
    return out;
  }
}
