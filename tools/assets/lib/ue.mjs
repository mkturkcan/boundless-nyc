// UE (CARLA 0.10) data helpers: blueprint component trees, material instance parameters, UE->glTF transforms.
// Exports come from tools/assets/ueextract (CUE4Parse). glTF space = UE (x, z, y) * 0.01, quat (x, z, y, -w).
import fs from 'node:fs';
import path from 'node:path';
import { fromTRS, mul, ident } from './mat4.mjs';

export const EXPORT_ROOT = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_export';
export const JSON_ROOT = (process.env.ASSET_TOOLS || `${process.env.USERPROFILE || process.env.HOME}/.tools`) + '/carla_json';
export const CARLA = 'CarlaUnreal/Content/Carla';

export const pkgOf = (ref) => (ref && ref.ObjectPath ? String(ref.ObjectPath).replace(/\.\d+$/, '') : null);
// "StaticMeshComponent'BP_X_C:Door_FL_GEN_VARIABLE'" -> "Door_FL_GEN_VARIABLE"
export const innerName = (ref) => {
  const s = ref && (ref.ObjectName || '');
  const m = /'([^']*)'/.exec(s);
  const full = m ? m[1] : s;
  return full.split(/[:.]/).pop();
};

// UE FRotator (degrees) -> FQuat, exactly as FRotator::Quaternion()
export function rotatorToQuat(r) {
  if (!r) return [0, 0, 0, 1];
  const d2r = Math.PI / 180 / 2;
  const P = (r.Pitch || 0) % 360, Y = (r.Yaw || 0) % 360, R = (r.Roll || 0) % 360;
  const SP = Math.sin(P * d2r), CP = Math.cos(P * d2r), SY = Math.sin(Y * d2r), CY = Math.cos(Y * d2r);
  const SR = Math.sin(R * d2r), CR = Math.cos(R * d2r);
  return [CR * SP * SY - SR * CP * CY, -CR * SP * CY - SR * CP * SY, CR * CP * SY - SR * SP * CY, CR * CP * CY + SR * SP * SY];
}
// UE relative transform -> glTF-space matrix
export function ueRelMatrix(loc, rot, scale) {
  const t = loc ? [loc.X * 0.01, loc.Z * 0.01, loc.Y * 0.01] : [0, 0, 0];
  const q = rotatorToQuat(rot);
  const qg = [q[0], q[2], q[1], -q[3]];
  const s = scale ? [scale.X, scale.Z, scale.Y] : [1, 1, 1];
  return fromTRS(t, qg, s);
}

// Blueprint component tree. Returns [{ name, type, mesh, socket, parent, rel, overrides }] with `parent` the variable
// name of the parent component ('' = the actor root / inherited VehicleMesh space).
export function readBlueprint(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const byName = new Map(j.map((e) => [e.Name, e]));
  const comps = [];
  // inherited components overridden in this class (e.g. VehicleMesh, CharacterMesh0)
  for (const e of j) {
    if (!/Component$/.test(e.Type) || e.Name.endsWith('_GEN_VARIABLE')) continue;
    const p = e.Properties || {};
    const mesh = pkgOf(p.SkeletalMesh || p.SkinnedAsset || p.StaticMesh);
    if (!mesh) continue;
    comps.push({ name: e.Name, type: e.Type, mesh, socket: p.AttachSocketName || null, parent: '', inherited: true,
      rel: ueRelMatrix(p.RelativeLocation, p.RelativeRotation, p.RelativeScale3D), overrides: (p.OverrideMaterials || []).map(pkgOf) });
  }
  // SCS nodes (components added by this blueprint)
  const parentOf = new Map();
  for (const e of j) {
    if (e.Type !== 'SCS_Node') continue;
    for (const c of e.Properties?.ChildNodes || []) parentOf.set(innerName(c), e.Properties.InternalVariableName);
  }
  for (const e of j) {
    if (e.Type !== 'SCS_Node') continue;
    const p = e.Properties || {};
    const tmpl = byName.get(innerName(p.ComponentTemplate));
    if (!tmpl) continue;
    const tp = tmpl.Properties || {};
    const mesh = pkgOf(tp.SkeletalMesh || tp.SkinnedAsset || tp.StaticMesh);
    const parent = parentOf.get(e.Name) || p.ParentComponentOrVariableName || '';
    comps.push({ name: p.InternalVariableName, type: tmpl.Type, mesh, socket: p.AttachToName && p.AttachToName !== 'None' ? p.AttachToName : null,
      parent, rel: ueRelMatrix(tp.RelativeLocation, tp.RelativeRotation, tp.RelativeScale3D), overrides: (tp.OverrideMaterials || []).map(pkgOf),
      light: /(^|-)(front|back|interior)-/.test(p.InternalVariableName || '') ? true : undefined });
  }
  return comps;
}

// world matrix of every component given socket matrices of the root skeletal mesh (name -> matrix)
export function componentWorlds(comps, rootName, sockets) {
  const by = new Map(comps.map((c) => [c.name, c]));
  const memo = new Map();
  const world = (c, depth = 0) => {
    if (memo.has(c.name)) return memo.get(c.name);
    if (depth > 20) throw new Error('component cycle at ' + c.name);
    let base = ident();
    if (c.parent && c.parent !== rootName && by.has(c.parent)) base = world(by.get(c.parent), depth + 1);
    if (c.socket && sockets.has(c.socket)) base = mul(base, sockets.get(c.socket));
    const m = mul(base, c.rel);
    memo.set(c.name, m);
    return m;
  };
  for (const c of comps) c.world = world(c);
  return comps;
}

// ---------------- material instances ----------------
const matIndex = new Map();
function buildIndex() {
  if (matIndex.size) return;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) matIndex.set(e.name.slice(0, -5).toLowerCase(), p);
      else if (e.name.endsWith('.png')) matIndex.set('tex:' + e.name.slice(0, -4).toLowerCase(), p);
    }
  })(EXPORT_ROOT);
}
export function findMaterialJson(name) { buildIndex(); return matIndex.get(String(name).toLowerCase()) || null; }
export function findTexture(name) { buildIndex(); return matIndex.get('tex:' + String(name).toLowerCase()) || null; }

// Flattened MI parameters: { name, textures: {param: texName}, colors: {param: [r,g,b,a] linear}, scalars, switches, blend, shading }
export function readMaterial(name) {
  const f = findMaterialJson(name);
  if (!f) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const p = j.Parameters || {};
  const short = (v) => String(v).split('/').pop().split('.')[0];
  const textures = {};
  for (const [k, v] of Object.entries(j.Textures || {})) textures[k] = short(v);
  const colors = {};
  for (const [k, v] of Object.entries(p.Colors || {})) colors[k] = [v.R ?? 0, v.G ?? 0, v.B ?? 0, v.A ?? 1];
  const over = (p.Properties || {}).BasePropertyOverrides || {};
  return { name, file: f, textures, colors, scalars: { ...(p.Scalars || {}) }, switches: { ...(p.Switches || {}) },
    blend: String(over.BlendMode || p.BlendMode || ''), shading: String(over.ShadingModel || p.ShadingModel || ''),
    twoSided: !!(over.TwoSided || (p.Properties || {}).TwoSided) };
}
