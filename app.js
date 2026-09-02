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
  detail:null, query:"", filterUnv:false, filterFlag:false, settings:{}, single:null, saved:null, editing:null };

function deck(){
  /* custom entries override base cards with the same key (edited base cards) */
  const byC=new Map(DECK_BASE.map(d=>[d.c,d]));
  S.custom.forEach(d=>byC.set(d.c,d));
  return [...byC.values()];
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
async function setSetting(k,v){ S.settings[k]=v; try{ await idbPut("settings",{k,v}); }catch(e){} }

/* ---------- Boot ---------- */
async function boot(){
  try{
    const [prog, cust, inb, sett] = await Promise.all([idbAll("progress"), idbAll("custom"), idbAll("inbox"), idbAll("settings").catch(()=>[])]);
    S.progress = {}; prog.forEach(r=>{ const {c,...s}=r; S.progress[c]=s; });
    sett.forEach(r=>{ S.settings[r.k]=r.v; });
    S.custom = cust;
    S.inbox = inb.sort((a,b)=>b.ts-a.ts);
  }catch(e){ console.warn("IndexedDB unavailable, session only:", e); }
  S.ready=true;
  S.queue=buildQueue(false); S.idx=0; S.done=0; S.revealed=false; S.ahead=false;
  wireChrome(); render();
  aiAuto(); window.addEventListener("online",()=>{ _aiAutoRan=false; aiAuto(); });
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
  $("#stat-deck").style.display=inStudy?"none":""; /* three pills overflow a 390px top bar */
  $("#stat-open .v").textContent=remaining;
  $("#stat-done .j").textContent=S.done;
  $("#stat-deck .v").textContent=deck().length;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("on",b.dataset.mode===S.mode||(b.dataset.mode==="cards"&&S.mode==="add")));
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
function aiAutoOn(){ return aiOn()&&S.settings.aiAuto===true; }
/* "obviously false" OCR: mean symbol confidence below the threshold, or words no dictionary knows */
const OCR_DOUBT=70;
function ocrDoubt(confs,meaning,unknown){
  const cf=(confs||[]).filter(x=>typeof x==="number");
  const mean=cf.length?cf.reduce((a,b)=>a+b,0)/cf.length:100;
  const why=[];
  if(mean<OCR_DOUBT) why.push(`OCR confidence ${Math.round(mean)}%`);
  if(unknown&&unknown.length) why.push(`unknown ${unknown.slice(0,3).join(" ")}`);
  if(meaning!==null&&meaning!==undefined&&!meaning) why.push("no dictionary meaning");
  return why.join(", ");
}
/* run the automatic AI review shortly after a card was saved (debounced, online only) */
let _aiSoon=null;
function aiAutoSoon(){ if(!aiAutoOn()) return; clearTimeout(_aiSoon); _aiSoon=setTimeout(()=>{ _aiAutoRan=false; aiAuto(); },1500); }
function aiCardPayload(d){
  return { c:d.c, p:d.p, m:d.m, kind:d.kind||"word", note:d.flagNote||"", why:[d.flag?"flagged by the learner":"", d.mt&&d.mt.suspect?"OCR looks doubtful ("+d.mt.suspect+"), check the characters":"", d.mt&&d.mt.pending?"meaning is only a word-by-word gloss, needs a real translation":""].filter(Boolean).join("; "),
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
    if(k>=0) S.custom[k]=upd; else S.custom.push(upd); /* base card -> local override */
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
  if(!aiOn()||S.settings.aiAuto!==true||!navigator.onLine||_aiAutoRan) return;
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
  const rs=$("#ai-runstatus"); if(rs) rs.textContent=q?`${fl} flagged, ${sp} doubtful OCR, ${pd} pending translation${pd===1?"":"s"}`:"flag a card, or save an OCR result that looks doubtful";
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
/* More → Offline translation: not in build / enable (size prompt) / on + pending count */
async function renderNmtRow(){
  const st=$("#nmt-status"), btn=$("#nmt-btn"); if(!st||!btn) return;
  const info=await nmtInfo(); if(!$("#nmt-status")) return;
  const mb=info?Math.round((info.downloadBytes||0)/1e6):0;
  const pend=S.custom.filter(d=>d.kind==="sign"&&d.mt&&d.mt.pending).length;
  const setBtn=(label,fn)=>{ btn.hidden=false; btn.disabled=false; btn.textContent=label; btn.onclick=fn; };
  if(!info){ st.textContent="zh→en model not in this build yet (run the “Fetch zh→en translation model” action on GitHub)"; btn.hidden=true; return; }
  if(!nmtOn()){
    st.textContent=`zh→en neural model (Mozilla, ${mb} MB, downloaded once and cached like OCR). Signs the phrasebook does not cover get a full-sentence meaning.`;
    setBtn("Enable",async()=>{
      if(!confirm(`Download the zh→en translation model (${mb} MB) now? It stays cached on this phone.`)) return;
      await setSetting("nmt",true); btn.disabled=true;
      try{ await nmtLoad(t=>{ st.textContent=t; }); st.textContent="ready"; }
      catch(err){ st.textContent="download failed: "+(err&&err.message||err); await setSetting("nmt",false); }
      renderNmtRow();
    });
    return;
  }
  const cached=await nmtCached();
  st.textContent=(NMT.ready?"loaded":cached?"on, model cached":"on, model downloads on first use")+(pend?`, ${pend} card${pend>1?"s":""} pending`:"");
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
    <div class="mrow"><div><div class="t">Export</div><div class="s">progress + custom cards, via the share sheet</div></div><button class="btn mini" id="export">Export</button></div>
    <div class="mrow"><div><div class="t">Import</div><div class="s">a zeichentrainer-…json.txt file; same words are overwritten</div></div><button class="btn mini" id="import">Import</button></div>
    <div class="mrow"><div><div class="t">Flagged cards</div><div class="s">${deck().filter(d=>d.flag).length} flagged for review, share the list as text (e.g. with a teacher)</div></div><button class="btn mini" id="share-flag">Share</button></div>
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
      <div class="field"><label class="check"><input type="checkbox" id="ai-auto"${S.settings.aiAuto?" checked":""}> Ask the AI automatically when online (doubtful OCR, pending translations)</label></div>
      <div class="badge">What is sent: the Chinese text, pinyin, meaning and your note of flagged, doubtful or pending cards. Never photos.</div>
      <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" id="ai-save">Save</button><button class="del" id="ai-remove">Remove key</button></div>
    </div>
    <div class="mrow"><div><div class="t">Review queue</div><div class="s" id="ai-runstatus"></div></div><button class="btn mini" id="ai-run" hidden></button></div>
    <div class="mrow"><div><div class="t">Storage</div><div class="s" id="storage-status">${esc(st)}</div></div></div>
    <div class="listhead">Danger zone</div>
    <div class="mrow"><div><div class="t">Reset</div><div class="s">deletes progress, custom cards and photos</div></div><button class="btn mini danger" id="reset">Reset</button></div>
    <div class="listhead">About</div>
    <div class="mrow"><div><div class="t">识字 Zeichentrainer</div><div class="s">${esc(ver)} · offline · everything stays on this phone</div></div></div>
  </div>`;
  $("#export").onclick=exportData;
  $("#import").onclick=()=>$("#imp").click();
  $("#share-flag").onclick=shareFlagged;
  renderNmtRow(); renderAiRow();
  $("#reset").onclick=resetAll;
}

function tagsHTML(d,isNew){
  return `<div class="tags"><span class="t">${esc(d.t||"")}</span>${d.flag?`<span class="f">⚑ review</span>`:""}<span class="${isNew?"n":"r"}">${isNew?"new":"review"}</span></div>`;
}
/* ---------- review flag ----------
   Any card can be flagged when the OCR text, pinyin or meaning looks odd and
   someone (a teacher, later maybe an online model) should check it. The flag
   lives on the card record; for base-deck cards it creates a local override. */
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
function frontHTML(d){
  if(d.kind==="sign"){
    /* sign card: the picture is the exercise, text underneath wrapped only between words */
    const lines=d.c.split("\n"), segs=d.segs||lines.map(l=>[l]);
    const longest=Math.max(...lines.map(glyphs));
    const fs=longest<=6?40:longest<=9?30:24;
    return `<div class="signfront">${d.img?`<img class="signimg" src="${URL.createObjectURL(d.img)}" alt="sign">`:""}
      <div class="signtext" style="font-size:${fs}px">${lines.map((l,i)=>`<div>${(segs[i]||[l]).map(esc).join("<wbr>")}</div>`).join("")}</div></div>`;
  }
  const single=glyphs(d.c)<=1;
  /* the photo is the cue — it belongs on the front, before reveal */
  const pic=d.img?`<img class="signimg" src="${URL.createObjectURL(d.img)}" alt="photo">`:"";
  return `${pic}<div class="reticle">${reticleSVG(single)}<div class="glyph" style="font-size:${headFont(d.c)}px">${d.seg?d.seg.map(esc).join("<wbr>"):esc(d.c)}</div></div>`;
}
function backHTML(d){
  const wordBlock = d.w ? `<div class="rule"></div>
    <div class="word"><span class="w">${esc(d.w)}</span><span class="wp">${esc(d.wp||"")}</span></div>
    <div class="wm">${esc(d.wm||"")}</div>` : "";
  const exBlock = d.ex ? `<div class="ex"><div class="zh">${esc(d.ex)}</div>
    ${d.exp?`<div class="exp">${esc(d.exp)}</div>`:""}
    ${d.exm?`<div class="exm">${esc(d.exm)}</div>`:""}</div>` : "";
  const glossBlock = d.kind==="sign" ? `<div class="gtable">${(d.gloss||[]).map(g=>`<span class="w">${esc(g.w)}</span><span class="p">${esc(g.p)}</span><span>${esc(g.m||"?")}</span>`).join("")}</div>
    ${d.mt&&!d.mt.verified?`<span class="flag">meaning ${d.mt.src==="nmt"?"from the offline translation":d.mt.src==="phrasebook"?"from the phrasebook":d.mt.src==="llm"?"from the online AI":d.mt.src==="dict"?"from the dictionary":"composed word by word"}, unverified${d.mt.pending?" (translation pending)":""}${d.mt.suspect?" (OCR doubtful: "+esc(d.mt.suspect)+")":""}</span>`:""}
    ${d.imgFull?`<div class="cardimg"><img src="${URL.createObjectURL(d.imgFull)}" alt="context"></div>`:""}` : "";
  return `<div class="pin">${esc(d.p)}</div><div class="mean">${esc(d.m)}</div>
    ${d.kind==="sign"?glossBlock:wordBlock+exBlock}`;
}
function endSingle(){
  /* leave single-card test mode and restore the session queue */
  const c=S.single; S.single=null;
  if(S.saved){ Object.assign(S,S.saved); S.saved=null; }
  S.revealed=false; S.mode="cards"; S.detail=c; render();
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
  let back="";
  if(S.revealed){
    const grds=[["again","Again"],["hard","Hard"],["good","Good"],["easy","Easy"]].map(([g,l])=>
      `<button class="grade" data-g="${g}"><span class="lbl">${l}</span><span class="iv">${previewInterval(sched,g)}</span></button>`).join("");
    back=`<div style="margin-top:26px">${backHTML(d)}${flagNoteHTML(d)}${aiBoxHTML(d)}<div class="grades">${grds}</div>
      <button class="del flagbtn${d.flag?" on":""}" id="flag">${d.flag?"⚑ Flagged for review · clear":"⚑ Flag for review"}</button></div>`;
  } else {
    back=`<div class="hint">Tap the character to reveal</div>`;
  }
  /* front: no tag row (theme / new / custom is noise while learning); tapping the photo or the character reveals */
  main.innerHTML=`<div class="card">
    ${S.single?`<div class="topline"><button class="del" id="back-cards">← Cards</button><span class="badge">testing one card</span></div>`:""}
    <div class="front${S.revealed?"":" tap"}" id="reveal">${frontHTML(d)}</div>
    ${back}</div>`;
  const rv=$("#reveal"); if(rv && !S.revealed) rv.onclick=()=>{ S.revealed=true; render(); };
  const bk=$("#back-cards"); if(bk) bk.onclick=endSingle;
  const fl=$("#flag"); if(fl) fl.onclick=async()=>{ await setFlag(c,!d.flag); render(); };
  wireAi();
  document.querySelectorAll(".grade").forEach(b=> b.onclick=()=>grade(b.dataset.g));
}

async function grade(g){
  const c=S.queue[S.idx], sched=S.progress[c]||null;
  const s=schedule(sched,g);
  S.progress[c]=s;
  try{ await idbPut("progress",{c,...s}); }catch(e){}
  if(S.single){ endSingle(); return; }
  if(g==="again") S.queue.push(c); else S.done++;
  S.idx++; S.revealed=false; render();
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
    <div class="field"><label>Example sentence (optional)</label><input id="f-ex" class="hanzi" placeholder="快门速度很快。"></div>
    <div class="field"><label>Translation (optional)</label><input id="f-exm" placeholder="The shutter speed is very fast."></div>
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
  $("#f-ex").value=d0.ex||""; $("#f-exm").value=d0.exm||"";
  if(d0.autoPin) $("#f-pinhint").style.display="";
  const saveDraft=()=>{ S.draft={ w:$("#f-word").value, p:$("#f-pin").value, m:$("#f-mean").value,
    ex:$("#f-ex").value, exm:$("#f-exm").value, autoPin:$("#f-pinhint").style.display!=="none" }; };
  ["f-word","f-pin","f-mean","f-ex","f-exm"].forEach(id=>$("#"+id).oninput=saveDraft);
  renderCustomList();
}
/* ---------- Cards: library with photos, detail, single-card test, edit ---------- */
const THUMB={};
function thumbURL(d){ return THUMB[d.c]||(THUMB[d.c]=URL.createObjectURL(d.img)); }
function dropThumb(c){ if(THUMB[c]){ URL.revokeObjectURL(THUMB[c]); delete THUMB[c]; } }
function cardStatus(d){
  const p=S.progress[d.c]; if(!p) return "";
  const days=Math.round((p.due-today())/DAY);
  return `<span class="st${days<=0?" due":""}">${days<=0?"due":"in "+days+" d"}</span>`;
}
function cardsListHTML(){
  const q=S.query.trim().toLowerCase();
  const customSet=new Set(S.custom.map(d=>d.c));
  let list=[...S.custom.slice().reverse(), ...DECK_BASE.filter(d=>!customSet.has(d.c))];
  if(S.filterUnv) list=list.filter(d=>d.mt&&!d.mt.verified);
  if(S.filterFlag) list=list.filter(d=>d.flag||d.ai);
  if(q) list=list.filter(d=>[d.c,d.p,d.m,d.w,d.wp,d.wm,d.flagNote].filter(Boolean).join(" ").toLowerCase().includes(q));
  const rows=list.map(d=>`<button class="crow" data-c="${esc(d.c)}">
      ${d.img?`<img class="thumb" src="${thumbURL(d)}" alt="">`:`<span class="thumb glyph">${esc([...d.c][0])}</span>`}
      <span class="ct"><span class="c">${esc(d.c.replace(/\n/g," / "))}</span><span class="p">${esc(d.p)}</span><span class="m">${esc(d.m)}</span></span>
      <span class="cs">${d.ai?'<span class="pill ai">AI</span>':""}${d.flag?'<span class="pill flagged">⚑ review</span>':""}${cardStatus(d)}</span></button>`).join("");
  return {html:rows||`<div class="badge" style="margin-top:20px">No cards match.</div>`, n:list.length};
}
function renderCards(main){
  const unv=S.custom.filter(d=>d.mt&&!d.mt.verified).length, flg=S.custom.filter(d=>d.flag||d.ai).length, nAi=deck().filter(d=>d.ai).length;
  const {html,n}=cardsListHTML();
  main.innerHTML=`<div class="pane">
    <div class="cardsbar"><input id="q" type="search" placeholder="Search hanzi, pinyin, meaning" value="${esc(S.query)}" autocomplete="off"><button class="btn mini primary" id="newcard">+ New</button></div>
    ${nAi?`<div class="aibar"><span>${nAi} AI suggestion${nAi>1?"s":""} waiting</span><button class="btn mini primary" id="ai-acceptall">Accept all</button></div>`:""}
    <div class="chips"><span class="chipset"><button class="chip${S.filterFlag?" on":""}" id="chip-flag">⚑ Review (${flg})</button><button class="chip${S.filterUnv?" on":""}" id="chip-unv">Unverified (${unv})</button></span><span class="badge" id="cnt">${n} of ${deck().length}</span></div>
    <div class="clist" id="clist">${html}</div>
  </div>`;
  const wire=()=>{ document.querySelectorAll(".crow").forEach(b=> b.onclick=()=>{ S.detail=b.dataset.c; render(); }); };
  const refresh=()=>{ const r=cardsListHTML(); $("#clist").innerHTML=r.html; $("#cnt").textContent=`${r.n} of ${deck().length}`; wire(); };
  $("#q").oninput=e=>{ S.query=e.target.value; refresh(); };
  $("#chip-unv").onclick=()=>{ S.filterUnv=!S.filterUnv; render(); };
  $("#chip-flag").onclick=()=>{ S.filterFlag=!S.filterFlag; render(); };
  const aa=$("#ai-acceptall"); if(aa) aa.onclick=async()=>{ aa.disabled=true; await aiAcceptAll(); render(); };
  $("#newcard").onclick=()=>{ S.mode="add"; render(); };
  wire();
}
function renderCardDetail(main,c){
  const d=cardOf(c); if(!d){ S.detail=null; return renderCards(main); }
  const isCustom=S.custom.some(x=>x.c===c);
  const p=S.progress[c];
  const stat=p?`interval ${p.interval} d · ease ${p.ease.toFixed(2)} · ${p.reps} review${p.reps===1?"":"s"} · next ${new Date(p.due).toLocaleDateString("en-GB")}`:"not studied yet";
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">← Cards</button><span class="badge">${d.kind==="sign"?"sign card":isCustom?"custom card":"base deck"}${d.mt&&!d.mt.verified?", unverified":""}${d.mt&&d.mt.pending?", translation pending":""}${d.mt&&d.mt.suspect?", OCR doubtful":""}</span></div>
    <div class="card">${tagsHTML(d,!p)}${frontHTML(d)}<div style="margin-top:22px">${backHTML(d)}</div>${flagNoteHTML(d)}${aiBoxHTML(d)}</div>
    <div class="detailacts">
      <button class="btn primary" id="d-test">Test this card</button>
      <button class="btn" id="d-edit">Edit</button>
      <button class="btn${d.flag?" on":""}" id="d-flag">${d.flag?"⚑ Clear flag":"⚑ Flag for review"}</button>
      ${isCustom?`<button class="btn danger" id="d-del">Delete</button>`:""}
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
  wireAi();
  const del=$("#d-del"); if(del) del.onclick=async()=>{
    if(!confirm("Delete “"+c.replace(/\n/g," / ")+"” and its progress?")) return;
    await delCustom(c); S.detail=null; render();
  };
}
function renderEdit(main,c){
  const d=cardOf(c); if(!d){ S.editing=null; return renderCards(main); }
  const isSign=d.kind==="sign", isCustom=S.custom.some(x=>x.c===c);
  let removeImg=false;
  main.innerHTML=`<div class="pane">
    <div class="topline"><button class="del" id="back">← Back</button><span class="badge">edit</span></div>
    <div class="field"><label>${isSign?"Sign text, one line per row":"Word"}${isCustom?"":" (base deck, fixed)"}</label>
      ${isCustom?(isSign?`<textarea id="e-word" class="hanzi" rows="${d.c.split("\n").length+1}">${esc(d.c)}</textarea>`:`<input id="e-word" class="hanzi" value="${esc(d.c)}">`)
               :`<div class="ro hanzi">${esc(d.c).replace(/\n/g,"<br>")}</div>`}</div>
    <div class="row">
      <div class="field narrow"><label>Pinyin</label><input id="e-pin" class="mono" value="${esc(d.p)}"></div>
      <div class="field"><label>Meaning</label><input id="e-mean" value="${esc(d.m)}"></div>
    </div>
    ${isSign?"":`<div class="field"><label>Context word, pinyin, meaning (optional)</label>
      <div class="row"><input id="e-w" class="hanzi" value="${esc(d.w||"")}" placeholder="学习"><input id="e-wp" class="mono" value="${esc(d.wp||"")}" placeholder="xuéxí"><input id="e-wm" value="${esc(d.wm||"")}" placeholder="to learn"></div></div>`}
    <div class="field"><label>Example sentence (optional)</label><input id="e-ex" class="hanzi" value="${esc(d.ex||"")}"></div>
    <div class="field"><label>Example pinyin (optional)</label><input id="e-exp" class="mono" value="${esc(d.exp||"")}"></div>
    <div class="field"><label>Translation (optional)</label><input id="e-exm" value="${esc(d.exm||"")}"></div>
    ${d.img?`<div class="field" id="e-imgfield"><label>Image (stays on this phone)</label><div class="pimg"><img src="${thumbURL(d)}" alt=""><button class="del" id="e-noimg">Remove image</button></div></div>`:""}
    <div class="field"><label class="check"><input type="checkbox" id="e-flag"${d.flag?" checked":""}> Flag for review (OCR, pinyin or meaning looks wrong)</label>
      <input id="e-note" value="${esc(d.flagNote||"")}" placeholder="Note for the reviewer (optional)"></div>
    <div id="e-err" class="err" style="display:none"></div>
    <button class="btn primary block" id="e-save">Save changes</button>
  </div>`;
  $("#back").onclick=()=>{ S.editing=null; render(); };
  const ni=$("#e-noimg"); if(ni) ni.onclick=()=>{ removeImg=true; $("#e-imgfield").remove(); };
  $("#e-save").onclick=async()=>{
    const fail=m=>{ const e=$("#e-err"); e.textContent=m; e.style.display=""; };
    let pin=$("#e-pin").value.trim(); const mean=$("#e-mean").value.trim();
    if(!pin||!mean) return fail("Pinyin and meaning are required.");
    /* the Chinese text itself may be corrected (OCR slip) — progress and images move with it */
    let newC=c;
    const we=$("#e-word");
    if(we){
      newC=isSign?we.value.split("\n").map(l=>l.trim()).filter(l=>CJK.test(l)).join("\n"):we.value.replace(/\s+/g,"");
      if(!CJK.test(newC)) return fail("Please enter Chinese text.");
      if(newC!==c && deck().some(x=>x.c===newC)) return fail("“"+newC.replace(/\n/g," / ")+"” is already in the deck.");
    }
    const upd={...d, p:pin, m:mean, ex:$("#e-ex").value.trim(), exp:$("#e-exp").value.trim(), exm:$("#e-exm").value.trim()};
    if(!isSign){ upd.w=$("#e-w").value.trim(); upd.wp=$("#e-wp").value.trim(); upd.wm=$("#e-wm").value.trim();
      if(!upd.w){ delete upd.w; delete upd.wp; delete upd.wm; } }
    if(removeImg){ delete upd.img; delete upd.imgFull; dropThumb(c); }
    if(upd.mt){ upd.mt={...upd.mt, verified:true, pending:false}; delete upd.mt.suspect; } /* a human edited it */
    if($("#e-flag").checked){ upd.flag=true; const note=$("#e-note").value.trim(); if(note) upd.flagNote=note; else delete upd.flagNote; }
    else { delete upd.flag; delete upd.flagNote; }
    await applyCardUpdate(c,upd,newC,pin!==d.p);
    S.editing=null; S.detail=upd.c; render();
  };
}
/* persist an edited card; when the Chinese text changes (OCR slip), recompute
   pinyin/segmentation/gloss (unless pinyin was set by hand) and move progress,
   thumbnail and queue entries to the new key. Base cards become a local override. */
async function applyCardUpdate(c,upd,newC,pinByHand){
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
        const chars=[...newC].filter(ch=>CJK.test(ch)).map(ch=>({ch}));
        const segs=segmentChars(chars).map(seg=>seg.map(x=>x.ch).join(""));
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
  const i=S.custom.findIndex(x=>x.c===c);
  if(i>=0) S.custom[i]=upd; else S.custom.push(upd);
  try{ await idbPut("custom",upd); }catch(e){}
  return upd;
}
function renderCustomList(){
  const box=$("#c-list"); if(!box) return;
  if(!S.custom.length){ box.innerHTML=""; return; }
  const unv=S.custom.filter(d=>d.mt&&!d.mt.verified);
  const line=d=>esc(d.c.replace(/\n/g," / "));
  box.innerHTML=(unv.length?`<div class="listhead">Review: ${unv.length} unverified</div>`+
    unv.map(d=>`<div class="item"><div class="left"><span class="c">${line(d)}</span><span class="m">${esc(d.m)}</span></div><button class="ocr-btn" data-ok="${esc(d.c)}">CONFIRM</button></div>`).join(""):"")+
    `<div class="listhead">Custom cards (${S.custom.length})</div>`+
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
  delete S.progress[c]; dropThumb(c);
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
const OCRRES={}, SELS={}, QSNOTE={}, AIFIX={}, QSCARD={}; /* QSCARD[id] = card saved from this shot (AI suggestion shows under the photo) */ /* AIFIX[id][text] = AI check of an OCR selection before saving */
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
    const card={c:w,p,m,ex:"",exp:"",exm:"",t:"Custom",mt:ai?{src:"llm",verified:true}:{src:"dict",verified:false}};
    /* doubtful OCR (low symbol confidence) → the online AI checks it automatically when enabled */
    const chars=R.flat.filter(c=>grp<0?SELS[id].has(c.i):c.g===grp);
    const why=ai?"":ocrDoubt(chars.map(c=>c.cf),m);
    if(why) card.mt.suspect=why;
    if(grp<0 && chars.map(c=>c.ch).join("")===w){ /* phrase: keep word boundaries so the card front never breaks inside a word */
      const segs=[]; R.flat.filter(c=>SELS[id].has(c.i)).forEach(c=>{
        const last=segs[segs.length-1]; if(last&&last.g===c.g) last.w+=c.ch; else segs.push({g:c.g,w:c.ch}); });
      card.seg=segs.map(x=>x.w);
    }
    const img=S.pendingUse==="full"&&S.pendingFull?S.pendingFull:S.pendingImg;
    if(img) card.img=img;
    S.custom.push(card);
    try{ await idbPut("custom",card); }catch(e){}
    S.queue=buildQueue(false); QSCARD[id]=w;
    QSNOTE[id]=`“${w}” saved — ${esc(p)}. `+(ai?"Checked by the AI.":"Auto values, verify when in doubt.")+(card.mt.suspect?` OCR doubtful (${esc(card.mt.suspect)})${aiAutoOn()?", the AI will check it":""}.`:"");
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
          cs.push({ch:sy.text,cf:sy.confidence,b:{x0:sy.bbox.x0+dx,y0:sy.bbox.y0+dy,x1:sy.bbox.x1+dx,y1:sy.bbox.y1+dy}});
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
  const note=QSNOTE[id]?`<div class="ok" style="margin:0 0 8px">${QSNOTE[id]}</div>${qsAiBox(id)}`:"";
  if(!chars.length){
    return `${note}<span class="badge">Tap a word in the image — one tap selects the whole dictionary word.</span>`;
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
  if(groups.length<2) return `${note}${rows}<button class="del" style="margin-top:6px" data-clearsel="${id}">clear selection</button>`;
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
  return `${note}${phrase}${rows}<button class="del" style="margin-top:6px" data-clearsel="${id}">clear selection</button>`;
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
/* automatic: a doubtful selection (low confidence / no meaning) is checked without a tap */
let _ovAuto=null;
function aiOverlayAuto(id){
  const R=OCRRES[id], sel=SELS[id]; if(!aiAutoOn()||!R||!sel||!sel.size) return;
  const chars=R.flat.filter(c=>sel.has(c.i)), w=chars.map(c=>c.ch).join("");
  if(AIFIX[id]&&(AIFIX[id][w]||AIFIX[id]["~"+w])) return;
  const single=new Set(chars.map(c=>c.g)).size===1;
  const m=single?((DICT&&DICT.get(w))||""):"";
  if(!ocrDoubt(chars.map(c=>c.cf),single?m:"x")) return;
  clearTimeout(_ovAuto);
  _ovAuto=setTimeout(()=>{ if(!OCRRES[id]||!SELS[id]) return;
    const p=pinyinPro.pinyin(w,{type:"array",toneType:"symbol"}).join(" "); aiOverlayAsk(id,w,p,m); },1200);
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
    return true;
  })().catch(err=>{ NMT.ready=null; if(NMT.worker){ NMT.worker.terminate(); NMT.worker=null; } NMT.pending={}; throw err; });
  return NMT.ready;
}
async function nmtTranslate(texts,status){
  if(!texts.length) return [];
  await nmtLoad(status);
  const r=await nmtCall("translate",[{models:[{from:"zh",to:"en"}],texts:texts.map(t=>({text:t,html:false}))}]);
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
      let t=""; const cfs=[];
      (l.words||[]).forEach(wd=>(wd.symbols||[]).forEach(sy=>{
        if(sy.confidence>=35 && (CJK.test(sy.text)||SIGN_PUNCT.test(sy.text))){ t+=sy.text; if(CJK.test(sy.text)) cfs.push(sy.confidence); }
      }));
      t=t.replace(/^[、，。：:,.]+|[、，。：:,.]+$/g,"");
      if(CJK.test(t)) lines.push({t,cf:cfs});
    })));
    if(!lines.length){ status("No Chinese characters recognized."); return; }
    SIGN[id]={lines:lines.map(x=>x.t), orig:lines.map(x=>x.t), conf:lines.map(x=>x.cf)};
    renderShots();
    if(aiAutoOn() && ocrDoubt(lines.flatMap(x=>x.cf),"x")) signAskAI(id); /* doubtful → checked without a tap */
  }catch(err){ status("OCR failed: "+(err&&err.message||err)); }
}
function signEditorHTML(id){
  const sg=SIGN[id]; if(!sg) return "";
  const rows=sg.lines.map((l,k)=>`<div class="sline"><input class="hanzi" data-sid="${id}" data-sline="${k}" value="${esc(l)}" autocomplete="off"><div class="sp" id="sp-${id}-${k}"></div></div>`).join("");
  const low=sg.conf?Math.min(...sg.conf.flat().concat([100])):100;
  const doubt=low<OCR_DOUBT?` OCR looks doubtful here (confidence ${Math.round(low)}%)${aiAutoOn()?" — the AI will check the card":""}.`:"";
  return `<div class="signed"><div class="badge" style="margin-bottom:8px">Sign transcript — fix any OCR slip, then save.${doubt}</div>${rows}
    <div class="smean" id="smean-${id}"></div><div class="sgloss" id="sgloss-${id}"></div>
    <div class="cropacts" style="margin-top:10px"><button class="btn mini primary" data-signsave="${id}">Save sign card</button>${aiOn()&&!sg.ai?(sg.aiBusy?`<span class="ainote">${esc(sg.aiBusy)}</span>`:`<button class="btn mini" data-signai="${id}">Ask AI</button>`):""}<button class="del" data-signcancel="${id}">cancel</button></div>
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
  const gl=$(`#sgloss-${id}`); if(gl) gl.innerHTML=live.flatMap(r=>r.gloss).map(g=>`<span class="w">${esc(g.w)}</span><span class="p">${esc(g.p)}</span><span>${esc(g.m||"?")}</span>`).join("");
  sg.res=res; sg.full=full; sg.mean=mean;
  if(!sg.ai) signTranslate(id);
}
/* ask the online AI about the transcript right here; the corrected text lands in the editor */
async function signAskAI(id){
  const sg=SIGN[id]; if(!sg||sg.aiBusy) return;
  signPreview(id);
  const lines=sg.lines.map(l=>l.trim()).filter(l=>CJK.test(l)); if(!lines.length) return;
  sg.aiBusy="asking the AI …"; delete sg.aiErr; renderShots();
  try{
    const c=lines.join("\n"), res=(sg.res||[]).filter(Boolean);
    const [r]=await aiAsk([{kind:"sign",c,p:res.map(x=>x.py).join(" / "),m:sg.mean||"",gloss:res.flatMap(x=>x.gloss),mt:{src:"gloss",verified:false,suspect:"read from a photo by OCR"}}]);
    if(!SIGN[id]) return;
    const zh=r.zh&&CJK.test(r.zh)?r.zh.replace(/\r/g,"").split("\n").map(l=>l.trim()).filter(Boolean).join("\n"):c;
    sg.lines=zh.split("\n"); sg.ai={zh,p:r.p,m:r.m,note:r.note,ok:r.ok};
  }catch(err){ if(SIGN[id]) sg.aiErr=err&&err.message||String(err); }
  if(SIGN[id]) delete sg.aiBusy;
  renderShots();
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
  signPreview(id);
  const keep=sg.lines.map((l,k)=>({l:l.trim(),r:sg.res[k]})).filter(x=>x.r);
  if(!keep.length) return;
  const c=keep.map(x=>x.l).join("\n");
  if(deck().some(d=>d.c===c)){ alert("This sign is already in the deck."); return; }
  /* meaning: AI check (if done here) → phrasebook → offline translation (if enabled) → word gloss (then pending) */
  let mt={src:sg.full?"phrasebook":"gloss",verified:false,pending:!sg.full}, mean=sg.mean||"", pin=keep.map(x=>x.r.py).join(" / ");
  if(sg.ai && c===sg.ai.zh){ mean=sg.ai.m||mean; pin=sg.ai.p||pin; mt={src:"llm",verified:true,pending:false}; }
  else if(!sg.full && nmtOn()){
    const btn=document.querySelector(`[data-signsave="${id}"]`); if(btn){ btn.disabled=true; btn.textContent="Translating …"; }
    try{ const r=await signMeaning(keep.map(x=>x.l)); mean=r.m||mean; mt={src:r.src,verified:false,pending:r.pending}; }catch(e){}
  }
  /* doubtful OCR: low confidence on a line H did not correct, or words the dictionary does not know */
  const cfs=sg.lines.flatMap((l,k)=>(sg.orig&&sg.orig[k]===l.trim()&&sg.conf&&sg.conf[k])||[]);
  const unknown=keep.flatMap(x=>x.r.gloss.filter(g=>!g.ph&&!g.m).map(g=>g.w));
  const why=mt.src==="llm"?"":ocrDoubt(cfs,null,unknown); if(why) mt.suspect=why;
  const card={ kind:"sign", c, p:pin, m:mean, ex:"",exp:"",exm:"", t:"Sign",
    segs:keep.map(x=>x.r.segs), gloss:keep.flatMap(x=>x.r.gloss.map(g=>({w:g.w,p:g.p,m:g.m}))), mt };
  if(S.pendingImg) card.img=S.pendingImg;
  if(S.pendingFull) card.imgFull=S.pendingFull;
  S.custom.push(card);
  try{ await idbPut("custom",card); }catch(e){}
  S.queue=buildQueue(false); QSCARD[id]=c;
  delete SIGN[id];
  QSNOTE[id]=`Sign card saved — ${keep.length} line${keep.length>1?"s":""}, meaning ${mt.src==="llm"?"checked by the AI":mt.src==="nmt"?"from the offline translation":mt.src==="phrasebook"?"from the phrasebook":"composed word by word"}${mt.src==="llm"?"":" (unverified"+(mt.pending?", translation pending":"")+")"}.`+(mt.suspect?` OCR doubtful (${esc(mt.suspect)})${aiAutoOn()?", the AI will check it":""}.`:"");
  aiAutoSoon();
  setStats(); renderShots();
}
async function confirmCard(c){
  const d=S.custom.find(x=>x.c===c); if(!d||!d.mt) return;
  d.mt.verified=true; d.mt.pending=false; delete d.mt.suspect;
  try{ await idbPut("custom",d); }catch(e){}
  if(S.mode==="cards") render(); else renderCustomList();
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
  box.innerHTML=`<div class="listhead">Inbox (${S.inbox.length})</div>`+
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
          :(SIGN[s.id]?signEditorHTML(s.id):OCRRES[s.id]?selbarHTML(s.id):QSNOTE[s.id]?`<div class="ok" style="margin:0">${QSNOTE[s.id]}</div>${qsAiBox(s.id)}`:"")}</div>
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
  box.querySelectorAll("[data-qs]").forEach(b=> b.onclick=()=>quickSave(b.dataset.qs,b.dataset.w,b.dataset.p,b.dataset.m,+b.dataset.g,b.dataset.ai==="1"));
  box.querySelectorAll("[data-aiq]").forEach(b=> b.onclick=()=>aiOverlayAsk(b.dataset.aiq,b.dataset.w,b.dataset.p,b.dataset.m));
  box.querySelectorAll("[data-signai]").forEach(b=> b.onclick=()=>signAskAI(b.dataset.signai));
  Object.keys(OCRRES).forEach(aiOverlayAuto);
  wireAi(box);
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
