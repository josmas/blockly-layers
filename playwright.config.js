/**
 * @license
 * Copyright 2026 appinventor.org
 * SPDX-License-Identifier: Apache-2.0
 */

const {defineConfig} = require("@playwright/test");

const port = Number(process.env.PORT || 4173);

module.exports = defineConfig({
  testDir: "test/browser",
  testMatch: "*.spec.js",
  timeout: 30000,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: {width: 1000, height: 700},
  },
  webServer: {
    command: "node test/browser/serve.js",
    url: `http://localhost:${port}/index.html`,
    timeout: 180000,
    reuseExistingServer: !process.env.CI,
    env: {PORT: String(port)},
  },
});
