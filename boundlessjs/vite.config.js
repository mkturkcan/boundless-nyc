import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// boundless.js is the main project. The procedural NYC building generator that
// lives one directory up (../src: materials, batcher, kit, building modules) is
// a SUBPROJECT consumed through the `@nyc` alias — see src/world/nycDress.js.
export default defineConfig({
  base: './',
  resolve: {
    alias: { '@nyc': path.resolve(here, '../src') },
  },
  server: {
    port: 5219, strictPort: true, host: '127.0.0.1',
    // NYC_NOHMR=1 (tools/bshot, tools/ad/record, tools/perception/export, tools/tflick): a render harness must not have
    // its page reloaded by an edit to the working tree mid-capture — concurrent edits to src/ while plates rendered turned
    // every plate on the machine _INVALID ("no tiles loaded after 180 s": the HMR full reload restarted the boot inside
    // the harness's budget) for most of an hour on 2026-09-17. Each harness starts its own Vite, so it still serves the
    // tree exactly as it was when the run began.
    hmr: process.env.NYC_NOHMR === '1' ? false : undefined,
    // ...and no WebSocket server and NO FILE WATCHER at all under NYC_NOHMR, so an edit cannot invalidate a module
    // mid-run either. A harness Vite lives for one run and serves the tree as it was when it started.
    ws: process.env.NYC_NOHMR === '1' ? false : undefined,
    watch: process.env.NYC_NOHMR === '1' ? null : undefined,
    fs: { allow: [path.resolve(here, '..')] },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
