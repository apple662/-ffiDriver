#!/usr/bin/env python3
"""Erzeugt ``data/cruises.json``: Kreuzfahrten ab deutschen Häfen mit Seerouten und gezeichneten Wahrzeichen.

- Reisen: von Hand zusammengestellt nach typischen Routen der Kreuzfahrtschiffe, die in Hamburg, Kiel und
  Warnemünde ablegen. Es sind Beispiele, kein Fahrplan einer bestimmten Reederei.
- Seerouten: Wegpunkte von Hand, damit das Schiff auf der Karte nicht über Land fährt.
- Fahrzeit auf See: aus der Länge der Route, bei etwa 31 km/h (17 Knoten).
- Wahrzeichen: dieselben einfachen Formen wie bei den Flügen (``tools/make_flights.py``); Häfen, die es dort
  schon gibt (z. B. Kopenhagen, New York), übernehmen die Zeichnung von dort.

    python3 tools/make_cruises.py
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_flights as F  # noqa: E402
from make_flights import L, O, P, R, fir, tower_block, tree, water, windows, arch_row  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "cruises.json"
KNOTS_KMH = 31.0        # Reisegeschwindigkeit eines Kreuzfahrtschiffs (ca. 17 Knoten)


# --------------------------------------------------------------------------
# Wahrzeichen der Häfen
# --------------------------------------------------------------------------

def container_crane(x, h=46, color="#C8442F"):
    """Containerbrücke im Hafen."""
    return [R(color, x - 1, 0, x + 1, h), R(color, x + 13, 0, x + 15, h),
            R(color, x - 18, h, x + 28, h + 3),                                  # Ausleger
            L(color, 0.8, (x + 7, h + 3), (x + 7, h + 12), (x - 18, h + 3)),
            L(color, 0.8, (x + 7, h + 12), (x + 28, h + 3)),
            R("#3A3A3A", x - 10, h - 2, x - 4, h)]


def containers(x1, x2, rows=3):
    cols = ["#3E7CB1", "#C8442F", "#E8B33A", "#4F8A6A", "#7A3E9D", "#E07A2C"]
    out = []
    for j in range(rows):
        x, k = x1 + j * 2, j
        while x + 7 < x2 - j * 2:
            out.append(R(cols[(k * 7 + j * 3) % len(cols)], x, j * 4, x + 7, j * 4 + 3.6))
            x += 7.4
            k += 1
    return out


def hamburg():
    s = containers(-150, -96) + container_crane(-140) + container_crane(-112, 52, "#3E7CB1")
    # Elbphilharmonie: Backstein-Speicher mit Glasaufbau wie Wellen
    brick = "#8C4A2F"
    s.append(R(brick, -40, 0, 34, 30))
    s += windows("#5A2E1E", -38, 32, 2, 28, 18, 6, 1.4, 2.2)
    s.append(P("#CFE3F2", (-40, 30), (34, 30), (34, 44), (24, 50), (12, 44), (0, 54), (-12, 47), (-26, 56), (-40, 46)))
    for y in range(33, 52, 4):
        s.append(L("#F4F8FB", 0.5, (-39, y), (33, y)))
    s.append(L("#F4F8FB", 1.2, (-40, 46), (-26, 56), (-12, 47), (0, 54), (12, 44), (24, 50), (34, 44)))
    # Michel: Turm der Hauptkirche St. Michaelis mit grüner Kupferhaube
    mx = 70
    s.append(R("#B5583E", mx - 22, 0, mx - 6, 20))                     # Kirchenschiff
    s.append(P("#4E8C6E", (mx - 23, 20), (mx - 5, 20), (mx - 14, 27)))
    s.append(R("#B5583E", mx - 6, 0, mx + 6, 46))
    s += arch_row("#6E2A1E", mx - 5, mx + 5, 30, 42, 2)
    s.append(R("#4E8C6E", mx - 6.5, 46, mx + 6.5, 50))
    s.append(R("#E9E3D4", mx - 4.5, 50, mx + 4.5, 60))
    s.append(O("#FFFFF2", mx, 55, 2.6, 2.6))
    s.append(P("#4E8C6E", (mx - 5, 60), (mx + 5, 60), (mx + 3, 68), (mx + 1.2, 80), (mx, 88), (mx - 1.2, 80), (mx - 3, 68)))
    return s


def kiel():
    s = [P("#7FA066", (40, 0), (90, 14), (140, 8), (180, 0))]                 # Ufer gegenüber
    # Marine-Ehrenmal Laboe: hoher Backsteinturm, oben schräg wie ein Schiffsheck
    x0 = 20
    brick = "#A0573E"
    s.append(R("#8C4A2F", x0 - 26, 0, x0 + 26, 6))
    s.append(P(brick, (x0 - 8, 6), (x0 + 8, 6), (x0 + 6, 62), (x0 + 12, 78), (x0 - 4, 84), (x0 - 6, 62)))
    for y in range(12, 60, 6):
        s.append(R("#8C4A2F", x0 - 1, y, x0 + 1, y + 3))
    s.append(L("#3A3A3A", 0.6, (x0 + 4, 81), (x0 + 4, 92)))
    s.append(R("#F4F4F4", x0 + 4, 87, x0 + 10, 91))
    # Leuchtturm Friedrichsort, rot-weiß
    lx = -60
    for i in range(6):
        s.append(R("#D33A2C" if i % 2 == 0 else "#F4F4F4", lx - 4 + i * 0.3, i * 6, lx + 4 - i * 0.3, i * 6 + 6))
    s.append(R("#3A3A3A", lx - 3, 36, lx + 3, 38))
    s.append(R("#FFE9A8", lx - 2.4, 38, lx + 2.4, 43))
    s.append(P("#D33A2C", (lx - 3.4, 43), (lx + 3.4, 43), (lx, 48)))
    s.append(water("#3E7FA8", 0, -14))
    for i, (bx, col) in enumerate(((-100, "#E8483B"), (-84, "#F2C230"), (-30, "#3D8BD4"), (60, "#F4F4F4"), (80, "#2F9E5B"))):
        s.append(P("#F4F4F4", (bx - 5, -2), (bx + 5, -2), (bx + 4, -4), (bx - 4, -4)))      # Segelboote der Kieler Woche
        s.append(L("#5A5A5A", 0.5, (bx, -2), (bx, 16)))
        s.append(P(col, (bx + 0.5, 16), (bx + 0.5, -1), (bx + 8, -1)))
        s.append(P(col, (bx - 0.5, 13), (bx - 0.5, -1), (bx - 5, -1)))
    return s


def warnemuende():
    s = [R("#F0DCA8", -600, -14, 600, 0)]                                       # breiter Sandstrand
    # Leuchtturm: weißer Turm mit Galerie und grüner Laterne
    lx = -40
    s.append(P("#F4F4F4", (lx - 6, 0), (lx + 6, 0), (lx + 4, 40), (lx - 4, 40)))
    for y in (12, 26):
        s.append(R("#C9CED6", lx - 5.5, y, lx + 5.5, y + 1.2))
    s.append(R("#5D6670", lx - 6, 40, lx + 6, 42))
    s.append(R("#FFE9A8", lx - 3, 42, lx + 3, 48))
    s.append(P("#3E6F5A", (lx - 4, 48), (lx + 4, 48), (lx, 54)))
    s.append(R("#3E6F5A", lx - 0.4, 54, lx + 0.4, 58))
    # Teepott: rundes Haus mit geschwungenem Dach
    tx = 10
    s.append(R("#F4F1EA", tx - 18, 0, tx + 18, 8))
    s += windows("#9CC7E8", tx - 17, tx + 17, 1, 7, 9, 1, 2.8, 4.4)
    s.append(P("#E9E3D4", (tx - 22, 8), (tx - 12, 15), (tx, 9), (tx + 12, 15), (tx + 22, 8)))
    # Strandkörbe
    for i, x in enumerate(range(40, 100, 12)):
        col = ["#3E7CB1", "#E8483B", "#2F9E5B", "#F2C230", "#3E7CB1"][i % 5]
        s.append(R("#E9DCC0", x, -8, x + 7, -2))
        s.append(P(col, (x, -2), (x + 7, -2), (x + 7, 4), (x + 3.5, 6), (x, 4)))
        s.append(R("#5A6E85", x + 1, -1, x + 6, 3))
    s.append(water("#3E7FA8", -14, -30))
    return s


def stavanger():
    s = []
    # Preikestolen: Felsplateau hoch über dem Fjord
    s.append(P("#6E6A62", (-10, 0), (20, 30), (40, 56), (78, 62), (82, 58), (100, 40), (140, 0)))
    s.append(P("#7E7A72", (40, 56), (78, 62), (82, 58), (64, 54)))
    s.append(P("#5E5A53", (82, 58), (84, 60), (88, 52), (100, 40), (96, 40)))
    s.append(P("#4F7F45", (20, 30), (30, 40), (14, 40), (0, 20)))
    for px in (62, 68, 74):                                                      # Wanderer oben auf dem Felsen
        s.append(R("#E8483B" if px != 68 else "#3D8BD4", px - 0.6, 62, px + 0.6, 65))
        s.append(O("#E0AC85", px, 65.8, 0.8, 0.8))
    # Gamle Stavanger: weiße Holzhäuser
    for i, x in enumerate(range(-120, -40, 11)):
        s.append(R("#F4F1EA", x, 0, x + 10, 9 + (i % 2) * 2))
        s.append(P("#C9542D" if i % 3 else "#5A5A5A", (x - 0.5, 9 + (i % 2) * 2), (x + 10.5, 9 + (i % 2) * 2),
                   (x + 5, 14 + (i % 2) * 2)))
        s += windows("#5A6E85", x + 1, x + 9, 2, 8, 2, 1, 1.6, 2.6)
    s += fir(-30, 16) + fir(-22, 12) + fir(150, 16)
    return s


def geiranger():
    s = [P("#5E6B5A", (-170, 0), (-150, 70), (-120, 90), (-90, 66), (-60, 0)),     # steile Fjordwände
         P("#F4F6F8", (-136, 80), (-120, 90), (-104, 78), (-112, 76), (-120, 82), (-128, 74)),
         P("#56634F", (40, 0), (70, 72), (100, 86), (140, 70), (180, 0)),
         P("#F4F6F8", (88, 80), (100, 86), (114, 80), (106, 76), (100, 80), (94, 74))]
    # Die „Sieben Schwestern“: Wasserfälle an der Felswand
    for k in range(7):
        x = 62 + k * 5
        top = 60 - abs(k - 3) * 3
        s.append(L("#F4F8FB", 1.2, (x, top), (x + 1, top * 0.6), (x, top * 0.3), (x + 0.5, 1)))
    s.append(P("#4F7F45", (-60, 0), (-40, 10), (0, 14), (30, 8), (40, 0)))        # grünes Tal mit Dorf
    for i, x in enumerate(range(-44, 24, 9)):
        col = ["#B5432F", "#F4F1EA", "#E8B33A", "#B5432F"][i % 4]
        y0 = 8 + (i % 3) * 2
        s.append(R(col, x, y0, x + 7, y0 + 5))
        s.append(P("#3A3A3A", (x - 0.5, y0 + 5), (x + 7.5, y0 + 5), (x + 3.5, y0 + 8)))
    cx = 8                                                                         # achteckige Kirche
    s.append(R("#F4F1EA", cx - 5, 14, cx + 5, 22))
    s.append(P("#5A5A5A", (cx - 6, 22), (cx + 6, 22), (cx, 30)))
    s += fir(-52, 12) + fir(30, 11)
    return s


def bergen():
    s = [P("#5E7F55", (-170, 0), (-120, 40), (-80, 52), (-30, 44), (20, 30), (60, 0))]   # Berg Fløyen
    s.append(L("#5A5A5A", 0.8, (-60, 0), (-90, 48)))                                       # Standseilbahn
    s.append(R("#E8483B", -78, 28, -73, 32))
    colors = ["#B5432F", "#F2C230", "#F4F1EA", "#C98A3A", "#B5432F", "#F4F1EA", "#E8A33A", "#8C3A2E"]
    x = -50
    for i, col in enumerate(colors):                                               # Bryggen: Holzhäuser mit Giebeln
        w, h = 11, 18 + (i % 3) * 3
        s.append(R(col, x, 0, x + w, h))
        s.append(P(col, (x, h), (x + w, h), (x + w / 2, h + 9)))
        s.append(L("#3A3A3A", 0.4, (x, h), (x + w / 2, h + 9), (x + w, h)))
        s += windows("#F4F1EA" if col != "#F4F1EA" else "#5A6E85", x + 1.5, x + w - 1.5, 3, h - 1, 2, 3, 1.8, 2.6)
        x += w + 1
    s += tree(60, 12) + tree(74, 10)
    return s


def helsinki():
    s = []
    # Dom: weiße Kirche mit grüner Kuppel und vier kleinen Kuppeln, oben auf der großen Treppe
    x0, base = 0, 14
    for k in range(7):
        s.append(R("#D9D4C7" if k % 2 else "#E6E1D4", x0 - 40 + k * 2, k * 2, x0 + 40 - k * 2, k * 2 + 2))
    s.append(R("#F4F4F4", x0 - 30, base, x0 + 30, base + 22))
    for i in range(6):
        cx = x0 - 12.5 + i * 5
        s.append(R("#E6E6E6", cx - 1.2, base + 2, cx + 1.2, base + 18))
    s.append(P("#F4F4F4", (x0 - 15, base + 22), (x0 + 15, base + 22), (x0, base + 30)))
    s.append(R("#F4F4F4", x0 - 10, base + 22, x0 + 10, base + 36))
    s.append(R("#E6E6E6", x0 - 10.5, base + 34, x0 + 10.5, base + 36.5))
    s.append(O("#4E8C6E", x0, base + 37, 9.5, 10))
    s.append(R("#F4F4F4", x0 - 1.4, base + 46, x0 + 1.4, base + 49))
    s.append(O("#E8B33A", x0, base + 50.5, 1.6, 2))
    for dx in (-26, 26):
        s.append(R("#F4F4F4", x0 + dx - 3, base + 22, x0 + dx + 3, base + 28))
        s.append(O("#4E8C6E", x0 + dx, base + 30, 3.5, 3.5))
    # Marktstände am Hafen
    for i, x in enumerate(range(-110, -50, 12)):
        col = ["#E8483B", "#F2C230", "#3E7CB1", "#2F9E5B", "#E07A2C"][i % 5]
        s.append(P(col, (x - 1, 8), (x + 11, 8), (x + 5, 12)))
        s.append(R("#F4F1EA", x, 0, x + 10, 8))
    s += tree(60, 12) + tree(74, 11)
    return s


def tallinn():
    s = [P("#7FA066", (-170, 0), (-150, 12), (-60, 14), (-40, 0))]
    stone = "#C9BFA8"
    # Stadtmauer mit runden Türmen und roten Spitzdächern
    s.append(R(stone, -100, 0, 40, 14))
    for x in range(-100, 40, 4):
        s.append(R(stone, x, 14, x + 2, 16))
    for tx in (-90, -56, -20, 28):
        s.append(R(stone, tx - 5, 0, tx + 5, 26))
        s.append(P("#B5432F", (tx - 6, 26), (tx + 6, 26), (tx, 40)))
        s += windows("#5A4A3A", tx - 3, tx + 3, 8, 22, 1, 2, 1.4, 3)
    # Olaikirche mit sehr hohem, spitzem Turm
    ox = 60
    s.append(R(stone, ox - 16, 0, ox - 4, 22))
    s.append(P("#4E8C6E", (ox - 17, 22), (ox - 3, 22), (ox - 10, 28)))
    s.append(R(stone, ox - 4, 0, ox + 6, 48))
    s += arch_row("#5A4A3A", ox - 3, ox + 5, 34, 44, 2)
    s.append(P("#4E8C6E", (ox - 5, 48), (ox + 7, 48), (ox + 1, 96)))
    s.append(R("#F2E2B8", -140, 14, -110, 26))                                        # Domberg mit Schloss
    s.append(P("#B5432F", (-141, 26), (-109, 26), (-125, 32)))
    return s


def oslo():
    s = [P("#5E7F55", (-170, 0), (-140, 30), (-100, 36), (-60, 24), (-30, 0))]       # Hügel mit Holmenkollen
    s.append(L("#E6E9ED", 2.0, (-118, 54), (-112, 40), (-100, 28), (-82, 20), (-70, 18)))    # Skisprungschanze
    s.append(R("#C9CED6", -121, 30, -117, 56))
    # Opernhaus: weißes Marmordach, das schräg aus dem Wasser steigt
    marble = "#F4F4F4"
    s.append(P(marble, (-20, 0), (60, 0), (60, 20), (40, 24), (10, 16)))
    s.append(P("#E3E6EA", (-20, 0), (10, 16), (14, 14), (-10, 0)))
    s.append(P("#BFD9EE", (14, 16), (40, 24), (40, 34), (24, 32)))                      # Glasfassade des Bühnenturms
    s.append(R("#E6E9ED", 40, 18, 58, 36))
    s += windows("#9CC7E8", 16, 38, 18, 30, 6, 2, 2.6, 4)
    for px, py in ((-6, 6), (2, 10.5), (24, 21)):                                      # Leute spazieren auf dem Dach
        y = py + 0.5
        s.append(R("#3D8BD4", px - 0.6, y, px + 0.6, y + 2.6))
        s.append(O("#E0AC85", px, y + 3.4, 0.8, 0.8))
    s += fir(90, 16) + fir(102, 13)
    return s


# --------------------------------------------------------------------------
# Häfen
# --------------------------------------------------------------------------

# Code, Name, Land, Breite, Länge, Gruß, Wissenswertes, Himmel, Boden, Hintergrund, Szene, Bahnhof (zum Umsteigen)
NEW_PORTS = [
    ("HAM", "Hamburg", "Deutschland", 53.545, 9.93, "Moin!",
     "Hamburg hat einen der größten Häfen Europas. Die Elbphilharmonie sieht aus wie ein Schiff mit Wellen auf dem Dach.",
     ["#6FA6D8", "#D2E4F3"], "#7F8A8F", "#9AA4A8", hamburg(), "Hamburg-Altona"),
    ("KEL", "Kiel", "Deutschland", 54.33, 10.15, "Moin!",
     "In Kiel findet jedes Jahr die Kieler Woche statt, das größte Segelfest der Welt.",
     ["#6FA6D8", "#D2E4F3"], "#7FAE62", "#9CC27E", kiel(), None),
    ("WAR", "Warnemünde", "Deutschland", 54.18, 12.09, "Moin!",
     "Warnemünde gehört zu Rostock und hat einen der breitesten Sandstrände an der Ostsee – mit vielen Strandkörben.",
     ["#5FA2E0", "#CDE4F5"], "#E8D9A8", "#E3D6A5", warnemuende(), None),
    ("SVG", "Stavanger", "Norwegen", 58.97, 5.73, "Hei!",
     "Der Preikestolen ist ein Felsen wie eine Kanzel, 600 Meter hoch über dem Lysefjord.",
     ["#7DA9D6", "#D6E6F3"], "#6E8A64", "#8EA684", stavanger(), None),
    ("GEI", "Geiranger", "Norwegen", 62.10, 7.20, "Hei!",
     "Der Geirangerfjord ist schmal und tief. An der Felswand stürzen die Sieben Schwestern hinunter – sieben Wasserfälle.",
     ["#7DA9D6", "#D6E6F3"], "#56634F", "#6E7F64", geiranger(), None),
    ("BGO", "Bergen", "Norwegen", 60.40, 5.32, "Hei!",
     "In Bergen regnet es sehr oft. Die bunten Holzhäuser am Hafen heißen Bryggen und sind fast 300 Jahre alt.",
     ["#8FA9C2", "#D9E3EC"], "#6E8A64", "#8EA684", bergen(), None),
    ("HEL", "Helsinki", "Finnland", 60.16, 24.95, "Hei!",
     "Der weiße Dom von Helsinki steht oben auf einer großen Treppe. Im Winter friert das Meer am Hafen manchmal zu.",
     ["#7AA9D8", "#D3E5F3"], "#9AA4A8", "#B5BCC0", helsinki(), None),
    ("TLL", "Tallinn", "Estland", 59.44, 24.77, "Tere!",
     "Die Altstadt von Tallinn hat eine Stadtmauer mit vielen Türmen und roten Spitzdächern, wie im Märchen.",
     ["#7AA9D8", "#D3E5F3"], "#7FAE62", "#9CC27E", tallinn(), None),
    ("OSL", "Oslo", "Norwegen", 59.90, 10.74, "Hei!",
     "Auf dem Dach der Oper von Oslo darf man spazieren gehen. Oben auf dem Berg steht die Skisprungschanze Holmenkollen.",
     ["#7AA9D8", "#D3E5F3"], "#7FAE62", "#9CC27E", oslo(), None),
]

# Häfen, deren Wahrzeichen es schon bei den Flügen gibt: Hafen-Code -> (Flughafen-Code, Name, Breite, Länge, Wissenswertes)
FROM_FLIGHTS = {
    "CPH": ("CPH", "Kopenhagen", 55.70, 12.60, None),
    "STO": ("ARN", "Stockholm", 59.32, 18.10, None),
    "AMS": ("AMS", "Amsterdam", 52.38, 4.90, None),
    "SOU": ("LHR", "London", 50.90, -1.40,
            "Große Schiffe legen in Southampton an, von dort fährt man mit dem Zug nach London. "
            "Im Turm von Big Ben hängt eine riesige Glocke."),
    "LEH": ("CDG", "Paris", 49.48, 0.11,
            "Das Schiff legt in Le Havre an der Seine-Mündung an, von dort geht es nach Paris. "
            "Der Eiffelturm ist 330 Meter hoch."),
    "NYC": ("JFK", "New York", 40.70, -74.02,
            "Früher kamen fast alle Einwanderer mit dem Schiff nach New York. Die Freiheitsstatue hat sie begrüßt."),
    "LIS": ("LIS", "Lissabon", 38.70, -9.13, None),
    "PMI": ("PMI", "Palma de Mallorca", 39.56, 2.63, None),
    "REK": ("KEF", "Reykjavík", 64.15, -21.94, None),
}


def ports():
    out = {}
    for code, name, country, lat, lon, hello, fact, sky, ground, far, scene, station in NEW_PORTS:
        out[code] = {"code": code, "name": name, "country": country, "lat": lat, "lon": lon, "hello": hello,
                     "fact": fact, "sky": sky, "ground": ground, "far": far, "scene": scene}
        if station:
            out[code]["station"] = station
    flights = {d[0]: d for d in F.DESTINATIONS}
    for code, (ap, name, lat, lon, fact) in FROM_FLIGHTS.items():
        _, _, country, _, _, _, _, hello, ffact, sky, ground, far, scene = flights[ap]
        out[code] = {"code": code, "name": name, "country": country, "lat": lat, "lon": lon, "hello": hello,
                     "fact": fact or ffact, "sky": sky, "ground": ground, "far": far, "scene": scene}
    return out


# --------------------------------------------------------------------------
# Seerouten: Wegpunkte (Breite, Länge) zwischen zwei Häfen, ohne die Häfen selbst
# --------------------------------------------------------------------------

ELBE = [(53.62, 9.55), (53.85, 8.95), (53.98, 8.4)]          # Hamburg -> Nordsee
NORTH_SEA_SW = [(53.85, 6.5), (53.35, 4.3)]                  # vor den Westfriesischen Inseln
CHANNEL = [(51.55, 2.5), (51.0, 1.55), (50.6, 0.2), (50.62, -0.9), (50.76, -1.15)]   # Ärmelkanal bis Southampton

LEGS = {
    ("HAM", "SVG"): ELBE + [(54.6, 7.4), (56.5, 5.8), (58.3, 5.1)],
    ("SVG", "GEI"): [(59.3, 4.9), (60.6, 4.6), (62.05, 4.95), (62.2, 6.0), (62.13, 6.8)],
    ("GEI", "BGO"): [(62.13, 6.8), (62.2, 6.0), (62.05, 4.95), (60.7, 4.7), (60.45, 5.0)],
    ("BGO", "HAM"): [(60.3, 4.7), (58.5, 4.8), (56.5, 5.8), (54.6, 7.4)] + ELBE[::-1],
    ("KEL", "CPH"): [(54.5, 10.3), (54.6, 11.1), (54.45, 12.1), (55.0, 12.75), (55.45, 12.85)],
    ("CPH", "STO"): [(55.45, 12.85), (55.15, 13.2), (55.2, 14.6), (55.8, 15.8), (56.2, 17.4), (57.5, 17.7),
                     (58.7, 19.3), (59.4, 18.9)],
    ("STO", "HEL"): [(59.4, 18.9), (59.6, 20.6), (59.85, 22.5), (60.05, 24.5)],
    ("HEL", "TLL"): [(59.9, 24.9)],
    ("TLL", "KEL"): [(59.6, 24.0), (59.2, 21.5), (58.0, 20.0), (56.5, 19.0), (55.5, 16.5), (54.8, 14.3), (54.6, 12.5),
                     (54.5, 11.2), (54.5, 10.3)],
    ("WAR", "OSL"): [(54.4, 12.2), (55.0, 12.75), (55.45, 12.85), (55.75, 12.75), (56.1, 12.65), (56.6, 11.9),
                     (57.85, 10.8), (58.6, 10.5), (59.3, 10.6)],
    ("OSL", "CPH"): [(59.3, 10.6), (58.6, 10.5), (57.85, 10.8), (56.6, 11.9), (56.1, 12.65), (55.75, 12.75)],
    ("CPH", "WAR"): [(55.45, 12.85), (55.0, 12.75), (54.4, 12.2)],
    ("HAM", "AMS"): ELBE + NORTH_SEA_SW + [(52.47, 4.55)],
    ("AMS", "SOU"): [(52.47, 4.55)] + CHANNEL,
    ("SOU", "LEH"): [(50.76, -1.15), (50.3, -0.7), (49.65, -0.1)],
    ("LEH", "HAM"): [(49.8, 0.2), (50.4, 0.7)] + CHANNEL[:2][::-1] + NORTH_SEA_SW[::-1] + ELBE[::-1],
    ("HAM", "SOU"): ELBE + NORTH_SEA_SW + CHANNEL,
    ("SOU", "NYC"): [(50.76, -1.15), (50.3, -2.5), (49.8, -6.0), (48.0, -15.0), (46.5, -27.0), (43.5, -45.0),
                     (41.0, -60.0), (40.35, -70.0), (40.45, -73.8)],
    ("HAM", "LIS"): ELBE + NORTH_SEA_SW + CHANNEL[:4] + [(50.0, -3.5), (49.3, -5.5), (48.3, -6.3), (46.0, -7.5),
                                                        (43.5, -9.8), (41.0, -9.6), (38.65, -9.45)],
    ("LIS", "PMI"): [(38.65, -9.45), (37.0, -9.25), (36.4, -7.5), (35.95, -5.6), (36.0, -4.5), (36.3, -3.0),
                     (37.5, -0.5), (38.8, 1.5), (39.4, 2.4)],
    ("HAM", "REK"): ELBE + [(54.6, 7.4), (57.0, 4.0), (59.4, -1.6), (60.8, -7.5), (63.0, -18.0), (63.6, -22.9),
                            (64.1, -22.4)],
    ("REK", "HAM"): [(64.1, -22.4), (63.6, -22.9), (63.0, -18.0), (60.8, -7.5), (59.4, -1.6), (57.0, 4.0),
                     (54.6, 7.4)] + ELBE[::-1],
}

# Name auf dem Linienschild, Titel, Farbe (auch der Schornstein), Häfen der Reihe nach
CRUISES = [
    ("Fjorde", "Norwegens Fjorde", "#1D6FA3", ["HAM", "SVG", "GEI", "BGO", "HAM"]),
    ("Ostsee", "Ostsee-Metropolen", "#2E8B57", ["KEL", "CPH", "STO", "HEL", "TLL", "KEL"]),
    ("Oslo", "Oslo und Kopenhagen", "#C8102E", ["WAR", "OSL", "CPH", "WAR"]),
    ("Städte", "Metropolen Westeuropas", "#7A3E9D", ["HAM", "AMS", "SOU", "LEH", "HAM"]),
    ("Atlantik", "Über den Atlantik nach New York", "#0B2D5B", ["HAM", "SOU", "NYC"]),
    ("Süden", "Von Hamburg ins Mittelmeer", "#E8892B", ["HAM", "LIS", "PMI"]),
    ("Island", "Island und zurück", "#02529C", ["HAM", "REK", "HAM"]),
]


def path_km(pts):
    return sum(F_km(a, b) for a, b in zip(pts, pts[1:]))


def F_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def main():
    pts = ports()
    cruises = []
    for name, title, color, stops in CRUISES:
        legs, hours, kms = [], [], []
        for a, b in zip(stops, stops[1:]):
            via = LEGS[(a, b)] if (a, b) in LEGS else LEGS[(b, a)][::-1]
            leg = [(pts[a]["lat"], pts[a]["lon"])] + via + [(pts[b]["lat"], pts[b]["lon"])]
            km = path_km(leg)
            legs.append([round(v, 2) for p in leg for v in p])
            kms.append(round(km))
            hours.append(max(3, round(km / KNOTS_KMH)))
        cruises.append({"name": name, "title": title, "color": color, "ports": stops, "legs": legs, "hours": hours,
                        "km": kms})
    used = {c for cr in cruises for c in cr["ports"]}
    out = {"source": "Reisen, Seerouten und Zeichnungen von Hand; typische Routen ab Hamburg, Kiel und Warnemünde",
           "ports": {k: v for k, v in pts.items() if k in used}, "cruises": cruises}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"geschrieben: {OUT} ({OUT.stat().st_size // 1024} KB, {len(cruises)} Reisen, {len(out['ports'])} Häfen)")
    for cr in cruises:
        print(f"  {cr['name']:9s} {' – '.join(cr['ports'])}: {cr['hours']} Std.")


if __name__ == "__main__":
    main()
