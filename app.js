"use strict";
/* 识字 · Zeichentrainer — standalone PWA
   Persistence via IndexedDB (survives restarts). Camera inbox. Offline. */

/* ---------- Deck (in code, survives everything) ---------- */
const DECK_BASE = [
  { c:"学", p:"xué", m:"to learn, to study", w:"学习", wp:"xuéxí", wm:"to learn", ex:"我在学中文。", exp:"Wǒ zài xué Zhōngwén.", exm:"I am learning Chinese.", t:"Everyday" },
  { c:"识", p:"shí", m:"to recognize, to know", w:"认识", wp:"rènshi", wm:"to know (someone)", ex:"很高兴认识你。", exp:"Hěn gāoxìng rènshi nǐ.", exm:"Nice to meet you.", t:"Everyday" },
  { c:"需", p:"xū", m:"to need, to require", w:"需要", wp:"xūyào", wm:"to need", ex:"我需要帮助。", exp:"Wǒ xūyào bāngzhù.", exm:"I need help.", t:"Everyday" },
  { c:"供", p:"gōng", m:"to supply, to provide", w:"供应", wp:"gōngyìng", wm:"supply", ex:"供应很稳定。", exp:"Gōngyìng hěn wěndìng.", exm:"The supply is stable.", t:"Everyday" },
  { c:"议", p:"yì", m:"to discuss, to confer", w:"会议", wp:"huìyì", wm:"meeting", ex:"会议开始了。", exp:"Huìyì kāishǐ le.", exm:"The meeting has started.", t:"Everyday" },
  { c:"合", p:"hé", m:"to combine, to fit", w:"合同", wp:"hétong", wm:"contract", ex:"我们签了合同。", exp:"Wǒmen qiān le hétong.", exm:"We signed the contract.", t:"Contract" },
  { c:"同", p:"tóng", m:"same, together", w:"同意", wp:"tóngyì", wm:"to agree", ex:"我同意你的看法。", exp:"Wǒ tóngyì nǐ de kànfǎ.", exm:"I agree with your view.", t:"Contract" },
  { c:"续", p:"xù", m:"to continue, to extend", w:"续签", wp:"xùqiān", wm:"to renew (a contract)", ex:"合同需要续签。", exp:"Hétong xūyào xùqiān.", exm:"The contract needs to be renewed.", t:"Contract" },
  { c:"签", p:"qiān", m:"to sign", w:"签字", wp:"qiānzì", wm:"to sign one's name", ex:"请在这里签字。", exp:"Qǐng zài zhèlǐ qiānzì.", exm:"Please sign here.", t:"Contract" },
  { c:"谈", p:"tán", m:"to talk, to negotiate", w:"谈判", wp:"tánpàn", wm:"negotiation", ex:"谈判很顺利。", exp:"Tánpàn hěn shùnlì.", exm:"The negotiation went smoothly.", t:"Contract" },
  { c:"判", p:"pàn", m:"to judge, to assess", w:"判断", wp:"pànduàn", wm:"judgment, to assess", ex:"这很难判断。", exp:"Zhè hěn nán pànduàn.", exm:"That is hard to judge.", t:"Contract" },
  { c:"延", p:"yán", m:"to extend, to delay", w:"延期", wp:"yánqī", wm:"to postpone", ex:"会议延期了。", exp:"Huìyì yánqī le.", exm:"The meeting was postponed.", t:"Contract" },
  { c:"补", p:"bǔ", m:"to supplement, to compensate", w:"补偿", wp:"bǔcháng", wm:"compensation", ex:"公司给了补偿。", exp:"Gōngsī gěi le bǔcháng.", exm:"The company paid compensation.", t:"Contract" },
  { c:"条", p:"tiáo", m:"strip; clause", w:"条件", wp:"tiáojiàn", wm:"condition", ex:"条件可以接受。", exp:"Tiáojiàn kěyǐ jiēshòu.", exm:"The conditions are acceptable.", t:"Contract" },
  { c:"效", p:"xiào", m:"effect, effective", w:"效率", wp:"xiàolǜ", wm:"efficiency", ex:"他工作效率很高。", exp:"Tā gōngzuò xiàolǜ hěn gāo.", exm:"He works very efficiently.", t:"Contract" },
  { c:"镜", p:"jìng", m:"lens, mirror", w:"镜头", wp:"jìngtóu", wm:"camera lens", ex:"这个镜头很贵。", exp:"Zhège jìngtóu hěn guì.", exm:"This lens is expensive.", t:"Optics" },
  { c:"光", p:"guāng", m:"light", w:"光线", wp:"guāngxiàn", wm:"light ray, lighting", ex:"光线不够。", exp:"Guāngxiàn bùgòu.", exm:"There is not enough light.", t:"Optics" },
  { c:"精", p:"jīng", m:"fine, precise", w:"精密", wp:"jīngmì", wm:"precision", ex:"这是精密仪器。", exp:"Zhè shì jīngmì yíqì.", exm:"This is a precision instrument.", t:"Optics" },
  { c:"密", p:"mì", m:"dense; secret", w:"密度", wp:"mìdù", wm:"density", ex:"密度很高。", exp:"Mìdù hěn gāo.", exm:"The density is high.", t:"Optics" },
  { c:"快", p:"kuài", m:"fast", w:"快门", wp:"kuàimén", wm:"shutter", ex:"快门速度很快。", exp:"Kuàimén sùdù hěn kuài.", exm:"The shutter speed is very fast.", t:"Optics" },
  { c:"门", p:"mén", m:"door, gate", w:"快门", wp:"kuàimén", wm:"shutter", ex:"门关上了。", exp:"Mén guānshàng le.", exm:"The door is closed.", t:"Optics" },
  { c:"决", p:"jué", m:"to decide", w:"决定", wp:"juédìng", wm:"decision", ex:"我还没决定。", exp:"Wǒ hái méi juédìng.", exm:"I have not decided yet.", t:"Everyday" },
  { c:"每日", p:"měirì", m:"daily, every day (formal/written)", w:"每天", wp:"měitiān", wm:"every day (colloquial)", ex:"每日更新。", exp:"Měirì gēngxīn.", exm:"Updated daily.", t:"Food" },
  { c:"坚果", p:"jiānguǒ", m:"nuts", ex:"坚果很有营养。", exp:"Jiānguǒ hěn yǒu yíngyǎng.", exm:"Nuts are very nutritious.", t:"Food" },
  { c:"果干", p:"guǒgān", m:"dried fruit", ex:"我喜欢吃果干。", exp:"Wǒ xǐhuān chī guǒgān.", exm:"I like eating dried fruit.", t:"Food" },
];

const NEW_PER_SESSION = 8;
const CJK = /[\u4e00-\u9fff]/;
const glyphs = s => [...String(s)].filter(ch => CJK.test(ch)).length;
const headFont = s => { const n = glyphs(s); return n<=1?150:n===2?104:n===3?74:n<=8?58:n<=12?44:34; };

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
  if (s.interval<1) return "<1 d";
  if (s.interval===1) return "1 d";
  return s.interval+" d";
}

/* ---------- IndexedDB (persistent) ---------- */
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
  pendingImg:null, pendingFull:null, pendingUse:"crop", prefill:null, persist:null };

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
  }catch(e){ console.warn("IndexedDB unavailable, session only:", e); }
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
  $("#cam").onchange=onPhoto;
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
  main.classList.toggle("center", S.mode==="study");
  if(S.mode==="study") return renderStudy(main);
  if(S.mode==="add")   return renderAdd(main);
  if(S.mode==="inbox") return renderInbox(main);
  if(S.mode==="more")  return renderMore(main);
}
function renderMore(main){
  const ver=($(".ver")||{}).textContent||"";
  const st=S.persist===true?"persistent on this device":S.persist===false?"local — the system may evict it; install the app to be safe":"checking…";
  main.innerHTML=`<div class="pane more">
    <div class="listhead">Your data</div>
    <div class="mrow"><div><div class="t">Export</div><div class="s">progress + custom cards, via the share sheet</div></div><button class="btn mini" id="export">Export</button></div>
    <div class="mrow"><div><div class="t">Import</div><div class="s">a zeichentrainer-…json.txt file; same words are overwritten</div></div><button class="btn mini" id="import">Import</button></div>
    <div class="mrow"><div><div class="t">Storage</div><div class="s" id="storage-status">${esc(st)}</div></div></div>
    <div class="listhead">Danger zone</div>
    <div class="mrow"><div><div class="t">Reset</div><div class="s">deletes progress, custom cards and photos</div></div><button class="btn mini danger" id="reset">Reset</button></div>
    <div class="listhead">About</div>
    <div class="mrow"><div><div class="t">识字 Zeichentrainer</div><div class="s">${esc(ver)} · offline · everything stays on this phone</div></div></div>
  </div>`;
  $("#export").onclick=exportData;
  $("#import").onclick=()=>$("#imp").click();
  $("#reset").onclick=resetAll;
}

function renderStudy(main){
  if(!S.ready){ main.innerHTML=`<div class="badge">loading…</div>`; return; }
  const finished = S.idx>=S.queue.length;
  if(finished){
    main.innerHTML=`<div class="done">
      <div class="mark">净</div>
      <h2>All clear.</h2>
      <p>${S.ahead?"Pulled-forward round finished.":"Nothing due today. Come back tomorrow — or pull the next cards forward."}</p>
      <button class="btn" id="ahead">Pull forward · next cards</button>
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
    const imgBlock = d.img ? `<div class="cardimg"><img src="${URL.createObjectURL(d.img)}" alt="source"></div>` : "";
    const glossBlock = d.kind==="sign" ? `<div class="gtable">${(d.gloss||[]).map(g=>`<span class="w">${esc(g.w)}</span><span class="p">${esc(g.p)}</span><span>${esc(g.m||"?")}</span>`).join("")}</div>
      ${d.mt&&!d.mt.verified?`<span class="flag">meaning: auto · unverified</span>`:""}
      ${d.imgFull?`<div class="cardimg"><img src="${URL.createObjectURL(d.imgFull)}" alt="context"></div>`:""}` : "";
    const grds=[["again","Again"],["hard","Hard"],["good","Good"],["easy","Easy"]].map(([g,l])=>
      `<button class="grade" data-g="${g}"><span class="lbl">${l}</span><span class="iv">${previewInterval(sched,g)}</span></button>`).join("");
    back=`<div style="margin-top:26px">
      <div class="pin">${esc(d.p)}</div><div class="mean">${esc(d.m)}</div>
      ${d.kind==="sign"?glossBlock:wordBlock+exBlock+imgBlock}
      <div class="grades">${grds}</div></div>`;
  } else {
    back=`<button class="btn wide" id="reveal">Reveal</button>`;
  }
  let front=`<div class="reticle">${reticleSVG(single)}<div class="glyph" style="font-size:${headFont(d.c)}px">${d.seg?d.seg.map(esc).join("<wbr>"):esc(d.c)}</div></div>`;
  if(d.kind==="sign"){
    /* sign card: the picture is the exercise, text underneath wrapped only between words */
    const lines=d.c.split("\n"), segs=d.segs||lines.map(l=>[l]);
    const longest=Math.max(...lines.map(glyphs));
    const fs=longest<=6?40:longest<=9?30:24;
    front=`<div class="signfront">${d.img?`<img class="signimg" src="${URL.createObjectURL(d.img)}" alt="sign">`:""}
      <div class="signtext" style="font-size:${fs}px">${lines.map((l,i)=>`<div>${(segs[i]||[l]).map(esc).join("<wbr>")}</div>`).join("")}</div></div>`;
  }
  main.innerHTML=`<div class="card">
    <div class="tags"><span class="t">${esc(d.t||"")}</span><span class="${isNew?"n":"r"}">${isNew?"new":"review"}</span></div>
    ${front}
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
  const curImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  const imgField=curImg?`<div class="field" id="f-imgfield"><label>Image · stays local</label>
      <div class="pimg"><img src="${URL.createObjectURL(curImg)}" alt="card image">
      <span class="imgacts">${S.pendingFull&&S.pendingImg?`<button class="del${S.pendingUse!=="full"?" on":""}" id="f-usecrop">CROP</button><button class="del${S.pendingUse==="full"?" on":""}" id="f-usefull">FULL PHOTO</button>`:""}<button class="del" id="f-noimg">Remove image</button></span></div></div>`:"";
  main.innerHTML=`<div class="pane">
    <div class="lead">Add a card by hand. Pinyin and meaning filled from OCR are unverified until you check them.</div>
    ${imgField}
    <div class="field"><label>词 · Word</label><input id="f-word" class="hanzi big" placeholder="快门"></div>
    <div class="row">
      <div class="field narrow"><label>Pinyin</label><input id="f-pin" class="mono" placeholder="kuàimén"></div>
      <div class="field"><label>Meaning</label><input id="f-mean" placeholder="shutter"></div>
    </div>
    <div id="f-pinhint" class="err" style="display:none">Auto pinyin/meaning from OCR — unverified. Check the tones (多音字!) and adjust the meaning.</div>
    <div class="field"><label>Example sentence · optional</label><input id="f-ex" class="hanzi" placeholder="快门速度很快。"></div>
    <div class="field"><label>Translation · optional</label><input id="f-exm" placeholder="The shutter speed is very fast."></div>
    <div id="f-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="f-add">Add card</button>
    <div id="f-ok" class="ok" style="display:none"></div>
    <div id="c-list"></div>
  </div>`;
  $("#f-add").onclick=addManual;
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
  const unv=S.custom.filter(d=>d.mt&&!d.mt.verified);
  const line=d=>esc(d.c.replace(/\n/g," / "));
  box.innerHTML=(unv.length?`<div class="listhead">Review · ${unv.length} unverified</div>`+
    unv.map(d=>`<div class="item"><div class="left"><span class="c">${line(d)}</span><span class="m">${esc(d.m)}</span></div><button class="ocr-btn" data-ok="${esc(d.c)}">CONFIRM</button></div>`).join(""):"")+
    `<div class="listhead">Custom cards · ${S.custom.length}</div>`+
    S.custom.map(d=>`<div class="item"><div class="left"><span class="c">${line(d)}${d.kind==="sign"?'<span class="pill">sign</span>':""}</span><span class="p">${esc(d.p)}</span><span class="m">${esc(d.m)}</span></div><button class="del" data-c="${esc(d.c)}">delete</button></div>`).join("");
  box.querySelectorAll(".del").forEach(b=> b.onclick=()=>delCustom(b.dataset.c));
  box.querySelectorAll("[data-ok]").forEach(b=> b.onclick=()=>confirmCard(b.dataset.ok));
}
async function addManual(){
  const word=$("#f-word").value.trim(), pin=$("#f-pin").value.trim(), mean=$("#f-mean").value.trim();
  const ex=$("#f-ex").value.trim(), exm=$("#f-exm").value.trim();
  const err=$("#f-err"), ok=$("#f-ok"); err.style.display="none"; ok.style.display="none";
  const fail=m=>{ err.textContent=m; err.style.display=""; };
  if(!CJK.test(word)) return fail("Please enter a Chinese word.");
  if(!pin||!mean) return fail("Pinyin and meaning are required.");
  if(deck().some(d=>d.c===word)) return fail("“"+word+"” is already in the deck.");
  const card={c:word,p:pin,m:mean,ex,exp:"",exm,t:"Custom"};
  const chosenImg=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
  if(chosenImg){ card.img=chosenImg; }
  S.pendingImg=null; S.pendingFull=null;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false);
  ["f-word","f-pin","f-mean","f-ex","f-exm"].forEach(id=>$("#"+id).value="");
  const fi=$("#f-imgfield"); if(fi) fi.remove();
  $("#f-pinhint").style.display="none";
  S.draft=null;
  ok.textContent="“"+word+"” added."; ok.style.display="";
  setStats(); renderCustomList();
}
async function delCustom(c){
  S.custom=S.custom.filter(x=>x.c!==c);
  try{ await idbDel("custom",c); await idbDel("progress",c); }catch(e){}
  delete S.progress[c];
  setStats(); renderCustomList();
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
        logger:m=>{ if(m.status==="recognizing text") status("recognizing … "+Math.round(m.progress*100)+"%"); }
      });
      _ocrWorker=w; return w;
    })().catch(err=>{ _ocrLoading=null; throw err; });
  }
  return _ocrLoading;
}

/* per-photo result (session only): characters with box + auto pinyin; tap to select */
const OCRRES={}, SELS={}, QSNOTE={};
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
async function quickSave(id,w,p,m,grp){
  const R=OCRRES[id]; if(!R) return;
  if(!m){ /* no dictionary meaning — the form is needed to fill it in */
    S.prefill={w,p,m:""}; S.mode="add"; render(); return;
  }
  if(deck().some(d=>d.c===w)){
    QSNOTE[id]=`“${w}” is already in the deck.`;
  }else{
    const card={c:w,p,m,ex:"",exp:"",exm:"",t:"Custom"};
    if(grp<0){ /* phrase: keep word boundaries so the card front never breaks inside a word */
      const segs=[]; R.flat.filter(c=>SELS[id].has(c.i)).forEach(c=>{
        const last=segs[segs.length-1]; if(last&&last.g===c.g) last.w+=c.ch; else segs.push({g:c.g,w:c.ch}); });
      card.seg=segs.map(x=>x.w);
    }
    const img=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
    if(img) card.img=img;
    S.custom.push(card);
    try{ await idbPut("custom",card); }catch(e){}
    S.queue=buildQueue(false);
    QSNOTE[id]=`“${w}” saved — ${esc(p)}. Auto values, verify when in doubt.`;
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
  const status=t=>{ box.innerHTML=`<span class="badge">${esc(t)}</span>`; };
  try{
    const w=await ocrWorker(status);
    status("recognizing …");
    /* crops are a single text block — PSM 6 is far more robust there than auto layout */
    await w.setParameters({tessedit_pageseg_mode:region?"6":"3"});
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
        /* confidence gate: photo clutter (fences, foliage) produces phantom
           characters with low certainty — drop them */
        if(CJK.test(sy.text) && sy.confidence>=35)
          cs.push({ch:sy.text,b:{x0:sy.bbox.x0+dx,y0:sy.bbox.y0+dy,x1:sy.bbox.x1+dx,y1:sy.bbox.y1+dy}});
      }));
      if(cs.length) lines.push(cs);
    })));
    if(!lines.length){ status("No Chinese characters recognized."); return; }
    let i=0, g=0; const flat=[];
    lines.forEach(cs=>{
      /* pinyin per line — pinyin-pro resolves 多音字 in word context */
      const ps=pinyinPro.pinyin(cs.map(c=>c.ch).join(""),{type:"array",toneType:"symbol"});
      cs.forEach((c,j)=>{ c.i=i++; c.py=ps[j]||""; flat.push(c); });
      /* dictionary word groups: tapping one character selects the whole word */
      segmentChars(cs).forEach(seg=>{ seg.forEach(c=>{ c.g=g; }); g++; });
    });
    OCRRES[id]={w:W,h:H,flat};
    /* a tight single-line frame IS the word or phrase the user wants — pre-select it */
    SELS[id]=new Set((lines.length===1||flat.length<=4)?flat.map(c=>c.i):[]);
    delete QSNOTE[id];
    renderShots();
  }catch(err){ status("OCR failed: "+(err&&err.message||err)); }
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
  const note=QSNOTE[id]?`<div class="ok" style="margin:0 0 8px">${QSNOTE[id]}</div>`:"";
  if(!chars.length){
    return `${note}<span class="badge">Tap a word in the image — one tap selects the whole dictionary word.</span>`;
  }
  /* selection can span several dictionary words — one row per word */
  const groups=[];
  chars.forEach(c=>{
    const last=groups[groups.length-1];
    if(last && last[0].g===c.g) last.push(c); else groups.push([c]);
  });
  const rows=groups.map(gr=>{
    const w=gr.map(c=>c.ch).join("");
    const p=pinyinPro.pinyin(w,{type:"array",toneType:"symbol"}).join(" ");
    const m=(DICT&&DICT.get(w))||"";
    return `<div class="selbar"><span class="sw">${esc(w)}</span><span class="sp">${esc(p)}</span>
      ${m?`<span class="sm">${esc(m)}</span>`:`<span class="sm none">${DICT?"not in dictionary":"dictionary not loaded"}</span>`}
      <button class="btn mini" data-qs="${id}" data-g="${gr[0].g}" data-w="${esc(w)}" data-p="${esc(p)}" data-m="${esc(m)}">Save</button>
      <button class="btn mini" data-mkcard="${esc(w)}" data-p="${esc(p)}" data-m="${esc(m)}">Edit…</button></div>`;
  }).join("");
  if(groups.length<2) return `${note}${rows}<button class="del" style="margin-top:6px" data-clearsel="${id}">clear selection</button>`;
  /* several words selected: the whole string is ONE card — meaning composed word by word */
  const pw=chars.map(c=>c.ch).join("");
  const pp=pinyinPro.pinyin(pw,{type:"array",toneType:"symbol"}).join(" ");
  const pm=groups.map(gr=>{
    const w=gr.map(c=>c.ch).join("");
    const g=(DICT&&DICT.get(w))||"";
    return w+" "+(bestSense(w)||"?");
  }).join(" · ");
  const phrase=`<div class="selbar phrase"><span class="sw">${esc(pw)}</span><span class="sp">${esc(pp)}</span>
      <span class="sm">${esc(pm)}</span>
      <button class="btn mini primary" data-qs="${id}" data-g="-1" data-w="${esc(pw)}" data-p="${esc(pp)}" data-m="${esc(pm)}">Save phrase</button>
      <button class="btn mini" data-mkcard="${esc(pw)}" data-p="${esc(pp)}" data-m="${esc(pm)}">Edit…</button></div>
    <div class="badge" style="margin:4px 0 6px">single words:</div>`;
  return `${note}${phrase}${rows}<button class="del" style="margin-top:6px" data-clearsel="${id}">clear selection</button>`;
}

/* ---------- Cropping (crop → OCR or card image) ---------- */
let CROP=null; // {id, rect:{x,y,w,h,lw,lh}} while cropping
function wireCrop(layer){
  const rect=layer.querySelector(".croprect");
  layer.onpointerdown=e=>{
    e.preventDefault();
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
      showCropPreview(layer.dataset.id);
    };
  };
}
/* confirmation step: show exactly the selected area before anything runs */
let _prevURL=null;
async function showCropPreview(id){
  const box=$("#ocr-"+id); if(!box) return;
  const r=await cropBlob(id);
  if(!r){ box.innerHTML=`<span class="badge">Frame too small — draw again.</span>`; return; }
  if(_prevURL) URL.revokeObjectURL(_prevURL);
  _prevURL=URL.createObjectURL(r.blob);
  box.innerHTML=`<div class="croppreview">
    <img src="${_prevURL}" alt="selected area">
    <div class="badge" style="margin:6px 0 8px">Selected area — drag a corner to resize, drag inside to move, drag elsewhere to redraw.</div>
    <div class="cropacts">
      <button class="btn mini" data-cropocr="${id}">OCR this area</button>
      <button class="btn mini" data-cropsign="${id}">Read sign</button>
      <button class="btn mini" data-cropok="${id}">Image only</button>
    </div></div>`;
  box.querySelector("[data-cropocr]").onclick=()=>cropOcr(id);
  box.querySelector("[data-cropsign]").onclick=()=>cropSign(id);
  box.querySelector("[data-cropok]").onclick=()=>cropOk(id);
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
  if(!r){ alert("Draw a frame with your finger first."); return; }
  const rec=S.inbox.find(x=>x.id===id);
  CROP=null; S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null;
  S.mode="add"; render();
}
async function cropOcr(id){
  const r=await cropBlob(id);
  if(!r){ alert("Draw a frame with your finger first."); return; }
  /* the framed area doubles as the card image — '-> Card' carries it along;
     the full photo stays available as context via the toggle in the Add form */
  const rec=S.inbox.find(x=>x.id===id);
  S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null;
  CROP=null; renderShots();
  onOcr(id,r);
}

/* ---------- Sign cards: phrasebook meaning + transcript editor ---------- */
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
async function cropSign(id){
  const r=await cropBlob(id);
  if(!r){ alert("Draw a frame with your finger first."); return; }
  const rec=S.inbox.find(x=>x.id===id);
  S.pendingImg=r.blob; S.pendingFull=rec?rec.blob:null;
  CROP=null; delete OCRRES[id]; delete SELS[id]; delete SIGN[id]; delete QSNOTE[id];
  renderShots();
  const box=$("#ocr-"+id); if(!box) return;
  const status=t=>{ box.innerHTML=`<span class="badge">${esc(t)}</span>`; };
  try{
    const w=await ocrWorker(status);
    await loadSigns().catch(()=>{}); /* phrasebook optional — falls back to word gloss */
    status("reading sign …");
    await w.setParameters({tessedit_pageseg_mode:"6"});
    const {data}=await w.recognize(r.blob,{},{blocks:true,text:true});
    const lines=[];
    (data.blocks||[]).forEach(b=>(b.paragraphs||[]).forEach(p=>(p.lines||[]).forEach(l=>{
      let t="";
      (l.words||[]).forEach(wd=>(wd.symbols||[]).forEach(sy=>{
        if(sy.confidence>=35 && (CJK.test(sy.text)||SIGN_PUNCT.test(sy.text))) t+=sy.text;
      }));
      t=t.replace(/^[、，。：:,.]+|[、，。：:,.]+$/g,"");
      if(CJK.test(t)) lines.push(t);
    })));
    if(!lines.length){ status("No Chinese characters recognized."); return; }
    SIGN[id]={lines};
    renderShots();
  }catch(err){ status("OCR failed: "+(err&&err.message||err)); }
}
function signEditorHTML(id){
  const sg=SIGN[id]; if(!sg) return "";
  const rows=sg.lines.map((l,k)=>`<div class="sline"><input class="hanzi" data-sid="${id}" data-sline="${k}" value="${esc(l)}" autocomplete="off"><div class="sp" id="sp-${id}-${k}"></div></div>`).join("");
  return `<div class="signed"><div class="badge" style="margin-bottom:8px">Sign transcript — fix any OCR slip, then save.</div>${rows}
    <div class="smean" id="smean-${id}"></div><div class="sgloss" id="sgloss-${id}"></div>
    <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" data-signsave="${id}">Save sign card</button><button class="del" data-signcancel="${id}">cancel</button></div></div>`;
}
/* recompute pinyin / meaning / gloss for the current lines without re-rendering (keeps input focus) */
function signPreview(id){
  const sg=SIGN[id]; if(!sg) return;
  const res=sg.lines.map(l=>CJK.test(l)?lineMeaning(l):null);
  res.forEach((r,k)=>{ const el=$(`#sp-${id}-${k}`); if(el) el.textContent=r?r.py:""; });
  const live=res.filter(Boolean);
  const full=live.length>0 && live.every(r=>r.full);
  const mean=live.map(r=>r.en).filter(Boolean).join(" / ");
  const sm=$(`#smean-${id}`); if(sm) sm.innerHTML=`<span class="badge">meaning · ${full?"phrasebook":"composed word by word"} · unverified</span><div>${esc(mean)||"—"}</div>`;
  const gl=$(`#sgloss-${id}`); if(gl) gl.innerHTML=live.flatMap(r=>r.gloss).map(g=>`<span class="w">${esc(g.w)}</span><span class="p">${esc(g.p)}</span><span>${esc(g.m||"?")}</span>`).join("");
  sg.res=res; sg.full=full; sg.mean=mean;
}
async function saveSign(id){
  const sg=SIGN[id]; if(!sg) return;
  signPreview(id);
  const keep=sg.lines.map((l,k)=>({l:l.trim(),r:sg.res[k]})).filter(x=>x.r);
  if(!keep.length) return;
  const c=keep.map(x=>x.l).join("\n");
  if(deck().some(d=>d.c===c)){ alert("This sign is already in the deck."); return; }
  const card={ kind:"sign", c, p:keep.map(x=>x.r.py).join(" / "), m:sg.mean||"", ex:"",exp:"",exm:"", t:"Sign",
    segs:keep.map(x=>x.r.segs), gloss:keep.flatMap(x=>x.r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))),
    mt:{src:sg.full?"phrasebook":"gloss",verified:false} };
  if(S.pendingImg) card.img=S.pendingImg;
  if(S.pendingFull) card.imgFull=S.pendingFull;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false);
  delete SIGN[id];
  QSNOTE[id]=`Sign card saved — ${keep.length} line${keep.length>1?"s":""}, meaning ${sg.full?"from the phrasebook":"composed word by word"} (unverified).`;
  setStats(); renderShots();
}
async function confirmCard(c){
  const d=S.custom.find(x=>x.c===c); if(!d||!d.mt) return;
  d.mt.verified=true;
  try{ await idbPut("custom",d); }catch(e){}
  renderCustomList();
}

/* ---------- Kamera / Inbox ---------- */
function renderInbox(main){
  main.innerHTML=`<div class="pane">
    <div class="lead">Photos stay on this phone. Frame the text, then OCR it or read it as a sign.</div>
    <button class="btn primary block" id="snap">Take photo</button>
    <div id="shots"></div>
  </div>`;
  $("#snap").onclick=()=>$("#cam").click();
  renderShots();
}
const IMGURL={}; // cache object URLs per photo — renderShots re-runs on every selection
function shotURL(s){ return IMGURL[s.id]||(IMGURL[s.id]=URL.createObjectURL(s.blob)); }
function renderShots(){
  const box=$("#shots"); if(!box) return;
  if(!S.inbox.length){ box.innerHTML=`<div class="badge" style="margin-top:18px">No photos yet.</div>`; return; }
  box.innerHTML=`<div class="listhead">Inbox · ${S.inbox.length}</div>`+
    S.inbox.map(s=>{
      const dt=new Date(s.ts).toLocaleString("en-GB");
      const cropping=CROP && CROP.id===s.id;
      return `<div class="shot">
        <div class="shotwrap">
          <img src="${shotURL(s)}" alt="photo">
          ${cropping?"":overlayHTML(s.id)}
          ${cropping?`<div class="croplayer" data-id="${s.id}"><div class="croprect"><div class="h tl"></div><div class="h tr"></div><div class="h bl"></div><div class="h br"></div></div></div>`:""}
        </div>
        <div class="meta"><span class="ts">${dt}</span><span class="acts">${cropping
          ?`<button class="del" data-cropcancel="${s.id}">CANCEL</button>`
          :`<button class="ocr-btn" data-crop="${s.id}">CROP</button><button class="del" data-del="${s.id}">delete</button>`}</span></div>
        <div class="ocr" id="ocr-${s.id}">${cropping
          ?`<span class="badge">Draw a frame with your finger over the text — corners resize it, dragging inside moves it.</span>`
          :(SIGN[s.id]?signEditorHTML(s.id):OCRRES[s.id]?selbarHTML(s.id):QSNOTE[s.id]?`<div class="ok" style="margin:0">${QSNOTE[s.id]}</div>`:"")}</div>
      </div>`;
    }).join("");
  box.querySelectorAll("[data-del]").forEach(b=> b.onclick=()=>delShot(b.dataset.del));
  box.querySelectorAll("[data-crop]").forEach(b=> b.onclick=()=>{ CROP={id:b.dataset.crop,rect:null}; renderShots(); });
  box.querySelectorAll("[data-cropok]").forEach(b=> b.onclick=()=>cropOk(b.dataset.cropok));
  box.querySelectorAll("[data-cropocr]").forEach(b=> b.onclick=()=>cropOcr(b.dataset.cropocr));
  box.querySelectorAll("[data-cropcancel]").forEach(b=> b.onclick=()=>{ CROP=null; renderShots(); });
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
  box.querySelectorAll("[data-clearsel]").forEach(b=> b.onclick=()=>{ SELS[b.dataset.clearsel].clear(); renderShots(); });
  box.querySelectorAll("[data-qs]").forEach(b=> b.onclick=()=>quickSave(b.dataset.qs,b.dataset.w,b.dataset.p,b.dataset.m,+b.dataset.g));
  box.querySelectorAll(".croplayer").forEach(wireCrop);
  box.querySelectorAll("[data-sline]").forEach(inp=> inp.oninput=()=>{
    const sg=SIGN[inp.dataset.sid]; if(!sg) return;
    sg.lines[+inp.dataset.sline]=inp.value; signPreview(inp.dataset.sid);
  });
  box.querySelectorAll("[data-signsave]").forEach(b=> b.onclick=()=>saveSign(b.dataset.signsave));
  box.querySelectorAll("[data-signcancel]").forEach(b=> b.onclick=()=>{ delete SIGN[b.dataset.signcancel]; renderShots(); });
  Object.keys(SIGN).forEach(signPreview);
}
async function onPhoto(e){
  const file=e.target.files && e.target.files[0];
  e.target.value="";
  if(!file) return;
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
  const rec={ id:"shot_"+Date.now(), blob, ts:Date.now() };
  S.inbox.unshift(rec);
  try{ await idbPut("inbox",rec); }catch(err){}
  /* next step is always framing the text — go straight into crop mode */
  CROP={id:rec.id,rect:null};
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
    try{ await navigator.share({files:[file],title:name}); return; }
    catch(err){ if(err && err.name==="AbortError") return; }
  }
  try{
    const url=URL.createObjectURL(new Blob([json],{type:"text/plain"}));
    const a=document.createElement("a");
    a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
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
      document.addEventListener("visibilitychange",()=>{ if(!document.hidden) reg.update().catch(()=>{}); });
    }).catch(()=>{});
    /* new version activated (skipWaiting+claim) → reload once automatically.
       First install (no controller before) does not trigger a reload. */
    let hadCtrl=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(!hadCtrl){ hadCtrl=true; return; }
      location.reload();
    });
  });
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
