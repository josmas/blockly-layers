/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview A floating, Photoshop-style panel listing every layer,
 * grouped into sections by source (manual, each dynamic provider, static
 * filters), with a checkbox to show/hide each one. Modeled on
 * `@blockly/workspace-search`'s `WorkspaceSearch`: an HTML overlay
 * registered with the workspace's `ComponentManager` as `IPositionable` so
 * Blockly repositions it automatically.
 */
import * as Blockly from 'blockly/core';

import type {LayerDefinition} from './layer_types';

Blockly.Css.register(`
  .blockly-layers-panel {
    position: absolute;
    display: flex;
    flex-direction: column;
    min-width: 180px;
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    font-weight: bold;
    border-bottom: 1px solid #eee;
  }
  .blockly-layers-panel-header-actions {
    display: flex;
    gap: 2px;
  }
  .blockly-layers-panel-header-btn {
    border: none;
    background: none;
    cursor: pointer;
    font: inherit;
    font-weight: normal;
    font-size: 0.75rem;
    line-height: 1;
    padding: 2px 5px;
    color: #777;
  }
  .blockly-layers-panel-header-btn:hover {
    color: #000;
  }
  .blockly-layers-panel-section-header {
    padding: 6px 10px 2px;
    font-size: 0.7rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #777;
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
    flex: 1 1 auto;
  }
  .blockly-layers-panel-remove-btn {
    flex: 0 0 auto;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: bold;
    line-height: 1;
    padding: 0 4px;
    color: #bbb;
  }
  .blockly-layers-panel-remove-btn:hover {
    color: #c00;
  }
`);

/** A group of layers shown together in the panel. */
export interface LayerPanelSection {
  title: string;
  layers: LayerDefinition[];
  /**
   * If true, this section's rows render directly under the panel's own
   * "Layers" title with no heading of their own — used for the primary,
   * manual layer group, so "Layers" doesn't appear twice in a row.
   */
  headerless?: boolean;
  /** If set, every row in this section gets a remove button that calls this. */
  onRemove?: (layerId: string) => void;
}

export interface LayerPanelCallbacks {
  getSections(): LayerPanelSection[];
  isActive(layerId: string): boolean;
  onToggle(layerId: string, active: boolean): void;
  /** Called from the panel header's "+" button. */
  onAddManualLayer(): void;
  /** Called from the panel header's "Clear" button. */
  onClearAll(): void;
}

export class LayerPanel implements Blockly.IPositionable {
  id = 'layersPanel';

  private htmlDiv: HTMLDivElement | null = null;
  private bodyDiv: HTMLDivElement | null = null;
  /** Row/section events, rebuilt on every render(). */
  private readonly rowBoundEvents: Blockly.browserEvents.Data[] = [];
  /** Header button events, bound once in createDom() and kept across renders. */
  private readonly headerBoundEvents: Blockly.browserEvents.Data[] = [];

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
    this.unbindRowEvents();
    for (const event of this.headerBoundEvents) {
      Blockly.browserEvents.unbind(event);
    }
    this.headerBoundEvents.length = 0;
    if (this.htmlDiv) {
      Blockly.utils.dom.removeNode(this.htmlDiv);
      this.htmlDiv = null;
      this.bodyDiv = null;
    }
  }

  /** Rebuilds every section and row. Call whenever layers may have changed. */
  render() {
    if (!this.bodyDiv) return;
    this.unbindRowEvents();
    this.bodyDiv.replaceChildren();

    for (const section of this.callbacks.getSections()) {
      if (section.headerless) {
        for (const layer of section.layers) {
          this.bodyDiv.appendChild(this.createRow(layer, section.onRemove));
        }
        continue;
      }
      if (!section.layers.length) continue;
      this.bodyDiv.appendChild(this.createSection(section));
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
      this.htmlDiv.style.left = metrics.absoluteMetrics.left + 10 + 'px';
    } else {
      this.htmlDiv.style.right = '10px';
    }
    this.htmlDiv.style.top = metrics.absoluteMetrics.top + 10 + 'px';
  }

  private createDom() {
    const injectionDiv = this.workspace.getInjectionDiv();
    this.htmlDiv = document.createElement('div');
    Blockly.utils.dom.addClass(this.htmlDiv, 'blockly-layers-panel');

    const header = document.createElement('div');
    Blockly.utils.dom.addClass(header, 'blockly-layers-panel-header');

    const title = document.createElement('span');
    title.textContent = 'Layers';
    header.appendChild(title);

    const actions = document.createElement('span');
    Blockly.utils.dom.addClass(actions, 'blockly-layers-panel-header-actions');
    actions.appendChild(
      this.createHeaderButton('Clear', 'Deactivate all layers', () =>
        this.callbacks.onClearAll(),
      ),
    );
    actions.appendChild(
      this.createHeaderButton('+', 'New layer', () =>
        this.callbacks.onAddManualLayer(),
      ),
    );
    header.appendChild(actions);

    this.htmlDiv.appendChild(header);

    this.bodyDiv = document.createElement('div');
    this.htmlDiv.appendChild(this.bodyDiv);

    injectionDiv.insertBefore(this.htmlDiv, this.workspace.getParentSvg());
  }

  private createHeaderButton(
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    Blockly.utils.dom.addClass(button, 'blockly-layers-panel-header-btn');
    button.textContent = label;
    button.title = title;
    const clickEvent = Blockly.browserEvents.conditionalBind(
      button,
      'click',
      this,
      onClick,
    );
    this.headerBoundEvents.push(clickEvent);
    return button;
  }

  private createSection(section: LayerPanelSection): HTMLElement {
    const container = document.createElement('div');

    const sectionHeader = document.createElement('div');
    Blockly.utils.dom.addClass(
      sectionHeader,
      'blockly-layers-panel-section-header',
    );
    sectionHeader.textContent = section.title;
    container.appendChild(sectionHeader);

    for (const layer of section.layers) {
      container.appendChild(this.createRow(layer, section.onRemove));
    }
    return container;
  }

  private createRow(
    layer: LayerDefinition,
    onRemove?: (layerId: string) => void,
  ): HTMLElement {
    const row = document.createElement('label');
    Blockly.utils.dom.addClass(row, 'blockly-layers-panel-row');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.callbacks.isActive(layer.id);
    row.appendChild(checkbox);

    if (layer.color) {
      const swatch = document.createElement('span');
      Blockly.utils.dom.addClass(swatch, 'blockly-layers-panel-swatch');
      swatch.style.background = layer.color;
      row.appendChild(swatch);
    }

    if (layer.icon) {
      const icon = document.createElement('span');
      icon.textContent = layer.icon;
      row.appendChild(icon);
    }

    const label = document.createElement('span');
    Blockly.utils.dom.addClass(label, 'blockly-layers-panel-label');
    label.textContent = layer.name;
    row.appendChild(label);

    const changeEvent = Blockly.browserEvents.conditionalBind(
      checkbox,
      'change',
      this,
      () => this.callbacks.onToggle(layer.id, checkbox.checked),
    );
    this.rowBoundEvents.push(changeEvent);

    if (onRemove) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      Blockly.utils.dom.addClass(removeButton, 'blockly-layers-panel-remove-btn');
      removeButton.textContent = '−';
      removeButton.title = `Remove ${layer.name}`;
      const clickEvent = Blockly.browserEvents.conditionalBind(
        removeButton,
        'click',
        this,
        (e: Event) => {
          // The row is a <label>; without this, clicking the remove button
          // would also toggle the checkbox it's wrapping.
          e.preventDefault();
          e.stopPropagation();
          onRemove(layer.id);
        },
      );
      this.rowBoundEvents.push(clickEvent);
      row.appendChild(removeButton);
    }

    return row;
  }

  private unbindRowEvents() {
    for (const event of this.rowBoundEvents) {
      Blockly.browserEvents.unbind(event);
    }
    this.rowBoundEvents.length = 0;
  }
}
