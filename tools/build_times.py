#!/usr/bin/env python3
"""Trägt die Fahrzeiten zwischen den Stationen in ``data/berlin_lines.json`` ein.

Quelle sind die offiziellen VBB-Fahrplandaten (GTFS, Lizenz CC BY 4.0), aufbereitet im
npm-Paket ``vbb-trips`` (wird automatisch von registry.npmjs.org geladen). Für jeden
Abschnitt zwischen zwei Stationen nimmt das Skript die Fahrzeit (Ankunft an der nächsten
Station minus Abfahrt an der vorigen) aller Fahrten der Linie und davon den Mittelwert
(Median, gewichtet mit der Zahl der Fahrten). Fehlt ein Abschnitt bei der Linie selbst,
wird die Fahrzeit anderer Linien auf demselben Abschnitt genommen. Bleiben dann noch Lücken
(z. B. die U4, die im neuesten Fahrplan fehlt), kommen sie aus älteren Versionen des Pakets.

Ergebnis: jede Linie bekommt ``"times": [[…], […]]`` – je Richtung eine Liste mit der
Fahrzeit in Minuten zwischen Station i und i + 1 (oder ``null``, wenn unbekannt).

    python3 tools/build_times.py

``tools/build_data.py`` ruft das am Ende automatisch auf.
"""

import collections
import io
import json
import sys
import tarfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import NPM, fetch, station_key  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "berlin_lines.json"
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


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    for lines in data["lines"].values():
        for line in lines:
            line.pop("times", None)
    add_travel_times(data)
    DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("geschrieben:", DATA)


if __name__ == "__main__":
    main()
