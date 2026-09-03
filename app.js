"use strict";
/* 识字 · Zeichentrainer — standalone PWA
   Persistence via IndexedDB (survives restarts). Camera inbox. Offline. */

/* ---------- Deck (in code, survives everything) ---------- */
/* No built-in deck any more (v33): every card comes from H's photos or the Add form. */

const NEW_PER_SESSION = 8;
const CJK = /[\u4e00-\u9fff]/;
const pySpaced=t=>pinyinPro.pinyin(t,{type:"array",toneType:"symbol"}).join(" ").replace(/(\d) (?=\d)/g,"$1"); /* syllables with tone marks, space-separated; a number stays one token (30, not 3 0) */
const APP_V=146; /* must equal the PWA vN label in index.html — the boot check repairs a shell whose files are of different versions */
const glyphs = s => [...String(s)].filter(ch => CJK.test(ch)).length;
const headFont = s => { const n = glyphs(s); return n<=1?150:n===2?104:n===3?74:n<=8?58:n<=12?44:34; };

/* ---------- SRS (SM-2 light) ---------- */
const DAY = 86400000;
const LEECH_FAILS = 4; /* "again" this many times in a row flags the card for review */
const startOfDay = t => { const d = new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const today = () => startOfDay(Date.now());
function schedule(card, grade){
  let ease = card ? card.ease : 2.5;
  let interval = card ? card.interval : 0;
  const reps = (card ? card.reps : 0) + 1;
  if (grade==="again"){ ease=Math.max(1.3,ease-0.2); interval=0; }
  else if (grade==="hard"){ ease=Math.max(1.3,ease-0.15); interval=interval<1?1:Math.round(interval*1.2); }
  else if (grade==="good"){ interval=interval<1?1:Math.round(interval*ease); }
  else if (grade==="easy"){ ease+=0.15; interval=interval<1?3:Math.round(interval*ease*1.3); }
  const due = grade==="again" ? today() : today()+interval*DAY;
  /* consecutive failures — a leech is usually a bad card, not a bad memory */
  const fails = grade==="again" ? ((card&&card.fails)||0)+1 : grade==="hard" ? ((card&&card.fails)||0) : 0;
  return { interval, ease, due, reps, fails, last:today() };
}
function previewInterval(card, grade){
  const s = schedule(card, grade);
  if (grade==="again") return "<10 min";
  if (s.interval<1) return "<1 d";
  if (s.interval===1) return "1 d";
  return s.interval+" d";
}

/* ---------- IndexedDB (persistent) ---------- */
const DB_NAME="zeichentrainer", DB_VER=3;
let _db=null;
function openDB(){
  return new Promise((res,rej)=>{
    if(_db) return res(_db);
    const r=indexedDB.open(DB_NAME,DB_VER);
    r.onupgradeneeded=e=>{
      const db=r.result, tx=r.transaction;
      if(!db.objectStoreNames.contains("inbox"))    db.createObjectStore("inbox",{keyPath:"id"});
      if(!db.objectStoreNames.contains("settings")) db.createObjectStore("settings",{keyPath:"k"}); /* v2: opt-ins, keys */
      /* v3 (v118): cards and progress are keyed by an id, not by the text — the same characters may be saved again from
         another photo (H). Existing rows keep their text as the id, so nothing else changes for them. */
      for(const name of ["progress","custom"]){
        if(!db.objectStoreNames.contains(name)){ db.createObjectStore(name,{keyPath:"id"}); continue; }
        if(e.oldVersion>=3) continue;
        const rows=[]; const cur=tx.objectStore(name).openCursor();
        cur.onsuccess=()=>{ const c=cur.result; if(c){ rows.push(c.value); c.continue(); return; }
          db.deleteObjectStore(name); const os=db.createObjectStore(name,{keyPath:"id"});
          for(const row of rows) os.put({...row,id:row.id||row.c}); };
      }
    };
    r.onsuccess=()=>{ _db=r.result; res(_db); };
    r.onerror=()=>rej(r.error);
  });
}
function _os(store,mode){ return openDB().then(db=>db.transaction(store,mode).objectStore(store)); }
function idbPut(store,val){ return _os(store,"readwrite").then(os=>new Promise((res,rej)=>{const r=os.put(val);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);})); }
function idbDel(store,key){ return _os(store,"readwrite").then(os=>new Promise((res,rej)=>{const r=os.delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error);})); }
function idbAll(store){ return _os(store,"readonly").then(os=>new Promise((res,rej)=>{const r=os.getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);})); }
function idbClear(store){ return _os(store,"readwrite").then(os=>new Promise((res,rej)=>{const r=os.clear();r.onsuccess=()=>res();r.onerror=()=>rej(r.error);})); }

/* a card into the deck and the store: replace by key or append; storage errors are swallowed like everywhere else */
async function putCard(upd,key){
  const k=key||upd.id, i=S.custom.findIndex(x=>x.id===k);
  if(i>=0) S.custom[i]=upd; else S.custom.push(upd);
  try{ await idbPut("custom",upd); }catch(e){}
}
/* ---------- State ---------- */
const S = { mode:"study", progress:{}, custom:[], inbox:[],
  queue:[], idx:0, revealed:false, done:0, ahead:false, ready:false,
  pendingImg:null, pendingFull:null, pendingUse:"crop", persist:null,
  detail:null, detailHide:false, fullPic:false, query:"", filterUnv:false, filterFlag:false, filterAi:false, filterTag:null, settings:{}, single:null, saved:null,
  editing:null, editFrom:null, editSeq:0, draft:null, pendingShot:null };

function deck(){ return S.custom; }
function buildQueue(includeAhead){
  const lt=learnTag(), p=S.progress, t=today(), d=lt?deck().filter(x=>(x.tags||[]).includes(lt)):deck(); /* Learn: all cards or one tag (v133) */
  const due = d.filter(x=>p[x.id] && p[x.id].due<=t).sort((a,b)=>p[a.id].due-p[b.id].due).map(x=>x.id);
  const fresh = d.filter(x=>!p[x.id]).slice(0,NEW_PER_SESSION).map(x=>x.id);
  let q=[...due,...fresh];
  if(includeAhead && q.length===0)
    q = d.filter(x=>p[x.id]).sort((a,b)=>p[a.id].due-p[b.id].due).slice(0,8).map(x=>x.id);
  return q;
}
const cardOf = id => deck().find(d=>d.id===id); /* cards are addressed by id everywhere; the text is c */
/* Tags (v133, H: "make the cards sortable, for Chinese class, HSK …"): free labels on a card, several allowed; the
   forms offer the labels already in use as chips, the Cards tab filters by one, the Learn tab studies one */
const parseTags=str=>[...new Set(String(str||"").split(/[,，;；]/).map(t=>t.trim()).filter(Boolean))];
const allTags=()=>[...new Set(deck().flatMap(d=>d.tags||[]))].sort((a,b)=>a.localeCompare(b));
function tagsFieldHTML(id,tags){ const cur=tags||[], known=allTags();
  return `<div class="field"><label>Tags</label><input id="${id}" class="tags" value="${esc(cur.join(", "))}" placeholder="Chinese class, HSK 3 …" autocomplete="off">${known.length?`<div class="tagchips" data-tagsfor="${id}">${known.map(t=>`<button type="button" class="chip${cur.includes(t)?" on":""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>`:""}</div>`; }
function wireTags(root,onChange){
  root.querySelectorAll("input.tags").forEach(inp=>{ const box=root.querySelector(`[data-tagsfor="${inp.id}"]`);
    const sync=()=>{ const cur=parseTags(inp.value); if(box) box.querySelectorAll("[data-tag]").forEach(b=>b.classList.toggle("on",cur.includes(b.dataset.tag))); if(onChange) onChange(cur,inp); };
    if(box) box.querySelectorAll("[data-tag]").forEach(b=> b.onclick=()=>{ const cur=parseTags(inp.value), i=cur.indexOf(b.dataset.tag); if(i>=0) cur.splice(i,1); else cur.push(b.dataset.tag); inp.value=cur.join(", "); sync(); });
    inp.oninput=sync; });
}
const learnTag=()=>S.settings.learnTag||"";
function learnChipsHTML(){ const tags=allTags(); if(!tags.length) return ""; const lt=learnTag();
  return `<div class="chipset learnchips">${[["","All cards"],...tags.map(t=>[t,t])].map(([v,l])=>`<button class="chip${lt===v?" on":""}" data-learntag="${esc(v)}">${esc(l)}</button>`).join("")}</div>`; }
function wireLearnChips(){ document.querySelectorAll("[data-learntag]").forEach(b=> b.onclick=async()=>{ await setSetting("learnTag",b.dataset.learntag||""); S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false; S.single=null; S.saved=null; setStats(); render(); }); }
/* the id of a new card: the text itself while it is free (readable in exports), else text plus a timestamp */
const cardId = c => deck().some(d=>d.id===c) ? c+"#"+Date.now() : c;
async function setSetting(k,v){ S.settings[k]=v; try{ await idbPut("settings",{k,v}); }catch(e){} }
/* diagnostics (H debugs alone on the phone): the last errors and the last reading's steps, shown and shared from More → Diagnostics */
const ERRLOG=[], READLOG=[], LAST_READ={passes:null}, AILOG=[]; /* AILOG: the last three AI exchanges, request and raw reply, never the key (v97) */
function logAi(entry){ AILOG.push({t:Date.now(),...entry}); while(AILOG.length>3) AILOG.shift(); }
function logErr(kind,msg){ ERRLOG.push({t:Date.now(),kind,msg:String(msg||"").slice(0,400)}); while(ERRLOG.length>20) ERRLOG.shift(); setSetting("errlog",ERRLOG.slice()).catch(()=>{}); }
window.addEventListener("error",e=>logErr("error",(e.message||"")+(e.filename?` @${String(e.filename).split("/").pop()}:${e.lineno}`:"")));
window.addEventListener("unhandledrejection",e=>{ const r=e.reason; logErr("promise",r&&(r.stack||r.message)||r); });
function diagText(){
  const ago=t=>{ const d=Math.round((Date.now()-t)/1000); return d<60?d+" s ago":d<3600?Math.round(d/60)+" min ago":Math.round(d/3600)+" h ago"; };
  const out=[`Zeichentrainer diagnostics — ${new Date().toLocaleString("en-GB")}`,
    `page ${pageVersion()||"?"} · script ${APP_V} · online ${navigator.onLine} · AI ${aiOn()?aiProvider()+(aiLive()?" live":" off"):"none"} · SW ${navigator.serviceWorker&&navigator.serviceWorker.controller?"yes":"no"}`,
    navigator.userAgent, ""];
  out.push(`Last reading (${READLOG.length} steps):`);
  READLOG.forEach(x=>out.push(`  ${ago(x.t)}  ${x.text}`));
  if(LAST_READ.passes) out.push("  passes: "+JSON.stringify(LAST_READ.passes));
  out.push("", `Drawings (${DRAWLOG.length}, newest last):`);
  DRAWLOG.forEach(x=>{ out.push(`  ${ago(x.t)}  ${x.strokes.length} stroke${x.strokes.length===1?"":"s"} → ${x.alts.join(" ")||"nothing"}${x.strokes_best?` · strokes ${x.strokes_best.join(" ")} · print ${(x.ocr||[]).join(" ")||"nothing"}`:""}`); out.push("    strokes: "+JSON.stringify(x.strokes)); });
  out.push("", `AI exchanges (${AILOG.length}, newest last):`);
  AILOG.forEach(x=>{ out.push(`  ${ago(x.t)}  ${x.model||""} → ${x.status||""}`); out.push("    request: "+x.req); out.push("    reply: "+(x.res||x.err||"")); });
  out.push("", `Errors (${ERRLOG.length}):`);
  ERRLOG.forEach(x=>out.push(`  ${ago(x.t)}  [${x.kind}] ${x.msg}`));
  return out.join("\n")+"\n";
}
async function shareDiag(){
  const text=diagText(), name="zeichentrainer-diagnostics.txt", file=new File([text],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:name}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  if(navigator.share){ try{ await navigator.share({title:name,text}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(text); alert("Copied to the clipboard."); }catch(err){ alert("Sharing is not available here."); }
}

/* ---------- Boot ---------- */
async function boot(){
  try{
    const [prog, cust, inb, sett] = await Promise.all([idbAll("progress"), idbAll("custom"), idbAll("inbox"), idbAll("settings").catch(()=>[])]);
    S.progress = {}; prog.forEach(r=>{ const {id,c,...s}=r; S.progress[id||c]=s; });
    sett.forEach(r=>{ S.settings[r.k]=r.v; });
    if(Array.isArray(S.settings.errlog)) ERRLOG.unshift(...S.settings.errlog.slice(-20));
    /* progress of cards that no longer exist (the built-in deck of v1–v32) is dropped */
    cust.forEach(d=>{ if(!d.id) d.id=d.c; });
    const have=new Set(cust.map(d=>d.id));
    for(const id of Object.keys(S.progress)) if(!have.has(id)){ delete S.progress[id]; idbDel("progress",id).catch(()=>{}); }
    /* creation order (cards without a timestamp, from before v33, come first in key order) */
    S.custom = cust.sort((a,b)=>(a.at||0)-(b.at||0));
    S.inbox = inb.sort((a,b)=>b.ts-a.ts);
  }catch(e){ console.warn("IndexedDB unavailable, session only:", e); }
  S.ready=true;
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  wireChrome(); render();
  autoBreaks(); /* old cards get their photo lines estimated once */
  aiAuto(); window.addEventListener("online",()=>{ _aiAutoRan=false; aiAuto(); });
}

/* ---------- Rendering ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function wireChrome(){
  document.querySelectorAll(".tab").forEach(b=>{
    b.onclick=()=>{ const m=b.dataset.mode;
      S.editing=null; S.editFrom=null;                       /* a tab tap always leaves the edit form */
      if(m==="cards" && (S.mode==="cards"||S.mode==="add")) S.detail=null; /* Cards again → back to the list */
      S.mode=m; render(); };
  });
  $("#cam").onchange=onPhoto; $("#album").onchange=onPhoto; /* camera, or photos already on the phone */
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden && S.mode==="inbox") renderShots(); });
  $("#imp").onchange=importData;
}
function setStats(){
  const remaining=Math.max(0,S.queue.length-S.idx);
  const inStudy=S.mode==="study";
  $("#stat-open").style.display=inStudy?"":"none";
  $("#stat-done").style.display=inStudy?"":"none";
  $("#stat-deck").style.display=inStudy?"none":""; /* three pills overflow a 390px top bar */
  $("#stat-open .v").textContent=remaining;
  $("#stat-done .j").textContent=S.done;
  $("#stat-deck .v").textContent=deck().length;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.mode===S.mode||(b.dataset.mode==="cards"&&S.mode==="add")));
}

/* colours the script draws itself come from the stylesheet's tokens, so canvases and inline SVG follow light and dark */
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function reticleSVG(single,W=260,H=260){
  const tick=14,cx=W/2,cy=H/2;
  const cross = single ? `
    <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" style="stroke:var(--tint)" stroke-width="1" stroke-dasharray="2 6" opacity="${S.revealed?0.5:0.16}"/>
    <line x1="0" y1="${cy}" x2="${W}" y2="${cy}" style="stroke:var(--tint)" stroke-width="1" stroke-dasharray="2 6" opacity="${S.revealed?0.5:0.16}"/>` : "";
  const corners=[[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]].map(([x,y,dx,dy])=>
    `<g style="stroke:var(--label3)" stroke-width="1.25" opacity="0.8"><line x1="${x}" y1="${y}" x2="${x+dx*tick}" y2="${y}"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y+dy*tick}"/></g>`).join("");
  return `<svg width="${W}" height="${H}"><rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" fill="none" style="stroke:var(--sep)"/>${cross}${corners}</svg>`;
}
/* text that lost its line breaks (AI answer, rename) is re-cut where the original broke,
   as long as the character count still matches */
function recutLines(text,origLines){
  if(text.includes("\n")||origLines.length<2) return text;
  const lens=origLines.map(l=>[...l.replace(/\s+/g,"")].length), flat=[...text];
  /* cut at the old offsets as long as they still fall inside the text (a fixed character keeps
     the count; an added one shifts the last line only) */
  const cuts=[]; let k=0; lens.slice(0,-1).forEach(n=>{ k+=n; cuts.push(k); });
  if(!cuts.length||cuts[cuts.length-1]>=flat.length) return text;
  const out=[]; let from=0; cuts.forEach(c=>{ out.push(flat.slice(from,c).join("")); from=c; }); out.push(flat.slice(from).join(""));
  return out.join("\n");
}
/* word cards: seg tokens with "\n" mark the photo's line breaks — rebuild them for new text */
function segWithBreaks(lines){
  const out=[];
  lines.forEach((line,i)=>{
    if(i) out.push("\n");
    const chars=[...line].filter(ch=>CJK.test(ch)).map(ch=>({ch}));
    segmentChars(chars).forEach(seg=>out.push(seg.map(x=>x.ch).join("")));
  });
  return out;
}
/* the text keeps the photo's lines: a horizontal word stays on one line, so the box goes
   wide and the font shrinks to fit instead of wrapping (H: "the image is one line") */
function frontLines(d){
  if(!d.seg) return [d.c];
  const lines=[]; let cur="";
  d.seg.forEach(x=>{ if(x==="\n"){ lines.push(cur); cur=""; } else cur+=x; });
  lines.push(cur); return lines.filter(Boolean);
}
/* cards from before line data existed (or whose lines got lost): estimate the photo's lines from
   the crop's shape — L lines of n/L characters give height/width ≈ L²/n — and cut at word
   boundaries. Runs once at boot per card (marked lb:"auto"); cards saved with real line data
   are lb:"photo" and never touched. */
function estimateLines(n,w,h){ return Math.max(1,Math.min(n,Math.round(Math.sqrt(n*h/w)))); }
function splitByLines(segs,L){
  const n=segs.join("").length, per=Math.ceil(n/L), out=[]; let cur=0;
  segs.forEach(sg=>{
    const chars=[...sg];
    if(cur>0 && cur+chars.length>per){ out.push("\n"); cur=0; }
    if(chars.length>per){ let k=0; while(k<chars.length){ const piece=chars.slice(k,k+per-cur).join(""); out.push(piece); k+=piece.length; cur+=piece.length; if(k<chars.length){ out.push("\n"); cur=0; } } }
    else { out.push(sg); cur+=chars.length; }
  });
  return out;
}
async function autoBreaks(){
  const todo=S.custom.filter(d=>d.kind!=="sign" && d.img && !d.lb && glyphs(d.c)>3);
  for(const d of todo){
    try{
      const bmp=await createImageBitmap(d.img); const L=estimateLines(glyphs(d.c),bmp.width,bmp.height); bmp.close();
      const base=(d.seg||[d.c]).filter(x=>x!=="\n");
      const segs=L>1?splitByLines(base,L):base;
      if(segs.length>1) d.seg=segs; else delete d.seg;
    }catch(e){}
    d.lb="auto"; try{ await idbPut("custom",d); }catch(e){}
  }
  if(todo.length && S.mode==="study") render();
}
function frontBox(lines,base){
  const longest=Math.max(...lines.map(glyphs));
  const wide=longest>3;
  const W=wide?Math.min(440,Math.max(260,(window.innerWidth||390)-32)):260;
  const fs=Math.min(base,Math.floor((W-28)/longest));
  const H=wide?Math.max(150,Math.round(fs*1.3*lines.length+56)):260;
  return {W,H,fs};
}

function render(){
  setStats();
  const main=$("#main");
  main.classList.toggle("center", S.mode==="study"&&!S.editing);
  if(S.editing) return renderEdit(main,S.editing); /* from the card detail or the study back */
  if(S.mode==="study") return renderStudy(main);
  if(S.mode==="add")   return renderAdd(main);
  if(S.mode==="inbox") return renderInbox(main);
  if(S.mode==="more")  return renderMore(main);
  if(S.mode==="cards") return S.detail?renderCardDetail(main,S.detail):renderCards(main);
}
/* ---------- online AI review (T3, opt-in) ----------
   Flagged cards, doubtful OCR and pending translations can be checked by an
   online model (DeepSeek / Qwen / GLM via the OpenAI-style API, or Claude).
   Only text leaves the phone: hanzi, pinyin, meaning and the note — never
   photos. The key lives in the settings store. */
/* providers: Chinese ones take WeChat Pay / Alipay and need no VPN; all but Claude speak the OpenAI-style chat API */
const AI_PROVIDERS={
  deepseek:{name:"DeepSeek", base:"https://api.deepseek.com", model:"deepseek-chat", hint:"sk-…", where:"Key: platform.deepseek.com → API keys. Top up with WeChat Pay or Alipay (a few yuan last months). No VPN needed."},
  qwen:{name:"Qwen (Alibaba Bailian)", base:"https://dashscope.aliyuncs.com/compatible-mode/v1", model:"qwen-plus", hint:"sk-…", where:"Key: bailian.console.aliyun.com → API-KEY (Alipay account). No VPN needed."},
  glm:{name:"GLM (Zhipu)", base:"https://open.bigmodel.cn/api/paas/v4", model:"glm-4-flash", hint:"….…", where:"Key: open.bigmodel.cn → API keys. WeChat Pay or Alipay; glm-4-flash is free. No VPN needed."},
  claude:{name:"Claude (Anthropic)", base:"https://api.anthropic.com/v1/messages", model:"claude-sonnet-5", hint:"sk-ant-…", where:"Key: console.anthropic.com → API keys. Needs the VPN and a card from outside China."},
  custom:{name:"Other (OpenAI-style API)", base:"", model:"", hint:"API key", where:"Any provider with an OpenAI-compatible /chat/completions endpoint: enter its base URL and model name."}
};
const AI_PROVIDER_DEFAULT="deepseek";
function aiProvider(){ return AI_PROVIDERS[S.settings.aiProvider]?S.settings.aiProvider:AI_PROVIDER_DEFAULT; }
function aiModel(){ return S.settings.aiModel||AI_PROVIDERS[aiProvider()].model; }
function aiBase(){ const pv=aiProvider(); return (pv==="custom"?(S.settings.aiBase||""):AI_PROVIDERS[pv].base).replace(/\/+$/,""); }
function aiOn(){ return !!(S.settings.aiKey)&&!!aiBase(); }
function aiQueue(){ return deck().filter(d=>d.flag||(d.mt&&(d.mt.pending||d.mt.suspect))); }
function aiAutoOn(){ return aiOn()&&S.settings.aiAuto!==false; }
/* the online AI is the meaning source whenever it can be reached; the offline model is the fallback */
function aiLive(){ return aiAutoOn()&&navigator.onLine; }
/* "obviously false" OCR: mean symbol confidence below the threshold, or words no dictionary knows */
const OCR_DOUBT=70;
function ocrDoubt(confs,meaning,unknown){
  const cf=(confs||[]).filter(x=>typeof x==="number");
  const mean=cf.length?cf.reduce((a,b)=>a+b,0)/cf.length:100;
  const why=[];
  if(mean<OCR_DOUBT) why.push(`reading confidence ${Math.round(mean)}%`);
  if(unknown&&unknown.length) why.push(`unknown ${unknown.slice(0,3).join(" ")}`);
  if(meaning!==null&&meaning!==undefined&&!meaning) why.push("no dictionary meaning");
  return why.join(", ");
}
/* run the automatic AI review shortly after a card was saved (debounced, online only) */
let _aiSoon=null;
function aiAutoSoon(){ if(!aiAutoOn()) return; clearTimeout(_aiSoon); _aiSoon=setTimeout(()=>{ _aiAutoRan=false; aiAuto(); },1500); }
function aiCardPayload(d){
  return { c:d.c, p:d.p, m:d.m, kind:d.kind||"word", note:d.flagNote||"", why:[d.flag?"flagged by the learner":"", d.mt&&d.mt.suspect?"the reading looks uncertain ("+d.mt.suspect+"), check the characters":"", d.mt&&d.mt.pending?"meaning is only a word-by-word gloss, needs a real translation":""].filter(Boolean).join("; "),
    gloss:d.kind==="sign"?(d.gloss||[]).map(g=>g.w+" "+(g.m||"?")).join(" · "):undefined,
    alt:d.alts&&d.alts.length?d.alts:undefined, script:d.trad?"traditional":undefined };
}
const AI_SYSTEM=`You review flashcards for an adult learning to read Chinese in Beijing. Cards come from OCR of photos (signs, menus, packaging), so the Chinese text may contain OCR slips, the pinyin is auto-generated and the meaning may be a crude word-by-word gloss.
For every card return the corrected card. Rules: "zh" = the Chinese text in simplified characters (always simplified, even when the sign is traditional), fixed only if it is clearly an OCR slip (keep line breaks); "p" = pinyin with tone marks, correct for this context (多音字!), one space between syllables, " / " between lines; "m" = natural English meaning of the whole text as a sign or word (short, in English only, no explanations); the text is usually a real sign, menu item, product name or brand — when the readings circle around a well-known brand or product name, "zh" is that name; "note" = one short sentence on what was wrong, or "ok"; "ok" = true when zh, pinyin and meaning were already right; "zht" = only when the input has "script":"traditional" (the photo shows traditional characters): "zh" written in traditional characters as it stands on the sign; "alt" (when present) = other readings of the same photo by other OCR passes and models — the true text is often a mix of them, or a well-known name or phrase they all circle around; prefer a real sign, menu or product text that every reading could be a misreading of; "bad" = true when the Chinese text is OCR garbage — no plausible sign, menu or product text can be made of it — then keep "zh" as given, leave "m" empty and say so in the note. Before calling a text bad, try the "alt" readings: when one of them, or a mix of them, is a plausible text or a well-known name (a brand on a bottle, a shop name), answer with that as "zh", "bad" false, and say in the note which reading you used. Never replace an unreadable text with a mere guess.
Answer with a JSON array only, one object per input card in the same order: [{"c":"<input c>","zh":"…","p":"…","m":"…","note":"…","ok":true|false,"bad":true|false}]. No prose, no code fences.`;
async function aiAsk(cards,status){
  const key=S.settings.aiKey; if(!key) throw new Error("no API key");
  const pv=aiProvider(), model=aiModel(), user=JSON.stringify(cards.map(aiCardPayload));
  status&&status(`asking ${model} about ${cards.length} card${cards.length>1?"s":""} …`);
  let r;
  try{
    if(pv==="claude")
      r=await fetch(aiBase(),{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model,max_tokens:4000,system:AI_SYSTEM,messages:[{role:"user",content:user}]})});
    else /* OpenAI-style chat completions (DeepSeek, Qwen, GLM, …) */
      r=await fetch(aiBase()+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+key},
        body:JSON.stringify({model,max_tokens:4000,temperature:0,messages:[{role:"system",content:AI_SYSTEM},{role:"user",content:user}]})});
  }catch(err){ logAi({model,req:user.slice(0,1500),err:"no connection: "+(err&&err.message||err)}); throw new Error("no connection (offline"+(pv==="claude"?", or the API is blocked — VPN?":", or this provider refuses calls from a browser — try another provider")+")"); }
  if(r.status===401||r.status===403) throw new Error("API key rejected ("+r.status+")");
  if(r.status===402) throw new Error("no credit left at "+AI_PROVIDERS[pv].name);
  if(!r.ok){ let t=""; try{ const j=await r.json(); t=(j.error&&(j.error.message||j.error))||j.message||""; }catch(e){} throw new Error("API error "+r.status+(t?": "+t:"")); }
  const data=await r.json();
  const raw=pv==="claude"?(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join(""):String(((data.choices||[])[0]||{}).message?.content||"");
  logAi({model,status:r.status,req:user.slice(0,1500),res:raw.slice(0,1500)});
  await loadScriptTables().catch(()=>{}); /* v103: the model answered a traditional sign with traditional "zh" — the card's key is always simplified */
  const text=raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,"");
  let arr; try{ arr=JSON.parse(text); }catch(e){ throw new Error("could not read the model's answer"); }
  if(!Array.isArray(arr)) throw new Error("unexpected answer");
  return arr.map(x=>{ let m=String(x.m||"").trim();
    if(/[\u4e00-\u9fff]/.test(m)&&!/[A-Za-z]{2}/.test(m)){ logErr("ai","meaning answered in Chinese: "+m); m=""; } /* v97: the model once echoed the Chinese text as the meaning — an English meaning or none */
    const zhRaw=String(x.zh||"").trim(), zh=t2s(zhRaw), zht=String(x.zht||"").trim()||(zh!==zhRaw?zhRaw:"");
    return {zh,zht,p:String(x.p||"").trim(),m,note:String(x.note||"").trim(),ok:!!x.ok,bad:!!x.bad,at:Date.now(),model}; });
}
/* run the review over the whole queue (or the given cards) and store suggestions on the cards */
async function aiReview(list,status){
  list=list||aiQueue(); if(!list.length) return 0;
  const sugg=await aiAsk(list,status);
  let n=0;
  for(let i=0;i<list.length;i++){
    const d=list[i], sg=sugg[i]; if(!d||!sg) continue;
    const upd={...d, ai:{...sg, c:d.c}};
    if(!sg.zh) upd.ai.zh=d.c;
    await putCard(upd); n++;
  }
  return n;
}
/* the AI called the text garbage: the card is flagged with the AI's note, the suggestion is done */
async function aiFlag(id){
  const d=cardOf(id); if(!d||!d.ai) return;
  const upd={...d, flag:true, flagNote:d.flagNote||d.ai.note||"the text looks misread"}; delete upd.ai;
  await putCard(upd,id);
}
async function aiAccept(id){
  const d=cardOf(id); if(!d||!d.ai) return;
  if(d.ai.bad) return aiFlag(id); /* never applies an empty meaning */
  const a=d.ai, upd={...d, p:a.p||d.p, m:a.m||d.m};
  delete upd.ai; delete upd.flag; delete upd.flagNote;
  upd.mt={...(upd.mt||{}), src:"llm", verified:true, pending:false}; delete upd.mt.suspect;
  const newC=a.zh&&CJK.test(a.zh)?a.zh.replace(/\r/g,""):d.c;
  await applyCardUpdate(id,upd,newC,true);
}
/* one tap for everything waiting: accept every suggestion */
async function aiAcceptAll(){
  const list=deck().filter(d=>d.ai);
  for(const d of list) await aiAccept(d.id);
  return list.length;
}
async function aiDismiss(id){
  const d=cardOf(id); if(!d||!d.ai) return;
  const upd={...d}; delete upd.ai; if(upd.mt&&upd.mt.suspect){ upd.mt={...upd.mt}; delete upd.mt.suspect; } /* seen by a human */
  await putCard(upd);
}
function aiBoxHTML(d){
  if(!d.ai) return "";
  const a=d.ai, chg=[];
  if(a.bad) return `<div class="aibox bad"><div class="aihead">AI: this text looks misread</div>${a.note?`<div class="ainote">${esc(a.note)}</div>`:""}
    <div class="aiacts"><button class="btn mini primary" data-aiflag="${esc(d.id)}">⚑ Flag for review</button><button class="btn mini" data-aino="${esc(d.id)}">Dismiss</button></div></div>`;
  if(a.zh&&a.zh!==d.c) chg.push(`<div class="hanzi">${esc(a.zh).replace(/\n/g,"<br>")}</div>`);
  if(a.p&&a.p!==d.p) chg.push(`<div class="mono">${esc(a.p)}</div>`);
  if(a.m&&a.m!==d.m) chg.push(`<div>${esc(a.m)}</div>`);
  return `<div class="aibox"><div class="aihead">AI suggestion${a.ok&&!chg.length?": looks right":""}</div>
    ${chg.join("")}${a.note&&a.note.toLowerCase()!=="ok"?`<div class="ainote">${esc(a.note)}</div>`:""}
    <div class="aiacts"><button class="btn mini primary" data-aiok="${esc(d.id)}">${chg.length?"Accept":"Mark verified"}</button><button class="btn mini" data-aino="${esc(d.id)}">Dismiss</button></div></div>`;
}
function wireAi(root){
  (root||document).querySelectorAll("[data-aiok]").forEach(b=> b.onclick=async()=>{ b.disabled=true; await aiAccept(b.dataset.aiok); render(); });
  (root||document).querySelectorAll("[data-aino]").forEach(b=> b.onclick=async()=>{ await aiDismiss(b.dataset.aino); render(); });
  (root||document).querySelectorAll("[data-aiflag]").forEach(b=> b.onclick=async()=>{ b.disabled=true; await aiFlag(b.dataset.aiflag); render(); });
}
/* opt-in automatic run: pending translations are completed when the phone is online */
let _aiAutoRan=false;
async function aiAuto(){
  if(!aiLive()||_aiAutoRan) return;
  const list=S.custom.filter(d=>d.mt&&(d.mt.pending||d.mt.suspect)&&!d.ai); if(!list.length) return;
  _aiAutoRan=true;
  try{ await aiReview(list); if(S.mode==="more"||S.mode==="cards"||S.mode==="inbox") render(); }catch(e){ console.warn("AI auto review:",e); }
}
/* More → Online AI review row + inline setup form */
function renderAiRow(){
  const st=$("#ai-status"), btn=$("#ai-btn"), run=$("#ai-run"), form=$("#ai-form"); if(!st) return;
  const all=aiQueue(), q=all.length, fl=all.filter(d=>d.flag).length, sp=all.filter(d=>!d.flag&&d.mt.suspect).length, pd=q-fl-sp;
  st.textContent=aiOn()?`On: ${AI_PROVIDERS[aiProvider()].name}, ${aiModel()}. Sends card text only, never photos.`:"Off. Needs your own API key (DeepSeek, Qwen, GLM or Claude); sends text only.";
  btn.textContent=aiOn()?"Settings":"Set up";
  run.hidden=!aiOn(); run.disabled=!q;
  run.textContent=q?"Ask AI":"Nothing to review";
  const rs=$("#ai-runstatus"); if(rs) rs.textContent=q?`${q} card${q>1?"s":""} waiting: ${fl} flagged, ${sp} uncertain reading${sp===1?"":"s"}, ${pd} pending translation${pd===1?"":"s"}.`:"Nothing waiting. Flag a card, or save a reading that looks uncertain.";
  btn.onclick=()=>{ form.hidden=!form.hidden; if(!form.hidden) $("#ai-key").focus(); };
  const sel=$("#ai-provider"), showPv=()=>{ const pv=AI_PROVIDERS[sel.value]||AI_PROVIDERS[AI_PROVIDER_DEFAULT];
    $("#ai-basefield").hidden=sel.value!=="custom"; $("#ai-where").textContent=pv.where; $("#ai-key").placeholder=pv.hint;
    /* model follows the provider unless typed by hand in this form */
    if(!$("#ai-model").dataset.hand) $("#ai-model").value=(sel.value===S.settings.aiProvider&&S.settings.aiModel)||pv.model; };
  sel.onchange=showPv; $("#ai-model").oninput=e=>{ e.target.dataset.hand="1"; }; showPv();
  $("#ai-save").onclick=async()=>{
    const key=$("#ai-key").value.trim(), model=$("#ai-model").value.trim(), pv=sel.value;
    await setSetting("aiProvider",pv); await setSetting("aiBase",$("#ai-base").value.trim());
    if(key) await setSetting("aiKey",key); await setSetting("aiModel",model||AI_PROVIDERS[pv].model); await setSetting("aiAuto",$("#ai-auto").checked);
    form.hidden=true; renderAiRow();
  };
  $("#ai-remove").onclick=async()=>{ await setSetting("aiKey",""); await setSetting("aiAuto",false); $("#ai-key").value=""; form.hidden=true; renderAiRow(); };
  run.onclick=async()=>{
    run.disabled=true; const rs=$("#ai-runstatus");
    try{ const n=await aiReview(null,t=>{ rs.textContent=t; }); rs.textContent=`${n} suggestion${n===1?"":"s"} ready. Accept or dismiss them under Cards.`; }
    catch(err){ rs.textContent="failed: "+(err&&err.message||err); run.disabled=false; }
  };
}
/* ---------- progress: cards learned, this week, streak of days ---------- */
function dayKey(t){ const d=new Date(t||Date.now()); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function learnStats(){
  const rows=Object.values(S.progress), weekAgo=today()-6*DAY;
  const total=rows.filter(r=>r.reps>0).length, week=rows.filter(r=>r.last&&r.last>=weekAgo).length;
  const days=new Set(S.settings.days||[]); let streak=0; const d=new Date();
  if(!days.has(dayKey(d))) d.setDate(d.getDate()-1); /* today not yet, count from yesterday */
  while(days.has(dayKey(d))){ streak++; d.setDate(d.getDate()-1); }
  return {total,week,streak};
}
function statsLine(){ const {total,week,streak}=learnStats(); return `${total} card${total===1?"":"s"} learned, ${week} reviewed this week, streak ${streak} day${streak===1?"":"s"}`; }
/* ---------- backup nudge + photo cleanup: everything lives on one phone ---------- */
const OLD_DAYS=30;
function backupNote(){
  const t=S.settings.lastExport, days=t?Math.floor((Date.now()-t)/DAY):null;
  const txt=t?(days===0?"Last export: today.":`Last export: ${days} day${days===1?"":"s"} ago.`):"Never exported.";
  const warn=S.custom.length && (!t||days>=OLD_DAYS);
  return warn?`<span class="warn">${txt} Export now — the cards exist only on this phone.</span>`:txt;
}
/* inbox photos older than 30 days that already became a card */
function oldShots(){ const cut=Date.now()-OLD_DAYS*DAY; return S.inbox.filter(sh=>sh.ts<cut && S.custom.some(d=>d.shot===sh.id)); }
function shotsNote(){ const n=S.inbox.length, o=oldShots().length; return `${n} photo${n===1?"":"s"} in the inbox${o?`, ${o} older than ${OLD_DAYS} days and already turned into cards`:""}.`; }
async function cleanupShots(){
  const list=oldShots(); if(!list.length) return;
  if(!confirm(`Delete ${list.length} old photo${list.length>1?"s":""}? The cards keep their own picture.`)) return;
  for(const sh of list) await delShot(sh.id);
  const st=$("#shots-status"); if(st) st.textContent=shotsNote(); const b=$("#cleanshots"); if(b) b.remove();
}
/* More → Offline translation: not in build / enable (size prompt) / on + pending count */
async function renderNmtRow(){
  const st=$("#nmt-status"), btn=$("#nmt-btn"); if(!st||!btn) return;
  const info=await nmtInfo(); if(!$("#nmt-status")) return;
  const mb=info?Math.round((info.downloadBytes||0)/1e6):0;
  const pend=S.custom.filter(d=>d.kind==="sign"&&d.mt&&d.mt.pending).length;
  const setBtn=(label,fn)=>{ btn.hidden=false; btn.disabled=false; btn.textContent=label; btn.onclick=fn; };
  if(!info){ st.textContent="The translation model is not in this build yet (run the “Fetch zh→en translation model” action on GitHub)."; btn.hidden=true; return; }
  if(!nmtOn()){
    st.textContent=`Chinese to English on the phone (Mozilla, ${mb} MB, downloaded once). Used when there is no connection; online, the AI does it.`;
    setBtn("Download",async()=>{
      await setSetting("nmt",true); btn.disabled=true; /* the button says the size — no extra question */
      try{ await nmtLoad(t=>{ st.textContent=t; }); st.textContent=`Ready. Loaded in ${(NMT.loadMs/1000).toFixed(1)} s.`; }
      catch(err){ st.textContent="Download failed: "+(err&&err.message||err); await setSetting("nmt",false); }
      renderNmtRow();
    });
    return;
  }
  const cached=await nmtCached();
  const timing=NMT.loadMs?` (loaded in ${(NMT.loadMs/1000).toFixed(1)} s${NMT.lastMs?`, last translation ${(NMT.lastMs/1000).toFixed(1)} s`:""})`:"";
  st.textContent=(NMT.ready?"loaded"+timing:cached?"on, model cached":"on, model downloads on first use")+(aiAutoOn()?", used only without a connection":"")+(pend?`, ${pend} card${pend>1?"s":""} pending`:"");
  if(pend) setBtn("Translate pending",async()=>{
    btn.disabled=true;
    try{ const n=await translatePending(t=>{ st.textContent=t; }); st.textContent=`translated ${n} card${n===1?"":"s"}`; }
    catch(err){ st.textContent="failed: "+(err&&err.message||err); }
    setTimeout(renderNmtRow,1500);
  });
  else setBtn("Turn off",async()=>{ await setSetting("nmt",false); renderNmtRow(); });
}
function renderMore(main){
  const ver=($(".ver")||{}).textContent||"";
  const st=S.persist===true?"Persistent on this phone.":S.persist===false?"Not persistent yet. Install the app so the system keeps the data.":"Checking …";
  main.innerHTML=`<div class="pane more">
    <div class="listhead">Your data</div>
    <div class="mrow"><div><div class="t">Export</div><div class="s">Progress and cards as one file, via the share sheet. ${backupNote()}</div></div><button class="btn mini" id="export">Export</button></div>
    <div class="mrow"><div><div class="t">Import</div><div class="s">A zeichentrainer-….json.txt file. Existing cards are overwritten.</div></div><button class="btn mini" id="import">Import</button></div>
    <div class="mrow"><div><div class="t">Flagged cards</div><div class="s">${deck().filter(d=>d.flag).length} flagged for review. Share the list as text, for a teacher.</div></div><span class="btnrow"><button class="btn mini" id="show-flag">Show</button><button class="btn mini" id="share-flag">Share</button></span></div>
    <div class="listhead">Translation</div>
    <div class="mrow"><div><div class="t">Offline translation</div><div class="s" id="nmt-status">Checking …</div></div><button class="btn mini" id="nmt-btn" hidden></button></div>
    <div class="listhead">Online AI review</div>
    <div class="mrow"><div><div class="t">AI review</div><div class="s" id="ai-status"></div></div><button class="btn mini" id="ai-btn">Set up</button></div>
    <div class="aiform" id="ai-form" hidden>
      <div class="field"><label>Provider</label><select id="ai-provider">${Object.entries(AI_PROVIDERS).map(([k,v])=>`<option value="${k}"${aiProvider()===k?" selected":""}>${esc(v.name)}</option>`).join("")}</select>
        <div class="badge" id="ai-where" style="margin-top:6px"></div></div>
      <div class="field" id="ai-basefield" hidden><label>API base URL</label><input id="ai-base" class="mono" autocomplete="off" placeholder="https://…/v1" value="${esc(S.settings.aiBase||"")}"></div>
      <div class="field"><label>API key (stays on this phone)</label><input id="ai-key" type="password" autocomplete="off" value="${esc(S.settings.aiKey||"")}"></div>
      <div class="field"><label>Model</label><input id="ai-model" class="mono" autocomplete="off" value="${esc(aiModel())}"></div>
      <div class="field"><label class="check"><input type="checkbox" id="ai-auto"${S.settings.aiAuto!==false?" checked":""}> Check every new card with the AI automatically (when online)</label></div>
      <div class="badge">What is sent: the Chinese text, pinyin, meaning and your note of flagged, doubtful or pending cards. Never photos.</div>
      <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" id="ai-save">Save</button><button class="del" id="ai-remove">Remove key</button></div>
    </div>
    <div class="mrow"><div><div class="t">Review queue</div><div class="s" id="ai-runstatus"></div></div><button class="btn mini" id="ai-run" hidden></button></div>
    <div class="mrow"><div><div class="t">Storage</div><div class="s" id="storage-status">${esc(st)}</div></div></div>
    <div class="mrow"><div><div class="t">Text recognition</div><div class="s" id="ocr-status">Checking …</div></div><button class="btn mini" id="ocr-btn" hidden></button></div>
    <div class="listhead">Updates without a VPN</div>
    <div class="mrow"><div><div class="t">Mirror</div><div class="s" id="mirror-status">${esc(mirrorText())}</div></div><button class="btn mini" id="mirror-check">Check now</button></div>
    <div class="field"><label>Mirror address (a copy of the app reachable in China)</label><input id="mirror-url" class="mono" autocomplete="off" value="${esc(S.settings.mirror||MIRROR_DEFAULT)}"></div>
    <div class="listhead">On this phone</div>
    <div class="mrow"><div><div class="t">Progress</div><div class="s">${statsLine()}</div></div></div>
    <div class="mrow"><div><div class="t">Photos</div><div class="s" id="shots-status">${esc(shotsNote())}</div></div>${oldShots().length?`<button class="btn mini" id="cleanshots">Delete ${oldShots().length}</button>`:""}</div>
    <div class="listhead">Diagnostics</div>
    <div class="mrow"><div><div class="t">Diagnostics</div><div class="s" id="diag-status">${ERRLOG.length} error${ERRLOG.length===1?"":"s"} logged, last reading ${READLOG.length} step${READLOG.length===1?"":"s"}.</div></div><span class="btnrow"><button class="btn mini" id="diag-show">Show</button><button class="btn mini" id="diag-share">Share</button></span></div>
    <pre class="diag" id="diag-out" hidden></pre>
    <div class="listhead">Start over</div>
    <div class="mrow"><div><div class="t">Reset</div><div class="s">Deletes progress, cards and photos.</div></div><button class="btn mini danger" id="reset">Reset</button></div>
    <div class="listhead">About</div>
    <div class="mrow"><div><div class="t">识字 Zeichentrainer</div><div class="s">${esc(ver)}. Works offline; everything stays on this phone.</div></div></div>
  </div>`;
  $("#export").onclick=exportData;
  $("#import").onclick=()=>$("#imp").click();
  $("#share-flag").onclick=shareFlagged;
  $("#show-flag").onclick=()=>{ S.mode="cards"; S.detail=null; S.editing=null; S.query=""; S.filterUnv=false; S.filterAi=false; S.filterFlag=true; render(); };
  const cs=$("#cleanshots"); if(cs) cs.onclick=cleanupShots;
  $("#diag-show").onclick=()=>{ const o=$("#diag-out"); o.hidden=!o.hidden; if(!o.hidden) o.textContent=diagText(); };
  $("#diag-share").onclick=shareDiag;
  $("#mirror-url").onchange=async e=>{ await setSetting("mirror",e.target.value.trim()); tellMirror(); };
  renderOcrRow();
  $("#mirror-check").onclick=()=>{ mirrorCheck(true); };
  renderNmtRow(); renderAiRow();
  $("#reset").onclick=resetAll;
}

function tagsHTML(d,isNew){
  return `<div class="tags">${d.flag?`<span class="f">⚑ Review</span>`:""}<span class="${isNew?"n":"r"}">${isNew?"New":"Review"}</span></div>`; /* no card type (H, v105) */
}
/* ---------- review flag ----------
   Any card can be flagged when the OCR text, pinyin or meaning looks odd and
   someone (a teacher, later maybe an online model) should check it. The flag
   lives on the card record. */
async function setFlag(id,on,note){
  const d=cardOf(id); if(!d) return;
  const upd={...d};
  if(on){ upd.flag=true; if(note!==undefined){ if(note) upd.flagNote=note; else delete upd.flagNote; } }
  else { delete upd.flag; delete upd.flagNote; }
  await putCard(upd,id);
}
function flagNoteHTML(d){
  return d.flag?`<div class="flagbox">⚑ Flagged for review${d.flagNote?`: ${esc(d.flagNote)}`:""}</div>`:"";
}
function flaggedText(){
  /* plain-text list of flagged cards, e.g. to send to a teacher via the share sheet */
  const list=deck().filter(d=>d.flag);
  const lines=list.map(d=>`${d.c.replace(/\n/g," / ")}\n  ${d.p}\n  ${d.m}${d.flagNote?`\n  note: ${d.flagNote}`:""}`);
  return `Zeichentrainer — ${list.length} card${list.length===1?"":"s"} flagged for review (${new Date().toLocaleDateString("en-GB")})\n\n`+lines.join("\n\n")+"\n";
}
async function shareFlagged(){
  const n=deck().filter(d=>d.flag).length;
  if(!n){ alert("No flagged cards."); return; }
  const text=flaggedText();
  const name="zeichentrainer-review-"+new Date().toISOString().slice(0,10)+".txt";
  const file=new File([text],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:name,text:"Cards flagged for review"}); return; }
    catch(err){ if(err && err.name==="AbortError") return; }
  }
  if(navigator.share){ try{ await navigator.share({title:name,text}); return; }catch(err){ if(err && err.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(text); alert("Copied "+n+" flagged cards to the clipboard."); }
  catch(err){ alert("Sharing is not available here."); }
}
/* one object URL per blob, for images that re-render on every tap (the study front, the Add form) — never revoked while the blob lives */
const BLOBURL=new WeakMap();
function urlOf(blob){ let u=BLOBURL.get(blob); if(!u){ u=URL.createObjectURL(blob); BLOBURL.set(blob,u); } return u; }
/* the whole photo of a card: stored with it, or still in the inbox */
const fullPhoto=d=>d.imgFull||(d.shot&&(S.inbox.find(x=>x.id===d.shot)||{}).blob)||null;
/* the photo on the front: the crop, or — after a tap on it — the whole photo (S.fullPic) */
function frontPic(d){
  const full=fullPhoto(d);
  const blob=S.fullPic&&full?full:d.img; if(!blob) return "";
  return `<img class="signimg${S.fullPic&&full?" full":""}" data-pic="1" src="${urlOf(blob)}" alt="photo">`;
}
function frontHTML(d){
  const scriptNote=d.trad?`<div class="script"><div class="lbl">Traditional characters, as on the photo</div><div class="scriptref"><span class="lbl">Simplified</span><span class="hanzi">${esc(d.c.replace(/\n/g," / "))}</span></div></div>`:""; /* the simplified form for reference (H, v102); plain words, no 简/繁 shorthand (H, v106); the back repeats nothing */
  if(d.kind==="sign"){
    /* sign card: the picture is the exercise, text underneath wrapped only between words */
    const lines=(d.trad||d.c).split("\n");
    const longest=Math.max(...lines.map(glyphs));
    const W=Math.min(440,Math.max(260,(window.innerWidth||390)-32));
    const fs=Math.min(longest<=6?40:longest<=9?30:24,Math.floor((W-28)/longest));
    return `<div class="signfront">${frontPic(d)}
      <div class="signtext" style="font-size:${fs}px">${lines.map(l=>`<div>${esc(l)}</div>`).join("")}</div>${scriptNote}</div>`;
  }
  const single=glyphs(d.c)<=1;
  /* the photo is the cue — it belongs on the front, before reveal */
  const pic=frontPic(d);
  const lines=d.trad?d.trad.split("\n"):frontLines(d), {W,H,fs}=frontBox(lines,headFont(d.c)); /* the front shows the photo's script; the card's key stays simplified */
  return `${pic}<div class="reticle" style="width:${W}px;height:${H}px">${reticleSVG(single,W,H)}<div class="glyph" style="font-size:${fs}px">${lines.map(esc).join("<br>")}</div></div>${scriptNote}`;
}
/* ---------- pronunciation: the phone's own Chinese voice (nothing downloaded, works offline) ---------- */
let TTS_VOICE;
function ttsVoice(){
  if(!("speechSynthesis" in window)) return null;
  if(TTS_VOICE!==undefined) return TTS_VOICE;
  const vs=speechSynthesis.getVoices();
  if(!vs.length){ /* Android hands the voice list over a moment later */
    speechSynthesis.addEventListener("voiceschanged",()=>{ TTS_VOICE=undefined; if(ttsVoice()&&S.revealed) render(); },{once:true});
    return null;
  }
  TTS_VOICE=vs.find(v=>/^zh[-_]?CN/i.test(v.lang))||vs.find(v=>/^(zh|cmn)/i.test(v.lang))||null;
  return TTS_VOICE;
}
function say(text){
  const v=ttsVoice(); if(!v) return;
  try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text.replace(/\n/g,"，")); u.voice=v; u.lang=v.lang; u.rate=0.85; speechSynthesis.speak(u); }catch(e){}
}
const SAY_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15 9.2a3.6 3.6 0 0 1 0 5.6"/><path d="M17.3 6.6a7 7 0 0 1 0 10.8"/></svg>';
function sayBtn(d){ return ttsVoice()?`<button class="say" data-say="${esc(d.c)}" aria-label="Pronounce">${SAY_SVG}</button>`:""; }
function wireSay(root){ (root||document).querySelectorAll("[data-say]").forEach(b=> b.onclick=e=>{ e.stopPropagation(); say(b.dataset.say); }); }
/* dictionary meanings without CC-CEDICT clutter: "[Tian1 jin1 shi4]" pinyin, "CL:…" classifiers */
function cleanSense(m){ return String(m||"").replace(/\(Taiwan pr\.[^)]*\)/g,"").replace(/\[[^\]]*\]/g,"").replace(/\s*CL:[^;,)]*/g,"").replace(/\(\s*\)/g,"").replace(/\s{2,}/g," ").trim(); }
/* the words of the card as buttons on the back — tap one for its pinyin and meaning; a word of
   several characters then offers its characters too. Replaces the old word/gloss tables (H: redundant). */
function cardParts(d){
  let words=d.gloss&&d.gloss.length?d.gloss.map(g=>g.w):(d.kind==="sign"?(d.segs||[]).flat():(d.seg||[]).filter(x=>x!=="\n"));
  words=words.filter(w=>CJK.test(w));
  if(words.length<2) words=[...d.c].filter(ch=>CJK.test(ch)); /* one word → its characters */
  return [...new Set(words)];
}
function charsHTML(d){
  const parts=cardParts(d);
  if(parts.length<2||parts.length>16) return "";
  return `<div class="chars">${parts.map(w=>`<button class="ch" data-ch="${esc(w)}">${esc(w)}</button>`).join("")}</div><div class="chinfo" id="chinfo" hidden></div>`;
}
async function charInfo(w,btn,d){
  const box=$("#chinfo"); if(!box) return;
  document.querySelectorAll(".chars .ch").forEach(b=>b.classList.toggle("on",b===btn));
  box.hidden=false; box.innerHTML=`<span class="badge">loading the dictionary …</span>`;
  try{
    if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js");
    await loadDict().catch(()=>{});
    const known=d&&d.gloss&&d.gloss.find(g=>g.w===w);
    const py=known&&known.p?known.p:pinyinPro.pinyin(w,{toneType:"symbol"});
    const m=cleanSense((known&&known.m)||bestSense(w)||((DICT&&DICT.get(w))||""));
    const chars=[...w].filter(ch=>CJK.test(ch));
    const sub=chars.length>1?`<div class="chars sub">${chars.map(ch=>`<button class="ch" data-sub="${ch}">${ch}</button>`).join("")}</div>`:"";
    box.innerHTML=`<div class="chline"><span class="hanzi">${esc(w)}</span><span class="mono">${esc(py)}</span><span>${esc(m||"not in the dictionary")}</span></div>${sub}`;
    box.querySelectorAll("[data-sub]").forEach(b=> b.onclick=async e=>{ e.stopPropagation(); const ch=b.dataset.sub;
      box.querySelectorAll(".sub .ch").forEach(x=>x.classList.toggle("on",x===b));
      const line=box.querySelector(".chline"); line.innerHTML=`<span class="hanzi">${esc(ch)}</span><span class="mono">${esc(pinyinPro.pinyin(ch,{toneType:"symbol"}))}</span><span>${esc(cleanSense(bestSense(ch)||((DICT&&DICT.get(ch))||""))||"not in the dictionary")}</span>`; });
  }catch(e){ box.innerHTML=`<span class="badge">dictionary not available</span>`; }
}
function wireChars(d){ document.querySelectorAll(".chars:not(.sub) .ch").forEach(b=> b.onclick=e=>{ e.stopPropagation(); charInfo(b.dataset.ch,b,d); }); }
function backHTML(d){
  const wordBlock = d.w ? `<div class="rule"></div>
    <div class="word"><span class="w">${esc(d.w)}</span><span class="wp">${esc(d.wp||"")}</span></div>
    <div class="wm">${esc(d.wm||"")}</div>` : "";
  const glossBlock = d.kind==="sign" ? `
    ${d.mt&&!d.mt.verified?`<span class="flag">meaning unverified${d.mt.pending?" (translation pending)":""}${d.mt.suspect?" (reading uncertain: "+esc(d.mt.suspect)+")":""}</span>`:""}
` : "";
  return `<div class="pin">${esc(d.p)}${sayBtn(d)}</div><div class="mean">${esc(d.m)}</div>${charsHTML(d)}
    ${d.kind==="sign"?glossBlock:wordBlock}${linkedHTML(d)}`;
}
/* the other cards with the same text (v122, H: "if one character connects to various photos, then link them"): their
   crops in a row on the back and in the card detail; a tap opens that card */
const sameText=d=>deck().filter(x=>x.id!==d.id&&x.c===d.c).sort((a,b)=>(b.at||0)-(a.at||0));
function linkedHTML(d){
  const others=sameText(d); if(!others.length) return "";
  return `<div class="linked"><div class="lbl">Also on ${others.length===1?"another photo":others.length+" other photos"}</div><div class="thumbs">${others.map(x=>`<button class="lnk" data-link="${esc(x.id)}" aria-label="Open this card">${x.img||fullPhoto(x)?`<img src="${thumbURL(x)}" alt="">`:`<span class="glyph hanzi">${esc([...x.c][0])}</span>`}</button>`).join("")}</div></div>`;
}
function wireLinks(root){ (root||document).querySelectorAll("[data-link]").forEach(b=> b.onclick=()=>{ S.mode="cards"; S.detail=b.dataset.link; S.detailHide=false; S.fullPic=false; S.editing=null; render(); window.scrollTo({top:0}); }); }
function endSingle(){
  /* leave single-card test mode and restore the session queue */
  const c=S.single; S.single=null;
  if(S.saved){ Object.assign(S,S.saved); S.saved=null; }
  S.revealed=false; S.mode="cards"; S.detail=c; render();
}
function renderStudy(main){
  if(!S.ready){ main.innerHTML=`<div class="badge">loading…</div>`; return; }
  if(!deck().length){
    main.innerHTML=`<div class="done">
      <div class="mark">始</div>
      <h2>No cards yet.</h2>
      <p>Photograph a sign, a menu or a package under <b>Camera</b> — or add a word by hand under <b>Cards → + New</b>.</p>
      <button class="btn" id="go-cam">Take a photo</button>
    </div>`;
    $("#go-cam").onclick=()=>{ S.mode="inbox"; render(); };
    return;
  }
  const finished = S.idx>=S.queue.length;
  if(finished){
    main.innerHTML=learnChipsHTML()+`<div class="done">
      <div class="mark">净</div>
      <h2>All clear.</h2>
      <p>${S.ahead?"Pulled-forward round finished.":"Nothing due today. Come back tomorrow — or pull the next cards forward."}</p>
      <div class="badge" style="margin-bottom:18px">${statsLine()}</div>
      <button class="btn" id="ahead">Pull the next cards forward</button>
    </div>`;
    const a=$("#ahead"); if(a) a.onclick=()=>{ const q=buildQueue(true); if(q.length){S.queue=q;S.idx=0;S.done=0;S.ahead=true;S.revealed=false;render();} };
    wireLearnChips();
    return;
  }
  const c=S.queue[S.idx], d=cardOf(c), sched=S.progress[c]||null, isNew=!S.progress[c];
  let back="";
  if(S.revealed){
    const grds=[["again","Again"],["hard","Hard"],["good","Good"],["easy","Easy"]].map(([g,l])=>
      `<button class="grade" data-g="${g}"><span class="lbl">${l}</span><span class="iv">${previewInterval(sched,g)}</span></button>`).join("");
    back=`<div style="margin-top:26px">${backHTML(d)}${flagNoteHTML(d)}${aiBoxHTML(d)}<div class="grades">${grds}</div>
      <div class="backacts"><button class="del flagbtn${d.flag?" on":""}" id="flag">${d.flag?"⚑ Clear flag":"⚑ Flag for review"}</button><button class="del" id="edit-card">✎ Edit</button></div></div>`;
  } else {
    back=`<div class="hint">Tap the character to reveal${d.imgFull||d.shot?", or the photo for the whole picture":""}.</div>`;
  }
  /* front: no tag row (theme / new / custom is noise while learning); tapping the photo or the character reveals */
  main.innerHTML=learnChipsHTML()+`<div class="card">
    ${S.single?`<div class="topline"><button class="del" id="back-cards">← Cards</button><span class="badge">testing from the list</span></div>`:""}
    <div class="front tap" id="reveal">${frontHTML(d)}</div>
    ${back}</div>`;
  /* tap on the photo: crop ⇄ whole photo; tap on the character: back on and off */
  const rv=$("#reveal"); if(rv) rv.onclick=e=>{ if(e.target.closest("[data-pic]")){ S.fullPic=!S.fullPic; render(); return; } S.revealed=!S.revealed; render(); };
  const bk=$("#back-cards"); if(bk) bk.onclick=endSingle;
  const fl=$("#flag"); if(fl) fl.onclick=async()=>{ await setFlag(c,!d.flag); render(); };
  const ed=$("#edit-card"); if(ed) ed.onclick=()=>{ S.editFrom="study"; S.editing=c; render(); };
  wireSay(); wireChars(d); wireLinks(); wireLearnChips();
  wireAi();
  document.querySelectorAll(".grade").forEach(b=> b.onclick=()=>grade(b.dataset.g));
}

async function grade(g){
  const c=S.queue[S.idx], sched=S.progress[c]||null;
  const s=schedule(sched,g);
  S.progress[c]=s;
  try{ await idbPut("progress",{id:c,...s}); }catch(e){}
  const d=cardOf(c);
  if(s.fails>=LEECH_FAILS && d && !d.flag) await setFlag(c,true,`failed ${s.fails} times in a row — check text, meaning and photo`);
  const day=dayKey(), days=S.settings.days||[];
  if(days[days.length-1]!==day){ days.push(day); if(days.length>400) days.shift(); await setSetting("days",days); }
  if(S.single){ nextSingle(c); return; }
  if(g==="again") S.queue.push(c); else S.done++;
  S.idx++; S.revealed=false; S.fullPic=false; render(); window.scrollTo({top:0});
}
/* "Test this card" continues with the next card of the list (newest first); ← Cards stops */
function nextSingle(c){
  const list=S.custom.slice().sort((a,b)=>(b.at||0)-(a.at||0)).map(d=>d.id);
  const next=list[list.indexOf(c)+1];
  if(!next){ endSingle(); return; }
  S.single=next; S.queue=[next]; S.idx=0; S.revealed=false; S.fullPic=false; render(); window.scrollTo({top:0});
}

/* ---------- Add ---------- */
function renderAdd(main){
  const curImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  const imgField=curImg?`<div class="field" id="f-imgfield"><label>Image (stays on this phone)</label>
      <div class="pimg"><img src="${urlOf(curImg)}" alt="card image">
      <span class="imgacts">${S.pendingFull&&S.pendingImg?`<button class="del${S.pendingUse!=="full"?" on":""}" id="f-usecrop">Crop</button><button class="del${S.pendingUse==="full"?" on":""}" id="f-usefull">Whole photo</button>`:""}<button class="del" id="f-noimg">Remove image</button></span></div></div>`:"";
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back-cards">← Cards</button></div>
    <div class="lead">Add a card by hand.</div>
    <div class="form">
    ${imgField}
    <div class="field"><label>Characters</label><input id="f-word" class="hanzi big" placeholder="快门"></div>
      <div class="field"><label>Pinyin</label><textarea id="f-pin" class="grow" rows="1" placeholder="kuàimén"></textarea></div>
      <div class="field"><label>Meaning</label><textarea id="f-mean" class="grow" rows="1" placeholder="shutter"></textarea></div>
    <div class="field"><label class="check"><input type="checkbox" id="f-flag"> ⚑ Flag for review (text, pinyin or meaning looks wrong)</label>
      <input id="f-note" placeholder="Note for the reviewer (optional)" hidden></div>
    ${tagsFieldHTML("f-tags",(S.draft||{}).tags)}
    <div id="f-pinhint" class="err" style="display:none">Pinyin and meaning were filled in from the photo and are unverified — check the tones and the meaning.</div>
    <div id="f-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="f-add">Add card</button>
    <div id="f-ok" class="ok" style="display:none"></div>
    </div>
  </div>`;
  $("#f-add").onclick=addManual;
  $("#back-cards").onclick=()=>{ S.mode="cards"; S.detail=null; render(); };
  const ni=$("#f-noimg"); if(ni) ni.onclick=()=>{ S.pendingImg=null; S.pendingFull=null; renderAdd(main); };
  const uc=$("#f-usecrop"); if(uc) uc.onclick=()=>{ S.pendingUse="crop"; renderAdd(main); };
  const uf=$("#f-usefull"); if(uf) uf.onclick=()=>{ S.pendingUse="full"; renderAdd(main); };
  /* Draft survives tab switches (e.g. pick word → back to cropping) */
  const d0=S.draft||{};
  $("#f-word").value=d0.w||""; $("#f-pin").value=d0.p||""; $("#f-mean").value=d0.m||""; $("#f-flag").checked=!!d0.flag; $("#f-note").value=d0.note||""; $("#f-note").hidden=!d0.flag; wireGrow(main);
  if(d0.autoPin) $("#f-pinhint").style.display="";
  const saveDraft=()=>{ S.draft={ w:$("#f-word").value, p:$("#f-pin").value, m:$("#f-mean").value, flag:$("#f-flag").checked, note:$("#f-note").value, tags:parseTags($("#f-tags").value),
    autoPin:$("#f-pinhint").style.display!=="none" }; };
  ["f-word","f-pin","f-mean","f-note"].forEach(id=>$("#"+id).oninput=saveDraft);
  wireTags(main,saveDraft);
  $("#f-flag").onchange=()=>{ $("#f-note").hidden=!$("#f-flag").checked; if($("#f-flag").checked) $("#f-note").focus(); saveDraft(); };
}
/* ---------- Cards: library with photos, detail, single-card test, edit ---------- */
const THUMB={};
/* list thumbnail: the whole photo when the card has one (H), otherwise the crop */
function thumbBlob(d){ return d.img||fullPhoto(d); } /* the crop (H, v86); the whole photo only for cards without one */
function thumbURL(d){ return THUMB[d.id]||(THUMB[d.id]=URL.createObjectURL(thumbBlob(d))); }
function dropThumb(id){ if(THUMB[id]){ URL.revokeObjectURL(THUMB[id]); delete THUMB[id]; } }
function cardStatus(d){
  const p=S.progress[d.id]; if(!p) return "";
  const days=Math.round((p.due-today())/DAY);
  return `<span class="st${days<=0?" due":""}">${days<=0?"due":"in "+days+" d"}</span>`;
}
function cardsListHTML(){
  const q=S.query.trim().toLowerCase();
  let list=S.custom.slice().sort((a,b)=>(b.at||0)-(a.at||0)); /* newest first */
  const byText=new Map(); S.custom.forEach(x=>byText.set(x.c,(byText.get(x.c)||0)+1)); /* the same text from several photos (v122) */
  if(S.filterUnv) list=list.filter(d=>d.mt&&!d.mt.verified);
  if(S.filterFlag) list=list.filter(d=>d.flag);
  if(S.filterAi) list=list.filter(d=>d.ai);
  if(S.filterTag) list=list.filter(d=>(d.tags||[]).includes(S.filterTag));
  if(q) list=list.filter(d=>[d.c,d.trad,d.p,d.m,d.w,d.wp,d.wm,d.flagNote,...(d.tags||[])].filter(Boolean).join(" ").toLowerCase().includes(q));
  const rows=list.map(d=>`<button class="crow" data-id="${esc(d.id)}">
      ${d.img?`<img class="thumb" src="${thumbURL(d)}" alt="">`:`<span class="thumb glyph">${esc([...d.c][0])}</span>`}
      <span class="ct"><span class="c">${esc((d.trad||d.c).replace(/\n/g," / "))}</span>${d.trad?`<span class="simpref"><span class="lbl">Simplified</span><span class="hanzi">${esc(d.c.replace(/\n/g," / "))}</span></span>`:""}<span class="p">${esc(d.p)}</span>${(pl=>pl?`<span class="pills">${pl}</span>`:"")(`${d.trad?`<span class="pill trad">Traditional</span>`:""}${byText.get(d.c)>1?`<span class="pill">${byText.get(d.c)} photos</span>`:""}${(d.tags||[]).map(t=>`<span class="pill tag">${esc(t)}</span>`).join("")}`)}<span class="m">${esc(d.m)}</span></span>
      <span class="cs">${d.ai?'<span class="pill ai">AI</span>':""}${d.flag?'<span class="pill flagged">⚑ Review</span>':""}${cardStatus(d)}</span></button>`).join("");
  const empty=S.custom.length?"No cards match.":"No cards yet — take a photo under Camera, or tap + New.";
  return {html:rows||`<div class="badge" style="margin-top:20px">${empty}</div>`, n:list.length};
}
function renderCards(main){
  const unv=S.custom.filter(d=>d.mt&&!d.mt.verified).length, flg=S.custom.filter(d=>d.flag).length, nAi=deck().filter(d=>d.ai).length;
  const {html,n}=cardsListHTML();
  main.innerHTML=`<div class="pane">
    <div class="cardsbar"><input id="q" type="search" placeholder="Search" value="${esc(S.query)}" autocomplete="off"><button class="btn mini primary" id="newcard">+ New</button></div>
    ${nAi?`<div class="aibar"><span>${nAi} AI suggestion${nAi>1?"s":""} waiting</span><button class="btn mini primary" id="ai-acceptall">Accept all</button></div>`:""}
    <div class="chips"><span class="chipset"><button class="chip${S.filterFlag?" on":""}" id="chip-flag">⚑ Flagged (${flg})</button>${nAi?`<button class="chip${S.filterAi?" on":""}" id="chip-ai">AI (${nAi})</button>`:""}<button class="chip${S.filterUnv?" on":""}" id="chip-unv">Unverified (${unv})</button>${allTags().map(t=>`<button class="chip tag${S.filterTag===t?" on":""}" data-tagchip="${esc(t)}">${esc(t)}</button>`).join("")}</span><span class="badge" id="cnt">${n} of ${deck().length}</span></div>
    <div class="clist" id="clist">${html}</div>
  </div>`;
  const wire=()=>{ document.querySelectorAll(".crow").forEach(b=> b.onclick=()=>{ S.detail=b.dataset.id; S.detailHide=false; S.fullPic=false; render(); }); };
  const refresh=()=>{ const r=cardsListHTML(); $("#clist").innerHTML=r.html; $("#cnt").textContent=`${r.n} of ${deck().length}`; wire(); };
  $("#q").oninput=e=>{ S.query=e.target.value; refresh(); };
  $("#chip-unv").onclick=()=>{ S.filterUnv=!S.filterUnv; render(); };
  $("#chip-flag").onclick=()=>{ S.filterFlag=!S.filterFlag; render(); };
  const ca=$("#chip-ai"); if(ca) ca.onclick=()=>{ S.filterAi=!S.filterAi; render(); };
  document.querySelectorAll("[data-tagchip]").forEach(b=> b.onclick=()=>{ S.filterTag=S.filterTag===b.dataset.tagchip?null:b.dataset.tagchip; render(); });
  const aa=$("#ai-acceptall"); if(aa) aa.onclick=async()=>{ aa.disabled=true; await aiAcceptAll(); render(); };
  $("#newcard").onclick=()=>{ S.mode="add"; render(); };
  wire();
}
function renderCardDetail(main,c){
  const d=cardOf(c); if(!d){ S.detail=null; return renderCards(main); }
  const p=S.progress[c];
  const stat=p?`Interval ${p.interval} d, ease ${p.ease.toFixed(2)}, ${p.reps} review${p.reps===1?"":"s"}, next ${new Date(p.due).toLocaleDateString("en-GB")}.`:"Not studied yet.";
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">← Cards</button><span class="badge">${(t=>t?t[0].toUpperCase()+t.slice(1):"")([d.mt&&!d.mt.verified?"unverified":"",d.mt&&d.mt.pending?"translation pending":"",d.mt&&d.mt.suspect?"reading uncertain":""].filter(Boolean).join(", "))}</span></div>
    <div class="card">${tagsHTML(d,!p)}<div class="front tap" id="d-reveal">${frontHTML(d)}</div>
      ${S.detailHide?`<div class="hint">Tap the character to show the answer${d.imgFull||d.shot?", or the photo for the whole picture":""}.</div>`
        :`<div style="margin-top:22px">${backHTML(d)}</div>${flagNoteHTML(d)}${aiBoxHTML(d)}<div class="hint">Tap the character to hide the answer${d.imgFull||d.shot?", or the photo for the whole picture":""}.</div>`}</div>
    <div class="detailacts">
      <button class="btn primary" id="d-test">Test this card</button>
      <button class="btn" id="d-edit">Edit</button>
      <button class="btn${d.flag?" on":""}" id="d-flag">${d.flag?"⚑ Clear flag":"⚑ Flag for review"}</button>
      <button class="btn danger" id="d-del">Delete card</button>
    </div>
    <div class="badge" style="margin-top:14px">${esc(stat)}</div>
  </div>`;
  $("#back").onclick=()=>{ S.detail=null; S.detailHide=false; S.fullPic=false; render(); };
  /* the preview behaves like the test: tap the photo for the whole picture, tap the character to hide and show the answer (H) */
  const rv=$("#d-reveal"); if(rv) rv.onclick=e=>{ if(e.target.closest("[data-pic]")){ S.fullPic=!S.fullPic; render(); return; } S.detailHide=!S.detailHide; render(); };
  $("#d-test").onclick=()=>{
    S.saved={queue:S.queue,idx:S.idx,done:S.done,ahead:S.ahead};
    S.single=c; S.queue=[c]; S.idx=0; S.revealed=false; S.mode="study"; render();
  };
  $("#d-edit").onclick=()=>{ S.editing=c; render(); };
  $("#d-flag").onclick=async()=>{ await setFlag(c,!d.flag); render(); };
  wireSay(); wireChars(d); wireLinks();
  wireAi();
  const del=$("#d-del"); if(del) del.onclick=async()=>{
    if(!confirm("Delete “"+d.c.replace(/\n/g," / ")+"” and its progress?")) return;
    await delCustom(c); S.detail=null; render();
  };
}
function renderEdit(main,c){
  const d=cardOf(c); if(!d){ S.editing=null; S.editFrom=null; return render(); }
  const isSign=d.kind==="sign";
  let removeImg=false, aiApplied=false;
  /* the text is edited like the Read preview (H): a character strip per line, tap a character for the picker and the
     drawing sheet; SIGN carries the lines and the card's crop as the photo reference (no boxes: the whole crop) */
  const eid="edit"+(S.editSeq=(S.editSeq||0)+1), lines0=isSign?d.c.split("\n"):frontLines(d); /* plain id: it goes into selectors */
  const sg=SIGN[eid]={lines:lines0.slice(),orig:lines0.slice(),img:d.img||null,onChange:null,trad:!!d.trad,tradText:d.trad||"",tradTouched:!!d.trad};
  if(d.trad) loadScriptTables().catch(()=>{});
  const cropURL=d.img?URL.createObjectURL(d.img):""; /* the crop itself, not the whole-photo thumbnail (H: "only the cropped image, not with context") */
  const leave=newC=>{ /* back to where the edit started: study back or card detail */
    delete SIGN[eid]; if(cropURL) URL.revokeObjectURL(cropURL);
    const from=S.editFrom; S.editing=null; S.editFrom=null;
    if(from==="study"){ S.mode="study"; S.revealed=true; } else { S.mode="cards"; if(newC) S.detail=newC; }
    render();
  };
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">← Back</button><span class="badge">Edit</span></div>
    <div class="form">
    <div class="field"><label>Characters${d.trad?" (traditional, as on the photo)":""}</label>
      <div class="signed" id="e-lines"></div>
      <textarea id="e-word" class="hanzi" hidden>${esc(lines0.join("\n"))}</textarea>
      </div>
      <div class="field"><label>Pinyin</label><textarea id="e-pin" class="grow" rows="1">${esc(d.p)}</textarea></div>
      <div class="field"><label>Meaning</label><textarea id="e-mean" class="grow" rows="1">${esc(d.m)}</textarea></div>
    ${isSign||!d.w?"":`<div class="field"><label>Context word, pinyin, meaning (optional)</label>
      <div class="row"><input id="e-w" class="hanzi" value="${esc(d.w||"")}" placeholder="学习"><input id="e-wp" value="${esc(d.wp||"")}" placeholder="xuéxí"><input id="e-wm" value="${esc(d.wm||"")}" placeholder="to learn"></div></div>`}
    ${d.img?`<div class="field" id="e-imgfield"><label>Image (stays on this phone)</label><div class="pimg"><img src="${cropURL}" alt=""><button class="del" id="e-noimg">Remove image</button></div></div>`:""}
    <div class="field"><label class="check"><input type="checkbox" id="e-flag"${d.flag?" checked":""}> ⚑ Flag for review (text, pinyin or meaning looks wrong)</label>
      <input id="e-note" value="${esc(d.flagNote||"")}" placeholder="Note for the reviewer (optional)"${d.flag?"":" hidden"}></div>
    ${tagsFieldHTML("e-tags",d.tags)}
    ${aiOn()?`<div class="field" id="e-aifield"${d.mt&&d.mt.src==="llm"&&d.mt.verified?" hidden":""}><button class="btn block" id="e-ai">Ask AI to check text, pinyin and meaning</button><div class="badge" id="e-aistatus" style="margin-top:6px"></div><div id="e-aibox" hidden class="aibox"></div></div>`:""}
    <div id="e-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="e-save">Save changes</button>
    </div>
    <button class="btn danger block" id="e-del" style="margin-top:14px">Delete card</button>
  </div>`;
  $("#back").onclick=()=>leave(); wireTags(main);
  $("#e-flag").onchange=()=>{ $("#e-note").hidden=!$("#e-flag").checked; if($("#e-flag").checked) $("#e-note").focus(); }; /* the note only with the flag, as in the Add form and the preview (v136) */
  /* delete from here too (H): from the study back the session goes on with the next card, otherwise back to the list */
  $("#e-del").onclick=async()=>{
    if(!confirm("Delete “"+d.c.replace(/\n/g," / ")+"” and its progress?")) return;
    await delCustom(c); delete SIGN[eid];
    const from=S.editFrom; S.editing=null; S.editFrom=null;
    if(from==="study"){ S.queue=S.queue.filter(x=>x!==c); if(S.single===c) S.single=null; S.revealed=false; S.fullPic=false; S.mode="study"; }
    else { S.mode="cards"; S.detail=null; }
    render();
  };
  /* the strip: rows like the Read preview, kept in sync with the hidden text field the save reads */
  const syncWord=()=>{ $("#e-word").value=sg.lines.join("\n"); };
  const drawLines=()=>{
    const box=$("#e-lines"); if(!box) return;
    box.innerHTML=sg.lines.map((l,k)=>slineHTML(eid,k,l,false)).join("")+`<div class="scriptline">${sg.trad?`<div class="scriptref"><span class="lbl">Simplified</span><span class="hanzi">${esc(sg.lines.map(l=>l.trim()).filter(Boolean).join(" / "))}</span></div>`:""}${scriptLinkHTML(eid,sg)}</div>`;
    wireSlines(box,()=>{ syncWord(); pinyinFollow(); showAi(); const ref=box.querySelector(".scriptref .hanzi"); if(ref) ref.textContent=sg.lines.map(l=>l.trim()).filter(Boolean).join(" / "); });
    box.querySelectorAll("[data-scripttoggle]").forEach(b=> b.onclick=async()=>{ await setScript(sg,!sg.trad); drawLines(); const lab=box.closest(".field").querySelector("label"); if(lab) lab.textContent="Characters"+(sg.trad?" (traditional, as on the photo)":""); }); /* the mark by hand (v146) */
  };
  /* pinyin follows the text unless it was edited by hand */
  let pinTouched=false; $("#e-pin").addEventListener("input",()=>{ pinTouched=true; }); wireGrow(main);
  const pinyinFollow=()=>{ if(pinTouched||!window.pinyinPro) return; const t=sg.lines.join("").replace(/\s+/g,""); if(CJK.test(t)) $("#e-pin").value=pinyinPro.pinyin(t,{toneType:"symbol"}); };
  /* the AI button only where it adds something: a card the AI did not verify, or a verified one whose text was changed here (H, v135) */
  const showAi=()=>{ const f=$("#e-aifield"); if(f) f.hidden=false; };
  sg.onChange=()=>{ syncWord(); drawLines(); pinyinFollow(); showAi(); const ab=$("#e-ai"); if(ab&&aiLive()) ab.click(); };
  drawLines();
  /* the AI fills the fields in place; nothing is stored until Save */
  const ab=$("#e-ai"); if(ab) ab.onclick=async()=>{
    const st=$("#e-aistatus"), box=$("#e-aibox"); ab.disabled=true; box.hidden=true;
    const zh=$("#e-word").value, pin=$("#e-pin").value.trim(), mean=$("#e-mean").value.trim(), note=$("#e-note").value.trim();
    try{
      const [r]=await aiAsk([{kind:d.kind||"word",c:isSign?zh.split("\n").map(l=>l.trim()).filter(Boolean).join("\n"):zh.replace(/\s+/g,""),p:pin,m:mean,flagNote:note,gloss:d.gloss,mt:{src:"dict",verified:false,suspect:"please check"}}],t=>{ st.textContent=t; });
      if(r.zh&&CJK.test(r.zh)){ const zh=r.zh.replace(/\r/g,""); sg.lines=(isSign?zh:recutLines(zh.replace(/\s+/g,""),sg.lines)).split("\n").map(l=>l.trim()).filter(Boolean); sg.orig=sg.lines.slice(); syncWord(); drawLines(); }
      if(r.p) $("#e-pin").value=r.p;
      if(r.m) $("#e-mean").value=r.m;
      aiApplied=true; st.textContent="";
      box.hidden=false; box.innerHTML=`<div class="aihead">AI${r.ok?": looks right":" filled in its suggestion — check, then Save"}</div>${r.note&&r.note.toLowerCase()!=="ok"?`<div class="ainote">${esc(r.note)}</div>`:""}`;
    }catch(err){ st.textContent="The AI could not be reached: "+(err&&err.message||err); }
    ab.disabled=false;
  };
  const ni=$("#e-noimg"); if(ni) ni.onclick=()=>{ removeImg=true; $("#e-imgfield").remove(); };
  $("#e-save").onclick=async()=>{
    const fail=m=>{ const e=$("#e-err"); e.textContent=m; e.style.display=""; };
    let pin=$("#e-pin").value.replace(/\s+/g," ").trim(); const mean=$("#e-mean").value.replace(/\s+/g," ").trim();
    if(!pin||!mean) return fail("Pinyin and meaning are required.");
    /* the Chinese text itself may be corrected (OCR slip) — progress and images move with it */
    let newC=d.c;
    const we=$("#e-word");
    if(we){
      var wordLines=we.value.split("\n").map(l=>l.replace(/\s+/g,"")).filter(l=>CJK.test(l));
      newC=isSign?wordLines.join("\n"):wordLines.join("");
      if(!CJK.test(newC)) return fail("Please enter Chinese text.");
    }
    const upd={...d, p:pin, m:mean}; delete upd.ex; delete upd.exp; delete upd.exm; /* example sentences were dropped in v41 */
    if(!isSign&&$("#e-w")){ upd.w=$("#e-w").value.trim(); upd.wp=$("#e-wp").value.trim(); upd.wm=$("#e-wm").value.trim();
      if(!upd.w){ delete upd.w; delete upd.wp; delete upd.wm; } } /* the context fields show only on cards that have one */
    if(removeImg){ delete upd.img; delete upd.imgFull; dropThumb(c); }
    if(upd.mt){ upd.mt={...upd.mt, verified:true, pending:false}; delete upd.mt.suspect; } /* a human edited it */
    if(aiApplied) upd.mt={...(upd.mt||{}), src:"llm", verified:true, pending:false};
    const tags=parseTags($("#e-tags").value); if(tags.length) upd.tags=tags; else delete upd.tags;
    if($("#e-flag").checked){ upd.flag=true; const note=$("#e-note").value.trim(); if(note) upd.flagNote=note; else delete upd.flagNote; }
    else { delete upd.flag; delete upd.flagNote; }
    if(sg.trad){ const trad=(sg.tradText||"").trim(); if(trad) upd.trad=trad; else delete upd.trad; } else delete upd.trad; /* the strip's line carries the traditional form; no separate field (H, v110); the link drops the mark (v146) */
    await applyCardUpdate(c,upd,newC,pin!==d.p,isSign?undefined:wordLines);
    leave(c);
  };
}
/* persist an edited card; when the Chinese text changes (OCR slip), recompute
   pinyin/segmentation/gloss (unless pinyin was set by hand). The id stays, so
   progress, thumbnail and queue entries need no move (v118). */
async function applyCardUpdate(id,upd,newC,pinByHand,lines){
  const isSign=upd.kind==="sign", c=upd.c;
  if(newC && newC!==c){
    upd.c=newC;
    try{
      if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js");
      await loadDict().catch(()=>{}); if(isSign) await loadSigns().catch(()=>{});
      if(isSign){
        const res=newC.split("\n").map(lineMeaning);
        upd.segs=res.map(r=>r.segs); upd.gloss=res.flatMap(r=>r.gloss.map(g=>({w:g.w,p:g.p,m:g.m})));
        if(!pinByHand) upd.p=res.map(r=>r.py).join(" / ");
      }else{
        const oldLines=lines||frontLines(upd); /* keep the photo's breaks when only characters changed */
        const segs=segWithBreaks(recutLines(newC,oldLines).split("\n"));
        if(segs.length>1) upd.seg=segs; else delete upd.seg;
        if(!pinByHand) upd.p=pySpaced(newC);
      }
    }catch(e){}
  }
  if(lines && !isSign && (!newC||newC===c)){ const segs=segWithBreaks(lines); if(segs.length>1) upd.seg=segs; else delete upd.seg; }
  if(lines && !isSign) upd.lb="photo"; /* lines set by hand count as the photo's */
  await putCard(upd,id);
  return upd;
}
async function addManual(){
  const word=$("#f-word").value.trim(), pin=$("#f-pin").value.replace(/\s+/g," ").trim(), mean=$("#f-mean").value.replace(/\s+/g," ").trim();
  const err=$("#f-err"), ok=$("#f-ok"); err.style.display="none"; ok.style.display="none";
  const fail=m=>{ err.textContent=m; err.style.display=""; };
  if(!CJK.test(word)) return fail("Please enter a Chinese word.");
  if(!pin||!mean) return fail("Pinyin and meaning are required.");
  if(deck().some(d=>d.c===word&&(!S.pendingShot||d.shot===S.pendingShot))) return fail("“"+word+"” is already in the deck."); /* with a new photo the same text is a new card (v118) */
  const card={id:cardId(word),c:word,p:pin,m:mean,t:"Custom",at:Date.now()};
  const tags=parseTags($("#f-tags").value); if(tags.length) card.tags=tags;
  if($("#f-flag").checked){ card.flag=true; const note=$("#f-note").value.trim(); if(note) card.flagNote=note; }
  if(S.pendingShot){ card.shot=S.pendingShot; S.pendingShot=null; }
  const chosenImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  if(chosenImg){ card.img=await jpegOf(chosenImg); }
  S.pendingImg=null; S.pendingFull=null;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false);
  ["f-word","f-pin","f-mean","f-note","f-tags"].forEach(id=>$("#"+id).value=""); $("#f-flag").checked=false; $("#f-note").hidden=true;
  const fi=$("#f-imgfield"); if(fi) fi.remove();
  $("#f-pinhint").style.display="none";
  S.draft=null;
  ok.textContent="“"+word+"” added."; ok.style.display="";
  setStats();
}
async function delCustom(id){
  S.custom=S.custom.filter(x=>x.id!==id);
  try{ await idbDel("custom",id); await idbDel("progress",id); }catch(e){}
  delete S.progress[id]; dropThumb(id);
  setStats();
}

/* ---------- OCR (Tesseract.js + pinyin-pro + CC-CEDICT, fully local from ./vendor — no CDN) ---------- */
let _ocrWorker=null, _ocrLoading=null;
function loadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src=src; s.onload=res; s.onerror=()=>rej(new Error("script failed to load"));
    document.head.appendChild(s);
  });
}
/* CC-CEDICT (simplified -> English gloss), lazily loaded from ./vendor */
let DICT=null, _dictLoading=null;
function loadDict(){
  if(DICT) return Promise.resolve(DICT);
  if(!_dictLoading){
    _dictLoading=(async()=>{
      const url=new URL("./vendor/cedict.tsv.gz",location.href).href;
      let r=await fetch(url);
      if(!r.ok){
        /* heal a poisoned cache entry (e.g. a 404 cached before the file was deployed) */
        try{ const c=await caches.open("zt-ocr-v1"); await c.delete(url); }catch(e){}
        r=await fetch(url,{cache:"reload"});
        if(!r.ok) throw new Error("dictionary not available ("+r.status+")");
      }
      const buf=new Uint8Array(await r.arrayBuffer());
      /* gzip magic bytes — if a server/proxy already decompressed, treat as plain text */
      const text=(buf[0]===0x1f&&buf[1]===0x8b)
        ? await new Response(new Response(buf).body.pipeThrough(new DecompressionStream("gzip"))).text()
        : new TextDecoder().decode(buf);
      DICT=new Map();
      for(const line of text.split("\n")){
        const i=line.indexOf("\t");
        if(i>0) DICT.set(line.slice(0,i),line.slice(i+1));
      }
      return DICT;
    })().catch(err=>{ _dictLoading=null; throw err; });
  }
  return _dictLoading;
}
let _ocrLog=null; /* progress handler of the job currently running (v63: the pad's reading once overwrote the photo's editor) */
async function ocrWorker(status){
  if(_ocrWorker) return _ocrWorker;
  if(!_ocrLoading){
    _ocrLoading=(async()=>{
      status("Loading OCR … (one-time ~12 MB, works offline afterwards)");
      if(!window.Tesseract) await loadScript("./vendor/tesseract.min.js");
      if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js");
      await loadDict().catch(()=>{}); /* meanings are optional — OCR works without */
      /* paths derived from the page URL at runtime — stays relative to the subpath */
      const w=await makeWorker("chi_sim");
      _ocrWorker=w; return w;
    })().catch(err=>{ _ocrLoading=null; throw err; });
  }
  return _ocrLoading;
}
function makeWorker(lang){
  const base=new URL("./vendor/",location.href).href;
  return Tesseract.createWorker(lang,1,{
    workerPath:base+"worker.min.js",
    corePath:base+"tesseract-core-simd-lstm.wasm.js",
    langPath:base.replace(/\/$/,""),
    cacheMethod:"none", /* SW cache covers offline; tesseract's IndexedDB cache is a known corruption source */
    logger:m=>{ if(m.status==="recognizing text"&&_ocrLog) _ocrLog(Math.round(m.progress*100)); } /* one job at a time, whichever worker: the running job's handler */
  });
}
/* The traditional-character reader (v96, H's Yakult bottle: 養樂多 is a traditional logo, and the simplified model can only
   answer with the nearest simplified shapes — 养兴多, 和准浴多; chi_tra reads 義樂多). Loaded on first need, its lines are
   converted to simplified characters (`t2s`, OpenCC's character table) and compete like any other reading. */
let _traWorker=null, _traLoading=null, T2S=null, S2T=null, _tablesLoading=null;
/* OpenCC's character tables both ways: traditional → simplified for the reader, simplified → traditional for the card's
   traditional form (v101, H: "the hanzi doesn't match the image" — a character-level table, so 头发 becomes 頭發 where
   the AI would write 頭髮; the AI's "zht" wins when it answers) */
function loadScriptTables(){
  if(T2S&&S2T) return Promise.resolve();
  if(!_tablesLoading) _tablesLoading=(async()=>{
    const mk=txt=>{ const m=new Map(); for(const line of txt.split("\n")){ const cs=[...line]; if(cs.length>=2) m.set(cs[0],cs[1]); } return m; };
    const [a,b]=await Promise.all([fetch("./vendor/t2s.txt").then(r=>r.text()),fetch("./vendor/s2t.txt").then(r=>r.text())]);
    T2S=mk(a); S2T=mk(b);
  })().catch(err=>{ _tablesLoading=null; throw err; });
  return _tablesLoading;
}
async function traWorker(status){
  if(_traWorker) return _traWorker;
  if(!_traLoading){
    _traLoading=(async()=>{
      status("loading the traditional-character reader …");
      await loadScriptTables();
      const w=await makeWorker("chi_tra"); _traWorker=w; return w;
    })().catch(err=>{ _traLoading=null; throw err; });
  }
  return _traLoading;
}
const t2s=str=>T2S?[...str].map(c=>T2S.get(c)||c).join(""):str;
const s2t=str=>S2T?[...str].map(c=>S2T.get(c)||c).join(""):str;
/* the traditional reader's lines, converted; null when that reader cannot be had (offline before its first download) */
async function readPassTra(blob,status){
  let w; try{ w=await traWorker(status); }catch(err){ logErr("tra",err&&err.message||err); return null; }
  const ls=await readPass(w,blob,status); return ls.map(l=>({...l,t:t2s(l.t),tra:true}));
}

/* per-photo result (session only): characters with box + auto pinyin; tap to select */
const QSNOTE={}, QSCARD={}, READING={}; /* READING[id]: status text while the photo is being read · QSCARD[id] = card saved from this shot (AI suggestion shows under the photo) · QSNOTE[id] = the note under the photo after saving */
/* greedy longest-match segmentation against CC-CEDICT (max word length 8) */
function segmentChars(chars){
  const out=[]; let k=0;
  while(k<chars.length){
    let len=Math.min(8,chars.length-k);
    while(len>1 && !(DICT&&DICT.has(chars.slice(k,k+len).map(c=>c.ch).join("")))) len--;
    out.push(chars.slice(k,k+len));
    k+=len;
  }
  return out;
}
/* the AI's answer for the card just saved from this photo, with one-tap Accept */
function qsAiBox(id){ const c=QSCARD[id], d=c&&cardOf(c); return d&&d.ai?aiBoxHTML(d):""; }
/* AI check of the current OCR selection, right in the selection bar (no tab change) */
/* automatic: every selection is checked without a tap (a few hundred tokens per card —
   fractions of a fen at DeepSeek); debounced so tapping through words fires one request per text */
/* ---------- Cropping (crop → OCR or card image) ---------- */
let CROP=null; // {id, rect:{x,y,w,h,lw,lh}} while cropping — stays until the card is saved (H, v50)
function cropRectStyle(){
  const r=CROP&&CROP.rect; if(!r||!r.lw||!r.lh) return "";
  const pc=v=>(v*100).toFixed(2)+"%";
  return ` style="display:block;left:${pc(r.x/r.lw)};top:${pc(r.y/r.lh)};width:${pc(r.w/r.lw)};height:${pc(r.h/r.lh)}"`;
}
function wireCrop(layer){
  const rect=layer.querySelector(".croprect");
  layer.onpointerdown=e=>{
    const r=layer.getBoundingClientRect();
    const px=e.clientX-r.left, py=e.clientY-r.top;
    const cur=CROP.rect;
    const setRect=(x,y,w,h)=>{
      Object.assign(rect.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px",display:"block"});
      CROP.rect={x,y,w,h,lw:r.width,lh:r.height};
    };
    /* three modes: grab a corner -> resize (opposite corner anchored),
       press inside the frame -> move it, anywhere else -> draw a new frame */
    let mode="draw", anchor=[px,py], grab=null, mw=0, mh=0;
    if(cur){
      const corners={tl:[cur.x,cur.y],tr:[cur.x+cur.w,cur.y],bl:[cur.x,cur.y+cur.h],br:[cur.x+cur.w,cur.y+cur.h]};
      for(const k of ["tl","tr","bl","br"]){
        if(Math.hypot(px-corners[k][0],py-corners[k][1])<=22){
          mode="resize"; anchor=corners[{tl:"br",tr:"bl",bl:"tr",br:"tl"}[k]]; break;
        }
      }
      if(mode==="draw" && px>=cur.x&&px<=cur.x+cur.w&&py>=cur.y&&py<=cur.y+cur.h){
        mode="move"; grab=[px-cur.x,py-cur.y]; mw=cur.w; mh=cur.h;
      }
    }
    if(mode==="draw"&&cur) return; /* a frame exists: no new frame — the swipe scrolls the page instead (`.croplayer.framed`, v131/v132); adjusting the frame is allowed and re-reads, Cancel removes it (H, v129–v132) */
    e.preventDefault();
    clearTimeout(READ_TIMER[layer.dataset.id]); /* adjusting the frame — read after the next release */
    if(mode==="draw") setRect(px,py,0,0);
    layer.setPointerCapture(e.pointerId);
    layer.onpointermove=ev=>{
      const x=Math.min(Math.max(ev.clientX-r.left,0),r.width);
      const y=Math.min(Math.max(ev.clientY-r.top,0),r.height);
      if(mode==="move"){
        setRect(Math.min(Math.max(x-grab[0],0),r.width-mw),
                Math.min(Math.max(y-grab[1],0),r.height-mh), mw, mh);
      }else{
        setRect(Math.min(anchor[0],x),Math.min(anchor[1],y),Math.abs(x-anchor[0]),Math.abs(y-anchor[1]));
      }
    };
    layer.onpointerup=()=>{
      layer.onpointermove=null; layer.onpointerup=null;
      layer.classList.add("framed"); /* from now on strokes outside the frame scroll the page (v132) */
      showCropPreview(layer.dataset.id); /* starts the automatic read */
    };
  };
}
/* after the frame is released: show the area, then read it automatically — no tap needed;
   a corner drag within that moment restarts the wait */
const READ_TIMER={}, READ_WAIT=1200;
let _prevURL=null;
async function showCropPreview(id){
  const box=$("#ocr-"+id); if(!box) return;
  let r=null; try{ r=await cropBlob(id); }catch(err){ box.innerHTML=`<span class="badge">Reading failed: ${esc(err&&err.message||err)}</span>`; logErr("crop",err&&(err.stack||err.message)||err); return; }
  if(!r){ box.innerHTML=`<span class="badge">Frame too small — draw again.</span>`; return; }
  if(_prevURL) URL.revokeObjectURL(_prevURL);
  _prevURL=URL.createObjectURL(r.blob);
  box.innerHTML=`<div class="croppreview">
    <img src="${_prevURL}" alt="selected area">
    <div class="badge" style="margin:6px 0 8px">Reading in a moment — drag a corner first if the frame is off.</div>
    <div class="cropacts">
      <button class="del" data-cropread="${id}">Read now</button>
      <button class="del" data-cropok="${id}">Image only</button>
    </div></div>`;
  box.querySelector("[data-cropread]").onclick=()=>{ clearTimeout(READ_TIMER[id]); cropSign(id); };
  box.querySelector("[data-cropok]").onclick=()=>{ clearTimeout(READ_TIMER[id]); cropOk(id); };
  clearTimeout(READ_TIMER[id]);
  READ_TIMER[id]=setTimeout(()=>{ if(CROP&&CROP.id===id&&CROP.rect) cropSign(id); },READ_WAIT);
}
async function cropBlob(id){
  const rec=S.inbox.find(s=>s.id===id);
  if(!rec||!CROP||!CROP.rect||CROP.rect.w<8||CROP.rect.h<8) return null;
  const {x,y,w,h,lw}=CROP.rect;
  const bmp=await createImageBitmap(rec.blob);
  const sc=bmp.width/lw;
  const X=Math.round(x*sc), Y=Math.round(y*sc);
  const cv=document.createElement("canvas");
  cv.width=Math.max(1,Math.round(w*sc)); cv.height=Math.max(1,Math.round(h*sc));
  cv.getContext("2d").drawImage(bmp,X,Y,cv.width,cv.height,0,0,cv.width,cv.height);
  bmp.close();
  const blob=await new Promise(res=>cv.toBlob(res,"image/jpeg",0.85));
  return blob?{blob,X,Y}:null;
}
async function cropOk(id){
  const r=await cropBlob(id);
  if(!r) return; /* no frame yet — nothing to do */
  const rec=S.inbox.find(x=>x.id===id);
  CROP=null; S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null; S.pendingShot=id;
  S.mode="add"; render();
}

/* ---------- offline translation (T2): Firefox Translations zh→en in WASM ----------
   Engine + model live in vendor/nmt (model arrives via the fetch-nmt-model
   GitHub Action, ~38 MB gzipped). Opt-in: S.settings.nmt. Loaded lazily in a
   worker; the gz files are runtime-cached by the SW like the OCR bundle. */
const NMT={worker:null, ready:null, info:undefined, pending:{}, seq:0};
const NMT_DIR="./vendor/nmt/";
async function nmtInfo(){
  if(NMT.info!==undefined) return NMT.info;
  /* manifest lives in the shell (./nmt-model.json, placeholder until the action fills it) so no 404 and no stale vendor cache */
  try{ const r=await fetch("./nmt-model.json"); const j=r.ok?await r.json():null; NMT.info=j&&j.files?j:null; }catch(e){ NMT.info=null; }
  return NMT.info;
}
function nmtOn(){ return S.settings.nmt===true; }
function nmtCall(name,args,transfer){
  return new Promise((res,rej)=>{
    const id=++NMT.seq; NMT.pending[id]={res,rej};
    NMT.worker.postMessage({id,name,args},transfer||[]);
  });
}
async function fetchGz(url){
  const r=await fetch(url); if(!r.ok) throw new Error("download failed ("+r.status+")");
  return new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}
function nmtLoad(status){
  if(NMT.ready) return NMT.ready;
  const say=t=>{ if(status) status(t); };
  const t0=performance.now();
  NMT.ready=(async()=>{
    const info=await nmtInfo(); if(!info) throw new Error("translation model not in this build");
    say("starting translation engine …");
    NMT.worker=new Worker(NMT_DIR+"translator-worker.js");
    NMT.worker.onmessage=e=>{ const {id,result,error}=e.data; const p=NMT.pending[id]; if(!p) return; delete NMT.pending[id];
      if(error) p.rej(Object.assign(new Error(error.message||"worker error"),{name:error.name})); else p.res(result); };
    NMT.worker.onerror=e=>{ const err=new Error(e.message||"translation worker failed"); Object.values(NMT.pending).forEach(p=>p.rej(err)); NMT.pending={}; };
    await nmtCall("initialize",[{cacheSize:0}]);
    say("loading model ("+Math.round((info.downloadBytes||0)/1e6)+" MB, downloaded once) …");
    const f=info.files, vocabNames=f.vocab?[f.vocab]:[f.srcvocab,f.trgvocab]; /* one shared vocab or source + target */
    const bufs=await Promise.all([f.model,f.lex,...vocabNames].map(n=>fetchGz(NMT_DIR+n)));
    const [model,shortlist,...vocabs]=bufs;
    await nmtCall("loadTranslationModel",[{from:"zh",to:"en"},{model,shortlist,vocabs}],bufs);
    NMT.loadMs=performance.now()-t0; /* shown in More — the field test on the Xiaomi */
    return true;
  })().catch(err=>{ NMT.ready=null; if(NMT.worker){ NMT.worker.terminate(); NMT.worker=null; } NMT.pending={}; throw err; });
  return NMT.ready;
}
async function nmtTranslate(texts,status){
  if(!texts.length) return [];
  await nmtLoad(status);
  const t1=performance.now();
  const r=await nmtCall("translate",[{models:[{from:"zh",to:"en"}],texts:texts.map(t=>({text:t,html:false}))}]);
  NMT.lastMs=performance.now()-t1;
  return r.map(x=>(x.target.text||"").trim());
}
/* was the model already fetched into the SW cache? (cheap check for the More tab) */
async function nmtCached(){
  try{ const info=await nmtInfo(); if(!info||!window.caches) return false;
    const hit=await caches.match(new URL(NMT_DIR+info.files.model,location.href).href); return !!hit; }catch(e){ return false; }
}
/* meaning of a sign card's lines: phrasebook line → offline translation → word gloss.
   Returns {m, src, pending}; pending = some line still has only a gloss. */
async function signMeaning(lines,status){
  if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js");
  await Promise.all([loadDict().catch(()=>{}), loadSigns().catch(()=>{})]);
  const res=lines.map(lineMeaning);
  const todo=res.map((r,i)=>r.full?null:i).filter(i=>i!==null);
  let out=res.map(r=>r.en), src=todo.length?"gloss":"phrasebook", pending=todo.length>0;
  if(todo.length && nmtOn() && await nmtInfo()){
    try{
      const tr=await nmtTranslate(todo.map(i=>lines[i]),status);
      todo.forEach((i,k)=>{ if(tr[k]) out[i]=tr[k]; });
      if(tr.some(Boolean)){ src="nmt"; pending=tr.some(t=>!t); }
    }catch(err){ console.warn("offline translation failed:",err); }
  }
  return {m:out.filter(Boolean).join(" / "), src, pending, res};
}
/* complete cards whose meaning is still word-by-word (mt.pending) with the offline model */
async function translatePending(status){
  const list=S.custom.filter(d=>d.kind==="sign"&&d.mt&&d.mt.pending);
  let n=0;
  for(const d of list){
    const r=await signMeaning(d.c.split("\n"),status);
    if(r.src==="nmt"){ d.m=r.m; d.mt={...d.mt,src:"nmt",pending:r.pending,verified:false}; try{ await idbPut("custom",d); }catch(e){} n++; }
  }
  return n;
}
let SIGNS=null, _signsLoading=null;
function loadSigns(){
  if(SIGNS) return Promise.resolve(SIGNS);
  if(!_signsLoading){
    _signsLoading=fetch("./signs.json")
      .then(r=>{ if(!r.ok) throw new Error("phrasebook not available"); return r.json(); })
      .then(list=>{
        SIGNS=list.map(e=>Array.isArray(e)?{zh:e[0],py:e[1],en:e[2],cat:e[3]||""}:e)
          .filter(e=>e.zh&&e.en).sort((a,b)=>b.zh.length-a.zh.length); /* longest first */
        return SIGNS;
      })
      .catch(err=>{ _signsLoading=null; throw err; });
  }
  return _signsLoading;
}
const SIGN_PUNCT=/[、，。：:,.!！?？;；·]/;
/* first dictionary sense that is not a surname / bound-form / variant note */
function bestSense(w){
  const senses=((DICT&&DICT.get(w))||"").split(";").map(x=>x.trim()).filter(Boolean);
  return senses.find(x=>!/^(surname |\(bound form\)|old variant|variant of|\(archaic\))/i.test(x))||senses[0]||"";
}
/* meaning of one transcript line: longest phrasebook phrases first, dictionary
   words for the rest; punctuation kept as its own token for wrapping */
function lineMeaning(line){
  const raw=line.replace(/\s+/g,"");
  const parts=[]; let k=0;
  while(k<raw.length){
    const ch=raw[k];
    if(SIGN_PUNCT.test(ch)){ parts.push({w:ch,p:"",m:"",punct:true}); k++; continue; }
    const num=raw.slice(k).match(/^[0-9]+/); if(num){ parts.push({w:num[0],p:num[0],m:num[0],num:true}); k+=num[0].length; continue; } /* a number reads as itself */
    const hit=(SIGNS||[]).find(e=>raw.startsWith(e.zh,k));
    if(hit){ parts.push({w:hit.zh,p:hit.py,m:hit.en,ph:true}); k+=hit.zh.length; continue; }
    const rest=raw.slice(k).split(SIGN_PUNCT)[0]; let len=Math.min(8,rest.length)||1;
    while(len>1 && !(DICT&&DICT.has(rest.slice(0,len)))) len--;
    const w=rest.slice(0,len)||ch;
    parts.push({w,p:pySpaced(w),m:cleanSense(bestSense(w)),ph:false}); /* no dictionary clutter in the composed meaning (v134) */
    k+=w.length;
  }
  const words=parts.filter(x=>!x.punct);
  const full=words.length>0 && words.every(x=>x.ph||x.num);
  /* fully phrasebook-matched line reads as English; a composed line shows word + gloss for every part */
  const en=full?words.map(x=>x.m).join(" · "):words.map(x=>x.num?x.w:x.w+" "+(x.m||"?")).join(" · ");
  const py=pySpaced(words.map(x=>x.w).join(""));
  return {en,full,gloss:words,segs:parts.map(x=>x.w),py};
}
const SIGN={}; /* id -> {lines:[...], res, full, mean} while the transcript editor is open */
/* ---------- deskew: a tilted sign is read badly, so the framed area is straightened first ----------
   Skew estimate by projection profile: text pixels (far from the median brightness, so dark-on-light
   and light-on-dark both count) are projected onto the y axis for candidate angles; horizontal lines
   of text give the sharpest profile (highest variance). Runs on a ≤ 360 px copy — a few ms. */
function estimateSkew(imgData,W,H){
  const d=imgData.data, lum=new Float32Array(W*H);
  for(let i=0;i<W*H;i++) lum[i]=(d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114);
  const sorted=Float32Array.from(lum).sort(); const med=sorted[sorted.length>>1];
  const xs=[],ys=[];
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ if(Math.abs(lum[y*W+x]-med)>60){ xs.push(x); ys.push(y); } }
  if(xs.length<200) return 0;
  const step=Math.max(1,Math.floor(xs.length/20000)); /* sample for speed */
  /* how peaked the row profile is when the text pixels are rotated by a degrees: text lines give sharp peaks */
  const profileVar=a=>{
    const r=a*Math.PI/180, c=Math.cos(r), sn=Math.sin(r), hist=new Float64Array(H*2+W*2), off=W;
    let n=0,sum=0;
    for(let i=0;i<xs.length;i+=step){ const yy=Math.round(ys[i]*c-xs[i]*sn)+off; if(yy>=0&&yy<hist.length){ hist[yy]++; n++; } }
    for(let i=0;i<hist.length;i++) sum+=hist[i]*hist[i];
    return sum/n;
  };
  let best=0,bestV=-1;
  for(let a=-20;a<=20;a+=1){ const v=profileVar(a); if(v>bestV){ bestV=v; best=a; } }
  /* refine to half degrees around the best */
  let fine=best,fineV=bestV;
  for(const a of [best-0.5,best+0.5]){ const v=profileVar(a); if(v>fineV){ fineV=v; fine=a; } }
  return fine;
}
/* the reader gets lossless images (PNG); the card keeps a JPEG so a crop stays ~100 KB in IndexedDB */
async function jpegOf(blob,q){
  if(!blob||blob.type!=="image/png") return blob;
  try{ const bmp=await createImageBitmap(blob); const cv=document.createElement("canvas"); cv.width=bmp.width; cv.height=bmp.height; cv.getContext("2d",{alpha:false}).drawImage(bmp,0,0); bmp.close();
    return (await new Promise(res=>cv.toBlob(res,"image/jpeg",q||0.85)))||blob; }catch(e){ return blob; }
}
/* What the reader sees must be a JPEG: this Tesseract build misreads canvas PNGs and WebPs (measured on the tilted
   composite: JPEG 0.95 → 本区域禁止违规 99 %, the same pixels as PNG → one character). Intermediate crops stay PNG so the
   only lossy step is the last one — two JPEG generations in a row lost the line too. */
const READ_JPEG=0.95, WEAK_READ=180; /* a reading below this score gets the whole-frame copies, both readers (v95: garbage at 58 on the Yakult logo; v96: 180 like the second look — H: time is no issue) */
async function deskewBlob(blob){
  try{
    const bmp=await createImageBitmap(blob);
    const sc=Math.min(1,360/Math.max(bmp.width,bmp.height));
    const w=Math.max(1,Math.round(bmp.width*sc)), h=Math.max(1,Math.round(bmp.height*sc));
    const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
    const ctx=cv.getContext("2d",{willReadFrequently:true}); ctx.drawImage(bmp,0,0,w,h);
    const angle=estimateSkew(ctx.getImageData(0,0,w,h),w,h);
    if(Math.abs(angle)<1.5){ bmp.close(); return {blob:await jpegOf(blob,READ_JPEG),angle:0}; }
    /* rotate the full crop back to horizontal; the corners are filled with the edge colour */
    const r=-angle*Math.PI/180, W=bmp.width, H=bmp.height;
    const nw=Math.round(Math.abs(W*Math.cos(r))+Math.abs(H*Math.sin(r))), nh=Math.round(Math.abs(W*Math.sin(r))+Math.abs(H*Math.cos(r)));
    const out=document.createElement("canvas"); out.width=nw; out.height=nh;
    const o=out.getContext("2d",{alpha:false}); /* opaque: the reader misreads a PNG that carries an alpha channel */
    /* the corners take the crop's dominant colour — the most frequent colour bin, then the mean of its pixels (v138:
       one edge pixel once was the dark logo frame on H's 美团 crop, the dark corners became the "ink" of the
       chromaticity copy and the black characters fell on its background side; a channel-wise median is no real colour
       and a border colour is the frame line again — measured on 美团 and 业主直租) */
    const px=ctx.getImageData(0,0,w,h).data, bins=new Map(); let top=null;
    for(let i=0;i<w*h*4;i+=4){ const key=(px[i]>>4)<<8|(px[i+1]>>4)<<4|(px[i+2]>>4); const b=bins.get(key)||{n:0,r:0,g:0,b:0}; b.n++; b.r+=px[i]; b.g+=px[i+1]; b.b+=px[i+2]; bins.set(key,b); if(!top||b.n>top.n) top=b; }
    o.fillStyle=`rgb(${Math.round(top.r/top.n)},${Math.round(top.g/top.n)},${Math.round(top.b/top.n)})`; o.fillRect(0,0,nw,nh);
    o.translate(nw/2,nh/2); o.rotate(r); o.drawImage(bmp,-W/2,-H/2); bmp.close();
    const rot=await new Promise(res=>out.toBlob(res,"image/jpeg",READ_JPEG));
    return {blob:rot||blob,angle};
  }catch(e){ return {blob,angle:0}; }
}
/* Where a text row really starts and ends: within the row's vertical band, a column is "ink" when enough of its pixels
   differ from the band's median colour. From the reader's span, walk outward over the columns until a gap wider than
   1.3 text heights or the edge; the last ink column is the end. Characters the reader missed are inside that span. */
function textRowExtent(bmp,bx0,bx1,y0,y1,H){
  const W=bmp.width, h=Math.max(1,Math.round(y1-y0));
  const cv=document.createElement("canvas"); cv.width=W; cv.height=h;
  const ctx=cv.getContext("2d",{alpha:false,willReadFrequently:true}); ctx.drawImage(bmp,0,y0,W,h,0,0,W,h);
  const d=ctx.getImageData(0,0,W,h).data;
  const ch=[[],[],[]]; for(let i=0;i<d.length;i+=4*13){ ch[0].push(d[i]); ch[1].push(d[i+1]); ch[2].push(d[i+2]); }
  const m=[median(ch[0]),median(ch[1]),median(ch[2])];
  const step=Math.max(1,Math.floor(h/40)), need=Math.max(2,Math.round(h/step*0.06)); /* ~6 % of the sampled rows */
  const ink=x=>{ let n=0; for(let y=0;y<h;y+=step){ const i=(y*W+x)*4; if(Math.abs(d[i]-m[0])+Math.abs(d[i+1]-m[1])+Math.abs(d[i+2]-m[2])>150) n++; } return n>=need; };
  const gap=Math.round(1.3*H); /* wider than any gap inside a line, punctuation included (、 to the next character measured at 0.9 H) */
  let x1=Math.min(W-1,Math.round(bx1)), last=x1, x=x1;
  while(x<W){ if(ink(x)) last=x; else if(x-last>gap) break; x++; }
  let x0=Math.max(0,Math.round(bx0)), first=x0; x=x0;
  while(x>=0){ if(ink(x)) first=x; else if(first-x>gap) break; x--; }
  return {x0:first,x1:last+1};
}
/* text fields that grow with their content instead of cutting it off (H: pinyin and meaning on two lines) */
function autoGrow(el){ el.style.height="auto"; el.style.height=el.scrollHeight+"px"; }
function wireGrow(root){ root.querySelectorAll("textarea.grow").forEach(el=>{ autoGrow(el); el.addEventListener("input",()=>autoGrow(el)); }); }
/* ---------- reading helpers (shared by the passes of cropSign) ---------- */
const median=a=>{ const t=a.slice().sort((p,q)=>p-q); return t[t.length>>1]; };
/* status text of a photo's reading: kept in state and re-queried, so a re-render cannot swallow it */
/* progress texts show as one line with a moving bar — the steps themselves (straightening, second look, percentages)
   are of no use to the user (H); only failures show as text */
const READ_FAIL=/^(No Chinese|OCR failed|Reading failed|Frame too)/;
/* a step that lasts longer than READ_STUCK shows its own text under the bar — a stuck step is a failure, not a step (v93) */
const READ_STUCK=20000, READ_AT={}, READ_RUN={}; /* READ_RUN[id] = the number of the latest reading of a photo: an older one still running is superseded and abandons (v116 — a corner drag during a reading started a second one, both finished with the same text and the AI was asked twice) */
const readingHTML=(t,id)=>READ_FAIL.test(t)?`<span class="badge">${esc(t)}</span>`
  :`<div class="reading"><div class="bar"><i></i></div><span class="badge">Reading the text …${id&&READ_AT[id]&&Date.now()-READ_AT[id]>=READ_STUCK?` still at: ${esc(t)}`:""}</span></div>`;
const readingStatus=(id,run)=>t=>{ if(run&&READ_RUN[id]!==run) return; READING[id]=t; READ_AT[id]=Date.now(); READLOG.push({t:Date.now(),text:t}); while(READLOG.length>40) READLOG.shift();
  const b=$("#ocr-"+id); if(b) b.innerHTML=readingHTML(t,id);
  setTimeout(()=>{ if(READING[id]!==t) return; const b2=$("#ocr-"+id); if(b2) b2.innerHTML=readingHTML(t,id); },READ_STUCK+50); };
/* a canvas with the bitmap drawn at a scale (opaque — the reader is handed JPEGs) */
function scaledCanvas(bmp,scale,readable){
  const cv=document.createElement("canvas"); cv.width=Math.max(1,Math.round(bmp.width*scale)); cv.height=Math.max(1,Math.round(bmp.height*scale));
  cv.getContext("2d",{alpha:false,willReadFrequently:!!readable}).drawImage(bmp,0,0,cv.width,cv.height); return cv;
}
const toJpeg=(bmp,scale)=>new Promise(res=>scaledCanvas(bmp,scale).toBlob(res,"image/jpeg",READ_JPEG));
/* Black-on-white copy (Otsu threshold on the grey image, polarity so that the majority is white): the reader's own
   thresholding fails on light text on a strong colour — white on red behind glass read as nothing at any size,
   the binarised copy read 业主直租 at 93 %. */
function otsuThr(hist,n){
  let sum=0; for(let g=0;g<256;g++) sum+=g*hist[g];
  let sumB=0, wB=0, best=0, thr=128;
  for(let g=0;g<256;g++){ wB+=hist[g]; if(!wB) continue; const wF=n-wB; if(!wF) break; sumB+=g*hist[g]; const mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF); if(v>best){ best=v; thr=g; } }
  return thr;
}
function toBW(bmp,scale){
  const cv=scaledCanvas(bmp,scale,true), ctx=cv.getContext("2d");
  const im=ctx.getImageData(0,0,cv.width,cv.height), d=im.data, hist=new Array(256).fill(0), n=d.length/4;
  for(let i=0;i<d.length;i+=4){ const g=(d[i]*299+d[i+1]*587+d[i+2]*114)/1000|0; d[i]=g; hist[g]++; }
  const thr=otsuThr(hist,n);
  let dark=0; for(let i=0;i<d.length;i+=4) if(d[i]<=thr) dark++;
  const textDark=dark<n/2; /* the minority is the text */
  for(let i=0;i<d.length;i+=4){ const v=(d[i]<=thr)===textDark?0:255; d[i]=d[i+1]=d[i+2]=v; }
  ctx.putImageData(im,0,0); return new Promise(res=>cv.toBlob(res,"image/jpeg",READ_JPEG));
}
/* A copy that ignores shading (H, v95: red print on a curved cream bottle read as nothing — the bottle's shadow defeats
   every brightness threshold, the print's colour does not change with it): each pixel's chromaticity r/(r+g+b), g/(r+g+b),
   its distance from the median chromaticity, an Otsu threshold on that, the minority is the ink. Measured on the Yakult
   line: grey copy nothing at any size, this copy 菌型乳酸菌乳饮品 at 96 %; on 业主直租 it reads too; on black-on-white
   text the chromaticity is flat and the copy is noise — it only ever competes with the other readings. */
function chromaCanvas(bmp,scale){
  const cv=scaledCanvas(bmp,scale,true), ctx=cv.getContext("2d");
  const im=ctx.getImageData(0,0,cv.width,cv.height), d=im.data, n=d.length/4, rn=new Float32Array(n), gn=new Float32Array(n), rs=[], gs=[];
  for(let i=0,j=0;i<d.length;i+=4,j++){ const t=d[i]+d[i+1]+d[i+2]+1; rn[j]=d[i]/t; gn[j]=d[i+1]/t; if(j%7===0){ rs.push(rn[j]); gs.push(gn[j]); } }
  const mr=median(rs), mg=median(gs), v=new Uint8Array(n), hist=new Array(256).fill(0);
  for(let j=0;j<n;j++){ const x=Math.min(255,Math.round((Math.abs(rn[j]-mr)+Math.abs(gn[j]-mg))*600)); v[j]=x; hist[x]++; }
  const thr=otsuThr(hist,n); let hi=0; for(let j=0;j<n;j++) if(v[j]>thr) hi++;
  const inkHigh=hi<n/2; /* the minority is the ink */
  for(let i=0,j=0;i<d.length;i+=4,j++){ d[i]=d[i+1]=d[i+2]=((v[j]>thr)===inkHigh)?0:255; }
  ctx.putImageData(im,0,0); return cv;
}
const toChroma=(bmp,scale)=>new Promise(res=>chromaCanvas(bmp,scale).toBlob(res,"image/jpeg",READ_JPEG));
/* the height of one text line in a frame, from the ink of a small chromaticity copy: the longest run of rows holding
   ink (a loose frame once made the reader guess the size from the frame height and read a 40 % line at 19 px); 0 when
   nothing stands out */
function inkHeight(bmp){
  const k=Math.min(1,320/bmp.height), cv=chromaCanvas(bmp,k), W=cv.width, d=cv.getContext("2d").getImageData(0,0,W,cv.height).data;
  let run=0, best=0;
  for(let y=1;y<cv.height-1;y++){ let ink=0, edges=0, prev=false; for(let x=0;x<W;x++){ const on=d[(y*W+x)*4]<128; if(on) ink++; if(on!==prev){ edges++; prev=on; } }
    /* a text row: some ink, not solid, and many stroke edges — a stripe, a ribbon or the oval of a logo is solid or has
       only a few edges, and once made the ink height the frame height (v100: the real text then looked like fragments) */
    const textRow=ink/W>0.03&&ink/W<0.7&&edges>=6; /* four edges were tried in v138 for big characters (拉, 美团) and reverted: 业主直租 in its light-on-red version lost its winning small-scale pass when the ink height fell from 308 to 140 */
    /* a dense row inside a text band still counts (v144, H's bicycle sticker: bold blue characters with a white outline
       fill 70–83 % of the middle rows of a tight frame, the band broke into slivers of 21 px on 130 px characters, every
       fallback size clamped to the same scale and the second look never came): ink up to 92 % with at least eight
       stroke edges — a stripe or a ribbon is solid with two edges — extends a run that a text row began; trailing dense
       rows do not count, so the run still ends at the last text row */
    const denseRow=!textRow&&ink/W>=0.7&&ink/W<0.92&&edges>=8;
    if(textRow){ run++; if(run>best) best=run; } else if(denseRow&&run>0){ run++; } else run=0; }
  return best>=4?best/k:0;
}
/* one reading pass: the lines with their symbols (text, confidence, box) */
async function readPass(w,blob,status){
  await w.setParameters({tessedit_pageseg_mode:"6"});
  _ocrLog=p=>status("recognizing … "+p+"%");
  const {data}=await w.recognize(blob,{},{blocks:true,text:true}).finally(()=>{ _ocrLog=null; });
  const lines=[];
  eachLine(data,symbols=>{
    let syms=[];
    symbols.forEach(sy=>{
      /* characters, sign punctuation and digits (30分钟 — H: the number was missing from the translation); letters stay out */
      const keep=CJK.test(sy.text)||SIGN_PUNCT.test(sy.text)?sy.confidence>=35:/^[0-9]+$/.test(sy.text)&&sy.confidence>=70; /* a digit needs to be fairly sure — decoration reads as 1 */
      if(keep) syms.push({ch:sy.text,cf:sy.confidence,b:sy.bbox});
    });
    const edge=x=>/[、，。：:,.]/.test(x.ch);
    while(syms.length&&edge(syms[0])) syms.shift();
    while(syms.length&&edge(syms[syms.length-1])) syms.pop();
    /* a digit is kept only near the characters' height (0.4–1.6 × their median — the boxes' heights swing; a ribbon ring
       read as 1 was 2.1 × as tall, the 30 of 30分钟 measured 0.55–0.7 ×) */
    const cj=syms.filter(x=>CJK.test(x.ch)&&x.b);
    if(cj.length){ const H=median(cj.map(x=>x.b.y1-x.b.y0)); syms=syms.filter(x=>!/^[0-9]+$/.test(x.ch)||!x.b||(x.b.y1-x.b.y0>=0.4*H&&x.b.y1-x.b.y0<=1.6*H)); }
    const t=syms.map(x=>x.ch).join("");
    if(CJK.test(t)) lines.push({t,cf:syms.filter(x=>CJK.test(x.ch)).map(x=>x.cf),bx:syms.map(x=>x.b?{x0:x.b.x0,y0:x.b.y0,x1:x.b.x1,y1:x.b.y1}:null)});
  });
  /* lines of tiny "characters" beside a tall one are decoration or noise (v96: a soup of five such lines, 18 characters, once outscored the logo's three) */
  const hOf=l=>{ const bs=l.bx.filter(Boolean); return bs.length?median(bs.map(b=>b.y1-b.y0)):0; }, hmax=Math.max(0,...lines.map(hOf));
  return lines.filter(l=>hOf(l)>=0.45*hmax);
}
/* walk a Tesseract result line by line: cb(symbols, line) */
const eachLine=(data,cb)=>(data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>cb((l.words||[]).flatMap(w=>w.symbols||[]),l))));
const scaleBoxes=(ls,k)=>ls.map(l=>({...l,bx:l.bx.map(b=>b&&{x0:b.x0/k,y0:b.y0/k,x1:b.x1/k,y1:b.y1/k})}));
/* readings compete by confidence, a mild weight on length, and how much of the text forms dictionary words —
   garbage comes as many characters that are each plausible but form no words (加罗, 区和和, 二门花二人人) */
const meanCf=ls=>{ const cf=ls.flatMap(l=>l.cf); return cf.length?cf.reduce((a,c)=>a+c,0)/cf.length:0; };
function dictCover(ls){
  if(!DICT) return 0.5; const ch=[...ls.map(l=>l.t).join("")].filter(c=>CJK.test(c)); if(!ch.length) return 0;
  let i=0, cov=0;
  while(i<ch.length){ let hit=0; for(let len=Math.min(4,ch.length-i);len>=2;len--){ if(DICT.has(ch.slice(i,i+len).join(""))){ hit=len; break; } } if(hit){ cov+=hit; i+=hit; } else i++; }
  return cov/ch.length;
}
const boxHeight=lines=>{ const hs=lines.flatMap(l=>l.bx.filter(Boolean).map(b=>b.y1-b.y0)); return hs.length?median(hs):0; };
function readingScore(ls,Hink){
  const n=ls.flatMap(l=>l.cf).length; if(!n) return 0;
  /* one line whose characters are as tall as the frame's ink is the text itself, however short (v116: a single 推 on a
     door plate, read at 99 % by ten passes, scored 18 as a "fragment" and lost to a merged soup of eight garbage
     characters at 34 — the chromaticity copies of a white character on a black plate are noise) */
  const whole=ls.length===1&&Hink&&boxHeight(ls)>=0.75*Hink;
  const frag=whole?1:Math.min(1,(n/ls.length)/3); /* lines under three characters = fragments (v96: /4 punished a real three-character logo against four garbage characters) */
  const short=whole?0:ls.filter(l=>l.cf.length<=2).length/ls.length; /* v95: a soup of seven short lines (n = 15) once outscored the real three characters */
  const cf=meanCf(ls);
  /* confidence counts cubically: real text reads at 90–97 %, the reader's garbage at 79–86 %, and a linear weight let one more character outweigh that (v96) */
  return cf*Math.pow(cf/100,2)*Math.pow(n,0.35)*frag*(1-0.5*short)*(0.75+0.5*dictCover(ls));
}
/* Second look at a tight crop. A loose frame with stripes, ribbons or a second label fools the tilt estimate and the
   block reader (H: a Maotai label read as one false character from the ribbon). Where the first pass found text in a
   small part of the frame, or was unsure, that part is cut out, straightened on its own and read at several character
   heights, because the model's output swings with scale even on a clean crop (measured: the same image read perfectly
   at 0.7× and as garbage at 1×). Adds its readings to `passes`; returns the card image for the tightened area. */
/* readings whose boxes are far smaller than the frame's ink height are fragments of the decoration (v98); the gates use
   the effective score too (v100, H's granite sign: a soup of seventy fragments scored 183 raw, so neither the copies nor
   the traditional reader nor the whole-frame passes ever ran — five passes instead of forty) */
function sizeFitOf(lines,Hink){ if(!Hink) return 1; const h=boxHeight(lines); if(!h) return 1; const q=h/Hink; return q>=0.5?1:Math.pow(q/0.5,2); } /* from half the ink height down: decoration taller than the text (stripes, a ribbon) inflates the ink height by up to 2× */
const effScore=(lines,Hink)=>readingScore(lines,Hink)*sizeFitOf(lines,Hink);
async function secondLook(w,dk,passes,status,r,Hink){
  const first=passes[0].lines, boxes=first.flatMap(l=>l.bx).filter(Boolean);
  if(!boxes.length) return null;
  const bmp=await createImageBitmap(dk.blob);
  try{
    const Hb=median(boxes.map(b=>b.y1-b.y0));
    /* the boxes' height sets the sizes — unless it disagrees with the ink height of the frame by more than 2×: then the first
       pass read fragments, and the ink is the better guess (v100: garbage boxes of 15 px on a 150 px sign left only the native scale; a striped frame's ink height is up to 2× the text, so only a 3× disagreement counts) */
    const H=Hink&&(Hb<0.35*Hink||Hb>3*Hink)?Hink:Hb;
    /* the boxes' heights are right, their horizontal ends are not (they drift along the line and end early on the last
       character — H: 骑 cut in half), so the vertical band comes from the boxes plus half a height ... */
    const mX=H, mY=H/2, pad=Math.round(1.5*H);
    const y0=Math.max(0,Math.min(...boxes.map(b=>b.y0))-mY), y1=Math.min(bmp.height,Math.max(...boxes.map(b=>b.y1))+mY);
    /* ... and the line's ends from the image, not from the boxes: the first pass may have lost a character altogether
       (H: 首都铁骑 read as 次都铁, and the crop ended after 铁) */
    const ext=textRowExtent(bmp,Math.min(...boxes.map(b=>b.x0)),Math.max(...boxes.map(b=>b.x1)),y0,y1,H);
    const x0=Math.max(0,ext.x0-mX), x1=Math.min(bmp.width,ext.x1+mX);
    const frac=((x1-x0)*(y1-y0))/(bmp.width*bmp.height);
    if(!(x1-x0>=24 && y1-y0>=24)) return null; /* v96: always, not only on a loose frame or an unsure pass — H: time is no issue, and the copies read 脊 where the first pass had 疹 */
    status("found text, reading it closely …");
    /* the text area with 1.5 text heights of plain margin in the crop's median colour: the reader wants margins, real
       ones bring the clutter back, and a corner-sampled red ribbon once framed a white label in red */
    const cv=document.createElement("canvas"); cv.width=(x1-x0)+2*pad; cv.height=(y1-y0)+2*pad;
    const c2=cv.getContext("2d",{alpha:false,willReadFrequently:true});
    c2.drawImage(bmp,x0,y0,x1-x0,y1-y0,pad,pad,x1-x0,y1-y0);
    const d=c2.getImageData(pad,pad,x1-x0,y1-y0).data, ch=[[],[],[]]; for(let i=0;i<d.length;i+=4*7){ ch[0].push(d[i]); ch[1].push(d[i+1]); ch[2].push(d[i+2]); }
    c2.fillStyle=`rgb(${median(ch[0])},${median(ch[1])},${median(ch[2])})`;
    c2.fillRect(0,0,cv.width,pad); c2.fillRect(0,cv.height-pad,cv.width,pad); c2.fillRect(0,0,pad,cv.height); c2.fillRect(cv.width-pad,0,pad,cv.height);
    const tight=await new Promise(res=>cv.toBlob(res,"image/png")); /* lossless intermediate — deskewBlob hands the reader a JPEG */
    const dk2=await deskewBlob(tight), bmp2=await createImageBitmap(dk2.blob); r.tightBlob=dk2.blob; /* kept for diagnosis */
    const scales=[45/H,60/H,75/H,90/H,110/H].filter(k=>k<0.92); if(H<=200) scales.push(1); /* five character heights; native too while it is cheap (v96: 脊柱 fused into one glyph below 90 px) */
    const tightLines=[];
    const readTight=async(mode,tra)=>{ for(const k of scales){
      const src=mode==="bw"?await toBW(bmp2,k):mode==="chroma"?await toChroma(bmp2,k):k===1?dk2.blob:await toJpeg(bmp2,k);
      const lines=tra?await readPassTra(src,status):await readPass(w,src,status); if(!lines) return; const sc=k===1?lines:scaleBoxes(lines,k);
      passes.push({lines:sc,img:dk2.blob,angle:dk2.angle,tightened:true,scale:k,bw:mode==="bw",chroma:mode==="chroma",tra:!!tra}); tightLines.push(...sc); } };
    await readTight("colour"); await readTight("bw"); await readTight("chroma"); /* the copies always (v96) */
    /* still weak? the traditional reader on all three — it knows glyphs the simplified one can only approximate */
    if(Math.max(...passes.map(p=>effScore(p.lines,Hink)))<180){ for(const mode of ["colour","bw","chroma"]) await readTight(mode,true); }
    bmp2.close();
    /* Merge line by line: every reading tends to get some line right and lose another, so the lines of all tight
       passes are clustered by their vertical band and the most confident reading of each band is kept. */
    /* a line's band from the median centre and height of its boxes — the boxes' extremes are inflated (on a two-line
       sign single boxes spanned both lines), and min/max once folded the two lines into one cluster (H: the first line vanished) */
    const band=l=>{ const bs=l.bx.filter(Boolean); if(!bs.length) return null; const cy=median(bs.map(b=>(b.y0+b.y1)/2)), h=median(bs.map(b=>b.y1-b.y0)); return {y0:cy-h/2,y1:cy+h/2}; };
    const clusters=[];
    for(const l of tightLines){ const b=band(l); if(!b) continue;
      let c=clusters.find(c=>{ const ov=Math.min(c.y1,b.y1)-Math.max(c.y0,b.y0); return ov>0.5*Math.min(c.y1-c.y0,b.y1-b.y0); });
      if(!c){ clusters.push({y0:b.y0,y1:b.y1,best:l,n:1}); }
      else { c.n++; if(readingScore([l])>readingScore([c.best])){ c.best=l; c.y0=b.y0; c.y1=b.y1; } }
    }
    /* a band only one pass ever saw, read without confidence, is decoration (v95: the Yakult logo's oval became two garbage
       lines in the colour pass and the merge carried them along); a short low-confidence stray likewise */
    const hmax=Math.max(0,...clusters.map(c=>c.y1-c.y0)); /* a band of tiny "characters" beside big ones is an edge or a stroke of the decoration (the oval of the Yakult logo read as 和一一) */
    const merged=clusters.sort((a,b)=>a.y0-b.y0).filter(c=>(c.n>=2||meanCf([c.best])>=85)&&c.y1-c.y0>=0.45*hmax).map(c=>c.best).filter(l=>l.cf.length>2||meanCf([l])>=80);
    if(merged.length) passes.push({lines:merged,img:dk2.blob,angle:dk2.angle,tightened:true,scale:"merged"});
    /* the card image: the same area with a real margin of one text height all round — as a rectangle in the straightened
       crop's coordinates; cropSign cuts it from the crop as framed, unrotated (v145, H: no rotated images with filled
       corners on the card) */
    return {x0:Math.max(0,x0-H/2), y0:Math.max(0,y0-H/2), x1:Math.min(bmp.width,x1+H/2), y1:Math.min(bmp.height,y1+H/2)};
  } finally { bmp.close(); }
}
/* A rectangle of the straightened crop, cut from the crop as framed: the rectangle's corners are turned back by the
   straightening angle about the centre, their bounding box is cut (v145 — the rotated, corner-filled crop is for the
   reader only; H: "don't show the corrupt images rotated in the preview, I don't want to see that gray frame") */
async function cutUnrotated(orig,rect,angle){
  const bmp=await createImageBitmap(orig);
  try{
    const W=bmp.width, Hh=bmp.height, r=-angle*Math.PI/180;
    const nw=Math.abs(W*Math.cos(r))+Math.abs(Hh*Math.sin(r)), nh=Math.abs(W*Math.sin(r))+Math.abs(Hh*Math.cos(r));
    const pts=[[rect.x0,rect.y0],[rect.x1,rect.y0],[rect.x0,rect.y1],[rect.x1,rect.y1]].map(([x,y])=>{ const dx=x-nw/2, dy=y-nh/2; return [dx*Math.cos(-r)-dy*Math.sin(-r)+W/2, dx*Math.sin(-r)+dy*Math.cos(-r)+Hh/2]; });
    const x0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[0])))), x1=Math.min(W,Math.ceil(Math.max(...pts.map(p=>p[0]))));
    const y0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[1])))), y1=Math.min(Hh,Math.ceil(Math.max(...pts.map(p=>p[1]))));
    if(!(x1-x0>=8&&y1-y0>=8)) return null;
    const cc=document.createElement("canvas"); cc.width=x1-x0; cc.height=y1-y0;
    cc.getContext("2d",{alpha:false}).drawImage(bmp,x0,y0,cc.width,cc.height,0,0,cc.width,cc.height);
    return await new Promise(res=>cc.toBlob(res,"image/jpeg",READ_JPEG));
  }catch(e){ return null; } finally{ bmp.close(); }
}
async function cropSign(id){
  const run=READ_RUN[id]=(READ_RUN[id]||0)+1, stale=()=>READ_RUN[id]!==run; /* a newer reading of this photo has started: leave everything to it */
  const status=readingStatus(id,run);
  READLOG.length=0; LAST_READ.passes=null; status("cutting out the frame …");
  try{
    const r=await cropBlob(id);
    if(stale()) return;
    if(!r){ delete READING[id]; renderShots(); return; } /* no frame yet — nothing to do */
    const rec=S.inbox.find(x=>x.id===id);
    S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null;
    delete SIGN[id]; delete QSNOTE[id]; /* the frame stays visible while reading */
    renderShots();
    const box=$("#ocr-"+id); if(!box) return;
    status("loading the reader …");
    const w=await ocrWorker(status);
    await loadSigns().catch(()=>{}); /* phrasebook optional — falls back to word gloss */
    status("reading the text …");
    let dk=await deskewBlob(r.blob); if(stale()) return; if(dk.angle) status(`straightened by ${Math.round(dk.angle)}°, reading the text …`); /* the card keeps the crop as framed (v145) */
    /* the text height of the frame from its ink (v97): readings whose boxes are far smaller are fragments of the decoration
       — H's phone read the Yakult logo as a four-line soup of 17 stroke-sized "characters" and the count outweighed
       ten passes agreeing on a three-character reading */
    const Hink=await (async()=>{ const b=await createImageBitmap(dk.blob); try{ r.frameH=b.height; return inkHeight(b); } finally{ b.close(); } })(); r.ink=Math.round(Hink);
    const passes=[{lines:await readPass(w,dk.blob,status),img:dk.blob,angle:dk.angle,tightened:false}];
    if(stale()) return;
    const cardRect=await secondLook(w,dk,passes,status,r,Hink);
    if(stale()) return;
    if(Math.max(0,...passes.map(p=>effScore(p.lines,Hink)))<WEAK_READ){ /* weak or nothing: the whole frame as black-and-white and chromaticity copies, sizes from the ink */
      status("trying a black-and-white copy …");
      const bmp=await createImageBitmap(dk.blob), H=Hink||bmp.height/1.6;
      for(const k of [...new Set([45,65,90].map(t=>Math.min(1.5,t/H).toFixed(2)))].map(Number)){ /* distinct scales only (v144: with a tiny ink height all three clamped to 1.5, and one pass counted three times in the agreement bonus and the traditional vote) */
        for(const mode of ["bw","chroma"]){ const src=mode==="bw"?await toBW(bmp,k):await toChroma(bmp,k);
        for(const tra of [false,true]){ const lines=tra?await readPassTra(src,status):await readPass(w,src,status); if(!lines) continue;
          passes.push({lines:scaleBoxes(lines,k),img:dk.blob,angle:dk.angle,tightened:false,scale:k,bw:mode==="bw",chroma:mode==="chroma",tra}); } } }
      bmp.close();
      if(stale()) return;
    }
    /* the frame can hold only so many lines of its own text height (v137, H's bicycle sticker 减震单车: a whole-frame
       pass read the sticker's wave pattern as a second line 一一八位, the count doubled and the soup beat four passes
       that agreed on 减震): a pass with more lines than fit is penalised quadratically — its text stays as read (cutting
       the extra lines instead once removed a soup's fragment penalty and let a three-character wave line win) */
    const maxLines=Hink?Math.max(1,Math.floor(r.frameH/(0.9*Hink))):99; r.maxLines=maxLines;
    const lineFit=p=>p.lines.length>maxLines?Math.pow(maxLines/p.lines.length,2):1;
    /* agreement counts: a text several passes produced beats a single pass's near-equal score (v96: 业主直租 ×3 lost a tie to 业主直祖 ×1) */
    const textOf=p=>p.lines.map(x=>x.t).join("\n"), agree=new Map(); passes.forEach(p=>{ const t=textOf(p); if(t) agree.set(t,(agree.get(t)||0)+1); });
    const hOfPass=p=>boxHeight(p.lines);
    const sizeFit=p=>sizeFitOf(p.lines,Hink);
    const score=p=>readingScore(p.lines,Hink)*Math.min(1.5,1+0.1*((agree.get(textOf(p))||1)-1))*sizeFit(p)*lineFit(p);
    passes.sort((a,b)=>score(b)-score(a));
    r.passes=passes.map(p=>({s:Math.round(score(p)),cf:Math.round(meanCf(p.lines)),cov:+dictCover(p.lines).toFixed(2),t:p.lines.map(l=>l.t).join("|"),k:typeof p.scale==="string"?p.scale:+(p.scale||1).toFixed(2),h:Hink?+(hOfPass(p)/Hink).toFixed(2):null,tight:p.tightened,bw:!!p.bw,ch:!!p.chroma,tra:!!p.tra,...(lineFit(p)<1?{over:p.lines.length-maxLines}:{})}));
    LAST_READ.passes=r.passes;
    const best=passes[0], lines=best.lines;
    if(best.tightened&&cardRect){ const cut=await cutUnrotated(r.blob,cardRect,dk.angle||0); if(cut) S.pendingImg=cut; } /* the text area with its margin, from the crop as framed */
    if(!lines.length){ status("No Chinese characters recognized — frame the characters tightly and try again."); return; }
    /* img = the (straightened, maybe tightened) crop the text was read from, boxes = where each character sits in it: the picker shows the original */
    /* the other readings (distinct texts, best first): the AI sees them all (the truth is often a mix, or a name they circle
       around — 养兴多 / 义乐多 / 和准浴多 → 养乐多), the picker offers their characters at the same position */
    let bestT=lines.map(x=>x.t).join("\n"), alts=[];

    /* Dictionary consensus (v99, from H's phone: the Yakult logo's passes gave 养浴多, 次乐多, 开乐多, 养举多, 养座多 —
       each one character away from 养乐多, an entry of the dictionary, and the AI still refused): when the readings of a
       single line circle around one dictionary word of the same length, that word is the reading and the others are
       its alternatives. Only when the best reading is no dictionary word itself, and only with two or more readings
       pointing the same way. */
    if(lines.length===1&&DICT){
      const n=[...bestT].length, texts=[...new Set(passes.map(textOf).filter(t=>t&&!t.includes("\n")&&[...t].length===n))]; /* the same length as the best: a correction, not a replacement (v100: 业主直租 once became 下人, a two-character word that garbage fragments circled) */
      const fix=dictConsensus(texts);
      if(fix&&fix.word!==bestT&&!DICT.has(bestT)&&(fix.support.includes(bestT)||fix.support.length>=3)){
        alts.push(bestT); lines[0]={...lines[0],t:fix.word}; bestT=fix.word; r.consensus={word:fix.word,from:fix.support};
      }
    }
    for(const p of passes){ const t=textOf(p); if(t&&t!==bestT&&!alts.includes(t)) alts.push(t); if(alts.length>=5) break; }
    /* always among them: the traditional reader's best (it knows glyphs the other one lacks) and the best reading of another
       length (two characters fused into one, or one lost — 专业冰矫正 beside 专业脊柱矫正 — is what the AI needs to see) */
    const glyphsOf=t=>[...t].filter(c=>CJK.test(c)).length, nBest=glyphsOf(bestT);
    for(const pick of [passes.find(p=>p.lines.some(l=>l.tra)&&textOf(p)!==bestT), passes.find(p=>textOf(p)&&glyphsOf(textOf(p))!==nBest&&readingScore(p.lines,Hink)>=0.6*readingScore(lines,Hink))]){
      if(pick&&!alts.includes(textOf(pick))){ if(alts.length>=6) alts.pop(); alts.push(textOf(pick)); } }
    const tradPhoto=s2t(bestT)!==bestT&&tradPhotoOf(lines.map(x=>x.t),passes,score); r.trad=tradPhoto; /* a text without a traditional form (推) has nothing to vote on */
    SIGN[id]={lines:lines.map(x=>x.t), orig:lines.map(x=>x.t), conf:lines.map(x=>x.cf), boxes:lines.map(x=>x.bx), img:best.img, angle:best.angle||0, tightened:best.tightened, region:r, alts, trad:tradPhoto, tradText:tradPhoto?s2t(bestT):""};
    delete READING[id]; renderShots();
    if(aiAutoOn()) signAskAI(id); /* every reading is checked without a tap */
  }catch(err){ if(stale()) return; status("OCR failed: "+(err&&err.message||err)); logErr("read",err&&(err.stack||err.message)||err); }
}
/* ---------- fixing one misread character: tap it, pick a replacement ----------
   Candidates come from the dictionary (words that fit the neighbouring characters), from the AI
   (asked for that position); a character can also be removed. */
let CHARFREQ=null;
function charCandidates(line,i,insert){ /* insert: candidates for a new character before index i (i = length: at the end) */
  const chars=[...line]; if(insert) chars.splice(i,0,"\u3007"); /* a placeholder where the new character goes */
  if(!DICT||(!insert&&!CJK.test(chars[i]||""))) return [];
  if(!CHARFREQ){ /* how many dictionary words a character appears in: a crude frequency proxy for ranking */
    CHARFREQ=new Map();
    for(const key of DICT.keys()) for(const ch of new Set(key)) CHARFREQ.set(ch,(CHARFREQ.get(ch)||0)+1);
  }
  const out=new Map();
  for(let len=4;len>=2;len--){
    for(let start=Math.max(0,i-len+1);start<=i&&start+len<=chars.length;start++){
      const pre=chars.slice(start,i).join(""), post=chars.slice(i+1,start+len).join("");
      if(!CJK.test(pre+post) && (pre+post).length) continue;
      /* scan the dictionary keys of this length that match around the position */
      for(const key of DICT.keys()){
        if(key.length!==len||!key.startsWith(pre)||!key.endsWith(post)||key.length!==pre.length+1+post.length) continue;
        const cand=key[pre.length]; if(cand===chars[i]||!CJK.test(cand)) continue;
        /* longer context first, then the more common character */
        const score=len*100000+(CHARFREQ.get(cand)||0);
        if((out.get(cand)||0)<score) out.set(cand,score);
      }
    }
  }
  return [...out.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]).slice(0,8);
}
async function aiCharAlternatives(line,i,insert){
  const key=S.settings.aiKey; if(!key) throw new Error("no API key");
  const pv=aiProvider(), model=aiModel(), chars=[...line];
  const sys="You correct OCR of Chinese signs, menus and packaging. Answer with a JSON array of single Chinese characters only, most likely first, no prose.";
  const user=insert
    ?`OCR read this line: "${line}". One character is missing ${i===0?"at the start":i>=chars.length?"at the end":`between "${chars[i-1]}" and "${chars[i]}"`}. Give up to 4 likely characters for that gap, judging from the context.`
    :`OCR read this line: "${line}". Character ${i+1} ("${chars[i]}") is probably misread. Give up to 4 likely correct characters for that position, judging from the context.`;
  let r;
  if(pv==="claude") r=await fetch(aiBase(),{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model,max_tokens:100,system:sys,messages:[{role:"user",content:user}]})});
  else r=await fetch(aiBase()+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+key},body:JSON.stringify({model,max_tokens:100,temperature:0,messages:[{role:"system",content:sys},{role:"user",content:user}]})});
  if(!r.ok) throw new Error("API error "+r.status);
  const data=await r.json();
  const raw=pv==="claude"?(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join(""):String(((data.choices||[])[0]||{}).message?.content||"");
  let arr=[]; try{ arr=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,"")); }catch(e){ arr=[...raw].filter(ch=>CJK.test(ch)); }
  return [...new Set(arr.map(x=>String(x).trim()).filter(x=>[...x].length===1&&CJK.test(x)&&(insert||x!==chars[i])))].slice(0,4);
}
/* what the other readings saw at this position (v96): only readings with the same number of characters in that line */
function altCharsAt(sg,k,i){
  const line=sg.lines[k], n=[...line].length, out=[];
  for(const t of sg.alts||[]){ const l=t.split("\n")[k]; if(!l) continue; const cs=[...l]; if(cs.length!==n) continue; const c=cs[i]; if(CJK.test(c)&&c!==[...line][i]&&!out.includes(c)) out.push(c); }
  return out;
}
/* the dictionary word (2–6 characters) that the most readings are within one character of; null without two supporters */
function dictConsensus(texts){
  const cands=texts.map(t=>[...t]).filter(cs=>cs.length>=2&&cs.length<=6&&cs.every(c=>CJK.test(c)));
  if(cands.length<2) return null;
  const byLen=new Map(); for(const cs of cands){ const a=byLen.get(cs.length)||[]; a.push(cs); byLen.set(cs.length,a); }
  const support=new Map();
  for(const key of DICT.keys()){ const group=byLen.get(key.length); if(!group||!CJK.test(key)) continue; const ks=[...key]; if(ks.length!==key.length) continue;
    for(const cs of group){ let diff=0; for(let i=0;i<ks.length&&diff<2;i++) if(ks[i]!==cs[i]) diff++;
      if(diff<=1){ const e=support.get(key)||{word:key,support:[]}; e.support.push(cs.join("")); support.set(key,e); } } }
  let best=null; for(const e of support.values()){ e.support=[...new Set(e.support)]; if(e.support.length>=2&&(!best||e.support.length>best.support.length||(e.support.length===best.support.length&&[...e.word].length>[...best.word].length))) best=e; }
  return best;
}
/* Does the photo show traditional characters? A vote (v113): every pass that read a line of the final text (the same
   line, or one character off) casts its effective score for its reader; the merged composite abstains. Traditional
   only when the traditional reader's votes outweigh the simplified reader's by half. On a simplified sign both readers
   read the same lines (H's escalator sign: 17 lines, one line from the traditional reader inside the merged winner was
   enough for the old rule — v113); on a traditional logo the simplified reader can only approximate (养兴多 / 和准兴多
   against 次乐多 / 义乐多 — it never produces 乐, the simplified form of 樂). */
function tradPhotoOf(finalLines,passes,score){
  const near=(a,b)=>{ const A=[...a],B=[...b]; if(A.length!==B.length) return false; let d=0; for(let i=0;i<A.length;i++) if(A[i]!==B[i]) d++; return d<=(A.length>=3?1:0); };
  let tra=0, sim=0, traPasses=0;
  for(const p of passes){ if(p.scale==="merged") continue; const sc=score(p); if(!sc) continue; const isTra=p.lines.some(l=>l.tra);
    for(const fl of finalLines){ if(p.lines.some(l=>near(l.t,fl))){ if(isTra){ tra+=sc; traPasses++; } else sim+=sc; } } }
  /* the simplified reader silent on the text is no vote for traditional (v142, H's 美团 logo: the traditional reader's
     lone 国 was the whole reading, nothing else came near it, and the card went traditional); without a simplified
     vote only a text of three characters or more that two traditional passes agree on counts */
  if(tra<=0) return false;
  if(sim>0) return tra>1.5*sim;
  return traPasses>=2&&[...finalLines.join("")].filter(c=>CJK.test(c)).length>=3;
}
function charStripHTML(id,k){
  const sg=SIGN[id], line=sg.lines[k], same=sg.orig&&sg.orig[k]===line.trim(), cf=(same&&sg.conf&&sg.conf[k])||[];
  const shown=sg.trad?[...tradLine(sg,k)]:null; /* the buttons show the photo's script, the taps act on the simplified line */
  let ci=0;
  return `<div class="cstrip">${[...line].map((ch,i)=>{ const isC=CJK.test(ch); const c=isC?cf[ci++]:100;
    return `<button class="ck${isC&&c<OCR_DOUBT?" low":""}" data-ck="${k},${i}" data-sid="${id}" title="${isC&&c<100?Math.round(c)+"%":""}">${esc(shown?shown[i]:ch)}</button>`; }).join("")}</div>`; /* no + tile at the end (H, v121) — adding goes through the picker's "+ before / + after" or the line input */
}
/* mode "ins": a new character goes in before index i (i = length: at the end) — v91, taken out in v92, back in v119
   (H: a misread 拉 became 人人, one character was drawn and the other could not be deleted — "add and delete characters").
   The last character of a line has no Remove (v123, H): an empty strip leaves nothing to tap, so no way to draw. */
async function openCharPick(id,k,i,btn,mode){
  const sg=SIGN[id]; if(!sg) return;
  const ins=mode==="ins", line=sg.lines[k], chars=[...line], ch=ins?"":chars[i];
  let box=$("#ckpick-"+id);
  if(!ins&&box&&box.dataset.mode==="rep"&&btn.classList.contains("on")){ box.remove(); btn.classList.remove("on"); return; } /* the open character tapped again: the picker closes (v125); from insert mode it goes back to replacing */
  document.querySelectorAll(".ck.on").forEach(b=>b.classList.remove("on")); btn.classList.add("on");
  if(!box){ box=document.createElement("div"); box.className="ckpick"; box.id="ckpick-"+id; }
  box.dataset.mode=ins?"ins":"rep";
  btn.closest(".sline").appendChild(box);
  const apply=async(rep)=>{ const cs=[...sg.lines[k]], n0=cs.length; if(ins){ if(rep===null) return; cs.splice(i,0,rep); } else if(rep===null) cs.splice(i,1); else cs[i]=rep; sg.lines[k]=cs.join(""); delete sg.ai; delete sg.aiErr;
    if(sg.trad&&sg.tradTouched){ const tl=(sg.tradText||"").split("\n"), tc=[...(tl[k]||"")]; if(tc.length===n0){ if(ins) tc.splice(i,0,s2t(rep)); else if(rep===null) tc.splice(i,1); else tc[i]=s2t(rep); tl[k]=tc.join(""); } else tl[k]=s2t(sg.lines[k]); sg.tradText=tl.join("\n"); }
    if(sg.onChange){ sg.onChange(); return; } /* the Edit form owns the re-render and the AI check */
    renderShots(); if(aiLive()) signAskAI(id); };
  const render=(dict,ai,aiBusy)=>{
    const seen=new Set();
    const where=ins?(i===0?"at the start":i>=chars.length?"at the end":`between <b class="hanzi">${esc(chars[i-1])}</b> and <b class="hanzi">${esc(chars[i])}</b>`):"";
    box.innerHTML=`<div class="ckhead"><span class="badge">${ins?`Add a character ${where}:`:`Replace <b class="hanzi">${esc(ch)}</b> with:`}</span><button class="ckx" id="ck-x-${id}" aria-label="Close">×</button></div>
      <div class="cands">${ai.filter(c=>!seen.has(c)&&seen.add(c)).map(c=>`<button class="ck ai" data-rep="${esc(c)}">${esc(c)}</button>`).join("")}${dict.filter(c=>!seen.has(c)&&seen.add(c)).map(c=>`<button class="ck" data-rep="${esc(c)}">${esc(c)}</button>`).join("")}${!dict.length&&!ai.length&&!aiBusy?`<span class="badge">no match — draw it or ask the AI</span>`:""}${aiBusy?`<span class="badge">asking the AI …</span>`:""}</div>
      <div class="ckacts">${ins||chars.length<=1?"":`<button class="btn mini danger" id="ck-del-${id}">Remove <span class="hanzi">${esc(ch)}</span></button>`}<button class="btn mini" id="ck-draw-${id}">Not here? Draw it</button>${aiOn()&&!ai.length&&!aiBusy?`<button class="btn mini" id="ck-ai-${id}">Ask AI</button>`:""}</div>
      ${ins?"":`<div class="ckacts ckadd"><span class="badge">Add a character:</span><button class="del" id="ck-ins0-${id}">+ before <span class="hanzi">${esc(ch)}</span></button><button class="del" id="ck-ins1-${id}">+ after <span class="hanzi">${esc(ch)}</span></button></div>`}`;
    box.querySelectorAll("[data-rep]").forEach(b=> b.onclick=()=>apply(b.dataset.rep));
    const del=$("#ck-del-"+id); if(del) del.onclick=()=>apply(null);
    const i0=$("#ck-ins0-"+id); if(i0) i0.onclick=()=>openCharPick(id,k,i,btn,"ins");
    const i1=$("#ck-ins1-"+id); if(i1) i1.onclick=()=>openCharPick(id,k,i+1,btn,"ins");
    $("#ck-x-"+id).onclick=()=>{ box.remove(); btn.classList.remove("on"); };
    const ab=$("#ck-ai-"+id); if(ab) ab.onclick=()=>askAI(dict);
    $("#ck-draw-"+id).onclick=()=>openDrawSheet(id,k,i,apply,ins);
  };
  const askAI=async(dict)=>{ render(dict,[],true); try{ const alts=await aiCharAlternatives(line,i,ins); if(!box.isConnected) return; render(dict,alts,false); if(!alts.length) box.querySelector(".cands").insertAdjacentHTML("beforeend",`<span class="badge">the AI has no better idea</span>`); }catch(err){ if(!box.isConnected) return; render(dict,[],false); box.querySelector(".cands").insertAdjacentHTML("beforeend",`<span class="badge">The AI could not be reached.</span>`); } };
  render([],[],false);
  await loadDict().catch(()=>{});
  const dict=ins?charCandidates(line,i,true):[...new Set([...altCharsAt(sg,k,i),...charCandidates(line,i)])];
  /* AI-first: while the AI is live it is asked at once, the dictionary candidates are the fallback */
  if(aiLive()) askAI(dict); else render(dict,[],false);
}
/* Where character i of line k sits in the reading crop. Tesseract's symbol boxes drift along a Chinese line (measured:
   from the third character on, a box marks the right part of one character plus the left of the next), but the line's
   overall extent and the box heights are right. So: the line's span from the first x0 to the last x1 is split evenly
   among the characters (signs are monospaced), the size and vertical position come from the median box height. */
function charBox(sg,k,i){
  const raw=(sg.boxes||[])[k]||[], n=[...(sg.lines[k]||"")].length;
  if(i<0||!raw.length||raw.length!==n||i>=n||n<2) return null; /* one character: its box alone is unreliable, the whole crop is shown; i<0: a new character has no box */
  const ok=raw.filter(Boolean); if(!ok.length) return null;
  const H=median(ok.map(b=>b.y1-b.y0)), cy=median(ok.map(b=>(b.y0+b.y1)/2));
  const x0=Math.min(...ok.map(b=>b.x0)), x1=Math.max(...ok.map(b=>b.x1)), cell=(x1-x0)/n;
  const cx=x0+(i+0.5)*cell, side=Math.max(H,Math.min(cell,1.4*H));
  return {x0:cx-side/2,y0:cy-side/2,x1:cx+side/2,y1:cy+side/2};
}
/* ---------- drawing sheet: write the character with a finger, the on-device reader names it ----------
   Opens over the whole screen (H: the inline pad sat below the fold, unseen). The photo character is at the top,
   the pad fills the width, and nothing is read until Done is tapped (H: "it already takes it without me confirming").
   Strokes are rendered black on white at ~80 px and read by the same Tesseract model; ranked by confidence,
   then by what fits the neighbours. Tap a result to replace the character; the sheet closes. */
/* The photo square in the drawing sheet: starts at the automatic crop (charBox) and can be moved with one finger and
   zoomed with two (or the mouse wheel) — the automatic position is a guess, H corrects it by hand. View = centre + side
   in image pixels; out-of-image parts are INK. */
function attachRefView(cv,sg,k,i){
  const N=600; cv.width=N; cv.height=N; const ctx=cv.getContext("2d");
  const v={cx:0,cy:0,side:1,bmp:null};
  const draw=()=>{
    ctx.fillStyle=cssVar("--fill")||"#888"; ctx.fillRect(0,0,N,N); if(!v.bmp) return;
    const sx=v.cx-v.side/2, sy=v.cy-v.side/2, kk=N/v.side;
    const ix=Math.max(0,sx), iy=Math.max(0,sy), ex=Math.min(v.bmp.width,sx+v.side), ey=Math.min(v.bmp.height,sy+v.side);
    if(ex>ix&&ey>iy) ctx.drawImage(v.bmp,ix,iy,ex-ix,ey-iy,(ix-sx)*kk,(iy-sy)*kk,(ex-ix)*kk,(ey-iy)*kk);
  };
  const clamp=()=>{ if(!v.bmp) return; const M=Math.max(v.bmp.width,v.bmp.height);
    v.side=Math.min(Math.max(v.side,24),M*1.5); v.cx=Math.min(Math.max(v.cx,0),v.bmp.width); v.cy=Math.min(Math.max(v.cy,0),v.bmp.height); };
  const ready=(async()=>{
    if(!sg.img) return;
    try{
      v.bmp=await createImageBitmap(sg.img);
      const b=charBox(sg,k,i);
      if(b){ const w=b.x1-b.x0, h=b.y1-b.y0; v.cx=(b.x0+b.x1)/2; v.cy=(b.y0+b.y1)/2; v.side=Math.max(w,h)*1.5; }
      else { v.cx=v.bmp.width/2; v.cy=v.bmp.height/2; v.side=Math.max(v.bmp.width,v.bmp.height); }
      clamp(); draw();
    }catch(e){}
  })();
  /* gestures: pointer map; one pointer pans, two pinch-zoom around their midpoint */
  const pts=new Map(); let last=null;
  const pxPerCss=()=>N/(cv.getBoundingClientRect().width||N);
  const summary=()=>{ const a=[...pts.values()]; if(a.length>=2){ const dx=a[0].x-a[1].x, dy=a[0].y-a[1].y; return {x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.hypot(dx,dy)}; } return a.length?{x:a[0].x,y:a[0].y,d:0}:null; };
  cv.onpointerdown=e=>{ e.preventDefault(); try{ cv.setPointerCapture(e.pointerId); }catch(x){} pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); last=summary(); };
  cv.onpointermove=e=>{ if(!pts.has(e.pointerId)) return; e.preventDefault(); pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); const cur=summary(); if(!last||!cur) { last=cur; return; }
    const k=v.side/N*pxPerCss(); /* image px per css px */
    v.cx-=(cur.x-last.x)*k; v.cy-=(cur.y-last.y)*k;
    if(last.d>0&&cur.d>0) v.side*=last.d/cur.d;
    clamp(); draw(); last=cur; };
  cv.onpointerup=cv.onpointercancel=e=>{ pts.delete(e.pointerId); last=summary(); };
  cv.onwheel=e=>{ e.preventDefault(); v.side*=Math.pow(1.1,e.deltaY/100); clamp(); draw(); };
  return {ready, view:v, draw, close:()=>{ if(v.bmp) v.bmp.close(); v.bmp=null; }};
}
const DRAW_SIZE=720, DRAWLOG=[]; /* the last three drawings — the strokes as drawn and what the model answered — for More → Diagnostics (v140, H: "I feel no improvement" — the synthetic test did not reflect a finger) */
function openDrawSheet(id,k,i,apply,ins){
  const sg=SIGN[id]; if(!sg) return;
  const ch=ins?"":([...sg.lines[k]][i]||"");
  document.querySelectorAll(".drawsheet").forEach(x=>x.remove());
  const el=document.createElement("div"); el.className="drawsheet";
  el.innerHTML=`<div class="dshead"><div class="badge">The character in the photo (drag to move, pinch to zoom) — draw it below.</div><button class="del" id="ds-x">Cancel</button></div>
    <canvas class="ckref" width="1" height="1" title="the character in the photo"></canvas>
    <canvas class="pad" width="${DRAW_SIZE}" height="${DRAW_SIZE}"></canvas>
    <div class="badge" id="ds-st">Draw all strokes, then tap Done.</div>
    <div class="cands" id="ds-cands"></div>
    <div class="ckacts"><button class="del" id="ds-undo">Undo</button><button class="del" id="ds-clear">Clear</button><span class="grow"></span><button class="btn primary" id="ds-done">Done</button></div>`;
  document.body.appendChild(el); document.body.classList.add("noscroll");
  /* symmetric: the photo character and the pad are two squares of the same side, as big as the screen allows (H) */
  const fitRef=()=>{ const rc=el.querySelector(".ckref"), pd=el.querySelector(".pad"); if(!pd||!pd.isConnected) return;
    const sq=[rc,pd].filter(Boolean); sq.forEach(c=>{ c.style.width="0px"; c.style.height="0px"; });
    const cs=getComputedStyle(el), gap=parseFloat(cs.rowGap)||0, kids=[...el.children];
    const used=kids.reduce((a,c)=>a+c.getBoundingClientRect().height,0)+gap*(kids.length-1)+parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom);
    const S=Math.max(160,Math.min(el.clientWidth-32,Math.floor((el.clientHeight-used)/sq.length)));
    sq.forEach(c=>{ c.style.width=S+"px"; c.style.height=S+"px"; }); };
  fitRef(); const refView=attachRefView(el.querySelector(".ckref"),sg,k,ins?-1:i); refView.ready.then(fitRef); /* a new character has no box: the whole crop */ el.refView=refView; /* used by the tests */
  window.addEventListener("resize",fitRef);
  const cv=el.querySelector(".pad"), ctx=cv.getContext("2d"), strokes=[]; let cur=null, seq=0;
  const status=t=>{ const st=el.querySelector("#ds-st"); if(st) st.textContent=t; };
  const close=()=>{ seq++; el.remove(); document.body.classList.remove("noscroll"); window.removeEventListener("resize",fitRef); refView.close(); };
  const paint=()=>{
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.strokeStyle=cssVar("--sep")||"#ccc"; ctx.lineWidth=2; ctx.setLineDash([10,10]);
    ctx.beginPath(); ctx.moveTo(cv.width/2,0); ctx.lineTo(cv.width/2,cv.height); ctx.moveTo(0,cv.height/2); ctx.lineTo(cv.width,cv.height/2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle=cssVar("--label")||"#000"; ctx.lineWidth=22; ctx.lineCap="round"; ctx.lineJoin="round";
    for(const st of strokes.concat(cur?[cur]:[])){ if(!st.length) continue; ctx.beginPath(); ctx.moveTo(st[0][0],st[0][1]); for(const p of st) ctx.lineTo(p[0],p[1]); if(st.length===1) ctx.lineTo(st[0][0]+0.1,st[0][1]); ctx.stroke(); }
  };
  const pt=e=>{ const r=cv.getBoundingClientRect(); return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]; };
  cv.onpointerdown=e=>{ e.preventDefault(); try{ cv.setPointerCapture(e.pointerId); }catch(x){} cur=[pt(e)]; paint(); };
  cv.onpointermove=e=>{ if(!cur) return; e.preventDefault(); cur.push(pt(e)); paint(); };
  cv.onpointerup=cv.onpointercancel=e=>{ if(!cur) return; strokes.push(cur); cur=null; paint(); };
  const showCands=alts=>{
    const c=el.querySelector("#ds-cands"); c.innerHTML=alts.map(x=>`<button class="ck draw" data-rep="${esc(x)}">${esc(x)}</button>`).join("");
    c.querySelectorAll("[data-rep]").forEach(b=> b.onclick=()=>{ close(); apply(b.dataset.rep); });
  };
  const recognize=async()=>{
    const my=++seq; showCands([]);
    if(!strokes.length){ status("Draw the character first."); return; }
    try{
      const w=await ocrWorker(status); if(my!==seq) return;
      status("reading …");
      /* stroke matching first (v141), the print model's readings after it; the database may be missing on a first use offline */
      let sm=[]; try{ sm=await strokeMatch(strokes); }catch(err){ logErr("strokes",err&&err.message||err); }
      const good=sm.filter(x=>x.cost<0.4).slice(0,5).map(x=>x.ch);
      const ocr=await recognizeStrokes(w,strokes,p=>{ if(my===seq) status("reading … "+p+"%"); });
      const alts=[...new Set([...good,...ocr])].slice(0,6);
      DRAWLOG.push({t:Date.now(),strokes:strokes.map(st=>st.map(p=>[Math.round(p[0]),Math.round(p[1])])),alts,strokes_best:sm.slice(0,5).map(x=>x.ch+":"+x.cost.toFixed(2)),ocr}); while(DRAWLOG.length>3) DRAWLOG.shift(); /* the phone's real strokes for the diagnostics (v140) */
      if(my!==seq||!el.isConnected) return;
      const ctxc=SIGN[id]?charCandidates(SIGN[id].lines[k],i,ins):[];
      const ranked=alts.slice().sort((a,b)=>(ctxc.includes(b)?1:0)-(ctxc.includes(a)?1:0)); /* what fits the neighbours first, otherwise the stroke match's order */
      showCands(ranked);
      status(ranked.length?"Read as — tap the right one. Not there? Clear and draw again.":"Not recognized — try cleaner, well-separated strokes.");
    }catch(err){ if(my===seq) status("Reading failed: "+(err&&err.message||err)); }
  };
  el.querySelector("#ds-undo").onclick=()=>{ strokes.pop(); seq++; showCands([]); paint(); status("Draw all strokes, then tap Done."); };
  el.querySelector("#ds-clear").onclick=()=>{ strokes.length=0; seq++; showCands([]); paint(); status("Draw all strokes, then tap Done."); };
  el.querySelector("#ds-done").onclick=recognize;
  el.querySelector("#ds-x").onclick=close;
  el.strokes=strokes; el.recognize=recognize; el.paint=paint; /* used by the tests */
  paint();
  return el;
}
/* ---------- stroke matching (v141, H: "Go!") ----------
   The drawn strokes are matched against the stroke medians of 9,534 characters (Make Me a Hanzi, derived from the
   Arphic fonts, `vendor/strokes.txt.gz`): every stroke is scaled into the unit square with the whole character and
   resampled to eight points; a character with a stroke count within one (two from eight strokes on) is scored by the
   best assignment of drawn strokes to its strokes — order-free, so H's own stroke order does not matter (he closes the
   box of 团 third, the standard order closes it last); a missing or extra stroke costs a fixed skip. The print model
   stays as the fallback and for characters the database lacks. */
let STROKES=null, _strokesLoading=null;
function loadStrokes(){
  if(STROKES) return Promise.resolve(STROKES);
  if(!_strokesLoading) _strokesLoading=(async()=>{
    const url=new URL("./vendor/strokes.txt.gz",location.href).href;
    let r=await fetch(url);
    if(!r.ok){ try{ const c=await caches.open("zt-ocr-v1"); await c.delete(url); }catch(e){} r=await fetch(url,{cache:"reload"}); if(!r.ok) throw new Error("stroke data not available ("+r.status+")"); }
    const buf=new Uint8Array(await r.arrayBuffer());
    const text=(buf[0]===0x1f&&buf[1]===0x8b)?await new Response(new Response(buf).body.pipeThrough(new DecompressionStream("gzip"))).text():new TextDecoder().decode(buf);
    const byCount=new Map();
    for(const line of text.split("\n")){ const i=line.indexOf("\t"); if(i<1) continue; const ch=line.slice(0,i); let st; try{ st=JSON.parse(line.slice(i+1)); }catch(e){ continue; }
      const prep=prepStrokes(st); if(!prep) continue; const a=byCount.get(prep.length)||[]; a.push({ch,st:prep}); byCount.set(prep.length,a); }
    STROKES=byCount; return STROKES;
  })().catch(err=>{ _strokesLoading=null; throw err; });
  return _strokesLoading;
}
const STROKE_PTS=8, STROKE_SKIP=0.32;
/* the strokes scaled into the unit square as a whole (aspect kept, centred) and resampled to STROKE_PTS points each */
function prepStrokes(strokes){
  const all=strokes.flat(); if(!all.length) return null;
  const x0=Math.min(...all.map(p=>p[0])), x1=Math.max(...all.map(p=>p[0])), y0=Math.min(...all.map(p=>p[1])), y1=Math.max(...all.map(p=>p[1]));
  const side=Math.max(x1-x0,y1-y0,1), cx=(x0+x1)/2, cy=(y0+y1)/2;
  return strokes.map(st=>{ const pts=st.map(p=>[(p[0]-cx)/side+0.5,(p[1]-cy)/side+0.5]);
    if(pts.length===1) return Array(STROKE_PTS).fill(pts[0]);
    const seg=[0]; for(let i=1;i<pts.length;i++) seg.push(seg[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
    const L=seg[seg.length-1]||1e-6, out=[];
    for(let k=0;k<STROKE_PTS;k++){ const t=L*k/(STROKE_PTS-1); let i=1; while(i<seg.length-1&&seg[i]<t) i++; const a=pts[i-1], b=pts[i], f=seg[i]===seg[i-1]?0:(t-seg[i-1])/(seg[i]-seg[i-1]); out.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]); }
    return out; });
}
const strokeDist=(a,b)=>{ let f=0, r=0; for(let k=0;k<STROKE_PTS;k++){ f+=Math.hypot(a[k][0]-b[k][0],a[k][1]-b[k][1]); const q=b[STROKE_PTS-1-k]; r+=Math.hypot(a[k][0]-q[0],a[k][1]-q[1]); } return Math.min(f/STROKE_PTS,r/STROKE_PTS+0.12); }; /* a stroke drawn backwards costs a little extra */
/* the cheapest assignment of the rows to the columns of a square cost matrix (Hungarian method) */
function assignCost(C){
  const n=C.length, INF=1e9, u=new Array(n+1).fill(0), v=new Array(n+1).fill(0), p=new Array(n+1).fill(0), way=new Array(n+1).fill(0);
  for(let i=1;i<=n;i++){ p[0]=i; let j0=0; const minv=new Array(n+1).fill(INF), used=new Array(n+1).fill(false);
    do{ used[j0]=true; const i0=p[j0]; let delta=INF, j1=0;
      for(let j=1;j<=n;j++) if(!used[j]){ const cur=C[i0-1][j-1]-u[i0]-v[j]; if(cur<minv[j]){ minv[j]=cur; way[j]=j0; } if(minv[j]<delta){ delta=minv[j]; j1=j; } }
      for(let j=0;j<=n;j++){ if(used[j]){ u[p[j]]+=delta; v[j]-=delta; } else minv[j]-=delta; }
      j0=j1; }while(p[j0]!==0);
    do{ const j1=way[j0]; p[j0]=p[j1]; j0=j1; }while(j0); }
  let total=0; for(let j=1;j<=n;j++) total+=C[p[j]-1][j-1]; return total;
}
/* the characters whose strokes the drawing fits best: [{ch,cost}], cheapest first */
async function strokeMatch(strokes){
  const db=await loadStrokes(); const U=prepStrokes(strokes); if(!U) return [];
  const n=U.length, tol=n>=8?2:1, out=[];
  for(let m=Math.max(1,n-tol);m<=n+tol;m++){ for(const {ch,st} of db.get(m)||[]){
      const N=Math.max(n,m), C=[]; for(let i=0;i<N;i++){ const row=[]; for(let j=0;j<N;j++) row.push(i<n&&j<m?strokeDist(U[i],st[j]):STROKE_SKIP); C.push(row); }
      out.push({ch,cost:assignCost(C)/N}); } }
  return out.sort((a,b)=>a.cost-b.cost).slice(0,8);
}
/* Guide the lines (v139, H): the print model knows straight strokes and clean corners, a finger draws wobbles. Every
   stroke is smoothed, reduced to its corners (Douglas–Peucker, tolerance 3.5 % of the character), and segments within
   12° of horizontal or vertical are snapped to the axis; diagonals and curves keep their shape. */
function guideStrokes(strokes,size){
  const eps=Math.max(3,size*0.035);
  const segDist=(p,a,b)=>{ const dx=b[0]-a[0], dy=b[1]-a[1], l2=dx*dx+dy*dy; if(!l2) return Math.hypot(p[0]-a[0],p[1]-a[1]); const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2)); return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy); };
  const simplify=pts=>{ if(pts.length<3) return pts.slice(); const a=pts[0], b=pts[pts.length-1]; let md=0, mi=0; for(let i=1;i<pts.length-1;i++){ const d=segDist(pts[i],a,b); if(d>md){ md=d; mi=i; } }
    if(md<=eps) return [a,b]; return simplify(pts.slice(0,mi+1)).slice(0,-1).concat(simplify(pts.slice(mi))); };
  const smooth=pts=>pts.map((p,i)=>{ const a=pts[Math.max(0,i-2)], b=pts[Math.max(0,i-1)], c=pts[Math.min(pts.length-1,i+1)], d=pts[Math.min(pts.length-1,i+2)]; return [(a[0]+b[0]+p[0]+c[0]+d[0])/5,(a[1]+b[1]+p[1]+c[1]+d[1])/5]; });
  return strokes.map(st=>{ if(st.length<3) return st.map(p=>p.slice());
    const s=simplify(smooth(st)).map(p=>p.slice());
    for(let i=1;i<s.length;i++){ const dx=s[i][0]-s[i-1][0], dy=s[i][1]-s[i-1][1], ang=Math.abs(Math.atan2(dy,dx)*180/Math.PI);
      if(ang<12||ang>168) s[i][1]=s[i-1][1]; else if(Math.abs(ang-90)<12) s[i][0]=s[i-1][0]; }
    return s; });
}
async function recognizeStrokes(w,strokes,log,guide=true){
  if(guide&&strokes.length){ const all=strokes.flat(); const w0=Math.max(...all.map(p=>p[0]))-Math.min(...all.map(p=>p[0])), h0=Math.max(...all.map(p=>p[1]))-Math.min(...all.map(p=>p[1])); strokes=guideStrokes(strokes,Math.max(w0,h0,40)); }
  const pts=strokes.flat(); if(!pts.length) return [];
  const x0=Math.min(...pts.map(p=>p[0])), x1=Math.max(...pts.map(p=>p[0])), y0=Math.min(...pts.map(p=>p[1])), y1=Math.max(...pts.map(p=>p[1]));
  const side=Math.max(x1-x0,y1-y0,40);
  const render=async(T,lw)=>{ /* strokes black on white, the character T px tall like the print the model knows */
    const sc=T/side, PAD=24;
    const cv=document.createElement("canvas"); cv.width=Math.round((x1-x0)*sc)+2*PAD; cv.height=Math.round((y1-y0)*sc)+2*PAD;
    const ctx=cv.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,cv.width,cv.height);
    ctx.strokeStyle="#000"; ctx.lineWidth=Math.max(3,Math.round(lw*T/80)); ctx.lineCap="round"; ctx.lineJoin="round";
    for(const st of strokes){ ctx.beginPath(); ctx.moveTo((st[0][0]-x0)*sc+PAD,(st[0][1]-y0)*sc+PAD); for(const p of st) ctx.lineTo((p[0]-x0)*sc+PAD,(p[1]-y0)*sc+PAD); if(st.length===1) ctx.lineTo((st[0][0]-x0)*sc+PAD+0.1,(st[0][1]-y0)*sc+PAD); ctx.stroke(); }
    return new Promise(res=>cv.toBlob(res,"image/png"));
  };
  /* The model gives no alternatives for a symbol, so a few readings are combined: single word (best on hand strokes) and
     single character, at two sizes and stroke widths. Ranked by confidence; each character once. */
  const seen=new Map();
  for(const [psm,T,lw] of [["8",80,7],["10",80,7],["8",50,11]]){
    const blob=await render(T,lw);
    await w.setParameters({tessedit_pageseg_mode:psm});
    _ocrLog=log||null;
    const {data}=await w.recognize(blob,{},{blocks:true,text:true}).finally(()=>{ _ocrLog=null; });
    eachLine(data,symbols=>symbols.forEach(sy=>{
      for(const c of [...sy.text]) if(CJK.test(c)&&(seen.get(c)||0)<sy.confidence) seen.set(c,sy.confidence);
    }));
  }
  return [...seen.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]).slice(0,5);
}
/* one editable line: the character strip, the input, optionally the pinyin slot below */
/* the line as shown: on a traditional photo the traditional form (H, v104: "show the text in traditional and add simplified
   for reference" — the edits underneath stay simplified, the card's key), else the simplified line itself */
/* The traditional mark by hand (v146, H's 9楼 marked traditional by the vote: "make it changeable in crop mode and under
   Edit"): a link under the characters in the Read preview and the Edit form — "Not traditional" on a marked text drops
   the mark, "Traditional on the photo" on a plain one sets it (the strip and the line switch form, the reference line
   comes and goes, the key stays simplified). A text without a traditional form (推) shows no link. */
function scriptLinkHTML(id,sg){
  const txt=sg.lines.map(l=>l.trim()).filter(Boolean).join("\n");
  if(!sg.trad&&S2T&&s2t(txt)===txt) return "";
  return `<button type="button" class="del scriptlink" data-scripttoggle="${id}">${sg.trad?"Not traditional":"Traditional on the photo"}</button>`;
}
async function setScript(sg,on){
  sg.tradUser=true; sg.tradTouched=false;
  if(on){ await loadScriptTables(); const txt=sg.lines.join("\n"), t=s2t(txt); if(t===txt){ sg.trad=false; sg.tradText=""; return; } sg.trad=true; sg.tradText=t; }
  else { sg.trad=false; sg.tradText=""; }
}
function tradLine(sg,k){ const line=sg.lines[k]; if(!sg.trad) return line; const t=(sg.tradText||"").split("\n")[k]; return t&&[...t].length===[...line].length?t:s2t(line); }
function slineHTML(id,k,line,withPinyin,withInput=true){
  const sg=SIGN[id]; /* withInput=false: the Read preview shows the strip alone (H, v109: the line field under it was one thing too many); the Edit form keeps it for retyping */
  const hint=k===0?`<div class="badge ckhint">Tap a character to change it${withInput?", or type the line below":""}.</div>`:""; /* right under the strip (H, v112) */
  return `<div class="sline">${charStripHTML(id,k)}${hint}${withInput?`<input class="hanzi" data-sid="${id}" data-sline="${k}" value="${esc(sg&&sg.trad?tradLine(sg,k):line)}" autocomplete="off">`:""}${withPinyin?`<div class="sp" id="sp-${id}-${k}"></div>`:""}</div>`;
}
/* the strip's character buttons open the picker; typing in a line calls onInput(sg, k, input) */
function wireSlines(root,onInput,onCommit){ /* onCommit(sg,id): the line input was left after typing — the strip is redrawn from the text, the caller re-checks */
  root.querySelectorAll("[data-ck]").forEach(b=> b.onclick=()=>{ const [k,i]=b.dataset.ck.split(",").map(Number); openCharPick(b.dataset.sid,k,i,b); });
  root.querySelectorAll("[data-sline]").forEach(inp=> inp.oninput=()=>{ const sg=SIGN[inp.dataset.sid]; if(!sg) return; const k=+inp.dataset.sline;
    if(sg.trad){ sg.tradTouched=true; const tl=(sg.tradText||"").split("\n"); while(tl.length<=k) tl.push(""); tl[k]=inp.value; sg.tradText=tl.join("\n"); sg.lines[k]=t2s(inp.value); }
    else sg.lines[k]=inp.value;
    onInput(sg,inp.dataset.sid); });
  root.querySelectorAll("[data-sline]").forEach(inp=> inp.onchange=()=>{ const sg=SIGN[inp.dataset.sid]; if(!sg) return; const k=+inp.dataset.sline, sl=inp.closest(".sline"), strip=sl&&sl.querySelector(".cstrip");
    if(strip){ strip.outerHTML=charStripHTML(inp.dataset.sid,k); wireSlines(sl,onInput,onCommit); } /* the buttons follow the typed line */
    if(onCommit) onCommit(sg,inp.dataset.sid,k); });
  root.querySelectorAll("[data-spin]").forEach(t=> t.oninput=()=>{ const sg=SIGN[t.dataset.spin]; if(sg){ sg.pinTouched=true; sg.pinEdit=t.value; } });
  root.querySelectorAll("[data-smean]").forEach(t=> t.oninput=()=>{ const sg=SIGN[t.dataset.smean]; if(sg){ sg.meanTouched=true; sg.meanEdit=t.value; } });
  root.querySelectorAll("[data-sflag]").forEach(cb=> cb.onchange=()=>{ const sg=SIGN[cb.dataset.sflag]; if(!sg) return; sg.flag=cb.checked; const n=root.querySelector(`[data-snote="${cb.dataset.sflag}"]`); if(n){ n.hidden=!cb.checked; if(cb.checked) n.focus(); } });
  root.querySelectorAll("[data-snote]").forEach(n=> n.oninput=()=>{ const sg=SIGN[n.dataset.snote]; if(sg) sg.flagNote=n.value; });
  wireGrow(root);
}
function signEditorHTML(id){
  const sg=SIGN[id]; if(!sg) return "";
  const rows=sg.lines.map((l,k)=>slineHTML(id,k,l,false,true)).join(""); /* the line input is back under the strip (v120, H: "type the correct hanzi in a text field, like in Edit mode" — it went in v109) */
  const low=sg.conf?Math.min(...sg.conf.flat().concat([100])):100;
  const doubt=!aiLive()&&low<OCR_DOUBT?` The reading looks uncertain (confidence ${Math.round(low)}%) — check the text.`:"";
  const bad=sg.ai&&sg.ai.bad;
  /* no status about the AI (H, v105: "not relevant for user") — the text is either fine, or it needs a hand */
  const head=sg.aiBusy?"Checking the text …":bad?"This reading looks wrong — frame the text tightly and read again, or fix the characters.":sg.ai&&!sg.ai.kept?"":doubt.trim(); /* the tap hint sits under the strip (H, v111) */
  /* the reading crop is not shown (H: "the user doesn't have to see it") — it serves the picker's reference only */
  const nChars=sg.lines.join("").replace(/[^\u4e00-\u9fff]/g,"").length, meanCf=(sg.conf||[]).flat().reduce((a,c,_,arr)=>a+c/arr.length,0);
  const weak=nChars<=2&&meanCf<85?`<div class="err" style="margin:4px 0 8px">Only ${nChars} character${nChars===1?"":"s"} found — if the photo shows more, frame the characters tightly and drag a corner to read again.</div>`:"";

  /* the same layout as the Edit form (H): Text, Pinyin, Meaning — pinyin and meaning can be corrected before saving */
  return `<div class="signed">${weak}${head?`<div class="badge${bad?" bad":""}" style="margin-bottom:8px">${head}</div>`:""}
    <div class="field"><label>Characters${sg.trad?" (traditional, as on the photo)":""}</label>${rows}<div class="scriptline">${sg.trad?`<div class="scriptref" id="ssimp-${id}"><span class="lbl">Simplified</span><span class="hanzi">${esc(sg.lines.map(l=>l.trim()).filter(Boolean).join(" / "))}</span></div>`:""}${scriptLinkHTML(id,sg)}</div></div>
    <div class="field"><label>Pinyin</label><textarea class="grow" id="spin-${id}" rows="1" data-spin="${id}">${esc(sg.pinEdit||"")}</textarea></div>
    <div class="field"><label>Meaning</label><textarea class="grow" id="smeanf-${id}" rows="1" data-smean="${id}">${esc(sg.meanEdit||"")}</textarea><div class="smean badge" id="smean-${id}" style="margin-top:4px"></div></div>
    <div class="field"><label class="check"><input type="checkbox" data-sflag="${id}"${sg.flag?" checked":""}> ⚑ Flag for review (text, pinyin or meaning looks wrong)</label>
      <input data-snote="${id}" value="${esc(sg.flagNote||"")}" placeholder="Note for the reviewer (optional)"${sg.flag?"":" hidden"}></div>
    ${tagsFieldHTML("stags-"+id,sg.tags)}
    <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" data-signsave="${id}">Save card</button>${aiOn()&&!sg.ai&&!sg.aiBusy?`<button class="btn mini" data-signai="${id}">Ask AI</button>`:""}<button class="del" data-signcancel="${id}">Cancel</button></div>
    ${sg.aiErr?`<div class="err" style="margin-top:6px">${esc(sg.aiErr)}</div>`:""}</div>`;
}
/* recompute pinyin / meaning / gloss for the current lines without re-rendering (keeps input focus) */
function signPreview(id){
  const sg=SIGN[id]; if(!sg||!window.pinyinPro) return; /* pinyin and gloss need the reader's libraries — loaded before any reading */
  const res=sg.lines.map(l=>CJK.test(l)?lineMeaning(l):null);
  res.forEach((r,k)=>{ const el=$(`#sp-${id}-${k}`); if(el) el.textContent=r?r.py:""; });
  const live=res.filter(Boolean);
  const full=live.length>0 && live.every(r=>r.full);
  const mean=live.map(r=>r.en).filter(Boolean).join(" / ");
  /* an AI check applies as long as the text was not edited afterwards */
  if(sg.ai && sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)).join("\n")!==sg.ai.zh) delete sg.ai;
  const py=live.map(r=>r.py).join(" / ");
  const pinF=$(`#spin-${id}`), meanF=$(`#smeanf-${id}`);
  const good=sg.ai&&!sg.ai.bad&&!sg.ai.kept; /* a "bad" answer (OCR garbage) or a kept reading (v143) changes nothing — the fields keep the reading's own values */
  if(pinF&&!sg.pinTouched){ pinF.value=good&&sg.ai.p?sg.ai.p:py; autoGrow(pinF); }
  if(meanF&&!sg.meanTouched){ meanF.value=good?(sg.ai.m||mean):mean; autoGrow(meanF); }
  const sm=$(`#smean-${id}`);
  if(sm){ sm.className="smean badge"+(good?" ai":sg.ai&&!sg.ai.kept?" bad":""); sm.textContent=good
    ?(sg.ai.note&&sg.ai.note.toLowerCase()!=="ok"?sg.ai.note:"") /* a remark only, no "checked by the AI" (H, v104/v105) */
    :sg.ai&&sg.ai.kept?`The AI suggested ${sg.ai.proposed.replace(/\n/g," / ")}, but ${sg.ai.kept} was read clearly, so the reading stays. Meaning ${full?"from the phrasebook":"composed word by word"}, unverified.`
    :sg.ai?`This text looks misread${sg.ai.note?": "+sg.ai.note:""} — unverified`
    :`Meaning ${full?"from the phrasebook":"composed word by word"}, unverified`; }
  /* the traditional form follows the text (the AI's "zht" when it matches, else the character table) unless edited by hand */
  if(sg.trad){
    if(!sg.tradTouched){ const zh=sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)).join("\n"), zht=good&&sg.ai.zht&&[...sg.ai.zht].length===[...zh].length?sg.ai.zht:s2t(zh); sg.tradText=zht; }
    document.querySelectorAll(`[data-sid="${id}"][data-sline]`).forEach(inp=>{ if(document.activeElement!==inp){ const v=tradLine(sg,+inp.dataset.sline); if(inp.value!==v) inp.value=v; } });
    const ref=$(`#ssimp-${id}`); if(ref) ref.innerHTML=`<span class="lbl">Simplified</span><span class="hanzi">${esc(sg.lines.map(l=>l.trim()).filter(Boolean).join(" / "))}</span>`;
  }
  sg.res=res; sg.full=full; sg.mean=mean;
  if(!sg.ai && !(aiLive()&&!sg.aiErr)) signTranslate(id); /* offline model only as fallback */
}
/* ask the online AI about the transcript right here; the corrected text lands in the editor */
/* The AI may not overwrite a character that was read clearly (v143, H's bicycle sticker 减震单车: every pass read 减 at 98 %,
   DeepSeek answered 共享单车 "shared bicycle" — a common phrase, not the sign — and the preview swapped the right 减 for 共).
   A changed position is open only when the reading's confidence there is under AI_SETTLED, or another reading of the same
   line length saw the AI's character at that position (养兴多 → 养乐多 with 义乐多 among the alternatives; 和 → 活 with the alt
   活菌型…). Otherwise the answer is not applied: the reading stays, the remark names the AI's proposal, and the fields keep
   the reading's own pinyin and gloss. A line edited by hand before the check has no confidences left and is never guarded;
   an answer of another length (two characters fused into one) is not guarded either. Returns the first settled character. */
const AI_SETTLED=90;
function aiSettled(sg,lines,zh){
  const zl=zh.split("\n"); if(zl.length!==lines.length) return "";
  const alts=(sg.alts||[]).map(t=>t.split("\n"));
  for(let k=0;k<lines.length;k++){ const a=[...lines[k]], b=[...zl[k]]; if(a.length!==b.length) continue;
    const ki=sg.lines.findIndex(l=>l.trim()===lines[k]), cf=(ki>=0&&sg.orig&&sg.orig[ki]===lines[k]&&sg.conf&&sg.conf[ki])||[]; if(cf.length!==a.length) continue;
    for(let i=0;i<a.length;i++){ if(a[i]===b[i]||!CJK.test(a[i])||cf[i]<AI_SETTLED) continue;
      const seen=alts.some(al=>{ const l=al[k]; if(!l) return false; const cs=[...l]; return cs.length===a.length&&cs[i]===b[i]; });
      if(!seen) return a[i]; } }
  return "";
}
async function signAskAI(id){
  const sg=SIGN[id]; if(!sg||sg.aiBusy) return;
  signPreview(id);
  const lines=sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)); if(!lines.length) return;
  sg.aiBusy="asking the AI …"; delete sg.aiErr; renderShots();
  sg.aiPromise=(async()=>{ try{
    const c=lines.join("\n"), res=(sg.res||[]).filter(Boolean);
    const [r]=await aiAsk([{kind:"sign",c,p:res.map(x=>x.py).join(" / "),m:sg.mean||"",gloss:res.flatMap(x=>x.gloss),alts:sg.alts,trad:!!sg.trad,mt:{src:"gloss",verified:false,suspect:"read from a photo by OCR"}}]);
    if(!SIGN[id]) return;
    let zh=r.zh&&CJK.test(r.zh)&&!r.bad?r.zh.replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean).join("\n"):c;
    zh=recutLines(zh,lines); /* the model often drops the line breaks — the photo's lines win */
    const kept=zh!==c?aiSettled(sg,lines,zh):"";
    if(kept){ sg.ai={zh:c,proposed:zh,kept,zht:"",p:"",m:"",note:r.note,ok:false,bad:false}; }
    else { sg.lines=zh.split("\n"); sg.ai={zh,zht:r.zht&&CJK.test(r.zht)?recutLines(r.zht.replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean).join("\n"),lines):"",p:r.p,m:r.m,note:r.note,ok:r.ok,bad:!!r.bad};
    if(r.bad&&!sg.flag){ sg.flag=true; sg.flagNote=sg.flagNote||"the reading looks wrong"; } } /* H's rule: when unsure, flag instead of inventing */
  }catch(err){ if(SIGN[id]) sg.aiErr=err&&err.message||String(err); } /* → signPreview falls back to the offline model */
  if(SIGN[id]){ delete sg.aiBusy; delete sg.aiPromise; }
  renderShots(); })();
  await sg.aiPromise;
}
/* offline translation of the lines the phrasebook did not cover — async so
   typing stays responsive; a token drops stale results */
async function signTranslate(id){
  const sg=SIGN[id]; if(!sg||!nmtOn()) return;
  if(!(await nmtInfo())) return;
  const lines=sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l));
  const tok=sg.tok=(sg.tok||0)+1;
  const sm=$(`#smean-${id}`);
  try{
    const r=await signMeaning(lines,t=>{ const el=$(`#smean-${id}`); if(el) el.textContent=t; });
    if(sg.tok!==tok||!SIGN[id]) return;
    const box=$(`#smean-${id}`), mf=$(`#smeanf-${id}`);
    if(box) box.textContent=`Meaning ${r.src==="nmt"?"from the offline translation":r.src==="phrasebook"?"from the phrasebook":"composed word by word"}, unverified`;
    if(mf&&!sg.meanTouched&&r.m){ mf.value=r.m; autoGrow(mf); }
  }catch(err){ if(sm) sm.textContent="Offline translation failed, meaning composed word by word"; }
}
async function saveSign(id){
  const sg=SIGN[id]; if(!sg) return;
  if(sg.aiPromise){ const b=document.querySelector(`[data-signsave="${id}"]`); if(b){ b.disabled=true; b.textContent="Checking …"; } await sg.aiPromise; if(!SIGN[id]) return; }
  signPreview(id);
  const keep=sg.lines.map((l,k)=>({l:l.trim(),r:sg.res[k]})).filter(x=>x.r);
  if(!keep.length) return;
  const c=keep.map(x=>x.l).join("\n");
  if(deck().some(d=>d.c===c&&d.shot===id)){ sg.aiErr="This text is already saved from this photo."; renderShots(); return; } /* the same text from another photo is a new card (H, v118) */
  /* meaning: AI check (if done here) → phrasebook → offline translation (if enabled) → word gloss (then pending) */
  let mt={src:sg.full?"phrasebook":"gloss",verified:false,pending:!sg.full}, mean=sg.mean||"", pin=keep.map(x=>x.r.py).join(" / ");
  if(sg.ai && c===sg.ai.zh && !sg.ai.bad && !sg.ai.kept){ mean=sg.ai.m||mean; pin=sg.ai.p||pin; mt={src:"llm",verified:true,pending:false}; }
  const pinHand=sg.pinTouched&&(sg.pinEdit||"").replace(/\s+/g," ").trim(), meanHand=sg.meanTouched&&(sg.meanEdit||"").replace(/\s+/g," ").trim();
  if(pinHand) pin=pinHand;
  if(meanHand){ mean=meanHand; mt={...mt,verified:true,pending:false}; } /* H wrote the meaning: no offline model, no pending */
  else if(!meanHand && !sg.full && nmtOn() && !(aiLive()&&!sg.aiErr)){ /* no connection (or AI failed): offline model */
    const btn=document.querySelector(`[data-signsave="${id}"]`); if(btn){ btn.disabled=true; btn.textContent="Translating …"; }
    try{ const r=await signMeaning(keep.map(x=>x.l)); mean=r.m||mean; mt={src:r.src,verified:false,pending:r.pending}; }catch(e){}
  }
  /* doubtful OCR: low confidence on a line H did not correct, or words the dictionary does not know */
  const cfs=sg.lines.flatMap((l,k)=>(sg.orig&&sg.orig[k]===l.trim()&&sg.conf&&sg.conf[k])||[]);
  const unknown=keep.flatMap(x=>x.r.gloss.filter(g=>!g.ph&&!g.m).map(g=>g.w));
  const why=mt.src==="llm"?"":ocrDoubt(cfs,null,unknown); if(why) mt.suspect=why;
  if(sg.ai&&sg.ai.bad) mt.suspect="the text looks misread";
  /* a short single line is a word card (reticle front); anything longer is a sign card */
  const word=keep.length===1 && glyphs(c)<=4;
  const card=word
    ? { id:cardId(c), c, p:pin, m:mean, t:"Custom", at:Date.now(), shot:id, lb:"photo", mt, ...(keep[0].r.segs.filter(x=>CJK.test(x)).length>1?{seg:keep[0].r.segs.filter(x=>CJK.test(x)), gloss:keep[0].r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))}:{}) }
    : { id:cardId(c), kind:"sign", c, p:pin, m:mean, t:"Sign", at:Date.now(), shot:id,
        segs:keep.map(x=>x.r.segs), gloss:keep.flatMap(x=>x.r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))), mt };
  if(sg.flag){ card.flag=true; const note=(sg.flagNote||"").trim(); if(note) card.flagNote=note; } /* H: flag a new card at once, without opening it again */
  if(sg.tags&&sg.tags.length) card.tags=sg.tags.slice();
  if(sg.alts&&sg.alts.length) card.alts=sg.alts.slice(0,5); /* the other readings stay with the card for a later AI check */
  if(sg.trad&&(sg.tradText||"").trim()) card.trad=sg.tradText.trim(); /* the text as it stands on the photo, in traditional characters (v101) */
  if(S.pendingImg) card.img=await jpegOf(S.pendingImg);
  if(S.pendingFull) card.imgFull=S.pendingFull;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false); QSCARD[id]=card.id;
  delete SIGN[id]; if(CROP&&CROP.id===id) CROP=null; /* saved — the frame has done its job */
  QSNOTE[id]=`Card saved — ${esc(c.replace(/\n/g," / "))}.`+(mt.pending?" Translation pending.":"")+(card.flag?" Flagged for review.":""); /* no word about sources or the AI (H, v105) */
  aiAutoSoon();
  setStats(); renderShots();
}
/* ---------- Kamera / Inbox ---------- */
function renderInbox(main){
  main.innerHTML=`<div class="pane">
    <div class="lead">Photos stay on this phone. Frame the text — the card is made for you.</div>
    <div class="snaprow"><button class="btn primary" id="snap">Take photo</button><button class="btn" id="pick">From album</button></div>
    <div id="shots"></div>
  </div>`;
  $("#snap").onclick=()=>$("#cam").click();
  $("#pick").onclick=()=>$("#album").click();
  renderShots();
}
const IMGURL={}; // cache object URLs per photo — renderShots re-runs on every selection
function shotURL(s){ return IMGURL[s.id]||(IMGURL[s.id]=URL.createObjectURL(s.blob)); }
function renderShots(){
  const box=$("#shots"); if(!box) return;
  const pending=PENDING_SHOT?`<div class="shot pending"><div class="badge">Processing photo …</div></div>`:"";
  if(!S.inbox.length){ box.innerHTML=pending||`<div class="badge" style="margin-top:18px">No photos yet.</div>`; return; }
  box.innerHTML=`<div class="listhead">Inbox (${S.inbox.length})</div>`+pending+
    S.inbox.map(s=>{
      const dt=new Date(s.ts).toLocaleString("en-GB");
      const cropping=CROP && CROP.id===s.id;
      return `<div class="shot">
        <div class="shotwrap">
          <img src="${shotURL(s)}" alt="photo">
          ${cropping?`<div class="croplayer${CROP.rect?" framed":""}" data-id="${s.id}"><div class="croprect"${cropRectStyle()}><div class="h tl"></div><div class="h tr"></div><div class="h bl"></div><div class="h br"></div></div></div>`:""}
        </div>
        <div class="meta"><span class="ts">${dt}</span><span class="acts">${cropping
          ?`<button class="del" data-cropcancel="${s.id}">Cancel</button>`
          :`<button class="ocr-btn" data-crop="${s.id}">Crop</button><button class="del" data-del="${s.id}">Delete</button>`}</span></div>
        <div class="ocr" id="ocr-${s.id}">${SIGN[s.id]?signEditorHTML(s.id):READING[s.id]?readingHTML(READING[s.id],s.id):cropping
          ?`<span class="badge">Draw a frame with your finger over the text — corners resize it, dragging inside moves it.</span>`
          :QSNOTE[s.id]?`<div class="ok" style="margin:0">${QSNOTE[s.id]}</div>${qsAiBox(s.id)}`:""}</div>
      </div>`;
    }).join("");
  box.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>delShot(b.dataset.del));
  box.querySelectorAll("[data-crop]").forEach(b=> b.onclick=()=>{ CROP={id:b.dataset.crop,rect:null}; renderShots(); });
  box.querySelectorAll("[data-cropcancel]").forEach(b=> b.onclick=()=>{ const id=b.dataset.cropcancel; clearTimeout(READ_TIMER[id]); READ_RUN[id]=(READ_RUN[id]||0)+1; /* a running reading abandons instead of delivering a result after Cancel */ CROP=null; delete SIGN[id]; delete READING[id]; renderShots(); });
  box.querySelectorAll("[data-signai]").forEach(b=> b.onclick=()=>signAskAI(b.dataset.signai));
  box.querySelectorAll("[data-scripttoggle]").forEach(b=> b.onclick=async()=>{ const sg=SIGN[b.dataset.scripttoggle]; if(!sg) return; await setScript(sg,!sg.trad); renderShots(); }); /* the mark by hand (v146); the AI is not asked again */
  wireAi(box);
  box.querySelectorAll(".croplayer").forEach(wireCrop);
  wireSlines(box,(sg,id)=>signPreview(id),(sg,id,k)=>{ delete sg.ai; delete sg.aiErr;
    /* a typed line that keeps nothing of the reading is a new text: the reader's traditional verdict was about the old one (v142, H typed 美团 over a lone 国 and got 美團) */
    if(sg.trad&&!sg.tradUser){ const o=[...((sg.orig&&sg.orig[k])||"")], n=sg.lines[k]||""; if(!o.some(ch=>CJK.test(ch)&&n.includes(ch))){ sg.trad=false; sg.tradText=""; sg.tradTouched=false; renderShots(); } }
    signPreview(id); if(aiLive()) signAskAI(id); }); /* a typed line is checked like a picked character */
  wireTags(box,(cur,inp)=>{ const sg=SIGN[inp.id.slice(6)]; if(sg) sg.tags=cur; });
  box.querySelectorAll("[data-signsave]").forEach(b=> b.onclick=()=>saveSign(b.dataset.signsave));
  box.querySelectorAll("[data-signcancel]").forEach(b=> b.onclick=()=>{ const id=b.dataset.signcancel; delete SIGN[id]; if(CROP&&CROP.id===id) CROP=null; renderShots(); });
  /* only the inbox's readings: the Edit form's text state (SIGN["editN"]) survives a tab tap, and previewing it here before
     the pinyin library is loaded threw "pinyinPro is not defined" into every reading (v108, H's phone) */
  S.inbox.forEach(s=>{ if(SIGN[s.id]) signPreview(s.id); });
}
let PENDING_SHOT=false; /* a photo is being processed — the inbox shows a placeholder right away */
async function onPhoto(e){
  const files=[...(e.target.files||[])].filter(f=>f&&f.type.startsWith("image/"));
  e.target.value="";
  if(!files.length) return;
  /* show something immediately: downscaling a 12-MP photo takes 1–3 s on the phone,
     and Chrome often does not repaint after the camera until the page is touched */
  PENDING_SHOT=true;
  if(S.mode!=="inbox"){ S.mode="inbox"; render(); } else renderShots();
  window.scrollTo({top:0});
  await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))); /* let the placeholder paint first */
  /* several photos from the album: all land in the inbox, the first one opens in crop mode */
  let first=null;
  for(const file of files){ const id=await addPhoto(file); if(!first) first=id; }
  CROP=first?{id:first,rect:null}:null; PENDING_SHOT=false;
  if(S.mode!=="inbox"){ S.mode="inbox"; render(); } else renderShots();
  window.scrollTo({top:0});
}
async function addPhoto(file){
  /* bake in EXIF rotation + downscale to max 1600px: keeps the inbox small
     and the OCR boxes aligned with the displayed image */
  let blob=file;
  try{
    const bmp=await createImageBitmap(file);
    const sc=Math.min(1,1600/Math.max(bmp.width,bmp.height));
    const cv=document.createElement("canvas");
    cv.width=Math.round(bmp.width*sc); cv.height=Math.round(bmp.height*sc);
    cv.getContext("2d").drawImage(bmp,0,0,cv.width,cv.height);
    bmp.close();
    blob=(await new Promise(res=>cv.toBlob(res,"image/jpeg",0.85)))||file;
  }catch(err){}
  const rec={ id:"shot_"+Date.now()+"_"+Math.floor(Math.random()*1000), blob, ts:Date.now() };
  S.inbox.unshift(rec);
  try{ await idbPut("inbox",rec); }catch(err){}
  return rec.id;
}
async function delShot(id){
  S.inbox=S.inbox.filter(s=>s.id!==id);
  try{ await idbDel("inbox",id); }catch(e){}
  if(IMGURL[id]){ URL.revokeObjectURL(IMGURL[id]); delete IMGURL[id]; }
  if(CROP && CROP.id===id) CROP=null;
  renderShots(); setStats();
}

/* ---------- Export / import (device migration; photos stay local) ---------- */
async function exportData(){
  const data={ app:"zeichentrainer", version:1, exported:new Date().toISOString(),
    progress:Object.entries(S.progress).map(([id,s])=>({id,...s})),
    custom:S.custom.map(({img,imgFull,...rest})=>rest) }; // images stay local (privacy + JSON)
  const json=JSON.stringify(data,null,2);
  /* Android/MIUI silently blocks programmatic blob downloads — the share
     sheet is the reliable path, download link only as fallback.
     Chrome/Android only shares whitelisted file types (.txt yes, .json no),
     hence .json.txt with text/plain */
  const name="zeichentrainer-"+new Date().toISOString().slice(0,10)+".json.txt";
  const file=new File([json],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:name}); await setSetting("lastExport",Date.now()); return; }
    catch(err){ if(err && err.name==="AbortError") return; }
  }
  try{
    const url=URL.createObjectURL(new Blob([json],{type:"text/plain"}));
    const a=document.createElement("a");
    a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); a.remove(); await setSetting("lastExport",Date.now());
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(err){ alert("Export failed: "+err); }
}
async function importData(e){
  const file=e.target.files && e.target.files[0];
  e.target.value="";
  if(!file) return;
  let data=null;
  try{ data=JSON.parse(await file.text()); }catch(err){}
  if(!data || data.app!=="zeichentrainer" || !Array.isArray(data.progress) || !Array.isArray(data.custom)){
    alert("Not a Zeichentrainer export (JSON)."); return;
  }
  /* exports before v118 carry the text as the key; the id is the text then */
  const prog=data.progress.filter(r=>r && typeof (r.id||r.c)==="string" && typeof r.due==="number").map(({id,c,...s})=>({id:id||c,...s}));
  const cust=data.custom.filter(r=>r && typeof r.c==="string" && typeof r.p==="string" && typeof r.m==="string").map(r=>({...r,id:r.id||r.c}));
  if(!prog.length && !cust.length){ alert("Export is empty — nothing to import."); return; }
  if(!confirm("Import "+prog.length+" progress entries and "+cust.length+" custom cards?\nExisting entries of the same cards will be overwritten.")) return;
  /* card images only exist locally — keep the existing image when overwriting */
  const merged=cust.map(r=>{ const ex=S.custom.find(x=>x.id===r.id); return ex?{...r,...(ex.img?{img:ex.img}:{}),...(ex.imgFull?{imgFull:ex.imgFull}:{})}:r; });
  try{
    await Promise.all([...prog.map(r=>idbPut("progress",r)), ...merged.map(r=>idbPut("custom",r))]);
  }catch(err){ alert("Import failed ("+err+")"); return; }
  prog.forEach(r=>{ const {id,...s}=r; S.progress[id]=s; });
  merged.forEach(r=>{ const i=S.custom.findIndex(x=>x.id===r.id); if(i>=0) S.custom[i]=r; else S.custom.push(r); });
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  S.mode="study"; render();
}

/* ---------- Reset ---------- */
async function resetAll(){
  if(!confirm("Delete progress, custom cards, and inbox photos?")) return;
  try{ await Promise.all([idbClear("progress"),idbClear("custom"),idbClear("inbox")]); }catch(e){}
  S.progress={}; S.custom=[]; S.inbox=[];
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  render();
}

/* ---------- Service worker & persistent storage ---------- */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").then(reg=>{
      reg.update();
      /* installed PWAs rarely check for updates on their own — check when brought to foreground */
      document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ reg.update().catch(()=>{}); mirrorCheck(); } });
      mirrorCheck(); tellMirror(); shellCheck();
    }).catch(()=>{});
    navigator.serviceWorker.addEventListener("message",e=>{
      const d=e.data||{};
      if(d.type==="refreshed"){ if(d.ok) location.reload(); return; }
      if(d.type!=="mirror-update") return;
      MIRROR.busy=false; MIRROR.last=d;
      const st=$("#mirror-status"); if(st) st.textContent=mirrorText();
      if(d.status==="updated") setTimeout(()=>location.reload(),600);
    });
    /* new version activated (skipWaiting+claim) → reload once automatically.
       First install (no controller before) does not trigger a reload. */
    let hadCtrl=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(!hadCtrl){ hadCtrl=true; shellCheck(); return; } /* first install: no reload, but the shell check can run now */
      location.reload();
    });
  });
}
/* ---------- mixed shell: the page and the script at different versions ----------
   GitHub Pages caches for ten minutes and jsDelivr per file, so after quick successive deploys a worker once served
   the v70 page with the v69 script (H: "I was on 70" — and the drag was missing). If the label and APP_V differ,
   the worker refills its cache from the server and the page reloads; at most once every ten minutes, no loops. */
const pageVersion=()=>+((($(".ver")||{}).textContent||"").match(/v(\d+)/)||[])[1]||0; /* the PWA vN label */
async function shellCheck(){
  const label=pageVersion();
  if(!label||label===APP_V) return;
  const ctrl=navigator.serviceWorker&&navigator.serviceWorker.controller; if(!ctrl||!navigator.onLine) return;
  const last=+S.settings.shellFixAt||0; if(Date.now()-last<600000) return;
  await setSetting("shellFixAt",Date.now());
  ctrl.postMessage({type:"refresh"});
}
/* ---------- updates without a VPN: ask the worker to pull a newer shell from a mirror ---------- */
const MIRROR_DEFAULT="https://cdn.jsdelivr.net/gh/henglicam/zeichentrainer@main/";
const MIRROR={busy:false,last:null,at:0};
function mirrorURL(){ const u=(S.settings.mirror||MIRROR_DEFAULT).trim(); return u.endsWith("/")?u:u+"/"; }
function mirrorCheck(force){
  if(!navigator.onLine||MIRROR.busy) return;
  if(!force && Date.now()-MIRROR.at<3600000) return; /* at most once an hour by itself */
  const ctrl=navigator.serviceWorker&&navigator.serviceWorker.controller; if(!ctrl) return;
  MIRROR.busy=true; MIRROR.at=Date.now();
  const local=pageVersion();
  ctrl.postMessage({type:"mirror-update",mirror:mirrorURL(),local});
  const st=$("#mirror-status"); if(st) st.textContent="Checking the mirror …";
  setTimeout(()=>{ if(MIRROR.busy){ MIRROR.busy=false; MIRROR.last={status:"error",error:"no answer from the mirror"}; const s2=$("#mirror-status"); if(s2) s2.textContent=mirrorText(); } },30000);
}
/* the worker needs the mirror for vendor files too — tell it on start and whenever the setting changes */
function tellMirror(){ const c=navigator.serviceWorker&&navigator.serviceWorker.controller; if(c) c.postMessage({type:"mirror",mirror:mirrorURL()}); }
/* the reader's files (OCR engine, language data, dictionary): cached once, then offline for good */
const OCR_FILES=["tesseract.min.js","worker.min.js","tesseract-core-simd-lstm.wasm.js","tesseract-core-simd-lstm.wasm","chi_sim.traineddata.gz","chi_tra.traineddata.gz","t2s.txt","s2t.txt","pinyin-pro.js","cedict.tsv.gz","strokes.txt.gz"];
async function ocrCached(){
  if(!window.caches) return 0;
  let n=0; for(const f of OCR_FILES){ try{ if(await caches.match(new URL("./vendor/"+f,location.href).href)) n++; }catch(e){} }
  return n;
}
async function renderOcrRow(){
  const st=$("#ocr-status"), btn=$("#ocr-btn"); if(!st||!btn) return;
  const n=await ocrCached(); if(!$("#ocr-status")) return;
  if(n===OCR_FILES.length){ st.textContent="Ready. Text recognition works offline and without a VPN."; btn.hidden=true; return; }
  st.textContent=`${OCR_FILES.length-n} of ${OCR_FILES.length} reader files are not on the phone yet (14 MB, once). They download on first use, or now.`;
  btn.hidden=false; btn.disabled=false; btn.textContent="Download";
  btn.onclick=async()=>{
    btn.disabled=true; let done=0;
    for(const f of OCR_FILES){ st.textContent=`Downloading ${f} (${done+1} of ${OCR_FILES.length}) …`;
      try{ const r=await fetch("./vendor/"+f); if(!r.ok) throw new Error(r.status); await r.blob(); done++; }
      catch(e){ st.textContent="Download failed at "+f+": no connection to github.io or the mirror."; btn.disabled=false; return; } }
    renderOcrRow();
  };
}
function mirrorText(){
  const d=MIRROR.last; if(!d) return "Checks github.io and the mirror on every start.";
  if(d.status==="current") return `Up to date. The mirror has v${d.remote}.`;
  if(d.status==="updated") return `Updated to v${d.remote} from the mirror. Reloading …`;
  return "The mirror is not reachable: "+(d.error||"");
}
/* MIUI/Chrome evicts storage of non-installed sites — request persistent storage */
if(navigator.storage && navigator.storage.persist){
  navigator.storage.persisted()
    .then(p=>p||navigator.storage.persist())
    .then(granted=>{
      S.persist=!!granted;
      const b=document.querySelector("#storage-status");
      if(b) b.textContent=granted?"Persistent on this phone.":"Not persistent yet. Install the app so the system keeps the data.";
    }).catch(()=>{});
}

boot();
