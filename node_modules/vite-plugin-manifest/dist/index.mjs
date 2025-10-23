// src/index.ts
import path from "path";
import fs from "fs";
function vitePluginManifest(buildOptions) {
  let outDir, manifests;
  return {
    name: "vite-plugin-manifest",
    enforce: "pre",
    apply: "build",
    config(config, { command }) {
      var _a;
      outDir = (_a = config.build) == null ? void 0 : _a.outDir;
    },
    configResolved(resolvedConfig) {
    },
    configureServer(server) {
    },
    transformIndexHtml(html) {
    },
    handleHotUpdate({ file, server }) {
    },
    options(options) {
    },
    buildStart(options) {
    },
    resolveId(source, importer, options) {
    },
    load(id) {
    },
    transform(code, id) {
    },
    buildEnd(...args) {
    },
    outputOptions(options) {
    },
    renderStart(outputOptions, inputOptions) {
    },
    augmentChunkHash(chunkInfo) {
    },
    renderChunk(code, chunk, options) {
      return null;
    },
    generateBundle(options, bundle, isWrite) {
    },
    async writeBundle(options, bundle) {
      if (buildOptions.generate) {
        manifests = await buildOptions.generate(bundle);
      } else {
        manifests = {};
        manifests.files = Object.keys(bundle).reduce((data, name) => {
          data[name] = path.join(buildOptions.publicPath || "", name).replaceAll(path.sep, "/");
          return data;
        }, {});
        manifests.entrypoints = Object.keys(bundle).filter((name) => bundle[name].isEntry);
      }
    },
    closeBundle() {
      const outputPath = path.join(outDir || "", buildOptions.fileName);
      fs.writeFileSync(outputPath, JSON.stringify(manifests, null, "	"), "utf-8");
    }
  };
}
export {
  vitePluginManifest as default
};
