import { z } from "zod";
import {
  DEFAULT_RADIUS,
  type Blob,
  type Connection,
  clampGooThickness,
  clampGridCoordinate,
  clampRadius,
} from "@/app/lib/blobs";

export type GooProject = {
  version: 1;
  blobs: Blob[];
  connections: Connection[];
};

export type GooProjectParseResult =
  | { ok: true; project: GooProject }
  | { ok: false; error: string };

const rawBlobSchema = z.object({
  id: z.string().trim().min(1, "Blob id is required"),
  gx: z.coerce.number().finite("Grid X must be a number"),
  gy: z.coerce.number().finite("Grid Y must be a number"),
  radius: z.coerce.number().finite("Radius must be a number"),
});

const rawConnectionSchema = z.object({
  id: z.string().trim().min(1, "Connection id is required"),
  aId: z.string().trim().min(1, "Connection aId is required"),
  bId: z.string().trim().min(1, "Connection bId is required"),
  gooThickness: z.coerce.number().finite("Goo thickness must be a number"),
});

const rawProjectSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const project = value as Record<string, unknown>;

    if (!("blobs" in project) && Array.isArray(project.balls)) {
      return {
        ...project,
        blobs: project.balls,
      };
    }

    return value;
  },
  z.object({
    version: z.literal(1),
    blobs: z.array(rawBlobSchema),
    connections: z.array(rawConnectionSchema),
  }),
);

const DEFAULT_BLOBS: Blob[] = [
  { id: "blob-top-left", gx: 9, gy: 5, radius: 56 },
  { id: "blob-top-right", gx: 22, gy: 5, radius: 56 },
  { id: "blob-mid-left", gx: 9, gy: 16, radius: 56 },
  { id: "blob-mid-right", gx: 21, gy: 16, radius: 56 },
  { id: "blob-bottom-left", gx: 9, gy: 26, radius: 56 },
];

const DEFAULT_CONNECTIONS: Connection[] = [
  {
    id: "connection-top-left-top-right",
    aId: "blob-top-left",
    bId: "blob-top-right",
    gooThickness: 0.55,
  },
  {
    id: "connection-mid-left-top-left",
    aId: "blob-mid-left",
    bId: "blob-top-left",
    gooThickness: 0.5,
  },
  {
    id: "connection-mid-right-mid-left",
    aId: "blob-mid-right",
    bId: "blob-mid-left",
    gooThickness: 0.5,
  },
  {
    id: "connection-bottom-left-mid-left",
    aId: "blob-bottom-left",
    bId: "blob-mid-left",
    gooThickness: 0.45,
  },
];

export const DEFAULT_PROJECT: GooProject = createGooProject(
  DEFAULT_BLOBS,
  DEFAULT_CONNECTIONS,
);

export function createGooProject(blobs: Blob[], connections: Connection[]): GooProject {
  return {
    version: 1,
    blobs: blobs.map((blob) => ({
      id: blob.id,
      gx: clampGridCoordinate(blob.gx),
      gy: clampGridCoordinate(blob.gy),
      radius: clampRadius(blob.radius),
    })),
    connections: connections.map((connection) => ({
      id: connection.id,
      aId: connection.aId,
      bId: connection.bId,
      gooThickness: clampGooThickness(connection.gooThickness),
    })),
  };
}

export function serializeGooProject(project: GooProject): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function parseGooProject(json: string): GooProjectParseResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }

  const parsedProject = rawProjectSchema.safeParse(parsedJson);

  if (!parsedProject.success) {
    return {
      ok: false,
      error: z.prettifyError(parsedProject.error),
    };
  }

  return validateAndNormalizeProject(parsedProject.data);
}

export function normalizeStoredGooProject(value: unknown): GooProject {
  const parsedProject = rawProjectSchema.safeParse(value);

  if (!parsedProject.success) {
    return DEFAULT_PROJECT;
  }

  const result = validateAndNormalizeProject(parsedProject.data);

  return result.ok ? result.project : DEFAULT_PROJECT;
}

function validateAndNormalizeProject(project: z.infer<typeof rawProjectSchema>): GooProjectParseResult {
  const blobIds = new Set<string>();
  const connectionIds = new Set<string>();
  const connectionPairs = new Set<string>();

  for (const blob of project.blobs) {
    if (blobIds.has(blob.id)) {
      return { ok: false, error: `Duplicate blob id "${blob.id}".` };
    }

    blobIds.add(blob.id);
  }

  for (const connection of project.connections) {
    if (connectionIds.has(connection.id)) {
      return { ok: false, error: `Duplicate connection id "${connection.id}".` };
    }

    if (connection.aId === connection.bId) {
      return {
        ok: false,
        error: `Connection "${connection.id}" cannot link a blob to itself.`,
      };
    }

    if (!blobIds.has(connection.aId) || !blobIds.has(connection.bId)) {
      return {
        ok: false,
        error: `Connection "${connection.id}" references a missing blob.`,
      };
    }

    const pairKey = [connection.aId, connection.bId].sort().join(":");

    if (connectionPairs.has(pairKey)) {
      return {
        ok: false,
        error: `Duplicate connection between "${connection.aId}" and "${connection.bId}".`,
      };
    }

    connectionIds.add(connection.id);
    connectionPairs.add(pairKey);
  }

  return {
    ok: true,
    project: createGooProject(
      project.blobs.map((blob) => ({
        id: blob.id,
        gx: blob.gx,
        gy: blob.gy,
        radius: blob.radius,
      })),
      project.connections.map((connection) => ({
        id: connection.id,
        aId: connection.aId,
        bId: connection.bId,
        gooThickness: connection.gooThickness,
      })),
    ),
  };
}

export function createDefaultBlob(id: string, gx: number, gy: number): Blob {
  return {
    id,
    gx: clampGridCoordinate(gx),
    gy: clampGridCoordinate(gy),
    radius: DEFAULT_RADIUS,
  };
}
