# blockly-layers [![Built on Blockly](https://tinyurl.com/built-on-blockly)](https://github.com/google/blockly)

A [Blockly](https://www.npmjs.com/package/blockly) plugin that adds Photoshop-style "layers" to a workspace. The installer configures named layers, each mapped to a list of block types (e.g. Loops, Variables, Functions). The end user gets a floating panel of checkboxes; checking one or more layers opens a second, fully-interactive workspace showing just the matching blocks (plus their full nested contents), independently arranged and editable, with changes synced back to the main workspace in both directions.

## AI Disclosure

Much of the code in the plugin has been generated with a coding agent.

## Installation

**NOTE:** this package is not yet published to the npm registry so the following instructions will not work.

The only way to get the plugin working for now is to clone this repo and use the sources.

### Yarn

```
yarn add blockly-layers
```

### npm

```
npm install blockly-layers --save
```

## Usage

```js
import * as Blockly from "blockly";
import { LayersPlugin } from "blockly-layers";

// Inject Blockly.
const workspace = Blockly.inject("blocklyDiv", {
  toolbox: toolboxCategories,
});

// Initialize the plugin with the layers you want to offer.
const plugin = new LayersPlugin(workspace, {
  layers: [
    {
      id: "loops",
      name: "Loops",
      color: "#5ba55b",
      blockTypes: [
        "controls_repeat_ext",
        "controls_whileUntil",
        "controls_for",
      ],
    },
    {
      id: "variables",
      name: "Variables",
      color: "#a55b80",
      blockTypes: ["variables_get", "variables_set"],
    },
  ],
});
plugin.init();
```

Checking a layer's box in the panel shows a shared secondary workspace containing every block of that layer's types (plus the rest of their stack/inputs), auto-arranged on first appearance and freely draggable after that. Checking more than one layer shows the union of all of them. Editing a block in either workspace is reflected in the other.

## API

- `new LayersPlugin(workspace, {layers})` — create the plugin with an initial list of `LayerDefinition`s: `{id, name, blockTypes, color?, icon?}`.
- `plugin.init()` — shows the layer panel.
- `plugin.dispose()` — tears down the panel and the layer workspace.
- `plugin.addLayer(layer)` / `plugin.removeLayer(id)` /
  `plugin.updateLayer(id, partial)` — manage layers at runtime.
- `plugin.setLayerActive(id, active)` / `plugin.getActiveLayerIds()` —
  show/hide a layer programmatically, or read which are currently checked.
- `plugin.getLayers()` — read the full current layer configuration.

## License

Apache 2.0
