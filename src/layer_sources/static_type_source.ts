/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview The installer-configured, block-type-list layer source —
 * the original v1 mechanism, kept as a secondary filter alongside manual
 * and dynamic layers.
 */
import type * as Blockly from 'blockly/core';

import {getMatchingTopBlocks} from '../block_matcher';
import type {LayerDefinition, StaticLayerDefinition} from '../layer_types';
import type {LayerSource} from './types';

export class StaticTypeSource implements LayerSource {
  readonly kind = 'static';
  readonly sectionTitle = 'Filters';

  constructor(private readonly layers: StaticLayerDefinition[]) {}

  getLayers(): LayerDefinition[] {
    return this.layers.map((layer) => ({
      id: `${this.kind}:${layer.id}`,
      name: layer.name,
      color: layer.color,
      icon: layer.icon,
    }));
  }

  getMembers(mainWorkspace: Blockly.Workspace, layerId: string): Set<string> {
    const rawId = layerId.slice(this.kind.length + 1);
    const layer = this.layers.find((l) => l.id === rawId);
    if (!layer) return new Set();
    const activeTypes = new Set(layer.blockTypes);
    return new Set(
      getMatchingTopBlocks(mainWorkspace, activeTypes).map((b) => b.id),
    );
  }
}
