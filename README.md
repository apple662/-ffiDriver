# Berlin fährt! 🚆

Ein einfaches Spiel für Kinder: Verkehrsmittel aussuchen, Linie wählen und
dann Station für Station mit den Pfeiltasten durch Berlin fahren.

Enthalten sind alle S-Bahn-, U-Bahn-, Straßenbahn- und Buslinien von BVG und
S-Bahn Berlin (15 S-Bahn-, 8 U-Bahn-, 22 Tram- und 204 Buslinien). Das
Programm läuft komplett **offline**.

## So wird gespielt

| Bildschirm | Bedienung |
|---|---|
| **1. Verkehrsmittel** – S-Bahn, U-Bahn, Straßenbahn oder Bus | Pfeiltasten + Enter, oder anklicken (Tasten 1–4 gehen auch) |
| **2. Linie** – Linienschild (z. B. U8, M77) mit Start- und Endhaltestelle | Pfeiltasten + Enter, oder anklicken. Liniennummer tippen (z. B. `100`) springt direkt dahin |
| **3. Fahren** – Stationsliste mit allen Umsteigemöglichkeiten und Netzplan | ↓/→ nächste Station, ↑/← zurück, `T` oder Knopf „Türen“: Türgeräusch, `V` oder Knopf „Ansage“: Station ansagen, `U`: umsteigen, `R` oder Knopf: andere Richtung |

`Esc` oder der Knopf „Zurück“ führt immer einen Schritt zurück. `F11`
schaltet auf Vollbild. Auf der Ringbahn (S41/S42) kann man endlos im Kreis
fahren.

## Netzplan

Beim Fahren zeigt oben rechts ein kleiner Netzplan, wo man gerade ist: Der
rote Punkt wandert mit. Die eigene Linie ist kräftig hervorgehoben, die
anderen Linien desselben Verkehrsmittels sind blass gezeichnet. Als
Orientierung ist die Ringbahn grau eingezeichnet. Beim Bus zoomt die Karte
auf die gefahrene Linie, weil das ganze Busnetz zu groß wäre.

Die Pläne sind **aus den Fahrplandaten gezeichnet**, mit den echten
Koordinaten der Haltestellen. Es sind nicht die offiziellen Netzpläne von
BVG und S-Bahn, denn die sind urheberrechtlich geschützt.

## Umsteigen

Neben jeder Station stehen die Linien, in die man dort umsteigen kann: S-Bahn,
U-Bahn, Tram und Bus. Mit `U` steigt man um und landet in der neuen Linie
an der passenden Haltestelle. Gibt es mehrere Möglichkeiten, erscheint eine
Auswahl mit den Linienschildern (Pfeiltasten + Enter, `Esc` = doch nicht).
Man kann auch auf die Linienschilder der aktuellen Station klicken.

Bus- und Tramhaltestellen haben oft eigene Namen, z. B. „S+U
Alexanderplatz/Gontardstr.“. Deshalb zählen alle Haltestellen im Umkreis von
200 m dazu, gleichnamige Bahnhöfe auch bis 400 m. Nach dem Umsteigen fährt
man in die Richtung, in der noch die meisten Stationen vor einem liegen.

## Türwarntöne

Mit `T` ertönt beim Fahren das Türsignal des jeweiligen Verkehrsmittels.
Beim Bus zischt stattdessen die Druckluft, wenn die Türen aufgehen. Auf dem Mac sagt eine deutsche Systemstimme bei S-
und U-Bahn vorher noch „Zurückbleiben, bitte!“.

Die Töne in `sounds/` sind **nachgebaut**, es sind keine Originalaufnahmen.
Die Aufnahmen von BVG und S-Bahn sind nicht frei verfügbar.
`tools/make_sounds.py` erzeugt sie neu. Eigene Aufnahmen kannst du einfach
als `sounds/sbahn.wav`, `sounds/ubahn.wav`, `sounds/tram.wav` oder
`sounds/bus.wav` ablegen.

## Stationsansage

Mit `V` sagt eine Computerstimme die aktuelle Station an, mit den
Umsteigemöglichkeiten, z. B. „Gesundbrunnen. Umsteigen zu S 1, S 2, …“. An der Endstation kommt noch „Bitte alle aussteigen.“

Dafür wird die Sprachausgabe des Betriebssystems genutzt:
- **macOS:** `say` mit der deutschen Stimme „Anna“. Fehlt sie, kann man sie
  unter Systemeinstellungen → Bedienungshilfen → Gesprochene Inhalte →
  Systemstimme nachladen.
- **Windows:** die eingebaute Sprachausgabe (eine deutsche Stimme wird
  bevorzugt).
- **Linux:** `espeak-ng`, `espeak` oder `spd-say`, falls installiert.

## Starten auf macOS

1. Python 3 installieren, am besten über den Installer von
   [python.org](https://www.python.org/downloads/macos/). Tkinter ist da
   schon dabei.
   (Bei Homebrew-Python zusätzlich `brew install python-tk` ausführen.)
2. Im Finder auf **`start.command`** doppelklicken. Oder im Terminal:

   ```sh
   python3 bahnfahren.py
   ```

Beim ersten Doppelklick fragt macOS eventuell nach einer Bestätigung
(Rechtsklick → „Öffnen“).

Unter Windows und Linux geht es genauso mit `python bahnfahren.py`.

### Optional: eine eigene Mac-App bauen

```sh
pip3 install pyinstaller
pyinstaller --windowed --name "Berlin fährt" --add-data "data:data" --add-data "sounds:sounds" bahnfahren.py
```

Danach liegt die App in `dist/`.

## Woher kommen die Daten?

BVG und S-Bahn Berlin haben keine eigene öffentliche Linien-API. Der
Verkehrsverbund Berlin-Brandenburg (VBB) veröffentlicht aber den kompletten
Fahrplan als offene Daten im GTFS-Format
([daten.berlin.de](https://daten.berlin.de/datensaetze/vbb-fahrplandaten-gtfs),
Lizenz CC BY 4.0).

`tools/build_data.py` erzeugt daraus **einmalig** die Datei
`data/berlin_lines.json`. Die ist bereits im Repository enthalten, du musst
also nichts tun. Neu bauen kannst du sie so:

```sh
# aus den aufbereiteten VBB-GTFS-Paketen vbb-lines / vbb-stations (Standard)
python3 tools/build_data.py

# oder direkt aus einem GTFS-ZIP des VBB
python3 tools/build_data.py --gtfs GTFS.zip
```

Für jede Linie wählt das Skript die typische Hin- und Rückfahrt aus. Kurze
Fahrten, Fahrten zum Betriebshof und Ersatzverkehr lässt es weg.

Der aktuelle Datenstand stammt aus dem VBB-Fahrplan vom März 2026. Was in
diesem Fahrplan nicht vorkommt, fehlt auch im Spiel (zurzeit z. B. die U4).
Nach einem Neubau der Daten kann sich das ändern.

Fahrplandaten: © VBB Verkehrsverbund Berlin-Brandenburg GmbH, CC BY 4.0.
