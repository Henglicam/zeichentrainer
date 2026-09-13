# Photo mode — specification, draft 4 (2026-09-13)

H's idea, in his words: "Ich mach ein Foto von irgendwas, oder einen Screenshot von einer chinesischen App. Der Zeichentrainer analysiert das, segmentiert die verschiedenen Character-Strings. Und ich kann dann als Mensch auf irgendwas drauftippen, was ich nicht verstehe, und dafür öffnet sich eine Flashcard. Ich habe keine Flashcards mehr, durch die ich scrolle, sondern Fotos. Und wenn ich etwas nicht verstehe, tippe ich drauf, und es öffnet sich das, was wir für Flashcards gemacht haben."

**In one sentence:** a photo of a user interface — an appliance panel, a screenshot of an app, a wall of labels — becomes the thing you browse, every text on it becomes a tap target, and the card opens on the text you tapped. **A photo of one text — a shop sign, a poster, a package — stays what it is today: photo in, finished card out.** Builds on PWA v450. Every constraint in CLAUDE.md applies unchanged. **Phase 1 is built (v448), and the share route’s whole-image frame with the flatness record is built (v450); nothing else here is.**

**Draft 2 (H: "für die User Interfaces, Screenshots von Apps, Reiskocher, Waschmaschine und all sowas, was nicht so richtig funktioniert, die Tipp-aufs-Foto-Geschichte implementieren, aber für Shopschilder und so einfache Sachen, die jetzt schon super funktionieren, nicht"):** photo mode is for the `apart:true` photos only; the switch is the model's own verdict. **Draft 3 (H: "you tip on the text and then opens a pop up that is like the flashcard but without the photo … Go, the grade makes the card"):** the tap opens a sheet over the photo, and the grade is the decision. **Draft 4 (H, 2026-09-13, on the eight cards his Meituan order screen made at v448/v449):**

> "Bei so Appkarten bitte nicht jeden einzelnen Wortstring wieder als einzelne Flashcard abspeichern, sondern am besten auf eine clevere Art und Weise die ganze Seite und die Seite auch benennen, zum Beispiel Speisekarte, am besten noch mit welchem Restaurant oder Meituan screen … Und der Formfaktor kann bei so 'ner Multikarte auch anders sein. Der braucht nicht sechzehn zu neun sein. Der kann ruhig irgendwie dann den gesamten Bildschirm anzeigen oder so. Sei da bitte kreativ."

> "und bitte optimiere bei so Screenshots auch für Speed. Screenshots sind ja in der Regel einfache Texte, die leicht erkannt werden können. Das muss dann schnell gehen."

Two decisions follow: **D7, the page card** (§ 11) — a panel or a screenshot is *one* card, named, in its own shape, and its texts are items on it —, and **D8, the screenshot fast path** (§ 12) — a screenshot goes reader → DeepSeek and skips the picture model unless the reader is unsure. D7 revisits D1 and v223's "both boxes the same shape on every card"; D8 revisits nothing decided, only where the time goes. §§ 1–10 are draft 3 with the lines draft 4 changes marked **[draft 4]**.

## 1. What changes for H on the phone

Today (v449): photo → the app makes cards → H scrolls the **Cards** list or studies in **Learn**. A panel photo makes twenty cards at once, most of them buttons H already knows, and the pictures of those cards are the app's weakest. Since v448 a photo that made two or more cards is a **marked photo** in the Camera tab: a dot on every card, a sheet on a tap, a grade in the sheet. **[draft 4]** His Meituan order screen made eight cards and eight dots; with v449's prompt the same screen makes some thirteen — and thirteen cards in the deck for one screen is exactly what he does not want.

With draft 4: a **panel or a screenshot** → **one card, the page** — "Order confirmation — 美团, 颐堤港店", "Menu — 小厨娘淮扬菜", "Control panel — washing machine" —, its picture the whole page in the page's own shape, its texts **items** with a dot each. H scrolls his photos, taps a text he does not understand, the sheet opens with the characters, the pinyin, the meaning and the three grades. **A grade writes that item's own progress row; closing without one writes nothing.** In Learn the page comes up as one card and is studied **dot by dot**. The Cards list shows one row per page: the page, its title, "13 texts, 4 known". **A screenshot is fast when the reader reads it surely:** the texts appear in about a second, the meanings a few seconds later, where today the card comes at 34 s (§ 12.7 says when the reader does not, and what happens then). **A sign, a poster or a package** → the finished card, exactly as today.

## 2. What already exists and is reused

| Piece | Exists as | Used for |
|---|---|---|
| Finding every text on a panel or screenshot | the split of v357–v447: `apart`/`labels`, the drawing test, `labelRunsOf`, `readLabels`, `photoFrameOf` | the items of a page |
| Finding the one text on a sign or poster | the frame chain of v287–v348 | one card, unchanged |
| The dots, the sheet, the grade | v448: `.regions`/`.region`, `REGION_HIT` 44 px, `openLookup`/`closeLookup`, `gradeRegion` → `recordGrade`, `regionState`, `regionLine` | the page's face and its sheet, item by item |
| A reading's lines with their own boxes | the quick look (`FIRST_MAX` 1000 px), `frameBoxes`, `rectOfLines` → `snapBox` (v322), `textRowExtent` | the items of a screenshot without the picture model (§ 12) |
| Is the reading sure, line by line | `sureLines` (v441), `PLACE_CF` 95, `SURE_BOX` 70 | the gate of the fast path |
| Meanings for several lines in one text call | `aiAsk` with " / " per line (v300), `kind` from the text (v364/v368) | one DeepSeek call for a whole screenshot |
| The picture sent at the quick look | `EARLY[id]` (v439), `r.stop` (v442) | the model's answer used to *add* items, never waited for |
| A card built from a reading without writing it | `readingCard`, `provisionalCard` (v440) | the page as read, before the meanings land |
| Where a text stands on its photo | `frame` `{x,y,w,h,a}` (v244) | the item's `box` |
| The photo stored once | `fullPhoto`, `keepPhoto`, `imgFull` (v214) | the page card's picture costs no new bytes |
| A screenshot shared from another app | `share_target`, `takeShared` (v163) | the certain screenshot signal |

## 3. Data model **[draft 4: rewritten]**

Draft 3 put `regions` on the photo record. v448 did not, and its reason stands: a put of an inbox record rewrites its Blob, and 237 photos at boot would be 70 MB of writes. The durable home for a page's texts is a **card** — the page card:

```
{ id:"page#1757…", kind:"page", t:"Page", at, v, shot:"shot_1757…",
  c:"Meituan — order confirmation, 颐堤港店",   // the title; never empty, so no waiting-card path (v237) ever sees a page as "Reading …"
  name:{ app:"美团", what:"order confirmation", place:"颐堤港店" },  // the model's own naming (§ 11.2); the title is built from it in the app's language
  tags:["App"],                                  // the photo's kind (v364/v377), the page's tag
  frame:{x:0,y:0,w:1,h:1,a:0},                  // the whole page — Crop again is not offered on a page
  img: (none), imgFull: (only when the photo is gone, v214),
  fast:true|false,                              // built by the screenshot fast path (§ 12) — for the field to compare
  mt:{src:"llm"|"reader", verified, pending},
  items:[{
    rid:"r3",                                   // stable within the page
    zh:"下单确认", p:"xià dān què rèn", m:"confirm order", ml:"en", trad?,
    box:{x,y,w,h,a},                            // fractions of the photo — photoFrameOf's or rectOfLines' output
    placed:"reader"|"model"|"none",             // v448's own vocabulary; "none" = a chip, not a dot
    ai:{…},                                     // the raw answer's entry for this label (v399's rule: the record says where it came from)
    flag?:true, flagNote?:"…"                   // an item can be flagged as a card can
  }]
}
```

**Progress rows** for items are ordinary progress rows with the id **`<page id>#<rid>`** — one row per item, written by `recordGrade` as v448 writes a card's. Nothing in `schedule()`, the streak, `daily` or `learnStats` changes; only the boot's "prune rows without a card" learns that a row whose id has a `#r` tail belongs to the page before it. **An item counts as a card wherever the app counts cards** — the Deck capsule, Cards learned, Due, the deck bar — so a page of thirteen texts is thirteen things to learn and the numbers do not shrink because they live on one card (open decision, § 15).

**Ordinary cards are unchanged**, and so is the photo record. A photo may carry a page card *and* ordinary cards (a hand-drawn frame on a screenshot, v437) — its regions are the page's items plus the ordinary cards' frames, as v448 derives them.

**Export/import:** a page travels as a card of `kind:"page"` with `items[]`, and its items' progress rows as progress rows; "Include photos" carries its photo through `fullPhoto` as any card's. An app older than the page card imports it as a card with a title and no picture — harmless, and the newer app's import sentence says "…, 2 pages" (the v167 rule). Regions are stored on nothing else.

**Existing photos (v448's rule stands):** a photo that made two or more *ordinary* cards draws its regions from those cards at render time, as today; it is never turned into a page by itself. **H's eight Meituan cards stay eight cards** (§ 11.8).

## 4. The photo browser

Unchanged from draft 3 as built in v448: the Camera tab's inbox row, the regions in percent coordinates turned by `a`, the outlines that flash for `REGION_FLASH` 2 s and then the dots, the 44 px hit floor, the line under the photo. **[draft 4]** The line reads "13 texts, 4 known." for a page, and the row *is* the page card's face — as the finished card of v325 is a sign's. A page whose meanings are still on their way carries the check's bar under it ("Checking pinyin and meaning …", `AI_BUSY_TEXT`) with Crop and Cancel, v440's shape.

## 5. The tap

As built in v448, with one change in step 2. **[draft 4]** 2. **A grade is the decision.** For an item, the grade writes the item's progress row (`<page id>#<rid>`) through `recordGrade`, counts as a review, and the dot takes its colour at once. **No card is made** — the page is the card and was made at analysis time. For an ordinary card under a dot, as v448. 4. **More** opens the **page's detail** with that item highlighted (§ 11.5); an item that H wants as a card of its own gets it there ("Card of its own", § 11.5 — open decision). 5. **Delete** in the page detail deletes the page with all its items (Undo, v268); a single item is removed in the page's Edit form. Everything else — the swap, closing without a grade, the chips for `placed:"none"`, the two counters `regionTaps`/`regionGrades` — as v448.

## 6. The pipeline **[draft 4: the last step writes a page]**

- **A panel or a screenshot** (`apart` with `SPLIT_MIN` labels or more, the placement of v359–v447; or the fast path's own verdict, § 12): everything up to the cut is unchanged — the drawing test, the run search, the row bands, the free-standing element (v392), the merged-label head (v407/v443), the ordered fill (v444), the paid-for answer consumed on a strong reading (v447). **`splitCards` writes one page card with N items instead of N cards.** The placeholder card of v325 *becomes* the page (its id, its `at`, its `shot` — as it becomes the first element's card today); no cut per item, no `cardJpeg` per label; the page's picture is the photo itself through `fullPhoto`. Cost: one write where there were twenty and one transaction where `idbPutMany` wrote twenty.
- **A single text** (`apart:false`, or fewer than `SPLIT_MIN` labels): **unchanged.** `finishPending` makes the finished card as since v325.
- **The verdict is the model's and is sometimes wrong** (draft 3's note stands). `N.apart` and, since draft 4, `N.page` in the numbers record.
- **Nothing readable, Crop by hand, From album, the provisional (v440/v441):** as draft 3 — the provisional page shows the reader's items with the check's bar and the v441 gate holds it back the same way.

Said plainly: **a photo of a sign still makes its card by itself; a photo of a panel makes one page card**, and the "11 cards from this photo" list that v448 already removed does not come back.

## 7. State on the photo

As v448: grey for a text with no progress row, the tint for one new or still learning, green for a known one (`KNOWN_DAYS` 21, `regionState`). **[draft 4]** For an item the state is read from `<page id>#<rid>`; "no card" and "no row" are the same grey.

## 8. Decisions (drafts 2–4)

- **D1 — What makes a card. Draft 2: C. Draft 4: amended.** A one-text photo makes its card at analysis time as today. A panel or screenshot makes **one page card at analysis time**, and the grade makes **the item's progress row**, not a card. The gain of C — the deck does not flood — is kept: Learn's queue holds a page as one card whose due items it walks. What C had and D7 drops: a text is never *absent* from the deck, since the page holds it; what is absent until a grade is its progress row, and that is the same for the star of v429 — an ungraded item is a text in a photo, not a card in the way.
- **D2 — Where the photos live. A, unchanged.** The page's face is the inbox row.
- **D3 — How visible the regions are. Unchanged** (v448 built it).
- **D4 — The backlog. Unchanged.** "Find the texts" on an old photo makes a page card for that photo alone.
- **D5 — Lookup or learn. Unchanged in substance:** the grade is the decision; what it writes is the item's row.
- **D6 — Deleting a marked photo. Replaced.** A page card keeps its page: the inbox's Delete and Photos → Delete N copy the photo onto the page as `imgFull` through `keepPhoto` exactly as they copy it onto any card that names the photo in `shot`. The guard draft 3 wanted ("3 texts on this photo have no card yet") is no longer needed — every text lives on the page card, which survives the photo. Nothing to build.
- **D7 — The page card** (§ 11). **D8 — The screenshot fast path** (§ 12). Both wait for H's "Go" on this draft; the open points are in § 15.

## 9. What it costs and what it cannot do

Draft 3's list stands (no new AI call for a panel, the segmentation as good as the split, nothing while the app is away, a region is the model's reading, Learn's queue shrinks). **[draft 4] Added:** a page is one card, so a card-shaped feature meets it for the first time — Share a card (v269) sends the page with its title and no text; the shared image of a page is not built in phase 2 and the button is hidden on a page until it is; the `.picbox` of v223 gets its first exception (§ 11.3); the Edit form gets a page shape (§ 11.5). **And the fast path trades the picture model's judgement for time** (§ 12.6): a screenshot the reader reads surely never goes to Qwen, so `apart`, the kind and a brand's meaning come from DeepSeek and the text alone.

## 10. Phases — see § 13.

---

## 11. D7 — The page card

### 11.1 What it is

One card for a whole screen or panel. Its **picture is the page itself**, in the page's own shape — portrait for a phone screenshot, whatever the photo is for an appliance —, not a 16:9 window and not a crop. Its **text is a title** the model gives it. Its **items** are the texts on the page, each with the place it stands, its own pinyin and meaning, and its own progress row once graded. The Meituan screen is one row in the Cards list, one entry in Learn, and thirteen dots on the photo.

Why one card and not thirteen, in H's words: "nicht jeden einzelnen Wortstring wieder als einzelne Flashcard". Why the items keep their own progress rows: the point of the photo is that its dots turn green one by one (§ 7), and a dot can only be green if the item has a schedule of its own.

### 11.2 The name

The model names the page inside the answer it already gives. `picSystem()` gains one field beside `kind`:

```
"page":{"name":"美团","what":"order confirmation","place":"颐堤港店"}
```

— `name` the app, shop, restaurant, brand or device as it stands on the page (as written, Chinese where the page is Chinese — the learner should learn it), `what` the screen or panel in the app's language ("order confirmation", "menu", "control panel", "account page"; `meaningLangName()` as for the meaning, v256), `place` the shop or branch or room the page names (颐堤港店), "" when none. The **title** is built by the app, not stored as the model wrote it: **`what + " — " + name [+ ", " + place]`** → "Order confirmation — 美团, 颐堤港店"; on a German phone "Bestellbestätigung — 美团, 颐堤港店"; a menu board "Menu — 小厨娘淮扬菜"; the washer "Control panel — washing machine" (no `name` on the page: `what` alone). The kind is the tag and its pill, not the title’s first word — H’s own examples ("Speisekarte", "Meituan screen") put what the page *is* first. H's "Speisekarte … mit welchem Restaurant" and "Meituan screen" are both this shape. The title is `c`, so search finds it and every reader of `d.c` has a text. A `page` the model does not give → the title is the kind’s own word ("App"), and the Edit form fixes it. On the fast path (§ 12) DeepSeek is asked for the same field from the lines; a name the text does not carry (Meituan's own name is nowhere on an order screen) stays empty and the title reads "Order confirmation — 颐堤港店".

The prompt's fingerprint comment lists the version; `N.page` records the field as it came (the v399 rule).

### 11.3 The shape — the exception to v223

v223 made every card's two boxes the same shape, and v329 the picture a 16:9 window, because a deck of signs and words wants uniform rows. A page is not a sign. **On the front (Learn, the detail, the Camera row) a page card has no text box at all** — the page is the front, and the text stands on it. Its picture box is **`.picbox.page`**: the card's width, the page's own aspect ratio, **capped at 56 vh** (about 470 px on H's 844 px screen) so the grades and the actions under it stay on the screen; a screenshot taller than that is fitted inside with the blurred fill of v232 beside it (a 9:19.5 screenshot at 470 px tall is 217 px wide, the fill on both sides); a landscape panel fills the width. The dots are drawn on the fitted page as v448 draws them on the inbox photo (percent coordinates, `REGION_HIT` 44 px). A tap on the page beside every dot opens the **whole-page view** (v169's full view, the dots on it) so a small item on a tall screenshot can be tapped at its own size; a tap there returns.

**The Cards list keeps its row shape:** the 124 × 70 thumbnail box with the page fitted and the blurred fill beside it — the list's uniformity is the list's, and the exception is the front's. The row reads: title on the text line, **"13 texts, 4 known"** on the pinyin line in `--label2` (`nOf`, one key in ten columns; the v412 rule — no verb crossing a key), the page's tag pill, the due date of the *earliest due item* in the status column.

### 11.4 Learn — a page dot by dot

`buildQueue` treats a page as it treats a card, then expands it: a page enters the session **once**, and its due items (and, as new cards, up to the session's cap of eight new) are its **steps**; the queue entry is `{id, item:rid}` per step, the steps of one page **consecutive** so the page stays on the screen. The interaction, concretely:

1. **The front** is the page (11.3) with **one dot lit** — the current item's dot pulsing in the tint, the others as their state; the hint "Tap the lit dot to reveal." while `showHints()` (v226). Nothing else on the front: no text box, no glyph.
2. **Reveal** is a tap on the lit dot (or anywhere on the page — the v82 rule "tap the character to reveal", where the page is the character): **the v448 sheet** opens over the card — the characters, the pinyin with the speaker, the meaning, the three grades, More. The sheet is the back. A tap on another dot swaps the sheet to that item *without grading* (a lookup inside Learn, writes nothing), and the lit dot does not move.
3. **A grade** in the sheet writes the current item's row through `recordGrade` (`again` re-queues the step behind the page's remaining steps, v428's rule against a frozen screen included), closes the sheet, and **lights the next dot** — the page does not slide, only the light moves (`S.idx++` onto the next step of the same page). After the page's last step the next card slides in as today.
4. **Swipe** (v417): a stroke moves to the next queue entry; while the next entry is a step of the same page the peer is the page itself, so the carousel shows no slide and only the lit dot changes — `makePeer` is given the same `frontHTML` with the next dot lit. A stroke past the page's last step slides the next card in as today. Skipped steps stay due (v432's guide sentence).
5. **☆ Star, ⚑ Flag, ✎ Edit** under the page act on the **page** (star and flag the card; Edit the page's form, 11.5). An item's flag is set in the sheet's More.
6. **A single-card test from the Cards list** ("Test this card") walks the page's items all, due or not — the v429 rule for a chosen thing.

What it costs: the queue is steps, not cards, wherever it is read — `S.queue`, `S.idx`, the Due capsule, `viewNow`'s session note (v423 stores ids; it stores `{id,item}` pairs since), the Done count. One helper (`queueSteps(page)`) and the three places that draw the front.

### 11.5 The detail and the Edit form

**The detail** of a page: the page with its dots as on the Camera row (the tap opens the sheet there too), the title as the badge line, under it **the item list** — one row per item in reading order: the characters, the pinyin, the meaning, the state dot; a tap on a row lights its dot and opens the sheet. Then Test this card · Edit | Star · Flag | Delete card (no Share until the page's image exists, § 9). The linked-photos row (v122) applies per item, not per page, and is not drawn. **More** from the sheet lands here with the item's row highlighted and scrolled into view; ← returns to where the sheet was (the Camera row at the same scroll, v448's `backToPhoto`, or Learn).

**"Card of its own"** on an item row (open decision, § 15): makes an ordinary card from the item — `readingCard` from its `zh`/`p`/`m`/`ai`, the picture the item's box cut at the photo's pixels (v362's label cut), `frame`=`box`, `shot`, `region`=`rid`, the item's progress row **moved** to the card (re-keyed) so nothing learned is lost — and the item stays on the page with `card` set, its dot reading the card's row. This is the escape hatch for a text H wants to share, link or crop again. Not in the sheet: the sheet is for grading.

**The Edit form** of a page: the title field (`c`), the page's tags, and **the item list with three fields each** — the character strip with its line input, the pinyin, the meaning — plus **Remove** per item and **+ Add a text** (a new item with `placed:"none"`, a chip until Crop by hand gives it a box). No image field, no Crop again, no Remove image: the page is the photo. Save writes the page in one put; a changed `zh` re-cuts pinyin and gloss for that item as `applyCardUpdate` does for a card, and drops that item's other-language meanings (v265's rule). Undo after Delete card restores the page with its rows (v268).

### 11.6 The screenshot's own extras

A phone screenshot's `App` kind (v367) is the page's tag; the fifteen function labels of the home screen are fifteen items with the same tag, and the filter sheet's App row shows the *pages*, one row per screen, which is what "die wichtigsten chinesischen Apps speziell trainieren" needs — a screen per row, not fifteen rows per screen.

### 11.7 Export

`kind:"page"` with `items[]` in the card, the items' rows among the progress rows. The import validates a page by its shape (a title, an `items` array whose entries carry `zh` and `box`), upserts by `id`, drops rows whose page or item is gone, and counts pages in its sentence. A page with "Include photos" carries its `imgFull` base64 like any card's.

### 11.8 Migration — H's eight Meituan cards are left alone

The photo has eight ordinary cards with eight progress rows H has already graded; folding them into a page would re-key eight rows, invent a title without the model's answer, and gain nothing he asked for. They stay eight cards and the photo stays a v448 marked photo drawn from them. Nothing at boot, no pass over the deck. The next Meituan screen he shares is a page. (A `page#…` id is never made for a photo that already has two or more ordinary cards — the derived regions of v448 are that photo's map.)

### 11.9 What happens to v448's cards-derived regions

They stay, for every photo that made two or more *ordinary* cards — the existing decks, several hand-drawn frames, the eight Meituan cards. A photo with a page card draws its regions **from the page's items**, plus the frames of any ordinary card that also names the photo (a hand-drawn frame on a screenshot). `regionsOf(photo)` is the one place that knows both sources; `regionState` reads a card's row or an item's row by id. The render-time Map of v448 is unchanged in cost (one card per page instead of N).

---

## 12. D8 — The screenshot fast path

### 12.1 What H's own record of 13 September says

His Meituan order screen, shared to the app, went the long way round and the numbers record (v399) shows every step: **the quick look read all ten lines at 97 % in under a second** — the reading was done — and then `tallLines` dropped every one of them, because `inkHeight` measured **138.9** on the food photos in the screenshot and not on the text, so no line was 0.4 of it; the frame chain went on to its close look and its fallbacks, **50 passes, 22 s on the phone**; the picture went to Qwen, which took **32.2 s**; the cards landed at **34.4 s**. And the picture Qwen saw was not the screen: the ink-row proposal was **21–81 % × 26–98 %** because the chromaticity copy sees the colourful blocks and not black text on white, so **下单确认, 颐堤港店 and 桌号大厅05 were never in the picture the model was shown** — v449's prompt change asks the model for headings it could not have seen on this photo.

The fault is not a threshold. Every mechanism that fired was built for a photograph of a sign — a tilt, a shadow, a colourful ground, a text whose size is the ink's — and a screenshot has none of that: level, flat, black on white, the reader's own case. "Screenshots sind ja in der Regel einfache Texte, die leicht erkannt werden können." The record agrees. **v450 fixed the proposal on the share route** — a shared screenshot is read whole since —, so the picture the model sees is the screen; the time is what D8 is for.

### 12.2 How the app knows a screenshot

Two kinds of signal, and only one of them is certain today:

- **The share-target route** (`?share=1`, `takeShared`): a picture shared from another app on a phone is a screenshot or a saved image; `importPhotos` marks the record `shared:true` (**built as v450**: the frame is the whole image on that route already, the rows the ink found stay in the record as `N.prop.reg`, and the log names the override — no rewrite of the Blob, one field written at import). **Certain enough to gate on from the first version.**
- **Content signals**, for a screenshot picked from the album or taken as a photo of a screen: **(a) flatness** — `N.prop.flat`, **recorded since v450**: the share of a 240 px grey copy whose 3×3 neighbourhood is exactly one shade (the harness’s synthetic screens 0.72–0.81, a field of noise 0.000). **It is not a gate, and the first measurement says why:** a synthetic sign on a soft gradient measures 0.755, as flat as a screenshot — a smooth tone is one shade at 3×3 too. It separates a screenshot from a grainy photo and not from a smoothly lit one; the two signals below are the ones that can; **(b) no camera EXIF** — a screenshot carries no Make/Model, a phone photo always does (read *before* the normalisation bakes and strips it); **(c) the dimensions equal the phone's own screen** (`screen.width × devicePixelRatio`; a cropped screenshot fails this, so it is a confirmation, never a veto). **The v399 rule applies before any of the three gates anything:** they are recorded first — `N.prop.shared` and `N.prop.flat` on every reading since v450, `exif` and `screen` beside them in phase 3a — and the numbers record makes them comparable — and calibrated on the 40-photo corpus plus every screenshot H shares over the next weeks. Only when the record shows a gap between the photographs and the screenshots does a content signal become a gate, and the gate's number is then taken from the record and written down here with its margin (v441's method). Until then the fast path fires **on the share route alone**, and an album screenshot goes the long way as today. That is a deliberate half: it costs H nothing he has now, and it never fires on a photograph by mistake.

### 12.3 The path

1. **The frame is the whole image** (**built as v450** on the share route). No ink-row proposal (`textRegion`’s rows set aside: `CROP.proposed="whole"`), no deskew (a screenshot is at 0°; `deskewBlob` is skipped, so no spurious angle and no filled corners), no 16:9 shaping. The headings are in the picture because the picture is the screen.
2. **The reading is one pass on the stored photo at its own pixels** (1600 on the long side), not the quick look’s `FIRST_MAX` 1000 px copy — measured (§ 12.7): on the harness’s order screen the 1000 px copy reads 2 of 13 elements exactly and the 1600 copy 4 exactly and 5 within one character, in the same 0.6 s; the 13 px copy misreads the bold shop name and loses the 32 px table line altogether. On H’s own record the quick look read ten lines at 97 %, so his phone’s screenshot reads better than the fixture, and the gate decides per screen. **`tallLines` is not applied** (its premise, one main text whose size is the ink's, is false on a screen: a heading is legitimately three times an item line, and the ink height measures whatever photo is on the page). **The gate is `sureLines`** — every line at `PLACE_CF` 95 on average over its characters' confidences, `SURE_BOX` per character (v441's own test, hoisted for exactly this), plus `textLike` on the whole. Lines that pass are **elements**; each gets a **region from its own boxes** through `rectOfLines` → `snapBox` with `FRAME_ROOM` (v322 already trims the reader's drifting ends to the ink), `placed:"reader"`. No close look, no copies, no traditional chain, no whole-frame fallback: `cropSign` returns after the quick look with `r.fast=true`, `N.fast={lines, sure, unsure}` in the record and the log line "a screenshot: the quick look read 12 lines, 11 of them surely — no further passes".
3. **The line split.** The reader gives one line per text row, and a row of a screen may hold two buttons or two columns — 继续加菜 and 确认下单 came back as one line **继续加菜确认下单** on H's screen. A sure line is cut where the **image's own columns** inside the line's band show a gap wider than `FAST_GAP` 1.5 text heights (the `textRowExtent` walk, run *inside* the reader's span instead of outward from it — the symbol boxes only say which characters fall left and right of the gap, since their x positions drift, v69/v75); each half is an element with its own region. Inside a label the characters nearly touch, between two buttons there is a character's width of air (v359's `LB_MERGE` finding). A gap between an item's name and its price on a menu line (宫保鸡丁 … 38元) *would* split them — the v361/v363 price rule says the price stays in its item's line, so a half that is nothing but digits and a unit (`NUM_TOKEN`) is glued back onto the half before it.
4. **Pinyin from the app** (`pySpaced`, pinyin-pro; digits and units as v323), a gloss word by word (`lineMeaning`) — and the page shows **at once** as v440's provisional: the page card as read, the dots, the check's bar under it. This is the "in about a second".
5. **The meanings from one DeepSeek text call.** `aiAsk` with the elements as the lines of one card — v300's " / " per line gives every element its meaning in the app's language, v364's `kind` and the new `page` field (11.2) come in the same answer, and `noThinking` and the relay apply as today. On H's AI log DeepSeek answers a text check in 3–6 s. The answer is taken **per line**: a corrected `zh` only where the changed position is open — the reading's own confidence there under `AI_SETTLED` 90 (v143's `aiSettled`, which the quick look's per-character confidences make possible exactly as in the Read preview) —, the pinyin through `saneP`, the meaning through `saneM`. The page card is written once with the meanings in; `mt.src:"llm"`, `fast:true`.
6. **Qwen only when the quick look is not sure.** v439's early call fires on `textLike` failing; on the fast path it fires when **`sureLines` fails on more than a quarter of the lines, or `textLike` fails** — the quarter is a placeholder until phase 3a’s record from H’s own screenshots gives the number (§ 12.7) — that is the condition under which the reader's text is the garbage the picture exists for, and there the long path runs as today (the whole image as the frame stays; everything else as v325). **When the early call went out anyway** — a screenshot with two unsure lines among twelve sure ones — the page is **not held for it**: it is built from the sure lines and DeepSeek now, and when Qwen's answer lands (`EARLY[id]`, the promise parked as v439 parks it) its labels are matched to the existing items by text (`labelHit`, v386's own matcher) and **the unmatched ones are added** as items with the model's box (`placed:"model"`, through the drawing test — a lattice makes them chips, `placed:"none"`) and their pinyin and meaning from the answer; a page update in place, the bar under the page saying so until it lands. The model's answer adds; it never replaces an item the reader read surely (the v143 rule) and it is never waited for.

### 12.4 The expected time

Reader (the quick look) **under 1–2 s** on the phone — H's own record says under one —, the line split and the regions tens of milliseconds, DeepSeek **3–6 s**: **the page with its texts at about a second, the meanings at four to seven**, against 34.4 s today. No 88 KB picture upload, one relay call instead of two (or three with a re-ask), and the reader's 50 passes and the traditional chain never start — on a phone that is 22 s of CPU not spent, which is also v442's point one step earlier.

### 12.5 Costs and risks, each with what handles it

- **Two buttons on one row read as one line** (继续加菜确认下单): the line split of 12.3 (3) on the image's columns. Where the buttons touch (no gap of 1.5 heights) they stay one element — the parts row inside the sheet still gives both words. The heuristic is measured on H's screenshot and a synthetic row of two buttons before it gates anything, and `N.fast.split` records every cut.
- **A price artifact glued to an item** (个半6): a stray digit read at low confidence inside a sure line. The per-character gate does not throw the line away (its mean is high), so the element exists; DeepSeek's corrected `zh` for that line is taken where the changed characters are open (the digit is, at its confidence), which is the case `aiSettled` exists for; a number the model keeps stays in the line by the price rule. What is lost: a misread digit the model also keeps. The item's Edit fixes it, as a card's does.
- **A garbage line from a photo on the page** (电罗): the reader reads the food picture. Two gates in order: **its own confidence** — a line under `PLACE_CF` on average is not an element and goes to the unsure count (12.3 (6)) —, and, for a garbage line that happens to read confidently, **the model's word**: the DeepSeek prompt is asked, per line, to name the lines that are not real text (a `drop:[i,…]` field, one clause in `aiSystem()`), and such a line is dropped **only if its own mean confidence is under `PLACE_CF`**; a line the reader read surely and the model calls garbage keeps its item and gets the review flag with "the AI says this text looks misread" (the `bad` machinery of v95/v302, per line instead of per card). Wrongly dropping a real line is the worse error, so the reader's certainty wins the tie.
- **A traditional-Chinese app** (HK/TW screenshots): the fast path reads with the simplified reader only; on traditional text the quick look fails the gate and the long path — the traditional chain, the vote of v113 — runs as today. Nothing lost, only nothing gained there.
- **A prose screenshot** (a WeChat article, a chat): every line of prose becomes an element, which is a page of forty items nobody wants. A screen whose sure lines are **long and full-width** (median over `FAST_PROSE` 14 characters, spanning over 0.8 of the width, no gaps) is not a UI; the fast path stands down and the long path decides `apart` as today (open decision, § 15 — H may want prose as a page too, one item per sentence).
- **Regions from the reader's boxes** are tighter than the model's on a screen (black on white, the snap's home ground) but carry no room for an icon beside the text — the v396 rule (the icon belongs on the card) is a panel's rule and does not apply to an item that has no picture of its own.

### 12.6 What is lost without Qwen, named

- **The `apart` judgement.** The fast path *assumes* a screenshot is `apart:true` — every sure line its own element. That is right for every screenshot H has shared (the home screen, the order screen, the account page, the tab bar) and wrong for a screenshot of a poster or a single message; the prose rule above catches the long-line case, and a one-line screenshot (one sure line) makes an ordinary card through `finishPending`, not a page of one item.
- **The kind and the name.** DeepSeek gives both from the text alone (v368's Tag all proved the kind is guessable from a card's text; 下单确认 / 桌号大厅05 says "App, order confirmation" clearly enough) — but the app's own name is often not on its screen, so the title may lack it (11.2). The Edit form's title field is one tap away.
- **Brand meanings from the picture** (v280): a shop name in a heading the model does not know gets a literal meaning, since no logo is seen. Same as a typed card today.
- **A label the reader misses** — a heading in a display font, white on the tint bar — has no item until the early call lands (12.3 (6)), and no item at all when the quick look was sure of everything and no call went out. Crop by hand adds it as a region (v437), and "Find the texts" on the page (the long path, one picture call) adds the model's labels as items — the escape hatch for a screen the reader half-read.

---

### 12.7 What the harness measured on 13 September, before anything of D8 is built

A synthetic 1080×2520 order screen — thirteen elements in WenQuanYi Zen Hei: title, shop, table line, four item lines beside drawn food-photo noise, 展开更多, a note block, two buttons — was driven through the app’s own `cropSign` on a v449 root with Qwen mocked to answer after 32 s, as on H’s phone, and the reader was run on its own against the ground-truth boxes. Four-core sandbox; the phone is about five times slower (v386’s washer, 33 s against 6.6 s).

- **The path today:** the quick look reads 12 lines at 93 % in 0.55 s and fails `textLike` by 0.73 points (94.27 against `PLACE_CF` 95); `tallLines` drops five of them as fine print, because `inkHeight` measures the food photo (60 on the 1600 copy against a character height of 19–21) — and the lines it drops (the table line, 展开更多, 温馨提示, both note lines) are the ones the reader reads best; the reading ends **strong** (eff 464) at 4 s with the early picture call parked (v439), v441 holds the provisional for four lines under 95, DeepSeek answers at 8 s, and the cards come at **34.2 s** when v447’s `picPanel` consumes the parked answer — all 13 elements as cards, two of their frames cut by `labelRect` (桌号大厅05 without its "| 5人", the second note line’s right half) where the model’s own box was right. On this fixture the ink rows spanned the whole screen (0.8–100 % × 0–97 %), so it did **not** reproduce H’s 21–81 % cut; the `verify-shared` fixture of v450 did (13–83 %). With `textRegion` stood down the run is byte-identical.
- **The reader alone, thirteen elements, CJK characters only:** the quick look’s 1000 px copy (characters 12–19 px) **2 exact, 2 within one character, 9 none**; the stored 1600 copy (19–30 px) **4 / 5 / 4**, three of the four misses contained whole inside a longer merged line; the screenshot’s own 1080 px band (30–48 px) **6 / 2 / 3 of its 11**. The 1000 px copy misreads the bold shop name (颐→磊) and loses the 32 px table line entirely. `textLike` is false on the quick look and true on the 1600 copy by 0.04 — a coin toss —, and **`sureLines` is false on every pass**: 颐堤港店 reads at about 80 % everywhere, and a fragment line (员, 汪, 二) from the food photo stands at 74–84 % in every pass. Per line at 95: 4 of 12 on the quick look, 6 of 15 on the 1600 copy.
- **Four structural findings, none a threshold:** every item line is merged with its price, the ¥ glyph read as a character (羊/半/壮 at 59–90 %) and the line’s box running to the card’s right edge, so IoU against the name falls to 0.08–0.5; the food-photo tiles are read as characters and prepended to the item lines (局本出黑猪肉…, 区油酷汁…) at 71–93 %, and shed one-character fragment lines; the two buttons 继续加菜 and 确认下单, 326 px apart in different colours, come back as **one line at 98 %** in every pass; and `inkHeight` measures the graphics, not the text, on any screen with a photo on it. Pinyin from `pySpaced` is right on all 13 and passes "|" and "·" through as tokens.
- **Time:** reader load 0.5 s, quick look 0.44–0.56 s, the 1600 copy 0.63–0.66 s, deskew 17 ms — on the phone roughly 2–3.5 s a pass.
- **Flatness (v450):** the fixture 0.81, the v450 suite’s screenshot 0.78, a field of noise 0.000 — and a synthetic sign on a soft gradient 0.755.

**What follows for D8, and it is written into §§ 12.2–12.3 above:** the reading pass for a screenshot is the stored 1600 px copy, not the quick look’s; the gate is per line, and its number comes from H’s own screenshots’ records (3a), since on this fixture the strict gate would stand down to the long path while H’s own record — ten lines at 97 % — would pass it; the line split on the image’s columns is necessary, not optional (the buttons); and the price glue of v361/v363 is what keeps 老南京鸭油酥烧饼(个) ¥6 one item. **Keeping a shared screenshot at its native pixels** would read better still (6 of 11 against 4 of 13) and cost about five times the storage per screenshot (76 KB → some 400 KB); not taken — revisited only if H’s real screenshots read under the bar at 1600. **The fixture is synthetic** (a canvas font, drawn noise for photos, no real JPEG), so by the v386 rule phase 3b is built only with H’s own screenshot in the harness — "Include photos" in an export, or the file itself.

## 13. Phases, as draft 4 orders them

1. **Phase 1 — built (v448):** the marked photo from the cards, the sheet, the grade. **Stays as it is** for photos with ordinary cards.
2. **Phase 2 — the page card (D7): built as v453** (H, 2026-09-13: "bitte bei Screenshots nicht für jeden Wortstring eine einzelne Karte anlegen, sondern den Screenshot unter Cards und in learn speichern mit den Punkten drauf") — with one difference from § 3: the items are the split's own card records carrying `page:<id>`, not sub-records with virtual ids, so every card-shaped feature keeps working on them unchanged; the page gate is every split (H, the same hour: "Immer wenn auf dem Foto mehr als ein zusammenhängender Wortstring auftaucht, wird die Karte als Multikarte behandelt"), and a screenshot from the album is recognised by its missing camera EXIF — phase 3a's tell, built early. As specified: `splitCards` writes one page with N items; the page's data model, progress rows per item, the Camera row as the page's face with the bar while meanings are on their way, the sheet grading an item, Learn dot by dot with the carousel's peer, the Cards row "13 texts, 4 known", the detail with the item list, the Edit form's page shape, export/import of `kind:"page"`, `keepPhoto` for a page (D6 replaced), "Find the texts" on an old photo making a page, the chips for `placed:"none"` items on the page's face. `finishPending`'s single-card path untouched. The guide's first and fourth sections rewritten (v259), a `WHATS_NEW` line, `TO_TEST` lines. The eight Meituan cards left alone.
3. **Phase 3 — the screenshot fast path (D8), in three PRs:** **(3a)** the record only — **half built as v450** (`shared` and the flatness on the record, the whole image as the frame on the share route); what remains: the per-line sureness of the reading on the 1600 copy as `N.fast` on every shared screenshot, EXIF and screen size beside it (no behaviour change; a version H runs for a week so the record has his screenshots in it and the gate’s number is his, § 12.7); **(3b)** the path itself gated on the share route: the whole image as the frame, the quick look as the reading, `sureLines`, the line split, one DeepSeek call with `page` and `drop`, the early call used to add, the page as provisional then written; **(3c)** the album gate from the calibrated content signals, with the numbers and their margin written into this file. The old phase-3 items of draft 3 are absorbed: the chips are items, "Find the texts" is phase 2, D6 is gone.

Field check after each phase, on the Xiaomi: phase 2 — the washing machine and the rice cooker (one page each, the dots where the labels are, the sheet, a grade turning a dot), the Meituan order screen shared again (a page named "Order confirmation — 颐堤港店" or better, thirteen dots including the headings), a lone sign (the finished card as before), Learn with a page in the session (does the light move as expected, does the swipe feel right), the Cards row; phase 3 — the same screenshot shared again with a stopwatch: the texts within two seconds, the meanings within seven, `N.fast` in Diagnostics, no Qwen call in the AI log unless the record names an unsure line.

## 14. Suites, and what the v448 → draft-4 A/B must show

**`verify-page` (phase 2):** every fixture of `verify-panel` (the rice cooker, H's washer with the drawn lattice and the merged labels, the Meituan home screen, the dishwasher, the ovens, the column, the signpost) makes **one page card whose item count equals today's card count, with `own`/`wrong` computed over the items' boxes byte-identical to today's over the cards' frames** — the placement is not allowed to move; the Camera row draws N dots from the items; the sheet on a tap; a grade writing `<page>#<rid>` in memory and IndexedDB, counting the review and the day, recolouring the dot; a close writing nothing; Learn with a seeded page of three due items and two ordinary cards — one queue group, the lit dot moving through three grades with the page not sliding, then the next card sliding in; the swipe inside the page changing only the lit dot; the Cards row's title and "3 texts, 1 known"; search finding an item's meaning and the title; the detail's item list and More landing on the highlighted row; the Edit form changing an item's text and re-cutting its pinyin; "Card of its own" moving the row; export and import of a page round-tripping items and rows; a photo with eight ordinary cards **not** turned into a page at boot; the inbox's Delete copying the photo onto the page (`imgFull`) with the dots intact; Delete card removing the page and its rows with Undo; the autocard suite's lone sign still a finished card; Cancel, the v438 no-card case and Crop by hand unchanged.

**`verify-fastpath` (phase 3):** **H's own Meituan order screenshot must be in the harness first** (the v386 rule — his home-screen fixture stands in only for the count and the regions, not for the headings, since it has none). Cases: the screenshot through the share route → `N.fast` set, **no picture call**, one DeepSeek call carrying every line, a page card with the headings 下单确认 / 颐堤港店 / 桌号大厅05 among its items, the two buttons as two items, the price line whole, the photo's garbage line absent, the page provisional within the harness's own reader time and written after the mock answers, the time from landing to the provisional and to the written page measured and printed; the same file from the album (no share route) → the long path as today (until 3c); a synthetic screenshot with three unsure lines of twelve → the early call out, the page built from the nine, the answer's three added as items and none of the nine changed; a screenshot of prose → the fast path standing down; a traditional screen → the long path; a photograph of a sign through the share route (a saved image, not a screenshot) → the quick look unsure, the long path, the card as before; `N.shot` recorded on every reading of the aiframe corpus with the photographs' flatness printed as a table, so 3c has its calibration in the log.

**The A/B — v448 root against the draft-4 root, the same fixtures, the same mocks, run by the same script (the v419/v439 rule: a case that cannot fail on the old tree is not a test):** for every panel fixture, **cards on v448 = items on draft 4**, `own`/`wrong` equal; the sign fixtures of `verify-aiframe` **byte-identical** (32 cases, the card's frame and picture compared exactly); the deck after a panel photo: N cards on v448, one page on draft 4, the Deck capsule reading N on both; on the Meituan order screen through the share route: **two picture calls and one text call on v448 against zero and one**, the time to the first visible text and to the finished record on both trees printed side by side, the headings present on draft 4 and absent on v448; on the same file from the album: identical on both trees until 3c. A negative control on each: a constant nudged on a copy (`FAST_GAP`, `KNOWN_DAYS`) must move the report, so the equalities are measured and not vacuous.

## 15. Decisions taken in draft 4 (an objection from H reopens any of them; the one thing that waits is his "Go" on D7 and D8)

1. **The title’s shape:** what the page is first, in the app’s language, then the name as it stands on the page, then the place — "Order confirmation — 美团, 颐堤港店", "Menu — 小厨娘淮扬菜", "Control panel — washing machine" (§ 11.2). The kind stays the tag.
2. **Items count as cards** in the Deck capsule, Cards learned, Due and the deck bar — a page of thirteen texts is thirteen things to learn.
3. **Learn walks a page as one group**, the light moving dot by dot; the swipe is the way past it.
4. **"Card of its own"** for an item is not in phase 2; it is built when H asks for it (share, link or crop again of one text).
5. **The fast path fires on the share route only** until the record from H’s own screenshots shows a gap for the album (3c); the flatness alone is not a gate (§ 12.2).
6. **A prose screenshot** (a WeChat article) stands down to the long path.
7. **H’s eight Meituan cards are left alone** (§ 11.8); the next screen he shares is a page.
8. **Share a card is hidden on a page** until the page’s shared image exists.
9. **A shared screenshot is stored at 1600 px as any photo**, not at its native pixels (§ 12.7).
