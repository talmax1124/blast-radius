#!/usr/bin/env python3
"""Fetch NCAA D-I women's college basketball games + closing lines from ESPN public APIs.

Usage:
  python3 fetch.py season2027            # current season (2026-27), Nov 1 2026 .. today
  python3 fetch.py season2026            # last season (2025-26), Nov 1 2025 .. Apr 10 2026
  python3 fetch.py today                 # refresh today's slate (scores/status/odds), no caching of odds

Outputs (data/):
  games_<season>.json   condensed game list (one record per event)
  odds_cache.json       event_id -> condensed odds (completed games only; immutable)
  raw scoreboards are not kept (condensed records hold everything used).
"""
import json, os, sys, time, random, threading, datetime as dt
import urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
os.makedirs(DATA, exist_ok=True)
SB = ("https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/"
      "scoreboard?dates={d}&groups=50&limit=400")
ODDS = ("https://sports.core.api.espn.com/v2/sports/basketball/leagues/womens-college-basketball/"
        "events/{e}/competitions/{e}/odds")
UA = {"User-Agent": "Mozilla/5.0 (compatible; research-script)"}


def get_json(url, tries=6):
    delay = 1.0
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (403, 429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(delay + random.random()); delay *= 2; continue
            raise
        except Exception:
            if i < tries - 1:
                time.sleep(delay + random.random()); delay *= 2; continue
            raise


def condense_event(ev, qdate):
    c = ev["competitions"][0]
    st = c["status"]["type"]
    teams = {}
    for t in c["competitors"]:
        tm = t["team"]
        teams[t["homeAway"]] = {
            "id": tm["id"], "name": tm.get("displayName"), "abbr": tm.get("abbreviation"),
            "score": int(t["score"]) if t.get("score") not in (None, "") else None,
            "conf": (tm.get("conferenceId") or None),
        }
    site_odds = None
    if c.get("odds"):
        o = c["odds"][0]
        site_odds = {"details": o.get("details"), "spread": o.get("spread"), "overUnder": o.get("overUnder"),
                     "provider": (o.get("provider") or {}).get("name")}
    return {
        "id": ev["id"], "date_utc": ev["date"], "qdate": qdate,
        "season": ev.get("season", {}).get("year"), "season_type": ev.get("season", {}).get("type"),
        "neutral": bool(c.get("neutralSite")), "conf_game": bool(c.get("conferenceCompetition")),
        "state": st.get("state"), "completed": bool(st.get("completed")), "status": st.get("name"),
        "detail": st.get("shortDetail"),
        "home": teams.get("home"), "away": teams.get("away"), "site_odds": site_odds,
    }


def _num(x):
    try:
        return float(str(x).replace("+", "")) if x not in (None, "", "EVEN") else (100.0 if x == "EVEN" else None)
    except ValueError:
        return None


def condense_odds(d):
    if not d or not d.get("items"):
        return []
    out = []
    for it in d["items"]:
        h, a = it.get("homeTeamOdds") or {}, it.get("awayTeamOdds") or {}
        def ps(side, when):
            return _num(((side.get(when) or {}).get("pointSpread") or {}).get("american"))
        def pr(side, when, key):
            return _num(((side.get(when) or {}).get(key) or {}).get("american"))
        def tot(when):
            return _num((((it.get(when) or {}).get("total") or {}).get("american") or "").lstrip("ou"))
        sp = it.get("spread")
        # top-level spread is home-perspective on ESPN; verify with favorite flag when possible
        home_close = ps(h, "close")
        if home_close is None and sp is not None:
            home_close = float(sp)
        out.append({
            "provider": (it.get("provider") or {}).get("name"), "provider_id": (it.get("provider") or {}).get("id"),
            "priority": (it.get("provider") or {}).get("priority"),
            "details": it.get("details"), "spread_top": sp, "total": it.get("overUnder"),
            "home_spread_close": home_close, "home_spread_open": ps(h, "open"),
            "home_spread_odds_close": pr(h, "close", "spread"), "away_spread_odds_close": pr(a, "close", "spread"),
            "home_ml_close": pr(h, "close", "moneyLine"), "away_ml_close": pr(a, "close", "moneyLine"),
            "home_ml_open": pr(h, "open", "moneyLine"), "away_ml_open": pr(a, "open", "moneyLine"),
            "total_open": tot("open"), "total_close": tot("close"),
            "home_fav": h.get("favorite"),
        })
    return out


def daterange(a, b):
    d = a
    while d <= b:
        yield d
        d += dt.timedelta(days=1)


def fetch_season(tag, start, end, odds=True):
    dates = [d.strftime("%Y%m%d") for d in daterange(start, end)]
    games = {}
    lock = threading.Lock()

    def one(ds):
        js = get_json(SB.format(d=ds))
        evs = (js or {}).get("events", [])
        with lock:
            for ev in evs:
                g = condense_event(ev, ds)
                games[g["id"]] = g
        return ds, len(evs)

    with ThreadPoolExecutor(8) as ex:
        for ds, n in ex.map(one, dates):
            if n:
                print(ds, n, file=sys.stderr)
    glist = sorted(games.values(), key=lambda g: g["date_utc"])
    if odds:
        attach_odds(glist)
    else:
        for g in glist:
            g["odds"] = []
    path = os.path.join(DATA, f"games_{tag}.json")
    with open(path, "w") as f:
        json.dump(glist, f, separators=(",", ":"))
    print(f"wrote {path}: {len(glist)} games", file=sys.stderr)
    return glist


def attach_odds(glist, cache_completed=True):
    cpath = os.path.join(DATA, "odds_cache.json")
    cache = json.load(open(cpath)) if os.path.exists(cpath) else {}
    todo = [g for g in glist if (g["id"] not in cache) or not g["completed"]]
    print(f"odds to fetch: {len(todo)}", file=sys.stderr)

    def one(g):
        try:
            return g["id"], condense_odds(get_json(ODDS.format(e=g["id"])))
        except Exception as e:  # keep going
            print("odds fail", g["id"], e, file=sys.stderr)
            return g["id"], None

    byid = {g["id"]: g for g in todo}
    done = 0
    with ThreadPoolExecutor(12) as ex:
        for eid, od in ex.map(one, todo):
            done += 1
            if od is None:
                continue
            g = byid[eid]
            if g["completed"] and cache_completed:
                cache[eid] = od
            g["odds"] = od
            if done % 500 == 0:
                print(f"  odds {done}/{len(todo)}", file=sys.stderr)
                json.dump(cache, open(cpath, "w"), separators=(",", ":"))
    for g in glist:
        if "odds" not in g:
            g["odds"] = cache.get(g["id"], [])
    json.dump(cache, open(cpath, "w"), separators=(",", ":"))


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "season2027"
    today = dt.date(2026, 11, 26)
    if what == "season2027":
        fetch_season("2027", dt.date(2026, 11, 1), today)
    elif what == "season2026":
        fetch_season("2026", dt.date(2025, 11, 1), dt.date(2026, 4, 10))
    elif what == "season2025":  # 2024-25, scores only (used to build a prior for 2025-26)
        fetch_season("2025", dt.date(2024, 11, 1), dt.date(2025, 4, 10), odds=False)
    elif what == "today":
        fetch_season("2027_today", today, today)
    else:
        sys.exit("unknown target")
