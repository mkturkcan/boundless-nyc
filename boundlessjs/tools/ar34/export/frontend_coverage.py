# DOCS30 (2026-10-08): which renderer draws each material of a take's USD with its own builder, and which falls back to
# the standard preview material. Reads the take's layers with Sdf only (no stage composition, no renderer), and the
# adapters' own tables:
#   Blender  blender_nodes.py's family builders (the `bx` kinds), blender_trees.py (bxt_*), blender_windows.py (bxw_* and
#            the window kit's roles in bxwin_usd.json);
#   Unreal   ue_families.json (families -> masters, asset rules by prim name, roles, tag rules, the preview rule, the HQ
#            table per pbrLib set, ground kind, viaduct layer and facade class), the masters of ue_project/Python/
#            ue_masters.py and ue_foliage.py, and ue_trees.py for the second tree set.
# The order of the rules is ue_mat.py's: asset rule, role, `bx` tag (a tag rule before the family), else the preview
# surface (an untagged surface whose opacity is its colour map's alpha takes the preview rule's master).
#
#   uv run --no-project --with usd-core python frontend_coverage.py <take dir>/<shot>.usda [--hq <hq.json>] [--json f]
#       [--brief] [--out f]
# --brief prints the one-line summary only (bx_render_all.mjs prints it per shot), --out writes the full table to a file.
import argparse, collections, json, os, re, sys
from pxr import Sdf

HERE = os.path.dirname(os.path.abspath(__file__))


def src(name):
    p = os.path.join(HERE, name)
    return open(p, encoding='utf-8').read() if os.path.exists(p) else ''


def tables():
    fam = json.load(open(os.path.join(HERE, 'ue_families.json')))
    blender_kinds = set(re.findall(r"'(\w+)': lambda: build_\w+\(", src('blender_nodes.py')))
    masters = set()
    for f in ('ue_project/Python/ue_masters.py', 'ue_project/Python/ue_foliage.py'):
        m = re.search(r'^MASTERS = \{(.*?)^\}', src(f), re.S | re.M)
        masters |= set(re.findall(r"^    '(\w+)':", m.group(1), re.M)) if m else set()
    masters |= set(re.findall(r"^MASTERS\['(\w+)'\]", src('ue_project/Python/ue_masters.py'), re.M))
    return fam, blender_kinds, masters


def get(P, path):
    """a dotted path into a `bx` tag ('tex.alb', 'gpA.4'), as ue_mat.get"""
    cur = P
    for part in str(path).split('.'):
        if isinstance(cur, dict): cur = cur.get(part)
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur): cur = cur[int(part)]
        else: cur = None
        if cur is None: return None
    return cur


def layers_of(root_path):
    """the root layer and its sublayers, depth first: [(path, layer or None)]"""
    out, seen = [], set()

    def visit(path):
        if path in seen: return
        seen.add(path)
        L = Sdf.Layer.FindOrOpen(path) if os.path.exists(path) else None
        out.append((path, L))
        if L is None: return
        for sp in L.subLayerPaths:
            visit(sp if os.path.isabs(sp) else os.path.normpath(os.path.join(os.path.dirname(path), sp)))
    visit(os.path.abspath(root_path))
    peds = re.sub(r'\.usda$', '_peds.usda', os.path.abspath(root_path))   # the walkers' root beside the take's, if any
    if peds != os.path.abspath(root_path) and os.path.exists(peds): visit(peds)
    return out


def materials(layers):
    """{prim name: {'bx': dict or None, 'three': name, 'opacity_in_diffuse': bool, 'layer': file}} (first layer wins)"""
    out = {}

    def tex_file(L, attr):
        if attr is None: return None
        cp = attr.connectionPathList
        items = list(cp.explicitItems) + list(cp.prependedItems) + list(cp.appendedItems) + list(cp.addedItems)
        if not items: return None
        t = L.GetPrimAtPath(items[0].GetPrimPath())
        f = t.attributes.get('inputs:file') if t else None
        return getattr(f.default, 'path', None) if f is not None and f.default is not None else None

    def walk(L, spec):
        for c in spec.nameChildren:
            if c.typeName == 'Material':
                if c.name not in out:
                    cd = dict(c.customData)
                    try: bx = json.loads(cd['bx']) if 'bx' in cd else None
                    except Exception: bx = None
                    oid = False
                    for sh in c.nameChildren:
                        i = sh.attributes.get('info:id')
                        if sh.typeName == 'Shader' and i is not None and i.default == 'UsdPreviewSurface':
                            o, d = tex_file(L, sh.attributes.get('inputs:opacity')), tex_file(L, sh.attributes.get('inputs:diffuseColor'))
                            oid = bool(o) and o == d
                    out[c.name] = {'bx': bx, 'three': (cd.get('three') or {}).get('name', ''), 'opacity_in_diffuse': oid,
                                   'layer': os.path.basename(L.realPath or L.identifier)}
                continue
            walk(L, c)
    for _, L in layers:
        if L is not None: walk(L, L.pseudoRoot)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('usd'); ap.add_argument('--hq'); ap.add_argument('--json'); ap.add_argument('--out')
    ap.add_argument('--brief', action='store_true')
    a = ap.parse_args()
    fam, bkinds, masters = tables()
    L = layers_of(a.usd)
    root = L[0][1]
    if root is None: sys.exit(f'no USD at {a.usd}')
    M = materials(L)
    udir = os.path.dirname(os.path.abspath(a.usd))
    roles = {}
    try: roles = json.load(open(os.path.join(udir, 'bxwin_usd.json'))).get('roles') or {}
    except Exception: pass
    set2 = any(os.path.basename(p).startswith('bxtrees2_geo') for p, _ in L) or \
        (dict(root.customLayerData).get('treeue') or {}).get('set') == 'bxtrees2'
    H = fam.get('hq') or {}
    hq_path = a.hq or H.get('manifest') or ''
    try: man = json.load(open(hq_path))
    except Exception: man = {}
    fetched = lambda sid: all(os.path.exists(f) for f in ((man.get(sid) or {}).get('files') or {'x': '/nonexistent'}).values())
    hqs = lambda sids: ', '.join(f'{k} {v}' + ('' if fetched(v) else ' (not fetched)') for k, v in sids) if sids else ''
    um = lambda m: f'M_bx_{m}' if m in masters else f'M_bx_{m} (missing)'
    rows = collections.OrderedDict()   # key -> {n, blender, unreal, hq, sets: {set: n}}

    def add(key, blender, unreal, hq='', pset=None, b_ok=True, u_ok=True):
        r = rows.setdefault(key, {'n': 0, 'blender': blender, 'unreal': unreal, 'hq': hq, 'sets': collections.Counter(),
                                  'b_ok': b_ok, 'u_ok': u_ok})
        r['n'] += 1
        if pset is not None: r['sets'][pset] += 1
    for name, m in sorted(M.items()):
        P = m['bx']
        rule = next((r for r in fam.get('assets', []) if (name.endswith(r['match']) if r.get('how') == 'suffix' else name.startswith(r['match']))), None)
        if rule:
            mt = rule['match']
            if mt.startswith('bxt_'):
                b, bo = ('blender_trees.py', True) if 'bxt_' in src('blender_trees.py') else ('preview surface', False)
                u = ('ue_trees.py: ' + ('M_bx_bark' if mt == 'bxt_bark_' else 'M_bx_foliage') if set2 and src('ue_trees.py') else um(rule['master']))
            elif mt == 'bxw_':
                b, bo = ('blender_windows.py', True) if 'bxw_' in src('blender_windows.py') else ('preview surface', False)
                u = um(rule['master'])
            elif mt == 'hidden':
                b, bo, u = 'preview surface (opacity 0)', True, um(rule['master'])
            elif rule.get('master') == 'walker':   # Blender builds the walkers from peds_<shot>.npz with its own materials
                b, bo = ('blender_peds.py', True) if src('blender_peds.py') else ('preview surface', False)
                u = um(rule['master'])
            else:
                b, bo, u = 'preview surface', False, um(rule['master'])
            hq = hqs(list((H.get('facade') or {}).items())) if mt == 'bxw_' else ''
            add(f'asset {mt}', b, u, hq, b_ok=bo); continue
        rr = roles.get(name)
        if rr and isinstance(fam.get('roles', {}).get(rr.get('role')), dict):
            add(f"role {rr['role']}", 'blender_windows.py', um(fam['roles'][rr['role']]['master'])); continue
        if P is None:
            pr = next((r for r in fam.get('preview_rules', []) if r.get('when') == 'opacity_in_diffuse'), None)
            if pr and m['opacity_in_diffuse']:
                add('untagged, opacity in the colour map', 'preview surface', um(pr['master']) + ' (preview rule)', b_ok=False)
            else:
                add('untagged', 'preview surface', 'preview surface', b_ok=False, u_ok=False)
            continue
        kind = P.get('kind')
        b, bo = (f'builder build_{kind}', True) if kind in bkinds else ('preview surface', False)
        f = (fam.get('families') or {}).get(kind)
        tr = next((r for r in fam.get('tag_rules', []) if r.get('kind') in (None, kind) and all(x in (P.get('name') or '') for x in (r['name_contains'] if isinstance(r.get('name_contains'), list) else [r.get('name_contains', '')]))), None)
        if tr:
            add(f'{kind}, tag rule {tr["master"]}', b, um(tr['master']), b_ok=bo); continue
        if not f:
            u, uo = 'preview surface', False
        elif f.get('keep'):
            u, uo = 'preview surface, colours scaled', True     # the family's own rule (ue_families.json keep)
        elif any(get(P, r) is None for r in f.get('requires', [])):
            add(f'{kind}, without {"/".join(f["requires"])}', b, 'preview surface', b_ok=bo, u_ok=False); continue
        else:
            u, uo = um(f['master']), f['master'] in masters
        hq = ''
        if kind == 'pbr':
            sid = (H.get('pbr') or {}).get(P.get('set'))
            add(kind, b, u, '', pset=f"{P.get('set')}\t{(sid + ('' if fetched(sid) else ' (not fetched)')) if sid else ''}", b_ok=bo, u_ok=uo); continue
        if kind in ('ground', 'vk'): hq = hqs(list((H.get(kind) or {}).items()))
        add(kind, b, u, hq, b_ok=bo, u_ok=uo)
    n = len(M)
    nb = sum(r['n'] for r in rows.values() if r['b_ok']); nu = sum(r['n'] for r in rows.values() if r['u_ok'])
    pbr_sets = rows.get('pbr', {}).get('sets', {})
    mapped = sum(1 for s in pbr_sets if s.split('\t')[1])
    hq_ids = sorted({v for k in ('pbr', 'ground', 'vk', 'facade') for v in (H.get(k) or {}).values()})
    nf = sum(1 for s in hq_ids if fetched(s))
    shot = os.path.basename(a.usd)
    summary = (f'coverage {shot}: {n} materials; Blender {nb} by a builder ({100 * nb / max(1, n):.0f} %), {n - nb} on the preview '
               f'surface; Unreal {nu} by a master ({100 * nu / max(1, n):.0f} %), {n - nu} on the preview surface; pbrLib sets '
               f'{len(pbr_sets)}, {mapped} with an HQ set; HQ sets fetched {nf}/{len(hq_ids)}; tree set {"bxtrees2" if set2 else "bxtrees or web"}')
    order = list((fam.get('families') or {}).keys())
    rank = lambda k: (order.index(k.split(',')[0]), k) if k.split(',')[0] in order else \
        ((len(order), k) if k.startswith('asset') else (len(order) + 1, k) if k.startswith('role') else (len(order) + 2, k))
    rows = collections.OrderedDict(sorted(rows.items(), key=lambda kv: rank(kv[0])))
    lines = [summary, '', f'{"family / pbrLib set":44s} {"mats":>5s}  {"Blender":28s} {"Unreal":36s} HQ (Unreal)']
    for k, r in rows.items():
        lines.append(f'{k:44s} {r["n"]:5d}  {r["blender"]:28s} {r["unreal"]:36s} {r["hq"]}')
        for s, c in sorted(r['sets'].items(), key=lambda x: (-x[1], x[0])):
            nm, sid = s.split('\t')
            lines.append(f'  {nm:42s} {c:5d}  {"":28s} {"":36s} {sid or "none (the web textures)"}')
    missing = [L for L, lay in L if lay is None]
    if missing: lines.append(f'layers not found: {", ".join(missing)}')
    text = '\n'.join(lines)
    if a.out:
        open(a.out, 'w').write(text + '\n')
    print(summary if a.brief else text)
    if a.json:
        json.dump({'usd': os.path.abspath(a.usd), 'materials': n, 'blender_builder': nb, 'unreal_master': nu, 'tree_set2': set2,
                   'hq_fetched': nf, 'hq_sets': len(hq_ids), 'rows': {k: {**{x: v for x, v in r.items() if x != 'sets'},
                   'sets': dict(r['sets'])} for k, r in rows.items()}}, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
