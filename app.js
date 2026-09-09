"use strict";
/* 识字 · Zeichentrainer — standalone PWA
   Persistence via IndexedDB (survives restarts). Camera inbox. Offline. */

/* ---------- Deck (in code, survives everything) ---------- */
/* No built-in deck any more (v33): every card comes from H's photos or the Add form. */

const NEW_PER_SESSION = 8;
const CJK = /[\u4e00-\u9fff]/;
const pySpaced=t=>{ const out=[]; for(const x of pinyinPro.pinyin(t,{type:"array",toneType:"symbol"})){ const prev=out[out.length-1]; if(prev!==undefined&&/^[\d.]+[a-zA-Z%]*$/.test(prev)&&/^[\da-zA-Z%.]$/.test(x)&&!(/[a-zA-Z%]$/.test(prev)&&/[\d.]/.test(x))) out[out.length-1]=prev+x; else out.push(x); } return out.join(" "); }; /* syllables with tone marks, space-separated; a number stays one token (30, not 3 0), with the unit letters the library hands out one by one (380ml, not 380 m l — v323) */
const APP_V=391; /* must equal the PWA vN label in index.html — the boot check repairs a shell whose files are of different versions */
let PICKING=0; const PICK_MAX=10*60000, picking=()=>PICKING>0&&Date.now()-PICKING<PICK_MAX; /* a photo is being taken or picked (v316): from the tap on Take photo or From album until the input's change or cancel, at most ten minutes — no update reload meanwhile, see reloadSoon */
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
  if (grade==="again") return t("<10 min");
  if (s.interval<1) return t("<1 d");
  if (s.interval===1) return t("1 d");
  return t("{0} d",s.interval);
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
function idbPutMany(store,rows){ return _os(store,"readwrite").then(os=>new Promise((res,rej)=>{ const tx=os.transaction; rows.forEach(r=>os.put(r)); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); tx.onabort=()=>rej(tx.error); })); } /* all rows in one transaction: all or nothing (v264, the translation applied together) */
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
  peek:null, /* Learn: the id of a linked card whose photo is shown on the front instead (v155) */
  admin:false, /* the owner's rows in More unlocked for this session (v162) */
  detail:null, detailHide:false, fullPic:false, query:"", filterUnv:false, filterFlag:false, filterAi:false, filterTags:[], settings:{}, single:null, saved:null,
  editing:null, editFrom:null, editSeq:0, draft:null, pendingShot:null,
  autoCard:window.AUTO_CARD!==false, editOpenFrame:false }; /* autoCard (v325): a photo that opens by itself becomes a card without a frame or a preview; the harness sets window.AUTO_CARD=false to keep the crop-mode flow its frame suites drive */

function deck(){ return S.custom; }
/* the order of a Learn session (v153, H: "provide choices for the order in which the flash cards are shown"): due cards
   still come before new ones; inside each group "oldest" is the old order (due by due date, new by creation), "newest"
   is by creation newest first, "random" a fresh shuffle per session — setting learnOrder, chosen in More → Learning */
const LEARN_ORDERS=[["oldest","Oldest first"],["newest","Newest first"],["random","Random"]];
const learnOrder=()=>LEARN_ORDERS.some(([v])=>v===S.settings.learnOrder)?S.settings.learnOrder:"oldest";
function orderCards(list,order,byDue){
  if(order==="random"){ const a=list.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
  if(order==="newest") return list.slice().sort((a,b)=>(b.at||0)-(a.at||0));
  return byDue?list.slice().sort((a,b)=>S.progress[a.id].due-S.progress[b.id].due):list.slice(); /* the deck is oldest first already */
}
function buildQueue(includeAhead){
  const lt=learnTags(), p=S.progress, t=today(), d=(lt.length?deck().filter(x=>lt.some(g=>hasTag(x,g))):deck()).filter(x=>x.c); /* Learn: all cards, or the tags picked in the filter sheet — several allowed since v366, a card in any of them counts (v133, v156); a card still reading has no text yet (v237) */
  const order=learnOrder();
  const due = orderCards(d.filter(x=>p[x.id] && p[x.id].due<=t),order,true).map(x=>x.id);
  const fresh = orderCards(d.filter(x=>!p[x.id]),order,false).slice(0,NEW_PER_SESSION).map(x=>x.id);
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
/* the kind of a card made from a photo (v364, H: "Could you automatically label the Cards?"): one word from a fixed set,
   asked of the AI inside the answer it already gives — no extra call —, stored as an ordinary tag in the app's language,
   so it shows on the card, filters the Cards list and gives Learn a chip, and can be edited or deleted like H's own
   labels. A picture the model is not sure of gets no tag rather than a wrong one. */
const KINDS=["Menu","Street sign","Shop","Product","Appliance","Transport","Office","Notice","App"];
const kindTag=k=>{ const w=String(k||"").trim().toLowerCase(), hit=KINDS.find(x=>x.toLowerCase()===w); return hit?t("kind:"+hit):""; };
/* "Untagged" (v156, H: "provide a default tag for not-tagged cards"): a group, not a label written on the cards — the
   Cards tab and the Learn tab offer it as a chip while tags exist and some cards carry none; a card that gets a tag
   leaves the group by itself, exports are untouched */
const UNTAGGED="__untagged__";
const hasTag=(d,t)=>t===UNTAGGED?!(d.tags&&d.tags.length):(d.tags||[]).includes(t);
const untaggedCount=()=>deck().filter(d=>hasTag(d,UNTAGGED)).length;
function tagsFieldHTML(id,tags){ const cur=tags||[], known=allTags();
  return `<div class="field"><label>${t("Tags")}</label><input id="${id}" class="tags" value="${esc(cur.join(", "))}" placeholder="${t("Chinese class, HSK 3 …")}" autocomplete="off">${known.length?`<div class="tagchips" data-tagsfor="${id}">${known.map(tg=>`<button type="button" class="chip${cur.includes(tg)?" on":""}" data-tag="${esc(tg)}">${esc(tg)}</button>`).join("")}</div>`:""}</div>`; }
function wireTags(root,onChange){
  root.querySelectorAll("input.tags").forEach(inp=>{ const box=root.querySelector(`[data-tagsfor="${inp.id}"]`);
    const sync=()=>{ const cur=parseTags(inp.value); if(box) box.querySelectorAll("[data-tag]").forEach(b=>b.classList.toggle("on",cur.includes(b.dataset.tag))); if(onChange) onChange(cur,inp); };
    if(box) box.querySelectorAll("[data-tag]").forEach(b=> b.onclick=()=>{ const cur=parseTags(inp.value), i=cur.indexOf(b.dataset.tag); if(i>=0) cur.splice(i,1); else cur.push(b.dataset.tag); inp.value=cur.join(", "); sync(); });
    inp.oninput=sync; });
}
const learnTags=()=>{ const v=S.settings.learnTag; return Array.isArray(v)?v:v?[v]:[]; }; /* several tags since v366; a phone that stored one keeps working */
/* the filter as one pill and a sheet (v365, H on the eight kind tags of v364: "with so many tags, we'll probably need a
   separate tags page or something like that" — four ways offered, "I like B most"): the chip row that had to be swiped
   sideways is one pill now — the filter glyph and the filter's own name — and the whole list lives in the app's own sheet,
   grouped, with each row's card count at the right. The way Mail and Photos do it; it takes one line however many tags
   the deck has. What it costs: changing a filter is two taps instead of one. */
const filterIcon=`<svg class="ficon" viewBox="0 0 24 24" aria-hidden="true" style="stroke:currentColor"><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h10M18 17h2"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="17" r="2"/></svg>`;
/* the rows the sheet offers, in groups: the Cards tab has the status filters and the tags, Learn the tags alone */
const tagOn=(scope,x)=>(scope==="learn"?learnTags():S.filterTags).includes(x);
function filterGroups(scope){
  const tags=allTags(), un=untaggedCount(), tagRows=[
    ...tags.map(x=>({k:"tag:"+x, label:x, n:deck().filter(d=>hasTag(d,x)).length, on:tagOn(scope,x)})),
    ...(tags.length&&un?[{k:"tag:"+UNTAGGED, label:t("Untagged"), n:un, on:tagOn(scope,UNTAGGED)}]:[])];
  if(scope==="learn") return [{head:t("Tags"), rows:[{k:"", label:t("All cards"), n:deck().filter(d=>d.c).length, on:!learnTags().length},...tagRows]}];
  const nAi=deck().filter(d=>d.ai).length;
  const st=[{k:"flag", label:t("⚑ Flagged"), n:S.custom.filter(d=>d.flag).length, on:S.filterFlag},
    ...(nAi?[{k:"ai", label:t("AI"), n:nAi, on:S.filterAi}]:[]),
    {k:"unv", label:t("Unverified"), n:S.custom.filter(d=>d.mt&&!d.mt.verified).length, on:S.filterUnv}];
  return [{head:t("Status"), rows:st},...(tagRows.length?[{head:t("Tags"), rows:tagRows}]:[])];
}
const filterOn=scope=>filterGroups(scope).flatMap(g=>g.rows).filter(r=>r.on&&r.k);
/* the pill: the filter's own name while one is set, "All cards" while none is */
function filterPillHTML(scope){
  const on=filterOn(scope), lit=on.length>0;
  const label=!lit?t("All cards"):on.length===1?(on[0].n!=null?t("{0} ({1})",on[0].label,on[0].n):on[0].label):t("Filters ({0})",on.length);
  return `<button class="chip fpill${lit?" on":""}" data-filter="${scope}">${filterIcon}<span>${esc(label)}</span></button>`;
}
function wireFilterPill(scope,after){ document.querySelectorAll(`[data-filter="${scope}"]`).forEach(b=> b.onclick=()=>openFilterSheet(scope,after)); }
function openFilterSheet(scope,after){
  const groups=filterGroups(scope);
  const el=document.createElement("div"); el.className="ask"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
  el.innerHTML=`<div class="sheet filter"><div class="fhead"><span class="t">${t("Filter")}</span>${filterOn(scope).length?`<button class="del" id="f-clear">${t("Clear")}</button>`:""}</div>
    <div class="flist">${groups.map(g=>`<div class="fgroup"><div class="fgh">${esc(g.head)}</div>${g.rows.map(r=>
      `<button class="frow${r.on?" on":""}" data-frow="${esc(r.k)}"><span class="fl">${esc(r.label)}</span><span class="fn">${r.n}</span><span class="fc" aria-hidden="true"></span></button>`).join("")}</div>`).join("")}</div>
    <div class="row"><button class="btn plain" id="f-done">${t("Done")}</button></div></div>`;
  const onKey=e=>{ if(e.key==="Escape") close(); };
  const close=()=>{ el.remove(); document.removeEventListener("keydown",onKey); };
  el.onclick=e=>{ if(e.target===el) close(); };
  el.querySelector("#f-done").onclick=close;
  /* several rows at once (v366, H: "Bitte beim filtern multiple choice zulassen"): a tap ticks or unticks its row, the list
     behind follows at once and the sheet stays open — its rows are refreshed in place, so nothing slides or scrolls away */
  const sync=()=>{ const by=new Map(filterGroups(scope).flatMap(g=>g.rows).map(r=>[r.k,r]));
    el.querySelectorAll("[data-frow]").forEach(b=>{ const r=by.get(b.dataset.frow); if(!r) return; b.classList.toggle("on",!!r.on); b.querySelector(".fn").textContent=r.n; });
    const head=el.querySelector(".fhead"); let cl=el.querySelector("#f-clear");
    if(filterOn(scope).length&&!cl){ cl=document.createElement("button"); cl.className="del"; cl.id="f-clear"; cl.textContent=t("Clear"); cl.onclick=()=>pick(""); head.appendChild(cl); }
    else if(!filterOn(scope).length&&cl) cl.remove(); };
  const pick=async k=>{ await setFilter(scope,k); after&&after(); sync(); };
  const cl0=el.querySelector("#f-clear"); if(cl0) cl0.onclick=()=>pick("");
  el.querySelectorAll("[data-frow]").forEach(b=> b.onclick=()=>pick(b.dataset.frow));
  document.addEventListener("keydown",onKey); document.body.appendChild(el); el.querySelector(".frow").focus();
}
/* one row tapped: the status filters stay independent toggles, the tag is one at a time, "" clears everything */
async function setFilter(scope,k){
  if(scope==="learn"){ let v=learnTags().slice();
    if(!k.startsWith("tag:")) v=[]; else { const x=k.slice(4); v=v.includes(x)?v.filter(y=>y!==x):[...v,x]; }
    await setSetting("learnTag",v);
    S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false; S.single=null; S.saved=null; setStats(); return; }
  if(!k){ S.filterFlag=false; S.filterAi=false; S.filterUnv=false; S.filterTags=[]; return; }
  if(k==="flag") S.filterFlag=!S.filterFlag;
  else if(k==="ai") S.filterAi=!S.filterAi;
  else if(k==="unv") S.filterUnv=!S.filterUnv;
  else { const v=k.slice(4); S.filterTags=S.filterTags.includes(v)?S.filterTags.filter(y=>y!==v):[...S.filterTags,v]; }
}
function learnChipsHTML(){ if(!allTags().length) return ""; return `<div class="chipset learnchips">${filterPillHTML("learn")}</div>`; }
function wireLearnChips(){ wireFilterPill("learn",render); }
/* the id of a new card: the text itself while it is free (readable in exports), else text plus a timestamp */
const cardId = c => deck().some(d=>d.id===c) ? c+"#"+Date.now() : c;
async function setSetting(k,v){ S.settings[k]=v; try{ await idbPut("settings",{k,v}); }catch(e){} }
/* diagnostics (H debugs alone on the phone): the last errors and the last reading's steps, shown and shared from More → Diagnostics */
const ERRLOG=[], READLOG=[], LAST_READ={passes:null}, AILOG=[]; /* AILOG: the last three AI exchanges, request and raw reply, never the key (v97) */
/* The AI exchanges survive a restart too (v384, H's washing machine: five versions were tuned against his answer rebuilt from
   the reading log's rounded percentages — a box edge rounded to a whole percent is a tenth of a box width, wider than the
   tolerance the test measures — while the raw answer sat one section further down in Diagnostics and was always empty:
   "AI exchanges (0)". AILOG lived in memory alone, and the idle reload of v327 or an update wipes it between the photo and
   the diagnostics. Now it is written like the reading log, so the model's own numbers reach the next session. Device only:
   the daily usage row carries reportErrors() and never this. */
function logAi(entry){ AILOG.push({t:Date.now(),...entry}); while(AILOG.length>3) AILOG.shift(); saveAiLog(); } /* entry.ms: how long the call took (v208, H: the check "takes way too long" — Diagnostics now shows it) */
let _ailogT=null; const saveAiLog=()=>{ clearTimeout(_ailogT); _ailogT=setTimeout(()=>{ setSetting("ailog",AILOG.slice()).catch(()=>{}); },800); };
/* the last reading's steps and passes survive a restart (v267 — H's first diagnostics after the v266 update said "Last reading (0 steps)":
   the update had reloaded the page and the log lived in memory only; the error log has been persisted since v93) */
/* Every line of the reading's later stages goes through here (v374, H's washing machine: the diagnostics arrived after a reload
   and ended at "Asking the AI about the picture …" — the split's own lines were pushed straight into READLOG, which lives in
   memory, so the reasons a panel did not split were never in a diagnostics text). It pushes, trims and saves like readingStatus. */
function logRead(text){ READLOG.push({t:Date.now(),text}); while(READLOG.length>40) READLOG.shift(); saveReadLog(); }
let _readlogT=null; const saveReadLog=()=>{ clearTimeout(_readlogT); _readlogT=setTimeout(()=>{ setSetting("readlog",{steps:READLOG.slice(),passes:LAST_READ.passes||null}).catch(()=>{}); },800); };
function logErr(kind,msg){ ERRLOG.push({t:Date.now(),kind,msg:String(msg||"").slice(0,400)}); while(ERRLOG.length>20) ERRLOG.shift(); setSetting("errlog",ERRLOG.slice()).catch(()=>{}); }
window.addEventListener("error",e=>logErr("error",(e.message||"")+(e.filename?` @${String(e.filename).split("/").pop()}:${e.lineno}`:"")));
window.addEventListener("unhandledrejection",e=>{ const r=e.reason; logErr("promise",r&&(r.stack||r.message)||r); });
function diagText(){
  const ago=t=>{ const d=Math.round((Date.now()-t)/1000); return d<60?d+" s ago":d<3600?Math.round(d/60)+" min ago":Math.round(d/3600)+" h ago"; };
  const out=[`Zeichentrainer diagnostics — ${new Date().toLocaleString("en-GB")}`,
    `page ${pageVersion()||"?"} · script ${APP_V} · online ${navigator.onLine} · AI ${aiOn()?aiProvider()+(aiLive()?" live":" off")+(textProvider()!==aiProvider()?` (text ${textProvider()})`:""):"none"} · SW ${swControls()?"yes":"no"+(SW_REG?` (registration ${SW_REG})`:"")}${VENDOR.base?` · reader files from ${VENDOR.base===originVendor()?"github.io":"the mirror"}`:""}`,
    navigator.userAgent, `voices (${voiceList().length}): ${voiceList().join("; ")||"none reported"}`, ""];
  out.push(`Last reading (${READLOG.length} steps):`);
  READLOG.forEach(x=>out.push(`  ${ago(x.t)}  ${x.text}`));
  if(LAST_READ.passes) out.push("  passes: "+JSON.stringify(LAST_READ.passes));
  out.push("", `Drawings (${DRAWLOG.length}, newest last):`);
  DRAWLOG.forEach(x=>{ out.push(`  ${ago(x.t)}  ${x.strokes.length} stroke${x.strokes.length===1?"":"s"} → ${x.alts.join(" ")||"nothing"}${x.strokes_best?` · strokes ${x.strokes_best.join(" ")} · print ${(x.ocr||[]).join(" ")||"nothing"}`:""}`); out.push("    strokes: "+JSON.stringify(x.strokes)); });
  out.push("", `AI exchanges (${AILOG.length}, newest last):`);
  AILOG.forEach(x=>{ out.push(`  ${ago(x.t)}  ${x.model||""} → ${x.status||""}${x.ms?` in ${(x.ms/1000).toFixed(1)} s`:""}`); out.push("    request: "+x.req); out.push("    reply: "+(x.res||x.err||"")); });
  out.push("", `Errors (${ERRLOG.length}):`);
  ERRLOG.forEach(x=>out.push(`  ${ago(x.t)}  [${x.kind}] ${x.msg}`));
  return out.join("\n")+"\n";
}
/* ---------- the owner's report of all phones (v197, H: "show an all-users report, password protected") ----------
   the edge function usage-report (supabase/functions/usage-report) checks the app password against its secret and
   answers with the latest row of every phone plus today's relay calls; the app keeps the password only in memory after
   the unlock (S.adminPw) and sends it with the request — the table itself stays unreadable for the publishable key */
const reportUrl=()=>SHARE_URL+"/functions/v1/usage-report";
let USERS=null, FEEDBACK=null; /* the last answers: {at, rows} */
async function fetchAllUsers(){ return USERS=await fetchReport("users"); }
async function fetchFeedback(){ return FEEDBACK=await fetchReport("feedback"); }
async function fetchReport(what){
  const r=await fetch(reportUrl(),{method:"POST",headers:{"content-type":"application/json","apikey":SHARE_KEY,"authorization":"Bearer "+SHARE_KEY},body:JSON.stringify({password:S.adminPw||"",what})});
  if(!r.ok){ /* v198 — the phone showed a 401 that the function's own "wrong password" could not be told from Supabase's JWT gate: name the sender */
    const body=await r.text().catch(()=>""); logErr("report",r.status+": "+body.slice(0,300));
    if(r.status===401){ if(/jwt/i.test(body)) throw new Error("the report function still checks the JWT — switch off \"Verify JWT\" under its Settings in the dashboard");
      if(/wrong password/i.test(body)) throw new Error("the report function does not accept the app password — deploy the current usage-report code from the repo, it carries the password's hash");
      throw new Error("the report function refused the call (401): "+(body.slice(0,120)||"no details")); }
    if(r.status===404||r.status===503) throw new Error("the report function is not set up");
    throw new Error("report error "+r.status+": "+(body.slice(0,120)||"no details")); }
  const rows=await r.json(); if(!Array.isArray(rows)) throw new Error("unexpected answer");
  return {at:Date.now(),rows};
}
/* Feedback (v212, H: "add a provide feedback function — of course I must receive this feedback", described first and built on
   "Go"): a user's message goes as one row into the table `feedback` of H's project (insert only for the publishable key,
   with the installation id and the app version — no name, no cards, no photos); H reads them through the report function
   with what:"feedback" (supabase/feedback.sql, the function's second branch). */
async function sendFeedback(text){
  const r=await fetch(SHARE_URL+"/rest/v1/feedback",{method:"POST",headers:{"apikey":SHARE_KEY,"Authorization":"Bearer "+SHARE_KEY,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({install:installId(),version:APP_V,text})});
  if(!r.ok){ const body=await r.text().catch(()=>""); logErr("feedback",r.status+": "+body.slice(0,300)); throw new Error(r.status===404?"the feedback table is not set up":"error "+r.status); }
}
function feedbackText(rows){ /* laid out like the All users report since v251 (H: "Same for feedback"): a head with the count, one block per message with a blank line between, the sender's id under the time */
  const day=t=>String(t||"").replace("T"," ").slice(0,16);
  const blocks=rows.map(r=>`${day(r.created_at)}, app version ${r.version||"?"}\n  from phone ${r.install||"?"}\n  ${String(r.text||"").replace(/\s*\n\s*/g,"\n  ")}`);
  return [`识字 Zeichentrainer — feedback, ${day(new Date().toISOString()).slice(0,10)}`,`  messages ${String(rows.length).padStart(4)}  (newest first, up to 500)`,""].concat(blocks.length?blocks.join("\n\n"):"No messages yet.").join("\n")+"\n";
}
async function shareFeedback(){
  const rows=(FEEDBACK&&FEEDBACK.rows)||(await fetchFeedback()).rows;
  const text=feedbackText(rows), name="zeichentrainer-feedback-"+new Date().toISOString().slice(0,10)+".txt", file=new File([text],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:name}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  if(navigator.share){ try{ await navigator.share({title:name,text}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(text); noteSheet(t("Copied to the clipboard.")); }catch(err){ noteSheet(t("Sharing is not available here.")); }
}
function allUsersText(rows){
  const day=t=>String(t||"").slice(0,10), week=Date.now()-7*DAY, n=(o,k)=>+(o&&o[k])||0;
  const tot={}; const add=(o,k,v)=>{ o[k]=(o[k]||0)+v; };
  /* installs sorted by what they did (v220, H: "18 phones is incorrect" — a row is a browser storage, not a person; WeChat's browser
     makes a new one per tap); since v221 the real users come first, by cards, and the rows that only opened the page fold into one line;
     since v250 the report is laid out to be read at a glance (H: "ein bisschen übersichtlicher — das dauert immer, bis ich da durchsteige"):
     the head as two short tables with the counts aligned, one block of short lines per install instead of one long line, the sections
     with a heading and a count */
  let active=0, wx=0, installed=0; const models={}, users=[], tried=[], lookers=[], erring=[];
  const errsOf=d=>Array.isArray(d.errors)?d.errors:[], recentErr=d=>errsOf(d).some(e=>new Date(String(e.t).replace(" ","T")+":00Z").getTime()>=week);
  for(const r of rows){ const d=r.data||{}; if(new Date(r.created_at).getTime()>=week) active++; if(errsOf(d).length) erring.push(r);
    if(/WeChat/.test(d.device||"")) wx++; if(d.installed) installed++;
    if(n(d,"cards")>0) users.push(r); else if(n(d.models,"reader")>0||n(d,"aiCalls")>0||n(r,"relay_today")>0) tried.push(r); else lookers.push(r); /* read a photo without saving a card: the on-device reader ran, or an AI or relay call went out (v251 — the label "tried the reader" was H's question) */
    for(const k of ["cards","reviews","aiCalls","pics","byPhoto","byHand"]) add(tot,k,n(d,k));
    for(const [m,v] of Object.entries(d.models||{})) add(models,m,+v||0); add(tot,"relay",n(r,"relay_today")); }
  users.sort((a,b)=>n(b.data,"cards")-n(a.data,"cards")); tried.sort((a,b)=>n(b,"relay_today")-n(a,"relay_today"));
  const row=(k,v)=>`  ${k.padEnd(30)}${String(v).padStart(4)}`, sub=(k,v)=>row("  "+k,v); /* one figure per line, the numbers in one column — the box holds 40 characters at 390 px */
  const head=[`识字 Zeichentrainer — all users, ${day(new Date().toISOString())}`,"",
    `Phones ${rows.length}`,"  (one line per browser — a phone that","  opened the link in WeChat and Chrome","  is counted twice)",
    row("made cards",users.length), row("read a photo, saved no card",tried.length), row("only opened the app",lookers.length),
    wx?row("opened it inside WeChat",wx):null, row("installed on the home screen",installed), row("used in the last 7 days",active),
    row("with errors in the last 7 days",rows.filter(r=>recentErr(r.data||{})).length),
    "","All phones together",
    row("cards",tot.cards||0), sub("from photos",tot.byPhoto||0), sub("typed by hand",tot.byHand||0), row("cards reviewed",tot.reviews||0),
    row("AI checks",tot.aiCalls||0), sub("with the photo",tot.pics||0), sub("via the owner's key today",tot.relay||0),
    "  work done by"].concat(Object.entries(models).length?Object.entries(models).map(([m,v])=>sub(m==="reader"?"on-device reader, readings":m+", checks",v)):[sub("none yet","")]).concat([""]).filter(x=>x!==null);
  const block=r=>{ const d=r.data||{}, reader=n(d.models,"reader"), cards=n(d,"cards"); return [`Phone ${d.install||"?"}`,
    `  app version ${d.version||"?"}`, `  ${d.installed?"installed on the home screen":"used in the browser"}`,
    d.device?`  device ${d.device}`:null,
    cards?`  cards ${cards} (${n(d,"byPhoto")} from photos, ${n(d,"byHand")} typed)`:null,
    `  cards reviewed ${n(d,"reviews")}`,
    `  days used ${n(d,"days")}, app opened ${nOf(n(d,"opens"),"time")}`,
    `  AI checks ${n(d,"aiCalls")}, ${n(d,"pics")} with the photo`,
    reader?`  photos read ${reader}, ${n(d,"pics")} of them poorly`:null,
    `  checks via the owner's key today ${n(r,"relay_today")}`,
    errsOf(d).length?`  errors ${errsOf(d).length}, last ${day(errsOf(d)[errsOf(d).length-1].t)} ${errsOf(d)[errsOf(d).length-1].kind}`:null, /* the messages themselves in the section at the end (v271) */
    `  first used ${d.first||"?"}`, `  last report ${day(r.created_at)}`].filter(Boolean).join("\n"); };
  const section=(title,list)=>list.length?[`${title} (${list.length})`,""].concat(list.map(block).join("\n\n")).concat([""]):[];
  const lines=section("Phones with cards",users).concat(section("Read a photo, saved no card",tried));
  if(lookers.length){ const plat=d=>{ const v=d.device||""; return /iPhone|iPad/.test(v)?"iPhone":/Android/.test(v)?"Android":/Windows/.test(v)?"Windows":/Mac/.test(v)?"Mac":/Linux|X11/.test(v)?"Linux":"other"; };
    const by={}; let lwx=0; for(const r of lookers){ const d=r.data||{}; add(by,plat(d),1); if(/WeChat/.test(d.device||"")) lwx++; }
    lines.push(`Only opened the app (${lookers.length})`,`  ${Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${v} ${k}`).join(", ")}${lwx?` (${lwx} in WeChat)`:""}`); }
  if(erring.length){ /* the error messages phone by phone, newest last as the phone logged them (v271) */
    lines.push("",`Errors on phones (${erring.length})`,"");
    lines.push(erring.map(r=>{ const d=r.data||{}; return [`Phone ${d.install||"?"}, app version ${d.version||"?"}`].concat(errsOf(d).map(e=>`  ${e.t} [${e.kind}] ${e.msg}`)).join("\n"); }).join("\n\n")); }
  return head.concat(lines.length?lines:["No rows yet."]).join("\n")+"\n";
}
async function shareUsers(){
  const rows=(USERS&&USERS.rows)||(await fetchAllUsers()).rows;
  const text=allUsersText(rows), name="zeichentrainer-users-"+new Date().toISOString().slice(0,10)+".txt", file=new File([text],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:name}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  if(navigator.share){ try{ await navigator.share({title:name,text}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(text); noteSheet(t("Copied to the clipboard.")); }catch(err){ noteSheet(t("Sharing is not available here.")); }
}
/* the owner's texts onto the clipboard (v292, H: "offer the option to share/copy diagnostics and user data and feedback directly from the app"): Share hands a file to the share sheet, Copy puts the same text where a chat can take it; the row's line says so */
async function copyText(text,st){
  try{ await navigator.clipboard.writeText(text); if(st) st.textContent="Copied."; }
  catch(err){ if(st) st.textContent="Copy is not available here — tap Show and select the text."; }
}
async function shareDiag(){
  const text=diagText(), name="zeichentrainer-diagnostics.txt", file=new File([text],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:name}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  if(navigator.share){ try{ await navigator.share({title:name,text}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(text); noteSheet(t("Copied to the clipboard.")); }catch(err){ noteSheet(t("Sharing is not available here.")); }
}

/* ---------- Boot ---------- */
async function boot(){
  try{
    const [prog, cust, inb, sett] = await Promise.all([idbAll("progress"), idbAll("custom"), idbAll("inbox"), idbAll("settings").catch(()=>[])]);
    S.progress = {}; prog.forEach(r=>{ const {id,c,...s}=r; S.progress[id||c]=s; });
    sett.forEach(r=>{ S.settings[r.k]=r.v; });
    if(Array.isArray(S.settings.errlog)) ERRLOG.unshift(...S.settings.errlog.slice(-20));
    if(S.settings.readlog&&Array.isArray(S.settings.readlog.steps)&&!READLOG.length){ READLOG.push(...S.settings.readlog.steps.slice(-40)); LAST_READ.passes=S.settings.readlog.passes||null; } /* the last reading before the restart (v267) */
    if(Array.isArray(S.settings.ailog)&&!AILOG.length) AILOG.push(...S.settings.ailog.slice(-3)); /* the last AI exchanges before the restart (v384) */
    await migrateAi();
    bump("opens");
    /* progress of cards that no longer exist (the built-in deck of v1–v32) is dropped */
    cust.forEach(d=>{ if(!d.id) d.id=d.c; });
    const have=new Set(cust.map(d=>d.id));
    for(const id of Object.keys(S.progress)) if(!have.has(id)){ delete S.progress[id]; idbDel("progress",id).catch(()=>{}); }
    /* creation order (cards without a timestamp, from before v33, come first in key order) */
    S.custom = cust.sort((a,b)=>(a.at||0)-(b.at||0));
    S.inbox = inb.sort((a,b)=>b.ts-a.ts);
  }catch(e){ console.warn("IndexedDB unavailable, session only:", e); }
  LANG=LANGS.some(([c])=>c===S.settings.lang)?S.settings.lang:langDefault(); applyLangStatic(); /* the app's language (v253): the setting, else the phone's */
  await syncMeanings(); /* every card shows the meaning it has in the app's language (v265); cards from before get their ms */
  S.ready=true;
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  const rv=S.settings.resumeView; if(rv){ delete S.settings.resumeView; idbDel("settings","resumeView").catch(()=>{}); } /* the screen the update's reload left (v327): back to it, so the reload is not felt */
  if(rv&&Date.now()-(rv.at||0)<RESUME_MAX){ if(["study","cards","inbox","more","guide"].includes(rv.mode)) S.mode=rv.mode; if(S.mode==="cards"&&rv.detail&&S.custom.some(d=>d.id===rv.detail)) S.detail=rv.detail; if(typeof rv.query==="string") S.query=rv.query; }
  wireChrome(); render();
  if(rv&&rv.scroll) requestAnimationFrame(()=>window.scrollTo(0,rv.scroll));
  autoBreaks(); /* old cards get their photo lines estimated once */
  fixNumberSegs(); /* word cards from before v338 get their numbers back into their lines */
  dedupePhotos(); /* cards from before v214 drop the whole photo they hold twice */
  setTimeout(resumePending,1500); /* cards saved before their reading finished get it now (v237) */
  aiAuto(); window.addEventListener("online",()=>{ _aiAutoRan=false; aiAuto(); sendReport(); resumeTranslate(); resumeTagAll(); resumeRecheck(); });
  setTimeout(()=>{ resumeTranslate(); resumeTagAll(); resumeRecheck(); brightenPass(); },2500); document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ resumeTranslate(); resumeTagAll(); resumeRecheck(); } }); /* a Translate-all run interrupted by a restart, a lost connection or the background goes on (v262) */
  sendReport(); document.addEventListener("visibilitychange",()=>{ if(!document.hidden) sendReport(); else if(REPORT_DIRTY) sendReport(true); }); /* the day's first row on foreground, a second one on background when cards changed (v219) */
}

/* ---------- Rendering ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function wireChrome(){
  document.querySelectorAll(".tab").forEach(b=>{
    b.onclick=()=>{ const m=b.dataset.mode;
      S.editing=null; S.editFrom=null;                       /* a tab tap always leaves the edit form */
      endPick();                                            /* … and any marking (v351) */
      if(CROP&&RECROP[CROP.id]) RECROP[CROP.id].end();      /* … and its Crop again (v239) */
      if(m==="cards" && (S.mode==="cards"||S.mode==="add")) S.detail=null; /* Cards again → back to the list */
      S.mode=m; render();
      if(m==="inbox") window.scrollTo(0,0); /* the Camera tab always opens at the top, so Take photo is under the thumb (v353) */
    }; /* the Camera tab opens the inbox page with Take photo and From album — a tab that fired the camera at once (v184) went in v186, H: "I don't like the direct capture, revert" */
  });
  $("#cam").onchange=onPhoto; $("#album").onchange=onPhoto; /* camera, or photos already on the phone */
  for(const id of ["#cam","#album"]){ $(id).addEventListener("change",()=>{ PICKING=0; }); $(id).addEventListener("cancel",()=>{ PICKING=0; }); } /* the pick is over, with a photo or without (v316) */
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden && S.mode==="inbox") renderShots(); });
  /* a long press on a picture, a canvas or a control is never a request for the browser's menu — the image sheet came up over the crop frame (v248, H: "Don't make those things pop up while adjusting the crop"), and v249 keeps it off every picture and control (H: "Find all such useless behaviours and remove them"); plain text and the fields keep their menus, so a meaning can still be copied */
  document.addEventListener("contextmenu",e=>{ const t=e.target; if(t&&t.closest&&t.closest("img,canvas,button,.croplayer,.shotwrap,.drawsheet,.picbox,.thumbbox,.reticle,.ck,.chip,.tab,.grade,.seg,.linked")) e.preventDefault(); });
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
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.mode===S.mode||(b.dataset.mode==="cards"&&S.mode==="add")||(b.dataset.mode==="more"&&S.mode==="guide")));
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
/* the words of each line for a word card's seg: dictionary words from the Chinese characters, and a number with its Latin
   unit as a word of its own (v338, H's 24小时营业: the front showed 小时营业 — the number was dropped here and in readingCard,
   while the pinyin and the parts row kept it) */
const NUM_TOKEN=/^[0-9]+(?:\.[0-9]+)?[a-zA-Z%]{0,4}/, NUM_PART=new RegExp(NUM_TOKEN.source+"$"); /* a number with its Latin unit as written (24H, 380ml, 20%, 100kcal): NUM_TOKEN cuts one from a line (v338), NUM_PART tells a whole token (v323, v336) — one rule since the polish at v343 (three regexes until then, one of them capped at three letters and missing kcal) */
function segWithBreaks(lines){
  const out=[];
  lines.forEach((line,i)=>{
    if(i) out.push("\n");
    let k=0, run=[]; const flush=()=>{ if(run.length){ segmentChars(run).forEach(seg=>out.push(seg.map(x=>x.ch).join(""))); run=[]; } };
    while(k<line.length){
      const num=line.slice(k).match(NUM_TOKEN);
      if(num){ flush(); out.push(num[0]); k+=num[0].length; continue; }
      const ch=line[k]; if(CJK.test(ch)) run.push({ch}); k++;
    }
    flush();
  });
  return out;
}
/* a word card saved before v338 lost its numbers from seg (24小时营业 showed as 小时营业): once at boot, a word card whose seg
   lacks a number its text has gets its lines rebuilt — the old lines' Chinese characters keep their line, the numbers
   between them follow the text's order */
async function fixNumberSegs(){
  const digits=x=>(String(x).match(/[0-9]/g)||[]).length;
  const todo=S.custom.filter(d=>d.kind!=="sign"&&d.seg&&digits(d.c)>digits(d.seg.join("")));
  if(!todo.length) return;
  try{ await loadDict(); }catch(e){ return; } /* the words need the dictionary; without it the next start repairs */
  for(const d of todo){
    const raw=d.c.replace(/\s+/g,""), old=frontLines(d), lines=[]; let k=0;
    old.forEach((line,i)=>{
      const n=[...line].filter(ch=>CJK.test(ch)).length; let got=0, cur="";
      while(k<raw.length&&(got<n||(i===old.length-1))){ const ch=raw[k]; cur+=ch; k++; if(CJK.test(ch)) got++; }
      lines.push(cur);
    });
    if(k<raw.length) lines[lines.length-1]+=raw.slice(k);
    const segs=segWithBreaks(lines); if(segs.length>1) d.seg=segs; else delete d.seg;
  }
  try{ await idbPutMany("custom",todo); }catch(e){}
  if(S.mode==="study"||S.detail) render();
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
/* the width the front's text box may take: the card's inner width, measured (v152 — until v151 it was guessed from the
   window and overflowed the card on H's phone) */
function frontWidth(){
  const main=$("#main"); if(!main) return Math.max(200,(window.innerWidth||390)-68);
  const cs=getComputedStyle(main), inner=main.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0);
  return Math.max(200,Math.min(440,inner)-36); /* .card: max-width 440, padding 18 each side */
}
/* A photo line too long for the box goes on two (or more) lines instead of past the card (v152, H's 16-character
   escalator sign: "statt überlaufende Zeile bitte zweizeilig"): while the fitted font would fall under minFs, the longest
   line is cut nearest its middle, between words where the card knows them (words[k] = the words of line k) */
/* a line's width in character widths: a Chinese character 1, a digit or a Latin letter 0.6, a space 0.35 (v339, H's 绿皮书 card: the
   line 3月1日 全国上映 ran past the box — glyphs() counted its six characters and not the digits and the space) */
function lineUnits(s){ let u=0; for(const ch of String(s)){ u+=CJK.test(ch)?1:ch===" "?0.35:/[0-9A-Za-z%.]/.test(ch)?0.6:0.5; } return u; }
function fitLines(lines,words,W,cap,minFs){
  lines=lines.slice(); words=(words||[]).slice();
  const fsOf=()=>Math.min(cap,Math.floor((W-28)/Math.max(1,...lines.map(lineUnits))));
  for(let guard=0;guard<6&&fsOf()<minFs;guard++){
    let k=0; lines.forEach((l,i)=>{ if(lineUnits(l)>lineUnits(lines[k])) k=i; });
    const cs=[...lines[k]]; if(cs.length<4) break;
    const mid=cs.length/2; let cut=Math.round(mid);
    const ws=words[k]; if(ws&&ws.length>1){ let pos=0, best=null; for(const w of ws.slice(0,-1)){ pos+=[...w].length; if(best===null||Math.abs(pos-mid)<Math.abs(best-mid)) best=pos; } if(best&&Math.abs(best-mid)<=mid*0.5) cut=best; }
    lines.splice(k,1,cs.slice(0,cut).join(""),cs.slice(cut).join(""));
    if(ws){ let pos=0; const wa=[], wb=[]; for(const w of ws){ const n=[...w].length; if(pos+n<=cut) wa.push(w); else if(pos>=cut) wb.push(w); else { wa.push([...w].slice(0,cut-pos).join("")); wb.push([...w].slice(cut-pos).join("")); } pos+=n; } words.splice(k,1,wa,wb); }
    else words.splice(k,1,null,null);
  }
  return {lines,fs:fsOf()};
}
function frontWords(d){ /* the words of each photo line of a word card, from seg */
  if(!d.seg) return null; const out=[[]]; d.seg.forEach(x=>{ if(x==="\n") out.push([]); else out[out.length-1].push(x); }); return out.filter(w=>w.length);
}
/* one shape for every word card (v223, H: "why are some boxes square and others wide? Consistency!" — until v222 up to
   three characters sat in a 260 px square, which took too much of the screen): the wide box at the card's width, FRONT_H
   tall for one photo line, the font capped at FRONT_FS so a short word fills the box without growing it; a second photo
   line adds its height */
const FRONT_H=150, FRONT_FS=72;
function frontBox(lines,base,words){
  const W=Math.max(260,frontWidth());
  const fit=fitLines(lines,words,W,Math.min(base,FRONT_FS),30);
  const H=Math.max(FRONT_H,Math.round(fit.fs*1.3*fit.lines.length+56));
  return {W,H,fs:fit.fs,lines:fit.lines};
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
  if(S.mode==="guide") return renderGuide(main); /* How to use the app (v259) */
  if(S.mode==="cards") return S.detail?renderCardDetail(main,S.detail):renderCards(main);
}
/* ---------- online AI review (T3, opt-in) ----------
   Flagged cards, uncertain readings and pending translations can be checked by an
   online model (DeepSeek / Qwen / GLM via the OpenAI-style API, or Claude).
   What leaves the phone: hanzi, pinyin, meaning and the note — and, when the reading
   is weak and H's switch is on, the straightened framed area to a provider that takes
   pictures (v173). A phone without a key of its own sends through the owner's relay
   (v191). Keys live in the settings store. */
/* providers: Chinese ones take WeChat Pay / Alipay and need no VPN; all but Claude speak the OpenAI-style chat API */
const AI_PROVIDERS={
  deepseek:{name:"DeepSeek", short:"DeepSeek", base:"https://api.deepseek.com", model:"deepseek-chat", hint:"sk-…", where:"Key: platform.deepseek.com → API keys. Top up with WeChat Pay or Alipay (a few yuan last months). No VPN needed."},
  qwen:{name:"Qwen (Alibaba Bailian)", short:"Qwen", vision:true, base:"https://dashscope.aliyuncs.com/compatible-mode/v1", model:"qwen3.7-plus", hint:"sk-…", where:"Key: bailian.console.aliyun.com → API-KEY (Alipay account). No VPN needed."},
  glm:{name:"GLM (Zhipu)", short:"GLM", vision:true, vmodel:"glm-4v-flash", base:"https://open.bigmodel.cn/api/paas/v4", model:"glm-4-flash", hint:"….…", where:"Key: open.bigmodel.cn → API keys. WeChat Pay or Alipay; glm-4-flash is free. No VPN needed."},
  claude:{name:"Claude (Anthropic)", short:"Claude", vision:true, base:"https://api.anthropic.com/v1/messages", model:"claude-sonnet-5", hint:"sk-ant-…", where:"Key: console.anthropic.com → API keys. Needs the VPN and a card from outside China."},
  custom:{name:"Other (OpenAI-style API)", short:"Other", base:"", model:"", hint:"API key", where:"Any provider with an OpenAI-compatible /chat/completions endpoint: enter its base URL and model name."}
};
const AI_PROVIDER_DEFAULT="deepseek";
function aiProvider(){ return AI_PROVIDERS[S.settings.aiProvider]?S.settings.aiProvider:AI_PROVIDER_DEFAULT; }
/* one account per provider (v172, H: "several AI providers to switch between" — "I don't want to delete DeepSeek"):
   setting "aiAccounts" = {deepseek:{key,model,base}, qwen:{…}, …}; "aiProvider" names the active one. Until v171 the
   app held one key (settings aiKey, aiModel, aiBase); boot moves them into the active provider's account (migrateAi),
   and a bare aiKey still counts as the active provider's key so nothing is lost on the way. */
const aiAccounts=()=>S.settings.aiAccounts||{};
function aiAcct(pv){ return aiAccounts()[pv]||{}; }
function aiKey(pv){ return aiAcct(pv||aiProvider()).key||((pv||aiProvider())===aiProvider()&&S.settings.aiKey)||""; }
function aiModel(pv){ pv=pv||aiProvider(); return aiAcct(pv).model||AI_PROVIDERS[pv].model; }
function aiBase(pv){ pv=pv||aiProvider(); return (pv==="custom"?(aiAcct(pv).base||S.settings.aiBase||""):AI_PROVIDERS[pv].base).replace(/\/+$/,""); }
/* the owner's relay (v191, H: "go with the relay" — a friend's phone has no key, and the key must not live in the public
   code): a Supabase edge function of H's holds the provider keys and forwards OpenAI-style requests; a phone without a
   key of its own for a provider sends its requests there, with its installation id, and the function counts and caps
   them per phone and per day. The phone's own key always wins. Providers the relay carries: RELAY_PROVIDERS. */
const relayUrl=()=>SHARE_URL+"/functions/v1/ai-relay", RELAY_PROVIDERS=["deepseek","qwen"]; /* SHARE_URL is declared further down, hence a function */
const relayOn=()=>S.settings.aiRelay!==false;
function viaRelay(pv){ pv=pv||aiProvider(); return !aiKey(pv)&&relayOn()&&RELAY_PROVIDERS.includes(pv); }
function aiOn(){ return (!!aiKey()||viaRelay())&&!!aiBase(); }
/* the text goes to DeepSeek when it can (v266, idea 3: Qwen was the active provider on H's phone and slow on text, v208): a picture-capable
   active provider hands the text check, the picker's candidates and Translate all to DeepSeek when a DeepSeek key or the relay is there;
   DeepSeek itself, or a provider without pictures, stays as it is. The picture keeps pictureProvider(). */
function textProvider(){ const pv=aiProvider(); if(pv==="deepseek"||!AI_PROVIDERS[pv].vision) return pv; return (aiKey("deepseek")||viaRelay("deepseek"))?"deepseek":pv; }
/* one OpenAI-style request through the relay: the function adds the key and answers with the provider's JSON as it is */
/* Every AI request goes through aiFetch (v201 — H switched apps during "Checking pinyin and meaning …" and came back to
   "no connection (offline, or this provider refuses calls from a browser …)": Android cuts a page's requests when it goes
   to the background, and the text named a provider problem the user cannot do anything about). A request that fails is
   tried once more — after the page is back in the foreground when it went to the background meanwhile, else after 1.5 s;
   a second failure is reported as AI_NET_ERR, the detail (and the retry) goes to the AI log only. A try that has not
   answered within AI_TIMEOUT_MS is dropped and counts as a failure (v331, H: "he was reading quite long" — a hanging
   connection held the reading for as long as the browser waits, a minute or more, before the retry even started; Qwen's
   picture answers take 3–10 s on H's phone). */
let HIDDEN_AT=0; document.addEventListener("visibilitychange",()=>{ if(document.hidden) HIDDEN_AT=Date.now(); });
const whenVisible=()=>document.hidden?new Promise(res=>document.addEventListener("visibilitychange",function f(){ if(!document.hidden){ document.removeEventListener("visibilitychange",f); res(); } })):Promise.resolve();
const AI_NET_ERR="The AI could not be reached", AI_RETRY_MS=1500, PIC_TOKENS=4000; let AI_TIMEOUT_MS=25000, PIC_TIMEOUT_MS=60000; /* let: the harness shortens them */
/* the picture gets its own budget (v360, H's washing machine: 26 buttons, and Qwen's answer at 1000 tokens already took 22 s —
   a full one passes 25 s, and the abort would throw away an answer that was on its way) */
const timedFetch=(url,opts,ms)=>{ const ac=new AbortController(), lim=ms||AI_TIMEOUT_MS, t=setTimeout(()=>ac.abort(),lim); return fetch(url,{...opts,signal:ac.signal}).catch(err=>{ throw ac.signal.aborted?new Error("no answer within "+Math.round(lim/1000)+" s"):err; }).finally(()=>clearTimeout(t)); };
async function aiFetch(url,opts,ms){
  const t0=Date.now();
  try{ return await timedFetch(url,opts,ms); }
  catch(err){
    const bg=document.hidden||HIDDEN_AT>=t0;
    if(bg) await whenVisible(); else await new Promise(r=>setTimeout(r,AI_RETRY_MS));
    try{ return await timedFetch(url,opts,ms); }
    catch(err2){ throw new Error((err2&&err2.message||err2)+(bg?" (tried again after the app came back to the foreground)":" (tried twice)")); }
  }
}
async function relayFetch(pv,body,ms){
  return aiFetch(relayUrl(),{method:"POST",headers:{"content-type":"application/json","apikey":SHARE_KEY,"authorization":"Bearer "+SHARE_KEY,"x-install":installId()},body:JSON.stringify({provider:pv,body})},ms);
}
/* the provider's or the relay's error text from a failed answer's JSON body ("" when there is none) */
async function apiErrText(r){ try{ const j=await r.json(); return String((j.error&&(j.error.message||j.error))||j.message||""); }catch(e){ return ""; } }
function relayError(r,t){ return r.status===429?"the daily limit of the owner's relay is reached — try again tomorrow":r.status===404||r.status===503?"the owner's relay is not set up":"relay error "+r.status+(t?": "+t:""); }
async function setAiAccount(pv,acct){ const all={...aiAccounts()}; if(acct) all[pv]={...aiAcct(pv),...acct}; else delete all[pv]; await setSetting("aiAccounts",all); }
async function migrateAi(){
  if(!S.settings.aiKey) return; const pv=aiProvider();
  await setAiAccount(pv,{key:S.settings.aiKey, model:S.settings.aiModel||AI_PROVIDERS[pv].model, base:S.settings.aiBase||""});
  for(const k of ["aiKey","aiModel","aiBase"]){ delete S.settings[k]; idbDel("settings",k).catch(()=>{}); }
}
/* ---------- the framed area to the AI when the reading is weak (v173, H: "Send the crop to the AI when the reading is
   weak" — the one exception to "photos never leave the phone", under H's own switch) ----------
   A provider that takes pictures (vision: Qwen with its multimodal model, GLM with glm-4v-flash, Claude) reads the
   straightened reading crop — a JPEG of at most 800 px, never the whole photo — when the reader's best pass scores under
   WEAK_READ or found nothing. The active provider is used when it takes pictures, else the first one with a key that
   does. Setting "aiPicture" (absent = on). */
const pictureOn=()=>S.settings.aiPicture!==false;
function pictureProvider(){ if(!pictureOn()) return null; return [aiProvider(),...Object.keys(AI_PROVIDERS)].find(pv=>AI_PROVIDERS[pv].vision&&(aiKey(pv)||viaRelay(pv))&&aiBase(pv))||null; }
const pictureModel=pv=>AI_PROVIDERS[pv].vmodel||aiModel(pv);
const PIC_MAX=800;
async function pictureJpeg(blob){
  const bmp=await createImageBitmap(blob); const k=Math.min(1,PIC_MAX/Math.max(bmp.width,bmp.height));
  const cv=scaledCanvas(bmp,k); bmp.close();
  const out=await new Promise(res=>cv.toBlob(res,"image/jpeg",0.85));
  const b64=(await blobToB64(out)).d; return {b64,w:cv.width,h:cv.height,kb:Math.round(out.size/1024)};
}
const picSystem=()=>`You read the Chinese text on a photo for an adult learning to read Chinese in Beijing. The picture shows a sign, menu, product, label or logo. Answer with one JSON object only: {"zh":"…","p":"…","m":"…","note":"…","box":[left,top,right,bottom],"boxes":[[left,top,right,bottom],…],"cut":"…","apart":true|false,"labels":[{"zh":"…","p":"…","m":"…","box":[left,top,right,bottom]},…],"kind":"…","bad":true|false}. "zh" = the main Chinese text exactly as written on the picture, in simplified characters, with a line break between the picture's lines, without lines of Latin letters (a brand's English name), without numbers of the decoration and nothing you cannot see — a number that belongs to a Chinese line stays in that line with its unit, as written (净含量380ml, 30分钟, 3月1日): the learner reads it as part of the line — the main text only: leave out fine print, that is lines whose characters are under a third the height of the largest characters (dates, credits, small notes, slogans in small type), and leave out any line the picture's edge cuts off; "p" = pinyin with tone marks, one space between syllables, " / " between lines; "m" = natural ${meaningLangName()} meaning of the text as a sign or name (short, ${meaningLangName()} only); when the text is a brand, shop or product name, "m" is that name as it is known (the romanised or the international name), followed in brackets by what it is, in ${meaningLangName()} — e.g. "Mixue Bingcheng (ice-cream and bubble-tea chain)", never the bare name alone; when the text has several lines that say different things (a film poster: the title, then credits), "m" gives one short meaning per line, in the same order, joined with " / " as the pinyin is — e.g. "The Wandering Earth (film) / a film by / producer, original novel / Guo Fan, Liu Cixin" — so the learner sees which line means what; lines that form one phrase keep one meaning; "note" = one short remark if needed; "box" = where the text you read stands in the picture — one rectangle around all its lines, [left, top, right, bottom] in pixels of the picture (its size is given with the picture), tight around the characters; "boxes" = the same for each line of "zh" on its own, one rectangle per line in the same order — leave "boxes" out entirely when you give "labels", whose entries carry their own rectangles; "cut" = the edges of the picture that cut off a line of Chinese text you left out because of that — "top", "bottom", "left" or "right", several separated by commas, "" when no line is cut off; "apart" = true when the picture shows a user interface — the control panel of an appliance, a remote, a keypad, a lift panel, a vending machine, a ticket machine, a cash machine, a screenshot of a phone app — its home screen's grid of function icons (外卖, 团购, 酒店民宿, 闪购), the rows of an account page (我的订单, 待付款, 待收货, 退款/售后), a tab bar (首页, 视频, 购物车, 我的), the tab strip over a list (关注, 推荐, 新发), the blocks of a wallet or an order page, where every label names a function of its own — or several signs, labels, buttons, menu items or packages standing next to each other — a menu board, a shelf of price labels, a wall of notices, a building directory, a bus stop board, a row of shopfronts, the care instructions on a clothing label, the section headings on a package (配料表, 净含量, 保质期), the field labels of a form or a receipt (发票, 金额, 日期), the rows of a timetable or a price list —, whose Chinese texts each name their own button, setting, item or thing, so that a learner would learn them one by one; a price or an amount is never an element of its own, but it stays in the text of the item it belongs to, as any number does (宫保鸡丁 38元, 净含量380ml, 24H存包); false when the lines belong to one text (a poster's title and its credits, a sign's two lines, a brand name above a product name, a label's name and its ingredients); "labels" = only when "apart" is true: one entry per element, in reading order, left to right and top to bottom, every one of them, each with that element's own Chinese text, its own pinyin, its own meaning and its own rectangle around it — a smaller label under a bigger one (长按童锁 under 洗衣液) is an element of its own, not fine print; an element printed on two lines (加速 above 省时, 轻载 above 模式) is one entry 加速省时 with one rectangle around both lines; an element that reads 汤/粥 keeps the slash in its "zh", and its pinyin and meaning stay in that one entry; when "apart" is true, "zh" holds the same elements, one per line, in the same order, and none of them counts as fine print; "kind" = what the picture shows, one word out of exactly these eight: Menu (a menu board, a dish list, a price list of food), Street sign (a street name, a traffic or direction sign, a notice board outdoors), Shop (a shopfront, a shop name, a brand over a door), Product (packaging, a label, a bottle, a box, a tin), Appliance (the panel or buttons of a machine — a rice cooker, a washing machine, a coffee machine), Transport (a station, a bus stop, a ticket machine, a lift panel, a train or metro sign), Office (a door plate, a form, a receipt, an invoice, a document), Notice (a rule, a warning, an opening time, an instruction), App (a screenshot of a phone app — its home screen, an account page, a tab bar, a shop or order page); "" when none of them fits or you are not sure — never guess; always give "kind", also when "apart" is true and you list "labels": the kind is the picture's, not one label's; "bad" = true only when the picture shows no readable Chinese text — then leave "zh" empty and omit "box" and "boxes". An on-device reader tried first and produced the readings listed by the user; most of them are wrong, use them only as hints. No prose, no code fences.`; /* the meaning in the app's language (v256) */
/* Qwen's hybrid models think by default, and the thinking takes many seconds before the short JSON comes (v208, H with Qwen
   as the active provider: "Check pinyin and meaning takes way too long" — until v207 only the picture path switched it off) */
function noThinking(pv,model,body){ if(pv==="qwen"&&/^qwen3/.test(model)) body.enable_thinking=false; return body; }
async function aiReadPicture(blob,alts,status){
  const pv=pictureProvider(); if(!pv) throw new Error("no picture provider");
  const key=aiKey(pv), model=pictureModel(pv), pic=await pictureJpeg(blob), relay=!key&&viaRelay(pv);
  const text=`Read the Chinese text on this picture (${pic.w}×${pic.h} pixels). The reader's guesses: ${alts.length?alts.map(a=>a.replace(/\n/g," / ")).join(" | "):"none"}.`; /* the size, so the box comes in its pixels (v294 — fractions came out shifted by a tenth on H's poster) */
  const req=`[picture ${pic.w}×${pic.h} JPEG, ${pic.kb} KB] ${text}`; /* the log never carries the picture */
  status&&status("Asking the AI about the picture …");
  let r; const t0=Date.now();
  try{
    if(pv==="claude")
      r=await aiFetch(aiBase(pv),{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model,max_tokens:PIC_TOKENS,system:picSystem(),messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:pic.b64}},{type:"text",text}]}]})},PIC_TIMEOUT_MS);
    else { const body={model,max_tokens:PIC_TOKENS,temperature:0,messages:[{role:"system",content:picSystem()},{role:"user",content:[{type:"text",text},{type:"image_url",image_url:{url:"data:image/jpeg;base64,"+pic.b64}}]}]};
      noThinking(pv,model,body);
      r=relay?await relayFetch(pv,body,PIC_TIMEOUT_MS):await aiFetch(aiBase(pv)+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+key},body:JSON.stringify(body)},PIC_TIMEOUT_MS); }
  }catch(err){ logAi({model,req,err:"no connection: "+(err&&err.message||err)}); throw new Error(AI_NET_ERR); }
  if(!r.ok){ const t=await apiErrText(r); logAi({model,status:r.status,req,err:t}); throw new Error(relay?relayError(r,t):"API error "+r.status+(t?": "+t:"")); }
  const data=await r.json(); countTokens(pv,data); bump("pics"); bumpModel(model); /* the usage counters and the daily row count the picture readings (v178, H) and the model (v179) */
  const raw=pv==="claude"?(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join(""):String(((data.choices||[])[0]||{}).message?.content||"");
  logAi({model,status:r.status,ms:Date.now()-t0,req,res:raw.slice(0,1500)});
  await loadScriptTables().catch(()=>{});
  const txt=raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,""); let x; try{ x=JSON.parse(txt); if(Array.isArray(x)) x=x[0]; }catch(e){ x=mendJSON(txt); if(!x) throw new Error("could not read the model's answer");
    logRead(`the AI's answer stopped in the middle — kept what came (${Object.keys(x).join(", ")})`); }
  if(!x||typeof x!=="object") throw new Error("unexpected answer");
  let lines0=String(x.zh||"").replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean), lineBoxes=Array.isArray(x.boxes)?x.boxes:null;
  /* a line of Latin letters alone leaves the answer (v381, H's washing machine: the model answered a "Bra" line beside the
     nineteen Chinese ones, so the reading's lines held it while every later comparison counts the Chinese lines only — the
     check that an AI answer still fits its lines then found 19 against 20, dropped the whole answer, and the panel's labels
     lost their split and their meaning). The line's pinyin and meaning go with it, and its box, so the rest stays aligned. */
  { const keep=lines0.map(l=>CJK.test(l));
    if(keep.some(Boolean)&&!keep.every(Boolean)){
      const pp=String(x.p||"").split(/\s*\/\s*/), mp=String(x.m||"").split(/\s*\/\s*/);
      logRead(`a line of Latin letters left out of the AI's answer: ${lines0.filter((l,i)=>!keep[i]).join(" | ")}`);
      if(pp.length===lines0.length) x.p=pp.filter((v,i)=>keep[i]).join(" / ");
      if(mp.length===lines0.length) x.m=mp.filter((v,i)=>keep[i]).join(" / ");
      if(lineBoxes&&lineBoxes.length===lines0.length) lineBoxes=lineBoxes.filter((v,i)=>keep[i]);
      lines0=lines0.filter((l,i)=>keep[i]); } }
  const main=mainLines(lines0,x.p,x.m,lineBoxes?lineBoxes.map(b=>picBox(b,pic.w,pic.h)):null,picBox(x.box,pic.w,pic.h));
  const altBox=picBoxPix(x.box,pic.w,pic.h), mainAlt=altBox?mainLines(lines0,x.p,x.m,lineBoxes?lineBoxes.map(b=>picBoxPix(b,pic.w,pic.h)||picBox(b,pic.w,pic.h)):null,altBox):null; /* the second reading of a box that passes the picture's edge (v340), through the fine-print rule like the first (v343 polish): its box is the kept lines' union too, and its dropped boxes are its own */
  const zhRaw=main.lines.join("\n"), zh=t2s(zhRaw), m=saneM(main.m,zh);
  /* the elements of a user interface, and of any picture of separate signs or labels (v358, H: "you have to find out if the image is
     a user interface and then put a card for each and every single element of it", then "Also for all kinds of signs and labels"): one question — "ui" — and the answer's own list of elements. Data, not one joined string: the
     pinyin of 汤/粥 is "tāng / zhōu" and its meaning "soup / congee", so splitting the joined "p" and "m" on " / " gives more parts
     than there are labels and the app could not tell them apart. The fine-print rule of v312 does not touch this list — a small
     label under a bigger one is an element of the panel, not a poster's credits — so the labels are read from the raw answer. */
  const apart=!!x.apart;
  let labels=null;
  if(apart&&Array.isArray(x.labels)&&x.labels.length>=SPLIT_MIN){
    /* the labels are read the way most of them are read (v379, H's washing machine at v378: the model's grid puts the last
       column at x 770–830 of an 800 px picture, so that one box alone came out over the picture's width and picBox took it for
       the 0–1000 grid while the other eighteen were pixels — "their boxes are not all on the same scale" and the panel kept one
       card). One column overshooting the edge by a little says nothing about the answer's scale: the majority decides, ties go
       to the union box's own reading, and a box read on the majority's scale is clamped to the picture as any box is. */
    const tally={}; for(const l of x.labels){ const sc=picScale(l&&l.box,pic.w,pic.h,LABEL_MIN); if(sc) tally[sc]=(tally[sc]||0)+1; }
    const uni=picScale(x.box,pic.w,pic.h), how=Object.keys(tally).sort((a,b)=>tally[b]-tally[a]||(a===uni?-1:b===uni?1:0))[0]||null;
    const odd=Object.keys(tally).length-1;
    if(odd>0) logRead(`${Object.keys(tally).map(k=>tally[k]+" "+k).join(", ")} — the labels are all read as ${how}`);
    const seen=new Set();
    labels=x.labels.map(l=>{ const lz=t2s(String(l&&l.zh||"").trim().replace(/\s+/g,"")), bx=picBox(l&&l.box,pic.w,pic.h,LABEL_MIN,how);
      if(!lz||!CJK.test(lz)||!bx||seen.has(lz+"|"+bx.join())) return null; seen.add(lz+"|"+bx.join());
      return {zh:lz,p:String(l.p||"").trim(),m:String(l.m||"").trim(),box:bx,scale:how}; }).filter(Boolean);
    /* every label's pinyin is checked against its own characters (v389, H's 洗衣液 card read "x yī yè" — Qwen dropped the ǐ
       of xǐ, and the v187 check ran on the answer's own "p" alone, never on the labels' own): a broken syllable is replaced
       by the app's own pinyin, label by label */
    for(const l of labels) l.p=await saneP(l.p,l.zh);
    if(labels.length<SPLIT_MIN) labels=null;
  }
  /* what came back, in one line of the log (v374): the shape of the answer survives a restart, so a panel that made one card can
     be read back afterwards — until v373 only the split's own lines said anything, and they lived in memory */
  logRead(`the AI's answer: ${lines0.length} ${lines0.length===1?"line":"lines"}, apart ${apart?"yes":"no"}, ${Array.isArray(x.labels)?x.labels.length:0} labels${Array.isArray(x.labels)&&x.labels.length?" ("+(labels?labels.length:0)+" usable)":""}, ${Array.isArray(x.boxes)?x.boxes.length:0} boxes, meaning ${String(x.m||"").length} characters`);
  return {zh,zht:zh!==zhRaw?zhRaw:"",p:await saneP(main.p,zh),m,ml:LANG,note:String(x.note||"").trim(),bad:!!x.bad||!CJK.test(zh),model,pv,box:main.box,boxAlt:mainAlt?mainAlt.box:null,droppedBoxesAlt:mainAlt?mainAlt.droppedBoxes:null,boxes:main.boxes,dropped:main.dropped,droppedBoxes:main.droppedBoxes,cut:String(x.cut||"").toLowerCase().replace(/[^a-z,]/g,""),kind:String(x.kind||"").trim(),apart,labels,boxScale:picScale(x.box,pic.w,pic.h)}; /* cut (v314): the edges that cut off a line the model left out */
}
/* the main text only (v312, H's 青春无烟 / 未来无限 poster: the card carried the poster's small print — the line 第39个世界无烟日 above the title and the date 2026年5月31日 世界无烟日 below it, half of it outside the frame — "wieder die Sachen ausserhalb des Crops und das Kleingedruckte mitgelesen. Bitte beides vermeiden"): the prompt asks for the main text and leaves fine print and lines the picture's edge cuts off to the model; this is the safety net from the model's own line boxes — a line whose box is under FINE_PRINT of the tallest line's height is fine print and goes, with its pinyin and meaning parts when they come one per line; the box for the frame is then the union of the lines kept */
const FINE_PRINT=1/3;
function mainLines(lines,p,m,boxes,box){
  const out={lines,p:String(p||""),m:String(m||""),box,boxes:null,dropped:[],droppedBoxes:[]};
  if(!boxes||boxes.length!==lines.length||boxes.some(b=>!b)||lines.length<2) return out;
  const hs=boxes.map(b=>b[3]-b[1]), hmax=Math.max(...hs), keep=hs.map(h=>h>=FINE_PRINT*hmax);
  if(keep.every(Boolean)) return {...out,boxes};
  const pp=out.p.split(/\s*\/\s*/), mp=out.m.split(/\s*\/\s*/);
  out.dropped=lines.filter((l,i)=>!keep[i]); out.droppedBoxes=boxes.filter((b,i)=>!keep[i]); out.lines=lines.filter((l,i)=>keep[i]); out.boxes=boxes.filter((b,i)=>keep[i]); /* the fine print's boxes stay out of the snap (v328) */
  if(pp.length===lines.length) out.p=pp.filter((x,i)=>keep[i]).join(" / ");
  if(mp.length===lines.length) out.m=mp.filter((x,i)=>keep[i]).join(" / ");
  const u=out.boxes; out.box=[Math.min(...u.map(b=>b[0])),Math.min(...u.map(b=>b[1])),Math.max(...u.map(b=>b[2])),Math.max(...u.map(b=>b[3]))];
  return out;
}
/* the text's box from the picture answer (v293), as fractions of the sent picture: the prompt asks for fractions, a model that answers in the picture's pixels or on a 0–1000 grid is scaled back; anything else is no box */
const PIC_MIN=0.02, LABEL_MIN=0.005; /* a box must cover this much of the picture — the union box a fiftieth (v293), one label of a phone screenshot far less: 外卖 is 30 of 2520 pixels tall on H's Meituan home screen (v367) */
function picBox(b,w,h,min,force){ /* force (v379): read the numbers this way — the labels of one panel must all be read alike */
  if(!Array.isArray(b)||b.length!==4||!b.every(v=>typeof v==="number"&&isFinite(v)&&v>=0)) return null;
  let [x0,y0,x1,y1]=b; const mx=Math.max(x0,x1), my=Math.max(y0,y1);
  const how=force||(mx>1||my>1?(mx<=w&&my<=h?"px":(mx<=1000&&my<=1000?"grid":null)):"frac");
  if(!how) return null;
  if(how==="px"){ x0/=w; x1/=w; y0/=h; y1/=h; } else if(how==="grid"){ x0/=1000; x1/=1000; y0/=1000; y1/=1000; }
  const cl=v=>Math.max(0,Math.min(1,v)); x0=cl(x0); y0=cl(y0); x1=cl(x1); y1=cl(y1); /* clamped before the size test (v379): forced onto another scale a box may lie wholly outside the picture, and what is left of it must still be a box */
  if(!(x1-x0>=(min||PIC_MIN)&&y1-y0>=(min||PIC_MIN))) return null;
  return [x0,y0,x1,y1];
}
function mendJSON(txt){ /* an answer the model's token budget cut in the middle (v360, H's washing machine: 26 buttons, and the answer
  stopped inside its "boxes" array): close what is open and keep the fields that came whole — the app then has the text even when
  the boxes or the labels never arrived, instead of nothing at all */
  let t=String(txt||""); const i=t.indexOf("["), j=t.indexOf("{");
  if(j<0) return null; if(i>=0&&i<j) t=t.slice(i+1); /* an array of one object, as some models answer */
  t=t.slice(t.indexOf("{"));
  for(let end=t.length;end>0;end--){ /* cut back to the last comma or closing bracket, then close every open bracket */
    const c=t[end-1]; if(c!==","&&c!=="}"&&c!=="]"&&c!=='"'&&!/[\w一-鿿]/.test(c)) continue;
    let cut=t.slice(0,end).replace(/,\s*$/,""), depth=[], str=false, esc=false;
    for(const ch of cut){ if(str){ if(esc) esc=false; else if(ch==="\\") esc=true; else if(ch==='"') str=false; continue; }
      if(ch==='"') str=true; else if(ch==="{"||ch==="[") depth.push(ch==="{"?"}":"]"); else if(ch==="}"||ch==="]") depth.pop(); }
    if(str||esc) continue; /* the cut fell inside a string: try a shorter one */
    cut=cut.replace(/,\s*$/,"").replace(/:\s*$/,":null");
    while(depth.length) cut+=depth.pop();
    try{ const v=JSON.parse(cut); if(v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length) return v; }catch(e){}
  }
  return null;
}
function picScale(b,w,h,min){ /* how picBox read these numbers — as fractions, as the picture's pixels or on the 0–1000 grid (v358): a
  panel's labels must all be read the same way, or some of them land somewhere else entirely */
  if(!picBox(b,w,h,min)) return null;
  const mx=Math.max(b[0],b[2]), my=Math.max(b[1],b[3]);
  return mx>1||my>1?(mx<=w&&my<=h?"px":"grid"):"frac";
}
/* the other reading of a box that overshoots the picture a little (v340, H's ARRI poster 突破光影边界, 2026-09-08: Qwen answered
   [120,330,860,450] for an 800×600 picture — pixels, with the right edge 60 px past the picture, since the title runs to its
   edge; 860 > 800 made picBox take the 0–1000 grid, the box landed on the blank blue above the title, the snap found no ink
   there and the frame was placed on nothing: the card showed ARRI with the title cut off at the bottom): a box whose values
   pass the picture's size by at most PIX_OVER is also pixels clamped to the picture — the snap decides which reading holds
   characters (cropSign's box branch) */
const PIX_OVER=1.2;
function picBoxPix(b,w,h){
  if(!Array.isArray(b)||b.length!==4||!b.every(v=>typeof v==="number"&&isFinite(v)&&v>=0)) return null;
  const [x0,y0,x1,y1]=b, mx=Math.max(x0,x1), my=Math.max(y0,y1);
  if(!((mx>w||my>h)&&mx<=w*PIX_OVER&&my<=h*PIX_OVER&&mx<=1000&&my<=1000)) return null; /* only the ambiguous case: past the picture, within the grid */
  const r=[Math.max(0,x0/w),Math.max(0,y0/h),Math.min(1,x1/w),Math.min(1,y1/h)];
  return r[2]-r[0]>=0.02&&r[3]-r[1]>=0.02?r:null;
}
function aiQueue(){ return deck().filter(d=>d.c&&(d.flag||(d.mt&&(d.mt.pending||d.mt.suspect)))); } /* a card still waiting for its reading has no text to check (v237) */
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
  return { c:d.c, p:d.p, m:d.m, kind:d.kind||"word", note:d.flagNote||"", why:d.tagOnly?"name \"kind\" for this card and nothing else; keep zh, p and m exactly as given":d.translate?"translate the meaning into "+meaningLangName()+" (it is in "+(LANG_NAME[d.ml||"en"]||"another language")+" now); keep zh and p unless clearly wrong":[d.flag?"flagged by the learner":"", d.mt&&d.mt.suspect?"the reading looks uncertain ("+d.mt.suspect+"), check the characters":"", d.mt&&d.mt.pending?"meaning is only a word-by-word gloss, needs a real translation":""].filter(Boolean).join("; "),
    gloss:d.kind==="sign"?(d.gloss||[]).map(g=>g.w+" "+(g.m||"?")).join(" · "):undefined,
    alt:d.alts&&d.alts.length?d.alts:undefined, script:d.trad?"traditional":undefined };
}
/* the meaning in the app's language (v256, PR 4 of the multi-language UI — H: "Go, with the button"): the prompts ask for the
   meaning in the language of the app, every AI answer carries ml = that language, and a card stores the language of its
   meaning as ml (absent = English: the dictionary, the phrasebook and the offline model speak English, and every card before
   v256 does). meaningLangName() is the language's English name for the model. */
const meaningLangName=()=>LANG_NAME[LANG]||"English";
const mlOf=d=>d.ml||"en"; /* the language of a card's meaning */
const setMl=(card,ml)=>{ if(ml&&ml!=="en") card.ml=ml; else delete card.ml; if(card.m) card.ms={...(card.ms||{}),[ml||"en"]:card.m}; return card; }; /* English is the absent default; ms keeps every meaning the card got, by language (v265) */
/* one meaning per language on the card (v265, H's "Go" on idea 2): ms = {en:"…", de:"…"} holds every meaning a card got — set wherever a
   meaning gets its language (setMl) —, m stays the meaning shown and ml its language. syncMeanings() at boot and on a language switch
   shows the meaning the card already has in the app's language, in one transaction, so a switch back to a known language is instant
   and free; a card without one keeps its meaning and the pill, and Translate all fills it. A typed meaning replaces only its own
   language; a changed Chinese text drops the other languages' meanings (applyCardUpdate). Cards from before v265 get ms at boot. */
async function syncMeanings(){
  const rows=[];
  for(const d of S.custom){ if(!d.m) continue; let u=null;
    if(!d.ms){ u={...d, ms:{[mlOf(d)]:d.m}}; } /* v265 migration: the meaning it has, under its language */
    const ms=(u||d).ms; if(ms[LANG]&&mlOf(u||d)!==LANG){ u={...(u||d), m:ms[LANG]}; setMl(u,LANG); } /* the meaning in the app's language, already there */
    if(u) rows.push(u); }
  if(!rows.length) return 0;
  try{ await idbPutMany("custom",rows); }catch(e){ logErr("meanings","sync: "+(e&&e.message||e)); return 0; }
  for(const r of rows){ const i=S.custom.findIndex(x=>x.id===r.id); if(i>=0) S.custom[i]=r; }
  return rows.length;
}
const langName=code=>(LANGS.find(([c])=>c===code)||[code,code])[1]; /* a language's own name (Deutsch, 日本語) */
const mlPill=d=>d.m&&mlOf(d)!==LANG?`<span class="pill lang" title="${esc(t("The meaning is in another language than the app."))}">${esc(langName(mlOf(d)))}</span>`:""; /* a card whose meaning is in another language than the app (v258, PR 5): the pill names it, on the back and in the Cards list; Translate all or an AI check takes it away */
/* the model's meaning is taken only when it is a meaning and not the Chinese text echoed (v97; since v256 by language: a Japanese
   meaning is kanji and kana, a Korean one hangul — Latin letters are no longer the test there; an all-Han answer that is the text itself is dropped) */
function saneM(m,zh){
  m=String(m||"").trim(); if(!m) return "";
  const flat=x=>String(x||"").replace(/[\s\n/·,;。，、]/g,""); const echoed=flat(m)===flat(zh)||flat(t2s(m))===flat(zh);
  const han=/[\u4e00-\u9fff]/.test(m), latin=/[A-Za-z\u00C0-\u024F]{2}/.test(m), kana=/[\u3040-\u30ff]/.test(m), hangul=/[\uAC00-\uD7AF]/.test(m);
  const bad=echoed||(han&&!latin&&!kana&&!hangul&&LANG!=="ja");
  if(bad){ logErr("ai","meaning answered in Chinese: "+m); return ""; }
  return m;
}
/* the model's pinyin is taken only when it fits the characters (v187, H's 志在千里: Qwen answered "zhì zài qiān l" twice, the
   ǐ lost, and the card showed it): one syllable per character, each with a vowel — else the app's own pinyin for the text */
const PY_VOWELS=/[aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]+/gi;
async function saneP(p,zh){
  const lines=String(zh||"").split("\n").filter(l=>CJK.test(l)); if(!lines.length) return String(p||"").trim();
  const given=String(p||"").split("/").map(l=>l.trim().split(/\s+/).filter(Boolean));
  /* one vowel group per character (syllables may be joined into words, as some models write them), digits aside; a token without a vowel is a broken syllable */
  const nuclei=toks=>toks.filter(x=>!NUM_PART.test(x)).reduce((a,x)=>a+(x.match(PY_VOWELS)||[]).length,0);
  const ok=given.length===lines.length&&given.every((toks,k)=>toks.length>0&&nuclei(toks)===[...lines[k]].filter(c=>CJK.test(c)).length&&toks.every(x=>NUM_PART.test(x)||(x.match(PY_VOWELS)||[]).length>0));
  if(ok) return given.map(l=>l.join(" ")).join(" / ");
  try{ if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js"); return lines.map(pySpaced).join(" / "); }catch(e){ return String(p||"").trim(); }
}
const aiSystem=()=>`You review flashcards for an adult learning to read Chinese in Beijing. Cards come from OCR of photos (signs, menus, packaging), so the Chinese text may contain OCR slips, the pinyin is auto-generated and the meaning may be a crude word-by-word gloss.
For every card return the corrected card. Rules: "zh" = the Chinese text in simplified characters (always simplified, even when the sign is traditional), fixed only if it is clearly an OCR slip (keep line breaks); "p" = pinyin with tone marks, correct for this context (多音字!), one space between syllables, " / " between lines; "m" = natural ${meaningLangName()} meaning of the whole text as a sign or word (short, in ${meaningLangName()} only, no explanations — the input meaning may be in another language, answer in ${meaningLangName()}); when the text is a brand, shop or product name, "m" is that name as it is known (the romanised or the international name), followed in brackets by what it is, in ${meaningLangName()} — e.g. "Mixue Bingcheng (ice-cream and bubble-tea chain)", never the bare name alone; when the text has several lines that say different things (a film poster: the title, then credits), "m" gives one short meaning per line, in the same order, joined with " / " as the pinyin is — e.g. "The Wandering Earth (film) / a film by / producer, original novel / Guo Fan, Liu Cixin" — so the learner sees which line means what; lines that form one phrase keep one meaning; the text is usually a real sign, menu item, product name or brand — when the readings circle around a well-known brand or product name, "zh" is that name; "note" = one short sentence on what was wrong, or "ok" (in English); "ok" = true when zh, pinyin and meaning were already right; "zht" = only when the input has "script":"traditional" (the photo shows traditional characters): "zh" written in traditional characters as it stands on the sign; "alt" (when present) = other readings of the same photo by other OCR passes and models — the true text is often a mix of them, or a well-known name or phrase they all circle around; prefer a real sign, menu or product text that every reading could be a misreading of; "kind" = what the text stands on, judged from the text itself, one word out of exactly these eight: Menu (a dish, a drink, a menu board), Street sign (a street name, a traffic or direction sign), Shop (a shop name, a brand over a door), Product (packaging, a label, a bottle, a box), Appliance (a button or setting of a machine — a rice cooker, a washing machine, a coffee machine), Transport (a station, a bus stop, a ticket machine, a lift panel), Office (a door plate, a form, a receipt, an invoice), Notice (a rule, a warning, an opening time, an instruction), App (a button, a menu entry or a screen name of a phone app); "" when none of them fits or you are not sure — never guess; "bad" = true when the Chinese text is OCR garbage — no plausible sign, menu or product text can be made of it — then keep "zh" as given, leave "m" empty and say so in the note. Before calling a text bad, try the "alt" readings: when one of them, or a mix of them, is a plausible text or a well-known name (a brand on a bottle, a shop name), answer with that as "zh", "bad" false, and say in the note which reading you used. Never replace an unreadable text with a mere guess.
Answer with a JSON array only, one object per input card in the same order: [{"c":"<input c>","zh":"…","p":"…","m":"…","note":"…","kind":"…","ok":true|false,"bad":true|false}]. No prose, no code fences.`; /* the meaning in the app's language (v256) — meaningLangName() is read when the request goes out */
async function aiAsk(cards,status){
  const pv=textProvider(), key=aiKey(pv), relay=!key&&viaRelay(pv); if(!key&&!relay) throw new Error("no API key");
  const model=aiModel(pv), user=JSON.stringify(cards.map(aiCardPayload));
  status&&status(`asking ${model} about ${cards.length} card${cards.length>1?"s":""} …`);
  let r; const t0=Date.now();
  try{
    if(pv==="claude")
      r=await aiFetch(aiBase(pv),{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model,max_tokens:4000,system:aiSystem(),messages:[{role:"user",content:user}]})});
    else { /* OpenAI-style chat completions (DeepSeek, Qwen, GLM, …), direct with the phone's key or through the owner's relay */
      const body=noThinking(pv,model,{model,max_tokens:4000,temperature:0,messages:[{role:"system",content:aiSystem()},{role:"user",content:user}]});
      r=relay?await relayFetch(pv,body):await aiFetch(aiBase(pv)+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+key},body:JSON.stringify(body)}); }
  }catch(err){ logAi({model,req:user.slice(0,1500),err:"no connection: "+(err&&err.message||err)+(/^no answer within/.test(err&&err.message||"")?" — the connection hangs, or the provider is slow":pv==="claude"?" — the API may be blocked without a VPN":" — offline, or this provider refuses calls from a browser")}); throw new Error(AI_NET_ERR); }
  if(!r.ok&&relay){ const t=await apiErrText(r); logAi({model,status:r.status,req:user.slice(0,1500),err:t}); throw new Error(relayError(r,t)); }
  if(r.status===401||r.status===403) throw new Error("API key rejected ("+r.status+")");
  if(r.status===402) throw new Error("no credit left at "+AI_PROVIDERS[pv].name);
  if(!r.ok){ const t=await apiErrText(r); throw new Error("API error "+r.status+(t?": "+t:"")); }
  const data=await r.json(); countTokens(pv,data); bumpModel(model);
  const raw=pv==="claude"?(data.content||[]).filter(x=>x.type==="text").map(x=>x.text).join(""):String(((data.choices||[])[0]||{}).message?.content||"");
  logAi({model,status:r.status,ms:Date.now()-t0,req:user.slice(0,1500),res:raw.slice(0,1500)});
  await loadScriptTables().catch(()=>{}); /* v103: the model answered a traditional sign with traditional "zh" — the card's key is always simplified */
  const text=raw.trim().replace(/^```(?:json)?\s*|\s*```$/g,"");
  let arr; try{ arr=JSON.parse(text); }catch(e){ throw new Error("could not read the model's answer"); }
  if(!Array.isArray(arr)) throw new Error("unexpected answer");
  const out=[]; for(const x of arr){
    const zhRaw=String(x.zh||"").trim(), zh=t2s(zhRaw), zht=String(x.zht||"").trim()||(zh!==zhRaw?zhRaw:""), m=saneM(x.m,zh);
    out.push({zh,zht,p:x.bad?String(x.p||"").trim():await saneP(x.p,zh),m,ml:LANG,note:String(x.note||"").trim(),kind:String(x.kind||"").trim(),ok:!!x.ok,bad:!!x.bad,at:Date.now(),model}); }
  return out;
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
  const a=d.ai, upd={...d, p:a.p||d.p, m:a.m||d.m}; if(a.m) setMl(upd,a.ml); /* the meaning's language comes with the suggestion (v256) */
  delete upd.ai; delete upd.flag; delete upd.flagNote;
  upd.mt={...(upd.mt||{}), src:"llm", verified:true, pending:false}; delete upd.mt.suspect;
  const newC=a.zh&&CJK.test(a.zh)?a.zh.replace(/\r/g,""):d.c;
  await applyCardUpdate(id,upd,newC,true);
}
/* one tap for everything waiting: accept every suggestion */
async function aiAcceptAll(){
  const list=deck().filter(d=>d.ai);
  const before={}; for(const d of list){ const {img,imgFull,...rest}=d; before[d.id]=rest; } /* the whole card but its pictures, so Undo last run takes a whole Accept all back (v370) */
  for(const d of list) await aiAccept(d.id);
  if(list.length) await saveLastRun("accept","*",before,list.length);
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
  if(a.bad) return `<div class="aibox bad"><div class="aihead">${t("AI: this text looks misread")}</div>${a.note?`<div class="ainote">${esc(a.note)}</div>`:""}
    <div class="aiacts"><button class="btn mini primary" data-aiflag="${esc(d.id)}">${t("⚑ Flag for review")}</button><button class="btn mini" data-aino="${esc(d.id)}">${t("Dismiss")}</button></div></div>`;
  if(a.zh&&a.zh!==d.c) chg.push(`<div class="hanzi">${esc(a.zh).replace(/\n/g,"<br>")}</div>`);
  if(a.p&&a.p!==d.p) chg.push(`<div class="mono">${esc(a.p)}</div>`);
  if(a.m&&a.m!==d.m) chg.push(`<div>${esc(a.m)}</div>`);
  return `<div class="aibox"><div class="aihead">${t("AI suggestion")}${a.ok&&!chg.length?t(": looks right"):""}</div>
    ${chg.join("")}${a.note&&a.note.toLowerCase()!=="ok"?`<div class="ainote">${esc(a.note)}</div>`:""}
    <div class="aiacts"><button class="btn mini primary" data-aiok="${esc(d.id)}">${chg.length?t("Accept"):t("Mark verified")}</button><button class="btn mini" data-aino="${esc(d.id)}">${t("Dismiss")}</button></div></div>`;
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
  const list=S.custom.filter(d=>d.c&&d.mt&&(d.mt.pending||d.mt.suspect)&&!d.ai); if(!list.length) return; /* a card still waiting for its reading has no text yet (v237) */
  _aiAutoRan=true;
  try{ await aiReview(list); if(S.mode==="more"||S.mode==="cards"||S.mode==="inbox") render(); }catch(e){ console.warn("AI auto review:",e); }
}
/* About: what leaves the phone, live with the AI settings (v173) */
function aboutText(){ const ver=($(".ver")||{}).textContent||""; return `${ver}. ${t("Works offline. Cards and photos stay on this phone; anonymous usage counts go to the app's owner.")}${(pv=>pv?" "+t("Only when the reading is weak, the framed area of a photo goes to {0}.",AI_PROVIDERS[pv].short):"")(pictureProvider())}`; } /* names the AI (v216, H: "goes to your AI provider" is wrong — a friend's phone has no provider of its own); the relay stays out of About (v217, H) — the AI row's What-is-sent line and privacy.html describe it */
/* More → Online AI review row + inline setup form */
function renderAiRow(){
  const st=$("#ai-status"), btn=$("#ai-btn"), run=$("#ai-run"), form=$("#ai-form"); if(!st) return;
  const all=aiQueue(), q=all.length, fl=all.filter(d=>d.flag).length, sp=all.filter(d=>!d.flag&&d.mt.suspect).length, pd=q-fl-sp;
  const ppv=pictureProvider(); const ab=$("#about-s"); if(ab) ab.textContent=aboutText();
  const relayed=viaRelay()||(ppv&&viaRelay(ppv)); /* the first line names the models and says which one does what (v195, H: "I liked the previous text more — revert and polish the first paragraph") */
  const who=`${AI_PROVIDERS[textProvider()].short} (${aiModel(textProvider())})`, pic=ppv?`${AI_PROVIDERS[ppv].short} (${pictureModel(ppv)})`:"";
  st.textContent=!aiOn()?t("Off. The app's owner sets it up under Advanced settings.")
    :S.settings.aiAuto===false?(pic?t("Off. {0} and {1} are set up{2} — tick the box to check new cards.",who,pic,relayed?t(" through the app owner's relay"):""):t("Off. {0} is set up{1} — tick the box to check new cards.",who,relayed?t(" through the app owner's relay"):"")) /* the line follows the switch (v196, H: "it cannot say On when I've unticked the checkbox") */
    :(pic?t("On{0}: {1} checks the text, {2} reads the framed area when the reading is weak.",relayed?t(", through the app owner's relay"):"",who,pic):t("On{0}: {1} checks the text. Photos never leave the phone.",relayed?t(", through the app owner's relay"):"",who));
  if(btn) btn.textContent=aiOn()?"Settings":"Set up";
  run.hidden=!aiOn(); run.disabled=!q;
  run.textContent=q?t("Ask AI"):t("Nothing to review");
  const rs=$("#ai-runstatus"); if(rs) rs.textContent=q?t("{0} waiting: {1} flagged, {2} uncertain, {3} pending translation.",nOf(q,"card"),fl,sp,pd):t("Nothing waiting. Flag a card, or save a reading that looks uncertain.");
  const auto=$("#ai-auto"); if(auto) auto.onchange=async e=>{ await setSetting("aiAuto",!!e.target.checked); renderAiRow(); }; /* the one AI setting everyone sees (v190); the setup form is the owner's */
  if(!btn||!form) return;
  btn.onclick=()=>{ form.hidden=!form.hidden; if(!form.hidden&&!aiKey(form.dataset.pv)) $("#ai-key").focus(); };
  /* the form shows one provider at a time (form.dataset.pv, the active one at first); its chip is lit, its key, model
     and base come from its account; a tap on a chip with a key makes that provider active at once, a tap on one
     without a key only shows its empty form — the active provider keeps working until a key is saved here */
  const chips=[...form.querySelectorAll("[data-aipv]")], showPv=pv=>{ form.dataset.pv=pv; const P=AI_PROVIDERS[pv];
    chips.forEach(c=>c.classList.toggle("on",c.dataset.aipv===pv));
    $("#ai-basefield").hidden=pv!=="custom"; $("#ai-picfield").hidden=!P.vision; $("#ai-where").textContent=P.where; $("#ai-key").placeholder=P.hint;
    $("#ai-key").value=aiKey(pv); $("#ai-model").value=aiModel(pv); $("#ai-base").value=aiAcct(pv).base||(pv==="custom"?S.settings.aiBase||"":""); delete $("#ai-model").dataset.hand;
    $("#ai-acct").textContent=aiKey(pv)?`${P.name}: key saved${pv===aiProvider()?", in use":""}.`:viaRelay(pv)?`${P.name}: no key on this phone — the owner's relay is used.`:`${P.name}: no key yet.`; };
  chips.forEach(c=>c.onclick=async()=>{ const pv=c.dataset.aipv; if(aiKey(pv)&&pv!==aiProvider()){ await setSetting("aiProvider",pv); renderAiRow(); } showPv(pv); });
  showPv(form.dataset.pv&&AI_PROVIDERS[form.dataset.pv]?form.dataset.pv:aiProvider());
  $("#ai-save").onclick=async()=>{
    const key=$("#ai-key").value.trim(), model=$("#ai-model").value.trim(), pv=form.dataset.pv;
    await setAiAccount(pv,{key:key||aiKey(pv), model:model||AI_PROVIDERS[pv].model, base:$("#ai-base").value.trim()});
    if(key||aiKey(pv)) await setSetting("aiProvider",pv);
    if(AI_PROVIDERS[pv].vision) await setSetting("aiPicture",$("#ai-picture").checked);
    form.hidden=true; renderAiRow();
  };
  /* Remove key takes the shown provider's key only; when that was the active one, the next provider with a key takes
     over, and without any the AI is off */
  $("#ai-remove").onclick=async()=>{ const pv=form.dataset.pv; await setAiAccount(pv,null);
    if(pv===aiProvider()){ delete S.settings.aiKey; idbDel("settings","aiKey").catch(()=>{}); const next=Object.keys(AI_PROVIDERS).find(k=>aiKey(k)); if(next) await setSetting("aiProvider",next); else if(!aiOn()) await setSetting("aiAuto",false); } /* the automatic check goes off only when no AI is left — with the relay it stays (v192: H's phone lost its checks after Remove key while the relay still read pictures) */
    form.hidden=true; renderAiRow(); };
  run.onclick=async()=>{
    run.disabled=true; const rs=$("#ai-runstatus");
    try{ const n=await aiReview(null,x=>{ rs.textContent=x; }); rs.textContent=t("{0} ready. Accept or dismiss them under Cards.",nOf(n,"suggestion")); }
    catch(err){ rs.textContent=t("Failed: {0}",err&&err.message||err); run.disabled=false; }
  };
}
/* ---------- progress: cards learned, this week, streak of days ---------- */
function dayKey(t){ const d=new Date(t||Date.now()); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
/* ---------- usage counters and the owner's report (v162, H: "track who is using the app, how many times, how many words,
   how many tokens") ---------- counted on the phone only, in setting "usage": opens, reviews, byPhoto, byHand, deleted,
   aiCalls, aiIn, aiOut, pics (readings from the picture, v178), models{} (the reader and each AI model by name, v179) — all time and in m{} for the current month. The report leaves the phone through the share sheet
   on Share report, and once a day as an anonymous row to the owner's table while Usage sharing is on (v170). */
const monthKey=()=>new Date().toISOString().slice(0,7);
function usage(){ const u=S.settings.usage||{}; if(!u.first) u.first=Date.now(); if(u.month!==monthKey()){ u.month=monthKey(); u.m={}; } if(!u.m) u.m={}; return u; }
let _usageTimer=null, _dailyTimer=null;
/* reviews per day (v274): setting daily = {day: count}, the last 60 days — the Progress row's 30-day strip shades busier days; the streak keeps its days list */
function dailyBump(day){ const d=S.settings.daily||{}; d[day]=(d[day]||0)+1; const keys=Object.keys(d).sort(); while(keys.length>60) delete d[keys.shift()]; S.settings.daily=d; clearTimeout(_dailyTimer); _dailyTimer=setTimeout(()=>{ setSetting("daily",d).catch(()=>{}); },500); }
function bump(key,n){ n=n||1; if(key==="byPhoto"||key==="byHand"||key==="deleted") REPORT_DIRTY=true; const u=usage(); u[key]=(u[key]||0)+n; u.m[key]=(u.m[key]||0)+n; S.settings.usage=u; clearTimeout(_usageTimer); _usageTimer=setTimeout(()=>{ setSetting("usage",u).catch(()=>{}); },500); }
/* which analysis did the work (v179, H: "record all the models used — the reader, DeepSeek, Qwen"): usage.models and usage.m.models
   count the on-device reader ("reader", one per reading) and every AI model by name, all time and this month */
function bumpModel(name){ const u=usage(); u.models=u.models||{}; u.m.models=u.m.models||{}; u.models[name]=(u.models[name]||0)+1; u.m.models[name]=(u.m.models[name]||0)+1; S.settings.usage=u; clearTimeout(_usageTimer); _usageTimer=setTimeout(()=>{ setSetting("usage",u).catch(()=>{}); },500); }
function countTokens(pv,data){ const g=(data&&data.usage)||{}; const i=pv==="claude"?g.input_tokens:g.prompt_tokens, o=pv==="claude"?g.output_tokens:g.completion_tokens; bump("aiCalls"); if(i) bump("aiIn",+i); if(o) bump("aiOut",+o); }
const APP_URL="https://henglicam.github.io/zeichentrainer/";
const APP_SHARE_TEXT="识字 Zeichentrainer — learn the Chinese characters you see around you. Take a photo of a sign, get the card. Open the link in Safari or Chrome, not inside WeChat, and add it to the home screen:"; /* v219: friends tapped the link inside WeChat's browser, which cannot install the app */ /* no link in the text: the share sheet appends the url field itself (v215, H's WeChat screenshot showed the link twice) */
async function shareApp(){
  const st=$("#app-share-status");
  if(navigator.share){ try{ await navigator.share({title:"识字 Zeichentrainer",text:APP_SHARE_TEXT,url:APP_URL}); return; }catch(err){ if(err&&err.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(APP_SHARE_TEXT+" "+APP_URL); if(st) st.textContent=t("Link copied."); }catch(err){ if(st) st.textContent=t("Sharing is not available here.")+" "+t("The link: {0}",APP_URL); }
}
/* Share report = one image of the dashboard (v277, H: "You're still sharing too much! Only this please, sexy! The rest goes to the user
   reports"): the tiles, the 30-day strip, the deck bar with its legend and the week ahead, drawn on a canvas at 1080 px in the light
   look like the shared card (v269), with the app's name and the day at the foot, handed to the share sheet as a PNG. The text report
   of v162–v276 (version, device, opens, AI counts, the models' work) went — the owner's All users report carries those figures from
   the daily row. Without a share sheet the notice says so. */
async function progressImage(){
  const p=progressData(), W=SHARE_W, PAD=SHARE_PAD, inner=W-2*PAD, cv=document.createElement("canvas"), ctx=cv.getContext("2d");
  const sans=getComputedStyle(document.documentElement).getPropertyValue("--sans")||"sans-serif";
  const rr=(x,y,w,h,r)=>{ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,r); else ctx.rect(x,y,w,h); };
  const max=Math.max(1,...p.dots.map(x=>x.n)), lvl=n=>!n?0:max<2?4:1+Math.round(3*(n-1)/(max-1)), alpha=[1,.3,.5,.75,1];
  const legend=[[t("New"),p.nw,"#AEAEB2"],[t("Still learning"),p.learning,"#C8372D"],[t("Known"),p.known,"#2FA36B"]];
  ctx.font=`34px ${sans}`; const legendW=legend.reduce((a,[l,n])=>a+32+ctx.measureText(`${l} ${n}`).width+40,0), legendRows=legendW>inner?3:1;
  const H=PAD+92+424+44+48+68+56+(legendRows*48+22)+100+30+PAD; cv.width=W; cv.height=H;
  ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,0,W,H); ctx.textBaseline="alphabetic";
  let y=PAD; ctx.fillStyle="#000000"; ctx.font=`700 60px ${sans}`; ctx.fillText(t("Progress"),PAD,y+56); y+=92;
  const gap=24, tw=(inner-gap)/2, th=200, tiles=[[p.streak,t("Day streak")],[p.learned,t("Cards learned")],[p.dueToday,t("Due today")],[p.week,t("Reviews this week")]];
  tiles.forEach((tl,i)=>{ const x=PAD+(i%2)*(tw+gap), ty=y+Math.floor(i/2)*(th+gap); ctx.fillStyle="#F2F2F7"; rr(x,ty,tw,th,28); ctx.fill();
    ctx.fillStyle="#000000"; ctx.font=`700 88px ${sans}`; ctx.fillText(String(tl[0]),x+32,ty+112); ctx.fillStyle="#6E6E73"; ctx.font=`32px ${sans}`; ctx.fillText(tl[1],x+32,ty+164); });
  y+=2*th+gap+44;
  ctx.fillStyle="#6E6E73"; ctx.font=`34px ${sans}`; ctx.fillText(t("Last 30 days"),PAD,y+30); y+=48;
  const bw=(inner-29*8)/30; p.dots.forEach((d,i)=>{ const l=lvl(d.n); ctx.globalAlpha=alpha[l]; ctx.fillStyle=l?"#C8372D":"#E9E9EE"; rr(PAD+i*(bw+8),y,bw,28,6); ctx.fill(); }); ctx.globalAlpha=1; y+=68;
  const tot=p.nw+p.learning+p.known; ctx.fillStyle="#E9E9EE"; rr(PAD,y,inner,28,14); ctx.fill();
  if(tot){ ctx.save(); rr(PAD,y,inner,28,14); ctx.clip(); let x=PAD; legend.forEach(([,n,c])=>{ const w=inner*n/tot; if(n){ ctx.fillStyle=c; ctx.fillRect(x,y,Math.max(0,w-2),28); } x+=w; }); ctx.restore(); }
  y+=56;
  ctx.font=`34px ${sans}`; let lx=PAD; legend.forEach(([l,n,c])=>{ const s=`${l} ${n}`, w=32+ctx.measureText(s).width; if(legendRows>1&&lx>PAD){ lx=PAD; y+=48; } ctx.fillStyle=c; ctx.beginPath(); ctx.arc(lx+11,y+19,11,0,Math.PI*2); ctx.fill(); ctx.fillStyle="#6E6E73"; ctx.fillText(s,lx+32,y+30); lx+=w+40; });
  y+=48+22;
  ctx.fillStyle="#6E6E73"; ctx.fillText(t("Coming up: {0} due tomorrow, {1} this week.",p.dueTomorrow,p.dueWeek),PAD,y+30); y+=100;
  ctx.fillStyle="#AEAEB2"; ctx.font=`32px ${sans}`; ctx.fillText("识字 Zeichentrainer",PAD,y+30); ctx.textAlign="right"; ctx.fillText(new Date().toLocaleDateString(LANG_LOCALE[LANG]),W-PAD,y+30); ctx.textAlign="left";
  return new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error("no image")),"image/png"));
}
async function shareProgress(){
  let blob; try{ blob=await progressImage(); }catch(err){ logErr("share",err); noteSheet(t("Sharing is not available here.")); return; }
  const p=progressData(), file=new File([blob],"zeichentrainer-progress.png",{type:"image/png"}), text=`${t("Day streak")} ${p.streak}, ${t("Cards learned")} ${p.learned}`;
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file],title:"识字 Zeichentrainer",text}); return; }catch(err){ if(err && err.name==="AbortError") return; logErr("share",err); } }
  noteSheet(t("Sharing is not available here."));
}
/* ---------- usage sharing (v170, H: "I want to share the app and get user stats" — automatic reports from every phone):
   once a day, while online and the switch in More is on, the same counts as the report go to a table of H's own in a
   free Supabase project (REST insert with the publishable key, which can only insert into "reports" — row level security,
   H reads the rows in the dashboard): a random installation id, the app version, the phone model from the user agent,
   days used, streak, opens, reviews, cards learned and created, deleted, AI calls and tokens, provider and model —
   never card text, never photos, never the API key. Reachable from H's phone without a VPN (field-checked 2026-09-04).
   Setting "shareUsage" (absent = on), "installId", "lastReport" (the day of the last successful send). */
const SHARE_URL="https://xttuotninuwxnpcbyejn.supabase.co", SHARE_KEY="sb_publishable_UZrXhhKAckqkda4-r02qdA_tgilndum";
const shareOn=()=>S.settings.shareUsage!==false;
function installId(){ let id=S.settings.installId; if(!id){ const b=crypto.getRandomValues(new Uint8Array(8)); id=[...b].map(x=>x.toString(16).padStart(2,"0")).join(""); setSetting("installId",id); } return id; }
/* the page runs inside WeChat's built-in browser (v219, from the first all-users report: most rows were link taps inside
   WeChat, which cannot install the app and may hand out a fresh storage on the next tap): Learn shows a line that says so,
   and the daily row's device carries "WeChat" so the rows can be told apart */
/* A question as the app's own sheet instead of the browser's dialog (v222, H: the browser's box said "henglicam.github.io says"
   — "Gehts auch etwas professioneller?"): a dimmed backdrop, a card that slides up from the bottom with a bold title, one line of
   consequence in the secondary colour, a neutral Cancel and the action button named for what it does (red on soft for a
   deletion, the filled tint for an import); Cancel, the backdrop or Escape answer no. askSheet({title,text,ok,danger}) → true/false. */
function askSheet(o){ return new Promise(res=>{
  const el=document.createElement("div"); el.className="ask"; el.setAttribute("role","dialog"); el.setAttribute("aria-modal","true");
  el.innerHTML=`<div class="sheet"><div class="t">${esc(o.title)}</div>${o.text?`<div class="s">${esc(o.text)}</div>`:""}<div class="row"><button class="btn plain" id="ask-cancel">${t("Cancel")}</button><button class="btn ${o.danger===false?"primary":"danger"}" id="ask-ok">${esc(o.ok)}</button></div></div>`;
  const onKey=e=>{ if(e.key==="Escape") done(false); };
  const done=v=>{ el.remove(); document.removeEventListener("keydown",onKey); res(v); };
  el.onclick=e=>{ if(e.target===el) done(false); };
  const cancel=el.querySelector("#ask-cancel"); if(o.cancel===false) cancel.remove(); else cancel.onclick=()=>done(false); el.querySelector("#ask-ok").onclick=()=>done(true);
  document.addEventListener("keydown",onKey); document.body.appendChild(el); (o.cancel===false?el.querySelector("#ask-ok"):cancel).focus();
}); }
/* a plain notice as the app's own sheet (v266, from the improvement list — the twelve browser alerts said "henglicam.github.io says"): one line, or a title
   with a sentence, and OK; the backdrop and Escape close it too */
const noteSheet=(title,text)=>askSheet({title,text,ok:t("OK"),danger:false,cancel:false});
const inWeChat=()=>/MicroMessenger/i.test(navigator.userAgent);
const isInstalled=()=>{ try{ return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true; }catch(e){ return false; } }; /* runs from the home screen — the strongest sign of a real user (v221) */
const WX_NOTE="You are inside WeChat. Open this page in your browser to install the app and keep your cards.";
function wxNoteHTML(){ return inWeChat()?`<div class="wxnote">${t(WX_NOTE)}</div>`:""; }
/* the app's language (v253, H: "Multi language UI and translations" — English, German, French, Spanish, Japanese, Korean; the
   strings live in lang.js with English as the key): More → Language switches at once and keeps the choice (setting "lang");
   the header's capsules and the tab labels sit in index.html and are set here, everything else asks t() while rendering */
function applyLangStatic(){ document.documentElement.lang=LANG;
  [["#stat-open b","Due"],["#stat-done b","capsule:Done"],["#stat-deck b","Deck"]].forEach(([q,k])=>{ const e=$(q); if(e) e.textContent=t(k); });
  document.querySelectorAll("#tabs .tab").forEach(b=>{ const k={study:"Learn",cards:"Cards",inbox:"Camera",more:"More"}[b.dataset.mode]; const n=b.lastChild; if(k&&n&&n.nodeType===3) n.textContent=t(k); }); }
async function setLang(code){ if(!LANGS.some(([c])=>c===code)) return; LANG=code; await setSetting("lang",code); await syncMeanings(); /* the meanings the cards already have in this language, at once (v265) */ if(TRANSLATE&&!TRANSLATE.running) TRANSLATE=null; /* a finished run's line belongs to the old language */ if(stageOf()&&stageOf().lang!==code) await clearStage(); /* a stage for another language is worthless (v264) */ if(S.settings.translateRun||(TRANSLATE&&TRANSLATE.running)){ await rememberTranslate(true); resumeTranslate(); } /* a run under way or waiting goes on in the new language (v263) */ applyLangStatic(); render(); }
/* Translate all cards into the app's language (v256, H chose the button over an automatic run — it costs an AI call per batch of
   cards): the cards whose meaning is in another language than the app's go to the AI in batches, only the meaning and its
   language are taken from the answer, the text and the pinyin stay. The row sits under the Language chips and shows only
   while such cards exist and an AI is set up. */
const TRANSLATE_BATCH=5; /* small batches, so the line moves every few seconds (v261, H: "no real-time progress" — with 20 per call the count stood at 0 until the first answer) */
const toTranslate=()=>deck().filter(d=>d.c&&d.m&&mlOf(d)!==LANG);
/* the run's state lives here, not in the row (v257, H: "pressed Translate all, changed page, pressed again and no reaction" — the
   row had been re-rendered by the tab change, the loop wrote its progress into the old row, and the guard swallowed the second tap):
   the row is drawn from TRANSLATE, every step re-queries the row by id, and a tap while a run is on shows the progress */
let TRANSLATE=null; /* {running, done, at, total, failed, lang} — at = the card the AI is on, so the line moves as soon as a batch goes out */
/* a run goes on after an interruption (v262, H: "Please continue translating after being interrupted"): the run is remembered in
   setting translateRun {lang, at} until every card is done, and resumeTranslate() picks it up again at boot, on reconnect and on
   foreground — a failed call (Android cuts a background page's requests) no longer ends the run, the row says it continues */
/* the translation is staged, not written card by card (v264, H: "make translation consistent and make sure that cards are not mixed in
   different languages if the translation was interrupted"): every answer lands in setting translateStage {lang, m:{id:{m,from}}} —
   from = the meaning the card had when it was asked, so a meaning typed meanwhile is not overwritten — and the cards change
   together, in one transaction, only when every card has its answer (or was tried and got none: skip). Until then Learn and Cards
   show the old meanings, all in one language, and the pill on every card; an interruption keeps the stage, the resumed run asks
   only for the cards not staged yet; a switched language drops the stage. */
/* Undo last run (v369, H after v368 wrote a tag onto every untagged card: "there should be an 'undo last run' option as well…
   Your recommendation?" → C first, then A; "Go"): a run that writes many cards at once — Translate all, Tag all — keeps what it
   replaced in setting lastRun {kind, at, n, keys, m:{id:{field…}}}, and the row it belongs to offers Undo until the next run
   replaces the store. One run deep on purpose: the store is the fields that run touched, nothing else, so 167 cards cost a few
   kilobytes; a field the card did not have is stored as absent and the undo deletes it again. */
async function saveLastRun(kind,keys,before,n){ const run={kind,keys,n,at:Date.now(),m:before}; S.settings.lastRun=run; await setSetting("lastRun",run); }
async function clearLastRun(){ if(S.settings.lastRun){ delete S.settings.lastRun; await idbDel("settings","lastRun").catch(()=>{}); } }
const runWhen=at=>{ const d=new Date(at), loc=LANG_LOCALE[LANG];
  return new Date(at).toDateString()===new Date().toDateString()?d.toLocaleTimeString(loc,{hour:"2-digit",minute:"2-digit"}):d.toLocaleString(loc); };
function undoRunHTML(kind){ const r=S.settings.lastRun; if(!r||r.kind!==kind||(TRANSLATE&&TRANSLATE.running)||(TAGALL&&TAGALL.running)) return "";
  const line=kind==="tags"?t("Tagged {0} at {1}.",nOf(r.n,"card"),runWhen(r.at)):kind==="accept"?t("Accepted the AI's changes on {0} at {1}.",nOf(r.n,"card"),runWhen(r.at)):t("Translated {0} at {1}.",nOf(r.n,"card"),runWhen(r.at));
  return `<div class="mrow"><div style="flex:1"><div class="t">${t("Undo last run")}</div><div class="s" id="undorun-status">${line}</div><div class="fieldacts"><button class="btn mini" id="undo-run">${t("Undo")}</button></div></div></div>`; }
async function undoLastRun(){ const r=S.settings.lastRun; if(!r) return;
  const rows=[]; for(const id of Object.keys(r.m)){ const d=cardOf(id); if(!d) continue; const b=r.m[id];
    let u; if(r.keys==="*"){ u={...b}; if(d.img) u.img=d.img; else delete u.img; if(d.imgFull) u.imgFull=d.imgFull; else delete u.imgFull; } /* the whole card back, its pictures as they are now (v370) */
    else { u={...d}; for(const k of r.keys){ if(b[k]===undefined) delete u[k]; else u[k]=b[k]; } }
    rows.push(u); }
  if(rows.length){ try{ await idbPutMany("custom",rows); }catch(e){ logErr("undorun",e&&e.message||String(e)); return; }
    for(const x of rows){ const i=S.custom.findIndex(y=>y.id===x.id); if(i>=0) S.custom[i]=x; } }
  await clearLastRun(); TRANSLATE=null; TAGALL=null; /* the finished lines belong to a run that is undone */
  const st=$("#undorun-status"); if(st) st.textContent=t("Undone — {0} put back.",nOf(rows.length,"card"));
  render(); }
const stageOf=()=>S.settings.translateStage;
async function saveStage(st){ S.settings.translateStage=st; await setSetting("translateStage",st); }
async function clearStage(){ if(S.settings.translateStage){ delete S.settings.translateStage; await idbDel("settings","translateStage").catch(()=>{}); } }
const inStage=(st,d)=>!!(st&&st.m[d.id]&&st.m[d.id].from===d.m); /* this card's answer is in, for the meaning it has now */
async function applyStage(st,list){ const rows=[], before={}; for(const x of list){ const d=cardOf(x.id), e=d&&st.m[d.id]; if(!e||e.from!==d.m||e.skip||!e.m) continue; before[d.id]={m:d.m,ml:d.ml,ms:d.ms}; rows.push(setMl({...d,m:e.m},st.lang)); }
  if(rows.length){ try{ await idbPutMany("custom",rows); }catch(e){ logErr("translate","apply: "+(e&&e.message||e)); return 0; } for(const r of rows){ const i=S.custom.findIndex(x=>x.id===r.id); if(i>=0) S.custom[i]=r; } await saveLastRun("meanings",["m","ml","ms"],before,rows.length); } return rows.length; }
async function rememberTranslate(on){ if(on){ S.settings.translateRun={lang:LANG,at:Date.now()}; await setSetting("translateRun",S.settings.translateRun); } else if(S.settings.translateRun){ delete S.settings.translateRun; await idbDel("settings","translateRun").catch(()=>{}); } }
function resumeTranslate(){ const r=S.settings.translateRun; if(!r||(TRANSLATE&&TRANSLATE.running)) return;
  if(!toTranslate().length){ rememberTranslate(false); return; } /* nothing is left for the app's language (a switched language just means other cards are left, v263) */
  if(!aiOn()||!navigator.onLine) return; translateAll(); }
function translateRowHTML(){
  const n=toTranslate().length, tr=TRANSLATE; if(!(n||tr)||!aiOn()) return "";
  const name=(LANGS.find(([c])=>c===LANG)||[])[1]||LANG;
  const line=tr&&tr.running?busyHTML(t("Translating {0} of {1} …",tr.at,tr.total)+" "+t("The cards change together when all are done.")):tr&&tr.failed?t("The AI could not be reached")+". "+t("{0} translated, {1} left.",tr.done,n)+" "+t("The cards change together when all are done.")+" "+t("It goes on by itself when the AI can be reached again."):tr?t("Done — {0} translated.",nOf(tr.done,"card")):t("{0} have their meaning in another language.",nOf(n,"card"));
  return `<div class="mrow"><div style="flex:1"><div class="t">${t("Meanings")}</div><div class="s" id="translate-status">${line}</div>${n?`<div class="fieldacts"><button class="btn mini" id="translate-all"${tr&&tr.running?" disabled":""}>${t("Translate all cards into {0}",name)}</button></div>`:""}</div></div>`; /* the button under the sentence, as the Feedback row's Send — its label is long in every language */
}
function translateRefresh(){ const st=$("#translate-status"), b=$("#translate-all"), tr=TRANSLATE; if(!st) return; /* the row as it stands now, whatever page was shown meanwhile */
  const n=toTranslate().length;
  if(tr&&tr.running) st.innerHTML=busyHTML(t("Translating {0} of {1} …",tr.at,tr.total)+" "+t("The cards change together when all are done.")); /* the moving bar with the count of the card the AI is on */
  else st.textContent=tr&&tr.failed?t("The AI could not be reached")+". "+t("{0} translated, {1} left.",tr.done,n)+" "+t("The cards change together when all are done.")+" "+t("It goes on by itself when the AI can be reached again."):tr?t("Done — {0} translated.",nOf(tr.done,"card")):t("{0} have their meaning in another language.",nOf(n,"card"));
  if(b){ b.disabled=!!(tr&&tr.running); if(!n&&!(tr&&tr.running)) b.remove(); } }
async function translateAll(){
  if(TRANSLATE&&TRANSLATE.running){ translateRefresh(); return; }
  if(!navigator.onLine){ const st=$("#translate-status"); if(st) st.textContent=t("No connection. Try again when online."); return; }
  const list=toTranslate(); if(!list.length) return;
  let stage=stageOf(); if(!stage||stage.lang!==LANG||!stage.m) stage={lang:LANG,m:{}}; /* the stage of an interrupted run in this language, else a fresh one */
  const todo=list.filter(d=>!inStage(stage,d));
  TRANSLATE={running:true,done:list.length-todo.length,at:list.length-todo.length,total:list.length,failed:false,lang:LANG}; translateRefresh(); await rememberTranslate(true); await saveStage(stage);
  try{
    for(let i=0;i<todo.length;i+=TRANSLATE_BATCH){
      if(LANG!==TRANSLATE.lang) break; /* the language was switched meanwhile: this run stops and a fresh one for the new language follows (v263, H: "then all the cards have to be translated into the new language") */
      const batch=todo.slice(i,i+TRANSLATE_BATCH), lang=TRANSLATE.lang; TRANSLATE.at=Math.min(TRANSLATE.done+batch.length,list.length); translateRefresh();
      const ans=await aiAsk(batch.map(d=>({...d,translate:true})));
      for(let k=0;k<batch.length;k++){ const d=cardOf(batch[k].id), a=ans[k]; if(!d) continue;
        stage.m[d.id]=a&&a.m&&!a.bad?{m:a.m,from:d.m}:{skip:true,from:d.m}; TRANSLATE.done++; } /* staged, not written: the cards change together at the end */
      if(lang===TRANSLATE.lang&&LANG===lang) await saveStage(stage);
    }
  }catch(err){ TRANSLATE.failed=true; logErr("translate",err&&err.message||String(err)); }
  if(LANG!==TRANSLATE.lang&&!TRANSLATE.failed&&toTranslate().length){ await clearStage(); TRANSLATE.running=false; return translateAll(); } /* the language was switched during the run: every card goes into the new one (v263) */
  if(!TRANSLATE.failed&&LANG===TRANSLATE.lang&&list.every(d=>{ const c=cardOf(d.id); return !c||inStage(stage,c)||c.m!==d.m; })){ /* every card answered (or tried): now they change together */
    TRANSLATE.done=await applyStage(stage,list); await clearStage(); }
  if(!toTranslate().length||!TRANSLATE.failed&&!stageOf()) await rememberTranslate(false); /* remembered while cards are left, so the run goes on at the next chance */
  TRANSLATE.running=false; translateRefresh(); /* running stays set until the cards and the settings are written — whoever waits for the end sees the finished state (v264) */
  if(S.mode==="study"||S.mode==="cards"||S.mode==="more") render(); /* the meanings on screen follow, and More gets the Undo row (v369) */
}
/* Tag all cards (v368, H's "1 now, 3 straight after it" on the labelling question of v364, then "Tag all cards"): the kind tag of
   v364 rides on every new card's own AI answer, so the deck H already has stays untagged. This row asks the AI for the kind of
   the cards that carry no tag at all — it never touches a card that carries a tag of H's own — and works exactly like Translate
   all: the run's state lives in TAGALL and not in the row, a batch of TAG_BATCH cards per call, every answer staged in setting
   tagStage {m:{id:kind}} and every card written together at the end (idbPutMany), the run remembered in setting tagRun until no
   card is left, resumed at boot, on reconnect and on foreground. The payload asks for the kind alone (tagOnly), so a run cannot
   change a text, a pinyin or a meaning. */
const TAG_BATCH=10; /* the answer is one word per card, so ten fit where the translation takes five */
const toTag=()=>deck().filter(d=>d.c&&!(d.tags&&d.tags.length));
let TAGALL=null; /* {running, done, at, total, failed} */
const tagStageOf=()=>S.settings.tagStage;
async function saveTagStage(st){ S.settings.tagStage=st; await setSetting("tagStage",st); }
async function clearTagStage(){ if(S.settings.tagStage){ delete S.settings.tagStage; await idbDel("settings","tagStage").catch(()=>{}); } }
const inTagStage=(st,d)=>!!(st&&st.m&&st.m[d.id]);
async function applyTagStage(st,list){ const rows=[];
  const before={};
  for(const x of list){ const d=cardOf(x.id), k=d&&st.m[d.id]; if(!d||!k||k==="skip"||(d.tags&&d.tags.length)) continue;
    const tg=kindTag(k); if(tg){ before[d.id]={tags:d.tags}; rows.push({...d,tags:[tg]}); } }
  if(rows.length){ try{ await idbPutMany("custom",rows); }catch(e){ logErr("tagall","apply: "+(e&&e.message||e)); return 0; }
    for(const r of rows){ const i=S.custom.findIndex(x=>x.id===r.id); if(i>=0) S.custom[i]=r; } await saveLastRun("tags",["tags"],before,rows.length); }
  return rows.length; }
async function rememberTagRun(on){ if(on){ S.settings.tagRun={at:Date.now()}; await setSetting("tagRun",S.settings.tagRun); }
  else if(S.settings.tagRun){ delete S.settings.tagRun; await idbDel("settings","tagRun").catch(()=>{}); } }
function resumeTagAll(){ if(!S.settings.tagRun||(TAGALL&&TAGALL.running)) return;
  if(!toTag().length){ rememberTagRun(false); return; }
  if(!aiOn()||!navigator.onLine) return; tagAll(); }
function tagRowHTML(){
  const n=toTag().length, tr=TAGALL; if(!(n||tr)||!aiOn()) return "";
  const line=tr&&tr.running?busyHTML(t("Tagging {0} of {1} …",tr.at,tr.total)+" "+t("The cards change together when all are done."))
    :tr&&tr.failed?t("The AI could not be reached")+". "+t("{0} tagged, {1} left.",tr.done,n)+" "+t("It goes on by itself when the AI can be reached again.")
    :tr?t("Done — {0} tagged.",nOf(tr.done,"card")):t("{0} carry no tag yet.",nOf(n,"card"));
  return `<div class="mrow"><div style="flex:1"><div class="t">${t("Tags")}</div><div class="s" id="tagall-status">${line}</div>${n?`<div class="fieldacts"><button class="btn mini" id="tag-all"${tr&&tr.running?" disabled":""}>${t("Tag all cards")}</button></div>`:""}</div></div>`;
}
function tagRefresh(){ const st=$("#tagall-status"), b=$("#tag-all"), tr=TAGALL; if(!st) return;
  const n=toTag().length;
  if(tr&&tr.running) st.innerHTML=busyHTML(t("Tagging {0} of {1} …",tr.at,tr.total)+" "+t("The cards change together when all are done."));
  else st.textContent=tr&&tr.failed?t("The AI could not be reached")+". "+t("{0} tagged, {1} left.",tr.done,n)+" "+t("It goes on by itself when the AI can be reached again.")
    :tr?t("Done — {0} tagged.",nOf(tr.done,"card")):t("{0} carry no tag yet.",nOf(n,"card"));
  if(b){ b.disabled=!!(tr&&tr.running); if(!n&&!(tr&&tr.running)) b.remove(); } }
async function tagAll(){
  if(TAGALL&&TAGALL.running){ tagRefresh(); return; }
  if(!navigator.onLine){ const st=$("#tagall-status"); if(st) st.textContent=t("No connection. Try again when online."); return; }
  const list=toTag(); if(!list.length) return;
  let stage=tagStageOf(); if(!stage||!stage.m) stage={m:{}};
  const todo=list.filter(d=>!inTagStage(stage,d));
  TAGALL={running:true,done:list.length-todo.length,at:list.length-todo.length,total:list.length,failed:false}; tagRefresh();
  await rememberTagRun(true); await saveTagStage(stage);
  try{
    for(let i=0;i<todo.length;i+=TAG_BATCH){
      const batch=todo.slice(i,i+TAG_BATCH); TAGALL.at=Math.min(TAGALL.done+batch.length,list.length); tagRefresh();
      const ans=await aiAsk(batch.map(d=>({...d,tagOnly:true})));
      for(let k=0;k<batch.length;k++){ const d=cardOf(batch[k].id), a=ans[k]; if(!d) continue;
        stage.m[d.id]=a&&!a.bad&&kindTag(a.kind)?a.kind:"skip"; TAGALL.done++; } /* staged, not written: the cards change together at the end */
      await saveTagStage(stage);
    }
  }catch(err){ TAGALL.failed=true; logErr("tagall",err&&err.message||String(err)); }
  if(!TAGALL.failed&&list.every(d=>{ const c=cardOf(d.id); return !c||inTagStage(stage,c)||(c.tags&&c.tags.length); })){
    TAGALL.done=await applyTagStage(stage,list); await clearTagStage(); }
  if(!toTag().length||!TAGALL.failed&&!tagStageOf()) await rememberTagRun(false);
  TAGALL.running=false; tagRefresh();
  if(S.mode==="study"||S.mode==="cards"||S.mode==="more") render(); /* More gets the Undo row of v369 without leaving the page */
}
/* Check all cards again (v370, H: "maybe Tag all cards should be a general AI re-run on all Cards? Because ai models get better
   over time?" — three ways offered, my recommendation the one that never writes: on a saved card the v143 guard is gone (the
   reader's per-character confidences are not kept), so a run that applied its answers would silently rewrite correct cards.
   This run therefore only fills the card's own AI box: the Cards tab shows "N AI suggestions waiting — Accept all", and every
   card keeps its text, pinyin and meaning until H accepts. An answer equal to the card, or one the model calls garbage, is
   dropped — only a real change becomes a suggestion. Like the other runs the state lives in RECHECK, not in the row, and an
   interrupted run goes on by itself: setting recheckRun {at} marks it, and a card whose suggestion is newer than that is done. */
const RECHECK_BATCH=5; /* the answer carries zh, pinyin and meaning per card, as the translation does */
const toRecheck=()=>deck().filter(d=>d.c&&!d.reading);
const recheckLeft=()=>{ const r=S.settings.recheckRun; if(!r) return toRecheck(); const done=new Set(r.done||[]); return toRecheck().filter(d=>!done.has(d.id)); }; /* the cards this run has not asked about yet — a card whose answer matched keeps no suggestion, so the run has to remember the ids itself */
let RECHECK=null; /* {running, done, at, total, failed, found} */
async function rememberRecheck(on,done){ if(on){ S.settings.recheckRun={at:(S.settings.recheckRun||{}).at||Date.now(),done:done||(S.settings.recheckRun||{}).done||[]}; await setSetting("recheckRun",S.settings.recheckRun); }
  else if(S.settings.recheckRun){ delete S.settings.recheckRun; await idbDel("settings","recheckRun").catch(()=>{}); } }
function resumeRecheck(){ if(!S.settings.recheckRun||(RECHECK&&RECHECK.running)) return;
  if(!recheckLeft().length){ rememberRecheck(false); return; }
  if(!aiOn()||!navigator.onLine) return; recheckAll(); }
function recheckLine(){ const tr=RECHECK, left=recheckLeft().length;
  if(tr&&tr.running) return null; /* the moving bar, drawn by the callers */
  if(tr&&tr.failed) return t("The AI could not be reached")+". "+t("{0} checked, {1} left.",tr.done,left)+" "+t("It goes on by itself when the AI can be reached again.");
  if(tr) return tr.found?t("Done — {0} could be better. See them on the Cards tab.",nOf(tr.found,"card")):t("Done — nothing to change. Your cards are in good shape.");
  return t("The AI keeps getting better. Let it look at your whole deck again — you see every change before you accept it."); }
/* The pictures already on the phone: one quiet pass (v373, H: "Run the brightening over my deck now and remove the
   manual option completely" — the deck lives on the phone, so the app has to do it itself). At the first start after
   the update it walks the deck once, measures every card picture and writes back the ones that were dark or flat.
   No row, no button, no question. The flag (setting brightPass) is set only when it has been through the whole deck,
   and the curve is idempotent, so an interrupted pass simply finishes at the next start. It waits while a photo is
   being framed or read, and breathes between cards, so nothing it does is felt. */
const BR_BATCH=10, BR_PAUSE=60, BR_WAIT=2000;
let BRIGHT=null;
async function brightenPass(){
  if(BRIGHT||S.settings.brightPass) return;
  const ids=deck().filter(d=>d.img).map(d=>d.id);
  BRIGHT={done:0};
  let rows=[];
  const write=async()=>{ if(!rows.length) return;
    const out=rows.map(r=>{ const d=cardOf(r.id); return d?{...d,img:r.img}:null; }).filter(Boolean); rows=[]; /* the card as it stands now: an edit meanwhile is not overwritten */
    if(!out.length) return;
    try{ await idbPutMany("custom",out); for(const r of out){ const i=S.custom.findIndex(x=>x.id===r.id); if(i>=0) S.custom[i]=r; dropThumb(r.id); } }catch(e){ logErr("bright","write: "+(e&&e.message||e)); } };
  try{
    for(const id of ids){
      while(reloadBusy()||Object.keys(READING).length) await new Promise(r=>setTimeout(r,BR_WAIT)); /* the camera and the reader come first */
      const d=cardOf(id); if(!d||!d.img) continue;
      let b=null; try{ b=await brightenBlob(d.img); }catch(e){ b=null; }
      if(b){ rows.push({id,img:b}); BRIGHT.done++; if(rows.length>=BR_BATCH) await write(); }
      await new Promise(r=>setTimeout(r,BR_PAUSE));
    }
    await write();
  }catch(e){ logErr("bright",e&&e.message||String(e)); BRIGHT=null; return; } /* no flag: the next start goes through again */
  S.settings.brightPass=1; await setSetting("brightPass",1);
  const n=BRIGHT.done; BRIGHT=null;
  if(n&&(S.mode==="cards"||S.mode==="study")) render();
}
function recheckRowHTML(){ const n=toRecheck().length, tr=RECHECK; if(!n||!aiOn()) return "";
  const line=tr&&tr.running?busyHTML(t("Checking {0} of {1} …",tr.at,tr.total)):recheckLine();
  return `<div class="mrow"><div style="flex:1"><div class="t">${t("Check-up")}</div><div class="s" id="recheck-status">${line}</div><div class="fieldacts"><button class="btn mini" id="recheck-all"${tr&&tr.running?" disabled":""}>${t("Check all cards again")}</button></div></div></div>`; }
function recheckRefresh(){ const st=$("#recheck-status"), b=$("#recheck-all"), tr=RECHECK; if(!st) return;
  if(tr&&tr.running) st.innerHTML=busyHTML(t("Checking {0} of {1} …",tr.at,tr.total)); else st.textContent=recheckLine();
  if(b) b.disabled=!!(tr&&tr.running); }
async function recheckAll(){
  if(RECHECK&&RECHECK.running){ recheckRefresh(); return; }
  if(!navigator.onLine){ const st=$("#recheck-status"); if(st) st.textContent=t("No connection. Try again when online."); return; }
  const all=toRecheck(); if(!all.length) return;
  if(!S.settings.recheckRun) await rememberRecheck(true);
  const todo=recheckLeft();
  RECHECK={running:true,done:all.length-todo.length,at:all.length-todo.length,total:all.length,failed:false,found:0}; recheckRefresh();
  try{
    for(let i=0;i<todo.length;i+=RECHECK_BATCH){
      const batch=todo.slice(i,i+RECHECK_BATCH); RECHECK.at=Math.min(RECHECK.done+batch.length,all.length); recheckRefresh();
      const ans=await aiAsk(batch);
      for(let k=0;k<batch.length;k++){ const d=cardOf(batch[k].id), a=ans[k]; RECHECK.done++; if(!d||!a) continue;
        const zh=a.zh&&CJK.test(a.zh)?a.zh.replace(/\r/g,""):d.c;
        if(a.bad||(zh===d.c&&(!a.p||a.p===d.p)&&(!a.m||a.m===d.m))) continue; /* nothing to show: the card already says it */
        await putCard({...d, ai:{...a, zh, c:d.c}}); RECHECK.found++; }
      await rememberRecheck(true,[...((S.settings.recheckRun||{}).done||[]),...batch.map(d=>d.id)]); /* these are answered, whatever the answer was */
      recheckRefresh();
    }
  }catch(err){ RECHECK.failed=true; logErr("recheck",err&&err.message||String(err)); }
  if(!RECHECK.failed&&!recheckLeft().length) await rememberRecheck(false);
  RECHECK.running=false; recheckRefresh();
  if(S.mode==="cards"||S.mode==="study"||S.mode==="more") render();
}
function reportData(){
  const u=usage(), m=u.m||{}, st=learnStats(), n=k=>u[k]||0, mn=k=>m[k]||0;
  const ua=navigator.userAgent, dev=((ua.match(/\(([^)]*)\)/)||[])[1]||"")+(inWeChat()?"; WeChat":"");
  return {install:installId(), version:APP_V, device:dev, installed:isInstalled(), first:u.first?new Date(u.first).toISOString().slice(0,10):null,
    days:(S.settings.days||[]).length, streak:st.streak, opens:n("opens"), opensMonth:mn("opens"),
    reviews:n("reviews"), reviewsMonth:mn("reviews"), learned:st.total, cards:deck().length,
    byPhoto:n("byPhoto"), byHand:n("byHand"), deleted:n("deleted"),
    aiCalls:n("aiCalls"), aiIn:n("aiIn"), aiOut:n("aiOut"), aiCallsMonth:mn("aiCalls"), aiInMonth:mn("aiIn"), aiOutMonth:mn("aiOut"), pics:n("pics"), picsMonth:mn("pics"), models:u.models||{}, modelsMonth:m.models||{},
    ai:aiOn()?aiProvider()+" "+aiModel():null, inbox:S.inbox.length, tags:allTags().length, lang:navigator.language||null,
    errors:reportErrors()};
}
/* the app's last errors ride in the daily row (v271, H: "Can the app send automatic error logs from other users?" → "Go"): the kind
   and the message of the last 20 entries of the error log — a crash, a failed reading, a failed AI call or send —, the minute they
   happened, and never card text: any Chinese characters in a message are replaced by an ellipsis before sending. A hang without an
   error leaves no trace here; Diagnostics from the phone still tell those. */
const noHan=s=>String(s||"").replace(/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]+/g,"…");
function reportErrors(){ return ERRLOG.slice(-20).map(x=>({t:new Date(x.t).toISOString().slice(0,16).replace("T"," "),kind:x.kind,msg:noHan(x.msg).slice(0,200)})); }
let _reporting=false, REPORT_DIRTY=false; /* a card was made or deleted since the day's row (v219): a second row goes when the app leaves the foreground, so the All users list shows the day's cards the same day */
/* one report per day; a failed send is retried at the next start, foreground or reconnect */
async function sendReport(force){
  if(!S.ready||!shareOn()||!navigator.onLine||_reporting) return false;
  if(!force&&S.settings.lastReport===dayKey()) return false;
  _reporting=true;
  try{
    const r=await fetch(SHARE_URL+"/rest/v1/reports",{method:"POST",keepalive:true,headers:{"apikey":SHARE_KEY,"Authorization":"Bearer "+SHARE_KEY,"Content-Type":"application/json","Prefer":"return=minimal"},body:JSON.stringify({data:reportData()})}); /* keepalive: the second row is sent as the app goes to the background (v219) */
    if(!r.ok) throw new Error("report "+r.status);
    REPORT_DIRTY=false; await setSetting("lastReport",dayKey()); const el=$("#share-status"); if(el) el.textContent=shareNote(); return true;
  }catch(e){ return false; }
  finally{ _reporting=false; }
}
function shareNote(){
  if(!shareOn()) return t("Off. Nothing is sent.");
  const d=S.settings.lastReport; return d?(d===dayKey()?t("Last sent today."):t("Last sent {0}.",d)):t("Not sent yet.");
}
/* the owner's rows in More (Reset, Diagnostics, All users, Feedback, Mirror, the downloads, the AI setup) open with a password (v162, H:
   "protect all those administrative functions with a password" — one master password, its SHA-256 in the code; it
   stops taps, not a reader of the source; unlocked for the session only) */
const ADMIN_HASH="ee3467fab5716e0f004d387a016bddadc4570c2336c58fc6c872c351fd23a7d6";
async function sha256(str){ const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function learnStats(){
  const rows=Object.values(S.progress), weekAgo=today()-6*DAY;
  const total=rows.filter(r=>r.reps>0).length, week=rows.filter(r=>r.last&&r.last>=weekAgo).length;
  const days=new Set(S.settings.days||[]); let streak=0; const d=new Date();
  if(!days.has(dayKey(d))) d.setDate(d.getDate()-1); /* today not yet, count from yesterday */
  while(days.has(dayKey(d))){ streak++; d.setDate(d.getDate()-1); }
  return {total,week,streak};
}
/* More → Progress as a small dashboard (v274, H: "Mach den learning process report mit mehr useful und sexy für die user" — described
   first, "Go"): four tiles (day streak, cards learned, due today, reviews this week), a strip of the last 30 days shaded by the day's
   reviews, the deck as a bar of new / still learning / known (an interval of 21 days and more), and the week ahead. The owner-ish counts
   (opens, AI checks, the reader's work) left the row and, since v277, the shared report too — the owner's All users report has them. */
const KNOWN_DAYS=21;
function progressData(){
  const st=learnStats(), t0=today(), endToday=t0+DAY, endTomorrow=t0+2*DAY, endWeek=t0+7*DAY;
  let nw=0, learning=0, known=0, dueToday=0, dueTomorrow=0, dueWeek=0;
  for(const d of deck()){ if(!d.c) continue; const p=S.progress[d.id]; if(!p||!p.reps){ nw++; continue; }
    if(p.interval>=KNOWN_DAYS) known++; else learning++;
    if(p.due<endToday) dueToday++; else if(p.due<endTomorrow) dueTomorrow++;
    if(p.due>=endToday&&p.due<endWeek) dueWeek++; }
  const daysSet=new Set(S.settings.days||[]), daily=S.settings.daily||{}, dots=[];
  for(let i=29;i>=0;i--){ const k=dayKey(t0-i*DAY); dots.push({k,n:daily[k]||(daysSet.has(k)?1:0)}); }
  return {streak:st.streak,learned:st.total,week:st.week,dueToday,dueTomorrow,dueWeek,nw,learning,known,dots};
}
function progressHTML(){
  const p=progressData(), max=Math.max(1,...p.dots.map(x=>x.n)), lvl=n=>!n?0:max<2?4:1+Math.round(3*(n-1)/(max-1)); /* four shades: the busiest day full tint, a single review the lightest */
  const tile=(n,l)=>`<div class="ptile"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  return `<div class="prog">
    <div class="ptiles">${tile(p.streak,t("Day streak"))}${tile(p.learned,t("Cards learned"))}${tile(p.dueToday,t("Due today"))}${tile(p.week,t("Reviews this week"))}</div>
    <div class="pl">${t("Last 30 days")}</div>
    <div class="pdots">${p.dots.map(x=>`<i class="d${lvl(x.n)}" title="${x.k}${x.n?": "+nOf(x.n,"review"):""}"></i>`).join("")}</div>
    <div class="pbar"><i class="new" style="flex:${p.nw}"></i><i class="learn" style="flex:${p.learning}"></i><i class="known" style="flex:${p.known}"></i></div>
    <div class="plegend"><span><i class="new"></i>${t("New")} ${p.nw}</span><span><i class="learn"></i>${t("Still learning")} ${p.learning}</span><span><i class="known"></i>${t("Known")} ${p.known}</span></div>
    <div class="pl">${t("Coming up: {0} due tomorrow, {1} this week.",p.dueTomorrow,p.dueWeek)}</div>
  </div>`;
}
function statsLine(){ const {total,week,streak}=learnStats(); return t("{0} learned, {1} reviewed this week, streak {2}",nOf(total,"card"),week,nOf(streak,"day")); }
/* ---------- backup nudge + photo cleanup: everything lives on one phone ---------- */
const OLD_DAYS=30;
function backupNote(){
  const last=S.settings.lastExport, days=last?Math.floor((Date.now()-last)/DAY):null;
  const txt=last?(days===0?t("Last export: today."):t("Last export: {0} ago.",nOf(days,"day"))):t("Never exported.");
  const warn=S.custom.length && (!last||days>=OLD_DAYS);
  return warn?`<span class="warn">${txt} ${t("Export now — the cards exist only on this phone.")}</span>`:txt;
}
/* inbox photos older than 30 days that already became a card */
function oldShots(){ const cut=Date.now()-OLD_DAYS*DAY; return S.inbox.filter(sh=>sh.ts<cut && S.custom.some(d=>d.shot===sh.id)); }
function shotsNote(){ const n=S.inbox.length, o=oldShots().length; return t("{0} in the inbox",nOf(n,"photo"))+(o?t(", {0} older than {1} days and already turned into cards",o,OLD_DAYS):"")+"."; }
async function cleanupShots(){
  const list=oldShots(); if(!list.length) return;
  if(!await askSheet({title:list.length>1?t("Delete {0} old photos?",list.length):t("Delete one old photo?"),text:t("The cards keep their own picture."),ok:t("Delete")})) return;
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
    try{ const n=await translatePending(t=>{ st.textContent=t; }); st.textContent=`Translated ${n} card${n===1?"":"s"}.`; }
    catch(err){ st.textContent="Failed: "+(err&&err.message||err); }
    setTimeout(renderNmtRow,1500);
  });
  else setBtn("Turn off",async()=>{ await setSetting("nmt",false); renderNmtRow(); });
}
function renderMore(main){
  const ver=($(".ver")||{}).textContent||"";
  const st=S.persist===true?t("Persistent on this phone."):S.persist===false?t("Not persistent yet. Install the app so the system keeps the data."):t("Checking …");
  main.innerHTML=`<div class="pane more">
    <div class="listhead">${t("Learning")}</div> <!-- first since v275 (H: the dashboard belongs "ganz nach oben, an erste Stelle") -->
    <div class="mrow"><div style="flex:1"><div class="t">${t("Progress")}</div><div class="s">${progressHTML()}</div><div class="fieldacts"><button class="btn mini" id="usage-share">${t("Share report")}</button></div></div></div>
    <div class="mrow"><div><div class="t">${t("Card order")}</div><div class="s">${t("Due cards come first, then up to {0} new ones. This sets the order inside each group.",NEW_PER_SESSION)}</div><div class="chipset orderchips">${LEARN_ORDERS.map(([v,l])=>`<button class="chip${learnOrder()===v?" on":""}" data-learnorder="${v}">${t(l)}</button>`).join("")}</div></div></div>
    ${tagRowHTML()}
    ${undoRunHTML("tags")}
    ${recheckRowHTML()}
    ${undoRunHTML("accept")}
    <div class="listhead">${t("Share")}</div>
    <div class="mrow"><div><div class="t">${t("Share the app")}</div><div class="s" id="app-share-status">${t("Send the link to a friend. The app installs from any browser, no store.")}</div></div><button class="btn mini" id="app-share">${t("Share")}</button></div>
    <div class="mrow"><div style="flex:1"><div class="t">${t("Feedback")}</div><div class="s" id="fb-status">${t("Tell the app's owner what works and what does not.")}</div><textarea class="grow" id="fb-text" rows="2" placeholder="${t("Your message")}"></textarea><div class="fieldacts"><button class="btn mini" id="fb-send">${t("Send")}</button></div></div></div>
    <div class="listhead">${t("Help")}</div>
    <div class="mrow"><div><div class="t">${t("How to use the app")}</div><div class="s">${t("Six short sections: photo, characters, learning, cards, language, what stays on the phone.")}</div></div><button class="btn mini" id="guide-open">${t("Open")}</button></div>
    <div class="listhead">${t("Language")}</div>
    <div class="mrow"><div style="flex:1"><div class="t">${t("Language")}</div><div class="s">${t("The app's own texts and the meaning of new cards. Cards keep their Chinese and pinyin.")}</div><div class="chipset" id="lang-chips" style="margin-top:8px">${LANGS.map(([c,n])=>`<button class="chip${LANG===c?" on":""}" data-lang="${c}">${n}</button>`).join("")}</div></div></div>
    ${translateRowHTML()}
    ${undoRunHTML("meanings")}
    <div class="listhead">${t("Online AI review")}</div>
    <div class="mrow"><div><div class="t">${t("AI review")}</div><div class="s" id="ai-status"></div><div class="s" style="margin-top:6px">${t("What is sent: the Chinese text, pinyin, meaning and your note of flagged, doubtful or pending cards. The framed area of a photo only when the reading is weak, to a provider that takes pictures. Without a key of its own this phone sends through the app owner's relay, which forwards to the provider and keeps only a count.")}</div><label class="check" style="margin:8px 0 0"><input type="checkbox" id="ai-auto"${S.settings.aiAuto!==false?" checked":""}> ${t("Check every new card with the AI automatically (when online)")}</label></div>${S.admin?`<button class="btn mini" id="ai-btn">Set up</button>`:""}</div>
    ${S.admin?`<div class="aiform" id="ai-form" hidden>
      <div class="field"><label>Provider</label><div class="chipset" id="ai-providers">${Object.entries(AI_PROVIDERS).map(([k,v])=>`<button class="chip" data-aipv="${k}">${esc(v.short)}</button>`).join("")}</div>
        <div class="badge" id="ai-acct" style="margin-top:8px"></div>
        <div class="badge" id="ai-where" style="margin-top:6px"></div></div>
      <div class="field" id="ai-basefield" hidden><label>API base URL</label><input id="ai-base" class="mono" autocomplete="off" placeholder="https://…/v1"></div>
      <div class="field"><label>API key (stays on this phone)</label><input id="ai-key" type="password" autocomplete="off"></div>
      <div class="field"><label>Model</label><input id="ai-model" class="mono" autocomplete="off"></div>
      <div class="field" id="ai-picfield" hidden><label class="check"><input type="checkbox" id="ai-picture"${pictureOn()?" checked":""}> Send the framed area to the AI when the reading is weak</label></div>
      <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" id="ai-save">Save</button><button class="del" id="ai-remove">Remove key</button></div>
    </div>`:""}
    <div class="mrow"><div style="flex:1"><div class="t">${t("Review queue")}</div><div class="s" id="ai-runstatus"></div><div class="fieldacts"><button class="btn mini" id="ai-run" hidden></button></div></div></div>
    <div class="listhead">${t("Your data")}</div>
    <div class="mrow"><div><div class="t">${t("Export")}</div><div class="s">${t("Progress and cards as one file, via the share sheet.")} ${backupNote()}</div><label class="check" style="margin:8px 0 0"><input type="checkbox" id="export-photos"${exportPhotos()?" checked":""}> ${t("Include photos (adds about {0} MB)",(photoBytes()*1.37/1048576).toFixed(1))}</label></div><button class="btn mini" id="export">${t("Export")}</button></div>
    <div class="mrow"><div><div class="t">${t("Import")}</div><div class="s">${t("A zeichentrainer-….json.txt file. Existing cards are overwritten.")}</div></div><button class="btn mini" id="import">${t("Import")}</button></div>
    <div class="mrow"><div><div class="t">${t("Flagged cards")}</div><div class="s">${t("{0} flagged for review. Share the list as text, for a teacher.",deck().filter(d=>d.flag).length)}</div></div><span class="btnrow"><button class="btn mini" id="show-flag">${t("Show")}</button><button class="btn mini" id="share-flag">${t("Share")}</button></span></div>
    <div class="mrow"><div><div class="t">${t("Photos")}</div><div class="s" id="shots-status">${esc(shotsNote())}</div></div>${oldShots().length?`<button class="btn mini" id="cleanshots">${t("Delete {0}",oldShots().length)}</button>`:""}</div>
    <div class="mrow"><div><div class="t">${t("Storage")}</div><div class="s" id="storage-status">${esc(st)}</div></div></div>
    <div class="listhead">${t("Privacy")}</div>
    <div class="mrow"><div><div class="t">${t("Usage sharing")}</div><div class="s">${t("Sends anonymous usage counts to the app's owner once a day: days used, cards made and reviewed, AI checks, and the app's error messages. No card text, no photos.")} <span id="share-status">${esc(shareNote())}</span> ${t("Your id: {0}.",`<span id="share-id">${esc(installId())}</span>`)}<label class="check" style="margin:8px 0 0"><input type="checkbox" id="share-usage"${shareOn()?" checked":""}> ${t("Send once a day")}</label></div></div></div>
    <div class="listhead">${t("Advanced settings")}</div>
    ${S.admin?`<div class="mrow"><div><div class="t">Logged in as admin</div><div class="s">Reset, Diagnostics, All users, Mirror, the downloads and the AI setup are shown below until the app is closed.</div></div><button class="btn mini" id="admin-lock">Log out</button></div>`
    :`<div class="mrow"><div style="flex:1"><div class="inrow admin"><span class="s quiet">${t("Admin log in")}</span><input id="admin-pw" type="password" placeholder="${t("Password")}" autocomplete="off"><button class="del" id="admin-unlock">${t("Log in")}</button></div><div class="err" id="admin-err" style="display:none">${t("Wrong password.")}</div></div></div>`} <!-- one quiet line (v283, H: "remove the description for the locked area, just call it admin log in … not very prominent"; v284 "polish": label, field and a plain Log in on one line) --> <!-- the field inside the row (v282, H: the box's bottom corners were square — a .field after the last row took its rounding, and the field stood outside the white surface); the Mirror address the same -->
    ${S.admin?`<div class="listhead">Downloads</div>
    <div class="mrow"><div><div class="t">Offline translation</div><div class="s" id="nmt-status">Checking …</div></div><button class="btn mini" id="nmt-btn" hidden></button></div>
    <div class="mrow"><div><div class="t">Text recognition</div><div class="s" id="ocr-status">Checking …</div></div><button class="btn mini" id="ocr-btn" hidden></button></div>
    <div class="listhead">Updates without a VPN</div>
    <div class="mrow"><div style="flex:1"><div class="t">Mirror</div><div class="s" id="mirror-status">${esc(mirrorText())}</div><div class="inrow"><input id="mirror-url" class="mono" autocomplete="off" placeholder="Mirror address" title="Mirror address (a copy of the app reachable in China)" value="${esc(S.settings.mirror||MIRROR_DEFAULT)}"><button class="btn mini" id="mirror-check">Check now</button></div></div></div>
    <div class="listhead">Diagnostics</div>
    <div class="mrow"><div style="flex:1"><div class="t">Diagnostics</div><div class="s" id="diag-status">${ERRLOG.length} error${ERRLOG.length===1?"":"s"} logged, last reading ${READLOG.length} step${READLOG.length===1?"":"s"}.</div><div class="fieldacts"><button class="btn mini" id="diag-show">Show</button><button class="btn mini" id="diag-share">Share</button><button class="btn mini" id="diag-copy">Copy</button></div></div></div>
    <pre class="diag" id="diag-out" hidden></pre>
    <div class="mrow"><div style="flex:1"><div class="t">All users</div><div class="s" id="users-status">${USERS?`${nOf(USERS.rows.length,"install")}, fetched ${new Date(USERS.at).toLocaleTimeString()}.`:"The latest report of every phone, from the owner's table."}</div><div class="fieldacts"><button class="btn mini" id="users-show">Show</button><button class="btn mini" id="users-share">Share</button><button class="btn mini" id="users-copy">Copy</button></div></div></div>
    <pre class="diag" id="users-out" hidden></pre>
    <div class="mrow"><div style="flex:1"><div class="t">Feedback</div><div class="s" id="fb-in-status">${FEEDBACK?`${nOf(FEEDBACK.rows.length,"message")}, fetched ${new Date(FEEDBACK.at).toLocaleTimeString()}.`:"The messages users sent from the app, newest first."}</div><div class="fieldacts"><button class="btn mini" id="fb-show">Show</button><button class="btn mini" id="fb-share">Share</button><button class="btn mini" id="fb-copy">Copy</button></div></div></div>
    <pre class="diag" id="fb-out" hidden></pre>
    <div class="listhead">Start over</div>
    <div class="mrow"><div><div class="t">Reset</div><div class="s">Deletes progress, cards and photos.</div></div><button class="btn mini danger" id="reset">Reset</button></div>`:""}
    <div class="listhead">${t("About")}</div>
    <div class="mrow"><div><div class="t">识字 Zeichentrainer</div><div class="s" id="about-s">${esc(aboutText())}</div></div></div>
  </div>`;
  $("#export").onclick=exportData;
  $("#export-photos").onchange=e=>setSetting("exportPhotos",!!e.target.checked);
  $("#usage-share").onclick=shareProgress; $("#app-share").onclick=shareApp;
  document.querySelectorAll("[data-lang]").forEach(b=> b.onclick=()=>setLang(b.dataset.lang));
  const tr=$("#translate-all"); if(tr) tr.onclick=translateAll;
  const tg=$("#tag-all"); if(tg) tg.onclick=tagAll; /* Tag all cards (v368) */
  const ur=$("#undo-run"); if(ur) ur.onclick=undoLastRun; /* Undo last run (v369) */
  const rc=$("#recheck-all"); if(rc) rc.onclick=recheckAll; /* Check all cards again (v370) */
  $("#guide-open").onclick=()=>{ S.mode="guide"; render(); window.scrollTo({top:0}); };
  wireGrow(main); /* the feedback box grows with its text like the forms' fields (v218, H: "looks a little bit old school") */
  $("#fb-send").onclick=async()=>{ const tx=$("#fb-text"), st=$("#fb-status"), b=$("#fb-send"), text=tx.value.trim(); if(!text){ st.textContent=t("Write a few words first."); return; }
    if(!navigator.onLine){ st.textContent=t("No connection. Try again when online."); return; }
    b.disabled=true; st.textContent=t("Sending …");
    try{ await sendFeedback(text); tx.value=""; st.textContent=t("Thank you, sent."); }catch(err){ st.textContent=t("Could not send: {0}",err&&err.message||err); } b.disabled=false; };
  $("#share-usage").onchange=async e=>{ await setSetting("shareUsage",!!e.target.checked); $("#share-status").textContent=shareNote(); sendReport(); };
  $("#import").onclick=()=>$("#imp").click();
  $("#share-flag").onclick=shareFlagged;
  $("#show-flag").onclick=()=>{ S.mode="cards"; S.detail=null; S.editing=null; S.query=""; S.filterUnv=false; S.filterAi=false; S.filterTags=[]; S.filterFlag=true; render(); };
  const cs=$("#cleanshots"); if(cs) cs.onclick=cleanupShots;
  if(S.admin){
    $("#diag-show").onclick=()=>{ const o=$("#diag-out"); o.hidden=!o.hidden; if(!o.hidden) o.textContent=diagText(); };
    $("#diag-share").onclick=shareDiag;
    $("#diag-copy").onclick=()=>copyText(diagText(),$("#diag-status"));
    $("#users-copy").onclick=async()=>{ const st=$("#users-status"); try{ const rows=(USERS&&USERS.rows)||(await fetchAllUsers()).rows; await copyText(allUsersText(rows),st); }catch(err){ st.textContent="Could not fetch: "+(err&&err.message||err); } };
    $("#fb-copy").onclick=async()=>{ const st=$("#fb-in-status"); try{ const rows=(FEEDBACK&&FEEDBACK.rows)||(await fetchFeedback()).rows; await copyText(feedbackText(rows),st); }catch(err){ st.textContent="Could not fetch: "+(err&&err.message||err); } };
    $("#users-show").onclick=async()=>{ const o=$("#users-out"), st=$("#users-status"); if(!o.hidden&&USERS){ o.hidden=true; return; }
      st.textContent="Fetching …"; try{ const u=await fetchAllUsers(); o.textContent=allUsersText(u.rows); o.hidden=false; st.textContent=`${nOf(u.rows.length,"install")}, fetched ${new Date(u.at).toLocaleTimeString()}.`; }
      catch(err){ st.textContent="Could not fetch: "+(err&&err.message||err); } };
    $("#users-share").onclick=async()=>{ const st=$("#users-status"); try{ await shareUsers(); }catch(err){ st.textContent="Could not fetch: "+(err&&err.message||err); } };
    $("#fb-show").onclick=async()=>{ const o=$("#fb-out"), st=$("#fb-in-status"); if(!o.hidden&&FEEDBACK){ o.hidden=true; return; }
      st.textContent="Fetching …"; try{ const f=await fetchFeedback(); o.textContent=feedbackText(f.rows); o.hidden=false; st.textContent=`${nOf(f.rows.length,"message")}, fetched ${new Date(f.at).toLocaleTimeString()}.`; }
      catch(err){ st.textContent="Could not fetch: "+(err&&err.message||err); } };
    $("#fb-share").onclick=async()=>{ const st=$("#fb-in-status"); try{ await shareFeedback(); }catch(err){ st.textContent="Could not fetch: "+(err&&err.message||err); } };
    $("#mirror-url").onchange=async e=>{ await setSetting("mirror",e.target.value.trim()); tellMirror(); };
    renderOcrRow();
    $("#mirror-check").onclick=()=>{ mirrorCheck(true); };
    $("#reset").onclick=resetAll;
    $("#admin-lock").onclick=()=>{ S.admin=false; S.adminPw=null; USERS=null; FEEDBACK=null; render(); };
  } else {
    const pw=$("#admin-pw"), go=async()=>{ const h=await sha256(pw.value); if(h===ADMIN_HASH){ S.admin=true; S.adminPw=pw.value; render(); window.scrollTo({top:0}); } else { $("#admin-err").style.display=""; pw.value=""; } };
    $("#admin-unlock").onclick=go; pw.addEventListener("keydown",e=>{ if(e.key==="Enter") go(); });
  }
  main.querySelectorAll("[data-learnorder]").forEach(b=> b.onclick=async()=>{ await setSetting("learnOrder",b.dataset.learnorder); S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false; S.single=null; S.saved=null; setStats(); main.querySelectorAll("[data-learnorder]").forEach(x=>x.classList.toggle("on",x===b)); }); /* the Learn session follows at once (v153) */
  renderNmtRow(); renderAiRow();
}

/* ---------- How to use the app (v259, H's to-do "a user guide (Gebrauchsanleitung)" for his friends — described first as a page inside
   the app, "Go"): one scrolling page in the app's language, six short sections, text only, offline; it describes what the app does today,
   nothing planned, and changes in the same PR as the screen it describes. More → Help → Open; ← Back returns to More. ---------- */
const GUIDE=()=>[
  {h:t("Take a photo"),p:[t("Camera → Take photo, or From album. The app finds the text, reads it and makes the card by itself — you see the finished card with Edit and Delete under it. Edit shows the photo with the frame the app used: drag a corner or the inside to fit it, the round handle turns it, let go and the reading starts again."),
    t("A photo of a control panel, or of several signs beside each other — a rice cooker’s buttons, the items of a menu board — becomes one card per label, each with its own cut of the photo."),
    t("Crop frames a photo by hand, with a preview before the card is saved. In a hurry there? Save now makes the card at once and the reading fills it in.")]},
  {h:t("Fix the characters"),p:[t("Under the photo every character is a button. Tap one for other readings, or draw it with your finger when the right one is missing. Type the line below the strip to replace it. Select removes several characters at once."),
    t("Pinyin and meaning follow the characters. With the AI on, it checks them before you save. Flag the card when something still looks wrong.")]},
  {h:t("Learn"),p:[t("Learn shows the cards that are due, then up to eight new ones. Tap the character for pinyin and meaning, tap the photo for the whole picture, the speaker reads it out."),
    t("Grade yourself: Again, Hard, Good, Easy. The card comes back sooner or later, that is the whole trick. Nothing due? Pull the next cards forward.")]},
  {h:t("Cards"),p:[t("All your cards, newest first. Search them, filter by flag or tag, tap one for its detail with Test, Edit and Delete. + New makes a card by hand, drawn character included."),
    t("Tags group cards for a class or a level, and a card from a photo gets one for what it is — Menu, Shop, Product, Appliance and so on; More → Learning → Tag all cards gives the older cards one too. Learn shows the tags you pick. Press and hold a card to mark several and delete them together — a photo in the Camera tab the same way.")]},
  {h:t("Language and meanings"),p:[t("More → Language switches the app's texts. With the AI on, new cards get their meaning in that language, and Translate all cards does it for the ones you already have. A small pill names a meaning that is still in another language.")]},
  {h:t("What stays on the phone"),p:[t("Cards and photos stay on this phone and nowhere else — export them under More → Your data now and then. The AI check sends the Chinese text, pinyin and meaning of a card, and the framed part of a photo only when the reading is weak."),
    t("Once a day anonymous usage counts and the app's error messages go to the app's owner; switch that off under Privacy. Questions or ideas? More → Feedback.")]}];
function renderGuide(main){
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back-more">${t("← Back")}</button><span class="badge">${t("How to use the app")}</span></div>
    <div class="guide">${GUIDE().map(sec=>`<section><h2>${esc(sec.h)}</h2>${sec.p.map(x=>`<p>${esc(x)}</p>`).join("")}</section>`).join("")}</div>
  </div>`;
  $("#back-more").onclick=()=>{ S.mode="more"; render(); };
}
function tagsHTML(d,isNew){
  return `<div class="tags">${d.flag?`<span class="f">${t("⚑ Review")}</span>`:""}<span class="${isNew?"n":"r"}">${isNew?t("New"):t("Review")}</span></div>`; /* no card type (H, v105) */
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
  return d.flag?`<div class="flagbox">${t("⚑ Flagged for review")}${d.flagNote?`: ${esc(d.flagNote)}`:""}</div>`:"";
}
function flaggedText(){
  /* plain-text list of flagged cards, e.g. to send to a teacher via the share sheet */
  const list=deck().filter(d=>d.flag);
  const lines=list.map(d=>`${d.c.replace(/\n/g," / ")}\n  ${d.p}\n  ${d.m}${d.flagNote?`\n  note: ${d.flagNote}`:""}`);
  return `Zeichentrainer — ${list.length} card${list.length===1?"":"s"} flagged for review (${new Date().toLocaleDateString("en-GB")})\n\n`+lines.join("\n\n")+"\n";
}
async function shareFlagged(){
  const n=deck().filter(d=>d.flag).length;
  if(!n){ noteSheet(t("No flagged cards.")); return; }
  const text=flaggedText();
  const name="zeichentrainer-review-"+new Date().toISOString().slice(0,10)+".txt";
  const file=new File([text],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:name,text:"Cards flagged for review"}); return; }
    catch(err){ if(err && err.name==="AbortError") return; }
  }
  if(navigator.share){ try{ await navigator.share({title:name,text}); return; }catch(err){ if(err && err.name==="AbortError") return; } }
  try{ await navigator.clipboard.writeText(text); noteSheet(t("Copied to the clipboard.")); }
  catch(err){ noteSheet(t("Sharing is not available here.")); }
}
/* one object URL per blob, for images that re-render on every tap (the study front, the Add form) — never revoked while the blob lives */
const BLOBURL=new WeakMap();
function urlOf(blob){ let u=BLOBURL.get(blob); if(!u){ u=URL.createObjectURL(blob); BLOBURL.set(blob,u); } return u; }
/* the whole photo of a card: stored with it, or still in the inbox */
const fullPhoto=d=>d.imgFull||(d.shot&&(S.inbox.find(x=>x.id===d.shot)||{}).blob)||null;
/* The whole photo is stored once (v214, H: "Go" on the storage saving of the v213 audit): a card keeps no imgFull while its
   inbox photo exists — fullPhoto finds it through shot —, the copy is made into every card that references a photo just
   before the photo goes (keepPhoto, from delShot), and cards from before v214, which carry the duplicate, drop it at boot
   while their inbox photo is still there (dedupePhotos). Until v213 saveSign copied the inbox blob into the card, and
   IndexedDB stored it twice — half of a phone's photo bytes. */
async function keepPhoto(id){
  const sh=S.inbox.find(x=>x.id===id); if(!sh||!sh.blob) return;
  for(const d of S.custom) if(d.shot===id&&!d.imgFull){ d.imgFull=sh.blob; try{ await idbPut("custom",d); }catch(e){} }
}
async function dedupePhotos(){
  const dup=S.custom.filter(d=>d.imgFull&&d.shot&&S.inbox.some(x=>x.id===d.shot&&x.blob));
  for(const d of dup){ delete d.imgFull; try{ await idbPut("custom",d); }catch(e){} }
  return dup.length;
}
/* the photo on the front: the crop, or — after a tap on it — the whole photo (S.fullPic) */
function frontPic(d){
  const pk=S.peek&&S.peek!==d.id?cardOf(S.peek):null; /* Learn: a linked card's photo, tapped in the "Also on another photo" row (v155) */
  const full=pk?fullPhoto(pk):fullPhoto(d);
  const blob=pk?(pk.img||full):(S.fullPic&&full?full:d.img); if(!blob) return "";
  /* the crop sits in a fixed 16:9 box at the card's width, fitted inside on the card's grey surface, so every card has the
     same height whatever shape the frame had (v224, H's "Go" on the design review after "Bitte consistency!"); the whole
     photo, a deliberate tap, keeps its own shape */
  const img=`<img class="signimg${S.fullPic&&full?" full":""}" data-pic="1" src="${urlOf(blob)}" alt="photo">`;
  return S.fullPic&&full?img:`<div class="picbox" data-pic="1"><img class="picbg" src="${urlOf(blob)}" alt="" aria-hidden="true">${img}</div>`; /* the blurred fill behind the fitted crop, in the photo's colours (v229/v230) */
}
/* a card saved before its reading is done (v237): the box shows the reading bar, or one plain line once the reading failed */
const waitingHTML=d=>d.reading&&d.reading.failed?`<span class="wait failed">${t("Nothing could be read.")}</span>`:`<span class="wait">${busyHTML(t("Reading the text …"))}</span>`;
function frontHTML(d){
  const scriptNote=d.trad?`<div class="script"><span class="pill trad">${t("Traditional")}</span></div>`:""; /* one pill under the box (v227, H's "Go" on the design review — until v226 two lines, "Traditional characters, as on the photo" and "Simplified 养乐多"); the simplified form sits on the back now (simpRefHTML), plain words, no 简/繁 shorthand (H, v106) */
  if(d.kind==="sign"){
    /* sign card: the picture is the exercise, text underneath wrapped only between words */
    const lines0=(d.trad||d.c).split("\n");
    const longest=Math.max(...lines0.map(glyphs));
    const {lines,fs}=fitLines(lines0,d.segs,Math.max(260,frontWidth()),longest<=6?40:longest<=9?30:24,22);
    return `<div class="signfront">${frontPic(d)}
      <div class="signtext" style="font-size:${fs}px">${lines.map(l=>`<div>${esc(l)}</div>`).join("")}</div>${scriptNote}</div>`;
  }
  const single=!!d.c&&glyphs(d.c)<=1; /* an empty text gets no crosshair (v237) */
  /* the photo is the cue — it belongs on the front, before reveal */
  const pic=frontPic(d);
  const lines0=d.trad?d.trad.split("\n"):frontLines(d), {W,H,fs,lines}=frontBox(lines0,headFont(d.c),frontWords(d)); /* the front shows the photo's script; the card's key stays simplified */
  return `${pic}<div class="reticle" style="width:${W}px;height:${H}px">${reticleSVG(single,W,H)}<div class="glyph" style="font-size:${fs}px">${d.c?lines.map(esc).join("<br>"):waitingHTML(d)}</div></div>${scriptNote}`;
}
/* ---------- pronunciation: the phone's own Chinese voice (nothing downloaded, works offline) ---------- */
let TTS_VOICE=null;
/* the phone's Chinese voice: looked up afresh whenever none was found yet — Android hands the voice list over late and
   sometimes in two parts, and a "no voice" answer must not stick for the session (v164, H: "the speaker icon doesn't
   appear on my Android phone"; until v163 the button showed only with a voice found, so a late list hid it for good) */
function ttsVoice(){
  if(!("speechSynthesis" in window)) return null;
  if(TTS_VOICE) return TTS_VOICE;
  const vs=speechSynthesis.getVoices();
  if(!vs.length) speechSynthesis.addEventListener("voiceschanged",()=>{ if(ttsVoice()&&S.revealed) render(); },{once:true});
  TTS_VOICE=vs.find(v=>/^zh[-_]?CN/i.test(v.lang))||vs.find(v=>/^(zh|cmn)/i.test(v.lang))||null;
  return TTS_VOICE;
}
let SAY_TIMER=null;
function say(text){
  const v=ttsVoice(), hint=on=>{ const h=$("#say-hint"); if(h) h.hidden=!on; };
  /* the hint comes only when speaking fails, never from the voice list: H's Xiaomi reports no voices at all through
     getVoices() and still speaks Chinese through the system engine (v165, diagnostics "voices (0)"); an utterance that
     neither starts nor errors within three seconds counts as failed too */
  try{
    speechSynthesis.cancel(); clearTimeout(SAY_TIMER);
    const u=new SpeechSynthesisUtterance(text.replace(/\n/g,"，")); if(v){ u.voice=v; u.lang=v.lang; } else u.lang="zh-CN"; u.rate=0.85;
    u.onstart=()=>{ clearTimeout(SAY_TIMER); hint(false); };
    u.onerror=e=>{ clearTimeout(SAY_TIMER); if(!e||e.error!=="interrupted"&&e.error!=="canceled") hint(true); };
    SAY_TIMER=setTimeout(()=>hint(true),3000);
    speechSynthesis.speak(u);
  }catch(e){ hint(true); }
}
function voiceList(){ try{ return ("speechSynthesis" in window)?speechSynthesis.getVoices().map(v=>v.lang+" "+v.name):[]; }catch(e){ return []; } }
const SAY_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15 9.2a3.6 3.6 0 0 1 0 5.6"/><path d="M17.3 6.6a7 7 0 0 1 0 10.8"/></svg>';
function sayBtn(d){ return ("speechSynthesis" in window)?`<button class="say" data-say="${esc(d.c)}" aria-label="${t("Pronounce")}">${SAY_SVG}</button>`:""; } /* shown whenever the phone can speak at all (v164) */
const sayHint=()=>`<div class="badge" id="say-hint" hidden>${t("No Chinese voice on this phone — add one under Settings, Text-to-speech output.")}</div>`;
function wireSay(root){ (root||document).querySelectorAll("[data-say]").forEach(b=> b.onclick=e=>{ e.stopPropagation(); say(b.dataset.say); }); }
/* dictionary meanings without CC-CEDICT clutter: "[Tian1 jin1 shi4]" pinyin, "CL:…" classifiers */
function cleanSense(m){ return String(m||"").replace(/\(Taiwan pr\.[^)]*\)/g,"").replace(/\[[^\]]*\]/g,"").replace(/\s*CL:[^;,)]*/g,"").replace(/\(\s*\)/g,"").replace(/\s{2,}/g," ").trim(); }
/* the words of the card as buttons on the back — tap one for its pinyin and meaning; a word of
   several characters then offers its characters too. Replaces the old word/gloss tables (H: redundant). */
/* what a number with a Latin unit means (v337, H on the 24H part: "24H is not only a number, it means 24 hours"): the unit's
   word in the app's language after the number — 24 hours, 380 millilitres, 20 percent; a bare number or an unknown unit
   reads as it is */
const LATIN_UNITS={h:["hour","hours"],hr:["hour","hours"],hrs:["hour","hours"],min:["minute","minutes"],s:["second","seconds"],sec:["second","seconds"],ml:["millilitre","millilitres"],l:["litre","litres"],g:["gram","grams"],mg:["milligram","milligrams"],kg:["kilogram","kilograms"],km:["kilometre","kilometres"],m:["metre","metres"],cm:["centimetre","centimetres"],mm:["millimetre","millimetres"],"%":["percent","percent"],kcal:["kilocalorie","kilocalories"],w:["watt","watts"],kw:["kilowatt","kilowatts"],v:["volt","volts"],mah:["milliampere-hour","milliampere-hours"]};
function latinUnitMeaning(w){
  const m=w.match(/^([0-9]+(?:\.[0-9]+)?)([a-zA-Z%]*)$/); if(!m) return "";
  const u=LATIN_UNITS[m[2].toLowerCase()]; if(!u) return "";
  return m[1]+" "+t(+m[1]===1?u[0]:u[1]);
}
const cardGloss=d=>mergeUnits(d.gloss||[]); /* the stored gloss with a number and its unit as one part (v309; cards from before carry them apart) */
function cardParts(d){
  let words=d.gloss&&d.gloss.length?cardGloss(d).map(g=>g.w):(d.kind==="sign"?(d.segs||[]).flat():(d.seg||[]).filter(x=>x!=="\n"));
  words=words.filter(w=>CJK.test(w)||NUM_PART.test(w)); /* a number with its unit is a part of the meaning and stays in the row (v336, H's 24H存包: "das 24H sollte auch in der Zeile bei den chinesischen Schriftzeichen dabei sein") */
  if(words.length<2) words=[...d.c].filter(ch=>CJK.test(ch)); /* one word → its characters */
  return [...new Set(words)];
}
function charsHTML(d){
  const parts=cardParts(d);
  if(parts.length<2||parts.length>16) return "";
  return `<div class="chars">${parts.map(w=>`<button class="ch" data-ch="${esc(w)}">${esc(w)}</button>`).join("")}</div><div class="chinfo" id="chinfo" hidden></div>`;
}
/* the parts row's dictionary and pinyin library load in the background as soon as a card's back is shown, so the first
   word tap finds them ready (v235, H's "Go" after "Why loading the dictionary?" — until v234 the first tap of a session
   waited a second or two for the 2.5 MB file to parse); once per session, from the phone's cache, errors are silent
   — the tap itself still loads on demand when the warm-up did not run or failed */
function warmParts(){ if(!window.pinyinPro) loadScript("./vendor/pinyin-pro.js").catch(()=>{}); if(!DICT) loadDict().catch(()=>{}); }
async function charInfo(w,btn,d){
  const box=$("#chinfo"); if(!box) return;
  document.querySelectorAll(".chars .ch").forEach(b=>b.classList.toggle("on",b===btn));
  box.hidden=false; if(!DICT||!window.pinyinPro) box.innerHTML=`<span class="badge">${t("Loading the dictionary …")}</span>`;
  try{
    if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js");
    await loadDict().catch(()=>{});
    const known=d&&d.gloss&&cardGloss(d).find(g=>g.w===w);
    const py=known&&known.p?known.p:pinyinPro.pinyin(w,{toneType:"symbol"});
    const m=cleanSense((known&&known.m)||bestSense(w)||((DICT&&DICT.get(w))||""));
    const chars=[...w].filter(ch=>CJK.test(ch));
    const sub=chars.length>1||(known&&known.unit)?`<div class="chars sub">${chars.map(ch=>`<button class="ch" data-sub="${ch}">${ch}</button>`).join("")}</div>`:"";
    box.innerHTML=NUM_PART.test(w)?`<div class="chline"><span class="hanzi">${esc(w)}</span><span>${esc(latinUnitMeaning(w)||t("A number, read as it is."))}</span></div>`
      :`<div class="chline"><span class="hanzi">${esc(w)}</span><span class="mono">${esc(py)}</span><span>${esc(m||t("not in the dictionary"))}</span></div>${sub}`; /* a number part shows itself once, not as its own pinyin and meaning (v336) */
    box.querySelectorAll("[data-sub]").forEach(b=> b.onclick=async e=>{ e.stopPropagation(); const ch=b.dataset.sub;
      box.querySelectorAll(".sub .ch").forEach(x=>x.classList.toggle("on",x===b));
      const line=box.querySelector(".chline"); line.innerHTML=`<span class="hanzi">${esc(ch)}</span><span class="mono">${esc(pinyinPro.pinyin(ch,{toneType:"symbol"}))}</span><span>${esc(cleanSense(bestSense(ch)||((DICT&&DICT.get(ch))||""))||t("not in the dictionary"))}</span>`; });
  }catch(e){ box.innerHTML=`<span class="badge">${t("Dictionary not available.")}</span>`; }
}
function wireChars(d){ document.querySelectorAll(".chars:not(.sub) .ch").forEach(b=> b.onclick=e=>{ e.stopPropagation(); charInfo(b.dataset.ch,b,d); }); }
/* the tap hints under the card ("Tap the character to reveal …") show only while the app is new — until the phone has
   HINT_REVIEWS reviews all time (v226, H's "Go" on the design review: a line of instruction on every card forever is noise) */
const HINT_REVIEWS=20;
const showHints=()=>(usage().reviews||0)<HINT_REVIEWS;
/* the simplified form of a traditional card, on the back above the pinyin (v227; on the front until v226, H v102) */
const simpRefHTML=d=>d.trad?`<div class="script back"><span class="scriptref"><span class="lbl">${t("Simplified")}</span><span class="hanzi">${esc(d.c.replace(/\n/g," / "))}</span></span></div>`:"";
function backHTML(d){
  const wordBlock = d.w ? `<div class="rule"></div>
    <div class="word"><span class="w">${esc(d.w)}</span><span class="wp">${esc(d.wp||"")}</span></div>
    <div class="wm">${esc(d.wm||"")}</div>` : "";
  const glossBlock = d.kind==="sign" ? `
    ${d.mt&&!d.mt.verified?`<span class="flag">${t("meaning unverified")}${d.mt.pending?t(" (translation pending)"):""}${d.mt.suspect?t(" (reading uncertain: {0})",esc(d.mt.suspect)):""}</span>`:""}
` : "";
  return `${simpRefHTML(d)}<div class="pin">${esc(d.p)}${sayBtn(d)}</div>${sayHint()}<div class="mean">${esc(d.m)}${mlPill(d)}</div>${charsHTML(d)}
    ${d.kind==="sign"?glossBlock:wordBlock}${linkedHTML(d)}`;
}
/* the other cards with the same text (v122, H: "if one character connects to various photos, then link them"): their
   crops in a row on the back and in the card detail; a tap opens that card */
const sameText=d=>deck().filter(x=>x.id!==d.id&&d.c&&x.c===d.c).sort((a,b)=>(b.at||0)-(a.at||0));
function linkedHTML(d){
  const others=sameText(d); if(!others.length) return "";
  return `<div class="linked"><div class="lbl">${others.length===1?t("Also on another photo"):t("Also on {0} other photos",others.length)}</div><div class="thumbs">${others.map(x=>`<button class="lnk${S.mode==="study"&&S.peek===x.id?" on":""}" data-link="${esc(x.id)}" aria-label="${S.mode==="study"?t("Show this photo"):t("Open this card")}">${x.img||fullPhoto(x)?`<img class="thumbbg" src="${thumbURL(x)}" alt="" aria-hidden="true"><img class="thumb" src="${thumbURL(x)}" alt="">`:`<span class="glyph hanzi">${esc([...x.c][0])}</span>`}</button>`).join("")}</div></div>`;
}
function wireLinks(root){ (root||document).querySelectorAll("[data-link]").forEach(b=> b.onclick=()=>{
  /* in Learn the tap shows that photo on the card in place, a second tap returns — the session goes on (v155, H: "I'm
     getting out of the learn mode. That should not happen"); in the Cards detail it opens the other card as before */
  if(S.mode==="study"){ S.peek=S.peek===b.dataset.link?null:b.dataset.link; S.fullPic=false; render(); return; }
  S.mode="cards"; S.detail=b.dataset.link; S.detailHide=false; S.fullPic=false; S.editing=null; render(); window.scrollTo({top:0}); }); }
function endSingle(){
  /* leave single-card test mode and restore the session queue */
  const c=S.single; S.single=null;
  if(S.saved){ Object.assign(S,S.saved); S.saved=null; }
  S.revealed=false; S.mode="cards"; S.detail=c; render();
}
function renderStudy(main){
  if(!S.ready){ main.innerHTML=`<div class="badge">${t("Loading …")}</div>`; return; }
  if(!deck().length){
    main.innerHTML=wxNoteHTML()+`<div class="done">
      <div class="mark">始</div>
      <h2>${t("No cards yet.")}</h2>
      <p>${t("Photograph a sign, a menu or a package under <b>Camera</b> — or add a word by hand under <b>Cards → + New</b>.")}</p>
      <button class="btn" id="go-cam">${t("Take a photo")}</button>
      <p class="hint">${t("New here? The guide explains the app in six short sections.")}</p>
      <button class="del" id="go-guide">${t("How to use the app")}</button>
    </div>`;
    $("#go-cam").onclick=()=>{ S.mode="inbox"; render(); }; $("#go-guide").onclick=()=>{ S.mode="guide"; render(); window.scrollTo({top:0}); }; /* the pointer to the guide (v266, idea 5) — a friend who installs the app never sees More → Help unless told */
    return;
  }
  const finished = S.idx>=S.queue.length;
  if(finished){
    main.innerHTML=wxNoteHTML()+learnChipsHTML()+`<div class="done">
      <div class="mark">净</div>
      <h2>${t("All clear.")}</h2>
      <p>${S.ahead?t("Pulled-forward round finished."):t("Nothing due today. Come back tomorrow — or pull the next cards forward.")}</p>
      <div class="badge" style="margin-bottom:18px">${statsLine()}</div>
      <button class="btn" id="ahead">${t("Pull the next cards forward")}</button>
    </div>`;
    const a=$("#ahead"); if(a) a.onclick=()=>{ const q=buildQueue(true); if(q.length){S.queue=q;S.idx=0;S.done=0;S.ahead=true;S.revealed=false;render();} };
    wireLearnChips();
    return;
  }
  const c=S.queue[S.idx], d=cardOf(c), sched=S.progress[c]||null, isNew=!S.progress[c];
  let back="";
  if(S.revealed){
    const grds=[["again","Again"],["hard","Hard"],["good","Good"],["easy","Easy"]].map(([g,l])=>
      `<button class="grade" data-g="${g}"><span class="lbl">${t(l)}</span><span class="iv">${previewInterval(sched,g)}</span></button>`).join("");
    back=`<div style="margin-top:26px">${backHTML(d)}${flagNoteHTML(d)}${aiBoxHTML(d)}<div class="grades">${grds}</div>
      <div class="backacts"><button class="del flagbtn${d.flag?" on":""}" id="flag">${d.flag?t("⚑ Clear flag"):t("⚑ Flag for review")}</button><button class="del" id="edit-card">${t("✎ Edit")}</button></div></div>`;
  } else {
    back=showHints()?`<div class="hint">${t("Tap the character to reveal")}${fullPhoto(d)?t(", or the photo for the whole picture"):""}.</div>`:"";
  }
  /* front: no tag row (theme / new / custom is noise while learning); tapping the photo or the character reveals */
  main.innerHTML=wxNoteHTML()+learnChipsHTML()+`<div class="card">
    ${S.single?`<div class="topline"><button class="del" id="back-cards">${t("← Cards")}</button><span class="badge">${t("Testing from the list")}</span></div>`:""}
    <div class="front tap" id="reveal">${frontHTML(d)}</div>
    ${back}</div>`;
  if(S.revealed) warmParts();
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
  bump("reviews");
  const c=S.queue[S.idx], sched=S.progress[c]||null;
  const s=schedule(sched,g);
  S.progress[c]=s;
  try{ await idbPut("progress",{id:c,...s}); }catch(e){}
  const d=cardOf(c);
  if(s.fails>=LEECH_FAILS && d && !d.flag) await setFlag(c,true,t("failed {0} times in a row — check text, meaning and photo",s.fails));
  const day=dayKey(), days=S.settings.days||[];
  if(days[days.length-1]!==day){ days.push(day); if(days.length>400) days.shift(); await setSetting("days",days); }
  dailyBump(day);
  if(S.single){ nextSingle(c); return; }
  if(g==="again") S.queue.push(c); else S.done++;
  S.idx++; S.revealed=false; S.fullPic=false; S.peek=null; render(); window.scrollTo({top:0});
}
/* "Test this card" continues with the next card of the list (newest first); ← Cards stops */
function nextSingle(c){
  const list=S.custom.slice().sort((a,b)=>(b.at||0)-(a.at||0)).map(d=>d.id);
  const next=list[list.indexOf(c)+1];
  if(!next){ endSingle(); return; }
  S.single=next; S.queue=[next]; S.idx=0; S.revealed=false; S.fullPic=false; S.peek=null; render(); window.scrollTo({top:0});
}

/* ---------- Add ---------- */
function renderAdd(main){
  const curImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  const imgField=curImg?`<div class="field" id="f-imgfield"><label>${t("Image (stays on this phone)")}</label>
      <div class="pimg"><img src="${urlOf(curImg)}" alt="card image">
      <span class="imgacts">${S.pendingFull&&S.pendingImg?`<button class="del${S.pendingUse!=="full"?" on":""}" id="f-usecrop">${t("Crop")}</button><button class="del${S.pendingUse==="full"?" on":""}" id="f-usefull">${t("Whole photo")}</button>`:""}<button class="del" id="f-noimg">${t("Remove image")}</button></span></div></div>`:"";
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back-cards">${t("← Cards")}</button></div>
    <div class="lead">${t("Add a card by hand.")}</div>
    <div class="form">
    ${imgField}
    <div class="field"><label>${t("Characters")}</label><input id="f-word" class="hanzi big" placeholder="你好" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><div class="fieldacts"><button type="button" class="btn mini" id="f-draw">${t("Draw a character")}</button></div></div>
      <div class="field"><label>${t("Pinyin")}</label><textarea id="f-pin" class="grow" rows="1" placeholder="nǐ hǎo" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea></div>
      <div class="field"><label>${t("Meaning")}</label><textarea id="f-mean" class="grow" rows="1" placeholder="${t("hello")}"></textarea><div class="smean badge" id="f-aistatus" style="margin-top:4px"></div></div>
    <div class="field"><label class="check"><input type="checkbox" id="f-flag"> ${t("⚑ Flag for review (text, pinyin or meaning looks wrong)")}</label>
      <input id="f-note" placeholder="${t("Note for the reviewer (optional)")}" hidden></div>
    ${tagsFieldHTML("f-tags",(S.draft||{}).tags)}
    <div id="f-pinhint" class="err" style="display:none">${t("Pinyin and meaning were filled in automatically and are unverified — check the tones and the meaning.")}</div>
    <div id="f-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="f-add">${t("Add card")}</button>
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
  const saveDraft=()=>{ S.draft={ ...(S.draft||{}), w:$("#f-word").value, p:$("#f-pin").value, m:$("#f-mean").value, flag:$("#f-flag").checked, note:$("#f-note").value, tags:parseTags($("#f-tags").value),
    autoPin:$("#f-pinhint").style.display!=="none" }; };
  ["f-word","f-pin","f-mean","f-note"].forEach(id=>$("#"+id).oninput=saveDraft);
  /* Pinyin and meaning fill in by themselves (v159, H: "add an automatic AI translation function"): a second after the
     last change to the characters the AI is asked when it is live, else the dictionary and the phrasebook fill the fields
     as with a photo, marked unverified. Fields typed by hand are not overwritten; a stale answer (the word changed
     meanwhile) is dropped. */
  let pinTouched=!!$("#f-pin").value, meanTouched=!!$("#f-mean").value, fillTimer=null, fillRun=0;
  $("#f-pin").addEventListener("input",()=>{ pinTouched=!!$("#f-pin").value.trim(); });
  $("#f-mean").addEventListener("input",()=>{ meanTouched=!!$("#f-mean").value.trim(); });
  const autoFill=async()=>{
    const fw=$("#f-word"), st=$("#f-aistatus"); if(!fw||!st) return; /* the form was left before the timer fired */
    const word=fw.value.replace(/\s+/g,""); if(!CJK.test(word)||(pinTouched&&meanTouched)) return;
    const run=++fillRun, same=()=>run===fillRun&&$("#f-word")&&$("#f-word").value.replace(/\s+/g,"")===word;
    if(S.draft) delete S.draft.ai;
    if(aiLive()){
      st.innerHTML=busyHTML(t(AI_BUSY_TEXT));
      try{
        const [r]=await aiAsk([{kind:"word",c:word,p:"",m:"",mt:{src:"dict",verified:false,suspect:"typed by hand, please check"}}]);
        if(!same()) return;
        if(r&&!r.bad&&(r.p||r.m)){
          if(r.p&&!pinTouched) $("#f-pin").value=r.p;
          if(r.m&&!meanTouched) $("#f-mean").value=r.m;
          wireGrow(main); st.textContent=""; $("#f-pinhint").style.display="none";
          saveDraft(); S.draft.ai={c:word,p:r.p||"",m:r.m||"",ml:r.ml}; return;
        }
      }catch(err){ if(!same()) return; st.textContent=t(AI_NET_ERR)+"."; }
    }
    try{
      await loadDict(); await loadSigns().catch(()=>{}); if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js");
      if(!same()) return;
      const r=lineMeaning(word), one=(r.gloss||[]).filter(g=>!g.punct&&!g.num);
      if(r.py&&!pinTouched) $("#f-pin").value=r.py;
      if(r.en&&!meanTouched) $("#f-mean").value=cleanSense(one.length===1&&one[0].m?one[0].m:r.en); /* one dictionary word: its meaning alone, not "快门 shutter" */
      wireGrow(main); if(!aiLive()) st.textContent=""; $("#f-pinhint").style.display=""; saveDraft();
    }catch(err){ if(same()) st.textContent=""; }
  };
  $("#f-word").addEventListener("input",()=>{ clearTimeout(fillTimer); fillTimer=setTimeout(autoFill,1000); });
  /* "Draw a character" (v159, H): the drawing sheet with the pad alone, the chosen character is appended */
  $("#f-draw").onclick=()=>{ const word=$("#f-word").value; SIGN["add"]={lines:[word],orig:[word],img:null,boxes:[[]]};
    openDrawSheet("add",0,[...word].length,ch=>{ const f=$("#f-word"); if(!f||ch==null) return; f.value=f.value+ch; f.dispatchEvent(new Event("input",{bubbles:true})); },true); };
  wireTags(main,saveDraft);
  $("#f-flag").onchange=()=>{ $("#f-note").hidden=!$("#f-flag").checked; if($("#f-flag").checked) $("#f-note").focus(); saveDraft(); };
}
/* ---------- Cards: library with photos, detail, single-card test, edit ---------- */
const THUMB={};
function thumbBlob(d){ return d.img||fullPhoto(d); } /* the crop (H, v86); the whole photo only for cards without one */
function thumbURL(d){ return THUMB[d.id]||(THUMB[d.id]=URL.createObjectURL(thumbBlob(d))); }
function dropThumb(id){ if(THUMB[id]){ URL.revokeObjectURL(THUMB[id]); delete THUMB[id]; } }
function cardStatus(d){
  const p=S.progress[d.id]; if(!p) return "";
  const days=Math.round((p.due-today())/DAY);
  return `<span class="st${days<=0?" due":""}">${days<=0?t("due"):t("in {0} d",days)}</span>`;
}
/* The list keeps its place (v351): a row tap notes where the list stood, the detail's ← Cards puts it back —
   H: "going back by pressing the arrow … please be at the place where the card was and not at the top of the list". */
let LIST_SCROLL=0;
function backToList(){ S.detail=null; S.detailHide=false; S.fullPic=false; render(); const y=LIST_SCROLL; requestAnimationFrame(()=>window.scrollTo(0,y)); }
function cardsListHTML(){
  const q=S.query.trim().toLowerCase();
  let list=S.custom.slice().sort((a,b)=>(b.at||0)-(a.at||0)); /* newest first */
  const byText=new Map(); S.custom.forEach(x=>{ if(x.c) byText.set(x.c,(byText.get(x.c)||0)+1); }); /* the same text from several photos (v122) */
  /* several rows may be ticked at once (v366): a card must match one of the ticked status rows and one of the ticked tags */
  if(S.filterUnv||S.filterFlag||S.filterAi) list=list.filter(d=>(S.filterUnv&&d.mt&&!d.mt.verified)||(S.filterFlag&&d.flag)||(S.filterAi&&d.ai));
  if(S.filterTags.length) list=list.filter(d=>S.filterTags.some(g=>hasTag(d,g)));
  if(q) list=list.filter(d=>[d.c,d.trad,d.p,d.m,...Object.values(d.ms||{}),d.w,d.wp,d.wm,d.flagNote,...(d.tags||[])].filter(Boolean).join(" ").toLowerCase().includes(q));
  const pk=marking("cards"); /* marking (v351): the tap marks instead of opening; the mark sits at the right end of the row since v355 */
  const rows=list.map(d=>`<button class="crow${pk?" pick":""}${pk&&PICK.set.has(d.id)?" on":""}" data-id="${esc(d.id)}">
      ${d.img?`<span class="thumbbox"><img class="thumbbg" src="${thumbURL(d)}" alt="" aria-hidden="true" loading="lazy" decoding="async"><img class="thumb" src="${thumbURL(d)}" alt="" loading="lazy" decoding="async"></span>`:`<span class="thumb glyph">${esc([...d.c][0])}</span>`} <!-- the list's thumbnail in the front's box look: the crop fitted, a darkened blurred copy behind it (v232) -->
      <span class="ct"><span class="c">${d.c?esc((d.trad||d.c).replace(/\n/g," / ")):`<span class="lbl">${d.reading&&d.reading.failed?t("Nothing read"):t("Reading …")}</span>`}</span>${d.trad?`<span class="simpref"><span class="lbl">${t("Simplified")}</span><span class="hanzi">${esc(d.c.replace(/\n/g," / "))}</span></span>`:""}<span class="p">${esc(d.p)}</span>${(pl=>pl?`<span class="pills">${pl}</span>`:"")(`${d.trad?`<span class="pill trad">${t("Traditional")}</span>`:""}${mlPill(d)}${byText.get(d.c)>1?`<span class="pill">${nOf(byText.get(d.c),"photo")}</span>`:""}${d.c&&d.reading&&!d.reading.failed?`<span class="pill">${t("Reading …")}</span>`:""}${(d.tags||[]).map(tg=>`<span class="pill tag">${esc(tg)}</span>`).join("")}`)}<span class="m">${esc(d.m)}</span></span>
      <span class="cs">${d.ai?`<span class="pill ai">${t("AI")}</span>`:""}${d.flag?`<span class="pill flagged">${t("⚑ Review")}</span>`:""}${cardStatus(d)}</span>${pk?`<span class="tick" aria-hidden="true"></span>`:""}</button>`).join("");
  const empty=S.custom.length?t("No cards match."):t("No cards yet — take a photo under Camera, or tap + New.");
  return {html:rows||`<div class="badge" style="margin-top:20px">${empty}</div>`, n:list.length, ids:list.map(d=>d.id)};
}
function renderCards(main){
  const nAi=deck().filter(d=>d.ai).length;
  if(S.filterAi&&!nAi) S.filterAi=false; /* a filter whose chip is gone is dropped (v308, H: "I accepted two ai suggestions, and now no cards are showing up in the list anymore" — the AI chip shows only while suggestions wait, so the filter had no chip left to switch it off and the list stood empty at "0 of 131") */
  S.filterTags=S.filterTags.filter(g=>g===UNTAGGED?allTags().length&&untaggedCount():allTags().includes(g)); /* the same for a tag: the last card of a tag re-tagged, or the last untagged card tagged */
  let {html,n,ids}=cardsListHTML();
  main.innerHTML=`<div class="pane">
    <div class="cardsbar"><input id="q" type="search" placeholder="${t("Search")}" value="${esc(S.query)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button class="btn mini primary" id="newcard">${t("+ New")}</button></div>
    ${nAi?`<div class="aibar"><span>${nOf(nAi,"AI suggestion waiting","AI suggestions waiting")}</span><button class="btn mini primary" id="ai-acceptall">${t("Accept all")}</button></div>`:""}
    ${marking("cards")
      ?`<div class="chips"><span class="badge" id="pick-n">${t("{0} selected",PICK.set.size)}</span><span class="cend"><button class="del" id="pick-all"></button></span></div>` /* the chips make room for the marking (v354) */
      :`<div class="chips"><span class="chipset">${filterPillHTML("cards")}</span><span class="cend"><span class="badge" id="cnt"${n===deck().length?" hidden":""}>${t("{0} of {1}",n,deck().length)}</span></span></div>`}
    <div class="clist" id="clist">${html}</div>
  </div>`;
  const wire=()=>{ document.querySelectorAll(".crow").forEach(b=>{
    b.onclick=()=>{
      if(marking("cards")){ pickToggle(b.dataset.id); b.classList.toggle("on"); pickBar(()=>delPicked("cards")); return; } /* while marking a tap marks the row instead of opening it (v351) */
      LIST_SCROLL=window.scrollY; /* where the list stood — ← Cards comes back to it (v351) */
      S.detail=b.dataset.id; S.detailHide=false; S.fullPic=false; render(); window.scrollTo(0,0); };
    if(!marking("cards")&&S.custom.length>1) longPress(b,()=>{ PICK={kind:"cards",set:new Set([b.dataset.id])}; render(); }); /* press and hold to start marking (v354) */
  }); };
  const refresh=()=>{ const r=cardsListHTML(); ids=r.ids; $("#clist").innerHTML=r.html; const ct=$("#cnt"); if(ct){ ct.textContent=t("{0} of {1}",r.n,deck().length); ct.hidden=r.n===deck().length; } /* the count shows only while a search or a chip narrows the list (v356) */ wire(); if(marking("cards")){ pickAllBtn(ids,refresh); pickBar(()=>delPicked("cards")); } };
  $("#q").oninput=e=>{ S.query=e.target.value; refresh(); };
  wireFilterPill("cards",render);
  const aa=$("#ai-acceptall"); if(aa) aa.onclick=async()=>{ aa.disabled=true; await aiAcceptAll(); render(); };
  if(marking("cards")){ pickAllBtn(ids,refresh); pickBar(()=>delPicked("cards")); }
  $("#newcard").onclick=()=>{ endPick(); S.pendingImg=null; S.pendingFull=null; S.pendingShot=null; S.mode="add"; render(); }; /* a card from scratch starts without a picture (v188); the photo path comes in through cropOk with its own pending image */
  wire();
}
function renderCardDetail(main,c){
  const d=cardOf(c); if(!d){ S.detail=null; return renderCards(main); }
  const p=S.progress[c];
  const stat=p?t("Interval {0} d, ease {1}, {2}, next {3}.",p.interval,p.ease.toFixed(2),nOf(p.reps,"review"),new Date(p.due).toLocaleDateString(LANG_LOCALE[LANG])):t("Not studied yet.");
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">${t("← Cards")}</button><span class="badge">${!d.c?(d.reading&&d.reading.failed?t("Nothing read yet"):t("Reading …")):d.reading&&!d.reading.failed?t("Reading …"):(x=>x?x[0].toUpperCase()+x.slice(1):"")([d.mt&&!d.mt.verified?t("unverified"):"",d.mt&&d.mt.pending?t("translation pending"):"",d.mt&&d.mt.suspect?t("reading uncertain"):""].filter(Boolean).join(", "))}</span></div>
    <div class="card">${tagsHTML(d,!p)}<div class="front tap" id="d-reveal">${frontHTML(d)}</div>
      ${d.c&&d.reading&&!d.reading.failed?`<div class="hint">${t("The new frame is being read — the text follows when it is done.")}</div>`:""}${!d.c?`${d.reading&&d.reading.failed?"":`<div class="hint">${t("The text, pinyin and meaning follow when the reading is done.")}</div>`}${flagNoteHTML(d)}` /* a card still waiting for its reading has no back (v237) */
        :S.detailHide?(showHints()?`<div class="hint">${t("Tap the character to show the answer")}${fullPhoto(d)?t(", or the photo for the whole picture"):""}.</div>`:"")
        :`<div style="margin-top:22px">${backHTML(d)}</div>${flagNoteHTML(d)}${aiBoxHTML(d)}${showHints()?`<div class="hint">${t("Tap the character to hide the answer")}${fullPhoto(d)?t(", or the photo for the whole picture"):""}.</div>`:""}`}</div>
    <div class="detailacts">
      ${d.c?`<button class="btn primary" id="d-test">${t("Test this card")}</button>`:""}
      <button class="btn" id="d-edit">${t("Edit")}</button>
      <button class="btn${d.flag?" on":""}" id="d-flag">${d.flag?t("⚑ Clear flag"):t("⚑ Flag for review")}</button>
      ${d.c?`<button class="btn" id="d-share">${t("Share")}</button>`:""}
      <button class="btn danger" id="d-del"${d.c?"":' style="grid-column:1/-1"'}>${t("Delete card")}</button>
    </div>
    <div class="badge" style="margin-top:14px">${esc(stat)}</div>
  </div>`;
  $("#back").onclick=backToList;
  /* the preview behaves like the test: tap the photo for the whole picture, tap the character to hide and show the answer (H) */
  if(!S.detailHide&&d.c) warmParts();
  const rv=$("#d-reveal"); if(rv) rv.onclick=e=>{ if(e.target.closest("[data-pic]")){ S.fullPic=!S.fullPic; render(); return; } S.detailHide=!S.detailHide; render(); };
  const test=$("#d-test"); if(test) test.onclick=()=>{
    S.saved={queue:S.queue,idx:S.idx,done:S.done,ahead:S.ahead};
    S.single=c; S.queue=[c]; S.idx=0; S.revealed=false; S.mode="study"; render();
  };
  $("#d-edit").onclick=()=>{ S.editing=c; render(); };
  $("#d-flag").onclick=async()=>{ await setFlag(c,!d.flag); render(); };
  const sh=$("#d-share"); if(sh) sh.onclick=()=>shareCard(c); /* one image through the share sheet (v269) */
  wireSay(); wireChars(d); wireLinks();
  wireAi();
  const del=$("#d-del"); if(del) del.onclick=async()=>{ await delCustom(c); S.detail=null; render(); }; /* at once, with Undo (v268) */
}
function renderEdit(main,c){
  const d=cardOf(c); if(!d){ S.editing=null; S.editFrom=null; return render(); }
  const isSign=d.kind==="sign";
  let removeImg=false, aiApplied=false, aiMl=null, recropImg=null, recropRect=null, meanTouched=false, aiRun=null; /* aiRun: the form's AI request while it runs (v341) */ /* aiMl: the language of the meaning the AI filled in (v256) */ /* recropImg: the crop framed again in this form (v239), stored on Save with its frame (recropRect, v244) */
  /* the text is edited like the Read preview (H): a character strip per line, tap a character for the picker and the
     drawing sheet; SIGN carries the lines and the card's crop as the photo reference (no boxes: the whole crop) */
  const eid="edit"+(S.editSeq=(S.editSeq||0)+1), lines0=isSign?d.c.split("\n"):frontLines(d); /* plain id: it goes into selectors */
  const sg=SIGN[eid]={lines:lines0.slice(),orig:lines0.slice(),img:d.img||null,onChange:null,trad:!!d.trad,tradDetected:!!d.trad,tradText:d.trad||"",tradTouched:!!d.trad};
  if(d.trad) loadScriptTables().catch(()=>{});
  const cropURL=d.img?URL.createObjectURL(d.img):""; /* the crop itself, not the whole-photo thumbnail (H: "only the cropped image, not with context") */
  const full=fullPhoto(d), rid="recrop-"+eid; /* Crop again (v239): the whole photo, when it is still on the phone, framed anew in this form */
  const leave=newC=>{ /* back to where the edit started: study back or card detail */
    endRecrop(); delete SIGN[eid]; if(cropURL) URL.revokeObjectURL(cropURL);
    const from=S.editFrom; S.editing=null; S.editFrom=null;
    if(from==="study"){ S.mode="study"; S.revealed=true; } else if(from==="camera"){ S.mode="inbox"; S.fullPic=false; } else { S.mode="cards"; if(newC) S.detail=newC; } /* from the finished card in the Camera tab (v325): back to it */
    render();
  };
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">${t("← Back")}</button><span class="badge">${t("Edit")}</span></div>
    <div class="form">
    ${d.img||full?`<div class="field" id="e-imgfield"><label>${t("Image (stays on this phone)")}</label><div class="pimg" id="e-pimg"></div></div>`:""} <!-- the photo first, then the text, as in the Camera tab (v245) -->
    <div class="field"><div class="labelrow"><label>${d.trad?t("Characters (traditional, as on the photo)"):t("Characters")}</label>${selRowHTML(eid)}</div> <!-- Select on the label's line, for all lines at once (v272) -->
      <div class="signed" id="e-lines"></div>
      <textarea id="e-word" class="hanzi" hidden>${esc(lines0.join("\n"))}</textarea>
      </div>
      <div class="field"><label>${t("Pinyin")}</label><textarea id="e-pin" class="grow" rows="1" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">${esc(d.p)}</textarea></div>
      <div class="field"><label>${t("Meaning")}</label><textarea id="e-mean" class="grow" rows="1">${esc(d.m)}</textarea><div class="smean badge" id="e-aistatus" style="margin-top:4px"></div></div>
    ${isSign||!d.w?"":`<div class="field"><label>${t("Context word, pinyin, meaning (optional)")}</label>
      <div class="row"><input id="e-w" class="hanzi" value="${esc(d.w||"")}" placeholder="学习" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><input id="e-wp" value="${esc(d.wp||"")}" placeholder="xuéxí" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><input id="e-wm" value="${esc(d.wm||"")}" placeholder="${t("to learn")}"></div></div>`}
    <div class="field"><label class="check"><input type="checkbox" id="e-flag"${d.flag?" checked":""}> ${t("⚑ Flag for review (text, pinyin or meaning looks wrong)")}</label>
      <input id="e-note" value="${esc(d.flagNote||"")}" placeholder="${t("Note for the reviewer (optional)")}"${d.flag?"":" hidden"}></div>
    ${tagsFieldHTML("e-tags",d.tags)}
    ${aiOn()?`<div class="field" id="e-aifield"${d.mt&&d.mt.src==="llm"&&d.mt.verified?" hidden":""}><button class="btn block" id="e-ai">${t("Ask AI to check text, pinyin and meaning")}</button></div>`:""}
    <div id="e-err" class="err" style="display:none"></div>
    <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" id="e-save">${t("Save changes")}</button><button class="del" id="e-cancel">${t("Cancel")}</button></div>
    </div>
    <button class="btn danger block" id="e-del" style="margin-top:14px">${t("Delete card")}</button>
  </div>`;
  $("#back").onclick=()=>leave(); $("#e-cancel").onclick=()=>leave(); wireTags(main); /* Cancel beside Save, as the preview's row (v245) */
  $("#e-flag").onchange=()=>{ $("#e-note").hidden=!$("#e-flag").checked; if($("#e-flag").checked) $("#e-note").focus(); }; /* the note only with the flag, as in the Add form and the preview (v136) */
  /* delete from here too (H): from the study back the session goes on with the next card, otherwise back to the list */
  $("#e-del").onclick=async()=>{
    await delCustom(c); endRecrop(); delete SIGN[eid]; /* at once, with Undo (v268) */
    const from=S.editFrom; S.editing=null; S.editFrom=null;
    if(from==="study"){ S.queue=S.queue.filter(x=>x!==c); if(S.single===c) S.single=null; S.revealed=false; S.fullPic=false; S.mode="study"; }
    else if(from==="camera"){ S.mode="inbox"; S.fullPic=false; }
    else { S.mode="cards"; S.detail=null; }
    render();
  };
  /* the strip: rows like the Read preview, kept in sync with the hidden text field the save reads */
  const syncWord=()=>{ $("#e-word").value=sg.lines.join("\n"); };
  const drawLines=()=>{
    const box=$("#e-lines"); if(!box) return;
    box.innerHTML=sg.lines.map((l,k)=>slineHTML(eid,k,l,false)).join("")+`<div class="scriptline">${scriptSwitchHTML(eid,sg)}</div>`; /* no "Simplified …" reference line beside the switch (v148, H: the switch says it) */
    selRowRefresh(box,eid); /* Select sits on the Characters label's line outside this box (v272) — after a Remove it must show Select again */
    wireSlines(box,()=>{ syncWord(); pinyinFollow(); showAi(); });
    box.querySelectorAll("[data-scriptset]").forEach(b=> b.onclick=async()=>{ const on=b.dataset.scriptset==="1"; if(on===!!sg.trad) return; await setScript(sg,on); drawLines(); const lab=box.closest(".field").querySelector("label"); if(lab) lab.textContent=sg.trad?t("Characters (traditional, as on the photo)"):t("Characters"); }); /* the mark by hand (v146) */
  };
  /* pinyin follows the text unless it was edited by hand */
  let pinTouched=false; $("#e-pin").addEventListener("input",()=>{ pinTouched=true; }); $("#e-mean").addEventListener("input",()=>{ meanTouched=true; }); wireGrow(main);
  const pinyinFollow=()=>{ if(pinTouched||!window.pinyinPro) return; const txt=sg.lines.join("").replace(/\s+/g,""); if(CJK.test(txt)){ $("#e-pin").value=pinyinPro.pinyin(txt,{toneType:"symbol"}); autoGrow($("#e-pin")); } };
  /* the AI button only where it adds something: a card the AI did not verify, or a verified one whose text was changed here (H, v135) */
  const showAi=()=>{ const f=$("#e-aifield"); if(f) f.hidden=false; };
  sg.onChange=()=>{ syncWord(); drawLines(); pinyinFollow(); showAi(); const ab=$("#e-ai"); if(ab&&aiLive()) ab.click(); };
  drawLines();
  /* the AI fills the fields in place; nothing is stored until Save */
  const ab=$("#e-ai"); if(ab) ab.onclick=async()=>{
    const st=$("#e-aistatus"); ab.disabled=true;
    const zh=$("#e-word").value, pin=$("#e-pin").value.trim(), mean=$("#e-mean").value.trim(), note=$("#e-note").value.trim();
    const run=(async()=>{ /* the request as a promise the form keeps (v341): Save changes while it runs hands the answer over to the card, see the save handler */
      let [r]=await aiAsk([{kind:d.kind||"word",c:isSign?zh.split("\n").map(l=>l.trim()).filter(Boolean).join("\n"):zh.replace(/\s+/g,""),p:pin,m:mean,flagNote:note,gloss:d.gloss,mt:{src:"dict",verified:false,suspect:"please check"}}],()=>{ if(st&&st.isConnected) st.innerHTML=busyHTML(t(AI_BUSY_TEXT)); });
      if(r.bad&&(recropImg||d.img)){ const pic=await picOnBad({picBlob:recropImg||d.img,region:null},[zh]); if(pic) r={...pic,ok:true,bad:false}; } /* garbage says the text check: the card's own picture goes to the AI that takes pictures (v302) */
      return r; })();
    aiRun=run; { const clear=()=>{ if(aiRun===run) aiRun=null; }; run.then(clear,clear); } /* no derived promise that could reject unhandled */
    try{
      const r=await run; if(!ab.isConnected) return; /* the form is gone — Save changes took the card, and the answer lands there (v341) */
      if(!r.bad){
        if(r.zh&&CJK.test(r.zh)){ const zh=r.zh.replace(/\r/g,""); sg.lines=(isSign?zh:recutLines(zh.replace(/\s+/g,""),sg.lines)).split("\n").map(l=>l.trim()).filter(Boolean); sg.orig=sg.lines.slice(); syncWord(); drawLines(); }
        if(r.p){ $("#e-pin").value=r.p; autoGrow($("#e-pin")); }
        if(r.m){ $("#e-mean").value=r.m; autoGrow($("#e-mean")); aiMl=r.ml||"en"; meanTouched=false; } /* the fields grow with the answer — a filled value fires no input event (v281, H's two-line brand meaning cut off) */
        aiApplied=true; st.textContent=""; } /* a good answer shows nothing, the fields just fill — as in the Read preview (H, v105; the green "AI: looks right" box went in v245) */
      else st.textContent=t("The AI says this text looks misread. Fix the characters, or crop the photo again."); /* until v301 a garbage verdict left the form as it was, without a word (H: "doesn't work anymore?") */
    }catch(err){ if(!ab.isConnected) return; const m=err&&err.message||String(err); st.textContent=m===AI_NET_ERR?t(m)+t(". Tap the button to try again."):t("The AI check failed: {0}",m); }
    ab.disabled=false;
  };
  /* ---------- the image field: the crop, Remove image, and Crop again (v239, H: "allow to re-crop a photo in edit mode",
     described first and built on "Go"): the whole photo opens in place of the crop with the Camera tab's frame layer —
     the photo is a record outside the inbox (SHOTS_EXTRA), so cropBlob, the preview, the reading and the picture path
     run unchanged; the reading's result lands in the strip, pinyin and meaning through onRead, Image only takes the
     new crop alone through onImage, Cancel keeps the old crop; Save changes stores the new crop ---------- */
  let recropURL=null;
  const showPimg=()=>{ const box=$("#e-pimg"); if(!box) return;
    if(recropURL){ URL.revokeObjectURL(recropURL); recropURL=null; }
    const url=recropImg?(recropURL=URL.createObjectURL(recropImg)):cropURL;
    box.innerHTML=`${url?`<img src="${url}" alt="">`:""}<div class="imgacts">${full?`<button class="del" id="e-recrop">${t("Crop again")}</button>`:""}${url?`<button class="del" id="e-noimg">${t("Remove image")}</button>`:""}</div>`;
    const ni=$("#e-noimg"); if(ni) ni.onclick=()=>{ removeImg=true; $("#e-imgfield").remove(); };
    const rc=$("#e-recrop"); if(rc) rc.onclick=startRecrop; };
  const drawRecrop=()=>{ const box=$("#e-pimg"), rec=SHOTS_EXTRA[rid]; if(!box||!rec||!CROP||CROP.id!==rid) return;
    const zoomed=!!(CROP.rect&&CROP.zoom);
    box.innerHTML=`<div class="recrop"><div class="shotwrap">
        ${zoomed?`<div class="shotzoom" style="${zoomStyle(rec)}" role="img" aria-label="the framed area"></div>`:`<img src="${shotURL(rec)}" alt="photo">`}
        <div class="croplayer${CROP.rect?" framed":""}${zoomed?" zoomed":""}" data-id="${rid}">${zoomed?"":`<div class="croprect${READING[rid]&&!READ_FAIL.test(READING[rid])?" working":""}"${cropRectStyle()}>${READING[rid]&&!READ_FAIL.test(READING[rid])?`<div class="work" aria-hidden="true"><svg><rect/></svg></div>`:""}<div class="h tl"></div><div class="h tr"></div><div class="h bl"></div><div class="h br"></div><div class="h rot" title="${t("Turn the frame")}"></div></div>`}</div>
      </div>
      <div class="imgacts"><button class="del" id="e-cropcancel">${t("Cancel")}</button></div>
      <div class="ocr" id="ocr-${rid}">${READING[rid]?readingHTML(READING[rid],rid):res&&res.key===rectKey(CROP.rect)?`<div class="croppreview"><img src="${res.url}" alt="the new crop"><div class="badge" style="margin:6px 0 0">${res.text?t("Read as “{0}”. ",esc(res.text)):t("Picture taken, the text stays. ")}${t("Adjust the frame to read again, or save.")}</div></div>`:CROP.locating?busyHTML(t("Finding the frame …")):CROP.auto?busyHTML(t("Finding the text …")):`<span class="badge">${t("Draw a frame with your finger over the text — corners resize it, dragging inside moves it, the round handle turns it.")}</span>`}</div></div>`;
    box.querySelectorAll(".croplayer").forEach(wireCrop);
    box.onclick=e=>{ const b=e.target.closest("[data-savenow]"); if(b){ b.disabled=true; const sv=$("#e-save"); if(sv) sv.click(); } }; /* Save now beside the bar (v341, H: "allow cropping an image in edit mode and saving it before the AI finishes, same as when taking a photo"): the same hand-off as Save changes — the button sits in the reading box, which every status re-renders */
    $("#e-cropcancel").onclick=()=>{ restoreBefore(); endRecrop(); showPimg(); }; };
  /* the reading's result stays under the photo with the frame (v244, H: "don't exit crop mode so fast, do as in the initial crop screen") — the view goes on Save changes or Cancel */
  let res=null, before=null;
  const setResult=(img,text)=>{ if(res&&res.url) URL.revokeObjectURL(res.url); recropImg=img; recropRect={...CROP.rect}; res={key:rectKey(CROP.rect),text,url:URL.createObjectURL(img)}; if(RECROP[rid]) RECROP[rid].stage="idle"; drawRecrop(); };
  const restoreBefore=()=>{ if(!before) return; Object.assign(sg,before.sg); recropImg=null; recropRect=null; /* Cancel: the text, pinyin and meaning from before Crop again */
    $("#e-pin").value=before.pin; $("#e-mean").value=before.mean; autoGrow($("#e-pin")); autoGrow($("#e-mean")); const lab=$("#e-lines").closest(".field").querySelector("label"); if(lab) lab.textContent=before.label; syncWord(); drawLines(); };
  const endRecrop=()=>{ if(PENDING[rid]) return; /* handed over to the background (Save changes during the reading, v241): the reading goes on and fills the card */
    abandonReading(rid); if(CROP&&CROP.id===rid) CROP=null; delete RECROP[rid]; if(res&&res.url) URL.revokeObjectURL(res.url); res=null; before=null; win=null;
    if(SHOTS_EXTRA[rid]){ delete SHOTS_EXTRA[rid]; if(IMGURL[rid]){ URL.revokeObjectURL(IMGURL[rid]); delete IMGURL[rid]; } } };
  /* ---------- a small frame opens enlarged (v247, H's vocabulary sheet: the found frame was a sixth of the photo, "so small and hard
     to see and handle"; option 1 of three, "OK, 1"): when the frame is under WIN_MAX of the photo's width, the photo record shows a
     window cut around it — a plain sub-rectangle of the photo at its own pixels, PNG, so the reader's cut stays one JPEG generation —,
     the frame is laid into the window's coordinates and everything else (corners, the reading, the preview, the picture path) runs
     on the window as on a photo; a tap outside the frame switches to the whole photo and back, the frame following. Every frame
     that leaves the form (the card's frame, the hand-off's reading rect) is mapped back to the whole photo, so Save, resume and
     Crop again later see photo fractions and photo pixels as before. ---------- */
  let win=null, PW=0, PH=0; /* the window as fractions of the photo {x,y,w,h}, or null while the whole photo shows; PW/PH the photo's pixel size */
  const WIN_MAX=0.45, WIN_ROOM=2, WIN_ROOM_H=1.3;
  const windowFor=f=>{ if(!(f.w<WIN_MAX)) return null; const k=Math.min(1,Math.max(0.3,f.w*WIN_ROOM,f.h*WIN_ROOM_H)); if(k>=0.95) return null;
    const cx=f.x+f.w/2, cy=f.y+f.h/2, x=Math.min(1-k,Math.max(0,cx-k/2)), y=Math.min(1-k,Math.max(0,cy-k/2)); return {x:+x.toFixed(4),y:+y.toFixed(4),w:k,h:k}; }; /* the same fraction of width and height: the window keeps the photo's shape, so the layer and the frame's angle are unchanged */
  const toPhoto=f=>win?{x:win.x+f.x*win.w,y:win.y+f.y*win.h,w:f.w*win.w,h:f.h*win.h,a:f.a||0}:f;
  const toWin=(f,w)=>w?{x:(f.x-w.x)/w.w,y:(f.y-w.y)/w.h,w:f.w/w.w,h:f.h/w.h,a:f.a||0}:f;
  const round4=f=>({x:+f.x.toFixed(4),y:+f.y.toFixed(4),w:+f.w.toFixed(4),h:+f.h.toFixed(4),a:+(f.a||0).toFixed(1)});
  const photoFrame=rect=>round4(toPhoto(frameOf(rect))); /* a layer rect → the card's frame, as fractions of the whole photo */
  const photoRect=rect=>{ const f=toPhoto(frameOf(rect)); return {x:f.x*PW,y:f.y*PH,w:f.w*PW,h:f.h*PH,a:f.a||0,lw:PW,lh:PH}; }; /* a layer rect → a rect on the whole photo's pixels, for the background reading */
  const setRecBlob=b=>{ const rec=SHOTS_EXTRA[rid]; if(!rec) return; rec.blob=b; if(IMGURL[rid]){ URL.revokeObjectURL(IMGURL[rid]); delete IMGURL[rid]; } };
  const cutWindow=async w=>{ const bmp=await createImageBitmap(full); PW=bmp.width; PH=bmp.height;
    const X=Math.round(w.x*PW), Y=Math.round(w.y*PH), W=Math.max(1,Math.round(w.w*PW)), H=Math.max(1,Math.round(w.h*PH));
    const cv=document.createElement("canvas"); cv.width=W; cv.height=H; cv.getContext("2d").drawImage(bmp,X,Y,W,H,0,0,W,H); bmp.close();
    return new Promise(r=>cv.toBlob(r,"image/png")); };
  const enterWindow=async f=>{ const w=windowFor(f); if(!w) return f; const b=await cutWindow(w); if(!b||!RECROP[rid]) return f; win=w; setRecBlob(b); return toWin(f,w); }; /* the photo frame → the window's; the record shows the window from here */
  const leaveWindow=f=>{ const pf=toPhoto(f); win=null; setRecBlob(full); return pf; };
  const openFrame=async f=>{ const g=await enterWindow(f); if(!RECROP[rid]) return; CROP={id:rid,rect:null}; drawRecrop(); placeFrame(rid,g,{noRead:true,win:win?"in":""}); };
  const onZoom=async()=>{ if(!CROP||CROP.id!==rid||!CROP.rect||RECROP[rid]._zooming) return; RECROP[rid]._zooming=true;
    try{ const f=frameOf(CROP.rect), keep=res&&res.key===rectKey(CROP.rect); let g;
      if(win) g=leaveWindow(f); else { g=await enterWindow(f); if(g===f) return; } /* the whole photo → a window around the frame as it stands now; a frame grown past WIN_MAX stays whole */
      if(!CROP||CROP.id!==rid) return; const stage=RECROP[rid].stage; CROP.rect=null; drawRecrop(); await placeFrame(rid,g,{silent:true}); if(!CROP||CROP.id!==rid||!CROP.rect) return;
      if(keep){ res.key=rectKey(CROP.rect); recropRect={...CROP.rect}; drawRecrop(); } /* the result under the photo stays with the frame */
      else if(READING[rid]||stage==="reading") drawRecrop(); /* the reading runs on and lands on the frame where it now is */
      else showCropPreview(rid,{noRead:true,win:win?"in":"out"}); }
    finally{ if(RECROP[rid]) delete RECROP[rid]._zooming; } };
  const startRecrop=()=>{ if(!full) return;
    SHOTS_EXTRA[rid]={id:rid,blob:full,ts:Date.now()};
    before={sg:{lines:sg.lines.slice(),orig:sg.orig.slice(),conf:sg.conf,boxes:sg.boxes,img:sg.img,alts:sg.alts,trad:sg.trad,tradDetected:sg.tradDetected,tradText:sg.tradText,tradTouched:sg.tradTouched,tradUser:sg.tradUser,ai:sg.ai,sel:null},
      pin:$("#e-pin").value,mean:$("#e-mean").value,label:$("#e-lines").closest(".field").querySelector("label").textContent};
    RECROP[rid]={redraw:drawRecrop,stage:"idle",end:()=>{ endRecrop(); },onZoom,
      onImage:blob=>setResult(blob,""),
      onRead:sg2=>{ if(!sg2) return;
        sg.lines=sg2.lines.slice(); sg.orig=sg2.orig.slice(); sg.conf=sg2.conf; sg.boxes=sg2.boxes; sg.img=sg2.img; sg.alts=sg2.alts;
        sg.trad=!!sg2.trad; sg.tradDetected=!!sg2.tradDetected||!!sg.tradDetected; sg.tradText=sg2.tradText||""; sg.tradTouched=false; sg.tradUser=false; sg.sel=null; delete sg.ai;
        setResult(sg2.cardImg||recropImg,sg.lines.join(" / ")); /* the tightened cut when there is one, else the crop as framed; the frame stays on the photo */
        const lab=$("#e-lines").closest(".field").querySelector("label"); if(lab) lab.textContent="Characters"+(sg.trad?" (traditional, as on the photo)":"");
        syncWord(); drawLines(); pinyinFollow();
        if(!meanTouched){ const r2=sg.lines.filter(l=>CJK.test(l)).map(lineMeaning), m=r2.map(r=>r.en).filter(Boolean).join(" / "); if(m){ $("#e-mean").value=m; autoGrow($("#e-mean")); $("#e-aistatus").textContent=`Meaning ${r2.length&&r2.every(r=>r.full)?"from the phrasebook":"composed word by word"}, unverified`; } } /* the word-by-word gloss with its source line until the AI answers, as in the Read preview (v245); a meaning typed here stays */
        showAi(); const ab=$("#e-ai"); if(ab&&aiLive()) ab.click(); } };
    /* the frame the card was cut with, without a reading until it is moved (v244, H: "use the previous cropping area as starting point");
       a card from before v244 has no frame stored — its crop is looked for in the photo (findFrame, v246) and the frame kept on the card;
       only when nothing is found does the app propose one (v241) */
    if(d.frame&&d.frame.w){ CROP={id:rid,rect:null}; drawRecrop(); openFrame(d.frame); }
    else if(d.img&&!removeImg){ CROP={id:rid,rect:null,locating:true}; drawRecrop();
      findFrame(full,d.img).then(async f=>{ if(!CROP||CROP.id!==rid||!CROP.locating) return; delete CROP.locating;
        if(f){ d.frame=f; try{ await idbPut("custom",d); }catch(e){} openFrame(f); }
        else { CROP.auto=true; drawRecrop(); proposeFrame(rid); } }); }
    else { CROP={id:rid,rect:null,auto:true}; drawRecrop(); proposeFrame(rid); } };
  showPimg();
  if(S.editOpenFrame){ S.editOpenFrame=false; if(full&&!removeImg) startRecrop(); } /* Edit from the finished card (v325): the photo with the frame the card was cut with, ready to adjust */
  $("#e-save").onclick=async()=>{
    const fail=m=>{ const e=$("#e-err"); e.textContent=m; e.style.display=""; };
    let pin=$("#e-pin").value.replace(/\s+/g," ").trim(); const mean=$("#e-mean").value.replace(/\s+/g," ").trim();
    /* a save before the analysis is done (v341, H: "allow cropping an image in edit mode and saving it before the AI finishes, same as when taking a photo" — "what finally counts is the newly analysed hanzi, pinyin and meaning"): a reading still due or running for the standing frame is handed over as before (v241), and the form's own AI request, when it is still running, hands its answer over too — the fields as they stand are placeholders, the analysis replaces them */
    const willHand=!removeImg&&RECROP[rid]&&CROP&&CROP.id===rid&&CROP.rect&&RECROP[rid].stage!=="idle", aiLate=!aiApplied&&aiRun?aiRun:null;
    if((!pin||!mean)&&!willHand&&!aiLate) return fail(t("Pinyin and meaning are required."));
    /* the Chinese text itself may be corrected (OCR slip) — progress and images move with it */
    let newC=d.c;
    const we=$("#e-word");
    if(we){
      var wordLines=we.value.split("\n").map(l=>l.replace(/\s+/g,"")).filter(l=>CJK.test(l));
      newC=isSign?wordLines.join("\n"):wordLines.join("");
      if(!CJK.test(newC)){ if(willHand||aiLate){ newC=d.c; wordLines=undefined; } else return fail(t("Please enter Chinese text.")); } /* an empty card saved early keeps its text until the analysis fills it */
    }
    const upd={...d, p:pin, m:mean}; delete upd.ex; delete upd.exp; delete upd.exm; /* example sentences were dropped in v41 */
    if(!isSign&&$("#e-w")){ upd.w=$("#e-w").value.trim(); upd.wp=$("#e-wp").value.trim(); upd.wm=$("#e-wm").value.trim();
      if(!upd.w){ delete upd.w; delete upd.wp; delete upd.wm; } } /* the context fields show only on cards that have one */
    /* Save changes while the new frame is still being read (v241, H: "allow instant saving"): the card takes the new crop now, the
       reading goes on in the background and fills text, pinyin and meaning when done — like Save now in the Camera tab */
    let handoff=null;
    if(willHand){ const rect={...CROP.rect}; const r=await cropBlob(rid,rect); if(r) handoff={rect,blob:r.blob}; } /* a reading still due or running for this frame (v244: an untouched or already read frame saves without one) */
    if(removeImg){ delete upd.img; delete upd.imgFull; delete upd.shot; delete upd.frame; dropThumb(c); } /* shot too — without it the front would still show the inbox photo through fullPhoto (v214) */
    else if(handoff){ const win=await windowCut(rid,handoff.rect); upd.img=await cardJpeg(win?win.blob:handoff.blob); upd.frame=photoFrame(handoff.rect); dropThumb(c); } /* the 16:9 window around the frame (v329) */
    else if(recropImg){ const win=recropRect?await windowCut(rid,recropRect):null; upd.img=await cardJpeg(win?win.blob:recropImg); if(recropRect) upd.frame=photoFrame(recropRect); dropThumb(c); } /* the crop framed again in this form (v239) with its frame (v244), as fractions of the whole photo even when framed in the window (v247) */
    if(upd.mt){ upd.mt={...upd.mt, verified:true, pending:false}; delete upd.mt.suspect; } /* a human edited it */
    if(aiApplied) upd.mt={...(upd.mt||{}), src:"llm", verified:true, pending:false};
    else if(aiLate){ upd.mt={...(upd.mt||{}), src:"dict", verified:false, pending:false}; delete upd.mt.suspect; } /* unverified until the running AI check answers (v341); its failure marks the card pending for the next auto run */
    if(aiMl&&!meanTouched) setMl(upd,aiMl); else if(meanTouched||mean!==d.m) setMl(upd,LANG); /* a meaning typed here is in the app's language, one the AI filled in carries its own; an untouched meaning keeps its language (v256) */
    const tags=parseTags($("#e-tags").value); if(tags.length) upd.tags=tags; else delete upd.tags;
    if($("#e-flag").checked){ upd.flag=true; const note=$("#e-note").value.trim(); if(note) upd.flagNote=note; else delete upd.flagNote; }
    else { delete upd.flag; delete upd.flagNote; }
    if(sg.trad){ const trad=(sg.tradText||"").trim(); if(trad) upd.trad=trad; else delete upd.trad; } else delete upd.trad; /* the strip's line carries the traditional form; no separate field (H, v110); the link drops the mark (v146) */
    await applyCardUpdate(c,upd,newC,pin!==d.p,isSign?undefined:wordLines);
    if(handoff){ const rect=win?photoRect(handoff.rect):handoff.rect; if(win) leaveWindow(frameOf(handoff.rect)); /* the reading rect on the whole photo's pixels, and the record back to the whole photo, so the reading, resume and the fill see the photo (v247) */
      const d2=cardOf(c); if(d2){ d2.reading={rect,at:Date.now(),edit:true}; try{ await idbPut("custom",d2); }catch(e){} } /* edit: saved early from Crop again — flagged only when the reading is doubtful (v342) */
      delete RECROP[rid]; PENDING[rid]=c; CROP=null; /* the form's hooks go, the photo record stays for the reading */
      clearTimeout(READ_TIMER[rid]); if(!READING[rid]) cropSign(rid,{rect}); }
    if(aiLate&&!handoff){ const lines0=sg.lines.slice(); /* the AI's answer lands on the card when it comes (v341): text, pinyin and meaning as the form would have taken them, the card verified by the AI; a failed call leaves the card pending for the auto run */
      aiLate.then(async r=>{ const d2=cardOf(c); if(!d2) return;
        if(!r||r.bad){ d2.mt={...(d2.mt||{}),verified:false,pending:true}; try{ await idbPut("custom",d2); }catch(e){} aiAutoSoon(); return; }
        const upd2={...d2}; let newC2=d2.c, lines2;
        if(r.zh&&CJK.test(r.zh)){ const zh=r.zh.replace(/\r/g,""); lines2=(isSign?zh:recutLines(zh.replace(/\s+/g,""),lines0)).split("\n").map(l=>l.trim()).filter(Boolean); newC2=isSign?lines2.join("\n"):lines2.join(""); }
        if(r.p) upd2.p=r.p; if(r.m){ upd2.m=r.m; setMl(upd2,r.ml||"en"); }
        upd2.mt={...(upd2.mt||{}),src:"llm",verified:true,pending:false}; delete upd2.mt.suspect;
        await applyCardUpdate(c,upd2,newC2,!!r.p,isSign?undefined:lines2);
        if(S.mode==="cards"&&!S.editing) render(); else renderShots(); },
      async()=>{ const d2=cardOf(c); if(!d2) return; d2.mt={...(d2.mt||{}),verified:false,pending:true}; try{ await idbPut("custom",d2); }catch(e){} aiAutoSoon(); }); }
    leave(c);
  };
}
/* persist an edited card; when the Chinese text changes (OCR slip), recompute
   pinyin/segmentation/gloss (unless pinyin was set by hand). The id stays, so
   progress, thumbnail and queue entries need no move (v118). */
async function applyCardUpdate(id,upd,newC,pinByHand,lines){
  { const d0=cardOf(id); if(d0&&d0.reading&&newC&&newC.trim()&&newC.trim()!==(d0.c||"").trim()){ delete d0.reading; delete upd.reading; const k=Object.keys(PENDING).find(k=>PENDING[k]===id); if(k){ delete PENDING[k]; abandonReading(k); dropExtraShot(k); } } } /* H typed another text: the background reading is not needed (v237); an edit that keeps the text lets a re-crop's reading finish (v243) */
  const isSign=upd.kind==="sign", c=upd.c;
  if(newC && newC!==c){
    upd.c=newC; if(upd.m) upd.ms={[mlOf(upd)]:upd.m}; else delete upd.ms; /* another text: the other languages' meanings described the old one (v265) */
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
  if(!CJK.test(word)) return fail(t("Please enter a Chinese word."));
  if(!pin||!mean) return fail(t("Pinyin and meaning are required."));
  if(deck().some(d=>d.c===word&&(!S.pendingShot||d.shot===S.pendingShot))) return fail(t("“{0}” is already in the deck.",word)); /* with a new photo the same text is a new card (v118) */
  const card={id:cardId(word),c:word,p:pin,m:mean,t:"Custom",at:Date.now()};
  const ai=S.draft&&S.draft.ai; if(ai&&ai.c===word&&(!ai.p||ai.p===pin)&&(!ai.m||ai.m===mean)){ card.mt={src:"llm",verified:true,pending:false}; if(ai.m) setMl(card,ai.ml); } /* filled in by the AI and left as it was (v159); the meaning's language with it (v256) */
  else if($("#f-pinhint").style.display!=="none") card.mt={src:"dict",verified:false,pending:true}; /* filled in from the dictionary: the AI completes it when it can */
  else setMl(card,LANG); /* typed by hand: the app's language */
  const tags=parseTags($("#f-tags").value); if(tags.length) card.tags=tags;
  if($("#f-flag").checked){ card.flag=true; const note=$("#f-note").value.trim(); if(note) card.flagNote=note; }
  if(S.pendingShot){ card.shot=S.pendingShot; S.pendingShot=null; }
  const chosenImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  if(chosenImg){ card.img=await cardJpeg(chosenImg); }
  S.pendingImg=null; S.pendingFull=null;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false);
  ["f-word","f-pin","f-mean","f-note","f-tags"].forEach(id=>$("#"+id).value=""); $("#f-flag").checked=false; $("#f-note").hidden=true;
  const fi=$("#f-imgfield"); if(fi) fi.remove();
  $("#f-pinhint").style.display="none";
  S.draft=null;
  ok.textContent=t("“{0}” added.",word); ok.style.display="";
  bump("byHand"); setStats();
}
/* Share a card (v269, idea 5 of the improvement list): one image — the crop in the front's box with the blurred fill behind it,
   the characters as on the front (the traditional form when the card has one, the photo's lines), pinyin, meaning and the app's
   name — drawn on a canvas at 1080 px, always in the light look, and handed to the share sheet as a PNG (Android shares images;
   nothing is written to the phone, hard constraint 6). Without a share sheet the notice says so. */
const SHARE_W=1080, SHARE_PAD=72;
function wrapText(ctx,text,maxW){
  const out=[]; for(const para of String(text).split("\n")){ let line="";
    const push=w=>{ if(!line){ line=w; return; } const tryL=line+(/^[\u3000-\u9fff]/.test(w)&&/[\u3000-\u9fff]$/.test(line)?"":" ")+w; if(ctx.measureText(tryL).width<=maxW) line=tryL; else { out.push(line); line=w; } };
    for(const w of para.split(" ")){ if(ctx.measureText(w).width<=maxW) push(w); else for(const ch of [...w]) push(ch); } /* a word wider than the line (a Japanese meaning) breaks by character */
    out.push(line); }
  return out;
}
async function cardImage(d){
  const cv=document.createElement("canvas"), ctx=cv.getContext("2d"), inner=SHARE_W-2*SHARE_PAD;
  const hanzi=getComputedStyle(document.documentElement).getPropertyValue("--hanzi")||"serif", sans=getComputedStyle(document.documentElement).getPropertyValue("--sans")||"sans-serif";
  const lines=(d.trad||(d.kind==="sign"?d.c:frontLines(d).join("\n"))).split("\n").filter(Boolean);
  let fs=200; ctx.font=`${fs}px ${hanzi}`; const widest=Math.max(...lines.map(l=>ctx.measureText(l).width));
  if(widest>inner) fs=Math.max(56,Math.floor(fs*inner/widest));
  const lineH=Math.round(fs*1.2), textH=lines.length*lineH;
  ctx.font=`600 56px ${sans}`; const pin=d.p?wrapText(ctx,d.p,inner):[];
  ctx.font=`52px ${sans}`; const mean=d.m?wrapText(ctx,d.m,inner):[];
  const bmp=d.img?await createImageBitmap(d.img):null, picH=bmp?Math.round(inner*9/16):0;
  const H=SHARE_PAD+(bmp?picH+56:0)+textH+(pin.length?24+pin.length*72:0)+(mean.length?16+mean.length*68:0)+56+40+SHARE_PAD;
  cv.width=SHARE_W; cv.height=H;
  ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,0,SHARE_W,H);
  let y=SHARE_PAD;
  if(bmp){ /* the front's photo box: the crop fitted on the grey surface, a blurred copy behind it in the photo's colours (v224–v234) */
    const rr=(x,y2,w,h,r)=>{ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y2,w,h,r); else ctx.rect(x,y2,w,h); }; /* an old WebKit without roundRect gets square corners */
    ctx.save(); rr(SHARE_PAD,y,inner,picH,36); ctx.clip();
    ctx.fillStyle="#F2F2F7"; ctx.fillRect(SHARE_PAD,y,inner,picH);
    if("filter" in ctx){ /* Safari's canvas has no filter — there the crop sits on the plain grey, an unblurred copy behind it would look wrong */
      const cover=Math.max(inner/bmp.width,picH/bmp.height)*1.2, cw=bmp.width*cover, ch=bmp.height*cover;
      ctx.filter="blur(60px) saturate(55%) brightness(85%)"; ctx.globalAlpha=.55; ctx.drawImage(bmp,SHARE_PAD+(inner-cw)/2,y+(picH-ch)/2,cw,ch); ctx.filter="none"; ctx.globalAlpha=1;
    }
    const fit=Math.min(inner/bmp.width,picH/bmp.height), fw=bmp.width*fit, fh=bmp.height*fit;
    ctx.drawImage(bmp,SHARE_PAD+(inner-fw)/2,y+(picH-fh)/2,fw,fh); ctx.restore();
    ctx.strokeStyle="rgba(60,60,67,.29)"; ctx.lineWidth=2; rr(SHARE_PAD+1,y+1,inner-2,picH-2,35); ctx.stroke();
    bmp.close(); y+=picH+56;
  }
  ctx.textAlign="center"; ctx.textBaseline="alphabetic"; ctx.fillStyle="#000000"; ctx.font=`${fs}px ${hanzi}`;
  for(const l of lines){ ctx.fillText(l,SHARE_W/2,y+Math.round(fs*0.92)); y+=lineH; }
  if(pin.length){ y+=24; ctx.fillStyle="#C8372D"; ctx.font=`600 56px ${sans}`; for(const l of pin){ ctx.fillText(l,SHARE_W/2,y+54); y+=72; } }
  if(mean.length){ y+=16; ctx.fillStyle="#000000"; ctx.font=`52px ${sans}`; for(const l of mean){ ctx.fillText(l,SHARE_W/2,y+50); y+=68; } }
  y+=56; ctx.fillStyle="#AEAEB2"; ctx.font=`34px ${sans}`; ctx.fillText("识字 Zeichentrainer",SHARE_W/2,y+32);
  return new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error("no image")),"image/png"));
}
async function shareCard(id){
  const d=cardOf(id); if(!d||!d.c) return;
  let blob; try{ blob=await cardImage(d); }catch(err){ logErr("share",err); noteSheet(t("Sharing is not available here.")); return; }
  const file=new File([blob],"zeichentrainer-card.png",{type:"image/png"});
  const text=[d.trad||d.c,d.p,d.m].filter(Boolean).join(" — ").replace(/\n/g," / ");
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:d.c.replace(/\n/g," / "),text}); return; }
    catch(err){ if(err && err.name==="AbortError") return; logErr("share",err); }
  }
  noteSheet(t("Sharing is not available here."));
}
async function delCustom(id){
  bump("deleted");
  const idx=S.custom.findIndex(x=>x.id===id), d=idx>=0?S.custom[idx]:null, prog=S.progress[id];
  S.custom=S.custom.filter(x=>x.id!==id);
  try{ await idbDel("custom",id); await idbDel("progress",id); }catch(e){}
  delete S.progress[id]; dropThumb(id);
  setStats();
  if(d) showUndo({kind:"card",d,prog,idx});
}
/* Undo after Delete (v268, idea 3 of the improvement list — a card or photo deleted by mistake was gone): the card's Delete
   and the inbox's Delete act at once, no sheet, and a line above the tab bar says "Deleted “学”" with Undo for UNDO_MS;
   a second deletion meanwhile joins it ("Deleted 2 cards"), Undo puts everything back — the card with its progress row at
   its old place, the photo into the inbox (the copy keepPhoto made onto its cards goes again) — and the line goes when the
   time is up. Photos → Delete N and Reset keep their sheet. */
const UNDO_MS=5000; let UNDO=null;
function undoText(){
  const cards=UNDO.items.filter(i=>i.kind==="card"), photos=UNDO.items.filter(i=>i.kind==="photo");
  if(cards.length&&photos.length) return t("Deleted {0} and {1}",nOf(cards.length,"card"),nOf(photos.length,"photo"));
  if(cards.length===1) return cards[0].d.c?t("Deleted “{0}”",cards[0].d.c.replace(/\n/g," / ")):t("Card deleted");
  if(cards.length) return t("Deleted {0}",nOf(cards.length,"card"));
  if(photos.length===1) return t("Photo deleted");
  return t("Deleted {0}",nOf(photos.length,"photo"));
}
function showUndo(item){
  if(!UNDO) UNDO={items:[],timer:null};
  UNDO.items.push(item); clearTimeout(UNDO.timer); UNDO.timer=setTimeout(hideUndo,UNDO_MS);
  let el=$("#undo");
  if(!el){ el=document.createElement("div"); el.className="undo"; el.id="undo"; el.setAttribute("role","status"); el.innerHTML=`<span class="t"></span><button id="undo-btn">${t("Undo")}</button>`; el.querySelector("#undo-btn").onclick=undoDelete; document.body.appendChild(el); }
  el.querySelector(".t").textContent=undoText();
}
function hideUndo(){ if(UNDO) clearTimeout(UNDO.timer); UNDO=null; const el=$("#undo"); if(el) el.remove(); }
/* Marking many cards or photos and deleting them together (v351, H: "implement a function to batch mark and delete cards
   and photos" — described first, "Go"): Select on the Cards list and in the inbox head puts the screen into marking, a tap
   on a row marks it instead of opening it, All marks everything the list shows (the filter and the search decide what that
   is), and a bar above the tab bar carries "Delete N" and Done. The deletion runs through the same delCustom / delShot as a
   single one, so the Undo line of v268 says "Deleted 12 cards" and five seconds put everything back. */
let PICK=null; /* {kind:"cards"|"shots", set:Set of ids} while marking */
const marking=k=>!!(PICK&&PICK.kind===k);
function endPick(){ PICK=null; const el=$("#pickbar"); if(el) el.remove(); }
function pickToggle(id){ if(PICK) PICK.set.has(id)?PICK.set.delete(id):PICK.set.add(id); }
/* A long press starts the marking (v354, H's screenshot of the cramped chip row: "Der card selection mode sieht kaese aus.
   Ist zu eng. Wie waer's mit longpress auf karte enters selection mode?"): the Select button is gone from the Cards chip row
   and from the inbox head — press and hold a card or a photo for half a second instead, and it is marked. A press that
   turns into a scroll or a drag cancels; the click that follows the press is not a tap (LP_AT), so the row does not toggle
   itself off again. */
const LP_MS=500, LP_MOVE=10, LP_EAT=250;
function longPress(el,fn){
  let tm=null,px=0,py=0;
  const stop=()=>{ if(tm) clearTimeout(tm); tm=null; };
  el.addEventListener("pointerdown",e=>{ if(e.button) return; px=e.clientX; py=e.clientY; stop();
    tm=setTimeout(()=>{ tm=null;
      const eat=ev=>{ ev.stopPropagation(); ev.preventDefault(); }; /* the click that ends the press is not a tap — it would toggle the row straight off again */
      document.addEventListener("click",eat,true); setTimeout(()=>document.removeEventListener("click",eat,true),LP_EAT);
      try{ navigator.vibrate&&navigator.vibrate(12); }catch(_){}
      fn(); },LP_MS); });
  el.addEventListener("pointermove",e=>{ if(tm&&Math.hypot(e.clientX-px,e.clientY-py)>LP_MOVE) stop(); });
  ["pointerup","pointercancel","pointerleave"].forEach(k=>el.addEventListener(k,stop));
}
function pickBar(onDelete){
  let el=$("#pickbar");
  if(!PICK){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement("div"); el.className="undo pickbar"; el.id="pickbar"; el.setAttribute("role","status");
    el.innerHTML=`<button id="pick-del"></button><span class="sp"></span><button id="pick-done"></button>`;
    el.querySelector("#pick-done").onclick=()=>{ endPick(); render(); }; document.body.appendChild(el); }
  el.querySelector("#pick-done").textContent=t("Done");
  const n=PICK.set.size, del=el.querySelector("#pick-del");
  del.textContent=t("Delete {0}",n); del.disabled=!n; del.onclick=onDelete;
  const pn=$("#pick-n"); if(pn) pn.textContent=t("{0} selected",n); /* the line that replaces the chips (v354) */
}
function pickAllBtn(ids,redraw){ /* All marks everything the screen shows, None clears it */
  const b=$("#pick-all"); if(!b||!PICK) return;
  const all=ids.length&&ids.every(id=>PICK.set.has(id));
  b.textContent=all?t("None"):t("All");
  b.onclick=()=>{ ids.forEach(id=>all?PICK.set.delete(id):PICK.set.add(id)); redraw(); };
}
async function delPicked(kind){
  if(!PICK) return; const ids=[...PICK.set]; endPick();
  for(const id of ids){ if(kind==="cards") await delCustom(id); else await delShot(id,true); } /* each one shows its Undo item, so the line reads "Deleted 12 cards" */
  render();
}
async function undoDelete(){
  if(!UNDO) return; const items=UNDO.items; hideUndo();
  for(const it of items){
    if(it.kind==="card"){
      const d=it.d; if(S.custom.some(x=>x.id===d.id)) continue;
      S.custom.splice(Math.min(it.idx,S.custom.length),0,d); try{ await idbPut("custom",d); }catch(e){}
      if(it.prog){ S.progress[d.id]=it.prog; try{ await idbPut("progress",{id:d.id,...it.prog}); }catch(e){} }
      bump("deleted",-1);
      if(S.mode==="study"&&!S.queue.includes(d.id)&&d.c){ S.queue.splice(S.idx,0,d.id); S.revealed=false; S.fullPic=false; } /* deleted from the study back: the card comes next again */
    } else {
      const rec=it.rec; if(S.inbox.some(x=>x.id===rec.id)) continue;
      S.inbox.splice(Math.min(it.idx,S.inbox.length),0,rec); try{ await idbPut("inbox",rec); }catch(e){}
      for(const d of S.custom) if(d.shot===rec.id&&d.imgFull){ delete d.imgFull; try{ await idbPut("custom",d); }catch(e){} } /* the photo is stored once again (v214) */
    }
  }
  setStats(); render();
}

/* ---------- OCR (Tesseract.js + pinyin-pro + CC-CEDICT, fully local from ./vendor — no CDN) ---------- */
let _ocrWorker=null, _ocrLoading=null;
/* The reader's files when no worker controls the page (v335, H's phone with "SW no" and no VPN: "Now he really loads forever!"
   — the page fetched every reader file straight from github.io, which answers with nothing behind the wall, and Tesseract's
   load never settled). The worker's origin-then-mirror rule (v189) is the worker's; a page without one asks github.io once for a
   small file with ORIGIN_WAIT, takes the mirror for every reader file when it is silent, serves what it fetched before from the
   reader's cache and puts new files there for the worker to serve later, and hands Tesseract the worker and the core as blob
   URLs; the language file is fetched by Tesseract itself from the base that answered (this build's initialize step cannot take
   the data directly). Every file is read chunk by chunk, so a load that moves no byte for READER_STALL fails the reading
   instead of standing for good. */
const VENDOR={base:null,probe:null,paths:null,note:""}, ORIGIN_WAIT=6000; let READER_STALL=90000; /* a let, so the harness shortens it */
const VENDOR_TYPES={js:"text/javascript; charset=utf-8",wasm:"application/wasm",gz:"application/gzip",txt:"text/plain; charset=utf-8"};
const vendorType=name=>VENDOR_TYPES[name.split(".").pop()]||"application/octet-stream";
const originVendor=()=>new URL("./vendor/",location.href).href;
const swControls=()=>!!(navigator.serviceWorker&&navigator.serviceWorker.controller);
function fetchWithin(url,ms,opts){ const ac=new AbortController(), tm=setTimeout(()=>ac.abort(),ms); return fetch(url,{...opts,signal:ac.signal}).finally(()=>clearTimeout(tm)); }
async function vendorBase(){
  if(swControls()) return originVendor(); /* the worker decides between the origin and the mirror (v189) */
  if(VENDOR.base) return VENDOR.base;
  if(!VENDOR.probe) VENDOR.probe=(async()=>{
    let ok=false; try{ const r=await fetchWithin(originVendor()+"t2s.txt",ORIGIN_WAIT,{cache:"no-store"}); ok=r.ok; }catch(e){}
    VENDOR.base=ok?originVendor():mirrorURL()+"vendor/";
    if(!ok){ VENDOR.note="no worker controls the page and github.io did not answer within "+Math.round(ORIGIN_WAIT/1000)+" s — the reader's files come from the mirror"; logErr("vendor",VENDOR.note); }
    return VENDOR.base;
  })().catch(err=>{ VENDOR.probe=null; throw err; });
  return VENDOR.probe;
}
/* a reader file for the page's own use: through the worker when it controls the page, else the reader's cache, then the base
   the probe chose; a file fetched past the worker is put into the cache under its own address, so the worker serves it later */
async function vendorFetch(name){
  const url=originVendor()+name; let r=null, put=false;
  if(swControls()) r=await fetch(url);
  else{
    try{ r=await caches.match(url); }catch(e){}
    if(!r){ const base=await vendorBase(); r=await fetch(base+name,{cache:"no-store"}); put=true; }
  }
  if(!r.ok) throw new Error(name+" not available ("+r.status+")");
  const chunks=[], rd=r.body&&r.body.getReader();
  if(rd){ for(;;){ const {done,value}=await rd.read(); if(done) break; chunks.push(value); readerTick(); } } else chunks.push(await r.arrayBuffer());
  const res=new Response(new Blob(chunks),{headers:{"Content-Type":r.headers.get("Content-Type")||vendorType(name)}});
  if(put){ try{ const c=await caches.open("zt-ocr-v1"); await c.put(new Request(url),res.clone()); }catch(e){} }
  return res;
}
/* a load that moves no byte and reports no step for READER_STALL is a stalled connection, not a slow one */
const STALL=new Set(); function readerTick(){ for(const f of STALL) f(); }
function withStall(p,ms,what){ return new Promise((res,rej)=>{ let tm; const arm=()=>{ clearTimeout(tm); tm=setTimeout(()=>{ STALL.delete(arm); rej(new Error(what)); },ms); }; STALL.add(arm); arm(); p.then(v=>{ clearTimeout(tm); STALL.delete(arm); res(v); },e=>{ clearTimeout(tm); STALL.delete(arm); rej(e); }); }); }
const STALL_TEXT=()=>"the reader did not load within "+Math.round(READER_STALL/1000)+" s — no answer from github.io or the mirror";
async function loadScript(src){
  if(src.startsWith("./vendor/")){ const r=await vendorFetch(src.slice(9)); src=URL.createObjectURL(await r.blob()); } /* v335: through vendorFetch, so the mirror and the stall rule hold for scripts too */
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
      let r=await vendorFetch("cedict.tsv.gz").catch(err=>{ if(!swControls()) throw err; return {ok:false,status:err.message}; });
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
      status("Loading the reader … (one-time ~12 MB, works offline afterwards)");
      await withStall((async()=>{ if(!window.Tesseract) await loadScript("./vendor/tesseract.min.js"); if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js"); })(),READER_STALL,STALL_TEXT());
      await loadDict().catch(()=>{}); /* meanings are optional — OCR works without */
      /* paths derived from the page URL at runtime — stays relative to the subpath */
      const w=await makeWorker("chi_sim");
      _ocrWorker=w; return w;
    })().catch(err=>{ _ocrLoading=null; throw err; });
  }
  return _ocrLoading;
}
/* Several readers at once (v209, H: "wherever possible try to improve speed"): the passes of a reading are independent, so
   the second look and the whole-frame fallback hand them to a pool of simplified readers — the first worker plus up to two
   more, made on first need, one fewer than the phone's cores and only one on a phone with 3 GB or less (each worker holds
   the model in memory); the results are kept in the jobs' order, so the competition sees the same passes as before.
   The traditional reader stays a single worker. Measured in headless Chromium: a reading with 19–31 passes in roughly
   half the wall time. */
let _pool=null, _poolLoading=null;
function poolSize(){ const c=navigator.hardwareConcurrency||2, m=navigator.deviceMemory||4; return m<=3?1:Math.max(1,Math.min(m>=8?4:3,c-1)); } /* four readers on a phone with 8 GB or more (v236; three before — each holds the model, ~100 MB); the sandbox has four cores and stays at three */
async function ocrPool(status){
  if(_pool) return _pool;
  if(!_poolLoading) _poolLoading=(async()=>{ const w0=await ocrWorker(status); const n=poolSize();
    const extra=n>1?await Promise.all(Array.from({length:n-1},()=>makeWorker("chi_sim").catch(()=>null))):[]; _pool=[w0,...extra.filter(Boolean)]; return _pool; })().catch(err=>{ _poolLoading=null; throw err; });
  return _poolLoading;
}
/* jobs: async (worker) => result; every free worker takes the next job, the results come back in the jobs' order */
async function runPasses(jobs,status){
  const pool=await ocrPool(status), out=new Array(jobs.length); let i=0;
  await Promise.all(pool.map(async w=>{ while(i<jobs.length){ const j=i++; out[j]=await jobs[j](w); } }));
  return out;
}
/* the worker's, the core's and the language files' addresses: the origin's while the worker controls the page; else the
   worker and the core as blob URLs from vendorFetch (the core's must end in "js" for Tesseract, hence the fragment) and the
   language files from the base the probe chose (v335) */
function tessPaths(){
  if(swControls()){ const base=originVendor(); return Promise.resolve({workerPath:base+"worker.min.js",corePath:base+"tesseract-core-simd-lstm.wasm.js",langPath:base.replace(/\/$/,"")}); }
  if(!VENDOR.paths) VENDOR.paths=(async()=>{
    const [w,c]=await Promise.all([vendorFetch("worker.min.js"),vendorFetch("tesseract-core-simd-lstm.wasm.js")]), base=await vendorBase();
    return {workerPath:URL.createObjectURL(await w.blob()),corePath:URL.createObjectURL(await c.blob())+"#core.js",langPath:base.replace(/\/$/,"")};
  })().catch(err=>{ VENDOR.paths=null; throw err; });
  return VENDOR.paths;
}
function makeWorker(lang){
  return withStall(tessPaths().then(paths=>Tesseract.createWorker(lang,1,{
    ...paths,
    cacheMethod:"none", /* SW cache covers offline; tesseract's IndexedDB cache is a known corruption source */
    logger:m=>{ readerTick(); if(m.status==="recognizing text"&&_ocrLog) _ocrLog(Math.round(m.progress*100)); } /* one job at a time, whichever worker: the running job's handler */
  })),READER_STALL,STALL_TEXT());
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
    const [a,b]=await Promise.all([vendorFetch("t2s.txt").then(r=>r.text()),vendorFetch("s2t.txt").then(r=>r.text())]);
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
const PENDING={}; /* shot id → the id of a card saved before its reading finished (v237, "Save now"): the reading fills it in when done */
const PLACED={}, READ_APP={}; /* v304, for a card saved with Save now: PLACED = the frame the reader or the AI placed on the text while the card waited (the card takes it as its frame and its crop), READ_APP = the reading started from the app's own frame, not the hand's (only such a frame may be moved) */
const frameOf=r=>({x:+(r.x/r.lw).toFixed(4),y:+(r.y/r.lh).toFixed(4),w:+(r.w/r.lw).toFixed(4),h:+(r.h/r.lh).toFixed(4),a:+(r.a||0).toFixed(1)}); /* the frame a card was cut with, as fractions of the photo (card.frame, v244) — Crop again starts from it */
/* The card's picture is a 16:9 window around the text (v329, H: "does the 16:9 format make sense?" — measured on 21 photos: one-line signs run 2.3–6.8:1, posters and plates 0.9–1.6:1, so the tight crop filled the photo box's height or width only half and the rest was the blurred fill; "Go" on the window): the same centre as the frame, the frame's own angle, widened to FRAME_RATIO in the direction it lacks, never smaller than the frame, shifted to stay inside the photo and clamped to the photo's size — the text keeps its size and place in the box, the surroundings fill the rest. The card's frame stays the text's frame (Crop again starts from it); only the picture is the window. */
function windowRect(r){ const {lw,lh}=r, a=r.a||0; let w=r.w, h=r.h;
  if(w/h<FRAME_RATIO) w=h*FRAME_RATIO; else h=w/FRAME_RATIO;
  w=Math.max(r.w,Math.min(w,lw)); h=Math.max(r.h,Math.min(h,lh));
  let x=r.x+r.w/2-w/2, y=r.y+r.h/2-h/2;
  if(!a){ x=Math.min(Math.max(0,x),Math.max(0,lw-w)); y=Math.min(Math.max(0,y),Math.max(0,lh-h)); }
  else { const ft=fitTurned({x,y,w,h},a,lw,lh,{u0:-r.w/2,u1:r.w/2,v0:-r.h/2,v1:r.h/2}); if(ft){ ({x,y,w,h}=ft); } } /* a turned window keeps its centre and gives up the widening that would leave the photo, never the frame itself (v333; in v329–v332 what lay outside took the area's colour through cropBlob, v185 — a wedge of fill beside a poster at 18°); a frame that sticks out itself stays as it is */
  return {x,y,w,h,a,lw,lh}; }
async function windowCut(id,rect){ if(!rect||!rect.lw||!shotRec(id)) return null; try{ return await cropBlob(id,windowRect(rect)); }catch(e){ return null; } } /* the window's cut, or null when the photo is gone */
const rectKey=r=>r?[r.x,r.y,r.w,r.h,r.a||0].map(v=>Math.round(v)).join(","):""; /* the same frame, give or take a pixel */
async function placeFrame(id,f,opts){ /* a stored frame onto the photo's layer, then the preview — without the automatic reading when asked (v244) */
  const layer=document.querySelector(`.croplayer[data-id="${id}"]`), img=layer&&layer.parentElement.querySelector("img"); if(!layer) return;
  if(img&&!img.complete) await new Promise(r=>{ img.onload=r; img.onerror=r; });
  if(!CROP||CROP.id!==id||CROP.rect) return; const r=layer.getBoundingClientRect(); if(!r.width||!r.height) return;
  CROP.rect={x:f.x*r.width,y:f.y*r.height,w:f.w*r.width,h:f.h*r.height,a:f.a||0,lw:r.width,lh:r.height};
  renderShots(); if(!(opts&&opts.silent)) showCropPreview(id,opts); /* silent: the frame alone, the caller draws the box (the window toggle, v247) */
}
/* where an old card's crop sits in its photo (v246, H on Crop again: "does not work as specified" — every card saved before v244
   carries no frame, so Crop again proposed a fresh one instead of the previous cropping area): the crop is a cut of the photo
   at the photo's own pixels, so a grey copy of both at ≤ 240 px is searched for the position with the smallest mean
   difference — coarse grid first, then the pixels around the best; a turned frame's cut is not a plain sub-image and finds
   nothing, as does a crop from another photo; null then, and the app's proposal takes over. About 100 ms. */
async function findFrame(fullBlob,cropBlob){
  let F=null,C=null;
  try{
    [F,C]=await Promise.all([createImageBitmap(fullBlob),createImageBitmap(cropBlob)]);
    if(C.width>F.width+2||C.height>F.height+2) return null;
    const k=Math.min(1,240/Math.max(F.width,F.height));
    const fw=Math.max(1,Math.round(F.width*k)), fh=Math.max(1,Math.round(F.height*k)), cw=Math.min(fw,Math.max(1,Math.round(C.width*k))), ch=Math.min(fh,Math.max(1,Math.round(C.height*k)));
    if(cw<4||ch<4) return null;
    const grey=(bmp,w,h)=>{ const cv=document.createElement("canvas"); cv.width=w; cv.height=h; const g=cv.getContext("2d",{alpha:false}); g.drawImage(bmp,0,0,w,h); const d=g.getImageData(0,0,w,h).data, o=new Float32Array(w*h); for(let i=0;i<w*h;i++) o[i]=d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114; return o; };
    const P=grey(F,fw,fh), T=grey(C,cw,ch), step=Math.max(1,Math.floor(Math.min(cw,ch)/20));
    const sad=(x,y,st)=>{ let sum=0,m=0; for(let j=0;j<ch;j+=st){ const pr=(y+j)*fw+x, tr=j*cw; for(let i=0;i<cw;i+=st){ sum+=Math.abs(P[pr+i]-T[tr+i]); m++; } } return sum/m; };
    let best=Infinity,bx=0,by=0;
    for(let y=0;y<=fh-ch;y+=step) for(let x=0;x<=fw-cw;x+=step){ const v=sad(x,y,step); if(v<best){ best=v; bx=x; by=y; } }
    for(let y=Math.max(0,by-step);y<=Math.min(fh-ch,by+step);y++) for(let x=Math.max(0,bx-step);x<=Math.min(fw-cw,bx+step);x++){ const v=sad(x,y,1); if(v<best){ best=v; bx=x; by=y; } }
    READLOG.push({t:Date.now(),pre:true,text:`the old crop ${best<=22?"found":"not found"} in the photo (difference ${best.toFixed(1)})`}); while(READLOG.length>40) READLOG.shift();
    if(best>22) return null; /* the same pixels through two JPEG passes differ by a few grey levels; another place by dozens */
    return {x:+(bx/fw).toFixed(4),y:+(by/fh).toFixed(4),w:+(cw/fw).toFixed(4),h:+(ch/fh).toFixed(4),a:0};
  }catch(e){ return null; } finally{ if(F) F.close(); if(C) C.close(); }
}
const abandonReading=id=>{ clearTimeout(READ_TIMER[id]); READ_RUN[id]=(READ_RUN[id]||0)+1; delete SIGN[id]; delete READING[id]; delete PLACED[id]; delete SPLIT[id]; }; /* a running reading of this photo abandons at its next step instead of delivering a result (v117); the inbox's Cancel, the Edit form's Crop again and an edit over a pending reading share it (v243) */
const SHOTS_EXTRA={}, RECROP={}; /* the Edit form's Crop again (v239): the card's whole photo as a photo record outside the inbox (SHOTS_EXTRA[id]={id,blob,ts}), and the form's hooks — redraw (the frame view in place of renderShots), onRead (the reading's result), onImage (Image only), end */
const shotRec=id=>S.inbox.find(s=>s.id===id)||SHOTS_EXTRA[id]||null;
const QSNOTE={}, QSCARD={}, READING={}, AUTO={}, SPLIT={}, QSMORE={}; /* SPLIT[id]: one frame per element when the AI called the photo a user interface (v357–v358) · QSMORE[id]: the cards after the first, for the photo's row */ /* AUTO[id]: the photo became a card by itself (v325) — the row shows the shimmer while it reads and the finished card after */ /* READING[id]: status text while the photo is being read · QSCARD[id] = card saved from this shot (AI suggestion shows under the photo) · QSNOTE[id] = the note under the photo after saving */
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
/* ---------- Cropping (crop → OCR or card image) ---------- */
let CROP=null; /* {id, rect:{x,y,w,h,lw,lh,a}, auto, proposed, hidden, followed, zoom, locating} while cropping — stays until the card is saved (H, v50); a = the frame's angle (v185), auto/proposed = the frame proposed by the app (v203, cleared by the hand's first gesture), hidden = that proposal is read but not drawn until the reader has found the text (v288), followed = the frame was placed on the text the reader found (v287/v288), zoom = the framed area enlarged (v169), locating = the Edit form looking for an old card's crop in the photo (v246) */
function cropRectStyle(){
  const r=CROP&&!CROP.hidden&&CROP.rect; if(!r||!r.lw||!r.lh) return "";
  const pc=v=>(v*100).toFixed(2)+"%";
  return ` style="display:block;left:${pc(r.x/r.lw)};top:${pc(r.y/r.lh)};width:${pc(r.w/r.lw)};height:${pc(r.h/r.lh)}${r.a?`;transform:rotate(${r.a.toFixed(1)}deg)`:""}"`;
}
/* the frame can be turned (v185, H: "enable rotating the crop rectangle"): CROP.rect.a is the angle in degrees around the
   frame's centre; a round handle above the top edge turns it, the corners and the inside work in the frame's own turned
   coordinates, and the cut is the frame's content drawn upright — the reader and the card get the upright cut */
const rotPt=(x,y,cx,cy,deg)=>{ const r=deg*Math.PI/180, c=Math.cos(r), s=Math.sin(r), dx=x-cx, dy=y-cy; return [cx+dx*c-dy*s, cy+dx*s+dy*c]; };
const ROT_HANDLE=34; /* the handle's distance above the top edge, in layer pixels */
/* the framed area alone, enlarged to the box's width (v169, H: "toggle between full image display and only cropped area
   display by tipping with a finger outside the cropped area"): CROP.zoom, a tap outside the frame switches, a tap on
   the enlarged view switches back, a swipe still scrolls; the frame's handles are hidden while enlarged */
function zoomStyle(s){
  const r=CROP.rect, m=0.04; if(!r||!r.lw||!r.lh) return "";
  if(r.a&&_prevURL) return `aspect-ratio:${r.w.toFixed(1)}/${r.h.toFixed(1)};background-image:url(${_prevURL});background-size:100% 100%`; /* a turned frame: the upright cut itself */
  const x0=Math.max(0,(r.x-m*r.w)/r.lw), y0=Math.max(0,(r.y-m*r.h)/r.lh), x1=Math.min(1,(r.x+r.w*(1+m))/r.lw), y1=Math.min(1,(r.y+r.h*(1+m))/r.lh);
  const fw=Math.max(0.01,x1-x0), fh=Math.max(0.01,y1-y0);
  const pos=(f,fw)=>fw>=1?0:f/(1-fw)*100;
  return `aspect-ratio:${(fw*r.lw).toFixed(1)}/${(fh*r.lh).toFixed(1)};background-image:url(${shotURL(s)});background-size:${(100/fw).toFixed(2)}% ${(100/fh).toFixed(2)}%;background-position:${pos(x0,fw).toFixed(2)}% ${pos(y0,fh).toFixed(2)}%`;
}
function wireCrop(layer){
  const rect=layer.querySelector(".croprect");
  /* a short tap without movement toggles the enlarged view; a swipe is left to the page. The tap is taken from the
     click event (v206, H: the tap did nothing on an iPhone — until v205 it was read from pointerup with a distance and
     time check, and on a layer that lets the page scroll iOS Safari turns the touch into a scroll gesture and sends
     pointercancel, so no pointerup ever came; a click is the platform's own "tap, not a scroll", on every browser).
     The press position is kept so that a mouse drag outside the frame, which also ends in a click, does not toggle;
     a frame gesture (draw, resize, move, turn) marks the layer so its closing click is ignored. */
  let press=null; /* {x,y,t} of the last press outside the frame */
  const tapOrScroll=e=>{ press={x:e.clientX,y:e.clientY,t:Date.now()}; };
  layer.onclick=e=>{ if(layer._gesture){ layer._gesture=false; return; } const p=press; press=null; if(!p||!CROP||!CROP.rect||CROP.hidden) return;
    if(Math.hypot(e.clientX-p.x,e.clientY-p.y)<8&&Date.now()-p.t<600){ const rc=RECROP[CROP.id]; if(rc&&rc.onZoom) rc.onZoom(); else { CROP.zoom=!CROP.zoom; renderShots(); } } }; /* the Edit form's Crop again with a window: whole photo ↔ the enlarged part (v247) */
  layer.onpointerdown=e=>{
    if(layer.classList.contains("zoomed")){ tapOrScroll(e); return; }
    const r=layer.getBoundingClientRect();
    const wx=e.clientX-r.left, wy=e.clientY-r.top;
    let hiddenTake=CROP.hidden?"wait":null; /* the app is still looking for the text (v288): a stroke takes over and frames by hand, a tap changes nothing */
    const cur=hiddenTake?null:CROP.rect, a0=cur&&cur.a||0, c0=cur?[cur.x+cur.w/2,cur.y+cur.h/2]:[0,0];
    /* the pointer in the frame's own turned coordinates (around the centre it had at the press) */
    const toLocal=(x,y)=>a0?rotPt(x,y,c0[0],c0[1],-a0):[x,y];
    const [px,py]=toLocal(wx,wy);
    const setRect=(x,y,w,h,a)=>{
      a=a||0;
      if(a&&mode!=="move"&&mode!=="rotate"){ /* a rect resized in the old centre's turned system: shift it so that turning it around its own centre lands on the same spot */
        const c1=[x+w/2,y+h/2], [rx,ry]=rotPt(c1[0],c1[1],c0[0],c0[1],a); x+=rx-c1[0]; y+=ry-c1[1]; }
      Object.assign(rect.style,{left:x+"px",top:y+"px",width:w+"px",height:h+"px",display:"block",transform:a?`rotate(${a.toFixed(1)}deg)`:""});
      CROP.rect={x,y,w,h,a,lw:r.width,lh:r.height};
    };
    /* four modes: the round handle above the frame -> turn it, grab a corner -> resize (opposite corner anchored),
       press inside the frame -> move it, anywhere else -> draw a new frame */
    let mode="draw", anchor=[px,py], grab=null, mw=0, mh=0;
    if(cur){
      const hp=[cur.x+cur.w/2,cur.y-ROT_HANDLE];
      if(Math.hypot(px-hp[0],py-hp[1])<=22) mode="rotate";
      const corners={tl:[cur.x,cur.y],tr:[cur.x+cur.w,cur.y],bl:[cur.x,cur.y+cur.h],br:[cur.x+cur.w,cur.y+cur.h]};
      if(mode==="draw") for(const k of ["tl","tr","bl","br"]){
        if(Math.hypot(px-corners[k][0],py-corners[k][1])<=22){
          mode="resize"; anchor=corners[{tl:"br",tr:"bl",bl:"tr",br:"tl"}[k]]; break;
        }
      }
      if(mode==="draw" && px>=cur.x&&px<=cur.x+cur.w&&py>=cur.y&&py<=cur.y+cur.h){
        mode="move"; grab=[wx-cur.x,wy-cur.y]; mw=cur.w; mh=cur.h;
      }
    }
    if(mode==="draw"&&cur){ tapOrScroll(e); return; } /* a frame exists: no new frame — the swipe scrolls the page instead (`.croplayer.framed`, v131/v132), a tap enlarges the framed area (v169); adjusting the frame is allowed and re-reads, Cancel removes it (H, v129–v132) */
    e.preventDefault(); layer._gesture=true; /* the click that closes this gesture is not a tap */
    delete CROP.proposed; delete CROP.followed; /* the frame is the hand's from now on: the reading never moves it (v287) */
    clearTimeout(READ_TIMER[layer.dataset.id]); /* adjusting the frame — read after the next release */
    if(mode==="draw"&&!hiddenTake) setRect(px,py,0,0);
    layer.setPointerCapture(e.pointerId);
    layer.onpointermove=ev=>{
      const X=Math.min(Math.max(ev.clientX-r.left,0),r.width);
      const Y=Math.min(Math.max(ev.clientY-r.top,0),r.height);
      if(hiddenTake==="wait"){ if(Math.hypot(X-px,Y-py)<8) return; hiddenTake="taken"; delete CROP.hidden; delete CROP.proposed; abandonReading(layer.dataset.id); layer.classList.add("framed"); setRect(px,py,0,0); } /* the hand frames it: the search and its reading stop */
      if(mode==="rotate"){ /* the raw pointer, not the clamped one: the finger may leave the photo while turning */
        let a=Math.atan2(ev.clientY-r.top-c0[1],ev.clientX-r.left-c0[0])*180/Math.PI+90; if(a>180) a-=360; if(Math.abs(a)<1.5) a=0; /* the handle sits straight above the centre at 0° */
        setRect(cur.x,cur.y,cur.w,cur.h,a);
      }else if(mode==="move"){
        setRect(Math.min(Math.max(X-grab[0],0),r.width-mw),
                Math.min(Math.max(Y-grab[1],0),r.height-mh), mw, mh, a0);
      }else{
        const [x,y]=toLocal(X,Y);
        setRect(Math.min(anchor[0],x),Math.min(anchor[1],y),Math.abs(x-anchor[0]),Math.abs(y-anchor[1]),a0);
      }
    };
    layer.onpointerup=()=>{
      layer.onpointermove=null; layer.onpointerup=null;
      if(hiddenTake==="wait") return; /* a tap while the app looks for the text: nothing happens, the search goes on (v288) */
      layer.classList.add("framed"); /* from now on strokes outside the frame scroll the page (v132) */
      abandonReading(layer.dataset.id); /* the frame changed: the old reading and its editor go at once (v286, H's SF Express card — the AI answer of the first reading re-drew the old editor during the 1.2 s wait, and Save stored the old picture and text under the new frame) */
      showCropPreview(layer.dataset.id); /* starts the automatic read */
    };
  };
}
/* after the frame is released: show the area, then read it automatically — no tap needed;
   a corner drag within that moment restarts the wait */
const READ_TIMER={}, READ_WAIT=1200;
let _prevURL=null;
async function showCropPreview(id,opts){
  const box=$("#ocr-"+id); if(!box) return; const noRead=!!(opts&&opts.noRead);
  let r=null; try{ r=await cropBlob(id); }catch(err){ box.innerHTML=`<span class="badge">${t("Reading failed: {0}",esc(err&&err.message||err))}</span>`; logErr("crop",err&&(err.stack||err.message)||err); return; }
  if(!r){ box.innerHTML=`<span class="badge">${t("Frame too small — draw again.")}</span>`; return; }
  if(_prevURL) URL.revokeObjectURL(_prevURL);
  _prevURL=URL.createObjectURL(r.blob);
  box.innerHTML=`<div class="croppreview">
    <img src="${_prevURL}" alt="selected area">
    <div class="badge" style="margin:6px 0 8px">${noRead?t("The frame the card was cut with — adjust it to read again.")+(opts.win==="in"?t(" Tap outside the frame for the whole photo."):opts.win==="out"?t(" Tap outside the frame to enlarge it again."):""):t("Reading in a moment — drag a corner first if the frame is off.")}</div>
    <div class="cropacts">
      <button class="del" data-cropread="${id}">${t("Read now")}</button>
      <button class="del" data-cropok="${id}">${t("Image only")}</button>
    </div></div>`;
  box.querySelector("[data-cropread]").onclick=()=>{ clearTimeout(READ_TIMER[id]); cropSign(id); };
  box.querySelector("[data-cropok]").onclick=()=>{ clearTimeout(READ_TIMER[id]); cropOk(id); };
  clearTimeout(READ_TIMER[id]); if(RECROP[id]) RECROP[id].stage=noRead?"idle":"waiting";
  if(!noRead) READ_TIMER[id]=setTimeout(()=>{ if(CROP&&CROP.id===id&&CROP.rect) cropSign(id); },READ_WAIT);
}
/* ---------- the proposed frame (v203, H's poster photo that needed no framing: "do an automatic image analysis and
   suggest a crop, which the user can change if needed — or apply no crop at all") ----------
   A photo that opens by itself (taken, the first from the album, shared) gets its frame drawn by the app: `textRegion`
   takes the ink of a small chromaticity copy, the rows that look like text (the inkHeight rule, four stroke edges),
   the first and last of them, the columns holding ink inside that band, padded by one text height — and the whole
   photo when nothing stands out or the text fills it (H's "no crop at all"). Then the usual wait and the reading. The
   frame is adjustable like a drawn one; the Crop button never proposes, so Cancel, then Crop, gives the empty layer
   to draw on as before. On the phone only, no upload: about 100 ms on a 360 px copy. */
function textRegion(bmp){
  const k=Math.min(1,360/Math.max(bmp.width,bmp.height)), cv=chromaCanvas(bmp,k), W=cv.width, Hh=cv.height, d=cv.getContext("2d").getImageData(0,0,W,Hh).data;
  const on=(x,y)=>d[(y*W+x)*4]<128;
  const rows=[]; for(let y=0;y<Hh;y++){ let ink=0,edges=0,prev=false; for(let x=0;x<W;x++){ const o=on(x,y); if(o) ink++; if(o!==prev){ edges++; prev=o; } } rows.push(ink/W>0.02&&ink/W<0.7&&edges>=4); }
  let y0=-1,y1=-1,run=0; const heights=[];
  for(let y=0;y<=Hh;y++){ if(y<Hh&&rows[y]) run++; else { if(run>=3){ if(y0<0) y0=y-run; y1=y; heights.push(run); } run=0; } }
  if(y0<0) return null;
  const lineH=median(heights), need=Math.max(2,0.03*(y1-y0));
  let x0=-1,x1=-1; run=0;
  for(let x=0;x<=W;x++){ let ink=0; if(x<W) for(let y=y0;y<y1;y++) if(on(x,y)) ink++; if(x<W&&ink>=need) run++; else { if(run>=3){ if(x0<0) x0=x-run; x1=x; } run=0; } }
  if(x0<0) return null;
  const pad=Math.max(lineH,0.03*Math.max(W,Hh));
  return {x:Math.max(0,x0-pad)/W, y:Math.max(0,y0-pad)/Hh, x1:Math.min(W,x1+pad)/W, y1:Math.min(Hh,y1+pad)/Hh, lineH:lineH/k};
}
/* the proposed frame's shape (v207, H: "propose a certain aspect ratio that fits for most images — uniformity across image
   previews"): the padded text box is widened, never narrowed, to FRAME_RATIO 16:9 — the Cards list's 124×70 thumbnails —
   centred on the text and kept inside the photo; a text the photo cannot hold at that shape keeps its own box */
const FRAME_RATIO=16/9;
const FIRST_MAX=1000; /* the quick look that places the frame reads a copy of at most this many pixels on the long side (v290) */
const FRAME_ROOM=0.3; /* the placed frame's room around the text, in text heights (v293 — a third; until v292 one at the ends and half above and below, then widened to 16:9) */
const PLACE_CF=95, PLACE_MIN=3; /* the reader may place the frame only from a reading this sure (v319, H: "Is the close look approach the right one at all?" — the reader's garbage reads at 79–88 % (the faces of 邪不压正 at 86 %, the wave lines of the Nongfu Spring logo as 还一二 at 86 %, the ice-cream cone as one character at 88 %), real text at 95–99 % in the quick look (绿友书一 97, 手作冰淇淋 97); a dictionary word inside the garbage — 一二, 品语 — was letting it place the frame, so the dictionary path of v296 and its v318 patch went) */
function textLike(lines){ const sure=lines.flatMap(l=>(l.cf||[]).filter(c=>c>=SURE_BOX)); return sure.length>=PLACE_MIN&&sure.reduce((a,c)=>a+c,0)/sure.length>=PLACE_CF; } /* a declaration, so the harness can stand it down (as effScore) */ /* a reading the frame may follow (v296, H's 邪不压正 poster: the faces read as 品语失色全了 at 86 % and the quick look framed them — "jetzt macht er gesichtserkennung!?!??"): at least three characters read with confidence, at 95 % on average (v319; v296–v318: half the characters in dictionary words, or 95 % on average — a lone 有 has no word and the red test sign keeps its ink-row proposal either way; 90 was tried first and let the credits under 邪不压正, read as 册 | 二 | 国有证 with the sure characters at 90.25 %, place the frame on them) */
const PLACE_H=0.4; /* fine print does not place the frame (v320, H's yoghurt pack 水果多多, 2026-09-08: the quick look read the small print under the title — 免豆水果制品和酸奶块口感, 即食添加量30丰富 — at 95 %, real text, and framed the whole photo around it, while the title was read only by the close look, at 1.5 × the ink height, and could no longer move the frame — "jetzt nimmt er wieder so gut wie alles mit rein"): the frame's ink height tells how tall the main text is (the small print measured 0.29 of it, real readings 0.4–2.5 — the sizeFitOf range), so lines under this share of it are left out of the placement, by the quick look and the close look alike; when nothing is left, nothing is placed and the close look or the AI decides */
function rectOfLines(bmp,lines){ /* the frame around these lines, in the straightened frame's pixels: the confident boxes give the lines and their height, the snap the characters' true extent (v322), the image the line ends when the snap finds nothing (the quick look's rule since v290, shared with the reading's best pass since v321); null when nothing is confident */
  const boxes=frameBoxes(lines), Hb=boxes.length?median(boxes.map(b=>b.y1-b.y0)):0; if(!(Hb>0)) return null;
  const bx={x0:Math.min(...boxes.map(b=>b.x0)),y0:Math.min(...boxes.map(b=>b.y0)),x1:Math.max(...boxes.map(b=>b.x1)),y1:Math.max(...boxes.map(b=>b.y1))};
  /* the reader's boxes are a rough place too (v322, H's Nongfu Spring bottle at v321 — the frame from 8 to 100 % across, the bottle icons beside 泉 inside it: "Sehr gut! Aber jetzt bitte noch mittig"): the walk along the image's ink (textRowExtent) ran through the ® and the icons, whose gaps are under its 1.3 text heights, to the photo's edge. The snap that trims the AI's box (v297) knows the characters — blobs of a character's size, a lost last character joined sideways, the width budget by the line's character count, the icons a text height away left out —, so it trims the reader's boxes the same way; the walk stays as the fallback when the snap finds nothing */
  const cnt=l=>[...(l.t||"")].filter(c=>CJK.test(c)).length, use=lines.some(l=>cnt(l)>=3)?lines.filter(l=>cnt(l)>=2):lines; /* the lines the boxes came from (frameBoxes' rule: a lone character beside a real line is left out), so the snap's text height is theirs */
  let box=null; try{ const lens=use.map(cnt).filter(n=>n>0); box=snapBox(bmp,bx,Math.max(1,use.length),lens.length?lens:[1]); }catch(e){ box=null; logErr("snap",e&&e.message||String(e)); }
  if(box){ const H=(box.y1-box.y0)/Math.max(1,use.length); return {x0:Math.max(0,box.x0-H*FRAME_ROOM),y0:Math.max(0,box.y0-H*FRAME_ROOM),x1:Math.min(bmp.width,box.x1+H*FRAME_ROOM),y1:Math.min(bmp.height,box.y1+H*FRAME_ROOM)}; }
  const y0=Math.max(0,bx.y0-Hb/2), y1=Math.min(bmp.height,bx.y1+Hb/2);
  const ext=textRowExtent(bmp,bx.x0,bx.x1,y0,y1,Hb);
  return {x0:Math.max(0,ext.x0-Hb*FRAME_ROOM),y0:Math.max(0,y0+Hb/2-Hb*FRAME_ROOM),x1:Math.min(bmp.width,ext.x1+Hb*FRAME_ROOM),y1:Math.min(bmp.height,y1-Hb/2+Hb*FRAME_ROOM)};
}
function tallLines(lines,Hink){ if(!(Hink>0)) return lines; return lines.filter(l=>{ const h=boxHeight([l]); return !h||h>=PLACE_H*Hink; }); }
let FRAME_WAIT=2000; /* the ink-row proposal is shown as the frame when the reader has not placed one within this time (v289, H: "Show the ink-row frame after 2 seconds if the reader is slower") */
function shapeBox(b,W,H){
  let x=b.x*W, y=b.y*H, w=(b.x1-b.x)*W, h=(b.y1-b.y)*H;
  if(w/h<FRAME_RATIO){ const w2=h*FRAME_RATIO; if(w2>W) return null; x=Math.min(Math.max(0,x-(w2-w)/2),W-w2); w=w2; }
  else { const h2=w/FRAME_RATIO; if(h2>H) return null; y=Math.min(Math.max(0,y-(h2-h)/2),H-h2); h=h2; }
  return {x,y,w,h};
}
async function proposeFrame(id){
  const rec=shotRec(id); if(!rec||!CROP||CROP.id!==id||CROP.auto!==true) return;
  CROP.auto="running";
  let reg=null;
  try{ const bmp=await createImageBitmap(rec.blob); try{ reg=textRegion(bmp); } finally{ bmp.close(); } }catch(err){ logErr("frame",err&&err.message||err); }
  const same=()=>CROP&&CROP.id===id&&CROP.auto==="running"&&!CROP.rect; /* Cancel, another photo or a finger meanwhile: the proposal is dropped */
  if(!same()) return;
  const layer=document.querySelector(`.croplayer[data-id="${id}"]`), img=layer&&layer.parentElement.querySelector("img"); if(!layer) return;
  if(img&&!img.complete) await new Promise(r=>{ img.onload=r; img.onerror=r; });
  if(!same()) return;
  const r=layer.getBoundingClientRect(); if(!r.width||!r.height) return;
  const full=!reg||(reg.x1-reg.x>=0.9&&reg.y1-reg.y>=0.9), b=full?{x:0,y:0,x1:1,y1:1}:reg;
  const shaped=full?null:shapeBox(b,r.width,r.height), f=shaped||{x:b.x*r.width,y:b.y*r.height,w:(b.x1-b.x)*r.width,h:(b.y1-b.y)*r.height};
  CROP.rect={x:f.x,y:f.y,w:f.w,h:f.h,a:0,lw:r.width,lh:r.height};
  CROP.proposed=full?"whole":shaped?"16:9":"text"; delete CROP.auto;
  const hidden=!RECROP[id]; if(hidden) CROP.hidden=true; /* the inbox never shows the proposal (v288): the reader reads it now, and the frame appears on the text it finds */
  const pc=v=>Math.round(v*100); READLOG.push({t:Date.now(),pre:true,text:`frame proposed by the app${hidden?" (not shown)":""}: ${full?"the whole photo":`${pc(f.x/r.width)}–${pc((f.x+f.w)/r.width)} % across, ${pc(f.y/r.height)}–${pc((f.y+f.h)/r.height)} % down${shaped?" (16:9)":" (the text's own box, 16:9 does not fit)"}`}${reg?`, text rows ${pc(reg.y)}–${pc(reg.y1)} %`:", no text rows found"}`}); while(READLOG.length>40) READLOG.shift();
  if(hidden){
    cropSign(id);
    if(S.autoCard){ saveNow(id,true); return; } /* the card by itself (v325): no frame, no preview — the reading fills the card, the reader's or the AI's placement becomes its frame (PLACED, v304), and the row shows the finished card */
    renderShots();
    setTimeout(()=>{ if(!(CROP&&CROP.id===id&&CROP.hidden)) return; delete CROP.hidden; logRead(`frame shown as proposed — the reader took longer than ${FRAME_WAIT/1000} s`); renderShots(); },FRAME_WAIT); /* the reader is slower: the proposal becomes the frame (v289); the reader may still move it once onto the text it finds, while no finger has touched it (v310) */
    return; } /* the reading at once — no preview, no wait: there is no frame to adjust yet; cropSign's first status sets the bar's text before the render */
  renderShots(); showCropPreview(id);
}
async function cropBlob(id,rectArg){
  const rec=shotRec(id), rect=rectArg||(CROP&&CROP.id===id?CROP.rect:null);
  if(!rec||!rect||rect.w<8||rect.h<8) return null;
  const {x,y,w,h,lw,a}=rect;
  const bmp=await createImageBitmap(rec.blob);
  const sc=bmp.width/lw;
  const X=Math.round(x*sc), Y=Math.round(y*sc);
  const cv=document.createElement("canvas");
  cv.width=Math.max(1,Math.round(w*sc)); cv.height=Math.max(1,Math.round(h*sc));
  const ctx=cv.getContext("2d");
  if(a){ /* a turned frame: the photo drawn turned back around the frame's centre, so the frame's content comes out upright (v185); what the frame covers outside the photo takes the area's dominant colour */
    const cx=(x+w/2)*sc, cy=(y+h/2)*sc, R=Math.ceil(Math.hypot(w,h)*sc/2);
    const sx0=Math.max(0,cx-R), sy0=Math.max(0,cy-R), sw=Math.min(bmp.width,cx+R)-sx0, sh=Math.min(bmp.height,cy+R)-sy0; /* only real pixels: outside the photo the canvas is black, and black once filled the corners of a whole-photo frame */
    const probe=document.createElement("canvas"); const pk=Math.min(1,160/Math.max(sw,sh)); probe.width=Math.max(1,Math.round(sw*pk)); probe.height=Math.max(1,Math.round(sh*pk));
    probe.getContext("2d").drawImage(bmp,sx0,sy0,sw,sh,0,0,probe.width,probe.height);
    ctx.fillStyle=dominantRGB(probe.getContext("2d").getImageData(0,0,probe.width,probe.height).data); ctx.fillRect(0,0,cv.width,cv.height);
    ctx.translate(cv.width/2,cv.height/2); ctx.rotate(-a*Math.PI/180); ctx.drawImage(bmp,-cx,-cy);
  } else ctx.drawImage(bmp,X,Y,cv.width,cv.height,0,0,cv.width,cv.height);
  bmp.close();
  const blob=await new Promise(res=>cv.toBlob(res,"image/jpeg",0.85));
  return blob?{blob,X,Y}:null;
}
async function cropOk(id){
  const r=await cropBlob(id);
  if(!r) return; /* no frame yet — nothing to do */
  if(RECROP[id]) return RECROP[id].onImage(r.blob); /* the Edit form's Crop again: the new crop alone, the text stays (v239) */
  const rec=shotRec(id), win=await windowCut(id,CROP&&CROP.id===id?CROP.rect:null); /* the 16:9 window (v329) */
  CROP=null; S.pendingImg=(win||r).blob; S.pendingFull=rec?rec.blob:null; S.pendingShot=id;
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
    if(r.src==="nmt"){ d.m=r.m; setMl(d,"en"); d.mt={...d.mt,src:"nmt",pending:r.pending,verified:false}; try{ await idbPut("custom",d); }catch(e){} n++; } /* the offline model speaks English (v265: recorded under en) */
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
/* first dictionary sense that is not a surname / bound-form / variant / abbreviation note (the abbreviation since v309: 日 opened with "abbr. for 日本, Japan" before "sun; day") */
function bestSense(w){
  const senses=((DICT&&DICT.get(w))||"").split(";").map(x=>x.trim()).filter(Boolean);
  return senses.find(x=>!/^(surname |\(bound form\)|old variant|variant of|\(archaic\)|abbr\. (for|of) )/i.test(x))||senses[0]||"";
}
/* meaning of one transcript line: longest phrasebook phrases first, dictionary
   words for the rest; punctuation kept as its own token for wrapping */
function lineMeaning(line){
  const raw=line.replace(/\s+/g,"");
  const parts=[]; let k=0;
  while(k<raw.length){
    const ch=raw[k];
    if(SIGN_PUNCT.test(ch)){ parts.push({w:ch,p:"",m:"",punct:true}); k++; continue; }
    const num=raw.slice(k).match(/^[0-9]+(?:\.[0-9]+)?[a-zA-Z%]{0,3}/); if(num){ /* a number with its Latin unit as one part (380ml, 20% — v323, H's bottle: "wenn du net content erwähnst, musst du die 380ml auch noch mitnehmen"); a CJK unit joins below */ parts.push({w:num[0],p:num[0],m:num[0],num:true}); k+=num[0].length; continue; } /* a number reads as itself — and takes the unit after it below (mergeUnits, v309) */
    const hit=(SIGNS||[]).find(e=>raw.startsWith(e.zh,k));
    if(hit){ parts.push({w:hit.zh,p:hit.py,m:hit.en,ph:true}); k+=hit.zh.length; continue; }
    const rest=raw.slice(k).split(SIGN_PUNCT)[0]; let len=Math.min(8,rest.length)||1;
    while(len>1 && !(DICT&&DICT.has(rest.slice(0,len)))) len--;
    const w=rest.slice(0,len)||ch;
    parts.push({w,p:pySpaced(w),m:cleanSense(bestSense(w)),ph:false}); /* no dictionary clutter in the composed meaning (v134) */
    k+=w.length;
  }
  const words=mergeUnits(parts).filter(x=>!x.punct);
  const full=words.length>0 && words.every(x=>x.ph||x.num||x.unit);
  /* fully phrasebook-matched line reads as English; a composed line shows word + gloss for every part */
  const en=full?words.map(x=>x.m).join(" · "):words.map(x=>x.num?x.w:x.w+" "+(x.m||"?")).join(" · ");
  const py=pySpaced(words.map(x=>x.w).join(""));
  return {en,full,gloss:words,segs:mergeUnits(parts).map(x=>x.w),py};
}
/* a number and its unit are one part (v309, H's 绿皮书 card with 3月1日 全国上映: the parts row showed 月 and 日 alone, and the tap on
   日 gave the dictionary's first sense, "abbr. for 日本, Japan" — "日 muss zusammen mit der 1 also Datum/Tag erkannt werden"):
   after a number, a lone unit character — 年 月 日 号 点 时 元 块 层 楼 岁 米 人 位 折 — joins it as 3月 / 1日 with a meaning
   read from the pair (March, the 1st), and the row shows that part; a dictionary word starting with the unit (月份, 人人)
   is not a unit and stays a word of its own. Old cards keep their stored gloss, and the row merges it at display time. */
const UNIT_WORDS=new Set(["年","月","日","号","点","时","元","块","层","楼","岁","米","人","位","折"]);
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
function ordinal(n){ const r=n%100, s=r>=11&&r<=13?"th":({1:"st",2:"nd",3:"rd"})[n%10]||"th"; return n+s; }
function unitMeaning(n,u,afterMonth){
  const v=+n;
  switch(u){
    case "年": return v>=1000?`the year ${n}`:`${n} year${v===1?"":"s"}`;
    case "月": return v>=1&&v<=12?MONTHS[v-1]:`${n} months`;
    case "日": return afterMonth?`the ${ordinal(v)} (day of the month)`:`${n} day${v===1?"":"s"}, or the ${ordinal(v)}`;
    case "号": return afterMonth?`the ${ordinal(v)} (day of the month)`:`No. ${n}`;
    case "点": case "时": return `${n} o'clock`;
    case "元": case "块": return `${n} yuan`;
    case "层": case "楼": return `${ordinal(v)} floor`;
    case "岁": return `${n} years old`;
    case "米": return `${n} metre${v===1?"":"s"}`;
    case "人": case "位": return v===1?"1 person":`${n} people`;
    case "折": return v>=1&&v<=9?`${(10-v)*10} % off`:`${n} % of the price`;
  }
  return n+" "+u;
}
function mergeUnits(parts){
  const out=[]; let afterMonth=false;
  for(let i=0;i<parts.length;i++){
    const a=parts[i], b=parts[i+1];
    if(a&&a.num&&b&&!b.punct&&UNIT_WORDS.has(b.w)){ const w=a.w+b.w; out.push({w,p:a.w+" "+(b.p||pySpaced(b.w)),m:unitMeaning(a.w,b.w,afterMonth),unit:true}); afterMonth=b.w==="月"; i++; continue; }
    if(!a.punct) afterMonth=false; out.push(a);
  }
  return out;
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
/* A card picture is brightened when it has no highlights or no contrast (v372, H's rice-cooker labels in the shade:
   "Some Cards really look bad because their part of the image was in the shade"). The 1st and 99th percentile of the
   luminance are stretched to black and white — a straight stretch, no gamma: a poster on a dark wall is not
   underexposed, and lifting its midtones would wash it out. So the test is the highlight end, not the median: a
   picture whose brightest pixels stay under BR_HI has no light in it, and one whose span is under BR_SPAN is flat.
   Measured on the real photos of the harness: all seven rice-cooker labels come out readable, and 绿皮书, 流浪地球,
   the scooter badge, the Nongfu bottle, the parking sign and the whole washing-machine panel are left as they are.
   It is idempotent — a stretched picture measures "fine" the next time.
   The stretch is per channel, which is a white balance (v375, H: "kannst du beim brightening noch einen
   Weissabgleich machen, damit alle bilder aus einem batch gleich aussehen?"): the labels cut from one panel each
   carried their own share of the light's colour, so seven cards of one photo came out in seven different tints.
   Each channel's own 1st and 99th percentile go to black and white, so whatever the light did to the picture is
   taken out and the sibling cards match. It runs only where the three channels are of a kind — the widest span at
   most BR_WB times the narrowest: a crop that is one colour through and through (red text on a red button) has no
   white in it to balance against, and stretching its empty channels would drain the colour, so it keeps the one
   luminance curve of v372. */
const BR_HI=200, BR_SPAN=120, BR_MIN=24, BR_GAIN=40, BR_CLIP=0.01, BR_SAMPLE=200000, BR_WB=2.5;
function brightLut(px){ /* one curve per channel: red, green, blue */
  const h=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)]; let n=0; /* 0 luminance, 1-3 the channels */
  const step=4*Math.max(1,Math.ceil(px.length/4/BR_SAMPLE)); /* a big picture is measured on a sample, the curve then runs over every pixel */
  for(let i=0;i<px.length;i+=step){ h[0][(px[i]*77+px[i+1]*151+px[i+2]*28)>>8]++; h[1][px[i]]++; h[2][px[i+1]]++; h[3][px[i+2]]++; n++; }
  if(!n) return null;
  const at=(k,q)=>{ let c=0; const need=q*n; for(let v=0;v<256;v++){ c+=h[k][v]; if(c>=need) return v; } return 255; };
  const lo=at(0,BR_CLIP), hi=at(0,1-BR_CLIP);
  if(hi-lo<BR_MIN) return null; /* nothing but noise to stretch */
  if(hi>=BR_HI&&hi-lo>=BR_SPAN) return null; /* light and lively: leave it alone */
  const ends=[1,2,3].map(k=>{ const a=at(k,BR_CLIP), b=at(k,1-BR_CLIP); return {lo:a,span:b-a}; });
  const wide=Math.max(...ends.map(e=>e.span)), narrow=Math.min(...ends.map(e=>e.span));
  const balance=narrow>0&&wide<=BR_WB*narrow; /* the channels are of a kind: there is white in the picture to balance against */
  const cap=Math.max(hi-lo,BR_GAIN)/(hi-lo); /* the gain is capped, so a nearly flat picture does not become a poster — the same factor on all three, or the cap would tilt the balance */
  const curve=(a,span)=>{ const lut=new Uint8Array(256); for(let v=0;v<256;v++) lut[v]=Math.round(255*Math.min(1,Math.max(0,(v-a)/span))); return lut; };
  if(!balance){ const one=curve(lo,(hi-lo)*cap); return [one,one,one]; }
  return ends.map(e=>curve(e.lo,Math.max(1,e.span)*cap));
}
/* A card picture is sharpened at the cut (v378, H's "Go" on the offer after "Any other image improvements you
   suggest?"). A photo is stored at 1 600 px, so one rice-cooker label is 184 px wide in it and the card shows it at
   about 322 CSS pixels — two to three times its own size on the phone —, and that softness is in the pixels: the
   brightening cannot touch it. An unsharp mask puts the edge back: the picture blurred with two 1-2-1 passes
   (a radius of about one pixel), the difference added back at SH_AMOUNT. A difference under SH_MIN is the JPEG's
   own grain and is left alone, so a panel's flat surface does not become crunchy. It runs only on a picture under
   SH_W wide — one the card enlarges; a big crop already has more pixels than the box and is left as it is. Measured
   on the rice-cooker labels enlarged three times: 0.8 is the last amount without a light halo around the strokes
   (1.4 haloes and lifts the grain), and two blur passes read far better than one, since the softness spans three or
   four pixels. It is not idempotent — sharpening twice is visible —, so it happens only where a picture is cut fresh
   from the photo, never over the deck: the cards already on the phone keep their look until they are cut again. */
const SH_W=800, SH_AMOUNT=0.8, SH_MIN=3, SH_PASS=2;
function sharpen(d){ /* the ImageData sharpened in place; false when the picture wants none */
  const W=d.width, Hh=d.height, p=d.data;
  if(W>SH_W||W<16||Hh<16) return false;
  let a=Uint8ClampedArray.from(p);
  for(let k=0;k<SH_PASS;k++){ /* separable, so the blur costs two passes over the pixels, not nine reads each */
    const t=new Uint8ClampedArray(a.length);
    for(let y=0;y<Hh;y++) for(let x=0;x<W;x++){ const i=(y*W+x)*4, l=x>0?i-4:i, r=x<W-1?i+4:i;
      for(let c=0;c<3;c++) t[i+c]=(a[l+c]+2*a[i+c]+a[r+c])>>2; }
    const b=new Uint8ClampedArray(a.length);
    for(let y=0;y<Hh;y++) for(let x=0;x<W;x++){ const i=(y*W+x)*4, u=y>0?i-W*4:i, dn=y<Hh-1?i+W*4:i;
      for(let c=0;c<3;c++) b[i+c]=(t[u+c]+2*t[i+c]+t[dn+c])>>2; }
    a=b; }
  for(let i=0;i<p.length;i+=4) for(let c=0;c<3;c++){ const v=p[i+c], df=v-a[i+c];
    if(df>SH_MIN||df<-SH_MIN) p[i+c]=Math.max(0,Math.min(255,Math.round(v+SH_AMOUNT*df))); }
  return true;
}
/* the picture brightened and, at a fresh cut, sharpened — null when it needs neither (then the caller keeps the blob
   it has, unencoded); sharp false is the deck pass of v373, which must not sharpen a picture a second time */
async function brightenBlob(blob,sharp){
  if(!blob) return null;
  try{
    const bmp=await createImageBitmap(blob), cv=document.createElement("canvas");
    cv.width=bmp.width; cv.height=bmp.height;
    const ctx=cv.getContext("2d",{alpha:false}); ctx.drawImage(bmp,0,0); bmp.close();
    const d=ctx.getImageData(0,0,cv.width,cv.height), lut=brightLut(d.data);
    if(lut) for(let i=0;i<d.data.length;i+=4){ d.data[i]=lut[0][d.data[i]]; d.data[i+1]=lut[1][d.data[i+1]]; d.data[i+2]=lut[2][d.data[i+2]]; }
    const sh=sharp?sharpen(d):false; /* the stretch first, then the edge — the sharpening's threshold then reads the picture as the card shows it */
    if(!lut&&!sh) return null;
    ctx.putImageData(d,0,0);
    return await new Promise(res=>cv.toBlob(res,"image/jpeg",0.85));
  }catch(e){ return null; }
}
/* every card picture goes through here: brightened when it is dark or flat, sharpened when the card enlarges it, then a JPEG (v372, v378) */
async function cardJpeg(blob){ const b=await brightenBlob(blob,true); return b||jpegOf(blob); }
/* What the reader sees must be a JPEG: this Tesseract build misreads canvas PNGs and WebPs (measured on the tilted
   composite: JPEG 0.95 → 本区域禁止违规 99 %, the same pixels as PNG → one character). Intermediate crops stay PNG so the
   only lossy step is the last one — two JPEG generations in a row lost the line too. */
const READ_JPEG=0.95, WEAK_READ=180; /* a reading below this score gets the whole-frame copies, both readers (v95: garbage at 58 on the Yakult logo; v96: 180 like the second look — H: time is no issue) */
/* the most frequent 4-bit colour bin of an image, then the mean of its pixels — the fill for corners a rotation opens (v138) */
function dominantRGB(px){
  const bins=new Map(); let top=null;
  for(let i=0;i<px.length;i+=4){ const key=(px[i]>>4)<<8|(px[i+1]>>4)<<4|(px[i+2]>>4); const b=bins.get(key)||{n:0,r:0,g:0,b:0}; b.n++; b.r+=px[i]; b.g+=px[i+1]; b.b+=px[i+2]; bins.set(key,b); if(!top||b.n>top.n) top=b; }
  return top?`rgb(${Math.round(top.r/top.n)},${Math.round(top.g/top.n)},${Math.round(top.b/top.n)})`:"#808080";
}
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
    o.fillStyle=dominantRGB(ctx.getImageData(0,0,w,h).data); o.fillRect(0,0,nw,nh);
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
const READ_FAIL=/^(No Chinese|Reading failed|Frame too)/;
/* a step that lasts longer than READ_STUCK shows its own text under the bar — a stuck step is a failure, not a step (v93) */
const READ_STUCK=20000, READ_AT={}, READ_RUN={}; /* READ_RUN[id] = the number of the latest reading of a photo: an older one still running is superseded and abandons (v116 — a corner drag during a reading started a second one, both finished with the same text and the AI was asked twice) */
/* the moving bar with one line of text — the reading's status, and since v200 the AI check under the Meaning field (H: the meaning
   changes late and nothing said the app was still at it: "kann man anzeigen, dass er noch dran arbeitet?") */
const busyHTML=t=>`<div class="reading"><div class="bar"><i></i></div><span class="badge">${esc(t)}</span></div>`;
const AI_BUSY_TEXT="Checking pinyin and meaning …";
/* while a photo is read: the bar, its text and Save now at the right of that line (v237, H: "take a photo, crop in a rush, hit
   Save and move on" — the card is made at once with the crop, the reading fills it in in the background); once saved, one
   green line instead; in the Edit form's Crop again too since v341 (H: "same as when taking a photo"), where it presses Save changes */
const failText=x=>x.startsWith("Reading failed: ")?t("Reading failed: {0}",esc(x.slice(16))):esc(t(x)); /* the failure sentence in the app's language; the step texts stay English for Diagnostics (v254) */
const readingHTML=(x,id)=>READ_FAIL.test(x)?`<span class="badge">${failText(x)}</span>`
  :(stuck=>id&&PENDING[id]
    ?AUTO[id]?`<div class="reading"><div class="bar"><i></i></div><span class="badge">${t("Reading the text …")}${stuck?t(" still at: {0}",esc(x)):""}</span></div>` /* the card made by itself (v325): the bar alone, the shimmer is on the photo */
    :`<div class="reading"><div class="bar"><i></i></div><span class="ok" style="margin:0">${t("Card saved — the text follows when the reading is done.")}${stuck?t(" Still at: {0}",esc(x)):""}</span></div>`
    :`<div class="reading"><div class="bar"><i></i></div><div class="readrow"><span class="badge">${id&&CROP&&CROP.id===id&&CROP.hidden?t("Finding the text …"):t("Reading the text …")}${stuck?t(" still at: {0}",esc(x)):""}</span>${id&&CROP&&CROP.id===id&&CROP.rect&&!CROP.hidden?`<button class="btn mini" data-savenow="${id}">${t("Save now")}</button>`:""}</div></div>`)
   (!!(id&&READ_AT[id]&&Date.now()-READ_AT[id]>=READ_STUCK));
const readingStatus=(id,run)=>x=>{ if(run&&READ_RUN[id]!==run) return; READING[id]=x; READ_AT[id]=Date.now(); const last=READLOG[READLOG.length-1]; if(last&&/^recognizing … \d+%$/.test(last.text)&&/^recognizing … \d+%$/.test(x)) last.text=x; else logRead(x); saveReadLog(); /* the reader's progress overwrites its own line (v285: forty "recognizing … N%" lines had pushed every step and the proposed frame out of H's diagnostics) */
  const b=$("#ocr-"+id); if(b) b.innerHTML=readingHTML(x,id);
  setTimeout(()=>{ if(READING[id]!==x) return; const b2=$("#ocr-"+id); if(b2) b2.innerHTML=readingHTML(x,id); },READ_STUCK+50); };
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
/* how much of a box looks like text: the share of its rows with some ink, not solid, and many stroke edges — the ink
   height's row rule (v100) over a chromaticity copy of the box alone (v340, the referee between two readings of an
   ambiguous AI box: the blank blue above the ARRI poster's title scores 0, the title's rows score high; the snap cannot
   tell them apart there, since the glow fuses the title, the light beam and the blue into one blob it drops as background) */
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
/* the copies for a batch of passes, made one after another on the main thread but with a turn of the event loop between
   them (v236, "optimize everything for speed" — measured in headless Chromium: the copies took 0.6–1.5 s of a 3 s reading,
   made one by one at the moment a worker asked, so the workers waited for the copy and the main thread sat idle while they
   read): the first is made at once, every later one after a macrotask, so a worker that finishes meanwhile gets its result
   handled and its next job dispatched; the readings are byte-identical, only the order of work changes */
function staged(makers){
  const out=[]; let chain=Promise.resolve();
  makers.forEach((mk,i)=>{ out.push(chain=chain.then(()=>i?new Promise(r=>setTimeout(r,0)).then(mk):mk())); });
  return out;
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
  while(i<ch.length){ let hit=0; for(let len=Math.min(4,ch.length-i);len>=2;len--){ const w=ch.slice(i,i+len).join(""); if(DICT.has(w)){ hit=len; break; } } if(hit){ cov+=hit; i+=hit; } else i++; }
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
function effScore(lines,Hink){ return readingScore(lines,Hink)*sizeFitOf(lines,Hink); } /* a declaration, so the harness can stand it down as it does textLike (v324) */
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
    /* the card image: the same area with a real margin of one text height all round — as a rectangle in the straightened
       crop's coordinates; cropSign cuts it from the crop as framed, unrotated (v145, H: no rotated images with filled
       corners on the card); `tight` = where the tight crop sits in the straightened frame, for the frame placed on the text (v288) */
    const textArea={x0:Math.max(0,x0-H/2), y0:Math.max(0,y0-H/2), x1:Math.min(bmp.width,x1+H/2), y1:Math.min(bmp.height,y1+H/2), tight:{x0,y0,pad,angle:dk2.angle||0,w:cv.width,h:cv.height}};
    const scales=[45/H,60/H,75/H,90/H,110/H].filter(k=>k<0.92); if(H<=200) scales.push(1); /* five character heights; native too while it is cheap (v96: 脊柱 fused into one glyph below 90 px) */
    const tightLines=[];
    const mkSrc=(mode,k)=>mode==="bw"?toBW(bmp2,k):mode==="chroma"?toChroma(bmp2,k):k===1?Promise.resolve(dk2.blob):toJpeg(bmp2,k);
    const srcCache=new Map(); /* one copy per mode and scale — the traditional reader reads the same copies (v236; until v235 it made them again) */
    const srcsOf=mode=>{ if(!srcCache.has(mode)) srcCache.set(mode,staged(scales.map(k=>()=>mkSrc(mode,k)))); return srcCache.get(mode); };
    const keep=(mode,tra,k,lines)=>{ const sc=k===1?lines:scaleBoxes(lines,k); passes.push({lines:sc,img:dk2.blob,angle:dk2.angle,tightened:true,scale:k,bw:mode==="bw",chroma:mode==="chroma",tra:!!tra}); tightLines.push(...sc); };
    const readTight=async(mode,tra)=>{
      const srcs=srcsOf(mode);
      if(tra){ for(let i=0;i<scales.length;i++){ const lines=await readPassTra(await srcs[i],status); if(!lines) return; keep(mode,tra,scales[i],lines); } return; }
      const res=await runPasses(scales.map((k,i)=>async ww=>readPass(ww,await srcs[i],status)),status); /* the simplified passes side by side (v209) */
      res.forEach((lines,i)=>{ if(lines) keep(mode,false,scales[i],lines); }); };
    /* the black-and-white and chromaticity copies are made while the colour passes run, one per turn of the event loop,
       so the main thread's work overlaps the workers' (v236); a clear reading throws them away unused — the fast path
       loses at most one copy's time */
    const colourRun=readTight("colour"); let colourDone=false; colourRun.then(()=>{ colourDone=true; },()=>{ colourDone=true; });
    (async()=>{ await new Promise(r=>setTimeout(r,0)); if(!colourDone){ srcsOf("bw"); } await Promise.all(srcsOf("bw")).catch(()=>{}); if(!colourDone) srcsOf("chroma"); })();
    await colourRun;
    if(r.onTight) await r.onTight(textArea); /* the frame appears on the text now, before the copies and the traditional reader (v288: the first look that knows where the text is) */
    /* a clear reading skips the copies (v209): two colour passes agreeing on the same text of dictionary words at 95 % or
       more — the black-and-white and chromaticity copies exist for light-on-colour and shaded text, where the colour
       passes are not clear; on a clean print sign they only lose (measured: the ten regression images read the same) */
    const clear=p=>meanCf(p.lines)>=95&&dictCover(p.lines)>=1&&p.lines.map(l=>l.t).join("").replace(/[^\u4e00-\u9fff]/g,"").length>=2;
    const texts=passes.filter(p=>p.tightened&&clear(p)).map(p=>p.lines.map(l=>l.t).join("\n")), agreed=texts.some((t,i)=>texts.indexOf(t)!==i);
    const weak=()=>Math.max(...passes.map(p=>effScore(p.lines,Hink)))<180;
    /* the traditional reader's chain — 18 passes one after another on its own worker — used to wait for every simplified
       pass; when the colour passes are already weak it now starts beside the simplified copies and its results are kept
       back until the simplified passes are in, appended in the old order, so the competition sees the same passes (v236:
       H's granite sign 等候区 took 13 s in headless Chromium with the chain waiting; a reading that turns strong on the
       copies drops the chain's results unused) */
    let traRun=null; const traBuf=[];
    if(agreed){ r.clear=true; status("the reading is clear …"); }
    else {
      if(weak()) traRun=(async()=>{ for(const mode of ["colour","bw","chroma"]){ const srcs=srcsOf(mode); for(let i=0;i<scales.length;i++){ if(r.done) return; const lines=await readPassTra(await srcs[i],status); if(!lines) break; traBuf.push([mode,scales[i],lines]); } } })().catch(()=>{}); /* r.done: the reading ended without it — stop (v290) */
      await readTight("bw"); await readTight("chroma"); /* the copies otherwise (v96) */
    }
    /* still weak? the traditional reader on all three — it knows glyphs the simplified one can only approximate */
    if(weak()){ if(traRun){ await traRun; traBuf.forEach(([mode,k,lines])=>keep(mode,true,k,lines)); } else for(const mode of ["colour","bw","chroma"]) await readTight(mode,true); }
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
    return textArea;
  } finally { bmp.close(); }
}
/* A rectangle of the straightened crop, cut from the crop as framed: the rectangle's corners are turned back by the
   straightening angle about the centre, their bounding box is cut (v145 — the rotated, corner-filled crop is for the
   reader only; H: "don't show the corrupt images rotated in the preview, I don't want to see that gray frame") */
function fitTurned(f,a,lw,lh,keep){ /* a turned frame trimmed to the photo (v333): its sides move inward, in its own turned coordinates, until every corner lies in the photo — the side whose corner sticks out furthest each time; keep = extents (about the centre) the sides may not pass — the text inside a frame, the frame inside a window (windowRect): a side that reaches them stops there (v334), and what still sticks out is filled by cropBlob; null when nothing is left */
  const ar=a*Math.PI/180, c=Math.cos(ar), s=Math.sin(ar), cx=f.x+f.w/2, cy=f.y+f.h/2; let u0=-f.w/2, u1=f.w/2, v0=-f.h/2, v1=f.h/2; const stuck={};
  for(let it=0;it<200;it++){ let worst=null;
    for(const [u,v] of [[u0,v0],[u1,v0],[u0,v1],[u1,v1]]){ const px=cx+u*c-v*s, py=cy+u*s+v*c;
      for(const [d,ax] of [[-px,"u"],[px-lw,"u"],[-py,"v"],[py-lh,"v"]]) if(d>0.5&&(!worst||d>worst.d)&&!stuck[(ax==="u"?(u===u1?"u1":"u0"):(v===v1?"v1":"v0"))+"|"+(ax==="u"?(v===v1?"v1":"v0"):(u===u1?"u1":"u0"))]) worst={d,u,v,ax}; }
    if(!worst) break; const {d,u,v}=worst; let {ax}=worst; /* the corner that sticks out furthest is an extreme one, so moving either of its sides inward brings it in: along the axis of the violation by d/|cos|, along the other by d/|sin| */
    let su=d/Math.abs(ax==="u"?c:s)+0.5, sv=d/Math.abs(ax==="u"?s:c)+0.5; const limU=keep?(u===u1?u1-keep.u1:keep.u0-u0):Infinity, limV=keep?(v===v1?v1-keep.v1:keep.v0-v0):Infinity; /* how far each side may still move */
    const okU=su<=limU, okV=sv<=limV; const sideU=u===u1?"u1":"u0", sideV=v===v1?"v1":"v0";
    if(okU&&okV) ax=su<=sv?"u":"v"; else if(okU) ax="u"; else if(okV) ax="v"; else { /* neither side may move that far: both go as far as they may, and this corner stays out */ su=Math.max(0,limU); sv=Math.max(0,limV); if(u===u1) u1-=su; else u0+=su; if(v===v1) v1-=sv; else v0+=sv; stuck[sideU+"|"+sideV]=true; continue; }
    if(ax==="u"){ if(u===u1) u1-=su; else u0+=su; } else { if(v===v1) v1-=sv; else v0+=sv; }
    if(u1-u0<8||v1-v0<8) return null; }
  const nu=(u0+u1)/2, nv=(v0+v1)/2, w=u1-u0, h=v1-v0; return {x:cx+nu*c-nv*s-w/2,y:cy+nu*s+nv*c-h/2,w,h}; }
function unrotatedBox(W,Hh,rect,angle){ /* a rectangle of the straightened crop as its bounding box on the crop as framed */
  const r=-angle*Math.PI/180;
  const nw=Math.abs(W*Math.cos(r))+Math.abs(Hh*Math.sin(r)), nh=Math.abs(W*Math.sin(r))+Math.abs(Hh*Math.cos(r));
  const pts=[[rect.x0,rect.y0],[rect.x1,rect.y0],[rect.x0,rect.y1],[rect.x1,rect.y1]].map(([x,y])=>{ const dx=x-nw/2, dy=y-nh/2; return [dx*Math.cos(-r)-dy*Math.sin(-r)+W/2, dx*Math.sin(-r)+dy*Math.cos(-r)+Hh/2]; });
  const x0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[0])))), x1=Math.min(W,Math.ceil(Math.max(...pts.map(p=>p[0]))));
  const y0=Math.max(0,Math.floor(Math.min(...pts.map(p=>p[1])))), y1=Math.min(Hh,Math.ceil(Math.max(...pts.map(p=>p[1]))));
  return {x0,y0,x1,y1};
}
async function cutUnrotated(orig,rect,angle){
  const bmp=await createImageBitmap(orig);
  try{
    const W=bmp.width, Hh=bmp.height, {x0,y0,x1,y1}=unrotatedBox(W,Hh,rect,angle);
    if(!(x1-x0>=8&&y1-y0>=8)) return null;
    const cc=document.createElement("canvas"); cc.width=x1-x0; cc.height=y1-y0;
    cc.getContext("2d",{alpha:false}).drawImage(bmp,x0,y0,cc.width,cc.height,0,0,cc.width,cc.height);
    return await new Promise(res=>cc.toBlob(res,"image/jpeg",READ_JPEG));
  }catch(e){ return null; } finally{ bmp.close(); }
}
/* The frame appears on the text the reader found (v287/v288, H's poster 手作冰淇淋 under a wide proposed frame: "Why
   don't you automatically crop the chinese text?", then: "Only show the frame after identifying the right area, don't
   make an existing frame jump"): the app's proposal is made from ink rows, and drawings or Latin letters extend it —
   so in the inbox the proposal is never drawn (`CROP.hidden`): the bar says "Finding the text …", the reader reads
   the proposal at once, and the frame is placed once on the text — by a quick look before the reading proper (v290),
   by the close look's tight passes, or by the AI's box when the reader cannot read the font (v293) —, with FRAME_ROOM
   around it and no 16:9 widening (v293), the card image is that frame's cut, and the card's `frame` is that frame. It never moves after that; a stroke while the app is still
   looking frames by hand, and a frame drawn or adjusted by hand is never touched (`CROP.proposed` goes at the hand's
   first gesture). The Edit form's Crop again keeps the shown proposal. Returns the new card image, or null when the
   frame is shown as proposed (no tight pass, or the text fills it). */
const SURE_BOX=70; /* a character's box counts for the frame from this confidence (v288) */
function frameBoxes(lines){ /* the boxes that place the frame: beside a real line a lone character is a fragment (the score's rule) — the ice-cream cone read as 槛 by every colour pass —, a two-character line (喜欢, 爸爸) stays; and only characters read with confidence, all of them when none is */
  const n=l=>[...(l.t||"")].filter(c=>CJK.test(c)).length, use=lines.some(l=>n(l)>=3)?lines.filter(l=>n(l)>=2):lines;
  const sure=use.flatMap(l=>(l.bx||[]).filter((b,i)=>b&&(l.cf||[])[i]>=SURE_BOX)); return sure.length?sure:use.flatMap(l=>l.bx||[]).filter(Boolean);
}
function textBandOf(tightPasses,cardRect){ /* the tight passes' own boxes, as a rectangle of the straightened frame: the second look's band starts from the first pass, whose garbage above the text (a drawing read as a character) would keep the frame wide. Each pass gives the extent of its confident boxes; the frame takes the quartiles over the passes — a stray one pass read (the ice-cream cone above 手作冰淇淋 as 槛 at 88 %) is left out, a line most passes saw is in, and a lone pass counts as it is. The boxes' heights are right, their ends drift (v69): one text height of room at the ends, half a height above and below */
  const tg=cardRect.tight; if(!tg) return cardRect;
  const ext=[], hs=[];
  for(const p of tightPasses){
    const boxes=frameBoxes(p.lines); if(!boxes.length) continue;
    ext.push({x0:Math.min(...boxes.map(b=>b.x0)),y0:Math.min(...boxes.map(b=>b.y0)),x1:Math.max(...boxes.map(b=>b.x1)),y1:Math.max(...boxes.map(b=>b.y1))}); hs.push(median(boxes.map(b=>b.y1-b.y0)));
  }
  if(!ext.length) return cardRect;
  const Hb=median(hs); if(!(Hb>0)) return cardRect;
  const q=(vals,f)=>{ const v=vals.slice().sort((a,b)=>a-b); return v[Math.round(f*(v.length-1))]; }; /* the lower quartile of the starts, the upper of the ends */
  const b={x0:q(ext.map(e=>e.x0),0.25)-Hb/2, y0:q(ext.map(e=>e.y0),0.25)-Hb*FRAME_ROOM, x1:q(ext.map(e=>e.x1),0.75)+Hb/2, y1:q(ext.map(e=>e.y1),0.75)+Hb*FRAME_ROOM};
  const u=unrotatedBox(tg.w,tg.h,b,tg.angle); /* the tight crop's own straightening turned back */
  const r={x0:u.x0-tg.pad+tg.x0, y0:u.y0-tg.pad+tg.y0, x1:u.x1-tg.pad+tg.x0, y1:u.y1-tg.pad+tg.y0}; /* the padding off, into the straightened frame */
  return {x0:Math.max(cardRect.x0,r.x0), y0:Math.max(cardRect.y0,r.y0), x1:Math.min(cardRect.x1,r.x1), y1:Math.min(cardRect.y1,r.y1)}; /* never outside the band the card image takes */
}
async function frameOnText(id,orig,base,rect,angle,by,grow,sure){ /* sure (v333): the reading confirms the straightening — a turned frame that would leave the photo is trimmed to it instead of placed upright */ /* grow (v313): room beyond the picture's edges, in the copy's pixels, when the AI's box touches them */ /* rect: the text with its room, in the straightened frame's coordinates; orig = the crop the reading started from, base = the frame it was cut with (v297: a frame the quick look placed meanwhile is not the picture's frame); by = "AI" when the picture answer places it (v293: allowed while the frame is still the app's proposal, shown or not) */
  const pend=!!PENDING[id]&&!RECROP[id]; /* a card saved with Save now (v304, H's three posters on v303 all with the whole frame's crop: "Enger crop funktioniert manchmal, aber nicht immer" — the frame was gone with the tap, so nothing could be placed): the placement goes to the waiting card instead — its frame and its crop */
  const cr=pend?(PLACED[id]||base):(CROP&&CROP.id===id&&CROP.rect), refine=!!by&&!!base&&!!cr&&base===cr&&(pend?!!PLACED[id]:!!CROP.followed); /* the AI's box on the placed frame's own cut (v303): the frame is centred inside itself */
  if(!base||!rect||RECROP[id]) return null;
  if(pend){ if(!READ_APP[id]||(base.a&&!refine)) return null; } /* only a frame the app drew may be moved for the waiting card; the hand's frame is the card's */
  else if(!cr||!(CROP.hidden||(CROP.proposed&&(by||!CROP.followed)))||(base.a&&!refine)) return null; /* the AI may move a frame the reader placed from a weak reading, never one the hand touched (the hand's first gesture drops `proposed`); a turned base is the hand's — unless it is the placed frame itself. The proposal shown by the 2 s fallback is still the app's, so the reader may move it once (v310, H's 风流一代 poster: the reading proper took longer than 2 s, the whole-photo proposal was shown, then the close look read the title at 97 % and the frame stayed the whole photo — "Warum wurde hier nichts cropped?"; H: "Do A") */
  let W=0,Hh=0; try{ const bmp=await createImageBitmap(orig); W=bmp.width; Hh=bmp.height; bmp.close(); }catch(e){ return null; }
  if(!W||!Hh||(!pend&&(!CROP||CROP.rect!==cr))) return null;
  const sc=W/base.w, lw=base.lw, lh=base.lh; /* crop pixels per layer pixel */
  let f; /* the text with its small room, no 16:9 widening (v293, H: "Make the automatic crop frame tighter. Chinese Text should be well readable in the thumbnail list" — the list's box is 16:9 itself, with the blurred fill behind a wide crop, and a frame widened to 16:9 around a one-line text shrank the text to half the thumbnail's width) */
  let a=0, upright=false, trimmed=false, sticks=false;
  if(refine){ /* the placed frame's cut is upright (a turned frame's cut is drawn upright): the box's rectangle in the cut turns with the frame around the frame's centre (v303, H's 绿皮书 poster: the quick look's frame ran to the right edge over a reflection streak read as 一, and the title sat at the left — "should be more centered") */
    const ar=(base.a||0)*Math.PI/180, dx=((rect.x0+rect.x1)/2-W/2)/sc, dy=((rect.y0+rect.y1)/2-Hh/2)/sc, w=(rect.x1-rect.x0)/sc, h=(rect.y1-rect.y0)/sc;
    const px=base.x+base.w/2+dx*Math.cos(ar)-dy*Math.sin(ar), py=base.y+base.h/2+dx*Math.sin(ar)+dy*Math.cos(ar);
    f={x:px-w/2,y:py-h/2,w,h}; a=base.a||0;
  } else if(Math.abs(angle)>=1.5){ /* the copy was straightened: the frame turns with the text (v297, H's 邪不压正 poster at 8°: "Schrift ist immer noch nicht mittig im Rahmen" — until v296 the frame was the bounding box of the turned rectangle, wider and taller than the text with the text running diagonally through it; a turned frame is the rectangle itself, and its cut — drawn upright by cropBlob, as a frame turned by hand (v185) — is the straight text) */
    const r=-angle*Math.PI/180, nw=Math.abs(W*Math.cos(r))+Math.abs(Hh*Math.sin(r)), nh=Math.abs(W*Math.sin(r))+Math.abs(Hh*Math.cos(r));
    const cx=(rect.x0+rect.x1)/2-nw/2, cy=(rect.y0+rect.y1)/2-nh/2, ox=cx*Math.cos(-r)-cy*Math.sin(-r)+W/2, oy=cx*Math.sin(-r)+cy*Math.cos(-r)+Hh/2; /* the rectangle's centre on the crop as framed */
    const w=(rect.x1-rect.x0)/sc, h=(rect.y1-rect.y0)/sc; f={x:base.x+ox/sc-w/2,y:base.y+oy/sc-h/2,w,h}; a=+angle.toFixed(1);
    const ar=a*Math.PI/180, fx=f.x+w/2, fy=f.y+h/2, tol=0.02, out=[[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[w/2,h/2]].some(([dx,dy])=>{ const px=fx+dx*Math.cos(ar)-dy*Math.sin(ar), py=fy+dx*Math.sin(ar)+dy*Math.cos(ar); return px<-tol*lw||px>(1+tol)*lw||py<-tol*lh||py>(1+tol)*lh; }); /* the frame's corners on the photo */
    const ft=out&&sure?(()=>{ const kb=sure.box, rm=kb?{l:Math.max(0,kb.x0-rect.x0)/sc,t:Math.max(0,kb.y0-rect.y0)/sc,r:Math.max(0,rect.x1-kb.x1)/sc,b:Math.max(0,rect.y1-kb.y1)/sc}:{l:0.1*w,t:0.1*h,r:0.1*w,b:0.1*h}; /* the room around the snapped box; the box itself is the text */ return fitTurned(f,a,lw,lh,{u0:-w/2+rm.l,u1:w/2-rm.r,v0:-h/2+rm.t,v1:h/2-rm.b}); })():null; /* the sides may give up the room around the text, never the text (v334, H's 流浪地球 poster at 14°: the AI's box was nearly the whole straightened copy, the trim of v333 took a quarter of the width to bring the corners in, and the card cut 郭 and 球 — "Crop ist wieder bissl Käse"); a reader's placement carries no box: a tenth of the frame a side */
    if(ft){ f=ft; trimmed=true; const fx2=f.x+f.w/2, fy2=f.y+f.h/2, w2=f.w, h2=f.h; sticks=[[-w2/2,-h2/2],[w2/2,-h2/2],[-w2/2,h2/2],[w2/2,h2/2]].some(([dx,dy])=>{ const px=fx2+dx*Math.cos(ar)-dy*Math.sin(ar), py=fy2+dx*Math.sin(ar)+dy*Math.cos(ar); return px<-tol*lw||px>(1+tol)*lw||py<-tol*lh||py>(1+tol)*lh; }); } /* the reading read the straightened copy well, so the angle is right and the text lies in the photo (v333, H's 绿皮书 poster at −18°: the turned frame reached past the photo's edge with the copy's filled corner, the upright fallback of v311 made the whole lower photo the frame, and the card was half desk — "viel zu viel Luft unten"): the frame keeps its turn and its sides move in until it lies in the photo */
    else if(out){ upright=true; f=null; a=0; } /* the turned frame would leave the photo (v311, H's 无名 poster: a level poster on a busy wall, straightened by −14° on a flat, spurious profile peak; Qwen's box covered the straightened copy, and the frame at −14° reached from −8 to 119 % across, its cut the poster tilted with black wedges — "das ging ordentlich daneben"): the text is in the photo, so a frame that is not cannot be right; it is placed upright as the box's bounding box, clipped to the photo */
  }
  if(!f){
    const {x0,y0,x1,y1}=unrotatedBox(W,Hh,rect,angle); if(!(x1-x0>=8&&y1-y0>=8)) return null;
    f={x:base.x+x0/sc,y:base.y+y0/sc,w:(x1-x0)/sc,h:(y1-y0)/sc};
  }
  if(grow&&!a){ f.x-=grow.left/sc; f.w+=(grow.left+grow.right)/sc; f.y-=grow.top/sc; f.h+=(grow.top+grow.bottom)/sc; f.x=Math.max(0,f.x); f.y=Math.max(0,f.y); f.w=Math.min(lw-f.x,f.w); f.h=Math.min(lh-f.y,f.h); } /* the text may go on beyond the picture's edge: the frame reaches past it, into the photo (v313) */
  const nr={x:f.x,y:f.y,w:f.w,h:f.h,a,lw,lh};
  if(nr.w<8||nr.h<8) return null;
  if(!(cr.a||0)===!a&&Math.abs(nr.x-cr.x)<0.01*lw&&Math.abs(nr.y-cr.y)<0.01*lh&&Math.abs(nr.w-cr.w)<0.01*lw&&Math.abs(nr.h-cr.h)<0.01*lh) return null; /* the text fills the frame: nothing to move */
  const cut=await cropBlob(id,nr); if(!cut) return null;
  if(pend){ if(!PENDING[id]) return null; PLACED[id]=nr; } /* the waiting card takes this frame and its cut (finishPending) */
  else { if(!CROP||CROP.id!==id||CROP.rect!==cr) return null; /* the hand moved the frame meanwhile: the reading is stale anyway */
    CROP.rect=nr; CROP.proposed="text"; CROP.followed=true; delete CROP.hidden; }
  const pc=v=>Math.round(v*100); logRead(`frame ${refine?"centred":"placed"} on the text${by?" by the "+by:""}: ${pc(f.x/lw)}–${pc((f.x+f.w)/lw)} % across, ${pc(f.y/lh)}–${pc((f.y+f.h)/lh)} % down${a?`, turned by ${a}°`:""}${trimmed?(sticks?" — trimmed to the text, the rest reaches past the photo's edge":" — trimmed to the photo"):""}${upright?` — upright, the frame turned by ${angle.toFixed(1)}° would leave the photo`:""}`);
  return cut.blob;
}
/* The AI's box, snapped to the characters (v297, H's 邪不压正 poster: Qwen's box cut 邪 at the left and reached into
   the faces under the title — "links leicht abgeschnitten, unten zu viel Luft"): a vision model's box is a rough place,
   a tenth of the picture off on that poster twice; the pixels know the characters. On a grey copy of at most 800 px,
   thresholded by Otsu over the box, the connected blobs of both colours are labelled within the box widened by one text
   height (SNAP_ROOM; the text height = the box's height over its lines). A character is a blob at least 0.15 text
   heights tall (SNAP_MIN) and smaller than the box itself (SNAP_MAX of its width and height — a border ring around the
   box is bigger; no bound at a character's size, since a brush title's strokes join across the lines), not touching the
   widened box's edge — the faces cut off by the picture's bottom, the poster's border and the wall, the red between the
   characters and a reflection streak all fail one of these — with at least half of it inside the AI's box (a reflection streak above the title and a cheek
   under it lie outside, the 邪 the box cuts lies mostly inside), and of the two colours the one whose characters cover
   more area is the text (a median or a dominant colour cannot tell the background: the white title fills more of
   Qwen's box than the red does). A blob of that colour in a taken blob's band, within half a text height sideways,
   joins — the box cut 邪 between 牙 and 阝, and 牙 lay outside it; sideways only, since under a line the cheeks of the
   faces would qualify. The snapped box is the union of those blobs; nothing, or under a fifth of the AI's box, leaves the AI's box as it is. Measured
   crossings per row could not do it: the faces' rows had as many light-dark changes as the title's. The later passes
   stand below with their own notes: the column pass for a character fused with a streak (v303), the width budget per
   line (v305) and the shadow pass beyond the line's ends (v306). */
const SKEW_TRUST=12; /* an unconfirmed straightening beyond this many degrees is not trusted for the picture the AI sees (v346) */
const SNAP_ROOM=1, SNAP_MIN=0.15, SNAP_MAX=0.95, SNAP_COL=0.15, SNAP_WIDE=1.6, SNAP_GAP=0.8, SNAP_BAR=1.6, SNAP_STACK=0.5; /* BAR: how much wider than tall a blob must be to be read as one stroke of a character written in bars · STACK: how far apart two of them may stand */
const SNAP_REACH=0.85; /* how much of the AI's box the coloured ink must reach across beside the grey pick's (v349, H's vending machine at v347 "Vending machine works not yet": the red text on glass reaches 77 % of the box against the grey cut's 89 %, so v347's "at least as much" blocked the switch on the phone's own pixels; H's 流浪地球 poster, the case the guard is for, reaches 56 against 92) */
/* A photo of a user interface, one card per element (v357–v358, H's rice cooker panel — eleven buttons, 低卡饭 柴火饭 快煮
   粗粮饭 汤/粥, 时 分, 保温/取消 预约 开始 功能: "I want that if such a picture comes, you automatically detect the different
   words on it and make single flash cards for each of them", then on v357's geometric test: "No. It doesn't work like that. I
   think you have to find out if the image is a user interface and then put a card for each and every single element of it").
   Measured on that photo first: the reader reads garbage from it (说, 队定还, 下昌。。功双 — every pass scores 0), so the picture
   goes to the AI as any weak reading does, and the answer already carries every label with its own pinyin, its own meaning (v300)
   and its own box (v312) — eleven cards' worth of data in the one call the app already makes. What the pixels alone cannot do: a
   clustering of the photo's ink found 8 of the 11 labels and lost the whole left half to one brightness threshold, so the split
   follows the model, not geometry. The model is asked one question — is this a user interface? — and answers with a "labels"
   array, one entry per element, the small label under a bigger one included. The app checks only what it can check better than
   the model: SPLIT_MIN to SPLIT_MAX elements (H's washing machine carries 23, his dishwasher's lower panel two — 加速省时 beside
   轻载模式), every box read on the same scale (picBox reads numbers as fractions, as pixels or on the 0–1000 grid on its own, so a
   mixed answer would put some labels somewhere else entirely), no box covering the whole picture, the automatic-card path only (a
   frame drawn by hand still makes one card), an upright frame (a tilted panel keeps one card: the turned mapping is the frame's
   own, v297) and not the v340 pixel reading of the box (the labels are never rescaled with it). v357 also asked whether two boxes
   stood side by side and whether any box was taller than twice its width — a panel whose labels sit in one column would have
   failed both, and the geometry was the app's invention; it is gone. */
const SPLIT_MIN=2, SPLIT_MAX=30, SPLIT_PX=8, CROP_MIN=8.5; /* SPLIT_PX: in the copy's own pixels, the smallest label a frame is made from · CROP_MIN: the smallest frame cropBlob cuts, in the layer's pixels */
function photoFrameOf(base,W,Hh,rect,angle){ /* a rectangle of the straightened copy as a frame on the photo — frameOnText's own upright mapping, without its side effects */
  const sc=W/base.w, {x0,y0,x1,y1}=unrotatedBox(W,Hh,rect,angle);
  if(!(x1-x0>=SPLIT_PX&&y1-y0>=SPLIT_PX)) return null; /* in the copy's own pixels: a label is measured against the photo, not against the layer — a button 35 px tall in a 1600 px photo is under 8 px on a 338 px layer and is a good card picture all the same */
  const f={x:base.x+x0/sc,y:base.y+y0/sc,w:(x1-x0)/sc,h:(y1-y0)/sc,a:0,lw:base.lw,lh:base.lh};
  for(const [d,p,q] of [["w","x","lw"],["h","y","lh"]]) if(f[d]<CROP_MIN){ f[p]-=(CROP_MIN-f[d])/2; f[d]=CROP_MIN; } /* a small label on a small layer: the frame grows around its centre to the size cropBlob wants — a button 35 px tall in the photo is 7 px on a 338 px layer */
  f.x=Math.max(0,Math.min(base.lw-f.w,f.x)); f.y=Math.max(0,Math.min(base.lh-f.h,f.y));
  return f.w>=CROP_MIN&&f.h>=CROP_MIN&&f.w<=base.lw&&f.h<=base.lh?f:null;
}
/* The characters of one label, near the model's anchor (v359, H's rice cooker at v358: every top-row card showed the small black
   button instead of its label — "Cropped wrong areas"). The reproduction of that photo (the picture the AI saw, 637×800, with the
   answer's own boxes drawn on it) says why: Qwen's per-label boxes sit on the buttons, one label height below the characters —
   [158,236,255,285] for 低卡饭 whose text stands at y 185–220 —, and snapBox then did its job on the ink it was pointed at. The
   union box drifted the same way, and the v326 band check caught that one ("a line above the AI's box, read as 快毒粗粮饭"); the
   label boxes had nothing to catch theirs. So a label's box is an anchor, not a measurement: look around it for a row of
   character-shaped blobs and take that. What tells a label from its button: characters are blobs about as wide as tall, several
   of them in a row, while a button is one blob three times wider than tall. The neighbouring labels stand in the same row band,
   so the band is cut into runs at gaps of half a character height — inside a label the characters nearly touch, between labels
   there is a character's width of air — and the run over the anchor is the label. A second row joins when it sits within
   LB_GAP of the first and stands over it (保温 above 取消). Nothing character-shaped: the AI's box stays as it is. */
const LB_CAP=1600, LB_UP=1.6, LB_SIDE=1.5, LB_MINH=0.2, LB_MAXH=1.25, LB_ROW=0.02, LB_MERGE=0.5, LB_FILL=0.8, LB_INK0=0.005, LB_INK1=0.35, LB_NEAR=0.6, LB_GAP=0.8, LB_OVER=0.4;
function labelGrey(bmp,uni){ /* the picture in grey once for the whole panel (v360): at its own pixels up to LB_CAP, so a label 16 px
  tall in the 800 px picture the AI saw is measured on twice as many pixels, and the 20-odd labels share one canvas instead of one each */
  const k=Math.min(1,LB_CAP/Math.max(bmp.width,bmp.height)), W=Math.max(1,Math.round(bmp.width*k)), Hh=Math.max(1,Math.round(bmp.height*k));
  const cv=document.createElement("canvas"); cv.width=W; cv.height=Hh; const ctx=cv.getContext("2d",{alpha:false,willReadFrequently:true}); ctx.drawImage(bmp,0,0,W,Hh);
  const d=ctx.getImageData(0,0,W,Hh).data, g=new Uint8Array(W*Hh); for(let i=0,j=0;i<d.length;i+=4,j++) g[j]=(d[i]*77+d[i+1]*151+d[i+2]*28)>>8;
  const cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const U=uni?{x0:cl(Math.round(uni[0]*W),0,W-2),y0:cl(Math.round(uni[1]*Hh),0,Hh-2),x1:cl(Math.round(uni[2]*W),1,W),y1:cl(Math.round(uni[3]*Hh),1,Hh)}:{x0:0,y0:0,x1:W,y1:Hh};
  const hist=new Uint32Array(256); let un=0; for(let y=U.y0;y<U.y1;y++) for(let x=U.x0;x<U.x1;x++){ hist[g[y*W+x]]++; un++; }
  const thrU=otsuThr(hist,Math.max(1,un)); let dark=0; for(let v=0;v<=thrU;v++) dark+=hist[v];
  return {g,W,Hh,thrU,inkDark:dark*2<un}; /* ink is the minority — dark characters on a light panel, light ones on a dark one */
}
function labelScan(gy,box,pin,far){ /* every row of ink near the anchor and, in each row, the run that looks most like this label */
  const {g,W,Hh,thrU,inkDark}=gy, cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const B=pin?{x0:cl(Math.round(pin.x0),0,W-2),y0:cl(Math.round(pin.y0),0,Hh-2),x1:cl(Math.round(pin.x1),1,W),y1:cl(Math.round(pin.y1),1,Hh)}
             :{x0:cl(Math.round(box.x0*W),0,W-2),y0:cl(Math.round(box.y0*Hh),0,Hh-2),x1:0,y1:0};
  if(!pin){ B.x1=cl(Math.round(box.x1*W),B.x0+2,W); B.y1=cl(Math.round(box.y1*Hh),B.y0+2,Hh); }
  const bh=(pin&&pin.h)||(B.y1-B.y0); if(bh<6) return null; /* pinned: the row's own height, not the run's — a faint label gives a fragment of a run, and every size test below would shrink with it */
  /* pinned (v376): the plan chose the row and the run, so the region is that run with a little room for the local cut to finish the characters */
  const side=pin&&pin.loose?LB_SIDE*bh:0.5*bh; /* a label the plan could not give a run of its own keeps the answer's box, which may sit sideways of its characters */
  const R=pin?{x0:Math.max(0,Math.round(B.x0-side)),y0:Math.max(0,Math.round(B.y0-LB_PIN*bh)),x1:Math.min(W,Math.round(B.x1+side)),y1:Math.min(Hh,Math.round(B.y1+LB_PIN*bh))}
             :{x0:Math.max(0,Math.round(B.x0-LB_SIDE*bh)),y0:Math.max(0,Math.round(B.y0-(far?LB_FAR:LB_UP)*bh)),x1:Math.min(W,Math.round(B.x1+LB_SIDE*bh)),y1:Math.min(Hh,Math.round(B.y1+(far?LB_FAR:LB_UP)*bh))};
  const rw=R.x1-R.x0, rh=R.y1-R.y0; if(rw<4||rh<4) return null;
  /* the cut: the label's own surroundings when they hold ink — a panel is lit unevenly and one cut over the whole answer's box
     loses the characters at its dim end (H's 粗粮饭 came out as 粗粮) —, else the whole answer's box, which certainly holds ink:
     over surroundings that are bare panel Otsu splits the panel's own gradient in half and the characters drown in it (H's 预约,
     whose anchor stands on bare panel) */
  const hr=new Uint32Array(256); for(let y=R.y0;y<R.y1;y++) for(let x=R.x0;x<R.x1;x++) hr[g[y*W+x]]++;
  const thrR=otsuThr(hr,rw*rh); let dr=0; for(let v=0;v<=thrR;v++) dr+=hr[v];
  const share=Math.min(dr,rw*rh-dr)/(rw*rh), thr=share>=LB_INK0&&share<=LB_INK1?thrR:thrU;
  const on=(x,y)=>{ const v=g[(R.y0+y)*W+R.x0+x]; return inkDark?v<=thr:v>thr; };
  const rowInk=new Int32Array(rh); for(let y=0;y<rh;y++){ let n=0; for(let x=0;x<rw;x++) if(on(x,y)) n++; rowInk[y]=n; }
  const need=Math.max(1,Math.round(LB_ROW*rw)), bands=[];
  for(let y=0,run=0;y<=rh;y++){ if(y<rh&&rowInk[y]>=need) run++; else { if(run) bands.push({y0:y-run,y1:y}); run=0; } }
  const bcx=(B.x0+B.x1)/2-R.x0, bcy=(B.y0+B.y1)/2-R.y0, bx0=B.x0-R.x0, bx1=B.x1-R.x0;
  const runOf=band=>{ /* the label the anchor stands over: inside a label the characters nearly touch, between labels there is a character's width of air */
    const bhh=band.y1-band.y0; if(bhh<LB_MINH*bh||bhh>(far?LB_TALL:LB_MAXH)*bh) return null; /* the plan's scan lets a row be taller: a panel's row of labels carries its fine print, and the pinned scan tightens it again */
    const col=new Int32Array(rw); for(let x=0;x<rw;x++){ let n=0; for(let y=band.y0;y<band.y1;y++) if(on(x,y)) n++; col[x]=n; }
    const gap=Math.max(2,Math.round(LB_MERGE*bhh)), runs=[];
    for(let x=0,st=-1,off=0;x<=rw;x++){ if(x<rw&&col[x]){ if(st<0) st=x; off=0; }
      else if(st>=0){ off++; if(x===rw||off>gap){ runs.push({x0:st,x1:x-off+1}); st=-1; off=0; } } }
    let best=null, bv=-1e9;
    for(const r of runs){ let ink=0; for(let x=r.x0;x<r.x1;x++) ink+=col[x];
      const w=r.x1-r.x0; if(ink>=LB_FILL*w*bhh) continue; /* solid: a button, a bar, a plate — not characters (measured on H's cooker: 低卡饭 fills 0.45 of its box, the button under it 0.89) */
      const bw=Math.max(1,bx1-bx0), ov=Math.max(0,Math.min(r.x1,bx1)-Math.max(r.x0,bx0))/bw;
      const v=2*ov-Math.abs((r.x0+r.x1)/2-bcx)/bw-Math.abs(w-bw)/bw; /* the model's box may sit on the button under the label, but its width is the label's: a run as wide as the box is the text, the button under it is a third of it */
      if(v>bv){ bv=v; best={x0:r.x0,y0:band.y0,x1:r.x1,y1:band.y1,v}; } }
    return best; };
  const spots=[]; for(const band of bands){ const r=runOf(band); if(r) spots.push({x0:r.x0+R.x0,y0:r.y0+R.y0,x1:r.x1+R.x0,y1:r.y1+R.y0,v:r.v}); }
  return {W,Hh,bh,bcy:bcy+R.y0,spots};
}
function labelRect(gy,box,pin){ /* box in fractions of the picture; pin (v376): the row and the run the plan gave this label, in the picture's own pixels */
  const sc=labelScan(gy,box,pin);
  if(pin&&(!sc||!sc.spots.length)) return {x0:pin.x0/gy.W,y0:pin.y0/gy.Hh,x1:pin.x1/gy.W,y1:pin.y1/gy.Hh}; /* the run the plan measured is a good answer on its own */
  if(!sc||!sc.spots.length) return null;
  const {W,Hh,bh,bcy,spots}=sc;
  let take=null, tv=-1e9;
  for(const r of spots){ /* pinned: the plan chose the row, so the band nearest it wins outright; free: the run over the anchor, in the row nearest it — but only as a tiebreaker, since the model's boxes drift by a whole label height and what the run looks like weighs more than where it sits */
    const v=pin&&!pin.loose?-Math.abs((r.y0+r.y1)/2-bcy):r.v-LB_NEAR*Math.abs((r.y0+r.y1)/2-bcy)/bh;
    if(v>tv){ tv=v; take=r; } }
  if(!take) return null;
  const skip=(pin&&pin.skip)||[]; /* a row another label was placed on is not this label's second line */
  for(const r of spots){ if(r===take||skip.some(o=>Math.min(o.y1,r.y1)-Math.max(o.y0,r.y0)>0)) continue; /* a label printed on two lines: the row above or below, standing over the same place (保温 above 取消) */
    const gp=Math.max(r.y0-take.y1,take.y0-r.y1), ov=Math.max(0,Math.min(r.x1,take.x1)-Math.max(r.x0,take.x0))/Math.max(1,Math.min(r.x1-r.x0,take.x1-take.x0));
    if(gp<=LB_GAP*(take.y1-take.y0)&&ov>=LB_OVER) take={x0:Math.min(take.x0,r.x0),y0:Math.min(take.y0,r.y0),x1:Math.max(take.x1,r.x1),y1:Math.max(take.y1,r.y1),v:take.v}; }
  return {x0:take.x0/W,y0:take.y0/Hh,x1:take.x1/W,y1:take.y1/Hh}; /* fractions of the picture */
}
/* The labels are placed row by row, in the order the model read them (v376, H's washing machine at v375: the split
   worked and every card showed a neighbour's label — "beim 2. Anlauf hat es geklappt, aber leider fehlerhaft"). The
   answer's boxes for that panel are an evenly spaced grid — 130,200,270,340 across and 255,300,345 down, every box
   50×35 — a plausible layout rather than a measurement, and the panel's own rows are not evenly spaced (an icon row
   stands between the first and the second). So each anchor sat up to a whole row away from its label, and v359's
   per-label search, which weighs what a run looks like far above where it sits, walked to whatever ink was nearest:
   five pairs of labels took the same characters and six found nothing at all. What the model does get right is the
   reading order and the topology — which label stands in which row, and in which column of it —, so that is what is
   used. Every label's own scan (v359's, with its local cut) nominates one run per row of ink near it; the nominations
   of all the labels are clustered into the picture's own rows; the answer's boxes are grouped into rows too; the rows
   are laid onto the clusters in order (a cluster may be skipped — the icon rows are); and inside a cluster the row's
   labels are laid onto its runs in order, so no two labels can take the same run. Then labelRect runs again, pinned
   to that row and that run. Nothing lines up: the plan is dropped and every label is placed on its own as before. */
const LB_TMPL=0.1, LB_MISS=1.2, LB_PIN=0.35, LB_KEEP=0.5, LB_SAME=0.5, LB_FAR=4, LB_TALL=2.2, LB_PAR=2; /*  TMPL: how far a label box may sit from the median before it is not one of the grid's · MISS: what a label that finds no run costs its row · PIN: the room around a pinned run · KEEP: the share of labels a plan must place · SAME: two nominations of one run · FAR: how far, in box heights, the plan's scan looks for the picture's own rows, since the answer's grid may sit a row and more beside them · TALL: how tall a row may be in that scan · PAR: a spare row of ink standing under this many of a row's labels is a row of its own (a panel's icons), not their second line */
function labelRows(labels){ /* the answer's boxes grouped into rows, each row in reading order */
  const at=labels.map((l,i)=>i).sort((a,b)=>(labels[a].box[1]+labels[a].box[3])-(labels[b].box[1]+labels[b].box[3])), rows=[];
  for(const i of at){ const b=labels[i].box, h=b[3]-b[1], r=rows[rows.length-1];
    if(r&&Math.min(r.y1,b[3])-Math.max(r.y0,b[1])>=0.5*Math.min(r.y1-r.y0,h)){ r.at.push(i); r.y0=Math.min(r.y0,b[1]); r.y1=Math.max(r.y1,b[3]); }
    else rows.push({y0:b[1],y1:b[3],at:[i]}); }
  for(const r of rows) r.at.sort((a,b)=>(labels[a].box[0]+labels[a].box[2])-(labels[b].box[0]+labels[b].box[2]));
  return rows;
}
function labelClusters(spots){ /* every label's nominations, clustered into the picture's own rows of characters */
  const all=[]; spots.forEach(ss=>ss.forEach(r=>all.push(r)));
  if(!all.length) return [];
  all.sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1));
  const cs=[];
  for(const r of all){ const c=cs[cs.length-1], h=r.y1-r.y0;
    if(c&&Math.min(c.y1,r.y1)-Math.max(c.y0,r.y0)>=0.5*Math.min(c.y1-c.y0,h)){ c.at.push(r); c.y0=Math.min(c.y0,r.y0); c.y1=Math.max(c.y1,r.y1); }
    else cs.push({y0:r.y0,y1:r.y1,at:[r]}); }
  return cs.map(c=>{ const rs=c.at.slice().sort((a,b)=>a.x0-b.x0), runs=[]; /* two labels that nominated the same run give it twice */
    for(const r of rs){ const p=runs[runs.length-1];
      if(p&&Math.min(p.x1,r.x1)-Math.max(p.x0,r.x0)>=LB_SAME*Math.min(p.x1-p.x0,r.x1-r.x0)){ p.x0=Math.min(p.x0,r.x0); p.x1=Math.max(p.x1,r.x1); p.y0=Math.min(p.y0,r.y0); p.y1=Math.max(p.y1,r.y1); }
      else runs.push({x0:r.x0,x1:r.x1,y0:r.y0,y1:r.y1}); }
    const hs=c.at.map(r=>r.y1-r.y0).sort((a,b)=>a-b);
    return {y0:c.y0,y1:c.y1,h:hs[hs.length>>1],runs}; });
}
function alignRow(labs,cluster,W){ /* the row's labels onto the cluster's runs, both in reading order, each run used once */
  const n=labs.length, m=cluster.runs.length, bh=Math.max(1,cluster.h);
  const val=(i,j)=>{ const b=labs[i].box, bx0=b[0]*W, bx1=b[2]*W, bw=Math.max(1,bx1-bx0), r=cluster.runs[j], w=r.x1-r.x0;
    const ov=Math.max(0,Math.min(r.x1,bx1)-Math.max(r.x0,bx0))/bw, want=Math.max(1,labs[i].n*bh); /* a label of k characters is about k rows high wide */
    return 2*ov-Math.abs((r.x0+r.x1)/2-(bx0+bx1)/2)/(4*bh)-Math.abs(w-want)/want; };
  const NEG=-1e9, f=[], pk=[];
  for(let i=0;i<=n;i++){ f.push(new Float64Array(m+1).fill(NEG)); pk.push(new Int32Array(m+1).fill(-9)); }
  f[0][0]=0; for(let j=1;j<=m;j++){ f[0][j]=0; pk[0][j]=-1; }
  for(let i=1;i<=n;i++) for(let j=0;j<=m;j++){
    let best=f[i-1][j]-LB_MISS, from=-3;
    if(j>0&&f[i][j-1]>best){ best=f[i][j-1]; from=-1; }
    if(j>0){ const v=f[i-1][j-1]+val(i-1,j-1); if(v>best){ best=v; from=j-1; } }
    f[i][j]=best; pk[i][j]=from; }
  const pick=new Array(n).fill(-1); let i=n, j=m;
  while(i>0){ const p=pk[i][j]; if(p===-1) j--; else if(p===-3) i--; else { pick[i-1]=p; i--; j--; } }
  return {score:f[n][m],pick};
}
function labelPlan(gy,labels){ /* one cluster per row of the answer, in order; one run per label inside it */
  const spots=labels.map(l=>{ let sc=null; try{ sc=labelScan(gy,{x0:l.box[0],y0:l.box[1],x1:l.box[2],y1:l.box[3]},null,true); }catch(e){ sc=null; } return sc?sc.spots:[]; });
  const cs=labelClusters(spots), rows=labelRows(labels), R=rows.length, C=cs.length;
  if(!R||C<R) return null;
  const al=rows.map(r=>cs.map(c=>alignRow(r.at.map(k=>labels[k]),c,gy.W)));
  const NEG=-1e9, f=[], pk=[];
  for(let i=0;i<=R;i++){ f.push(new Float64Array(C+1).fill(NEG)); pk.push(new Int32Array(C+1).fill(-9)); }
  for(let j=0;j<=C;j++){ f[0][j]=0; pk[0][j]=-1; }
  for(let i=1;i<=R;i++) for(let j=1;j<=C;j++){
    let best=f[i][j-1], from=-1;
    if(f[i-1][j-1]>NEG/2){ const v=f[i-1][j-1]+al[i-1][j-1].score; if(v>best){ best=v; from=j-1; } }
    f[i][j]=best; pk[i][j]=from; }
  const at=new Array(R).fill(-1); let i=R, j=C;
  while(i>0&&j>0){ const p=pk[i][j]; if(p===-1) j--; else { at[i-1]=p; i--; j--; } }
  if(at.some(v=>v<0)) return null;
  const pin=new Array(labels.length).fill(null); let placed=0;
  rows.forEach((r,ri)=>{ const c=cs[at[ri]], pick=al[ri][at[ri]].pick;
    r.at.forEach((k,q)=>{ const rn=pick[q]<0?null:c.runs[pick[q]], b=labels[k].box;
      if(rn){ placed++; pin[k]={x0:rn.x0,x1:rn.x1,y0:rn.y0,y1:rn.y1,h:c.h,row:at[ri]}; }
      else pin[k]={x0:b[0]*gy.W,x1:b[2]*gy.W,y0:c.y0,y1:c.y1,h:c.h,row:at[ri],loose:true}; }); }); /* no run of its own: at least the row is known, and the answer's own box says where in it to look */
  if(placed<LB_KEEP*labels.length) return null;
  /* a spare row of ink that stands under more than one of a row's labels is a row of its own — a panel carries an icon
     over every button — and never their second line; a second line stands under one label alone (保温 above 取消) */
  const used=new Set(at), par=new Set();
  cs.forEach((c,q)=>{ if(used.has(q)) return; let n=0;
    for(const r of c.runs) if(at.some(u=>cs[u].runs.some(o=>Math.max(0,Math.min(o.x1,r.x1)-Math.max(o.x0,r.x0))>=LB_OVER*Math.min(o.x1-o.x0,r.x1-r.x0)))) n++;
    if(n>=LB_PAR) par.add(q); });
  const bar=cs.map((c,q)=>q).filter(q=>used.has(q)||par.has(q)).map(q=>({q,y0:cs[q].y0,y1:cs[q].y1}));
  for(const p of pin) if(p) p.skip=bar.filter(b=>b.q!==p.row).map(b=>({y0:b.y0,y1:b.y1}));
  return {pin,placed,rows:R};
}
function roundGrid(lab,W){ /* the boxes drawn on a round grid (v390, H's washing machine at v389: the model answered a lattice
     again — [130,260,190,300] for 混合, [210,260,270,300] for 快速 — but 60 px wide for two characters and 70 for three, so the
     width rule of v381 called it a measurement, the cards were placed by the model's coordinates as before v380, and every one
     showed a neighbour's button). Every number of that answer is a multiple of ten. A measurement of a photo lands on arbitrary
     pixels (H's rice cooker: 158, 236, 255, 285); a drawing lands on round ones. Pixel answers only — on the 0–1000 grid a round
     number is just two digits of precision, and a real measurement may well be written that way. */
  if(!lab||lab.length<4||!lab.every(l=>l.scale==="px")) return false;
  let round=0;
  for(const l of lab) for(const v of [l.box[0]*W,l.box[2]*W]){ const r=Math.round(v); if(Math.abs(v-r)<0.3&&r%LB_STEP===0) round++; }
  return round>=LB_ROUND*lab.length*2;
}
function templateBoxes(lab,W){ /* the answer's label boxes drawn to a grid, not measured on the picture (v380, H's washing
     machine at v379: every box exactly 60×40 px on an 800 px picture, the whole grid a cell and more to the right of the panel,
     so every card showed its neighbour's button). A drift like that cannot be told from the truth — the boxes are internally
     consistent, the plan places as many labels either way — so the boxes are not used to cut a picture at all. The tell is that
     labels of two and of seven characters got the same box: a measurement follows the characters, a drawing does not. */
  if(!lab||lab.length<4) return false;
  const med=a=>{ const t=a.slice().sort((x,y)=>x-y); return t[t.length>>1]||1; };
  const ws=lab.map(l=>(l.box[2]-l.box[0])*W); /* the width, not the height: a label of k characters is k characters wide, while a box's height is its row's style and honestly differs from row to row (H's panel: every box 60 px wide, the rows 50 and 30 px tall) */
  const mw=med(ws), one=[]; /* the picture's edge clips a box or two, so the rule is the share of boxes of one size, not their spread */
  for(let k=0;k<lab.length;k++) if(Math.abs(ws[k]-mw)<=LB_TMPL*mw) one.push(k);
  if(one.length<0.8*lab.length) return roundGrid(lab,W);
  /* Two ideas were tried on top of this rule and both are gone. The pitch as a second tell (v382, dropped in v383): a panel's
     buttons of one block *are* evenly spaced, so a measurement gives the same regular gaps a lattice does. And asking the model
     again, one strip per row (v382–v383, dropped in v385): H's own three strip answers, read from the AI log the moment it
     survived a reload, put the panel's right-hand block within 1 point of the truth and its dim left-hand block 10 to 28 points
     to the right of it — every call, every scale, no overlap with the real labels at all. The model reads this panel and cannot
     localise on it; a second question gets a second drawing, and the strips' own y squashed the answer's three rows into two,
     so labelPlan found nothing to line up. Three calls and two minutes for a worse answer. */
  const ns=one.map(k=>[...lab[k].zh].filter(c=>CJK.test(c)).length||1);
  return Math.max(...ns)>Math.min(...ns); /* labels of one length may honestly measure the same width */
}
/* One card per label when the model's boxes are a drawing (v386, H's washing machine at v385: the model reads that panel
   perfectly and cannot say where anything is — measured on his own answers, the bright right-hand block within a point of
   the truth and the dim left-hand block 12 to 28 points beside it, at every scale and on every call, so v380 gave every
   card the whole picture and H rejected it). The model says what the labels are; the pixels say where. The picture's own
   rows of characters are found as v359 finds them — a lattice of probe boxes over the frame, each scanned with its own
   local cut, so the panel's dim half keeps its rows —, every row is cut across the whole width into runs, each run is cut
   at the photo's pixels and read by the on-device reader, and a run whose reading is one of the model's labels is that
   label's picture. Matching is by text, not by place: a run and a label pair only when their characters line up (the
   lengths within one, the longest common subsequence over half), so a fragment or a neighbour cannot win. A label nothing
   matched keeps the frame's own picture — the v380 answer — so a card can be short of its own crop but never carries a
   neighbour's. Measured on H's own photo at its own 1600 px with his own texts: 18 of the 19 labels on their own
   characters, none on another's, where v385 gave all 19 the whole panel. */
const RL_STEP=0.6, RL_SUP=3, RL_DUP=0.6, RL_TILES=8, RL_GAP=0.55, RL_WMIN=0.8, RL_WMAX=12, RL_PX=64, RL_ROOM=[0.3,0.5], RL_CAP=420, RL_HIT=0.6, RL_WEAK=0.5, RL_GROW=[0.22,0.45], RL_WIDE=[0.6,1.8], RL_COL=0.6, RL_HGT=[0.6,1.6];
const LB_STEP=10, LB_ROUND=0.8, RL_ROW=0.8, RL_FLOOR=0.15, RL_TIGHT=1.4, RL_CLEAR=0.5, RL_DUPX=0.6; /* a drawn grid lands on round pixels (v390) */
function labelRunsOf(gy,labels,uni){ /* the picture's own rows of characters, and the runs of each row, in the grey copy's pixels */
  const {g,W,Hh}=gy, med=a=>{ const t=a.slice().sort((x,y)=>x-y); return t[t.length>>1]||0.05; };
  const bw=med(labels.map(l=>l.box[2]-l.box[0])), bh=med(labels.map(l=>l.box[3]-l.box[1]));
  /* the model's box is the panel: a lattice over the whole photo would read the drum and the wall too (v386) */
  const U=uni?{x0:Math.max(0,uni[0]-bw),y0:Math.max(0,uni[1]-bh),x1:Math.min(1,uni[2]+bw),y1:Math.min(1,uni[3]+bh)}:{x0:0,y0:0,x1:1,y1:1};
  const uw=Math.max(bw,U.x1-U.x0), uh=Math.max(bh,U.y1-U.y0);
  const NX=Math.max(1,Math.round(uw/Math.max(0.01,bw*RL_STEP))), NY=Math.max(1,Math.round(uh/Math.max(0.01,bh*RL_STEP))), all=[];
  for(let j=0;j<NY;j++) for(let i=0;i<NX;i++){ const cx=U.x0+uw*(i+0.5)/NX, cy=U.y0+uh*(j+0.5)/NY;
    let sc=null; try{ sc=labelScan(gy,{x0:Math.max(0,cx-bw/2),y0:Math.max(0,cy-bh/2),x1:Math.min(1,cx+bw/2),y1:Math.min(1,cy+bh/2)},null,true); }catch(e){ sc=null; }
    if(sc) for(const r of sc.spots) if(r.y0>=U.y0*Hh&&r.y1<=U.y1*Hh) all.push(r); }
  if(!all.length) return {bands:0,runs:[]};
  all.sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1)); /* the rows most of the probes agree on */
  const bandsY=[];
  for(const r of all){ const p=bandsY[bandsY.length-1], h=r.y1-r.y0;
    if(p&&Math.min(p.y1,r.y1)-Math.max(p.y0,r.y0)>=0.7*Math.min(p.y1-p.y0,h)&&Math.abs((p.y1-p.y0)-h)<=0.5*h){
      p.y0=Math.round((p.y0*p.n+r.y0)/(p.n+1)); p.y1=Math.round((p.y1*p.n+r.y1)/(p.n+1)); p.n++; }
    else bandsY.push({y0:r.y0,y1:r.y1,n:1}); }
  const bands=bandsY.filter(b=>b.n>=RL_SUP&&b.y1-b.y0>=8);
  const runs=[], UX0=Math.round(U.x0*W), UX1=Math.round(U.x1*W);
  for(const bd of bands){ const h=bd.y1-bd.y0, on=new Uint8Array(W); /* one column profile per row, cut in tiles so an unevenly lit panel keeps its dim half */
    for(let ti=0;ti<RL_TILES;ti++){ const x0=UX0+Math.round((UX1-UX0)*ti/RL_TILES), x1=UX0+Math.round((UX1-UX0)*(ti+1)/RL_TILES); if(x1<=x0) continue;
      const hr=new Uint32Array(256); let n=0;
      for(let y=Math.max(0,bd.y0-h);y<Math.min(Hh,bd.y1+h);y++) for(let x=x0;x<x1;x++){ hr[g[y*W+x]]++; n++; }
      if(!n) continue; const thr=otsuThr(hr,n); let dk=0; for(let v=0;v<=thr;v++) dk+=hr[v];
      const share=Math.min(dk,n-dk)/n; if(share<LB_INK0||share>LB_INK1) continue; const inkDark=dk*2<n;
      const need=Math.max(2,0.15*h);
      for(let x=x0;x<x1;x++){ let c=0; for(let y=bd.y0;y<bd.y1;y++){ const v=g[y*W+x]; if(inkDark?v<=thr:v>thr) c++; } if(c>=need) on[x]=1; } }
    const gap=Math.max(3,Math.round(RL_GAP*h));
    for(let x=UX0,st=-1,off=0;x<=UX1;x++){ if(x<UX1&&on[x]){ if(st<0) st=x; off=0; }
      else if(st>=0){ off++; if(x===UX1||off>gap){ const w=x-off+1-st; if(w>=RL_WMIN*h&&w<=RL_WMAX*h) runs.push({x0:st,y0:bd.y0,x1:x-off+1,y1:bd.y1,n:bd.n}); st=-1; off=0; } } } }
  const iou=(a,b)=>{ const x0=Math.max(a.x0,b.x0),y0=Math.max(a.y0,b.y0),x1=Math.min(a.x1,b.x1),y1=Math.min(a.y1,b.y1);
    if(x1<=x0||y1<=y0) return 0; const i=(x1-x0)*(y1-y0); return i/((a.x1-a.x0)*(a.y1-a.y0)+(b.x1-b.x0)*(b.y1-b.y0)-i); };
  const keep=[]; for(const r of runs){ if(keep.some(o=>iou(o,r)>=RL_DUP)) continue; keep.push(r); } /* the same run of two neighbouring rows is one candidate */
  keep.sort((a,b)=>b.n-a.n);
  return {bands:bands.length,runs:keep.slice(0,RL_CAP)};
}
const lcsLen=(a,b)=>{ let prev=new Uint16Array(b.length+1), cur=new Uint16Array(b.length+1); /* how much of two texts lines up in order */
  for(let i=0;i<a.length;i++){ for(let j=0;j<b.length;j++) cur[j+1]=a[i]===b[j]?prev[j]+1:Math.max(prev[j+1],cur[j]);
    const t=prev; prev=cur; cur=t; cur.fill(0); }
  return prev[b.length]; };
function labelHit(read,zh){ /* a run's reading against one label's text */
  const a=[...read].filter(c=>CJK.test(c)||/[0-9]/.test(c)), b=[...zh].filter(c=>CJK.test(c)||/[0-9]/.test(c));
  if(!a.length||!b.length||Math.abs(a.length-b.length)>1) return 0; /* a fragment, or a run of several labels, is not this label */
  return lcsLen(a,b)/Math.max(a.length,b.length); }
function growRun(r,runs,self){ /* the column cut is the ink's own extent, so it clips the first and last stroke and the
    band is thinner than the characters (v388, H: "still a few missing or unprecise crops"): give the run back a
    quarter of its width sideways and a third of its height up and down, but never more than half the way to its
    neighbour, so a card's picture holds its own label whole and nothing of the next one */
  const h=r.y1-r.y0, w=r.x1-r.x0; let dl=RL_GROW[0]*w, dr=dl, du=RL_GROW[1]*h, dd=du;
  for(const o of runs){ if(o===r||o===self) continue;
    if(Math.min(o.y1,r.y1)-Math.max(o.y0,r.y0)>=0.5*Math.min(h,o.y1-o.y0)){
      if(o.x1<=r.x0) dl=Math.min(dl,(r.x0-o.x1)/2); else if(o.x0>=r.x1) dr=Math.min(dr,(o.x0-r.x1)/2); }
    if(Math.min(o.x1,r.x1)-Math.max(o.x0,r.x0)>=0.5*Math.min(w,o.x1-o.x0)){
      if(o.y1<=r.y0) du=Math.min(du,(r.y0-o.y1)/2); else if(o.y0>=r.y1) dd=Math.min(dd,(o.y0-r.y1)/2); } }
  /* the floor above and below (v391): a panel carries an icon row over its labels and fine print under them, so the
     neighbour bound took the whole vertical room away and the cut ended on the characters' own ink — the strokes the
     column cut clips were sliced off. A sliver of the row above in the picture is nothing; a sliced character is the
     card. Sideways the bound stays: two cards of one row must not overlap. */
  du=Math.max(du,RL_FLOOR*h); dd=Math.max(dd,RL_FLOOR*h);
  return {x0:r.x0-Math.max(0,dl),y0:r.y0-Math.max(0,du),x1:r.x1+Math.max(0,dr),y1:r.y1+Math.max(0,dd)};
}
async function readLabels(bmp,gy,labels,uni,status){ /* one rectangle per label, or null where the reader could not name the run */
  const {runs,bands}=labelRunsOf(gy,labels,uni); if(!runs.length) return {rects:labels.map(()=>null),bands,runs:0,hit:0};
  const kx=bmp.width/gy.W, ky=bmp.height/gy.Hh;
  const got=await runPasses(runs.map(r=>async w=>{ /* the run at the photo's own pixels, with the margin the reader wants */
    const out=[];
    /* the scale is the characters' own height, not the padded crop's — a 41 px label in a 65 px box came out at
       45 px, smaller than it started and 20 px a character, and the reader read nothing (v387) — and the run is the
       ink's own extent, which clips the first and last character a little: the tight room reads a label whose icon
       stands close above it, the loose one a label the column cut trimmed (measured on H's panel: 快速 needs the
       tight room, 云程序 and 筒自洁 the loose one) */
    const k=Math.max(1,Math.min(4,RL_PX/((r.y1-r.y0)*ky)));
    for(const f of RL_ROOM){
      const room=f*(r.y1-r.y0);
      const x0=Math.max(0,Math.round((r.x0-room)*kx)), y0=Math.max(0,Math.round((r.y0-room)*ky));
      const x1=Math.min(bmp.width,Math.round((r.x1+room)*kx)), y1=Math.min(bmp.height,Math.round((r.y1+room)*ky));
      const bw=x1-x0, bh=y1-y0; if(bw<4||bh<4) continue;
      const cv=document.createElement("canvas");
      cv.width=Math.max(1,Math.round(bw*k)); cv.height=Math.max(1,Math.round(bh*k)); if(cv.width<8||cv.height<8) continue;
      cv.getContext("2d",{alpha:false}).drawImage(bmp,x0,y0,bw,bh,0,0,cv.width,cv.height);
      for(const mode of ["colour","bw"]){ /* a panel is lit unevenly: the colour copy reads its bright half, the black-and-white one its dim half */
        let jb=null;
        if(mode==="bw"){ const sb=await createImageBitmap(cv); try{ jb=await toBW(sb,1); }catch(e){ jb=null; } sb.close(); }
        else jb=await new Promise(res=>cv.toBlob(res,"image/jpeg",READ_JPEG));
        if(!jb) continue;
        try{ const ls=await readPass(w,jb,()=>{}); out.push(ls.map(l=>l.t).join("")); }catch(e){}
      }
    }
    return out; }),status);
  const nCJK=t=>[...t].filter(c=>CJK.test(c)||/[0-9]/.test(c)).length;
  const score=(i,j)=>Math.max(0,...(got[i]||[]).map(rd=>labelHit(rd,labels[j].zh)));
  const pairs=[]; /* every run against every label, the surest pairing first; each run and each label used once */
  for(let i=0;i<runs.length;i++) for(let j=0;j<labels.length;j++){ const v=score(i,j); if(v>=RL_HIT) pairs.push([v,i,j]); }
  pairs.sort((a,b)=>b[0]-a[0]);
  const ur=new Set(), rects=labels.map(()=>null), pick=labels.map(()=>-1), read=labels.map(()=>""); let hit=0;
  for(const [,i,j] of pairs){ if(ur.has(i)||pick[j]>=0) continue; ur.add(i); pick[j]=i; hit++;
    read[j]=(got[i]||[]).map(rd=>[labelHit(rd,labels[j].zh),rd]).sort((a,b)=>b[0]-a[0])[0][1]||""; }
  /* a placement that breaks its row is dropped (v390, H's washing machine at v389: 智洗烘 took a run in the panel's left
     block and 时间 one at its far left — both read well enough to win the greedy pairing, both a whole row away from the
     labels they stand beside). The model's rows are reliable (v376's finding), so the runs of one answer row must share a
     band: the median centre of the row's placed runs decides, and a run further than RL_ROW of a run height from it is not
     this label's. A row of two that disagrees loses both — with two runs and no majority there is nothing to trust. */
  const rowsAll=labelRows(labels);
  for(const rw of rowsAll){
    const ps=rw.at.filter(j=>pick[j]>=0); if(ps.length<2) continue;
    const cy=ps.map(j=>(runs[pick[j]].y0+runs[pick[j]].y1)/2), h=median(ps.map(j=>runs[pick[j]].y1-runs[pick[j]].y0))||1, mid0=median(cy);
    ps.forEach((j,k)=>{ if(Math.abs(cy[k]-mid0)<=RL_ROW*h) return; ur.delete(pick[j]); pick[j]=-1; read[j]=""; hit--; });
  }
  /* a label only half read takes the run its row's order gives it (v388): the model's reading order and row topology
     are reliable (v376's finding) while its coordinates are not, so a run that reads as half of a label's characters
     is that label when it stands in the label's own row and between the labels the reader did name — 袜子 read as
     计子 and 下筒 as 下简 on H's panel, each with one run and one place they can go. */
  const rows=labelRows(labels), rowOf=new Map(); rows.forEach((rw,ri)=>rw.at.forEach(j=>rowOf.set(j,ri)));
  const band=rows.map(rw=>{ const rs=rw.at.filter(j=>pick[j]>=0).map(j=>runs[pick[j]]);
    return rs.length?{y0:Math.min(...rs.map(r=>r.y0)),y1:Math.max(...rs.map(r=>r.y1))}:null; });
  const mid=r=>(r.x0+r.x1)/2, weak=[]; let filled=0;
  for(let i=0;i<runs.length;i++) for(let j=0;j<labels.length;j++){ if(pick[j]>=0) continue;
    const v=score(i,j); if(v>=RL_WEAK&&v<RL_HIT) weak.push([v,i,j]); }
  weak.sort((a,b)=>b[0]-a[0]);
  const perChar=rows.map(rw=>{ const v=rw.at.filter(j=>pick[j]>=0).map(j=>{ const n=nCJK(labels[j].zh); return n?(runs[pick[j]].x1-runs[pick[j]].x0)/n:0; })
    .filter(x=>x>0).sort((a,b)=>a-b); return v[v.length>>1]||0; });
  for(const [,i,j] of weak){ if(ur.has(i)||pick[j]>=0) continue;
    const bd=band[rowOf.get(j)], r=runs[i]; if(!bd) continue;
    const pw=perChar[rowOf.get(j)], cw=(r.x1-r.x0)/Math.max(1,nCJK(labels[j].zh)); /* a run far wider than the row's characters holds more than this label */
    if(pw&&(cw<RL_WIDE[0]*pw||cw>RL_WIDE[1]*pw)) continue;
    if(Math.min(bd.y1,r.y1)-Math.max(bd.y0,r.y0)<0.5*Math.min(bd.y1-bd.y0,r.y1-r.y0)) continue;
    const at=rows[rowOf.get(j)].at, k=at.indexOf(j);
    if(!at.every((o,t)=>o===j||pick[o]<0||(t<k?mid(runs[pick[o]])<mid(r):mid(runs[pick[o]])>mid(r)))) continue;
    ur.add(i); pick[j]=i; filled++;
    read[j]=(got[i]||[]).map(rd=>[labelHit(rd,labels[j].zh),rd]).sort((a,b)=>b[0]-a[0])[0][1]||""; }
  /* a label the reader could not read at all takes the run its row's order gives it (v389, H's washing machine at v388:
     袜子, 洗衣液, 柔顺剂 and +烘干 are the panel's dimmest labels and read as nothing from a perfect crop, but each stands
     in a row whose other labels the reader named). Only where the order is unambiguous: exactly as many free runs between
     two placed labels as there are labels to put between them, each of the row's own height and width per character, and
     each standing in a column another placed label established (the panel's buttons line up; a stray run in the dial or at
     the picture's edge does not). Anything short of that keeps the whole picture — a card showing the neighbour's button is
     worse than a card showing the panel. */
  const placedRuns=labels.map((l,j)=>pick[j]>=0?runs[pick[j]]:null).filter(Boolean); let ordered=0;
  if(placedRuns.length>=2){
    const cols=placedRuns.map(mid), medW=median(placedRuns.map(r=>r.x1-r.x0))||1;
    rows.forEach((rw,ri)=>{
      const at=rw.at, ps=at.filter(j=>pick[j]>=0), bd=band[ri];
      if(!bd||!ps.length||ps.length===at.length) return;
      const rh=median(ps.map(j=>runs[pick[j]].y1-runs[pick[j]].y0))||1;
      const pw=median(ps.map(j=>{ const n=nCJK(labels[j].zh); return n?(runs[pick[j]].x1-runs[pick[j]].x0)/n:0; }).filter(v=>v>0))||0;
      const cand=runs.map((r,i)=>({r,i})).filter(({r,i})=>!ur.has(i)
        &&Math.min(bd.y1,r.y1)-Math.max(bd.y0,r.y0)>=0.5*Math.min(bd.y1-bd.y0,r.y1-r.y0)
        &&r.y1-r.y0>=RL_HGT[0]*rh&&r.y1-r.y0<=RL_HGT[1]*rh
        &&cols.some(c=>Math.abs(mid(r)-c)<=RL_COL*medW)).sort((a,b)=>mid(a.r)-mid(b.r));
      for(let k=0;k<at.length;){
        if(pick[at[k]]>=0){ k++; continue; }
        let e=k; while(e<at.length&&pick[at[e]]<0) e++;
        const gap=at.slice(k,e), L=k>0?runs[pick[at[k-1]]]:null, R=e<at.length?runs[pick[at[e]]]:null;
        const free=cand.filter(({i,r})=>!ur.has(i)&&(!L||mid(r)>L.x1)&&(!R||mid(r)<R.x0));
        /* as many free runs as labels was the rule until v391, and on a photo whose search finds twice as many runs it
           never holds — H's panel at v390 found 166 runs where it had found 90, and not one of its four unread labels
           was placed. First the same characters stand in several of the picture's bands when the lattice is fine, so
           one label's column offers three candidates that are one run seen three times: the free candidates covering
           the same columns are collapsed into one, the one whose height is nearest the row's own. */
        const groups=[];
        for(const f of free.slice().sort((a,b)=>mid(a.r)-mid(b.r))){
          const g=groups.find(g0=>{ const o=g0[0].r; return Math.min(o.x1,f.r.x1)-Math.max(o.x0,f.r.x0)>=RL_DUPX*Math.min(o.x1-o.x0,f.r.x1-f.r.x0); });
          if(g) g.push(f); else groups.push([f]); }
        const one=groups.map(g=>g.slice().sort((a,b)=>Math.abs((a.r.y1-a.r.y0)-rh)-Math.abs((b.r.y1-b.r.y0)-rh))[0]);
        /* then the columns decide: the runs nearest the columns the placed labels established are this gap's, and they
           count only when the next candidate stands clearly further out (RL_CLEAR of a run's width), so an ambiguous
           row still keeps the whole picture rather than risk a neighbour's button */
        let chosen=null;
        if((L||R)&&one.length>=gap.length&&gap.length){
          const dist=r=>Math.min(...cols.map(c=>Math.abs(mid(r)-c)));
          const rank=one.slice().sort((a,b)=>dist(a.r)-dist(b.r)), take=rank.slice(0,gap.length);
          if(one.length===gap.length||dist(rank[gap.length].r)>=dist(take[take.length-1].r)+RL_CLEAR*medW){
            const sel=take.slice().sort((a,b)=>mid(a.r)-mid(b.r));
            if(gap.every((j,t)=>{ const w=(sel[t].r.x1-sel[t].r.x0)/Math.max(1,nCJK(labels[j].zh)); return !pw||(w>=RL_WIDE[0]*pw&&w<=RL_WIDE[1]*pw); })) chosen=sel; } }
        if(chosen) chosen.forEach(({r,i},t)=>{ ur.add(i); pick[gap[t]]=i; ordered++; });
        k=e;
      }
    });
  }
  /* every card of a row is cut at its row's own band (v391, H at v390: "Paar sachen abgeschnitten" — 单脱水's run had
     taken the icon row above its characters and read the label all the same, since the reader's margin pulls the
     characters into the crop, so the card showed the icon with the character tops sliced; others had swallowed that row
     and stood three times as tall as their neighbours). The x stays the label's own run, which the reader measured; the
     y becomes the row's own. The row's band cannot be the average of its runs — on this panel half of them merged the
     icon row into their band —, so it is the tightest quarter's height (a run that took a neighbouring row in is two or
     three times as tall) around the centre those tight runs share. A run displaced onto the row above, or one that
     swallowed it, is then cut where its row's characters stand, and the cards of one row are of one height. The x is
     never touched, so a card still cannot carry a neighbour's button. */
  const cut=labels.map((l,j)=>pick[j]>=0?runs[pick[j]]:null);
  for(const rw of rowsAll){
    const ps=rw.at.filter(j=>pick[j]>=0); if(ps.length<2) continue;
    const q=(a,f)=>{ const t=a.slice().sort((p,r)=>p-r); return t[Math.max(0,Math.min(t.length-1,Math.round(f*(t.length-1))))]; };
    const hq=q(ps.map(j=>runs[pick[j]].y1-runs[pick[j]].y0),0.25); if(hq<4) continue; /* the row's own character height: the tightest quarter of its runs, since a run that swallowed the icon row above is twice as tall */
    const tight=ps.filter(j=>runs[pick[j]].y1-runs[pick[j]].y0<=RL_TIGHT*hq);
    const cy=median(tight.map(j=>(runs[pick[j]].y0+runs[pick[j]].y1)/2)); if(!(cy>0)) continue;
    const y0=Math.round(cy-hq/2), y1=Math.round(cy+hq/2);
    ps.forEach(j=>{ const r=runs[pick[j]]; cut[j]={x0:r.x0,y0,x1:r.x1,y1}; });
  }
  labels.forEach((l,j)=>{ if(pick[j]<0) return; const g=growRun(cut[j],runs,runs[pick[j]]);
    rects[j]={x0:g.x0/gy.W,y0:g.y0/gy.Hh,x1:g.x1/gy.W,y1:g.y1/gy.Hh,read:read[j]}; });
  return {rects,bands,runs:runs.length,hit,filled,ordered};
}
function snapBox(bmp,box,n,lens,skip){ /* lens: the answer's lines' character counts (v305); skip: the fine print's boxes as fractions (v328) — a blob whose centre lies in one is not the text */
  const k=Math.min(1,800/Math.max(bmp.width,bmp.height)), W=Math.max(1,Math.round(bmp.width*k)), Hh=Math.max(1,Math.round(bmp.height*k));
  const cv=document.createElement("canvas"); cv.width=W; cv.height=Hh; const ctx=cv.getContext("2d",{alpha:false,willReadFrequently:true}); ctx.drawImage(bmp,0,0,W,Hh);
  const d=ctx.getImageData(0,0,W,Hh).data, g=new Uint8Array(W*Hh); for(let i=0,j=0;i<d.length;i+=4,j++) g[j]=(d[i]*77+d[i+1]*151+d[i+2]*28)>>8;
  const cl=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  const B={x0:cl(Math.round(box.x0*k),0,W-2),y0:cl(Math.round(box.y0*k),0,Hh-2)}; B.x1=cl(Math.round(box.x1*k),B.x0+2,W); B.y1=cl(Math.round(box.y1*k),B.y0+2,Hh);
  const Hb=(B.y1-B.y0)/Math.max(1,n); if(Hb<8) return null;
  const hist=new Uint32Array(256); for(let y=B.y0;y<B.y1;y++) for(let x=B.x0;x<B.x1;x++) hist[g[y*W+x]]++;
  const thr=otsuThr(hist,(B.x1-B.x0)*(B.y1-B.y0));
  const room=Math.round(SNAP_ROOM*Hb), R={x0:Math.max(0,B.x0-room),y0:Math.max(0,B.y0-room),x1:Math.min(W,B.x1+room),y1:Math.min(Hh,B.y1+room)}, rw=R.x1-R.x0, rh=R.y1-R.y0;
  const bin=new Uint8Array(rw*rh); for(let y=0;y<rh;y++) for(let x=0;x<rw;x++) bin[y*rw+x]=g[(R.y0+y)*W+R.x0+x]>thr?1:0;
  /* the coloured ink as a third candidate (v347, H's Nongfu Spring vending machine: the red text stands on bright glass, so under the one grey cut the four characters were one blob fused with the dark panel behind while the glass showing between the strokes became small blobs that won the area count — the snap took the holes for the characters and its union ended inside 泉): each pixel's chromaticity against the median inside the box, Otsu on the distance — the reader's own copy for text on colour (v95, chromaCanvas) */
  const chroma=(()=>{ const hr=new Uint32Array(256), hg=new Uint32Array(256); let tot=0;
    for(let y=B.y0;y<B.y1;y++) for(let x=B.x0;x<B.x1;x++){ const i=4*(y*W+x), sm=d[i]+d[i+1]+d[i+2]||1; hr[(d[i]*255/sm)|0]++; hg[(d[i+1]*255/sm)|0]++; tot++; }
    const med=h=>{ let a=0; for(let v=0;v<256;v++){ a+=h[v]; if(a*2>=tot) return v; } return 128; }, mr=med(hr), mg=med(hg);
    const dist=new Uint8Array(rw*rh);
    for(let y=0;y<rh;y++) for(let x=0;x<rw;x++){ const i=4*((R.y0+y)*W+R.x0+x), sm=d[i]+d[i+1]+d[i+2]||1; dist[y*rw+x]=Math.min(255,Math.round(2*(Math.abs(d[i]*255/sm-mr)+Math.abs(d[i+1]*255/sm-mg)))); }
    const hd=new Uint32Array(256); for(let y=B.y0-R.y0;y<B.y1-R.y0;y++) for(let x=B.x0-R.x0;x<B.x1-R.x0;x++) hd[dist[y*rw+x]]++;
    const tc2=otsuThr(hd,(B.x1-B.x0)*(B.y1-B.y0)), out=new Uint8Array(rw*rh); let ink=0;
    for(let i=0;i<out.length;i++){ out[i]=dist[i]>tc2?1:0; if(out[i]) ink++; }
    return ink>0.02*rw*rh&&ink<0.6*rw*rh?out:null; })(); /* nothing to separate on a grey photo: no third candidate */
  const e0=Math.max(0,Math.min(3,Math.round(Hb/60))); /* eroded by a few pixels too, so a reflection or a thin bridge does not fuse a character with the poster's border (H's 邪: its 牙 hung on the white border); the blobs are grown back by the same amount */
  const lab=new Uint8Array(rw*rh), stack=new Int32Array(rw*rh); const comps=[[],[],[]], fused=[[],[],[]], bars=[[],[],[]], masks=[null,null,null]; /* the blobs of each colour: [dark, light]; fused = the blobs cut by the widened box's edge that hold too little ink to count, for the column pass below (v303) */
  const bw=B.x1-B.x0, bh=B.y1-B.y0;
  const cands=chroma?[0,1,2]:[0,1];
  for(const [c,e] of e0?[...cands.map(c=>[c,0]),...cands.map(c=>[c,e0])]:cands.map(c=>[c,0])){ /* each colour as it is and eroded: the eroded pass frees a character from a bridge, the plain pass keeps the small lines whose strokes the erosion takes away (姜文电影 over the title) */
    let m=new Uint8Array(rw*rh); if(c===2) m.set(chroma); else for(let i=0;i<m.length;i++) m[i]=bin[i]===c?1:0;
    for(let ei=0;ei<e;ei++){ const m2=new Uint8Array(rw*rh); for(let y=1;y<rh-1;y++) for(let x=1;x<rw-1;x++){ const i=y*rw+x; if(m[i]&&m[i-1]&&m[i+1]&&m[i-rw]&&m[i+rw]) m2[i]=1; } m=m2; }
    if(!e) masks[c]=m; lab.fill(0);
    for(let s0=0;s0<rw*rh;s0++){ if(lab[s0]||!m[s0]) continue;
      let top=0, area=0, mnx=rw, mxx=-1, mny=rh, mxy=-1, iarea=0, inx=rw, ixx=-1, iny=rh, ixy=-1; stack[top++]=s0; lab[s0]=1;
      while(top){ const i=stack[--top], x=i%rw, y=(i-x)/rw; area++; if(x<mnx) mnx=x; if(x>mxx) mxx=x; if(y<mny) mny=y; if(y>mxy) mxy=y;
        const X=R.x0+x, Y=R.y0+y; if(X>=B.x0&&X<B.x1&&Y>=B.y0&&Y<B.y1){ iarea++; if(x<inx) inx=x; if(x>ixx) ixx=x; if(y<iny) iny=y; if(y>ixy) ixy=y; } /* the part inside the AI's box */
        if(x>0&&!lab[i-1]&&m[i-1]){ lab[i-1]=1; stack[top++]=i-1; } if(x<rw-1&&!lab[i+1]&&m[i+1]){ lab[i+1]=1; stack[top++]=i+1; }
        if(y>0&&!lab[i-rw]&&m[i-rw]){ lab[i-rw]=1; stack[top++]=i-rw; } if(y<rh-1&&!lab[i+rw]&&m[i+rw]){ lab[i+rw]=1; stack[top++]=i+rw; } }
      mnx-=e; mny-=e; mxx+=e; mxy+=e; inx-=e; iny-=e; ixx+=e; ixy+=e; const h=mxy-mny+1, w=mxx-mnx+1, ih=ixy-iny+1, iw=ixx-inx+1; /* grown back */
      const clean=mnx>0&&mny>0&&mxx<rw-1&&mxy<rh-1&&(h<=SNAP_MAX*bh||(h<=1.25*Hb&&w<=1.5*h))&&w<=SNAP_MAX*bw; /* a character as tall as the AI's box, or a little taller, is still a character (v317, H's coconut-water carton 椰子水: Qwen's box was 26 % of the picture tall and the characters 25 % — over 0.95 of the box —, so the tall strokes of 椰, 子 and 水 fell out, the short pieces alone made the box 42–58 % down, and the card cut the characters' tops): up to 1.25 text heights tall and no wider than 1.5 times its height; a ring around the box is wider than that */ /* a blob of a character's kind: whole, not cut by the widened box's edge, smaller than the box — its whole extent counts, and it may join a line sideways; anything else (a title fused with the letters under it that run to the picture's edge, or with a bright robot arm above it) counts with the part inside the box, so it can never fall out and hand the box to the other colour's gaps (v298, H's 流浪地球 twice) */
      if(!clean&&!iarea) continue; /* nothing of it in the AI's box: a reflection above the title, a cheek under it (a clean blob outside the box stays for the sideways pass — the eroded 牙 has no pixel left inside) */
      if(iarea&&iw>=0.9*bw&&ih>=0.9*bh){ if(!e) fused[c].push({seed:s0,x0:R.x0+inx,y0:R.y0+iny,x1:R.x0+ixx+1,y1:R.y0+ixy+1,bg:true}); continue; } /* the background, or a ring around the box: its part inside is the box itself — but the characters at the line's ends may hang on it (v330, H's 邪不压正 taken close: 邪 and 正 both touched the poster's white mat, so mat and both characters were one blob that filled the box, and the snap kept 不压 alone), so it goes to the column pass like a fused blob */
      if(clean?(h<SNAP_MIN*Hb||area<0.01*Hb*Hb):(ih<SNAP_MIN*Hb||iw<SNAP_MIN*Hb||iarea<Hb*Hb||iarea>0.85*iw*ih)){ if(!clean&&!e&&ih>=SNAP_MIN*Hb&&iw>=SNAP_MIN*Hb) fused[c].push({seed:s0,x0:R.x0+inx,y0:R.y0+iny,x1:R.x0+ixx+1,y1:R.y0+ixy+1});
        if(clean&&!e&&iarea&&w>=SNAP_BAR*h&&h>=0.03*Hb&&w<=1.5*Hb) bars[c].push({x0:R.x0+mnx,y0:R.y0+mny,x1:R.x0+mxx+1,y1:R.y0+mxy+1}); /* a bar, too flat to be a character on its own (v376) */
        continue; } /* no character: a speck; of a fused blob the part inside must hold a text height's square of ink and be strokes, not a solid field — under 0.85 filled (v334, H's 绿皮书 at 18°: the poster's pale lower half, fused with the copy's filled corner, was taken by its part inside — 590 × 347 px, solid — and carried the snap to the copy's edge, so the turned frame reached far past the photo) — a title's strokes do, the wedge of the poster's slanted border inside the box (34 × 149 px on 邪不压正) does not; a fused blob of a character's size with less ink waits for the column pass (v303) */
      const bx0=R.x0+mnx, by0=R.y0+mny, bx1=R.x0+mxx+1, by1=R.y0+mxy+1, ix=Math.max(0,Math.min(bx1,B.x1)-Math.max(bx0,B.x0)), iy=Math.max(0,Math.min(by1,B.y1)-Math.max(by0,B.y0)), inside=clean&&ix*iy>=0.5*w*h; /* clipped at zero (v328): a blob beyond the box on both axes had two negative overlaps, whose product counted as inside — a bright clip on the wall above and right of 邪不压正 joined the title */
      comps[c].push(clean?{x0:bx0,y0:by0,x1:bx1,y1:by1,area:iarea,inside,clean}:{x0:R.x0+inx,y0:R.y0+iny,x1:R.x0+ixx+1,y1:R.y0+ixy+1,area:iarea,inside:true,clean,seed:s0,wide:iw>2*Hb}); } } /* seed: a pixel of the blob, for the column pass — the eroded pass's pixel lies in the plain mask too (v334: the pale field under 绿皮书's title survived the plain pass's background rule only in the eroded pass, and a take without a seed could not be read column by column) */ /* inside = counts from the start: a clean blob with at least half of it in the box, by its whole extent (a character the box cuts), a fused blob by its part inside; a clean blob mostly outside keeps its whole extent and waits for the sideways pass */
  /* a character written in horizontal strokes alone is not one blob (v376, H's 三立方咖啡 shop sign: 三 is three bars,
     each a twentieth of the text height, so each fell out as a speck and the snap began at 立 — the card's picture and
     the thumbnail lost the first character). Bars of the same colour standing over one another, within half a text
     height and sharing most of their width, are one character: 三, 二, and the like. One bar alone is not — a rule
     under a line, the edge of a plate, an underline. */
  for(const c of cands){ const bs=bars[c].slice().sort((a,b)=>a.y0-b.y0), used=new Array(bs.length).fill(false);
    for(let i=0;i<bs.length;i++){ if(used[i]) continue; const st=[bs[i]]; used[i]=true;
      for(let j=i+1;j<bs.length;j++){ if(used[j]) continue; const t=st[st.length-1], o=bs[j], ow=Math.min(t.x1,o.x1)-Math.max(t.x0,o.x0);
        if(o.y0-t.y1<=SNAP_STACK*Hb&&o.y0>=t.y0&&ow>=0.6*Math.min(t.x1-t.x0,o.x1-o.x0)){ st.push(o); used[j]=true; } }
      if(st.length<2) continue;
      const x0=Math.min(...st.map(b=>b.x0)), x1=Math.max(...st.map(b=>b.x1)), y0=st[0].y0, y1=st[st.length-1].y1, hh=y1-y0;
      if(hh<SNAP_MIN*Hb||hh>1.25*Hb||x1-x0>1.5*Hb) continue;
      const ix=Math.max(0,Math.min(x1,B.x1)-Math.max(x0,B.x0)), iy=Math.max(0,Math.min(y1,B.y1)-Math.max(y0,B.y0));
      comps[c].push({x0,y0,x1,y1,area:ix*iy,inside:ix*iy>=0.5*(x1-x0)*hh,clean:true}); } }
  for(const c of cands) comps[c]=comps[c].filter(b=>{ if(b.x1-b.x0<=2*Hb) return true; const cs=(c===2?[...comps[0],...comps[1]]:comps[1-c]).filter(o=>o.clean&&o.y1-o.y0>=0.4*Hb&&o.x1-o.x0<=1.3*(o.y1-o.y0)&&o.x1-o.x0>=0.45*(o.y1-o.y0)&&o.x0>=b.x0&&o.x1<=b.x1&&Math.min(o.y1,b.y1)-Math.max(o.y0,b.y0)>=0.5*(o.y1-o.y0)).sort((a,o)=>a.x0-o.x0); let held=0, last=null; for(const o of cs){ if(last&&(o.x0<last.x1||Math.min(o.y1,last.y1)-Math.max(o.y0,last.y0)<0.5*Math.min(o.y1-o.y0,last.y1-last.y0))) continue; held++; last=o; } return held<2; }); /* a plate, not a character (v315, H's parking sign 请您停车入位: the white plate's part inside Qwen's box was 84 % of its width and 78 % of its height — under the background rule's 0.9 — and its area beat the six dark characters, so the plate was the "text", and the light specks on the ground beside it joined it): a blob wider than two text heights that holds a row of two or more character-shaped clean blobs of the other colour — at least 0.4 text heights tall, no wider than 1.3 times their height, within its width and mostly within its rows, side by side without overlap in one band (the plain and the eroded pass see the same gap in 流浪地球's brush title twice — one gap is no row) — is the ground the characters stand on and drops; a character is at least 0.45 as wide as tall since v330 (a row of small characters from 0.2 text heights was tried in v334 for the pale field under 绿皮书's title and dropped: the gaps inside the blocky 邪不压正 and the brush strokes of 流浪地球 made such rows too) (the thin red gaps inside the blocky 压 of H's 邪不压正 counted as a row of characters, and the blob of the mat with 邪 and 正 hung on it was dropped as a plate) */
  if(skip&&skip.length){ const sk=skip.map(b=>({x0:b[0]*W,y0:b[1]*Hh,x1:b[2]*W,y1:b[3]*Hh})); for(const c of cands) comps[c]=comps[c].filter(b=>{ const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2; return !sk.some(o=>cx>=o.x0&&cx<=o.x1&&cy>=o.y0&&cy<=o.y1); }); } /* the fine print the AI left out of the text (v312) is left out of the snap too (v328, H's 邪不压正 from across the room: the box's top edge cut through 姜文电影, whose small characters were half inside and counted) */
  const areaOf=cs=>cs.filter(c=>c.inside).reduce((a,c)=>a+c.area,0); let text=areaOf(comps[1])>areaOf(comps[0])?comps[1]:comps[0];
  /* the coloured ink wins only where the grey cut found no characters at all (v347): its blobs must be several of a character's size and shape, the grey side's under two — on a poster whose title is white on colour the grey side has the characters and nothing changes */
  if(chroma){ const charish=cs=>cs.filter(c=>c.inside&&c.clean&&c.y1-c.y0>=0.5*Hb&&c.y1-c.y0<=1.4*Hb&&c.x1-c.x0<=1.5*(c.y1-c.y0)&&c.x1-c.x0>=0.3*(c.y1-c.y0)).length, nc=charish(comps[2]);
    const cover=cs=>{ const ins=cs.filter(c=>c.inside); if(!ins.length) return 0; const x0=Math.max(B.x0,Math.min(...ins.map(c=>c.x0))), x1=Math.min(B.x1,Math.max(...ins.map(c=>c.x1))), y0=Math.max(B.y0,Math.min(...ins.map(c=>c.y0))), y1=Math.min(B.y1,Math.max(...ins.map(c=>c.y1))); return Math.max(0,x1-x0)*Math.max(0,y1-y0)/(bw*bh); }; /* how much of the AI's box the blobs reach across — the coloured ink must not see less of the text than the grey cut (v347, H's 流浪地球 poster: the brush title is one fused blob under the grey cut, so its characters were left out of the count, while the title's colour alone found pieces and dropped the credits beside it) */
    if(nc>=2&&nc>=charish(text)+2&&cover(comps[2])>=SNAP_REACH*cover(text)) text=comps[2]; } /* the reach guard stands down where the grey cut found no character at all (v349, H's vending machine at v347: "Vending machine works not yet" — the red text fused with the machine's dark panel is no character under the grey cut, and the glass between the strokes reached a little further across the box than the red did, 82 against 77 %, so the switch never fired on the phone; 流浪地球, the case the guard is for, has four grey characters beside its fused title) */
  if(skip&&skip.length){ const tall=text.filter(c=>c.inside&&c.clean), Ht=Math.max(0,...tall.map(c=>c.y1-c.y0)); if(Ht>0){ const big=tall.filter(c=>c.y1-c.y0>=0.6*Ht); for(let i=text.length-1;i>=0;i--){ const c=text[i]; if(!c.inside||c.y1-c.y0>=0.4*Ht) continue; if(!big.some(o=>Math.min(o.y1,c.y1)-Math.max(o.y0,c.y0)>0)) text.splice(i,1); } } } /* the AI's box for the fine print drifts like its box for the text (v328: 姜文电影 boxed a tenth too high, so its box held nothing and its small characters sat half inside the title's box): when the AI left fine print out, a blob under 0.4 of the tallest character that shares no row with a tall one is that fine print, above or below the text, and drops */
  const taken=text.filter(c=>c.inside);
  if(!taken.length) return null;
  for(let grew=true;grew;){ grew=false; /* the line goes on outside the box (the box cut 邪 between 牙 and 阝, and 牙 lay outside it): a clean blob of the text's colour in a taken blob's band, within half a text height sideways, is the line's too — sideways only: under a line the cheeks of the faces would qualify */
    for(const c of text){ if(!c.clean||taken.includes(c)) continue;
      if(taken.some(tb=>Math.min(c.y1,tb.y1)-Math.max(c.y0,tb.y0)>=0.5*Math.min(c.y1-c.y0,tb.y1-tb.y0)&&Math.max(c.x0-tb.x1,tb.x0-c.x1)<=0.5*Hb)){ taken.push(c); grew=true; } } }
  /* a character fused with something that runs to the picture's edge (v303, H's 绿皮书 poster: a reflection streak through the hook of 书 ran to the right edge, so 书 was no blob of its own, held too little ink for the fused rule, and the frame ended after 皮): a fused blob of the text's colour beside a taken blob, in its band, is looked at column by column within that band — a column holding at least SNAP_COL of the band's height in ink is a stroke's, the streak's thin columns are not — and the run of stroke columns nearest the line joins by its own extent (the streak beyond the character stays out) */
  const tc=comps.indexOf(text); /* the mask the column pass reads (v347: 2 = the coloured ink) */
  const tcg=tc<2?tc:(()=>{ let lo=0,hi=0; for(let y=B.y0-R.y0;y<B.y1-R.y0;y++) for(let x=B.x0-R.x0;x<B.x1-R.x0;x++){ const i=y*rw+x; if(chroma[i]){ if(bin[i]) hi++; else lo++; } } return hi>lo?1:0; })(); /* the strip passes cut by grey: the side the coloured ink mostly falls on */
  for(const f of [...fused[tc],...taken.filter(c=>c.wide&&c.seed!==undefined)]){ /* a wide fused take too (v330, H's 邪不压正 taken close: the poster's white mat with 邪 and 正 hung on it and the grey wall beyond was one blob, its part inside the box the whole line, and the take ran from the mat's strip to the box's edge, cutting 正): when clean characters of the line stand inside it, its stroke columns beside them are the characters and the take goes; a fused title alone (v299, 流浪地球) keeps its take */
    const near=taken.filter(tb=>tb!==f&&tb.clean&&Math.min(f.y1,tb.y1)-Math.max(f.y0,tb.y0)>=0.5*Math.min(f.y1-f.y0,tb.y1-tb.y0)&&Math.max(f.x0-tb.x1,tb.x0-f.x1)<=0.5*Hb); if(!near.length) continue;
    const by0=Math.max(0,Math.min(...near.map(tb=>tb.y0))-R.y0), by1=Math.min(rh,Math.max(...near.map(tb=>tb.y1))-R.y0), bh2=by1-by0; if(bh2<8) continue; /* the line's band, in the widened box's coordinates */
    const m=masks[tc], ink=new Int32Array(rw), ymn=new Int32Array(rw).fill(rh), ymx=new Int32Array(rw).fill(-1); lab.fill(0); let top=0; stack[top++]=f.seed; lab[f.seed]=1;
    while(top){ const i=stack[--top], x=i%rw, y=(i-x)/rw; if(y>=by0&&y<by1){ ink[x]++; if(y<ymn[x]) ymn[x]=y; if(y>ymx[x]) ymx[x]=y; }
      if(x>0&&!lab[i-1]&&m[i-1]){ lab[i-1]=1; stack[top++]=i-1; } if(x<rw-1&&!lab[i+1]&&m[i+1]){ lab[i+1]=1; stack[top++]=i+1; }
      if(y>0&&!lab[i-rw]&&m[i-rw]){ lab[i-rw]=1; stack[top++]=i-rw; } if(y<rh-1&&!lab[i+rw]&&m[i+rw]){ lab[i+rw]=1; stack[top++]=i+rw; } }
    const gap=Math.round(0.3*bh2), runs=[]; let run=null, last=-1; /* the runs of stroke columns, a gap of a few blank columns inside a character allowed */
    const reach=Math.round(0.15*bh2), beyond=x=>{ let u=by0-1; while(u>=0&&by0-1-u<=reach&&lab[u*rw+x]) u--; if(by0-1-u>reach) return true; let d=by1; while(d<rh&&d-by1<=reach&&lab[d*rw+x]) d++; return d-by1>reach; }; /* the blob's ink joined to the band in this column runs on further than a quarter of the band above or below it (v330: the ink of the blob elsewhere in the column no longer counts — the wall above the poster and the faces below it belong to the same blob as the mat with 邪 and 正 hung on it, and no column of the characters was free of them; the mat's own columns still run the whole height) */
    for(let x=0;x<rw;x++){ if(ink[x]<SNAP_COL*bh2||beyond(x)) continue; /* a stroke's column: enough ink in the band, and the ink joined to it ends near the band — the white mat beside 邪不压正 runs the whole height, a character stays in its line */ if(run&&x-last<=gap){ run.x1=x; run.y0=Math.min(run.y0,ymn[x]); run.y1=Math.max(run.y1,ymx[x]); } else { run={x0:x,x1:x,y0:ymn[x],y1:ymx[x]}; runs.push(run); } last=x; }
    const cands=runs.filter(r=>r.x1-r.x0+1>=SNAP_MIN*bh2); /* every run of stroke columns within half a text height of the line joins, and the line grows with each (v330: the mat's blob carries 邪 at the line's left end and 正 at its right — until v329 only the run nearest the line's nearest blob joined) */
    const wideTake=f.wide?taken.filter(c=>!c.clean&&Math.min(c.x1,f.x1)-Math.max(c.x0,f.x0)>=0.9*(f.x1-f.x0)&&Math.min(c.y1,f.y1)-Math.max(c.y0,f.y0)>=0.9*(f.y1-f.y0)):[]; /* the wide take itself and its eroded twin, dropped once a stroke run stands in for it */
    const joined=[]; for(let grew=true;grew;){ grew=false; for(const r of cands){ if(r.taken) continue; const rx0=R.x0+r.x0, rx1=R.x0+r.x1+1;
      if(taken.some(tb=>!wideTake.includes(tb)&&Math.min(R.y0+r.y1+1,tb.y1)-Math.max(R.y0+r.y0,tb.y0)>=0.5*Math.min(r.y1-r.y0+1,tb.y1-tb.y0)&&Math.max(rx0-tb.x1,tb.x0-rx1)<=0.5*Hb)){ r.taken=true; const t={x0:rx0,y0:R.y0+r.y0,x1:rx1,y1:R.y0+r.y1+1,area:0,inside:true,clean:false}; taken.push(t); joined.push(t); grew=true; } } }
    if(joined.length||(f.wide&&f.seed!==undefined)) for(const w of wideTake){ const i=taken.indexOf(w); if(i>=0) taken.splice(i,1); } } /* a wide take that stands beside clean characters of its line and holds no stroke column of that line is not the line's (v334, H's 绿皮书 at 18°: the poster's pale lower half, fused with the copy's filled corner and taken by its part inside — 590 × 347 px, the whole box's width —, carried the snap to the copy's edge, so the turned frame reached far past the photo); a fused title alone, without clean neighbours, keeps its take (v299) */
  /* a line may not be much wider than its characters allow (v305, H's 业主直租 sign: Qwen's box ran over the QR code beside the text, whose bottom finder square is a dark blob of a character's size in the line's band, and the frame took half the code — "Das ginge schon noch zentrierter"): the taken blobs are grouped into line bands by vertical overlap; a band whose blobs span more than SNAP_WIDE times the count of its answer line times its tallest blob (the bands matched to the lines by order when the counts agree, else the longest line for every band) is cut at gaps wider than SNAP_GAP text heights into runs, and the run with the most blob area keeps its neighbours only while the width stays within that budget — the rest is not the line's */
  const lns=(lens&&lens.length?lens:[n]).map(v=>Math.max(1,v|0)), kmax=Math.max(...lns);
  const trim=()=>{ const bands=[]; for(const c of [...taken].sort((a,b)=>a.y0-b.y0)){ const b=bands.find(b=>Math.min(c.y1,b.y1)-Math.max(c.y0,b.y0)>=0.5*Math.min(c.y1-c.y0,b.y1-b.y0)); if(b){ b.cs.push(c); b.y0=Math.min(b.y0,c.y0); b.y1=Math.max(b.y1,c.y1); } else bands.push({y0:c.y0,y1:c.y1,cs:[c]}); } bands.sort((a,b)=>a.y0-b.y0);
  bands.forEach((b,i)=>{ const k=bands.length===lns.length?lns[i]:kmax, Hl=Math.max(...b.cs.map(c=>c.y1-c.y0)), budget=k*Hl*SNAP_WIDE, cs=b.cs.slice().sort((a,c)=>a.x0-c.x0);
    if(Math.max(...cs.map(c=>c.x1))-cs[0].x0<=budget) return;
    const runs=[]; let run=null, xe=-1; for(const c of cs){ if(run&&c.x0-xe<SNAP_GAP*Hl) run.cs.push(c); else { run={cs:[c]}; runs.push(run); } xe=Math.max(xe,c.x1); }
    if(runs.length<2) return;
    for(const r of runs){ r.x0=Math.min(...r.cs.map(c=>c.x0)); r.x1=Math.max(...r.cs.map(c=>c.x1)); r.size=r.cs.reduce((a,c)=>a+(c.x1-c.x0)*(c.y1-c.y0),0); }
    let lo=runs.indexOf(runs.reduce((a,r)=>r.size>a.size?r:a)), hi=lo;
    for(;;){ const left=lo>0&&runs[hi].x1-runs[lo-1].x0<=budget, right=hi<runs.length-1&&runs[hi+1].x1-runs[lo].x0<=budget; if(left&&(!right||runs[lo-1].size>=runs[hi+1].size)) lo--; else if(right) hi++; else break; }
    for(const r of runs.filter((r,j)=>j<lo||j>hi)) for(const c of r.cs){ const j=taken.indexOf(c); if(j>=0) taken.splice(j,1); } }); };
  trim(); if(!taken.length) return null;
  /* a character in shadow beside the line (v306, H's 邪不压正 photographed with the lamp on its right: the left of the poster lay in shadow, 邪 fell under the one cut set over the bright title and was no blob at all, so neither the sideways nor the column pass could reach it — the true cause behind v300's "牙 hung on the mat"): from each end of the line, a strip of 1.5 text heights beyond the union is cut by its own Otsu, and a clean blob of the text's colour in it — not touching the strip's outer edge, of a character's size against the end blob, within half a text height of the union — joins by its extent; up to three characters a side */
  for(const side of [-1,1]) for(let it=0;it<3;it++){
    const U0={x0:Math.min(...taken.map(c=>c.x0)),x1:Math.max(...taken.map(c=>c.x1))}, near0=0.05*(U0.x1-U0.x0), tb=taken.filter(c=>side<0?c.x0<=U0.x0+near0:c.x1>=U0.x1-near0).reduce((a,c)=>(c.y1-c.y0)>(a.y1-a.y0)?c:a), Hl=tb.y1-tb.y0, edge=side<0?U0.x0:U0.x1; /* the tallest blob at the end — the title's character, not the letter under it */
    const sx0=side<0?Math.max(0,Math.round(edge-1.5*Hl)):edge, sx1=side<0?edge:Math.min(W,Math.round(edge+1.5*Hl)), sy0=Math.max(0,Math.round(tb.y0-0.35*Hl)), sy1=Math.min(Hh,Math.round(tb.y1+0.35*Hl)), sw=sx1-sx0, sh=sy1-sy0; /* 0.35 text heights of room above and below since v328 (a tenth until v327): a band that runs through the strip — the poster's cream mat with the wall beside it, cut light against the red — shows its true height and falls to the height rule below, where the tenth of room had clipped it to a character's height */
    if(sw<0.5*Hl||sh<8) break;
    const h2=new Uint32Array(256); for(let y=sy0;y<sy1;y++) for(let x=sx0;x<sx1;x++) h2[g[y*W+x]]++;
    const cut=otsuThr(h2,sw*sh), sm=new Uint8Array(sw*sh); for(let y=0;y<sh;y++) for(let x=0;x<sw;x++) sm[y*sw+x]=(g[(sy0+y)*W+sx0+x]>cut?1:0)===tcg?1:0;
    const sl=new Int32Array(sw*sh), sst=new Int32Array(sw*sh); let pick=null, nb=0;
    for(let s0=0;s0<sw*sh;s0++){ if(sl[s0]||!sm[s0]) continue; const id=++nb; let top=0, mnx=sw, mxx=-1, mny=sh, mxy=-1, px=0; sst[top++]=s0; sl[s0]=id;
      while(top){ const i=sst[--top], x=i%sw, y=(i-x)/sw; px++; if(x<mnx) mnx=x; if(x>mxx) mxx=x; if(y<mny) mny=y; if(y>mxy) mxy=y;
        if(x>0&&!sl[i-1]&&sm[i-1]){ sl[i-1]=id; sst[top++]=i-1; } if(x<sw-1&&!sl[i+1]&&sm[i+1]){ sl[i+1]=id; sst[top++]=i+1; }
        if(y>0&&!sl[i-sw]&&sm[i-sw]){ sl[i-sw]=id; sst[top++]=i-sw; } if(y<sh-1&&!sl[i+sw]&&sm[i+sw]){ sl[i+sw]=id; sst[top++]=i+sw; } }
      const h=mxy-mny+1, w=mxx-mnx+1, outer=side<0?mnx===0:mxx===sw-1;
      let runs=0, rows=0; for(let y=mny;y<=mxy;y++){ let r=0; for(let x=mnx;x<=mxx;x++) if(sl[y*sw+x]===id&&(x===mnx||sl[y*sw+x-1]!==id)) r++; if(r){ runs+=r; rows++; } } /* strokes across: a character's rows hold several runs, a wall or a bar one */
      if(outer||h<0.3*Hl||h>1.35*Hl||w<0.3*Hl||w>1.3*Hl||px>0.85*w*h||runs<1.6*rows) continue; /* h>1.35 Hl (v328): taller than the line's characters is the mat, the wall or a border — measured in the taller strip */ /* the strip is the line's own band, so a character may touch its top or bottom; a thin bar (the mat's border), a wide one (an underline) and a solid block (the wall beside the poster, cut light against the red — one run per row) are no character */
      const bx0=sx0+mnx, bx1=sx0+mxx+1, by0=sy0+mny, by1=sy0+mxy+1, gap=side<0?edge-bx1:bx0-edge; if(gap>0.5*Hl||Math.min(by1,tb.y1)-Math.max(by0,tb.y0)<0.5*Math.min(h,Hl)) continue;
      if(!pick||gap<pick.gap) pick={x0:bx0,y0:by0,x1:bx1,y1:by1,gap}; }
    if(!pick) break; taken.push({x0:pick.x0,y0:pick.y0,x1:pick.x1,y1:pick.y1,area:0,inside:true,clean:true}); }
  trim(); if(!taken.length) return null;
  /* a line just beyond the taken ones (v324, H's Nongfu Spring label at v323: Qwen read 农夫山泉 and 饮用天然水 净含量380ml, but its box for the second line sat where NONGFU SPRING is, so the snap ended at the Latin line and the frame cut the Chinese line in half — "only translate what is also shown in the thumbnail and in the learning card"): when the AI read two lines or more, the strip of 1.2 text heights below the union (and above it) is cut by its own Otsu, and a band of the text's colour that starts within half a text height of the union, is at least a third of the tallest taken blob and at most 1.2 text heights tall, holds strokes (two ink runs per row at least, under 0.85 filled), spans at least 0.4 of the union's width and does not run into the strip's far edge is a candidate — handed back as `beyond`, in the bitmap's pixels, for the reader to confirm (cropSign): the pixels alone took the faces under 邪不压正 and a band above 业主直租 for lines */
  const beyond=[];
  for(const [side,col] of [[1,tcg],[-1,tcg],[1,1-tcg],[-1,1-tcg]]){ /* every answer since v326 (H's street sign 北 金汇路 南: Qwen's one-line box sat a tenth too low, the Chinese line lay mostly outside it, the snap kept the pinyin line under it and the card showed N JINHUI LU S with the characters' feet — until v325 only a two-line answer was looked around) */
    const U0={x0:Math.min(...taken.map(c=>c.x0)),y0:Math.min(...taken.map(c=>c.y0)),x1:Math.max(...taken.map(c=>c.x1)),y1:Math.max(...taken.map(c=>c.y1))}, Hl=Math.max(...taken.map(c=>c.y1-c.y0)), reach=Math.round(1.2*Hb);
    const sy0=side>0?U0.y1:Math.max(0,U0.y0-reach), sy1=side>0?Math.min(Hh,U0.y1+reach):U0.y0, sx0=Math.max(0,Math.round(U0.x0-0.5*Hb)), sx1=Math.min(W,Math.round(U0.x1+0.5*Hb)), sw=sx1-sx0, sh=sy1-sy0;
    if(sh<8||sw<8||beyond.some(b=>b.side===side)) continue; /* the other colour only where the text's colour gave no band (v334, H's 绿皮书 at 18°: the date line under the white title is dark on the poster's pale lower half — the reader still has to confirm the band as a line of the answer) */
    const h2=new Uint32Array(256); for(let y=sy0;y<sy1;y++) for(let x=sx0;x<sx1;x++) h2[g[y*W+x]]++;
    const cut=otsuThr(h2,sw*sh), rows=[]; /* per row: ink pixels, runs, extent */
    for(let y=0;y<sh;y++){ let px=0, runs=0, mn=sw, mx=-1, prev=0; for(let x=0;x<sw;x++){ const v=(g[(sy0+y)*W+sx0+x]>cut?1:0)===col?1:0; if(v){ px++; if(!prev) runs++; if(x<mn) mn=x; if(x>mx) mx=x; } prev=v; } rows.push({px,runs,mn,mx}); }
    const inked=y=>rows[y].px>=2&&rows[y].runs>=2; /* a row of a text line: several strokes across it */
    const order=side>0?[...rows.keys()]:[...rows.keys()].reverse(); let start=-1, end=-1, gap=0; /* walk away from the union: the first band of inked rows, small gaps allowed */
    for(const y of order){ if(inked(y)){ if(start<0) start=y; end=y; gap=0; } else if(start>=0&&++gap>Math.max(2,0.08*Hb)) break; }
    if(start<0) continue; const y0=Math.min(start,end), y1=Math.max(start,end)+1, bh=y1-y0, near=side>0?y0:sh-y1, far=side>0?y1>=sh:y0<=0;
    let px=0, runs=0, cnt=0, mn=sw, mx=-1; for(let y=y0;y<y1;y++){ const r=rows[y]; px+=r.px; if(r.px){ runs+=r.runs; cnt++; if(r.mn<mn) mn=r.mn; if(r.mx>mx) mx=r.mx; } }
    const bw=mx-mn+1;
    if(far||near>0.5*Hb||bh<0.25*Hl||bh>1.2*Hb||bw<0.4*(U0.x1-U0.x0)||!cnt||runs<1.6*cnt||px>0.85*bw*bh) continue; /* at least a quarter of the tallest taken blob (a third until v333: 绿皮书's date line stands at 0.33 of the title, and the AI kept it as a line of the text) */
    beyond.push({x0:(sx0+mn)/k,y0:(sy0+y0)/k,x1:(sx0+mx+1)/k,y1:(sy0+y1)/k,side,near:near/k}); } /* side: below (1) or above (-1) the union; near: the gap to it — a band that touches the union is a line the box cut through, and its cut reaches into the union (v326) */
  const U={x0:Math.min(...taken.map(c=>c.x0)),y0:Math.min(...taken.map(c=>c.y0)),x1:Math.max(...taken.map(c=>c.x1)),y1:Math.max(...taken.map(c=>c.y1))};
  if(U.x1-U.x0<0.2*(B.x1-B.x0)||U.y1-U.y0<0.2*(B.y1-B.y0)) return null; /* specks alone: the AI's box stays */
  return {x0:U.x0/k,y0:U.y0/k,x1:U.x1/k,y1:U.y1/k,beyond,count:taken.length}; /* count: the character-shaped blobs taken — the evidence between two readings of an ambiguous box (v340) */
}
async function cropSign(id,opts){
  const run=READ_RUN[id]=(READ_RUN[id]||0)+1, stale=()=>READ_RUN[id]!==run; /* a newer reading of this photo has started: leave everything to it */
  const done=r=>{ if(r) r.done=true; if(!stale()) READ_RUN[id]++; }; /* the result is in: the run is over, so the traditional reader's chain still running in the background (v236) can write no progress into the box over the editor and stops at its next pass (v290 — the quick look let the chain outlive the reading, and the box showed "recognizing … 100 %" for good) */
  if(RECROP[id]) RECROP[id].stage="reading";
  const status=readingStatus(id,run);
  { const pre=[]; while(READLOG.length&&READLOG[READLOG.length-1].pre) pre.unshift(READLOG.pop()); READLOG.length=0; READLOG.push(...pre); } /* the frame's own lines (proposed by the app, the old crop found) stay at the head of the new reading's log (v285 — until then the reading wiped them at once) */
  LAST_READ.passes=null; status("cutting out the frame …");
  let cardImg=null; /* the card's picture from this reading — kept on the reading, not in the one global slot, so a reading finishing in the background cannot hand its picture to another photo's card (v237) */
  try{
    READ_APP[id]=opts&&opts.app!==undefined?!!opts.app:!!(CROP&&CROP.id===id&&(CROP.hidden||CROP.proposed)); delete PLACED[id]; delete SPLIT[id]; /* the app's own frame, not the hand's (v304: the placement may move it for a card saved with Save now) */
    const base=opts&&opts.rect||(CROP&&CROP.id===id?CROP.rect:null); /* the frame the reading starts from: a placed frame's rectangle is mapped from its cut, not from whatever frame stands when the placement lands (v297 — the quick look's placed frame had shifted the AI's box) */
    const r=opts&&opts.blob?{blob:opts.blob}:await cropBlob(id,opts&&opts.rect);
    if(stale()) return;
    if(!r){ delete READING[id]; renderShots(); if(PENDING[id]) failPending(id,"no frame"); return; } /* no frame yet — nothing to do */
    const rec=shotRec(id);
    cardImg=r.blob; if(!PENDING[id]&&!RECROP[id]){ S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null; }
    delete SIGN[id]; if(!PENDING[id]) delete QSNOTE[id]; /* the frame stays visible while reading */
    if(!(CROP&&CROP.id===id&&CROP.hidden)) renderShots(); /* the hidden proposal's box was drawn by proposeFrame — no re-render under a finger that may be framing by hand (v288) */
    const box=$("#ocr-"+id); if(!box&&!PENDING[id]) return; /* a photo not on screen is not read — unless a saved card waits for it */
    status("loading the reader …");
    const w=await ocrWorker(status); bumpModel("reader");
    await loadSigns().catch(()=>{}); /* phrasebook optional — falls back to word gloss */
    status("reading the text …");
    let dk=await deskewBlob(r.blob); if(stale()) return; if(dk.angle) status(`straightened by ${Math.round(dk.angle)}°, reading the text …`); /* the card keeps the crop as framed (v145) */
    /* the text height of the frame from its ink (v97): readings whose boxes are far smaller are fragments of the decoration
       — H's phone read the Yakult logo as a four-line soup of 17 stroke-sized "characters" and the count outweighed
       ten passes agreeing on a three-character reading */
    const Hink=await (async()=>{ const b=await createImageBitmap(dk.blob); try{ r.frameH=b.height; return inkHeight(b); } finally{ b.close(); } })(); r.ink=Math.round(Hink);
    let placedCut=null; /* the frame placed on the text (v288): its cut is the card image and what the AI gets */
    const placeRect=async (rect,by)=>{ const cut=await frameOnText(id,r.blob,base,rect,dk.angle||0,by,null,true); if(stale()) return; if(cut){ placedCut=cut; renderShots(); } }; /* sure: the reader's placements come from lines that pass textLike on the straightened copy */
    if((CROP&&CROP.id===id&&CROP.hidden)||(PENDING[id]&&!RECROP[id]&&READ_APP[id]&&!PLACED[id])){ /* a quick look for the frame alone (v290; also for a card made by itself, whose frame is the app's until the reader or the AI places it — v325, H: "you don't need to translate first, you just need to identify text first"): one pass on a copy of at most FIRST_MAX px — 0.3 s on H's poster where the whole frame at 1 600 px takes 1.1 s — whose confident boxes give the lines and the image their ends; the frame goes there before the reading proper starts. It is not one of the reading's passes: as the first pass it lost 爸爸 on that poster, so the reading stays as it was */
      status("looking for the text …"); const bmp=await createImageBitmap(dk.blob); const k=Math.min(1,FIRST_MAX/Math.max(bmp.width,bmp.height)); const src=k<1?await toJpeg(bmp,k):dk.blob;
      let rect=null; try{ const read=scaleBoxes(await readPass(w,src,status),k); if(stale()) return; const lines=tallLines(read,Hink), fine=read.filter(l=>!lines.includes(l)); /* fine print beside taller ink places nothing (v320) */
        const ok=textLike(lines); logRead(`quick look: ${read.length?read.map(l=>l.t).join(" | ")+` at ${Math.round(meanCf(read))} %`:"nothing"}${fine.length?` — fine print beside taller ink, left out: ${fine.map(l=>l.t).join(" | ")}`:""}${lines.length&&!ok?" — not text, no frame from it":read.length&&!lines.length?" — nothing left to frame":""}`); /* Diagnostics (v296) */
        if(ok) rect=rectOfLines(bmp,lines); /* garbage places no frame (v296) */ } finally{ bmp.close(); }
      if(rect){ await placeRect(rect); if(stale()) return;
        if(CROP&&CROP.id===id&&CROP.hidden){ delete CROP.hidden; logRead("frame shown as proposed — the text fills it"); renderShots(); } } } /* nothing to move: the proposal is the frame, from now */
    status("reading the text …");
    const passes=[{lines:await readPass(w,dk.blob,status),img:dk.blob,angle:dk.angle,tightened:false}];
    if(stale()) return;
    const place=async band=>{ /* nothing placed yet (the first pass had no usable box): the tight passes so far — after the close look's colour passes, again after the whole close look */
      if(stale()||!(PENDING[id]&&!RECROP[id]?READ_APP[id]&&!PLACED[id]:CROP&&CROP.id===id&&(CROP.hidden||(CROP.proposed&&!CROP.followed)))) return; /* the frame still the app's — hidden, or shown by the 2 s fallback and untouched (v310); a card made by itself while nothing was placed (v325) */
      const tight=passes.filter(p=>p.tightened&&p.lines.length&&!p.tra&&p.scale!=="merged").map(p=>({...p,lines:tallLines(p.lines,Hink)})).filter(p=>p.lines.length&&textLike(p.lines)); if(!tight.length||!band) return; /* without the fine print (v320) */ /* the simplified reader's tight passes as read (the traditional reader's lines are converted, the merged pass is a composite), and only those that look like text (v296) */
      await placeRect(textBandOf(tight,band)); };
    r.onTight=place;
    const cardRect=await secondLook(w,dk,passes,status,r,Hink);
    delete r.onTight; if(stale()) return;
    if(CROP&&CROP.id===id&&CROP.hidden){
      await place(cardRect); if(stale()) return;
      if(CROP&&CROP.id===id&&CROP.hidden){ delete CROP.hidden; logRead("frame shown as proposed"); renderShots(); } /* nothing tighter found: the proposal itself */
    }
    if(Math.max(0,...passes.map(p=>effScore(p.lines,Hink)))<WEAK_READ){ /* weak or nothing: the whole frame as black-and-white and chromaticity copies, sizes from the ink */
      status("trying a black-and-white copy …");
      const bmp=await createImageBitmap(dk.blob), H=Hink||bmp.height/1.6;
      const combos=[]; for(const k of [...new Set([45,65,90].map(px=>Math.min(1.5,px/H).toFixed(2)))].map(Number)) for(const mode of ["bw","chroma"]) combos.push({k,mode}); /* distinct scales only (v144: with a tiny ink height all three clamped to 1.5, and one pass counted three times in the agreement bonus and the traditional vote) */
      const srcs=staged(combos.map(c=>()=>c.mode==="bw"?toBW(bmp,c.k):toChroma(bmp,c.k))); /* the first copy at once, the rest while the readers work (v236) */
      /* the simplified passes side by side on the pool, the traditional ones on their own worker at the same time (v209) */
      const [sim,tra]=await Promise.all([runPasses(combos.map((c,i)=>async ww=>readPass(ww,await srcs[i],status)),status),(async()=>{ const out=[]; for(let i=0;i<combos.length;i++) out.push(await readPassTra(await srcs[i],status)); return out; })()]);
      for(let i=0;i<combos.length;i++){ const c=combos[i];
        for(const [lines,isTra] of [[sim[i],false],[tra[i],true]]){ if(!lines) continue; passes.push({lines:scaleBoxes(lines,c.k),img:dk.blob,angle:dk.angle,tightened:false,scale:c.k,bw:c.mode==="bw",chroma:c.mode==="chroma",tra:isTra}); } }
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
    const textOf=p=>p.lines.map(x=>x.t).join("\n"), agree=new Map(); passes.forEach(p=>{ const tx=textOf(p); if(tx) agree.set(tx,(agree.get(tx)||0)+1); });
    const hOfPass=p=>boxHeight(p.lines);
    const sizeFit=p=>sizeFitOf(p.lines,Hink);
    const score=p=>readingScore(p.lines,Hink)*Math.min(1.5,1+0.1*((agree.get(textOf(p))||1)-1))*sizeFit(p)*lineFit(p);
    passes.sort((a,b)=>score(b)-score(a));
    r.passes=passes.map(p=>({s:Math.round(score(p)),cf:Math.round(meanCf(p.lines)),cov:+dictCover(p.lines).toFixed(2),t:p.lines.map(l=>l.t).join("|"),k:typeof p.scale==="string"?p.scale:+(p.scale||1).toFixed(2),h:Hink?+(hOfPass(p)/Hink).toFixed(2):null,tight:p.tightened,bw:!!p.bw,ch:!!p.chroma,tra:!!p.tra,...(lineFit(p)<1?{over:p.lines.length-maxLines}:{})}));
    LAST_READ.passes=r.passes; saveReadLog();
    const best=passes[0], lines=best.lines;
    /* the reading's winning pass places the frame when nothing else did (v321, H's Nongfu Spring bottle taken again at v320: the quick look read garbage, the close look's band sat on the mountain logo, and the text 农夫山泉 / 饮用天然水 was read by the whole-frame fallback at 98 % — a pass that could not place the frame, since only the close look's tight passes did —, so the card's picture kept the logo above the text: "das Bild über der Schrift gehört auch nicht rein"): a strong whole-frame pass whose lines pass the placement bar (textLike, the fine print left out) gives the frame the way the quick look does, while the frame is still the app's and untouched — Diagnostics "frame placed on the text by the reading: …" */
    if(!placedCut&&lines.length&&!best.tightened&&effScore(lines,Hink)>=WEAK_READ&&(PENDING[id]&&!RECROP[id]?READ_APP[id]&&!PLACED[id]:CROP&&CROP.id===id&&(CROP.hidden||(CROP.proposed&&!CROP.followed)))){
      const tl=tallLines(lines,Hink); if(textLike(tl)){ let rect=null; const bmp=await createImageBitmap(dk.blob); try{ rect=rectOfLines(bmp,tl); } finally{ bmp.close(); } if(stale()) return; if(rect){ await placeRect(rect,"reading"); if(stale()) return; } } }
    if(placedCut){ cardImg=placedCut; if(!PENDING[id]&&!RECROP[id]) S.pendingImg=placedCut; } /* the frame placed on the text: the card shows what the frame shows (v288) */
    else if(best.tightened&&cardRect){ const cut=await cutUnrotated(r.blob,cardRect,dk.angle||0); if(stale()) return; if(cut){ cardImg=cut; if(!PENDING[id]&&!RECROP[id]) S.pendingImg=cut; } } /* the text area with its margin, from the crop as framed */
    /* a weak reading, or none: the picture goes to the AI when a provider that takes pictures is set (v173) */
    const weak=!lines.length||effScore(lines,Hink)<WEAK_READ; let pic=null, picSeen=null;
    const sureAngle=passes.some(p=>!p.tra&&p.scale!=="merged"&&p.lines.length&&textLike(tallLines(p.lines,Hink))); /* a pass that read the straightened copy well confirms the angle (v333) */
    /* a large straightening the reading does not confirm is not trusted for the picture (v346, H's noodle sign 虞西苏 面馆: a straight banner in a doorway was straightened by −20° on a spurious profile peak, every pass came back garbage, Qwen read the tilted copy fine and boxed the text — but that box unrotated into an upright frame (v311, since a turned frame would have left the photo) is the bounding box of a rectangle turned by 20°, half again as large, so it covered the whole proposal and the card's picture was the room around the banner: "Hier ist wieder zu viel Luft drumrum"): the AI then sees the frame as it is and its box maps back one to one */
    const trustAngle=sureAngle||Math.abs(dk.angle||0)<SKEW_TRUST;
    if(weak&&pictureProvider()&&aiAutoOn()&&navigator.onLine){ /* the one switch covers text and pictures (v193, H: the picture went out while the check was off — "counterintuitive") */
      const guesses=[...new Set(passes.map(textOf).filter(Boolean))].slice(0,6);
      /* the whole straightened frame — or the placed frame's cut (v301) —, never the second look's band (v175, H's two-line sticker 骑车勿盯 / 还车勿忘: the tight band held the lower line only, and the AI read that line alone) */
      /* always the frame the reading started from with its straightening, so the AI's box can move the frame anywhere in it (v319; v301–v318 sent the placed frame's cut when the frame stood on text the reader had read, and the AI could only centre the frame inside it — H's Nongfu Spring bottle: a garbage placement on the label's corner, and the AI saw 泉 alone twice; since v319 the reader places only from a sure reading, and a reading that still ends weak is fragile, so the AI decides from the whole proposal — the main text only, without fine print or a line the edge cuts, v312) */
      let picBase={orig:r.blob,dk:trustAngle?dk:null,base};
      if(!trustAngle){ logRead(`the straightening of ${(dk.angle||0).toFixed(1)}° is not confirmed by the reading — the AI gets the frame as it is`); }
      if(placedCut){ logRead("the AI gets the whole proposal, not the placed frame's cut"); }
      picSeen=picBase; try{ pic=await aiReadPicture(picBase.dk?picBase.dk.blob:picBase.orig,guesses,status); }catch(err){ r.picErr=err&&err.message||String(err); logErr("picture",r.picErr); }
      if(stale()) return; r.pic=pic?{zh:pic.zh,bad:pic.bad,model:pic.model,box:pic.box,boxes:pic.boxes,dropped:pic.dropped}:null;
      if(pic&&pic.dropped&&pic.dropped.length){ logRead(`fine print left out of the AI's answer: ${pic.dropped.join(" | ")}`); } /* Diagnostics (v312) */
      /* the app's own frame cut a line off (v314, H's 大闸蟹 / 我选蟹状元 poster: the close look placed the frame at 37–77 % down, through the middle of the first line, the AI got that cut and left the cut line out as the v312 rule says, and its box could only centre the frame inside the placed one — "Warum nur die zweite Zeile und nicht auch die erste???"): when the AI names an edge that cuts off a line and the frame is the app's — placed by the reader, or the proposal —, the frame reaches past that edge by 1.2 tallest line heights into the photo, and the AI reads the grown cut once more; never for the hand's frame, never for a turned one, never twice */
      /* the app's frame holds no Chinese text at all (v348, H's scooter badge 九号 Fz110: the ink rows framed the yellow plate beside the characters, Qwen answered "no Chinese characters" for that cut — correctly —, and the card was made from the reader's garbage 量词口还: "voll falsch!"): the frame reaches the whole photo and the AI reads once more, so the text beside the proposal gets its chance; never for the hand's frame, never for a turned one, never twice */
      const noText=!!(pic&&pic.bad);
      if(pic&&(noText||!pic.bad&&pic.cut)&&(PENDING[id]&&!RECROP[id]?READ_APP[id]:CROP&&CROP.id===id&&CROP.proposed)){
        const cur=base; /* the picture the AI saw is the proposal's (v319), whatever the reader placed meanwhile */
        if(cur&&!cur.a){ const g=noText?{top:true,bottom:true,left:true,right:true}:{top:/top/.test(pic.cut),bottom:/bottom/.test(pic.cut),left:/left/.test(pic.cut),right:/right/.test(pic.cut)}; /* the frame reaches the photo's edge on every cut side (v318, H's Nongfu Spring bottle: the frame stood on the last character's edge, one character's width of room to the left showed 泉 alone and the AI said "cut" again — how far the line runs is unknown, the photo's edge is the only sure end, and the AI's box then places the frame on the line) */
          const nr={x:g.left?0:cur.x,y:g.top?0:cur.y,w:(g.right?cur.lw:cur.x+cur.w)-(g.left?0:cur.x),h:(g.bottom?cur.lh:cur.y+cur.h)-(g.top?0:cur.y),a:0,lw:cur.lw,lh:cur.lh};
          nr.x=Math.max(0,nr.x); nr.y=Math.max(0,nr.y); nr.w=Math.min(cur.lw-nr.x,nr.w); nr.h=Math.min(cur.lh-nr.y,nr.h);
          if(nr.w>cur.w+1||nr.h>cur.h+1){ let cut=await cropBlob(id,nr); if(stale()) return;
            if(cut){ if(PENDING[id]&&!RECROP[id]) PLACED[id]=nr; else if(CROP&&CROP.id===id&&CROP.proposed){ CROP.rect=nr; CROP.proposed="text"; CROP.followed=true; delete CROP.hidden; } else cut=null; }
            if(cut){ placedCut=cut.blob; renderShots(); const pc=v=>Math.round(v*100);
              logRead((noText?"the AI found no Chinese text in the picture — the frame reaches the whole photo":`the AI says the picture's ${pic.cut} edge cuts off a line — the frame reaches beyond it`)+` (${pc(nr.x/nr.lw)}–${pc((nr.x+nr.w)/nr.lw)} % across, ${pc(nr.y/nr.lh)}–${pc((nr.y+nr.h)/nr.lh)} % down) and the AI reads again`);
              picBase={orig:placedCut,dk:null,base:null}; picSeen=picBase;
              try{ pic=await aiReadPicture(placedCut,guesses,status); }catch(err){ r.picErr=err&&err.message||String(err); logErr("picture",r.picErr); }
              if(stale()) return; r.pic=pic?{zh:pic.zh,bad:pic.bad,model:pic.model,box:pic.box,boxes:pic.boxes,dropped:pic.dropped,cut:pic.cut}:null; } } } }
    }
    if(pic&&!pic.bad){
      /* the AI's lines replace the reading: no confidences (every character is open in the picker), no boxes (the sheet
         shows the whole crop), the reader's texts become the alternatives; the answer is the check, no text check follows */
      const zh=pic.zh.split("\n"), guesses=[...new Set(passes.map(textOf).filter(tx=>tx&&tx!==pic.zh))].slice(0,6);
      if(pic.box&&picSeen&&(PENDING[id]&&!RECROP[id]?READ_APP[id]:CROP&&CROP.id===id&&CROP.proposed)){ /* the reader could not read this font (v293 — H's 邪不压正 poster: the ink rows and the reader's garbage boxes put the frame around the whole photo): the AI's box places the frame, once, as fractions of the straightened picture it saw — the proposal's crop, or the cut of the frame the quick look had placed from that same garbage; on the placed frame's own cut (v301) the box centres the frame on the characters inside it (v303, H's 绿皮书: "should be more centered") */
        const seen=picSeen.dk?picSeen.dk.blob:picSeen.orig, seenAngle=picSeen.dk?picSeen.dk.angle||0:0, seenBase=picSeen.base||PLACED[id]||(CROP&&CROP.id===id?CROP.rect:null); /* the placed cut is upright, and its frame is the placed one */
        let W=0,Hh=0,box=null,rect=null,grow=null,altWon=false,labelRects=null,labelWhole=false,splitWhole=false; try{ const b=await createImageBitmap(seen); W=b.width; Hh=b.height; const [bx0,by0,bx1,by1]=pic.box, n=Math.max(1,zh.length);
          box={x0:bx0*W,y0:by0*Hh,x1:bx1*W,y1:by1*Hh}; let [fx0,fy0,fx1,fy1]=pic.box; /* the box as read, for the log (v340) */ const lens=zh.map(l=>l.replace(/[\s\/／·・,，。.、()（）]/g,"").length); let snap=snapBox(b,box,n,lens,pic.droppedBoxes);
          if(pic.boxAlt){ /* the box overshoots the picture by a little (v340, H's ARRI poster 突破光影边界: Qwen's box [120,330,860,450] for an 800×600 picture — pixels, the title running to the right edge —, read on the 0–1000 grid as 12–86 % across, 33–45 % down: the blank blue above the title, so the card showed ARRI and cut the title; v328's far 邪不压正 answered the same way and meant the grid): the numbers read as pixels, clamped to the picture, name another place, and the snap decides — the pixel reading wins when its box holds a line of characters and the grid's holds none */
            const [ax0,ay0,ax1,ay1]=pic.boxAlt, abox={x0:ax0*W,y0:ay0*Hh,x1:ax1*W,y1:ay1*Hh}; let s2=null; try{ s2=snapBox(b,abox,n,lens,pic.droppedBoxesAlt||pic.droppedBoxes); }catch(e){ s2=null; }
            const pc=v=>Math.round(v*100), cg=snap?snap.count:0, cp=s2?s2.count:0; /* count: the character-shaped blobs each snap took, both passes together — a real line gives several, a blank box none */
            if(cp>=3&&cg<3){ logRead(`the AI's box ${pc(bx0)}–${pc(bx1)} % across, ${pc(by0)}–${pc(by1)} % down passes the picture's edge on the 0–1000 grid and holds no characters there — read as pixels it holds ${cp} blobs of a character's size: ${pc(ax0)}–${pc(ax1)} % across, ${pc(ay0)}–${pc(ay1)} % down`); box=abox; snap=s2; altWon=true; pic.box=pic.boxAlt; if(r.pic) r.pic.box=pic.boxAlt; [fx0,fy0,fx1,fy1]=pic.boxAlt; }
            else logRead(`the AI's box passes the picture's edge — read on the 0–1000 grid it holds ${cg} blobs of a character's size, read as pixels ${cp}; the grid stays`); } /* the box's edges from the pixels (v297): an edge that cuts through the text moves out to its end, a blank margin is trimmed */
          if(snap){ const pc=v=>Math.round(v*100); logRead(`the AI's box ${pc(fx0)}–${pc(fx1)} % across, ${pc(fy0)}–${pc(fy1)} % down, snapped to the ink: ${pc(snap.x0/W)}–${pc(snap.x1/W)} % across, ${pc(snap.y0/Hh)}–${pc(snap.y1/Hh)} % down`); box=snap;
            /* a line of the answer the box left out (v324, H's Nongfu Spring label: the AI's box for 饮用天然水 净含量380ml sat on NONGFU SPRING, so the snap ended at the Latin line and the card showed the Chinese line cut in half — "only translate what is also shown in the thumbnail and in the learning card"): every band of ink the snap found just beyond the text is read by the on-device reader, and it joins the box when the reader's line is one the AI read — at least three of its characters, half of them, in one of the answer's lines; the faces under a poster's title and a Latin line read as nothing of the kind, and stay out */
            for(const cand of snap.beyond||[]){ const bh=cand.y1-cand.y0, room=0.3*bh, into=cand.near<0.1*bh?0.6*bh:room, sx=Math.max(0,cand.x0-room), sy=Math.max(0,cand.y0-(cand.side>0?into:room)), sw=Math.min(W,cand.x1+room)-sx, sh=Math.min(Hh,cand.y1+(cand.side>0?room:into))-sy; if(sw<4||sh<4) continue; /* a band that touches the union is a line the box cut through: the cut reaches 0.6 band heights into the union, so the reader sees the whole characters (v326) */
              const sc=Math.min(3,Math.max(0.3,64/bh)), cv=document.createElement("canvas"); cv.width=Math.max(1,Math.round(sw*sc)); cv.height=Math.max(1,Math.round(sh*sc));
              if(cv.width<8||cv.height<8) continue; /* the reader refuses a strip a couple of pixels wide ("Image too small to scale") — a band that thin is no line (v357, seen on H's appliance panels) */ cv.getContext("2d",{alpha:false}).drawImage(b,sx,sy,sw,sh,0,0,cv.width,cv.height);
              const jpg=await new Promise(res=>cv.toBlob(res,"image/jpeg",READ_JPEG)); if(!jpg) continue; const got=await readPass(w,jpg,()=>{}); if(stale()) return;
              const chars=tx=>[...tx].filter(c=>CJK.test(c)||/[0-9]/.test(c)), hit=got.find(l=>{ const rc=chars(l.t); if(rc.length<3) return false; return zh.some(al=>{ const ac=new Set(chars(al)); const shared=rc.filter(c=>ac.has(c)).length; return shared>=3&&shared>=0.5*rc.length; }); });
              const where=cand.y0>=box.y1-1?"below":"above";
              if(hit){ box={x0:Math.min(box.x0,cand.x0),y0:Math.min(box.y0,cand.y0),x1:Math.max(box.x1,cand.x1),y1:Math.max(box.y1,cand.y1)}; logRead(`a line ${where} the AI's box, read as ${hit.t} — one of the answer's lines, the frame takes it: ${pc(box.x0/W)}–${pc(box.x1/W)} % across, ${pc(box.y0/Hh)}–${pc(box.y1/Hh)} % down`); }
              else logRead(`a band ${where} the AI's box read as ${got.map(l=>l.t).join(" | ")||"nothing"} — not a line of the answer, left out`); } }
          /* one card per element of a user interface (v358): the model called the picture an interface and listed its elements —
             each box is snapped on its own (n=1, its own character count for the width budget) and gets the same room the union
             frame gets; the auto-card path only, where no frame is ever drawn, so the placement above is untouched */
          /* A panel that made one card says why (v374, H's washing machine at v373: the model listed its labels and the phone kept
             one card of all 24, and not one line of the log said what stopped it — every test above this one was silent). And a
             straightened panel splits too: photoFrameOf maps each label's rectangle back through the angle as it maps the union
             frame, so the tilt costs each label the little room its bounding box adds, not its card (until v373 a frame the reader
             straightened by more than 1.5° kept one card). A frame the hand turned still keeps one — that angle is the user's. */
          const noSplit=pic.labels&&(!PENDING[id]||RECROP[id]?"the card was not made by the app itself":!READ_APP[id]?"the frame is the hand's":altWon?"the AI's box was read as pixels, so the labels' boxes cannot be trusted":!seenBase?"there is no frame to map them onto":seenBase.a?"the frame was turned by hand":"");
          if(noSplit) logRead(`the AI calls these ${pic.labels.length} texts separate labels, but ${noSplit} — one card`);
          if(pic.labels&&!noSplit){
            const lab=pic.labels, bs=lab.map(l=>({x0:l.box[0]*W,y0:l.box[1]*Hh,x1:l.box[2]*W,y1:l.box[3]*Hh}));
            const scale=lab[0].scale, oneScale=lab.every(l=>l.scale===scale)&&(!pic.boxScale||pic.boxScale===scale); /* every box read the same way, or some of them land somewhere else entirely */
            const whole=bs.some(q=>(q.x1-q.x0)*(q.y1-q.y0)>0.9*W*Hh); /* a box over the whole picture is not one element */
            const why=lab.length>SPLIT_MAX?`there are ${lab.length} of them`:!oneScale?"their boxes are not all on the same scale":whole?"one box covers the whole picture":"";
            if(why){ logRead(`the AI calls these ${lab.length} texts separate labels, but ${why} — one card`); }
            else if(templateBoxes(lab,W)){ /* the boxes are a drawing, not a measurement (v380): the model cannot say where anything is, so the reader looks (v386) */
              logRead(`the AI's ${lab.length} label boxes are all the same size — a drawing of the grid, not a measurement: the reader looks for the labels in the picture itself`);
              const src=picSeen&&!picSeen.dk&&picSeen.orig?picSeen.orig:seen;
              const sb=src===seen?b:await createImageBitmap(src); const gy=labelGrey(sb,pic.box);
              let found=null; try{ found=await readLabels(sb,gy,lab,pic.box,()=>{}); }catch(e){ found=null; logErr("split",e&&e.message||String(e)); }
              if(sb!==b) sb.close(); if(stale()) return;
              if(found&&found.hit+found.filled+found.ordered>=SPLIT_MIN){
                logRead(`the picture's own characters stand in ${found.bands} ${found.bands===1?"row":"rows"}, ${found.runs} runs; the reader named ${found.hit} of the ${lab.length} labels`+(found.filled?`, and ${found.filled} more by half a reading and their row's order`:"")+(found.ordered?`, and ${found.ordered} more by their row's order alone`:""));
                const pcv=v=>Math.round(v*100);
                labelWhole=true; /* a label the reader could not name keeps the frame's own picture, never a neighbour's */
                labelRects=lab.map((l,k)=>{ const q=found.rects[k];
                  logRead(q?(q.read?`${l.zh}: read as ${q.read} at ${pcv(q.x0)}–${pcv(q.x1)} % across, ${pcv(q.y0)}–${pcv(q.y1)} % down`
        :`${l.zh}: no reading, its row's order gives it ${pcv(q.x0)}–${pcv(q.x1)} % across, ${pcv(q.y0)}–${pcv(q.y1)} % down`):`${l.zh}: no run of the picture reads as it — the whole picture`);
                  if(!q) return null; /* no FRAME_ROOM here: the run was already grown as far as its neighbours allow (v388) */
                  return {x0:Math.max(0,q.x0)*W,y0:Math.max(0,q.y0)*Hh,x1:Math.min(1,q.x1)*W,y1:Math.min(1,q.y1)*Hh}; }); }
              else { logRead(`the reader found ${found?found.hit:0} of the ${lab.length} labels in the picture — every card gets the whole picture`); splitWhole=true; } }
            else { const src=picSeen&&!picSeen.dk&&picSeen.orig?picSeen.orig:seen; /* the frame at its own pixels when nothing was straightened: a panel's labels are small in the 800 px picture the AI saw */
              const sb=src===seen?b:await createImageBitmap(src); const gy=labelGrey(sb,pic.box); if(sb!==b) sb.close();
              const pcv=v=>Math.round(v*100);
              /* the rows and the runs first (v376): the model's boxes are a layout, its reading order a fact */
              let plan=null; try{ plan=labelPlan(gy,lab.map(l=>({box:l.box,n:[...l.zh].filter(c=>CJK.test(c)).length||1}))); }catch(e){ plan=null; logErr("split",e&&e.message||String(e)); }
              logRead(plan?`the ${lab.length} labels stand in ${plan.rows} ${plan.rows===1?"row":"rows"}, and ${plan.placed} of them found their own place in the picture's own rows of characters`
                          :"the labels' rows do not line up with the picture's — each label is placed on its own");
              labelRects=lab.map((l,k)=>{ let sn=null; try{ sn=labelRect(gy,{x0:l.box[0],y0:l.box[1],x1:l.box[2],y1:l.box[3]},plan&&plan.pin[k]); }catch(e){ sn=null; logErr("split",e&&e.message||String(e)); }
                logRead(sn?`${l.zh}: the AI's box ${pcv(l.box[0])}–${pcv(l.box[2])} % across, ${pcv(l.box[1])}–${pcv(l.box[3])} % down, its characters at ${pcv(sn.x0)}–${pcv(sn.x1)} %, ${pcv(sn.y0)}–${pcv(sn.y1)} %`:`${l.zh}: nothing of a character's shape near the AI's box — the box stays`);
                const q=sn||{x0:l.box[0],y0:l.box[1],x1:l.box[2],y1:l.box[3]}, Hk=Math.max(1/Hh,q.y1-q.y0); /* the label's own characters (v359), not snapBox's poster machinery: its room reaches into the neighbours and its passes take the button */
                return {x0:Math.max(0,q.x0-Hk*FRAME_ROOM)*W,y0:Math.max(0,q.y0-Hk*FRAME_ROOM)*Hh,x1:Math.min(1,q.x1+Hk*FRAME_ROOM)*W,y1:Math.min(1,q.y1+Hk*FRAME_ROOM)*Hh}; }); } }
          b.close();
          r.pic.snap=snap?[box.x0/W,box.y0/Hh,box.x1/W,box.y1/Hh].map(v=>+v.toFixed(3)):null; /* with the lines the reader confirmed (v324) */
          const Hb=(box.y1-box.y0)/n; /* the text height from the box and its lines */
          rect={x0:Math.max(0,box.x0-Hb*FRAME_ROOM),y0:Math.max(0,box.y0-Hb*FRAME_ROOM),x1:Math.min(W,box.x1+Hb*FRAME_ROOM),y1:Math.min(Hh,box.y1+Hb*FRAME_ROOM)};
          if(picSeen.base){ const bh=box.y1-box.y0, sb=seenBase, e={top:box.y0<=0.02*Hh&&sb.y>0.005*sb.lh,bottom:box.y1>=0.98*Hh&&sb.y+sb.h<0.995*sb.lh,left:box.x0<=0.02*W&&sb.x>0.005*sb.lw,right:box.x1>=0.98*W&&sb.x+sb.w<0.995*sb.lw}; /* an edge that is the photo's own has nothing beyond it (v315: on the whole-photo proposal of H's parking sign the line said the frame reaches beyond the right edge, where nothing was) */ /* the box on the edge of the app's proposal (v313, H's 北京现代 badge: the ink rows cut the chrome characters in half at the proposal's top, Qwen boxed the visible halves at y 0–55 of 496, the snap found nothing, and the card showed half characters — "Why is the crop so wrong here?"): the text may go on beyond the edge, so the frame reaches past it — 1.5 box heights above or below, two text heights sideways — into the photo; never for the hand's frame or the whole photo, where there is nothing beyond */
            if(e.top||e.bottom||e.left||e.right){ grow={top:e.top?1.5*bh:0,bottom:e.bottom?1.5*bh:0,left:e.left?2*bh:0,right:e.right?2*bh:0}; logRead(`the AI's box touches the picture's ${["top","bottom","left","right"].filter(k=>e[k]).join(" and ")} edge — the frame reaches beyond it`); } } }catch(e){ box=null; logErr("snap",e&&e.message||String(e)); logRead("the AI's box could not be used: "+(e&&e.message||e)); }
        if(box){ const sure=sureAngle; const cut=await frameOnText(id,picSeen.orig,seenBase,rect,seenAngle,"AI",grow,sure&&{box}); if(stale()) return; if(cut) placedCut=cut; }
        if(splitWhole&&W&&Hh&&seenBase&&pic.labels&&pic.labels.length>=SPLIT_MIN){ /* the boxes are a drawing: the cards keep their texts and get the frame's own picture (v380) */
          const one=PLACED[id]||seenBase;
          SPLIT[id]=pic.labels.map(()=>one);
          logRead("the AI calls these "+pic.labels.length+" texts separate labels — one card each, all with the frame's own picture"); }
        if(labelRects&&W&&Hh&&seenBase){ /* one frame per label on the photo (v357), for finishPending to cut and save */
          const one=PLACED[id]||seenBase; /* the frame's own picture, for a label the reader could not name (v386) */
          const fr=labelRects.map(rc=>rc?photoFrameOf(seenBase,W,Hh,rc,seenAngle):(labelWhole?one:null)), pc=v=>Math.round(v*100);
          const keep=[]; for(let k=0;k<fr.length;k++) if(fr[k]) keep.push(k);
          if(keep.length<fr.length){ /* a label too small to cut is left out and the others keep their cards (v360, H's washing machine, whose fine print stands 6 px tall in the picture) */
            const lost=[]; for(let k=0;k<fr.length;k++) if(!fr[k]) lost.push(pic.labels[k].zh);
            const rest=keep.length>=SPLIT_MIN?"the other labels keep their cards":"one card";
            logRead("no frame for "+lost.join(", ")+" on the photo (copy "+W+"×"+Hh+") — "+rest); }
          if(keep.length>=SPLIT_MIN){
            pic.labels=keep.map(k=>pic.labels[k]); SPLIT[id]=keep.map(k=>fr[k]);
            const where=SPLIT[id].map((f,k)=>pic.labels[k].zh+" "+pc(f.x/f.lw)+"–"+pc((f.x+f.w)/f.lw)+" %").join(", ");
            logRead("the AI calls these "+pic.labels.length+" texts separate labels — one card each: "+where); } } }
      cardImg=placedCut||r.blob; if(!PENDING[id]&&!RECROP[id]) S.pendingImg=cardImg; /* the card image is the crop as framed (the placed frame's cut, v288), not the second look's band */
      SIGN[id]={lines:zh, orig:zh.slice(), conf:[], boxes:zh.map(()=>[]), img:dk.blob, angle:dk.angle||0, tightened:false, region:r, alts:guesses, trad:!!pic.zht, tradDetected:!!pic.zht, tradText:pic.zht||"",
        ai:{zh:pic.zh,zht:pic.zht,p:pic.p,m:pic.m,ml:pic.ml,note:pic.note,kind:pic.kind,ok:true,bad:false,pic:true,labels:pic.labels||null}, cardImg, weak:false};
      done(r); delete READING[id]; renderShots(); if(PENDING[id]) finishPending(id); if(RECROP[id]) RECROP[id].onRead(SIGN[id]); return;
    }
    if(!lines.length){ status("No Chinese characters recognized — frame the characters tightly and try again."); done(r); if(PENDING[id]) failPending(id,"no Chinese characters recognized"); return; }
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
      const n=[...bestT].length, texts=[...new Set(passes.map(textOf).filter(tx=>tx&&!tx.includes("\n")&&[...tx].length===n))]; /* the same length as the best: a correction, not a replacement (v100: 业主直租 once became 下人, a two-character word that garbage fragments circled) */
      const fix=dictConsensus(texts);
      if(fix&&fix.word!==bestT&&!DICT.has(bestT)&&(fix.support.includes(bestT)||fix.support.length>=3)){
        alts.push(bestT); lines[0]={...lines[0],t:fix.word}; bestT=fix.word; r.consensus={word:fix.word,from:fix.support};
      }
    }
    for(const p of passes){ const tx=textOf(p); if(tx&&tx!==bestT&&!alts.includes(tx)) alts.push(tx); if(alts.length>=5) break; }
    /* always among them: the traditional reader's best (it knows glyphs the other one lacks) and the best reading of another
       length (two characters fused into one, or one lost — 专业冰矫正 beside 专业脊柱矫正 — is what the AI needs to see) */
    const glyphsOf=tx=>[...tx].filter(c=>CJK.test(c)).length, nBest=glyphsOf(bestT);
    for(const pick of [passes.find(p=>p.lines.some(l=>l.tra)&&textOf(p)!==bestT), passes.find(p=>textOf(p)&&glyphsOf(textOf(p))!==nBest&&readingScore(p.lines,Hink)>=0.6*readingScore(lines,Hink))]){
      if(pick&&!alts.includes(textOf(pick))){ if(alts.length>=6) alts.pop(); alts.push(textOf(pick)); } }
    const tradPhoto=s2t(bestT)!==bestT&&tradPhotoOf(lines.map(x=>x.t),passes,score); r.trad=tradPhoto; /* a text without a traditional form (推) has nothing to vote on */
    SIGN[id]={lines:lines.map(x=>x.t), orig:lines.map(x=>x.t), conf:lines.map(x=>x.cf), boxes:lines.map(x=>x.bx), img:best.img, angle:best.angle||0, tightened:best.tightened, region:r, alts, trad:tradPhoto, tradDetected:tradPhoto, tradText:tradPhoto?s2t(bestT):""};
    SIGN[id].cardImg=cardImg; SIGN[id].weak=weak; /* for the card saved before the reading (v237): its picture, and the flag when the reading was weak */
    SIGN[id].picBlob=trustAngle?dk.blob:r.blob; SIGN[id].picAsked=r.pic!==undefined; /* the picture for a garbage verdict of the text check (v302): the straightened frame the reading started from — the same picture the weak path sends (v319; v302–v318 the placed frame's cut when the frame stood on read text) */
    if(pic&&pic.bad){ const sg=SIGN[id]; sg.noText=true; sg.ai={zh:bestT,zht:"",p:"",m:"",note:pic.note,ok:false,bad:true,pic:true}; sg.flag=true; sg.flagNote=t("the reading looks wrong"); } /* the AI saw the picture and found no readable text: the reading is marked wrong, no text check on it */
    done(r); delete READING[id]; renderShots();
    if(aiAutoOn()&&!(pic&&pic.bad)&&!RECROP[id]) signAskAI(id); /* every reading is checked without a tap (the Edit form asks through its own button, v239) */
    if(PENDING[id]) finishPending(id);
    if(RECROP[id]) RECROP[id].onRead(SIGN[id]);
  }catch(err){ if(stale()) return; status("Reading failed: "+(err&&err.message||err)); done(); logErr("read",err&&(err.stack||err.message)||err); if(PENDING[id]) failPending(id,"the reading failed",String(err&&err.message||err)); }
}
/* ---------- a card saved before its reading is done (v237, H: "take a photo and make a crop in a rush, hit Save and move on;
   the app will finish everything in the background") ----------
   Save now, at the right of the reading text, makes the card at once with the crop as framed and no text ("Reading …" in
   the Cards list, skipped by Learn); the reading and the AI check go on and fill it in — the text, pinyin, meaning, the
   tightened picture — in the background while H takes the next photo or leaves the tab. Every card filled this way is
   flagged for review, since nobody saw the preview (v245; the note says so, and names a weak reading); a reading that
   finds nothing or fails leaves the card empty, flagged, for Edit or another framing. The Edit form's Crop again hands a card with text
   over the same way when Save changes comes during the reading (v241): the card keeps its old text until the fill, and a
   failed reading keeps it for good. The work needs the page open: a card still waiting at the next start gets its reading
   redone then (resumePending), from the inbox photo with the frame it was saved with, from the photo copied onto the card,
   or from the crop itself. The usual flow — wait for the preview, then Save card — is unchanged. */
async function saveNow(id,auto){ /* auto (v325): the card made by itself from a photo that opened by itself — no note, the shimmer, the finished card in the row */
  if(PENDING[id]||!CROP||CROP.id!==id||!CROP.rect) return;
  const rect={...CROP.rect}, app=!!(CROP.hidden||CROP.proposed), cid="reading#"+Date.now();
  if(auto){ PENDING[id]=cid; AUTO[id]=true; QSCARD[id]=cid; delete QSMORE[id]; delete QSNOTE[id]; } /* announced before the cut is made, so the quick look's placement meanwhile goes to PLACED and no frame is ever drawn (v325) */
  const r=await cropBlob(id,windowRect(rect)); if(!r){ if(auto&&PENDING[id]===cid){ delete PENDING[id]; delete AUTO[id]; delete QSCARD[id]; } return; } /* the placeholder's picture is the 16:9 window too (v329) */
  const img=await cardJpeg(r.blob);
  if(auto?PENDING[id]!==cid:PENDING[id]){ return; } /* Cancel or another photo meanwhile */
  if(!CROP||CROP.id!==id){ if(auto){ delete PENDING[id]; delete AUTO[id]; delete QSCARD[id]; } return; }
  const followed=!!CROP.followed, placed=followed?{...CROP.rect}:null; /* a frame the reader placed while the cut was made (v325: read after the awaits) */
  const card={id:cid, c:"", p:"", m:"", t:"Custom", at:Date.now(), shot:id, lb:"photo", img, mt:{src:"gloss",verified:false,pending:true}, frame:frameOf(rect), reading:{rect,at:Date.now(),app,...(auto?{auto:true}:{})}}; /* app: the frame was the app's own, so the reader or the AI may still tighten it while the card waits (v304) */
  bump("byPhoto"); S.custom.push(card); try{ await idbPut("custom",card); }catch(e){}
  PENDING[id]=card.id; QSCARD[id]=card.id; CROP=null; delete SIGN[id]; if(followed) PLACED[id]=placed; /* a frame the reader had already placed on the text: the running reading goes on as if it stood (the AI gets its cut and centres it, v304) */
  if(!auto) QSNOTE[id]=t("Card saved — the text follows when the reading is done.");
  clearTimeout(READ_TIMER[id]); if(!READING[id]) cropSign(id,{rect,app}); /* the reading had not started yet (the 1.2 s wait) — start it with the frame it was saved with */
  setStats(); renderShots();
}
function pendingCard(id){ const cid=PENDING[id]; return cid?cardOf(cid):null; }
/* the card made by itself (v325, H: "no frame is seen during the first scan at all, just the magic wobbling over the image, and then the result is the finished card … if I want to edit something, I get a frame which I can adjust"; saved by itself on my recommendation, "Go"): Cancel while it reads drops the placeholder, nothing readable drops it too (dropAuto), and the row shows the finished card with Edit and Delete (resultHTML) */
async function dropAuto(id,cid){ delete AUTO[id]; delete QSCARD[id]; delete QSMORE[id]; if(!cid) return; const d=cardOf(cid); if(!d||d.c) return; S.custom=S.custom.filter(x=>x.id!==cid); try{ await idbDel("custom",cid); }catch(e){} bump("byPhoto",-1); dropThumb(cid); setStats(); }
async function cancelAuto(id){ const cid=PENDING[id]; abandonReading(id); delete PENDING[id]; await dropAuto(id,cid); renderShots(); }
const resultHTML=d=>`<div class="result" data-card="${esc(d.id)}"><div class="front">${frontHTML(d)}</div><div class="back">${backHTML(d)}</div>${flagNoteHTML(d)}</div>`; /* the finished card in the photo's place: the front's boxes and the back, as in the detail */
/* one card per label (v357): the answer's lines with their own pinyin, meaning and frame become N cards — the placeholder
   is the first, the rest are saved beside it, each with its own 16:9 window of the panel (v329) and its own frame, so Crop
   again starts on that label. Every card is built by readingCard from a one-line copy of the reading, so it gets its parts
   row, its meaning language and its metadata exactly as a card of its own would. Null when the model did not give every
   label its own pinyin and meaning — then the photo makes one card, as before. */
async function splitCards(id,sg,ph){
  const lab=(sg.ai&&sg.ai.labels)||null, fr=SPLIT[id];
  if(!lab||!fr||fr.length!==lab.length||lab.length<SPLIT_MIN){
    logRead(`the labels and their frames do not match (${lab?lab.length:0} labels, ${fr?fr.length:0} frames) — one card`); return null; }
  const prev=SIGN[id], out=[];
  try{
    for(let k=0;k<lab.length;k++){
      const sgK={...sg,lines:[lab[k].zh],orig:[lab[k].zh],conf:[],boxes:[[]],res:null,mean:"",full:false,nmt:null,cardImg:null,
        ai:{...sg.ai,zh:lab[k].zh,p:lab[k].p,m:lab[k].m,labels:null}};
      SIGN[id]=sgK;
      let b=null; try{ b=await readingCard(id,sgK); }catch(e){ logErr("split",e&&e.message||String(e)); b=null; }
      if(!b||!b.card||!b.card.c) continue;
      let cut=null; try{ cut=await cropBlob(id,fr[k]); }catch(e){ cut=null; } /* the label's own cut at the photo's pixels (v362, H: "do the label crops at full resolution") — not the 16:9 window of v329, which on a panel widens a small label until its neighbours stand in the picture */
      out.push({card:b.card,img:cut&&cut.blob?await cardJpeg(cut.blob):null,frame:fr[k]});
    }
  } finally{ SIGN[id]=prev; }
  if(out.length<SPLIT_MIN){ logRead(`only ${out.length} of ${lab.length} labels could be made into cards — one card`); return null; }
  const taken=new Set(S.custom.map(d=>d.id)), at0=ph.at||Date.now();
  const freeId=(c,at)=>{ let cand=taken.has(c)?c+"#"+at:c, i=0; while(taken.has(cand)) cand=c+"#"+at+"-"+(++i); taken.add(cand); return cand; };
  const first=out[0], rest=out.slice(1), rows=[], more=[];
  for(const k of Object.keys(ph)) if(!["id","at","img","imgFull","shot","tags","frame"].includes(k)) delete ph[k];
  { const {id:_i,at:_a,img:_m,shot:_s,...fields}=first.card; Object.assign(ph,fields); }
  ph.frame=frameOf(first.frame); if(first.img){ ph.img=first.img; dropThumb(ph.id); }
  rows.push(ph);
  for(let k=0;k<rest.length;k++){
    const o=rest[k], card={...o.card, id:freeId(o.card.c,at0+k+1), at:at0+k+1, shot:id, frame:frameOf(o.frame)};
    if(o.img) card.img=o.img; else delete card.img;
    rows.push(card); more.push(card.id);
  }
  try{ await idbPutMany("custom",rows); }catch(e){ logErr("split",e&&e.message||String(e)); return null; } /* all the labels together or none (v264's rule): half of them saved while the placeholder still carries its reading would be read again at the next start and doubled */
  for(let k=0;k<rest.length;k++){ bump("byPhoto"); S.custom.push(rows[k+1]); }
  QSMORE[id]=more; QSCARD[id]=ph.id;
  logRead(`${rows.length} cards from this photo: ${rows.map(c=>c.c).join(", ")}`);
  return rows.length;
}
async function finishPending(id){
  const sg=SIGN[id], ph=pendingCard(id); if(!ph){ delete PENDING[id]; return; }
  if(!ph.reading){ delete PENDING[id]; delete SIGN[id]; return; } /* H gave it a text meanwhile (Edit) — the reading is not needed */
  try{
    if(sg&&sg.aiPromise) await sg.aiPromise;
    /* the AI looked at the picture and found no Chinese text in it (v348, H's scooter badge 九号 Fz110: the frame sat on the yellow plate, Qwen said "no Chinese characters" — correctly — and the card was made from the reader's garbage 量词口还 all the same: "voll falsch!"): a card the app makes by itself is not made then, the photo stays with Crop. A text check that calls the reading garbage is weaker evidence — it never saw the picture — and still makes a flagged card, as in v325. */
    if(ph.reading.auto&&!ph.c&&sg&&SIGN[id]===sg&&sg.noText){ logRead("the AI found no Chinese text in the picture — no card"); return failPending(id,"the AI found no Chinese text in the picture"); }
    /* several labels on one photo, one card each (v357): the answer's lines, its per-line pinyin and meanings and the frames
       SPLIT[id] carries — the placeholder becomes the first label's card, the rest are saved beside it. Only when every line
       has its own pinyin and its own meaning; if the model joined them, nothing is split and the photo makes one card as before. */
    if(SPLIT[id]&&!(ph.reading.auto&&sg&&SIGN[id]===sg&&sg.ai&&sg.ai.ok&&!sg.ai.bad)) /* the last silent gate (v374): the frames were cut and the split still did not run */
      logRead(`the labels have their frames, but ${!ph.reading.auto?"the card was not made by the app itself":!sg||SIGN[id]!==sg?"the reading was replaced meanwhile":!sg.ai||!sg.ai.ok?"the picture answer was not used as the reading":"the AI called the picture unreadable"} — one card`);
    if(SPLIT[id]&&ph.reading.auto&&sg&&SIGN[id]===sg&&sg.ai&&sg.ai.ok&&!sg.ai.bad){
      const made=await splitCards(id,sg,ph);
      if(made){ delete PENDING[id]; delete SIGN[id]; delete PLACED[id]; delete SPLIT[id]; dropExtraShot(id); /* before the row is drawn, or it shows the reading again */
        S.queue=buildQueue(false); aiAutoSoon(); setStats();
        if(S.mode==="cards"&&!S.editing) render(); else renderShots();
        return; } }
    const built=sg&&SIGN[id]===sg?await readingCard(id,sg):null;
    if(!built){ return failPending(id,"nothing to save"); }
    const {card,c,mt}=built, auto=!!ph.reading.auto, edit=!!ph.reading.edit;
    if(PLACED[id]) ph.frame=frameOf(PLACED[id]); else if(ph.reading.rect&&ph.reading.rect.lw) ph.frame=frameOf(ph.reading.rect); /* the frame the reader or the AI placed on the text while the card waited (v304), else the one it was saved with */
    const fr=PLACED[id]||(ph.reading.rect&&ph.reading.rect.lw?ph.reading.rect:null); /* for the window below, read before the card's fields are replaced (v329) */
    for(const k of Object.keys(ph)) if(!["id","at","img","imgFull","shot","tags","frame"].includes(k)) delete ph[k];
    const {id:_i,at:_a,img:_m,shot:_s,...fields}=card; Object.assign(ph,fields);
    if(sg.cardImg){ ph.img=await cardJpeg(sg.cardImg); dropThumb(ph.id); } /* the list's thumbnail was made from the crop saved first (v242, H: "the card with a photo before the re-crop remains") */
    { const win=fr?await windowCut(id,fr):null; if(win){ ph.img=await cardJpeg(win.blob); dropThumb(ph.id); } } /* the 16:9 window around the text (v329) — the tight cut only when the photo is gone */
    const weak=!!(mt.suspect||sg.weak||(sg.ai&&sg.ai.bad));
    if(auto||edit){ if(mt.suspect||(sg.ai&&sg.ai.bad)||(sg.weak&&!(sg.ai&&sg.ai.ok))){ ph.flag=true; ph.flagNote=t("the reading looks unsure — check text, pinyin and meaning"); } } /* the card made by itself (v325) and the card saved early from Crop again (v342, H's "Go" on the recommendation — the analysis counts): only a doubtful reading carries the flag */ /* the card made by itself (v325): the row shows it, so only a doubtful reading carries the flag — a weak reader score the AI check then confirmed is no doubt */
    else { ph.flag=true; ph.flagNote=weak?t("saved before the reading was done, and the reading is weak — check text, pinyin and meaning"):t("saved before the reading was done — check text, pinyin and meaning"); } /* nobody saw the preview (v245, H: "flag cards that were saved before the final stage, with an appropriate comment") */
    try{ await idbPut("custom",ph); }catch(e){}
    if(!auto) QSNOTE[id]=`Card saved — ${esc(c.replace(/\n/g," / "))}.`+(mt.pending?" Translation pending.":"")+(ph.flag?" Flagged for review.":"");
  }catch(err){ logErr("savenow",err&&(err.stack||err.message)||err); return failPending(id,"the reading failed"); }
  finally{ delete PENDING[id]; delete SIGN[id]; delete PLACED[id]; delete SPLIT[id]; dropExtraShot(id); }
  S.queue=buildQueue(false); aiAutoSoon(); setStats();
  if(S.mode==="cards"&&!S.editing) render(); else renderShots(); /* the list or the detail shows the filled card at once */
}
async function failPending(id,why,msg){
  const ph=pendingCard(id); delete PENDING[id]; delete SIGN[id]; delete PLACED[id]; delete SPLIT[id]; if(!ph||!ph.reading) return;
  dropExtraShot(id);
  if(ph.reading.auto&&!ph.c){ await dropAuto(id,ph.id); delete READING[id]; QSNOTE[id]=/^the reader did not load/.test(msg||"")?failText("Reading failed: "+msg):t("Nothing could be read. Tap Crop to frame the text by hand."); /* a reader that never loaded is not a photo without text (v335) */ if(S.mode==="cards"&&!S.editing) render(); else renderShots(); return; } /* a card made by itself with nothing to show is no card (v325): the photo stays with Crop */
  if(ph.c) delete ph.reading; else ph.reading.failed=why; /* a card framed again in the Edit form keeps its text and forgets the frame (v241, v243); an empty card keeps the failure for "Nothing read yet" */
  ph.flag=true; ph.flagNote=ph.c?t("the new frame could not be read — the old text stays"):t("the reading failed — edit the card or frame the photo again");
  try{ await idbPut("custom",ph); }catch(e){}
  QSNOTE[id]="Card saved, but nothing could be read — edit the card or frame the photo again."; setStats();
  if(S.mode==="cards"&&!S.editing) render(); else renderShots(); /* the list or the detail shows the filled card at once */
}
async function resumePending(){
  for(const d of S.custom.filter(d=>d.reading&&!d.reading.failed)){
    const rec=d.shot&&S.inbox.find(x=>x.id===d.shot), full=!rec&&fullPhoto(d), rect=d.reading.rect; let key, opts;
    if(rec){ key=d.shot; opts={rect,app:!!d.reading.app}; if(d.reading.auto){ AUTO[key]=true; QSCARD[key]=d.id; } } /* the inbox photo with the saved frame; a card made by itself shows its result in the row again (v325) */
    else if(full&&rect&&rect.lw){ key=d.id; SHOTS_EXTRA[key]={id:key,blob:full,ts:Date.now()}; opts={rect,app:!!d.reading.app}; } /* the photo copied onto the card (v241: a frame from the Edit form after the inbox photo went) */
    else { key=d.id; opts={blob:d.img}; } /* the crop itself */
    if(PENDING[key]) continue; PENDING[key]=d.id;
    try{ await cropSign(key,opts); }catch(e){}
  }
}
const dropExtraShot=id=>{ if(SHOTS_EXTRA[id]){ delete SHOTS_EXTRA[id]; if(IMGURL[id]){ URL.revokeObjectURL(IMGURL[id]); delete IMGURL[id]; } } };
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
  const pv=textProvider(), key=aiKey(pv), relay=!key&&viaRelay(pv); if(!key&&!relay) throw new Error("no API key");
  const model=aiModel(pv), chars=[...line];
  const sys="You correct OCR of Chinese signs, menus and packaging. Answer with a JSON array of single Chinese characters only, most likely first, no prose.";
  const user=insert
    ?`OCR read this line: "${line}". One character is missing ${i===0?"at the start":i>=chars.length?"at the end":`between "${chars[i-1]}" and "${chars[i]}"`}. Give up to 4 likely characters for that gap, judging from the context.`
    :`OCR read this line: "${line}". Character ${i+1} ("${chars[i]}") is probably misread. Give up to 4 likely correct characters for that position, judging from the context.`;
  let r;
  if(pv==="claude") r=await aiFetch(aiBase(pv),{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model,max_tokens:100,system:sys,messages:[{role:"user",content:user}]})});
  else { const body=noThinking(pv,model,{model,max_tokens:100,temperature:0,messages:[{role:"system",content:sys},{role:"user",content:user}]});
    r=relay?await relayFetch(pv,body):await aiFetch(aiBase(pv)+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+key},body:JSON.stringify(body)}); }
  if(!r.ok) throw new Error(relay?relayError(r):"API error "+r.status);
  const data=await r.json(); countTokens(pv,data); bumpModel(model);
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
  return `<div class="cstrip${sg.sel?" selecting":""}">${[...line].map((ch,i)=>{ const isC=CJK.test(ch); const c=isC?cf[ci++]:100;
    return `<button class="ck${isC&&c<OCR_DOUBT?" low":""}${sg.sel&&sg.sel.has(k+","+i)?" on":""}" data-ck="${k},${i}" data-sid="${id}" title="${isC&&c<100?Math.round(c)+"%":""}">${esc(shown?shown[i]:ch)}</button>`; }).join("")}</div>`; /* no + tile at the end (H, v121) — adding goes through the picker's "+ before / + after" or the line input */
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
    const where=ins?(i===0?t("at the start"):i>=chars.length?t("at the end"):t("between {0} and {1}",`<b class="hanzi">${esc(chars[i-1])}</b>`,`<b class="hanzi">${esc(chars[i])}</b>`)):"";
    box.innerHTML=`<div class="ckhead"><span class="badge">${ins?t("Add a character {0}:",where):t("Replace {0} with:",`<b class="hanzi">${esc(ch)}</b>`)}</span><button class="ckx" id="ck-x-${id}" aria-label="${t("Close")}">×</button></div>
      <div class="cands">${ai.filter(c=>!seen.has(c)&&seen.add(c)).map(c=>`<button class="ck ai" data-rep="${esc(c)}">${esc(c)}</button>`).join("")}${dict.filter(c=>!seen.has(c)&&seen.add(c)).map(c=>`<button class="ck" data-rep="${esc(c)}">${esc(c)}</button>`).join("")}${!dict.length&&!ai.length&&!aiBusy?`<span class="badge">${t("No match — draw it or ask the AI.")}</span>`:""}${aiBusy?`<span class="badge">${t("Asking the AI …")}</span>`:""}</div>
      <div class="ckacts">${ins||chars.length<=1?"":`<button class="btn mini danger" id="ck-del-${id}">${t("Remove {0}",`<span class="hanzi">${esc(ch)}</span>`)}</button>`}<button class="btn mini" id="ck-draw-${id}">${t("Not here? Draw it")}</button>${aiOn()&&!ai.length&&!aiBusy?`<button class="btn mini" id="ck-ai-${id}">${t("Ask AI")}</button>`:""}</div>
      ${ins?"":`<div class="ckacts ckadd"><span class="badge">${t("Add a character:")}</span><button class="del" id="ck-ins0-${id}">${t("+ before {0}",`<span class="hanzi">${esc(ch)}</span>`)}</button><button class="del" id="ck-ins1-${id}">${t("+ after {0}",`<span class="hanzi">${esc(ch)}</span>`)}</button></div>`}`;
    box.querySelectorAll("[data-rep]").forEach(b=> b.onclick=()=>apply(b.dataset.rep));
    const del=$("#ck-del-"+id); if(del) del.onclick=()=>apply(null);
    const i0=$("#ck-ins0-"+id); if(i0) i0.onclick=()=>openCharPick(id,k,i,btn,"ins");
    const i1=$("#ck-ins1-"+id); if(i1) i1.onclick=()=>openCharPick(id,k,i+1,btn,"ins");
    $("#ck-x-"+id).onclick=()=>{ box.remove(); btn.classList.remove("on"); };
    const ab=$("#ck-ai-"+id); if(ab) ab.onclick=()=>askAI(dict);
    $("#ck-draw-"+id).onclick=()=>openDrawSheet(id,k,i,apply,ins);
  };
  const askAI=async(dict)=>{ render(dict,[],true); try{ const alts=await aiCharAlternatives(line,i,ins); if(!box.isConnected) return; render(dict,alts,false); if(!alts.length) box.querySelector(".cands").insertAdjacentHTML("beforeend",`<span class="badge">${t("The AI has no better idea.")}</span>`); }catch(err){ if(!box.isConnected) return; render(dict,[],false); box.querySelector(".cands").insertAdjacentHTML("beforeend",`<span class="badge">${t(AI_NET_ERR)}.</span>`); } };
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
  const noRef=!sg.img; /* a card without a photo (the Add form's "Draw a character", an Edit form without an image): the pad alone (v159) */
  el.innerHTML=`<div class="dshead"><div class="badge">${noRef?t("Draw the character below."):t("The character in the photo (drag to move, pinch to zoom) — draw it below.")}</div><button class="del" id="ds-x">${t("Cancel")}</button></div>
    ${noRef?"":`<canvas class="ckref" width="1" height="1" title="${t("the character in the photo")}"></canvas>`}
    <canvas class="pad" width="${DRAW_SIZE}" height="${DRAW_SIZE}"></canvas>
    <div class="badge" id="ds-st">${t("Draw all strokes, then tap Done.")}</div>
    <div class="cands" id="ds-cands"></div>
    <div class="ckacts"><button class="del" id="ds-undo">${t("pad:Undo")}</button><button class="del" id="ds-clear">${t("Clear")}</button><span class="grow"></span><button class="btn primary" id="ds-done">${t("Done")}</button></div>`;
  document.body.appendChild(el); document.body.classList.add("noscroll");
  /* symmetric: the photo character and the pad are two squares of the same side, as big as the screen allows (H) */
  const fitRef=()=>{ const rc=el.querySelector(".ckref"), pd=el.querySelector(".pad"); if(!pd||!pd.isConnected) return;
    const sq=[rc,pd].filter(Boolean); sq.forEach(c=>{ c.style.width="0px"; c.style.height="0px"; });
    const cs=getComputedStyle(el), gap=parseFloat(cs.rowGap)||0, kids=[...el.children];
    const used=kids.reduce((a,c)=>a+c.getBoundingClientRect().height,0)+gap*(kids.length-1)+parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom);
    const S=Math.max(160,Math.min(el.clientWidth-32,Math.floor((el.clientHeight-used)/sq.length)));
    sq.forEach(c=>{ c.style.width=S+"px"; c.style.height=S+"px"; }); };
  fitRef(); const refView=noRef?{ready:Promise.resolve(),close(){}}:attachRefView(el.querySelector(".ckref"),sg,k,ins?-1:i); refView.ready.then(fitRef); /* a new character has no box: the whole crop */ el.refView=refView; /* used by the tests */
  window.addEventListener("resize",fitRef);
  const cv=el.querySelector(".pad"), ctx=cv.getContext("2d"), strokes=[]; let cur=null, seq=0;
  const status=x=>{ const st=el.querySelector("#ds-st"); if(st) st.textContent=x; };
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
    if(!strokes.length){ status(t("Draw the character first.")); return; }
    try{
      const w=await ocrWorker(status); if(my!==seq) return;
      status(t("reading …"));
      /* stroke matching first (v141), the print model's readings after it; the database may be missing on a first use offline */
      let sm=[]; try{ sm=await strokeMatch(strokes); }catch(err){ logErr("strokes",err&&err.message||err); }
      const good=sm.filter(x=>x.cost<0.4).slice(0,5).map(x=>x.ch);
      const ocr=await recognizeStrokes(w,strokes,p=>{ if(my===seq) status(t("reading … {0}%",p)); });
      const alts=[...new Set([...good,...ocr])].slice(0,6);
      DRAWLOG.push({t:Date.now(),strokes:strokes.map(st=>st.map(p=>[Math.round(p[0]),Math.round(p[1])])),alts,strokes_best:sm.slice(0,5).map(x=>x.ch+":"+x.cost.toFixed(2)),ocr}); while(DRAWLOG.length>3) DRAWLOG.shift(); /* the phone's real strokes for the diagnostics (v140) */
      if(my!==seq||!el.isConnected) return;
      const ctxc=SIGN[id]?charCandidates(SIGN[id].lines[k],i,ins):[];
      const ranked=alts.slice().sort((a,b)=>(ctxc.includes(b)?1:0)-(ctxc.includes(a)?1:0)); /* what fits the neighbours first, otherwise the stroke match's order */
      showCands(ranked);
      status(ranked.length?t("Read as — tap the right one. Not there? Clear and draw again."):t("Not recognized — try cleaner, well-separated strokes."));
    }catch(err){ if(my===seq) status(t("Reading failed: {0}",err&&err.message||err)); }
  };
  el.querySelector("#ds-undo").onclick=()=>{ strokes.pop(); seq++; showCands([]); paint(); status(t("Draw all strokes, then tap Done.")); };
  el.querySelector("#ds-clear").onclick=()=>{ strokes.length=0; seq++; showCands([]); paint(); status(t("Draw all strokes, then tap Done.")); };
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
    let r=await vendorFetch("strokes.txt.gz").catch(err=>{ if(!swControls()) throw err; return {ok:false,status:err.message}; });
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
   Edit"; v147: a two-way switch instead of a link — "could be misunderstood"): a switch "Simplified | Traditional" under
   the characters in the Read preview and the Edit form; the strip and the line switch form, the reference line comes
   and goes, the key stays simplified. Shown only when the reader detected traditional characters on the photo, or the
   card carries the traditional form (`sg.tradDetected`; v150, H: "show the toggle option only if traditional chinese was
   detected in the photo" — v149 had shown it everywhere, greyed where both scripts are the same); once shown it stays,
   so a switch to Simplified can be undone. */
function scriptSwitchHTML(id,sg){
  if(!sg.trad&&!sg.tradDetected) return "";
  const txt=sg.lines.map(l=>l.trim()).filter(Boolean).join("\n"), same=!sg.trad&&S2T&&s2t(txt)===txt;
  return `<div class="seg" data-scriptseg="${id}"><button type="button" class="segbtn${sg.trad?"":" on"}" data-scriptset="0">${t("Simplified")}</button><button type="button" class="segbtn${sg.trad?" on":""}" data-scriptset="1"${same?" disabled":""}>${t("Traditional")}</button></div>`;
}
async function setScript(sg,on){
  sg.tradUser=true; sg.tradTouched=false;
  if(on){ await loadScriptTables(); const txt=sg.lines.join("\n"), t=s2t(txt); if(t===txt){ sg.trad=false; sg.tradText=""; return; } sg.trad=true; sg.tradText=t; }
  else { sg.trad=false; sg.tradText=""; }
}
function tradLine(sg,k){ const line=sg.lines[k]; if(!sg.trad) return line; const t=(sg.tradText||"").split("\n")[k]; return t&&[...t].length===[...line].length?t:s2t(line); }
function slineHTML(id,k,line,withPinyin,withInput=true){
  const sg=SIGN[id]; /* withInput=false: the Read preview shows the strip alone (H, v109: the line field under it was one thing too many); the Edit form keeps it for retyping */
  const empty=!(line||"").trim(); /* a card saved before its reading and never read (v238): nothing to tap yet */
  const tx=empty?t("Type the text below."):t("Tap a character to change it")+(withInput?t(", or type the line below"):"")+".";
  const hint=k===0?`<div class="badge ckhint" data-hint="${id}" data-text="${tx}">${sg&&sg.sel?t(SEL_HINT):tx}</div>`:""; /* right under the strip (H, v112) */
  return `<div class="sline">${empty?"":charStripHTML(id,k)}${hint}${withInput?`<input class="hanzi" data-sid="${id}" data-sline="${k}" value="${esc(sg&&sg.trad?tradLine(sg,k):line)}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">`:""}${withPinyin?`<div class="sp" id="sp-${id}-${k}"></div>`:""}</div>`;
}
/* Several characters removed at once (v204, H: "select them first and then remove them all together", described first and
   built on "Go"): a Select button under the strips puts the reading into selection (sg.sel, the set of "k,i" positions) —
   the strip's taps then mark and unmark instead of opening the picker, the row shows "Remove N" (disabled while nothing
   or everything is marked — the text can never be emptied) and Done; Remove drops the positions, an emptied line with
   them, and re-checks like the picker's apply. The same row sits in the Edit form, whose strips are the same component. */
const SEL_HINT="Tap the characters to remove, then Remove.";
function selRowHTML(id){ const sg=SIGN[id]; if(!sg||!sg.lines.some(l=>l.trim())) return ""; return `<div class="fieldacts selrow" data-selrow="${id}">${selRowInner(id)}</div>`; }
function selRowInner(id){
  const sg=SIGN[id]; if(!sg) return "";
  if(!sg.sel) return `<button class="btn mini" data-selstart="${id}">${t("Select")}</button>`;
  const n=sg.sel.size, all=n>=sg.lines.reduce((a,l)=>a+[...l].length,0);
  return `<button class="btn mini danger" data-selremove="${id}"${!n||all?" disabled":""}>${n?t("Remove {0}",n):t("Remove")}</button><button class="btn mini" data-seldone="${id}">${t("Done")}</button>`;
}
const selScope=root=>(root.closest&&root.closest(".field"))||root; /* the row sits on the Characters label's line (v272) — outside the Edit form's strip box, so the wiring looks in the whole field */
function selRowRefresh(root,id){
  const sg=SIGN[id], row=selScope(root).querySelector(`[data-selrow="${id}"]`); if(!sg||!row) return;
  row.innerHTML=selRowInner(id);
  const h=root.querySelector(`[data-hint="${id}"]`); if(h) h.textContent=sg.sel?t(SEL_HINT):h.dataset.text;
  if(!sg.sel) root.querySelectorAll(`[data-ck][data-sid="${id}"]`).forEach(b=>b.classList.remove("on"));
  root.querySelectorAll(".cstrip").forEach(st=>{ const f=st.querySelector("[data-ck]"); if(f&&f.dataset.sid===id) st.classList.toggle("selecting",!!sg.sel); }); /* the strip takes the finger while selecting (v205) */
  wireSel(root);
}
function wireSel(root){
  const sc=selScope(root);
  sc.querySelectorAll("[data-selstart]").forEach(b=> b.onclick=()=>{ const id=b.dataset.selstart, sg=SIGN[id]; if(!sg) return; sg.sel=new Set(); root.querySelectorAll(".ckpick").forEach(p=>p.remove()); selRowRefresh(root,id); });
  sc.querySelectorAll("[data-seldone]").forEach(b=> b.onclick=()=>{ const id=b.dataset.seldone, sg=SIGN[id]; if(!sg) return; sg.sel=null; selRowRefresh(root,id); });
  sc.querySelectorAll("[data-selremove]").forEach(b=> b.onclick=()=>{ const id=b.dataset.selremove, sg=SIGN[id]; if(sg) removeSelected(sg,id); });
}
function removeSelected(sg,id){
  const sel=sg.sel; if(!sel||!sel.size) return; sg.sel=null;
  const tl=sg.trad&&sg.tradTouched?(sg.tradText||"").split("\n"):null, L=[], O=[], C=[], B=[], T=[];
  sg.lines.forEach((line,k)=>{ const cs=[...line], keep=cs.map((_,i)=>!sel.has(k+","+i)), out=cs.filter((_,i)=>keep[i]); if(!out.length) return; /* an emptied line goes */
    L.push(out.join("")); O.push((sg.orig||[])[k]); C.push((sg.conf||[])[k]); B.push((sg.boxes||[])[k]);
    if(tl){ const tc=[...(tl[k]||"")]; T.push(tc.length===cs.length?tc.filter((_,i)=>keep[i]).join(""):s2t(out.join(""))); } });
  if(!L.length) return; /* never everything — the button is disabled then */
  sg.lines=L; if(sg.orig) sg.orig=O; if(sg.conf) sg.conf=C; if(sg.boxes) sg.boxes=B; if(tl) sg.tradText=T.join("\n");
  delete sg.ai; delete sg.aiErr;
  if(sg.onChange){ sg.onChange(); return; } /* the Edit form owns the re-render and the AI check */
  renderShots(); if(aiLive()) signAskAI(id);
}
/* the strip's character buttons open the picker (or mark, while selecting); typing in a line calls onInput(sg, k, input) */
function wireSlines(root,onInput,onCommit){
  wireSel(root); /* onCommit(sg,id): the line input was left after typing — the strip is redrawn from the text, the caller re-checks */
  root.querySelectorAll("[data-ck]").forEach(b=>{
    b.onclick=()=>{ const sg=SIGN[b.dataset.sid]; if(sg&&sg.sel) return; /* while selecting, the pointer marks (below) */ const [k,i]=b.dataset.ck.split(",").map(Number); openCharPick(b.dataset.sid,k,i,b); };
    /* a finger drawn along the strip marks every character it passes (v205, H: "swipe over multiple characters in select
       mode and select them all"): the first character decides — starting on a marked one, the stroke unmarks; the strips
       carry touch-action:none while selecting, so the stroke does not scroll; a tap is a stroke of one character */
    b.onpointerdown=e=>{ const sg=SIGN[b.dataset.sid]; if(!sg||!sg.sel) return; e.preventDefault();
      const id=b.dataset.sid, paint=!sg.sel.has(b.dataset.ck), seen=new Set();
      const mark=el=>{ if(!el||el.dataset.sid!==id||!el.dataset.ck||seen.has(el.dataset.ck)) return; seen.add(el.dataset.ck); if(paint) sg.sel.add(el.dataset.ck); else sg.sel.delete(el.dataset.ck); el.classList.toggle("on",paint); selRowRefresh(root,id); };
      mark(b); try{ b.setPointerCapture(e.pointerId); }catch(err){}
      b.onpointermove=ev=>{ const el=document.elementFromPoint(ev.clientX,ev.clientY); mark(el&&el.closest?el.closest("[data-ck]"):null); };
      b.onpointerup=b.onpointercancel=()=>{ b.onpointermove=null; b.onpointerup=b.onpointercancel=null; }; };
  });
  root.querySelectorAll("[data-sline]").forEach(inp=> inp.oninput=()=>{ const sg=SIGN[inp.dataset.sid]; if(!sg) return; const k=+inp.dataset.sline;
    if(sg.sel){ sg.sel=null; selRowRefresh(root,inp.dataset.sid); } /* typing shifts the positions — the selection is dropped */
    if(sg.trad){ sg.tradTouched=true; const tl=(sg.tradText||"").split("\n"); while(tl.length<=k) tl.push(""); tl[k]=inp.value; sg.tradText=tl.join("\n"); sg.lines[k]=t2s(inp.value); }
    else sg.lines[k]=inp.value;
    onInput(sg,inp.dataset.sid); });
  root.querySelectorAll("[data-sline]").forEach(inp=> inp.onchange=()=>{ const sg=SIGN[inp.dataset.sid]; if(!sg) return; const k=+inp.dataset.sline, sl=inp.closest(".sline"), strip=sl&&sl.querySelector(".cstrip");
    if(strip){ strip.outerHTML=charStripHTML(inp.dataset.sid,k); wireSlines(sl,onInput,onCommit); } /* the buttons follow the typed line */
    else if(sl&&inp.value.trim()){ sl.insertAdjacentHTML("afterbegin",charStripHTML(inp.dataset.sid,k)); const h=sl.querySelector(".ckhint"); if(h) h.dataset.text=h.textContent=t("Tap a character to change it")+t(", or type the line below")+"."; /* the first text of a card saved before its reading (v238): the strip appears with it */
      if(!selScope(root).querySelector("[data-selrow]")){ const lr=selScope(root).querySelector(".labelrow"); (lr||root).insertAdjacentHTML("beforeend",selRowHTML(inp.dataset.sid)); } wireSlines(sl,onInput,onCommit); wireSel(root); }
    if(onCommit) onCommit(sg,inp.dataset.sid,k); });
  root.querySelectorAll("[data-spin]").forEach(el=> el.oninput=()=>{ const sg=SIGN[el.dataset.spin]; if(sg){ sg.pinTouched=true; sg.pinEdit=el.value; } });
  root.querySelectorAll("[data-smean]").forEach(el=> el.oninput=()=>{ const sg=SIGN[el.dataset.smean]; if(sg){ sg.meanTouched=true; sg.meanEdit=el.value; } });
  root.querySelectorAll("[data-sflag]").forEach(cb=> cb.onchange=()=>{ const sg=SIGN[cb.dataset.sflag]; if(!sg) return; sg.flag=cb.checked; const n=root.querySelector(`[data-snote="${cb.dataset.sflag}"]`); if(n){ n.hidden=!cb.checked; if(cb.checked) n.focus(); } });
  root.querySelectorAll("[data-snote]").forEach(n=> n.oninput=()=>{ const sg=SIGN[n.dataset.snote]; if(sg) sg.flagNote=n.value; });
  wireGrow(root);
}
/* the AI's failure as a sentence for the user (v201): the network case says what to do, a provider's answer is named as the check's failure */
const aiErrText=e=>e===AI_NET_ERR?t(AI_NET_ERR)+t(". Tap Ask AI to try again."):/^[a-z]/.test(e)?t("The AI check failed: {0}",e):e;
function signEditorHTML(id){
  const sg=SIGN[id]; if(!sg) return "";
  const rows=sg.lines.map((l,k)=>slineHTML(id,k,l,false,true)).join(""); /* the line input is back under the strip (v120, H: "type the correct hanzi in a text field, like in Edit mode" — it went in v109) */
  const low=sg.conf?Math.min(...sg.conf.flat().concat([100])):100;
  const doubt=!aiLive()&&low<OCR_DOUBT?t(" The reading looks uncertain (confidence {0}%) — check the text.",Math.round(low)):"";
  const bad=sg.ai&&sg.ai.bad;
  /* no status about the AI (H, v105: "not relevant for user") — the text is either fine, or it needs a hand */
  const head=sg.aiBusy?"":bad?t("This reading looks wrong — frame the text tightly and read again, or fix the characters."):sg.ai&&!sg.ai.kept?"":doubt.trim(); /* the tap hint sits under the strip (H, v111) */
  /* the reading crop is not shown (H: "the user doesn't have to see it") — it serves the picker's reference only */
  const nChars=sg.lines.join("").replace(/[^\u4e00-\u9fff]/g,"").length, meanCf=(sg.conf||[]).flat().reduce((a,c,_,arr)=>a+c/arr.length,0);
  const weak=nChars<=2&&meanCf<85?`<div class="err" style="margin:4px 0 8px">${t("Only {0} found — if the photo shows more, frame the characters tightly and drag a corner to read again.",nOf(nChars,"character"))}</div>`:"";

  /* the same layout as the Edit form (H): Text, Pinyin, Meaning — pinyin and meaning can be corrected before saving */
  return `<div class="signed">${weak}${head?`<div class="badge${bad?" bad":""}" style="margin-bottom:8px">${head}</div>`:""}
    <div class="field"><div class="labelrow"><label>${t("Characters")}${sg.trad?t(" (traditional, as on the photo)"):""}${sg.ai&&sg.ai.pic&&!sg.ai.bad?picMark():""}</label>${selRowHTML(id)}</div>${rows}<div class="scriptline">${scriptSwitchHTML(id,sg)}</div></div>
    <div class="field"><label>${t("Pinyin")}</label><textarea class="grow" id="spin-${id}" rows="1" data-spin="${id}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">${esc(sg.pinEdit||"")}</textarea></div>
    <div class="field"><label>${t("Meaning")}</label><textarea class="grow" id="smeanf-${id}" rows="1" data-smean="${id}">${esc(sg.meanEdit||"")}</textarea><div class="smean badge" id="smean-${id}" style="margin-top:4px"></div></div>
    <div class="field"><label class="check"><input type="checkbox" data-sflag="${id}"${sg.flag?" checked":""}> ${t("⚑ Flag for review (text, pinyin or meaning looks wrong)")}</label>
      <input data-snote="${id}" value="${esc(sg.flagNote||"")}" placeholder="${t("Note for the reviewer (optional)")}"${sg.flag?"":" hidden"}></div>
    ${tagsFieldHTML("stags-"+id,sg.tags)}
    <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" data-signsave="${id}">${t("Save card")}</button>${aiOn()&&!sg.ai&&!sg.aiBusy?`<button class="btn mini" data-signai="${id}">${t("Ask AI")}</button>`:""}<button class="del" data-signcancel="${id}">${t("Cancel")}</button></div>
    ${sg.aiErr?`<div class="err" style="margin-top:6px">${esc(aiErrText(sg.aiErr))}</div>`:""}</div>`;
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
  if(sm&&sg.aiBusy){ sm.className="smean badge"; sm.innerHTML=busyHTML(t(AI_BUSY_TEXT)); } /* the bar under the meaning while the AI runs (v200) */
  else if(sm){ sm.className="smean badge"+(good?" ai":sg.ai&&!sg.ai.kept?" bad":"");
    sm.textContent=good
    ?"" /* a good answer shows nothing: no "checked by the AI" (H, v104/v105), no remark of the model (v154, H: "don't show the OCR slip message to the user"), and since v174 not "Read from the picture by the AI." either (H: "not relevant to the user") — a picture answer shows a small mark on the Characters label instead (v176/v177) */
    :sg.ai&&sg.ai.kept?t("The AI suggested {0}, but {1} was read clearly, so the reading stays. ",sg.ai.proposed.replace(/\n/g," / "),sg.ai.kept)+t("Meaning {0}, unverified",full?t("from the phrasebook"):t("composed word by word"))+"."
    :sg.ai?t("This text looks misread{0} — unverified",sg.ai.note?": "+sg.ai.note:"")
    :t("Meaning {0}, unverified",full?t("from the phrasebook"):t("composed word by word")); }
  /* the traditional form follows the text (the AI's "zht" when it matches, else the character table) unless edited by hand */
  if(sg.trad){
    if(!sg.tradTouched){ const zh=sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)).join("\n"), zht=good&&sg.ai.zht&&[...sg.ai.zht].length===[...zh].length?sg.ai.zht:s2t(zh); sg.tradText=zht; }
    document.querySelectorAll(`[data-sid="${id}"][data-sline]`).forEach(inp=>{ if(document.activeElement!==inp){ const v=tradLine(sg,+inp.dataset.sline); if(inp.value!==v) inp.value=v; } });
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
/* a small quiet mark on the Characters label when the AI read the text from the picture (v176; under the meaning at first, moved in v177 — H: "the icon belongs under the Chinese characters, not the translation") */
const picMark=()=>`<span class="picmark" title="${t("Read from the picture by the AI")}"><svg viewBox="0 0 24 24" style="fill:var(--ok)"><path d="M12 2.5l2.3 6.2 6.2 2.3-6.2 2.3L12 19.5l-2.3-6.2-6.2-2.3 6.2-2.3z"/><path d="M19.5 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z"/></svg>AI</span>`; /* the green AI capsule of the Cards list, with a sparkle (v180, H: "place the AI icon more sexy") */
/* A garbage verdict sends the picture (v302, H's 绿皮书 poster framed by hand: the reader's soup 绿区十 / 月时，全网上妾 scored
   above the weak line — confident garbage with two accidental dictionary words —, so no picture went out, and DeepSeek
   called it garbage three times; the card kept its gloss and the flag, and H: "Looks like AI check for pinyin and
   description doesn't work anymore?"): when the text check answers bad and the picture path is open (a provider that
   takes pictures, the automatic check on, online) and this reading has not sent its picture yet, the picture goes now —
   the placed frame's cut, else the straightened frame, as the weak path sends it — and a good answer replaces the reading
   as there; a bad answer or a failed call leaves the garbage verdict as before. Once per reading (`picAsked`). */
async function picOnBad(sg,guesses,status){
  if(!sg||sg.picAsked||!sg.picBlob||!pictureProvider()||!aiAutoOn()||!navigator.onLine) return null;
  sg.picAsked=true; logRead("the text check called the reading garbage — the AI gets the picture");
  try{ const pic=await aiReadPicture(sg.picBlob,[...new Set(guesses.filter(Boolean))].slice(0,6),status||(()=>{})); if(sg.region) sg.region.pic={zh:pic.zh,bad:pic.bad,model:pic.model,box:pic.box,boxes:pic.boxes,dropped:pic.dropped}; if(pic&&pic.bad) sg.noText=true; return pic&&!pic.bad?pic:null; }
  catch(err){ logErr("picture",err&&err.message||String(err)); return null; }
}
async function signAskAI(id){
  const sg=SIGN[id]; if(!sg||sg.aiBusy) return;
  signPreview(id);
  const lines=sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)); if(!lines.length) return;
  sg.aiBusy="Asking the AI …"; delete sg.aiErr; renderShots();
  sg.aiPromise=(async()=>{ try{
    const c=lines.join("\n"), res=(sg.res||[]).filter(Boolean);
    const [r]=await aiAsk([{kind:"sign",c,p:res.map(x=>x.py).join(" / "),m:sg.mean||"",gloss:res.flatMap(x=>x.gloss),alts:sg.alts,trad:!!sg.trad,mt:{src:"gloss",verified:false,suspect:"read from a photo by OCR"}}]);
    if(!SIGN[id]) return;
    const pic=r.bad?await picOnBad(sg,[c,...(sg.alts||[])]):null; if(!SIGN[id]) return; /* the text check calls the reading garbage: the picture goes to the AI that takes pictures (v302) */
    if(pic){ const zh=pic.zh.split("\n"); sg.lines=zh; sg.orig=zh.slice(); sg.conf=[]; sg.boxes=zh.map(()=>[]); sg.alts=[c,...(sg.alts||[])].filter(x=>x&&x!==pic.zh).slice(0,6); sg.trad=!!pic.zht; sg.tradDetected=!!pic.zht; sg.tradText=pic.zht||""; sg.weak=false;
      sg.ai={zh:pic.zh,zht:pic.zht,p:pic.p,m:pic.m,ml:pic.ml,note:pic.note,kind:pic.kind,ok:true,bad:false,pic:true}; } /* as the weak path's answer: open characters, no boxes, the reader's texts as the alternatives, the mark on the label */
    else {
    let zh=r.zh&&CJK.test(r.zh)&&!r.bad?r.zh.replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean).join("\n"):c;
    zh=recutLines(zh,lines); /* the model often drops the line breaks — the photo's lines win */
    const kept=zh!==c?aiSettled(sg,lines,zh):"";
    if(kept){ sg.ai={zh:c,proposed:zh,kept,zht:"",p:"",m:"",note:r.note,kind:r.kind,ok:false,bad:false}; }
    else { sg.lines=zh.split("\n"); sg.ai={zh,zht:r.zht&&CJK.test(r.zht)?recutLines(r.zht.replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean).join("\n"),lines):"",p:r.p,m:r.m,ml:r.ml,note:r.note,kind:r.kind,ok:r.ok,bad:!!r.bad};
    if(r.bad&&!sg.flag){ sg.flag=true; sg.flagNote=sg.flagNote||t("the reading looks wrong"); } } } /* H's rule: when unsure, flag instead of inventing */
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
  if(sg.nmt&&sg.nmt.lines===lines.join("\n")){ const mf=$(`#smeanf-${id}`); if(mf&&!sg.meanTouched&&sg.nmt.m) mf.value=sg.nmt.m; return; } /* already translated these lines (v194) */
  const tok=sg.tok=(sg.tok||0)+1;
  const sm=$(`#smean-${id}`);
  try{
    const r=await signMeaning(lines,x=>{ const el=$(`#smean-${id}`); if(el) el.textContent=x; });
    if(sg.tok!==tok||!SIGN[id]) return;
    const box=$(`#smean-${id}`), mf=$(`#smeanf-${id}`);
    if(box) box.textContent=t("Meaning {0}, unverified",r.src==="nmt"?t("from the offline translation"):r.src==="phrasebook"?t("from the phrasebook"):t("composed word by word"));
    if(mf&&!sg.meanTouched&&r.m){ mf.value=r.m; autoGrow(mf); }
    sg.nmt={lines:lines.join("\n"),m:r.m,src:r.src,pending:r.pending}; /* Save reuses it for the same lines (v194, H: the Save button read "Translating …" — the model ran a second time) */
  }catch(err){ if(sm) sm.textContent=t("Offline translation failed, meaning composed word by word"); }
}
/* the card from a reading — text, pinyin, meaning, source — without the document (the background finish uses it too, v237) */
async function readingCard(id,sg){
  signPreview(id);
  const keep=sg.lines.map((l,k)=>({l:l.trim(),r:sg.res&&sg.res[k]})).filter(x=>x.r);
  if(!keep.length) return null;
  const c=keep.map(x=>x.l).join("\n");
  /* meaning: AI check (if done here) → phrasebook → offline translation (if enabled) → word gloss (then pending) */
  let mt={src:sg.full?"phrasebook":"gloss",verified:false,pending:!sg.full}, mean=sg.mean||"", pin=keep.map(x=>x.r.py).join(" / ");
  let ml="en"; /* the meaning's language (v256): the AI answers in the app's language, a typed meaning counts as the app's language, the dictionary and the offline model are English */
  if(sg.ai && c===sg.ai.zh && !sg.ai.bad && !sg.ai.kept){ mean=sg.ai.m||mean; pin=sg.ai.p||pin; mt={src:"llm",verified:true,pending:false}; if(sg.ai.m) ml=sg.ai.ml||"en"; }
  const pinHand=sg.pinTouched&&(sg.pinEdit||"").replace(/\s+/g," ").trim(), meanHand=sg.meanTouched&&(sg.meanEdit||"").replace(/\s+/g," ").trim();
  if(pinHand) pin=pinHand;
  if(meanHand){ mean=meanHand; mt={...mt,verified:true,pending:false}; ml=LANG; } /* H wrote the meaning: no offline model, no pending */
  else if(!meanHand && !sg.full && nmtOn() && !(aiLive()&&!sg.aiErr)){ /* no connection (or AI failed): offline model */
    const done=sg.nmt&&sg.nmt.lines===keep.map(x=>x.l).join("\n")?sg.nmt:null; /* the preview's translation of these very lines */
    if(done){ mean=done.m||mean; mt={src:done.src,verified:false,pending:done.pending}; }
    else { const btn=document.querySelector(`[data-signsave="${id}"]`); if(btn){ btn.disabled=true; btn.textContent=t("Translating …"); }
      try{ const r=await signMeaning(keep.map(x=>x.l)); mean=r.m||mean; mt={src:r.src,verified:false,pending:r.pending}; }catch(e){} }
  }
  /* doubtful OCR: low confidence on a line H did not correct, or words the dictionary does not know */
  const cfs=sg.lines.flatMap((l,k)=>(sg.orig&&sg.orig[k]===l.trim()&&sg.conf&&sg.conf[k])||[]);
  const unknown=keep.flatMap(x=>x.r.gloss.filter(g=>!g.ph&&!g.m).map(g=>g.w));
  const why=mt.src==="llm"?"":ocrDoubt(cfs,null,unknown); if(why) mt.suspect=why;
  if(sg.ai&&sg.ai.bad) mt.suspect="the text looks misread";
  /* a short single line is a word card (reticle front); anything longer is a sign card */
  const word=keep.length===1 && glyphs(c)<=4;
  const card=word
    ? { id:cardId(c), c, p:pin, m:mean, t:"Custom", at:Date.now(), shot:id, lb:"photo", mt, ...(keep[0].r.segs.filter(x=>CJK.test(x)||NUM_PART.test(x)).length>1?{seg:keep[0].r.segs.filter(x=>CJK.test(x)||NUM_PART.test(x)), gloss:keep[0].r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))}:{}) }
    : { id:cardId(c), kind:"sign", c, p:pin, m:mean, t:"Sign", at:Date.now(), shot:id,
        segs:keep.map(x=>x.r.segs), gloss:keep.flatMap(x=>x.r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))), mt };
  setMl(card,ml);
  if(sg.flag){ card.flag=true; const note=(sg.flagNote||"").trim(); if(note) card.flagNote=note; } /* H: flag a new card at once, without opening it again */
  if(sg.tags&&sg.tags.length) card.tags=sg.tags.slice();
  const kt=sg.ai&&!sg.ai.bad?kindTag(sg.ai.kind):""; /* the kind the AI named, as an ordinary tag beside H's own (v364) */
  if(kt&&!(card.tags||[]).includes(kt)) card.tags=[...(card.tags||[]),kt];
  if(sg.alts&&sg.alts.length) card.alts=sg.alts.slice(0,5); /* the other readings stay with the card for a later AI check */
  if(sg.trad&&(sg.tradText||"").trim()) card.trad=sg.tradText.trim(); /* the text as it stands on the photo, in traditional characters (v101) */
  return {card,c,mt};
}
async function saveSign(id){
  const sg=SIGN[id]; if(!sg) return;
  if(sg.aiPromise){ const b=document.querySelector(`[data-signsave="${id}"]`); if(b){ b.disabled=true; b.textContent="Checking …"; } await sg.aiPromise; if(!SIGN[id]) return; }
  const built=await readingCard(id,sg); if(!built) return;
  const {card,c,mt}=built;
  if(deck().some(d=>d.c===c&&d.shot===id)){ sg.aiErr=t("This text is already saved from this photo."); renderShots(); return; } /* the same text from another photo is a new card (H, v118) */
  const pic=sg.cardImg||S.pendingImg; if(pic) card.img=await cardJpeg(pic);
  { const win=CROP&&CROP.id===id&&CROP.rect?await windowCut(id,CROP.rect):null; if(win) card.img=await cardJpeg(win.blob); } /* the 16:9 window around the text (v329) */
  if(S.pendingFull&&!S.inbox.some(x=>x.id===id)) card.imgFull=S.pendingFull; /* the whole photo stays in the inbox, not twice (v214) */
  S.pendingImg=null; S.pendingFull=null; S.pendingShot=null; /* used up — the Add form once showed the last photo's crop on a card made from scratch (v188) */
  if(CROP&&CROP.id===id&&CROP.rect) card.frame=frameOf(CROP.rect); /* the frame, for Crop again (v244) */
  bump("byPhoto"); S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false); QSCARD[id]=card.id;
  delete SIGN[id]; if(CROP&&CROP.id===id) CROP=null; /* saved — the frame has done its job */
  QSNOTE[id]=t("Card saved — {0}.",esc(c.replace(/\n/g," / ")))+(mt.pending?t(" Translation pending."):"")+(card.flag?t(" Flagged for review."):""); /* no word about sources or the AI (H, v105) */
  aiAutoSoon();
  setStats(); renderShots();
}
/* ---------- Kamera / Inbox ---------- */
let READER_WARMED=false;
async function warmReader(){ /* the Camera tab loads the reader ahead of the first photo when its files are already on the phone (v290) — no download is started for a tab that is only looked at */
  if(READER_WARMED||_ocrWorker||_ocrLoading) return; READER_WARMED=true;
  try{ if(await ocrCached()<OCR_FILES.length) return; await ocrWorker(()=>{}); }catch(e){}
}
function renderInbox(main){
  warmReader();
  main.innerHTML=`<div class="pane">
    <div class="lead">${t("Photos stay on this phone. Take one — the card is made for you.")}</div>
    <div class="snaprow"><button class="btn primary" id="snap">${t("Take photo")}</button><button class="btn" id="pick">${t("From album")}</button></div>
    <div id="shots"></div>
  </div>`;
  $("#snap").onclick=()=>{ PICKING=Date.now(); $("#cam").click(); };
  $("#pick").onclick=()=>{ PICKING=Date.now(); $("#album").click(); };
  renderShots();
}
const IMGURL={}; // cache object URLs per photo — renderShots re-runs on every selection
function shotURL(s){ return IMGURL[s.id]||(IMGURL[s.id]=URL.createObjectURL(s.blob)); }
function renderShots(){
  if(CROP&&RECROP[CROP.id]){ RECROP[CROP.id].redraw(); return; } /* the Edit form's Crop again draws its own frame view (v239) */
  const box=$("#shots"); if(!box) return;
  const pending=PENDING_SHOT?`<div class="shot pending"><div class="badge">${t("Processing photo …")}</div></div>`:"";
  if(!S.inbox.length){ if(PICK) endPick(); box.innerHTML=pending||`<div class="badge" style="margin-top:18px">${t("No photos yet.")}</div>`; return; }
  if(marking("shots")){ /* the photo picker (v351): the photos alone with a tick — no frame, no reading box, no result card */
    box.innerHTML=`<div class="listhead pickhead"><span class="badge" id="pick-n">${t("{0} selected",PICK.set.size)}</span><button class="del" id="pick-all"></button></div>`+
      S.inbox.map(s=>`<div class="shot pick${PICK.set.has(s.id)?" on":""}" data-pickshot="${s.id}">
        <div class="shotwrap"><img src="${shotURL(s)}" alt="photo"></div>
        <div class="meta"><span class="ts">${new Date(s.ts).toLocaleString(LANG_LOCALE[LANG])}</span><span class="tick" aria-hidden="true"></span></div></div>`).join("");
    box.querySelectorAll("[data-pickshot]").forEach(el=> el.onclick=()=>{ pickToggle(el.dataset.pickshot); el.classList.toggle("on"); pickBar(()=>delPicked("shots")); });
    pickAllBtn(S.inbox.map(s=>s.id),renderShots); pickBar(()=>delPicked("shots"));
    return;
  }
  const busy=!!CROP||S.inbox.some(s=>PENDING[s.id]); /* no marking while a frame stands or a photo is being read (v351) */
  box.innerHTML=`<div class="listhead">${t("Inbox ({0})",S.inbox.length)}</div>`+pending+
    S.inbox.map(s=>{
      const dt=new Date(s.ts).toLocaleString(LANG_LOCALE[LANG]);
      const cropping=CROP && CROP.id===s.id, shown=!!(cropping&&CROP.rect&&!CROP.hidden), zoomed=!!(shown&&CROP.zoom);
      const working=!!(AUTO[s.id]&&PENDING[s.id]&&READING[s.id]&&!READ_FAIL.test(READING[s.id]));
      const results=!cropping&&AUTO[s.id]&&!PENDING[s.id]&&QSCARD[s.id]?[QSCARD[s.id],...(QSMORE[s.id]||[])].map(cardOf).filter(d=>d&&d.c):[]; /* the card made by itself (v325): the shimmer while it reads, the finished card after — one card per label since v357 */
      if(results.length) return `<div class="shot">${results.length>1?`<div class="listhead reshead">${t("{0} cards from this photo",results.length)}</div>`:""}${results.map(d=>`${resultHTML(d)}
        <div class="detailacts"><button class="btn" data-resedit="${esc(d.id)}">${t("Edit")}</button><button class="btn danger" data-resdel="${esc(d.id)}">${t("Delete card")}</button></div>`).join("")}
        <div class="ocr" id="ocr-${s.id}">${qsAiBox(s.id)}</div>
      </div>`;
      return `<div class="shot"${!busy&&!AUTO[s.id]&&S.inbox.length>1?` data-lp="${s.id}"`:""}>
        <div class="shotwrap">
          ${zoomed?`<div class="shotzoom" style="${zoomStyle(s)}" role="img" aria-label="the framed area"></div>`:`<img src="${shotURL(s)}" alt="photo">`}${working?`<div class="scan" aria-hidden="true"></div>`:""}
          ${cropping?`<div class="croplayer${shown?" framed":""}${zoomed?" zoomed":""}" data-id="${s.id}">${zoomed?"":`<div class="croprect${READING[s.id]&&!READ_FAIL.test(READING[s.id])?" working":""}"${cropRectStyle()}>${READING[s.id]&&!READ_FAIL.test(READING[s.id])?`<div class="work" aria-hidden="true"><svg><rect/></svg></div>`:""}<div class="h tl"></div><div class="h tr"></div><div class="h bl"></div><div class="h br"></div><div class="h rot" title="${t("Turn the frame")}"></div></div>`}</div>`:""}
        </div>
        <div class="meta"><span class="ts">${dt}</span><span class="acts">${cropping
          ?`<button class="del" data-cropcancel="${s.id}">${t("Cancel")}</button>`
          :AUTO[s.id]&&PENDING[s.id]?`<button class="del" data-autocancel="${s.id}">${t("Cancel")}</button>`
          :`${PENDING[s.id]?"":`<button class="ocr-btn" data-crop="${s.id}">${t("Crop")}</button>`}<button class="del" data-del="${s.id}">${t("Delete")}</button>`}</span></div>
        <div class="ocr" id="ocr-${s.id}">${PENDING[s.id]?readingHTML(READING[s.id]||AI_BUSY_TEXT,s.id):SIGN[s.id]?signEditorHTML(s.id):READING[s.id]?readingHTML(READING[s.id],s.id):cropping
          ?CROP.auto?busyHTML(t("Finding the text …")):`<span class="badge">${t("Draw a frame with your finger over the text — corners resize it, dragging inside moves it, the round handle turns it.")}</span>`
          :QSNOTE[s.id]?`<div class="ok" style="margin:0">${QSNOTE[s.id]}</div>${qsAiBox(s.id)}`:""}</div>
      </div>`;
    }).join("");
  box.querySelectorAll("[data-lp]").forEach(el=> longPress(el,()=>{ PICK={kind:"shots",set:new Set([el.dataset.lp])}; renderShots(); })); /* press and hold a photo to start marking (v354) */
  box.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>delShot(b.dataset.del,true));
  box.querySelectorAll("[data-crop]").forEach(b=> b.onclick=()=>{ CROP={id:b.dataset.crop,rect:null}; renderShots(); });
  box.onclick=e=>{ const b=e.target.closest("[data-savenow]"); if(b){ b.disabled=true; saveNow(b.dataset.savenow); } }; /* the button is inside the reading box, which every status re-renders (v237) */
  box.querySelectorAll("[data-cropcancel]").forEach(b=> b.onclick=()=>{ abandonReading(b.dataset.cropcancel); CROP=null; renderShots(); });
  box.querySelectorAll("[data-autocancel]").forEach(b=> b.onclick=()=>cancelAuto(b.dataset.autocancel)); /* the card made by itself (v325): Cancel drops the placeholder, the photo stays */
  box.querySelectorAll("[data-resedit]").forEach(b=> b.onclick=()=>{ const cid=b.dataset.resedit; if(!cardOf(cid)) return; S.editing=cid; S.editFrom="camera"; S.editOpenFrame=true; S.fullPic=false; render(); window.scrollTo({top:0}); }); /* Edit opens the form with the photo and the frame the card was cut with */
  box.querySelectorAll("[data-resdel]").forEach(b=> b.onclick=async()=>{ const cid=b.dataset.resdel; if(cardOf(cid)) await delCustom(cid); renderShots(); }); /* at once, with Undo (v268) — Undo brings the result back, the photo stays with Crop meanwhile */
  box.querySelectorAll(".result").forEach(el=>{ const d=cardOf(el.dataset.card); if(!d) return;
    el.querySelectorAll("[data-pic]").forEach(p=> p.onclick=e=>{ e.stopPropagation(); S.fullPic=!S.fullPic; renderShots(); }); /* the photo's tap: the whole picture and back, as on the front */
    el.querySelectorAll(".chars:not(.sub) .ch").forEach(c=> c.onclick=e=>{ e.stopPropagation(); charInfo(c.dataset.ch,c,d); }); });
  wireSay(box); wireLinks(box);
  box.querySelectorAll("[data-signai]").forEach(b=> b.onclick=()=>signAskAI(b.dataset.signai));
  box.querySelectorAll("[data-scriptset]").forEach(b=> b.onclick=async()=>{ const sg=SIGN[b.closest("[data-scriptseg]").dataset.scriptseg], on=b.dataset.scriptset==="1"; if(!sg||on===!!sg.trad) return; await setScript(sg,on); renderShots(); }); /* the mark by hand (v146); the AI is not asked again */
  wireAi(box);
  box.querySelectorAll(".croplayer").forEach(wireCrop);
  if(CROP&&CROP.auto===true) proposeFrame(CROP.id);
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
  await importPhotos(files);
}
/* A screenshot shared to the app from another app (v163, H: "a fast and easy function to translate screenshots"): the
   manifest's share target posts the files to ./share, the worker parks them in the cache "zt-share" and opens the app
   with ?share=1, the page picks them up here — they land in the inbox like photos from the album, the first in crop mode */
async function takeShared(){
  if(!/[?&]share=1/.test(location.search)) return;
  history.replaceState(null,"",location.pathname);
  try{
    const c=await caches.open("zt-share"), keys=await c.keys(), files=[];
    for(const k of keys){ const r=await c.match(k); if(r){ const b=await r.blob(); if(b.size) files.push(b); } await c.delete(k); }
    if(files.length) await importPhotos(files);
  }catch(err){ logErr("share",err&&(err.stack||err.message)||err); }
}
async function importPhotos(files){
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
  CROP=first?{id:first,rect:null,auto:true}:null; PENDING_SHOT=false; /* the frame is proposed by the app (v203) */
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
async function delShot(id,undo){
  await keepPhoto(id); /* the cards made from it keep the whole photo (v214) */
  const idx=S.inbox.findIndex(s=>s.id===id), rec=idx>=0?S.inbox[idx]:null;
  if(undo&&rec) showUndo({kind:"photo",rec,idx});
  S.inbox=S.inbox.filter(s=>s.id!==id);
  try{ await idbDel("inbox",id); }catch(e){}
  if(IMGURL[id]){ URL.revokeObjectURL(IMGURL[id]); delete IMGURL[id]; }
  if(CROP && CROP.id===id) CROP=null;
  renderShots(); setStats();
}

/* ---------- Export / import (device migration; photos stay local) ---------- */
/* the photos in the export (v166, H: "could you also export photos? Now only text"): with the checkbox under Export on,
   every card's crop and whole photo travel as base64 (imgB64/imgFullB64 with their type) and Import puts them back;
   the row shows the size they add. Off, the export stays text only and Import keeps the photos already on the phone. */
const exportPhotos=()=>!!S.settings.exportPhotos;
function photoBytes(){ return S.custom.reduce((a,d)=>a+((d.img&&d.img.size)||0)+((fullPhoto(d)||{}).size||0),0); }
const blobToB64=blob=>new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res({t:blob.type||"image/jpeg",d:String(fr.result).split(",")[1]||""}); fr.onerror=()=>rej(fr.error); fr.readAsDataURL(blob); });
async function b64ToBlob(x){ try{ return await (await fetch(`data:${x.t||"image/jpeg"};base64,${x.d}`)).blob(); }catch(e){ return null; } }
async function exportData(){
  const withPhotos=exportPhotos(), custom=[];
  for(const d of S.custom){ const {img,imgFull,...rest}=d, r={...rest}, full=fullPhoto(d); if(withPhotos){ if(img) r.imgB64=await blobToB64(img); if(full) r.imgFullB64=await blobToB64(full); } custom.push(r); } /* the whole photo from the inbox when the card holds none (v214) */
  const data={ app:"zeichentrainer", version:1, exported:new Date().toISOString(), photos:withPhotos,
    progress:Object.entries(S.progress).map(([id,s])=>({id,...s})),
    custom };
  const json=JSON.stringify(data,null,withPhotos?0:2);
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
  }catch(err){ noteSheet(t("Export failed: {0}",err)); }
}
async function importData(e){
  const file=e.target.files && e.target.files[0];
  e.target.value="";
  if(!file) return;
  let data=null;
  try{ data=JSON.parse(await file.text()); }catch(err){}
  if(!data || data.app!=="zeichentrainer" || !Array.isArray(data.progress) || !Array.isArray(data.custom)){
    noteSheet(t("Not a Zeichentrainer export (JSON).")); return;
  }
  /* exports before v118 carry the text as the key; the id is the text then */
  const prog=data.progress.filter(r=>r && typeof (r.id||r.c)==="string" && typeof r.due==="number").map(({id,c,...s})=>({id:id||c,...s}));
  const cust=data.custom.filter(r=>r && typeof r.c==="string" && typeof r.p==="string" && typeof r.m==="string").map(r=>({...r,id:r.id||r.c}));
  if(!prog.length && !cust.length){ noteSheet(t("Export is empty — nothing to import.")); return; }
  if(!await askSheet({title:t("Import {0} and {1}?",nOf(cust.length,"card"),nOf(prog.length,"progress entry","progress entries")),text:t("Existing entries of the same cards will be overwritten."),ok:t("Import"),danger:false})) return;
  /* the photos come with the file when it carries them (v166); otherwise the existing image is kept when overwriting */
  const merged=[]; let nPhotos=0, nInFile=0;
  for(const r0 of cust){ const {imgB64,imgFullB64,...r}=r0; const ex=S.custom.find(x=>x.id===r.id);
    if(imgB64&&imgB64.d) nInFile++;
    const img=imgB64&&imgB64.d?await b64ToBlob(imgB64):null, imgFull=imgFullB64&&imgFullB64.d?await b64ToBlob(imgFullB64):null;
    if(img) r.img=img; else if(ex&&ex.img) r.img=ex.img;
    if(imgFull) r.imgFull=imgFull; else if(ex&&ex.imgFull) r.imgFull=ex.imgFull;
    if(r.imgFull&&r.shot&&S.inbox.some(x=>x.id===r.shot&&x.blob)) delete r.imgFull; /* the inbox photo is on this phone: stored once (v214) */
    if(img){ dropThumb(r.id); nPhotos++; }
    merged.push(r); }
  try{
    await Promise.all([...prog.map(r=>idbPut("progress",r)), ...merged.map(r=>idbPut("custom",r))]);
  }catch(err){ noteSheet(t("Import failed ({0})",err)); return; }
  prog.forEach(r=>{ const {id,...s}=r; S.progress[id]=s; });
  merged.forEach(r=>{ const i=S.custom.findIndex(x=>x.id===r.id); if(i>=0) S.custom[i]=r; else S.custom.push(r); });
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  S.mode="study"; render();
  /* what the import did, in one sentence (v167, H: an older app had dropped the photos without a word) */
  noteSheet(t("Import"),t("Imported {0} and {1}",nOf(cust.length,"card"),nOf(prog.length,"progress entry","progress entries"))+(nInFile?t(", {0} with photos",nPhotos)+(nPhotos<nInFile?" "+t("({0} could not be read)",nInFile-nPhotos):""):". "+t("The file carries no photos; the photos on this phone were kept"))+".");
}

/* ---------- Reset ---------- */
async function resetAll(){
  if(!await askSheet({title:t("Start over?"),text:t("All progress, cards and inbox photos on this phone will be deleted."),ok:t("Delete everything")})) return;
  try{ await Promise.all([idbClear("progress"),idbClear("custom"),idbClear("inbox")]); }catch(e){}
  S.progress={}; S.custom=[]; S.inbox=[];
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  render();
}

/* ---------- Service worker & persistent storage ---------- */
let SW_REG=""; /* the registration's state for Diagnostics (v335): a page with "SW no" says whether a worker is there at all */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").then(reg=>{
      SW_REG=reg.active?"active":reg.waiting?"waiting":reg.installing?"installing":"none";
      reg.update();
      /* installed PWAs rarely check for updates on their own — check when brought to foreground */
      document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ reg.update().catch(()=>{}); mirrorCheck(); } });
      setInterval(()=>{ if(!document.hidden){ reg.update().catch(()=>{}); mirrorCheck(); } },MIRROR_EVERY); /* and while the app stays open (v327) */
      mirrorCheck(); tellMirror(); shellCheck();
    }).catch(err=>{ SW_REG="failed: "+String(err&&err.message||err); });
    /* a page the worker does not control while a worker is active (v335, H's phone: Diagnostics "SW no", the reader's files
       fetched straight from github.io): the worker takes it over now, no reload — ready resolves once an active worker is there */
    navigator.serviceWorker.ready.then(reg=>{ SW_REG="active"; if(!navigator.serviceWorker.controller&&reg.active) reg.active.postMessage({type:"claim"}); }).catch(()=>{});
    takeShared(); /* photos shared to the app (v163) — after boot, S.inbox is loaded by then */
    navigator.serviceWorker.addEventListener("message",e=>{
      const d=e.data||{};
      if(d.type==="refreshed"){ if(d.ok) reloadSoon(); return; }
      if(d.type!=="mirror-update") return;
      MIRROR.busy=false; MIRROR.last=d; const forced=MIRROR.forced; MIRROR.forced=false;
      const st=$("#mirror-status"); if(st) st.textContent=mirrorText();
      if(d.status==="updated") setTimeout(()=>forced?reloadNow():reloadSoon(),600); /* Check now was a tap — reload at once; the check by itself waits for a pause (v279, v327) */
    });
    /* new version activated (skipWaiting+claim) → reload once automatically.
       First install (no controller before) does not trigger a reload. */
    let hadCtrl=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(!hadCtrl){ hadCtrl=true; tellMirror(); shellCheck(); return; } /* first install, or the claim of v335: no reload, but the worker needs the mirror and the shell check can run now */
      reloadSoon();
    });
  });
}
/* The reload after an update waits until the app is idle (v279, H: after several builds in a row "flickert die App" — every
   update reloaded the page the moment the new worker took over, in the middle of whatever H was doing): within RELOAD_GRACE
   of the load (the user has just opened the app and sees the first screen) or while the app is in the background the page
   reloads at once, as before; later, RELOAD_DUE is set and the reload comes when the app next comes to the foreground.
   A tap on the mirror's Check now still reloads at once — the user asked for it.
   Never while a photo is being taken or a frame stands (v316, H right after the v315 update: "Ich habe gerade ein Foto gemacht
   und bin danach direkt auf der Learn Seite gelandet. Foto ist weg." — the camera app in front is the page hidden, the new
   worker took over meanwhile and the page reloaded at once; the camera handed the photo to a page that was gone): while
   picking() or CROP the reload is deferred, and the return to the foreground reloads only once both are over. */
const LOAD_AT=Date.now(), RELOAD_GRACE=3000; let RELOAD_DUE=false, RELOAD_TIMER=null;
const reloadBusy=()=>picking()||!!CROP; /* a photo on its way from the camera, or a photo open with its frame */
/* The reload comes at the next pause, on the same screen (v327, H: "make sure that new software versions always load
   automatically without the need for manual refresh" — until v326 a deferred reload waited for the next return to the
   foreground, so an update taken while the app was open showed only after the app had been left and reopened):
   once a reload is due, every RELOAD_POLL the page asks whether the app is idle — no finger for IDLE_MS, no form open,
   no reading or translation running, no sheet, no feedback being typed, no photo on its way — and then reloads after
   noting the screen (resumeView: mode, the open card, the search, the scroll), which boot restores, so the new version
   is up within seconds and the user finds the same screen. */
const IDLE_MS=4000, RELOAD_POLL=2000, RESUME_MAX=180000; let LAST_TOUCH=Date.now();
["pointerdown","keydown","input","touchstart","wheel"].forEach(ev=>document.addEventListener(ev,()=>{ LAST_TOUCH=Date.now(); },{capture:true,passive:true}));
const reloadIdle=()=>!reloadBusy()&&!document.hidden&&Date.now()-LAST_TOUCH>=IDLE_MS&&!S.editing&&S.mode!=="add"&&!Object.keys(PENDING).length&&!Object.keys(READING).length&&!(TRANSLATE&&TRANSLATE.running)&&!(TAGALL&&TAGALL.running)&&!(RECHECK&&RECHECK.running)&&!BRIGHT&&!document.querySelector(".drawsheet,.ask")&&!(($("#fb-text")||{}).value||"").trim();
async function reloadNow(){ RELOAD_DUE=false; clearInterval(RELOAD_TIMER); RELOAD_TIMER=null; try{ await setSetting("resumeView",{mode:S.mode,detail:S.detail,query:S.query,scroll:window.scrollY,at:Date.now()}); }catch(e){} location.reload(); }
function reloadSoon(){ if(!reloadBusy()&&(Date.now()-LOAD_AT<RELOAD_GRACE||document.hidden)){ reloadNow(); return; } RELOAD_DUE=true; if(!RELOAD_TIMER) RELOAD_TIMER=setInterval(()=>{ if(RELOAD_DUE&&reloadIdle()) reloadNow(); },RELOAD_POLL); }
document.addEventListener("visibilitychange",()=>{ if(!document.hidden&&RELOAD_DUE&&!reloadBusy()) reloadNow(); });
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
const MIRROR_DEFAULT="https://cdn.jsdelivr.net/gh/henglicam/zeichentrainer@main/", MIRROR_EVERY=600000; /* the mirror's own cache is purged by the workflow purge-mirror.yml on every push to main (v327), so ten minutes is the lag at most */
const MIRROR={busy:false,last:null,at:0};
function mirrorURL(){ const u=(S.settings.mirror||MIRROR_DEFAULT).trim(); return u.endsWith("/")?u:u+"/"; }
function mirrorCheck(force){
  if(!navigator.onLine||MIRROR.busy) return;
  if(!force && Date.now()-MIRROR.at<MIRROR_EVERY) return; /* at most every ten minutes by itself (hourly until v326) */
  const ctrl=navigator.serviceWorker&&navigator.serviceWorker.controller; if(!ctrl) return;
  MIRROR.busy=true; MIRROR.at=Date.now(); MIRROR.forced=!!force;
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
      try{ const r=await vendorFetch(f); if(!r.ok) throw new Error(r.status); await r.blob(); done++; }
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
