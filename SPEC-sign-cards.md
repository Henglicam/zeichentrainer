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

## Milestones
- **M1** Sign card type + phrasebook meaning: transcript editor, `kind:"sign"`, study layout, review list, T0+T1. Phrasebook (~400 entries) authored in chat with verified pinyin/English. 2 PRs.
- **M2** On-device translation spike: verify model, license, size; time on device; score ten real signs vs. phrasebook. Go/no-go with numbers.
- **M3** Integrate T2 (lazy model download) and/or T3 (opt-in LLM + pending queue).
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
