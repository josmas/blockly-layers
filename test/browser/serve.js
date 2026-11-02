/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Builds the playground bundle once and serves it for the
 * Playwright suite. Unlike `npm start` it picks a fixed port, doesn't open a
 * browser, and has no hot reload. Output goes to build/browser so it can't
 * clobber the Mocha bundles that `npm test` writes to build/.
 */
const path = require("path");
const express = require("express");
const webpack = require("webpack");
const makeConfig = require("@blockly/dev-scripts/config/webpack.config");

const port = Number(process.env.PORT || 4173);
const outDir = path.resolve("build", "browser");

const config = makeConfig({mode: "development"});
config.output.path = outDir;

webpack(config, (err, stats) => {
  if (err || stats.hasErrors()) {
    console.error(err || stats.toString({colors: false, errors: true}));
    process.exit(1);
  }
  const app = express();
  app.use("/build", express.static(outDir));
  app.use(express.static(path.resolve("test")));
  app.listen(port, () => console.log(`fixture server on http://localhost:${port}`));
});
