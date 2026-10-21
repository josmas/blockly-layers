/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview The layers plugin: organize a large Blockly project into
 * named, Photoshop-style layers of top-level stacks — manually assigned,
 * auto-derived from project structure, or installer-configured by type.
 */
export {LayersPlugin} from './layers_plugin';
export type {
  DynamicLayerProvider,
  LayerDefinition,
  LayersPluginOptions,
  StaticLayerDefinition,
} from './layer_types';
export type {ManualLayerState} from './layer_sources/manual_source';
