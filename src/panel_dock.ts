/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Docks the layer panel as a sidebar inside the element the
 * host injected Blockly into. The host gave us one element and Blockly sized
 * its SVG from the injection div's size, so turning that element into a flex
 * row (injection div | splitter | panel) shrinks the workspace without any
 * host layout change. Everything we touch is recorded on entry and put back on
 * exit, so a host can't tell we were here.
 */
import * as Blockly from 'blockly/core';

import {clampDockWidth} from './panel_state';

const SPLITTER_THICKNESS = 6;
/** Keeps the workspace usable however wide the panel is dragged. */
const MIN_WORKSPACE_WIDTH = 120;

Blockly.Css.register(`
  .blockly-layers-splitter {
    flex: 0 0 ${SPLITTER_THICKNESS}px;
    cursor: col-resize;
    background: #e4e4e4;
    touch-action: none;
    z-index: 21;
  }
  .blockly-layers-splitter:hover,
  .blockly-layers-splitter.blockly-layers-splitter-active {
    background: #bbb;
  }
`);

export interface PanelDockCallbacks {
  /** Width to use when a drag starts. */
  getWidth(): number;
  /** Live width during a splitter drag. */
  onResize(width: number): void;
  /** Final width when the drag ends. */
  onCommit(width: number): void;
}

interface SavedStyles {
  containerDisplay: string;
  containerFlexDirection: string;
  injectionFlex: string;
  injectionMinWidth: string;
}

export class PanelDock {
  private saved: SavedStyles | null = null;
  private container: HTMLElement | null = null;
  private splitter: HTMLDivElement | null = null;
  private observer: ResizeObserver | null = null;
  private cleanups: Array<() => void> = [];

  constructor(
    private readonly workspace: Blockly.WorkspaceSvg,
    private readonly callbacks: PanelDockCallbacks,
  ) {}

  isDocked(): boolean {
    return this.saved !== null;
  }

  /** Moves `panel` out of the injection div into a flex row beside it. */
  enter(panel: HTMLElement) {
    if (this.saved) return;
    const injectionDiv = this.workspace.getInjectionDiv();
    const container = injectionDiv.parentElement;
    if (!container) return;
    this.container = container;
    this.saved = {
      containerDisplay: container.style.display,
      containerFlexDirection: container.style.flexDirection,
      injectionFlex: injectionDiv.style.flex,
      injectionMinWidth: injectionDiv.style.minWidth,
    };

    container.style.display = 'flex';
    container.style.flexDirection = this.workspace.RTL ? 'row-reverse' : 'row';
    injectionDiv.style.flex = '1 1 0';
    injectionDiv.style.minWidth = '0';

    this.splitter = document.createElement('div');
    this.splitter.className = 'blockly-layers-splitter';
    this.splitter.title = 'Drag to resize the layers panel';
    this.bindSplitter(this.splitter);
    container.appendChild(this.splitter);
    container.appendChild(panel);

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.syncWorkspaceSize());
      this.observer.observe(injectionDiv);
    }
    this.syncWorkspaceSize();
  }

  /** Undoes `enter()`. The caller re-homes the panel element. */
  exit() {
    if (!this.saved || !this.container) return;
    const injectionDiv = this.workspace.getInjectionDiv();
    this.observer?.disconnect();
    this.observer = null;
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
    this.splitter?.remove();
    this.splitter = null;

    this.container.style.display = this.saved.containerDisplay;
    this.container.style.flexDirection = this.saved.containerFlexDirection;
    injectionDiv.style.flex = this.saved.injectionFlex;
    injectionDiv.style.minWidth = this.saved.injectionMinWidth;
    this.saved = null;
    this.container = null;
    this.syncWorkspaceSize();
  }

  /** Hides the splitter, e.g. while the panel is collapsed to a rail. */
  setSplitterVisible(visible: boolean) {
    if (this.splitter) this.splitter.style.display = visible ? '' : 'none';
  }

  /** Re-fits the SVG to the injection div after any size change. */
  syncWorkspaceSize() {
    Blockly.common.svgResize(this.workspace);
  }

  private bindSplitter(splitter: HTMLDivElement) {
    const rtl = this.workspace.RTL;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !this.container) return;
      e.preventDefault();
      splitter.setPointerCapture(e.pointerId);
      splitter.classList.add('blockly-layers-splitter-active');
      const startX = e.clientX;
      const startWidth = this.callbacks.getWidth();
      const maxWidth = Math.max(
        0,
        this.container.clientWidth - SPLITTER_THICKNESS - MIN_WORKSPACE_WIDTH,
      );
      let width = startWidth;

      const onMove = (m: PointerEvent) => {
        // The panel grows as the splitter moves toward the workspace: leftward
        // when docked on the right, rightward when docked on the left (RTL).
        const delta = rtl ? m.clientX - startX : startX - m.clientX;
        width = Math.min(clampDockWidth(startWidth + delta), maxWidth);
        this.callbacks.onResize(width);
      };
      const onUp = () => {
        splitter.releasePointerCapture(e.pointerId);
        splitter.classList.remove('blockly-layers-splitter-active');
        splitter.removeEventListener('pointermove', onMove);
        splitter.removeEventListener('pointerup', onUp);
        splitter.removeEventListener('pointercancel', onUp);
        this.callbacks.onCommit(width);
      };
      splitter.addEventListener('pointermove', onMove);
      splitter.addEventListener('pointerup', onUp);
      splitter.addEventListener('pointercancel', onUp);
    };
    splitter.addEventListener('pointerdown', onDown);
    this.cleanups.push(() =>
      splitter.removeEventListener('pointerdown', onDown),
    );
  }
}
