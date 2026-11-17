#!/usr/bin/env python3
"""Trägt die Fahrzeiten zwischen den Stationen in ``data/berlin_lines.json`` ein.

Quelle sind die offiziellen VBB-Fahrplandaten (GTFS, Lizenz CC BY 4.0), aufbereitet im
npm-Paket ``vbb-trips`` (wird automatisch von registry.npmjs.org geladen). Für jeden
Abschnitt zwischen zwei Stationen nimmt das Skript die Fahrzeit (Ankunft an der nächsten
Station minus Abfahrt an der vorigen) aller Fahrten der Linie und davon den Mittelwert
(Median, gewichtet mit der Zahl der Fahrten). Fehlt ein Abschnitt bei der Linie selbst,
wird die Fahrzeit anderer Linien auf demselben Abschnitt genommen. Bleiben dann noch Lücken
(z. B. die U4, die im neuesten Fahrplan fehlt), kommen sie aus älteren Versionen des Pakets.

Die ICE-Linien stehen nicht im VBB-Fahrplan. Ihre Fahrzeiten kommen aus dem Soll-Fahrplan
des Fernverkehrs (DELFI e.V., über gtfs.de, Lizenz CC BY 4.0). Dort tragen die Fahrten die
Liniennummer („ICE 10“); die Bahnhöfe werden über ihre Koordinaten zugeordnet. Weil die
ICE-Linien im Spiel nur die wichtigsten Halte haben, zählt die Zeit zwischen zwei
aufeinanderfolgenden Halten der Linie, auch wenn der Zug dazwischen noch hält.

Ergebnis: jede Linie bekommt ``"times": [[…], […]]`` – je Richtung eine Liste mit der
Fahrzeit in Minuten zwischen Station i und i + 1 (oder ``null``, wenn unbekannt).

    python3 tools/build_times.py                 # lädt den Fernverkehrsfahrplan von gtfs.de
    python3 tools/build_times.py fv_free.zip     # oder aus einer vorhandenen Datei

``tools/build_data.py`` ruft das am Ende automatisch auf.
"""

import collections
import csv
import io
import json
import math
import sys
import tarfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import NPM, fetch, station_key  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "berlin_lines.json"
FV_GTFS = "https://download.gtfs.de/germany/fv_free/latest.zip"
PRODUCTS = {"suburban": "sbahn", "subway": "ubahn", "tram": "tram", "bus": "bus", "regional": "regio"}


def load_trips(version=None):
    """Liest Linien und Fahrten aus vbb-trips, ohne das 120-MB-Paket ganz auszupacken."""
    meta = json.loads(fetch(NPM.format(name="vbb-trips")))
    version = version or meta["dist-tags"]["latest"]
    raw = fetch(meta["versions"][version]["dist"]["tarball"])
    with tarfile.open(fileobj=io.BytesIO(raw)) as tar:
        lines = {}
        for row in tar.extractfile("package/data/lines.ndjson"):
            if row.strip():
                o = json.loads(row)
                lines[o["id"]] = o
        schedules = tar.extractfile("package/data/schedules.ndjson")
        yield f"vbb-trips@{version}", lines
        for row in schedules:
            if row.strip():
                yield json.loads(row)


def weighted_median(counter):
    total = sum(counter.values())
    acc = 0
    for value in sorted(counter):
        acc += counter[value]
        if acc * 2 >= total:
            return value
    return None


def collect(version=None):
    """(Linie, von, nach) -> Fahrzeiten in Sekunden mit Anzahl der Fahrten."""
    per_line = collections.defaultdict(collections.Counter)
    any_line = collections.defaultdict(collections.Counter)
    skipping = collections.defaultdict(collections.Counter)   # Abschnitte über 1–2 Zwischenhalte hinweg
    it = load_trips(version)
    source, lines = next(it)
    print("  lese Fahrten aus", source, file=sys.stderr)
    for sched in it:
        line = lines.get(sched["route"]["line"])
        if not line:
            continue
        name = line["name"]
        keys = [station_key(s) for s in sched["route"]["stops"]]
        seq = sched["sequence"]
        weight = max(1, len(sched.get("starts") or []))
        for i in range(len(keys) - 1):
            a, b = keys[i], keys[i + 1]
            if a == b:
                continue
            dep = seq[i].get("departure", seq[i].get("arrival"))
            arr = seq[i + 1].get("arrival", seq[i + 1].get("departure"))
            if dep is None or arr is None or arr < dep or arr - dep > 3 * 3600:
                continue
            per_line[(name, a, b)][arr - dep] += weight
            any_line[(a, b)][arr - dep] += weight
            # manche Fahrten halten öfter als die Linie im Spiel: dann über die Zwischenhalte hinweg messen
            for j in (i + 2, i + 3):
                if j < len(keys) and keys[j] != a:
                    end = seq[j].get("arrival", seq[j].get("departure"))
                    if end is not None and dep <= end <= dep + 3 * 3600:
                        skipping[(name, a, keys[j])][end - dep] += weight
    return source, per_line, any_line, skipping


def add_travel_times(data, version=None, lookback=4):
    """Fahrzeiten eintragen; Lücken (z. B. die U4) aus bis zu ``lookback`` älteren Versionen füllen."""
    meta = json.loads(fetch(NPM.format(name="vbb-trips")))
    versions = sorted(meta["versions"], key=lambda v: meta["time"].get(v, ""), reverse=True)
    if version:
        versions = [version]
    sources = []
    for n, ver in enumerate(versions[:1 + lookback]):
        source, per_line, any_line, skipping = collect(ver)
        filled = 0
        for kind, lines in data["lines"].items():
            if kind in ("ice", "flug"):
                continue
            for line in lines:
                times = line.setdefault("times", [[None] * (len(st) - 1) for st in line["directions"]])
                for stops, row in zip(line["directions"], times):
                    for i, (a, b) in enumerate(zip(stops, stops[1:])):
                        if row[i] is not None:
                            continue
                        counter = (per_line.get((line["name"], a, b)) or any_line.get((a, b))
                                   or skipping.get((line["name"], a, b)))
                        if counter:
                            row[i] = round(weighted_median(counter) / 60)
                            filled += 1
        if n == 0 or filled:
            sources.append(source)
        missing = sum(v is None for ls in data["lines"].values() for l in ls for r in l.get("times", []) for v in r)
        print(f"  {source}: {filled} Abschnitte, noch ohne Fahrzeit: {missing}", file=sys.stderr)
        if not missing:
            break
    for kind, lines in data["lines"].items():
        vals = [v for l in lines for r in l.get("times", []) for v in r]
        if vals:
            found = sum(v is not None for v in vals)
            print(f"  {kind:6s} Fahrzeiten für {found} von {len(vals)} Abschnitten ({100 * found / len(vals):.0f} %)",
                  file=sys.stderr)
    data["times_source"] = "Fahrzeiten: VBB-Fahrplandaten (GTFS, CC BY 4.0) über " + ", ".join(sources)
    return data


def gtfs_seconds(text):
    h, m, sec = (int(v) for v in text.split(":"))
    return h * 3600 + m * 60 + sec


def add_ice_times(data, source=FV_GTFS):
    """ICE-Fahrzeiten aus dem Fernverkehrs-GTFS (Datei oder URL) eintragen."""
    raw = Path(source).read_bytes() if Path(source).exists() else fetch(source)
    z = zipfile.ZipFile(io.BytesIO(raw))

    def rows(name):
        return csv.DictReader(io.TextIOWrapper(z.open(name), encoding="utf-8-sig"))

    # Bahnhöfe: Bahnsteige auf ihren Bahnhof zurückführen
    parent, pos = {}, {}
    for r in rows("stops.txt"):
        parent[r["stop_id"]] = r["parent_station"] or r["stop_id"]
        if not r["parent_station"]:
            pos[r["stop_id"]] = (float(r["stop_lat"]), float(r["stop_lon"]))
    routes = {r["route_id"]: r["route_short_name"] for r in rows("routes.txt")}
    trip_line = {r["trip_id"]: routes.get(r["route_id"], "") for r in rows("trips.txt")}
    trips = collections.defaultdict(list)
    for r in rows("stop_times.txt"):
        trips[r["trip_id"]].append((int(r["stop_sequence"]), parent.get(r["stop_id"], r["stop_id"]),
                                    gtfs_seconds(r["arrival_time"]), gtfs_seconds(r["departure_time"])))

    def nearest(key):
        """GTFS-Bahnhof zum Spiel-Bahnhof: der nächste im Umkreis von 800 m."""
        here = data["coords"].get(key)
        if not here:
            return None
        lat = math.radians(here[0])
        best = min(pos, key=lambda k: (pos[k][0] - here[0]) ** 2 + ((pos[k][1] - here[1]) * math.cos(lat)) ** 2)
        d = math.hypot((pos[best][0] - here[0]) * 110540, (pos[best][1] - here[1]) * math.cos(lat) * 111320)
        return best if d <= 800 else None

    per_line = collections.defaultdict(collections.Counter)
    any_line = collections.defaultdict(collections.Counter)
    for trip_id, stops in trips.items():
        name = trip_line.get(trip_id, "")
        if not name.startswith(("ICE", "IC", "EC")):
            continue
        stops.sort()
        for i, (_, a, _, dep) in enumerate(stops):
            for _, b, arr, _ in stops[i + 1:i + 12]:
                if a != b and dep <= arr:
                    per_line[(name, a, b)][arr - dep] += 1
                    if name.startswith("ICE"):
                        any_line[(a, b)][arr - dep] += 1
    found = total = 0
    for line in data["lines"].get("ice", []):
        times = []
        for stops in line["directions"]:
            gtfs = [nearest(k) for k in stops]
            row = []
            for a, b in zip(gtfs, gtfs[1:]):
                counter = (per_line.get((line["name"], a, b)) or any_line.get((a, b))) if a and b else None
                if counter:
                    # die schnellste Hälfte der Fahrten zählt: Umwege einzelner Züge fallen so heraus
                    fastest = min(counter)
                    counter = collections.Counter({v: n for v, n in counter.items() if v <= fastest * 1.5})
                minutes = round(weighted_median(counter) / 60) if counter else None
                row.append(minutes)
                total += 1
                found += minutes is not None
            times.append(row)
        line["times"] = times
    print(f"  ice    Fahrzeiten für {found} von {total} Abschnitten ({100 * found / max(1, total):.0f} %)",
          file=sys.stderr)
    data["times_source"] = data.get("times_source", "Fahrzeiten:") + \
        "; ICE: Soll-Fahrplan Fernverkehr (DELFI e.V., CC BY 4.0) über gtfs.de"
    return data


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    for lines in data["lines"].values():
        for line in lines:
            line.pop("times", None)
    add_travel_times(data)
    try:
        add_ice_times(data, sys.argv[1] if len(sys.argv) > 1 else FV_GTFS)
    except Exception as e:  # noqa: BLE001 – ohne ICE-Zeiten geht es trotzdem
        print("ICE-Fahrzeiten konnten nicht geladen werden:", e, file=sys.stderr)
    DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("geschrieben:", DATA)


if __name__ == "__main__":
    main()
