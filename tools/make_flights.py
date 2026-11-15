#!/usr/bin/env python3
"""Erzeugt ``data/flights.json``: Flüge ab dem BER, Weltkarte und gezeichnete Wahrzeichen.

- Ziele: von Hand ausgewählt (bekannte Urlaubs- und Fernziele auf allen Kontinenten).
  Flugzeiten sind ungefähre Werte, kein Flugplan.
- Weltkarte: Landflächen aus Natural Earth (gemeinfrei), über das npm-Paket ``world-atlas``
  (wird automatisch von registry.npmjs.org geladen), stark vereinfacht.
- Wahrzeichen: einfache Formen (Vieleck, Rechteck, Ellipse, Linie), die beide Programmversionen
  gleich zeichnen. Einheiten: x nach rechts, y nach oben, Boden bei y = 0, hohe Türme ≈ 100.

    python3 tools/make_flights.py
"""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_data import npm_files  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "flights.json"


# --------------------------------------------------------------------------
# Formen
# --------------------------------------------------------------------------

def P(fill, *pts):
    """Vieleck aus Punkten (x, y)."""
    return ["p", fill, [round(v, 1) for xy in pts for v in xy]]


def R(fill, x1, y1, x2, y2):
    return ["r", fill, round(min(x1, x2), 1), round(min(y1, y2), 1), round(max(x1, x2), 1), round(max(y1, y2), 1)]


def O(fill, cx, cy, rx, ry=None):
    return ["o", fill, round(cx, 1), round(cy, 1), round(rx, 1), round(ry if ry is not None else rx, 1)]


def L(fill, width, *pts):
    return ["l", fill, width, [round(v, 1) for xy in pts for v in xy]]


def water(color, y_top=0.0, y_bottom=-30.0, x1=-600, x2=600):
    return R(color, x1, y_bottom, x2, y_top)


def palm(x, h=26, y=0.0, lean=3):
    out = [L("#7A5230", 2.2, (x, y), (x + lean * 0.5, y + h * 0.6), (x + lean, y + h))]
    top = (x + lean, y + h)
    for dx, dy in ((-11, -4), (-8, 3), (0, 6), (8, 3), (11, -4), (5, -6), (-5, -6)):
        out.append(P("#3E8E41", top, (top[0] + dx * 0.5, top[1] + dy * 0.5 + 2), (top[0] + dx, top[1] + dy),
                     (top[0] + dx * 0.5, top[1] + dy * 0.5 - 1)))
    return out


def tree(x, h=14, color="#4F8A3D", y=0.0):
    return [R("#6B4A2B", x - 0.8, y, x + 0.8, y + h * 0.45),
            O(color, x, y + h * 0.65, h * 0.35, h * 0.38)]


def cypress(x, h=24, y=0.0):
    return [R("#5A3E26", x - 0.6, y, x + 0.6, y + 2), O("#2E5E3A", x, y + h * 0.5 + 1, 2.6, h * 0.5)]


def pine(x, h=20, y=0.0):
    """Schirmpinie."""
    return [L("#6B4A2B", 1.6, (x, y), (x + 1, y + h * 0.8)), O("#3F6B3A", x + 1, y + h * 0.85, 10, 3.5)]


def windows(fill, x1, x2, y1, y2, cols, rows, w=1.4, h=1.8):
    out = []
    for i in range(cols):
        for j in range(rows):
            cx = x1 + (x2 - x1) * (i + 0.5) / cols
            cy = y1 + (y2 - y1) * (j + 0.5) / rows
            out.append(R(fill, cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
    return out


def tower_block(x1, x2, h, color, win="#DCE9F5", rows=None):
    rows = rows or max(2, int(h / 6))
    return [R(color, x1, 0, x2, h)] + windows(win, x1 + 1, x2 - 1, 2, h - 2, max(1, int((x2 - x1) / 4)), rows)


def arch_row(fill, x1, x2, y1, y2, n):
    """Reihe von Rundbögen (dunkle Öffnungen)."""
    out = []
    w = (x2 - x1) / n
    for i in range(n):
        ax1, ax2 = x1 + i * w + w * 0.18, x1 + (i + 1) * w - w * 0.18
        r = (ax2 - ax1) / 2
        out.append(R(fill, ax1, y1, ax2, y2 - r))
        out.append(O(fill, (ax1 + ax2) / 2, y2 - r, r, r))
    return out




# --------------------------------------------------------------------------
# Wahrzeichen
# --------------------------------------------------------------------------

def berlin():
    s = []
    # Häuser der Stadt im Hintergrund
    for i, (x, w, h) in enumerate([(-120, 16, 18), (-100, 12, 24), (-86, 18, 14), (40, 14, 20), (56, 20, 16),
                                   (78, 12, 26), (92, 18, 15), (112, 14, 22)]):
        s += tower_block(x, x + w, h, ["#B9C3CF", "#C7CFD8", "#AEB8C4"][i % 3])
    # Brandenburger Tor
    x0 = -62
    sand = "#D9C08C"
    s.append(R(sand, x0 - 24, 0, x0 + 24, 2))
    for i in range(6):
        cx = x0 - 20 + i * 8
        s.append(R("#E6D2A4", cx - 1.5, 2, cx + 1.5, 20))
    s.append(R(sand, x0 - 25, 20, x0 + 25, 25))
    s.append(R("#CDB27A", x0 - 23, 25, x0 + 23, 29))
    s.append(R(sand, x0 - 8, 29, x0 + 8, 32))
    # Quadriga
    q = "#4F7F6B"
    for i in range(4):
        s.append(O(q, x0 - 4 + i * 2.6, 34, 1.6, 1.2))
        s.append(L(q, 0.7, (x0 - 4.6 + i * 2.6, 33), (x0 - 4.6 + i * 2.6, 32)))
    s.append(R(q, x0 - 1, 33, x0 + 6, 35.5))
    s.append(L(q, 0.6, (x0 + 4, 35.5), (x0 + 4, 39)))
    # Fernsehturm
    x1 = 8
    s.append(P("#D7DCE2", (x1 - 9, 0), (x1 + 9, 0), (x1 + 4, 8), (x1 - 4, 8)))       # Fuß
    s.append(P("#E6E9ED", (x1 - 3.4, 6), (x1 + 3.4, 6), (x1 + 2.2, 60), (x1 - 2.2, 60)))
    s.append(O("#C9CED6", x1, 66, 8.5, 8.5))                                            # Kugel
    s.append(R("#5D6B7A", x1 - 8.4, 65.2, x1 + 8.4, 67.6))
    s.append(O("#B4BBC4", x1 + 2.5, 69, 3.5, 2.5))
    s.append(R("#E6E9ED", x1 - 1.4, 74, x1 + 1.4, 82))
    for i in range(6):                                                                  # Antenne rot-weiß
        s.append(R("#D33A2C" if i % 2 == 0 else "#F4F4F4", x1 - 0.8, 82 + i * 3, x1 + 0.8, 85 + i * 3))
    s += tree(-30, 12) + tree(-24, 10) + tree(30, 12) + tree(120, 11)
    return s


def mallorca():
    s = [P("#B9A9C9", (-150, 0), (-120, 22), (-90, 14), (-60, 30), (-30, 12), (-10, 0)),       # Berge
         P("#C7B9D4", (60, 0), (90, 18), (120, 10), (150, 24), (180, 0))]
    stone = "#D8B47A"
    x0 = 5
    s.append(R(stone, x0 - 34, 0, x0 + 30, 34))                       # Kirchenschiff
    s.append(P("#C9A066", (x0 - 34, 34), (x0 + 30, 34), (x0 + 24, 40), (x0 - 28, 40)))
    for i in range(7):                                                # Strebepfeiler mit Türmchen
        bx = x0 - 34 + i * 10.5
        s.append(R("#C9A066", bx - 1.5, 0, bx + 1.5, 44))
        s.append(P("#C9A066", (bx - 1.5, 44), (bx + 1.5, 44), (bx, 50)))
    s.append(O("#8A6A3F", x0 - 4, 24, 5, 5))                           # Rosette
    s.append(O("#F2D9A6", x0 - 4, 24, 3, 3))
    s += arch_row("#8A6A3F", x0 - 30, x0 + 26, 4, 16, 7)
    s.append(R(stone, x0 + 30, 0, x0 + 40, 52))                       # Glockenturm
    s.append(P("#C9A066", (x0 + 30, 52), (x0 + 40, 52), (x0 + 35, 58)))
    s += arch_row("#8A6A3F", x0 + 31, x0 + 39, 40, 48, 1)
    s.append(water("#3FA3D6", 0, -12))
    s.append(R("#F0DCA8", -600, -12, 600, -8))                        # Strand
    s += palm(-60, 24, -8) + palm(-48, 20, -8, -3) + palm(60, 26, -8) + palm(74, 21, -8, -2)
    return s


def paris():
    s = []
    for i, (x, w, h) in enumerate([(-120, 22, 16), (-96, 18, 18), (-74, 20, 15), (44, 20, 17), (66, 22, 15),
                                   (90, 18, 18), (110, 20, 16)]):
        s.append(R("#EFE3C8", x, 0, x + w, h))
        s.append(P("#7E8C99", (x - 1, h), (x + w + 1, h), (x + w - 2, h + 5), (x + 2, h + 5)))  # Mansardendach
        s += windows("#8DA3B5", x + 1, x + w - 1, 2, h - 1, int(w / 4), 3, 1.6, 2.2)
    b = "#8B6B4A"
    x0 = 0
    # Beine mit Bogen
    s.append(P(b, (x0 - 30, 0), (x0 - 20, 0), (x0 - 6, 26), (x0 - 13, 26)))
    s.append(P(b, (x0 + 30, 0), (x0 + 20, 0), (x0 + 6, 26), (x0 + 13, 26)))
    s.append(P(b, (x0 - 20, 14), (x0 + 20, 14), (x0 + 16, 18), (x0 - 16, 18)))
    s.append(O(b, x0, 15, 15, 7))
    s.append(O("#BFD9EE", x0, 12.5, 12, 6.5))                          # Durchblick unter dem Bogen
    s.append(R(b, x0 - 16, 26, x0 + 16, 29))                          # 1. Etage
    s.append(P(b, (x0 - 12, 29), (x0 + 12, 29), (x0 + 5, 56), (x0 - 5, 56)))
    s.append(R(b, x0 - 7, 56, x0 + 7, 58.5))                          # 2. Etage
    s.append(P(b, (x0 - 4.5, 58.5), (x0 + 4.5, 58.5), (x0 + 1.4, 92), (x0 - 1.4, 92)))
    s.append(R(b, x0 - 2.5, 92, x0 + 2.5, 95))
    s.append(L(b, 0.8, (x0, 95), (x0, 102)))
    for y in range(32, 56, 5):                                        # Gitterwerk
        f = (y - 29) / 27
        s.append(L("#A8865F", 0.5, (x0 - 12 + 7 * f, y), (x0 + 12 - 7 * f, y + 4)))
        s.append(L("#A8865F", 0.5, (x0 + 12 - 7 * f, y), (x0 - 12 + 7 * f, y + 4)))
    s += tree(-36, 12) + tree(-44, 13) + tree(36, 12) + tree(30, 11)
    return s


def london():
    s = []
    # London Eye
    cx, cy, r = -78, 34, 30
    s.append(L("#D9DEE3", 1.2, *[(cx + r * math.cos(a / 24 * 2 * math.pi), cy + r * math.sin(a / 24 * 2 * math.pi))
                                  for a in range(25)]))
    for a in range(0, 24, 2):
        ang = a / 24 * 2 * math.pi
        s.append(L("#D9DEE3", 0.4, (cx, cy), (cx + r * math.cos(ang), cy + r * math.sin(ang))))
        s.append(O("#9BB7D0", cx + r * math.cos(ang), cy + r * math.sin(ang), 1.6, 1.3))
    s.append(L("#B7BDC4", 1.4, (cx - 10, 0), (cx, cy)))
    s.append(L("#B7BDC4", 1.4, (cx + 10, 0), (cx, cy)))
    gold = "#C8A867"
    # Parlament
    s.append(R(gold, -30, 0, 60, 22))
    for i in range(10):
        s.append(P("#B8975A", (-30 + i * 9, 22), (-27 + i * 9, 22), (-28.5 + i * 9, 27)))
    s += windows("#7D6A45", -28, 58, 3, 20, 18, 3, 1.2, 3)
    s.append(R(gold, 48, 0, 60, 40))
    s.append(P("#7E8C99", (48, 40), (60, 40), (54, 48)))
    # Elizabeth Tower (Big Ben)
    x0 = 10
    s.append(R(gold, x0 - 7, 0, x0 + 7, 62))
    s += windows("#9C8350", x0 - 6, x0 + 6, 4, 56, 3, 9, 1.2, 3)
    s.append(R("#B8975A", x0 - 8, 62, x0 + 8, 76))
    s.append(O("#FFFFF2", x0, 69, 5.6, 5.6))
    s.append(L("#2A2A2A", 0.8, (x0, 69), (x0, 73)))
    s.append(L("#2A2A2A", 0.8, (x0, 69), (x0 + 2.8, 69)))
    s.append(R(gold, x0 - 6, 76, x0 + 6, 84))
    s += arch_row("#7D6A45", x0 - 5, x0 + 5, 77, 83, 3)
    s.append(P("#4F5B66", (x0 - 6.5, 84), (x0 + 6.5, 84), (x0, 100)))
    s.append(water("#5C8DA8", 0, -10))
    # Roter Doppeldeckerbus
    bx = 74
    s.append(R("#D7262E", bx, -9, bx + 24, 4))
    s += windows("#CFE3F2", bx + 1, bx + 23, -4, 3, 5, 2, 3.4, 2.2)
    s.append(O("#222222", bx + 5, -9, 2, 2))
    s.append(O("#222222", bx + 19, -9, 2, 2))
    return s


def rome():
    s = []
    stone = "#C9A578"
    x0 = 0
    # Kolosseum: Ellipse mit drei Bogenreihen, rechts zerfallen
    s.append(P(stone, (x0 - 55, 0), (x0 + 55, 0), (x0 + 55, 28), (x0 + 40, 34), (x0 + 22, 40), (x0 - 55, 40)))
    s.append(P("#B48F62", (x0 - 55, 40), (x0 + 22, 40), (x0 + 20, 43), (x0 - 55, 43)))
    s += arch_row("#7A5C3A", x0 - 54, x0 + 54, 1, 12, 12)
    s += arch_row("#7A5C3A", x0 - 54, x0 + 50, 14, 24, 11)
    s += arch_row("#7A5C3A", x0 - 54, x0 + 30, 26, 36, 8)
    s.append(P("#E3C9A0", (x0 + 30, 36), (x0 + 55, 28), (x0 + 55, 30), (x0 + 32, 38)))
    s += cypress(-70, 26) + cypress(-78, 22) + cypress(70, 24) + pine(-100, 22) + pine(92, 20)
    return s


def athens():
    s = [P("#B98E5F", (-110, 0), (-80, 18), (-50, 26), (40, 26), (70, 16), (100, 0)),      # Akropolis-Felsen
         P("#A47A4E", (-80, 18), (-60, 14), (-40, 20), (-50, 26))]
    marble = "#EDE6D6"
    x0, y0 = -5, 26
    s.append(R("#D9D0BC", x0 - 34, y0, x0 + 34, y0 + 3))
    s.append(R("#E3DBC8", x0 - 32, y0 + 3, x0 + 32, y0 + 5))
    for i in range(9):
        cx = x0 - 28 + i * 7
        s.append(R(marble, cx - 1.6, y0 + 5, cx + 1.6, y0 + 26))
    s.append(R("#E3DBC8", x0 - 32, y0 + 26, x0 + 32, y0 + 31))
    s.append(P(marble, (x0 - 33, y0 + 31), (x0 + 33, y0 + 31), (x0, y0 + 40)))
    s.append(P("#D9D0BC", (x0 - 26, y0 + 32), (x0 + 26, y0 + 32), (x0, y0 + 38)))
    for x in (-90, -76, 66, 82):                                       # Olivenbäume
        s += tree(x, 10, "#7D9A5B")
    return s


def istanbul():
    s = []
    stone, dome = "#D8D0C4", "#8095AA"
    x0 = 0
    s.append(R(stone, x0 - 40, 0, x0 + 40, 22))
    s += arch_row("#8A7E6E", x0 - 38, x0 + 38, 2, 14, 10)
    for dx in (-26, 26):                                              # kleine Kuppeln
        s.append(R(stone, x0 + dx - 9, 22, x0 + dx + 9, 26))
        s.append(O(dome, x0 + dx, 26, 9, 7))
    s.append(R(stone, x0 - 18, 22, x0 + 18, 32))
    s.append(O(dome, x0, 32, 18, 14))                                  # Hauptkuppel
    s.append(R(stone, x0 - 18, 28, x0 + 18, 32))
    s.append(L("#C9A653", 0.8, (x0, 46), (x0, 51)))
    for mx in (-52, -44, 44, 52):                                     # Minarette
        h = 60 if abs(mx) == 52 else 54
        s.append(R("#E6E0D6", x0 + mx - 1.6, 0, x0 + mx + 1.6, h))
        for by in (h * 0.55, h * 0.8):
            s.append(R(stone, x0 + mx - 2.6, by, x0 + mx + 2.6, by + 1.4))
        s.append(P(dome, (x0 + mx - 1.8, h), (x0 + mx + 1.8, h), (x0 + mx, h + 9)))
    s.append(water("#3C88B5", 0, -12))
    for gx, gy in ((-80, 50), (-70, 56), (70, 46)):                   # Möwen
        s.append(L("#FFFFFF", 0.7, (gx - 3, gy + 1.5), (gx, gy), (gx + 3, gy + 1.5)))
    return s


def cairo():
    s = []
    for x0, h in ((-50, 60), (8, 46), (52, 30)):                      # Pyramiden
        s.append(P("#E2B867", (x0 - h * 1.05, 0), (x0 + h * 1.05, 0), (x0, h)))
        s.append(P("#C99A4B", (x0, h), (x0 + h * 1.05, 0), (x0 + h * 0.35, 0)))
    # Sphinx
    sx = 90
    s.append(R("#D6A75A", sx - 12, 0, sx + 8, 6))
    s.append(R("#D6A75A", sx + 2, 6, sx + 9, 13))
    s.append(P("#C99A4B", (sx + 1, 13), (sx + 10, 13), (sx + 10, 7), (sx + 12, 5), (sx + 1, 9)))
    s.append(R("#D6A75A", sx + 8, 0, sx + 16, 3))
    # Kamel
    k = "#A4733D"
    cx = -110
    s.append(O(k, cx, 12, 8, 4))
    s.append(O(k, cx - 2, 15, 3.5, 3))
    for lx in (-6, -2, 3, 6):
        s.append(L(k, 1.0, (cx + lx, 9), (cx + lx, 0)))
    s.append(L(k, 1.4, (cx + 7, 13), (cx + 11, 19)))
    s.append(O(k, cx + 12.5, 19.5, 2.4, 1.4))
    s += palm(120, 24) + palm(132, 20, 0, -3)
    return s


def dubai():
    s = [P("#E8C98E", (-150, 0), (-100, 8), (-60, 2), (-20, 6), (20, 0))]       # Dünen
    for i, (x, w, h) in enumerate([(-80, 10, 30), (-66, 8, 40), (-56, 9, 26), (34, 10, 36), (46, 8, 46),
                                   (56, 12, 30), (70, 9, 38)]):
        s += tower_block(x, x + w, h, ["#9FB4C7", "#B5C6D6", "#8BA3B9"][i % 3], "#E5F0FA")
    # Burj Khalifa: gestuft bis zur Nadel
    x0 = 10
    c1, c2 = "#C3D2DF", "#A5B7C8"
    for (w, y1, y2) in ((12, 0, 30), (9, 30, 55), (6.5, 55, 75), (4.5, 75, 88), (3, 88, 96)):
        s.append(R(c1, x0 - w / 2, y1, x0 + w / 2, y2))
        s.append(R(c2, x0 + w / 6, y1, x0 + w / 2, y2))
    s.append(P(c1, (x0 - 1.4, 96), (x0 + 1.4, 96), (x0, 112)))
    # Burj Al Arab (Segel) am Wasser
    bx = 80
    s.append(water("#3BA7C9", 0, -10, 66, 600))
    s.append(P("#F4F4F4", (bx, -2), (bx + 2, 40), (bx + 16, 4)))
    s.append(L("#B7C2CC", 1.2, (bx, -2), (bx + 2, 44)))
    return s


def new_york():
    s = []
    for i, (x, w, h) in enumerate([(-150, 14, 30), (-134, 10, 44), (-122, 12, 36), (-108, 10, 52), (-96, 14, 34),
                                   (-80, 10, 40), (-68, 12, 28), (90, 12, 30), (104, 10, 40), (116, 14, 26)]):
        s += tower_block(x, x + w, h, ["#8EA0B3", "#A3B3C4", "#7F93A8"][i % 3])
    # Empire State Building
    ex = -40
    s.append(R("#9AA9B9", ex - 8, 0, ex + 8, 40))
    s.append(R("#9AA9B9", ex - 5.5, 40, ex + 5.5, 56))
    s.append(R("#9AA9B9", ex - 3.5, 56, ex + 3.5, 64))
    s.append(R("#9AA9B9", ex - 1.5, 64, ex + 1.5, 70))
    s.append(L("#9AA9B9", 0.8, (ex, 70), (ex, 80)))
    s += windows("#DCE9F5", ex - 7, ex + 7, 2, 38, 4, 7)
    s.append(water("#4C86A8", 0, -14))
    # Freiheitsstatue auf ihrem Sockel (Insel)
    x0 = 40
    green, dark = "#6FA88E", "#4F8A72"
    s.append(P("#7D9A6A", (x0 - 26, -4), (x0 + 26, -4), (x0 + 20, 2), (x0 - 20, 2)))
    s.append(P("#B9AE94", (x0 - 14, 2), (x0 + 14, 2), (x0 + 10, 8), (x0 - 10, 8)))
    s.append(R("#CFC4A8", x0 - 6, 8, x0 + 6, 30))
    s.append(R("#B9AE94", x0 - 7, 28, x0 + 7, 31))
    s.append(P(green, (x0 - 5, 31), (x0 + 5, 31), (x0 + 3.5, 56), (x0 - 3.5, 56)))         # Gewand
    s.append(P(dark, (x0 + 1, 31), (x0 + 5, 31), (x0 + 3.5, 56), (x0 + 1, 50)))
    s.append(R(dark, x0 - 6.5, 44, x0 - 3.5, 50))                                          # Buch
    s.append(O(green, x0, 59.5, 2.6, 3.2))                                                 # Kopf
    for a in (-60, -30, 0, 30, 60):                                                        # Krone
        r = math.radians(90 + a)
        s.append(L(green, 0.8, (x0 + math.cos(r) * 2.4, 61 + math.sin(r) * 2.4),
                   (x0 + math.cos(r) * 6, 61 + math.sin(r) * 6)))
    s.append(L(green, 2.0, (x0 + 3, 54), (x0 + 6, 66), (x0 + 7, 72)))                     # Arm
    s.append(R("#C9A653", x0 + 5.8, 72, x0 + 8.2, 74))                                     # Fackel
    s.append(O("#F2B33D", x0 + 7, 76.5, 2, 3))
    return s


def tokyo():
    s = [P("#7D8FA8", (-150, 0), (-30, 70), (-18, 74), (-6, 70), (110, 0)),                 # Fuji
         P("#FFFFFF", (-41, 63), (-30, 70), (-18, 74), (-6, 70), (5, 63), (-4, 60), (-10, 64), (-18, 59),
           (-26, 64), (-33, 59))]
    # Pagode
    x0, red = 50, "#C8372D"
    y = 0
    for i, w in enumerate((22, 19, 16, 13, 10)):
        s.append(R(red, x0 - w * 0.35, y, x0 + w * 0.35, y + 7))
        s.append(P("#3B3B3B", (x0 - w * 0.75, y + 7), (x0 + w * 0.75, y + 7), (x0 + w * 0.45, y + 10),
                   (x0 - w * 0.45, y + 10)))
        y += 10
    s.append(L("#C9A653", 1.0, (x0, y), (x0, y + 10)))
    for x, h in ((-70, 14), (-56, 12), (20, 13), (86, 14), (100, 11)):                      # Kirschbäume
        s.append(R("#6B4A2B", x - 0.8, 0, x + 0.8, h * 0.5))
        s.append(O("#F6B9CF", x, h * 0.7, h * 0.42, h * 0.32))
        s.append(O("#F9D0DE", x - 2, h * 0.78, h * 0.25, h * 0.18))
    return s


def beijing():
    s = [P("#7FA36A", (-160, 0), (-120, 30), (-90, 20), (-50, 42), (-10, 26), (30, 46), (70, 22), (110, 34),
           (160, 0)),
         P("#93B57D", (-160, 0), (-110, 14), (-60, 6), (0, 16), (60, 6), (120, 14), (160, 0))]
    ridge = [(-150, 6), (-120, 30), (-90, 20), (-50, 42), (-10, 26), (30, 46), (70, 22), (110, 34), (150, 8)]
    s.append(L("#B59B76", 4.0, *ridge))                                 # Mauer auf dem Bergkamm
    s.append(L("#D6C3A0", 1.0, *[(x, y + 2.2) for x, y in ridge]))
    for x, y in ridge[1:-1]:                                            # Wachtürme
        s.append(R("#A88C66", x - 4, y - 2, x + 4, y + 8))
        s.append(R("#5E4A33", x - 1.2, y + 1, x + 1.2, y + 5))
        s.append(P("#7A5C3A", (x - 5, y + 8), (x + 5, y + 8), (x, y + 12)))
    return s


def cape_town():
    s = [P("#7E8B7A", (-160, 0), (-120, 30), (-100, 52), (60, 54), (90, 40), (120, 18), (160, 0)),   # Tafelberg
         P("#6C796A", (-100, 52), (-80, 30), (-50, 44), (-20, 30), (10, 46), (40, 34), (60, 54)),
         R("#F2F2F2", -100, 53, 60, 56)]                                                            # „Tischtuch“-Wolke
    s.append(O("#F2F2F2", -40, 56, 50, 3))
    s.append(water("#2F84B8", 0, -8))
    s.append(R("#F0DCA8", -600, -12, 600, -8))
    # Leuchtturm
    lx = 110
    s.append(P("#FFFFFF", (lx - 3.5, -8), (lx + 3.5, -8), (lx + 2.2, 22), (lx - 2.2, 22)))
    for y in (-2, 8):
        s.append(R("#D33A2C", lx - 3.3, y, lx + 3.3, y + 4))
    s.append(R("#F2D16B", lx - 2, 22, lx + 2, 26))
    s.append(P("#D33A2C", (lx - 3, 26), (lx + 3, 26), (lx, 30)))
    for px in (-60, -52, -45, 40, 47):                                  # Pinguine
        s.append(O("#222222", px, -6, 1.8, 3))
        s.append(O("#FFFFFF", px + 0.6, -6.3, 1.0, 2.2))
        s.append(O("#222222", px, -2.4, 1.2, 1.2))
        s.append(P("#F2B33D", (px + 0.9, -2.6), (px + 2.4, -2.4), (px + 0.9, -2.0)))
    return s


def sydney():
    s = []
    # Harbour Bridge im Hintergrund
    bx = -70
    arc = [(bx - 45 + i * 4.5, 8 + 26 * math.sin(math.pi * i / 20)) for i in range(21)]
    s.append(L("#7D8794", 2.2, *arc))
    s.append(L("#7D8794", 1.2, (bx - 52, 12), (bx + 52, 12)))
    for x, y in arc[2:-2:2]:
        s.append(L("#7D8794", 0.6, (x, y), (x, 12)))
    for px in (bx - 52, bx + 46):
        s.append(R("#B9A88A", px, 0, px + 6, 22))
    s.append(water("#2A7FB8", 0, -14))
    # Opernhaus: weiße Segel auf dem Sockel
    x0 = 30
    s.append(R("#D7B998", x0 - 40, -4, x0 + 44, 4))
    shells = [(-34, 18, 24), (-16, 26, 34), (4, 22, 28), (20, 16, 20), (32, 10, 13)]
    for dx, w, h in shells:
        x = x0 + dx
        s.append(P("#FAFAF5", (x, 4), (x + w * 0.15, h * 0.7 + 4), (x + w * 0.35, h + 4), (x + w * 0.6, h * 0.55 + 4),
                   (x + w, 4)))
        s.append(P("#E0E3E6", (x + w * 0.35, h + 4), (x + w * 0.6, h * 0.55 + 4), (x + w, 4), (x + w * 0.55, 4)))
    return s


def rio():
    s = [P("#5E8C55", (-160, 0), (-120, 40), (-104, 66), (-96, 68), (-80, 46), (-40, 20), (0, 0)),   # Corcovado
         P("#6F7F70", (40, 0), (48, 30), (62, 46), (76, 44), (88, 24), (92, 0))]                     # Zuckerhut
    # Christusstatue
    cx, cy = -100, 68
    s.append(R("#E9E6DF", cx - 1.4, cy, cx + 1.4, cy + 12))
    s.append(R("#E9E6DF", cx - 9, cy + 9, cx + 9, cy + 10.6))
    s.append(O("#E9E6DF", cx, cy + 13.4, 1.4, 1.6))
    # Seilbahn zum Zuckerhut
    s.append(L("#4A4A4A", 0.4, (0, 18), (66, 46)))
    s.append(R("#D33A2C", 30, 28, 34, 31.5))
    s.append(water("#2F95C6", 0, -8))
    s.append(R("#F0DCA8", -600, -12, 600, -8))
    s += palm(-20, 24, -8) + palm(110, 22, -8, -3) + palm(124, 26, -8)
    return s


def elephant(x, size=1.0, y=0.0):
    g, k = "#8E8A86", size
    out = [R(g, x - 7 * k, y, x - 4.5 * k, y + 6 * k), R(g, x + 3 * k, y, x + 5.5 * k, y + 6 * k),
           O(g, x, y + 9 * k, 9 * k, 6 * k),
           O(g, x + 9 * k, y + 11 * k, 4 * k, 4 * k),
           L(g, 2.2 * k, (x + 12 * k, y + 10 * k), (x + 13.5 * k, y + 4 * k), (x + 12.5 * k, y + 1 * k)),
           O("#7A7672", x + 7 * k, y + 11 * k, 2.8 * k, 3.8 * k),
           O("#2B2B2B", x + 10.5 * k, y + 12.5 * k, 0.5 * k, 0.5 * k)]
    return out


def giraffe(x, size=1.0, y=0.0):
    c, k = "#E3A64A", size
    out = [L(c, 1.0 * k, (x - 4 * k, y + 10 * k), (x - 4.5 * k, y)), L(c, 1.0 * k, (x + 4 * k, y + 10 * k), (x + 4.5 * k, y)),
           O(c, x, y + 11 * k, 6 * k, 3.2 * k),
           L(c, 2.0 * k, (x + 4 * k, y + 12 * k), (x + 8 * k, y + 24 * k)),
           O(c, x + 9.5 * k, y + 25 * k, 2.6 * k, 1.5 * k),
           L("#7A4E22", 0.5 * k, (x + 8 * k, y + 26 * k), (x + 8 * k, y + 27.5 * k))]
    for dx, dy in ((-3, 11), (0, 12), (3, 10.5), (1, 10), (5.5, 16), (6.5, 20)):
        out.append(O("#9A5B22", x + dx * k, y + dy * k, 0.9 * k, 0.7 * k))
    return out


def acacia(x, h=14, y=0.0):
    return [L("#6B4A2B", 1.2, (x, y), (x + 1, y + h * 0.6), (x - 2, y + h * 0.85)),
            L("#6B4A2B", 1.0, (x + 1, y + h * 0.6), (x + 4, y + h * 0.85)),
            O("#5E7A35", x + 1, y + h * 0.92, h * 0.7, h * 0.16)]


def fir(x, h=16, snow=False, y=0.0):
    out = [R("#5A3E26", x - 0.8, y, x + 0.8, y + h * 0.15)]
    for k in range(3):
        w, y1 = h * (0.36 - k * 0.08), y + h * (0.12 + k * 0.25)
        out.append(P("#2F5D3A", (x - w, y1), (x + w, y1), (x, y1 + h * 0.4)))
        if snow:
            out.append(P("#F4F8FB", (x - w * 0.45, y1 + h * 0.22), (x + w * 0.45, y1 + h * 0.22), (x, y1 + h * 0.4)))
    return out


def crete():
    s = [P("#B9A98F", (-170, 0), (-120, 30), (-80, 20), (-40, 42), (0, 14), (20, 0)),          # Berge (Ida)
         P("#C9BBA2", (30, 0), (80, 16), (130, 8), (170, 0))]
    # Windmühle auf dem Hügel
    wx = -100
    s.append(P("#F4F1EA", (wx - 4, 24), (wx + 4, 24), (wx + 3, 38), (wx - 3, 38)))
    s.append(P("#B5302A", (wx - 3.5, 38), (wx + 3.5, 38), (wx, 42)))
    for a in (20, 110, 200, 290):
        r = math.radians(a)
        s.append(L("#6B4A2B", 0.6, (wx, 37), (wx + 13 * math.cos(r), 37 + 13 * math.sin(r))))
        s.append(P("#FFFFFF", (wx + 4 * math.cos(r), 37 + 4 * math.sin(r)),
                   (wx + 13 * math.cos(r), 37 + 13 * math.sin(r)),
                   (wx + 12 * math.cos(r + 0.35), 37 + 12 * math.sin(r + 0.35))))
    # Palast von Knossos: Mauern, rote Säulen (oben breiter), Stierfresko, Kulthörner
    ochre, light = "#D9B98A", "#E6CDA2"
    x0 = 10
    s.append(R(ochre, x0 - 44, 0, x0 + 46, 15))
    s += arch_row("#8C6A43", x0 - 42, x0 - 6, 1, 11, 4)
    s.append(R("#EFDDB8", x0 + 2, 3, x0 + 30, 12))                 # Fresko mit Stier
    s.append(O("#B5302A", x0 + 16, 7, 7, 2.6))
    s.append(O("#B5302A", x0 + 23.5, 8.5, 2.4, 1.8))
    s.append(L("#B5302A", 0.7, (x0 + 22.5, 10), (x0 + 22, 11.5)))
    s.append(L("#B5302A", 0.7, (x0 + 24.5, 10), (x0 + 25.5, 11.5)))
    for lx in (10, 13, 19, 22):
        s.append(L("#B5302A", 0.9, (x0 + lx, 6), (x0 + lx + (2 if lx < 16 else -1), 3.5)))
    s.append(R(light, x0 - 30, 15, x0 + 36, 17))
    for i in range(6):                                              # rote Säulen mit schwarzem Kapitell
        cx = x0 - 26 + i * 12
        s.append(P("#B5302A", (cx - 1.3, 17), (cx + 1.3, 17), (cx + 2, 28), (cx - 2, 28)))
        s.append(R("#2B2B2B", cx - 2.6, 28, cx + 2.6, 30))
    s.append(R("#C9A475", x0 - 32, 30, x0 + 38, 33))
    for hx in (x0 - 18, x0 + 26):                                    # Kulthörner auf dem Dach
        s.append(R(light, hx - 4, 33, hx + 4, 35))
        s.append(P(light, (hx - 4, 35), (hx - 2, 35), (hx - 4, 41)))
        s.append(P(light, (hx + 2, 35), (hx + 4, 35), (hx + 4, 41)))
    s.append(water("#2E8BC9", 0, -10))
    s.append(R("#F0DCA8", -600, -12, 600, -8))
    for x in (-70, -58, 74, 88):
        s += tree(x, 10, "#7D9A5B", -8)
    s += cypress(64, 22, -8)
    return s


def barcelona():
    s = []
    for i, (x, w, h) in enumerate([(-130, 18, 16), (-110, 16, 20), (-92, 20, 14), (62, 18, 18), (82, 20, 15),
                                   (104, 16, 20)]):
        s += tower_block(x, x + w, h, ["#E8D3B0", "#F0DDC0", "#DCC5A0"][i % 3], "#9FB4C7")
    stone = "#C9B48E"
    s.append(R(stone, -44, 0, 44, 30))
    s += arch_row("#7E6A4E", -40, 40, 2, 22, 6)
    for x, h, w in ((-34, 58, 4.2), (-22, 70, 4.6), (22, 70, 4.6), (34, 58, 4.2), (-8, 80, 4.4), (8, 80, 4.4),
                    (0, 100, 6.0)):
        s.append(P(stone if h < 100 else "#BCA67E", (x - w, 28), (x + w, 28), (x + w * 0.55, h * 0.85), (x, h),
                   (x - w * 0.55, h * 0.85)))
        for y in range(36, int(h * 0.8), 8):
            s.append(R("#7E6A4E", x - 0.6, y, x + 0.6, y + 3))
        s.append(O("#E3A64A" if h < 100 else "#F2F2F2", x, h + 1.5, 1.8, 1.8))
    s.append(water("#3FA3D6", 0, -10))
    s.append(R("#F0DCA8", -600, -12, 600, -8))
    s += palm(-70, 22, -8) + palm(-60, 18, -8, -2) + palm(70, 24, -8)
    return s


def amsterdam():
    s = []
    colors = ["#8C4A2F", "#3E5C76", "#C9A86A", "#6B3E2E", "#4F6D5A", "#A55A3A", "#2F4A63"]
    x = -70
    for i in range(7):                                              # Grachtenhäuser mit Giebeln
        w, h, col = 12, 26 + (i * 7) % 10, colors[i]
        s.append(R(col, x, 0, x + w, h))
        if i % 2 == 0:                                              # Treppengiebel
            s.append(R(col, x + 1.5, h, x + w - 1.5, h + 3))
            s.append(R(col, x + 3.5, h + 3, x + w - 3.5, h + 6))
        else:                                                       # Glockengiebel
            s.append(P(col, (x + 1, h), (x + w - 1, h), (x + w - 3, h + 4), (x + w / 2, h + 7), (x + 3, h + 4)))
        s += windows("#F4F1EA", x + 1, x + w - 1, 3, h - 1, 2, 4, 2.6, 3.0)
        s += windows("#3E4A57", x + 1, x + w - 1, 3, h - 1, 2, 4, 1.6, 2.2)
        x += w + 1
    # Windmühle
    mx = 60
    s.append(P("#6B5A4A", (mx - 7, 0), (mx + 7, 0), (mx + 4, 26), (mx - 4, 26)))
    s.append(P("#3E3A36", (mx - 5, 26), (mx + 5, 26), (mx, 32)))
    s.append(R("#F4F1EA", mx - 2, 2, mx + 2, 8))
    for a in (35, 125, 215, 305):
        r = math.radians(a)
        s.append(L("#4A3B2E", 1.0, (mx, 27), (mx + 22 * math.cos(r), 27 + 22 * math.sin(r))))
        s.append(P("#F4F1EA", (mx + 5 * math.cos(r), 27 + 5 * math.sin(r)),
                   (mx + 22 * math.cos(r), 27 + 22 * math.sin(r)),
                   (mx + 21 * math.cos(r + 0.22), 27 + 21 * math.sin(r + 0.22)),
                   (mx + 5 * math.cos(r + 0.5), 27 + 5 * math.sin(r + 0.5))))
    s.append(water("#4C7FA0", 0, -6, -80, 20))                      # Gracht mit Brücke
    s.append(R("#8C4A2F", -36, -1, -12, 2))
    s.append(O("#4C7FA0", -24, -1.5, 8, 2.8))
    for i in range(36):                                             # Tulpenfeld
        tx = 28 + (i % 12) * 5
        ty = -9 + (i // 12) * 2.5
        s.append(O(["#E0313A", "#F2C230", "#E86FA0"][i // 12], tx, ty, 1.4, 1.1))
    return s


def reykjavik():
    s = [P("#5B5550", (-170, 0), (-130, 34), (-118, 38), (-104, 34), (-60, 0)),               # Vulkan
         P("#E2553A", (-122, 37), (-114, 37), (-112, 30), (-120, 28)),
         P("#6E7F64", (40, 0), (90, 20), (140, 12), (180, 0))]
    for i, (dx, dy, r) in enumerate(((-118, 46, 7), (-112, 54, 9), (-122, 62, 8), (-110, 70, 6))):
        s.append(O("#C9CCD1", dx, dy, r, r * 0.8))                   # Rauch
    for i, x in enumerate(range(-90, -40, 9)):                       # bunte Häuser
        col = ["#D9483B", "#F2C230", "#3E7CB1", "#F4F1EA", "#4F8A3D"][i % 5]
        s.append(R(col, x, 0, x + 7, 8))
        s.append(P("#3A3A3A", (x - 0.5, 8), (x + 7.5, 8), (x + 3.5, 11)))
    # Hallgrímskirkja: Stufen wie Basaltsäulen, hoher Turm in der Mitte
    c, x0 = "#D9DCDF", 20
    s.append(R("#C4C8CC", x0 - 6, 0, x0 + 34, 24))
    s.append(P("#9EA4AA", (x0 - 6, 24), (x0 + 34, 24), (x0 + 30, 30), (x0 - 2, 30)))
    for w, h in ((24, 8), (21, 14), (18, 20), (15, 27), (12, 34), (9, 42), (6.5, 52)):
        s.append(R(c, x0 - w, 0, x0 + w, h))
        s.append(R("#BFC4C9", x0 - w, h - 1, x0 + w, h))
    s.append(P(c, (x0 - 5, 52), (x0 + 5, 52), (x0, 80)))
    s.append(R("#5D6670", x0 - 1.5, 58, x0 + 1.5, 64))
    s.append(L("#5D6670", 0.6, (x0, 80), (x0, 84)))
    s.append(R("#6E7F64", -600, -12, 600, -2))
    s.append(water("#4E7FA0", -2, -6))
    return s


def rovaniemi():
    s = []
    for i, (col, y) in enumerate((("#2FA883", 92), ("#238F95", 82), ("#4FBF8E", 102))):       # Polarlichter
        pts = [(-170 + k * 20, y + 8 * math.sin(k * 0.9 + i)) for k in range(18)]
        s.append(P(col, *(pts + [(x, y - 10 + 6 * math.sin(k * 1.1 + i)) for k, (x, y_) in reversed(list(enumerate(pts)))])))
    s.append(P("#DCE6EE", (-170, 0), (-120, 18), (-80, 10), (-30, 24), (20, 0)))
    s.append(P("#E6EEF5", (40, 0), (100, 16), (170, 0)))
    for x, h in ((-110, 22), (-96, 18), (-84, 24), (70, 20), (84, 26), (100, 18), (116, 22)):
        s += fir(x, h, True)
    # Holzhaus des Weihnachtsmanns
    x0, red = -10, "#B3322A"
    s.append(R(red, x0 - 22, 0, x0 + 22, 18))
    for y in range(2, 18, 3):
        s.append(R("#8F261F", x0 - 22, y, x0 + 22, y + 0.6))
    s.append(P("#F4F8FB", (x0 - 26, 18), (x0 + 26, 18), (x0, 34)))
    s.append(R("#5A3E26", x0 + 10, 26, x0 + 15, 36))
    for i, r in enumerate((2.5, 3.2, 4)):
        s.append(O("#C9CED6", x0 + 13 + i * 2.5, 39 + i * 4, r, r * 0.8))
    s.append(R("#F7D774", x0 - 16, 6, x0 - 8, 13))
    s.append(R("#F7D774", x0 + 8, 6, x0 + 16, 13))
    s.append(R("#5A3E26", x0 - 3, 0, x0 + 3, 12))
    # Rentiere mit Schlitten
    for rx in (24, 36):
        b = "#8A5A34"
        s.append(O(b, rx, 7, 5, 2.6))
        for lx in (-3.5, -1.5, 2, 4):
            s.append(L(b, 0.8, (rx + lx, 6), (rx + lx, 0)))
        s.append(L(b, 1.4, (rx + 4, 8), (rx + 6, 12)))
        s.append(O(b, rx + 7, 12.5, 1.8, 1.3))
        s.append(L("#5A3E26", 0.5, (rx + 6, 13.5), (rx + 5, 17), (rx + 3.5, 18)))
        s.append(L("#5A3E26", 0.5, (rx + 6.5, 13.5), (rx + 8, 17), (rx + 9.5, 18)))
    s.append(P("#B3322A", (6, 2), (18, 2), (19, 8), (8, 8)))
    s.append(L("#C9A653", 0.8, (4, 1), (20, 1), (21, 3)))
    s.append(O("#B3322A", 12, 11, 2.6, 3))                            # Weihnachtsmann
    s.append(O("#F4F8FB", 12.6, 12.5, 1.6, 1.8))
    s.append(O("#F2C9A8", 12.6, 14.3, 1.2, 1.1))
    s.append(P("#B3322A", (11, 15), (14.2, 15), (12.4, 18)))
    return s


def tenerife():
    s = [P("#8C6E5A", (-170, 0), (-60, 50), (-46, 58), (-34, 50), (60, 0)),                   # Teide
         P("#F4F1EA", (-58, 51), (-46, 58), (-34, 50), (-40, 46), (-46, 50), (-52, 46)),
         P("#A08572", (60, 0), (110, 14), (170, 0))]
    s.append(water("#2C8CC4", 0, -10))
    s.append(R("#4A4642", -600, -12, 600, -8))                        # schwarzer Lavastrand
    # Drachenbaum
    dx = 40
    s.append(R("#8C7A62", dx - 2, -8, dx + 2, 8))
    for a in (-60, -30, 0, 30, 60):
        r = math.radians(90 + a)
        ex, ey = dx + 10 * math.cos(r), 8 + 8 * math.sin(r)
        s.append(L("#8C7A62", 1.4, (dx, 8), (ex, ey)))
        s.append(O("#4E7A3A", ex, ey + 1.5, 5, 2.6))
    s += palm(70, 24, -8) + palm(84, 20, -8, -3) + palm(-80, 22, -8)
    for x in range(-125, -95, 7):                                     # weiße Häuser am Hang
        s.append(R("#F4F1EA", x, 0, x + 6, 6))
        s.append(R("#C9542D", x - 0.5, 6, x + 6.5, 7))
    return s


def nairobi():
    s = [P("#8E9BB0", (-160, 0), (-90, 40), (-80, 44), (-70, 40), (0, 0)),                  # Berg in der Ferne
         P("#F4F1EA", (-96, 36), (-80, 44), (-64, 36), (-72, 34), (-80, 37), (-88, 34))]
    for x, h in ((-120, 14), (-40, 16), (60, 12), (110, 15)):
        s += acacia(x, h)
    s += giraffe(-14, 1.3) + giraffe(8, 1.0) + elephant(44, 1.1)
    for zx in (-70, -60):                                             # Zebras
        s.append(O("#F4F4F4", zx, 7, 5, 2.6))
        for lx in (-3, -1.5, 2, 3.5):
            s.append(L("#F4F4F4", 0.8, (zx + lx, 6), (zx + lx, 0)))
        s.append(L("#F4F4F4", 1.3, (zx + 4, 8), (zx + 6, 11)))
        s.append(O("#F4F4F4", zx + 7, 11, 1.6, 1.1))
        for k in range(-3, 4):
            s.append(L("#2B2B2B", 0.5, (zx + k * 1.2, 4.8), (zx + k * 1.2 + 0.6, 9.4)))
    return s


def delhi():
    s = []
    m, shade = "#F4F1EA", "#DCD6CA"
    x0 = 0
    s.append(R("#C9B9A0", x0 - 50, 0, x0 + 50, 4))                   # Sockel
    for mx in (-44, 44):                                             # Minarette
        s.append(P(m, (x0 + mx - 2, 4), (x0 + mx + 2, 4), (x0 + mx + 1.4, 48), (x0 + mx - 1.4, 48)))
        for by in (16, 30, 44):
            s.append(R(shade, x0 + mx - 2.4, by, x0 + mx + 2.4, by + 1.2))
        s.append(O(m, x0 + mx, 50, 2.6, 2.4))
        s.append(L("#C9A653", 0.5, (x0 + mx, 52), (x0 + mx, 55)))
    s.append(R(m, x0 - 28, 4, x0 + 28, 34))                           # Hauptbau
    s.append(R(shade, x0 + 16, 4, x0 + 28, 34))
    s.append(P("#B9C2CC", (x0 - 7, 4), (x0 + 7, 4), (x0 + 7, 22), (x0, 29), (x0 - 7, 22)))   # großer Bogen
    for ax in (-20, 20):
        s.append(P("#C9CED6", (x0 + ax - 3, 6), (x0 + ax + 3, 6), (x0 + ax + 3, 14), (x0 + ax, 17), (x0 + ax - 3, 14)))
        s.append(P("#C9CED6", (x0 + ax - 3, 19), (x0 + ax + 3, 19), (x0 + ax + 3, 26), (x0 + ax, 29), (x0 + ax - 3, 26)))
    for cx in (-20, 20):                                             # kleine Kuppeln
        s.append(R(m, x0 + cx - 4, 34, x0 + cx + 4, 38))
        s.append(O(m, x0 + cx, 40, 4.5, 4))
    s.append(R(m, x0 - 12, 34, x0 + 12, 40))                          # Zwiebelkuppel
    s.append(O(m, x0, 50, 14, 13))
    s.append(P(m, (x0 - 6, 61), (x0 + 6, 61), (x0, 70)))
    s.append(L("#C9A653", 0.8, (x0, 69), (x0, 75)))
    s.append(R("#6FA8C8", x0 - 4, -12, x0 + 4, 0))                   # Wasserbecken
    for x in (-70, -62, 62, 70):
        s += cypress(x, 18)
    s += elephant(-110, 1.0)
    return s


def bangkok():
    s = []
    stone, white = "#E3D3B0", "#F4EEE0"
    x0 = 10
    for dx, k in ((-36, 0.55), (56, 0.55), (0, 1.0)):                 # Prangs von Wat Arun
        x, y = x0 + dx, 0
        for i in range(7):
            w = (16 - i * 2) * k
            h = (10 - i * 0.8) * k
            s.append(P(stone if i % 2 == 0 else white, (x - w, y), (x + w, y), (x + w * 0.85, y + h), (x - w * 0.85, y + h)))
            for j in range(-2, 3):
                s.append(O(["#D9483B", "#3E7CB1", "#4F8A3D"][(i + j) % 3], x + j * w * 0.3, y + h * 0.5, 0.7 * k + 0.2, 0.7 * k + 0.2))
            y += h
        s.append(P(stone, (x - 2 * k, y), (x + 2 * k, y), (x, y + 16 * k)))
    # Tempeldach links
    tx = -90
    s.append(R("#F4EEE0", tx - 14, 0, tx + 14, 10))
    for i, (w, col) in enumerate(((20, "#C8372D"), (15, "#2E7D4F"), (10, "#C8372D"))):
        y = 10 + i * 5
        s.append(P(col, (tx - w, y), (tx + w, y), (tx + w * 0.6, y + 6), (tx - w * 0.6, y + 6)))
    s.append(L("#E3A64A", 0.8, (tx, 25), (tx, 31)))
    s.append(water("#8C7A52", 0, -8))                                 # Fluss Chao Phraya
    # Tuk-Tuk
    k = 1.0
    bx = 70
    s.append(R("#2E7D4F", bx, -8, bx + 14, -1))
    s.append(R("#F2C230", bx - 1, -1, bx + 15, 1))
    s.append(O("#222222", bx + 2, -8, 1.8, 1.8))
    s.append(O("#222222", bx + 12, -8, 1.8, 1.8))
    s += palm(-60, 22) + palm(100, 20, 0, -3)
    return s


def san_francisco():
    s = [P("#8DA77A", (-170, 0), (-130, 26), (-90, 14), (-50, 0)),
         P("#9DB48A", (80, 0), (120, 22), (170, 6), (200, 0))]
    red = "#C0362C"
    for tx in (-50, 40):                                              # Türme der Golden Gate Bridge
        s.append(R(red, tx - 4, -6, tx - 2, 62))
        s.append(R(red, tx + 2, -6, tx + 4, 62))
        for y in (20, 38, 54, 61):
            s.append(R(red, tx - 4, y, tx + 4, y + 2.4))
    cable = [(-140 + i * 4.5, 0) for i in range(61)]
    def sag(x):
        if x < -50:
            return 60 - 52 * ((x + 50) / -90) ** 0.9 if x > -140 else 8
        if x > 40:
            return 60 - 52 * ((x - 40) / 90) ** 0.9 if x < 130 else 8
        u = (x + 5) / 45
        return 20 + 40 * u * u
    cable = [(x, sag(x)) for x, _ in cable]
    s.append(L(red, 1.0, *cable))
    for x, y in cable[1::2]:
        s.append(L(red, 0.4, (x, y), (x, 8)))
    s.append(R(red, -150, 6, 150, 9))                                 # Fahrbahn
    s.append(water("#3C7CA8", 0, -14))
    for i, (dx, dy) in enumerate(((-110, 40), (-90, 44), (110, 36), (130, 40))):   # Nebel
        s.append(O("#E8EDF2", dx, dy, 14, 4))
    return s


def cancun():
    s = [P("#4E8A44", (-170, 0), (-120, 18), (-60, 12), (0, 20), (60, 10), (120, 18), (170, 0))]   # Dschungel
    for x in range(-150, 160, 14):
        s.append(O("#3F7A3A", x, 14 + 4 * math.sin(x), 9, 6))
    st, dark = "#CDBB95", "#A8966E"
    x0 = -10
    for i in range(9):                                                 # El Castillo: neun Stufen
        w, y = 40 - i * 3.4, i * 4
        s.append(R(st, x0 - w, y, x0 + w, y + 4))
        s.append(R(dark, x0 - w, y, x0 + w, y + 0.8))
    s.append(P("#9C8A62", (x0 - 6, 0), (x0 + 6, 0), (x0 + 4, 36), (x0 - 4, 36)))   # Treppe
    for y in range(1, 36, 2):
        s.append(R("#B8A57D", x0 - 5.5 + y * 0.05, y, x0 + 5.5 - y * 0.05, y + 0.5))
    s.append(R(st, x0 - 9, 36, x0 + 9, 46))                            # Tempel oben
    s.append(R("#5A4A32", x0 - 2.5, 36, x0 + 2.5, 42))
    s.append(R(dark, x0 - 10, 46, x0 + 10, 48))
    s.append(water("#2FC3C9", 0, -10, 40, 600))                        # türkises Meer
    s.append(R("#F6E7C1", -600, -12, 600, -8))
    s += palm(60, 24, -8) + palm(74, 20, -8, -3) + palm(110, 26, -8)
    return s


# --------------------------------------------------------------------------
# Ziele
# --------------------------------------------------------------------------

HOME = {"code": "BER", "name": "Berlin", "country": "Deutschland", "lat": 52.36, "lon": 13.50,
        "hello": "Hallo!", "fact": "Der Fernsehturm ist mit 368 Metern das höchste Bauwerk Deutschlands.",
        "sky": ["#5DA9E9", "#BFE0F7"], "ground": "#7FB069", "far": "#9CC17F", "scene": berlin()}

DESTINATIONS = [
    # Code, Stadt, Land, Breite, Länge, Flugzeit (Std.), Farbe, Gruß, Wissenswertes, Himmel, Boden, Hintergrund, Szene
    ("PMI", "Palma de Mallorca", "Spanien", 39.55, 2.73, 2.6, "#E8892B", "¡Hola!",
     "Mallorca ist eine Insel im Mittelmeer. Die Kathedrale La Seu steht direkt am Meer.",
     ["#3C9BE8", "#B8E1FA"], "#C9B77C", "#E3D6A5", mallorca()),
    ("HER", "Kreta", "Griechenland", 35.34, 25.18, 3.0, "#0D5EAF", "Jassas!",
     "Kreta ist die größte Insel Griechenlands. Im Palast von Knossos wohnte der Sage nach König Minos.",
     ["#3A98E6", "#C0E2F8"], "#B9AE7A", "#D7CDA0", crete()),
    ("BCN", "Barcelona", "Spanien", 41.30, 2.08, 2.5, "#A50044", "¡Hola!",
     "An der Kirche Sagrada Família wird seit über 140 Jahren gebaut.",
     ["#3F9AE4", "#C2E2F8"], "#B8B07A", "#D8CFA2", barcelona()),
    ("AMS", "Amsterdam", "Niederlande", 52.31, 4.76, 1.3, "#F36C21", "Hallo!",
     "In Amsterdam gibt es mehr Fahrräder als Menschen – und viele Grachten mit Brücken.",
     ["#7FAAD6", "#D6E6F3"], "#7FAE62", "#9CC27E", amsterdam()),
    ("KEF", "Reykjavík", "Island", 63.99, -22.62, 3.6, "#02529C", "Halló!",
     "Island hat Vulkane, heiße Quellen und Geysire, die Wasser hoch in die Luft spritzen.",
     ["#7C9DBA", "#D3E0EA"], "#6E7F64", "#8E9C82", reykjavik()),
    ("RVN", "Rovaniemi", "Finnland", 66.56, 25.83, 3.5, "#7A3E9D", "Hei!",
     "Am Polarkreis in Rovaniemi wohnt der Weihnachtsmann. Nachts leuchten Polarlichter am Himmel.",
     ["#0E1A3A", "#2C4A6E"], "#F2F6FA", "#E3ECF4", rovaniemi()),
    ("TFS", "Teneriffa", "Spanien", 28.04, -16.57, 5.0, "#F2A900", "¡Hola!",
     "Der Teide ist ein Vulkan und der höchste Berg Spaniens. Es gibt Strände mit schwarzem Sand.",
     ["#3D9BE6", "#C4E4F8"], "#A89A72", "#C6B98E", tenerife()),
    ("CDG", "Paris", "Frankreich", 49.01, 2.55, 1.75, "#2B4C9B", "Bonjour!",
     "Der Eiffelturm ist 330 Meter hoch und aus Eisen gebaut.",
     ["#6AA6DD", "#D2E6F5"], "#86B46C", "#A9C98F", paris()),
    ("LHR", "London", "Großbritannien", 51.47, -0.45, 1.9, "#C8102E", "Hello!",
     "Im Turm von Big Ben hängt eine riesige Glocke. In London fahren rote Doppeldeckerbusse.",
     ["#8FA9C2", "#D9E3EC"], "#7EA866", "#A3BF8F", london()),
    ("FCO", "Rom", "Italien", 41.80, 12.25, 2.25, "#2E8B57", "Ciao!",
     "Im Kolosseum kämpften vor fast 2000 Jahren die Gladiatoren.",
     ["#4FA0E3", "#C8E4F7"], "#9DB46A", "#C3CB92", rome()),
    ("ATH", "Athen", "Griechenland", 37.94, 23.94, 2.8, "#1E6FB8", "Jassas!",
     "Der Parthenon-Tempel auf der Akropolis ist fast 2500 Jahre alt.",
     ["#3E96E6", "#C3E2F8"], "#B9AE7A", "#D4C99A", athens()),
    ("IST", "Istanbul", "Türkei", 41.26, 28.74, 3.0, "#D1343B", "Merhaba!",
     "Istanbul liegt auf zwei Kontinenten: in Europa und in Asien.",
     ["#5AA2DE", "#CFE5F5"], "#95AE6E", "#B9C994", istanbul()),
    ("CAI", "Kairo", "Ägypten", 30.12, 31.41, 3.9, "#C9962B", "Ahlan!",
     "Die Pyramiden von Gizeh sind über 4500 Jahre alt.",
     ["#6FB2E6", "#F3E3C0"], "#E3C27F", "#EBD39C", cairo()),
    ("DXB", "Dubai", "Vereinigte Arabische Emirate", 25.25, 55.36, 6.0, "#B8860B", "Marhaba!",
     "Der Burj Khalifa ist mit 828 Metern das höchste Gebäude der Welt.",
     ["#79B8E8", "#F2E2C4"], "#E0C38A", "#EAD3A2", dubai()),
    ("NBO", "Nairobi", "Kenia", -1.32, 36.93, 9.5, "#006600", "Jambo!",
     "In der Savanne von Kenia leben Giraffen, Elefanten und Zebras.",
     ["#5AA7E6", "#F1E3BF"], "#D2BC74", "#E0CC8C", nairobi()),
    ("DEL", "Delhi", "Indien", 28.56, 77.10, 8.0, "#FF9933", "Namaste!",
     "Das Taj Mahal ist ein Grabmal aus weißem Marmor. Es steht in Agra, ein paar Stunden von Delhi.",
     ["#8DB6DC", "#EFE3C8"], "#A9B46C", "#C9C98E", delhi()),
    ("BKK", "Bangkok", "Thailand", 13.69, 100.75, 11.0, "#2D2A4A", "Sawasdee!",
     "Der Tempel Wat Arun ist mit bunten Porzellanstücken verziert. Durch die Stadt fahren Tuk-Tuks.",
     ["#4FA2E3", "#CDE6F6"], "#8FB46A", "#B0C98A", bangkok()),
    ("SFO", "San Francisco", "USA", 37.62, -122.38, 12.5, "#C0362C", "Hello!",
     "Die Golden Gate Bridge ist rot angestrichen, damit man sie im Nebel gut sieht.",
     ["#6FA9DC", "#D8E7F3"], "#86AE6E", "#A7C48F", san_francisco()),
    ("CUN", "Cancún", "Mexiko", 21.04, -86.87, 11.5, "#00A19A", "¡Hola!",
     "In Mexiko haben die Maya riesige Stufenpyramiden gebaut. Das Meer ist hier türkisblau.",
     ["#3B9DE6", "#C2E6F8"], "#8DB46A", "#A9C886", cancun()),
    ("JFK", "New York", "USA", 40.64, -73.78, 9.0, "#3C3B6E", "Hello!",
     "Die Freiheitsstatue war ein Geschenk aus Frankreich. Ihre Fackel leuchtet über dem Hafen.",
     ["#4C95DB", "#C6E0F6"], "#7FA868", "#A4C08E", new_york()),
    ("HND", "Tokio", "Japan", 35.55, 139.78, 12.0, "#BC002D", "Konnichiwa!",
     "Der Fuji ist ein Vulkan und Japans höchster Berg. Im Frühling blühen die Kirschbäume.",
     ["#7DB3E6", "#E4EEF7"], "#8DB46E", "#AFCB93", tokyo()),
    ("PEK", "Peking", "China", 40.08, 116.58, 10.0, "#DE2910", "Nǐ hǎo!",
     "Die Chinesische Mauer ist viele tausend Kilometer lang.",
     ["#8BB4D9", "#E2EAF0"], "#8FAE6C", "#AFC690", beijing()),
    ("CPT", "Kapstadt", "Südafrika", -33.97, 18.60, 11.8, "#007A4D", "Molo!",
     "Der Tafelberg ist oben ganz flach. Am Strand bei Kapstadt leben Pinguine!",
     ["#3D93DB", "#BFE0F6"], "#9DB06C", "#BFC88E", cape_town()),
    ("SYD", "Sydney", "Australien", -33.95, 151.18, 21.5, "#00843D", "G'day!",
     "Das Opernhaus sieht aus wie Segel. Wenn bei uns Winter ist, ist in Australien Sommer.",
     ["#3A90DF", "#BDE0F7"], "#8FB46A", "#B0CB8C", sydney()),
    ("GIG", "Rio de Janeiro", "Brasilien", -22.81, -43.25, 12.5, "#009C3B", "Olá!",
     "Die Christusstatue steht auf einem Berg und breitet die Arme über der Stadt aus.",
     ["#3B98E2", "#C1E3F8"], "#86B062", "#A8C783", rio()),
]


# --------------------------------------------------------------------------
# Weltkarte
# --------------------------------------------------------------------------

def decode_topojson(topo):
    """Landflächen aus TopoJSON als Liste von Ringen [(lon, lat), …]."""
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        pts = []
        for dx, dy in arc:
            x += dx
            y += dy
            pts.append((x * sx + tx, y * sy + ty))
        arcs.append(pts)

    def ring(indices):
        out = []
        for i in indices:
            pts = arcs[i] if i >= 0 else arcs[~i][::-1]
            out.extend(pts[1:] if out else pts)
        return out

    rings = []
    for geom in topo["objects"]["land"]["geometries"]:
        polys = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
        for poly in polys:
            rings.append(ring(poly[0]))      # nur der Außenrand; Seen fallen weg
    return rings


def simplify(ring, step=0.6):
    """Punkte auf ein Raster runden und doppelte weglassen."""
    out = []
    for lon, lat in ring:
        p = (round(lon / step) * step, round(lat / step) * step)
        if not out or p != out[-1]:
            out.append(p)
    return out


def world_map():
    (raw,), source = npm_files("world-atlas", "land-110m.json", version="2.0.2")
    rings = []
    for ring in decode_topojson(json.loads(raw)):
        if any(abs(a[0] - b[0]) > 180 for a, b in zip(ring, ring[1:])):
            # Fläche über die Datumsgrenze (z. B. Russland): den Teil westlich von 180° nach Osten schieben,
            # sonst entstehen quer über die Karte laufende Streifen
            ring = [(lon + 360 if lon < -100 else lon, lat) for lon, lat in ring]
        r = simplify(ring)
        lons = [p[0] for p in r]
        lats = [p[1] for p in r]
        if len(r) < 4 or (max(lons) - min(lons)) * (max(lats) - min(lats)) < 2:
            continue
        if min(lats) < -60:          # Antarktis weglassen
            continue
        rings.append([round(v, 1) for p in r for v in p])
    return rings, source


NIGHT = {"RVN"}       # dort ist es bei der Ankunft Nacht (Polarlichter)

# Reihenfolge in der Liste: erst Europa, dann Afrika und Asien, dann Australien und Amerika
ORDER = ["PMI", "HER", "BCN", "TFS", "CDG", "AMS", "LHR", "FCO", "ATH", "IST", "KEF", "RVN", "CAI", "NBO", "CPT",
         "DXB", "DEL", "BKK", "PEK", "HND", "SYD", "JFK", "SFO", "CUN", "GIG"]


def main():
    land, source = world_map()
    flights = []
    for code, name, country, lat, lon, hours, color, hello, fact, sky, ground, far, scene in DESTINATIONS:
        flights.append({"code": code, "name": name, "country": country, "lat": lat, "lon": lon, "hours": hours,
                        "color": color, "hello": hello, "fact": fact, "sky": sky, "ground": ground, "far": far,
                        "scene": scene})
        if code in NIGHT:
            flights[-1]["night"] = True
    flights.sort(key=lambda f: ORDER.index(f["code"]))
    out = {"source": f"Weltkarte: Natural Earth (gemeinfrei) über {source}; Ziele und Zeichnungen von Hand",
           "home": HOME, "flights": flights, "land": land}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"geschrieben: {OUT} ({OUT.stat().st_size // 1024} KB, {len(flights)} Ziele, {len(land)} Landflächen)")


if __name__ == "__main__":
    main()
