# AGENTS.md — blockly-layers

Guidance for working on this repo. For _why_ things are built the way they are (and known gaps), see [`decisions.md`](./decisions.md). For the public API as documented for consumers, see [`README.md`](./README.md).

## What this is

A standalone Blockly plugin (bootstrapped from `@blockly/create-package`, not part of the Blockly monorepo) that adds a configurable, Photoshop-style "layers" panel to a workspace: checking a layer opens a second, synced workspace showing just the blocks of that layer's configured types.

## Commands

Run from the repo root:

```bash
npm start        # webpack dev server serving test/index.html, hot reload
npm test         # bundle test/*.mocha.js with webpack, run under Mocha
npm run build    # production build into dist/
npm run clean    # remove dist/ and build/
```

There is no lint script configured in this package — don't assume one exists.

## Layout

```
src/
  index.ts             # public entry point — re-exports LayersPlugin + types
  layer_types.ts        # LayerDefinition / LayersPluginOptions config types
  layers_plugin.ts       # LayersPlugin: public API, owns panel + workspace controller
  layer_panel.ts          # floating checkbox panel (IPositionable)
  layer_workspace.ts       # creates/shows/hides the shared secondary workspace
  sync_engine.ts            # bidirectional main<->layer-workspace reconciliation
  block_matcher.ts           # pure functions: which blocks match the active layers
test/
  index.ts             # playground setup (demo toolbox + seeded blocks)
  index.html            # playground page served by `npm start`
  block_matcher.mocha.js # unit tests for block_matcher.ts
```

`src/index.ts` is the only module an app is meant to import from
(`import {LayersPlugin} from 'blockly-layers'`) — treat the rest of `src/`
as internal.

## Architecture, briefly

- The **main workspace** is the app's normal, always-visible workspace.
- The **layer workspace** is a single secondary `WorkspaceSvg`, created lazily on first use, showing the union of every currently-checked layer's block types (plus each matched block's full nested contents).
- A mirrored block keeps the **same block ID** in both workspaces — IDs are only unique within one workspace in Blockly core, so this works and lets all sync bookkeeping be keyed off a plain ID instead of a mapping table.
- `SyncEngine` propagates changes two ways:
  - **Field/variable edits** (`BLOCK_CHANGE`, `VAR_*`) are relayed directly and cheaply by cloning the event onto the other workspace.
  - **Structural changes** (create/delete/reconnect) go through a debounced reconciliation pass that diffs each mirrored block's serialized content against what was last synced, so only blocks that actually changed are touched. This is what lets a user's dragged position in the layer workspace survive unrelated edits elsewhere.
- `block_matcher.ts` is the only place that decides "does this block belong to an active layer" — it's pure and has no workspace side effects, which is why it's the one thing with unit tests today.

Read `sync_engine.ts`'s file-level comment before changing its behavior — it explains the two propagation paths and why the position-preserving replace pattern exists.

## Testing

- `blockly-scripts test` only picks up files directly in `test/` named `*.mocha.js` (no subdirectories, no other extension) — a misnamed file is silently skipped, not an error. Tests use the Mocha `tdd` UI (`suite` / `test` / `setup` / `teardown`), not BDD (`describe`/`it`). `chai` is available for assertions; `sinon` is also installed if needed.
- Pure logic (anything like `block_matcher.ts`) can be tested directly against a **headless** `Blockly.Workspace` (not `WorkspaceSvg`) — no DOM needed. Register throwaway block types in `setup()` with `Blockly.Blocks[type] = {init() {...}}`, build connections with `newBlock()` + `.previousConnection`/`.nextConnection`/`getInput(name).connection`, and clean up both the workspace and the registered types in `teardown()`. See `test/block_matcher.mocha.js` for the pattern.
- `sync_engine.ts`, `layer_panel.ts`, and `layer_workspace.ts` are **not** covered by automated tests yet (see `decisions.md`) — they need a real rendered `WorkspaceSvg`/DOM, and/or manual verification through the playground. Run `npm start`, open the printed localhost URL, and work through: toggling a layer, editing a field in each workspace, creating a block in each workspace, deleting a block in each workspace, reconnecting blocks in each workspace, and confirming a block dragged in the layer workspace keeps its position when an unrelated layer is toggled.
- When adding new sync behavior, prefer adding a case to `test/block_matcher.mocha.js`-style pure tests if the logic can be factored out as pure; otherwise extend the manual checklist above and note the gap in `decisions.md`.

## Conventions

- License header on every `src/` and `test/` file (see any existing file for the exact block).
- Default to no comments; add one only when the _why_ isn't obvious from the code (see the root `CLAUDE.md`/system conventions this session follows). The existing `sync_engine.ts` file-level comment is the exception that proves the rule — the two-path design isn't guessable from the code alone.
- `blockly` is a peer dependency — import from `blockly/core` (as the existing `src/` files do), don't add a direct dependency on `blockly`.
