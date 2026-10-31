/* Čtečka – Bobova knihovna učebnic, průřezů a digestu.
   Obsah žije v Dropboxu (složka aplikace) a stahuje se do Cache Storage, takže čtení jde offline.
   Katalog (katalog.json) a výrobky vyrábí nastroje/police/vydej.py v textbooku. */
(function(){
'use strict';
var C = window.CTECKA || {};
var LOK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
var CACHE = 'ctecka-knihovna-v1';
var $ = function(id){ return document.getElementById(id); };
function iso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
var DNES = iso(new Date());

// ---- trvalý stav v prohlížeči (vždy s try/catch – soukromé okno ho může zakázat) ----
function cti(k, vychozi){ try { var v = localStorage.getItem('ctecka:' + k); return v ? JSON.parse(v) : vychozi; } catch (e) { return vychozi; } }
function pis(k, v){ try { localStorage.setItem('ctecka:' + k, JSON.stringify(v)); } catch (e) {} }

var stav = cti('stav', {precteno: {}, dnes: null});   // precteno: {cesta: datum}, dnes: {datum, cesta}
var katalog = cti('katalog', null);
var volby = cti('volby', {eink: false, tema: ''});

function uplatniVolby(){
  var r = document.documentElement;
  if (volby.eink) r.setAttribute('data-eink', ''); else r.removeAttribute('data-eink');
  if (volby.tema) r.setAttribute('data-theme', volby.tema); else r.removeAttribute('data-theme');
}
uplatniVolby();
$('datum').textContent = new Date().toLocaleDateString('cs-CZ', {weekday: 'long', day: 'numeric', month: 'long'});
function hlas(t){ $('stav').textContent = t; }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }

// ---- Dropbox: přihlášení PKCE (bez tajemství), přístup jen ke složce aplikace ----
function b64u(a){ var s = ''; a.forEach(function(b){ s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function hlavicka(o){ return JSON.stringify(o).replace(/[\u007f-￿]/g, function(c){ return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4); }); }
var DBX = {
  token: cti('dbx', null),   // {access, refresh, exp}
  navrat: location.origin + location.pathname,
  prihlas: async function(){
    var overeni = b64u(crypto.getRandomValues(new Uint8Array(48)));
    var vyzva = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(overeni))));
    pis('pkce', overeni);
    location.href = 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({client_id: C.dropboxKey,
      response_type: 'code', code_challenge: vyzva, code_challenge_method: 'S256', redirect_uri: this.navrat, token_access_type: 'offline'});
  },
  dokonci: async function(kod){
    var r = await fetch('https://api.dropboxapi.com/oauth2/token', {method: 'POST', body: new URLSearchParams({code: kod,
      grant_type: 'authorization_code', client_id: C.dropboxKey, code_verifier: cti('pkce', ''), redirect_uri: this.navrat})});
    history.replaceState(null, '', this.navrat);
    if (!r.ok) throw new Error('Přihlášení k Dropboxu selhalo (' + r.status + ').');
    var j = await r.json(); this.uloz(j, j.refresh_token);
  },
  uloz: function(j, refresh){
    this.token = {access: j.access_token, refresh: refresh || (this.token && this.token.refresh), exp: Date.now() + (j.expires_in - 60) * 1000};
    pis('dbx', this.token);
  },
  pristup: async function(){
    if (Date.now() < this.token.exp) return this.token.access;
    var r = await fetch('https://api.dropboxapi.com/oauth2/token', {method: 'POST',
      body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: this.token.refresh, client_id: C.dropboxKey})});
    if (!r.ok){ if (r.status === 400 || r.status === 401) this.odhlas(); throw new Error('Dropbox: přístup vypršel, připoj ho znovu.'); }
    this.uloz(await r.json()); return this.token.access;
  },
  odhlas: function(){ this.token = null; pis('dbx', null); },
  stahni: async function(cesta){
    var r = await fetch('https://content.dropboxapi.com/2/files/download', {method: 'POST',
      headers: {Authorization: 'Bearer ' + await this.pristup(), 'Dropbox-API-Arg': hlavicka({path: '/' + cesta})}});
    if (r.status === 409) return null;   // soubor neexistuje
    if (!r.ok) throw new Error('Dropbox: ' + cesta + ' (' + r.status + ')');
    return r;
  },
  nahraj: async function(cesta, text){
    var r = await fetch('https://content.dropboxapi.com/2/files/upload', {method: 'POST', body: text,
      headers: {Authorization: 'Bearer ' + await this.pristup(), 'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': hlavicka({path: '/' + cesta, mode: 'overwrite', mute: true})}});
    if (!r.ok) throw new Error('Dropbox: zápis ' + cesta + ' (' + r.status + ')');
  }
};

// zdroj knihovny: Dropbox, při vývoji na localhostu složka z disku
var zdroj = {
  ma: function(){ return !!DBX.token || (LOK && !!C.lokalniKnihovna); },
  soubor: async function(cesta){
    if (DBX.token) return DBX.stahni(cesta);
    var r = await fetch(C.lokalniKnihovna + cesta, {cache: 'no-store'});
    return r.ok ? r : null;
  }
};

// ---- synchronizace: katalog, stav přečtení, nové výrobky do cache ----
function klic(it){ return new URL('knihovna/' + it.path + '?h=' + it.hash, location.href).href; }
async function synchronizuj(){
  if (!zdroj.ma()){ hlas(C.dropboxKey ? 'Připoj Dropbox v nastavení (⚙).' : 'V nastaveni.js chybí Dropbox klíč.'); return; }
  hlas('Stahuji katalog…');
  try {
    var r = await zdroj.soubor('katalog.json');
    if (!r){ hlas('Knihovna je zatím prázdná.'); return; }
    katalog = await r.json(); pis('katalog', katalog);
    if (DBX.token){ var s = await DBX.stahni('stav.json'); if (s) slucStav(await s.json()); }
    var cache = await caches.open(CACHE), nove = 0, chyb = 0;
    for (var i = 0; i < katalog.items.length; i++){
      var it = katalog.items[i];
      if (await cache.match(klic(it))) continue;
      hlas('Stahuji ' + it.title + '…');
      try { if (await doCache(cache, it)) nove++; } catch (e) { chyb++; }
    }
    var platne = new Set(katalog.items.map(klic));
    (await cache.keys()).forEach(function(q){ if (!platne.has(q.url)) cache.delete(q); });
    hlas('Aktuální · ' + katalog.items.length + ' výrobků' + (nove ? ' · nových ' + nove : '') + (chyb ? ' · nestaženo ' + chyb : '')
      + ' · ' + new Date().toLocaleTimeString('cs-CZ', {hour: '2-digit', minute: '2-digit'}));
  } catch (e) {
    hlas((navigator.onLine === false ? 'Offline' : e.message) + ' – čtu z paměti.');
  }
  vykresli();
}
async function doCache(cache, it){
  var f = await zdroj.soubor(it.path); if (!f) return false;
  var b = await f.blob();
  await cache.put(klic(it), new Response(b, {headers: {'Content-Type': 'text/html; charset=utf-8'}}));
  return b;
}
async function nactiHtml(it){
  var cache = await caches.open(CACHE), r = await cache.match(klic(it));
  if (r) return r.text();
  try { var b = await doCache(cache, it); return b ? b.text() : null; } catch (e) { return null; }
}

function slucStav(jiny){
  Object.keys(jiny.precteno || {}).forEach(function(k){
    if (!stav.precteno[k] || jiny.precteno[k] < stav.precteno[k]) stav.precteno[k] = jiny.precteno[k];
  });
  pis('stav', stav);
}
var odlozeno = null;
function oznacPrecteno(it){
  if (stav.precteno[it.path]) return;
  stav.precteno[it.path] = DNES; pis('stav', stav);
  if (DBX.token){ clearTimeout(odlozeno); odlozeno = setTimeout(function(){ DBX.nahraj('stav.json', JSON.stringify({precteno: stav.precteno})).catch(function(){}); }, 2000); }
}

// ---- domov: Ráno pro Boba + police ----
function polozky(typ){ return ((katalog && katalog.items) || []).filter(function(i){ return i.type === typ; }); }
function dnesniHeslo(){
  var hesla = polozky('digest').sort(function(a, b){ return (a.number || 0) - (b.number || 0) || String(a.created).localeCompare(String(b.created)); });
  if (stav.dnes && stav.dnes.datum === DNES){
    var x = hesla.find(function(i){ return i.path === stav.dnes.cesta; });
    if (x) return x;
  }
  var dalsi = hesla.find(function(i){ return !stav.precteno[i.path]; });
  if (dalsi){ stav.dnes = {datum: DNES, cesta: dalsi.path}; pis('stav', stav); }
  return dalsi || null;
}
async function kartickaZMinula(){
  var prec = polozky('digest').filter(function(i){ return stav.precteno[i.path] && stav.precteno[i.path] < DNES; })
    .sort(function(a, b){ return stav.precteno[b.path].localeCompare(stav.precteno[a.path]); });
  if (!prec.length) return '';
  var html = await nactiHtml(prec[0]); if (!html) return '';
  var k = new DOMParser().parseFromString(html, 'text/html').querySelector('.karticka');
  if (!k || !k.querySelector('summary')) return '';
  return '<details class="karticka"><summary>' + esc(k.querySelector('summary').textContent) + '</summary><div>'
    + esc((k.querySelector('div') || {}).textContent) + '<br><small>z hesla „' + esc(prec[0].title) + '“</small></div></details>';
}
function info(i){
  if (i.type === 'ucebnice') return i.pages ? Object.values(i.pages).pop() + ' stran' : '';
  if (i.type === 'digest') return '~' + (i.minut || 10) + ' min';
  return i.plates ? i.plates + ' listů' : '';
}
async function vykresli(){
  if (!katalog){
    $('ranni').innerHTML = '<div class="prazdno">Tady bude každé ráno čekat heslo z encyklopedie 21. století. '
      + (zdroj.ma() ? 'Stiskni ↻ obnovit.' : 'Nejdřív připoj Dropbox v nastavení (⚙).') + '</div>';
    $('regaly').innerHTML = ''; return;
  }
  var d = dnesniHeslo(), h;
  if (d){
    var hot = !!stav.precteno[d.path];
    h = '<a class="rano' + (hot ? ' hotovo' : '') + '" href="#' + esc(d.path) + '"><div class="k">Dnešní heslo'
      + (d.number ? ' · č. ' + d.number : '') + (hot ? ' · přečteno ✓' : '') + '</div><h2>' + esc(d.title) + '</h2><p>'
      + esc(d.subtitle) + '</p><div class="meta"><span>' + info(d) + '</span><span>' + esc(d.field) + '</span></div></a>';
  } else h = '<div class="prazdno">Všechna hesla jsou přečtená. Řekni Claudovi „dej mi do digestu …“ 🥥</div>';
  $('ranni').innerHTML = h + await kartickaZMinula();
  $('regaly').innerHTML = [['digest', 'Digest'], ['prurez', 'Průřezy'], ['ucebnice', 'Učebnice']].map(function(t){
    var p = polozky(t[0]); if (!p.length) return '';
    return '<section class="regal"><h3>' + t[1] + '</h3><ul>' + p.map(function(i){
      return '<li class="' + (stav.precteno[i.path] ? 'precteno' : '') + '"><a href="#' + esc(i.path) + '"><b>' + esc(i.title)
        + '</b><span>' + esc(i.subtitle || i.project) + '</span><i>' + esc(info(i)) + '</i></a></li>';
    }).join('') + '</ul></section>';
  }).join('');
}

// ---- čtení: výrobek v rámu přes blob URL (stejný původ → pamatuje pozici, hlásí konec) ----
var otevrena = null, blobUrl = null, posl = 0, casovac = null;
var EINK_CSS = '<style id="ctecka-eink">*{animation:none!important;transition:none!important;box-shadow:none!important;'
  + 'scroll-behavior:auto!important}html{filter:grayscale(1) contrast(1.15)}</style>';
async function otevri(cesta){
  var it = katalog && katalog.items.find(function(i){ return i.path === cesta; });
  if (!it){ location.hash = ''; return; }
  var html = await nactiHtml(it);
  if (!html){ hlas('„' + it.title + '“ není stažené a jsi offline.'); location.hash = ''; return; }
  if (volby.eink) html = html.replace(/<head[^>]*>/i, function(m){ return m + EINK_CSS; });
  if (volby.tema) html = html.replace(/<html([^>]*)>/i, '<html$1 data-theme="' + volby.tema + '">');
  otevrena = it;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(new Blob([html], {type: 'text/html'}));
  $('c-nazev').textContent = it.title; document.title = it.title;
  $('cteni').classList.add('on'); $('c-hlava').classList.remove('skryt');
  var ram = $('c-ram');
  ram.onload = function(){ napoj(ram.contentWindow, it); };
  ram.src = blobUrl;
}
function zavri(){
  $('cteni').classList.remove('on'); $('c-ram').src = 'about:blank';
  otevrena = null; document.title = 'Čtečka'; vykresli();
}
function napoj(w, it){
  var pozice = cti('pozice', {});
  try {
    if (pozice[it.path]) setTimeout(function(){ w.scrollTo(0, pozice[it.path]); }, 120);
    posl = 0;
    w.addEventListener('scroll', function(){
      var y = w.scrollY, doc = w.document.documentElement;
      $('c-hlava').classList.toggle('skryt', y > posl && y > 80); posl = y;
      clearTimeout(casovac);
      casovac = setTimeout(function(){ var p = cti('pozice', {}); p[it.path] = Math.round(y); pis('pozice', p); }, 400);
      if (y + w.innerHeight > doc.scrollHeight - 240) oznacPrecteno(it);
    }, {passive: true});
  } catch (e) {}
}
window.addEventListener('message', function(e){ if (e.data && e.data.typ === 'precteno' && otevrena) oznacPrecteno(otevrena); });
function trasa(){ var c = decodeURIComponent(location.hash.slice(1)); if (c) otevri(c); else if (otevrena) zavri(); }
window.addEventListener('hashchange', trasa);
$('c-zpet').addEventListener('click', function(){ location.hash = ''; });

// ---- nastavení ----
function nastaveniInfo(){
  $('n-eink').checked = !!volby.eink; $('n-tema').value = volby.tema || '';
  $('n-dropbox').textContent = (DBX.token ? 'Dropbox je připojený, knihovna se bere ze složky aplikace.'
    : C.dropboxKey ? 'Dropbox není připojený.' : 'V nastaveni.js chybí Dropbox klíč (App key).')
    + (LOK && !DBX.token ? ' Na localhostu se čte knihovna z disku.' : '');
  $('n-pripojit').hidden = !!DBX.token || !C.dropboxKey; $('n-odpojit').hidden = !DBX.token;
}
$('b-nast').addEventListener('click', function(){ nastaveniInfo(); $('nastaveni').showModal(); });
$('n-zavrit').addEventListener('click', function(){ $('nastaveni').close(); });
$('n-eink').addEventListener('change', function(){ volby.eink = this.checked; pis('volby', volby); uplatniVolby(); });
$('n-tema').addEventListener('change', function(){ volby.tema = this.value; pis('volby', volby); uplatniVolby(); });
$('n-pripojit').addEventListener('click', function(){ DBX.prihlas(); });
$('n-odpojit').addEventListener('click', function(){ DBX.odhlas(); nastaveniInfo(); });
$('b-sync').addEventListener('click', synchronizuj);

// ---- start ----
(async function(){
  if ('serviceWorker' in navigator && !LOK) navigator.serviceWorker.register('sw.js').catch(function(){});
  var kod = new URLSearchParams(location.search).get('code');
  if (kod && C.dropboxKey){ try { await DBX.dokonci(kod); } catch (e) { hlas(e.message); } }
  await vykresli(); trasa();
  synchronizuj();
})();
})();
