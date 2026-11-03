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
   top-level stack → pick a "Layer: <name>" item. Persisted with the project.
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
  visible stacks, and an explicit "Arrange visible" action gathers them as a
  real, undoable move (one event group; see "Arrange goes to free space").
  Compaction is never automatic, because moving blocks as a side effect of
  toggling a checkbox would silently rewrite the saved project.
- **Arrange goes to free space.** The old arrange stacked the visible stacks
  into one column where the topmost already was, ignoring dimmed and hidden
  stacks, so once the filter was cleared the column sat on top of other
  blocks. Now (`arrange_policy.ts`, pure and unit tested) the member stacks,
  in reading order, are wrapped into columns about one view tall at the
  current zoom (clamped to the readable-scale range), and that block is
  placed at the free spot nearest the centre of the view: candidate corners
  come from the edges of the 60 obstacles closest to the view (every other
  top-level stack, dimmed or hidden included, and workspace comments), each
  kept 40 units clear; the members' own old positions count as free. If no
  candidate fits, the block goes just past the right edge of everything
  (left in RTL), level with the topmost obstacle, which grows the project's
  footprint, which was an explicit trade-off. So a gap further out than the
  60 nearest obstacles' edges is missed in favour of going outside; fine in
  practice, and the cap keeps it fast with hundreds of stacks. It always
  relocates, even if the stacks happened to be fine, and it ends in the
  same fit. Single stacks aren't arranged. Covered by `arrange_policy.mocha.js`
  and the "arrange visible" Playwright tests (no overlap after clearing,
  wrapping, one undo restores everything). Not done: re-flowing arranged
  stacks later if something is dropped on them, and an RTL-specific
  Playwright test.
- **The prior view comes back.** The first selection change that starts
  filtering saves the workspace's scale and scroll; deactivating the last
  layer restores them (deactivating one of several keeps filtering, so it
  doesn't). Each filtering session saves afresh, and the view is not saved
  again while filtering continues. Whatever panning or zooming happened in
  between is deliberately discarded. Covered by the "view save and restore"
  Playwright tests.
- **Checking a layer fits it, but never below a readable scale.** The old
  behaviour (fit every member on every selection change, down to the
  workspace's `minScale`, which a host may set very low) made blocks
  unworkably small in big,
  sparse projects. The fit stays, because it is the natural response to
  checking a layer, but it now stops at the `minReadableScale` option
  (default `MIN_READABLE_SCALE` 0.5, in `view_policy.ts`; a higher workspace
  `minScale` wins) and never zooms in
  past 1. If the members can't all fit at that scale, the first one (reading
  order: top, then left; right in RTL) is shown, centred if it fits. Every
  fit also marks all member stacks with the renderer's "selected" styling
  (`pathObject.updateSelected`). Blockly core supports only one selected
  block and Jose didn't want to depend on the multiselect plugin, so this is
  a visual mark only: nothing is really selected, so copy/delete/drag don't
  act on the group. Marks are cleared by the next fit, a step, a pointer
  press on the workspace, or a selection change, and never strip the block
  Blockly really has selected. Measured with zelos (whose selection is
  an SVG glow filter), frame time while panning is unchanged up to about 30
  marked stacks and roughly doubles by 60; geras shows no cost at any count.
  So `MAX_MARKED_STACKS` (30, in `view_policy.ts`) caps it: above that no
  marks are drawn, and the dimming alone shows the set. (Headless Chromium
  software rendering; real GPUs will differ, but the shape should hold.)
  The panel's "◀ n of N ▶" steps through the member stacks at the
  current zoom (wrapping, centring each) and selects the one it lands on, so
  Blockly's own highlight shows which it is. "Fit" repeats the fit on
  request, e.g. after panning away, and "Arrange visible" ends in the same
  fit. We first tried "never zoom on toggle, scroll only if nothing is on
  screen", but Jose found fitting the more natural behaviour. Keyboard: Blockly 13's
  navigation (N / B for next/previous stack, arrowing past a stack's end)
  walks `getTopBoundedElements`, i.e. every stack including dimmed or
  hidden ones, and `canBeFocused()` is always true, so a keyboard user could
  land on something invisible. While filtering, the filter wraps the
  workspace navigator's `navigateStacks` (an instance-level patch, undone on
  dispose, since `Navigator` isn't exported to subclass) to skip
  non-visible stacks. Blockly's N / B only work once a block is focused, so
  the plugin registers its own N / B (colliding on purpose; the newest
  shortcut runs first) that apply only when a layer is active and nothing is
  selected, and step into the first visible stack; otherwise they defer to
  Blockly's. A `SELECTED` event on a member stack moves the "n of N" label,
  so native navigation and the ◀ ▶ buttons share one position. Stepping
  selects through `Blockly.common.setSelected`, which in Blockly 13 is
  `getFocusManager().focusNode`, so it also moves DOM focus to the
  workspace (and moving focus away, e.g. into the search box, unselects).
  We first used Alt+[ / Alt+], but `[`/`]` need AltGr on many layouts, which
  Blockly reads as Ctrl+Alt. Stepping also plays a one-second glow
  on the stack it lands on (`blockly-layers-arrived`, a `drop-shadow`
  keyframe animation, off under `prefers-reduced-motion`), because
  Blockly's selection outline alone is easy to miss in a big workspace; it
  is a CSS class removed on `animationend`, with no state. Gap: nothing
  speaks the
  stepping position to screen readers beyond Blockly's own focus
  announcements. The 0.5 default
  is a judgement call, not measured; hosts tune it with the option. No keyboard
  shortcuts for stepping yet. The step position is tracked by stack id, so
  it restarts on a selection change and the label can lag behind blocks
  added or removed until the next render. Pure parts (reading order, fit
  scale, step wrap) are unit tested in `test/view_policy.mocha.js`;
  scroll/zoom/highlight behaviour in the "view follows the layers"
  Playwright tests.
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
- **Layer items via `Blockly.ContextMenuRegistry`** (originally "Add to layer..."; see the 2026-10-21 context menu section)
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

## 2026-10-21 context menu: making layer items distinguishable

The per-layer context menu items showed up as bare layer names, mixed in
with Blockly's stock items. Blockly 13.3's `ContextMenuRegistry` has **no
submenus** (checked its types), but does support separators and a
`displayText` that can be an `HTMLElement`.

**Chose:** a separator, a disabled "Layers" heading, rows labelled
`[✓ ]Layer: <name>` ("+ New layer..." for creation), and a closing separator,
kept contiguous by weight (98–101). Small, and the structure is verifiable
from the types alone. Rows are re-registered whenever layers change, as before.

Options considered and **not** taken (revisit if the menu gets long or
looks wrong):

- **Prefix only**, no heading/separators: simplest, but the group isn't
  visually delimited.
- **Styled `HTMLElement` rows** (layer color swatch + check mark, matching
  the panel): nicer, but unverified how Blockly styles/handles custom
  elements in menu rows, and it needs checking in a browser.
- **A single "Layers…" item that opens our own popup** with checkboxes (and
  search, for many layers): closest to a real submenu and scales to large
  layer counts, but means owning a popup's positioning, focus and dismissal.

## 2026-10-22 optional XML persistence (for App Inventor)

Manual layers persist through Blockly's JSON serializer registry, which
`Blockly.Xml` saves bypass. MIT App Inventor saves `.bky` as XML
(`Blockly.SaveFile.get` in `blocklyeditor/src/savefile.js` calls
`Blockly.Xml.workspaceToDom`, appends a `yacodeblocks` element, and loads via
`Blockly.Versioning.upgrade` → `ensureWorkspace` → `Blockly.Xml.domToWorkspace`),
so manual layers wouldn't have been saved there (read from the Blockly 13 PR
branch, mit-cml/appinventor-sources#4069).

Options: host serializes `exportManualLayers()` itself; **plugin-provided XML
helpers (chosen)**; storing layer names on the blocks (rejected: needs the
host's block definitions to cooperate, not generic). `exportManualLayersXml()`
/ `importManualLayersXml(el)` (`src/layers_xml.ts`) produce/parse a `<layers>`
element. Strictly opt-in: JSON hosts are unaffected and the plugin never
calls them itself. The host appends the element on save and imports it
**after** blocks load.

Known risk: membership is keyed by top-block id. `workspaceToDom` keeps ids,
but blocks recreated on load without ids (App Inventor's version upgraders
build some blocks that way) would lose their assignments. Not yet verified
against a real App Inventor project.

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

## 2026-11 panel placement: floating-with-drag and docked modes

In App Inventor the panel pushed the backpack down next to the zoom/trash
controls. Cause: `LayerPanel` registered at weight 1 and reported its full
rectangle, so it claimed the top-right corner before the backpack (weight 2,
same corner, bumps `DOWN`) and a panel up to 60% of the workspace height
shoved everything after it down. It also bumped with its *full* height, so it
could itself be pushed off-screen.

Decisions:

- **Default floating position no longer pushes anything.** Weight is now 100,
  so we're positioned after trash/zoom/backpack. We probe the bump with just
  the header's height (so a tall panel can't be bumped past the bottom
  controls), then cap `maxHeight` at the distance to the nearest reported
  rect below us in our column (`capHeight`). We still report our rectangle —
  nothing is placed after us, so nothing is displaced, and the panel never
  occludes anything by default. Rejected: returning `null` from
  `getBoundingRectangle()` always — that stops displacing others but lets the
  panel cover the backpack.
- **A user-moved panel is unreported.** Dragging the header stores an offset
  from the *unbumped* corner (`floatOffset`), so it survives resizes; it is
  clamped when applied, not when stored, so a window that shrinks then grows
  gives the position back. Once set, `getBoundingRectangle()` is `null`:
  where a user puts it is their call. Double-click on the header resets.
- **Docked mode lives inside the host's element, not in a host-provided
  one.** App Inventor hands Blockly a single element (`BlocklyPanel`'s
  `.svg { 100% x 100%; overflow:hidden }`) and has no spare sidebar slot, so
  a `panelContainer` option would have forced GWT layout changes in the fork.
  Instead `PanelDock` turns that element into a flex row (injection div |
  splitter | panel) and re-fits the SVG, which Blockly sizes from its parent
  element (`svgResize`). Everything touched is recorded on entry and restored
  on exit/`dispose()`. Rejected: a custom `MetricsManager` — the host already
  supplies its own (`ScrollMetricsManager`) and layout belongs to the host.
  `panelContainer` stays a possible later escape hatch for hosts with their
  own layout; nothing needs it yet.
- **Per-user state in `localStorage`** under `storageKey`: mode, `floatOffset`,
  `dockWidth`, `collapsed`, `expandedSections`. Precedence: saved value >
  `panelMode` option > built-in default (floating). Every access is wrapped
  in try/catch and parsed field by field, so blocked/corrupt storage just
  means no memory. Pure parts live in `panel_state.ts` (unit-tested); DOM in
  `panel_dock.ts`.
- **Browser tests use a lean fixture, not the dev-tools playground**, which
  loads Monaco from the network and can recreate the workspace. `test/index.ts`
  mounts `?fixture=1` instead: a host-like container, a stub backpack that
  mimics App Inventor's (weight 2, top corner, bumps down), zoom/trash, and
  optional `many=N` extra layers / `rtl=1`. `npm run test:browser` runs
  Playwright against it (`@playwright/test` pinned to 1.57.0, which matches
  the Chromium already in `~/.cache/ms-playwright`). Assertions about
  "overlapping the zoom/trash" use the rectangles they *report* to Blockly,
  not their DOM bounding boxes, which include hit areas and overstate them.
  Mutation-checked: setting the weight back to 1 makes the displacement test
  fail with the backpack shoved ~200px down, the originally reported bug.

Not yet verified inside App Inventor itself: rebuild the fork's
`blockly-layers-0.0.0-local.min.js` and check docked mode against the real
`.svg` CSS and — importantly — that the whole container, not just the SVG, is
hidden when a screen is inactive (`BlocklyPanel.setVisible` →
`workspace.setVisible(false)`), so a docked panel can't show through.

## Known limitations

- **Workspace-level actions still touch hidden stacks** (Clean up, Delete N
  Blocks, Collapse Blocks) while a layer filter is active; see V3.
- **Arrange visible layout isn't pluggable** — hardcoded vertical stack.
- **`LayerFilterController` and the context menu have no automated tests**,
  and `LayerPanel`'s placement/drag/dock/persistence are covered only by the
  Playwright suite (`npm run test:browser`), not its row/section rendering —
  they need a real rendered `WorkspaceSvg`/DOM. The rest is covered by the
  manual playground checklist in `AGENTS.md`.
  Pure logic (`block_matcher`, each `LayerSource`, the serializer) does
  have unit tests, using a headless `Blockly.Workspace`.
- **"New layer..." asks inline, not with `window.prompt`.** Both the panel's
  "+" and the block context menu's "+ New layer..." call
  `LayerPanel.promptForName()`, which shows a text input at the top of the
  panel (expanding a collapsed panel first). Enter accepts a non-empty name
  that no manual layer has (case-insensitive; the error shows in place);
  Escape or clicking away cancels. It is non-modal, so nothing blocks the
  page, and it is created once in `createDom()` like the search box. We did
  not use `Blockly.dialog.prompt`: it is a host seam, but its default is
  still `window.prompt`, so it wouldn't have fixed the UX. Removing a layer
  asks the same way: the row's "−" calls `LayerPanel.confirmRemoval()`,
  an inline bar (`Remove layer "X"?` with Cancel and Remove) in the same
  slot; Cancel has the focus so Enter alone never deletes, Escape cancels,
  and it is cancelled by a new name request, collapsing the panel, or
  dispose. It does not cancel on blur (Safari doesn't focus buttons on
  click, so blur can't tell "clicked Remove" from "clicked away"), so it
  stays open until answered. Clicking away from the name input resolves it
  at once but hides the row only after the pointer is up (or 500 ms): hiding
  it on mousedown shifted the controls below and the click missed. No
  `window.prompt` or `window.confirm` is left in the plugin.
- **No UI to browse/remove a stack's existing layer assignments** beyond
  right-clicking it again and toggling each layer off (no "manage layers"
  dialog).
- **The `byVariableProvider`/`byProcedureProvider` extractors return only
  one key per block** (the first variable field found, or the `NAME`
  field) — a block with multiple variable fields only contributes to one
  dynamic layer, not several.
- **RTL has only basic positioning logic**, unexercised in practice.

## Next steps

Everything below is outstanding as of 2026-11-03 (the branch was clean and
committed). The zoom/view, keyboard, inline name/confirm and arrange work is
all logged above.

Known gaps in recent work:

- **Arrange never re-flows.** If something is later dropped on the arranged
  block, nothing moves it out of the way.
- **RTL is only unit-tested for arrange** (pure placement math) and has no
  browser tests for stepping, the glow, or arrange.
- **Screen readers:** nothing announces the stepping position beyond
  Blockly's own focus announcements.
- **Tunables chosen without real data:** `minReadableScale` default 0.5, the
  30-stack cap on marks (measured with zelos in headless Chromium only), the
  glow's colour and one-second length, 40/20 arrange padding/gap, the 60
  nearest obstacles used for arrange candidates.
- **Fragile Blockly seams to re-check on upgrades:** `RenderedConnection.setTracking`
  (`@internal`), the instance patch of `navigator.navigateStacks` (the
  `Navigator` class isn't exported), `pathObject.updateSelected` for the
  multi-stack mark, `workspace.scrollBoundsIntoView` (`@internal`).
- **Not verified inside a real host** (only the fixture and playground):
  the newer panel pieces (inline bars, keys, arrange, glow) and whether a host
  that remaps `N` / `B` or sets its own `zoomOptions.minScale` behaves.
  Also do the manual playground pass in `AGENTS.md`; an interactive browser
  isn't available to the assistant, so only the Playwright suite has run.

Older backlog:

- Finish browser-verifying V3 (undo, copy/paste; see V3), then the v2
  interactive checklist: assign two stacks to a new manual layer via
  right-click, toggle it on; create a variable and confirm it appears under
  "Variables"; save → clear → load and confirm manual assignment survives
  (automated via `test/layers_serializer.mocha.js`, but worth an end-to-end
  playground pass too).
- Possible future idea, not committed to: a "manage layers" view for bulk
  rename/recolor/delete and browsing a stack's current assignments. Today a
  layer's colour swatch (`LayerDefinition.color`) can only be set in code,
  via `createLayer(name, {color})` (the seeded "Demo layer" in the
  playground/fixture has one); layers made through the UI have none, and
  there is no rename.
- Decide whether multi-key extraction (a block contributing to more than
  one dynamic layer) is worth supporting.
- Flesh out `GETSTARTED.md` and `package.json` (`description`, `keywords`).
