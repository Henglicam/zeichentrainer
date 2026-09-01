# 识字 · Zeichentrainer (PWA)

Standalone Chinesisch-Zeichentrainer mit Spaced Repetition.
Läuft offline, installierbar (Zum Startbildschirm), Fortschritt bleibt dauerhaft (IndexedDB).

## Hosten (Handy, einmalig)
1. GitHub-Account (github.com), neues öffentliches Repo, z.B. `zeichentrainer`.
2. "Add file" → "Upload files" → ALLE Dateien dieses Ordners hochladen → commit.
3. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch `main` / `/root` → Save.
4. Nach ~1 Min: URL `https://<user>.github.io/zeichentrainer/` öffnen (am Handy).
5. Browser-Menü → "Zum Startbildschirm hinzufügen".

## Karten ergänzen
Nur `app.js` bearbeiten (Array `DECK_BASE`) und neu hochladen. Nach Reload sind sie da.

## Dateien
index.html · styles.css · app.js · manifest.webmanifest · sw.js · icon-*.png
