# App auf dem Mini-PC starten und auf dem iPad installieren

Ziel: Die App läuft auf `ivanserver` (Docker) und ist nur über Tailscale mit HTTPS erreichbar. Nur Geräte in deinem
Tailscale-Netz kommen heran. Es gibt keine öffentliche Adresse.

## Einmal vorbereiten

1. In der Tailscale-Verwaltung (login.tailscale.com, Reiter DNS): **MagicDNS** und **HTTPS-Zertifikate** einschalten.
2. Auf dem iPad die Tailscale-App installieren und mit demselben Konto anmelden.

## Starten (auf dem Mini-PC)

```bash
git clone https://github.com/ivan-macht-ai/Grundriss-Skizze-Claude.git
cd Grundriss-Skizze-Claude/deploy
docker compose up -d --build
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8080
tailscale serve status
```

`tailscale serve status` zeigt die Adresse, etwa `https://ivanserver.<dein-netz>.ts.net:8443`.

Nicht `tailscale funnel` benutzen. Das würde die App öffentlich ins Internet stellen. Ohne Passwort darf das nicht sein.

## Auf dem iPad installieren

1. Tailscale-App öffnen, Verbindung einschalten.
2. In **Safari** die Adresse aus `tailscale serve status` öffnen.
3. Die Seite einmal ganz laden lassen. Unten kommt der Hinweis „Fertig für den Betrieb ohne Internet.“
4. Teilen-Symbol, **Zum Home-Bildschirm**, **Hinzufügen**.
5. Die App vom Home-Bildschirm starten. Ab jetzt läuft sie auch im Flugmodus.

Wichtig: Immer die installierte App benutzen. Safari kann Daten von Webseiten, die nicht installiert sind, nach einigen
Tagen löschen.

## Aktualisieren

```bash
cd Grundriss-Skizze-Claude && git pull
cd deploy && docker compose up -d --build
```

Auf dem iPad erscheint dann „Neue Version bereit. Schließe die App und öffne sie neu.“ Die App ganz schließen (im
App-Wechsler wegwischen) und neu öffnen.

## Prüfen und anhalten

```bash
docker ps --filter name=skizze      # läuft der Container?
docker stats --no-stream skizze     # Speicherverbrauch (erwartet: wenige MB)
docker compose down                 # anhalten
sudo tailscale serve reset          # Freigabe entfernen
```

## Wenn etwas nicht klappt

- **„Zum Home-Bildschirm“ fehlt oder die App ist nicht offline:** Die Adresse muss mit `https://` beginnen. Mit einer
  nackten IP-Adresse funktioniert der Offline-Betrieb nicht.
- **Seite lädt nicht:** Läuft Tailscale auf dem iPad? Zeigt `docker ps` den Container?
- **Port 8443 ist belegt:** Eine andere Zahl bei `--https=` nehmen (zum Beispiel 8444).
