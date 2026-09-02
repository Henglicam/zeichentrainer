const CACHE = "zt-v54";
/* OCR assets (./vendor/, ~12 MB) live in their own cache that survives shell
   updates — otherwise every cache version bump would re-download all of
   Tesseract. Only bump this when vendor files change. */
const OCR_CACHE = "zt-ocr-v1";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./signs.json", "./nmt-model.json",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== OCR_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Updates without a VPN: github.io is often unreachable from China, so the page can ask the
   worker to pull a newer shell from a mirror (jsDelivr serves the repo). The files land in the
   current cache and are served from there; the worker script itself stays until github.io is
   reachable again — it only carries the cache name. Model files (> 20 MB) are not mirrored. */
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "mirror-update" && d.mirror) e.waitUntil(mirrorUpdate(d.mirror, e.source, +d.local || 0));
});
async function mirrorUpdate(mirror, client, pageVersion) {
  const say = msg => { if (client) client.postMessage({ type: "mirror-update", ...msg }); };
  try {
    const html = await (await fetch(mirror + "index.html", { cache: "no-store" })).text();
    /* compare with the page's own version label, not the cache name: after a mirror update the
       cache keeps its old name while the shell is already new */
    const m = html.match(/PWA v(\d+)/); const remote = m ? +m[1] : 0, local = pageVersion || +CACHE.replace("zt-v", "");
    if (!remote) throw new Error("mirror answer has no version");
    if (remote <= local) { say({ status: "current", remote, local }); return; }
    const cache = await caches.open(CACHE);
    const puts = [];
    for (const a of ASSETS) {
      const path = a === "./" ? "index.html" : a.replace(/^\.\//, "");
      const res = await fetch(mirror + path, { cache: "no-store" });
      if (!res.ok) throw new Error("mirror " + res.status + " for " + path);
      const body = await res.blob();
      /* type by extension, never from the mirror: jsDelivr hands HTML out as text/plain */
      const type = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", webmanifest: "application/manifest+json", png: "image/png" }[path.split(".").pop()] || "application/octet-stream";
      puts.push([new Request(new URL(a, self.registration.scope).href), new Response(body, { headers: { "Content-Type": type } })]);
    }
    for (const [req, res] of puts) await cache.put(req, res); /* only after every file arrived */
    say({ status: "updated", remote, local });
  } catch (err) { say({ status: "error", error: String(err && err.message || err) }); }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const isVendor = new URL(req.url).pathname.includes("/vendor/");
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      /* never cache error responses — a cached 404 (e.g. fetched before a
         deploy finished) would poison the cache permanently */
      if (res.ok) {
        const copy = res.clone();
        caches.open(isVendor ? OCR_CACHE : CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => isVendor ? Response.error() : caches.match("./index.html")))
  );
});
