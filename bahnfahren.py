#!/usr/bin/env python3
"""Berlin fährt! – Ein einfaches Bahn-Spiel für Kinder.

Wähle ein Verkehrsmittel (S-Bahn, U-Bahn, Straßenbahn, Bus), dann eine Linie
und fahre die Stationen mit den Pfeiltasten ab.

Benötigt nur Python 3 mit Tkinter (auf macOS z. B. der Installer von
python.org). Die Fahrplandaten liegen offline in ``data/berlin_lines.json``.
"""

import json
import math
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import tkinter as tk
import tkinter.font as tkfont
from pathlib import Path

BASE = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
DATA_FILE = BASE / "data" / "berlin_lines.json"
SOUND_DIR = BASE / "sounds"

PARENT_KEY = "F10"                      # Elterntaste: Startbahnhof festlegen
DEFAULT_HOME = "S Lichterfelde Ost"     # Startbahnhof, solange nichts anderes gespeichert ist


def settings_file():
    """Einstellungen pro Benutzer, damit sie auch eine neue Programmversion überstehen."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "Berlin faehrt" / "settings.json"

BG = "#FFF8E7"
CARD = "#FFFFFF"
SHADOW = "#E9DFC7"
TEXT = "#2B2B2B"
MUTED = "#9A9488"
HIGHLIGHT = "#FFE58A"
PANEL = "#1E2A38"
HEADER_H = 96
ROW_H = 66

MODES = [
    # Schlüssel, Name, Farbe des Verkehrsmittels, Farbe des Fahrzeugs
    ("sbahn", "S-Bahn", "#008D4F", ("#B5121B", "#F2B233")),
    ("ubahn", "U-Bahn", "#115D91", ("#F7D117", "#3A3A3A")),
    ("tram", "Straßenbahn", "#CC0A22", ("#F7D117", "#FFFFFF")),
    ("bus", "Bus", "#A5027D", ("#F7D117", "#3A3A3A")),
    ("regio", "Regionalbahn", "#4B5563", ("#D7001D", "#FFFFFF")),
    ("ice", "ICE", "#EC0016", ("#F4F4F4", "#EC0016")),
]
MODE = {m[0]: m for m in MODES}

KEYS_NEXT = {"Down", "Right", "space"}
KEYS_PREV = {"Up", "Left"}
KEYS_OK = {"Return", "KP_Enter", "space"}
KEYS_BACK = {"Escape", "BackSpace"}


# --------------------------------------------------------------------------
# Zeichenhilfen
# --------------------------------------------------------------------------

def round_rect_points(x1, y1, x2, y2, r):
    r = max(0, min(r, (x2 - x1) / 2, (y2 - y1) / 2))
    pts = []
    for cx, cy, a0 in ((x2 - r, y1 + r, -90), (x2 - r, y2 - r, 0), (x1 + r, y2 - r, 90), (x1 + r, y1 + r, 180)):
        for i in range(7):
            a = math.radians(a0 + i * 15)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle_points(cx, cy, r, n=24):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def round_rect(c, x1, y1, x2, y2, r, **kw):
    pts = [v for p in round_rect_points(x1, y1, x2, y2, r) for v in p]
    return c.create_polygon(pts, **kw)


def text_color_for(bg):
    r, g, b = (int(bg[i:i + 2], 16) for i in (1, 3, 5))
    return "#000000" if (0.299 * r + 0.587 * g + 0.114 * b) > 170 else "#FFFFFF"


def readable(color):
    """Helle Farben (z. B. das Gelb der U4) auf weißem Grund abdunkeln, damit man sie gut erkennt."""
    return darker(color, 0.6) if text_color_for(color) == "#000000" else color


def darker(color, f=0.7):
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    return "#%02X%02X%02X" % (int(r * f), int(g * f), int(b * f))


def draw_vehicle(c, kind, cx, cy, length, flip=False):
    """Zeichnet ein Fahrzeug in Seitenansicht; Fahrtrichtung rechts (``flip``: links)."""
    body, accent = MODE[kind][3]
    mx = -1 if flip else 1

    def T(pts):
        out = []
        for x, y in pts:
            out += [cx + mx * x * length, cy + y * length]
        return out

    def poly(pts, **kw):
        c.create_polygon(T(pts), **kw)

    outline = darker(body, 0.55)
    lw = max(1, length / 90)
    h = {"bus": 0.34, "regio": 0.40}.get(kind, 0.30)
    top, bottom = -h / 2, h / 2 - 0.04
    wheel_r = 0.045 if kind != "bus" else 0.06

    # Stromabnehmer der Straßenbahn
    if kind == "tram":
        c.create_line(T([(-0.05, top), (0.05, top - 0.09), (-0.03, top - 0.12), (0.12, top - 0.12)]),
                      fill="#555555", width=max(1, length / 60))
    # Räder
    wheels = (-0.32, -0.22, 0.22, 0.32) if kind != "bus" else (-0.3, 0.3)
    for wx in wheels:
        poly(circle_points(wx, bottom, wheel_r, 12), fill="#333333", outline="")
    # Wagenkasten (der ICE hat vorne eine spitze Nase)
    if kind == "ice":
        poly([(-0.46, top), (0.2, top), (0.38, top + 0.04), (0.5, bottom - 0.07), (0.5, bottom - 0.02),
              (0.47, bottom), (-0.46, bottom), (-0.5, bottom - 0.04), (-0.5, top + 0.04)],
             fill=body, outline="#9AA0A6", width=lw)
    else:
        poly(round_rect_points(-0.5, top, 0.5, bottom, 0.05 if kind == "bus" else 0.09),
             fill=body, outline=outline, width=lw)
    # Zierstreifen
    if kind == "sbahn":
        poly([(-0.49, top + 0.005), (0.47, top + 0.005), (0.49, top + 0.06), (-0.49, top + 0.06)], fill=accent, outline="")
    else:
        poly([(-0.49, bottom - 0.05), (0.49, bottom - 0.05), (0.48, bottom - 0.02), (-0.48, bottom - 0.02)],
             fill=accent, outline="")
    # Fenster (der Regionalzug ist ein Doppelstockwagen: zwei Fensterreihen)
    win = "#CFE8FF"
    wy1, wy2 = top + 0.07, top + 0.07 + (0.10 if kind != "bus" else 0.12)
    xs = [-0.42, -0.27, -0.12, 0.03, 0.18] if kind != "bus" else [-0.44, -0.29, -0.14, 0.01, 0.16]
    if kind == "ice":
        xs = [-0.44, -0.3, -0.16, 0.06]
    rows = [(wy1, wy2)]
    if kind == "regio":
        wy1, wy2 = top + 0.05, top + 0.13
        rows = [(wy1, wy2), (top + 0.18, top + 0.26)]
    for ry1, ry2 in rows:
        for wx in xs:
            poly(round_rect_points(wx, ry1, wx + 0.11, ry2, 0.015), fill=win, outline=outline, width=lw / 2)
    # Frontscheibe
    if kind == "ice":
        poly([(0.26, wy1), (0.36, wy1 + 0.01), (0.44, wy2 + 0.01), (0.3, wy2 + 0.01)], fill="#2B3440", outline="")
    else:
        poly(round_rect_points(0.33, wy1, 0.47, wy2 + 0.03, 0.03), fill=win, outline=outline, width=lw / 2)
    # Tür
    door = (-0.06, 0.04) if kind != "bus" else (0.29, 0.36)
    poly([(door[0], wy1), (door[1], wy1), (door[1], bottom - 0.055), (door[0], bottom - 0.055)],
         fill=darker(body, 0.85), outline="#9AA0A6" if kind == "ice" else outline, width=lw / 2)
    # Scheinwerfer
    poly(circle_points(0.47, bottom - 0.07, 0.018, 10), fill="#FFF6B0", outline="")


def draw_mode_sign(c, app, kind, cx, cy, size):
    """Das bekannte Berliner Zeichen: grünes S, blaues U, Schilder für Tram und Bus."""
    color = MODE[kind][2]
    r = size / 2
    if kind == "sbahn":
        c.create_oval(cx - r, cy - r, cx + r, cy + r, fill=color, outline="")
        c.create_text(cx, cy, text="S", fill="white", font=app.font(size / app.s * 0.62, "bold"))
    elif kind == "ubahn":
        round_rect(c, cx - r, cy - r, cx + r, cy + r, size * 0.08, fill=color, outline="")
        c.create_text(cx, cy, text="U", fill="white", font=app.font(size / app.s * 0.62, "bold"))
    elif kind == "ice":
        round_rect(c, cx - r, cy - r, cx + r, cy + r, size * 0.22, fill=color, outline="")
        c.create_text(cx, cy, text="ICE", fill="white", font=app.font(size / app.s * 0.36, "bold"))
    elif kind == "regio":
        # wie die roten Zugschilder der Bahn: „RE“ in Rot auf Weiß
        round_rect(c, cx - r, cy - r, cx + r, cy + r, size * 0.22, fill=color, outline="")
        round_rect(c, cx - r * 0.8, cy - r * 0.55, cx + r * 0.8, cy + r * 0.55, size * 0.1, fill="white", outline="")
        c.create_text(cx, cy, text="RE", fill="#D7001D", font=app.font(size / app.s * 0.42, "bold"))
    else:
        round_rect(c, cx - r, cy - r, cx + r, cy + r, size * 0.22, fill=color, outline="")
        text = "Tram" if kind == "tram" else "Bus"
        c.create_text(cx, cy, text=text, fill="white", font=app.font(size / app.s * (0.3 if kind == "tram" else 0.36), "bold"))


def draw_badge(c, x, y, name, color, kind, h, font, border=0):
    """Linienschild wie an der Haltestelle. Gibt die Breite zurück."""
    w = max(h * 1.6, font.measure(name) + h * 0.6)
    r = {"sbahn": h / 2, "tram": h / 2, "bus": h * 0.3}.get(kind, h * 0.12)
    if border:
        round_rect(c, x - border, y - h / 2 - border, x + w + border, y + h / 2 + border, r + border,
                   fill="white", outline="")
    if kind == "regio":
        # Regionalzüge: rote Schrift auf Weiß mit rotem Rand, wie an den Bahnhöfen
        round_rect(c, x, y - h / 2, x + w, y + h / 2, r, fill="white", outline=color, width=max(1, h * 0.08))
        c.create_text(x + w / 2, y, text=name, fill=color, font=font)
        return w
    round_rect(c, x, y - h / 2, x + w, y + h / 2, r, fill=color, outline="")
    c.create_text(x + w / 2, y, text=name, fill=text_color_for(color), font=font)
    return w


def fit_text(font, text, width):
    if font.measure(text) <= width:
        return text
    while text and font.measure(text + "…") > width:
        text = text[:-1]
    return text + "…"


def wrap_text(font, text, width, max_lines=3):
    words, lines, cur = text.split(), [], ""
    for word in words:
        test = (cur + " " + word).strip()
        if font.measure(test) <= width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines - 1] + [fit_text(font, " ".join(lines[max_lines - 1:]), width)]
    return [fit_text(font, line, width) for line in lines]


# --------------------------------------------------------------------------
# Töne und Ansagen
# --------------------------------------------------------------------------

ABBREVIATIONS = [
    (r"str\.", "straße"), (r"Str\.", "Straße"), (r"\bPl\.", "Platz"), (r"\bBhf\.?", "Bahnhof"),
    (r"\bHbf\.?", "Hauptbahnhof"), (r"\bAlt-", "Alt "), (r"\bS\+U\s+", ""), (r"^[SU]\s+", ""),
    (r"/", ", "),
]


def spoken_name(name):
    """Macht aus "S+U Hermannstr." etwas, das die Sprachausgabe gut vorlesen kann: "Hermannstraße"."""
    for pattern, repl in ABBREVIATIONS:
        name = re.sub(pattern, repl, name)
    return name.strip()


def spoken_line(name):
    """ "S85" -> "S 85", damit die Nummer als Zahl gesprochen wird."""
    name = name.replace("ICE", "I-C-E")
    return re.sub(r"^([A-Z]+)(\d)", r"\1 \2", name)


class SoundPlayer:
    """Spielt WAV-Dateien ohne Zusatzpakete ab (afplay / winsound / paplay / aplay)."""

    def __init__(self):
        self.proc = None
        self.command = None
        if sys.platform == "darwin":
            self.command = ["afplay"]
        elif sys.platform != "win32":
            for cmd in (["paplay"], ["aplay", "-q"], ["pw-play"]):
                if shutil.which(cmd[0]):
                    self.command = cmd
                    break

    def play(self, path, speech=None):
        """Spielt ``path``; auf dem Mac wird ``speech`` vorher gesprochen (falls deutsche Stimme vorhanden)."""
        self.stop()
        if not path.exists():
            return
        if sys.platform == "win32":
            import winsound
            winsound.PlaySound(str(path), winsound.SND_FILENAME | winsound.SND_ASYNC)
            return
        if not self.command:
            return
        args = self.command + [str(path)]
        if speech and sys.platform == "darwin" and shutil.which("say"):
            # erst die Ansage, dann der Warnton – als eigene Prozessgruppe, damit "stop" beides beendet
            args = ["/bin/sh", "-c", 'say -v Anna "$1" 2>/dev/null; exec afplay "$0"', str(path), speech]
        try:
            self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                         start_new_session=True)
        except OSError:
            self.proc = None

    def speak(self, text):
        """Liest ``text`` mit der deutschen Systemstimme vor (macOS, Windows, Linux mit espeak)."""
        self.stop()
        env = None
        if sys.platform == "darwin":
            # Stimme "Anna" ist Deutsch; fehlt sie, nimmt "say" die Standardstimme
            args = ["/bin/sh", "-c", 'say -v Anna "$0" 2>/dev/null || say "$0"', text]
        elif sys.platform == "win32":
            env = dict(os.environ, ANSAGE=text)
            args = ["powershell", "-NoProfile", "-Command",
                    "Add-Type -AssemblyName System.Speech; "
                    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                    "$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'de*' } "
                    "| Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }; "
                    "$s.Speak($env:ANSAGE)"]
        else:
            for cmd in (["espeak-ng", "-v", "de"], ["espeak", "-v", "de"], ["spd-say", "-w", "-l", "de"]):
                if shutil.which(cmd[0]):
                    args = cmd + [text]
                    break
            else:
                return
        try:
            self.proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env,
                                         start_new_session=sys.platform != "win32")
        except OSError:
            self.proc = None

    def stop(self):
        if sys.platform == "win32" and self.proc and self.proc.poll() is None:
            self.proc.terminate()
            self.proc = None
        if self.proc and self.proc.poll() is None:
            try:
                os.killpg(self.proc.pid, signal.SIGTERM)
            except OSError:
                pass
        self.proc = None


# --------------------------------------------------------------------------
# Umsteigen
# --------------------------------------------------------------------------

MODE_ORDER = ["sbahn", "ubahn", "regio", "ice", "tram", "bus"]     # Reihenfolge beim Umsteigen
# Bei „Umsteigen getrennt“ sieht man nur Umstiege innerhalb der eigenen Gruppe
MODE_GROUPS = [("sbahn", "ubahn", "regio", "ice"), ("tram", "bus")]
NEAR_M = 200          # Haltestellen in diesem Umkreis gehören zusammen
SAME_NAME_M = 400     # gleichnamige Stationen (z. B. "S+U" und "U Alexanderplatz") auch etwas weiter


def base_name(name):
    """ "S+U Alexanderplatz/Memhardstr." -> "Alexanderplatz" """
    return re.sub(r"^(S\+U|S|U)\s+", "", name).split("/")[0].strip().lower()


def distance_m(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[1] - b[1]) * math.cos(lat) * 111320, (a[0] - b[0]) * 110540)


class Transfers:
    """Findet alle Linien, in die man an einer Haltestelle umsteigen kann.

    Bus- und Tramhaltestellen haben oft eigene Nummern („S+U Alexanderplatz/Dircksenstr.“),
    deshalb zählen auch Haltestellen in der Nähe und gleichnamige Bahnhöfe dazu.
    """

    def __init__(self, data):
        self.data = data
        self.coords = data.get("coords", {})
        self.cache = {}
        # Station -> [(Verkehrsmittel, Linien-Nr., Richtung, Position)]
        self.served = {}
        for kind in MODE_ORDER:
            for li, line in enumerate(data["lines"][kind]):
                for d, stops in enumerate(line["directions"]):
                    for i, key in enumerate(stops):
                        self.served.setdefault(key, []).append((kind, li, d, i))

    def nearby(self, key):
        """Haltestellen, die zur selben Umsteigestelle gehören, mit Entfernung."""
        here = self.coords.get(key)
        if not here:
            return [(0.0, key)]
        name = base_name(self.data["stations"][key])
        result = []
        for other, pos in self.coords.items():
            d = distance_m(here, pos)
            if d <= NEAR_M or (d <= SAME_NAME_M and base_name(self.data["stations"][other]) == name):
                result.append((d, other))
        return result

    def options(self, key, exclude=None, kinds=None):
        """Umsteigemöglichkeiten an ``key`` (ohne die Linie ``exclude`` = (Verkehrsmittel, Nr.)).

        ``kinds``: nur diese Verkehrsmittel (None = alle).

        Pro Linie wird die nächste Haltestelle genommen und die Richtung, in der man von dort noch
        am längsten weiterfahren kann.
        """
        if key not in self.cache:
            best = {}
            for dist, other in self.nearby(key):
                for kind, li, d, i in self.served.get(other, []):
                    stops = self.data["lines"][kind][li]["directions"][d]
                    ahead = len(stops) - 1 - i
                    # nächste Haltestelle zuerst, dann die Richtung mit der längeren Fahrt
                    rank = (round(dist / 100), ahead == 0, -ahead, dist)
                    if (kind, li) not in best or rank < best[(kind, li)][0]:
                        best[(kind, li)] = (rank, d, i, other)
            opts = []
            for (kind, li), (_, d, i, other) in best.items():
                line = self.data["lines"][kind][li]
                opts.append({"kind": kind, "index": li, "name": line["name"], "color": line["color"],
                             "direction": d, "stop": i, "key": other})
            opts.sort(key=lambda o: (MODE_ORDER.index(o["kind"]), o["index"]))
            self.cache[key] = opts
        return [o for o in self.cache[key]
                if (o["kind"], o["index"]) != exclude and (kinds is None or o["kind"] in kinds)]


# --------------------------------------------------------------------------
# Netzplan (Minikarte)
# --------------------------------------------------------------------------

def clip_polyline(pts, x1, y1, x2, y2):
    """Schneidet eine Linie (Liste von (x, y)) auf ein Rechteck zu. Liefert sichtbare Teilstücke."""
    pieces, cur = [], []
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        # Liang-Barsky
        t0, t1, dx, dy = 0.0, 1.0, bx - ax, by - ay
        ok = True
        for p, q in ((-dx, ax - x1), (dx, x2 - ax), (-dy, ay - y1), (dy, y2 - ay)):
            if p == 0:
                if q < 0:
                    ok = False
                    break
            else:
                t = q / p
                if p < 0:
                    t0 = max(t0, t)
                else:
                    t1 = min(t1, t)
        if not ok or t0 > t1:
            if len(cur) >= 4:
                pieces.append(cur)
            cur = []
            continue
        sx, sy, ex, ey = ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy
        if cur and t0 == 0.0:
            cur += [ex, ey]
        else:
            if len(cur) >= 4:
                pieces.append(cur)
            cur = [sx, sy, ex, ey]
        if t1 < 1.0:
            pieces.append(cur)
            cur = []
    if len(cur) >= 4:
        pieces.append(cur)
    return pieces


def tint(color, f):
    """Mischt ``color`` mit Weiß (f = 0 → Farbe, f = 1 → weiß)."""
    r, g, b = (int(color[i:i + 2], 16) for i in (1, 3, 5))
    return "#%02X%02X%02X" % tuple(int(v + (255 - v) * f) for v in (r, g, b))


class NetworkMap:
    """Netzplan eines Verkehrsmittels, gezeichnet aus den Koordinaten der Haltestellen."""

    def __init__(self, data, kind):
        self.data = data
        self.kind = kind
        coords = data.get("coords", {})
        self.lines = []
        for line in data["lines"][kind]:
            pts = [coords[k] for k in line["directions"][0] if k in coords]
            if len(pts) >= 2:
                self.lines.append((line["name"], line["color"], pts))
        # Ringbahn als Orientierung („innerhalb/außerhalb des Rings“)
        self.ring = []
        if kind != "sbahn":
            for line in data["lines"]["sbahn"]:
                if line["name"] == "S41":
                    self.ring = [coords[k] for k in line["directions"][0] if k in coords]
        all_pts = [p for _, _, pts in self.lines for p in pts] or [[52.52, 13.40]]
        self.lat0 = sum(p[0] for p in all_pts) / len(all_pts)
        xs = [self._x(p) for p in all_pts]
        ys = [self._y(p) for p in all_pts]
        self.bounds = (min(xs), min(ys), max(xs), max(ys))
        self.cache = (None, None)   # (Schlüssel, fertig zugeschnittene Linien)

    def _x(self, p):
        return p[1] * math.cos(math.radians(self.lat0))

    def _y(self, p):
        return -p[0]

    def zoom_bounds(self, path):
        """Ausschnitt um die gefahrene Linie (für das riesige Busnetz), mindestens ca. 8 km breit."""
        xs = [self._x(p) for p in path]
        ys = [self._y(p) for p in path]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        half_w = max((max(xs) - min(xs)) * 0.7, 0.055)
        half_h = max((max(ys) - min(ys)) * 0.7, 0.035)
        return (cx - half_w, cy - half_h, cx + half_w, cy + half_h)

    def fit(self, x1, y1, x2, y2, bounds=None):
        """Rechnet Koordinaten in den Kasten um (seitenrichtig, mittig)."""
        bx1, by1, bx2, by2 = bounds or self.bounds
        scale = min((x2 - x1) / max(1e-9, bx2 - bx1), (y2 - y1) / max(1e-9, by2 - by1))
        ox = x1 + ((x2 - x1) - (bx2 - bx1) * scale) / 2
        oy = y1 + ((y2 - y1) - (by2 - by1) * scale) / 2
        return lambda p: (ox + (self._x(p) - bx1) * scale, oy + (self._y(p) - by1) * scale)

    def draw(self, c, x1, y1, x2, y2, s, line_name, path, pos, kind_label, font):
        """Zeichnet die Karte; ``path`` = Koordinaten der gefahrenen Richtung, ``pos`` = Position darauf."""
        round_rect(c, x1, y1, x2, y2, 16 * s, fill="#F6F1E4", outline="")
        pad = 14 * s
        many = len(self.lines) > 30
        # Beim Bus (riesiges Netz) und Regionalzug (bis an die Ostsee) wäre Berlin winzig: heranzoomen
        zoom = many or self.kind == "regio"
        bounds = self.zoom_bounds(path) if zoom and len(path) >= 2 else None
        P = self.fit(x1 + pad, y1 + pad + 16 * s, x2 - pad, y2 - pad, bounds)
        cx1, cy1, cx2, cy2 = x1 + 4 * s, y1 + 4 * s, x2 - 4 * s, y2 - 4 * s

        # Das Netz ändert sich beim Fahren nicht – nur einmal umrechnen und zuschneiden
        key = (x1, y1, x2, y2, s, line_name, len(path), path[0] if path else None)
        if self.cache[0] != key:
            items = []

            def polyline(pts, **kw):
                for piece in clip_polyline([P(p) for p in pts], cx1, cy1, cx2, cy2):
                    items.append((piece, kw))

            if len(self.ring) >= 2:
                polyline(self.ring, fill="#DDD5C2", width=max(2, 5 * s))
            for name, color, pts in self.lines:
                if name != line_name:
                    polyline(pts, fill=tint(color, 0.7 if many else 0.55), width=max(1, (1.5 if many else 2.5) * s))
            if len(path) >= 2:
                col = next((col for name, col, _ in self.lines if name == line_name), "#333333")
                polyline(path, fill=readable(col), width=max(3, 5 * s), capstyle="round", joinstyle="round")
            self.cache = (key, items)
        for piece, kw in self.cache[1]:
            c.create_line(piece, **kw)
        col = readable(next((col for name, col, _ in self.lines if name == line_name), "#333333"))
        if len(path) >= 2:
            for end in (path[0], path[-1]):
                ex, ey = P(end)
                if not (cx1 <= ex <= cx2 and cy1 <= ey <= cy2):
                    continue
                r = 4 * s
                c.create_oval(ex - r, ey - r, ex + r, ey + r, fill="white", outline=col, width=max(1, 2 * s))
        # aktuelle Position, zwischen zwei Stationen weich verschoben
        if path:
            i = max(0, min(len(path) - 1, int(math.floor(pos))))
            j = min(len(path) - 1, i + 1)
            f = pos - i
            ax, ay = P(path[i])
            bx, by = P(path[j])
            px, py = ax + (bx - ax) * f, ay + (by - ay) * f
            r = 11 * s
            c.create_oval(px - r, py - r, px + r, py + r, fill="", outline="#E8483B", width=max(1, 2 * s))
            r = 6 * s
            c.create_oval(px - r, py - r, px + r, py + r, fill="#E8483B", outline="white", width=max(1, 2 * s))
        c.create_text(x1 + 12 * s, y1 + 14 * s, text="NETZPLAN " + kind_label.upper(), anchor="w", font=font,
                      fill="#8A8170")


# --------------------------------------------------------------------------
# Bildschirme
# --------------------------------------------------------------------------

class Screen:
    def __init__(self, app):
        self.app = app

    def draw(self, c, w, h):
        pass

    def key(self, keysym, char):
        pass

    def wheel(self, delta):
        pass

    def motion(self, x, y):
        pass

    def tick(self):
        """Ein Animationsschritt; True, solange weiter animiert werden soll."""
        return False


def checkbox(app, c, x, cy, label, on, callback):
    """Ankreuzfeld mit Beschriftung; ganze Zeile anklickbar."""
    s = app.s
    box = 22 * s
    round_rect(c, x, cy - box / 2, x + box, cy + box / 2, 5 * s, fill="#2F855A" if on else "white",
               outline="#2F855A" if on else MUTED, width=2 * s)
    if on:
        c.create_line(x + box * 0.22, cy, x + box * 0.43, cy + box * 0.22, x + box * 0.8, cy - box * 0.25,
                      fill="white", width=3 * s, capstyle="round", joinstyle="round")
    font = app.font(15)
    c.create_text(x + box + 10 * s, cy, text=label, anchor="w", font=font, fill=TEXT)
    app.hit(x - 6 * s, cy - box * 0.6, x + box + 16 * s + font.measure(label), cy + box * 0.6, callback)


def draw_house(c, cx, cy, size, color):
    """Kleines Haus-Symbol für den Startbahnhof."""
    h = size / 2
    c.create_polygon(cx - h, cy - h * 0.1, cx, cy - h, cx + h, cy - h * 0.1, fill=color, outline="")
    c.create_rectangle(cx - h * 0.7, cy - h * 0.15, cx + h * 0.7, cy + h * 0.8, fill=color, outline="")
    c.create_rectangle(cx - h * 0.18, cy + h * 0.25, cx + h * 0.18, cy + h * 0.8, fill="white", outline="")


class HomeScreen(Screen):
    START = len(MODES)      # Auswahl-Nummer des Start-Knopfs unter den Kacheln

    def __init__(self, app, selected=0):
        super().__init__(app)
        self.selected = selected
        self.last_tile = selected if selected < self.START else 0
        self.tiles = []
        self.start_box = None
        self.cols = 4

    def draw(self, c, w, h):
        app, s = self.app, self.app.s
        c.create_text(w / 2, 70 * s, text="Womit möchtest du fahren?", font=app.font(46, "bold"), fill=TEXT)
        c.create_text(w / 2, 125 * s, text="Wähle mit den Pfeiltasten und drücke Enter – oder klicke einfach!",
                      font=app.font(20), fill=MUTED)

        n = len(MODES)
        cols = n if w > h * 1.25 else math.ceil(n / 2)
        rows = math.ceil(n / cols)
        gap = 30 * s
        area_top = 165 * s
        area_bottom = h - 180 * s       # darunter: Start-Knopf und Ankreuzfelder
        tile_w = min((w - gap * (cols + 1)) / cols, (area_bottom - area_top - gap * (rows - 1)) / rows * 0.95)
        tile_h = tile_w * 1.05
        total_h = rows * tile_h + (rows - 1) * gap
        y0 = area_top + max(0, (area_bottom - area_top - total_h) / 2)

        self.tiles = []
        for i, (kind, label, color, _) in enumerate(MODES):
            col, row = i % cols, i // cols
            in_row = min(cols, n - row * cols)          # letzte Reihe mittig
            x1 = (w - (in_row * tile_w + (in_row - 1) * gap)) / 2 + col * (tile_w + gap)
            y1 = y0 + row * (tile_h + gap)
            x2, y2 = x1 + tile_w, y1 + tile_h
            sel = i == self.selected
            if sel:
                x1 -= 8 * s; y1 -= 8 * s; x2 += 8 * s; y2 += 8 * s
            round_rect(c, x1 + 6 * s, y1 + 8 * s, x2 + 6 * s, y2 + 8 * s, 30 * s, fill=SHADOW, outline="")
            round_rect(c, x1, y1, x2, y2, 30 * s, fill=CARD, outline=color if sel else "#EEE6D2",
                       width=10 * s if sel else 3 * s)
            tw = x2 - x1
            sign = tw * 0.42
            draw_mode_sign(c, app, kind, (x1 + x2) / 2, y1 + tw * 0.29, sign)
            draw_vehicle(c, kind, (x1 + x2) / 2, y1 + tw * 0.70, tw * 0.75)
            label_font = app.font(int(tw / s * 0.12), "bold")
            if label_font.measure(label) > tw * 0.9:
                label_font = app.font(int(tw / s * 0.12 * tw * 0.9 / label_font.measure(label)), "bold")
            c.create_text((x1 + x2) / 2, y2 - tw * 0.13, text=label, fill=color, font=label_font)
            self.tiles.append((x1, y1, x2, y2))
            app.hit(x1, y1, x2, y2, lambda i=i: self.open(i))
        self.cols = cols

        # Start-Knopf: direkt am Startbahnhof losfahren
        home = app.home_station()
        sel = self.selected == self.START
        bw, bh = min(w - 80 * s, 720 * s), 86 * s
        bx1, by1 = (w - bw) / 2, h - 165 * s
        if sel:
            bx1 -= 6 * s; by1 -= 6 * s; bw += 12 * s; bh += 12 * s
        bx2, by2 = bx1 + bw, by1 + bh
        green = "#2F855A"
        round_rect(c, bx1 + 5 * s, by1 + 7 * s, bx2 + 5 * s, by2 + 7 * s, 43 * s, fill=SHADOW, outline="")
        round_rect(c, bx1, by1, bx2, by2, 43 * s, fill=green if sel else CARD, outline=green,
                   width=(8 if sel else 3) * s)
        fg = "white" if sel else green
        draw_house(c, bx1 + 50 * s, (by1 + by2) / 2, 40 * s, fg)
        tx = bx1 + 90 * s
        c.create_text(tx, (by1 + by2) / 2 - 16 * s, text="Starte in", anchor="w", font=app.font(16, "bold"),
                      fill=fg)
        name_font = app.font(26, "bold")
        c.create_text(tx, (by1 + by2) / 2 + 12 * s, text=fit_text(name_font, app.data["stations"][home], bx2 - tx - 30 * s),
                      anchor="w", font=name_font, fill=TEXT if not sel else "white")
        self.start_box = (bx1, by1, bx2, by2)
        app.hit(bx1, by1, bx2, by2, self.start)

        # Ankreuzfelder für Eltern
        checkbox(app, c, 24 * s, h - 50 * s, "Umsteigen getrennt: S-Bahn, U-Bahn, Regio, ICE / Tram, Bus",
                 app.separate_modes(), lambda: self.toggle("separate_modes", app.separate_modes()))
        checkbox(app, c, 24 * s, h - 22 * s, "Zeige ICE-Umstiege", app.show_ice(),
                 lambda: self.toggle("show_ice", app.show_ice()))

        c.create_text(w - 24 * s, h - 22 * s, text="Fahrplandaten: VBB (CC BY 4.0)", anchor="e",
                      font=app.font(11), fill=MUTED)

    def toggle(self, setting, current):
        app = self.app
        app.settings[setting] = not current
        app.save_settings()
        app.redraw()

    def open(self, i):
        self.selected = i
        self.app.show(LinesScreen(self.app, MODES[i][0]))

    def start(self):
        """Am Startbahnhof losfahren – dieselbe Auswahl wie beim Umsteigen."""
        app = self.app
        home = app.home_station()
        options = app.transfers.options(home)
        back = lambda: app.show(HomeScreen(app, self.START))
        if len(options) == 1:
            board(app, options[0], f"Los geht's mit {options[0]['name']}!")
        elif options:
            app.show(ChangeScreen(app, f"Start in {app.data['stations'][home]}: Womit fährst du los?",
                                  options, back, "Los geht's mit {}!"))

    def reset_home(self):
        """Elterntaste im Hauptmenü: Startbahnhof auf Lichterfelde Ost zurücksetzen (mit Rückfrage)."""
        app = self.app
        if "home_station" not in app.settings:
            return

        def reset():
            app.settings.pop("home_station", None)
            app.save_settings()
            app.show(HomeScreen(app, self.START))

        app.show(ConfirmScreen(app, "Elternbereich: Startbahnhof zurücksetzen",
                               [f"Startbahnhof wieder auf „{DEFAULT_HOME}“ setzen?",
                                f"Bisher: {app.data['stations'][app.home_station()]}"],
                               "Ja, zurücksetzen", reset, lambda: app.show(self)))

    def key(self, k, char):
        n = len(MODES)
        if self.selected == self.START:
            if k == "Up":
                self.selected = self.last_tile
            elif k in KEYS_OK:
                self.start()
                return
            elif k == PARENT_KEY:
                self.reset_home()
                return
            else:
                return
        elif k == "Right":
            self.selected = (self.selected + 1) % n
        elif k == "Left":
            self.selected = (self.selected - 1) % n
        elif k == "Down":
            # aus der unteren Kachelreihe geht es zum Start-Knopf
            self.last_tile = self.selected
            below = self.selected + self.cols
            self.selected = below if below < n else self.START
        elif k == "Up":
            if self.selected - self.cols >= 0:
                self.selected -= self.cols
        elif k in KEYS_OK:
            self.open(self.selected)
            return
        elif k == PARENT_KEY:
            self.reset_home()
            return
        elif char and char in "123456"[:len(MODES)]:
            self.open(int(char) - 1)
            return
        if self.selected < self.START:
            self.last_tile = self.selected
        self.app.redraw()

    def motion(self, x, y):
        boxes = list(enumerate(self.tiles)) + ([(self.START, self.start_box)] if self.start_box else [])
        for i, (x1, y1, x2, y2) in boxes:
            if x1 <= x <= x2 and y1 <= y <= y2 and i != self.selected:
                self.selected = i
                if i < self.START:
                    self.last_tile = i
                self.app.redraw()


def header(app, c, w, color, back):
    """Farbige Kopfzeile mit Zurück-Knopf. Gibt Höhe und rechten Rand des Knopfs zurück."""
    s = app.s
    hh = HEADER_H * s
    c.create_rectangle(0, 0, w, hh, fill=color, outline="")
    bw, bh = 170 * s, 58 * s
    bx, by = 20 * s, (hh - bh) / 2
    round_rect(c, bx, by, bx + bw, by + bh, 29 * s, fill="white", outline="")
    c.create_text(bx + bw / 2, by + bh / 2, text="◀  Zurück", font=app.font(22, "bold"), fill=readable(color))
    app.hit(bx, by, bx + bw, by + bh, back)
    return hh, bx + bw


class LinesScreen(Screen):
    def __init__(self, app, kind, selected=0):
        super().__init__(app)
        self.kind = kind
        self.lines = app.data["lines"][kind]
        self.selected = min(selected, len(self.lines) - 1)
        self.scroll = 0.0
        self.scroll_target = None
        self.cards = []
        self.cols = 1
        self.typed = ""
        self.typed_at = 0.0
        self.follow = True

    def draw(self, c, w, h):
        app, s = self.app, self.app.s
        kind, label, color, _ = MODE[self.kind]
        hh = HEADER_H * s

        margin, gap = 30 * s, 22 * s
        card_w_min = 360 * s
        self.cols = cols = max(1, int((w - 2 * margin + gap) // (card_w_min + gap)))
        card_w = (w - 2 * margin - (cols - 1) * gap) / cols
        card_h = 130 * s
        rows = math.ceil(len(self.lines) / cols)
        top = hh + 26 * s
        view_h = h - top
        content_h = rows * (card_h + gap) + gap
        max_scroll = max(0, content_h - view_h)

        if self.follow:
            row = self.selected // cols
            y_sel = row * (card_h + gap)
            if y_sel < self.scroll:
                self.scroll_to(y_sel)
            elif y_sel + card_h > self.scroll + view_h - gap:
                self.scroll_to(y_sel + card_h - view_h + gap * 2)
            self.follow = False
        if self.scroll_target is not None:
            self.scroll_target = max(0, min(max_scroll, self.scroll_target))
        self.scroll = max(0, min(max_scroll, self.scroll))

        badge_font = app.font(30, "bold")
        name_font = app.font(19, "bold")
        small_font = app.font(15)
        stations = app.data["stations"]
        self.cards = []
        for i, line in enumerate(self.lines):
            row, col = divmod(i, cols)
            x1 = margin + col * (card_w + gap)
            y1 = top + row * (card_h + gap) - self.scroll
            if y1 > h or y1 + card_h < top - card_h:
                continue
            x2, y2 = x1 + card_w, y1 + card_h
            sel = i == self.selected
            round_rect(c, x1 + 4 * s, y1 + 6 * s, x2 + 4 * s, y2 + 6 * s, 22 * s, fill=SHADOW, outline="")
            round_rect(c, x1, y1, x2, y2, 22 * s, fill=HIGHLIGHT if sel else CARD,
                       outline=color if sel else "#EEE6D2", width=7 * s if sel else 2 * s)
            bw = draw_badge(c, x1 + 22 * s, (y1 + y2) / 2, line["name"], line["color"], kind, 64 * s, badge_font)
            tx = x1 + 22 * s + bw + 22 * s
            tw = x2 - tx - 18 * s
            first, last = line["directions"][0][0], line["directions"][0][-1]
            c.create_text(tx, y1 + 40 * s, text=fit_text(name_font, stations[first], tw), anchor="w",
                          font=name_font, fill=TEXT)
            if first == last:
                c.create_text(tx, y1 + 90 * s, text="↻  Ringfahrt", anchor="w", font=name_font, fill=TEXT)
            else:
                c.create_text(tx, y1 + 65 * s, text="⇅", anchor="w", font=small_font, fill=MUTED)
                c.create_text(tx, y1 + 90 * s, text=fit_text(name_font, stations[last], tw), anchor="w",
                              font=name_font, fill=TEXT)
            self.cards.append((i, x1, max(y1, top), x2, y2))
            if y2 > top:
                app.hit(x1, max(y1, top), x2, y2, lambda i=i: self.open(i))

        # Kopfbereich zuletzt, damit er über den gescrollten Karten liegt
        c.create_rectangle(0, hh, w, top - 4 * s, fill=BG, outline="")
        hh, left = header(app, c, w, color, self.back)
        draw_mode_sign(c, app, kind, left + 60 * s, hh / 2, 62 * s)
        c.create_text(left + 105 * s, hh / 2, text=f"{label}: Welche Linie nimmst du?", anchor="w",
                      font=app.font(30, "bold"), fill="white")
        if max_scroll > 0:
            bar_h = max(40 * s, view_h * view_h / content_h)
            bar_y = top + (view_h - bar_h) * (self.scroll / max_scroll)
            round_rect(c, w - 12 * s, bar_y, w - 4 * s, bar_y + bar_h, 4 * s, fill="#D8CFB8", outline="")

    def scroll_to(self, y):
        self.scroll_target = y
        self.app.animate()

    def tick(self):
        if self.scroll_target is None:
            return False
        d = self.scroll_target - self.scroll
        if abs(d) < 1:
            self.scroll = self.scroll_target
            self.scroll_target = None
            return False
        self.scroll += d * 0.25
        return True

    def back(self):
        modes = [m[0] for m in MODES]
        self.app.show(HomeScreen(self.app, modes.index(self.kind)))

    def open(self, i):
        self.selected = i
        self.app.show(RideScreen(self.app, self.kind, i, self))

    def key(self, k, char):
        n = len(self.lines)
        if k == "Right":
            self.selected = min(n - 1, self.selected + 1)
        elif k == "Left":
            self.selected = max(0, self.selected - 1)
        elif k == "Down":
            self.selected = min(n - 1, self.selected + self.cols)
        elif k == "Up":
            self.selected = max(0, self.selected - self.cols)
        elif k in ("Next",):
            self.selected = min(n - 1, self.selected + self.cols * 3)
        elif k in ("Prior",):
            self.selected = max(0, self.selected - self.cols * 3)
        elif k in KEYS_OK:
            self.open(self.selected)
            return
        elif k in KEYS_BACK:
            self.back()
            return
        elif char and char.isalnum():
            # Liniennummer eintippen springt direkt zur Linie (z. B. "100")
            now = time.monotonic()
            self.typed = (self.typed if now - self.typed_at < 1.5 else "") + char.upper()
            self.typed_at = now
            # erst der volle Name („100“, „RE1“), sonst nur die Nummer („10“ findet „ICE 10“)
            names = [line["name"].upper().replace(" ", "") for line in self.lines]
            for candidates in (names, [re.sub(r"^[A-Z]+", "", n) for n in names]):
                hit = next((i for i, n in enumerate(candidates) if n.startswith(self.typed)), None)
                if hit is not None:
                    self.selected = hit
                    break
        else:
            return
        self.follow = True
        self.app.redraw()

    def wheel(self, delta):
        self.scroll_target = (self.scroll_target if self.scroll_target is not None else self.scroll) - delta
        self.app.animate()

    def motion(self, x, y):
        for i, x1, y1, x2, y2 in self.cards:
            if x1 <= x <= x2 and y1 <= y <= y2 and i != self.selected:
                self.selected = i
                self.app.redraw()


def depot_info(kind):
    """(Name, Taste, „wohin“) – Bus und Tram fahren auf den Betriebshof, Bahnen aufs Abstellgleis."""
    if kind in ("bus", "tram"):
        return "Betriebshof", "B", "auf den Betriebshof"
    return "Abstellgleis", "A", "aufs Abstellgleis"


class RideScreen(Screen):
    def __init__(self, app, kind, line_index, lines_screen):
        super().__init__(app)
        self.kind = kind
        self.line = app.data["lines"][kind][line_index]
        self.lines_screen = lines_screen
        self.direction = 0
        self.index = 0
        self.pos = 0.0          # animierte Position des Fahrzeugs
        self.scroll = None
        self.backwards = False  # Fahrzeug schaut nach links, wenn man zurückfährt
        self.message = ("Einsteigen, bitte!", time.monotonic() + 2.0)
        self.line_index = line_index
        self.last_wheel = 0.0
        self.v = 0.0            # Tempo in der Cockpit-Ansicht (Stationen pro Sekunde)
        self.last_tick = 0.0
        self.depot = False       # steht auf dem Betriebshof bzw. Abstellgleis hinter der Endstation
        self.full_line = self.line   # Taste E kürzt die Linie nur für diese Fahrt (self.line), nicht dauerhaft
        self.speed = 0.0        # 0…1 für den Tacho

    @property
    def stops(self):
        return self.line["directions"][self.direction]

    def transfer_options(self, i=None):
        key = self.stops[self.index if i is None else i]
        return self.app.transfers.options(key, exclude=(self.kind, self.line_index), kinds=self.app.transfer_kinds(self.kind))

    @property
    def cockpit(self):
        return self.app.cockpit

    def toggle_cockpit(self):
        self.app.cockpit = not self.app.cockpit
        self.scroll = None
        self.app.redraw()
        self.app.animate()

    def draw(self, c, w, h):
        if self.cockpit:
            draw_cockpit(self, c, w, h)
            return
        app, s = self.app, self.app.s
        st = self.app.data["stations"]
        line, kind, color = self.line, self.kind, self.line["color"]
        stops = self.stops
        hh = HEADER_H * s

        # --- Liste der Stationen (links) ---------------------------------
        panel_w = min(430 * s, w * 0.38)
        list_x2 = w - panel_w - 20 * s
        top = hh
        view_h = h - top
        row_h = ROW_H * s
        target_scroll = self.pos * row_h - (view_h / 2 - row_h / 2)
        if self.scroll is None:
            self.scroll = target_scroll
        veh_len = 150 * s
        veh_x = 34 * s + veh_len / 2
        track_x = veh_x + veh_len / 2 + 36 * s
        name_x = track_x + 48 * s

        def row_y(i):
            return top + i * row_h - self.scroll + row_h / 2

        depot_name, depot_key, _ = depot_info(kind)
        cur_y = row_y(self.target)
        round_rect(c, 24 * s, cur_y - row_h / 2 + 4 * s, list_x2, cur_y + row_h / 2 - 4 * s, 18 * s,
                   fill=HIGHLIGHT, outline="")

        # Gleis
        y_first, y_last = row_y(0), row_y(len(stops) - 1)
        tw = 16 * s
        if self.depot or self.pos < 0:
            # Betriebshof/Abstellgleis: grauer Abzweig hinter (bzw. beim Zurückkommen vor) der Endstation
            dr = len(stops) if self.depot else -1
            dy = row_y(dr)
            c.create_line(track_x, row_y(dr + (-1 if self.depot else 1)), track_x, dy, fill="#9A9488", width=tw * 0.7,
                          dash=(6, 4))
            r = 15 * s
            c.create_rectangle(track_x - r, dy - r, track_x + r, dy + r, fill="white", outline="#6B6560", width=5 * s)
            c.create_text(name_x, dy, text=f"{depot_name} ({st[stops[self.index]]})", anchor="w",
                          font=app.font(26 if self.depot else 22, "bold" if self.depot else "normal"),
                          fill=TEXT if self.depot else MUTED)
        c.create_line(track_x, max(top, y_first), track_x, min(h, y_last), fill=color, width=tw, capstyle="round")
        if 0 < self.pos:
            c.create_line(track_x, max(top, y_first), track_x, row_y(self.pos), fill=darker(color, 0.6), width=tw,
                          capstyle="round")

        name_font = app.font(22)
        cur_font = app.font(26, "bold")
        mini_font = app.font(13, "bold")
        for i, key in enumerate(stops):
            y = row_y(i)
            if y < top - row_h or y > h + row_h:
                continue
            end = i in (0, len(stops) - 1)
            r = (17 if end else 12) * s
            c.create_oval(track_x - r, y - r, track_x + r, y + r, fill="white", outline=darker(color, 0.8),
                          width=5 * s)
            current = i == self.index and not self.depot
            font = cur_font if current else name_font
            fill = TEXT if i >= self.index else MUTED
            # Der Name hat Vorrang; Linienschilder bekommen höchstens 45 % der Breite
            others = self.transfer_options(i)
            widths = [max(30 * 1.6 * s, mini_font.measure(o["name"]) + 30 * 0.6 * s) + 6 * s for o in others]
            row_w = list_x2 - name_x - 16 * s
            badge_space = min(sum(widths) + 14 * s, row_w * 0.45) if others else 0
            name = fit_text(font, st[key], max(80 * s, row_w - badge_space))
            c.create_text(name_x, y, text=name, anchor="w", font=font, fill=fill)
            x = name_x + font.measure(name) + 14 * s
            plus_w = mini_font.measure("+99") + 6 * s
            for n_shown, (o, bw_) in enumerate(zip(others, widths)):
                rest = len(others) - n_shown
                if x + bw_ + (plus_w if rest > 1 else 0) > list_x2 - 10 * s:
                    c.create_text(x, y, text=f"+{rest}", anchor="w", font=mini_font, fill=MUTED)
                    break
                x += draw_badge(c, x, y, o["name"], o["color"], o["kind"], 30 * s, mini_font) + 6 * s
            app.hit(24 * s, y - row_h / 2, list_x2, y + row_h / 2, lambda i=i: self.go_to(i))
            if current and others:
                # Klick auf die Linienschilder der aktuellen Station = umsteigen
                app.hit(name_x + font.measure(name), y - row_h / 2, list_x2, y + row_h / 2, self.change)

        # Fahrzeug
        draw_vehicle(c, kind, veh_x, row_y(self.pos) + 4 * s, veh_len, flip=self.backwards)

        # Kopfzeile zuletzt, damit die Liste darunter verschwindet
        hh, left = header(app, c, w, color, self.back)
        badge_font = app.font(34, "bold")
        bx = left + 30 * s
        bw = draw_badge(c, bx, hh / 2, line["name"], color, kind, 64 * s, badge_font, border=5 * s)
        dest = "Ringfahrt ↻" if stops[0] == stops[-1] else "nach " + st[stops[-1]]
        tf = app.font(28, "bold")
        c.create_text(bx + bw + 30 * s, hh / 2, text=fit_text(tf, dest, w - (bx + bw + 60 * s)), anchor="w",
                      font=tf, fill=text_color_for(color))

        # --- Infotafel (rechts) -----------------------------------------
        px1, px2 = w - panel_w, w - 24 * s
        py = top + 24 * s
        pw = px2 - px1 - 48 * s
        round_rect(c, px1 + 5 * s, py + 7 * s, px2 + 5 * s, h - 24 * s + 7 * s, 26 * s, fill=SHADOW, outline="")
        round_rect(c, px1, py, px2, h - 24 * s, 26 * s, fill=PANEL, outline="")
        ix = px1 + 24 * s
        label_font = app.font(14, "bold")
        big_font = app.font(26, "bold")
        mid_font = app.font(20, "bold")

        # Netzplan oben in der Tafel, mit dem aktuellen Standort
        map_h = min(pw * 0.68, (h - top) * 0.3)
        coords = app.data.get("coords", {})
        path = [coords[k] for k in stops if k in coords]
        app.network_map(kind).draw(c, ix - 8 * s, py + 16 * s, ix + pw + 8 * s, py + 16 * s + map_h, s,
                                   line["name"], path, self.pos, MODE[kind][1], app.font(11, "bold"))
        y = py + 16 * s + map_h + 24 * s

        c.create_text(ix, y, text="DU BIST HIER", anchor="w", font=label_font, fill="#F7D117")
        c.create_text(ix + pw, y, text=f"Station {self.index + 1} von {len(stops)}" if not self.depot else "Pause",
                      anchor="e", font=app.font(14), fill="#B8C4D0")
        y += 22 * s
        for ln in wrap_text(big_font, depot_name if self.depot else st[stops[self.index]], pw, 2):
            c.create_text(ix, y, text=ln, anchor="nw", font=big_font, fill="white")
            y += big_font.metrics("linespace")
        y += 14 * s
        last = self.index == len(stops) - 1
        if self.depot or last:
            title, info = ("RUNDE GESCHAFFT", "Einmal rund um die Stadt!") if self.ring \
                else ("ENDSTATION", "Bitte alle aussteigen!")
            if self.depot:
                title, info = "PAUSE", f"Zurück auf die Strecke: Taste {depot_key}"
            c.create_text(ix, y, text=title, anchor="w", font=label_font, fill="#F7D117")
            y += 22 * s
            for ln in wrap_text(mid_font, info, pw, 2):
                c.create_text(ix, y, text=ln, anchor="nw", font=mid_font, fill="#9FE3B0")
                y += mid_font.metrics("linespace")
        else:
            c.create_text(ix, y, text="NÄCHSTER HALT", anchor="w", font=label_font, fill="#F7D117")
            y += 22 * s
            for ln in wrap_text(mid_font, st[stops[self.index + 1]], pw, 2):
                c.create_text(ix, y, text=ln, anchor="nw", font=mid_font, fill="#CFE8FF")
                y += mid_font.metrics("linespace")
        y += 12 * s
        bar_w = px2 - px1 - 48 * s
        round_rect(c, ix, y, ix + bar_w, y + 14 * s, 7 * s, fill="#3A4A5C", outline="")
        frac = max(0.0, min(1.0, self.pos / max(1, len(stops) - 1)))
        if frac > 0:
            round_rect(c, ix, y, ix + max(14 * s, bar_w * frac), y + 14 * s, 7 * s, fill=color, outline="")

        # Knöpfe
        # (Beschriftung, Aktion, aktiv, Farbe, Schriftfarbe, Schriftgröße)
        buttons = [("▲", self.prev, self.index > 0 and not self.depot, "#F7D117", PANEL, 36),
                   ("▼", self.next, not last or self.ring, "#F7D117", PANEL, 36),
                   ("Türen", self.doors, True, "#E8483B", "white", 18),
                   ("Ansage", self.announce, True, "#3D8BD4", "white", 17),
                   (depot_key, self.toggle_depot, self.depot or self.at_terminus(), "#8E6BBF", "white", 30)]
        bgap = 12 * s
        bsize = min(84 * s, (pw - (len(buttons) - 1) * bgap) / len(buttons))
        by2 = h - 50 * s
        btn_y = by2 - bsize - 76 * s
        cx = (px1 + px2) / 2
        bx1 = cx - (len(buttons) * bsize + (len(buttons) - 1) * bgap) / 2
        for sym, cb, enabled, bg, fg, size in buttons:
            by1 = btn_y
            round_rect(c, bx1, by1, bx1 + bsize, by1 + bsize, 24 * s, fill=bg if enabled else "#3A4A5C", outline="")
            c.create_text(bx1 + bsize / 2, by1 + bsize / 2, text=sym, font=app.font(size, "bold"),
                          fill=fg if enabled else "#5A6A7C")
            if enabled:
                app.hit(bx1, by1, bx1 + bsize, by1 + bsize, cb)
            bx1 += bsize + bgap
        rbw, rbh = px2 - px1 - 48 * s, 56 * s
        rby = by2 - rbh
        round_rect(c, ix, rby, ix + rbw, rby + rbh, 28 * s, fill="#3A4A5C" if self.depot else "white", outline="")
        c.create_text(ix + rbw / 2, rby + rbh / 2, text="⇄  Andere Richtung", font=app.font(20, "bold"),
                      fill="#5A6A7C" if self.depot else PANEL)
        if not self.depot:
            app.hit(ix, rby, ix + rbw, rby + rbh, self.switch)

        # Durchsage als Leuchtanzeige zwischen Fortschritt und Knöpfen
        text, until = self.message
        if not (text and time.monotonic() < until):
            text = ""
        box_y1, box_y2 = y + 14 * s + 16 * s, btn_y - 14 * s
        if box_y2 - box_y1 >= 40 * s:
            round_rect(c, ix, box_y1, ix + pw, box_y2, 14 * s, fill="#11181F", outline="#3A4A5C", width=2 * s)
            mf = app.font(22 if box_y2 - box_y1 > 70 * s else 19, "bold")
            can_change = bool(self.transfer_options())
            if text:
                lines, font, fill = wrap_text(mf, text, pw - 24 * s, 2), mf, "#FFB000"
            elif self.depot:
                lines, font, fill = wrap_text(mf, f"Pause · Taste {depot_key}: zurück", pw - 24 * s, 2), mf, "#C8B6F0"
                app.hit(ix, box_y1, ix + pw, box_y2, self.toggle_depot)
            elif last and not self.ring:
                # an der Endstation: Betriebshof bzw. Abstellgleis anbieten
                lines, font, fill = wrap_text(mf, f"Taste {depot_key}: {depot_name}", pw - 24 * s, 2), mf, "#C8B6F0"
                app.hit(ix, box_y1, ix + pw, box_y2, self.toggle_depot)
            elif can_change:
                # Auffordern, wenn man hier umsteigen kann
                lines, font, fill = wrap_text(mf, "Umsteigen? Drücke U", pw - 24 * s, 2), mf, "#7FD4FF"
                app.hit(ix, box_y1, ix + pw, box_y2, self.change)
            else:
                font, fill = app.font(18), "#5A6A7C"
                lines = wrap_text(font, "↑ ↓ fahren · T Türen · V Ansage", pw - 24 * s, 2)
            lh = font.metrics("linespace")
            ty = (box_y1 + box_y2) / 2 - lh * (len(lines) - 1) / 2
            for ln in lines:
                c.create_text(cx, ty, text=ln, font=font, fill=fill)
                ty += lh
        elif text:
            # Sehr kleines Fenster: Durchsage über die Liste legen
            mf = app.font(26, "bold")
            mw = mf.measure(text) + 60 * s
            mx, my = (list_x2 + 20 * s) / 2, h - 60 * s
            round_rect(c, mx - mw / 2, my - 30 * s, mx + mw / 2, my + 30 * s, 30 * s, fill=PANEL, outline="")
            c.create_text(mx, my, text=text, font=mf, fill="#FFB000")

    def tick(self):
        moving = False
        d = self.target - self.pos
        if abs(d) > 0.003:
            if self.cockpit:
                # Im Führerstand gemächlich: anfahren, rollen, vor der Station bremsen – nach echter Zeit,
                # damit es auf langsamen Rechnern nicht langsamer fährt
                now = time.monotonic()
                dt = min(0.1, max(0.001, now - self.last_tick))
                self.last_tick = now
                target = min(COCKPIT_SPEED, max(0.12, abs(d) * 2.4))
                self.v += (target - self.v) * min(1.0, dt * 4.0)
                step = self.v * dt
                self.speed = self.v / COCKPIT_SPEED
            else:
                step = max(0.04, abs(d) * 0.18)
            self.pos += math.copysign(min(step, abs(d)), d)
            moving = True
        else:
            self.pos = float(self.target)
            self.v = 0.0
            if self.speed > 0.01:
                self.speed *= 0.6
                moving = True
            else:
                self.speed = 0.0
        h = self.app.canvas.winfo_height()
        row_h = ROW_H * self.app.s
        view_h = h - HEADER_H * self.app.s
        target = self.pos * row_h - (view_h / 2 - row_h / 2)
        if self.scroll is not None and abs(target - self.scroll) > 0.5:
            self.scroll += (target - self.scroll) * 0.3
            moving = True
        return moving or time.monotonic() < self.message[1]

    def say(self, text, seconds=1.6):
        self.message = (text, time.monotonic() + seconds)

    def go_to(self, i):
        if self.depot:
            return self.depot_hint()
        if i == self.index:
            return
        self.backwards = i < self.index
        if self.index == 0 and i > 0:
            self.say("Zurückbleiben, bitte!")
        self.index = i
        self.arrived()
        self.app.animate()

    @property
    def ring(self):
        return self.stops[0] == self.stops[-1]

    @property
    def levels(self):
        """Höhenlage jedes Bahnhofs in der aktuellen Richtung (für die Cockpit-Ansicht)."""
        key = (self.direction, len(self.stops))
        if getattr(self, "_levels_key", None) != key:
            names = [self.app.data["stations"][k] for k in self.stops]
            self._levels = [station_level(self.kind, self.line["name"], names, i) for i in range(len(names))]
            self._levels_key = key
        return self._levels

    @property
    def target(self):
        """Wohin das Fahrzeug fährt: die Station – oder eine Zeile weiter auf Betriebshof/Abstellgleis."""
        return self.index + (1 if self.depot else 0)

    def at_terminus(self):
        return not self.ring and self.index in (0, len(self.stops) - 1)

    def depot_hint(self):
        name, key, _ = depot_info(self.kind)
        self.say(f"Pause auf dem {name}. Zurück auf die Strecke: Taste {key}", 2.5)
        self.app.animate()

    def toggle_end(self):
        """Taste E: die Linie endet hier – oder fährt wieder bis zur echten Endstation (nur für diese Fahrt)."""
        if self.depot:
            return self.depot_hint()
        st = self.app.data["stations"]
        here = self.stops[self.index]
        if self.line is not self.full_line:
            # Kürzung aufheben: wieder die ganze Linie, in derselben Fahrtrichtung (gleicher nächster Halt)
            nxt = self.stops[self.index + 1] if self.index + 1 < len(self.stops) else None

            def same_way(stops):
                i = stops.index(here)
                return nxt is None and i < len(stops) - 1 or i + 1 < len(stops) and stops[i + 1] == nxt
            dirs = self.full_line["directions"]
            d = next((d for d, stops in enumerate(dirs) if here in stops and same_way(stops)),
                     next(d for d, stops in enumerate(dirs) if here in stops))
            self.line, self.direction = self.full_line, d
            self.index = self.stops.index(here)
            self.say("Die Linie fährt wieder bis " + st[self.stops[-1]], 3)
        elif self.index == 0:
            self.say("Hier beginnt die Linie – fahr erst ein Stück.", 2.5)
        elif self.index == len(self.stops) - 1 and not self.ring:
            self.say("Das ist schon die Endstation.", 2.5)
        else:
            short = self.stops[:self.index + 1]
            self.line = dict(self.full_line, directions=[short, short[::-1]])
            self.direction = 0
            self.say("Endstation! Die Linie endet heute hier.", 2.5)
        self.pos = float(self.index)
        self.backwards = False
        self.scroll = None
        self.app.animate()

    def toggle_depot(self, key=None):
        """Taste B/A: an der Endhaltestelle auf den Betriebshof bzw. aufs Abstellgleis – und wieder zurück."""
        name, wanted, where = depot_info(self.kind)
        if key and key.upper() != wanted:
            self.say("Bahnen fahren aufs Abstellgleis: Taste A" if wanted == "A"
                     else f"{MODE[self.kind][1]} fährt auf den Betriebshof: Taste B", 2.5)
        elif self.depot:
            # zurück auf die Strecke – gewendet, also in Gegenrichtung ab derselben Endhaltestelle
            here = self.stops[self.index]
            self.depot = False
            self.direction = 1 - self.direction
            stops = self.stops
            self.index = stops.index(here) if here in stops else 0
            self.pos = self.index - 1.0
            self.backwards = False
            self.scroll = None
            self.say("Zurück auf der Strecke – nach " + self.app.data["stations"][stops[-1]], 3)
        elif self.ring:
            self.say("Die Ringbahn hat keine Endhaltestelle.", 2.5)
        elif not self.at_terminus():
            self.say(f"{'Aufs' if wanted == 'A' else 'Auf den'} {name} geht es nur an der Endhaltestelle.", 2.5)
        else:
            if self.index == 0:
                # am Anfang der Linie: erst wenden, damit der Betriebshof „hinter“ der Endstation liegt
                here = self.stops[0]
                self.direction = 1 - self.direction
                self.index = self.stops.index(here) if here in self.stops else len(self.stops) - 1
                self.pos = float(self.index)
                self.scroll = None
            self.depot = True
            self.backwards = False
            self.say(f"Wir fahren {where}.", 2.5)
        self.app.animate()

    def arrived(self):
        if self.index == len(self.stops) - 1:
            self.say("Einmal rund um die Stadt!" if self.ring else "Endstation – bitte alle aussteigen!", 3)

    def next(self):
        if self.depot:
            return self.depot_hint()
        last = len(self.stops) - 1
        if self.index == last and self.ring:
            # Ringbahn: Start und Ziel sind derselbe Bahnhof, also einfach weiterfahren
            self.index = self.pos = 0
            self.scroll = None
        if self.index < last:
            self.say("Zurückbleiben, bitte!", 1.4)
            self.backwards = False
            self.index += 1
            self.arrived()
            self.app.animate()

    def prev(self):
        if self.depot:
            return self.depot_hint()
        if self.index == 0 and self.ring:
            self.index = self.pos = len(self.stops) - 1
            self.scroll = None
        if self.index > 0:
            self.backwards = True
            self.index -= 1
            self.say("")
            self.app.animate()

    def doors(self):
        speech = {"sbahn": "Zurückbleiben, bitte!", "ubahn": "Zurückbleiben, bitte!",
                  "regio": "Bitte einsteigen. Vorsicht bei der Abfahrt!",
                  "ice": "Bitte einsteigen. Vorsicht bei der Abfahrt!"}.get(self.kind)
        self.app.sound.play(SOUND_DIR / f"{self.kind}.wav", speech)
        # Beim Bus zischt die Druckluft, wenn die Türen aufgehen
        self.say("Pssscht – Türen auf!" if self.kind == "bus" else "Türen schließen!", 2.5)
        self.app.animate()

    def announce(self):
        """Sagt die aktuelle Station an, wie im Fahrzeug."""
        if self.depot:
            name = depot_info(self.kind)[0]
            self.app.sound.speak(f"{name}. Bitte nicht einsteigen.")
            self.say(f"Hier ist: {name}", 3)
            return self.app.animate()
        stops = self.stops
        key = stops[self.index]
        name = self.app.data["stations"][key]
        text = spoken_name(name) + "."
        others = self.transfer_options()
        if others:
            prefix = {"tram": "Tram ", "bus": "Bus "}
            names = [prefix.get(o["kind"], "") + spoken_line(o["name"]) for o in others[:8]]
            text += " Umsteigen zu " + ", ".join(names) + (" und weiteren Linien." if len(others) > 8 else ".")
        if self.index == len(stops) - 1 and not self.ring:
            text += " Endstation. Bitte alle aussteigen."
        self.app.sound.speak(text)
        self.say("Hier ist: " + name, 3)
        self.app.animate()

    def change(self):
        """Taste U: umsteigen. Bei mehreren Möglichkeiten erscheint eine Auswahl."""
        if self.depot:
            return self.depot_hint()
        options = self.transfer_options()
        if not options:
            self.say("Hier kann man nicht umsteigen.", 2)
        elif len(options) == 1:
            board(self.app, options[0], f"Umgestiegen in {options[0]['name']}!")
            return
        else:
            name = self.app.data["stations"][self.stops[self.index]]
            self.app.show(ChangeScreen(self.app, "Umsteigen an " + name, options, lambda: self.app.show(self)))
            return
        self.app.animate()

    def switch(self):
        if self.depot:
            return self.depot_hint()
        here = self.stops[self.index]
        self.direction = 1 - self.direction
        stops = self.stops
        self.index = stops.index(here) if here in stops else 0
        if stops[0] == stops[-1] and self.index == len(stops) - 1:
            self.index = 0
        self.pos = float(self.index)
        self.backwards = False
        self.scroll = None
        self.say("Richtung gewechselt!")
        self.app.animate()

    def back(self):
        self.app.sound.stop()
        self.app.show(self.lines_screen)

    def key(self, k, char):
        if k in KEYS_NEXT:
            self.next()
        elif k in KEYS_PREV:
            self.prev()
        elif k in KEYS_BACK:
            self.back()
        elif k in ("Home",):
            self.go_to(0)
        elif k in ("End",):
            self.go_to(len(self.stops) - 1)
        elif char in ("r", "R"):
            self.switch()
        elif char in ("t", "T"):
            self.doors()
        elif char in ("v", "V"):
            self.announce()
        elif char in ("u", "U"):
            self.change()
        elif char in ("e", "E"):
            self.toggle_end()
        elif char in ("a", "A", "b", "B"):
            self.toggle_depot(char)
        elif char in ("f", "F"):
            self.toggle_cockpit()
        elif k == PARENT_KEY:
            self.set_home()

    def set_home(self):
        """Elterntaste: aktuelle Haltestelle als Startbahnhof fürs Hauptmenü speichern (mit Rückfrage)."""
        app = self.app
        key = self.stops[self.index]
        name, old = app.data["stations"][key], app.data["stations"][app.home_station()]

        def save():
            app.settings["home_station"] = key
            app.save_settings()
            self.say("Neuer Startbahnhof: " + name, 3)
            app.show(self)
            app.animate()

        app.show(ConfirmScreen(app, "Elternbereich: Startbahnhof ändern",
                               [f"Soll „{name}“ der neue Startbahnhof im Hauptmenü werden?",
                                f"Bisher: {old}"],
                               "Ja, speichern", save, lambda: app.show(self)))

    def wheel(self, delta):
        # Trackpads senden viele Ereignisse – höchstens eine Station je 0,25 s
        now = time.monotonic()
        if now - self.last_wheel < 0.25:
            return
        self.last_wheel = now
        if delta < 0:
            self.next()
        else:
            self.prev()


# --------------------------------------------------------------------------
# Cockpit-Ansicht (Taste F): Blick nach vorn wie aus dem Führerstand
# --------------------------------------------------------------------------

SEG = 60.0              # so viele Meter liegen in der Szene zwischen zwei Stationen
CAM_H = 2.4             # Augenhöhe des Fahrers über den Schienen bzw. der Straße
Z_NEAR, Z_FAR = 1.2, 140.0
VMAX = {"sbahn": 100, "ubahn": 70, "tram": 60, "bus": 50, "regio": 160, "ice": 300}   # km/h am Tacho
COCKPIT_SPEED = 0.7     # höchstes Tempo in Stationen pro Sekunde – ca. 1,5 s von Station zu Station
LED = "#FFA31A"         # Farbe der Leuchtschrift


def rnd(i, salt=0):
    """Gleichbleibende Zufallszahl 0…1 für Bäume, Häuser usw. (gleiche Stelle = gleiches Objekt)."""
    x = math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
    return x - math.floor(x)


# --- Höhenlage der Bahnhöfe: Tunnel, ebenerdig oder auf dem Viadukt ---------
# Offene Daten dazu gibt es nicht; die Tabelle beschreibt die bekannten Berliner Strecken.

# U-Bahn: alles unterirdisch, außer diesen Bahnhöfen (je Linie, denn z. B. am Kottbusser Tor
# hält die U1 oben auf dem Viadukt, die U8 aber unten im Tunnel)
U_ELEVATED = {
    "U1": {"S+U Warschauer Str.", "U Schlesisches Tor", "U Görlitzer Bahnhof", "U Kottbusser Tor",
           "U Prinzenstr.", "U Hallesches Tor", "U Möckernbrücke", "U Gleisdreieck"},
    "U2": {"S+U Schönhauser Allee", "U Eberswalder Str.", "U Gleisdreieck", "U Bülowstr.", "U Nollendorfplatz"},
    "U3": {"S+U Warschauer Str.", "U Schlesisches Tor", "U Görlitzer Bahnhof", "U Kottbusser Tor",
           "U Prinzenstr.", "U Hallesches Tor", "U Möckernbrücke", "U Gleisdreieck"},
}
U_GROUND = {
    "U2": {"U Olympia-Stadion", "U Ruhleben"},
    "U3": {"U Krumme Lanke", "U Onkel Toms Hütte", "U Oskar-Helene-Heim", "U Freie Universität (Thielplatz)",
           "U Dahlem-Dorf", "U Podbielskiallee"},
    "U5": {"U Hönow", "U Louis-Lewin-Str.", "U Hellersdorf", "U Cottbusser Platz", "U Kienberg (Gärten der Welt)",
           "U Kaulsdorf-Nord", "S+U Wuhletal", "U Elsterwerdaer Platz", "U Biesdorf-Süd"},
    "U6": {"U Scharnweberstr.", "U Otisstr.", "U Holzhauser Str."},
}
# S-Bahn und Fernbahn: Nord-Süd-Tunnel und Flughafen unter der Erde, Stadtbahn auf dem Viadukt
RAIL_TUNNEL = {"S Nordbahnhof", "S Oranienburger Str.", "S+U Brandenburger Tor", "S+U Potsdamer Platz",
               "S Anhalter Bahnhof", "Flughafen BER"}
STADTBAHN = {"S Charlottenburg", "S Savignyplatz", "S+U Zoologischer Garten", "S Tiergarten", "S Bellevue",
             "S+U Berlin Hauptbahnhof", "S+U Friedrichstr.", "S Hackescher Markt", "S+U Alexanderplatz",
             "S+U Jannowitzbrücke", "S Ostbahnhof"}
# Hauptbahnhof unten (Nord-Süd), wenn die Linie von/nach diesen Bahnhöfen fährt; sonst oben (Stadtbahn)
HBF_LOWER_NEIGHBORS = {"S Südkreuz", "S+U Gesundbrunnen", "S+U Potsdamer Platz", "S+U Wedding"}


def station_level(kind, line_name, names, i):
    """'tunnel', 'ground' oder 'elevated' für Bahnhof ``i`` der Liste ``names``."""
    name = names[i]
    neighbors = {names[j] for j in (i - 1, i + 1) if 0 <= j < len(names)}
    if kind in ("tram", "bus"):
        return "ground"
    if kind == "ubahn":
        if name in U_ELEVATED.get(line_name, ()):
            return "elevated"
        return "ground" if name in U_GROUND.get(line_name, ()) else "tunnel"
    if name in RAIL_TUNNEL:
        return "tunnel"
    if name == "S+U Friedrichstr.":                      # Stadtbahn oben, Nord-Süd-S-Bahn unten
        return "tunnel" if neighbors & RAIL_TUNNEL else "elevated"
    if name == "S+U Berlin Hauptbahnhof":
        return "tunnel" if neighbors & HBF_LOWER_NEIGHBORS else "elevated"
    return "elevated" if name in STADTBAHN else "ground"


ELEV = -7.0     # so tief liegt die Straße unter einem Viadukt (das Gleis ist immer bei 0)


class Scene:
    """Einfache Zentralperspektive: X quer (rechts +), Y Höhe, Z Entfernung nach vorn (Meter)."""

    def __init__(self, c, x1, y1, x2, y2):
        self.c = c
        self.cx = (x1 + x2) / 2
        self.hy = y1 + (y2 - y1) * 0.42
        self.f = (x2 - x1) * 0.75

    def p(self, X, Y, Z):
        Z = max(Z, Z_NEAR)
        return self.cx + X * self.f / Z, self.hy + (CAM_H - Y) * self.f / Z

    def poly(self, pts, fill, outline=""):
        self.c.create_polygon([v for P in pts for v in self.p(*P)], fill=fill, outline=outline)

    def ground(self, xa, xb, za, zb, fill, y=0.0):
        """Fläche auf dem Boden (oder in Höhe y), z. B. Schwelle, Fahrbahn, Bahnsteig."""
        if zb < Z_NEAR or za > Z_FAR:
            return
        za, zb = max(za, Z_NEAR), min(zb, Z_FAR)
        self.poly([(xa, y, za), (xb, y, za), (xb, y, zb), (xa, y, zb)], fill)

    def wall(self, x, ya, yb, za, zb, fill):
        """Senkrechte Wand längs der Strecke, z. B. Tunnelwand, Hauswand."""
        if zb < Z_NEAR or za > Z_FAR:
            return
        za, zb = max(za, Z_NEAR), min(zb, Z_FAR)
        self.poly([(x, ya, za), (x, yb, za), (x, yb, zb), (x, ya, zb)], fill)

    def front(self, xa, xb, ya, yb, z, fill, outline=""):
        """Fläche, die dem Fahrer zugewandt ist, z. B. Mast, Schild."""
        if Z_NEAR < z < Z_FAR:
            self.poly([(xa, ya, z), (xb, ya, z), (xb, yb, z), (xa, yb, z)], fill, outline)

    def size(self, meters, z):
        return meters * self.f / max(z, Z_NEAR)


def draw_scene(ride, c, app, x1, y1, x2, y2):
    """Die Strecke vor dem Fahrzeug. Alles hängt von ride.pos ab – so zieht die Landschaft beim Fahren vorbei."""
    if ride.kind not in ("tram", "bus"):
        return draw_rail_scene(ride, c, app, x1, y1, x2, y2)
    # ab hier Straßenbahn und Bus: Straße zwischen Häusern
    s = app.s
    kind = ride.kind
    st = app.data["stations"]
    stops = ride.stops
    cam = ride.pos * SEG
    sc = Scene(c, x1, y1, x2, y2)
    hy = sc.hy

    # --- Himmel und Boden ---
    sky = ["#6FB6EA", "#82C0EE", "#96CAF1", "#AAD4F4", "#BFDFF6", "#D4EAF9"]
    band = (hy - y1) / len(sky)
    for i, col in enumerate(sky):
        c.create_rectangle(x1, y1 + i * band, x2, y1 + (i + 1) * band + 1, fill=col, outline="")
    c.create_rectangle(x1, hy, x2, y2, fill="#B3AEA4", outline="")
    for k in range(14):                                         # Häuser am Horizont
        bx = x1 + (x2 - x1) * k / 14
        bh = (0.04 + 0.08 * rnd(k, 3)) * (y2 - y1)
        c.create_rectangle(bx, hy - bh, bx + (x2 - x1) / 14 + 1, hy + 1,
                           fill=["#C9C2B8", "#BDB6C4", "#B8C6C9", "#CFC4B0"][k % 4], outline="")

    # --- Fahrweg ---
    sc.ground(-7.0, 2.3, Z_NEAR, Z_FAR, "#5C5E63")              # Fahrbahn
    sc.ground(2.3, 7.0, Z_NEAR, Z_FAR, "#CBC5B8")               # Gehweg rechts
    sc.ground(-10.0, -7.0, Z_NEAR, Z_FAR, "#CBC5B8")            # Gehweg links
    sc.ground(2.2, 2.4, Z_NEAR, Z_FAR, "#E8E8E8", y=0.02)       # Bordstein

    def periodic(spacing, offset=0.0):
        """Positionen (Index, Abstand nach vorn) von Dingen, die alle ``spacing`` Meter wiederkehren."""
        k = math.floor((cam + Z_NEAR - offset) / spacing)
        while True:
            z = k * spacing + offset - cam
            if z > Z_FAR:
                return
            if z >= Z_NEAR - spacing:
                yield k, z
            k += 1

    if kind == "bus":
        for k, z in periodic(9.0):
            sc.ground(-2.45, -2.25, z, z + 4.0, "#F2F2F2", y=0.02)   # Mittellinie
    else:
        for k, z in periodic(6.0):
            sc.ground(-7.0, 2.3, z, z + 0.15, "#686A70", y=0.01)     # Fugen in der Fahrbahn
        for X in (-0.75, 0.75):
            sc.ground(X - 0.05, X + 0.05, Z_NEAR, Z_FAR, "#9A9A9A", y=0.06)   # Schienen in der Straße

    # --- Betriebshof hinter der Endstation ---
    # Was dahinter liegt, ist verdeckt: Häuser, Bäume und Masten werden dort nicht mehr gezeichnet.
    z_end = Z_FAR + 100
    if ride.depot:
        z_end = len(stops) * SEG - cam + 34
        draw_depot_hall(c, app, sc, z_end, MODE[kind][2], kind)

    # --- Dinge am Rand, von hinten nach vorn gezeichnet ---
    items = []
    houses = []     # Häuserzeilen liegen ganz außen und werden zuerst gezeichnet

    if kind == "tram":
        # Oberleitung: Draht und Masten
        wire_y = 5.6
        c.create_line(*sc.p(0, wire_y, Z_NEAR), *sc.p(0, wire_y, Z_FAR), fill="#2E2E2E", width=max(1, 2 * s))
        mast_x = 2.9
        for k, z in periodic(30.0, 7.0):
            def mast(z=z):
                sc.front(mast_x - 0.12, mast_x + 0.12, 0, 6.3, z, "#5A5F66")
                sc.front(min(mast_x, 0.2), max(mast_x, -0.2), 5.75, 5.95, z, "#5A5F66")
            items.append((z, mast))
    for k, z in periodic(13.0, 4.0):
        if rnd(k, 1) < 0.35:
            continue
        side = -1 if rnd(k, 2) < 0.5 else 1
        X = 4.0 + rnd(k, 4) * 2.0 if side > 0 else -(7.6 + rnd(k, 4) * 1.6)   # Bäume auf dem Gehweg

        def tree(z=z, X=X, k=k):
            sc.front(X - 0.18, X + 0.18, 0, 2.4, z, "#6B4A2E")
            cx, cy = sc.p(X, 4.0, z)
            r = sc.size(1.9 + 0.6 * rnd(k, 6), z)
            c.create_oval(cx - r, cy - r, cx + r, cy + r, fill=["#4F8F3F", "#5E9C46", "#477F38"][k % 3],
                          outline="")
        items.append((z, tree))
    colors = ["#D9B38C", "#C98D7A", "#E6D3A3", "#B7C3C9", "#D7A9A0", "#C2B59B"]
    for k, z in periodic(12.0):
        for side in (-1, 1):
            X = -10.0 if side < 0 else 7.0
            height = 9 + 9 * rnd(k, 7 + side)
            col = colors[int(rnd(k, 9 + side) * len(colors))]

            def house(z=z, X=X, height=height, col=col):
                sc.wall(X, 0, height, z, z + 11.5, col)
                if z < 45:
                    for fy in range(1, min(4, int(height // 3))):
                        for wz in (2.5, 7.5):
                            sc.wall(X + (0.05 if X > 0 else -0.05), fy * 3 - 0.2, fy * 3 + 1.1, z + wz, z + wz + 1.4,
                                    "#5B7590")
            houses.append((z + 11.5, house))

    # --- Haltestellen ---
    for i in range(math.floor(ride.pos) - 1, math.floor(ride.pos) + 3):
        if not 0 <= i < len(stops):
            continue
        zs = i * SEG - cam
        name = st[stops[i]]
        za, zb = zs - 12, zs + 28        # 40 m Bahnsteig, dazwischen freie Strecke
        if zb < Z_NEAR or za > Z_FAR:
            continue

        def stop(zs=zs, za=za, zb=zb, name=name):
            if kind == "tram":
                sc.ground(1.4, 3.6, za, zb, "#B0AAA0", y=0.25)
                sc.wall(1.4, 0, 0.25, za, zb, "#8C857A")
            pole_z = zs + 12
            sc.front(2.95, 3.05, 0, 3.6, pole_z, "#6F7378")
            station_sign(c, app, sc, 3.1, 6.4, 2.0, 2.7, pole_z, name, "#2F8F4E")
            if Z_NEAR < pole_z < Z_FAR:
                # das gelbe Berliner Haltestellenschild mit grünem H
                hx, hy2 = sc.p(3.0, 3.6, pole_z)
                r = sc.size(0.45, pole_z)
                c.create_oval(hx - r, hy2 - r, hx + r, hy2 + r, fill="#F7D117", outline="#2F8F4E", width=max(1, r * 0.15))
                if r > 5:
                    c.create_text(hx, hy2, text="H", fill="#2F8F4E", font=app.font(r * 1.3 / s, "bold"))
        items.append((zb, stop))

    houses = [it for it in houses if it[0] - 11.5 < z_end]
    items = [it for it in items if it[0] < z_end]
    for z, fn in sorted(houses, key=lambda it: -it[0]) + sorted(items, key=lambda it: -it[0]):
        fn()


def draw_rail_scene(ride, c, app, x1, y1, x2, y2):
    """Strecke für S-Bahn, U-Bahn, Regio und ICE. Jede Station hat ihren Abschnitt (±30 m), der im Tunnel,
    ebenerdig oder auf dem Viadukt liegt; an den Übergängen gibt es Tunnelportale bzw. Rampen."""
    kind = ride.kind
    st = app.data["stations"]
    stops = ride.stops
    n = len(stops)
    levels = ride.levels
    cam = ride.pos * SEG
    sc = Scene(c, x1, y1, x2, y2)
    hy = sc.hy

    def level(k):
        return levels[max(0, min(n - 1, k))]

    # Himmel, Wiese und Hügel – im Tunnel verdecken Wände und Decke alles davon
    sky = ["#6FB6EA", "#82C0EE", "#96CAF1", "#AAD4F4", "#BFDFF6", "#D4EAF9"]
    band = (hy - y1) / len(sky)
    for i, col in enumerate(sky):
        c.create_rectangle(x1, y1 + i * band, x2, y1 + (i + 1) * band + 1, fill=col, outline="")
    c.create_rectangle(x1, hy, x2, y2, fill="#86B86A", outline="")
    pts = [(x1, hy)]
    for k in range(13):
        pts.append((x1 + (x2 - x1) * k / 12, hy - (0.02 + 0.05 * rnd(k, 5)) * (y2 - y1)))
    pts.append((x2, hy))
    c.create_polygon([v for p in pts for v in p], fill="#6FA35C", outline="", smooth=True)

    z_end = Z_FAR + 100
    zd = n * SEG - cam
    if ride.depot:
        z_end = zd + 30                    # dahinter verdecken Prellbock und Erdwall bzw. Tunnelende alles

    # Abschnitte von hinten nach vorn
    regions = []
    k = math.floor((cam + Z_NEAR + SEG / 2) / SEG)
    while True:
        za = k * SEG - SEG / 2 - cam
        if za > min(Z_FAR, z_end):
            break
        regions.append((k, za, min(za + SEG, Z_FAR, z_end), level(k)))
        k += 1
    for idx in range(len(regions) - 1, -1, -1):
        k, za, zb, lv = regions[idx]
        has_end = ride.depot and zb >= z_end - 0.01
        draw_rail_region(ride, c, app, sc, k, max(za, Z_NEAR), zb, lv, st, stops,
                         (lambda lv=lv: draw_siding(c, app, sc, zd, z_end, kind, lv)) if has_end else None)
        if idx > 0 and za > Z_NEAR:
            draw_transition(sc, za, lv, regions[idx - 1][3])


def draw_transition(sc, z, far, near):
    """Übergang zwischen zwei Abschnitten bei Entfernung z (vom näheren aus gesehen)."""
    if far == near or near == "tunnel":
        return                                              # aus dem Tunnel heraus sieht man keine Kante
    concrete = "#8F8A80"
    if far == "tunnel":
        low = ELEV if near == "elevated" else 0.0
        grass = "#6E8F57"
        # begrünter Erdwall, in dem der Tunnel verschwindet, mit Betonrahmen um die Öffnung
        sc.front(-60, -3.0, low, 4.0, z + 0.5, grass)
        sc.front(3.0, 60, low, 4.0, z + 0.5, grass)
        sc.front(-9.0, 9.0, 4.0, 6.0, z + 0.5, grass)
        sc.front(-4.6, -3.0, low, 6.2, z, concrete)
        sc.front(3.0, 4.6, low, 6.2, z, concrete)
        sc.front(-3.0, 3.0, 4.6, 6.2, z, concrete)
        if low < 0:
            sc.front(-3.0, 3.0, low, 0, z, concrete)
    else:
        sc.front(-300, 300, ELEV, 0, z, "#9C8B73")          # Rampe zwischen Viadukt und ebenem Gleis


def draw_rail_region(ride, c, app, sc, k, za, zb, lv, st, stops, after_ground=None):
    s = app.s
    kind = ride.kind
    n = len(stops)
    cam = ride.pos * SEG
    tunnel = lv == "tunnel"

    def periodic(spacing, offset=0.0):
        """Positionen (Index, Entfernung) von Dingen alle ``spacing`` Meter, nur in diesem Abschnitt."""
        j = math.floor((cam + za - offset) / spacing)
        while True:
            z = j * spacing + offset - cam
            if z > zb:
                return
            if z >= za - 0.01:
                yield j, z
            j += 1

    # --- Boden, Tunnel bzw. Viadukt ---
    background = []
    if tunnel:
        if zb >= Z_FAR - 0.01:
            sc.front(-3.0, 3.0, 0, 4.6, Z_FAR - 0.1, "#0E1013")       # der Tunnel geht im Dunkeln weiter
        sc.wall(-3.0, 0, 4.6, za, zb, "#2A2B2E")
        sc.wall(3.0, 0, 4.6, za, zb, "#2A2B2E")
        sc.ground(-3.0, 3.0, za, zb, "#1E1F22", y=4.6)
        sc.ground(-3.0, 3.0, za, zb, "#3A3632")
    elif lv == "ground":
        sc.ground(-300, 300, za, zb, "#86B86A")
        sc.ground(-5.6, 2.2, za, zb, "#8E8578")
    else:
        # unten die Stadt mit Straße und Häusern, oben das Viadukt mit Geländer
        sc.ground(-300, 300, za, zb, "#A9A39A", y=ELEV)
        sc.ground(-4.0, 1.0, za, zb, "#6C6E73", y=ELEV + 0.01)
        colors = ["#D9B38C", "#C98D7A", "#E6D3A3", "#B7C3C9", "#D7A9A0", "#C2B59B"]
        for j, z in periodic(14.0):
            for X in (-14.0, 11.0):
                height = 14 + 8 * rnd(j, 7 + X)
                col = colors[int(rnd(j, 9 + X) * len(colors))]
                background.append((z + 12, lambda z=z, X=X, height=height, col=col:
                                   sc.wall(X, ELEV, ELEV + height, z, min(z + 12, zb), col)))
        for j, z in periodic(15.0, 5.0):
            background.append((z, lambda z=z: (sc.front(-6.0, -5.3, ELEV, 0, z, "#8A847A"),
                                               sc.front(2.0, 2.7, ELEV, 0, z, "#8A847A"))))
    for z, fn in sorted(background, key=lambda it: -it[0]):
        fn()
    if lv == "elevated":
        sc.ground(-5.9, 2.7, za, zb, "#8C8780")
        sc.ground(-5.6, 2.2, za, zb, "#8E8578", y=0.01)

    # --- Gleise ---
    wood = "#3D3B39" if tunnel else "#6B5444"
    for j, z in periodic(2.0):
        sc.ground(-1.25, 1.25, z, min(z + 0.35, zb), wood, y=0.02)
        if not tunnel:
            sc.ground(-5.05, -2.55, z, min(z + 0.35, zb), wood, y=0.02)    # Nachbargleis
    for X in (-0.75, 0.75):
        sc.ground(X - 0.05, X + 0.05, za, zb, "#D6D6D6", y=0.06)
    if not tunnel:
        for X in (-4.55, -3.05):
            sc.ground(X - 0.05, X + 0.05, za, zb, "#C8C8C8", y=0.06)
    if kind in ("sbahn", "ubahn"):
        sc.ground(1.45, 1.6, za, zb, "#7C7C7C", y=0.15)                     # Stromschiene
    if lv == "elevated":
        sc.wall(2.75, 0, 1.1, za, zb, "#5F646B")                           # Geländer
        sc.wall(-5.95, 0, 1.1, za, zb, "#5F646B")
    if after_ground:
        after_ground()

    # --- Dinge am Rand ---
    items = []
    if kind in ("regio", "ice") and not tunnel:
        c.create_line(*sc.p(0, 5.6, za), *sc.p(0, 5.6, zb), fill="#2E2E2E", width=max(1, 2 * s))
        for j, z in periodic(30.0, 7.0):
            items.append((z, lambda z=z: (sc.front(-2.92, -2.68, 0, 6.3, z, "#5A5F66"),
                                          sc.front(-2.8, 0.2, 5.75, 5.95, z, "#5A5F66"))))
    zs = k * SEG - cam
    in_station = 0 <= k < n
    if tunnel:
        for j, z in periodic(8.0):
            if in_station and abs(z - zs) < 40:
                continue                    # in der Bahnhofshalle ist es ohnehin hell
            items.append((z, lambda z=z: (sc.wall(-2.98, 3.5, 3.8, z, z + 1.4, "#FFE9A8"),
                                          sc.wall(2.98, 3.5, 3.8, z, z + 1.4, "#FFE9A8"))))
    elif lv == "ground":
        for j, z in periodic(13.0, 4.0):
            if rnd(j, 1) < 0.35:
                continue
            X = (-1 if rnd(j, 2) < 0.5 else 1) * (10.0 + 6 * rnd(j, 4))

            def tree(z=z, X=X, j=j):
                sc.front(X - 0.18, X + 0.18, 0, 2.4, z, "#6B4A2E")
                cx, cy = sc.p(X, 4.0, z)
                r = sc.size(1.9 + 0.6 * rnd(j, 6), z)
                c.create_oval(cx - r, cy - r, cx + r, cy + r, fill=["#4F8F3F", "#5E9C46", "#477F38"][j % 3],
                              outline="")
            items.append((z, tree))
    if in_station:
        pa, pb = max(zs - 12, za), min(zs + 28, zb)
        if pb > pa:
            items.append((pb, lambda: draw_platform(c, app, sc, ride, k, zs, pa, pb, lv, st[stops[k]])))
    for z, fn in sorted(items, key=lambda it: -it[0]):
        fn()


def draw_platform(c, app, sc, ride, i, zs, za, zb, lv, name):
    """Bahnsteig rechts neben dem Gleis – in der Bahnhofshalle, ebenerdig oder oben auf dem Viadukt."""
    if lv == "tunnel":
        # helle, gekachelte Bahnhofshalle statt Tunnel
        tiles = ["#D8E2D0", "#E3D9C6", "#CFDDE6", "#E6D0CF"][i % 4]
        sc.wall(8.0, 0, 4.8, za, zb, tiles)
        sc.wall(-3.0, 0, 4.6, za, zb, tiles)
        sc.ground(-3.0, 8.0, za, zb, "#EFEDE6", y=4.7)
        for lz in range(int(za), int(zb), 6):
            sc.ground(-1.0, 6.0, lz, lz + 1.2, "#FFF6D8", y=4.68)
    if lv == "elevated":
        sc.ground(2.7, 8.4, za, zb, "#8C8780")                 # Viadukt ist am Bahnhof breiter
        sc.wall(8.4, 0, 1.1, za, zb, "#5F646B")
    sc.ground(2.0, 8.0, za, zb, "#B9B2A6", y=1.0)
    sc.wall(2.0, 0, 1.0, za, zb, "#8C857A")
    sc.ground(2.0, 2.4, za, zb, "#F4F4F4", y=1.01)
    sc.front(2.0, 8.0, 0, 1.0, za, "#8C857A")                     # Stirnseite am Bahnsteiganfang
    if lv != "tunnel":
        for pz in range(int(za) + 4, int(zb), 9):
            sc.front(5.0, 5.18, 1.0, 4.3, pz, "#6F7378")
        sc.ground(2.8, 8.0, za, zb, "#7A8088", y=4.3)
    station_sign(c, app, sc, 2.7, 7.0, 2.4, 3.4, zs + 14, name, MODE[ride.kind][2])


def draw_depot_hall(c, app, sc, z, color, kind):
    """Betriebshof: große Halle quer zur Straße, mit offenen Toren und abgestellten Fahrzeugen."""
    if not Z_NEAR < z < Z_FAR:
        return
    sc.front(-16, 16, 0, 9.5, z, "#B9A88E")
    sc.front(-16.5, 16.5, 9.5, 10.4, z, "#7A6A55")
    body = MODE[kind][3][0]
    for gx in (-11.0, -4.5, 2.0, 8.5):
        sc.front(gx, gx + 5.0, 0, 6.0, z, "#2E3238")
        sc.front(gx + 0.6, gx + 4.4, 0.4, 3.4, z, body)                  # Fahrzeug von vorn
        sc.front(gx + 1.0, gx + 4.0, 1.9, 3.0, z, "#CFE8FF")              # Frontscheibe
    station_sign(c, app, sc, -6.5, 6.5, 7.0, 8.9, z, "Betriebshof", color)


def draw_siding(c, app, sc, zd, z_end, kind, level="ground"):
    """Abstellgleis: Prellbock am Gleisende, daneben abgestellte Züge (im Tunnel nur das Tunnelende)."""
    if level == "tunnel":
        sc.front(-3.0, 3.0, 0, 4.6, z_end, "#3A3B3E")                     # Tunnelende
    else:
        low = ELEV if level == "elevated" else 0.0
        sc.front(-40, 40, low, 3.2, z_end, "#5E8B4C")                     # Erdwall mit Büschen
        for k in range(-6, 7):
            cx, cy = sc.p(k * 3.2, 3.2, z_end)
            r = sc.size(1.8, z_end)
            c.create_oval(cx - r, cy - r, cx + r, cy + r, fill="#4F7F3F", outline="")
        # abgestellte Züge auf den Nachbargleisen (auf dem Viadukt ist dafür kein Platz)
        body, accent = MODE[kind][3]
        for x1, x2 in ((4.4, 7.0), (-8.0, -5.4)) if level != "elevated" else ():
            sc.ground(x1 + 0.3, x1 + 0.4, zd - 30, z_end, "#C8C8C8", y=0.06)
            sc.ground(x2 - 0.4, x2 - 0.3, zd - 30, z_end, "#C8C8C8", y=0.06)
            near_x = x1 if x1 > 0 else x2
            sc.wall(near_x, 0.6, 3.9, zd + 8, z_end - 1, body)
            sc.wall(near_x, 0.6, 1.0, zd + 8, z_end - 1, accent)
            side = 0.02 if near_x < 0 else -0.02
            wz = zd + 10
            while wz < z_end - 3:                                          # Fensterreihe
                sc.wall(near_x + side, 2.2, 3.3, wz, wz + 2.4, "#CFE8FF")
                wz += 3.6
            sc.front(x1, x2, 0.6, 3.9, zd + 8, body)
            sc.front(x1 + 0.4, x2 - 0.4, 2.3, 3.4, zd + 8, "#2B3440")
    # Prellbock: rot-weiß am Gleisende
    zb = z_end - 1.5
    sc.front(-1.1, 1.1, 0, 1.3, zb, "#C62828")
    for k in range(4):
        sc.front(-1.1 + k * 0.55, -0.85 + k * 0.55, 0.2, 1.1, zb, "white")
    sc.front(-0.9, 0.9, 1.3, 1.6, zb, "#3A3A3A")


def station_sign(c, app, sc, xa, xb, ya, yb, z, name, border):
    """Stationsschild, dem Fahrer zugewandt; der Name wird mit der Entfernung größer."""
    if not Z_NEAR + 0.5 < z < Z_FAR:
        return
    sc.front(xa, xb, ya, yb, z, "white", border)
    (ax, ay), (bx, by) = sc.p(xa, yb, z), sc.p(xb, ya, z)
    height = by - ay
    if height < 9:
        return
    px = height * 0.5 / app.s
    font = app.font(px, "bold")
    while font.measure(name) > (bx - ax) * 0.92 and px > 6:
        px *= 0.85
        font = app.font(px, "bold")
    c.create_text((ax + bx) / 2, (ay + by) / 2, text=name, fill="#1E2A38", font=font)


def round_button(app, c, cx, cy, r, color, symbol, label, enabled, callback, glow=False):
    """Echter runder Knopf im Armaturenbrett."""
    s = app.s
    col = color if enabled else "#4B5058"
    c.create_oval(cx - r - 4 * s, cy - r - 4 * s + 4 * s, cx + r + 4 * s, cy + r + 4 * s + 4 * s, fill="#1B1E23",
                  outline="")
    if glow:
        c.create_oval(cx - r - 7 * s, cy - r - 7 * s, cx + r + 7 * s, cy + r + 7 * s, fill="", outline="#7FD4FF",
                      width=3 * s)
    c.create_oval(cx - r - 3 * s, cy - r - 3 * s, cx + r + 3 * s, cy + r + 3 * s, fill="#8B9099", outline="")
    c.create_oval(cx - r, cy - r, cx + r, cy + r, fill=darker(col, 0.8), outline="")
    c.create_oval(cx - r * 0.86, cy - r * 0.92, cx + r * 0.86, cy + r * 0.8, fill=col, outline="")
    c.create_oval(cx - r * 0.5, cy - r * 0.75, cx + r * 0.1, cy - r * 0.45, fill=tint(col, 0.45), outline="")
    fg = text_color_for(col) if enabled else "#7A808A"
    c.create_text(cx, cy, text=symbol, font=app.font(r * 0.75 / s if len(symbol) <= 2 else r * 0.42 / s, "bold"),
                  fill=fg)
    c.create_text(cx, cy + r + 14 * s, text=label, font=app.font(13, "bold"), fill="#C9CED6" if enabled else "#6B7079")
    if enabled:
        app.hit(cx - r - 6 * s, cy - r - 6 * s, cx + r + 6 * s, cy + r + 22 * s, callback)


def draw_gauge(app, c, cx, cy, radius, speed, vmax):
    """Tacho mit Nadel und Ziffern."""
    s = app.s
    c.create_oval(cx - radius - 8 * s, cy - radius - 8 * s, cx + radius + 8 * s, cy + radius + 8 * s,
                  fill="#15181C", outline="#8B9099", width=3 * s)
    a0, a1 = math.radians(225), math.radians(-45)     # von links unten über oben nach rechts unten
    steps = 5
    for i in range(steps * 2 + 1):
        a = a0 + (a1 - a0) * i / (steps * 2)
        r1 = radius * (0.78 if i % 2 == 0 else 0.86)
        c.create_line(cx + math.cos(a) * r1, cy - math.sin(a) * r1, cx + math.cos(a) * radius * 0.95,
                      cy - math.sin(a) * radius * 0.95, fill="#E6E6E6", width=max(1, (2.5 if i % 2 == 0 else 1.2) * s))
        if i % 2 == 0:
            v = round(vmax * i / (steps * 2))
            c.create_text(cx + math.cos(a) * radius * 0.6, cy - math.sin(a) * radius * 0.6, text=str(v),
                          font=app.font(max(9, radius * 0.14 / s), "bold"), fill="#E6E6E6")
    frac = max(0.0, min(1.0, speed / vmax))
    a = a0 + (a1 - a0) * frac
    c.create_line(cx, cy, cx + math.cos(a) * radius * 0.88, cy - math.sin(a) * radius * 0.88, fill="#FF5A3C",
                  width=max(2, 4 * s), capstyle="round")
    c.create_oval(cx - 7 * s, cy - 7 * s, cx + 7 * s, cy + 7 * s, fill="#C9CED6", outline="")
    c.create_text(cx, cy + radius * 0.62, text=f"{round(speed)} km/h", font=app.font(max(9, radius * 0.13 / s), "bold"),
                  fill=LED)


def draw_cockpit(ride, c, w, h):
    """Führerstand: Fenster mit Strecke, Zielanzeige oben, Armaturenbrett mit Knöpfen unten."""
    app, s = ride.app, ride.app.s
    st = app.data["stations"]
    line, kind = ride.line, ride.kind
    stops = ride.stops
    last = ride.index == len(stops) - 1
    frame = "#2B2F36"
    accent = readable(line["color"])

    top_h = 112 * s
    dash_top = h * 0.6
    pillar = 30 * s
    wx1, wy1, wx2, wy2 = pillar, top_h, w - pillar, dash_top + 30 * s
    draw_scene(ride, c, app, wx1, wy1, wx2, wy2)

    # Fensterrahmen (deckt alles ab, was über das Fenster hinausragt)
    c.create_rectangle(0, 0, w, wy1, fill=frame, outline="")
    c.create_rectangle(0, 0, wx1, h, fill=frame, outline="")
    c.create_rectangle(wx2, 0, w, h, fill=frame, outline="")
    round_rect(c, wx1 - 10 * s, wy1 - 10 * s, wx2 + 10 * s, wy2 + 10 * s, 30 * s, fill="", outline=frame, width=22 * s)
    c.create_rectangle(0, top_h - 8 * s, w, top_h - 2 * s, fill=accent, outline="")
    # Scheibenwischer
    c.create_line(wx1 + (wx2 - wx1) * 0.32, wy2 - 6 * s, wx1 + (wx2 - wx1) * 0.12, wy2 - 70 * s, fill="#1B1E23",
                  width=max(2, 5 * s), capstyle="round")

    # --- Zielanzeige an der Decke ---
    dx1, dx2 = 220 * s, w - 220 * s
    dy1, dy2 = 12 * s, top_h - 20 * s
    round_rect(c, dx1, dy1, dx2, dy2, 10 * s, fill="#0B0B0B", outline="#45494F", width=3 * s)
    badge_font = app.font(24, "bold")
    bw = draw_badge(c, dx1 + 16 * s, (dy1 + dy2) / 2, line["name"], line["color"], kind, 46 * s, badge_font)
    led_big = app.font(26, "bold")
    led_small = app.font(19, "bold")
    tx = dx1 + 16 * s + bw + 18 * s
    tw = dx2 - tx - 14 * s
    dest = "Ringfahrt ↻" if ride.ring else st[stops[-1]]
    c.create_text(tx, dy1 + 24 * s, text=fit_text(led_big, dest, tw), anchor="w", font=led_big, fill=LED)
    text, until = ride.message
    depot_name, depot_key, _ = depot_info(kind)
    if text and time.monotonic() < until:
        second = text
    elif ride.depot:
        second = f"{depot_name} – Pause. Zurück: Taste {depot_key}"
    elif last:
        second = "Einmal rund um die Stadt!" if ride.ring else "Endstation – bitte alle aussteigen"
    else:
        second = "Nächster Halt: " + st[stops[ride.index + 1]]
    c.create_text(tx, dy2 - 20 * s, text=fit_text(led_small, second, tw), anchor="w", font=led_small,
                  fill="#FFD27A")

    # Kleine Knöpfe oben: Zurück und Ansicht wechseln
    def small_button(x1, label, cb):
        bw2, bh2 = 180 * s, 50 * s
        by = (top_h - 8 * s - bh2) / 2
        round_rect(c, x1, by, x1 + bw2, by + bh2, 25 * s, fill="#454A53", outline="")
        c.create_text(x1 + bw2 / 2, by + bh2 / 2, text=label, font=app.font(18, "bold"), fill="white")
        app.hit(x1, by, x1 + bw2, by + bh2, cb)
    small_button(20 * s, "◀  Zurück", ride.back)
    small_button(w - 200 * s, "F  Normale Ansicht", ride.toggle_cockpit)

    # --- Armaturenbrett ---
    c.create_polygon(0, dash_top + 40 * s, w * 0.12, dash_top, w * 0.88, dash_top, w, dash_top + 40 * s, w, h, 0, h,
                     fill="#3A3F48", outline="")
    c.create_line(w * 0.12, dash_top, w * 0.88, dash_top, fill=accent, width=max(2, 4 * s))
    pad = 22 * s
    py1, py2 = dash_top + 28 * s, h - 18 * s
    ph = py2 - py1
    inner_w = w - 2 * pad
    gap = 18 * s
    map_w = inner_w * 0.25
    gauge_w = inner_w * 0.14
    list_w = inner_w * 0.25
    btn_w = inner_w - map_w - gauge_w - list_w - 3 * gap
    x = pad

    # Bildschirm mit Netzplan
    round_rect(c, x, py1, x + map_w, py2, 14 * s, fill="#15181C", outline="#8B9099", width=2 * s)
    coords = app.data.get("coords", {})
    path = [coords[k] for k in stops if k in coords]
    app.network_map(kind).draw(c, x + 8 * s, py1 + 8 * s, x + map_w - 8 * s, py2 - 8 * s, s, line["name"], path,
                               ride.pos, MODE[kind][1], app.font(11, "bold"))
    x += map_w + gap

    # Tacho
    radius = min(gauge_w / 2 - 10 * s, ph / 2 - 10 * s)
    draw_gauge(app, c, x + gauge_w / 2, py1 + ph / 2 + 4 * s, radius, ride.speed * VMAX[kind], VMAX[kind])
    x += gauge_w + gap

    # Stationsanzeige
    round_rect(c, x, py1, x + list_w, py2, 14 * s, fill="#0B0B0B", outline="#8B9099", width=2 * s)
    c.create_text(x + 14 * s, py1 + 18 * s, text="STATIONEN", anchor="w", font=app.font(12, "bold"), fill=LED)
    c.create_text(x + list_w - 14 * s, py1 + 18 * s, text=f"{ride.index + 1} / {len(stops)}", anchor="e",
                  font=app.font(12, "bold"), fill=LED)
    rows = [i for i in range(ride.index - 1, ride.index + 4) if 0 <= i < len(stops)]
    if ride.depot:
        rows = []
        c.create_text(x + list_w / 2, py1 + ph * 0.45, text=depot_name.upper(), font=app.font(22, "bold"), fill=LED)
        c.create_text(x + list_w / 2, py1 + ph * 0.62, text=f"Pause · Taste {depot_key}: zurück",
                      font=app.font(14, "bold"), fill="#FFD27A")
    row_h = (ph - 40 * s) / 5
    ry = py1 + 34 * s
    mini = app.font(11, "bold")
    for i in rows:
        cur = i == ride.index
        font = app.font(17 if cur else 14, "bold" if cur else "normal")
        cy = ry + row_h / 2
        if cur:
            round_rect(c, x + 6 * s, ry + 2 * s, x + list_w - 6 * s, ry + row_h - 2 * s, 8 * s, fill="#3A2A0A", outline="")
        mark = "▶ " if cur else "   "
        fill = "#FFD27A" if cur else ("#6E6A60" if i < ride.index else "#E8E2D0")
        others = ride.transfer_options(i)
        bx = x + list_w - 10 * s
        shown = []
        for o in others[:3]:
            ww = max(22 * 1.6 * s, mini.measure(o["name"]) + 22 * 0.6 * s)
            if bx - ww < x + list_w * 0.55:
                break
            bx -= ww + 4 * s
            shown.append((bx, o))
        name = fit_text(font, mark + st[stops[i]], (bx if shown else x + list_w - 10 * s) - (x + 12 * s) - 6 * s)
        c.create_text(x + 12 * s, cy, text=name, anchor="w", font=font, fill=fill)
        for bx2, o in shown:
            draw_badge(c, bx2 + 4 * s, cy, o["name"], o["color"], o["kind"], 22 * s, mini)
        app.hit(x, ry, x + list_w, ry + row_h, lambda i=i: ride.go_to(i))
        ry += row_h
    x += list_w + gap

    # Knöpfe
    can_change = bool(ride.transfer_options()) and not ride.depot
    buttons = [("▲", "Zurück", ride.prev, (ride.index > 0 or ride.ring) and not ride.depot, "#F7D117"),
               ("▼", "Weiter", ride.next, not last or ride.ring, "#F7D117"),
               ("U", "Umsteigen", ride.change, can_change, "#2F9E5B"),
               ("Türen", "Türen", ride.doors, True, "#E8483B"),
               ("V", "Ansage", ride.announce, True, "#3D8BD4"),
               ("⇄", "Richtung", ride.switch, not ride.depot, "#E8E8E8"),
               (depot_key, depot_name, ride.toggle_depot, ride.depot or ride.at_terminus(), "#8E6BBF")]
    cols, rows_n = 4, 2
    cell_w, cell_h = btn_w / cols, ph / rows_n
    r = max(14 * s, min(cell_w * 0.3, cell_h * 0.3))
    for n, (sym, label, cb, enabled, color) in enumerate(buttons):
        bx = x + cell_w * (n % cols + 0.5)
        by = py1 + cell_h * (n // cols) + cell_h * 0.42
        glow = (sym == "U" and can_change) or (sym == depot_key and (ride.depot or last) and enabled)
        round_button(app, c, bx, by, r, color, sym, label, enabled, cb, glow=glow)


def board(app, opt, message):
    """In die Linie ``opt`` (aus Transfers.options) einsteigen, an der passenden Haltestelle."""
    lines_screen = LinesScreen(app, opt["kind"], opt["index"])
    ride = RideScreen(app, opt["kind"], opt["index"], lines_screen)
    ride.direction = opt["direction"]
    ride.index = opt["stop"]
    ride.pos = float(opt["stop"])
    ride.say(message, 2.5)
    app.sound.stop()
    app.show(ride)
    app.animate()


def dialog_card(app, c, w, h, cancel):
    """Großer Kasten über dem ganzen Fenster; Klick daneben = abbrechen. Gibt die Ecken zurück."""
    s = app.s
    c.create_rectangle(0, 0, w, h, fill="#2B3440", outline="")   # Tk kennt keine Transparenz
    app.hit(0, 0, w, h, cancel)
    x1, y1, x2, y2 = 40 * s, 40 * s, w - 40 * s, h - 40 * s
    round_rect(c, x1, y1, x2, y2, 30 * s, fill=BG, outline="")
    app.hit(x1, y1, x2, y2, lambda: None)   # Klick auf den Kasten selbst schließt nicht
    return x1, y1, x2, y2


def big_button(app, c, cx, cy, text, selected, callback, color="#2B6CB0", width=260):
    s = app.s
    bw, bh = width * s, 60 * s
    x1, y1 = cx - bw / 2, cy - bh / 2
    round_rect(c, x1, y1, x1 + bw, y1 + bh, 30 * s, fill=color if selected else "white",
               outline=color, width=(5 if selected else 2) * s)
    c.create_text(cx, cy, text=text, font=app.font(20, "bold"), fill="white" if selected else TEXT)
    app.hit(x1, y1, x1 + bw, y1 + bh, callback)
    return x1, y1, x1 + bw, y1 + bh


class ChangeScreen(Screen):
    """Auswahl der Linie beim Umsteigen (und beim Start am Startbahnhof)."""

    def __init__(self, app, title, options, back, message="Umgestiegen in {}!"):
        super().__init__(app)
        self.title = title
        self.options = options
        self.back = back
        self.message = message
        self.pick = 0
        self.cols = 1
        self.tiles = []

    def draw(self, c, w, h):
        app, s = self.app, self.app.s
        st = app.data["stations"]
        x1, y1, x2, y2 = dialog_card(app, c, w, h, self.back)
        title_font = app.font(34, "bold")
        c.create_text(w / 2, y1 + 50 * s, text=fit_text(title_font, self.title, x2 - x1 - 60 * s),
                      font=title_font, fill=TEXT)
        c.create_text(w / 2, y1 + 92 * s, text="Wähle mit den Pfeiltasten und drücke Enter",
                      font=app.font(18), fill=MUTED)
        _, by, _, _ = big_button(app, c, w / 2, y2 - 54 * s, "✕  Doch nicht", False, self.back)

        # Kacheln mit Verkehrsmittel, Linienschild und Ziel
        tile_w, tile_h, gap = 230 * s, 150 * s, 18 * s
        area_x1, area_x2 = x1 + 30 * s, x2 - 30 * s
        area_y1, area_y2 = y1 + 140 * s, by - 20 * s
        cols = max(1, int((area_x2 - area_x1 + gap) // (tile_w + gap)))
        rows_visible = max(1, int((area_y2 - area_y1 + gap) // (tile_h + gap)))
        self.cols = cols
        first_row = max(0, self.pick // cols - rows_visible + 1)
        total_rows = math.ceil(len(self.options) / cols)
        used_cols = min(cols, len(self.options))
        left = (x1 + x2) / 2 - (used_cols * tile_w + (used_cols - 1) * gap) / 2

        badge_font = app.font(30, "bold")
        dest_font = app.font(16, "bold")
        small_font = app.font(14)
        self.tiles = []
        for n, opt in enumerate(self.options):
            row, col = divmod(n, cols)
            if not first_row <= row < first_row + rows_visible:
                continue
            tx = left + col * (tile_w + gap)
            ty = area_y1 + (row - first_row) * (tile_h + gap)
            sel = n == self.pick
            round_rect(c, tx + 4 * s, ty + 6 * s, tx + tile_w + 4 * s, ty + tile_h + 6 * s, 20 * s, fill=SHADOW,
                       outline="")
            round_rect(c, tx, ty, tx + tile_w, ty + tile_h, 20 * s, fill=HIGHLIGHT if sel else CARD,
                       outline=MODE[opt["kind"]][2] if sel else "#EEE6D2", width=7 * s if sel else 2 * s)
            draw_mode_sign(c, app, opt["kind"], tx + 30 * s, ty + 30 * s, 32 * s)
            bwid = max(56 * 1.6 * s, badge_font.measure(opt["name"]) + 56 * 0.6 * s)
            draw_badge(c, tx + tile_w / 2 - bwid / 2, ty + 66 * s, opt["name"], opt["color"], opt["kind"],
                       56 * s, badge_font)
            stops = app.data["lines"][opt["kind"]][opt["index"]]["directions"][opt["direction"]]
            dest = "Ringfahrt ↻" if stops[0] == stops[-1] else "nach " + st[stops[-1]]
            c.create_text(tx + tile_w / 2, ty + 118 * s, text=fit_text(dest_font, dest, tile_w - 20 * s),
                          font=dest_font, fill=TEXT)
            self.tiles.append((n, tx, ty, tx + tile_w, ty + tile_h))
            app.hit(tx, ty, tx + tile_w, ty + tile_h, lambda n=n: self.choose(n))
        if first_row > 0:
            c.create_text(w / 2, area_y1 - 12 * s, text="▲ mehr", font=small_font, fill=MUTED)
        if first_row + rows_visible < total_rows:
            c.create_text(w / 2, area_y2 + 4 * s, text="▼ mehr", font=small_font, fill=MUTED)

    def choose(self, n):
        opt = self.options[n]
        board(self.app, opt, self.message.format(opt["name"]))

    def key(self, k, char):
        n, cols = len(self.options), self.cols
        if k == "Right":
            self.pick = min(n - 1, self.pick + 1)
        elif k == "Left":
            self.pick = max(0, self.pick - 1)
        elif k == "Down":
            self.pick = min(n - 1, self.pick + cols)
        elif k == "Up":
            self.pick = max(0, self.pick - cols)
        elif k in KEYS_OK:
            self.choose(self.pick)
            return
        elif k in KEYS_BACK or char in ("u", "U"):
            self.back()
            return
        self.app.redraw()

    def motion(self, x, y):
        for n, x1, y1, x2, y2 in self.tiles:
            if x1 <= x <= x2 and y1 <= y <= y2 and n != self.pick:
                self.pick = n
                self.app.redraw()


class ConfirmScreen(Screen):
    """Rückfrage für Eltern. „Abbrechen“ ist vorausgewählt, damit Kinder nichts aus Versehen ändern."""

    def __init__(self, app, title, lines, yes_text, on_yes, on_no):
        super().__init__(app)
        self.title, self.lines, self.yes_text = title, lines, yes_text
        self.on_yes, self.on_no = on_yes, on_no
        self.yes = False

    def draw(self, c, w, h):
        app, s = self.app, self.app.s
        x1, y1, x2, y2 = dialog_card(app, c, w, h, self.on_no)
        cx = w / 2
        y = y1 + 70 * s
        c.create_text(cx, y, text=self.title, font=app.font(32, "bold"), fill=TEXT)
        y += 70 * s
        font = app.font(22)
        for text in self.lines:
            for ln in wrap_text(font, text, x2 - x1 - 100 * s, 3):
                c.create_text(cx, y, text=ln, font=font, fill=TEXT)
                y += font.metrics("linespace")
            y += 14 * s
        by = min(y + 90 * s, y2 - 110 * s)
        big_button(app, c, cx - 160 * s, by, "Abbrechen", not self.yes, self.on_no, color="#6B7280")
        big_button(app, c, cx + 160 * s, by, self.yes_text, self.yes, self.on_yes, color="#2F855A")
        c.create_text(cx, by + 60 * s, text="← → wählen, Enter bestätigen, Esc bricht ab",
                      font=app.font(15), fill=MUTED)

    def key(self, k, char):
        if k in ("Left", "Right", "Tab"):
            self.yes = not self.yes
            self.app.redraw()
        elif k in ("Return", "KP_Enter"):
            (self.on_yes if self.yes else self.on_no)()
        elif k in KEYS_BACK:
            self.on_no()


# --------------------------------------------------------------------------
# Anwendung
# --------------------------------------------------------------------------

class App:
    def __init__(self, root, data):
        self.root = root
        self.data = data
        self.canvas = tk.Canvas(root, bg=BG, highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.s = 1.0
        self.hits = []
        self.fonts = {}
        self.family = self.pick_family()
        self.animating = False
        self.transfers = Transfers(data)
        self.maps = {}
        self.settings = self.load_settings()
        self.cockpit = False    # Cockpit-Ansicht beim Fahren (Taste F), bleibt beim Umsteigen erhalten
        self.sound = SoundPlayer()
        root.bind("<Destroy>", lambda e: self.sound.stop() if e.widget is root else None)

        root.bind("<Key>", self.on_key)
        root.bind("<F11>", lambda e: root.attributes("-fullscreen", not root.attributes("-fullscreen")))
        self.canvas.bind("<Configure>", lambda e: self.redraw())
        self.canvas.bind("<Button-1>", self.on_click)
        self.canvas.bind("<Motion>", self.on_motion)
        self.canvas.bind("<MouseWheel>", self.on_wheel)
        self.canvas.bind("<Button-4>", lambda e: self.screen.wheel(80 * self.s))
        self.canvas.bind("<Button-5>", lambda e: self.screen.wheel(-80 * self.s))
        self.screen = HomeScreen(self)

    def load_settings(self):
        try:
            return json.loads(settings_file().read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def save_settings(self):
        try:
            path = settings_file()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(self.settings, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError as e:
            print("Einstellungen konnten nicht gespeichert werden:", e, file=sys.stderr)

    def separate_modes(self):
        """Ankreuzfeld im Hauptmenü, standardmäßig an."""
        return self.settings.get("separate_modes", True)

    def show_ice(self):
        """Ankreuzfeld „Zeige ICE-Umstiege“, standardmäßig an."""
        return self.settings.get("show_ice", True)

    def transfer_kinds(self, kind):
        """Verkehrsmittel, in die man von ``kind`` aus umsteigen kann (None = alle)."""
        kinds = next(g for g in MODE_GROUPS if kind in g) if self.separate_modes() else MODE_ORDER
        if not self.show_ice():
            kinds = [k for k in kinds if k != "ice"]
        return None if len(kinds) == len(MODE_ORDER) else kinds

    def home_station(self):
        """Gespeicherter Startbahnhof, sonst Lichterfelde Ost."""
        stations = self.data["stations"]
        key = self.settings.get("home_station")
        if key in stations:
            return key
        for k, name in stations.items():
            if name == DEFAULT_HOME:
                return k
        return next(iter(stations))

    def network_map(self, kind):
        if kind not in self.maps:
            self.maps[kind] = NetworkMap(self.data, kind)
        return self.maps[kind]

    def pick_family(self):
        available = set(tkfont.families(self.root))
        for fam in ("Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", "Segoe UI", "Inter", "DejaVu Sans",
                    "Helvetica", "Arial"):
            if fam in available:
                return fam
        return "TkDefaultFont"

    def font(self, size, weight="normal"):
        px = max(8, round(size * self.s))
        key = (px, weight)
        if key not in self.fonts:
            # Negative Größe = Pixel, damit es auf allen Systemen gleich aussieht
            self.fonts[key] = tkfont.Font(root=self.root, family=self.family, size=-px, weight=weight)
        return self.fonts[key]

    def hit(self, x1, y1, x2, y2, callback):
        self.hits.append((x1, y1, x2, y2, callback))

    def show(self, screen):
        self.screen = screen
        self.redraw()

    def redraw(self):
        c = self.canvas
        w, h = max(c.winfo_width(), 300), max(c.winfo_height(), 300)
        self.s = max(0.55, min(w / 1280, h / 800))
        c.delete("all")
        self.hits = []
        c.create_rectangle(0, 0, w, h, fill=BG, outline="")
        self.screen.draw(c, w, h)

    def animate(self):
        if not self.animating:
            self.animating = True
            self.root.after(16, self._frame)

    def _frame(self):
        self.animating = False
        running = self.screen.tick()
        self.redraw()
        if running:
            self.animate()

    def on_key(self, e):
        self.screen.key(e.keysym, e.char)

    def on_click(self, e):
        for x1, y1, x2, y2, cb in reversed(self.hits):
            if x1 <= e.x <= x2 and y1 <= e.y <= y2:
                cb()
                return

    def on_motion(self, e):
        self.screen.motion(e.x, e.y)

    def on_wheel(self, e):
        # macOS liefert kleine Werte, Windows Vielfache von 120
        delta = e.delta if sys.platform == "darwin" else e.delta / 120
        self.screen.wheel(delta * 60 * self.s)


def main():
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"Datendatei fehlt: {DATA_FILE}\nBitte zuerst 'python3 tools/build_data.py' ausführen.")
        sys.exit(1)

    root = tk.Tk()
    root.title("Berlin fährt!")
    root.geometry("1280x800")
    root.minsize(800, 560)
    root.configure(bg=BG)
    App(root, data)
    if sys.platform == "darwin":
        # Fenster nach vorne holen, wenn per Doppelklick gestartet
        root.lift()
        root.attributes("-topmost", True)
        root.after(300, lambda: root.attributes("-topmost", False))
    root.mainloop()


if __name__ == "__main__":
    main()
