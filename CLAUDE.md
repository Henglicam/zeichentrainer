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

## Current state (PWA v28)
- **Files:** `index.html` · `styles.css` · `app.js` · `manifest.webmanifest` · `sw.js` · `signs.json` · `nmt-model.json` · `icon-192/512/maskable-512.png` · `vendor/` (OCR + dictionaries ~12 MB, `vendor/nmt/` Bergamot engine 5 MB + zh→en model 38 MB once the action has run) · `.github/workflows/fetch-nmt-model.yml`. Vanilla JS, no frameworks, no build step.
- **PWA installed and verified on the device:** runs offline (SW cache-first), `navigator.storage.persist()` granted — the footer badge shows the real status.
- **Versioning:** SW cache `zt-vN` in `sw.js` and the header label `PWA vN` in `index.html` move in lockstep. Bump both on **every** change to cached files. Since v9 the app updates itself (update check on load/foreground, auto-reload on `controllerchange`); the big `vendor/` cache (`zt-ocr-v1`) survives shell updates — only bump it when vendor files change.
- Persistence: **IndexedDB** (`zeichentrainer`, v2), stores: `progress` (keyPath `c`), `custom` (keyPath `c`), `inbox` (keyPath `id`), `settings` (keyPath `k`; opt-ins such as `nmt`). Confirmed on Xiaomi in Chrome: survives a full app kill.
- Camera: `<input type="file" accept="image/*" capture="environment">` → photo normalized (EXIF baked in, max 1600 px) and stored as blob in `inbox`.
- **OCR flow (all offline, `vendor/`):** taking a photo lands directly in crop mode → draw a frame (corner handles resize, dragging inside moves, confirmation preview below) → "OCR this area" (Tesseract.js 7, `chi_sim`, PSM 6, symbols under confidence 35 dropped) → semi-transparent pinyin boxes over the characters (pinyin-pro, word-aware 多音字 handling); recognized lines are **segmented into CC-CEDICT words** (greedy longest match) — tapping one character selects the whole word, a single-line frame comes fully pre-selected → selection bar: when several words are selected a **phrase row** on top saves the complete string as ONE card (pinyin whole string, meaning composed word by word: `本 this · 区域 area · …`), plus **one row per word** below, each with **Save** (stores word/pinyin/meaning/image in one tap, stays on the photo; no dictionary meaning → routes to the form) and "Edit…" (opens the Add form). Card fronts wrap long strings (font 58/44/34 px by length). Card image: the OCR frame or the full photo (toggle, sticky per session; shown on the card **front** above the reticle — the photo is the cue; stays local, excluded from export).
- **Sign cards (M1 of `SPEC-sign-cards.md`):** crop preview has a third action **Read sign** → OCR line by line → editable transcript (fix OCR slips before anything is translated; pinyin/meaning recompute live) → **Save sign card**. Meaning tiers: `signs.json` **phrasebook** (curated public-sign phrases `[zh, py, en, cat]`, longest-contained match per line; shell-cached) → dictionary gloss for the rest; `mt.src` records `phrasebook`|`gloss`, `mt.verified` starts false. Card kind `sign`: `c` = lines joined with `\n`, `segs` per line for wrapping, `gloss` list, `img` (crop) + `imgFull` (context), theme `Sign`. Study: picture + text on the front, pinyin / meaning / gloss table / unverified flag / context photo on the back. Add tab shows a **Review** list of unverified cards with CONFIRM.
- Tabs (bottom navigation): Learn (SRS) · **Cards** (library) · Camera (inbox) · More (export / import / storage status / reset / about).
- **Cards library:** every entry (custom first, then base deck) with photo thumbnail or glyph tile, pinyin, meaning, sign/custom pill and SRS status (new / due / in N d); search over hanzi, pinyin, meanings and context words; "Unverified" filter chip; **+ New** opens the Add form. Tap an entry → detail (front + back preview, SRS stats) with **Test this card** (single-card study; grading updates progress and returns to the card, the session queue is restored), **Edit** (pinyin, meaning, context word, example, image removal, and — for custom cards — the **Chinese text itself** (OCR slips): progress, images, queue entries move to the new key, pinyin/segmentation/gloss are recomputed unless pinyin was edited by hand; base-deck text stays fixed; editing marks `mt.verified`) and **Delete** (custom only). Editing a base-deck card stores a **local override** in `custom` with the same key — `deck()` lets custom entries override base cards.
- **Offline translation (M3 part 1, v26):** Firefox Translations zh→en `base-memory` model (Mozilla, MPL-2.0) running in the Bergamot WASM engine (`vendor/nmt/translator-worker.js` + `bergamot-translator-worker.{js,wasm}`, from npm `@browsermt/bergamot-translator` 0.4.9, no SharedArrayBuffer needed). The gzipped model files are fetched by the **GitHub Action "Fetch zh→en translation model"** (workflow_dispatch) from **Mozilla Remote Settings** (collection `translations-models`, the source Firefox itself uses; newest version, smallest architecture; sha256 checked; single `vocab` or `srcvocab`+`trgvocab` both supported) — the Git LFS objects in `mozilla/firefox-translations-models` are gone from GitHub (410) and the build sandbox cannot reach Mozilla at all. The action writes the manifest, bumps both version markers and opens a PR from branch `nmt-model`. Manifest `./nmt-model.json` in the shell cache (placeholder `available:false` until the action runs → More tab says "not in this build yet"). Opt-in: More → Translation → **Enable** (size prompt, ~38 MB, cached in `zt-ocr-v1`), setting `nmt`. Sign flow: meaning tiers phrasebook → offline translation → word gloss; `signMeaning(lines)` returns `{m, src: phrasebook|nmt|gloss, pending}`; cards with only a gloss meaning get `mt.pending:true` and **Translate pending** in More completes them once the model is on. The transcript editor shows the translation live (async, token-guarded). Engine facts from M2: BLEU 27.8, ~1.7 s cold start on the build machine, ms per sentence.
- **Less chrome while learning (v27, H's request):** the study front has no tag row (theme / new / custom) and no Reveal button — **tapping the photo or the character reveals** (`#reveal` wraps the front; hint line "Tap the character to reveal"). Cards list rows show only the ⚑ review pill and the real SRS status (`due` in VERM, `in N d`; nothing for unstudied cards) — no custom/sign/new labels.
- **Online AI review (T3, v28, opt-in):** More → Online AI review → **Set up**: Claude API key (settings store, device only), model (default `claude-sonnet-5`), checkbox "complete pending translations automatically when online". **Ask AI about N cards** sends the queue (flagged cards + sign cards with `mt.pending`) in ONE request to `api.anthropic.com/v1/messages` (browser header `anthropic-dangerous-direct-browser-access`), text only: hanzi, pinyin, meaning, note, gloss — never photos. Reply = JSON array → stored as `ai:{zh,p,m,note,ok,at,model}` on the card (base cards → local override). Suggestion box (jade) on the card detail and the study back with **Accept** (applies pinyin/meaning, renames the card if the OCR text was fixed via `applyCardUpdate`, clears flag, `mt.src:"llm", verified:true`) or **Dismiss**. Cards list: jade `AI` pill; the Review chip counts flagged + suggested cards. `applyCardUpdate(c,upd,newC,pinByHand)` is the shared rename/persist helper (also used by the Edit form). Needs the VPN; errors are shown in the row (key rejected / no connection).
- **Review flag (v25):** any card (custom or base) can be marked **⚑ Flag for review** when the OCR text, pinyin or meaning looks odd and someone should check it (teacher; later possibly an online model). Toggle on the study back, in the card detail, or via checkbox + optional note in the Edit form. Stored as `flag:true` / `flagNote` on the card record (base cards get a local override in `custom`, same as edits). Cards list: red `⚑ review` pill on the row and a **Review (N)** filter chip next to **Unverified (N)**; the flag is included in export. More tab: **Flagged cards → Share** sends a plain-text list (hanzi / pinyin / meaning / note) via the share sheet, `.txt`, so it can go to a teacher by WeChat/mail.
- **Export/import** (More tab): progress + custom cards as JSON, file `zeichentrainer-YYYY-MM-DD.json.txt` via the Android share sheet; import validates by content and upserts. Photos and card images stay local.

## Hard constraints (learned in the field — do not violate)
1. **No external dependencies / CDNs.** Must run offline and behind the GFW. System CJK fonts only. Libraries and data go into `vendor/` (licenses in `vendor/LICENSES.txt`).
2. **All paths relative** (`./…`). The app lives under a subpath (`/zeichentrainer/`).
3. **Persistence only via IndexedDB** (do not use localStorage/sessionStorage). `navigator.storage.persist()` is requested — Xiaomi/MIUI aggressively evicts storage of non-installed sites. The SW must **never cache non-OK responses** — a 404 cached during a deploy window poisoned the dictionary permanently once; `loadDict` additionally heals such entries.
4. **Phone-only deploys:** H uses GitHub only in the phone browser. Ship changes as small, clearly described PRs. As few files as possible; generate/commit binaries (icons, vendor data) in the repo, never ask H to upload them.
5. **Privacy rule:** Confidential text (real contracts, suppliers, company internals) must **never** end up in the public deck or repo. General vocabulary only. Photos and card images stay on the device.
6. **Files leave the device only via the share sheet:** programmatic blob downloads (`<a download>`) are silently blocked by Android/MIUI. Use `navigator.share` with a file — and Chrome/Android only shares whitelisted types (`.txt`/`.csv`/images/PDF yes, **`.json` no**), hence the `.json.txt` extension with `text/plain`.

## Design (material language frozen; mobile treatment updated 2026-09-02 on H's request)
Material language: 漆器 (lacquerware) + seal red. Deliberately not the default AI look.
- Colors: INK `#141410` · PANEL `#1C1C16` · PANEL2 `#232319` · BONE `#EDE6D6` · MUTE `#8C8677` · FAINT `#57544A` · VERM `#B23A2E` · JADE `#7C9A86` · LINE `#2E2E24`
- Fonts: Hanzi = `'Songti SC','STSong','Noto Serif CJK SC','Source Han Serif SC','SimSun',serif` · body = system sans · labels/data = mono
- Signature element: the character sits in a **田字格 reticle** (260px square, LINE border, 14px BONE corner ticks, dashed VERM crosshair **only for single characters**; words get ticks only). Font size by character count: 1→150px, 2→104, 3→74, 4–8→58, 9–12→44, 13+→34; phrase fronts wrap only between words.
- **Readability (v25):** body 17px; labels/hints/list heads are sans 13px medium in `--text2 #B9B19E` (mono is reserved for pinyin and numbers, no more uppercase-mono captions); meanings on the card back 18px BONE; tab labels 12px sans; pills/chips rounded sans; all UI copy uses plain words and parentheses instead of `·` shorthand. Top bar shows Due/Done on Learn and Deck on the other tabs (three pills overflow at 390px).
- **Mobile treatment (v22):** sticky, blurred top bar (logo + `PWA vN` + stat pills, DUE/DONE only on Learn) · **bottom tab bar** in thumb reach with line icons (active icon in VERM) · radius 12px on cards/buttons/inputs, 10px on images · touch targets ≥ 44px (mini buttons 44, grades 58, round `ocr-btn` pills 38) · one-line hints instead of paragraphs · inputs 16px to avoid zoom · safe-area padding top/bottom · `-webkit-tap-highlight-color: transparent`, visible `:focus-visible` in JADE.
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
Custom cards may additionally carry `img` / `imgFull` (blobs, local only, never exported); sign cards add `kind`, `segs`, `gloss`, `mt`.
Rules: **Pinyin only verified, with correct tones — never guess.** Meanings in English. Auto pinyin (pinyin-pro) and auto meanings (CC-CEDICT) from OCR are prefills marked unverified — verify via chat before relying on them. When unsure: flag it instead of inventing.
New words come from photos (menus, signs, packaging); chat enrichment remains the quality path.

## Roadmap
Done and verified on the device: ~~1. PWA install~~ · ~~2. offline operation~~ · ~~3. export/import as JSON~~ · ~~4. OCR v2 (crop-first flow, pinyin overlay, tap-to-select, CC-CEDICT meanings, card images)~~ (as of 2026-09-01).

Open: run the model action and merge its PR (M3 part 2); verify T2/T3 on the device; M4 field polish per `SPEC-sign-cards.md`. Idea from H (2026-09-02): the review flag queue could also be checked by an online AI (opt-in, text only, never photos or confidential text) — fits the M3 online path. Later candidates: stroke-order animations, HSK tagging.

## Working with H
- Build-first. Physical reality beats spec.
- **Honesty over confidence:** better "I don't know" than a guess. Name limits openly.
- Small, verifiable steps. When unclear: one question, not five.
- On every change: confirm the app still runs with no network dependencies and relative paths, and bump both version markers.
