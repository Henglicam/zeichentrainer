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
  queue:[], idx:0, revealed:false, done:0, ahead:false, ready:false,
  pendingImg:null, prefill:null };

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
  $("#export").onclick=exportData;
  $("#import").onclick=()=>$("#imp").click();
  $("#imp").onchange=importData;
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
    const imgBlock = d.img ? `<div class="cardimg"><img src="${URL.createObjectURL(d.img)}" alt="Fundstelle"></div>` : "";
    const grds=[["again","Nochmal"],["hard","Schwer"],["good","Gut"],["easy","Leicht"]].map(([g,l])=>
      `<button class="grade" data-g="${g}"><span class="lbl">${l}</span><span class="iv">${previewInterval(sched,g)}</span></button>`).join("");
    back=`<div style="margin-top:26px">
      <div class="pin">${esc(d.p)}</div><div class="mean">${esc(d.m)}</div>
      ${wordBlock}${exBlock}${imgBlock}
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
  const imgField=S.pendingImg?`<div class="field" id="f-imgfield"><label>Bild · Ausschnitt aus Foto (bleibt lokal)</label>
      <div class="pimg"><img src="${URL.createObjectURL(S.pendingImg)}" alt="Ausschnitt"><button class="del" id="f-noimg">Bild entfernen</button></div></div>`:"";
  main.innerHTML=`<div class="pane">
    <div class="lead">Karte von Hand anlegen — oder im Kamera-Tab per OCR Zeichen antippen. Auto-Pinyin und Bedeutung vor dem Speichern via Chat prüfen.</div>
    ${imgField}
    <div class="field"><label>词 · Wort</label><input id="f-word" class="hanzi big" placeholder="快门"></div>
    <div class="row">
      <div class="field narrow"><label>Pinyin</label><input id="f-pin" class="mono" placeholder="kuàimén"></div>
      <div class="field"><label>Bedeutung</label><input id="f-mean" placeholder="Verschluss"></div>
    </div>
    <div id="f-pinhint" class="err" style="display:none">Auto-Pinyin aus OCR — ungeprüft. Töne kontrollieren (多音字!), Bedeutung ergänzen.</div>
    <div class="field"><label>Beispielsatz · optional</label><input id="f-ex" class="hanzi" placeholder="快门速度很快。"></div>
    <div class="field"><label>Übersetzung · optional</label><input id="f-exm" placeholder="Die Verschlusszeit ist sehr kurz."></div>
    <div id="f-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="f-add">Karte anlegen</button>
    <div id="f-ok" class="ok" style="display:none"></div>
    <div id="c-list"></div>
  </div>`;
  $("#f-add").onclick=addManual;
  const ni=$("#f-noimg"); if(ni) ni.onclick=()=>{ S.pendingImg=null; renderAdd(main); };
  /* Entwurf übersteht Tab-Wechsel (z.B. Wort wählen → zurück zum Zuschneiden) */
  if(S.prefill){
    S.draft={...(S.draft||{}), w:S.prefill.w||"", p:S.prefill.p||"", autoPin:!!S.prefill.p};
    S.prefill=null;
  }
  const d0=S.draft||{};
  $("#f-word").value=d0.w||""; $("#f-pin").value=d0.p||""; $("#f-mean").value=d0.m||"";
  $("#f-ex").value=d0.ex||""; $("#f-exm").value=d0.exm||"";
  if(d0.autoPin) $("#f-pinhint").style.display="";
  const saveDraft=()=>{ S.draft={ w:$("#f-word").value, p:$("#f-pin").value, m:$("#f-mean").value,
    ex:$("#f-ex").value, exm:$("#f-exm").value, autoPin:$("#f-pinhint").style.display!=="none" }; };
  ["f-word","f-pin","f-mean","f-ex","f-exm"].forEach(id=>$("#"+id).oninput=saveDraft);
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
  if(S.pendingImg){ card.img=S.pendingImg; S.pendingImg=null; }
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false);
  ["f-word","f-pin","f-mean","f-ex","f-exm"].forEach(id=>$("#"+id).value="");
  const fi=$("#f-imgfield"); if(fi) fi.remove();
  $("#f-pinhint").style.display="none";
  S.draft=null;
  ok.textContent="„"+word+"“ hinzugefügt."; ok.style.display="";
  setStats(); renderCustomList();
}
async function delCustom(c){
  S.custom=S.custom.filter(x=>x.c!==c);
  try{ await idbDel("custom",c); await idbDel("progress",c); }catch(e){}
  delete S.progress[c];
  setStats(); renderCustomList();
}

/* ---------- OCR (Tesseract.js, komplett lokal aus ./vendor — kein CDN) ---------- */
let _ocrWorker=null, _ocrLoading=null;
function loadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src=src; s.onload=res; s.onerror=()=>rej(new Error("Script nicht ladbar"));
    document.head.appendChild(s);
  });
}
async function ocrWorker(status){
  if(_ocrWorker) return _ocrWorker;
  if(!_ocrLoading){
    _ocrLoading=(async()=>{
      status("OCR lädt … (einmalig ~9 MB, danach offline)");
      if(!window.Tesseract) await loadScript("./vendor/tesseract.min.js");
      if(!window.pinyinPro) await loadScript("./vendor/pinyin-pro.js");
      /* Pfade zur Laufzeit aus der Seiten-URL — bleibt relativ zum Subpath */
      const base=new URL("./vendor/",location.href).href;
      const w=await Tesseract.createWorker("chi_sim",1,{
        workerPath:base+"worker.min.js",
        corePath:base+"tesseract-core-simd-lstm.wasm.js",
        langPath:base.replace(/\/$/,""),
        logger:m=>{ if(m.status==="recognizing text") status("erkenne … "+Math.round(m.progress*100)+"%"); }
      });
      _ocrWorker=w; return w;
    })().catch(err=>{ _ocrLoading=null; throw err; });
  }
  return _ocrLoading;
}

/* Ergebnis pro Foto (nur Session): Zeichen mit Box + Auto-Pinyin; Auswahl per Antippen */
const OCRRES={}, SELS={};
async function onOcr(id,region){
  /* region (optional): {blob,X,Y} — OCR nur auf dem Ausschnitt, Boxen zurück
     ins Vollbild verschoben */
  const rec=S.inbox.find(s=>s.id===id); if(!rec) return;
  const box=$("#ocr-"+id); if(!box) return;
  const status=t=>{ box.innerHTML=`<span class="badge">${esc(t)}</span>`; };
  try{
    const w=await ocrWorker(status);
    status("erkenne …");
    const [{data},bmp]=await Promise.all([
      w.recognize(region?region.blob:rec.blob,{},{blocks:true,text:true}),
      createImageBitmap(rec.blob)
    ]);
    const W=bmp.width,H=bmp.height; bmp.close();
    const dx=region?region.X:0, dy=region?region.Y:0;
    const lines=[];
    (data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>{
      const cs=[];
      (l.words||[]).forEach(wd=>(wd.symbols||[]).forEach(sy=>{
        if(CJK.test(sy.text)) cs.push({ch:sy.text,b:{x0:sy.bbox.x0+dx,y0:sy.bbox.y0+dy,x1:sy.bbox.x1+dx,y1:sy.bbox.y1+dy}});
      }));
      if(cs.length) lines.push(cs);
    })));
    if(!lines.length){ status("Keine chinesischen Zeichen erkannt."); return; }
    let i=0; const flat=[];
    lines.forEach(cs=>{
      /* Pinyin zeilenweise — pinyin-pro löst 多音字 im Wortkontext auf */
      const ps=pinyinPro.pinyin(cs.map(c=>c.ch).join(""),{type:"array",toneType:"symbol"});
      cs.forEach((c,j)=>{ c.i=i++; c.py=ps[j]||""; flat.push(c); });
    });
    OCRRES[id]={w:W,h:H,flat}; SELS[id]=new Set();
    renderShots();
  }catch(err){ status("OCR fehlgeschlagen: "+(err&&err.message||err)); }
}
function overlayHTML(id){
  const R=OCRRES[id]; if(!R) return "";
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
  if(!chars.length) return `<span class="badge">Zeichen im Bild antippen → Wort für die Karte auswählen.</span>`;
  const w=chars.map(c=>c.ch).join("");
  const p=pinyinPro.pinyin(w,{type:"array",toneType:"symbol"}).join(" ");
  return `<div class="selbar"><span class="sw">${esc(w)}</span><span class="sp">${esc(p)}</span>
    <button class="btn mini" data-mkcard="${esc(w)}" data-p="${esc(p)}">→ Karte</button>
    <button class="del" data-clearsel="${id}">leeren</button></div>`;
}

/* ---------- Zuschneiden (Ausschnitt → Karte) ---------- */
let CROP=null; // {id, rect:{x,y,w,h,lw,lh}} während des Zuschneidens
function wireCrop(layer){
  const rect=layer.querySelector(".croprect");
  layer.onpointerdown=e=>{
    e.preventDefault();
    const r=layer.getBoundingClientRect();
    const sx=e.clientX-r.left, sy=e.clientY-r.top;
    CROP.rect=null;
    rect.style.display="block";
    Object.assign(rect.style,{left:sx+"px",top:sy+"px",width:"0px",height:"0px"});
    layer.setPointerCapture(e.pointerId);
    layer.onpointermove=ev=>{
      const x=Math.min(Math.max(ev.clientX-r.left,0),r.width);
      const y=Math.min(Math.max(ev.clientY-r.top,0),r.height);
      const L=Math.min(sx,x),T=Math.min(sy,y),Wd=Math.abs(x-sx),Hd=Math.abs(y-sy);
      Object.assign(rect.style,{left:L+"px",top:T+"px",width:Wd+"px",height:Hd+"px"});
      CROP.rect={x:L,y:T,w:Wd,h:Hd,lw:r.width,lh:r.height};
    };
    layer.onpointerup=()=>{ layer.onpointermove=null; layer.onpointerup=null; };
  };
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
  if(!r){ alert("Erst mit dem Finger einen Rahmen aufziehen."); return; }
  CROP=null; S.pendingImg=r.blob;
  S.mode="add"; render();
}
async function cropOcr(id){
  const r=await cropBlob(id);
  if(!r){ alert("Erst mit dem Finger einen Rahmen aufziehen."); return; }
  CROP=null; renderShots();
  onOcr(id,r);
}

/* ---------- Kamera / Inbox ---------- */
function renderInbox(main){
  main.innerHTML=`<div class="pane">
    <div class="lead">Foto aufnehmen und lokal ablegen. Ablauf: AUSSCHNITT → Rahmen aufziehen → OCR liest diesen Bereich und blendet Pinyin über die Zeichen; antippen wählt sie für die Karte. → KARTE speichert den Rahmen als Kartenbild. Erste OCR-Nutzung lädt einmalig ~9 MB, danach offline; Bedeutung + Ton-Prüfung via Chat.</div>
    <button class="btn primary block" id="snap">Foto aufnehmen</button>
    <div id="shots"></div>
  </div>`;
  $("#snap").onclick=()=>$("#cam").click();
  renderShots();
}
const IMGURL={}; // Objekt-URLs pro Foto cachen — renderShots läuft bei jeder Auswahl neu
function shotURL(s){ return IMGURL[s.id]||(IMGURL[s.id]=URL.createObjectURL(s.blob)); }
function renderShots(){
  const box=$("#shots"); if(!box) return;
  if(!S.inbox.length){ box.innerHTML=`<div class="badge" style="margin-top:18px">Noch keine Aufnahmen.</div>`; return; }
  box.innerHTML=`<div class="listhead">Inbox · ${S.inbox.length}</div>`+
    S.inbox.map(s=>{
      const dt=new Date(s.ts).toLocaleString("de-DE");
      const cropping=CROP && CROP.id===s.id;
      return `<div class="shot">
        <div class="shotwrap">
          <img src="${shotURL(s)}" alt="Aufnahme">
          ${cropping?"":overlayHTML(s.id)}
          ${cropping?`<div class="croplayer" data-id="${s.id}"><div class="croprect"></div></div>`:""}
        </div>
        <div class="meta"><span class="ts">${dt}</span><span class="acts">${cropping
          ?`<button class="ocr-btn" data-cropocr="${s.id}">OCR</button><button class="ocr-btn" data-cropok="${s.id}">→ KARTE</button><button class="del" data-cropcancel="${s.id}">ABBRECHEN</button>`
          :`<button class="ocr-btn" data-crop="${s.id}">AUSSCHNITT</button><button class="ocr-btn" data-ocr="${s.id}">OCR GANZES BILD</button><button class="del" data-del="${s.id}">löschen</button>`}</span></div>
        <div class="ocr" id="ocr-${s.id}">${cropping
          ?`<span class="badge">Rahmen mit dem Finger aufziehen — OCR liest nur diesen Bereich, → KARTE speichert ihn als Kartenbild.</span>`
          :(OCRRES[s.id]?selbarHTML(s.id):"")}</div>
      </div>`;
    }).join("");
  box.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>delShot(b.dataset.del));
  box.querySelectorAll("[data-ocr]").forEach(b=> b.onclick=()=>onOcr(b.dataset.ocr));
  box.querySelectorAll("[data-crop]").forEach(b=> b.onclick=()=>{ CROP={id:b.dataset.crop,rect:null}; renderShots(); });
  box.querySelectorAll("[data-cropok]").forEach(b=> b.onclick=()=>cropOk(b.dataset.cropok));
  box.querySelectorAll("[data-cropocr]").forEach(b=> b.onclick=()=>cropOcr(b.dataset.cropocr));
  box.querySelectorAll("[data-cropcancel]").forEach(b=> b.onclick=()=>{ CROP=null; renderShots(); });
  box.querySelectorAll(".ovbox").forEach(b=> b.onclick=()=>{
    const sel=SELS[b.dataset.sid], i=+b.dataset.i;
    sel.has(i)?sel.delete(i):sel.add(i);
    renderShots();
  });
  box.querySelectorAll("[data-mkcard]").forEach(b=> b.onclick=()=>{
    S.prefill={w:b.dataset.mkcard,p:b.dataset.p};
    S.mode="add"; render();
  });
  box.querySelectorAll("[data-clearsel]").forEach(b=> b.onclick=()=>{ SELS[b.dataset.clearsel].clear(); renderShots(); });
  box.querySelectorAll(".croplayer").forEach(wireCrop);
}
async function onPhoto(e){
  const file=e.target.files && e.target.files[0];
  e.target.value="";
  if(!file) return;
  /* EXIF-Rotation einbrennen + auf max. 1600px verkleinern: hält die Inbox
     klein und die OCR-Boxen deckungsgleich mit der Anzeige */
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
  const rec={ id:"shot_"+Date.now(), blob, ts:Date.now() };
  S.inbox.unshift(rec);
  try{ await idbPut("inbox",rec); }catch(err){}
  if(S.mode!=="inbox"){ S.mode="inbox"; render(); } else renderShots();
}
async function delShot(id){
  S.inbox=S.inbox.filter(s=>s.id!==id);
  try{ await idbDel("inbox",id); }catch(e){}
  if(IMGURL[id]){ URL.revokeObjectURL(IMGURL[id]); delete IMGURL[id]; }
  delete OCRRES[id]; delete SELS[id];
  if(CROP && CROP.id===id) CROP=null;
  renderShots(); setStats();
}

/* ---------- Export / Import (Geräte-Wechsel; Fotos bleiben lokal) ---------- */
async function exportData(){
  const data={ app:"zeichentrainer", version:1, exported:new Date().toISOString(),
    progress:Object.entries(S.progress).map(([c,s])=>({c,...s})),
    custom:S.custom.map(({img,...rest})=>rest) }; // Bilder bleiben lokal (Datenschutz + JSON)
  const json=JSON.stringify(data,null,2);
  /* Android/MIUI blockiert programmatische Blob-Downloads teils stumm —
     Share-Sheet ist der zuverlässige Weg, Download-Link nur Fallback.
     Chrome/Android teilt nur whitelisted Dateitypen (.txt ja, .json nein),
     daher .json.txt mit text/plain */
  const name="zeichentrainer-"+new Date().toISOString().slice(0,10)+".json.txt";
  const file=new File([json],name,{type:"text/plain"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:name}); return; }
    catch(err){ if(err && err.name==="AbortError") return; }
  }
  try{
    const url=URL.createObjectURL(new Blob([json],{type:"text/plain"}));
    const a=document.createElement("a");
    a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(err){ alert("Export fehlgeschlagen: "+err); }
}
async function importData(e){
  const file=e.target.files && e.target.files[0];
  e.target.value="";
  if(!file) return;
  let data=null;
  try{ data=JSON.parse(await file.text()); }catch(err){}
  if(!data || data.app!=="zeichentrainer" || !Array.isArray(data.progress) || !Array.isArray(data.custom)){
    alert("Das ist kein Zeichentrainer-Export (JSON)."); return;
  }
  const prog=data.progress.filter(r=>r && typeof r.c==="string" && typeof r.due==="number");
  const cust=data.custom.filter(r=>r && typeof r.c==="string" && typeof r.p==="string" && typeof r.m==="string");
  if(!prog.length && !cust.length){ alert("Export ist leer — nichts zu importieren."); return; }
  if(!confirm("Importieren: "+prog.length+" Fortschritts-Einträge, "+cust.length+" eigene Karten?\nEinträge zum selben Zeichen werden überschrieben.")) return;
  /* Kartenbilder existieren nur lokal — beim Überschreiben vorhandenes Bild behalten */
  const merged=cust.map(r=>{ const ex=S.custom.find(x=>x.c===r.c); return ex&&ex.img?{...r,img:ex.img}:r; });
  try{
    await Promise.all([...prog.map(r=>idbPut("progress",r)), ...merged.map(r=>idbPut("custom",r))]);
  }catch(err){ alert("Import fehlgeschlagen — nichts dauerhaft gespeichert? ("+err+")"); return; }
  prog.forEach(r=>{ const {c,...s}=r; S.progress[c]=s; });
  merged.forEach(r=>{ const i=S.custom.findIndex(x=>x.c===r.c); if(i>=0) S.custom[i]=r; else S.custom.push(r); });
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  S.mode="study"; render();
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
