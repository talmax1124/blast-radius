#!/usr/bin/env python3
"""Fetch NCAA D-I men's basketball results + DraftKings lines from ESPN public APIs.

Caches (in ./data):
  games_<season>.json  {date: [game,...]}  per scoreboard date (US Eastern date key)
  odds.json            {event_id: {spread_home, total, ...} or null}

Usage:
  python3 fetch.py current            # 2026-27 season through today (refetch last 2 days + today)
  python3 fetch.py prior              # 2025-26 season (for preseason prior), results only
  python3 fetch.py odds               # closing odds for completed current-season games (+ today)
"""
import json, os, sys, time, random, datetime as dt, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
SB = ("https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/"
      "scoreboard?dates={d}&groups=50&limit=400")
ODDS = ("https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/"
        "events/{e}/competitions/{e}/odds")
UA = {"User-Agent": "Mozilla/5.0 (research script)", "Accept": "application/json"}

TODAY = os.environ.get("CBB_TODAY", "20261126")


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
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if i < tries - 1:
                time.sleep(delay + random.random()); delay *= 2; continue
            raise


def load(name, default):
    p = os.path.join(DATA, name)
    if os.path.exists(p):
        with open(p) as f:
            return json.load(f)
    return default


def save(name, obj):
    os.makedirs(DATA, exist_ok=True)
    p = os.path.join(DATA, name)
    tmp = p + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(tmp, p)


def parse_line(s):
    try:
        return float(str(s).replace("+", "")) if s not in (None, "", "EVEN") else (0.0 if s == "EVEN" else None)
    except ValueError:
        return None


def parse_event(e, dkey):
    c = e["competitions"][0]
    comp = {x["homeAway"]: x for x in c["competitors"]}
    if "home" not in comp or "away" not in comp:
        return None
    h, a = comp["home"], comp["away"]
    st = c["status"]["type"]
    g = {
        "id": e["id"], "date": dkey, "start": c.get("startDate") or e.get("date"),
        "state": st.get("state"), "completed": bool(st.get("completed")),
        "status": st.get("shortDetail"),
        "neutral": bool(c.get("neutralSite")),
        "conf_game": bool(c.get("conferenceCompetition")),
        "home_id": h["team"]["id"], "away_id": a["team"]["id"],
        "home": h["team"].get("shortDisplayName") or h["team"].get("displayName"),
        "away": a["team"].get("shortDisplayName") or a["team"].get("displayName"),
        "home_abbr": h["team"].get("abbreviation"), "away_abbr": a["team"].get("abbreviation"),
        "home_conf": h["team"].get("conferenceId"), "away_conf": a["team"].get("conferenceId"),
        "home_score": int(h["score"]) if h.get("score") not in (None, "") else None,
        "away_score": int(a["score"]) if a.get("score") not in (None, "") else None,
        "periods": c["status"].get("period"),
    }
    # scoreboard odds (usually only present for upcoming games)
    od = c.get("odds") or []
    if od:
        o = od[0]
        g["sb_odds"] = {"details": o.get("details"), "overUnder": o.get("overUnder"),
                        "spread": o.get("spread"),
                        "provider": (o.get("provider") or {}).get("name")}
    return g


def daterange(a, b):
    d = dt.date(int(a[:4]), int(a[4:6]), int(a[6:]))
    e = dt.date(int(b[:4]), int(b[4:6]), int(b[6:]))
    while d <= e:
        yield d.strftime("%Y%m%d")
        d += dt.timedelta(days=1)


def fetch_season(name, start, end, refetch_recent=0):
    cache = load(name, {})
    dates = list(daterange(start, end))
    todo = [d for d in dates if d not in cache] + [d for d in dates[-refetch_recent:] if d in cache] if refetch_recent else [d for d in dates if d not in cache]
    todo = sorted(set(todo))

    def one(d):
        js = get_json(SB.format(d=d))
        evs = (js or {}).get("events", [])
        out = [g for g in (parse_event(e, d) for e in evs) if g]
        time.sleep(0.15)
        return d, out

    with ThreadPoolExecutor(4) as ex:
        for i, (d, out) in enumerate(ex.map(one, todo)):
            cache[d] = out
            if i % 10 == 0:
                print(f"  {name} {d}: {len(out)} games", flush=True)
                save(name, cache)
    save(name, cache)
    n = sum(len(v) for v in cache.values())
    print(f"{name}: {len(cache)} dates, {n} games")
    return cache


def extract_odds(js):
    if not js or not js.get("items"):
        return None
    items = js["items"]
    # prefer DraftKings (id 100), then lowest priority value
    items.sort(key=lambda it: (0 if (it.get("provider") or {}).get("id") == "100" else 1,
                               (it.get("provider") or {}).get("priority", 99)))
    it = items[0]
    ho = it.get("homeTeamOdds") or {}
    def ps(side, key):
        try:
            return parse_line(side[key]["pointSpread"]["american"])
        except (KeyError, TypeError):
            return None
    def tot(key):
        try:
            return parse_line(it[key]["total"]["american"])
        except (KeyError, TypeError):
            return None
    close_sp = ps(ho, "close")
    open_sp = ps(ho, "open")
    spread = it.get("spread")
    return {
        "provider": (it.get("provider") or {}).get("name"),
        "details": it.get("details"),
        "spread_home_close": close_sp if close_sp is not None else spread,
        "spread_home_open": open_sp,
        "spread_field": spread,
        "total_close": tot("close") if tot("close") is not None else it.get("overUnder"),
        "total_open": tot("open"),
        "home_ml": (ho.get("moneyLine")),
        "away_ml": ((it.get("awayTeamOdds") or {}).get("moneyLine")),
        "fetched": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }


def fetch_odds(ids, refresh=()):
    cache = load("odds.json", {})
    todo = [i for i in ids if i not in cache] + [i for i in refresh]
    todo = sorted(set(todo))
    print(f"odds: {len(todo)} to fetch ({len(cache)} cached)")

    def one(e):
        try:
            js = get_json(ODDS.format(e=e))
        except Exception as ex:  # keep going; leave uncached for retry
            print("  odds fail", e, ex)
            return e, "ERR"
        time.sleep(0.1)
        return e, extract_odds(js)

    with ThreadPoolExecutor(6) as ex:
        for k, (e, o) in enumerate(ex.map(one, todo)):
            if o != "ERR":
                cache[e] = o
            if k % 100 == 0:
                print(f"  odds {k}/{len(todo)}", flush=True)
                save("odds.json", cache)
    save("odds.json", cache)
    have = sum(1 for i in ids if cache.get(i) and cache[i].get("spread_home_close") is not None)
    print(f"odds: {have}/{len(ids)} with spread")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "current"
    if cmd == "current":
        fetch_season("games_2027.json", "20261101", TODAY, refetch_recent=3)
    elif cmd == "prior":
        fetch_season("games_2026.json", "20251101", "20260410")
    elif cmd == "odds":
        g = load("games_2027.json", {})
        ids = [x["id"] for d, v in g.items() for x in v if x["completed"] or d == TODAY]
        today_ids = [x["id"] for x in g.get(TODAY, [])]
        fetch_odds(ids, refresh=today_ids)
    else:
        print(__doc__)
