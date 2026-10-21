/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Wraps a {@link DynamicLayerProvider} into a {@link LayerSource}:
 * one auto-generated layer per distinct key the provider extracts from any
 * block in the project, recomputed on demand (never persisted).
 */
import type * as Blockly from 'blockly/core';

import type {DynamicLayerProvider, LayerDefinition} from '../../layer_types';
import type {LayerSource} from '../types';

export class DynamicSource implements LayerSource {
  readonly kind: string;
  readonly sectionTitle: string;

  constructor(private readonly provider: DynamicLayerProvider) {
    this.kind = `dynamic:${provider.key}`;
    this.sectionTitle = provider.sectionTitle;
  }

  getLayers(mainWorkspace: Blockly.Workspace): LayerDefinition[] {
    const keys = new Set<string>();
    for (const block of mainWorkspace.getAllBlocks(false)) {
      const key = this.provider.extractKey(block);
      if (key) keys.add(key);
    }
    return [...keys]
      .sort()
      .map((key) => ({id: `${this.kind}:${key}`, name: key}));
  }

  getMembers(mainWorkspace: Blockly.Workspace, layerId: string): Set<string> {
    const targetKey = layerId.slice(this.kind.length + 1);
    const members = new Set<string>();
    for (const topBlock of mainWorkspace.getTopBlocks(false)) {
      for (const block of topBlock.getDescendants(false)) {
        if (this.provider.extractKey(block) === targetKey) {
          members.add(topBlock.id);
          break;
        }
      }
    }
    return members;
  }
}
