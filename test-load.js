"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createRestrictedRequire() {
  return function restrictedRequire(id) {
    if (id.startsWith("."))
      throw new Error(`Generated runtime attempted to load relative module '${id}'`);
    if (id === "obsidian") return {
      debounce: (f) => f,
      Plugin: class {
        constructor(app, manifest) {
          this.app = app;
          this.manifest = manifest;
        }
        addCommand(){}
        addRibbonIcon(){}
        registerDomEvent(){}
        registerEvent(){}
        addSettingTab(){}
        registerView(){}
        registerObsidianProtocolHandler(){}
      },
      PluginSettingTab: class {},
      Setting: class { setName(){return this;} setDesc(){return this;} addToggle(){return this;} addText(){return this;} },
      Modal: class {},
      ItemView: class {},
      WorkspaceLeaf: class {}
    };
    if (id === "fs" || id === "path" || id === "os")
      return require(id);
    throw new Error("Cannot find module '" + id + "'");
  };
}

function loadPluginCode(code, options = {}) {
  const runtimeModule = { exports: {} };
  const restrictedRequire = options.require || createRestrictedRequire();
  const wrapper = vm.compileFunction(
    code,
    ["module", "exports", "require", "__dirname", "__filename", "document"]
  );
  wrapper(
    runtimeModule,
    runtimeModule.exports,
    restrictedRequire,
    __dirname,
    __filename,
    options.document || {}
  );
  return runtimeModule.exports;
}

async function verifyMain() {
  const root = __dirname;
  const code = fs.readFileSync(path.join(root, "main.js"), "utf8");
  const Plugin = loadPluginCode(code).default;
  if (!code.includes("hasAsyncRenderableContent"))
    throw new Error("live-sizing runtime helpers were not bundled");
  const app = {
    workspace: {
      on: () => {},
      onLayoutReady: () => {}
    },
    vault: {
      getFiles: () => [],
      on: () => {}
    }
  };
  const plugin = new Plugin(app, { id: "tomindmap" });
  plugin.loadData = async () => ({});
  plugin.saveData = async () => {};
  plugin.app = app;
  await plugin.onload();
  console.log("onload success");
}

if (require.main === module) {
  verifyMain().catch((error) => {
    console.error("onload failed", error);
    process.exitCode = 1;
  });
}

module.exports = { createRestrictedRequire, loadPluginCode };
