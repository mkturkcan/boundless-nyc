# BX-PEDS (AR34 BX, 2026-10-02): the crowd's walkers in Blender (docs/notes/ar34-bx-peds.md). A blender_render.py hook
# (after_import), so stills and blender_take.py takes both get them. --nopeds leaves them out.
#
# Reads peds_<shot>.npz next to the USD root (usd_peds.py) and the harvest's peds/ folder (bodies, assets.json), and builds:
#   - one Armature datablock per body, its bones at the bind matrices (inverse IBM, orthonormal), shared by every walker of
#     that body;
#   - one Mesh datablock per (body, LOD, variant, prop mask): the LOD mesh as the crowd loaded it, the props the walker does
#     not carry left out, vertex groups from the skin weights, UVs with the UDIM tile folded, a material per texture layer
#     and class (skin, cloth, eye, hair);
#   - per walker an armature object parented to the imported /World (the up-axis turn and the region's recentring) with the
#     crowd's instance matrix keyframed, its pose keyframed per frame (pose basis = inverse(rest local) x the web's joint
#     local, so pose matrix = the web's joint global G and the deform = G x IBM = the web's skinning matrix), and its body
#     and hair meshes (Armature modifier, linear blend skinning as the web), hide_render keyframed where the walker is not
#     drawn or is dissolved at the lens (NF31 fade >= 0.5). Keyframes give Cycles the walker's own motion blur.
# A still keyframes the frames round it (f - 1, f, f + 1); a take every frame of the shot.
# Materials follow crowd.js PL31: the garment recolour per tint part (the walker's top / bottom / shoe tints as object
# properties nyc_t1-3, read by Attribute nodes; the texture's local mean from mip 6), skin with random-walk subsurface (IOR
# 1.4, F0 0.028), fabric roughness 0.62-1.0 with sheen, eyes 0.08, hair cards with their alpha (soft threshold round the
# web's 0.35), the day albedo trim mix(0.9, 1, night).
#   options: --nopeds, --pedslod <n> (force a LOD), --pedsmax <n> (at most n walkers, nearest first), --pedssss <scale m>
import bpy, os, json, time, math
import numpy as np
from mathutils import Matrix

TEXCACHE = '/data0/projectnyc_aux/tmp/bx/peds/tex'
_STATE = {}


def _log(*a): print('[blender_peds]', *a, flush=True)


def _load_geo(H, E):
    raw = np.fromfile(os.path.join(H, E['file']), dtype=np.uint8)
    out = {}
    for L in E['layout']:
        dt = np.uint32 if L.get('type') == 'uint32' else np.float32
        n = L['count'] * L['size']
        a = raw[L['off']:L['off'] + n * 4].view(dt)
        out[L['name']] = a.reshape(L['count'], L['size']) if L['size'] > 1 else a.copy()
    return out


def _bind(B):
    ibm = np.asarray(B['ibm'], dtype=np.float64).reshape(-1, 4, 4).transpose(0, 2, 1)
    return np.linalg.inv(ibm)


# ---------------------------------------------------------------- armatures per body (one edit-mode session for all of them:
# a mode switch re-evaluates the whole imported city, ~1-2 s each)
def _armatures(need, coll):
    """need: {body name: (B, S)} -> {body name: Armature datablock}; bones at the bind matrices (inverse IBM)"""
    out, todo = {}, []
    for bn, (B, S) in need.items():
        arm = bpy.data.armatures.get('pedarm_' + bn)
        if arm: out[bn] = arm; continue
        arm = bpy.data.armatures.new('pedarm_' + bn)
        ob = bpy.data.objects.new('pedarm_tmp_' + bn, arm)
        coll.objects.link(ob)
        todo.append((bn, B, S, arm, ob))
        out[bn] = arm
    if not todo: return out
    vl = bpy.context.view_layer
    for o in vl.objects: o.select_set(False)
    for (_, _, _, _, ob) in todo: ob.select_set(True)
    vl.objects.active = todo[0][4]
    bpy.ops.object.mode_set(mode='EDIT')
    for (bn, B, S, arm, ob) in todo:
        bind = _bind(B)
        ebs = []
        for b, name in enumerate(S['bones']):
            eb = arm.edit_bones.new(name)
            eb.head = (0.0, 0.0, 0.0); eb.tail = (0.0, 0.04, 0.0)
            eb.matrix = Matrix(bind[b].tolist())
            ebs.append(eb)
        for b, p in enumerate(S['parents']):
            if p >= 0: ebs[b].parent = ebs[p]; ebs[b].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    for (_, _, _, _, ob) in todo: bpy.data.objects.remove(ob, do_unlink=True)
    return out


# ---------------------------------------------------------------- materials (crowd.js PL31)
def _img(path, noncolor):
    im = bpy.data.images.load(path, check_existing=True)
    if noncolor: im.colorspace_settings.name = 'Non-Color'
    return im

def _tex_path(usd_dir, sname, f):
    p = os.path.join(usd_dir, 'textures', 'peds', sname, f)
    return p if os.path.exists(p) else os.path.join(TEXCACHE, sname, f)

def _material(usd_dir, sname, L, kind, cls, fab, night, sss):
    name = f'ped_{sname}_L{L:03d}_{kind}_c{cls}{"_fab" if fab else ""}'
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N, Lk = nt.nodes, nt.links
    N.clear()
    out = N.new('ShaderNodeOutputMaterial'); bs = N.new('ShaderNodeBsdfPrincipled')
    uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    def tex(f, noncolor):
        t = N.new('ShaderNodeTexImage'); t.image = _img(_tex_path(usd_dir, sname, f), noncolor); t.interpolation = 'Linear'
        Lk.new(uv.outputs['UV'], t.inputs['Vector']); return t
    def math(op, a, b=None, clamp=False):
        n = N.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: Lk.new(v, n.inputs[i])
        return n.outputs[0]
    def vmath(op, a, b=None, scale=None):
        n = N.new('ShaderNodeVectorMath'); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (tuple, list)): n.inputs[i].default_value = v
            else: Lk.new(v, n.inputs[i])
        if scale is not None:
            if isinstance(scale, (int, float)): n.inputs['Scale'].default_value = scale
            else: Lk.new(scale, n.inputs['Scale'])
        return n.outputs['Value'] if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else n.outputs['Vector']
    trim = 0.9 + 0.1 * night   # crowd.js: diffuseColor *= mix(0.9, 1.0, uCrowdNight)
    if kind == 'hair':
        t = tex(f'hair_{L:03d}.png', False)
        alb = vmath('SCALE', t.outputs['Color'], None, trim)
        Lk.new(alb, bs.inputs['Base Color'])
        bs.inputs['Roughness'].default_value = 0.55
        bs.inputs['Specular IOR Level'].default_value = 0.35
        bs.inputs['Sheen Weight'].default_value = 0.4; bs.inputs['Sheen Roughness'].default_value = 0.4
        # the web's alpha test at 0.35, dithered per accumulated sample in the film (a soft edge): a smooth step round it
        mr = N.new('ShaderNodeMapRange'); mr.interpolation_type = 'SMOOTHSTEP'
        mr.inputs['From Min'].default_value = 0.18; mr.inputs['From Max'].default_value = 0.52
        Lk.new(t.outputs['Alpha'], mr.inputs['Value'])
        Lk.new(mr.outputs['Result'], bs.inputs['Alpha'])
        Lk.new(bs.outputs['BSDF'], out.inputs['Surface'])
        return m
    ta = tex(f'albedo_{L:03d}.png', False); tm = tex(f'albedo6_{L:03d}.png', False); tn = tex(f'normal_{L:03d}.png', True); to = tex(f'orm_{L:03d}.png', True)
    alb = ta.outputs['Color']
    if cls == 1:   # the garment recolour by tint part (crowd.js map_fragment): the tint replaces hue and mean value
        Y = (0.2126, 0.7152, 0.0722)
        part = N.new('ShaderNodeAttribute'); part.attribute_type = 'GEOMETRY'; part.attribute_name = 'nyc_part'
        trgb, ta_ = None, None
        for j in (1, 2, 3):
            at = N.new('ShaderNodeAttribute'); at.attribute_type = 'OBJECT'; at.attribute_name = f'nyc_t{j}'
            f = math('COMPARE', part.outputs['Fac'], float(j)); f.node.inputs[2].default_value = 0.5
            c = vmath('SCALE', at.outputs['Color'], None, f)
            a = math('MULTIPLY', at.outputs['Alpha'], f)
            trgb = c if trgb is None else vmath('ADD', trgb, c)
            ta_ = a if ta_ is None else math('ADD', ta_, a)
        lum = vmath('DOT_PRODUCT', alb, Y)
        mlum = math('MAXIMUM', vmath('DOT_PRODUCT', tm.outputs['Color'], Y), 0.02)
        k = math('MINIMUM', math('MAXIMUM', math('DIVIDE', lum, mlum), 0.25), 2.2)
        rec = vmath('MINIMUM', vmath('SCALE', trgb, None, k), (0.85, 0.85, 0.85))
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        Lk.new(ta_, mix.inputs['Factor']); Lk.new(alb, mix.inputs[6]); Lk.new(rec, mix.inputs[7])
        alb = mix.outputs[2]
    alb = vmath('SCALE', alb, None, trim)
    Lk.new(alb, bs.inputs['Base Color'])
    sep = N.new('ShaderNodeSeparateColor'); Lk.new(to.outputs['Color'], sep.inputs['Color'])
    if cls == 0:   # skin: GGX 0.50-0.68 from the ORM, F0 0.028 (IOR 1.4), random-walk subsurface
        Lk.new(math('ADD', math('MULTIPLY', sep.outputs['Green'], 0.18), 0.5), bs.inputs['Roughness'])
        bs.inputs['IOR'].default_value = 1.4
        bs.inputs['Subsurface Weight'].default_value = 1.0
        bs.inputs['Subsurface Radius'].default_value = (1.0, 0.35, 0.2)
        bs.inputs['Subsurface Scale'].default_value = sss
        try: bs.subsurface_method = 'RANDOM_WALK_SKIN'
        except Exception: bs.subsurface_method = 'RANDOM_WALK'
    elif cls == 2:   # eyes: wet
        bs.inputs['Roughness'].default_value = 0.08
    else:            # cloth: woven / knit fabric 0.62-1.0 with a sheen lobe; shoes, belts, bags 0.35-1.0; metal from the ORM
        if fab:
            Lk.new(math('ADD', math('MULTIPLY', sep.outputs['Green'], 0.38), 0.62), bs.inputs['Roughness'])
            bs.inputs['Sheen Weight'].default_value = 1.0; bs.inputs['Sheen Roughness'].default_value = 0.55
            gm = N.new('ShaderNodeGamma'); gm.inputs['Gamma'].default_value = 0.5; Lk.new(alb, gm.inputs['Color'])   # sqrt(albedo) x 0.3
            Lk.new(vmath('SCALE', gm.outputs['Color'], None, 0.3), bs.inputs['Sheen Tint'])
        else:
            Lk.new(math('MINIMUM', math('MAXIMUM', sep.outputs['Green'], 0.35), 1.0), bs.inputs['Roughness'])
        Lk.new(math('MULTIPLY', sep.outputs['Blue'], 0.8), bs.inputs['Metallic'])
    nm = N.new('ShaderNodeNormalMap'); nm.uv_map = 'UVMap'; nm.inputs['Strength'].default_value = 0.9 if cls == 0 else 1.0
    Lk.new(tn.outputs['Color'], nm.inputs['Color']); Lk.new(nm.outputs['Normal'], bs.inputs['Normal'])
    Lk.new(bs.outputs['BSDF'], out.inputs['Surface'])
    return m


# ---------------------------------------------------------------- mesh per (body, LOD, variant, props)
def _mesh(H, usd_dir, A, meta, bn, li, kind, vi, pm, night, sss):
    key = f'ped_{bn}_l{li}_{kind}_{vi}_{pm}'
    me = bpy.data.meshes.get(key)
    if me: return me
    B = A['bodies'][bn]
    E = B['lods'][li].get(kind) if li < len(B['lods']) else None
    if not E: return None
    G = _load_geo(H, E)
    V = meta['variants'][vi]; sname = V.get('set') or 'peds24'
    idx = G['index'].reshape(-1, 3).astype(np.int64)
    meta_ = G['aMeta']
    slot = np.rint(meta_[idx[:, 0], 0]).astype(int); cls = np.rint(meta_[idx[:, 0], 1]).astype(int); part = np.rint(meta_[idx[:, 0], 2]).astype(int)
    keep = np.ones(len(idx), bool)
    pr = part >= 10
    if pr.any(): keep[pr] = ((pm >> (part[pr] - 10)) & 1) == 1
    # BX-FIX (2026-10-04): t7ArchCrane's walkers crashed Blender twice (SIGSEGV in the custom normals below): a face with a
    # repeated corner (a degenerate triangle of a LOD mesh) or a corner past the vertices is invalid geometry for Blender
    nvv = len(G['position'])
    bad = (idx[:, 0] == idx[:, 1]) | (idx[:, 1] == idx[:, 2]) | (idx[:, 0] == idx[:, 2]) | (idx.max(axis=1) >= nvv)
    if (bad & keep).any(): _log('degenerate', key, int((bad & keep).sum()))
    keep &= ~bad
    idx, slot, cls, part = idx[keep], slot[keep], cls[keep], part[keep]
    uvv = G['uv']
    tile = np.floor(uvv[idx, 0].mean(axis=1)).astype(int)
    table = V['layers']
    lay = np.zeros(len(idx), int)
    for k in np.unique(slot):
        mk = slot == k
        lay[mk] = (k - 100) if k >= 100 else max(0, table[k] if k < len(table) and table[k] is not None else 0)
    if kind == 'opaque': lay = lay + np.maximum(tile, 0)
    rb = sname != 'peds24'
    fab = (cls == 1) & ((part < 10) if rb else ((part >= 1) & (part <= 2)))
    nv, nf = len(G['position']), len(idx)
    if nf == 0: return None   # BX-FIN: every face dropped (a props-only part the walker does not carry): custom normals on a faceless mesh segfault Blender 4.5
    me = bpy.data.meshes.new(key)
    me.vertices.add(nv); me.vertices.foreach_set('co', G['position'].astype(np.float32).ravel())
    me.loops.add(nf * 3); me.loops.foreach_set('vertex_index', idx.astype(np.int32).ravel())
    me.polygons.add(nf); me.polygons.foreach_set('loop_start', np.arange(0, nf * 3, 3, dtype=np.int32))
    me.update(calc_edges=True)
    # UVs: the face's UDIM tile folded (it selects the next layer), rows top-down -> Blender's bottom-up
    uvl = me.uv_layers.new(name='UVMap')
    luv = uvv[idx].astype(np.float32).copy()           # (nf, 3, 2)
    luv[..., 0] -= np.maximum(tile, 0)[:, None] if kind == 'opaque' else np.floor(luv[..., 0])
    luv[..., 1] = 1.0 - luv[..., 1]
    uvl.data.foreach_set('uv', luv.ravel())
    me.polygons.foreach_set('use_smooth', np.ones(nf, bool))
    Nv = G['normal'].astype(np.float32)
    if len(Nv) == nv and np.isfinite(Nv).all():   # BX-FIN: only a complete, finite normal set (a bad one crashes inside Blender)
        try: me.normals_split_custom_set_from_vertices(Nv.tolist())
        except Exception as e: _log('normals', key, e)
    at = me.attributes.new('nyc_part', 'FLOAT', 'POINT'); at.data.foreach_set('value', meta_[:, 2].astype(np.float32))
    # materials per (layer, class, fabric)
    keys = sorted({(int(a), int(c), bool(f)) for a, c, f in zip(lay, cls, fab)})
    km = {k: i for i, k in enumerate(keys)}
    for (L, c, f) in keys:
        me.materials.append(_material(usd_dir, sname, L, 'hair' if kind == 'hair' else 'opaque', c if kind != 'hair' else 3, f, night, sss))
    me.polygons.foreach_set('material_index', np.array([km[(int(a), int(c), bool(f))] for a, c, f in zip(lay, cls, fab)], np.int32))
    me['nyc_body'] = bn; me['nyc_lod'] = li
    _STATE.setdefault('geo', {})[key] = G
    return me


def _vgroups(ob, G, bones):
    """vertex groups from the 4 skin influences, one call per (bone, weight level): weights quantised to 1/1024. The
    weights live in the mesh: an object sharing a mesh that has them only needs the group names in the same order."""
    order = ob.data.get('nyc_vg_order')
    if order is not None:
        for bb in order: ob.vertex_groups.new(name=bones[bb])
        return 0
    ji = np.rint(G['skinIndex']).astype(np.int64); jw = G['skinWeight'].astype(np.float64)
    jw = jw / np.maximum(jw.sum(axis=1, keepdims=True), 1e-8)
    nv = len(ji)
    v = np.repeat(np.arange(nv), 4); b = ji.ravel(); w = np.rint(jw.ravel() * 1024).astype(np.int64)
    m = w > 0
    v, b, w = v[m], b[m], w[m]
    order = np.lexsort((w, b)); v, b, w = v[order], b[order], w[order]
    key = b * 2048 + w
    cuts = np.nonzero(np.diff(key))[0] + 1
    starts = np.concatenate([[0], cuts]); ends = np.concatenate([cuts, [len(key)]])
    vgs = {}
    for s, e in zip(starts, ends):
        bb = int(b[s])
        vg = vgs.get(bb)
        if vg is None: vg = vgs[bb] = ob.vertex_groups.new(name=bones[bb])
        vg.add(v[s:e].tolist(), float(w[s]) / 1024.0, 'REPLACE')
    ob.data['nyc_vg_order'] = sorted(vgs, key=lambda x: vgs[x].index)   # bone indices in group order
    return len(starts)


# ---------------------------------------------------------------- keyframes
def _fc_fill(act, path, idx, frames, vals, interp=1):
    fc = act.fcurves.find(path, index=idx)
    if fc is None: return
    kp = fc.keyframe_points
    if len(kp): kp.clear()
    kp.add(len(frames))
    co = np.empty(len(frames) * 2, np.float32); co[0::2] = frames; co[1::2] = vals
    kp.foreach_set('co', co)
    kp.foreach_set('interpolation', [interp] * len(frames))
    fc.update()

def _channelbag(ob, name):
    """a new action with one slot for ob (Blender 4.4+ slotted actions), assigned; -> its channelbag. No keyframe_insert:
    each of those does scene-level work (it was 24 s for 261 walkers alone, ~200 s inside the imported city)."""
    act = bpy.data.actions.new(name)
    slot = act.slots.new(id_type='OBJECT', name=ob.name)
    ad = ob.animation_data_create(); ad.action = act; ad.action_slot = slot
    return act.layers.new('L').strips.new(type='KEYFRAME').channelbag(slot, ensure=True)

def _curve(cb, path, idx, frames, vals, interp=1):
    fc = cb.fcurves.new(path, index=idx)
    kp = fc.keyframe_points
    kp.add(len(frames))
    co = np.empty(len(frames) * 2, np.float32); co[0::2] = frames; co[1::2] = vals
    kp.foreach_set('co', co)
    kp.foreach_set('interpolation', [interp] * len(frames))
    return fc   # (no fc.update(): linear / constant keys written in frame order need no handle pass)


def _quat_wxyz(R):
    """(..., 3, 3) -> (..., 4) w, x, y, z"""
    t = R[..., 0, 0] + R[..., 1, 1] + R[..., 2, 2]
    q = np.zeros(R.shape[:-2] + (4,))
    w = np.sqrt(np.maximum(0, 1 + t)) / 2; x = np.sqrt(np.maximum(0, 1 + R[..., 0, 0] - R[..., 1, 1] - R[..., 2, 2])) / 2
    y = np.sqrt(np.maximum(0, 1 - R[..., 0, 0] + R[..., 1, 1] - R[..., 2, 2])) / 2; z = np.sqrt(np.maximum(0, 1 - R[..., 0, 0] - R[..., 1, 1] + R[..., 2, 2])) / 2
    x = np.copysign(x, R[..., 2, 1] - R[..., 1, 2]); y = np.copysign(y, R[..., 0, 2] - R[..., 2, 0]); z = np.copysign(z, R[..., 1, 0] - R[..., 0, 1])
    q[..., 0], q[..., 1], q[..., 2], q[..., 3] = w, x, y, z
    return q / np.linalg.norm(q, axis=-1, keepdims=True)

def _q_to_m(q):   # (..., 4) xyzw -> (..., 3, 3)
    x, y, z, w = q[..., 0], q[..., 1], q[..., 2], q[..., 3]
    R = np.empty(q.shape[:-1] + (3, 3))
    R[..., 0, 0] = 1 - 2 * (y * y + z * z); R[..., 0, 1] = 2 * (x * y - z * w); R[..., 0, 2] = 2 * (x * z + y * w)
    R[..., 1, 0] = 2 * (x * y + z * w); R[..., 1, 1] = 1 - 2 * (x * x + z * z); R[..., 1, 2] = 2 * (y * z - x * w)
    R[..., 2, 0] = 2 * (x * z - y * w); R[..., 2, 1] = 2 * (y * z + x * w); R[..., 2, 2] = 1 - 2 * (x * x + y * y)
    return R

def _continuous(q):   # quaternion sign flips removed along the frames (axis -2 = frames)
    for f in range(1, q.shape[0]):
        d = (q[f] * q[f - 1]).sum(axis=-1)
        q[f][d < 0] *= -1
    return q


def after_import(ctx):
    opt = ctx['opt']
    if opt('nopeds') is not None: return None
    t0 = time.time()
    sc = ctx['sc']; root = ctx['root'] or {}
    shot = ctx.get('shot') or root.get('shot')
    npz = os.path.join(ctx['usd_dir'], f'peds_{shot}.npz')
    if not os.path.exists(npz): _log('no', npz); return None
    with np.load(npz) as Z: D = {k: Z[k] for k in Z.files}   # once: an NpzFile re-reads an array from the archive on every access
    meta = json.loads(bytes(D['meta']).decode())
    H = meta['harvest']
    A = json.load(open(os.path.join(H, 'peds', 'assets.json')))
    nF = int(meta['frames'])
    take = bool(ctx.get('take'))
    f0 = int(ctx.get('frame') or 0)
    frames = list(range(nF)) if take else sorted({f for f in (f0 - 1, f0, f0 + 1) if 0 <= f < nF})
    present, fade = D['present'], D['fade'].astype(np.float32)
    show = present & (fade < 0.5)
    W = len(D['w_id'])
    # walkers in view at any of the frames, and the shadow casters out of view within --pedsshadow m of the lens
    vis = D['vis']
    rsh = float(opt('pedsshadow', '30'))
    try:
        cams = json.load(open(os.path.join(H, f'cam_{shot}.json')))
        cp = np.array([[c['m'][12], c['m'][13], c['m'][14]] for c in cams])
    except Exception: cp = None
    def near(k):
        if cp is None: return True
        P = D['M'][k][frames][:, 12:15]
        return bool((np.linalg.norm(P - cp[frames], axis=1) < rsh).any())
    sel = [k for k in range(W) if show[k, frames].any() and (vis[k, frames].any() or near(k))]
    # PIPEFIX (2026-10-05): the same rule per frame. A walker of the take's set that is out of view and further than
    # --pedsshadow from the lens for --pedskeep frames either side (4) is hidden at that frame (hide_render keyed with the
    # walker's own presence), so Cycles leaves it out of that frame's sync (its skinned mesh, attributes and BVH; the
    # walkers were 3.8 s of t7StreetGlide's 6.8 s sync per frame, 41 % of their walker-frames are culled, the frame
    # 14.0 -> 13.0 s). --pedskeep -1: every walker of the set at every frame, as before.
    pk = int(opt('pedskeep', '4'))
    keepd = None
    if pk >= 0 and cp is not None:
        nn = min(nF, len(cp))
        kp = vis[:, :nn].copy()
        kp |= np.linalg.norm(D['M'][:, :nn, 12:15] - cp[None, :nn], axis=2) < rsh
        keepd = kp.copy()
        for d_ in range(1, pk + 1):
            keepd[:, d_:] |= kp[:, :-d_]; keepd[:, :-d_] |= kp[:, d_:]
        if nn < nF: keepd = np.concatenate([keepd, np.ones((W, nF - nn), bool)], axis=1)
    pmax = int(opt('pedsmax', '0') or 0)
    if pmax and len(sel) > pmax:   # nearest first
        cam = sc.camera
        sel = sorted(sel, key=lambda k: float(np.linalg.norm(D['M'][k, f0, 12:15])))[:pmax]
    try: LS = json.load(open(os.path.join(H, 'light_static.json'))); night = float(LS.get('night') or 0)
    except Exception: night = 1.0 if str(root.get('time')) == 'night' else 0.55 if str(root.get('time')) == 'dusk' else 0.0
    sss = float(opt('pedssss', '0.006'))
    forced = opt('pedslod')
    world = bpy.data.objects.get('World')
    coll = bpy.data.collections.get('bx_peds') or bpy.data.collections.new('bx_peds')
    if coll.name not in sc.collection.children: sc.collection.children.link(coll)
    bodies = meta['bodies']; skel = meta['skel']
    T = {'walkers': len(sel), 'frames': len(frames)}
    ngroups = 0
    fr = np.array(frames, np.float32)
    rest_cache = {}
    # the armatures of every body the walkers use, in one edit session
    t1 = time.time()
    need = {}
    for k in sel:
        bn = bodies[int(D['w_body'][k])]
        if bn not in need: need[bn] = (A['bodies'][bn], skel[A['bodies'][bn]['skeleton']])
    ARM = _armatures(need, coll)
    T['armatures_s'] = round(time.time() - t1, 1)
    # pass 1: the armature objects (a new armature object has no pose until the depsgraph builds it: one update for all)
    made = []
    for k in sel:
        bn = bodies[int(D['w_body'][k])]; vi = int(D['w_var'][k]); pm = int(D['w_pm'][k])
        li = int(forced) if forced is not None else int(D['w_lod'][k])
        B = A['bodies'][bn]; S = skel[B['skeleton']]
        arm = ARM[bn]
        wid = f'{int(D["w_id"][k]):08x}_{vi}'
        ao = bpy.data.objects.new('pedA_' + wid, arm)
        coll.objects.link(ao)
        if world is not None: ao.parent = world
        ao.rotation_mode = 'QUATERNION'
        ao['nyc_seed'] = int(D['w_id'][k]); ao['nyc_variant'] = vi; ao['nyc_body'] = bn; ao['nyc_lod'] = li
        made.append((k, bn, vi, pm, li, B, S, wid, ao))
    t1 = time.time()
    bpy.context.view_layer.update()
    T['pose_build_s'] = round(time.time() - t1, 1)
    # pass 2: keyframes, meshes
    tk = tm = tv = 0.0
    nhid_cull = 0
    for (k, bn, vi, pm, li, B, S, wid, ao) in made:
        nb = len(S['bones'])
        t2 = time.time()
        # the instance matrix (three's column-major) per frame: location, rotation, uniform scale
        M = D['M'][k][frames].reshape(len(frames), 4, 4).transpose(0, 2, 1).astype(np.float64)
        sc_ = np.linalg.norm(M[:, :3, 0], axis=1)
        R = M[:, :3, :3] / sc_[:, None, None]
        q = _continuous(_quat_wxyz(R))
        # pose basis per bone: inverse(rest local) x local; rest local = bind(parent)^-1 x bind
        if bn not in rest_cache:
            bind = _bind(B); par = S['parents']
            rl = np.empty_like(bind)
            for b, p in enumerate(par): rl[b] = bind[b] if p < 0 else np.linalg.inv(bind[p]) @ bind[b]
            rest_cache[bn] = np.linalg.inv(rl)
        rinv = rest_cache[bn]
        Lq = D['Lq'][k][frames][:, :nb].astype(np.float64); Lt = D['Lt'][k][frames][:, :nb].astype(np.float64)
        L = np.zeros((len(frames), nb, 4, 4)); L[..., :3, :3] = _q_to_m(Lq); L[..., :3, 3] = Lt; L[..., 3, 3] = 1
        Bm = rinv[None] @ L
        bq = _continuous(_quat_wxyz(Bm[..., :3, :3])); bt = Bm[..., :3, 3]
        # curves: the object transform, every bone's rotation and location (pose bones rotate in quaternions by default)
        cb = _channelbag(ao, 'pedA_' + wid)
        for d in range(3): _curve(cb, 'location', d, fr, M[:, d, 3])
        for d in range(4): _curve(cb, 'rotation_quaternion', d, fr, q[:, d])
        for d in range(3): _curve(cb, 'scale', d, fr, sc_)
        pbs = ao.pose.bones
        for b, name in enumerate(S['bones']):
            # a channel that does not change over the frames is set, not keyed (every bone's location but the hips')
            if np.ptp(bq[:, b, :], axis=0).max() < 1e-6: pbs[name].rotation_quaternion = bq[0, b].tolist()
            else:
                for d in range(4): _curve(cb, f'pose.bones["{name}"].rotation_quaternion', d, fr, bq[:, b, d])
            if np.ptp(bt[:, b, :], axis=0).max() < 1e-6: pbs[name].location = bt[0, b].tolist()
            else:
                for d in range(3): _curve(cb, f'pose.bones["{name}"].location', d, fr, bt[:, b, d])
        hid = (~(show[k, frames] & keepd[k, frames]) if keepd is not None else ~show[k, frames]).astype(np.float32)
        nhid_cull += int((show[k, frames] & ~(keepd[k, frames] if keepd is not None else show[k, frames])).sum())
        tint = D['w_tint'][k]
        tk += time.time() - t2
        for kind in ('opaque', 'hair'):
            t3 = time.time()
            me = _mesh(H, ctx['usd_dir'], A, meta, bn, li, kind, vi, pm, night, sss)
            tm += time.time() - t3
            if me is None: continue
            mo = bpy.data.objects.new(('ped_' if kind == 'opaque' else 'pedH_') + wid, me)
            coll.objects.link(mo)
            mo.parent = ao
            for j in range(3): mo[f'nyc_t{j + 1}'] = [float(x) for x in tint[j * 4:j * 4 + 4]]
            t3 = time.time(); ngroups += _vgroups(mo, _STATE['geo'][me.name], S['bones']); tv += time.time() - t3
            md = mo.modifiers.new('arm', 'ARMATURE'); md.object = ao; md.use_vertex_groups = True; md.use_deform_preserve_volume = False
            if hid.any():
                mo.hide_render = bool(hid[0])
                _curve(_channelbag(mo, mo.name), 'hide_render', 0, fr, hid, interp=0)
            if kind == 'hair': mo.visible_shadow = True
    T['culled_walker_frames'] = nhid_cull; T['walker_frames'] = int(sum(int(show[k, frames].sum()) for k in sel))
    T['keys_s'] = round(tk, 1); T['mesh_s'] = round(tm, 1); T['vgroups_s'] = round(tv, 1)
    T['meshes'] = len([m for m in bpy.data.meshes if m.name.startswith('ped_')])
    T['materials'] = len([m for m in bpy.data.materials if m.name.startswith('ped_')])
    T['vgroup_calls'] = ngroups
    T['secs'] = round(time.time() - t0, 1)
    ctx['T']['peds'] = T
    sc.frame_set(sc.frame_current)
    _log(json.dumps(T))
    return T


# ---------------------------------------------------------------- the check: Blender's deformed walkers against the web's
def web_skin(H, A, meta, shot, f, seed, vi, li, kind, pm):
    """the walker's mesh as the web skins it at frame f (three world, metres): M x sum_k w_k S_jk x v, from the harvest's
    own pose rows (peds/<shot>/f<fff>.bin) and the body's LOD geometry; the props it does not carry dropped."""
    hw = int(meta.get('hw', 48))
    buf = np.fromfile(os.path.join(H, 'peds', shot, f'f{f:03d}.bin'), dtype=np.float32)
    o = 0
    while o + hw <= len(buf):
        h = buf[o:o + hw]; nb = int(h[42])
        if int(np.float32(h[1]).view(np.uint32)) == seed and int(h[2]) == vi:
            S = buf[o + hw:o + hw + nb * 12].reshape(nb, 3, 4).astype(np.float64)
            M = h[8:24].reshape(4, 4).T.astype(np.float64)
            bn = meta['variants'][vi]['body']
            G = _load_geo(H, A['bodies'][bn]['lods'][li][kind])
            ji = np.rint(G['skinIndex']).astype(int); jw = G['skinWeight'].astype(np.float64); jw /= np.maximum(jw.sum(1, keepdims=True), 1e-8)
            p = np.c_[G['position'].astype(np.float64), np.ones(len(G['position']))]
            out = np.zeros((len(p), 3))
            for k in range(4): out += jw[:, k:k + 1] * np.einsum('nij,nj->ni', S[ji[:, k]], p)
            out = (M @ np.c_[out, np.ones(len(out))].T).T[:, :3]
            return out
        o += hw + nb * 12
    return None

def check(ctx, frames=None, n=12):
    """max / mean distance (mm) between Blender's evaluated walker meshes and the web's skinning, per frame"""
    sc = ctx['sc']; root = ctx['root'] or {}; shot = ctx.get('shot') or root.get('shot')
    with np.load(os.path.join(ctx['usd_dir'], f'peds_{shot}.npz')) as Z: D = {k: Z[k] for k in Z.files}
    meta = json.loads(bytes(D['meta']).decode())
    H = meta['harvest']; A = json.load(open(os.path.join(H, 'peds', 'assets.json')))
    world = bpy.data.objects.get('World')
    Winv = np.array(world.matrix_world.inverted()) if world else np.eye(4)
    res = []
    for f in (frames or [int(ctx.get('frame') or 0)]):
        sc.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        errs = []
        for ao in [o for o in bpy.data.collections['bx_peds'].objects if o.type == 'ARMATURE'][:n * 3]:
            seed, vi, li = int(ao['nyc_seed']), int(ao['nyc_variant']), int(ao['nyc_lod'])
            mo = next((c for c in ao.children if c.name.startswith('ped_')), None)
            if mo is None: continue
            pm = int(mo.data.name.rsplit('_', 1)[1])
            ref = web_skin(H, A, meta, shot, f, seed, vi, li, 'opaque', 0xffff)
            if ref is None: continue
            oe = mo.evaluated_get(dg); me = oe.to_mesh()
            co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3).astype(np.float64)
            mw = np.array(oe.matrix_world)
            oe.to_mesh_clear()
            wco = (Winv @ mw @ np.c_[co, np.ones(len(co))].T).T[:, :3]
            if len(wco) != len(ref): continue
            d = np.linalg.norm(wco - ref, axis=1) * 1000
            errs.append((float(d.max()), float(d.mean())))
            if len(errs) >= n: break
        res.append({'frame': f, 'walkers': len(errs), 'max_mm': round(max([e[0] for e in errs], default=-1), 3), 'mean_mm': round(float(np.mean([e[1] for e in errs])) if errs else -1, 3)})
    _log('CHECK ' + json.dumps(res))
    return res


def done(ctx):
    if ctx['opt']('pedscheck') is not None and bpy.data.collections.get('bx_peds'):
        ctx['T'].setdefault('peds', {})['check'] = check(ctx, [int(v) for v in ctx['opt']('pedscheck').split(',')] if ctx['opt']('pedscheck') not in (None, '1') else None)
