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

- Place balls on a `32 x 32` logical grid.
- Use `16px` grid spacing across the 512px canvas.
- Add, remove, select, drag, and resize balls.
- Assign each ball to zero or more partner balls through connection records.
- Render connected goo bridges for every connection.
- Control the thickness of each goo bridge independently.
- Export the current blob drawing as SVG vector paths.

SVG export must preserve vectors. Do not export a raster image.

## Implementation Constraints

- Use a client component for all p5 integration because p5 depends on browser APIs.
- Keep React as the source of truth for balls and editor state.
- Use p5 only for interactive canvas rendering.
- Avoid p5 SVG export plugins. Generate SVG from the same vector path geometry used for rendering.
- Install `p5`; add p5 typings only if TypeScript requires them after install.
- Keep geometry helpers independent from React and p5 so they can be tested separately.
- Keep the UI dense, practical, and tool-like.
- Do not reintroduce classic scalar-field metaballs, inverse-square fields, marching squares, contour sampling, or threshold controls.

## Data Model Defaults

Use this model unless there is a strong local reason to adapt it:

```ts
type Ball = {
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
```

Rules and defaults:

- `gx` and `gy` are integer grid coordinates from `0` through `31`.
- Pixel center maps as `x = gx * 16 + 8`, `y = gy * 16 + 8`.
- Default radius: `48px`.
- Radius range: `8px` to `160px`.
- Default goo thickness per connection: `0.45`.
- Goo thickness range: `0.1` to `1.0`.
- A ball can participate in zero or more connections.
- Connection pairs are undirected; do not create duplicate A-B and B-A records.
- Goo thickness is connection state, not ball state.
- Removing a ball must remove every connection containing that ball.

## Rendering Algorithm

- Generate explicit SVG path data for rendering and export.
- Render every ball as a circle path.
- Render every connection as a closed bezier bridge path between its two balls.
- The bridge must connect connected balls at any distance without changing either ball radius.
- Goo thickness controls the bridge attachment angles as a fraction of the valid tangent span.
- Compute attachment points from the centers, radii, overlap angle, tangent angle, and per-connection goo thickness.
- Cubic bezier handles must leave each circle tangent to the circle at the attachment point, so the bridge sticks at the correct angle.
- Draw the generated paths filled on the p5 canvas through `Path2D`.
- Draw the `16px` grid and editable ball handles around the blob fill so editing remains clear.
- Reuse the exact generated path data for SVG export.

## Interaction Behavior

- Click an empty grid cell to add a ball.
- Click a ball handle to select that ball.
- Drag the selected ball to move it, snapping to grid coordinates.
- Provide a radius slider and/or numeric input for the selected ball.
- Provide an add-connection selector for the selected ball.
- List all selected-ball connections with partner label, remove button, and per-connection goo thickness controls.
- Provide a remove button for the selected ball.
- Support `Delete` and `Backspace` to remove the selected ball.
- Provide an export button that downloads a `512 x 512` SVG with `<path>` elements for the blob geometry.

## Expected Code Changes

- Keep `app/page.tsx` as a thin server component that renders the client editor.
- Keep the client-side editor component in `app/components/GooBlobEditor.tsx`.
- Keep pure geometry helpers for grid mapping, blob path creation, and SVG serialization in `app/lib/blobs.ts`.
- Update `app/layout.tsx` metadata to describe the goo blob editor.
- Adjust `app/globals.css` only for app-level layout and Tailwind-compatible base styling.

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
- Connected balls stay connected at long distances.
- Changing goo thickness changes only bridge thickness, not ball radius.
- Bridge curves attach tangent to the circles at visually correct angles.
- Unpartnered balls remain separate.
- Exported SVG opens independently and contains vector `<path>` data.
- SVG output matches the p5 canvas paths.

## Assumptions

- `32 x 32 grid` means 32 placement cells per axis, with ball centers at cell centers.
- SVG export should preserve circles and goo bridges as vector paths.
- A single-page editor is sufficient.
- Persistence, routing, authentication, backend APIs, and image export are out of scope unless explicitly requested.
