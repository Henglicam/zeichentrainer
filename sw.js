const CACHE = "zt-v9";
/* OCR-Assets (./vendor/, ~9 MB) leben in einem eigenen Cache, der Shell-Updates
   überlebt — sonst würde jede Cache-Versionserhöhung den kompletten
   Tesseract-Download neu ziehen. Nur bei Vendor-Änderungen hochzählen. */
const OCR_CACHE = "zt-ocr-v1";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
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

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const isVendor = new URL(req.url).pathname.includes("/vendor/");
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(isVendor ? OCR_CACHE : CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => isVendor ? Response.error() : caches.match("./index.html")))
  );
});
