# BX-FIN (AR34 BX, 2026-10-03): the fleet's wheels turn and steer in a Cycles take, as fleet24.js turns them in its vertex
# shader (src/sim/fleet24.js f24Wheel: about +X through the hub by the spin, the front pair 1-2 about +Y by the steer).
# BX-SEQ's takes instance each car's parts through one shared prototype collection per kind (blender_moving.py: one
# Empty per car), so the wheels cannot turn inside the prototype. For every car that comes within --wheelr m (60) of
# the lens during the take:
#   - the wheel faces of its prototype meshes (the harvest's per-vertex `_wheel`, 1..4 FL FR RL RR, 5..8 more axles;
#     harvests from 2026-10-03 14:30 on carry it) are hidden for that car only: a point attribute bx_hidewheel on the
#     shared mesh x the Empty's own property bx_wheelrig, mixed to a Transparent BSDF at the material output;
#   - each wheel is a child object of the car's Empty (the wheel's faces re-centred on its hub, the same materials), its
#     rotation keyed every frame: X = the spin, Y = the steer (front pair). The spin is integrated from the car's own
#     travel along its forward axis over the wheel's radius (the fleet's spin is only computed where it drew the car);
#     the steer from the yaw rate over the travel and the wheelbase, clamped to 0.6 rad and smoothed.
# Cars farther than --wheelr keep their rigid wheels. --nowheels: off. Hook: blender_render.py HOOKS ('blender_wheels',
# after blender_nodes so the transparency is added to the final materials). Prints BX-WHEELS {...}.
import bpy, json, math, os, time
import numpy as np
import mathutils


def _log(*a): print('[bx-wheels]', *a, flush=True)


def _geo(H, g, names):
    raw = np.fromfile(os.path.join(H, g['file']), dtype=np.uint8)
    out = {}
    for L in g['layout']:
        if L['name'] not in names: continue
        dt = np.float32 if L['type'] == 'f32' else np.uint32
        n = L['count'] * L['itemSize']
        a = raw[L['offset']:L['offset'] + n * 4].view(dt)
        out[L['name']] = a.reshape(-1, L['itemSize']) if L['itemSize'] > 1 else a
    return out


def _hide_mix(mat):
    """the material's surface x (1 - bx_hidewheel (mesh) x bx_wheelrig (the instancing Empty)) over a Transparent BSDF."""
    if not mat or not mat.use_nodes or mat.get('bx_wheelmix'): return False
    nt = mat.node_tree
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None) or next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if out is None or not out.inputs['Surface'].is_linked: return False
    src = out.inputs['Surface'].links[0].from_socket
    a1 = nt.nodes.new('ShaderNodeAttribute'); a1.attribute_type = 'GEOMETRY'; a1.attribute_name = 'bx_hidewheel'
    a2 = nt.nodes.new('ShaderNodeAttribute'); a2.attribute_type = 'INSTANCER'; a2.attribute_name = 'bx_wheelrig'
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(a1.outputs['Fac'], mul.inputs[0]); nt.links.new(a2.outputs['Fac'], mul.inputs[1])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.5
    nt.links.new(mul.outputs[0], gt.inputs[0])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(gt.outputs[0], mx.inputs['Fac']); nt.links.new(src, mx.inputs[1]); nt.links.new(tr.outputs['BSDF'], mx.inputs[2])
    nt.links.new(mx.outputs['Shader'], out.inputs['Surface'])
    mat['bx_wheelmix'] = 1
    return True


def _split(me, W, P):
    """the wheel meshes of prototype mesh me: {w: (mesh, hub (model space), radius)}; me gets bx_hidewheel."""
    nv = len(me.vertices)
    np_ = len(me.polygons)
    ls = np.empty(np_, np.int32); me.polygons.foreach_get('loop_start', ls)
    lt = np.empty(np_, np.int32); me.polygons.foreach_get('loop_total', lt)
    lv = np.empty(len(me.loops), np.int32); me.loops.foreach_get('vertex_index', lv)
    mi = np.empty(np_, np.int32); me.polygons.foreach_get('material_index', mi)
    uvl = me.uv_layers.active
    uv = None
    if uvl is not None:
        uv = np.empty(len(me.loops) * 2, np.float32); uvl.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    out = {}
    W = np.asarray(W)
    pw = W[lv[ls]] if np_ else np.zeros(0, int)   # a face's wheel: its first corner's
    tri = bool(np_) and bool((lt == 3).all())
    def corners(polys):
        if tri: return (ls[polys][:, None] + np.arange(3)[None, :]).ravel()
        return np.concatenate([np.arange(ls[i], ls[i] + lt[i]) for i in polys])
    for w in sorted(set(int(x) for x in np.unique(W) if x > 0)):
        polys = np.nonzero(pw == w)[0]
        if not len(polys): continue
        cidx = corners(polys)
        vs = np.unique(lv[cidx])
        lo, hi = co[vs].min(axis=0), co[vs].max(axis=0)
        hub = (lo + hi) / 2.0
        rad = float(hi[1] - lo[1]) / 2.0
        remap = -np.ones(nv, np.int64); remap[vs] = np.arange(len(vs))
        wm = bpy.data.meshes.new(f'bxwheel_{me.name}_{w}')
        wm.vertices.add(len(vs)); wm.vertices.foreach_set('co', (co[vs] - hub).astype(np.float32).ravel())
        loops = lv[cidx]
        wm.loops.add(len(loops)); wm.loops.foreach_set('vertex_index', remap[loops].astype(np.int32))
        wm.polygons.add(len(polys))
        wm.polygons.foreach_set('loop_start', np.concatenate([[0], np.cumsum(lt[polys])[:-1]]).astype(np.int32))
        wm.polygons.foreach_set('material_index', mi[polys].astype(np.int32))
        wm.update(calc_edges=True)
        if uv is not None:
            wl = wm.uv_layers.new(name=uvl.name)
            wl.data.foreach_set('uv', uv[cidx].ravel())
        wm.polygons.foreach_set('use_smooth', np.ones(len(polys), bool))
        for m in me.materials: wm.materials.append(m)
        out[w] = (wm, hub, max(rad, 0.15))
    at = me.attributes.get('bx_hidewheel') or me.attributes.new('bx_hidewheel', 'FLOAT', 'POINT')
    at.data.foreach_set('value', (np.asarray(W[:nv]) > 0).astype(np.float32))
    return out


def _series(car, nF, f0s, r, wb):
    """spin and steer per take frame for a car record (frames f0..f1 of the take; held outside)."""
    m = np.asarray(car['m'], np.float64).reshape(-1, 12)
    f0 = int(car['f0'])
    n = len(m)
    p = m[:, 9:12]; zf = m[:, 6:9] / np.maximum(np.linalg.norm(m[:, 6:9], axis=1, keepdims=True), 1e-9)
    xf = m[:, 0:3] / np.maximum(np.linalg.norm(m[:, 0:3], axis=1, keepdims=True), 1e-9)
    d = np.zeros(n); d[1:] = np.einsum('ij,ij->i', p[1:] - p[:-1], zf[1:])
    spin = float(car['spin'][0]) + np.cumsum(d) / r
    yaw = np.arctan2(zf[:, 0], zf[:, 2])
    dy = np.zeros(n); dy[1:] = (yaw[1:] - yaw[:-1] + np.pi) % (2 * np.pi) - np.pi
    steer = np.where(np.abs(d) > 1e-3, np.arctan2(wb * dy, np.where(np.abs(d) > 1e-3, d, 1.0)), 0.0)
    steer = np.clip(steer, -0.6, 0.6)
    if n >= 5: steer = np.convolve(np.pad(steer, 2, mode='edge'), np.ones(5) / 5, mode='valid')
    S = np.empty(nF); T = np.empty(nF)
    for k in range(nF):
        j = min(max(k + f0s - f0, 0), n - 1)
        S[k] = spin[j]; T[k] = steer[j]
    return S, T, p


def _key(ob, path, idx, f0, vals, interp=1):
    if ob.animation_data is None or ob.animation_data.action is None:
        ob.keyframe_insert(path, index=idx, frame=f0)
    fc = ob.animation_data.action.fcurves.find(path, index=max(idx, 0))   # idx -1: a non-array property (its curve is index 0)
    if fc is None:
        ob.keyframe_insert(path, index=idx, frame=f0); fc = ob.animation_data.action.fcurves.find(path, index=max(idx, 0))
    kp = fc.keyframe_points; kp.clear(); kp.add(len(vals))
    co = []
    for k, v in enumerate(vals): co += [f0 + k, float(v)]
    kp.foreach_set('co', co); kp.foreach_set('interpolation', [interp] * len(vals)); fc.update()


def after_import(ctx):
    opt = ctx['opt']
    if opt('nowheels') is not None: return None
    root = ctx.get('root') or {}
    if not root.get('take'): return None
    t0 = time.time()
    H = opt('harvest') or root.get('harvest')
    shot = ctx.get('shot') or root.get('shot')
    mv = bpy.data.collections.get('bx_moving')
    if not H or not mv or not os.path.exists(os.path.join(H, f'mov_{shot}.json')): return None
    man = json.load(open(os.path.join(H, 'manifest.json')))
    wgeo = [g for g in man['geos'] if any(L['name'] == '_wheel' for L in g['layout'])]
    T = {'harvest_wheel_geos': len(wgeo)}
    if not wgeo:
        T['note'] = 'harvest has no _wheel (before 2026-10-03 14:30): rigid wheels'
        ctx['T']['wheels'] = T; _log(json.dumps(T)); return T
    byn = {}
    for g in wgeo:
        n = next(L['count'] for L in g['layout'] if L['name'] == 'position')
        byn.setdefault(n, []).append(g)
    M = json.load(open(os.path.join(H, f'mov_{shot}.json')))
    cars = {c['id']: c for c in M.get('cars', [])}
    try:
        cams = json.load(open(os.path.join(H, f'cam_{shot}.json'))); cp = np.array([[c['m'][12], c['m'][13], c['m'][14]] for c in cams])
    except Exception: cp = None
    R = float(opt('wheelr', '60'))
    sc = ctx['sc']; f0s = int(sc.frame_start); nF = int(sc.frame_end) - f0s + 1
    # the prototype meshes with wheels (matched to the harvest blob by vertex count and bounds), split once per mesh
    tmpl = {}   # collection name -> [(prototype object, {w: (mesh, hub, radius)})]
    gcache = {}
    for e in mv.objects:
        cl = e.instance_collection
        if cl is None or cl.name in tmpl: continue
        lst = []
        for po in cl.all_objects:
            if po.type != 'MESH': continue
            me = po.data; nv = len(me.vertices)
            cands = byn.get(nv)
            if not cands: continue
            co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
            lo, hi = co.min(axis=0), co.max(axis=0)
            for g in cands:
                if g['id'] not in gcache: gcache[g['id']] = _geo(H, g, ('position', '_wheel'))
                G = gcache[g['id']]
                if np.allclose(G['position'].min(axis=0), lo, atol=2e-3) and np.allclose(G['position'].max(axis=0), hi, atol=2e-3):
                    W = np.rint(G['_wheel']).astype(int)
                    if W.max() > 0:
                        ws = me.get('bx_wheels_done') and tmpl.get('__mesh_' + me.name)
                        ws = ws or _split(me, W, G['position'])
                        tmpl['__mesh_' + me.name] = ws; me['bx_wheels_done'] = 1
                        for m in me.materials: _hide_mix(m)
                        lst.append((po, ws))
                    break
        tmpl[cl.name] = lst
    coll = bpy.data.collections.get('bx_wheels') or bpy.data.collections.new('bx_wheels')
    if coll.name not in sc.collection.children: sc.collection.children.link(coll)
    nrig = nw = 0; nmov = 0
    for e in list(mv.objects):
        cl = e.instance_collection
        if cl is None or not tmpl.get(cl.name): continue
        car = cars.get(str(e.get('nyc_id')))
        if car is None: continue
        hubs = [(po, w, wm, hub, r) for po, ws in tmpl[cl.name] for w, (wm, hub, r) in ws.items()]
        fr = [h for h in hubs if h[1] in (1, 2)]; rr = [h for h in hubs if h[1] in (3, 4)]
        wb = abs(float(np.mean([h[3][2] for h in fr])) - float(np.mean([h[3][2] for h in rr]))) if fr and rr else 2.7
        rad = float(np.median([h[4] for h in hubs]))
        S, St, p = _series(car, nF, f0s, rad, wb)
        if cp is not None:
            k0 = int(car['f0']); idx = [min(max(k - k0, 0), len(p) - 1) for k in range(nF)]
            dmin = float(np.min(np.linalg.norm(p[idx] - cp[:nF], axis=1))) if len(cp) >= nF else 0.0
            if dmin > R: continue
        moving = np.ptp(S) > 1e-4 or np.ptp(St) > 1e-4
        hid_fc = e.animation_data.action.fcurves.find('hide_render') if e.animation_data and e.animation_data.action else None
        hid = [hid_fc.evaluate(f0s + k) for k in range(nF)] if hid_fc else None
        e['bx_wheelrig'] = 1.0
        for (po, w, wm, hub, r) in hubs:
            o = bpy.data.objects.new(f'bxw_{e.name}_{w}', wm)
            coll.objects.link(o)
            o.parent = e; o.matrix_parent_inverse = po.matrix_world.copy()
            o.location = mathutils.Vector((float(hub[0]), float(hub[1]), float(hub[2])))
            o.rotation_mode = 'XYZ'
            for kk in ('nyc_paint', 'nyc_lamp', 'nyc_kind', 'nyc_id'):
                if kk in e.keys(): o[kk] = e[kk]
            st = St if w in (1, 2) else np.zeros(nF)
            if moving:
                _key(o, 'rotation_euler', 0, f0s, S)
                if w in (1, 2): _key(o, 'rotation_euler', 1, f0s, st)
            else:
                o.rotation_euler = (float(S[0]), float(st[0]), 0.0)
            if hid is not None and any(v > 0.5 for v in hid):
                _key(o, 'hide_render', -1, f0s, [1.0 if v > 0.5 else 0.0 for v in hid], interp=0)
            nw += 1
        nrig += 1; nmov += int(moving)
    T.update({'cars_rigged': nrig, 'moving': nmov, 'wheels': nw, 'proto_meshes': sum(len(v) for k, v in tmpl.items() if not k.startswith('__')), 'radius_m': R, 'secs': round(time.time() - t0, 1)})
    ctx['T']['wheels'] = T
    _log('BX-WHEELS ' + json.dumps(T))
    return T
