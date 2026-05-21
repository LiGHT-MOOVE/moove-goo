<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Goo Blob Editor Coding Brief

## Project Context

This repository is a small Next.js app for a partner-based goo blob editor.

- Framework stack: Next `16.2.6`, React `19.2.4`, TypeScript strict mode, Tailwind CSS 4.
- Package manager: `pnpm`.
- Target experience: a compact, single-page creative tool, not a marketing page.

## Goal

Build a browser-based blob editor with a fixed `512px` by `512px` drawing canvas.

Users must be able to:

- Place blobs on a `32 x 32` logical marker grid.
- Use `16px` grid spacing across the 512px canvas.
- Add, remove, select, drag, and resize blobs.
- Assign each blob to zero or more partner blobs through connection records.
- Render connected goo bridges for every connection.
- Control the thickness of each goo bridge independently.
- Export the current blob drawing as SVG vector paths.

SVG export must preserve vectors. Do not export a raster image.

## Implementation Constraints

- Use a client component for all p5 integration because p5 depends on browser APIs.
- Keep Zustand/React as the source of truth for blobs, connections, and editor state.
- Persist the validated `GooProject` source of truth through the Zustand store using browser localStorage.
- Use p5 only for interactive canvas rendering.
- Avoid p5 SVG export plugins. Generate SVG from the same vector path geometry used for rendering.
- Install `p5`; add p5 typings only if TypeScript requires them after install.
- Keep geometry helpers independent from React and p5 so they can be tested separately.
- Keep the UI dense, practical, and tool-like.
- Use Tailwind utility classes directly in JSX for app styling; do not add custom CSS selectors or class-name constants for reusable styles.
- Do not reintroduce classic scalar-field metaballs, inverse-square fields, marching squares, contour sampling, or threshold controls.
- Treat SVG path data as derived output only. Do not use render paths as project state.

## Data Model Defaults

Use this model unless there is a strong local reason to adapt it:

```ts
type Blob = {
  id: string;
  gx: number;
  gy: number;
  radius: number;
};

type Connection = {
  id: string;
  aId: string;
  bId: string;
  gooThickness: number;
};

type GooProject = {
  version: 1;
  blobs: Blob[];
  connections: Connection[];
};
```

Rules and defaults:

- `gx` and `gy` are integer grid coordinates from `0` through `31`.
- Pixel center maps as `x = gx * 16`, `y = gy * 16`.
- Default radius: `48px`.
- Radius range: `8px` to `160px`.
- Default goo thickness per connection: `0.45`.
- Goo thickness range: `0.1` to `1.0`.
- A blob can participate in zero or more connections.
- Connection pairs are undirected; do not create duplicate A-B and B-A records.
- Goo thickness is connection state, not blob state.
- Removing a blob must remove every connection containing that blob.
- JSON project import/export must use the `GooProject` shape.
- Validate imported JSON with Zod, then normalize grid coordinates, radii, and goo thickness onto allowed ranges.
- Reject malformed project JSON, duplicate IDs, missing connection endpoints, self-connections, and duplicate undirected links.

## Rendering Algorithm

- Generate explicit SVG path data for rendering and export.
- Render every blob as a circle path.
- Render every connection as a closed bezier bridge path between its two blobs.
- The bridge must connect connected blobs at any distance without changing either blob radius.
- Goo thickness controls the bridge attachment angles as a fraction of the valid tangent span.
- Compute attachment points from the centers, radii, overlap angle, tangent angle, and per-connection goo thickness.
- Cubic bezier handles must leave each circle tangent to the circle at the attachment point, so the bridge sticks at the correct angle.
- Draw the generated paths filled on the p5 canvas through `Path2D`.
- Draw the `16px` grid and editable blob handles around the blob fill so editing remains clear.
- Reuse the exact generated path data for SVG export.

## Interaction Behavior

- Click an empty grid marker to add a blob.
- Click a blob handle to select that blob.
- Drag the selected blob to move it, snapping to grid coordinates.
- Provide a radius slider and/or numeric input for the selected blob.
- Provide an add-connection selector for the selected blob.
- List all selected-blob connections with partner label, remove button, and per-connection goo thickness controls.
- Provide a remove button for the selected blob.
- Support `Delete` and `Backspace` to remove the selected blob.
- Provide an export button that downloads a `512 x 512` SVG with `<path>` elements for the blob geometry.
- The Goo panel should show editable formatted project JSON, not raw SVG path data.
- JSON import should apply only when the user explicitly presses `Apply JSON`; the canvas must keep working while the draft JSON is invalid.
- Provide project JSON formatting and download controls.

## Expected Code Changes

- Keep `app/page.tsx` as a thin server component that renders the client editor.
- Keep the client-side editor component in `app/components/GooBlobEditor.tsx`.
- Keep pure geometry helpers for grid mapping, blob path creation, and SVG serialization in `app/lib/blobs.ts`.
- Keep project schema, serialization, and Zod validation helpers in `app/lib/project.ts`.
- Keep the persisted Zustand store in `app/store/gooStore.ts` with storage key `goo-project-v1`.
- Update `app/layout.tsx` metadata to describe the goo blob editor.
- Keep `app/globals.css` limited to the Tailwind import unless a future request explicitly needs global CSS.

## Verification

Run these checks before finishing implementation:

```bash
pnpm lint
pnpm build
```

Manually verify:

- The canvas is exactly `512px x 512px`.
- The visible grid aligns every `16px`.
- Add, select, drag, resize, multiple connection assignment, per-connection goo thickness, and delete all work.
- Reloading the page restores the last valid project from localStorage.
- Reset restores the default project and updates persisted storage.
- Editing valid project JSON and pressing `Apply JSON` updates the canvas and controls.
- Invalid JSON, duplicate IDs, and invalid links show errors without changing the current canvas.
- Downloaded project JSON can be pasted back into the Goo panel and applied.
- Connected blobs stay connected at long distances.
- Changing goo thickness changes only bridge thickness, not blob radius.
- Bridge curves attach tangent to the circles at visually correct angles.
- Unpartnered blobs remain separate.
- Exported SVG opens independently and contains vector `<path>` data.
- SVG output matches the p5 canvas paths.

## Assumptions

- `32 x 32 grid` means 32 placement markers per axis, with blob centers directly on grid intersections.
- SVG export should preserve circles and goo bridges as vector paths.
- A single-page editor is sufficient.
- Persistence, routing, authentication, backend APIs, and image export are out of scope unless explicitly requested.
