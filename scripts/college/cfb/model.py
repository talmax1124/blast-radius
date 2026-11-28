#!/usr/bin/env python3
"""CFB rating models (pure Python stdlib).

Margin model (spreads):
    margin_home = hfa * (not neutral) + r_home - r_away + e
    weighted ridge, each team rating shrunk toward a prior p_t:
        p_t = rho * r_t(previous season final) + (1 - rho) * mean_prev(group of t)
    (groups: FBS / FCS / other, decided from this season's schedule). margins capped at +-cap.

Points model (totals):
    pts_team = mu + hp * (team is home, not neutral) + o_team - d_opp + e
    two rows per game; o and d shrunk toward previous-season values the same way.
    predicted total = pts_home + pts_away.

Solver: preconditioned conjugate gradient on the sparse normal equations.
"""
import json, math, os, collections

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

P4_CONFS = {"1", "4", "5", "8"}  # ACC, Big 12, Big Ten, SEC (ESPN conference ids)
NOTRE_DAME = "87"


# ----------------------------------------------------------------------------- data
def home_spread(g):
    """Closing home spread (negative = home favored) or None."""
    o = g.get("odds") or {}
    if o.get("none") or not o:
        return None
    sp = o.get("spread")
    if sp is None:
        sp = o.get("close_spread_home")
    if sp is None:
        return None
    d = (o.get("details") or "").split()
    if d:
        ab = d[0]
        if ab == g.get("home_abbr") and sp > 0:
            sp = -sp
        elif ab == g.get("away_abbr") and sp < 0:
            sp = -sp
    return float(sp)


def total_line(g):
    o = g.get("odds") or {}
    t = o.get("overUnder")
    return float(t) if t is not None else None


def load_season(season):
    gs = json.load(open(os.path.join(DATA, f"games_{season}.json")))
    c80, c81 = collections.Counter(), collections.Counter()
    for g in gs:
        for s in ("home_id", "away_id"):
            if 80 in g["groups"]:
                c80[g[s]] += 1
            if 81 in g["groups"]:
                c81[g[s]] += 1
    tier = {}
    for t in set(c80) | set(c81):
        tier[t] = "FBS" if c80[t] >= 5 else ("FCS" if c81[t] >= 5 else "OTH")
    done = [g for g in gs if g["completed"] and g["home_score"] is not None and g["away_score"] is not None]
    return gs, done, tier


def is_p4(g, side):
    return g.get(side + "_conf") in P4_CONFS or g.get(side + "_id") == NOTRE_DAME


# ----------------------------------------------------------------------------- solver
def solve_ridge(rows, n, pen, prior, iters=400, tol=1e-9):
    """rows: list of (list[(idx,val)], y, w). Minimize sum w(y - x.b)^2 + sum pen_i (b_i - prior_i)^2."""
    # build A (sparse dict-of-dicts) and rhs
    A = [collections.defaultdict(float) for _ in range(n)]
    b = [pen[i] * prior[i] for i in range(n)]
    for i in range(n):
        A[i][i] += pen[i]
    for xs, y, w in rows:
        for i, vi in xs:
            b[i] += w * vi * y
            Ai = A[i]
            for j, vj in xs:
                Ai[j] += w * vi * vj
    A = [list(d.items()) for d in A]
    diag = [dict(r).get(i, 1.0) or 1.0 for i, r in enumerate(A)]

    def mv(v):
        return [sum(a * v[j] for j, a in r) for r in A]

    x = list(prior)
    Ax = mv(x)
    r = [b[i] - Ax[i] for i in range(n)]
    z = [r[i] / diag[i] for i in range(n)]
    p = z[:]
    rz = sum(r[i] * z[i] for i in range(n))
    bn = math.sqrt(sum(v * v for v in b)) or 1.0
    for _ in range(iters):
        Ap = mv(p)
        pAp = sum(p[i] * Ap[i] for i in range(n))
        if pAp <= 0:
            break
        a = rz / pAp
        for i in range(n):
            x[i] += a * p[i]
            r[i] -= a * Ap[i]
        if math.sqrt(sum(v * v for v in r)) / bn < tol:
            break
        z = [r[i] / diag[i] for i in range(n)]
        rz2 = sum(r[i] * z[i] for i in range(n))
        beta = rz2 / rz
        rz = rz2
        p = [z[i] + beta * p[i] for i in range(n)]
    return x


# ----------------------------------------------------------------------------- models
DEFAULT = dict(lam=4.0, rho=0.6, cap=28.0, half_life=None, pts_cap=63.0, lam_pts=4.0, rho_pts=0.6, mkt_w=0.0)
# mkt_w > 0 adds each PAST game's closing line as a pseudo-observation with that weight
# ("market-informed" ratings); 0 = pure results model.


def _game_weights(games, ref_date, half_life_days):
    if not half_life_days:
        return [1.0] * len(games)
    from datetime import datetime
    ref = datetime.fromisoformat(ref_date.replace("Z", "+00:00"))
    ws = []
    for g in games:
        d = datetime.fromisoformat(g["date"].replace("Z", "+00:00"))
        age = max(0.0, (ref - d).total_seconds() / 86400.0)
        ws.append(0.5 ** (age / half_life_days))
    return ws


def _group_means(prev, prev_tier):
    gm = {}
    for grp in ("FBS", "FCS", "OTH"):
        vals = [v for t, v in prev.items() if prev_tier.get(t) == grp]
        gm[grp] = sum(vals) / len(vals) if vals else None
    if gm["OTH"] is None:
        gm["OTH"] = (gm["FCS"] or 0.0) - 15.0
    if gm["FCS"] is None:
        gm["FCS"] = -20.0
    if gm["FBS"] is None:
        gm["FBS"] = 0.0
    return gm


GROUPS = ("FCS", "OTH")  # FBS group offset fixed at 0 (reference)
DEFAULT_GM = {"FBS": 0.0, "FCS": -22.0, "OTH": -40.0}


def _tier_of(t, tier, prev_tier):
    return tier.get(t) or (prev_tier or {}).get(t) or "OTH"


def fit_margin(games, tier, prev=None, prev_tier=None, params=None, ref_date=None):
    """rating_t = G[group(t)] + d_t ; d_t ridge-shrunk toward rho * (prev deviation)."""
    P = dict(DEFAULT, **(params or {}))
    teams = sorted({g["home_id"] for g in games} | {g["away_id"] for g in games} | set((prev or {}).keys()))
    idx = {t: i for i, t in enumerate(teams)}
    T = len(teams)
    gidx = {grp: T + k for k, grp in enumerate(GROUPS)}
    H = T + len(GROUPS)
    n = H + 1
    grp_of = {t: _tier_of(t, tier, prev_tier) for t in teams}

    def tx(t, sign):
        xs = [(idx[t], sign)]
        if grp_of[t] in gidx:
            xs.append((gidx[grp_of[t]], sign))
        return xs

    ws = _game_weights(games, ref_date, P["half_life"]) if ref_date else [1.0] * len(games)
    rows = []
    for g, w in zip(games, ws):
        m = g["home_score"] - g["away_score"]
        if P["cap"]:
            m = max(-P["cap"], min(P["cap"], m))
        xs = tx(g["home_id"], 1.0) + tx(g["away_id"], -1.0)
        if not g["neutral"]:
            xs.append((H, 1.0))
        rows.append((xs, m, w))
        if P.get("mkt_w"):
            sp = home_spread(g)
            if sp is not None:
                rows.append((xs, -sp, w * P["mkt_w"]))
    prior = [0.0] * n
    pen = [P["lam"]] * n
    gm = _group_means(prev, prev_tier) if prev else dict(DEFAULT_GM)
    for grp, j in gidx.items():
        prior[j] = gm[grp] - gm["FBS"]
        pen[j] = 1.0  # weak: data decides the FCS-vs-FBS gap
    if prev:
        for t, i in idx.items():
            if t in prev:
                prior[i] = P["rho"] * (prev[t] - gm[grp_of[t]])
    prior[H] = 2.5
    pen[H] = 20.0  # mild prior on HFA ~ 2.5
    x = solve_ridge(rows, n, pen, prior)
    G = {"FBS": 0.0}
    G.update({grp: x[j] for grp, j in gidx.items()})
    raw = {t: x[idx[t]] + G[grp_of[t]] for t in teams}
    fbs = [raw[t] for t in teams if grp_of[t] == "FBS"]
    c = sum(fbs) / len(fbs) if fbs else 0.0
    rat = {t: v - c for t, v in raw.items()}
    return {"rating": rat, "hfa": x[H], "groups": {k: v - c for k, v in G.items()}}


def predict_margin(m, g):
    r = m["rating"]
    dflt = m["groups"].get("FCS", -20.0)
    return r.get(g["home_id"], dflt) - r.get(g["away_id"], dflt) + (0.0 if g["neutral"] else m["hfa"])


def fit_points(games, tier, prev=None, prev_tier=None, params=None, ref_date=None):
    """prev: dict team -> (o, d) from previous season. o_t = Go[grp] + do_t, d_t = Gd[grp] + dd_t."""
    P = dict(DEFAULT, **(params or {}))
    teams = sorted({g["home_id"] for g in games} | {g["away_id"] for g in games} | set((prev or {}).keys()))
    T = len(teams)
    idx = {t: i for i, t in enumerate(teams)}
    go = {grp: 2 * T + k for k, grp in enumerate(GROUPS)}
    gd = {grp: 2 * T + len(GROUPS) + k for k, grp in enumerate(GROUPS)}
    MU = 2 * T + 2 * len(GROUPS)
    HP = MU + 1
    n = HP + 1
    grp_of = {t: _tier_of(t, tier, prev_tier) for t in teams}
    ws = _game_weights(games, ref_date, P["half_life"]) if ref_date else [1.0] * len(games)
    rows = []
    for g, w in zip(games, ws):
        for side, opp, home in (("home", "away", 1), ("away", "home", 0)):
            y = g[side + "_score"]
            if P["pts_cap"]:
                y = min(P["pts_cap"], y)
            a, b = g[side + "_id"], g[opp + "_id"]
            xs = [(idx[a], 1.0), (T + idx[b], -1.0), (MU, 1.0)]
            if grp_of[a] in go:
                xs.append((go[grp_of[a]], 1.0))
            if grp_of[b] in gd:
                xs.append((gd[grp_of[b]], -1.0))
            if home and not g["neutral"]:
                xs.append((HP, 1.0))
            rows.append((xs, y, w))
            if P.get("mkt_w"):
                sp, tl = home_spread(g), total_line(g)
                if sp is not None and tl is not None:
                    implied = (tl - sp) / 2.0 if home else (tl + sp) / 2.0
                    rows.append((xs, implied, w * P["mkt_w"]))
    prior = [0.0] * n
    pen = [P["lam_pts"]] * n
    if prev:
        po = {t: v[0] for t, v in prev.items()}
        pdd = {t: v[1] for t, v in prev.items()}
        gmo, gmd = _group_means(po, prev_tier), _group_means(pdd, prev_tier)
    else:
        gmo = {"FBS": 0.0, "FCS": -11.0, "OTH": -20.0}
        gmd = {"FBS": 0.0, "FCS": -11.0, "OTH": -20.0}
    for grp in GROUPS:
        prior[go[grp]], pen[go[grp]] = gmo[grp] - gmo["FBS"], 1.0
        prior[gd[grp]], pen[gd[grp]] = gmd[grp] - gmd["FBS"], 1.0
    if prev:
        for t, i in idx.items():
            if t in prev:
                prior[i] = P["rho_pts"] * (po[t] - gmo[grp_of[t]])
                prior[T + i] = P["rho_pts"] * (pdd[t] - gmd[grp_of[t]])
    prior[MU], pen[MU] = 27.0, 1e-3
    prior[HP], pen[HP] = 1.5, 20.0
    x = solve_ridge(rows, n, pen, prior)
    Go = {"FBS": 0.0}; Go.update({k: x[j] for k, j in go.items()})
    Gd = {"FBS": 0.0}; Gd.update({k: x[j] for k, j in gd.items()})
    off = {t: x[idx[t]] + Go[grp_of[t]] for t in teams}
    dfn = {t: x[T + idx[t]] + Gd[grp_of[t]] for t in teams}
    fbs = [t for t in teams if grp_of[t] == "FBS"]
    co = sum(off[t] for t in fbs) / len(fbs)
    cd = sum(dfn[t] for t in fbs) / len(fbs)
    off = {t: v - co for t, v in off.items()}
    dfn = {t: v - cd for t, v in dfn.items()}
    return {"off": off, "def": dfn, "mu": x[MU] + co - cd, "hp": x[HP],
            "g_off": Go.get("FCS", -10) - co, "g_def": Gd.get("FCS", -10) - cd}


def predict_points(m, g):
    o, d = m["off"], m["def"]
    do_, dd_ = m.get("g_off", -10), m.get("g_def", -10)
    ph = m["mu"] + o.get(g["home_id"], do_) - d.get(g["away_id"], dd_) + (0.0 if g["neutral"] else m["hp"])
    pa = m["mu"] + o.get(g["away_id"], do_) - d.get(g["home_id"], dd_)
    return ph, pa


# ----------------------------------------------------------------------------- season-level helpers
_prev_cache = {}


def prev_season_models(season, params=None):
    """Final ratings of `season` (fit with its own prior chain if available, no shrink-to-prior needed)."""
    key = (season, json.dumps(params or {}, sort_keys=True))
    if key in _prev_cache:
        return _prev_cache[key]
    gs, done, tier = load_season(season)
    p = dict(DEFAULT, **(params or {}))
    p_full = dict(p, lam=2.0, lam_pts=2.0)  # full season: light shrinkage, no prior
    mm = fit_margin(done, tier, params=p_full)
    pm = fit_points(done, tier, params=p_full)
    out = {"tier": tier, "rating": mm["rating"],
           "od": {t: (pm["off"][t], pm["def"][t]) for t in pm["off"]}}
    _prev_cache[key] = out
    return out
