/* Čtečka – Bobova knihovna učebnic, průřezů a digestu.
   Obsah žije v Dropboxu (složka aplikace) a stahuje se do Cache Storage, takže čtení jde offline.
   Katalog (katalog.json) a výrobky vyrábí nastroje/police/vydej.py v textbooku. Výrobek se
   otevírá jako samostatná stránka (blob URL), aby prohlížeč při rolování schoval adresní řádek. */
(function(){
'use strict';
var C = window.CTECKA || {};
var LOK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
var CACHE = 'ctecka-knihovna-v1';
var POLICE_ZALOHA = [['digest', 'Digest'], ['kabinet', 'Kabinety'], ['prurez', 'Průřezy'], ['bestiar', 'Bestiáře'], ['ucebnice', 'Učebnice']];
// police posílá katalog (vydej.py → shelves); typy, které katalog nezná, dostanou polici se svým jménem
function police(){
  var p = ((katalog && katalog.shelves) || POLICE_ZALOHA).slice(), zname = p.map(function(x){ return x[0]; });
  ((katalog && katalog.items) || []).forEach(function(i){ if (zname.indexOf(i.type) < 0){ zname.push(i.type); p.push([i.type, i.type]); } });
  return p;
}
var $ = function(id){ return document.getElementById(id); };
function iso(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
var DNES = iso(new Date());

// ---- trvalý stav v prohlížeči (vždy s try/catch – soukromé okno ho může zakázat) ----
function cti(k, vychozi){ try { var v = localStorage.getItem('ctecka:' + k); return v ? JSON.parse(v) : vychozi; } catch (e) { return vychozi; } }
function pis(k, v){ try { localStorage.setItem('ctecka:' + k, JSON.stringify(v)); } catch (e) {} }

var katalog = cti('katalog', null);
var volby = cti('volby', {eink: false, tema: ''});
function stav(){ var s = cti('stav', null) || {}; s.precteno = s.precteno || {}; return s; }   // čte se čerstvě: zapisuje ho i otevřený výrobek

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
    if (!r.ok){ var duvod = (await r.text()).slice(0, 120); if (r.status === 400 || r.status === 401) this.odhlas();
      throw new Error('Dropbox: přístup vypršel, připoj ho znovu (' + r.status + ': ' + duvod + ').'); }
    this.uloz(await r.json()); return this.token.access;
  },
  odhlas: function(){ this.token = null; pis('dbx', null); },
  api: async function(funkce, telo){
    var r = await fetch('https://api.dropboxapi.com/2/' + funkce, {method: 'POST', body: JSON.stringify(telo),
      headers: {Authorization: 'Bearer ' + await this.pristup(), 'Content-Type': 'application/json'}});
    if (!r.ok) throw new Error('Dropbox: ' + funkce + ' (' + r.status + ': ' + (await r.text()).slice(0, 160) + ')');
    return r.json();
  },
  stahni: async function(cesta){
    var r = await fetch('https://content.dropboxapi.com/2/files/download', {method: 'POST',
      headers: {Authorization: 'Bearer ' + await this.pristup(), 'Dropbox-API-Arg': hlavicka({path: '/' + cesta})}});
    if (r.status === 409) return null;   // soubor neexistuje
    if (!r.ok) throw new Error('Dropbox: ' + cesta + ' (' + r.status + ': ' + (await r.text()).slice(0, 160) + ')');
    return r;
  },
  nahraj: async function(cesta, text){
    var r = await fetch('https://content.dropboxapi.com/2/files/upload', {method: 'POST', body: text,
      headers: {Authorization: 'Bearer ' + await this.pristup(), 'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': hlavicka({path: '/' + cesta, mode: 'overwrite', mute: true})}});
    if (!r.ok) throw new Error('Dropbox: zápis ' + cesta + ' (' + r.status + ')');
  },
  soubory: async function(){   // cesty všech souborů ve složce aplikace (malými písmeny, bez úvodního /)
    var j = await this.api('files/list_folder', {path: '', recursive: true}), vse = j.entries;
    while (j.has_more){ j = await this.api('files/list_folder/continue', {cursor: j.cursor}); vse = vse.concat(j.entries); }
    return new Set(vse.filter(function(e){ return e['.tag'] === 'file'; }).map(function(e){ return e.path_lower.slice(1); }));
  },
  smaz: function(cesta){ return this.api('files/delete_v2', {path: '/' + cesta}); }
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

// ---- synchronizace: katalog, co v Dropboxu opravdu leží, stav přečtení, nové výrobky do cache ----
function klic(it){ return new URL('knihovna/' + it.path + '?h=' + it.hash, location.href).href; }
async function synchronizuj(){
  if (!zdroj.ma()){ hlas(C.dropboxKey ? 'Připoj Dropbox v nastavení (⚙).' : 'V nastaveni.js chybí Dropbox klíč.'); return; }
  hlas('Stahuji katalog…');
  try {
    var r = await zdroj.soubor('katalog.json');
    if (!r){ hlas('Knihovna je zatím prázdná.'); return; }
    katalog = await r.json();
    if (DBX.token){
      var lezi = await DBX.soubory();   // co Bob smazal v Dropboxu (nebo košem ve čtečce), už neukazovat
      katalog.items = katalog.items.filter(function(i){ return lezi.has(i.path.toLowerCase()); });
      await synchronizujStav();
      await synchronizujPrani();
      await synchronizujSchranku('zadani.json', 'zadani');       // ＋ zadání (zadani.js) ↔ Claude (nastroje/zadani)
      await synchronizujSchranku('presety-bob.json', 'presety-bob');   // Bobovy vlastní presety
      await synchronizujSchranku('osnovy-bob.json', 'osnovy-bob');     // Bobovy uložené osnovy
    }
    pis('katalog', katalog);
    try { var rp = await zdroj.soubor('presety.json'); if (rp) pis('presety', await rp.json()); } catch (e) {}
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
async function synchronizujStav(){   // sjednotit „přečteno“ mezi zařízeními přes stav.json v Dropboxu
  var s = stav(), r = await DBX.stahni('stav.json'), vzdaleny = r ? (await r.json()).precteno || {} : {};
  var zmena = false;
  Object.keys(vzdaleny).forEach(function(k){ if (!s.precteno[k] || vzdaleny[k] < s.precteno[k]) s.precteno[k] = vzdaleny[k]; });
  Object.keys(s.precteno).forEach(function(k){ if (vzdaleny[k] !== s.precteno[k]) zmena = true; });
  pis('stav', s);
  if (zmena) await DBX.nahraj('stav.json', JSON.stringify({precteno: s.precteno}));
}
// přání (most.js je sbírá při čtení do ctecka:prani) ↔ prani.json v Dropboxu, kde je Claude čte a značí splněná.
// Sloučení podle id: vyhrává pokročilejší stav (čeká < zrušeno < splněno), při shodě novější změna.
var PORADI = {ceka: 0, zruseno: 1, splneno: 2};
function praniLok(){ var x = cti('prani', null) || {}; x.items = x.items || {}; return x; }
async function synchronizujPrani(){
  var lok = praniLok(), r = await DBX.stahni('prani.json'), vzd = r ? ((await r.json()).items || {}) : {}, nahrat = false;
  Object.keys(lok.items).forEach(function(id){
    var a = lok.items[id], b = vzd[id];
    if (!b || PORADI[a.stav] > PORADI[b.stav] || (a.stav === b.stav && (a.zmeneno || 0) > (b.zmeneno || 0))){ vzd[id] = a; nahrat = true; }
  });
  lok = praniLok();   // most.js mohl mezitím zapsat (jiná karta) – nepřepsat mu nová přání
  Object.keys(lok.items).forEach(function(id){ if (!vzd[id]) vzd[id] = lok.items[id]; });
  pis('prani', {items: vzd});
  if (nahrat) await DBX.nahraj('prani.json', JSON.stringify({items: vzd}, null, 1));
}
// obecná schránka {items: {id: {…, zmeneno}}} ↔ Dropbox: sloučení podle id, vyhrává novější změna
// (Claude při zápisu taky nastavuje zmeneno). Na disku čtečky je pod ctecka:<klic>.
async function synchronizujSchranku(soubor, klic){
  var lok = cti(klic, null) || {}, r = await DBX.stahni(soubor), vzd = r ? ((await r.json()).items || {}) : {}, nahrat = false;
  lok.items = lok.items || {};
  Object.keys(lok.items).forEach(function(id){
    var a = lok.items[id], b = vzd[id];
    if (!b || (a.zmeneno || 0) > (b.zmeneno || 0)){ vzd[id] = a; nahrat = true; }
  });
  var cerstve = cti(klic, null) || {};   // mezitím zapsané v jiné kartě
  Object.keys(cerstve.items || {}).forEach(function(id){ if (!vzd[id]) vzd[id] = cerstve.items[id]; });
  pis(klic, {items: vzd});
  if (nahrat) await DBX.nahraj(soubor, JSON.stringify({items: vzd}, null, 1));
}
function praniU(cesta){
  var x = praniLok().items, ceka = 0, spl = 0;
  Object.keys(x).forEach(function(id){ var i = x[id]; if (i.cesta !== cesta) return;
    if (i.stav === 'ceka') ceka++; else if (i.stav === 'splneno' && i.splneno && (Date.now() - new Date(i.splneno + 'T12:00:00')) / 864e5 <= 14) spl++; });
  return (ceka ? ' · 🥥 ' + ceka + ' čeká' : '') + (spl ? ' · 🥥 ' + spl + ' splněno' : '');
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

// ---- domov a police ----
function polozky(typ){
  return ((katalog && katalog.items) || []).filter(function(i){ return i.type === typ; })
    .sort(function(a, b){   // nejnovější nahoře; díly jednoho seriálu po sobě v pořadí
      if (a.series && b.series && a.series.id === b.series.id) return a.series.part - b.series.part;
      return String(b.updated || b.created || '').localeCompare(String(a.updated || a.created || '')) || (b.number || 0) - (a.number || 0);
    });
}
async function kartickaZMinula(){
  var pr = stav().precteno;
  var prec = polozky('digest').filter(function(i){ return pr[i.path] && pr[i.path] < DNES; })
    .sort(function(a, b){ return pr[b.path].localeCompare(pr[a.path]); });
  if (!prec.length) return '';
  var html = await nactiHtml(prec[0]); if (!html) return '';
  var k = new DOMParser().parseFromString(html, 'text/html').querySelector('.karticka');
  if (!k || !k.querySelector('summary')) return '';
  return '<details class="karticka"><summary>' + esc(k.querySelector('summary').textContent) + '</summary><div>'
    + esc((k.querySelector('div') || {}).textContent) + '<br><small>z hesla „' + esc(prec[0].title) + '“</small></div></details>';
}
function info(i){
  if (i.type === 'ucebnice') return i.pages ? Object.values(i.pages).pop() + ' stran' : '';
  if (i.type === 'digest') return (i.series ? 'díl ' + i.series.part + '/' + i.series.parts + ' · ' : '') + '~' + (i.minut || 10) + ' min';
  if (i.type === 'bestiar') return i.games ? i.games + ' her' : '';
  if (i.type === 'kabinet') return (i.boxu ? i.boxu + ' zajímavostí · ' : '') + '~' + (i.minut || 15) + ' min';
  if (i.pages) return Object.values(i.pages).pop() + ' stran';
  return i.plates ? i.plates + ' listů' : '';
}
function seznam(p){
  var pr = stav().precteno;
  return '<ul>' + p.map(function(i){
    return '<li class="' + (pr[i.path] ? 'precteno' : '') + '"><a href="#" data-cesta="' + esc(i.path) + '"><b>' + esc(i.title)
      + '</b><span>' + esc(i.subtitle || i.project) + '</span><i>' + esc(info(i) + praniU(i.path)) + '</i></a>'
      + (DBX.token ? '<button class="kos" data-kos="' + esc(i.path) + '" title="Vyhodit z knihovny" aria-label="Vyhodit „' + esc(i.title) + '“">🗑</button>' : '')
      + '</li>';
  }).join('') + '</ul>';
}
async function vykresli(){
  // moduly (zadani.js, rady.js) mají vlastní trasy: #zadani…, #rada/…, #napric/…
  for (var mi = 0; mi < MODULY.length; mi++){
    if (MODULY[mi].trasa){ var h = await MODULY[mi].trasa(location.hash); if (h != null){ $('obsah').innerHTML = h; MODULY[mi].poVykresleni && MODULY[mi].poVykresleni(); return; } }
  }
  var trasa = location.hash.match(/^#police\/(\w+)/), typ = trasa && trasa[1];
  if (!katalog){
    $('obsah').innerHTML = '<div class="prazdno">Tady bude tvoje knihovna. '
      + (zdroj.ma() ? 'Stiskni ↻ obnovit.' : 'Nejdřív připoj Dropbox v nastavení (⚙).') + '</div>';
    return;
  }
  if (typ){   // celá jedna police
    var nazev = (police().find(function(p){ return p[0] === typ; }) || [, typ])[1], vse = polozky(typ);
    $('obsah').innerHTML = '<section class="regal"><a class="zpet" href="#">← všechny police</a><h3>' + esc(nazev) + ' · ' + vse.length + '</h3>'
      + (vse.length ? seznam(vse) : '<p class="prazdno">Prázdná police.</p>') + '</section>';
    return;
  }
  var regaly = police().map(function(t){
    var p = polozky(t[0]); if (!p.length) return '';
    return '<section class="regal"><h3>' + t[1] + ' <a href="#police/' + t[0] + '">vše (' + p.length + ') →</a>'
      + '</h3>' + seznam(p.slice(0, 3)) + '</section>';
  }).join('');
  var nahore = '', dole = '';
  for (var mj = 0; mj < MODULY.length; mj++){
    if (MODULY[mj].domov) nahore += await MODULY[mj].domov();
    if (MODULY[mj].police) dole += await MODULY[mj].police();
  }
  $('obsah').innerHTML = nahore + (await kartickaZMinula()) + dole + (regaly || '<div class="prazdno">Knihovna je prázdná. Řekni Claudovi, ať něco vyrobí 🥥</div>');
  MODULY.forEach(function(m){ m.poVykresleni && m.poVykresleni(); });
}
window.addEventListener('hashchange', vykresli);

// ---- otevření výrobku: cti.html ho vezme z offline paměti a zobrazí jako celou stránku ----
async function otevri(cesta){
  var it = katalog && katalog.items.find(function(i){ return i.path === cesta; });
  if (!it) return;
  if (!await nactiHtml(it)){ hlas('„' + it.title + '“ není stažené a jsi offline.'); return; }   // jistota, že je v cache
  location.href = 'cti.html?c=' + encodeURIComponent(cesta);
}
async function vyhod(cesta){
  var it = katalog && katalog.items.find(function(i){ return i.path === cesta; });
  if (!it || !confirm('Vyhodit „' + it.title + '“ z knihovny?\nSmaže se z Dropboxu na všech zařízeních (30 dní jde vrátit z koše na dropbox.com).')) return;
  try {
    // čekající přání musí odjet dřív, než výrobek zmizí (Claude ho pak splní z originálu na disku)
    var x = praniLok().items;
    if (Object.keys(x).some(function(id){ return x[id].cesta === cesta && x[id].stav === 'ceka'; })){
      hlas('Posílám přání…'); await synchronizujPrani();
    }
    await DBX.smaz(cesta);
    katalog.items = katalog.items.filter(function(i){ return i.path !== cesta; }); pis('katalog', katalog);
    (await caches.open(CACHE)).delete(klic(it));
    hlas('Vyhozeno: ' + it.title);
  } catch (e) { hlas(e.message); }
  vykresli();
}
$('obsah').addEventListener('click', function(e){
  for (var i = 0; i < MODULY.length; i++){ if (MODULY[i].klik && MODULY[i].klik(e)) return; }
  var a = e.target.closest('[data-cesta]'), k = e.target.closest('[data-kos]');
  if (a){ e.preventDefault(); otevri(a.dataset.cesta); }
  else if (k){ e.preventDefault(); vyhod(k.dataset.kos); }
});
// návrat zpět z výrobku: téma mohl Bob přepnout ve výrobku (☾ u „← police“) – načíst volby znovu
window.addEventListener('pageshow', function(e){ volby = cti('volby', volby); uplatniVolby(); temaIkona(); if (e.persisted) vykresli(); });
function temaNyni(){ return document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
function temaIkona(){ $('b-tema').textContent = temaNyni() === 'dark' ? '☀' : '☾'; }
$('b-tema').addEventListener('click', function(){
  volby = cti('volby', volby) || {}; volby.tema = temaNyni() === 'dark' ? 'light' : 'dark';
  pis('volby', volby); uplatniVolby(); temaIkona();
});
temaIkona();

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
$('n-tema').addEventListener('change', function(){ volby.tema = this.value; pis('volby', volby); uplatniVolby(); temaIkona(); });
$('n-pripojit').addEventListener('click', function(){ DBX.prihlas(); });
$('n-odpojit').addEventListener('click', function(){ DBX.odhlas(); nastaveniInfo(); vykresli(); });
$('b-sync').addEventListener('click', synchronizuj);

// ---- moduly: zadani.js, rady.js (načtené před app.js) dostanou API čtečky ----
var MODULY = window.CTECKA_MODULY || [];
var API = {
  $: $, esc: esc, cti: cti, pis: pis, hlas: hlas, iso: iso, DNES: DNES, DBX: DBX, zdroj: zdroj,
  katalog: function(){ return katalog; }, vykresli: vykresli, nactiHtml: nactiHtml, otevri: otevri,
  info: info, seznam: seznam, synchronizuj: synchronizuj
};
MODULY.forEach(function(m){ m.init && m.init(API); });

// ---- start ----
(async function(){
  if ('serviceWorker' in navigator && !LOK) navigator.serviceWorker.register('sw.js').catch(function(){});
  var kod = new URLSearchParams(location.search).get('code');
  if (kod && C.dropboxKey){ try { await DBX.dokonci(kod); } catch (e) { hlas(e.message); } }
  await vykresli();
  synchronizuj();
})();
})();
