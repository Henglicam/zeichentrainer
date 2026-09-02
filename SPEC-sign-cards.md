# Sign Cards — specification, draft 1 (2026-09-02)

Photograph a Chinese sign on the street; twenty seconds later it is a flashcard: the sign's picture, its full text, pinyin, and **what the whole sign says** (a complete meaning, not a word-by-word gloss). Builds on PWA v20. All constraints from CLAUDE.md apply unchanged.

## Flow (3 taps + 1 drag)
1. Camera → shutter; photo lands in crop mode (exists).
2. Frame the whole text block; corner handles adjust (exists).
3. **Read sign**: OCR line by line; transcript shown as editable lines so an OCR slip can be fixed before translation.
4. Meaning assembled offline (tiers below); if online translation is enabled and the VPN is up, the full translation arrives automatically, otherwise the card is saved *pending*.
5. **Save sign card**: crop as picture, full photo kept for context.

## Card (new kind `sign`)
Front: sign picture (the crop) + transcribed text wrapped only between dictionary words, reticle ticks only. Back: pinyin, complete meaning, gloss table (word · pinyin · meaning), `unverified` flag until H confirms, tap for the full photo.

## Where the complete meaning comes from (tiers stack)
| Tier | Source | Offline | Size | Quality on signs | Status |
|---|---|---|---|---|---|
| T0 | Word-by-word gloss (CC-CEDICT) | yes | 0 | literal | shipped v20 |
| T1 | **Sign phrasebook** — ~400 formulaic public-sign phrases (禁止停车, 小心地滑, 请勿吸烟 …) with proper English, longest-contained-phrase match; authored in chat | yes | ~40 KB | excellent where it hits; signs are formulaic | proposed · M1 |
| T2 | **On-device NMT** — Bergamot / Firefox Translations zh→en in WASM, cached like Tesseract | yes after one download | ~25–45 MB (to verify) | solid on plain sentences, weaker on idiom | proposed · M2 spike |
| T3 | **Online LLM** (Claude API) through the VPN, text only, opt-in, API key on device | no | 0 | best; natural sentence | proposed · M3 |
| T4 | Chat, paste transcript | no | — | best, manual | exists |

Recommendation: ship T1 first (cheap, offline, covers most street signs), run a T2 spike before committing (availability, license, size, time on the Xiaomi, score on ten real photos), add T3 as opt-in with a pending queue that completes cards when online.
Honesty note: Bergamot zh→en availability/size/license were **not** verified in this session — that is what M2 is for; M1 does not depend on it.

Assembly: T1 longest match per line → unmatched lines: T2 if present else T0 gloss → if T3 enabled and online, whole text (never the photo) sent and reply replaces the meaning → every auto meaning flagged unverified; a Review list shows them.

## Pipeline / UI changes
- Multi-line OCR already works (PSM 6, confidence gate); new: editable transcript before saving.
- Sign mode: frame yields >1 line, or H taps *Read sign* in the crop preview (third button next to *OCR this area* / *Image only*). Word rows remain reachable.
- Study layout for sign cards; Review list in the Add tab; settings row in the footer only if T3 ships (source, API key, *Translate pending* with count).

## Data model
```
{ kind:"sign", c:"本区域禁止违规\n三四轮车停、行驶", p:"Běn qūyù jìnzhǐ …", m:"Parking or driving three- and four-wheeled vehicles … is prohibited in this area.",
  seg:["本区域","禁止","违规","三四轮车","停","行驶"], gloss:[{w,p,m},…],
  mt:{ src:"phrasebook"|"nmt"|"llm"|"chat", verified:false, pending:false },
  img:<blob>, imgFull:<blob>,   // local only, never exported
  t:"Sign" }
```

## Sign-specific rules
- Photos never leave the device; T3 sends transcript text only (stated in the settings row).
- Big downloads are explicit: size warning + progress, into the version-stable `zt-ocr` cache.

## M2 results — on-device translation spike (2026-09-02)

**Verdict: GO for M3, with the base-memory model, delivered via a GitHub Action.**

| Question | Answer | Source |
|---|---|---|
| Does a zh→en model exist? | Yes: Mozilla Firefox Translations `zhen`, variants `base-memory` and `base` | `mozilla/firefox-translations-models`, `models/*/zhen/` |
| License | MPL-2.0 (models and the `@browsermt/bergamot-translator` WASM engine 0.4.9) | repo LICENSE, npm |
| Download size | base-memory: model 32.7 MB + shortlist 4.8 MB + vocab 0.7 MB = **38 MB** gzipped (44 MB in memory); base: 50 MB (59.5 MB in memory); engine WASM 5 MB → **~43 MB one-time** | Git LFS pointers, `metadata.json` |
| Quality | base-memory zh→en **BLEU 27.8 / COMET 0.857** (FLORES-dev). Google 33.0, Microsoft 32.5, NLLB 24.7, OpusMT 23.0, Argos 23.4 on the same set. `base`: 28.8 — not worth +12 MB | `metadata.json`, `evaluation/bleu-results.json` |
| Speed | Proxy measurement (same engine, 17 MB de→en tiny model, headless Chromium on the build machine): cold start incl. WASM + model load **1.7 s**, then **8–44 ms per sign sentence** (median 17 ms). The zh→en base-memory model has ~2.5× the parameters and a Xiaomi mid-range CPU is perhaps 3–5× slower → expect **~5–10 s first load, well under 1 s per sign** afterwards. Not measured on the device — the zh→en binaries are not fetchable from the build sandbox (Git LFS gated) | `scratchpad/m2/run.js` |
| Sample output (de→en proxy) | "In diesem Bereich ist das Abstellen und Fahren von drei- und vierrädrigen Fahrzeugen verboten." → "In this area, parking and driving of three and four-wheeled vehicles is prohibited." — exactly the sign type in scope | harness log |
| Distribution | Mozilla's CDN and GitHub LFS are unreliable from China and unreachable from the build sandbox → **commit the three model files to the repo** (38 MB, under GitHub's 100 MB file limit) via a **GitHub Action** that fetches them from Mozilla's LFS and opens a PR; H triggers it from the phone. Served like the OCR bundle from `vendor/`, cached in `zt-ocr` on first use with a size prompt | this spike |
| Risks | Memory: ~45 MB model + WASM heap on a phone — load the translator in its own worker and free it after use; `useNativeIntGemm` unavailable outside Firefox → plain WASM path, which is what was measured. Quality on terse sign wording (no verbs, abbreviations) will be below FLORES numbers — keep the phrasebook first and show the unverified flag | |

## Milestones
- **M1** Sign card type + phrasebook meaning: transcript editor, `kind:"sign"`, study layout, review list, T0+T1. Phrasebook (~400 entries) authored in chat with verified pinyin/English. 2 PRs.
- **M2** ~~On-device translation spike~~ — done, see results above: GO.
- **M3** Integrate T2: GitHub Action fetches the zh→en base-memory model into `vendor/`, translator worker with lazy download + size prompt, meaning = phrasebook line → NMT for the rest; then T3 (opt-in LLM + pending queue).
- **M4** Polish from field use: layout tuning, phrasebook growth from misses, tone verification pass.

## Acceptance
- H's no-parking sign → frame → Read sign → both lines correct → card with picture, text, pinyin, one-sentence meaning.
- Airplane mode: card saved with T1/T0 meaning marked pending; with T3 enabled it completes when online without a tap.
- Transcript correction updates segmentation, pinyin, meaning consistently.
- Sign cards in SRS wrap by words, never overflow the reticle at 2–3 lines.
- Export has text + meaning, no image bytes; import keeps a local picture.
- Offline test with zero network requests still passes.

## Decisions for H
1. Front: photo + text (recommended) or photo only?
2. Keep an API key on the phone for opt-in online translation? (recommended: yes, opt-in)
3. Accept a one-time ~40 MB download for offline neural translation? (decide after M2)
