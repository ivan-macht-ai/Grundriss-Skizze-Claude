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

## Kunden holen (Richtung CRM -> App)

`GET <server-adresse>/api/kunden?marke=Angebot,Besuch` mit demselben `Authorization`-Header.

- `marke` ist optional und kann mehrere Marken (Etiketten/Tags in Twenty) enthalten, durch Komma getrennt. Geliefert werden Kunden,
  die mindestens eine dieser Marken tragen. Ohne `marke`: alle Kunden, die der Server freigibt.
- Antwort `200` mit `{"ok": true, "kunden": [ ... ]}`. Jeder Eintrag:

| Feld | Typ | Inhalt |
|---|---|---|
| `crm_id` | Text | Feste ID des Datensatzes in Twenty. Der Schlüssel für alles Weitere. |
| `name` | Text | Anzeigename des Kunden. |
| `adresse` | Text | Eine Zeile, zum Beispiel `Gartenweg 5, 80331 München`. Leer, wenn unbekannt. |
| `nummer` | Text | Kundennummer, **falls Twenty ein Feld dafür hat**, sonst leer. Die App zeigt dann nur die `crm_id`. |
| `marken` | Liste von Text | Alle Marken des Kunden. |

- Die App speichert die Liste im Gerät (Zeitpunkt des Abrufs wird angezeigt), damit man Kunden auch ohne Netz auswählen kann.
  Der Abruf passiert, wenn der Nutzer "Kunden aktualisieren" tippt, zum Beispiel beim Kunden mit Netz.
- Wählt der Nutzer einen Kunden, füllt die App Name, Adresse, Kundennummer und merkt sich `crm_id` in der Skizze.
  Tippen von Hand bleibt möglich (Kunde nicht in der Liste, kein Netz).

## Anfrage der App (Skizze senden)

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
| `kunde_nummer` | Text | Kundennummer (kann leer sein). |
| `kunde_crm_id` | Text | `crm_id` aus der Kundenliste, wenn der Kunde dort ausgewählt wurde, sonst leer. Daran legt der Server die Skizze beim richtigen Kunden ab. |
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

## Entscheidungen (Ivan, 4.11.2026)

1. Die Skizze liegt in **Twenty beim Kunden**.
2. Der Weg geht in **beide Richtungen**: Kunden mit einer Marke (zum Beispiel "Angebot" oder "Besuch") werden aus Twenty geholt und in der App
   ausgewählt; die Skizze geht danach an diesen Kunden zurück.
3. Gebraucht werden **Name, Adresse, Kundennummer**. Ein Feld für die Kundennummer gibt es in Twenty vielleicht nicht: dann zählt die `crm_id`.
   Weitere Felder: Notizen (Vermerke). Mehr nach Bedarf.

Noch zu klären (Server-Seite): Ist "Kunde" in Twenty eine Person oder eine Firma? Wie heißen die Marken, und wo stehen sie (Tags, Auswahlfeld)?
Wohin genau kommt die Datei (Anhang am Datensatz, Notiz mit Anhang)?

## Aufteilung

- **App-Seite:** Notizfeld, Knopf "Senden", PDF und Vorschaubild erzeugen, Warteschlange im Gerät, Anzeige "wartet / gesendet / Fehler", Kundenliste holen, zwischenspeichern und auswählen.
- **Server-Seite:** `GET /api/kunden` (Kundenliste aus Twenty nach Marke), `POST /api/skizzen` (Prüfung, Weitergabe an n8n, Ablage bei Twenty). Der Zugang zu Twenty bleibt auf dem Server.
