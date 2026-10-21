/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Registers the "Add to layer..." context menu action used to
 * assign a top-level stack to a manual layer. Scoped to blocks in the main
 * workspace only — assigning layers from within the (already-filtered)
 * layer workspace isn't supported.
 */
import * as Blockly from 'blockly/core';

import type {ManualSource} from './layer_sources/manual_source';

const ITEM_ID_PREFIX = 'blockly-layers-assign:';
const NEW_LAYER_ITEM_ID_PREFIX = 'blockly-layers-new-layer:';
const FRAME_ITEM_ID_PREFIX = 'blockly-layers-frame:';

/**
 * Blockly 13 context menus have no submenus, so the layer items are set apart
 * from the stock ones by a separator, a disabled "Layers" heading, a
 * "Layer: " label prefix, and a closing separator. Weights keep the group
 * contiguous; the stock items sit well clear of this range.
 */
const WEIGHT_TOP_SEPARATOR = 98;
const WEIGHT_HEADING = 98.1;
const WEIGHT_NEW_LAYER = 99;
const WEIGHT_LAYER_BASE = 100;
const WEIGHT_BOTTOM_SEPARATOR = 101;
const LABEL_PREFIX = 'Layer: ';

export class ManualLayerContextMenu {
  private readonly registeredLayerItemIds = new Set<string>();
  private readonly newLayerItemId: string;
  private readonly frameItemIds: string[];

  constructor(
    private readonly mainWorkspace: Blockly.Workspace,
    private readonly manualSource: ManualSource,
  ) {
    this.newLayerItemId = NEW_LAYER_ITEM_ID_PREFIX + mainWorkspace.id;
    this.frameItemIds = ['top-separator', 'heading', 'bottom-separator'].map(
      (name) => FRAME_ITEM_ID_PREFIX + name + ':' + mainWorkspace.id,
    );
  }

  init() {
    this.registerFrameItems();
    this.registerNewLayerItem();
    this.sync();
    this.manualSource.onChange(() => this.sync());
  }

  dispose() {
    for (const id of this.registeredLayerItemIds) {
      Blockly.ContextMenuRegistry.registry.unregister(id);
    }
    this.registeredLayerItemIds.clear();
    Blockly.ContextMenuRegistry.registry.unregister(this.newLayerItemId);
    for (const id of this.frameItemIds) {
      Blockly.ContextMenuRegistry.registry.unregister(id);
    }
  }

  private isOwnScope(scope: Blockly.ContextMenuRegistry.Scope): boolean {
    return scope.block?.workspace === this.mainWorkspace;
  }

  /** Re-registers one toggle item per current manual layer. */
  private sync() {
    for (const id of this.registeredLayerItemIds) {
      Blockly.ContextMenuRegistry.registry.unregister(id);
    }
    this.registeredLayerItemIds.clear();

    const layers = this.manualSource.getLayers();
    layers.forEach((layer, index) => {
      const itemId = ITEM_ID_PREFIX + this.mainWorkspace.id + ':' + layer.id;
      Blockly.ContextMenuRegistry.registry.register({
        id: itemId,
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        // Tiny per-layer offset keeps creation order stable among equal weights.
        weight: WEIGHT_LAYER_BASE + index / 1000,
        displayText: (scope) => {
          const topBlock = scope.block?.getRootBlock();
          const assigned = topBlock
            ? this.manualSource.isAssigned(topBlock.id, layer.id)
            : false;
          return (assigned ? '✓ ' : '') + LABEL_PREFIX + layer.name;
        },
        preconditionFn: (scope) =>
          this.isOwnScope(scope) ? 'enabled' : 'hidden',
        callback: (scope) => {
          const topBlock = scope.block?.getRootBlock();
          if (!topBlock) return;
          if (this.manualSource.isAssigned(topBlock.id, layer.id)) {
            this.manualSource.unassign(topBlock.id, layer.id);
          } else {
            this.manualSource.assign(topBlock.id, layer.id);
          }
        },
      });
      this.registeredLayerItemIds.add(itemId);
    });
  }

  private registerFrameItems() {
    const [topSeparator, heading, bottomSeparator] = this.frameItemIds;
    const registry = Blockly.ContextMenuRegistry.registry;
    const scopeType = Blockly.ContextMenuRegistry.ScopeType.BLOCK;
    const precondition = (visible: string) => (
      scope: Blockly.ContextMenuRegistry.Scope,
    ) => (this.isOwnScope(scope) ? visible : 'hidden');

    registry.register({
      id: topSeparator,
      scopeType,
      weight: WEIGHT_TOP_SEPARATOR,
      separator: true,
      preconditionFn: precondition('enabled'),
    });
    registry.register({
      id: heading,
      scopeType,
      weight: WEIGHT_HEADING,
      displayText: 'Layers',
      preconditionFn: precondition('disabled'),
      callback: () => {},
    });
    registry.register({
      id: bottomSeparator,
      scopeType,
      weight: WEIGHT_BOTTOM_SEPARATOR,
      separator: true,
      preconditionFn: precondition('enabled'),
    });
  }

  private registerNewLayerItem() {
    Blockly.ContextMenuRegistry.registry.register({
      id: this.newLayerItemId,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: WEIGHT_NEW_LAYER,
      displayText: () => '+ New layer...',
      preconditionFn: (scope) =>
        this.isOwnScope(scope) ? 'enabled' : 'hidden',
      callback: (scope) => {
        const topBlock = scope.block?.getRootBlock();
        if (!topBlock) return;
        const name = window.prompt('New layer name:');
        if (!name) return;
        const layerId = this.manualSource.createLayer(name);
        this.manualSource.assign(topBlock.id, layerId);
      },
    });
  }
}
