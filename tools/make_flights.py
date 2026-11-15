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
        r = simplify(ring)
        lons = [p[0] for p in r]
        lats = [p[1] for p in r]
        if len(r) < 4 or (max(lons) - min(lons)) * (max(lats) - min(lats)) < 2:
            continue
        if min(lats) < -60:          # Antarktis weglassen
            continue
        rings.append([round(v, 1) for p in r for v in p])
    return rings, source


def main():
    land, source = world_map()
    flights = []
    for code, name, country, lat, lon, hours, color, hello, fact, sky, ground, far, scene in DESTINATIONS:
        flights.append({"code": code, "name": name, "country": country, "lat": lat, "lon": lon, "hours": hours,
                        "color": color, "hello": hello, "fact": fact, "sky": sky, "ground": ground, "far": far,
                        "scene": scene})
    out = {"source": f"Weltkarte: Natural Earth (gemeinfrei) über {source}; Ziele und Zeichnungen von Hand",
           "home": HOME, "flights": flights, "land": land}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"geschrieben: {OUT} ({OUT.stat().st_size // 1024} KB, {len(flights)} Ziele, {len(land)} Landflächen)")


if __name__ == "__main__":
    main()
