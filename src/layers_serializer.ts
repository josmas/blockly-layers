/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Persists manual layer definitions and membership as part of
 * a Blockly project, by registering an `ISerializer` with Blockly's own
 * serializer registry. Any installer already calling
 * `Blockly.serialization.workspaces.save`/`load` (directly, or via whatever
 * higher-level save/load flow they've built on top of it) gets manual
 * layers included for free, without this plugin owning any storage of its
 * own — the installer still decides where the resulting JSON lives.
 *
 * Installers with a custom save/load path that bypasses the serializer
 * registry entirely should use `LayersPlugin.exportManualLayers()`/
 * `.importManualLayers()` instead; see the README's "Persistence" section.
 */
import * as Blockly from 'blockly/core';

import type {ManualLayerState, ManualSource} from './layer_sources/manual_source';

/** Must run after blocks (priority 50) are deserialized, since membership references block ids. */
const LAYERS_SERIALIZER_PRIORITY = 10;
const SERIALIZER_NAME = 'layers';

const manualSourcesByWorkspace = new WeakMap<Blockly.Workspace, ManualSource>();
let registered = false;

const serializer: Blockly.serialization.ISerializer = {
  priority: LAYERS_SERIALIZER_PRIORITY,

  save(workspace: Blockly.Workspace): ManualLayerState | null {
    const manualSource = manualSourcesByWorkspace.get(workspace);
    if (!manualSource) return null;
    const state = manualSource.exportState();
    return state.layers.length ? state : null;
  },

  load(state: object, workspace: Blockly.Workspace) {
    manualSourcesByWorkspace
      .get(workspace)
      ?.importState(state as ManualLayerState);
  },

  clear(workspace: Blockly.Workspace) {
    manualSourcesByWorkspace.get(workspace)?.clear();
  },
};

/**
 * Registers `manualSource` as the one whose state is saved/loaded for
 * `workspace`, and registers the serializer itself with Blockly's registry
 * on first use. Call once per `LayersPlugin` instance, during `init()`.
 */
export function registerManualSource(
  workspace: Blockly.Workspace,
  manualSource: ManualSource,
) {
  manualSourcesByWorkspace.set(workspace, manualSource);
  if (!registered) {
    Blockly.serialization.registry.register(SERIALIZER_NAME, serializer);
    registered = true;
  }
}

/** Call from `LayersPlugin.dispose()` to stop tracking `workspace`. */
export function unregisterManualSource(workspace: Blockly.Workspace) {
  manualSourcesByWorkspace.delete(workspace);
}
