# TREEUE (AR34, 2026-10-07): the tree set in a UE take, after ue_mat.py (runs inside the engine from ue_take.py's TREEUE
# block). For a take whose USD carries the second tree set (bxtrees2: usd_trees.py's default since 2026-10-07):
#   - the masters of ue_project/Python/ue_foliage.py (M_bx_foliage, M_bx_foliage_mask, M_bx_bark), built when missing;
#   - every leaf instance (MI_bxt_leaf_<F>*) re-parented to M_bx_foliage_mask (the geometry leaves: the alpha cuts their
#     outline near the lens only; the compound leaves' alpha cards everywhere) or M_bx_foliage (a set.json 'opaque' cut),
#     every bark instance (MI_bxt_bark_<key>*) to M_bx_bark, with their textures and tints from the take's preview
#     surfaces (ue_prep's previews), the leaf tint of ue_families.json's bxt_leaf_ row, the transmission and its tint by
#     the take's night level (TRANS_*, SSS_*: fitted with ue_check.py against the physical Cycles takes), and the wind
#     (WindK from the take: --treewind / BXUE_TREEWIND, 0 freezes it; default 1);
#   - the tree meshes (SM_<F>_<size><variant>_lod<k>) keep Nanite with the foliage shape preservation (PreserveArea: the
#     leaves keep their area as Nanite simplifies them in the distance; the crowns do not thin out);
#   - the tree components evaluate the world position offset and write its velocity (TSR sees the wind);
#   - the render's foliage console variables (FOLIAGE_CVARS) go into the take's Movie Render Queue settings.
# A first-set take (bxtrees: alpha-card leaves, no st1) gets the same masters for its leaves (always cut, no per-leaf
# variation, its own transmission and gain) and bark; its meshes stay as imported.
# Tuning aids (environment): BXUE_TREES_TRANS, BXUE_TREES_PARAMS (k=v or k=r:g:b on the leaf instances),
# BXUE_TREES_NEUTRAL (no variation), BXUE_TREES_KEEPLEAF (ue_mat's leaves).
import json, os, re, time
import unreal

mel = unreal.MaterialEditingLibrary
eal = unreal.EditorAssetLibrary
HERE = os.path.dirname(os.path.abspath(__file__))
SET_DIRS = ('/bxtrees2/',)
FOLIAGE_CVARS = {'r.Lumen.ScreenProbeGather.TwoSidedFoliageBackfaceDiffuse': 1, 'r.Lumen.ScreenProbeGather.ShortRangeAO.FoliageOcclusionStrength': 0.0}


def _row(match):
    try:
        T = json.load(open(os.path.join(HERE, 'ue_families.json')))
        return next((r for r in T.get('assets', []) if r.get('match') == match), None)
    except Exception:
        return None


def _param(row, name, default):
    for p in (row or {}).get('params', []):
        if p[0] == name and not isinstance(p[2], str): return p[2]
    return default


def _gen2(side):
    if (side.get('data') or {}).get('treeue'): return True
    for name, pv in (side.get('previews') or {}).items():
        if name.startswith('bxt_bark_'):
            f = (((pv or {}).get('tex') or {}).get('diffuseColor') or {}).get('file') or ''
            if any(s in f for s in SET_DIRS): return True
    return False


# the leaves' transmission (ue_foliage.py Trans) by the take's night level (the harvest's light_static.json, as ue_light.py):
# by day a crown's shade is sky light through leaf after leaf, which UE's one subsurface term under-lights (TRANS_DAY, fitted
# with ue_check.py against the physical Cycles take of t7ArchTrack); at night the street lamps light the crowns directly and
# the same term over-lights them (TRANS_NIGHT, fitted on t7DinoGlide); dusk between
TRANS_DAY, TRANS_NIGHT = 3.5, 1.5
SSS_DAY, SSS_NIGHT = (2.0, 1.6, 0.35), (1.6, 2.0, 0.4)   # (the subsurface tint: day the master's default; night greener)
# the first set (bxtrees: fewer, larger, sky-facing alpha cards, seen mostly from below, so mostly through the blade):
# its own transmission and albedo gain (with the second set's values its crowns read 14 L* over the physical Cycles take;
# fitted on t7ArchTrack's key frames against clips_cycp: 1.0 / 0.95 b* 10.6, 2.0 / 0.7 b* 17.3, 3.0 / 0.5 PASS at L* 29.8 /
# a* -13.4 / b* 22.4 against 21.4 / -11.7 / 23.4; at night 1.3 / 0.5 left the lamp-lit cards glowing (f000) and the
# others near black (f107): night 0.6 / 0.9)
TRANS_DAY_1, TRANS_NIGHT_1, GAIN_DAY_1, GAIN_NIGHT_1 = 3.0, 0.6, 0.5, 0.9
# R5-VEG (UE track, 2026-10-07): the first set at night once the lamps' bounce in Lumen was cut to the path tracer's
# (ue_light LAMP_GI 0.45, round 4) the crowns went a little dark and grey against Cycles physical (t7DinoGlide vegetation
# L* 16.8 / a* -3.3 / b* 11.0 against 18.1 / -5.7 / 16.8): more transmission, a yellower green behind the leaf, gain 1
# (dev run vegA, f000: 21.1 / -6.6 / 15.4 against 16.9 / -5.6 / 16.7)
TRANS_NIGHT_1, GAIN_NIGHT_1, SSS_NIGHT_1 = 0.85, 1.0, (1.7, 2.4, 0.25)
# R6-LEAF (UE track, 2026-10-08): the first set's leaves by the take's night level, piecewise between golden (0.05), dusk
# (0.55) and night (1.0), in place of the day / night pair above. UE's foliage transmission peaks toward the light, where
# Cycles' translucency is even: a crown between the lens and a lamp or a low sun glowed, a crown under a lamp read near
# white (its pale atlas green lit hard, t7DinoGlide f000), crowns lit from above and seen from the side stayed grey, and the
# day's subsurface tint (red over green) turned backlit crowns orange. Per anchor: the albedo tint (x the leaf row's), the
# gain, the transmission and its tint (ue_foliage.py Tint, Gain, Trans, SssTint), fitted with ue_check against the
# physical Cycles takes (t7DinoGlide at night; the trailer's golden and dusk shots)
# (the first set's golden and dusk anchors are the values the pair above gave there: only its night anchor is new)
LEAF6_1 = [(0.05, {'tint': (1.0, 1.0, 1.0), 'gain': 0.525, 'trans': 2.8925, 'sss': (1.985, 1.64, 0.345)}),
           (0.55, {'tint': (1.0, 1.0, 1.0), 'gain': 0.775, 'trans': 1.8175, 'sss': (1.835, 2.04, 0.295)}),
           (1.0, {'tint': (0.9, 1.0, 0.5), 'gain': 1.3, 'trans': 0.25, 'sss': (1.8, 2.0, 0.4)})]
# the second set (the trailer's takes): golden from the trailer's gates against its Cycles previews (crowns a* 5-10 over,
# b* 4-7 under: the crown's colour x about (0.75, 1, 0.6)) and the backlit crowns of tuValleyShafts (their light through
# the leaves x (0.93, 1.47, 0.88); at (1.85, 2.4, 0.3) Morningside's crowns went too green, a* -10.8 against -5.7, so
# between); dusk a little under the old 2.4 transmission (t8StNickDiveE's crowns read L* 30 against 11 while the
# headlamps' cones lit them, R6-GLARE; with the low beams 4.4 at 0.6 / gain 0.6); night with the first set's greener
# albedo (the trailer's t7DinoGlide: the lamp-side crown near white, the crowns away from the lamps grey, as the first
# set's) and less transmission
LEAF6_2 = [(0.05, {'tint': (0.82, 1.0, 0.6), 'gain': 1.1, 'trans': 3.4, 'sss': (1.7, 2.0, 0.33)}),
           (0.55, {'tint': (0.85, 1.0, 0.6), 'gain': 1.0, 'trans': 2.0, 'sss': (1.6, 1.8, 0.4)}),
           (1.0, {'tint': (0.9, 1.0, 0.5), 'gain': 1.1, 'trans': 1.0, 'sss': (1.7, 2.2, 0.35)})]


def leaf6(nl, pts=None):
    """a set's leaf values at night level nl (its anchors, LEAF6_1 by default, linear between them, held past either end)."""
    pts = pts or LEAF6_1
    if nl <= pts[0][0]: return dict(pts[0][1])
    for (a0, v0), (a1, v1) in zip(pts, pts[1:]):
        if nl <= a1:
            t = (nl - a0) / (a1 - a0)
            return {k: (tuple(v0[k][i] + (v1[k][i] - v0[k][i]) * t for i in range(3)) if isinstance(v0[k], tuple) else v0[k] + (v1[k] - v0[k]) * t) for k in v0}
    return dict(pts[-1][1])


def night_level(side):
    data = side.get('data') or {}
    try: LS = json.load(open(os.path.join(data.get('harvest') or '', 'light_static.json')))
    except Exception: LS = {}
    mode = LS.get('mode') or data.get('time') or 'golden'
    try: return float(LS.get('night', 1.0 if mode == 'night' else 0.05) or 0.0)
    except Exception: return 0.0


def wind_k(cfg):
    v = cfg.get('treewind')
    if v is None: v = os.environ.get('BXUE_TREEWIND')
    try: return float(v) if v is not None else 1.0
    except Exception: return 1.0


def apply(side, dest, cfg):
    t0 = time.time()
    gen = 2 if _gen2(side) else 1
    import ue_foliage, importlib
    importlib.reload(ue_foliage)
    out = {'set': gen, 'masters': ue_foliage.ensure(), 'leaf': 0, 'leaf_mask': 0, 'bark': 0, 'meshes': 0, 'components': 0, 'wind': wind_k(cfg)}
    import ue_mat
    tex = ue_mat.Tex(dest)
    prev = side.get('previews') or {}
    try: setj = json.load(open(os.path.join(os.environ.get('BXTREES_ASSETS', '/data0/projectnyc_aux/assets/bxtrees2'), 'set.json')))
    except Exception: setj = {}
    cut = setj.get('leaf_cut') or {}
    lrow = _row('bxt_leaf_')
    tint = _param(lrow, 'Tint', [1.0, 0.92, 0.35]); trans = _param(lrow, 'Trans', 1.0)
    M = {k: eal.load_asset(f'/Game/Bx/M_bx_{k}') for k in ('foliage', 'foliage_mask', 'bark')}
    wk = out['wind']
    nl = night_level(side)
    td, tn = (TRANS_DAY, TRANS_NIGHT) if gen >= 2 else (TRANS_DAY_1, TRANS_NIGHT_1)
    trans_k = float(os.environ.get('BXUE_TREES_TRANS') or (td + (tn - td) * min(1.0, max(0.0, nl))))
    w_ = min(1.0, max(0.0, nl))
    gain_1 = GAIN_DAY_1 + (GAIN_NIGHT_1 - GAIN_DAY_1) * w_
    sss_n = SSS_NIGHT if gen >= 2 else SSS_NIGHT_1   # R5-VEG
    sss_k = [SSS_DAY[i] + (sss_n[i] - SSS_DAY[i]) * w_ for i in range(3)]
    out['night'] = round(nl, 3); out['trans'] = round(trans_k, 3); out['sss_tint'] = [round(x, 3) for x in sss_k]
    L6 = leaf6(nl, LEAF6_1 if gen < 2 else LEAF6_2)   # R6-LEAF (both sets)
    if not os.environ.get('BXUE_TREES_TRANS'): trans_k = L6['trans']
    gain_1, sss_k = L6['gain'], list(L6['sss'])
    tint = [float(tint[i]) * L6['tint'][i] for i in range(3)]
    out['leaf6'] = {k: (round(v, 3) if not isinstance(v, tuple) else [round(x, 3) for x in v]) for k, v in L6.items()}
    out['trans'] = round(trans_k, 3); out['sss_tint'] = [round(x, 3) for x in sss_k]
    tree_mis = set()
    mis = [a for a in eal.list_assets(dest, recursive=True, include_folder=False)
           if eal.find_asset_data(a).asset_class_path.asset_name == 'MaterialInstanceConstant' and '/BxTex/' not in a]
    for ap in mis:
        nm = ap.split('/')[-1].split('.')[0]
        pns = ue_mat.prim_names(eal.load_asset(ap)) or [nm]
        pn = next((p for p in pns if p.startswith(('bxt_leaf_', 'bxt_bark_'))), None)
        if pn is None:
            mm = re.match(r'^MI_(bxt_(?:leaf|bark)_[A-Za-z]+)', nm)
            pn = mm.group(1) if mm else None
        if pn is None: continue
        mi = eal.load_asset(ap)
        pv = prev.get(pn) or {}
        tx = pv.get('tex') or {}
        try:
            if pn.startswith('bxt_leaf_') and os.environ.get('BXUE_TREES_KEEPLEAF'):
                continue   # (a diagnosis aid: the leaves keep ue_mat's M_bx_leaf)
            if pn.startswith('bxt_leaf_'):
                F = pn[len('bxt_leaf_'):]
                masked = gen < 2 or cut.get(F, 'near') != 'opaque' or 'opacity' in tx
                mel.set_material_instance_parent(mi, M['foliage_mask' if masked else 'foliage'])
                mel.clear_all_material_instance_parameters(mi)
                if gen < 2 or cut.get(F, 'near') == 'mask': mel.set_material_instance_scalar_parameter_value(mi, 'NearM', 1e7)   # (cards: always cut)
                if gen < 2:   # (the first set's cards carry no st1: no per-leaf variation, no crown depth)
                    for k_, v_ in (('LeafHue', 0.0), ('LeafVar', 0.0), ('Yellow', 0.0), ('AoIn', 1.0), ('Gain', gain_1)):
                        mel.set_material_instance_scalar_parameter_value(mi, k_, v_)
                t = tex.get((tx.get('diffuseColor') or {}).get('file'), True)
                if t is not None: mel.set_material_instance_texture_parameter_value(mi, 'Tex', t)
                n = tex.get((tx.get('normal') or {}).get('file'), False)
                if n is not None: mel.set_material_instance_texture_parameter_value(mi, 'Nrm', n)
                mel.set_material_instance_vector_parameter_value(mi, 'Tint', unreal.LinearColor(*[float(x) for x in (list(tint) + [0, 0, 0])[:3]], 0.0))
                mel.set_material_instance_scalar_parameter_value(mi, 'Trans', trans_k)
                mel.set_material_instance_vector_parameter_value(mi, 'SssTint', unreal.LinearColor(sss_k[0], sss_k[1], sss_k[2], 0.0))
                mel.set_material_instance_scalar_parameter_value(mi, 'WindK', wk)
                if gen >= 2: mel.set_material_instance_scalar_parameter_value(mi, 'Gain', L6['gain'])   # R6-LEAF
                for kv in (os.environ.get('BXUE_TREES_PARAMS') or '').split(','):   # (a tuning aid: leaf k=v or k=r:g:b,...)
                    if '=' not in kv: continue
                    k_, v_ = kv.split('=', 1)
                    if ':' in v_:
                        r_, g_, b_ = [float(x) for x in v_.split(':')]
                        mel.set_material_instance_vector_parameter_value(mi, k_.strip(), unreal.LinearColor(r_, g_, b_, 0.0))
                    else: mel.set_material_instance_scalar_parameter_value(mi, k_.strip(), float(v_))
                if os.environ.get('BXUE_TREES_NEUTRAL'):   # (a diagnosis aid: no per-tree / per-leaf variation, no crown occlusion)
                    for k_, v_ in (('HueVar', 0.0), ('ValVar', 0.0), ('LeafHue', 0.0), ('LeafVar', 0.0), ('Yellow', 0.0), ('AoIn', 1.0), ('Gain', 1.0)):
                        mel.set_material_instance_scalar_parameter_value(mi, k_, v_)
                out['leaf_mask' if masked else 'leaf'] += 1
            else:
                mel.set_material_instance_parent(mi, M['bark'])
                mel.clear_all_material_instance_parameters(mi)
                dc = tx.get('diffuseColor') or {}
                t = tex.get(dc.get('file'), True)
                if t is not None: mel.set_material_instance_texture_parameter_value(mi, 'Tex', t)
                n = tex.get((tx.get('normal') or {}).get('file'), False)
                if n is not None: mel.set_material_instance_texture_parameter_value(mi, 'Nrm', n)
                r = tex.get((tx.get('roughness') or {}).get('file'), False)
                if r is not None:
                    mel.set_material_instance_texture_parameter_value(mi, 'RoughT', r)
                    mel.set_material_instance_scalar_parameter_value(mi, 'HasRough', 1.0)
                sc = dc.get('scale') or [0.8, 0.8, 0.8]
                mel.set_material_instance_vector_parameter_value(mi, 'Tint', unreal.LinearColor(float(sc[0]), float(sc[1]), float(sc[2]), 0.0))
                mel.set_material_instance_scalar_parameter_value(mi, 'WindK', wk)
                out['bark'] += 1
            # (the importer's own two-sided and blend overrides go: the masters carry them)
            try:
                bo = mi.get_editor_property('base_property_overrides')
                for k in ('override_blend_mode', 'override_two_sided', 'override_opacity_mask_clip_value'):
                    try: bo.set_editor_property(k, False)
                    except Exception: pass
                mi.set_editor_property('base_property_overrides', bo)
            except Exception:
                pass
            mel.update_material_instance(mi)
            tree_mis.add(mi.get_path_name())
        except Exception as e:
            unreal.log_warning(f'[bxue] ue_trees {nm}: {e}')
            out.setdefault('failed', {})[nm] = str(e)[:160]
    out['textures'] = tex.n
    # the tree meshes: Nanite with the foliage shape preservation
    t1 = time.time()
    pres = getattr(getattr(unreal, 'NaniteShapePreservation', None) or object, 'PRESERVE_AREA', None)
    for ap in eal.list_assets(dest, recursive=True, include_folder=False):
        nm = ap.split('/')[-1].split('.')[0]
        if gen < 2 or not re.match(r'^SM_[A-Z]_[yml]\d+_lod\d', nm): continue   # (the first set's meshes as imported)
        sm = eal.load_asset(ap)
        if not isinstance(sm, unreal.StaticMesh): continue
        try:
            ns = sm.get_editor_property('nanite_settings')
            ch = False
            if not ns.get_editor_property('enabled'): ns.set_editor_property('enabled', True); ch = True
            if pres is not None and ns.get_editor_property('shape_preservation') != pres:
                ns.set_editor_property('shape_preservation', pres); ch = True
            if ch:
                sm.set_editor_property('nanite_settings', ns); out['meshes'] += 1
        except Exception as e:
            out.setdefault('mesh_failed', {})[nm] = str(e)[:160]
    out['meshes_s'] = round(time.time() - t1, 1)
    # the tree components: the wind's offset evaluated and its velocity written
    for a in unreal.EditorLevelLibrary.get_all_level_actors():
        for c in a.get_components_by_class(unreal.StaticMeshComponent):
            mats = [m for m in c.get_materials() if m is not None]
            if not any(m.get_path_name() in tree_mis for m in mats): continue
            for k, v in (('evaluate_world_position_offset', True), ('world_position_offset_writes_velocity', True),
                         ('world_position_offset_disable_distance', 0), ('cast_shadow', True)):
                try: c.set_editor_property(k, v)
                except Exception:
                    if k not in out.setdefault('component_misses', []): out['component_misses'].append(k)
            out['components'] += 1
    # the render's foliage settings (into the take's Movie Render Queue console variables, which ue_take.py writes after
    # this hook; a value the take sets itself wins): Lumen gathers the light from behind a two-sided foliage pixel and
    # weights it by the subsurface colour (on at Epic / Cine, set here so a lower scalability does not drop it), and its
    # short-range screen-space occlusion leaves foliage alone (0.7 by default: a crown of small leaves read as one dark
    # occluder, 15 % of the crown's lightness on t7ArchTrack's key frames)
    cv = cfg.setdefault('cvars', {})
    for k, v in FOLIAGE_CVARS.items():
        cv.setdefault(k, v)
    out['cvars'] = {k: cv[k] for k in FOLIAGE_CVARS}
    out['secs'] = round(time.time() - t0, 1)
    return out
