/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview A floating, Photoshop-style panel listing every configured
 * layer with a checkbox to show/hide it. Modeled on
 * `@blockly/workspace-search`'s `WorkspaceSearch`: an HTML overlay
 * registered with the workspace's `ComponentManager` as `IPositionable` so
 * Blockly repositions it automatically.
 */
import * as Blockly from "blockly/core";

import type { LayerDefinition } from "./layer_types";

Blockly.Css.register(`
  .blockly-layers-panel {
    position: absolute;
    display: flex;
    flex-direction: column;
    min-width: 160px;
    max-height: 60%;
    overflow-y: auto;
    background: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
    font-family: sans-serif;
    font-size: 0.8rem;
    z-index: 20;
  }
  .blockly-layers-panel-header {
    padding: 6px 10px;
    font-weight: bold;
    border-bottom: 1px solid #eee;
  }
  .blockly-layers-panel-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .blockly-layers-panel-row:hover {
    background: #f2f2f2;
  }
  .blockly-layers-panel-swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex: 0 0 auto;
  }
  .blockly-layers-panel-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`);

export interface LayerPanelCallbacks {
  getLayers(): LayerDefinition[];
  isActive(layerId: string): boolean;
  onToggle(layerId: string, active: boolean): void;
}

export class LayerPanel implements Blockly.IPositionable {
  id = "layersPanel";

  private htmlDiv: HTMLDivElement | null = null;
  private readonly boundEvents: Blockly.browserEvents.Data[] = [];

  constructor(
    private readonly workspace: Blockly.WorkspaceSvg,
    private readonly callbacks: LayerPanelCallbacks,
  ) {}

  init() {
    this.workspace.getComponentManager().addComponent({
      component: this,
      weight: 1,
      capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE],
    });
    this.createDom();
    this.render();
    this.workspace.resize();
  }

  dispose() {
    for (const event of this.boundEvents) {
      Blockly.browserEvents.unbind(event);
    }
    this.boundEvents.length = 0;
    if (this.htmlDiv) {
      Blockly.utils.dom.removeNode(this.htmlDiv);
      this.htmlDiv = null;
    }
  }

  /** Rebuilds the layer rows. Call after layers are added/removed/updated. */
  render() {
    if (!this.htmlDiv) return;
    for (const event of this.boundEvents) {
      Blockly.browserEvents.unbind(event);
    }
    this.boundEvents.length = 0;

    const rows = this.htmlDiv.querySelectorAll(".blockly-layers-panel-row");
    rows.forEach((row) => row.remove());

    for (const layer of this.callbacks.getLayers()) {
      this.htmlDiv.appendChild(this.createRow(layer));
    }
  }

  getBoundingRectangle(): Blockly.utils.Rect | null {
    return null;
  }

  position(
    metrics: Blockly.MetricsManager.UiMetrics,
    _savedPositions: Blockly.utils.Rect[],
  ) {
    if (!this.htmlDiv) return;
    if (this.workspace.RTL) {
      this.htmlDiv.style.left = metrics.absoluteMetrics.left + 10 + "px";
    } else {
      this.htmlDiv.style.right = "10px";
    }
    this.htmlDiv.style.top = metrics.absoluteMetrics.top + 10 + "px";
  }

  private createDom() {
    const injectionDiv = this.workspace.getInjectionDiv();
    this.htmlDiv = document.createElement("div");
    Blockly.utils.dom.addClass(this.htmlDiv, "blockly-layers-panel");

    const header = document.createElement("div");
    Blockly.utils.dom.addClass(header, "blockly-layers-panel-header");
    header.textContent = "Layers";
    this.htmlDiv.appendChild(header);

    injectionDiv.insertBefore(this.htmlDiv, this.workspace.getParentSvg());
  }

  private createRow(layer: LayerDefinition): HTMLElement {
    const row = document.createElement("label");
    Blockly.utils.dom.addClass(row, "blockly-layers-panel-row");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.callbacks.isActive(layer.id);
    row.appendChild(checkbox);

    if (layer.color) {
      const swatch = document.createElement("span");
      Blockly.utils.dom.addClass(swatch, "blockly-layers-panel-swatch");
      swatch.style.background = layer.color;
      row.appendChild(swatch);
    }

    if (layer.icon) {
      const icon = document.createElement("span");
      icon.textContent = layer.icon;
      row.appendChild(icon);
    }

    const label = document.createElement("span");
    Blockly.utils.dom.addClass(label, "blockly-layers-panel-label");
    label.textContent = layer.name;
    row.appendChild(label);

    const changeEvent = Blockly.browserEvents.conditionalBind(
      checkbox,
      "change",
      this,
      () => this.callbacks.onToggle(layer.id, checkbox.checked),
    );
    this.boundEvents.push(changeEvent);

    return row;
  }
}
