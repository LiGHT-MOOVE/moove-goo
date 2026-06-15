export type Blob = {
  id: string;
  gx: number;
  gy: number;
  radius: number;
};

export type Connection = {
  id: string;
  aId: string;
  bId: string;
  gooThickness: number;
};

export type Point = {
  x: number;
  y: number;
};

export type BlobPath = {
  id: string;
  blobIds: string[];
  connectionId: string | null;
  d: string;
};

export const CANVAS_SIZE = 512;
export const GRID_SIZE = 32;
export const DEFAULT_RADIUS = 48;
export const MIN_RADIUS = 8;
export const MAX_RADIUS = 160;
export const DEFAULT_GOO_THICKNESS = 0.45;
export const MIN_GOO_THICKNESS = 0.1;
export const MAX_GOO_THICKNESS = 1;
export const GOO_THICKNESS_STEP = 0.05;

const EPSILON = 0.001;

export function clampGridCoordinate(value: number): number {
  return Math.max(0, Math.min(GRID_SIZE - 1, Math.round(value)));
}

export function clampRadius(value: number): number {
  return Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(value)));
}

export function clampGooThickness(value: number): number {
  return Math.max(
    MIN_GOO_THICKNESS,
    Math.min(MAX_GOO_THICKNESS, Number(value.toFixed(2))),
  );
}

export function gridToCanvasPoint(gx: number, gy: number): Point {
  return {
    x: gridCoordinateToCanvasPosition(gx),
    y: gridCoordinateToCanvasPosition(gy),
  };
}

export function canvasPointToGrid(x: number, y: number): Pick<Blob, "gx" | "gy"> {
  return {
    gx: clampGridCoordinate((x / CANVAS_SIZE) * GRID_SIZE),
    gy: clampGridCoordinate((y / CANVAS_SIZE) * GRID_SIZE),
  };
}

export function gridCoordinateToCanvasPosition(coordinate: number): number {
  return (coordinate / GRID_SIZE) * CANVAS_SIZE;
}

export function generateBlobPaths(blobs: Blob[], connections: Connection[]): BlobPath[] {
  const blobById = new Map(blobs.map((blob) => [blob.id, blob]));
  const circlePaths = blobs.map((blob) => ({
    id: blob.id,
    blobIds: [blob.id],
    connectionId: null,
    d: circlePath(gridToCanvasPoint(blob.gx, blob.gy), blob.radius),
  }));
  const bridgePaths = connections.flatMap((connection) => {
    const blobA = blobById.get(connection.aId);
    const blobB = blobById.get(connection.bId);

    if (!blobA || !blobB) {
      return [];
    }

    return [
      {
        id: connection.id,
        blobIds: [blobA.id, blobB.id],
        connectionId: connection.id,
        d: connectedPairPath(blobA, blobB, connection.gooThickness),
      },
    ];
  });

  return [...bridgePaths, ...circlePaths];
}

export function blobPathsToSvg(paths: BlobPath[]): string {
  const pathMarkup = paths
    .map((path) => `  <path d="${escapeAttribute(path.d)}" fill="#111827" />`)
    .join("\n");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" role="img" aria-label="Goo blobs export">`,
    `  <rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="#ffffff" />`,
    pathMarkup || `  <path d="" fill="#111827" />`,
    `</svg>`,
  ].join("\n");
}

function connectedPairPath(blobA: Blob, blobB: Blob, gooThickness: number): string {
  const centerA = gridToCanvasPoint(blobA.gx, blobA.gy);
  const centerB = gridToCanvasPoint(blobB.gx, blobB.gy);
  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;
  const distance = Math.hypot(dx, dy);

  if (distance < EPSILON || distance <= Math.abs(blobA.radius - blobB.radius)) {
    return "";
  }

  // Goo bridge: thickness selects attachment angles, and bezier handles
  // follow circle tangents at those exact attachment points.
  const thickness = clampGooThickness(gooThickness);
  const centerAngle = Math.atan2(dy, dx);
  const overlapAngleA =
    distance < blobA.radius + blobB.radius
      ? Math.acos(
          clampUnit(
            (blobA.radius * blobA.radius + distance * distance - blobB.radius * blobB.radius) /
              (2 * blobA.radius * distance),
          ),
        )
      : 0;
  const overlapAngleB =
    distance < blobA.radius + blobB.radius
      ? Math.acos(
          clampUnit(
            (blobB.radius * blobB.radius + distance * distance - blobA.radius * blobA.radius) /
              (2 * blobB.radius * distance),
          ),
        )
      : 0;
  const tangentAngle = Math.acos(clampUnit((blobA.radius - blobB.radius) / distance));
  const angleATop =
    centerAngle + overlapAngleA + (tangentAngle - overlapAngleA) * thickness;
  const angleABottom =
    centerAngle - overlapAngleA - (tangentAngle - overlapAngleA) * thickness;
  const angleBTop =
    centerAngle +
    Math.PI -
    overlapAngleB -
    (Math.PI - overlapAngleB - tangentAngle) * thickness;
  const angleBBottom =
    centerAngle -
    Math.PI +
    overlapAngleB +
    (Math.PI - overlapAngleB - tangentAngle) * thickness;
  const aTop = pointOnCircle(centerA, blobA.radius, angleATop);
  const aBottom = pointOnCircle(centerA, blobA.radius, angleABottom);
  const bTop = pointOnCircle(centerB, blobB.radius, angleBTop);
  const bBottom = pointOnCircle(centerB, blobB.radius, angleBBottom);
  const handleScale =
    Math.min(thickness * 2.4, distanceBetween(aTop, bTop) / (blobA.radius + blobB.radius)) *
    Math.min(1, (distance * 2) / (blobA.radius + blobB.radius));
  const topControlA = add(aTop, vectorFromAngle(angleATop - Math.PI / 2, blobA.radius * handleScale));
  const topControlB = add(bTop, vectorFromAngle(angleBTop + Math.PI / 2, blobB.radius * handleScale));
  const bottomControlB = add(
    bBottom,
    vectorFromAngle(angleBBottom - Math.PI / 2, blobB.radius * handleScale),
  );
  const bottomControlA = add(
    aBottom,
    vectorFromAngle(angleABottom + Math.PI / 2, blobA.radius * handleScale),
  );

  return [
    `M ${formatPoint(aTop)}`,
    `C ${formatPoint(topControlA)} ${formatPoint(topControlB)} ${formatPoint(bTop)}`,
    `L ${formatPoint(bBottom)}`,
    `C ${formatPoint(bottomControlB)} ${formatPoint(bottomControlA)} ${formatPoint(aBottom)}`,
    "Z",
  ].join(" ");
}

function circlePath(center: Point, radius: number): string {
  const left = { x: center.x - radius, y: center.y };
  const right = { x: center.x + radius, y: center.y };

  return [
    `M ${formatPoint(right)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 1 0 ${formatPoint(left)}`,
    `A ${formatNumber(radius)} ${formatNumber(radius)} 0 1 0 ${formatPoint(right)}`,
    "Z",
  ].join(" ");
}

function pointOnCircle(center: Point, radius: number, angle: number): Point {
  return add(center, vectorFromAngle(angle, radius));
}

function vectorFromAngle(angle: number, length: number): Point {
  return {
    x: Math.cos(angle) * length,
    y: Math.sin(angle) * length,
  };
}

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function formatPoint(point: Point): string {
  return `${formatNumber(point.x)} ${formatNumber(point.y)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
