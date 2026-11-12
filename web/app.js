/* Berlin fährt! – Browser-Version.
 *
 * Dieselben Bildschirme und Funktionen wie bahnfahren.py, gezeichnet auf ein <canvas>.
 * Läuft ohne Server: index.html einfach im Browser öffnen.
 * Daten: window.BERLIN_DATA (data.js), Töne: window.BERLIN_SOUNDS (sounds.js),
 * beide erzeugt von tools/build_web.py.
 */
"use strict";

const PARENT_KEY = "F10";                   // Elterntaste: Startbahnhof festlegen
const DEFAULT_HOME = "S Lichterfelde Ost";  // Startbahnhof, solange nichts anderes gespeichert ist
const SETTINGS_KEY = "berlin-faehrt-einstellungen";

const BG = "#FFF8E7";
const CARD = "#FFFFFF";
const SHADOW = "#E9DFC7";
const TEXT = "#2B2B2B";
const MUTED = "#9A9488";
const HIGHLIGHT = "#FFE58A";
const PANEL = "#1E2A38";
const HEADER_H = 96;
const ROW_H = 66;

const MODES = [
  // Schlüssel, Name, Farbe des Verkehrsmittels, Farbe des Fahrzeugs
  ["sbahn", "S-Bahn", "#008D4F", ["#B5121B", "#F2B233"]],
  ["ubahn", "U-Bahn", "#115D91", ["#F7D117", "#3A3A3A"]],
  ["tram", "Straßenbahn", "#CC0A22", ["#F7D117", "#FFFFFF"]],
  ["bus", "Bus", "#A5027D", ["#F7D117", "#3A3A3A"]],
  ["regio", "Regionalbahn", "#4B5563", ["#D7001D", "#FFFFFF"]],
  ["ice", "ICE", "#EC0016", ["#F4F4F4", "#EC0016"]],
];
const MODE = Object.fromEntries(MODES.map(m => [m[0], m]));

const KEYS_NEXT = new Set(["Down", "Right", "space"]);
const KEYS_PREV = new Set(["Up", "Left"]);
const KEYS_OK = new Set(["Return", "space"]);
const KEYS_BACK = new Set(["Escape", "BackSpace"]);

const FONT_FAMILY = '"Arial Rounded MT Bold", "Avenir Next", "Helvetica Neue", "Segoe UI", Inter, ' +
  '"DejaVu Sans", Helvetica, Arial, sans-serif';

const now = () => performance.now() / 1000;

// --------------------------------------------------------------------------
// Zeichenhilfen
// --------------------------------------------------------------------------

function hexRgb(color) {
  return [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
}

function hex(r, g, b) {
  return "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.floor(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function textColorFor(bg) {
  const [r, g, b] = hexRgb(bg);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? "#000000" : "#FFFFFF";
}

function darker(color, f = 0.7) {
  const [r, g, b] = hexRgb(color);
  return hex(r * f, g * f, b * f);
}

/** Helle Farben (z. B. das Gelb der U4) auf weißem Grund abdunkeln, damit man sie gut erkennt. */
function readable(color) {
  return textColorFor(color) === "#000000" ? darker(color, 0.6) : color;
}

/** Mischt color mit Weiß (f = 0 → Farbe, f = 1 → weiß). */
function tint(color, f) {
  const [r, g, b] = hexRgb(color);
  return hex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
}

function roundRectPoints(x1, y1, x2, y2, r) {
  r = Math.max(0, Math.min(r, (x2 - x1) / 2, (y2 - y1) / 2));
  const pts = [];
  for (const [cx, cy, a0] of [[x2 - r, y1 + r, -90], [x2 - r, y2 - r, 0], [x1 + r, y2 - r, 90], [x1 + r, y1 + r, 180]]) {
    for (let i = 0; i < 7; i++) {
      const a = (a0 + i * 15) * Math.PI / 180;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return pts;
}

function circlePoints(cx, cy, r, n = 24) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([cx + r * Math.cos(2 * Math.PI * i / n), cy + r * Math.sin(2 * Math.PI * i / n)]);
  return pts;
}

/** Schrift mit Pixelgröße; misst Text über eine eigene Zeichenfläche. */
class Font {
  constructor(px, weight) {
    this.px = px;
    this.css = `${weight === "bold" ? "bold " : ""}${px}px ${FONT_FAMILY}`;
    this.cache = new Map();
  }
  measure(text) {
    let w = this.cache.get(text);
    if (w === undefined) {
      Font.ctx.font = this.css;
      w = Font.ctx.measureText(text).width;
      this.cache.set(text, w);
    }
    return w;
  }
  linespace() {
    return Math.round(this.px * 1.21);
  }
}
Font.ctx = document.createElement("canvas").getContext("2d");

/** Dünne Schicht über dem Canvas mit denselben Befehlen wie im Tk-Original. */
class Painter {
  constructor(ctx) {
    this.ctx = ctx;
  }
  path(pts, close) {
    const ctx = this.ctx;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (close) ctx.closePath();
  }
  polygon(pts, o = {}) {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    this.path(pts, true);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.outline) {
      ctx.strokeStyle = o.outline;
      ctx.lineWidth = o.width || 1;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }
  roundRect(x1, y1, x2, y2, r, o) {
    this.polygon(roundRectPoints(x1, y1, x2, y2, r), o);
  }
  rect(x1, y1, x2, y2, fill) {
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  }
  oval(x1, y1, x2, y2, o = {}) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, 2 * Math.PI);
    if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
    if (o.outline) { ctx.strokeStyle = o.outline; ctx.lineWidth = o.width || 1; ctx.stroke(); }
  }
  /** Linie durch Punkte [x, y] oder ein flaches Array [x1, y1, x2, y2, …]. */
  line(pts, o = {}) {
    if (typeof pts[0] === "number") {
      const p = [];
      for (let i = 0; i + 1 < pts.length; i += 2) p.push([pts[i], pts[i + 1]]);
      pts = p;
    }
    const ctx = this.ctx;
    this.path(pts, false);
    ctx.strokeStyle = o.fill || "#000";
    ctx.lineWidth = o.width || 1;
    ctx.lineCap = o.cap || "butt";
    ctx.lineJoin = o.join || "miter";
    ctx.stroke();
  }
  /** Text wie Tk create_text: anchor center, w, e, nw. */
  text(x, y, text, font, fill, anchor = "center") {
    const ctx = this.ctx;
    ctx.font = font.css;
    ctx.fillStyle = fill;
    ctx.textAlign = anchor === "w" || anchor === "nw" ? "left" : anchor === "e" ? "right" : "center";
    ctx.textBaseline = anchor === "nw" ? "top" : "middle";
    ctx.fillText(text, x, y);
  }
}

function drawVehicle(c, kind, cx, cy, length, flip = false) {
  const [body, accent] = MODE[kind][3];
  const mx = flip ? -1 : 1;
  const T = pts => pts.map(([x, y]) => [cx + mx * x * length, cy + y * length]);
  const poly = (pts, o) => c.polygon(T(pts), o);

  const outline = darker(body, 0.55);
  const lw = Math.max(1, length / 90);
  const h = { bus: 0.34, regio: 0.40 }[kind] || 0.30;
  const top = -h / 2, bottom = h / 2 - 0.04;
  const wheelR = kind !== "bus" ? 0.045 : 0.06;

  // Stromabnehmer der Straßenbahn
  if (kind === "tram") {
    c.line(T([[-0.05, top], [0.05, top - 0.09], [-0.03, top - 0.12], [0.12, top - 0.12]]),
      { fill: "#555555", width: Math.max(1, length / 60) });
  }
  // Räder
  for (const wx of kind !== "bus" ? [-0.32, -0.22, 0.22, 0.32] : [-0.3, 0.3]) {
    poly(circlePoints(wx, bottom, wheelR, 12), { fill: "#333333" });
  }
  // Wagenkasten (der ICE hat vorne eine spitze Nase)
  if (kind === "ice") {
    poly([[-0.46, top], [0.2, top], [0.38, top + 0.04], [0.5, bottom - 0.07], [0.5, bottom - 0.02],
      [0.47, bottom], [-0.46, bottom], [-0.5, bottom - 0.04], [-0.5, top + 0.04]], { fill: body, outline: "#9AA0A6", width: lw });
  } else {
    poly(roundRectPoints(-0.5, top, 0.5, bottom, kind === "bus" ? 0.05 : 0.09), { fill: body, outline, width: lw });
  }
  // Zierstreifen
  if (kind === "sbahn") {
    poly([[-0.49, top + 0.005], [0.47, top + 0.005], [0.49, top + 0.06], [-0.49, top + 0.06]], { fill: accent });
  } else {
    poly([[-0.49, bottom - 0.05], [0.49, bottom - 0.05], [0.48, bottom - 0.02], [-0.48, bottom - 0.02]], { fill: accent });
  }
  // Fenster (der Regionalzug ist ein Doppelstockwagen: zwei Fensterreihen)
  const win = "#CFE8FF";
  let wy1 = top + 0.07, wy2 = top + 0.07 + (kind !== "bus" ? 0.10 : 0.12);
  let xs = kind !== "bus" ? [-0.42, -0.27, -0.12, 0.03, 0.18] : [-0.44, -0.29, -0.14, 0.01, 0.16];
  if (kind === "ice") xs = [-0.44, -0.3, -0.16, 0.06];
  let rows = [[wy1, wy2]];
  if (kind === "regio") {
    wy1 = top + 0.05; wy2 = top + 0.13;
    rows = [[wy1, wy2], [top + 0.18, top + 0.26]];
  }
  for (const [ry1, ry2] of rows) {
    for (const wx of xs) poly(roundRectPoints(wx, ry1, wx + 0.11, ry2, 0.015), { fill: win, outline, width: lw / 2 });
  }
  // Frontscheibe
  if (kind === "ice") poly([[0.26, wy1], [0.36, wy1 + 0.01], [0.44, wy2 + 0.01], [0.3, wy2 + 0.01]], { fill: "#2B3440" });
  else poly(roundRectPoints(0.33, wy1, 0.47, wy2 + 0.03, 0.03), { fill: win, outline, width: lw / 2 });
  // Tür
  const door = kind !== "bus" ? [-0.06, 0.04] : [0.29, 0.36];
  poly([[door[0], wy1], [door[1], wy1], [door[1], bottom - 0.055], [door[0], bottom - 0.055]],
    { fill: darker(body, 0.85), outline: kind === "ice" ? "#9AA0A6" : outline, width: lw / 2 });
  // Scheinwerfer
  poly(circlePoints(0.47, bottom - 0.07, 0.018, 10), { fill: "#FFF6B0" });
}

/** Das bekannte Berliner Zeichen: grünes S, blaues U, Schilder für Tram, Bus und Regionalzug. */
function drawModeSign(c, app, kind, cx, cy, size) {
  const color = MODE[kind][2];
  const r = size / 2;
  const s = app.s;
  if (kind === "sbahn") {
    c.oval(cx - r, cy - r, cx + r, cy + r, { fill: color });
    c.text(cx, cy, "S", app.font(size / s * 0.62, "bold"), "white");
  } else if (kind === "ubahn") {
    c.roundRect(cx - r, cy - r, cx + r, cy + r, size * 0.08, { fill: color });
    c.text(cx, cy, "U", app.font(size / s * 0.62, "bold"), "white");
  } else if (kind === "ice") {
    c.roundRect(cx - r, cy - r, cx + r, cy + r, size * 0.22, { fill: color });
    c.text(cx, cy, "ICE", app.font(size / s * 0.36, "bold"), "white");
  } else if (kind === "regio") {
    // wie die roten Zugschilder der Bahn: „RE“ in Rot auf Weiß
    c.roundRect(cx - r, cy - r, cx + r, cy + r, size * 0.22, { fill: color });
    c.roundRect(cx - r * 0.8, cy - r * 0.55, cx + r * 0.8, cy + r * 0.55, size * 0.1, { fill: "white" });
    c.text(cx, cy, "RE", app.font(size / s * 0.42, "bold"), "#D7001D");
  } else {
    c.roundRect(cx - r, cy - r, cx + r, cy + r, size * 0.22, { fill: color });
    const text = kind === "tram" ? "Tram" : "Bus";
    c.text(cx, cy, text, app.font(size / s * (kind === "tram" ? 0.3 : 0.36), "bold"), "white");
  }
}

/** Linienschild wie an der Haltestelle. Gibt die Breite zurück. */
function drawBadge(c, x, y, name, color, kind, h, font, border = 0) {
  const w = Math.max(h * 1.6, font.measure(name) + h * 0.6);
  const r = { sbahn: h / 2, tram: h / 2, bus: h * 0.3 }[kind] ?? h * 0.12;
  if (border) {
    c.roundRect(x - border, y - h / 2 - border, x + w + border, y + h / 2 + border, r + border, { fill: "white" });
  }
  if (kind === "regio") {
    // Regionalzüge: rote Schrift auf Weiß mit rotem Rand, wie an den Bahnhöfen
    c.roundRect(x, y - h / 2, x + w, y + h / 2, r, { fill: "white", outline: color, width: Math.max(1, h * 0.08) });
    c.text(x + w / 2, y, name, font, color);
    return w;
  }
  c.roundRect(x, y - h / 2, x + w, y + h / 2, r, { fill: color });
  c.text(x + w / 2, y, name, font, textColorFor(color));
  return w;
}

function fitText(font, text, width) {
  if (font.measure(text) <= width) return text;
  while (text && font.measure(text + "…") > width) text = text.slice(0, -1);
  return text + "…";
}

function wrapText(font, text, width, maxLines = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  let lines = [], cur = "";
  for (const word of words) {
    const test = (cur + " " + word).trim();
    if (font.measure(test) <= width || !cur) cur = test;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines - 1).concat([fitText(font, lines.slice(maxLines - 1).join(" "), width)]);
  }
  return lines.map(line => fitText(font, line, width));
}

/** Ankreuzfeld mit Beschriftung; ganze Zeile anklickbar. */
function checkbox(app, c, x, cy, label, on, callback) {
  const s = app.s, box = 22 * s;
  c.roundRect(x, cy - box / 2, x + box, cy + box / 2, 5 * s,
    { fill: on ? "#2F855A" : "white", outline: on ? "#2F855A" : MUTED, width: 2 * s });
  if (on) {
    c.line([[x + box * 0.22, cy], [x + box * 0.43, cy + box * 0.22], [x + box * 0.8, cy - box * 0.25]],
      { fill: "white", width: 3 * s, cap: "round", join: "round" });
  }
  const font = app.font(15);
  c.text(x + box + 10 * s, cy, label, font, TEXT, "w");
  app.hit(x - 6 * s, cy - box * 0.6, x + box + 16 * s + font.measure(label), cy + box * 0.6, callback);
}

function drawHouse(c, cx, cy, size, color) {
  const h = size / 2;
  c.polygon([[cx - h, cy - h * 0.1], [cx, cy - h], [cx + h, cy - h * 0.1]], { fill: color });
  c.rect(cx - h * 0.7, cy - h * 0.15, cx + h * 0.7, cy + h * 0.8, color);
  c.rect(cx - h * 0.18, cy + h * 0.25, cx + h * 0.18, cy + h * 0.8, "white");
}

// --------------------------------------------------------------------------
// Töne und Ansagen
// --------------------------------------------------------------------------

const ABBREVIATIONS = [
  [/str\./g, "straße"], [/Str\./g, "Straße"], [/\bPl\./g, "Platz"], [/\bBhf\.?/g, "Bahnhof"],
  [/\bHbf\.?/g, "Hauptbahnhof"], [/\bAlt-/g, "Alt "], [/\bS\+U\s+/g, ""], [/^[SU]\s+/, ""], [/\//g, ", "],
];

/** Macht aus "S+U Hermannstr." etwas, das die Sprachausgabe gut vorlesen kann: "Hermannstraße". */
function spokenName(name) {
  for (const [pattern, repl] of ABBREVIATIONS) name = name.replace(pattern, repl);
  return name.trim();
}

/** "S85" -> "S 85", damit die Nummer als Zahl gesprochen wird. */
function spokenLine(name) {
  return name.replace("ICE", "I-C-E").replace(/^([A-Z]+)(\d)/, "$1 $2");
}

class SoundPlayer {
  constructor() {
    this.audio = null;
    this.token = 0;   // verhindert, dass ein abgebrochener Ton nach der Ansage doch noch startet
  }

  /** Spielt den Ton von kind; vorher wird speech gesprochen (falls angegeben). */
  play(kind, speech) {
    this.stop();
    const src = (window.BERLIN_SOUNDS || {})[kind] || `sounds/${kind}.wav`;
    const token = this.token;
    const start = () => {
      if (token !== this.token) return;
      this.audio = new Audio(src);
      this.audio.play().catch(() => {});
    };
    if (speech && this.canSpeak()) this.say(speech, start);
    else start();
  }

  speak(text) {
    this.stop();
    if (this.canSpeak()) this.say(text);
  }

  canSpeak() {
    return "speechSynthesis" in window;
  }

  say(text, onEnd) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "de-DE";
    const voice = speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("de"));
    if (voice) u.voice = voice;
    if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
    speechSynthesis.speak(u);
  }

  stop() {
    this.token++;
    if (this.audio) { this.audio.pause(); this.audio = null; }
    if (this.canSpeak()) speechSynthesis.cancel();
  }
}

// --------------------------------------------------------------------------
// Umsteigen
// --------------------------------------------------------------------------

const MODE_ORDER = ["sbahn", "ubahn", "regio", "ice", "tram", "bus"];     // Reihenfolge beim Umsteigen
// Bei „Umsteigen getrennt“ sieht man nur Umstiege innerhalb der eigenen Gruppe
const MODE_GROUPS = [["sbahn", "ubahn", "regio", "ice"], ["tram", "bus"]];
const NEAR_M = 200;          // Haltestellen in diesem Umkreis gehören zusammen
const SAME_NAME_M = 400;     // gleichnamige Stationen (z. B. "S+U" und "U Alexanderplatz") auch etwas weiter

/** "S+U Alexanderplatz/Memhardstr." -> "alexanderplatz" */
function baseName(name) {
  return name.replace(/^(S\+U|S|U)\s+/, "").split("/")[0].trim().toLowerCase();
}

function distanceM(a, b) {
  const lat = (a[0] + b[0]) / 2 * Math.PI / 180;
  return Math.hypot((a[1] - b[1]) * Math.cos(lat) * 111320, (a[0] - b[0]) * 110540);
}

function compareTuples(a, b) {
  for (let i = 0; i < a.length; i++) {
    const x = +a[i], y = +b[i];
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Findet alle Linien, in die man an einer Haltestelle umsteigen kann (auch an nahen Masten). */
class Transfers {
  constructor(data) {
    this.data = data;
    this.coords = data.coords || {};
    this.cache = new Map();
    // Station -> [[Verkehrsmittel, Linien-Nr., Richtung, Position]]
    this.served = new Map();
    for (const kind of MODE_ORDER) {
      (data.lines[kind] || []).forEach((line, li) => {
        line.directions.forEach((stops, d) => {
          stops.forEach((key, i) => {
            if (!this.served.has(key)) this.served.set(key, []);
            this.served.get(key).push([kind, li, d, i]);
          });
        });
      });
    }
  }

  nearby(key) {
    const here = this.coords[key];
    if (!here) return [[0, key]];
    const name = baseName(this.data.stations[key]);
    const result = [];
    for (const [other, pos] of Object.entries(this.coords)) {
      const d = distanceM(here, pos);
      if (d <= NEAR_M || (d <= SAME_NAME_M && baseName(this.data.stations[other]) === name)) result.push([d, other]);
    }
    return result;
  }

  /** Umsteigemöglichkeiten an key, ohne die Linie exclude = [kind, nr], nur Verkehrsmittel aus kinds. */
  options(key, exclude = null, kinds = null) {
    if (!this.cache.has(key)) {
      const best = new Map();
      for (const [dist, other] of this.nearby(key)) {
        for (const [kind, li, d, i] of this.served.get(other) || []) {
          const stops = this.data.lines[kind][li].directions[d];
          const ahead = stops.length - 1 - i;
          // nächste Haltestelle zuerst, dann die Richtung mit der längeren Fahrt
          const rank = [Math.round(dist / 100), ahead === 0, -ahead, dist];
          const id = kind + "/" + li;
          if (!best.has(id) || compareTuples(rank, best.get(id).rank) < 0) best.set(id, { rank, kind, li, d, i, other });
        }
      }
      const opts = [];
      for (const b of best.values()) {
        const line = this.data.lines[b.kind][b.li];
        opts.push({ kind: b.kind, index: b.li, name: line.name, color: line.color, direction: b.d, stop: b.i, key: b.other });
      }
      opts.sort((a, b) => MODE_ORDER.indexOf(a.kind) - MODE_ORDER.indexOf(b.kind) || a.index - b.index);
      this.cache.set(key, opts);
    }
    return this.cache.get(key).filter(o =>
      !(exclude && o.kind === exclude[0] && o.index === exclude[1]) && (!kinds || kinds.includes(o.kind)));
  }
}

// --------------------------------------------------------------------------
// Netzplan (Minikarte)
// --------------------------------------------------------------------------

/** Schneidet eine Linie (Punkte [x, y]) auf ein Rechteck zu (Liang-Barsky). Liefert sichtbare Teilstücke. */
function clipPolyline(pts, x1, y1, x2, y2) {
  const pieces = [];
  let cur = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    let t0 = 0, t1 = 1, ok = true;
    const dx = bx - ax, dy = by - ay;
    for (const [p, q] of [[-dx, ax - x1], [dx, x2 - ax], [-dy, ay - y1], [dy, y2 - ay]]) {
      if (p === 0) {
        if (q < 0) { ok = false; break; }
      } else {
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      }
    }
    if (!ok || t0 > t1) {
      if (cur.length >= 4) pieces.push(cur);
      cur = [];
      continue;
    }
    const sx = ax + t0 * dx, sy = ay + t0 * dy, ex = ax + t1 * dx, ey = ay + t1 * dy;
    if (cur.length && t0 === 0) cur.push(ex, ey);
    else {
      if (cur.length >= 4) pieces.push(cur);
      cur = [sx, sy, ex, ey];
    }
    if (t1 < 1) { pieces.push(cur); cur = []; }
  }
  if (cur.length >= 4) pieces.push(cur);
  return pieces;
}

/** Netzplan eines Verkehrsmittels, gezeichnet aus den Koordinaten der Haltestellen. */
class NetworkMap {
  constructor(data, kind) {
    this.kind = kind;
    const coords = data.coords || {};
    this.lines = [];
    for (const line of data.lines[kind]) {
      const pts = line.directions[0].filter(k => coords[k]).map(k => coords[k]);
      if (pts.length >= 2) this.lines.push([line.name, line.color, pts]);
    }
    // Ringbahn als Orientierung („innerhalb/außerhalb des Rings“)
    this.ring = [];
    if (kind !== "sbahn") {
      const s41 = data.lines.sbahn.find(l => l.name === "S41");
      if (s41) this.ring = s41.directions[0].filter(k => coords[k]).map(k => coords[k]);
    }
    let all = this.lines.flatMap(l => l[2]);
    if (!all.length) all = [[52.52, 13.40]];
    this.lat0 = all.reduce((a, p) => a + p[0], 0) / all.length;
    const xs = all.map(p => this.x(p)), ys = all.map(p => this.y(p));
    this.bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    this.cacheKey = null;
    this.cacheItems = [];
  }

  x(p) { return p[1] * Math.cos(this.lat0 * Math.PI / 180); }
  y(p) { return -p[0]; }

  /** Ausschnitt um die gefahrene Linie (für Bus und Regionalzug), mindestens ca. 8 km breit. */
  zoomBounds(path) {
    const xs = path.map(p => this.x(p)), ys = path.map(p => this.y(p));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const hw = Math.max((maxX - minX) * 0.7, 0.055), hh = Math.max((maxY - minY) * 0.7, 0.035);
    return [cx - hw, cy - hh, cx + hw, cy + hh];
  }

  fit(x1, y1, x2, y2, bounds) {
    const [bx1, by1, bx2, by2] = bounds || this.bounds;
    const scale = Math.min((x2 - x1) / Math.max(1e-9, bx2 - bx1), (y2 - y1) / Math.max(1e-9, by2 - by1));
    const ox = x1 + ((x2 - x1) - (bx2 - bx1) * scale) / 2;
    const oy = y1 + ((y2 - y1) - (by2 - by1) * scale) / 2;
    return p => [ox + (this.x(p) - bx1) * scale, oy + (this.y(p) - by1) * scale];
  }

  draw(c, x1, y1, x2, y2, s, lineName, path, pos, kindLabel, font) {
    c.roundRect(x1, y1, x2, y2, 16 * s, { fill: "#F6F1E4" });
    const pad = 14 * s;
    const many = this.lines.length > 30;
    // Beim Bus (riesiges Netz) und Regionalzug (bis an die Ostsee) wäre Berlin winzig: heranzoomen
    const zoom = many || this.kind === "regio";
    const bounds = zoom && path.length >= 2 ? this.zoomBounds(path) : null;
    const P = this.fit(x1 + pad, y1 + pad + 16 * s, x2 - pad, y2 - pad, bounds);
    const cx1 = x1 + 4 * s, cy1 = y1 + 4 * s, cx2 = x2 - 4 * s, cy2 = y2 - 4 * s;
    const lineColor = (this.lines.find(l => l[0] === lineName) || [0, "#333333"])[1];

    // Das Netz ändert sich beim Fahren nicht – nur einmal umrechnen und zuschneiden
    const key = [x1, y1, x2, y2, s, lineName, path.length, path[0] && path[0].join()].join("|");
    if (this.cacheKey !== key) {
      const items = [];
      const polyline = (pts, o) => {
        for (const piece of clipPolyline(pts.map(P), cx1, cy1, cx2, cy2)) items.push([piece, o]);
      };
      if (this.ring.length >= 2) polyline(this.ring, { fill: "#DDD5C2", width: Math.max(2, 5 * s) });
      for (const [name, color, pts] of this.lines) {
        if (name !== lineName) {
          polyline(pts, { fill: tint(color, many ? 0.7 : 0.55), width: Math.max(1, (many ? 1.5 : 2.5) * s) });
        }
      }
      if (path.length >= 2) {
        polyline(path, { fill: readable(lineColor), width: Math.max(3, 5 * s), cap: "round", join: "round" });
      }
      this.cacheKey = key;
      this.cacheItems = items;
    }
    for (const [piece, o] of this.cacheItems) c.line(piece, o);
    const col = readable(lineColor);
    if (path.length >= 2) {
      for (const end of [path[0], path[path.length - 1]]) {
        const [ex, ey] = P(end);
        if (ex < cx1 || ex > cx2 || ey < cy1 || ey > cy2) continue;
        const r = 4 * s;
        c.oval(ex - r, ey - r, ex + r, ey + r, { fill: "white", outline: col, width: Math.max(1, 2 * s) });
      }
    }
    // aktuelle Position, zwischen zwei Stationen weich verschoben
    if (path.length) {
      const i = Math.max(0, Math.min(path.length - 1, Math.floor(pos)));
      const j = Math.min(path.length - 1, i + 1);
      const f = pos - i;
      const [ax, ay] = P(path[i]), [bx, by] = P(path[j]);
      const px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
      let r = 11 * s;
      c.oval(px - r, py - r, px + r, py + r, { outline: "#E8483B", width: Math.max(1, 2 * s) });
      r = 6 * s;
      c.oval(px - r, py - r, px + r, py + r, { fill: "#E8483B", outline: "white", width: Math.max(1, 2 * s) });
    }
    c.text(x1 + 12 * s, y1 + 14 * s, "NETZPLAN " + kindLabel.toUpperCase(), font, "#8A8170", "w");
  }
}

// --------------------------------------------------------------------------
// Bildschirme
// --------------------------------------------------------------------------

class Screen {
  constructor(app) { this.app = app; }
  draw(c, w, h) {}
  key(k, char) {}
  wheel(delta) {}
  motion(x, y) {}
  /** Finger (oder Maus mit gedrückter Taste) wird senkrecht um dy verschoben. */
  drag(dy) {}
  /** Wischen beendet; v = Geschwindigkeit in Pixel pro Millisekunde (positiv = nach unten). */
  dragEnd(v) {}
  /** Ein Animationsschritt; true, solange weiter animiert werden soll. */
  tick() { return false; }
}

/** Farbige Kopfzeile mit Zurück-Knopf. Gibt Höhe und rechten Rand des Knopfs zurück. */
function header(app, c, w, color, back) {
  const s = app.s;
  const hh = HEADER_H * s;
  c.rect(0, 0, w, hh, color);
  const bw = 170 * s, bh = 58 * s, bx = 20 * s, by = (hh - bh) / 2;
  c.roundRect(bx, by, bx + bw, by + bh, 29 * s, { fill: "white" });
  c.text(bx + bw / 2, by + bh / 2, "◀  Zurück", app.font(22, "bold"), readable(color));
  app.hit(bx, by, bx + bw, by + bh, back);
  return [hh, bx + bw];
}

class HomeScreen extends Screen {
  constructor(app, selected = 0) {
    super(app);
    this.selected = selected;
    this.lastTile = selected < HomeScreen.START ? selected : 0;
    this.tiles = [];
    this.startBox = null;
    this.cols = 4;
  }

  draw(c, w, h) {
    const app = this.app, s = app.s;
    c.text(w / 2, 70 * s, "Womit möchtest du fahren?", app.font(46, "bold"), TEXT);
    c.text(w / 2, 125 * s, "Wähle mit den Pfeiltasten und drücke Enter – oder klicke einfach!", app.font(20), MUTED);

    const n = MODES.length;
    const cols = w > h * 1.25 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const gap = 30 * s;
    const areaTop = 165 * s;
    const areaBottom = h - 180 * s;       // darunter: Start-Knopf und Ankreuzfelder
    const tileW = Math.min((w - gap * (cols + 1)) / cols, (areaBottom - areaTop - gap * (rows - 1)) / rows * 0.95);
    const tileH = tileW * 1.05;
    const totalH = rows * tileH + (rows - 1) * gap;
    const y0 = areaTop + Math.max(0, (areaBottom - areaTop - totalH) / 2);

    this.tiles = [];
    MODES.forEach(([kind, label, color], i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const inRow = Math.min(cols, n - row * cols);          // letzte Reihe mittig
      let x1 = (w - (inRow * tileW + (inRow - 1) * gap)) / 2 + col * (tileW + gap);
      let y1 = y0 + row * (tileH + gap);
      let x2 = x1 + tileW, y2 = y1 + tileH;
      const sel = i === this.selected;
      if (sel) { x1 -= 8 * s; y1 -= 8 * s; x2 += 8 * s; y2 += 8 * s; }
      c.roundRect(x1 + 6 * s, y1 + 8 * s, x2 + 6 * s, y2 + 8 * s, 30 * s, { fill: SHADOW });
      c.roundRect(x1, y1, x2, y2, 30 * s, { fill: CARD, outline: sel ? color : "#EEE6D2", width: sel ? 10 * s : 3 * s });
      const tw = x2 - x1;
      drawModeSign(c, app, kind, (x1 + x2) / 2, y1 + tw * 0.29, tw * 0.42);
      drawVehicle(c, kind, (x1 + x2) / 2, y1 + tw * 0.70, tw * 0.75);
      let labelFont = app.font(Math.floor(tw / s * 0.12), "bold");
      if (labelFont.measure(label) > tw * 0.9) {
        labelFont = app.font(Math.floor(tw / s * 0.12 * tw * 0.9 / labelFont.measure(label)), "bold");
      }
      c.text((x1 + x2) / 2, y2 - tw * 0.13, label, labelFont, color);
      this.tiles.push([x1, y1, x2, y2]);
      app.hit(x1, y1, x2, y2, () => this.open(i));
    });
    this.cols = cols;

    // Start-Knopf: direkt am Startbahnhof losfahren
    const home = app.homeStation();
    const sel = this.selected === HomeScreen.START;
    let bw = Math.min(w - 80 * s, 720 * s), bh = 86 * s;
    let bx1 = (w - bw) / 2, by1 = h - 165 * s;
    if (sel) { bx1 -= 6 * s; by1 -= 6 * s; bw += 12 * s; bh += 12 * s; }
    const bx2 = bx1 + bw, by2 = by1 + bh;
    const green = "#2F855A";
    c.roundRect(bx1 + 5 * s, by1 + 7 * s, bx2 + 5 * s, by2 + 7 * s, 43 * s, { fill: SHADOW });
    c.roundRect(bx1, by1, bx2, by2, 43 * s, { fill: sel ? green : CARD, outline: green, width: (sel ? 8 : 3) * s });
    const fg = sel ? "white" : green;
    drawHouse(c, bx1 + 50 * s, (by1 + by2) / 2, 40 * s, fg);
    const tx = bx1 + 90 * s;
    c.text(tx, (by1 + by2) / 2 - 16 * s, "Starte in", app.font(16, "bold"), fg, "w");
    const nameFont = app.font(26, "bold");
    c.text(tx, (by1 + by2) / 2 + 12 * s, fitText(nameFont, app.data.stations[home], bx2 - tx - 30 * s), nameFont,
      sel ? "white" : TEXT, "w");
    this.startBox = [bx1, by1, bx2, by2];
    app.hit(bx1, by1, bx2, by2, () => this.start());

    // Ankreuzfelder für Eltern
    checkbox(app, c, 24 * s, h - 50 * s, "Umsteigen getrennt: S-Bahn, U-Bahn, Regio, ICE / Tram, Bus",
      app.separateModes(), () => this.toggle("separate_modes", app.separateModes()));
    checkbox(app, c, 24 * s, h - 22 * s, "Zeige ICE-Umstiege", app.showIce(),
      () => this.toggle("show_ice", app.showIce()));

    c.text(w - 24 * s, h - 22 * s, "Fahrplandaten: VBB (CC BY 4.0)", app.font(11), MUTED, "e");
  }

  toggle(setting, current) {
    const app = this.app;
    app.settings[setting] = !current;
    app.saveSettings();
    app.redraw();
  }

  open(i) {
    this.selected = i;
    this.app.show(new LinesScreen(this.app, MODES[i][0]));
  }

  /** Am Startbahnhof losfahren – dieselbe Auswahl wie beim Umsteigen. */
  start() {
    const app = this.app;
    const home = app.homeStation();
    const options = app.transfers.options(home);
    if (options.length === 1) {
      board(app, options[0], `Los geht's mit ${options[0].name}!`);
    } else if (options.length) {
      app.show(new ChangeScreen(app, `Start in ${app.data.stations[home]}: Womit fährst du los?`, options,
        () => app.show(new HomeScreen(app, HomeScreen.START)), "Los geht's mit {}!"));
    }
  }

  /** Elterntaste im Hauptmenü: Startbahnhof auf Lichterfelde Ost zurücksetzen (mit Rückfrage). */
  resetHome() {
    const app = this.app;
    if (!("home_station" in app.settings)) return;
    const reset = () => {
      delete app.settings.home_station;
      app.saveSettings();
      app.show(new HomeScreen(app, HomeScreen.START));
    };
    app.show(new ConfirmScreen(app, "Elternbereich: Startbahnhof zurücksetzen",
      [`Startbahnhof wieder auf „${DEFAULT_HOME}“ setzen?`, `Bisher: ${app.data.stations[app.homeStation()]}`],
      "Ja, zurücksetzen", reset, () => app.show(this)));
  }

  key(k, char) {
    const n = MODES.length;
    if (this.selected === HomeScreen.START) {
      if (k === "Up") this.selected = this.lastTile;
      else if (KEYS_OK.has(k)) return this.start();
      else if (k === PARENT_KEY) return this.resetHome();
      else return;
    } else if (k === "Right") {
      this.selected = (this.selected + 1) % n;
    } else if (k === "Left") {
      this.selected = (this.selected - 1 + n) % n;
    } else if (k === "Down") {
      // aus der unteren Kachelreihe geht es zum Start-Knopf
      this.lastTile = this.selected;
      const below = this.selected + this.cols;
      this.selected = below < n ? below : HomeScreen.START;
    } else if (k === "Up") {
      if (this.selected - this.cols >= 0) this.selected -= this.cols;
    } else if (KEYS_OK.has(k)) {
      return this.open(this.selected);
    } else if (k === PARENT_KEY) {
      return this.resetHome();
    } else if (char && "123456".slice(0, n).includes(char)) {
      return this.open(+char - 1);
    }
    if (this.selected < HomeScreen.START) this.lastTile = this.selected;
    this.app.redraw();
  }

  motion(x, y) {
    const boxes = this.tiles.map((b, i) => [i, b]);
    if (this.startBox) boxes.push([HomeScreen.START, this.startBox]);
    for (const [i, [x1, y1, x2, y2]] of boxes) {
      if (x1 <= x && x <= x2 && y1 <= y && y <= y2 && i !== this.selected) {
        this.selected = i;
        if (i < HomeScreen.START) this.lastTile = i;
        this.app.redraw();
      }
    }
  }
}
HomeScreen.START = MODES.length;      // Auswahl-Nummer des Start-Knopfs unter den Kacheln

class LinesScreen extends Screen {
  constructor(app, kind, selected = 0) {
    super(app);
    this.kind = kind;
    this.lines = app.data.lines[kind];
    this.selected = Math.min(selected, this.lines.length - 1);
    this.scroll = 0;
    this.scrollTarget = null;
    this.cards = [];
    this.cols = 1;
    this.typed = "";
    this.typedAt = 0;
    this.follow = true;
  }

  draw(c, w, h) {
    const app = this.app, s = app.s;
    const [kind, label, color] = MODE[this.kind];
    let hh = HEADER_H * s;

    const margin = 30 * s, gap = 22 * s;
    const cols = this.cols = Math.max(1, Math.floor((w - 2 * margin + gap) / (360 * s + gap)));
    const cardW = (w - 2 * margin - (cols - 1) * gap) / cols;
    const cardH = 130 * s;
    const rows = Math.ceil(this.lines.length / cols);
    const top = hh + 26 * s;
    const viewH = h - top;
    const contentH = rows * (cardH + gap) + gap;
    const maxScroll = Math.max(0, contentH - viewH);

    if (this.follow) {
      const ySel = Math.floor(this.selected / cols) * (cardH + gap);
      if (ySel < this.scroll) this.scrollTo(ySel);
      else if (ySel + cardH > this.scroll + viewH - gap) this.scrollTo(ySel + cardH - viewH + gap * 2);
      this.follow = false;
    }
    if (this.scrollTarget !== null) this.scrollTarget = Math.max(0, Math.min(maxScroll, this.scrollTarget));
    this.scroll = Math.max(0, Math.min(maxScroll, this.scroll));

    const badgeFont = app.font(30, "bold"), nameFont = app.font(19, "bold"), smallFont = app.font(15);
    const stations = app.data.stations;
    this.cards = [];
    this.lines.forEach((line, i) => {
      const row = Math.floor(i / cols), col = i % cols;
      const x1 = margin + col * (cardW + gap);
      const y1 = top + row * (cardH + gap) - this.scroll;
      if (y1 > h || y1 + cardH < top - cardH) return;
      const x2 = x1 + cardW, y2 = y1 + cardH;
      const sel = i === this.selected;
      c.roundRect(x1 + 4 * s, y1 + 6 * s, x2 + 4 * s, y2 + 6 * s, 22 * s, { fill: SHADOW });
      c.roundRect(x1, y1, x2, y2, 22 * s, { fill: sel ? HIGHLIGHT : CARD, outline: sel ? color : "#EEE6D2", width: sel ? 7 * s : 2 * s });
      const bw = drawBadge(c, x1 + 22 * s, (y1 + y2) / 2, line.name, line.color, kind, 64 * s, badgeFont);
      const tx = x1 + 22 * s + bw + 22 * s;
      const tw = x2 - tx - 18 * s;
      const d0 = line.directions[0];
      const first = d0[0], last = d0[d0.length - 1];
      c.text(tx, y1 + 40 * s, fitText(nameFont, stations[first], tw), nameFont, TEXT, "w");
      if (first === last) {
        c.text(tx, y1 + 90 * s, "↻  Ringfahrt", nameFont, TEXT, "w");
      } else {
        c.text(tx, y1 + 65 * s, "⇅", smallFont, MUTED, "w");
        c.text(tx, y1 + 90 * s, fitText(nameFont, stations[last], tw), nameFont, TEXT, "w");
      }
      this.cards.push([i, x1, Math.max(y1, top), x2, y2]);
      if (y2 > top) app.hit(x1, Math.max(y1, top), x2, y2, () => this.open(i));
    });

    // Kopfbereich zuletzt, damit er über den gescrollten Karten liegt
    c.rect(0, hh, w, top - 4 * s, BG);
    let left;
    [hh, left] = header(app, c, w, color, () => this.back());
    drawModeSign(c, app, kind, left + 60 * s, hh / 2, 62 * s);
    c.text(left + 105 * s, hh / 2, `${label}: Welche Linie nimmst du?`, app.font(30, "bold"), "white", "w");
    if (maxScroll > 0) {
      const barH = Math.max(40 * s, viewH * viewH / contentH);
      const barY = top + (viewH - barH) * (this.scroll / maxScroll);
      c.roundRect(w - 12 * s, barY, w - 4 * s, barY + barH, 4 * s, { fill: "#D8CFB8" });
    }
  }

  scrollTo(y) {
    this.scrollTarget = y;
    this.app.animate();
  }

  tick() {
    if (this.scrollTarget === null) return false;
    const d = this.scrollTarget - this.scroll;
    if (Math.abs(d) < 1) {
      this.scroll = this.scrollTarget;
      this.scrollTarget = null;
      return false;
    }
    this.scroll += d * 0.25;
    return true;
  }

  back() {
    this.app.show(new HomeScreen(this.app, MODES.findIndex(m => m[0] === this.kind)));
  }

  open(i) {
    this.selected = i;
    this.app.show(new RideScreen(this.app, this.kind, i, this));
  }

  key(k, char) {
    const n = this.lines.length;
    if (k === "Right") this.selected = Math.min(n - 1, this.selected + 1);
    else if (k === "Left") this.selected = Math.max(0, this.selected - 1);
    else if (k === "Down") this.selected = Math.min(n - 1, this.selected + this.cols);
    else if (k === "Up") this.selected = Math.max(0, this.selected - this.cols);
    else if (k === "Next") this.selected = Math.min(n - 1, this.selected + this.cols * 3);
    else if (k === "Prior") this.selected = Math.max(0, this.selected - this.cols * 3);
    else if (KEYS_OK.has(k)) return this.open(this.selected);
    else if (KEYS_BACK.has(k)) return this.back();
    else if (char && /^[0-9a-zäöü]$/i.test(char)) {
      // Liniennummer eintippen springt direkt zur Linie (z. B. "100")
      const t = now();
      this.typed = (t - this.typedAt < 1.5 ? this.typed : "") + char.toUpperCase();
      this.typedAt = t;
      // erst der volle Name („100“, „RE1“), sonst nur die Nummer („10“ findet „ICE 10“)
      const names = this.lines.map(line => line.name.toUpperCase().replace(/ /g, ""));
      for (const candidates of [names, names.map(n => n.replace(/^[A-Z]+/, ""))]) {
        const i = candidates.findIndex(n => n.startsWith(this.typed));
        if (i >= 0) { this.selected = i; break; }
      }
    } else return;
    this.follow = true;
    this.app.redraw();
  }

  wheel(delta) {
    this.scrollTarget = (this.scrollTarget !== null ? this.scrollTarget : this.scroll) - delta;
    this.app.animate();
  }

  drag(dy) {
    this.scrollTarget = null;
    this.scroll -= dy;
    this.app.redraw();
  }

  dragEnd(v) {
    // mit Schwung weiterrollen, wie man es vom Handy kennt
    if (Math.abs(v) > 0.2) this.scrollTo(this.scroll - v * 300);
  }

  motion(x, y) {
    for (const [i, x1, y1, x2, y2] of this.cards) {
      if (x1 <= x && x <= x2 && y1 <= y && y <= y2 && i !== this.selected) {
        this.selected = i;
        this.app.redraw();
      }
    }
  }
}

/** [Name, Taste, „wohin“] – Bus und Tram fahren auf den Betriebshof, Bahnen aufs Abstellgleis. */
function depotInfo(kind) {
  return kind === "bus" || kind === "tram" ? ["Betriebshof", "B", "auf den Betriebshof"] : ["Abstellgleis", "A", "aufs Abstellgleis"];
}

class RideScreen extends Screen {
  constructor(app, kind, lineIndex, linesScreen) {
    super(app);
    this.kind = kind;
    this.line = app.data.lines[kind][lineIndex];
    this.lineIndex = lineIndex;
    this.linesScreen = linesScreen;
    this.direction = 0;
    this.index = 0;
    this.pos = 0;            // animierte Position des Fahrzeugs
    this.scroll = null;
    this.backwards = false;  // Fahrzeug schaut nach links, wenn man zurückfährt
    this.message = ["Einsteigen, bitte!", now() + 2];
    this.lastWheel = 0;
    this.dragAcc = 0;
    this.v = 0;              // Tempo in der Cockpit-Ansicht (Stationen pro Sekunde)
    this.lastTick = 0;
    this.speed = 0;          // 0…1 für den Tacho
    this.depot = false;      // steht auf dem Betriebshof bzw. Abstellgleis hinter der Endstation
  }

  /** Wohin das Fahrzeug fährt: die Station – oder eine Zeile weiter auf Betriebshof/Abstellgleis. */
  get target() { return this.index + (this.depot ? 1 : 0); }

  atTerminus() { return !this.ring && (this.index === 0 || this.index === this.stops.length - 1); }

  depotHint() {
    const [name, key] = depotInfo(this.kind);
    this.say(`Pause auf dem ${name}. Zurück auf die Strecke: Taste ${key}`, 2.5);
    this.app.animate();
  }

  /** Taste B/A: an der Endhaltestelle auf den Betriebshof bzw. aufs Abstellgleis – und wieder zurück. */
  toggleDepot(key = null) {
    const [name, wanted, where] = depotInfo(this.kind);
    if (key && key.toUpperCase() !== wanted) {
      this.say(wanted === "A" ? "Bahnen fahren aufs Abstellgleis: Taste A" : `${MODE[this.kind][1]} fährt auf den Betriebshof: Taste B`, 2.5);
    } else if (this.depot) {
      // zurück auf die Strecke – gewendet, also in Gegenrichtung ab derselben Endhaltestelle
      const here = this.stops[this.index];
      this.depot = false;
      this.direction = 1 - this.direction;
      this.index = Math.max(0, this.stops.indexOf(here));
      this.pos = this.index - 1;
      this.backwards = false;
      this.scroll = null;
      this.say("Zurück auf der Strecke – nach " + this.app.data.stations[this.stops[this.stops.length - 1]], 3);
    } else if (this.ring) {
      this.say("Die Ringbahn hat keine Endhaltestelle.", 2.5);
    } else if (!this.atTerminus()) {
      this.say(`${wanted === "A" ? "Aufs" : "Auf den"} ${name} geht es nur an der Endhaltestelle.`, 2.5);
    } else {
      if (this.index === 0) {
        // am Anfang der Linie: erst wenden, damit der Betriebshof „hinter“ der Endstation liegt
        const here = this.stops[0];
        this.direction = 1 - this.direction;
        const i = this.stops.indexOf(here);
        this.index = i >= 0 ? i : this.stops.length - 1;
        this.pos = this.index;
        this.scroll = null;
      }
      this.depot = true;
      this.backwards = false;
      this.say(`Wir fahren ${where}.`, 2.5);
    }
    this.app.animate();
  }

  get cockpit() { return this.app.cockpit; }

  toggleCockpit() {
    this.app.cockpit = !this.app.cockpit;
    this.scroll = null;
    this.app.redraw();
    this.app.animate();
  }

  get stops() { return this.line.directions[this.direction]; }
  get ring() { const st = this.stops; return st[0] === st[st.length - 1]; }

  transferOptions(i = null) {
    const key = this.stops[i === null ? this.index : i];
    return this.app.transfers.options(key, [this.kind, this.lineIndex], this.app.transferKinds(this.kind));
  }

  draw(c, w, h) {
    if (this.cockpit) return drawCockpit(this, c, w, h);
    const app = this.app, s = app.s;
    const st = app.data.stations;
    const line = this.line, kind = this.kind, color = line.color;
    const stops = this.stops;
    const top = HEADER_H * s;

    // --- Liste der Stationen (links) ---------------------------------
    const panelW = Math.min(430 * s, w * 0.38);
    const listX2 = w - panelW - 20 * s;
    const viewH = h - top;
    const rowH = ROW_H * s;
    if (this.scroll === null) this.scroll = this.pos * rowH - (viewH / 2 - rowH / 2);
    const vehLen = 150 * s;
    const vehX = 34 * s + vehLen / 2;
    const trackX = vehX + vehLen / 2 + 36 * s;
    const nameX = trackX + 48 * s;
    const rowY = i => top + i * rowH - this.scroll + rowH / 2;

    const [depotName, depotKey] = depotInfo(kind);
    const curY = rowY(this.target);
    c.roundRect(24 * s, curY - rowH / 2 + 4 * s, listX2, curY + rowH / 2 - 4 * s, 18 * s, { fill: HIGHLIGHT });

    // Gleis
    const yFirst = rowY(0), yLast = rowY(stops.length - 1);
    const tw = 16 * s;
    if (this.depot || this.pos < 0) {
      // Betriebshof/Abstellgleis: grauer Abzweig hinter (bzw. beim Zurückkommen vor) der Endstation
      const dr = this.depot ? stops.length : -1, dy = rowY(dr);
      const ctx = c.ctx;
      ctx.setLineDash([6, 4]);
      c.line([[trackX, rowY(dr + (this.depot ? -1 : 1))], [trackX, dy]], { fill: "#9A9488", width: tw * 0.7 });
      ctx.setLineDash([]);
      const r = 15 * s;
      c.rect(trackX - r - 2.5 * s, dy - r - 2.5 * s, trackX + r + 2.5 * s, dy + r + 2.5 * s, "#6B6560");
      c.rect(trackX - r + 2.5 * s, dy - r + 2.5 * s, trackX + r - 2.5 * s, dy + r - 2.5 * s, "white");
      c.text(nameX, dy, `${depotName} (${st[stops[this.index]]})`, app.font(this.depot ? 26 : 22, this.depot ? "bold" : "normal"),
        this.depot ? TEXT : MUTED, "w");
    }
    c.line([[trackX, Math.max(top, yFirst)], [trackX, Math.min(h, yLast)]], { fill: color, width: tw, cap: "round" });
    if (this.pos > 0) {
      c.line([[trackX, Math.max(top, yFirst)], [trackX, rowY(this.pos)]], { fill: darker(color, 0.6), width: tw, cap: "round" });
    }

    const nameFont = app.font(22), curFont = app.font(26, "bold"), miniFont = app.font(13, "bold");
    stops.forEach((key, i) => {
      const y = rowY(i);
      if (y < top - rowH || y > h + rowH) return;
      const end = i === 0 || i === stops.length - 1;
      const r = (end ? 17 : 12) * s;
      c.oval(trackX - r, y - r, trackX + r, y + r, { fill: "white", outline: darker(color, 0.8), width: 5 * s });
      const current = i === this.index && !this.depot;
      const font = current ? curFont : nameFont;
      const fill = i >= this.index ? TEXT : MUTED;
      // Der Name hat Vorrang; Linienschilder bekommen höchstens 45 % der Breite
      const others = this.transferOptions(i);
      const widths = others.map(o => Math.max(30 * 1.6 * s, miniFont.measure(o.name) + 30 * 0.6 * s) + 6 * s);
      const rowW = listX2 - nameX - 16 * s;
      const badgeSpace = others.length ? Math.min(widths.reduce((a, b) => a + b, 0) + 14 * s, rowW * 0.45) : 0;
      const name = fitText(font, st[key], Math.max(80 * s, rowW - badgeSpace));
      c.text(nameX, y, name, font, fill, "w");
      let x = nameX + font.measure(name) + 14 * s;
      const plusW = miniFont.measure("+99") + 6 * s;
      for (let n = 0; n < others.length; n++) {
        const rest = others.length - n;
        if (x + widths[n] + (rest > 1 ? plusW : 0) > listX2 - 10 * s) {
          c.text(x, y, `+${rest}`, miniFont, MUTED, "w");
          break;
        }
        const o = others[n];
        x += drawBadge(c, x, y, o.name, o.color, o.kind, 30 * s, miniFont) + 6 * s;
      }
      app.hit(24 * s, y - rowH / 2, listX2, y + rowH / 2, () => this.goTo(i));
      if (current && others.length) {
        // Klick auf die Linienschilder der aktuellen Station = umsteigen
        app.hit(nameX + font.measure(name), y - rowH / 2, listX2, y + rowH / 2, () => this.change());
      }
    });

    // Fahrzeug
    drawVehicle(c, kind, vehX, rowY(this.pos) + 4 * s, vehLen, this.backwards);

    // Kopfzeile zuletzt, damit die Liste darunter verschwindet
    const [hh, left] = header(app, c, w, color, () => this.back());
    const badgeFont = app.font(34, "bold");
    const bx = left + 30 * s;
    const bw = drawBadge(c, bx, hh / 2, line.name, color, kind, 64 * s, badgeFont, 5 * s);
    const dest = this.ring ? "Ringfahrt ↻" : "nach " + st[stops[stops.length - 1]];
    const tf = app.font(28, "bold");
    c.text(bx + bw + 30 * s, hh / 2, fitText(tf, dest, w - (bx + bw + 60 * s)), tf, textColorFor(color), "w");

    // --- Infotafel (rechts) -----------------------------------------
    const px1 = w - panelW, px2 = w - 24 * s;
    const py = top + 24 * s;
    const pw = px2 - px1 - 48 * s;
    c.roundRect(px1 + 5 * s, py + 7 * s, px2 + 5 * s, h - 24 * s + 7 * s, 26 * s, { fill: SHADOW });
    c.roundRect(px1, py, px2, h - 24 * s, 26 * s, { fill: PANEL });
    const ix = px1 + 24 * s;
    const labelFont = app.font(14, "bold"), bigFont = app.font(26, "bold"), midFont = app.font(20, "bold");

    // Netzplan oben in der Tafel, mit dem aktuellen Standort
    const mapH = Math.min(pw * 0.68, (h - top) * 0.3);
    const coords = app.data.coords || {};
    const path = stops.filter(k => coords[k]).map(k => coords[k]);
    app.networkMap(kind).draw(c, ix - 8 * s, py + 16 * s, ix + pw + 8 * s, py + 16 * s + mapH, s,
      line.name, path, this.pos, MODE[kind][1], app.font(11, "bold"));
    let y = py + 16 * s + mapH + 24 * s;

    c.text(ix, y, "DU BIST HIER", labelFont, "#F7D117", "w");
    c.text(ix + pw, y, this.depot ? "Pause" : `Station ${this.index + 1} von ${stops.length}`, app.font(14), "#B8C4D0", "e");
    y += 22 * s;
    for (const ln of wrapText(bigFont, this.depot ? depotName : st[stops[this.index]], pw, 2)) {
      c.text(ix, y, ln, bigFont, "white", "nw");
      y += bigFont.linespace();
    }
    y += 14 * s;
    const last = this.index === stops.length - 1;
    if (this.depot || last) {
      let [title, info] = this.ring ? ["RUNDE GESCHAFFT", "Einmal rund um die Stadt!"] : ["ENDSTATION", "Bitte alle aussteigen!"];
      if (this.depot) [title, info] = ["PAUSE", `Zurück auf die Strecke: Taste ${depotKey}`];
      c.text(ix, y, title, labelFont, "#F7D117", "w");
      y += 22 * s;
      for (const ln of wrapText(midFont, info, pw, 2)) {
        c.text(ix, y, ln, midFont, "#9FE3B0", "nw");
        y += midFont.linespace();
      }
    } else {
      c.text(ix, y, "NÄCHSTER HALT", labelFont, "#F7D117", "w");
      y += 22 * s;
      for (const ln of wrapText(midFont, st[stops[this.index + 1]], pw, 2)) {
        c.text(ix, y, ln, midFont, "#CFE8FF", "nw");
        y += midFont.linespace();
      }
    }
    y += 12 * s;
    const barW = px2 - px1 - 48 * s;
    c.roundRect(ix, y, ix + barW, y + 14 * s, 7 * s, { fill: "#3A4A5C" });
    const frac = Math.max(0, Math.min(1, this.pos / Math.max(1, stops.length - 1)));
    if (frac > 0) c.roundRect(ix, y, ix + Math.max(14 * s, barW * frac), y + 14 * s, 7 * s, { fill: color });

    // Knöpfe: [Beschriftung, Aktion, aktiv, Farbe, Schriftfarbe, Schriftgröße]
    const buttons = [
      ["▲", () => this.prev(), this.index > 0 && !this.depot, "#F7D117", PANEL, 36],
      ["▼", () => this.next(), !last || this.ring, "#F7D117", PANEL, 36],
      ["Türen", () => this.doors(), true, "#E8483B", "white", 18],
      ["Ansage", () => this.announce(), true, "#3D8BD4", "white", 17],
      [depotKey, () => this.toggleDepot(), this.depot || this.atTerminus(), "#8E6BBF", "white", 30],
    ];
    const bgap = 12 * s;
    const bsize = Math.min(84 * s, (pw - (buttons.length - 1) * bgap) / buttons.length);
    const by2 = h - 50 * s;
    const btnY = by2 - bsize - 76 * s;
    const cx = (px1 + px2) / 2;
    let bx1 = cx - (buttons.length * bsize + (buttons.length - 1) * bgap) / 2;
    for (const [sym, cb, enabled, bg, fg, size] of buttons) {
      c.roundRect(bx1, btnY, bx1 + bsize, btnY + bsize, 24 * s, { fill: enabled ? bg : "#3A4A5C" });
      c.text(bx1 + bsize / 2, btnY + bsize / 2, sym, app.font(size, "bold"), enabled ? fg : "#5A6A7C");
      if (enabled) app.hit(bx1, btnY, bx1 + bsize, btnY + bsize, cb);
      bx1 += bsize + bgap;
    }
    const rbw = px2 - px1 - 48 * s, rbh = 56 * s, rby = by2 - rbh;
    c.roundRect(ix, rby, ix + rbw, rby + rbh, 28 * s, { fill: this.depot ? "#3A4A5C" : "white" });
    c.text(ix + rbw / 2, rby + rbh / 2, "⇄  Andere Richtung", app.font(20, "bold"), this.depot ? "#5A6A7C" : PANEL);
    if (!this.depot) app.hit(ix, rby, ix + rbw, rby + rbh, () => this.switchDirection());

    // Durchsage als Leuchtanzeige zwischen Fortschritt und Knöpfen
    let [text, until] = this.message;
    if (!(text && now() < until)) text = "";
    const boxY1 = y + 14 * s + 16 * s, boxY2 = btnY - 14 * s;
    if (boxY2 - boxY1 >= 40 * s) {
      c.roundRect(ix, boxY1, ix + pw, boxY2, 14 * s, { fill: "#11181F", outline: "#3A4A5C", width: 2 * s });
      const mf = app.font(boxY2 - boxY1 > 70 * s ? 22 : 19, "bold");
      let lines, font, fill;
      if (text) {
        [lines, font, fill] = [wrapText(mf, text, pw - 24 * s, 2), mf, "#FFB000"];
      } else if (this.depot) {
        [lines, font, fill] = [wrapText(mf, `Pause · Taste ${depotKey}: zurück`, pw - 24 * s, 2), mf, "#C8B6F0"];
        app.hit(ix, boxY1, ix + pw, boxY2, () => this.toggleDepot());
      } else if (last && !this.ring) {
        // an der Endstation: Betriebshof bzw. Abstellgleis anbieten
        [lines, font, fill] = [wrapText(mf, `Taste ${depotKey}: ${depotName}`, pw - 24 * s, 2), mf, "#C8B6F0"];
        app.hit(ix, boxY1, ix + pw, boxY2, () => this.toggleDepot());
      } else if (this.transferOptions().length) {
        // Auffordern, wenn man hier umsteigen kann
        [lines, font, fill] = [wrapText(mf, "Umsteigen? Drücke U", pw - 24 * s, 2), mf, "#7FD4FF"];
        app.hit(ix, boxY1, ix + pw, boxY2, () => this.change());
      } else {
        font = app.font(18);
        fill = "#5A6A7C";
        lines = wrapText(font, "↑ ↓ fahren · T Türen · V Ansage", pw - 24 * s, 2);
      }
      const lh = font.linespace();
      let ty = (boxY1 + boxY2) / 2 - lh * (lines.length - 1) / 2;
      for (const ln of lines) { c.text(cx, ty, ln, font, fill); ty += lh; }
    } else if (text) {
      // Sehr kleines Fenster: Durchsage über die Liste legen
      const mf = app.font(26, "bold");
      const mw = mf.measure(text) + 60 * s;
      const mx = (listX2 + 20 * s) / 2, my = h - 60 * s;
      c.roundRect(mx - mw / 2, my - 30 * s, mx + mw / 2, my + 30 * s, 30 * s, { fill: PANEL });
      c.text(mx, my, text, mf, "#FFB000");
    }
  }

  tick() {
    let moving = false;
    const d = this.target - this.pos;
    if (Math.abs(d) > 0.003) {
      let step;
      if (this.cockpit) {
        // Im Führerstand gemächlich: anfahren, rollen, vor der Station bremsen – nach echter Zeit
        const t = now(), dt = Math.min(0.1, Math.max(0.001, t - this.lastTick));
        this.lastTick = t;
        const target = Math.min(COCKPIT_SPEED, Math.max(0.12, Math.abs(d) * 2.4));
        this.v += (target - this.v) * Math.min(1, dt * 4);
        step = this.v * dt;
        this.speed = this.v / COCKPIT_SPEED;
      } else {
        step = Math.max(0.04, Math.abs(d) * 0.18);
      }
      this.pos += Math.sign(d) * Math.min(step, Math.abs(d));
      moving = true;
    } else {
      this.pos = this.target;
      this.v = 0;
      if (this.speed > 0.01) { this.speed *= 0.6; moving = true; } else this.speed = 0;
    }
    const s = this.app.s;
    const rowH = ROW_H * s, viewH = this.app.height - HEADER_H * s;
    const target = this.pos * rowH - (viewH / 2 - rowH / 2);
    if (this.scroll !== null && Math.abs(target - this.scroll) > 0.5) {
      this.scroll += (target - this.scroll) * 0.3;
      moving = true;
    }
    return moving || now() < this.message[1];
  }

  say(text, seconds = 1.6) {
    this.message = [text, now() + seconds];
  }

  goTo(i) {
    if (this.depot) return this.depotHint();
    if (i === this.index) return;
    this.backwards = i < this.index;
    if (this.index === 0 && i > 0) this.say("Zurückbleiben, bitte!");
    this.index = i;
    this.arrived();
    this.app.animate();
  }

  arrived() {
    if (this.index === this.stops.length - 1) {
      this.say(this.ring ? "Einmal rund um die Stadt!" : "Endstation – bitte alle aussteigen!", 3);
    }
  }

  next() {
    if (this.depot) return this.depotHint();
    const last = this.stops.length - 1;
    if (this.index === last && this.ring) {
      // Ringbahn: Start und Ziel sind derselbe Bahnhof, also einfach weiterfahren
      this.index = this.pos = 0;
      this.scroll = null;
    }
    if (this.index < last) {
      this.say("Zurückbleiben, bitte!", 1.4);
      this.backwards = false;
      this.index++;
      this.arrived();
      this.app.animate();
    }
  }

  prev() {
    if (this.depot) return this.depotHint();
    if (this.index === 0 && this.ring) {
      this.index = this.pos = this.stops.length - 1;
      this.scroll = null;
    }
    if (this.index > 0) {
      this.backwards = true;
      this.index--;
      this.say("");
      this.app.animate();
    }
  }

  doors() {
    const speech = { sbahn: "Zurückbleiben, bitte!", ubahn: "Zurückbleiben, bitte!",
      regio: "Bitte einsteigen. Vorsicht bei der Abfahrt!", ice: "Bitte einsteigen. Vorsicht bei der Abfahrt!" }[this.kind];
    this.app.sound.play(this.kind, speech);
    // Beim Bus zischt die Druckluft, wenn die Türen aufgehen
    this.say(this.kind === "bus" ? "Pssscht – Türen auf!" : "Türen schließen!", 2.5);
    this.app.animate();
  }

  /** Sagt die aktuelle Station an, wie im Fahrzeug. */
  announce() {
    if (this.depot) {
      const name = depotInfo(this.kind)[0];
      this.app.sound.speak(`${name}. Bitte nicht einsteigen.`);
      this.say(`Hier ist: ${name}`, 3);
      return this.app.animate();
    }
    const stops = this.stops;
    const name = this.app.data.stations[stops[this.index]];
    let text = spokenName(name) + ".";
    const others = this.transferOptions();
    if (others.length) {
      const prefix = { tram: "Tram ", bus: "Bus " };
      const names = others.slice(0, 8).map(o => (prefix[o.kind] || "") + spokenLine(o.name));
      text += " Umsteigen zu " + names.join(", ") + (others.length > 8 ? " und weiteren Linien." : ".");
    }
    if (this.index === stops.length - 1 && !this.ring) text += " Endstation. Bitte alle aussteigen.";
    this.app.sound.speak(text);
    this.say("Hier ist: " + name, 3);
    this.app.animate();
  }

  /** Taste U: umsteigen. Bei mehreren Möglichkeiten erscheint eine Auswahl. */
  change() {
    if (this.depot) return this.depotHint();
    const options = this.transferOptions();
    if (!options.length) {
      this.say("Hier kann man nicht umsteigen.", 2);
      this.app.animate();
    } else if (options.length === 1) {
      board(this.app, options[0], `Umgestiegen in ${options[0].name}!`);
    } else {
      const name = this.app.data.stations[this.stops[this.index]];
      this.app.show(new ChangeScreen(this.app, "Umsteigen an " + name, options, () => this.app.show(this)));
    }
  }

  switchDirection() {
    if (this.depot) return this.depotHint();
    const here = this.stops[this.index];
    this.direction = 1 - this.direction;
    const stops = this.stops;
    this.index = Math.max(0, stops.indexOf(here));
    if (this.ring && this.index === stops.length - 1) this.index = 0;
    this.pos = this.index;
    this.backwards = false;
    this.scroll = null;
    this.say("Richtung gewechselt!");
    this.app.animate();
  }

  back() {
    this.app.sound.stop();
    this.app.show(this.linesScreen);
  }

  key(k, char) {
    const c = (char || "").toLowerCase();
    if (KEYS_NEXT.has(k)) this.next();
    else if (KEYS_PREV.has(k)) this.prev();
    else if (KEYS_BACK.has(k)) this.back();
    else if (k === "Home") this.goTo(0);
    else if (k === "End") this.goTo(this.stops.length - 1);
    else if (c === "r") this.switchDirection();
    else if (c === "t") this.doors();
    else if (c === "v") this.announce();
    else if (c === "u") this.change();
    else if (c === "a" || c === "b") this.toggleDepot(c);
    else if (c === "f") this.toggleCockpit();
    else if (k === PARENT_KEY) this.setHome();
  }

  /** Elterntaste: aktuelle Haltestelle als Startbahnhof fürs Hauptmenü speichern (mit Rückfrage). */
  setHome() {
    const app = this.app;
    const key = this.stops[this.index];
    const name = app.data.stations[key], old = app.data.stations[app.homeStation()];
    const save = () => {
      app.settings.home_station = key;
      app.saveSettings();
      this.say("Neuer Startbahnhof: " + name, 3);
      app.show(this);
      app.animate();
    };
    app.show(new ConfirmScreen(app, "Elternbereich: Startbahnhof ändern",
      [`Soll „${name}“ der neue Startbahnhof im Hauptmenü werden?`, `Bisher: ${old}`],
      "Ja, speichern", save, () => app.show(this)));
  }

  /** Wischen in der Stationsliste: je eine Zeile Weg = eine Station weiter (nach oben wischen = vorwärts). */
  drag(dy) {
    const step = ROW_H * this.app.s;
    this.dragAcc += dy;
    while (this.dragAcc <= -step) { this.dragAcc += step; this.next(); }
    while (this.dragAcc >= step) { this.dragAcc -= step; this.prev(); }
  }

  dragEnd() {
    this.dragAcc = 0;
  }

  wheel(delta) {
    // Trackpads senden viele Ereignisse – höchstens eine Station je 0,25 s
    const t = now();
    if (t - this.lastWheel < 0.25) return;
    this.lastWheel = t;
    if (delta < 0) this.next(); else this.prev();
  }
}

// --------------------------------------------------------------------------
// Cockpit-Ansicht (Taste F): Blick nach vorn wie aus dem Führerstand
// --------------------------------------------------------------------------

const SEG = 60;               // so viele Meter liegen in der Szene zwischen zwei Stationen
const CAM_H = 2.4;            // Augenhöhe des Fahrers über den Schienen bzw. der Straße
const Z_NEAR = 1.2, Z_FAR = 140;
const VMAX = { sbahn: 100, ubahn: 70, tram: 60, bus: 50, regio: 160, ice: 300 };   // km/h am Tacho
const COCKPIT_SPEED = 0.7;    // höchstes Tempo in Stationen pro Sekunde – ca. 1,5 s von Station zu Station
const LED = "#FFA31A";        // Farbe der Leuchtschrift

/** Gleichbleibende Zufallszahl 0…1 für Bäume, Häuser usw. (gleiche Stelle = gleiches Objekt). */
function rnd(i, salt = 0) {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Einfache Zentralperspektive: X quer (rechts +), Y Höhe, Z Entfernung nach vorn (Meter). */
class Scene {
  constructor(c, x1, y1, x2, y2) {
    this.c = c;
    this.cx = (x1 + x2) / 2;
    this.hy = y1 + (y2 - y1) * 0.42;
    this.f = (x2 - x1) * 0.75;
  }
  p(X, Y, Z) {
    Z = Math.max(Z, Z_NEAR);
    return [this.cx + X * this.f / Z, this.hy + (CAM_H - Y) * this.f / Z];
  }
  poly(pts, fill, outline) {
    this.c.polygon(pts.map(([X, Y, Z]) => this.p(X, Y, Z)), { fill, outline, width: 2 });
  }
  /** Fläche auf dem Boden (oder in Höhe y), z. B. Schwelle, Fahrbahn, Bahnsteig. */
  ground(xa, xb, za, zb, fill, y = 0) {
    if (zb < Z_NEAR || za > Z_FAR) return;
    za = Math.max(za, Z_NEAR); zb = Math.min(zb, Z_FAR);
    this.poly([[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]], fill);
  }
  /** Senkrechte Wand längs der Strecke, z. B. Tunnelwand, Hauswand. */
  wall(x, ya, yb, za, zb, fill) {
    if (zb < Z_NEAR || za > Z_FAR) return;
    za = Math.max(za, Z_NEAR); zb = Math.min(zb, Z_FAR);
    this.poly([[x, ya, za], [x, yb, za], [x, yb, zb], [x, ya, zb]], fill);
  }
  /** Fläche, die dem Fahrer zugewandt ist, z. B. Mast, Schild. */
  front(xa, xb, ya, yb, z, fill, outline) {
    if (z > Z_NEAR && z < Z_FAR) this.poly([[xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z]], fill, outline);
  }
  size(meters, z) { return meters * this.f / Math.max(z, Z_NEAR); }
}

/** Betriebshof: große Halle quer zur Straße, mit offenen Toren und abgestellten Fahrzeugen. */
function drawDepotHall(c, app, sc, z, color, kind) {
  if (!(z > Z_NEAR && z < Z_FAR)) return;
  sc.front(-16, 16, 0, 9.5, z, "#B9A88E");
  sc.front(-16.5, 16.5, 9.5, 10.4, z, "#7A6A55");
  const body = MODE[kind][3][0];
  for (const gx of [-11.0, -4.5, 2.0, 8.5]) {
    sc.front(gx, gx + 5.0, 0, 6.0, z, "#2E3238");
    sc.front(gx + 0.6, gx + 4.4, 0.4, 3.4, z, body);                   // Fahrzeug von vorn
    sc.front(gx + 1.0, gx + 4.0, 1.9, 3.0, z, "#CFE8FF");               // Frontscheibe
  }
  stationSign(c, app, sc, -6.5, 6.5, 7.0, 8.9, z, "Betriebshof", color);
}

/** Abstellgleis: Prellbock am Gleisende, daneben abgestellte Züge (bei der U-Bahn im Tunnel). */
function drawSiding(c, app, sc, zd, zEnd, kind) {
  if (kind === "ubahn") {
    sc.front(-3.0, 3.0, 0, 4.6, zEnd, "#3A3B3E");                      // Tunnelende
  } else {
    sc.front(-40, 40, 0, 3.2, zEnd, "#5E8B4C");                        // Erdwall mit Büschen
    for (let k = -6; k <= 6; k++) {
      const [cx, cy] = sc.p(k * 3.2, 3.2, zEnd), r = sc.size(1.8, zEnd);
      c.oval(cx - r, cy - r, cx + r, cy + r, { fill: "#4F7F3F" });
    }
    // abgestellte Züge auf den Nachbargleisen
    const [body, accent] = MODE[kind][3];
    for (const [x1, x2] of [[4.4, 7.0], [-8.0, -5.4]]) {
      sc.ground(x1 + 0.3, x1 + 0.4, zd - 30, zEnd, "#C8C8C8", 0.06);
      sc.ground(x2 - 0.4, x2 - 0.3, zd - 30, zEnd, "#C8C8C8", 0.06);
      const nearX = x1 > 0 ? x1 : x2;
      sc.wall(nearX, 0.6, 3.9, zd + 8, zEnd - 1, body);
      sc.wall(nearX, 0.6, 1.0, zd + 8, zEnd - 1, accent);
      const side = nearX < 0 ? 0.02 : -0.02;
      for (let wz = zd + 10; wz < zEnd - 3; wz += 3.6) sc.wall(nearX + side, 2.2, 3.3, wz, wz + 2.4, "#CFE8FF");   // Fenster
      sc.front(x1, x2, 0.6, 3.9, zd + 8, body);
      sc.front(x1 + 0.4, x2 - 0.4, 2.3, 3.4, zd + 8, "#2B3440");
    }
  }
  // Prellbock: rot-weiß am Gleisende
  const zb = zEnd - 1.5;
  sc.front(-1.1, 1.1, 0, 1.3, zb, "#C62828");
  for (let k = 0; k < 4; k++) sc.front(-1.1 + k * 0.55, -0.85 + k * 0.55, 0.2, 1.1, zb, "white");
  sc.front(-0.9, 0.9, 1.3, 1.6, zb, "#3A3A3A");
}

/** Stationsschild, dem Fahrer zugewandt; der Name wird mit der Entfernung größer. */
function stationSign(c, app, sc, xa, xb, ya, yb, z, name, border) {
  if (!(z > Z_NEAR + 0.5 && z < Z_FAR)) return;
  sc.front(xa, xb, ya, yb, z, "white", border);
  const [ax, ay] = sc.p(xa, yb, z), [bx, by] = sc.p(xb, ya, z);
  const height = by - ay;
  if (height < 9) return;
  let px = height * 0.5 / app.s;
  let font = app.font(px, "bold");
  while (font.measure(name) > (bx - ax) * 0.92 && px > 6) { px *= 0.85; font = app.font(px, "bold"); }
  c.text((ax + bx) / 2, (ay + by) / 2, name, font, "#1E2A38");
}

/** Die Strecke vor dem Fahrzeug. Alles hängt von ride.pos ab – so zieht die Landschaft beim Fahren vorbei. */
function drawScene(ride, c, app, x1, y1, x2, y2) {
  const s = app.s, kind = ride.kind, st = app.data.stations, stops = ride.stops;
  const cam = ride.pos * SEG;
  const sc = new Scene(c, x1, y1, x2, y2);
  const tunnel = kind === "ubahn", city = kind === "tram" || kind === "bus";
  const railOut = ["sbahn", "regio", "ice"].includes(kind);
  const hy = sc.hy;

  // --- Himmel und Boden ---
  if (tunnel) {
    c.rect(x1, y1, x2, y2, "#0E1013");
  } else {
    const sky = ["#6FB6EA", "#82C0EE", "#96CAF1", "#AAD4F4", "#BFDFF6", "#D4EAF9"];
    const band = (hy - y1) / sky.length;
    sky.forEach((col, i) => c.rect(x1, y1 + i * band, x2, y1 + (i + 1) * band + 1, col));
    c.rect(x1, hy, x2, y2, city ? "#B3AEA4" : "#86B86A");
    if (city) {
      // Häuser am Horizont
      for (let k = 0; k < 14; k++) {
        const bx = x1 + (x2 - x1) * k / 14, bh = (0.04 + 0.08 * rnd(k, 3)) * (y2 - y1);
        c.rect(bx, hy - bh, bx + (x2 - x1) / 14 + 1, hy + 1, ["#C9C2B8", "#BDB6C4", "#B8C6C9", "#CFC4B0"][k % 4]);
      }
    } else {
      // Hügel in der Ferne
      const pts = [[x1, hy]];
      for (let k = 0; k < 13; k++) pts.push([x1 + (x2 - x1) * k / 12, hy - (0.02 + 0.05 * rnd(k, 5)) * (y2 - y1)]);
      pts.push([x2, hy]);
      c.polygon(pts, { fill: "#6FA35C" });
    }
  }

  // --- Fahrweg ---
  if (tunnel) {
    sc.wall(-3.0, 0, 4.6, Z_NEAR, Z_FAR, "#2A2B2E");
    sc.wall(3.0, 0, 4.6, Z_NEAR, Z_FAR, "#2A2B2E");
    sc.ground(-3.0, 3.0, Z_NEAR, Z_FAR, "#1E1F22", 4.6);
    sc.ground(-3.0, 3.0, Z_NEAR, Z_FAR, "#3A3632");
  }
  if (railOut) sc.ground(-5.6, 2.2, Z_NEAR, Z_FAR, "#8E8578");             // Schotter für beide Gleise
  if (city) {
    sc.ground(-7.0, 2.3, Z_NEAR, Z_FAR, "#5C5E63");                         // Fahrbahn
    sc.ground(2.3, 7.0, Z_NEAR, Z_FAR, "#CBC5B8");                          // Gehweg rechts
    sc.ground(-10.0, -7.0, Z_NEAR, Z_FAR, "#CBC5B8");                       // Gehweg links
    sc.ground(2.2, 2.4, Z_NEAR, Z_FAR, "#E8E8E8", 0.02);                    // Bordstein
  }

  /** Positionen [Index, Abstand nach vorn] von Dingen, die alle spacing Meter wiederkehren. */
  function periodic(spacing, offset = 0) {
    const out = [];
    for (let k = Math.floor((cam + Z_NEAR - offset) / spacing); ; k++) {
      const z = k * spacing + offset - cam;
      if (z > Z_FAR) return out;
      if (z >= Z_NEAR - spacing) out.push([k, z]);
    }
  }

  if (kind === "bus") {
    for (const [, z] of periodic(9)) sc.ground(-2.45, -2.25, z, z + 4, "#F2F2F2", 0.02);     // Mittellinie
  } else if (kind === "tram") {
    for (const [, z] of periodic(6)) sc.ground(-7.0, 2.3, z, z + 0.15, "#686A70", 0.01);     // Fugen
  } else {
    const wood = tunnel ? "#3D3B39" : "#6B5444";
    for (const [, z] of periodic(2)) {
      sc.ground(-1.25, 1.25, z, z + 0.35, wood, 0.02);                                       // Schwellen
      if (railOut) sc.ground(-5.05, -2.55, z, z + 0.35, wood, 0.02);                         // Nachbargleis
    }
  }
  if (kind !== "bus") {
    const rail = city ? "#9A9A9A" : "#D6D6D6";
    for (const X of [-0.75, 0.75]) sc.ground(X - 0.05, X + 0.05, Z_NEAR, Z_FAR, rail, 0.06);
    if (railOut) for (const X of [-4.55, -3.05]) sc.ground(X - 0.05, X + 0.05, Z_NEAR, Z_FAR, "#C8C8C8", 0.06);
    if (kind === "sbahn") sc.ground(1.45, 1.6, Z_NEAR, Z_FAR, "#7C7C7C", 0.15);              // Stromschiene
  }

  // --- Betriebshof bzw. Abstellgleis hinter der Endstation ---
  // Was dahinter liegt, ist verdeckt: Häuser, Bäume und Masten werden dort nicht mehr gezeichnet.
  let zEnd = Z_FAR + 100;
  if (ride.depot) {
    const zd = stops.length * SEG - cam;
    if (city) { zEnd = zd + 34; drawDepotHall(c, app, sc, zEnd, MODE[kind][2], kind); }
    else { zEnd = zd + 30; drawSiding(c, app, sc, zd, zEnd, kind); }
  }

  // --- Dinge am Rand, von hinten nach vorn gezeichnet ---
  const items = [];
  const houses = [];      // Häuserzeilen liegen ganz außen und werden zuerst gezeichnet

  if (["regio", "ice", "tram"].includes(kind)) {
    // Oberleitung: Draht und Masten
    c.line([sc.p(0, 5.6, Z_NEAR), sc.p(0, 5.6, Z_FAR)], { fill: "#2E2E2E", width: Math.max(1, 2 * s) });
    const mastX = kind !== "tram" ? -2.8 : 2.9;
    for (const [, z] of periodic(30, 7)) {
      items.push([z, () => {
        sc.front(mastX - 0.12, mastX + 0.12, 0, 6.3, z, "#5A5F66");
        sc.front(Math.min(mastX, 0.2), Math.max(mastX, -0.2), 5.75, 5.95, z, "#5A5F66");
      }]);
    }
  }
  const nearStation = z => {
    const rel = (z + cam) / SEG, i = Math.round(rel);
    return i >= 0 && i < stops.length && Math.abs(rel - i) * SEG < 40;
  };
  if (tunnel) {
    for (const [, z] of periodic(8)) {
      if (nearStation(z)) continue;      // in der Bahnhofshalle ist es ohnehin hell
      items.push([z, () => {
        sc.wall(-2.98, 3.5, 3.8, z, z + 1.4, "#FFE9A8");
        sc.wall(2.98, 3.5, 3.8, z, z + 1.4, "#FFE9A8");
      }]);
    }
  } else {
    for (const [k, z] of periodic(13, 4)) {
      if (rnd(k, 1) < 0.35) continue;
      const side = rnd(k, 2) < 0.5 ? -1 : 1;
      let X = side * (10 + 6 * rnd(k, 4));                                   // nicht auf Gleis oder Bahnsteig
      if (city) X = side > 0 ? 4 + rnd(k, 4) * 2 : -(7.6 + rnd(k, 4) * 1.6);  // auf dem Gehweg
      items.push([z, () => {
        sc.front(X - 0.18, X + 0.18, 0, 2.4, z, "#6B4A2E");
        const [cx, cy] = sc.p(X, 4.0, z), r = sc.size(1.9 + 0.6 * rnd(k, 6), z);
        c.oval(cx - r, cy - r, cx + r, cy + r, { fill: ["#4F8F3F", "#5E9C46", "#477F38"][((k % 3) + 3) % 3] });
      }]);
    }
  }
  if (city) {
    const colors = ["#D9B38C", "#C98D7A", "#E6D3A3", "#B7C3C9", "#D7A9A0", "#C2B59B"];
    for (const [k, z] of periodic(12)) {
      for (const side of [-1, 1]) {
        const X = side < 0 ? -10 : 7, height = 9 + 9 * rnd(k, 7 + side);
        const col = colors[Math.floor(rnd(k, 9 + side) * colors.length)];
        houses.push([z + 11.5, () => {
          sc.wall(X, 0, height, z, z + 11.5, col);
          if (z < 45) {
            for (let fy = 1; fy < Math.min(4, Math.floor(height / 3)); fy++) {
              for (const wz of [2.5, 7.5]) sc.wall(X + (X > 0 ? 0.05 : -0.05), fy * 3 - 0.2, fy * 3 + 1.1, z + wz, z + wz + 1.4, "#5B7590");
            }
          }
        }]);
      }
    }
  }

  // --- Stationen ---
  const signBorder = MODE[kind][2];
  for (let i = Math.floor(ride.pos) - 1; i < Math.floor(ride.pos) + 3; i++) {
    if (i < 0 || i >= stops.length) continue;
    const zs = i * SEG - cam, name = st[stops[i]];
    const za = zs - 12, zb = zs + 28;        // 40 m Bahnsteig, dazwischen freie Strecke
    if (zb < Z_NEAR || za > Z_FAR) continue;
    if (city) {
      items.push([zb, () => {
        if (kind === "tram") {
          sc.ground(1.4, 3.6, za, zb, "#B0AAA0", 0.25);
          sc.wall(1.4, 0, 0.25, za, zb, "#8C857A");
        }
        const poleZ = zs + 12;
        sc.front(2.95, 3.05, 0, 3.6, poleZ, "#6F7378");
        stationSign(c, app, sc, 3.1, 6.4, 2.0, 2.7, poleZ, name, "#2F8F4E");
        if (poleZ > Z_NEAR && poleZ < Z_FAR) {
          // das gelbe Berliner Haltestellenschild mit grünem H
          const [hx, hy2] = sc.p(3.0, 3.6, poleZ), r = sc.size(0.45, poleZ);
          c.oval(hx - r, hy2 - r, hx + r, hy2 + r, { fill: "#F7D117", outline: "#2F8F4E", width: Math.max(1, r * 0.15) });
          if (r > 5) c.text(hx, hy2, "H", app.font(r * 1.3 / s, "bold"), "#2F8F4E");
        }
      }]);
    } else {
      items.push([zb, () => {
        if (tunnel) {
          // helle Bahnhofshalle statt Tunnel
          const tiles = ["#D8E2D0", "#E3D9C6", "#CFDDE6", "#E6D0CF"][i % 4];
          sc.wall(8.0, 0, 4.8, za, zb, tiles);
          sc.wall(-3.0, 0, 4.6, za, zb, tiles);
          sc.ground(-3.0, 8.0, za, zb, "#EFEDE6", 4.7);
          for (let lz = Math.trunc(za); lz < zb; lz += 6) sc.ground(-1.0, 6.0, lz, lz + 1.2, "#FFF6D8", 4.68);
        }
        sc.ground(2.0, 8.0, za, zb, "#B9B2A6", 1.0);
        sc.wall(2.0, 0, 1.0, za, zb, "#8C857A");
        sc.ground(2.0, 2.4, za, zb, "#F4F4F4", 1.01);
        if (!tunnel) {
          for (let pz = Math.trunc(za) + 4; pz < zb; pz += 9) sc.front(5.0, 5.18, 1.0, 4.3, pz, "#6F7378");
          sc.ground(2.8, 8.0, za, zb, "#7A8088", 4.3);
        }
        stationSign(c, app, sc, 2.7, 7.0, 2.4, 3.4, zs + 14, name, signBorder);
      }]);
    }
  }

  const byDistance = (a, b) => b[0] - a[0];
  const visibleHouses = houses.filter(it => it[0] - 11.5 < zEnd), visibleItems = items.filter(it => it[0] < zEnd);
  for (const [, fn] of visibleHouses.sort(byDistance).concat(visibleItems.sort(byDistance))) fn();
}

/** Echter runder Knopf im Armaturenbrett. */
function roundButton(app, c, cx, cy, r, color, symbol, label, enabled, callback, glow = false) {
  const s = app.s;
  const col = enabled ? color : "#4B5058";
  c.oval(cx - r - 4 * s, cy - r, cx + r + 4 * s, cy + r + 8 * s, { fill: "#1B1E23" });
  if (glow) c.oval(cx - r - 7 * s, cy - r - 7 * s, cx + r + 7 * s, cy + r + 7 * s, { outline: "#7FD4FF", width: 3 * s });
  c.oval(cx - r - 3 * s, cy - r - 3 * s, cx + r + 3 * s, cy + r + 3 * s, { fill: "#8B9099" });
  c.oval(cx - r, cy - r, cx + r, cy + r, { fill: darker(col, 0.8) });
  c.oval(cx - r * 0.86, cy - r * 0.92, cx + r * 0.86, cy + r * 0.8, { fill: col });
  c.oval(cx - r * 0.5, cy - r * 0.75, cx + r * 0.1, cy - r * 0.45, { fill: tint(col, 0.45) });
  const fg = enabled ? textColorFor(col) : "#7A808A";
  c.text(cx, cy, symbol, app.font(symbol.length <= 2 ? r * 0.75 / s : r * 0.42 / s, "bold"), fg);
  c.text(cx, cy + r + 14 * s, label, app.font(13, "bold"), enabled ? "#C9CED6" : "#6B7079");
  if (enabled) app.hit(cx - r - 6 * s, cy - r - 6 * s, cx + r + 6 * s, cy + r + 22 * s, callback);
}

/** Tacho mit Nadel und Ziffern. */
function drawGauge(app, c, cx, cy, radius, speed, vmax) {
  const s = app.s;
  c.oval(cx - radius - 8 * s, cy - radius - 8 * s, cx + radius + 8 * s, cy + radius + 8 * s,
    { fill: "#15181C", outline: "#8B9099", width: 3 * s });
  const a0 = 225 * Math.PI / 180, a1 = -45 * Math.PI / 180;    // von links unten über oben nach rechts unten
  const steps = 5;
  for (let i = 0; i <= steps * 2; i++) {
    const a = a0 + (a1 - a0) * i / (steps * 2);
    const r1 = radius * (i % 2 === 0 ? 0.78 : 0.86);
    c.line([[cx + Math.cos(a) * r1, cy - Math.sin(a) * r1], [cx + Math.cos(a) * radius * 0.95, cy - Math.sin(a) * radius * 0.95]],
      { fill: "#E6E6E6", width: Math.max(1, (i % 2 === 0 ? 2.5 : 1.2) * s) });
    if (i % 2 === 0) {
      c.text(cx + Math.cos(a) * radius * 0.6, cy - Math.sin(a) * radius * 0.6, String(Math.round(vmax * i / (steps * 2))),
        app.font(Math.max(9, radius * 0.14 / s), "bold"), "#E6E6E6");
    }
  }
  const a = a0 + (a1 - a0) * Math.max(0, Math.min(1, speed / vmax));
  c.line([[cx, cy], [cx + Math.cos(a) * radius * 0.88, cy - Math.sin(a) * radius * 0.88]], { fill: "#FF5A3C", width: Math.max(2, 4 * s), cap: "round" });
  c.oval(cx - 7 * s, cy - 7 * s, cx + 7 * s, cy + 7 * s, { fill: "#C9CED6" });
  c.text(cx, cy + radius * 0.62, `${Math.round(speed)} km/h`, app.font(Math.max(9, radius * 0.13 / s), "bold"), LED);
}

/** Führerstand: Fenster mit Strecke, Zielanzeige oben, Armaturenbrett mit Knöpfen unten. */
function drawCockpit(ride, c, w, h) {
  const app = ride.app, s = app.s, st = app.data.stations;
  const line = ride.line, kind = ride.kind, stops = ride.stops;
  const last = ride.index === stops.length - 1;
  const frame = "#2B2F36", accent = readable(line.color);

  const topH = 112 * s, dashTop = h * 0.6, pillar = 30 * s;
  const wx1 = pillar, wy1 = topH, wx2 = w - pillar, wy2 = dashTop + 30 * s;
  drawScene(ride, c, app, wx1, wy1, wx2, wy2);

  // Fensterrahmen (deckt alles ab, was über das Fenster hinausragt)
  c.rect(0, 0, w, wy1, frame);
  c.rect(0, 0, wx1, h, frame);
  c.rect(wx2, 0, w, h, frame);
  c.roundRect(wx1 - 10 * s, wy1 - 10 * s, wx2 + 10 * s, wy2 + 10 * s, 30 * s, { outline: frame, width: 22 * s });
  c.rect(0, topH - 8 * s, w, topH - 2 * s, accent);
  // Scheibenwischer
  c.line([[wx1 + (wx2 - wx1) * 0.32, wy2 - 6 * s], [wx1 + (wx2 - wx1) * 0.12, wy2 - 70 * s]], { fill: "#1B1E23", width: Math.max(2, 5 * s), cap: "round" });

  // --- Zielanzeige an der Decke ---
  const dx1 = 220 * s, dx2 = w - 220 * s, dy1 = 12 * s, dy2 = topH - 20 * s;
  c.roundRect(dx1, dy1, dx2, dy2, 10 * s, { fill: "#0B0B0B", outline: "#45494F", width: 3 * s });
  const bw = drawBadge(c, dx1 + 16 * s, (dy1 + dy2) / 2, line.name, line.color, kind, 46 * s, app.font(24, "bold"));
  const ledBig = app.font(26, "bold"), ledSmall = app.font(19, "bold");
  const tx = dx1 + 16 * s + bw + 18 * s, tw = dx2 - tx - 14 * s;
  const dest = ride.ring ? "Ringfahrt ↻" : st[stops[stops.length - 1]];
  c.text(tx, dy1 + 24 * s, fitText(ledBig, dest, tw), ledBig, LED, "w");
  const [text, until] = ride.message;
  const [depotName, depotKey] = depotInfo(kind);
  let second;
  if (text && now() < until) second = text;
  else if (ride.depot) second = `${depotName} – Pause. Zurück: Taste ${depotKey}`;
  else if (last) second = ride.ring ? "Einmal rund um die Stadt!" : "Endstation – bitte alle aussteigen";
  else second = "Nächster Halt: " + st[stops[ride.index + 1]];
  c.text(tx, dy2 - 20 * s, fitText(ledSmall, second, tw), ledSmall, "#FFD27A", "w");

  // Kleine Knöpfe oben: Zurück und Ansicht wechseln
  const smallButton = (x1, label, cb) => {
    const bw2 = 180 * s, bh2 = 50 * s, by = (topH - 8 * s - bh2) / 2;
    c.roundRect(x1, by, x1 + bw2, by + bh2, 25 * s, { fill: "#454A53" });
    c.text(x1 + bw2 / 2, by + bh2 / 2, label, app.font(18, "bold"), "white");
    app.hit(x1, by, x1 + bw2, by + bh2, cb);
  };
  smallButton(20 * s, "◀  Zurück", () => ride.back());
  smallButton(w - 200 * s, "F  Normale Ansicht", () => ride.toggleCockpit());

  // --- Armaturenbrett ---
  c.polygon([[0, dashTop + 40 * s], [w * 0.12, dashTop], [w * 0.88, dashTop], [w, dashTop + 40 * s], [w, h], [0, h]], { fill: "#3A3F48" });
  c.line([[w * 0.12, dashTop], [w * 0.88, dashTop]], { fill: accent, width: Math.max(2, 4 * s) });
  const pad = 22 * s, py1 = dashTop + 28 * s, py2 = h - 18 * s, ph = py2 - py1;
  const innerW = w - 2 * pad, gap = 18 * s;
  const mapW = innerW * 0.25, gaugeW = innerW * 0.14, listW = innerW * 0.25;
  const btnW = innerW - mapW - gaugeW - listW - 3 * gap;
  let x = pad;

  // Bildschirm mit Netzplan
  c.roundRect(x, py1, x + mapW, py2, 14 * s, { fill: "#15181C", outline: "#8B9099", width: 2 * s });
  const coords = app.data.coords || {};
  const path = stops.filter(k => coords[k]).map(k => coords[k]);
  app.networkMap(kind).draw(c, x + 8 * s, py1 + 8 * s, x + mapW - 8 * s, py2 - 8 * s, s, line.name, path, ride.pos,
    MODE[kind][1], app.font(11, "bold"));
  x += mapW + gap;

  // Tacho
  const radius = Math.min(gaugeW / 2 - 10 * s, ph / 2 - 10 * s);
  drawGauge(app, c, x + gaugeW / 2, py1 + ph / 2 + 4 * s, radius, ride.speed * VMAX[kind], VMAX[kind]);
  x += gaugeW + gap;

  // Stationsanzeige
  c.roundRect(x, py1, x + listW, py2, 14 * s, { fill: "#0B0B0B", outline: "#8B9099", width: 2 * s });
  c.text(x + 14 * s, py1 + 18 * s, "STATIONEN", app.font(12, "bold"), LED, "w");
  c.text(x + listW - 14 * s, py1 + 18 * s, `${ride.index + 1} / ${stops.length}`, app.font(12, "bold"), LED, "e");
  const rowH = (ph - 40 * s) / 5;
  let ry = py1 + 34 * s;
  const mini = app.font(11, "bold");
  if (ride.depot) {
    c.text(x + listW / 2, py1 + ph * 0.45, depotName.toUpperCase(), app.font(22, "bold"), LED);
    c.text(x + listW / 2, py1 + ph * 0.62, `Pause · Taste ${depotKey}: zurück`, app.font(14, "bold"), "#FFD27A");
  }
  for (let i = ride.index - 1; i < ride.index + 4; i++) {
    if (ride.depot || i < 0 || i >= stops.length) continue;
    const cur = i === ride.index;
    const font = app.font(cur ? 17 : 14, cur ? "bold" : "normal");
    const cy = ry + rowH / 2;
    if (cur) c.roundRect(x + 6 * s, ry + 2 * s, x + listW - 6 * s, ry + rowH - 2 * s, 8 * s, { fill: "#3A2A0A" });
    const fill = cur ? "#FFD27A" : (i < ride.index ? "#6E6A60" : "#E8E2D0");
    let bx = x + listW - 10 * s;
    const shown = [];
    for (const o of ride.transferOptions(i).slice(0, 3)) {
      const ww = Math.max(22 * 1.6 * s, mini.measure(o.name) + 22 * 0.6 * s);
      if (bx - ww < x + listW * 0.55) break;
      bx -= ww + 4 * s;
      shown.push([bx, o]);
    }
    const name = fitText(font, (cur ? "▶ " : "   ") + st[stops[i]], (shown.length ? bx : x + listW - 10 * s) - (x + 12 * s) - 6 * s);
    c.text(x + 12 * s, cy, name, font, fill, "w");
    for (const [bx2, o] of shown) drawBadge(c, bx2 + 4 * s, cy, o.name, o.color, o.kind, 22 * s, mini);
    app.hit(x, ry, x + listW, ry + rowH, () => ride.goTo(i));
    ry += rowH;
  }
  x += listW + gap;

  // Knöpfe
  const canChange = ride.transferOptions().length > 0 && !ride.depot;
  const buttons = [
    ["▲", "Zurück", () => ride.prev(), (ride.index > 0 || ride.ring) && !ride.depot, "#F7D117"],
    ["▼", "Weiter", () => ride.next(), !last || ride.ring, "#F7D117"],
    ["U", "Umsteigen", () => ride.change(), canChange, "#2F9E5B"],
    ["Türen", "Türen", () => ride.doors(), true, "#E8483B"],
    ["V", "Ansage", () => ride.announce(), true, "#3D8BD4"],
    ["⇄", "Richtung", () => ride.switchDirection(), !ride.depot, "#E8E8E8"],
    [depotKey, depotName, () => ride.toggleDepot(), ride.depot || ride.atTerminus(), "#8E6BBF"],
  ];
  const cellW = btnW / 4, cellH = ph / 2;
  const r = Math.max(14 * s, Math.min(cellW * 0.3, cellH * 0.3));
  buttons.forEach(([sym, label, cb, enabled, color], n) => {
    const glow = (sym === "U" && canChange) || (sym === depotKey && (ride.depot || last) && enabled);
    roundButton(app, c, x + cellW * (n % 4 + 0.5), py1 + cellH * Math.floor(n / 4) + cellH * 0.42, r, color, sym, label,
      enabled, cb, glow);
  });
}

/** In die Linie opt (aus Transfers.options) einsteigen, an der passenden Haltestelle. */
function board(app, opt, message) {
  const linesScreen = new LinesScreen(app, opt.kind, opt.index);
  const ride = new RideScreen(app, opt.kind, opt.index, linesScreen);
  ride.direction = opt.direction;
  ride.index = opt.stop;
  ride.pos = opt.stop;
  ride.say(message, 2.5);
  app.sound.stop();
  app.show(ride);
  app.animate();
}

/** Großer Kasten über dem ganzen Fenster; Klick daneben = abbrechen. Gibt die Ecken zurück. */
function dialogCard(app, c, w, h, cancel) {
  const s = app.s;
  c.rect(0, 0, w, h, "#2B3440");
  app.hit(0, 0, w, h, cancel);
  const x1 = 40 * s, y1 = 40 * s, x2 = w - 40 * s, y2 = h - 40 * s;
  c.roundRect(x1, y1, x2, y2, 30 * s, { fill: BG });
  app.hit(x1, y1, x2, y2, () => {});   // Klick auf den Kasten selbst schließt nicht
  return [x1, y1, x2, y2];
}

function bigButton(app, c, cx, cy, text, selected, callback, color = "#2B6CB0", width = 260) {
  const s = app.s;
  const bw = width * s, bh = 60 * s, x1 = cx - bw / 2, y1 = cy - bh / 2;
  c.roundRect(x1, y1, x1 + bw, y1 + bh, 30 * s, { fill: selected ? color : "white", outline: color, width: (selected ? 5 : 2) * s });
  c.text(cx, cy, text, app.font(20, "bold"), selected ? "white" : TEXT);
  app.hit(x1, y1, x1 + bw, y1 + bh, callback);
  return [x1, y1, x1 + bw, y1 + bh];
}

/** Auswahl der Linie beim Umsteigen (und beim Start am Startbahnhof). */
class ChangeScreen extends Screen {
  constructor(app, title, options, back, message = "Umgestiegen in {}!") {
    super(app);
    this.title = title;
    this.options = options;
    this.back = back;
    this.message = message;
    this.pick = 0;
    this.cols = 1;
    this.tiles = [];
    this.firstRow = 0;        // oberste sichtbare Reihe
    this.followPick = true;   // nach Tastendruck die Auswahl sichtbar halten
    this.rowStep = 1;
    this.dragAcc = 0;
  }

  draw(c, w, h) {
    const app = this.app, s = app.s;
    const st = app.data.stations;
    const [x1, y1, x2, y2] = dialogCard(app, c, w, h, this.back);
    const titleFont = app.font(34, "bold");
    c.text(w / 2, y1 + 50 * s, fitText(titleFont, this.title, x2 - x1 - 60 * s), titleFont, TEXT);
    c.text(w / 2, y1 + 92 * s, "Wähle mit den Pfeiltasten und drücke Enter", app.font(18), MUTED);
    const by = bigButton(app, c, w / 2, y2 - 54 * s, "✕  Doch nicht", false, this.back)[1];

    // Kacheln mit Verkehrsmittel, Linienschild und Ziel
    const tileW = 230 * s, tileH = 150 * s, gap = 18 * s;
    const areaX1 = x1 + 30 * s, areaX2 = x2 - 30 * s;
    const areaY1 = y1 + 140 * s, areaY2 = by - 20 * s;
    const cols = this.cols = Math.max(1, Math.floor((areaX2 - areaX1 + gap) / (tileW + gap)));
    const rowsVisible = Math.max(1, Math.floor((areaY2 - areaY1 + gap) / (tileH + gap)));
    const totalRows = Math.ceil(this.options.length / cols);
    const pickRow = Math.floor(this.pick / cols);
    if (this.followPick) {
      if (pickRow < this.firstRow) this.firstRow = pickRow;
      if (pickRow >= this.firstRow + rowsVisible) this.firstRow = pickRow - rowsVisible + 1;
      this.followPick = false;
    }
    this.firstRow = Math.max(0, Math.min(this.firstRow, totalRows - rowsVisible));
    const firstRow = this.firstRow;
    this.rowStep = tileH + gap;
    const usedCols = Math.min(cols, this.options.length);
    const left = (x1 + x2) / 2 - (usedCols * tileW + (usedCols - 1) * gap) / 2;

    const badgeFont = app.font(30, "bold"), destFont = app.font(16, "bold"), smallFont = app.font(14);
    this.tiles = [];
    this.options.forEach((opt, n) => {
      const row = Math.floor(n / cols), col = n % cols;
      if (row < firstRow || row >= firstRow + rowsVisible) return;
      const tx = left + col * (tileW + gap);
      const ty = areaY1 + (row - firstRow) * (tileH + gap);
      const sel = n === this.pick;
      c.roundRect(tx + 4 * s, ty + 6 * s, tx + tileW + 4 * s, ty + tileH + 6 * s, 20 * s, { fill: SHADOW });
      c.roundRect(tx, ty, tx + tileW, ty + tileH, 20 * s,
        { fill: sel ? HIGHLIGHT : CARD, outline: sel ? MODE[opt.kind][2] : "#EEE6D2", width: sel ? 7 * s : 2 * s });
      drawModeSign(c, app, opt.kind, tx + 30 * s, ty + 30 * s, 32 * s);
      const bwid = Math.max(56 * 1.6 * s, badgeFont.measure(opt.name) + 56 * 0.6 * s);
      drawBadge(c, tx + tileW / 2 - bwid / 2, ty + 66 * s, opt.name, opt.color, opt.kind, 56 * s, badgeFont);
      const stops = app.data.lines[opt.kind][opt.index].directions[opt.direction];
      const dest = stops[0] === stops[stops.length - 1] ? "Ringfahrt ↻" : "nach " + st[stops[stops.length - 1]];
      c.text(tx + tileW / 2, ty + 118 * s, fitText(destFont, dest, tileW - 20 * s), destFont, TEXT);
      this.tiles.push([n, tx, ty, tx + tileW, ty + tileH]);
      app.hit(tx, ty, tx + tileW, ty + tileH, () => this.choose(n));
    });
    if (firstRow > 0) c.text(w / 2, areaY1 - 12 * s, "▲ mehr", smallFont, MUTED);
    if (firstRow + rowsVisible < totalRows) c.text(w / 2, areaY2 + 4 * s, "▼ mehr", smallFont, MUTED);
  }

  choose(n) {
    const opt = this.options[n];
    board(this.app, opt, this.message.replace("{}", opt.name));
  }

  key(k, char) {
    const n = this.options.length, cols = this.cols;
    if (k === "Right") this.pick = Math.min(n - 1, this.pick + 1);
    else if (k === "Left") this.pick = Math.max(0, this.pick - 1);
    else if (k === "Down") this.pick = Math.min(n - 1, this.pick + cols);
    else if (k === "Up") this.pick = Math.max(0, this.pick - cols);
    else if (KEYS_OK.has(k)) return this.choose(this.pick);
    else if (KEYS_BACK.has(k) || (char || "").toLowerCase() === "u") return this.back();
    this.followPick = true;
    this.app.redraw();
  }

  /** Wischen blättert reihenweise durch die Kacheln. */
  drag(dy) {
    this.dragAcc += dy;
    let changed = false;
    while (this.dragAcc <= -this.rowStep * 0.6) { this.dragAcc += this.rowStep; this.firstRow++; changed = true; }
    while (this.dragAcc >= this.rowStep * 0.6) { this.dragAcc -= this.rowStep; this.firstRow--; changed = true; }
    if (changed) this.app.redraw();
  }

  dragEnd() {
    this.dragAcc = 0;
  }

  motion(x, y) {
    for (const [n, x1, y1, x2, y2] of this.tiles) {
      if (x1 <= x && x <= x2 && y1 <= y && y <= y2 && n !== this.pick) {
        this.pick = n;
        this.app.redraw();
      }
    }
  }
}

/** Rückfrage für Eltern. „Abbrechen“ ist vorausgewählt, damit Kinder nichts aus Versehen ändern. */
class ConfirmScreen extends Screen {
  constructor(app, title, lines, yesText, onYes, onNo) {
    super(app);
    Object.assign(this, { title, lines, yesText, onYes, onNo });
    this.yes = false;
  }

  draw(c, w, h) {
    const app = this.app, s = app.s;
    const [x1, y1, x2, y2] = dialogCard(app, c, w, h, this.onNo);
    const cx = w / 2;
    let y = y1 + 70 * s;
    c.text(cx, y, this.title, app.font(32, "bold"), TEXT);
    y += 70 * s;
    const font = app.font(22);
    for (const text of this.lines) {
      for (const ln of wrapText(font, text, x2 - x1 - 100 * s, 3)) {
        c.text(cx, y, ln, font, TEXT);
        y += font.linespace();
      }
      y += 14 * s;
    }
    const by = Math.min(y + 90 * s, y2 - 110 * s);
    bigButton(app, c, cx - 160 * s, by, "Abbrechen", !this.yes, this.onNo, "#6B7280");
    bigButton(app, c, cx + 160 * s, by, this.yesText, this.yes, this.onYes, "#2F855A");
    c.text(cx, by + 60 * s, "← → wählen, Enter bestätigen, Esc bricht ab", app.font(15), MUTED);
  }

  key(k) {
    if (k === "Left" || k === "Right" || k === "Tab") {
      this.yes = !this.yes;
      this.app.redraw();
    } else if (k === "Return") {
      (this.yes ? this.onYes : this.onNo)();
    } else if (KEYS_BACK.has(k)) {
      this.onNo();
    }
  }
}

// --------------------------------------------------------------------------
// Anwendung
// --------------------------------------------------------------------------

// Browser-Tastennamen -> Namen wie im Tk-Original
const KEY_NAMES = {
  ArrowDown: "Down", ArrowUp: "Up", ArrowLeft: "Left", ArrowRight: "Right", Enter: "Return", " ": "space",
  Escape: "Escape", Backspace: "BackSpace", Home: "Home", End: "End", PageDown: "Next", PageUp: "Prior",
  Tab: "Tab", F10: "F10",
};

class App {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.painter = new Painter(this.ctx);
    this.data = data;
    this.s = 1;
    this.width = 1280;
    this.height = 800;
    this.hits = [];
    this.fonts = new Map();
    this.animating = false;
    this.transfers = new Transfers(data);
    this.maps = {};
    this.settings = this.loadSettings();
    this.cockpit = false;    // Cockpit-Ansicht beim Fahren (Taste F), bleibt beim Umsteigen erhalten
    this.sound = new SoundPlayer();
    this.screen = new HomeScreen(this);

    window.addEventListener("resize", () => this.redraw());
    window.addEventListener("keydown", e => this.onKey(e));
    // Tippen/Klicken löst erst beim Loslassen aus – wer den Finger bewegt, scrollt stattdessen
    this.press = null;
    canvas.addEventListener("pointerdown", e => this.onPointerDown(e));
    canvas.addEventListener("pointermove", e => this.onPointerMove(e));
    canvas.addEventListener("pointerup", e => this.onPointerUp(e));
    canvas.addEventListener("pointercancel", () => { this.press = null; });
    canvas.addEventListener("wheel", e => { e.preventDefault(); this.screen.wheel(-e.deltaY); }, { passive: false });
    canvas.focus();
    // Die Stimmen werden in manchen Browsern erst nach dem Start geladen
    if ("speechSynthesis" in window) speechSynthesis.getVoices();
  }

  loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn("Einstellungen konnten nicht gespeichert werden:", e);
    }
  }

  separateModes() {
    return this.settings.separate_modes !== undefined ? this.settings.separate_modes : true;
  }

  /** Ankreuzfeld „Zeige ICE-Umstiege“, standardmäßig an. */
  showIce() {
    return this.settings.show_ice !== undefined ? this.settings.show_ice : true;
  }

  /** Verkehrsmittel, in die man von kind aus umsteigen kann (null = alle). */
  transferKinds(kind) {
    let kinds = this.separateModes() ? MODE_GROUPS.find(g => g.includes(kind)) : MODE_ORDER;
    if (!this.showIce()) kinds = kinds.filter(k => k !== "ice");
    return kinds.length === MODE_ORDER.length ? null : kinds;
  }

  /** Gespeicherter Startbahnhof, sonst Lichterfelde Ost. */
  homeStation() {
    const stations = this.data.stations;
    const key = this.settings.home_station;
    if (key && key in stations) return key;
    for (const [k, name] of Object.entries(stations)) if (name === DEFAULT_HOME) return k;
    return Object.keys(stations)[0];
  }

  networkMap(kind) {
    if (!this.maps[kind]) this.maps[kind] = new NetworkMap(this.data, kind);
    return this.maps[kind];
  }

  font(size, weight = "normal") {
    const px = Math.max(8, Math.round(size * this.s));
    const key = px + weight;
    if (!this.fonts.has(key)) this.fonts.set(key, new Font(px, weight));
    return this.fonts.get(key);
  }

  hit(x1, y1, x2, y2, callback) {
    this.hits.push([x1, y1, x2, y2, callback]);
  }

  show(screen) {
    this.screen = screen;
    this.redraw();
  }

  redraw() {
    const w = Math.max(window.innerWidth, 300), h = Math.max(window.innerHeight, 300);
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    this.width = w;
    this.height = h;
    this.s = Math.max(0.55, Math.min(w / 1280, h / 800));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.hits = [];
    this.painter.rect(0, 0, w, h, BG);
    this.screen.draw(this.painter, w, h);
  }

  animate() {
    if (this.animating) return;
    this.animating = true;
    requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.animating = false;
    const running = this.screen.tick();
    this.redraw();
    if (running) this.animate();
  }

  onKey(e) {
    const k = KEY_NAMES[e.key] || e.key;
    const char = e.key.length === 1 ? e.key : "";
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // Browser-Kürzel (Neu laden, Zoom …) nicht stören
    if (KEY_NAMES[e.key] || char) e.preventDefault();
    this.screen.key(k, char);
  }

  onPointerDown(e) {
    if (e.button > 0) return;
    this.canvas.focus();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    this.press = { id: e.pointerId, x: e.offsetX, y: e.offsetY, lastY: e.offsetY, moved: false, samples: [] };
  }

  onPointerMove(e) {
    const p = this.press;
    if (!p || p.id !== e.pointerId) {
      if (e.pointerType === "mouse") this.screen.motion(e.offsetX, e.offsetY);
      return;
    }
    // Ab 10 Pixel Bewegung ist es kein Tippen mehr, sondern Wischen
    if (!p.moved && Math.hypot(e.offsetX - p.x, e.offsetY - p.y) > 10) p.moved = true;
    if (!p.moved) return;
    const dy = e.offsetY - p.lastY;
    p.lastY = e.offsetY;
    p.samples.push([performance.now(), dy]);
    while (p.samples.length && performance.now() - p.samples[0][0] > 100) p.samples.shift();
    if (dy) this.screen.drag(dy);
  }

  onPointerUp(e) {
    const p = this.press;
    this.press = null;
    if (!p || p.id !== e.pointerId) return;
    if (p.moved) {
      // Geschwindigkeit der letzten 100 ms für den Schwung
      const recent = p.samples.filter(([t]) => performance.now() - t < 100);
      const dist = recent.reduce((a, [, dy]) => a + dy, 0);
      const span = recent.length ? Math.max(16, performance.now() - recent[0][0]) : 1;
      this.screen.dragEnd(recent.length ? dist / span : 0);
      return;
    }
    this.click(p.x, p.y);
  }

  click(x, y) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const [x1, y1, x2, y2, cb] = this.hits[i];
      if (x1 <= x && x <= x2 && y1 <= y && y <= y2) {
        cb();
        return;
      }
    }
  }
}

window.addEventListener("load", () => {
  const canvas = document.getElementById("spiel");
  if (!window.BERLIN_DATA) {
    document.body.innerHTML = '<p id="fehler">Die Datei <b>data.js</b> fehlt. Bitte zuerst ' +
      "<code>python3 tools/build_web.py</code> ausführen.</p>";
    return;
  }
  window.app = new App(canvas, window.BERLIN_DATA);
  window.app.redraw();
});
