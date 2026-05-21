import { z } from "zod";
import {
  DEFAULT_GOO_THICKNESS,
  DEFAULT_RADIUS,
  type Ball,
  type Connection,
  clampGooThickness,
  clampGridCoordinate,
  clampRadius,
} from "@/app/lib/blobs";

export type GooProject = {
  version: 1;
  balls: Ball[];
  connections: Connection[];
};

export type GooProjectParseResult =
  | { ok: true; project: GooProject }
  | { ok: false; error: string };

const rawBallSchema = z.object({
  id: z.string().trim().min(1, "Ball id is required"),
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

const rawProjectSchema = z.object({
  version: z.literal(1),
  balls: z.array(rawBallSchema),
  connections: z.array(rawConnectionSchema),
});

const DEFAULT_BALLS: Ball[] = [
  { id: "ball-1", gx: 11, gy: 16, radius: 72 },
  { id: "ball-2", gx: 17, gy: 16, radius: 72 },
  { id: "ball-3", gx: 14, gy: 10, radius: 52 },
];

const DEFAULT_CONNECTIONS: Connection[] = [
  {
    id: "connection-1",
    aId: "ball-1",
    bId: "ball-2",
    gooThickness: DEFAULT_GOO_THICKNESS,
  },
];

export const DEFAULT_PROJECT: GooProject = createGooProject(
  DEFAULT_BALLS,
  DEFAULT_CONNECTIONS,
);

export function createGooProject(balls: Ball[], connections: Connection[]): GooProject {
  return {
    version: 1,
    balls: balls.map((ball) => ({
      id: ball.id,
      gx: clampGridCoordinate(ball.gx),
      gy: clampGridCoordinate(ball.gy),
      radius: clampRadius(ball.radius),
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

function validateAndNormalizeProject(project: z.infer<typeof rawProjectSchema>): GooProjectParseResult {
  const ballIds = new Set<string>();
  const connectionIds = new Set<string>();
  const connectionPairs = new Set<string>();

  for (const ball of project.balls) {
    if (ballIds.has(ball.id)) {
      return { ok: false, error: `Duplicate ball id "${ball.id}".` };
    }

    ballIds.add(ball.id);
  }

  for (const connection of project.connections) {
    if (connectionIds.has(connection.id)) {
      return { ok: false, error: `Duplicate connection id "${connection.id}".` };
    }

    if (connection.aId === connection.bId) {
      return {
        ok: false,
        error: `Connection "${connection.id}" cannot link a ball to itself.`,
      };
    }

    if (!ballIds.has(connection.aId) || !ballIds.has(connection.bId)) {
      return {
        ok: false,
        error: `Connection "${connection.id}" references a missing ball.`,
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
      project.balls.map((ball) => ({
        id: ball.id,
        gx: ball.gx,
        gy: ball.gy,
        radius: ball.radius,
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

export function createDefaultBall(id: string, gx: number, gy: number): Ball {
  return {
    id,
    gx: clampGridCoordinate(gx),
    gy: clampGridCoordinate(gy),
    radius: DEFAULT_RADIUS,
  };
}
