/* Čtečka – řady a čtení napříč. Řada = víc výrobků se stejnou osnovou (např. psychoanalytici);
   výrobek do ní patří přes meta "rada": {"id", "nazev", "poradi"} (meta.json / kniha.json).
   Čtení napříč skládá díly řady za běhu (roste s řadou sama) ze značek, které píše Claude:
     <section data-osnova="hlavni-otazka" data-osnova-nazev="Hlavní otázka" id="o-hlavni-otazka">
       <aside class="jadro" data-jadro hidden>2–4 věty – jádro části</aside> …
     <aside class="jadro" data-pojem="superego" data-pojem-nazev="Superego" id="p-superego" hidden>…</aside>
     <div class="kazuistika" data-situace="marta" data-situace-nazev="Marta" id="s-marta"> <aside class="jadro" data-jadro hidden>…</aside> …
   Trasy: #rada/<id>, #napric/<id>, #napric/<id>/(cast|pojem|situace)/<klic>. */
(window.CTECKA_MODULY = window.CTECKA_MODULY || []).push((function(){
'use strict';
var A;
function esc(s){ return A.esc(s); }
function dily(id){
  return ((A.katalog() || {}).items || []).filter(function(i){ return i.rada && i.rada.id === id; })
    .sort(function(a, b){ return (a.rada.poradi || 999) - (b.rada.poradi || 999) || String(a.title).localeCompare(String(b.title), 'cs'); });
}
function vsechnyRady(){
  var m = {};
  ((A.katalog() || {}).items || []).forEach(function(i){ if (i.rada && i.rada.id){ m[i.rada.id] = m[i.rada.id] || {id: i.rada.id, nazev: i.rada.nazev || i.rada.id, n: 0}; m[i.rada.id].n++; } });
  return Object.keys(m).map(function(k){ return m[k]; });
}
function text(el){ return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : ''; }
// rozebrat díly: {dil, casti: {klic: {nazev, jadro, kotva}}, pojmy: {klic: {...}}}
var pamet = {};
async function rozeber(it){
  var k = it.path + '?' + it.hash; if (pamet[k]) return pamet[k];
  var html = await A.nactiHtml(it), out = {dil: it, casti: {}, poradi: [], pojmy: {}, situace: {}};
  if (html){
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('[data-osnova]').forEach(function(s){
      var klic = s.dataset.osnova, h = s.querySelector('h1,h2,h3');
      var j = s.querySelector('.jadro[data-jadro]:not([data-pojem])') || s.querySelector('p');
      out.casti[klic] = {nazev: s.dataset.osnovaNazev || text(h) || klic, jadro: text(j), kotva: s.id || ''};
      out.poradi.push(klic);
    });
    doc.querySelectorAll('.jadro[data-pojem]').forEach(function(p){
      var klic = p.dataset.pojem; if (out.pojmy[klic]) return;
      out.pojmy[klic] = {nazev: p.dataset.pojemNazev || klic, jadro: text(p), kotva: p.id || ''};
    });
    doc.querySelectorAll('[data-situace]').forEach(function(s){   // společní pacienti a situace
      var klic = s.dataset.situace; if (out.situace[klic]) return;
      var j = s.querySelector('.jadro[data-jadro]') || s.querySelector('p');
      out.situace[klic] = {nazev: s.dataset.situaceNazev || klic, jadro: text(j), kotva: s.id || ''};
    });
  }
  return (pamet[k] = out);
}
function odkaz(it, kotva){ return 'cti.html?c=' + encodeURIComponent(it.path) + (kotva ? '#' + encodeURIComponent(kotva) : ''); }

async function htmlRada(id){
  var d = dily(id); if (!d.length) return '<p class="prazdno">Řada je prázdná. <a href="#">← police</a></p>';
  return '<section class="regal"><a class="zpet" href="#">← všechny police</a><h3>' + esc(d[0].rada.nazev || id) + ' · ' + d.length + '</h3>'
    + (d.length > 1 ? '<p><a class="napric-btn" href="#napric/' + encodeURIComponent(id) + '">⇄ Číst napříč řadou</a></p>' : '<p class="z-pozn">Číst napříč půjde od dvou dílů.</p>')
    + A.seznam(d) + '</section>';
}
async function htmlNapric(id, druh, klic){
  var d = dily(id); if (!d.length) return '<p class="prazdno">Řada je prázdná. <a href="#">← police</a></p>';
  A.hlas('Skládám řadu napříč…');
  var roz = []; for (var i = 0; i < d.length; i++) roz.push(await rozeber(d[i]));
  A.hlas('');
  var nazevRady = esc(d[0].rada.nazev || id), zpet = '<a class="zpet" href="#rada/' + encodeURIComponent(id) + '">← ' + nazevRady + '</a>';
  if (!druh){   // rozcestník: části osnovy a pojmy
    var casti = [], pojmy = {}, sit = {};
    roz.forEach(function(r){ r.poradi.forEach(function(k){ if (casti.indexOf(k) < 0) casti.push(k); });
      Object.keys(r.pojmy).forEach(function(k){ pojmy[k] = pojmy[k] || {nazev: r.pojmy[k].nazev, n: 0}; pojmy[k].n++; });
      Object.keys(r.situace || {}).forEach(function(k){ sit[k] = sit[k] || {nazev: r.situace[k].nazev, n: 0}; sit[k].n++; }); });
    var sk = Object.keys(sit).sort(function(a, b){ return sit[b].n - sit[a].n || sit[a].nazev.localeCompare(sit[b].nazev, 'cs'); });
    var pocet = function(k, co){ return roz.filter(function(r){ return r[co][k]; }).length; };
    var nazevCasti = function(k){ var r = roz.find(function(x){ return x.casti[k]; }); return r ? r.casti[k].nazev : k; };
    var pk = Object.keys(pojmy).sort(function(a, b){ return pojmy[b].n - pojmy[a].n || pojmy[a].nazev.localeCompare(pojmy[b].nazev, 'cs'); });
    return '<section class="regal napric">' + zpet + '<h3>Napříč řadou · ' + d.length + ' dílů</h3>'
      + (casti.length ? '<h4>Po částech</h4><ul class="napric-seznam">' + casti.map(function(k){
          return '<li><a href="#napric/' + encodeURIComponent(id) + '/cast/' + encodeURIComponent(k) + '"><b>' + esc(nazevCasti(k)) + '</b><i>' + pocet(k, 'casti') + '/' + d.length + '</i></a></li>'; }).join('') + '</ul>' : '')
      + (pk.length ? '<h4>Po pojmu</h4><ul class="napric-seznam">' + pk.map(function(k){
          return '<li><a href="#napric/' + encodeURIComponent(id) + '/pojem/' + encodeURIComponent(k) + '"><b>' + esc(pojmy[k].nazev) + '</b><i>' + pojmy[k].n + '/' + d.length + '</i></a></li>'; }).join('') + '</ul>' : '')
      + (sk.length ? '<h4>Po pacientovi a situaci</h4><ul class="napric-seznam">' + sk.map(function(k){
          return '<li><a href="#napric/' + encodeURIComponent(id) + '/situace/' + encodeURIComponent(k) + '"><b>' + esc(sit[k].nazev) + '</b><i>' + sit[k].n + '/' + d.length + '</i></a></li>'; }).join('') + '</ul>' : '')
      + (!casti.length && !pk.length ? '<p class="prazdno">Díly zatím nemají značky osnovy (data-osnova) ani jádra pojmů. Claude je přidá při výrobě podle presetu s osnovou.</p>' : '')
      + '</section>';
  }
  var co = druh === 'cast' ? 'casti' : druh === 'situace' ? 'situace' : 'pojmy', jmeno = '';
  var radky = roz.map(function(r){
    var x = (r[co] || {})[klic]; if (!x) return '';
    jmeno = jmeno || x.nazev;
    return '<li><a href="' + odkaz(r.dil, x.kotva) + '"><b>' + esc(r.dil.title) + '</b><span>' + esc(x.jadro || '(bez jádra – otevři celé)') + '</span><i>celé →</i></a></li>';
  }).join('');
  var chybi = roz.filter(function(r){ return !(r[co] || {})[klic]; }).map(function(r){ return esc(r.dil.title); });
  return '<section class="regal napric"><a class="zpet" href="#napric/' + encodeURIComponent(id) + '">← napříč řadou</a>'
    + '<h3>' + esc(jmeno || klic) + ' · ' + nazevRady + '</h3><ul class="napric-jadra">' + radky + '</ul>'
    + (chybi.length ? '<p class="z-pozn">Chybí u: ' + chybi.join(', ') + '</p>' : '') + '</section>';
}

return {
  init: function(api){ A = api; },
  police: function(){   // regál Řady pod kartičkou z minula
    var r = vsechnyRady(); if (!r.length) return '';
    return '<section class="regal"><h3>Řady</h3><ul>' + r.map(function(x){
      return '<li><a href="#rada/' + encodeURIComponent(x.id) + '"><b>' + esc(x.nazev) + '</b><span>' + (x.n > 1 ? 'číst po dílech i napříč' : 'zatím jeden díl') + '</span><i>' + x.n + ' dílů</i></a></li>';
    }).join('') + '</ul></section>';
  },
  trasa: async function(h){
    var m = h.match(/^#rada\/([^\/]+)$/); if (m) return htmlRada(decodeURIComponent(m[1]));
    m = h.match(/^#napric\/([^\/]+)(?:\/(cast|pojem|situace)\/(.+))?$/);
    if (m) return htmlNapric(decodeURIComponent(m[1]), m[2], m[3] && decodeURIComponent(m[3]));
    return null;
  },
  klik: function(e){
    var a = e.target.closest('a[href^="cti.html"]');
    if (!a) return false;
    e.preventDefault();   // díl musí být v offline paměti – app.js otevri() ho případně stáhne
    var c = new URL(a.href).searchParams.get('c'), it = ((A.katalog() || {}).items || []).find(function(i){ return i.path === c; });
    (it ? A.nactiHtml(it) : Promise.resolve()).then(function(){ location.href = a.getAttribute('href'); });
    return true;
  }
};
})());
