#!/usr/bin/env python3
"""Erzeugt die Offline-Datenbasis ``data/berlin_lines.json``.

Quelle sind die offenen Fahrplandaten (GTFS) des Verkehrsverbunds
Berlin-Brandenburg (VBB, Lizenz CC BY 4.0). Zwei Wege werden unterstützt:

1. Standard: die aus dem VBB-GTFS abgeleiteten npm-Pakete ``vbb-lines`` und
   ``vbb-stations`` (werden automatisch von registry.npmjs.org geladen).

       python3 tools/build_data.py

2. Direkt aus einem GTFS-ZIP des VBB
   (https://www.vbb.de/vbbgtfs bzw. https://daten.berlin.de):

       python3 tools/build_data.py --gtfs GTFS.zip

Das Skript wird nur einmal benötigt; das Programm selbst läuft danach
komplett offline.
"""

import argparse
import collections
import csv
import io
import json
import re
import sys
import tarfile
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "berlin_lines.json"

NPM = "https://registry.npmjs.org/{name}"

# Betreiber im VBB-Datensatz: 1 = S-Bahn Berlin GmbH, 796 = BVG
OPERATORS = {"1", "796"}
PRODUCTS = ("sbahn", "ubahn", "tram", "bus")

# GTFS route_type (VBB nutzt die erweiterten Typen) -> Verkehrsmittel
ROUTE_TYPES = {
    "109": "sbahn", "2": "sbahn",
    "400": "ubahn", "1": "ubahn",
    "900": "tram", "0": "tram",
    "700": "bus", "3": "bus",
}
NPM_PRODUCTS = {"suburban": "sbahn", "subway": "ubahn", "tram": "tram", "bus": "bus"}

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
DEFAULT_COLORS = {"sbahn": "#008D4F", "ubahn": "#115D91", "tram": "#CC0A22", "bus": "#A5027D"}

STATION_ID = re.compile(r"900\d{6}")


def station_key(stop_id):
    """Fasst Bahnsteige/Masten einer Haltestelle über die 900er-Nummer zusammen."""
    m = STATION_ID.search(stop_id)
    return m.group(0) if m else stop_id


def fetch(url):
    print("  lade", url, file=sys.stderr)
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def npm_file(package, member):
    meta = json.loads(fetch(NPM.format(name=package)))
    version = meta["dist-tags"]["latest"]
    tarball = meta["versions"][version]["dist"]["tarball"]
    with tarfile.open(fileobj=io.BytesIO(fetch(tarball))) as tar:
        return tar.extractfile("package/" + member).read(), f"{package}@{version}"


def load_npm():
    """Liefert (Linien, Haltestellennamen, Quellenangabe)."""
    raw_lines, v_lines = npm_file("vbb-lines", "data.ndjson")
    raw_names, v_names = npm_file("vbb-stations", "names.json")
    names = json.loads(raw_names)

    lines = []
    for row in raw_lines.decode("utf-8").splitlines():
        if not row.strip():
            continue
        line = json.loads(row)
        product = NPM_PRODUCTS.get(line["product"])
        if line["operator"] not in OPERATORS or not product:
            continue
        lines.append({
            "name": line["name"],
            "product": product,
            "variants": [(v["stops"], v["trips"]) for v in line["variants"]],
        })
    return lines, names, f"VBB-GTFS über {v_lines} und {v_names}"


def load_gtfs(path):
    """Liefert (Linien, Haltestellennamen, Quellenangabe) aus einem GTFS-ZIP."""
    with zipfile.ZipFile(path) as z:
        def table(name):
            with z.open(name) as f:
                yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))

        routes = {}
        for r in table("routes.txt"):
            product = ROUTE_TYPES.get(r["route_type"])
            if r.get("agency_id") in OPERATORS and product:
                routes[r["route_id"]] = (r["route_short_name"], product)

        names = {}
        for s in table("stops.txt"):
            names[s["stop_id"]] = s["stop_name"]

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
        name, product = routes[route_id]
        lines.append({
            "name": name,
            "product": product,
            "variants": [(list(stops), n) for stops, n in counter.items()],
        })
    return lines, names, f"VBB-GTFS ({Path(path).name})"


def clean_name(name):
    name = re.sub(r"\s*\(Berlin\)$", "", name)
    name = re.sub(r"\s*\[[^\]]*\]", "", name)
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


def build(lines, raw_names, source):
    # Namen je Station (900er-Nummer); Stationseinträge haben Vorrang vor Bahnsteigen
    by_station = {}
    for key, name in raw_names.items():
        k = station_key(key)
        if "::" not in key or k not in by_station:
            by_station[k] = name

    def name_of(stop_id):
        return by_station.get(station_key(stop_id)) or raw_names.get(stop_id)

    # Linien gleichen Namens (z. B. mehrere S1-Einträge) zusammenführen
    grouped = collections.defaultdict(list)
    for line in lines:
        if not line["name"]:
            continue
        grouped[(line["product"], line["name"])].extend(line["variants"])

    rail_names = {name for (product, name) in grouped if product != "bus"}

    stations = {}
    result = {p: [] for p in PRODUCTS}
    for (product, name), variants in grouped.items():
        # Ersatzverkehr (Bus "S41", Bus "M10" ...) überspringen
        if product == "bus" and (name in rail_names or name[0] in "SU"):
            continue
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
                if not stop_name:
                    continue
                stations.setdefault(key, clean_name(stop_name))
                if not seq or seq[-1] != key:
                    seq.append(key)
            if seq and not any("Betriebshof" in stations[s] for s in (seq[0], seq[-1])):
                cleaned.append((seq, trips))

        directions = pick_directions(cleaned)
        if not directions:
            continue
        result[product].append({
            "name": name,
            "color": LINE_COLORS.get(name, DEFAULT_COLORS[product]),
            "directions": directions,
        })

    used = {s for p in result.values() for l in p for d in l["directions"] for s in d}
    for product in result:
        result[product].sort(key=sort_key)

    return {
        "source": source,
        "license": "Fahrplandaten: VBB Verkehrsverbund Berlin-Brandenburg GmbH, CC BY 4.0",
        "created": date.today().isoformat(),
        "stations": {k: v for k, v in sorted(stations.items()) if k in used},
        "lines": result,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gtfs", help="Pfad zu einem VBB-GTFS-ZIP statt der npm-Pakete")
    ap.add_argument("-o", "--output", default=str(OUT), help="Zieldatei (Standard: %(default)s)")
    args = ap.parse_args()

    print("Lese Fahrplandaten ...", file=sys.stderr)
    lines, names, source = load_gtfs(args.gtfs) if args.gtfs else load_npm()
    data = build(lines, names, source)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    counts = ", ".join(f"{p}: {len(l)}" for p, l in data["lines"].items())
    print(f"Fertig: {out} ({counts}, {len(data['stations'])} Haltestellen)", file=sys.stderr)


if __name__ == "__main__":
    main()
