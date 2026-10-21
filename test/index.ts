/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Plugin test.
 */

import * as Blockly from 'blockly';
import {toolboxCategories, createPlayground} from '@blockly/dev-tools';
import {LayersPlugin} from '../src/index';
import type {DynamicLayerProvider} from '../src/index';

/**
 * A toy stand-in for an App-Inventor-style "when <Component>.<Event> do"
 * block, purely to demonstrate the `DynamicLayerProvider` extension point
 * without needing App Inventor's real block definitions. A real
 * integration would read whichever field its own blocks already use to
 * identify a component — see the README's "Dynamic layer providers"
 * section.
 */
Blockly.Blocks['demo_when_component_event'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('when')
      .appendField(new Blockly.FieldTextInput('Button1'), 'COMPONENT')
      .appendField('.Click do');
    this.appendStatementInput('DO');
    this.setColour(290);
  },
};

const byComponentProvider: DynamicLayerProvider = {
  key: 'component',
  sectionTitle: 'Components',
  extractKey(block) {
    return block.type === 'demo_when_component_event'
      ? block.getFieldValue('COMPONENT')
      : null;
  },
};

/** A handful of starter blocks spanning the demo's layer sources. */
const DEMO_STATE = {
  'blocks': {
    'languageVersion': 0,
    'blocks': [
      {
        'type': 'controls_repeat_ext',
        'x': 20,
        'y': 20,
        'inputs': {
          'TIMES': {'shadow': {'type': 'math_number', 'fields': {'NUM': 10}}},
          'DO': {
            'block': {
              'type': 'controls_if',
              'inputs': {
                'DO0': {
                  'block': {
                    'type': 'variables_set',
                    'fields': {'VAR': {'name': 'i'}},
                    'inputs': {
                      'VALUE': {
                        'shadow': {'type': 'math_number', 'fields': {'NUM': 0}},
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
        'type': 'controls_whileUntil',
        'x': 20,
        'y': 220,
        'fields': {'MODE': 'WHILE'},
      },
      {
        'type': 'procedures_defnoreturn',
        'x': 300,
        'y': 20,
        'fields': {'NAME': 'doSomething'},
      },
      {
        'type': 'variables_set',
        'x': 300,
        'y': 160,
        'fields': {'VAR': {'name': 'score'}},
        'inputs': {
          'VALUE': {'shadow': {'type': 'math_number', 'fields': {'NUM': 0}}},
        },
      },
      {
        'type': 'demo_when_component_event',
        'x': 20,
        'y': 320,
        'fields': {'COMPONENT': 'Button1'},
        'inputs': {
          'DO': {
            'block': {
              'type': 'variables_set',
              'fields': {'VAR': {'name': 'score'}},
              'inputs': {
                'VALUE': {
                  'shadow': {'type': 'math_number', 'fields': {'NUM': 1}},
                },
              },
            },
          },
        },
      },
      {
        'type': 'demo_when_component_event',
        'x': 300,
        'y': 320,
        'fields': {'COMPONENT': 'Canvas1'},
      },
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
    // Kept only as a demo of the secondary, installer-configured filter —
    // the primary organizing tools are the manual and dynamic sections.
    layers: [
      {
        id: 'loops',
        name: 'Loops',
        color: '#5ba55b',
        blockTypes: [
          'controls_repeat_ext',
          'controls_repeat',
          'controls_whileUntil',
          'controls_for',
          'controls_forEach',
        ],
      },
    ],
    dynamicProviders: [byComponentProvider],
  });
  plugin.init();

  // Seed one manual layer with an existing stack already assigned, so
  // there's something to see immediately. Right-click any other stack to
  // try "Add to layer..." / "New layer..." yourself.
  const [firstTopBlock] = workspace.getTopBlocks(false);
  if (firstTopBlock) {
    const demoLayerId = plugin.createManualLayer('Demo layer', {
      color: '#e8a33d',
    });
    plugin.assignToLayer(firstTopBlock.id, demoLayerId);
  }

  return workspace;
}

document.addEventListener('DOMContentLoaded', function () {
  const defaultOptions = {
    toolbox: toolboxCategories,
  };
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error(`div with id 'root' not found`);
  }
  createPlayground(rootElement, createWorkspace, defaultOptions);
});
