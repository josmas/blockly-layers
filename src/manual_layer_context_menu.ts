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

export class ManualLayerContextMenu {
  private readonly registeredLayerItemIds = new Set<string>();
  private readonly newLayerItemId: string;

  constructor(
    private readonly mainWorkspace: Blockly.Workspace,
    private readonly manualSource: ManualSource,
  ) {
    this.newLayerItemId = NEW_LAYER_ITEM_ID_PREFIX + mainWorkspace.id;
  }

  init() {
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

    for (const layer of this.manualSource.getLayers()) {
      const itemId = ITEM_ID_PREFIX + this.mainWorkspace.id + ':' + layer.id;
      Blockly.ContextMenuRegistry.registry.register({
        id: itemId,
        scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
        weight: 100,
        displayText: (scope) => {
          const topBlock = scope.block?.getRootBlock();
          const assigned = topBlock
            ? this.manualSource.isAssigned(topBlock.id, layer.id)
            : false;
          return (assigned ? '✓ ' : '') + layer.name;
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
    }
  }

  private registerNewLayerItem() {
    Blockly.ContextMenuRegistry.registry.register({
      id: this.newLayerItemId,
      scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
      weight: 99,
      displayText: () => 'New layer...',
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
