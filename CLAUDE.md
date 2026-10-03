# CLAUDE.md — 识字 Shízì

Working language: **English.** Reply to H in English. Short, direct, no excessive politeness.

## Where the history is — read it before you change a rule

This file is the **consolidated current state and the binding rules**. The full record — every version, with the
measurements, the rejected alternatives and H's own words — is **`docs/HISTORY.md`** (2 MB, never loaded whole). **Grep it
for the reason behind anything:** `grep -n "v487" docs/HISTORY.md` (one version), `"snapBox"` (one mechanism), `"Measured
and dropped"` and `"Rejected"` (what must not come back).

**Much that looks like an obvious improvement was built, measured and reverted already, with H's verdict beside it** —
check before you propose it again.

**Keeping the record:** every PR appends its entry to the **top of the version log** in `docs/HISTORY.md` — the reason and
the measurement — and updates **this file's "Current state" and the affected section** in the same PR. This file is
consolidated state, **never a version log**; it must not grow past ~40 KB. When a section here goes stale, rewrite it; the
old wording lives in the archive.

## What this is
Chinese character trainer for adults (spaced repetition), a reinterpretation of 悟空识字 without the kids' aesthetic.

**The rule (H, 2026-09-14): "Flash cards are for learning and multi cards are for looking up stuff."** A flashcard is
studied — a progress row, a due date, a grade, a star, a place in Learn and in the Deck count. A multicard (a page card,
v453) and its own texts are looked up — nothing on them is studied, counted, scheduled or graded, and the only thing a
multicard text can do is generate a separate flashcard (v487). **A later change that puts a learning word or a learning
control on a multicard, or a look-up-only surface on a flashcard, is wrong by construction.**

**App screens (H, 2026-09-29): "Sinn der Sache ist es, als Ausländer schnell und einfach mit diesen Apps zurecht zu kommen."**
A multicard of a Meituan or Taobao screen exists so that a foreigner can use the app at once: a field's meaning is **what
the button does in the app** (待收货 "To receive"), never the dictionary's word; the standard fields are the point, and
clutter beyond them costs the reader the screen.

User: H, product manager, Beijing, **phone-only (Android/Xiaomi, Chrome, VPN), no computer**. UI language: English (ten
languages shipped). Learning content: Chinese + pinyin + meaning.

## Live deployment
- Repo `henglicam/zeichentrainer` · GitHub Pages, branch `main`, root · `https://henglicam.github.io/zeichentrainer/` ·
  push to `main` → Pages rebuilds (~1–2 min). `index.html` must stay in the repo root.
- The site is **public**. User data lives only on the device (IndexedDB). What the app sends on its own: **the text of every
  new card** (the AI review is on by default, through the owner's relay with no key, v191/v193), **a picture of most photos'
  text** (to read it when the reading is weak or several texts stand apart, to check it when the phone's reader is sure —
  v173/v457/v646; sometimes the whole photo), the descriptions and character senses a card lacks (v586/v772) and the daily
  usage row (v170). Each is switchable under More, and **the one AI switch stops every text and picture the app would send
  by itself** (v193; the board path's words too since v808); **`privacy.html` is the authoritative list.**
- **Deploy discipline (v563's reload storm):** `APP_V` in `app.js`, `PWA vN` in `index.html` and
  `zt-vN` in `sw.js` are **one number**, bumped on every change to a cached file; grep all three before merging. **One
  version number per deploy, not per feature** (v426). Leave **more than ten minutes** between merges (Pages sends
  `max-age=600`). Files no phone fetches — `CLAUDE.md`, `docs/`, `supabase/`, `tools/` — need **no** bump.

## Current state (PWA v822, 2026-10-03)
**The app is called 识字 Shízì** (v608; the old names: HISTORY.md's title) wherever a learner sees a name and in every
shared file (`shizi-…`). **Keep the old name where renaming breaks installed copies:** the repo, the URL `/zeichentrainer/`,
the mirror path, IndexedDB `zeichentrainer`, the `zt-vN` caches and the export's `app:"zeichentrainer"` marker.

**Earlier state, consolidated:** `grep -n "Consolidated v6xx\|Consolidated v7xx" docs/HISTORY.md` — the phone's reader, owner
tools, Learn zoom, Crop again; dictionary v5 and the gloss rules, duplicate multicards, a text's region, the apps' fields, the
wake lock. The rule that bites most: **a picture answer's text that is a whole field takes the book's words and is not asked
of the text model** (`fieldEntry`, v757).

**The relay has a budget and says why it refuses (v817).** `supabase/budget.sql` gives it one row, `relay_config`, that H edits
in the Supabase Table Editor: `paused` (the emergency switch, every phone), `month_cap_eur`, `reduce_at` (from that share of the
ceiling every phone's allowance halves), `deepseek_cap`/`qwen_cap` a phone a day, and the prices that turn each answer's tokens
into `relay_spend`. A 429 carries `reason` (phone, all, month, paused) and `until`, kept **per provider** (a refused picture must
not stop the text checks); `relayLine()` says it on the Camera tab and under More → AI review, `aiAuto` stands down while the text
provider is refused, and the owner's phone sees the spend under Owner tools → Relay budget. **Part 1 of 3:** the own-key sheet
for every user and the store shell's hidden purchase path are not built.

## Files
Shell: `index.html` · `styles.css` · `lang.js` · `app.js` · `manifest.webmanifest` (with `share_target`) · `sw.js` ·
`signs.json` (phrasebook, 3007 entries; **the apps' fields live here, one category an app, thirty in `APP_CATS`** — a new
field goes in with its reading and its meaning in the app, and matches a whole label only; `FIELD_CATS`) · `nmt-model.json` ·
the three icons · `guide/` (seven real crops, light and dark, made by `tools/guide-shots.js`). `vendor/`: Tesseract and its
readers, dictionaries, OpenCC, `strokes.txt.gz`, `outlines.txt.gz` (~23 MB); `vendor/paddle/` (~30 MB) and `vendor/nmt/`
(55 MB) load on use; licences in `vendor/LICENSES.txt` and `vendor/ARPHICPL.TXT`. Not in the shell: `privacy.html`,
`README.md`, the three `SPEC-*.md` (pre-build designs, contradicted in places), `tools/` (guide-shots, standin, stroke-exemplars, field/), `docs/` (HISTORY.md, NMAX.md),
`.github/workflows/` (nmt fetch, mirror purge), `supabase/` (the relay and usage functions and the SQL H ran once).

Vanilla JS, no frameworks, **no build step**. `app.js` in reading order: helpers, SRS, IndexedDB, state → owner tools →
boot, rendering → online AI → usage, More, guide → voice → study screen and write pad → Add, cards, detail, edit form →
reading pipeline → character picker, drawing sheet → sign editor and save → camera, inbox, multicards, shared screenshots →
export, reset → service worker, mirror, shell check. Shared helpers: `askSheet`, `putCard`,
`pySpaced`, `eachLine`, `slineHTML`/`wireSlines`, `urlOf`, `fullPhoto`, `median`, `readingStatus`, `logErr`/`diagText`,
`busyHTML`, `apiErrText`.

## Persistence and deck format
IndexedDB `zeichentrainer` v3 — `progress` (key `id`), `custom` (all cards, key `id`), `inbox`
(photos), `settings` (key `k`); nothing else (hard constraint 3). `navigator.storage.persist()` is requested (MIUI evicts
non-installed sites).

`deck()` is `S.custom` sorted by `at` (oldest first; the Cards list shows newest first unless sorted, v780).
**The key is an id, not the text** (v118): `cardId(c)` = the text while free, else text + `#` +
timestamp. A card:

```
{ id, c:"坚果", p:"jiānguǒ", m:"nuts", t:"Custom"|"Sign", at, v:<build that made it>,
  seg:["坚果","\n","供应"], lb:"photo"|"auto",            // word breaks + the photo's line breaks
  kind:"sign", segs, gloss:[{w,p,m}],                  // sign cards
  shot:"shot_…", img:<crop Blob>, imgFull:<only when the inbox photo is gone>,
  frame:{x,y,w,h,a},                                   // fractions of the photo; Crop again starts here
  tags:[…], star:true, flag:true, flagNote, unchecked:true,
  trad:"養樂多", simp:true, ml:"de", ms:{en,de}, ds:{en,de}, dsh,  // script (v604); meanings, descriptions by language; a multicard text's short one
  cg:{en:[…]}, cgc:"三碗面",                             // each character's sense in this word (v772), valid for the text cgc (v804)
  alts:[…], ai:{zh,p,m,note,ok,bad,at,model}, aiNo:"<fingerprint of a dismissed suggestion>",
  mt:{src:"llm"|"dict"|"phrasebook"|"nmt"|"gloss", verified, pending, suspect},
  reading:{rect,at,failed,app,auto}, adding:true,      // saved before its reading finished; a blank from Add a text (v635)
  page:"page#…", dish:true,                            // one text of a multicard; a menu dish whose picture is its photo (v705/v710)
  from, fromT, of }                                    // a flashcard generated from a multicard text
```

A **page card / multicard** (v453): `{id:"page#<at>", kind:"page", t:"Page", c:<title>, name:{name,what,place}, ml, at,
shot, items:[ids], tags:[kind], mt llm-verified, v}` — no `img`, no progress row, never reviewed by the AI (its title goes
out as context for its texts' short descriptions, v698), **not in the Deck count** (v504).

**Pinyin only verified, with correct tones — never guess.** Meanings in the app's language. Dictionary/phrasebook prefills
stay `verified:false` until a human or the AI checked them; when unsure, flag rather than invent. A text the dictionary lacks whole
reads its parts' meanings, "three · bowl · noodles" — no characters in it (`lineMeaning`, v805).

Export/import: progress + cards as JSON, `shizi-YYYY-MM-DD.json.txt` (the filename is never read) through the share sheet;
import upserts by `id` in one transaction (v810). A refused share is said and not counted as a backup; the file is kept
10 min for the next tap (`EXPORT_KEEP`, v810). A failed write of a card, progress or photo is logged (`idbSave`, v810). Photos ride along as base64 behind a checkbox (v166). **The export duplicates a shared photo once per
card** — named, not fixed.

## The app

**Tabs:** Learn · Cards · Camera · More; **the phone's Back steps back one layer while anything stands over a tab's own screen, and leaves the app from a tab** (`histSync`/`histStep`, v815); the app opens on **Learn** (a start screen was built at
v181 and reverted at v183 — do not bring it back unasked). The Camera tab always opens at the top.

### Learn — the write pad (v512)
The study card is a CSS grid whose **frame never moves for the content** (v560): the cue and the pad are **two equal
squares** (v561/v607), then the fold row. `fit()` computes the frame per device, never per card, and re-fits on resize and once the layout settles (v521/v532).

- **A tap swaps the cue's two states** (v580), the photo big or the whole text big (`S.cueBig` `"pic"`/`"txt"`): every start
  opens on the photo (v572), and the state survives every stroke and swipe (v568). A card with no photo draws its word there (v578).
- **The pad is Duolingo-style tracing** (`mountPad`): the character's medians stand as a grey template with the next stroke
  lit; a stroke that fits snaps into ink, one that does not **shakes and is gone** (v592). Three levels by `charWrites[ch]`
  (trace / faint template / empty pad). Two misses offer **Show me**, four offer **Skip**, which fills the character in and
  grades `again`. The template is the real Kai outline (`outlines.txt.gz`, v517); before the stroke file is parsed the pad is
  its grid alone, after a failed load the free pad (v706–v710).
- **The grade is the writing.** The last stroke of the last character writes the review through `recordGrade`, counts the
  points (**one per character written without help**, v546), bumps `charWrites`, and queues the card **once more `REP_GAP` 3
  cards on**. A swipe or a tab tap grades nothing.
- **After each character** the pad fades, then (`CHAR_IN` 200 ms) its reading and meaning stand over the pad for `CHAR_MS`
  900 ms; after the last, the recap — the meaning and `d.p` grouped by word, no characters (v577/v616) — for `recapMs(d)`
  (`NEXT_MS` 3200 + `RECAP_SYL` 230 a syllable past the second, cap `RECAP_MAX` 5300). **In both readings the meaning is the
  big line, as large as `recapFit` measures (v600/v775), and the pinyin stands small and green under it** (v775, H); **the
  character's own reading carries the character itself, printed large at its head** (`.rg`, v777, H) — the card's recap does not (v577).
  A tap skips; **a control tapped during the recap holds it** — Details, Star, Flag or Edit: no timer, the recap stays on the pad
  through every redraw (`DWELL`), the next tap on the card moves on; a swipe begun in the recap is a swipe (v807). The star flies into the counter at `recapMs − POP1`; a milestone (50/100/250/500/1000 points, 7/30/100-day
  streak) bursts (v545).
- **The word line** (text state only) reads the character being written with its in-word reading, then its word
  (v518/v540); `shortSense` strips a parenthetical there only. **The character's meaning is its sense in this word** (`cg`,
  v772; `bestSense` until it lands; a card left without senses is asked once a session, `charsSoon`, v783), **valid only for
  the text it was written for** (`cgc`, v804); a text change drops it.
- **The Chinese is read aloud** (v773–v784): each character at its last stroke, alone (`sayChar`), **with its reading in this word** (a
  多音字 through a one-reading stand-in, `STANDIN`, 行 in 银行 → 航, `tools/standin.js`, v778); the whole text with the recap,
  **queued behind the last character, never in its place** (`say(text, after)`; not on a one-character card); a skip or a swipe
  stops it (`sayStop`). The phone's voice (`ttsVoice`: one that speaks on the device first, v814, then a natural one) at `SAY_RATE` .7; H's Xiaomi lists none and
  speaks through its system engine. Off under More → Learning (`learnSay`).
- **"Details"** folds open at the card's foot — characters, pinyin, meaning **and the description** (v585, asked by itself
  1.2 s after the card appears, `explainSoon`); then a grey toolbar **Star · Flag · Edit** (v667; Edit comes back to the card).
  The fold row shows a small star/flag when the card has them; **nothing sits on the photo** (v667).
- **The word being written is marked on the photo** (v533) — **switched off by `SPOT_ON` since v602**, code intact.
- **The photo zooms onto the character being written** (v617, `ZOOM_AUTO`): whole first, in after `AZ_OVERVIEW` or the first
  touch, gliding to each next character, out for the recap, at every level (v660). Its place: a sure ink box (`AZ_INK`), the
  reader's boxes, else the lines' layout (`charSpanAt`, `AZ_GUESS` .75, cap 2.2); cap `AZ_MAX` 3.5 — every rule of it in the
  v6xx notes and `grep -n "v669\|v678\|v749\|v78[25]" docs/HISTORY.md`. **It goes in once** (v665): after `AZ_READER` 2.5 s
  (`AZ_LOAD` 6 s until the reader's first answer, `PD_READY`, v786) on the ink's sure cut, and the reader's later place on that
  cut moves nothing (`st._azInk`, v785). **The zoom is the screen's** (`PIC_ZOOM` keyed by mode and card, v787). A flashcard
  from a multicard text zooms on its own region (`.region.me`, cap `AZ_MAX_PAGE` 5, v789). Off under More → Learning
  (`learnZoom`, v683); a pinch makes it the hand's (`ZOOM_HAND`).
- **Swipe** = the carousel (v417): the neighbour rides in and snaps; it grades nothing, a skipped card stays due. On a
  **zoomed** picture one finger pans, and pulling past the picture's edge hands the stroke to the swipe (v606).

### Cards
Square photo tiles, two a row, **nothing written under them** (v593); a text-only card draws its text in the picture (v506); **a
flashcard made from a multicard text shows its own region of the page** (`fitTileCovers`/`coverOn`, v791).
On the picture: the star (v425, one tap), the flag, AI, New and Traditional marks; a multicard adds its plates, count chip, progress bar and a
two-line title. **Two tabs, Cards and Multicards** (v477); the filter is **one pill and a sheet** (v365), **whose Sort by group orders
the list** (newest, oldest, pinyin, due soonest, most often forgotten; a multicard by time or title — `cardsSort`,
`sortCards`, v780, the open card's swipe follows); search also takes
toneless pinyin (`toneless`, v690); a long press marks (v354); the list keeps its place (v352/v445); the placeholder reads
"Text, pinyin or meaning" at 15 px (`#q::placeholder`, v800), so every column fits at 360 px. From `BACKUP_AT` 25 flashcards a never-exported deck shows **one backup line with Export** under the
search bar (v717). The **open card** swipes through the list (v445) and Test this card walks it as shown (v807); since v736 its block always stands — no "Details" bar,
no second character line, no Flagged pill — then one button (Test this card) and the study card's toolbar Star · Flag · Edit;
**Delete lives in the Edit form only**, which returns where the card came from. A description the card fetches by itself
lands **without a scroll** (v752); only a tapped Explain reveals its paragraph (v527). The character pages ("Cards with 行 ›",
v691–v717) **left at v737** (H) — do not bring them back unasked.

A **multicard's text is handled in its pop-up** (v792): characters, pinyin, meaning, price, the flag note, the AI suggestion
box, a **Details** fold **closed by default** (v741) with the short and long description, then the quiet toolbar **+ Flashcard
(Flashcard › once made) · Flag · Edit** (no Star, v493); after + Flashcard "✓ Flashcard made" stands `LK_NOTE_MS` 3 s and
Flashcard › in the tint (v794). While a sheet is open the page carries a spacer as tall as its reach (`lkRoom`, v793), so every
dot can be scrolled above it; a swipe to the next multicard closes it (v809). Flag redraws the sheet in place; Edit returns
to it (`editFrom:"lookup"`, `relookAfterEdit`); Delete lives in the Edit form. **No row list under the photo** (v792): a plain
row under "Not on the photo" only for a text no dot reaches (still being read, an unusable frame, fewer than `REGION_MIN`
placed texts, or no photo on the phone, v809); it opens the text's own screen, which frames its text alone (v700) and swipes
to the next (v707/v753). The multicard: **Add a text**, Delete multicard (v635/v711); dots and swipe in reading order
(`readingOrder`, `pageOrder`, v770); short and long descriptions in one call each for all texts (`pageShorts`, `pageDescs`,
v698/v753), read in the fold.
On a **menu** (kind Menu or half the texts priced) each dish shows its price at the right and name/pinyin/meaning without it
(`priceOf`, `isMenuPage`, `priceView` — a view, the record untouched, v699/v712; a price at the head of the meaning
takes its own token alone, v769; on a page tagged Menu a bare trailing number is the price too, `bareOf`, v816); its flashcard is the name alone (v713); a dish
with its own photo takes it as its picture (`dish`, v705); no count line on the multicard's screen nor on the Camera tab (v746).

### Camera — photo to card
The Camera tab is the camera: a hint naming photos and app screenshots (v799), the **shutter card** (Take photo, From album)
centred, work under it (v466/v470); a photo that made its card **leaves the tab** (v471). From album works through the batch one at a time while the app is open (v411; the
"to go" line counts what is left, `BATCH`, v761). **A photo becomes a card by itself** (v325): a
light band sweeps the photo, then the finished card with the quiet toolbar Star · Flag · Edit (v815; Delete in Edit). Save now (v237) makes the card before the reading
is done; Crop (v437) and Crop again (v239) hand the app's frame to the hand. **In the Edit form's Crop again a released frame
starts no reading: Save changes keeps the cut and reads it in the background** (v771); Read now reads it
in the form, Image only keeps the text. **The drawing sheet ("Not here? Draw it") opens its photo square on the character being drawn** (`drawPlace`: the frame, a sure ink cut, else the layout's estimate, v818). **Every stroke drawn on it snaps to a basic stroke** (`typeSnap` over the 29 exemplar strokes inline in `STROKE_EX` — medians and outlines, `tools/stroke-exemplars.js` — so no file is waited for, v820; drawn as smooth ink lines of one width, v822), **Done pins the matched character** when `strokeMatch` is sure (`pinTo`, at the pad's size, the missing strokes faint, `PIN_LOOSE` .2 of the strokes may stray; never while drawing, v821/v822), and **a candidate held goes onto the pad** (picker and sheet, `PIN.locked`): tap a stroke to remove it, draw it anew over its ghost; Undo walks the ops. **A character the learner set by hand is held** (`heldMark`/`heldKeep`, v822): the Edit form's AI check keeps it and fills pinyin and meaning around it. Recognition always reads the raw strokes (v819); Done waits `STROKES_WAIT` 8 s for the stroke file, then the print model reads alone, and Diagnostics' "Drawing sheets" names every event of the last three sheets (`SHEETLOG`, v820). The Camera tab's Crop reads a released frame by itself (`READ_WAIT`). A photo whose texts stand apart becomes **one
multicard** with a dot on every text (v453/v457), regions snapped onto the ink (v620); its photo pinches and pans like a
card's (v634). **Add a text** (v635) frames a missing text through Crop again; **the screen stays on while the app works**
(`appBusy`, v767/v768: every reading, loop, download and import); a blank never read is dropped on Cancel, a tab tap or a restart. A photo left on the tab with no card has **Read
again** (v739, the shutter's reading); Crop reads the framed part.

### More — four sections (v547)
**Learning** (Progress, Card order, the zoom and read-aloud switches, Check-up and the undo rows; Tags left at v588) · **Your cards** (Export, Import, Flagged cards, Photos,
Duplicate multicards when there are any, Storage) · **The app** (Share the app, Feedback, How to use the app, Language,
Meanings, AI review with the owner's setup form, Review queue, Usage sharing, Update notes, About, Privacy policy (v814), Open source licenses) ·
**Advanced settings**. The owner's tools fold behind one **Owner tools** row (Downloads, Mirror, Diagnostics with the reading tools —
Zoom check, Re-read all, Check texts, Rebuild all —, Still to test, All users, Feedback, Start over). **The long texts fold** (v717, `moreFold`, closed at every start): What is sent ⌄ on AI
review and Usage sharing, About the app ⌄, Write a message on Feedback; every word stays (v193).

**Owner's rows are English** and behind a password (`ADMIN_HASH`, SHA-256, a session-only unlock). **Diagnostics** keeps a
hundred readings, a hundred AI exchanges and a hundred errors, and survives restarts (v505) — it is the only window into the
phone, and every reader fix since v93 came out of a shared dump. Each reading carries a `numbers:` line with every value the
frame chain decided on (v399). **The dump prints the newest 8 readings and 20 exchanges whole and the rest one line each**
(`DIAG_READ_FULL`, `DIAG_AI_FULL`, v788: 779 KB became ~110); its head carries the reader's first answer, the screen lock, the
Learn session, the last 12 utterances of the voice (`SAYLOG`) and **every move of the session's place with its reason**
(`LLOG`, v802/v807: written, swipe, walk, filter, order, pulled forward, test this card, deleted, undo, pruned, queue built
again, restored — and "moved, no note" for a move no site named);
**the learn line names the card's id, its photo and crop, a peek, and what the study card's picture actually is**
(`LAST_FRONT`, v803: own crop, peek, page, dish, whole photo), and each zoom decision its time into the card and its screen.

## The reading pipeline
Photo (≤1600 px, EXIF baked in) → `proposeFrame` (ink rows on a chromaticity copy; a **screenshot, shared or from the album,
is read whole**, v450/v453) → **quick look** (one pass ≤1000 px; its confident boxes place the frame through `rectOfLines`,
only when at least three characters read at `PLACE_CF` 95 %, v319) → the reading proper: deskew, then competing passes at
several scales in a **pool of readers**, in colour, black-and-white and chromaticity copies, simplified and traditional
models, plus **the phone's reader** (PaddleOCR, `pdRead`, `vendor/paddle/`; its sure reading is the reading, v637/v641),
merged by line band and scored by `readingScore`/`effScore` → the editor.

- **What the reader sees must be a JPEG** (large canvas PNGs misread). **The reader is chaotic on large text** — read at
  several scales and let them compete.
- **A weak reading (`effScore` < `WEAK_READ` 180) sends the picture to the AI** (v173), at most `PIC_MAX` 800 px, **at the
  quick look** (v439). The reading **stops once a good answer lands** (v442), unless the
  frame was straightened.
- The AI's box is **snapped to the ink** (`snapBox`, v297 ff.); a box the model drew around exactly the text it read does not
  overrule the reader's own measurement (v449); **a band wider than its line's character count allows (`SNAP_WIDE` 1.6 × k ×
  its height) is a border or a bar and leaves; the model's box stands, the dump saying why** (`SNAP_WHY`, v795). **A snap that
  keeps less than `SNAP_ASK` 0.7 of the model's box's width or height is checked by the phone's reader on the same picture: its
  line for the answer's text, under the model's box, joins the frame** (one-line answers, no labels; `N.rdLine`, v796).
- A **panel or screen** answers `apart:true` with one entry per element; `splitCards` makes one card each. Boxes that are
  **a drawing rather than a measurement** (`templateBoxes`/`roundGrid`) send the app looking for the labels with the reader
  (v386–v391); a label it cannot place keeps the frame's own picture — **a card short of its own crop is the price, a card on
  the neighbour's button is not.** A surely read line the answer does not hold refuses the split (`panelCovers`,
  `PANEL_COVER` 0.8), except a line with one Chinese character or none (v757). At most `SPLIT_MAX` 60 labels.
- **No picture answer and five lines or more → no card** (v649, `NOPIC_LINES`); the photo stays on the Camera tab for Crop.
  Offline the card is still made. **A priced board the phone's reader reads surely is split by its own lines with no picture
  call** (v755/v756, `boardSure`: `BOARD_MIN` 10 lines, half priced, median 94, mean 90, 0.7 of the characters sure;
  `readerPicture` reads again at 1600 and asks the text model for the words in one call — only while the AI review is on,
  v808). **Any other board keeps the picture
  model** (v756: five of eight boards worse on the wide rule).
- **A strong winning reading with a sure line outside the placed frame places it again around it** (v684).
- The card's picture is the **square window** around the text (`windowRect`, `CARD_RATIO` 1), brightened where it needs it
  (`brightenBlob`: one curve read at the luminance, scaling the three channels alike, v798; the white balance keeps three
  curves, v418) and sharpened at the cut (v396).

## Online AI review, the relay, and what leaves the phone
`AI_PROVIDERS`: DeepSeek (default, reachable from China without a VPN), Qwen/Bailian (pictures; **must be called without
the VPN**), GLM, Claude, custom. One account per provider (`aiAccounts`); the phone's own key always wins. Text goes to
DeepSeek where possible (`textProvider()`), pictures to `pictureProvider()`; Qwen's thinking is off. Every request is tried
**twice** (v201) and aborted after `AI_TIMEOUT_MS` 25 s; a picture's first try after `PIC_TIMEOUT_MS` 60 s, its second after
`PIC_TIMEOUT2_MS` 120 s (v740).

**The owner's relay** (v191): a phone with no key posts to H's Supabase edge function, which adds the key, counts the call
and refuses past the cap — **a phone a day from `relay_config` (budget.sql, v817; without it qwen 80, deepseek 400), all phones
together `CAP_ALL` 6000, and the monthly ceiling in euros**; the owner's phone (`OWNER_INSTALL` secret) skips the per-provider
cap, never `CAP_ALL`, the switch or the ceiling. The Qwen endpoint follows the key's prefix (`sk-ws-` pay-as-you-go, `sk-sp-` Token Plan); both keys
are trimmed. **The function logs every call** (provider, bytes, status, seconds,
never the text): Edge Functions → ai-relay → Logs (the 江宁府 board's calls dead at 75.0 s, 2026-09-29, cause open).

**The picture model writes only what needs the picture** (v640, `picWords`): characters, boxes, board or not, kind, page;
pinyin, meaning and description come from the text model in the same `aiReadPicture` call. Words that do not come leave the
gloss, pending.

**Answers are checked, never trusted:** `zh` normalised to simplified; `saneM` drops a meaning that echoes the text or is
Han-only outside Japanese; `saneP` takes the model's pinyin only when **every token is a real Mandarin syllable**
(`PY_SYLLABLES`, v507); `aiSettled` refuses to change a character every pass read clearly (**the v143 rule**); **the AI's
pinyin is checked against pinyin-pro's in-word reading, and a mismatch or the model's own `unsure` flags the card** (v611,
`aiDoubt`); `mainLines` drops fine print, except on a board, menu, panel or screen (v456) — **a line's character size is its
box's height, and a vertical line's (taller than `FINE_VERT` 2.5 × its width) its width** (v801).

**What the app sends on its own is the whole of the privacy question** — `privacy.html`, More → "What is sent" and the guide
must say the same thing, corrected together (one alone went wrong at v403, v459, v534, v539).

## Languages
Ten columns in `lang.js`: en, de, fr, es, ja, ko, ru, vi, th, id. **English is the key**; a missing key falls back to the
English text, never to the key. **527 keys a column, ru 558 (three plural forms), en 15** (v819 — count by evaluating `lang.js`). `nOf`/`wordOf`/`PLURAL` carry the
counts.

- **The v412 rule: a pronoun or a count-agreeing verb must never cross a key boundary.** Render every count sentence at
  **1** in all ten columns before shipping it.
- **Tone (v255):** relaxed, the learner as a friend — du, tu, tú, 해요체, bạn, kamu; Thai with no sentence-final politeness
  particle. No formal register.
- Check for a **duplicate key** with a string-aware scan of the source that agrees with the evaluated count — a duplicate
  key in a JS object literal is silent and the later one wins (v371).
- **The v259 rule: a screen that changes takes the guide's sentence with it, in the same PR** — checked by rendering, not by
  grepping for one word (v589).
- The guide is six sections, five led by a **real crop of one part of one screen** (v598) and the sixth by a drawn figure
  (v599, `gfimg`). A crop must carry **no UI prose**, or it stops serving all ten languages; it is regenerated with the
  screen it shows — `node tools/guide-shots.js` in the PR that changes the Crop view, the Edit form's character strip, the
  write pad, the study card's front, the Cards tile, the language chips or the open card's character row (ratios must match
  `GF_SHOT`; restore the files the PR does not touch, the painted sign has random grain); a whole screen is banned (v549).
- Korean breaks at spaces (`html:lang(ko) body{word-break:keep-all}`, Chinese text excepted, v812).
- ja, ko, ru, vi, th and id are mine and **unchecked by a native speaker**.

## Hard constraints (learned in the field — do not violate)
1. **No external dependencies / CDNs.** Must run offline and behind the GFW. System CJK fonts
   only. Libraries and data go into `vendor/` with their licences.
2. **All paths relative** (`./…`). The app lives under a subpath.
3. **Persistence only via IndexedDB**, never localStorage/sessionStorage. The SW never caches a non-OK response (a cached 404
   once poisoned the dictionary for good).
4. **Phone-only deploys:** H uses GitHub in the phone browser. Small, clearly described PRs, as
   few files as possible; generate and commit binaries yourself, never ask H to upload.
5. **Privacy:** confidential text never goes into the public deck or repo. Keys live in the
   Supabase function's secrets, never in the code. Photos stay on the device apart from the
   documented AI picture path.
6. **Files leave the device only through the share sheet** — programmatic downloads are silently
   blocked by MIUI, and Chrome/Android shares `.txt` but not `.json`, hence `.json.txt`.

## Design (iOS-style since v82)
Light and dark follow the phone. Tokens on `:root` in `styles.css`, iOS system values, redefined in its dark `@media`:
`--bg` `--card` `--card2` `--fill` `--label` `--label2` `--label3` `--sep`, and `--tint` #C8372D / #E0483E (rings, dots, bars), **`--tint-ink` for red text (#FF6B61 in dark) and `--tint-fill` under white (#C8372D in both)** — 4.5:1 each (v816), `--ok`, `--warn`,
`--lock` (blue, a locked character), each with a `-soft`; `--photo-ar` **1** (the shape of any box a photo is shown small in,
never of the cut). Radii: cards 16 (`--rc`), buttons 12 (`--r`), fields 10. Fonts: UI = Apple system stack; Hanzi = Songti/STSong/Noto Serif CJK for the big
characters; `--mono` only for timestamps and Diagnostics. **Pinyin is set in the UI font.**

The script draws nothing in fixed colours — inline SVG uses `style="stroke:var(--…)"` and canvases read the tokens at
paint time (`cssVar`). The crop frame is deliberately theme-independent (white dashes with a dark outline). Body 17 px,
labels 13–14 px, meanings 18 px, **touch targets ≥ 44 px**, inputs ≥ 16 px, safe-area padding, plain words — no jargon, no
"OCR", no "·" shorthand, sentence case everywhere.

**The browser's own behaviours stay off the app** (v248/v249/v272): one `contextmenu` listener cancels the long-press menu on
pictures, canvases and controls; **no text is selectable** (`html{user-select:none}`, v694), only inputs and text areas are; `touch-action: manipulation` on body; autocorrect and spellcheck off on
the fields that hold Chinese or pinyin.

## Didactics / SRS
SM-2 light. Progress rows `{id, interval, ease, due, reps, fails, last}`; the settings row `days` holds the review days for
the streak, `daily{day:{r,w}}` the reviews and writes. `fails` counts consecutive `again`, and at `LEECH_FAILS` 4 the card is
**flagged automatically** — a leech is usually a bad card, not a bad memory. `KNOWN_DAYS` 21 is "known".

**Learn writes the review from the pad** (v512): "good", or "again" when a Skip helped. The three grades — Hard (`again`) /
Medium (`good`) / Easy in the traffic light's colours — survive only on a **marked photo's** sheet; `hard` is kept in
`schedule()` and is unreachable from any screen.

Session = due cards + up to `NEW_PER_SESSION` 8 new ones (a running session takes in a never-reviewed card only when it was made
after the session began, `S.sessionAt`, v807), **from short cards to long ones inside each group** (v524),
unchecked cards first (v515). A **starred** session holds **every** starred card, due or not, with the cap lifted (v429) —
a star is a hand-picked list, not a category. Card order (Oldest / Newest / Random) is H's own setting.

## Testing
No test files in the repo. Each session verifies in headless Chromium (Playwright, the pre-installed browser, a static
server under `/zeichentrainer/`, AI endpoints mocked with `page.route`); a seed fills IndexedDB before the app loads, scripts
drive the UI and read the globals `S`, `SIGN`, `DICT`. **Suites
live in the session scratchpad and are gone afterwards — rebuild what you need.** A serving root is built by **copying**,
never as a symlink into the repo. **`tools/field/` holds H's thirteen board and panel photos at 1600 px**
(v751, its README names each): a reader change is replayed on them with the real reader before it is judged. **H's five
Meituan and three Taobao screenshots are not in the repo** (his account and address).

Rules that came out of the harness and cost real versions:
- **A suite that pins a number breaks on every change to it — read the number from the page** (v413).
- **A check that cannot fail on the old tree is not a test** (v419). Run the suite against the previous version and say how
  many checks flip; label the ones that pass on both `[control]` or `[guard]`, with the reason beside them.
- **A green result whose mechanism is not the one claimed is worthless** (v439/v447).
- **A fit check must ask whether the text broke, not whether the box overflowed** (v427).
- **A gesture fixture must use the gesture the phone uses** — a wheel zoom is not a pinch (v606/v614).
- **A probe of the app's own model of an animation cannot see what the compositor paints** — `Page.startScreencast` (v555).
- **When the harness and the phone disagree, the harness is wrong and that is what gets fixed first.** No heuristic is
  tuned against numbers the phone did not actually send (v384).
- **A suite that freezes a copy of the build stops being a test the moment the build moves** (v419).
- A fixture must carry the field case's own shape — its angle, its own photo, its own answer (v446/v552).
- Layout is checked by screenshot at 390 px (and 360 px), light and dark, in German and in the widest language for the row.

## Working with H — the how-to rules (v128)
**What H sends.** One request per message: a sentence, and a screenshot when it is about a screen; when the reader is
wrong, More → Diagnostics → Share with it. "Leave it as it was" means: revert, no discussion.

1. **Restate before building.** One sentence: what changes for H on the phone. Two readings that lead to different work →
   one question, not five. Otherwise no questions.
2. **Size gate.** Wording, layout, a rule in the reader, a bug: build at once. **Anything that changes how H handles the
   app** (a new gesture, field, control, screen or flow) is described first in three lines — what H does, what he sees,
   what it costs — and waits for "go".
3. **Only the ask.** No "while I'm at it" changes. Cleanups only when H asks for them.
4. **Field first.** A reader change is judged by the phone, not by the harness. Every claim about the phone is either seen
   on the phone or marked "not yet field-checked".
5. **One request, one PR, one version.** Three version markers bumped, the suites that touch the change run, the record
   updated in the same PR, merged by Claude, branch reset onto main.
6. **The record is the memory.** Decisions, rejected features and field lessons go in with the reason. What H rejected is
   not brought back unasked.
7. **Report short, in English.** What changed, what was verified and where, what is open. **Honesty over confidence:**
   "I don't know" beats a guess; limits and costs are stated plainly.
8. **Wording and design** follow the rules above — they are not up for interpretation.
9. **Tone: relaxed.** "This is a fun app. No formal, boring translations within the app. Customers are passionate language
   learners. Same for the design and layout."

**`WHATS_NEW` (v408):** every PR that changes something a learner would notice adds one English sentence keyed by its
version, **with its nine translations in the same PR** (v816); More → About lists the last five as a bulleted list and a line slides up after an update. **Most
versions get no note — that is correct.** A note describing a control that no longer exists goes with the control (v534).
The owner's twin is **`TO_TEST`**, the Still-to-test list under Advanced settings: **a reminder of what still has to be
corrected and checked, nothing else** (v748, H). A PR that ships something only the phone can judge adds its line; **the line
goes, unasked, the moment H's report or his own use settles it**. Keep each entry inside **35 columns**.

## Field lessons that shaped the app (keep)
The full list is in the archive; these are the ones that keep biting.

- **The frame never moves for the content; the content adapts to the frame** (v560).
- **A class written for one shape is not a free ride for another** (v413/v432/v487). **Inheritance loses to any matching
  rule, however weak.** **A clamped box wants a whole-pixel line box** (v593).
- **Presence that costs width is not free in a ten-language app** — check the tightest language *before* (v474).
- **A guard whose lifetime is a timer does not cover the gesture it guards — end it on the event that ends the gesture**
  (v589). **A guard asserted by setting its own state by hand is not tested — drive the button that sets it** (v468).
- **A second copy of one number drifts.** One rule, one reader; an unavoidable copy is named on both sides (v401).
- **A constant that holds only because something else is being cut stops holding the moment the cutting stops** (v600).
  **A static estimate that must be safe for every card is wrong on most of them** — measure (`recapFit`).
- **A dead constant or class leaves with its last user** (v307); **a false comment is a defect** (v404).
- **An undefined CSS custom property takes its entire declaration with it** — grep every `var(--x)` against `:root` (v589).
- **The app must say what actually happened** — a record that claims an answer was used when it 404'd costs days (v384 ff.).
- Status text lives in state and is re-queried on every render (v47); a long-running action keeps its state **outside**
  the row it was started from (v257).
- **`git checkout -B <branch> origin/main` uses the local ref** — `git fetch origin main` first (v458/v459). After a
  **squash** merge, reset the branch onto `origin/main`.
- A tap on a scrollable layer is read from the **click** event, not `pointerup` — iOS sends `pointercancel` (v206).
- The worker helps only while it **controls** the page; a page with no controller needs its own origin-then-mirror rule (v335).
- **No VPN is needed to use the app.** Updates and vendor files come through the jsDelivr mirror (`fastly.jsdelivr.net`;
  `cdn.` is DNS-hijacked in China, v483), purged on every push by `purge-mirror.yml`. A **first install** still needs
  github.io — the only fix is a second origin, and **H chose Cloudflare Pages on his own domain, later.**
- The reload after an update waits for a pause (v279/v327), never while a photo is on its way from the camera (v316) **or
  being processed** (`PENDING_SHOT`, v779), and at most once in ten minutes (v563).

## Play Store and the Android shell
**Decided 2026-09-23: a shell around the web app, not a native rewrite; payments native, credits on the server.** The shell
(since 2026-09-30) is a plain Kotlin WebView app in the private repo `henglicam/zeichentrainer-app`, which has its own
`CLAUDE.md`: it loads the live Pages URL, keeps its own storage (not Chrome's), and its Quick Settings tile "识字" hands a screen
capture to the page as a shared screenshot (`importPhotos(…, {shared:true})`). Taking the public site down would break every
installed copy. **China is the Play account's country, fixed forever; Data Safety form = `privacy.html` = the code; the
paid/free choice is irreversible and settled with H first; `strokes.txt.gz` and `cedict.tsv.gz` stay freely available under
their own licences even after a sale** (Arphic §2b, CC BY-SA). The rest: `grep -n "What law applies\|Native shell" docs/HISTORY.md`.

## Open / not yet field-checked
**H's rule (v748, 2026-09-29): what he does not come back to is settled.** A version he has used without a complaint counts
as field-checked; only a question he is still raising is open. Open now: every row of `TO_TEST` (app.js; More → Owner tools → Still to test), and the two field cases: **the Learn jump off a flashcard made from a multicard text** (H, 2026-10-01 evening — v807 fixed the likeliest cause, a control tapped during the recap; the next dump names every move, v802/v807); **a photo card carrying another photo's text** (H, 2026-10-01, 全家 on the 三碗面 sign; `grep -n "v803" docs/HISTORY.md` — the dump names the record and its picture since v803).

**Named and waiting for H's word** (each changes how he handles the app, so each waits for a "Go"): re-cutting the deck
square (`RECUT_V` 5 → 6, ~95 ms a card, no undo); dealing every card on its photo — today one tap leaves every later card
face-up (`S.cueBig`; the change reverses v568); on a card of several words the tap shows the **first word's** pinyin and
meaning; the pad **prints** the character at levels 1 and 2; the star counter (28 px tall) is under the 44 px rule; an offline
weak reading still makes its flagged card.
