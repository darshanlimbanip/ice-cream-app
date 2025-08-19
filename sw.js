const CACHE_NAME = 'icecream-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE_NAME).then(c=> c.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=> Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
  );
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if(e.request.method!=='GET') return; // only cache GET
  if(url.origin===location.origin){
    e.respondWith(
      caches.match(e.request).then(res=> res || fetch(e.request).then(resp=>{
        const copy=resp.clone();
        caches.open(CACHE_NAME).then(c=> c.put(e.request, copy));
        return resp;
      }).catch(()=> caches.match('/index.html')))
    );
  }
});