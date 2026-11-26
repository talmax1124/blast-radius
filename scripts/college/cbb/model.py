"""CBB team-rating model (points-based offense/defense, ridge toward a prior).

Per game two observations (points scored by each side):
    pts_home = mu + o_home - d_away + hca/2      (hca = 0 at neutral sites)
    pts_away = mu + o_away - d_home - hca/2
Scores are adjusted so |margin| <= CAP (keeping the total), then o/d are fit by
coordinate descent minimising squared error + lam * ||(o,d) - prior||^2.
Positive o = good offense, positive d = good defense.
"""
import json, os, math

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")


def load_json(name, default=None):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        return default
    with open(p) as f:
        return json.load(f)


def completed_games(season_file, before=None):
    g = load_json(season_file, {})
    out = []
    for d in sorted(g):
        if before and d >= before:
            continue
        for x in g[d]:
            if x["completed"] and x["home_score"] is not None and x["away_score"] is not None \
                    and (x["home_score"] + x["away_score"]) > 0:
                out.append(x)
    return out


def capped(hs, as_, cap):
    m = hs - as_
    if cap is None or abs(m) <= cap:
        return float(hs), float(as_)
    t = hs + as_
    m = math.copysign(cap, m)
    return (t + m) / 2.0, (t - m) / 2.0


def fit(games, prior=None, lam=4.0, cap=25.0, hca=None, sweeps=60, default_prior=(0.0, 0.0)):
    """Return dict with mu, hca, o{tid}, d{tid}, n{tid}.

    prior: {"o": {tid: val}, "d": {tid: val}} (already regressed) or None (zeros).
    hca: fixed home-court margin advantage; if None it is fit (unpenalised).
    default_prior: (o, d) prior for teams absent from `prior`.
    """
    po = (prior or {}).get("o", {})
    pd = (prior or {}).get("d", {})
    rows = []  # (off_team, def_team, y, loc) loc=+1 home offense, -1 away offense, 0 neutral
    teams = set()
    for g in games:
        hs, as_ = capped(g["home_score"], g["away_score"], cap)
        loc = 0 if g["neutral"] else 1
        rows.append((g["home_id"], g["away_id"], hs, loc))
        rows.append((g["away_id"], g["home_id"], as_, -loc))
        teams.add(g["home_id"]); teams.add(g["away_id"])
    o = {t: po.get(t, default_prior[0]) for t in teams}
    d = {t: pd.get(t, default_prior[1]) for t in teams}
    pri_o = dict(o); pri_d = dict(d)
    n = {t: 0 for t in teams}
    by_off = {t: [] for t in teams}
    by_def = {t: [] for t in teams}
    for i, (a, b, y, loc) in enumerate(rows):
        by_off[a].append(i); by_def[b].append(i)
    for t in teams:
        n[t] = len(by_off[t])
    mu = sum(r[2] for r in rows) / max(1, len(rows))
    h = 3.0 if hca is None else hca
    for _ in range(sweeps):
        # mu
        s = 0.0
        for a, b, y, loc in rows:
            s += y - (o[a] - d[b] + h * loc / 2.0)
        mu = s / len(rows)
        # hca
        if hca is None:
            num = den = 0.0
            for a, b, y, loc in rows:
                if loc:
                    r = y - (mu + o[a] - d[b])
                    num += r * loc / 2.0; den += 0.25
            h = num / den if den else 3.0
        for t in teams:
            s = 0.0
            for i in by_off[t]:
                a, b, y, loc = rows[i]
                s += y - mu + d[b] - h * loc / 2.0
            o[t] = (s + lam * pri_o[t]) / (len(by_off[t]) + lam)
        for t in teams:
            s = 0.0
            for i in by_def[t]:
                a, b, y, loc = rows[i]
                s += -(y - mu - o[a] - h * loc / 2.0)
            d[t] = (s + lam * pri_d[t]) / (len(by_def[t]) + lam)
    return {"mu": mu, "hca": h, "o": o, "d": d, "n": n, "default_prior": default_prior,
            "prior_o": po, "prior_d": pd}


def team_od(R, t):
    if t in R["o"]:
        return R["o"][t], R["d"][t]
    return R["prior_o"].get(t, R["default_prior"][0]), R["prior_d"].get(t, R["default_prior"][1])


def predict(R, g):
    """Return (expected home margin, expected total, exp home pts, exp away pts)."""
    oh, dh = team_od(R, g["home_id"])
    oa, da = team_od(R, g["away_id"])
    loc = 0 if g["neutral"] else 1
    ph = R["mu"] + oh - da + R["hca"] * loc / 2.0
    pa = R["mu"] + oa - dh - R["hca"] * loc / 2.0
    return ph - pa, ph + pa, ph, pa


def build_prior(prev_ratings, regress=0.6):
    """Regress last season's final ratings toward the mean."""
    o = prev_ratings["o"]; d = prev_ratings["d"]; n = prev_ratings["n"]
    keep = [t for t in o if n.get(t, 0) >= 10]  # D-I-ish teams with a real sample
    low = [t for t in o if n.get(t, 0) < 10]    # mostly non-D-I opponents
    mo = sum(o[t] for t in keep) / len(keep)
    md = sum(d[t] for t in keep) / len(keep)
    # teams without a D-I sample last season get the average of last season's
    # non-D-I opponents (about -12 net), not zero
    dflt = (sum(o[t] - mo for t in low) / len(low), sum(d[t] - md for t in low) / len(low))
    return {"o": {t: regress * (o[t] - mo) for t in keep},
            "d": {t: regress * (d[t] - md) for t in keep},
            "default": dflt}


_prev_cache = {}


def prior_season_ratings(cap=25.0):
    key = cap
    if key not in _prev_cache:
        cache_name = f"ratings_2026_cap{int(cap)}.json"
        R = load_json(cache_name)
        if R is None:
            games = completed_games("games_2026.json")
            R = fit(games, prior=None, lam=2.0, cap=cap, hca=None, sweeps=80)
            R = {k: v for k, v in R.items() if k not in ("prior_o", "prior_d")}
            with open(os.path.join(DATA, cache_name), "w") as f:
                json.dump(R, f)
        R.setdefault("prior_o", {}); R.setdefault("prior_d", {})
        _prev_cache[key] = R
    return _prev_cache[key]


# --- odds helpers -----------------------------------------------------------

def market(odds, g):
    """(home spread, total) from cached closing odds, falling back to scoreboard odds."""
    o = odds.get(g["id"]) if odds else None
    sp = tot = None
    if o:
        sp = o.get("spread_home_close")
        tot = o.get("total_close")
    if (sp is None or tot is None) and g.get("sb_odds"):
        so = g["sb_odds"]
        if sp is None and so.get("spread") is not None:
            sp = so["spread"]
        if tot is None and so.get("overUnder") is not None:
            tot = so["overUnder"]
    return sp, tot


# --- stats ------------------------------------------------------------------

def wilson(k, n, z=1.96):
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    hw = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return c - hw, c + hw


def roi_110(w, l):
    n = w + l
    return (w * (100 / 110) - l) / n if n else float("nan")


def p_to_roi(p):
    return p * (1 + 100 / 110) - 1
