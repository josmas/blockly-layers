# Integrating into MIT App Inventor

Notes for wiring `blockly-layers` into [appinventor-sources](https://github.com/mit-cml/appinventor-sources) without publishing to npm. The plugin itself stays generic; everything here is host-side code that lives in an App Inventor fork, never in this repo.

**Provenance and trust.** Gathered on 2026-10-22 by reading the Blockly 13 update PR ([#4069](https://github.com/mit-cml/appinventor-sources/pull/4069), branch `mjgallag:update-to-blockly-13`, Blockly 13.3.0) through GitHub. Nothing below was built or run inside App Inventor. Items marked **unverified** need confirming in the fork. Re-check file names and line locations against the branch you actually build from, since the PR was still open.

## How App Inventor loads Blockly and plugins

- Blockly core is `lib/blockly/blockly_compressed.js`. Plugins are prebuilt, minified UMD files checked into the repo, in two places:
  - `appinventor/appengine/war/static/js/*.min.js` (scroll-options, workspace-search, block-dynamic-connection, workspace-multiselect, blockly-field-colour): loaded by `<script>` tags in `appinventor/appengine/war/index.jsp`, **after** the `aiblockly-*.js` bundle that defines the global `Blockly`.
  - `appinventor/lib/blockly-plugins/*.min.js` (block-lexical-variables-core, typeblocking, field-multilineinput): passed to the Closure Compiler together with `blockly_compressed.js` in `appinventor/blocklyeditor/build.xml` (`BlocklyCompile`), so they end up inside the `aiblockly` bundle.
- Plugins are named with a version or commit, e.g. `scroll-options-13.3.0.min.js`, `workspace-multiselect-pr154-4ae05c1.min.js`.
- Plugin instances are created in `Blockly.BlocklyEditor.create(container, formName, readOnly, rtl)` in `appinventor/blocklyeditor/src/blocklyeditor.js`, right after `Blockly.inject`, e.g. `new WorkspaceSearch(workspace)` then `.init()`. Workspaces are registered in `Blockly.allWorkspaces[formName]`.
- Blockly is 13.3.0 on that branch, which matches this plugin's `blockly ^13.3.0` peer dependency.

## Recommended wiring

1. **Build:** `npm run build` here. `dist/index.js` is a minified UMD bundle that does not include Blockly: it uses `require("blockly/core")` / AMD `blockly/core` if present, else the global `Blockly`, and in the browser puts the plugin's exports (`LayersPlugin`) on `window` (same pattern as `registerFieldColour` in `index.jsp`).
2. **Copy** `dist/index.js` to `appinventor/appengine/war/static/js/blockly-layers-<commit>.min.js`.
3. **Load:** add a `<script>` tag for it in `index.jsp`, after the other plugin tags. Prefer this over `lib/blockly-plugins/`: that route goes through the Closure Compiler and it is **unverified** whether this plugin's UMD wrapper survives it.
4. **Instantiate** in `blocklyeditor.js`, after `Blockly.inject` and the other plugin inits: `new window.LayersPlugin(workspace, {dynamicProviders: [...]}).init()`. Keep the instance reachable per workspace (e.g. next to `Blockly.allWorkspaces[formName]`) so save/load can find it.
5. **Dispose** it where the workspace is torn down, if App Inventor does that (**unverified**).

## Persistence (the part that needs care)

App Inventor saves `.bky` as **XML**, so the plugin's automatic JSON-serializer persistence does not apply. Use the optional XML helpers (`exportManualLayersXml()` / `importManualLayersXml(el)`, see `src/layers_xml.ts` and the README).

- **Save:** `Blockly.SaveFile.get(prettify, opt_workspace)` in `appinventor/blocklyeditor/src/savefile.js` does `Blockly.Xml.workspaceToDom(workspace, false)` (ids included), appends a namespaced `yacodeblocks` element (`ya-version`, `language-version`), then `Blockly.Xml.domToText` / `domToPrettyText`. Append `plugin.exportManualLayersXml()` to that DOM as a sibling of `yacodeblocks`.
- **Load:** `Blockly.SaveFile.load(preUpgradeFormJson, blocksContent)` calls `Blockly.Versioning.upgrade(...)` (`versioning.js`), which parses with `Blockly.utils.xml.textToDom`, finds `yacodeblocks`, upgrades if versions differ, and ends in `Blockly.Versioning.ensureWorkspace`, which does `workspace.clear()` then `Blockly.Xml.domToWorkspace(dom, workspace)`. Import the `<layers>` element **after** that has run, since membership refers to block ids. The load flow disables events and rendering around the upgrade; call the import after they're restored.
- **Open questions (unverified):**
  - Only the first ~100k characters of `versioning.js` were read. Read the whole load path, including whether upgraders build blocks without ids (some helpers use `document.createElement('block')` with no `id`); those stacks would lose their layer assignments.
  - Whether `domToWorkspace` / the upgrade code tolerates an unknown `<layers>` child of `<xml>` (the `yacodeblocks` element is precedent).
  - `workspace.clear()` on load does not clear plugin state by itself; check that stale layers from a previous project can't leak (call `importManualLayersXml` with an empty/absent state, or add a clear API if needed).
  - What happens on every other save path (autosave, export, backpack, copy/paste between screens): `SaveFile.get` is the one found, there may be others.

## Dynamic layers for App Inventor

The README's "by component" provider is a **guess** at the field name (`COMPONENT`). Write the real one against App Inventor's block definitions (component event/method/property blocks) in the fork. `DynamicLayerProvider.extractKey(block)` returns one key per block. Procedures and variables already work out of the box via the built-in providers, but check that App Inventor's lexical variables (`block-lexical-variables-core`) use `FieldVariable`-compatible fields, otherwise the by-variable provider will not see them (**unverified**).

## Interactions to test in App Inventor

- Layer filtering vs. App Inventor features: multiselect, its own clean up/arrange, workspace search, typeblocking, backpack, dark mode (the panel uses fixed light colors).
- The plugin hides/dims stacks and untracks their connections via `RenderedConnection.setTracking(false)` (marked `@internal` in Blockly): confirm no App Inventor code re-adds those connections.
- Workspace-wide actions (Clean up, Delete N Blocks, Collapse) still act on hidden stacks; see `decisions.md`.
- Context menu: this plugin adds a "Layers" group to the **block** context menu; confirm it coexists with App Inventor's own block menu items.
- Panel placement next to App Inventor's own overlays (it positions itself like `@blockly/workspace-search`).
