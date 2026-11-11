"use strict";
/* ======================================================================
   ULISSE · motore di generazione
   Usa un modello linguistico gratuito con la chiave personale
   dell'utente (Gemini, piano gratuito di Google AI Studio, oppure
   OpenRouter con i modelli «:free»). La chiave resta solo sul telefono.
   ====================================================================== */

const GEM = 'https://generativelanguage.googleapis.com/v1beta';
const aiReady = () => (S.ai.provider === 'gemini' && S.ai.key) || (S.ai.provider === 'openrouter' && S.ai.orKey);

async function geminiModels(key) {
  const j = await getJSON(`${GEM}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  const ok = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini|gemma/i.test(m.name) && !/image|tts|audio|live|embed|vision|robotics|computer|native/i.test(m.name));
  const ver = n => { const m = n.match(/(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  // preferisci il Flash più recente (miglior equilibrio qualità/limiti gratuiti), poi Flash-Lite
  const score = n => ver(n) * 10 + (/flash(?!-lite)/i.test(n) ? 3 : /flash-lite/i.test(n) ? 2 : /gemma/i.test(n) ? 0 : 1) - (/preview|exp/i.test(n) ? 0.5 : 0);
  return ok.map(m => m.name.replace(/^models\//, '')).sort((a, b) => score(b) - score(a));
}

async function geminiCall(system, user, maxTok) {
  let model = S.ai.model;
  if (!model) { const ms = await geminiModels(S.ai.key); model = ms[0]; if (!model) throw new Error('nessun modello disponibile per questa chiave'); S.ai.model = model; save(); }
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.55, maxOutputTokens: maxTok, responseMimeType: 'application/json' }
  };
  const r = await fetchT(`${GEM}/models/${model}:generateContent?key=${encodeURIComponent(S.ai.key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 150000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || ('HTTP ' + r.status);
    if (r.status === 429) throw Object.assign(new Error('Limite gratuito raggiunto per ora. Riprova tra qualche minuto (o domani).'), { quota: true });
    if (r.status === 404) { S.ai.model = ''; save(); }
    throw new Error(msg);
  }
  const parts = j.candidates?.[0]?.content?.parts || [];
  const txt = parts.filter(p => !p.thought).map(p => p.text || '').join('');
  if (!txt) throw new Error('risposta vuota (' + (j.candidates?.[0]?.finishReason || 'sconosciuto') + ')');
  return txt;
}

async function openrouterCall(system, user, maxTok) {
  const r = await fetchT('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.ai.orKey, 'X-Title': 'Ulisse' },
    body: JSON.stringify({ model: S.ai.orModel || 'openrouter/free', max_tokens: maxTok, temperature: 0.55, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  }, 150000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 429) throw Object.assign(new Error('Limite gratuito di OpenRouter raggiunto per oggi.'), { quota: true }); throw new Error(j.error?.message || ('HTTP ' + r.status)); }
  return j.choices?.[0]?.message?.content || '';
}

async function aiText(system, user, maxTok = 16000) {
  const order = S.ai.provider === 'openrouter' ? ['openrouter', 'gemini'] : ['gemini', 'openrouter'];
  let last;
  for (const p of order) {
    if (p === 'gemini' && !S.ai.key) continue;
    if (p === 'openrouter' && !S.ai.orKey) continue;
    try { return p === 'gemini' ? await geminiCall(system, user, maxTok) : await openrouterCall(system, user, maxTok); }
    catch (e) { last = e; if (!e.quota) break; } // se finisce la quota, prova l'altro fornitore
  }
  throw last || new Error('Nessun motore configurato');
}

function parseJSONLoose(txt) {
  let t = String(txt).replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); }
  catch (e) { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"')); }
}
async function aiJSON(system, user, maxTok) {
  const txt = await aiText(system, user, maxTok);
  try { return parseJSONLoose(txt); }
  catch (e) { // un secondo tentativo, chiedendo solo di correggere il JSON
    const fix = await aiText('Correggi il JSON che ricevi perché sia valido. Rispondi solo con il JSON corretto, senza commenti.', txt.slice(0, 60000), maxTok);
    return parseJSONLoose(fix);
  }
}

/* ---------------- regole comuni a tutte le lezioni ---------------- */
const SYS = `Sei l'autore delle lezioni di «Ulisse», un'app personale di un ingegnere elettronico italiano (laurea magistrale, molto curioso) che nel tempo libero vuole capire meglio il mondo, la storia e la fede cristiana. Scrivi in italiano chiaro e vivo, mai scolastico, con frasi brevi.
Regole:
- Spiega ogni passaggio: chi legge deve poter capire senza conoscenze pregresse sul tema. Se citi un evento, un'istituzione o una persona, dì in una frase chi o cos'è.
- Distingui sempre i fatti dalle interpretazioni e dalle ipotesi (usa i blocchi "note" con kind fatto, contesto, ipotesi, attenzione).
- Per i fatti recenti usa SOLO le fonti fornite nel messaggio. Se un'informazione non c'è, dillo invece di inventarla.
- Per la storia usa conoscenze consolidate. Non inventare date, numeri o citazioni: se non sei sicuro scrivi "circa" o dichiaralo.
- Su temi politici o controversi presenta in modo equilibrato le posizioni principali con le loro ragioni migliori, senza prendere parte. Valuta i politici su quello che hanno fatto e detto, con fonti.
- Non copiare frasi degli articoli: riformula sempre.
- Usa blocchi interattivi dove aiutano davvero a capire (timeline, compare, steps, quiz, slider, glossary).
- Rispondi SOLO con un oggetto JSON valido, secondo lo schema indicato.`;

const SCHEMA_TXT = `{
 "title": "titolo", "summary": "una frase", "tags": ["2-5 parole chiave"],
 "chapters": [ { "label": "etichetta breve", "title": "titolo del capitolo", "depth": "assaggio|profondo", "blocks": [ BLOCCHI ] } ],
 "cards": [ { "q": "domanda di ripasso", "a": "risposta in 1-2 frasi" } ],
 "branches": [ { "name": "argomento collegato da esplorare", "why": "perché è collegato, una frase" } ],
 "next": "titolo del prossimo approfondimento naturale"
}
BLOCCHI disponibili:
{ "type":"text", "md":"paragrafi separati da riga vuota, **grassetto**, elenchi con - " }
{ "type":"note", "kind":"fatto|contesto|ipotesi|attenzione", "md":"testo breve" }
{ "type":"steps", "title":"…", "items":[ {"title":"…","text":"…"} ] }
{ "type":"timeline", "title":"…", "events":[ {"year":"1946 o 12 ott 2026","title":"…","text":"…"} ] }
{ "type":"compare", "title":"…", "left":{"title":"…","points":["…"]}, "right":{"title":"…","points":["…"]}, "common":["…"] }
{ "type":"glossary", "title":"…", "items":[ {"term":"…","def":"…"} ] }
{ "type":"quiz", "q":"…", "options":["…","…","…"], "correct":0, "explain":"…" }
{ "type":"slider", "title":"…", "label":"…", "min":0, "max":10, "step":1, "value":5, "unit":"", "vars":{"N":100}, "outputs":[{"label":"…","expr":"espressione in x e vars: + - * / ( ) ?: < > == && || min max round ceil floor abs sqrt pow","unit":""}], "note":"…" }
{ "type":"reflect", "prompt":"domanda aperta personale" }
{ "type":"links", "title":"…", "items":[ {"title":"…","url":"https://…","note":"…"} ] }   (usa solo URL ricevuti nelle fonti o voci di it.wikipedia.org che sei certo esistano)`;

const LEVEL = ['', 'principiante assoluto: spiegazioni semplicissime, niente gergo', 'curioso con basi minime', 'intermedio: può reggere qualche dettaglio tecnico', 'avanzato: dettagli, numeri e dibattiti tra studiosi', 'esperto: profondità massima e fonti primarie'];

function srcBlock(title, list, fmt) { return list && list.length ? `\n### ${title}\n` + list.map(fmt).join('\n') : ''; }

/* ---------------- percorsi sulle notizie ---------------- */
function newsPrompt(cluster, prior, wiki, mode) {
  const it = cluster.main;
  const fonti = srcBlock('Come ne parlano le testate (oggi)', cluster.items.slice(0, 8), i => `- [${i.src || i.feed || ''}] ${i.title}${i.desc ? ' — ' + i.desc : ''} (${fmtDay(i.date)}) ${i.link || ''}`);
  const ante = srcBlock('Notizie degli ultimi 30 giorni sullo stesso tema (dal più vecchio)', prior, i => `- ${fmtDay(i.date)} [${i.src || ''}] ${i.title}`);
  const wk = srcBlock('Voci di Wikipedia collegate', wiki, w => `- ${w.title}: ${w.extract} (${w.url})`);
  const quick = `Crea un «Capire al volo» (5-10 minuti) con 3 capitoli, tutti "assaggio":
1. "Cosa è successo": la notizia in parole semplici e, in una timeline, gli antefatti dei giorni e delle settimane prima presi dalle fonti (proteste, decisioni, dichiarazioni) che servono per capirla.
2. "Le parole per capire": glossary con istituzioni, leggi, sigle e persone citate; poi steps se c'è un meccanismo (es. come passa una legge).
3. "Perché conta": a chi cambia qualcosa, cosa dicono le parti in causa, un quiz.`;
  const full = `Crea un «Percorso completo» guidato (30-90 minuti) che parte dalla notizia, scende nella storia e torna al presente. Capitoli in quest'ordine:
1. "La notizia" (assaggio): cosa è successo, confrontando come la raccontano testate diverse; note di tipo fatto per ciò che è certo.
2. "Antefatti" (assaggio): timeline dettagliata degli eventi recenti (giorni, settimane, mesi) che hanno portato a oggi, usando le fonti; spiega cause e passaggi intermedi.
3. "Capire" (assaggio): glossary e steps su istituzioni, regole, meccanismi e termini necessari.
4. "Gli attori" (profondo): chi sono i protagonisti (persone, partiti, Stati, gruppi), cosa vogliono, cosa hanno detto e fatto in passato su questo tema; segnala coerenze e contraddizioni solo se documentate, con equilibrio.
5. "La storia" (profondo): scegli 1-2 precedenti storici davvero pertinenti (non collegati solo da una parola). Per ciascuno: il mondo e l'Italia di allora (situazione politica, economica, geopolitica, sociale) in modo che si capisca anche senza saperne nulla, cosa successe passo per passo (timeline), come finì e cosa lasciò.
6. "Parallelismi" (profondo): compare tra il precedente storico e il presente; analogie e soprattutto differenze; cosa insegna e dove il paragone non regge (note di tipo attenzione).
7. "Scenari" (profondo): 2-3 scenari plausibili per i prossimi mesi o anni, ciascuno con premesse, cosa dovrebbe succedere perché si avveri e «segnali da osservare» nelle notizie; note di tipo ipotesi; chiudi con un reflect.
Aggiungi un quiz in almeno tre capitoli e 6-10 cards. In "branches" proponi 4 temi storici o concettuali da approfondire.`;
  return `Livello del lettore: ${LEVEL[S.level]}. Oggi è ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
NOTIZIA: «${it.title}»
${mode === 'quick' ? quick : full}
FONTI (usale per i fatti recenti, cita i link più utili in un blocco links nell'ultimo capitolo):${fonti}${ante}${wk}

Schema JSON:
${SCHEMA_TXT}`;
}

/* ---------------- scoperta di un argomento ---------------- */
function topicPrompt(t, prevTitles, ctx) {
  const serie = prevTitles && prevTitles.length ? `Questa è la puntata ${prevTitles.length + 1} di una serie in verticale. Puntate già fatte: ${prevTitles.map(x => '«' + x + '»').join(', ')}. Vai PIÙ A FONDO senza ripetere, partendo da dove si è arrivati.` : 'È il primo incontro con l\'argomento: deve far venire voglia di saperne di più.';
  return `Argomento: «${t.n}»${t.hk ? ' (' + t.hk + ')' : ''}.
Livello del lettore: ${LEVEL[S.level]}. ${serie}
Crea una lezione di scoperta per il tempo libero: divertente, sorprendente, concreta. 4-5 capitoli:
1. Il gancio (assaggio): una storia, un paradosso o una domanda che incuriosisce.
2-3. Come funziona / come è andata (assaggio o profondo secondo il livello): con almeno due blocchi interattivi (timeline, slider con un modello numerico vero, compare, steps, quiz).
4. Prova tu (assaggio): un'attività concreta da fare nel mondo reale, anche piccola (osservare, costruire, visitare, ascoltare), e un reflect.
5. Per andare oltre (assaggio): links solo a voci Wikipedia sicure, e cosa cercare (libri, podcast, luoghi, corsi in Italia).
In "branches" 5 argomenti collegati anche lontani (per esplorare in orizzontale). In "next" il titolo della puntata successiva (per scendere in verticale). 5-8 cards.
${srcBlock('Base da Wikipedia', ctx, w => `- ${w.title}: ${w.extract}`)}

Schema JSON:
${SCHEMA_TXT}`;
}

/* ---------------- paper tecnico ---------------- */
function paperPrompt(w, abs, link) {
  return `Paper: «${stripTags(w.display_name)}» (${w.publication_year || ''}, ${w.primary_location?.source?.display_name || ''}). Link: ${link || ''}
Abstract: ${abs}
Il lettore è un ingegnere elettronico specializzato in RF, microonde e MMIC: puoi usare il linguaggio tecnico del settore, ma spiega i concetti di altri campi.
Crea una lezione che renda il paper facile da assimilare. Capitoli: "L'idea in una frase" (assaggio), "Il problema" (assaggio), "Come funziona" (profondo: spiega fisicamente e graficamente cosa succede, con steps e, se ha senso, uno slider con una relazione numerica del settore), "Risultati e numeri" (assaggio: solo quelli dell'abstract, non inventarne), "Limiti e domande aperte" (profondo, con note ipotesi e un reflect su come si collega al lavoro del lettore). 5-8 cards. Basati SOLO sull'abstract per ciò che il paper afferma; il contesto generale puoi spiegarlo tu dichiarandolo.

Schema JSON:
${SCHEMA_TXT}`;
}

/* ---------------- fede ---------------- */
function biblePrompt(ref, title) {
  return `Brano: ${ref}${title ? ' («' + title + '»)' : ''}.
Livello: ${LEVEL[S.level]}. Il lettore è un cattolico praticante che vuole capire più a fondo.
Crea una lezione su questo brano. Non riportare il testo integrale (è protetto): riassumilo e cita al massimo brevi espressioni. Capitoli:
1. "Il brano in breve" (assaggio): cosa racconta, scena per scena (steps).
2. "Il contesto" (assaggio): chi lo ha scritto, quando, per chi, in quale situazione storica, politica e religiosa (timeline), genere letterario.
3. "Le parole chiave" (profondo): glossary con i termini decisivi e, dove utile, il significato dell'ebraico o del greco.
4. "Come lo ha letto la Chiesa" (profondo): Padri della Chiesa, liturgia, Catechismo della Chiesa Cattolica (indica i numeri dei paragrafi solo se sei sicuro), collegamenti con altri passi biblici.
5. "Per la tua vita" (assaggio): cosa può dire oggi, una proposta concreta e un reflect.
Aggiungi un links con: https://www.bibbiaedu.it/ (testo CEI) e https://www.vatican.va/archive/catechism_it/index_it.htm . 5-8 cards. In "branches" 4 brani o temi collegati.

Schema JSON:
${SCHEMA_TXT}`;
}
function faithPrompt(q) {
  return `Domanda di fede: «${q}».
Livello: ${LEVEL[S.level]}. Il lettore è un cattolico che vuole capire il perché delle cose, con onestà intellettuale.
Crea una lezione: "La domanda" (assaggio: perché è seria, anche le obiezioni migliori), "Cosa dice la Scrittura" (con riferimenti precisi ai passi), "Cosa insegna la Chiesa" (Catechismo e magistero, numeri dei paragrafi solo se certi), "Come ci hanno pensato" (timeline di grandi pensatori e santi), "Domande aperte e obiezioni" (compare tra obiezione e risposta, onesto su ciò che resta mistero), "Per la vita" (reflect). Usa note per distinguere dottrina definita, insegnamento comune e opinioni teologiche. 5-8 cards; in "branches" 4 domande collegate.

Schema JSON:
${SCHEMA_TXT}`;
}

/* ---------------- dalla risposta del modello a una lezione salvata ---------------- */
function normalizeLesson(L, meta) {
  if (!L || !Array.isArray(L.chapters) || !L.chapters.length) throw new Error('la lezione generata è incompleta');
  L.id = meta.id || ('g-' + uid());
  L.area = meta.area || 'scoperta'; L.kind = meta.kind || 'passione';
  L.title = L.title || meta.title || 'Lezione';
  L.gen = { at: Date.now(), model: S.ai.provider === 'gemini' ? S.ai.model : S.ai.orModel, ref: meta.ref || null, topic: meta.topic || null };
  L.chapters = L.chapters.filter(c => c && Array.isArray(c.blocks));
  S.lessons[L.id] = L; save();
  return L;
}

/* finestra di avanzamento: mostra i passi mentre la lezione si prepara */
async function generateWithProgress(title, steps, run) {
  const list = h('div', { class: 'gen-steps' });
  const err = h('div');
  const close = openSheet(title, pad(h('div', { class: 'card' }, h('div', { class: 'spin' }), list, h('p', { class: 'small muted', style: { margin: 0 } }, 'Il modello gratuito può impiegare da 20 secondi a un paio di minuti. Puoi chiudere: la lezione verrà salvata nel Quaderno.')), err));
  const mark = (i, ok) => { list.replaceChildren(...steps.map((s, k) => h('div', { class: k < i || ok ? 'ok' : '' }, (k < i || ok ? '✓ ' : k === i ? '… ' : '· ') + s))); };
  mark(0);
  try {
    const L = await run(i => mark(i));
    close(); toast('Lezione pronta');
    openLesson(L.id); return L;
  } catch (e) {
    err.replaceChildren(h('div', { class: 'card flat' }, h('b', null, 'Non sono riuscito a creare la lezione.'), h('p', { class: 'small', style: { margin: 0 } }, e.message || String(e)),
      h('p', { class: 'small muted', style: { margin: 0 } }, 'Puoi riprovare più tardi, controllare la chiave in ⚙, oppure usare «Chiedi a Claude».')));
    $('.spin', list.parentElement)?.remove();
    return null;
  }
}
function needAI() {
  if (aiReady()) return true;
  openSheet('Attiva il motore gratuito', pad(h('div', { class: 'card' },
    h('p', { style: { margin: 0 } }, 'Per creare lezioni direttamente nell\'app serve una chiave gratuita di un modello linguistico. Ci vogliono due minuti e nessuna carta di credito.'),
    h('ol', { class: 'small', style: { margin: 0, paddingLeft: '1.2em' } },
      h('li', null, 'Apri ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'Google AI Studio'), ' e accedi con il tuo account Google.'),
      h('li', null, 'Premi «Create API key» e copia la chiave.'),
      h('li', null, 'Incollala in ⚙ → Motore delle lezioni.')),
    h('p', { class: 'small muted', style: { margin: 0 } }, 'Nel piano gratuito Google può usare i testi inviati per migliorare i suoi modelli: non inserire dati personali nelle richieste.'),
    h('button', { class: 'btn primary', onclick: () => { document.querySelectorAll('.sheet-bg').forEach(e => e.remove()); settingsSheet(); } }, 'Apri le impostazioni'))));
  return false;
}

async function genNewsLesson(cluster, mode) {
  if (!needAI()) return;
  const it = cluster.main;
  return generateWithProgress(mode === 'quick' ? 'Capire al volo' : 'Percorso completo',
    ['Cerco gli antefatti degli ultimi 30 giorni', 'Leggo il contesto su Wikipedia', 'Scrivo ' + (mode === 'quick' ? 'la spiegazione' : 'il percorso: storia, parallelismi, scenari')],
    async step => {
      const prior = await priorNews(it.title, mode === 'quick' ? 14 : 45).catch(() => []);
      step(1); const wiki = await wikiContext(it.title + ' ' + (it.desc || ''), mode === 'quick' ? 2 : 4);
      step(2); const L = await aiJSON(SYS, newsPrompt(cluster, prior, wiki, mode), mode === 'quick' ? 8000 : 24000);
      const out = normalizeLesson(L, { area: 'mondo', kind: 'notizia', ref: it.link, title: it.title });
      contAdd({ type: 'lesson', id: out.id, title: out.title, area: 'mondo' });
      return out;
    });
}
async function genTopicLesson(t) {
  if (!needAI()) return;
  const prev = (S.series[t.id] || []).map(id => S.lessons[id]?.title).filter(Boolean);
  return generateWithProgress(prev.length ? 'Più a fondo: ' + t.n : t.n, ['Raccolgo le basi', 'Scrivo la lezione interattiva'], async step => {
    const ctx = await wikiContext(t.w || t.n, 2);
    step(1); const L = await aiJSON(SYS, topicPrompt(t, prev, ctx), 16000);
    const out = normalizeLesson(L, { area: 'scoperta', kind: 'passione', topic: t.id });
    (S.series[t.id] = S.series[t.id] || []).push(out.id);
    for (const b of L.branches || []) if (b && b.name) catalogAdd(b.name, t.c, b.why, t.id);
    save(); contAdd({ type: 'lesson', id: out.id, title: out.title, area: 'scoperta' });
    return out;
  });
}
async function genPaperLesson(w, abs, link) {
  if (!needAI()) return;
  return generateWithProgress('Spiegazione del paper', ['Leggo l\'abstract', 'Scrivo la spiegazione'], async step => {
    step(1); const L = await aiJSON(SYS, paperPrompt(w, abs, link), 14000);
    const out = normalizeLesson(L, { area: 'lavoro', kind: 'tecnico', ref: link });
    contAdd({ type: 'lesson', id: out.id, title: out.title, area: 'lavoro' }); return out;
  });
}
async function genFaithLesson(kind, a, b) {
  if (!needAI()) return;
  return generateWithProgress(kind === 'bible' ? a : 'Domanda di fede', ['Raccolgo le fonti', 'Scrivo la lezione'], async step => {
    step(1); const L = await aiJSON(SYS, kind === 'bible' ? biblePrompt(a, b) : faithPrompt(a), 14000);
    const out = normalizeLesson(L, { area: 'fede', kind: 'fede' });
    contAdd({ type: 'lesson', id: out.id, title: out.title, area: 'fede' }); return out;
  });
}
