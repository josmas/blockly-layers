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
 *
 * Sections other than the manual one are collapsible (collapsed by
 * default) and a single search box filters rows across every section at
 * once, auto-expanding whichever sections have a match — a project can
 * easily have hundreds of dynamic (by-variable/by-procedure) layers, and
 * listing all of them permanently would make the panel unusable.
 */
import * as Blockly from 'blockly/core';

import type {LayerDefinition} from './layer_types';

Blockly.Css.register(`
  .blockly-layers-panel {
    position: absolute;
    display: flex;
    flex-direction: column;
    width: 220px;
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
  .blockly-layers-panel-scope {
    padding: 4px 10px;
    font-size: 0.75rem;
    color: #555;
    overflow-wrap: anywhere;
  }
  .blockly-layers-panel-toolbar {
    display: flex;
    justify-content: space-between;
    padding: 2px 5px;
    border-bottom: 1px solid #eee;
  }
  .blockly-layers-panel-search {
    padding: 6px 10px;
    border-bottom: 1px solid #eee;
  }
  .blockly-layers-panel-search input {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
    font-size: 0.75rem;
    padding: 3px 6px;
    border: 1px solid #ccc;
    border-radius: 3px;
  }
  .blockly-layers-panel-section-header {
    display: flex;
    align-items: baseline;
    gap: 4px;
    padding: 6px 10px 2px;
    font-size: 0.7rem;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #777;
    cursor: pointer;
  }
  .blockly-layers-panel-section-header:hover {
    color: #333;
  }
  .blockly-layers-panel-section-count {
    font-weight: normal;
    text-transform: none;
    letter-spacing: normal;
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
    /* Flex items default to min-width: auto, which stops them shrinking
       below their content's natural size — without this, a long name
       would force the row (and the panel itself, since it has no other
       width constraint of its own) to grow instead of truncating. */
    min-width: 0;
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
   * "Layers" title with no heading of their own, and are never collapsible
   * — used for the primary, manual layer group, so "Layers" doesn't appear
   * twice in a row and the layers someone deliberately curated are always
   * visible regardless of how big other sections get.
   */
  headerless?: boolean;
  /** If set, every row in this section gets a remove button that calls this. */
  onRemove?: (layerId: string) => void;
}

export interface LayerPanelCallbacks {
  getSections(): LayerPanelSection[];
  isActive(layerId: string): boolean;
  /** Whether any layer, from any source, is currently active — governs whether "Clear" is shown. */
  hasActiveLayers(): boolean;
  onToggle(layerId: string, active: boolean): void;
  /** Called from the panel header's "+" button. */
  onAddManualLayer(): void;
  /** Called from the panel header's "Clear" button. */
  onClearAll(): void;
  /** Display names of the active layers, for the collapsed "Showing: ..." bar. */
  getActiveLayerNames(): string[];
  getFilterMode(): 'hide' | 'dim';
  onToggleFilterMode(): void;
  onArrangeVisible(): void;
}

export class LayerPanel implements Blockly.IPositionable {
  id = 'layersPanel';

  private htmlDiv: HTMLDivElement | null = null;
  private bodyDiv: HTMLDivElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private clearButton: HTMLButtonElement | null = null;
  private collapseButton: HTMLButtonElement | null = null;
  private scopeDiv: HTMLDivElement | null = null;
  private toolbarDiv: HTMLDivElement | null = null;
  private modeButton: HTMLButtonElement | null = null;
  private searchWrapper: HTMLElement | null = null;
  private collapsed = false;
  /** Row/section events, rebuilt on every render(). */
  private readonly rowBoundEvents: Blockly.browserEvents.Data[] = [];
  /** Header/search events, bound once in createDom() and kept across renders. */
  private readonly chromeBoundEvents: Blockly.browserEvents.Data[] = [];

  /** Current search box text. */
  private searchQuery = '';
  /** Titles of non-headerless sections the user has manually expanded. */
  private readonly expandedSections = new Set<string>();

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
    for (const event of this.chromeBoundEvents) {
      Blockly.browserEvents.unbind(event);
    }
    this.chromeBoundEvents.length = 0;
    if (this.htmlDiv) {
      Blockly.utils.dom.removeNode(this.htmlDiv);
      this.htmlDiv = null;
      this.bodyDiv = null;
      this.searchInput = null;
      this.clearButton = null;
      this.collapseButton = null;
      this.scopeDiv = null;
      this.toolbarDiv = null;
      this.modeButton = null;
      this.searchWrapper = null;
    }
  }

  /** Rebuilds every section and row. Call whenever layers may have changed. */
  render() {
    if (!this.bodyDiv) return;
    this.unbindRowEvents();
    this.bodyDiv.replaceChildren();

    if (this.clearButton) {
      this.clearButton.style.visibility = this.callbacks.hasActiveLayers()
        ? ''
        : 'hidden';
    }

    const hasActive = this.callbacks.hasActiveLayers();
    if (this.collapseButton) {
      this.collapseButton.textContent = this.collapsed ? '▸' : '▾';
    }
    if (this.searchWrapper) {
      this.searchWrapper.style.display = this.collapsed ? 'none' : '';
    }
    if (this.toolbarDiv) {
      // `visibility`, not `display`: the row keeps its height when inert so
      // the rest of the panel doesn't jump as layers are checked/cleared.
      this.toolbarDiv.style.display = this.collapsed ? 'none' : '';
      this.toolbarDiv.style.visibility = hasActive ? '' : 'hidden';
    }
    if (this.modeButton) {
      this.modeButton.textContent =
        this.callbacks.getFilterMode() === 'hide' ? 'Others: hidden' : 'Others: dimmed';
    }
    if (this.scopeDiv) {
      this.scopeDiv.style.display = this.collapsed ? '' : 'none';
      const names = this.callbacks.getActiveLayerNames();
      this.scopeDiv.textContent = names.length
        ? 'Showing: ' + names.join(', ')
        : 'Showing: all';
    }
    if (this.collapsed) return;

    const query = this.searchQuery.trim().toLowerCase();
    const searching = query.length > 0;
    const matches = (layers: LayerDefinition[]) =>
      searching
        ? layers.filter((l) => l.name.toLowerCase().includes(query))
        : layers;

    for (const section of this.callbacks.getSections()) {
      if (section.headerless) {
        for (const layer of matches(section.layers)) {
          this.bodyDiv.appendChild(this.createRow(layer, section.onRemove));
        }
        continue;
      }

      const visible = matches(section.layers);
      if (!visible.length) continue;

      const expanded = searching || this.expandedSections.has(section.title);
      this.bodyDiv.appendChild(
        this.createSection(section, visible, expanded),
      );
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

    const titleWrap = document.createElement('span');
    this.collapseButton = this.createHeaderButton(
      '▾',
      'Collapse or expand the panel',
      () => {
        this.collapsed = !this.collapsed;
        this.render();
      },
    );
    titleWrap.appendChild(this.collapseButton);
    const title = document.createElement('span');
    title.textContent = 'Layers';
    titleWrap.appendChild(title);
    header.appendChild(titleWrap);

    const actions = document.createElement('span');
    Blockly.utils.dom.addClass(actions, 'blockly-layers-panel-header-actions');
    this.clearButton = this.createHeaderButton(
      'Clear',
      'Deactivate all layers',
      () => this.callbacks.onClearAll(),
    );
    actions.appendChild(this.clearButton);
    actions.appendChild(
      this.createHeaderButton('+', 'New layer', () =>
        this.callbacks.onAddManualLayer(),
      ),
    );
    header.appendChild(actions);

    this.htmlDiv.appendChild(header);

    this.scopeDiv = document.createElement('div');
    Blockly.utils.dom.addClass(this.scopeDiv, 'blockly-layers-panel-scope');
    this.htmlDiv.appendChild(this.scopeDiv);

    this.toolbarDiv = document.createElement('div');
    Blockly.utils.dom.addClass(this.toolbarDiv, 'blockly-layers-panel-toolbar');
    this.modeButton = this.createHeaderButton(
      'Others: dimmed',
      'Hide or dim stacks outside the active layers',
      () => this.callbacks.onToggleFilterMode(),
    );
    this.toolbarDiv.appendChild(this.modeButton);
    this.toolbarDiv.appendChild(
      this.createHeaderButton(
        'Arrange visible',
        'Stack the visible stacks into one column (undoable)',
        () => this.callbacks.onArrangeVisible(),
      ),
    );
    this.htmlDiv.appendChild(this.toolbarDiv);

    this.searchWrapper = this.createSearchBox();
    this.htmlDiv.appendChild(this.searchWrapper);

    this.bodyDiv = document.createElement('div');
    this.htmlDiv.appendChild(this.bodyDiv);

    injectionDiv.insertBefore(this.htmlDiv, this.workspace.getParentSvg());
  }

  private createSearchBox(): HTMLElement {
    const wrapper = document.createElement('div');
    Blockly.utils.dom.addClass(wrapper, 'blockly-layers-panel-search');

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search layers…';

    this.chromeBoundEvents.push(
      Blockly.browserEvents.conditionalBind(
        this.searchInput,
        'input',
        this,
        () => {
          this.searchQuery = this.searchInput?.value ?? '';
          this.render();
        },
      ),
    );
    this.chromeBoundEvents.push(
      Blockly.browserEvents.conditionalBind(
        this.searchInput,
        'keydown',
        this,
        (e: KeyboardEvent) => {
          if (e.key !== 'Escape' || !this.searchInput) return;
          this.searchInput.value = '';
          this.searchQuery = '';
          this.render();
        },
      ),
    );

    wrapper.appendChild(this.searchInput);
    return wrapper;
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
    this.chromeBoundEvents.push(clickEvent);
    return button;
  }

  private createSection(
    section: LayerPanelSection,
    visibleLayers: LayerDefinition[],
    expanded: boolean,
  ): HTMLElement {
    const container = document.createElement('div');

    const sectionHeader = document.createElement('div');
    Blockly.utils.dom.addClass(
      sectionHeader,
      'blockly-layers-panel-section-header',
    );

    const disclosure = document.createElement('span');
    disclosure.textContent = expanded ? '▾' : '▸';
    sectionHeader.appendChild(disclosure);

    const title = document.createElement('span');
    title.textContent = section.title;
    sectionHeader.appendChild(title);

    const activeCount = visibleLayers.filter((l) =>
      this.callbacks.isActive(l.id),
    ).length;
    const count = document.createElement('span');
    Blockly.utils.dom.addClass(count, 'blockly-layers-panel-section-count');
    count.textContent = activeCount
      ? `(${activeCount}/${visibleLayers.length})`
      : `(${visibleLayers.length})`;
    sectionHeader.appendChild(count);

    const toggleEvent = Blockly.browserEvents.conditionalBind(
      sectionHeader,
      'click',
      this,
      () => {
        if (this.expandedSections.has(section.title)) {
          this.expandedSections.delete(section.title);
        } else {
          this.expandedSections.add(section.title);
        }
        this.render();
      },
    );
    this.rowBoundEvents.push(toggleEvent);
    container.appendChild(sectionHeader);

    if (expanded) {
      for (const layer of visibleLayers) {
        container.appendChild(this.createRow(layer, section.onRemove));
      }
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
