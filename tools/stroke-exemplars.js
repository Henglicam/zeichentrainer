// Prints the STROKE_EX constant of app.js (v820): the exemplar strokes the drawing sheet snaps to, each with its median
// (vendor/strokes.txt.gz, the 1024 box) and its Kai outline (vendor/outlines.txt.gz). Run from the repo root:
//   node tools/stroke-exemplars.js > /tmp/ex.json
// and paste the one line into app.js after `const STROKE_EX=`. The list below is the source of truth for which stroke of
// which character stands for each basic stroke; change it here, run, paste.
const zlib = require("zlib"), fs = require("fs");
const TYPES = [["heng","一",0],["shu","丨",0],["pie","丿",0],["pie","人",0],["na","人",1],["dian","丶",0],["ti","打",2],["hengzhe","口",1],["henggou","买",0],["shugou","亅",0],["shuti","长",2],["hengzhegou","力",0],["hengpie","又",0],["piedian","女",0],["piezhe","去",3],["shuzhe","山",1],["shuzhe","区",3],["shuwangou","乚",0],["hengzhewangou","九",1],["xiegou","戈",1],["wogou","心",1],["shuwan","四",3],["hengzheti","计",1],["shuzhezhegou","马",1],["hengxiegou","风",1],["hengzhezhepie","及",1],["hengzhewan","朵",1],["wangou","狗",1],["hengzhezhezhegou","乃",0]];
const load = f => { const M = new Map(); for (const line of zlib.gunzipSync(fs.readFileSync(f)).toString("utf8").split("\n")) { const i = line.indexOf("\t"); if (i < 1) continue; M.set(line.slice(0, i), JSON.parse(line.slice(i + 1))); } return M; };
const S = load("vendor/strokes.txt.gz"), O = load("vendor/outlines.txt.gz");
const out = TYPES.map(([n, ch, k]) => { const st = S.get(ch); if (!st || !st[k]) throw new Error(ch + " stroke " + k + " missing"); const o = O.get(ch); return { n, ch, k, m: st[k], o: o && o.length === st.length ? o[k] : null }; });
process.stdout.write(JSON.stringify(out) + "\n");
