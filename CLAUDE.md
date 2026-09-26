# CLAUDE.md — 识字 Shízì

Working language: **English.** Reply to H in English. Short, direct, no excessive politeness.

## Where the history is — read it before you change a rule

This file is the **consolidated current state and the binding rules**. The full record of how
we got here — every version from v1 to v598, with the measurements, the rejected alternatives
and H's own words — is in **`docs/HISTORY.md`** (1.5 MB, not loaded automatically).

It was `CLAUDE.md` until 2026-09-21, when it had grown to ~400k tokens and was loaded into
every turn, which broke the session with "Prompt is too long". Nothing was deleted; it was
archived verbatim. **Grep it whenever you need the reason behind something:**

    grep -n "v487" docs/HISTORY.md              # what one version did and why
    grep -n "snapBox" docs/HISTORY.md           # every decision that touched one mechanism
    grep -n "Measured and dropped" docs/HISTORY.md   # what was tried and must not come back
    grep -n "Rejected" docs/HISTORY.md          # what H turned down

**Much of what looks like an obvious improvement was already built, measured and reverted,
with H's verdict recorded next to it.** Check before you propose it again.

**Keeping the record (the rule that replaces the old one):** every PR appends its entry to the
**top of the version log** in `docs/HISTORY.md` — the same prose as before, the reason and the
measurement — and updates **this file's "Current state" and the affected section** in the same
PR. This file is consolidated state, **never a version log**; it must not grow past ~40 KB.
When a section here goes stale, rewrite it; the old wording lives in the archive.

## What this is
Chinese character trainer for adults (spaced repetition), a reinterpretation of 悟空识字 — **识字 Shízì** (识字 Zeichentrainer
until v601, 街字 Jiēzì v601–v607),
without the kids' aesthetic.

**The rule (H, 2026-09-14): "Flash cards are for learning and multi cards are for looking up
stuff."** A flashcard is studied — it has a progress row, a due date, a grade, a star, a place
in Learn and in the Deck count. A multicard (a page card, v453) and its own texts are looked
up — nothing on them is studied, counted, scheduled or graded, and the only thing a multicard
text can do is generate a separate flashcard (v487). Every control, label, count and filter is
judged against that one sentence; **a later change that puts a learning word or a learning
control on a multicard, or a look-up-only surface on a flashcard, is wrong by construction.**

User: H, product manager, Beijing, **phone-only (Android/Xiaomi, Chrome, VPN), no computer**.
UI language: English (ten languages shipped). Learning content: Chinese + pinyin + meaning.

## Live deployment
- Repo `henglicam/zeichentrainer` · GitHub Pages, branch `main`, folder `/ (root)`.
- `https://henglicam.github.io/zeichentrainer/` · push to `main` → Pages rebuilds (~1–2 min).
  `index.html` must stay in the repo root.
- The site is **public**. User data lives only on the device (IndexedDB), never in the repo.
  What the app sends on its own: **the text of every new card** (the AI review is on by default
  and works through the owner's relay with no key, v191/v193 — and when the reading is hard, a
  picture of the text, sometimes the whole photo, v173/v348/v393) and the daily anonymous usage
  row (v170). Each is switchable under More; **`privacy.html` is the authoritative list.**
- **Deploy discipline (broken twice, cost a reload storm at v563):** `APP_V` in `app.js`,
  `PWA vN` in `index.html` and `zt-vN` in `sw.js` are **one number**, bumped on every change to
  a cached file. Check all three with grep before merging. **One version number per deploy, not
  per feature** (v426: three PRs on one number left two undeployed — the worker only installs
  when `sw.js` differs byte for byte). Leave **more than ten minutes** between merges (Pages
  sends `max-age=600`). Files no phone fetches — `CLAUDE.md`, `docs/`, `supabase/`, `tools/` —
  need **no** bump; bumping costs every phone a shell re-download for nothing.

## Current state (PWA v652, 2026-09-26)
**The app is called 识字 Shízì** (v608, H: "Return the name to shizi", then "识字 Shízì" over the full v600 name; v601–v607
it was 街字 Jiēzì, and Zeichentrainer stays dropped). The title, manifest `name`/`short_name` (识字 Shízì / 识字), header
logo, About, share text, `privacy.html`, the owner's dumps and every shared file (`shizi-YYYY-MM-DD.json.txt`,
`shizi-progress.png`, …) carry it; the three icons are v600's own 识 files. **What must keep the old name, because
renaming it breaks installed copies:** the repo, the URL `/zeichentrainer/`, the mirror path, IndexedDB
`zeichentrainer`, the `zt-vN` caches and the export's `app:"zeichentrainer"` format marker (every backup — zeichentrainer-,
jiezi- or shizi- — imports). Not yet field-checked: Android swaps a home-screen icon and name only when Chrome re-checks
the manifest, which can take a day.

**Recent state worth carrying in the head** (each has its full entry in the archive):
- **v620–v636** — a **multicard's regions snap onto their texts** at display (`snapRegion`, memory only), never on a frame over half the photo or shared with another text (v628). Texts fall back to the whole picture because the model's label boxes are a drawing and the reader names only some labels; a measuring grid (v629–v630) and faster Qwen models (v631–v633, not on H's Token Plan) were tried and removed — see the archive. **Owner tools → Zoom check** (Run, Share, Data, Paddle) shares the newest 24 cards and 8 multicards as one PDF with the full photos, reading records and AI replies (v627). Multicards zoom like cards (v634) and take **Add a text** (v635).
- **v637–v638** — **PaddleOCR on the phone** (`pdRead`, `vendor/paddle/`, ~30 MB loaded once on first use; since v642 in a worker of its own, `pdWorkerMain` — on the page it froze the first multicard swipe of a session for 633 ms): on H's phone 93 of 103 multicard texts named at 1.8 s a photo. Since v638 it **places a multicard's labels**: at the split (`pdMatch`, one to one, before the old label search, which only adds places; since v643/v644 a text left over may take two lines stacked or side by side, and one the reader cannot find takes the AI's box once `aiBoxCal` has checked the AI's boxes against the reader's on that photo — 227 of 227 texts on H's 24 multicard photos) and when an older multicard is shown (`refineShot`: a text with the whole picture or a shared frame takes its line). Owner tools → Zoom check → **Paddle** measures it. **Owner tools → Re-read all** (v645) runs every photo of the deck through today's real pipeline into a report (`shizi-reread.txt`) and changes no card (`RRPH` placeholders in memory; `finishPending`/`failPending` hand off to `rrFinish`). **Owner tools → Check texts** (v650) asks the picture model, one call per photo, which characters of each card's text are not on its photo and flags those cards "Not on the photo: …" (H's rule: no text that is not visible; pre-v611 cards invented 早 of 早日退休 and 盒马鲜生). **Owner tools → Rebuild all** (v651) replaces every photo's cards with what today's reading makes, through the camera's own save (`rbOne`); history, star and tags follow by text or one-to-one; the old cards sit in `rb:<shot>` settings rows for **Undo** and for `rbRecover` after a kill — the boot's orphan-progress sweep spares them. On a multicard photo only the multicard and its texts are replaced (v652; v651 dropped the photo's own flashcards, and `rbRepair` put them back once). Since **v639** it is also **one more pass of every reading** (whole straightened frame, started beside the quick look, exempt from `lineFit`/`sizeFitOf`): on H's 17 card pictures, AI off, characters found 17 → 44 %. Since **v641** a **sure** Paddle reading (≤ 2 lines, ≥ 2 characters, every one ≥ `PD_SURE` 95 %, and Paddle's own raw detection sees ≤ 2 Chinese lines) is the reading: no close look, the card in seconds — and since **v646** the picture goes to the AI beside it (`SURECHK`/`sureCheck`): a different answer flags the card (H chose this over accepting the ~3 % wrong characters his Re-read of 521 photos found), and since **v652** the card **takes the AI's reading**, the reader's kept in the note and first among `alts` (the sure path is not worse than the others — 6 % flagged against 7–8 % — so the shortcut stays; the default changed). Since **v648** a sure reading whose picture already went out at the quick look (`picEarly`) is checked with that answer — before, it was checked by nothing (良品 read 一品). `pdAsPass` keeps a Latin stretch of up to five letters inside a Chinese line (D座, AI, 24H, SOHO B — v647), cuts fine print at the AI's third, drops strays and repeated lines (v646); the check compares characters and digits (`sureKey`, v647). Turning right-to-left signs round by the dictionary was measured and dropped (v647: 蜜雪冰城 scores higher backwards).
- **v617–v619** — the Learn photo **zooms onto the character being written** (`autoZoom`); `charBoxes` searches the layout (v619: which ink lines carry the card's characters, horizontal or vertical, by pitch fit, a size prior and the card's own breaks) and cuts each line into exactly its characters (DP on least-ink cuts); judged on H's own photos: **v626**, on his full-size Zoom data, makes a line sure only when every character's ink is character-shaped (aspect 0.62–1.7, not solid) and their widths agree within 1.5×, and drops solid bands — 43 of 124 sure, all right by eye (was 58 with ~12 wrong: a tight zoom on the wrong spot is the worse failure); only while the pad shows the character (levels 1–2); Diagnostics logs every decision and **Owner tools → Zoom check** shares the boxes drawn on H's newest 24 photo cards.

## Files
`index.html` · `styles.css` · `lang.js` (ten language columns) · `app.js` ·
`manifest.webmanifest` (with the `share_target`) · `sw.js` · `privacy.html` (the Play Store's
privacy page, not in the shell) · `signs.json` (phrasebook) · `nmt-model.json` ·
`icon-192/512/maskable-512.png` · `guide/` (seven real crops of the app, light and dark, 113 KB of
WebP: the guide's five figures plus the two sample cards `front` and `pcard`, which sit inside a
drawn figure; shell assets, regenerated by `tools/guide-shots.js`) ·
`vendor/` (Tesseract + simplified and traditional readers +
dictionaries + OpenCC tables + stroke medians `strokes.txt.gz` 2.4 MB and Kai outlines
`outlines.txt.gz` 7.3 MB, ~23 MB total; `vendor/paddle/` PaddleOCR PP-OCRv4 + onnxruntime-web ~30 MB, loaded on use (v637); `vendor/nmt/` Bergamot 5 MB + zh→en model 50 MB;
licences in `vendor/LICENSES.txt` with `vendor/ARPHICPL.TXT` beside it) ·
`.github/workflows/fetch-nmt-model.yml` · `.github/workflows/purge-mirror.yml` ·
`SPEC-sign-cards.md` · `SPEC-flashcard-layout.md` · `SPEC-photo-mode.md` (each carries a dated
status note; all three are designs as they stood before their build and are contradicted in
places by what shipped) · `README.md` · `tools/cedict-readings.py` · `tools/guide-shots.js` · `docs/HISTORY.md` ·
`supabase/` (**not shipped to the phone**: `functions/ai-relay/index.ts`,
`functions/usage-report/index.ts`, and `relay.sql`, `report.sql`, `feedback.sql`,
`feedback-shot.sql`, each run once by H in the SQL Editor).

Vanilla JS, no frameworks, **no build step**. `app.js` in reading order: helpers and state →
IndexedDB → online AI → study screen → cards, detail, edit form → More → camera and inbox →
reading pipeline → character picker and drawing sheet → sign editor and save → service worker,
mirror, shell check, shared screenshots. Shared helpers: `askSheet`, `putCard`, `pySpaced`,
`eachLine`, `slineHTML`/`wireSlines`, `urlOf`, `fullPhoto`, `median`, `readingStatus`,
`logErr`/`diagText`, `busyHTML`, `apiErrText`.

## Persistence and deck format
IndexedDB `zeichentrainer` v3 — `progress` (key `id`), `custom` (all cards, key `id`), `inbox`
(photos), `settings` (key `k`). **Never localStorage/sessionStorage.** `navigator.storage
.persist()` is requested (MIUI evicts non-installed sites). The SW must **never cache a non-OK
response** (a cached 404 poisoned the dictionary permanently once).

`deck()` is `S.custom` sorted by `at` (oldest first; the Cards list shows newest first).
**The key is an id, not the text** (v118): `cardId(c)` = the text while free, else text + `#` +
timestamp. A card:

```
{ id, c:"坚果", p:"jiānguǒ", m:"nuts", t:"Custom"|"Sign", at, v:<build that made it>,
  seg:["坚果","\n","供应"],   lb:"photo"|"auto",       // word breaks + the photo's line breaks
  kind:"sign", segs, gloss:[{w,p,m}],                  // sign cards
  shot:"shot_…", img:<crop Blob>, imgFull:<only when the inbox photo is gone>,
  frame:{x,y,w,h,a},                                   // fractions of the photo; Crop again starts here
  tags:[…], star:true, flag:true, flagNote, unchecked:true,
  trad:"養樂多", simp:true, ml:"de", ms:{en,de}, ds:{en,de},       // script (simp: learned in simplified, v604), meaning language, meanings, descriptions
  alts:[…], ai:{zh,p,m,note,ok,bad,at,model}, aiNo:"<fingerprint of a dismissed suggestion>",
  mt:{src:"llm"|"dict"|"phrasebook"|"nmt"|"gloss", verified, pending, suspect},
  reading:{rect,at,failed},                            // saved before its reading finished
  page:"page#…",                                       // this card is one text of a multicard
  from, fromT, of }                                    // a flashcard generated from a multicard text
```

A **page card / multicard** (v453): `{id:"page#<at>", kind:"page", t:"Page", c:<title>,
name:{name,what,place}, ml, at, shot, items:[ids], tags:[kind], mt llm-verified, v}` — no `img`,
no progress row, never sent to the AI, **not in the Deck count** (v504).

**Pinyin only verified, with correct tones — never guess.** Meanings in the app's language.
Dictionary/phrasebook prefills stay `verified:false` until a human or the AI checked them; when
unsure, flag rather than invent. New words come from photos.

Export/import: progress + cards as JSON, `shizi-YYYY-MM-DD.json.txt` (`zeichentrainer-…` until v601, `jiezi-…` v601–v607; the filename is never read) through the share
sheet; import upserts by `id`. Photos ride along as base64 behind a checkbox (v166). **The export
duplicates a shared photo once per card** — named, not fixed.

## The app

**Tabs:** Learn · Cards · Camera · More; the app opens on **Learn** (a start screen was built at
v181 and reverted at v183 — do not bring it back unasked). The Camera tab always opens at the top.

### Learn — the write pad (v512 replaced tap-to-reveal and the grade buttons)
The study card is a CSS grid whose **frame never moves for the content** (v560 — the rule that
makes it read as professional): the cue and the pad are **two equal squares** (v561; the photo is as wide as the pad since v607), then the
fold row. `fit()` computes the frame per device, not per card, and re-fits on every resize and
after the layout settles (v521/v532).

- **The cue has two states and a tap swaps them** (v580): the photo big, or the whole text big.
  `S.cueBig` is `"pic"` or `"txt"` and never null; a card opens on the photo (v572) and the state
  survives every stroke and every swipe (v568's rule: what the learner made big stays big).
  A card with no photo of its own draws its own word where the photo would be (v578).
- **The pad is Duolingo-style tracing** (`mountPad`): the character's medians stand as a grey
  template with the next stroke lit; a stroke that fits snaps into ink, one that does not
  **shakes and is gone** (v592). Three levels by `charWrites[ch]` (trace / faint template /
  empty pad). Two misses offer **Show me**, four offer **Skip**, which fills the character in and
  grades the card `again`. The template is the real Kai outline (`outlines.txt.gz`, v517).
- **The grade is the writing.** The last stroke of the last character writes the review through
  `recordGrade`, counts the points (**one point per character written without help**, v546),
  bumps `charWrites`, and queues the card **once more `REP_GAP` 3 cards on** (a repeat pass).
  A swipe, a chevron or a tab tap grades nothing.
- **After each character** its own reading stands over the pad for `CHAR_MS` 900 ms with the
  character's meaning under it (v553/v571); the **last** character gets one too, then the whole
  card's recap — the reading (the card's own `d.p`, grouped by word, v616) and the meaning, no characters (v577) — for `recapMs(d)`
  (`NEXT_MS` 3200 + `RECAP_SYL` 230 a syllable past the second, capped `RECAP_MAX` 5300 — v597
  took a flat 300 ms off the floor and the cap, so every length is 300 shorter). The reading is set as
  large as it fits, **measured** by `recapFit` rather than estimated (v600). A tap skips. The star flies out of the recap into the counter at `recapMs − POP1`; a milestone
  (50/100/250/500/1000 points, or a 7/30/100-day streak) bursts (v545).
- **The word line** sits between the tiles and the pad, in the **text** state only — in the photo state
  `--th` is 0 and it is clipped away with the tiles (v580; it was "under the pad, always there" until then,
  and this file said so until v600). It reads the character being written with its in-word reading, then
  its word (v518/v527/v540), and **wraps onto as many lines as it needs** (v600) — a parenthetical is
  stripped from that line only (`shortSense`); the card keeps the whole sentence.
- **"Whole card"** folds open at the card's foot — the characters, pinyin, meaning **and the
  description** (v585), fetched by itself 1.2 s after the card appears (v586, `explainSoon`).
- **The word being written is marked on the photo** (v533; **switched off by `SPOT_ON` since v602**, code intact), derived from the frame rather than
  stored, travelling with a pinch and with the fold (v541/v575).
- **The photo zooms onto the character being written** (v617, `ZOOM_AUTO`): whole at the card's start, in on the pad's first
  touch, on to each next character on a glide, out for the recap. **Only while the pad shows the character** (level 1–2 or no
  template) — at level 3 the photo stays whole, or recall would become copying (H's "(b)"). The place is found on the ink
  by `charBoxes` (v619: the layout searched over the ink lines, each cut into its own character count; tight `AZ_INK` when
  the box is sure, loose `AZ_EST` otherwise, cap `AZ_MAX` 3.5); the frame only says where to look. The
  zoom is `auto`: one finger still swipes; a pinch makes it the hand's (`ZOOM_HAND`) and it then only follows.
- **Swipe** = the carousel of v417: the neighbour rides in beside the card and snaps; it grades
  nothing, and a skipped card stays due for next time. On a **zoomed** picture the one-finger drag pans, and pulling on past
  the picture's edge hands the stroke to the swipe (v606).

### Cards
Square photo tiles, two a row, the card's picture with the blurred fill behind it and **nothing
written under them** (v593); a text-only card draws its whole text in the picture area (v506).
On the picture: the star (v425, one tap while scrolling, never a re-render), the flag and AI
marks, and — on a multicard — the stack of plates, the count chip and the progress bar (v461/v465),
which is what makes a multicard unmistakable. **A multicard's tile is square too since v597**: its
bar is the picture's own bottom edge and its title sits on the picture over a gradient scrim, still
clamped to two lines with an ellipsis, so the whole deck is one grid of squares. **Two tabs, Cards and Multicards** (v477); the
filter is **one pill and a sheet** with several rows at once (v365/v366). A long press starts the
marking (v354); the list keeps its place when a card is opened and closed (v352/v445).

The **open card** follows the study card's own order (v531) and is swipeable through the list
(v445). Actions: Test this card · Edit | Star · Flag | Delete. A **multicard's own text** gets
Edit, Flag and Delete and nothing else (v498) — no Test, no Star, no schedule, no state pill. The multicard itself: **Add a text** and Delete card (v635).

### Camera — photo to card
The Camera tab is the camera: with nothing being worked on, the **shutter card** with Take photo
and From album sits centred; work appears under it (v466/v470). A photo that made its card
**leaves the tab** (v471). From album queues the batch and works through it one at a time while
the app is open (v411) — the background is not available on the web and a TWA does not change it.

**A photo becomes a card by itself** (v325): no frame, no preview — the photo with a light band
sweeping across it, then the finished card with Edit and Delete. Save now (v237) makes the card
before the reading is done; Crop (v437) hands the app's own frame to the hand; Crop again (v239)
does the same from the Edit form. A photo whose texts stand apart becomes **one multicard** for
the whole picture with a dot on every text (v448/v453/v457); each region is snapped onto its text's ink when shown (v620). The multicard's photo pinches, pans and hands off to the swipe like a card's (v634; a tap while zoomed finds its region by the point, `regionAt`). **Add a text** (v635) frames a missing text on a multicard's photo through the Edit form's Crop again; a blank never read is dropped on Cancel, a tab tap or a restart.

### More — four sections (v547)
**Learning** (Progress, Card order, Tags, Check-up and the undo rows) · **Your cards** (Export,
Import, Flagged cards, Photos, Storage) · **The app** (Share the app, Feedback, How to use the
app, Language, Meanings, AI review with the owner's setup form, Review queue, Usage sharing,
Update notes, About, Open source licenses) · **Advanced settings**. The owner's tools fold behind
one **Owner tools** row (Downloads, Mirror, Diagnostics, Still to test, All users, Feedback,
Start over); unlocking lengthens More by one row instead of 1 574 px.

**Owner's rows are English** (H uses English) and behind a password (`ADMIN_HASH`, SHA-256, a
session-only unlock). **Diagnostics** keeps a hundred readings, a hundred AI exchanges and a
hundred errors, each on its own settings row, and survives restarts (v505) — it is the only
window into the phone, and every reader fix since v93 came out of a shared dump. Each reading
carries a `numbers:` line with every value the frame chain decided on (v399).

## The reading pipeline
Photo (≤1600 px, EXIF baked in) → `proposeFrame` (ink rows on a chromaticity copy; a **shared
screenshot is read whole**, v450) → **quick look** (one pass ≤1000 px; its confident boxes place
the frame through `rectOfLines`, but only when at least three characters read at `PLACE_CF` 95 %,
v319) → the reading proper: deskew, then competing passes at several scales in a **pool of
readers**, in colour, black-and-white and chromaticity copies, simplified and traditional models,
merged by line band and scored by `readingScore`/`effScore` → the editor.

- **What the reader sees must be a JPEG** (this build misreads large canvas PNGs).
- **The reader is chaotic on large text** — the same crop reads perfectly at one scale and as
  garbage at another, so read at several scales and let them compete.
- **A weak reading (`effScore` < `WEAK_READ` 180) sends the picture to the AI** (v173), at most
  `PIC_MAX` 800 px, **at the quick look rather than after the whole reading** (v439) — over half
  of H's photos read weak, and on a panel the whole call disappears inside the reader's time. The
  reading **stops once a good answer lands** (v442), unless the frame was straightened.
- The AI's box is **snapped to the ink** (`snapBox`, v297 and twelve versions after it) and the
  frame is placed on the text; a box the model drew around exactly the text it read does not
  overrule the reader's own measurement (v449).
- A **panel or screen** answers `apart:true` with one entry per element; `splitCards` makes one
  card each. If the model's boxes are **a drawing rather than a measurement** (all one width, or
  every x a multiple of ten — `templateBoxes`/`roundGrid`), the app looks for the labels in the
  picture itself with the reader (v386–v391); a label it cannot place keeps the frame's own
  picture — **a card short of its own crop is the price, a card on the neighbour's button is
  not.**
- **No picture answer and five lines or more → no card** (v649, `NOPIC_LINES`): only the picture can split a board; the photo
  stays on the Camera tab for Crop. Offline (picture never asked) the card is still made.
- The card's picture is the **square window** around the text (`windowRect`, `CARD_RATIO` 1),
  brightened where it needs it (`brightenBlob`, per-channel only when the channels are of a kind,
  v398/v418) and sharpened at the cut (v396).

## Online AI review, the relay, and what leaves the phone
`AI_PROVIDERS`: DeepSeek (default, reachable from China without a VPN), Qwen/Bailian (pictures;
**must be called without the VPN**), GLM, Claude, custom. One account per provider
(`aiAccounts`); the phone's own key always wins. Text goes to DeepSeek where possible
(`textProvider()`), pictures to `pictureProvider()`. Qwen's thinking is switched off on every
request. Every request is tried **twice** (v201) and aborted after `AI_TIMEOUT_MS` 25 s
(pictures `PIC_TIMEOUT_MS` 60 s).

**The owner's relay** (v191): a phone with no key posts to H's Supabase edge function, which adds
the key, counts the call and refuses past the cap — **per provider since 2026-09-14: qwen 80,
deepseek 400, `CAP_ALL` 6000**; the owner's phone is exempt through the `OWNER_INSTALL` secret.
The Qwen endpoint follows the key's own prefix (`sk-ws-` pay-as-you-go, `sk-sp-` Token Plan), and
both keys are trimmed — a newline from a phone paste produced a 401 that read like a dead key.

**The picture model writes only what needs the picture** (v640, `picWords`): characters, boxes, board or not, kind, page; the pinyin, meaning and description come from the text model in the same `aiReadPicture` call — the picture's answer time is ~5 s + 7.5 ms per character it writes, and those fields were two thirds of it. Words that do not come leave the gloss, pending.

**Answers are checked, never trusted:** `zh` normalised to simplified; `saneM` drops a meaning
that echoes the text or is Han-only outside Japanese; `saneP` takes the model's pinyin only when
**every token is a real Mandarin syllable** (`PY_SYLLABLES`, v507); `aiSettled` refuses to change
a character every pass read clearly (**the v143 rule**); **the AI's pinyin is checked against pinyin-pro's in-word reading and a mismatch, or
the model's own `unsure`, flags the card** (v611, `aiDoubt`); `mainLines` drops fine print, except on a
board, menu, panel or screen, where the small plates are elements (v456).

**What the app sends on its own is the whole of the privacy question** — `privacy.html`, More →
"What is sent" and the guide must say the same thing, and correcting one without the others has
gone wrong four times (v403, v459, v534, v539). The AI review is **on by default and works with
no key**, so a fresh install sends every new card's text from its first card.

## Languages
Ten columns in `lang.js`: en, de, fr, es, ja, ko, ru, vi, th, id. **English is the key**; a
missing key falls back to the English text, never to the key. **476 keys a column, ru 505 (three
plural forms), en 15.** `nOf`/`wordOf`/`PLURAL` carry the counts.

- **The v412 rule: a pronoun or a count-agreeing verb must never cross a key boundary.** Render
  every count sentence at **1** in all ten columns before shipping it — n=1 is the state every run
  passes through, and it has been wrong in seven columns at once.
- **Tone (v255):** relaxed, the learner as a friend — du, tu, tú, 해요체, bạn, kamu; Thai with no
  sentence-final politeness particle (the app cannot know the user's gender). No formal register.
- Check for a **duplicate key** with a string-aware scan of the source that agrees with the
  evaluated count — a duplicate key in a JS object literal is silent and the later one wins
  (v371 cost the drawing pad its French label).
- **The v259 rule: a screen that changes takes the guide's sentence with it, in the same PR** —
  and that is checked by rendering, not by grepping for one word (v589).
- The guide is six sections, five led by a **real crop of one part of one screen** (v598) and the
  sixth by a drawn figure whose card is a crop too (v599, `gfimg`) — as is the empty deck's example
  card. A crop must carry **no UI prose**, or it stops serving all ten languages; it must be
  regenerated by `node tools/guide-shots.js` in the PR that changes the screen it shows, or it goes
  stale; and a whole screen is still banned (v549's arithmetic: six of them are 4600 px).
- ja, ko, ru, vi, th and id are mine and **unchecked by a native speaker**.

## Hard constraints (learned in the field — do not violate)
1. **No external dependencies / CDNs.** Must run offline and behind the GFW. System CJK fonts
   only. Libraries and data go into `vendor/` with their licences.
2. **All paths relative** (`./…`). The app lives under a subpath.
3. **Persistence only via IndexedDB.** The SW never caches a non-OK response.
4. **Phone-only deploys:** H uses GitHub in the phone browser. Small, clearly described PRs, as
   few files as possible; generate and commit binaries yourself, never ask H to upload.
5. **Privacy:** confidential text never goes into the public deck or repo. Keys live in the
   Supabase function's secrets, never in the code. Photos stay on the device apart from the
   documented AI picture path.
6. **Files leave the device only through the share sheet** — programmatic downloads are silently
   blocked by MIUI, and Chrome/Android shares `.txt` but not `.json`, hence `.json.txt`.

## Design (iOS-style since v82)
Light and dark follow the phone. Tokens in `styles.css` (light / dark): `--bg` #F2F2F7 / #000 ·
`--card` #FFF / #1C1C1E · `--card2` #F2F2F7 / #2C2C2E · `--fill` #E9E9EE / #3A3A3C · `--label`
#000 / #FFF · `--label2` #6E6E73 / #A1A1A6 · `--label3` #AEAEB2 / #6E6E73 · `--sep` hairline ·
`--tint` #C8372D / #E0483E (+ `--tint-soft`) · `--ok` #2FA36B / #3DBE7A (+ `--ok-soft`) ·
`--warn` (+ soft) · `--lock` #2F6BD6 / #6B9BF0 (+ soft) · `--photo-ar` **1** (the shape of any
box a photo is shown small in, never of the cut). Radii: cards 16 (`--rc`), buttons 12/10
(`--r`). Fonts: UI = Apple system stack; Hanzi = Songti/STSong/Noto Serif CJK for the big
characters; `--mono` only for timestamps and Diagnostics. **Pinyin is set in the UI font.**

The script draws nothing in fixed colours — inline SVG uses `style="stroke:var(--…)"` and
canvases read the tokens at paint time (`cssVar`). The crop frame is deliberately
theme-independent (white dashes with a dark outline). Body 17 px, labels 13–14 px, meanings
18 px, **touch targets ≥ 44 px**, inputs ≥ 16 px, safe-area padding, plain words — no jargon,
no "OCR", no "·" shorthand, sentence case everywhere.

**The browser's own behaviours stay off the app** (v248/v249/v272): one `contextmenu` listener
cancels the long-press menu on pictures, canvases and controls; `user-select:none` on controls,
badges and labels but **not** on prose, so a meaning can still be copied; `touch-action:
manipulation` on body; autocorrect and spellcheck off on the fields that hold Chinese or pinyin.

## Didactics / SRS
SM-2 light. Progress rows `{c, interval, ease, due, reps, fails, last}`; every review day is
appended to `days` for the streak, and `daily{day:{r,w}}` counts reviews and writes.
`fails` counts consecutive `again`, and at `LEECH_FAILS` 4 the card is **flagged automatically**
— a leech is usually a bad card, not a bad memory. `KNOWN_DAYS` 21 is "known".

**Learn writes the review from the pad** (v512): "good", or "again" when a Skip helped. The three
grades — Hard (`again`) / Medium (`good`) / Easy in the traffic light's colours (v421/v497) —
survive only on a **marked photo's** sheet, where the tap really is a review; `hard` is kept in
`schedule()` for the rows written by it and is unreachable from any screen.

Session = due cards + up to `NEW_PER_SESSION` 8 new ones, **from short cards to long ones inside
each group** (v524), with unchecked cards first (v515). A **starred** session holds **every**
starred card, due or not, with the cap lifted (v429) — a star is a hand-picked list, not a
category. Card order (Oldest / Newest / Random) is H's own setting.

## Testing
No test files in the repo. Each session verifies in headless Chromium (Playwright with the
pre-installed browser, a local static server under `/zeichentrainer/`, vendor files from
`vendor/`, AI endpoints mocked with `page.route`); a seed script fills IndexedDB before the app
loads, then scripts drive the UI and read state (`S`, `SIGN`, `DICT` are globals). **Suites live
in the session scratchpad and are gone afterwards — rebuild what you need.** A serving root is
built by **copying**, never as a symlink into the repo.

Rules that came out of the harness and cost real versions:

- **A suite that pins a number breaks on every change to it — read the number from the page**
  (v413).
- **A check that cannot fail on the old tree is not a test** (v419). Run the suite against the
  previous version and say how many checks flip; label the ones that pass on both `[control]` or
  `[guard]`, with the reason written beside them.
- **A green result whose mechanism is not the one claimed is worthless** (v439/v447): a case
  passed because a stale log line from the previous case happened to be there.
- **A fit check must ask whether the text broke, not whether the box overflowed** — a flex item
  shrinks and wraps inside its button rather than overflowing (v427).
- **A gesture fixture must use the gesture the phone uses** — v606 passed on wheel zooms, and a real pinch
  left a captured finger behind that broke it (v614).
- **A probe that reads the app's own model of an animation cannot see what the compositor
  paints** — use `Page.startScreencast` for a fade (v555).
- **When the harness and the phone disagree, the harness is wrong and that is what gets fixed
  first.** No heuristic is tuned against numbers the phone did not actually send (v384): five
  versions were fitted to a rounded log and every one failed in the field.
- **A suite that freezes a copy of the build stops being a test the moment the build moves**
  (v419).
- A fixture must carry the field case's own shape — its angle, its own photo, its own answer
  (v446/v552); two cards on one photo are page fronts and test something else entirely.
- Layout is checked by screenshot at 390 px (and 360 px for the narrow phones), light and dark,
  in German and in the widest language for the row in question.

## Working with H — the how-to rules (v128, agreed after the four-corner episode)
**What H sends.** One request per message: a sentence, and a screenshot when it is about a
screen. When the reader is wrong, More → Diagnostics → Share with it — the phone is the only
place the reader can be watched from. "Leave it as it was" means: revert, no discussion.

1. **Restate before building.** One sentence: what changes for H on the phone. Two readings that
   lead to different work → one question, not five. Otherwise no questions.
2. **Size gate.** Wording, layout, a rule in the reader, a bug: build at once. **Anything that
   changes how H handles the app** (a new gesture, field, control, screen or flow) is described
   first in three lines — what H does, what he sees, what it costs — and waits for "go".
3. **Only the ask.** No "while I'm at it" changes. Cleanups only when H asks for them.
4. **Field first.** A reader change is judged by the phone, not by the harness. Every claim about
   the phone is either seen on the phone or marked "not yet field-checked".
5. **One request, one PR, one version.** Three version markers bumped, the suites that touch the
   change run, the record updated in the same PR, merged by Claude, branch reset onto main.
6. **The record is the memory.** Decisions, rejected features and field lessons go in with the
   reason. What H rejected is not brought back unasked.
7. **Report short, in English.** What changed, what was verified and where, what is open.
   **Honesty over confidence:** "I don't know" beats a guess; limits are named, costs are stated
   plainly rather than dressed up.
8. **Wording and design** follow the rules above — they are not up for interpretation.
9. **Tone: relaxed.** "This is a fun app. No formal, boring translations within the app.
   Customers are passionate language learners. Same for the design and layout."

**`WHATS_NEW` (v408):** every PR that changes something a learner would notice adds one English
sentence keyed by its version; More → About lists the last five **as a bulleted list** (v609; grey dots, not red — v610, H: "viel zu auffällig") and a line slides
up after an update. **Most versions get no note — that is correct, not an oversight.** A note describing a
control that no longer exists is not a record but a false instruction, so it goes with the
control (v534). The owner's twin is **`TO_TEST`**, the Still-to-test list under Advanced settings
(v435): a PR that ships something only the phone can judge adds its line, and the line goes when
H says it works. Keep each entry inside **35 columns** or it wraps in the box.

## Field lessons that shaped the app (keep)
The full list is in the archive; these are the ones that keep biting.

- **The frame never moves for the content; the content adapts to the frame** (v560).
- **A class written for one shape is not a free ride for another** — `.undo` carried a button's
  padding, width and `nowrap`, and cost the update note five versions of silence (v413); `.lbl`
  greyed out a vote's labels (v487); `.btn.mini`'s `nowrap` pushed a whole sentence past the card
  (v432). **Inheritance loses to any matching rule, however weak.**
- **A clamped box wants a whole-pixel line box**, or the line it clamps away leaves its top edge
  behind (v593).
- **Presence that costs width is not free in a ten-language app** — check the language with no
  room *before*, not after (v474).
- **A guard whose lifetime is a timer from the moment it was armed does not cover the gesture it
  guards — end it on the event that ends the gesture** (v589: a long press held a moment longer
  deleted the card it had just marked).
- **A guard asserted by setting its own state by hand is not tested — drive the button that is
  supposed to set it** (v468).
- **A second copy of one number drifts.** One rule, one reader; when a copy is unavoidable, name
  it on both sides (v401).
- **A constant that holds only because something else is being cut stops holding the moment the cutting
  stops** (v600): `LINE_H` 61 was the word line's true height only while a row that did not fit was sliced
  sideways. The wrap made it a lie, and `.cue .padline`'s `overflow:hidden` would have cut the new third row
  as silently as the flex row had cut the first. **A static estimate that must be safe for every card is
  wrong on most of them** — the finished card's reading was estimated from a character count and stood at
  12.7 px where 27 fits.
- **A dead constant or class leaves with its last user** (v307), and **a comment that states
  something false is a defect** (v404).
- **An undefined CSS custom property takes its entire declaration with it** — the only way to find one is to
  grep every `var(--x)` against the `:root` list (v589).
- **The app must say what actually happened** — a record that claims an answer was used when it
  404'd, or prints "not round" where the code never looked, costs days (v384/v395/v399/v405/v447).
- Status text lives in state and is re-queried on every render; a node captured before a
  re-render disappears silently (v47).
- A long-running action keeps its state **outside** the row it was started from (v257).
- **`git checkout -B <branch> origin/main` uses the local ref** — `git fetch origin main` first,
  or you build on a stale tree (v458/v459; it happened again while writing this file, and only
  the byte count caught it). After a **squash** merge, reset the branch onto `origin/main` before
  the next commit.
- A tap on a scrollable layer is read from the **click** event, not from `pointerup` — iOS turns
  the touch into a scroll and sends `pointercancel` (v206).
- The worker helps only while it **controls** the page; a page with no controller needs its own
  origin-then-mirror rule and a stall that ends a load (v335).
- **No VPN is needed to use the app.** Updates and vendor files come through the jsDelivr mirror
  (`fastly.jsdelivr.net`, since `cdn.` is DNS-hijacked in China for about two fifths of users,
  v483), purged on every push by `purge-mirror.yml`. A **first install** still needs github.io —
  the only fix is a second origin, and **H chose Cloudflare Pages on his own domain, later.**
- The reload after an update waits for a pause (v279/v327), never while a photo is on its way
  from the camera (v316), and at most once in ten minutes (v563).

## Play Store
**Since 2026-09-23 the store app is a Capacitor shell, not a TWA** — it shows the live Pages URL and
adds native payments; its code, the credit rules, prices and store accounts live in the **private
repo `henglicam/zeichentrainer-app`**, whose `CLAUDE.md` holds those decisions. The web app itself
does not change, and taking the public site down would break every installed copy. H is a **German citizen resident in
China**: the passport is the identity document, and the **address proof decides the account's
country, which cannot be changed afterwards** — China is the honest choice. A personal account
must pass a **closed test with 12 testers for 14 continuous days** before production. Google Play
does not distribute to mainland China; the Chinese stores need a 软著 and a company (out of scope).
The signing keystore never goes into the public repo; `assetlinks.json` must live at the **origin
root**, so it needs the separate `henglicam/henglicam.github.io` repo. **The Data Safety form must
match `privacy.html`, which must match the code.** The commercial side is deliberately not in this
repo — it is public; the paid/free choice is irreversible and is settled with H first.

**What law applies today** (an assessment, not legal advice): German Impressumspflicht bites once
money flows or the listing exists; GDPR probably does not apply today, but the AI review being
**on by default** would be an opt-in question under it; PIPL wants a separate consent for sending
a random installation id abroad. The open-source licences were the one duty already unmet and were
closed at v425 — and **`strokes.txt.gz` and `cedict.tsv.gz` must stay freely available under their
own licences even after the app is sold** (Arphic §2b and CC BY-SA ShareAlike). Selling the app is
fine; taking those two files private is not.

## Open / not yet field-checked
v652's AI reading on a disputed sure card and the repaired Deck count; v651's Rebuild all (better cards and zoom? does Undo bring everything back?); v650's Check texts (does it flag the right cards, how many false flags?); v649's no card for a long reading when the AI is down; v646/v648's check beside a sure card (does it flag the right ones?); v645's Re-read all on the phone (516 cards: how long, and does it leave the deck as it was?); v641's sure-reading skip (are those cards fast and right on the phone?); v640's split picture call (is a photo's card really faster, and are brand meanings as good without the picture?); v642's worker for the phone's reader (is swiping multicards smooth now?); v617–v620/v626's auto zoom and multicard snap (the multicards that do not snap mostly have no frame of their own — v626/v628's records; H's next Owner tools → Zoom check → Share and Data is the test; is 3.5× sharp enough?); v616's recap after a Crop again; v615's steady Cards swipe; v613's tab out of Test this card; v612's Show me inside the pad; v611's anti-invention flags (do they land on the wrong cards and not the right ones?); v609/v610's bulleted update notes (grey dots); v608's name and icon on the home screen; v607's square photo in Learn and Test this card; v606/v614's pull-past-the-edge swipe on a zoomed photo; v605's whole dictionary meanings on the phone (the file re-fetches once); v603/v604's Traditional chip and its switch (does the blue read as the script, is the corner tap found, does a tap meant for the photo hit it); v602: does Learn read better without the marks on the photo (H's trial — his word decides whether `SPOT_ON` goes back to true); v600 and the versions around it, are not field-checked — H's next long-word card is the check for the
wrapped word line and for the bigger reading on the finished card (is 27 px enough, and does the reading
still read as one thing when a seven-syllable word breaks across two lines?); an **empty Learn screen** for
v599's real example card, and **More → How to use the app** for the figures (does it read as the app? is the
half-drawn privacy figure a seam?); his next finished card for v597's shorter recap; and his next card made
from a multicard for v596's square page front.

**The rule the crops carry, and it is easy to break:** a crop is a photograph of the app, so **it
goes stale the moment the screen it shows changes**. Run `node tools/guide-shots.js` in the same PR
as any change to the Crop view, the Edit form's character strip, the write pad, the **study card's
front**, the Cards tile, the language chips or the **open card's character row** — the aspect ratios
it prints must match `GF_SHOT` in `app.js`, and a changed ratio is a changed `GF_SHOT` entry. A crop
must never contain UI prose. A full run rewrites all fourteen files (the painted sign has random
grain), so restore the ones the PR does not touch.

**Named and waiting for H's word** (each changes how he handles the app, so each waits for a "Go"):
re-cutting the deck square (`RECUT_V` 6, ~95 ms a card, no undo); after one tap the card is dealt
face-up for the rest of the session (`S.cueBig` is session state — it reverses v568 on purpose);
on a card of several words the tap shows the **first word's** pinyin and meaning, not the card's;
the pad **prints** the character at levels 1 and 2, so "write the word" is "trace the word";
the session count runs away as the repeat pass appends; the pad's helper buttons sit inside its
square, so a stroke begun in a corner is swallowed; the star counter and the review flag are under
the 44 px rule; an offline weak reading still makes its flagged card; `SPLIT_MAX` 30 is a cap a
real menu board will reach — **and a menu board has never been read in the field.**
