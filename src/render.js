// Draws the epicycle scene onto any 2D canvas context (live stage or video export).
import { TAU } from './fourier.js';

/** Where the shape and the chain anchors sit inside a rectangle. */
export function layoutFor(mode, x0, y0, W, H) {
  if (mode === 'two') {
    const k = 0.62; // share of S reserved for each chain strip
    const S = Math.max(40, Math.min((W - 24) / (1 + k), (H - 24) / (1 + k)));
    const ox = x0 + (W - S * (1 + k)) / 2;
    const oy = y0 + (H - S * (1 + k)) / 2;
    return {
      mode,
      s: S * 0.86,
      cx: ox + k * S + S / 2,
      cy: oy + k * S + S / 2,
      xAnchorY: oy + k * S * 0.5,
      yAnchorX: ox + k * S * 0.5,
    };
  }
  const S = Math.max(40, Math.min(W, H) - 32);
  return { mode, s: S * 0.8, cx: x0 + W / 2, cy: y0 + H / 2 };
}

function poly(ctx, pts, mx, my, close) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = mx(pts[i][0]), y = my(pts[i][1]);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  if (close) ctx.closePath();
}

function chain(ctx, x, y, terms, dir, s, color, showCircles, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (const q of terms) {
    const r = q.R * s;
    const [c, sn] = dir(q);
    const nx = x + r * c, ny = y + r * sn;
    if (showCircles) {
      if (r > 0.6 * lw) {
        ctx.globalAlpha = 0.28;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
    }
    x = nx; y = ny;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, 3 * lw, 0, TAU); ctx.fill();
  return [x, y];
}

/**
 * st: { t, trace, traceDone, curve }  — trace/curve in normalized coordinates
 * opt: { circles, shape, full }
 */
export function drawScene(ctx, L, model, cfg, st, opt, col, lw = 1) {
  const s = L.s;
  const mx = u => L.cx + u * s;
  const my = v => L.cy + v * s;
  ctx.lineJoin = ctx.lineCap = 'round';

  if (opt.shape) {
    ctx.fillStyle = col.bird;
    poly(ctx, model.points, mx, my, true);
    ctx.fill('evenodd');
  }
  if (opt.full && st.curve) {
    ctx.strokeStyle = col.trace; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5 * lw;
    poly(ctx, st.curve, mx, my, true); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (st.trace.length > 1) {
    ctx.strokeStyle = col.trace; ctx.lineWidth = 2.2 * lw;
    poly(ctx, st.trace, mx, my, st.traceDone); ctx.stroke();
  }

  const t = st.t;
  let P;
  if (cfg.mode === 'two') {
    const tipX = chain(ctx, mx(model.X.a0), L.xAnchorY, cfg.ax,
      q => { const th = q.k * t - q.ph; return [Math.cos(th), Math.sin(th)]; }, s, col.x, opt.circles, lw);
    const tipY = chain(ctx, L.yAnchorX, my(model.Y.a0), cfg.ay,
      q => { const th = q.k * t - q.ph; return [Math.sin(th), Math.cos(th)]; }, s, col.y, opt.circles, lw);
    P = [tipX[0], tipY[1]];
    ctx.setLineDash([5 * lw, 5 * lw]); ctx.lineWidth = lw; ctx.strokeStyle = col.ink; ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(tipX[0], tipX[1]); ctx.lineTo(P[0], P[1]);
    ctx.moveTo(tipY[0], tipY[1]); ctx.lineTo(P[0], P[1]);
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  } else {
    P = chain(ctx, mx(model.Z.c0[0]), my(model.Z.c0[1]), cfg.az,
      q => { const th = q.n * t + q.ph; return [Math.cos(th), Math.sin(th)]; }, s, col.x, opt.circles, lw);
  }

  ctx.fillStyle = col.trace;
  ctx.beginPath(); ctx.arc(P[0], P[1], 4 * lw, 0, TAU); ctx.fill();
}
