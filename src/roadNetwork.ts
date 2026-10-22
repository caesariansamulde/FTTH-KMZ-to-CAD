/**
 * Road network builder for the Pole Survey converter.
 *
 * Takes raw OSM road centerlines (metric coordinates) and produces clean, drafting-ready
 * road edges:
 *   1. Unifies the width of the same street so a road does not change size between OSM ways.
 *   2. Joins ways that simply continue one another into a single road chain.
 *   3. Smooths the centerline (tangent-continuous curve rounding) while pinning junction nodes.
 *   4. Offsets left/right edges, removes inner-corner loops.
 *   5. Trims every road edge where it runs inside another road's carriageway, so intersections,
 *      crossings and perpendicular roads come out already trimmed (no overlapping polylines).
 *   6. Places one readable road-name label per stretch (text never upside down).
 *
 * No centerline is emitted; only the two road edges per road are produced.
 */

export type Pt = { x: number; y: number; z: number };

export type RoadChainInput = {
  id: string;
  /** Display name that will be printed on the drawing. */
  name: string;
  /** True when the road has no official name (name is the generic fallback label). */
  generic: boolean;
  category: string;
  halfWidth: number;
  /** Centerline in metric (projected) coordinates. */
  points: Pt[];
};

export type RoadLabelResult = {
  text: string;
  /** Point on the centerline where the label is anchored. */
  anchor: Pt;
  /** Unit tangent of the road at the anchor (metric). Orientation is resolved by the caller. */
  dir: Pt;
  halfWidth: number;
  /** Text height in meters. */
  textHeight: number;
};

export type RoadCurbPiece = {
  points: Pt[];
  /** +1 for left curb (outward normal is left of piece direction), -1 for right curb (outward normal is right of piece direction). */
  side: 1 | -1;
  halfWidth: number;
};

export type RoadNetworkResult = {
  boundaries: Pt[][];
  curbPieces: RoadCurbPiece[];
  labels: RoadLabelResult[];
};

type Chain = {
  pts: Pt[];
  name: string;
  generic: boolean;
  category: string;
  hw: number;
  center: Pt[];
};

type Seg = { chain: number; a: Pt; b: Pt; r: number };

const JOIN_TOLERANCE = 0.1;
const MIN_POINT_GAP = 0.05;
const CLIP_EPSILON = 0.03;
const MIN_PIECE_LENGTH = 1.0;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});
const keyOf = (p: Pt) => `${Math.round(p.x / JOIN_TOLERANCE)}_${Math.round(p.y / JOIN_TOLERANCE)}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function dedupe(points: Pt[], gap = MIN_POINT_GAP): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > gap) out.push(p);
  }
  const finalInput = points[points.length - 1];
  if (out.length > 1 && finalInput && out[out.length - 1] !== finalInput) {
    out[out.length - 1] = finalInput;
  }
  return out;
}

function polylineLength(points: Pt[]) {
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) total += dist(points[i], points[i + 1]);
  return total;
}

function pointSegmentDistance(p: Pt, a: Pt, b: Pt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Iterative Douglas-Peucker simplification. */
function simplifyDP(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = pointSegmentDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index > -1 && maxDist > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Replaces every interior corner with a tangent-continuous quadratic Bezier so curves read as
 * smooth arcs instead of faceted OSM polylines. Straight sections stay straight.
 */
function roundCorners(section: Pt[], maxCut: number): Pt[] {
  if (section.length < 3) return section.slice();
  const out: Pt[] = [section[0]];
  for (let i = 1; i < section.length - 1; i += 1) {
    const prev = section[i - 1];
    const v = section[i];
    const next = section[i + 1];
    const lenIn = dist(prev, v);
    const lenOut = dist(v, next);
    if (lenIn < 1e-6 || lenOut < 1e-6) {
      out.push(v);
      continue;
    }
    const inX = (v.x - prev.x) / lenIn;
    const inY = (v.y - prev.y) / lenIn;
    const outX = (next.x - v.x) / lenOut;
    const outY = (next.y - v.y) / lenOut;
    const turn = Math.acos(clamp(inX * outX + inY * outY, -1, 1));
    if (turn < 0.03 || turn > 2.8) {
      out.push(v);
      continue;
    }
    const t = Math.min(maxCut, lenIn * 0.45, lenOut * 0.45);
    const a: Pt = { x: v.x - inX * t, y: v.y - inY * t, z: v.z };
    const b: Pt = { x: v.x + outX * t, y: v.y + outY * t, z: v.z };
    const steps = clamp(Math.ceil(turn / 0.17), 2, 14);
    for (let k = 0; k <= steps; k += 1) {
      const s = k / steps;
      const w0 = (1 - s) * (1 - s);
      const w1 = 2 * (1 - s) * s;
      const w2 = s * s;
      out.push({
        x: w0 * a.x + w1 * v.x + w2 * b.x,
        y: w0 * a.y + w1 * v.y + w2 * b.y,
        z: v.z,
      });
    }
  }
  out.push(section[section.length - 1]);
  return dedupe(out, 0.02);
}

function nameKey(chain: Chain) {
  return chain.generic ? `~${chain.category}` : `n:${chain.name.toUpperCase().replace(/\s+/g, " ")}`;
}

/** Same street = same width. Uses the length-weighted most common width of each street/category. */
function unifyWidths(chains: Chain[]) {
  const groups = new Map<string, Map<string, { hw: number; len: number }>>();
  chains.forEach((chain) => {
    const key = nameKey(chain);
    const widths = groups.get(key) || new Map<string, { hw: number; len: number }>();
    const wKey = chain.hw.toFixed(2);
    const entry = widths.get(wKey) || { hw: chain.hw, len: 0 };
    entry.len += polylineLength(chain.pts);
    widths.set(wKey, entry);
    groups.set(key, widths);
  });
  chains.forEach((chain) => {
    const widths = groups.get(nameKey(chain));
    if (!widths) return;
    let best: { hw: number; len: number } | null = null;
    widths.forEach((entry) => {
      if (!best || entry.len > best.len) best = entry;
    });
    if (best) chain.hw = (best as { hw: number; len: number }).hw;
  });
}

function directionFromJoint(pts: Pt[], end: 0 | 1): Pt {
  const joint = end === 0 ? pts[0] : pts[pts.length - 1];
  const other = end === 0 ? pts[1] : pts[pts.length - 2];
  const len = dist(joint, other) || 1;
  return { x: (other.x - joint.x) / len, y: (other.y - joint.y) / len, z: 0 };
}

function joinChains(a: Chain, aEnd: 0 | 1, b: Chain, bEnd: 0 | 1): Chain {
  const pa = aEnd === 1 ? a.pts : a.pts.slice().reverse();
  const pb = bEnd === 0 ? b.pts : b.pts.slice().reverse();
  return { ...a, pts: pa.concat(pb.slice(1)), center: [] };
}

/** Joins OSM ways that merely continue each other (two-way nodes, same street, same width). */
function mergeChains(input: Chain[]): Chain[] {
  let current = input;
  for (let pass = 0; pass < 14; pass += 1) {
    const incidence = new Map<string, number>();
    const ends = new Map<string, Array<{ ci: number; end: 0 | 1 }>>();
    current.forEach((chain, ci) => {
      chain.pts.forEach((p, i) => {
        const k = keyOf(p);
        incidence.set(k, (incidence.get(k) || 0) + 1);
        if (i === 0 || i === chain.pts.length - 1) {
          const list = ends.get(k) || [];
          list.push({ ci, end: i === 0 ? 0 : 1 });
          ends.set(k, list);
        }
      });
    });

    const used = new Set<number>();
    const replacement = new Map<number, Chain>();
    const removed = new Set<number>();
    ends.forEach((list, k) => {
      if (list.length !== 2 || incidence.get(k) !== 2) return;
      const [a, b] = list;
      if (a.ci === b.ci || used.has(a.ci) || used.has(b.ci)) return;
      const ca = current[a.ci];
      const cb = current[b.ci];
      const compatible =
        ca.generic === cb.generic && nameKey(ca) === nameKey(cb) && Math.abs(ca.hw - cb.hw) < 0.05;
      if (!compatible) return;
      const da = directionFromJoint(ca.pts, a.end);
      const db = directionFromJoint(cb.pts, b.end);
      // Outgoing directions of a straight continuation are opposite (dot = -1); allow bends up to 110 deg.
      if (da.x * db.x + da.y * db.y > Math.cos((70 * Math.PI) / 180)) return;
      used.add(a.ci);
      used.add(b.ci);
      removed.add(b.ci);
      replacement.set(a.ci, joinChains(ca, a.end, cb, b.end));
    });
    if (!removed.size) break;
    current = current.flatMap((chain, ci) => (removed.has(ci) ? [] : [replacement.get(ci) || chain]));
  }
  return current;
}

function buildIncidence(chains: Chain[]) {
  const incidence = new Map<string, number>();
  chains.forEach((chain) =>
    chain.pts.forEach((p) => {
      const k = keyOf(p);
      incidence.set(k, (incidence.get(k) || 0) + 1);
    }),
  );
  return incidence;
}

/** Smooths a chain; junction nodes and chain ends stay exactly where they are. */
function smoothChain(chain: Chain, incidence: Map<string, number>): Pt[] {
  const pts = chain.pts;
  const anchor = pts.map((p, i) => i === 0 || i === pts.length - 1 || (incidence.get(keyOf(p)) || 0) >= 2);
  const maxCut = clamp(chain.hw * 2.5, 5, 14);
  const out: Pt[] = [];
  let startIndex = 0;
  for (let i = 1; i < pts.length; i += 1) {
    if (!anchor[i]) continue;
    const section = pts.slice(startIndex, i + 1);
    const smoothed = roundCorners(simplifyDP(section, 0.2), maxCut);
    if (out.length) smoothed.shift();
    out.push(...smoothed);
    startIndex = i;
  }
  return dedupe(out);
}

function lineIntersection(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const aDx = a2.x - a1.x;
  const aDy = a2.y - a1.y;
  const bDx = b2.x - b1.x;
  const bDy = b2.y - b1.y;
  const denominator = aDx * bDy - aDy * bDx;
  if (Math.abs(denominator) < 1e-9) return null;
  const amount = ((b1.x - a1.x) * bDy - (b1.y - a1.y) * bDx) / denominator;
  return { x: a1.x + amount * aDx, y: a1.y + amount * aDy, z: a1.z };
}

function segmentCrossing(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const aDx = a2.x - a1.x;
  const aDy = a2.y - a1.y;
  const bDx = b2.x - b1.x;
  const bDy = b2.y - b1.y;
  const denominator = aDx * bDy - aDy * bDx;
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((b1.x - a1.x) * bDy - (b1.y - a1.y) * bDx) / denominator;
  const u = ((b1.x - a1.x) * aDy - (b1.y - a1.y) * aDx) / denominator;
  const e = 1e-6;
  if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
  return { x: a1.x + t * aDx, y: a1.y + t * aDy, z: a1.z };
}

/** Cuts out the small loops that appear on the inside of tight bends. */
function removeLoops(points: Pt[], window = 40): Pt[] {
  let out = points.slice();
  for (let guard = 0; guard < 8; guard += 1) {
    let changed = false;
    for (let i = 0; i < out.length - 1 && !changed; i += 1) {
      const limit = Math.min(out.length - 1, i + window);
      for (let j = i + 2; j < limit; j += 1) {
        const hit = segmentCrossing(out[i], out[i + 1], out[j], out[j + 1]);
        if (hit) {
          out = [...out.slice(0, i + 1), hit, ...out.slice(j + 1)];
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return out;
}

function offsetSegment(start: Pt, end: Pt, side: number, offset: number) {
  const length = dist(start, end);
  if (length < 0.01) return null;
  const unit = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const normal = { x: -unit.y * side, y: unit.x * side };
  return {
    start: { x: start.x + normal.x * offset, y: start.y + normal.y * offset, z: start.z },
    end: { x: end.x + normal.x * offset, y: end.y + normal.y * offset, z: end.z },
    unit,
    length,
  };
}

function pushDistinct(points: Pt[], point: Pt, tolerance = 0.01) {
  const last = points[points.length - 1];
  if (!last || dist(last, point) > tolerance) points.push(point);
}

function normalizeAngleDelta(delta: number) {
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  return delta;
}

/** Offsets a centerline by +/-radius. Outer corners get clean arcs, inner corners get mitres. */
function offsetEdge(center: Pt[], offsetMeters: number): Pt[] {
  if (center.length < 2) return [];
  const radius = Math.abs(offsetMeters);
  const side = offsetMeters >= 0 ? 1 : -1;
  const segments = center.slice(0, -1).map((p, i) => offsetSegment(p, center[i + 1], side, radius));
  const first = segments[0];
  if (!first) return [];

  const edge: Pt[] = [];
  pushDistinct(edge, first.start);

  for (let index = 1; index < center.length - 1; index += 1) {
    const vertex = center[index];
    const previous = segments[index - 1];
    const next = segments[index];
    if (!previous || !next) continue;

    const turn = previous.unit.x * next.unit.y - previous.unit.y * next.unit.x;
    const dot = previous.unit.x * next.unit.x + previous.unit.y * next.unit.y;
    const turnAngle = Math.acos(clamp(dot, -1, 1));

    if (Math.abs(turn) < 0.01 && dot > 0) {
      pushDistinct(edge, next.start);
      continue;
    }

    const outsideCorner = turn * side < 0;
    const miter = lineIntersection(previous.start, previous.end, next.start, next.end);
    const miterLimit = Math.min(Math.max(radius * 3.5, 10), Math.max(10, Math.min(previous.length, next.length) * 0.65));

    if (!outsideCorner) {
      if (miter && dist(vertex, miter) <= miterLimit) {
        pushDistinct(edge, miter);
      } else {
        pushDistinct(edge, previous.end);
        pushDistinct(edge, next.start);
      }
      continue;
    }

    if (turnAngle < 0.3 && miter && dist(vertex, miter) <= radius * 1.2) {
      pushDistinct(edge, miter);
      continue;
    }

    if (turnAngle > 2.6) {
      pushDistinct(edge, previous.end);
      pushDistinct(edge, next.start);
      continue;
    }

    const startAngle = Math.atan2(previous.end.y - vertex.y, previous.end.x - vertex.x);
    const endAngle = Math.atan2(next.start.y - vertex.y, next.start.x - vertex.x);
    const delta = normalizeAngleDelta(endAngle - startAngle);
    const steps = Math.max(3, Math.ceil(Math.abs(delta) / (Math.PI / 22)));
    for (let step = 0; step <= steps; step += 1) {
      const angle = startAngle + (delta * step) / steps;
      pushDistinct(edge, { x: vertex.x + Math.cos(angle) * radius, y: vertex.y + Math.sin(angle) * radius, z: vertex.z });
    }
  }

  const last = segments[segments.length - 1];
  if (last) pushDistinct(edge, last.end);
  return simplifyDP(removeLoops(edge), 0.02);
}

/** Portion [t0,t1] of segment AB that lies within distance r of segment CD (a convex capsule). */
function capsuleInterval(A: Pt, B: Pt, C: Pt, D: Pt, r: number): [number, number] | null {
  if (r <= 0) return null;
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  let lo = Infinity;
  let hi = -Infinity;
  const consider = (t0: number, t1: number) => {
    const a = Math.max(t0, 0);
    const b = Math.min(t1, 1);
    if (a <= b) {
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }
  };

  for (const Q of [C, D]) {
    const fx = A.x - Q.x;
    const fy = A.y - Q.y;
    const qa = abx * abx + aby * aby;
    const qb = 2 * (fx * abx + fy * aby);
    const qc = fx * fx + fy * fy - r * r;
    if (qa < 1e-12) {
      if (qc < 0) consider(0, 1);
      continue;
    }
    const disc = qb * qb - 4 * qa * qc;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      consider((-qb - sq) / (2 * qa), (-qb + sq) / (2 * qa));
    }
  }

  const cdx = D.x - C.x;
  const cdy = D.y - C.y;
  const L = Math.hypot(cdx, cdy);
  if (L > 1e-9) {
    const ux = cdx / L;
    const uy = cdy / L;
    const ex = A.x - C.x;
    const ey = A.y - C.y;
    const s0 = ex * ux + ey * uy;
    const ds = abx * ux + aby * uy;
    const v0 = -ex * uy + ey * ux;
    const dv = -abx * uy + aby * ux;
    let tl = 0;
    let th = 1;
    const limit = (p0: number, dp: number, min: number, max: number) => {
      if (Math.abs(dp) < 1e-12) {
        if (p0 < min || p0 > max) {
          tl = 1;
          th = 0;
        }
        return;
      }
      let t1 = (min - p0) / dp;
      let t2 = (max - p0) / dp;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tl = Math.max(tl, t1);
      th = Math.min(th, t2);
    };
    limit(s0, ds, 0, L);
    limit(v0, dv, -r, r);
    if (tl <= th) consider(tl, th);
  }

  return lo <= hi ? [lo, hi] : null;
}

class SegmentGrid {
  private readonly cell = 30;
  private readonly cells = new Map<string, number[]>();
  readonly segs: Seg[] = [];
  private stamp: Int32Array = new Int32Array(0);
  private stampValue = 0;

  add(seg: Seg) {
    const index = this.segs.length;
    this.segs.push(seg);
    const pad = seg.r;
    const minX = Math.min(seg.a.x, seg.b.x) - pad;
    const maxX = Math.max(seg.a.x, seg.b.x) + pad;
    const minY = Math.min(seg.a.y, seg.b.y) - pad;
    const maxY = Math.max(seg.a.y, seg.b.y) + pad;
    for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx += 1) {
      for (let cy = Math.floor(minY / this.cell); cy <= Math.floor(maxY / this.cell); cy += 1) {
        const key = `${cx},${cy}`;
        const list = this.cells.get(key);
        if (list) list.push(index);
        else this.cells.set(key, [index]);
      }
    }
  }

  finalize() {
    this.stamp = new Int32Array(this.segs.length);
  }

  query(minX: number, minY: number, maxX: number, maxY: number): number[] {
    this.stampValue += 1;
    const result: number[] = [];
    for (let cx = Math.floor(minX / this.cell); cx <= Math.floor(maxX / this.cell); cx += 1) {
      for (let cy = Math.floor(minY / this.cell); cy <= Math.floor(maxY / this.cell); cy += 1) {
        const list = this.cells.get(`${cx},${cy}`);
        if (!list) continue;
        for (const index of list) {
          if (this.stamp[index] !== this.stampValue) {
            this.stamp[index] = this.stampValue;
            result.push(index);
          }
        }
      }
    }
    return result;
  }
}

/** Splits an edge into the pieces that are NOT inside another road's carriageway. */
function trimEdge(edge: Pt[], selfChain: number, grid: SegmentGrid): Pt[][] {
  const pieces: Pt[][] = [];
  let current: Pt[] = [];
  const flush = () => {
    if (current.length > 1 && polylineLength(current) >= MIN_PIECE_LENGTH) pieces.push(current);
    current = [];
  };

  for (let i = 0; i < edge.length - 1; i += 1) {
    const A = edge[i];
    const B = edge[i + 1];
    const candidates = grid.query(
      Math.min(A.x, B.x),
      Math.min(A.y, B.y),
      Math.max(A.x, B.x),
      Math.max(A.y, B.y),
    );

    const inside: Array<[number, number]> = [];
    for (const index of candidates) {
      const seg = grid.segs[index];
      if (seg.chain === selfChain) continue;
      const interval = capsuleInterval(A, B, seg.a, seg.b, seg.r - CLIP_EPSILON);
      if (interval) inside.push(interval);
    }

    if (!inside.length) {
      if (!current.length) current.push(A);
      current.push(B);
      continue;
    }

    inside.sort((p, q) => p[0] - q[0]);
    const merged: Array<[number, number]> = [];
    for (const interval of inside) {
      const last = merged[merged.length - 1];
      if (last && interval[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], interval[1]);
      else merged.push([interval[0], interval[1]]);
    }

    // Outside intervals are the complement of the merged inside intervals.
    const outside: Array<[number, number]> = [];
    let cursor = 0;
    for (const [s, e] of merged) {
      if (s > cursor + 1e-9) outside.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < 1 - 1e-9) outside.push([cursor, 1]);

    for (const [s, e] of outside) {
      const p0 = lerpPt(A, B, s);
      const p1 = lerpPt(A, B, e);
      if (s <= 1e-9 && current.length) {
        current.push(p1);
      } else {
        flush();
        current = [p0, p1];
      }
      if (e < 1 - 1e-9) flush();
    }
    // A road area covering the segment start means the running piece has ended.
    if (merged.length && merged[0][0] <= 1e-9 && !(outside.length && outside[0][0] <= 1e-9)) flush();
    // A road area covering the segment end also ends the running piece.
    const lastMerged = merged[merged.length - 1];
    if (lastMerged[1] >= 1 - 1e-9) flush();
  }
  flush();
  return pieces.map((piece) => simplifyDP(piece, 0.02));
}

export function roadLabelHeight(_category: string) {
  return 1.5;
}

function pointAtLength(points: Pt[], cumulative: number[], s: number): Pt {
  if (s <= 0) return points[0];
  const total = cumulative[cumulative.length - 1];
  if (s >= total) return points[points.length - 1];
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = cumulative[hi] - cumulative[lo] || 1;
  return lerpPt(points[lo], points[hi], (s - cumulative[lo]) / span);
}

function planLabels(chains: Chain[], grid: SegmentGrid): RoadLabelResult[] {
  const labels: RoadLabelResult[] = [];
  chains.forEach((chain, ci) => {
    const center = chain.center;
    if (center.length < 2 || !chain.name) return;
    const textHeight = roadLabelHeight(chain.category);
    const textWidth = chain.name.length * textHeight * 0.72 + textHeight;
    const cumulative: number[] = [0];
    for (let i = 1; i < center.length; i += 1) cumulative.push(cumulative[i - 1] + dist(center[i - 1], center[i]));
    const total = cumulative[cumulative.length - 1];
    if (total < textWidth * 1.05 + 2) return;

    const targets = Math.max(1, Math.round(total / 160));
    const clearanceNeeded = chain.hw + textHeight * 1.4 + 0.3;

    for (let n = 0; n < targets; n += 1) {
      const base = ((n + 0.5) * total) / targets;
      const reach = Math.min(total / (2 * targets), total / 2) - textWidth / 2;
      const offsets: number[] = [0];
      for (let k = 1; k * textWidth * 0.5 <= Math.max(reach, 0); k += 1) offsets.push(k * textWidth * 0.5, -k * textWidth * 0.5);

      type Candidate = { s: number; deviation: number; clearance: number };
      let best: Candidate | null = null;
      let accepted: Candidate | null = null;
      const straightLimit = Math.max(0.4, textHeight * 0.5);

      for (const offset of offsets) {
        const s = base + offset;
        const s0 = s - textWidth / 2;
        const s1 = s + textWidth / 2;
        if (s0 < 0 || s1 > total) continue;
        const a = pointAtLength(center, cumulative, s0);
        const b = pointAtLength(center, cumulative, s1);
        let deviation = 0;
        for (let i = 0; i < center.length; i += 1) {
          if (cumulative[i] > s0 && cumulative[i] < s1) deviation = Math.max(deviation, pointSegmentDistance(center[i], a, b));
        }

        let clearance = Infinity;
        for (let k = 0; k <= 4; k += 1) {
          const p = pointAtLength(center, cumulative, s0 + (textWidth * k) / 4);
          const reachBox = chain.hw + textHeight * 3 + 20;
          const nearby = grid.query(p.x - reachBox, p.y - reachBox, p.x + reachBox, p.y + reachBox);
          for (const index of nearby) {
            const seg = grid.segs[index];
            if (seg.chain === ci) continue;
            clearance = Math.min(clearance, pointSegmentDistance(p, seg.a, seg.b) - seg.r);
          }
        }

        const candidate: Candidate = { s, deviation, clearance };
        if (!best || deviation < best.deviation - 0.05 || (deviation <= straightLimit && best.deviation <= straightLimit && clearance > best.clearance)) {
          best = candidate;
        }
        if (!accepted && deviation <= straightLimit && clearance >= clearanceNeeded) accepted = candidate;
      }

      const choice = accepted || best;
      if (!choice) continue;
      const a = pointAtLength(center, cumulative, choice.s - textWidth / 2);
      const b = pointAtLength(center, cumulative, choice.s + textWidth / 2);
      const chord = dist(a, b) || 1;
      labels.push({
        text: chain.name,
        anchor: pointAtLength(center, cumulative, choice.s),
        dir: { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord, z: 0 },
        halfWidth: chain.hw,
        textHeight,
      });
    }
  });
  return labels;
}

export function buildRoadNetwork(inputs: RoadChainInput[]): RoadNetworkResult {
  let chains: Chain[] = [];
  inputs.forEach((input) => {
    const pts = dedupe(input.points);
    if (pts.length < 2) return;
    chains.push({
      pts,
      name: input.name,
      generic: input.generic,
      category: input.category,
      hw: input.halfWidth,
      center: [],
    });
  });
  if (!chains.length) return { boundaries: [], curbPieces: [], labels: [] };

  unifyWidths(chains);
  chains = mergeChains(chains);

  const incidence = buildIncidence(chains);
  chains.forEach((chain) => {
    chain.center = smoothChain(chain, incidence);
  });
  chains = chains.filter((chain) => chain.center.length > 1);

  const grid = new SegmentGrid();
  chains.forEach((chain, ci) => {
    for (let i = 0; i < chain.center.length - 1; i += 1) {
      grid.add({ chain: ci, a: chain.center[i], b: chain.center[i + 1], r: chain.hw });
    }
  });
  grid.finalize();

  const boundaries: Pt[][] = [];
  const curbPieces: RoadCurbPiece[] = [];
  chains.forEach((chain, ci) => {
    ([1, -1] as const).forEach((side) => {
      const offset = side * chain.hw;
      const edge = offsetEdge(chain.center, offset);
      if (edge.length < 2) return;
      const pieces = trimEdge(edge, ci, grid);
      pieces.forEach((points) => {
        boundaries.push(points);
        curbPieces.push({ points, side, halfWidth: chain.hw });
      });
    });
  });

  return { boundaries, curbPieces, labels: planLabels(chains, grid) };
}

export { offsetEdge };
