/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Pure helpers behind the static, block-type-list layer
 * source. No Blockly workspace mutation happens here; these are read-only
 * queries used by {@link StaticTypeSource}.
 */
import type * as Blockly from 'blockly/core';

/**
 * Whether `topBlock`'s stack — the block itself plus everything nested or
 * chained below it — contains at least one block whose type is in
 * `activeTypes`. The whole stack is the unit of membership: a single
 * matching block anywhere inside pulls in the entire top-level stack, not
 * just the matching block's own subtree.
 */
export function stackMatchesTypes(
  topBlock: Blockly.Block,
  activeTypes: ReadonlySet<string>,
): boolean {
  if (activeTypes.size === 0) return false;
  for (const block of topBlock.getDescendants(false)) {
    if (activeTypes.has(block.type)) return true;
  }
  return false;
}

/**
 * Every top-level stack in `workspace` that matches {@link stackMatchesTypes}.
 */
export function getMatchingTopBlocks(
  workspace: Blockly.Workspace,
  activeTypes: ReadonlySet<string>,
): Blockly.Block[] {
  if (activeTypes.size === 0) return [];
  return workspace
    .getTopBlocks(false)
    .filter((block) => stackMatchesTypes(block, activeTypes));
}
