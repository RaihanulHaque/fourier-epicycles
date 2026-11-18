(() => {
  const TAU = Math.PI * 2;
  const M = 512;          // samples along the outline
  const MAXN = 150;       // highest harmonic computed
  const LOOP_SECONDS = 9; // one full loop at 1x speed
  const SWEEP = [1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 64, 80, 100, 125, 150];

  const $ = id => document.getElementById(id);
  const cv = $('stage'), ctx = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const C = name => css.getPropertyValue(name).trim();
  const COL = { x: C('--x'), y: C('--y'), trace: C('--trace'), bird: C('--bird'), line: C('--line'), muted: C('--muted'), ink: C('--ink') };

  // ---------- Shapes (pure math / hand-plotted points) ----------
  const SHAPES = {
    bird: () => [
      [99,35],[72,39],[69,43],[66,48],[63,55],[57,62],[50,67],[44,74],
      [41,90],[38,79],[33,92],[33,78],[25,88],[31,72],[38,63],[42,56],
      [34,54],[37,49],[27,48],[33,43],[20,40],[29,37],[14,31],[25,31],[9,21],[22,25],[6,10],
      [14,9],[26,14],[38,22],[48,30],[54,31],[58,26],[64,24],[69,27],[71,33],[73,35]
    ],
    heart: () => Array.from({ length: 400 }, (_, i) => {
      const t = TAU * i / 400;
      return [16 * Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))];
    }),
    star: () => Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 0.42 : 1, a = -Math.PI / 2 + i * Math.PI / 5;
      return [r * Math.cos(a), r * Math.sin(a)];
    }),
    square: () => [[0,0],[1,0],[1,1],[0,1]],
  };

  // ---------- State ----------
  let shapeKey = 'bird';
  let raw = SHAPES.bird();
  let W = 0, H = 0, L = null;
  let samples = [], X = null, Y = null, variance = 1;
  let N = 10, activeX = [], activeY = [], fullCurve = [];
  let t = 0, trace = [], traceDone = false, sweepIdx = SWEEP.indexOf(10);
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let speed = 1, drawing = null, waitingForDrawing = false, lastTs = 0;
  const opt = { sweep: false, circles: true, shape: true, full: !playing };
  $('tgFull').checked = opt.full;

  // ---------- Math ----------
  function resample(p, m) {
    const n = p.length, cum = [0];
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % n];
      cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[n], out = [];
    let j = 0;
    for (let i = 0; i < m; i++) {
      const s = total * i / m;
      while (j < n - 1 && cum[j + 1] < s) j++;
      const a = p[j], b = p[(j + 1) % n], seg = cum[j + 1] - cum[j];
      const u = seg > 0 ? (s - cum[j]) / seg : 0;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
  }

  const COS = new Float64Array(M), SIN = new Float64Array(M);
  for (let j = 0; j < M; j++) { COS[j] = Math.cos(TAU * j / M); SIN[j] = Math.sin(TAU * j / M); }

  // Real Fourier series: v(t) ≈ a0 + Σ (a_k cos kt + b_k sin kt) = a0 + Σ R_k cos(kt − φ_k)
  function series(v) {
    const m = v.length;
    let a0 = 0;
    for (const x of v) a0 += x;
    a0 /= m;
    const terms = [];
    for (let k = 1; k <= MAXN; k++) {
      let a = 0, b = 0;
      for (let j = 0; j < m; j++) {
        const idx = (k * j) % m;
        a += v[j] * COS[idx];
        b += v[j] * SIN[idx];
      }
      a *= 2 / m; b *= 2 / m;
      terms.push({ k, a, b, R: Math.hypot(a, b), ph: Math.atan2(b, a) });
    }
    return { a0, terms };
  }

  // ---------- Layout ----------
  function computeLayout() {
    const k = 0.62; // fraction of S reserved for each chain strip
    const S = Math.max(60, Math.min((W - 24) / (1 + k), (H - 24) / (1 + k)));
    const ox = (W - S * (1 + k)) / 2, oy = (H - S * (1 + k)) / 2;
    return { S, box: { x: ox + k * S, y: oy + k * S, w: S, h: S }, xAnchorY: oy + k * S * 0.5, yAnchorX: ox + k * S * 0.5 };
  }

  function fitShape(p) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of p) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const s = (L.S * 0.86) / Math.max(w, h);
    const cx = L.box.x + L.box.w / 2, cy = L.box.y + L.box.h / 2;
    return p.map(([x, y]) => [cx + (x - (minX + w / 2)) * s, cy + (y - (minY + h / 2)) * s]);
  }

  function rebuild() {
    if (!raw || raw.length < 3) return;
    L = computeLayout();
    samples = resample(fitShape(raw), M);
    X = series(samples.map(p => p[0]));
    Y = series(samples.map(p => p[1]));
    variance = 0;
    for (const [x, y] of samples) variance += (x - X.a0) ** 2 + (y - Y.a0) ** 2;
    variance /= M;
    setN(N, true);
  }

  function setN(n, keepT) {
    N = Math.max(1, Math.min(MAXN, Math.round(n)));
    $('nRange').value = N; $('nOut').textContent = N; $('bigN').textContent = N;
    document.querySelectorAll('.nTop').forEach(e => e.textContent = N);
    $('rCircles').textContent = 2 * N;
    if (!X) return;
    activeX = X.terms.slice(0, N).sort((p, q) => q.R - p.R);
    activeY = Y.terms.slice(0, N).sort((p, q) => q.R - p.R);
    let captured = 0;
    for (let i = 0; i < N; i++) captured += (X.terms[i].R ** 2 + Y.terms[i].R ** 2) / 2;
    const pct = Math.min(100, 100 * captured / (variance || 1));
    $('rEnergy').textContent = pct.toFixed(pct > 99.9 ? 3 : 1) + '%';
    $('rMeter').style.width = pct + '%';
    fullCurve = [];
    for (let i = 0; i <= 720; i++) fullCurve.push(evalAt(TAU * i / 720));
    if (!keepT) t = 0;
    trace = []; traceDone = false;
  }

  function sumTerms(base, terms, tt) {
    let s = base;
    for (const q of terms) s += q.R * Math.cos(q.k * tt - q.ph);
    return s;
  }
  const evalAt = tt => [sumTerms(X.a0, activeX, tt), sumTerms(Y.a0, activeY, tt)];

  // ---------- Drawing ----------
  function drawChain(terms, x, y, horizontal, color, tt) {
    if (opt.circles) {
      ctx.lineWidth = 1;
      for (const q of terms) {
        const th = q.k * tt - q.ph;
        const nx = horizontal ? x + q.R * Math.cos(th) : x + q.R * Math.sin(th);
        const ny = horizontal ? y + q.R * Math.sin(th) : y + q.R * Math.cos(th);
        if (q.R > 0.6) {
          ctx.strokeStyle = color; ctx.globalAlpha = 0.28;
          ctx.beginPath(); ctx.arc(x, y, q.R, 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        x = nx; y = ny;
      }
      ctx.globalAlpha = 1;
    } else {
      for (const q of terms) {
        const th = q.k * tt - q.ph;
        if (horizontal) { x += q.R * Math.cos(th); y += q.R * Math.sin(th); }
        else { x += q.R * Math.sin(th); y += q.R * Math.cos(th); }
      }
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
    return [x, y];
  }

  function path(points, close) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (close) ctx.closePath();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    if (waitingForDrawing || drawing) {
      if (drawing && drawing.length > 1) {
        ctx.strokeStyle = COL.trace; ctx.lineWidth = 2; ctx.lineJoin = ctx.lineCap = 'round';
        path(drawing, false); ctx.stroke();
      }
      return;
    }
    if (!X) return;

    if (opt.shape) { ctx.fillStyle = COL.bird; path(samples, true); ctx.fill(); }
    if (opt.full) {
      ctx.strokeStyle = COL.trace; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5;
      path(fullCurve, true); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (trace.length > 1) {
      ctx.strokeStyle = COL.trace; ctx.lineWidth = 2.2; ctx.lineJoin = ctx.lineCap = 'round';
      path(trace, traceDone); ctx.stroke();
    }

    const tipX = drawChain(activeX, X.a0, L.xAnchorY, true, COL.x, t);
    const tipY = drawChain(activeY, L.yAnchorX, Y.a0, false, COL.y, t);
    const P = [tipX[0], tipY[1]];

    ctx.setLineDash([5, 5]); ctx.lineWidth = 1; ctx.strokeStyle = COL.ink; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(tipX[0], tipX[1]); ctx.lineTo(P[0], P[1]);
    ctx.moveTo(tipY[0], tipY[1]); ctx.lineTo(P[0], P[1]); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;

    ctx.fillStyle = COL.trace;
    ctx.beginPath(); ctx.arc(P[0], P[1], 4, 0, TAU); ctx.fill();
  }

  function step(ts) {
    const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
    lastTs = ts;
    if (playing && X && !waitingForDrawing && !drawing) {
      const dTheta = TAU * speed * dt / LOOP_SECONDS;
      const sub = Math.max(1, Math.ceil(dTheta / (TAU / 720)));
      for (let i = 0; i < sub; i++) {
        t += dTheta / sub;
        if (t >= TAU) {
          t -= TAU;
          if (opt.sweep) {
            sweepIdx = (sweepIdx + 1) % SWEEP.length;
            setN(SWEEP[sweepIdx], true);
          } else traceDone = true;
        }
        if (!traceDone) trace.push(evalAt(t));
      }
    }
    render();
    requestAnimationFrame(step);
  }

  // ---------- Sizing ----------
  function resize() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuild();
  }
  new ResizeObserver(resize).observe(cv);

  // ---------- Controls ----------
  function selectShape(key) {
    shapeKey = key;
    document.querySelectorAll('#shapes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shape === key)));
    cv.classList.toggle('drawable', key === 'draw');
    if (key === 'draw') {
      waitingForDrawing = true; $('hint').hidden = false;
      return;
    }
    waitingForDrawing = false; $('hint').hidden = true;
    raw = SHAPES[key]();
    rebuild(); t = 0; trace = []; traceDone = false;
  }
  $('shapes').addEventListener('click', e => { const b = e.target.closest('button'); if (b) selectShape(b.dataset.shape); });

  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    if (shapeKey !== 'draw') return;
    cv.setPointerCapture(e.pointerId);
    drawing = [local(e)]; $('hint').hidden = true;
  });
  cv.addEventListener('pointermove', e => {
    if (!drawing) return;
    const p = local(e), q = drawing[drawing.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 2) drawing.push(p);
  });
  const finish = () => {
    if (!drawing) return;
    const d = drawing; drawing = null;
    if (d.length < 12) { waitingForDrawing = true; $('hint').hidden = false; return; }
    raw = d; waitingForDrawing = false;
    rebuild(); t = 0; trace = []; traceDone = false;
  };
  cv.addEventListener('pointerup', finish);
  cv.addEventListener('pointercancel', finish);

  $('nRange').addEventListener('input', e => {
    setN(+e.target.value);
    const i = SWEEP.findIndex(s => s >= N); sweepIdx = i < 0 ? SWEEP.length - 1 : i;
  });
  $('spRange').addEventListener('input', e => { speed = +e.target.value; $('spOut').textContent = speed.toFixed(1) + '×'; });
  const syncPlay = () => $('play').textContent = playing ? 'Pause' : 'Play';
  $('play').addEventListener('click', () => { playing = !playing; syncPlay(); });
  $('restart').addEventListener('click', () => { t = 0; trace = []; traceDone = false; playing = true; syncPlay(); });
  $('tgSweep').addEventListener('change', e => {
    opt.sweep = e.target.checked;
    if (opt.sweep) { sweepIdx = 0; setN(SWEEP[0]); }
  });
  $('tgCircles').addEventListener('change', e => opt.circles = e.target.checked);
  $('tgShape').addEventListener('change', e => opt.shape = e.target.checked);
  $('tgFull').addEventListener('change', e => opt.full = e.target.checked);

  syncPlay();
  requestAnimationFrame(step);
})();
