# UE (AR34, 2026-10-06): the master materials of the BoundlessUE project, built from code into /Game/Bx/ (generated
# content, never committed). One master per `bx` family of usd_mat.py, mirroring blender_nodes.py's node groups at a
# smaller scale: each is a Custom HLSL node fed by parameters, the world position and normal and the UV sets ue_prep.py
# packs (UV0 st, UV1-3 the per-vertex data). The web's world frame (metres, y up) is rebuilt from UE's (cm, z up: the
# USD importer swaps y and z) and the take's recentring origin (parameter Origin).
#   M_bx_pbr     pbrLib makeSurface: wall / ground world mapping or the uv frame, pattern rotation and size, two taps
#                against tiling, the tint ratio x the kit's tint (aFkTr) or the vertex colour (bxCol), the facade value
#                curve, the trims, ORM roughness / metalness / AO, the normal map in the same frame, dirt by height
#   M_bx_plain   a kit or prop colour x aFkTr / bxCol x its trim (also `untrim`)
#   M_bx_vk      the viaducts' steel: two paints, rust by the arrises' noise and the splash zone, soot, roughness
#   M_bx_ground  GP31 reduced: asphalt (two scans, the pour lottery), sidewalk flags, granite kerb, thermoplastic paint,
#                grass, by the surface kind (matId)
#   M_bx_decal   decals.js atlas: alpha-blended albedo
#   M_bx_sign    signs: albedo, the mask, the night glow
#   M_bx_lens    lamp lenses and other emitters: emissive colour x strength
#   M_bx_facade  WIN's facade bake (bxw_<shot>_fac*): the albedo atlas, roughness and glass from the data atlas, the rooms'
#                emission decoded (the atlas stores sqrt(emission / 8)) x the night's level
#   M_bx_data    the data pass (Movie Render Queue's extra post-process material): region and depth, 32-bit
#   M_bx_leaf    the tree set's leaf cards and impostors: two-sided foliage, alpha-tested at 0.5, the card's normal map
#   M_bx_paint   the cars' paint: the fleet's per-car colour as custom primitive data 0-2 (set from ue_prep's moving)
#   M_bx_hidden  the writers' hide mask (usd_mat / usd_windows 'hidden': opacity 0 at threshold 0.5): clipped everywhere, no shadow
#   M_bx_film    the web's film look in place of UE's tonemapper: three.js r185 AgX at the page's exposure, the sRGB encoding,
#                the grade (levels, S-curve contrast, highlight shoulder, warmth, green tint, saturation, shadow lift, vignette)
import os, struct, unreal

ROOT = '/Game/Bx'
mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
VERSION = 39         # bump to rebuild the masters (37-39: R8, ground6's matId 18 tried and withdrawn)

NOISE = r'''
struct BXN {
  float h1(float2 p) { p = frac(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return frac(p.x * p.y); }
  float vn(float2 p) { float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
    return lerp(lerp(h1(i), h1(i + float2(1, 0)), f.x), lerp(h1(i + float2(0, 1)), h1(i + float2(1, 1)), f.x), f.y); }
  float fbm(float2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 7.1) + 0.125 * vn(p * 4.01 + 3.3) + 0.125 * vn(p * 8.13 + 1.7); }
};
BXN n;
float3 P = float3(WP.x * 0.01 + Origin.x, WP.z * 0.01, WP.y * 0.01 + Origin.z);
float3 N = normalize(float3(NW.x, NW.z, NW.y));
'''

PBR = NOISE + r'''
float2 m; float3 T3 = float3(1, 0, 0), B3 = float3(0, 0, 1); bool wm = World > 0.5;
if (wm) {
  if (abs(N.y) > 0.7) { m = P.xz; T3 = float3(1, 0, 0); B3 = float3(0, 0, -1); }
  else { float2 h = normalize(float2(-N.z, N.x) + 1e-5); m = float2(dot(P.xz, h), P.y); T3 = float3(h.x, 0, h.y); B3 = float3(0, 1, 0); }
} else { m = float2(UV0.x, -UV0.y); }
// (Blender samples (x, -y) bottom-up; UE's textures run top-down, so the same texel is at (x, y))
float2 st = float2((m.x * Rot.x + m.y * Rot.z) / max(Size.x, 1e-3), (m.x * Rot.y + m.y * Rot.w) / max(Size.y, 1e-3));
// two taps against tiling: offsets per low-frequency cell (snapped to the pattern unit), blended by a soft noise
float2 c = st * 0.21 + Seed * 0.0137;
float2 ca = floor(c), cb = floor(c + 0.5);
float2 oa = float2(n.h1(ca + 3.7), n.h1(ca + 9.1)), ob = float2(n.h1(cb + 5.3), n.h1(cb + 1.9));
if (Unit.x > 0) { oa = floor(oa / Unit.xy) * Unit.xy; ob = floor(ob / Unit.xy) * Unit.xy; }
float2 sa = st + oa * 7.0, sb = st + ob * 7.0;
float4 a0 = Texture2DSample(Alb, AlbSampler, sa), a1 = Texture2DSample(Alb, AlbSampler, sb);
float4 o0a = Texture2DSample(Orm, OrmSampler, sa), o1a = Texture2DSample(Orm, OrmSampler, sb);
float3 o0 = o0a.rgb, o1 = o1a.rgb;
float w = smoothstep(Bl.x, Bl.y, n.vn(c * 2.3 + 11.0) + (o1.r - o0.r) * Bl.z);
float3 A = lerp(a0.rgb, a1.rgb, w), O = lerp(o0, o1, w);
float Oa = lerp(o0a.a, o1a.a, w);   // the set's paint mask (pbrLib: the ORM's alpha)
float3 tn = lerp(Texture2DSample(Nrm, NrmSampler, sa).rgb, Texture2DSample(Nrm, NrmSampler, sb).rgb, w) * 2.0 - 1.0;
tn.xy *= NrmK;
// R3-HQ: a detail normal (the set's own normal at 4.3x its frequency)
if (DetK > 0.0) { float3 td = Texture2DSample(Nrm, NrmSampler, sa * 4.3 + 0.37).rgb * 2.0 - 1.0; tn.xy += td.xy * DetK; }
float3 tint = Ratio.xyz;
if (FkOn > 0.5 || VcOn > 0.5) tint *= max(float3(UV1.x, UV1.y, UV2.x), 0.0);
float3 alb = A * tint;
// R4-PAINT: a painted set (pbrLib's paint family, blender_nodes lib_pbr_surf): the paint is the tint over the scan's
// luminance, pulled toward the set's reference lightness, the scan showing through the chips (the ORM's alpha x Chips),
// the scan's own colour taken off under the paint (SubK); not the scan's colour x the tint (metal_painted's green)
if (PaintOn > 0.5) {
  float pm = 1.0 - (1.0 - Oa) * Chips;
  float la = dot(A, float3(0.2126, 0.7152, 0.0722));
  float3 pc = tint * la * lerp(RefL / max(la, 0.001), 1.0, 0.55);
  float3 sub = lerp(A, max(A - Scan.xyz * (la / max(Scan.w, 0.001)) * Oa, 0.0), SubK);
  alb = lerp(sub, pc, pm);
}
if (WallK > 0) alb = pow(max(alb, 0.0), 1.22) * 0.88 * WallK;
// dirt: the splash zone and the run-off above the street, soot under the roof line (kit pieces carry their own dirt and roof)
float dirt = (FkOn > 0.5 && UV3.x >= 0.0 && UV3.y > 0.0) ? UV3.x : Dirt;
float topY = (FkOn > 0.5 && UV3.y > 0.0) ? UV3.y : TopY;
float hgt = P.y - BaseY;
float splash = (1.0 - smoothstep(0.0, 1.2, hgt)) * 0.35 * dirt;
float streak = n.fbm(float2(dot(P.xz, float2(0.71, 0.71)) * 2.2, P.y * 0.15)) * 0.25 * dirt;
float soot = (1.0 - smoothstep(0.0, 2.5, topY - P.y)) * 0.3 * dirt;
float grime = (FkOn > 0.5) ? saturate(UV2.y) * 0.4 : 0.0;
alb *= saturate(1.0 - splash - streak * (1.0 - smoothstep(0.0, 25.0, hgt)) - soot - grime) * TrimV.xyz;
// R3-HQ: a macro tone (15 m and 4 m) and the scan's cavities as grime
alb *= lerp(1.0 - MacroK, 1.0 + MacroK, n.fbm(P.xz * 0.065 + P.y * 0.045 + Seed)) * lerp(1.0, O.r, CavK);
// the street sets' blotches
if (Street > 0.5) alb *= lerp(0.88, 1.08, n.fbm(P.xz * 0.35));
Rough = saturate(O.g * RoughK);
Metal = (MetalOn > 0.5) ? MetalV : saturate(O.b);
AO = lerp(1.0, O.r, 0.7);
float3 nw;
if (wm) nw = normalize(T3 * tn.x + B3 * tn.y + N * max(tn.z, 0.05));
else { float3 tnd = float3(tn.x, -tn.y, tn.z); float3 nu = normalize(mul(tnd, Parameters.TangentToWorld)); nw = float3(nu.x, nu.z, nu.y); }
NormalOut = normalize(float3(nw.x, nw.z, nw.y));
return max(alb, 0.0);
'''

PLAIN = r'''
// the texture's UsdTransform2d (Xf: scale xy, translation zw; XfR: cos, sin of its rotation) on the USD's st (UE flipped V)
float2 s0 = float2(UV0.x, 1.0 - UV0.y) * Xf.xy;
s0 = float2(s0.x * XfR.x - s0.y * XfR.y, s0.x * XfR.y + s0.y * XfR.x) + Xf.zw;
float2 tuv = float2(s0.x, 1.0 - s0.y);
float3 c = Color.xyz;
if (FkOn > 0.5 || VcOn > 0.5) c *= max(float3(UV1.x, UV1.y, UV2.x), 0.0);
if (HasTex > 0.5) c *= Texture2DSample(Tex, TexSampler, tuv).rgb;
Glow = EmiC.xyz * EmiK * ((HasEmiTex > 0.5) ? Texture2DSample(EmiTex, EmiTexSampler, tuv).rgb : float3(1, 1, 1));
// the window kit's self-lit surfaces (bxwin roles): the base colour itself as emission (a room's unlit fill, the sheers'
// day / night glow), untrimmed, and the base's own share (0 for the unlit fill)
Glow += max(c, 0.0) * SelfK;
return max(c * Gain.xyz * BaseK, 0.0);
'''

PAINT = r'''
// R3-PAINT: the fleet's paint as fleet24.js draws it (a MeshPhysicalMaterial with a clear coat): the car's own colour,
// metalness, road-film dirt and roughness (custom primitive data 0-5, ue_mat.paint), its livery map (the USD's texture
// and transform), the film rising toward the sills and arches, streaked, never in blotches; the clear coat (see below)
float4 d0 = GetPrimitiveData(Parameters).CustomPrimitiveData[0];   // colour (linear), metalness
float4 d1 = GetPrimitiveData(Parameters).CustomPrimitiveData[1];   // dirt, roughness, seed, the kind's height (m)
float3 p = (d0.x + d0.y + d0.z > 0.0) ? d0.xyz : Color.xyz;
float2 s0 = float2(UV0.x, 1.0 - UV0.y) * Xf.xy;
s0 = float2(s0.x * XfR.x - s0.y * XfR.y, s0.x * XfR.y + s0.y * XfR.x) + Xf.zw;
if (HasTex > 0.5) p *= Texture2DSample(Tex, TexSampler, float2(s0.x, 1.0 - s0.y)).rgb;
float3 lp = LP * 0.01;   // the part's local position, metres, z up
float hy = lp.z / max(d1.w, 0.5);
float2 q = float2(lp.x * 1.7 + lp.y * 1.7, lp.z * 11.0) + d1.z * 37.0;
float2 qi = floor(q), qf = frac(q); qf = qf * qf * (3.0 - 2.0 * qf);
float4 hh = frac(sin(float4(dot(qi, float2(127.1, 311.7)), dot(qi + float2(1, 0), float2(127.1, 311.7)), dot(qi + float2(0, 1), float2(127.1, 311.7)), dot(qi + float2(1, 1), float2(127.1, 311.7)))) * 43758.55);
float nn = 0.65 + 0.35 * lerp(lerp(hh.x, hh.y, qf.x), lerp(hh.z, hh.w, qf.x), qf.y);
float rise = pow(1.0 - smoothstep(0.02, 0.5, hy), 1.6);
float film = d1.x * rise;
float3 grime = float3(0.30, 0.28, 0.25) * dot(p, float3(0.3333, 0.3333, 0.3333)) + float3(0.045, 0.040, 0.034);
p = lerp(p, grime, clamp(film * nn, 0.0, 0.7));
Rough = lerp(d1.y > 0.0 ? d1.y : RoughK, 0.7, clamp(film, 0.0, 0.8));
Metal = saturate(d0.w);
// R4-PAINT: the clear coat and its roughness (fleet24: 1 / 0.035, buses 0.6 / 0.12) through Make Material Attributes (the
// shading model's own Custom Data pins are hidden from Python)
CC = CcK; CCR = CcR;
return max(p * Gain.xyz, 0.0);
'''

VK = NOISE + r'''
float hgt = P.y - Ground;
float2 q = float2(dot(P.xz, float2(0.6, 0.8)), P.y);
float patch = smoothstep(0.45, 0.6, n.fbm(q * 0.35 + Seed));
float3 paint = lerp(Paint.xyz, Paint2.xyz, patch);
float r = n.fbm(q * 1.7 + 3.0 + Seed) * 0.6 + n.fbm(q * 9.0 + 1.0) * 0.4;
float rust = smoothstep(1.0 - RustAmt * 0.8, 1.0 - RustAmt * 0.8 + 0.18, r);
rust = max(rust, (1.0 - smoothstep(0.0, 1.5, hgt)) * RustAmt);
float3 rc = lerp(RustC.xyz, RustD.xyz, n.vn(q * 4.0));
float3 alb = lerp(paint, rc, rust);
// R3-HQ: painted steel and rust from the CC0 sets (ue_families.json hq.vk) at their real size, world-planar, as detail over
// the paint's and the rust's colours, their normals and roughness, the cavities as grime
float3 Tv = float3(1, 0, 0), Bv = float3(0, 0, -1); float2 sv = P.xz;
if (abs(N.y) < 0.7) { float2 hv = normalize(float2(-N.z, N.x) + 1e-5); sv = float2(dot(P.xz, hv), P.y); Tv = float3(hv.x, 0, hv.y); Bv = float3(0, -1, 0); }
float3 hqNv = float3(0, 0, 1); float hqRv = -1.0;
if (HqOn > 0.5) {
float2 sP = sv / HSz.x;
float2 cP = sP * 0.2; float2 cPa = floor(cP), cPb = floor(cP + 0.5);
float2 sP1 = sP + floor(float2(n.h1(cPa + 3.7), n.h1(cPa + 9.1)) * 7.0 / 0.001) * 0.001, sP2 = sP + floor(float2(n.h1(cPb + 5.3), n.h1(cPb + 1.9)) * 7.0 / 0.001) * 0.001;
float wP = smoothstep(0.3, 0.7, n.vn(cP * 2.3 + 11.0));
float3 Pa = lerp(Texture2DSample(HP, HPSampler, sP1).rgb, Texture2DSample(HP, HPSampler, sP2).rgb, wP) / max(HPm.xyz, 0.001);
float3 Pn = lerp(Texture2DSample(HPN, HPNSampler, sP1).rgb, Texture2DSample(HPN, HPNSampler, sP2).rgb, wP) * 2.0 - 1.0;
float3 Pr = lerp(Texture2DSample(HPR, HPRSampler, sP1).rgb, Texture2DSample(HPR, HPRSampler, sP2).rgb, wP);
float2 sR = sv / HSz.y;
float2 cR = sR * 0.2; float2 cRa = floor(cR), cRb = floor(cR + 0.5);
float2 sR1 = sR + floor(float2(n.h1(cRa + 3.7), n.h1(cRa + 9.1)) * 7.0 / 0.001) * 0.001, sR2 = sR + floor(float2(n.h1(cRb + 5.3), n.h1(cRb + 1.9)) * 7.0 / 0.001) * 0.001;
float wR = smoothstep(0.3, 0.7, n.vn(cR * 2.3 + 11.0));
float3 Ra = lerp(Texture2DSample(HR, HRSampler, sR1).rgb, Texture2DSample(HR, HRSampler, sR2).rgb, wR) / max(HRm.xyz, 0.001);
float3 Rn = lerp(Texture2DSample(HRN, HRNSampler, sR1).rgb, Texture2DSample(HRN, HRNSampler, sR2).rgb, wR) * 2.0 - 1.0;
float3 Rr = lerp(Texture2DSample(HRR, HRRSampler, sR1).rgb, Texture2DSample(HRR, HRRSampler, sR2).rgb, wR);
alb = lerp(paint * Pa, rc * Ra, rust) * lerp(1.0, lerp(Pr.r, Rr.r, rust), CavK) * lerp(1.0 - MacroK, 1.0 + MacroK, n.fbm(q * 0.11 + 5.0));
hqNv = lerp(Pn, Rn, rust); hqRv = lerp(Pr.g, Rr.g, rust);
}
float guano = smoothstep(0.82, 0.9, n.fbm(P.xz * 2.1 + 5.0)) * Guano * step(0.5, N.y);
alb = lerp(alb, float3(0.55, 0.53, 0.48), guano);
alb *= 1.0 - (1.0 - smoothstep(0.0, 4.0, hgt)) * 0.2;
Rough = (hqRv >= 0.0) ? saturate(hqRv) : lerp(0.55, 0.85, rust);
Metal = lerp(0.04, 0.0, rust);
float3 nwv = normalize(Tv * hqNv.x * NrmK + Bv * hqNv.y * NrmK + N * max(hqNv.z, 0.05));
NormalOut = normalize(float3(nwv.x, nwv.z, nwv.y));
return max(alb * Gain.xyz, 0.0);
'''

GROUND = NOISE + r'''
float k = UV1.x;
float isA = (abs(k - 0) < 0.5 || abs(k - 11) < 0.5 || abs(k - 12) < 0.5) ? 1 : 0;
float isW = (abs(k - 1) < 0.5 || abs(k - 16) < 0.5 || abs(k - 17) < 0.5) ? 1 : 0;
float isK = abs(k - 2) < 0.5 ? 1 : 0;
float isPW = abs(k - 3) < 0.5 ? 1 : 0, isPY = abs(k - 4) < 0.5 ? 1 : 0;
float isG = (abs(k - 5) < 0.5 || abs(k - 15) < 0.5) ? 1 : 0;
float2 g = float2(P.x * 0.8744 + P.z * 0.4853, P.x * -0.4853 + P.z * 0.8744);
// asphalt: young and weathered scans relative to their means, the pour lottery per block face
float2 lot = floor(float2(g.x / 82.0, g.y / 76.0) + n.fbm(g * 0.013) * 0.075);
float young = step(0.55, n.h1(lot + 4.1));
float2 ga = g * 0.5, gb = float2(g.x * 0.5 * 0.966 - g.y * 0.5 * 0.259, g.x * 0.5 * 0.259 + g.y * 0.5 * 0.966) + 17.3;
float wab = smoothstep(0.3, 0.7, n.vn(g * 0.11));
float3 A0 = lerp(Texture2DSample(G0, G0Sampler, ga).rgb, Texture2DSample(G0, G0Sampler, gb).rgb, wab) / float3(0.1991, 0.1991, 0.1990);
float3 A1 = lerp(Texture2DSample(G1, G1Sampler, ga).rgb, Texture2DSample(G1, G1Sampler, gb).rgb, wab) / float3(0.0591, 0.0478, 0.0384);
float3 asph = AsphC.xyz * lerp(A0, A1, young) * lerp(0.9, 1.1, n.fbm(g * 0.05));
// sidewalk flags: per-flag tone, tooled joints
float2 fq = g / 1.52; float2 fid = floor(fq); float2 ff = frac(fq);
float joint = 1.0 - (1.0 - smoothstep(0.0, 0.012, min(min(ff.x, 1 - ff.x), min(ff.y, 1 - ff.y)))) * 0.6;
float3 C2 = Texture2DSample(G2, G2Sampler, fq / 2.0 + float2(n.h1(fid + 1.7), n.h1(fid + 9.2))).rgb / float3(0.3635, 0.3154, 0.2443);
float3 walk = WalkC.xyz * C2 * joint * lerp(0.86, 1.12, n.h1(fid + 3.3));
// kerb: granite along the kerb (the face's own frame)
float2 kt = normalize(float2(-N.z, N.x) + 1e-5);
float3 C4 = Texture2DSample(G4, G4Sampler, float2(dot(P.xz, kt), P.y) / 2.17).rgb / float3(0.3848, 0.3062, 0.1717);
float3 kerb = KerbC.xyz * C4;
// R3-HQ: the CC0 sets at their real size (ue_families.json hq: the asphalt, the flags' concrete, the kerbs' granite) as detail
// over the same colours (each set over its own mean), two taps against tiling, their normals and roughness, a macro tone
// and the scans' cavities as grime
float3 hqN = float3(0, 0, 1); float hqRough = -1.0;
if (HqOn > 0.5) {
float2 sA = g / HSz.x;
float2 cA = sA * 0.2; float2 cAa = floor(cA), cAb = floor(cA + 0.5);
float2 sA1 = sA + floor(float2(n.h1(cAa + 3.7), n.h1(cAa + 9.1)) * 7.0 / 0.001) * 0.001, sA2 = sA + floor(float2(n.h1(cAb + 5.3), n.h1(cAb + 1.9)) * 7.0 / 0.001) * 0.001;
float wA = smoothstep(0.3, 0.7, n.vn(cA * 2.3 + 11.0));
float3 Aa = lerp(Texture2DSample(HA, HASampler, sA1).rgb, Texture2DSample(HA, HASampler, sA2).rgb, wA) / max(HAm.xyz, 0.001);
float3 An = lerp(Texture2DSample(HAN, HANSampler, sA1).rgb, Texture2DSample(HAN, HANSampler, sA2).rgb, wA) * 2.0 - 1.0;
float3 Ar = lerp(Texture2DSample(HAR, HARSampler, sA1).rgb, Texture2DSample(HAR, HARSampler, sA2).rgb, wA);
float2 sW = g / HSz.y + float2(n.h1(fid + 1.7), n.h1(fid + 9.2)) * 5.0;
float2 cW = sW * 0.2; float2 cWa = floor(cW), cWb = floor(cW + 0.5);
float2 sW1 = sW + floor(float2(n.h1(cWa + 3.7), n.h1(cWa + 9.1)) * 7.0 / 0.001) * 0.001, sW2 = sW + floor(float2(n.h1(cWb + 5.3), n.h1(cWb + 1.9)) * 7.0 / 0.001) * 0.001;
float wW = smoothstep(0.3, 0.7, n.vn(cW * 2.3 + 11.0));
float3 Wa = lerp(Texture2DSample(HW, HWSampler, sW1).rgb, Texture2DSample(HW, HWSampler, sW2).rgb, wW) / max(HWm.xyz, 0.001);
float3 Wn = lerp(Texture2DSample(HWN, HWNSampler, sW1).rgb, Texture2DSample(HWN, HWNSampler, sW2).rgb, wW) * 2.0 - 1.0;
float3 Wr = lerp(Texture2DSample(HWR, HWRSampler, sW1).rgb, Texture2DSample(HWR, HWRSampler, sW2).rgb, wW);
float2 sK = float2(dot(P.xz, kt), P.y) / HSz.z;
float2 cK = sK * 0.2; float2 cKa = floor(cK), cKb = floor(cK + 0.5);
float2 sK1 = sK + floor(float2(n.h1(cKa + 3.7), n.h1(cKa + 9.1)) * 7.0 / 0.001) * 0.001, sK2 = sK + floor(float2(n.h1(cKb + 5.3), n.h1(cKb + 1.9)) * 7.0 / 0.001) * 0.001;
float wK = smoothstep(0.3, 0.7, n.vn(cK * 2.3 + 11.0));
float3 Ka = lerp(Texture2DSample(HK, HKSampler, sK1).rgb, Texture2DSample(HK, HKSampler, sK2).rgb, wK) / max(HKm.xyz, 0.001);
float3 Kn = lerp(Texture2DSample(HKN, HKNSampler, sK1).rgb, Texture2DSample(HKN, HKNSampler, sK2).rgb, wK) * 2.0 - 1.0;
float3 Kr = lerp(Texture2DSample(HKR, HKRSampler, sK1).rgb, Texture2DSample(HKR, HKRSampler, sK2).rgb, wK);
float mac = lerp(1.0 - MacroK, 1.0 + MacroK, n.fbm(g * 0.07 + 3.1));
asph = AsphC.xyz * Aa * lerp(1.0, Ar.r, CavK) * mac * lerp(1.0, 0.93, young);
walk = WalkC.xyz * Wa * lerp(1.0, Wr.r, CavK) * joint * lerp(0.9, 1.08, n.h1(fid + 3.3)) * mac;
kerb = KerbC.xyz * Ka * lerp(1.0, Kr.r, CavK);
hqN = isA * An + isW * Wn + isK * Kn + (1.0 - isA - isW - isK) * float3(0, 0, 1);
hqRough = isA * Ar.g + isW * Wr.g + isK * Kr.g;
}
float3 grass = float3(0.07, 0.09, 0.035) * lerp(0.7, 1.3, n.fbm(P.xz * 0.7));
float3 paintW = lerp(float3(0.62, 0.62, 0.6), asph, smoothstep(0.55, 0.85, n.fbm(g * 3.0)) * 0.35);
float3 paintY = lerp(float3(0.62, 0.42, 0.08), asph, smoothstep(0.55, 0.85, n.fbm(g * 3.0)) * 0.35);
float rest = saturate(1.0 - isA - isW - isK - isPW - isPY - isG);
float3 alb = asph * isA + walk * isW + kerb * isK + paintW * isPW + paintY * isPY + grass * isG + walk * rest;
Rough = isA * 0.85 + isW * 0.8 + isK * 0.75 + (isPW + isPY) * 0.6 + isG * 0.95 + rest * 0.8;
if (hqRough >= 0.0) Rough = saturate(hqRough + (isPW + isPY) * 0.6 + isG * 0.95 + rest * 0.8);
// R3-HQ: the sets' normals (OpenGL) in the street grid's frame (g: T along its x, the image's up along -its y), the kerb's
// faces in their own frame
float3 Tg = float3(0.8744, 0, 0.4853), Bg = -float3(-0.4853, 0, 0.8744);
if (isK > 0.5 && abs(N.y) < 0.7) { Tg = float3(kt.x, 0, kt.y); Bg = float3(0, -1, 0); }
float3 nw = normalize(Tg * hqN.x * NrmK + Bg * hqN.y * NrmK + N * max(hqN.z, 0.05));
NormalOut = normalize(float3(nw.x, nw.z, nw.y));
return max(alb * Gain.xyz, 0.0);
'''

DECAL = r'''
// the texture's UsdTransform2d (Xf: scale xy, translation zw; XfR: cos, sin of its rotation) on the USD's st (UE flipped V)
float2 s0 = float2(UV0.x, 1.0 - UV0.y) * Xf.xy;
s0 = float2(s0.x * XfR.x - s0.y * XfR.y, s0.x * XfR.y + s0.y * XfR.x) + Xf.zw;
float2 tuv = float2(s0.x, 1.0 - s0.y);
float4 t = Texture2DSample(Tex, TexSampler, tuv);
Opacity = saturate(t.a * OpacityK);
// R5-ROOF: a stain or a paint layer is matte (the web's decals are rough, and a transparent layer must not mirror the sky)
Rough = 1.0; Spec = 0.2;
return t.rgb * Gain.xyz;
'''

SIGN = r'''
// the texture's UsdTransform2d (Xf: scale xy, translation zw; XfR: cos, sin of its rotation) on the USD's st (UE flipped V)
float2 s0 = float2(UV0.x, 1.0 - UV0.y) * Xf.xy;
s0 = float2(s0.x * XfR.x - s0.y * XfR.y, s0.x * XfR.y + s0.y * XfR.x) + Xf.zw;
float2 tuv = float2(s0.x, 1.0 - s0.y);
float4 t = Texture2DSample(Tex, TexSampler, tuv);
Mask = (MaskOn > 0.5) ? t.a : 1.0;
Glow = t.rgb * GlowK;
return t.rgb * Gain.xyz;
'''

FILM = r'''
// three.js r185 AgXToneMapping on linear sRGB x exposure, the sRGB encoding, the web's grade (core/engine.js GradeShader).
// The scene colour arrives as radiance here (dividing it by View.PreExposure, 0.18 with the manual exposure at bias 0, put
// the sky 2.5 EV over the web's), so Expo is the page's own exposure (toneMappingExposure)
float3 c = (max(In.rgb, 0.0) + max(Bloom.rgb, 0.0)) * Expo;   // (the engine's combined bloom: the lamp heads' glare)
float3x3 to2020 = float3x3(0.6274, 0.3293, 0.0433, 0.0691, 0.9195, 0.0113, 0.0164, 0.0880, 0.8956);
float3x3 inset = float3x3(0.856627153315983, 0.0951212405381588, 0.0482516061458583, 0.137318972929847, 0.761241990602591, 0.101439036467562, 0.11189821299995, 0.0767994186031903, 0.811302368396859);
float3x3 outset = float3x3(1.1271005818144368, -0.11060664309660323, -0.016493938717834573, -0.1413297634984383, 1.157823702216272, -0.016493938717834257, -0.14132976349843826, -0.11060664309660294, 1.2519364065950405);
float3x3 to709 = float3x3(1.6605, -0.5876, -0.0728, -0.1246, 1.1329, -0.0083, -0.0182, -0.1006, 1.1187);
c = mul(to2020, c); c = mul(inset, c);
float lo = -12.47393, hi = 4.026069;
c = saturate((log2(max(c, 1e-10)) - lo) / (hi - lo));
c = ((((((15.5 * c - 40.14) * c + 31.96) * c - 6.868) * c + 0.4298) * c + 0.1191) * c - 0.00232);
c = mul(outset, c);
c = pow(max(c, 0.0), 2.2);
c = saturate(mul(to709, c));
c = lerp(c * 12.92, 1.055 * pow(max(c, 1e-9), 1.0 / 2.4) - 0.055, step(0.0031308, c));
if (Blk > 1e-5 || abs(Wht - 1.0) > 1e-5) { float sl = 1.0 / max(Wht - Blk, 0.5); c = saturate(c * sl - Blk * sl); }
c = c + (c * c * (3.0 - 2.0 * c) - c) * Con;
c = c + smoothstep(0.55, 1.0, c) * (1.0 - c) * 4.0 * Hi;
float l0 = dot(c, float3(0.2126, 0.7152, 0.0722));
c += (1.0 - smoothstep(0.10, 0.72, l0)) * Warm * float3(1.0, 0.45, -0.6);
c += (l0 * 0.65 + 0.35) * TintG * float3(-0.55, 1.0, -0.4);
float l = dot(c, float3(0.2126, 0.7152, 0.0722));
c = (c - l) * Sat + l;
c += (1.0 - l) * float3(0.005, 0.006, 0.01);
float2 q = UV - 0.5;
c *= 1.0 - Vig * smoothstep(0.35, 0.95, dot(q, q) * 2.6);
// R4-CINE: film grain (the cinematic preset's; 0 in the takes): a per-pixel, per-frame hash, lighter in the highlights
float gr = frac(sin(dot(UV * float2(1913.3, 1171.9) + frac(Time * 0.731) * 113.0, float2(12.9898, 78.233))) * 43758.5453);
c += (gr - 0.5) * Grain * (1.0 - 0.5 * saturate(l));
// the engine encodes this pass's output to sRGB itself: hand it linear (an encoded output came out encoded twice: 2.5 EV
// too bright, the grade's warmth 2.7x as strong)
c = saturate(c);
return lerp(c / 12.92, pow((c + 0.055) / 1.055, 2.4), step(0.04045, c));
'''

FACADE = r'''
struct BXN {
  float h1(float2 p) { p = frac(p * float2(123.34, 456.21)); p += dot(p, p + 45.32); return frac(p.x * p.y); }
  float vn(float2 p) { float2 i = floor(p), f = frac(p); f = f * f * (3.0 - 2.0 * f);
    return lerp(lerp(h1(i), h1(i + float2(1, 0)), f.x), lerp(h1(i + float2(0, 1)), h1(i + float2(1, 1)), f.x), f.y); }
  float fbm(float2 p) { return 0.5 * vn(p) + 0.25 * vn(p * 2.03 + 7.1) + 0.125 * vn(p * 4.01 + 3.3) + 0.125 * vn(p * 8.13 + 1.7); }
};
BXN n;
// (the bake's meshes carry fst (facade metres) and st (the atlas): UE's UV sets sort by name, so st is UV 1)
float4 a = Texture2DSample(Alb, AlbSampler, UV1);
float3 e = Texture2DSample(Emi, EmiSampler, UV1).rgb;
float3 d = Texture2DSample(Dat, DatSampler, UV1).rgb;
Rough = saturate(lerp(d.r, 0.08, d.g));
// the web's glass shows the environment (its IBL), not the street behind the lens: the panes' Fresnel x the sky's mean
float fr = 0.04 + 0.96 * pow(1.0 - saturate(abs(dot(normalize(V), normalize(NW)))), 5.0);
// the lit rooms behind the panes (the bake's B: room lit), as blender_windows' room glow: room albedo x 1.6 x the bulb's
// warm tint, mix(0.22, 1, night)
Glow = e * e * 8.0 * EmitK + d.g * fr * SkyC.xyz * ReflK + d.g * d.b * RoomC.xyz * RoomK * lerp(0.22 * RoomT, 1.0, EmitK);
// R3-PHYS: every room's day ambience behind its pane (blender_windows: (1 - night) x (0.08 + 0.26 x a per-room hash) x the
// room photographs' albedo, RoomA), so the unlit rooms are not black beside the lit ones by day (a cell of 1.6 x 3.2 m of
// the facade's metres stands for a room)
float2 rc = floor(UV0 / float2(1.6, 3.2));
float rh = frac(sin(dot(rc, float2(127.1, 311.7))) * 43758.55);
// (by day the rooms are seen through the pane and its film: RoomT, the share that reaches the camera; Cycles' glass)
Glow += d.g * (1.0 - EmitK) * (0.08 + 0.26 * rh) * RoomA * RoomT * float3(1.0, 0.97, 0.92);
// R3-HQ: the walls by class from the bake's colour (brick: red over green; stone: light and warm; plaster: the rest), each
// class's CC0 set at its real size on the facade's metres (UV 0), as detail over the bake's own colour, its normal and
// roughness; the panes (the bake's G) keep the bake
float3 alb = a.rgb;
float3 tnF = float3(0, 0, 1);
if (HqOn > 0.5) {
  float lum = dot(a.rgb, float3(0.2126, 0.7152, 0.0722));
  float wb = saturate((a.r / max(a.g, 0.002) - 1.25) * 3.0);
  // (stone: light and warm, not the near-white of a painted or stucco wall, which takes the third class's plaster)
  float ws = (1.0 - wb) * saturate((lum - 0.16) * 6.0) * saturate((a.r / max(a.b, 0.002) - 1.0) * 3.0) * (1.0 - smoothstep(0.32, 0.45, lum));
  float wc = saturate(1.0 - wb - ws);
  float2 sB = UV0 / HSz.x;
  float2 cB = sB * 0.2; float2 cBa = floor(cB), cBb = floor(cB + 0.5);
  float2 sB1 = sB + floor(float2(n.h1(cBa + 3.7), n.h1(cBa + 9.1)) * 7.0 / HUn.x) * HUn.x, sB2 = sB + floor(float2(n.h1(cBb + 5.3), n.h1(cBb + 1.9)) * 7.0 / HUn.x) * HUn.x;
  float wB = smoothstep(0.3, 0.7, n.vn(cB * 2.3 + 11.0));
  float3 Ba = lerp(Texture2DSample(HB, HBSampler, sB1).rgb, Texture2DSample(HB, HBSampler, sB2).rgb, wB) / max(HBm.xyz, 0.001);
  float3 Bn = lerp(Texture2DSample(HBN, HBNSampler, sB1).rgb, Texture2DSample(HBN, HBNSampler, sB2).rgb, wB) * 2.0 - 1.0;
  float3 Br = lerp(Texture2DSample(HBR, HBRSampler, sB1).rgb, Texture2DSample(HBR, HBRSampler, sB2).rgb, wB);
  float2 sS = UV0 / HSz.y;
  float2 cS = sS * 0.2; float2 cSa = floor(cS), cSb = floor(cS + 0.5);
  float2 sS1 = sS + floor(float2(n.h1(cSa + 3.7), n.h1(cSa + 9.1)) * 7.0 / HUn.y) * HUn.y, sS2 = sS + floor(float2(n.h1(cSb + 5.3), n.h1(cSb + 1.9)) * 7.0 / HUn.y) * HUn.y;
  float wS = smoothstep(0.3, 0.7, n.vn(cS * 2.3 + 11.0));
  float3 Sa = lerp(Texture2DSample(HS, HSSampler, sS1).rgb, Texture2DSample(HS, HSSampler, sS2).rgb, wS) / max(HSm.xyz, 0.001);
  float3 Sn = lerp(Texture2DSample(HSN, HSNSampler, sS1).rgb, Texture2DSample(HSN, HSNSampler, sS2).rgb, wS) * 2.0 - 1.0;
  float3 Sr = lerp(Texture2DSample(HSR, HSRSampler, sS1).rgb, Texture2DSample(HSR, HSRSampler, sS2).rgb, wS);
  float2 sC = UV0 / HSz.z;
  float2 cC = sC * 0.2; float2 cCa = floor(cC), cCb = floor(cC + 0.5);
  float2 sC1 = sC + floor(float2(n.h1(cCa + 3.7), n.h1(cCa + 9.1)) * 7.0 / HUn.z) * HUn.z, sC2 = sC + floor(float2(n.h1(cCb + 5.3), n.h1(cCb + 1.9)) * 7.0 / HUn.z) * HUn.z;
  float wC = smoothstep(0.3, 0.7, n.vn(cC * 2.3 + 11.0));
  float3 Ca = lerp(Texture2DSample(HC, HCSampler, sC1).rgb, Texture2DSample(HC, HCSampler, sC2).rgb, wC) / max(HCm.xyz, 0.001);
  float3 Cn = lerp(Texture2DSample(HCN, HCNSampler, sC1).rgb, Texture2DSample(HCN, HCNSampler, sC2).rgb, wC) * 2.0 - 1.0;
  float3 Cr = lerp(Texture2DSample(HCR, HCRSampler, sC1).rgb, Texture2DSample(HCR, HCRSampler, sC2).rgb, wC);
  float3 det = Ba * wb + Sa * ws + Ca * wc;
  float3 arm = Br * wb + Sr * ws + Cr * wc;
  float wall = 1.0 - d.g;
  alb = a.rgb * lerp(float3(1, 1, 1), det * lerp(1.0, arm.r, CavK) * lerp(1.0 - MacroK, 1.0 + MacroK, n.fbm(UV0 * 0.09 + 1.3)), wall);
  float3 nf = Bn * wb + Sn * ws + Cn * wc;
  tnF = lerp(float3(0, 0, 1), float3(nf.x * NrmK, -nf.y * NrmK, max(nf.z, 0.05)), wall);
  Rough = saturate(lerp(arm.g, 0.08, d.g));
}
NormalTS = normalize(tnF);
return alb * Gain.xyz;
'''

DATA = r'''
// the take's data pass: the region (custom stencil, set per component from ue_families.json regions) and the planar depth
// in metres, 32-bit, for ue_check.py's regions and bx_leafcheck.py's reprojection
return float3(Stencil.r, Depth.r * 0.01, 1.0);
'''

LEAF = r'''
float4 t = Texture2DSample(Tex, TexSampler, UV0);
Mask = t.a;
float3 n = Texture2DSample(Nrm, NrmSampler, UV0).rgb * 2.0 - 1.0;
NormalTS = normalize(float3(n.x, -n.y, max(n.z, 0.15)));   // (the cards' maps are OpenGL; UE's tangent frame is DirectX)
float3 c = t.rgb * Tint.xyz;
Sss = c * Trans;
return c;
'''

HIDDEN = r'''
Mask = 0.0;
return float3(0, 0, 0);
'''

LENS = r'''
return Color.xyz * Strength;
'''

WALKER = r'''
// R4-PEDS: the crowd's walkers as blender_peds.py draws them (crowd.js PL31): a garment's colour is its walker's tint for
// that part (TA, TB, TC: top, bottom, shoes, rgba, on the walker's own instance; the part from the vertex colour's R) at the
// texture's own value against its local mean (the layer's mip-6 map), mixed in by the tint's alpha; skin, cloth and eyes
// take their roughness ranges; the day trim mix(0.9, 1, night)
float4 t = Texture2DSample(Alb, AlbSampler, UV0);
float3 alb = t.rgb;
if (Cls > 0.5 && Cls < 1.5) {
  float part = (VC.r < 0.05) ? 0.0 : ((VC.r < 0.42) ? 1.0 : ((VC.r < 0.82) ? 2.0 : 3.0));   // (ue_prep's levels, sRGB or not)
  float4 tt = float4(0, 0, 0, 0);
  // (the tints are the instance's parameters, not custom primitive data: reading that in the ray-traced hit shaders of
  // 634 skinned walkers hung the GPU under the cinematic preset's temporal samples, Xid 109)
  if (part > 0.5 && part < 1.5) tt = TA;
  else if (part > 1.5 && part < 2.5) tt = TB;
  else if (part > 2.5 && part < 3.5) tt = TC;
  float3 Y = float3(0.2126, 0.7152, 0.0722);
  float lum = dot(alb, Y), mlum = max(dot(Texture2DSample(Mean, MeanSampler, UV0).rgb, Y), 0.02);
  float3 rec = min(tt.rgb * clamp(lum / mlum, 0.25, 2.2), 0.85);
  alb = lerp(alb, rec, saturate(tt.a));
}
float3 o = Texture2DSample(Orm, OrmSampler, UV0).rgb;
Rough = (Cls < 0.5) ? 0.5 + 0.18 * o.g : ((Cls < 1.5) ? 0.62 + 0.38 * o.g : ((Cls < 2.5) ? 0.08 : o.g));
float3 nn = Texture2DSample(Nrm, NrmSampler, UV0).rgb * 2.0 - 1.0;
NormalTS = normalize(float3(nn.x, -nn.y, max(nn.z, 0.1)));   // (the crowd's maps are OpenGL)
return alb * Trim;
'''

GLASS = r'''
// R3-REFL: the window kit's thin glass (blender_windows.build_kitglass, fk/kitMats.js winGlass), lit and premultiplied:
// the pane's dirt film (its opacity (op + film x 0.14) x 0.55, a dark diffuse) over the room behind, the reflection the
// engine's own (glass's f0 0.04, the pane's roughness; Lumen's front-layer reflections), straight transmission for the rest
float film = 0.5 * Dirt;
float a = saturate((Op + film * 0.14) * 0.55);
Opacity = a;
Rough = Rgh;
return (0.04 + film * 0.3) * Col.xyz * a;
'''

# (name, hlsl, inputs, extra outputs, settings)
#   input kinds: s scalar, v vector, ts texture sRGB, tl texture linear, wp world position, nw vertex normal, uv0-uv3, cam (camera vector)
COMMON = [('WP', 'wp'), ('NW', 'nw'), ('Origin', 'v', (0, 0, 0, 0))]
MASTERS = {
    'pbr': (PBR, COMMON + [('UV0', 'uv0'), ('UV1', 'uv1'), ('UV2', 'uv2'), ('UV3', 'uv3'),
                           ('Alb', 'ts', 'white'), ('Nrm', 'tl', 'flat'), ('Orm', 'tl', 'orm'),
                           ('Size', 'v', (1, 1, 0, 0)), ('Rot', 'v', (1, 0, 0, 1)), ('Seed', 's', 0.0), ('Unit', 'v', (0, 0, 0, 0)),
                           ('World', 's', 0.0), ('Ratio', 'v', (1, 1, 1, 0)), ('FkOn', 's', 0.0), ('VcOn', 's', 0.0),
                           ('Bl', 'v', (0.25, 0.75, 0.5, 0)), ('NrmK', 's', 1.0), ('WallK', 's', 0.0), ('TrimV', 'v', (1, 1, 1, 0)),
                           ('Dirt', 's', 0.3), ('BaseY', 's', 0.0), ('TopY', 's', 1e5), ('Street', 's', 0.0), ('RoughK', 's', 1.0),
                           ('MetalOn', 's', 0.0), ('MetalV', 's', 0.0), ('MacroK', 's', 0.0), ('DetK', 's', 0.0), ('CavK', 's', 0.0),   # R3-HQ
                           ('PaintOn', 's', 0.0), ('Chips', 's', 1.0), ('RefL', 's', 0.25), ('Scan', 'v', (0, 0, 0, 1)), ('SubK', 's', 0.0)],   # R4-PAINT
            [('Rough', 1), ('Metal', 1), ('AO', 1), ('NormalOut', 3)], {'normal_ws': True}),
    'plain': (PLAIN, [('UV0', 'uv0'), ('UV1', 'uv1'), ('UV2', 'uv2'), ('Color', 'v', (0.5, 0.5, 0.5, 1)), ('FkOn', 's', 0.0),
                      ('VcOn', 's', 0.0), ('Gain', 'v', (1, 1, 1, 0)), ('HasTex', 's', 0.0), ('Tex', 'ts', 'white'),
                      ('EmiC', 'v', (0, 0, 0, 0)), ('EmiK', 's', 0.0), ('HasEmiTex', 's', 0.0), ('EmiTex', 'ts', 'white'),
                      ('Xf', 'v', (1, 1, 0, 0)), ('XfR', 'v', (1, 0, 0, 0)), ('SelfK', 's', 0.0), ('BaseK', 's', 1.0)],
              [('Glow', 3)], {'plain_pbr': True}),
    'paint': (PAINT, [('UV0', 'uv0'), ('LP', 'lp'), ('Color', 'v', (0.8, 0.8, 0.8, 0)), ('Gain', 'v', (1, 1, 1, 0)), ('HasTex', 's', 0.0), ('Tex', 'ts', 'white'),
                      ('Xf', 'v', (1, 1, 0, 0)), ('XfR', 'v', (1, 0, 0, 0)), ('RoughK', 's', 0.35), ('CcK', 's', 1.0), ('CcR', 's', 0.035)],
              [('Rough', 1), ('Metal', 1), ('CC', 1), ('CCR', 1)], {'cpd': True, 'clearcoat': True, 'attrs': True}),   # R3-PAINT, R4-PAINT
    'vk': (VK, COMMON + [('Paint', 'v', (0.03, 0.07, 0.07, 0)), ('Paint2', 'v', (0.02, 0.06, 0.07, 0)), ('RustC', 'v', (0.15, 0.06, 0.03, 0)),
                         ('RustD', 'v', (0.06, 0.03, 0.014, 0)), ('RustAmt', 's', 0.3), ('Ground', 's', 3.4), ('Seed', 's', 0.0),
                         ('Guano', 's', 0.3), ('Gain', 'v', (1, 1, 1, 0)), ('HqOn', 's', 0.0), ('HSz', 'v', (1, 2.2, 1, 0)), ('MacroK', 's', 0.08),
                         ('CavK', 's', 0.5), ('NrmK', 's', 1.0)] + [('HP', 'ts', 'white'), ('HPN', 'tl', 'flat'), ('HPR', 'tl', 'orm'), ('HPm', 'v', (0.5, 0.5, 0.5, 0)), ('HR', 'ts', 'white'), ('HRN', 'tl', 'flat'), ('HRR', 'tl', 'orm'), ('HRm', 'v', (0.5, 0.5, 0.5, 0))],
           [('Rough', 1), ('Metal', 1), ('NormalOut', 3)], {'normal_ws': True}),   # R3-HQ
    'ground': (GROUND, COMMON + [('UV1', 'uv1'), ('G0', 'ts', 'white'), ('G1', 'ts', 'white'), ('G2', 'ts', 'white'), ('G4', 'ts', 'white'),
                                 ('AsphC', 'v', (0.2, 0.2, 0.2, 0)), ('WalkC', 'v', (0.42, 0.38, 0.3, 0)), ('KerbC', 'v', (0.38, 0.31, 0.2, 0)),
                                 ('Gain', 'v', (1, 1, 1, 0)), ('HqOn', 's', 0.0), ('HSz', 'v', (3, 1.8, 1.9, 0)), ('MacroK', 's', 0.08),
                                 ('CavK', 's', 0.5), ('NrmK', 's', 1.0)] + [('HA', 'ts', 'white'), ('HAN', 'tl', 'flat'), ('HAR', 'tl', 'orm'), ('HAm', 'v', (0.5, 0.5, 0.5, 0)), ('HW', 'ts', 'white'), ('HWN', 'tl', 'flat'), ('HWR', 'tl', 'orm'), ('HWm', 'v', (0.5, 0.5, 0.5, 0)), ('HK', 'ts', 'white'), ('HKN', 'tl', 'flat'), ('HKR', 'tl', 'orm'), ('HKm', 'v', (0.5, 0.5, 0.5, 0))],
               [('Rough', 1), ('NormalOut', 3)], {'no_shadow_hint': True, 'normal_ws': True}),   # R3-HQ
    'decal': (DECAL, [('UV0', 'uv0'), ('Tex', 'ts', 'white'), ('OpacityK', 's', 1.0), ('Gain', 'v', (1, 1, 1, 0)), ('Xf', 'v', (1, 1, 0, 0)), ('XfR', 'v', (1, 0, 0, 0))],
              [('Opacity', 1), ('Rough', 1), ('Spec', 1)], {'blend': 'translucent', 'no_front_layer': True}),   # R5-ROOF: Rough, Spec, no front layer
    'sign': (SIGN, [('UV0', 'uv0'), ('Tex', 'ts', 'white'), ('MaskOn', 's', 0.0), ('GlowK', 's', 0.0), ('Gain', 'v', (1, 1, 1, 0)), ('Xf', 'v', (1, 1, 0, 0)), ('XfR', 'v', (1, 0, 0, 0))],
             [('Mask', 1), ('Glow', 3)], {'blend': 'masked'}),
    'lens': (LENS, [('Color', 'v', (1, 1, 1, 0)), ('Strength', 's', 1.0)], [], {'unlit': True}),
    'walker': (WALKER, [('UV0', 'uv0'), ('VC', 'vc'), ('Alb', 'ts', 'white'), ('Mean', 'ts', 'white'), ('Nrm', 'tl', 'flat'), ('Orm', 'tl', 'orm'),
                        ('Cls', 's', 1.0), ('Trim', 's', 1.0), ('TA', 'v', (0, 0, 0, 0)), ('TB', 'v', (0, 0, 0, 0)), ('TC', 'v', (0, 0, 0, 0))],
               [('Rough', 1), ('NormalTS', 3)], {}),   # R4-PEDS
    'glass': (GLASS, [('Op', 's', 0.36), ('Dirt', 's', 0.3), ('Col', 'v', (0.89, 0.92, 0.92, 0)), ('Rgh', 's', 0.03)],
              [('Opacity', 1), ('Rough', 1)], {'blend': 'composite', 'two_sided': True, 'forward': True}),   # R3-REFL
    'hidden': (HIDDEN, [], [('Mask', 1)], {'blend': 'masked'}),
    'leaf': (LEAF, [('UV0', 'uv0'), ('Tex', 'ts', 'white'), ('Nrm', 'tl', 'flat'), ('Tint', 'v', (1, 1, 1, 0)), ('Trans', 's', 0.6)],
             [('Mask', 1), ('NormalTS', 3), ('Sss', 3)], {'blend': 'masked', 'two_sided': True, 'foliage': True, 'rough_param': True}),
    'data': (DATA, [('Stencil', 'stencil'), ('Depth', 'depth')], [], {'post_after': True}),
    'facade': (FACADE, [('UV1', 'uv1'), ('V', 'cam'), ('NW', 'nw'), ('Alb', 'ts', 'white'), ('Emi', 'tl', 'black'), ('Dat', 'tl', 'orm'),
                        ('EmitK', 's', 0.0), ('Gain', 'v', (1, 1, 1, 0)), ('SkyC', 'v', (0.6, 0.7, 0.9, 0)), ('ReflK', 's', 1.0),
                        ('RoomC', 'v', (1.0, 0.8, 0.45, 0)), ('RoomK', 's', 0.96), ('UV0', 'uv0'), ('RoomA', 's', 0.6), ('RoomT', 's', 0.45), ('HqOn', 's', 0.0), ('HSz', 'v', (1.4, 3.0, 2.71, 0)),
                        ('HUn', 'v', (1, 1, 0.001, 0)), ('MacroK', 's', 0.06), ('CavK', 's', 0.5), ('NrmK', 's', 1.0)] + [('HB', 'ts', 'white'), ('HBN', 'tl', 'flat'), ('HBR', 'tl', 'orm'), ('HBm', 'v', (0.5, 0.5, 0.5, 0)), ('HS', 'ts', 'white'), ('HSN', 'tl', 'flat'), ('HSR', 'tl', 'orm'), ('HSm', 'v', (0.5, 0.5, 0.5, 0)), ('HC', 'ts', 'white'), ('HCN', 'tl', 'flat'), ('HCR', 'tl', 'orm'), ('HCm', 'v', (0.5, 0.5, 0.5, 0))],
               [('Rough', 1), ('Glow', 3), ('NormalTS', 3)], {}),   # R3-HQ
    'film': (FILM, [('In', 'scene'), ('Bloom', 'bloom'), ('UV', 'sceneuv'), ('Expo', 's', 1.0), ('Sat', 's', 1.0), ('Con', 's', 0.0), ('Blk', 's', 0.0),
                    ('Wht', 's', 1.0), ('Hi', 's', 0.0), ('Warm', 's', 0.0), ('TintG', 's', 0.0), ('Vig', 's', 0.0),
                    ('Grain', 's', 0.0), ('Time', 'time')], [], {'post': True}),   # R4-CINE: Grain, Time
}

# R6-BUS (UE track, 2026-10-08): the ground with the red bus lane (matId 12, NYC DOT red, as the web's ground shader draws
# it): a thin red-oxide film multiplied on the asphalt under it (R x 1.70, G x 0.558, B x 0.550, a fifth darker with its
# chroma kept through the film), 18 % toward the product's own value, a mottled 95 % cover, matte. A master of its own
# (ue_families.json ground), so no other master is rebuilt while takes render.
BUS6 = r"""
if (abs(k - 12) < 0.5) {
float3 red = lerp(asph * float3(1.70, 0.558, 0.550), float3(0.150, 0.048, 0.040), 0.18);
float cov = 0.95 * (1.0 - smoothstep(0.52, 0.90, n.fbm(P.xz * 0.075 + 3.7)) * 0.24);
alb = lerp(alb, red, cov);
Rough = lerp(Rough, 0.88, cov);
}
"""
assert GROUND.count('return max(alb * Gain.xyz, 0.0);') == 1
MASTERS['ground6'] = (GROUND.replace('return max(alb * Gain.xyz, 0.0);', BUS6 + 'return max(alb * Gain.xyz, 0.0);'),) + tuple(MASTERS['ground'][1:])
# R6-BUS end



def _tga(path, rgba):
    w = h = 4
    hdr = struct.pack('<BBBHHBHHHHBB', 0, 0, 2, 0, 0, 0, 0, 0, w, h, 32, 8)
    px = bytes([rgba[2], rgba[1], rgba[0], rgba[3]]) * (w * h)
    with open(path, 'wb') as f: f.write(hdr + px)


def import_texture(path, dest, name, srgb, hdr=False):
    """a texture file as a Texture2D (sRGB colour or linear data, no normal-map compression: the masters decode it)."""
    task = unreal.AssetImportTask()
    task.set_editor_property('filename', path)
    task.set_editor_property('destination_path', dest)
    task.set_editor_property('destination_name', name)
    task.set_editor_property('automated', True)
    task.set_editor_property('replace_existing', True)
    task.set_editor_property('save', False)
    unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
    paths = task.get_editor_property('imported_object_paths')
    if not paths: return None
    tex = unreal.load_asset(paths[0])
    if isinstance(tex, unreal.Texture2D):
        tex.set_editor_property('srgb', bool(srgb))
        tex.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_HDR if hdr else (unreal.TextureCompressionSettings.TC_DEFAULT if srgb else unreal.TextureCompressionSettings.TC_BC7))
        tex.set_editor_property('never_stream', True)
    return tex


def defaults():
    """4x4 default textures (white, flat normal, ORM, black), so each texture parameter has a texture of its own kind."""
    d = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_intermediate_dir()), 'bx_defaults')
    os.makedirs(d, exist_ok=True)
    out = {}
    for name, rgba, srgb in (('white', (255, 255, 255, 255), True), ('flat', (128, 128, 255, 255), False),
                             ('orm', (255, 204, 0, 255), False), ('black', (0, 0, 0, 255), False)):
        ap = f'{ROOT}/Tex/T_default_{name}'
        if eal.does_asset_exist(ap):
            out[name] = eal.load_asset(ap); continue
        p = os.path.join(d, f'T_default_{name}.tga'); _tga(p, rgba)
        out[name] = import_texture(p, f'{ROOT}/Tex', f'T_default_{name}', srgb)
        eal.save_loaded_asset(out[name])
    return out


def build(name, spec, tex):
    code, inputs, outs, sett = spec
    ap = f'{ROOT}/M_bx_{name}'
    if eal.does_asset_exist(ap): eal.delete_asset(ap)
    m = unreal.AssetToolsHelpers.get_asset_tools().create_asset(f'M_bx_{name}', ROOT, unreal.Material, unreal.MaterialFactoryNew())
    if sett.get('blend') == 'translucent':
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
        m.set_editor_property('translucency_lighting_mode', unreal.TranslucencyLightingMode.TLM_SURFACE)
    elif sett.get('blend') == 'composite':   # premultiplied: the colour over the scene x (1 - opacity)
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_ALPHA_COMPOSITE)
    elif sett.get('blend') == 'masked':
        m.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
    if sett.get('unlit'): m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
    if sett.get('clearcoat'): m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_CLEAR_COAT)   # R3-PAINT
    if sett.get('forward'): m.set_editor_property('translucency_lighting_mode', unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)   # R3-REFL
    if sett.get('no_front_layer'):   # R5-ROOF: a translucent layer that takes no front-layer (mirror) reflection
        try: m.set_editor_property('allow_front_layer_translucency', False)
        except Exception as e: unreal.log_warning(f'[bxue] {name}: allow_front_layer_translucency: {e}')
    if sett.get('post') or sett.get('post_after'):
        m.set_editor_property('material_domain', unreal.MaterialDomain.MD_POST_PROCESS)
        m.set_editor_property('blendable_location', unreal.BlendableLocation.BL_REPLACING_TONEMAPPER if sett.get('post') else unreal.BlendableLocation.BL_SCENE_COLOR_AFTER_TONEMAPPING)
    if sett.get('two_sided'): m.set_editor_property('two_sided', True)
    if sett.get('foliage'): m.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_TWO_SIDED_FOLIAGE)
    if sett.get('blend') == 'masked': m.set_editor_property('opacity_mask_clip_value', 0.5)
    if sett.get('normal_ws'): m.set_editor_property('tangent_space_normal', False)
    cu = mel.create_material_expression(m, unreal.MaterialExpressionCustom, -500, 0)
    cu.set_editor_property('code', code)
    cu.set_editor_property('description', f'bx_{name}')
    cu.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    ins = []
    for it in inputs:
        ci = unreal.CustomInput(); ci.set_editor_property('input_name', it[0]); ins.append(ci)
    cu.set_editor_property('inputs', ins)
    if outs:
        ao = []
        for on, dim in outs:
            co = unreal.CustomOutput(); co.set_editor_property('output_name', on)
            co.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT1 if dim == 1 else unreal.CustomMaterialOutputType.CMOT_FLOAT3)
            ao.append(co)
        cu.set_editor_property('additional_outputs', ao)
    y = -1200
    for it in inputs:
        nm, kind = it[0], it[1]
        if kind == 's':
            e = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -900, y)
            e.set_editor_property('parameter_name', nm); e.set_editor_property('default_value', float(it[2]))
        elif kind == 'v':
            e = mel.create_material_expression(m, unreal.MaterialExpressionVectorParameter, -900, y)
            e.set_editor_property('parameter_name', nm); e.set_editor_property('default_value', unreal.LinearColor(*[float(v) for v in it[2]]))
        elif kind in ('ts', 'tl'):
            e = mel.create_material_expression(m, unreal.MaterialExpressionTextureObjectParameter, -900, y)
            e.set_editor_property('parameter_name', nm)
            e.set_editor_property('texture', tex[it[2]])
            e.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_COLOR if kind == 'ts' else unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
        elif kind == 'wp':
            e = mel.create_material_expression(m, unreal.MaterialExpressionWorldPosition, -900, y)
        elif kind == 'nw':
            e = mel.create_material_expression(m, unreal.MaterialExpressionVertexNormalWS, -900, y)
        elif kind == 'cam':
            e = mel.create_material_expression(m, unreal.MaterialExpressionCameraVectorWS, -900, y)
            e2 = mel.create_material_expression(m, unreal.MaterialExpressionMultiply, -700, y)
            mel.connect_material_expressions(e, '', e2, 'A'); e2.set_editor_property('const_b', -1.0); e = e2
        elif kind in ('scene', 'bloom', 'stencil', 'depth'):
            e = mel.create_material_expression(m, unreal.MaterialExpressionSceneTexture, -900, y)
            e.set_editor_property('scene_texture_id', {'scene': unreal.SceneTextureId.PPI_POST_PROCESS_INPUT0, 'bloom': unreal.SceneTextureId.PPI_POST_PROCESS_INPUT2,
                                                       'stencil': unreal.SceneTextureId.PPI_CUSTOM_STENCIL,
                                                       'depth': unreal.SceneTextureId.PPI_SCENE_DEPTH}[kind])
        elif kind == 'vc':   # R4-PEDS: the vertex colour
            e = mel.create_material_expression(m, unreal.MaterialExpressionVertexColor, -900, y)
        elif kind == 'time':   # R4-CINE: the game time (Movie Render Queue steps it per frame)
            e = mel.create_material_expression(m, unreal.MaterialExpressionTime, -900, y)
        elif kind == 'lp':   # R3-PAINT: the local position (cm)
            e = mel.create_material_expression(m, unreal.MaterialExpressionLocalPosition, -900, y)
        elif kind == 'sceneuv':
            e = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -900, y)
        elif kind.startswith('uv'):
            e = mel.create_material_expression(m, unreal.MaterialExpressionTextureCoordinate, -900, y)
            e.set_editor_property('coordinate_index', int(kind[2]))
        # a vector parameter's first output is its RGB; the masters read four components (Rot, Bl ...): its RGBA output
        if not (kind == 'v' and mel.connect_material_expressions(e, 'RGBA', cu, nm)):
            mel.connect_material_expressions(e, '', cu, nm)
        y += 90
    MP = unreal.MaterialProperty
    if sett.get('attrs'):
        # R4-PAINT: the outputs through Make Material Attributes, which reaches the pins the property enum hides (the clear coat)
        m.set_editor_property('use_material_attributes', True)
        ma = mel.create_material_expression(m, unreal.MaterialExpressionMakeMaterialAttributes, -250, 0)
        mel.connect_material_expressions(cu, '', ma, 'BaseColor')
        for on, pin in (('Rough', 'Roughness'), ('Metal', 'Metallic'), ('CC', 'ClearCoat'), ('CCR', 'ClearCoatRoughness'), ('Glow', 'EmissiveColor')):
            if on in [o[0] for o in outs]: mel.connect_material_expressions(cu, on, ma, pin)
        mel.connect_material_property(ma, '', MP.MP_MATERIAL_ATTRIBUTES)
    elif sett.get('unlit') or sett.get('post') or sett.get('post_after'):
        mel.connect_material_property(cu, '', MP.MP_EMISSIVE_COLOR)
        if 'Opacity' in [o[0] for o in outs]: mel.connect_material_property(cu, 'Opacity', MP.MP_OPACITY)
    else:
        mel.connect_material_property(cu, '', MP.MP_BASE_COLOR)
        names = [o[0] for o in outs]
        if 'Rough' in names: mel.connect_material_property(cu, 'Rough', MP.MP_ROUGHNESS)
        if 'Spec' in names: mel.connect_material_property(cu, 'Spec', MP.MP_SPECULAR)   # R5-ROOF
        if 'Metal' in names: mel.connect_material_property(cu, 'Metal', MP.MP_METALLIC)
        if 'AO' in names: mel.connect_material_property(cu, 'AO', MP.MP_AMBIENT_OCCLUSION)
        if 'NormalOut' in names: mel.connect_material_property(cu, 'NormalOut', MP.MP_NORMAL)
        if 'Opacity' in names: mel.connect_material_property(cu, 'Opacity', MP.MP_OPACITY)
        if 'Mask' in names: mel.connect_material_property(cu, 'Mask', MP.MP_OPACITY_MASK)
        if 'Glow' in names: mel.connect_material_property(cu, 'Glow', MP.MP_EMISSIVE_COLOR)
        if 'NormalTS' in names: mel.connect_material_property(cu, 'NormalTS', MP.MP_NORMAL)
        if 'Sss' in names: mel.connect_material_property(cu, 'Sss', MP.MP_SUBSURFACE_COLOR)
    if sett.get('plain_pbr') or sett.get('rough_param'):
        # plain, leaf: roughness and metalness straight from parameters
        for i, (pn, prop) in enumerate((('Rough', MP.MP_ROUGHNESS), ('Metal', MP.MP_METALLIC))):
            e = mel.create_material_expression(m, unreal.MaterialExpressionScalarParameter, -300, 300 + 90 * i)
            e.set_editor_property('parameter_name', pn); e.set_editor_property('default_value', 0.8 if pn == 'Rough' else 0.0)
            mel.connect_material_property(e, '', prop)
    # the usages a -game render cannot add itself (it falls back to the default material, and a Nanite mesh to its coarse
    # fallback mesh): Nanite, instanced static meshes (the instancers), skeletal meshes (walkers)
    if not (sett.get('post') or sett.get('post_after')):
        for u in ('MATUSAGE_NANITE', 'MATUSAGE_INSTANCED_STATIC_MESHES', 'MATUSAGE_SKELETAL_MESH', 'MATUSAGE_GEOMETRY_CACHE'):
            try: mel.set_material_usage(m, getattr(unreal.MaterialUsage, u))
            except Exception as e: unreal.log_warning(f'[bxue] {name}: usage {u}: {e}')
    mel.recompile_material(m)
    eal.save_loaded_asset(m)
    return ap


def ensure(force=False):
    """build the masters when missing or older than VERSION. -> {name: asset path, 'built': [...]}"""
    vf = os.path.join(unreal.Paths.convert_relative_path_to_full(unreal.Paths.project_content_dir()), 'Bx', f'.masters_v{VERSION}')
    out = {'built': []}
    tex = defaults()
    for name, spec in MASTERS.items():
        ap = f'{ROOT}/M_bx_{name}'
        if force or not os.path.exists(vf) or not eal.does_asset_exist(ap):
            build(name, spec, tex); out['built'].append(name)
        out[name] = ap
    os.makedirs(os.path.dirname(vf), exist_ok=True)
    open(vf, 'w').write('ok')
    return out
