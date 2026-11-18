// Turn text or an image into one closed outline the Fourier series can draw.
// Pipeline: binary mask -> connected parts (shapes and their holes) -> boundary tracing
// -> smoothing -> join every outline into a single loop with thin "bridges".

const PAD = 2;

/** Rasterize text into a mask. */
export function maskFromText(text, fontFamily, size = 120) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `${size}px ${fontFamily}`;
  const w = Math.ceil(probe.measureText(text).width + size * 0.8);
  const h = Math.ceil(size * 1.8);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = `${size}px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(text, size * 0.4, h / 2);
  const d = ctx.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  return { w, h, m };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('That file could not be read as an image. Try a PNG, JPG or SVG.'));
    im.src = url;
  });
}

/** Load an image or SVG file and turn it into a mask (dark-on-light or transparent PNG). */
export async function maskFromFile(file, maxSide = 420) {
  const url = URL.createObjectURL(file);
  try {
    return maskFromImage(await loadImage(url), maxSide);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function otsu(gray) {
  const hist = new Float64Array(256);
  for (const g of gray) hist[g]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, thr = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  return thr;
}

export function maskFromImage(img, maxSide = 420) {
  const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 512;
  const sc = maxSide / Math.max(w0, h0);
  const iw = Math.max(8, Math.round(w0 * sc)), ih = Math.max(8, Math.round(h0 * sc));
  const w = iw + PAD * 2, h = ih + PAD * 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, PAD, PAD, iw, ih);
  const d = ctx.getImageData(0, 0, w, h).data;

  const inside = (x, y) => x >= PAD && y >= PAD && x < PAD + iw && y < PAD + ih;
  let transparent = 0, count = 0;
  for (let y = PAD; y < PAD + ih; y++) for (let x = PAD; x < PAD + iw; x++) {
    count++;
    if (d[(y * w + x) * 4 + 3] < 200) transparent++;
  }

  const m = new Uint8Array(w * h);
  if (transparent > count * 0.05) {
    // Transparent PNG / SVG: the visible pixels are the shape.
    for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  } else {
    const gray = new Uint8Array(iw * ih);
    let k = 0;
    for (let y = PAD; y < PAD + ih; y++) for (let x = PAD; x < PAD + iw; x++) {
      const i = (y * w + x) * 4;
      gray[k++] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    const thr = otsu(gray);
    k = 0;
    for (let y = PAD; y < PAD + ih; y++) for (let x = PAD; x < PAD + iw; x++) m[y * w + x] = gray[k++] <= thr ? 1 : 0;
    // If the border is mostly "shape", the image is light-on-dark: flip it.
    let edge = 0, edgeFg = 0;
    for (let y = PAD; y < PAD + ih; y++) for (let x = PAD; x < PAD + iw; x++) {
      if (x === PAD || y === PAD || x === PAD + iw - 1 || y === PAD + ih - 1) { edge++; edgeFg += m[y * w + x]; }
    }
    if (edgeFg > edge / 2) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (inside(x, y)) m[y * w + x] ^= 1;
      }
    }
  }
  return { w, h, m };
}

// 8 neighbours, clockwise on screen (y down), starting East.
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const DIR_OF = (dx, dy) => [5, 6, 7, 4, -1, 0, 3, 2, 1][(dy + 1) * 3 + (dx + 1)];

/** Label connected parts. Shapes use 8-connectivity; holes (background not touching the edge) use 4. */
function components(mask) {
  const { w, h, m } = mask;
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const comps = [];
  let id = 0;
  const fill = (start, value, conn8) => {
    let sp = 0, size = 0, touches = false;
    stack[sp++] = start; lab[start] = id;
    while (sp) {
      const i = stack[--sp];
      size++;
      const x = i % w, y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      for (let d = 0; d < 8; d++) {
        if (!conn8 && d % 2) continue;
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!lab[j] && m[j] === value) { lab[j] = id; stack[sp++] = j; }
      }
    }
    return { size, touches };
  };
  for (let i = 0; i < w * h; i++) {
    if (m[i] && !lab[i]) { id++; const r = fill(i, 1, true); comps.push({ id, first: i, size: r.size }); }
  }
  for (let i = 0; i < w * h; i++) {
    if (!m[i] && !lab[i]) { id++; const r = fill(i, 0, false); if (!r.touches) comps.push({ id, first: i, size: r.size }); }
  }
  return { lab, comps };
}

/** Moore-neighbour boundary tracing of one labelled part. */
function traceBoundary(lab, w, h, id, first) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && lab[y * w + x] === id;
  const sx = first % w, sy = (first - sx) / w;
  let cx = sx, cy = sy, back = 4; // came from the West
  const out = [[sx, sy]];
  let firstStep = null;
  const limit = w * h * 4;
  for (let iter = 0; iter < limit; iter++) {
    let moved = false;
    for (let i = 1; i <= 8; i++) {
      const d = (back + i) % 8;
      const nx = cx + DX[d], ny = cy + DY[d];
      if (inside(nx, ny)) {
        const pd = (d + 7) % 8;
        const px = cx + DX[pd], py = cy + DY[pd];
        cx = nx; cy = ny;
        back = DIR_OF(px - cx, py - cy);
        moved = true;
        break;
      }
    }
    if (!moved) break; // a single isolated pixel
    if (!firstStep) firstStep = [cx, cy, back];
    else if (cx === firstStep[0] && cy === firstStep[1] && back === firstStep[2]) {
      out.pop(); // back at the start: the loop is closed
      break;
    }
    out.push([cx, cy]);
  }
  return out;
}

function smooth(pts, passes = 2, r = 2) {
  let p = pts;
  const n = p.length;
  for (let k = 0; k < passes; k++) {
    const q = new Array(n);
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0;
      for (let j = -r; j <= r; j++) { const a = p[(i + j + n) % n]; x += a[0]; y += a[1]; }
      q[i] = [x / (2 * r + 1), y / (2 * r + 1)];
    }
    p = q;
  }
  return p;
}

/** Splice each outline into the loop at the closest point, going out and back along a thin bridge. */
function joinContours(cs) {
  let tour = cs[0].slice();
  for (let c = 1; c < cs.length; c++) {
    const con = cs[c];
    const st = Math.max(1, Math.floor(tour.length / 700));
    const sc = Math.max(1, Math.floor(con.length / 200));
    let best = Infinity, bi = 0, bj = 0;
    const test = (i, j) => {
      const a = tour[i], b = con[j];
      const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
      if (d < best) { best = d; bi = i; bj = j; }
    };
    for (let i = 0; i < tour.length; i += st) for (let j = 0; j < con.length; j += sc) test(i, j);
    const ci = bi, cj = bj;
    for (let i = ci - st; i <= ci + st; i++) for (let j = cj - sc; j <= cj + sc; j++) {
      test((i + tour.length) % tour.length, (j + con.length) % con.length);
    }
    const rot = con.slice(bj).concat(con.slice(0, bj), [con[bj]]);
    tour = tour.slice(0, bi + 1).concat(rot, tour.slice(bi));
  }
  return tour;
}

/** Mask -> one closed polyline (pixel coordinates), or null if nothing usable was found. */
export function pathFromMask(mask) {
  const { w, h } = mask;
  const { lab, comps } = components(mask);
  const minSize = Math.max(12, w * h * 0.0004);
  const keep = comps.filter(c => c.size >= minSize).sort((a, b) => b.size - a.size).slice(0, 60);
  const contours = [];
  for (const c of keep) {
    const b = traceBoundary(lab, w, h, c.id, c.first);
    if (b.length >= 8) contours.push(smooth(b));
  }
  if (!contours.length) return null;
  return joinContours(contours);
}
