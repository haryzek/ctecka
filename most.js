/* Most čtečky – vkládá ho cti.html do každého otevřeného výrobku (window.CTECKA_CESTA = cesta výrobku).
   1) pamatuje si pozici čtení a značí přečteno, 2) tlačítko ← police,
   3) PŘÁNÍ: označíš text → 🥥 → panel s tlačítky (diagram, hračka, rozšířit…) a polem pro vlastní slova.
      Přání se hromadí v localStorage (ctecka:prani) a do Dropboxu (prani.json) je pošle až ↻ obnovit na polici.
   4) splněná přání: Claude je zapracuje do výrobku a obalí změněný blok data-prani="<id>" data-splneno="RRRR-MM-DD";
      most k němu dá decentní tečkovanou lajnu (14 dní), ťuknutím se ukáže, jaké přání to bylo. */
(function(){
'use strict';
var K = 'ctecka:', P = window.CTECKA_CESTA || '';
function c(k, d){ try { var v = localStorage.getItem(K + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function w(k, v){ try { localStorage.setItem(K + k, JSON.stringify(v)); } catch (e) {} }
function dnes(){ var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(z){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[z]; }); }
function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

// ---- pozice a přečteno ----
var p = c('pozice', {})[P]; if (p) setTimeout(function(){ scrollTo(0, p); }, 150);
var t;
addEventListener('scroll', function(){
  clearTimeout(t); t = setTimeout(function(){ var q = c('pozice', {}); q[P] = Math.round(scrollY); w('pozice', q); }, 400);
  if (scrollY + innerHeight > document.documentElement.scrollHeight - 240){
    var s = c('stav', {}) || {}; s.precteno = s.precteno || {};
    if (!s.precteno[P]){ s.precteno[P] = dnes(); w('stav', s); }
  }
}, {passive: true});

// ---- vzhled mostu: vlastní třídy ctecka-*, nezávislé na stylu výrobku, funguje i v e-ink režimu ----
var css = el('style', null, [
  '.ctecka-ui{--c-paper:#fbf8f1;--c-ink:#1f1c17;--c-ink2:#5f574b;--c-rule:rgba(0,0,0,.18);font:400 15.5px/1.45 system-ui,sans-serif;color:var(--c-ink);-webkit-user-select:none;user-select:none}',
  '@media (prefers-color-scheme:dark){html:not([data-theme=light]) .ctecka-ui{--c-paper:#22201b;--c-ink:#ece6d9;--c-ink2:#b3a994;--c-rule:rgba(255,255,255,.22)}}',
  'html[data-theme=dark] .ctecka-ui{--c-paper:#22201b;--c-ink:#ece6d9;--c-ink2:#b3a994;--c-rule:rgba(255,255,255,.22)}',
  '.ctecka-pill{position:fixed;z-index:2147483000;bottom:calc(12px + env(safe-area-inset-bottom,0px));display:flex;gap:6px;transition:transform .25s ease,opacity .25s ease}',
  '.ctecka-pill a,.ctecka-pill button{font:500 14px system-ui,sans-serif;padding:7px 12px;border-radius:999px;text-decoration:none;color:var(--c-ink);background:var(--c-paper);opacity:.94;border:1px solid var(--c-rule);box-shadow:0 2px 8px rgba(0,0,0,.12);cursor:pointer}',
  '#ctecka-kokos{position:fixed;z-index:2147483001;width:46px;height:46px;border-radius:50%;font-size:24px;line-height:1;padding:0;background:var(--c-paper);border:1.5px solid var(--c-ink2);box-shadow:0 3px 12px rgba(0,0,0,.22);cursor:pointer}',
  '.ctecka-panel{position:fixed;z-index:2147483002;left:0;right:0;bottom:0;max-height:82vh;overflow:auto;background:var(--c-paper);border-top:1px solid var(--c-rule);border-radius:16px 16px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.18);padding:14px max(16px,env(safe-area-inset-left,0px)) calc(14px + env(safe-area-inset-bottom,0px))}',
  '.ctecka-panel .in{max-width:640px;margin:0 auto}',
  '.ctecka-panel h4{margin:0 0 8px;font:600 12px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--c-ink2)}',
  '.ctecka-cit{font-style:italic;font-size:14px;color:var(--c-ink2);border-left:2px solid var(--c-rule);padding-left:10px;margin:0 0 12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
  '.ctecka-cipy{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 10px}',
  '.ctecka-cipy button{font:400 14px system-ui,sans-serif;color:var(--c-ink);background:transparent;border:1px solid var(--c-rule);border-radius:999px;padding:7px 12px;cursor:pointer}',
  '.ctecka-cipy button[aria-pressed=true]{border:2px solid var(--c-ink);padding:6px 11px;font-weight:600}',
  '.ctecka-cipy button[aria-pressed=true]::after{content:" ✓"}',
  '.ctecka-panel textarea{display:block;box-sizing:border-box;width:100%;min-height:64px;font:400 15.5px/1.4 system-ui,sans-serif;color:var(--c-ink);background:transparent;border:1px solid var(--c-rule);border-radius:10px;padding:9px 11px;resize:vertical;-webkit-user-select:text;user-select:text}',
  '.ctecka-akce{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}',
  '.ctecka-akce button{font:500 14px system-ui,sans-serif;border-radius:999px;padding:9px 16px;cursor:pointer;border:1px solid var(--c-rule);background:transparent;color:var(--c-ink)}',
  '.ctecka-akce .hlavni{background:var(--c-ink);color:var(--c-paper);border-color:var(--c-ink)}',
  '.ctecka-akce .hlavni:disabled{opacity:.35;cursor:default}',
  '.ctecka-seznam{list-style:none;margin:0;padding:0}',
  '.ctecka-seznam li{border-top:1px solid var(--c-rule);padding:9px 0;font-size:14px}',
  '.ctecka-seznam li b{font-weight:600}',
  '.ctecka-seznam .cit{display:block;font-style:italic;color:var(--c-ink2);margin-top:2px}',
  '.ctecka-seznam button{float:right;font:400 12px system-ui,sans-serif;border:1px solid var(--c-rule);background:transparent;color:var(--c-ink2);border-radius:999px;padding:3px 9px;margin-left:8px;cursor:pointer}',
  '.ctecka-toast{position:fixed;z-index:2147483003;left:50%;transform:translateX(-50%);bottom:calc(64px + env(safe-area-inset-bottom,0px));background:var(--c-ink);color:var(--c-paper);font:500 14px system-ui,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 3px 12px rgba(0,0,0,.25);max-width:90vw;text-align:center}',
  // lajna splněného přání: tečkovaná, šedá – viditelná i v černobílém režimu, nic jen barvou
  '.ctecka-lajna{position:absolute;left:-13px;top:2px;bottom:2px;width:12px;padding:0;margin:0;border:0;border-left:2px dotted currentColor;opacity:.4;background:transparent;cursor:pointer}',
  '.ctecka-lajna::after{content:"";position:absolute;left:-10px;right:-4px;top:0;bottom:0}'
].join('\n'));
document.head.appendChild(css);

// ---- tlačítko zpět na polici (+ počet přání u výrobku) ----
var pill = el('div', 'ctecka-ui ctecka-pill');
pill.style.left = 'max(10px,env(safe-area-inset-left,0px))';
var zpet = el('a', null, '← police'); zpet.href = './'; zpet.id = 'ctecka-zpet';
zpet.onclick = function(e){ if (document.referrer.indexOf(location.origin + location.pathname.replace(/cti\.html$/, '')) === 0 && history.length > 1){ e.preventDefault(); history.back(); } };
var pocet = el('button', null); pocet.type = 'button'; pocet.hidden = true; pocet.onclick = function(){ seznamPrani(); };
pill.appendChild(zpet);
// přepínač světlý/tmavý: všechny obaly mají tmavé barvy pod data-theme, jen ne všechny vlastní tlačítko
// (učebnice ho má – #themebtn – tak tam druhé nepřidávat). Volba platí pro celou čtečku (volby.tema).
if (!document.getElementById('themebtn')){
  var tema = el('button', null); tema.type = 'button';
  var temaNyni = function(){ return document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); };
  var temaIkona = function(){ tema.textContent = temaNyni() === 'dark' ? '☀' : '☾'; tema.setAttribute('aria-label', temaNyni() === 'dark' ? 'Světlý režim' : 'Tmavý režim'); };
  tema.onclick = function(){
    var nx = temaNyni() === 'dark' ? 'light' : 'dark', v = c('volby', {}) || {};
    document.documentElement.dataset.theme = nx; v.tema = nx; w('volby', v); temaIkona();
  };
  temaIkona(); pill.appendChild(tema);
}
pill.appendChild(pocet); document.body.appendChild(pill);
var y0 = scrollY;
addEventListener('scroll', function(){
  var y = scrollY, s = y > y0 && y > 120;
  pill.style.transform = s ? 'translateY(70px)' : 'none'; pill.style.opacity = s ? '0' : '1'; y0 = y;
}, {passive: true});

// ---- přání ----
var DRUHY = [   // [klíč, štítek]; všechny na očích (Bob chce vidět všechny možnosti – inspirace)
  ['nechapu', '🤷 nechápu, řekni jinak'], ['rozsirit', '🔍 rozšířit'], ['diagram', '📐 diagram'], ['hracka', '🎛 hračka'], ['libi', '❤️ tohle je ono'],
  ['fotka', '📷 fotka'], ['priklad', '🎯 příklad / analogie'], ['overit', '⚠️ ověř, smrdí mi to'], ['skrtni', '✂️ vata, škrtni'],
  ['souvislost', '🕸 souvislost s jiným výrobkem'], ['heslo', '🌱 na tohle celé heslo'], ['myslenka', '✍️ moje myšlenka']
];
var NAZEV = {}; DRUHY.forEach(function(d){ NAZEV[d[0]] = d[1]; });
function prani(){ var x = c('prani', null) || {}; x.items = x.items || {}; return x; }
function mojePrani(){ var x = prani().items; return Object.keys(x).map(function(k){ return x[k]; }).filter(function(i){ return i.cesta === P && i.stav !== 'zruseno'; }); }
function obnovPocet(){
  var m = mojePrani(), ceka = m.filter(function(i){ return i.stav === 'ceka'; }).length, spl = m.length - ceka;
  pocet.hidden = !m.length;
  pocet.textContent = '🥥 ' + (ceka ? ceka + ' čeká' : '') + (ceka && spl ? ' · ' : '') + (spl ? spl + ' splněno' : '');
}
obnovPocet();
function toast(text){
  var e = el('div', 'ctecka-ui ctecka-toast'); e.textContent = text; document.body.appendChild(e);
  e.onclick = function(){ e.remove(); };
  setTimeout(function(){ e.remove(); }, Math.max(2600, text.length * 70));
}

// kotva: citace + kousek okolí + nejbližší nadpis a id – podle toho Claude místo najde ve zdroji výrobku
function textBloku(n){ var b = n.nodeType === 1 ? n : n.parentElement; while (b && b !== document.body && getComputedStyle(b).display === 'inline') b = b.parentElement; return b || document.body; }
function nadpisPred(n){
  var hs = document.querySelectorAll('h1,h2,h3,h4'), nad = '';
  for (var i = 0; i < hs.length; i++){ if (hs[i].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) nad = (hs[i].innerText || hs[i].textContent).trim(); else break; }
  return nad.replace(/\s+/g, ' ').slice(0, 140);
}
function idPred(n){ var e = n.nodeType === 1 ? n : n.parentElement; while (e && e !== document.body){ if (e.id && !/^ctecka-/.test(e.id)) return e.id; e = e.parentElement; } return ''; }
function kotva(sel){
  var r = sel.getRangeAt(0), citace = sel.toString().replace(/\s+/g, ' ').trim();
  var blok = textBloku(r.commonAncestorContainer), cely = (blok.textContent || '').replace(/\s+/g, ' ');
  var i = cely.indexOf(citace);
  return {citace: citace.slice(0, 600), pred: i > 0 ? cely.slice(Math.max(0, i - 60), i).trim() : '',
          po: i >= 0 ? cely.slice(i + citace.length, i + citace.length + 60).trim() : '',
          nadpis: nadpisPred(r.startContainer), id: idPred(r.commonAncestorContainer)};
}

// 🥥 u označeného textu
var kokos = el('button', 'ctecka-ui'); kokos.id = 'ctecka-kokos'; kokos.type = 'button'; kokos.textContent = '🥥';
kokos.setAttribute('aria-label', 'Dát přání k označenému textu'); kokos.hidden = true; document.body.appendChild(kokos);
var posledni = null, panelOtevren = false;
function vUi(n){ var e = n && (n.nodeType === 1 ? n : n.parentElement); return !!(e && e.closest('.ctecka-ui')); }
document.addEventListener('selectionchange', function(){
  if (panelOtevren) return;
  var sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount || vUi(sel.anchorNode)){ setTimeout(function(){ var s = getSelection(); if (!s || s.isCollapsed) kokos.hidden = true; }, 250); return; }
  var text = sel.toString().trim(); if (text.length < 2){ kokos.hidden = true; return; }
  posledni = kotva(sel);
  var rr = sel.getRangeAt(0).getClientRects(), r = rr.length ? rr[rr.length - 1] : sel.getRangeAt(0).getBoundingClientRect();
  // pod konec výběru (nad výběrem bývá systémové menu Kopírovat/Sdílet), držet v okně
  var top = Math.min(innerHeight - 110, r.bottom + 14), left = Math.min(innerWidth - 58, Math.max(10, r.right - 23));
  if (top < r.bottom) top = Math.max(10, r.top - 60);
  kokos.style.top = top + 'px'; kokos.style.left = left + 'px'; kokos.hidden = false;
});
kokos.addEventListener('pointerdown', function(e){ e.preventDefault(); });   // ať ťuknutí nezruší výběr dřív, než se uloží
kokos.addEventListener('click', function(){ if (posledni) otevriPanel(posledni); });

var panel = null;
function zavriPanel(){ if (panel){ panel.remove(); panel = null; } panelOtevren = false; kokos.hidden = true; if (visualViewport) visualViewport.removeEventListener('resize', nadKlavesnici); }
function nadKlavesnici(){ if (panel && visualViewport) panel.style.bottom = Math.max(0, innerHeight - visualViewport.height - visualViewport.offsetTop) + 'px'; }
function otevriPanel(k){
  zavriPanel(); panelOtevren = true; kokos.hidden = true;
  try { getSelection().removeAllRanges(); } catch (e) {}
  panel = el('div', 'ctecka-ui ctecka-panel');
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Přání k označenému místu');
  var tl = DRUHY.map(function(d){ return '<button type="button" data-d="' + d[0] + '" aria-pressed="false">' + d[1] + '</button>'; }).join('');
  panel.innerHTML = '<div class="in"><h4>🥥 Přání</h4><p class="ctecka-cit">„' + esc(k.citace) + '“</p>'
    + '<div class="ctecka-cipy">' + tl + '</div>'
    + '<textarea placeholder="Vlastními slovy (nebo jen ťukni na tlačítko)…" aria-label="Přání vlastními slovy"></textarea>'
    + '<div class="ctecka-akce"><button type="button" class="zrus">Zrušit</button><button type="button" class="hlavni" disabled>Dát přání</button></div></div>';
  document.body.appendChild(panel);
  var ta = panel.querySelector('textarea'), ok = panel.querySelector('.hlavni');
  function stavOk(){ ok.disabled = !panel.querySelector('[aria-pressed=true]') && !ta.value.trim(); }
  panel.querySelector('.ctecka-cipy').addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); stavOk();
  });
  ta.addEventListener('input', stavOk);
  panel.querySelector('.zrus').onclick = zavriPanel;
  ok.onclick = function(){
    var druhy = [].map.call(panel.querySelectorAll('[aria-pressed=true]'), function(b){ return b.dataset.d; });
    var x = prani(), id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    x.items[id] = {id: id, cesta: P, titul: document.title, kdy: new Date().toISOString(), druhy: druhy, text: ta.value.trim(),
      citace: k.citace, pred: k.pred, po: k.po, nadpis: k.nadpis, kotva: k.id, stav: 'ceka', zmeneno: Date.now()};
    w('prani', x); zavriPanel(); obnovPocet();
    toast('Přání uloženo 🥥 Odjede při ↻ obnovit na polici.');
  };
  if (visualViewport){ visualViewport.addEventListener('resize', nadKlavesnici); nadKlavesnici(); }
}
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && panel) zavriPanel(); });

// seznam přání u tohohle výrobku (ťuknutí na 🥥 u ← police)
function seznamPrani(){
  zavriPanel(); panelOtevren = true;
  var m = mojePrani().sort(function(a, b){ return String(b.kdy).localeCompare(String(a.kdy)); });
  panel = el('div', 'ctecka-ui ctecka-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Přání u tohoto výrobku');
  panel.innerHTML = '<div class="in"><h4>🥥 Přání u tohohle výrobku</h4><ul class="ctecka-seznam">' + m.map(function(i){
    var co = i.druhy.map(function(d){ return NAZEV[d] || d; }).join(', ') + (i.text ? (i.druhy.length ? ' – ' : '') + i.text : '');
    var st = i.stav === 'splneno' ? '✓ splněno ' + (i.splneno || '') + (i.odpoved ? ': ' + i.odpoved : '') : 'čeká';
    return '<li>' + (i.stav === 'ceka' ? '<button type="button" data-zrus="' + esc(i.id) + '">zrušit</button>' : '')
      + '<b>' + esc(co) + '</b> · ' + esc(st) + '<span class="cit">„' + esc(i.citace.slice(0, 160)) + '“</span></li>';
  }).join('') + '</ul><div class="ctecka-akce"><button type="button" class="zrus">Zavřít</button></div></div>';
  document.body.appendChild(panel);
  panel.querySelector('.zrus').onclick = zavriPanel;
  panel.querySelector('.ctecka-seznam').addEventListener('click', function(e){
    var b = e.target.closest('[data-zrus]'); if (!b) return;
    var x = prani(), i = x.items[b.dataset.zrus]; if (!i) return;
    i.stav = 'zruseno'; i.zmeneno = Date.now(); w('prani', x); obnovPocet(); seznamPrani();
  });
}

// ---- lajny u splněných přání (14 dní od splnění) ----
function dniOd(iso){ var d = new Date(iso + 'T12:00:00'); return isNaN(d) ? 999 : (Date.now() - d) / 864e5; }
document.querySelectorAll('[data-prani][data-splneno]').forEach(function(b){
  if (dniOd(b.dataset.splneno) > 14) return;
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  var l = el('button', 'ctecka-ui ctecka-lajna'); l.type = 'button'; l.setAttribute('aria-label', 'Tohle místo se měnilo podle tvého přání');
  l.onclick = function(e){
    e.stopPropagation();
    var x = prani().items, ids = b.dataset.prani.split(/[\s,]+/);
    var texty = ids.map(function(id){ var i = x[id]; if (!i) return '';
      return (i.druhy || []).map(function(d){ return NAZEV[d] || d; }).join(', ') + (i.text ? ' – ' + i.text : '') + (i.odpoved ? '\n→ ' + i.odpoved : ''); }).filter(Boolean);
    toast('Splněné přání ' + b.dataset.splneno + (texty.length ? ': ' + texty.join(' · ') : ''));
  };
  b.insertBefore(l, b.firstChild);
});
})();
