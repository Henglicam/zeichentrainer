#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Give the words that have more than one reading their readings back.

CC-CEDICT holds one entry per (word, reading). The file the app ships has always
been one line per simplified word — `word \t senses` — with the readings merged
away, and bestSense() then took the first sense of whichever reading happened to
come first: 合 reads "hé" and the card said "100 ml", which is gě's. v556 found
the same on 雀 ("a freckle", which is qiāo's, under què's reading) and v571 put
it in 58 px type over the pad, which is what H saw: "Fix das Wörterbuch,
100 ml ist falsch".

This rewrites ONLY those words — 1,239 of the file's 115,311 — and leaves every
other line byte for byte as it was. A rewritten value carries one group per
reading, separated by US (0x1f), each group opening with its own tone-marked
reading in brackets:

    合 \t [hé] to close; to join; to fit \x1f [gě] 100 ml; one-tenth of a peck

A value with no 0x1f is the plain old form, so 99 % of the file is untouched and
a phone re-downloads 2.5 MB rather than the reader's whole 15 MB (the vendor
cache keeps its name; app.js re-fetches this one file once, by its header line).
The brackets are what cleanSense() already strips, so anything printing a value
raw still reads properly.

A full rebuild from the current dump is a different decision and is NOT done
here: the newer dump carries 5,137 more words and would change the gloss of some
7,900 single-reading ones, which is not what was asked for.

Usage:
    curl -sSLO https://registry.npmjs.org/cedict-json/-/cedict-json-1.3.20251213.tgz
    tar xzf cedict-json-*.tgz
    python3 tools/cedict-readings.py package/cedict.json vendor/cedict.tsv.gz

Source: CC-CEDICT via the cedict-json npm package, CC BY-SA 4.0. The file this
writes is a derived database and is under CC BY-SA 4.0 too.
"""
import sys, json, gzip, collections, unicodedata

CAP = 120          # the longest a group's gloss may be — the cap the file has always had
NMAX = 3           # senses per group, as before
US = "\x1f"        # separates the reading groups of one word
HEADER = "#cedict v2 — a value with \\x1f carries one group per reading, each opening with [pinyin]"

VOWELS = "aeiouü"
MARKS = {1: "̄", 2: "́", 3: "̌", 4: "̀", 5: ""}

def toned(syl):
    """ge3 -> gě, he2 -> hé, le5 -> le, lu:4 -> lǜ"""
    s = syl.replace("u:", "ü").replace("v", "ü")
    tone = 5
    if s and s[-1].isdigit():
        tone, s = int(s[-1]), s[:-1]
    if tone == 5 or not s:
        return unicodedata.normalize("NFC", s)
    low = s.lower()
    i = -1
    if "a" in low: i = low.index("a")
    elif "e" in low: i = low.index("e")
    elif "ou" in low: i = low.index("o")
    else:
        for k in range(len(low) - 1, -1, -1):
            if low[k] in VOWELS: i = k; break
    if i < 0:
        return unicodedata.normalize("NFC", s)
    return unicodedata.normalize("NFC", s[:i + 1] + MARKS[tone] + s[i + 1:])

def reading(pinyin):
    """CC-CEDICT's 'Le4' / 'he2 tong5' -> the app's own lowercase tone-marked form"""
    return " ".join(toned(x) for x in pinyin.split()).lower()

def gloss(senses):
    v = "; ".join(senses[:NMAX])
    return v[:CAP - 1] + "…" if len(v) > CAP else v

def main(src, path):
    data = json.load(open(src, encoding="utf-8"))
    by = collections.OrderedDict()
    for e in data:
        by.setdefault(e["simplified"], []).append(e)

    out, changed = [HEADER], 0
    for line in gzip.open(path, "rt", encoding="utf-8"):
        line = line.rstrip("\n")
        if not line or line.startswith("#"):
            continue                                  # an earlier header, if any
        word, _, value = line.partition("\t")
        if "\t" in value:                             # already rewritten, tab-separated
            value = value.split("\t")[0]
        groups = collections.OrderedDict()
        for e in by.get(word, []):
            groups.setdefault(reading(e["pinyin"]), []).extend(e["english"])
        groups = {r: g for r, g in groups.items() if g}
        if len(groups) > 1:
            value = US.join("[%s] %s" % (r, gloss(g)) for r, g in groups.items())
            changed += 1
        out.append(word + "\t" + value)

    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
        f.write("\n".join(out) + "\n")
    print("%d words, %d of them rewritten with their readings" % (len(out) - 1, changed))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
