/* Service worker čtečky: skořápka apky a fonty offline. Knihovnu (výrobky) si do vlastní cache
   ukládá app.js. Při změně skořápky zvedni VERZE. */
var VERZE = 'ctecka-skorapka-4';
var SKORAPKA = ['./', 'index.html', 'cti.html', 'app.js', 'nastaveni.js', 'manifest.webmanifest', 'ikona.svg', 'ikona-192.png', 'ikona-512.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERZE).then(function(c){ return c.addAll(SKORAPKA); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(k){
    return Promise.all(k.filter(function(n){ return n.indexOf('ctecka-skorapka-') === 0 && n !== VERZE; }).map(function(n){ return caches.delete(n); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // fonty: z cache, na pozadí obnovit
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com'){
    e.respondWith(caches.open(VERZE).then(function(c){
      return c.match(e.request).then(function(r){
        var sit = fetch(e.request).then(function(o){ c.put(e.request, o.clone()); return o; }).catch(function(){ return r; });
        return r || sit;
      });
    }));
    return;
  }
  // skořápka: síť napřed (ať se nová verze projeví), offline z cache
  if (url.origin === location.origin){
    e.respondWith(fetch(e.request).then(function(o){
      if (o.ok){ var k = o.clone(); caches.open(VERZE).then(function(c){ c.put(e.request, k); }); }
      return o;
    }).catch(function(){ return caches.match(e.request, {ignoreSearch: true}); }));
  }
});
