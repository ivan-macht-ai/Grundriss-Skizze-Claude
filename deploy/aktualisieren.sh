#!/usr/bin/env bash
# Holt den neuesten Stand von GitHub und baut den Container neu. Aufruf auf dem Server:  ./deploy/aktualisieren.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull origin main
cd deploy
docker compose up -d --build
echo
echo "Fertig. Stand: $(git log --oneline -1)"
echo "Auf dem Tablet die App ganz schließen und neu öffnen."
