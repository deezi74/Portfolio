import { Skia, type SkPath } from '@shopify/react-native-skia';
import type { GraphCategory } from '../theme/colors';

/**
 * Tiny hand-built glyph set drawn directly with Skia paths so nodes read as
 * more than plain colored dots, without pulling a whole icon font into the
 * canvas layer. Each glyph is authored in a -1..1 unit box and scaled to the
 * node's radius at draw time.
 */
function path(builder: (p: SkPath) => void): SkPath {
  const p = Skia.Path.Make();
  builder(p);
  return p;
}

const glyphs: Record<GraphCategory, SkPath> = {
  technology: path((p) => {
    p.addRRect(Skia.RRectXY(Skia.XYWHRect(-0.4, -0.4, 0.8, 0.8), 0.15, 0.15));
    p.moveTo(-0.15, -0.7); p.lineTo(-0.15, -0.4);
    p.moveTo(0.15, -0.7); p.lineTo(0.15, -0.4);
    p.moveTo(-0.15, 0.4); p.lineTo(-0.15, 0.7);
    p.moveTo(0.15, 0.4); p.lineTo(0.15, 0.7);
    p.moveTo(-0.7, -0.15); p.lineTo(-0.4, -0.15);
    p.moveTo(-0.7, 0.15); p.lineTo(-0.4, 0.15);
    p.moveTo(0.4, -0.15); p.lineTo(0.7, -0.15);
    p.moveTo(0.4, 0.15); p.lineTo(0.7, 0.15);
  }),
  document: path((p) => {
    p.moveTo(-0.35, -0.6);
    p.lineTo(0.15, -0.6);
    p.lineTo(0.35, -0.4);
    p.lineTo(0.35, 0.6);
    p.lineTo(-0.35, 0.6);
    p.close();
    p.moveTo(-0.15, -0.15); p.lineTo(0.15, -0.15);
    p.moveTo(-0.15, 0.1); p.lineTo(0.15, 0.1);
    p.moveTo(-0.15, 0.35); p.lineTo(0.15, 0.35);
  }),
  aiModel: path((p) => {
    // sparkle
    p.moveTo(0, -0.7); p.lineTo(0.14, -0.14); p.lineTo(0.7, 0); p.lineTo(0.14, 0.14);
    p.lineTo(0, 0.7); p.lineTo(-0.14, 0.14); p.lineTo(-0.7, 0); p.lineTo(-0.14, -0.14);
    p.close();
  }),
  person: path((p) => {
    p.addCircle(0, -0.28, 0.26);
    p.moveTo(-0.42, 0.62);
    p.cubicTo(-0.42, 0.1, 0.42, 0.1, 0.42, 0.62);
  }),
  project: path((p) => {
    p.moveTo(-0.5, 0.1);
    p.lineTo(0, -0.55);
    p.lineTo(0.5, 0.1);
    p.close();
    p.moveTo(-0.28, 0.55); p.lineTo(0.28, 0.55);
  }),
  memory: path((p) => {
    p.moveTo(0, -0.6);
    p.cubicTo(0.65, -0.15, 0.5, 0.55, 0, 0.65);
    p.cubicTo(-0.5, 0.55, -0.65, -0.15, 0, -0.6);
    p.close();
  }),
  location: path((p) => {
    p.moveTo(0, 0.65);
    p.cubicTo(-0.55, -0.05, -0.4, -0.65, 0, -0.65);
    p.cubicTo(0.4, -0.65, 0.55, -0.05, 0, 0.65);
    p.close();
    p.addCircle(0, -0.15, 0.16);
  }),
  task: path((p) => {
    p.moveTo(-0.45, 0.05);
    p.lineTo(-0.12, 0.4);
    p.lineTo(0.5, -0.35);
  }),
  automation: path((p) => {
    p.addCircle(0, 0, 0.16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.moveTo(Math.cos(a) * 0.28, Math.sin(a) * 0.28);
      p.lineTo(Math.cos(a) * 0.6, Math.sin(a) * 0.6);
    }
  }),
  webSource: path((p) => {
    p.addCircle(0, 0, 0.55);
    p.moveTo(-0.55, 0); p.lineTo(0.55, 0);
    p.addOval(Skia.XYWHRect(-0.24, -0.55, 0.48, 1.1));
  }),
  general: path((p) => {
    p.addCircle(0, -0.22, 0.1);
    p.moveTo(0, -0.02); p.lineTo(0, 0.55);
  }),
};

export function glyphForCategory(category: GraphCategory): SkPath {
  return glyphs[category] ?? glyphs.general;
}
