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
import {
  fitFits,
  fitScaleFor,
  MIN_READABLE_SCALE,
  readingOrder,
  stepIndex,
} from './view_policy';

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
  /**
   * The user's scroll and zoom from just before filtering began, put back
   * when the last layer is deactivated. Null while nothing is filtered.
   */
  /** Id of the stack last stepped to, so Next/Previous continue from it. */
  private stepId: string | null = null;
  /** Called when the stepping position changes, so the panel can redraw. */
  onStepChange: (() => void) | null = null;
  private restoreNavigator: (() => void) | null = null;
  /** Stacks currently drawn with the multi-stack "selected" mark. */
  private readonly marked = new Set<string>();
  private savedView: {scale: number; scrollX: number; scrollY: number} | null =
    null;

  private readonly onWorkspaceEvent = (event: Blockly.Events.Abstract) => {
    if (event.type === Blockly.Events.SELECTED) {
      this.followSelection(event as Blockly.Events.Selected);
      return;
    }
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
    private readonly minReadableScale: number = MIN_READABLE_SCALE,
  ) {
    this.workspace.addChangeListener(this.onWorkspaceEvent);
    this.workspace
      .getParentSvg()
      .addEventListener('pointerdown', this.onPointerDown, true);
    this.restrictKeyboardNavigation();
  }

  /**
   * Blockly's keyboard navigation (N / B, and arrowing past the end of a
   * stack) walks every top-level stack, including ones dimmed or hidden by a
   * layer filter. Skip those while filtering, so keyboard users only land on
   * stacks they can see.
   */
  private restrictKeyboardNavigation() {
    const navigator = this.workspace.getNavigator();
    const original = navigator.navigateStacks;
    const wrapped = (current: Blockly.IFocusableNode, delta: number) => {
      let target = original.call(navigator, current, delta);
      if (!this.isFilterActive()) return target;
      const limit = this.workspace.getTopBlocks(false).length;
      for (let i = 0; target && i < limit; i++) {
        const root =
          navigator.getSourceBlockFromNode(target)?.getRootBlock() ?? target;
        if (this.isStackVisible((root as Blockly.BlockSvg).id)) return target;
        target = original.call(navigator, target, delta);
      }
      return null;
    };
    navigator.navigateStacks = wrapped;
    this.restoreNavigator = () => {
      if (navigator.navigateStacks === wrapped) {
        navigator.navigateStacks = original;
      }
    };
  }

  private isStackVisible(id: string): boolean {
    return (this.applied.get(id) ?? 'visible') === 'visible';
  }

  /** Keeps the stepping position in line with Blockly's own navigation. */
  private followSelection(event: Blockly.Events.Selected) {
    if (!this.isFilterActive() || !event.newElementId) return;
    const block = this.workspace.getBlockById(event.newElementId);
    const id = block?.getRootBlock().id ?? null;
    if (!id || id === this.stepId) return;
    if (!this.getMemberStacks().some((s) => s.id === id)) return;
    this.stepId = id;
    this.onStepChange?.();
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
    const filtering = this.isFilterActive();
    if (filtering && !this.savedView) this.saveView();
    this.exempt.clear();
    this.knownTops = new Set(this.workspace.getTopBlocks(false).map((b) => b.id));
    this.apply();
    this.stepId = null;
    this.clearMarks();
    if (filtering) {
      this.fitToVisible();
    } else {
      this.restoreView();
    }
  }

  private inReadingOrder(stacks: Blockly.BlockSvg[]): Blockly.BlockSvg[] {
    return readingOrder(stacks, (s) => s.getBoundingRectangle(), this.workspace.RTL);
  }

  /**
   * Brings one stack into view at the current zoom: centred if it fits,
   * otherwise its top corner (Blockly's scroll prefers the top-left).
   */
  private focusStack(stack: Blockly.BlockSvg) {
    const r = stack.getBoundingRectangle();
    const metrics = this.workspace.getMetrics();
    const scale = this.workspace.getScale();
    const fits =
      (r.right - r.left + 2 * FIT_PADDING) * scale <= metrics.viewWidth &&
      (r.bottom - r.top + 2 * FIT_PADDING) * scale <= metrics.viewHeight;
    if (fits) {
      this.workspace.centerOnBlock(stack.id);
    } else {
      this.workspace.scrollBoundsIntoView(
        new Blockly.utils.Rect(r.top, r.bottom, r.left, r.right),
        FIT_PADDING,
      );
    }
  }

  /**
   * Centres the next (or previous) member stack at the current zoom,
   * wrapping around, and selects it so Blockly's own highlight shows which
   * one it is. Does not touch the saved view.
   */
  step(delta: 1 | -1) {
    this.clearMarks();
    const stacks = this.inReadingOrder(this.getMemberStacks());
    const current = stacks.findIndex((s) => s.id === this.stepId);
    const next = stepIndex(current, delta, stacks.length);
    if (next < 0) return;
    this.stepId = stacks[next].id;
    this.focusStack(stacks[next]);
    Blockly.common.setSelected(stacks[next]);
  }

  /** Where stepping is: `index` is -1 until the first step. */
  getStepInfo(): {index: number; total: number} {
    const stacks = this.inReadingOrder(this.getMemberStacks());
    return {
      index: stacks.findIndex((s) => s.id === this.stepId),
      total: stacks.length,
    };
  }

  private saveView() {
    this.savedView = {
      scale: this.workspace.getScale(),
      scrollX: this.workspace.scrollX,
      scrollY: this.workspace.scrollY,
    };
  }

  private restoreView() {
    const view = this.savedView;
    if (!view) return;
    this.savedView = null;
    this.workspace.setScale(view.scale);
    this.workspace.scroll(view.scrollX, view.scrollY);
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

  /**
   * Zooms and scrolls so every member stack is in view, but never below a
   * readable scale: if they cannot all fit at that scale, the first one (in
   * reading order) is shown and Next/Previous reach the rest.
   */
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
    const bounds = {left, top, right, bottom};
    const metrics = this.workspace.getMetrics();
    const scale = fitScaleFor(
      bounds,
      metrics.viewWidth,
      metrics.viewHeight,
      FIT_PADDING,
      Math.max(
        this.minReadableScale,
        this.workspace.options.zoomOptions?.minScale ?? 0,
      ),
    );
    this.workspace.setScale(scale);
    if (fitFits(bounds, metrics.viewWidth, metrics.viewHeight, FIT_PADDING, scale)) {
      this.workspace.scrollBoundsIntoView(
        new Blockly.utils.Rect(top, bottom, left, right),
        FIT_PADDING,
      );
    } else {
      this.focusStack(this.inReadingOrder(stacks)[0]);
    }
    this.markStacks(stacks);
  }

  /**
   * Draws every given stack with the renderer's "selected" styling. Blockly
   * itself only supports one selected block, so this is a visual mark only:
   * nothing is really selected, and copy/delete/drag act as usual. It lasts
   * until the next fit, step, or a pointer press on the workspace.
   */
  private markStacks(stacks: Blockly.BlockSvg[]) {
    this.clearMarks();
    for (const stack of stacks) {
      stack.pathObject.updateSelected(true);
      this.marked.add(stack.id);
    }
  }

  private clearMarks() {
    const selected = Blockly.common.getSelected();
    for (const id of this.marked) {
      const block = this.workspace.getBlockById(id) as Blockly.BlockSvg | null;
      // The one block Blockly really has selected keeps its own highlight.
      if (block && block !== selected) block.pathObject.updateSelected(false);
    }
    this.marked.clear();
  }

  private readonly onPointerDown = () => this.clearMarks();

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
    this.workspace
      .getParentSvg()
      .removeEventListener('pointerdown', this.onPointerDown, true);
    this.clearMarks();
    this.restoreNavigator?.();
    this.restoreNavigator = null;
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
