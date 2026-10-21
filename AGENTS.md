# AGENTS.md — blockly-layers

Guidance for working on this repo. For _why_ things are built the way they are (and known gaps), see [`decisions.md`](./decisions.md). For the public API as documented for consumers, see [`README.md`](./README.md).

## What this is

A standalone Blockly plugin (bootstrapped from `@blockly/create-package`, not part of the Blockly monorepo) that adds a Photoshop-style "layers" panel for organizing a large project into named, checkbox-toggled groups of **whole top-level stacks** (event handlers, procedure defs, variable inits — anything that's its own entry in `workspace.getTopBlocks()`). Layers come from three sources: manual/author-curated (persisted with the project), dynamic/auto-derived (one per variable, one per procedure, plus any custom extractor a host app supplies), and installer-configured block-type lists (a secondary filter). Checking a layer opens a shared secondary workspace showing just its stacks, synced back to the main workspace in both directions.

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
  index.ts                        # public entry point — re-exports LayersPlugin + types
  layer_types.ts                   # LayerDefinition / StaticLayerDefinition / DynamicLayerProvider / options
  layers_plugin.ts                  # LayersPlugin: public API, owns sources + panel + workspace controller
  layers_serializer.ts               # persists manual layers via Blockly's serializer registry
  manual_layer_context_menu.ts        # "Add to layer..." / "New layer..." block context menu items
  layer_panel.ts                       # floating, sectioned checkbox panel (IPositionable)
  layer_workspace.ts                    # creates/shows/hides the shared secondary workspace
  sync_engine.ts                         # bidirectional main<->layer-workspace reconciliation
  block_matcher.ts                        # pure helpers behind the static (type-list) layer source
  layer_sources/
    types.ts                              # LayerSource interface all three sources implement
    manual_source.ts                       # author-curated layers: CRUD + persisted membership
    static_type_source.ts                   # wraps the installer-configured block-type-list layers
    dynamic/
      dynamic_source.ts                      # generic wrapper: one layer per key a provider extracts
      by_variable.ts                          # built-in provider: one layer per variable
      by_procedure.ts                          # built-in provider: one layer per procedure
test/
  index.ts                  # playground setup (demo toolbox + seeded blocks + a toy "by component" provider)
  index.html                 # playground page served by `npm start`
  block_matcher.mocha.js      # unit tests for block_matcher.ts
  manual_source.mocha.js       # unit tests for ManualSource CRUD
  layers_serializer.mocha.js    # save/load round-trip through Blockly's serializer registry
  dynamic_layers.mocha.js        # unit tests for the built-in providers + DynamicSource
```

`src/index.ts` is the only module an app is meant to import from
(`import {LayersPlugin} from 'blockly-layers'`) — treat the rest of `src/`
as internal.

## Architecture, briefly

- The **main workspace** is the app's normal, always-visible workspace.
- The **layer workspace** is a single secondary `WorkspaceSvg`, created lazily on first use, showing the union of every currently-checked layer's members (from any source), plus each matched stack's full contents.
- `LayersPlugin` holds three `LayerSource`s (`ManualSource`, `StaticTypeSource`, one `DynamicSource` per provider) and computes the desired mirrored set by routing each active layer id to its owning source (matched by the `${kind}:` id prefix) and unioning `getMembers(...)`. See `src/layer_sources/types.ts`.
- A mirrored block keeps the **same block ID** in both workspaces — IDs are only unique within one workspace in Blockly core, so this works and lets all sync bookkeeping in `SyncEngine` be keyed off a plain ID instead of a mapping table. `SyncEngine` itself doesn't know or care where the desired-id set came from.
- `SyncEngine` propagates changes two ways:
  - **Field/variable edits** (`BLOCK_CHANGE`, `VAR_*`) are relayed directly and cheaply by cloning the event onto the other workspace.
  - **Structural changes** (create/delete/reconnect) go through a debounced reconciliation pass that diffs each mirrored stack's serialized content against what was last synced, so only stacks that actually changed are touched. This is what lets a user's dragged position in the layer workspace survive unrelated edits elsewhere.
- Manual layer membership persists through `src/layers_serializer.ts`, which registers an `ISerializer` under the name `'layers'` so it rides along with `Blockly.serialization.workspaces.save`/`load`. Dynamic and static layers are never persisted — they're recomputed/supplied fresh every time.

Read `sync_engine.ts`'s file-level comment before changing its behavior — it explains the two propagation paths and why the position-preserving replace pattern exists. Read `decisions.md`'s "V2 pivot" section before changing how layer membership is computed — it explains why the unit is a whole top-level stack rather than an arbitrary matched block.

## Testing

- `blockly-scripts test` only picks up files directly in `test/` named `*.mocha.js` (no subdirectories, no other extension) — a misnamed file is silently skipped, not an error. Tests use the Mocha `tdd` UI (`suite` / `test` / `setup` / `teardown`), not BDD (`describe`/`it`). `chai` is available for assertions; `sinon` is also installed if needed.
- Pure logic (`block_matcher.ts`, each `LayerSource`, the serializer) can be tested directly against a **headless** `Blockly.Workspace` (not `WorkspaceSvg`) — no DOM needed. Register throwaway block types in `setup()` with `Blockly.Blocks[type] = {init() {...}}`, build connections with `newBlock()` + `.previousConnection`/`.nextConnection`/`getInput(name).connection`, and clean up both the workspace and the registered types in `teardown()`. `ManualSource` doesn't even touch a workspace — its tests use plain string block ids. See the existing `test/*.mocha.js` files for the pattern.
- `sync_engine.ts`, `layer_panel.ts`, `layer_workspace.ts`, and `manual_layer_context_menu.ts` are **not** covered by automated tests (see `decisions.md`) — they need a real rendered `WorkspaceSvg`/DOM. Verify through the playground instead: `npm start`, open the printed localhost URL, and work through: right-click a stack → "Add to layer..." → create and toggle it on; create a variable/procedure and confirm it appears under the matching dynamic section; edit a field in each workspace; create/delete/reconnect blocks in each workspace; confirm a block dragged in the layer workspace keeps its position when an unrelated layer is toggled; call `Blockly.serialization.workspaces.save`, clear, `load` the result back, and confirm manual layer assignment survived; remove a manual layer via its row's "−" button and confirm it disappears from the panel and can no longer be toggled.
- Panel scaling checklist (collapsible sections + search, added for projects with large numbers of dynamic layers): type a partial name into the search box and confirm matching rows show across sections, auto-expanded, while non-matching sections disappear; clear the search (or press Escape) and confirm sections return to whatever collapsed/expanded state they were in before searching; collapse "Variables", activate one of its layers (via search or by expanding), collapse it again, and confirm the section header shows an "(N/total)" active count; confirm the manual "Layers" section never shows a disclosure arrow and always shows every row regardless of count; type several characters in a row into the search box and confirm it never loses keyboard focus (regression check — the input must be created once in `createDom()`, not recreated by `render()`).
- When adding new logic, prefer factoring it out as pure (a `LayerSource` method, a provider's `extractKey`) so it can get a headless-workspace unit test; otherwise extend the manual checklist above and note the gap in `decisions.md`.

## Conventions

- License header on every `src/` and `test/` file (see any existing file for the exact block).
- Default to no comments; add one only when the _why_ isn't obvious from the code (see the root `CLAUDE.md`/system conventions this session follows). The existing `sync_engine.ts` file-level comment is the exception that proves the rule — the two-path design isn't guessable from the code alone.
- `blockly` is a peer dependency — import from `blockly/core` (as the existing `src/` files do), don't add a direct dependency on `blockly`.
