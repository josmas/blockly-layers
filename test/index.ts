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
 * A stand-in for App Inventor's backpack: an `IPositionable` at weight 2 in
 * the top corner (right, or left in RTL) that bumps down out of anything
 * placed before it. It exists so the browser tests can check that the layers
 * panel neither covers it nor displaces it.
 */
class StubBackpack implements Blockly.IPositionable {
  id = 'stubBackpack';
  private readonly div: HTMLDivElement;
  private rect: Blockly.utils.Rect | null = null;
  private static readonly SIZE = 48;
  private static readonly MARGIN = 10;

  constructor(private readonly workspace: Blockly.WorkspaceSvg) {
    this.div = document.createElement('div');
    this.div.id = 'stub-backpack';
    this.div.style.cssText =
      `position:absolute;z-index:20;box-sizing:border-box;background:#996;` +
      `width:${StubBackpack.SIZE}px;height:${StubBackpack.SIZE}px;`;
    workspace.getInjectionDiv().appendChild(this.div);
    workspace.getComponentManager().addComponent({
      component: this,
      weight: 2,
      capabilities: [Blockly.ComponentManager.Capability.POSITIONABLE],
    });
  }

  getBoundingRectangle() {
    return this.rect;
  }

  position(
    metrics: Blockly.MetricsManager.UiMetrics,
    savedPositions: Blockly.utils.Rect[],
  ) {
    const {SIZE, MARGIN} = StubBackpack;
    const left = this.workspace.RTL
      ? MARGIN
      : metrics.absoluteMetrics.left + metrics.viewMetrics.width - SIZE - MARGIN;
    const top = metrics.absoluteMetrics.top + MARGIN;
    this.rect = Blockly.uiPosition.bumpPositionRect(
      new Blockly.utils.Rect(top, top + SIZE, left, left + SIZE),
      MARGIN,
      Blockly.uiPosition.bumpDirection.DOWN,
      savedPositions,
    );
    this.div.style.left = this.rect.left + 'px';
    this.div.style.top = this.rect.top + 'px';
  }
}

interface FixtureOptions {
  /** Extra distinct variables to create, i.e. that many extra dynamic layers. */
  many: number;
  /** Passed straight to the plugin's `minReadableScale` option. */
  minReadableScale?: number;
}

/**
 * Create a workspace.
 *
 * @param blocklyDiv The blockly container div.
 * @param options The Blockly options.
 * @param fixture Set only by the browser-test fixture page.
 * @param withBackpack Also add the stub backpack (always on for the fixture);
 *     the playground enables it with `?backpack=1`.
 * @returns The created workspace.
 */
function createWorkspace(
  blocklyDiv: HTMLElement,
  options: Blockly.BlocklyOptions,
  fixture?: FixtureOptions,
  withBackpack = false,
): Blockly.WorkspaceSvg {
  const workspace = Blockly.inject(blocklyDiv, options);
  Blockly.serialization.workspaces.load(DEMO_STATE, workspace);
  if (fixture) {
    for (let i = 0; i < fixture.many; i++) {
      const block = workspace.newBlock('variables_set');
      block.setFieldValue(workspace.getVariableMap().createVariable(`v${i}`).getId(), 'VAR');
      block.initSvg();
      block.render();
      block.moveBy(600 + (i % 10) * 10, 20 + i * 4);
    }
  }
  const stubBackpack =
    fixture || withBackpack ? new StubBackpack(workspace) : null;

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
    minReadableScale: fixture?.minReadableScale,
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

  if (fixture) {
    (window as unknown as Record<string, unknown>).fixture = {
      workspace,
      plugin,
      stubBackpack,
    };
  }
  return workspace;
}

/**
 * `?fixture=1` mounts a lean page for the Playwright suite instead of the
 * dev-tools playground (which loads a code editor from the network): the
 * workspace sits in a host-like element sized the way App Inventor sizes its
 * own (`width/height: 100%; overflow: hidden`), with the usual zoom and trash
 * controls and a stub backpack. `rtl=1` flips it; `renderer=zelos` picks a renderer; `minReadable=0.8` sets the plugin's `minReadableScale`; `many=N` adds N variable
 * layers.
 */
function mountFixture(rootElement: HTMLElement, params: URLSearchParams) {
  rootElement.style.cssText = 'width:100vw;height:100vh;';
  const host = document.createElement('div');
  host.id = 'fixture-host';
  host.style.cssText = 'width:100%;height:100%;overflow:hidden;';
  rootElement.appendChild(host);
  createWorkspace(
    host,
    {
      toolbox: {kind: 'flyoutToolbox', contents: []},
      zoom: {controls: true, wheel: true},
      trashcan: true,
      scrollbars: true,
      rtl: params.get('rtl') === '1',
      renderer: params.get('renderer') ?? undefined,
    },
    {
      many: Number(params.get('many') ?? 0),
      minReadableScale: params.has('minReadable')
        ? Number(params.get('minReadable'))
        : undefined,
    },
  );
}

document.addEventListener('DOMContentLoaded', function () {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error(`div with id 'root' not found`);
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('fixture') === '1') {
    mountFixture(rootElement, params);
    return;
  }
  const defaultOptions = {
    toolbox: toolboxCategories,
  };
  const withBackpack = params.get('backpack') === '1';
  createPlayground(
    rootElement,
    (div, options) => createWorkspace(div, options, undefined, withBackpack),
    defaultOptions,
  );
});
