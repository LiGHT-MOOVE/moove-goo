# moove-goo

A compact browser-based editor for drawing connected goo blobs on a fixed 512px grid canvas, with vector SVG export.

<img src="public/moove-goo.png" alt="moove-goo editor screenshot" width="720">

## Features

- 512px by 512px p5 canvas with a 32 x 32 marker grid
- Add, select, drag, resize, and remove blobs
- Connect blobs with independently adjustable goo bridge thickness
- Edit, format, apply, and download validated project JSON
- Persist projects locally with Zustand and localStorage
- Export drawings as vector SVG paths

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- p5
- Zustand
- Zod

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm build
pnpm start
```

## Project Format

Projects use this JSON shape:

```ts
type GooProject = {
  version: 1;
  blobs: {
    id: string;
    gx: number;
    gy: number;
    radius: number;
  }[];
  connections: {
    id: string;
    aId: string;
    bId: string;
    gooThickness: number;
  }[];
};
```

## Architecture

- `app/components/GooBlobEditor.tsx` contains the client editor and p5 integration.
- `app/lib/blobs.ts` contains pure geometry and SVG path generation.
- `app/lib/project.ts` contains schema validation and project serialization.
- `app/store/gooStore.ts` contains persisted Zustand state.
