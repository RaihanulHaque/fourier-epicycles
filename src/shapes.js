// Built-in shapes as closed polylines (any scale; they are normalized later).
const TAU = Math.PI * 2;

export const SHAPES = {
  // Hand-plotted hummingbird, facing right, with sharp wing and tail feathers.
  bird: () => [
    [99, 35], [72, 39], [69, 43], [66, 48], [63, 55], [57, 62], [50, 67], [44, 74],
    [41, 90], [38, 79], [33, 92], [33, 78], [25, 88], [31, 72], [38, 63], [42, 56],
    [34, 54], [37, 49], [27, 48], [33, 43], [20, 40], [29, 37], [14, 31], [25, 31], [9, 21], [22, 25], [6, 10],
    [14, 9], [26, 14], [38, 22], [48, 30], [54, 31], [58, 26], [64, 24], [69, 27], [71, 33], [73, 35],
  ],
  // Parametric heart curve.
  heart: () => Array.from({ length: 400 }, (_, i) => {
    const t = TAU * i / 400;
    return [
      16 * Math.sin(t) ** 3,
      -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    ];
  }),
  // Five-point star.
  star: () => Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 ? 0.42 : 1, a = -Math.PI / 2 + i * Math.PI / 5;
    return [r * Math.cos(a), r * Math.sin(a)];
  }),
  // Square: four corners, the classic Gibbs-effect demo.
  square: () => [[0, 0], [1, 0], [1, 1], [0, 1]],
};
