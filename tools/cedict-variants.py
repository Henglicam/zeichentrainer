#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Take a variant entry's glosses off the front of a word's line (v717).

CC-CEDICT carries variant entries — 葯 for 药, 舖 for 铺, 證 for 证 — whose few
senses stand before the word's own in file order, so the merged line began with
them: 药 read "leaf of the iris; medicine; drug", 证 "to admonish; certificate",
and bestSense() showed the first one after every character written on the pad
(H's harness check at v716: 药 in 药店 → "leaf of the iris").

This rewrites ONLY the lines whose leading senses belong to such an entry — an
entry of at most two senses, one of them "variant of …" — and drops those
senses from the front, unless the word's own entry carries the same sense too
(铺 keeps "store"). Everything after them stays byte for byte; 64 lines change
and the header goes to v4 so every phone fetches the file once more.

Usage (the same dump the readings tool documents):
    curl -sSLO https://registry.npmjs.org/cedict-json/-/cedict-json-1.3.20251213.tgz
    tar xzf cedict-json-*.tgz
    python3 tools/cedict-variants.py package/cedict.json vendor/cedict.tsv.gz        # dry run, lists the lines
    python3 tools/cedict-variants.py package/cedict.json vendor/cedict.tsv.gz write  # writes the file

Source: CC-CEDICT via the cedict-json npm package, CC BY-SA 4.0; the file this
writes is a derived database under CC BY-SA 4.0 too.
"""
import json, gzip, collections, re, sys
sys.path.insert(0,'/home/user/zeichentrainer/tools')
from importlib import import_module
cr=import_module('cedict-readings')  # reading(), gloss(), US and HEADER, shared with the readings tool
VAR=re.compile(r'^(old |archaic |erhua )?variant of ',re.I)
isvar=lambda e: len(e['english'])<=2 and any(VAR.search(s) for s in e['english'])
def strip_line(word,value,by):
    groups=collections.OrderedDict()
    for e in by.get(word,[]): groups.setdefault(cr.reading(e['pinyin']),[]).append(e)
    parts=value.split(cr.US); changed=False
    for i,p in enumerate(parts):
        m=re.match(r'^\s*\[([^\]]*)\]\s*',p); r=m.group(1) if m else (list(groups)[0] if len(groups)==1 and len(parts)==1 else None)
        if r is None or r not in groups: continue
        es=groups[r]; k=0
        while k<len(es) and isvar(es[k]): k+=1
        if k==0 or k==len(es): continue
        own={s.strip() for e in es[k:] for s in e['english']}
        lent={s.strip() for e in es[:k] for s in e['english']}-own
        body=p[m.end():] if m else p
        senses=[s.strip() for s in body.split(';')]
        j=0
        while j<len(senses) and (senses[j] in lent or VAR.search(senses[j])): j+=1
        if j==0 or j==len(senses): continue
        parts[i]=('[%s] '%r if m else '')+'; '.join(senses[j:]); changed=True
    return cr.US.join(parts),changed
def main(src,path,write):
    data=json.load(open(src,encoding='utf-8')); by=collections.OrderedDict()
    for e in data: by.setdefault(e['simplified'],[]).append(e)
    lines=[l.rstrip('\n') for l in gzip.open(path,'rt',encoding='utf-8')]
    out=[]; n=0
    for l in lines:
        if not l or l.startswith('#'): out.append(l); continue
        w,_,v=l.partition('\t'); nv,ch=strip_line(w,v,by)
        if ch: n+=1; print(w,'|',v[:60],'->',nv[:60])
        out.append(w+'\t'+nv)
    print('changed',n)
    if write:
        out[0]=cr.HEADER.replace('v3','v4')
        with gzip.open(path,'wt',encoding='utf-8',compresslevel=9) as f: f.write('\n'.join(out)+'\n')
if __name__=='__main__': main(sys.argv[1],sys.argv[2],len(sys.argv)>3)
