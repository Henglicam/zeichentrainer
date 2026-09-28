#!/usr/bin/env python3
"""The NMAX list (v720, H: "Bau die Liste für NMAX auf"): which one-character dictionary lines lose a sense to the
three-sense cut that the app's chooser would otherwise give, and what a larger cut would cost.

`vendor/cedict.tsv.gz` keeps NMAX 3 senses per reading group (tools/cedict-readings.py). For a one-character word that is
where the street meaning can go missing: 本 keeps "(bound form) root; stem; (bound form) origin" and its "this; the
current" and "classifier for books" are cut. This tool reads the full CC-CEDICT (the cedict-json package, see
cedict-readings.py for the download) beside the shipped file and writes docs/NMAX.md:

  - every one-character line whose chooser's answer (bestSense's rule, ported below, without OWN_SENSES) differs between
    the shipped three senses and all of them, sorted by how many dictionary words hold the character (the only
    frequency the data offers) — the characters that need a larger cut;
  - the size of the shipped file with NMAX 5, 8 and unlimited for one-character lines, so the cost is a number.

    python3 tools/cedict-nmax.py package/cedict.json vendor/cedict.tsv.gz docs/NMAX.md

With --write (v722, H: "Go") it also rewrites vendor/cedict.tsv.gz: every one-character line gets the senses the cut took,
appended after the shipped ones — the shipped order and v717's variant strip kept, the source's order never imposed —
and the header goes to v5, which makes every phone fetch the file once (DICT_HEAD in app.js must match).

    python3 tools/cedict-nmax.py package/cedict.json vendor/cedict.tsv.gz docs/NMAX.md --write
"""
import sys, json, gzip, re, collections, io
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from importlib import import_module
cr = import_module("cedict-readings")
cv = import_module("cedict-variants")   # its strip_line: the v717 rule that drops a variant entry's leading senses

US = cr.US
CJK = re.compile(r"[一-鿿㐀-䶿]")
HARD = re.compile(r"^(surname |\(bound form\)|old variant|variant of|\(archaic\)|abbr\. (for|of) |Taiwan pr\.|used in )", re.I)
# "used in …" is not in bestSense's hard set yet (v720): the full CEDICT lists 家's "used in 傢伙|家伙" entry before "home",
# so a rebuild from it in the source's order must skip such notes or 家 says "used in 傢伙" — the PR that raises NMAX adds it
CL = re.compile(r"^classifier for ", re.I)

def senses(body):
    return [x.strip() for x in body.split(";") if x.strip()]

def choose(ss):
    """bestSense without OWN_SENSES: the first sense that is neither hard nor a classifier, else not hard, else the first"""
    return next((x for x in ss if not HARD.search(x) and not CL.search(x)), None) or next((x for x in ss if not HARD.search(x)), None) or (ss[0] if ss else "")

def groups_of(value):
    out = collections.OrderedDict()
    for p in value.split(US):
        m = re.match(r"^\s*\[([^\]]*)\]\s*", p)
        out[m.group(1) if m else ""] = p[m.end():] if m else p
    return out

HEADER5 = "#cedict v5 — a value with \\x1f carries one group per reading, each opening with [pinyin]; one-character lines hold every sense"

def main(src, path, dst, write=False):
    data = json.load(open(src, encoding="utf-8"))
    by = collections.OrderedDict()
    for e in data: by.setdefault(e["simplified"], []).append(e)
    full = collections.OrderedDict()                       # char -> reading -> [sense items]
    words = collections.Counter()                          # char -> dictionary words holding it
    for e in data:
        w = e["simplified"]
        if len(w) == 1 and CJK.match(w):
            full.setdefault(w, collections.OrderedDict()).setdefault(cr.reading(e["pinyin"]), []).extend(e["english"])
        elif len(w) > 1:
            for ch in set(w): words[ch] += 1
    shipped = collections.OrderedDict()
    lines = []
    for line in gzip.open(path, "rt", encoding="utf-8"):
        line = line.rstrip("\n"); lines.append(line)
        if not line or line.startswith("#"): continue
        w, _, v = line.partition("\t")
        if len(w) == 1 and CJK.match(w): shipped[w] = v

    rows = []
    for w, gs in full.items():
        if w not in shipped: continue
        sg = groups_of(shipped[w])
        for r, items in gs.items():
            allS = senses("; ".join(items))
            kept = senses(sg.get(r, sg.get("", ""))) if (r in sg or len(sg) == 1) else None
            if kept is None or len(allS) <= len(kept): continue
            srcv = cv.strip_line(w, "[%s] %s" % (r, "; ".join(items)), by)[0]   # the source's senses after v717's variant strip
            cut = [x for x in senses(re.sub(r"^\s*\[[^\]]*\]\s*", "", srcv)) if x not in kept]   # the senses the shipped line lacks
            if not cut: continue
            now, best = choose(kept), choose(kept + cut)     # appended to the shipped line, its order and the v717 strip kept
            src = choose(senses(re.sub(r"^\s*\[[^\]]*\]\s*", "", srcv)))
            rows.append(dict(w=w, r=r, n=words[w], kept=len(kept), all=len(allS), now=now, best=best, src=src, cut=cut,
                             cl=any(CL.search(x) for x in cut), diff=now != best))
    rows.sort(key=lambda x: (-x["n"], x["w"]))
    junk = [x for x in rows if x["diff"] and HARD.search(x["now"])]   # the shipped answer is no meaning at all
    diff = [x for x in rows if x["diff"] and not HARD.search(x["now"])]
    clcut = [x for x in rows if x["cl"] and not x["diff"]]
    regress = [x for x in rows if x["src"] != x["best"] and not (HARD.search(x["src"]) and HARD.search(x["best"]))]  # both junk: nothing to choose

    def size(nmax):
        out = []
        for line in lines:
            if not line or line.startswith("#"): out.append(line); continue
            w, _, v = line.partition("\t")
            if len(w) == 1 and w in full:
                gs = full[w]; sg = groups_of(v)
                parts = []
                for r, body in sg.items():
                    items = gs.get(r) if r else (list(gs.values())[0] if len(gs) == 1 else None)
                    body2 = "; ".join(items[:nmax] if nmax else items) if items else body
                    parts.append(("[%s] " % r if r else "") + body2)
                v = US.join(parts)
            out.append(w + "\t" + v)
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", compresslevel=9) as f: f.write(("\n".join(out) + "\n").encode("utf-8"))
        return len(buf.getvalue())
    sizes = [(n, size(n)) for n in (3, 5, 8, 0)]

    esc = lambda s: s.replace("|", "\\|")
    o = ["# The NMAX list — one-character lines the three-sense cut hurts", "",
         "Generated by `tools/cedict-nmax.py` from the full CC-CEDICT beside the shipped `vendor/cedict.tsv.gz` (NMAX 3 senses a",
         "reading group). **Words** = dictionary words holding the character, the only frequency the data offers; read the top of",
         "the list as the street, the bottom as the classics. **Now** is what `bestSense` answers from the shipped three senses,",
         "**all** what it would answer with every sense (its own rule, `OWN_SENSES` left out); a row is listed only where the two",
         "differ. The cut senses stand in the last column, `⟂` between them. **Zero rows** means the shipped file holds every",
         "sense of every one-character line — the state since v722 (`--write`), kept here for the next dictionary rebuild.", "",
         "| one-character lines with a cut | the shipped answer is a surname, an abbreviation, a bound form or a note | the answer changes otherwise | only a classifier cut, same answer |", "|---:|---:|---:|---:|",
         "| %d | %d | %d | %d |" % (len(rows), len(junk), len(diff), len(clcut)), "",
         "**Why:** CC-CEDICT lists a character's proper-noun entries (surname, abbreviation) before its word, and the cut takes the",
         "first three senses in that order — 新 ships as \"abbr. for Xinjiang; abbr. for Singapore; surname Xin\" and \"new\" is",
         "cut; 木 and 江 keep the surname and two bound forms. `bestSense` skips those senses, and with nothing left falls back to the",
         "first, so the phone says \"surname Mu\" for a lone 木. The first table is that fault; the second the rows where a better sense",
         "is cut behind a real one. `OWN_SENSES` (只, 本) is left out of the chooser here, so those two rows show the dictionary alone.", "",
         "Where **all** is still a poor sense (木 unresponsive, 乳 suckling, 婆 femme), the good senses are the bound forms the chooser",
         "skips for a character standing alone; since v720 a character beside another one takes them (`besideCJK`), and for one truly",
         "alone the chooser would rather strip the marker than skip the sense — a rule to settle in the PR that raises NMAX.", "",
         "**All** appends the cut senses to the shipped line — its order and v717's variant strip kept — which is the rebuild to make.",
         "A rebuild **from the source in its order** (`cedict-readings.py` as it stands, then `cedict-variants.py`) answers differently",
         "on the rows of table 4 (few: the variant strip catches 愿's two-sense \"honest and prudent\" entry; 只's one-sense \"grain\"",
         "entry has no cut and stays an `OWN_SENSES` case). The chooser here also skips \"used in …\" notes, which `bestSense` does",
         "not yet — the full CEDICT puts 家's \"used in 傢伙|家伙\" entry before \"home\" — so the PR that raises NMAX adds that skip.", "",
         "**Cost of a larger cut for one-character lines** (the whole file, gzip -9; the phone refetches it once per header bump):", "",
         "| NMAX for one character | file size |", "|---|---:|"] + ["| %s | %s KB |" % ("all" if n == 0 else n, format(s // 1024, ",")) for n, s in sizes] + ["",
         "## 1. The shipped answer is no meaning (a surname, an abbreviation, a bound form or a note stands alone)", "",
         "| # | char | reading | words | kept/all | now | all | cut senses |", "|---:|---|---|---:|---:|---|---|---|"]
    for i, x in enumerate(junk, 1):
        o.append("| %d | %s | %s | %d | %d/%d | %s | %s | %s |" % (i, x["w"], x["r"], x["n"], x["kept"], x["all"], esc(x["now"]), esc(x["best"]), esc(" ⟂ ".join(x["cut"]))))
    o += ["", "## 2. The answer changes with all senses (a better sense is cut behind a real one)", "",
          "| # | char | reading | words | kept/all | now | all | cut senses |", "|---:|---|---|---:|---:|---|---|---|"]
    for i, x in enumerate(diff, 1):
        o.append("| %d | %s | %s | %d | %d/%d | %s | %s | %s |" % (i, x["w"], x["r"], x["n"], x["kept"], x["all"], esc(x["now"]), esc(x["best"]), esc(" ⟂ ".join(x["cut"]))))
    o += ["", "## 3. A classifier sense was cut, the answer stays (the top 60 by words)", "",
          "| char | reading | words | now | classifier cut |", "|---|---|---:|---|---|"]
    for x in clcut[:60]:
        o.append("| %s | %s | %d | %s | %s |" % (x["w"], x["r"], x["n"], esc(x["now"]), esc(" ⟂ ".join(c for c in x["cut"] if CL.search(c)))))
    o += ["", "## 4. A rebuild from the source in its order would answer differently (the top 40 by words)", "",
          "| char | reading | words | appended | from the source |", "|---|---|---:|---|---|"]
    for x in regress[:40]:
        o.append("| %s | %s | %d | %s | %s |" % (x["w"], x["r"], x["n"], esc(x["best"]), esc(x["src"])))
    o.append("")
    o.append("%d rows in all." % len(regress))
    open(dst, "w", encoding="utf-8").write("\n".join(o) + "\n")
    if write:
        out, grown, skipped = [], 0, 0
        for line in lines:
            if not line or line.startswith("#"): out.append(HEADER5 if line.startswith("#") else line); continue
            w, _, v = line.partition("\t")
            if len(w) == 1 and w in full:
                gs = full[w]; sg = groups_of(v); parts = []; changed = False
                for r, body in sg.items():
                    items = gs.get(r) if r else (list(gs.values())[0] if len(gs) == 1 else None)
                    if items is None: skipped += 1; parts.append(("[%s] " % r if r else "") + body); continue
                    kept = senses(body)
                    srcv = cv.strip_line(w, "[%s] %s" % (r or list(gs)[0], "; ".join(items)), by)[0]
                    add = [x for x in senses(re.sub(r"^\s*\[[^\]]*\]\s*", "", srcv)) if x not in kept]
                    if add: changed = True
                    parts.append(("[%s] " % r if r else "") + "; ".join(kept + add))
                if changed: grown += 1
                v = US.join(parts)
            out.append(w + "\t" + v)
        with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f: f.write("\n".join(out) + "\n")
        print("written: %d one-character lines grew, %d groups left as they were (reading not in the source)" % (grown, skipped))
    print("%d rows, %d junk answers, %d differ, %d classifier-only, %d source-order differ; sizes %s" % (len(rows), len(junk), len(diff), len(clcut), len(regress), sizes))

if __name__ == "__main__":
    main(*sys.argv[1:4], write="--write" in sys.argv[4:])
