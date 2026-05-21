import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_GOO_THICKNESS, type Ball, type Connection } from "@/app/lib/blobs";
import { DEFAULT_PROJECT, type GooProject, createDefaultBall } from "@/app/lib/project";

type GooStore = {
  project: GooProject;
  selectedBallId: string | null;
  setProject: (project: GooProject) => void;
  resetProject: () => void;
  addBall: (id: string, gx: number, gy: number) => void;
  updateBall: (id: string, updater: (ball: Ball) => Ball) => void;
  removeBall: (id: string) => void;
  addConnection: (connection: Omit<Connection, "gooThickness"> & Partial<Pick<Connection, "gooThickness">>) => void;
  removeConnection: (id: string) => void;
  updateConnection: (id: string, updater: (connection: Connection) => Connection) => void;
  selectBall: (id: string | null) => void;
};

export const useGooStore = create<GooStore>()(
  persist(
    (set, get) => ({
      project: DEFAULT_PROJECT,
      selectedBallId: DEFAULT_PROJECT.balls[0]?.id ?? null,
      setProject: (project) =>
        set((state) => ({
          project,
          selectedBallId: project.balls.some((ball) => ball.id === state.selectedBallId)
            ? state.selectedBallId
            : project.balls[0]?.id ?? null,
        })),
      resetProject: () =>
        set({
          project: DEFAULT_PROJECT,
          selectedBallId: DEFAULT_PROJECT.balls[0]?.id ?? null,
        }),
      addBall: (id, gx, gy) =>
        set((state) => ({
          project: {
            ...state.project,
            balls: [...state.project.balls, createDefaultBall(id, gx, gy)],
          },
          selectedBallId: id,
        })),
      updateBall: (id, updater) =>
        set((state) => ({
          project: {
            ...state.project,
            balls: state.project.balls.map((ball) => (ball.id === id ? updater(ball) : ball)),
          },
        })),
      removeBall: (id) =>
        set((state) => {
          const nextBalls = state.project.balls.filter((ball) => ball.id !== id);

          return {
            project: {
              ...state.project,
              balls: nextBalls,
              connections: state.project.connections.filter(
                (connection) => connection.aId !== id && connection.bId !== id,
              ),
            },
            selectedBallId:
              state.selectedBallId === id ? nextBalls[0]?.id ?? null : state.selectedBallId,
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
      selectBall: (id) => {
        const { project } = get();

        set({
          selectedBallId: id && project.balls.some((ball) => ball.id === id) ? id : null,
        });
      },
    }),
    {
      name: "goo-project-v1",
      partialize: (state) => ({ project: state.project }),
    },
  ),
);
