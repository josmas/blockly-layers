# Design Decisions

A log of the decisions made while designing and building the layers plugin,
why they were made, what's intentionally left unhandled in this first pass,
and what's worth doing next.

## Core concept

- **Separate filtered workspace, not hide-in-place.** The main workspace
  always shows every block and stays editable. Checking a layer reveals a
  second, fully-interactive workspace showing just the matching blocks,
  rather than dimming/hiding blocks in place on the same canvas. Chosen
  because the ask was explicitly for a Photoshop-style isolated view, not an
  in-place filter.
- **Layer = explicit block-type list**, configured by the installer
  (`{id, name, blockTypes, color?, icon?}`). Blockly has no built-in notion
  of block "category" (block style like `loop_blocks` is purely cosmetic,
  not semantic), so there's nothing reliable to infer layers from — the
  installer has to say what belongs to each layer.
- **One shared layer workspace, not one per layer.** Checking multiple
  layers shows the *union* of their block types in a single secondary
  workspace, rather than spawning a workspace per layer.
- **Layers are combinable (checkboxes), not exclusive (radio).** Matches the
  "layers panel" mental model more than a single-select filter would.
- **Nested blocks come along whole.** If a block matches an active layer,
  its entire subtree is mirrored regardless of its descendants' own types
  (e.g. an `if` nested in a `repeat` shows up when only "Loops" is active).
  Avoids showing broken-looking stacks with gaps where non-matching children
  would otherwise be pruned out.
- **The layer workspace has a full, unfiltered toolbox.** Any block type can
  be dragged in there, not just the active layer's types — simpler than
  maintaining a second, layer-scoped toolbox, and avoids having to decide
  what a layer-scoped toolbox should contain when multiple layers are
  active at once.
- **Layout: auto-stack once, then free-drag persists.** A block is placed in
  a simple vertical stack the first time it appears in the layer workspace;
  after that, the user can drag it anywhere, and that position is
  independent of (and doesn't sync with) its coordinates in the main
  workspace, for as long as it stays mirrored.
- **Both workspaces are independently editable, both directions sync.**
  Field edits, new blocks, deletions, and reconnections in either workspace
  propagate to the other.

## Architecture decisions

- **Shared block IDs across both workspaces.** Block IDs in Blockly are only
  unique *within* a single workspace, so a mirrored block can keep the exact
  same ID in both the main and layer workspaces. This is the key
  simplification: every piece of sync bookkeeping is keyed off a plain block
  ID instead of a separate cross-workspace ID-mapping table.
- **Two propagation paths, chosen per event type:**
  - *Cheap direct relay* for field/value-only changes (`BLOCK_CHANGE`,
    `VAR_CREATE`/`VAR_DELETE`/`VAR_RENAME`/`VAR_TYPE_CHANGE`): clone the
    event via `Blockly.Events.fromJson(json, targetWorkspace)` and call
    `.run(true)` — the same trick `@blockly/workspace-minimap` uses for its
    one-way sync, reused here because `fromJson` resolves everything
    against whichever workspace it's handed, regardless of where the event
    came from.
  - *Debounced, declarative diff-and-reconcile* for structural changes
    (`BLOCK_CREATE`/`BLOCK_DELETE`/`BLOCK_MOVE`): rather than trying to
    replay every structural event type bespoke, each mirrored "root" block's
    serialized JSON (via `Blockly.serialization.blocks.save`, which ignores
    coordinates by default) is compared against what was last synced: a
    match means skip, a difference means re-sync that one root. This is
    simpler and more robust than hand-patching individual connections, and —
    critically — it only touches roots that actually changed, which is what
    lets a user's dragged position in the layer workspace survive unrelated
    edits elsewhere.
- **Position-preserving replace.** When a root's content has drifted, the
  engine captures its current on-screen position, disposes the stale copy,
  re-appends fresh content from the authoritative side, and restores the
  position — applied symmetrically in both directions. This is what makes
  "free-drag persists" true even though structural syncing works by
  dispose-and-recreate rather than incremental patching.
- **"Manually added" roots are exempt from type-based pruning.** A block
  created directly in the layer workspace (not matching any active layer's
  types) stays mirrored until it's deleted, regardless of what the
  checkboxes say. Without this, a freshly created non-matching block would
  flash into view and immediately vanish on the next reconciliation pass.
- **New standalone blocks in the layer workspace become new top-level
  blocks in main.** If a block created in the layer workspace isn't
  connected to anything already mirrored, it's pushed to main as an
  unconnected top-level block rather than guessing where in the hidden part
  of the tree it should attach.
- **Echo-loop prevention via simple boolean guards**
  (`applyingToMain`/`applyingToLayer`), checked at the top of each
  workspace's change listener, rather than `Blockly.Events.disable()`/
  `enable()` globally. Keeps rendering and other event-driven side effects
  working normally on the target workspace while still preventing our own
  writes from re-triggering outbound relay.
- **Panel UI modeled on `@blockly/workspace-search`.** The layer panel is an
  HTML overlay registered with the workspace's `ComponentManager` as
  `IPositionable`, so Blockly repositions it automatically on resize instead
  of the plugin managing its own resize listener.
- **Layer workspace created lazily, hidden (not disposed) when inactive.**
  It's created on first-ever layer activation, then just shown/hidden via
  CSS as layers are toggled, so dragged positions persist across toggles.
  It's only fully disposed when the plugin itself is disposed.
- **Layer workspace renders as a fixed bottom dock**
  (`position: fixed`, `40vh`, appended to `document.body`) by default,
  rather than depending on the host page's layout — a self-contained
  default that works regardless of surrounding CSS, overridable via the
  `.blockly-layer-workspace` class.
- **CSS injected via `Blockly.Css.register()` at module load time**, the
  same pattern `@blockly/zoom-to-fit` uses, rather than a manually managed
  `<style>` tag.

## Known limitations (V1)

- **No persistence.** Layer configuration and which layers are checked are
  not saved across page reloads — that's left to the installer, who can use
  the `get`/`set` API to wire up their own storage.
- **No grafting onto hidden context.** A new block created in the layer
  workspace that isn't connected to an already-mirrored block is added to
  main as a standalone top-level block, never attached to something outside
  the current layer view.
- **Layout isn't pluggable.** Stacking is a hardcoded simple vertical list.
  It's written as an internal function (not a public option) so it could
  become configurable later without an API change now.
- **Sync writes don't participate in undo.** Reconciliation's
  append/dispose calls use `recordUndo: false`, so a change propagated to
  the *other* workspace isn't separately undo-able there — only the
  originating edit is on that workspace's own undo stack.
- **No automated test coverage of the sync engine itself.** Only the pure
  `block_matcher` logic (root-match extraction and de-duplication) has unit
  tests. The bidirectional sync behavior was verified by a successful build
  plus manual code review, not an automated test, since this session had no
  browser automation available to drive the interactive playground.
- **RTL has only basic positioning logic** for the panel and layer
  workspace; it hasn't been exercised in practice.
- **Comments and collapsed/disabled states** ride along for free via the
  `BLOCK_CHANGE` relay, but haven't been explicitly tested.

## Next steps

- Manually verify the full interactive checklist in a browser: toggle
  layers, edit fields in both directions, create/delete/reconnect blocks in
  both directions, and confirm dragged positions survive unrelated toggles.
  (Still outstanding — flagged previously as untested due to lack of
  browser tooling in-session.)
- Add integration tests for `SyncEngine` itself (e.g. using rendered
  `WorkspaceSvg` instances in a test environment), not just the pure
  matcher functions.
- Decide whether a pluggable per-layer layout strategy (vertical/
  horizontal/grid) is worth exposing, or whether the fixed vertical stack
  is sufficient long-term.
- Decide on a persistence story if installers want layer config/active
  state to survive reloads — document a recommended pattern, or add
  first-class support.
- Consider a visual indicator in the main workspace for blocks that are
  currently also open in a layer, to help with orientation.
- Flesh out `GETSTARTED.md` and `package.json` (`description`, `keywords`)
  now that the README has a concrete usage example.
