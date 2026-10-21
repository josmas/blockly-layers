/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Bidirectional reconciliation between the main workspace and
 * the single shared layer workspace.
 *
 * Every block that is mirrored keeps the SAME block id in both workspaces
 * (ids are only unique within one workspace in Blockly core), which is what
 * lets this engine key all of its bookkeeping off a plain block id rather
 * than a separate id-mapping table.
 *
 * Two propagation paths are used, chosen per event:
 *  - Field/value-only changes (block field edits, variable rename/create/
 *    delete) are relayed directly and cheaply by replaying a cloned event on
 *    the other workspace.
 *  - Structural changes (block create/delete/reconnect) are handled by a
 *    debounced full reconciliation pass that diffs each mirrored "root"
 *    block's serialized content against what was last synced, and only
 *    touches the roots that actually changed. This is what lets a block's
 *    position inside the layer workspace survive unrelated edits elsewhere.
 */
import * as Blockly from "blockly/core";

const STRUCTURAL_EVENT_TYPES = new Set<string>([
  Blockly.Events.BLOCK_CREATE,
  Blockly.Events.BLOCK_DELETE,
  Blockly.Events.BLOCK_MOVE,
]);

// Blockly.Events does not export a named shorthand constant for this one
// (unlike VAR_CREATE/VAR_DELETE/VAR_RENAME), so the literal is used as-is.
const VAR_TYPE_CHANGE = "var_type_change";

const VARIABLE_EVENT_TYPES = new Set<string>([
  Blockly.Events.VAR_CREATE,
  Blockly.Events.VAR_DELETE,
  Blockly.Events.VAR_RENAME,
  VAR_TYPE_CHANGE,
]);

const MARGIN_X = 20;
const MARGIN_Y = 20;
const GAP_Y = 20;

type Side = "main" | "layer";

/**
 * Owns the sync relationship between the main workspace and the layer
 * workspace for as long as the layer workspace exists. Call
 * {@link attachToLayerWorkspace} once the layer workspace is created, and
 * {@link detachFromLayerWorkspace} right before it's disposed.
 */
export class SyncEngine {
  /** The layer workspace, once one exists. */
  private layerWorkspace: Blockly.WorkspaceSvg | null = null;

  /** Last-synced serialized content of each mirrored root, keyed by id. */
  private readonly rootSnapshot = new Map<string, string>();

  /** All block ids currently mirrored, grouped by the root that owns them. */
  private readonly rootMembers = new Map<string, Set<string>>();

  /** Root ids that originated in the layer workspace, not from a type match. */
  private readonly manuallyAdded = new Set<string>();

  private applyingToMain = false;
  private applyingToLayer = false;
  private reconcileQueued = false;
  private pendingSide: Side = "main";

  private layerStackCursorY = MARGIN_Y;

  private readonly onMainEvent = (event: Blockly.Events.Abstract) => {
    this.handleEvent(event, "main");
  };

  private readonly onLayerEvent = (event: Blockly.Events.Abstract) => {
    this.handleEvent(event, "layer");
  };

  /**
   * @param mainWorkspace The always-visible, full project workspace.
   * @param getDesiredTopBlockIds Returns the ids of every top-level stack
   *     that should currently be mirrored, as computed by the active
   *     layers' sources. Called fresh on every reconciliation pass.
   */
  constructor(
    private readonly mainWorkspace: Blockly.WorkspaceSvg,
    private readonly getDesiredTopBlockIds: () => Set<string>,
  ) {
    this.mainWorkspace.addChangeListener(this.onMainEvent);
  }

  /** Starts mirroring into a freshly created layer workspace. */
  attachToLayerWorkspace(layerWorkspace: Blockly.WorkspaceSvg) {
    this.layerWorkspace = layerWorkspace;
    this.layerStackCursorY = MARGIN_Y;
    layerWorkspace.addChangeListener(this.onLayerEvent);
    this.reconcile("main");
  }

  /** Stops mirroring; call right before disposing the layer workspace. */
  detachFromLayerWorkspace() {
    if (!this.layerWorkspace) return;
    this.layerWorkspace.removeChangeListener(this.onLayerEvent);
    this.layerWorkspace = null;
    this.rootSnapshot.clear();
    this.rootMembers.clear();
    this.manuallyAdded.clear();
  }

  /** Fully tears down this engine. Call when the owning plugin is disposed. */
  dispose() {
    this.detachFromLayerWorkspace();
    this.mainWorkspace.removeChangeListener(this.onMainEvent);
  }

  /**
   * Call after the set of active layers changes (a checkbox was toggled).
   * Not triggered by a workspace event, so it's requested explicitly.
   */
  notifyActiveLayersChanged() {
    this.reconcile("main", {honorManuallyAdded: false});
  }

  private handleEvent(event: Blockly.Events.Abstract, side: Side) {
    if (!this.layerWorkspace) return;
    if (side === "main" && this.applyingToMain) return;
    if (side === "layer" && this.applyingToLayer) return;

    if (event.type === Blockly.Events.BLOCK_CHANGE) {
      const blockId = (event as Blockly.Events.BlockChange).blockId;
      if (blockId && this.isMirrored(blockId)) {
        this.relay(event, side === "main" ? "layer" : "main");
      }
      return;
    }
    if (VARIABLE_EVENT_TYPES.has(event.type)) {
      this.relay(event, side === "main" ? "layer" : "main");
      return;
    }
    if (STRUCTURAL_EVENT_TYPES.has(event.type)) {
      this.scheduleReconcile(side);
    }
  }

  private isMirrored(blockId: string): boolean {
    for (const members of this.rootMembers.values()) {
      if (members.has(blockId)) return true;
    }
    return false;
  }

  /** Replays `event` on `targetSide`'s workspace, guarded against echoing. */
  private relay(event: Blockly.Events.Abstract, targetSide: Side) {
    const targetWorkspace =
      targetSide === "main" ? this.mainWorkspace : this.layerWorkspace;
    if (!targetWorkspace) return;
    this.withGuard(targetSide, () => {
      const cloned = Blockly.Events.fromJson(event.toJson(), targetWorkspace);
      cloned.run(true);
    });
  }

  private scheduleReconcile(side: Side) {
    this.pendingSide = side;
    if (this.reconcileQueued) return;
    this.reconcileQueued = true;
    Promise.resolve().then(() => {
      this.reconcileQueued = false;
      this.reconcile(this.pendingSide);
    });
  }

  /**
   * Recomputes which blocks should be mirrored and pushes any structural
   * drift in either direction. `triggeringSide` is only used to decide
   * whether to first look for edits made directly in the layer workspace;
   * the pass against the main workspace's current matches always runs, so
   * layer toggles and main-side edits are both picked up regardless of
   * which side triggered this call.
   *
   * `honorManuallyAdded` controls whether a block created directly in the
   * layer workspace (and not matching any active layer's types) is exempt
   * from type-based pruning. It defaults to true so a block someone just
   * created doesn't vanish in the very same reconciliation pass that
   * registers it, but an explicit layer-selection change (see
   * {@link notifyActiveLayersChanged}) passes false: deliberately changing
   * which layers are checked is a request to show exactly what matches, so
   * a manually-added block only gets to outlive the layer selection that
   * was active when it was created, not every selection after it.
   */
  private reconcile(
    triggeringSide: Side,
    {honorManuallyAdded = true}: {honorManuallyAdded?: boolean} = {},
  ) {
    const layerWorkspace = this.layerWorkspace;
    if (!layerWorkspace) return;

    if (triggeringSide === "layer") {
      this.reconcileFromLayer(layerWorkspace);
    }
    this.reconcileFromMain(layerWorkspace, honorManuallyAdded);
  }

  private reconcileFromLayer(layerWorkspace: Blockly.WorkspaceSvg) {
    // Whole roots deleted directly in the layer workspace.
    for (const rootId of [...this.rootSnapshot.keys()]) {
      if (!layerWorkspace.getBlockById(rootId)) {
        this.deleteRootFromMain(rootId);
      }
    }

    // New roots, and structural drift in existing roots. A root already
    // tracked in rootSnapshot is NEVER "new" — even if, for whatever
    // transient reason, a lookup in main doesn't find it right now —
    // because pushing it again would ask serialization.blocks.append for an
    // id that's already taken in main. Blockly doesn't error on that; it
    // silently mints a fresh id for the duplicate (see Block's constructor),
    // which then collides on name with the original and gets auto-renamed —
    // i.e. exactly a phantom second procedure/variable/etc. appearing.
    for (const layerRoot of layerWorkspace.getTopBlocks(false)) {
      const rootId = layerRoot.id;
      if (
        !this.rootSnapshot.has(rootId) &&
        !this.mainWorkspace.getBlockById(rootId)
      ) {
        this.pushNewRootToMain(layerRoot);
        continue;
      }
      const snapshot = this.snapshotOf(layerRoot);
      if (this.rootSnapshot.get(rootId) !== snapshot) {
        this.refreshRootInMain(rootId, layerRoot, snapshot);
      }
    }
  }

  private reconcileFromMain(
    layerWorkspace: Blockly.WorkspaceSvg,
    honorManuallyAdded: boolean,
  ) {
    const desiredRootIds = new Set(this.getDesiredTopBlockIds());
    if (honorManuallyAdded) {
      for (const id of this.manuallyAdded) {
        if (this.mainWorkspace.getBlockById(id)) desiredRootIds.add(id);
      }
    } else {
      // The active layers just changed deliberately: a manually-added block
      // only gets to survive up through this point, not indefinitely.
      for (const id of [...this.manuallyAdded]) {
        if (!desiredRootIds.has(id)) this.manuallyAdded.delete(id);
      }
    }

    for (const rootId of [...this.rootSnapshot.keys()]) {
      if (!desiredRootIds.has(rootId)) {
        this.removeRootFromLayer(rootId);
      }
    }

    for (const rootId of desiredRootIds) {
      const mainBlock = this.mainWorkspace.getBlockById(rootId);
      if (!mainBlock) continue;
      const snapshot = this.snapshotOf(mainBlock);
      if (!this.rootSnapshot.has(rootId)) {
        this.appendNewRootToLayer(mainBlock, snapshot, layerWorkspace);
      } else if (this.rootSnapshot.get(rootId) !== snapshot) {
        this.refreshRootInLayer(rootId, mainBlock, snapshot, layerWorkspace);
      }
    }
  }

  private snapshotOf(block: Blockly.Block): string {
    return JSON.stringify(Blockly.serialization.blocks.save(block));
  }

  private trackRoot(rootId: string, root: Blockly.Block, snapshot: string) {
    const members = new Set<string>([
      rootId,
      ...root.getDescendants(false).map((d) => d.id),
    ]);
    this.rootMembers.set(rootId, members);
    this.rootSnapshot.set(rootId, snapshot);
  }

  private forgetRoot(rootId: string) {
    this.rootMembers.delete(rootId);
    this.rootSnapshot.delete(rootId);
    this.manuallyAdded.delete(rootId);
  }

  private withGuard(side: Side, fn: () => void) {
    if (side === "main") {
      this.applyingToMain = true;
      try {
        fn();
      } finally {
        this.applyingToMain = false;
      }
    } else {
      this.applyingToLayer = true;
      try {
        fn();
      } finally {
        this.applyingToLayer = false;
      }
    }
  }

  private appendNewRootToLayer(
    mainBlock: Blockly.Block,
    snapshot: string,
    layerWorkspace: Blockly.WorkspaceSvg,
  ) {
    let newBlock!: Blockly.BlockSvg;
    this.withGuard("layer", () => {
      const state = Blockly.serialization.blocks.save(mainBlock)!;
      newBlock = Blockly.serialization.blocks.append(
        state,
        layerWorkspace,
      ) as Blockly.BlockSvg;
      this.placeAtLayerStackCursor(newBlock);
    });
    this.trackRoot(mainBlock.id, newBlock, snapshot);
  }

  private refreshRootInLayer(
    rootId: string,
    mainBlock: Blockly.Block,
    snapshot: string,
    layerWorkspace: Blockly.WorkspaceSvg,
  ) {
    let newBlock!: Blockly.BlockSvg;
    this.withGuard("layer", () => {
      const oldBlock = layerWorkspace.getBlockById(
        rootId,
      ) as Blockly.BlockSvg | null;
      const pos = oldBlock ? oldBlock.getRelativeToSurfaceXY() : null;
      oldBlock?.dispose(false);
      const state = Blockly.serialization.blocks.save(mainBlock)!;
      newBlock = Blockly.serialization.blocks.append(
        state,
        layerWorkspace,
      ) as Blockly.BlockSvg;
      if (pos) {
        const newPos = newBlock.getRelativeToSurfaceXY();
        newBlock.moveBy(pos.x - newPos.x, pos.y - newPos.y);
      } else {
        this.placeAtLayerStackCursor(newBlock);
      }
    });
    this.trackRoot(rootId, newBlock, snapshot);
  }

  private removeRootFromLayer(rootId: string) {
    this.withGuard("layer", () => {
      this.layerWorkspace?.getBlockById(rootId)?.dispose(false);
    });
    this.forgetRoot(rootId);
  }

  private pushNewRootToMain(layerBlock: Blockly.Block) {
    let newBlock!: Blockly.BlockSvg;
    this.withGuard("main", () => {
      const state = Blockly.serialization.blocks.save(layerBlock)!;
      newBlock = Blockly.serialization.blocks.append(
        state,
        this.mainWorkspace,
      ) as Blockly.BlockSvg;
      this.placeBelowMainTopBlocks(newBlock);
    });
    this.manuallyAdded.add(layerBlock.id);
    this.trackRoot(layerBlock.id, layerBlock, this.snapshotOf(layerBlock));
  }

  private refreshRootInMain(
    rootId: string,
    layerBlock: Blockly.Block,
    snapshot: string,
  ) {
    let newBlock!: Blockly.BlockSvg;
    this.withGuard("main", () => {
      const oldBlock = this.mainWorkspace.getBlockById(
        rootId,
      ) as Blockly.BlockSvg | null;
      const pos = oldBlock ? oldBlock.getRelativeToSurfaceXY() : null;
      oldBlock?.dispose(false);
      const state = Blockly.serialization.blocks.save(layerBlock)!;
      newBlock = Blockly.serialization.blocks.append(
        state,
        this.mainWorkspace,
      ) as Blockly.BlockSvg;
      if (pos) {
        const newPos = newBlock.getRelativeToSurfaceXY();
        newBlock.moveBy(pos.x - newPos.x, pos.y - newPos.y);
      } else {
        this.placeBelowMainTopBlocks(newBlock);
      }
    });
    this.trackRoot(rootId, layerBlock, snapshot);
  }

  private deleteRootFromMain(rootId: string) {
    this.withGuard("main", () => {
      this.mainWorkspace.getBlockById(rootId)?.dispose(false);
    });
    this.forgetRoot(rootId);
  }

  private placeAtLayerStackCursor(block: Blockly.BlockSvg) {
    const xy = block.getRelativeToSurfaceXY();
    block.moveBy(MARGIN_X - xy.x, this.layerStackCursorY - xy.y);
    const { height } = block.getHeightWidth();
    this.layerStackCursorY += height + GAP_Y;
  }

  private placeBelowMainTopBlocks(block: Blockly.BlockSvg) {
    let maxBottom = 0;
    let minX = Infinity;
    for (const top of this.mainWorkspace.getTopBlocks(false)) {
      if (top.id === block.id) continue;
      const xy = top.getRelativeToSurfaceXY();
      const { height } = top.getHeightWidth();
      maxBottom = Math.max(maxBottom, xy.y + height);
      minX = Math.min(minX, xy.x);
    }
    if (!isFinite(minX)) minX = MARGIN_X;
    const xy = block.getRelativeToSurfaceXY();
    block.moveBy(minX - xy.x, maxBottom + GAP_Y - xy.y);
  }
}
