# CLAUDE.md — 识字 Zeichentrainer

Arbeitssprache: **Deutsch.** Antworte H auf Deutsch. Kurz, direkt, keine übertriebene Höflichkeit.

## Was das ist
Erwachsenen-Zeichentrainer für Chinesisch (Spaced Repetition), Neuinterpretation von 悟空识字 ohne Kinder-Ästhetik.
Nutzer: H, Produktmanager, Beijing, deutschsprachig, **Handy-only (Android/Xiaomi, Chrome, VPN), kein Rechner**.
UI-Sprache: Deutsch. Lerninhalt: Chinesisch + Pinyin + deutsche Bedeutung.

## Live-Deployment
- Repo: `henglicam/zeichentrainer` · GitHub Pages, Branch `main`, Ordner `/ (root)`.
- URL: `https://henglicam.github.io/zeichentrainer/`
- Push auf `main` → Pages baut automatisch (~1–2 Min). `index.html` muss im Repo-Root liegen.
- Die Seite ist **öffentlich** (Free-Plan). Nutzerdaten liegen ausschließlich lokal im Gerät (IndexedDB), nie im Repo.

## Aktueller Stand (v1)
- **Eine Datei:** `index.html` — vanilla JS, CSS + JS inline. Keine Frameworks, kein Build-Step.
- Persistenz: **IndexedDB** (`zeichentrainer`, v1), Stores: `progress` (keyPath `c`), `custom` (keyPath `c`), `inbox` (keyPath `id`).
  Auf Xiaomi im Chrome-Kontext bestätigt: überlebt komplettes Schließen.
- Kamera: `<input type="file" accept="image/*" capture="environment">` → Foto als Blob in `inbox`. Funktioniert.
- Tabs: Lernen (SRS) · Hinzufügen (manuelle Karte) · Kamera (Inbox).
- Noch **kein** Manifest, **kein** Service Worker, **kein** Icon → aktuell nur Browser-Verknüpfung, kein Offline.

## Harte Constraints (im Feld gelernt — nicht verletzen)
1. **Keine externen Abhängigkeiten / CDNs.** Muss offline und hinter der GFW laufen. Nur System-CJK-Fonts.
2. **Alle Pfade relativ** (`./…`). Die App liegt unter einem Subpath (`/zeichentrainer/`).
3. **Persistenz nur via IndexedDB** (localStorage/sessionStorage nicht einsetzen). Bei PWA-Ausbau `navigator.storage.persist()` anfordern — Xiaomi/MIUI räumt Speicher nicht-installierter Seiten aggressiv weg.
4. **Deploy phone-only:** H bedient GitHub nur im Handy-Browser. Änderungen als kleine, klar beschriebene PRs. Möglichst wenige Dateien; Binärdateien (Icons) im Repo erzeugen/committen, nicht H zum Hochladen geben.
5. **Datenschutz-Regel:** Vertraulicher Text (echte Verträge, Lieferanten, Firmen-Interna) darf **nie** ins öffentliche Deck oder Repo. Nur allgemeine Vokabeln. Fotos bleiben lokal auf dem Gerät.

## Design (eingefroren — nur auf Anfrage ändern)
Materialsprache: 漆器 (Lackware) + Siegelrot. Bewusst kein AI-Default-Look.
- Farben: INK `#141410` · PANEL `#1C1C16` · PANEL2 `#232319` · BONE `#EDE6D6` · MUTE `#8C8677` · FAINT `#57544A` · VERM `#B23A2E` · JADE `#7C9A86` · LINE `#2E2E24`
- Fonts: Hanzi = `'Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC','SimSun',serif` · Fließtext = System-Sans · Labels/Daten = Mono
- Signature-Element: Zeichen sitzt im **田字格-Reticle** (260px Quadrat, Rahmen LINE, Eck-Ticks 14px BONE, gestricheltes VERM-Fadenkreuz **nur bei Einzelzeichen**; bei Wörtern nur Ticks). Schriftgröße nach Zeichenzahl: 1→150px, 2→104, 3→74, 4+→58.

## Didaktik / SRS
- Loop: Zeichen/Wort → Aufdecken → Pinyin, Bedeutung, (Kontextwort), Beispielsatz.
- SM-2-light, Grade `again / hard / good / easy` mit Intervall-Vorschau. `again` hängt Karte in dieselbe Session zurück.
- Session = fällige Karten + max. 8 neue. „Vorziehen" zieht künftige vor, wenn nichts fällig.

## Deck-Format
Karten leben in `DECK_BASE` (im Code). Schema:
```
{ c:"坚果", p:"jiānguǒ", m:"Nüsse",
  w:"…", wp:"…", wm:"…",        // optional: Kontextwort + Pinyin + Bedeutung
  ex:"坚果很有营养。", exp:"Jiānguǒ hěn yǒu yíngyǎng.", exm:"Nüsse sind sehr nahrhaft.",  // optional
  t:"Essen" }                   // Thema: Alltag | Vertrag | Optik | Essen | Eigene
```
Regeln: **Pinyin nur geprüft, mit korrekten Tönen — nie raten.** Bedeutungen auf Deutsch. Bei Unsicherheit: markieren statt erfinden.
Neue Wörter kommen aus Fotos (Menüs, Schilder, Verpackungen), Anreicherung via Chat → dann ins Deck.

## Roadmap (Reihenfolge)
1. **PWA-Installation:** `manifest.webmanifest` (start_url `.`, scope `./`, display standalone, Farben INK), `sw.js` (cache-first für App-Shell, relative Pfade, Cache-Version bei jeder Änderung hochzählen), Icons `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (Reticle + 识 in BONE auf INK; programmatisch erzeugen, z.B. Pillow mit Noto Serif CJK). In `index.html`: Manifest verlinken, SW registrieren, `navigator.storage.persist()`.
2. Offline-Betrieb verifizieren.
3. Export/Import des SRS-Fortschritts als JSON (Geräte-Wechsel).
4. OCR v2 (Tesseract.js `chi_sim` oder API) — Chat-Anreicherung bleibt der Qualitätsweg.

## Arbeitsweise mit H
- Build-first. Physische Realität schlägt Spec.
- **Ehrlichkeit vor Zuversicht:** lieber „weiß ich nicht" als raten. Grenzen offen benennen.
- Kleine, überprüfbare Schritte. Bei Unklarheit eine Frage, nicht fünf.
- Bei jeder Änderung: prüfen, dass die App weiterhin ohne Netz-Abhängigkeiten und mit relativen Pfaden läuft.
