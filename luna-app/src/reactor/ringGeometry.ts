import { Skia, type SkPath } from '@shopify/react-native-skia';

/** Builds a ring made of `segments` short dashed arcs, for the rotating tick/status rings. */
export function dashedRingPath(radius: number, segments: number, coverage: number): SkPath {
  const p = Skia.Path.Make();
  const gapFraction = 1 - coverage;
  const step = 360 / segments;
  const sweep = step * coverage;
  for (let i = 0; i < segments; i++) {
    const start = i * step;
    p.addArc(Skia.XYWHRect(-radius, -radius, radius * 2, radius * 2), start, sweep);
  }
  void gapFraction;
  return p;
}

/** Small radial tick marks around a circle. */
export function tickMarksPath(radius: number, count: number, tickLength: number): SkPath {
  const p = Skia.Path.Make();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x0 = Math.cos(a) * radius;
    const y0 = Math.sin(a) * radius;
    const x1 = Math.cos(a) * (radius - tickLength);
    const y1 = Math.sin(a) * (radius - tickLength);
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
  }
  return p;
}
