/* Čtečka – ＋ zadání: Bob naklikne nový výrobek (rychlá volba presetu + doladění šoupátky), čtečka
   ho uloží do ctecka:zadani a ↻ obnovit ho pošle do zadani.json v Dropboxu. Claude ho vyřídí
   (nastroje/zadani/zadani.py, skill zadani.md) a zapisuje zpět stav: otazka → Bob odpoví tady,
   pracuji, hotovo (+ cesta výrobku). Parametry a vestavěné presety jsou v presety.json (z textbooku,
   nastroje/zadani/presety.json); Bobovy vlastní presety v ctecka:presety-bob ↔ presety-bob.json.
   Trasy: #zadani (formulář), #zadani/<id> (detail, odpovědi na otázky). Na domově fronta zadání. */
(window.CTECKA_MODULY = window.CTECKA_MODULY || []).push((function(){
'use strict';
var A, form = null;   // A = API čtečky (app.js), form = rozdělaný formulář (přežije překreslení)
function esc(s){ return A.esc(s); }
function ted(){ return Date.now(); }
function slug(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }
function kopie(o){ return JSON.parse(JSON.stringify(o || {})); }
function schranka(k){ var x = A.cti(k, null) || {}; x.items = x.items || {}; return x; }
function spec(){ return A.cti('presety', null); }
function presety(){
  var vest = (spec() || {}).presety || [], bob = schranka('presety-bob').items;
  return vest.concat(Object.keys(bob).map(function(k){ return bob[k]; }).filter(function(p){ return !p.smazano; })
    .sort(function(a, b){ return String(a.nazev).localeCompare(String(b.nazev), 'cs'); }));
}
function preset(id){ return presety().find(function(p){ return p.id === id; }); }
function zadani(){ var x = schranka('zadani').items; return Object.keys(x).map(function(k){ return x[k]; }); }
function uloz(z){ var x = schranka('zadani'); z.zmeneno = ted(); x.items[z.id] = z; A.pis('zadani', x); }
function rady(){   // řady z katalogu (vydané díly) + z rozdělaných zadání
  var m = {};
  ((A.katalog() || {}).items || []).forEach(function(i){ if (i.rada && i.rada.id) m[i.rada.id] = m[i.rada.id] || {id: i.rada.id, nazev: i.rada.nazev || i.rada.id, n: 0}, m[i.rada.id].n++; });
  zadani().forEach(function(z){ if (z.rada && z.rada.id && !m[z.rada.id]) m[z.rada.id] = {id: z.rada.id, nazev: z.rada.nazev, n: 0}; });
  return Object.keys(m).map(function(k){ return m[k]; });
}

// ---- formulář ----
function novyForm(){ return {tema: '', proc: '', preset: '', definice: {}, zdroje_text: '', rada: null, novaRada: '', poradi: ''}; }
function zvolPreset(id){
  form.preset = id;
  var p = preset(id); form.definice = p ? kopie(p.definice) : {};
}
function seg(klic, nazev, moznosti, hodnota){
  return '<div class="z-param"><span class="z-nazev">' + esc(nazev) + '</span><div class="z-seg" data-param="' + klic + '">'
    + [['', 'auto']].concat(moznosti).map(function(m){
      return '<button type="button" data-hodnota="' + esc(m[0]) + '" aria-pressed="' + ((hodnota || '') === m[0]) + '">' + esc(m[1]) + '</button>';
    }).join('') + '</div></div>';
}
function slider(cesta, nazev, hodnota, maly){
  var auto = hodnota == null;
  return '<div class="z-slider' + (maly ? ' maly' : '') + (auto ? ' auto' : '') + '"><span class="z-nazev">' + esc(nazev) + '</span>'
    + '<input type="range" min="0" max="100" step="10" value="' + (auto ? 50 : hodnota) + '" data-slider="' + cesta + '" aria-label="' + esc(nazev) + '">'
    + '<output>' + (auto ? 'auto' : hodnota + ' %') + '</output>'
    + '<button type="button" class="z-reset" data-reset="' + cesta + '"' + (auto ? ' hidden' : '') + ' aria-label="' + esc(nazev) + ' na auto">↺</button></div>';
}
function htmlFormulare(){
  var S = spec(), d = form.definice, pr = d.prvky || {}, det = pr.detail || {}, ap = d.aparat || {};
  if (!S) return '<section class="zad"><a class="zpet" href="#">← police</a><h2>Nové zadání</h2><p class="prazdno">Čtečka ještě nezná presety. Dej ↻ obnovit (Claude je vydává s knihovnou).</p></section>';
  var dl = '<button type="button" class="dl" data-preset="" aria-pressed="' + (form.preset === '') + '"><b>✨</b><span>nech na Claudovi</span></button>'
    + presety().map(function(p){ return '<button type="button" class="dl" data-preset="' + esc(p.id) + '" aria-pressed="' + (form.preset === p.id) + '" title="' + esc(p.popis || '') + '"><b>' + esc(p.ikona || '⭐') + '</b><span>' + esc(p.nazev) + '</span></button>'; }).join('');
  var r = d.rozsah || {};
  var rozsah = '<div class="z-param"><span class="z-nazev">Rozsah</span><div class="z-rozsah"><input type="number" min="1" inputmode="numeric" id="z-rozsah-n" placeholder="auto" value="' + (r.hodnota || '') + '">'
    + '<select id="z-rozsah-j"><option value="">—</option>' + S.rozsah.map(function(j){ return '<option value="' + j[0] + '"' + (r.jednotka === j[0] ? ' selected' : '') + '>' + esc(j[1]) + '</option>'; }).join('') + '</select></div></div>';
  var params = S.parametry.map(function(p){ return seg(p.klic, p.nazev, p.moznosti, d[p.klic]); }).join('');
  var prvky = S.prvky.map(function(g){
    return '<div class="z-skupina">' + slider('prvky.' + g.skupina, g.nazev, pr[g.skupina])
      + '<details><summary>jednotlivě</summary>' + g.prvky.map(function(x){ return slider('detail.' + x[0], x[1], det[x[0]], true); }).join('') + '</details></div>';
  }).join('');
  var aparat = '<div class="z-cipy">' + S.aparat.map(function(x){
    var v = ap[x[0]]; return '<button type="button" data-aparat="' + x[0] + '" data-stav="' + (v === true ? 'ano' : v === false ? 'ne' : 'auto') + '">' + esc(x[1]) + '</button>';
  }).join('') + '</div>';
  var osnova = (d.osnova || []).map(function(c){ return c.nazev + (c.zadani ? ': ' + c.zadani : ''); }).join('\n');
  var radyOpt = '<option value="">žádná</option>' + rady().map(function(x){ return '<option value="' + esc(x.id) + '"' + (form.rada && form.rada.id === x.id ? ' selected' : '') + '>' + esc(x.nazev) + (x.n ? ' (' + x.n + ')' : '') + '</option>'; }).join('')
    + '<option value="+"' + (form.rada === '+' ? ' selected' : '') + '>＋ nová řada…</option>';
  return '<section class="zad"><a class="zpet" href="#">← police</a><h2>Nové zadání</h2>'
    + '<label class="z-pole"><span>Téma</span><textarea id="z-tema" rows="2" placeholder="O čem? Stačí jedno slovo, klidně nápad z ulice.">' + esc(form.tema) + '</textarea></label>'
    + '<label class="z-pole"><span>Co mě na tom chytlo <i>(nepovinné, podle toho volím úhel)</i></span><textarea id="z-proc" rows="2">' + esc(form.proc) + '</textarea></label>'
    + '<h3>Rychlá volba</h3><div class="z-dlazdice">' + dl + '</div>'
    + '<details class="z-doladit"' + (form.otevreno ? ' open' : '') + '><summary>Doladit <i>(co nenastavíš, nechám na sobě)</i></summary>'
    + rozsah + params
    + '<h4>Prvky <i>(kolik čeho; auto = podle mě)</i></h4>' + prvky
    + '<h4>Aparát <i>(ťukáním auto → ano → ne)</i></h4>' + aparat
    + '<h4>Osnova <i>(stejné části u každého dílu řady; jedna na řádek, „Název: co v ní“)</i></h4>'
    + '<textarea id="z-osnova" rows="4" placeholder="Biografie: stručně, s dobou&#10;Hlavní otázka: co mu krouží hlavou&#10;Kazuistiky: 5 rozhovorů terapeuta s klientem">' + esc(osnova) + '</textarea>'
    + '<div class="z-preset-uloz"><input id="z-preset-nazev" placeholder="název presetu, např. Psychoanalytik"><button type="button" id="z-preset-uloz">Uložit jako preset</button></div>'
    + '</details>'
    + '<label class="z-pole"><span>Zdroje <i>(nepovinné: kniha v inboxu, projekt, moje poznámky o…)</i></span><textarea id="z-zdroje" rows="2">' + esc(form.zdroje_text) + '</textarea></label>'
    + '<h3>Řada</h3><div class="z-rada"><select id="z-rada">' + radyOpt + '</select>'
    + '<input id="z-rada-nova" placeholder="název nové řady"' + (form.rada === '+' ? '' : ' hidden') + ' value="' + esc(form.novaRada) + '">'
    + '<input id="z-poradi" type="number" min="1" inputmode="numeric" placeholder="pořadí" value="' + esc(form.poradi) + '"' + (form.rada ? '' : ' hidden') + '></div>'
    + '<div class="z-akce"><button type="button" class="hlavni" id="z-odeslat">Odeslat zadání</button></div>'
    + '<p class="z-pozn">Odjede při ↻ obnovit, stejně jako přání. Pak mi u počítače řekni „vyřiď zadání“.</p></section>';
}
function nastavCestu(cesta, hodnota){   // 'prvky.text' | 'detail.hracka'
  var d = form.definice, c = cesta.split('.');
  d.prvky = d.prvky || {};
  var cil = c[0] === 'detail' ? (d.prvky.detail = d.prvky.detail || {}) : d.prvky;
  if (hodnota == null) delete cil[c[1]]; else cil[c[1]] = hodnota;
}
function naplnTexty(){   // texty z formuláře do stavu (před překreslením a odesláním)
  var $ = A.$, d = form.definice;
  if (!$('z-tema')) return;
  form.tema = $('z-tema').value; form.proc = $('z-proc').value; form.zdroje_text = $('z-zdroje').value;
  form.otevreno = document.querySelector('.z-doladit').open;
  var n = parseInt($('z-rozsah-n').value, 10), j = $('z-rozsah-j').value;
  if (n || j){ d.rozsah = {}; if (j) d.rozsah.jednotka = j; if (n) d.rozsah.hodnota = n; } else delete d.rozsah;
  var os = $('z-osnova').value.split('\n').map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){
    var i = l.indexOf(':'); var nazev = (i > 0 ? l.slice(0, i) : l).trim();
    return {klic: slug(nazev), nazev: nazev, zadani: i > 0 ? l.slice(i + 1).trim() : ''};
  });
  if (os.length) d.osnova = os; else delete d.osnova;
  var rv = $('z-rada').value;
  form.rada = rv === '+' ? '+' : rv ? (rady().find(function(x){ return x.id === rv; }) || null) : null;
  form.novaRada = $('z-rada-nova').value; form.poradi = $('z-poradi').value;
}
function prekresli(bezCteni){ if (!bezCteni) naplnTexty(); A.$('obsah').innerHTML = htmlFormulare(); }
function klikFormular(e){
  var t = e.target, b;
  // preset přepíše definici – DOM se už nečte (měl by starý rozsah a osnovu)
  if ((b = t.closest('[data-preset]'))){ naplnTexty(); zvolPreset(b.dataset.preset); prekresli(true); return true; }
  if ((b = t.closest('.z-seg button'))){
    var p = b.parentElement.dataset.param, h = b.dataset.hodnota;
    if (h) form.definice[p] = h; else delete form.definice[p];
    b.parentElement.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', x === b); });
    return true;
  }
  if ((b = t.closest('[data-reset]'))){ nastavCestu(b.dataset.reset, null); prekresli(); return true; }
  if ((b = t.closest('[data-aparat]'))){
    var dalsi = {auto: 'ano', ano: 'ne', ne: 'auto'}[b.dataset.stav], ap = form.definice.aparat = form.definice.aparat || {};
    if (dalsi === 'auto') delete ap[b.dataset.aparat]; else ap[b.dataset.aparat] = dalsi === 'ano';
    b.dataset.stav = dalsi; return true;
  }
  if (t.id === 'z-preset-uloz'){
    naplnTexty();
    var nazev = A.$('z-preset-nazev').value.trim(); if (!nazev){ A.$('z-preset-nazev').focus(); return true; }
    var zaklad = preset(form.preset), x = schranka('presety-bob'), id = 'bob-' + slug(nazev);
    x.items[id] = {id: id, nazev: nazev, ikona: '⭐', typ: zaklad ? zaklad.typ : '', popis: 'tvůj preset', definice: kopie(form.definice), zmeneno: ted()};
    A.pis('presety-bob', x); form.preset = id; prekresli(); A.hlas('Preset „' + nazev + '“ uložen – odjede při ↻ obnovit.');
    return true;
  }
  if (t.id === 'z-odeslat'){
    naplnTexty();
    if (!form.tema.trim()){ A.$('z-tema').focus(); A.hlas('Napiš aspoň téma.'); return true; }
    var rada = null;
    if (form.rada === '+' && form.novaRada.trim()) rada = {id: slug(form.novaRada), nazev: form.novaRada.trim()};
    else if (form.rada && form.rada !== '+') rada = {id: form.rada.id, nazev: form.rada.nazev};
    if (rada && form.poradi) rada.poradi = parseInt(form.poradi, 10);
    var pz = preset(form.preset), id = ted().toString(36) + Math.random().toString(36).slice(2, 5);
    uloz({id: id, kdy: new Date().toISOString(), tema: form.tema.trim(), proc: form.proc.trim(), preset: form.preset,
      preset_nazev: pz ? pz.nazev : '', typ: pz ? pz.typ : '', definice: kopie(form.definice), zdroje_text: form.zdroje_text.trim(),
      rada: rada, stav: 'ceka'});
    form = null; location.hash = ''; A.hlas('Zadání uloženo 📝 Odjede při ↻ obnovit.');
    return true;
  }
  return false;
}
function zmenaFormular(e){
  var t = e.target;
  if (t.dataset && t.dataset.slider){
    var v = parseInt(t.value, 10), row = t.closest('.z-slider');
    nastavCestu(t.dataset.slider, v); row.classList.remove('auto');
    row.querySelector('output').textContent = v + ' %'; row.querySelector('.z-reset').hidden = false;
  } else if (t.id === 'z-rada'){
    A.$('z-rada-nova').hidden = t.value !== '+'; A.$('z-poradi').hidden = !t.value;
    if (t.value === '+') A.$('z-rada-nova').focus();
  }
}

// ---- detail zadání: stav, otázky od Clauda ----
var STAV = {ceka: '⏳ čeká na Clauda', otazka: '❓ Claude se ptá', pracuji: '🔨 Claude na tom dělá', hotovo: '✓ hotovo', zruseno: 'zrušeno'};
function htmlDetail(z){
  var ot = (z.otazky || []).map(function(o){
    return '<div class="z-otazka" data-otazka="' + esc(o.id) + '"><p>' + esc(o.text) + '</p>'
      + (o.moznosti && o.moznosti.length ? '<div class="z-cipy">' + o.moznosti.map(function(m){ return '<button type="button" data-odpoved="' + esc(m) + '" aria-pressed="' + (o.odpoved === m) + '">' + esc(m) + '</button>'; }).join('') + '</div>' : '')
      + '<textarea rows="2" placeholder="vlastními slovy">' + esc(o.odpoved && (!o.moznosti || o.moznosti.indexOf(o.odpoved) < 0) ? o.odpoved : '') + '</textarea></div>';
  }).join('');
  return '<section class="zad"><a class="zpet" href="#">← police</a><h2>' + esc(z.tema) + '</h2>'
    + '<p class="z-stav">' + esc(STAV[z.stav] || z.stav) + (z.preset_nazev ? ' · ' + esc(z.preset_nazev) : '') + (z.rada ? ' · řada ' + esc(z.rada.nazev) + (z.rada.poradi ? ' #' + z.rada.poradi : '') : '') + '</p>'
    + (z.zprava ? '<p class="z-zprava">🥥 ' + esc(z.zprava) + '</p>' : '')
    + (ot ? '<h3>Otázky</h3>' + ot + '<div class="z-akce"><button type="button" class="hlavni" data-zad-odpovez="' + esc(z.id) + '">Odpovědět</button></div>' : '')
    + (z.stav === 'hotovo' && z.vysledek ? '<div class="z-akce"><button type="button" class="hlavni" data-cesta="' + esc(z.vysledek.path) + '">Otevřít: ' + esc(z.vysledek.title || z.tema) + '</button></div>' : '')
    + '<div class="z-akce">' + (z.stav === 'ceka' || z.stav === 'otazka' ? '<button type="button" data-zad-zrus="' + esc(z.id) + '">Zrušit zadání</button>' : '')
    + (z.stav === 'hotovo' || z.stav === 'zruseno' ? '<button type="button" data-zad-skryj="' + esc(z.id) + '">Skrýt z fronty</button>' : '') + '</div></section>';
}

// ---- modul ----
return {
  init: function(api){
    A = api;
    A.$('b-zadani').addEventListener('click', function(){ form = form || novyForm(); location.hash = '#zadani'; });
    A.$('obsah').addEventListener('input', function(e){ if (location.hash === '#zadani') zmenaFormular(e); });
    A.$('obsah').addEventListener('change', function(e){ if (location.hash === '#zadani') zmenaFormular(e); });
  },
  trasa: function(h){
    if (h === '#zadani'){ form = form || novyForm(); return htmlFormulare(); }
    var m = h.match(/^#zadani\/(.+)$/);
    if (m){ var z = schranka('zadani').items[decodeURIComponent(m[1])]; return z ? htmlDetail(z) : '<p class="prazdno">Zadání nenalezeno. <a href="#">← police</a></p>'; }
    return null;
  },
  domov: function(){   // fronta zadání nad policemi
    var f = zadani().filter(function(z){ return !z.skryto && z.stav !== 'zruseno'; })
      .sort(function(a, b){ return String(b.kdy).localeCompare(String(a.kdy)); });
    if (!f.length) return '';
    return '<section class="regal fronta"><h3>Zadání · ' + f.length + '</h3><ul>' + f.map(function(z){
      return '<li><a href="#zadani/' + encodeURIComponent(z.id) + '"><b>' + esc(z.tema) + '</b><span>' + esc(STAV[z.stav] || z.stav)
        + (z.preset_nazev ? ' · ' + esc(z.preset_nazev) : '') + '</span><i>' + esc(String(z.kdy).slice(0, 10)) + '</i></a></li>';
    }).join('') + '</ul></section>';
  },
  klik: function(e){
    if (location.hash === '#zadani') return klikFormular(e);
    var t = e.target, b, x = schranka('zadani');
    if ((b = t.closest('[data-odpoved]'))){
      b.parentElement.querySelectorAll('button').forEach(function(y){ y.setAttribute('aria-pressed', y === b); }); return true;
    }
    if ((b = t.closest('[data-zad-odpovez]'))){
      var z = x.items[b.dataset.zadOdpovez];
      document.querySelectorAll('.z-otazka').forEach(function(el){
        var o = (z.otazky || []).find(function(q){ return q.id === el.dataset.otazka; }); if (!o) return;
        var vybr = el.querySelector('[aria-pressed=true]'), txt = el.querySelector('textarea').value.trim();
        o.odpoved = txt || (vybr ? vybr.dataset.odpoved : o.odpoved || '');
      });
      z.stav = 'ceka'; z.odpovezeno = true; uloz(z); location.hash = ''; A.hlas('Odpověď uložena – odjede při ↻ obnovit.'); return true;
    }
    if ((b = t.closest('[data-zad-zrus]'))){ var zz = x.items[b.dataset.zadZrus]; if (confirm('Zrušit zadání „' + zz.tema + '“?')){ zz.stav = 'zruseno'; uloz(zz); location.hash = ''; } return true; }
    if ((b = t.closest('[data-zad-skryj]'))){ var zs = x.items[b.dataset.zadSkryj]; zs.skryto = true; uloz(zs); location.hash = ''; return true; }
    return false;
  }
};
})());
