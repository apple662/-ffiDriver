#!/usr/bin/env python3
"""Erzeugt die Offline-Datenbasis ``data/berlin_lines.json``.

Standardquelle ist der bundesweite Soll-Fahrplan (DELFI e.V., Lizenz CC BY 4.0) von gtfs.de: der
Nahverkehr (``nv_free``: U-Bahn, Tram, Bus, Fähre) und der Regionalverkehr (``rv_free``: S-Bahn,
RE, RB). Die Haltestellen haben dort eigene Nummern und uneinheitliche Namen; sie werden über die
Koordinaten dem VBB-Haltestellenverzeichnis (npm-Paket ``vbb-stations``, CC BY 4.0) zugeordnet, so
bleiben die VBB-Nummern und -Namen erhalten. Die beiden ZIPs (zusammen gut 300 MB) werden
geladen und einen Tag lang in ``build/`` aufgehoben.

    python3 tools/build_data.py                              # Standard: gtfs.de
    python3 tools/build_data.py --nv nv.zip --rv rv.zip      # mit schon geladenen ZIPs von gtfs.de

Andere Quellen (älter):

    python3 tools/build_data.py --source npm      # npm-Pakete vbb-lines/vbb-stations (Stand März 2026)
    python3 tools/build_data.py --gtfs GTFS.zip   # ein GTFS-ZIP des VBB (https://www.vbb.de/vbbgtfs)

Das Skript wird nur einmal benötigt; das Programm selbst läuft danach
komplett offline.
"""

import argparse
import collections
import csv
import io
import json
import math
import re
import shutil
import sys
import tarfile
import time
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "berlin_lines.json"

NPM = "https://registry.npmjs.org/{name}"

# Betreiber im VBB-Datensatz: 1 = S-Bahn Berlin GmbH, 796 = BVG
OPERATORS = {"1", "796"}

# Linien, die im neuesten Fahrplan fehlen dürfen (z. B. wegen Bauarbeiten gesperrt), aber trotzdem ins
# Spiel sollen. Sie werden dann aus der letzten älteren Version übernommen, in der sie noch vorkommen.
# Die U4 fehlte von Februar bis März 2026 im VBB-Datensatz; die Fähren F21, F23 und F24 fahren nur im Sommer
# und fehlen deshalb im Winterfahrplan.
KEEP_LINES = ["U4", "F21", "F23", "F24"]
MAX_LOOKBACK = 12   # so viele ältere Versionen werden höchstens durchsucht
PRODUCTS = ("sbahn", "ubahn", "tram", "bus", "regio", "ice", "faehre", "bbus")
# ICE-Linien stehen nicht im VBB-Fahrplan; sie kommen aus dieser Datei (von Hand gepflegt)
ICE_FILE = ROOT / "data" / "ice_lines.json"
# Neue Linien, die im VBB-Datensatz noch fehlen (z. B. die S15), von Hand gepflegt
EXTRA_FILE = ROOT / "data" / "extra_lines.json"
ICE_COLOR = "#EC0016"   # DB-Rot
# Regionalzüge kommen von vielen Betreibern (DB Regio, ODEG, NEB …); genommen werden alle,
# die mindestens einmal in Berlin halten (Haltestellen-IDs „de:11000:…“).
BERLIN_PREFIX = "de:11000:"

# Busse in Brandenburg („bbus“): alle Buslinien der übrigen Betreiber, die in Brandenburg halten. Sie werden
# nach Landkreisen bzw. kreisfreien Städten eingeteilt (Gemeindeschlüssel in den Haltestellen-IDs „de:120xx:…“).
# Schlüssel -> (Kfz-Kennzeichen, Name, Farbe der Linienschilder)
REGIONS = {
    "12051": ("BRB", "Brandenburg an der Havel", "#1F6FA8"),
    "12052": ("CB", "Cottbus", "#C8102E"),
    "12053": ("FF", "Frankfurt (Oder)", "#7A3E9D"),
    "12054": ("P", "Potsdam", "#E07A2C"),
    "12060": ("BAR", "Barnim", "#2E8B57"),
    "12061": ("LDS", "Dahme-Spreewald", "#0B7FA3"),
    "12062": ("EE", "Elbe-Elster", "#9C6B30"),
    "12063": ("HVL", "Havelland", "#3E7CB1"),
    "12064": ("MOL", "Märkisch-Oderland", "#B5432F"),
    "12065": ("OHV", "Oberhavel", "#1D8A7A"),
    "12066": ("OSL", "Oberspreewald-Lausitz", "#6B5A9E"),
    "12067": ("LOS", "Oder-Spree", "#C0392B"),
    "12068": ("OPR", "Ostprignitz-Ruppin", "#4F7F45"),
    "12069": ("PM", "Potsdam-Mittelmark", "#D35400"),
    "12070": ("PR", "Prignitz", "#5D6D7E"),
    "12071": ("SPN", "Spree-Neiße", "#16A085"),
    "12072": ("TF", "Teltow-Fläming", "#8E44AD"),
    "12073": ("UM", "Uckermark", "#2C5AA0"),
}
REGION_ID = re.compile(r"de:(12\d{3}):")
RAIL_NAME = re.compile(r"^(S|U|RE|RB|FEX|ICE|IC)\d")

# GTFS route_type (VBB nutzt die erweiterten Typen) -> Verkehrsmittel
ROUTE_TYPES = {
    "109": "sbahn",
    "100": "regio", "106": "regio", "2": "regio",
    "400": "ubahn", "1": "ubahn",
    "900": "tram", "0": "tram",
    "700": "bus", "3": "bus",
    "1000": "faehre", "4": "faehre",
}
NPM_PRODUCTS = {"suburban": "sbahn", "subway": "ubahn", "tram": "tram", "bus": "bus", "regional": "regio",
                "ferry": "faehre"}

# Offizielle Linienfarben (BVG / S-Bahn Berlin)
LINE_COLORS = {
    "U1": "#7DAD4C", "U2": "#DA421E", "U3": "#16683D", "U4": "#F0D722",
    "U5": "#7E5330", "U6": "#8C6DAB", "U7": "#528DBA", "U8": "#224F86",
    "U9": "#F3791D",
    "S1": "#DC6BA6", "S2": "#007734", "S25": "#007734", "S26": "#007734",
    "S3": "#0066AD", "S41": "#AD5937", "S42": "#CB6418", "S45": "#CD9C53",
    "S46": "#CD9C53", "S47": "#CD9C53", "S5": "#EB7405", "S7": "#816DA6",
    "S75": "#816DA6", "S8": "#66AA22", "S85": "#66AA22", "S9": "#992746",
}
DEFAULT_COLORS = {"sbahn": "#008D4F", "ubahn": "#115D91", "tram": "#CC0A22", "bus": "#A5027D",
                  "regio": "#E2001A", "ice": "#EC0016", "faehre": "#0080BA", "bbus": "#C8102E"}

STATION_ID = re.compile(r"900\d{6}")


# Einige Bahnsteige haben im Fahrplan eine eigene Nummer, die im Haltestellenverzeichnis fehlt.
# Ohne Namen würden diese Halte wegfallen – deshalb werden sie der passenden Station zugeordnet.
STATION_ALIASES = {
    "900003200": "900003201",   # Berlin Hauptbahnhof, Regional- und Fernbahn (RE3, RE4, RE5, RE8, RB10, FEX …)
    "900100701": "900100011",   # U Stadtmitte, Bahnsteig der U2 (Umsteigen zur U6)
}


def station_key(stop_id):
    """Fasst Bahnsteige/Masten einer Haltestelle über die 900er-Nummer zusammen."""
    m = STATION_ID.search(stop_id)
    key = m.group(0) if m else stop_id
    return STATION_ALIASES.get(key, key)


def fetch(url):
    print("  lade", url, file=sys.stderr)
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def npm_versions(package):
    """Alle Versionen eines npm-Pakets, neueste zuerst."""
    meta = json.loads(fetch(NPM.format(name=package)))
    times = meta["time"]
    return sorted(meta["versions"], key=lambda v: times.get(v, ""), reverse=True), meta


def npm_files(package, *members, version=None, meta=None):
    """Lädt eine Version (Standard: die neueste) eines npm-Pakets und liefert die gewünschten Dateien."""
    meta = meta or json.loads(fetch(NPM.format(name=package)))
    version = version or meta["dist-tags"]["latest"]
    tarball = meta["versions"][version]["dist"]["tarball"]
    with tarfile.open(fileobj=io.BytesIO(fetch(tarball))) as tar:
        files = [tar.extractfile("package/" + m).read() for m in members]
    return files, f"{package}@{version}"


def parse_npm_lines(raw):
    lines = []
    for row in raw.decode("utf-8").splitlines():
        if not row.strip():
            continue
        line = json.loads(row)
        product = NPM_PRODUCTS.get(line["product"])
        if product == "bus" and line["operator"] not in OPERATORS:
            product = "bbus"                     # Bus eines anderen Betreibers: Bus in Brandenburg
        if not product or (line["operator"] not in OPERATORS and product not in ("regio", "bbus")):
            continue
        lines.append({
            "name": line["name"],
            "product": product,
            "operator": line["operator"] if product == "bbus" else "",
            "variants": [(v["stops"], v["trips"]) for v in line["variants"]],
        })
    return lines


def add_kept_lines(lines, versions, meta, include_latest=False):
    """Ergänzt Linien aus KEEP_LINES, die im neuesten Fahrplan fehlen, aus älteren Versionen von vbb-lines."""
    missing = [n for n in KEEP_LINES if not any(l["name"] == n for l in lines)]
    notes = []
    latest = meta["dist-tags"]["latest"]
    older = [v for v in versions if include_latest or v != latest][:MAX_LOOKBACK]
    for version in older:
        if not missing:
            break
        (raw,), label = npm_files("vbb-lines", "data.ndjson", version=version, meta=meta)
        for line in parse_npm_lines(raw):
            if line["name"] in missing:
                lines.append(line)
                missing.remove(line["name"])
                notes.append(f"{line['name']} aus {label}")
                print(f"  {line['name']} fehlt im neuesten Fahrplan, übernommen aus {label}", file=sys.stderr)
    for name in missing:
        print(f"  Warnung: {name} in keiner der letzten {MAX_LOOKBACK} Versionen gefunden", file=sys.stderr)
    return notes


def load_npm():
    """Liefert (Linien, Haltestellennamen, Koordinaten, Quellenangabe)."""
    versions, meta = npm_versions("vbb-lines")
    (raw_lines,), v_lines = npm_files("vbb-lines", "data.ndjson", meta=meta)
    (raw_names, raw_data), v_names = npm_files("vbb-stations", "names.json", "data.json")
    names = json.loads(raw_names)
    # data.json: [id, Name, Gewicht, Breite, Länge]
    coords = {row[0]: (row[3], row[4]) for row in json.loads(raw_data)}

    # Fehlende Namen aus der Stationsversion ergänzen, die zum Fahrplanstand passt
    # (im neuesten Verzeichnis fehlen manchmal Bahnhöfe, die im Fahrplan noch vorkommen)
    st_versions, st_meta = npm_versions("vbb-stations")
    lines_time = meta["time"][meta["dist-tags"]["latest"]]
    matching = next((v for v in st_versions if st_meta["time"].get(v, "") <= lines_time), None)
    if matching and matching != st_meta["dist-tags"]["latest"]:
        (old_names, old_data), _ = npm_files("vbb-stations", "names.json", "data.json", version=matching, meta=st_meta)
        for key, name in json.loads(old_names).items():
            names.setdefault(key, name)
        for row in json.loads(old_data):
            coords.setdefault(row[0], (row[3], row[4]))

    lines = parse_npm_lines(raw_lines)
    notes = add_kept_lines(lines, versions, meta)
    source = f"VBB-GTFS über {v_lines} und {v_names}"
    if notes:
        source += " (" + ", ".join(notes) + ")"
    return lines, names, coords, source


# --------------------------------------------------------------------------
# Standardquelle: bundesweiter Soll-Fahrplan (DELFI e.V.) über gtfs.de
# --------------------------------------------------------------------------

GTFS_DE = "https://download.gtfs.de/germany/{}_free/latest.zip"   # nv = Nahverkehr, rv = Regionalverkehr (Züge)
GTFS_DE_CACHE = ROOT / "build"                                    # Zwischenablage (steht in .gitignore)
MATCH_M = 60            # so nah muss ein Halt aus gtfs.de an einem Bahnsteig aus dem VBB-Verzeichnis liegen …
MATCH_NAME_M = 400      # … oder so nah, wenn auch ein Teil des Namens übereinstimmt (Bahnhöfe: Gleismitte statt Bahnhofspunkt)
MATCH_RAIL_M = 800      # bei Zügen noch etwas weiter (lange Bahnsteige, z. B. Spandau oder Hennigsdorf)
NAME_STOPWORDS = {"berlin", "bahnhof", "bhf", "gleis", "mast", "bstggl", "tief", "bus", "tram", "bln", "berl", "str",
                  "platz", "flixtrain"}
BVG_AGENCY = "Berliner Verkehrsbetriebe"
SBAHN_AGENCY = "S Bahn Berlin"
EV_NAME = re.compile(r"^S?EV\d*$", re.I)                             # Ersatzverkehr („EV“, „SEV“, „EV3“)
REGIO_NAME = re.compile(r"^(RE|RB|FEX|TES)")
COACH_AGENCY = re.compile(r"flix|blablacar|fernbus|eurolines|regiojet", re.I)       # Fernbusse gehören nicht dazu


def gtfs_de_zip(kind, path=None):
    """GTFS-ZIP von gtfs.de (``kind`` = "nv" oder "rv"); höchstens einen Tag alt, sonst neu laden."""
    if path:
        return Path(path)
    target = GTFS_DE_CACHE / f"gtfs-de-{kind}.zip"
    if not target.exists() or time.time() - target.stat().st_mtime > 86400:
        url = GTFS_DE.format(kind)
        print("  lade", url, file=sys.stderr)
        GTFS_DE_CACHE.mkdir(exist_ok=True)
        tmp = target.with_suffix(".part")
        with urllib.request.urlopen(url, timeout=600) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        tmp.replace(target)
    return target


def load_vbb_stations():
    """VBB-Haltestellenverzeichnis: (Namen, Koordinaten, [(Nummer, Name, Breite, Länge)], Quellenangabe)."""
    (raw_names, raw_data), label = npm_files("vbb-stations", "names.json", "data.json")
    names = json.loads(raw_names)
    rows = json.loads(raw_data)                     # [Nummer, Name, Gewicht, Breite, Länge]
    coords = {row[0]: (row[3], row[4]) for row in rows}
    return names, coords, [(row[0], row[1], row[3], row[4], row[2]) for row in rows], label


def name_words(name):
    """Kennzeichnende Wörter eines Haltestellennamens („S Wannsee Bhf (Berlin)“ -> {"wannsee"})."""
    text = name.lower().replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    text = re.sub(r"\bhbf\b", "hauptbahnhof", text)
    text = re.sub(r"(?<=[a-z])(strasse|str)\b", "str", text)      # „Kochstraße“ = „Kochstr.“
    return {w for w in re.split(r"[^a-z0-9]+", text) if len(w) >= 3 and w not in NAME_STOPWORDS}


class StopMatcher:
    """Findet zu einem Halt aus gtfs.de den passenden Bahnsteig bzw. Mast im VBB-Verzeichnis."""

    def __init__(self, rows):
        self.grid = collections.defaultdict(list)
        for key, name, lat, lon, weight in rows:
            self.grid[(int(lat * 100), int(lon * 60))].append((key, name_words(name), lat, lon, weight))

    def match(self, lat, lon, name="", rail=None):
        """Der nächste Halt mit gleichem Namensteil (bis 400 m), sonst der nächste überhaupt (bis 60 m).

        Unter den Halten mit gleichem Namensteil gewinnt der mit dem ähnlichsten Namen (Anteil gemeinsamer Wörter),
        bei Gleichstand der nächste – so wird aus „S Erkner Bhf“ „S Erkner“ und nicht die Bushaltestelle
        „S Erkner/ZOB“ daneben, aus „S Oranienburger Str.“ nicht „U Oranienburger Tor“.

        ``rail``: Menge der bekannten Bahnhöfe (VBB-Nummern). Bei Zügen wird zuerst unter ihnen gesucht – manche
        Bahnsteige heißen in gtfs.de wie die Bushaltestelle davor („Spandau S+U Rathaus Spandau Position 2“)."""
        if rail:
            hit = self._match(lat, lon, name, MATCH_RAIL_M, 150, lambda key: station_key(key) in rail)
            if hit:
                return hit
        return self._match(lat, lon, name, MATCH_NAME_M, MATCH_M)

    def _match(self, lat, lon, name, reach, near, allowed=None):
        words = name_words(name)
        best, best_d, named, named_score = None, near, None, None
        gx, gy = int(lat * 100), int(lon * 60)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for key, kw, la, lo, weight in self.grid.get((gx + dx, gy + dy), ()):
                    if allowed and not allowed(key):
                        continue
                    d = math.hypot((la - lat) * 111000, (lo - lon) * 68000)
                    if d < best_d:
                        best, best_d = key, d
                    common = words & kw
                    if d < reach and common:
                        score = (-len(common) / len(words | kw), d)
                        if named_score is None or score < named_score:
                            named, named_score = key, score
        return named or best


def gtfs_de_product(route_type, agency, name):
    """Verkehrsmittel im Spiel für eine Linie aus gtfs.de (oder None = nicht ins Spiel)."""
    bvg, sbahn = agency.startswith(BVG_AGENCY), agency.startswith(SBAHN_AGENCY)
    if route_type == "2":
        if sbahn:
            return "sbahn"
        # nur Regionalzüge (RE, RB, FEX); FlixTrain, Harz-Berlin-Express, Nachtzüge usw. nicht
        return "regio" if REGIO_NAME.match(name) else None
    if route_type == "1":
        return "ubahn" if bvg else None
    if route_type == "0":
        return "tram" if bvg else None
    if route_type == "3":
        if sbahn or EV_NAME.match(name) or COACH_AGENCY.search(agency):
            return None                             # Ersatzverkehr mit Bussen, Fernbusse
        return "bus" if bvg else "bbus"
    if route_type == "4":
        return "faehre"
    return None


def gtfs_seconds(text):
    h, m, sec = (int(v) for v in text.split(":"))
    return h * 3600 + m * 60 + sec


def load_gtfs_de(nv_path=None, rv_path=None):
    """Linien aus dem Nah- und Regionalverkehrs-GTFS von gtfs.de, Haltestellen aus dem VBB-Verzeichnis.

    Die Haltestellen in gtfs.de haben eigene Nummern und uneinheitliche Namen. Jeder Bahnsteig bzw. Mast wird
    deshalb über die Koordinaten dem nächsten Bahnsteig im VBB-Verzeichnis zugeordnet (meist nur wenige Meter
    entfernt); so bleiben die VBB-Nummern und -Namen erhalten. Halte außerhalb des VBB-Gebiets fallen weg.

    Liefert (Linien, Namen, Koordinaten, Quellenangabe, Fahrzeiten), Fahrzeiten wie ``build_times.collect``."""
    names, coords, rows, st_label = load_vbb_stations()
    matcher = StopMatcher(rows)
    # bekannte Bahnhöfe je Verkehrsmittel aus den letzten Ständen des VBB-Liniendatensatzes (dort fehlte z. B.
    # zeitweise die U4, deshalb mehrere Stände)
    versions, meta = npm_versions("vbb-lines")
    rail_sets = {"sbahn": set(), "regio": set(), "ubahn": set()}
    uses = {"suburban": ("sbahn", "regio"), "regional": ("regio",), "subway": ("ubahn",)}
    for version in versions[:4]:
        (raw,), _ = npm_files("vbb-lines", "data.ndjson", version=version, meta=meta)
        for row in raw.decode("utf-8").splitlines():
            if row.strip():
                line = json.loads(row)
                for product in uses.get(line["product"], ()):
                    rail_sets[product].update(station_key(stop) for v in line["variants"] for stop in v["stops"])
    variants = collections.defaultdict(collections.Counter)   # (Verkehrsmittel, Name, Betreiber) -> Halte -> Fahrten
    per_line = collections.defaultdict(collections.Counter)
    any_line = collections.defaultdict(collections.Counter)
    skipping = collections.defaultdict(collections.Counter)
    stand = []
    for kind, path in (("nv", nv_path), ("rv", rv_path)):
        zpath = gtfs_de_zip(kind, path)
        stand.append(time.strftime("%d.%m.%Y", time.localtime(zpath.stat().st_mtime)))
        with zipfile.ZipFile(zpath) as z:
            def table(name):
                with z.open(name) as f:
                    yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))

            agencies = {r["agency_id"]: r["agency_name"] for r in table("agency.txt")}
            routes = {}
            for r in table("routes.txt"):
                name = r["route_short_name"].strip()
                product = gtfs_de_product(r["route_type"], agencies.get(r["agency_id"], ""), name)
                if product and name:
                    routes[r["route_id"]] = (product, name, r["agency_id"] if product == "bbus" else "")
            trip_route = {t["trip_id"]: routes[t["route_id"]] for t in table("trips.txt") if t["route_id"] in routes}
            stops = {st["stop_id"]: (float(st["stop_lat"]), float(st["stop_lon"]), st["stop_name"])
                     for st in table("stops.txt") if st["stop_lat"] and st["location_type"] != "1"}
            matched = {}

            def stop_key(stop, product):
                """VBB-Bahnsteig zum Halt aus gtfs.de (gemerkt; bei Zügen zuerst unter den passenden Bahnhöfen)."""
                if (stop, product) not in matched:
                    lat, lon, name = stops[stop]
                    matched[(stop, product)] = matcher.match(lat, lon, name, rail_sets.get(product))
                return matched[(stop, product)]
            print(f"  {zpath.name}: {len(routes)} Linien, {len(trip_route)} Fahrten", file=sys.stderr)

            def finish(trip_id, seq):
                info = trip_route.get(trip_id)
                if not info:
                    return
                seq.sort()
                product, name, operator = info
                group = product if product in rail_sets else ""
                pts = [(stop_key(stop, group), arr, dep) for _, stop, arr, dep in seq]
                pts = [p for p in pts if p[0]]
                if len(pts) < 2:
                    return
                if product == "bbus" and len(pts) < len(seq) / 2:
                    return                                  # hält meist außerhalb des VBB (z. B. Fernbus)
                keys = [p[0] for p in pts]
                # Regionalzüge und Fähren nur, wenn sie in Berlin halten; Busse in Brandenburg nur dort
                if product in ("regio", "faehre") and not any(k.startswith(BERLIN_PREFIX) for k in keys):
                    return
                if product == "bbus" and not any(REGION_ID.search(k) for k in keys):
                    return
                variants[info][tuple(keys)] += 1
                sk = [station_key(k) for k in keys]
                for i in range(len(sk) - 1):
                    a, b = sk[i], sk[i + 1]
                    dep, arr = pts[i][2], pts[i + 1][1]
                    if a == b or arr < dep or arr - dep > 3 * 3600:
                        continue
                    per_line[(name, a, b)][arr - dep] += 1
                    any_line[(a, b)][arr - dep] += 1
                    for j in (i + 2, i + 3):        # über Zwischenhalte hinweg, falls die Linie im Spiel seltener hält
                        if j < len(sk) and sk[j] != a and dep <= pts[j][1] <= dep + 3 * 3600:
                            skipping[(name, a, sk[j])][pts[j][1] - dep] += 1

            current, seq = None, []
            for st in table("stop_times.txt"):    # die Zeilen einer Fahrt stehen in gtfs.de beieinander
                tid = st["trip_id"]
                if tid != current:
                    if seq:
                        finish(current, seq)
                    current, seq = tid, []
                if tid in trip_route and st["stop_id"] in stops:
                    seq.append((int(st["stop_sequence"]), st["stop_id"], gtfs_seconds(st["arrival_time"]),
                                gtfs_seconds(st["departure_time"])))
            if seq:
                finish(current, seq)

    lines = [{"name": name, "product": product, "operator": operator,
              "variants": [(list(stops), n) for stops, n in counter.items()]}
             for (product, name, operator), counter in variants.items()]
    notes = add_kept_lines(lines, versions, meta, include_latest=True)
    source = (f"Soll-Fahrplan Nah- und Regionalverkehr (DELFI e.V.) über gtfs.de, Stand {' / '.join(sorted(set(stand)))}; "
              f"Haltestellen: VBB über {st_label}")
    if notes:
        source += " (" + ", ".join(notes) + ")"
    return lines, names, coords, source, (per_line, any_line, skipping)


def fill_thin_regions(data, names, coords):
    """Busse in Brandenburg: Landkreise, die in gtfs.de kaum vorkommen (die Prignitz fehlt dort fast ganz),
    bekommen die Linien aus dem letzten VBB-Stand (vbb-lines). Gibt die Kennzeichen der Landkreise zurück."""
    (raw,), label = npm_files("vbb-lines", "data.ndjson")
    old = build([l for l in parse_npm_lines(raw) if l["product"] == "bbus"], names, coords, "", extras=False)
    count = collections.Counter(l["region"] for l in data["lines"]["bbus"])
    old_count = collections.Counter(l["region"] for l in old["lines"]["bbus"])
    thin = [r for r in old_count if count[r] < old_count[r] / 2]
    for region in thin:
        data["lines"]["bbus"] = [l for l in data["lines"]["bbus"] if l["region"] != region] + \
            [l for l in old["lines"]["bbus"] if l["region"] == region]
        print(f"  {REGIONS[region][1]}: in gtfs.de nur {count[region]} Buslinien, "
              f"übernommen {old_count[region]} aus {label}", file=sys.stderr)
    if thin:
        data["lines"]["bbus"].sort(key=sort_key)
        data["stations"].update(old["stations"])
        data["coords"].update(old["coords"])
        data["stations"] = dict(sorted(data["stations"].items()))
        data["coords"] = dict(sorted(data["coords"].items()))
        data["source"] += f"; Busse {', '.join(REGIONS[r][0] for r in thin)}: {label}"
    return [REGIONS[r][0] for r in thin]


def load_gtfs(path):
    """Liefert (Linien, Haltestellennamen, Koordinaten, Quellenangabe) aus einem GTFS-ZIP."""
    with zipfile.ZipFile(path) as z:
        def table(name):
            with z.open(name) as f:
                yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))

        routes = {}
        for r in table("routes.txt"):
            product = ROUTE_TYPES.get(r["route_type"])
            if product == "bus" and r.get("agency_id") not in OPERATORS:
                product = "bbus"
            if product and (r.get("agency_id") in OPERATORS or product in ("regio", "bbus")):
                routes[r["route_id"]] = (r["route_short_name"], product, r.get("agency_id", ""))

        names, coords = {}, {}
        for s in table("stops.txt"):
            names[s["stop_id"]] = s["stop_name"]
            if s.get("stop_lat") and s.get("stop_lon"):
                coords[s["stop_id"]] = (float(s["stop_lat"]), float(s["stop_lon"]))

        trip_route = {}
        for t in table("trips.txt"):
            if t["route_id"] in routes:
                trip_route[t["trip_id"]] = t["route_id"]

        sequences = collections.defaultdict(list)
        for st in table("stop_times.txt"):
            if st["trip_id"] in trip_route:
                sequences[st["trip_id"]].append((int(st["stop_sequence"]), st["stop_id"]))

    variants = collections.defaultdict(collections.Counter)
    for trip_id, seq in sequences.items():
        stops = tuple(s for _, s in sorted(seq))
        variants[trip_route[trip_id]][stops] += 1

    lines = []
    for route_id, counter in variants.items():
        name, product, agency = routes[route_id]
        lines.append({
            "name": name,
            "product": product,
            "operator": agency if product == "bbus" else "",
            "variants": [(list(stops), n) for stops, n in counter.items()],
        })
    return lines, names, coords, f"VBB-GTFS ({Path(path).name})"


def clean_name(name):
    name = re.sub(r"\s*\(Berlin\)$", "", name)
    name = re.sub(r"\s*\[[^\]]*\]", "", name)
    name = re.sub(r", Hbf$", " Hauptbahnhof", name)
    name = re.sub(r", Bhf$", " Bahnhof", name)
    return name.replace(" (Bln)", "").strip()


def pick_directions(variants):
    """Wählt aus allen Fahrtvarianten Hin- und Rückrichtung der Linie.

    ``variants``: Liste von (Liste von Haltestellen-Schlüsseln, Anzahl Fahrten).
    Kurzläufer und Betriebsfahrten werden ignoriert: von den häufig gefahrenen
    Varianten wird jeweils die längste genommen.
    """
    merged = collections.Counter()
    for stops, trips in variants:
        merged[tuple(stops)] += trips
    if not merged:
        return None
    top = max(merged.values())
    common = [(s, n) for s, n in merged.items() if n >= top * 0.2 and len(s) >= 2]
    if not common:
        return None
    main = max(common, key=lambda v: (len(v[0]), v[1]))[0]

    back = [(s, n) for s, n in common if s is not main and s[0] == main[-1] and s[-1] == main[0]]
    if not back:
        back = [(s, n) for s, n in common if s is not main and s[0] == main[-1]]
    back = max(back, key=lambda v: (len(v[0]), v[1]))[0] if back else tuple(reversed(main))
    return [list(main), list(back)]


def sort_key(line):
    m = re.match(r"([A-Z]*)(\d*)(.*)", line["name"])
    prefix, num, rest = m.groups()
    # Bus: Metro (M) und Express (X) zuerst, Nachtbusse (N) ans Ende
    order = {"M": 0, "X": 1, "": 2, "N": 3}.get(prefix, 2)
    return (order, prefix, int(num) if num else 0, rest)


def ice_name(name):
    """ "Frankfurt (Main) Hbf" -> "Frankfurt (Main) Hauptbahnhof", passend zu den Regionalbahn-Namen."""
    name = re.sub(r"\bHbf\b", "Hauptbahnhof", name)
    return name.replace("Bad Bf", "Badischer Bahnhof")


def add_extra_lines(result, stations):
    """Linien aus data/extra_lines.json, die im VBB-Datensatz (noch) fehlen. Gibt ihre Namen zurück."""
    if not EXTRA_FILE.exists():
        return []
    by_name = {}
    for key, name in stations.items():
        by_name.setdefault(name, key)
    added = []
    for line in json.loads(EXTRA_FILE.read_text(encoding="utf-8"))["lines"]:
        product = line["product"]
        if any(l["name"] == line["name"] for l in result[product]):
            print(f"  {line['name']} ist jetzt im VBB-Datensatz – Eintrag in {EXTRA_FILE.name} wird ignoriert",
                  file=sys.stderr)
            continue
        missing = [n for n in line["stops"] if n not in by_name]
        if missing:
            raise SystemExit(f"{line['name']}: Station unbekannt: {missing} (Schreibweise wie in berlin_lines.json?)")
        stops = [by_name[n] for n in line["stops"]]
        result[product].append({"name": line["name"], "color": line.get("color", DEFAULT_COLORS[product]),
                                "directions": [stops, stops[::-1]]})
        added.append(line["name"])
        print(f"  {line['name']} von Hand ergänzt aus {EXTRA_FILE.name}", file=sys.stderr)
    return added


def add_ice_lines(result, stations, coords):
    """ICE-Linien aus data/ice_lines.json; Koordinaten aus dem DB-Stationsverzeichnis (db-stations)."""
    if not ICE_FILE.exists():
        return
    spec = json.loads(ICE_FILE.read_text(encoding="utf-8"))
    (raw,), label = npm_files("db-stations", "data.ndjson")
    db = {}
    for row in raw.decode("utf-8").splitlines():
        if row.strip():
            st = json.loads(row)
            db[st["name"]] = st
    by_name = {}
    for key, name in stations.items():
        by_name.setdefault(name, key)

    def station(name):
        if name in spec.get("berlin", {}):
            return by_name[spec["berlin"][name]]          # Berliner Bahnhof = VBB-Station
        if name in db:
            key = "db:" + db[name]["id"]
            loc = db[name]["location"]
            coords.setdefault(key, [round(loc["latitude"], 5), round(loc["longitude"], 5)])
        elif name in spec.get("extra_coords", {}):
            key = "db:" + re.sub(r"\W+", "-", name.lower())
            coords.setdefault(key, spec["extra_coords"][name])
        else:
            raise SystemExit(f"ICE-Bahnhof unbekannt: {name!r} (Schreibweise wie in db-stations?)")
        stations.setdefault(key, ice_name(name))
        return key

    for line in spec["lines"]:
        stops = [station(n) for n in line["stops"]]
        result["ice"].append({"name": line["name"], "color": ICE_COLOR, "directions": [stops, stops[::-1]]})
    print(f"  {len(spec['lines'])} ICE-Linien aus {ICE_FILE.name}, Koordinaten aus {label}", file=sys.stderr)


def build(lines, raw_names, raw_coords, source, extras=True):
    # Namen je Station (900er-Nummer); Stationseinträge haben Vorrang vor Bahnsteigen
    by_station = {}
    for key, name in raw_names.items():
        k = station_key(key)
        if "::" not in key or k not in by_station:
            by_station[k] = name

    def name_of(stop_id):
        return by_station.get(station_key(stop_id)) or raw_names.get(stop_id)

    # Koordinaten je Station (für das Umsteigen zu Haltestellen in der Nähe)
    coords = {}
    for key, pos in raw_coords.items():
        k = station_key(key)
        if "::" not in key or k not in coords:
            coords[k] = [round(pos[0], 5), round(pos[1], 5)]

    # Linien gleichen Namens (z. B. mehrere S1-Einträge) zusammenführen; in Brandenburg gibt es dieselbe
    # Liniennummer oft in mehreren Landkreisen, dort zählt deshalb auch der Betreiber
    grouped = collections.defaultdict(list)
    for line in lines:
        if not line["name"]:
            continue
        grouped[(line["product"], line["name"], line.get("operator", ""))].extend(line["variants"])

    rail_names = {name for (product, name, _) in grouped if product not in ("bus", "bbus")}

    stations = {}
    berlin = set()      # Stationen in Berlin
    result = {p: [] for p in PRODUCTS}
    for (product, name, _), variants in grouped.items():
        # Ersatzverkehr (Bus "S41", Bus "M10" ...) überspringen
        if product == "bus" and (name in rail_names or name[0] in "SU"):
            continue
        if product == "bbus" and (name in rail_names or RAIL_NAME.match(name) or "SEV" in name.upper()):
            continue
        region = None
        if product == "bbus":
            # Landkreis bzw. kreisfreie Stadt mit den meisten Halten (gewichtet mit der Zahl der Fahrten)
            counts = collections.Counter()
            for stops, trips in variants:
                for stop in stops:
                    m = REGION_ID.search(stop)
                    if m and m.group(1) in REGIONS:
                        counts[m.group(1)] += trips
            if not counts:
                continue                        # fährt gar nicht in Brandenburg
            region = counts.most_common(1)[0][0]
        if product == "ubahn" and not name.startswith("U"):
            continue
        if product == "sbahn" and not name.startswith("S"):
            continue

        # Haltestellen auf Stationen abbilden; namenlose (provisorische) Masten
        # auslassen, Fahrten von/zum Betriebshof ignorieren
        cleaned = []
        for stops, trips in variants:
            seq = []
            for stop in stops:
                key = station_key(stop)
                stop_name = name_of(stop)
                if not stop_name or stop_name.startswith("Tarifgrenze"):
                    continue        # namenlose Masten und reine Tarifzählpunkte auslassen
                stations.setdefault(key, clean_name(stop_name))
                if stop.startswith(BERLIN_PREFIX):
                    berlin.add(key)
                if not seq or seq[-1] != key:
                    seq.append(key)
            if seq and not any("Betriebshof" in stations[s] for s in (seq[0], seq[-1])):
                cleaned.append((seq, trips))

        directions = pick_directions(cleaned)
        if not directions:
            continue
        # Regionalzüge nur, wenn ihre Hauptstrecke durch Berlin führt
        if product == "regio" and not any(k in berlin for d in directions for k in d):
            continue
        entry = {
            "name": name,
            "color": REGIONS[region][2] if region else LINE_COLORS.get(name, DEFAULT_COLORS[product]),
            "directions": directions,
        }
        if region:
            entry["region"] = region
        result[product].append(entry)

    extra = add_extra_lines(result, stations) if extras else []
    if extras:
        add_ice_lines(result, stations, coords)

    used = {s for p in result.values() for l in p for d in l["directions"] for s in d}
    for product in result:
        result[product].sort(key=sort_key)

    return {
        "source": source + (" + ICE-Linien von Hand (data/ice_lines.json)" if result["ice"] else "")
        + (f" + {', '.join(extra)} von Hand (data/extra_lines.json)" if extra else ""),
        "license": "Fahrplandaten: DELFI e.V. (gtfs.de) und VBB Verkehrsverbund Berlin-Brandenburg GmbH, CC BY 4.0",
        "created": date.today().isoformat(),
        "regions": {k: {"short": v[0], "name": v[1], "color": v[2]} for k, v in REGIONS.items()},
        "stations": {k: v for k, v in sorted(stations.items()) if k in used},
        "coords": {k: v for k, v in sorted(coords.items()) if k in used},
        "lines": result,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", choices=("gtfsde", "npm"), default="gtfsde",
                    help="gtfsde: Fahrplan von gtfs.de (Standard), npm: ältere VBB-Pakete vbb-lines/vbb-trips")
    ap.add_argument("--nv", help="vorhandenes Nahverkehrs-ZIP von gtfs.de (sonst wird es geladen)")
    ap.add_argument("--rv", help="vorhandenes Regionalverkehrs-ZIP von gtfs.de (sonst wird es geladen)")
    ap.add_argument("--gtfs", help="Pfad zu einem VBB-GTFS-ZIP statt der anderen Quellen")
    ap.add_argument("-o", "--output", default=str(OUT), help="Zieldatei (Standard: %(default)s)")
    args = ap.parse_args()

    print("Lese Fahrplandaten ...", file=sys.stderr)
    timing = None
    if args.gtfs:
        lines, names, coords, source = load_gtfs(args.gtfs)
    elif args.source == "npm":
        lines, names, coords, source = load_npm()
    else:
        lines, names, coords, source, timing = load_gtfs_de(args.nv, args.rv)
    data = build(lines, names, coords, source)
    if timing:
        fill_thin_regions(data, names, coords)
    if not args.gtfs:
        from build_times import add_ice_times, add_travel_times, fill_times   # Fahrzeiten zwischen den Stationen
        try:
            if timing:
                fill_times(data, *timing)
                data["times_source"] = "Fahrzeiten: aus demselben Fahrplan (DELFI e.V. über gtfs.de)"
            add_travel_times(data)          # Lücken (z. B. Saisonlinien) aus älteren VBB-Fahrplänen
            add_ice_times(data)
        except Exception as e:  # noqa: BLE001 – ohne Fahrzeiten läuft das Spiel trotzdem
            print("Fahrzeiten konnten nicht geladen werden:", e, file=sys.stderr)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    counts = ", ".join(f"{p}: {len(l)}" for p, l in data["lines"].items())
    print(f"Fertig: {out} ({counts}, {len(data['stations'])} Haltestellen)", file=sys.stderr)


if __name__ == "__main__":
    main()
