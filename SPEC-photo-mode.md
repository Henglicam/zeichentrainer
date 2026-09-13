# Photo mode — specification, draft 1 (2026-09-13)

H's idea, in his words: "Ich mach ein Foto von irgendwas, oder einen Screenshot von einer chinesischen App. Der Zeichentrainer analysiert das, segmentiert die verschiedenen Character-Strings. Und ich kann dann als Mensch auf irgendwas drauftippen, was ich nicht verstehe, und dafür öffnet sich eine Flashcard. Ich habe keine Flashcards mehr, durch die ich scrolle, sondern Fotos. Und wenn ich etwas nicht verstehe, tippe ich drauf, und es öffnet sich das, was wir für Flashcards gemacht haben."

**In one sentence:** the photo becomes the thing you browse, every text on it becomes a tap target, and the card opens on the text you tapped. Builds on PWA v447. Every constraint in CLAUDE.md applies unchanged. Nothing here is built; every decision marked **D** waits for H's word.

## 1. What changes for H on the phone

Today: photo → the app makes cards → H scrolls the **Cards** list or studies in **Learn**. A panel photo makes twenty cards at once, most of them buttons H already knows.

With photo mode: photo → the app finds the texts on it and marks them → H scrolls his **photos** → taps a text he does not understand → **the card opens** (the existing card detail: picture, characters, pinyin, speaker, meaning, parts row, Star, Flag, Edit). Texts he never taps never become cards. Learn stays the study screen; the Cards list stays for search and filters.

The three taps: shutter (or share a screenshot) → tap the text → read the card. No frame, no list of cards to scroll through, no deciding what to keep.

## 2. What already exists and is reused

Almost all of the machinery is in the app; what is missing is the view and one change of what the pipeline writes.

| Piece | Exists as | Used for |
|---|---|---|
| Finding every text on a panel or screenshot | the split of v357–v447: the model's `apart`/`labels`, the drawing test, the reader's run search (`labelRunsOf`, `readLabels`), `photoFrameOf` | the segmentation — one region per label |
| Finding the one text on a sign or poster | the frame chain of v287–v348 (quick look, close look, the AI's box, the snap) | one region per single-text photo |
| Where a text stands on its photo | every card since v244 carries `frame` `{x,y,w,h,a}` as fractions of the photo, and `shot` names the photo | the tap target's rectangle — for every card H already has, the region is known today |
| The card opened on a tap | the card detail (`detailCardHTML`, v445's swipe between neighbours through `wireSwipe(card,o)`) | the flashcard that opens |
| A card built from a reading without writing it | `readingCard` and v440's `provisionalCard` | making the card at the moment of the tap |
| The card's picture | `windowRect`/`windowCut` (16:9 window, v329) or the label's own cut (v362), through `cardJpeg` | the picture of a card made from a region |
| The photo list | the Camera tab's inbox (`renderInbox`, newest first, Take photo and From album at the top since v353) | the photo browser |
| A screenshot shared from another app | the share target (v163), the App kind (v367) | the same path |
| A photo with nothing readable | v438's row "The AI could not be reached …", the Crop button | the fallback: frame it by hand |
| What H knows and what he does not | the progress rows (`interval`, `KNOWN_DAYS` 21) | the state colour of a region (phase 3) |

## 3. Data model

A photo record in `inbox` is `{id, blob, ts}` today. It gains **`regions`**, the texts found on it:

```
regions:[{
  rid:"r1",                         // stable within the photo
  zh:"混合", p:"hùn hé", m:"mixed", ml:"en",   // the model's own reading of this element (v358: every label carries its own p and m)
  box:{x,y,w,h,a},                  // fractions of the photo, as `frame` on a card — photoFrameOf's output
  placed:"reader"|"model"|"none",   // how the box was found: the reader's run (v386+), the model's measured box, or nothing — then box is the whole photo (v380)
  kind:"Appliance",                 // the photo's kind (v364/v377), one per photo, copied here so a region without a card can still say what it is
  ai:{…},                           // the raw answer's entry for this label, for the card's own record when it is made
  card:null|"混合#1757…"            // the card this region became, once tapped
}],
regionsAt:1757…, regionsV:448,      // when and by which build the photo was analysed
regionsErr:"…"                      // why it was not (the AI could not be reached, nothing found)
```

Cards are **unchanged**: a card made from a region carries `shot`, `frame` (= the region's box), `v`, and the region's `rid` as **`region`** so the link survives a re-analysis. Export and import carry `regions` on nothing — regions are cheap to rebuild and the photos themselves leave the phone only with "Include photos" (v166), where `regions` rides along inside the photo record as any field would.

**Existing photos (migration at boot, once):** for every inbox photo, its regions are built from the cards that name it in `shot` — one region per card, `box`=`frame`, `card`=the card's id — so H's whole deck shows as tap targets on its photos from the first start, with no AI call. A photo with no cards gets no regions and is marked **not analysed**; the backlog is not analysed by itself (H's inbox holds 237 photos, the relay's cap is 200 calls a phone a day — v411's rule that only an explicit act costs a call). A tap on such a photo's "Find the texts" runs the analysis for that photo alone.

## 4. The photo browser

**Where:** the Camera tab (**D2** below). The inbox row is the surface — the photo full width, as today, with its regions drawn on it. Take photo and From album stay at the top (v353). Under the photo one line, "6 texts · 2 cards" (or "Finding the texts …" with the shimmer of v325, or v438's sentence), and Crop / Delete as today.

**The regions on the photo:** each region is an absolutely positioned element over the photo in percent coordinates (as `cropRectStyle` draws the frame), turned by `a` where the frame was turned. The tap target is never smaller than 44 × 44 CSS px — a small label's box is grown around its centre to that floor for the hit test only, never for the drawing; two regions whose grown targets overlap resolve a tap to the nearer centre. A tap on the photo outside every region does what it does today (the whole-photo view).

**How a region looks (D3):** the recommendation is a **thin outline in the frame's own white-on-dark dash** (the crop frame's look, v50) that shows for two seconds when the photo scrolls into view or the analysis ends, and then fades to **a small dot at the region's corner**, so the photo stays a photo. A region that is a card carries a filled dot in the tint; in phase 3 the dot's colour is the card's state (§ 7). Nothing is dimmed, nothing covers the characters.

**Scrolling:** the inbox scrolls vertically as today; photos stay lazy (their object URLs are made as they come into view, as the list's thumbnails are since v213). The 237-photo inbox must scroll at 60 frames a second with regions drawn — measured before merge, as v307 measured the list.

**Marking and deleting** photos (v351–v355, long press) are untouched.

## 5. The tap

1. H taps a region.
2. **If the region is a card**, the card detail opens on it (`S.detail`), with **← Photo** in place of ← Cards. Back returns to the inbox at the same scroll and the same photo (`backToList`'s rule of v352, on the inbox).
3. **If the region is not a card yet**, the card is made first, then opened: `readingCard` from the region's own `zh`/`p`/`m`/`ai` (exactly what `splitCards` does per label today), the picture cut from the photo at the region's box (`cropBlob`, through `cardJpeg`, the label's own cut as in v362; the 16:9 window of v329 when the region is the photo's only text), `frame`=`box`, `shot`, `region`=`rid`, `tags` with the photo's kind, `mt` as the split's cards get it, **written to IndexedDB at the tap** — the tap is the decision (**D1**). The region's `card` is set. The Undo line of v268 stands under the detail for five seconds: "Card made — 混合" with **Undo**, which deletes the card again and clears `card` on the region.
4. **A swipe in the open card** goes to the previous or next region **of this photo** in the model's reading order (v445's `wireSwipe(card,o)` with the photo's regions as the list — `peer(i)` builds the neighbour's card from its region without writing it, `go(i)` makes the card as in step 3 when it lands). So H can walk a panel button by button from one tap.
5. **Delete card** in the detail (v268, with Undo) clears `card` on the region and returns to the photo; the region stays a tap target.
6. **Edit** opens the Edit form as today; Crop again starts from the region's box (`frame`), as it does for every card since v244. A frame moved there updates the region's box on Save.

**A region the reader could not place** (`placed:"none"`, the v380 case) is drawn as the whole photo's outline? No — it is not drawn at all; it is listed under the photo as a chip with its text ("洗衣液", "柔顺剂"), and the chip is its tap target. The card it makes carries the frame's own picture, as today. A learner can still reach every text the model read, and the photo shows only what the app can point at.

## 6. The pipeline: regions instead of cards (**D1**)

Today the automatic card path (v325) ends in `finishPending` → one card, or `splitCards` → N cards. Photo mode ends it in **`regions` on the photo and no card**:

- **A panel or a screenshot** (`apart` with `SPLIT_MIN` labels or more, the placement of v359–v447): one region per label, `box` from the placement, `placed` saying how. Everything up to the cut is unchanged — the drawing test, the run search, the row bands, the free-standing element (v392), the merged-label head (v407/v443), the ordered fill (v444), the paid-for answer consumed on a strong reading (v447). Only the last step changes: `splitCards` writes regions, not cards.
- **A single text** (a sign, a poster, a label): one region, `box` = the placed frame (`PLACED[id]`, else the proposal), `zh`/`p`/`m` from the reading as `finishPending` would fill the card. The v410 line filter and the v400 agreement check run as today and land on the region (`ai.out`, a `doubt` flag the card inherits).
- **Nothing readable** (v348's `noText`, v438's unreached AI on a weak reading): no regions, `regionsErr` set, the row's sentence as today, Crop as the way in.
- **Crop by hand** (the frame, Save card, Save now, the v437 Crop right after the shutter): unchanged — a hand-drawn frame makes a card as today, and that card's frame is added to the photo as a region with `card` set. The hand always has the floor.
- **From album with several photos** (v411): the batch analyses them one after the other into regions; the line under Inbox stays.
- **v440's provisional card** becomes the provisional **regions**: on a strong reading the outlines appear at once with the check's bar under the photo, and the AI's answer refines the texts in place. The v441 gate holds them back the same way.

What this changes for H, said plainly: **a photo of a sign no longer makes a card by itself.** It makes a marked photo, and the card comes with the tap on the sign — one tap more than today on a single-text photo, twenty cards fewer on a panel. H said at v325 "It can be saved by itself. Is that recommended?" and took the recommendation; this spec reverses that for the reason in D1. If H wants the single-text case kept as it is, that is option C in D1 and costs nothing extra to build.

## 7. State on the photo (phase 3)

Every card has a progress row, so the photo can show what H knows: the region's dot in **grey** for a text with no card, **tint** for a card that is new or still learning (interval under `KNOWN_DAYS` 21), **green** (`--ok`) for a known card. A screenshot of Meituan's home screen then shows at a glance which of the fifteen functions H can read — the photo is the progress report. A line under the photo: "6 texts · 4 known". This is the part that makes the mode more than a different list, and it is cheap: one lookup per region at render.

## 8. Decisions for H

- **D1 — What makes a card.** *(A)* Every region becomes a card at analysis time, as today; photo mode is only a new view on the same cards. *(B, recommended)* Regions are found at analysis time, a card is made by the tap. *(C)* B for photos with several regions, A for a single-text photo. Recommendation B, and the reason is the deck: a panel photo today puts twenty cards into Learn of which H knows most (开始, 取消, 时间), and the star of v425–v429 exists because the deck had stopped meaning "what I want to learn". With B the deck is exactly the texts H tapped because he did not understand them, which is what a flashcard deck is for. The cost is the extra tap on a lone sign and the reversal of v325's "the result is the finished card". Under B the Cards list and Learn are untouched in code and become smaller in content.
- **D2 — Where the photos live.** *(A, recommended)* The Camera tab's inbox is the browser; the finished-card rows under a photo (v325's `resultHTML`, v358's "11 cards from this photo" list) go, since the photo itself now carries them. *(B)* A separate "Photos" screen reached from the inbox row (tap the photo → full-screen photo with regions), the inbox as today. *(C)* The Cards tab becomes Photos, with the card list behind a chip. A is one screen fewer and matches "I scroll photos"; C would take the search and the filters away from where they are. Four tabs stay (v25).
- **D3 — How visible the regions are.** Outline that fades to a dot (recommended), dots only, outlines always, or nothing drawn (tap anywhere, nearest region answers). A photo covered in rectangles is the thing H did not want at v288 ("only show the frame after identifying the right area").
- **D4 — The backlog.** Existing photos get regions from their cards only, and "Find the texts" per photo on demand (recommended); or one batch over the whole inbox, at up to 237 relay calls.
- **D5 — Lookup or learn.** Under B the tap makes the card. The alternative is a card view that is a lookup only, with a "+ Learn" button that keeps it. Recommendation: the tap keeps it, Undo takes it back — "zack, zack, ohne groß Nachdenken" (H at v421), and a lookup is the best possible evidence that the text is worth a card.

## 9. What it costs and what it cannot do

- **No new AI call.** Regions come from the answer the app already asks for; a tap costs one `cropBlob` and one IndexedDB write. Analysing an old photo on demand costs one picture call, as a photo does today.
- **The segmentation is as good as the split is, no better.** On H's washing machine that is 15–17 of 20 labels with their own place and none on a neighbour's (v386–v447); the rest are chips under the photo (§ 5). A label the model omits is not a region; Crop is the way in, as today. A poster's title and its credits are one region when the model says `apart:false` — the parts row inside the card covers the words.
- **Nothing runs while the app is away** (v411). A shared screenshot is analysed when the app is open.
- **A region is the model's reading.** 血清洗 for 血渍洗 (v447) is on the region and on the card it makes; the AI check and Edit fix it as they fix a card today.
- **One `cardJpeg` per tapped region**, not per label — a panel photo no longer costs twenty cuts and twenty writes at once.
- **Learn's queue shrinks** under B, which is the point, and the "N cards from this photo" head line and the per-photo card list go (D2 A).
- **Not built, named:** regions drawn on the Learn card's whole-photo view (the tap there reveals the card, v82's rule, and a second tap layer would compete with it); a region for a word inside a line (the parts row does that); analysing the whole backlog by itself (D4).

## 10. Phases

1. **The view on today's data (no pipeline change, low risk):** `regions` on the photo record, built at boot from the cards' `frame` and `shot`; the inbox draws them; a tap opens the card; ← Photo; the swipe between a photo's regions. Every card H has becomes a tap target on its photo. Suites: a seeded photo with three cards → three regions at boot, the tap opening the right card, Back at the same scroll, the swipe order, the 44 px floor, no overflow, 60 fps over 200 photos.
2. **Regions instead of cards (D1):** `finishPending` and `splitCards` write regions; the tap makes the card; the provisional regions of v440; the chips for unplaced labels; "Find the texts" on an old photo; the guide's first two sections rewritten (the v259 rule), a `WHATS_NEW` line and a `TO_TEST` line. Suites: the panel suite's fixtures give the same placements as regions (the count of regions equals today's count of cards, `own`/`wrong` unchanged), the autocard suite's finished card becomes a marked photo, Cancel, the v438 no-card case, Crop by hand still a card, the batch.
3. **State on the photo:** the dot's colour from the progress rows, the "N known" line. Suite: a seeded deck of new, learning and known cards → three colours on one photo.

Field check after each phase, on the Xiaomi: the washing machine, the Meituan screenshot, a lone sign, and a photo with nothing readable.
