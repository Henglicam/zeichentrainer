"use strict";
/* 识字 · Zeichentrainer — Standalone PWA
   Persistenz via IndexedDB (überlebt Neustart). Kamera-Inbox. Offline. */

/* ---------- Deck (im Code, überlebt alles) ---------- */
const DECK_BASE = [
  { c:"学", p:"xué", m:"lernen, studieren", w:"学习", wp:"xuéxí", wm:"lernen", ex:"我在学中文。", exp:"Wǒ zài xué Zhōngwén.", exm:"Ich lerne Chinesisch.", t:"Alltag" },
  { c:"识", p:"shí", m:"erkennen, kennen", w:"认识", wp:"rènshi", wm:"(jmd.) kennen", ex:"很高兴认识你。", exp:"Hěn gāoxìng rènshi nǐ.", exm:"Schön, dich kennenzulernen.", t:"Alltag" },
  { c:"需", p:"xū", m:"brauchen, benötigen", w:"需要", wp:"xūyào", wm:"benötigen", ex:"我需要帮助。", exp:"Wǒ xūyào bāngzhù.", exm:"Ich brauche Hilfe.", t:"Alltag" },
  { c:"供", p:"gōng", m:"liefern, versorgen", w:"供应", wp:"gōngyìng", wm:"Belieferung", ex:"供应很稳定。", exp:"Gōngyìng hěn wěndìng.", exm:"Die Belieferung ist stabil.", t:"Alltag" },
  { c:"议", p:"yì", m:"beraten, besprechen", w:"会议", wp:"huìyì", wm:"Besprechung", ex:"会议开始了。", exp:"Huìyì kāishǐ le.", exm:"Die Besprechung hat begonnen.", t:"Alltag" },
  { c:"合", p:"hé", m:"vereinen, passen", w:"合同", wp:"hétong", wm:"Vertrag", ex:"我们签了合同。", exp:"Wǒmen qiān le hétong.", exm:"Wir haben den Vertrag unterschrieben.", t:"Vertrag" },
  { c:"同", p:"tóng", m:"gleich, gemeinsam", w:"同意", wp:"tóngyì", wm:"zustimmen", ex:"我同意你的看法。", exp:"Wǒ tóngyì nǐ de kànfǎ.", exm:"Ich stimme deiner Ansicht zu.", t:"Vertrag" },
  { c:"续", p:"xù", m:"fortsetzen, verlängern", w:"续签", wp:"xùqiān", wm:"verlängern (Vertrag)", ex:"合同需要续签。", exp:"Hétong xūyào xùqiān.", exm:"Der Vertrag muss verlängert werden.", t:"Vertrag" },
  { c:"签", p:"qiān", m:"unterschreiben", w:"签字", wp:"qiānzì", wm:"unterzeichnen", ex:"请在这里签字。", exp:"Qǐng zài zhèlǐ qiānzì.", exm:"Bitte hier unterschreiben.", t:"Vertrag" },
  { c:"谈", p:"tán", m:"reden, verhandeln", w:"谈判", wp:"tánpàn", wm:"Verhandlung", ex:"谈判很顺利。", exp:"Tánpàn hěn shùnlì.", exm:"Die Verhandlung lief glatt.", t:"Vertrag" },
  { c:"判", p:"pàn", m:"beurteilen, urteilen", w:"判断", wp:"pànduàn", wm:"Urteil, einschätzen", ex:"这很难判断。", exp:"Zhè hěn nán pànduàn.", exm:"Das ist schwer einzuschätzen.", t:"Vertrag" },
  { c:"延", p:"yán", m:"verlängern, verzögern", w:"延期", wp:"yánqī", wm:"verschieben", ex:"会议延期了。", exp:"Huìyì yánqī le.", exm:"Die Besprechung wurde verschoben.", t:"Vertrag" },
  { c:"补", p:"bǔ", m:"ergänzen, ausgleichen", w:"补偿", wp:"bǔcháng", wm:"Entschädigung", ex:"公司给了补偿。", exp:"Gōngsī gěi le bǔcháng.", exm:"Die Firma zahlte eine Entschädigung.", t:"Vertrag" },
  { c:"条", p:"tiáo", m:"Streifen; Klausel", w:"条件", wp:"tiáojiàn", wm:"Bedingung", ex:"条件可以接受。", exp:"Tiáojiàn kěyǐ jiēshòu.", exm:"Die Bedingungen sind akzeptabel.", t:"Vertrag" },
  { c:"效", p:"xiào", m:"Wirkung, wirksam", w:"效率", wp:"xiàolǜ", wm:"Effizienz", ex:"他工作效率很高。", exp:"Tā gōngzuò xiàolǜ hěn gāo.", exm:"Er arbeitet sehr effizient.", t:"Vertrag" },
  { c:"镜", p:"jìng", m:"Linse, Spiegel", w:"镜头", wp:"jìngtóu", wm:"Objektiv", ex:"这个镜头很贵。", exp:"Zhège jìngtóu hěn guì.", exm:"Dieses Objektiv ist teuer.", t:"Optik" },
  { c:"光", p:"guāng", m:"Licht", w:"光线", wp:"guāngxiàn", wm:"Lichtstrahl", ex:"光线不够。", exp:"Guāngxiàn bùgòu.", exm:"Das Licht reicht nicht.", t:"Optik" },
  { c:"精", p:"jīng", m:"fein, präzise", w:"精密", wp:"jīngmì", wm:"Präzision", ex:"这是精密仪器。", exp:"Zhè shì jīngmì yíqì.", exm:"Das ist ein Präzisionsinstrument.", t:"Optik" },
  { c:"密", p:"mì", m:"dicht, geheim", w:"密度", wp:"mìdù", wm:"Dichte", ex:"密度很高。", exp:"Mìdù hěn gāo.", exm:"Die Dichte ist hoch.", t:"Optik" },
  { c:"快", p:"kuài", m:"schnell", w:"快门", wp:"kuàimén", wm:"Verschluss", ex:"快门速度很快。", exp:"Kuàimén sùdù hěn kuài.", exm:"Die Verschlusszeit ist sehr kurz.", t:"Optik" },
  { c:"门", p:"mén", m:"Tür, Tor", w:"快门", wp:"kuàimén", wm:"Verschluss", ex:"门关上了。", exp:"Mén guānshàng le.", exm:"Die Tür ist zu.", t:"Optik" },
  { c:"决", p:"jué", m:"entscheiden", w:"决定", wp:"juédìng", wm:"Entscheidung", ex:"我还没决定。", exp:"Wǒ hái méi juédìng.", exm:"Ich habe noch nicht entschieden.", t:"Alltag" },
  { c:"每日", p:"měirì", m:"täglich, jeden Tag (formell/schriftlich)", w:"每天", wp:"měitiān", wm:"jeden Tag (umgangssprachlich)", ex:"每日更新。", exp:"Měirì gēngxīn.", exm:"Täglich aktualisiert.", t:"Essen" },
  { c:"坚果", p:"jiānguǒ", m:"Nüsse", ex:"坚果很有营养。", exp:"Jiānguǒ hěn yǒu yíngyǎng.", exm:"Nüsse sind sehr nahrhaft.", t:"Essen" },
  { c:"果干", p:"guǒgān", m:"Trockenobst, getrocknete Früchte", ex:"我喜欢吃果干。", exp:"Wǒ xǐhuān chī guǒgān.", exm:"Ich esse gern Trockenobst.", t:"Essen" },
];

const NEW_PER_SESSION = 8;
const CJK = /[\u4e00-\u9fff]/;
const glyphs = s => [...String(s)].filter(ch => CJK.test(ch)).length;
const headFont = s => { const n = glyphs(s); return n<=1?150:n===2?104:n===3?74:58; };

/* ---------- SRS (SM-2 light) ---------- */
const DAY = 86400000;
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
  return { interval, ease, due, reps };
}
function previewInterval(card, grade){
  const s = schedule(card, grade);
  if (grade==="again") return "<10 min";
  if (s.interval<1) return "<1 T";
  if (s.interval===1) return "1 T";
  return s.interval+" T";
}

/* ---------- IndexedDB (dauerhaft) ---------- */
const DB_NAME="zeichentrainer", DB_VER=1;
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
  queue:[], idx:0, revealed:false, done:0, ahead:false, ready:false };

function deck(){
  const seen = new Set(DECK_BASE.map(d=>d.c));
  return [...DECK_BASE, ...S.custom.filter(d=>!seen.has(d.c))];
}
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

/* ---------- Boot ---------- */
async function boot(){
  try{
    const [prog, cust, inb] = await Promise.all([idbAll("progress"), idbAll("custom"), idbAll("inbox")]);
    S.progress = {}; prog.forEach(r=>{ const {c,...s}=r; S.progress[c]=s; });
    S.custom = cust;
    S.inbox = inb.sort((a,b)=>b.ts-a.ts);
  }catch(e){ console.warn("IndexedDB nicht verfügbar, nur Session:", e); }
  S.ready=true;
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  wireChrome(); render();
}

/* ---------- Rendering ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function wireChrome(){
  document.querySelectorAll(".tab").forEach(b=>{
    b.onclick=()=>{ S.mode=b.dataset.mode; render(); };
  });
  $("#reset").onclick=resetAll;
  $("#cam").onchange=onPhoto;
}
function setStats(){
  const remaining=Math.max(0,S.queue.length-S.idx);
  const inStudy=S.mode==="study";
  $("#stat-open").style.display=inStudy?"":"none";
  $("#stat-done").style.display=inStudy?"":"none";
  $("#stat-open .v").textContent=remaining;
  $("#stat-done .j").textContent=S.done;
  $("#stat-deck .v").textContent=deck().length;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.mode===S.mode));
}

const CLR={verm:"#B23A2E",bone:"#EDE6D6",line:"#2E2E24"};
function reticleSVG(single){
  const Sz=260,tick=14,cx=Sz/2;
  const cross = single ? `
    <line x1="${cx}" y1="0" x2="${cx}" y2="${Sz}" stroke="${CLR.verm}" stroke-width="1" stroke-dasharray="2 6" opacity="${S.revealed?0.5:0.16}"/>
    <line x1="0" y1="${cx}" x2="${Sz}" y2="${cx}" stroke="${CLR.verm}" stroke-width="1" stroke-dasharray="2 6" opacity="${S.revealed?0.5:0.16}"/>` : "";
  const corners=[[0,0,1,1],[Sz,0,-1,1],[0,Sz,1,-1],[Sz,Sz,-1,-1]].map(([x,y,dx,dy])=>
    `<g stroke="${CLR.bone}" stroke-width="1.25" opacity="0.8"><line x1="${x}" y1="${y}" x2="${x+dx*tick}" y2="${y}"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y+dy*tick}"/></g>`).join("");
  return `<svg width="${Sz}" height="${Sz}"><rect x="0.5" y="0.5" width="${Sz-1}" height="${Sz-1}" fill="none" stroke="${CLR.line}"/>${cross}${corners}</svg>`;
}

function render(){
  setStats();
  const main=$("#main");
  main.classList.toggle("center", S.mode!=="add" && S.mode!=="inbox");
  if(S.mode==="study") return renderStudy(main);
  if(S.mode==="add")   return renderAdd(main);
  if(S.mode==="inbox") return renderInbox(main);
}

function renderStudy(main){
  if(!S.ready){ main.innerHTML=`<div class="badge">lade…</div>`; return; }
  const finished = S.idx>=S.queue.length;
  if(finished){
    main.innerHTML=`<div class="done">
      <div class="mark">净</div>
      <h2>Alles aufgeräumt.</h2>
      <p>${S.ahead?"Vorgezogene Runde beendet.":"Für heute nichts mehr fällig. Komm morgen wieder — oder zieh die nächsten Karten vor."}</p>
      <button class="btn" id="ahead">Vorziehen · nächste Karten</button>
    </div>`;
    const a=$("#ahead"); if(a) a.onclick=()=>{ const q=buildQueue(true); if(q.length){S.queue=q;S.idx=0;S.done=0;S.ahead=true;S.revealed=false;render();} };
    return;
  }
  const c=S.queue[S.idx], d=cardOf(c), sched=S.progress[c]||null, isNew=!S.progress[c];
  const single=glyphs(d.c)<=1;
  let back="";
  if(S.revealed){
    const wordBlock = d.w ? `<div class="rule"></div>
      <div class="word"><span class="w">${esc(d.w)}</span><span class="wp">${esc(d.wp||"")}</span></div>
      <div class="wm">${esc(d.wm||"")}</div>` : "";
    const exBlock = d.ex ? `<div class="ex"><div class="zh">${esc(d.ex)}</div>
      ${d.exp?`<div class="exp">${esc(d.exp)}</div>`:""}
      ${d.exm?`<div class="exm">${esc(d.exm)}</div>`:""}</div>` : "";
    const grds=[["again","Nochmal"],["hard","Schwer"],["good","Gut"],["easy","Leicht"]].map(([g,l])=>
      `<button class="grade" data-g="${g}"><span class="lbl">${l}</span><span class="iv">${previewInterval(sched,g)}</span></button>`).join("");
    back=`<div style="margin-top:26px">
      <div class="pin">${esc(d.p)}</div><div class="mean">${esc(d.m)}</div>
      ${wordBlock}${exBlock}
      <div class="grades">${grds}</div></div>`;
  } else {
    back=`<button class="btn wide" id="reveal">Aufdecken</button>`;
  }
  main.innerHTML=`<div class="card">
    <div class="tags"><span class="t">${esc(d.t||"")}</span><span class="${isNew?"n":"r"}">${isNew?"neu":"Wiederholung"}</span></div>
    <div class="reticle">${reticleSVG(single)}<div class="glyph" style="font-size:${headFont(d.c)}px">${esc(d.c)}</div></div>
    ${back}</div>`;
  const rv=$("#reveal"); if(rv) rv.onclick=()=>{ S.revealed=true; render(); };
  document.querySelectorAll(".grade").forEach(b=> b.onclick=()=>grade(b.dataset.g));
}

async function grade(g){
  const c=S.queue[S.idx], sched=S.progress[c]||null;
  const s=schedule(sched,g);
  S.progress[c]=s;
  try{ await idbPut("progress",{c,...s}); }catch(e){}
  if(g==="again") S.queue.push(c); else S.done++;
  S.idx++; S.revealed=false; render();
}

/* ---------- Add ---------- */
function renderAdd(main){
  main.innerHTML=`<div class="pane">
    <div class="lead">Karte von Hand anlegen. Pinyin und Bedeutung aus einem Foto? Nutze den Kamera-Tab und schick das Bild im Chat — ich geb dir die Werte fertig zum Eintippen.</div>
    <div class="field"><label>词 · Wort</label><input id="f-word" class="hanzi big" placeholder="快门"></div>
    <div class="row">
      <div class="field narrow"><label>Pinyin</label><input id="f-pin" class="mono" placeholder="kuàimén"></div>
      <div class="field"><label>Bedeutung</label><input id="f-mean" placeholder="Verschluss"></div>
    </div>
    <div class="field"><label>Beispielsatz · optional</label><input id="f-ex" class="hanzi" placeholder="快门速度很快。"></div>
    <div class="field"><label>Übersetzung · optional</label><input id="f-exm" placeholder="Die Verschlusszeit ist sehr kurz."></div>
    <div id="f-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="f-add">Karte anlegen</button>
    <div id="f-ok" class="ok" style="display:none"></div>
    <div id="c-list"></div>
  </div>`;
  $("#f-add").onclick=addManual;
  renderCustomList();
}
function renderCustomList(){
  const box=$("#c-list"); if(!box) return;
  if(!S.custom.length){ box.innerHTML=""; return; }
  box.innerHTML=`<div class="listhead">Eigene Karten · ${S.custom.length}</div>`+
    S.custom.map(d=>`<div class="item"><div class="left"><span class="c">${esc(d.c)}</span><span class="p">${esc(d.p)}</span><span class="m">${esc(d.m)}</span></div><button class="del" data-c="${esc(d.c)}">löschen</button></div>`).join("");
  box.querySelectorAll(".del").forEach(b=> b.onclick=()=>delCustom(b.dataset.c));
}
async function addManual(){
  const word=$("#f-word").value.trim(), pin=$("#f-pin").value.trim(), mean=$("#f-mean").value.trim();
  const ex=$("#f-ex").value.trim(), exm=$("#f-exm").value.trim();
  const err=$("#f-err"), ok=$("#f-ok"); err.style.display="none"; ok.style.display="none";
  const fail=m=>{ err.textContent=m; err.style.display=""; };
  if(!CJK.test(word)) return fail("Bitte ein chinesisches Wort eingeben.");
  if(!pin||!mean) return fail("Pinyin und Bedeutung sind Pflicht.");
  if(deck().some(d=>d.c===word)) return fail("„"+word+"“ ist schon im Deck.");
  const card={c:word,p:pin,m:mean,ex,exp:"",exm,t:"Eigene"};
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false);
  ["f-word","f-pin","f-mean","f-ex","f-exm"].forEach(id=>$("#"+id).value="");
  ok.textContent="„"+word+"“ hinzugefügt."; ok.style.display="";
  setStats(); renderCustomList();
}
async function delCustom(c){
  S.custom=S.custom.filter(x=>x.c!==c);
  try{ await idbDel("custom",c); await idbDel("progress",c); }catch(e){}
  delete S.progress[c];
  setStats(); renderCustomList();
}

/* ---------- Kamera / Inbox ---------- */
function renderInbox(main){
  main.innerHTML=`<div class="pane">
    <div class="lead">Foto aufnehmen und lokal ablegen. Für Pinyin + Bedeutung: das Bild im Chat teilen — ich pflege die Karte fertig ein. (Offline-Auto-OCR mit geprüftem Pinyin/Deutsch kommt als v2.)</div>
    <button class="btn primary block" id="snap">Foto aufnehmen</button>
    <div id="shots"></div>
  </div>`;
  $("#snap").onclick=()=>$("#cam").click();
  renderShots();
}
function renderShots(){
  const box=$("#shots"); if(!box) return;
  if(!S.inbox.length){ box.innerHTML=`<div class="badge" style="margin-top:18px">Noch keine Aufnahmen.</div>`; return; }
  box.innerHTML=`<div class="listhead">Inbox · ${S.inbox.length}</div>`+
    S.inbox.map(s=>{
      const url=URL.createObjectURL(s.blob);
      const dt=new Date(s.ts).toLocaleString("de-DE");
      return `<div class="shot"><img src="${url}" alt="Aufnahme"><div class="meta"><span class="ts">${dt}</span><button class="del" data-id="${s.id}">löschen</button></div></div>`;
    }).join("");
  box.querySelectorAll(".del").forEach(b=> b.onclick=()=>delShot(b.dataset.id));
}
async function onPhoto(e){
  const file=e.target.files && e.target.files[0];
  e.target.value="";
  if(!file) return;
  const rec={ id:"shot_"+Date.now(), blob:file, ts:Date.now() };
  S.inbox.unshift(rec);
  try{ await idbPut("inbox",rec); }catch(err){}
  if(S.mode!=="inbox"){ S.mode="inbox"; render(); } else renderShots();
}
async function delShot(id){
  S.inbox=S.inbox.filter(s=>s.id!==id);
  try{ await idbDel("inbox",id); }catch(e){}
  renderShots(); setStats();
}

/* ---------- Reset ---------- */
async function resetAll(){
  if(!confirm("Fortschritt, eigene Karten und Inbox löschen?")) return;
  try{ await Promise.all([idbClear("progress"),idbClear("custom"),idbClear("inbox")]); }catch(e){}
  S.progress={}; S.custom=[]; S.inbox=[];
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  render();
}

/* ---------- Service Worker & dauerhafter Speicher ---------- */
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
/* MIUI/Chrome räumt Speicher nicht-installierter Seiten auf — dauerhaften Speicher anfordern */
if(navigator.storage && navigator.storage.persist){
  navigator.storage.persisted()
    .then(p=>p||navigator.storage.persist())
    .then(granted=>{
      const b=document.querySelector("#ftr .badge");
      if(b) b.textContent="SPEICHER · "+(granted?"dauerhaft (auf diesem Gerät)":"lokal (nicht garantiert)");
    }).catch(()=>{});
}

boot();
