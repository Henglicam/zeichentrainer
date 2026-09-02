"use strict";
/* 识字 · Zeichentrainer — standalone PWA
   Persistence via IndexedDB (survives restarts). Camera inbox. Offline. */

/* ---------- Deck (in code, survives everything) ---------- */
/* No built-in deck any more (v33): every card comes from H's photos or the Add form. */

const NEW_PER_SESSION = 8;
const CJK = /[\u4e00-\u9fff]/;
const APP_V=75; /* must equal the PWA vN label in index.html — the boot check repairs a shell whose files are of different versions */
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
const DB_NAME="zeichentrainer", DB_VER=2;
let _db=null;
function openDB(){
  return new Promise((res,rej)=>{
    if(_db) return res(_db);
    const r=indexedDB.open(DB_NAME,DB_VER);
    r.onupgradeneeded=()=>{
      const db=r.result;
      if(!db.objectStoreNames.contains("progress")) db.createObjectStore("progress",{keyPath:"c"});
      if(!db.objectStoreNames.contains("custom"))   db.createObjectStore("custom",{keyPath:"c"});
      if(!db.objectStoreNames.contains("inbox"))    db.createObjectStore("inbox",{keyPath:"id"});
      if(!db.objectStoreNames.contains("settings")) db.createObjectStore("settings",{keyPath:"k"}); /* v2: opt-ins, keys */
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

/* ---------- State ---------- */
const S = { mode:"study", progress:{}, custom:[], inbox:[],
  queue:[], idx:0, revealed:false, done:0, ahead:false, ready:false,
  pendingImg:null, pendingFull:null, pendingUse:"crop", prefill:null, persist:null,
  detail:null, query:"", filterUnv:false, filterFlag:false, filterAi:false, settings:{}, single:null, saved:null, editing:null };

function deck(){ return S.custom; }
function buildQueue(includeAhead){
  const p=S.progress, t=today(), d=deck();
  const due = d.filter(x=>p[x.c] && p[x.c].due<=t).sort((a,b)=>p[a.c].due-p[b.c].due).map(x=>x.c);
  const fresh = d.filter(x=>!p[x.c]).slice(0,NEW_PER_SESSION).map(x=>x.c);
  let q=[...due,...fresh];
  if(includeAhead && q.length===0)
    q = d.filter(x=>p[x.c]).sort((a,b)=>p[a.c].due-p[b.c].due).slice(0,8).map(x=>x.c);
  return q;
}
const cardOf = c => deck().find(d=>d.c===c);
async function setSetting(k,v){ S.settings[k]=v; try{ await idbPut("settings",{k,v}); }catch(e){} }

/* ---------- Boot ---------- */
async function boot(){
  try{
    const [prog, cust, inb, sett] = await Promise.all([idbAll("progress"), idbAll("custom"), idbAll("inbox"), idbAll("settings").catch(()=>[])]);
    S.progress = {}; prog.forEach(r=>{ const {c,...s}=r; S.progress[c]=s; });
    sett.forEach(r=>{ S.settings[r.k]=r.v; });
    /* progress of cards that no longer exist (the built-in deck of v1–v32) is dropped */
    const have=new Set(cust.map(d=>d.c));
    for(const c of Object.keys(S.progress)) if(!have.has(c)){ delete S.progress[c]; idbDel("progress",c).catch(()=>{}); }
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

const CLR={verm:"#B23A2E",bone:"#EDE6D6",line:"#2E2E24"};
function reticleSVG(single,W=260,H=260){
  const tick=14,cx=W/2,cy=H/2;
  const cross = single ? `
    <line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="${CLR.verm}" stroke-width="1" stroke-dasharray="2 6" opacity="${S.revealed?0.5:0.16}"/>
    <line x1="0" y1="${cy}" x2="${W}" y2="${cy}" stroke="${CLR.verm}" stroke-width="1" stroke-dasharray="2 6" opacity="${S.revealed?0.5:0.16}"/>` : "";
  const corners=[[0,0,1,1],[W,0,-1,1],[0,H,1,-1],[W,H,-1,-1]].map(([x,y,dx,dy])=>
    `<g stroke="${CLR.bone}" stroke-width="1.25" opacity="0.8"><line x1="${x}" y1="${y}" x2="${x+dx*tick}" y2="${y}"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y+dy*tick}"/></g>`).join("");
  return `<svg width="${W}" height="${H}"><rect x="0.5" y="0.5" width="${W-1}" height="${H-1}" fill="none" stroke="${CLR.line}"/>${cross}${corners}</svg>`;
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
  if(S.mode==="cards") return S.editing?renderEdit(main,S.editing):S.detail?renderCardDetail(main,S.detail):renderCards(main);
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
    gloss:d.kind==="sign"?(d.gloss||[]).map(g=>g.w+" "+(g.m||"?")).join(" · "):undefined };
}
const AI_SYSTEM=`You review flashcards for an adult learning to read Chinese in Beijing. Cards come from OCR of photos (signs, menus, packaging), so the Chinese text may contain OCR slips, the pinyin is auto-generated and the meaning may be a crude word-by-word gloss.
For every card return the corrected card. Rules: "zh" = the Chinese text, fixed only if it is clearly an OCR slip (keep line breaks); "p" = pinyin with tone marks, correct for this context (多音字!), one space between syllables, " / " between lines; "m" = natural English meaning of the whole text as a sign or word (short, no explanations); "note" = one short sentence on what was wrong, or "ok"; "ok" = true when zh, pinyin and meaning were already right.
Answer with a JSON array only, one object per input card in the same order: [{"c":"<input c>","zh":"…","p":"…","m":"…","note":"…","ok":true|false}]. No prose, no code fences.`;
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
  }catch(err){ throw new Error("no connection (offline"+(pv==="claude"?", or the API is blocked — VPN?":", or this provider refuses calls from a browser — try another provider")+")"); }
  if(r.status===401||r.status===403) throw new Error("API key rejected ("+r.status+")");
  if(r.status===402) throw new Error("no credit left at "+AI_PROVIDERS[pv].name);
  if(!r.ok){ let t=""; try{ const j=await r.json(); t=(j.error&&(j.error.message||j.error))||j.message||""; }catch(e){} throw new Error("API error "+r.status+(t?": "+t:"")); }
  const data=await r.json();
  const raw=pv==="claude"?(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join(""):String(((data.choices||[])[0]||{}).message?.content||"");
  const text=raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,"");
  let arr; try{ arr=JSON.parse(text); }catch(e){ throw new Error("could not read the model's answer"); }
  if(!Array.isArray(arr)) throw new Error("unexpected answer");
  return arr.map(x=>({zh:String(x.zh||"").trim(),p:String(x.p||"").trim(),m:String(x.m||"").trim(),note:String(x.note||"").trim(),ok:!!x.ok,at:Date.now(),model}));
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
    const k=S.custom.findIndex(x=>x.c===d.c);
    if(k>=0) S.custom[k]=upd; else S.custom.push(upd);
    try{ await idbPut("custom",upd); }catch(e){} n++;
  }
  return n;
}
async function aiAccept(c){
  const d=cardOf(c); if(!d||!d.ai) return;
  const a=d.ai, upd={...d, p:a.p||d.p, m:a.m||d.m};
  delete upd.ai; delete upd.flag; delete upd.flagNote;
  upd.mt={...(upd.mt||{}), src:"llm", verified:true, pending:false}; delete upd.mt.suspect;
  const newC=a.zh&&CJK.test(a.zh)?a.zh.replace(/\r/g,""):c;
  if(newC!==c && deck().some(x=>x.c===newC)){ alert("“"+newC.replace(/\n/g," / ")+"” is already in the deck — merge by hand."); return; }
  await applyCardUpdate(c,upd,newC,true);
  if(S.detail===c) S.detail=upd.c;
  Object.keys(QSCARD).forEach(k=>{ if(QSCARD[k]===c) QSCARD[k]=upd.c; });
}
/* one tap for everything waiting: accept every suggestion (a rename that collides is left for a manual look) */
async function aiAcceptAll(){
  const list=deck().filter(d=>d.ai), skipped=[];
  for(const d of list){
    const a=d.ai, newC=a.zh&&CJK.test(a.zh)?a.zh.replace(/\r/g,""):d.c;
    if(newC!==d.c && deck().some(x=>x.c===newC)){ skipped.push(d.c.replace(/\n/g," / ")); continue; }
    await aiAccept(d.c);
  }
  if(skipped.length) alert("Left for a manual look (the corrected text is already in the deck): "+skipped.join(", "));
  return list.length-skipped.length;
}
async function aiDismiss(c){
  const d=cardOf(c); if(!d||!d.ai) return;
  const upd={...d}; delete upd.ai; if(upd.mt&&upd.mt.suspect){ upd.mt={...upd.mt}; delete upd.mt.suspect; } /* seen by a human */
  const k=S.custom.findIndex(x=>x.c===c); if(k>=0) S.custom[k]=upd; else S.custom.push(upd);
  try{ await idbPut("custom",upd); }catch(e){}
}
function aiBoxHTML(d){
  if(!d.ai) return "";
  const a=d.ai, chg=[];
  if(a.zh&&a.zh!==d.c) chg.push(`<div class="hanzi">${esc(a.zh).replace(/\n/g,"<br>")}</div>`);
  if(a.p&&a.p!==d.p) chg.push(`<div class="mono">${esc(a.p)}</div>`);
  if(a.m&&a.m!==d.m) chg.push(`<div>${esc(a.m)}</div>`);
  return `<div class="aibox"><div class="aihead">AI suggestion${a.ok&&!chg.length?": looks right":""}</div>
    ${chg.join("")}${a.note&&a.note.toLowerCase()!=="ok"?`<div class="ainote">${esc(a.note)}</div>`:""}
    <div class="aiacts"><button class="btn mini primary" data-aiok="${esc(d.c)}">${chg.length?"Accept":"Mark verified"}</button><button class="btn mini" data-aino="${esc(d.c)}">Dismiss</button></div></div>`;
}
function wireAi(root){
  (root||document).querySelectorAll("[data-aiok]").forEach(b=> b.onclick=async()=>{ b.disabled=true; await aiAccept(b.dataset.aiok); render(); });
  (root||document).querySelectorAll("[data-aino]").forEach(b=> b.onclick=async()=>{ await aiDismiss(b.dataset.aino); render(); });
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
  st.textContent=aiOn()?`on: ${AI_PROVIDERS[aiProvider()].name}, ${aiModel()}. Sends card text only, never photos`:"off — needs your own API key (DeepSeek, Qwen, GLM or Claude), text only";
  btn.textContent=aiOn()?"Settings":"Set up";
  run.hidden=!aiOn(); run.disabled=!q;
  run.textContent=q?`Ask AI about ${q} card${q>1?"s":""}`:"Nothing to review";
  const rs=$("#ai-runstatus"); if(rs) rs.textContent=q?`${fl} flagged, ${sp} uncertain reading${sp===1?"":"s"}, ${pd} pending translation${pd===1?"":"s"}`:"flag a card, or save a reading that looks uncertain";
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
    try{ const n=await aiReview(null,t=>{ rs.textContent=t; }); rs.textContent=`${n} suggestion${n===1?"":"s"} ready — open the cards (Cards → Review) to accept or dismiss`; }
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
  if(!info){ st.textContent="zh→en model not in this build yet (run the “Fetch zh→en translation model” action on GitHub)"; btn.hidden=true; return; }
  if(!nmtOn()){
    st.textContent=`zh→en neural model (Mozilla, ${mb} MB, downloaded once and cached like OCR). Used when there is no connection; online, the AI does it.`;
    setBtn(`Download ${mb} MB`,async()=>{
      await setSetting("nmt",true); btn.disabled=true; /* the button says the size — no extra question */
      try{ await nmtLoad(t=>{ st.textContent=t; }); st.textContent=`ready — loaded in ${(NMT.loadMs/1000).toFixed(1)} s`; }
      catch(err){ st.textContent="download failed: "+(err&&err.message||err); await setSetting("nmt",false); }
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
  const st=S.persist===true?"persistent on this device":S.persist===false?"local — the system may evict it; install the app to be safe":"checking…";
  main.innerHTML=`<div class="pane more">
    <div class="listhead">Your data</div>
    <div class="mrow"><div><div class="t">Export</div><div class="s">progress + cards, via the share sheet. ${backupNote()}</div></div><button class="btn mini" id="export">Export</button></div>
    <div class="mrow"><div><div class="t">Import</div><div class="s">a zeichentrainer-…json.txt file; same words are overwritten</div></div><button class="btn mini" id="import">Import</button></div>
    <div class="mrow"><div><div class="t">Flagged cards</div><div class="s">${deck().filter(d=>d.flag).length} flagged for review, share the list as text (e.g. with a teacher)</div></div><span class="btnrow"><button class="btn mini" id="show-flag">Show</button><button class="btn mini" id="share-flag">Share</button></span></div>
    <div class="listhead">Translation</div>
    <div class="mrow"><div><div class="t">Offline translation</div><div class="s" id="nmt-status">checking …</div></div><button class="btn mini" id="nmt-btn" hidden></button></div>
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
    <div class="mrow"><div><div class="t">Text recognition</div><div class="s" id="ocr-status">checking …</div></div><button class="btn mini" id="ocr-btn" hidden></button></div>
    <div class="listhead">Updates without a VPN</div>
    <div class="mrow"><div><div class="t">Mirror</div><div class="s" id="mirror-status">${esc(mirrorText())}</div></div><button class="btn mini" id="mirror-check">Check now</button></div>
    <div class="field"><label>Mirror address (a copy of the app reachable in China)</label><input id="mirror-url" class="mono" autocomplete="off" value="${esc(S.settings.mirror||MIRROR_DEFAULT)}"></div>
    <div class="mrow"><div><div class="t">Progress</div><div class="s">${statsLine()}</div></div></div>
    <div class="mrow"><div><div class="t">Photos</div><div class="s" id="shots-status">${esc(shotsNote())}</div></div>${oldShots().length?`<button class="btn mini" id="cleanshots">Delete ${oldShots().length}</button>`:""}</div>
    <div class="listhead">Danger zone</div>
    <div class="mrow"><div><div class="t">Reset</div><div class="s">deletes progress, custom cards and photos</div></div><button class="btn mini danger" id="reset">Reset</button></div>
    <div class="listhead">About</div>
    <div class="mrow"><div><div class="t">识字 Zeichentrainer</div><div class="s">${esc(ver)} · offline · everything stays on this phone</div></div></div>
  </div>`;
  $("#export").onclick=exportData;
  $("#import").onclick=()=>$("#imp").click();
  $("#share-flag").onclick=shareFlagged;
  $("#show-flag").onclick=()=>{ S.mode="cards"; S.detail=null; S.editing=null; S.query=""; S.filterUnv=false; S.filterAi=false; S.filterFlag=true; render(); };
  const cs=$("#cleanshots"); if(cs) cs.onclick=cleanupShots;
  $("#mirror-url").onchange=async e=>{ await setSetting("mirror",e.target.value.trim()); tellMirror(); };
  renderOcrRow();
  $("#mirror-check").onclick=()=>{ mirrorCheck(true); };
  renderNmtRow(); renderAiRow();
  $("#reset").onclick=resetAll;
}

function tagsHTML(d,isNew){
  return `<div class="tags"><span class="t">${esc(d.t||"")}</span>${d.flag?`<span class="f">⚑ review</span>`:""}<span class="${isNew?"n":"r"}">${isNew?"new":"review"}</span></div>`;
}
/* ---------- review flag ----------
   Any card can be flagged when the OCR text, pinyin or meaning looks odd and
   someone (a teacher, later maybe an online model) should check it. The flag
   lives on the card record. */
async function setFlag(c,on,note){
  const d=cardOf(c); if(!d) return;
  const upd={...d};
  if(on){ upd.flag=true; if(note!==undefined){ if(note) upd.flagNote=note; else delete upd.flagNote; } }
  else { delete upd.flag; delete upd.flagNote; }
  const i=S.custom.findIndex(x=>x.c===c);
  if(i>=0) S.custom[i]=upd; else S.custom.push(upd);
  try{ await idbPut("custom",upd); }catch(e){}
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
/* the photo on the front: the crop, or — after a tap on it — the whole photo (S.fullPic) */
function frontPic(d){
  const full=d.imgFull||(d.shot&&(S.inbox.find(x=>x.id===d.shot)||{}).blob);
  const blob=S.fullPic&&full?full:d.img; if(!blob) return "";
  return `<img class="signimg${S.fullPic&&full?" full":""}" data-pic="1" src="${URL.createObjectURL(blob)}" alt="photo">`;
}
function frontHTML(d){
  if(d.kind==="sign"){
    /* sign card: the picture is the exercise, text underneath wrapped only between words */
    const lines=d.c.split("\n");
    const longest=Math.max(...lines.map(glyphs));
    const W=Math.min(440,Math.max(260,(window.innerWidth||390)-32));
    const fs=Math.min(longest<=6?40:longest<=9?30:24,Math.floor((W-28)/longest));
    return `<div class="signfront">${frontPic(d)}
      <div class="signtext" style="font-size:${fs}px">${lines.map(l=>`<div>${esc(l)}</div>`).join("")}</div></div>`;
  }
  const single=glyphs(d.c)<=1;
  /* the photo is the cue — it belongs on the front, before reveal */
  const pic=frontPic(d);
  const lines=frontLines(d), {W,H,fs}=frontBox(lines,headFont(d.c));
  return `${pic}<div class="reticle" style="width:${W}px;height:${H}px">${reticleSVG(single,W,H)}<div class="glyph" style="font-size:${fs}px">${lines.map(esc).join("<br>")}</div></div>`;
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
function cleanSense(m){ return String(m||"").replace(/\[[^\]]*\]/g,"").replace(/\s*CL:[^;,)]*/g,"").replace(/\(\s*\)/g,"").replace(/\s{2,}/g," ").trim(); }
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
    ${d.mt&&!d.mt.verified?`<span class="flag">meaning ${d.mt.src==="nmt"?"from the offline translation":d.mt.src==="phrasebook"?"from the phrasebook":d.mt.src==="llm"?"from the online AI":d.mt.src==="dict"?"from the dictionary":"composed word by word"}, unverified${d.mt.pending?" (translation pending)":""}${d.mt.suspect?" (reading uncertain: "+esc(d.mt.suspect)+")":""}</span>`:""}
` : "";
  return `<div class="pin">${esc(d.p)}${sayBtn(d)}</div><div class="mean">${esc(d.m)}</div>${charsHTML(d)}
    ${d.kind==="sign"?glossBlock:wordBlock}`;
}
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
    main.innerHTML=`<div class="done">
      <div class="mark">净</div>
      <h2>All clear.</h2>
      <p>${S.ahead?"Pulled-forward round finished.":"Nothing due today. Come back tomorrow — or pull the next cards forward."}</p>
      <div class="badge" style="margin-bottom:18px">${statsLine()}</div>
      <button class="btn" id="ahead">Pull forward · next cards</button>
    </div>`;
    const a=$("#ahead"); if(a) a.onclick=()=>{ const q=buildQueue(true); if(q.length){S.queue=q;S.idx=0;S.done=0;S.ahead=true;S.revealed=false;render();} };
    return;
  }
  const c=S.queue[S.idx], d=cardOf(c), sched=S.progress[c]||null, isNew=!S.progress[c];
  let back="";
  if(S.revealed){
    const grds=[["again","Again"],["hard","Hard"],["good","Good"],["easy","Easy"]].map(([g,l])=>
      `<button class="grade" data-g="${g}"><span class="lbl">${l}</span><span class="iv">${previewInterval(sched,g)}</span></button>`).join("");
    back=`<div style="margin-top:26px">${backHTML(d)}${flagNoteHTML(d)}${aiBoxHTML(d)}<div class="grades">${grds}</div>
      <div class="backacts"><button class="del flagbtn${d.flag?" on":""}" id="flag">${d.flag?"⚑ Flagged for review · clear":"⚑ Flag for review"}</button><button class="del" id="edit-card">✎ Edit</button></div></div>`;
  } else {
    back=`<div class="hint">Tap the character to reveal${d.imgFull||d.shot?" · tap the photo for the whole picture":""}</div>`;
  }
  /* front: no tag row (theme / new / custom is noise while learning); tapping the photo or the character reveals */
  main.innerHTML=`<div class="card">
    ${S.single?`<div class="topline"><button class="del" id="back-cards">← Cards</button><span class="badge">testing from the list</span></div>`:""}
    <div class="front tap" id="reveal">${frontHTML(d)}</div>
    ${back}</div>`;
  /* tap on the photo: crop ⇄ whole photo; tap on the character: back on and off */
  const rv=$("#reveal"); if(rv) rv.onclick=e=>{ if(e.target.closest("[data-pic]")){ S.fullPic=!S.fullPic; render(); return; } S.revealed=!S.revealed; render(); };
  const bk=$("#back-cards"); if(bk) bk.onclick=endSingle;
  const fl=$("#flag"); if(fl) fl.onclick=async()=>{ await setFlag(c,!d.flag); render(); };
  const ed=$("#edit-card"); if(ed) ed.onclick=()=>{ S.editFrom="study"; S.editing=c; render(); };
  wireSay(); wireChars(d);
  wireAi();
  document.querySelectorAll(".grade").forEach(b=> b.onclick=()=>grade(b.dataset.g));
}

async function grade(g){
  const c=S.queue[S.idx], sched=S.progress[c]||null;
  const s=schedule(sched,g);
  S.progress[c]=s;
  try{ await idbPut("progress",{c,...s}); }catch(e){}
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
  const list=S.custom.slice().sort((a,b)=>(b.at||0)-(a.at||0)).map(d=>d.c);
  const next=list[list.indexOf(c)+1];
  if(!next){ endSingle(); return; }
  S.single=next; S.queue=[next]; S.idx=0; S.revealed=false; S.fullPic=false; render(); window.scrollTo({top:0});
}

/* ---------- Add ---------- */
function renderAdd(main){
  const curImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  const imgField=curImg?`<div class="field" id="f-imgfield"><label>Image (stays on this phone)</label>
      <div class="pimg"><img src="${URL.createObjectURL(curImg)}" alt="card image">
      <span class="imgacts">${S.pendingFull&&S.pendingImg?`<button class="del${S.pendingUse!=="full"?" on":""}" id="f-usecrop">CROP</button><button class="del${S.pendingUse==="full"?" on":""}" id="f-usefull">FULL PHOTO</button>`:""}<button class="del" id="f-noimg">Remove image</button></span></div></div>`:"";
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back-cards">← Cards</button></div>
    <div class="lead">Add a card by hand. Pinyin and meaning filled from OCR are unverified until you check them.</div>
    ${imgField}
    <div class="field"><label>Word</label><input id="f-word" class="hanzi big" placeholder="快门"></div>
    <div class="row">
      <div class="field narrow"><label>Pinyin</label><input id="f-pin" class="mono" placeholder="kuàimén"></div>
      <div class="field"><label>Meaning</label><input id="f-mean" placeholder="shutter"></div>
    </div>
    <div id="f-pinhint" class="err" style="display:none">Auto pinyin/meaning from OCR — unverified. Check the tones (多音字!) and adjust the meaning.</div>
    <div id="f-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="f-add">Add card</button>
    <div id="f-ok" class="ok" style="display:none"></div>
  </div>`;
  $("#f-add").onclick=addManual;
  $("#back-cards").onclick=()=>{ S.mode="cards"; S.detail=null; render(); };
  const ni=$("#f-noimg"); if(ni) ni.onclick=()=>{ S.pendingImg=null; S.pendingFull=null; renderAdd(main); };
  const uc=$("#f-usecrop"); if(uc) uc.onclick=()=>{ S.pendingUse="crop"; renderAdd(main); };
  const uf=$("#f-usefull"); if(uf) uf.onclick=()=>{ S.pendingUse="full"; renderAdd(main); };
  /* Draft survives tab switches (e.g. pick word → back to cropping) */
  if(S.prefill){
    S.draft={...(S.draft||{}), w:S.prefill.w||"", p:S.prefill.p||"", m:S.prefill.m||"", autoPin:!!S.prefill.p};
    S.prefill=null;
  }
  const d0=S.draft||{};
  $("#f-word").value=d0.w||""; $("#f-pin").value=d0.p||""; $("#f-mean").value=d0.m||"";
  if(d0.autoPin) $("#f-pinhint").style.display="";
  const saveDraft=()=>{ S.draft={ w:$("#f-word").value, p:$("#f-pin").value, m:$("#f-mean").value,
    autoPin:$("#f-pinhint").style.display!=="none" }; };
  ["f-word","f-pin","f-mean"].forEach(id=>$("#"+id).oninput=saveDraft);
}
/* ---------- Cards: library with photos, detail, single-card test, edit ---------- */
const THUMB={};
/* list thumbnail: the whole photo when the card has one (H), otherwise the crop */
function thumbBlob(d){ return d.imgFull||(d.shot&&(S.inbox.find(x=>x.id===d.shot)||{}).blob)||d.img; }
function thumbURL(d){ return THUMB[d.c]||(THUMB[d.c]=URL.createObjectURL(thumbBlob(d))); }
function dropThumb(c){ if(THUMB[c]){ URL.revokeObjectURL(THUMB[c]); delete THUMB[c]; } }
function cardStatus(d){
  const p=S.progress[d.c]; if(!p) return "";
  const days=Math.round((p.due-today())/DAY);
  return `<span class="st${days<=0?" due":""}">${days<=0?"due":"in "+days+" d"}</span>`;
}
function cardsListHTML(){
  const q=S.query.trim().toLowerCase();
  let list=S.custom.slice().sort((a,b)=>(b.at||0)-(a.at||0)); /* newest first */
  if(S.filterUnv) list=list.filter(d=>d.mt&&!d.mt.verified);
  if(S.filterFlag) list=list.filter(d=>d.flag);
  if(S.filterAi) list=list.filter(d=>d.ai);
  if(q) list=list.filter(d=>[d.c,d.p,d.m,d.w,d.wp,d.wm,d.flagNote].filter(Boolean).join(" ").toLowerCase().includes(q));
  const rows=list.map(d=>`<button class="crow" data-c="${esc(d.c)}">
      ${d.img?`<img class="thumb" src="${thumbURL(d)}" alt="">`:`<span class="thumb glyph">${esc([...d.c][0])}</span>`}
      <span class="ct"><span class="c">${esc(d.c.replace(/\n/g," / "))}</span><span class="p">${esc(d.p)}</span><span class="m">${esc(d.m)}</span></span>
      <span class="cs">${d.ai?'<span class="pill ai">AI</span>':""}${d.flag?'<span class="pill flagged">⚑ review</span>':""}${cardStatus(d)}</span></button>`).join("");
  const empty=S.custom.length?"No cards match.":"No cards yet — take a photo under Camera, or tap + New.";
  return {html:rows||`<div class="badge" style="margin-top:20px">${empty}</div>`, n:list.length};
}
function renderCards(main){
  const unv=S.custom.filter(d=>d.mt&&!d.mt.verified).length, flg=S.custom.filter(d=>d.flag).length, nAi=deck().filter(d=>d.ai).length;
  const {html,n}=cardsListHTML();
  main.innerHTML=`<div class="pane">
    <div class="cardsbar"><input id="q" type="search" placeholder="Search hanzi, pinyin, meaning" value="${esc(S.query)}" autocomplete="off"><button class="btn mini primary" id="newcard">+ New</button></div>
    ${nAi?`<div class="aibar"><span>${nAi} AI suggestion${nAi>1?"s":""} waiting</span><button class="btn mini primary" id="ai-acceptall">Accept all</button></div>`:""}
    <div class="chips"><span class="chipset"><button class="chip${S.filterFlag?" on":""}" id="chip-flag">⚑ Flagged (${flg})</button>${nAi?`<button class="chip${S.filterAi?" on":""}" id="chip-ai">AI (${nAi})</button>`:""}<button class="chip${S.filterUnv?" on":""}" id="chip-unv">Unverified (${unv})</button></span><span class="badge" id="cnt">${n} of ${deck().length}</span></div>
    <div class="clist" id="clist">${html}</div>
  </div>`;
  const wire=()=>{ document.querySelectorAll(".crow").forEach(b=> b.onclick=()=>{ S.detail=b.dataset.c; render(); }); };
  const refresh=()=>{ const r=cardsListHTML(); $("#clist").innerHTML=r.html; $("#cnt").textContent=`${r.n} of ${deck().length}`; wire(); };
  $("#q").oninput=e=>{ S.query=e.target.value; refresh(); };
  $("#chip-unv").onclick=()=>{ S.filterUnv=!S.filterUnv; render(); };
  $("#chip-flag").onclick=()=>{ S.filterFlag=!S.filterFlag; render(); };
  const ca=$("#chip-ai"); if(ca) ca.onclick=()=>{ S.filterAi=!S.filterAi; render(); };
  const aa=$("#ai-acceptall"); if(aa) aa.onclick=async()=>{ aa.disabled=true; await aiAcceptAll(); render(); };
  $("#newcard").onclick=()=>{ S.mode="add"; render(); };
  wire();
}
function renderCardDetail(main,c){
  const d=cardOf(c); if(!d){ S.detail=null; return renderCards(main); }
  const p=S.progress[c];
  const stat=p?`interval ${p.interval} d · ease ${p.ease.toFixed(2)} · ${p.reps} review${p.reps===1?"":"s"} · next ${new Date(p.due).toLocaleDateString("en-GB")}`:"not studied yet";
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">← Cards</button><span class="badge">${d.kind==="sign"?"sign card":"word card"}${d.mt&&!d.mt.verified?", unverified":""}${d.mt&&d.mt.pending?", translation pending":""}${d.mt&&d.mt.suspect?", reading uncertain":""}</span></div>
    <div class="card">${tagsHTML(d,!p)}${frontHTML(d)}<div style="margin-top:22px">${backHTML(d)}</div>${flagNoteHTML(d)}${aiBoxHTML(d)}</div>
    <div class="detailacts">
      <button class="btn primary" id="d-test">Test this card</button>
      <button class="btn" id="d-edit">Edit</button>
      <button class="btn${d.flag?" on":""}" id="d-flag">${d.flag?"⚑ Clear flag":"⚑ Flag for review"}</button>
      <button class="btn danger" id="d-del">Delete</button>
    </div>
    <div class="badge" style="margin-top:14px">${esc(stat)}</div>
  </div>`;
  $("#back").onclick=()=>{ S.detail=null; render(); };
  $("#d-test").onclick=()=>{
    S.saved={queue:S.queue,idx:S.idx,done:S.done,ahead:S.ahead};
    S.single=c; S.queue=[c]; S.idx=0; S.revealed=false; S.mode="study"; render();
  };
  $("#d-edit").onclick=()=>{ S.editing=c; render(); };
  $("#d-flag").onclick=async()=>{ await setFlag(c,!d.flag); render(); };
  wireSay(); wireChars(d);
  wireAi();
  const del=$("#d-del"); if(del) del.onclick=async()=>{
    if(!confirm("Delete “"+c.replace(/\n/g," / ")+"” and its progress?")) return;
    await delCustom(c); S.detail=null; render();
  };
}
function renderEdit(main,c){
  const d=cardOf(c); if(!d){ S.editing=null; S.editFrom=null; return render(); }
  const isSign=d.kind==="sign";
  let removeImg=false, aiApplied=false;
  const leave=newC=>{ /* back to where the edit started: study back or card detail */
    const from=S.editFrom; S.editing=null; S.editFrom=null;
    if(from==="study"){ S.mode="study"; S.revealed=true; } else { S.mode="cards"; if(newC) S.detail=newC; }
    render();
  };
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">← Back</button><span class="badge">edit</span></div>
    <div class="field"><label>${isSign?"Sign text, one line per row":"Word"}</label>
      <textarea id="e-word" class="hanzi" rows="${(isSign?d.c.split("\n"):frontLines(d)).length+1}">${esc(isSign?d.c:frontLines(d).join("\n"))}</textarea>
      <div class="badge" style="margin-top:4px">One line per line in the photo.</div></div>
    <div class="row">
      <div class="field narrow"><label>Pinyin</label><input id="e-pin" class="mono" value="${esc(d.p)}"></div>
      <div class="field"><label>Meaning</label><input id="e-mean" value="${esc(d.m)}"></div>
    </div>
    ${isSign?"":`<div class="field"><label>Context word, pinyin, meaning (optional)</label>
      <div class="row"><input id="e-w" class="hanzi" value="${esc(d.w||"")}" placeholder="学习"><input id="e-wp" class="mono" value="${esc(d.wp||"")}" placeholder="xuéxí"><input id="e-wm" value="${esc(d.wm||"")}" placeholder="to learn"></div></div>`}
    ${d.img?`<div class="field" id="e-imgfield"><label>Image (stays on this phone)</label><div class="pimg"><img src="${thumbURL(d)}" alt=""><button class="del" id="e-noimg">Remove image</button></div></div>`:""}
    <div class="field"><label class="check"><input type="checkbox" id="e-flag"${d.flag?" checked":""}> Flag for review (text, pinyin or meaning looks wrong)</label>
      <input id="e-note" value="${esc(d.flagNote||"")}" placeholder="Note for the reviewer (optional)"></div>
    ${aiOn()?`<div class="field"><button class="btn block" id="e-ai">Ask AI to check text, pinyin and meaning</button><div class="badge" id="e-aistatus" style="margin-top:6px"></div><div id="e-aibox" hidden class="aibox"></div></div>`:""}
    <div id="e-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="e-save">Save changes</button>
  </div>`;
  $("#back").onclick=()=>leave();
  /* the AI fills the fields in place; nothing is stored until Save */
  const ab=$("#e-ai"); if(ab) ab.onclick=async()=>{
    const st=$("#e-aistatus"), box=$("#e-aibox"); ab.disabled=true; box.hidden=true;
    const zh=$("#e-word").value, pin=$("#e-pin").value.trim(), mean=$("#e-mean").value.trim(), note=$("#e-note").value.trim();
    try{
      const [r]=await aiAsk([{kind:d.kind||"word",c:isSign?zh.split("\n").map(l=>l.trim()).filter(Boolean).join("\n"):zh.replace(/\s+/g,""),p:pin,m:mean,flagNote:note,gloss:d.gloss,mt:{src:"dict",verified:false,suspect:"please check"}}],t=>{ st.textContent=t; });
      if(r.zh&&CJK.test(r.zh)) $("#e-word").value=r.zh.replace(/\r/g,"");
      if(r.p) $("#e-pin").value=r.p;
      if(r.m) $("#e-mean").value=r.m;
      aiApplied=true; st.textContent="";
      box.hidden=false; box.innerHTML=`<div class="aihead">AI${r.ok?": looks right":" filled in its suggestion — check, then Save"}</div>${r.note&&r.note.toLowerCase()!=="ok"?`<div class="ainote">${esc(r.note)}</div>`:""}`;
    }catch(err){ st.textContent="AI: "+(err&&err.message||err); }
    ab.disabled=false;
  };
  const ni=$("#e-noimg"); if(ni) ni.onclick=()=>{ removeImg=true; $("#e-imgfield").remove(); };
  $("#e-save").onclick=async()=>{
    const fail=m=>{ const e=$("#e-err"); e.textContent=m; e.style.display=""; };
    let pin=$("#e-pin").value.trim(); const mean=$("#e-mean").value.trim();
    if(!pin||!mean) return fail("Pinyin and meaning are required.");
    /* the Chinese text itself may be corrected (OCR slip) — progress and images move with it */
    let newC=c;
    const we=$("#e-word");
    if(we){
      var wordLines=we.value.split("\n").map(l=>l.replace(/\s+/g,"")).filter(l=>CJK.test(l));
      newC=isSign?wordLines.join("\n"):wordLines.join("");
      if(!CJK.test(newC)) return fail("Please enter Chinese text.");
      if(newC!==c && deck().some(x=>x.c===newC)) return fail("“"+newC.replace(/\n/g," / ")+"” is already in the deck.");
    }
    const upd={...d, p:pin, m:mean}; delete upd.ex; delete upd.exp; delete upd.exm; /* example sentences were dropped in v41 */
    if(!isSign){ upd.w=$("#e-w").value.trim(); upd.wp=$("#e-wp").value.trim(); upd.wm=$("#e-wm").value.trim();
      if(!upd.w){ delete upd.w; delete upd.wp; delete upd.wm; } }
    if(removeImg){ delete upd.img; delete upd.imgFull; dropThumb(c); }
    if(upd.mt){ upd.mt={...upd.mt, verified:true, pending:false}; delete upd.mt.suspect; } /* a human edited it */
    if(aiApplied) upd.mt={...(upd.mt||{}), src:"llm", verified:true, pending:false};
    if($("#e-flag").checked){ upd.flag=true; const note=$("#e-note").value.trim(); if(note) upd.flagNote=note; else delete upd.flagNote; }
    else { delete upd.flag; delete upd.flagNote; }
    await applyCardUpdate(c,upd,newC,pin!==d.p,isSign?undefined:wordLines);
    leave(upd.c);
  };
}
/* persist an edited card; when the Chinese text changes (OCR slip), recompute
   pinyin/segmentation/gloss (unless pinyin was set by hand) and move progress,
   thumbnail and queue entries to the new key. */
async function applyCardUpdate(c,upd,newC,pinByHand,lines){
  const isSign=upd.kind==="sign";
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
        if(!pinByHand) upd.p=pinyinPro.pinyin(newC,{type:"array",toneType:"symbol"}).join(" ");
      }
    }catch(e){}
    if(S.progress[c]){ S.progress[newC]=S.progress[c]; delete S.progress[c];
      try{ await idbDel("progress",c); await idbPut("progress",{c:newC,...S.progress[newC]}); }catch(e){} }
    try{ await idbDel("custom",c); }catch(e){}
    if(THUMB[c]){ THUMB[newC]=THUMB[c]; delete THUMB[c]; }
    S.queue=S.queue.map(x=>x===c?newC:x); if(S.saved) S.saved.queue=S.saved.queue.map(x=>x===c?newC:x);
    if(S.single===c) S.single=newC;
  }
  if(lines && !isSign && (!newC||newC===c)){ const segs=segWithBreaks(lines); if(segs.length>1) upd.seg=segs; else delete upd.seg; }
  if(lines && !isSign) upd.lb="photo"; /* lines set by hand count as the photo's */
  const i=S.custom.findIndex(x=>x.c===c);
  if(i>=0) S.custom[i]=upd; else S.custom.push(upd);
  try{ await idbPut("custom",upd); }catch(e){}
  return upd;
}
async function addManual(){
  const word=$("#f-word").value.trim(), pin=$("#f-pin").value.trim(), mean=$("#f-mean").value.trim();
  const err=$("#f-err"), ok=$("#f-ok"); err.style.display="none"; ok.style.display="none";
  const fail=m=>{ err.textContent=m; err.style.display=""; };
  if(!CJK.test(word)) return fail("Please enter a Chinese word.");
  if(!pin||!mean) return fail("Pinyin and meaning are required.");
  if(deck().some(d=>d.c===word)) return fail("“"+word+"” is already in the deck.");
  const card={c:word,p:pin,m:mean,t:"Custom",at:Date.now()};
  if(S.pendingShot){ card.shot=S.pendingShot; S.pendingShot=null; }
  const chosenImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  if(chosenImg){ card.img=await jpegOf(chosenImg); }
  S.pendingImg=null; S.pendingFull=null;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false);
  ["f-word","f-pin","f-mean"].forEach(id=>$("#"+id).value="");
  const fi=$("#f-imgfield"); if(fi) fi.remove();
  $("#f-pinhint").style.display="none";
  S.draft=null;
  ok.textContent="“"+word+"” added."; ok.style.display="";
  setStats();
}
async function delCustom(c){
  S.custom=S.custom.filter(x=>x.c!==c);
  try{ await idbDel("custom",c); await idbDel("progress",c); }catch(e){}
  delete S.progress[c]; dropThumb(c);
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
      const base=new URL("./vendor/",location.href).href;
      const w=await Tesseract.createWorker("chi_sim",1,{
        workerPath:base+"worker.min.js",
        corePath:base+"tesseract-core-simd-lstm.wasm.js",
        langPath:base.replace(/\/$/,""),
        cacheMethod:"none", /* SW cache covers offline; tesseract's IndexedDB cache is a known corruption source */
        logger:m=>{ if(m.status==="recognizing text"&&_ocrLog) _ocrLog(Math.round(m.progress*100)); } /* one worker, many callers: the running job's handler */
      });
      _ocrWorker=w; return w;
    })().catch(err=>{ _ocrLoading=null; throw err; });
  }
  return _ocrLoading;
}

/* per-photo result (session only): characters with box + auto pinyin; tap to select */
const OCRRES={}, SELS={}, QSNOTE={}, AIFIX={}, QSCARD={}, SHOWBOX={}, READING={}; /* READING[id]: status text while the photo is being read */ /* SHOWBOX[id]: word boxes shown although the AI is live */ /* QSCARD[id] = card saved from this shot (AI suggestion shows under the photo) */ /* AIFIX[id][text] = AI check of an OCR selection before saving */
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
async function quickSave(id,w,p,m,grp,ai){
  const R=OCRRES[id]; if(!R) return;
  if(!m){ /* no dictionary meaning — the form is needed to fill it in */
    S.prefill={w,p,m:""}; S.mode="add"; render(); return;
  }
  if(deck().some(d=>d.c===w)){
    QSNOTE[id]=`“${w}” is already in the deck.`;
  }else{
    /* checked by the AI in the selection bar → verified; otherwise a dictionary prefill */
    const card={c:w,p,m,t:"Custom",at:Date.now(),shot:id,lb:"photo",mt:ai?{src:"llm",verified:true}:{src:"dict",verified:false}};
    /* doubtful OCR (low symbol confidence) → the online AI checks it automatically when enabled */
    const chars=R.flat.filter(c=>grp<0?SELS[id].has(c.i):c.g===grp);
    const why=ai?"":ocrDoubt(chars.map(c=>c.cf),m);
    if(why) card.mt.suspect=why;
    if(grp<0 && chars.map(c=>c.ch).join("")===w){ /* phrase: keep word boundaries so the card front never breaks inside a word */
      const segs=[]; let ln=null;
      R.flat.filter(c=>SELS[id].has(c.i)).forEach(c=>{
        if(ln!==null && c.ln!==ln) segs.push({g:-1,w:"\n"}); /* line break as in the photo */
        ln=c.ln;
        const last=segs[segs.length-1]; if(last&&last.g===c.g&&last.w!=="\n") last.w+=c.ch; else segs.push({g:c.g,w:c.ch}); });
      card.seg=segs.map(x=>x.w);
      card.gloss=segs.filter(x=>x.w!=="\n").map(x=>({w:x.w,p:pinyinPro.pinyin(x.w,{toneType:"symbol"}),m:bestSense(x.w)})); /* word-by-word for the back */
    }
    const img=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
    if(img) card.img=await jpegOf(img);
    if(S.pendingFull) card.imgFull=S.pendingFull; /* whole photo as context on the back */
    S.custom.push(card);
    try{ await idbPut("custom",card); }catch(e){}
    S.queue=buildQueue(false); QSCARD[id]=w;
    QSNOTE[id]=`“${w}” saved — ${esc(p)}. `+(ai?"Checked by the AI.":"Auto values, verify when in doubt.")+(card.mt.suspect?` Reading uncertain (${esc(card.mt.suspect)})${aiAutoOn()?", the AI will check it":""}.`:"");
    aiAutoSoon();
  }
  /* deselect this word's characters (phrase: everything) — other rows stay available */
  if(grp<0) SELS[id].clear(); else R.flat.forEach(c=>{ if(c.g===grp) SELS[id].delete(c.i); });
  setStats(); renderShots();
}
async function onOcr(id,region){
  /* region (optional): {blob,X,Y} — OCR only on the crop, boxes shifted
     back into full-image coordinates */
  const rec=S.inbox.find(s=>s.id===id); if(!rec) return;
  /* drop any previous result immediately — stale boxes over the photo read
     as wrong output while the new recognition is still running */
  delete OCRRES[id]; delete SELS[id];
  renderShots();
  const box=$("#ocr-"+id); if(!box) return;
  const status=t=>{ READING[id]=t; const b=$("#ocr-"+id); if(b) b.innerHTML=`<span class="badge">${esc(t)}</span>`; }; /* re-queried: a re-render must not swallow it */
  try{
    const w=await ocrWorker(status);
    status("recognizing …");
    /* crops are a single text block — PSM 6 is far more robust there than auto layout */
    await w.setParameters({tessedit_pageseg_mode:region?"6":"3"});
    _ocrLog=p=>status("recognizing … "+p+"%");
    const [{data},bmp]=await Promise.all([
      w.recognize(region?region.blob:rec.blob,{},{blocks:true,text:true}).finally(()=>{ _ocrLog=null; }),
      createImageBitmap(rec.blob)
    ]);
    const W=bmp.width,H=bmp.height; bmp.close();
    const dx=region?region.X:0, dy=region?region.Y:0;
    const lines=[];
    (data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>{
      const cs=[];
      (l.words||[]).forEach(wd=>(wd.symbols||[]).forEach(sy=>{
        /* confidence gate: photo clutter (fences, foliage) produces phantom
           characters with low certainty — drop them */
        if(CJK.test(sy.text) && sy.confidence>=35)
          cs.push({ch:sy.text,cf:sy.confidence,b:{x0:sy.bbox.x0+dx,y0:sy.bbox.y0+dy,x1:sy.bbox.x1+dx,y1:sy.bbox.y1+dy}});
      }));
      if(cs.length) lines.push(cs);
    })));
    if(!lines.length){ status("No Chinese characters recognized."); return; }
    let i=0, g=0; const flat=[];
    lines.forEach((cs,ln)=>{ cs.forEach(c=>{ c.ln=ln; });
      /* pinyin per line — pinyin-pro resolves 多音字 in word context */
      const ps=pinyinPro.pinyin(cs.map(c=>c.ch).join(""),{type:"array",toneType:"symbol"});
      cs.forEach((c,j)=>{ c.i=i++; c.py=ps[j]||""; flat.push(c); });
      /* dictionary word groups: tapping one character selects the whole word */
      segmentChars(cs).forEach(seg=>{ seg.forEach(c=>{ c.g=g; }); g++; });
    });
    OCRRES[id]={w:W,h:H,flat}; delete READING[id];
    /* a tight single-line frame IS the word or phrase the user wants — pre-select it */
    /* with the AI live the whole frame is the card — everything pre-selected, no boxes to tap */
    SELS[id]=new Set((lines.length===1||flat.length<=4||aiLive())?flat.map(c=>c.i):[]);
    delete QSNOTE[id];
    renderShots();
  }catch(err){ status("OCR failed: "+(err&&err.message||err)); }
}
function overlayHTML(id){
  const R=OCRRES[id]; if(!R) return "";
  if(aiLive() && !SHOWBOX[id]) return ""; /* the AI reads the text — no pinyin boxes on the photo */
  const sel=SELS[id];
  return R.flat.map(c=>{
    const st=`left:${(c.b.x0/R.w*100).toFixed(2)}%;top:${(c.b.y0/R.h*100).toFixed(2)}%;`+
             `width:${((c.b.x1-c.b.x0)/R.w*100).toFixed(2)}%;height:${((c.b.y1-c.b.y0)/R.h*100).toFixed(2)}%`;
    return `<button class="ovbox${sel.has(c.i)?" sel":""}" data-sid="${id}" data-i="${c.i}" style="${st}"><span class="py">${esc(c.py)}</span></button>`;
  }).join("");
}
function selbarHTML(id){
  const R=OCRRES[id]; if(!R) return "";
  const chars=R.flat.filter(c=>SELS[id].has(c.i));
  const note=QSNOTE[id]?`<div class="ok" style="margin:0 0 8px">${QSNOTE[id]} <button class="del" data-nextshot="1">Next photo</button></div>${qsAiBox(id)}`:"";
  if(!chars.length){
    return `${note}<span class="badge">Tap a word in the image — one tap selects the whole dictionary word.</span>${aiLive()&&!SHOWBOX[id]?`<button class="del" data-boxes="${id}">Show the word boxes</button>`:""}`;
  }
  /* selection can span several dictionary words — one row per word */
  const groups=[];
  chars.forEach(c=>{
    const last=groups[groups.length-1];
    if(last && last[0].g===c.g) last.push(c); else groups.push([c]);
  });
  /* inline AI check: the row shows the AI's text/pinyin/meaning (jade) and Save stores them as verified */
  const fixOf=w0=>{ const f=AIFIX[id]&&AIFIX[id][w0]; return f&&!f.err?f:null; };
  const aiPart=(w0,p0,m0)=>{
    const f=AIFIX[id]&&AIFIX[id][w0], busy=AIFIX[id]&&AIFIX[id]["~"+w0];
    if(busy) return `<span class="ainote">${esc(busy)}</span>`;
    if(!aiOn()) return "";
    const btn=`<button class="btn mini" data-aiq="${id}" data-w="${esc(w0)}" data-p="${esc(p0)}" data-m="${esc(m0)}">${f?"Ask again":"Ask AI"}</button>`;
    if(f&&!f.err) return `${btn}<span class="ainote">AI${f.zh&&f.zh!==w0?`: ${esc(w0)} → ${esc(f.zh)}`:""}${f.note&&f.note.toLowerCase()!=="ok"?` — ${esc(f.note)}`:" ✓ looks right"}</span>`;
    return `${btn}${f&&f.err?`<span class="ainote err">${esc(f.err)}</span>`:""}`;
  };
  const rows=groups.map(gr=>{
    const w0=gr.map(c=>c.ch).join("");
    const p0=pinyinPro.pinyin(w0,{type:"array",toneType:"symbol"}).join(" ");
    const m0=(DICT&&DICT.get(w0))||"";
    const f=fixOf(w0), w=f&&f.zh?f.zh:w0, p=f&&f.p?f.p:p0, m=f&&f.m?f.m:m0;
    return `<div class="selbar${f?" ai":""}"><span class="sw">${esc(w)}</span><span class="sp">${esc(p)}</span>
      ${m?`<span class="sm">${esc(m)}</span>`:`<span class="sm none">${DICT?"not in dictionary":"dictionary not loaded"}</span>`}
      <button class="btn mini" data-qs="${id}" data-g="${gr[0].g}" data-w="${esc(w)}" data-p="${esc(p)}" data-m="${esc(m)}" data-ai="${f?1:0}">Save</button>
      <button class="btn mini" data-mkcard="${esc(w)}" data-p="${esc(p)}" data-m="${esc(m)}">Edit…</button>${aiPart(w0,p0,m0)}</div>`;
  }).join("");
  const boxes=aiLive()?`<button class="del" style="margin-top:6px" data-boxes="${id}">${SHOWBOX[id]?"Hide the word boxes":"Pick words on the photo"}</button>`:"";
  if(groups.length<2) return `${note}${rows}${boxes}<button class="del" style="margin-top:6px" data-clearsel="${id}">clear selection</button>`;
  /* several words selected: the whole string is ONE card — meaning composed word by word */
  const pw0=chars.map(c=>c.ch).join("");
  const pp0=pinyinPro.pinyin(pw0,{type:"array",toneType:"symbol"}).join(" ");
  const pm0=groups.map(gr=>{
    const w=gr.map(c=>c.ch).join("");
    return w+" "+(bestSense(w)||"?");
  }).join(" · ");
  const pf=fixOf(pw0), pw=pf&&pf.zh?pf.zh:pw0, pp=pf&&pf.p?pf.p:pp0, pm=pf&&pf.m?pf.m:pm0;
  const phrase=`<div class="selbar phrase${pf?" ai":""}"><span class="sw">${esc(pw)}</span><span class="sp">${esc(pp)}</span>
      <span class="sm">${esc(pm)}</span>
      <button class="btn mini primary" data-qs="${id}" data-g="-1" data-w="${esc(pw)}" data-p="${esc(pp)}" data-m="${esc(pm)}" data-ai="${pf?1:0}">Save phrase</button>
      <button class="btn mini" data-mkcard="${esc(pw)}" data-p="${esc(pp)}" data-m="${esc(pm)}">Edit…</button>${aiPart(pw0,pp0,pm0)}</div>
    <div class="badge" style="margin:4px 0 6px">single words:</div>`;
  return `${note}${phrase}${rows}${boxes}<button class="del" style="margin-top:6px" data-clearsel="${id}">clear selection</button>`;
}

/* the AI's answer for the card just saved from this photo, with one-tap Accept */
function qsAiBox(id){ const c=QSCARD[id], d=c&&cardOf(c); return d&&d.ai?aiBoxHTML(d):""; }
/* AI check of the current OCR selection, right in the selection bar (no tab change) */
async function aiOverlayAsk(id,w,p,m){
  AIFIX[id]=AIFIX[id]||{}; if(AIFIX[id]["~"+w]) return;
  delete AIFIX[id][w]; AIFIX[id]["~"+w]="asking the AI …"; renderShots();
  try{
    const [r]=await aiAsk([{c:w,p,m,kind:"word",mt:{src:"dict",verified:false,suspect:"read from a photo by OCR"}}]);
    AIFIX[id][w]={zh:r.zh&&CJK.test(r.zh)?r.zh.replace(/\s+/g,""):w,p:r.p,m:r.m,note:r.note,ok:r.ok};
  }catch(err){ AIFIX[id][w]={err:err&&err.message||String(err)}; }
  delete AIFIX[id]["~"+w]; renderShots();
}
/* automatic: every selection is checked without a tap (a few hundred tokens per card —
   fractions of a fen at DeepSeek); debounced so tapping through words fires one request per text */
let _ovAuto=null;
function aiOverlayAuto(id){
  const R=OCRRES[id], sel=SELS[id]; if(!aiAutoOn()||!R||!sel||!sel.size) return;
  const chars=R.flat.filter(c=>sel.has(c.i)), w=chars.map(c=>c.ch).join("");
  if(AIFIX[id]&&(AIFIX[id][w]||AIFIX[id]["~"+w])) return;
  const single=new Set(chars.map(c=>c.g)).size===1;
  const m=single?((DICT&&DICT.get(w))||""):"";
  clearTimeout(_ovAuto);
  _ovAuto=setTimeout(()=>{ if(!OCRRES[id]||!SELS[id]) return;
    const p=pinyinPro.pinyin(w,{type:"array",toneType:"symbol"}).join(" "); aiOverlayAsk(id,w,p,m); },1200);
}

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
    e.preventDefault();
    clearTimeout(READ_TIMER[layer.dataset.id]); /* adjusting the frame — read after the next release */
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
  const r=await cropBlob(id);
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
async function cropOcr(id){
  const r=await cropBlob(id);
  if(!r) return; /* no frame yet — nothing to do */
  /* the framed area doubles as the card image — '-> Card' carries it along;
     the full photo stays available as context via the toggle in the Add form */
  const rec=S.inbox.find(x=>x.id===id);
  S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null;
  CROP=null; renderShots();
  onOcr(id,r);
}

/* ---------- Sign cards: phrasebook meaning + transcript editor ---------- */
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
    const hit=(SIGNS||[]).find(e=>raw.startsWith(e.zh,k));
    if(hit){ parts.push({w:hit.zh,p:hit.py,m:hit.en,ph:true}); k+=hit.zh.length; continue; }
    const rest=raw.slice(k).split(SIGN_PUNCT)[0]; let len=Math.min(8,rest.length)||1;
    while(len>1 && !(DICT&&DICT.has(rest.slice(0,len)))) len--;
    const w=rest.slice(0,len)||ch;
    parts.push({w,p:pinyinPro.pinyin(w,{type:"array",toneType:"symbol"}).join(" "),m:bestSense(w),ph:false});
    k+=w.length;
  }
  const words=parts.filter(x=>!x.punct);
  const full=words.length>0 && words.every(x=>x.ph);
  /* fully phrasebook-matched line reads as English; a composed line shows word + gloss for every part */
  const en=full?words.map(x=>x.m).join(" · "):words.map(x=>x.w+" "+(x.m||"?")).join(" · ");
  const py=pinyinPro.pinyin(words.map(x=>x.w).join(""),{type:"array",toneType:"symbol"}).join(" ");
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
  let best=0,bestV=-1;
  for(let a=-20;a<=20;a+=1){
    const r=a*Math.PI/180, c=Math.cos(r), sn=Math.sin(r), hist=new Float64Array(H*2+W*2), off=W;
    let n=0,sum=0;
    for(let i=0;i<xs.length;i+=step){ const yy=Math.round(ys[i]*c-xs[i]*sn)+off; if(yy>=0&&yy<hist.length){ hist[yy]++; n++; } }
    for(let i=0;i<hist.length;i++) sum+=hist[i]*hist[i];
    const v=sum/n; if(v>bestV){ bestV=v; best=a; }
  }
  /* refine to half degrees around the best */
  let fine=best,fineV=bestV;
  for(const a of [best-0.5,best+0.5]){
    const r=a*Math.PI/180, c=Math.cos(r), sn=Math.sin(r), hist=new Float64Array(H*2+W*2), off=W; let n=0,sum=0;
    for(let i=0;i<xs.length;i+=step){ const yy=Math.round(ys[i]*c-xs[i]*sn)+off; if(yy>=0&&yy<hist.length){ hist[yy]++; n++; } }
    for(let i=0;i<hist.length;i++) sum+=hist[i]*hist[i];
    if(sum/n>fineV){ fineV=sum/n; fine=a; }
  }
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
const READ_JPEG=0.95;
async function deskewBlob(blob,forced){ /* forced: rotate by this angle instead of estimating (the card crop follows the reading crop) */
  try{
    const bmp=await createImageBitmap(blob);
    const sc=Math.min(1,360/Math.max(bmp.width,bmp.height));
    const w=Math.max(1,Math.round(bmp.width*sc)), h=Math.max(1,Math.round(bmp.height*sc));
    const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
    const ctx=cv.getContext("2d",{willReadFrequently:true}); ctx.drawImage(bmp,0,0,w,h);
    const angle=forced!=null?forced:estimateSkew(ctx.getImageData(0,0,w,h),w,h);
    if(Math.abs(angle)<1.5){ bmp.close(); return {blob:await jpegOf(blob,READ_JPEG),angle:0}; }
    /* rotate the full crop back to horizontal; the corners are filled with the edge colour */
    const r=-angle*Math.PI/180, W=bmp.width, H=bmp.height;
    const nw=Math.round(Math.abs(W*Math.cos(r))+Math.abs(H*Math.sin(r))), nh=Math.round(Math.abs(W*Math.sin(r))+Math.abs(H*Math.cos(r)));
    const out=document.createElement("canvas"); out.width=nw; out.height=nh;
    const o=out.getContext("2d",{alpha:false}); /* opaque: the reader misreads a PNG that carries an alpha channel */
    const e=ctx.getImageData(1,1,1,1).data; o.fillStyle=`rgb(${e[0]},${e[1]},${e[2]})`; o.fillRect(0,0,nw,nh);
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
  const med=a=>{ a.sort((p,q)=>p-q); return a[a.length>>1]; }; const m=[med(ch[0]),med(ch[1]),med(ch[2])];
  const step=Math.max(1,Math.floor(h/40)), need=Math.max(2,Math.round(h/step*0.06)); /* ~6 % of the sampled rows */
  const ink=x=>{ let n=0; for(let y=0;y<h;y+=step){ const i=(y*W+x)*4; if(Math.abs(d[i]-m[0])+Math.abs(d[i+1]-m[1])+Math.abs(d[i+2]-m[2])>150) n++; } return n>=need; };
  const gap=Math.round(1.3*H); /* wider than any gap inside a line, punctuation included (、 to the next character measured at 0.9 H) */
  let x1=Math.min(W-1,Math.round(bx1)), last=x1, x=x1;
  while(x<W){ if(ink(x)) last=x; else if(x-last>gap) break; x++; }
  let x0=Math.max(0,Math.round(bx0)), first=x0; x=x0;
  while(x>=0){ if(ink(x)) first=x; else if(first-x>gap) break; x--; }
  return {x0:first,x1:last+1};
}
async function cropSign(id){
  const r=await cropBlob(id);
  if(!r) return; /* no frame yet — nothing to do */
  const rec=S.inbox.find(x=>x.id===id);
  S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null;
  delete OCRRES[id]; delete SELS[id]; delete SIGN[id]; delete QSNOTE[id]; /* the frame stays visible while reading */
  renderShots();
  const box=$("#ocr-"+id); if(!box) return;
  const status=t=>{ READING[id]=t; const b=$("#ocr-"+id); if(b) b.innerHTML=`<span class="badge">${esc(t)}</span>`; }; /* re-queried: a re-render must not swallow it */
  try{
    const w=await ocrWorker(status);
    await loadSigns().catch(()=>{}); /* phrasebook optional — falls back to word gloss */
    status("reading the text …");
    /* one reading pass: the lines with their symbols (text, confidence, box) */
    const readPass=async(blob)=>{
      await w.setParameters({tessedit_pageseg_mode:"6"});
      _ocrLog=p=>status("recognizing … "+p+"%");
      const {data}=await w.recognize(blob,{},{blocks:true,text:true}).finally(()=>{ _ocrLog=null; });
      const lines=[];
      (data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>{
        let syms=[];
        (l.words||[]).forEach(wd=>(wd.symbols||[]).forEach(sy=>{
          if(sy.confidence>=35 && (CJK.test(sy.text)||SIGN_PUNCT.test(sy.text))) syms.push({ch:sy.text,cf:sy.confidence,b:sy.bbox});
        }));
        const edge=x=>/[、，。：:,.]/.test(x.ch);
        while(syms.length&&edge(syms[0])) syms.shift();
        while(syms.length&&edge(syms[syms.length-1])) syms.pop();
        const t=syms.map(x=>x.ch).join("");
        if(CJK.test(t)) lines.push({t,cf:syms.filter(x=>CJK.test(x.ch)).map(x=>x.cf),bx:syms.map(x=>x.b?{x0:x.b.x0,y0:x.b.y0,x1:x.b.x1,y1:x.b.y1}:null)});
      })));
      return lines;
    };
    /* readings compete by confidence, a mild weight on length, and how much of the text forms dictionary words —
       garbage comes as many characters that are each plausible but form no words (加罗, 区和和, 二门花二人人) */
    const meanCf=ls=>{ const cf=ls.flatMap(l=>l.cf); return cf.length?cf.reduce((a,c)=>a+c,0)/cf.length:0; };
    const dictCover=ls=>{ if(!DICT) return 0.5; const ch=[...ls.map(l=>l.t).join("")].filter(c=>CJK.test(c)); if(!ch.length) return 0;
      let i=0, cov=0; while(i<ch.length){ let hit=0; for(let len=Math.min(4,ch.length-i);len>=2;len--){ if(DICT.has(ch.slice(i,i+len).join(""))){ hit=len; break; } } if(hit){ cov+=hit; i+=hit; } else i++; }
      return cov/ch.length; };
    const score=ls=>{ const n=ls.flatMap(l=>l.cf).length; if(!n) return 0; const frag=Math.min(1,(n/ls.length)/4); /* many one- and two-character lines = fragments */
      return meanCf(ls)*Math.pow(n,0.35)*frag*(0.75+0.5*dictCover(ls)); };
    const toJpeg=(bmp,scale)=>{ const cv=document.createElement("canvas"); cv.width=Math.max(1,Math.round(bmp.width*scale)); cv.height=Math.max(1,Math.round(bmp.height*scale));
      cv.getContext("2d",{alpha:false}).drawImage(bmp,0,0,cv.width,cv.height); return new Promise(res=>cv.toBlob(res,"image/jpeg",READ_JPEG)); };
    const scaleBoxes=(ls,k)=>ls.map(l=>({...l,bx:l.bx.map(b=>b&&{x0:b.x0/k,y0:b.y0/k,x1:b.x1/k,y1:b.y1/k})}));
    let dk=await deskewBlob(r.blob); if(dk.angle){ S.pendingImg=dk.blob; status(`straightened by ${Math.round(dk.angle)}°, reading the text …`); }
    const passes=[{lines:await readPass(dk.blob),img:dk.blob,angle:dk.angle,tightened:false}];
    /* Second look at a tight crop (v73). A loose frame with stripes, ribbons or a second label fools the tilt estimate and
       the block reader (H: a Maotai label read as one false character from the ribbon). Where the first pass found text
       in a small part of the frame, or was unsure, that part is cut out with one text height of margin, straightened on
       its own and read again — at two character heights and native size, because the model's output swings with scale
       even on a clean crop (measured: the same image read perfectly at 0.7× and as garbage at 1×). Best reading wins. */
    const boxes=passes[0].lines.flatMap(l=>l.bx).filter(Boolean); let cardBlob=null;
    if(boxes.length){
      const bmp=await createImageBitmap(dk.blob);
      const hs=boxes.map(b=>b.y1-b.y0).sort((a,b)=>a-b), H=hs[hs.length>>1];
      /* half a text height of the photo around the text, then one and a half of plain margin in the edge colour:
         the reader wants margins, but real margins bring the clutter back */
      /* the boxes' heights are right, their horizontal ends are not (they drift along the line and end early on the last
         character — H: 骑 cut in half), so one full text height sideways, half a height above and below */
      const mX=H, mY=H/2, pad=Math.round(1.5*H);
      const y0=Math.max(0,Math.min(...boxes.map(b=>b.y0))-mY), y1=Math.min(bmp.height,Math.max(...boxes.map(b=>b.y1))+mY);
      /* the line's ends come from the image, not from the boxes: the first pass may have lost a character altogether
         (H: 首都铁骑 read as 次都铁, and the crop ended after 铁) */
      const ext=textRowExtent(bmp,Math.min(...boxes.map(b=>b.x0)),Math.max(...boxes.map(b=>b.x1)),y0,y1,H);
      const x0=Math.max(0,ext.x0-mX), x1=Math.min(bmp.width,ext.x1+mX);
      const frac=((x1-x0)*(y1-y0))/(bmp.width*bmp.height); r.tightFrac=frac;
      if((frac<0.6||meanCf(passes[0].lines)<92) && x1-x0>=24 && y1-y0>=24){
        status("found text, reading it closely …");
        const cv=document.createElement("canvas"); cv.width=(x1-x0)+2*pad; cv.height=(y1-y0)+2*pad;
        const c2=cv.getContext("2d",{alpha:false,willReadFrequently:true});
        c2.drawImage(bmp,x0,y0,x1-x0,y1-y0,pad,pad,x1-x0,y1-y0);
        /* padding in the crop's median colour (the background) — a corner sample once hit a red ribbon and framed a white label in red */
        const d=c2.getImageData(pad,pad,x1-x0,y1-y0).data, ch=[[],[],[]]; for(let i=0;i<d.length;i+=4*7){ ch[0].push(d[i]); ch[1].push(d[i+1]); ch[2].push(d[i+2]); }
        const med=a=>{ a.sort((p,q)=>p-q); return a[a.length>>1]; }; c2.fillStyle=`rgb(${med(ch[0])},${med(ch[1])},${med(ch[2])})`;
        c2.fillRect(0,0,cv.width,pad); c2.fillRect(0,cv.height-pad,cv.width,pad); c2.fillRect(0,0,pad,cv.height); c2.fillRect(cv.width-pad,0,pad,cv.height);
        const tight=await new Promise(res=>cv.toBlob(res,"image/png")); /* lossless intermediate — deskewBlob hands the reader a JPEG */
        const dk2=await deskewBlob(tight), bmp2=await createImageBitmap(dk2.blob); r.tightBlob=dk2.blob; /* kept for diagnosis */
        const scales=[45/H,60/H,75/H,90/H].filter(k=>k<0.92); if(H<=110) scales.push(1); /* four character heights; native too while it is cheap */
        const tightLines=[];
        for(const k of scales){
          const lines=await readPass(k===1?dk2.blob:await toJpeg(bmp2,k));
          const sc=k===1?lines:scaleBoxes(lines,k);
          passes.push({lines:sc,img:dk2.blob,angle:dk2.angle,tightened:true,scale:k});
          tightLines.push(...sc);
        }
        bmp2.close();
        /* Merge line by line: every reading tends to get some line right and lose another, so the lines of all tight
           passes are clustered by their vertical band and the most confident reading of each band is kept (v75). */
        const band=l=>{ const bs=l.bx.filter(Boolean); return bs.length?{y0:Math.min(...bs.map(b=>b.y0)),y1:Math.max(...bs.map(b=>b.y1))}:null; };
        const lineScore=l=>score([l]);
        const clusters=[];
        for(const l of tightLines){ const b=band(l); if(!b) continue;
          let c=clusters.find(c=>{ const ov=Math.min(c.y1,b.y1)-Math.max(c.y0,b.y0); return ov>0.5*Math.min(c.y1-c.y0,b.y1-b.y0); });
          if(!c){ c={y0:b.y0,y1:b.y1,best:l}; clusters.push(c); }
          else if(lineScore(l)>lineScore(c.best)){ c.best=l; c.y0=b.y0; c.y1=b.y1; }
        }
        const merged=clusters.sort((a,b)=>a.y0-b.y0).map(c=>c.best).filter(l=>l.cf.length>2||meanCf([l])>=80); /* a short low-confidence stray is decoration */
        if(merged.length) passes.push({lines:merged,img:dk2.blob,angle:dk2.angle,tightened:true,scale:"merged"});
        /* the card image: the same area with a real margin of one text height all round, rotated like the reading crop */
        const cx0=Math.max(0,x0-H/2), cy0=Math.max(0,y0-H/2), cx1=Math.min(bmp.width,x1+H/2), cy1=Math.min(bmp.height,y1+H/2);
        const cc=document.createElement("canvas"); cc.width=cx1-cx0; cc.height=cy1-cy0;
        cc.getContext("2d",{alpha:false}).drawImage(bmp,cx0,cy0,cc.width,cc.height,0,0,cc.width,cc.height);
        const cardPng=await new Promise(res=>cc.toBlob(res,"image/png"));
        cardBlob=dk2.angle?(await deskewBlob(cardPng,dk2.angle)).blob:await jpegOf(cardPng,READ_JPEG);
      }
      bmp.close();
    }
    passes.sort((a,b)=>score(b.lines)-score(a.lines));
    r.passes=passes.map(p=>({s:Math.round(score(p.lines)),cf:Math.round(meanCf(p.lines)),cov:+dictCover(p.lines).toFixed(2),t:p.lines.map(l=>l.t).join("|"),k:typeof p.scale==="string"?p.scale:+(p.scale||1).toFixed(2),tight:p.tightened}));
    const best=passes[0], lines=best.lines, img=best.img, tightened=best.tightened; dk=best;
    if(tightened) S.pendingImg=cardBlob||best.img;
    if(!lines.length){ status("No Chinese characters recognized — frame the characters tightly and try again."); return; }
    /* img = the (straightened, maybe tightened) crop the text was read from, boxes = where each character sits in it: the picker shows the original */
    SIGN[id]={lines:lines.map(x=>x.t), orig:lines.map(x=>x.t), conf:lines.map(x=>x.cf), boxes:lines.map(x=>x.bx), img, angle:dk.angle||0, tightened, region:r};
    delete READING[id]; renderShots();
    if(aiAutoOn()) signAskAI(id); /* every reading is checked without a tap */
  }catch(err){ status("OCR failed: "+(err&&err.message||err)); }
}
/* ---------- fixing one misread character: tap it, pick a replacement ----------
   Candidates come from the dictionary (words that fit the neighbouring characters), from the AI
   (asked for that position), or are typed; a character can also be removed. */
let CHARFREQ=null;
function charCandidates(line,i){
  const chars=[...line]; if(!DICT||!CJK.test(chars[i]||"")) return [];
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
async function aiCharAlternatives(line,i){
  const key=S.settings.aiKey; if(!key) throw new Error("no API key");
  const pv=aiProvider(), model=aiModel(), chars=[...line];
  const sys="You correct OCR of Chinese signs, menus and packaging. Answer with a JSON array of single Chinese characters only, most likely first, no prose.";
  const user=`OCR read this line: "${line}". Character ${i+1} ("${chars[i]}") is probably misread. Give up to 4 likely correct characters for that position, judging from the context.`;
  let r;
  if(pv==="claude") r=await fetch(aiBase(),{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model,max_tokens:100,system:sys,messages:[{role:"user",content:user}]})});
  else r=await fetch(aiBase()+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+key},body:JSON.stringify({model,max_tokens:100,temperature:0,messages:[{role:"system",content:sys},{role:"user",content:user}]})});
  if(!r.ok) throw new Error("API error "+r.status);
  const data=await r.json();
  const raw=pv==="claude"?(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join(""):String(((data.choices||[])[0]||{}).message?.content||"");
  let arr=[]; try{ arr=JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,"")); }catch(e){ arr=[...raw].filter(ch=>CJK.test(ch)); }
  return [...new Set(arr.map(x=>String(x).trim()).filter(x=>[...x].length===1&&CJK.test(x)&&x!==chars[i]))].slice(0,4);
}
function charStripHTML(id,k){
  const sg=SIGN[id], line=sg.lines[k], same=sg.orig&&sg.orig[k]===line.trim(), cf=(same&&sg.conf&&sg.conf[k])||[];
  let ci=0;
  return `<div class="cstrip">${[...line].map((ch,i)=>{ const isC=CJK.test(ch); const c=isC?cf[ci++]:100;
    return `<button class="ck${isC&&c<OCR_DOUBT?" low":""}" data-ck="${k},${i}" data-sid="${id}" title="${isC&&c<100?Math.round(c)+"%":""}">${esc(ch)}</button>`; }).join("")}</div>`;
}
async function openCharPick(id,k,i,btn){
  const sg=SIGN[id]; if(!sg) return;
  const line=sg.lines[k], chars=[...line], ch=chars[i];
  document.querySelectorAll(".ck.on").forEach(b=>b.classList.remove("on")); btn.classList.add("on");
  let box=$("#ckpick-"+id); if(!box){ box=document.createElement("div"); box.className="ckpick"; box.id="ckpick-"+id; }
  btn.closest(".sline").appendChild(box);
  const apply=async(rep)=>{ const cs=[...sg.lines[k]]; if(rep===null) cs.splice(i,1); else cs[i]=rep; sg.lines[k]=cs.join(""); delete sg.ai; delete sg.aiErr; renderShots(); if(aiLive()) signAskAI(id); };
  const render=(dict,ai,aiBusy)=>{
    const seen=new Set();
    box.innerHTML=`<div class="ckhead"><canvas class="ckref" width="1" height="1" title="the character in the photo"></canvas><div class="badge">Replace <b class="hanzi">${esc(ch)}</b> with:</div></div>
      <div class="cands">${ai.filter(c=>!seen.has(c)&&seen.add(c)).map(c=>`<button class="ck ai" data-rep="${esc(c)}">${esc(c)}</button>`).join("")}${dict.filter(c=>!seen.has(c)&&seen.add(c)).map(c=>`<button class="ck" data-rep="${esc(c)}">${esc(c)}</button>`).join("")}${!dict.length&&!ai.length&&!aiBusy?`<span class="badge">no match — draw it or ask the AI</span>`:""}${aiBusy?`<span class="badge">asking the AI …</span>`:""}</div>
      <div class="ckacts"><button class="btn mini" id="ck-draw-${id}">Not here? Draw it</button>${aiOn()&&!ai.length&&!aiBusy?`<button class="btn mini" id="ck-ai-${id}">Ask AI</button>`:""}<span class="grow"></span><button class="del" id="ck-del-${id}">Remove</button><button class="del" id="ck-x-${id}">close</button></div>`;
    drawCharRef(box.querySelector(".ckref"),sg,k,i);
    box.querySelectorAll("[data-rep]").forEach(b=> b.onclick=()=>apply(b.dataset.rep));
    $("#ck-del-"+id).onclick=()=>apply(null);
    $("#ck-x-"+id).onclick=()=>{ box.remove(); btn.classList.remove("on"); };
    const ab=$("#ck-ai-"+id); if(ab) ab.onclick=()=>askAI(dict);
    $("#ck-draw-"+id).onclick=()=>openDrawSheet(id,k,i,apply);
  };
  const askAI=async(dict)=>{ render(dict,[],true); try{ const alts=await aiCharAlternatives(line,i); if(!box.isConnected) return; render(dict,alts,false); if(!alts.length) box.querySelector(".cands").insertAdjacentHTML("beforeend",`<span class="badge">the AI has no better idea</span>`); }catch(err){ if(!box.isConnected) return; render(dict,[],false); box.querySelector(".cands").insertAdjacentHTML("beforeend",`<span class="badge">AI: ${esc(err.message||err)}</span>`); } };
  render([],[],false);
  await loadDict().catch(()=>{});
  const dict=charCandidates(line,i);
  /* AI-first: while the AI is live it is asked at once, the dictionary candidates are the fallback */
  if(aiLive()) askAI(dict); else render(dict,[],false);
}
/* Where character i of line k sits in the reading crop. Tesseract's symbol boxes drift along a Chinese line (measured:
   from the third character on, a box marks the right part of one character plus the left of the next), but the line's
   overall extent and the box heights are right. So: the line's span from the first x0 to the last x1 is split evenly
   among the characters (signs are monospaced), the size and vertical position come from the median box height. */
function charBox(sg,k,i){
  const raw=(sg.boxes||[])[k]||[], n=[...(sg.lines[k]||"")].length;
  if(!raw.length||raw.length!==n||i>=n||n<2) return null; /* one character: its box alone is unreliable, the whole crop is shown */
  const ok=raw.filter(Boolean); if(!ok.length) return null;
  const med=a=>{ const t=a.slice().sort((p,q)=>p-q); return t[t.length>>1]; };
  const H=med(ok.map(b=>b.y1-b.y0)), cy=med(ok.map(b=>(b.y0+b.y1)/2));
  const x0=Math.min(...ok.map(b=>b.x0)), x1=Math.max(...ok.map(b=>b.x1)), cell=(x1-x0)/n;
  const cx=x0+(i+0.5)*cell, side=Math.max(H,Math.min(cell,1.4*H));
  return {x0:cx-side/2,y0:cy-side/2,x1:cx+side/2,y1:cy+side/2};
}
/* the tapped character as it looks in the photo — the original stays visible while drawing or typing (H: the keyboard hid it) */
async function drawCharRef(cv,sg,k,i,opt){ /* opt: {h: display height, side: neighbour fraction shown left/right} */
  if(!cv||!sg.img) { if(cv) cv.remove(); return; }
  try{
    const bmp=await createImageBitmap(sg.img);
    const bx=(sg.boxes||[])[k]||[];
    let b=charBox(sg,k,i);
    if(!b) b={x0:0,y0:0,x1:bmp.width,y1:bmp.height}; /* no usable geometry: the whole crop */
    const o=opt||{}, h=Math.max(8,b.y1-b.y0), w=Math.max(8,b.x1-b.x0);
    if(o.square){ /* a square around the character (side = 1.5 × its larger dimension), the photo's edge padded in INK */
      const side=Math.max(w,h)*1.5, cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2, sx=cx-side/2, sy=cy-side/2, N=o.h||600;
      cv.width=N; cv.height=N; const ctx=cv.getContext("2d"); ctx.fillStyle="#141410"; ctx.fillRect(0,0,N,N);
      const ix=Math.max(0,sx), iy=Math.max(0,sy), ex=Math.min(bmp.width,sx+side), ey=Math.min(bmp.height,sy+side), k=N/side;
      if(ex>ix&&ey>iy) ctx.drawImage(bmp,ix,iy,ex-ix,ey-iy,(ix-sx)*k,(iy-sy)*k,(ex-ix)*k,(ey-iy)*k);
      bmp.close(); return;
    }
    const padX=w*(o.side??0.6), padY=h*0.25; /* a bit of the neighbours for orientation */
    const sx=Math.max(0,b.x0-padX), sy=Math.max(0,b.y0-padY), sw=Math.min(bmp.width-sx,w+2*padX), sh=Math.min(bmp.height-sy,h+2*padY);
    const H=o.h||64, W=Math.max(48,Math.min(o.h?Math.round(o.h*2.6):200,Math.round(sw*H/sh)));
    cv.width=W*2; cv.height=H*2; cv.style.width=W+"px"; cv.style.height=H+"px";
    cv.getContext("2d").drawImage(bmp,sx,sy,sw,sh,0,0,cv.width,cv.height); bmp.close();
  }catch(e){ cv.remove(); }
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
    ctx.fillStyle="#141410"; ctx.fillRect(0,0,N,N); if(!v.bmp) return;
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
const DRAW_SIZE=720;
function openDrawSheet(id,k,i,apply){
  const sg=SIGN[id]; if(!sg) return;
  const ch=[...sg.lines[k]][i]||"";
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
  fitRef(); const refView=attachRefView(el.querySelector(".ckref"),sg,k,i); refView.ready.then(fitRef); el.refView=refView;
  el.fitRef=fitRef; window.addEventListener("resize",fitRef);
  const cv=el.querySelector(".pad"), ctx=cv.getContext("2d"), strokes=[]; let cur=null, seq=0;
  const status=t=>{ const st=el.querySelector("#ds-st"); if(st) st.textContent=t; };
  const close=()=>{ seq++; el.remove(); document.body.classList.remove("noscroll"); window.removeEventListener("resize",fitRef); refView.close(); };
  const paint=()=>{
    ctx.clearRect(0,0,cv.width,cv.height);
    ctx.strokeStyle="rgba(237,230,214,.16)"; ctx.lineWidth=2; ctx.setLineDash([10,10]);
    ctx.beginPath(); ctx.moveTo(cv.width/2,0); ctx.lineTo(cv.width/2,cv.height); ctx.moveTo(0,cv.height/2); ctx.lineTo(cv.width,cv.height/2); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle="#EDE6D6"; ctx.lineWidth=22; ctx.lineCap="round"; ctx.lineJoin="round";
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
      const alts=await recognizeStrokes(w,strokes,p=>{ if(my===seq) status("reading … "+p+"%"); }); if(my!==seq||!el.isConnected) return;
      const ctxc=SIGN[id]?charCandidates(SIGN[id].lines[k],i):[];
      const ranked=alts.slice().sort((a,b)=>(ctxc.includes(b)?1:0)-(ctxc.includes(a)?1:0)); /* what fits the neighbours first, otherwise the reader's order */
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
async function recognizeStrokes(w,strokes,log){
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
    (data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>(l.words||[]).forEach(wd=>(wd.symbols||[]).forEach(sy=>{
      for(const c of [...sy.text]) if(CJK.test(c)&&(seen.get(c)||0)<sy.confidence) seen.set(c,sy.confidence);
    })))));
  }
  return [...seen.entries()].sort((a,b)=>b[1]-a[1]).map(e=>e[0]).slice(0,5);
}
function signEditorHTML(id){
  const sg=SIGN[id]; if(!sg) return "";
  const rows=sg.lines.map((l,k)=>`<div class="sline">${charStripHTML(id,k)}<input class="hanzi" data-sid="${id}" data-sline="${k}" value="${esc(l)}" autocomplete="off"><div class="sp" id="sp-${id}-${k}"></div></div>`).join("");
  const low=sg.conf?Math.min(...sg.conf.flat().concat([100])):100;
  const doubt=!aiLive()&&low<OCR_DOUBT?` The reading looks uncertain (confidence ${Math.round(low)}%) — check the text.`:"";
  const head=sg.aiBusy?"Reading with the AI …":sg.ai?"Read and checked by the AI. Tap a character to change it.":`Text read from the photo. Tap a character to change it.${doubt}`;
  /* what the reader actually looked at (H: "the wrong section is read") — the straightened, maybe tightened crop */
  const nChars=sg.lines.join("").replace(/[^\u4e00-\u9fff]/g,"").length, meanCf=(sg.conf||[]).flat().reduce((a,c,_,arr)=>a+c/arr.length,0);
  const weak=nChars<=2&&meanCf<85?`<div class="err" style="margin:4px 0 8px">Only ${nChars} character${nChars===1?"":"s"} found — if the photo shows more, frame the characters tightly and drag a corner to read again.</div>`:"";
  if(sg.img&&!sg.imgURL) sg.imgURL=URL.createObjectURL(sg.img); /* once per reading — revoking on re-render broke the image still on screen */
  const readArea=sg.imgURL?`<div class="readarea"><img src="${sg.imgURL}" alt="area read"><div class="badge">Read from this area${sg.angle?` (straightened by ${Math.round(sg.angle)}°)`:""}${sg.tightened?", cut to the text":""}.</div></div>`:"";
  return `<div class="signed">${readArea}${weak}<div class="badge${sg.ai?" ai":""}" style="margin-bottom:8px">${head}</div>${rows}
    <div class="smean" id="smean-${id}"></div><div class="sgloss" id="sgloss-${id}"></div>
    <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" data-signsave="${id}">Save card</button>${aiOn()&&!sg.ai&&!sg.aiBusy?`<button class="btn mini" data-signai="${id}">Ask AI</button>`:""}<button class="del" data-splitwords="${id}">Split into words</button><button class="del" data-signcancel="${id}">cancel</button></div>
    ${sg.aiErr?`<div class="err" style="margin-top:6px">${esc(sg.aiErr)}</div>`:""}</div>`;
}
/* recompute pinyin / meaning / gloss for the current lines without re-rendering (keeps input focus) */
function signPreview(id){
  const sg=SIGN[id]; if(!sg) return;
  const res=sg.lines.map(l=>CJK.test(l)?lineMeaning(l):null);
  res.forEach((r,k)=>{ const el=$(`#sp-${id}-${k}`); if(el) el.textContent=r?r.py:""; });
  const live=res.filter(Boolean);
  const full=live.length>0 && live.every(r=>r.full);
  const mean=live.map(r=>r.en).filter(Boolean).join(" / ");
  /* an AI check applies as long as the text was not edited afterwards */
  if(sg.ai && sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)).join("\n")!==sg.ai.zh) delete sg.ai;
  const sm=$(`#smean-${id}`);
  if(sm) sm.innerHTML=sg.ai
    ?`<span class="badge ai">Checked by the AI${sg.ai.note&&sg.ai.note.toLowerCase()!=="ok"?": "+esc(sg.ai.note):""}</span><div class="mono" style="font-size:14px">${esc(sg.ai.p||"")}</div><div>${esc(sg.ai.m)||"—"}</div>`
    :`<span class="badge">Meaning ${full?"from the phrasebook":"composed word by word"}, unverified</span><div>${esc(mean)||"—"}</div>`;
  const gl=$(`#sgloss-${id}`); if(gl) gl.innerHTML=sg.ai?"":live.flatMap(r=>r.gloss).map(g=>`<span class="w">${esc(g.w)}</span><span class="p">${esc(g.p)}</span><span>${esc(g.m||"?")}</span>`).join("");
  sg.res=res; sg.full=full; sg.mean=mean;
  if(!sg.ai && !(aiLive()&&!sg.aiErr)) signTranslate(id); /* offline model only as fallback */
}
/* ask the online AI about the transcript right here; the corrected text lands in the editor */
async function signAskAI(id){
  const sg=SIGN[id]; if(!sg||sg.aiBusy) return;
  signPreview(id);
  const lines=sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)); if(!lines.length) return;
  sg.aiBusy="asking the AI …"; delete sg.aiErr; renderShots();
  sg.aiPromise=(async()=>{ try{
    const c=lines.join("\n"), res=(sg.res||[]).filter(Boolean);
    const [r]=await aiAsk([{kind:"sign",c,p:res.map(x=>x.py).join(" / "),m:sg.mean||"",gloss:res.flatMap(x=>x.gloss),mt:{src:"gloss",verified:false,suspect:"read from a photo by OCR"}}]);
    if(!SIGN[id]) return;
    let zh=r.zh&&CJK.test(r.zh)?r.zh.replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean).join("\n"):c;
    zh=recutLines(zh,lines); /* the model often drops the line breaks — the photo's lines win */
    sg.lines=zh.split("\n"); sg.ai={zh,p:r.p,m:r.m,note:r.note,ok:r.ok};
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
    const r=await signMeaning(lines,t=>{ const el=$(`#smean-${id} .badge`); if(el) el.textContent=t; });
    if(sg.tok!==tok||!SIGN[id]) return;
    sg.tr=r;
    const box=$(`#smean-${id}`);
    if(box) box.innerHTML=`<span class="badge">Meaning ${r.src==="nmt"?"from the offline translation":r.src==="phrasebook"?"from the phrasebook":"composed word by word"}, unverified</span><div>${esc(r.m)||"—"}</div>`;
  }catch(err){ if(sm) sm.querySelector(".badge").textContent="Offline translation failed, meaning composed word by word"; }
}
async function saveSign(id){
  const sg=SIGN[id]; if(!sg) return;
  if(sg.aiPromise){ const b=document.querySelector(`[data-signsave="${id}"]`); if(b){ b.disabled=true; b.textContent="Waiting for the AI …"; } await sg.aiPromise; if(!SIGN[id]) return; }
  signPreview(id);
  const keep=sg.lines.map((l,k)=>({l:l.trim(),r:sg.res[k]})).filter(x=>x.r);
  if(!keep.length) return;
  const c=keep.map(x=>x.l).join("\n");
  if(deck().some(d=>d.c===c)){ sg.aiErr="This text is already in the deck."; renderShots(); return; }
  /* meaning: AI check (if done here) → phrasebook → offline translation (if enabled) → word gloss (then pending) */
  let mt={src:sg.full?"phrasebook":"gloss",verified:false,pending:!sg.full}, mean=sg.mean||"", pin=keep.map(x=>x.r.py).join(" / ");
  if(sg.ai && c===sg.ai.zh){ mean=sg.ai.m||mean; pin=sg.ai.p||pin; mt={src:"llm",verified:true,pending:false}; }
  else if(!sg.full && nmtOn() && !(aiLive()&&!sg.aiErr)){ /* no connection (or AI failed): offline model */
    const btn=document.querySelector(`[data-signsave="${id}"]`); if(btn){ btn.disabled=true; btn.textContent="Translating …"; }
    try{ const r=await signMeaning(keep.map(x=>x.l)); mean=r.m||mean; mt={src:r.src,verified:false,pending:r.pending}; }catch(e){}
  }
  /* doubtful OCR: low confidence on a line H did not correct, or words the dictionary does not know */
  const cfs=sg.lines.flatMap((l,k)=>(sg.orig&&sg.orig[k]===l.trim()&&sg.conf&&sg.conf[k])||[]);
  const unknown=keep.flatMap(x=>x.r.gloss.filter(g=>!g.ph&&!g.m).map(g=>g.w));
  const why=mt.src==="llm"?"":ocrDoubt(cfs,null,unknown); if(why) mt.suspect=why;
  /* a short single line is a word card (reticle front); anything longer is a sign card */
  const word=keep.length===1 && glyphs(c)<=4;
  const card=word
    ? { c, p:pin, m:mean, t:"Custom", at:Date.now(), shot:id, lb:"photo", mt, ...(keep[0].r.segs.filter(x=>CJK.test(x)).length>1?{seg:keep[0].r.segs.filter(x=>CJK.test(x)), gloss:keep[0].r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))}:{}) }
    : { kind:"sign", c, p:pin, m:mean, t:"Sign", at:Date.now(), shot:id,
        segs:keep.map(x=>x.r.segs), gloss:keep.flatMap(x=>x.r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))), mt };
  if(S.pendingImg) card.img=await jpegOf(S.pendingImg);
  if(S.pendingFull) card.imgFull=S.pendingFull;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false); QSCARD[id]=c;
  delete SIGN[id]; if(CROP&&CROP.id===id) CROP=null; /* saved — the frame has done its job */
  QSNOTE[id]=`Card saved — ${esc(c.replace(/\n/g," / "))}, ${mt.src==="llm"?"checked by the AI":mt.src==="nmt"?"meaning from the offline translation":mt.src==="phrasebook"?"meaning from the phrasebook":"meaning composed word by word"}${mt.src==="llm"?"":" (unverified"+(mt.pending?", translation pending":"")+")"}.`+(mt.suspect?` Reading uncertain (${esc(mt.suspect)})${aiAutoOn()?", the AI will check it":""}.`:"");
  aiAutoSoon();
  setStats(); renderShots();
}
async function confirmCard(c){
  const d=S.custom.find(x=>x.c===c); if(!d||!d.mt) return;
  d.mt.verified=true; d.mt.pending=false; delete d.mt.suspect;
  try{ await idbPut("custom",d); }catch(e){}
  if(S.mode==="cards") render();
}

/* ---------- Kamera / Inbox ---------- */
function renderInbox(main){
  main.innerHTML=`<div class="pane">
    <div class="lead">Photos stay on this phone. Frame the text and tap Read — the card is made for you.</div>
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
          ${cropping?"":overlayHTML(s.id)}
          ${cropping?`<div class="croplayer" data-id="${s.id}"><div class="croprect"${cropRectStyle()}><div class="h tl"></div><div class="h tr"></div><div class="h bl"></div><div class="h br"></div></div></div>`:""}
        </div>
        <div class="meta"><span class="ts">${dt}</span><span class="acts">${cropping
          ?`<button class="del" data-cropcancel="${s.id}">CANCEL</button>`
          :`<button class="ocr-btn" data-crop="${s.id}">CROP</button><button class="del" data-del="${s.id}">delete</button>`}</span></div>
        <div class="ocr" id="ocr-${s.id}">${SIGN[s.id]?signEditorHTML(s.id):OCRRES[s.id]?selbarHTML(s.id):READING[s.id]?`<span class="badge">${esc(READING[s.id])}</span>`:cropping
          ?`<span class="badge">Draw a frame with your finger over the text — corners resize it, dragging inside moves it.</span>`
          :QSNOTE[s.id]?`<div class="ok" style="margin:0">${QSNOTE[s.id]} <button class="del" data-nextshot="1">Next photo</button></div>${qsAiBox(s.id)}`:""}</div>
      </div>`;
    }).join("");
  box.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>delShot(b.dataset.del));
  box.querySelectorAll("[data-nextshot]").forEach(b=> b.onclick=()=>$("#cam").click());
  box.querySelectorAll("[data-crop]").forEach(b=> b.onclick=()=>{ CROP={id:b.dataset.crop,rect:null}; renderShots(); });
  box.querySelectorAll("[data-cropok]").forEach(b=> b.onclick=()=>cropOk(b.dataset.cropok));
  box.querySelectorAll("[data-cropocr]").forEach(b=> b.onclick=()=>cropOcr(b.dataset.cropocr));
  box.querySelectorAll("[data-cropcancel]").forEach(b=> b.onclick=()=>{ const id=b.dataset.cropcancel; clearTimeout(READ_TIMER[id]); CROP=null; delete SIGN[id]; delete READING[id]; renderShots(); });
  box.querySelectorAll(".ovbox").forEach(b=> b.onclick=()=>{
    const id=b.dataset.sid, sel=SELS[id], i=+b.dataset.i;
    const ch=OCRRES[id].flat.find(c=>c.i===i);
    const grp=OCRRES[id].flat.filter(c=>c.g===ch.g);
    const on=sel.has(i);
    grp.forEach(c=>{ on?sel.delete(c.i):sel.add(c.i); });
    renderShots();
  });
  box.querySelectorAll("[data-mkcard]").forEach(b=> b.onclick=()=>{
    S.prefill={w:b.dataset.mkcard,p:b.dataset.p,m:b.dataset.m||""};
    S.mode="add"; render();
  });
  box.querySelectorAll("[data-clearsel]").forEach(b=> b.onclick=()=>{ SELS[b.dataset.clearsel].clear(); SHOWBOX[b.dataset.clearsel]=true; renderShots(); });
  box.querySelectorAll("[data-boxes]").forEach(b=> b.onclick=()=>{ SHOWBOX[b.dataset.boxes]=!SHOWBOX[b.dataset.boxes]; renderShots(); });
  box.querySelectorAll("[data-qs]").forEach(b=> b.onclick=()=>quickSave(b.dataset.qs,b.dataset.w,b.dataset.p,b.dataset.m,+b.dataset.g,b.dataset.ai==="1"));
  box.querySelectorAll("[data-aiq]").forEach(b=> b.onclick=()=>aiOverlayAsk(b.dataset.aiq,b.dataset.w,b.dataset.p,b.dataset.m));
  box.querySelectorAll("[data-signai]").forEach(b=> b.onclick=()=>signAskAI(b.dataset.signai));
  Object.keys(OCRRES).forEach(aiOverlayAuto);
  wireAi(box);
  box.querySelectorAll(".croplayer").forEach(wireCrop);
  box.querySelectorAll("[data-ck]").forEach(b=> b.onclick=()=>{ const [k,i]=b.dataset.ck.split(",").map(Number); openCharPick(b.dataset.sid,k,i,b); });
  box.querySelectorAll("[data-sline]").forEach(inp=> inp.oninput=()=>{
    const sg=SIGN[inp.dataset.sid]; if(!sg) return;
    sg.lines[+inp.dataset.sline]=inp.value; signPreview(inp.dataset.sid);
  });
  box.querySelectorAll("[data-signsave]").forEach(b=> b.onclick=()=>saveSign(b.dataset.signsave));
  box.querySelectorAll("[data-splitwords]").forEach(b=> b.onclick=()=>{ const id=b.dataset.splitwords, sg=SIGN[id]; if(!sg||!sg.region) return;
    delete SIGN[id]; SHOWBOX[id]=true; if(CROP&&CROP.id===id) CROP=null; /* the boxes need the taps */ renderShots(); onOcr(id,sg.region); });
  box.querySelectorAll("[data-signcancel]").forEach(b=> b.onclick=()=>{ const id=b.dataset.signcancel; delete SIGN[id]; if(CROP&&CROP.id===id) CROP=null; renderShots(); });
  Object.keys(SIGN).forEach(signPreview);
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
  delete OCRRES[id]; delete SELS[id];
  if(CROP && CROP.id===id) CROP=null;
  renderShots(); setStats();
}

/* ---------- Export / import (device migration; photos stay local) ---------- */
async function exportData(){
  const data={ app:"zeichentrainer", version:1, exported:new Date().toISOString(),
    progress:Object.entries(S.progress).map(([c,s])=>({c,...s})),
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
  const prog=data.progress.filter(r=>r && typeof r.c==="string" && typeof r.due==="number");
  const cust=data.custom.filter(r=>r && typeof r.c==="string" && typeof r.p==="string" && typeof r.m==="string");
  if(!prog.length && !cust.length){ alert("Export is empty — nothing to import."); return; }
  if(!confirm("Import "+prog.length+" progress entries and "+cust.length+" custom cards?\nEntries for the same characters will be overwritten.")) return;
  /* card images only exist locally — keep the existing image when overwriting */
  const merged=cust.map(r=>{ const ex=S.custom.find(x=>x.c===r.c); return ex?{...r,...(ex.img?{img:ex.img}:{}),...(ex.imgFull?{imgFull:ex.imgFull}:{})}:r; });
  try{
    await Promise.all([...prog.map(r=>idbPut("progress",r)), ...merged.map(r=>idbPut("custom",r))]);
  }catch(err){ alert("Import failed ("+err+")"); return; }
  prog.forEach(r=>{ const {c,...s}=r; S.progress[c]=s; });
  merged.forEach(r=>{ const i=S.custom.findIndex(x=>x.c===r.c); if(i>=0) S.custom[i]=r; else S.custom.push(r); });
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
async function shellCheck(){
  const label=+((($(".ver")||{}).textContent||"").match(/v(\d+)/)||[])[1]||0;
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
  const local=+((($(".ver")||{}).textContent||"").match(/v(\d+)/)||[])[1]||0;
  ctrl.postMessage({type:"mirror-update",mirror:mirrorURL(),local});
  const st=$("#mirror-status"); if(st) st.textContent="checking the mirror …";
  setTimeout(()=>{ if(MIRROR.busy){ MIRROR.busy=false; MIRROR.last={status:"error",error:"no answer from the mirror"}; const s2=$("#mirror-status"); if(s2) s2.textContent=mirrorText(); } },30000);
}
/* the worker needs the mirror for vendor files too — tell it on start and whenever the setting changes */
function tellMirror(){ const c=navigator.serviceWorker&&navigator.serviceWorker.controller; if(c) c.postMessage({type:"mirror",mirror:mirrorURL()}); }
/* the reader's files (OCR engine, language data, dictionary): cached once, then offline for good */
const OCR_FILES=["tesseract.min.js","worker.min.js","tesseract-core-simd-lstm.wasm.js","tesseract-core-simd-lstm.wasm","chi_sim.traineddata.gz","pinyin-pro.js","cedict.tsv.gz"];
async function ocrCached(){
  if(!window.caches) return 0;
  let n=0; for(const f of OCR_FILES){ try{ if(await caches.match(new URL("./vendor/"+f,location.href).href)) n++; }catch(e){} }
  return n;
}
async function renderOcrRow(){
  const st=$("#ocr-status"), btn=$("#ocr-btn"); if(!st||!btn) return;
  const n=await ocrCached(); if(!$("#ocr-status")) return;
  if(n===OCR_FILES.length){ st.textContent="ready — text recognition works offline and without a VPN"; btn.hidden=true; return; }
  st.textContent=`${OCR_FILES.length-n} of ${OCR_FILES.length} files not on the phone yet (≈12 MB once). Downloads by itself on first use, or now:`;
  btn.hidden=false; btn.disabled=false; btn.textContent="Download";
  btn.onclick=async()=>{
    btn.disabled=true; let done=0;
    for(const f of OCR_FILES){ st.textContent=`downloading ${f} (${done+1}/${OCR_FILES.length}) …`;
      try{ const r=await fetch("./vendor/"+f); if(!r.ok) throw new Error(r.status); await r.blob(); done++; }
      catch(e){ st.textContent="download failed at "+f+" — no connection to github.io or the mirror"; btn.disabled=false; return; } }
    renderOcrRow();
  };
}
function mirrorText(){
  const d=MIRROR.last; if(!d) return "checks github.io and the mirror on every start";
  if(d.status==="current") return `up to date (mirror has v${d.remote})`;
  if(d.status==="updated") return `updated to v${d.remote} from the mirror — reloading`;
  return "mirror not reachable: "+(d.error||"");
}
/* MIUI/Chrome evicts storage of non-installed sites — request persistent storage */
if(navigator.storage && navigator.storage.persist){
  navigator.storage.persisted()
    .then(p=>p||navigator.storage.persist())
    .then(granted=>{
      S.persist=!!granted;
      const b=document.querySelector("#storage-status");
      if(b) b.textContent=granted?"persistent on this device":"local — the system may evict it; install the app to be safe";
    }).catch(()=>{});
}

boot();
