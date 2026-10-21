# blockly-layers [![Built on Blockly](https://tinyurl.com/built-on-blockly)](https://github.com/google/blockly)

A [Blockly](https://www.npmjs.com/package/blockly) plugin that adds Photoshop-style "layers" to a workspace, for organizing large projects (hundreds or thousands of blocks) into meaningful parts. A layer is a named, checkbox-toggled group of **whole top-level stacks** — event handlers, procedure definitions, variable inits, anything that's its own entry on the canvas. Checking one or more layers opens a shared, fully-interactive secondary workspace showing just those stacks, independently arranged and editable, with changes synced back to the main workspace in both directions.

Layers come from three sources, combinable in the same panel:

- **Manual, author-curated layers** — the primary tool. Right-click any stack and choose "Add to layer..." to assign it to a named layer as you build. Persisted with the project.
- **Dynamic, auto-derived layers** — computed from the project itself, no configuration needed: one layer per variable, one per procedure, out of the box. A pluggable extension point lets a host application (e.g. a component-based system like MIT App Inventor) supply its own extractor — see [Dynamic layer providers](#dynamic-layer-providers) below.
- **Installer-configured static layers** — the original block-type-list mechanism. Useful as a secondary filter (e.g. "every block that logs to the console"), not the primary way to organize a project.

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

// Initialize the plugin. Both options are optional.
const plugin = new LayersPlugin(workspace, {
  // A secondary, type-based filter layer — optional.
  layers: [
    {
      id: "logging",
      name: "Logging",
      color: "#999999",
      blockTypes: ["text_print"],
    },
  ],
});
plugin.init();
```

That's it — the panel ships with "Variables" and "Procedures" dynamic sections automatically, and a "Layers" section (manual, author-curated) with a "+" button to create a new one. Right-click any top-level stack in the main workspace and choose "Add to layer..." to assign it, or "New layer..." to create one and assign the stack in one step.

Checking a layer's box reveals the shared secondary workspace containing every stack belonging to any currently-checked layer, auto-arranged on first appearance and freely draggable after that. Editing a block in either workspace — fields, connections, new blocks, deletions — is reflected in the other.

## API

- `new LayersPlugin(workspace, {layers?, dynamicProviders?})` — `layers` seeds the static, installer-configured layers (`StaticLayerDefinition[]`: `{id, name, blockTypes, color?, icon?}`); `dynamicProviders` adds custom `DynamicLayerProvider`s alongside the built-in by-variable/by-procedure ones.
- `plugin.init()` — registers persistence, the context menu, and shows the layer panel.
- `plugin.dispose()` — tears down the panel, context menu, and layer workspace.
- `plugin.setLayerActive(id, active)` / `plugin.getActiveLayerIds()` — show/hide any layer (from any source) programmatically, or read which are currently checked.
- `plugin.createManualLayer(name, {color?, icon?})` — creates a manual layer and returns its id; `plugin.removeManualLayer(id)` removes one.
- `plugin.assignToLayer(topBlockId, layerId)` / `plugin.unassignFromLayer(topBlockId, layerId)` — the programmatic equivalent of the context menu action.
- `plugin.exportManualLayers()` / `plugin.importManualLayers(state)` — manual export/import escape hatch; see [Persistence](#persistence).

## Dynamic layer providers

A `DynamicLayerProvider` auto-generates one layer per distinct key it extracts from any block in the project:

```ts
interface DynamicLayerProvider {
  key: string; // namespaces this provider's layer ids; must be unique
  sectionTitle: string; // heading shown in the panel
  extractKey(block: Blockly.Block): string | null;
}
```

The plugin ships `byVariableProvider` and `byProcedureProvider` (used automatically; you don't need to pass them). For a component-based system like **MIT App Inventor**, where event-handler blocks identify a component via some field (the exact field name depends on your block definitions — this example assumes a `COMPONENT` field), a provider that yields "one layer per component actually used in this project" looks like:

```js
const byComponentProvider = {
  key: "component",
  sectionTitle: "Components",
  extractKey(block) {
    // Adjust to however your blocks actually identify their component —
    // e.g. a field on every "when <Component>.<Event>" block.
    return block.getField("COMPONENT")?.getValue() ?? null;
  },
};

const plugin = new LayersPlugin(workspace, {
  dynamicProviders: [byComponentProvider],
});
```

This sidesteps the scaling problem of pre-registering a static layer per possible component (which could number in the hundreds): the "Components" section only ever lists components that actually appear in the current project, recomputed live.

## Persistence

Manual layers (definitions and which stacks are assigned to them) are persisted by registering a serializer with Blockly's own serializer registry. If your app already calls `Blockly.serialization.workspaces.save(workspace)` / `.load(state, workspace)` — directly, or via your own higher-level save/load flow built on top of it — manual layers are included automatically under a `"layers"` key, with no extra work. You still decide where that resulting JSON is stored (your database, a file, etc.).

Dynamic layers are never persisted — they're always recomputed from the current project. Static layers aren't persisted either; they're installer configuration, supplied fresh via the constructor every time.

If your save/load path bypasses the serializer registry entirely, use the manual escape hatch instead:

```js
const state = plugin.exportManualLayers();
// ...store `state` however you like...
plugin.importManualLayers(state);
```

## License

Apache 2.0
