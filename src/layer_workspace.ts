/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Owns the lifecycle of the single shared "layer workspace":
 * a fully-interactive secondary Blockly workspace showing the union of all
 * currently active layers. Created lazily on first use, then shown/hidden
 * (not disposed) as layers are toggled on and off, so that block positions
 * dragged by the user inside it persist across toggles.
 */
import * as Blockly from "blockly/core";

import { SyncEngine } from "./sync_engine";

/** Default panel is a fixed bottom dock; override via the CSS class below. */
const DEFAULT_PANEL_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  left: "0",
  right: "0",
  bottom: "0",
  height: "40vh",
  zIndex: "30",
  background: "var(--blockly-layer-ws-bg, #fff)",
  borderTop: "3px solid var(--blockly-layer-ws-border, #ccc)",
  boxShadow: "0 -2px 8px rgba(0, 0, 0, 0.2)",
};

export class LayerWorkspaceController {
  private wrapperDiv: HTMLDivElement | null = null;
  private layerWorkspace: Blockly.WorkspaceSvg | null = null;
  private readonly syncEngine: SyncEngine;
  private readonly onWindowResize = () => {
    if (this.layerWorkspace) Blockly.svgResize(this.layerWorkspace);
  };

  /**
   * @param primaryWorkspace The always-visible, full project workspace.
   * @param getActiveTypes Returns the block types currently selected by the
   *     active layers.
   */
  constructor(
    private readonly primaryWorkspace: Blockly.WorkspaceSvg,
    private readonly getActiveTypes: () => Set<string>,
  ) {
    this.syncEngine = new SyncEngine(primaryWorkspace, getActiveTypes);
  }

  /** Creates/shows/hides the layer workspace to match the active layers. */
  refresh() {
    const active = this.getActiveTypes();
    if (!this.layerWorkspace && active.size === 0) {
      return;
    }
    if (!this.layerWorkspace) {
      this.create();
    }
    // Reconcile before hiding too: deactivating the last layer must still
    // prune every mirrored block, otherwise they sit undisposed behind the
    // hidden panel and reappear (still mirrored) the next time any layer is
    // activated, regardless of whether it's the layer that put them there.
    this.syncEngine.notifyActiveLayersChanged();
    if (active.size === 0) {
      this.hide();
    } else {
      this.show();
    }
  }

  isVisible(): boolean {
    return !!this.wrapperDiv && this.wrapperDiv.style.display !== "none";
  }

  dispose() {
    this.syncEngine.dispose();
    window.removeEventListener("resize", this.onWindowResize);
    this.layerWorkspace?.dispose();
    this.layerWorkspace = null;
    if (this.wrapperDiv) {
      Blockly.utils.dom.removeNode(this.wrapperDiv);
      this.wrapperDiv = null;
    }
  }

  private create() {
    this.wrapperDiv = document.createElement("div");
    this.wrapperDiv.id = "blocklyLayerWorkspace" + this.primaryWorkspace.id;
    Blockly.utils.dom.addClass(this.wrapperDiv, "blockly-layer-workspace");
    Object.assign(this.wrapperDiv.style, DEFAULT_PANEL_STYLE);
    document.body.appendChild(this.wrapperDiv);

    this.layerWorkspace = Blockly.inject(this.wrapperDiv.id, {
      rtl: this.primaryWorkspace.RTL,
      theme: this.primaryWorkspace.getTheme(),
      renderer: this.primaryWorkspace.options.renderer,
      toolbox: this.primaryWorkspace.options.languageTree ?? undefined,
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 1 },
    });
    window.addEventListener("resize", this.onWindowResize);

    this.syncEngine.attachToLayerWorkspace(this.layerWorkspace);
  }

  private show() {
    if (this.wrapperDiv) this.wrapperDiv.style.display = "";
    if (this.layerWorkspace) Blockly.svgResize(this.layerWorkspace);
  }

  private hide() {
    if (this.wrapperDiv) this.wrapperDiv.style.display = "none";
  }
}
