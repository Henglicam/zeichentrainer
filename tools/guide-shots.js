#!/usr/bin/env node
/* Regenerates the guide's figures and the two sample cards — guide/{photo,chars,learn,front,cards,lang,pcard}-{light,dark}.webp.
 *
 * WHY THIS FILE EXISTS. v549 banned screenshots in the guide for four reasons, and three of them are answered
 * by the crops themselves (one part of one screen instead of a whole screen; no UI prose, so one file serves all
 * ten languages; 84 KB of WebP for the set). The fourth — a screenshot goes stale at the next layout change — is
 * answered here: one command redraws all ten from the app itself.
 *
 *   node tools/guide-shots.js            # serves the repo, writes guide/*.webp
 *   CHROME=/path/to/chrome node tools/guide-shots.js
 *
 * Needs playwright (npm i -D playwright) and a Chromium. Nothing here ships to the phone.
 *
 * THE RULE THE CROPS MUST KEEP: no UI prose in frame. A real screenshot is in ONE language, so what is
 * photographed is pictures, Chinese characters and the fixed endonyms — nothing a translation can change.
 * The one place this is knowingly bent is the language chips, where the app's own language is lit and that
 * language is English; the alternative was twenty files for one figure.
 */
const {chromium}=require("playwright");
const http=require("http"), fs=require("fs"), path=require("path"), url=require("url");

const ROOT=path.resolve(__dirname,"..");
const OUT=process.env.OUT||path.join(ROOT,"guide");
const EXE=process.env.CHROME||process.env.PLAYWRIGHT_CHROMIUM||undefined;
const W=390, DSF=2, Q=0.86;
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".webp":"image/webp",".gz":"application/gzip",".txt":"text/plain",
  ".webmanifest":"application/manifest+json",".wasm":"application/wasm"};

function serve(){
  return new Promise(res=>{
    const s=http.createServer((q,r)=>{
      let u=decodeURIComponent(url.parse(q.url).pathname);
      u=u.replace(/^\/zeichentrainer/,""); if(u.endsWith("/")) u+="index.html";
      const f=path.join(ROOT,u);
      if(!f.startsWith(ROOT)){ r.writeHead(403); return r.end(); }
      fs.readFile(f,(e,b)=>{ if(e){ r.writeHead(404); return r.end("nf"); }
        const ext=path.extname(f), h={"Content-Type":MIME[ext]||"application/octet-stream"};
        if(ext===".gz"){ h["Content-Encoding"]="gzip"; h["Content-Type"]=MIME[path.extname(f.slice(0,-3))]||"text/plain"; }
        r.writeHead(200,h); r.end(b); });
    });
    s.listen(0,"127.0.0.1",()=>res({s,port:s.address().port}));
  });
}

/* a sign-like photo painted in the page — the harness has no photograph of a real Chinese sign, and a
   card's picture has to be SOMETHING. Everything else in the crops is the app's own rendering. */
const PAINT=`
window.__signPhoto=function(w,h,opt){opt=opt||{};
  const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d");
  const wall=opt.wall||["#6d6257","#40382f"];
  const gr=g.createLinearGradient(0,0,w*0.3,h); gr.addColorStop(0,wall[0]); gr.addColorStop(1,wall[1]);
  g.fillStyle=gr; g.fillRect(0,0,w,h);
  for(let i=0;i<w*h/90;i++){ const x=Math.random()*w,y=Math.random()*h,a=Math.random()*0.07;
    g.fillStyle="rgba("+(Math.random()<0.5?"255,255,255,":"0,0,0,")+a+")"; g.fillRect(x,y,1.6,1.6); }
  const pw=w*(opt.pw||0.78), ph=h*(opt.ph||0.34), px=(w-pw)/2, py=h*(opt.py||0.3);
  g.save(); g.translate(w/2,py+ph/2); g.rotate((opt.rot||0)*Math.PI/180); g.translate(-w/2,-(py+ph/2));
  g.shadowColor="rgba(0,0,0,.45)"; g.shadowBlur=w*0.03; g.shadowOffsetY=h*0.012;
  const pg=g.createLinearGradient(px,py,px,py+ph);
  const plate=opt.plate||["#b32b22","#7d1c16"]; pg.addColorStop(0,plate[0]); pg.addColorStop(1,plate[1]);
  g.fillStyle=pg; const r=Math.min(pw,ph)*0.08;
  g.beginPath(); g.moveTo(px+r,py); g.arcTo(px+pw,py,px+pw,py+ph,r); g.arcTo(px+pw,py+ph,px,py+ph,r);
  g.arcTo(px,py+ph,px,py,r); g.arcTo(px,py,px+pw,py,r); g.closePath(); g.fill();
  g.shadowColor="transparent";
  g.fillStyle=opt.ink||"rgba(255,248,238,.97)";
  g.font='600 '+Math.round(ph*0.62)+'px "Songti SC","Noto Serif CJK SC",serif';
  g.textAlign="center"; g.textBaseline="middle";
  g.shadowColor="rgba(0,0,0,.35)"; g.shadowBlur=ph*0.05; g.shadowOffsetY=ph*0.02;
  g.fillText(opt.text||"面包店",w/2,py+ph*0.53);
  g.restore();
  const v=g.createRadialGradient(w*0.42,h*0.34,h*0.1,w*0.5,h*0.5,w*0.78);
  v.addColorStop(0,"rgba(255,255,255,.10)"); v.addColorStop(1,"rgba(0,0,0,.34)");
  g.fillStyle=v; g.fillRect(0,0,w,h);
  return c;};
window.__signBlob=function(w,h,opt){ return new Promise(res=>window.__signPhoto(w,h,opt).toBlob(b=>res(b),"image/jpeg",0.92)); };
window.AUTO_CARD=false;`;

const CARDS=[
  {id:"bake",c:"面包店",p:"miàn bāo diàn",m:"bakery",seg:["面包","店"],gloss:[{w:"面包",p:"miàn bāo",m:"bread"},{w:"店",p:"diàn",m:"shop"}],
   o:{text:"面包店",plate:["#b83226","#7d1c16"],wall:["#77685a","#3d352c"]}},
  {id:"nuts",c:"坚果供应",p:"jiān guǒ gōng yìng",m:"nut supply",seg:["坚果","供应"],gloss:[{w:"坚果",p:"jiān guǒ",m:"nuts"},{w:"供应",p:"gōng yìng",m:"supply"}],
   o:{text:"坚果供应",plate:["#26507e","#16304f"],wall:["#8a8276","#4a443a"],rot:-1.5}},
  {id:"tea",c:"奶茶",p:"nǎi chá",m:"milk tea",seg:["奶茶"],gloss:[{w:"奶茶",p:"nǎi chá",m:"milk tea"}],star:true,
   o:{text:"奶茶",plate:["#2f7a52","#1b4a31"],wall:["#6f6a60","#38342d"]}},
  {id:"door",c:"推",p:"tuī",m:"push",seg:["推"],gloss:[{w:"推",p:"tuī",m:"push"}],
   o:{text:"推",plate:["#c8c2b6","#9a9287"],ink:"rgba(40,36,32,.95)",wall:["#5d564c","#2e2a24"],pw:0.46,ph:0.3}}];

/* every crop: what to set up in the page, and the rect to clip. `h` is the height the figure is shown at in
   the guide (GF_SHOT in app.js) — kept here only so a change to one is a visible change to the other. */
const SHOTS=[
  {name:"photo", setup:()=>{ S.mode="inbox"; S.detail=null; S.editing=null; S.openShot="shot_fresh"; render();
     const b=document.querySelector("[data-crop]"); if(b) b.click(); },
   after:()=>{ const lay=document.querySelector(".croplayer"); if(!lay) return false;
     const q=lay.getBoundingClientRect();
     CROP.rect={x:q.width*0.09,y:q.height*0.30,w:q.width*0.82,h:q.height*0.40,a:0,lw:q.width,lh:q.height};
     CROP.hidden=false; CROP.proposed="text"; CROP.followed=true; renderShots(); return true; },
   pick:()=>{ const w=document.querySelector(".shotwrap"); w.scrollIntoView({block:"center"});
     const f=document.querySelector(".croprect").getBoundingClientRect(), b=w.getBoundingClientRect();
     const top=Math.max(b.top,f.top-52), bot=Math.min(b.bottom,f.bottom+20); /* room for the turn handle */
     return {x:b.left,y:top,w:b.width,h:bot-top}; }},
  {name:"chars", setup:()=>{ S.mode="cards"; S.detail=null; S.editing="nuts"; render(); },
   after:()=>{ const cks=document.querySelectorAll(".cstrip .ck");
     if(cks.length<4) return false; cks[2].classList.add("on"); return true; },
   pick:()=>{ const s=document.querySelector(".cstrip"); s.scrollIntoView({block:"center"});
     const ck=[...s.querySelectorAll(".ck")].map(e=>e.getBoundingClientRect());
     const L=Math.min(...ck.map(r=>r.left)), R=Math.max(...ck.map(r=>r.right));
     const T=Math.min(...ck.map(r=>r.top)), B=Math.max(...ck.map(r=>r.bottom));
     return {x:L-9,y:T-9,w:(R-L)+18,h:(B-T)+18}; }},
  {name:"learn", trace:3, setup:()=>{ S.mode="study"; S.editing=null; S.detail=null; render(); },
   pick:()=>{ const p=document.querySelector("#wpad"); p.scrollIntoView({block:"center"});
     const r=p.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; }},
  /* the study card's own front, photo and pad together, for the empty deck's example card (v599). It follows
     `learn` with no setup on purpose: the three strokes that shot traced are still standing, so the example
     card shows ink and the next stroke lit, which is what the drawn one drew. */
  {name:"front", max:320, setup:()=>{ window.scrollTo(0,0); },
   pick:()=>{ const c=document.querySelector(".cue")||document.querySelector(".picbox"), p=document.querySelector("#wpad");
     const a=c.getBoundingClientRect(), b=p.getBoundingClientRect();
     return {x:a.left,y:a.top,w:a.width,h:b.bottom-a.top}; }},
  {name:"cards", setup:()=>{ S.mode="cards"; S.detail=null; S.cardsTab="cards"; render(); },
   pick:()=>{ const t=[...document.querySelectorAll("#clist .ctile")]; t[0].scrollIntoView({block:"center"});
     const a=t[0].getBoundingClientRect(), b=t[1].getBoundingClientRect();
     return {x:a.left-9,y:a.top-9,w:(b.right-a.left)+18,h:a.height+18}; }},
  {name:"lang", setup:()=>{ S.mode="more"; render(); },
   pick:()=>{ const c=document.querySelector("#lang-chips"); c.scrollIntoView({block:"center"});
     const r=c.getBoundingClientRect(); return {x:r.left-12,y:r.top-8,w:r.width+24,h:r.height+16}; }},
  /* the open card: the photo with the card's own characters under it (v599) — the "your cards" half of the
     privacy figure. It stops at the character row on purpose: the reading line under it carries the MEANING,
     which is in the app's language, and a crop with a translatable word in it serves one language only. */
  {name:"pcard", max:320, setup:()=>{ S.mode="cards"; S.editing=null; S.detail="nuts"; render(); window.scrollTo(0,0); },
   pick:()=>{ const c=document.querySelector(".picbox"), r=document.querySelector(".chrow");
     const a=c.getBoundingClientRect(), b=r.getBoundingClientRect();
     return {x:a.left,y:a.top,w:a.width,h:b.bottom-a.top}; }},
];

/* one traced stroke, following the app's own medians exactly as mountPad maps them */
async function stroke(page,k){
  const pts=await page.evaluate(k=>{
    const cv=document.querySelector("#wpad"), r=cv.getBoundingClientRect();
    const st=S.pad, tg=padTargets(cardOf(curList()[curIdx()])), cur=tg[st.i];
    const m=STROKE_OF.get(cur.glyph); if(!m||!m[k]) return null;
    return m[k].map(p=>{ const q=padPt(p); return {x:r.left+q[0]*r.width,y:r.top+q[1]*r.height}; });
  },k);
  if(!pts) return false;
  const j=()=>(Math.random()-0.5)*0.9;                 /* identical coordinates fire no pointermove */
  await page.mouse.move(pts[0].x+j(),pts[0].y+j()); await page.mouse.down();
  for(const p of pts.slice(1)) await page.mouse.move(p.x+j(),p.y+j(),{steps:2});
  await page.mouse.up(); await page.waitForTimeout(90);
  return true;
}

async function seed(page){
  await page.evaluate(async cards=>{
    const img={},full={};
    for(const k of cards){ img[k.id]=await window.__signBlob(560,560,k.o); full[k.id]=await window.__signBlob(900,600,k.o); }
    const fresh=await window.__signBlob(900,675,{text:"面包店",plate:["#b83226","#7d1c16"],wall:["#77685a","#3d352c"],py:0.33,ph:0.3});
    await new Promise((res,rej)=>{ const rq=indexedDB.open("zeichentrainer",3);
      rq.onerror=()=>rej(new Error("open")); rq.onblocked=()=>rej(new Error("blocked"));
      rq.onupgradeneeded=e=>{ const db=e.target.result;
        for(const s of ["progress","custom","inbox"]) if(!db.objectStoreNames.contains(s)) db.createObjectStore(s,{keyPath:"id"});
        if(!db.objectStoreNames.contains("settings")) db.createObjectStore("settings",{keyPath:"k"}); };
      rq.onsuccess=e=>{ const db=e.target.result,
        tx=db.transaction(["custom","settings","inbox","progress"],"readwrite"),
        cs=tx.objectStore("custom"), ss=tx.objectStore("settings"), is=tx.objectStore("inbox");
        cards.forEach((k,i)=>{ is.put({id:"shot_"+k.id,blob:full[k.id],ts:1756800000000+i*1000});
          cs.put({id:k.id,c:k.c,p:k.p,m:k.m,t:"Custom",at:1756800000000+i*1000,seg:k.seg,gloss:k.gloss,
            img:img[k.id],shot:"shot_"+k.id,frame:{x:0.11,y:0.3,w:0.78,h:0.34,a:0},
            mt:{src:"llm",verified:true},ml:"en",ms:{en:k.m},star:!!k.star,lb:"photo"}); });
        is.put({id:"shot_fresh",blob:fresh,ts:1756800900000});   /* a photo that made no card: the Crop view's subject */
        ss.put({k:"lang",v:"en"}); ss.put({k:"aiAuto",v:false}); ss.put({k:"shareUsage",v:false});
        ss.put({k:"usage",v:{reviews:30,opens:5}}); ss.put({k:"seenVer",v:9999});
        tx.onerror=()=>rej(new Error("tx")); tx.onabort=()=>rej(new Error("abort"));
        tx.oncomplete=()=>{ db.close(); res(); }; }; });
  },CARDS);
}

/* WebP is encoded in the page, so the script needs no image library. `max` caps the file's width in device
   pixels: a crop shown 100 px wide in the guide does not need a 644 px file, and the two sample cards (v599)
   are the largest crops of the set shown at the smallest size. */
async function toWebp(page,png,max){
  const b64=await page.evaluate(async ({b,q,max})=>{
    const im=new Image(); im.src="data:image/png;base64,"+b; await im.decode();
    const sc=max&&im.naturalWidth>max?max/im.naturalWidth:1;
    const c=document.createElement("canvas"); c.width=Math.round(im.naturalWidth*sc); c.height=Math.round(im.naturalHeight*sc);
    const g=c.getContext("2d"); g.imageSmoothingQuality="high"; g.drawImage(im,0,0,c.width,c.height);
    const blob=await new Promise(r=>c.toBlob(r,"image/webp",q));
    const u=new Uint8Array(await blob.arrayBuffer()); let s="";
    for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
    return btoa(s);
  },{b:png.toString("base64"),q:Q,max});
  return Buffer.from(b64,"base64");
}

(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const {s,port}=await serve();
  const made=[];
  for(const dark of [false,true]){
    const b=await chromium.launch(EXE?{executablePath:EXE,args:["--no-sandbox"]}:{args:["--no-sandbox"]});
    const ctx=await b.newContext({viewport:{width:W,height:900},deviceScaleFactor:DSF,
      colorScheme:dark?"dark":"light",hasTouch:true,isMobile:true});
    const page=await ctx.newPage();
    await page.route("**/sw.js",r=>r.fulfill({status:404,body:"no worker in the shot run"}));
    await page.addInitScript(PAINT);
    /* seed from a page of the same origin that runs no app JS, so the app's own boot cannot reload the
       context out from under the write (privacy.html is plain HTML) */
    await page.goto(`http://127.0.0.1:${port}/zeichentrainer/privacy.html`,{waitUntil:"domcontentloaded"});
    await seed(page);
    await page.goto(`http://127.0.0.1:${port}/zeichentrainer/`,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>typeof S!=="undefined"&&S.ready&&S.custom&&S.custom.length>0,null,{timeout:30000});
    await page.waitForTimeout(1100);
    for(const sh of SHOTS){
      await page.evaluate(sh.setup); await page.waitForTimeout(800);
      if(sh.trace){ /* the stroke medians load on the first card of a session */
        let n=0; while(n++<40 && !await page.evaluate(()=>{ const st=S.pad; if(!st) return false;
          const tg=padTargets(cardOf(curList()[curIdx()])); const c=tg[st.i];
          return !!(c&&typeof STROKE_OF!=="undefined"&&STROKE_OF.get(c.glyph)); })) await page.waitForTimeout(250);
        for(let k=0;k<sh.trace;k++) await stroke(page,k);
        await page.waitForTimeout(250);
      }
      if(sh.after && !await page.evaluate(sh.after)){ console.log("SKIP",sh.name); continue; }
      if(sh.after) await page.waitForTimeout(500);
      const c=await page.evaluate(sh.pick); const vp=page.viewportSize();
      const x=Math.max(0,Math.round(c.x)), y=Math.max(0,Math.round(c.y));
      const clip={x,y,width:Math.min(Math.round(c.w),vp.width-x),height:Math.min(Math.round(c.h),vp.height-y)};
      const buf=await toWebp(page,await page.screenshot({clip}),sh.max);
      const f=path.join(OUT,`${sh.name}-${dark?"dark":"light"}.webp`);
      fs.writeFileSync(f,buf);
      made.push({file:path.basename(f),w:clip.width,h:clip.height,ar:+(clip.width/clip.height).toFixed(3),bytes:buf.length});
    }
    await b.close();
  }
  s.close();
  for(const m of made) console.log(`${m.file.padEnd(20)} ${m.w}x${m.h}  ar ${m.ar}  ${m.bytes} B`);
  console.log("total",made.reduce((a,x)=>a+x.bytes,0),"bytes in",made.length,"files");
  console.log("aspect ratios must match GF_SHOT in app.js");
})();
