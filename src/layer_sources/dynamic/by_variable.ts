/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Built-in dynamic layer provider: one auto-generated layer
 * per variable referenced anywhere in the project (via any field that's a
 * `Blockly.FieldVariable` — covers `variables_get`/`variables_set` as well
 * as loop blocks' own variable dropdowns, with no per-block-type list to
 * maintain).
 */
import * as Blockly from 'blockly/core';

import type {DynamicLayerProvider} from '../../layer_types';

export const byVariableProvider: DynamicLayerProvider = {
  key: 'variable',
  sectionTitle: 'Variables',

  extractKey(block: Blockly.Block): string | null {
    for (const input of block.inputList) {
      for (const field of input.fieldRow) {
        if (field instanceof Blockly.FieldVariable) {
          const variable = field.getVariable();
          if (variable) return variable.getName();
        }
      }
    }
    return null;
  },
};
