/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview The common interface every origin of layer membership
 * (manual, static block-type-list, dynamic/auto-derived) implements, so
 * {@link LayersPlugin} can treat them uniformly.
 */
import type * as Blockly from 'blockly/core';

import type {LayerDefinition} from '../layer_types';

/**
 * A source of layers and their membership. Every layer id a source produces
 * must be prefixed with `${kind}:`, which is how {@link LayersPlugin} routes
 * a given active layer id back to the source that understands it.
 */
export interface LayerSource {
  /** Namespaces this source's layer ids; must be unique across all sources. */
  readonly kind: string;

  /** Heading shown above this source's layers in the layer panel. */
  readonly sectionTitle: string;

  /** The layers this source currently offers. */
  getLayers(mainWorkspace: Blockly.Workspace): LayerDefinition[];

  /**
   * The top-level block ids in `mainWorkspace` that belong to `layerId`
   * (one of this source's own, `${kind}:`-prefixed ids).
   */
  getMembers(
    mainWorkspace: Blockly.Workspace,
    layerId: string,
  ): Set<string>;
}
