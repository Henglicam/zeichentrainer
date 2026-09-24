# 识字 Shízì (PWA)

Chinesische Schriftzeichen von der Straße lernen, mit Spaced Repetition (bis v601: 识字 Zeichentrainer).
Läuft offline, installierbar (Zum Startbildschirm), Fortschritt bleibt dauerhaft (IndexedDB).

## Hosten (Handy, einmalig)
1. GitHub-Account (github.com), neues öffentliches Repo, z.B. `zeichentrainer`.
2. "Add file" → "Upload files" → ALLE Dateien dieses Ordners hochladen → commit.
3. Repo → Settings → Pages → Source: "Deploy from a branch" → Branch `main` / `/ (root)` → Save.
4. Nach ~1 Min: URL `https://<user>.github.io/zeichentrainer/` öffnen (am Handy).
5. Browser-Menü → "Zum Startbildschirm hinzufügen".

## Karten ergänzen
Über die App selbst: Camera → Foto (oder From album) → die Karte entsteht von allein.
Im Repo gibt es kein Kartendeck mehr — der eingebaute Beispieldatensatz (`DECK_BASE`) ist seit v33 weg,
alle Karten liegen auf dem Gerät (IndexedDB) und werden über More → Export gesichert.

## Dateien
`index.html` · `styles.css` · `app.js` · `lang.js` · `manifest.webmanifest` · `sw.js` · `privacy.html` ·
`signs.json` · `nmt-model.json` · `icon-*.png` · `vendor/` (Texterkennung, Wörterbücher, Strichdaten) ·
`supabase/` (Relay und Report) · `tools/` (Skripte für die Vendor-Daten) · `.github/workflows/` — die letzten drei werden nicht aufs Handy geladen
