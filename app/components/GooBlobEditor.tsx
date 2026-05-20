"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type P5 from "p5";
import {
  CANVAS_SIZE,
  DEFAULT_GOO_THICKNESS,
  DEFAULT_RADIUS,
  GOO_THICKNESS_STEP,
  MAX_GOO_THICKNESS,
  MAX_RADIUS,
  MIN_GOO_THICKNESS,
  MIN_RADIUS,
  type Ball,
  type BlobPath,
  type Connection,
  blobPathsToSvg,
  clampGooThickness,
  clampRadius,
  generateBlobPaths,
  gridToPixel,
  pixelToGrid,
} from "@/app/lib/blobs";

const INITIAL_BALLS: Ball[] = [
  { id: "ball-1", gx: 11, gy: 16, radius: 72 },
  { id: "ball-2", gx: 17, gy: 16, radius: 72 },
  { id: "ball-3", gx: 14, gy: 10, radius: 52 },
];

const INITIAL_CONNECTIONS: Connection[] = [
  {
    id: "connection-1",
    aId: "ball-1",
    bId: "ball-2",
    gooThickness: DEFAULT_GOO_THICKNESS,
  },
];

const HANDLE_RADIUS = 10;

export default function GooBlobEditor() {
  const [balls, setBalls] = useState<Ball[]>(INITIAL_BALLS);
  const [connections, setConnections] = useState<Connection[]>(INITIAL_CONNECTIONS);
  const [selectedBallId, setSelectedBallId] = useState<string | null>(INITIAL_BALLS[0].id);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const p5Ref = useRef<P5 | null>(null);
  const ballsRef = useRef<Ball[]>(balls);
  const connectionsRef = useRef<Connection[]>(connections);
  const blobPathsRef = useRef<BlobPath[]>(generateBlobPaths(balls, connections));
  const selectedBallIdRef = useRef<string | null>(selectedBallId);
  const draggingBallIdRef = useRef<string | null>(null);

  const selectedBall = balls.find((ball) => ball.id === selectedBallId) ?? null;
  const selectedConnections = useMemo(
    () =>
      selectedBallId
        ? connections.filter(
            (connection) =>
              connection.aId === selectedBallId || connection.bId === selectedBallId,
          )
        : [],
    [connections, selectedBallId],
  );
  const addableConnectionTargets = useMemo(() => {
    if (!selectedBallId) {
      return [];
    }

    return balls.filter(
      (ball) =>
        ball.id !== selectedBallId &&
        !connections.some((connection) =>
          connectionIncludesPair(connection, selectedBallId, ball.id),
        ),
    );
  }, [balls, connections, selectedBallId]);
  const blobPaths = useMemo(
    () => generateBlobPaths(balls, connections),
    [balls, connections],
  );

  const refreshBlobPaths = useCallback((nextBalls: Ball[], nextConnections: Connection[]) => {
    ballsRef.current = nextBalls;
    connectionsRef.current = nextConnections;
    blobPathsRef.current = generateBlobPaths(nextBalls, nextConnections);
    p5Ref.current?.redraw();
  }, []);

  const setSelected = useCallback((id: string | null) => {
    selectedBallIdRef.current = id;
    setSelectedBallId(id);
    p5Ref.current?.redraw();
  }, []);

  const setBallsAndRefresh = useCallback(
    (updater: (currentBalls: Ball[]) => Ball[]) => {
      setBalls((currentBalls) => {
        const nextBalls = updater(currentBalls);

        refreshBlobPaths(nextBalls, connectionsRef.current);

        return nextBalls;
      });
    },
    [refreshBlobPaths],
  );

  const setConnectionsAndRefresh = useCallback(
    (updater: (currentConnections: Connection[]) => Connection[]) => {
      setConnections((currentConnections) => {
        const nextConnections = updater(currentConnections);

        refreshBlobPaths(ballsRef.current, nextConnections);

        return nextConnections;
      });
    },
    [refreshBlobPaths],
  );

  const removeSelectedBall = useCallback(() => {
    const selectedId = selectedBallIdRef.current;

    if (!selectedId) {
      return;
    }

    const nextBalls = ballsRef.current.filter((ball) => ball.id !== selectedId);
    const nextConnections = connectionsRef.current.filter(
      (connection) => connection.aId !== selectedId && connection.bId !== selectedId,
    );

    setBalls(nextBalls);
    setConnections(nextConnections);
    refreshBlobPaths(nextBalls, nextConnections);
    setSelected(null);
    draggingBallIdRef.current = null;
  }, [refreshBlobPaths, setSelected]);

  const addBallAtNextOpenCell = useCallback(() => {
    const occupiedCells = new Set(ballsRef.current.map((ball) => `${ball.gx},${ball.gy}`));
    let target = { gx: 15, gy: 15 };

    for (let gy = 0; gy < 32; gy += 1) {
      for (let gx = 0; gx < 32; gx += 1) {
        if (!occupiedCells.has(`${gx},${gy}`)) {
          target = { gx, gy };
          gy = 32;
          break;
        }
      }
    }

    const id = createBallId();
    setBallsAndRefresh((currentBalls) => [
      ...currentBalls,
      {
        id,
        gx: target.gx,
        gy: target.gy,
        radius: DEFAULT_RADIUS,
      },
    ]);
    setSelected(id);
  }, [setBallsAndRefresh, setSelected]);

  const updateSelectedRadius = useCallback(
    (radius: number) => {
      const selectedId = selectedBallIdRef.current;

      if (!selectedId) {
        return;
      }

      setBallsAndRefresh((currentBalls) =>
        currentBalls.map((ball) =>
          ball.id === selectedId ? { ...ball, radius: clampRadius(radius) } : ball,
        ),
      );
    },
    [setBallsAndRefresh],
  );

  const addConnectionFromSelected = useCallback(
    (targetId: string) => {
      const selectedId = selectedBallIdRef.current;

      if (!selectedId || !targetId) {
        return;
      }

      setConnectionsAndRefresh((currentConnections) => {
        if (
          currentConnections.some((connection) =>
            connectionIncludesPair(connection, selectedId, targetId),
          )
        ) {
          return currentConnections;
        }

        return [
          ...currentConnections,
          {
            id: createConnectionId(),
            aId: selectedId,
            bId: targetId,
            gooThickness: DEFAULT_GOO_THICKNESS,
          },
        ];
      });
    },
    [setConnectionsAndRefresh],
  );

  const removeConnection = useCallback(
    (connectionId: string) => {
      setConnectionsAndRefresh((currentConnections) =>
        currentConnections.filter((connection) => connection.id !== connectionId),
      );
    },
    [setConnectionsAndRefresh],
  );

  const updateConnectionGooThickness = useCallback(
    (connectionId: string, value: number) => {
      const nextGooThickness = clampGooThickness(value);

      setConnectionsAndRefresh((currentConnections) =>
        currentConnections.map((connection) =>
          connection.id === connectionId
            ? { ...connection, gooThickness: nextGooThickness }
            : connection,
        ),
      );
    },
    [setConnectionsAndRefresh],
  );

  const resetSketch = useCallback(() => {
    const nextBalls = INITIAL_BALLS.map((ball) => ({ ...ball }));
    const nextConnections = INITIAL_CONNECTIONS.map((connection) => ({ ...connection }));

    setBalls(nextBalls);
    setConnections(nextConnections);
    refreshBlobPaths(nextBalls, nextConnections);
    setSelected(INITIAL_BALLS[0].id);
  }, [refreshBlobPaths, setSelected]);

  const exportSvg = useCallback(() => {
    const svg = blobPathsToSvg(blobPathsRef.current);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "goo-blobs.svg";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    refreshBlobPaths(balls, connections);
  }, [balls, blobPaths, connections, refreshBlobPaths]);

  useEffect(() => {
    selectedBallIdRef.current = selectedBallId;
    p5Ref.current?.redraw();
  }, [selectedBallId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }

      event.preventDefault();
      removeSelectedBall();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [removeSelectedBall]);

  useEffect(() => {
    let disposed = false;
    let sketchInstance: P5 | null = null;

    async function createSketch() {
      const p5Module = await import("p5");
      const P5Constructor = p5Module.default;
      const host = canvasHostRef.current;

      if (disposed || !host) {
        return;
      }

      const sketch = (p: P5) => {
        p.setup = () => {
          const canvas = p.createCanvas(CANVAS_SIZE, CANVAS_SIZE);
          canvas.elt.style.display = "block";
          canvas.elt.setAttribute("aria-label", "Goo blob editor canvas");
          p.pixelDensity(1);
          p.noLoop();
        };

        p.draw = () => {
          drawSketch(p, blobPathsRef.current, ballsRef.current, selectedBallIdRef.current);
        };

        p.mousePressed = () => {
          if (!isInsideCanvas(p.mouseX, p.mouseY)) {
            return;
          }

          const hitBall = findHitBall(p.mouseX, p.mouseY, ballsRef.current);

          if (hitBall) {
            draggingBallIdRef.current = hitBall.id;
            setSelected(hitBall.id);
            return;
          }

          const gridPosition = pixelToGrid(p.mouseX, p.mouseY);
          const gridBall = findBallAtGrid(gridPosition.gx, gridPosition.gy, ballsRef.current);

          if (gridBall) {
            setSelected(gridBall.id);
            return;
          }

          const id = createBallId();

          setBallsAndRefresh((currentBalls) => [
            ...currentBalls,
            {
              id,
              ...gridPosition,
              radius: DEFAULT_RADIUS,
            },
          ]);
          setSelected(id);
        };

        p.mouseDragged = () => {
          const draggingId = draggingBallIdRef.current;

          if (!draggingId || !isInsideCanvas(p.mouseX, p.mouseY)) {
            return;
          }

          const gridPosition = pixelToGrid(p.mouseX, p.mouseY);

          setBallsAndRefresh((currentBalls) =>
            currentBalls.map((ball) =>
              ball.id === draggingId ? { ...ball, ...gridPosition } : ball,
            ),
          );
        };

        p.mouseReleased = () => {
          draggingBallIdRef.current = null;
        };
      };

      sketchInstance = new P5Constructor(sketch, host);
      p5Ref.current = sketchInstance;
    }

    createSketch();

    return () => {
      disposed = true;
      sketchInstance?.remove();
      p5Ref.current = null;
    };
  }, [setBallsAndRefresh, setSelected]);

  return (
    <main className="min-h-full bg-[#f5f4ef] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-slate-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal text-slate-950">
              Goo Blob Editor
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="editor-button editor-button-secondary" onClick={resetSketch} type="button">
              Reset
            </button>
            <button className="editor-button editor-button-primary" onClick={exportSvg} type="button">
              Export SVG
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[512px_minmax(260px,1fr)]">
          <div className="overflow-auto">
            <div className="canvas-shell">
              <div ref={canvasHostRef} className="h-[512px] w-[512px]" />
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="control-panel">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-700">
                  Balls
                </h2>
                <button
                  className="editor-button editor-button-secondary h-9"
                  onClick={addBallAtNextOpenCell}
                  type="button"
                >
                  Add Ball
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                {balls.map((ball, index) => {
                  const isSelected = ball.id === selectedBallId;
                  const ballConnections = connections.filter((connection) =>
                    connectionIncludesBall(connection, ball.id),
                  );

                  return (
                    <button
                      className={`ball-row ${isSelected ? "ball-row-selected" : ""}`}
                      key={ball.id}
                      onClick={() => setSelected(ball.id)}
                      type="button"
                    >
                      <span className="font-medium">Ball {index + 1}</span>
                      <span className="text-slate-500">
                        {ball.gx}, {ball.gy} / {ball.radius}px / {ballConnections.length} links
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="control-panel">
              <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-700">
                Selected Ball
              </h2>

              {selectedBall ? (
                <div className="mt-4 grid gap-4">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Metric label="Grid X" value={selectedBall.gx} />
                    <Metric label="Grid Y" value={selectedBall.gy} />
                    <Metric label="Radius" value={`${selectedBall.radius}px`} />
                  </div>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Radius
                    <input
                      className="w-full accent-slate-950"
                      max={MAX_RADIUS}
                      min={MIN_RADIUS}
                      onChange={(event) => updateSelectedRadius(Number(event.target.value))}
                      type="range"
                      value={selectedBall.radius}
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Radius px
                    <input
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-slate-950"
                      max={MAX_RADIUS}
                      min={MIN_RADIUS}
                      onChange={(event) => updateSelectedRadius(Number(event.target.value))}
                      type="number"
                      value={selectedBall.radius}
                    />
                  </label>

                  {addableConnectionTargets.length > 0 ? (
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      Add connection
                      <select
                        className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-slate-950"
                        onChange={(event) => {
                          addConnectionFromSelected(event.target.value);
                          event.currentTarget.value = "";
                        }}
                        value=""
                      >
                        <option value="">Choose ball</option>
                        {addableConnectionTargets.map((ball) => (
                          <option key={ball.id} value={ball.id}>
                            {ballLabel(ball, balls)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="grid gap-3">
                    {selectedConnections.length > 0 ? (
                      selectedConnections.map((connection) => {
                        const otherBall = balls.find(
                          (ball) => ball.id === otherConnectionBallId(connection, selectedBall.id),
                        );

                        return (
                          <div className="connection-row" key={connection.id}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-800">
                                {otherBall ? ballLabel(otherBall, balls) : "Missing ball"}
                              </span>
                              <button
                                className="editor-button editor-button-danger h-8 min-h-8 px-2 text-xs"
                                onClick={() => removeConnection(connection.id)}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                            <label className="mt-3 grid gap-2 text-sm font-medium text-slate-700">
                              Goo thickness
                              <input
                                className="w-full accent-slate-950"
                                max={MAX_GOO_THICKNESS}
                                min={MIN_GOO_THICKNESS}
                                onChange={(event) =>
                                  updateConnectionGooThickness(
                                    connection.id,
                                    Number(event.target.value),
                                  )
                                }
                                step={GOO_THICKNESS_STEP}
                                type="range"
                                value={connection.gooThickness}
                              />
                            </label>
                            <label className="mt-3 grid gap-2 text-sm font-medium text-slate-700">
                              Goo thickness value
                              <input
                                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-slate-950"
                                max={MAX_GOO_THICKNESS}
                                min={MIN_GOO_THICKNESS}
                                onChange={(event) =>
                                  updateConnectionGooThickness(
                                    connection.id,
                                    Number(event.target.value),
                                  )
                                }
                                step={GOO_THICKNESS_STEP}
                                type="number"
                                value={connection.gooThickness}
                              />
                            </label>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-600">No connections.</p>
                    )}
                  </div>

                  <button
                    className="editor-button editor-button-danger"
                    onClick={removeSelectedBall}
                    type="button"
                  >
                    Remove Selected
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">No ball selected.</p>
              )}
            </section>

            <section className="control-panel">
              <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-700">
                Goo
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Metric label="Balls" value={balls.length} />
                <Metric label="Links" value={connections.length} />
                <Metric label="Paths" value={blobPaths.length} />
                <Metric label="Selected" value={selectedConnections.length} />
              </div>
              <code className="mt-4 block max-h-40 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                {blobPaths[0]?.d ?? "No path yet"}
              </code>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <span className="block text-xs text-slate-500">{label}</span>
      <span className="mt-1 block font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function drawSketch(p: P5, blobPaths: BlobPath[], balls: Ball[], selectedBallId: string | null) {
  p.background("#ffffff");
  const context = p.drawingContext as CanvasRenderingContext2D;

  context.save();
  context.fillStyle = "#111827";
  for (const blobPath of blobPaths) {
    if (blobPath.d) {
      context.fill(new Path2D(blobPath.d));
    }
  }
  context.restore();

  drawGrid(p);
  drawBallHandles(p, balls, selectedBallId);
}

function drawGrid(p: P5) {
  p.strokeWeight(1);

  for (let value = 0; value <= CANVAS_SIZE; value += 16) {
    const isMajorLine = value % 64 === 0;
    p.stroke(isMajorLine ? "#cbd5e1" : "#e5e7eb");
    p.line(value, 0, value, CANVAS_SIZE);
    p.line(0, value, CANVAS_SIZE, value);
  }

  p.noFill();
  p.stroke("#334155");
  p.strokeWeight(2);
  p.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function drawBallHandles(p: P5, balls: Ball[], selectedBallId: string | null) {
  for (const ball of balls) {
    const center = gridToPixel(ball.gx, ball.gy);
    const isSelected = ball.id === selectedBallId;

    p.noFill();
    p.stroke(isSelected ? "#0f766e" : "#94a3b8");
    p.strokeWeight(isSelected ? 2 : 1);
    p.circle(center.x, center.y, ball.radius * 2);

    p.stroke("#ffffff");
    p.strokeWeight(4);
    p.fill(isSelected ? "#14b8a6" : "#f97316");
    p.circle(center.x, center.y, HANDLE_RADIUS * 2);

    p.noStroke();
    p.fill("#0f172a");
    p.circle(center.x, center.y, 4);
  }
}

function findHitBall(x: number, y: number, balls: Ball[]): Ball | null {
  for (let index = balls.length - 1; index >= 0; index -= 1) {
    const ball = balls[index];
    const center = gridToPixel(ball.gx, ball.gy);
    const dx = x - center.x;
    const dy = y - center.y;

    if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + 2) {
      return ball;
    }
  }

  return null;
}

function findBallAtGrid(gx: number, gy: number, balls: Ball[]): Ball | null {
  return balls.find((ball) => ball.gx === gx && ball.gy === gy) ?? null;
}

function isInsideCanvas(x: number, y: number): boolean {
  return x >= 0 && x <= CANVAS_SIZE && y >= 0 && y <= CANVAS_SIZE;
}

function connectionIncludesBall(connection: Connection, ballId: string): boolean {
  return connection.aId === ballId || connection.bId === ballId;
}

function connectionIncludesPair(connection: Connection, aId: string, bId: string): boolean {
  return (
    (connection.aId === aId && connection.bId === bId) ||
    (connection.aId === bId && connection.bId === aId)
  );
}

function otherConnectionBallId(connection: Connection, ballId: string): string {
  return connection.aId === ballId ? connection.bId : connection.aId;
}

function ballLabel(ball: Ball, balls: Ball[]): string {
  return `Ball ${balls.findIndex((candidate) => candidate.id === ball.id) + 1}`;
}

function createBallId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `ball-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createConnectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `connection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
