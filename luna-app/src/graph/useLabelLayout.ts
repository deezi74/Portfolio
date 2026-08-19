import { useDerivedValue } from 'react-native-reanimated';
import type { GraphEngine } from './useGraphEngine';

export interface LabelMeta {
  id: string;
  label: string;
  priority: number; // importance * (1 + connections), pre-sorted descending by caller
}

export interface LabelPlacement {
  x: number;
  y: number;
  visible: boolean;
}

const CHAR_WIDTH = 6.4;
const LABEL_HEIGHT = 16;
const LABEL_GAP_Y = 14; // offset below node

/**
 * Single pass over all nodes, once per frame, producing screen-space label
 * placements with greedy priority-order collision avoidance. Runs as one
 * shared computation rather than per-label, so cost is O(n) instead of
 * O(n^2) across n label components. Always keeps the always-shown ids
 * (selection / active illumination) regardless of the label cap.
 */
export function useLabelLayout(
  engine: GraphEngine,
  orderedMeta: LabelMeta[],
  viewport: { w: number; h: number },
  maxLabels: number,
  alwaysShowIds: string[],
) {
  return useDerivedValue(() => {
    'worklet';
    void engine.tick.value; // depend on the per-frame tick
    const placements: Record<string, LabelPlacement> = {};
    const placedBoxes: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    let shown = 0;
    const alwaysSet = alwaysShowIds;

    const tryPlace = (id: string, label: string, force: boolean) => {
      const node = engine.simNodes.value[id];
      if (!node) return;
      const sx = node.x * engine.camera.scale.value + engine.camera.tx.value;
      const sy = node.y * engine.camera.scale.value + engine.camera.ty.value;
      const pad = 40;
      if (sx < -pad || sx > viewport.w + pad || sy < -pad || sy > viewport.h + pad) {
        placements[id] = { x: sx, y: sy, visible: false };
        return;
      }
      const halfW = (label.length * CHAR_WIDTH) / 2;
      const y0 = sy + LABEL_GAP_Y;
      const box = { x0: sx - halfW, y0, x1: sx + halfW, y1: y0 + LABEL_HEIGHT };

      let overlaps = false;
      if (!force) {
        for (const b of placedBoxes) {
          if (box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0) {
            overlaps = true;
            break;
          }
        }
      }

      if (!force && (overlaps || shown >= maxLabels)) {
        placements[id] = { x: sx, y: sy, visible: false };
        return;
      }
      placedBoxes.push(box);
      shown += 1;
      placements[id] = { x: sx, y: sy, visible: true };
    };

    for (const id of alwaysSet) {
      const meta = orderedMeta.find((m) => m.id === id);
      if (meta) tryPlace(meta.id, meta.label, true);
    }
    for (const meta of orderedMeta) {
      if (placements[meta.id]) continue;
      tryPlace(meta.id, meta.label, false);
    }

    return placements;
  }, [engine, orderedMeta, viewport.w, viewport.h, maxLabels, alwaysShowIds]);
}
