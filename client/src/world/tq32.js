// TQ32: relief, weathering and sun occlusion for the Times Square towers (docs/notes/tsq-aaa32.md). `?tq32=0` restores.
//
// Owner 2026-09-29, on teaser 3: "Can you improve the Times Square more? There is a "basicness" to it, as if building
// primitives need a lot more detail, the materials need to be PBR and more detailed with weathering etc. to match the AAA
// quality we are going for. It seems rather unlit and basic."
//
// Measured cause. A CPU ray cast of the day takes' key poses against the compiled prisms (scratchpad tq32/raycast.mjs)
// puts 60-90 % of every building pixel on curtain-wall towers (MODERN_GLASS, GLASS_TOWER_BLUE) and pier-and-spandrel
// masonry towers (DECO_MASONRY), all drawn by the tile facade shader on a flat prism. There the mullion is a dark line
// 9 % of a bay wide in the ALBEDO and the pier a 17 % value step, so nothing has depth: at the grazing angles a canyon
// forces (t3DayCorner frame 0, 1500 Broadway at 35 m) the whole wall is the analytic sky mirror, a near-white sheet with
// grey bands, where a real curtain wall shows the sides of its mullion caps, the shadows they cast and glass that
// reflects the next fin instead of the sky. The dresser, which builds real reveals, only takes masonry under 45 m.
//
// What this adds, inside the Square only (full strength to 340 m from its centre, gone by 520 m; `?tq32r=r0,r1`):
//   * a parallax relief on those walls: vertical fins at every bay line (a curtain wall's mullion caps, 0.08-0.40 m deep,
//     median 0.16, a heavier one on the tower's structural rhythm) or piers (a deco tower's window columns set 0.24-0.40 m
//     back), and on curtain walls a horizontal cap on each spandrel's top edge. Per pixel the view ray is traced through
//     the fin layer: it meets a fin face, a fin or cap side (shaded with its own normal), or the recessed glass / spandrel;
//     postwar towers get proud spandrel bands, masonry towers belt courses and a cornice (both only beyond the hero ring,
//     which builds real masonry trim within 255 m);
//   * the fins' sun shadows on the recess and on each other, applied to the directional lights only (FAC_sunK), plus the
//     sun kept off a fin side when the sun is behind the wall;
//   * glass whose mirror ray leaves the recess through a fin reflects the fin, not the sky;
//   * mullion caps as PBR metals by glass family (black or bronze anodised, clear, silver, gold) that mirror the sky,
//     per-floor tone, soot toward the street, run-off streaks under every sill and spandrel cap, dirt in the recesses;
//   * the screens' light on the walls round them and their reflection in the curtain-wall glass (12 faces, 4 Hz).
// Everything is box-filtered by its own footprint and converges to its band-limited mean (face / side / recess shares
// at the current obliquity) before a bay reaches a pixel, per the project's stipple rules.
import * as THREE from 'three';

const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams('');
export const TQ32 = Q.get('tq32') !== '0';
const R = (Q.get('tq32r') || '340,520').split(',').map(Number);
// `?tq32x=` parts bitmask for A/B (default 63): 1 fins / caps / deco piers, 2 the caps' metal sky, 4 postwar bands, 8 belts
// and cornices, 16 weathering, 32 the screens' light and reflection
const X = (() => { const v = parseInt(Q.get('tq32x'), 10); return Number.isFinite(v) ? v : 63; })();
// the Square's centre as SG31 / SF32 / SR31 use it (materials.js, weather.js)
export const TQ32U = {
  c: { value: new THREE.Vector4(-1215, 2820, R[0] || 340, R[1] || 520) },
  on: { value: 1 },
  sp: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },   // screen centre (world), area
  sn: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },   // outward normal x, z; width, height
  sc: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) },   // linear colour x brightness
  n: { value: 0 },
};
if (typeof window !== 'undefined') window.__TQ32 = (on = 1) => { TQ32U.on.value = on ? 1 : 0; return TQ32U.on.value; };

const PARS = /* glsl */ `
        uniform vec4 tq32C;     // TQ32: xy the Square's centre (world xz), z full-strength radius, w fade-out radius
        uniform float tq32On;   // TQ32: runtime switch (window.__TQ32)
        uniform vec4 tq32SP[12]; uniform vec4 tq32SN[12]; uniform vec4 tq32SC[12]; uniform int tq32SNum;   // TQ32: screens
        float FAC_sunK = 1.0;   // TQ32: the relief's own sun occlusion, applied to the directional lights only
        float FAC_metal = 0.0;  // TQ32: metalness of the mullion caps`;

// Runs at the end of the facade shader's windowed-wall branch, before its global value calibration: every local of
// that branch (the bay layout cuC / cellU / sideM, the opening xb0..yb1, aaU, style flags) is in scope.
const WALL = /* glsl */ `
          // ---- TQ32: fins, caps and piers as a traced relief; weathering (world/tq32.js, docs/notes/tsq-aaa32.md)
          {
            float tqW = tq32On * (1.0 - smoothstep(tq32C.z, tq32C.w, length(vWP.xz - tq32C.xy)));
            // masonry walls within the hero ring's range (heroFacades.js HERO_R 255 m, the 110 nearest buildings) carry its REAL
            // piers, string courses and window surrounds; the traced masonry relief starts where that geometry ends, so the
            // two never double. Glass gets no hero geometry at all, so the fins run everywhere.
            float tqHero = smoothstep(240.0, 300.0, length(vWP - cameraPosition));
            bool tqDeco = style > 3.5 && style < 4.5;
            if (tqW > 0.002 && bldgH > 20.0 && (glassStyle || (tqDeco && tqHero > 0.001)) && inBay && bayN >= 2.0
                && !(store && v < storeH + 0.25) && v > 0.6 && v < bldgH - 1.0) {
              float tqWr = glassStyle ? tqW : tqW * tqHero;
              float tqH1 = hash12(vec2(floor(cvar * 263.0), 41.3));
              float tqH2 = hash12(vec2(floor(cvar * 157.0), 7.9));
              float finD = glassStyle ? mix(0.08, 0.40, tqH1 * tqH1) : mix(0.24, 0.40, tqH1);   // fin / pier depth, m (glass: median 0.16)
              float finHW = glassStyle ? max(0.045 * winW, 0.055) : max((xb0 - 0.03) * winW, 0.22);   // half face, m
              float grp = 3.0 + step(0.5, hash12(vec2(floor(cvar * 173.0), 11.9)));          // TOWERFX's pier rhythm
              float kL = floor(cuC);
              float bigL = glassStyle ? 1.0 - step(0.5, mod(kL, grp)) : 0.0;
              float bigR = glassStyle ? 1.0 - step(0.5, mod(kL + 1.0, grp)) : 0.0;
              float g0 = finHW * mix(1.0, 2.3, bigL) / winW;                                // the recess, bay units
              float g1 = 1.0 - finHW * mix(1.0, 2.3, bigR) / winW;
              float fr = cuC - kL;
              // the view ray in the wall frame (view space; cross(N, up) is +u under the ring winding, as in the room mapper)
              vec3 tqN = normalize(vNormal);
              vec3 tqUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
              vec3 tqT = normalize(cross(tqN, tqUp));
              vec3 tqB = normalize(cross(tqN, tqT)); if (dot(tqB, tqUp) < 0.0) tqB = -tqB;
              vec3 tqR = normalize(-vViewPosition);
              float tqRz = max(dot(tqR, -tqN), 0.03);
              float tx = dot(tqR, tqT) / tqRz / winW;                  // bay units per metre of depth, going in
              float ty = dot(tqR, tqB) / tqRz / floorH;                // floor units per metre of depth
              float aaB = max(aaU, 1e-4);
              float inGap = smoothstep(g0 - aaB, g0 + aaB, fr) * (1.0 - smoothstep(g1 - aaB, g1 + aaB, fr));
              float frD = fr + tx * finD;                              // where the ray meets the back plane
              float overH = tx > 0.0 ? frD - g1 : g0 - frD;            // > 0: it leaves the recess through a fin side
              float sideH = smoothstep(-aaB, aaB, overH);
              float sH = clamp(tx > 0.0 ? (g1 - fr) / max(tx, 1e-5) : (fr - g0) / max(-tx, 1e-5), 0.0, finD);
              vec3 nSH = tx > 0.0 ? -tqT : tqT;
              // curtain walls: a 0.20 m horizontal cap on each spandrel's top edge (TOWERFX's band: 0.97 -> 1.30 floors),
              // standing capP off the back plane, so its face lies dLF behind the prism plane
              float capP = finD * 0.55, dLF = finD - capP;
              float hl = glassStyle ? 0.10 / floorH : 0.0;
              float gl = v / floorH - 0.30;
              float frV = gl - floor(gl);
              float aaFl = max(fwidth(gl), 1e-4);
              float p0 = frV + ty * dLF, p1 = frV + ty * finD;         // the ray at the cap face depth, at the back plane
              float m0 = floor(p0);
              float capF = glassStyle ? 1.0 - smoothstep(hl - aaFl, hl + aaFl, abs(p0 - floor(p0 + 0.5))) : 0.0;
              float overV = ty > 0.0 ? p1 - (m0 + 1.0 - hl) : (m0 + hl) - p1;
              float sideV = glassStyle ? (1.0 - capF) * smoothstep(-aaFl, aaFl, overV) : 0.0;
              float sV = clamp(dLF + (ty > 0.0 ? ((m0 + 1.0 - hl) - p0) / max(ty, 1e-5) : (p0 - (m0 + hl)) / max(-ty, 1e-5)), dLF, finD);
              vec3 nSV = ty > 0.0 ? -tqB : tqB;
              // first surface along the ray: a fin face (the prism plane), a fin side, a cap face, a cap side, or the recess
              float front = 1.0 - inGap;
              float finFirst = sideH * step(sH, dLF);
              float wSH = inGap * finFirst;
              float rem = inGap * (1.0 - finFirst);
              float wCF = rem * capF;
              float rem2 = rem - wCF;
              float wSV = rem2 * sideV * (1.0 - sideH * step(sH, sV));
              wSH += rem2 * sideH * (1.0 - sideV * step(sV, sH));
              float wRec = max(inGap - wSH - wCF - wSV, 0.0);
              // the sun: shadows of the fins and caps on the recess, a fin side shadowed by the fin across the recess
              vec3 tqL = normalize((viewMatrix * vec4(sunDirW, 0.0)).xyz);
              float lN = dot(tqL, tqN);
              float lx = dot(tqL, tqT) / max(lN, 0.02) / winW;         // bay units per metre going out toward the sun
              float ly = dot(tqL, tqB) / max(lN, 0.02) / floorH;
              float frS = frD + lx * finD;
              float litX = smoothstep(g0 - aaB, g0 + aaB, frS) * (1.0 - smoothstep(g1 - aaB, g1 + aaB, frS));
              float litY = glassStyle ? 1.0 - smoothstep(-aaFl, aaFl, fract(p1) + max(ly, 0.0) * capP - (1.0 - hl)) : 1.0;
              float litSide = 1.0 - smoothstep(-aaB, aaB, abs(lx) * sH - (g1 - g0));
              // mirror rays that leave the recess through a fin or under a cap see the metal, not the sky
              float frF = fr + 2.0 * tx * finD;
              float occH = 1.0 - smoothstep(g0 - aaB, g0 + aaB, frF) * (1.0 - smoothstep(g1 - aaB, g1 + aaB, frF));
              float occV = glassStyle ? smoothstep(-aaFl, aaFl, fract(p1) + max(ty, 0.0) * capP - (1.0 - hl)) : 0.0;
              float refOcc = 1.0 - (1.0 - occH) * (1.0 - occV);
              // band-limited means: the face share, the side share (grows with the obliquity), the recess
              float vis = smoothstep(0.55, 0.2, aaB) * (glassStyle ? smoothstep(0.55, 0.2, aaFl) : 1.0);
              {
                float gW = max(1.0 - 2.0 * finHW / winW * (1.0 + (glassStyle ? 1.3 / grp : 0.0)), 0.05);   // mean recess width, bay units
                float pH = min(abs(tx) * finD / gW, 1.0);
                float cF = 2.0 * hl, pV = glassStyle ? min(abs(ty) * capP / max(1.0 - cF, 0.05), 1.0) : 0.0;
                float mRest = gW * (1.0 - pH);
                front = mix(1.0 - gW, front, vis);
                wSH = mix(gW * pH, wSH, vis);
                wCF = mix(mRest * cF, wCF, vis);
                wSV = mix(mRest * (1.0 - cF) * pV, wSV, vis);
                wRec = mix(mRest * (1.0 - cF) * (1.0 - pV), wRec, vis);
                litX = mix(clamp(1.0 - abs(lx) * finD / gW, 0.0, 1.0), litX, vis);
                litY = mix(glassStyle ? clamp(1.0 - max(ly, 0.0) * capP / max(1.0 - cF, 0.05), 0.0, 1.0) : 1.0, litY, vis);
                litSide = mix(clamp(1.0 - abs(lx) * finD * 0.5 / gW, 0.0, 1.0), litSide, vis);
                refOcc = mix(clamp(abs(tx) * finD / gW + (glassStyle ? max(ty, 0.0) * capP / max(1.0 - cF, 0.05) : 0.0), 0.0, 1.0), refOcc, vis);
              }
              // PBR mullion caps by glass family; a deco pier is its own wall
              vec3 capC = diffuseColor.rgb * vec3(0.95, 0.94, 0.92); float capR = 0.86, capM = 0.0;
              if (glassStyle) {
                if (tqH2 < 0.22)      { capC = vec3(0.075, 0.077, 0.082); capR = 0.40; capM = 0.40; }   // black anodised
                else if (famR < 0.30) { capC = vec3(0.110, 0.085, 0.060); capR = 0.36; capM = 0.55; }   // bronze
                else if (famR < 0.62) { capC = vec3(0.300, 0.310, 0.320); capR = 0.44; capM = 0.40; }   // clear anodised
                else if (famR < 0.84) { capC = vec3(0.460, 0.470, 0.490); capR = 0.32; capM = 0.60; }   // silver
                else                  { capC = vec3(0.300, 0.240, 0.140); capR = 0.34; capM = 0.55; }   // gold
                // extrusion batches and the dirt that settles on each cap's foot, floor by floor
                float cv = hash12(vec2(floor(v / floorH) * 3.1 + cvar * 13.0, kL * 0.37)) - 0.5;
                capC *= 1.0 + cv * 0.10 * vis;
                capC *= 1.0 - 0.18 * smoothstep(0.45, 0.0, fract(v / floorH)) * vis;
              }
              float dFin = min(fr - g0, g1 - fr) * winW;
              float aoR = 1.0 - 0.34 * exp(-max(dFin, 0.0) / (0.35 * finD + 0.05)) * vis - 0.10 * (1.0 - vis);
              vec3 recA = albedo * aoR;
              vec3 frontA = glassStyle ? capC : albedo;
              vec3 sideA = glassStyle ? capC * 0.92 : capC * 0.88;
              vec3 nA = frontA * front + capC * wCF + sideA * (wSH + wSV) + recA * wRec;
              float nR = (glassStyle ? capR : FAC_rough) * front + capR * (wCF + wSH + wSV) + FAC_rough * wRec;
              // the recess keeps its own glow (rooms, lit panes); the mirror term goes where a fin takes the reflection
              float eK = glassStyle ? wRec * (1.0 - refOcc * 0.5 * (1.0 - night)) : front + wRec;
              float sunK = front + wCF + wSH * (lN > 0.0 ? litSide : 0.0) + wSV * step(0.0, lN) + wRec * litX * litY;
              albedo = mix(albedo, nA, tqWr);
              FAC_rough = mix(FAC_rough, nR, tqWr);
              FAC_emis *= mix(1.0, eK, tqWr);
              FAC_metal = capM * (front + wCF + wSH + wSV) * tqWr;
              FAC_sunK = mix(1.0, sunK, tqWr);
              FAC_nrmAdj += (nSH * wSH + nSV * wSV) * 4.0 * tqWr;
              // the caps answer the sky as metal: faces and sides mirror the analytic sky with their own normals (the
              // scene's IBL is worth ~1 % of a pixel on these walls, TOWERFX (c)), F0 from the metal's colour, the
              // canyon's dark base as TOWERFX has it
              if (glassStyle) {
                vec3 Vm = normalize(cameraPosition - vWP);
                vec3 nFw = normalize((vec4(tqN, 0.0) * viewMatrix).xyz);
                vec3 nHw = normalize((vec4(nSH, 0.0) * viewMatrix).xyz);
                vec3 nVw = normalize((vec4(nSV, 0.0) * viewMatrix).xyz);
                vec3 f0m = mix(vec3(0.04), capC, capM);
                vec3 mF = skyLook(reflect(-Vm, nFw), sunDirW, sunColW, uZenC, uHorC, uRefl, 1.0) * (f0m + (1.0 - f0m) * pow(1.0 - clamp(dot(Vm, nFw), 0.0, 1.0), 5.0));
                vec3 mH = skyLook(reflect(-Vm, nHw), sunDirW, sunColW, uZenC, uHorC, uRefl, 1.0) * (f0m + (1.0 - f0m) * pow(1.0 - clamp(dot(Vm, nHw), 0.0, 1.0), 5.0));
                vec3 mV = skyLook(reflect(-Vm, nVw), sunDirW, sunColW, uZenC, uHorC, uRefl, 1.0) * (f0m + (1.0 - f0m) * pow(1.0 - clamp(dot(Vm, nVw), 0.0, 1.0), 5.0));
                float cnF = mix(0.42, 1.0, smoothstep(6.0, 52.0, v));
                FAC_emis += (mF * (front + wCF) + mH * wSH + mV * wSV) * cnF * (1.0 - 0.5 * capR) * tqW;
              }
            }
            // postwar towers (POSTWAR_BRICK over 40 m): the spandrel between window rows as a continuous band standing
            // 0.18-0.32 m proud, the window row set back behind it (the Marriott, the 1960s-80s slabs round the Square)
            if (tqW > 0.002 && tqHero > 0.001 && style > 1.5 && style < 2.5 && bldgH > 40.0 && inBay && !(store && v < storeH + 0.25) && v > 0.6 && v < bldgH - 1.0) {
              float bD = mix(0.18, 0.32, hash12(vec2(floor(cvar * 199.0), 9.1)));
              float bw = clamp(1.0 + yb0 - yb1, 0.2, 0.7);                 // band height, floors (lintel -> next sill)
              float hv = v / floorH - yb1, fh = hv - floor(hv);           // 0 at the lintel: band [0, bw), window row [bw, 1)
              float aaF = max(fwidth(hv), 1e-4);
              vec3 pN = normalize(vNormal);
              vec3 pUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
              vec3 pT = normalize(cross(pN, pUp));
              vec3 pB = normalize(cross(pN, pT)); if (dot(pB, pUp) < 0.0) pB = -pB;
              vec3 pR = normalize(-vViewPosition);
              float pRz = max(dot(pR, -pN), 0.03);
              float pty = dot(pR, pB) / pRz / floorH;
              float inRow = smoothstep(bw - aaF, bw + aaF, fh) * (1.0 - smoothstep(1.0 - aaF, 1.0, fh));
              float fhD = fh + pty * bD;
              float over = pty > 0.0 ? fhD - 1.0 : bw - fhD;
              float sideB = inRow * smoothstep(-aaF, aaF, over);
              float wRow = inRow - sideB;
              vec3 pL = normalize((viewMatrix * vec4(sunDirW, 0.0)).xyz);
              float plN = dot(pL, pN);
              float ply = dot(pL, pB) / max(plN, 0.02) / floorH;
              float litB = 1.0 - smoothstep(1.0 - aaF, 1.0 + aaF, fhD + max(ply, 0.0) * bD);
              float pvis = smoothstep(0.55, 0.2, aaF);
              float mS = min(abs(pty) * bD, 1.0 - bw);
              float frontB = mix(bw, 1.0 - inRow, pvis);
              sideB = mix(mS, sideB, pvis);
              wRow = mix(max(1.0 - bw - mS, 0.0), wRow, pvis);
              litB = mix(clamp(1.0 - max(ply, 0.0) * bD / max(1.0 - bw, 0.05), 0.0, 1.0), litB, pvis);
              float dSoff = (1.0 - fh) * floorH;                            // metres under the band above
              float aoB = 1.0 - 0.30 * exp(-max(dSoff, 0.0) / (0.5 * bD + 0.05)) * pvis - 0.08 * (1.0 - pvis);
              vec3 sideC = diffuseColor.rgb * (pty > 0.0 ? 0.82 : 0.96);   // soffit / band top
              vec3 nA = albedo * frontB + sideC * sideB + albedo * aoB * wRow;
              float sunB = frontB + sideB * step(0.0, plN) * (pty > 0.0 ? 0.0 : 1.0) + wRow * litB;
              float tqWp = tqW * tqHero;
              albedo = mix(albedo, nA, tqWp);
              FAC_emis *= mix(1.0, frontB + wRow, tqWp);
              FAC_sunK = mix(1.0, sunB, tqWp);
              FAC_nrmAdj += (pty > 0.0 ? -pB : pB) * 4.0 * sideB * tqWp;
            }
            // masonry towers (PREWAR, DECO, CIVIC over 30 m): a belt course over the base, one every 9 floors above it, and
            // the cornice, each a stone band standing out from the wall; traced like the caps (face, soffit, top) and each
            // casting its shadow down the wall below it
            if (tqW > 0.002 && tqHero > 0.001 && bldgH > 30.0 && ((style > 0.5 && style < 1.5) || (style > 3.5 && style < 4.5) || (style > 7.5 && style < 8.5))
                && !(store && v < storeH + 0.25) && v > 0.6) {
              float fl0 = floor((max(storeH, 3.0) + 0.5) / floorH) + 1.0;           // the floor line over the base
              float flv = v / floorH;
              float kB = floor(flv - 0.95 - fl0 + 0.5);                          // nearest belt index above the base
              float kBelt = fl0 + max(0.0, floor((kB + 4.5) / 9.0) * 9.0);       // belts at fl0, fl0 + 9, fl0 + 18 ...
              float bLo = (kBelt + 0.93) * floorH, bHi = bLo + 0.62;               // the band, metres (in the spandrel zone)
              float cHi = bldgH - 0.35, cLo = cHi - 0.95;                          // the cornice under the coping
              float useC = step(abs(v - (cLo + cHi) * 0.5), abs(v - (bLo + bHi) * 0.5));
              float lo = mix(bLo, cLo, useC), hi = mix(bHi, cHi, useC);
              float bP = mix(0.28, 0.62, useC) * mix(0.8, 1.2, hash12(vec2(floor(cvar * 97.0), 3.9)));   // projection, m
              vec3 bN = normalize(vNormal);
              vec3 bUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
              vec3 bT = normalize(cross(bN, bUp));
              vec3 bB = normalize(cross(bN, bT)); if (dot(bB, bUp) < 0.0) bB = -bB;
              vec3 bR = normalize(-vViewPosition);
              float bRz = max(dot(bR, -bN), 0.03);
              float by = dot(bR, bB) / bRz;                                      // metres of height per metre of depth, going in
              // the band stands OUT of the wall plane: from the camera the ray meets its front plane bP before the wall.
              // At the wall-plane point v the ray crossed the front plane at v - by * bP.
              float vF = v - by * bP;
              float aaM = max(fwidth(v), 1e-4);
              float onF = smoothstep(lo - aaM, lo + aaM, vF) * (1.0 - smoothstep(hi - aaM, hi + aaM, vF));
              // between the front plane and the wall the ray sweeps [vF, v]: it meets the soffit (y = lo) or the top (y = hi)
              float sof = (1.0 - onF) * step(0.0, by) * smoothstep(lo - aaM, lo + aaM, v) * (1.0 - smoothstep(lo - aaM, lo + aaM, vF));
              float top = (1.0 - onF) * step(by, 0.0) * (1.0 - smoothstep(hi - aaM, hi + aaM, v)) * smoothstep(hi - aaM, hi + aaM, vF);
              sof = clamp(sof, 0.0, 1.0); top = clamp(top, 0.0, 1.0);
              float wallM = clamp(1.0 - onF - sof - top, 0.0, 1.0);
              // the band's shadow on the wall under it: the sun ray from a wall point climbs ly per metre out
              vec3 bL = normalize((viewMatrix * vec4(sunDirW, 0.0)).xyz);
              float bLN = dot(bL, bN);
              float bly = dot(bL, bB) / max(bLN, 0.02);
              float sh = smoothstep(lo - aaM, lo + aaM, v + max(bly, 0.0) * bP) * (1.0 - smoothstep(lo - aaM, lo + aaM, v));
              float bvis = smoothstep(0.35, 0.08, aaM);                            // a band under ~2 px converges
              vec3 stoneC = diffuseColor.rgb * vec3(1.06, 1.04, 1.0);             // dressed stone, a shade lighter than the wall
              float nG = hash12(vec2(floor(u / 1.4) + kBelt * 7.0, cvar * 31.0)) - 0.5;
              vec3 bandA = stoneC * (1.0 + nG * 0.08) * (1.0 - 0.22 * smoothstep(lo + 0.2, lo, vF));   // dirt on the lower lip
              vec3 nA = albedo * wallM + bandA * onF + stoneC * 0.78 * sof + stoneC * 1.02 * top;
              float k = tqW * tqHero * bvis;
              albedo = mix(albedo, nA, k);
              FAC_emis *= mix(1.0, wallM, k);
              FAC_rough = mix(FAC_rough, 0.84, k * (onF + sof + top));
              FAC_nrmAdj += (-bB * sof + bB * top) * 4.0 * k;
              FAC_sunK *= mix(1.0, (1.0 - sh * wallM) * (1.0 - sof), k * (bLN > 0.0 ? 1.0 : 0.0));
              // run-off under the band: its drip line stains the wall below it
              float drip = smoothstep(1.4, 0.0, lo - v) * step(v, lo) * (0.4 + 0.6 * vnoise(vec2(u * 3.1 + cvar * 11.0, v * 0.4)));
              albedo *= 1.0 - drip * 0.22 * k;
            }
            // weathering on every windowed wall in the Square above the shopfronts
            if (tqW > 0.002 && bldgH > 12.0 && !(store && v < storeH)) {
              float fpW = max(fwidth(u), fwidth(v));
              float wVis = smoothstep(0.30, 0.07, fpW);
              // soot toward the street: the canyon's traffic grime over the first ~30 m (glass sheds more of it)
              albedo *= 1.0 - tqW * (glassStyle ? 0.08 : 0.16) * (1.0 - smoothstep(3.0, 32.0, v));
              // floor-by-floor tone: panels and courses from different batches and repairs
              float tqF = hash12(vec2(floor(v / floorH) * 1.37 + cvar * 71.0, 3.3)) - 0.5;
              albedo *= 1.0 + tqW * tqF * (glassStyle ? 0.05 : 0.09) * smoothstep(0.9, 0.3, max(fwidth(v / floorH), 1e-4));
              // run-off: from each sill (masonry) or spandrel cap (curtain wall) down the face below it, in the opening's
              // column, strongest just under the ledge
              float dS = glassStyle ? fract(v / floorH - 0.30) : fract(fy - yb0);   // floors below the ledge
              float colM = glassStyle ? 1.0 : pcov(cuC, xb0 - 0.04, xb1 + 0.04, aaU * 1.25);
              float sN = vnoise(vec2(u * 2.3 + cvar * 17.0, v * 0.20 + cvar * 3.0));
              float strk = smoothstep(0.50, 0.86, sN) * exp(-(1.0 - dS) * floorH / (glassStyle ? 0.9 : 1.6));
              float strkM = strk * colM * wVis * (glassStyle ? (1.0 - winMask * 0.7) : (1.0 - winMask));
              albedo *= 1.0 - tqW * strkM * (glassStyle ? 0.22 : 0.30);
              FAC_rough = mix(FAC_rough, min(FAC_rough + 0.12, 0.95), tqW * strkM);
            }
            // the screens' light on the walls round them, and their reflection in the curtain-wall glass: the 12 faces
            // tq32SetScreens picks at 4 Hz (billboards.js tsqScreenLights: each face's centre, normal, size, the mean
            // colour of the ad it shows now x its brightness). Each face is a uniform emitter of area A: a wall point
            // sees L A cos(s) cos(r) / (pi d^2 + A) (the disc form, finite at the face itself); unshadowed, kept local
            if (tqW > 0.002 && tq32SNum > 0) {
              vec3 wN = normalize((vec4(vNormal, 0.0) * viewMatrix).xyz);
              vec3 Vw = normalize(cameraPosition - vWP);
              vec3 Rw = reflect(-Vw, wN);
              float fr0 = glassStyle ? FAC_glassF.x : 0.0;
              float fres = fr0 + (1.0 - fr0) * pow(1.0 - clamp(dot(Vw, wN), 0.0, 1.0), 5.0);
              float gW = glassStyle ? (1.0 - FAC_metal) * (1.0 - FAC_spand * 0.6) : 0.0;   // the share of the pixel that is glass
              vec3 E = vec3(0.0), Rm = vec3(0.0);
              for (int i = 0; i < tq32SNum; i++) {   // a uniform bound: the compiler keeps one loop body (12 unrolled bodies took the
                                                         // facade program's compile from 2.0 to 10.1 s on SwiftShader)
                vec4 sp = tq32SP[i], sn = tq32SN[i];
                vec3 ns = vec3(sn.x, 0.0, sn.y);
                vec3 d = sp.xyz - vWP;
                float d2 = max(dot(d, d), 1.0);
                vec3 dn = d * inversesqrt(d2);
                float cR = dot(wN, dn), cS = -dot(ns, dn);
                if (cR > 0.0 && cS > 0.0) E += tq32SC[i].rgb * (sp.w * cR * cS / (3.14159 * d2 + sp.w));
                float den = dot(Rw, ns);
                if (gW > 0.01 && den < -0.02) {
                  float t = dot(d, ns) / den;
                  if (t > 0.5) {
                    vec3 H = vWP + Rw * t - sp.xyz;
                    float hu = abs(dot(H, vec3(-ns.z, 0.0, ns.x))), hv = abs(H.y);
                    float soft = 0.25 + 0.03 * t;                          // plate waviness and the pixel's footprint
                    float inR = (1.0 - smoothstep(sn.z * 0.5 - soft, sn.z * 0.5 + soft, hu)) * (1.0 - smoothstep(sn.w * 0.5 - soft, sn.w * 0.5 + soft, hv));
                    Rm += tq32SC[i].rgb * inR;
                  }
                }
              }
              vec3 calA = pow(max(albedo, vec3(0.0)), vec3(1.22)) * 0.88;   // the value calibration the albedo gets next
              // several faces can overlap in one mirror at grazing view: the sum is held under the night bloom threshold (0.85)
              FAC_emis += (calA * min(E, vec3(1.0)) + min(Rm * fres * gW, vec3(0.7)) * FAC_reflTint) * tqW;
            }
          }`;

// the 12 screen faces that light the walls the camera sees: tsqScreenLights() entries (billboards.js) ranked by area over
// distance to the camera; called by the board material's draw hook at 4 Hz. Faces over 260 m away are dropped.
export function tq32SetScreens(list, cam) {
  if (!TQ32) return;
  const r = [];
  for (const e of list) {
    const d2 = (e.x - cam.x) ** 2 + (e.y - cam.y) ** 2 + (e.z - cam.z) ** 2;
    if (d2 > 260 * 260 || !(e.w > 0 && e.h > 0)) continue;
    r.push([e.w * e.h / (d2 + 400), e]);
  }
  r.sort((a, b) => b[0] - a[0]);
  const n = Math.min(12, r.length);
  for (let i = 0; i < n; i++) {
    const e = r[i][1];
    TQ32U.sp.value[i].set(e.x, e.y, e.z, e.w * e.h);
    TQ32U.sn.value[i].set(e.nx, e.nz, e.w, e.h);
    TQ32U.sc.value[i].set(e.rgb[0] * e.gain, e.rgb[1] * e.gain, e.rgb[2] * e.gain, 0);
  }
  TQ32U.n.value = n;
}

// facade material hook: called at the end of makeFacadeMaterial's onBeforeCompile (materials.js)
// drop the blocks whose bit is off: each block starts at its comment marker and ends where the next one starts
const MK = {
  relief: '            if (tqW > 0.002 && bldgH > 20.0 && (glassStyle',
  metal: '              // the caps answer the sky as metal',
  postwar: '            // postwar towers (POSTWAR_BRICK',
  belts: '            // masonry towers (PREWAR, DECO, CIVIC',
  weather: '            // weathering on every windowed wall',
  screens: "            // the screens' light on the walls round them",
};
function wallParts() {
  let w = WALL;
  for (const k of Object.keys(MK)) if (w.split(MK[k]).length !== 2) { console.warn('[tq32] block marker missing', k); return w; }
  const cut = (a, b) => { const i = w.indexOf(a), j = b ? w.indexOf(b) : w.lastIndexOf('          }'); w = w.slice(0, i) + w.slice(j); };
  if (!(X & 2)) cut(MK.metal, '            }\n' + MK.postwar);
  if (!(X & 1)) cut(MK.relief, MK.postwar);
  if (!(X & 4)) cut(MK.postwar, MK.belts);
  if (!(X & 8)) cut(MK.belts, MK.weather);
  if (!(X & 16)) cut(MK.weather, MK.screens);
  if (!(X & 32)) cut(MK.screens, null);
  return w;
}
export function tq32Patch(sh) {
  if (!TQ32) return;
  const fs = sh.fragmentShader;
  const A1 = 'vec3 FAC_glassF; vec3 FAC_reflTint; float FAC_spand;';
  const A2 = 'albedo *= 1.0 - 0.24 * (1.0 - smoothstep(0.0, 9.0, v)); // street grime (reference: bases run dark)';
  const A3 = '#include <metalnessmap_fragment>';
  const A4 = '#include <lights_fragment_begin>';
  const count = (s, a) => s.split(a).length - 1;
  const lf = THREE.ShaderChunk.lights_fragment_begin;
  const LA = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (count(fs, A1) !== 1 || count(fs, A2) !== 1 || count(fs, A3) !== 1 || count(fs, A4) !== 1 || !lf.includes(LA)) {
    console.warn('[tq32] facade shader anchors changed; the Times Square relief is off', count(fs, A1), count(fs, A2), count(fs, A3), count(fs, A4), lf.includes(LA));
    return;
  }
  sh.uniforms.tq32C = TQ32U.c;
  sh.uniforms.tq32On = TQ32U.on;
  sh.uniforms.tq32SP = TQ32U.sp; sh.uniforms.tq32SN = TQ32U.sn; sh.uniforms.tq32SC = TQ32U.sc; sh.uniforms.tq32SNum = TQ32U.n;
  sh.fragmentShader = fs
    .replace(A1, A1 + PARS)
    .replace(A2, A2 + wallParts())
    .replace(A3, A3 + '\n        metalnessFactor = max(metalnessFactor, FAC_metal);   // TQ32')
    .replace(A4, lf.split(LA).join(LA + '\n\t\tdirectLight.color *= FAC_sunK;   // TQ32'));
}
