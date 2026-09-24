# NYC building generator as a subproject

`boundlessjs/` is the main project: the real-data digital twin (930k footprints,
streamed tiles, traffic, weather, post chain). The procedural building generator
one directory up (`../src`: `materials.js`, `batcher.js`, `kit.js`, `textures.js`,
`buildings/*`) is a **subproject** that boundless.js consumes for building detail.

```
projectnyc/
  src/                 procedural NYC building generator (library)   ← alias @nyc
  boundlessjs/         main project (Vite app)
    src/world/nycDress.js    the bridge: dresses real footprints with the generator's kit
    vite.config.js           resolve.alias '@nyc' → ../src, server.fs.allow ..
  tools/bshot.mjs      GPU screenshot + perf harness for boundless.js (Playwright, RTX)
  tools/shot.mjs       screenshot harness for the generator's own demo city
```

## How buildings get dressed

1. `assemble.js` extrudes every footprint into one merged mesh per tile whose
   facade is drawn by the shader material. Each vertex now carries `aBid`
   (building index in the tile) and each tile has its own facade material with a
   256×256 **hide texture** (`makeTileFacadeMaterial`).
2. `NycDresser.update(px, pz)` keeps the nearest ~48 dressable buildings within
   150 m rebuilt: for each footprint edge it lays out floors and bays from the
   tile record (`floorH`, `winW`, `storeH`, blind mask, door bay) and calls the
   generator's `punchedWall` with the kit's windows (reveal, frame, glass with a
   sill-to-head reflection ramp, room tone, lit at night), sills, lintels, AC
   units, cornice, storefront units, entrance door, parapet + coping and an
   earcut roof deck in the compiler's membrane material.
3. The building's texel in the hide texture is set to 255, so the shader facade
   (`if (vHide > 0.5) discard`) for exactly that building disappears; the
   dressed geometry stands on the real footprint. Undressing releases the pooled
   instances, disposes the merged meshes and clears the texel.
4. Repeated parts (windows, sills, brackets…) live in shared pooled
   `InstancedMesh`es (`PartPools`, claim/release with slot compaction); the
   unique masonry is one merged mesh per material per building (world-UV brick
   coursing, per-placement UV offsets, grime from the building's own ground).

Skipped (shader facade stays): glass towers, churches, setback tiers, mansard/hip
caps, buildings needing more than 720 windows.

Hero-facade trim (`heroFacades.js`) is suppressed for dressed buildings
(`heroes.skip`). Roof props, stoops, fire escapes and awnings still come from the
compiler's furniture pools, so the dresser does not duplicate them.

## Running

```bash
cd boundlessjs && npm install && npm run dev          # http://127.0.0.1:5219
# ?nodress=1 disables the dresser for A/B
node ../tools/bshot.mjs --views harlem125,harlemRow --time day        # GPU shots
node ../tools/bshot.mjs --views harlem125 --bench                     # fps/calls/tris
```

`window.__DRESS()` in the console reports active/queued counts, build time and
draw calls of the dresser.
