# SP37: Central Park's tree species. Called by flora_place.py. Replaces the CP32 form mix (ten forms by a handful of
# zones, drawn tree by tree) with a species model fitted to the published composition of the park, then maps each
# species onto the nearest of the kit's forms (furnitureKit TREE_FORMS). Sources and figures: docs/notes/cp-species.md.
#
#   SPECIES  key -> (name, scientific name, form, conifer stand-in, sources of its share)
#   TARGET   the park-wide share of each species, as a percentage of the placed trees (1982 survey, Loeb 1993 Table 2,
#            brought up to the 2011-2024 counts: oaks, elms, evergreens, sweetgum; ash and tree of heaven reduced)
#   MIX      the species weights by zone (woods, drives, the wall, open landscape, the Reservoir, Cherry Hill ...)
#   AFF      how a species leans toward large or small crowns (log units per 4 m of crown width about 12 m)
# Each free tree takes its zone's weights times its crown affinity, the species multipliers are then fitted (iterative
# proportional fitting, then on the drawn counts) until the drawn shares meet TARGET; a tree draws from the species its
# 40-80 m patch is dominated by with the zone's coherence, else from its own weights (stands and rows, not salt and pepper).
import math
import numpy as np

# key: (name, scientific name, form, conifer)
SPECIES = {
    'bc': ('black cherry', 'Prunus serotina', 'Y', 0),
    'oc': ('ornamental cherry (Yoshino, Kwanzan, Higan, Okame)', 'Prunus x yedoensis, serrulata, subhirtella', 'Y', 0),
    'bl': ('black locust', 'Robinia pseudoacacia', 'H', 0),
    'hl': ('honeylocust and Japanese pagoda tree', 'Gleditsia triacanthos, Styphnolobium japonicum', 'H', 0),
    'ah': ('tree of heaven', 'Ailanthus altissima', 'H', 0),
    'po': ('pin oak', 'Quercus palustris', 'Q', 0),
    'ro': ('red oak', 'Quercus rubra', 'S', 0),
    'to': ('Turkey oak', 'Quercus cerris', 'S', 0),
    'oo': ('white, black, scarlet, willow and swamp white oak', 'Quercus alba, velutina, coccinea, phellos, bicolor', 'S', 0),
    'nm': ('Norway maple', 'Acer platanoides', 'M', 0),
    'sm': ('sycamore maple', 'Acer pseudoplatanus', 'M', 0),
    'rm': ('red, sugar and silver maple', 'Acer rubrum, saccharum, saccharinum', 'M', 0),
    'ae': ('American elm', 'Ulmus americana', 'Z', 0),
    'ee': ('English, Siberian and Chinese elm, zelkova', 'Ulmus procera, pumila, parvifolia, Zelkova serrata', 'Z', 0),
    'lp': ('London plane', 'Platanus x acerifolia', 'P', 0),
    'as': ('American sycamore', 'Platanus occidentalis', 'P', 0),
    'wa': ('white and green ash', 'Fraxinus americana, pennsylvanica', 'S', 0),
    'hk': ('hackberry', 'Celtis occidentalis', 'Z', 0),
    'mb': ('mulberry', 'Morus rubra, alba', 'S', 0),
    'li': ('linden', 'Tilia x europaea, tomentosa, americana, cordata', 'L', 0),
    'gk': ('ginkgo', 'Ginkgo biloba', 'G', 0),
    'sg': ('sweetgum', 'Liquidambar styraciflua', 'Q', 0),
    'tt': ('tulip tree', 'Liriodendron tulipifera', 'Q', 0),
    'bt': ('black tupelo', 'Nyssa sylvatica', 'Q', 0),
    'hw': ('hickory and black walnut', 'Carya, Juglans nigra', 'S', 0),
    'bh': ('beech', 'Fagus sylvatica, grandifolia', 'M', 0),
    'sa': ('sassafras', 'Sassafras albidum', 'W', 0),
    'hb': ('American hornbeam', 'Carpinus caroliniana', 'W', 0),
    'sf': ('small flowering and understorey trees (hawthorn, crabapple, dogwood, magnolia, serviceberry, redbud)', 'Crataegus, Malus, Cornus, Magnolia, Amelanchier, Cercis', 'W', 0),
    'wp': ('willow and poplar', 'Salix, Populus', 'Z', 0),
    'cf': ('conifers (white and Austrian pine, spruce, hemlock, cedar)', 'Pinus, Picea, Tsuga, Cedrus, Juniperus', 'Q', 1),
    'mc': ('catalpa, paulownia, Kentucky coffeetree, cork tree, Osage orange, goldenrain tree', 'Catalpa, Paulownia, Gymnocladus, Phellodendron, Maclura, Koelreuteria', 'S', 0),
    'cr': ('crabapple (Conservatory Garden allees)', 'Malus', 'W', 0),
    'cp': ('Callery pear', 'Pyrus calleryana', 'R', 0),
}
KEYS = list(SPECIES)
IDX = {k: i for i, k in enumerate(KEYS)}
SPCH = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

# park-wide shares (% of the placed trees); the sum is normalised to 100. Loeb 1993 Table 2 (1982 survey of every tree over
# 15 cm dbh, Central Park Conservancy): black cherry 18.7, black locust 7.2, pin oak 6.7, Norway maple 6.0, American elm 5.9,
# London plane 5.5, sycamore maple 4.2, white ash 3.7, red oak 3.3, English elm 2.3, tree of heaven 2.2, ginkgo 1.9, Turkey
# oak 1.8, hackberry 1.7, red mulberry 1.7, ornamental cherry 1.6, sassafras 1.5, hornbeam 1.2, sweetgum 1.1, black pine 1.1,
# lindens 2.8. Updated to the 2011 map (oaks 2,854 = 14 %, pin oak just over half, red oak 584, Turkey oak 356) and the
# Conservancy's 2024 counts (about 2,500 elms of which 1,600 American; almost 1,000 evergreens of 18,000).
TARGET = {
    'bc': 18.5, 'oc': 2.6, 'bl': 7.2, 'hl': 1.2, 'ah': 1.0,
    'po': 7.0, 'ro': 3.2, 'to': 1.8, 'oo': 1.9,
    'nm': 6.0, 'sm': 4.2, 'rm': 1.2,
    'ae': 7.0, 'ee': 4.0, 'lp': 5.5, 'as': 0.5, 'wa': 2.5, 'hk': 1.7, 'mb': 2.0,
    'li': 2.8, 'gk': 1.9, 'sg': 1.0, 'tt': 0.6, 'bt': 0.5, 'hw': 1.0, 'bh': 0.6,
    'sa': 1.5, 'hb': 1.2, 'sf': 3.5, 'wp': 1.3, 'cf': 4.0, 'mc': 2.5, 'cr': 0.0, 'cp': 0.0,
}

# crown-size leaning: weight x exp(k * clip((crown width - 12 m) / 4, -1.5, 1.5)); big trees of the park are planes, elms,
# red and sycamore maples; small crowns are the understorey and the small ornamentals
AFF = {'bc': -0.25, 'oc': -0.25, 'bl': -0.2, 'hl': -0.15, 'ah': -0.1, 'po': 0.0, 'ro': 0.3, 'to': 0.2, 'oo': 0.2,
       'nm': 0.2, 'sm': 0.25, 'rm': 0.0, 'ae': 0.4, 'ee': 0.25, 'lp': 0.45, 'as': 0.4, 'wa': 0.1, 'hk': 0.1, 'mb': 0.0,
       'li': -0.05, 'gk': 0.0, 'sg': 0.0, 'tt': 0.2, 'bt': -0.1, 'hw': 0.15, 'bh': 0.2, 'sa': -0.55, 'hb': -0.7,
       'sf': -0.7, 'wp': 0.2, 'cf': -0.1, 'mc': -0.1, 'cr': 0.0, 'cp': 0.0}

# species weights by zone (any scale). Zones of flora_place.py: wood (OSM natural=wood: the Ramble, North Woods, Hallett),
# drive (within 14 m of a drive), edgew / edgee (within 18 m of the park wall, the Central Park West side and the Fifth Avenue side), else (lawn groves, meadow edges, knolls), res (within
# 28 m of the Reservoir), chill (Cherry Hill), pilg (Pilgrim Hill), pine (the Arthur Ross
# Pinetum), crab (the Conservatory Garden's allees)
MIX = {
    # self-sown black cherry and black locust dominate the Ramble; Hallett overgrown with Norway maple and black cherry;
    # North Woods: black cherry, pin, red and scarlet oak, red maple, American elm; the Ramble: red oak, sweetgum, pin oak,
    # sassafras, red maple, black cherry, tupelo, hackberry, American sycamore, tulip tree; the ravine's hemlocks
    'wood': {'bc': 27, 'bl': 11, 'nm': 7, 'sm': 3, 'rm': 5, 'po': 5, 'ro': 6, 'oo': 4, 'to': 0.5, 'sg': 3, 'tt': 1.5, 'bt': 3,
             'ae': 3, 'ee': 1, 'hk': 3, 'wa': 3, 'sa': 4, 'hb': 3, 'sf': 3, 'mb': 1, 'ah': 1, 'hw': 1.5, 'bh': 0.8,
             'as': 1.5, 'cf': 3, 'mc': 1.5, 'lp': 0.5},
    # planted shade trees along the drives: planes, elms, pin and red oaks, lindens, honeylocust; volunteers between them
    'drive': {'lp': 14, 'ae': 14, 'ee': 4, 'po': 12, 'ro': 7, 'to': 2, 'oo': 1.5, 'li': 4, 'nm': 5, 'sm': 2, 'rm': 1.5, 'hl': 4,
              'bl': 3, 'gk': 2, 'hk': 2, 'bc': 8, 'oc': 3, 'wa': 2.5, 'sg': 1.5, 'tt': 1, 'sf': 4, 'mb': 1, 'cf': 3, 'mc': 1,
              'as': 0.5},
    # the wall: pin oaks line Central Park West (Conservancy: Pin Oak), elms and planes the Fifth Avenue side, volunteers behind
    'edgew': {'po': 28, 'lp': 9, 'ae': 8, 'ee': 4, 'ro': 6, 'to': 2, 'oo': 1.5, 'li': 4, 'nm': 5, 'sm': 3, 'hl': 5, 'bl': 5,
              'gk': 2.5, 'hk': 2, 'bc': 8, 'oc': 2, 'wa': 2, 'sf': 3, 'cf': 2, 'mb': 1.5, 'mc': 1.5, 'rm': 1},
    'edgee': {'ae': 15, 'ee': 7, 'lp': 12, 'po': 6, 'ro': 6, 'to': 2, 'oo': 1.5, 'li': 6, 'nm': 5, 'sm': 3, 'hl': 5, 'bl': 4,
              'gk': 3, 'hk': 2, 'bc': 7, 'oc': 3, 'wa': 2, 'sf': 4, 'cf': 2, 'mb': 1, 'mc': 1.5, 'rm': 1},
    # lawn groves, meadow edges, rock knolls ("from rock outcrops to woodland edges" for the black cherry)
    'else': {'bc': 17, 'bl': 6, 'po': 7, 'ro': 3, 'to': 2, 'oo': 2, 'nm': 5, 'sm': 4, 'rm': 1.5, 'ae': 7, 'ee': 4, 'lp': 5, 'li': 2.5,
             'gk': 1.5, 'hk': 1.5, 'wa': 2.5, 'mb': 2, 'sg': 1, 'tt': 0.6, 'bt': 0.5, 'hw': 1, 'bh': 0.6, 'sa': 1.5, 'hb': 1,
             'sf': 3.5, 'wp': 1.3, 'cf': 3.5, 'mc': 2.2, 'hl': 1.2, 'ah': 1, 'oc': 2},
    # the Reservoir: Yoshino (gift of Japan, 1912), the Kwanzan allee on the west side, Okame scattered, between the
    # planes, oaks and elms of the track
    'res': {'oc': 38, 'bc': 4, 'lp': 12, 'po': 8, 'ae': 8, 'ro': 5, 'nm': 4, 'sm': 3, 'bl': 3, 'li': 3, 'gk': 2, 'hk': 3, 'ee': 3,
            'sf': 2, 'hl': 2},
    'chill': {'oc': 52, 'ae': 12, 'ee': 5, 'ro': 6, 'lp': 6, 'po': 5, 'bc': 5, 'nm': 4, 'li': 2, 'hl': 3},
    'pilg': {'oc': 20, 'bc': 12, 'ae': 12, 'ee': 4, 'nm': 8, 'sm': 4, 'ro': 6, 'po': 5, 'lp': 5, 'li': 3, 'hk': 3, 'wa': 3,
             'sf': 3, 'cf': 4, 'bl': 4, 'oo': 4},
    'pine': {'cf': 90, 'oo': 4, 'ro': 3, 'bc': 3},
    'crab': {'cr': 70, 'oc': 15, 'li': 15},
}
# how strongly a tree follows the stand its patch is dominated by, and the patch size (m)
COH = {'wood': (0.40, 55.0), 'drive': (0.50, 40.0), 'edgew': (0.45, 45.0), 'edgee': (0.45, 45.0), 'else': (0.35, 80.0), 'res': (0.45, 40.0),
       'chill': (0.30, 60.0), 'pilg': (0.30, 60.0), 'pine': (0.0, 60.0), 'crab': (0.0, 60.0)}


def hsh(a, b, k):
    return (math.sin(a * (12.9898 + 0.31 * k) + b * (78.233 - 0.17 * k) + 4.1 + 1.7 * k) * 43758.5453) % 1.0


def tag_species(tg):
    """OpenStreetMap genus / species tags -> species key (None when the tag names nothing the model has)."""
    if not tg:
        return None
    if tg.get('leaf_type') == 'needleleaved':
        return 'cf'
    g = (tg.get('genus') or tg.get('species') or '').split(' ')[0].lower()
    sp = (tg.get('species') or '').lower()
    if g == 'platanus': return 'as' if 'occidentalis' in sp else 'lp'
    if g == 'ulmus': return 'ae' if 'americana' in sp else 'ee'
    if g == 'zelkova': return 'ee'
    if g == 'quercus':
        return 'po' if 'palustris' in sp else 'ro' if 'rubra' in sp else 'to' if 'cerris' in sp else 'oo'
    if g == 'ginkgo': return 'gk'
    if g == 'tilia': return 'li'
    if g == 'robinia': return 'bl'
    if g in ('gleditsia', 'sophora', 'styphnolobium'): return 'hl'
    if g == 'acer': return 'nm' if 'platanoides' in sp else 'sm' if 'pseudoplatanus' in sp else 'rm'
    if g == 'prunus': return 'bc' if 'serotina' in sp else 'oc'
    if g == 'liriodendron': return 'tt'
    if g == 'liquidambar': return 'sg'
    if g == 'celtis': return 'hk'
    if g == 'fagus': return 'bh'
    if g == 'pyrus': return 'cp'
    if g in ('phellodendron', 'broussonetia'): return 'mc'
    if g in ('magnolia', 'malus', 'syringa', 'cercis', 'betula', 'cornus', 'crataegus', 'oxydendrum'): return 'sf'
    return None


def assign(zone, cw, u, v, fixed, log=print):
    """zone, cw, u, v: per tree (lists / arrays); fixed: per tree a species key already decided (OSM tag, the Mall) or None.
    Returns the species key of every tree."""
    N = len(zone)
    S = len(KEYS)
    cw = np.asarray(cw, float)
    free = [i for i in range(N) if fixed[i] is None]
    tgt = np.array([TARGET.get(k, 0.0) for k in KEYS])
    tgt = tgt / tgt.sum() * N
    for i in range(N):
        if fixed[i] is not None:
            tgt[IDX[fixed[i]]] -= 1
    tgt = np.maximum(tgt, 0)
    tgt = tgt / max(tgt.sum(), 1e-9) * len(free)
    W = np.zeros((len(free), S))
    for j, i in enumerate(free):
        t = max(-1.5, min(1.5, (cw[i] - 12.0) / 4.0))
        for k, w in MIX[zone[i]].items():
            W[j, IDX[k]] = w * math.exp(AFF.get(k, 0.0) * t)
    c = np.ones(S)

    def probs(c):
        P = W * c
        return P / P.sum(1, keepdims=True)

    for _ in range(80):
        E = probs(c).sum(0)
        m = (tgt > 0) & (E > 1e-9)
        c[m] *= (tgt[m] / E[m]) ** 0.7
    # patch dominants and the draw (deterministic from the positions)
    zk = sorted(set(zone))
    def draw(c):
        P = probs(c)
        Pz = {z: P[[j for j, i in enumerate(free) if zone[i] == z]].mean(0) for z in zk if any(zone[i] == z for i in free)}
        dom = {}
        out = [None] * N
        for i in range(N):
            if fixed[i] is not None:
                out[i] = fixed[i]
        for j, i in enumerate(free):
            z = zone[i]
            coh, ps = COH[z]
            h1, h2 = hsh(u[i], v[i], 1), hsh(u[i], v[i], 2)
            pk = (z, int(u[i] // ps), int(v[i] // ps))
            if pk not in dom:
                hp = hsh(pk[1] * 17.0 + 3.0, pk[2] * 13.0 + 5.0, 3 + zk.index(z))
                dom[pk] = int(np.searchsorted(np.cumsum(Pz[z]), hp * Pz[z].sum()))
            d = min(dom[pk], S - 1)
            if h1 < coh and W[j, d] > 0:
                out[i] = KEYS[d]
            else:
                out[i] = KEYS[min(int(np.searchsorted(np.cumsum(P[j]), h2 * P[j].sum())), S - 1)]
        return out
    out = draw(c)
    for it in range(12):
        cnt = np.zeros(S)
        for i in free:
            cnt[IDX[out[i]]] += 1
        m = (tgt > 0) & (cnt > 0)
        err = float(np.abs(cnt[m] / tgt[m] - 1).max())
        if err < 0.04:
            break
        c[m] *= (tgt[m] / cnt[m]) ** 0.6
        out = draw(c)
    log('species fit: max relative error %.3f after %d rounds, multipliers %.2f-%.2f' % (err, it + 1, c[tgt > 0].min(), c[tgt > 0].max()))
    cnt = np.zeros(S)
    for i in free:
        cnt[IDX[out[i]]] += 1
    log('  ' + ' '.join('%s %d/%d x%.2f' % (k, cnt[IDX[k]], tgt[IDX[k]], c[IDX[k]]) for k in KEYS if tgt[IDX[k]] > 0))
    return out
