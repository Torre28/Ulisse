"use strict";
/* ======================================================================
   ULISSE · motore delle lezioni interattive, quaderno e ripasso
   ====================================================================== */

/* ---------------- motore lezioni ---------------- */
/* espressioni sicure per gli slider: numeri, variabili, + - * / % ( ) ?: confronti && || e min max round ceil floor abs sqrt pow */
function evalExpr(src, env) {
  const toks = String(src).match(/\d+(?:[.,]\d+)?|[A-Za-z_]\w*|<=|>=|==|!=|&&|\|\||[-+*/%()?:<>!,]/g) || [];
  let i = 0; const peek = () => toks[i], next = () => toks[i++];
  const F = { min: Math.min, max: Math.max, round: Math.round, ceil: Math.ceil, floor: Math.floor, abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow };
  const tern = () => { const c = or(); if (peek() === '?') { next(); const a = tern(); if (next() !== ':') throw 0; const b = tern(); return c ? a : b; } return c; };
  const or = () => { let v = and(); while (peek() === '||') { next(); const w = and(); v = v || w; } return v; };
  const and = () => { let v = cmp(); while (peek() === '&&') { next(); const w = cmp(); v = v && w; } return v; };
  const cmp = () => { let v = add(); while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) { const o = next(), w = add(); v = o === '<' ? v < w : o === '>' ? v > w : o === '<=' ? v <= w : o === '>=' ? v >= w : o === '==' ? v == w : v != w; } return v; };
  const add = () => { let v = mul(); while (peek() === '+' || peek() === '-') { const o = next(), w = mul(); v = o === '+' ? v + w : v - w; } return v; };
  const mul = () => { let v = un(); while (['*', '/', '%'].includes(peek())) { const o = next(), w = un(); v = o === '*' ? v * w : o === '/' ? v / w : v % w; } return v; };
  const un = () => { if (peek() === '-') { next(); return -un(); } if (peek() === '!') { next(); return !un(); } return prim(); };
  const prim = () => {
    const t = next(); if (t === undefined) throw 0;
    if (t === '(') { const v = tern(); if (next() !== ')') throw 0; return v; }
    if (/^\d/.test(t)) return parseFloat(t.replace(',', '.'));
    if (F[t] && peek() === '(') { next(); const args = []; if (peek() !== ')') { args.push(tern()); while (peek() === ',') { next(); args.push(tern()); } } if (next() !== ')') throw 0; return F[t](...args); }
    if (t in env) return env[t];
    throw 0;
  };
  try { const v = tern(); if (i !== toks.length) return NaN; return v; } catch (e) { return NaN; }
}
const fmtNum = v => typeof v === 'boolean' ? (v ? 'sì' : 'no') : (Number.isFinite(v) ? (Math.round(v * 100) / 100).toLocaleString('it-IT') : '—');

const BLOCKS = {
  text: b => h('div', { class: 'prose', html: md(b.md) }),
  steps(b) {
    let cur = 0, timer = null, playing = false;
    const items = b.items || [];
    const box = h('div', { class: 'steps' });
    const els = items.map((it, i) => h('button', { class: 'step', onclick: () => { stop(); go(i); } },
      h('span', { class: 'num' }, i + 1), h('b', null, it.title), h('span', { class: 'tx' }, it.text)));
    box.append(...els);
    const playBtn = h('button', { class: 'btn small primary', onclick: () => playing ? stop() : play() }, '▶ Riproduci');
    const voiceBtn = h('button', { class: 'btn small', 'aria-pressed': 'false', onclick: () => { voiceBtn.setAttribute('aria-pressed', voiceBtn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); } }, 'Voce');
    function go(i) { cur = i; els.forEach((e, k) => { e.classList.toggle('on', k === i); if (k <= i) e.classList.add('seen'); }); }
    function stop() { playing = false; clearTimeout(timer); stopSpeak(); playBtn.textContent = '▶ Riproduci'; }
    function advance() {
      if (!playing) return;
      if (cur >= items.length - 1) { stop(); return; }
      go(cur + 1); schedule();
    }
    function schedule() {
      const it = items[cur], txt = it.title + '. ' + it.text;
      if (voiceBtn.getAttribute('aria-pressed') === 'true') speak(txt, () => { timer = setTimeout(advance, 600); });
      else timer = setTimeout(advance, Math.max(3500, txt.length * 55));
    }
    function play() { playing = true; playBtn.textContent = '❚❚ Pausa'; if (cur >= items.length - 1) cur = -1; go(Math.max(0, cur === -1 ? 0 : cur)); schedule(); }
    go(0);
    return h('div', { class: 'card flat' }, b.title && h('h3', null, b.title), h('div', { class: 'row' }, playBtn, voiceBtn, h('span', { class: 'mono' }, 'tocca un passo per aprirlo')), box);
  },
  timeline(b) {
    const els = (b.events || []).map(ev => {
      const el = h('button', { class: 'tl-ev', onclick: () => el.classList.toggle('on') }, h('span', { class: 'y' }, ev.year), h('b', null, ev.title), h('div', { class: 'tx' }, ev.text));
      return el;
    });
    return h('div', { class: 'card flat' }, b.title && h('h3', null, b.title), h('div', { class: 'tl' }, els));
  },
  compare(b) {
    const col = (c, cls) => c && h('div', { class: 'col ' + (cls || '') }, h('h3', null, c.title), h('ul', null, (c.points || []).map(p => h('li', null, p))));
    return h('div', { class: 'card flat' }, b.title && h('h3', null, b.title),
      h('div', { class: 'cmp' }, col(b.left), col(b.right), b.common && b.common.length && col({ title: 'In comune', points: b.common }, 'common')));
  },
  quiz(b) {
    const fb = h('div', { class: 'prose small' });
    let answered = false;
    const opts = (b.options || []).map((o, i) => h('button', { class: 'opt', onclick: () => {
      if (answered) return; answered = true;
      opts.forEach((e, k) => { if (k === b.correct) e.classList.add('ok'); else if (k === i) e.classList.add('no'); });
      fb.innerHTML = md((i === b.correct ? '**Giusto.** ' : '**Non proprio.** ') + (b.explain || ''));
    } }, o));
    return h('div', { class: 'card flat' }, h('span', { class: 'mono' }, 'Domanda'), h('h3', null, b.q), opts, fb);
  },
  slider(b) {
    const env = Object.assign({}, b.vars || {});
    const out = h('div', { class: 'outs' });
    const val = h('b');
    const inp = h('input', { type: 'range', min: b.min ?? 0, max: b.max ?? 10, step: b.step ?? 1, value: b.value ?? b.min ?? 0, 'aria-label': b.label });
    const upd = () => {
      env.x = parseFloat(inp.value); val.textContent = fmtNum(env.x) + (b.unit ? ' ' + b.unit : '');
      out.replaceChildren(...(b.outputs || []).map(o => h('div', { class: 'out' }, h('span', null, o.label), h('b', null, fmtNum(evalExpr(o.expr, env))), o.unit ? ' ' + o.unit : '')));
    };
    inp.addEventListener('input', upd); upd();
    return h('div', { class: 'card flat' }, b.title && h('h3', null, b.title), h('div', { class: 'row between' }, h('span', { class: 'mono' }, b.label), val), inp, out, b.note && h('p', { class: 'small muted', style: { margin: 0 } }, b.note));
  },
  seats(b) {
    const chambers = b.chambers || [];
    let ci = 0;
    const cv = h('canvas', { class: 'seats', height: 220 });
    const chips = h('div', { class: 'chips' });
    const inp = h('input', { type: 'range', min: 0, step: 1, 'aria-label': 'Voti a favore' });
    const ro = h('div', { class: 'outs' });
    function draw() {
      const ch = chambers[ci], N = ch.seats, yes = +inp.value, maj = Math.floor(N / 2) + 1;
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 320, H = Math.round(W * 0.55);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const cs = getComputedStyle(document.documentElement);
      const cYes = cs.getPropertyValue('--ok').trim(), cNo = cs.getPropertyValue('--line').trim(), cInk = cs.getPropertyValue('--ink').trim();
      const rows = Math.max(4, Math.round(Math.sqrt(N / 2.2))), r0 = 0.38, R = Math.min(W / 2 - 8, H - 14), cx = W / 2, cy = H - 6;
      const radii = Array.from({ length: rows }, (_, i) => r0 + (1 - r0) * i / (rows - 1));
      const tot = radii.reduce((a, r) => a + r, 0);
      let counts = radii.map(r => Math.round(N * r / tot)); counts[rows - 1] += N - counts.reduce((a, c) => a + c, 0);
      const pts = [];
      radii.forEach((r, i) => { for (let k = 0; k < counts[i]; k++) { const a = Math.PI - Math.PI * (counts[i] === 1 ? .5 : k / (counts[i] - 1)); pts.push({ a, r }); } });
      pts.sort((p, q) => q.a - p.a);
      const dotR = Math.max(1.6, Math.min(6, R * (1 - r0) / rows * 0.36));
      pts.forEach((p, k) => { ctx.beginPath(); ctx.arc(cx + Math.cos(p.a) * p.r * R, cy - Math.sin(p.a) * p.r * R, dotR, 0, Math.PI * 2); ctx.fillStyle = k < yes ? cYes : cNo; ctx.fill(); });
      // linea della maggioranza
      const am = Math.PI - Math.PI * (maj - .5) / N;
      ctx.strokeStyle = cInk; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(am) * (R + 6), cy - Math.sin(am) * (R + 6)); ctx.stroke(); ctx.setLineDash([]);
      ro.replaceChildren(
        h('div', { class: 'out' }, h('span', null, 'seggi'), h('b', null, N)),
        h('div', { class: 'out' }, h('span', null, 'maggioranza assoluta'), h('b', null, maj)),
        h('div', { class: 'out' }, h('span', null, 'a favore'), h('b', null, yes)),
        h('div', { class: 'out', style: { color: yes >= maj ? 'var(--ok)' : 'var(--bad)' } }, h('b', null, yes >= maj ? '✓ maggioranza raggiunta' : '✗ manca la maggioranza')));
    }
    function setCh(i) {
      ci = i; const ch = chambers[i]; inp.max = ch.seats; inp.value = Math.round(ch.seats * 0.55);
      chips.replaceChildren(...chambers.map((c, k) => h('button', { class: 'chip', 'aria-pressed': k === i ? 'true' : 'false', onclick: () => setCh(k) }, c.name)));
      draw();
    }
    inp.addEventListener('input', draw);
    setTimeout(() => chambers.length && setCh(0), 0);
    window.addEventListener('resize', () => chambers.length && draw());
    return h('div', { class: 'card flat' }, b.title && h('h3', null, b.title), chips, cv, h('span', { class: 'mono' }, 'Trascina: quanti voti a favore?'), inp, ro, b.note && h('p', { class: 'small muted', style: { margin: 0 } }, b.note));
  },
  reflect(b, ctx) {
    const ta = h('textarea', { placeholder: 'Scrivi quello che pensi, anche due righe…' });
    return h('div', { class: 'card flat' }, h('span', { class: 'mono' }, 'Ragiona tu'), h('h3', null, b.prompt), ta,
      h('div', { class: 'row' }, h('button', { class: 'btn small primary', onclick: () => {
        if (!ta.value.trim()) return;
        S.journal.push({ id: uid(), d: today(), prompt: b.prompt, text: ta.value.trim(), from: ctx && ctx.title }); save();
        addLog(ctx && ctx.area || 'scoperta', 'riflessione', b.prompt); toast('Salvato nel diario (Specchio)'); ta.value = '';
      } }, 'Salva nel diario')));
  },
  note: b => h('div', { class: 'note ' + (b.kind || '') }, h('span', { class: 'mono' }, { fatto: 'Fatto', contesto: 'Contesto', ipotesi: 'Ipotesi', attenzione: 'Attenzione' }[b.kind] || 'Nota'), h('div', { class: 'prose small', html: md(b.md) })),
  glossary(b, ctx) {
    return h('div', { class: 'card flat' }, h('h3', null, b.title || 'Parole per capire'), h('span', { class: 'mono' }, 'tocca una parola'),
      (b.items || []).map(it => { const el = h('button', { class: 'gloss', onclick: () => el.classList.toggle('on') }, h('b', null, it.term), h('div', { class: 'd' }, it.def,
        h('div', null, h('span', { class: 'btn small ghost', style: { marginTop: '6px' }, onclick: e => { e.stopPropagation(); addCard(it.term, it.def, ctx && ctx.area, ctx && ctx.title); toast('Nel Quaderno'); } }, '+ Quaderno')))); return el; }));
  },
  map(b) {
    const box = h('div', { style: { height: '320px', borderRadius: '8px', overflow: 'hidden', background: 'var(--soft)' } }, h('div', { class: 'spin' }));
    const legend = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    setTimeout(() => drawMap(box, legend, b).catch(() => box.replaceChildren(P('Mappa non disponibile senza connessione.', 'small muted'))), 30);
    return h('div', { class: 'card flat' }, h('h3', null, b.title || 'Dove succede'), box, legend, b.note && P(b.note, 'small muted'));
  },
  automap(b, ctx) { // mappa automatica: luoghi della lezione trovati sull'enciclopedia
    const holder = h('div', { class: 'card flat' }, h('h3', null, 'Dove succede'), h('div', { class: 'spin' }));
    const geo = geoContext(lessonContextText(ctx));
    if (geo) { setTimeout(() => holder.replaceWith(BLOCKS.map(geo)), 0); return holder; }
    (async () => {
      const terms = [];
      for (const c of ctx.chapters || []) for (const bl of c.blocks || []) { if (bl.type === 'glossary') (bl.items || []).forEach(x => terms.push(x.term)); }
      keywords(ctx.title, 6).filter(w => /^[A-ZÀ-Ý]/.test(w)).forEach(w => terms.push(w));
      const uniq = [...new Set(terms.filter(Boolean))].slice(0, 10);
      const found = await Promise.all(uniq.map(t => wikiResolve(t).catch(() => null)));
      const places = found.filter(x => x && x.coordinates).map(x => ({ name: x.title, lat: x.coordinates.lat, lon: x.coordinates.lon, note: x.description || '' }));
      const seen = new Set(); const pl = places.filter(p => !seen.has(p.name) && seen.add(p.name));
      if (!pl.length) { holder.remove(); return; }
      const box = h('div', { style: { height: '300px', borderRadius: '8px', overflow: 'hidden', background: 'var(--soft)' } });
      const legend = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
      holder.replaceChildren(h('h3', null, 'Dove succede'), box, legend, P('Luoghi trovati in automatico tra quelli citati nella lezione.', 'small muted'));
      drawMap(box, legend, { places: pl, groups: [] }).catch(() => holder.remove());
    })();
    return holder;
  },
  links: b => h('div', { class: 'card flat' }, h('h3', null, b.title || 'Per andare oltre'),
    (b.items || []).filter(l => /^https?:\/\//.test(l.url || '')).map(l => h('div', null, h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.title), l.note && h('div', { class: 'small muted' }, l.note))))
};

function renderBlocks(blocks, ctx) {
  return (blocks || []).filter(b => b && b.type !== 'quiz').map(b => { try { return (BLOCKS[b.type] || BLOCKS.text)(b, ctx); } catch (e) { return h('div', { class: 'empty' }, 'Blocco non leggibile: ' + b.type); } });
}


function allLessons() { return Object.assign({}, BUILTIN_LESSONS, S.prepMeta || {}, typeof PREPMEM !== 'undefined' ? PREPMEM : {}, S.lessons); }
function openLesson(id, chapter) {
  const L = allLessons()[id]; if (!L) { toast('Lezione non trovata'); return; }
  if (!L.chapters) { const it = PREP.items.find(p => p.id === id); if (it) { openPrepared(it); } else toast('Lezione non più disponibile'); return; }
  S.lastLesson = id;
  const prog = S.progress[id] || (S.progress[id] = { seen: [], done: false, at: 0 });
  if (chapter === undefined) chapter = prog.at || 0;
  if (!prog.done) contAdd({ type: 'lesson', id, title: L.title, area: L.area });
  save();
  const host = pad();
  const close = openSheet(L.title, host, () => render());
  L.chapters = (L.chapters || []).filter(c => c && typeof c === 'object');
  let chs = L.chapters;
  if (!chs.length) { toast('Questa lezione è vuota o danneggiata'); return; }
  function show(ci) {
    chs = (L.chapters || []).filter(c => c && typeof c === 'object');
    ci = Math.max(0, Math.min(chs.length - 1, ci));
    if (!prog.seen.includes(ci)) prog.seen.push(ci); prog.at = ci; save();
    const ch = chs[ci];
    const writing = L.writing && chs.length < L.writing;
    const isLast = ci === chs.length - 1 && !writing;
    const topic = L.gen && L.gen.topic && topicOf(L.gen.topic);
    host.replaceChildren(
      h('div', { class: 'lesson-head' },
        h('div', { class: 'row' }, areaTag(L.area), L.kind && h('span', { class: 'tag muted' }, L.kind), L.gen && h('span', { class: 'tag muted' }, L.gen.notte ? 'di stanotte' : 'generata'), h('span', { class: 'mono' }, `${prog.seen.length}/${chs.length} capitoli`)),
        L.summary && h('p', { class: 'small muted', style: { margin: 0 } }, L.summary),
        L.pending ? h('div', { class: 'note ' + (/scrittura/.test(L.pending) ? 'ipotesi' : 'contesto') }, h('span', { class: 'mono' }, /scrittura/.test(L.pending) ? '⏳ in arrivo' : 'nota'), P(L.pending),
          L.offerLocal && L.src ? h('button', { class: 'btn small', style: { marginTop: '6px' }, onclick: () => { useLocalOnce = true; completeNewsLesson(L, { main: L.src.main, items: L.src.items }, L.src.mode || 'quick'); } }, '📱 Scrivila ora sul telefono (lento: alcuni minuti)') : null) : null),
      h('div', { class: 'read-progress' }, h('div', { style: { width: Math.round((ci + 1) / Math.max(1, chs.length) * 100) + '%' } })),
      h('div', { class: 'chapters' }, chs.map((c, k) => h('button', { class: 'chip', 'aria-pressed': k === ci ? 'true' : 'false', onclick: () => show(k) }, (k + 1) + ' · ' + (c.label || 'Parte'), h('small', null, c.depth === 'profondo' ? '◆' : '◇')))),
      h('div', null, h('span', { class: 'mono' }, (ch.label || '') + (ch.depth ? ' · ' + ch.depth : '')), h('h2', { style: { marginTop: '4px' } }, ch.title)),
      h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: () => noteSheet({ title: 'Nota: ' + L.title, from: L.title }) }, '📝 Nota'), h('button', { class: 'btn small', onclick: () => speak(ch.title + '. ' + (ch.blocks || []).filter(b => b.type === 'text' || b.type === 'note').map(b => b.md).join(' ')) }, '🔊 Ascolta'), h('button', { class: 'btn small ghost', onclick: stopSpeak }, 'Stop')),
      ...renderBlocks(ci === 0 && L.kind === 'notizia' && !(L.chapters || []).some(c => (c.blocks || []).some(b => b.type === 'map' && (b.groups || []).some(g => (g.countries || []).length))) ? (ch.blocks || []).concat([{ type: 'automap' }]) : ch.blocks, L),
      isLast && (L.branches || []).length ? h('div', { class: 'card flat' }, h('h3', null, 'Rami da esplorare'), P('Argomenti collegati: aprili per una scheda di approfondimento.', 'small muted'), L.branches.filter(b => b && b.name).map(b => h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => branchSheet(b, L, topic) }, h('b', null, b.name + ' →'), b.why && h('span', { class: 'small muted' }, b.why)))) : null,
      h('div', { class: 'stop' },
        h('span', { class: 'mono' }, isLast ? 'Fine della lezione' : 'Punto di stop'),
        h('p', { class: 'small', style: { margin: 0 } }, isLast ? 'Hai finito. Concludi per salvare le carte di ripasso.' : 'Puoi chiudere qui: ritroverai la lezione in «Da continuare».'),
        h('div', { class: 'row' },
          ci > 0 && h('button', { class: 'btn small', onclick: () => show(ci - 1) }, '‹ Indietro'),
          !isLast && (ci < chs.length - 1 ? h('button', { class: 'btn small primary', onclick: () => show(ci + 1) }, 'Continua ›') : h('button', { class: 'btn small', disabled: true }, '… il capitolo ' + (ci + 2) + ' è in scrittura')),
          isLast && h('button', { class: 'btn small primary', onclick: () => finish() }, '✓ Ho letto e capito'),
          isLast && h('button', { class: 'btn small', onclick: () => skim() }, 'Ho solo scorso'),
          isLast && topic && h('button', { class: 'btn small', onclick: () => { finish(true); genTopicLesson(topic); } }, '↓ Più a fondo' + (L.next ? ': ' + L.next : '')),
          h('button', { class: 'btn small ghost', onclick: close }, 'Chiudi'))));
    host.parentElement && (host.parentElement.scrollTop = 0);
  }
  function skim() { prog.skimmed = true; contDone('lesson', id); save(); toast('Ok: non la conto tra le cose imparate'); close(); }
  function finish(silent) {
    let added = 0;
    for (const c of L.cards || []) if (c && c.q && !S.cards.some(x => x.front === c.q)) { addCard(c.q, c.a, L.area, L.title); added++; }
    prog.read = true;
    if (!prog.done) { prog.done = true; addLog(L.area || 'scoperta', 'lezione', L.title, 2, typeof themeOf === 'function' ? themeOf(L) : null); bumpInterest((L.tags || []).concat(L.gen && L.gen.topic ? [L.gen.topic] : []), 3); }
    contDone('lesson', id); save();
    if (!silent) toast(added ? `${added} carte nel Quaderno` : 'Lezione completata');
    close();
  }
  const onUpd = ev => { if (ev.detail !== id) return; if (!host.isConnected) { window.removeEventListener('lesson-updated', onUpd); return; } const sc = host.parentElement.scrollTop; show(prog.at); host.parentElement.scrollTop = sc; };
  window.addEventListener('lesson-updated', onUpd);
  show(chapter);
}

/* ---------------- riserva: farsi preparare la lezione da Claude in chat ---------------- */
function askClaudeSheet(kind, subject, extra) {
  const txt = lessonPrompt(kind, subject, extra);
  openSheet('Chiedi una lezione a Claude', h('div', { class: 'card' },
    h('p', { class: 'small', style: { margin: 0 } }, 'Alternativa al motore dell\'app: copia la richiesta, incollala in una chat con Claude, poi importa il JSON che ti risponde.'),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => copyText(txt) }, 'Copia la richiesta'), h('button', { class: 'btn', onclick: importSheet }, 'Ho già il JSON'))));
}
function importSheet() {
  const ta = h('textarea', { placeholder: 'Incolla qui il JSON della lezione', style: { minHeight: '200px', fontFamily: 'var(--f-mono)', fontSize: '12px' } });
  const close = openSheet('Importa lezione', h('div', { class: 'card' }, ta,
    h('button', { class: 'btn primary', onclick: () => {
      try {
        let data = parseJSONLoose(ta.value); if (!Array.isArray(data)) data = [data];
        const ids = data.map(L => {
          if (!L || !L.title || !Array.isArray(L.chapters)) throw new Error('manca title o chapters');
          const id = L.id || ('l-' + uid()); L.id = id; L.area = AREAS[L.area] ? L.area : 'scoperta'; S.lessons[id] = L; return id;
        });
        save(); close(); toast(`${ids.length} lezione importata`); render();
        if (ids.length === 1) openLesson(ids[0]);
      } catch (e) { toast('JSON non valido: ' + (e.message || 'controlla il testo')); }
    } }, 'Importa')));
}

/* ---------------- quaderno: carte con ripetizione dilazionata ---------------- */
function addCard(front, back, area, from) { S.cards.push({ id: uid(), front, back, area: area || 'scoperta', from: from || '', due: today(), iv: 0, ef: 2.5, reps: 0 }); save(); }
function dueCards() { const d = today(); return S.cards.filter(c => c.due <= d); }
function grade(card, q) { // q: 0 di nuovo, 1 difficile, 2 bene, 3 facile (SM-2 semplificato)
  if (q === 0) { card.reps = 0; card.iv = 0; }
  else {
    card.reps++;
    card.iv = card.reps === 1 ? (q === 3 ? 3 : 1) : card.reps === 2 ? (q === 1 ? 3 : 6) : Math.round(card.iv * card.ef * (q === 1 ? .7 : q === 3 ? 1.3 : 1));
    card.ef = Math.max(1.3, card.ef + (q === 1 ? -0.15 : q === 3 ? 0.1 : 0));
  }
  const d = new Date(); d.setDate(d.getDate() + card.iv); card.due = d.toISOString().slice(0, 10); save();
}
function reviewSheet() {
  const queue = dueCards().slice(0, 30);
  if (!queue.length) { toast('Nessuna carta da ripassare oggi'); return; }
  const host = pad();
  const close = openSheet('Ripasso', host, () => render());
  let i = 0, done = 0;
  function show() {
    if (i >= queue.length) { if (done) addLog(queue[0].area, 'ripasso', `${done} carte ripassate`); host.replaceChildren(h('div', { class: 'card' }, h('h3', null, 'Fatto.'), h('p', null, `Hai ripassato ${done} carte.`), h('button', { class: 'btn primary', onclick: close }, 'Chiudi'))); return; }
    const c = queue[i]; let open = false;
    const back = h('div', { class: 'back', hidden: true }, c.back);
    const hint = h('span', { class: 'mono' }, 'tocca per vedere la risposta');
    const gr = h('div', { class: 'row', hidden: true }, ['Di nuovo', 'Difficile', 'Bene', 'Facile'].map((l, q) => h('button', { class: 'btn small grow' + (q === 2 ? ' primary' : ''), onclick: () => { grade(c, q); done++; i++; show(); } }, l)));
    const fl = h('div', { class: 'card flash', onclick: () => { if (open) return; open = true; back.hidden = false; gr.hidden = false; hint.remove(); } },
      h('span', { class: 'mono' }, `${i + 1}/${queue.length} · ${c.from || ''}`), h('div', { class: 'front' }, c.front), back, hint);
    host.replaceChildren(fl, gr);
  }
  show();
}


/* ---------------- scheda di un ramo: intro + ciò che serve rispetto alla lezione di partenza ---------------- */
function lessonContextText(L) {
  const parts = [L.title, L.summary, ...(L.tags || [])];
  for (const c of L.chapters || []) { parts.push(c.title); for (const b of c.blocks || []) { if (b.md) parts.push(b.md); if (b.items) b.items.forEach(x => parts.push(x.term || x.title || '', x.def || x.text || '')); if (b.events) b.events.forEach(x => parts.push(x.title)); } }
  return parts.filter(Boolean).join(' ').slice(0, 20000);
}
function branchSheet(b, L, topic) {
  const id = catalogAdd(b.name, topic ? topic.c : 'Scoperti', b.why, topic ? topic.id : null);
  const ctxText = lessonContextText(L) + ' ' + (b.why || '');
  const intro = h('div', null, h('div', { class: 'spin' }));
  const passages = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('div', { class: 'spin' }));
  const custom = h('div');
  const renderCard = c => custom.replaceChildren(card(h('span', { class: 'mono' }, 'Spiegato per te'), h('div', { class: 'prose', html: md(c.md) }),
    (c.facts || []).length ? h('ul', { class: 'small', style: { margin: 0, paddingLeft: '1.2em' } }, c.facts.map(f => h('li', null, f))) : null));
  if (b.md) renderCard(b);
  (async () => {
    let page = null;
    try { const rs = await wikiSearch(b.name, 1); if (rs[0]) page = await wikiParagraphs(rs[0].title); } catch (e) { }
    if (!page || !page.paras.length) { intro.replaceChildren(P(b.md ? '' : 'Nessuna voce enciclopedica trovata per questo ramo.', 'small muted')); passages.replaceChildren(); return; }
    const first = page.paras.slice(0, 2).map(p => p.text).join(' ').split(/(?<=\.)\s/).slice(0, 5).join(' ');
    intro.replaceChildren(h('div', { class: 'prose' }, h('p', null, first)), h('span', { class: 'mono' }, 'fonte: Wikipedia, «' + page.title + '»'));
    const top = rankByContext(page.paras.slice(2), ctxText, 5);
    passages.replaceChildren(...(top.length ? top.map(p => h('div', { class: 'note contesto' }, h('span', { class: 'mono' }, p.sec), P(p.text))) : [P('Nessun passaggio particolarmente legato alla lezione: leggi l\'introduzione o la voce completa.', 'small muted')]),
      wikiReader(page.title));
  })();
  openSheet(b.name, pad(
    b.link || b.why ? h('div', { class: 'note contesto' }, h('span', { class: 'mono' }, 'Perché è collegato a «' + (L.title || '') + '»'), P(b.link || b.why)) : null,
    card(h('span', { class: 'mono' }, 'In breve'), intro),
    custom,
    !b.md && aiReady() ? h('button', { class: 'btn primary', onclick: async ev => {
      const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Scrivo…';
      try {
        const PI = await loadPiani();
        const c = await aiJSON(PI.sys, `Lezione di partenza: «${L.title}». ${L.summary || ''}\nTemi della lezione: ${(L.chapters || []).map(x => x.title).join('; ')}\n` + PI.ramo.replace('{name}', b.name).replace('{why}', b.why || '') + `\nRispondi con un JSON così: ${PI.schema_ramo}`, 1600);
        if (!c.md) throw new Error('risposta vuota');
        Object.assign(b, { md: c.md, facts: c.facts || [], link: c.link || b.why }); save(); renderCard(b); btn.remove();
      } catch (e) { btn.disabled = false; btn.textContent = 'Riprova'; toast(e.message || 'Non riuscito'); }
    } }, 'Spiegamelo in relazione a questa lezione') : null,
    (b.facts || []).length ? card(h('h3', null, 'Fatti chiave'), h('ul', { class: 'small', style: { margin: 0, paddingLeft: '1.2em' } }, b.facts.map(f => h('li', null, f))),
      h('button', { class: 'btn small', onclick: () => { addCard(b.name + ': fatti chiave', b.facts.join(' · '), L.area, L.title); toast('Nel Quaderno'); } }, '+ Quaderno')) : null,
    card(h('h3', null, 'Cosa ti serve per capire «' + (L.title || '').slice(0, 60) + '»'), P('I passaggi della voce enciclopedica più legati alla lezione da cui arrivi.', 'small muted'), passages),
    otherSources(b.name, typeof themeOf === 'function' ? themeOf(L) : 'default'),
    h('button', { class: 'btn', onclick: () => { openTopic(id); } }, 'Esploralo come argomento: podcast, libri, lezioni')));
}

/* ---------------- lettura di una voce di Wikipedia capitolo per capitolo ---------------- */
function wikiReader(title) {
  const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' } });
  const btn = h('button', { class: 'btn small', onclick: async () => {
    btn.remove(); box.append(h('div', { class: 'spin' }));
    try {
      const secs = await wikiSections(title);
      box.replaceChildren(h('span', { class: 'mono' }, 'La voce, capitolo per capitolo'), ...secs.slice(0, 20).map(s => {
        const body = h('div', { class: 'prose small', hidden: true });
        const b = h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: async () => {
          if (!body.hidden) { body.hidden = true; return; }
          body.hidden = false; body.textContent = 'Carico…';
          try { body.replaceChildren(...(await wikiSectionText(title, s.index)).map(t => h('p', null, t))); } catch (e) { body.textContent = 'Non disponibile.'; }
        } }, h('b', null, stripTags(s.line)));
        return h('div', null, b, body);
      }));
    } catch (e) { box.replaceChildren(P('Capitoli non disponibili.', 'small muted')); }
  } }, '📖 Leggi la voce completa');
  box.append(btn);
  return box;
}

/* ---------------- mappe: OpenStreetMap + confini dei Paesi colorati per gruppo ---------------- */
const MAP_COLORS = ['#2b63c4', '#c4542b', '#1f8a6a', '#8a3cb2', '#c48a12', '#0b7d8f', '#b0392a'];
let leafletP = null, worldP = null;
function loadScript(src) { return new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.append(s); }); }
function loadLeaflet() {
  if (!leafletP) leafletP = (async () => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.append(css);
    await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
  })();
  return leafletP;
}
function loadWorld() {
  if (!worldP) worldP = (async () => {
    await loadScript('https://unpkg.com/topojson-client@3/dist/topojson-client.min.js');
    const topo = await getJSON('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
    return topojson.feature(topo, topo.objects.countries).features;
  })();
  return worldP;
}
const CN_ALIAS = { 'usa': 'united states of america', 'united states': 'united states of america', 'us': 'united states of america', 'uk': 'united kingdom', 'great britain': 'united kingdom', 'russian federation': 'russia', 'czech republic': 'czechia', 'south korea': 'south korea', 'north korea': 'north korea', 'democratic republic of the congo': 'dem. rep. congo', 'dr congo': 'dem. rep. congo', 'bosnia and herzegovina': 'bosnia and herz.', 'central african republic': 'central african rep.', 'south sudan': 's. sudan', 'ivory coast': "côte d'ivoire", 'palestine': 'palestine', 'taiwan': 'taiwan' };
const normC = n => { const l = String(n || '').toLowerCase().trim(); return CN_ALIAS[l] || l; };
async function geocodeClient(name, country) {
  const q = name + (country && !name.toLowerCase().includes(String(country).toLowerCase()) ? ', ' + country : '');
  let cache = {}; try { cache = JSON.parse(localStorage.getItem('ulisse.geo') || '{}'); } catch (e) { }
  if (q in cache) return cache[q];
  let ll = null;
  try { const r = await getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=it&q=' + encodeURIComponent(q)); if (r[0]) ll = [+r[0].lat, +r[0].lon]; } catch (e) { }
  cache[q] = ll; try { localStorage.setItem('ulisse.geo', JSON.stringify(cache)); } catch (e) { }
  return ll;
}
async function drawMap(box, legend, b) {
  await loadLeaflet();
  const Lf = window.L;
  box.replaceChildren();
  const map = Lf.map(box, { zoomControl: true, attributionControl: true, worldCopyJump: true }).setView([42, 12], 3);
  Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 12 }).addTo(map);
  const groups = (b.groups || []).filter(g => g && g.name);
  const col = name => { const i = groups.findIndex(g => g.name === name); return MAP_COLORS[(i < 0 ? groups.length : i) % MAP_COLORS.length]; };
  const bounds = [];
  if (groups.some(g => (g.countries || []).length)) {
    try {
      const feats = await loadWorld();
      const owner = {}; groups.forEach(g => (g.countries || []).forEach(c => { owner[normC(c)] = g.name; }));
      const sel = feats.filter(f => owner[normC(f.properties.name)]);
      const layer = Lf.geoJSON(sel, { style: f => ({ color: col(owner[normC(f.properties.name)]), weight: 1, fillOpacity: 0.35 }), onEachFeature: (f, l) => l.bindTooltip(f.properties.name + ' · ' + owner[normC(f.properties.name)]) }).addTo(map);
      if (sel.length) bounds.push(layer.getBounds());
    } catch (e) { }
  }
  for (const pl of (b.places || []).filter(p => p && p.name)) {
    let ll = pl.lat !== undefined ? [pl.lat, pl.lon] : await geocodeClient(pl.name, pl.country);
    if (!ll) continue;
    Lf.circleMarker(ll, { radius: 8, color: '#1e1614', weight: 1.5, fillColor: col(pl.group), fillOpacity: 0.95 }).addTo(map).bindTooltip('<b>' + esc(pl.name) + '</b>' + (pl.note ? '<br>' + esc(pl.note) : ''), { direction: 'top' });
    bounds.push(Lf.latLngBounds([ll, ll]));
  }
  if (bounds.length) { const all = bounds.reduce((a, x) => a.extend(x), Lf.latLngBounds(bounds[0].getSouthWest(), bounds[0].getNorthEast())); map.fitBounds(all.pad(0.25), { maxZoom: 6 }); }
  setTimeout(() => map.invalidateSize(), 200);
  legend.replaceChildren(...groups.map(g => h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } }, h('span', { class: 'dotc', style: { background: col(g.name), marginTop: '6px' } }), h('div', { class: 'small' }, h('b', null, g.name), g.desc ? ' · ' + g.desc : ''))),
    ...(b.places || []).filter(p => p && p.note).slice(0, 8).map(p => h('div', { class: 'small muted' }, '• ' + p.name + ': ' + p.note)));
}

/* altre fonti: notizie recenti dal nostro archivio + siti autorevoli del tema */
function otherSources(name, theme) {
  const news = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
  serverNews().then(srv => {
    const kw = keywords(name, 4).map(w => w.toLowerCase().slice(0, Math.max(4, w.length - 1)));
    const pool = [].concat(...Object.values(srv.sezioni || {}), ...Object.values(srv.temi || {}), ...Object.values(srv.testate || {}));
    const seen = new Set();
    const hits = pool.filter(i => kw.length && kw.every(k => (i.title + ' ' + (i.desc || '')).toLowerCase().includes(k)) && !seen.has(i.title) && seen.add(i.title)).slice(0, 5);
    if (hits.length) news.replaceChildren(h('span', { class: 'mono' }, 'Notizie recenti che ne parlano'), ...hits.map(i => h('a', { href: i.link, target: '_blank', rel: 'noopener', class: 'small' }, (i.src ? i.src + ' · ' : '') + i.title)));
  }).catch(() => { });
  const list = AUTH_SOURCES[theme] || AUTH_SOURCES.default;
  return card(h('h3', null, 'Altre fonti'), news,
    h('span', { class: 'mono' }, 'Cerca «' + name + '» su fonti autorevoli'),
    h('div', { class: 'chips' }, list.map(([n, dom]) => h('a', { class: 'chip', href: dom === 'treccani.it' ? 'https://www.treccani.it/enciclopedia/ricerca/' + encodeURIComponent(name) + '/' : siteSearch(dom, name), target: '_blank', rel: 'noopener', style: { textDecoration: 'none', color: 'inherit' } }, n + ' ↗'))),
    h('a', { class: 'small', href: 'https://archive.org/search?query=' + encodeURIComponent(name) + '&and%5B%5D=mediatype%3A%22texts%22&and%5B%5D=language%3A%22Italian%22', target: '_blank', rel: 'noopener' }, 'Libri e documenti liberi su Internet Archive ↗'));
}
