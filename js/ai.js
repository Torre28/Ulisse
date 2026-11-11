"use strict";
/* ======================================================================
   ULISSE · motore di generazione
   Due fonti, entrambe gratuite e senza limiti:
   1. la «redazione notturna» (GitHub Actions + modello aperto) che prepara
      ogni notte i contenuti in contenuti/indice.json;
   2. un modello che gira SUL TELEFONO, nel browser, con WebGPU (WebLLM),
      per le richieste al momento.
   Facoltativo: chiave personale Gemini, per chi la vuole.
   Le istruzioni sono condivise con la redazione in prompts/piani.json.
   ====================================================================== */

let PIANI = null;
async function loadPiani() { if (!PIANI) PIANI = await getJSON('prompts/piani.json'); return PIANI; }
const LEVEL_TXT = () => (PIANI ? PIANI.livelli[S.level] : '') || 'curioso con basi minime';

/* ---------------- contenuti preparati stanotte ---------------- */
let PREP = { items: [] };
async function loadPrep() {
  try { PREP = await getJSON('contenuti/indice.json?t=' + Math.floor(Date.now() / 600000)); PREP.items = PREP.items || []; }
  catch (e) { PREP = { items: [] }; }
  return PREP;
}
const prepLatest = () => { const ds = PREP.items.map(i => i.date).sort(); const d = ds[ds.length - 1]; return PREP.items.filter(i => i.date === d); };
async function openPrepared(item) {
  if (!S.lessons[item.id]) {
    try { const L = await getJSON(item.file); S.lessons[item.id] = L; save(); }
    catch (e) { toast('Non riesco a scaricare questa lezione'); return; }
  }
  openLesson(item.id);
}
function prepForNews(it) {
  const ts = tokenSet(it.title);
  return PREP.items.find(p => p.kind === 'notizia' && (p.ref === it.link || (p.headline && (() => { const o = tokenSet(p.headline); let n = 0; for (const x of ts) if (o.has(x)) n++; return n >= 3 && n / Math.min(ts.size, o.size) >= 0.5; })())));
}

/* ---------------- modello sul telefono (WebLLM, WebGPU) ---------------- */
let webllm = null, engine = null, engineModel = null, engineLoading = null, onEngineProgress = null;
const hasWebGPU = () => !!navigator.gpu;
async function loadWebLLM() {
  if (!webllm) webllm = await import('https://esm.run/@mlc-ai/web-llm');
  return webllm;
}
async function localModels() {
  const w = await loadWebLLM();
  let f16 = false;
  try { const ad = await navigator.gpu.requestAdapter(); f16 = !!(ad && ad.features.has('shader-f16')); } catch (e) { }
  const q = f16 ? 'q4f16_1' : 'q4f32_1';
  const ok = /^(Qwen3-(0\.6|1\.7|4)B|Qwen2\.5-(0\.5|1\.5|3)B-Instruct|gemma-2-2b-it|Llama-3\.2-(1|3)B-Instruct|Phi-3\.5-mini-instruct)/;
  return w.prebuiltAppConfig.model_list.filter(m => ok.test(m.model_id) && m.model_id.includes(q) && !/1k$/.test(m.model_id))
    .map(m => ({ id: m.model_id, mb: Math.round(m.vram_required_MB || 0) }))
    .sort((a, b) => a.mb - b.mb);
}
function defaultLocal(list) {
  const pick = re => (list.find(m => re.test(m.id)) || {}).id;
  return pick(/^Qwen3-1\.7B/) || pick(/^Qwen2\.5-1\.5B/) || pick(/^Qwen/) || (list[0] || {}).id;
}
async function getEngine() {
  if (engine && engineModel === S.ai.localModel) return engine;
  if (engineLoading) return engineLoading;
  if (!hasWebGPU()) throw new Error('Questo browser non supporta WebGPU: il modello sul telefono non può girare. Usa i contenuti preparati stanotte.');
  engineLoading = (async () => {
    const w = await loadWebLLM();
    if (!S.ai.localModel) { S.ai.localModel = defaultLocal(await localModels()); save(); }
    try { await navigator.storage?.persist?.(); } catch (e) { }
    if (engine) { try { await engine.unload(); } catch (e) { } }
    engine = await w.CreateMLCEngine(S.ai.localModel, { initProgressCallback: r => onEngineProgress && onEngineProgress(r) }, { context_window_size: 6144 });
    engineModel = S.ai.localModel; return engine;
  })();
  try { return await engineLoading; } finally { engineLoading = null; }
}
async function localCall(system, user, maxTok) {
  const e = await getEngine();
  const sys = /^Qwen3/.test(S.ai.localModel) ? system + '\n/no_think' : system;
  const r = await e.chat.completions.create({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.5, max_tokens: maxTok, response_format: { type: 'json_object' } });
  return r.choices[0].message.content || '';
}

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

/* ---------------- interfaccia comune ---------------- */
const useLocal = () => S.ai.provider !== 'gemini' || !S.ai.key;
const aiReady = () => useLocal() ? hasWebGPU() : !!S.ai.key;
async function aiText(system, user, maxTok) { return useLocal() ? localCall(system, user, maxTok) : geminiCall(system, user, maxTok); }
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
const KNOWN_BLOCKS = new Set(['text', 'note', 'steps', 'timeline', 'compare', 'glossary', 'quiz', 'slider', 'reflect', 'links']);
function cleanChapter(ch, p) {
  if (ch && ch.chapter && typeof ch.chapter === 'object') ch = ch.chapter;
  const blocks = (ch && Array.isArray(ch.blocks) ? ch.blocks : []).filter(b => b && KNOWN_BLOCKS.has(b.type));
  blocks.forEach(b => { if (b.type === 'quiz') b.correct = parseInt(b.correct, 10) || 0; });
  if (!blocks.length) throw new Error('capitolo vuoto');
  return { label: ch.label || p.label, title: ch.title || p.label, depth: p.depth, blocks };
}
async function buildLesson(planKey, metaKey, context, log) {
  const PI = await loadPiani();
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
  }
  if (!chapters.length) throw new Error('Il modello non è riuscito a scrivere la lezione. Riprova o scegli un modello più grande in ⚙.');
  log('Ultimi ritocchi: carte di ripasso e rami');
  let meta = {};
  try { meta = await aiJSON(PI.sys, `${context}\n\nLa lezione ha questi capitoli:\n${chapters.map(c => '- ' + c.label + ': ' + c.title).join('\n')}\n\nOra scrivi i metadati. ${PI.meta[metaKey]}\nRispondi con un JSON così: ${PI.schema_meta}`, 1400); } catch (e) { }
  return { title: meta.title, summary: meta.summary, tags: meta.tags || [], cards: (meta.cards || []).filter(c => c && c.q && c.a), branches: (meta.branches || []).filter(b => b && b.name), next: meta.next, chapters };
}

/* ---------------- contesti per ogni tipo di lezione ---------------- */
function newsContext(cluster, prior, wiki) {
  const it = cluster.main, lite = useLocal();
  const L = [`Livello del lettore: ${LEVEL_TXT()}. Oggi è il ${new Date().toLocaleDateString('it-IT')}.`, `NOTIZIA: «${it.title}»`, '', '### Come ne parlano le testate (oggi)'];
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
    P(useLocal() ? 'Il modello lavora sul telefono: tieni l\'app aperta. Una lezione breve richiede alcuni minuti.' : 'Di solito ci vuole meno di un minuto.', 'small muted')), err), () => { onEngineProgress = null; });
  const log = t => { lines.append(h('div', null, '· ' + t)); };
  onEngineProgress = r => { bar.textContent = (r.text || '').replace(/\[.*?\]\s*/, '').slice(0, 140); };
  try {
    const L = await run(log);
    onEngineProgress = null; close(); toast('Lezione pronta');
    openLesson(L.id); return L;
  } catch (e) {
    onEngineProgress = null; spin.remove();
    err.replaceChildren(flat(h('b', null, 'Non sono riuscito a creare la lezione.'), P(e.message || String(e)),
      P('Puoi riprovare, cambiare modello in ⚙ oppure usare «Chiedi a Claude».', 'small muted')));
    return null;
  }
}
function needAI() {
  if (aiReady()) return true;
  openSheet('Modello sul telefono non disponibile', pad(card(
    P(hasWebGPU() ? 'Configura il motore in ⚙.' : 'Questo browser non supporta WebGPU, che serve per far girare il modello direttamente sul telefono. Su Android usa Chrome aggiornato; su iPhone serve iOS 26 o successivo.', ''),
    P('Nel frattempo trovi i contenuti preparati stanotte in Oggi, Notizie, Scopri e Specchio. In ⚙ puoi anche inserire una chiave Gemini facoltativa.', 'small muted'),
    h('button', { class: 'btn primary', onclick: () => { document.querySelectorAll('.sheet-bg').forEach(e => e.remove()); settingsSheet(); } }, 'Apri le impostazioni'))));
  return false;
}
function saveGenerated(L, meta) {
  L.id = 'g-' + uid(); L.area = meta.area; L.kind = meta.kind; L.title = L.title || meta.title || 'Lezione';
  L.gen = { at: Date.now(), model: useLocal() ? S.ai.localModel : S.ai.model, ref: meta.ref || null, topic: meta.topic || null };
  S.lessons[L.id] = L; save();
  contAdd({ type: 'lesson', id: L.id, title: L.title, area: L.area });
  return L;
}

/* ---------------- i quattro tipi di richiesta al momento ---------------- */
async function genNewsLesson(cluster, mode) {
  if (!needAI()) return;
  const it = cluster.main;
  return generateWithProgress(mode === 'quick' ? 'Capire al volo' : 'Percorso completo', async log => {
    log('Cerco gli antefatti delle ultime settimane');
    const prior = await priorNews(it.title, mode === 'quick' ? 14 : 45).catch(() => []);
    log('Leggo il contesto su Wikipedia');
    const wiki = await wikiContext(it.title + ' ' + (it.desc || ''), mode === 'quick' || useLocal() ? 2 : 4);
    if (useLocal()) log('Preparo il modello sul telefono');
    const L = await buildLesson(mode === 'quick' ? 'notizia_rapida' : 'notizia_completa', 'notizia', newsContext(cluster, prior, wiki), log);
    return saveGenerated(L, { area: 'mondo', kind: 'notizia', ref: it.link, title: it.title });
  });
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
