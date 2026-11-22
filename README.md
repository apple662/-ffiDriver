# Berlin fährt! 🚆

Ein einfaches Spiel für Kinder: Verkehrsmittel aussuchen, Linie wählen und
dann Station für Station mit den Pfeiltasten durch Berlin fahren.

Enthalten sind alle S-Bahn-, U-Bahn-, Straßenbahn- und Buslinien von BVG und
S-Bahn Berlin, alle BVG-Fähren sowie alle Regional- und ICE-Züge, die durch
Berlin fahren (16 S-Bahn-, 9 U-Bahn-, 22 Tram-, 204 Bus-, 22 Regional-,
8 ICE- und 6 Fährlinien). Als eigene Kategorie kommen 780 Buslinien in ganz
Brandenburg dazu.
Dazu kommen 33 Flüge vom Flughafen BER in die ganze Welt und 7 Kreuzfahrten
ab Hamburg, Kiel und Warnemünde. Das Programm läuft komplett **offline**.

## Browser-Version (ohne Installation)

Im Ordner `web/` liegt dasselbe Spiel für den Browser, mit allen Funktionen.
Es braucht kein Python und keinen Server:

- **`web/berlin-faehrt.html`**: alles in einer einzigen Datei (gut 3,5 MB).
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
| **1. Verkehrsmittel** – S-Bahn, U-Bahn, Straßenbahn, Bus, Bus Brandenburg, Regionalbahn, ICE, Fähre, Flugzeug oder Kreuzfahrt, darunter „Starte in …“ | Pfeiltasten + Enter, oder anklicken (Tasten 1–9 und 0 gehen auch) |
| **2. Linie** – Linienschild (z. B. U8, M77) mit Start- und Endhaltestelle | Pfeiltasten + Enter, oder anklicken. Liniennummer tippen (z. B. `100`) springt direkt dahin |
| **3. Fahren** – Stationsliste mit allen Umsteigemöglichkeiten und Netzplan | ↓/→ nächste Station, ↑/← zurück, `T` oder Knopf „Türen“: Türgeräusch, `V` oder Knopf „Ansage“: Station ansagen, `U`: umsteigen, `R` oder Knopf: andere Richtung, `F`: Cockpit-Ansicht, `Ö`: Türen auf und zu (Blick in den Innenraum), an der Endhaltestelle `B`: Betriebshof (Bus, Tram) bzw. Bootshaus (Fähre) oder `A`: Abstellgleis (Bahnen), dort `W`: Waschanlage, `E`: Linie endet hier |

**Fahrzeiten:** In der Stationsliste steht zwischen zwei Stationen klein
neben der Strecke, wie viele Minuten die Fahrt laut Fahrplan dauert. Bei
„< 1 Min.“ sind es weniger als eine Minute. Die Fahrzeit zur nächsten
Station steht auch auf der Infotafel bei „Nächster Halt“ und im Cockpit in
der Anzeige oben. Die Zahlen sind die offiziellen Fahrzeiten aus dem
VBB-Fahrplan (siehe [Woher kommen die Daten?](#woher-kommen-die-daten)).

`Esc` oder der Knopf „Zurück“ führt immer einen Schritt zurück. `F11`
schaltet auf Vollbild. Auf der Ringbahn (S41/S42) kann man endlos im Kreis
fahren.

## Türen auf (Taste `Ö`)

Steht das Fahrzeug an einer Station, öffnet `Ö` die Türen (oder der
türkisfarbene Knopf „Ö“, im Cockpit „Türen auf“). Die Sicht dreht sich dann
zur Seite in den **Innenraum**: Sitze, Haltestangen, Griffe an der Decke und
die Türen, die zur Seite gleiten. Draußen sieht man den Bahnsteig mit dem
Stationsschild, im U-Bahnhof die gekachelte Wand, bei Bus und Tram die
Straße mit dem „H“-Schild, bei der Fähre den Anleger aus Holzbohlen, das
Wasser und das andere Ufer.

Dann **steigen Menschen ein und aus**: Einige Fahrgäste stehen auf und
gehen hinaus, neue kommen vom Bahnsteig herein und setzen sich auf einen
freien Platz oder halten sich an der Stange fest. Die Fahrgäste fahren mit:
An der nächsten Station sitzen noch dieselben Leute im Wagen. An belebten
Umsteigebahnhöfen steigen mehr Leute ein, an der Endstation steigen alle
aus. Oben steht, wie viele Fahrgäste gerade an Bord sind.

Ein zweites `Ö` schließt die Türen, mit dem Türsignal des Verkehrsmittels.
Bei der Fähre tutet stattdessen das Schiffshorn. Danach dreht sich die Sicht
zurück und es kann weitergehen. Solange die
Türen offen sind, fährt das Fahrzeug nicht los, und solange noch jemand ein-
oder aussteigt, bleiben sie offen. Auf Tastaturen ohne Ö geht auch `O`.

**Im Flugzeug** gibt es keinen Innenraum. Dort öffnet `Ö` am Boden die Tür
neben der Treppe, die Kamera fährt näher heran, und die Fluggäste steigen
über die Treppe vom Rollfeld ein (am Start) bzw. aus (nach der Landung).
Abfliegen geht erst wieder, wenn die Tür zu ist.

## Betriebshof und Abstellgleis

An einer Endhaltestelle (am Anfang oder Ende der Linie) fahren **Bus und
Straßenbahn mit `B` auf den Betriebshof**, **die Fähre mit `B` ins
Bootshaus**, **S-Bahn, U-Bahn, Regionalbahn und ICE mit `A` aufs
Abstellgleis**. Dafür gibt es auch einen lila Knopf. In der Stationsliste
erscheint hinter der Endstation eine eigene Zeile, im Cockpit sieht man:
- beim Abstellgleis den rot-weißen Prellbock und daneben abgestellte Züge
  (bei der U-Bahn das Tunnelende),
- beim Betriebshof eine Halle mit offenen Toren und wartenden Fahrzeugen,
- beim Bootshaus eine Holzhalle über dem Wasser mit offenem Tor.

Dort ist Pause: Weiterfahren, Umsteigen und Richtung wechseln gehen nicht.
Ein erneuter Druck auf `B` bzw. `A` führt zurück auf die Strecke, und zwar
gewendet, wie im echten Betrieb: Man fährt wieder an derselben
Endhaltestelle ein, jetzt in Gegenrichtung. Drückt man die falsche Taste,
mitten auf der Strecke oder auf der Ringbahn, gibt es einen Hinweis.

### Waschanlage (Taste `W`)

Steht das Fahrzeug auf dem Betriebshof, im Bootshaus oder auf dem Abstellgleis, fährt es mit `W`
(oder dem blauen Knopf „Waschanlage“ im Cockpit bzw. der unteren Hälfte der
Leuchtanzeige) einmal durch die Waschanlage. Im Cockpit sieht man das Tor
mit dem Schild „Waschanlage“, dann Wasserbogen, drehende Bürsten, Schaum und
Tropfen auf der Scheibe, Abspülen und zum Schluss Trocknen mit dem
Scheibenwischer. Die Anzeige oben sagt den jeweiligen Schritt an. In der
normalen Ansicht steigen Seifenblasen auf. Nach etwa 10 Sekunden heißt es
„Blitzblank!“, und das Fahrzeug steht wieder auf dem Betriebshof bzw.
Abstellgleis. Während der Wäsche kann man nicht losfahren. Mitten auf der
Strecke gibt `W` nur einen Hinweis.

### Eigene Endstation (Taste `E`)

Mit `E` endet die Linie an der Station, an der man gerade steht. Die Anzeige
zeigt dann „nach …“ mit dieser Station, und man kann wie an einer echten
Endhaltestelle mit `A`/`B` aufs Abstellgleis bzw. auf den Betriebshof fahren
und gewendet zurückkommen. Ein zweites `E` lässt die Linie wieder bis zur
echten Endstation fahren, in der Richtung, in der man gerade unterwegs ist.
Das gilt nur für die aktuelle Fahrt und wird nicht gespeichert. Wählt man
die Linie neu aus, fährt sie wieder ganz.

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
- **Bus Brandenburg:** Landstraße mit Leitpfosten, dazu Alleen,
  Rapsfelder, Wiesen und Äcker, Kiefernwald und Windräder am Horizont (siehe
  [Bus Brandenburg](#bus-brandenburg)).
- **Fähre:** über den Bug aufs Wasser, mit Wellen, Ufern voller Bäume und
  Schilf, roten und grünen Fahrwassertonnen und an jeder Station einem
  Anleger mit Wartehäuschen und „H“-Schild.

**Tunnel, ebenerdig oder auf dem Viadukt:** Bei den Bahnen liegt jeder
Bahnhof auf der richtigen Ebene, dazwischen gibt es Tunnelportale und Rampen.
Beispiele:
- Die U1/U3 fährt von Warschauer Straße bis Gleisdreieck oben auf dem
  Kreuzberger Viadukt und taucht dann in den Tunnel ab.
- Die U5 fährt bis Biesdorf-Süd draußen, ab Tierpark im Tunnel.
- Die U3 fährt durch Dahlem im offenen Einschnitt, die U2 am Olympia-Stadion
  draußen und an der Schönhauser Allee oben.
- Die S-Bahn fährt auf der Stadtbahn (Charlottenburg bis Ostbahnhof) auf dem
  Viadukt, über der Stadt.
- Die Nord-Süd-S-Bahn (Nordbahnhof bis Anhalter Bahnhof) und der Flughafen BER
  liegen unter der Erde.
- Am Hauptbahnhof halten Stadtbahn-Linien oben, Nord-Süd-Linien (z. B. ICE 11,
  S15) unten; an der Friedrichstraße genauso.

Offene Daten zur Höhenlage gibt es nicht. Die Zuordnung steht als Tabelle im
Programm (`U_ELEVATED`, `U_GROUND`, `RAIL_TUNNEL`, `STADTBAHN` in
`bahnfahren.py` und `web/app.js`). Alle übrigen Bahnhöfe gelten als
ebenerdig, bei der U-Bahn als unterirdisch.

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

## Bus Brandenburg

Eine eigene Kategorie, getrennt von den Berliner Bussen: alle Buslinien in
Brandenburg (780 Linien). Weil das so viele sind, wählt man zuerst den
**Landkreis bzw. die kreisfreie Stadt**, erkennbar am Autokennzeichen
(z. B. BAR Barnim, MOL Märkisch-Oderland, P Potsdam, CB Cottbus, UM
Uckermark), und dann die Linie. Tippen geht auch: `U`, `M` springt zur
Uckermark. Die Linienschilder haben die Farbe ihres Landkreises, der Bus ist
weiß-rot wie die Landesfarben.

Die Linie gehört zu dem Landkreis, in dem sie die meisten Halte hat. Fährt
eine Linie über die Grenze, z. B. von Potsdam-Mittelmark nach Berlin, steht
sie trotzdem nur einmal in der Liste.

Alles andere geht wie beim Berliner Bus: Netzplan, Fahrzeiten, Umsteigen,
Türen, Ansage, Betriebshof mit Waschanlage, eigene Endstation. Im Cockpit
geht es über die **Landstraße**: Mal fährt der Bus durch eine Allee, mal
zwischen Raps- und Getreidefeldern, mal durch Kiefernwald, und am Horizont
drehen sich Windräder. An den Haltestellen steht ein Dorf mit Wartehäuschen,
manchmal auch eine Feldsteinkirche. Liegen die Haltestellen dicht beieinander
(weniger als 3 Minuten Fahrzeit), fährt der Bus durch eine längere
Häuserzeile wie in einer Kleinstadt. Der Tacho geht bis 80 km/h.

Umsteigen geht an jedem Bahnhof in Brandenburg, z. B. vom RE1 in Frankfurt
(Oder) in die Stadtbusse. Beim „Umsteigen getrennt“ gehört der Bus in
Brandenburg deshalb zu beiden Gruppen, wie die Fähre.

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

## Fähre

Die sechs Fährlinien der BVG, alle mit allen Funktionen der anderen
Verkehrsmittel (Netzplan, Fahrzeiten, Umsteigen, Cockpit, Türen auf,
Ansage, Bootshaus mit Waschanlage, eigene Endstation):

| Linie | Strecke | Fahrzeit |
|---|---|---|
| F10 | Alt-Kladow – S Wannsee, quer über den Wannsee | 20 Min. |
| F11 | Baumschulenstraße – Wilhelmstrand, über die Spree | 2 Min. |
| F12 | Wassersportallee – Müggelbergallee, über die Dahme in Grünau | 2 Min. |
| F21 | Zum Seeblick – Krampenburg, über den Seddinsee | 7 Min. |
| F23 | Kruggasse – Neu Helgoland – Müggelhort – Müggelwerderweg, auf der Müggelspree | 25 Min. |
| F24 | Kruggasse – Spreewiesen (Ruderfähre in Rahnsdorf, nur im Sommer) | 5 Min. |

Die Fähre ist gelb mit weißem Aufbau und blauem Streifen, die Linienschilder
sind blau. Statt „Zurückbleiben, bitte!“ heißt es „Leinen los!“, und mit `T`
läutet die Schiffsglocke, dann tutet das Schiffshorn. Der Tacho geht bis
25 km/h. Der Netzplan zoomt auf die Linie und zeigt zur Orientierung das
S-Bahn-Netz, denn die Fähren liegen weit auseinander am Stadtrand.

Mit der S-Bahn kommt man gut zur Fähre: An **S Wannsee** kann man mit `U`
in die F10 nach Kladow umsteigen. Deshalb gehört die Fähre beim „Umsteigen
getrennt“ zu beiden Gruppen (siehe [Umsteigen](#umsteigen)).

## Flugzeug

Vom Flughafen BER geht es zu 33 bekannten Zielen auf allen Kontinenten:

| Ziel | Wahrzeichen |
|---|---|
| Palma de Mallorca (PMI) | Kathedrale La Seu am Meer, Palmen |
| Kreta (HER) | Palast von Knossos mit roten Säulen und Stierfresko, Windmühle, Olivenbäume |
| Barcelona (BCN) | Sagrada Família, Strand |
| Teneriffa (TFS) | Vulkan Teide, Drachenbaum, schwarzer Lavastrand |
| Lissabon (LIS) | Torre de Belém im Wasser, gelbe Straßenbahn, bunte Häuser am Hang |
| Paris (CDG) | Eiffelturm |
| Amsterdam (AMS) | Grachtenhäuser, Windmühle, Tulpenfeld |
| London (LHR) | Big Ben, Parlament, London Eye, roter Doppeldeckerbus |
| Edinburgh (EDI) | Burg auf dem Vulkanfelsen, schottische Fahne, Altstadthäuser |
| Kopenhagen (CPH) | Bunte Häuser in Nyhavn, Segelboote, kleine Meerjungfrau |
| Stockholm (ARN) | Rathaus mit den drei goldenen Kronen, Häuser der Altstadt, Ausflugsdampfer |
| Zürich (ZRH) | Grossmünster und Fraumünster, Zürichsee mit Schwänen, Alpen |
| Wien (VIE) | Stephansdom mit buntem Ziegeldach, Riesenrad im Prater |
| Budapest (BUD) | Parlament mit roter Kuppel an der Donau, Burgberg |
| Venedig (VCE) | Campanile, Dogenpalast, Gondel mit Gondoliere |
| Rom (FCO) | Kolosseum, Zypressen und Pinien |
| Athen (ATH) | Akropolis mit dem Parthenon |
| Istanbul (IST) | Moschee mit Kuppeln und Minaretten am Bosporus |
| Reykjavík (KEF) | Hallgrímskirkja, rauchender Vulkan, bunte Häuser |
| Rovaniemi (RVN) | Haus des Weihnachtsmanns, Rentierschlitten, Polarlichter bei Nacht |
| Kairo (CAI) | Pyramiden von Gizeh, Sphinx, Kamel |
| Nairobi (NBO) | Savanne mit Giraffen, Elefant, Zebras, Akazien |
| Kapstadt (CPT) | Tafelberg, Leuchtturm, Pinguine |
| Dubai (DXB) | Burj Khalifa, Burj al Arab, Wüste |
| Delhi (DEL) | Taj Mahal, Elefant |
| Bangkok (BKK) | Tempel Wat Arun, Tuk-Tuk |
| New York (JFK) | Freiheitsstatue, Skyline mit Empire State Building |
| San Francisco (SFO) | Golden Gate Bridge im Nebel |
| Cancún (CUN) | Maya-Pyramide, Dschungel, türkises Meer |
| Tokio (HND) | Fuji, Pagode, Kirschblüten |
| Peking (PEK) | Chinesische Mauer |
| Sydney (SYD) | Opernhaus, Harbour Bridge |
| Rio de Janeiro (GIG) | Zuckerhut mit Seilbahn, Christusstatue |

So läuft ein Flug:

1. **Boarding** am BER: Das Flugzeug steht mit Treppe an der Startbahn, im
   Hintergrund Fernsehturm und Brandenburger Tor.
2. **Start** mit `▼`, Leertaste oder dem Knopf „Abflug!“: Die Triebwerke
   heulen auf, das Flugzeug rollt an, hebt die Nase und steigt durch die
   Wolkendecke.
3. **Reiseflug** über den Wolken, mit Höhe und Tempo oben links und
   Kondensstreifen. Auf langen Flügen (ab 8 Stunden) wird es unterwegs Nacht
   mit Mond und Sternen. `▼` fliegt schneller.
4. **Landung**: Das Flugzeug sinkt, das Wahrzeichen des Ziels kommt in Sicht,
   das Fahrwerk fährt aus, dann setzt es auf und bremst.
5. **Angekommen**: Gruß in der Landessprache (z. B. „¡Hola!“, „Grüezi!“, „Konnichiwa!“)
   und etwas Wissenswertes zum Ort, auch zum Vorlesen.

Rechts zeigt eine **Weltkarte** die Route auf dem kürzesten Weg über die
Erdkugel, deshalb fliegt man nach New York im Bogen über den Norden. Das
kleine Flugzeug wandert mit. Dazu stehen Land, Entfernung und die ungefähre
echte Flugzeit da. Die Flüge im Spiel dauern nur 25 bis 40 Sekunden.

| Taste | Knopf | |
|---|---|---|
| `▼` / Leertaste | ▼ bzw. ▶▶ | abfliegen, im Reiseflug schneller fliegen |
| `T` | Ding | „Ding-Dong“ wie in der Kabine, „Bitte anschnallen!“ |
| `V` | Ansage | Ansage des Kapitäns, z. B. „Noch etwa 2 Stunden bis Tokio“ |
| `R` | R / großer Knopf | nach der Landung zurückfliegen (bzw. noch einmal hin) |
| `U` | U | am BER am Boden: in S-Bahn, Regionalbahn oder Bus umsteigen |
| `Ö` | Ö | am Boden: Tür auf, Fluggäste steigen über die Treppe ein bzw. aus |
| `H` | H | am Boden: in den Hangar rollen und wieder hinaus |
| `W` | W | im Hangar: durch die Flugzeug-Waschanlage |

### Hangar und Flugzeug-Waschanlage

Am Boden (vor dem Abflug oder nach der Landung) rollt das Flugzeug mit `H`
in einen großen **Hangar**: Die Halle schiebt sich ins Bild, das Flugzeug
rollt durch das offene Tor, und drinnen sieht man die hohe Halle mit
Dachbindern, Lampen, Fensterband und dem Schild „HANGAR BER“ (bzw. dem Code
des Zielflughafens). Ein zweites `H` rollt wieder hinaus.

Nach jedem Flug ist das Flugzeug schmutzig. Mit `W` startet im Hangar die
**Flugzeug-Waschanlage**. Die gibt es in Wirklichkeit nicht, sie ist für das
Spiel erfunden: Ein gelber Waschroboter mit freundlichem Gesicht fährt an
einer Schiene unter dem Dach entlang und hat oben und unten je eine runde,
sich drehende Bürste.

1. **Einschäumen:** Der Roboter fährt vom Heck zur Nase und sprüht Schaum.
2. **Bürsten:** Zurück zum Heck, die Bürsten drehen sich schnell, der Schmutz
   verschwindet.
3. **Abspülen:** Aus einem Rohr an der Decke regnet es, der Schaum wird weniger.
4. **Trocknen:** Zwei riesige Ventilatoren blasen Wind über das Flugzeug.
5. **Blitzblank!** Das Flugzeug glitzert.

Während der Wäsche kann man nicht hinausrollen. Im Hangar steigt niemand ein
oder aus, und abfliegen geht erst wieder draußen.

Die Flüge sind auch mit den anderen Verkehrsmitteln verbunden: Wer mit der
S-Bahn (S9, S85), dem FEX oder einem Regionalzug zum **Flughafen BER**
fährt, kann dort mit `U` in ein Flugzeug umsteigen. Nach dem Rückflug geht es
am BER mit `U` wieder in Bahn oder Bus. Die Flugzeiten sind ungefähre Werte;
nach Tokio, Peking, Kapstadt, Sydney und Rio gibt es vom BER in Wirklichkeit
keine Direktflüge, dort steigt man unterwegs um. Das gilt auch für Rovaniemi,
Nairobi, Delhi, Bangkok, San Francisco und Cancún. In Rovaniemi landet man
immer nachts, damit man die Polarlichter sieht.

## Kreuzfahrt

Große Kreuzfahrtschiffe fahren nicht durch Berlin, aber viele legen in
Deutschland ab. Im Spiel gibt es sieben Reisen ab **Hamburg**, **Kiel** und
**Warnemünde**:

| Schild | Reise | Häfen |
|---|---|---|
| Fjorde | Norwegens Fjorde | Hamburg – Stavanger – Geiranger – Bergen – Hamburg |
| Ostsee | Ostsee-Metropolen | Kiel – Kopenhagen – Stockholm – Helsinki – Tallinn – Kiel |
| Oslo | Oslo und Kopenhagen | Warnemünde – Oslo – Kopenhagen – Warnemünde |
| Städte | Metropolen Westeuropas | Hamburg – Amsterdam – London (Southampton) – Paris (Le Havre) – Hamburg |
| Atlantik | Über den Atlantik nach New York | Hamburg – London (Southampton) – New York |
| Süden | Von Hamburg ins Mittelmeer | Hamburg – Lissabon – Palma de Mallorca |
| Island | Island und zurück | Hamburg – Reykjavík – Hamburg |

Man fährt Hafen für Hafen, ähnlich wie beim Fliegen:

1. **Im Hafen** liegt das Schiff am Kai, dahinter das Wahrzeichen der Stadt,
   z. B. Elbphilharmonie, Containerbrücken und Michel in Hamburg, der
   Preikestolen bei Stavanger, die Sieben-Schwestern-Wasserfälle in
   Geiranger, Bryggen in Bergen, der Dom von Helsinki, die Stadtmauer von
   Tallinn, die Oper in Oslo, der Leuchtturm mit Strandkörben in Warnemünde
   oder das Marine-Ehrenmal in Kiel. Die übrigen Häfen haben dieselben
   Wahrzeichen wie die Flugziele.
2. **Ablegen** mit `▼`, Leertaste oder dem großen Knopf „Leinen los“: Das
   Schiffshorn tutet, das Schiff fährt an, der Hafen gleitet aus dem Bild.
3. **Auf hoher See** ziehen Wellen, Inseln und andere Schiffe vorbei,
   manchmal springen Delfine. Auf langen Strecken (ab 20 Stunden) wird es
   Nacht, dann leuchten die Fenster des Schiffs. `▼` fährt schneller.
4. **Einlaufen**: Der nächste Hafen kommt in Sicht, das Schiff legt an. Es
   gibt einen Gruß in der Landessprache und etwas Wissenswertes zum Vorlesen.

Rechts zeigt eine Karte die ganze Route mit allen Häfen; das kleine Schiff
fährt mit. Die Seewege sind von Hand eingezeichnet, damit das Schiff nicht
über Land fährt. Die Fahrzeit auf See ergibt sich aus der Länge der Route bei
etwa 17 Knoten (31 km/h); im Spiel dauert eine Strecke nur 15 bis 30 Sekunden.

| Taste | Knopf | |
|---|---|---|
| `▼` / Leertaste | ▼ bzw. ▶▶ | ablegen, auf See schneller fahren |
| `T` | T | Schiffshorn |
| `V` | Ansage | Ansage des Kapitäns, z. B. „Noch etwa 1 Tag und 2 Stunden bis Stockholm“ |
| `Ö` | Ö | im Hafen: Gangway ausfahren, Passagiere gehen an bzw. von Bord (Landgang) |
| `U` | U | im Hafen Hamburg: in die Bahn umsteigen |
| `R` | R / großer Knopf | am Ende der Reise noch einmal (bzw. zurück, z. B. von New York) |

**Mit dem ICE zum Schiff:** Die Schiffe in Hamburg legen am
Kreuzfahrtterminal Altona ab. Wer mit dem ICE 18 oder ICE 28 nach
**Hamburg-Altona** fährt, kann dort mit `U` auf ein Kreuzfahrtschiff
umsteigen, und im Hafen Hamburg geht es mit `U` zurück in den ICE.

Die Reisen sind Beispiele nach typischen Routen der Schiffe, die in
Deutschland ablegen, kein Fahrplan einer bestimmten Reederei.

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
ICE werden nur Umstiege in diese Bahnen sowie Flugzeug und Kreuzfahrt
gezeigt, angeboten und angesagt. Beim Tram- oder
Busfahren gilt das Gleiche für Tram und Bus. Die Fähre und der Bus in
Brandenburg gehören zu beiden Gruppen: Sie werden überall angeboten, und von
dort aus sieht man alle Umstiege. Das macht die Liste deutlich
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
`sounds/bus.wav`, `sounds/regio.wav`, `sounds/ice.wav` oder
`sounds/faehre.wav` (Schiffsglocke und Schiffshorn) ablegen. Das tiefe Horn
des Kreuzfahrtschiffs ist `sounds/schiff.wav`. Im
Flugzeug gibt es den Kabinengong `sounds/flug.wav` und beim Start das
Triebwerksgeräusch `sounds/jet.wav`.

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

Die **Busse in Brandenburg** sind alle Buslinien der übrigen Betreiber im
VBB (also nicht BVG und S-Bahn), die in Brandenburg halten. Der
Landkreis steht im Gemeindeschlüssel der Haltestellen-Nummern
(„de:12064:…“ = Märkisch-Oderland); die Tabelle `REGIONS` in
`tools/build_data.py` ordnet ihm Kennzeichen, Namen und Farbe zu. Gleiche
Liniennummern gibt es oft in mehreren Landkreisen, deshalb unterscheidet das
Skript die Linien dort auch nach dem Betreiber. Fahrzeiten sind für 99 %
der Abschnitte da.

Der aktuelle Datenstand stammt aus dem VBB-Fahrplan vom März 2026. Die
**U4** fehlt darin seit Februar 2026, vermutlich wegen einer Sperrung, und
die Saison-Fähre **F24** fährt nur von April bis Oktober. Damit sie trotzdem
im Spiel sind, übernimmt das Skript Linien aus der Liste `KEEP_LINES` (in
`tools/build_data.py`) aus der letzten älteren Version, in der sie noch
vorkommen. Für die U4 ist das der Fahrplan vom Januar 2026, für die F24 der
vom Oktober 2025. Weitere Linien lassen sich dort einfach eintragen.

**Neue Linien**, die im VBB-Datensatz noch fehlen, stehen in
`data/extra_lines.json`. Zurzeit ist das die **S15** (seit 15. Juni 2026,
Gesundbrunnen – Wedding – Hauptbahnhof) in Pink wie die S1. Sobald
der VBB-Datensatz die Linie selbst enthält, nimmt das Skript automatisch die
echten Daten.

Fehlt ein Bahnhofsname im neuesten Haltestellenverzeichnis, nimmt das Skript
ihn aus der Verzeichnisversion, die zum Fahrplanstand passt. Einige Bahnsteige
haben im Fahrplan eine eigene Nummer, die im Verzeichnis gar nicht vorkommt.
Sie stehen in der Tabelle `STATION_ALIASES` in `tools/build_data.py` und
werden der richtigen Station zugeordnet: der Hauptbahnhof der Regional- und
Fernbahn (sonst fehlte er bei RE3, RE4, RE5, RE8, RE20, RE85, RB10 und FEX)
und der U2-Bahnsteig von Stadtmitte.

Fahrplandaten: © VBB Verkehrsverbund Berlin-Brandenburg GmbH, CC BY 4.0.

**Fahrzeiten zwischen den Stationen:** Sie stammen aus demselben offiziellen
VBB-Fahrplan (GTFS) wie die Linien, aufbereitet im npm-Paket `vbb-trips`
(Stand März 2026). `tools/build_times.py` nimmt für jeden Abschnitt die
Fahrzeit (Ankunft an der nächsten Station minus Abfahrt an der vorigen) aller
Fahrten der Linie und davon den Mittelwert (Median). So sind für fast alle
Abschnitte Zeiten da: S-Bahn, U-Bahn, Regionalbahn und Fähre zu 100 %, Tram
zu 99 %, Bus zu 98 %. Fehlende Abschnitte, etwa die gesperrte U4, kommen aus
älteren Fahrplanständen. Die Saison-Fähre F24 fehlt in allen Ständen seit
November 2024; ihre Fahrzeit kommt aus dem Stand vom Oktober 2024. Der Fahrplan rechnet in ganzen Minuten.

Die **ICE-Linien** stehen nicht im VBB-Fahrplan. Ihre Fahrzeiten kommen aus
dem Soll-Fahrplan des Fernverkehrs (DELFI e.V., über
[gtfs.de](https://gtfs.de), Lizenz CC BY 4.0). Die Bahnhöfe werden über ihre
Koordinaten zugeordnet. Gezählt wird die Zeit zwischen zwei Halten der Linie
im Spiel, auch wenn der Zug dazwischen noch öfter hält. Dieser Fahrplan gilt
immer nur für die nächsten Wochen und enthält deshalb auch **Umleitungen
wegen Bauarbeiten**. Beim Stand vom 14.11. bis 12.12.2026 fahren die ICE
zwischen Nürnberg und München über Umwege (etwa 1 Std. 50 Min. statt sonst
gut 1 Stunde), und Berlin Ostbahnhof und Wolfsburg werden nicht angefahren.
Dort steht deshalb keine Zeit. Wer die Daten später neu baut, bekommt den
dann gültigen Fahrplan. Das Skript
läuft am Ende von `tools/build_data.py` automatisch mit, einzeln geht es so:

```sh
python3 tools/build_times.py
```

**Flüge:** Ziele, Flugzeiten und die gezeichneten Wahrzeichen stehen in
`tools/make_flights.py`. Das Skript schreibt `data/flights.json`. Die
Weltkarte stammt aus [Natural Earth](https://www.naturalearthdata.com/)
(gemeinfrei, über das npm-Paket `world-atlas`) und ist stark vereinfacht. Neu
bauen:

```sh
python3 tools/make_flights.py
```

**Kreuzfahrten:** Reisen, Häfen, Seewege und die neuen Hafen-Wahrzeichen
stehen in `tools/make_cruises.py`. Das Skript schreibt `data/cruises.json`
und übernimmt die Wahrzeichen der Häfen, die auch Flugziele sind, aus
`tools/make_flights.py`. Neu bauen (danach `python3 tools/build_web.py`):

```sh
python3 tools/make_cruises.py
```
