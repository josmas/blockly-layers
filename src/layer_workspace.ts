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
   * @param getDesiredTopBlockIds Returns the ids of every top-level stack
   *     that should currently be mirrored, from all active layers' sources.
   */
  constructor(
    private readonly primaryWorkspace: Blockly.WorkspaceSvg,
    private readonly getDesiredTopBlockIds: () => Set<string>,
  ) {
    this.syncEngine = new SyncEngine(primaryWorkspace, getDesiredTopBlockIds);
  }

  /** Creates/shows/hides the layer workspace to match the active layers. */
  refresh() {
    const active = this.getDesiredTopBlockIds();
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

    // Blockly.inject() unconditionally makes the workspace it just created
    // Blockly's global "main workspace" (used internally for dropdown/
    // widget-div positioning, keyboard navigation, and toolbox chaff
    // handling) — there's no public option to opt out. It restores this
    // itself on 'focusin', so replay that against the real primary
    // workspace's injection div to put things back the way they should be;
    // otherwise those internal singletons stay pointed at the layer
    // workspace until the user happens to click into the primary one.
    this.primaryWorkspace
      .getInjectionDiv()
      .dispatchEvent(new Event("focusin", { bubbles: true }));

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
