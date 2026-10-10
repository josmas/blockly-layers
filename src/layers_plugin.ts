/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Entry point for the layers plugin: wires together the layer
 * panel UI and the shared layer workspace, and exposes the public API for
 * configuring layers at runtime.
 */
import * as Blockly from "blockly/core";

import { getActiveBlockTypes } from "./block_matcher";
import { LayerPanel } from "./layer_panel";
import { LayerWorkspaceController } from "./layer_workspace";
import type { LayerDefinition, LayersPluginOptions } from "./layer_types";

/**
 * Lets the end user toggle named, installer-configured "layers" of block
 * types on and off, Photoshop-style. Checking one or more layers reveals a
 * shared secondary workspace containing just those blocks (and their full
 * nested contents), independently editable and synced back to the main
 * workspace.
 */
export class LayersPlugin {
  private readonly layers = new Map<string, LayerDefinition>();
  private readonly activeIds = new Set<string>();
  private readonly panel: LayerPanel;
  private readonly layerWorkspaceController: LayerWorkspaceController;

  /**
   * @param workspace The main, always-visible workspace to attach to.
   * @param options Initial layer configuration.
   */
  constructor(
    private readonly workspace: Blockly.WorkspaceSvg,
    options: LayersPluginOptions,
  ) {
    for (const layer of options.layers) {
      this.layers.set(layer.id, layer);
    }
    this.panel = new LayerPanel(workspace, {
      getLayers: () => this.getLayers(),
      isActive: (id) => this.activeIds.has(id),
      onToggle: (id, active) => this.setLayerActive(id, active),
    });
    this.layerWorkspaceController = new LayerWorkspaceController(
      workspace,
      () => this.getActiveTypes(),
    );
  }

  /** Initializes the plugin: shows the layer panel. */
  init() {
    this.panel.init();
  }

  /** Disposes of the plugin and the layer workspace, if one was created. */
  dispose() {
    this.layerWorkspaceController.dispose();
    this.panel.dispose();
  }

  /** Returns every configured layer. */
  getLayers(): LayerDefinition[] {
    return [...this.layers.values()];
  }

  /** Adds a new layer, or replaces an existing one with the same id. */
  addLayer(layer: LayerDefinition) {
    this.layers.set(layer.id, layer);
    this.panel.render();
  }

  /** Removes a layer by id and deactivates it if it was active. */
  removeLayer(id: string) {
    if (!this.layers.delete(id)) return;
    this.activeIds.delete(id);
    this.panel.render();
    this.layerWorkspaceController.refresh();
  }

  /** Merges `partial` into the layer with the given id, if it exists. */
  updateLayer(id: string, partial: Partial<Omit<LayerDefinition, "id">>) {
    const existing = this.layers.get(id);
    if (!existing) return;
    this.layers.set(id, { ...existing, ...partial });
    this.panel.render();
    this.layerWorkspaceController.refresh();
  }

  /** Activates or deactivates a layer, showing/updating the layer workspace. */
  setLayerActive(id: string, active: boolean) {
    if (!this.layers.has(id)) return;
    if (active) {
      this.activeIds.add(id);
    } else {
      this.activeIds.delete(id);
    }
    this.panel.render();
    this.layerWorkspaceController.refresh();
  }

  /** Returns the ids of the currently active (checked) layers. */
  getActiveLayerIds(): string[] {
    return [...this.activeIds];
  }

  private getActiveTypes(): Set<string> {
    return getActiveBlockTypes(this.getLayers(), this.activeIds);
  }
}
