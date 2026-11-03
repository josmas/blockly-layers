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
import {PanelDock} from './panel_dock';
import type {PanelMode, PanelState} from './panel_state';
import {
  DEFAULT_STORAGE_KEY,
  capHeight,
  clampDockWidth,
  clampOffset,
  getBrowserStorage,
  loadState,
  saveState,
} from './panel_state';

/** Width of the docked panel when collapsed to just its toggle button. */
const RAIL_WIDTH = 32;

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
  .blockly-layers-panel.blockly-layers-panel-docked {
    position: relative;
    flex: 0 0 auto;
    box-sizing: border-box;
    max-height: none;
    border-width: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .blockly-layers-panel.blockly-layers-panel-docked.blockly-layers-panel-collapsed {
    width: ${RAIL_WIDTH}px;
  }
  .blockly-layers-panel-collapsed.blockly-layers-panel-docked
    .blockly-layers-panel-header {
    justify-content: center;
    padding: 6px 0;
  }
  .blockly-layers-panel-collapsed.blockly-layers-panel-docked
    .blockly-layers-panel-title,
  .blockly-layers-panel-collapsed.blockly-layers-panel-docked
    .blockly-layers-panel-header-actions,
  .blockly-layers-panel-collapsed.blockly-layers-panel-docked
    .blockly-layers-panel-scope {
    display: none;
  }
  .blockly-layers-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    font-weight: bold;
    border-bottom: 1px solid #eee;
    touch-action: none;
  }
  .blockly-layers-panel:not(.blockly-layers-panel-docked)
    .blockly-layers-panel-header {
    cursor: move;
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
  .blockly-layers-panel-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 5px;
    border-bottom: 1px solid #eee;
  }
  .blockly-layers-panel-nav-label {
    flex: 1;
    text-align: center;
    font-size: 0.75rem;
    color: #555;
  }
  .blockly-layers-panel-name {
    padding: 6px 10px;
    border-bottom: 1px solid #eee;
    background: #fffbea;
  }
  .blockly-layers-panel-name input {
    box-sizing: border-box;
    width: 100%;
    font: inherit;
  }
  .blockly-layers-panel-name-error {
    min-height: 1em;
    margin-top: 2px;
    font-size: 0.75rem;
    color: #b00020;
  }
  .blockly-layers-panel-confirm {
    padding: 6px 10px;
    border-bottom: 1px solid #eee;
    background: #fdecea;
    font-size: 0.8rem;
  }
  .blockly-layers-panel-confirm-text {
    overflow-wrap: anywhere;
  }
  .blockly-layers-panel-confirm-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    margin-top: 4px;
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
  /** Whether a manual layer with this name already exists (case-insensitive). */
  isLayerNameTaken(name: string): boolean;
  /** "Fit": zoom (not below a readable scale) and scroll to the visible stacks. */
  onFit(): void;
  /** "◀" / "▶": centre the previous / next visible stack. */
  onStep(delta: 1 | -1): void;
  /** Position among the visible stacks; `index` is -1 before the first step. */
  getStepInfo(): {index: number; total: number};
}

export interface LayerPanelOptions {
  /** Mode to start in when the user has no saved preference. */
  mode?: PanelMode;
  /** `localStorage` key for the per-user view state. */
  storageKey?: string;
}

const PANEL_MARGIN = 10;
const PANEL_FALLBACK_WIDTH = 220;
const PANEL_MIN_HEIGHT = 120;
/**
 * Higher than every built-in control (trash 1, zoom 2) and the App Inventor
 * backpack (2), so we are positioned last: we step under what's already there
 * and nothing is left to be displaced by us.
 */
const PANEL_WEIGHT = 100;

export class LayerPanel implements Blockly.IPositionable {
  id = 'layersPanel';

  private htmlDiv: HTMLDivElement | null = null;
  private lastRect: Blockly.utils.Rect | null = null;
  private repositionQueued = false;
  private bodyDiv: HTMLDivElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private clearButton: HTMLButtonElement | null = null;
  private collapseButton: HTMLButtonElement | null = null;
  private scopeDiv: HTMLDivElement | null = null;
  private toolbarDiv: HTMLDivElement | null = null;
  private navDiv: HTMLDivElement | null = null;
  private navLabel: HTMLSpanElement | null = null;
  private navButtons: HTMLButtonElement[] = [];
  private modeButton: HTMLButtonElement | null = null;
  private searchWrapper: HTMLElement | null = null;
  private nameWrapper: HTMLElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private nameError: HTMLElement | null = null;
  private confirmWrapper: HTMLElement | null = null;
  private confirmText: HTMLElement | null = null;
  private confirmCancelButton: HTMLButtonElement | null = null;
  /** Resolves the pending "remove layer?" question, if one is open. */
  private resolveConfirm: ((ok: boolean) => void) | null = null;
  /** Resolves the pending "new layer" name request, if one is open. */
  private resolveName: ((name: string | null) => void) | null = null;
  private headerDiv: HTMLDivElement | null = null;
  private dockButton: HTMLButtonElement | null = null;
  /** Row/section events, rebuilt on every render(). */
  private readonly rowBoundEvents: Blockly.browserEvents.Data[] = [];
  /** Header/search events, bound once in createDom() and kept across renders. */
  private readonly chromeBoundEvents: Blockly.browserEvents.Data[] = [];
  /** Raw DOM listeners (drag), removed in dispose(). */
  private readonly domCleanups: Array<() => void> = [];

  /** Current search box text. */
  private searchQuery = '';
  /** Titles of non-headerless sections the user has manually expanded. */
  private readonly expandedSections = new Set<string>();

  private readonly storage = getBrowserStorage();
  private readonly storageKey: string;
  /** Per-user view state; `floatOffset` holds the user's intent, clamped only when applied. */
  private state: PanelState;
  private readonly dock: PanelDock;
  /** The unbumped corner the floating offset is measured from; set by position(). */
  private anchor = {left: 0, top: 0};

  constructor(
    private readonly workspace: Blockly.WorkspaceSvg,
    private readonly callbacks: LayerPanelCallbacks,
    options: LayerPanelOptions = {},
  ) {
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.state = loadState(this.storage, this.storageKey, {
      mode: options.mode,
    });
    for (const title of this.state.expandedSections) {
      this.expandedSections.add(title);
    }
    this.dock = new PanelDock(workspace, {
      getWidth: () => this.state.dockWidth,
      onResize: (width) => this.applyDockWidth(width),
      onCommit: (width) => {
        this.state.dockWidth = clampDockWidth(width);
        this.persist();
      },
    });
  }

  init() {
    this.workspace.getComponentManager().addComponent({
      component: this,
      weight: PANEL_WEIGHT,
      capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE],
    });
    this.createDom();
    if (this.state.mode === 'docked') this.enterDock();
    this.render();
    this.workspace.resize();
  }

  /**
   * Asks for a new layer's name with an inline input at the top of the panel
   * (expanding the panel if it is collapsed). Enter accepts a non-empty name
   * that no manual layer already has; Escape or clicking away resolves null.
   * Starting a second request cancels the first.
   */
  promptForName(): Promise<string | null> {
    this.cancelNamePrompt();
    this.cancelConfirm();
    if (!this.nameWrapper || !this.nameInput) return Promise.resolve(null);
    if (this.state.collapsed) {
      this.state.collapsed = false;
      this.persist();
      this.render();
    }
    this.nameInput.value = '';
    this.setNameError('');
    this.nameWrapper.style.display = '';
    this.requestReposition();
    this.nameInput.focus();
    return new Promise((resolve) => {
      this.resolveName = resolve;
    });
  }

  /**
   * Asks whether to remove a layer, with an inline bar at the top of the
   * panel (expanding the panel if it is collapsed). Resolves true only for
   * "Remove"; "Cancel", Escape, collapsing the panel, a new request or
   * disposal resolve false. Cancel has the focus, so Enter alone never deletes.
   */
  confirmRemoval(layerName: string): Promise<boolean> {
    this.cancelConfirm();
    this.cancelNamePrompt();
    if (!this.confirmWrapper || !this.confirmText) {
      return Promise.resolve(false);
    }
    if (this.state.collapsed) {
      this.state.collapsed = false;
      this.persist();
      this.render();
    }
    this.confirmText.textContent = `Remove layer "${layerName}"?`;
    this.confirmWrapper.style.display = '';
    this.requestReposition();
    this.confirmCancelButton?.focus();
    return new Promise((resolve) => {
      this.resolveConfirm = resolve;
    });
  }

  private cancelConfirm() {
    this.finishConfirm(false);
  }

  private finishConfirm(ok: boolean) {
    const resolve = this.resolveConfirm;
    this.resolveConfirm = null;
    if (this.confirmWrapper) this.confirmWrapper.style.display = 'none';
    this.requestReposition();
    resolve?.(ok);
  }

  private createConfirmBox(): HTMLElement {
    const wrapper = document.createElement('div');
    Blockly.utils.dom.addClass(wrapper, 'blockly-layers-panel-confirm');
    wrapper.style.display = 'none';
    wrapper.setAttribute('role', 'alertdialog');
    wrapper.setAttribute('aria-label', 'Remove layer');

    const text = document.createElement('div');
    Blockly.utils.dom.addClass(text, 'blockly-layers-panel-confirm-text');
    this.confirmText = text;

    const actions = document.createElement('div');
    Blockly.utils.dom.addClass(actions, 'blockly-layers-panel-confirm-actions');
    const remove = this.createHeaderButton('Remove', 'Remove this layer', () =>
      this.finishConfirm(true),
    );
    const cancel = this.createHeaderButton('Cancel', 'Keep this layer', () =>
      this.cancelConfirm(),
    );
    this.confirmCancelButton = cancel;
    actions.append(cancel, remove);

    this.chromeBoundEvents.push(
      Blockly.browserEvents.conditionalBind(
        wrapper,
        'keydown',
        this,
        (e: KeyboardEvent) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation();
          this.cancelConfirm();
        },
      ),
    );

    wrapper.append(text, actions);
    return wrapper;
  }

  private cancelNamePrompt() {
    this.finishNamePrompt(null);
  }

  /**
   * `deferHide` is for blur: hiding the input on mousedown would shift the
   * controls below it before the click completes and the click would miss, so
   * the request resolves now but the row is hidden once the pointer is up.
   */
  private finishNamePrompt(name: string | null, deferHide = false) {
    const resolve = this.resolveName;
    this.resolveName = null;
    const hide = () => {
      // A newer request may have reopened the input meanwhile.
      if (this.resolveName || !this.nameWrapper) return;
      this.nameWrapper.style.display = 'none';
      this.requestReposition();
    };
    if (deferHide && resolve) {
      const later = () => setTimeout(hide, 0);
      document.addEventListener('pointerup', later, {once: true, capture: true});
      setTimeout(() => {
        document.removeEventListener('pointerup', later, true);
        hide();
      }, 500);
    } else {
      hide();
    }
    resolve?.(name);
  }

  private setNameError(message: string) {
    if (this.nameError) this.nameError.textContent = message;
  }

  private createNameBox(): HTMLElement {
    const wrapper = document.createElement('div');
    Blockly.utils.dom.addClass(wrapper, 'blockly-layers-panel-name');
    wrapper.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'New layer name, then Enter';
    input.setAttribute('aria-label', 'New layer name');
    this.nameInput = input;

    const error = document.createElement('div');
    Blockly.utils.dom.addClass(error, 'blockly-layers-panel-name-error');
    error.setAttribute('role', 'alert');
    this.nameError = error;

    this.chromeBoundEvents.push(
      Blockly.browserEvents.conditionalBind(
        input,
        'keydown',
        this,
        (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            this.cancelNamePrompt();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const name = input.value.trim();
            if (!name) {
              this.setNameError('Enter a name.');
            } else if (this.callbacks.isLayerNameTaken(name)) {
              this.setNameError('A layer with that name already exists.');
            } else {
              this.finishNamePrompt(name);
            }
          } else {
            this.setNameError('');
          }
        },
      ),
    );
    this.chromeBoundEvents.push(
      Blockly.browserEvents.conditionalBind(input, 'blur', this, () =>
        this.finishNamePrompt(null, true),
      ),
    );

    wrapper.append(input, error);
    return wrapper;
  }

  dispose() {
    this.cancelNamePrompt();
    this.cancelConfirm();
    this.unbindRowEvents();
    for (const event of this.chromeBoundEvents) {
      Blockly.browserEvents.unbind(event);
    }
    this.chromeBoundEvents.length = 0;
    for (const cleanup of this.domCleanups) cleanup();
    this.domCleanups.length = 0;
    this.dock.exit();
    if (this.htmlDiv) {
      Blockly.utils.dom.removeNode(this.htmlDiv);
      this.htmlDiv = null;
      this.bodyDiv = null;
      this.searchInput = null;
      this.nameWrapper = null;
      this.nameInput = null;
      this.nameError = null;
      this.confirmWrapper = null;
      this.confirmText = null;
      this.confirmCancelButton = null;
      this.clearButton = null;
      this.collapseButton = null;
      this.scopeDiv = null;
      this.toolbarDiv = null;
      this.navDiv = null;
      this.navLabel = null;
      this.navButtons = [];
      this.modeButton = null;
      this.searchWrapper = null;
      this.headerDiv = null;
      this.dockButton = null;
    }
  }

  private persist() {
    this.state.expandedSections = [...this.expandedSections];
    saveState(this.storage, this.storageKey, this.state);
  }

  private isDocked() {
    return this.state.mode === 'docked';
  }

  private setMode(mode: PanelMode) {
    if (this.state.mode === mode || !this.htmlDiv) return;
    this.state.mode = mode;
    if (mode === 'docked') {
      this.enterDock();
    } else {
      this.exitDock();
    }
    this.persist();
    this.render();
    this.workspace.resize();
  }

  private enterDock() {
    if (!this.htmlDiv) return;
    const style = this.htmlDiv.style;
    style.left = style.top = style.right = style.maxHeight = '';
    Blockly.utils.dom.addClass(this.htmlDiv, 'blockly-layers-panel-docked');
    this.dock.enter(this.htmlDiv);
    this.lastRect = null;
    this.applyDockWidth(this.state.dockWidth);
  }

  private exitDock() {
    if (!this.htmlDiv) return;
    this.dock.exit();
    Blockly.utils.dom.removeClass(this.htmlDiv, 'blockly-layers-panel-docked');
    this.htmlDiv.style.width = '';
    this.workspace
      .getInjectionDiv()
      .insertBefore(this.htmlDiv, this.workspace.getParentSvg());
  }

  /** Applies a docked width (or the rail width while collapsed) to the panel. */
  private applyDockWidth(width: number) {
    if (!this.htmlDiv || !this.isDocked()) return;
    this.htmlDiv.style.width = this.state.collapsed ? '' : `${width}px`;
    this.dock.syncWorkspaceSize();
  }

  /** Rebuilds every section and row. Call whenever layers may have changed. */
  render() {
    if (!this.bodyDiv) return;
    this.requestReposition();
    this.unbindRowEvents();
    this.bodyDiv.replaceChildren();

    if (this.clearButton) {
      this.clearButton.style.visibility = this.callbacks.hasActiveLayers()
        ? ''
        : 'hidden';
    }

    const hasActive = this.callbacks.hasActiveLayers();
    const collapsed = this.state.collapsed;
    if (this.htmlDiv) {
      this.htmlDiv.classList.toggle('blockly-layers-panel-collapsed', collapsed);
      // A collapsed docked panel is a rail; its width comes from CSS, not the
      // dragged width.
      this.applyDockWidth(this.state.dockWidth);
    }
    this.dock.setSplitterVisible(!collapsed);
    if (this.dockButton) {
      this.dockButton.textContent = this.isDocked() ? '⧉' : '⇥';
      this.dockButton.title = this.isDocked()
        ? 'Float over the workspace'
        : 'Dock as a sidebar';
    }
    if (this.collapseButton) {
      this.collapseButton.textContent = collapsed ? '▸' : '▾';
    }
    if (this.searchWrapper) {
      this.searchWrapper.style.display = collapsed ? 'none' : '';
    }
    if (this.toolbarDiv) {
      // `visibility`, not `display`: the row keeps its height when inert so
      // the rest of the panel doesn't jump as layers are checked/cleared.
      this.toolbarDiv.style.display = collapsed ? 'none' : '';
      this.toolbarDiv.style.visibility = hasActive ? '' : 'hidden';
    }
    if (this.navDiv) {
      this.navDiv.style.display = collapsed ? 'none' : '';
      this.navDiv.style.visibility = hasActive ? '' : 'hidden';
      const {index, total} = this.callbacks.getStepInfo();
      if (this.navLabel) {
        this.navLabel.textContent =
          total === 0
            ? 'No stacks'
            : index < 0
              ? `${total} ${total === 1 ? 'stack' : 'stacks'}`
              : `${index + 1} of ${total}`;
      }
      for (const button of this.navButtons) button.disabled = total === 0;
    }
    if (this.modeButton) {
      this.modeButton.textContent =
        this.callbacks.getFilterMode() === 'hide' ? 'Others: hidden' : 'Others: dimmed';
    }
    if (this.scopeDiv) {
      this.scopeDiv.style.display = collapsed ? '' : 'none';
      const names = this.callbacks.getActiveLayerNames();
      this.scopeDiv.textContent = names.length
        ? 'Showing: ' + names.join(', ')
        : 'Showing: all';
    }
    if (collapsed) {
      this.cancelNamePrompt();
      this.cancelConfirm();
      return;
    }

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

  /**
   * Null while docked (we're outside the workspace) and once the user has
   * placed the panel themselves (their call where it sits); otherwise our real
   * rectangle, which nothing is positioned after, so nothing is displaced.
   */
  getBoundingRectangle(): Blockly.utils.Rect | null {
    return this.lastRect;
  }

  position(
    metrics: Blockly.MetricsManager.UiMetrics,
    savedPositions: Blockly.utils.Rect[],
  ) {
    if (!this.htmlDiv) return;
    if (this.isDocked()) {
      this.lastRect = null;
      return;
    }
    const injectionDiv = this.workspace.getInjectionDiv();
    const bounds = {
      width: injectionDiv.clientWidth,
      height: injectionDiv.clientHeight,
    };
    const width = this.htmlDiv.offsetWidth || PANEL_FALLBACK_WIDTH;
    const height = this.htmlDiv.offsetHeight || PANEL_MARGIN;
    this.anchor = {
      left: this.workspace.RTL
        ? metrics.absoluteMetrics.left + PANEL_MARGIN
        : bounds.width - width - PANEL_MARGIN,
      top: metrics.absoluteMetrics.top + PANEL_MARGIN,
    };

    let left: number;
    let top: number;
    let maxHeight: number;
    if (this.state.floatOffset) {
      const offset = clampOffset(
        this.state.floatOffset,
        this.anchor,
        {width, height},
        bounds,
      );
      left = this.anchor.left + offset.dx;
      top = this.anchor.top + offset.dy;
      maxHeight = Math.max(PANEL_MIN_HEIGHT, bounds.height - top - PANEL_MARGIN);
      this.lastRect = null;
    } else {
      // Step under whatever was placed before us (e.g. a host's backpack),
      // probing with just our header so a tall panel can't be bumped past
      // the bottom controls; then cap our height to stop above them.
      const probe = Blockly.uiPosition.bumpPositionRect(
        new Blockly.utils.Rect(
          this.anchor.top,
          this.anchor.top + (this.headerDiv?.offsetHeight || PANEL_MARGIN),
          this.anchor.left,
          this.anchor.left + width,
        ),
        PANEL_MARGIN,
        Blockly.uiPosition.bumpDirection.DOWN,
        savedPositions,
      );
      left = probe.left;
      top = probe.top;
      maxHeight = capHeight(
        top,
        left,
        left + width,
        savedPositions,
        PANEL_MARGIN,
        bounds.height,
        PANEL_MIN_HEIGHT,
      );
      this.lastRect = new Blockly.utils.Rect(
        top,
        top + Math.min(height, maxHeight),
        left,
        left + width,
      );
    }

    this.htmlDiv.style.left = left + 'px';
    this.htmlDiv.style.right = 'auto';
    this.htmlDiv.style.top = top + 'px';
    // The panel scrolls internally within the space it was given.
    this.htmlDiv.style.maxHeight = maxHeight + 'px';
  }

  /** Header press-and-drag moves a floating panel; double-click puts it back. */
  private bindDrag(header: HTMLElement) {
    const onDown = (e: PointerEvent) => {
      if (this.isDocked() || e.button !== 0 || !this.htmlDiv) return;
      if ((e.target as Element).closest('button')) return;
      e.preventDefault();
      header.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startY = e.clientY;
      const startOffset = {
        dx: this.htmlDiv.offsetLeft - this.anchor.left,
        dy: this.htmlDiv.offsetTop - this.anchor.top,
      };

      const onMove = (m: PointerEvent) => {
        if (!this.htmlDiv) return;
        const injectionDiv = this.workspace.getInjectionDiv();
        this.state.floatOffset = clampOffset(
          {
            dx: startOffset.dx + (m.clientX - startX),
            dy: startOffset.dy + (m.clientY - startY),
          },
          this.anchor,
          {
            width: this.htmlDiv.offsetWidth,
            height: this.htmlDiv.offsetHeight,
          },
          {width: injectionDiv.clientWidth, height: injectionDiv.clientHeight},
        );
        this.htmlDiv.style.left =
          this.anchor.left + this.state.floatOffset.dx + 'px';
        this.htmlDiv.style.top =
          this.anchor.top + this.state.floatOffset.dy + 'px';
      };
      const onUp = () => {
        header.releasePointerCapture(e.pointerId);
        header.removeEventListener('pointermove', onMove);
        header.removeEventListener('pointerup', onUp);
        header.removeEventListener('pointercancel', onUp);
        this.persist();
        // Our rectangle is now unreported; let everything else re-settle.
        this.workspace.resize();
      };
      header.addEventListener('pointermove', onMove);
      header.addEventListener('pointerup', onUp);
      header.addEventListener('pointercancel', onUp);
    };
    const onDoubleClick = (e: MouseEvent) => {
      if (this.isDocked() || (e.target as Element).closest('button')) return;
      this.state.floatOffset = null;
      this.persist();
      this.workspace.resize();
    };
    header.addEventListener('pointerdown', onDown);
    header.addEventListener('dblclick', onDoubleClick);
    this.domCleanups.push(() => {
      header.removeEventListener('pointerdown', onDown);
      header.removeEventListener('dblclick', onDoubleClick);
    });
  }

  /** Re-runs positioning after the panel's size changed. Debounced. */
  private requestReposition() {
    if (this.repositionQueued) return;
    this.repositionQueued = true;
    requestAnimationFrame(() => {
      this.repositionQueued = false;
      if (this.htmlDiv) this.workspace.resize();
    });
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
        this.state.collapsed = !this.state.collapsed;
        this.persist();
        this.render();
      },
    );
    titleWrap.appendChild(this.collapseButton);
    const title = document.createElement('span');
    Blockly.utils.dom.addClass(title, 'blockly-layers-panel-title');
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
    this.dockButton = this.createHeaderButton(
      '⇥',
      'Dock as a sidebar',
      () => this.setMode(this.isDocked() ? 'floating' : 'docked'),
    );
    actions.appendChild(this.dockButton);
    header.appendChild(actions);

    this.headerDiv = header;
    this.bindDrag(header);
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
        'Gather the visible stacks into columns in free space (undoable)',
        () => this.callbacks.onArrangeVisible(),
      ),
    );
    this.htmlDiv.appendChild(this.toolbarDiv);

    this.navDiv = document.createElement('div');
    Blockly.utils.dom.addClass(this.navDiv, 'blockly-layers-panel-nav');
    const previous = this.createHeaderButton(
      '◀',
      'Previous visible stack',
      () => this.callbacks.onStep(-1),
    );
    this.navLabel = document.createElement('span');
    Blockly.utils.dom.addClass(this.navLabel, 'blockly-layers-panel-nav-label');
    const next = this.createHeaderButton('▶', 'Next visible stack', () =>
      this.callbacks.onStep(1),
    );
    const fit = this.createHeaderButton(
      'Fit',
      'Zoom out to fit the visible stacks (never below a readable size)',
      () => this.callbacks.onFit(),
    );
    this.navButtons = [previous, next, fit];
    this.navDiv.append(previous, this.navLabel, next, fit);
    this.htmlDiv.appendChild(this.navDiv);

    this.nameWrapper = this.createNameBox();
    this.htmlDiv.appendChild(this.nameWrapper);

    this.confirmWrapper = this.createConfirmBox();
    this.htmlDiv.appendChild(this.confirmWrapper);

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
        this.persist();
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
