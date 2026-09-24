# Interior mapping (parallax cubemap rooms) — implementation notes

For the window-interior upgrade: fake 3D rooms behind glass, one quad per window,
zero extra geometry. Distilled from UE's InteriorCubemap node graph, Lagarde's
parallax-corrected cubemap article, and existing three.js ports.

## Core kernel (three.js GLSL, per-fragment)

```glsl
// vViewDirTangent: tangent-space vector from fragment TOWARD the eye
// pos.z = -1.0 puts the window on the -Z face; room fills the box toward +Z
vec3  dir = normalize(vViewDirTangent) * vec3(-1.0, -1.0, 1.0); // handedness fix
vec3  pos = vec3((fract(vUv) * 2.0 - 1.0) * roomScale, -roomDepth);
vec3  id  = 1.0 / dir;
vec3  k   = abs(id) - id * pos;          // slab exit test vs unit box [-1,1]^3
float kMin = min(min(k.x, k.y), k.z);
vec3  sampleDir = pos + kMin * dir;      // relative to box center
color = textureCube(cubeMap, sampleDir);
```

- `roomScale`: 1.0 = window spans the whole wall; ~0.2-0.5 typical (window is a
  fraction of the room wall). `roomDepth`: 1.0 full cube, <1 shallower room.
- The identity `abs(id) - pos*id == max((1-pos)/dir, (-1-pos)/dir)` — it's
  Lagarde's slab test with max() folded away. Requires centered symmetric box.
- The lookup uses `exit` directly => assumes cubemap captured AT the box center.

## Vertex side

```glsl
attribute vec4 tangent;                   // geometry.computeTangents() REQUIRED
vec3 vN = normalMatrix * normal;
vec3 vT = normalMatrix * tangent.xyz;
vec3 vB = normalize(cross(vN, vT) * tangent.w);
mat3 mTBN = transpose(mat3(vT, vB, vN));
vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
vViewDirTangent = mTBN * (-mvPos.xyz);
```

For INSTANCED window quads: all our glass quads face +Z in part-local space, so
we can skip tangent attributes entirely: T=(1,0,0), B=(0,1,0), N=(0,0,1) in part
space; transform the view vector by inverse(instanceMatrix * modelMatrix)
rotation (or compute per-vertex using the known instance orientation).

## Per-window variation (cheap, no cubemap arrays in WebGL2)

1. Hash cell index -> rotate sampleDir about window normal (0,0,1) by k*90°:
   4 distinct looks from one cubemap, free.
2. Hash -> tint / emissive intensity variation after fetch (lit vs dark rooms).
3. For many distinct rooms: 2D atlas of equirect/octahedral tiles picked by
   hash (WebGL2 has no samplerCubeArray).

## Authoring the room cubemap

- Room must be a CUBE, captured from the CENTER (else rooms shear as viewer moves).
- Nothing should span two cubemap faces (couch on floor+wall etc.).
- We can procedurally render 1-2 room cubemaps at startup into a
  WebGLCubeRenderTarget: paint walls/floor/ceiling flat colors + a window-lit
  gradient + a few furniture boxes; blur slightly. Capture with CubeCamera at
  center. isRenderTargetTexture=true means three does NOT auto-flip X (raw
  ShaderMaterial has no flip either way — verify sign empirically).

## Failure modes

- Start point outside box (roomDepth>1 or roomScale>2): kMin negative, inverted
  sample. Clamp params.
- Curved/sloped facades: tangent frame tilts the room. Ours are flat — fine.
- Cubemap captured off-center or non-cube room: walls swing/warp with view.

Integration plan: replace/augment the 'glass' material on window glass quads
with onBeforeCompile injection — mix(interior, reflection, fresnel) so grazing
angles show sky reflection and direct angles show the room. Night: boost lit
rooms' emissive via per-instance hash.
