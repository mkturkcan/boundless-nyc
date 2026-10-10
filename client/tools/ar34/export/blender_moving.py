# BX-SEQ (AR34 BX, 2026-10-02): a take's moving sets in Blender. Called by blender_render.py right after the USD import of
# a shot's take root (<shot>.usda, customLayerData take = True; also by blender_take.py through it).
#
# usd_write.py writes the vehicles and every other moving set (trains ...) as time-sampled PointInstancers under
# /World/Moving with a fixed instance list over the take. Blender's importer reads such an instancer as a point cloud with
# a Mesh Sequence Cache and a geometry-nodes instancer; it does not carry the per-instance primvars (the paint, the lamp
# mask) and its instances have no ids of their own. So each instance becomes an Empty here, instancing the prototype's
# collection (the importer's own), parented to the imported /World (the up-axis turn and the region's recentring), with:
#   - location / rotation_quaternion / scale keyframed every frame (linear): Cycles' object motion blur reads them;
#   - hide_render keyframed (constant) where the instance is on its empty prototype (a car outside its life);
#   - custom properties nyc_id (the harvest's stable id), nyc_kind, nyc_paint (linear rgb: the ':paint' materials read it
#     through an Attribute node of type INSTANCER), nyc_lamp (keyframed, constant: 1 head, 2 tail, 4 brake, 8 left,
#     16 right, 32 siren; for LIGHT's per-car lamps).
# The importer's point clouds of these instancers are removed (their prototype collections stay, instanced by the empties).
# Returns {'instancers', 'empties', 'cars': [empties of vehicles], 'movers': [...], 'secs'}; the empties are in the
# collection 'bx_moving'.
import bpy, json, time


def _fc_set(ob, path, values, nF, f0, interp=1):
    """keyframe ob.<path> (a vector property, or a custom property '["name"]') at frames f0.. with values (nF x dims)."""
    dims = len(values[0]) if hasattr(values[0], '__len__') else 1
    act = ob.animation_data.action
    for d in range(dims):
        fc = act.fcurves.find(path, index=d)
        if fc is None: continue
        kp = fc.keyframe_points
        if len(kp): kp.clear()
        kp.add(nF)
        co = []
        for f in range(nF): co += [f0 + f, float(values[f][d] if dims > 1 else values[f])]
        kp.foreach_set('co', co)
        kp.foreach_set('interpolation', [interp] * nF)
        fc.update()


def build(sc, usd_path, root=None, T=None, opt=None):
    from pxr import Usd, UsdGeom
    t0 = time.time()
    st = Usd.Stage.Open(usd_path)
    mv = st.GetPrimAtPath('/World/Moving')
    if not mv or not mv.IsValid(): return None
    f_lo, f_hi = int(st.GetStartTimeCode()), int(st.GetEndTimeCode())
    frames = list(range(f_lo, f_hi + 1)); nF = len(frames)
    world = bpy.data.objects.get('World')
    coll = bpy.data.collections.get('bx_moving') or bpy.data.collections.new('bx_moving')
    if coll.name not in sc.collection.children: sc.collection.children.link(coll)
    out = {'instancers': 0, 'empties': 0, 'cars': [], 'movers': [], 'missing_protos': []}
    removed = 0
    for p in mv.GetChildren():
        if not p.IsA(UsdGeom.PointInstancer): continue
        pi = UsdGeom.PointInstancer(p)
        targets = pi.GetPrototypesRel().GetTargets()
        colls = []
        for t in targets:
            ob = bpy.data.objects.get(t.name)
            colls.append(ob.users_collection[0] if ob is not None and ob.users_collection else None)
        if not colls or colls[0] is None:
            out['missing_protos'].append(p.GetName()); continue
        # the importer's point cloud of this instancer
        for ob in [o for o in bpy.data.objects if o.type == 'POINTCLOUD' and (o.name == p.GetName() or o.name.startswith(p.GetName() + '.'))]:
            bpy.data.objects.remove(ob, do_unlink=True); removed += 1
        cd = p.GetCustomData() or {}
        ids = json.loads(cd.get('nyc:ids') or '[]')
        kind = cd.get('nyc:kind') or ''
        P = [pi.GetPositionsAttr().Get(f) for f in frames]
        O = [pi.GetOrientationsAttr().Get(f) for f in frames]
        S = [pi.GetScalesAttr().Get(f) for f in frames]
        I = [pi.GetProtoIndicesAttr().Get(f) for f in frames]
        pv = UsdGeom.PrimvarsAPI(p)
        paint = pv.GetPrimvar('nyc_paint').Get() if pv.HasPrimvar('nyc_paint') else None
        lamp = [pv.GetPrimvar('nyc:lampMask').Get(f) for f in frames] if pv.HasPrimvar('nyc:lampMask') else None
        n = len(P[0]) if P and P[0] is not None else 0
        is_veh = p.GetName().startswith('veh_')
        for k in range(n):
            e = bpy.data.objects.new(f'bxc_{p.GetName()}_{k}', None)
            coll.objects.link(e)
            if world is not None: e.parent = world
            e.instance_type = 'COLLECTION'; e.instance_collection = colls[0]
            e.empty_display_size = 0.5
            e.rotation_mode = 'QUATERNION'
            e['nyc_id'] = str(ids[k]) if k < len(ids) else str(k)
            e['nyc_kind'] = kind
            if paint is not None: e['nyc_paint'] = [float(v) for v in paint[k]]
            e['nyc_lamp'] = int(lamp[0][k]) if lamp else 0
            hid = [1.0 if I[f][k] != 0 else 0.0 for f in range(nF)]
            loc = [P[f][k] for f in range(nF)]
            rot = [(O[f][k].GetReal(), *O[f][k].GetImaginary()) for f in range(nF)]
            scl = [S[f][k] for f in range(nF)]
            lam = [int(lamp[f][k]) for f in range(nF)] if lamp else None
            # a still instance (a parked car, a pit) is not animated: an animated object is re-evaluated and re-synced
            # every frame (the take's per-frame sync was 1.7 s with every Empty keyframed)
            still = not any(hid) and all(max(abs(loc[f][d] - loc[0][d]) for d in range(3)) < 1e-4 and max(abs(rot[f][d] - rot[0][d]) for d in range(4)) < 1e-6 and max(abs(scl[f][d] - scl[0][d]) for d in range(3)) < 1e-6 for f in range(nF))
            if still:
                e.location = loc[0]; e.rotation_quaternion = rot[0]; e.scale = scl[0]
                if lam and any(v != lam[0] for v in lam):
                    e.keyframe_insert('["nyc_lamp"]', frame=f_lo); _fc_set(e, '["nyc_lamp"]', lam, nF, f_lo, interp=0)
                out['still'] = out.get('still', 0) + 1
            else:
                for path in ['location', 'rotation_quaternion', 'scale'] + (['hide_render', 'hide_viewport'] if any(hid) else []) + (['["nyc_lamp"]'] if lam else []):
                    e.keyframe_insert(path, frame=f_lo)   # creates the curves (the action and its slot); filled below
                _fc_set(e, 'location', loc, nF, f_lo)
                _fc_set(e, 'rotation_quaternion', rot, nF, f_lo)
                _fc_set(e, 'scale', scl, nF, f_lo)
                if any(hid):
                    _fc_set(e, 'hide_render', hid, nF, f_lo, interp=0)
                    _fc_set(e, 'hide_viewport', hid, nF, f_lo, interp=0)
                if lam: _fc_set(e, '["nyc_lamp"]', lam, nF, f_lo, interp=0)
            (out['cars'] if is_veh else out['movers']).append(e)
            out['empties'] += 1
        out['instancers'] += 1
    # the ':paint' materials read the car's own paint from its Empty
    npaint = 0
    for m in bpy.data.materials:
        if not m.use_nodes or not m.node_tree: continue
        for nd in m.node_tree.nodes:
            if nd.bl_idname == 'ShaderNodeAttribute' and nd.attribute_name == 'nyc_paint':
                nd.attribute_type = 'INSTANCER'; npaint += 1
    out['paint_nodes'] = npaint
    out['pointclouds_removed'] = removed
    out['secs'] = round(time.time() - t0, 1)
    if T is not None: T['moving'] = {k: (len(v) if isinstance(v, list) else v) for k, v in out.items()}
    return out
