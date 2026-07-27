const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('./main.js', 'utf8');
const _module = { exports: {} };
const _require = function(id) {
  if (id === 'obsidian') return {
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
  if (id === 'fs') return require('fs');
  if (id === 'path') return require('path');
  if (id === 'os') return require('os');
  throw new Error("Cannot find module '" + id + "'");
};
const wrapper = vm.compileFunction(code, ['module', 'exports', 'require', '__dirname', '__filename', 'document']);
wrapper(_module, _module.exports, _require, __dirname, __filename, {});
const Plugin = _module.exports.default;
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
plugin.onload()
  .then(() => console.log("onload success"))
  .catch((error) => {
    console.error("onload failed", error);
    process.exitCode = 1;
  });
