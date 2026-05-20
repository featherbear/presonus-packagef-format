import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
  // When deployed to GitHub Pages at https://<user>.github.io/<repo>/
  // the workflow sets VITE_BASE=/<repo>/ so asset URLs resolve correctly.
  // Defaults to "/" for local dev and root-hosted deployments.
  base: process.env.VITE_BASE ?? "/",
  plugins: [
    svelte(),
    // KaitaiStream.js has `require('iconv-lite')` and `require('zlib')`
    // calls behind Node-only feature flags that the browser never hits.
    // Stub them out so Rollup/Rolldown can finish bundling.
    {
      name: "stub-kaitai-node-deps",
      enforce: "pre",
      resolveId(source) {
        if (source === "iconv-lite" || source === "zlib") {
          return { id: "\0empty-module", moduleSideEffects: false };
        }
        return null;
      },
      load(id) {
        if (id === "\0empty-module") return "export default {};";
        return null;
      },
    },
  ],
});
