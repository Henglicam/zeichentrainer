# CLAUDE.md — 识字 Zeichentrainer

Working language: **English.** Reply to H in English. Short, direct, no excessive politeness.

## What this is
Chinese character trainer for adults (spaced repetition), a reinterpretation of 悟空识字 without the kids' aesthetic.
User: H, product manager, Beijing, **phone-only (Android/Xiaomi, Chrome, VPN), no computer**.
UI language: English. Learning content: Chinese + pinyin + English meaning.

## Live deployment
- Repo: `henglicam/zeichentrainer` · GitHub Pages, branch `main`, folder `/ (root)`.
- URL: `https://henglicam.github.io/zeichentrainer/`
- Push to `main` → Pages rebuilds automatically (~1–2 min). `index.html` must stay in the repo root.
- The site is **public** (free plan). User data lives exclusively on the device (IndexedDB), never in the repo.

## Current state (PWA v11)
- **Files:** `index.html` · `styles.css` · `app.js` · `manifest.webmanifest` · `sw.js` · `icon-192/512/maskable-512.png` · `vendor/` (OCR + dictionaries, ~12 MB). Vanilla JS, no frameworks, no build step.
- **PWA installed and verified on the device:** runs offline (SW cache-first), `navigator.storage.persist()` granted — the footer badge shows the real status.
- **Versioning:** SW cache `zt-vN` in `sw.js` and the header label `PWA vN` in `index.html` move in lockstep. Bump both on **every** change to cached files. Since v9 the app updates itself (update check on load/foreground, auto-reload on `controllerchange`); the big `vendor/` cache (`zt-ocr-v1`) survives shell updates — only bump it when vendor files change.
- Persistence: **IndexedDB** (`zeichentrainer`, v1), stores: `progress` (keyPath `c`), `custom` (keyPath `c`), `inbox` (keyPath `id`). Confirmed on Xiaomi in Chrome: survives a full app kill.
- Camera: `<input type="file" accept="image/*" capture="environment">` → photo normalized (EXIF baked in, max 1600 px) and stored as blob in `inbox`.
- **OCR flow (all offline, `vendor/`):** CROP → draw a frame with a finger → OCR (Tesseract.js 7, `chi_sim`) reads that area → semi-transparent pinyin boxes over the characters (pinyin-pro, word-aware 多音字 handling) → tapping characters composes a word → selection bar shows word + pinyin + **English meaning from CC-CEDICT** → "→ Card" prefills the Add form (marked unverified). → CARD saves the crop as the card image (shown on the card back; stays local, excluded from export).
- Tabs: Learn (SRS) · Add (manual card) · Camera (inbox).
- **Export/import** (footer): progress + custom cards as JSON, file `zeichentrainer-YYYY-MM-DD.json.txt` via the Android share sheet; import validates by content and upserts. Photos and card images stay local.

## Hard constraints (learned in the field — do not violate)
1. **No external dependencies / CDNs.** Must run offline and behind the GFW. System CJK fonts only. Libraries and data go into `vendor/` (licenses in `vendor/LICENSES.txt`).
2. **All paths relative** (`./…`). The app lives under a subpath (`/zeichentrainer/`).
3. **Persistence only via IndexedDB** (do not use localStorage/sessionStorage). `navigator.storage.persist()` is requested — Xiaomi/MIUI aggressively evicts storage of non-installed sites.
4. **Phone-only deploys:** H uses GitHub only in the phone browser. Ship changes as small, clearly described PRs. As few files as possible; generate/commit binaries (icons, vendor data) in the repo, never ask H to upload them.
5. **Privacy rule:** Confidential text (real contracts, suppliers, company internals) must **never** end up in the public deck or repo. General vocabulary only. Photos and card images stay on the device.
6. **Files leave the device only via the share sheet:** programmatic blob downloads (`<a download>`) are silently blocked by Android/MIUI. Use `navigator.share` with a file — and Chrome/Android only shares whitelisted types (`.txt`/`.csv`/images/PDF yes, **`.json` no**), hence the `.json.txt` extension with `text/plain`.

## Design (frozen — change only on request)
Material language: 漆器 (lacquerware) + seal red. Deliberately not the default AI look.
- Colors: INK `#141410` · PANEL `#1C1C16` · PANEL2 `#232319` · BONE `#EDE6D6` · MUTE `#8C8677` · FAINT `#57544A` · VERM `#B23A2E` · JADE `#7C9A86` · LINE `#2E2E24`
- Fonts: Hanzi = `'Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC','SimSun',serif` · body = system sans · labels/data = mono
- Signature element: the character sits in a **田字格 reticle** (260px square, LINE border, 14px BONE corner ticks, dashed VERM crosshair **only for single characters**; words get ticks only). Font size by character count: 1→150px, 2→104, 3→74, 4+→58.
- The crop frame must stay visible on any photo color: bright dashed edge, dimmed outside (red-on-red lesson).

## Didactics / SRS
- Loop: character/word → reveal → pinyin, meaning, (context word), example sentence, (card image).
- SM-2 light, grades `again / hard / good / easy` with interval preview. `again` re-queues the card within the same session.
- Session = due cards + max. 8 new ones. "Pull forward" pulls future cards when nothing is due.

## Deck format
Cards live in `DECK_BASE` (in code). Schema:
```
{ c:"坚果", p:"jiānguǒ", m:"nuts",
  w:"…", wp:"…", wm:"…",        // optional: context word + pinyin + meaning
  ex:"坚果很有营养。", exp:"Jiānguǒ hěn yǒu yíngyǎng.", exm:"Nuts are very nutritious.",  // optional
  t:"Food" }                    // theme: Everyday | Contract | Optics | Food | Custom
```
Custom cards may additionally carry `img` (blob, local only, never exported).
Rules: **Pinyin only verified, with correct tones — never guess.** Meanings in English. Auto pinyin (pinyin-pro) and auto meanings (CC-CEDICT) from OCR are prefills marked unverified — verify via chat before relying on them. When unsure: flag it instead of inventing.
New words come from photos (menus, signs, packaging); chat enrichment remains the quality path.

## Roadmap
Done and verified on the device: ~~1. PWA install~~ · ~~2. offline operation~~ · ~~3. export/import as JSON~~ · ~~4. OCR v2 (crop-first flow, pinyin overlay, tap-to-select, CC-CEDICT meanings, card images)~~ (as of 2026-09-01).

Open: nothing scheduled. Candidate next steps: better crop handles (resize instead of redraw), stroke-order animations, HSK tagging.

## Working with H
- Build-first. Physical reality beats spec.
- **Honesty over confidence:** better "I don't know" than a guess. Name limits openly.
- Small, verifiable steps. When unclear: one question, not five.
- On every change: confirm the app still runs with no network dependencies and relative paths, and bump both version markers.
