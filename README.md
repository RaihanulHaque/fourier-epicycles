# Fourier Epicycle Drawer

Draw any closed shape with spinning circles.

The app takes an outline (a hummingbird, a heart, a star, a square, or something you draw yourself), works out its Fourier series, and rebuilds it with two chains of rotating circles called **epicycles**. One chain draws the x coordinate and the other draws the y coordinate. Where their guide lines cross, the pen traces the shape.

Raise the number of harmonics **N** to see the curve get closer to the original. Sharp corners like feather tips and star points need many more terms than smooth curves do.

It's plain HTML, CSS and JavaScript, written from scratch with no frameworks, no math libraries and no build step.

## Features

- **Two epicycle chains**: the teal chain makes `x(t)` and the gold chain makes `y(t)`, as in the classic physics visualisations
- **Built-in shapes**: a hand-plotted hummingbird, a parametric heart, a star and a square (good for seeing the Gibbs effect)
- **Draw your own**: draw one continuous loop with a mouse, pen or finger
- **Harmonics slider**: N from 1 to 150, updated live
- **Grow N every loop**: N goes up automatically, one step per loop: 1, 2, 3 … 150
- **Energy readout**: shows how much of the shape's variance the first N terms capture (Parseval's theorem)
- **Display toggles** for the circles, the target silhouette and the full N-term curve
- **Installable PWA**: works offline and can be added to a phone's home screen

## The math

A closed curve is sampled at `M = 512` points, spaced evenly along its length, and treated as two periodic signals `x(t)` and `y(t)` over `t ∈ [0, 2π)`.

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
│   ├── app.js             # Fourier math, animation, controls
│   └── style.css          # Layout and theme
├── icons/icon.svg         # App icon
├── manifest.webmanifest   # PWA manifest
└── sw.js                  # Service worker for offline use
```

## Deploy

It's a static site, so any static host works. For **GitHub Pages**: go to *Settings → Pages*, choose *Deploy from a branch*, then select `main` and `/ (root)`.

## Roadmap

- [ ] Upload an SVG or image and trace its outline automatically
- [ ] Export the animation as GIF / MP4
- [ ] Shareable links that store a custom drawing
- [ ] Support for multiple strokes (text, signatures)
- [ ] Single-chain complex-DFT mode
- [ ] FFT and Rust/WebAssembly core for very high harmonic counts

## Author

Built by [Raihanul Haque](https://github.com/RaihanulHaque).
