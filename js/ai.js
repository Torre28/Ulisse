"use strict";
/* ======================================================================
   ULISSE · motore di generazione
   Due fonti, entrambe gratuite e senza limiti:
   1. la «redazione notturna» (GitHub Actions + modello aperto) che prepara
      ogni notte i contenuti in contenuti/indice.json;
   2. Groq (gratuito con account) per le richieste al momento;
      la scheda istantanea senza IA come riserva.
   Facoltativo: chiave personale Gemini, per chi la vuole.
   Le istruzioni sono condivise con la redazione in prompts/piani.json.
   ====================================================================== */

let PIANI = null;
async function loadPiani() { if (!PIANI) { PIANI = await getJSON('prompts/piani.json'); PIANI.sys = PIANI.sys.replace('{{ESEMPIO}}', PIANI.esempio || ''); } return PIANI; }
const LEVEL_TXT = () => (PIANI ? PIANI.livelli[S.level] : '') || 'curioso con basi minime';

/* ---------------- contenuti preparati stanotte ---------------- */
let PREP = { items: [] };
async function loadPrep() {
  const raw = `https://raw.githubusercontent.com/${repoPath()}/rapidi/`;
  const t = Math.floor(Date.now() / 600000);
  const [night, fast] = await Promise.all([
    getJSON('contenuti/indice.json?t=' + t).catch(() => ({ items: [] })),
    getJSON(raw + 'contenuti/indice.json?t=' + t).catch(() => ({ items: [] }))]);
  PREP = night; PREP.items = (night.items || []).concat((fast.items || []).map(i => Object.assign(i, { base: raw })));
  return PREP;
}
const prepLatest = () => { const ds = PREP.items.filter(i => !i.base).map(i => i.date).sort(); const d = ds[ds.length - 1]; return PREP.items.filter(i => i.date === d && !i.base); };
/* le lezioni pronte si scaricano in anticipo nella cache del telefono: aprirle è istantaneo, anche offline */
const LCACHE = 'ulisse-lezioni';
async function fetchLessonFile(item) {
  const url = new URL((item.base || '') + item.file, location.href).href;
  try { const c = await caches.open(LCACHE); const hit = await c.match(url); if (hit) return hit.json(); const r = await fetchT(url, {}, 15000); if (r.ok) { c.put(url, r.clone()); return r.json(); } } catch (e) { }
  return getJSON(url);
}
async function prefetchPrepared() {
  if (!('caches' in window)) return;
  const items = PREP.items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  for (const it of items) { if (allLessons()[it.id]) continue; try { await fetchLessonFile(it); } catch (e) { } }
}
const PREPMEM = {}; // lezioni pronte: in memoria e nella cache, non nella memoria permanente (che è piccola)
async function openPrepared(item) {
  if (!(allLessons()[item.id] || {}).chapters) {
    try { const L = await fetchLessonFile(item); PREPMEM[item.id] = L; S.prepMeta = S.prepMeta || {}; S.prepMeta[item.id] = { title: L.title, kind: L.kind, area: L.area, tags: L.tags || [], gen: { topic: L.gen && L.gen.topic } }; save(); }
    catch (e) { toast('Non riesco a scaricare questa lezione'); return; }
  }
  openLesson(item.id);
}
function prepForNews(it, mode) {
  const ts = tokenSet(it.title);
  return PREP.items.filter(p => !mode || mode === 'quick' || p.mode === 'full').find(p => p.kind === 'notizia' && (p.ref === it.link || (p.headline && (() => { const o = tokenSet(p.headline); let n = 0; for (const x of ts) if (o.has(x)) n++; return n >= 3 && n / Math.min(ts.size, o.size) >= 0.5; })())));
}

/* il modello sul telefono è stato tolto: scaldava e rallentava il telefono senza dare risultati utili.
   All'avvio si libera lo spazio occupato da eventuali modelli già scaricati. */
const hasWebGPU = () => false;
const useLocal = () => false;
let onEngineProgress = null;
(async () => { try { for (const k of await caches.keys()) if (/webllm|tvmjs|mlc/i.test(k)) await caches.delete(k); } catch (e) { } })();

/* ---------------- Gemini (facoltativo, con chiave personale) ---------------- */
const GEM = 'https://generativelanguage.googleapis.com/v1beta';
async function geminiModels(key) {
  const j = await getJSON(`${GEM}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini|gemma/i.test(m.name) && !/image|tts|audio|live|embed|vision|robotics|computer|native/i.test(m.name));
  const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  const score = n => ver(n) * 10 + (/flash(?!-lite)/i.test(n) ? 3 : /flash-lite/i.test(n) ? 2 : /gemma/i.test(n) ? 0 : 1) - (/preview|exp/i.test(n) ? 0.5 : 0);
  return ok.map(m => m.name.replace(/^models\//, '')).sort((a, b) => score(b) - score(a));
}
async function geminiCall(system, user, maxTok) {
  let model = S.ai.model;
  if (!model) { model = (await geminiModels(S.ai.key))[0]; if (!model) throw new Error('nessun modello per questa chiave'); S.ai.model = model; save(); }
  const r = await fetchT(`${GEM}/models/${model}:generateContent?key=${encodeURIComponent(S.ai.key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.55, maxOutputTokens: maxTok, responseMimeType: 'application/json' } }) }, 150000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 404) { S.ai.model = ''; save(); } throw new Error(r.status === 429 ? 'Limite gratuito di Gemini raggiunto' : (j.error?.message || 'HTTP ' + r.status)); }
  return (j.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
}

/* ---------------- Groq (facoltativo, gratuito con account): velocissimo ---------------- */
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'qwen/qwen3-32b'];
async function groqCall(system, user, maxTok) {
  const models = [S.ai.groqModel || GROQ_MODELS[0], ...GROQ_MODELS].filter((m, i, a) => a.indexOf(m) === i);
  let last;
  for (const model of models) {
    const body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.5, max_completion_tokens: maxTok, response_format: { type: 'json_object' } };
    if (/gpt-oss/.test(model)) body.reasoning_effort = 'low';
    try {
      const r = await fetchT(GROQ, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.ai.groqKey }, body: JSON.stringify(body) }, 60000);
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j.choices?.[0]?.message?.content || '';
      last = new Error(j.error?.message || 'HTTP ' + r.status);
      if (r.status === 401) throw new Error('Chiave Groq non valida');
      // limite del minuto o del giorno su questo modello: prova il successivo
    } catch (e) { if (/non valida/.test(e.message)) throw e; last = e; }
  }
  throw Object.assign(last || new Error('Groq non disponibile'), { groq: true });
}
const hasGroq = () => !!S.ai.groqKey;

/* ---------------- interfaccia comune ---------------- */
// ordine: Groq (veloce) → Gemini (se scelto) → modello sul telefono
const aiReady = () => hasGroq() || (S.ai.provider === 'gemini' && !!S.ai.key);
async function aiText(system, user, maxTok) {
  if (hasGroq()) { try { return await groqCall(system, user, Math.min(maxTok, 4000)); } catch (e) { if (!e.groq) throw e; if (!(S.ai.provider === 'gemini' && S.ai.key)) throw new Error('Groq ha raggiunto il limite di questo momento: riprova tra un minuto.'); } }
  if (S.ai.provider === 'gemini' && S.ai.key) return geminiCall(system, user, maxTok);
  throw new Error('Serve la chiave gratuita di Groq (⚙ → Motore veloce)');
}
function parseJSONLoose(txt) {
  let t = String(txt).replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); }
  catch (e) { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); }
}
async function aiJSON(system, user, maxTok) {
  let last;
  for (let i = 0; i < 2; i++) { try { return parseJSONLoose(await aiText(system, user, maxTok)); } catch (e) { last = e; if (/WebGPU|Limite|chiave/.test(e.message || '')) break; } }
  throw last;
}

/* ---------------- lezione costruita un capitolo alla volta ---------------- */
const KNOWN_BLOCKS = new Set(['text', 'note', 'steps', 'timeline', 'compare', 'glossary', 'slider', 'reflect', 'links', 'map']);
function cleanChapter(ch, p) {
  if (ch && ch.chapter && typeof ch.chapter === 'object') ch = ch.chapter;
  const blocks = (ch && Array.isArray(ch.blocks) ? ch.blocks : []).filter(b => b && KNOWN_BLOCKS.has(b.type));
  blocks.forEach(b => { if (b.type === 'quiz') b.correct = parseInt(b.correct, 10) || 0; });
  if (!blocks.length) throw new Error('capitolo vuoto');
  return { label: ch.label || p.label, title: ch.title || p.label, depth: p.depth, blocks };
}
async function buildLessonOneShot(planKey, metaKey, context, log) {
  const PI = await loadPiani();
  const plan = PI.piani[planKey];
  log('Scrivo la lezione (modello veloce)…');
  const user = `${context}\n\nPIANO DELLA LEZIONE (scrivi TUTTI i capitoli, in quest'ordine):\n${plan.map((p, i) => `${i + 1}. ${p.label} (${p.depth}): ${p.spec}`).join('\n')}\n\nMetadati: ${PI.meta[metaKey]}\nRispondi con un JSON così: {"title":"…","summary":"…","tags":[],"chapters":[ ${PI.schema_capitolo} ],"cards":[{"q":"…","a":"…"}],"branches":[{"name":"…","why":"…"}],"next":"…"}\n${PI.blocchi}`;
  const J = await aiJSON(PI.sys, user, 4000);
  const chapters = (J.chapters || []).map((c, i) => { try { return cleanChapter(c, plan[i] || plan[plan.length - 1]); } catch (e) { return null; } }).filter(Boolean);
  if (!chapters.length) throw new Error('lezione vuota');
  return { title: J.title, summary: J.summary, tags: J.tags || [], cards: (J.cards || []).filter(c => c && c.q && c.a), branches: (J.branches || []).filter(b => b && b.name), next: J.next, chapters };
}
async function buildLesson(planKey, metaKey, context, log, onChapter) {
  const PI = await loadPiani();
  if (hasGroq() && planKey !== 'notizia_completa') { try { const L = await buildLessonOneShot(planKey, metaKey, context, log); onChapter && onChapter(L.chapters, L.chapters.length); return L; } catch (e) { if (!hasWebGPU()) throw e; log('Modello veloce non disponibile, passo a quello sul telefono'); } }
  const plan = PI.piani[planKey], local = useLocal();
  const planTxt = plan.map((p, i) => `${i + 1}. ${p.label} (${p.depth}): ${p.spec}`).join('\n');
  const chapters = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    log(`Scrivo il capitolo ${i + 1} di ${plan.length}: ${p.label}`);
    const done = chapters.map(c => '«' + c.title + '»').join(', ') || 'nessuno';
    const user = `${context}\n\nPIANO DELLA LEZIONE:\n${planTxt}\n\nCapitoli già scritti: ${done}. Non ripeterne i contenuti.\nScrivi ADESSO SOLO il capitolo ${i + 1} «${p.label}» (${p.depth}).\nIndicazioni: ${p.spec}\n\nRispondi con un JSON così: ${PI.schema_capitolo}\n${PI.blocchi}`;
    let ch;
    try { ch = cleanChapter(await aiJSON(PI.sys, user, local ? 1300 : 2600), p); }
    catch (e) { if (/WebGPU|Limite|chiave/.test(e.message || '')) throw e; log('  capitolo saltato: ' + (e.message || e)); continue; }
    chapters.push(ch);
    if (onChapter) onChapter(chapters, plan.length);
  }
  if (!chapters.length) throw new Error('Il modello non è riuscito a scrivere la lezione. Riprova o scegli un modello più grande in ⚙.');
  log('Ultimi ritocchi: carte di ripasso e rami');
  let meta = {};
  try { meta = await aiJSON(PI.sys, `${context}\n\nLa lezione ha questi capitoli:\n${chapters.map(c => '- ' + c.label + ': ' + c.title).join('\n')}\n\nOra scrivi i metadati. ${PI.meta[metaKey]}\nRispondi con un JSON così: ${PI.schema_meta}`, 1400); } catch (e) { }
  return { title: meta.title, summary: meta.summary, tags: meta.tags || [], cards: (meta.cards || []).filter(c => c && c.q && c.a), branches: (meta.branches || []).filter(b => b && b.name), next: meta.next, chapters };
}

/* ---------------- contesti per ogni tipo di lezione ---------------- */
function newsContext(cluster, prior, wiki) {
  const it = cluster.main, lite = useLocal() || hasGroq(); // contesto compatto: Groq gratuito accetta ~8000 token al minuto
  const th = typeof themeOf === 'function' ? themeOf({ kind: 'notizia', title: it.title, tags: [] }) : null;
  const lvTxt = th && typeof levelForTheme === 'function' && PIANI ? PIANI.livelli[levelForTheme(th)] : LEVEL_TXT();
  const L = [`Livello del lettore su questo tema (${th || 'attualità'}): ${lvTxt}. Oggi è il ${new Date().toLocaleDateString('it-IT')}.`, `NOTIZIA: «${it.title}»`, '', '### Come ne parlano le testate (oggi)'];
  cluster.items.slice(0, lite ? 4 : 8).forEach(i => L.push(`- [${i.src || i.feed || ''}] ${i.title}${i.desc ? ' — ' + i.desc.slice(0, lite ? 160 : 360) : ''} (${fmtDay(i.date)}) ${i.link || ''}`));
  if (prior.length) { L.push('', '### Notizie delle ultime settimane sullo stesso tema (dalla più vecchia)'); prior.slice(lite ? -8 : -18).forEach(i => L.push(`- ${fmtDay(i.date)} [${i.src || ''}] ${i.title}`)); }
  if (wiki.length) { L.push('', '### Voci di Wikipedia collegate'); wiki.forEach(w => L.push(`- ${w.title}: ${w.extract.slice(0, lite ? 450 : 900)} (${w.url || ''})`)); }
  return L.join('\n');
}

/* finestra di avanzamento */
async function generateWithProgress(title, run) {
  const lines = h('div', { class: 'gen-steps' });
  const bar = h('div', { class: 'small muted' });
  const err = h('div');
  const spin = h('div', { class: 'spin' });
  const close = openSheet(title, pad(h('div', { class: 'card' }, spin, lines, bar,
    P('Con il modello veloce di solito bastano 10-20 secondi.', 'small muted')), err), () => { onEngineProgress = null; });
  const log = t => { lines.append(h('div', null, '· ' + t)); };
  onEngineProgress = r => { const t = r.text || ''; bar.textContent = /fetch|download|cache/i.test(t) ? `Scarico il modello sul telefono: ${Math.round((r.progress || 0) * 100)}% (solo la prima volta, poi resta salvato)` : /load|gpu|shader/i.test(t) ? 'Avvio il modello…' : t.slice(0, 120); };
  try {
    const L = await run(log);
    onEngineProgress = null;
    if (L) { close(); toast('Lezione pronta'); openLesson(L.id); }
    return L;
  } catch (e) {
    onEngineProgress = null; spin.remove();
    err.replaceChildren(flat(h('b', null, 'Non sono riuscito a creare la lezione.'), P(e.message || String(e)),
      P('Puoi riprovare, cambiare modello in ⚙ oppure usare «Chiedi a Claude».', 'small muted')));
    return null;
  }
}
function needAI() {
  if (aiReady()) return true;
  openSheet('Serve il motore veloce', pad(card(
    P('Per creare al momento una lezione nuova serve una chiave gratuita di Groq: 10-20 secondi per una spiegazione completa, senza carta di credito.', ''),
    P('Senza chiave trovi comunque tutto ciò che la redazione prepara in anticipo e le schede istantanee delle notizie.', 'small muted'),
    h('button', { class: 'btn primary', onclick: () => { closeAllSheets(); settingsSheet(); } }, 'Inserisci la chiave'))));
  return false;
}
function saveGenerated(L, meta) {
  L.id = 'g-' + uid(); L.area = meta.area; L.kind = meta.kind; L.title = L.title || meta.title || 'Lezione';
  L.gen = { at: Date.now(), model: hasGroq() ? (S.ai.groqModel || GROQ_MODELS[0]) : S.ai.model, ref: meta.ref || null, topic: meta.topic || null };
  S.lessons[L.id] = L; save();
  contAdd({ type: 'lesson', id: L.id, title: L.title, area: L.area });
  return L;
}

/* ---------------- i quattro tipi di richiesta al momento ---------------- */
/* ---------------- scheda istantanea (senza IA, 1-3 secondi) ---------------- */
async function instantLesson(cluster) {
  const it = cluster.main;
  const [prior, ents] = await Promise.all([
    withTimeout(priorNews(it.title, 30), 6000).catch(() => []),
    withTimeout((async () => {
      const rs = await wikiSearch(keywords(it.title + ' ' + (it.desc || ''), 6).join(' '), 5);
      const out = await Promise.all(rs.map(r => wikiSummary(r.title).catch(() => null)));
      // solo nomi propri e sigle che compaiono davvero nel testo (niente voci per parole comuni)
      const txt = ' ' + it.title + ' ' + (it.desc || '') + ' ';
      const proper = t => t.split(/[\s()]+/).some(w => w.length > 2 && /^[A-ZÀ-Ý]/.test(w) && new RegExp('[^.!?:«"]\\s' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(txt));
      return out.filter(x => x && x.extract && x.type !== 'disambiguation' && proper(x.title));
    })(), 6000).catch(() => [])]);
  const chapters = [];
  chapters.push({ label: 'La notizia', title: it.title, depth: 'assaggio', blocks: [
    it.desc ? { type: 'text', md: it.desc } : null,
    cluster.items.length > 1 ? { type: 'steps', title: 'Come la raccontano ' + cluster.items.length + ' testate', items: cluster.items.slice(0, 8).map(x => ({ title: x.src || x.feed || 'Fonte', text: x.title + (x.desc ? ' — ' + x.desc.slice(0, 220) : '') })) } : null,
    { type: 'links', title: 'Leggi gli articoli', items: cluster.items.slice(0, 5).filter(x => x.link).map(x => ({ title: x.title, url: x.link, note: x.src || '' })) }
  ].filter(Boolean) });
  if (prior.length) chapters.push({ label: 'Antefatti', title: 'Cosa è successo prima', depth: 'assaggio', blocks: [
    { type: 'note', kind: 'contesto', md: 'Le notizie uscite nelle settimane precedenti sullo stesso tema, dalla più vecchia: tocca una data per aprirla.' },
    { type: 'timeline', events: prior.slice(-14).map(p => ({ year: fmtDay(p.date) || '', title: p.title, text: p.src ? 'Fonte: ' + p.src : '' })) }] });
  if (ents.length) chapters.push({ label: 'Chi e cosa', title: 'Le voci per capire', depth: 'assaggio', blocks: [
    { type: 'glossary', title: 'Persone, luoghi e istituzioni citati', items: ents.map(e => ({ term: e.title, def: e.extract.split(/(?<=\.)\s/).slice(0, 4).join(' ') })) }] });
  const geo = ents.filter(e => e.coordinates);
  if (geo.length) chapters.push({ label: 'Dove', title: 'I luoghi della notizia', depth: 'assaggio', blocks: [
    { type: 'map', title: 'Dove succede', places: geo.map(e => ({ name: e.title, lat: e.coordinates.lat, lon: e.coordinates.lon, note: e.description || '' })), groups: [] }] });
  return { title: it.title, summary: 'Scheda istantanea: fonti, antefatti e voci chiave raccolti in automatico.', tags: [], cards: [], branches: ents.slice(0, 4).map(e => ({ name: e.title, why: e.description || '' })), chapters };
}

/* notizia: pronta → subito; altrimenti scheda istantanea e, intanto, la spiegazione completa */
async function genNewsLesson(cluster, mode) {
  const it = cluster.main;
  const ready = prepForNews(it, mode);
  if (ready) { openPrepared(ready); return; }
  const mine = (lessonForRef(it.link) || []).find(l => !l.pending && (mode === 'full' ? l.chapters.length > 4 : true));
  if (mine) { openLesson(mine.id); return; }
  toast('Preparo la scheda…', 1500);
  const base = await instantLesson(cluster);
  const auto = autoAI();
  base.pending = auto ? (mode === 'quick' ? 'La spiegazione completa è in scrittura: arriva qui da sola tra pochi secondi.' : 'Il percorso completo è in scrittura: i capitoli arrivano uno alla volta.') : 'Questa è la scheda istantanea. La spiegazione completa arriverà con il prossimo giro della redazione (ogni due ore).';
  base.src = { main: it, items: cluster.items.slice(0, 8), mode };
  const L = saveGenerated(base, { area: 'mondo', kind: 'notizia', ref: it.link, title: it.title });
  openLesson(L.id);
  if (auto) completeNewsLesson(L, cluster, mode);
}
/* motori automatici: solo quelli veloci. Il modello sul telefono parte solo se lo chiedi (o se l'hai scelto in ⚙) */
const autoAI = () => hasGroq() || (S.ai.provider === 'gemini' && !!S.ai.key);
async function completeNewsLesson(L, cluster, mode) {
  const it = cluster.main;
  L.pending = 'La spiegazione completa è in scrittura…'; save(); window.dispatchEvent(new CustomEvent('lesson-updated', { detail: L.id }));
  try {
    const prior = await priorNews(it.title, mode === 'quick' ? 14 : 45).catch(() => []);
    const wiki = await wikiContext(it.title + ' ' + (it.desc || ''), 2);
    const quiet = () => { };
    let first = true;
    const full = await buildLesson(mode === 'quick' ? 'notizia_rapida' : 'notizia_completa', 'notizia', newsContext(cluster, prior, wiki), quiet, chs => {
      if (mode === 'quick') return;
      if (first) { first = false; L.instant = L.chapters; }
      L.chapters = chs.slice(); save(); window.dispatchEvent(new CustomEvent('lesson-updated', { detail: L.id }));
    });
    Object.assign(L, full, { title: full.title || it.title, pending: null, summary: full.summary || L.summary });
    L.gen.model = hasGroq() ? (S.ai.groqModel || GROQ_MODELS[0]) : S.ai.model;
    save(); window.dispatchEvent(new CustomEvent('lesson-updated', { detail: L.id }));
    toast('Spiegazione completa pronta');
  } catch (e) {
    L.pending = 'Non sono riuscito a scrivere la spiegazione completa (' + (e.message || e) + '). Resta la scheda istantanea; riprova più tardi.';
    save(); window.dispatchEvent(new CustomEvent('lesson-updated', { detail: L.id }));
  }
}
async function genTopicLesson(t) {
  if (!needAI()) return;
  const prev = (S.series[t.id] || []).map(id => S.lessons[id]?.title).filter(Boolean);
  return generateWithProgress(prev.length ? 'Più a fondo: ' + t.n : t.n, async log => {
    log('Raccolgo le basi');
    const ctx = await wikiContext(t.w || t.n, useLocal() ? 1 : 2);
    await loadPiani();
    const serie = prev.length ? `Questa è la puntata ${prev.length + 1} di una serie. Puntate già fatte: ${prev.map(x => '«' + x + '»').join(', ')}. Vai PIÙ A FONDO senza ripetere.` : 'È il primo incontro con l\'argomento.';
    const context = `Argomento: «${t.n}»${t.hk ? ' (' + t.hk + ')' : ''}. Livello del lettore: ${LEVEL_TXT()}. ${serie}\n` + ctx.map(w => `- ${w.title}: ${w.extract.slice(0, 600)}`).join('\n');
    const L = saveGenerated(await buildLesson('scoperta', 'scoperta', context, log), { area: 'scoperta', kind: 'passione', topic: t.id });
    (S.series[t.id] = S.series[t.id] || []).push(L.id);
    for (const b of L.branches || []) catalogAdd(b.name, t.c, b.why, t.id);
    save(); return L;
  });
}
async function genPaperLesson(w, abs, link) {
  if (!needAI()) return;
  return generateWithProgress('Spiegazione del paper', async log => {
    await loadPiani();
    const context = `Paper: «${stripTags(w.display_name)}» (${w.publication_year || ''}, ${w.primary_location?.source?.display_name || ''}). Link: ${link || ''}\nAbstract: ${abs.slice(0, useLocal() ? 1500 : 4000)}\nIl lettore è un ingegnere elettronico (RF, microonde, MMIC): usa il linguaggio del settore, spiega i concetti di altri campi. Per ciò che il paper afferma basati SOLO sull'abstract.`;
    return saveGenerated(await buildLesson('paper', 'paper', context, log), { area: 'lavoro', kind: 'tecnico', ref: link });
  });
}
async function genFaithLesson(kind, a, b) {
  if (!needAI()) return;
  return generateWithProgress(kind === 'bible' ? a : 'Domanda di fede', async log => {
    await loadPiani();
    const context = kind === 'bible'
      ? `Brano: ${a}${b ? ' («' + b + '»)' : ''}. Livello: ${LEVEL_TXT()}. Il lettore è un cattolico che vuole capire più a fondo.`
      : `Domanda di fede: «${a}». Livello: ${LEVEL_TXT()}. Il lettore è un cattolico che vuole capire il perché delle cose, con onestà intellettuale.`;
    return saveGenerated(await buildLesson(kind === 'bible' ? 'bibbia' : 'fede', kind === 'bible' ? 'bibbia' : 'fede', context, log), { area: 'fede', kind: 'fede' });
  });
}

/* riserva: lezione chiesta a Claude in chat */
function lessonPrompt(kind, subject, extra) {
  const PI = PIANI || {};
  return `Preparami una lezione interattiva per la mia app Ulisse su: «${subject}».
${extra ? 'Contesto: ' + extra + '\n' : ''}Livello: ${LEVEL_TXT()}. Tipo: ${kind}.
${PI.sys || ''}
Formato: un oggetto JSON con title, summary, tags, cards [{q,a}], branches [{name,why}], next e chapters, dove ogni capitolo è ${PI.schema_capitolo || '{label,title,depth,blocks}'}.
${PI.blocchi || ''}`;
}
