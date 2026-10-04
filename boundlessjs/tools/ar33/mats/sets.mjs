// AR33 PBR library: the texture sets (what gets downloaded and packed) and their calibration.
// Every source is CC0 (ambientCG: https://ambientcg.com/a/<id>, Poly Haven: https://polyhaven.com/a/<id>).
// Fields:
//   src 'acg' | 'ph' | 'proc' (built here from nothing), id (the source's asset id), res (packed width in texels)
//   size [w, h]: metres covered by one repeat (u along the surface, v up); for brick sets `courses` / `bricks` are
//     measured from the texture (build.mjs prints them) and the size follows from the US modular module
//     (course 67.7 mm, 3 courses = 203 mm; brick + head joint 203 mm).
//   mean '#rrggbb': the calibrated average colour of the packed albedo (sRGB): the set's own default colour
//   flat: share of the tile-scale tone drift removed (baked lighting and 1-2 m blotches that read as tiling), sigma in m
//   rough [lo, hi]: remap of the roughness map; metal: constant metalness when the set has no map (0..1)
//   alpha 'height' | 'paint' | 'none': what the ORM texture's alpha carries (height for the grime in the joints;
//     'paint' = a paint coverage mask from the albedo, for sets whose paint colour the tint replaces)
//   range [lo, hi]: sRGB luminance bounds that the 1st / 99th percentile are compressed into (40..220 by default)
export const COURSE = 0.0677, MODULE = 0.2032;

export const TEX = {
  // ------------------------------------------------------------------ brick
  brick_red:   { src: 'ph', id: 'red_brick', res: 2048, courses: 'measure', bricks: 'measure', mean: '#8e4a36', flat: 0.55, sigma: 0.45, rough: [0.62, 0.95], alpha: 'height' },
  // AR34 w2 (BID4 19:08): the same scan with sooted joints (the 125th Street crops' joints are darker than the faces, the
  // scan's lighter, so the twin's red walls read pink-salmon at street distance): opt in by name (brick_red_sooted)
  brick_red_sooted: { src: 'ph', id: 'red_brick', res: 2048, courses: 'measure', bricks: 'measure', mean: '#8e4a36', flat: 0.55, sigma: 0.45, rough: [0.62, 0.95], alpha: 'height',
    units: { mask: 'chroma', joint: 0.6, grey: 0.7 } },
  brick_brown: { src: 'ph', id: 'red_brick_03', res: 1024, courses: 'measure', bricks: 'measure', mean: '#6b4536', flat: 0.55, sigma: 0.45, rough: [0.62, 0.95], alpha: 'height' },
  brick_tan:   { src: 'acg', id: 'Bricks105', res: 2048, courses: 'measure', bricks: 'measure', mean: '#b39572', flat: 0.55, sigma: 0.45, rough: [0.62, 0.95], alpha: 'height' },
  // brick_buff: brick_tan's set with a buff tint (ambientCG Bricks093 is a long thin Roman-format brick, not NYC buff)
  brick_glazed: { src: 'acg', id: 'Bricks072', res: 1024, courses: 'measure', bricks: 'measure', coursesFix: 8, bricksFix: 7, halfFix: false, desat: 0.85, mean: '#dcdad2', flat: 0.6, sigma: 0.45, rough: [0.18, 0.75], alpha: 'height' },
  // AR34 w2: the same scan with its units brought out (the Hotel Theresa crop theresa_crown_1535: cream glazed units of
  // varied tone, grey joints darker than the faces, a few sooted or replaced units; the flat set read as white stucco)
  // units: per-unit log-value sigma v, warm / cool sigma, the share of grey (sooted) and light (replaced) units, roughness
  // sigma, the glaze tilt sigma (normal x / y), the joints' luminance as a share of the faces' (neutral grey)
  brick_glazed_cream: { src: 'acg', id: 'Bricks072', res: 1024, courses: 'measure', bricks: 'measure', coursesFix: 8, bricksFix: 7, halfFix: false, desat: 0.85, mean: '#dcd8cc', flat: 0.6, sigma: 0.45, rough: [0.16, 0.6], alpha: 'height', range: [40, 246],
    units: { v: 0.045, warm: 0.022, grey: 0.05, light: 0.035, rough: 0.07, tilt: 0.045, joint: 0.56, seed: 72 } },
  brick_painted: { src: 'ph', id: 'painted_worn_brick', res: 1024, courses: 'measure', bricks: 'measure', mean: '#d6d0c2', flat: 0.5, sigma: 0.45, rough: [0.55, 0.92], alpha: 'height' },
  // ------------------------------------------------------------------ stone
  stone_lime:  { src: 'ph', id: 'sandstone_blocks_08', res: 2048, size: [3.0, 3.0], mean: '#c9c0ae', flat: 0.6, sigma: 0.7, rough: [0.55, 0.9], alpha: 'height' },
  granite:     { src: 'acg', id: 'Granite002A', res: 2048, size: [1.0, 1.0], mean: '#8a8a88', flat: 0.3, sigma: 0.3, rough: [0.08, 0.22], alpha: 'none' },
  // jointless dressed limestone: what trim (sills, lintels, bands, cornices, coping, KIT-modelled rustication) needs;
  // the coursed ashlar set above is stone_lime_ashlar
  stone_plain: { src: 'acg', id: 'Rock054', res: 2048, size: [1.4, 1.4], mean: '#cbc2b0', flat: 0.6, sigma: 0.45, desat: 0.7, rough: [0.6, 0.9], alpha: 'height' },   // AR34 desat: the scan's yellow stains read as dirty yellow blotches on limestone trim
  stone_rustic: { src: 'ph', id: 'red_sandstone_wall', res: 1024, size: [2.0, 2.0], mean: '#c3baa8', flat: 0.5, sigma: 0.6, rough: [0.6, 0.92], alpha: 'height' },
  brownstone:  { src: 'ph', id: 'grey_plaster', res: 1024, size: [1.4, 1.4], mean: '#5e4336', flat: 0.45, sigma: 0.35, rough: [0.6, 0.9], alpha: 'height' },
  granite_pink: { src: 'acg', id: 'Granite003A', res: 1024, size: [1.0, 1.0], mean: '#a88d82', flat: 0.3, sigma: 0.3, rough: [0.08, 0.22], alpha: 'none' },
  terracotta:  { src: 'proc', res: 1024, size: [1.22, 0.61], mean: '#d9d2c1', alpha: 'height' },
  // ------------------------------------------------------------------ concrete, render
  concrete_precast: { src: 'acg', id: 'Concrete034', res: 2048, size: [2.2, 1.1], mean: '#b3afa6', flat: 0.6, sigma: 0.5, rough: [0.7, 0.95], alpha: 'height' },
  concrete_board: { src: 'ph', id: 'concrete_wall_007', res: 1024, size: [2.16, 2.16], mean: '#9d9b95', flat: 0.45, sigma: 0.6, rough: [0.7, 0.95], alpha: 'height' },
  stucco:      { src: 'acg', id: 'Plaster001', res: 1024, size: [1.5, 1.5], mean: '#cfc8b8', flat: 0.4, sigma: 0.4, rough: [0.72, 0.95], alpha: 'height' },
  // ------------------------------------------------------------------ street
  sidewalk:    { src: 'ph', id: 'concrete_floor_worn_001', res: 2048, size: [3.0, 3.0], mean: '#a7a49c', flat: 0.55, sigma: 0.6, rough: [0.72, 0.95], alpha: 'height' },
  asphalt:     { src: 'ph', id: 'asphalt_02', res: 2048, size: [3.0, 3.0], mean: '#4a4946', flat: 0.5, sigma: 0.6, rough: [0.72, 0.96], alpha: 'height', range: [30, 200] },
  asphalt_patch: { src: 'ph', id: 'asphalt_05', res: 1024, size: [2.0, 2.0], mean: '#353533', flat: 0.5, sigma: 0.5, rough: [0.65, 0.92], alpha: 'height', range: [25, 190] },
  tactile:     { src: 'proc', res: 1024, size: [0.61, 0.61], mean: '#d9a91e', alpha: 'height' },
  paving_brick: { src: 'ph', id: 'red_brick_pavers', res: 1024, size: [1.8, 1.8], mean: '#7e4a3a', flat: 0.5, sigma: 0.4, rough: [0.7, 0.95], alpha: 'height' },
  cobble:      { src: 'ph', id: 'cobblestone_03', res: 1024, size: [2.0, 2.0], mean: '#6d6a66', flat: 0.45, sigma: 0.5, rough: [0.6, 0.92], alpha: 'height' },
  mulch:       { src: 'ph', id: 'wood_chips', res: 1024, size: [2.0, 2.0], mean: '#4a3526', flat: 0.4, sigma: 0.5, rough: [0.8, 0.98], alpha: 'height', range: [25, 200] },
  // ------------------------------------------------------------------ more walls, metal, wood, roofs
  concrete_smooth: { src: 'acg', id: 'Concrete046', res: 1024, size: [2.4, 2.4], mean: '#aaa79f', flat: 0.5, sigma: 0.6, rough: [0.7, 0.92], alpha: 'height' },
  panel_paint: { src: 'acg', id: 'Metal027', res: 1024, size: [1.0, 1.0], mean: '#6f7377', flat: 0.3, sigma: 0.3, rough: [0.35, 0.55], alpha: 'none', metal: 0 },
  steel_rust:  { src: 'ph', id: 'rust_coarse_01', res: 1024, size: [1.0, 1.0], mean: '#6a3a22', flat: 0.4, sigma: 0.3, rough: [0.7, 0.95], alpha: 'height' },
  steel_galv:  { src: 'acg', id: 'Metal055A', res: 1024, size: [1.0, 1.0], mean: '#9c9fa1', flat: 0.3, sigma: 0.3, rough: [0.3, 0.55], alpha: 'none', range: [60, 240] },
  wood_paint:  { src: 'acg', id: 'WoodSiding009', res: 1024, size: [1.2, 1.2], mean: '#e0dccf', flat: 0.4, sigma: 0.4, rough: [0.5, 0.8], alpha: 'height' },
  // AR34: raw plywood for hoardings and boarded shop fronts (pale tan birch face; wood_paint's siding read gold with grain)
  plywood:     { src: 'ph', id: 'plywood', res: 1024, size: [0.5, 0.5], mean: '#c4ab86', flat: 0.5, sigma: 0.15, rough: [0.62, 0.9], alpha: 'height' },
  roof_gravel: { src: 'ph', id: 'gravel_floor_02', res: 1024, size: [2.0, 2.0], mean: '#8f8a80', flat: 0.4, sigma: 0.5, rough: [0.75, 0.97], alpha: 'height' },
  roof_tpo:    { src: 'proc', res: 1024, size: [3.05, 3.05], mean: '#d9d9d4', alpha: 'height' },
  brick_basket: { src: 'proc', res: 1024, size: [0.8128, 0.8128], mean: '#8a4a36', alpha: 'height' },
  // ------------------------------------------------------------------ metal
  paint_steel: { src: 'acg', id: 'PaintedMetal006', res: 1024, size: [1.0, 1.0], mean: '#2c3f33', flat: 0.3, sigma: 0.3, rough: [0.35, 0.85], alpha: 'paint' },
  alu_brushed: { src: 'acg', id: 'Metal009', res: 1024, size: [1.0, 1.0], mean: '#c9ccce', flat: 0.3, sigma: 0.3, rough: [0.22, 0.42], alpha: 'none', range: [60, 245] },
};
