"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type P5 from "p5";
import {
  CANVAS_SIZE,
  DEFAULT_GOO_THICKNESS,
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
import { parseGooProject, serializeGooProject } from "@/app/lib/project";
import { useGooStore } from "@/app/store/gooStore";

const HANDLE_RADIUS = 10;

export default function GooBlobEditor() {
  const project = useGooStore((state) => state.project);
  const selectedBallId = useGooStore((state) => state.selectedBallId);
  const setProject = useGooStore((state) => state.setProject);
  const resetProject = useGooStore((state) => state.resetProject);
  const addBall = useGooStore((state) => state.addBall);
  const updateBall = useGooStore((state) => state.updateBall);
  const removeBall = useGooStore((state) => state.removeBall);
  const addConnection = useGooStore((state) => state.addConnection);
  const removeConnectionFromStore = useGooStore((state) => state.removeConnection);
  const updateConnection = useGooStore((state) => state.updateConnection);
  const selectBall = useGooStore((state) => state.selectBall);
  const balls = project.balls;
  const connections = project.connections;
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const p5Ref = useRef<P5 | null>(null);
  const ballsRef = useRef<Ball[]>(balls);
  const connectionsRef = useRef<Connection[]>(connections);
  const blobPathsRef = useRef<BlobPath[]>(generateBlobPaths(balls, connections));
  const selectedBallIdRef = useRef<string | null>(selectedBallId);
  const draggingBallIdRef = useRef<string | null>(null);
  const [projectJson, setProjectJson] = useState(() => serializeGooProject(project));
  const [projectJsonDirty, setProjectJsonDirty] = useState(false);
  const [projectJsonError, setProjectJsonError] = useState<string | null>(null);

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
  const currentProjectJson = useMemo(() => serializeGooProject(project), [project]);
  const visibleProjectJson = projectJsonDirty ? projectJson : currentProjectJson;

  const setSelected = useCallback(
    (id: string | null) => {
      selectedBallIdRef.current = id;
      selectBall(id);
      p5Ref.current?.redraw();
    },
    [selectBall],
  );

  const removeSelectedBall = useCallback(() => {
    const selectedId = selectedBallIdRef.current;

    if (!selectedId) {
      return;
    }

    removeBall(selectedId);
    draggingBallIdRef.current = null;
  }, [removeBall]);

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

    addBall(createBallId(), target.gx, target.gy);
  }, [addBall]);

  const updateSelectedRadius = useCallback(
    (radius: number) => {
      const selectedId = selectedBallIdRef.current;

      if (!selectedId) {
        return;
      }

      updateBall(selectedId, (ball) => ({ ...ball, radius: clampRadius(radius) }));
    },
    [updateBall],
  );

  const addConnectionFromSelected = useCallback(
    (targetId: string) => {
      const selectedId = selectedBallIdRef.current;

      if (!selectedId || !targetId) {
        return;
      }

      addConnection({
        id: createConnectionId(),
        aId: selectedId,
        bId: targetId,
        gooThickness: DEFAULT_GOO_THICKNESS,
      });
    },
    [addConnection],
  );

  const removeConnection = useCallback(
    (connectionId: string) => {
      removeConnectionFromStore(connectionId);
    },
    [removeConnectionFromStore],
  );

  const updateConnectionGooThickness = useCallback(
    (connectionId: string, value: number) => {
      updateConnection(connectionId, (connection) => ({
        ...connection,
        gooThickness: clampGooThickness(value),
      }));
    },
    [updateConnection],
  );

  const resetSketch = useCallback(() => {
    resetProject();
    draggingBallIdRef.current = null;
    setProjectJsonError(null);
    setProjectJsonDirty(false);
  }, [resetProject]);

  const applyProjectJson = useCallback(() => {
    const result = parseGooProject(visibleProjectJson);

    if (!result.ok) {
      setProjectJsonError(result.error);
      return;
    }

    setProject(result.project);
    setProjectJson(serializeGooProject(result.project));
    setProjectJsonDirty(false);
    setProjectJsonError(null);
    draggingBallIdRef.current = null;
  }, [setProject, visibleProjectJson]);

  const formatProjectJson = useCallback(() => {
    const result = parseGooProject(visibleProjectJson);

    if (!result.ok) {
      setProjectJsonError(result.error);
      return;
    }

    setProjectJson(serializeGooProject(result.project));
    setProjectJsonDirty(true);
    setProjectJsonError(null);
  }, [visibleProjectJson]);

  const downloadProjectJson = useCallback(() => {
    downloadTextFile(
      "goo-project.json",
      "application/json;charset=utf-8",
      serializeGooProject(project),
    );
  }, [project]);

  const updateProjectJsonDraft = useCallback(
    (value: string) => {
      setProjectJson(value);
      setProjectJsonDirty(true);

      if (projectJsonError) {
        setProjectJsonError(null);
      }
    },
    [projectJsonError],
  );

  const handleProjectJsonKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        applyProjectJson();
      }
    },
    [applyProjectJson],
  );

  const exportSvg = useCallback(() => {
    downloadTextFile(
      "goo-blobs.svg",
      "image/svg+xml;charset=utf-8",
      blobPathsToSvg(blobPathsRef.current),
    );
  }, []);

  useEffect(() => {
    ballsRef.current = balls;
    connectionsRef.current = connections;
    blobPathsRef.current = blobPaths;
    p5Ref.current?.redraw();
  }, [balls, blobPaths, connections]);

  useEffect(() => {
    selectedBallIdRef.current = selectedBallId;
    p5Ref.current?.redraw();
  }, [selectedBallId]);

  useEffect(() => {
    if (!selectedBallId || balls.some((ball) => ball.id === selectedBallId)) {
      return;
    }

    setSelected(balls[0]?.id ?? null);
  }, [balls, selectedBallId, setSelected]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
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

          addBall(createBallId(), gridPosition.gx, gridPosition.gy);
        };

        p.mouseDragged = () => {
          const draggingId = draggingBallIdRef.current;

          if (!draggingId || !isInsideCanvas(p.mouseX, p.mouseY)) {
            return;
          }

          const gridPosition = pixelToGrid(p.mouseX, p.mouseY);

          updateBall(draggingId, (ball) => ({ ...ball, ...gridPosition }));
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
  }, [addBall, setSelected, updateBall]);

  return (
    <main className="min-h-full bg-[#f5f4ef] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-5 py-6 lg:px-8">
        <header className="flex flex-col gap-3 border-b border-slate-300 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-normal text-slate-950">
              moove-goo
            </h2>
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

        <section className="grid flex-1 gap-5 lg:grid-cols-[512px_minmax(0,1fr)]">
          <div className="flex max-w-full flex-col gap-4 overflow-x-auto lg:overflow-visible">
            <div className="canvas-shell">
              <div ref={canvasHostRef} className="h-[512px] w-[512px]" />
            </div>

            <section className="control-panel w-[512px] max-w-full">
              <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-700">
                Project
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Balls" value={balls.length} />
                <Metric label="Links" value={connections.length} />
                <Metric label="Paths" value={blobPaths.length} />
                <Metric label="Selected" value={selectedConnections.length} />
              </div>

              <label className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
                Project JSON
                <textarea
                  className="project-json-editor"
                  onChange={(event) => updateProjectJsonDraft(event.target.value)}
                  onKeyDown={handleProjectJsonKeyDown}
                  spellCheck={false}
                  value={visibleProjectJson}
                />
              </label>

              {projectJsonError ? (
                <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {projectJsonError}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="editor-button editor-button-primary h-9"
                  onClick={applyProjectJson}
                  type="button"
                >
                  Apply JSON
                </button>
                <button
                  className="editor-button editor-button-secondary h-9"
                  onClick={formatProjectJson}
                  type="button"
                >
                  Format
                </button>
                <button
                  className="editor-button editor-button-secondary h-9"
                  onClick={downloadProjectJson}
                  type="button"
                >
                  Download JSON
                </button>
              </div>
            </section>
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

function downloadTextFile(filename: string, type: string, content: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
