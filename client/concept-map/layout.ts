/*
 * Deterministic force-directed layout for the concept map.
 *
 * Pure TypeScript (no React Native) so it runs anywhere and can be tested alone.
 * Fruchterman-Reingold with a seeded PRNG, a little gravity so islands stay close and a
 * pull toward each folder's centroid so folder-mates cluster, then a horizontal stretch
 * and an overlap pass because labels are wide pills.
 * Positions are in world units; the view multiplies them by its zoom.
 */

export interface GraphNodeInput {
  id: string;
  title: string;
  folder: string;
  exists: boolean;
  isMap: boolean;
  sections: number;
  tags: string[];
}

export interface GraphEdgeInput {
  from: string;
  to: string;
  weight: number;
}

export interface PlacedNode extends GraphNodeInput {
  /** Center, world units. */
  x: number;
  y: number;
  w: number;
  h: number;
  font: number;
  label: string;
}

export interface PlacedEdge {
  a: number;
  b: number;
  /** Links in both directions, summed. */
  weight: number;
}

export interface GraphLayout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
  index: Map<string, number>;
  /** Node index -> neighbor indices. */
  neighbors: number[][];
}

const PAD = 48;
const MAX_LABEL = 28;
const CHAR = 0.62;

export function labelOf(title: string): string {
  return title.length > MAX_LABEL ? `${title.slice(0, MAX_LABEL - 1)}…` : title;
}

/** Top-level folder, the unit for colors and the legend. "" for the vault root and ghosts. */
export function topFolder(folder: string): string {
  return folder.split("/")[0] ?? "";
}

/** Pill metrics from section count; map notes are hubs. Mono glyphs are ~0.6em wide. */
export function pillSize(title: string, sections: number, isMap: boolean): { w: number; h: number; font: number; label: string } {
  const font = 11 + Math.min(sections, 8) * 0.4 + (isMap ? 4 : 0);
  const label = labelOf(title);
  return { w: Math.ceil(label.length * font * CHAR + 18), h: Math.ceil(font * 1.35 + 10), font, label };
}

export function graphSignature(nodes: GraphNodeInput[], edges: GraphEdgeInput[]): string {
  const n = nodes.map((x) => `${x.id}|${x.folder}|${x.sections}|${x.exists ? 1 : 0}${x.isMap ? 1 : 0}`).join("\n");
  const e = edges.map((x) => `${x.from}>${x.to}*${x.weight}`).join("\n");
  return `${n}\n#\n${e}`;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeLayout(nodesIn: GraphNodeInput[], edgesIn: GraphEdgeInput[]): GraphLayout {
  const nodes = [...nodesIn].sort((a, b) => a.id.localeCompare(b.id));
  const n = nodes.length;
  const index = new Map<string, number>();
  nodes.forEach((node, i) => index.set(node.id, i));

  // Merge A->B and B->A into one undirected edge.
  const merged = new Map<string, PlacedEdge>();
  for (const e of edgesIn) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined || a === b) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    const hit = merged.get(key);
    if (hit) hit.weight += e.weight;
    else merged.set(key, { a: lo, b: hi, weight: e.weight });
  }
  const edges = [...merged.values()];
  const neighbors: number[][] = nodes.map(() => []);
  for (const e of edges) {
    neighbors[e.a]!.push(e.b);
    neighbors[e.b]!.push(e.a);
  }

  const sizes = nodes.map((node) => pillSize(node.title, node.sections, node.isMap));
  const k = 70;
  const side = Math.max(k * 2, Math.sqrt(Math.max(n, 1)) * k);
  const rand = mulberry32(hash(graphSignature(nodesIn, edgesIn)));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  // Folder groups. Ghosts have no folder; their links place them.
  const groups = new Map<string, number>();
  const group = nodes.map((node) => {
    if (!node.exists) return -1;
    let g = groups.get(node.folder);
    if (g === undefined) groups.set(node.folder, (g = groups.size));
    return g;
  });
  const groupSize = new Float64Array(groups.size);
  for (const g of group) if (g >= 0) groupSize[g]! += 1;
  const cx = new Float64Array(groups.size);
  const cy = new Float64Array(groups.size);

  // Each folder starts around its own point on a circle, so islands do not have to untangle.
  const ring = groups.size > 1 ? side * 0.35 : 0;
  for (let i = 0; i < n; i++) {
    const g = group[i]!;
    const angle = g >= 0 ? (g / groups.size) * Math.PI * 2 : rand() * Math.PI * 2;
    const spread = g >= 0 ? side * 0.25 : side * 0.5;
    xs[i] = Math.cos(angle) * ring + (rand() - 0.5) * spread;
    ys[i] = Math.sin(angle) * ring + (rand() - 0.5) * spread;
  }

  if (n > 1) {
    const iterations = n <= 120 ? 400 : n <= 220 ? 300 : 220;
    const dx = new Float64Array(n);
    const dy = new Float64Array(n);
    const k2 = k * k;
    const gravity = 0.6;
    const clusterPull = 0.8;
    let temp = side / 8;
    const cool = temp / (iterations + 1);
    for (let it = 0; it < iterations; it++) {
      dx.fill(0);
      dy.fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let ddx = xs[i]! - xs[j]!;
          let ddy = ys[i]! - ys[j]!;
          let d2 = ddx * ddx + ddy * ddy;
          if (d2 < 0.01) {
            ddx = rand() - 0.5;
            ddy = rand() - 0.5;
            d2 = 0.01;
          }
          const f = k2 / d2;
          dx[i]! += ddx * f;
          dy[i]! += ddy * f;
          dx[j]! -= ddx * f;
          dy[j]! -= ddy * f;
        }
      }
      for (const e of edges) {
        const ddx = xs[e.a]! - xs[e.b]!;
        const ddy = ys[e.a]! - ys[e.b]!;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.1;
        const f = (d / k) * (1 + Math.log(e.weight) * 0.5);
        dx[e.a]! -= ddx * f;
        dy[e.a]! -= ddy * f;
        dx[e.b]! += ddx * f;
        dy[e.b]! += ddy * f;
      }
      cx.fill(0);
      cy.fill(0);
      for (let i = 0; i < n; i++) {
        const g = group[i]!;
        if (g < 0) continue;
        cx[g]! += xs[i]!;
        cy[g]! += ys[i]!;
      }
      for (let i = 0; i < n; i++) {
        const g = group[i]!;
        if (g >= 0 && groupSize[g]! > 1) {
          dx[i]! += (cx[g]! / groupSize[g]! - xs[i]!) * clusterPull;
          dy[i]! += (cy[g]! / groupSize[g]! - ys[i]!) * clusterPull;
        }
        dx[i]! -= xs[i]! * gravity;
        dy[i]! -= ys[i]! * gravity;
        const len = Math.sqrt(dx[i]! * dx[i]! + dy[i]! * dy[i]!);
        if (len > 0) {
          const step = Math.min(len, temp);
          xs[i]! += (dx[i]! / len) * step;
          ys[i]! += (dy[i]! / len) * step;
        }
      }
      temp = Math.max(temp - cool, 0.5);
    }
  }

  // Labels are wide: stretch horizontally, then push overlapping pills apart.
  for (let i = 0; i < n; i++) xs[i]! *= 1.7;
  const GAP = 8;
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ox = (sizes[i]!.w + sizes[j]!.w) / 2 + GAP - Math.abs(xs[i]! - xs[j]!);
        const oy = (sizes[i]!.h + sizes[j]!.h) / 2 + GAP - Math.abs(ys[i]! - ys[j]!);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy < ox) {
          const s = (ys[i]! < ys[j]! ? -1 : 1) * (oy / 2 + 0.5);
          ys[i]! += s;
          ys[j]! -= s;
        } else {
          const s = (xs[i]! < xs[j]! ? -1 : 1) * (ox / 2 + 0.5);
          xs[i]! += s;
          xs[j]! -= s;
        }
      }
    }
    if (!moved) break;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]! - sizes[i]!.w / 2);
    maxX = Math.max(maxX, xs[i]! + sizes[i]!.w / 2);
    minY = Math.min(minY, ys[i]! - sizes[i]!.h / 2);
    maxY = Math.max(maxY, ys[i]! + sizes[i]!.h / 2);
  }
  if (n === 0) minX = minY = maxX = maxY = 0;

  const placed: PlacedNode[] = nodes.map((node, i) => ({
    ...node,
    ...sizes[i]!,
    x: Math.round(xs[i]! - minX + PAD),
    y: Math.round(ys[i]! - minY + PAD),
  }));
  return {
    nodes: placed,
    edges,
    width: Math.ceil(maxX - minX + PAD * 2),
    height: Math.ceil(maxY - minY + PAD * 2),
    index,
    neighbors,
  };
}

const cache = new Map<string, GraphLayout>();

/** Layouts are cached by graph signature, so refetching an unchanged vault costs nothing. */
export function layoutFor(nodes: GraphNodeInput[], edges: GraphEdgeInput[]): GraphLayout {
  const key = graphSignature(nodes, edges);
  const hit = cache.get(key);
  if (hit) return hit;
  const layout = computeLayout(nodes, edges);
  cache.set(key, layout);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return layout;
}
