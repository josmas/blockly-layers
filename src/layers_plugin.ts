/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Entry point for the layers plugin: wires together the three
 * layer sources (manual, dynamic, static), the sectioned layer panel, the
 * "Add to layer..." context menu, and the shared layer workspace, and
 * exposes the public API for managing layers at runtime.
 */
import * as Blockly from 'blockly/core';

import {byProcedureProvider} from './layer_sources/dynamic/by_procedure';
import {byVariableProvider} from './layer_sources/dynamic/by_variable';
import {DynamicSource} from './layer_sources/dynamic/dynamic_source';
import type {ManualLayerState} from './layer_sources/manual_source';
import {ManualSource} from './layer_sources/manual_source';
import {StaticTypeSource} from './layer_sources/static_type_source';
import type {LayerSource} from './layer_sources/types';
import type {LayerPanelSection} from './layer_panel';
import {LayerPanel} from './layer_panel';
import {LayerWorkspaceController} from './layer_workspace';
import type {LayerDefinition, LayersPluginOptions} from './layer_types';
import {
  registerManualSource,
  unregisterManualSource,
} from './layers_serializer';
import {ManualLayerContextMenu} from './manual_layer_context_menu';

/**
 * Lets a project author organize a large workspace into named "layers" —
 * Photoshop-style, combinable, checkbox-toggled groups of top-level stacks
 * — drawn from three sources: layers the author manually assigns stacks to
 * (via the "Add to layer..." context menu, persisted with the project),
 * layers auto-derived from project structure (one per variable, one per
 * procedure, plus any custom {@link DynamicLayerProvider}s supplied), and
 * installer-configured block-type-list layers (a secondary filter). An
 * active layer's stacks are mirrored into a single shared, fully-editable
 * secondary workspace, synced back to the main workspace in both
 * directions.
 */
export class LayersPlugin {
  private readonly manualSource: ManualSource;
  private readonly staticSource: StaticTypeSource;
  private readonly dynamicSources: DynamicSource[];
  private readonly sources: LayerSource[];
  private readonly activeIds = new Set<string>();
  private readonly panel: LayerPanel;
  private readonly layerWorkspaceController: LayerWorkspaceController;
  private readonly contextMenu: ManualLayerContextMenu;

  /**
   * @param workspace The main, always-visible workspace to attach to.
   * @param options Static layers and/or extra dynamic providers. Both optional.
   */
  constructor(
    private readonly workspace: Blockly.WorkspaceSvg,
    options: LayersPluginOptions = {},
  ) {
    this.manualSource = new ManualSource();
    this.staticSource = new StaticTypeSource(options.layers ?? []);
    const providers = [
      byVariableProvider,
      byProcedureProvider,
      ...(options.dynamicProviders ?? []),
    ];
    this.dynamicSources = providers.map((provider) => new DynamicSource(provider));
    this.sources = [this.manualSource, ...this.dynamicSources, this.staticSource];

    this.manualSource.onChange(() => {
      this.panel.render();
      this.layerWorkspaceController.refresh();
    });

    this.panel = new LayerPanel(workspace, {
      getSections: () => this.getSections(),
      isActive: (id) => this.activeIds.has(id),
      hasActiveLayers: () => this.activeIds.size > 0,
      onToggle: (id, active) => this.setLayerActive(id, active),
      onAddManualLayer: () => {
        const name = window.prompt('New layer name:');
        if (name) this.manualSource.createLayer(name);
      },
      onClearAll: () => this.clearActiveLayers(),
    });
    this.layerWorkspaceController = new LayerWorkspaceController(workspace, () =>
      this.getDesiredTopBlockIds(),
    );
    this.contextMenu = new ManualLayerContextMenu(workspace, this.manualSource);
  }

  /** Initializes the plugin: registers persistence, the context menu, and the panel. */
  init() {
    registerManualSource(this.workspace, this.manualSource);
    this.contextMenu.init();
    this.panel.init();
  }

  /** Disposes of the plugin and the layer workspace, if one was created. */
  dispose() {
    this.layerWorkspaceController.dispose();
    this.contextMenu.dispose();
    this.panel.dispose();
    unregisterManualSource(this.workspace);
  }

  /** Activates or deactivates a layer (any source), updating the layer workspace. */
  setLayerActive(id: string, active: boolean) {
    if (active) {
      this.activeIds.add(id);
    } else {
      this.activeIds.delete(id);
    }
    this.panel.render();
    this.layerWorkspaceController.refresh();
  }

  /** Returns the ids of the currently active (checked) layers, across all sources. */
  getActiveLayerIds(): string[] {
    return [...this.activeIds];
  }

  /** Deactivates every active layer, across all sources, in one call. */
  clearActiveLayers() {
    if (this.activeIds.size === 0) return;
    this.activeIds.clear();
    this.panel.render();
    this.layerWorkspaceController.refresh();
  }

  /** Creates a new manual layer (initially unassigned to any stack) and returns its id. */
  createManualLayer(name: string, opts: {color?: string; icon?: string} = {}): string {
    return this.manualSource.createLayer(name, opts);
  }

  /** Removes a manual layer and every stack's assignment to it. */
  removeManualLayer(layerId: string) {
    this.manualSource.removeLayer(layerId);
    this.activeIds.delete(layerId);
  }

  /** Assigns the top-level stack with id `topBlockId` to a manual layer. */
  assignToLayer(topBlockId: string, layerId: string) {
    this.manualSource.assign(topBlockId, layerId);
  }

  /** Removes the top-level stack with id `topBlockId` from a manual layer. */
  unassignFromLayer(topBlockId: string, layerId: string) {
    this.manualSource.unassign(topBlockId, layerId);
  }

  /**
   * Exports manual layer definitions and membership as a plain object, for
   * installers with a custom save flow that bypasses
   * `Blockly.serialization.workspaces.save` (which otherwise includes this
   * automatically — see the README's "Persistence" section).
   */
  exportManualLayers(): ManualLayerState {
    return this.manualSource.exportState();
  }

  /** The import counterpart to {@link exportManualLayers}. */
  importManualLayers(state: ManualLayerState) {
    this.manualSource.importState(state);
  }

  private getSections(): LayerPanelSection[] {
    const sections: LayerPanelSection[] = [
      {
        title: this.manualSource.sectionTitle,
        layers: this.safeGetLayers(this.manualSource),
        headerless: true,
        onRemove: (layerId) => {
          const layer = this.manualSource
            .getLayers()
            .find((l) => l.id === layerId);
          if (layer && !window.confirm(`Remove layer "${layer.name}"?`)) return;
          this.removeManualLayer(layerId);
        },
      },
    ];
    for (const source of this.dynamicSources) {
      sections.push({title: source.sectionTitle, layers: this.safeGetLayers(source)});
    }
    const staticLayers = this.safeGetLayers(this.staticSource);
    if (staticLayers.length) {
      sections.push({title: this.staticSource.sectionTitle, layers: staticLayers});
    }
    return sections;
  }

  /**
   * A problem computing one section (e.g. a dynamic provider that throws on
   * an unexpected block) must not blank out every other section — the
   * panel's DOM is already cleared by the time `render()` reaches this, so
   * an uncaught error here would otherwise take the whole panel down rather
   * than just this one section.
   */
  private safeGetLayers(source: LayerSource): LayerDefinition[] {
    try {
      return source.getLayers(this.workspace);
    } catch (e) {
      console.error('blockly-layers: failed to compute layers for a section', e);
      return [];
    }
  }

  private getDesiredTopBlockIds(): Set<string> {
    const ids = new Set<string>();
    for (const layerId of this.activeIds) {
      const source = this.sources.find((s) => layerId.startsWith(`${s.kind}:`));
      if (!source) continue;
      for (const id of source.getMembers(this.workspace, layerId)) {
        ids.add(id);
      }
    }
    return ids;
  }
}
