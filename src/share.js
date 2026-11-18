// Shareable links: everything needed to rebuild a drawing lives in the URL hash.
//   #s=heart&n=25            built-in shape
//   #t=Rahi&n=80&m=one       typed text
//   #p=<base64url>&n=120     any drawn or traced outline (600 points, 12 bits per coordinate)
import { resample } from './fourier.js';

const PRESETS = new Set(['bird', 'heart', 'star', 'square']);
const POINTS = 600;

function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export function encodePoints(norm) {
  const pts = resample(norm, POINTS);
  const q = v => Math.max(0, Math.min(4095, Math.round((v + 0.5) * 4095)));
  const bytes = new Uint8Array(POINTS * 3);
  pts.forEach(([x, y], i) => {
    const qx = q(x), qy = q(y);
    bytes[i * 3] = qx >> 4;
    bytes[i * 3 + 1] = ((qx & 15) << 4) | (qy >> 8);
    bytes[i * 3 + 2] = qy & 255;
  });
  return toBase64Url(bytes);
}

export function decodePoints(str) {
  try {
    const b = fromBase64Url(str);
    if (b.length < 30 || b.length % 3) return null;
    const pts = [];
    for (let i = 0; i < b.length; i += 3) {
      const qx = (b[i] << 4) | (b[i + 1] >> 4);
      const qy = ((b[i + 1] & 15) << 8) | b[i + 2];
      pts.push([qx / 4095 - 0.5, qy / 4095 - 0.5]);
    }
    return pts;
  } catch {
    return null;
  }
}

export function buildHash({ shape, norm, N, mode }) {
  const p = new URLSearchParams();
  if (shape.kind === 'preset') p.set('s', shape.key);
  else if (shape.kind === 'text') p.set('t', shape.text);
  else p.set('p', encodePoints(norm));
  p.set('n', String(N));
  if (mode === 'one') p.set('m', 'one');
  return p.toString();
}

/** Returns { shape, points?, N?, mode? } or null when the hash holds nothing usable. */
export function parseHash(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const out = {};
  const n = parseInt(p.get('n'), 10);
  if (n > 0) out.N = n;
  if (p.get('m') === 'one') out.mode = 'one';
  if (p.has('s') && PRESETS.has(p.get('s'))) out.shape = { kind: 'preset', key: p.get('s') };
  else if (p.get('t')) out.shape = { kind: 'text', text: p.get('t').slice(0, 24) };
  else if (p.get('p')) {
    const pts = decodePoints(p.get('p'));
    if (pts) { out.shape = { kind: 'points', source: 'link' }; out.points = pts; }
  }
  return out.shape || out.N ? out : null;
}
