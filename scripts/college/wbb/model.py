#!/usr/bin/env python3
"""WBB team-rating model (pure Python stdlib).

Points model, one observation per team-game:
    pts(A vs B) = mu + hca_A + O_A + D_B + noise
    hca_A = +h/2 if A is the home team, -h/2 if away, 0 at neutral sites
O = offensive rating (pts scored above average), D = defensive rating (pts allowed above
average; lower is better).  Ridge penalty lam pulls each O/D toward a prior (rho * last
season's final rating, or a fixed "unknown team" prior for teams with no prior-season data,
which in practice are mostly non-D-I opponents and D-I newcomers).  Margins are capped
at `cap` for training by pulling both scores toward their mean (total preserved).
Solved by Gauss-Seidel coordinate descent (exact ridge solution at convergence).
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")

DEFAULTS = dict(lam=3.0, cap=30.0, rho=0.6, unk_o=-8.0, unk_d=8.0, sweeps=60, warm_sweeps=10, prior_min_games=10)


def load(tag):
    return json.load(open(os.path.join(DATA, f"games_{tag}.json")))


def final_games(games):
    out = []
    for g in games:
        if not g.get("completed") or g.get("status") != "STATUS_FINAL":
            continue
        h, a = g.get("home"), g.get("away")
        if not h or not a or h.get("score") is None or a.get("score") is None:
            continue
        if h["score"] == 0 and a["score"] == 0:
            continue
        out.append(g)
    return out


def pick_line(g):
    """Closing line: prefer DraftKings (pre-game), then ESPN BET, then any non-live book."""
    ods = [o for o in (g.get("odds") or []) if "Live" not in (o.get("provider") or "")]
    if not ods:
        return None
    order = {"DraftKings": 0, "ESPN BET": 1}
    ods.sort(key=lambda o: order.get(o.get("provider"), 9))
    spread = total = None
    prov = None
    for o in ods:
        if spread is None and o.get("home_spread_close") is not None:
            spread, prov = o["home_spread_close"], o["provider"]
        if total is None and o.get("total"):
            total = float(o["total"])
    o0 = ods[0]
    return {"spread": spread, "total": total, "provider": prov,
            "spread_open": o0.get("home_spread_open"), "total_open": o0.get("total_open"),
            "home_ml": o0.get("home_ml_close"), "away_ml": o0.get("away_ml_close")}


class Ratings:
    def __init__(self, O, D, mu, h, n):
        self.O, self.D, self.mu, self.h, self.n = O, D, mu, h, n

    def team(self, t, prior=None):
        return self.O.get(t), self.D.get(t)

    def predict(self, home, away, neutral, prior=None):
        """Return (home_pts, away_pts) expected."""
        def od(t):
            if t in self.O:
                return self.O[t], self.D[t]
            return prior.get(t, (None, None)) if prior else (None, None)
        oh, dh = od(home)
        oa, da = od(away)
        if oh is None:
            oh, dh = self._unk
        if oa is None:
            oa, da = self._unk
        hh = 0.0 if neutral else self.h / 2
        return self.mu + hh + oh + da, self.mu - hh + oa + dh

    def net(self, t):
        return self.O[t] - self.D[t]


def fit(games, prior=None, params=None, warm=None):
    """games: list of final games. prior: {team_id: (O, D)} (already regressed) or None."""
    p = dict(DEFAULTS); p.update(params or {})
    lam, cap = p["lam"], p["cap"]
    unk = (p["unk_o"], p["unk_d"])
    obs = []  # (off_team, def_team, y_raw, hsign)
    teams = set()
    for g in games:
        hs, as_ = float(g["home"]["score"]), float(g["away"]["score"])
        m = hs - as_
        if abs(m) > cap:
            avg = (hs + as_) / 2
            hs, as_ = avg + math.copysign(cap / 2, m), avg - math.copysign(cap / 2, m)
        sgn = 0.0 if g["neutral"] else 1.0
        ht, at = g["home"]["id"], g["away"]["id"]
        obs.append((ht, at, hs, sgn))
        obs.append((at, ht, as_, -sgn))
        teams.add(ht); teams.add(at)
    pri = {}
    for t in teams:
        pri[t] = prior[t] if (prior and t in prior) else unk
    if warm:
        O = {t: warm.O.get(t, pri[t][0]) for t in teams}
        D = {t: warm.D.get(t, pri[t][1]) for t in teams}
        mu, h = warm.mu, warm.h
    else:
        O = {t: pri[t][0] for t in teams}
        D = {t: pri[t][1] for t in teams}
        mu, h = (sum(o[2] for o in obs) / len(obs) if obs else 70.0), 3.0
    by_off, by_def = {t: [] for t in teams}, {t: [] for t in teams}
    for i, (a, b, y, s) in enumerate(obs):
        by_off[a].append(i); by_def[b].append(i)
    nobs = len(obs)
    n_home = sum(1 for o in obs if o[3] != 0)
    for _ in range(p["warm_sweeps"] if warm else p["sweeps"]):
        # mu, h (unpenalized; h lightly anchored at 3 for tiny samples)
        mu = sum(y - s * h / 2 - O[a] - D[b] for a, b, y, s in obs) / nobs
        if n_home:
            num = sum(s / 2 * (y - mu - O[a] - D[b]) for a, b, y, s in obs if s) + 5.0 * 3.0 / 4
            den = n_home / 4 + 5.0 / 4
            h = num / den
        for t in teams:
            idx = by_off[t]
            r = sum(obs[i][2] - mu - obs[i][3] * h / 2 - D[obs[i][1]] for i in idx)
            O[t] = (r + lam * pri[t][0]) / (len(idx) + lam)
        for t in teams:
            idx = by_def[t]
            r = sum(obs[i][2] - mu - obs[i][3] * h / 2 - O[obs[i][0]] for i in idx)
            D[t] = (r + lam * pri[t][1]) / (len(idx) + lam)
    R = Ratings(O, D, mu, h, len(games))
    R._unk = unk
    R.games_played = {t: len(by_off[t]) for t in teams}
    return R


def make_prior(R, rho, min_games=10):
    """Regress last season's final ratings toward 0 by factor rho (teams with >= min_games)."""
    if R is None:
        return None
    return {t: (rho * R.O[t], rho * R.D[t]) for t in R.O if R.games_played.get(t, 0) >= min_games}


def phi(x):
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))
