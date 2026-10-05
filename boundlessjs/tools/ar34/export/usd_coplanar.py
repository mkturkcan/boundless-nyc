# BX-FIX (AR34 BX, 2026-10-04): coplanar surfaces and interior volumes, resolved in the USD writer.
#
# The web orders coincident surfaces with polygonOffset, depthWrite off, the ground's depth bias per kind and draw order
# (three's LessEqual depth test: the later draw wins a tie). A path tracer has none of these: two surfaces in one plane are
# hit in random order per sample (a noisy or striped mix that crawls as the lens moves: graffiti over a weather layer,
# a sign's face over its mask), and a twin within the ray's precision blocks every ray that leaves the other (the black
# fans of the first export). Cycles also renders back faces, so a room box of the facade kit whose ceiling stands 5 cm
# over its roof shows its top from above (the Starbucks block at 125th and Lenox, t8LenoxDive): the web culls it.
# usd_write.py calls run() once per static layer, after the layer is authored and before geo.usdc is saved:
#   1. RULES: overlays lifted off their base along their normals by their depth pull: the street kit's overlays
#      (city/sk/streetscape.js `pull` in the ground's depth units, 1.5 mm per unit like the ground kinds' bias, so a repave
#      (7) lies over the bus lane (4) and under the paint (10), the crossing paint (16) over the paint); a material with
#      the web's polygonOffset (harvests from 2026-10-04 record it) by max(|units|, |factor|) mm (2-8 mm); a transparent
#      material that writes no depth (decals, graffiti, stains, sign layers) 2 mm.
#   2. INTERIORS: every vertex of the kit's interiors (fk:int_*, fk:lv:*, roomFill, shopFill; not the window glass) that
#      stands over a roof of the static layer (an up-facing surface that is not an interior, 2 m or more over the
#      building's lowest room floor, within 1.5 m under the vertex) is brought 3 cm under that roof.
#   3. AUDIT: every pair of triangles of different owners (an owner = one placed mesh or instance x its material slot;
#      the ground: one per surface kind) that overlap in one plane (normals in 1.4 deg bins, plane offsets in bins of 2.2x
#      the window, each binning done twice shifted half a bin; overlapping by more than a 1 cm inset; closer than the
#      2.5 mm window along the normal) gets a constraint on the lifts, which are unknowns per geometry triangle (all the
#      instances of a prototype share them): same facing, the upper one (the higher overlay level, else the later draw,
#      ties by the triangle) at least SEP over the other; facing apart and face to face (each in front of the other:
#      Cycles shows the near one's back where the web culls it), the later draw passes the other by SEP; back to back is
#      harmless. Relaxed as difference constraints, applied to the shared /_geo points (local space; a corner shared by
#      differently facing triangles gets a displacement that meets all of them) or the ground's world points, then the
#      audit runs again on what will be written: what a lift brought within 2 mm of a third surface is the next round's
#      pair (5 rounds at most). Left at the end: a pair in view (inside a frame's frustum within 300 m) whose smaller
#      triangle projects to a pixel or more is unresolved (two instances of one prototype triangle, sub-pixel and out-of-
#      view pairs are counted apart); usd_write.py fails the write when any are left (--coplanar warn keeps going).
# Counts per shot go to usd_write's stats['coplanar'] (and the log). Standalone (audit only, no USD):
#   python usd_coplanar.py --in <harvest dir> --shot <shot>
import re, time, json, os, sys
import numpy as np

LSB = 0.0015          # the ground's depth unit (usd_write.py author_ground: zb x 1.5 mm)
SK_PULL = {'flags': 5, 'kerb': 7, 'padred': 12, 'padiron': 12, 'padwhite': 12, 'cov': 9, 'patch': 7, 'repave': 7,
           'wear': 13, 'xmask': 13, 'xpaint': 16}
SK_RE = re.compile(r'(?:^|_|:)sk_(' + '|'.join(SK_PULL) + r')(?:$|_|\b)')
TOL = 0.002           # closer than this along the normal (and overlapping in the plane): a conflict
SEP = 0.003           # a resolved pair's separation
TOL_LEFT = 0.0015     # after the lifts: still closer than this = unresolved
INTERIOR = re.compile(r'^(fk:int_(?!winglass|shopglass)|fk:lv:|roomFill$|shopFill$)')
GLASSY = re.compile(r'glass|lens|veil|netting|fence|water|cloud|smoke|halo', re.I)
ROOF_MIN = 1.8        # a roof stands this much over the floor of the room box it caps (a room standing on a lower roof is not capped by it)
ROOF_WIN = 0.6        # ... and at most this much under the interior vertex it caps
ROOF_GAP = 0.03       # the interior is brought this far under the roof


def _rss():
    try: return int(open('/proc/self/statm').read().split()[1]) * 4096 / 1e9
    except Exception: return 0.0


def _p(log, *a):
    if log: log('[coplanar] ' + ' '.join(str(x) for x in a) + ' (rss %.1f GB)' % _rss())


def overlay_level(d):
    """a material's overlay level in mm of lift (0 = a base surface)."""
    if not d: return 0.0
    if d.get('polygonOffset'):
        u, f = float(d.get('polygonOffsetUnits') or 0), float(d.get('polygonOffsetFactor') or 0)
        if min(u, f) < 0: return float(min(8.0, max(2.0, -u, -f)))
        return 0.0          # a positive pull pushes the base back: the others come forward
    if d.get('transparent') and d.get('depthWrite') is False and not GLASSY.search(d.get('name') or ''): return 2.0
    return 0.0


def _M3(matrix):
    if matrix is None: return None, None
    Mm = np.array(matrix, dtype=np.float64).reshape(4, 4)
    return Mm[:3, :3], Mm[3, :3]


def _tri_slots(G, nmats):
    mi = np.zeros(G['ntri'], dtype=np.int32)
    if G['groups'] and nmats > 1:
        mi[:] = -1
        for q in G['groups']:
            a, b = max(0, q['start'] // 3), min(G['ntri'], (q['start'] + q['count']) // 3)
            if b > a: mi[a:b] = q['mi']
    return mi


def _grid_pairs(skey, u, v, tkey, U, V, cell, maxcells):
    """(sample index, triangle index) candidate pairs: samples (skey, u, v) against triangles (tkey, U[3], V[3]) in the
    same key and 2D cell."""
    tu0, tu1 = np.floor(U.min(1) / cell).astype(np.int64), np.floor(U.max(1) / cell).astype(np.int64)
    tv0, tv1 = np.floor(V.min(1) / cell).astype(np.int64), np.floor(V.max(1) / cell).astype(np.int64)
    nu = tu1 - tu0 + 1; nc = nu * (tv1 - tv0 + 1)
    ok = nc <= maxcells
    tid = np.nonzero(ok)[0]
    cnt = nc[tid]
    rep = np.repeat(tid, cnt)
    loc = np.arange(rep.size) - np.repeat(np.cumsum(cnt) - cnt, cnt)
    pk = lambda k, i, j: (k.astype(np.int64) * 1000003 + (i + 500000)) * 1000003 + (j + 500000)
    gk = pk(tkey[rep], tu0[rep] + loc % nu[rep], tv0[rep] + loc // nu[rep])
    o = np.argsort(gk, kind='stable'); gk = gk[o]; gt = rep[o]
    uk, us, uc = np.unique(gk, return_index=True, return_counts=True)
    sk = pk(skey, np.floor(u / cell).astype(np.int64), np.floor(v / cell).astype(np.int64))
    pos = np.minimum(np.searchsorted(uk, sk), len(uk) - 1) if len(uk) else np.zeros(len(sk), np.int64)
    hit = np.nonzero((uk[pos] == sk) if len(uk) else np.zeros(len(sk), bool))[0]
    c = uc[pos[hit]]; st = us[pos[hit]]
    ps = np.repeat(hit, c)
    pt = gt[np.repeat(st, c) + np.arange(ps.size) - np.repeat(np.cumsum(c) - c, c)]
    return ps, pt, int((~ok).sum())


def audit(V, N, owner, tol=TOL, cell=1.0, maxcells=20000, chunk_tris=150_000, log=None):
    """V: n x 3 x 3 world triangles, N: n x 3 unit facing normals, owner: n ints. -> conflict pairs (a, b), dh (b's plane
    minus a's sample along a's facing normal) and counters. Triangles are grouped by plane (canonical normal in 1.4 deg
    steps, the plane offset in 5 mm bins, twice with the bins shifted half a bin); a group with two owners or more keeps
    only the triangles whose box meets another owner's box in the group's plane; those are tested in chunks of groups."""
    n = len(V)
    out = {'tris': int(n), 'candidates': 0}
    if n == 0: return np.zeros((0, 2), np.int64), np.zeros(0), out
    cen = V.mean(1)
    dom = np.argmax(np.abs(N), axis=1)
    s = np.sign(N[np.arange(n), dom]); s[s == 0] = 1
    Nc = N * s[:, None]
    d = (Nc * cen).sum(1)
    pairs_all, dh_all = [], []
    a7 = np.array([0, 1, 0, 0.5, 0.5, 0, 1 / 3]); b7 = np.array([0, 0, 1, 0, 0.5, 0.5, 1 / 3])
    # plane-offset bins of 2.2 x tol: with the second pass shifted half a bin, two planes closer than tol share a bin in at
    # least one pass (5 mm bins missed pairs 3-12 mm apart once the window was 12 mm: a lift then ran into them)
    binw = max(0.005, 2.2 * tol)
    for noff, off in ((0.0, 0.0), (0.0, 0.5), (0.5, 0.0), (0.5, 0.5)):   # normals in 1.4 deg bins, shifted too (a slope
        qn = np.floor(Nc * 40 + 0.5 + noff).astype(np.int64) + 64      # near a bin edge put an overlay and its road apart)
        kn = (qn[:, 0] * 129 + qn[:, 1]) * 129 + qn[:, 2]
        kd = np.floor(d / binw + off).astype(np.int64)
        key = kn * 4000003 + kd
        o = np.lexsort((owner, key)); ks, ow = key[o], owner[o]
        newk = np.ones(n, bool); newk[1:] = ks[1:] != ks[:-1]
        newo = newk.copy(); newo[1:] |= ow[1:] != ow[:-1]
        gidx = np.cumsum(newk) - 1
        nown = np.bincount(gidx, weights=newo.astype(np.float64))
        cand = o[nown[gidx] >= 2]
        if not len(cand): continue
        ck = key[cand]
        uk_, first, ginv = np.unique(ck, return_index=True, return_inverse=True)
        gn = Nc[cand][first][ginv]
        gr = np.where(np.abs(gn[:, 1:2]) < 0.9, np.array([[0.0, 1.0, 0.0]]), np.array([[1.0, 0.0, 0.0]]))
        eu = np.cross(gr, gn); eu /= np.linalg.norm(eu, axis=1, keepdims=True)
        ev = np.cross(gn, eu)
        Vc = V[cand]
        U = (Vc * eu[:, None, :]).sum(2); W = (Vc * ev[:, None, :]).sum(2)
        # owner boxes per group; a triangle stays when its box meets the box of another owner of its group
        co = owner[cand]
        oo = np.lexsort((co, ginv)); g_s, o_s = ginv[oo], co[oo]
        brk = np.ones(len(oo), bool); brk[1:] = (g_s[1:] != g_s[:-1]) | (o_s[1:] != o_s[:-1])
        st_ = np.nonzero(brk)[0]
        bu0 = np.minimum.reduceat(U.min(1)[oo], st_); bu1 = np.maximum.reduceat(U.max(1)[oo], st_)
        bv0 = np.minimum.reduceat(W.min(1)[oo], st_); bv1 = np.maximum.reduceat(W.max(1)[oo], st_)
        bg = g_s[st_]
        # conflict rectangle per (group, owner): the box of its intersections with the other owners' boxes
        cr = np.full((len(st_), 4), np.nan)
        gstart = np.r_[0, np.nonzero(np.diff(bg))[0] + 1, len(bg)]
        gk_ = np.diff(gstart)
        two = gstart[:-1][gk_ == 2]   # two owners (most groups): one intersection, vectorized
        if len(two):
            iu0 = np.maximum(bu0[two], bu0[two + 1]); iu1 = np.minimum(bu1[two], bu1[two + 1])
            iv0 = np.maximum(bv0[two], bv0[two + 1]); iv1 = np.minimum(bv1[two], bv1[two + 1])
            okt = (iu1 > iu0 + 0.01) & (iv1 > iv0 + 0.01)
            box = np.stack([iu0, iv0, iu1, iv1], 1); box[~okt] = np.nan
            cr[two] = box; cr[two + 1] = box
        for gi in np.nonzero(gk_ > 2)[0]:
            lo, hi = gstart[gi], gstart[gi + 1]
            k = hi - lo
            if k > 400:   # many owners in one plane (the ground's overlays): the group's own box
                cr[lo:hi] = [bu0[lo:hi].min(), bv0[lo:hi].min(), bu1[lo:hi].max(), bv1[lo:hi].max()]; continue
            iu0 = np.maximum(bu0[lo:hi, None], bu0[None, lo:hi]); iu1 = np.minimum(bu1[lo:hi, None], bu1[None, lo:hi])
            iv0 = np.maximum(bv0[lo:hi, None], bv0[None, lo:hi]); iv1 = np.minimum(bv1[lo:hi, None], bv1[None, lo:hi])
            ok_ = (iu1 > iu0 + 0.01) & (iv1 > iv0 + 0.01); np.fill_diagonal(ok_, False)
            for r in range(k):
                if ok_[r].any():
                    cr[lo + r] = [iu0[r][ok_[r]].min(), iv0[r][ok_[r]].min(), iu1[r][ok_[r]].max(), iv1[r][ok_[r]].max()]
        tri_box = np.empty(len(cand), np.int64); tri_box[oo] = np.cumsum(brk) - 1
        R = cr[tri_box]
        keepc = ~np.isnan(R[:, 0]) & (U.max(1) > R[:, 0]) & (U.min(1) < R[:, 2]) & (W.max(1) > R[:, 1]) & (W.min(1) < R[:, 3])
        _p(log, 'pass', noff, off, 'groups', len(uk_), 'candidates', len(cand), 'kept', int(keepc.sum()))
        if not keepc.any(): continue
        cand, ginv, gn, U, W, Vc = cand[keepc], ginv[keepc], gn[keepc], U[keepc], W[keepc], Vc[keepc]
        out['candidates'] += int(len(cand))
        Hh = (Vc * gn[:, None, :]).sum(2)
        # chunks of whole groups
        oc = np.argsort(ginv, kind='stable')
        gsz = np.bincount(ginv[oc]); gend = np.cumsum(gsz[gsz > 0])
        cuts = [0]
        for e in gend:
            if e - cuts[-1] >= chunk_tris: cuts.append(int(e))
        if cuts[-1] != len(oc): cuts.append(len(oc))
        for c0, c1 in zip(cuts[:-1], cuts[1:]):
            sel = oc[c0:c1]
            u_, w_, h_ = U[sel], W[sel], Hh[sel]
            e1u, e1v, e1h = u_[:, 1] - u_[:, 0], w_[:, 1] - w_[:, 0], h_[:, 1] - h_[:, 0]
            e2u, e2v, e2h = u_[:, 2] - u_[:, 0], w_[:, 2] - w_[:, 0], h_[:, 2] - h_[:, 0]
            den = e1u * e2v - e2u * e1v
            good = np.abs(den) > 1e-8
            cu, cv, ch = u_.mean(1), w_.mean(1), h_.mean(1)
            per = np.hypot(e1u, e1v) + np.hypot(e2u, e2v) + np.hypot(u_[:, 2] - u_[:, 1], w_[:, 2] - w_[:, 1])
            inr = np.abs(den) / np.maximum(per, 1e-9)
            sc = 1.0 - np.minimum(0.5, 0.01 / np.maximum(inr, 1e-4))
            su = (cu[:, None] + ((u_[:, :1] + a7 * e1u[:, None] + b7 * e2u[:, None]) - cu[:, None]) * sc[:, None]).ravel()
            sv = (cv[:, None] + ((w_[:, :1] + a7 * e1v[:, None] + b7 * e2v[:, None]) - cv[:, None]) * sc[:, None]).ravel()
            sh = (ch[:, None] + ((h_[:, :1] + a7 * e1h[:, None] + b7 * e2h[:, None]) - ch[:, None]) * sc[:, None]).ravel()
            si = np.repeat(np.arange(len(sel)), 7)
            k_ = good[si] & (inr[si] > 0.004)
            si, su, sv, sh = si[k_], su[k_], sv[k_], sh[k_]
            gl = ginv[sel]
            ps, pt, big = _grid_pairs(gl[si], su, sv, gl, u_, w_, cell, maxcells)
            out['skipped_big'] = out.get('skipped_big', 0) + big
            if not len(ps): continue
            ta = si[ps]; b = pt
            m = owner[cand[sel[ta]]] != owner[cand[sel[b]]]
            ps, ta, b = ps[m], ta[m], b[m]
            wu, wv = su[ps] - u_[b, 0], sv[ps] - w_[b, 0]
            p = (wu * e2v[b] - e2u[b] * wv) / np.where(good[b], den[b], 1)
            q = (e1u[b] * wv - wu * e1v[b]) / np.where(good[b], den[b], 1)
            ins = (p >= -1e-9) & (q >= -1e-9) & (p + q <= 1 + 1e-9) & good[b]
            hb = h_[b, 0] + p * e1h[b] + q * e2h[b]
            dh = hb - sh[ps]
            ins &= np.abs(dh) < tol
            if ins.any():
                A_, B_ = cand[sel[ta[ins]]], cand[sel[b[ins]]]
                sgn = (N[A_] * gn[sel[ta[ins]]]).sum(1)
                pairs_all.append(np.stack([A_, B_], 1)); dh_all.append(dh[ins] * np.sign(sgn))
    if not pairs_all:
        out['pairs'] = 0
        return np.zeros((0, 2), np.int64), np.zeros(0), out
    P = np.concatenate(pairs_all); D = np.concatenate(dh_all)
    o = np.lexsort((-np.abs(D), P[:, 1], P[:, 0])); P, D = P[o], D[o]
    first = np.ones(len(P), bool); first[1:] = (P[1:, 0] != P[:-1, 0]) | (P[1:, 1] != P[:-1, 1])
    P, D = P[first], D[first]
    out['pairs'] = int(len(P))
    return P, D, out


def resolve(P, D, N, level, front_order, owner, var, cap=0.015, shared=None):
    """per-triangle lift (m, along its own facing normal) from the pairs found within the audit's window (D: b's plane
    over a's sample along a's normal). The unknowns are per geometry triangle (`var`: every instance of a prototype shares
    its triangles' lifts, so a lift asked by one instance is checked against every other instance's neighbours). Each
    unordered pair is decided once (both triangles' samples pooled):
      * same facing, closer than TOL: ordered by rule (the higher overlay level, else the one in front on average, else
        the later draw); further apart: by geometry; a pair whose samples disagree on which is in front by more than TOL
        crosses (an interpenetration no lift resolves) and only its close part counts. Constraint: lift(upper) >=
        lift(lower) + SEP - gap.
      * facing apart, back to back (each behind the other's back): harmless, nothing to do; face to face (each in front
        of the other, a box's wall inside another's): Cycles shows the near one's back where the web culls it, so the
        one with the later draw passes the other: lift >= gap + SEP.
    Relaxed as difference constraints; a lift is capped at `cap`. Two instances of one prototype triangle cannot be
    parted by it: counted ('same_tri')."""
    n = len(N)
    st = {'pairs': int(len(P)), 'conflicts': int((np.abs(D) < TOL).sum()) if len(P) else 0, 'face_to_face': 0, 'crossing': 0,
          'upper_overlay': 0, 'upper_front': 0, 'upper_order': 0, 'same_tri': 0}
    lift = np.zeros(n)
    if not len(P): return lift, st
    uv, vinv = np.unique(var, return_inverse=True)
    lv = np.zeros(len(uv))
    a, b = P[:, 0], P[:, 1]
    facing = (N[a] * N[b]).sum(1)
    i_ = np.minimum(a, b); j_ = np.maximum(a, b)
    # one sign per unordered pair: same facing, "j over i" along i's normal (the record from j's samples flips); facing apart,
    # both records already say "the other in front of me" (> 0: face to face) or "behind me" (< 0: back to back)
    d_ = np.where((a == i_) | (facing < 0), D, -D)
    key = i_ * np.int64(n) + j_
    o = np.argsort(key, kind='stable'); key, i_, j_, d_, fac = key[o], i_[o], j_[o], d_[o], facing[o]
    first = np.ones(len(key), bool); first[1:] = key[1:] != key[:-1]
    g = np.cumsum(first) - 1
    ng = int(g[-1]) + 1
    dsum = np.bincount(g, weights=d_, minlength=ng); cnt = np.bincount(g, minlength=ng)
    dmin = np.full(ng, np.inf); dmax = np.full(ng, -np.inf)
    np.minimum.at(dmin, g, d_); np.maximum.at(dmax, g, d_)
    I, J, F = i_[first], j_[first], fac[first]
    dm = dsum / np.maximum(cnt, 1)
    VI, VJ = vinv[I], vinv[J]
    same = VI == VJ
    st['same_tri'] = int(same.sum())
    cons_u, cons_l, cons_need = [], [], []          # lift_var[u] >= lift_var[l] + need (l = -1: no lower)
    # facing apart: face to face when j stands in front of i along i's normal (dm > 0): the later draw passes the other
    fa = (F < 0) & ~same
    ff = fa & (dm > -1e-4)
    st['face_to_face'] = int(ff.sum())
    later_j = (front_order[J] > front_order[I]) | ((front_order[J] == front_order[I]) & (VJ > VI))   # ties (one pool's instances): by geometry triangle
    mover = np.where(later_j, VJ, VI)
    cons_u.append(mover[ff]); cons_l.append(np.full(int(ff.sum()), -1)); cons_need.append(np.maximum(dm[ff], 0) + SEP)
    # same facing
    sf = (F >= 0) & ~same
    cross = sf & (dmin < -TOL) & (dmax > TOL)
    st['crossing'] = int(cross.sum())
    close = sf & ((np.abs(dm) < TOL) | (cross & (np.minimum(np.abs(dmin), np.abs(dmax)) < TOL)))
    keep = sf & (close | ~cross)
    if GEO_CONS == 0:
        # only the close pairs, ordered by level then draw order (one total order everywhere: no positive cycles); what a
        # lift brings within TOL of a third surface is the next round's close pair
        keep &= close
    elif shared is not None:
        # two prototypes placed many times: the geometric order of a pair 2-12 mm apart differs from one instance to the
        # next (an AC unit's base over one roof, under the next unit's), positive cycles that drove both to the cap; only
        # their close pairs (ordered by level and draw order, the same everywhere) constrain them
        keep &= close | ~(shared[I] & shared[J])
    li, lj = level[I], level[J]
    # (closer than TOL the geometric order is noise and differs between the instances of a prototype, which made positive
    # cycles of constraints: the level, then the draw order, which are the same at every instance)
    rule_j = (lj > li) | ((lj == li) & later_j)
    up_j = np.where(close, rule_j, dm > 0)
    st['upper_overlay'] = int((close & (li != lj)).sum()); st['upper_order'] = int((close & (li == lj)).sum())
    U = np.where(up_j, VJ, VI)[keep]; L = np.where(up_j, VI, VJ)[keep]
    gap = np.where(up_j, dm, -dm)[keep]
    cons_u.append(U); cons_l.append(L); cons_need.append(SEP - gap)
    CU = np.concatenate(cons_u); CL = np.concatenate(cons_l); CN = np.concatenate(cons_need)
    has_l = CL >= 0
    for it in range(80):
        need = np.minimum(np.where(has_l, lv[np.maximum(CL, 0)], 0.0) + CN, cap)
        upd = need > lv[CU] + 1e-6
        if not upd.any(): break
        np.maximum.at(lv, CU[upd], need[upd])
    st['relax_iters'] = it + 1
    st['capped'] = int((lv >= cap - 1e-9).sum())
    return lv[vinv], st


# ------------------------------------------------------------------------------------------------ the static layer
class Set_:
    """one placed geometry: gid, its material ids, its matrix (rows = three's columns) or None (world points)."""
    __slots__ = ('gid', 'mats', 'M3', 't', 'kind', 'path', 'name', 'order', 'inst')


def gather(objs, pools, instanced, load_geo, MATS, ground_paths, ground_points=None, max_tris=45_000_000, log=print):
    """-> (sets, arrays): every static placement (meshes, the kit's instanced sets, the instancer pools but trees) as Set_
    records and the concatenated world triangles with their owner, facing normal, overlay level, draw order, interior
    flag, the set index, the triangle's index in its geometry (the ground: in its written triangles) and material id."""
    sets = []
    for i, o in objs:
        if o['geo'] < 0 or o.get('far'): continue
        s = Set_(); s.gid = o['geo']; s.mats = list(o['mats']); s.M3, s.t = _M3(o.get('matrix'))
        s.kind = 'ground' if i in ground_paths else 'mesh'; s.path = ground_paths.get(i); s.name = o['name']; s.order = i; s.inst = 0
        sets.append(s)
    base = len(objs)
    for j, p in enumerate(list(instanced) + list(pools)):
        if p.get('isTree'): continue
        Ms = np.asarray(p['matrices'], dtype=np.float64).reshape(-1, 16)
        for k, m in enumerate(Ms):
            s = Set_(); s.gid = p['geo']; s.mats = list(p['mats']); s.M3, s.t = _M3(m)
            s.kind = 'inst'; s.path = None; s.name = p['name']; s.order = base + j; s.inst = k
            sets.append(s)
    Vs, Ns, own, lev, ordr, intr, sid, tix, mid_, var_ = [], [], [], [], [], [], [], [], [], []
    total = 0; skipped = []
    for si, s in enumerate(sets):
        if os.environ.get('BXCOP_DEBUG') and si % 2000 == 0: _p(log, 'gather', si, len(sets), total)
        G = load_geo(s.gid)
        if s.kind == 'ground':
            # the ground as written (author_ground: unwelded world points, its kinds' bias and layers, covered ones dropped)
            Pw = ground_points(s.path) if ground_points else None
            if Pw is None: continue
            T = np.asarray(Pw, dtype=np.float64).reshape(-1, 3, 3)
            ntri = len(T)
        else:
            I = G['index'].reshape(-1, 3).astype(np.int64)
            ntri = len(I)
        if total + ntri > max_tris:
            skipped.append(s.name); continue
        if s.kind != 'ground':
            P = G['position'].astype(np.float64)
            if s.M3 is not None: P = P @ s.M3 + s.t
            T = P[I]
        nrm = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); ln = np.linalg.norm(nrm, axis=1)
        ok = ln > 2e-6                                   # 1 mm2
        if not ok.any(): continue
        slot = _tri_slots(G, len(s.mats)) if s.kind != 'ground' else np.zeros(len(T), np.int32)
        mids = np.array([s.mats[x] if 0 <= x < len(s.mats) else -1 for x in range(max(1, len(s.mats)))], dtype=np.int64)
        sl = np.clip(slot, 0, len(mids) - 1)
        tm = np.where((slot >= 0) & (slot < len(mids)), mids[sl], -1)
        ok &= tm >= 0
        ix = np.nonzero(ok)[0]
        Vs.append(T[ix]); Ns.append(nrm[ix] / ln[ix, None])
        if s.kind == 'ground':   # one owner per surface kind (the same kind's layers are author_ground's own business)
            kk = G.get('_ground_keep'); Ifull = G['index'].reshape(-1, 3)
            kk = np.arange(len(Ifull)) if kk is None or len(kk) != len(T) else kk
            gk = np.round(G['matId'][Ifull[kk[ix], 0]]).astype(np.int64) % 64 if 'matId' in G else np.zeros(len(ix), np.int64)
            own.append(si * 64 + gk)
        else:
            own.append(si * 64 + np.clip(slot[ix], 0, 63))
        lv = np.array([overlay_level(MATS.get(int(m))) if m >= 0 else 0 for m in mids], dtype=np.float64)
        it = np.array([bool(INTERIOR.match((MATS.get(int(m)) or {}).get('name') or '')) if m >= 0 else False for m in mids])
        if s.kind == 'ground': lv[:] = 0; it[:] = False
        lev.append(lv[sl[ix]]); intr.append(it[sl[ix]])
        ordr.append(s.order * 64 + np.clip(slot[ix], 0, 63)); sid.append(np.full(len(ix), si, dtype=np.int64)); tix.append(ix)
        mid_.append(tm[ix])
        var_.append((np.int64(1) << 50) + np.int64(si) * (1 << 25) + ix if s.kind == 'ground' else np.int64(s.gid) * (1 << 25) + ix)
        total += len(ix)
    _p(log, 'gathered', total, 'triangles from', len(sets), 'placements')
    if skipped: log('[coplanar] over %d triangles: %d placements left out of the audit (%s ...)' % (max_tris, len(skipped), ', '.join(sorted(set(skipped))[:4])))
    cat = lambda L, dt=None: np.concatenate(L) if L else np.zeros(0, dt)
    arr = {'V': np.concatenate(Vs) if Vs else np.zeros((0, 3, 3)), 'N': np.concatenate(Ns) if Ns else np.zeros((0, 3)),
           'owner': cat(own, np.int64), 'level': cat(lev), 'order': cat(ordr, np.int64), 'interior': cat(intr, bool),
           'set': cat(sid, np.int64), 'tri': cat(tix, np.int64), 'mid': cat(mid_, np.int64), 'var': cat(var_, np.int64)}
    return sets, arr


def sk_pull(name):
    m = SK_RE.search(name or '')
    return SK_PULL[m.group(1)] if m else 0


def interior_clamp(arr, sets, log=print, isg=None, pull=None):
    """-> per-triangle per-corner new world y for interior triangles (n x 3, NaN = unchanged) and counters: a corner of a
    room box that stands over a roof (an up-facing surface that is not an interior, an overlay or the ground, a roof's or
    a parapet cap's size, ROOF_MIN or more over the box's own floor, at most ROOF_WIN under the corner) goes ROOF_GAP under
    that roof. Room boxes: the interior triangles' connected components (shared corners, 1 mm) per placement."""
    V, N, intr = arr['V'], arr['N'], arr['interior']
    newy = np.full((len(V), 3), np.nan)
    st = {'interior_tris': int(intr.sum()), 'clamped_vertices': 0, 'clamped_buildings': 0, 'max_drop_m': 0.0}
    if not intr.any(): return newy, st
    ii = np.nonzero(intr)[0]
    lo_ = V[ii].min(axis=(0, 1)) - 1.0; hi_ = V[ii].max(axis=(0, 1)) + 1.0
    roof = (~intr) & (N[:, 1] > 0.7) & (arr['level'] == 0)
    if isg is not None: roof &= ~isg[arr['set']]
    if pull is not None: roof &= pull[arr['set']] == 0
    vmin, vmax = V.min(1), V.max(1)
    roof &= (vmax[:, 0] > lo_[0]) & (vmin[:, 0] < hi_[0]) & (vmax[:, 2] > lo_[2]) & (vmin[:, 2] < hi_[2]) & (vmax[:, 1] > lo_[1] + ROOF_MIN) & (vmin[:, 1] < hi_[1] + 0.1)
    e1 = V[:, 1] - V[:, 0]; e2 = V[:, 2] - V[:, 0]
    roof &= 0.5 * np.abs(e1[:, 0] * e2[:, 2] - e1[:, 2] * e2[:, 0]) > 0.25   # a roof's or a parapet cap's triangles, not sills
    ri = np.nonzero(roof)[0]
    st['roof_candidates'] = int(len(ri))
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    Ci = V[ii].reshape(-1, 3)
    q = np.round(Ci / 0.001).astype(np.int64)
    _, vid = np.unique(np.concatenate([q, arr['set'][np.repeat(ii, 3)][:, None]], 1), axis=0, return_inverse=True)
    vid = vid.reshape(-1, 3)
    e = np.concatenate([vid[:, [0, 1]], vid[:, [1, 2]]])
    nv = int(vid.max()) + 1
    ncomp, lab = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(nv, nv)), directed=False)
    tcomp = lab[vid[:, 0]]
    fmin = np.full(ncomp, np.inf); fmax = np.full(ncomp, -np.inf)
    np.minimum.at(fmin, tcomp, V[ii][:, :, 1].min(1)); np.maximum.at(fmax, tcomp, V[ii][:, :, 1].max(1))
    # a flat piece (a ceiling's lamp panel, a blind's head: under 25 cm tall) belongs to a room below it: any roof over it
    # within ROOF_WIN caps it (the Lenox block's lit ceiling panels stayed over its roof as white squares)
    flat = (fmax - fmin) < 0.25
    fmin[flat] = fmin[flat] - 10.0
    st['rooms'] = int(ncomp); st['flat_pieces'] = int(flat.sum())
    cx = V[ii][:, :, 0].ravel(); cz = V[ii][:, :, 2].ravel(); cy = V[ii][:, :, 1].ravel()
    owner_t = np.repeat(ii, 3)
    fl = fmin[np.repeat(tcomp, 3)]
    RT = V[ri]
    lim = np.full(len(cx), np.inf)
    if len(ri):
        for c0 in range(0, len(cx), 400_000):
            sl = slice(c0, min(len(cx), c0 + 400_000))
            keyS = np.zeros(sl.stop - sl.start, np.int64)
            ps, pt, _ = _grid_pairs(keyS, cx[sl], cz[sl], np.zeros(len(RT), np.int64), RT[:, :, 0], RT[:, :, 2], 2.0, 4000)
            if not len(ps): continue
            _cap(ps + c0, pt, RT, cx, cz, cy, fl, lim)
    cl = cy > lim
    if not cl.any(): return newy, st
    newy[ii] = np.where(cl, lim, np.nan).reshape(-1, 3)
    st['clamped_vertices'] = int(cl.sum()); st['clamped_buildings'] = int(len(np.unique(arr['set'][owner_t[cl]])))
    dr = cy[cl] - lim[cl]
    st['max_drop_m'] = round(float(dr.max()), 3)
    st['drop_hist_cm'] = {str(b): int(c) for b, c in zip([3, 5, 10, 20, 40, 63], np.histogram(dr * 100, [0, 3, 5, 10, 20, 40, 63])[0])}
    return newy, st


def _cap(a, b, RT, cx, cz, cy, fl, lim):
    T = RT[b]
    e1x, e1z = T[:, 1, 0] - T[:, 0, 0], T[:, 1, 2] - T[:, 0, 2]
    e2x, e2z = T[:, 2, 0] - T[:, 0, 0], T[:, 2, 2] - T[:, 0, 2]
    den = e1x * e2z - e2x * e1z
    good = np.abs(den) > 1e-9
    wx, wz = cx[a] - T[:, 0, 0], cz[a] - T[:, 0, 2]
    p = np.where(good, (wx * e2z - e2x * wz) / np.where(good, den, 1), -1)
    q = np.where(good, (e1x * wz - wx * e1z) / np.where(good, den, 1), -1)
    ins = (p >= 0) & (q >= 0) & (p + q <= 1)
    h = T[:, 0, 1] + p * (T[:, 1, 1] - T[:, 0, 1]) + q * (T[:, 2, 1] - T[:, 0, 1])
    capped = ins & (h > fl[a] + ROOF_MIN) & (h >= cy[a] - ROOF_WIN) & (h < cy[a] + ROOF_GAP)
    if capped.any(): np.minimum.at(lim, a[capped], h[capped] - ROOF_GAP)


WIN = float(os.environ.get('BXCOP_WIN', '0.0025'))   # the audit's window: pairs this close constrain each other's lifts
VIEW_R = 300.0       # an unresolved pair this close to the lens path (any frame) fails the write
ROUNDS = int(os.environ.get('BXCOP_ROUNDS', '5'))
GEO_CONS = int(os.environ.get('BXCOP_GEO', '0'))      # 1: pairs further apart than TOL constrain the lifts by their geometric order


def _names(P, arr, MATS, k=12):
    ex = {}
    for a_, b_ in P[:4000].tolist():
        ka = (MATS.get(int(arr['mid'][a_])) or {}).get('name') or 'm%d' % arr['mid'][a_]
        kb = (MATS.get(int(arr['mid'][b_])) or {}).get('name') or 'm%d' % arr['mid'][b_]
        kk = ' | '.join(sorted([ka or '?', kb or '?'])); ex[kk] = ex.get(kk, 0) + 1
    return sorted(ex.items(), key=lambda kv: -kv[1])[:k]


def st38_local(lift, pfl, sid, V, N, cell=2.0, above=(0.0003, 0.009), passes=3):
    """PIPEFIX: within each street-kit flag mesh, a triangle that rises lifts the triangles of the same mesh that stand on
    it (centroid inside its footprint in plan, 0.3-9 mm over its plane) at least as far. -> (lift, triangles raised)"""
    idx = np.nonzero(pfl)[0]
    lf = lift[idx].copy()
    if not (lf > 1e-6).any(): return lift, 0
    Vf = V[idx]; s = sid[idx]
    c = Vf.mean(1)
    gx = np.floor(c[:, 0] / cell).astype(np.int64); gz = np.floor(c[:, 2] / cell).astype(np.int64)
    key = (s << 40) + ((gx + (1 << 19)) << 20) + (gz + (1 << 19))
    o = np.argsort(key, kind='stable'); ks = key[o]
    n0 = 0
    for _ in range(passes):
        push = np.nonzero(lf > 1e-6)[0]
        raised = 0
        for p in push.tolist():
            T = Vf[p]
            if N[idx[p], 1] < 0.5: continue   # only up-facing pieces carry flags
            x0, x1 = T[:, 0].min(), T[:, 0].max(); z0, z1 = T[:, 2].min(), T[:, 2].max()
            cand = []
            for i_ in range(int(np.floor(x0 / cell)), int(np.floor(x1 / cell)) + 1):
                base = (int(s[p]) << 40) + ((i_ + (1 << 19)) << 20)
                lo = np.searchsorted(ks, base + int(np.floor(z0 / cell)) + (1 << 19))
                hi = np.searchsorted(ks, base + int(np.floor(z1 / cell)) + (1 << 19), side='right')
                if hi > lo: cand.append(o[lo:hi])
            if not cand: continue
            q = np.concatenate(cand)
            q = q[lf[q] < lf[p] - 1e-7]
            if not len(q): continue
            # inside the footprint (barycentric in plan) and over the plane by `above`
            a_, b_, c_ = T[0, [0, 2]], T[1, [0, 2]], T[2, [0, 2]]
            v0, v1 = b_ - a_, c_ - a_; den = v0[0] * v1[1] - v1[0] * v0[1]
            if abs(den) < 1e-12: continue
            w = c[q][:, [0, 2]] - a_
            u = (w[:, 0] * v1[1] - v1[0] * w[:, 1]) / den; v = (v0[0] * w[:, 1] - w[:, 0] * v0[1]) / den
            ins = (u >= -1e-4) & (v >= -1e-4) & (u + v <= 1 + 1e-4)
            n_ = N[idx[p]]
            yp = T[0, 1] - (n_[0] * (c[q, 0] - T[0, 0]) + n_[2] * (c[q, 2] - T[0, 2])) / n_[1]
            dy = c[q, 1] - yp
            q = q[ins & (dy > above[0]) & (dy < above[1])]
            if len(q): lf[q] = lf[p]; raised += len(q)
        n0 += raised
        if not raised: break
    lift = lift.copy(); lift[idx] = lf
    return lift, int(n0)


def run(objs, pools, instanced, load_geo, MATS, ground_paths, ground_points, set_geo_points, set_ground_points,
        log=print, max_tris=45_000_000, lens=None, cams=None):
    """the three passes on one static layer. objs: [(index, record)] as authored; ground_paths: {index: prim path} of the
    ground meshes (author_ground); ground_points(path) -> its world points; set_geo_points(gid, P) and
    set_ground_points(path, P) write the lifted points back. -> stats (with 'unresolved')."""
    t0 = time.time()
    st = {}
    sets, arr = gather(objs, pools, instanced, load_geo, MATS, ground_paths, ground_points, max_tris, log)
    n = len(arr['V'])
    st['tris'] = int(n); st['placements'] = len(sets)
    V, N = arr['V'], arr['N']
    # 1. RULES: the street kit's overlays by their pull (ground units), the overlay materials by their level (mm)
    pull = np.array([sk_pull(s_.name) for s_ in sets], dtype=np.float64)
    isg = np.array([s_.kind == 'ground' for s_ in sets], dtype=bool)
    rule = np.maximum(pull[arr['set']] * LSB, arr['level'] * 0.001)
    if n: rule[isg[arr['set']]] = 0.0
    st['rule_tris'] = int((rule > 0).sum()); st['rule_sk_tris'] = int((pull[arr['set']] > 0).sum()) if n else 0
    # 2. INTERIORS under their roofs
    newy, cst = interior_clamp(arr, sets, log, isg=isg, pull=pull)
    _p(log, 'interiors', cst)
    st.update(cst)
    disp = np.zeros((n, 3, 3))
    disp += (rule[:, None] * N)[:, None, :]
    cm = ~np.isnan(newy)
    disp[..., 1] += np.where(cm, newy - V[..., 1], 0.0)
    st['overlay_mids'] = sorted({int(m) for m, l in zip(arr['mid'], arr['level']) if l > 0} |
                                {int(m) for m, si in zip(arr['mid'], arr['set']) if pull[si] > 0})
    st['interior_mids'] = sorted({int(m) for m in arr['mid'][arr['interior']]})
    geo_disp, ground_new = {}, {}

    def apply(sets_, arr_, dsp):
        """add per-triangle world displacements: per geometry vertex (local) the largest one asked in this round."""
        moved = np.nonzero(np.abs(dsp).max(axis=(1, 2)) > 1e-7)[0]
        rnd = {}
        for si in np.unique(arr_['set'][moved]):
            s_ = sets_[int(si)]
            sel = moved[arr_['set'][moved] == si]
            if s_.kind == 'ground':
                Pw = ground_new.get(s_.path)
                if Pw is None: Pw = np.asarray(ground_points(s_.path), dtype=np.float64).reshape(-1, 3, 3).copy()
                Pw[arr_['tri'][sel]] += dsp[sel]
                ground_new[s_.path] = Pw
                continue
            G = load_geo(s_.gid)
            dl = dsp[sel]
            if s_.M3 is not None: dl = dl @ np.linalg.inv(s_.M3)
            vi = G['index'].reshape(-1, 3)[arr_['tri'][sel]].astype(np.int64)
            req = rnd.setdefault(s_.gid, ([], []))
            req[0].append(vi.ravel()); req[1].append(dl.reshape(-1, 3))
        # per vertex, a displacement that meets every request on it (x . n_i >= l_i): a corner shared by a frame's front
        # (lifted along +n1) and its side (along +n2) gets both, not the larger alone, which left the front where it was
        for gid, (vl, dlst) in rnd.items():
            G = load_geo(gid)
            v_ = np.concatenate(vl); d_ = np.concatenate(dlst)
            l_ = np.linalg.norm(d_, axis=1); m_ = l_ > 1e-9
            v_, d_, l_ = v_[m_], d_[m_], l_[m_]
            n_ = d_ / l_[:, None]
            x = np.zeros((len(G['position']), 3))
            for _ in range(6):
                deficit = l_ - (x[v_] * n_).sum(1)
                pos = deficit > 1e-7
                if not pos.any(): break
                best = np.zeros(len(x)); arg = np.full(len(x), -1, np.int64)
                idx = np.nonzero(pos)[0]
                o = idx[np.argsort(deficit[idx], kind='stable')]   # the largest deficit last: it wins per vertex
                best[v_[o]] = deficit[o]; arg[v_[o]] = o
                hv = np.nonzero(arg >= 0)[0]
                x[hv] += best[hv, None] * n_[arg[hv]]
            geo_disp[gid] = geo_disp.get(gid, 0) + x

    def load_geo2(gid):
        G = load_geo(gid)
        if gid not in geo_disp: return G
        G2 = dict(G); G2['position'] = (G['position'].astype(np.float64) + geo_disp[gid]).astype(np.float32)
        return G2
    gp2 = lambda path: ground_new[path].reshape(-1, 3) if path in ground_new else ground_points(path)
    apply(sets, arr, disp)
    del arr, V, N, disp
    # 3. AUDIT rounds on what will be written: pairs within WIN constrain the lifts, until no pair is closer than TOL_LEFT
    st['rounds'] = []
    P2 = np.zeros((0, 2), np.int64)
    for r in range(ROUNDS + 1):
        sets_r, arr_r = gather(objs, pools, instanced, load_geo2, MATS, ground_paths, gp2, max_tris, lambda *a: None)
        P, D, ast = audit(arr_r['V'], arr_r['N'], arr_r['owner'], tol=WIN, log=log if r == 0 else None)
        # ST38 (STATIONS2, 2026-10-04; BX_ST38=0 as before): two street-kit flag meshes over one another (neighbouring chunks
        # whose walk triangles overlap; the walk filled at the Lenox corners overlaps its neighbours by 4 cm) are left as the
        # web draws them. Each mesh carries its own dark joint floor 3 mm under its flags, and a pair decided by draw order
        # lifted the later chunk's floor 3 mm over the earlier chunk's flags: dark wedges of grout over the paving read as
        # broken shadows on the walk by the A C B D elevator (t8StNickDiveE f75-100)
        if len(P) and os.environ.get('BX_ST38', '1') != '0':
            pf = pull[arr_r['set']]
            both = (pf[P[:, 0]] == SK_PULL['flags']) & (pf[P[:, 1]] == SK_PULL['flags'])
            if both.any():
                st['skflags_pairs_left'] = st.get('skflags_pairs_left', 0) + int(both.sum())
                P, D = P[~both], D[~both]
        # what counts: same facing and close; facing apart only face to face (back to back is harmless)
        fac_ = (arr_r['N'][P[:, 0]] * arr_r['N'][P[:, 1]]).sum(1) if len(P) else np.zeros(0)
        close = (np.abs(D) < (TOL if r == 0 else TOL_LEFT)) & ((fac_ >= 0) | (D > -1e-4))
        rec = {'pairs': ast.get('pairs', 0), 'close': int(close.sum())}
        if r == 0 and len(P): st['top_pairs'] = _names(P[close], arr_r, MATS)
        if os.environ.get('BXCOP_DEBUG') and r >= 1 and close.any():
            key_prev = {(int(a_), int(b_)): i_ for i_, (a_, b_) in enumerate(zip(prev['set'], prev['tri']))}
            gcount = {}
            for s_ in sets_r: gcount[s_.gid] = gcount.get(s_.gid, 0) + 1
            for a_, b_ in P[close][:8].tolist():
                info = []
                for t_ in (a_, b_):
                    si_ = int(arr_r['set'][t_]); s_ = sets_r[si_]; ip = key_prev.get((si_, int(arr_r['tri'][t_])))
                    info.append('%s/%s gid%d x%d lift0 %s n %s y %s' % (s_.name[:28], s_.kind, s_.gid, gcount[s_.gid], None if ip is None else round(float(prev_lift[ip]) * 1000, 2),
                                np.round(arr_r['N'][t_], 2).tolist(), np.round(arr_r['V'][t_][:, 1], 4).tolist()))
                print('[coplanar] dbg r%d gap %.2f mm | %s || %s' % (r, float(D[close][(P[close][:, 0] == a_) & (P[close][:, 1] == b_)][0]) * 1000, info[0], info[1]))
                ia = key_prev.get((int(arr_r['set'][a_]), int(arr_r['tri'][a_]))); ib = key_prev.get((int(arr_r['set'][b_]), int(arr_r['tri'][b_])))
                if ia is not None and ib is not None:
                    m_ = ((prevP[:, 0] == ia) & (prevP[:, 1] == ib)) | ((prevP[:, 0] == ib) & (prevP[:, 1] == ia))
                    print('[coplanar] dbg    in prev P:', int(m_.sum()), 'D', np.round(prevD[m_] * 1000, 2).tolist(), 'prev y', np.round(prevV[ia][:, 1], 4).tolist(), np.round(prevV[ib][:, 1], 4).tolist(),
                          'xz a', np.round(prevV[ia][:, [0, 2]], 1).tolist(), 'xz b', np.round(prevV[ib][:, [0, 2]], 1).tolist())
        if not close.any() or r == ROUNDS:
            P2 = P[close]; st['rounds'].append(rec); break
        gcnt = {}
        for s_ in sets_r: gcnt[s_.gid] = gcnt.get(s_.gid, 0) + (0 if s_.kind == 'ground' else 1)
        shared_set = np.array([gcnt.get(s_.gid, 0) > 1 and s_.kind != 'ground' for s_ in sets_r], dtype=bool)
        lift, rst = resolve(P, D, arr_r['N'], arr_r['level'] + pull[arr_r['set']] * LSB * 1000, arr_r['order'], arr_r['owner'], arr_r['var'],
                            shared=shared_set[arr_r['set']])
        # ST38 (STATIONS2; BX_ST38=0 as before): a street-kit flag mesh moves as one piece. Its dark joint floor (the walk
        # triangle, 3 mm under the flags cut from it) and its flags are one owner, so the audit never orders them; a floor
        # lifted alone (its walk triangle overlapping a neighbouring tile's, whose ground the audit had lifted) rose over its
        # own flags and drew dark wedges on the walk (t8StNickDiveE f75-100 by the A C B D elevator). The mesh takes the
        # largest lift any of its triangles asked for.
        # PIPEFIX (2026-10-05): the mesh is a whole tile's flags. Since GF38 the walk reaches the building line, where a
        # few flags lie within 0.5-2 mm of a shop's floor, a plaza or a granite base and ask for 2-5 mm; the whole tile's
        # flags took that every round (rigid lifts 47k, 32k, 17k triangles in rounds 2-4) and climbed into the kerb tops
        # (curb_granite | sidewalk_concrete, 305-642 pairs in view on eight shots). Now a triangle of a flag mesh that
        # rises takes with it only what stands on it in the same mesh (the flags cut from a joint floor, over the floor's
        # footprint and up to 9 mm over its plane): the floor never passes its own flags, nothing else moves.
        # BX_ST38=tile: the whole-mesh rule as before.
        if os.environ.get('BX_ST38', '1') not in ('0', 'tile'):
            pfl = pull[arr_r['set']] == SK_PULL['flags']
            if pfl.any():
                lift, npush = st38_local(lift, pfl, arr_r['set'], arr_r['V'], arr_r['N'])
                rec['skflags_pushed'] = npush
        elif os.environ.get('BX_ST38', '1') == 'tile':
            pfl = pull[arr_r['set']] == SK_PULL['flags']
            if pfl.any():
                sid = arr_r['set'][pfl]
                mx = np.zeros(int(arr_r['set'].max()) + 1)
                np.maximum.at(mx, sid, lift[pfl])
                rigid = mx[sid]
                rec['skflags_rigid'] = int((rigid > lift[pfl] + 1e-6).sum())
                lift = lift.copy(); lift[pfl] = rigid
        rec.update(rst); rec['lifted'] = int((lift > 0).sum())
        st['rounds'].append(rec)
        _p(log, 'round', r, rec)
        apply(sets_r, arr_r, (lift[:, None] * arr_r['N'])[:, None, :] * np.ones((1, 3, 1)))
        prev = {'set': arr_r['set'], 'tri': arr_r['tri']}; prev_lift = lift
        if os.environ.get('BXCOP_DEBUG'): prevP, prevD, prevV = P, D, arr_r['V']
    # what is left: the pairs in view (inside a frame's frustum within VIEW_R; a pair 2 km off in the region's far corner
    # or behind the lens never reaches a pixel) fail the write; the two instances of one prototype in one plane (a pool placing the same part twice over
    # itself) cannot be parted by moving the prototype's points: counted apart
    st['unresolved_all'] = int(len(P2))
    if len(P2):
        cen = arr_r['V'][P2[:, 0]].mean(1)
        near = np.zeros(len(P2), bool)
        dview = np.full(len(P2), np.inf)   # the nearest distance at which the pair is in view
        if cams:   # in view: inside some frame's frustum (the page camera: fov vertical, aspect) and within VIEW_R
            for c in cams:
                m = np.asarray(c['m'], dtype=np.float64)
                t, X, Y, Z = m[12:15], m[0:3], m[4:7], m[8:11]
                dv = cen - t
                xc, yc, zc = dv @ X, dv @ Y, dv @ Z
                th = np.tan(np.radians(float(c.get('fov', 58))) / 2)
                dd = np.linalg.norm(dv, axis=1)
                inside = (zc < -0.4) & (np.abs(xc) < -zc * th * float(c.get('aspect', 16 / 9)) * 1.05) & (np.abs(yc) < -zc * th * 1.05) & (dd < VIEW_R)
                near |= inside
                dview = np.where(inside, np.minimum(dview, dd), dview)
                fpx = 720.0 / th   # pixels per metre at 1 m (1440 rows over the vertical field)
        elif lens is not None and len(lens):
            L_ = np.asarray(lens, dtype=np.float64)
            dmin = np.full(len(cen), np.inf)
            for c0 in range(0, len(L_), 16):
                dd = np.linalg.norm(cen[:, None, [0, 2]] - L_[None, c0:c0 + 16, [0, 2]], axis=2).min(1)
                dmin = np.minimum(dmin, dd)
            near = dmin < VIEW_R
        else:
            near = np.ones(len(P2), bool)
        same = arr_r['var'][P2[:, 0]] == arr_r['var'][P2[:, 1]]   # two instances of one prototype triangle
        # sub-pixel: the smaller triangle (the overlap is no larger) projects under one pixel at the nearest frame that sees it
        Vp = arr_r['V']
        ar_ = lambda t: 0.5 * np.linalg.norm(np.cross(Vp[t, 1] - Vp[t, 0], Vp[t, 2] - Vp[t, 0]), axis=1)
        amin = np.minimum(ar_(P2[:, 0]), ar_(P2[:, 1]))
        fpx_ = 720.0 / np.tan(np.radians(float((cams or [{}])[0].get('fov', 58))) / 2)
        px2 = amin * (fpx_ / np.maximum(dview, 0.4)) ** 2
        sub = near & ~same & (px2 < 1.0)
        st['unresolved_subpixel'] = int(sub.sum())
        st['unresolved_far'] = int((~near).sum())
        near &= ~sub
        st['unresolved_same_geo'] = int((near & same).sum())
        P2n = P2[near & ~same]
        st['unresolved_same_geo_pairs'] = _names(P2[near & same], arr_r, MATS, 6)
        cs = {}
        for a_, b_ in P2[near & same][:3000].tolist():
            k_ = sets_r[int(arr_r['set'][a_])].name[:40]; cs[k_] = cs.get(k_, 0) + 1
        st['unresolved_same_geo_sets'] = sorted(cs.items(), key=lambda kv: -kv[1])[:6]
        P2 = P2n
    st['unresolved'] = int(len(P2))
    if len(P2):
        st['unresolved_pairs'] = _names(P2, arr_r, MATS)
        st['unresolved_at'] = [[round(float(x), 2) for x in p_] for p_ in arr_r['V'][P2[:8, 0]].mean(1)]
    # write
    for gid, dd in geo_disp.items():
        G = load_geo(gid)
        set_geo_points(gid, G['position'].astype(np.float64) + dd)
    for path, Pw in ground_new.items():
        set_ground_points(path, Pw.reshape(-1, 3))
    st['geos_moved'] = len(geo_disp); st['grounds_moved'] = len(ground_new)
    st['secs'] = round(time.time() - t0, 1)
    return st


# ------------------------------------------------------------------------------------------------ standalone audit
if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--in', dest='inp', required=True); ap.add_argument('--shot', required=True)
    ap.add_argument('--max', type=int, default=45_000_000)
    a = ap.parse_args()
    man = json.load(open(os.path.join(a.inp, 'manifest.json')))
    GEOS = {g['id']: g for g in man['geos']}; MATS = {m['id']: m for m in man['mats']}
    _gc = {}
    def load_geo(gid):
        if gid in _gc: return _gc[gid]
        g = GEOS[gid]; raw = open(os.path.join(a.inp, g['file']), 'rb').read(); out = {}
        for L in g['layout']:
            dt = np.float32 if L['type'] == 'f32' else np.uint32
            arr_ = np.frombuffer(raw, dtype=dt, count=L['count'] * L['itemSize'], offset=L['offset'])
            out[L['name']] = arr_.reshape(-1, L['itemSize']) if L['itemSize'] > 1 else arr_
        if 'index' not in out: out['index'] = np.arange(len(out['position']), dtype=np.uint32)
        out['ntri'] = len(out['index']) // 3; out['index'] = out['index'][:out['ntri'] * 3]; out['groups'] = g.get('groups') or []
        _gc[gid] = out; return out
    Sd = json.load(open(os.path.join(a.inp, man['shots'][a.shot]['staticFile'])))
    objs = [(i, o) for i, o in enumerate(Sd['objects'])]
    # the ground as the writer lays it, without its same-kind layers: each kind at its bias (zb x 1.5 mm)
    zb = {3: 10, 4: 10, 13: 10, 14: 10, 9: 8, 11: 4, 12: 4, 15: -4, 7: -8, 10: -2}
    gpaths, gpts = {}, {}
    for i, o in objs:
        if o['geo'] < 0 or o.get('far'): continue
        G = load_geo(o['geo'])
        if 'matId' in G:
            I = G['index'].reshape(-1, 3).astype(np.int64); P = G['position'].astype(np.float64)
            if o.get('matrix') is not None:
                Mm = np.array(o['matrix']).reshape(4, 4); P = P @ Mm[:3, :3] + Mm[3, :3]
            k = np.round(G['matId'][I[:, 0]]).astype(np.int64)
            T = P[I].copy(); off = np.zeros(len(I))
            for kk, v in zb.items(): off[k == kk] = v * LSB
            T[:, :, 1] += off[:, None]
            gpaths[i] = 'g%d' % i; gpts['g%d' % i] = T.reshape(-1, 3)
    cams = json.load(open(os.path.join(a.inp, man['shots'][a.shot]['camFile'])))
    lens = [(c['m'][12], c['m'][13], c['m'][14]) for c in cams]
    st = run(objs, Sd.get('pools') or [], Sd.get('instanced') or [], load_geo, MATS, gpaths, lambda p: gpts.get(p),
             lambda gid, P: None, lambda path, P: None, max_tris=a.max, lens=lens, cams=cams)
    for k in ('overlay_mids', 'interior_mids'): st[k] = len(st[k])
    print(json.dumps(st, indent=1))
