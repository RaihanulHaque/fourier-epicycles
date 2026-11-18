# Fourier Epicycle Drawer

Draw any closed shape with spinning circles.

**▶ Live demo: https://raihanulhaque.github.io/fourier-epicycles/**

Type your name, upload a logo or draw anything. The app traces the outline, works out its Fourier series, and rebuilds it with rotating circles called **epicycles**: either two chains (one draws the x coordinate, the other the y coordinate, and the pen sits where their guide lines cross) or one chain of complex rotations. Then you can export the animation as a vertical video or share a link to it.

Raise the number of harmonics **N** to see the curve get closer to the original. Sharp corners like feather tips and star points need many more terms than smooth curves do.

It's plain HTML, CSS and JavaScript, written from scratch with no frameworks, no math libraries and no build step.

## Features

- **Type your name**: any word up to 24 characters is traced in a script font and drawn by circles
- **Upload an image or SVG**: logos, silhouettes or icons are traced automatically, including holes like the inside of an "o"
- **Draw your own**: draw one continuous loop with a mouse, pen or finger
- **Built-in shapes**: a hand-plotted hummingbird, a parametric heart, a star and a square (good for seeing the Gibbs effect)
- **Two circle styles**: two chains (one for `x(t)`, one for `y(t)`) or one chain of complex rotations `cₙ eⁱⁿᵗ`
- **Harmonics slider**: N from 1 to 300, updated live, plus *Grow N every loop*
- **Video export**: record a 1080×1920 (Reels / TikTok / Shorts) or 1080×1080 video of N growing, or of one loop, as MP4 or WebM; share it straight from your phone
- **Share links**: copy a link that rebuilds your exact drawing, text, N and circle style
- **Energy readout**: how much of the shape the first N terms capture (Parseval's theorem)
- **Installable PWA**: works offline and can be added to a phone's home screen

## The math

A closed curve is sampled at `M = 1024` points, spaced evenly along its length, and treated as two periodic signals `x(t)` and `y(t)` over `t ∈ [0, 2π)`.

Each coordinate gets its own real Fourier series:

```
x_N(t) = a₀ + Σ_{k=1}^{N} ( a_k cos kt + b_k sin kt )
y_N(t) = c₀ + Σ_{k=1}^{N} ( c_k cos kt + d_k sin kt )
```

The coefficients come from a discrete Fourier transform of the samples:

```
a₀  = (1/M) Σ xⱼ
a_k = (2/M) Σ xⱼ cos(2πkj/M)
b_k = (2/M) Σ xⱼ sin(2πkj/M)
```

(`c_k` and `d_k` are calculated the same way from the y samples.)

### From terms to circles

Each term can be written as a single rotating vector:

```
a_k cos kt + b_k sin kt = R_k cos(kt − φ_k)
R_k = √(a_k² + b_k²)      φ_k = atan2(b_k, a_k)
```

So every harmonic becomes one circle of radius `R_k` that turns `k` times per loop. Placing the circles tip to tail adds the terms together. The circles are sorted largest first so the chain is easy to read.

### One chain (complex form)

Treat each point as a complex number `z = x + iy`. Then

```
z_N(t) = Σ_{n=−N}^{N} cₙ eⁱⁿᵗ,      cₙ = (1/M) Σ zⱼ e^{−i n 2πj/M}
```

and each `cₙ` is one circle of radius `|cₙ|` turning `n` times per loop (negative `n` turns the other way).

### Tracing text and images

1. The text or image is rasterized into a black-and-white mask (transparent PNGs use alpha; other images use Otsu's threshold, flipped if the background is dark).
2. Connected parts are labelled. Shapes use 8-connectivity, and holes (background not touching the edge) use 4-connectivity.
3. Each part's boundary is followed with Moore-neighbour tracing, then smoothed.
4. All outlines are joined into one closed loop by splicing each one in at its closest point, using a thin out-and-back bridge.

### Energy captured

By Parseval's theorem, the variance of the shape is the sum of the squared amplitudes, `Σ (R_xk² + R_yk²) / 2`. The readout shows how much of that total the first N terms account for.

## Run it locally

No install needed. Service workers need a real HTTP server, so serve the folder rather than opening the file directly:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Project structure

```
.
├── index.html             # Page markup
├── src/
│   ├── app.js             # State, animation loop, controls
│   ├── fourier.js         # Resampling, real and complex Fourier series
│   ├── render.js          # Draws epicycles on any canvas
│   ├── trace.js           # Text / image → mask → outline
│   ├── share.js           # Shareable link encoding
│   ├── export.js          # Video recording (MediaRecorder)
│   ├── shapes.js          # Built-in shapes
│   └── style.css          # Layout and theme
├── icons/icon.svg         # App icon
├── manifest.webmanifest   # PWA manifest
└── sw.js                  # Service worker for offline use
```

## Deploy

It's a static site, so any static host works. For **GitHub Pages**: go to *Settings → Pages*, choose *Deploy from a branch*, then select `main` and `/ (root)`.

## Roadmap

- [x] Upload an SVG or image and trace its outline automatically
- [x] Export the animation as video
- [x] Shareable links that store a custom drawing
- [x] Multiple outlines (text, logos with holes)
- [x] Single-chain complex-DFT mode
- [ ] Animated GIF export
- [ ] Gallery of community drawings
- [ ] Colour themes for videos
- [ ] FFT and Rust/WebAssembly core for very high harmonic counts

## Author

Built by [Raihanul Haque](https://github.com/RaihanulHaque).
