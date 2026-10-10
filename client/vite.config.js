import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// 2026-10-01 guardrails: a harness's dev server (NYC_NOHMR=1: tools/bshot.mjs, tools/ad/record.mjs, ...) exits when its
// harness is gone, even one killed with SIGKILL that could run no exit hook (the servers outlived killed harnesses twice):
// the parent is re-checked every 2 s and a changed parent (the orphan's new one is init or a subreaper) ends the server
if (process.env.NYC_NOHMR === '1') {
  const parent0 = process.ppid;
  const t = setInterval(() => { if (process.ppid !== parent0) process.exit(0); }, 2000);
  t.unref?.();
}

// Valdrada is the main project. The procedural NYC building generator that
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
    // ...and no console forwarding (Vite 8 sends console.warn / error to the server over that same socket): with no socket
    // every warning added a "Failed to send error to Vite server" line, which read like an error in every plate's log
    forwardConsole: process.env.NYC_NOHMR === '1' ? false : undefined,
    fs: { allow: [path.resolve(here, '..')] },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
