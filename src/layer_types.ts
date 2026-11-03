/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Public configuration types for the layers plugin.
 */
import type * as Blockly from 'blockly/core';

/**
 * A named, user-toggleable group of top-level stacks ("islands" — event
 * handlers, procedure definitions, variable inits: anything that is its own
 * entry in `workspace.getTopBlocks()`). While any layer is active, every stack
 * belonging to an active layer stays visible and the rest are hidden or dimmed.
 */
export interface LayerDefinition {
  /** Unique identifier for this layer. */
  id: string;

  /** Display name shown in the layer panel. */
  name: string;

  /** Optional swatch color shown next to the layer name in the panel. */
  color?: string;

  /** Optional icon (e.g. a data URI or emoji) shown next to the layer name. */
  icon?: string;
}

/**
 * A layer whose membership is a fixed list of block types, configured by
 * the plugin installer rather than the project author. A stack belongs to
 * this layer if any block anywhere in it has one of the listed types.
 * Useful as a secondary filter (e.g. "every block that logs to the
 * console"), not as the primary way to organize a large project — for
 * that, see manually-assigned layers and {@link DynamicLayerProvider}.
 */
export interface StaticLayerDefinition extends LayerDefinition {
  /** Block type names that belong to this layer. */
  blockTypes: string[];
}

/**
 * An extension point for auto-derived layers: one pseudo-layer is created
 * per distinct key this returns across every block in the project, with
 * membership being every stack containing at least one block that produced
 * that key. The plugin ships {@link byVariableProvider} and
 * {@link byProcedureProvider}; a host application can supply its own — for
 * example, a component-based system like MIT App Inventor can implement a
 * provider that extracts a component name from whichever field identifies
 * it, yielding one auto-generated layer per component actually used in the
 * project without the plugin needing to know anything about components.
 * See the README's "Dynamic layer providers" section for a worked example.
 */
export interface DynamicLayerProvider {
  /** Namespaces this provider's generated layer ids; must be unique. */
  key: string;

  /** Display name for this provider's section in the layer panel. */
  sectionTitle: string;

  /**
   * Returns a grouping key for `block` (e.g. a variable or component name),
   * or null if this block doesn't contribute to one of this provider's
   * layers. Called for every block in the project, not just top-level ones.
   */
  extractKey(block: Blockly.Block): string | null;
}

/** Options accepted by the {@link LayersPlugin} constructor. */
export interface LayersPluginOptions {
  /** Installer-configured, block-type-list layers. Optional. */
  layers?: StaticLayerDefinition[];

  /** Auto-derived layer providers, in addition to the built-in ones. */
  dynamicProviders?: DynamicLayerProvider[];

  /**
   * Base weight of the "Layers" group in the block context menu (the group
   * occupies `[base, base + 3]`). Defaults to 98. Set it to a value no other
   * menu item's weight falls near if the host registers items with weights
   * around 98-101, otherwise they interleave with the layer items.
   */
  contextMenuWeight?: number;

  /**
   * Which way the layers panel starts: `'floating'` over the workspace
   * (default) or `'docked'` as a sidebar beside it. Only the initial mode —
   * once a user has chosen one, their saved choice wins.
   */
  panelMode?: 'floating' | 'docked';

  /**
   * `localStorage` key under which each user's panel view state (mode,
   * position, dock width, collapsed/expanded sections) is saved. Defaults to
   * `'blockly-layers:panel'`; scope it if one origin hosts several editors.
   */
  storageKey?: string;

  /**
   * The smallest zoom a fit (checking a layer, or the panel's "Fit") will pick.
   * If the active layer's stacks can't all fit at this scale, the first is
   * shown and the panel's ◀ ▶ step through the rest. Defaults to `0.5`; a
   * zoom `minScale` set on the workspace that is higher than this wins.
   */
  minReadableScale?: number;
}
