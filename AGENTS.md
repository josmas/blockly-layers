# AGENTS.md — blockly-layers

Guidance for working on this repo. For _why_ things are built the way they are (and known gaps), see [`decisions.md`](./decisions.md). For the public API as documented for consumers, see [`README.md`](./README.md). For wiring it into MIT App Inventor (host-side, done in a fork), see [`INTEGRATION_APPINVENTOR.md`](./INTEGRATION_APPINVENTOR.md).

## What this is

A standalone Blockly plugin (bootstrapped from `@blockly/create-package`, not part of the Blockly monorepo) that adds a Photoshop-style "layers" panel for organizing a large project into named, checkbox-toggled groups of **whole top-level stacks** (event handlers, procedure defs, variable inits — anything that's its own entry in `workspace.getTopBlocks()`). Layers come from three sources: manual/author-curated (persisted with the project), dynamic/auto-derived (one per variable, one per procedure, plus any custom extractor a host app supplies), and installer-configured block-type lists (a secondary filter). Checking a layer filters the one workspace in place: stacks outside the active layers are hidden or dimmed.

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
  layers_xml.ts                       # optional <layers> XML form of manual layer state, for hosts that save with Blockly.Xml
  manual_layer_context_menu.ts        # "Layers" heading + "Layer: <name>" / "+ New layer..." block context menu items
  layer_panel.ts                       # floating, sectioned checkbox panel (IPositionable)
  layer_filter.ts                        # hides/dims stacks outside the active layers, fit-to-visible, arrange
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
  layers_xml.mocha.js            # round-trip of the optional XML form
  dynamic_layers.mocha.js        # unit tests for the built-in providers + DynamicSource
```

`src/index.ts` is the only module an app is meant to import from
(`import {LayersPlugin} from 'blockly-layers'`) — treat the rest of `src/`
as internal.

## Architecture, briefly

- There is a single workspace. `LayerFilterController` (`layer_filter.ts`) dims (low opacity, no pointer events; default) or hides (`display:none`) every top-level stack that isn't a member of an active layer, and removes a filtered stack's connections from Blockly's connection DB via `RenderedConnection.setTracking(false)` so nothing snaps onto an invisible stack. No block is copied or moved, so there is nothing to sync.
- `LayersPlugin` holds three `LayerSource`s (`ManualSource`, `StaticTypeSource`, one `DynamicSource` per provider) and computes the desired set by routing each active layer id to its owning source (matched by the `${kind}:` id prefix) and unioning `getMembers(...)`. See `src/layer_sources/types.ts`. "No layer active" means no filtering, which is distinct from "active layers with no members".
- A top-level stack that appears while filtering (just created, or split off another stack) and isn't a member of an active layer stays visible until the next layer-selection change.
- Manual layer membership persists through `src/layers_serializer.ts`, which registers an `ISerializer` under the name `'layers'` so it rides along with `Blockly.serialization.workspaces.save`/`load`. Dynamic and static layers are never persisted — they're recomputed/supplied fresh every time.

Read `decisions.md`'s "V3" section before changing the filtering approach, and its "V2 pivot" section before changing how layer membership is computed — it explains why the unit is a whole top-level stack rather than an arbitrary matched block.

## Testing

- `blockly-scripts test` only picks up files directly in `test/` named `*.mocha.js` (no subdirectories, no other extension) — a misnamed file is silently skipped, not an error. Tests use the Mocha `tdd` UI (`suite` / `test` / `setup` / `teardown`), not BDD (`describe`/`it`). `chai` is available for assertions; `sinon` is also installed if needed.
- Pure logic (`block_matcher.ts`, each `LayerSource`, the serializer) can be tested directly against a **headless** `Blockly.Workspace` (not `WorkspaceSvg`) — no DOM needed. Register throwaway block types in `setup()` with `Blockly.Blocks[type] = {init() {...}}`, build connections with `newBlock()` + `.previousConnection`/`.nextConnection`/`getInput(name).connection`, and clean up both the workspace and the registered types in `teardown()`. `ManualSource` doesn't even touch a workspace — its tests use plain string block ids. See the existing `test/*.mocha.js` files for the pattern.
- `layer_filter.ts`, `layer_panel.ts`, and `manual_layer_context_menu.ts` are **not** covered by automated tests (see `decisions.md`) — they need a real rendered `WorkspaceSvg`/DOM. Verify through the playground instead: `npm start`, open the printed localhost URL, and work through: right-click a stack → confirm the "Layers" heading with separators above/below, then "+ New layer..." → create and toggle it on; create a variable/procedure and confirm it appears under the matching dynamic section; toggle layers and confirm non-members dim (or hide via "Others") and the view fits what's left; drag a block near a hidden stack and confirm it doesn't snap to it; create a block while filtered and confirm it stays visible until the selection changes; "Arrange visible" then undo; collapse the panel and confirm the "Showing: ..." summary; call `Blockly.serialization.workspaces.save`, clear, `load` the result back, and confirm manual layer assignment survived; remove a manual layer via its row's "−" button and confirm it disappears from the panel and can no longer be toggled.
- Panel scaling checklist (collapsible sections + search, added for projects with large numbers of dynamic layers): type a partial name into the search box and confirm matching rows show across sections, auto-expanded, while non-matching sections disappear; clear the search (or press Escape) and confirm sections return to whatever collapsed/expanded state they were in before searching; collapse "Variables", activate one of its layers (via search or by expanding), collapse it again, and confirm the section header shows an "(N/total)" active count; confirm the manual "Layers" section never shows a disclosure arrow and always shows every row regardless of count; type several characters in a row into the search box and confirm it never loses keyboard focus (regression check — the input must be created once in `createDom()`, not recreated by `render()`).
- Panel header/refresh checklist: with no layers checked, confirm the "Clear" button is hidden; check any one layer and confirm "Clear" appears; create a new variable or procedure block in the main workspace and confirm it shows up under the matching dynamic section without touching anything else; rename a procedure's name field or repoint a variable dropdown and confirm the corresponding row's label updates; delete the only block referencing a variable/procedure and confirm its row disappears from the dynamic section.
- When adding new logic, prefer factoring it out as pure (a `LayerSource` method, a provider's `extractKey`) so it can get a headless-workspace unit test; otherwise extend the manual checklist above and note the gap in `decisions.md`.

## Conventions

- License header on every `src/` and `test/` file (see any existing file for the exact block).
- Default to no comments; add one only when the _why_ isn't obvious from the code (see the root `CLAUDE.md`/system conventions this session follows). The existing `sync_engine.ts` file-level comment is the exception that proves the rule — the two-path design isn't guessable from the code alone.
- `blockly` is a peer dependency — import from `blockly/core` (as the existing `src/` files do), don't add a direct dependency on `blockly`.
