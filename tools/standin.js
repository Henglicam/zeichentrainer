/* v778: the stand-in table for the voice — for every syllable with its tone, one common character that has ONLY that
   reading, so the phone's engine can be handed "航" when the pad wants háng (行 alone would be read xíng). Built from
   vendor/pinyin-pro.js (a character's readings) and vendor/cedict.tsv.gz (how often a character stands in a headword —
   the frequency proxy). Run: node tools/standin.js > /tmp/standin.json, then paste into app.js (STANDIN). */
const fs=require("fs"), zlib=require("zlib"), path=require("path");
const pp=require(path.join(__dirname,"..","vendor","pinyin-pro.js")), P=pp.pinyin;
const CJK=/[一-鿿]/;
const rows=zlib.gunzipSync(fs.readFileSync(path.join(__dirname,"..","vendor","cedict.tsv.gz"))).toString("utf8").split("\n");
const freq=new Map();
for(const r of rows){ const w=r.split("\t")[0]||""; for(const ch of w) if(CJK.test(ch)) freq.set(ch,(freq.get(ch)||0)+1); }
const best=new Map();
for(const [ch,n] of freq){ const multi=String(P(ch,{toneType:"symbol",multiple:true})).trim().split(/\s+/);
  if(multi.length!==1) continue; const syl=multi[0]; if(!/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(syl)) continue; /* a toneless lone reading is no stand-in */
  const cur=best.get(syl); if(!cur||n>cur.n) best.set(syl,{ch,n}); }
const FLOOR=5; /* a character in fewer than five headwords is rare, and a rare character is one the phone's engine may not know — the pad then speaks the character itself */
const out={}; for(const k of [...best.keys()].sort()) if(best.get(k).n>=FLOOR) out[k]=best.get(k).ch;
process.stdout.write(JSON.stringify(out));
