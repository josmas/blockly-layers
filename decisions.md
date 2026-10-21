# Design Decisions

A log of the decisions made while designing and building the layers plugin,
why they were made, what's intentionally left unhandled, and what's worth
doing next. Organized chronologically: v1 shipped first; v2 is a deliberate
pivot after using v1 surfaced that its core concept didn't serve the actual
goal. Sections below are marked accordingly — v1 content marked
**(superseded)** is kept for history, not as current guidance.

## V2 pivot (2026-10-21): project-organization layers

V1 defined layers as installer-configured block-*type* lists (Loops, Logic,
Variables, Functions). After using it, it became clear this doesn't serve
the actual goal: **organizing large projects (hundreds to thousands of
blocks) into meaningful parts**. Block type doesn't correlate with
feature/subsystem — a game's inventory system uses loops, logic, and
variables all mixed together, so a "Loops" layer can never isolate it. Real
Photoshop layers aren't a fixed taxonomy either; they're author-defined,
per-document structure.

The design now rests on three combinable layer sources:

1. **Manual, author-curated layers** (primary tool) — right-click a
   top-level stack → "Add to layer...". Persisted with the project.
2. **Dynamic, auto-derived layers** — one per variable, one per procedure,
   computed live, no configuration. A `DynamicLayerProvider` extension
   point lets a host (e.g. MIT App Inventor) supply a custom extractor
   (e.g. "one layer per component actually used") without the plugin
   knowing anything about components.
3. **Installer-configured static layers** — v1's mechanism, kept as a
   secondary filter, not the primary organizing tool.

**The grouping unit became the whole top-level stack** (an "island": an
event handler, a procedure def, a variable init — anything that's its own
entry in `workspace.getTopBlocks()`), not an arbitrary block or sub-stack.
This was deliberate: it eliminates the nested-match/de-duplication problem
that most of v1's `block_matcher.ts` existed to solve, since a top-level
stack can never be nested inside another one. Everything downstream of
"which top-block ids are desired" (the `SyncEngine` mirroring machinery)
needed no changes at all — only the computation of *which ids* changed.

## V3 (2026-10-21): filter in place, single workspace

V2 still showed active layers in a second, mirrored workspace docked at the
bottom. Using it surfaced two problems: it spent 40% of the screen on a
second canvas (own toolbox, scroll, zoom), and the layer panel sat on the
main workspace while its checkboxes changed a workspace it didn't occupy.
Most of the v2 bug history (duplicate procedures, the global render queue,
`inject` stealing the main-workspace pointer) was also mirroring fallout.

Options weighed: (A) keep two workspaces but swap them in the same slot with a
host-level panel; (B) one workspace, filter in place; (C) overlay both
(rejected: pointer routing, and with shared coordinates it is just B with
extra cost); (D) per-layer tabs (kept as a possible later layer on top of B).
**Chose B.** `SyncEngine` and `LayerWorkspaceController` were deleted.

- **`LayerFilterController`** (`src/layer_filter.ts`): while any layer is
  active, each top-level stack that isn't a member of an active layer is
  dimmed (opacity 0.15, no pointer
  events, default) or hidden (`display:none`; the panel's "Others" toggle). Filtered stacks' connections are
  taken out of Blockly's connection DB with `RenderedConnection.setTracking(false)`
  so dragged blocks can't snap onto invisible stacks (`setTracking` is marked
  `@internal` in Blockly's typings, so it is worth re-checking on Blockly
  upgrades). No active layer means no filtering at all, which is distinct
  from active layers that happen to have no members.
- **Positions are real.** Stacks keep their true coordinates. Instead of the
  old auto-arrange, each selection change scrolls and zooms to fit the
  visible stacks, and an explicit "Arrange visible" action stacks them into
  a column as a real, undoable move (one event group). Compaction is never
  automatic, because moving blocks as a side effect of toggling a checkbox
  would silently rewrite the saved project.
- **New stacks stay visible.** A top-level stack that appears while filtering
  (created, or split off another stack) and isn't a member of an active
  layer is exempt from hiding until the next selection change; this replaces
  the old `manuallyAdded` concept. Re-filtering is debounced through a
  microtask and deferred while a drag is in progress.
- **Panel** stays an `IPositionable` on the one workspace, and gained a
  collapse toggle with a one-line "Showing: ..." summary, the hide/dim
  toggle and an "Arrange visible" button (toolbar only visible while a layer
  is active).
- **Lost on purpose:** independently arranged layer view, and a layer view
  with its own zoom/scroll. Accepted in exchange for one canvas, one toolbox,
  one undo stack and no sync layer.
- **Known gap, accepted for now:** workspace-level actions ("Clean up
  Blocks", "Delete N Blocks", "Collapse Blocks") still act on hidden stacks.
  "Delete N Blocks" is the risky one: its count and effect include stacks the
  user can't see. Possible fix: override those context menu items to act
  only on visible stacks, or relabel/gate them while filtering.
- **Not yet verified in a browser:** undo/redo, copy/paste while filtered,
  fit-to-visible behaviour of `scrollBoundsIntoView`, and scrollbars (they
  still span all top-level stacks via `getBlocksBoundingBox`; cosmetic).
- **Deferred navigation ideas:** a recent-views strip (each view restores its
  layer set and viewport) and back/forward history between layer selections.

## V2 architecture decisions

- **`LayerSource` abstraction** (`src/layer_sources/types.ts`): `kind`
  (namespaces layer ids as `${kind}:...`), `sectionTitle` (panel heading),
  `getLayers(workspace)`, `getMembers(workspace, layerId)`. Three
  implementations — `ManualSource`, `StaticTypeSource`, `DynamicSource`
  (generic wrapper around a `DynamicLayerProvider`) — let `LayersPlugin`
  treat all three origins uniformly: `getDesiredTopBlockIds()` just unions
  `getMembers(...)` over every currently-active layer id, routing each id
  to its owning source by matching the `${kind}:` prefix.
- **Static layers redefined as "whole island contains a match."**
  `StaticTypeSource.getMembers` now returns every top-level stack whose
  *entire* subtree contains at least one block of a listed type — a
  behavior change from v1's "extract just the matching block's own
  subtree," made necessary (and desirable) by whole-stack-as-unit.
- **Manual layer membership keyed by top-block id**, stored in
  `ManualSource` as `Map<topBlockId, Set<rawLayerId>>`, mutated via
  `assign`/`unassign`/`createLayer`/`removeLayer`, all firing a generic
  `onChange` callback that the panel and sync controller subscribe to
  independently rather than threading a bespoke callback through every
  mutation site.
- **Persistence via Blockly's own serializer registry**
  (`src/layers_serializer.ts`), not a plugin-owned store. Registers an
  `ISerializer` under the name `'layers'` with a priority below blocks'
  (so block ids referenced by membership already exist on load). A
  `WeakMap<Workspace, ManualSource>` lets the registry — a necessarily
  global singleton — route save/load/clear to the right `ManualSource` per
  workspace. This means an installer already calling
  `Blockly.serialization.workspaces.save/load` gets manual layers for free,
  while still owning *where* the resulting JSON is stored — matching the
  explicit ask that persistence mechanics live in the plugin by default,
  but control of storage stay with the installer long-term.
  `exportManualLayers()`/`importManualLayers()` are the escape hatch for
  installers with a custom save/load path that bypasses the registry.
- **"Add to layer..." via `Blockly.ContextMenuRegistry`**
  (`src/manual_layer_context_menu.ts`), scoped to blocks, resolving the
  right-clicked block's top-level ancestor via `block.getRootBlock()` so
  right-clicking anywhere in a stack works. Menu items are namespaced by
  `mainWorkspace.id` and gated by a `preconditionFn` checking
  `scope.block.workspace === mainWorkspace`, since `ContextMenuRegistry` is
  a single global registry — without this, two `LayersPlugin` instances on
  the same page (or the main vs. the layer workspace) would see each
  other's menu items. Deliberately **not** offered in the layer workspace
  itself — assigning layers from within an already-filtered view was
  judged a confusing nested concept not worth supporting yet.
- **Dynamic key extraction reuses existing Blockly idioms** rather than
  inventing new ones: `byVariableProvider` scans `block.inputList` for any
  `Blockly.FieldVariable` (covers `variables_get`/`variables_set` and any
  other block with a variable dropdown, e.g. loop blocks' own `VAR` field,
  for free — no per-block-type list to maintain). `byProcedureProvider`
  checks `block.type.startsWith('procedures_def'|'procedures_call')` and
  reads `getFieldValue('NAME')` — confirmed by reading Blockly core that
  call blocks' `getProcedureCall()` is implemented as exactly
  `this.getFieldValue('NAME')`, so def and call blocks need no separate
  branches.
- **Dynamic layers are never persisted** — recomputed from current project
  state on every panel render, so there's nothing to serialize and nothing
  that can go stale relative to the actual project.

## V1 core concept (superseded, kept for history)

- ~~Layer = explicit block-type list, configured by the installer~~ —
  superseded by the three-source model above; type-based layers still
  exist as the "static" source but are secondary now.
- Separate filtered workspace, not hide-in-place; one shared layer
  workspace (union of active layers); layers combinable via checkboxes;
  full unfiltered toolbox in the layer workspace; auto-stack-then-free-drag
  layout; bidirectional editing. **Held through v2; superseded in V3 by
  hide-in-place in the one workspace (layers remain combinable).**
- ~~Nested blocks come along whole~~ — superseded by whole-top-level-stack
  as the atomic unit, which is a stronger, simpler version of the same
  underlying intent (never show a fragmented stack).

## V1 sync architecture (removed in V3, kept for history)

This was reused as-is in v2, then deleted along with the second workspace in
V3 (see above). The rest of this section and the 2026-10-21 bug-fix section
describe code that no longer exists:

- **Shared block IDs across both workspaces.** IDs are only unique *within*
  one workspace in Blockly core, so a mirrored block keeps the exact same
  ID in both, letting all bookkeeping be keyed off a plain ID instead of a
  mapping table.
- **Two propagation paths:** cheap direct relay for field/variable changes
  (clone the event via `Blockly.Events.fromJson(json, targetWorkspace)` +
  `.run(true)`, the `@blockly/workspace-minimap` trick); debounced
  diff-and-reconcile for structural changes, comparing each mirrored root's
  serialized JSON against what was last synced and only touching roots that
  actually changed.
- **Position-preserving replace**: capture position, dispose stale copy,
  re-append fresh content, restore position — symmetric in both directions.
- **Echo-loop prevention via simple boolean guards**
  (`applyingToMain`/`applyingToLayer`) rather than globally disabling
  Blockly events.
- **"Manually added" roots are exempt from pruning only until the next
  deliberate layer-selection change** — not permanently (a 2026-10-10 bug
  fix; see git history). The same non-permanent-exemption concept still
  applies in v2 to blocks created directly in the layer workspace.
- Panel as an `IPositionable` HTML overlay (`@blockly/workspace-search`
  pattern); layer workspace created lazily, hidden-not-disposed when
  inactive, rendered as a fixed bottom dock by default; CSS via
  `Blockly.Css.register()`.

## 2026-10-21 bug fixes

Reported: activating a dynamic "Procedures" layer caused a second, renamed
procedure to appear in the panel, and the "Components" section (also
dynamic) vanished and stayed gone after deactivating the layer again.

- **`reconcileFromLayer`'s "is this a new root?" check was too weak.** It
  decided a layer-workspace top block was "newly created by the user" (and
  so should be pushed into main as a new block) whenever
  `!mainWorkspace.getBlockById(rootId)` — a live lookup — rather than
  checking whether `rootId` was already a tracked, mirrored root. If that
  reconcile path ever runs for an already-mirrored block (plausible trigger:
  `Blockly.serialization.blocks.append()` calls
  `renderManagement.triggerQueuedRenders()` with **no workspace argument**,
  which flushes Blockly's *global*, cross-workspace render queue —
  confirmed in core's `render_management.ts` — and that flush calls
  `block.bumpNeighbours()`, which can itself fire `BLOCK_MOVE` on blocks in
  a *different* workspace than the one being appended to), the weak check
  would try to push a duplicate into main with an ID that's already taken.
  Confirmed in core (`block.ts`'s `Block` constructor): requesting an
  already-used ID doesn't error, it silently mints a fresh one — so you get
  a second `procedures_defnoreturn` with the same name, which Blockly's own
  duplicate-name guard then renames. That's the "second procedure."
  **Fix:** check `this.rootSnapshot.has(rootId)` first; an already-tracked
  root is never treated as new, regardless of what a live `getBlockById`
  lookup momentarily returns.
- **One section's exception could blank the entire panel.** `LayerPanel.render()`
  clears all existing section DOM, then calls `getSections()` and iterates
  the result — but `getSections()` built its whole array eagerly, so if
  *any* dynamic provider's `getLayers`/`extractKey` threw (plausible under
  the race above, mid-reconciliation), the error propagated out before any
  section (including ones after the failing one — "Components" comes after
  "Procedures" in source order) got appended back, and nothing re-renders
  those until the next unrelated change. **Fix:** each source's
  `getLayers()` call is now wrapped individually (`LayersPlugin.safeGetLayers`)
  so a failure in one section logs to console and renders as empty, instead
  of taking every other section down with it.
- **`Blockly.inject()` unconditionally reassigns Blockly's global "main
  workspace" pointer** (`common.setMainWorkspace`, confirmed in core's
  `inject.ts`) to whatever workspace it just created — including our layer
  workspace, which has no public API to opt out of this. That pointer backs
  dropdown/widget-div positioning, keyboard navigation, and toolbox chaff
  handling, so until the user happened to click back into the main
  workspace (which re-claims it via the same `focusin` listener
  `inject.ts` wires up), those internal singletons stayed pointed at the
  layer workspace. **Fix:** `LayerWorkspaceController.create()` replays a
  synthetic `focusin` event on the primary workspace's injection div right
  after creating the layer workspace, exploiting the same listener Blockly
  already registers, to claim the pointer back immediately.

## 2026-10 panel scaling: collapsible sections + global search

A real project can easily have 100+ variables and 200+ procedures — each
becomes its own dynamic layer row — and a project author can define a good
number of custom (manual) layers too. The panel originally listed every
layer in every section as a permanent checkbox row; `max-height: 60%` +
`overflow-y: auto` kept it from literally growing past the screen, but
scrolling through hundreds of rows to find one, with custom layers buried
below the giant Variables/Procedures sections, made the panel impractical
at that scale.

Considered two options: (a) a bigger redesign splitting the panel into an
always-visible "active layers" zone (flat, every source mixed together) and
a separate collapsed/searchable "browse" area for everything inactive —
the tag-picker pattern used by Gmail labels/GitHub issue labels — versus
(b) an incremental fix keeping today's fixed section layout. **Chose (b)**:
lower cost, keeps the panel's structure recognizable, and still solves the
scaling problem for the common case of knowing roughly what you're looking
for. (a) remains on the table if search/collapse turns out not to be
enough in practice.

Decisions:

- **Collapsible sections, collapsed by default, except the manual "Layers"
  section** — which stays always fully visible, uncollapsible. Rationale:
  author-curated layers are deliberately created by a human, so they're
  naturally bounded (tens, not hundreds) and are usually exactly what
  someone wants to see/toggle; a project's Variables/Procedures/custom
  dynamic sections are the ones that can genuinely scale into the hundreds
  and benefit from defaulting out of view.
- **One global search box**, not one per section — simpler mental model,
  matches command-palette-style search most people already know. Typing
  filters every section's rows by case-insensitive substring match and
  auto-expands any section with a match, overriding its collapsed state
  for the duration of the search; clearing the query restores whatever
  collapsed/expanded state each section had before.
- **Active-count indicator on collapsed section headers** (`(N/total)`,
  e.g. "Variables (1/103)") — added beyond what was explicitly discussed,
  because collapsing a section with no indicator of what's active inside
  it would make it easy to forget you have something toggled on in there.
  Uses the already-available `callbacks.isActive(layerId)`, no new wiring.
- **The search `<input>` is created once in `createDom()`, not inside the
  `bodyDiv` that `render()` wipes via `replaceChildren()` on every
  keystroke** — otherwise the input would lose focus after every character
  typed, since `render()` runs on every `input` event. Its event binding
  lives in the same "bound once, survives across renders" bucket as the
  header's Clear/+ buttons (renamed from `headerBoundEvents` to
  `chromeBoundEvents` since it now covers more than just the header).
- This is all presentation-only state local to `LayerPanel`
  (`searchQuery`, `expandedSections: Set<string>` keyed by section title)
  — `LayersPlugin` and the `LayerSource`s are untouched, since search/
  collapse is purely about how already-computed sections are displayed,
  not what layers exist or which are active.

## 2026-10 panel follow-ups: hide "Clear" when inert, auto-refresh dynamic sections

Two more gaps surfaced after the scaling work above:

- **"Clear" showed even when nothing was active.** Fixed by adding
  `LayerPanelCallbacks.hasActiveLayers()` (backed by `activeIds.size > 0`)
  and toggling the button's `display` in `render()`. The button itself is
  still created once in `createDom()` (its own click handler never needs
  rebinding) — `render()` just flips visibility on the existing element
  rather than recreating it.
- **Dynamic sections ("Variables", "Procedures", any custom provider) went
  stale.** The panel only ever recomputed on events it already knew about
  (toggling a checkbox, a manual-layer change) — there was no listener on
  the main workspace itself, so a newly-created (or deleted) variable/
  procedure just didn't show up until some unrelated interaction happened
  to trigger a re-render. Considered a manual "refresh" button, rejected
  it as a workaround rather than a fix (asks the user to remember to click
  something every time the project changes, which undercuts the premise
  of a panel that's supposed to reflect the project).
  **Fix:** `LayersPlugin` registers its own `mainWorkspace.addChangeListener`
  — separate from `SyncEngine`'s internal one, since "the panel's layer
  listing might be stale" is a different concern from "the mirrored
  content needs reconciling" — reacting to `BLOCK_CREATE`, `BLOCK_DELETE`,
  `VAR_CREATE`, `VAR_DELETE`, `VAR_RENAME`, and `BLOCK_CHANGE` only when
  `element === 'field'` (covers a procedure's `NAME` field or a variable
  dropdown being repointed, without re-rendering on every comment/
  collapse/mutation change too). `BLOCK_MOVE` is deliberately excluded —
  reconnecting or repositioning a block doesn't change which distinct keys
  exist in the project. Debounced through a microtask
  (`schedulePanelRefresh`), the same pattern `SyncEngine.scheduleReconcile`
  already uses, so a burst of events (e.g. deleting a multi-block stack
  fires one `BLOCK_DELETE` per block) collapses into a single `render()`.
  Deletions were explicitly called out as needing to work — they do, since
  `BLOCK_DELETE` is in the trigger set the same as `BLOCK_CREATE`.
- **Known minor gap, not fixed:** if an active dynamic layer's last
  matching block is deleted, `activeIds` silently keeps that now-defunct
  id (e.g. `dynamic:variable:score`) — it just stops rendering a row since
  `DynamicSource.getLayers()` no longer lists a key nothing produces. If a
  variable with the same name is ever recreated, it would come back
  "pre-activated" without the user having re-checked it. Rare and mostly
  harmless (worst case: that layer mirrors into the layer workspace again
  on its own), not worth the bookkeeping to prune proactively right now.

## Known limitations

- **Workspace-level actions still touch hidden stacks** (Clean up, Delete N
  Blocks, Collapse Blocks) while a layer filter is active; see V3.
- **Arrange visible layout isn't pluggable** — hardcoded vertical stack.
- **No automated test coverage of `LayerFilterController` or `LayerPanel`** — these need a real rendered `WorkspaceSvg`/
  DOM. Covered instead by the manual playground checklist in `AGENTS.md`.
  Pure logic (`block_matcher`, each `LayerSource`, the serializer) does
  have unit tests, using a headless `Blockly.Workspace`.
- **"New layer..." uses `window.prompt`** for naming, both in the context
  menu and the panel's "+" button — functional but not polished; a richer
  inline input would be a reasonable follow-up.
- **No UI to browse/remove a stack's existing layer assignments** beyond
  right-clicking it again and toggling each layer off (no "manage layers"
  dialog).
- **The `byVariableProvider`/`byProcedureProvider` extractors return only
  one key per block** (the first variable field found, or the `NAME`
  field) — a block with multiple variable fields only contributes to one
  dynamic layer, not several.
- **RTL has only basic positioning logic**, unexercised in practice.

## Next steps

- Finish browser-verifying V3 (undo, copy/paste, fit-to-visible; see V3), then the v2 interactive checklist: assign two
  stacks to a new manual layer via right-click, toggle it on; create a
  variable and confirm it appears under "Variables"; save → clear → load
  and confirm manual assignment survives (automated via
  `test/layers_serializer.mocha.js`, but worth an end-to-end playground
  pass too).
- Consider a richer "new layer" input than `window.prompt`.
- Consider a "manage layers" view for bulk rename/recolor/delete and
  browsing a stack's current assignments.
- Decide whether multi-key extraction (a block contributing to more than
  one dynamic layer) is worth supporting.
- Flesh out `GETSTARTED.md` and `package.json` (`description`, `keywords`).
