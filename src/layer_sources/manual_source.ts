/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview The manual, author-curated layer source — the primary way
 * to organize a large project. A project author assigns top-level stacks to
 * named layers (via the context menu registered in
 * `manual_layer_context_menu.ts`); membership is persisted with the project
 * through `layers_serializer.ts`.
 */
import * as Blockly from 'blockly/core';

import type {LayerDefinition} from '../layer_types';
import type {LayerSource} from './types';

/** The shape persisted by `layers_serializer.ts`. */
export interface ManualLayerState {
  layers: LayerDefinition[];
  membership: {[topBlockId: string]: string[]};
}

export class ManualSource implements LayerSource {
  readonly kind = 'manual';
  readonly sectionTitle = 'Layers';

  private layers: LayerDefinition[] = [];
  /** Top-level block id -> set of raw (unprefixed) layer ids. */
  private readonly membership = new Map<string, Set<string>>();
  private readonly changeListeners: Array<() => void> = [];

  /** Called whenever a layer or assignment is created, removed, or changed. */
  onChange(listener: () => void) {
    this.changeListeners.push(listener);
  }

  getLayers(): LayerDefinition[] {
    return this.layers.map((layer) => ({
      ...layer,
      id: `${this.kind}:${layer.id}`,
    }));
  }

  getMembers(
    _mainWorkspace: Blockly.Workspace,
    layerId: string,
  ): Set<string> {
    const rawId = this.stripPrefix(layerId);
    const members = new Set<string>();
    for (const [topBlockId, layerIds] of this.membership) {
      if (layerIds.has(rawId)) members.add(topBlockId);
    }
    return members;
  }

  /** Creates a new manual layer and returns its namespaced id. */
  createLayer(name: string, opts: {color?: string; icon?: string} = {}): string {
    const rawId = Blockly.utils.idGenerator.genUid();
    this.layers.push({id: rawId, name, color: opts.color, icon: opts.icon});
    this.notifyChange();
    return `${this.kind}:${rawId}`;
  }

  /** Removes a manual layer and every stack's assignment to it. */
  removeLayer(layerId: string) {
    const rawId = this.stripPrefix(layerId);
    const before = this.layers.length;
    this.layers = this.layers.filter((layer) => layer.id !== rawId);
    if (this.layers.length === before) return;
    for (const layerIds of this.membership.values()) {
      layerIds.delete(rawId);
    }
    this.notifyChange();
  }

  isAssigned(topBlockId: string, layerId: string): boolean {
    return this.membership.get(topBlockId)?.has(this.stripPrefix(layerId)) ?? false;
  }

  assign(topBlockId: string, layerId: string) {
    const rawId = this.stripPrefix(layerId);
    if (!this.layers.some((layer) => layer.id === rawId)) return;
    let layerIds = this.membership.get(topBlockId);
    if (!layerIds) {
      layerIds = new Set();
      this.membership.set(topBlockId, layerIds);
    }
    layerIds.add(rawId);
    this.notifyChange();
  }

  unassign(topBlockId: string, layerId: string) {
    const layerIds = this.membership.get(topBlockId);
    if (!layerIds?.delete(this.stripPrefix(layerId))) return;
    if (layerIds.size === 0) this.membership.delete(topBlockId);
    this.notifyChange();
  }

  // --- persistence, used by layers_serializer.ts ---

  exportState(): ManualLayerState {
    const membership: {[topBlockId: string]: string[]} = {};
    for (const [topBlockId, layerIds] of this.membership) {
      membership[topBlockId] = [...layerIds];
    }
    return {layers: this.layers.map((layer) => ({...layer})), membership};
  }

  importState(state: ManualLayerState) {
    this.layers = state.layers.map((layer) => ({...layer}));
    this.membership.clear();
    for (const [topBlockId, layerIds] of Object.entries(state.membership)) {
      this.membership.set(topBlockId, new Set(layerIds));
    }
    this.notifyChange();
  }

  clear() {
    this.layers = [];
    this.membership.clear();
    this.notifyChange();
  }

  private stripPrefix(layerId: string): string {
    return layerId.slice(this.kind.length + 1);
  }

  private notifyChange() {
    for (const listener of this.changeListeners) listener();
  }
}
