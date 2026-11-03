# PLAN: Grundriss-Skizze

Dieser Plan ist die gemeinsame Grundlage für alle Sitzungen. Jede Sitzung liest ihn zuerst.
Ein Häkchen [x] bedeutet: fertig, getestet, gepusht.

## Fortschritt

- [x] 1a Gerüst, Zeichenfläche, Muster-PDF (Stift und Handballen auf dem Tablet noch zu testen)
- [x] 1b Formenerkennung (von Opus geprüft, Befunde eingearbeitet)
- [ ] 1c Räume bearbeiten, Maße eintippen, Bemaßung (Kern fertig, Reste siehe Etappe)
- [ ] 1d Wände und Zwischenwände (Kern fertig, Rest: Wanddicke in der Bemaßung)
- [ ] 1e Türen und Fenster
- [ ] 1f Fertiges PDF und Offline-Betrieb (PWA)
- [ ] 2a Speichern auf dem Gerät, Skizzenliste, Kundendaten von Hand, Vor/Zurück
- [ ] 2b Versionen mit Vorschaubild
- [ ] 3a Server im Docker-Container auf dem Mini-PC
- [ ] 3b Hochladen mit Warteschlange, Weitergabe an n8n
- [ ] 3c Kundenliste über n8n, Zuordnung
- [ ] 4a Symbole
- [ ] 4b Fotos
- [ ] 5 Anbindung an Twenty, Umzug auf Hostinger, Feinschliff
- [ ] 6 Anmeldung (später)

## 1. Kurzbeschreibung

Eine Web-App für Tablets (iPad und Android), die man wie eine App installieren kann.
Der Elektromeister skizziert vor Ort 2 bis 3 Räume mit Stift oder Finger.
Die App macht aus groben Strichen saubere, gerade Räume mit Winkeln von 0°, 45° und 90°.
Er tippt die echten Maße ein, setzt Wände, Türen, Fenster und Symbole und macht Fotos.
Die App erzeugt im Gerät ein maßstabsgetreues Vektor-PDF auf A4 mit Schriftkopf.
Dieses PDF liest HottCAD ein und baut daraus das 3D-Modell.
Alles funktioniert ohne Internet. Später lädt die App die Skizze auf einen kleinen Server.
Der Server gibt alles an n8n weiter, n8n legt es beim Kunden in Twenty (CRM) ab.

## 2. Festgelegte Entscheidungen

- Web-App (PWA) in TypeScript mit Vite. Läuft im Browser, installierbar auf dem Startbildschirm.
- Tablets im Querformat, Stift und Finger. Handballen werden ignoriert.
- Gezeichnet wird das Innenmaß. Alle Linien exakt gerade. Winkel nur 0°, 45°, 90°. Freie Winkel später optional.
- Formen: Viereck, L, U, T, mit 45°-Schrägen. Toleranzen einstellbar.
- Wände standardmäßig aus. Schalter "Wände um den Raum". Zwischenwände werden erkannt, Dicke wird abgefragt. Die Wanddicke ist immer frei einstellbar; die Standarddicke ist nur ein Vorschlag.
- Arbeitsweise: Der Nutzer sieht den Fortschritt in einer veröffentlichten Vorschau zum Anklicken. An Meilensteinen prüft ein Opus-Unteragent die Arbeit gegen den Plan.
- Türen und Fenster wie in der Bauzeichnung. Nur Breite, Anschlag, Aufschlag. Keine Höhen.
- Symbole nur zur Darstellung: Unterverteilung, Zählerschrank, Wallbox, Steckdose, Schalter, Lichtauslass, Wechselrichter, Batteriespeicher, Hausanschlusskasten.
- Bemaßung immer sichtbar: Raummaße und Wanddicken.
- Fotos pro Skizze.
- PDF: A4 hoch oder quer, Maßstab 1:20, 1:25, 1:50, 1:100 (automatisch oder von Hand), Maßstabsbalken, Nordpfeil, Schriftkopf (Kundenname, Adresse, Kundennummer, Datum), Maßstab deutlich angegeben. Echtes Vektor-PDF, im Gerät erzeugt. Kein DXF.
- Vor/Zurück mit 100 Schritten. Versionen automatisch beim Schließen und Hochladen, dazu manuell. Liste mit Datum und Vorschaubild. Jede Version wiederherstellbar. Gesichert auf dem Tablet und auf dem Server.
- Jede Skizze bleibt editierbar: PDF und Quelldatei werden gespeichert.
- Voll offline: zeichnen, speichern, PDF. Hochladen aus einer Warteschlange, sobald Netz da ist.
- Kunden aus Twenty über n8n, offline zwischengespeichert. Vorher Eingabe von Hand.
- Kleiner Server in Docker mit Datenbank, Docker Compose mit Traefik. Gleiches Paket auf Mini-PC (Test) und Hostinger KVM 4 (Produktion).
- Erste Version ohne Passwort. Nur im Heimnetz oder über Tailscale erreichbar. Anmeldung kommt als eigene Etappe.
- Etappen 1 und 2 in der Cloud-Sitzung mit veröffentlichter Vorschau. Ab Etappe 3 auf dem Mini-PC. Übergabe über GitHub.

## 3. Technik

### 3.1 Bausteine und Begründung

- **Vite + TypeScript, ohne großes Framework.** Die Oberfläche ist klein (Werkzeugleiste, ein paar Dialoge). Ein schlankes Projekt lädt schnell auf dem Tablet und ist leicht zu warten. Falls die Dialoge zu umständlich werden, darf Preact (sehr klein) dazukommen.
- **Zeichenfläche: HTML-Canvas mit Pointer-Events.** Pointer-Events liefern Stift, Finger und Maus über eine Schnittstelle. Sie melden die Art des Eingabegeräts und die Auflagefläche. Damit lässt sich der Handballen ausfiltern: Ist ein Stift aktiv, zählen Finger nur noch zum Verschieben und Zoomen.
- **Eine Zeichenfunktion für Bildschirm und PDF.** Der Plan wird einmal in einfache Befehle übersetzt (Linie, Bogen, Text, Fläche). Der Bildschirm und das PDF lesen dieselben Befehle. So sieht das PDF genau aus wie die Ansicht.
- **PDF mit pdf-lib.** Läuft komplett im Browser, erzeugt echte Vektorlinien, kann Text mit Umlauten und Bilder einbetten. PDF-Einheit ist der Punkt (1 mm = 2,835 Punkt), umgerechnet wird an einer Stelle.
- **Speicher im Gerät: IndexedDB** (Datenbank im Browser) über die kleine Bibliothek `idb`. Hier liegen Skizzen, Versionen, Fotos, Kundenliste und Warteschlange.
- **Offline: Service Worker** (Hintergrundprogramm des Browsers, das die App-Dateien zwischenspeichert) über `vite-plugin-pwa`.
- **Tests: Vitest** für Geometrie, Formenerkennung und PDF-Maße. Diese Teile sind reine Rechenlogik und gut automatisch prüfbar.
- **Server: Node.js mit Fastify und SQLite.** SQLite ist eine Datenbank in einer einzigen Datei, ohne eigenen Datenbank-Dienst. Das schont den schwachen Mini-PC. Dateien (PDF, Fotos, Quelldatei) liegen in einem Docker-Volume (Ordner, der Neustarts übersteht).
- **Der Server liefert auch die App aus.** Dann laufen App und Server unter derselben Adresse. Das vermeidet Browser-Sperren zwischen verschiedenen Adressen.

### 3.2 Datenmodell (Welt in Metern)

Alle Maße im Modell sind Meter als Zahl, gerundet auf 1 mm. Erst beim Anzeigen und im PDF wird umgerechnet. Der Maßstab betrifft nur die Ausgabe, nie das Modell.

Eine Skizze (Quelldatei, JSON-Format, also lesbarer Text) enthält:

- `schemaVersion`: Nummer des Dateiformats. Damit lassen sich alte Skizzen später umwandeln.
- `id`, `erstellt`, `geaendert`.
- `kunde`: Name, Adresse, Kundennummer, optional Twenty-ID.
- `raeume`: je Raum ein Name und eine geschlossene Eckenliste (Innenmaß). Jede Kante läuft in einer der 8 Richtungen (0°, 45°, 90° usw.).
- `waende`: je Raumkante eine Dicke (0 = keine Wand). Zwischenwände gehören zu zwei Räumen und haben eine gemeinsame Dicke.
- `oeffnungen`: Tür oder Fenster, an welcher Kante, Abstand von der Kantenecke, Breite, Anschlag links/rechts, Aufschlag innen/außen.
- `symbole`: Typ, Position, Drehung.
- `fotos`: Verweise auf Fotos (die Bilder selbst liegen getrennt).
- `blatt`: Hoch/Quer, Maßstab (auto oder fest), Nordrichtung.

Das PDF wird immer aus der Quelldatei neu erzeugt. Darum bleibt alles editierbar.

### 3.3 Formenerkennung

Grundidee: Die App muss nicht wissen, ob es ein L oder ein U ist. Sie baut aus dem Strich ein Vieleck, dessen Kanten nur in 45°-Schritten laufen. Der Name der Form (Rechteck, L, U, T) wird danach nur zur Anzeige bestimmt. Das ist einfacher und robuster als einzelne Formen zu suchen.

Schritte:

1. Punkte des Strichs sammeln. Handballen und zu kurze Striche verwerfen.
2. Glätten und in gleichen Abständen neu abtasten (wackelige Punkte beruhigen).
3. Ecken finden: Linie vereinfachen nach Ramer-Douglas-Peucker (ein Standardverfahren, das Punkte weglässt, solange die Abweichung unter einer Toleranz bleibt). Sehr kurze Stücke werden mit Nachbarn verschmolzen.
4. Jede Kante auf die nächste Richtung 0°, 45°, 90° ... einrasten, wenn sie innerhalb der Winkeltoleranz liegt.
5. Nachbarkanten mit gleicher Richtung zusammenlegen.
6. Schließen: Liegt das Ende nahe am Anfang, wird die Form geschlossen. Die Ecken werden als Schnittpunkte der eingerasteten Kanten neu berechnet.
7. Maße auf ein Raster runden (Standard 5 cm).
8. Prüfen: keine Selbstüberschneidung, keine Kante unter Mindestlänge, Fläche sinnvoll. Wenn nicht: Strich verwerfen und kurzen Hinweis zeigen.

Die grobe Größe aus der Zeichnung ist nur ein Startwert. Die echten Maße tippt der Nutzer pro Kante ein. Damit die Form geschlossen bleibt, gleicht eine Ausgleichskante die Differenz aus. Ist das nicht möglich, zeigt die App einen Hinweis.

**Alle Toleranzen stehen an einer Stelle:** `src/config/toleranzen.ts`. Dort steht für jeden Wert ein Standard und eine kurze Erklärung, zum Beispiel Winkeltoleranz (Standard 15°), Schließabstand, Mindestkantenlänge, Glättung, Rundungsraster, Fangabstand für Zwischenwände. In den Einstellungen der App lassen sie sich ändern. Die geänderten Werte werden im Gerät gespeichert.

Zum Testen wird eine Sammlung aufgezeichneter echter Striche (vom Tablet des Nutzers) als Testdaten abgelegt. Jede Änderung am Verfahren muss diese Sammlung weiter bestehen.

### 3.4 Offline und Warteschlange

- Der Service Worker speichert alle App-Dateien. Nach dem ersten Öffnen mit Netz läuft die App ohne Netz.
- Beim Start wird `navigator.storage.persist()` angefragt. Damit löscht der Browser die Daten nicht von selbst. Auf dem iPad hilft zusätzlich die Installation auf dem Startbildschirm.
- Hochladen schreibt einen Auftrag in die Warteschlange (IndexedDB). Ein Auftrag enthält Skizze, PDF, Fotos und Version.
- Die Warteschlange wird abgearbeitet beim Start, wenn das Netz zurückkommt und alle paar Minuten. iPads kennen kein Hintergrund-Hochladen, deshalb nur bei offener App.
- Jeder Auftrag hat eine eindeutige ID. Der Server erkennt doppelte Sendungen und speichert nichts doppelt.
- Die App zeigt pro Skizze den Stand: nur lokal, wartet, hochgeladen, Fehler.

### 3.5 Versionsspeicher

- **Vor/Zurück:** Nach jeder Änderung wird der Zustand der Skizze gemerkt (bis 100 Schritte). Nur für die laufende Sitzung.
- **Versionen:** Eine Version ist eine vollständige Kopie der Quelldatei mit Datum, Grund (Schließen, Hochladen, manuell) und kleinem Vorschaubild. Skizzen sind klein (wenige KB), volle Kopien sind daher einfach und sicher.
- Wiederherstellen erzeugt eine neue Version. Es wird nie etwas überschrieben.
- Beim Hochladen gehen alle noch nicht übertragenen Versionen mit zum Server.

### 3.6 Server und Betrieb

- Docker Compose mit drei Diensten: Traefik (Verteiler für Webadressen und HTTPS), App-Server, auf dem Mini-PC zusätzlich n8n mit einem Test-Ziel.
- Einstellungen (Adressen, n8n-Webhook) stehen in einer `.env`-Datei. Nur diese Datei unterscheidet Mini-PC und Hostinger.
- Ein Service Worker läuft nur über HTTPS. Im Heimnetz mit nackter IP-Adresse funktioniert Offline daher nicht. Lösung: Zugriff über Tailscale mit dessen HTTPS-Zertifikat. Traefik nutzt dieses Zertifikat.
- Schnittstelle Server: Skizze mit Versionen und Dateien annehmen, Kundenliste abrufen, Gesundheitsprüfung.
- Der Server schickt jede neue Skizze an einen n8n-Webhook (Adresse, die n8n Daten entgegennimmt). Klappt das nicht, versucht er es später erneut.

### 3.7 Ordnerstruktur (Vorschlag)

```
PLAN.md
README.md              Kurzanleitung Start und Betrieb
app/                   die Web-App
  src/
    config/            toleranzen.ts, maszstaebe.ts, symbole.ts
    modell/            Datentypen, Skizze anlegen, Formatumwandlung
    geometrie/         Vektoren, Schnittpunkte, Vielecke, Einrasten
    erkennung/         Formenerkennung
    zeichnen/          Zeichenbefehle aus dem Modell
    ansicht/           Canvas, Zoom, Verschieben, Pointer-Eingabe
    werkzeuge/         Raum, Wand, Tür, Fenster, Symbol, Bearbeiten
    pdf/               PDF-Erzeugung
    speicher/          IndexedDB, Versionen, Warteschlange
    oberflaeche/       Werkzeugleiste, Dialoge, Listen
  tests/               Vitest, Testdaten (aufgezeichnete Striche)
server/                Fastify, SQLite, Weitergabe an n8n
deploy/
  docker-compose.yml
  traefik/
  .env.beispiel
  n8n/                 exportierte Test-Workflows
```

## 4. Etappen

Hinweis: Ein erstes Docker-Paket (nginx statt Traefik, Zugriff über `tailscale serve`) liegt unter `deploy/`. Es wurde vorgezogen, damit der Nutzer die App auf dem iPad installieren kann. Der Server mit Datenbank folgt in Etappe 3a.

Jede Etappe ist einzeln lauffähig und wird einzeln gepusht. Größe: klein = halbe Sitzung, mittel = eine Sitzung, groß = muss geteilt werden. Der Vorschlag des Nutzers wurde in kleinere Teile geteilt, weil Etappe 1 als Ganzes nicht in eine Sitzung passt.
### 1a Gerüst, Zeichenfläche, Muster-PDF für HottCAD
Ziel: Ein lauffähiges Projekt mit Zeichenfläche und einem Muster-PDF, das HottCAD testen kann.
- [x] Vite-Projekt mit TypeScript, Vitest, Ordnerstruktur (README folgt in 1f)
- [x] Canvas im Querformat, Raster, Zoom und Verschieben mit zwei Fingern
- [x] Pointer-Eingabe: Stift zeichnet, Finger verschiebt; Handballen-Filter
- [x] Freihand-Strich wird angezeigt (noch ohne Erkennung)
- [x] Muster-PDF: Rechteck 4,00 x 3,00 m und L-Raum in 1:50, Maßlinien, Maßstabsbalken, Maßstabsangabe, A4 quer
- [x] Veröffentlichte Vorschau einrichten
Testen auf dem Tablet: Zeichnen mit Pencil und Finger, Handballen liegt auf, Zoom. Muster-PDF herunterladen und ansehen.
Abhängigkeiten: keine. Größe: mittel, eine Sitzung. Ort: Cloud.

### 1b Formenerkennung
Ziel: Grobe Striche werden zu sauberen Räumen.
- [x] Verfahren nach Abschnitt 3.3, Toleranzen in `app/src/config/toleranzen.ts`
- [x] Rechteck, L, U, T, mit 45°-Schrägen
- [x] Hinweis bei nicht erkannter Form
- [x] Testsammlung mit künstlich verwackelten Strichen (Aufnahme echter Striche vom Tablet: noch offen)
- [x] Einstellungsseite für die Toleranzen
Testen: Verschiedene Formen schief und wackelig zeichnen. Toleranzen ändern und Wirkung sehen. Echte Striche aufnehmen und zum Testen übergeben.
Zusätzlich gebaut: Leisten verschiebbar und beim Ziehen sofort an der Kante eingerastet, Werkzeuge Zeichnen/Auswählen, Zoomknöpfe. Verschieben der Ansicht nur mit zwei Fingern (Wunsch des Nutzers), Verlauf mit Zurück/Vor.
Abhängigkeiten: 1a. Größe: mittel bis groß. Falls die Sitzung nicht reicht: 1b-1 Rechteck und L, 1b-2 U, T, Schrägen und Einstellungen. Ort: Cloud.

### 1c Räume bearbeiten, Maße eintippen, Bemaßung
Ziel: Räume bekommen exakte Maße und eine Bemaßung wie in der Bauzeichnung.
- [x] Werkzeug "Auswählen": Raum antippen, markieren; Raum benennen (zum Beispiel Keller, Technikraum)
- [x] Maße außen: Maßlinien außerhalb des Raums (Wunsch des Nutzers). Offen: Umschalter für Innen/Außen, Kollisionen zwischen Nachbarräumen
- [x] Doppeltippen auf Raum: Name und alle Seitenlängen eintippen (Wand am Seitenende wandert mit)
- [x] Raum verschieben, löschen, benennen. Offen: drehen in 90°-Schritten
- [x] Mehrere Räume; Räume rasten aneinander ein (bündig)
- [ ] Bemaßung: Gesamtmaße außen (Hüllmaß), Umschalter innen/außen; Raumname und Fläche sind da
Testen: Keller mit 3 Räumen anlegen, Maße eintippen, Maße lesen.
Abhängigkeiten: 1b. Größe: mittel. Ort: Cloud.

### 1d Wände und Zwischenwände
Ziel: Wände werden angelegt und bemaßt.
- [x] Haken "Wände um den Raum" mit Vorschlag (24 cm, in den Einstellungen änderbar), Dicke pro Seite frei änderbar; Seiten mit Nachbarraum bekommen keine Außenwand
- [x] Wände nach außen versetzt, Ecken sauber verschnitten (Gehrung)
- [x] Zwischenwand-Erkennung: zwei Räume liegen parallel nah beieinander (bis 60 cm, Überlappung ab 30 cm); Dialog fragt Dicke ab (Vorschlag 11,5 cm); Raum rückt auf diesen Abstand. Die Wand gehört zu dem Raum, der bewegt wurde
- [ ] Wanddicken in der Bemaßung (Maßlinien rücken hinter die Wand; die Dicke selbst ist noch nicht bemaßt, Maßlinien an Nachbarseiten entfallen)
Testen: Zwei Räume nebeneinander legen, Abfrage beantworten, Wände an- und ausschalten.
Hinweis: Der Hinweistext (Toast) sitzt oben und wandert nach unten, wenn dort eine Leiste liegt.
Abhängigkeiten: 1c. Größe: mittel. Ort: Cloud.

### 1e Türen und Fenster
Ziel: Türen und Fenster in Bauzeichnungs-Darstellung.
- [ ] Tür: Wandöffnung, Türblatt, Aufschlagbogen; Breite, Anschlag links/rechts, Aufschlag innen/außen
- [ ] Fenster: Wandöffnung mit Fensterlinien; Breite
- [ ] Setzen durch Antippen einer Kante, verschieben entlang der Kante, Abstand zur Ecke eintippen
- [ ] Ohne Wand (Dicke 0) wird eine schmale Ersatzdarstellung gezeigt
- [ ] Bemaßung von Breite und Abstand
Testen: Türen in beide Richtungen setzen, Fenster setzen, Maße prüfen.
Abhängigkeiten: 1d. Größe: mittel. Ort: Cloud.

### 1f Fertiges PDF und Offline-Betrieb
Ziel: Das vollständige PDF und die App laufen ohne Internet.
- [ ] Gemeinsame Zeichenbefehle für Bildschirm und PDF
- [ ] A4 hoch/quer, Maßstab automatisch (größter passender aus 1:20, 1:25, 1:50, 1:100) oder von Hand
- [ ] Maßstabsbalken, Nordpfeil (drehbar), Schriftkopf mit Kundenname, Adresse, Kundennummer, Datum, Maßstab
- [ ] Test: Länge im PDF in mm stimmt mit Maßstab überein
- [x] PWA: Manifest, Symbol, Service Worker, Installieren auf dem Startbildschirm (vorgezogen, vom Nutzer auf dem iPad zu testen)
Testen: PDF erzeugen und ausdrucken, mit Lineal nachmessen. App installieren, Flugmodus an, App öffnen, zeichnen, PDF erzeugen.
Abhängigkeiten: 1e. Größe: mittel. Ort: Cloud.

### 2a Speichern auf dem Gerät, Kundendaten, Vor/Zurück
Ziel: Skizzen bleiben auf dem Tablet erhalten.
- [ ] Skizzen in IndexedDB, automatisches Speichern nach jeder Änderung
- [ ] Startseite mit Skizzenliste: neu, öffnen, löschen (mit Rückfrage)
- [ ] Kundendaten von Hand: Name, Adresse, Kundennummer
- [ ] Vor/Zurück mit 100 Schritten
- [ ] Quelldatei als JSON exportieren und importieren (Sicherung)
- [ ] Speicher-Dauerhaftigkeit anfragen
Testen: Skizze anlegen, App schließen, Tablet neu starten, Skizze ist noch da. Vor/Zurück ausprobieren.
Abhängigkeiten: 1f. Größe: mittel. Ort: Cloud.

### 2b Versionen mit Vorschaubild
Ziel: Jeder frühere Stand ist wiederherstellbar.
- [ ] Automatische Version beim Schließen, Knopf für manuelle Version
- [ ] Vorschaubild je Version
- [ ] Versionsliste mit Datum, Grund, Vorschaubild; Wiederherstellen als neue Version
- [ ] Formatnummer und Umwandlung für ältere Skizzen
Testen: Mehrere Versionen erzeugen, eine alte wiederherstellen, prüfen, dass die neueste nicht verloren ist.
Abhängigkeiten: 2a. Größe: klein bis mittel. Ort: Cloud. Danach ist die App allein nutzbar.

### 3a Server im Docker-Container auf dem Mini-PC
Ziel: Der Server läuft auf dem Mini-PC und liefert die App über HTTPS aus.
- [ ] Fastify-Server mit SQLite und Datei-Volume; Tabellen für Skizzen, Versionen, Dateien
- [ ] Docker Compose mit Traefik, `.env.beispiel`
- [ ] Tailscale-HTTPS-Zertifikat in Traefik; nicht öffentlich erreichbar
- [ ] Server liefert die gebaute App aus
- [ ] Gesundheitsprüfung, Sicherung der Datenbank (einfaches Kopierskript)
- [ ] Speicherverbrauch messen (Ziel: Server unter 200 MB RAM)
Testen: App über die Tailscale-Adresse öffnen, installieren, offline nutzen.
Abhängigkeiten: 2b. Größe: mittel. Ort: Mini-PC.

### 3b Hochladen mit Warteschlange, Weitergabe an n8n
Ziel: Skizzen kommen zuverlässig auf dem Server und bei n8n an.
- [ ] Knopf "Hochladen": Version anlegen, PDF erzeugen, Auftrag in Warteschlange
- [ ] Warteschlange nach Abschnitt 3.4, Anzeige des Stands
- [ ] Server speichert Skizze, Versionen, PDF; erkennt doppelte Aufträge
- [ ] Server sendet an n8n-Webhook mit Wiederholung
- [ ] n8n-Test-Workflow: legt die Dateien in einem Test-Ordner ab
Testen: Im Flugmodus hochladen, später Netz an, Skizze kommt an. Versionen auf dem Server vorhanden.
Abhängigkeiten: 3a. Größe: mittel. Ort: Mini-PC.

### 3c Kundenliste über n8n, Zuordnung
Ziel: Skizzen werden einem Kunden aus der Liste zugeordnet.
- [ ] n8n-Test-Workflow liefert eine Kundenliste (Testdaten)
- [ ] Server reicht die Liste weiter, App speichert sie offline
- [ ] Kundensuche beim Anlegen einer Skizze; Eingabe von Hand bleibt möglich
- [ ] Kunden-ID geht beim Hochladen mit
Testen: Kunde suchen und zuordnen, auch offline mit gespeicherter Liste.
Abhängigkeiten: 3b. Größe: klein. Ort: Mini-PC.

### 4a Symbole
Ziel: Elektro-Symbole lassen sich platzieren.
- [ ] Die 9 Symbole als Vektorzeichnung, eigene einfache Darstellung mit Kürzel
- [ ] Setzen, verschieben, drehen, löschen; Einrasten an Wände
- [ ] Symbole im PDF, Legende im PDF
Testen: Technikraum mit Zählerschrank, Unterverteilung, Wechselrichter und Speicher planen, PDF prüfen.
Abhängigkeiten: 2b (läuft auch ohne Server). Größe: klein bis mittel. Ort: Mini-PC (oder Cloud, falls dort zuerst frei).

### 4b Fotos
Ziel: Fotos werden zur Skizze gespeichert und mit hochgeladen.
- [ ] Foto aufnehmen oder aus der Galerie wählen
- [ ] Verkleinern auf ca. 2000 Pixel, Speichern in IndexedDB
- [ ] Fotoliste pro Skizze, Foto löschen
- [ ] Fotos gehen mit dem Hochladen an Server und n8n
Testen: Fotos im Keller offline aufnehmen, später hochladen, im Test-Ordner prüfen.
Abhängigkeiten: 3b. Größe: klein bis mittel. Ort: Mini-PC.

### 5 Anbindung an Twenty, Umzug auf Hostinger, Feinschliff
Ziel: Echter Betrieb mit Twenty auf dem Hostinger-Server.
- [ ] Compose-Paket auf Hostinger KVM 4 starten, nur über Tailscale erreichbar
- [ ] n8n-Workflows: Kundenliste aus Twenty, PDF, Fotos und Quelldatei beim Kunden ablegen
- [ ] Ablauf mit echten Kunden prüfen
- [ ] Feinschliff nach den Rückmeldungen aus den Tests
Testen: Skizze für einen echten Kunden hochladen und in Twenty finden.
Abhängigkeiten: 3c, 4b. Größe: mittel; bei vielen Feinschliff-Punkten in 5a (Twenty) und 5b (Feinschliff) teilen. Ort: Mini-PC bzw. Hostinger.

### 6 Anmeldung (später)
Ziel: Zugriff nur mit Anmeldung, damit der Server auch öffentlich erreichbar sein darf.
- [ ] Verfahren festlegen (zum Beispiel Anmeldung vor Traefik oder im Server)
- [ ] Offline-Nutzung muss trotz Anmeldung erhalten bleiben
Abhängigkeiten: 5. Größe: mittel. Wird vor Beginn genauer geplant.

## 5. Frühe Risiko-Tests

1. **HottCAD-Import:** vom Nutzer bereits getestet, funktioniert. Kein weiterer Test und keine Rückfragen dazu. Die App liefert nur das PDF.
   Ergebnis: erledigt
2. **Pencil, Finger und Handballen** (nach 1a) auf iPad und einem Android-Tablet mit Stift. Prüfen: Stift zeichnet, Handballen erzeugt keine Striche, zwei Finger zoomen.
   Ergebnis: _noch offen_
3. **Offline im Browser** (nach 1f). App installieren, Flugmodus, App neu öffnen, PDF erzeugen. Auf iPad und Android.
   Ergebnis: _noch offen_
4. **Vorschau unterstützt Service Worker** (in 1a). Falls die veröffentlichte Vorschau keinen Service Worker erlaubt, wird für den Offline-Test GitHub Pages als Vorschau genutzt.
   Ergebnis: _noch offen_
5. **Tailscale-HTTPS auf dem Mini-PC** (am Anfang von 3a). Ohne HTTPS kein Offline-Betrieb.
   Ergebnis: _noch offen_

## 6. Risiken und offene Punkte

- **Formenerkennung ist der schwierigste Teil.** Wackelige Striche, abgerundete Ecken und kurze Schrägen sind schwer zu unterscheiden. Gegenmittel: allgemeines 45°-Vieleck statt Formenkatalog, Testsammlung mit echten Strichen, einstellbare Toleranzen und notfalls Korrektur von Hand (Ecke ziehen, Maß eintippen).
- **Maße und geschlossene Form.** Beim Eintippen aller Kantenlängen kann die Form rechnerisch nicht schließen (Messfehler vor Ort). Die Ausgleichskante löst das, zeigt aber die Abweichung an.
- **Zwischenwand-Erkennung** kann falsch auslösen, wenn Räume zufällig nah liegen. Darum fragt die App immer nach, statt selbst zu entscheiden.
- **iPad-Speicher.** Safari kann Daten von nicht installierten Web-Apps nach einigen Tagen ohne Nutzung löschen. Die App muss installiert sein. Der Server ist die zweite Sicherung, darum regelmäßig hochladen.
- **Kein Hintergrund-Hochladen auf dem iPad.** Die Warteschlange läuft nur bei offener App.
- **Mini-PC ist schwach.** n8n und der Server passen in den Speicher, Twenty nicht. Twenty wird erst auf Hostinger getestet. Unterschiede zwischen Test-Ziel und echtem Twenty zeigen sich erst in Etappe 5.
- **Ohne Passwort** ist Sicherheit nur durch das Netz gegeben. Der Server darf bis Etappe 6 nie öffentlich erreichbar sein.
- **Offen:** Standard-Wanddicke (Vorschlag 24 cm außen, 11,5 cm innen), Rundungsraster (Vorschlag 5 cm, wählbar 1 cm), Aussehen der Symbole (Vorschlag: eigene einfache Zeichen mit Kürzel, an DIN EN 60617 angelehnt), Ablageort der Dateien in Twenty.

## 7. Regeln für jede neue Sitzung

1. PLAN.md vollständig lesen, dann den Stand im Repo prüfen (`git log`, offene Etappe).
2. Die erste nicht abgehakte Etappe nehmen. Nichts außerhalb dieser Etappe bauen. Ideen für später unten in Abschnitt 8 notieren.
3. Vor dem Ende: Tests laufen lassen (`npm test`), App bauen, kurz selbst prüfen.
4. Kleine Commits mit klarer Nachricht. Am Ende jeder Etappe pushen.
5. Häkchen in der Etappe und in der Fortschrittsübersicht setzen, Ergebnisse von Risiko-Tests eintragen, dann diese Änderung mit pushen.
6. Wird eine Etappe nicht fertig: Zwischenstand pushen und hier unter der Etappe in einer Zeile notieren, was fehlt.
7. Ab Etappe 3 auf dem Mini-PC: `git pull`, dann `docker compose up -d --build` im Ordner `deploy`.
8. Entscheidungen aus Abschnitt 2 nicht ändern, ohne den Nutzer zu fragen.

## 8. Notizen für später

- Bekannte Grenzen der Erkennung: sehr flache Ellipsen gelten als Sechseck mit Schrägen; Ecken an 45°-Schrägen liegen nicht auf dem 5-cm-Raster (nur achsparallele Kanten).
- Zwei Finger auf dem Touchpad (Laptop) schicken Mausrad-Ereignisse. Früher wurde senkrechtes Wischen als Zoom gedeutet (Fehler, behoben): Jetzt verschiebt das Mausrad/Touchpad in alle Richtungen, Zoomen mit Spreizen, Strg + Rad oder Zoomknöpfen. Zwei Finger auf dem Touchscreen des Tablets: noch zu testen (Statuszeile zeigt "Vom Browser abgebrochen").
- Symbole früher als Etappe 4a? Nutzer fragt danach (Symbole im Raum, Maße außen). Entscheidung nach 1c.
- Freie Winkel (optional).
- Weitere Symbole nach Bedarf.
