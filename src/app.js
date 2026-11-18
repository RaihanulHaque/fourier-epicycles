// App wiring: state, animation loop, controls, sharing and video export.
import { TAU, MAXN, Model, normalize } from './fourier.js';
import { layoutFor, drawScene } from './render.js';
import { maskFromFile, maskFromText, pathFromMask } from './trace.js';
import { buildHash, parseHash } from './share.js';
import { recordVideo, pickMime, sweepStages } from './export.js';
import { SHAPES } from './shapes.js';

const LOOP_SECONDS = 9;
const SWEEP = [1, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 64, 80, 100, 128, 160, 200, 250, 300];
const TEXT_FONT = 'Pacifico';

const $ = id => document.getElementById(id);
const cv = $('stage');
const ctx = cv.getContext('2d');
const css = getComputedStyle(document.documentElement);
const C = name => css.getPropertyValue(name).trim();
const COL = {
  bg: C('--bg'), x: C('--x'), y: C('--y'), trace: C('--trace'),
  bird: C('--bird'), ink: C('--ink'), muted: C('--muted'),
};

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const S = {
  shape: { kind: 'preset', key: 'bird' },
  norm: null, model: null, cfg: null, curve: [],
  mode: 'two', N: 10,
  t: 0, trace: [], traceDone: false,
  playing: !reduced, speed: 1,
  sweep: false, sweepIdx: SWEEP.indexOf(10),
  opt: { circles: true, shape: true, full: reduced },
  W: 0, H: 0, L: null,
  drawing: null, waitingForDrawing: false,
  video: { format: 'tall', content: 'sweep', job: null, result: null },
};
$('tgFull').checked = S.opt.full;

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

// ---------- Core state changes ----------
function resetTrace() { S.t = 0; S.trace = []; S.traceDone = false; }

function setShape(norm, shape) {
  S.norm = norm;
  S.shape = shape;
  S.model = new Model(norm);
  S.waitingForDrawing = false;
  $('hint').hidden = true;
  configure();
  resetTrace();
  syncShapeButtons();
}

function configure() {
  if (!S.model) return;
  S.cfg = S.model.configure(S.mode, S.N);
  S.curve = S.model.curve(S.cfg);
  const pct = S.cfg.energy * 100;
  $('rEnergy').textContent = pct.toFixed(pct > 99.9 ? 3 : 1) + '%';
  $('rMeter').style.width = pct + '%';
}

function setN(n) {
  S.N = Math.max(1, Math.min(MAXN, Math.round(n)));
  $('nRange').value = S.N;
  $('nOut').textContent = S.N;
  $('bigN').textContent = S.N;
  document.querySelectorAll('.nTop').forEach(e => { e.textContent = S.N; });
  $('rCircles').textContent = 2 * S.N;
  configure();
  resetTrace();
}

function setMode(mode) {
  S.mode = mode;
  document.querySelectorAll('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('eqTwo').hidden = mode !== 'two';
  $('eqOne').hidden = mode !== 'one';
  S.L = layoutFor(S.mode, 0, 0, S.W, S.H);
  configure();
  resetTrace();
}

function syncShapeButtons() {
  const active = S.waitingForDrawing || S.shape.source === 'draw' ? 'draw'
    : S.shape.kind === 'preset' ? S.shape.key : null;
  document.querySelectorAll('#shapes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.shape === active)));
  cv.classList.toggle('drawable', active === 'draw');
}

// ---------- Animation ----------
let lastTs = 0;
function step(ts) {
  const dt = Math.min(0.05, (ts - (lastTs || ts)) / 1000);
  lastTs = ts;
  const idle = S.waitingForDrawing || S.drawing || !S.model;
  if (S.playing && !idle) {
    const dTheta = TAU * S.speed * dt / LOOP_SECONDS;
    const sub = Math.max(1, Math.ceil(dTheta / (TAU / 1200)));
    for (let i = 0; i < sub; i++) {
      S.t += dTheta / sub;
      if (S.t >= TAU) {
        S.t -= TAU;
        if (S.sweep) {
          S.sweepIdx = (S.sweepIdx + 1) % SWEEP.length;
          setN(SWEEP[S.sweepIdx]);
        } else {
          S.traceDone = true;
        }
      }
      if (!S.traceDone) S.trace.push(S.model.evalAt(S.cfg, S.t));
    }
  }
  render();
  requestAnimationFrame(step);
}

function render() {
  ctx.clearRect(0, 0, S.W, S.H);
  if (S.waitingForDrawing || S.drawing) {
    if (S.drawing && S.drawing.length > 1) {
      ctx.strokeStyle = COL.trace; ctx.lineWidth = 2; ctx.lineJoin = ctx.lineCap = 'round';
      ctx.beginPath();
      S.drawing.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    }
    return;
  }
  if (!S.model) return;
  drawScene(ctx, S.L, S.model, S.cfg,
    { t: S.t, trace: S.trace, traceDone: S.traceDone, curve: S.curve }, S.opt, COL, 1);
}

function resize() {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  S.W = r.width; S.H = r.height;
  cv.width = Math.round(S.W * dpr); cv.height = Math.round(S.H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.L = layoutFor(S.mode, 0, 0, S.W, S.H);
}
new ResizeObserver(resize).observe(cv);

// ---------- Shapes ----------
function selectPreset(key) {
  setShape(normalize(SHAPES[key]()), { kind: 'preset', key });
}

function startDrawMode() {
  S.waitingForDrawing = true;
  S.shape = { ...S.shape, source: 'draw' };
  $('hint').hidden = false;
  syncShapeButtons();
}

$('shapes').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.shape === 'draw') startDrawMode();
  else selectPreset(b.dataset.shape);
});

async function drawText(raw) {
  const text = raw.trim().slice(0, 24);
  if (!text) { toast('Type a word or a name first.'); return; }
  try { await document.fonts.load(`120px "${TEXT_FONT}"`, text); } catch { /* fallback font is fine */ }
  const path = pathFromMask(maskFromText(text, `"${TEXT_FONT}", cursive`));
  if (!path) { toast('Could not trace that text. Try different letters.'); return; }
  $('textIn').value = text;
  setShape(normalize(path), { kind: 'text', text });
}
$('textForm').addEventListener('submit', e => { e.preventDefault(); drawText($('textIn').value); });

$('fileIn').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const path = pathFromMask(await maskFromFile(file));
    if (!path) { toast('No clear shape found. Use a dark shape on a plain light background.'); return; }
    setShape(normalize(path), { kind: 'points', source: 'image' });
    if (S.N < 60) setN(60);
    toast(`Traced ${file.name}`);
  } catch (err) {
    toast(err.message);
  }
});

// Freehand drawing
const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('pointerdown', e => {
  if (!(S.waitingForDrawing || S.shape.source === 'draw')) return;
  cv.setPointerCapture(e.pointerId);
  S.drawing = [local(e)];
  $('hint').hidden = true;
});
cv.addEventListener('pointermove', e => {
  if (!S.drawing) return;
  const p = local(e), q = S.drawing[S.drawing.length - 1];
  if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 2) S.drawing.push(p);
});
function finishDrawing() {
  if (!S.drawing) return;
  const d = S.drawing;
  S.drawing = null;
  if (d.length < 12) { S.waitingForDrawing = true; $('hint').hidden = false; return; }
  setShape(normalize(d), { kind: 'points', source: 'draw' });
}
cv.addEventListener('pointerup', finishDrawing);
cv.addEventListener('pointercancel', finishDrawing);

// ---------- Controls ----------
$('modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
$('nRange').addEventListener('input', e => {
  setN(+e.target.value);
  const i = SWEEP.findIndex(s => s >= S.N);
  S.sweepIdx = i < 0 ? SWEEP.length - 1 : i;
});
$('spRange').addEventListener('input', e => { S.speed = +e.target.value; $('spOut').textContent = S.speed.toFixed(1) + '×'; });
const syncPlay = () => { $('play').textContent = S.playing ? 'Pause' : 'Play'; };
$('play').addEventListener('click', () => { S.playing = !S.playing; syncPlay(); });
$('restart').addEventListener('click', () => { resetTrace(); S.playing = true; syncPlay(); });
$('tgSweep').addEventListener('change', e => {
  S.sweep = e.target.checked;
  if (S.sweep) { S.sweepIdx = 0; setN(SWEEP[0]); }
});
$('tgCircles').addEventListener('change', e => { S.opt.circles = e.target.checked; });
$('tgShape').addEventListener('change', e => { S.opt.shape = e.target.checked; });
$('tgFull').addEventListener('change', e => { S.opt.full = e.target.checked; });

// ---------- Share link ----------
function shareUrl() {
  const hash = buildHash({ shape: S.shape, norm: S.norm, N: S.N, mode: S.mode });
  return `${location.origin}${location.pathname}#${hash}`;
}

$('shareLink').addEventListener('click', async () => {
  const url = shareUrl();
  history.replaceState(null, '', url);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Fourier Epicycle Drawer', text: 'Watch spinning circles draw this:', url }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied'); }
  catch { toast('Copy the link from the address bar'); }
});

// ---------- Video ----------
function segment(id, key) {
  $(id).addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    S.video[key] = b.dataset.value;
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });
}
segment('fmtSeg', 'format');
segment('contentSeg', 'content');

function fileBaseName() {
  if (S.shape.kind === 'preset') return S.shape.key;
  if (S.shape.kind === 'text') return S.shape.text.replace(/[^\w-]+/g, '-').toLowerCase() || 'text';
  return 'drawing';
}

function showVideoResult(res) {
  S.video.result = res;
  $('videoReady').hidden = !res;
  if (!res) return;
  const file = new File([res.blob], `fourier-${fileBaseName()}-N${S.N}.${res.ext}`, { type: res.blob.type });
  S.video.file = file;
  $('shareVideo').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
}

$('recBtn').addEventListener('click', async () => {
  if (S.video.job) { S.video.job.cancel(); return; }
  if (!S.model) { toast('Pick or draw a shape first.'); return; }
  showVideoResult(null);
  const [w, h] = S.video.format === 'tall' ? [1080, 1920] : [1080, 1080];
  const stages = S.video.content === 'sweep' ? sweepStages(S.N) : [S.N];
  let job;
  try {
    job = recordVideo({
      model: S.model, mode: S.mode, stages, w, h, col: COL, opt: S.opt,
      onProgress: (p, el, total) => { $('recStatus').textContent = `Recording ${el.toFixed(0)}s of ${total.toFixed(0)}s`; },
    });
  } catch (err) { toast(err.message); return; }
  S.video.job = job;
  $('recBtn').textContent = 'Stop recording';
  const res = await job.done;
  S.video.job = null;
  $('recBtn').textContent = 'Record video';
  $('recStatus').textContent = res ? `Ready: ${(res.blob.size / 1e6).toFixed(1)} MB ${res.ext.toUpperCase()}` : 'Recording stopped';
  showVideoResult(res);
});

$('downloadVideo').addEventListener('click', () => {
  const f = S.video.file;
  if (!f) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(f);
  a.download = f.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

$('shareVideo').addEventListener('click', async () => {
  try {
    await navigator.share({ files: [S.video.file], title: 'Drawn with Fourier series', text: shareUrl() });
  } catch (err) {
    if (err.name !== 'AbortError') toast('Sharing failed. Download the video instead.');
  }
});

if (!pickMime()) {
  $('recBtn').disabled = true;
  $('recStatus').textContent = 'This browser cannot record video. Try Chrome, Edge or Safari.';
}

// ---------- Start ----------
async function loadFromHash() {
  const h = parseHash(location.hash);
  if (!h) return false;
  if (h.mode) setMode(h.mode);
  if (h.N) setN(h.N);
  if (h.shape?.kind === 'preset') selectPreset(h.shape.key);
  else if (h.shape?.kind === 'text') { $('textIn').value = h.shape.text; await drawText(h.shape.text); }
  else if (h.shape?.kind === 'points') setShape(h.points, h.shape);
  return !!h.shape;
}

resize();
setMode('two');
setN(10);
selectPreset('bird');
syncPlay();
loadFromHash();
window.addEventListener('hashchange', loadFromHash);
requestAnimationFrame(step);
