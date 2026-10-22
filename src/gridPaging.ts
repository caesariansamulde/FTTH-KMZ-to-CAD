export interface GridPoint {
  x: number;
  y: number;
  z: number;
}

export interface GridBoxBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const GRID_WIDTH_METERS = 199.61142092;
const GRID_HEIGHT_METERS = 199.24265231;

function boxesOverlapInterior(a: GridBoxBounds, b: GridBoxBounds, eps = 0.05): boolean {
  const ovX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const ovY = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return ovX > eps && ovY > eps;
}

function resolveNonOverlappingPosition(
  fixedMin: number,
  fixedMax: number,
  idealCrossMin: number,
  isVerticalStep: boolean,
  W: number,
  H: number,
  placedBoxes: GridBoxBounds[],
): number | null {
  const eps = 0.05 * (W / GRID_WIDTH_METERS);
  const candidates: number[] = [idealCrossMin];

  for (const b of placedBoxes) {
    if (!isVerticalStep) {
      const ovX = Math.min(fixedMax, b.maxX) - Math.max(fixedMin, b.minX);
      if (ovX > eps) {
        candidates.push(b.maxY);
        candidates.push(b.minY - H);
      }
    } else {
      const ovY = Math.min(fixedMax, b.maxY) - Math.max(fixedMin, b.minY);
      if (ovY > eps) {
        candidates.push(b.maxX);
        candidates.push(b.minX - W);
      }
    }
  }

  let bestVal: number | null = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const testBox: GridBoxBounds = !isVerticalStep
      ? { minX: fixedMin, maxX: fixedMax, minY: c, maxY: c + H }
      : { minX: c, maxX: c + W, minY: fixedMin, maxY: fixedMax };
    if (placedBoxes.every((b) => !boxesOverlapInterior(testBox, b, eps))) {
      const d = Math.abs(c - idealCrossMin);
      if (d < bestDist) {
        bestDist = d;
        bestVal = c;
      }
    }
  }

  return bestVal;
}

export function computeGridPagingBoxes(
  polePoints: GridPoint[],
  W = GRID_WIDTH_METERS,
  H = GRID_HEIGHT_METERS,
): GridBoxBounds[] {
  if (!polePoints.length) return [];

  const unitScale = W / GRID_WIDTH_METERS;
  const eps = 0.05 * unitScale;
  const innerPad = 14 * unitScale;
  const minPad = 2 * unitScale;
  const maxStepReach = 140 * unitScale;

  const uncovered = new Set<number>(polePoints.map((_, i) => i));
  const placed: GridBoxBounds[] = [];

  const getUncoveredInBox = (box: GridBoxBounds, margin = 0): number[] => {
    const res: number[] = [];
    for (const idx of uncovered) {
      const p = polePoints[idx];
      if (
        p.x >= box.minX + margin &&
        p.x <= box.maxX - margin &&
        p.y >= box.minY + margin &&
        p.y <= box.maxY - margin
      ) {
        res.push(idx);
      }
    }
    return res;
  };

  while (uncovered.size > 0) {
    let bestCand: { box: GridBoxBounds; cov: number[]; score: number } | null = null;

    // 1. Try attaching an edge-adjacent box (E, W, N, S) to an already-placed box
    for (const b of placed) {
      const bCx = (b.minX + b.maxX) * 0.5;
      const bCy = (b.minY + b.maxY) * 0.5;

      const edgeSpecs = [
        { fixedMin: b.maxX, fixedMax: b.maxX + W, isVert: false }, // East
        { fixedMin: b.minX - W, fixedMax: b.minX, isVert: false }, // West
        { fixedMin: b.maxY, fixedMax: b.maxY + H, isVert: true }, // North
        { fixedMin: b.minY - H, fixedMax: b.minY, isVert: true }, // South
      ];

      for (const spec of edgeSpecs) {
        if (!spec.isVert) {
          const near: GridPoint[] = [];
          for (const idx of uncovered) {
            const p = polePoints[idx];
            if (
              p.x >= spec.fixedMin + 5 * unitScale &&
              p.x <= spec.fixedMax - 5 * unitScale &&
              p.y >= b.minY - H * 0.85 &&
              p.y <= b.maxY + H * 0.85
            ) {
              near.push(p);
            }
          }
          if (!near.length) continue;

          near.sort((p1, p2) => Math.hypot(p1.x - bCx, p1.y - bCy) - Math.hypot(p2.x - bCx, p2.y - bCy));
          const seed = near[0];
          const cluster = near.filter((p) => Math.abs(p.y - seed.y) <= H - 34 * unitScale);
          const minPy = Math.min(...cluster.map((p) => p.y));
          const maxPy = Math.max(...cluster.map((p) => p.y));
          const idealMinY = (minPy + maxPy) * 0.5 - H * 0.5;

          const validMinY = resolveNonOverlappingPosition(
            spec.fixedMin,
            spec.fixedMax,
            idealMinY,
            false,
            W,
            H,
            placed,
          );
          if (validMinY === null || Math.abs(validMinY - idealMinY) > H * 0.65) continue;

          const candBox: GridBoxBounds = {
            minX: spec.fixedMin,
            maxX: spec.fixedMax,
            minY: validMinY,
            maxY: validMinY + H,
          };
          const cov = getUncoveredInBox(candBox, minPad);
          if (!cov.length) continue;
          const covInner = getUncoveredInBox(candBox, innerPad);

          const minDistToB = Math.min(
            ...cov.map((idx) => {
              const p = polePoints[idx];
              const dx = Math.max(0, b.minX - p.x, p.x - b.maxX);
              const dy = Math.max(0, b.minY - p.y, p.y - b.maxY);
              return Math.hypot(dx, dy);
            }),
          );
          if (minDistToB > maxStepReach) continue;

          const score =
            covInner.length * 25 +
            cov.length * 10 -
            (minDistToB / unitScale) * 0.3 -
            (Math.abs(validMinY - idealMinY) / unitScale) * 0.2;

          if (!bestCand || score > bestCand.score) {
            bestCand = { box: candBox, cov, score };
          }
        } else {
          const near: GridPoint[] = [];
          for (const idx of uncovered) {
            const p = polePoints[idx];
            if (
              p.y >= spec.fixedMin + 5 * unitScale &&
              p.y <= spec.fixedMax - 5 * unitScale &&
              p.x >= b.minX - W * 0.85 &&
              p.x <= b.maxX + W * 0.85
            ) {
              near.push(p);
            }
          }
          if (!near.length) continue;

          near.sort((p1, p2) => Math.hypot(p1.x - bCx, p1.y - bCy) - Math.hypot(p2.x - bCx, p2.y - bCy));
          const seed = near[0];
          const cluster = near.filter((p) => Math.abs(p.x - seed.x) <= W - 34 * unitScale);
          const minPx = Math.min(...cluster.map((p) => p.x));
          const maxPx = Math.max(...cluster.map((p) => p.x));
          const idealMinX = (minPx + maxPx) * 0.5 - W * 0.5;

          const validMinX = resolveNonOverlappingPosition(
            spec.fixedMin,
            spec.fixedMax,
            idealMinX,
            true,
            W,
            H,
            placed,
          );
          if (validMinX === null || Math.abs(validMinX - idealMinX) > W * 0.65) continue;

          const candBox: GridBoxBounds = {
            minX: validMinX,
            maxX: validMinX + W,
            minY: spec.fixedMin,
            maxY: spec.fixedMax,
          };
          const cov = getUncoveredInBox(candBox, minPad);
          if (!cov.length) continue;
          const covInner = getUncoveredInBox(candBox, innerPad);

          const minDistToB = Math.min(
            ...cov.map((idx) => {
              const p = polePoints[idx];
              const dx = Math.max(0, b.minX - p.x, p.x - b.maxX);
              const dy = Math.max(0, b.minY - p.y, p.y - b.maxY);
              return Math.hypot(dx, dy);
            }),
          );
          if (minDistToB > maxStepReach) continue;

          const score =
            covInner.length * 25 +
            cov.length * 10 -
            (minDistToB / unitScale) * 0.3 -
            (Math.abs(validMinX - idealMinX) / unitScale) * 0.2;

          if (!bestCand || score > bestCand.score) {
            bestCand = { box: candBox, cov, score };
          }
        }
      }
    }

    if (bestCand) {
      placed.push(bestCand.box);
      for (const idx of bestCand.cov) uncovered.delete(idx);
      continue;
    }

    // 2. Start a new seed box for an uncovered cluster
    const remIndices = Array.from(uncovered);
    remIndices.sort(
      (i1, i2) =>
        polePoints[i1].x + polePoints[i1].y * 0.2 - (polePoints[i2].x + polePoints[i2].y * 0.2),
    );
    const seedPole = polePoints[remIndices[0]];

    const localCluster = remIndices
      .map((i) => polePoints[i])
      .filter((p) => Math.hypot(p.x - seedPole.x, p.y - seedPole.y) < 240 * unitScale);
    const spanX = Math.max(...localCluster.map((p) => p.x)) - Math.min(...localCluster.map((p) => p.x));
    const spanY = Math.max(...localCluster.map((p) => p.y)) - Math.min(...localCluster.map((p) => p.y));

    let minX = seedPole.x - W * 0.5;
    let minY = seedPole.y - H * 0.5;

    if (spanX <= W - 36 * unitScale && spanY <= H - 36 * unitScale) {
      minX = (Math.min(...localCluster.map((p) => p.x)) + Math.max(...localCluster.map((p) => p.x))) * 0.5 - W * 0.5;
      minY = (Math.min(...localCluster.map((p) => p.y)) + Math.max(...localCluster.map((p) => p.y))) * 0.5 - H * 0.5;
    } else if (spanX >= spanY) {
      minX = seedPole.x - 32 * unitScale;
      const inBand = localCluster.filter((p) => p.x >= minX && p.x <= minX + W - 16 * unitScale);
      if (inBand.length > 0) {
        minY = (Math.min(...inBand.map((p) => p.y)) + Math.max(...inBand.map((p) => p.y))) * 0.5 - H * 0.5;
      }
    } else {
      const goNorth =
        localCluster.filter((p) => p.y > seedPole.y).length >=
        localCluster.filter((p) => p.y < seedPole.y).length;
      minY = goNorth ? seedPole.y - 32 * unitScale : seedPole.y - (H - 32 * unitScale);
      const inBand = localCluster.filter((p) => p.y >= minY && p.y <= minY + H - 16 * unitScale);
      if (inBand.length > 0) {
        minX = (Math.min(...inBand.map((p) => p.x)) + Math.max(...inBand.map((p) => p.x))) * 0.5 - W * 0.5;
      }
    }

    let seedBox: GridBoxBounds = { minX, maxX: minX + W, minY, maxY: minY + H };
    if (!placed.every((b) => !boxesOverlapInterior(seedBox, b, eps))) {
      const resolvedY = resolveNonOverlappingPosition(minX, minX + W, minY, false, W, H, placed);
      if (resolvedY !== null) {
        seedBox = { minX, maxX: minX + W, minY: resolvedY, maxY: resolvedY + H };
      } else {
        const resolvedX = resolveNonOverlappingPosition(minY, minY + H, minX, true, W, H, placed);
        if (resolvedX !== null) {
          seedBox = { minX: resolvedX, maxX: resolvedX + W, minY, maxY: minY + H };
        }
      }
    }

    placed.push(seedBox);
    const cov = getUncoveredInBox(seedBox, 0);
    if (cov.length === 0) {
      uncovered.delete(remIndices[0]);
    } else {
      for (const idx of cov) uncovered.delete(idx);
    }
  }

  return placed;
}

export function buildGridPagingBoxEntities(
  polePointsOutput: GridPoint[],
  obstaclePointsOutput: GridPoint[],
  usesRawCoordinates: boolean,
  dxfPair: (code: number, value: string | number) => string,
  dxfHandle: () => string,
  cadCoord: (value: number) => string,
  cadSize: (value: number) => string,
): { entities: string[]; points: GridPoint[] } {
  if (!polePointsOutput.length) {
    return { entities: [], points: [] };
  }

  const unitScale = usesRawCoordinates ? 1 / 111320 : 1.0;
  const W = GRID_WIDTH_METERS * unitScale;
  const H = GRID_HEIGHT_METERS * unitScale;

  const boxes = computeGridPagingBoxes(polePointsOutput, W, H);
  const entities: string[] = [];
  const points: GridPoint[] = [];

  const textHeight = 33.49242625 * unitScale;
  const textBoxWidth = 97.05089599 * unitScale;

  for (const box of boxes) {
    const { minX, maxX, minY, maxY } = box;

    // 1. Emit GRID LWPOLYLINE with the exact 6-vertex closed profile from sample LLD drawings
    const ySplit0 = minY + 150.78631386 * unitScale;
    const ySplit1 = minY + 151.60858476 * unitScale;

    entities.push(
      [
        dxfPair(0, "LWPOLYLINE"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "GRID"),
        dxfPair(6, "Continuous"),
        dxfPair(370, 25),
        dxfPair(100, "AcDbPolyline"),
        dxfPair(90, 6),
        dxfPair(70, 0),
        dxfPair(43, "0.0"),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(ySplit0)),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(minY)),
        dxfPair(10, cadCoord(minX)),
        dxfPair(20, cadCoord(minY)),
        dxfPair(10, cadCoord(minX)),
        dxfPair(20, cadCoord(maxY)),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(maxY)),
        dxfPair(10, cadCoord(maxX)),
        dxfPair(20, cadCoord(ySplit1)),
      ].join("\n"),
    );

    points.push(
      { x: minX, y: minY, z: 0 },
      { x: maxX, y: minY, z: 0 },
      { x: maxX, y: maxY, z: 0 },
      { x: minX, y: maxY, z: 0 },
    );

    // 2. Choose the cleanest of the 4 standard corners inside the GRID box for the "#" page number MTEXT
    // Attachment 71=2 is Top-Center, so the glyph extends downward from yAnchor by textHeight (~33.5m)
    const cornerCandidates = [
      {
        name: "BL",
        anchorX: minX + 21.53 * unitScale,
        anchorY: minY + 45.16 * unitScale,
        centerX: minX + 21.53 * unitScale,
        centerY: minY + 28.4 * unitScale,
        bias: 8 * unitScale, // Default preferred corner in sample DWGs
      },
      {
        name: "BR",
        anchorX: maxX - 28.5 * unitScale,
        anchorY: minY + 45.16 * unitScale,
        centerX: maxX - 28.5 * unitScale,
        centerY: minY + 28.4 * unitScale,
        bias: 2 * unitScale,
      },
      {
        name: "TL",
        anchorX: minX + 21.53 * unitScale,
        anchorY: maxY - 6.91 * unitScale,
        centerX: minX + 21.53 * unitScale,
        centerY: maxY - 23.6 * unitScale,
        bias: 1 * unitScale,
      },
      {
        name: "TR",
        anchorX: maxX - 28.5 * unitScale,
        anchorY: maxY - 6.91 * unitScale,
        centerX: maxX - 28.5 * unitScale,
        centerY: maxY - 23.6 * unitScale,
        bias: 0,
      },
    ];

    const boxObstacles = obstaclePointsOutput.filter(
      (pt) => pt.x >= minX - 10 * unitScale && pt.x <= maxX + 10 * unitScale && pt.y >= minY - 10 * unitScale && pt.y <= maxY + 10 * unitScale,
    );

    let bestCorner = cornerCandidates[0];
    let bestClearanceScore = -Infinity;

    for (const c of cornerCandidates) {
      let minDist = 80 * unitScale;
      for (const obs of boxObstacles) {
        const d = Math.hypot(obs.x - c.centerX, obs.y - c.centerY);
        if (d < minDist) minDist = d;
      }
      const score = minDist + c.bias;
      if (score > bestClearanceScore) {
        bestClearanceScore = score;
        bestCorner = c;
      }
    }

    entities.push(
      [
        dxfPair(0, "MTEXT"),
        dxfPair(5, dxfHandle()),
        dxfPair(100, "AcDbEntity"),
        dxfPair(8, "t-block"),
        dxfPair(100, "AcDbMText"),
        dxfPair(10, cadCoord(bestCorner.anchorX)),
        dxfPair(20, cadCoord(bestCorner.anchorY)),
        dxfPair(30, "0.0"),
        dxfPair(40, cadSize(textHeight)),
        dxfPair(41, cadSize(textBoxWidth)),
        dxfPair(46, "0.0"),
        dxfPair(71, 2),
        dxfPair(72, 5),
        dxfPair(1, "#"),
        dxfPair(7, "样式 1"),
        dxfPair(73, 1),
        dxfPair(44, "1.0"),
      ].join("\n"),
    );
  }

  return { entities, points };
}
