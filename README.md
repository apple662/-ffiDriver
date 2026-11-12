# Berlin fährt! 🚆

Ein einfaches Spiel für Kinder: Verkehrsmittel aussuchen, Linie wählen und
dann Station für Station mit den Pfeiltasten durch Berlin fahren.

Enthalten sind alle S-Bahn-, U-Bahn-, Straßenbahn- und Buslinien von BVG und
S-Bahn Berlin sowie alle Regional- und ICE-Züge, die durch Berlin fahren
(16 S-Bahn-, 9 U-Bahn-, 22 Tram-, 204 Bus-, 22 Regional- und 8 ICE-Linien). Das
Programm läuft komplett **offline**.

## Browser-Version (ohne Installation)

Im Ordner `web/` liegt dasselbe Spiel für den Browser, mit allen Funktionen.
Es braucht kein Python und keinen Server:

- **`web/berlin-faehrt.html`**: alles in einer einzigen Datei (gut 1,2 MB).
  Per Doppelklick öffnen, fertig. Diese Datei kann man auch einfach per Mail
  oder USB-Stick weitergeben.
- **`web/index.html`**: dieselbe Version, aufgeteilt in mehrere Dateien
  (`app.js`, `data.js`, `sounds.js`), falls du am Code etwas ändern
  möchtest.

Getestet mit Chromium; Safari, Firefox und Edge sollten genauso gehen.

Am Tablet oder Handy geht alles per Finger: **Antippen** wählt aus, **Wischen**
scrollt durch die Linien (mit Schwung) und durch die Umsteige-Auswahl. Beim
Fahren fährt man mit Wischen nach oben Station für Station weiter, mit Wischen
nach unten zurück. Ausgewählt wird erst beim Loslassen und nur, wenn der Finger
nicht gewischt hat.

Unterschiede zur Python-Version:
- Die Ansage nutzt die Sprachausgabe des Browsers. Ist keine deutsche
  Stimme installiert, liest der Browser mit einer anderen Stimme vor.
- Startbahnhof und Ankreuzfeld speichert der Browser (localStorage). Sie
  gelten also nur für diesen Browser und gehen verloren, wenn man dort die
  Websitedaten löscht.
- Vollbild gibt es mit der Vollbild-Taste des Browsers (meist `F11`, am Mac
  `Ctrl` + `Cmd` + `F`).

Nach einem Neubau der Daten oder Töne wird die Browser-Version so
aktualisiert:

```sh
python3 tools/build_web.py
```

## So wird gespielt

| Bildschirm | Bedienung |
|---|---|
| **1. Verkehrsmittel** – S-Bahn, U-Bahn, Straßenbahn, Bus, Regionalbahn oder ICE, darunter „Starte in …“ | Pfeiltasten + Enter, oder anklicken (Tasten 1–6 gehen auch) |
| **2. Linie** – Linienschild (z. B. U8, M77) mit Start- und Endhaltestelle | Pfeiltasten + Enter, oder anklicken. Liniennummer tippen (z. B. `100`) springt direkt dahin |
| **3. Fahren** – Stationsliste mit allen Umsteigemöglichkeiten und Netzplan | ↓/→ nächste Station, ↑/← zurück, `T` oder Knopf „Türen“: Türgeräusch, `V` oder Knopf „Ansage“: Station ansagen, `U`: umsteigen, `R` oder Knopf: andere Richtung, `F`: Cockpit-Ansicht |

`Esc` oder der Knopf „Zurück“ führt immer einen Schritt zurück. `F11`
schaltet auf Vollbild. Auf der Ringbahn (S41/S42) kann man endlos im Kreis
fahren.

## Cockpit-Ansicht

Beim Fahren schaltet `F` in den Führerstand (oder per Knopf „F Normale
Ansicht“ zurück). Man blickt nach vorn auf die Strecke, in einfachem 3D:

- **S-Bahn, Regionalbahn, ICE:** Schotter, Schwellen und Schienen, ein
  Nachbargleis, Bäume und Hügel. Regio und ICE haben eine Oberleitung, die
  Berliner S-Bahn eine Stromschiene.
- **U-Bahn:** im Tunnel mit vorbeiziehenden Lampen, an den Stationen helle,
  gekachelte Bahnhofshallen.
- **Straßenbahn:** auf der Straße zwischen Häusern, mit eingelassenen
  Schienen und Oberleitung.
- **Bus:** Straße mit Mittellinie, Gehweg, Bäumen und Häusern.

An jeder Station steht ein Bahnsteig (bzw. eine Haltestelle mit gelbem
„H“-Schild) mit dem Namensschild, das beim Heranfahren größer wird. Das
Fahrzeug fährt sanft an, rollt und bremst vor der Station; eine Station
dauert gut 1,5 Sekunden.

Alles andere ist ins Cockpit eingebaut:
- oben die **Zielanzeige** in Leuchtschrift mit Linie, Ziel, nächstem Halt
  und den Durchsagen,
- unten auf dem Armaturenbrett ein **Bildschirm mit dem Netzplan**, der
  **Tacho** (bis zur Höchstgeschwindigkeit des Verkehrsmittels, beim ICE
  300 km/h), die **Stationsanzeige** mit Umsteigelinien (antippen springt zur
  Station) und **echte runde Knöpfe** für Zurück, Weiter, Umsteigen (leuchtet,
  wenn man umsteigen kann), Türen, Ansage und Richtung.

Alle Tasten funktionieren genauso wie in der normalen Ansicht. Die gewählte
Ansicht bleibt beim Umsteigen erhalten.

## Regionalbahn

Alle Regionalzüge (RE, RB, FEX), deren Strecke durch Berlin führt, z. B. der
RE1 von Frankfurt (Oder) über Alexanderplatz und Hauptbahnhof bis Magdeburg.
Sie haben alle Funktionen der anderen Verkehrsmittel: Netzplan (auf die
Strecke gezoomt), Umsteigen, Türsignal und Ansage. Die Linienschilder sind
rot auf weiß wie an den Bahnhöfen, der Zug ist ein roter Doppelstockwagen.

## ICE

Die ICE-Linien, die durch Berlin fahren: ICE 10 (nach Köln), 11 (nach
München über Frankfurt und Stuttgart), 12 (nach Basel), 13 (nach Frankfurt
Flughafen), 15 (nach Frankfurt), 18, 28 und 29 (Hamburg bzw. Berlin nach
München über Nürnberg). Der ICE ist weiß mit rotem Streifen und spitzer Nase,
die Linienschilder sind rot. Beim Türsignal gibt es zuerst den Dreiklang-Gong
vom Bahnsteig. Der Netzplan zeigt ganz Deutschland.

**Wichtig:** Die VBB-Fahrplandaten enthalten keine Fernzüge, und die offenen
Fernverkehrsdaten (gtfs.de, DELFI) waren beim Erstellen nicht erreichbar. Die
Linien sind deshalb **von Hand nach dem DB-Liniennetz zusammengestellt**, in
`data/ice_lines.json`. Gezeigt wird je Linie der typische Laufweg mit den
wichtigsten Halten; einzelne Züge fahren anders (Flügelzüge, Sprinter,
Umleitungen). Die Koordinaten der Bahnhöfe stammen aus dem
DB-Stationsverzeichnis. Die Datei kannst du selbst korrigieren oder ergänzen
und danach `python3 tools/build_data.py` ausführen.

**Ankreuzfeld „Zeige ICE-Umstiege“** (unten links im Hauptmenü,
standardmäßig angehakt): Ohne Haken werden ICE-Linien nie als Umstieg
gezeigt, angeboten oder angesagt. Mit Haken gehört der ICE beim „Umsteigen
getrennt“ zur Gruppe von S-Bahn, U-Bahn und Regionalbahn.

## Startbahnhof

Unter den vier Verkehrsmitteln steht im Hauptmenü der grüne Knopf **„Starte
in S Lichterfelde Ost“**. Damit fährt man direkt an diesem Bahnhof los: Es
erscheint dieselbe Auswahl wie beim Umsteigen, also alle Linien, die dort
abfahren.

**Elterntaste `F10`** (auf Mac-Tastaturen meist `fn` + `F10`):
- **Beim Fahren:** Die aktuelle Haltestelle wird nach Rückfrage zum neuen
  Startbahnhof.
- **Im Hauptmenü**, wenn der Start-Knopf ausgewählt ist: Der Startbahnhof
  wird nach Rückfrage wieder auf Lichterfelde Ost gesetzt.

In der Rückfrage ist „Abbrechen“ vorausgewählt. Speichern geht nur mit
Pfeiltaste und Enter oder per Klick auf „Ja, speichern“, ein Kind kann also
nicht aus Versehen mit Enter bestätigen.

Gespeichert wird pro Benutzer, die Einstellung bleibt also auch bei einer
neuen Programmversion erhalten:
- macOS: `~/Library/Application Support/Berlin faehrt/settings.json`
- Windows: `%APPDATA%\Berlin faehrt\settings.json`
- Linux: `~/.config/Berlin faehrt/settings.json`

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

**Ankreuzfeld „Umsteigen getrennt“** (unten links im Hauptmenü,
standardmäßig angehakt): Beim Fahren mit S-Bahn, U-Bahn, Regionalbahn oder
ICE werden nur Umstiege in diese vier gezeigt, angeboten und angesagt. Beim Tram- oder
Busfahren gilt das Gleiche für Tram und Bus. Das macht die Liste deutlich
übersichtlicher. Ohne Haken sieht man wieder alle Umstiege. Die Einstellung
wird gespeichert. Der Start-Knopf im Hauptmenü zeigt immer alle Linien am
Startbahnhof, weil man dort ja erst das Verkehrsmittel wählt.

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
als `sounds/sbahn.wav`, `sounds/ubahn.wav`, `sounds/tram.wav`,
`sounds/bus.wav`, `sounds/regio.wav` oder `sounds/ice.wav` ablegen.

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

Der aktuelle Datenstand stammt aus dem VBB-Fahrplan vom März 2026. Die
**U4** fehlt darin seit Februar 2026, vermutlich wegen einer Sperrung. Damit
sie trotzdem im Spiel ist, übernimmt das Skript Linien aus der Liste
`KEEP_LINES` (in `tools/build_data.py`) aus der letzten älteren Version, in
der sie noch vorkommen. Für die U4 ist das der Fahrplan vom Januar 2026.
Weitere Linien lassen sich dort einfach eintragen.

**Neue Linien**, die im VBB-Datensatz noch fehlen, stehen in
`data/extra_lines.json`. Zurzeit ist das die **S15** (seit 15. Juni 2026,
Gesundbrunnen – Wedding – Hauptbahnhof). Ihre Farbe ist vorläufig
S-Bahn-Grün, weil die offizielle Linienfarbe nicht zu ermitteln war. Sobald
der VBB-Datensatz die Linie selbst enthält, nimmt das Skript automatisch die
echten Daten.

Fehlt ein Bahnhofsname im neuesten Haltestellenverzeichnis, nimmt das Skript
ihn aus der Verzeichnisversion, die zum Fahrplanstand passt.

Fahrplandaten: © VBB Verkehrsverbund Berlin-Brandenburg GmbH, CC BY 4.0.
