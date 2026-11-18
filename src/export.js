// Video export: renders the animation on an offscreen canvas and records it with MediaRecorder.
import { TAU } from './fourier.js';
import { layoutFor, drawScene } from './render.js';

export const SITE = 'raihanulhaque.github.io/fourier-epicycles';

export function pickMime() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  const options = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return options.find(m => MediaRecorder.isTypeSupported(m)) || null;
}

/** The N values shown in a "growing N" video, ending at the chosen N. */
export function sweepStages(N) {
  const base = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 100, 150, 200, 300];
  const top = N < 8 ? 100 : N;
  const stages = base.filter(v => v < top);
  stages.push(top);
  return stages;
}

function overlay(ctx, w, h, top, bottom, N, mode, col) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col.ink;
  ctx.font = `500 ${Math.round(w * 0.064)}px Newsreader, Georgia, serif`;
  ctx.fillText('Drawn with Fourier series', w / 2, top * 0.5);
  ctx.fillStyle = col.muted;
  ctx.font = `italic ${Math.round(w * 0.032)}px Newsreader, Georgia, serif`;
  ctx.fillText(
    mode === 'two' ? 'x(t), y(t) = a₀ + Σ (aₖ cos kt + bₖ sin kt)' : 'z(t) = Σ cₙ eⁱⁿᵗ,  n = −N … N',
    w / 2, top * 0.8,
  );
  ctx.fillStyle = col.trace;
  ctx.font = `500 ${Math.round(w * 0.085)}px Newsreader, Georgia, serif`;
  ctx.fillText(`N = ${N}`, w / 2, h - bottom * 0.45);
  ctx.fillStyle = col.muted;
  ctx.font = `${Math.round(w * 0.026)}px "IBM Plex Mono", ui-monospace, monospace`;
  ctx.fillText(SITE, w / 2, h - bottom * 0.15);
}

/**
 * Records a video. Returns { done: Promise<{blob, ext} | null>, cancel() }.
 * stages: list of N values, one loop each. A single stage records one slower loop.
 */
export function recordVideo({ model, mode, stages, w, h, col, opt, onProgress }) {
  const mime = pickMime();
  if (!mime) throw new Error('This browser cannot record video. Try Chrome, Edge or Safari.');

  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.style.cssText = 'position:fixed;left:-99999px;top:0;width:10px;height:10px;';
  document.body.append(cv);
  const ctx = cv.getContext('2d');

  const tall = h > w;
  const top = Math.round(h * (tall ? 0.17 : 0.14));
  const bottom = Math.round(h * (tall ? 0.15 : 0.13));
  const L = layoutFor(mode, 0, top, w, h - top - bottom);
  const lw = w / 640;
  const loopSec = stages.length > 1 ? 2.3 : 7;
  const holdSec = 1.8;
  const total = stages.length * loopSec + holdSec;

  const stream = cv.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

  let cancelled = false;
  const done = new Promise(resolve => {
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      cv.remove();
      if (cancelled) return resolve(null);
      const type = mime.split(';')[0];
      resolve({ blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' });
    };

    let start = null, stage = -1, cfg = null, trace = [], lastT = 0;
    const frame = ts => {
      if (cancelled) { rec.stop(); return; }
      if (start === null) start = ts;
      const el = (ts - start) / 1000;
      const si = Math.min(stages.length - 1, Math.floor(el / loopSec));
      const hold = el >= stages.length * loopSec;
      if (si !== stage) { stage = si; cfg = model.configure(mode, stages[si]); trace = []; lastT = 0; }
      const t = hold ? TAU : Math.min(TAU, ((el - si * loopSec) / loopSec) * TAU);
      const dt = TAU / 1500;
      let tt = lastT;
      for (; tt < t; tt += dt) trace.push(model.evalAt(cfg, tt));
      lastT = tt;

      ctx.fillStyle = col.bg;
      ctx.fillRect(0, 0, w, h);
      drawScene(ctx, L, model, cfg, { t: t % TAU, trace, traceDone: hold }, { ...opt, full: false }, col, lw);
      overlay(ctx, w, h, top, bottom, stages[si], mode, col);
      onProgress?.(Math.min(1, el / total), el, total);

      if (el >= total) { rec.stop(); return; }
      requestAnimationFrame(frame);
    };
    rec.start(250);
    requestAnimationFrame(frame);
  });

  return { done, cancel() { cancelled = true; } };
}
