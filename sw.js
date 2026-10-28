const CACHE = 'qaixen-v3';
const ASSETS = ['./', './index.html', './styles.css', './script.js', './config.js', './logo-app.svg', './logo.svg', './manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  if (e.request.method !== 'GET') return;
  if (/googleapis|groq|pollinations|wikimedia|wikipedia|duckduckgo|supabase/i.test(url)) return;
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => r))
  );
});
