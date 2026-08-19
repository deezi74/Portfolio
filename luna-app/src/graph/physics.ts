'use worklet';

/**
 * Force-directed layout, run every frame on the UI thread via
 * useFrameCallback so the graph stays smooth regardless of JS-thread load
 * (LLM streaming, speech recognition, etc). Nodes live in a flat map keyed
 * by id so worklet code can mutate positions in place without allocating.
 *
 * For node counts in the thousands, replace the O(n^2) repulsion pass with
 * a spatial hash / quadtree bucket query (see cell() below — the hooks for
 * that are already in place, just unused at today's node counts).
 */

export interface SimNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pinned: boolean;
  dragging: boolean;
}

export interface SimEdge {
  source: string;
  target: string;
  strength: number;
}

const REPULSION = 2600;
const SPRING_K = 0.02;
const DAMPING = 0.86;
const CENTER_PULL = 0.0009;
const MAX_SPEED = 900;

const CELL_SIZE = 140;

export function cell(x: number, y: number): string {
  'worklet';
  const cx = Math.floor(x / CELL_SIZE);
  const cy = Math.floor(y / CELL_SIZE);
  return cx + ':' + cy;
}

export function stepSimulation(
  nodes: Record<string, SimNode>,
  edges: SimEdge[],
  dt: number,
  bounds: { w: number; h: number },
): void {
  'worklet';
  const ids = Object.keys(nodes);
  const n = ids.length;
  if (n === 0) return;

  // Spatial buckets for repulsion (cheap approximation of a quadtree —
  // sufficient up to a few hundred visible nodes; swap for a real quadtree
  // before pushing into the thousands).
  const buckets: Record<string, string[]> = {};
  for (const id of ids) {
    const node = nodes[id];
    const key = cell(node.x, node.y);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(id);
  }

  const cx = bounds.w / 2;
  const cy = bounds.h / 2;

  for (const id of ids) {
    const node = nodes[id];
    if (node.pinned || node.dragging) continue;

    let fx = 0;
    let fy = 0;

    // Repulsion: only check the node's own cell + 8 neighbors.
    const bx = Math.floor(node.x / CELL_SIZE);
    const by = Math.floor(node.y / CELL_SIZE);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const neighbors = buckets[(bx + ox) + ':' + (by + oy)];
        if (!neighbors) continue;
        for (const otherId of neighbors) {
          if (otherId === id) continue;
          const other = nodes[otherId];
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const distSq = Math.max(dx * dx + dy * dy, 60);
          const dist = Math.sqrt(distSq);
          const force = REPULSION / distSq;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }
    }

    // Gentle pull toward center so the graph doesn't drift away.
    fx += (cx - node.x) * CENTER_PULL;
    fy += (cy - node.y) * CENTER_PULL;

    node.vx = (node.vx + fx * dt) * DAMPING;
    node.vy = (node.vy + fy * dt) * DAMPING;
  }

  // Spring attraction along edges.
  for (const edge of edges) {
    const a = nodes[edge.source];
    const b = nodes[edge.target];
    if (!a || !b) continue;
    const restLength = 130 + (1 - edge.strength) * 90;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const displacement = dist - restLength;
    const force = SPRING_K * displacement * edge.strength;
    const nx = dx / dist;
    const ny = dy / dist;
    if (!a.pinned && !a.dragging) {
      a.vx += nx * force * dt;
      a.vy += ny * force * dt;
    }
    if (!b.pinned && !b.dragging) {
      b.vx -= nx * force * dt;
      b.vy -= ny * force * dt;
    }
  }

  // Integrate.
  for (const id of ids) {
    const node = nodes[id];
    if (node.pinned || node.dragging) continue;
    const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      node.vx *= scale;
      node.vy *= scale;
    }
    node.x += node.vx * dt;
    node.y += node.vy * dt;
  }
}
