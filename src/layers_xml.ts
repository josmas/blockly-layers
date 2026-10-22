/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview An optional XML representation of manual layer state, for
 * hosts that save workspaces with `Blockly.Xml` rather than Blockly's JSON
 * serialization (which `layers_serializer.ts` already covers). The plugin
 * never calls this on its own; the host appends the element wherever its
 * file format allows and hands it back after the blocks have loaded.
 *
 * <layers>
 *   <layer id="…" name="…" color="…" icon="…"/>
 *   <stack block="topBlockId"><member layer="layerId"/>…</stack>
 * </layers>
 */
import * as Blockly from 'blockly/core';

import type {ManualLayerState} from './layer_sources/manual_source';

export const LAYERS_XML_TAG = 'layers';

export function manualLayerStateToXml(state: ManualLayerState): Element {
  const root = Blockly.utils.xml.createElement(LAYERS_XML_TAG);
  for (const layer of state.layers) {
    const el = Blockly.utils.xml.createElement('layer');
    el.setAttribute('id', layer.id);
    el.setAttribute('name', layer.name);
    if (layer.color) el.setAttribute('color', layer.color);
    if (layer.icon) el.setAttribute('icon', layer.icon);
    root.appendChild(el);
  }
  for (const [blockId, layerIds] of Object.entries(state.membership)) {
    if (!layerIds.length) continue;
    const stack = Blockly.utils.xml.createElement('stack');
    stack.setAttribute('block', blockId);
    for (const layerId of layerIds) {
      const member = Blockly.utils.xml.createElement('member');
      member.setAttribute('layer', layerId);
      stack.appendChild(member);
    }
    root.appendChild(stack);
  }
  return root;
}

/** Parses an element produced by {@link manualLayerStateToXml}. Malformed entries are skipped. */
export function manualLayerStateFromXml(root: Element): ManualLayerState {
  const state: ManualLayerState = {layers: [], membership: {}};
  const known = new Set<string>();
  for (const child of Array.from(root.children)) {
    if (child.tagName !== 'layer') continue;
    const id = child.getAttribute('id');
    const name = child.getAttribute('name');
    if (!id || name === null) continue;
    known.add(id);
    state.layers.push({
      id,
      name,
      color: child.getAttribute('color') ?? undefined,
      icon: child.getAttribute('icon') ?? undefined,
    });
  }
  for (const child of Array.from(root.children)) {
    if (child.tagName !== 'stack') continue;
    const blockId = child.getAttribute('block');
    if (!blockId) continue;
    const layerIds = Array.from(child.children)
      .filter((m) => m.tagName === 'member')
      .map((m) => m.getAttribute('layer'))
      .filter((id): id is string => !!id && known.has(id));
    if (layerIds.length) state.membership[blockId] = layerIds;
  }
  return state;
}
