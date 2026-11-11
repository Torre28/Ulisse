"use strict";
/* ======================================================================
   ULISSE · core: utilità, rete, voce, stato, aree, registro
   ====================================================================== */

/* ---------------- utilità DOM e testo ---------------- */
// replaceChildren/append ignorano null e false (altrimenti stamperebbero «null»)
for (const m of ['replaceChildren', 'append']) {
  const orig = Element.prototype[m];
  Element.prototype[m] = function (...k) { return orig.apply(this, k.flat(Infinity).filter(x => x !== null && x !== undefined && x !== false)); };
}
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const stripTags = s => { const d = document.createElement('div'); d.innerHTML = s || ''; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
function seeded(str) { let x = 0; for (const c of str) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function fmtDate(s) { try { const d = new Date(s); if (isNaN(d)) return ''; return d.toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
function fmtDay(s) { try { const d = new Date(s); if (isNaN(d)) return ''; return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } }
function md(src) { // markdown minimo: paragrafi, elenchi "- ", **grassetto**, *corsivo*
  const inl = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  return String(src || '').split(/\n\s*\n/).map(b => {
    const lines = b.split('\n').filter(l => l.trim());
    if (lines.length && lines.every(l => /^\s*[-•]\s+/.test(l))) return '<ul>' + lines.map(l => '<li>' + inl(l.replace(/^\s*[-•]\s+/, '')) + '</li>').join('') + '</ul>';
    return '<p>' + inl(b).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}
const STOP = new Set('alla alle allo agli dalla dalle dallo dagli della delle dello degli nella nelle nello negli sulla sulle sullo sugli come cosa sono dopo prima anche ancora oggi ieri domani questo questa questi queste quello quella quelli quelle molto tutti tutte tutto ogni loro dove quando perché perche sempre senza contro mentre però pero quindi infatti essere stato stata stati state viene vengono fatto fare fanno ecco ovvero secondo verso circa sotto sopra presso tra fra per con una uno gli dei del dal nel sul che chi non più piu già gia sua suo sue suoi nuovo nuova nuovi nuove anni anno mesi mese giorni giorno ore video foto news live ultime ultim ultima'.split(' '));
function keywords(text, n = 6) {
  const words = String(text || '').replace(/[«»"“”:,.;!?()\[\]'’\-–—|/]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) { const l = w.toLowerCase(); if (l.length < 4 || STOP.has(l) || /^\d+$/.test(l)) continue; if (!out.some(o => o.toLowerCase() === l)) out.push(w); }
  // nomi propri prima: hanno più valore per la ricerca
  out.sort((a, b) => (/^[A-ZÀ-Ý]/.test(b) ? 1 : 0) - (/^[A-ZÀ-Ý]/.test(a) ? 1 : 0));
  return out.slice(0, n);
}

/* ---------------- interfaccia: avvisi, fogli, copia ---------------- */
function toast(msg, ms = 2600) { const t = h('div', { class: 'toast', role: 'status' }, msg); document.body.append(t); setTimeout(() => t.remove(), ms); }
async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Copiato'); return true; }
  catch (e) {
    const ta = h('textarea', { readonly: true, style: { minHeight: '200px' } }); ta.value = txt;
    openSheet('Copia il testo', h('div', { class: 'card' }, h('p', { class: 'small muted' }, 'La copia automatica non è disponibile: tieni premuto e copia.'), ta));
    setTimeout(() => { ta.focus(); ta.select(); }, 50);
    return false;
  }
}
/* fogli impilati: aprire un approfondimento da una lezione non la chiude, «‹» torna indietro.
   Anche il gesto «indietro» di Android chiude solo il foglio in cima. */
const SHEETS = [];
function closeTop() {
  const top = SHEETS.pop(); if (!top) return false;
  top.bg.remove(); stopSpeak(); top.onClose && top.onClose();
  const prev = SHEETS[SHEETS.length - 1]; if (prev) prev.bg.style.display = '';
  return true;
}
function closeAllSheets() { while (SHEETS.length) { const t = SHEETS.pop(); t.bg.remove(); } stopSpeak(); }
window.addEventListener('popstate', () => { if (SHEETS.length) closeTop(); });
function openSheet(title, content, onClose) {
  const bg = h('div', { class: 'sheet-bg' });
  const entry = { bg, onClose };
  const close = () => { const i = SHEETS.indexOf(entry); if (i < 0) return; if (i === SHEETS.length - 1) closeTop(); else { SHEETS.splice(i, 1); bg.remove(); onClose && onClose(); } };
  const back = SHEETS.length ? h('button', { class: 'iconbtn', 'aria-label': 'Indietro', onclick: close }, '‹') : null;
  const sh = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('div', { class: 'row', style: { flexWrap: 'nowrap', minWidth: 0 } }, back, h('h2', null, title)),
      h('button', { class: 'iconbtn', 'aria-label': back ? 'Chiudi tutto' : 'Chiudi', onclick: () => { if (back) { closeAllSheets(); typeof render === 'function' && render(); } else close(); } }, '✕')),
    content);
  bg.append(sh);
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  const prev = SHEETS[SHEETS.length - 1]; if (prev) prev.bg.style.display = 'none';
  SHEETS.push(entry);
  try { history.pushState({ sheet: SHEETS.length }, ''); } catch (e) { }
  document.body.append(bg);
  return close;
}
const pad = (...k) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, ...k);

/* ---------------- rete: timeout e proxy pubblici di riserva ---------------- */
async function fetchT(url, opt = {}, ms = 12000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, Object.assign({ signal: ac.signal }, opt)); } finally { clearTimeout(t); }
}
async function getJSON(url, ms) { const r = await fetchT(url, {}, ms); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
const PROXIES = [
  u => u,
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(u)
];
let proxyOrder = [0, 1, 2, 3];
async function fetchText(url) {
  let lastErr;
  for (const i of proxyOrder) {
    try {
      const r = await fetchT(PROXIES[i](url), {}, 10000);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const t = await r.text();
      if (t.length < 80) throw new Error('vuoto');
      if (i !== proxyOrder[0]) proxyOrder = [i, ...proxyOrder.filter(x => x !== i)]; // ricorda quello che funziona
      return t;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('rete');
}

/* ---------------- voce (sintesi vocale del browser) ---------------- */
let voiceIt = null;
function pickVoice() { try { const v = speechSynthesis.getVoices(); voiceIt = v.find(x => /it[-_]IT/i.test(x.lang)) || v.find(x => /^it/i.test(x.lang)) || null; } catch (e) { } }
try { speechSynthesis.onvoiceschanged = pickVoice; pickVoice(); } catch (e) { }
function speak(text, onend) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/\*/g, '')); u.lang = 'it-IT'; if (voiceIt) u.voice = voiceIt; u.rate = 1.02;
    if (onend) u.onend = onend;
    speechSynthesis.speak(u); return true;
  } catch (e) { toast('Voce non disponibile su questo dispositivo'); return false; }
}
function stopSpeak() { try { speechSynthesis.cancel(); } catch (e) { } }

/* ---------------- stato persistente ---------------- */
const KEY = 'ulisse.v1';
function defaults() {
  return {
    v: 3, name: '', onboarded: false, level: 2, mode: 'orizzontale',
    ai: { provider: 'locale', key: '', model: '', localModel: '' },
    feeds: DEFAULT_FEEDS.map(f => Object.assign({}, f)),
    niche: [], temi: ['Spazio e astronomia', 'Elettronica e semiconduttori', 'Firenze'],
    techKw: ['MMIC 60 GHz', 'reconfigurable intelligent surface active', 'negative resistance amplifier'],
    podcasts: DEFAULT_PODCASTS.map(p => Object.assign({}, p)),
    interests: {}, explored: {}, favs: [], catalog: {}, series: {}, cont: [],
    log: [], quests: [], cards: [], journal: [], lessons: {}, progress: {}, lastLesson: null
  };
}
function load() {
  try {
    let r = localStorage.getItem(KEY);
    if (!r) r = localStorage.getItem('bussola.v1'); // dati della prima versione
    if (r) {
      const d = JSON.parse(r), base = defaults();
      const S2 = Object.assign(base, d);
      S2.ai = Object.assign(defaults().ai, d.ai || {});
      if (!d.v || d.v < 2) { S2.feeds = DEFAULT_FEEDS.map(f => Object.assign({}, f)); }
      if (!d.temi) { S2.temi = defaults().temi; if (JSON.stringify(d.niche) === JSON.stringify(['semiconduttori', 'spazio', 'Firenze'])) S2.niche = []; }
      if (!d.v || d.v < 3) { if (S2.ai.provider !== 'gemini' || !S2.ai.key) S2.ai.provider = 'locale'; if (d.name || (d.log || []).length) S2.onboarded = true; S2.v = 3; }
      return S2;
    }
  } catch (e) { }
  return defaults();
}
let S;
let storageOk = true;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; toast('Memoria del telefono piena: elimina qualche lezione dal Quaderno'); } }

/* ---------------- aree, registro, equilibrio ---------------- */
const AREAS = {
  lavoro: { n: 'Studio e lavoro' }, fede: { n: 'Fede' }, famiglia: { n: 'Famiglia' }, amici: { n: 'Amici' },
  corpo: { n: 'Corpo' }, mondo: { n: 'Mondo' }, scoperta: { n: 'Scoperta' }
};
const areaColor = a => `var(--${AREAS[a] ? a : 'scoperta'})`;
const areaTag = a => h('span', { class: 'tag', style: { color: areaColor(a) } }, (AREAS[a] || AREAS.scoperta).n);
function addLog(area, kind, title, w = 1, th) { S.log.push({ d: today(), t: Date.now(), area, kind, title, w, th }); if (S.log.length > 3000) S.log = S.log.slice(-3000); save(); }
function balance(days = 14) {
  const from = daysAgo(days - 1), out = {}; for (const a in AREAS) out[a] = 0;
  for (const e of S.log) if (e.d >= from && out[e.area] !== undefined) out[e.area] += e.w || 1;
  for (const a in out) out[a] = Math.round(out[a] * 10) / 10;
  return out;
}
function bumpInterest(keys, d) { for (const k of keys || []) { S.interests[k] = (S.interests[k] || 0) + d; } save(); }

/* ---------------- «Da continuare» ---------------- */
// tipi: lesson (id), topic (id), paper (titolo + abstract), episode (audio)
function contAdd(item) {
  S.cont = S.cont.filter(c => !(c.type === item.type && c.id === item.id));
  S.cont.unshift(Object.assign({ t: Date.now() }, item));
  S.cont = S.cont.slice(0, 40); save();
}
function contDone(type, id) { const n = S.cont.length; S.cont = S.cont.filter(c => !(c.type === type && c.id === id)); if (S.cont.length !== n) save(); }
