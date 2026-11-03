# blockly-layers [![Built on Blockly](https://tinyurl.com/built-on-blockly)](https://github.com/google/blockly)

A [Blockly](https://www.npmjs.com/package/blockly) plugin that adds Photoshop-style "layers" to a workspace, for organizing large projects (hundreds or thousands of blocks) into meaningful parts. A layer is a named, checkbox-toggled group of **whole top-level stacks** — event handlers, procedure definitions, variable inits, anything that's its own entry on the canvas. Checking one or more layers filters the workspace in place: stacks outside the active layers are dimmed (or hidden), and the view zooms to fit what's left. There is only one workspace, so everything stays fully editable and there is nothing to sync.

Layers come from three sources, combinable in the same panel:

- **Manual, author-curated layers** — the primary tool. Right-click any stack and pick a "Layer: <name>" item (under a "Layers" heading) to assign it to a named layer as you build. Persisted with the project.
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

That's it — the panel ships with "Variables" and "Procedures" dynamic sections automatically, and a "Layers" section (manual, author-curated) with a "+" button to create a new one. Right-click any top-level stack in the main workspace and pick a "Layer: <name>" item to toggle its membership (a check mark means it's in that layer), or "+ New layer..." to create one and assign the stack in one step. Each manual layer row has a remove button; the panel header's "Clear" button (shown only when something's active) deactivates every layer at once.

Checking a layer's box dims every stack that belongs to none of the checked layers (or hides it, via the panel's "Others: dimmed/hidden" toggle) and scrolls and zooms to fit the stacks that remain. Stacks keep their real positions; the panel's "Arrange visible" button stacks the visible ones into a column (a normal, undoable move). A stack created while filtering stays visible until the active layers next change. The panel can be collapsed to a one-line "Showing: ..." summary.

Known limitation: workspace-level actions such as "Clean up Blocks", "Delete N Blocks" and "Collapse Blocks" still act on hidden stacks too.

A project can easily have hundreds of variables or procedures, each becoming its own dynamic layer row, so every section except the manual "Layers" one is collapsible (collapsed by default) and a single search box filters rows across every section at once. Dynamic sections stay live — creating, deleting, or renaming a block updates the matching section automatically, no refresh needed.

### Floating or docked

The panel has two modes, switched with the button at the right of its header.

- **Floating** (default) sits over the workspace in the top-right corner (top-left in RTL), stepping under controls such as a backpack, stopping above the zoom controls and trash can, and displacing none of them. Drag its header to put it anywhere; once moved it floats freely, and double-clicking the header returns it to the default spot.
- **Docked** turns it into a sidebar beside the workspace. The plugin does this inside the element Blockly was injected into (that element becomes a flex row), so the host needs no layout change; leaving dock mode or calling `dispose()` restores that element exactly. Drag the splitter to resize it; collapsing it leaves a thin rail.

Each user's choice — mode, position, dock width, collapsed state and expanded sections — is saved in `localStorage` and restored next time. Storage being unavailable is harmless; the panel just doesn't remember.

## API

- `new LayersPlugin(workspace, {layers?, dynamicProviders?})` — `layers` seeds the static, installer-configured layers (`StaticLayerDefinition[]`: `{id, name, blockTypes, color?, icon?}`); `dynamicProviders` adds custom `DynamicLayerProvider`s alongside the built-in by-variable/by-procedure ones (a provider whose `key` is `variable` or `procedure` replaces that built-in, for hosts with non-standard variable/procedure blocks).
- `contextMenuWeight` (constructor option) — base weight of the "Layers" group in the block context menu; the group occupies `[base, base + 3]`. Default 98. Pass a value clear of any weights the host registers, otherwise its items interleave with the layer items.
- `panelMode` (constructor option) — `'floating'` (default) or `'docked'`: how the panel starts for a user who hasn't chosen yet. A saved user choice always wins over it.
- `storageKey` (constructor option) — the `localStorage` key for the per-user panel state. Default `'blockly-layers:panel'`; scope it if one origin hosts several editors that shouldn't share a layout.
- `minReadableScale` (constructor option) — the smallest zoom a fit will pick (default `0.5`; a higher workspace `zoomOptions.minScale` wins). If the active stacks can't all fit at that scale, the first is shown and ◀ ▶ / `N` / `B` step through the rest.
- `plugin.init()` — registers persistence, the context menu, and shows the layer panel.
- `plugin.dispose()` — tears down the panel and context menu, and restores any hidden stacks.
- `plugin.setLayerActive(id, active)` / `plugin.getActiveLayerIds()` — show/hide any layer (from any source) programmatically, or read which are currently checked.
- `plugin.setFilterMode('hide' | 'dim')` — how stacks outside the active layers are shown (default `'dim'`).
- `plugin.arrangeVisible()` / `plugin.fitToVisible()` — gather the visible stacks into wrapped columns in the free space nearest the view, overlapping nothing (undoable) / zoom and scroll to fit them, never below a readable scale (0.5); if they don't all fit, the first is shown.
- `plugin.stepVisible(1 | -1)` — centre and select the next/previous visible stack at the current zoom (the panel's ◀ ▶ buttons). The `N` / `B` keys do the same: Blockly's own next/previous-stack keys, which the plugin restricts to visible stacks while layers are active (and extends so they work before any block is selected).

Checking a layer fits its stacks into view (never below a readable scale, never past actual size). Every fit marks all of them with Blockly's selected styling (visual only: nothing is really selected, and the marks go away on the next click on the workspace). The panel's ◀ ▶ buttons step through them and really select the current one. Clearing the last active layer restores the scroll and zoom from before filtering.
- `plugin.clearActiveLayers()` — deactivates every active layer, across all sources, in one call (the same action as the panel's "Clear" button).
- `plugin.createManualLayer(name, {color?, icon?})` — creates a manual layer and returns its id; `plugin.removeManualLayer(id)` removes one.
- `plugin.assignToLayer(topBlockId, layerId)` / `plugin.unassignFromLayer(topBlockId, layerId)` — the programmatic equivalent of the context menu action.
- `plugin.exportManualLayers()` / `plugin.importManualLayers(state)` — manual export/import escape hatch; see [Persistence](#persistence).
- `plugin.exportManualLayersXml()` / `plugin.importManualLayersXml(element)` — the same, as a `<layers>` DOM element, for hosts that save with `Blockly.Xml`. Optional.

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

Hosts that save workspaces as XML (`Blockly.Xml.workspaceToDom`, which the JSON serializer registry doesn't touch) can use the XML flavor of the same hatch. It is entirely optional; hosts using JSON serialization need neither:

```js
// Save: append the element wherever your file format allows.
const dom = Blockly.Xml.workspaceToDom(workspace);
dom.appendChild(plugin.exportManualLayersXml());

// Load: AFTER the blocks exist (membership refers to block ids).
Blockly.Xml.domToWorkspace(dom, workspace);
const layers = dom.querySelector('layers');
if (layers) plugin.importManualLayersXml(layers);
```

Membership is keyed by top-level block id, so ids must survive your save/load round trip (`workspaceToDom` writes them unless told not to). Stacks recreated with new ids on load, e.g. by a version upgrader, lose their assignments.

## Host integration

Hosts that load plugins as prebuilt scripts rather than npm packages (e.g. MIT App Inventor) can copy `dist/index.js` and load it after Blockly; see [INTEGRATION_APPINVENTOR.md](./INTEGRATION_APPINVENTOR.md) for that case.

## License

Apache 2.0
