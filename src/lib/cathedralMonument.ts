import finalConfig from '../data/hero/final-config.json';

type Layer = {
  width: number;
  opacity: number;
  color: string;
};

type PointerState = {
  x: number;
  y: number;
  px: number;
  py: number;
  active: boolean;
};

type CorePoint = {
  t: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
};

type RenderState = {
  ribbonPaths: string[];
  shadowPaths: string[];
};

const widths = finalConfig.cathedral_architecture.ribbon_widths;
const opacities = finalConfig.cathedral_architecture.ribbon_opacities;
const colors = finalConfig.colour.ribbon_layer_colors;

export const CATHEDRAL = {
  viewBoxSize: 580,
  samples: finalConfig.trajectory.render_samples,
  trajectory: {
    k: finalConfig.trajectory.k,
    A: finalConfig.trajectory.A,
    x0: finalConfig.trajectory.x0,
    x1: finalConfig.trajectory.x1,
    y0: finalConfig.trajectory.y0,
  },
  layers: widths.map((width, index): Layer => ({
    width,
    opacity: opacities[index],
    color: colors[index],
  })),
  spreadBase: finalConfig.cathedral_architecture.spreadBase,
  spreadGain: finalConfig.cathedral_architecture.spreadGain,
  visibleBase: finalConfig.cathedral_architecture.visibleBase,
  proxFactor: finalConfig.cathedral_architecture.proxFactor,
  pointerDistance: finalConfig.cathedral_architecture.pointerDistance,
  localLift: finalConfig.cathedral_architecture.localLift,
  parallax: finalConfig.cathedral_architecture.parallax,
  neutral: finalConfig.cathedral_architecture.neutral_pointer,
  shadowOpacity: finalConfig.cathedral_architecture.shadowOpacity,
  shadowWidth: finalConfig.cathedral_architecture.shadowWidth,
  shadowDx: finalConfig.cathedral_architecture.shadowDx,
  shadowDy: finalConfig.cathedral_architecture.shadowDy,
  dampingMs: finalConfig.motion.damping_time_constant_ms,
  responseSigmaT: 2.8 / 43,
} as const;

export const responseCapacity = (t: number) => 0.18 + 0.82 * t * t;

const normalizedExponential = (t: number) => {
  const { k } = CATHEDRAL.trajectory;
  return (Math.exp(k * t) - 1) / (Math.exp(k) - 1);
};

export const samplePoint = (t: number): [number, number] => {
  const { x0, x1, y0, A } = CATHEDRAL.trajectory;
  return [
    x0 + (x1 - x0) * t,
    y0 - A * normalizedExponential(t),
  ];
};

const tangent = (t: number): [number, number] => {
  const { x0, x1, A, k } = CATHEDRAL.trajectory;
  const dx = x1 - x0;
  const dy = -(A * k * Math.exp(k * t) / (Math.exp(k) - 1));
  const magnitude = Math.hypot(dx, dy) || 1;
  return [dx / magnitude, dy / magnitude];
};

const normal = (t: number): [number, number] => {
  const [tx, ty] = tangent(t);
  return [-ty, tx];
};

export const createCore = (sampleCount = CATHEDRAL.samples): CorePoint[] =>
  Array.from({ length: sampleCount }, (_, index) => {
    const t = index / (sampleCount - 1);
    const [x, y] = samplePoint(t);
    const [nx, ny] = normal(t);
    return { t, x, y, nx, ny };
  });

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const gaussian = (distance: number, sigma: number) =>
  Math.exp(-(distance * distance) / (2 * sigma * sigma));

const nearestPoint = (core: CorePoint[], px: number, py: number) => {
  let best = { distance: Number.POSITIVE_INFINITY, t: 0 };
  for (const point of core) {
    const distance = Math.hypot(px - point.x, py - point.y);
    if (distance < best.distance) best = { distance, t: point.t };
  }
  return best;
};

export const pathDirect = (points: Array<[number, number]>) =>
  `M ${points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' L ')}`;

export const neutralPointer = (): PointerState => ({
  x: CATHEDRAL.neutral.x,
  y: CATHEDRAL.neutral.y,
  px: CATHEDRAL.neutral.x * CATHEDRAL.viewBoxSize,
  py: CATHEDRAL.neutral.y * CATHEDRAL.viewBoxSize,
  active: false,
});

export const renderCathedral = (
  pointer: PointerState,
  core = createCore(),
): RenderState => {
  const nearest = nearestPoint(core, pointer.px, pointer.py);
  const ribbonPaths: string[] = [];
  const shadowPaths: string[] = [];
  const middleLayer = (CATHEDRAL.layers.length - 1) / 2;

  CATHEDRAL.layers.forEach((_layer, layerIndex) => {
    const layer = layerIndex - middleLayer;
    const points: Array<[number, number]> = core.map((point) => {
      const response = responseCapacity(point.t);
      const proximity = pointer.active && nearest.distance < CATHEDRAL.pointerDistance
        ? gaussian(point.t - nearest.t, CATHEDRAL.responseSigmaT)
        : 0;
      const layerSpread = CATHEDRAL.spreadBase + CATHEDRAL.spreadGain * response;
      let separation = layer * layerSpread * CATHEDRAL.visibleBase;
      if (proximity) {
        separation += layer * layerSpread * CATHEDRAL.proxFactor * proximity;
      }

      let x = point.x + point.nx * separation;
      let y = point.y + point.ny * separation;

      const parallax = layer * (pointer.y - 0.5)
        * (CATHEDRAL.parallax.base + CATHEDRAL.parallax.gain * response);
      x += parallax * CATHEDRAL.parallax.x;
      y -= parallax * CATHEDRAL.parallax.y;

      if (proximity) {
        y -= proximity
          * (CATHEDRAL.localLift.base + CATHEDRAL.localLift.gain * response)
          * (1 - (Math.abs(layer) / (CATHEDRAL.layers.length / 2 + 1)) * 0.18);
      }

      return [x, y];
    });

    ribbonPaths.push(pathDirect(points));
    shadowPaths.push(pathDirect(points.map(([x, y]) => [
      x + CATHEDRAL.shadowDx,
      y + CATHEDRAL.shadowDy + layerIndex * 0.25,
    ])));
  });

  return { ribbonPaths, shadowPaths };
};

export const pointerFromClientPoint = (
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
) => {
  const x = clamp((clientX - rect.left) / Math.max(1, rect.width));
  const y = clamp((clientY - rect.top) / Math.max(1, rect.height));
  return {
    x,
    y,
    px: x * CATHEDRAL.viewBoxSize,
    py: y * CATHEDRAL.viewBoxSize,
    active: true,
  } satisfies PointerState;
};
