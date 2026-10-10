/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Plugin test.
 */

import * as Blockly from "blockly";
import { toolboxCategories, createPlayground } from "@blockly/dev-tools";
import { LayersPlugin } from "../src/index";

/** A handful of starter blocks spanning every demo layer. */
const DEMO_STATE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "controls_repeat_ext",
        x: 20,
        y: 20,
        inputs: {
          TIMES: { shadow: { type: "math_number", fields: { NUM: 10 } } },
          DO: {
            block: {
              type: "controls_if",
              inputs: {
                DO0: {
                  block: {
                    type: "variables_set",
                    fields: { VAR: { name: "i" } },
                    inputs: {
                      VALUE: {
                        shadow: { type: "math_number", fields: { NUM: 0 } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        type: "controls_whileUntil",
        x: 20,
        y: 220,
        fields: { MODE: "WHILE" },
      },
      {
        type: "procedures_defnoreturn",
        x: 300,
        y: 20,
        fields: { NAME: "doSomething" },
      },
      {
        type: "variables_set",
        x: 300,
        y: 160,
        fields: { VAR: { name: "score" } },
        inputs: {
          VALUE: { shadow: { type: "math_number", fields: { NUM: 0 } } },
        },
      },
      { type: "controls_if", x: 300, y: 220 },
    ],
  },
};

/**
 * Create a workspace.
 *
 * @param blocklyDiv The blockly container div.
 * @param options The Blockly options.
 * @returns The created workspace.
 */
function createWorkspace(
  blocklyDiv: HTMLElement,
  options: Blockly.BlocklyOptions,
): Blockly.WorkspaceSvg {
  const workspace = Blockly.inject(blocklyDiv, options);
  Blockly.serialization.workspaces.load(DEMO_STATE, workspace);

  const plugin = new LayersPlugin(workspace, {
    layers: [
      {
        id: "logic",
        name: "Logic",
        color: "#5b80a5",
        blockTypes: [
          "controls_if",
          "logic_compare",
          "logic_operation",
          "logic_negate",
          "logic_boolean",
          "logic_null",
          "logic_ternary",
        ],
      },
      {
        id: "loops",
        name: "Loops",
        color: "#5ba55b",
        blockTypes: [
          "controls_repeat_ext",
          "controls_repeat",
          "controls_whileUntil",
          "controls_for",
          "controls_forEach",
          "controls_flow_statements",
        ],
      },
      {
        id: "variables",
        name: "Variables",
        color: "#a55b80",
        blockTypes: ["variables_get", "variables_set"],
      },
      {
        id: "functions",
        name: "Functions",
        color: "#995ba5",
        blockTypes: [
          "procedures_defnoreturn",
          "procedures_defreturn",
          "procedures_callnoreturn",
          "procedures_callreturn",
          "procedures_ifreturn",
        ],
      },
    ],
  });
  plugin.init();

  return workspace;
}

document.addEventListener("DOMContentLoaded", function () {
  const defaultOptions = {
    toolbox: toolboxCategories,
  };
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error(`div with id 'root' not found`);
  }
  createPlayground(rootElement, createWorkspace, defaultOptions);
});
