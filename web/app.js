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
  ["faehre", "Fähre", "#0080BA", ["#F7D117", "#FFFFFF"]],      // gelber Rumpf, weißer Aufbau
  ["flug", "Flugzeug", "#1C6DD0", ["#FFFFFF", "#1C6DD0"]],
  ["schiff", "Kreuzfahrt", "#1F3A68", ["#FFFFFF", "#1F3A68"]],
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
  if (kind === "flug") return drawPlane(c, cx, cy + length * 0.02, length * 1.05, 0, flip);
  if (kind === "faehre") return drawFerry(c, cx, cy, length, flip);
  if (kind === "schiff") {
    const wy = cy + 0.12 * length;
    drawCruiseShip(c, cx, wy, length, SHIP_COLORS[1], 0, flip);
    const pts = [];
    for (let x = 0; x <= 20; x++) pts.push([cx + (x / 20 * 1.16 - 0.58) * length, wy + (0.01 + 0.012 * Math.sin(x * 1.9)) * length]);
    c.polygon(pts.concat([[cx + 0.58 * length, wy + 0.06 * length], [cx - 0.58 * length, wy + 0.06 * length]]), { fill: "#4FA3D9" });
    c.line(pts, { fill: "#BFE2F7", width: Math.max(1, length / 110) });
    return;
  }
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

/** Fähre in Seitenansicht, im Wasser: gelber Rumpf, weißer Aufbau, Steuerhaus vorn (rechts). */
function drawFerry(c, cx, cy, length, flip = false) {
  const [hull, cabin] = MODE.faehre[3];
  const blue = MODE.faehre[2];
  const mx = flip ? -1 : 1;
  const T = pts => pts.map(([x, y]) => [cx + mx * x * length, cy + y * length]);
  const poly = (pts, o) => c.polygon(T(pts), o);
  const lw = Math.max(1, length / 90);
  const grey = "#7A808A";
  // Fahnenmast mit blauer Fahne
  c.line(T([[-0.3, -0.2], [-0.3, -0.37]]), { fill: "#555555", width: Math.max(1, length / 80) });
  poly([[-0.3, -0.37], [-0.2, -0.345], [-0.3, -0.32]], { fill: blue });
  // Aufbau mit Fensterreihe und Tür
  poly(roundRectPoints(-0.38, -0.2, 0.24, -0.02, 0.03), { fill: cabin, outline: grey, width: lw });
  for (const wx of [-0.34, -0.23, -0.12, -0.01]) {
    poly(roundRectPoints(wx, -0.17, wx + 0.085, -0.09, 0.012), { fill: "#CFE8FF", outline: grey, width: lw / 2 });
  }
  poly([[0.1, -0.17], [0.16, -0.17], [0.16, -0.03], [0.1, -0.03]], { fill: "#E3E6EA", outline: grey, width: lw / 2 });
  // Rettungsring
  poly(circlePoints(0.2, -0.1, 0.026, 12), { fill: "#E8483B" });
  poly(circlePoints(0.2, -0.1, 0.012, 10), { fill: cabin });
  // Steuerhaus mit großer Scheibe nach vorn
  poly(roundRectPoints(0.02, -0.3, 0.22, -0.2, 0.02), { fill: cabin, outline: grey, width: lw });
  poly([[0.06, -0.28], [0.2, -0.28], [0.21, -0.22], [0.06, -0.22]], { fill: "#2B3440" });
  // Reling auf dem Vordeck
  c.line(T([[0.24, -0.06], [0.44, -0.06]]), { fill: grey, width: Math.max(1, length / 120) });
  for (const rx of [0.29, 0.34, 0.39, 0.44]) c.line(T([[rx, -0.06], [rx, -0.02]]), { fill: grey, width: Math.max(1, length / 160) });
  // Rumpf mit blauem Streifen, der Bug zeigt nach vorn
  poly([[-0.48, -0.02], [0.5, -0.02], [0.43, 0.11], [-0.44, 0.11]], { fill: hull, outline: darker(hull, 0.6), width: lw });
  poly([[-0.475, 0.015], [0.485, 0.015], [0.475, 0.04], [-0.465, 0.04]], { fill: blue });
  // Wasser mit kleinen Wellen
  const pts = [];
  for (let x = 0; x <= 20; x++) pts.push([x / 20 * 1.16 - 0.58, 0.085 + 0.012 * Math.sin(x * 1.9)]);
  poly(pts.concat([[0.58, 0.15], [-0.58, 0.15]]), { fill: "#4FA3D9" });
  c.line(T(pts), { fill: "#BFE2F7", width: Math.max(1, length / 110) });
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
  } else if (kind === "flug") {
    c.roundRect(cx - r, cy - r, cx + r, cy + r, size * 0.22, { fill: color });
    c.polygon(planeTopPoints(cx, cy, size * 0.78, Math.PI / 4), { fill: "white" });
  } else if (kind === "schiff") {
    c.roundRect(cx - r, cy - r, cx + r, cy + r, size * 0.22, { fill: color });
    drawAnchor(c, cx, cy, r, "white", Math.max(2, size * 0.07));
  } else if (kind === "faehre") {
    // weißes Schiff auf blauen Wellen
    c.roundRect(cx - r, cy - r, cx + r, cy + r, size * 0.22, { fill: color });
    const P = pts => pts.map(([x, y]) => [cx + x * r, cy + y * r]);
    c.polygon(P([[-0.12, -0.62], [0.18, -0.62], [0.18, -0.38], [-0.12, -0.38]]), { fill: "white" });
    c.polygon(P([[-0.42, -0.4], [0.3, -0.4], [0.3, -0.12], [-0.42, -0.12]]), { fill: "white" });
    c.polygon(P([[-0.66, -0.08], [0.7, -0.08], [0.5, 0.26], [-0.56, 0.26]]), { fill: "white" });
    for (const wy of [0.42, 0.62]) {
      const wave = [];
      for (let x = 0; x <= 12; x++) wave.push([x / 12 * 1.3 - 0.65, wy + 0.07 * Math.sin(x * 1.6)]);
      c.line(P(wave), { fill: "white", width: Math.max(1, size * 0.045), cap: "round", join: "round" });
    }
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
  const r = { sbahn: h / 2, tram: h / 2, bus: h * 0.3, faehre: h * 0.3, schiff: h * 0.3 }[kind] ?? h * 0.12;
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

function minutesText(minutes) {
  return minutes < 1 ? "< 1 Min." : `${minutes} Min.`;
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

const MODE_ORDER = ["sbahn", "ubahn", "regio", "ice", "flug", "schiff", "tram", "bus", "faehre"];     // Reihenfolge beim Umsteigen
// Bei „Umsteigen getrennt“ sieht man nur Umstiege innerhalb der eigenen Gruppe.
// Die Fähre gehört zu beiden: Man kommt mit der S-Bahn (z. B. Wannsee) genauso hin wie mit Bus und Tram.
const MODE_GROUPS = [["sbahn", "ubahn", "regio", "ice", "flug", "schiff", "faehre"], ["tram", "bus", "faehre"]];
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
    // Die wenigen Fähren liegen weit auseinander: als Orientierung das S-Bahn-Netz dazu
    this.context = [];
    if (kind === "faehre") {
      for (const line of data.lines.sbahn) {
        const pts = line.directions[0].filter(k => coords[k]).map(k => coords[k]);
        if (pts.length >= 2) this.context.push(pts);
      }
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
    // Beim Bus (riesiges Netz) und Regionalzug (bis an die Ostsee) wäre Berlin winzig, bei der Fähre
    // (kurze Überfahrten am Stadtrand) die Linie: heranzoomen
    const zoom = many || this.kind === "regio" || this.kind === "faehre";
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
      for (const pts of this.context) polyline(pts, { fill: "#E2DACA", width: Math.max(1, 2.5 * s) });
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
    const cols = w > h * 1.25 && n <= 6 ? n : Math.ceil(n / 2);
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
    checkbox(app, c, 24 * s, h - 50 * s, "Umsteigen getrennt: S-Bahn, U-Bahn, Regio, ICE, Flugzeug, Schiff / Tram, Bus (Fähre bei beiden)",
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
    } else if (char && "123456789".slice(0, n).includes(char)) {
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
      if (kind === "schiff") {
        const cr = app.data.cruises.cruises[i];
        const pn = cr.ports.map(p => app.data.cruises.ports[p].name);
        const via = pn[0] === pn[pn.length - 1] ? "↻  " + pn.slice(1, -1).join(", ") : "→  " + pn.slice(1).join(", ");
        c.text(tx, y1 + 40 * s, fitText(nameFont, cr.title, tw), nameFont, TEXT, "w");
        c.text(tx, y1 + 66 * s, fitText(smallFont, "ab " + pn[0], tw), smallFont, MUTED, "w");
        c.text(tx, y1 + 92 * s, fitText(smallFont, via, tw), smallFont, TEXT, "w");
      } else if (first === last) {
        c.text(tx, y1 + 40 * s, fitText(nameFont, stations[first], tw), nameFont, TEXT, "w");
        c.text(tx, y1 + 90 * s, "↻  Ringfahrt", nameFont, TEXT, "w");
      } else {
        c.text(tx, y1 + 40 * s, fitText(nameFont, stations[first], tw), nameFont, TEXT, "w");
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
    const question = { flug: "Wohin fliegst du?", schiff: "Welche Reise machst du?" }[this.kind] || "Welche Linie nimmst du?";
    c.text(left + 105 * s, hh / 2, `${label}: ${question}`, app.font(30, "bold"), "white", "w");
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
    if (this.kind === "flug") this.app.show(new FlightScreen(this.app, i, 0, this));
    else if (this.kind === "schiff") this.app.show(new CruiseScreen(this.app, i, 0, this));
    else this.app.show(new RideScreen(this.app, this.kind, i, this));
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

/** [Name, Taste, „wohin“] – Bus und Tram fahren auf den Betriebshof, Bahnen aufs Abstellgleis,
 *  die Fähre ins Bootshaus. */
function depotInfo(kind) {
  if (kind === "bus" || kind === "tram") return ["Betriebshof", "B", "auf den Betriebshof"];
  if (kind === "faehre") return ["Bootshaus", "B", "ins Bootshaus"];
  return ["Abstellgleis", "A", "aufs Abstellgleis"];
}

/** „wo“: auf dem Betriebshof, auf dem Abstellgleis, im Bootshaus. */
function depotAt(kind) {
  return kind === "faehre" ? "im Bootshaus" : "auf dem " + depotInfo(kind)[0];
}

/** Was beim Losfahren auf der Anzeige steht. */
function departureText(kind) {
  return kind === "faehre" ? "Leinen los!" : "Zurückbleiben, bitte!";
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
    this.washStart = null;   // seit wann das Fahrzeug durch die Waschanlage fährt
    this.fullLine = this.line;   // Taste E kürzt die Linie nur für diese Fahrt (this.line), nicht dauerhaft
    this.door = null;        // offene Türen mit Blick in den Innenraum (Taste Ö)
    this.doorCount = 0;
    const rng = seededRandom(this.line.name);
    this.riders = rng.shuffle(SLOTS.map((_, i) => i)).slice(0, 3).map(slot => ({ look: randomLook(rng), slot }));
  }

  /** Höhenlage jedes Bahnhofs in der aktuellen Richtung (für die Cockpit-Ansicht). */
  get levels() {
    const key = this.direction + "/" + this.stops.length;
    if (this.levelsKey !== key) {
      const names = this.stops.map(k => this.app.data.stations[k]);
      this.levelsCache = names.map((_, i) => stationLevel(this.kind, this.line.name, names, i));
      this.levelsKey = key;
    }
    return this.levelsCache;
  }

  /** Wohin das Fahrzeug fährt: die Station – oder eine Zeile weiter auf Betriebshof/Abstellgleis. */
  get target() { return this.index + (this.depot ? 1 : 0); }

  atTerminus() { return !this.ring && (this.index === 0 || this.index === this.stops.length - 1); }

  depotHint() {
    const key = depotInfo(this.kind)[1];
    this.say(`Pause ${depotAt(this.kind)}. Zurück auf die Strecke: Taste ${key}`, 2.5);
    this.app.animate();
  }

  get washing() { return this.washStart !== null; }
  get washTime() { return now() - this.washStart; }

  /** Taste W: auf dem Abstellgleis bzw. Betriebshof einmal durch die Waschanlage. */
  wash() {
    if (this.washing) return;
    if (!this.depot) {
      const key = depotInfo(this.kind)[1];
      this.say(`Gewaschen wird ${depotAt(this.kind)}: an der Endstation Taste ${key}`, 3);
    } else {
      this.washStart = now();
      this.app.sound.play("bus");          // Rauschen und Zischen wie in der Waschanlage
    }
    this.app.animate();
  }

  /** Taste E: die Linie endet hier – oder fährt wieder bis zur echten Endstation (nur für diese Fahrt). */
  toggleEnd() {
    if (this.depot) return this.depotHint();
    const st = this.app.data.stations, here = this.stops[this.index];
    if (this.line !== this.fullLine) {
      // Kürzung aufheben: wieder die ganze Linie, in derselben Fahrtrichtung (gleicher nächster Halt)
      const nxt = this.index + 1 < this.stops.length ? this.stops[this.index + 1] : null;
      const sameWay = stops => {
        const i = stops.indexOf(here);
        return (nxt === null && i < stops.length - 1) || (i + 1 < stops.length && stops[i + 1] === nxt);
      };
      const dirs = this.fullLine.directions;
      let d = dirs.findIndex(stops => stops.includes(here) && sameWay(stops));
      if (d < 0) d = dirs.findIndex(stops => stops.includes(here));
      this.line = this.fullLine;
      this.direction = d;
      this.index = Math.max(0, this.stops.indexOf(here));
      this.say("Die Linie fährt wieder bis " + st[this.stops[this.stops.length - 1]], 3);
    } else if (this.index === 0) {
      this.say("Hier beginnt die Linie – fahr erst ein Stück.", 2.5);
    } else if (this.index === this.stops.length - 1 && !this.ring) {
      this.say("Das ist schon die Endstation.", 2.5);
    } else {
      const short = this.stops.slice(0, this.index + 1);
      this.line = Object.assign({}, this.fullLine, { directions: [short, short.slice().reverse()] });
      this.direction = 0;
      this.say("Endstation! Die Linie endet heute hier.", 2.5);
    }
    this.pos = this.index;
    this.backwards = false;
    this.scroll = null;
    this.app.animate();
  }

  /** Taste B/A: an der Endhaltestelle auf den Betriebshof bzw. aufs Abstellgleis – und wieder zurück. */
  toggleDepot(key = null) {
    const [, wanted, where] = depotInfo(this.kind);
    if (this.washing) return;            // erst fertig waschen
    if (key && key.toUpperCase() !== wanted) {
      this.say(wanted === "A" ? "Bahnen fahren aufs Abstellgleis: Taste A" : `${MODE[this.kind][1]} fährt ${where}: Taste B`, 2.5);
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
      this.say(`${where[0].toUpperCase()}${where.slice(1)} geht es nur an der Endhaltestelle.`, 2.5);
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

  /** Fahrzeit in Minuten von Station i zur nächsten (laut VBB-Fahrplan) oder null. */
  travelTime(i) {
    const stops = this.stops;
    if (i + 1 >= stops.length) return null;
    const pairs = this.app.travelTimes(this.fullLine);
    // fehlt der Abschnitt in dieser Richtung (z. B. nach Taste E), gilt die Gegenrichtung
    let v = pairs.get(stops[i] + ">" + stops[i + 1]);
    if (v === undefined) v = pairs.get(stops[i + 1] + ">" + stops[i]);
    return v === undefined ? null : v;
  }

  transferOptions(i = null) {
    const key = this.stops[i === null ? this.index : i];
    return this.app.transfers.options(key, [this.kind, this.lineIndex], this.app.transferKinds(this.kind));
  }

  draw(c, w, h) {
    if (this.door) this.door.draw(c, w, h);
    else this.drawView(c, w, h);
  }

  drawView(c, w, h) {
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
    const timeFont = app.font(12, "bold");
    stops.forEach((key, i) => {
      const y = rowY(i);
      if (y < top - rowH || y > h + rowH) return;
      // Fahrzeit bis zur nächsten Station, klein neben der Strecke
      const minutes = this.travelTime(i);
      if (minutes !== null) c.text(trackX + 20 * s, y + rowH / 2, minutesText(minutes), timeFont, i < this.index ? "#B5AD9E" : "#7D766A", "w");
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
    if (this.washing) {
      // Seifenblasen steigen auf
      const t = this.washTime, vy = rowY(this.pos);
      for (let i = 0; i < 14; i++) {
        const rise = (t * 0.6 + rnd(i, 31)) % 1.0;
        const bx = vehX + (rnd(i, 32) - 0.5) * vehLen, by = vy + 20 * s - rise * 90 * s;
        const r = (4 + 7 * rnd(i, 33)) * s;
        c.oval(bx - r, by - r, bx + r, by + r, { fill: "#EAF6FF", outline: "#8CC4EE", width: Math.max(1, 1.5 * s) });
      }
    }

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
      const minutes = this.travelTime(this.index);
      if (minutes !== null) c.text(ix + pw, y, "Fahrzeit " + minutesText(minutes), app.font(14), "#B8C4D0", "e");
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
      ["Ö", () => this.toggleOpen(), !this.depot && !this.washing, "#2BA59B", "white", 30],
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
    if (this.washing) text = washPhase(this.washTime);
    const boxY1 = y + 14 * s + 16 * s, boxY2 = btnY - 14 * s;
    if (boxY2 - boxY1 >= 40 * s) {
      c.roundRect(ix, boxY1, ix + pw, boxY2, 14 * s, { fill: "#11181F", outline: "#3A4A5C", width: 2 * s });
      const mf = app.font(boxY2 - boxY1 > 70 * s ? 22 : 19, "bold");
      let lines, font, fill;
      if (text) {
        [lines, font, fill] = [wrapText(mf, text, pw - 24 * s, 2), mf, "#FFB000"];
      } else if (this.depot) {
        [lines, font, fill] = [[`Taste ${depotKey}: zurück`, "Taste W: waschen"], mf, "#C8B6F0"];
        const mid = (boxY1 + boxY2) / 2;
        app.hit(ix, boxY1, ix + pw, mid, () => this.toggleDepot());
        app.hit(ix, mid, ix + pw, boxY2, () => this.wash());
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
        lines = wrapText(font, "↑ ↓ fahren · Ö Türen auf · V Ansage", pw - 24 * s, 2);
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
    if (this.door) {
      if (this.door.finished()) {
        this.door = null;
        return true;
      }
      return this.door.animating() || now() < this.message[1];
    }
    if (this.washing) {
      this.speed = 5 / VMAX[this.kind];           // Schrittgeschwindigkeit am Tacho
      if (this.washTime >= WASH_TIME) {
        this.washStart = null;
        this.speed = 0;
        this.say("Blitzblank! Fertig gewaschen.", 3);
      }
      return true;
    }
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
    if (this.index === 0 && i > 0) this.say(departureText(this.kind));
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
      this.say(departureText(this.kind), 1.4);
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
      regio: "Bitte einsteigen. Vorsicht bei der Abfahrt!", ice: "Bitte einsteigen. Vorsicht bei der Abfahrt!",
      faehre: "Alle an Bord? Leinen los!" }[this.kind];
    this.app.sound.play(this.kind, speech);
    // Beim Bus zischt die Druckluft, wenn die Türen aufgehen; die Fähre tutet mit dem Schiffshorn
    this.say({ bus: "Pssscht – Türen auf!", faehre: "Tuuut! Leinen los!" }[this.kind] || "Türen schließen!", 2.5);
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
      const prefix = { tram: "Tram ", bus: "Bus ", flug: "Flug nach ", faehre: "Fähre ", schiff: "Kreuzfahrt " };
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

  /** Taste Ö: Türen auf (Blick in den Innenraum, Leute steigen ein und aus) bzw. wieder zu. */
  toggleOpen() {
    const app = this.app;
    if (this.door) {
      if (this.door.closingAt !== null) return;
      if (this.door.busy()) this.say("Moment – es steigen noch Leute ein und aus!", 2);
      else {
        this.door.close();
        this.doors();
        this.say("Türen schließen!", 2);
      }
    } else if (this.washing) {
      return;
    } else if (this.depot) {
      this.say(`Hier steigt niemand ein – wir sind ${depotAt(this.kind)}.`, 2.5);
    } else if (Math.abs(this.pos - this.index) > 0.02) {
      this.say("Erst anhalten – dann Türen auf!", 2);
    } else {
      this.door = new Doors(this);
      if (this.kind === "bus") app.sound.play("bus");
      this.say("Türen auf – bitte ein- und aussteigen!", 2.5);
    }
    app.redraw();
    app.animate();
  }

  key(k, char) {
    const c = (char || "").toLowerCase();
    if (DOOR_KEYS.has(char)) return this.toggleOpen();
    if (this.door) {
      if (KEYS_BACK.has(k)) this.back();
      else if (c === "t") this.doors();
      else if (c === "v") this.announce();
      else { this.say("Die Türen sind offen – schließen mit Ö", 2); this.app.animate(); }
      return;
    }
    if (KEYS_NEXT.has(k)) this.next();
    else if (KEYS_PREV.has(k)) this.prev();
    else if (KEYS_BACK.has(k)) this.back();
    else if (k === "Home") this.goTo(0);
    else if (k === "End") this.goTo(this.stops.length - 1);
    else if (c === "r") this.switchDirection();
    else if (c === "t") this.doors();
    else if (c === "v") this.announce();
    else if (c === "u") this.change();
    else if (c === "e") this.toggleEnd();
    else if (c === "a" || c === "b") this.toggleDepot(c);
    else if (c === "w") this.wash();
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
const VMAX = { sbahn: 100, ubahn: 70, tram: 60, bus: 50, regio: 160, ice: 300, faehre: 25 };   // km/h am Tacho
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

/** Abstellgleis: Prellbock am Gleisende, daneben abgestellte Züge (im Tunnel nur das Tunnelende). */
function drawSiding(c, app, sc, zd, zEnd, kind, level = "ground") {
  if (level === "tunnel") {
    sc.front(-3.0, 3.0, 0, 4.6, zEnd, "#3A3B3E");                      // Tunnelende
  } else {
    sc.front(-40, 40, level === "elevated" ? ELEV : 0, 3.2, zEnd, "#5E8B4C");   // Erdwall mit Büschen
    for (let k = -6; k <= 6; k++) {
      const [cx, cy] = sc.p(k * 3.2, 3.2, zEnd), r = sc.size(1.8, zEnd);
      c.oval(cx - r, cy - r, cx + r, cy + r, { fill: "#4F7F3F" });
    }
    // abgestellte Züge auf den Nachbargleisen (auf dem Viadukt ist dafür kein Platz)
    const [body, accent] = MODE[kind][3];
    for (const [x1, x2] of level === "elevated" ? [] : [[4.4, 7.0], [-8.0, -5.4]]) {
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

// --- Höhenlage der Bahnhöfe: Tunnel, ebenerdig oder auf dem Viadukt ---------
// Offene Daten dazu gibt es nicht; die Tabelle beschreibt die bekannten Berliner Strecken.

// U-Bahn: alles unterirdisch, außer diesen Bahnhöfen (je Linie, denn z. B. am Kottbusser Tor
// hält die U1 oben auf dem Viadukt, die U8 aber unten im Tunnel)
const U1_VIADUKT = ["S+U Warschauer Str.", "U Schlesisches Tor", "U Görlitzer Bahnhof", "U Kottbusser Tor",
  "U Prinzenstr.", "U Hallesches Tor", "U Möckernbrücke", "U Gleisdreieck"];
const U_ELEVATED = {
  U1: new Set(U1_VIADUKT),
  U2: new Set(["S+U Schönhauser Allee", "U Eberswalder Str.", "U Gleisdreieck", "U Bülowstr.", "U Nollendorfplatz"]),
  U3: new Set(U1_VIADUKT),
};
const U_GROUND = {
  U2: new Set(["U Olympia-Stadion", "U Ruhleben"]),
  U3: new Set(["U Krumme Lanke", "U Onkel Toms Hütte", "U Oskar-Helene-Heim", "U Freie Universität (Thielplatz)",
    "U Dahlem-Dorf", "U Podbielskiallee"]),
  U5: new Set(["U Hönow", "U Louis-Lewin-Str.", "U Hellersdorf", "U Cottbusser Platz", "U Kienberg (Gärten der Welt)",
    "U Kaulsdorf-Nord", "S+U Wuhletal", "U Elsterwerdaer Platz", "U Biesdorf-Süd"]),
  U6: new Set(["U Scharnweberstr.", "U Otisstr.", "U Holzhauser Str."]),
};
// S-Bahn und Fernbahn: Nord-Süd-Tunnel und Flughafen unter der Erde, Stadtbahn auf dem Viadukt
const RAIL_TUNNEL = new Set(["S Nordbahnhof", "S Oranienburger Str.", "S+U Brandenburger Tor", "S+U Potsdamer Platz",
  "S Anhalter Bahnhof", "Flughafen BER"]);
const STADTBAHN = new Set(["S Charlottenburg", "S Savignyplatz", "S+U Zoologischer Garten", "S Tiergarten", "S Bellevue",
  "S+U Berlin Hauptbahnhof", "S+U Friedrichstr.", "S Hackescher Markt", "S+U Alexanderplatz",
  "S+U Jannowitzbrücke", "S Ostbahnhof"]);
// Hauptbahnhof unten (Nord-Süd), wenn die Linie von/nach diesen Bahnhöfen fährt; sonst oben (Stadtbahn)
const HBF_LOWER_NEIGHBORS = new Set(["S Südkreuz", "S+U Gesundbrunnen", "S+U Potsdamer Platz", "S+U Wedding"]);

/** "tunnel", "ground" oder "elevated" für Bahnhof i der Liste names. */
function stationLevel(kind, lineName, names, i) {
  const name = names[i];
  const neighbors = [names[i - 1], names[i + 1]].filter(Boolean);
  if (kind === "tram" || kind === "bus" || kind === "faehre") return "ground";
  if (kind === "ubahn") {
    if (U_ELEVATED[lineName] && U_ELEVATED[lineName].has(name)) return "elevated";
    return U_GROUND[lineName] && U_GROUND[lineName].has(name) ? "ground" : "tunnel";
  }
  if (RAIL_TUNNEL.has(name)) return "tunnel";
  if (name === "S+U Friedrichstr.") return neighbors.some(n => RAIL_TUNNEL.has(n)) ? "tunnel" : "elevated";   // Stadtbahn oben, Nord-Süd-S-Bahn unten
  if (name === "S+U Berlin Hauptbahnhof") return neighbors.some(n => HBF_LOWER_NEIGHBORS.has(n)) ? "tunnel" : "elevated";
  return STADTBAHN.has(name) ? "elevated" : "ground";
}

const ELEV = -7;    // so tief liegt die Straße unter einem Viadukt (das Gleis ist immer bei 0)

/** Strecke für S-Bahn, U-Bahn, Regio und ICE. Jede Station hat ihren Abschnitt (±30 m), der im Tunnel,
 *  ebenerdig oder auf dem Viadukt liegt; an den Übergängen gibt es Tunnelportale bzw. Rampen. */
function drawRailScene(ride, c, app, x1, y1, x2, y2) {
  const kind = ride.kind, st = app.data.stations, stops = ride.stops, n = stops.length;
  const levels = ride.levels;
  const cam = ride.pos * SEG;
  const sc = new Scene(c, x1, y1, x2, y2);
  const hy = sc.hy;
  const level = k => levels[Math.max(0, Math.min(n - 1, k))];

  // Himmel, Wiese und Hügel – im Tunnel verdecken Wände und Decke alles davon
  const sky = ["#6FB6EA", "#82C0EE", "#96CAF1", "#AAD4F4", "#BFDFF6", "#D4EAF9"];
  const band = (hy - y1) / sky.length;
  sky.forEach((col, i) => c.rect(x1, y1 + i * band, x2, y1 + (i + 1) * band + 1, col));
  c.rect(x1, hy, x2, y2, "#86B86A");
  const pts = [[x1, hy]];
  for (let k = 0; k < 13; k++) pts.push([x1 + (x2 - x1) * k / 12, hy - (0.02 + 0.05 * rnd(k, 5)) * (y2 - y1)]);
  pts.push([x2, hy]);
  c.polygon(pts, { fill: "#6FA35C" });

  const zd = n * SEG - cam;
  const zEnd = ride.depot ? zd + 30 : Z_FAR + 100;   // dahinter verdecken Prellbock und Erdwall bzw. Tunnelende alles

  // Abschnitte von hinten nach vorn
  const regions = [];
  for (let k = Math.floor((cam + Z_NEAR + SEG / 2) / SEG); ; k++) {
    const za = k * SEG - SEG / 2 - cam;
    if (za > Math.min(Z_FAR, zEnd)) break;
    regions.push([k, za, Math.min(za + SEG, Z_FAR, zEnd), level(k)]);
  }
  for (let idx = regions.length - 1; idx >= 0; idx--) {
    const [k, za, zb, lv] = regions[idx];
    const hasEnd = ride.depot && zb >= zEnd - 0.01;
    drawRailRegion(ride, c, app, sc, k, Math.max(za, Z_NEAR), zb, lv, st, stops,
      hasEnd ? () => drawSiding(c, app, sc, zd, zEnd, kind, lv) : null);
    if (idx > 0 && za > Z_NEAR) drawTransition(sc, za, lv, regions[idx - 1][3]);
  }
}

/** Übergang zwischen zwei Abschnitten bei Entfernung z (vom näheren aus gesehen). */
function drawTransition(sc, z, far, near) {
  if (far === near || near === "tunnel") return;            // aus dem Tunnel heraus sieht man keine Kante
  const concrete = "#8F8A80";
  if (far === "tunnel") {
    const low = near === "elevated" ? ELEV : 0, grass = "#6E8F57";
    // begrünter Erdwall, in dem der Tunnel verschwindet, mit Betonrahmen um die Öffnung
    sc.front(-60, -3.0, low, 4.0, z + 0.5, grass);
    sc.front(3.0, 60, low, 4.0, z + 0.5, grass);
    sc.front(-9.0, 9.0, 4.0, 6.0, z + 0.5, grass);
    sc.front(-4.6, -3.0, low, 6.2, z, concrete);
    sc.front(3.0, 4.6, low, 6.2, z, concrete);
    sc.front(-3.0, 3.0, 4.6, 6.2, z, concrete);
    if (low < 0) sc.front(-3.0, 3.0, low, 0, z, concrete);
  } else {
    sc.front(-300, 300, ELEV, 0, z, "#9C8B73");              // Rampe zwischen Viadukt und ebenem Gleis
  }
}

function drawRailRegion(ride, c, app, sc, k, za, zb, lv, st, stops, afterGround) {
  const s = app.s, kind = ride.kind, n = stops.length, cam = ride.pos * SEG;
  const tunnel = lv === "tunnel";

  /** Positionen [Index, Entfernung] von Dingen alle spacing Meter, nur in diesem Abschnitt. */
  const periodic = (spacing, offset = 0) => {
    const out = [];
    for (let j = Math.floor((cam + za - offset) / spacing); ; j++) {
      const z = j * spacing + offset - cam;
      if (z > zb) return out;
      if (z >= za - 0.01) out.push([j, z]);
    }
  };
  const byDistance = (a, b) => b[0] - a[0];

  // --- Boden, Tunnel bzw. Viadukt ---
  const background = [];
  if (tunnel) {
    if (zb >= Z_FAR - 0.01) sc.front(-3.0, 3.0, 0, 4.6, Z_FAR - 0.1, "#0E1013");   // der Tunnel geht im Dunkeln weiter
    sc.wall(-3.0, 0, 4.6, za, zb, "#2A2B2E");
    sc.wall(3.0, 0, 4.6, za, zb, "#2A2B2E");
    sc.ground(-3.0, 3.0, za, zb, "#1E1F22", 4.6);
    sc.ground(-3.0, 3.0, za, zb, "#3A3632");
  } else if (lv === "ground") {
    sc.ground(-300, 300, za, zb, "#86B86A");
    sc.ground(-5.6, 2.2, za, zb, "#8E8578");
  } else {
    // unten die Stadt mit Straße und Häusern, oben das Viadukt mit Geländer
    sc.ground(-300, 300, za, zb, "#A9A39A", ELEV);
    sc.ground(-4.0, 1.0, za, zb, "#6C6E73", ELEV + 0.01);
    const colors = ["#D9B38C", "#C98D7A", "#E6D3A3", "#B7C3C9", "#D7A9A0", "#C2B59B"];
    for (const [j, z] of periodic(14)) {
      for (const X of [-14, 11]) {
        const height = 14 + 8 * rnd(j, 7 + X), col = colors[Math.floor(rnd(j, 9 + X) * colors.length)];
        background.push([z + 12, () => sc.wall(X, ELEV, ELEV + height, z, Math.min(z + 12, zb), col)]);
      }
    }
    for (const [, z] of periodic(15, 5)) {
      background.push([z, () => { sc.front(-6.0, -5.3, ELEV, 0, z, "#8A847A"); sc.front(2.0, 2.7, ELEV, 0, z, "#8A847A"); }]);
    }
  }
  for (const [, fn] of background.sort(byDistance)) fn();
  if (lv === "elevated") {
    sc.ground(-5.9, 2.7, za, zb, "#8C8780");
    sc.ground(-5.6, 2.2, za, zb, "#8E8578", 0.01);
  }

  // --- Gleise ---
  const wood = tunnel ? "#3D3B39" : "#6B5444";
  for (const [, z] of periodic(2)) {
    sc.ground(-1.25, 1.25, z, Math.min(z + 0.35, zb), wood, 0.02);
    if (!tunnel) sc.ground(-5.05, -2.55, z, Math.min(z + 0.35, zb), wood, 0.02);      // Nachbargleis
  }
  for (const X of [-0.75, 0.75]) sc.ground(X - 0.05, X + 0.05, za, zb, "#D6D6D6", 0.06);
  if (!tunnel) for (const X of [-4.55, -3.05]) sc.ground(X - 0.05, X + 0.05, za, zb, "#C8C8C8", 0.06);
  if (kind === "sbahn" || kind === "ubahn") sc.ground(1.45, 1.6, za, zb, "#7C7C7C", 0.15);   // Stromschiene
  if (lv === "elevated") {
    sc.wall(2.75, 0, 1.1, za, zb, "#5F646B");                                         // Geländer
    sc.wall(-5.95, 0, 1.1, za, zb, "#5F646B");
  }
  if (afterGround) afterGround();

  // --- Dinge am Rand ---
  const items = [];
  if ((kind === "regio" || kind === "ice") && !tunnel) {
    c.line([sc.p(0, 5.6, za), sc.p(0, 5.6, zb)], { fill: "#2E2E2E", width: Math.max(1, 2 * s) });
    for (const [, z] of periodic(30, 7)) {
      items.push([z, () => { sc.front(-2.92, -2.68, 0, 6.3, z, "#5A5F66"); sc.front(-2.8, 0.2, 5.75, 5.95, z, "#5A5F66"); }]);
    }
  }
  const zs = k * SEG - cam, inStation = k >= 0 && k < n;
  if (tunnel) {
    for (const [, z] of periodic(8)) {
      if (inStation && Math.abs(z - zs) < 40) continue;          // in der Bahnhofshalle ist es ohnehin hell
      items.push([z, () => { sc.wall(-2.98, 3.5, 3.8, z, z + 1.4, "#FFE9A8"); sc.wall(2.98, 3.5, 3.8, z, z + 1.4, "#FFE9A8"); }]);
    }
  } else if (lv === "ground") {
    for (const [j, z] of periodic(13, 4)) {
      if (rnd(j, 1) < 0.35) continue;
      const X = (rnd(j, 2) < 0.5 ? -1 : 1) * (10 + 6 * rnd(j, 4));
      items.push([z, () => {
        sc.front(X - 0.18, X + 0.18, 0, 2.4, z, "#6B4A2E");
        const [cx, cy] = sc.p(X, 4.0, z), r = sc.size(1.9 + 0.6 * rnd(j, 6), z);
        c.oval(cx - r, cy - r, cx + r, cy + r, { fill: ["#4F8F3F", "#5E9C46", "#477F38"][((j % 3) + 3) % 3] });
      }]);
    }
  }
  if (inStation) {
    const pa = Math.max(zs - 12, za), pb = Math.min(zs + 28, zb);
    if (pb > pa) items.push([pb, () => drawPlatform(c, app, sc, ride, k, zs, pa, pb, lv, st[stops[k]])]);
  }
  for (const [, fn] of items.sort(byDistance)) fn();
}

/** Bahnsteig rechts neben dem Gleis – in der Bahnhofshalle, ebenerdig oder oben auf dem Viadukt. */
function drawPlatform(c, app, sc, ride, i, zs, za, zb, lv, name) {
  if (lv === "tunnel") {
    // helle, gekachelte Bahnhofshalle statt Tunnel
    const tiles = ["#D8E2D0", "#E3D9C6", "#CFDDE6", "#E6D0CF"][i % 4];
    sc.wall(8.0, 0, 4.8, za, zb, tiles);
    sc.wall(-3.0, 0, 4.6, za, zb, tiles);
    sc.ground(-3.0, 8.0, za, zb, "#EFEDE6", 4.7);
    for (let lz = Math.trunc(za); lz < zb; lz += 6) sc.ground(-1.0, 6.0, lz, lz + 1.2, "#FFF6D8", 4.68);
  }
  if (lv === "elevated") {
    sc.ground(2.7, 8.4, za, zb, "#8C8780");                  // Viadukt ist am Bahnhof breiter
    sc.wall(8.4, 0, 1.1, za, zb, "#5F646B");
  }
  sc.ground(2.0, 8.0, za, zb, "#B9B2A6", 1.0);
  sc.wall(2.0, 0, 1.0, za, zb, "#8C857A");
  sc.ground(2.0, 2.4, za, zb, "#F4F4F4", 1.01);
  sc.front(2.0, 8.0, 0, 1.0, za, "#8C857A");                  // Stirnseite am Bahnsteiganfang
  if (lv !== "tunnel") {
    for (let pz = Math.trunc(za) + 4; pz < zb; pz += 9) sc.front(5.0, 5.18, 1.0, 4.3, pz, "#6F7378");
    sc.ground(2.8, 8.0, za, zb, "#7A8088", 4.3);
  }
  stationSign(c, app, sc, 2.7, 7.0, 2.4, 3.4, zs + 14, name, MODE[ride.kind][2]);
}

/** Die Strecke vor dem Fahrzeug. Alles hängt von ride.pos ab – so zieht die Landschaft beim Fahren vorbei. */
const WATER = "#3E86B5";
const PIER = "#A47B52";        // Holzbohlen der Anleger
const PIER_SIDE = "#6E5236";

/** Fähre: Blick über den Bug aufs Wasser. Links und rechts Ufer mit Bäumen und Schilf, an jeder Station
 *  ein Anleger (Holzsteg) rechts, hinter der Endstation das Bootshaus. */
function drawWaterScene(ride, c, app, x1, y1, x2, y2) {
  const s = app.s, st = app.data.stations, stops = ride.stops;
  const cam = ride.pos * SEG;
  const sc = new Scene(c, x1, y1, x2, y2);
  const hy = sc.hy, W = x2 - x1, H = y2 - y1;
  const blue = MODE.faehre[2];
  const mod3 = k => ((k % 3) + 3) % 3;

  // --- Himmel, Wald am anderen Ende des Sees, Wasser ---
  const sky = ["#6FB6EA", "#82C0EE", "#96CAF1", "#AAD4F4", "#BFDFF6", "#D4EAF9"];
  const band = (hy - y1) / sky.length;
  sky.forEach((col, i) => c.rect(x1, y1 + i * band, x2, y1 + (i + 1) * band + 1, col));
  const pts = [[x1, hy + 1]];
  for (let k = 0; k < 25; k++) pts.push([x1 + W * k / 24, hy - (0.025 + 0.03 * rnd(k, 15)) * H]);
  pts.push([x2, hy + 1]);
  c.polygon(pts, { fill: "#4F7F45" });
  for (let k = 0; k < 5; k++) {                                            // Häuschen am fernen Ufer
    const hx = x1 + W * (0.08 + 0.2 * k + 0.08 * rnd(k, 16)), hw = W * 0.012;
    c.rect(hx, hy - H * 0.022, hx + hw, hy + 1, ["#E8D9B5", "#F2EEE6", "#D9A68C"][k % 3]);
    c.polygon([[hx - hw * 0.2, hy - H * 0.022], [hx + hw / 2, hy - H * 0.036], [hx + hw * 1.2, hy - H * 0.022]], { fill: "#A0483A" });
  }
  c.rect(x1, hy, x2, y2, WATER);
  const far = (y2 - hy) * 0.3;                                             // hinten spiegelt das Wasser den Himmel
  ["#8CC3E3", "#73B2DA", "#5FA3D0", "#4C95C5"].forEach((col, i) => c.rect(x1, hy + far * i / 4, x2, hy + far * (i + 1) / 4 + 1, col));

  /** Positionen [Index, Abstand nach vorn] von Dingen, die alle spacing Meter wiederkehren. */
  function periodic(spacing, offset = 0) {
    const out = [];
    for (let k = Math.floor((cam + Z_NEAR - offset) / spacing); ; k++) {
      const z = k * spacing + offset - cam;
      if (z > Z_FAR) return out;
      if (z >= Z_NEAR - spacing) out.push([k, z]);
    }
  }

  // --- Ufer links und rechts ---
  const left = -26, right = 18;
  sc.ground(-300, left, Z_NEAR, Z_FAR, "#7FAF62", 0.6);
  sc.ground(right, 300, Z_NEAR, Z_FAR, "#7FAF62", 0.6);
  sc.wall(left, 0, 0.6, Z_NEAR, Z_FAR, "#8C7A5A");
  sc.wall(right, 0, 0.6, Z_NEAR, Z_FAR, "#8C7A5A");

  // Wellen: kurze helle Striche, die beim Fahren vorbeiziehen
  for (const [k, z] of periodic(5)) {
    for (let j = 0; j < 3; j++) {
      const X = left + 1 + (right - left - 3) * rnd(k * 3 + j, 17);
      sc.ground(X, X + 1.4, z, z + 0.3, "#8CC6E8", 0.01);
    }
  }

  // --- Bootshaus hinter der Endstation ---
  let zEnd = Z_FAR + 100;
  if (ride.depot) {
    zEnd = stops.length * SEG - cam + 34;
    drawBoathouse(c, app, sc, zEnd, blue);
  }

  const items = [];
  for (const [k, z] of periodic(11, 3)) {
    for (const side of [-1, 1]) {
      if (rnd(k, 18 + side) < 0.3) continue;
      const X = side > 0 ? right + 3 + 9 * rnd(k, 20 + side) : left - 3 - 9 * rnd(k, 20 + side);
      items.push([z, () => {
        sc.front(X - 0.2, X + 0.2, 0.6, 3.0, z, "#6B4A2E");
        const [cx, cy] = sc.p(X, 4.6, z), r = sc.size(2.0 + 0.8 * rnd(k, 22 + side), z);
        c.oval(cx - r, cy - r, cx + r, cy + r, { fill: ["#4F8F3F", "#5E9C46", "#477F38"][mod3(k + side)] });
      }]);
    }
  }
  for (const [k, z] of periodic(4, 1)) {                                   // Schilf am Ufer
    for (const X of [right + 0.4, left - 0.4]) {
      if (rnd(k, 23 + X) < 0.5) items.push([z, () => sc.front(X - 0.6, X + 0.6, 0.4, 1.5, z, "#8DA24E")]);
    }
  }
  for (const [, z] of periodic(45, 20)) {                                  // Fahrwassertonnen: rot links, grün rechts
    for (const [X, col] of [[-9, "#D23B2E"], [12, "#2F9E5B"]]) {
      items.push([z, () => {
        sc.front(X - 0.45, X + 0.45, 0, 0.9, z, col);
        sc.front(X - 0.25, X + 0.25, 0.9, 1.5, z, col);
        sc.front(X - 0.45, X + 0.45, 0.35, 0.5, z, "white");
      }]);
    }
  }

  // --- Anleger ---
  for (let i = Math.floor(ride.pos) - 1; i < Math.floor(ride.pos) + 3; i++) {
    if (i < 0 || i >= stops.length) continue;
    const zs = i * SEG - cam, name = st[stops[i]];
    const za = zs - 12, zb = zs + 16;
    if (zb < Z_NEAR || za > Z_FAR) continue;
    items.push([zb, () => {
      sc.ground(8, right, zs + 3, zs + 6, PIER, 0.7);                       // Steg zum Ufer
      sc.front(8, right, 0, 0.7, zs + 3, PIER_SIDE);
      sc.ground(2.8, 8, za, zb, PIER, 0.7);                                 // Ponton
      sc.wall(2.8, 0, 0.7, za, zb, PIER_SIDE);
      sc.front(2.8, 8, 0, 0.7, za, PIER_SIDE);
      if (za < 50) {
        for (let pz = Math.trunc(za) + 1; pz < Math.trunc(zb); pz += 2) sc.ground(2.8, 8, pz, pz + 0.12, "#8A6542", 0.71);   // Bohlen
      }
      for (const pz of [za + 0.6, zb - 0.6]) sc.front(2.45, 2.85, 0, 2.2, pz, "#5A4632");   // Dalben, an denen die Fähre festmacht
      for (const pz of [zs + 2, zs + 9]) sc.front(7.2, 7.4, 0.7, 3.3, pz, "#5A6470");      // Wartehäuschen
      sc.ground(4.6, 8, zs + 2, zs + 9, "#5A6470", 3.3);
      const poleZ = zs + 12;
      sc.front(2.95, 3.05, 0.7, 4.3, poleZ, "#6F7378");
      stationSign(c, app, sc, 3.1, 6.6, 2.6, 3.3, poleZ, name, blue);
      if (poleZ > Z_NEAR && poleZ < Z_FAR) {
        // das gelbe Haltestellenschild mit grünem H
        const [hx, hy2] = sc.p(3.0, 4.3, poleZ), r = sc.size(0.45, poleZ);
        c.oval(hx - r, hy2 - r, hx + r, hy2 + r, { fill: "#F7D117", outline: "#2F8F4E", width: Math.max(1, r * 0.15) });
        if (r > 5) c.text(hx, hy2, "H", app.font(r * 1.3 / s, "bold"), "#2F8F4E");
      }
    }]);
  }

  for (const [, fn] of items.filter(it => it[0] < zEnd).sort((a, b) => b[0] - a[0])) fn();

  // --- der eigene Bug vorn im Bild ---
  const cx = (x1 + x2) / 2;
  const bow = [[cx - W * 0.42, y2 + 2], [cx - W * 0.17, y2 - H * 0.17], [cx, y2 - H * 0.23], [cx + W * 0.17, y2 - H * 0.17],
    [cx + W * 0.42, y2 + 2]];
  c.polygon(bow, { fill: MODE.faehre[3][0] });
  c.polygon([[cx - W * 0.35, y2 + 2], [cx - W * 0.14, y2 - H * 0.145], [cx, y2 - H * 0.195], [cx + W * 0.14, y2 - H * 0.145],
    [cx + W * 0.35, y2 + 2]], { fill: "#D9D4C7" });
  c.line(bow.slice(1, 4), { fill: "#7A808A", width: Math.max(2, 4 * s) });                         // Reling
  c.line([[cx, y2 - H * 0.23], [cx, y2 - H * 0.31]], { fill: "#555555", width: Math.max(1, 3 * s) });  // Fahnenstock
  c.polygon([[cx, y2 - H * 0.31], [cx + W * 0.03, y2 - H * 0.295], [cx, y2 - H * 0.28]], { fill: blue });
}

/** Bootshaus: Holzhalle quer über dem Wasser, mit offenem Tor, durch das die Fähre hineinfährt. */
function drawBoathouse(c, app, sc, z, color) {
  if (!(z > Z_NEAR && z < Z_FAR)) return;
  sc.poly([[-44, 8, z], [0, 14, z], [44, 8, z]], "#7A3E2E");               // Giebeldach
  sc.front(-40, -4.5, 0, 8, z, "#9C6B43");
  sc.front(4.5, 40, 0, 8, z, "#9C6B43");
  sc.front(-4.5, 4.5, 5.6, 8, z, "#9C6B43");
  for (let X = -38; X < 40; X += 3) sc.front(X, X + 0.15, 0, Math.abs(X) > 5 ? 8 : 0, z, "#835735");   // Bretter
  sc.front(-4.5, 4.5, 0, 5.6, z, "#1E2A33");                                // Tor: drinnen ist es dunkel
  sc.front(-4.5, 4.5, 0, 0.4, z, "#2C5674");                                // Wasser im Tor
  for (const X of [-16, -10, 10, 16]) sc.front(X - 1.6, X + 1.6, 3.0, 5.4, z, "#CFE8FF");   // Fenster
  stationSign(c, app, sc, -5.5, 5.5, 6.0, 7.6, z, "Bootshaus", color);
}

function drawScene(ride, c, app, x1, y1, x2, y2) {
  if (ride.kind === "faehre") return drawWaterScene(ride, c, app, x1, y1, x2, y2);
  if (ride.kind !== "tram" && ride.kind !== "bus") return drawRailScene(ride, c, app, x1, y1, x2, y2);
  // ab hier Straßenbahn und Bus: Straße zwischen Häusern
  const s = app.s, kind = ride.kind, st = app.data.stations, stops = ride.stops;
  const cam = ride.pos * SEG;
  const sc = new Scene(c, x1, y1, x2, y2);
  const hy = sc.hy;

  // --- Himmel und Boden ---
  const sky = ["#6FB6EA", "#82C0EE", "#96CAF1", "#AAD4F4", "#BFDFF6", "#D4EAF9"];
  const band = (hy - y1) / sky.length;
  sky.forEach((col, i) => c.rect(x1, y1 + i * band, x2, y1 + (i + 1) * band + 1, col));
  c.rect(x1, hy, x2, y2, "#B3AEA4");
  for (let k = 0; k < 14; k++) {                                           // Häuser am Horizont
    const bx = x1 + (x2 - x1) * k / 14, bh = (0.04 + 0.08 * rnd(k, 3)) * (y2 - y1);
    c.rect(bx, hy - bh, bx + (x2 - x1) / 14 + 1, hy + 1, ["#C9C2B8", "#BDB6C4", "#B8C6C9", "#CFC4B0"][k % 4]);
  }

  // --- Fahrweg ---
  sc.ground(-7.0, 2.3, Z_NEAR, Z_FAR, "#5C5E63");                         // Fahrbahn
  sc.ground(2.3, 7.0, Z_NEAR, Z_FAR, "#CBC5B8");                          // Gehweg rechts
  sc.ground(-10.0, -7.0, Z_NEAR, Z_FAR, "#CBC5B8");                       // Gehweg links
  sc.ground(2.2, 2.4, Z_NEAR, Z_FAR, "#E8E8E8", 0.02);                    // Bordstein

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
  } else {
    for (const [, z] of periodic(6)) sc.ground(-7.0, 2.3, z, z + 0.15, "#686A70", 0.01);     // Fugen
    for (const X of [-0.75, 0.75]) sc.ground(X - 0.05, X + 0.05, Z_NEAR, Z_FAR, "#9A9A9A", 0.06);   // Schienen in der Straße
  }

  // --- Betriebshof hinter der Endstation ---
  // Was dahinter liegt, ist verdeckt: Häuser, Bäume und Masten werden dort nicht mehr gezeichnet.
  let zEnd = Z_FAR + 100;
  if (ride.depot) {
    zEnd = stops.length * SEG - cam + 34;
    drawDepotHall(c, app, sc, zEnd, MODE[kind][2], kind);
  }

  // --- Dinge am Rand, von hinten nach vorn gezeichnet ---
  const items = [];
  const houses = [];      // Häuserzeilen liegen ganz außen und werden zuerst gezeichnet

  if (kind === "tram") {
    // Oberleitung: Draht und Masten
    c.line([sc.p(0, 5.6, Z_NEAR), sc.p(0, 5.6, Z_FAR)], { fill: "#2E2E2E", width: Math.max(1, 2 * s) });
    const mastX = 2.9;
    for (const [, z] of periodic(30, 7)) {
      items.push([z, () => {
        sc.front(mastX - 0.12, mastX + 0.12, 0, 6.3, z, "#5A5F66");
        sc.front(0.2, mastX, 5.75, 5.95, z, "#5A5F66");
      }]);
    }
  }
  for (const [k, z] of periodic(13, 4)) {
    if (rnd(k, 1) < 0.35) continue;
    const side = rnd(k, 2) < 0.5 ? -1 : 1;
    const X = side > 0 ? 4 + rnd(k, 4) * 2 : -(7.6 + rnd(k, 4) * 1.6);     // Bäume auf dem Gehweg
    items.push([z, () => {
      sc.front(X - 0.18, X + 0.18, 0, 2.4, z, "#6B4A2E");
      const [cx, cy] = sc.p(X, 4.0, z), r = sc.size(1.9 + 0.6 * rnd(k, 6), z);
      c.oval(cx - r, cy - r, cx + r, cy + r, { fill: ["#4F8F3F", "#5E9C46", "#477F38"][((k % 3) + 3) % 3] });
    }]);
  }
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

  // --- Haltestellen ---
  for (let i = Math.floor(ride.pos) - 1; i < Math.floor(ride.pos) + 3; i++) {
    if (i < 0 || i >= stops.length) continue;
    const zs = i * SEG - cam, name = st[stops[i]];
    const za = zs - 12, zb = zs + 28;        // 40 m Haltestelle, dazwischen freie Strecke
    if (zb < Z_NEAR || za > Z_FAR) continue;
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
// --- Waschanlage (Taste W auf dem Abstellgleis bzw. Betriebshof) ---------

const WASH_TIME = 10.0;     // Sekunden für eine Runde durch die Waschanlage
const WASH_START = -14.0;   // so viele Meter vor dem Tor geht es los (das Schild ist dann gut zu sehen)
// Ende jedes Schritts in Sekunden – passend dazu, wann man an Wasserbogen, Bürsten usw. vorbeifährt
const WASH_PHASES = [[2.2, "Einfahrt in die Waschanlage"], [4.3, "Wasser marsch!"], [6.9, "Die Bürsten schrubben …"],
  [8.1, "Abspülen"], [WASH_TIME, "Trocknen"]];
// Stationen in der Halle (Meter hinter dem Tor): Wasserbogen, zwei Bürstenpaare, Spülbogen, Gebläse
const WASH_SPRAY = 9.0, WASH_BRUSHES = [18.0, 22.0], WASH_RINSE = 30.0, WASH_BLOWER = 37.0, WASH_EXIT = 44.0;

/** Text zum Waschschritt nach t Sekunden. */
function washPhase(t) {
  return WASH_PHASES.find(([end]) => t < end || end === WASH_TIME)[1];
}

function washPhaseStart(text) {
  const i = WASH_PHASES.findIndex(([, name]) => name === text);
  return i > 0 ? WASH_PHASES[i - 1][0] : 0;
}

/** Fahrt durch die Waschanlage: Halle mit Wasserbögen und drehenden Bürsten, Schaum und Tropfen auf der Scheibe. */
function drawWash(ride, c, app, x1, y1, x2, y2, t) {
  const s = app.s;
  const sc = new Scene(c, x1, y1, x2, y2);
  const cam = WASH_START + (WASH_EXIT - WASH_START) * Math.min(1, t / WASH_TIME);
  const phase = washPhase(t);

  // draußen: Himmel und Hof, dann die Halle
  const sky = ["#9CC8EA", "#B4D5EF", "#CCE3F4"];
  const band = (sc.hy - y1) / sky.length;
  sky.forEach((col, i) => c.rect(x1, y1 + i * band, x2, y1 + (i + 1) * band + 1, col));
  c.rect(x1, sc.hy, x2, y2, "#9A968E");
  const za = Math.max(-cam, Z_NEAR), zb = WASH_EXIT - cam;          // hinten durch die Ausfahrt sieht man nach draußen
  sc.wall(-3.2, 0, 4.8, za, zb, "#B9C4CC");
  sc.wall(3.2, 0, 4.8, za, zb, "#B9C4CC");
  sc.ground(-3.2, 3.2, za, zb, "#8F9BA5", 4.8);
  const ferry = ride.kind === "faehre";                            // die Fähre schwimmt durch die Waschanlage
  sc.ground(-3.2, 3.2, za, zb, ferry ? WATER : "#5E666E");
  for (let k = 0; k < WASH_EXIT; k += 3) {                         // nasse Rinnen im Boden bzw. Wellen
    sc.ground(-3.2, 3.2, k - cam, k - cam + 0.25, ferry ? "#5FA3D0" : "#4C545C", 0.01);
  }
  for (let k = 2; k < WASH_EXIT; k += 6) sc.ground(-0.6, 0.6, k - cam, k - cam + 1.5, "#E8F4FF", 4.78);   // Lampen
  if (ride.kind !== "bus" && !ferry) for (const X of [-0.75, 0.75]) sc.ground(X - 0.05, X + 0.05, za, zb, "#C8C8C8", 0.06);

  const arch = (z, color) => {
    sc.front(-3.0, -2.75, 0, 4.4, z, color);
    sc.front(2.75, 3.0, 0, 4.4, z, color);
    sc.front(-3.0, 3.0, 4.15, 4.4, z, color);
  };
  const spray = (z, active) => {
    arch(z, "#3D7FC1");
    if (active && Z_NEAR < z && z < 20) {
      for (let i = 0; i < 14; i++) {                                 // Wasserstrahlen aus den Düsen
        const side = i % 2 ? -1 : 1;
        const y0 = 0.5 + 3.6 * rnd(i, 3);
        const a = sc.p(side * 2.8, y0, z);
        const b = sc.p(side * (0.4 + rnd(i + Math.floor(t * 8), 4)), y0 - 0.6, z - 1.5);
        c.line([a, b], { fill: "#CDEBFF", width: Math.max(1, sc.size(0.06, z)) });
      }
    }
  };
  const brushes = (z, k) => {
    for (const X of [-2.25, 2.25]) {
      const [base, light] = (X < 0) === (k === 0) ? ["#2F6FD6", "#7FB2FF"] : ["#D63F3F", "#FF9A8A"];
      sc.front(X - 0.75, X + 0.75, 0, 4.2, z, base);
      for (let b = 0; b < 9; b++) {                                  // Streifen laufen: die Bürste dreht sich
        const y = (((b * 0.5 + t * 2.4 * (X < 0 ? 1 : -1)) % 4.2) + 4.2) % 4.2;
        sc.front(X - 0.75, X + 0.75, y, Math.min(4.2, y + 0.18), z, light);
      }
      sc.front(X - 0.08, X + 0.08, 4.2, 4.8, z, "#5F646B");
    }
  };
  const items = [];
  items.push([WASH_SPRAY - cam, () => spray(WASH_SPRAY - cam, phase === "Wasser marsch!")]);
  WASH_BRUSHES.forEach((bz, k) => items.push([bz - cam, () => brushes(bz - cam, k)]));
  items.push([WASH_RINSE - cam, () => spray(WASH_RINSE - cam, phase === "Abspülen")]);
  items.push([WASH_BLOWER - cam, () => {
    sc.front(-3.0, 3.0, 3.9, 4.5, WASH_BLOWER - cam, "#9AA4AD");
    sc.front(-2.2, 2.2, 3.95, 4.05, WASH_BLOWER - cam, "#2A3138");
  }]);
  items.sort((a, b) => b[0] - a[0]);
  for (const [z, fn] of items) if (Z_NEAR < z && z < Z_FAR) fn();
  const ze = -cam;                                                   // Tor mit Schild, solange es vor uns ist
  if (Z_NEAR < ze) {
    sc.front(-14, -3.2, 0, 7.5, ze, "#7C8A96");
    sc.front(3.2, 14, 0, 7.5, ze, "#7C8A96");
    sc.front(-3.2, 3.2, 4.8, 7.5, ze, "#7C8A96");
    stationSign(c, app, sc, -3.0, 3.0, 5.3, 6.9, ze, "Waschanlage", "#2B7BB9");
  }

  // --- auf der Scheibe: Tropfen und Schaum ---
  const w = x2 - x1, h = y2 - y1;
  const wet = ["Wasser marsch!", "Die Bürsten schrubben …", "Abspülen"].includes(phase);
  if (wet || phase === "Trocknen") {
    const n = wet ? 45 : 12, frame = Math.floor(t * 6);             // Tropfen wechseln ein paar Mal pro Sekunde
    for (let i = 0; i < n; i++) {
      const dx = x1 + w * rnd(i, frame), dy = y1 + h * rnd(i, frame + 1000);
      const r = (3 + 6 * rnd(i, 7)) * s;
      c.oval(dx - r, dy - r, dx + r, dy + r * 1.4, { fill: "#D6EEFF", outline: "#9CC7E8" });
    }
  }
  let foam = 0;
  if (phase === "Die Bürsten schrubben …") foam = Math.min(1, (t - washPhaseStart(phase)) / 2.0);
  else if (phase === "Abspülen") foam = Math.max(0, 1 - (t - washPhaseStart(phase)) / 1.0);
  for (let i = 0; i < Math.floor(34 * foam); i++) {
    const fx = x1 + w * (0.05 + 0.9 * rnd(i, 21)), fy = y1 + h * (0.25 + 0.75 * rnd(i, 22));
    const r = (18 + 30 * rnd(i, 23)) * s;
    c.oval(fx - r, fy - r * 0.8, fx + r, fy + r * 0.8, { fill: "#FAFCFF", outline: "#DCE6EE" });
  }
  if (phase === "Trocknen") {
    // der Scheibenwischer wischt hin und her
    const px = x1 + w * 0.32, py = y2 - 6 * s;
    const a = (-160 + 120 * (0.5 + 0.5 * Math.sin((t - washPhaseStart(phase)) * 5))) * Math.PI / 180;
    const len = w * 0.36;
    c.line([[px, py], [px + Math.cos(a) * len, py + Math.sin(a) * len]], { fill: "#1B1E23", width: Math.max(3, 7 * s), cap: "round" });
  }
}

function drawCockpit(ride, c, w, h) {
  const app = ride.app, s = app.s, st = app.data.stations;
  const line = ride.line, kind = ride.kind, stops = ride.stops;
  const last = ride.index === stops.length - 1;
  const frame = "#2B2F36", accent = readable(line.color);

  const topH = 112 * s, dashTop = h * 0.6, pillar = 30 * s;
  const wx1 = pillar, wy1 = topH, wx2 = w - pillar, wy2 = dashTop + 30 * s;
  if (ride.washing) drawWash(ride, c, app, wx1, wy1, wx2, wy2, ride.washTime);
  else drawScene(ride, c, app, wx1, wy1, wx2, wy2);

  // Fensterrahmen (deckt alles ab, was über das Fenster hinausragt)
  c.rect(0, 0, w, wy1, frame);
  c.rect(0, 0, wx1, h, frame);
  c.rect(wx2, 0, w, h, frame);
  c.roundRect(wx1 - 10 * s, wy1 - 10 * s, wx2 + 10 * s, wy2 + 10 * s, 30 * s, { outline: frame, width: 22 * s });
  c.rect(0, topH - 8 * s, w, topH - 2 * s, accent);
  // Scheibenwischer (beim Trocknen in der Waschanlage bewegt er sich)
  if (!(ride.washing && washPhase(ride.washTime) === "Trocknen")) c.line([[wx1 + (wx2 - wx1) * 0.32, wy2 - 6 * s], [wx1 + (wx2 - wx1) * 0.12, wy2 - 70 * s]], { fill: "#1B1E23", width: Math.max(2, 5 * s), cap: "round" });

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
  if (ride.washing) second = washPhase(ride.washTime);
  else if (text && now() < until) second = text;
  else if (ride.depot) second = `${depotName} – Pause. Zurück: Taste ${depotKey} · Waschen: W`;
  else if (last) second = ride.ring ? "Einmal rund um die Stadt!" : "Endstation – bitte alle aussteigen";
  else {
    second = "Nächster Halt: " + st[stops[ride.index + 1]];
    const minutes = ride.travelTime(ride.index);
    if (minutes !== null) second += " · " + minutesText(minutes);
  }
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
    c.text(x + listW / 2, py1 + ph * 0.4, depotName.toUpperCase(), app.font(22, "bold"), LED);
    c.text(x + listW / 2, py1 + ph * 0.6, `Pause · Taste ${depotKey}: zurück`, app.font(14, "bold"), "#FFD27A");
    if (!ride.washing) {
      // Knopf für die Waschanlage (auch zum Antippen)
      const bw2 = Math.min(listW - 30 * s, 190 * s), bh2 = 34 * s;
      const bx1 = x + (listW - bw2) / 2, by1 = py1 + ph * 0.72;
      c.roundRect(bx1, by1, bx1 + bw2, by1 + bh2, bh2 / 2, { fill: "#2B7BB9" });
      c.text(bx1 + bw2 / 2, by1 + bh2 / 2, "W  Waschanlage", app.font(14, "bold"), "white");
      app.hit(bx1, by1, bx1 + bw2, by1 + bh2, () => ride.wash());
    }
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
    ["Ö", "Türen auf", () => ride.toggleOpen(), !ride.depot && !ride.washing, "#2BA59B"],
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
  if (opt.kind === "schiff") {
    const cruise = new CruiseScreen(app, opt.index, opt.direction, linesScreen, opt.stop);
    cruise.say(message, 2.5);
    app.sound.stop();
    app.show(cruise);
    app.animate();
    return;
  }
  if (opt.kind === "flug") {
    const flight = new FlightScreen(app, opt.index, opt.direction, linesScreen);
    flight.say(message, 2.5);
    app.sound.stop();
    app.show(flight);
    app.animate();
    return;
  }
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

// --------------------------------------------------------------------------
// Fliegen ab dem BER
// --------------------------------------------------------------------------

const TAKEOFF_T = 9.0;        // Sekunden vom Losrollen bis zur Reiseflughöhe
const LANDING_T = 10.0;       // Sekunden vom Sinkflug bis zum Stillstand
const TOUCHDOWN_T = 6.5;      // nach so vielen Sekunden setzt das Flugzeug auf
const FLY_V = 1.4;            // Tempo in der Luft (Fensterbreiten pro Sekunde)
const CRUISE_A = 1.9;         // Reiseflughöhe (in Bildhöhen)
const CLOUDS_A = [1.0, 1.6];  // Wolkendecke (in Bildhöhen)
const PLANE_X = 0.3;          // hier steht das Flugzeug im Bild (Anteil der Breite)
const SCENE_X = 0.64;         // hier steht das Wahrzeichen, wenn das Flugzeug am Boden ist
const FAR = 0.06;             // so langsam zieht der weit entfernte Hintergrund vorbei
const CAM_LIMIT = 0.36;       // höher steigt das Flugzeug im Bild nicht – dann sinkt stattdessen der Boden
const LANDING_X = FLY_V * TOUCHDOWN_T + FLY_V * (LANDING_T - TOUCHDOWN_T) / 2;
const SCENE_SCALE = 0.0042;   // Wahrzeichen: Bildhöhen pro Einheit
const PLANE_COLORS = ["#FFFFFF", "#1C6DD0"];

/** Flüge aus data.flights als Linien „BER → Ziel“ und zurück eintragen. */
function addFlights(data) {
  if (data.lines.flug) return;
  const flights = data.flights || { home: null, flights: [], land: [] };
  data.flights = flights;
  const stations = data.stations;
  let ber = Object.keys(stations).find(k => stations[k] === "Flughafen BER");
  if (!ber) { ber = "BER"; stations[ber] = "Flughafen BER"; }
  data.airport = ber;
  data.lines.flug = flights.flights.map(f => {
    const key = "AP:" + f.code;
    stations[key] = f.name;
    return { name: f.code, color: f.color, directions: [[ber, key], [key, ber]] };
  });
}

function smooth(u) {
  u = Math.max(0, Math.min(1, u));
  return u * u * (3 - 2 * u);
}

/** Farbe zwischen c1 (t = 0) und c2 (t = 1). */
function mix(c1, c2, t) {
  t = Math.max(0, Math.min(1, t));
  const a = [1, 3, 5].map(i => parseInt(c1.slice(i, i + 2), 16));
  const b = [1, 3, 5].map(i => parseInt(c2.slice(i, i + 2), 16));
  return "#" + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function takeoffX(t) {
  const tr = FLY_V / 0.32;
  return t < tr ? 0.16 * t * t : 0.16 * tr * tr + FLY_V * (t - tr);
}

const deg = r => r * 180 / Math.PI;

/** [Weg, Höhe, Neigung in Grad, Tempo] – Weg in Fensterbreiten, Höhe in Bildhöhen. */
function flightState(phase, t) {
  if (phase === "takeoff") {
    const alt = u => (u < 4 ? 0 : CRUISE_A * smooth((u - 4) / 5));
    const x = takeoffX(t), a = alt(t), v = Math.min(FLY_V, 0.32 * t);
    let pitch = deg(Math.atan2((alt(t + 0.05) - a) / 0.05 * 0.6, Math.max(v, 0.1)));
    if (t >= 3.4 && t < 4.6) pitch = Math.max(pitch, 7 * Math.min(1, (t - 3.4) / 0.6));   // „Rotieren“
    return [x, a, Math.min(15, pitch), v];
  }
  if (phase === "cruise") return [takeoffX(TAKEOFF_T) + FLY_V * t, CRUISE_A + 0.015 * Math.sin(1.3 * t), 0, FLY_V];
  if (phase === "landing") {
    if (t < TOUCHDOWN_T) {
      const alt = u => CRUISE_A * (1 - smooth(u / TOUCHDOWN_T));
      const a = alt(t);
      let pitch = Math.max(-4, 0.5 * deg(Math.atan2((alt(t + 0.05) - a) / 0.05 * 0.6, FLY_V)));
      if (t > TOUCHDOWN_T - 0.9) pitch = Math.max(pitch, 3 * (t - TOUCHDOWN_T + 0.9) / 0.9);   // abfangen
      return [FLY_V * t, a, pitch, FLY_V];
    }
    const b = LANDING_T - TOUCHDOWN_T, d = Math.min(t, LANDING_T) - TOUCHDOWN_T;
    return [FLY_V * TOUCHDOWN_T + FLY_V * (d - d * d / (2 * b)), 0, Math.max(0, 3 * (1 - d / 0.6)), FLY_V * (1 - d / b)];
  }
  if (phase === "arrived") return [LANDING_X, 0, 0, 0];
  return [0, 0, 0, 0];
}

function hoursText(hours, spoken = false) {
  let h = Math.floor(hours), m = Math.round((hours - h) * 60 / 5) * 5;
  if (m === 60) { h += 1; m = 0; }
  const [uh, um] = spoken ? [h === 1 ? "Stunde" : "Stunden", "Minuten"] : ["Std.", "Min."];
  const parts = (h ? [`${h} ${uh}`] : []).concat(m || !h ? [`${m} ${um}`] : []);
  return parts.join(" ");
}

const rad = d => d * Math.PI / 180;

/** Punkte [Breite, Länge] auf dem kürzesten Weg über die Erdkugel. */
function greatCircle(a, b, n = 48) {
  const [la1, lo1, la2, lo2] = [a[0], a[1], b[0], b[1]].map(rad);
  const p1 = [Math.cos(la1) * Math.cos(lo1), Math.cos(la1) * Math.sin(lo1), Math.sin(la1)];
  const p2 = [Math.cos(la2) * Math.cos(lo2), Math.cos(la2) * Math.sin(lo2), Math.sin(la2)];
  const om = Math.acos(Math.max(-1, Math.min(1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2])));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    let q = p1;
    if (om >= 1e-9) {
      const k1 = Math.sin((1 - f) * om) / Math.sin(om), k2 = Math.sin(f * om) / Math.sin(om);
      q = p1.map((x, j) => k1 * x + k2 * p2[j]);
    }
    out.push([deg(Math.atan2(q[2], Math.hypot(q[0], q[1]))), deg(Math.atan2(q[1], q[0]))]);
  }
  return out;
}

function earthKm(a, b) {
  const [la1, lo1, la2, lo2] = [a[0], a[1], b[0], b[1]].map(rad);
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Schneidet ein Vieleck auf ein Rechteck zu (Sutherland-Hodgman). */
function clipPolygon(pts, x1, y1, x2, y2) {
  const clip = (points, inside, cut) => {
    const out = [];
    points.forEach((p, i) => {
      const q = points[(i + points.length - 1) % points.length];
      if (inside(p)) {
        if (!inside(q)) out.push(cut(q, p));
        out.push(p);
      } else if (inside(q)) out.push(cut(q, p));
    });
    return out;
  };
  const atX = x => (q, p) => [x, q[1] + (p[1] - q[1]) * (x - q[0]) / (p[0] - q[0])];
  const atY = y => (q, p) => [q[0] + (p[0] - q[0]) * (y - q[1]) / (p[1] - q[1]), y];
  for (const [inside, cut] of [[p => p[0] >= x1, atX(x1)], [p => p[0] <= x2, atX(x2)],
    [p => p[1] >= y1, atY(y1)], [p => p[1] <= y2, atY(y2)]]) {
    pts = clip(pts, inside, cut);
    if (!pts.length) break;
  }
  return pts;
}

/** Flugzeug von oben (für Schilder und die Karte); angle im Uhrzeigersinn ab „nach oben“. */
function planeTopPoints(cx, cy, size, angle) {
  const half = [[0, -0.5], [0.05, -0.44], [0.055, -0.12], [0.46, 0.08], [0.46, 0.15], [0.055, 0.05], [0.045, 0.3],
    [0.17, 0.4], [0.17, 0.46], [0, 0.42]];
  const pts = half.concat(half.slice(1, -1).reverse().map(([x, y]) => [-x, y]));
  const ca = Math.cos(angle), sa = Math.sin(angle);
  return pts.map(([x, y]) => [cx + (x * ca - y * sa) * size, cy + (x * sa + y * ca) * size]);
}

/** Verkehrsflugzeug von der Seite, Nase rechts (flip: links); pitch > 0 = Nase hoch. */
function drawPlane(c, cx, cy, length, pitch = 0, flip = false, gear = true, colors = PLANE_COLORS) {
  const [body, accent] = colors;
  const a = rad(pitch), ca = Math.cos(a), sa = Math.sin(a), mx = flip ? -1 : 1;
  const T = pts => pts.map(([x, y]) => [cx + mx * (x * ca + y * sa) * length, cy + (-x * sa + y * ca) * length]);
  const poly = (pts, fill, outline) => c.polygon(T(pts), { fill, outline, width: Math.max(1, length / 160) });
  const lineW = Math.max(1, length / 70);
  if (gear) {
    for (const x of [0.37, -0.06]) c.line(T([[x, 0.05], [x, 0.1]]), { fill: "#5A6370", width: lineW });
    for (const x of [0.37, -0.075, -0.045]) poly(circlePoints(x, 0.105, 0.016, 10), "#2B2F36");
  }
  poly([[-0.36, -0.04], [-0.45, -0.21], [-0.5, -0.21], [-0.49, -0.03]], accent);                    // Seitenleitwerk
  poly([[-0.5, -0.045], [0.34, -0.055], [0.44, -0.045], [0.495, -0.015], [0.51, 0.01], [0.49, 0.035],
    [0.43, 0.055], [-0.28, 0.055], [-0.44, 0.025], [-0.51, -0.02]], body, "#9AA4AD");               // Rumpf
  poly([[-0.47, 0.004], [0.5, 0.004], [0.5, 0.016], [-0.45, 0.016]], accent);                       // Zierstreifen
  for (let i = 0; i < 20; i++) poly(circlePoints(-0.34 + i * 0.034, -0.018, 0.0085, 8), "#2B3A4A"); // Fenster
  poly([[0.43, -0.034], [0.468, -0.034], [0.492, -0.012], [0.44, -0.012]], "#2B3A4A");              // Cockpit
  poly([[0.35, -0.042], [0.38, -0.042], [0.38, 0.032], [0.35, 0.032]], body, "#9AA4AD");             // Tür
  poly([[-0.38, -0.005], [-0.49, -0.035], [-0.52, -0.03], [-0.44, 0.006]], darker(accent, 0.8));     // Höhenleitwerk
  poly([[0.1, 0.03], [-0.1, 0.075], [-0.16, 0.075], [0, 0.03]], "#B8C2CC");                         // Flügel
  poly(roundRectPoints(-0.04, 0.055, 0.11, 0.105, 0.02), "#D5DBE1", "#9AA4AD");                     // Triebwerk
  poly([[0.1, 0.06], [0.115, 0.06], [0.115, 0.1], [0.1, 0.1]], "#3A4450");
}

/** Wahrzeichen aus flights.json zeichnen: Ursprung (ox, oy) am Boden, k Pixel pro Einheit. */
function drawShapes(c, shapes, ox, oy, k, clamp = null) {
  const P = pts => { const out = []; for (let i = 0; i + 1 < pts.length; i += 2) out.push([ox + pts[i] * k, oy - pts[i + 1] * k]); return out; };
  for (const sh of shapes) {
    const [kind, fill] = sh;
    if (kind === "p") c.polygon(P(sh[2]), { fill });
    else if (kind === "r") {
      // clamp = [links, rechts] in Einheiten: breite Flächen (Wasser, Strand) enden dort
      const rx1 = clamp ? Math.max(sh[2], clamp[0]) : sh[2], rx2 = clamp ? Math.min(sh[4], clamp[1]) : sh[4];
      if (rx1 < rx2) c.rect(ox + rx1 * k, oy - sh[5] * k, ox + rx2 * k, oy - sh[3] * k, fill);
    }
    else if (kind === "o") {
      const [, , cx, cy, rx, ry] = sh;
      c.oval(ox + (cx - rx) * k, oy - (cy + ry) * k, ox + (cx + rx) * k, oy - (cy - ry) * k, { fill });
    } else if (kind === "l") c.line(P(sh[3]), { fill, width: Math.max(1, sh[2] * k), cap: "round", join: "round" });
  }
}

function drawCloud(c, x, y, r, top, bottom) {
  c.oval(x - r * 1.6, y - r * 0.55, x + r * 1.6, y + r * 0.55, { fill: bottom });
  c.oval(x - r * 1.1, y - r * 0.9, x + r * 0.3, y + r * 0.3, { fill: top });
  c.oval(x - r * 0.3, y - r * 1.15, x + r * 1.1, y + r * 0.25, { fill: top });
}

/** Ausschnitt der Weltkarte mit der Flugroute; zugeschnittene Landflächen werden gemerkt. */
class WorldMap {
  constructor(land) {
    this.land = land.map(r => { const out = []; for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i], r[i + 1]]); return out; });
    this.key = null;
    this.polys = [];
  }

  frame(a, b, x1, y1, x2, y2) {
    const route = greatCircle(a, b);
    const lats = route.map(p => p[0]), lons = route.map(p => p[1]);
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons));
    const pad = Math.max(8, 0.2 * span);
    const la1 = Math.min(...lats) - pad, la2 = Math.max(...lats) + pad;
    const lo1 = Math.min(...lons) - pad, lo2 = Math.max(...lons) + pad;
    const cosM = Math.cos(rad((la1 + la2) / 2));
    const scale = Math.min((x2 - x1) / ((lo2 - lo1) * cosM), (y2 - y1) / (la2 - la1));
    const latC = (la1 + la2) / 2, lonC = (lo1 + lo2) / 2, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    return [route, (lat, lon) => [cx + (lon - lonC) * cosM * scale, cy - (lat - latC) * scale]];
  }

  draw(c, a, b, x1, y1, x2, y2, s, progress, labels, font) {
    const [route, proj] = this.frame(a, b, x1, y1, x2, y2);
    const key = [a, b, x1, y1, x2, y2].map(v => (Array.isArray(v) ? v.join(",") : Math.round(v))).join("|");
    if (key !== this.key) {
      this.polys = this.land.map(ring => clipPolygon(ring.map(([lon, lat]) => proj(lat, lon)), x1, y1, x2, y2))
        .filter(p => p.length >= 3);
      this.key = key;
    }
    c.rect(x1, y1, x2, y2, "#AFD7EE");
    for (const p of this.polys) c.polygon(p, { fill: "#F1E9D2", outline: "#D2C6A5", width: 1 });
    const pts = route.map(([lat, lon]) => proj(lat, lon));
    const n = pts.length - 1, done = progress * n;
    for (let i = 0; i < n; i++) {                      // Route: geflogen durchgezogen, sonst Punkte
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      if (i + 1 <= done) c.line([[ax, ay], [bx, by]], { fill: "#1C6DD0", width: Math.max(2, 3 * s), cap: "round" });
      else if (i % 2 === 0) c.oval(ax - 1.8 * s, ay - 1.8 * s, ax + 1.8 * s, ay + 1.8 * s, { fill: "#1C6DD0" });
    }
    [[pts[0], labels[0]], [pts[n], labels[1]]].forEach(([[x, y], label]) => {
      c.oval(x - 5 * s, y - 5 * s, x + 5 * s, y + 5 * s, { fill: "#E8483B", outline: "white", width: 2 * s });
      const tw = font.measure(label);
      const lx = Math.min(Math.max(x, x1 + tw / 2 + 4 * s), x2 - tw / 2 - 4 * s);
      const ly = y - 24 * s > y1 ? y - 16 * s : y + 16 * s;
      c.text(lx, ly, label, font, "#1E2A38");
    });
    const i = Math.min(n - 1, Math.floor(done)), f = done - i;
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
    const angle = Math.atan2(bx - ax, -(by - ay));
    c.polygon(planeTopPoints(px + 1.5 * s, py + 2 * s, 30 * s, angle), { fill: "#5E7A93" });
    c.polygon(planeTopPoints(px, py, 30 * s, angle), { fill: "white", outline: "#1C6DD0", width: Math.max(1, 1.5 * s) });
  }
}

const HANGAR_T = 2.8;          // Sekunden zum Hinein- bzw. Hinausrollen
// Erfundene Flugzeug-Waschanlage: Ende jedes Schritts in Sekunden
const PLANE_WASH = [[3.5, "Einschäumen"], [7.0, "Bürsten"], [9.5, "Abspülen"], [12.0, "Trocknen"], [14.0, "Blitzblank!"]];
const PLANE_WASH_T = PLANE_WASH[PLANE_WASH.length - 1][0];

/** [Schritt, Fortschritt 0…1] der Flugzeugwäsche nach t Sekunden. */
function planeWashPhase(t) {
  let start = 0;
  for (const [end, name] of PLANE_WASH) {
    if (t < end || end === PLANE_WASH_T) return [name, Math.min(1, Math.max(0, (t - start) / (end - start)))];
    start = end;
  }
}

/** Ein Flug vom BER zum Ziel (Richtung 0) oder zurück (Richtung 1): Boarding, Start, Reiseflug, Landung. */
class FlightScreen extends Screen {
  constructor(app, index, direction = 0, linesScreen = null) {
    super(app);
    this.kind = "flug";
    this.index = index;
    this.direction = direction;
    this.linesScreen = linesScreen;
    this.line = app.data.lines.flug[index];
    this.flight = app.data.flights.flights[index];
    this.home = app.data.flights.home;
    this.clean = false;      // nach dem Waschen glänzt das Flugzeug, nach dem nächsten Flug ist es wieder schmutzig
    this.startGate();
  }

  startGate() {
    this.phase = "gate";
    this.t0 = now();
    this.boost = 0;
    this.door = null;        // offene Flugzeugtür mit Fluggästen auf der Treppe (Taste Ö)
    this.hangar = null;      // im Hangar (Taste H), dort auch die Waschanlage (Taste W)
    this.message = [`Boarding nach ${this.target.name}! Drücke ▼ zum Abflug.`, now() + 4];
  }

  // --- Zustand ---
  get origin() { return this.direction === 0 ? this.home : this.flight; }
  get target() { return this.direction === 0 ? this.flight : this.home; }
  get t() { return now() - this.t0 + (this.phase === "cruise" ? this.boost : 0); }
  cruiseLen() { return Math.max(6, Math.min(18, 5 + 0.6 * this.flight.hours)); }

  /** Anteil der Strecke für die Karte (0 … 1). */
  progress() {
    const t = this.t;
    if (this.phase === "takeoff") return 0.05 * Math.min(1, t / TAKEOFF_T);
    if (this.phase === "cruise") return 0.05 + 0.9 * Math.min(1, t / this.cruiseLen());
    if (this.phase === "landing") return 0.95 + 0.05 * Math.min(1, t / LANDING_T);
    return this.phase === "arrived" ? 1 : 0;
  }

  /** Lange Flüge gehen durch die Nacht. */
  night() {
    if (this.phase !== "cruise" || this.flight.hours < 8) return 0;
    return 0.85 * Math.sin(Math.PI * Math.min(1, this.t / this.cruiseLen())) ** 2;
  }

  /** Steht das Flugzeug am BER (dann kann man in Bahn und Bus umsteigen)? */
  atAirport() {
    return (this.phase === "gate" && this.direction === 0) || (this.phase === "arrived" && this.direction === 1);
  }

  say(text, seconds = 2.5) { this.message = [text, now() + seconds]; }

  setPhase(phase) {
    this.phase = phase;
    this.t0 = now();
    this.boost = 0;
  }

  // --- Aktionen ---
  /** ▼ / Leertaste: abfliegen; im Reiseflug schneller fliegen. */
  go() {
    const app = this.app;
    if (this.hangar) {
      this.say("Erst aus dem Hangar rollen: Taste H", 2);
    } else if (this.door) {
      this.say("Erst die Tür schließen: Taste Ö", 2);
    } else if (this.phase === "gate") {
      this.setPhase("takeoff");
      this.say("Startfreigabe! Volle Kraft voraus!", 3);
      app.sound.play("jet");
    } else if (this.phase === "cruise") {
      this.boost += 0.15 * this.cruiseLen();
      this.say("Schneller! Rückenwind!", 1.5);
    } else if (this.phase === "arrived") {
      this.say(this.direction === 0 ? "Rückflug? Drücke R." : "Umsteigen in Bahn und Bus? Drücke U.", 2.5);
    }
    app.animate();
  }

  /** Taste Ö: Flugzeugtür auf – Fluggäste steigen über die Treppe ein (am Start) bzw. aus (am Ziel). */
  toggleOpen() {
    const t = now();
    if (this.hangar) {
      this.say("Im Hangar steigt niemand ein.", 2);
    } else if (this.phase !== "gate" && this.phase !== "arrived") {
      this.say("In der Luft bleibt die Tür zu!", 2);
    } else if (this.door) {
      if (this.door.closing !== null) return;
      if (t < this.door.done) this.say("Moment – es steigen noch Leute ein und aus!", 2);
      else {
        this.door.closing = t;
        this.doors();
      }
    } else {
      const way = this.phase === "gate" ? "in" : "out";
      const rng = seededRandom(`${this.flight.code}-${this.direction}-${way}`);
      const people = Array.from({ length: 6 }, (_, k) => [randomLook(rng), 0.7 * k]);
      this.door = { t0: t, closing: null, way, people, done: t + 0.8 + 0.7 * 5 + 3.4 };
      this.say(way === "in" ? "Boarding! Die Fluggäste steigen ein." : "Aussteigen! Alle gehen von Bord.", 3);
    }
    this.app.animate();
  }

  // --- Hangar (Taste H) und Flugzeug-Waschanlage (Taste W) ---
  /** null, ["rein", 0…1], ["drin", null] oder ["raus", 0…1]. */
  hangarState() {
    const hg = this.hangar;
    if (!hg) return null;
    const t = now();
    if (hg.out !== null) return ["raus", Math.min(1, (t - hg.out) / HANGAR_T)];
    if (t - hg.t0 < HANGAR_T) return ["rein", (t - hg.t0) / HANGAR_T];
    return ["drin", null];
  }

  planeWashT() {
    const hg = this.hangar;
    return !hg || hg.wash === null ? null : now() - hg.wash;
  }

  /** Taste H: am Boden in den großen Hangar rollen – und wieder hinaus. */
  toggleHangar() {
    const app = this.app, t = now(), state = this.hangarState();
    if (this.phase !== "gate" && this.phase !== "arrived") this.say("In der Luft gibt es keinen Hangar!", 2);
    else if (this.door) this.say("Erst die Tür schließen: Taste Ö", 2);
    else if (!state) {
      this.hangar = { t0: t, out: null, wash: null, said: null };
      this.say("Ab in den Hangar!", 2.5);
      app.sound.play("jet");
    } else if (state[0] !== "drin") return;
    else if (this.planeWashT() !== null) this.say("Erst fertig waschen!", 2);
    else {
      this.hangar.out = t;
      this.say("Wir rollen hinaus.", 2.5);
      app.sound.play("jet");
    }
    app.animate();
  }

  /** Taste W: im Hangar durch die (erfundene) Flugzeug-Waschanlage. */
  washPlane() {
    const state = this.hangarState();
    if (!state || state[0] !== "drin") this.say("Gewaschen wird im Hangar – erst Taste H!", 2.5);
    else if (this.planeWashT() === null) {
      this.hangar.wash = now();
      this.app.sound.play("bus");
      this.say("Die Waschanlage startet!", 2);
    }
    this.app.animate();
  }

  /** Hangar von außen beim Hinein- und Hinausrollen; part: "hinten" (vor dem Flugzeug) oder "vorn". */
  drawHangarOutside(c, x1, gy, H, W, fullX2, slide, part) {
    const s = this.app.s;
    const hx = x1 + (0.62 + slide) * W, top = gy - 0.64 * H, doorTop = gy - 0.46 * H;
    const right = Math.max(fullX2, hx + 1.4 * W);
    if (part === "hinten") {
      const arc = Array.from({ length: 21 }, (_, k) => [hx + (right - hx) * k / 20, top - 0.08 * H * Math.sin(Math.PI * k / 20)]);
      c.polygon([[hx, gy]].concat(arc, [[right, gy]]), { fill: "#B9C1CA" });
      c.rect(hx + 0.05 * W, doorTop, right, gy, "#3A4048");
      for (let k = 0; k < 6; k++) {                                   // Lampen in der Halle
        const lx = hx + 0.15 * W + k * 0.18 * W;
        c.oval(lx - 6 * s, doorTop + 0.05 * H - 4 * s, lx + 6 * s, doorTop + 0.05 * H + 4 * s, { fill: "#FFE9A8" });
      }
      c.rect(hx + 0.05 * W, gy - 0.015 * H, right, gy, "#5A616B");
    } else {
      c.rect(hx, top, right, doorTop, "#C9D0D8");
      for (let k = 0; hx + k * 0.03 * W <= right; k++) {              // Wellblech
        const lx = hx + k * 0.03 * W;
        c.line([[lx, top], [lx, doorTop]], { fill: "#AFB8C2", width: Math.max(1, s) });
      }
      c.polygon([[hx, top], [hx + 0.05 * W, top], [hx + 0.05 * W, gy], [hx, gy]], { fill: "#C9D0D8", outline: "#AFB8C2" });
      c.rect(hx + 0.05 * W, doorTop - 3 * s, right, doorTop + 3 * s, "#F2B233");
      c.text(hx + 0.32 * W, (top + doorTop) / 2, "HANGAR", this.app.font(28, "bold"), "#1E2A38");
    }
  }

  /** Im Hangar: große Halle, das Flugzeug – und die Flugzeug-Waschanlage. */
  drawHangar(c, x1, y1, x2, y2, fullX2) {
    const app = this.app, s = app.s;
    const W = x2 - x1, H = y2 - y1, X = f => x1 + f * W, Y = f => y1 + f * H;
    const gy = Y(0.82), wt = this.planeWashT();
    const [phase, f] = wt !== null ? planeWashPhase(wt) : [null, 0];

    // Halle: Rückwand, Fensterband, Dachbinder, Lampen
    c.rect(x1, y1, fullX2, gy, "#D5DAE0");
    for (let k = 0; X(k * 0.06) < fullX2; k++) c.line([[X(k * 0.06), Y(0.2)], [X(k * 0.06), gy]], { fill: "#C3C9D0", width: Math.max(1, 2 * s) });
    c.rect(x1, Y(0.08), fullX2, Y(0.2), "#CFE6F7");
    for (let k = 0; X(k * 0.08) < fullX2; k++) c.rect(X(k * 0.08) - 3 * s, Y(0.08), X(k * 0.08) + 3 * s, Y(0.2), "#8B949E");
    c.rect(x1, y1, fullX2, Y(0.04), "#6F7882");
    for (let k = 0; X(k * 0.05) < fullX2; k++) {                      // Fachwerk unter dem Dach
      c.line([[X(k * 0.05), Y(0.04)], [X(k * 0.05 + 0.025), Y(0.08)], [X(k * 0.05 + 0.05), Y(0.04)]], { fill: "#8B949E", width: Math.max(1, 2 * s) });
    }
    for (let k = 0; k < 5; k++) {
      const lx = X(0.1 + k * 0.2);
      c.line([[lx, Y(0.04)], [lx, Y(0.2)]], { fill: "#5A616B", width: Math.max(1, 2 * s) });
      c.polygon([[lx - 14 * s, Y(0.2) + 12 * s], [lx + 14 * s, Y(0.2) + 12 * s], [lx + 6 * s, Y(0.2)], [lx - 6 * s, Y(0.2)]], { fill: "#3A4048" });
      c.oval(lx - 12 * s, Y(0.2) + 8 * s, lx + 12 * s, Y(0.2) + 18 * s, { fill: "#FFF3C4" });
    }
    const code = (this.phase === "gate" ? this.origin : this.target).code;
    c.roundRect(X(0.36), Y(0.36), X(0.64), Y(0.46), 8 * s, { fill: "#1E2A38" });
    c.text(X(0.5), Y(0.41), `HANGAR ${code}`, app.font(20, "bold"), "white");
    // Boden mit Markierungen und Spiegelung
    c.rect(x1, gy, fullX2, y2, "#AEB5BD");
    c.rect(x1, gy + 0.03 * H, fullX2, gy + 0.05 * H, "#BCC2C9");
    c.rect(x1, gy + 0.09 * H, fullX2, gy + 0.105 * H, "#F2D21B");
    for (let k = 0; k < 8; k++) {
      c.polygon([[X(0.02 + k * 0.03), y2], [X(0.035 + k * 0.03), y2], [X(0.05 + k * 0.03), y2 - 0.05 * H], [X(0.035 + k * 0.03), y2 - 0.05 * H]], { fill: "#2B2B2B" });
    }

    // Waschanlage: Schiene an der Decke, große Ventilatoren am Boden
    const rail = Y(0.27);
    c.rect(X(0.04), rail - 5 * s, X(0.96), rail + 5 * s, "#4A525C");
    const drying = phase === "Trocknen";
    for (const fx of [0.08, 0.92]) {
      const fcx = X(fx), fcy = gy - 0.2 * H, fr = 0.1 * H;
      c.line([[fcx, fcy], [fcx, gy]], { fill: "#5A616B", width: Math.max(2, 6 * s) });
      c.oval(fcx - fr, fcy - fr, fcx + fr, fcy + fr, { fill: "#E6E9ED", outline: "#5A616B", width: Math.max(1, 3 * s) });
      const spin = (wt || 0) * (drying ? 14 : 0);
      for (let b = 0; b < 4; b++) {
        const a = spin + b * Math.PI / 2;
        c.polygon([[fcx, fcy], [fcx + Math.cos(a - 0.3) * fr * 0.9, fcy + Math.sin(a - 0.3) * fr * 0.9],
          [fcx + Math.cos(a + 0.3) * fr * 0.9, fcy + Math.sin(a + 0.3) * fr * 0.9]], { fill: "#3D8BD4" });
      }
      c.oval(fcx - 6 * s, fcy - 6 * s, fcx + 6 * s, fcy + 6 * s, { fill: "#5A616B" });
    }

    // Flugzeug
    const length = Math.min(0.62 * W, 1.05 * H), cx = X(0.5), py = gy - 0.121 * length;
    const tail = cx - 0.56 * length, nose = cx + 0.56 * length, park = cx - 0.66 * length;
    const gx = phase === "Einschäumen" ? tail + (nose - tail) * f : phase === "Bürsten" ? nose + (tail - nose) * f : park;
    c.rect(gx - 0.012 * W, rail, gx + 0.012 * W, gy, "#E0A21B");    // Mast des Waschroboters
    drawPlane(c, cx, py, length);
    // Schmutz (vor dem Waschen) und Schaum
    if (!this.clean) {
      for (let i = 0; i < 16; i++) {
        const lx = -0.42 + 0.84 * rnd(i, 51), ly = -0.04 + 0.08 * rnd(i, 52), x = cx + lx * length;
        if (["Abspülen", "Trocknen", "Blitzblank!"].includes(phase) || (phase === "Bürsten" && x > gx)) continue;
        const r = (0.008 + 0.012 * rnd(i, 53)) * length;
        c.oval(x - r, py + ly * length - r * 0.7, x + r, py + ly * length + r * 0.7, { fill: "#8A7457" });
      }
    }
    if (["Einschäumen", "Bürsten", "Abspülen"].includes(phase)) {
      for (let i = 0; i < 60; i++) {
        const lx = -0.5 + rnd(i, 61), ly = -0.07 + 0.14 * rnd(i, 62), x = cx + lx * length;
        if ((phase === "Einschäumen" && x > gx) || (phase === "Abspülen" && rnd(i, 63) < f)) continue;
        const r = (0.012 + 0.016 * rnd(i, 64)) * length;
        c.oval(x - r, py + ly * length - r, x + r, py + ly * length + r, { fill: "#FBFDFF", outline: "#D8E6F2" });
      }
    }
    // Bürsten am Waschroboter
    const spin = (wt || 0) * (phase === "Bürsten" ? 16 : 5);
    for (const [by, br] of [[py - 0.115 * length, 0.06 * length], [py + 0.095 * length, 0.04 * length]]) {
      c.line([[gx, by < py ? rail : gy], [gx, by]], { fill: "#E0A21B", width: Math.max(2, 6 * s) });
      c.oval(gx - br, by - br, gx + br, by + br, { fill: "#3D8BD4", outline: "#2B6CB0", width: Math.max(1, 2 * s) });
      for (let b = 0; b < 6; b++) {
        const a = spin + b * Math.PI / 3;
        c.line([[gx, by], [gx + Math.cos(a) * br, by + Math.sin(a) * br]], { fill: "#CFE6F7", width: Math.max(1, 2 * s) });
      }
      for (let b = 0; b < 16; b++) {
        const a = spin + b * Math.PI / 8, bx = gx + Math.cos(a) * br, byy = by + Math.sin(a) * br;
        c.oval(bx - 2 * s, byy - 2 * s, bx + 2 * s, byy + 2 * s, { fill: "#7FB2FF" });
      }
    }
    // Wagen mit freundlichem Gesicht
    c.roundRect(gx - 0.04 * W, rail - 0.05 * H, gx + 0.04 * W, rail + 0.03 * H, 10 * s, { fill: "#F2B233", outline: "#C98A12", width: Math.max(1, 2 * s) });
    for (const ex of [-0.014, 0.014]) {
      const ox = gx + ex * W, oy = rail - 0.03 * H;
      c.oval(ox - 7 * s, oy - 7 * s, ox + 7 * s, oy + 7 * s, { fill: "white" });
      c.oval(ox - 3 * s, oy - 3 * s, ox + 3 * s, oy + 3 * s, { fill: "#1E2A38" });
    }
    const smileR = 0.014 * W, smileY = rail - 0.0075 * H;
    c.line(Array.from({ length: 9 }, (_, k) => { const a = Math.PI * (0.2 + 0.6 * k / 8); return [gx + Math.cos(a) * smileR, smileY + Math.sin(a) * smileR * 0.8]; }),
      { fill: "#1E2A38", width: Math.max(1, 2 * s), cap: "round" });
    const t = wt || 0;
    if (phase === "Einschäumen" || phase === "Bürsten") {              // Düsen sprühen Schaum bzw. Wasser
      const col = phase === "Einschäumen" ? "#FFFFFF" : "#9CCBF0", r = (phase === "Einschäumen" ? 3 : 2) * s;
      for (let i = 0; i < 14; i++) {
        const a = rnd(i, 71) * 2 * Math.PI, d = ((t * 3 + rnd(i, 72)) % 1) * 0.12 * length;
        const x = gx + Math.cos(a) * d, y = py + (rnd(i, 73) - 0.5) * 0.25 * length + Math.sin(a) * d * 0.3;
        c.oval(x - r, y - r, x + r, y + r, { fill: col });
      }
    }
    if (phase === "Abspülen") {                                         // Regen aus der Decke
      c.rect(X(0.04), Y(0.3), X(0.96), Y(0.3) + 6 * s, "#7D8794");
      for (let i = 0; i < 90; i++) {
        const x = X(0.05 + 0.9 * rnd(i, 81)), y = Y(0.31) + ((rnd(i, 82) + t * 1.6) % 1) * (gy - Y(0.31));
        c.line([[x, y], [x, y + 0.035 * H]], { fill: "#7FB8E6", width: Math.max(1, 2 * s) });
      }
    }
    if (drying) {                                                       // Wind von den Ventilatoren
      for (let i = 0; i < 26; i++) {
        const y = py + (rnd(i, 91) - 0.5) * 0.3 * length, side = i % 2 ? 1 : -1, prog = (rnd(i, 92) + t * 1.3) % 1;
        const x = side > 0 ? X(0.08) + prog * 0.45 * W : X(0.92) - prog * 0.45 * W;
        c.line([[x, y], [x + side * 0.05 * W, y]], { fill: "#FFFFFF", width: Math.max(1, 2 * s) });
      }
    }
    if (phase === "Blitzblank!") {                                      // Glitzern
      for (let i = 0; i < 14; i++) {
        const x = cx + (-0.45 + 0.9 * rnd(i, 101)) * length, y = py + (-0.06 + 0.1 * rnd(i, 102)) * length;
        const r = (8 + 12 * Math.abs(Math.sin(t * 6 + i))) * s;
        c.polygon([[x, y - r], [x + r * 0.25, y - r * 0.25], [x + r, y], [x + r * 0.25, y + r * 0.25], [x, y + r],
          [x - r * 0.25, y + r * 0.25], [x - r, y], [x - r * 0.25, y - r * 0.25]], { fill: "#FFE27A" });
      }
    }
  }

  /** Vergrößerung beim Ein- und Aussteigen (1 = normale Ansicht). */
  zoom() {
    const d = this.door;
    if (!d || (this.phase !== "gate" && this.phase !== "arrived")) return 1;
    if (d.closing !== null) return 1 + 1.4 * (1 - smooth((now() - d.closing) / 0.8));
    return 1 + 1.4 * smooth((now() - d.t0) / 0.8);
  }

  /** Lage des Flugzeugs am Boden: [Mitte x, Mitte y, Boden, Länge, Breite]. */
  groundGeo(x1, y1, x2, y2) {
    const W = x2 - x1, H = y2 - y1, length = Math.min(0.36 * W, 0.7 * H), gy = y1 + 0.8 * H;
    return [x1 + PLANE_X * W, gy - 0.121 * length, gy, length, W];
  }

  /** Offene Tür und Fluggäste auf der Treppe; T rechnet Szene- in Bildschirmpunkte um. */
  drawBoarding(c, geo, T, z) {
    const d = this.door, [px, py, gy, length, W] = geo;
    if (d.closing === null) {
      const [ax, ay] = T(px + 0.35 * length, py - 0.042 * length), [bx, by] = T(px + 0.38 * length, py + 0.032 * length);
      c.polygon([[ax, ay], [bx, ay], [bx, by], [ax, by]], { fill: "#2B3440", outline: "#9AA4AD" });
    }
    const xTop = px + 0.38 * length, yTop = gy - 0.091 * length, xBot = xTop + 0.16 * length;
    const far = xBot + 0.3 * W;           // von dort kommen die Leute (bzw. gehen sie hin)
    const tAll = now() - d.t0 - 0.8;
    for (const [look, start] of d.people) {
      const t = tAll - start;
      if (t < 0) continue;
      const bottom = [xBot + 0.02 * length, gy, 1], top = [xTop, yTop, 1], away = [far, gy, 1];
      const segs = d.way === "in" ? [[2.0, away, bottom, "walk"], [1.0, bottom, top, "walk"]]
        : [[1.0, top, bottom, "walk"], [2.2, bottom, away, "walk"]];
      const pos = follow(segs, t);
      if (pos) {
        const [x, y] = T(pos[0], pos[1]);
        drawPerson(c, x, y, 0.085 * length * z, look, "walk", t * 9 + start);
      }
    }
  }

  doors() {
    const text = this.phase === "gate" ? "Boarding abgeschlossen. Bitte anschnallen!" : "Bitte anschnallen!";
    this.app.sound.play("flug", text);
    this.say("Ding-Dong! " + text, 2.5);
    this.app.animate();
  }

  announce() {
    const name = this.target.name;
    let text, show;
    if (this.hangar) {
      text = show = "Wir sind im Hangar. Hier wird das Flugzeug geprüft und gewaschen.";
    } else if (this.phase === "gate") {
      text = `Willkommen an Bord! Flug nach ${name}. Flugzeit etwa ${hoursText(this.flight.hours, true)}.`;
      show = `Flug nach ${name}`;
    } else if (this.phase === "takeoff") {
      text = show = "Wir starten! Bitte bleiben Sie angeschnallt.";
    } else if (this.phase === "cruise") {
      const rest = Math.max(1 / 12, this.flight.hours * (1 - Math.min(1, this.t / this.cruiseLen())));
      text = `Hier spricht Ihr Kapitän. Wir fliegen in elftausend Metern Höhe. Noch etwa ${hoursText(rest, true)} bis ${name}.`;
      show = `Noch ${hoursText(rest)} bis ${name}`;
    } else if (this.phase === "landing") {
      text = show = `Wir landen gleich in ${name}. Bitte anschnallen!`;
    } else {
      text = this.welcomeText();
      show = `Willkommen in ${name}!`;
    }
    this.app.sound.speak(text);
    this.say(show, 3);
    this.app.animate();
  }

  welcomeText() {
    const tg = this.target;
    if (this.direction === 1) return "Willkommen zurück in Berlin! " + tg.fact;
    return `Willkommen in ${tg.name}! ${tg.hello} ${tg.fact}`;
  }

  /** Taste R: am Ziel wieder zurück (bzw. in Berlin noch einmal hin). */
  returnFlight() {
    if (this.phase !== "arrived") {
      this.say("Erst landen – dann geht es zurück.", 2);
      this.app.animate();
      return;
    }
    this.app.sound.stop();
    this.direction = 1 - this.direction;
    this.startGate();
    this.app.redraw();
    this.app.animate();
  }

  /** Taste U: am BER in Bahn oder Bus umsteigen. */
  change() {
    const app = this.app;
    if (!this.atAirport()) {
      this.say("Umsteigen geht nur am Boden am BER.", 2);
      app.animate();
      return;
    }
    const kinds = (app.transferKinds("flug") || MODE_ORDER).filter(k => k !== "flug");
    const options = app.transfers.options(app.data.airport, null, kinds);
    if (options.length) {
      app.sound.stop();
      app.show(new ChangeScreen(app, "Am Flughafen BER umsteigen", options, () => app.show(this)));
    }
  }

  back() {
    this.app.sound.stop();
    this.app.show(this.linesScreen || new LinesScreen(this.app, "flug", this.index));
  }

  key(k, char) {
    const ch = (char || "").toLowerCase();
    if (ch === "h") this.toggleHangar();
    else if (ch === "w") this.washPlane();
    else if (this.hangar && !(KEYS_BACK.has(k) || ch === "v" || ch === "t")) {
      this.say("Wir sind im Hangar – W: waschen, H: hinausrollen", 2.5);
      this.app.animate();
    } else if (DOOR_KEYS.has(char)) this.toggleOpen();
    else if (KEYS_NEXT.has(k) || KEYS_OK.has(k)) this.go();
    else if (KEYS_BACK.has(k)) this.back();
    else if (ch === "t") this.doors();
    else if (ch === "v") this.announce();
    else if (ch === "r") this.returnFlight();
    else if (ch === "u") this.change();
  }

  tick() {
    const t = this.t;
    if (this.hangar) {
      const hg = this.hangar, tn = now();
      if (hg.out !== null && tn - hg.out >= HANGAR_T) {
        this.hangar = null;
        return true;
      }
      const wt = this.planeWashT();
      if (wt !== null) {
        const name = planeWashPhase(wt)[0];
        if (name !== hg.said) {
          hg.said = name;
          this.say(name === "Blitzblank!" ? "Blitzblank! Das Flugzeug glänzt." : name + " …", 3);
        }
        if (wt >= PLANE_WASH_T) {
          hg.wash = null;
          this.clean = true;
        }
        return true;
      }
      return this.hangarState()[0] !== "drin" || tn < this.message[1];
    }
    if (this.door) {
      if (this.door.closing !== null && now() - this.door.closing > 0.85) this.door = null;
      return true;
    }
    if (this.phase === "takeoff" && t >= TAKEOFF_T) {
      this.setPhase("cruise");
      this.say("Reiseflughöhe erreicht. Gute Reise!", 3);
    } else if (this.phase === "cruise" && t >= this.cruiseLen()) {
      this.setPhase("landing");
      this.say(`Landeanflug auf ${this.target.name}!`, 3);
    } else if (this.phase === "landing" && t >= LANDING_T) {
      this.setPhase("arrived");
      this.clean = false;
      this.say(`Willkommen in ${this.target.name}!`, 4);
      this.app.sound.speak(this.welcomeText());
    }
    return ["takeoff", "cruise", "landing"].includes(this.phase) || now() < this.message[1];
  }

  // --- Zeichnen ---
  draw(c, w, h) {
    const app = this.app, s = app.s;
    const hh0 = HEADER_H * s;
    const panelW = Math.min(430 * s, w * 0.38);
    const z = this.zoom(), state = this.hangarState();
    if (state && state[0] === "drin") {
      this.drawHangar(c, 0, hh0, w - panelW, h, w);
    } else if (state) {
      const u = smooth(state[1]);
      const [dx, slide] = state[0] === "rein" ? [0.65 * u, 0.6 * (1 - smooth(state[1] / 0.35))]
        : [0.65 * (1 - u), 0.6 * smooth((state[1] - 0.65) / 0.35)];
      this.drawScene(c, 0, hh0, w - panelW, h, w, dx, slide);
    } else if (z > 1.001) {
      // beim Ein- und Aussteigen rückt die Kamera an die Tür heran
      const geo = this.groundGeo(0, hh0, w - panelW, h), [px, , gy, length] = geo;
      const cx = px + 0.45 * length, cy = gy - 0.05 * length, ctx = c.ctx;
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
      this.drawScene(c, 0, hh0, w - panelW, h, w);
      ctx.restore();
      this.drawBoarding(c, geo, (x, y) => [cx + (x - cx) * z, cy + (y - cy) * z], z);
    } else {
      this.drawScene(c, 0, hh0, w - panelW, h, w);
    }

    // Kopfzeile
    const color = this.line.color;
    const [hh, left] = header(app, c, w, color, () => this.back());
    const bx = left + 30 * s;
    const bw = drawBadge(c, bx, hh / 2, this.target.code, color, "flug", 64 * s, app.font(34, "bold"), 5 * s);
    const tf = app.font(28, "bold");
    c.text(bx + bw + 30 * s, hh / 2, fitText(tf, `${this.origin.name} → ${this.target.name}`, w - (bx + bw + 60 * s)),
      tf, textColorFor(color), "w");
    this.drawPanel(c, w, h, w - panelW, hh);
  }

  drawScene(c, x1, y1, x2, y2, fullX2, planeDx = 0, hangar = null) {
    const app = this.app, s = app.s;
    const W = x2 - x1, H = y2 - y1;
    const [X, A, pitch] = flightState(this.phase, this.t);
    const v = flightState(this.phase, this.t)[3];
    const gs = ["gate", "takeoff", "cruise"].includes(this.phase) ? this.origin : this.target;
    const cam = Math.max(0, A - CAM_LIMIT);
    const gy0 = y1 + 0.8 * H;
    const gy = gy0 + cam * H;                 // Boden (wandert beim Steigen nach unten aus dem Bild)
    let night = this.night();
    if (gs.night && this.phase !== "cruise") night = Math.max(night, 0.9);   // z. B. Polarlichter in Rovaniemi

    // Himmel: oben dunkler, in großer Höhe tiefblau, auf langen Flügen nachts
    const hi = Math.min(1, A / CRUISE_A);
    const top = mix(mix(gs.sky[0], "#2F6FC4", hi), "#0B1633", night);
    const bottom = mix(mix(gs.sky[1], "#9CCBF0", hi), "#3B3F6E", night);
    const bands = 10;
    for (let i = 0; i < bands; i++) c.rect(x1, y1 + H * i / bands, fullX2, y1 + H * (i + 1) / bands + 1, mix(top, bottom, i / (bands - 1)));
    if (night > 0.35) {
      for (let i = 0; i < 50; i++) {
        const sx = x1 + (fullX2 - x1) * rnd(i, 41), sy = y1 + H * 0.6 * rnd(i, 42), r = (1 + 1.5 * rnd(i, 43)) * s;
        c.oval(sx - r, sy - r, sx + r, sy + r, { fill: "#FFF7D6" });
      }
      const mx = x1 + W * 0.82, my = y1 + H * 0.16;
      c.oval(mx - 26 * s, my - 26 * s, mx + 26 * s, my + 26 * s, { fill: "#F4EFD2" });
      c.oval(mx - 12 * s, my - 30 * s, mx + 36 * s, my + 18 * s, { fill: mix(top, bottom, 0.15) });
    } else {
      const sx = x1 + W * 0.86, sy = y1 + H * 0.14 + cam * H * 0.05;
      c.oval(sx - 30 * s, sy - 30 * s, sx + 30 * s, sy + 30 * s, { fill: "#FFE27A" });
    }

    // Boden: weiter Hintergrund mit Wahrzeichen, davor Wiese und Startbahn
    const farY = gy - 0.07 * H;
    const length = Math.min(0.36 * W, 0.7 * H);
    if (farY < y2) {
      c.rect(x1, farY, fullX2, y2, gs.far);
      const sx = ["gate", "takeoff", "cruise"].includes(this.phase) ? SCENE_X - X * FAR : SCENE_X + (LANDING_X - X) * FAR;
      drawShapes(c, gs.scene, x1 + sx * W, farY, SCENE_SCALE * H);
      c.rect(x1, gy - 0.012 * H, fullX2, y2, gs.ground);
      c.rect(x1, gy - 0.012 * H, fullX2, gy + 0.03 * H, "#4E555C");
      const first = Math.floor((X - PLANE_X) / 0.25) - 1;
      const count = Math.floor((fullX2 - x1) / W / 0.25) + 3;
      for (let i = first; i < first + count; i++) {
        const dx = x1 + (PLANE_X + i * 0.25 - X) * W;
        c.rect(dx, gy + 0.006 * H, dx + 0.1 * W, gy + 0.013 * H, "#F2F2F2");
        c.oval(dx - 2 * s, gy - 0.012 * H - 2 * s, dx + 2 * s, gy - 0.012 * H + 2 * s, { fill: "#FFE27A" });
      }
      if ((this.phase === "gate" || this.phase === "arrived") && !this.hangar) this.drawStairs(c, x1 + PLANE_X * W, gy, length);
    }

    // Wolken: einzelne Wolken und die Wolkendecke, durch die man beim Steigen fliegt
    const clTop = mix("#FFFFFF", "#6B7398", night), clBottom = mix("#E2E9F0", "#4E5679", night);
    let first = Math.floor((X * 0.7 - PLANE_X - 0.4) / 0.3);
    for (let i = first; i < first + Math.floor((fullX2 - x1) / W / 0.3) + 4; i++) {
      if (rnd(i, 7) < 0.35) continue;
      const cy = gy - (0.55 + 0.4 * rnd(i, 5)) * H;
      if (cy > y1 - 0.1 * H && cy < y2 + 0.1 * H) {
        drawCloud(c, x1 + (PLANE_X + i * 0.3 - X * 0.7) * W, cy, (0.035 + 0.03 * rnd(i, 6)) * H, clTop, clBottom);
      }
    }
    const deckTop = gy - CLOUDS_A[1] * H, deckBottom = gy - CLOUDS_A[0] * H;
    if (deckBottom > y1 && deckTop < y2) {
      c.rect(x1, deckTop, fullX2, deckBottom, mix("#F4F7FA", "#5D6588", night));
      const r = 0.06 * H;
      first = Math.floor(X * 0.85 / 0.12) - 2;
      for (let i = first; i < first + Math.floor((fullX2 - x1) / W / 0.12) + 4; i++) {
        const px = x1 + (i * 0.12 - X * 0.85) * W;
        c.oval(px - r * 1.3, deckTop - r * (0.6 + 0.4 * rnd(i, 9)), px + r * 1.3, deckTop + r * 0.6, { fill: clTop });
        c.oval(px - r * 1.3, deckBottom - r * 0.6, px + r * 1.3, deckBottom + r * (0.5 + 0.4 * rnd(i, 8)), { fill: clBottom });
      }
    }

    // Flugzeug
    const py = gy0 - Math.min(A, CAM_LIMIT) * H - 0.121 * length;
    if (A > 1.2) {
      // Kondensstreifen hinter den Triebwerken
      const trail = mix(bottom, "#FFFFFF", 0.75);
      const ex = x1 + PLANE_X * W - 0.06 * length, ey = py + 0.08 * length;
      for (const dy of [-3 * s, 3 * s]) c.line([[x1, ey + dy], [ex, ey + dy]], { fill: trail, width: Math.max(2, 4 * s) });
    }
    if (hangar !== null) this.drawHangarOutside(c, x1, gy, H, W, fullX2, hangar, "hinten");
    drawPlane(c, x1 + (PLANE_X + planeDx) * W, py, length, pitch, false, A < 0.6);
    if (hangar !== null) this.drawHangarOutside(c, x1, gy, H, W, fullX2, hangar, "vorn");

    // Höhe und Tempo
    if (["takeoff", "cruise", "landing"].includes(this.phase)) {
      const altM = Math.round(A / CRUISE_A * 110) * 100;
      const kmh = Math.round(v / FLY_V * (280 + 590 * Math.min(1, A / CRUISE_A)) / 10) * 10;
      const text = `Höhe ${altM.toLocaleString("de-DE")} m   ·   ${kmh} km/h`;
      const f = app.font(17, "bold");
      const tw = f.measure(text) + 30 * s;
      c.roundRect(x1 + 20 * s, y1 + 18 * s, x1 + 20 * s + tw, y1 + 58 * s, 20 * s, { fill: "#1E2A38" });
      c.text(x1 + 20 * s + tw / 2, y1 + 38 * s, text, f, LED);
    }
  }

  /** Fluggasttreppe an der vorderen Tür. */
  drawStairs(c, planeX, gy, length) {
    const s = this.app.s;
    const xTop = planeX + 0.365 * length, yTop = gy - 0.121 * length + 0.03 * length;
    const xBot = xTop + 0.16 * length;
    c.polygon([[xTop, yTop], [xTop + 0.03 * length, yTop], [xBot + 0.03 * length, gy], [xBot, gy]], { fill: "#C9CED6", outline: "#7D8794" });
    for (let k = 1; k < 6; k++) {
      const f = k / 6, yy = yTop + (gy - yTop) * f, xx = xTop + (xBot - xTop) * f;
      c.line([[xx, yy], [xx + 0.03 * length, yy]], { fill: "#7D8794", width: Math.max(1, 2 * s) });
    }
    c.line([[xTop + 0.03 * length, yTop - 0.04 * length], [xBot + 0.03 * length, gy - 0.04 * length]], { fill: "#7D8794", width: Math.max(1, 2 * s) });
    c.rect(xBot - 0.02 * length, gy - 0.05 * length, xBot + 0.14 * length, gy, "#F2B233");
  }

  drawPanel(c, w, h, px1, top) {
    const app = this.app, s = app.s;
    const px2 = w - 24 * s, py = top + 24 * s, pw = px2 - px1 - 48 * s;
    c.roundRect(px1 + 5 * s, py + 7 * s, px2 + 5 * s, h - 24 * s + 7 * s, 26 * s, { fill: SHADOW });
    c.roundRect(px1, py, px2, h - 24 * s, 26 * s, { fill: PANEL });
    const ix = px1 + 24 * s;
    const labelFont = app.font(14, "bold"), bigFont = app.font(26, "bold"), midFont = app.font(17, "bold");

    // Weltkarte mit der Route
    if (!app.worldMap) app.worldMap = new WorldMap(app.data.flights.land);
    const og = this.origin, tg = this.target;
    const mapH = Math.min(pw * 0.68, (h - top) * 0.3);
    const mx1 = ix - 8 * s, my1 = py + 16 * s, mx2 = ix + pw + 8 * s, my2 = py + 16 * s + mapH;
    app.worldMap.draw(c, [og.lat, og.lon], [tg.lat, tg.lon], mx1, my1, mx2, my2, s, this.progress(), [og.code, tg.code], app.font(11, "bold"));
    let y = my2 + 24 * s;

    c.text(ix, y, "FLUG NACH", labelFont, "#F7D117", "w");
    c.text(ix + pw, y, `${og.code} → ${tg.code}`, app.font(14), "#B8C4D0", "e");
    y += 22 * s;
    c.text(ix, y, fitText(bigFont, tg.name, pw), bigFont, "white", "nw");
    y += bigFont.linespace();
    const km = Math.round(earthKm([og.lat, og.lon], [tg.lat, tg.lon]) / 100) * 100;
    c.text(ix, y, fitText(midFont, `${tg.country} · ${km.toLocaleString("de-DE")} km`, pw), midFont, "#CFE8FF", "nw");
    y += midFont.linespace();
    c.text(ix, y, `Flugzeit ca. ${hoursText(this.flight.hours)}`, midFont, "#9FE3B0", "nw");
    y += midFont.linespace() + 10 * s;
    const barW = px2 - px1 - 48 * s;
    c.roundRect(ix, y, ix + barW, y + 14 * s, 7 * s, { fill: "#3A4A5C" });
    const frac = this.progress();
    if (frac > 0) c.roundRect(ix, y, ix + Math.max(14 * s, barW * frac), y + 14 * s, 7 * s, { fill: this.line.color });

    // Knöpfe
    const ground = this.phase === "gate" || this.phase === "arrived";
    const state = this.hangarState(), washing = this.planeWashT() !== null;
    const inside = state && state[0] === "drin";
    const buttons = state ? [["W", () => this.washPlane(), inside && !washing, "#3D8BD4", "white", 30],
      ["H", () => this.toggleHangar(), inside && !washing, "#6B7C93", "white", 30],
      ["Ansage", () => this.announce(), true, "#3D8BD4", "white", 17]]
      : [[this.phase === "cruise" ? "▶▶" : "▼", () => this.go(), this.phase === "gate" || this.phase === "cruise", "#F7D117", PANEL, 30],
        ["Ansage", () => this.announce(), true, "#3D8BD4", "white", 17],
        ["R", () => this.returnFlight(), this.phase === "arrived", "#8E6BBF", "white", 30],
        ["U", () => this.change(), this.atAirport(), "#2F855A", "white", 30],
        ["Ö", () => this.toggleOpen(), ground, "#2BA59B", "white", 30],
        ["H", () => this.toggleHangar(), ground && !this.door, "#6B7C93", "white", 30]];
    const bgap = 12 * s;
    const bsize = Math.min(84 * s, (pw - (buttons.length - 1) * bgap) / buttons.length);
    const by2 = h - 50 * s, btnY = by2 - bsize - 76 * s;
    let bx1 = (px1 + px2) / 2 - (buttons.length * bsize + (buttons.length - 1) * bgap) / 2;
    for (const [sym, cb, enabled, bg, fg, size] of buttons) {
      c.roundRect(bx1, btnY, bx1 + bsize, btnY + bsize, 24 * s, { fill: enabled ? bg : "#3A4A5C" });
      c.text(bx1 + bsize / 2, btnY + bsize / 2, sym, app.font(size, "bold"), enabled ? fg : "#5A6A7C");
      if (enabled) app.hit(bx1, btnY, bx1 + bsize, btnY + bsize, cb);
      bx1 += bsize + bgap;
    }
    // großer Knopf unten
    let label, cb = null;
    if (state) {
      if (washing) label = "Waschanlage läuft …";
      else [label, cb] = ["H  Raus aus dem Hangar", inside ? () => this.toggleHangar() : null];
    } else if (this.phase === "gate") [label, cb] = ["✈  Abflug!", () => this.go()];
    else if (this.phase === "arrived") {
      label = this.direction === 0 ? "⟲  Rückflug nach Berlin" : `✈  Nochmal nach ${this.flight.name}`;
      cb = () => this.returnFlight();
    } else label = "Guten Flug!";
    const rbw = px2 - px1 - 48 * s, rbh = 56 * s, rby = by2 - rbh;
    c.roundRect(ix, rby, ix + rbw, rby + rbh, 28 * s, { fill: cb ? "white" : "#3A4A5C" });
    const bf = app.font(20, "bold");
    c.text(ix + rbw / 2, rby + rbh / 2, fitText(bf, label, rbw - 20 * s), bf, cb ? PANEL : "#8A9AAC");
    if (cb) app.hit(ix, rby, ix + rbw, rby + rbh, cb);

    // Leuchtanzeige
    let [text, until] = this.message;
    if (!(text && now() < until)) {
      text = {
        gate: "Ö: Fluggäste einsteigen · ▼: Abflug", takeoff: "Start!", cruise: "Reiseflug – ▼ fliegt schneller",
        landing: "Landeanflug", arrived: `${this.target.hello} Willkommen in ${this.target.name}!`,
      }[this.phase];
      if (this.door) text = "Tür offen – Ö schließt sie";
      if (state) text = washing ? planeWashPhase(this.planeWashT())[0] : inside ? "W: waschen · H: hinausrollen" : "Das Flugzeug rollt …";
    }
    const boxY1 = y + 30 * s, boxY2 = btnY - 14 * s;
    if (boxY2 - boxY1 >= 40 * s) {
      c.roundRect(ix, boxY1, ix + pw, boxY2, 14 * s, { fill: "#11181F", outline: "#3A4A5C", width: 2 * s });
      const mf = app.font(boxY2 - boxY1 > 70 * s ? 22 : 19, "bold");
      const lines = wrapText(mf, text, pw - 24 * s, 2);
      const lh = mf.linespace();
      let ty = (boxY1 + boxY2) / 2 - lh * (lines.length - 1) / 2;
      for (const ln of lines) { c.text((px1 + px2) / 2, ty, ln, mf, "#FFB000"); ty += lh; }
    }
  }
}

// --------------------------------------------------------------------------
// Kreuzfahrt ab Hamburg, Kiel oder Warnemünde
// --------------------------------------------------------------------------

const LEAVE_T = 5.0;           // Sekunden zum Ablegen (das Schiff fährt an, der Hafen gleitet aus dem Bild)
const ARRIVE_T = 6.0;          // Sekunden zum Einlaufen und Anlegen
const SAIL_V = 0.6;            // Tempo auf See (Fensterbreiten pro Sekunde)
const ARRIVE_X = SAIL_V * ARRIVE_T / 2;
const SHIP_X = 0.3;            // hier liegt das Schiff im Bild (Anteil der Breite)
const SEA_Y = 0.6;             // Horizont bzw. Uferlinie (Anteil der Höhe)
const WL_Y = 0.84;             // Wasserlinie des Schiffs
const LAND_W = 0.95;           // so weit reicht das Ufer links und rechts vom Wahrzeichen (Fensterbreiten)
const SHIP_COLORS = ["#FFFFFF", "#1F3A68"];

/** Kreuzfahrten aus data.cruises als Linien eintragen (Häfen als Haltestellen). Ein Hafen mit Bahnhof
 *  (Hamburg: Hamburg-Altona) bekommt dessen Schlüssel – so kann man dort zwischen ICE und Schiff umsteigen. */
function addCruises(data) {
  if (data.lines.schiff) return;
  const cruises = data.cruises || { ports: {}, cruises: [] };
  data.cruises = cruises;
  const stations = data.stations;
  const byName = {};
  for (const [k, n] of Object.entries(stations)) byName[n] = k;
  const keys = {};
  for (const [code, port] of Object.entries(cruises.ports)) {
    let key = port.station ? byName[port.station] : undefined;
    if (!key) {
      key = "PORT:" + code;
      stations[key] = port.name;
    }
    keys[code] = key;
  }
  data.portKeys = keys;
  data.lines.schiff = cruises.cruises.map(cr => ({
    name: cr.name, color: cr.color,
    directions: [cr.ports.map(p => keys[p]), cr.ports.slice().reverse().map(p => keys[p])],
  }));
}

/** Fahrzeit auf See: „5 Std.“ oder „3 Tage 4 Std.“. */
function daysText(hours, spoken = false) {
  let h = Math.round(hours);
  const d = Math.floor(h / 24);
  h -= d * 24;
  if (!d) return spoken ? `${h} Stunde${h === 1 ? "" : "n"}` : `${h} Std.`;
  const day = d === 1 ? "Tag" : "Tage";
  if (!h) return `${d} ${day}`;
  return spoken ? `${d} ${day} und ${h} Stunden` : `${d} ${day} ${h} Std.`;
}

/** Kreuzfahrtschiff von der Seite, Bug rechts (flip: links); wy = Wasserlinie. */
function drawCruiseShip(c, cx, wy, length, funnel = SHIP_COLORS[1], night = 0, flip = false) {
  const mx = flip ? -1 : 1;
  const T = pts => pts.map(([x, y]) => [cx + mx * x * length, wy + y * length]);
  const poly = (pts, fill, outline) => c.polygon(T(pts), { fill, outline, width: Math.max(1, length / 260) });
  const lit = night > 0.35;
  const win = lit ? "#FFE08A" : "#2B3A4A";
  // Flagge am Heck
  c.line(T([[-0.485, -0.1], [-0.485, -0.16]]), { fill: "#5A5A5A", width: Math.max(1, length / 300) });
  ["#1E1E1E", "#DD0000", "#FFCE00"].forEach((col, k) => poly([[-0.485, -0.16 + k * 0.01], [-0.445, -0.16 + k * 0.01],
    [-0.445, -0.15 + k * 0.01], [-0.485, -0.15 + k * 0.01]], col));
  // Schornstein, Mast und Wasserrutsche auf dem Oberdeck
  poly([[-0.31, -0.24], [-0.19, -0.24], [-0.21, -0.32], [-0.32, -0.32]], funnel);
  poly([[-0.32, -0.32], [-0.21, -0.32], [-0.212, -0.31], [-0.318, -0.31]], "#1E1E1E");
  c.line(T([[0.2, -0.24], [0.2, -0.31]]), { fill: "#7A808A", width: Math.max(1, length / 260) });
  c.line(T([[0.17, -0.29], [0.23, -0.29]]), { fill: "#7A808A", width: Math.max(1, length / 300) });
  const slide = [];
  for (let a = 0; a < 17; a++) slide.push([-0.12 + 0.05 * Math.cos(a / 8 * 2 * Math.PI) + a * 0.012, -0.275 + 0.025 * Math.sin(a / 8 * 2 * Math.PI)]);
  c.line(T(slide), { fill: "#F2C230", width: Math.max(2, length / 110), cap: "round", join: "round" });
  c.line(T([[-0.12, -0.24], [-0.12, -0.3]]), { fill: "#7A808A", width: Math.max(1, length / 260) });
  // Decks: jedes etwas kürzer, vorn schräg
  const decks = [[-0.47, 0.41, -0.1, -0.14], [-0.45, 0.37, -0.14, -0.175], [-0.42, 0.33, -0.175, -0.21], [-0.36, 0.27, -0.21, -0.24]];
  decks.forEach(([a, b, yb, yt], i) => {
    poly([[a, yb], [b + 0.03, yb], [b, yt], [a, yt]], "#F7F8FA", "#C9CED6");
    poly([[a + 0.01, yb - 0.012], [b + 0.012, yb - 0.012], [b + 0.006, yt + 0.01], [a + 0.01, yt + 0.01]], lit ? "#6B5A3A" : "#5E7A93");
    const n = Math.floor((b - a) / 0.022);
    for (let k = 0; k < n; k++) {
      const x = a + 0.016 + k * 0.022;
      if (lit && rnd(k, 140 + i) < 0.25) continue;
      poly([[x, yb - 0.01], [x + 0.012, yb - 0.01], [x + 0.012, yt + 0.012], [x, yt + 0.012]], win);
    }
  });
  poly([[0.19, -0.237], [0.27, -0.237], [0.275, -0.226], [0.19, -0.226]], "#2B3440");    // Brücke
  for (let k = 0; k < 9; k++) {                                                         // Rettungsboote
    const x = -0.38 + k * 0.085;
    poly(roundRectPoints(x, -0.136, x + 0.06, -0.114, 0.008), "#F28C28", "#C96A12");
  }
  // Rumpf mit Bullaugen, Zierstreifen und dunklem Unterwasserschiff
  poly([[-0.5, -0.1], [0.46, -0.1], [0.53, -0.13], [0.47, 0.03], [-0.46, 0.03], [-0.5, -0.03]], "#FFFFFF", "#9AA4AD");
  poly([[-0.5, -0.032], [0.495, -0.032], [0.492, -0.02], [-0.499, -0.02]], funnel);
  poly([[-0.497, -0.004], [0.485, -0.004], [0.47, 0.03], [-0.46, 0.03]], "#1F3A68");
  for (let k = 0; k < 27; k++) poly(circlePoints(-0.44 + k * 0.034, -0.065, 0.0075, 8), win);
  poly(circlePoints(0.48, -0.075, 0.012, 10), "#3A3A3A");                               // Anker
}

/** Anker für das Schild der Kreuzfahrt. */
function drawAnchor(c, cx, cy, r, color, width) {
  c.oval(cx - 0.13 * r, cy - 0.68 * r, cx + 0.13 * r, cy - 0.42 * r, { outline: color, width });
  c.line([[cx, cy - 0.42 * r], [cx, cy + 0.6 * r]], { fill: color, width });
  c.line([[cx - 0.3 * r, cy - 0.26 * r], [cx + 0.3 * r, cy - 0.26 * r]], { fill: color, width, cap: "round" });
  const arc = [];
  for (let a = 10; a <= 170; a += 10) arc.push([cx + 0.55 * r * Math.cos(a * Math.PI / 180), cy + 0.05 * r + 0.55 * r * Math.sin(a * Math.PI / 180)]);
  c.line(arc, { fill: color, width, join: "round" });
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 0.55 * r * Math.cos(10 * Math.PI / 180), ey = cy + 0.05 * r + 0.55 * r * Math.sin(10 * Math.PI / 180);
    c.polygon([[ex - 0.12 * r, ey + 0.02 * r], [ex + 0.12 * r, ey + 0.02 * r], [ex + sx * 0.05 * r, ey - 0.2 * r]], { fill: color });
  }
}

/** Springender Delfin: Körper als Bogen, phase 0…1 durch den Sprung. */
function drawDolphin(c, x, y, size, phase, color = "#6E8496") {
  const top = [], bot = [];
  for (let k = 0; k <= 10; k++) {
    const u = k / 10, a = Math.PI * (0.15 + 0.7 * u);
    const px = x + (u - 0.5) * size;
    const py = y - Math.sin(a) * size * 0.35 * Math.sin(Math.PI * phase) - size * 0.05;
    const th = size * 0.07 * Math.sin(Math.PI * u) + size * 0.01;
    top.push([px, py - th]);
    bot.push([px, py + th]);
  }
  c.polygon(top.concat(bot.slice().reverse()), { fill: color });
  const [hx, hy] = top[5];
  c.polygon([[hx - size * 0.04, hy + size * 0.02], [hx + size * 0.04, hy + size * 0.02], [hx - size * 0.02, hy - size * 0.1]], { fill: color });
  const [tx, ty] = top[0];
  c.polygon([[tx, ty], [tx - size * 0.08, ty - size * 0.05], [tx - size * 0.06, ty + size * 0.06]], { fill: color });
}

/** Anfang der Linie xy bis zum Anteil frac der Länge. */
function partOfLine(xy, frac) {
  const lens = [];
  for (let i = 0; i + 1 < xy.length; i++) lens.push(Math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]));
  let goal = lens.reduce((a, b) => a + b, 0) * frac;
  const out = [xy[0]];
  for (let i = 0; i < lens.length; i++) {
    const a = xy[i], b = xy[i + 1], d = lens[i];
    if (goal >= d) { out.push(b); goal -= d; } else {
      const f = d ? goal / d : 0;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      break;
    }
  }
  return out;
}

/** Karte mit der ganzen Seeroute einer Kreuzfahrt (Landflächen wie bei den Flügen). */
class SeaMap {
  constructor(land) {
    this.land = land.map(r => { const out = []; for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i], r[i + 1]]); return out; });
    this.cacheKey = null;
    this.cacheItems = [];
  }

  draw(c, legs, x1, y1, x2, y2, s, leg, frac, ports, font) {
    const pts = legs.flat();
    const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]);
    const pad = Math.max(2.5, 0.15 * Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lons) - Math.min(...lons)));
    const la1 = Math.min(...lats) - pad, la2 = Math.max(...lats) + pad, lo1 = Math.min(...lons) - pad, lo2 = Math.max(...lons) + pad;
    const cosM = Math.cos((la1 + la2) / 2 * Math.PI / 180);
    const scale = Math.min((x2 - x1) / ((lo2 - lo1) * cosM), (y2 - y1) / (la2 - la1));
    const latC = (la1 + la2) / 2, lonC = (lo1 + lo2) / 2, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const proj = (lat, lon) => [cx + (lon - lonC) * cosM * scale, cy - (lat - latC) * scale];
    const key = [pts[0].join(), pts.length, Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)].join("|");
    if (this.cacheKey !== key) {
      this.cacheItems = [];
      for (const ring of this.land) {
        const p = clipPolygon(ring.map(([lon, lat]) => proj(lat, lon)), x1, y1, x2, y2);
        if (p.length >= 3) this.cacheItems.push(p);
      }
      this.cacheKey = key;
    }
    c.rect(x1, y1, x2, y2, "#AFD7EE");
    for (const p of this.cacheItems) c.polygon(p, { fill: "#F1E9D2", outline: "#D2C6A5", width: 1 });
    legs.forEach((lg, k) => {                                // gefahrene Abschnitte durchgezogen, sonst Punkte
      const xy = lg.map(p => proj(p[0], p[1]));
      if (k < leg || (k === leg && frac >= 1)) {
        c.line(xy, { fill: "#1F3A68", width: Math.max(2, 3 * s), cap: "round", join: "round" });
        return;
      }
      for (let j = 0; j + 1 < xy.length; j++) {
        const a = xy[j], b = xy[j + 1];
        const n = Math.max(1, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / (6 * s)));
        for (let i = 0; i < n; i++) {
          const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n;
          c.oval(x - 1.6 * s, y - 1.6 * s, x + 1.6 * s, y + 1.6 * s, { fill: "#1F3A68" });
        }
      }
      if (k === leg && frac > 0) c.line(partOfLine(xy, frac), { fill: "#1F3A68", width: Math.max(2, 3 * s), cap: "round", join: "round" });
    });
    ports.forEach(([lat, lon, label], i) => {
      const [x, y] = proj(lat, lon);
      c.oval(x - 5 * s, y - 5 * s, x + 5 * s, y + 5 * s, { fill: "#E8483B", outline: "white", width: 2 * s });
      const tw = font.measure(label);
      const lx = Math.min(Math.max(x, x1 + tw / 2 + 4 * s), x2 - tw / 2 - 4 * s);
      const ly = (i % 2 === 0 && y - 22 * s > y1) || y + 22 * s > y2 ? y - 14 * s : y + 14 * s;
      c.text(lx, ly, label, font, "#1E2A38");
    });
    const xy = legs[Math.min(leg, legs.length - 1)].map(p => proj(p[0], p[1]));
    const part = partOfLine(xy, Math.min(1, frac));
    const [px, py] = part[part.length - 1];
    let [ax, ay] = part.length >= 2 ? part[part.length - 2] : xy[0];
    if (part.length < 2 || (Math.abs(px - ax) < 0.01 && Math.abs(py - ay) < 0.01)) [ax, ay] = xy[0];
    drawCruiseShip(c, px, py + 2 * s, 30 * s, SHIP_COLORS[1], 0, px < ax);
  }
}

class CruiseScreen extends Screen {
  constructor(app, index, direction = 0, linesScreen = null, start = 0) {
    super(app);
    this.kind = "schiff";
    this.index = index;
    this.linesScreen = linesScreen;
    this.line = app.data.lines.schiff[index];
    this.cruise = app.data.cruises.cruises[index];
    this.portsInfo = app.data.cruises.ports;
    this.direction = direction;
    this.stop = start;
    this.startPort("Willkommen an Bord! Drücke ▼ zum Ablegen.");
  }

  startPort(message) {
    this.phase = "port";
    this.t0 = now();
    this.boost = 0;
    this.gangway = null;
    this.message = [message, now() + 4];
  }

  // --- Route ---
  get codes() { return this.direction === 0 ? this.cruise.ports : this.cruise.ports.slice().reverse(); }
  port(i) { return this.portsInfo[this.codes[i]]; }
  leg(k) {
    const n = this.cruise.legs.length;
    const raw = this.cruise.legs[this.direction === 0 ? k : n - 1 - k];
    const pts = [];
    for (let i = 0; i + 1 < raw.length; i += 2) pts.push([raw[i], raw[i + 1]]);
    return this.direction === 0 ? pts : pts.reverse();
  }
  hours(k) { const n = this.cruise.hours.length; return this.cruise.hours[this.direction === 0 ? k : n - 1 - k]; }
  get last() { return this.stop === this.codes.length - 1; }
  get roundTrip() { const p = this.codes; return p[0] === p[p.length - 1]; }
  /** Hafen, an dem das Schiff liegt bzw. von dem es gerade kommt. */
  get here() { return this.port(this.stop); }
  get target() { return ["leave", "sea", "arrive"].includes(this.phase) ? this.port(this.stop + 1) : null; }
  get t() { return now() - this.t0 + (this.phase === "sea" ? this.boost : 0); }
  seaLen() { return Math.max(6, Math.min(18, 5 + 0.06 * this.hours(this.stop))); }

  hopProgress() {
    const t = this.t;
    if (this.phase === "leave") return 0.05 * Math.min(1, t / LEAVE_T);
    if (this.phase === "sea") return 0.05 + 0.9 * Math.min(1, t / this.seaLen());
    if (this.phase === "arrive") return 0.95 + 0.05 * Math.min(1, t / ARRIVE_T);
    return 0;
  }

  /** [Weg in Fensterbreiten seit dem Ablegen, Tempo 0…1]. */
  sail() {
    let t = this.t;
    if (this.phase === "leave") return [SAIL_V * t * t / (2 * LEAVE_T), Math.min(1, t / LEAVE_T)];
    if (this.phase === "sea") return [SAIL_V * LEAVE_T / 2 + SAIL_V * t, 1];
    if (this.phase === "arrive") {
      t = Math.min(t, ARRIVE_T);
      return [SAIL_V * (t - t * t / (2 * ARRIVE_T)), 1 - t / ARRIVE_T];
    }
    return [0, 0];
  }

  /** [Lage des Ufers mit Wahrzeichen (Anteil der Breite), Hafen] oder null auf hoher See. */
  shore() {
    const [X] = this.sail();
    const [sx, port] = ["port", "leave", "sea"].includes(this.phase) ? [SCENE_X - X, this.here] : [SCENE_X + ARRIVE_X - X, this.target];
    return sx - LAND_W < 1.6 && sx + LAND_W > -0.2 ? [sx, port] : null;
  }

  night() {
    if (this.phase !== "sea" || this.hours(this.stop) < 20) return 0;
    return 0.85 * Math.sin(Math.PI * Math.min(1, this.t / this.seaLen())) ** 2;
  }

  say(text, seconds = 2.5) { this.message = [text, now() + seconds]; }

  setPhase(phase) {
    this.phase = phase;
    this.t0 = now();
    this.boost = 0;
  }

  /** Bahnhof am Hafen (zum Umsteigen), sonst null. */
  stationKey() {
    if (this.phase !== "port" || !this.here.station) return null;
    return this.app.data.portKeys[this.here.code] || null;
  }

  // --- Aktionen ---
  /** ▼ / Leertaste: ablegen; auf See schneller fahren. */
  go() {
    if (this.gangway) this.say("Erst die Gangway einholen: Taste Ö", 2);
    else if (this.phase === "port") {
      if (this.last) this.say("Die Reise ist zu Ende. Nochmal? Drücke R.", 2.5);
      else {
        this.setPhase("leave");
        this.say(`Leinen los! Kurs auf ${this.target.name}.`, 3);
        this.app.sound.play("schiff");
      }
    } else if (this.phase === "sea") {
      this.boost += 0.15 * this.seaLen();
      this.say("Volle Fahrt voraus!", 1.5);
    }
    this.app.animate();
  }

  horn() {
    this.app.sound.play("schiff");
    this.say("Tuuuuut!", 2);
    this.app.animate();
  }

  /** Taste Ö: Gangway ausfahren – Passagiere gehen an bzw. von Bord – und wieder einholen. */
  toggleOpen() {
    const t = now();
    if (this.phase !== "port") this.say("Auf See bleibt die Gangway eingeholt!", 2);
    else if (this.gangway) {
      if (this.gangway.closing !== null) return;
      if (t < this.gangway.done) this.say("Moment – es gehen noch Leute an und von Bord!", 2);
      else {
        this.gangway.closing = t;
        this.say("Gangway eingeholt.", 2);
      }
    } else {
      const rng = seededRandom(`${this.cruise.name}-${this.direction}-${this.stop}`);
      let ways, text;
      if (this.stop === 0) [ways, text] = [Array(6).fill("in"), "Einschiffung! Die Passagiere kommen an Bord."];
      else if (this.last) [ways, text] = [Array(6).fill("out"), "Ausschiffung! Alle gehen von Bord."];
      else [ways, text] = [["out", "out", "out", "in", "in", "in"], "Landgang! Einige gehen an Land, andere kommen zurück."];
      const people = ways.map((way, k) => [randomLook(rng), 0.8 * k, way]);
      this.gangway = { t0: t, closing: null, people, done: t + 0.8 + 0.8 * 5 + 3.6 };
      this.say(text, 3);
    }
    this.app.animate();
  }

  announce() {
    const tg = this.target;
    let text, show;
    if (this.phase === "port") {
      if (this.stop === 0) {
        let rest = [];
        for (let i = 1; i < this.codes.length; i++) rest.push(this.port(i).name);
        if (this.roundTrip) rest = rest.slice(0, -1);
        const list = rest.length > 1 ? rest.slice(0, -1).join(", ") + " und " + rest[rest.length - 1] : rest[0];
        text = `Willkommen an Bord! Unsere Kreuzfahrt ${this.cruise.title} geht nach ${list}.`;
        show = this.cruise.title;
      } else {
        text = this.welcomeText();
        show = `Willkommen in ${this.here.name}!`;
      }
    } else if (this.phase === "leave") text = show = `Leinen los! Wir legen ab und fahren nach ${tg.name}.`;
    else if (this.phase === "sea") {
      const rest = this.hours(this.stop) * (1 - Math.min(1, this.t / this.seaLen()));
      text = `Hier spricht Ihr Kapitän. Noch etwa ${daysText(Math.max(rest, 1), true)} bis ${tg.name}.`;
      show = `Noch ${daysText(Math.max(rest, 1))} bis ${tg.name}`;
    } else text = show = `Wir laufen gleich in ${tg.name} ein. Bitte nicht über die Reling lehnen!`;
    this.app.sound.speak(text);
    this.say(show, 3);
    this.app.animate();
  }

  welcomeText() {
    const p = this.here;
    if (this.last && this.roundTrip) return `Willkommen zurück in ${p.name}! Die Kreuzfahrt ist zu Ende. Bitte alle von Bord gehen.`;
    return `Willkommen in ${p.name}! ${p.hello} ${p.fact}` + (this.last ? " Hier endet die Kreuzfahrt." : "");
  }

  /** Taste R: am Ende der Reise noch einmal (Rundreise) bzw. zurück (Reise in eine Richtung). */
  again() {
    if (!(this.phase === "port" && this.last)) {
      this.say("Erst am Ende der Reise – dann geht es noch einmal los.", 2.5);
      this.app.animate();
      return;
    }
    this.app.sound.stop();
    if (!this.roundTrip) this.direction = 1 - this.direction;
    this.stop = 0;
    this.startPort("Neue Reise! Drücke ▼ zum Ablegen.");
    this.app.redraw();
    this.app.animate();
  }

  /** Taste U: im Hafen mit Bahnhof (Hamburg) in die Bahn umsteigen. */
  change() {
    const app = this.app, key = this.stationKey();
    if (!key) {
      this.say("Umsteigen in die Bahn geht nur im Hafen Hamburg.", 2.5);
      app.animate();
      return;
    }
    const kinds = (app.transferKinds("schiff") || MODE_ORDER).filter(k => k !== "schiff");
    const options = app.transfers.options(key, null, kinds);
    if (options.length) {
      app.sound.stop();
      app.show(new ChangeScreen(app, `Im Hafen ${this.here.name} umsteigen`, options, () => app.show(this)));
    }
  }

  back() {
    this.app.sound.stop();
    this.app.show(this.linesScreen || new LinesScreen(this.app, "schiff", this.index));
  }

  key(k, char) {
    const ch = (char || "").toLowerCase();
    if (DOOR_KEYS.has(char)) this.toggleOpen();
    else if (KEYS_NEXT.has(k) || KEYS_OK.has(k)) this.go();
    else if (KEYS_BACK.has(k)) this.back();
    else if (ch === "t") this.horn();
    else if (ch === "v") this.announce();
    else if (ch === "r") this.again();
    else if (ch === "u") this.change();
  }

  tick() {
    const t = this.t;
    if (this.gangway) {
      if (this.gangway.closing !== null && now() - this.gangway.closing > 0.85) this.gangway = null;
      return true;
    }
    if (this.phase === "leave" && t >= LEAVE_T) {
      this.setPhase("sea");
      this.say(`Auf hoher See. Gute Fahrt nach ${this.target.name}!`, 3);
    } else if (this.phase === "sea" && t >= this.seaLen()) {
      this.setPhase("arrive");
      this.say(`Land in Sicht! Wir laufen in ${this.target.name} ein.`, 3);
    } else if (this.phase === "arrive" && t >= ARRIVE_T) {
      this.stop += 1;
      this.startPort(`Willkommen in ${this.here.name}!`);
      this.app.sound.speak(this.welcomeText());
    }
    return ["leave", "sea", "arrive"].includes(this.phase) || now() < this.message[1];
  }

  // --- Zeichnen ---
  draw(c, w, h) {
    const app = this.app, s = app.s;
    const panelW = Math.min(430 * s, w * 0.38);
    this.drawScene(c, 0, HEADER_H * s, w - panelW, h, w);
    const color = this.line.color;
    const [hh, left] = header(app, c, w, color, () => this.back());
    const bx = left + 30 * s;
    const bw = drawBadge(c, bx, hh / 2, this.line.name, color, "schiff", 64 * s, app.font(34, "bold"), 5 * s);
    const tf = app.font(28, "bold");
    const title = this.phase === "port" ? this.cruise.title : `${this.here.name} → ${this.target.name}`;
    c.text(bx + bw + 30 * s, hh / 2, fitText(tf, title, w - (bx + bw + 60 * s)), tf, textColorFor(color), "w");
    this.drawPanel(c, w, h, w - panelW, hh);
  }

  drawScene(c, x1, y1, x2, y2, fullX2) {
    const app = this.app, s = app.s;
    const W = x2 - x1, H = y2 - y1;
    const [X, v] = this.sail();
    const tNow = now();
    const night = this.night();
    const frac = this.hopProgress();
    const here = this.here, tg = this.target;
    const skyA = tg === null ? here.sky : [0, 1].map(i => mix(here.sky[i], tg.sky[i], frac));
    const top = mix(skyA[0], "#0B1633", night), bottom = mix(skyA[1], "#3B3F6E", night);
    const hy = y1 + SEA_Y * H;
    const bands = 8;
    for (let i = 0; i < bands; i++) {
      c.rect(x1, y1 + (hy - y1) * i / bands, fullX2, y1 + (hy - y1) * (i + 1) / bands + 1, mix(top, bottom, i / (bands - 1)));
    }
    if (night > 0.35) {
      for (let i = 0; i < 50; i++) {
        const sx = x1 + (fullX2 - x1) * rnd(i, 41), sy = y1 + (hy - y1) * 0.85 * rnd(i, 42), r = (1 + 1.5 * rnd(i, 43)) * s;
        c.oval(sx - r, sy - r, sx + r, sy + r, { fill: "#FFF7D6" });
      }
      const mx = x1 + W * 0.82, my = y1 + H * 0.14;
      c.oval(mx - 26 * s, my - 26 * s, mx + 26 * s, my + 26 * s, { fill: "#F4EFD2" });
      c.oval(mx - 12 * s, my - 30 * s, mx + 36 * s, my + 18 * s, { fill: mix(top, bottom, 0.15) });
    } else {
      const sx = x1 + W * 0.86, sy = y1 + H * 0.13;
      c.oval(sx - 30 * s, sy - 30 * s, sx + 30 * s, sy + 30 * s, { fill: "#FFE27A" });
    }
    const clTop = mix("#FFFFFF", "#6B7398", night), clBottom = mix("#E2E9F0", "#4E5679", night);
    let first = Math.floor((X * 0.2 - 0.4) / 0.35);
    for (let i = first; i < first + Math.floor((fullX2 - x1) / W / 0.35) + 4; i++) {
      if (rnd(i, 7) < 0.4) continue;
      drawCloud(c, x1 + (i * 0.35 - X * 0.2) * W, y1 + (0.08 + 0.2 * rnd(i, 5)) * H, (0.03 + 0.025 * rnd(i, 6)) * H, clTop, clBottom);
    }

    // Meer bis zum Horizont
    const seaTop = mix("#7FB6DA", "#1E2E52", night), seaBottom = mix("#1F5F8E", "#0B1633", night);
    const wl = y1 + WL_Y * H;
    for (let i = 0; i < bands; i++) c.rect(x1, hy + (y2 - hy) * i / bands, fullX2, hy + (y2 - hy) * (i + 1) / bands + 1, mix(seaTop, seaBottom, i / (bands - 1)));
    const k = SCENE_SCALE * H;
    const sh = this.shore();
    if (sh === null && this.phase === "sea") {
      // weit draußen: Inseln und andere Schiffe am Horizont
      first = Math.floor(X * 0.15 / 0.9) - 1;
      for (let i = first; i < first + 4; i++) {
        if (rnd(i, 120) < 0.45) continue;
        const ix = x1 + (i * 0.9 + 0.3 - X * 0.15) * W, iw = (0.12 + 0.15 * rnd(i, 121)) * W, ih = (0.02 + 0.03 * rnd(i, 122)) * H;
        c.polygon([[ix, hy + 1], [ix + iw * 0.3, hy - ih], [ix + iw * 0.7, hy - ih * 0.8], [ix + iw, hy + 1]], { fill: mix("#7E9A86", "#2A3550", night) });
      }
      first = Math.floor(X * 0.3 / 1.3) - 1;
      for (let i = first; i < first + 3; i++) {
        if (rnd(i, 125) < 0.5) continue;
        const bx = x1 + (i * 1.3 + 0.5 - X * 0.3) * W, u = 0.022 * H;
        c.polygon([[bx, hy - u * 0.2], [bx + u * 3, hy - u * 0.2], [bx + u * 2.7, hy + u * 0.3], [bx + u * 0.2, hy + u * 0.3]], { fill: mix("#5A6470", "#1E2533", night) });
        c.rect(bx + u * 0.3, hy - u * 0.9, bx + u * 2.2, hy - u * 0.2, mix("#C8442F", "#3A2A33", night));
      }
    }
    if (sh !== null) {
      const [sx, port] = sh;
      const lx1 = x1 + (sx - LAND_W) * W, lx2 = x1 + (sx + LAND_W) * W;
      c.rect(lx1, hy - 0.05 * H, lx2, hy + 0.012 * H, port.far);
      drawShapes(c, port.scene, x1 + sx * W, hy, k, [-LAND_W * W / k, LAND_W * W / k]);
      c.rect(lx1, hy - 0.004 * H, lx2, hy + 0.012 * H, port.ground);
      c.polygon([[lx1, hy + 0.012 * H], [lx1 - 0.04 * W, hy + 0.012 * H], [lx1, hy - 0.05 * H]], { fill: port.far });
      c.polygon([[lx2, hy + 0.012 * H], [lx2 + 0.04 * W, hy + 0.012 * H], [lx2, hy - 0.05 * H]], { fill: port.far });
    }
    // Wellen: weiter hinten langsamer und kleiner
    const wave = mix("#A9D3EE", "#4A5A80", night);
    for (let j = 0; j < 6; j++) {
      const f = (j + 1) / 7, y = hy + (wl - hy) * f * f, speed = 0.15 + 0.85 * f * f, sp = 0.12 + 0.1 * f;
      first = Math.floor(X * speed / sp) - 1;
      for (let i = first; i < first + Math.floor((fullX2 - x1) / W / sp) + 3; i++) {
        const wx = x1 + (i * sp + rnd(i, 130 + j) * sp * 0.6 - X * speed) * W;
        c.line([[wx, y], [wx + (0.02 + 0.03 * f) * W, y]], { fill: wave, width: Math.max(1, (1 + 2 * f) * s) });
      }
    }

    // Möwen in Hafennähe
    if (sh !== null && night < 0.3) {
      for (let i = 0; i < 5; i++) {
        const gx = x1 + (((rnd(i, 150) + tNow * 0.03 * (0.6 + rnd(i, 151))) % 1.2) - 0.1) * W;
        const gy = y1 + (0.12 + 0.25 * rnd(i, 152)) * H + Math.sin(tNow * 2 + i) * 4 * s;
        const wing = 8 * s * (0.8 + 0.4 * Math.abs(Math.sin(tNow * 6 + i)));
        c.line([[gx - wing, gy - wing * 0.4], [gx, gy], [gx + wing, gy - wing * 0.4]], { fill: "#F4F4F4", width: Math.max(1, 2 * s), join: "round" });
      }
    }

    // Delfine auf hoher See
    if (this.phase === "sea" && night < 0.5) {
      first = Math.floor(X / 1.7) - 1;
      for (let i = first; i < first + 3; i++) {
        if (rnd(i, 160) < 0.4) continue;
        const dx = x1 + (i * 1.7 + 0.6 - X) * W, u = (dx - x1) / W;
        if (u > 0.5 && u < 1.0) {
          const phase = (u - 0.5) / 0.5;
          for (let kk = 0; kk < 2; kk++) drawDolphin(c, dx + kk * 0.07 * W, hy + (wl - hy) * (0.55 + 0.1 * kk), 0.07 * W, (phase * 2 + kk * 0.3) % 1);
        }
      }
    }

    // Schiff mit Bugwelle und Kielwasser
    const length = Math.min(0.46 * W, 0.95 * H);
    const bob = this.phase !== "port" ? Math.sin(tNow * 1.3) * 2.5 * s : 0;
    const sxp = x1 + SHIP_X * W;
    if (v > 0.02) {
      const foam = mix("#FFFFFF", "#8090B0", night);
      for (let kk = 0; kk < 3; kk++) c.line([[x1, wl + (2 + kk * 5) * s], [sxp - 0.48 * length, wl + (2 + kk * 3) * s]], { fill: foam, width: Math.max(1, (3 - kk) * s) });
      const bx = sxp + 0.5 * length;
      c.polygon([[bx - 0.04 * length, wl], [bx + 0.03 * length, wl - 0.025 * length * v], [bx + 0.08 * length, wl + 3 * s]], { fill: foam });
    }
    drawCruiseShip(c, sxp, wl + bob, length, this.line.color, night);
    // Wasser vor dem Rumpf
    const nearTop = mix("#2F78A8", "#152247", night);
    for (let i = 0; i < 3; i++) c.rect(x1, wl + 0.004 * H + (y2 - wl) * i / 3, fullX2, wl + 0.004 * H + (y2 - wl) * (i + 1) / 3 + 1, mix(nearTop, seaBottom, i / 2));
    for (let i = Math.floor(X / 0.18) - 1; i < Math.floor(X / 0.18) + Math.floor((fullX2 - x1) / W / 0.18) + 3; i++) {
      const wx = x1 + (i * 0.18 + rnd(i, 170) * 0.08 - X) * W, yy = wl + (0.02 + 0.08 * rnd(i, 171)) * H;
      c.line([[wx, yy], [wx + 0.05 * W, yy]], { fill: wave, width: Math.max(1, 3 * s) });
    }
    this.geo = [sxp, wl, length, W, H];

    // Kai im Vordergrund (im Hafen), mit Pollern
    if (sh !== null) {
      const qx1 = x1 + Math.max(sh[0] - SCENE_X + SHIP_X - 1.1, sh[0] - LAND_W) * W;     // der Kai endet mit dem Ufer
      const qx2 = x1 + (sh[0] - SCENE_X + SHIP_X + 1.0) * W;
      const qy = wl + 0.03 * H;
      if (qx2 > x1 && qx1 < fullX2) {
        c.rect(qx1, qy, qx2, y2, "#A3A8AE");
        c.rect(qx1, qy, qx2, qy + 0.012 * H, "#C9CED6");
        c.rect(qx1, qy + 0.012 * H, qx2, qy + 0.018 * H, "#F2D21B");
        for (let bx = qx1 + 0.05 * W; bx < qx2; bx += 0.22 * W) {
          c.rect(bx - 5 * s, qy - 6 * s, bx + 5 * s, qy + 2 * s, "#3A3A3A");
          c.oval(bx - 7 * s, qy - 9 * s, bx + 7 * s, qy - 4 * s, { fill: "#3A3A3A" });
        }
        if (this.phase === "port") {                                    // Leinen zum Poller
          for (const fx of [-0.42, 0.42]) {
            c.line([[sxp + fx * length, wl - 0.1 * length], [sxp + fx * length + 0.05 * W, qy - 6 * s]], { fill: "#E9DCC0", width: Math.max(1, 2 * s) });
          }
        }
      }
    }
    if (this.gangway) this.drawGangway(c, wl + 0.03 * H);

    // Fahrt-Anzeige oben links
    if (["leave", "sea", "arrive"].includes(this.phase)) {
      const kn = Math.round(18 * v);
      const text = `${kn} Knoten  ·  ${Math.round(kn * 1.852)} km/h`;
      const f = app.font(17, "bold"), tw = f.measure(text) + 30 * s;
      c.roundRect(x1 + 20 * s, y1 + 18 * s, x1 + 20 * s + tw, y1 + 58 * s, 20 * s, { fill: "#1E2A38" });
      c.text(x1 + 20 * s + tw / 2, y1 + 38 * s, text, f, LED);
    }
  }

  /** Gangway von der Tür im Rumpf hinunter auf den Kai, mit Passagieren. */
  drawGangway(c, qy) {
    const s = this.app.s;
    const [sxp, wl, length, W] = this.geo;
    const g = this.gangway, t = now();
    let out = 1 - (g.closing !== null ? Math.min(1, (t - g.closing) / 0.8) : 0);
    out *= Math.min(1, (t - g.t0) / 0.8);
    const dx = sxp + 0.2 * length, dy = wl - 0.07 * length;
    c.rect(dx - 0.012 * length, dy - 0.025 * length, dx + 0.012 * length, dy + 0.012 * length, "#2B3440");
    const ex = dx + 0.16 * length * out, ey = dy + (qy - dy) * out;
    c.polygon([[dx, dy + 0.012 * length], [ex, ey], [ex, ey - 4 * s], [dx, dy + 0.012 * length - 4 * s]], { fill: "#C9CED6", outline: "#7D8794" });
    c.line([[dx, dy - 0.02 * length], [ex, ey - 0.03 * length]], { fill: "#7D8794", width: Math.max(1, 2 * s) });
    if (out < 1) return;
    const far = ex + 0.35 * W, tAll = t - g.t0 - 0.8;
    for (const [look, start, way] of g.people) {
      const tt = tAll - start;
      if (tt < 0) continue;
      const deck = [dx, dy + 0.012 * length, 1];
      const segs = way === "in"
        ? [[2.0, [far, qy, 1], [ex, qy, 1], "walk"], [1.2, [ex, qy, 1], deck, "walk"]]
        : [[1.2, deck, [ex, qy, 1], "walk"], [2.2, [ex, qy, 1], [far, qy, 1], "walk"]];
      const pos = follow(segs, tt);
      if (pos) drawPerson(c, pos[0], pos[1], 0.07 * length, look, "walk", tt * 9 + start);
    }
  }

  drawPanel(c, w, h, px1, top) {
    const app = this.app, s = app.s;
    const px2 = w - 24 * s, py = top + 24 * s, pw = px2 - px1 - 48 * s;
    c.roundRect(px1 + 5 * s, py + 7 * s, px2 + 5 * s, h - 24 * s + 7 * s, 26 * s, { fill: SHADOW });
    c.roundRect(px1, py, px2, h - 24 * s, 26 * s, { fill: PANEL });
    const ix = px1 + 24 * s;
    const labelFont = app.font(14, "bold"), bigFont = app.font(26, "bold"), midFont = app.font(17, "bold");

    // Karte mit der Seeroute
    if (!app.seaMap) app.seaMap = new SeaMap(app.data.flights.land);
    const n = this.codes.length;
    const legs = [];
    for (let kk = 0; kk < n - 1; kk++) legs.push(this.leg(kk));
    const ports = [];
    for (let i = 0; i < n - (this.roundTrip ? 1 : 0); i++) { const p = this.port(i); ports.push([p.lat, p.lon, p.name]); }
    const mapH = Math.min(pw * 0.68, (h - top) * 0.3);
    const mx1 = ix - 8 * s, my1 = py + 16 * s, mx2 = ix + pw + 8 * s, my2 = py + 16 * s + mapH;
    const cur = Math.min(this.stop, n - 2);
    const frac = this.phase !== "port" ? this.hopProgress() : (this.stop > cur ? 1 : 0);
    app.seaMap.draw(c, legs, mx1, my1, mx2, my2, s, cur, frac, ports, app.font(11, "bold"));
    let y = my2 + 24 * s;

    c.text(ix, y, "KREUZFAHRT", labelFont, "#F7D117", "w");
    c.text(ix + pw, y, `Hafen ${this.stop + 1} von ${n}`, app.font(14), "#B8C4D0", "e");
    y += 22 * s;
    const tg = this.target;
    let info;
    if (this.phase === "port") {
      c.text(ix, y, fitText(bigFont, this.here.name, pw), bigFont, "white", "nw");
      y += bigFont.linespace();
      c.text(ix, y, fitText(midFont, this.here.country, pw), midFont, "#CFE8FF", "nw");
      y += midFont.linespace();
      info = this.last ? "Ende der Reise" : `Nächster Hafen: ${this.port(this.stop + 1).name} · ${daysText(this.hours(this.stop))}`;
    } else {
      c.text(ix, y, fitText(bigFont, "Nach " + tg.name, pw), bigFont, "white", "nw");
      y += bigFont.linespace();
      const km = this.cruise.km[this.direction === 0 ? this.stop : this.cruise.km.length - 1 - this.stop];
      c.text(ix, y, fitText(midFont, `${tg.country} · ${km.toLocaleString("de-DE")} km`, pw), midFont, "#CFE8FF", "nw");
      y += midFont.linespace();
      info = `Auf See ca. ${daysText(this.hours(this.stop))}`;
    }
    c.text(ix, y, fitText(midFont, info, pw), midFont, "#9FE3B0", "nw");
    y += midFont.linespace() + 10 * s;
    const barW = px2 - px1 - 48 * s;
    c.roundRect(ix, y, ix + barW, y + 14 * s, 7 * s, { fill: "#3A4A5C" });
    const total = (this.stop + (this.phase !== "port" ? this.hopProgress() : 0)) / Math.max(1, n - 1);
    if (total > 0) c.roundRect(ix, y, ix + Math.max(14 * s, barW * total), y + 14 * s, 7 * s, { fill: this.line.color });

    // Knöpfe
    const inPort = this.phase === "port";
    const buttons = [[this.phase === "sea" ? "▶▶" : "▼", () => this.go(), (inPort && !this.last) || this.phase === "sea", "#F7D117", PANEL, 30],
      ["Ansage", () => this.announce(), true, "#3D8BD4", "white", 17],
      ["T", () => this.horn(), true, "#E8483B", "white", 30],
      ["Ö", () => this.toggleOpen(), inPort, "#2BA59B", "white", 30],
      ["U", () => this.change(), !!this.stationKey(), "#2F855A", "white", 30],
      ["R", () => this.again(), inPort && this.last, "#8E6BBF", "white", 30]];
    const bgap = 12 * s;
    const bsize = Math.min(84 * s, (pw - (buttons.length - 1) * bgap) / buttons.length);
    const by2 = h - 50 * s, btnY = by2 - bsize - 76 * s;
    let bx1 = (px1 + px2) / 2 - (buttons.length * bsize + (buttons.length - 1) * bgap) / 2;
    for (const [sym, cb, enabled, bg, fg, size] of buttons) {
      c.roundRect(bx1, btnY, bx1 + bsize, btnY + bsize, 24 * s, { fill: enabled ? bg : "#3A4A5C" });
      c.text(bx1 + bsize / 2, btnY + bsize / 2, sym, app.font(size, "bold"), enabled ? fg : "#5A6A7C");
      if (enabled) app.hit(bx1, btnY, bx1 + bsize, btnY + bsize, cb);
      bx1 += bsize + bgap;
    }
    // großer Knopf unten
    let label, cb = null;
    if (inPort && !this.last) [label, cb] = [`⚓  Leinen los – nach ${this.port(this.stop + 1).name}`, () => this.go()];
    else if (inPort) [label, cb] = [this.roundTrip ? "⟲  Nochmal: " + this.cruise.title : `⟲  Zurück nach ${this.port(0).name}`, () => this.again()];
    else label = "Gute Fahrt!";
    const rbw = px2 - px1 - 48 * s, rbh = 56 * s, rby = by2 - rbh;
    c.roundRect(ix, rby, ix + rbw, rby + rbh, 28 * s, { fill: cb ? "white" : "#3A4A5C" });
    const bf = app.font(20, "bold");
    c.text(ix + rbw / 2, rby + rbh / 2, fitText(bf, label, rbw - 20 * s), bf, cb ? PANEL : "#8A9AAC");
    if (cb) app.hit(ix, rby, ix + rbw, rby + rbh, cb);

    // Leuchtanzeige
    let [text, until] = this.message;
    if (!(text && now() < until)) {
      if (this.gangway) text = "Gangway draußen – Ö holt sie ein";
      else if (inPort) text = this.last ? "Ö: Gangway · R: nochmal" : "Ö: Gangway · ▼: Ablegen";
      else text = { leave: "Ablegen …", sea: "Auf hoher See – ▼ fährt schneller", arrive: `Einlaufen in ${tg.name}` }[this.phase];
    }
    const boxY1 = y + 30 * s, boxY2 = btnY - 14 * s;
    if (boxY2 - boxY1 >= 40 * s) {
      c.roundRect(ix, boxY1, ix + pw, boxY2, 14 * s, { fill: "#11181F", outline: "#3A4A5C", width: 2 * s });
      const mf = app.font(boxY2 - boxY1 > 70 * s ? 22 : 19, "bold");
      const lines = wrapText(mf, text, pw - 24 * s, 2);
      const lh = mf.linespace();
      let ty = (boxY1 + boxY2) / 2 - lh * (lines.length - 1) / 2;
      for (const ln of lines) { c.text((px1 + px2) / 2, ty, ln, mf, "#FFB000"); ty += lh; }
    }
  }
}

// --------------------------------------------------------------------------
// Türen auf (Taste Ö): Blick in den Innenraum, Fahrgäste steigen ein und aus
// --------------------------------------------------------------------------

const DOOR_KEYS = new Set(["ö", "Ö", "o", "O"]);
const ROT_T = 0.8;             // Sekunden für das Umdrehen in den Innenraum
const DOOR_T = 0.7;            // Sekunden zum Öffnen bzw. Schließen der Türen
const DOORS_X = [0.22, 0.70];  // Türmitten (Anteil der Breite)
const DOOR_W = 0.16;
// Plätze im Innenraum: Sitzplätze und zwei Stehplätze an den Haltestangen
const SLOTS = [[0.05, "sit"], [0.38, "sit"], [0.46, "sit"], [0.54, "sit"], [0.86, "sit"], [0.94, "sit"],
  [0.33, "stand"], [0.59, "stand"]];
const IN_Y = 0.95, OUT_Y = 0.80, OUT_S = 0.72;   // Fußhöhe drinnen/draußen, Größe draußen (weiter weg)
const SKIN = ["#F2C9A8", "#E0AC85", "#C68B5E", "#8D5A3B", "#F5D6BC"];
const HAIR = ["#2B1E16", "#5A3A22", "#C9A15A", "#8C8C8C", "#B5442A", "#111111"];
const SHIRT = ["#E8483B", "#3D8BD4", "#F2B233", "#2F9E5B", "#8E6BBF", "#F07FA8", "#FFFFFF", "#2BA59B", "#F28C28"];
const PANTS = ["#2F3E5C", "#3A3A3A", "#6B5A4A", "#4F6D8A", "#7A4E8C"];
const INTERIOR = {   // Wand, Sitze, Haltestangen, Türflügel
  sbahn: ["#ECE7DC", "#B5121B", "#F2B233", "#C9CED6"],
  ubahn: ["#EFEAE0", "#2F5597", "#F7D117", "#F7D117"],
  tram: ["#F2EEE6", "#C9302C", "#F7D117", "#D5D9DE"],
  bus: ["#EEEEEE", "#2F4E8C", "#F7D117", "#D5D9DE"],
  regio: ["#ECECEC", "#2F5A9E", "#A8AEB5", "#D7001D"],
  ice: ["#F4F4F4", "#59636F", "#A8AEB5", "#D5D9DE"],
  faehre: ["#EFE9DC", "#1F6FA8", "#B8BEC6", "#F7D117"],
};

/** Zufallszahlen, die bei gleichem Startwert immer gleich ausfallen. */
function seededRandom(seed) {
  let h = 1779033703;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353), h = (h << 13) | (h >>> 19);
  let a = h >>> 0;
  const random = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random,
    choice: arr => arr[Math.floor(random() * arr.length)],
    randint: (lo, hi) => lo + Math.floor(random() * (hi - lo + 1)),
    uniform: (lo, hi) => lo + (hi - lo) * random(),
    shuffle: arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; },
  };
}

function randomLook(rng) {
  return { skin: rng.choice(SKIN), hair: rng.choice(HAIR), shirt: rng.choice(SHIRT), pants: rng.choice(PANTS),
    size: rng.choice([0.68, 0.74, 0.95, 1.0, 1.0, 1.05]), hat: rng.random() < 0.2 };
}

/** Mensch von vorn; yf = Füße (beim Sitzen: Sitzfläche), u = Größe eines Erwachsenen in Pixeln. */
function drawPerson(c, x, yf, u, look, pose = "stand", phase = 0) {
  u *= look.size;
  const lw = Math.max(1, u * 0.075);
  let hip, top;
  if (pose === "sit") {
    hip = yf;
    for (const dx of [-0.06, 0.06]) {
      c.line([[x + dx * u, hip], [x + dx * u, hip + 0.24 * u]], { fill: look.pants, width: lw, cap: "round" });
      c.oval(x + dx * u - 0.05 * u, hip + 0.22 * u, x + dx * u + 0.05 * u, hip + 0.27 * u, { fill: "#2B2B2B" });
    }
  } else {
    hip = yf - 0.44 * u;
    const swing = pose === "walk" ? Math.sin(phase) * 0.07 * u : 0;
    for (const [dx, sw] of [[-0.06, swing], [0.06, -swing]]) {
      c.line([[x + dx * u, hip], [x + dx * u + sw, yf - 0.03 * u]], { fill: look.pants, width: lw, cap: "round" });
      c.oval(x + dx * u + sw - 0.05 * u, yf - 0.05 * u, x + dx * u + sw + 0.05 * u, yf, { fill: "#2B2B2B" });
    }
  }
  top = hip - 0.36 * u;
  const arm = pose === "walk" ? Math.sin(phase) * 0.06 * u : 0;
  for (const [dx, sw] of [[-0.15, -arm], [0.15, arm]]) {
    c.line([[x + dx * u, top + 0.06 * u], [x + dx * u * 1.1 + sw, top + 0.32 * u]], { fill: look.shirt, width: lw, cap: "round" });
  }
  c.roundRect(x - 0.14 * u, top, x + 0.14 * u, hip + 0.03 * u, 0.06 * u, { fill: look.shirt });
  const hy = top - 0.11 * u;
  c.oval(x - 0.1 * u, hy - 0.11 * u, x + 0.1 * u, hy + 0.11 * u, { fill: look.skin });
  if (look.hat) {
    c.rect(x - 0.12 * u, hy - 0.08 * u, x + 0.12 * u, hy - 0.04 * u, look.pants);
    c.oval(x - 0.09 * u, hy - 0.17 * u, x + 0.09 * u, hy - 0.04 * u, { fill: look.pants });
  } else {
    c.oval(x - 0.105 * u, hy - 0.125 * u, x + 0.105 * u, hy - 0.01 * u, { fill: look.hair });
  }
  c.oval(x - 0.045 * u, hy - 0.01 * u, x - 0.02 * u, hy + 0.015 * u, { fill: "#2B2B2B" });
  c.oval(x + 0.02 * u, hy - 0.01 * u, x + 0.045 * u, hy + 0.015 * u, { fill: "#2B2B2B" });
}

/** Weg aus Abschnitten [Dauer, von, nach, Haltung]: [x, y, Größe, Haltung] zur Zeit t – oder null. */
function follow(segments, t) {
  for (const [dur, a, b, pose] of segments) {
    if (t < dur || dur === Infinity) {
      const f = dur === 0 || dur === Infinity ? 0 : Math.max(0, t / dur);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, pose];
    }
    t -= dur;
  }
  return null;
}

/** Türen eines Fahrzeugs an einer Station: umdrehen, Türen auf, Leute steigen ein und aus. */
class Doors {
  constructor(ride) {
    this.ride = ride;
    this.t0 = now();
    this.closingAt = null;
    const key = ride.stops[ride.index];
    const rng = seededRandom(`${key}-${ride.line.name}-${ride.doorCount}`);
    ride.doorCount += 1;
    const last = ride.index === ride.stops.length - 1 && !ride.ring;
    const busy = Math.min(3, Math.floor(ride.transferOptions().length / 3));
    // wer aussteigt (an der Endstation alle), wer bleibt
    const leaving = ride.riders.filter(() => last || rng.random() < 0.4);
    this.stay = ride.riders.filter(r => !leaving.includes(r));
    const taken = new Set(this.stay.map(r => r.slot));
    const free = rng.shuffle(SLOTS.map((_, i) => i).filter(i => !taken.has(i)));
    const nIn = last ? 0 : Math.min(free.length, rng.randint(1, 3) + busy);
    const entering = free.slice(0, nIn).map(slot => ({ look: randomLook(rng), slot }));
    const start = ROT_T + DOOR_T;
    this.movers = leaving.map((r, k) => this.path(r, "out", start + 0.7 * k, rng))
      .concat(entering.map((r, k) => this.path(r, "in", start + 0.6 + 0.8 * k, rng)));
    this.doneAt = Math.max(start, ...this.movers.map(m => m.segs.reduce((sum, sg) => sum + (sg[0] === Infinity ? 0 : sg[0]), 0)));
    ride.riders = this.stay.concat(entering);
    // Leute, die auf dem Bahnsteig warten und nicht einsteigen
    this.crowd = Array.from({ length: rng.randint(1, 3) }, () => [rng.uniform(0.02, 0.98), randomLook(rng)]);
  }

  path(rider, way, start, rng) {
    const [sx, pose] = SLOTS[rider.slot];
    const dx = DOORS_X.reduce((best, d) => (Math.abs(d - sx) < Math.abs(best - sx) ? d : best));
    const side = rng.choice([-1, 1]);
    const outside = [dx + side * 0.09, OUT_Y, OUT_S], doorOut = [dx, OUT_Y, OUT_S], doorIn = [dx, IN_Y, 1], seat = [sx, IN_Y, 1];
    const walkIn = 0.3 + Math.abs(sx - dx) * 2.5;
    let segs;
    if (way === "in") {
      segs = [[start, outside, outside, "stand"], [0.6, outside, doorOut, "walk"], [0.5, doorOut, doorIn, "walk"],
        [walkIn, doorIn, seat, "walk"], [Infinity, seat, seat, pose]];
    } else {
      const away = [dx + side * 0.3, OUT_Y, OUT_S];
      segs = [[start, seat, seat, pose], [walkIn, seat, doorIn, "walk"], [0.5, doorIn, doorOut, "walk"], [1.2, doorOut, away, "walk"]];
    }
    return { look: rider.look, segs, way, seed: rng.random() * 6 };
  }

  get t() { return now() - this.t0; }

  /** 0 = Ansicht von vorher, 1 = Innenraum. */
  rotation() {
    if (this.closingAt !== null) return 1 - smooth((this.t - this.closingAt - DOOR_T) / ROT_T);
    return smooth(this.t / ROT_T);
  }

  /** 0 = Türen zu, 1 = ganz offen. */
  opening() {
    if (this.closingAt !== null) return 1 - Math.min(1, (this.t - this.closingAt) / DOOR_T);
    return Math.min(1, Math.max(0, (this.t - ROT_T) / DOOR_T));
  }

  busy() { return this.closingAt === null && this.t < this.doneAt; }
  finished() { return this.closingAt !== null && this.t >= this.closingAt + DOOR_T + ROT_T; }
  close() { this.closingAt = this.t; }
  animating() { return this.closingAt !== null || this.t < this.doneAt + 0.2; }

  draw(c, w, h) {
    const app = this.ride.app, p = this.rotation(), ctx = c.ctx;
    if (p < 1) {
      // Umdrehen: die bisherige Ansicht schiebt sich zur Seite, der Innenraum kommt nach
      ctx.save(); ctx.translate(-p * w, 0); this.ride.drawView(c, w, h); ctx.restore();
      ctx.save(); ctx.translate((1 - p) * w, 0); this.drawInside(c, w, h); ctx.restore();
      app.hits = [];
    } else {
      this.drawInside(c, w, h);
    }
  }

  drawInside(c, w, h) {
    const ride = this.ride, app = ride.app, s = app.s, kind = ride.kind;
    const name = app.data.stations[ride.stops[ride.index]];
    const topH = 112 * s, bottomH = 120 * s;
    const x1 = 0, y1 = topH, x2 = w, y2 = h - bottomH, W = x2 - x1, H = y2 - y1;
    const X = f => x1 + f * W, Y = f => y1 + f * H;
    const [wall, seatCol, pole, leaf] = INTERIOR[kind] || INTERIOR.sbahn;
    const t = this.t;

    this.drawOutside(c, x1, y1, x2, y2, name);
    const u = 0.55 * H;
    // Leute draußen (nur durch Fenster und Türen zu sehen)
    for (const [fx, look] of this.crowd) drawPerson(c, X(fx), Y(OUT_Y), u * OUT_S, look);
    const peopleIn = [];
    for (const m of this.movers) {
      const pos = follow(m.segs, t);
      if (!pos) continue;
      const [fx, fy, sc, pose] = pos;
      if (sc < 0.86) drawPerson(c, X(fx), Y(fy), u * sc, m.look, pose, t * 9 + m.seed);
      else peopleIn.push([fx, fy, sc, pose, m.look, m.seed]);
    }

    // Wand mit Fenstern und Türöffnungen
    const winTop = 0.16, winBot = 0.48, doorTop = 0.14;
    const doors = DOORS_X.map(d => [X(d - DOOR_W / 2), X(d + DOOR_W / 2)]);
    c.rect(x1, y1, x2, Y(winTop), wall);
    const cols = [x1].concat(...doors, [x2]);
    for (let i = 0; i < cols.length; i += 2) {                     // Wandstücke zwischen den Türen
      const a = cols[i], b = cols[i + 1];
      c.rect(a, Y(winBot), b, Y(0.82), wall);
      const n = a > x1 && b < x2 ? 1 : Math.max(1, Math.round((b - a) / (0.13 * W)));
      for (let k = 0; k <= n; k++) {                               // Fensterpfosten
        const px = a + (b - a) * k / n;
        c.rect(px - 0.008 * W, Y(winTop), px + 0.008 * W, Y(winBot), wall);
      }
      c.rect(a, Y(winTop) - 2 * s, b, Y(winTop) + 3 * s, darker(wall, 0.85));
    }
    const o = this.opening();
    for (const [a, b] of doors) {                                  // Türrahmen
      c.rect(a - 0.012 * W, Y(doorTop) - 0.012 * W, b + 0.012 * W, Y(doorTop), "#5F6670");
      c.rect(a - 0.012 * W, Y(doorTop), a, Y(0.82), "#5F6670");
      c.rect(b, Y(doorTop), b + 0.012 * W, Y(0.82), "#5F6670");
      // Türflügel gleiten zur Seite
      const half = (b - a) / 2;
      for (const [lx1, lx2] of [[a - o * half * 0.95, a + half - o * half * 0.95], [a + half + o * half * 0.95, b + o * half * 0.95]]) {
        c.polygon([[lx1, Y(doorTop)], [lx2, Y(doorTop)], [lx2, Y(0.82)], [lx1, Y(0.82)]], { fill: leaf, outline: darker(leaf, 0.7), width: Math.max(1, 2 * s) });
        c.polygon([[lx1 + half * 0.18, Y(doorTop + 0.05)], [lx2 - half * 0.18, Y(doorTop + 0.05)], [lx2 - half * 0.18, Y(0.5)], [lx1 + half * 0.18, Y(0.5)]],
          { fill: "#BFD9EE", outline: darker(leaf, 0.7) });
      }
      // Lampe über der Tür: blinkt beim Öffnen und Schließen
      const lamp = o > 0 && o < 1 && Math.floor(t * 6) % 2 === 0 ? "#FF9A1F" : "#7A5A2A";
      const cx = (a + b) / 2;
      c.oval(cx - 7 * s, Y(doorTop) - 0.012 * W - 14 * s, cx + 7 * s, Y(doorTop) - 0.012 * W, { fill: lamp });
    }
    // Decke: Haltestange und Griffe, Werbeflächen
    c.line([[x1, Y(0.09)], [x2, Y(0.09)]], { fill: pole, width: Math.max(2, 5 * s) });
    for (let k = 0; k < 14; k++) {
      const gx = X((k + 0.5) / 14);
      c.line([[gx, Y(0.09)], [gx, Y(0.13)]], { fill: "#6B7079", width: Math.max(1, 2 * s) });
      c.oval(gx - 6 * s, Y(0.13), gx + 6 * s, Y(0.13) + 12 * s, { outline: "#6B7079", width: Math.max(1, 2 * s) });
    }
    for (const fx of [0.04, 0.36, 0.84]) {
      c.polygon([[X(fx), Y(0.015)], [X(fx + 0.12), Y(0.015)], [X(fx + 0.12), Y(0.065)], [X(fx), Y(0.065)]], { fill: "#FFFFFF", outline: darker(wall, 0.8) });
      c.rect(X(fx + 0.01), Y(0.025), X(fx + 0.05), Y(0.055), MODE[kind][2]);
    }
    // Boden
    c.rect(x1, Y(0.82), x2, y2, "#5C5F66");
    for (let k = 1; k < 4; k++) c.line([[x1, Y(0.82 + k * 0.045)], [x2, Y(0.82 + k * 0.045)]], { fill: "#52555C", width: Math.max(1, s) });
    // Sitze
    for (const [fx, pose] of SLOTS) {
      if (pose !== "sit") continue;
      c.roundRect(X(fx - 0.035), Y(0.5), X(fx + 0.035), Y(0.72), 8 * s, { fill: seatCol, outline: darker(seatCol, 0.7) });
      for (let k = 0; k < 3; k++) {                                // Muster im Sitzbezug
        const mx = X(fx - 0.02 + k * 0.02);
        c.oval(mx - 2 * s, Y(0.58) - 2 * s, mx + 2 * s, Y(0.58) + 2 * s, { fill: tint(seatCol, 0.5) });
      }
      c.roundRect(X(fx - 0.04), Y(0.7), X(fx + 0.04), Y(0.75), 6 * s, { fill: darker(seatCol, 0.85) });
    }
    // Haltestangen neben den Türen
    for (const [a, b] of doors) {
      for (const px of [a - 0.03 * W, b + 0.03 * W]) c.line([[px, Y(0.09)], [px, y2]], { fill: pole, width: Math.max(3, 7 * s) });
    }
    // Fahrgäste drinnen: sitzend, stehend, gehend
    for (const r of this.stay) {
      const [fx, pose] = SLOTS[r.slot];
      drawPerson(c, X(fx), pose === "sit" ? Y(0.71) : Y(IN_Y), u, r.look, pose);
    }
    peopleIn.sort((p, q) => p[1] - q[1]);
    for (const [fx, fy, sc, pose, look, seed] of peopleIn) {
      drawPerson(c, X(fx), pose === "sit" ? Y(0.71) : Y(fy), u * sc, look, pose, t * 9 + seed);
    }
    this.drawBars(c, w, h, topH, bottomH, name);
  }

  /** Was man durch Fenster und Türen sieht: Bahnsteig, Haltestelle oder Straße. */
  drawOutside(c, x1, y1, x2, y2, name) {
    const ride = this.ride, app = ride.app, s = app.s, kind = ride.kind;
    const W = x2 - x1, H = y2 - y1, X = f => x1 + f * W, Y = f => y1 + f * H;
    const level = kind !== "tram" && kind !== "bus" && kind !== "faehre" ? ride.levels[ride.index] : "ground";
    let signBg, signFg;
    if (level === "tunnel") {
      c.rect(x1, y1, x2, Y(0.82), "#E6DFC8");
      for (let k = 0; k < 60; k++) c.line([[X(k / 60), y1], [X(k / 60), Y(0.7)]], { fill: "#D6CEB4" });
      for (let k = 0; k < 14; k++) c.line([[x1, Y(k * 0.05)], [x2, Y(k * 0.05)]], { fill: "#D6CEB4" });
      c.rect(x1, Y(0.34), x2, Y(0.38), ride.line.color);
      [signBg, signFg] = ["#0A3E7A", "white"];
    } else {
      ["#8EC3EC", "#A9D2F1", "#C4E1F6"].forEach((col, i) => c.rect(x1, Y(i * 0.15), x2, Y((i + 1) * 0.15) + 1, col));
      if (kind === "tram" || kind === "bus") {
        for (let k = 0; k < 8; k++) {                              // Häuser auf der anderen Straßenseite
          const hx = X(k / 8);
          c.rect(hx, Y(0.12 + 0.04 * (k % 3)), hx + W / 8 + 1, Y(0.7), ["#E8C9A0", "#D9A68C", "#C7D3DD", "#E6DDB8"][k % 4]);
          for (const wy of [0.24, 0.38, 0.52]) for (const wx of [0.2, 0.6]) c.rect(hx + W / 8 * wx, Y(wy), hx + W / 8 * (wx + 0.2), Y(wy + 0.07), "#7E97AD");
        }
        [signBg, signFg] = ["#F2D21B", "#0F6B3A"];
      } else if (kind === "faehre") {
        for (let k = 0; k < 12; k++) {                             // Bäume am anderen Ufer
          const tx = X((k + 0.3) / 12);
          c.oval(tx - 0.05 * W, Y(0.3), tx + 0.05 * W, Y(0.54), { fill: ["#5E9C46", "#4F8F3F"][k % 2] });
        }
        c.rect(x1, Y(0.5), x2, Y(0.56), "#7FAF62");
        [signBg, signFg] = ["#F2D21B", "#0F6B3A"];
      } else {
        for (let k = 0; k < 12; k++) {                             // Bäume hinter dem Bahnsteig
          const tx = X((k + 0.3) / 12);
          c.oval(tx - 0.05 * W, Y(0.36), tx + 0.05 * W, Y(0.6), { fill: "#6E9E58" });
        }
        c.rect(x1, Y(0), x2, Y(0.05), "#6B7079");                   // Bahnsteigdach
        [signBg, signFg] = kind === "sbahn" ? ["#00703C", "white"] : ["#0A1E6E", "white"];
      }
      if (kind === "faehre") {                                     // Wasser mit Wellen
        c.rect(x1, Y(0.56), x2, Y(0.7), "#4C95C5");
        for (let k = 0; k < 16; k++) {
          const wx = X(rnd(k, 24)), wy = Y(0.58 + 0.1 * rnd(k, 25));
          c.line([[wx, wy], [wx + 0.05 * W, wy]], { fill: "#8CC6E8", width: Math.max(1, 3 * s) });
        }
      } else {
        c.rect(x1, Y(0.58), x2, Y(0.7), "#B9B4AA");
      }
    }
    if (kind === "faehre") {                                       // Anleger aus Holzbohlen
      c.rect(x1, Y(0.7), x2, Y(0.82), PIER);
      for (let k = 1; k < 40; k++) c.line([[X(k / 40), Y(0.7)], [X(k / 40), Y(0.8)]], { fill: "#8A6542", width: Math.max(1, 2 * s) });
      c.rect(x1, Y(0.8), x2, Y(0.82), PIER_SIDE);
    } else {
      c.rect(x1, Y(0.7), x2, Y(0.82), "#A9A49A");                     // Bahnsteig / Gehweg
      c.rect(x1, Y(0.8), x2, Y(0.82), level === "tunnel" || ["sbahn", "ubahn", "regio", "ice"].includes(kind) ? "#F2D21B" : "#8C877D");
    }
    // Stationsschild, durch das große Fenster zwischen den Türen zu sehen
    const f = app.font(22, "bold"), text = fitText(f, name, 0.14 * W), tw = f.measure(text) + 24 * s, cx = X(0.46);
    c.roundRect(cx - tw / 2, Y(0.2), cx + tw / 2, Y(0.2) + 50 * s, 8 * s, { fill: signBg, outline: "white", width: 3 * s });
    c.text(cx, Y(0.2) + 25 * s, text, f, signFg);
    if (kind === "tram" || kind === "bus" || kind === "faehre") {      // Haltestellenschild mit „H“
      const hx = X(0.86);
      c.line([[hx, Y(0.24)], [hx, Y(0.8)]], { fill: "#8C877D", width: Math.max(2, 4 * s) });
      c.oval(hx - 22 * s, Y(0.2) - 22 * s, hx + 22 * s, Y(0.2) + 22 * s, { fill: "#F2D21B", outline: "#0F6B3A", width: 3 * s });
      c.text(hx, Y(0.2), "H", app.font(24, "bold"), "#0F6B3A");
    }
  }

  drawBars(c, w, h, topH, bottomH, name) {
    const ride = this.ride, app = ride.app, s = app.s, frame = "#2B2F36";
    c.rect(0, 0, w, topH, frame);
    c.rect(0, h - bottomH, w, h, frame);
    // Anzeige oben wie im Führerstand
    const dx1 = 220 * s, dx2 = w - 220 * s, dy1 = 12 * s, dy2 = topH - 20 * s;
    c.roundRect(dx1, dy1, dx2, dy2, 10 * s, { fill: "#0B0B0B", outline: "#45494F", width: 3 * s });
    const bw = drawBadge(c, dx1 + 16 * s, (dy1 + dy2) / 2, ride.line.name, ride.line.color, ride.kind, 46 * s, app.font(24, "bold"));
    const tx = dx1 + 16 * s + bw + 18 * s, tw = dx2 - tx - 14 * s;
    const big = app.font(26, "bold"), small = app.font(19, "bold");
    c.text(tx, dy1 + 24 * s, fitText(big, "Hier ist: " + name, tw), big, LED, "w");
    const [text, until] = ride.message;
    let second;
    if (this.closingAt !== null) second = "Türen schließen – Vorsicht!";
    else if (text && now() < until) second = text;
    else if (this.busy()) second = "Bitte ein- und aussteigen …";
    else second = `Fahrgäste: ${ride.riders.length} · Türen schließen: Ö`;
    c.text(tx, dy2 - 20 * s, fitText(small, second, tw), small, "#FFD27A", "w");
    const bw2 = 180 * s, bh2 = 50 * s, by = (topH - 8 * s - bh2) / 2;
    c.roundRect(20 * s, by, 20 * s + bw2, by + bh2, 25 * s, { fill: "#454A53" });
    c.text(20 * s + bw2 / 2, by + bh2 / 2, "◀  Zurück", app.font(18, "bold"), "white");
    app.hit(20 * s, by, 20 * s + bw2, by + bh2, () => ride.back());
    // Knöpfe unten
    const cy = h - bottomH / 2 - 8 * s, r = Math.min(38 * s, bottomH * 0.32), closing = this.closingAt !== null;
    [["Ö", "Türen zu", () => ride.toggleOpen(), "#2BA59B"], ["T", "Signal", () => ride.doors(), "#E8483B"],
      ["V", "Ansage", () => ride.announce(), "#3D8BD4"]].forEach(([sym, label, cb, color], k) => {
      roundButton(app, c, w / 2 + (k - 1) * 160 * s, cy, r, color, sym, label, !closing, cb, k === 0 && !this.busy() && !closing);
    });
  }
}

class App {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.painter = new Painter(this.ctx);
    addFlights(data);
    addCruises(data);
    this.data = data;
    this.s = 1;
    this.width = 1280;
    this.height = 800;
    this.hits = [];
    this.fonts = new Map();
    this.animating = false;
    this.transfers = new Transfers(data);
    this.maps = {};
    this.timeCache = new Map();
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
    // alle Gruppen, zu denen das Verkehrsmittel gehört (die Fähre gehört zu beiden)
    let kinds = this.separateModes() ? MODE_ORDER.filter(k => MODE_GROUPS.some(g => g.includes(kind) && g.includes(k))) : MODE_ORDER;
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

  /** "von>nach" -> Minuten für eine Linie, aus beiden Richtungen. */
  travelTimes(line) {
    if (!this.timeCache.has(line)) {
      const pairs = new Map();
      (line.times || []).forEach((row, d) => {
        const stops = line.directions[d];
        row.forEach((v, i) => { if (v !== null) pairs.set(stops[i] + ">" + stops[i + 1], v); });
      });
      this.timeCache.set(line, pairs);
    }
    return this.timeCache.get(line);
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
