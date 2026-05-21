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
  type Blob,
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
  const selectedBlobId = useGooStore((state) => state.selectedBlobId);
  const setProject = useGooStore((state) => state.setProject);
  const resetProject = useGooStore((state) => state.resetProject);
  const addBlob = useGooStore((state) => state.addBlob);
  const updateBlob = useGooStore((state) => state.updateBlob);
  const removeBlob = useGooStore((state) => state.removeBlob);
  const addConnection = useGooStore((state) => state.addConnection);
  const removeConnectionFromStore = useGooStore((state) => state.removeConnection);
  const updateConnection = useGooStore((state) => state.updateConnection);
  const selectBlob = useGooStore((state) => state.selectBlob);
  const blobs = project.blobs;
  const connections = project.connections;
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const p5Ref = useRef<P5 | null>(null);
  const blobsRef = useRef<Blob[]>(blobs);
  const connectionsRef = useRef<Connection[]>(connections);
  const blobPathsRef = useRef<BlobPath[]>(generateBlobPaths(blobs, connections));
  const selectedBlobIdRef = useRef<string | null>(selectedBlobId);
  const draggingBlobIdRef = useRef<string | null>(null);
  const [projectJson, setProjectJson] = useState(() => serializeGooProject(project));
  const [projectJsonDirty, setProjectJsonDirty] = useState(false);
  const [projectJsonError, setProjectJsonError] = useState<string | null>(null);

  const selectedBlob = blobs.find((blob) => blob.id === selectedBlobId) ?? null;
  const selectedConnections = useMemo(
    () =>
      selectedBlobId
        ? connections.filter(
            (connection) =>
              connection.aId === selectedBlobId || connection.bId === selectedBlobId,
          )
        : [],
    [connections, selectedBlobId],
  );
  const addableConnectionTargets = useMemo(() => {
    if (!selectedBlobId) {
      return [];
    }

    return blobs.filter(
      (blob) =>
        blob.id !== selectedBlobId &&
        !connections.some((connection) =>
          connectionIncludesPair(connection, selectedBlobId, blob.id),
        ),
    );
  }, [blobs, connections, selectedBlobId]);
  const blobPaths = useMemo(
    () => generateBlobPaths(blobs, connections),
    [blobs, connections],
  );
  const currentProjectJson = useMemo(() => serializeGooProject(project), [project]);
  const visibleProjectJson = projectJsonDirty ? projectJson : currentProjectJson;

  const setSelected = useCallback(
    (id: string | null) => {
      selectedBlobIdRef.current = id;
      selectBlob(id);
      p5Ref.current?.redraw();
    },
    [selectBlob],
  );

  const removeSelectedBlob = useCallback(() => {
    const selectedId = selectedBlobIdRef.current;

    if (!selectedId) {
      return;
    }

    removeBlob(selectedId);
    draggingBlobIdRef.current = null;
  }, [removeBlob]);

  const addBlobAtNextOpenCell = useCallback(() => {
    const occupiedCells = new Set(blobsRef.current.map((blob) => `${blob.gx},${blob.gy}`));
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

    addBlob(createBlobId(), target.gx, target.gy);
  }, [addBlob]);

  const updateSelectedRadius = useCallback(
    (radius: number) => {
      const selectedId = selectedBlobIdRef.current;

      if (!selectedId) {
        return;
      }

      updateBlob(selectedId, (blob) => ({ ...blob, radius: clampRadius(radius) }));
    },
    [updateBlob],
  );

  const addConnectionFromSelected = useCallback(
    (targetId: string) => {
      const selectedId = selectedBlobIdRef.current;

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
    draggingBlobIdRef.current = null;
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
    draggingBlobIdRef.current = null;
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
    blobsRef.current = blobs;
    connectionsRef.current = connections;
    blobPathsRef.current = blobPaths;
    p5Ref.current?.redraw();
  }, [blobs, blobPaths, connections]);

  useEffect(() => {
    selectedBlobIdRef.current = selectedBlobId;
    p5Ref.current?.redraw();
  }, [selectedBlobId]);

  useEffect(() => {
    if (!selectedBlobId || blobs.some((blob) => blob.id === selectedBlobId)) {
      return;
    }

    setSelected(blobs[0]?.id ?? null);
  }, [blobs, selectedBlobId, setSelected]);

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
      removeSelectedBlob();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [removeSelectedBlob]);

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
          canvas.class("block h-[512px] w-[512px]");
          canvas.elt.setAttribute("aria-label", "Goo blob editor canvas");
          p.pixelDensity(1);
          p.noLoop();
        };

        p.draw = () => {
          drawSketch(p, blobPathsRef.current, blobsRef.current, selectedBlobIdRef.current);
        };

        p.mousePressed = () => {
          if (!isInsideCanvas(p.mouseX, p.mouseY)) {
            return;
          }

          const hitBlob = findHitBlob(p.mouseX, p.mouseY, blobsRef.current);

          if (hitBlob) {
            draggingBlobIdRef.current = hitBlob.id;
            setSelected(hitBlob.id);
            return;
          }

          const gridPosition = pixelToGrid(p.mouseX, p.mouseY);
          const gridBlob = findBlobAtGrid(gridPosition.gx, gridPosition.gy, blobsRef.current);

          if (gridBlob) {
            setSelected(gridBlob.id);
            return;
          }

          addBlob(createBlobId(), gridPosition.gx, gridPosition.gy);
        };

        p.mouseDragged = () => {
          const draggingId = draggingBlobIdRef.current;

          if (!draggingId || !isInsideCanvas(p.mouseX, p.mouseY)) {
            return;
          }

          const gridPosition = pixelToGrid(p.mouseX, p.mouseY);

          updateBlob(draggingId, (blob) => ({ ...blob, ...gridPosition }));
        };

        p.mouseReleased = () => {
          draggingBlobIdRef.current = null;
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
  }, [addBlob, setSelected, updateBlob]);

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
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
              onClick={resetSketch}
              type="button"
            >
              Reset
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-transparent bg-gray-900 px-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-700"
              onClick={exportSvg}
              type="button"
            >
              Export SVG
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[512px_minmax(0,1fr)]">
          <div className="flex max-w-full flex-col gap-4 overflow-x-auto lg:overflow-visible">
            <div className="h-[512px] w-[512px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_18px_45px_rgb(15_23_42_/_0.14)]">
              <div ref={canvasHostRef} className="h-[512px] w-[512px]" />
            </div>

            <section className="w-[512px] max-w-full rounded-lg border border-slate-300 bg-white/80 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-700">
                Project
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Blobs" value={blobs.length} />
                <Metric label="Links" value={connections.length} />
                <Metric label="Paths" value={blobPaths.length} />
                <Metric label="Selected" value={selectedConnections.length} />
              </div>

              <label className="mt-4 grid gap-2 text-sm font-medium text-slate-700">
                Project JSON
                <textarea
                  className="min-h-[260px] resize-y rounded-md border border-slate-300 bg-slate-900 p-3 font-mono text-xs leading-[1.55] text-slate-50 outline-none [tab-size:2] focus:border-teal-700 focus:shadow-[0_0_0_3px_rgb(20_184_166_/_0.16)]"
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
                  className="inline-flex h-9 min-h-9 items-center justify-center rounded-md border border-transparent bg-gray-900 px-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-slate-700"
                  onClick={applyProjectJson}
                  type="button"
                >
                  Apply JSON
                </button>
                <button
                  className="inline-flex h-9 min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                  onClick={formatProjectJson}
                  type="button"
                >
                  Format
                </button>
                <button
                  className="inline-flex h-9 min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                  onClick={downloadProjectJson}
                  type="button"
                >
                  Download JSON
                </button>
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <section className="rounded-lg border border-slate-300 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-700">
                  Blobs
                </h2>
                <button
                  className="inline-flex h-9 min-h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-950 transition-colors duration-150 hover:border-slate-400 hover:bg-slate-50"
                  onClick={addBlobAtNextOpenCell}
                  type="button"
                >
                  Add Blob
                </button>
              </div>

              <div className="mt-4 grid gap-2">
                {blobs.map((blob, index) => {
                  const isSelected = blob.id === selectedBlobId;
                  const blobConnections = connections.filter((connection) =>
                    connectionIncludesBlob(connection, blob.id),
                  );

                  return (
                    <button
                      className={`flex min-h-[42px] items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 text-left hover:border-slate-400 ${
                        isSelected ? "border-teal-700 bg-teal-50 hover:border-teal-700" : ""
                      }`}
                      key={blob.id}
                      onClick={() => setSelected(blob.id)}
                      type="button"
                    >
                      <span className="font-medium">Blob {index + 1}</span>
                      <span className="text-slate-500">
                        {blob.gx}, {blob.gy} / {blob.radius}px / {blobConnections.length} links
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-slate-300 bg-white/80 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-normal text-slate-700">
                Selected Blob
              </h2>

              {selectedBlob ? (
                <div className="mt-4 grid gap-4">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <Metric label="Grid X" value={selectedBlob.gx} />
                    <Metric label="Grid Y" value={selectedBlob.gy} />
                    <Metric label="Radius" value={`${selectedBlob.radius}px`} />
                  </div>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Radius
                    <input
                      className="w-full accent-slate-950"
                      max={MAX_RADIUS}
                      min={MIN_RADIUS}
                      onChange={(event) => updateSelectedRadius(Number(event.target.value))}
                      type="range"
                      value={selectedBlob.radius}
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
                      value={selectedBlob.radius}
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
                        <option value="">Choose blob</option>
                        {addableConnectionTargets.map((blob) => (
                          <option key={blob.id} value={blob.id}>
                            {blobLabel(blob, blobs)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="grid gap-3">
                    {selectedConnections.length > 0 ? (
                      selectedConnections.map((connection) => {
                        const otherBlob = blobs.find(
                          (blob) => blob.id === otherConnectionBlobId(connection, selectedBlob.id),
                        );

                        return (
                          <div
                            className="rounded-md border border-slate-200 bg-white p-3"
                            key={connection.id}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-800">
                                {otherBlob ? blobLabel(otherBlob, blobs) : "Missing blob"}
                              </span>
                              <button
                                className="inline-flex h-8 min-h-8 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 transition-colors duration-150 hover:border-rose-400 hover:bg-rose-100"
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
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700 transition-colors duration-150 hover:border-rose-400 hover:bg-rose-100"
                    onClick={removeSelectedBlob}
                    type="button"
                  >
                    Remove Selected
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-600">No blob selected.</p>
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

function drawSketch(p: P5, blobPaths: BlobPath[], blobs: Blob[], selectedBlobId: string | null) {
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
  drawBlobHandles(p, blobs, selectedBlobId);
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
  p.stroke("#cbd5e1");
  p.strokeWeight(1);
  p.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function drawBlobHandles(p: P5, blobs: Blob[], selectedBlobId: string | null) {
  for (const blob of blobs) {
    const center = gridToPixel(blob.gx, blob.gy);
    const isSelected = blob.id === selectedBlobId;

    p.noFill();
    p.stroke(isSelected ? "#0f766e" : "#94a3b8");
    p.strokeWeight(isSelected ? 2 : 1);
    p.circle(center.x, center.y, blob.radius * 2);

    p.stroke("#ffffff");
    p.strokeWeight(4);
    p.fill(isSelected ? "#14b8a6" : "#f97316");
    p.circle(center.x, center.y, HANDLE_RADIUS * 2);

    p.noStroke();
    p.fill("#0f172a");
    p.circle(center.x, center.y, 4);
  }
}

function findHitBlob(x: number, y: number, blobs: Blob[]): Blob | null {
  for (let index = blobs.length - 1; index >= 0; index -= 1) {
    const blob = blobs[index];
    const center = gridToPixel(blob.gx, blob.gy);
    const dx = x - center.x;
    const dy = y - center.y;

    if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_RADIUS + 2) {
      return blob;
    }
  }

  return null;
}

function findBlobAtGrid(gx: number, gy: number, blobs: Blob[]): Blob | null {
  return blobs.find((blob) => blob.gx === gx && blob.gy === gy) ?? null;
}

function isInsideCanvas(x: number, y: number): boolean {
  return x >= 0 && x <= CANVAS_SIZE && y >= 0 && y <= CANVAS_SIZE;
}

function connectionIncludesBlob(connection: Connection, blobId: string): boolean {
  return connection.aId === blobId || connection.bId === blobId;
}

function connectionIncludesPair(connection: Connection, aId: string, bId: string): boolean {
  return (
    (connection.aId === aId && connection.bId === bId) ||
    (connection.aId === bId && connection.bId === aId)
  );
}

function otherConnectionBlobId(connection: Connection, blobId: string): string {
  return connection.aId === blobId ? connection.bId : connection.aId;
}

function blobLabel(blob: Blob, blobs: Blob[]): string {
  return `Blob ${blobs.findIndex((candidate) => candidate.id === blob.id) + 1}`;
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

function createBlobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `blob-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createConnectionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `connection-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
