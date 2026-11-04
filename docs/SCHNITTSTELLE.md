# Schnittstelle App <-> Server <-> Twenty (Entwurf)

Stand: Entwurf, noch nichts davon ist gebaut. Zweck: Die App-Seite (diese Entwicklung) und die Server-Seite
(Heimserver, n8n, Twenty) sollen dasselbe meinen. Änderungen nur gemeinsam mit Ivan.

## Ablauf

1. Auf dem Tablet wird die Skizze **zuerst im Gerät gespeichert** (läuft schon, IndexedDB).
2. Mit dem Knopf "Senden" legt die App einen **Auftrag in eine Warteschlange** im Gerät (Outbox).
3. Sobald Netz da ist (beim Start, beim Netzwechsel, alle paar Minuten bei offener App), schickt die App die Aufträge
   nacheinander an den Server. Erst nach der Antwort `200` gilt ein Auftrag als gesendet, sonst wird er später erneut versucht.
4. Der Server prüft, speichert und gibt alles an **n8n** weiter. n8n legt es bei Twenty ab.
5. Die App hat nie einen Schlüssel für Twenty. Der Zugang zu Twenty liegt nur auf dem Server.

## Anfrage der App

`POST <server-adresse>/api/skizzen` als `multipart/form-data`, Header `Authorization: Bearer <geheimwort>`
(Geheimwort kommt später mit der Anmeldung; bis dahin nur im Heimnetz oder Tailscale erreichbar).

| Feld | Typ | Inhalt |
|---|---|---|
| `auftrag_id` | Text | Eindeutige ID des Auftrags (UUID). Der Server erkennt doppelte Sendungen daran und legt nichts doppelt ab. |
| `skizzen_id` | Text | ID der Skizze (UUID). Bleibt bei jedem Senden derselben Skizze gleich. |
| `version` | Zahl | Zähler: wie oft diese Skizze schon gesendet wurde (1, 2, 3 ...). |
| `skizzen_name` | Text | Name der Skizze. |
| `kunde_name` | Text | Kundenname (kann leer sein). |
| `kunde_adresse` | Text | Adresse (kann leer sein). |
| `kunde_nummer` | Text | Kundennummer (kann leer sein; später Twenty-ID). |
| `notizen` | Text | Vermerke zur Skizze (kann leer sein). |
| `datum` | Text | Zeitpunkt des Sendens, ISO 8601. |
| `anzahl_raeume` | Zahl | Zur Anzeige im CRM. |
| `gesamtflaeche_m2` | Zahl | Summe der Raumflächen, auf 2 Stellen. |
| `massstab` | Text | Zum Beispiel `1:50`. |
| `pdf` | Datei | Das Vektor-PDF (`application/pdf`), A4, dasselbe wie "PDF" in der App. |
| `bild` | Datei | Vorschaubild der Zeichnung (`image/png`), für die Ansicht im CRM. |
| `quelle` | Datei | Quelldatei der Skizze (`application/json`, Format `grundriss-skizze`, Version 1), damit die Skizze später wieder bearbeitet werden kann. |

Größenbegrenzung: die Anfrage insgesamt bis 20 MB, je Datei bis 10 MB. Fotos kommen später als weitere Dateien `foto_1`, `foto_2` ...

## Antwort des Servers

- `200` mit `{"ok": true, "crm_id": "<optional>"}`: gespeichert und weitergegeben (oder schon früher angenommen).
- `400` mit `{"ok": false, "fehler": "<Text für den Nutzer, deutsch>"}`: Daten fehlerhaft, nicht erneut senden.
- `401`: Geheimwort falsch oder fehlt.
- `413`: zu groß.
- `5xx` oder keine Antwort: die App versucht es später erneut.

## Was der Server prüft

- `Authorization` stimmt.
- `quelle` ist gültiges JSON mit `format = "grundriss-skizze"` und `version = 1`.
- `pdf` beginnt mit `%PDF-`, `bild` ist ein PNG.
- Größen eingehalten.
- Nur nach erfolgreicher Prüfung wird an n8n weitergegeben.

## Offene Entscheidungen (Ivan)

1. Wo soll die Skizze im CRM liegen: bei den Personen/Firmen in Twenty, bei den Projekten im Handwerker-Programm, oder zuerst in Twenty und später im Programm?
2. Reicht für den Anfang nur die Richtung "Skizze ins CRM"? Die Kundenliste aus Twenty (Kunde auswählen statt tippen) kommt dann später.
3. Welche weiteren Felder braucht das CRM wirklich? (Vermerke, Termin, Ansprechpartner ...)

## Aufteilung

- **App-Seite:** Notizfeld, Knopf "Senden", PDF und Vorschaubild erzeugen, Warteschlange im Gerät, Anzeige "wartet / gesendet / Fehler".
- **Server-Seite:** Empfangsstelle `/api/skizzen`, Prüfung, Weitergabe an n8n, Ablage bei Twenty. Der Zugang zu Twenty bleibt auf dem Server.
