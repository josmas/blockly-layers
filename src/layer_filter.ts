/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Filters the main workspace in place: while any layer is
 * active, top-level stacks that belong to none of the active layers are
 * dimmed (default) or hidden instead of being mirrored into a second workspace. No
 * block is ever moved, copied or recreated, so there's nothing to keep in
 * sync.
 *
 * A filtered-out stack's connections are removed from the connection
 * database (`RenderedConnection.setTracking`) so a block dragged nearby can't
 * snap onto something the user can't see.
 */
import * as Blockly from 'blockly/core';

export type FilterMode = 'hide' | 'dim';

type StackState = 'visible' | FilterMode;

const DIM_OPACITY = '0.15';
const FIT_PADDING = 40;
const ARRANGE_GAP = 20;

const STRUCTURAL_EVENT_TYPES = new Set<string>([
  Blockly.Events.BLOCK_CREATE,
  Blockly.Events.BLOCK_DELETE,
  Blockly.Events.BLOCK_MOVE,
]);

export class LayerFilterController {
  private mode: FilterMode = 'dim';
  /** Stack states last applied to the DOM, keyed by top-block id. */
  private readonly applied = new Map<string, StackState>();
  /**
   * Top-level stacks that appeared since the last layer-selection change
   * (just created, or split off an existing stack) and aren't members of an
   * active layer. They stay visible so the block someone just dropped doesn't
   * vanish under them; the exemption lasts until the next selection change.
   */
  private readonly exempt = new Set<string>();
  private knownTops = new Set<string>();
  private queued = false;

  private readonly onWorkspaceEvent = (event: Blockly.Events.Abstract) => {
    if (!STRUCTURAL_EVENT_TYPES.has(event.type)) return;
    if (!this.isFilterActive()) return;
    this.scheduleReapply();
  };

  /**
   * @param workspace The one and only workspace being filtered.
   * @param getDesiredTopBlockIds Ids of every stack belonging to an active layer.
   * @param isFilterActive Whether any layer is active (none = show everything,
   *     which is not the same as "active layers with no members").
   */
  constructor(
    private readonly workspace: Blockly.WorkspaceSvg,
    private readonly getDesiredTopBlockIds: () => Set<string>,
    private readonly isFilterActive: () => boolean,
  ) {
    this.workspace.addChangeListener(this.onWorkspaceEvent);
  }

  getMode(): FilterMode {
    return this.mode;
  }

  setMode(mode: FilterMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.apply();
  }

  /** The set of active layers changed: re-filter and bring the result into view. */
  selectionChanged() {
    this.exempt.clear();
    this.knownTops = new Set(this.workspace.getTopBlocks(false).map((b) => b.id));
    this.apply();
    if (this.isFilterActive()) this.fitToVisible();
  }

  /** Membership may have changed under an unchanged selection: re-filter only. */
  reapply() {
    this.apply();
  }

  /**
   * Stacks the user would see right now because they belong to an active
   * layer, not counting temporarily exempt ones.
   */
  private getMemberStacks(): Blockly.BlockSvg[] {
    const desired = this.getDesiredTopBlockIds();
    return this.workspace.getTopBlocks(false).filter((b) => desired.has(b.id));
  }

  /** Scrolls and zooms so every visible member stack is in view. */
  fitToVisible() {
    const stacks = this.getMemberStacks();
    if (!stacks.length) return;
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (const stack of stacks) {
      const r = stack.getBoundingRectangle();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    const metrics = this.workspace.getMetrics();
    const fitScale = Math.min(
      (metrics.viewWidth / this.workspace.getScale()) / (right - left + 2 * FIT_PADDING),
      (metrics.viewHeight / this.workspace.getScale()) / (bottom - top + 2 * FIT_PADDING),
    ) * this.workspace.getScale();
    const minScale = this.workspace.options.zoomOptions?.minScale ?? 0.1;
    this.workspace.setScale(Math.max(minScale, Math.min(1, fitScale)));
    this.workspace.scrollBoundsIntoView(
      new Blockly.utils.Rect(top, bottom, left, right),
      FIT_PADDING,
    );
  }

  /**
   * Stacks the visible member stacks into one column, anchored where the
   * topmost-leftmost one already is. A real, undoable move (one undo group),
   * and only ever run on explicit request.
   */
  arrangeVisible() {
    const stacks = this.getMemberStacks();
    if (stacks.length < 2) return;
    const rects = new Map(stacks.map((s) => [s, s.getBoundingRectangle()]));
    const ordered = [...stacks].sort(
      (a, b) => rects.get(a)!.top - rects.get(b)!.top,
    );
    const anchorLeft = Math.min(...ordered.map((s) => rects.get(s)!.left));
    let cursorY = rects.get(ordered[0])!.top;
    Blockly.Events.setGroup(true);
    try {
      for (const stack of ordered) {
        const r = rects.get(stack)!;
        stack.moveBy(anchorLeft - r.left, cursorY - r.top);
        cursorY += r.bottom - r.top + ARRANGE_GAP;
      }
    } finally {
      Blockly.Events.setGroup(false);
    }
    this.fitToVisible();
  }

  dispose() {
    this.workspace.removeChangeListener(this.onWorkspaceEvent);
    this.exempt.clear();
    this.knownTops.clear();
    for (const block of this.workspace.getTopBlocks(false)) {
      this.setState(block, 'visible');
    }
    this.applied.clear();
  }

  private scheduleReapply() {
    if (this.queued) return;
    this.queued = true;
    Promise.resolve().then(() => {
      this.queued = false;
      if (this.workspace.isDragging()) {
        this.scheduleAfterDrag();
        return;
      }
      this.apply();
    });
  }

  /** Re-filtering mid-drag would hide the stack under the cursor's neighbours. */
  private scheduleAfterDrag() {
    setTimeout(() => this.scheduleReapply(), 100);
  }

  private apply() {
    const filtering = this.isFilterActive();
    const desired = filtering ? this.getDesiredTopBlockIds() : new Set<string>();
    const tops = this.workspace.getTopBlocks(false);
    const present = new Set<string>();
    for (const block of tops) {
      present.add(block.id);
      if (filtering && !this.knownTops.has(block.id) && !desired.has(block.id)) {
        this.exempt.add(block.id);
      }
      const show =
        !filtering || desired.has(block.id) || this.exempt.has(block.id);
      this.setState(block, show ? 'visible' : this.mode);
    }
    this.knownTops = present;
    for (const id of this.applied.keys()) {
      if (!present.has(id)) this.applied.delete(id);
    }
    for (const id of this.exempt) {
      if (!present.has(id)) this.exempt.delete(id);
    }
  }

  private setState(block: Blockly.BlockSvg, state: StackState) {
    const previous = this.applied.get(block.id) ?? 'visible';
    if (previous === state && this.applied.has(block.id)) return;
    this.applied.set(block.id, state);

    const svg = block.getSvgRoot();
    svg.style.display = state === 'hide' ? 'none' : '';
    svg.style.opacity = state === 'dim' ? DIM_OPACITY : '';
    svg.style.pointerEvents = state === 'dim' ? 'none' : '';

    const wasFiltered = previous !== 'visible';
    const isFiltered = state !== 'visible';
    if (wasFiltered === isFiltered) return;
    for (const descendant of block.getDescendants(false)) {
      for (const connection of descendant.getConnections_(true)) {
        connection.setTracking(!isFiltered);
      }
    }
  }
}
