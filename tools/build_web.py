#!/usr/bin/env python3
"""Bereitet die Browser-Version in ``web/`` vor.

- ``web/data.js``    Fahrplandaten aus ``data/berlin_lines.json``
- ``web/sounds.js``  Türsignale aus ``sounds/*.wav`` (eingebettet)
- ``web/berlin-faehrt.html``  alles in einer einzigen Datei, zum Weitergeben
  (z. B. per Mail oder USB-Stick; öffnet sich per Doppelklick im Browser)

Daten und Töne liegen als Skript bei statt als JSON/WAV-Datei, weil Browser
beim Öffnen per Doppelklick (file://) keine Dateien nachladen dürfen.

    python3 tools/build_web.py
"""

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"


def js_value(obj):
    # "</" maskieren, damit eingebettete Daten ein <script> nicht vorzeitig beenden
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def main():
    data = json.loads((ROOT / "data" / "berlin_lines.json").read_text(encoding="utf-8"))
    data_js = "window.BERLIN_DATA = " + js_value(data) + ";\n"
    (WEB / "data.js").write_text(data_js, encoding="utf-8")

    sounds = {}
    for wav in sorted((ROOT / "sounds").glob("*.wav")):
        sounds[wav.stem] = "data:audio/wav;base64," + base64.b64encode(wav.read_bytes()).decode("ascii")
    sounds_js = "window.BERLIN_SOUNDS = " + js_value(sounds) + ";\n"
    (WEB / "sounds.js").write_text(sounds_js, encoding="utf-8")

    # Einzeldatei: die <script src="…">-Zeilen durch den Inhalt ersetzen
    html = (WEB / "index.html").read_text(encoding="utf-8")
    inline = {"data.js": data_js, "sounds.js": sounds_js, "app.js": (WEB / "app.js").read_text(encoding="utf-8")}
    html = re.sub(r'<script src="([^"]+)"></script>',
                  lambda m: "<script>\n" + inline[m.group(1)].replace("</script", "<\\/script") + "</script>", html)
    (WEB / "berlin-faehrt.html").write_text(html, encoding="utf-8")

    for name in ("data.js", "sounds.js", "berlin-faehrt.html"):
        print(f"geschrieben: web/{name} ({(WEB / name).stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
