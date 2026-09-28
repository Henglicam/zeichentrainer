# CLAUDE.md — 识字 Shízì

Working language: **English.** Reply to H in English. Short, direct, no excessive politeness.

## Where the history is — read it before you change a rule

This file is the **consolidated current state and the binding rules**. The full record of how
we got here — every version from v1 to v598, with the measurements, the rejected alternatives
and H's own words — is in **`docs/HISTORY.md`** (1.5 MB, not loaded automatically).

It was `CLAUDE.md` until 2026-09-21, when at ~400k tokens it broke every session ("Prompt is too long"); it was archived
verbatim. **Grep it for the reason behind anything:**

    grep -n "v487" docs/HISTORY.md          # one version's reason      grep -n "snapBox" docs/HISTORY.md   # one mechanism
    grep -n "Measured and dropped" docs/HISTORY.md   # tried, must not come back      grep -n "Rejected" docs/HISTORY.md

**Much of what looks like an obvious improvement was already built, measured and reverted, with H's verdict
recorded next to it.** Check before you propose it again.

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

## Current state (PWA v730, 2026-09-28)
**The app is called 识字 Shízì** (v608; 街字 Jiēzì v601–v607) — title, manifest, logo, About, share text, `privacy.html` and
every shared file (`shizi-…`). **Keep the old name where renaming breaks installed copies:** the repo, the URL `/zeichentrainer/`,
the mirror path, IndexedDB `zeichentrainer`, the `zt-vN` caches and the export's `app:"zeichentrainer"` marker.

**Recent state worth carrying in the head** (full entries: `grep -n "v6xx" docs/HISTORY.md`):
- **v717–v729 dictionary senses, the split and the gloss fix** (the v720 and v723–v729 passes field-checked by H's
  dumps, v717–v719 not): `cedict.tsv.gz` is **v5** — every sense of every one-character line, appended to the shipped
  order by `tools/cedict-nmax.py --write` (v722, `docs/NMAX.md` is the record). `bestSense(w,py,inWord)`: **`OWN_SENSES`**
  first (只 本 新 京 金 周 江 木 面 卡 皮 瘦 龙 胡 吃 碰 杠 — H's street senses, v723–v729, the street sense first and the
  special one in a bracket; add there, with the reading); **`OWN_PINYIN`**
  (v725: 夹 jiā and the words that keep jiá/gā or a neutral tone — a one-character entry overrides the library's words)
  goes into pinyin-pro in `loadScript`; **a line splits into the fewest words** (v726, `fewestFirst`; ties to the longer
  first word; 肥|瘦|肉夹馍, not 肥|瘦肉|夹|馍); inside a word — **a one-character word beside another character is inside a
  word** (v720, `besideCJK`; 店 in 本店 is "shop") — the first bound form **among the first `BOUND_TOP` 3 senses** (v724:
  入 "to conform to", 水 "additional cost" stood later) that is neither a proper noun (`PROPER`, v721/v724: any capitalised
  word outside a note, "I" is not one) nor narrowed by a note of its own (v722); alone, the first sense that is not hard
  (surname, variant, dated, abbr., "used in", "see", CL) and not a classifier or proper noun standing back, a bound form
  counting with its marker off (v722: 木 tree, 英 hero). **A one-character word takes its reading from its whole line**
  (v719, `ctx`; 卖完了 ends in le; 一/不 keep their tone, `SANDHI`). `glossFix()` applies all that once per phone
  (`GLOSS_FIX_V` 729) to stored single-character glosses, composed meanings, unverified dict cards, the pinyin of every
  card holding an `OWN_PINYIN` character (only that syllable, v725/v728) and the split of every sign card's gloss and
  segs, its meaning only while still the composed one (v726/v728) — **only on the fresh dictionary** (`DICT_FRESH`);
  settings row `glossFix`, Diagnostics prints it. v717 also: `MORE_OPEN`, `PAD_HAND`, the backup line, "Cards with 行 ›"
  only when another card holds it (all in the sections below).
- **The v6xx state** (reader, owner tools, Learn zoom, Crop again) moved to `docs/HISTORY.md` on 2026-09-28 (H):
  `grep -n "Consolidated v6xx" docs/HISTORY.md`.

## Files
Shell: `index.html` · `styles.css` · `lang.js` · `app.js` · `manifest.webmanifest` (with `share_target`) · `sw.js` ·
`signs.json` (phrasebook) · `nmt-model.json` · the three icons · `guide/` (seven real crops, light and dark, 113 KB WebP,
made by `tools/guide-shots.js`). `vendor/`: Tesseract and its readers, dictionaries, OpenCC, `strokes.txt.gz`, `outlines.txt.gz`
(~23 MB); `vendor/paddle/` (~30 MB, v637) and `vendor/nmt/` (55 MB) load on use; licences in `vendor/LICENSES.txt` and
`vendor/ARPHICPL.TXT`. Not in the shell: `privacy.html`, `README.md`, the three `SPEC-*.md` (pre-build designs, contradicted in
places), `tools/`, `docs/HISTORY.md`, `.github/workflows/` (nmt fetch, mirror purge), `supabase/` (the relay and usage
functions and the SQL H ran once).

Vanilla JS, no frameworks, **no build step**. `app.js` in reading order: helpers and state → IndexedDB → online AI →
study screen → cards, detail, edit form → More → camera and inbox → reading pipeline → character picker and drawing
sheet → sign editor and save → service worker, mirror, shell check, shared screenshots. Shared helpers: `askSheet`, `putCard`, `pySpaced`,
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
  trad:"養樂多", simp:true, ml:"de", ms:{en,de}, ds:{en,de}, dsh,  // script (simp, v604), meaning language, meanings, descriptions (dsh: a multicard text's short one, v698)
  alts:[…], ai:{zh,p,m,note,ok,bad,at,model}, aiNo:"<fingerprint of a dismissed suggestion>",
  mt:{src:"llm"|"dict"|"phrasebook"|"nmt"|"gloss", verified, pending, suspect},
  reading:{rect,at,failed},                            // saved before its reading finished
  page:"page#…", dish:true,                            // one text of a multicard; a menu dish whose picture is its photo (v705; a new cut clears it, v710)
  from, fromT, of }                                    // a flashcard generated from a multicard text
```

A **page card / multicard** (v453): `{id:"page#<at>", kind:"page", t:"Page", c:<title>,
name:{name,what,place}, ml, at, shot, items:[ids], tags:[kind], mt llm-verified, v}` — no `img`,
no progress row, never reviewed by the AI (its title goes out as context for its texts' short descriptions, v698), **not in the Deck count** (v504).

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
  grades the card `again`. The template is the real Kai outline (`outlines.txt.gz`, v517). Until the stroke file is parsed the pad shows its grid alone — no stand-in glyph (v706); a failed load makes it the free pad (v708), once — later tries are silent (v710).
- **The grade is the writing.** The last stroke of the last character writes the review through
  `recordGrade`, counts the points (**one point per character written without help**, v546),
  bumps `charWrites`, and queues the card **once more `REP_GAP` 3 cards on** (a repeat pass).
  A swipe, a chevron or a tab tap grades nothing.
- **After each character** the pad fades out, then (`CHAR_IN` 200 ms later, v668/v673) its reading and meaning stand over
  the pad for `CHAR_MS` 900 ms (v553/v571); after the last, the card's recap — its own `d.p` grouped by word (v616) and the
  meaning, no characters (v577) — for `recapMs(d)` (`NEXT_MS` 3200 + `RECAP_SYL` 230 a syllable past the second, cap
  `RECAP_MAX` 5300), the reading as large as `recapFit` measures it fits (v600). A tap skips. The star flies into the counter
  at `recapMs − POP1`; a milestone (50/100/250/500/1000 points, 7/30/100-day streak) bursts (v545).
- **The word line** (text state only; in the photo state `--th` is 0, v580) reads the character being written with its
  in-word reading, then its word (v518/v540), and wraps onto as many lines as it needs (v600); `shortSense` strips a
  parenthetical from that line only.
- **"Details"** (called "Whole card" until v704) folds open at the card's foot — the characters, pinyin, meaning **and the
  description** (v585), fetched by itself 1.2 s after the card appears (v586, `explainSoon`); then a grey toolbar
  **Star · Flag · Edit** (v654/v655, again since v667) — Edit opens the Edit form and comes back to the same card. The fold row
  shows a small star/flag beside "Details" when the card has them; **nothing sits on the photo** (v667).
- **The word being written is marked on the photo** (v533) — **switched off by `SPOT_ON` since v602**, code intact.
- **The photo zooms onto the character being written** (v617, `ZOOM_AUTO`): whole first, in after `AZ_OVERVIEW` or the pad's
  first touch, on to each next character on a glide, out for the recap — on every character, level 3 included (v660, H's
  choice over v617's recall rule). `AZ_INK` on a sure ink box; the reader's boxes of one line share one scale, the largest any of them
  needs (v678), and every line shows its characters at the card's largest share of the box, as far as `AZ_MAX` allows (v679); the text whole on an unsure ink guess (v669); cap `AZ_MAX` 3.5. **The learner can switch it off** (More → Learning, `learnZoom`, `zoomOn()`, on by default, v683). How the place is found: Current state. A pinch makes the zoom the hand's
  (`ZOOM_HAND`) and it then only follows; one finger still swipes.
- **Swipe** = the carousel of v417: the neighbour rides in beside the card and snaps; it grades
  nothing, and a skipped card stays due for next time. On a **zoomed** picture the one-finger drag pans, and pulling on past
  the picture's edge hands the stroke to the swipe (v606).

### Cards
Square photo tiles, two a row, **nothing written under them** (v593); a text-only card draws its text in the picture (v506).
On the picture: the star (v425, one tap), flag and AI marks; a multicard adds its plates, count chip, progress bar and a
two-line title (v461–v597). **Two tabs, Cards and Multicards** (v477); the filter is **one pill and a sheet** (v365/v366);
search also takes toneless pinyin (`toneless`, v690; H skipped a dictionary-row list, proposal A); a long press marks (v354);
the list keeps its place (v352/v445); the placeholder reads "Characters or pinyin" (v717; meanings are found too). From
`BACKUP_AT` 25 flashcards a never-exported deck shows **one backup line with Export** under the search bar (v717). The **open card** swipes through the list (v445); Details, then its actions at the foot (v703): Test this card · Edit | Star ·
Flag | Delete; its line under the character row ends in **Cards with 行 ›**, the character's page — its readings in your
cards and every card that holds it (v691; the card under it keeps its own way back, v710) — only when another card holds the
character (v717). A **multicard's own text**: it swipes to the multicard's next text (v707); its photo frames it alone (v700); + Flashcard (Flashcard › once made) | Edit, Flag |
Delete (v692/v695); the pop-up over the photo carries **no action** (v496/v692). The multicard: **Add a text**, Delete multicard
(v635/v711); its tags once under its title, its texts' rows show a short one-sentence description (`dsh`, all texts in one AI call at creation and once when an older multicard is opened, `pageShorts`; a failed call is asked again on the next visit, v710) and no flashcard ring; the long one stays on the opened text (v696–v698). On a **menu** (kind Menu or half the texts priced) each dish shows its price at the right, name/pinyin/meaning without it and whole, and a dish description (`priceOf`, `isMenuPage`, v699) — its own screen and the look-up show the same, the price on its own line (`priceView`, a view, the record untouched, v712), and its flashcard is the name alone (v713); a dish with its own photo takes it as its picture (`dish`, v701/v705).

### Camera — photo to card
The Camera tab is the camera: the **shutter card** (Take photo, From album) centred, work under it (v466/v470); a photo that
made its card **leaves the tab** (v471). From album works through the batch one at a time while the app is open (v411).
**A photo becomes a card by itself** (v325): a light band sweeps the photo, then the finished card with Edit and Delete. Save now
(v237) makes the card before the reading is done; Crop (v437) and Crop again (v239) hand the app's frame to the hand. A photo
whose texts stand apart becomes **one multicard** with a dot on every text (v448/v453/v457), regions snapped onto the ink when
shown (v620); its photo pinches and pans like a card's (v634, `regionAt`). **Add a text** (v635) frames a missing text through
Crop again; a blank never read is dropped on Cancel, a tab tap or a restart.

### More — four sections (v547)
**Learning** (Progress, Card order, Tags, Check-up and the undo rows) · **Your cards** (Export,
Import, Flagged cards, Photos, Storage) · **The app** (Share the app, Feedback, How to use the
app, Language, Meanings, AI review with the owner's setup form, Review queue, Usage sharing,
Update notes, About, Open source licenses) · **Advanced settings**. The owner's tools fold behind
one **Owner tools** row (Downloads, Mirror, Diagnostics, Still to test, All users, Feedback,
Start over); unlocking lengthens More by one row instead of 1 574 px. **The long texts fold** (v717, `moreFold`, closed at
every start, toggled in place): What is sent ⌄ on AI review and Usage sharing, About the app ⌄, Write a message on Feedback;
every word stays (v193), as do the checkboxes, status lines and update notes. Three-card deck: 3 619 px, was 4 146.

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
- **A strong winning reading with a sure line outside the placed frame places it again around it** (v684: the close look's
  band had cut 爸爸 off a 4-line poster the phone's reader read whole).
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
missing key falls back to the English text, never to the key. **485 keys a column, ru 514 (three
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
cancels the long-press menu on pictures, canvases and controls; **no text is selectable** (`html{user-select:none}`,
v694, H: "Bitte nicht diese Google popups zulassen" — Chrome's Touch to Search needs selectable text), only inputs and
text areas are; `touch-action:
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
- **A fit check must ask whether the text broke, not whether the box overflowed** — a flex item wraps inside its
  button rather than overflowing (v427).
- **A gesture fixture must use the gesture the phone uses** — v606 passed on wheel zooms and a real pinch broke it (v614).
- **A probe that reads the app's own model of an animation cannot see what the compositor paints** — use
  `Page.startScreencast` for a fade (v555).
- **When the harness and the phone disagree, the harness is wrong and that is what gets fixed
  first.** No heuristic is tuned against numbers the phone did not actually send (v384): five
  versions were fitted to a rounded log and every one failed in the field.
- **A suite that freezes a copy of the build stops being a test the moment the build moves** (v419).
- A fixture must carry the field case's own shape — its angle, its own photo, its own answer (v446/v552).
- Layout is checked by screenshot at 390 px (and 360 px for the narrow phones), light and dark,
  in German and in the widest language for the row in question.

## Working with H — the how-to rules (v128, agreed after the four-corner episode)
**What H sends.** One request per message: a sentence, and a screenshot when it is about a screen; when the reader is
wrong, More → Diagnostics → Share with it. "Leave it as it was" means: revert, no discussion.

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
- **A class written for one shape is not a free ride for another** — `.undo`'s padding and `nowrap` cost the update note
  five versions of silence (v413); `.lbl` greyed out a vote's labels (v487); `.btn.mini` pushed a sentence past the card
  (v432). **Inheritance loses to any matching rule, however weak.**
- **A clamped box wants a whole-pixel line box**, or the clamped line leaves its top edge behind (v593).
- **Presence that costs width is not free in a ten-language app** — check the tightest language *before* (v474).
- **A guard whose lifetime is a timer from the moment it was armed does not cover the gesture it
  guards — end it on the event that ends the gesture** (v589: a long press held a moment longer
  deleted the card it had just marked).
- **A guard asserted by setting its own state by hand is not tested — drive the button that sets it** (v468).
- **A second copy of one number drifts.** One rule, one reader; when a copy is unavoidable, name
  it on both sides (v401).
- **A constant that holds only because something else is being cut stops holding the moment the cutting stops** (v600:
  `LINE_H` 61 was the word line's height only while a row was sliced; the wrap made it a lie). **A static estimate that must
  be safe for every card is wrong on most of them** — measure (`recapFit`).
- **A dead constant or class leaves with its last user** (v307), and **a comment that states
  something false is a defect** (v404).
- **An undefined CSS custom property takes its entire declaration with it** — the only way to find one is to
  grep every `var(--x)` against the `:root` list (v589).
- **The app must say what actually happened** — a record that claims an answer was used when it 404'd costs days
  (v384/v395/v399/v405/v447).
- Status text lives in state and is re-queried on every render (v47); a long-running action keeps its state **outside**
  the row it was started from (v257).
- **`git checkout -B <branch> origin/main` uses the local ref** — `git fetch origin main` first, or you build on a
  stale tree (v458/v459, and again while writing this file). After a **squash** merge, reset the branch onto `origin/main`.
- A tap on a scrollable layer is read from the **click** event, not `pointerup` — iOS sends `pointercancel` (v206).
- The worker helps only while it **controls** the page; a page with no controller needs its own origin-then-mirror rule (v335).
- **No VPN is needed to use the app.** Updates and vendor files come through the jsDelivr mirror (`fastly.jsdelivr.net`;
  `cdn.` is DNS-hijacked in China, v483), purged on every push by `purge-mirror.yml`. A **first install** still needs
  github.io — the only fix is a second origin, and **H chose Cloudflare Pages on his own domain, later.**
- The reload after an update waits for a pause (v279/v327), never while a photo is on its way
  from the camera (v316), and at most once in ten minutes (v563).

## Play Store
**Since 2026-09-23 the store app is a Capacitor shell** showing the live Pages URL with native payments; its code, credit rules,
prices and accounts live in the **private repo `henglicam/zeichentrainer-app`** (its own `CLAUDE.md`). Taking the public site
down would break every installed copy. H's account: passport as identity, **China as the account country** (fixed forever);
a personal account needs a **closed test, 12 testers, 14 days**. Play does not reach mainland China. The keystore never enters
this repo; `assetlinks.json` needs the origin root (`henglicam/henglicam.github.io`). **Data Safety form = `privacy.html` =
the code.** The paid/free choice is irreversible and settled with H first. Law (an assessment): Impressum once money flows or
the listing exists; the AI review on by default is a GDPR opt-in question; PIPL wants consent for the installation id abroad.
**`strokes.txt.gz` and `cedict.tsv.gz` stay freely available under their own licences even after a sale** (Arphic §2b,
CC BY-SA).

## Open / not yet field-checked
Everything from **v597 to v720** is unconfirmed on the phone unless H has said otherwise (field-checked: v676, v682, v685, v714);
each version's archive entry names its open question. The ones that decide what comes next: **the Learn zoom** (v653–v686 —
does it land on the character, is 3.5× sharp enough? Owner tools → Zoom check), **the phone's reader as the reading**
(v641–v652 — sure cards fast and right, the check flagging the right ones), **Multicards and Cards as a reference**
(v687–v696), **the gloss fix and dictionary v5** (v718–v729 — every pass since v723 confirmed by a dump; v717–v719 not), then Owner tools (v645–v651), speed (v640/v642/v672), the
Learn screen (v667–v673, `SPOT_ON`) and the older v599–v614 items.

**The crops go stale with their screens:** run `node tools/guide-shots.js` in the PR that changes the Crop view, the Edit
form's character strip, the write pad, the study card's front, the Cards tile, the language chips or the open card's character
row; ratios must match `GF_SHOT`; restore the files the PR does not touch (the painted sign has random grain).

**Named and waiting for H's word** (each changes how he handles the app, so each waits for a "Go"): re-cutting the deck
square (`RECUT_V` 6, ~95 ms a card, no undo); after one tap the card stays face-up for the session (`S.cueBig`, reverses
v568 on purpose); on a card of several words the tap shows the **first word's** pinyin and meaning; the pad **prints** the
character at levels 1 and 2; the star counter and the review flag are under the 44 px rule; an offline weak reading still
makes its flagged card; `SPLIT_MAX` 30 is a cap a real menu board will reach (the first menus were read at v727).
