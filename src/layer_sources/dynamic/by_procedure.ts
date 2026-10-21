/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Built-in dynamic layer provider: one auto-generated layer
 * per procedure referenced anywhere in the project, covering both the
 * definition (`procedures_def*`) and every call site (`procedures_call*`).
 * Both kinds of block expose the procedure name via the same `NAME` field,
 * so no further branching is needed once the type prefix is confirmed.
 */
import type * as Blockly from 'blockly/core';

import type {DynamicLayerProvider} from '../../layer_types';

export const byProcedureProvider: DynamicLayerProvider = {
  key: 'procedure',
  sectionTitle: 'Procedures',

  extractKey(block: Blockly.Block): string | null {
    if (
      !block.type.startsWith('procedures_def') &&
      !block.type.startsWith('procedures_call')
    ) {
      return null;
    }
    return block.getFieldValue('NAME') || null;
  },
};
