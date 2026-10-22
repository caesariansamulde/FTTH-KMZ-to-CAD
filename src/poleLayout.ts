import type { Pt, RoadCurbPiece } from "./roadNetwork";

export interface PoleLayoutInput {
  id: string;
  origPt: Pt;
  textWidthUnscaled: number;
  textHeightUnscaled: number;
}

export interface RoadLabelBoxInput {
  center: Pt;
  angleDeg: number;
  width: number;
  height: number;
}

export interface PoleLayoutResult {
  id: string;
  origPt: Pt;
  adjustedPt: Pt;
  curbProj?: Pt;
  cablePt?: Pt;
  rotDeg: number; // [0, 360) AutoCAD rotation angle
  sideX: 1 | -1; // +1 = +U side of pole, -1 = mirrored (-U side of pole)
  slotY: "default" | "above";
}

interface OrientedBox {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  halfW: number;
  halfH: number;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentProjection(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { proj: { x: number; y: number }; t: number; d: number; len: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) {
    return { proj: { x: a.x, y: a.y }, t: 0, d: dist(p, a), len: 0 };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return { proj, t, d: dist(p, proj), len: Math.sqrt(lenSq) };
}

function segmentsProperlyCross(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): boolean {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-7) return false;
  const ox = b1.x - a1.x;
  const oy = b1.y - a1.y;
  const t = (ox * d2y - oy * d2x) / denom;
  const u = (ox * d1y - oy * d1x) / denom;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}

function normalizeReadableDeg(angleDeg: number): number {
  let a = ((angleDeg % 360) + 360) % 360;
  if (a > 90 && a <= 270) {
    a = (a + 180) % 360;
  }
  return a;
}

function orientedBoxesOverlap(a: OrientedBox, b: OrientedBox, pad = 0.6): boolean {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const axes = [
    { x: a.ux, y: a.uy },
    { x: a.vx, y: a.vy },
    { x: b.ux, y: b.uy },
    { x: b.vx, y: b.vy },
  ];
  for (const axis of axes) {
    const projDist = Math.abs(dx * axis.x + dy * axis.y);
    const ra =
      (a.halfW + pad * 0.5) * Math.abs(a.ux * axis.x + a.uy * axis.y) +
      (a.halfH + pad * 0.5) * Math.abs(a.vx * axis.x + a.vy * axis.y);
    const rb =
      (b.halfW + pad * 0.5) * Math.abs(b.ux * axis.x + b.uy * axis.y) +
      (b.halfH + pad * 0.5) * Math.abs(b.vx * axis.x + b.vy * axis.y);
    if (projDist >= ra + rb) return false;
  }
  return true;
}

function pointInsideOrientedBox(pt: { x: number; y: number }, box: OrientedBox, pad = 0): boolean {
  const dx = pt.x - box.cx;
  const dy = pt.y - box.cy;
  const localU = Math.abs(dx * box.ux + dy * box.uy);
  const localV = Math.abs(dx * box.vx + dy * box.vy);
  return localU < box.halfW + pad && localV < box.halfH + pad;
}

/**
 * Checks whether a candidate point is outside all given road carriageways with at least `minClearanceFromCurb`
 * meters of clearance from the road boundary.
 */
export function isPointClearOfAllRoads(
  pt: { x: number; y: number },
  curbPieces: RoadCurbPiece[],
  minClearanceFromCurb = 2.4,
): boolean {
  for (const curb of curbPieces) {
    const pts = curb.points;
    const roadWidth = curb.halfWidth * 2;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const { proj, d, len } = pointSegmentProjection(pt, a, b);
      if (len < 0.5) continue;
      if (d < minClearanceFromCurb) return false;
      if (d < roadWidth + minClearanceFromCurb) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        // Outward normal of this curb (pointing away from road center):
        // left curb (side=1): (-dy/len, dx/len)
        // right curb (side=-1): (dy/len, -dx/len)
        // Inward normal (pointing INTO the road carriageway):
        const inNx = -curb.side * (-dy / len);
        const inNy = -curb.side * (dx / len);
        const inwardDist = (pt.x - proj.x) * inNx + (pt.y - proj.y) * inNy;
        if (inwardDist > -minClearanceFromCurb && inwardDist < roadWidth + minClearanceFromCurb * 0.5) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Identifies which RoadCurbPieces belong to roads that actually carry the cable route / pole line,
 * versus unused side roads where no cable route runs.
 */
function filterActiveCableCurbPieces(
  curbPieces: RoadCurbPiece[],
  effectiveCableSegments: { a: Pt; b: Pt; dirX: number; dirY: number; len: number }[],
): RoadCurbPiece[] {
  if (!curbPieces.length || !effectiveCableSegments.length) return curbPieces;

  const activeFlags = curbPieces.map((curb) => {
    let alignedCableLen = 0;
    const matchedCableIndices = new Set<number>();

    for (let i = 0; i < curb.points.length - 1; i += 1) {
      const ra = curb.points[i];
      const rb = curb.points[i + 1];
      const rLen = dist(ra, rb);
      if (rLen < 0.5) continue;
      const rDirX = (rb.x - ra.x) / rLen;
      const rDirY = (rb.y - ra.y) / rLen;
      // Inward normal toward road centerline
      const inNx = -curb.side * -rDirY;
      const inNy = -curb.side * rDirX;
      const ca = { x: ra.x + inNx * curb.halfWidth, y: ra.y + inNy * curb.halfWidth };
      const cb = { x: rb.x + inNx * curb.halfWidth, y: rb.y + inNy * curb.halfWidth };

      for (let cIdx = 0; cIdx < effectiveCableSegments.length; cIdx += 1) {
        if (matchedCableIndices.has(cIdx)) continue;
        const seg = effectiveCableSegments[cIdx];
        const align = Math.abs(rDirX * seg.dirX + rDirY * seg.dirY);
        if (align < 0.58) continue;

        const mid = { x: (seg.a.x + seg.b.x) * 0.5, y: (seg.a.y + seg.b.y) * 0.5 };
        const q1 = { x: seg.a.x * 0.75 + seg.b.x * 0.25, y: seg.a.y * 0.75 + seg.b.y * 0.25 };
        const q3 = { x: seg.a.x * 0.25 + seg.b.x * 0.75, y: seg.a.y * 0.25 + seg.b.y * 0.75 };
        const maxDist = curb.halfWidth + 16;

        const dMid = pointSegmentProjection(mid, ca, cb).d;
        const dQ1 = pointSegmentProjection(q1, ca, cb).d;
        const dQ3 = pointSegmentProjection(q3, ca, cb).d;

        if (dMid <= maxDist && (dQ1 <= maxDist + 4 || dQ3 <= maxDist + 4)) {
          matchedCableIndices.add(cIdx);
          alignedCableLen += seg.len;
        }
      }
    }

    return alignedCableLen >= 18 || matchedCableIndices.size >= 2;
  });

  const active = curbPieces.filter((_, idx) => activeFlags[idx]);
  return active.length > 0 ? active : curbPieces;
}

export function computePoleLayouts(
  poles: PoleLayoutInput[],
  curbPieces: RoadCurbPiece[],
  cableChains: Pt[][],
  roadLabelBoxes: RoadLabelBoxInput[],
  scale = 1.15,
  cableRoadInsetOffset = 3.5,
): Map<string, PoleLayoutResult> {
  const results = new Map<string, PoleLayoutResult>();
  if (!poles.length) return results;

  // Build effective cable segments from explicit cable chains, plus sequential pole spans as fallback
  const effectiveCableSegments: { a: Pt; b: Pt; dirX: number; dirY: number; len: number }[] = [];
  for (const chain of cableChains) {
    for (let i = 0; i < chain.length - 1; i += 1) {
      const len = dist(chain[i], chain[i + 1]);
      if (len > 1.0) {
        effectiveCableSegments.push({
          a: chain[i],
          b: chain[i + 1],
          dirX: (chain[i + 1].x - chain[i].x) / len,
          dirY: (chain[i + 1].y - chain[i].y) / len,
          len,
        });
      }
    }
  }
  if (effectiveCableSegments.length === 0 && poles.length >= 2) {
    for (let i = 0; i < poles.length - 1; i += 1) {
      const len = dist(poles[i].origPt, poles[i + 1].origPt);
      if (len > 1.0 && len <= 150) {
        effectiveCableSegments.push({
          a: poles[i].origPt,
          b: poles[i + 1].origPt,
          dirX: (poles[i + 1].origPt.x - poles[i].origPt.x) / len,
          dirY: (poles[i + 1].origPt.y - poles[i].origPt.y) / len,
          len,
        });
      }
    }
  }

  // Separate active cable roads from unused side roads
  const activeCurbPieces = filterActiveCableCurbPieces(curbPieces, effectiveCableSegments);

  // Also filter roadLabelBoxes so we only avoid labels on active cable roads
  const activeRoadLabelBoxes = roadLabelBoxes.filter((rl) =>
    !isPointClearOfAllRoads(rl.center, activeCurbPieces, 2.0),
  );

  const targetCurbClearance = 3.1; // Matches MIN1243 / MIN1081 / MIN1152 (~2.8m-3.4m outside curb)
  const minCurbClearance = 2.55;
  const minPoleSeparation = 3.4;

  type PoleWorking = PoleLayoutInput & {
    adjustedPt: Pt;
    cableTangent: { x: number; y: number };
    roadTangent: { x: number; y: number };
    outwardNormal: { x: number; y: number };
    curbProj: { x: number; y: number };
    hasNearbyRoad: boolean;
    halfWidth: number;
  };

  const working: PoleWorking[] = poles.map((p, idx) => {
    let fallbackTx = 1;
    let fallbackTy = 0;
    let bestCableD = Infinity;
    for (const seg of effectiveCableSegments) {
      const { d } = pointSegmentProjection(p.origPt, seg.a, seg.b);
      if (d < bestCableD) {
        bestCableD = d;
        fallbackTx = seg.dirX;
        fallbackTy = seg.dirY;
      }
    }
    if (bestCableD === Infinity && poles.length > 1) {
      const nextP = poles[idx + 1] || poles[idx - 1];
      if (nextP) {
        const len = dist(p.origPt, nextP.origPt) || 1;
        fallbackTx = (nextP.origPt.x - p.origPt.x) / len;
        fallbackTy = (nextP.origPt.y - p.origPt.y) / len;
      }
    }

    return {
      ...p,
      adjustedPt: { ...p.origPt },
      cableTangent: { x: fallbackTx, y: fallbackTy },
      roadTangent: { x: fallbackTx, y: fallbackTy },
      outwardNormal: { x: -fallbackTy, y: fallbackTx },
      curbProj: { x: p.origPt.x, y: p.origPt.y },
      hasNearbyRoad: false,
      halfWidth: 4.0,
    };
  });

  // 1. Position each pole outside the active cable road carriageway with minimal movement from original GPS coordinates.
  // Poles that are already outside the road carriageway ARE NOT MOVED AT ALL (0.0m shift).
  // Poles that are inside the carriageway are only nudged perpendicularly just outside the curb by at most 3.8m.
  const requiredCurbClearance = 1.65; // Pole circle radius is ~1.44m, so 1.65m keeps circle edge outside the curb line
  const maxAllowedNudge = 3.8;

  for (let idx = 0; idx < working.length; idx += 1) {
    const item = working[idx];
    const orig = item.origPt;

    // Find nearest curb on active cable road (or fallback to any curb within 25m)
    type NearestCurb = {
      proj: { x: number; y: number };
      tx: number;
      ty: number;
      outNx: number;
      outNy: number;
      halfWidth: number;
      distToCurb: number;
      inwardDepth: number;
    };

    const findNearestCurb = (pieces: RoadCurbPiece[]): NearestCurb | null => {
      let best: NearestCurb | null = null;
      let minD = Infinity;

      for (const curb of pieces) {
        const pts = curb.points;
        for (let i = 0; i < pts.length - 1; i += 1) {
          const a = pts[i];
          const b = pts[i + 1];
          const { proj, d, len } = pointSegmentProjection(orig, a, b);
          if (len < 0.5 || d > 28) continue;

          const tx = (b.x - a.x) / len;
          const ty = (b.y - a.y) / len;
          const outNx = curb.side * -ty;
          const outNy = curb.side * tx;

          // Inward depth: positive if orig is inside the road carriageway
          const signedOutward = (orig.x - proj.x) * outNx + (orig.y - proj.y) * outNy;
          const inwardDepth = -signedOutward;

          // Prefer curb segments aligned with the pole's cable direction
          const cableAlign = Math.abs(tx * item.cableTangent.x + ty * item.cableTangent.y);
          const effectiveDist = d - cableAlign * 3.0;

          if (effectiveDist < minD) {
            minD = effectiveDist;
            best = {
              proj,
              tx,
              ty,
              outNx,
              outNy,
              halfWidth: curb.halfWidth,
              distToCurb: d,
              inwardDepth,
            };
          }
        }
      }
      return best;
    };

    let nearestCurb = findNearestCurb(activeCurbPieces);
    if (!nearestCurb && curbPieces.length > activeCurbPieces.length) {
      nearestCurb = findNearestCurb(curbPieces);
    }

    if (nearestCurb) {
      item.roadTangent = { x: nearestCurb.tx, y: nearestCurb.ty };
      item.outwardNormal = { x: nearestCurb.outNx, y: nearestCurb.outNy };
      item.curbProj = nearestCurb.proj;
      item.hasNearbyRoad = true;
      item.halfWidth = nearestCurb.halfWidth;

      // Check if pole is ALREADY clear of the road carriageway
      const isAlreadyClear = isPointClearOfAllRoads(orig, activeCurbPieces, requiredCurbClearance);

      if (isAlreadyClear) {
        // KEEP EXACT ORIGINAL GPS COORDINATES! Do not move!
        item.adjustedPt = { x: orig.x, y: orig.y, z: orig.z };
      } else {
        // Pole is inside the carriageway or overlapping the curb line.
        // Nudge strictly perpendicular to the curb outward from orig by the minimum distance required.
        const neededPush = Math.max(0, nearestCurb.inwardDepth) + requiredCurbClearance;
        const clampedPush = Math.min(maxAllowedNudge, neededPush);
        const nudgedPt = {
          x: orig.x + nearestCurb.outNx * clampedPush,
          y: orig.y + nearestCurb.outNy * clampedPush,
          z: orig.z,
        };

        // If the direct perpendicular nudge is clear, use it; otherwise test a tiny lateral nudge (<= 2m)
        if (isPointClearOfAllRoads(nudgedPt, activeCurbPieces, 1.2)) {
          item.adjustedPt = nudgedPt;
        } else {
          let bestTestPt = nudgedPt;
          let bestTestDist = dist(orig, nudgedPt);
          for (const lateralOffset of [-1.5, 1.5, -2.5, 2.5]) {
            const testPt = {
              x: nudgedPt.x + nearestCurb.tx * lateralOffset,
              y: nudgedPt.y + nearestCurb.ty * lateralOffset,
              z: orig.z,
            };
            if (isPointClearOfAllRoads(testPt, activeCurbPieces, 1.2)) {
              const dTest = dist(orig, testPt);
              if (dTest < bestTestDist + 1.0) {
                bestTestPt = testPt;
                break;
              }
            }
          }
          item.adjustedPt = bestTestPt;
        }
      }
    } else {
      // No nearby road within 28m: keep exact original GPS coordinates
      item.adjustedPt = { x: orig.x, y: orig.y, z: orig.z };
    }

    // Gentle pole-to-pole separation: only if poles are almost touching (< 2.2m), nudge by at most 0.8m
    for (let prevIdx = 0; prevIdx < idx; prevIdx += 1) {
      const prev = working[prevIdx];
      const d = dist(item.adjustedPt, prev.adjustedPt);
      if (d < 2.2) {
        const pushDist = Math.min(0.8, (2.2 - d) * 0.5 + 0.1);
        const candPlus = {
          x: item.adjustedPt.x + item.roadTangent.x * pushDist,
          y: item.adjustedPt.y + item.roadTangent.y * pushDist,
          z: item.adjustedPt.z,
        };
        const candMinus = {
          x: item.adjustedPt.x - item.roadTangent.x * pushDist,
          y: item.adjustedPt.y - item.roadTangent.y * pushDist,
          z: item.adjustedPt.z,
        };
        const choosePlus = dist(candPlus, prev.adjustedPt) >= dist(candMinus, prev.adjustedPt);
        item.adjustedPt = choosePlus ? candPlus : candMinus;
      }
    }
  }

  // 2. Convert active road labels into OrientedBox obstacles so pole attributes do not overlap active street names
  const placedBoxes: OrientedBox[] = activeRoadLabelBoxes.map((rl) => {
    const rad = (rl.angleDeg * Math.PI) / 180;
    return {
      cx: rl.center.x,
      cy: rl.center.y,
      ux: Math.cos(rad),
      uy: Math.sin(rad),
      vx: -Math.sin(rad),
      vy: Math.cos(rad),
      halfW: rl.width * 0.5 + 0.8,
      halfH: rl.height * 0.5 + 0.6,
    };
  });

  // 3. Orient each pole and mirror its attribute stencil when on the opposite side of the active cable road
  for (let idx = 0; idx < working.length; idx += 1) {
    const item = working[idx];
    const polePt = item.adjustedPt;

    let minNeighborDist = Infinity;
    for (let j = 0; j < working.length; j += 1) {
      if (j === idx) continue;
      const d = dist(polePt, working[j].adjustedPt);
      if (d < minNeighborDist) minNeighborDist = d;
    }

    const roadAngleDeg = (Math.atan2(item.roadTangent.y, item.roadTangent.x) * 180) / Math.PI;
    const parallelDeg = normalizeReadableDeg(roadAngleDeg);
    const perpDeg = normalizeReadableDeg(roadAngleDeg + 90);

    // Candidate readable angles: perpendicular to road, parallel to road, and horizontal 0°
    const candidateAngles = Array.from(
      new Set([
        Math.round(perpDeg * 10) / 10,
        Math.round(parallelDeg * 10) / 10,
        0,
      ]),
    );

    const wScaled = item.textWidthUnscaled * scale;
    const hScaled = item.textHeightUnscaled * scale;

    type OrientationCandidate = {
      rotDeg: number;
      sideX: 1 | -1;
      slotY: "default" | "above";
      box: OrientedBox;
      score: number;
    };

    let bestCand: OrientationCandidate | null = null;

    for (const rotDeg of candidateAngles) {
      const rad = (rotDeg * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const vx = -Math.sin(rad);
      const vy = Math.cos(rad);

      for (const sideX of [1, -1] as const) {
        for (const slotY of ["default", "above"] as const) {
          // Local (u, v) bounds of the attribute block relative to polePt.
          // Both slotY="default" and slotY="above" straddle v=0 so the pole circle is ALWAYS right next to the text!
          const uMin = sideX === 1 ? 2.3 * scale : -(2.3 * scale + wScaled);
          const uMax = sideX === 1 ? 2.3 * scale + wScaled : -2.3 * scale;

          const vMax = slotY === "above" ? (hScaled - 1.85 * scale) : 1.85 * scale;
          const vMin = slotY === "above" ? -1.85 * scale : -(hScaled - 1.85 * scale);

          const uMid = (uMin + uMax) * 0.5;
          const vMid = (vMin + vMax) * 0.5;
          const halfW = (uMax - uMin) * 0.5;
          const halfH = (vMax - vMin) * 0.5;

          const cx = polePt.x + ux * uMid + vx * vMid;
          const cy = polePt.y + uy * uMid + vy * vMid;

          const candBox: OrientedBox = {
            cx,
            cy,
            ux,
            uy,
            vx,
            vy,
            halfW,
            halfH,
          };

          const corners = [
            { x: cx - ux * halfW - vx * halfH, y: cy - uy * halfW - vy * halfH },
            { x: cx + ux * halfW - vx * halfH, y: cy + uy * halfW - vy * halfH },
            { x: cx + ux * halfW + vx * halfH, y: cy + uy * halfW + vy * halfH },
            { x: cx - ux * halfW + vx * halfH, y: cy - uy * halfW + vy * halfH },
          ];
          const samples = [
            ...corners,
            { x: cx, y: cy },
            { x: (corners[0].x + corners[1].x) * 0.5, y: (corners[0].y + corners[1].y) * 0.5 },
            { x: (corners[2].x + corners[3].x) * 0.5, y: (corners[2].y + corners[3].y) * 0.5 },
          ];

          let score = 0;

          // 1. Must sit on the OUTWARD side of the active cable road and NEVER overlap the active cable road!
          if (item.hasNearbyRoad) {
            const boxOutwardDot =
              (cx - item.curbProj.x) * item.outwardNormal.x +
              (cy - item.curbProj.y) * item.outwardNormal.y;

            if (boxOutwardDot < 2.4) {
              score += 3500 + (2.4 - boxOutwardDot) * 400;
            } else {
              // Strongly reward extending outward away from the active cable road
              score -= Math.min(boxOutwardDot, 18) * 6.0;
            }

            // Explicit mirror alignment with outwardNormal:
            // When perpendicular to road, U is aligned with +/- outwardNormal -> sideX should match sign(dot(U, outwardNormal))
            const uOutDot = ux * item.outwardNormal.x + uy * item.outwardNormal.y;
            const vOutDot = vx * item.outwardNormal.x + vy * item.outwardNormal.y;
            if (Math.abs(uOutDot) > 0.7) {
              const desiredSideX = uOutDot >= 0 ? 1 : -1;
              if (sideX === desiredSideX) score -= 45;
              else score += 2500;
            }
            if (Math.abs(vOutDot) > 0.7) {
              const desiredSlotY = vOutDot >= 0 ? "above" : "default";
              if (slotY === desiredSlotY) score -= 45;
              else score += 2500;
            }

            for (const sPt of samples) {
              const sOutDot =
                (sPt.x - item.curbProj.x) * item.outwardNormal.x +
                (sPt.y - item.curbProj.y) * item.outwardNormal.y;
              if (sOutDot < 1.2) {
                score += 1500;
              }
              if (!isPointClearOfAllRoads(sPt, activeCurbPieces, 1.0)) {
                score += 2200;
              }
            }

            // Check if any edge of the attribute box crosses any ACTIVE cable road boundary segment
            for (const curb of activeCurbPieces) {
              for (let k = 0; k < curb.points.length - 1; k += 1) {
                const ra = curb.points[k];
                const rb = curb.points[k + 1];
                for (let cIdx = 0; cIdx < 4; cIdx += 1) {
                  if (segmentsProperlyCross(corners[cIdx], corners[(cIdx + 1) % 4], ra, rb)) {
                    score += 3000;
                    break;
                  }
                }
              }
            }
          }

          // 2. Must not cover any other pole's circle
          for (let j = 0; j < working.length; j += 1) {
            if (j === idx) continue;
            const otherPt = working[j].adjustedPt;
            if (pointInsideOrientedBox(otherPt, candBox, 2.2)) {
              score += 1800;
            }
          }

          // 3. Must not overlap any already-placed pole's attribute box or active road label box
          for (const placed of placedBoxes) {
            if (orientedBoxesOverlap(candBox, placed, 0.6)) {
              score += 1300;
            }
          }

          // 4. Avoid crossing cable segments attached to this pole
          for (const seg of effectiveCableSegments) {
            if (
              pointInsideOrientedBox(
                { x: (seg.a.x + seg.b.x) * 0.5, y: (seg.a.y + seg.b.y) * 0.5 },
                candBox,
                -0.5,
              )
            ) {
              score += 140;
            }
          }

          // 5. Angle & slot style preferences matching sample LLD drawings:
          const isPerp = Math.abs(rotDeg - perpDeg) < 1.0;
          const isParallel = Math.abs(rotDeg - parallelDeg) < 1.0;
          if (minNeighborDist < 55) {
            if (isPerp) score -= 28;
            else if (isParallel) score -= 8;
          } else {
            if (isParallel) score -= 22;
            else if (isPerp) score -= 18;
          }

          if (slotY === "default") score -= 6;
          if (sideX === 1) score -= 2;

          if (!bestCand || score < bestCand.score) {
            bestCand = {
              rotDeg,
              sideX,
              slotY,
              box: candBox,
              score,
            };
          }
        }
      }
    }

    const chosen = bestCand!;
    placedBoxes.push(chosen.box);

    const cablePt = item.hasNearbyRoad
      ? (() => {
          const hw = item.halfWidth || 4.0;
          let inset = cableRoadInsetOffset;
          if (hw >= 8.0) {
            // National highway / wide arterial: 3.5m - 5.0m
            inset = Math.min(5.0, Math.max(cableRoadInsetOffset, 3.8));
          } else if (hw >= 5.0) {
            // Secondary / collector road: 3.0m - 3.8m
            inset = Math.min(3.8, Math.max(2.5, cableRoadInsetOffset));
          } else {
            // Narrow residential street or barangay road: 1.2m - 2.5m (stay within lane, max 50% of half-width)
            inset = Math.min(cableRoadInsetOffset, Math.max(1.2, hw * 0.45));
          }
          return {
            x: item.curbProj.x - item.outwardNormal.x * inset,
            y: item.curbProj.y - item.outwardNormal.y * inset,
            z: 0,
          };
        })()
      : item.origPt;

    results.set(item.id, {
      id: item.id,
      origPt: item.origPt,
      adjustedPt: item.adjustedPt,
      curbProj: item.hasNearbyRoad ? { x: item.curbProj.x, y: item.curbProj.y, z: 0 } : item.origPt,
      cablePt,
      rotDeg: chosen.rotDeg,
      sideX: chosen.sideX,
      slotY: chosen.slotY,
    });
  }

  return results;
}
