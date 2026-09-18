# Flashcard layout — specification, draft 1 (2026-09-18)

H's brief, in his words (a sketch and a note, 2026-09-18):

> Reihenfolge auf screen: 1. Photo · 2. Character buttons · 3. Pinyin + Sound · 4. Übersetzung · 5. Schreibfeld (1 character nach dem anderen. Voll ausschreiben gibt Punkte.)
> Recommended max 4 characters pro Line, max 2 lines.
> Longpress auf character button locks/highlights it. Vibration als on/off Bestätigung. Left/right scroll zeigt andere Karten mit gleichem highlit character.
> Tip auf word → wird im Schreibfeld angezeigt. Voll ausgeschrieben: nächster Character bzw. nächstes Bild.
> Tippen erneut auf highlit character exits it and shows full image Translation of the current card.
> Vertical screen wird voll ausgenutzt. Reinzoomen und verschieben im Bild ermöglichen.
> All new Cards flagged for review, must manually unflag. Can re-flag in Learn mode.
> Non rating buttons. No "studied yet" info.
> Display logic: Karten mit Charaktern, die häufig vorkommen, werden öfters angezeigt. Schreiben dieser Character stuft Anzeigehäufigkeit wieder herab.
> In einer Session sind die fertigen Karten noch vorhanden, in einer neuen erstmal nicht.
> Flashcards sollen offen und geschlossen scrollbar sein.
> Vertikale Aufteilung des Screens (Proportionen) ordentlich hinkriegen. Gesetzt: Write pad = quadratisch. Dabei auch das Default-Crop-Format überdenken.

The sketch: one card filling the screen — the photo at the top, a small glyph in its top-right corner, a row of character buttons under it, a collapsible block with pinyin + sound and the translation, a large square write pad with a chevron on either side, and a one-line pinyin/meaning strip under the pad.

**In one sentence:** a flashcard is no longer *revealed and graded*, it is *written* — the photo is the cue, the characters under it are the targets, the write pad is the answer — traced stroke by stroke as in Duolingo — and the grade is whether you could write it. Builds on PWA v511. Every constraint in CLAUDE.md applies unchanged. **Nothing here is built.** The "Go" is per phase (§ 12); each phase is one PR, one version.

**What this reverses, named up front so it is decided and not slid into:** the two-button vote of v497 (Not yet / Got it) and with it every grade button since v82; the 田字格 reticle as the front's text box (v82, v223) — the grid moves into the write pad; the tap-to-reveal front of v55 (the card is open from the start, the *answer block* is what folds); the "flag only a doubtful reading" rule of v325 (every new card is flagged until H unflags it); the `Not studied yet` / `New` state text (v134); the v428 pull-forward-on-again mechanism (there is no `again`); and the v429 "a starred session holds every starred card" rule is untouched but the star itself is not in the sketch (§ 13, Q6).

## 1. What changes for H on the phone

Today (v511): Learn shows the photo over a text box; a tap on the text reveals pinyin, meaning and the parts row and puts **Not yet / Got it** under it; a swipe moves to the next card; the drawing pad exists only inside the picker, two taps away from a reading, and never in Learn.

With this spec: Learn shows **one card that fills the screen**. The photo at the top, the card's characters as **buttons** under it (at most four a line, two lines), then a folded block that opens to **pinyin with the speaker and the meaning**, then a **square write pad** with the app's 田字格 grid, and under it one quiet line — the pinyin and meaning of the character being written. H taps a character, it stands in the pad as a grey template with the next stroke lit; he traces it stroke by stroke, a fitting stroke snaps into ink, a wrong one shakes and the pad shows him the path; when the last stroke snaps, the pad clears and moves to the next character by itself; when the last character of the card is written, the card **counts as reviewed** and the next card slides in. No button is ever tapped to grade. A **long press** on a character button locks it (a short buzz), and the swipe then walks only the cards that contain that character; a tap on the locked button releases it, shows the whole photo and opens the answer block. A pinch zooms into the photo, a drag pans it. The card scrolls as a whole when the screen is too short, folded or unfolded.

## 2. What already exists and is reused

| Piece | Exists as | Used for |
|---|---|---|
| The photo box with the blurred fill | `.picbox`, `frontPic`, `pageHTML`/`srcView` (v224, v452, v489) | zone 1 unchanged; a generated card still shows its multicard's photo with its own text framed (v499) |
| The card's parts as buttons | `cardParts`, `charsHTML`, `wireChars`, `charInfo` (v82, v309, v430) | zone 2 — the buttons are the parts row, moved from the back to under the photo, one character each |
| Pinyin, speaker, meaning, the language pill, the reference pill | `backHTML`'s `.pin`, `sayBtn`, `.mean`, `mlPill`, `srcPill` (v164, v258, v494) | zone 3, inside the fold |
| The square pad with its grid, stroke capture, Undo/Clear | `openDrawSheet`'s `.pad`, `paint`, `DRAW_SIZE` 720 (v65) | zone 4 — inline in the card, not a full-screen sheet |
| The strokes of a character, in order, and the distance between two strokes | `STROKES` / `loadStrokes` (9,534 characters, Make Me a Hanzi, v141), `prepStrokes`, `strokeDist`; `recognizeStrokes` (print model) as the fallback | the template, the lit next stroke and the per-stroke test (§ 6) |
| Pan and pinch on a picture | `attachRefView` (v70: one pointer pans, two pinch, wheel zooms) | zoom and pan in the photo box (§ 4) |
| The carousel | `wireSwipe(card,o)` with `peer`/`go` (v417, v445) | the swipe between cards, and the locked-character walk (§ 7) |
| The session, the schedule, the review count | `buildQueue`, `learnDeck`, `recordGrade`, `schedule` (SM-2 light), `dailyBump`, `days` | a written card is a review (§ 8) |
| The flag | `setFlag`, `flagNoteHTML`, the Flagged filter, `LEECH_FAILS` (v82, v94) | every new card flagged (§ 9) |
| The buzz | `navigator.vibrate(12)` from the long-press marking (v354) | the lock's on/off confirmation |
| Points per day | setting `daily {day:count}` (v274), the 30-day strip in Progress | the written characters per day, beside the reviews (§ 8) |
| The hints while the app is new | `showHints`, `HINT_REVIEWS` 20 (v226) | the two new gestures explained once (§ 11) |

Nothing in the reader, the AI, the Cards tab, the multicard or the camera changes. The Cards **detail** keeps its own layout (front, back, Test / Edit / Flag / Share / Delete); "Test this card" opens the new Learn card for that one card, as today (`S.single`).

## 3. The screen, zone by zone, and the vertical budget

The card is `.card.study` and takes the whole of `#main` below the header: `#main.center` is off in Learn, the card is `min-height` of the pane and the tab bar's own padding stays. **Measured room at H's own 390 × 844 (Chrome/Android, the app installed):** header 60, tab bar 56 + safe area, `#main` padding 16 — about **700 px** for the card, its inner width 358 (322 with the card's 18 px padding, as every front measures today through `frontWidth`).

| Zone | What | Height at 390 px | Rule |
|---|---|---|---|
| 1 Photo | the card's picture in the photo box, pinch and pan | **179** (2:1) — see § 4 for the ratio decision | never taller than 35 % of the card's room; a page/multicard front keeps `--pageh` |
| 2 Characters | the character buttons, 1–4 a line, 1–2 lines | 56 a line + 8 gap → **56 / 120** | a text of more than 8 characters wraps into 3 + lines and the pad shrinks first (§ 3.1) |
| 3 Answer | folded: one 36 px row with a chevron ("Pinyin and meaning ⌄"); open: pinyin + speaker, meaning, the pills | **36 / ≈ 110** | folded on every new card (§ 5) |
| 4 Write pad | square, `DRAW_SIZE` 720 canvas, the 田字格 grid, a chevron on each side | **W** = min(inner width, room left) — 322 at 390 px with the answer folded | **square is set (H)**; it shrinks before anything else does |
| 5 Line | the character being written: its pinyin and meaning, one line | **40** | `--label2`, 15 px, ellipsis, never wraps |

Sum at 390 × 844 with one character line and the answer folded: 179 + 56 + 36 + 322 + 40 + 4 gaps of 12 = **681 of 700** — it fits without scrolling. With two character lines (+64) or the answer open (+74) it scrolls, which is what H asked for ("offen und geschlossen scrollbar"). At 360 × 740 (a friend's phone, the v474 rule) the room is about 600 px: the pad takes what is left after zones 1, 2, 3 and 5 (600 − 179 − 56 − 36 − 40 − 48 = **241**, still a comfortable square — the v65 drawing sheet gives 295 on 844 and H draws on that today).

**3.1 What gives way, in order.** The pad shrinks down to `PAD_MIN` 200 px; then the card scrolls. The photo never shrinks below 2:1 at the card's width and the character row never wraps a line into a scroll. **The pad is never under the fold** on a phone of 740 px or more with a one-line text and the answer closed — that is the invariant the suite measures (§ 12).

**3.2 The chevrons beside the pad.** The sketch's `<` and `>` at the pad's sides are the previous and next card: a tap does what a swipe does (§ 7). They exist because a swipe *on the pad* is a stroke, not a swipe — the pad has `touch-action:none` and takes the finger — so with the pad filling the lower half of the screen the swipe's own surface is the photo and the character row, and a learner mid-drawing needs a tap target too. They are 44 px, `--label3`, and hidden at either end of the walk.

**3.3 The glyph in the photo's top-right corner** is read as the **review flag** (H: "Can re-flag in Learn mode") — ⚑, tint when set, `--label3` when clear, one tap toggles, sitting on the picture as the star does on a Cards tile (v465/v469). See § 9 and Q1.

## 4. The photo: zoom, pan, and the crop format

**Zoom and pan** (H: "Reinzoomen und verschieben im Bild ermöglichen"): the photo box gets `attachRefView`'s gestures on an image, not a canvas — one pointer pans, two pinch around their midpoint, the view clamped to the picture; a single tap without movement still swaps the crop for the whole photo (v55) and a tap on the whole photo goes back; the zoom resets on the next card (`S.fullPic`'s rule). While zoomed the box carries `touch-action:none`, so the carousel does not steal the pan — the swipe's surface is the character row and the answer block then. **The multicard/page front is excluded** from the zoom in phase 1: its regions are positioned by percent on the rendered picture (v452), and a transform under them needs its own measurement.

**The default crop format — H asked for it to be rethought, and the measurement says keep the stored window and change the box.** v329 measured 21 real photos: one-line signs and labels run 2.3–6.8:1, posters, plates and two-line signs 0.9–1.6:1, almost nothing near 16:9. The stored `img` is a 16:9 *window* around the text frame (`windowRect`, `FRAME_RATIO`), and the *box* it is shown in is 16:9 too (`.picbox`, 201 px at 358). With a square pad under it, 201 px is 22 px more than the budget in § 3 allows. **Three options, and a recommendation:**

- **A — box 2:1, window stays 16:9 (recommended).** The box is 179 px; a 16:9 window is fitted inside with 11 px of blurred fill above and below — the v232 fill, which exists for exactly this. Nothing stored changes, no re-cut pass, every card on every phone keeps its picture, and the zoom (above) is what brings a one-line sign to full width. Cost: 6 % of the picture's height shows as fill on every card.
- **B — window and box both 2:1.** A re-cut pass over the deck (the v418 mechanism, `RECUT_V` 4) so the picture fills the box. Cost: every card changes under the learner once more, and a poster's window loses height it had.
- **C — square window, square box, the pad beside it.** The sketch's photo is wide, not square, and a square box costs 358 px, half the card; rejected on the arithmetic alone.

**Decision D1:** A, unless H says otherwise. `FRAME_RATIO` is untouched; a new `PIC_BOX` 2 governs `.picbox`'s `aspect-ratio` on the study card only (the Cards tiles keep 4:3, v465; the detail keeps 16:9).

## 5. The character buttons and the answer block

**Zone 2** draws `cardParts(d)` split into single characters — one button per character, `.ch` in the Hanzi font at 30 px, 56 × 56, the hairline tile of `.ck` — **in the text's order and with its repeats** (v430's rule: the second 勿 of 骑车勿盯 / 还车勿忘 is its own button). The photo's own line breaks (`frontLines`) decide the rows; a line of more than four characters wraps at four (H: "max 4 per line, max 2 lines" is the recommended shape, not a limit — a 16-character escalator sign gets four rows and a shorter pad, § 3.1). A traditional card shows its traditional characters on the buttons (v101's rule for the front) and the pad's target is the traditional glyph too, since that is what the learner sees and the stroke database has both forms. A number with its unit (24H, 380ml) is one button and is **not writable** — a tap on it shows its line (§ 6) and the pad stays on the last Chinese character.

**States of a button:** plain; **current** (the one in the pad, filled tint — `.ck.on`); **written** (this session, `--ok-soft` with a small check); **locked** (long-pressed, tint ring plus the check-and-cross pair's own weight — § 7).

**Zone 3, the answer block,** is `backHTML(d)` minus the parts row (which is zone 2 now) and minus `charsHTML`, inside a `<details>`-like fold: the summary row reads "Pinyin and meaning" with a chevron, the open block is pinyin + speaker, the meaning, the language pill, the reference pill (a button, v494), the simplified reference of a traditional card (v227), the flag note and a waiting AI suggestion (v82) with its Accept / Dismiss. **Folded on every new card** — the block is the answer and the card is a test; it opens on a tap on the summary, on a tap on the locked character (§ 7), and **by itself when the card is fully written** (§ 6), since then there is nothing left to hide. Whether it was open is not remembered across cards (D2; the alternative, remembered per session, is one line).

## 6. The write pad — stroke by stroke, as Duolingo does it

H, while this was being written: **"Das Schreibfeld soll wie bei Duolingo funktionieren."** Duolingo's character exercise is *tracing*, not free drawing: the character stands in the pad as a grey template, the **next stroke is shown** (a highlighted stroke with a small arrow at its start), the learner draws it over the template, a stroke that fits snaps into place in ink and the next one lights up, a stroke that does not fit shakes and fades and the hint animates the stroke's path once; after the last stroke the character flashes complete and the exercise moves on. That is the pad, and everything the app needs for it is already on the phone: the stroke medians of 9,534 characters **in stroke order** (Make Me a Hanzi, `strokes.txt.gz`, v141), `prepStrokes` (a stroke resampled to eight points in the character's unit square) and `strokeDist` (the distance between two such strokes).

**The target.** A tap on a character button makes it the current one; the first Chinese character is current when the card lands. The current character is drawn in the pad as the **template** — its medians as strokes in `--label3` at 30 % opacity, stroke width 22 as the pad's ink, scaled into 80 % of the pad's square — and the line under the pad (zone 5) shows that character's own pinyin and meaning (`charInfo`'s data without opening a sub-row). **The next stroke to draw** is drawn over the template in the tint at 55 %, with a 10 px dot at its start (`prepStrokes`' first point). A learner who knows the character sees the whole shape and one lit stroke; one who does not sees exactly where to begin.

**The test, per stroke.** On the `pointerup` that ends a stroke, that one stroke is resampled (`prepStrokes` on the single stroke, in the *template's* frame — the pad's square is the character's unit square, so position counts, which is what tracing is) and compared with the expected median through `strokeDist`. Under `TRACE_OK` **0.28** of the unit square (v141's confident match is 0.4 over a whole character; a single traced stroke over a visible template must be tighter — the number is a starting point and the field sets it, § 14) the stroke **snaps**: the drawn line is replaced by the median drawn in ink (`--label`), 120 ms, and the next stroke lights up. Over it, the drawn stroke **shakes** (a 3 px horizontal jitter, 240 ms), fades out, and the expected stroke's path is **animated once** in the tint from its start dot — Duolingo's hint, nothing else — and the pad waits for the stroke again. A stroke drawn **backwards** is refused too, since direction is the one thing a tracing exercise is for — which means the test reads the *forward* distance alone, not `strokeDist` as it stands: that helper takes the smaller of the forward and the reversed distance plus 0.12 (v141, written so the reader forgives a backwards stroke), and the pad must not. **The stroke order is the template's**, strictly: a stroke that matches a *later* median is refused like any wrong stroke. That is deliberate and it is not v141's rule — v141 made recognition order-free because the *reader* has to accept H's own order; the pad teaches the order, so it holds it (Q9 asks whether that is too strict for him).

**Two misses on the same stroke** show a "Show me" link under the pad, which animates the stroke's path at half speed as often as it is tapped; **four misses** offer **Skip** beside it, which draws the stroke in ink as if written and marks the character *helped* (a point fewer, § points). `prefers-reduced-motion` turns the shake and the animation into a plain tint flash and a static path.

**When the last stroke snaps:** the whole character flashes `--ok` once (300 ms), the button turns *written*, a short buzz, and after 250 ms the pad clears and the next unwritten character becomes current with its template. After the **last** character of the card: the answer block opens by itself, the card counts as **reviewed** (§ 8), the points land, and after `NEXT_MS` 900 ms the next card slides in (the carousel's own `go`). The learner can swipe on before that, or back to the finished card — it stays in the session (§ 8).

**Undo** takes back the last *snapped* stroke (the pad's own Undo, v65) and relights it; **Clear** starts the character over. There is no free-drawing mode in Learn: a stroke is either the next stroke or a miss — the two-square drawing sheet of v65 with its whole-character recognition stays for the picker, untouched.

**A character the database lacks** (`STROKES` has 9,534, the medians of the traditional forms among them) has no template and no strokes to trace: the pad shows the character alone in `--label3`, takes free strokes, and the print model (`recognizeStrokes`, v65) has to name it in its top three on **Done** — the line says "not in the stroke set — draw it and tap Done", the one place the old Done button survives. A number with its unit (24H, 380ml) is never a target (§ 5).

**Points** (H: "Voll ausschreiben gibt Punkte"): one point per written character, **none for a character that needed Skip**, plus the card's character count again when the whole card is written with no Skip and no more than one miss per stroke — 鸡蛋 traced clean = 2 + 2 = 4. Points are counted per day in setting `daily` beside the reviews (`daily[day]={r,w}` — the strip in Progress shades by reviews as before, and a fourth tile reads "Written today N", D3) and all time in `usage.written`. No level, no badge, no streak of their own: the number is the reward, which is the app's own restraint (v274). The daily usage row carries `written` (privacy.html names it).

**What the pad does not do:** read the photo — the photo character stays in zone 1, where the zoom (§ 4) brings it up.

## 7. Lock a character, walk its cards

**Long press** (`LP_MS` 500, `LP_MOVE` 10 — the v354 gesture) on a character button **locks** it: a buzz (`vibrate(12)`), the button takes the lock look, and `S.lockChar` is set. The session's walk changes: the carousel's list becomes **the cards of the current filter that contain that character** (`learnDeck().cards.filter(c=>[...c.c].includes(ch))`, in the session's order), starting at the current card; the header's Due capsule shows that count. Every card in the walk shows its own characters as buttons and **its own copy of the locked character already in the lock look**, so the learner sees where the character sits in each word. Writing works as before on every card of the walk.

**Release:** a tap on the locked button (H: "Tippen erneut auf highlit character exits it") — a buzz, the lock look goes, the walk is the session again at the card the learner is on, **and the card shows the whole photo with the answer block open** ("shows full image Translation of the current card"). A long press on another character moves the lock. A tab tap clears the lock. Nothing is written to disk — `S.lockChar` is session state, noted in `viewNow` like `S.queue` (v423) so a reload comes back locked.

**Where the walk's cards come from** is the whole deck under the current Learn filter, due or not — a locked character is a hand-picked list exactly like the star (v429's argument), so the due date does not withhold a card that carries it. A character on no other card gives a walk of one; the lock still holds (the button's look says so) and the chevrons are hidden.

## 8. The session and the schedule — no rating buttons

**The grade is the writing.** `recordGrade(c,"good")` fires when a card is fully written (§ 6) — the normal SM-2 interval, exactly what *Got it* wrote at v497. A card **swiped past unwritten, or skipped** writes nothing: it stays due and the next session brings it back — which is v417's rule for a swiped card already. **There is no `again` from the screen**, so v428's pull-forward-on-again never fires, and `LEECH_FAILS` never triggers from Learn (the flag of § 9 replaces that signal). `schedule()` keeps every grade for the rows that carry them, as it kept `hard` since v421 and `easy` since v497.

**The order of the session** is the new part (H: "Karten mit Charaktern, die häufig vorkommen, werden öfters angezeigt. Schreiben dieser Character stuft Anzeigehäufigkeit wieder herab."). Today `buildQueue` orders the due cards by due date and the new ones by creation. Now, inside each of those two groups, the cards are sorted by **weight, highest first**:

```
freq(ch)   = the number of learnable cards whose text carries ch          (counted once per session, over learnPool())
writes(ch) = setting charWrites[ch], how often ch was fully written, all time
weight(card) = mean over the card's Chinese characters of  freq(ch) / (1 + writes(ch))
```

A card of common characters that have never been written comes first; every full write of a character halves its pull on the next session, then thirds it, and so on. `charWrites` is a settings map keyed by character (the same reasons v478 gave for `lookups`: not on the card, not in the progress row), capped at `WRITES_MAX` 3000 keys least-written first, in `RESET_KEYS`. **Card order (v153) stays the choice of the group order** — Oldest / Newest / Random still decide the order *within equal weight*; the weight sorts first (D4: the alternative, weight as a fourth chip beside the three, keeps the old orders exactly and is one line more).

**A finished card stays in the session** (H: "In einer Session sind die fertigen Karten noch vorhanden, in einer neuen erstmal nicht."): it stays in `S.queue` at its place with its buttons in the *written* look, swipeable back to; the Done capsule counts it. A new session (`buildQueue` at the next open, or a reload past `RESUME_MAX`) does not hold it — its due date has moved out. That is today's mechanism, unchanged; only the "finished card disappears at once" of the vote goes.

**"No studied yet info":** the `Not studied yet.` line and the `New` / `Review` pill of the card detail's badge, and the `isNew` argument `tagsHTML` takes, go from the detail for every card (v498 took them off a multicard's text already). The SRS line ("Next review …") stays on the detail — it is a date, not a verdict.

## 9. Every new card is flagged until H unflags it

v325's rule — flag only a doubtful reading — is replaced: **every card the app makes from a photo carries `flag:true`** with the note "new — check text, pinyin and meaning" (the v245 shape), the automatic card, the Save-now card, every label of a split panel, the generated flashcard of v487 (which copies the text's flag since v503 anyway). A card typed by hand in the Add form is not flagged (the learner wrote it). The flag comes off by hand only: the ⚑ on the study card (§ 3.3), the detail's Clear flag, or the Edit form's checkbox; Accept on an AI suggestion **no longer clears it** (v82's rule reversed for this one field — the AI checked it, the learner has not). The Flagged filter and More → Flagged cards → Share keep their meaning: "the cards I have not looked at yet". The leech note (`LEECH_FAILS`) is unreachable from Learn and stays for the progress rows written before.

**What it costs:** the Cards list shows the ⚑ mark on every fresh card until it is cleared, and the count on the Flagged row is the count of unchecked cards, which is the point.

## 10. Data model

```
progress row:   unchanged ({interval, ease, due, reps, fails, last}) — a full write is grade "good"
card:           unchanged; flag:true on every photo card at creation (§ 9)
settings:       charWrites  {ch: n}          (§ 8; RESET_KEYS)
                daily       {day: {r, w}}    (v274's count becomes an object; a plain number read back is {r:n, w:0})
                learnPad    "on"|"off"       (Q5 — the pad hidden is the closest thing to today's card)
usage:          written (all time), writtenMonth
S:              lockChar, curCh, written:Set of "id:i", pad {strokes}, picZoom {cx,cy,side}
viewNow note:   + lockChar, curCh, written (the session survives a reload, v423)
export/import:  nothing new on the card; charWrites is a setting and stays on the phone (as lookups did)
```

## 11. Wording, hints, the guide

New keys, ten columns each (the v259 rule, the guide's Learn section rewritten in the same PR): "Pinyin and meaning" (the fold's summary), "Show me", "Skip", "not in the stroke set — draw it and tap Done", "Written today", "new — check text, pinyin and meaning", and the two hint sentences under the card while the app is new (`showHints`): "Trace the lit stroke; the pad moves on by itself." and "Press and hold a character to see every card that has it." The v226 rule holds — the hints go after `HINT_REVIEWS` 20 reviews. Every key is written per column against its own vocabulary and measured at 390 and 360 px (the v427 rule: does the text break inside its button, not does the box overflow).

Gone from the columns when phase 1 lands: "Not yet", "Got it" (again — v488 removed and v497 restored them), "Tap the character to reveal" and its two photo fragments, "Not studied yet.", ", or the photo for the text alone". The `WHATS_NEW` line: "Learn is a write pad now: write the characters of the card, and it moves on by itself. No more grade buttons."

## 12. Phases, each one PR

1. **The layout and the pad** (the big one): zones 1–5, the fold, the pad with the per-target match, "fully written" → review → next card, points in `daily`, `charWrites` written, the vote and the reveal gone, the detail's state text gone, the guide. Suite `verify-writepad` (the strokes driven through real pointer events on the pad, not through `el.strokes`): the five zones in order at 390 × 844 and 360 × 740 with the pad square, never under the fold with a one-line text, and shrinking before the photo does; a tap making a character current with its template and its line; H's own 团 strokes from `DRAWLOG` (v140) replayed one by one, each snapping in order; a stroke drawn a quarter of the pad off shaking and not snapping, the hint animating once; a later stroke drawn first refused; a backwards stroke refused; Show me after two misses and Skip after four with the character marked helped; the last character opening the answer, writing the progress row as `good`, the points and `charWrites`, and the next card in `NEXT_MS`; Skip writing nothing; a swiped-past card still due; a finished card still in the queue; the weight order on a seeded deck of shared characters, and a write lowering it in the next session; a number button not writable; a traditional card's buttons; German; no overflow in ten languages.
2. **Lock and walk** (§ 7): `verify-lockwalk` — the long press with the buzz, the walk of three cards sharing 鸡 out of a session of eight, the capsule, the lock look on each, the tap releasing it with the whole photo and the open answer, the lock across a reload, a lone character's walk of one.
3. **Zoom and pan, the 2:1 box** (§ 4, D1): `verify-piczoom` — a pinch enlarging, a drag panning within the picture, the reset on the next card, the single tap still swapping crop and whole photo, the carousel not firing under a pan, the page front excluded, the 16:9 window fitted in the 2:1 box with the fill above and below.
4. **The flag rule** (§ 9): `verify-newflag` — a photo card, a Save-now card, a split panel's labels and a generated flashcard all flagged with the note; the Add form's card not; Accept keeping the flag; the ⚑ on the study card toggling and writing.

Every phase: the three version markers, `verify-english`, `verify-swipe` retargeted, `verify-vote` **superseded** (the honest record of a feature removed, as `verify-derived` was at v487), `verify-star` and `verify-starred` retargeted to the new back row, CLAUDE.md in the same PR, screenshots in light and German dark.

## 13. Open questions — H's call, each with a recommendation

- **Q1 — the corner glyph** in the sketch's photo (top right): the review flag (recommended, § 3.3), or the star, or the whole-photo toggle? The flag is the only one of the three he named in the note.
- **Q2 — the photo box ratio**, § 4: A (2:1 box, stored window untouched — recommended), B (re-cut the deck to 2:1), or keep 16:9 and accept a 22 px shorter pad.
- **Q3 — a card of one character:** the template fills the pad, and one write finishes the card — fine; but a **one-word card of two characters where the word is the unit** (谢谢): one button each, written one after the other (recommended — the pad is per character, H's "1 character nach dem anderen"), or the word as one drawing?
- **Q4 — the pad's own reference:** the faint template in the pad (recommended; it is what the sketch's "Tip auf word → wird im Schreibfeld angezeigt" says), or the photo's own crop of that character as in the v65 sheet? The photo crop is what the zoom in zone 1 gives without a second square.
- **Q5 — a card without the pad:** should Learn keep a way to study without writing (a "Pad off" switch under Learning, the answer block then being the whole test and a swipe the only grade)? Recommended: not in phase 1 — the point of the change is the writing; if the field asks for it, it is a setting and one line.
- **Q6 — the star** is not in the sketch. Keep the star and the flag side by side under the answer block as today (recommended, v427/v431's row without Edit), or move the star into the corner and the flag under the block?
- **Q7 — the weight and Random order:** with the weight sorting first, "Random" (v153) shuffles only among equal weights, which on a small deck is no shuffle at all. Recommended: Random ignores the weight (a random session is random), Oldest and Newest keep it.
- **Q9 — how strict is the order:** the template's stroke order, strictly, as Duolingo (recommended, § 6), or any unwritten stroke accepted in any order, with only the *shape* judged? Strict is what teaches; loose is what forgives H's own order, which v141 measured to differ from the standard on 团.
- **Q8 — the multicard front** (v452/v489) in the write layout: the page picture in zone 1 at `--pageh` is taller than 2:1 and pushes the pad under the fold on H's own washing-machine cards. Recommended: on a card with a page front zone 1 is the page at 2:1 too, with the spotlight (v461) on the card's own text and the zoom (§ 4) as the way to see the rest — one rule for every card, which is the v223 lesson.

## 14. What it costs, named

A card takes longer: writing 鸡蛋 is ten to twenty seconds where *Got it* was one tap, so a session of thirty due cards is ten minutes and not one — that is the trade H is asking for, and the star's and the lock's walks are how he keeps a session short. The stroke database (`strokes.txt.gz`, 2.4 MB) is loaded at the first card of every session, not at the first drawing; it comes from the reader's cache after the first time (v141) and costs 1.2 s once. A character the database lacks falls to the print model, which is slower (a reader pass) and weaker on handwriting. **`TRACE_OK` 0.28 is unfitted**: the only real finger strokes on record are H's three 团 drawings in `DRAWLOG` (v140), and a tracing bar has to be set on his own strokes over a visible template, not on the harness's synthetic skeletons — phase 1 logs every stroke's distance in `DRAWLOG` for exactly that, and the first field session sets the number. `charWrites` grows with the characters H has written, a few kilobytes at most. And the deck's own numbers move: with no `again` the fails counter never rises from Learn, so the leech flag of v82 is dead from this screen — the new flag rule (§ 9) is what replaces "this card looks wrong".

**The field checks, per phase:** does the pad's match fire on H's own strokes at the first try, and does a stroke it refuses feel refused or broken? Does the card fit his 390 × 844 with the pad whole? Does the long-press lock feel like the marking's long press (v354), and is a walk of one clear enough? And, the one only he can answer: is writing every card the study he wants, or a mode beside the old one (Q5)?
