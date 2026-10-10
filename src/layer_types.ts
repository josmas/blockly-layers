/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Public configuration types for the layers plugin.
 */

/**
 * A single configurable "layer": a named, user-toggleable group of block
 * types. When active, every block of a listed type (plus its full nested
 * contents) is mirrored into the shared layer workspace.
 */
export interface LayerDefinition {
  /** Unique identifier for this layer. */
  id: string;

  /** Display name shown in the layer panel. */
  name: string;

  /** Block type names that belong to this layer. */
  blockTypes: string[];

  /** Optional swatch color shown next to the layer name in the panel. */
  color?: string;

  /** Optional icon (e.g. a data URI or emoji) shown next to the layer name. */
  icon?: string;
}

/** Options accepted by the {@link LayersPlugin} constructor. */
export interface LayersPluginOptions {
  /** The layers to configure initially. More can be added later via the API. */
  layers: LayerDefinition[];
}
