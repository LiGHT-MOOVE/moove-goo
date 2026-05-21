import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_GOO_THICKNESS, type Blob, type Connection } from "@/app/lib/blobs";
import {
  DEFAULT_PROJECT,
  type GooProject,
  createDefaultBlob,
  normalizeStoredGooProject,
} from "@/app/lib/project";

type GooStore = {
  project: GooProject;
  selectedBlobId: string | null;
  setProject: (project: GooProject) => void;
  resetProject: () => void;
  addBlob: (id: string, gx: number, gy: number) => void;
  updateBlob: (id: string, updater: (blob: Blob) => Blob) => void;
  removeBlob: (id: string) => void;
  addConnection: (connection: Omit<Connection, "gooThickness"> & Partial<Pick<Connection, "gooThickness">>) => void;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, updater: (connection: Connection) => Connection) => void;
  selectBlob: (id: string | null) => void;
};

export const useGooStore = create<GooStore>()(
  persist(
    (set, get) => ({
      project: DEFAULT_PROJECT,
      selectedBlobId: DEFAULT_PROJECT.blobs[0]?.id ?? null,
      setProject: (project) =>
        set((state) => ({
          project,
          selectedBlobId: project.blobs.some((blob) => blob.id === state.selectedBlobId)
            ? state.selectedBlobId
            : project.blobs[0]?.id ?? null,
        })),
      resetProject: () =>
        set({
          project: DEFAULT_PROJECT,
          selectedBlobId: DEFAULT_PROJECT.blobs[0]?.id ?? null,
        }),
      addBlob: (id, gx, gy) =>
        set((state) => ({
          project: {
            ...state.project,
            blobs: [...state.project.blobs, createDefaultBlob(id, gx, gy)],
          },
          selectedBlobId: id,
        })),
      updateBlob: (id, updater) =>
        set((state) => ({
          project: {
            ...state.project,
            blobs: state.project.blobs.map((blob) => (blob.id === id ? updater(blob) : blob)),
          },
        })),
      removeBlob: (id) =>
        set((state) => {
          const nextBlobs = state.project.blobs.filter((blob) => blob.id !== id);

          return {
            project: {
              ...state.project,
              blobs: nextBlobs,
              connections: state.project.connections.filter(
                (connection) => connection.aId !== id && connection.bId !== id,
              ),
            },
            selectedBlobId:
              state.selectedBlobId === id ? nextBlobs[0]?.id ?? null : state.selectedBlobId,
          };
        }),
      addConnection: (connection) =>
        set((state) => {
          if (
            state.project.connections.some(
              (candidate) =>
                (candidate.aId === connection.aId && candidate.bId === connection.bId) ||
                (candidate.aId === connection.bId && candidate.bId === connection.aId),
            )
          ) {
            return state;
          }

          return {
            project: {
              ...state.project,
              connections: [
                ...state.project.connections,
                {
                  id: connection.id,
                  aId: connection.aId,
                  bId: connection.bId,
                  gooThickness: connection.gooThickness ?? DEFAULT_GOO_THICKNESS,
                },
              ],
            },
          };
        }),
      removeConnection: (id) =>
        set((state) => ({
          project: {
            ...state.project,
            connections: state.project.connections.filter((connection) => connection.id !== id),
          },
        })),
      updateConnection: (id, updater) =>
        set((state) => ({
          project: {
            ...state.project,
            connections: state.project.connections.map((connection) =>
              connection.id === id ? updater(connection) : connection,
            ),
          },
        })),
      selectBlob: (id) => {
        const { project } = get();

        set({
          selectedBlobId: id && project.blobs.some((blob) => blob.id === id) ? id : null,
        });
      },
    }),
    {
      name: "goo-project-v1",
      partialize: (state) => ({ project: state.project }),
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<GooStore> & {
          project?: unknown;
          selectedBallId?: string | null;
        };
        const project = normalizeStoredGooProject(state.project);
        const selectedId = state.selectedBlobId ?? state.selectedBallId ?? null;

        return {
          ...state,
          project,
          selectedBlobId: project.blobs.some((blob) => blob.id === selectedId)
            ? selectedId
            : project.blobs[0]?.id ?? null,
        };
      },
    },
  ),
);
