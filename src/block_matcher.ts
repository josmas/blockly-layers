/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Pure helpers for deciding which blocks belong to the
 * currently active set of layers. No Blockly workspace mutation happens
 * here; these are read-only queries used by the sync engine.
 */
import type * as Blockly from "blockly/core";

import type { LayerDefinition } from "./layer_types";

/**
 * Computes the union of block types belonging to every currently-active
 * layer.
 *
 * @param layers All configured layers.
 * @param activeIds The ids of the layers that are currently checked.
 * @returns The set of block type names that should be mirrored.
 */
export function getActiveBlockTypes(
  layers: LayerDefinition[],
  activeIds: ReadonlySet<string>,
): Set<string> {
  const types = new Set<string>();
  for (const layer of layers) {
    if (!activeIds.has(layer.id)) continue;
    for (const type of layer.blockTypes) {
      types.add(type);
    }
  }
  return types;
}

/**
 * Finds the topmost block in each connected chain whose type is in
 * `activeTypes`, walking down from the workspace's top blocks. Once a match
 * is found along a branch, its descendants are not searched separately —
 * the whole matched subtree is treated as belonging to that one root, even
 * if some of its descendants are also, independently, of an active type.
 * This avoids mirroring the same block twice under two different roots.
 *
 * @param workspace The workspace to search.
 * @param activeTypes The set of block types that are currently active.
 * @returns The root blocks that should be mirrored, in workspace order.
 */
export function findRootMatches(
  workspace: Blockly.Workspace,
  activeTypes: ReadonlySet<string>,
): Blockly.Block[] {
  const roots: Blockly.Block[] = [];
  if (activeTypes.size === 0) return roots;

  const visit = (block: Blockly.Block) => {
    if (activeTypes.has(block.type)) {
      roots.push(block);
      return;
    }
    for (const child of block.getChildren(true)) {
      visit(child);
    }
  };

  for (const topBlock of workspace.getTopBlocks(true)) {
    visit(topBlock);
  }
  return roots;
}
