"use strict";
/* ======================================================================
   ULISSE · sezioni dell'app, lettore audio, impostazioni, navigazione
   ====================================================================== */

const app = $('#app');
const card = (...k) => h('div', { class: 'card' }, ...k);
const flat = (...k) => h('div', { class: 'card flat' }, ...k);
const P = (t, cls) => h('p', { class: cls || 'small', style: { margin: 0 } }, t);
function header(title, sub) {
  return h('div', { class: 'top' }, h('div', null, sub && h('div', { class: 'eyebrow' }, sub), h('h1', null, title)),
    h('button', { class: 'iconbtn', 'aria-label': 'Impostazioni', onclick: settingsSheet }, '⚙'));
}
function netError(where) {
  return flat(h('b', null, 'Non riesco a raggiungere ' + where + '.'),
    P('Controlla la connessione. Se stai usando l\'anteprima dentro Claude è normale: lì la pagina non può collegarsi ad altri siti.', 'small muted'));
}
const tabs = (list, cur, set) => h('div', { class: 'scrollx' }, list.map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': k === cur ? 'true' : 'false', onclick: () => { set(k); render(); } }, l)));
const linkBtn = (href, label, cls) => h('a', { class: 'btn small ' + (cls || ''), href, target: '_blank', rel: 'noopener' }, label);

/* ======================= LETTORE AUDIO ======================= */
const AUD = new Audio(); AUD.preload = 'none';
let nowEp = null, playerEl = null;
function playEp(ep, area) {
  if (nowEp && nowEp.url === ep.url) { AUD.paused ? AUD.play() : AUD.pause(); return; }
  nowEp = ep; AUD.src = ep.url; AUD.play().catch(() => toast('Non riesco a riprodurre questo episodio'));
  addLog(area || 'mondo', 'ascolto', (ep.show ? ep.show + ' · ' : '') + ep.title, 1);
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: ep.title, artist: ep.show || '', artwork: ep.art ? [{ src: ep.art, sizes: '160x160' }] : [] });
    navigator.mediaSession.setActionHandler('seekbackward', () => { AUD.currentTime -= 15; });
    navigator.mediaSession.setActionHandler('seekforward', () => { AUD.currentTime += 30; });
  } catch (e) { }
  drawPlayer();
}
function drawPlayer() {
  if (!nowEp) return;
  if (!playerEl) { playerEl = h('div', { class: 'player' }); document.body.append(playerEl); document.documentElement.style.setProperty('--player-h', '62px'); }
  const bar = h('div', { class: 'pbar' });
  const btn = h('button', { class: 'iconbtn', 'aria-label': 'Play/pausa', onclick: () => AUD.paused ? AUD.play() : AUD.pause() }, AUD.paused ? '▶' : '❚❚');
  playerEl.replaceChildren(bar, nowEp.art ? h('img', { src: nowEp.art, alt: '', onerror: e => e.target.remove() }) : null,
    h('div', { class: 'pt' }, h('b', null, nowEp.title), h('span', null, nowEp.show || '')),
    h('button', { class: 'iconbtn', 'aria-label': 'Indietro 15 secondi', onclick: () => { AUD.currentTime = Math.max(0, AUD.currentTime - 15); } }, '↺'), btn,
    h('button', { class: 'iconbtn', 'aria-label': 'Chiudi', onclick: () => { AUD.pause(); nowEp = null; playerEl.remove(); playerEl = null; document.documentElement.style.setProperty('--player-h', '0px'); } }, '✕'));
  AUD.ontimeupdate = () => { if (AUD.duration) bar.style.width = (AUD.currentTime / AUD.duration * 100) + '%'; };
  AUD.onplay = AUD.onpause = () => { btn.textContent = AUD.paused ? '▶' : '❚❚'; };
}
function epRow(ep, area) {
  return h('div', { class: 'ep' }, ep.art ? h('img', { src: ep.art, alt: '', loading: 'lazy', onerror: e => { e.target.style.visibility = 'hidden'; } }) : h('span'),
    h('div', null, h('b', null, ep.title), h('span', null, [ep.show, fmtDay(ep.date), ep.dur ? ep.dur + ' min' : null].filter(Boolean).join(' · '))),
    h('button', { class: 'btn small primary', 'aria-label': 'Ascolta', onclick: () => playEp(ep, area) }, '▶'));
}
function episodesBox(loader, area, emptyMsg) {
  const box = h('div', null, h('div', { class: 'spin' }));
  loader().then(eps => box.replaceChildren(...(eps.length ? eps.map(e => epRow(e, area)) : [h('div', { class: 'empty small' }, emptyMsg || 'Nessun episodio trovato.')]))).catch(() => box.replaceChildren(netError('Apple Podcasts')));
  return box;
}

/* ======================= OGGI ======================= */
function contRow(c) {
  const open = () => {
    if (c.type === 'lesson') openLesson(c.id);
    else if (c.type === 'topic') openTopic(c.id);
    else if (c.type === 'episode') playEp(c.ep);
  };
  return h('div', { class: 'row', style: { borderTop: '1px solid var(--soft)', paddingTop: '8px', flexWrap: 'nowrap' } },
    h('span', { class: 'dotc', style: { background: areaColor(c.area) } }),
    h('button', { class: 'grow', style: { all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }, onclick: open },
      h('div', { class: 'small', style: { fontWeight: 600 } }, c.title), h('span', { class: 'mono' }, { lesson: 'lezione', topic: 'argomento', episode: 'episodio' }[c.type] + ' · ' + fmtDay(c.t))),
    h('button', { class: 'btn small ghost', 'aria-label': 'Togli', onclick: () => { contDone(c.type, c.id); render(); } }, '✕'));
}
function viewOggi() {
  ensureTodayQuests();
  const d = today();
  const qs = S.quests.filter(q => q.d === d || (!q.done && q.src === 'io'));
  const main = qs.filter(q => q.type === 'main'), side = qs.filter(q => q.type === 'side');
  const b = balance(14), max = Math.max(1, ...Object.values(b));
  const due = dueCards().length;
  const hr = new Date().getHours();
  const hello = hr < 12 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const dt = dailyTopic();
  const ho = currentHour();
  const questEl = q => h('div', { class: 'quest' + (q.done ? ' done' : '') },
    h('button', { class: 'check' + (q.done ? ' on' : ''), 'aria-label': q.done ? 'Segna da fare' : 'Segna fatta', onclick: () => {
      q.done = !q.done;
      if (q.done) addLog(q.area, 'missione', q.t, q.type === 'main' ? 3 : 1); else { const i = S.log.findIndex(e => e.kind === 'missione' && e.title === q.t && e.d === d); if (i >= 0) S.log.splice(i, 1); }
      save(); render();
    } }, q.done ? '✓' : ''),
    h('div', null, h('div', { class: 'qt' }, q.t), h('div', { class: 'qmeta' }, areaTag(q.area), h('span', { class: 'tag muted' }, q.src === 'app' ? 'dall\'app' : 'tua'), q.d !== d && h('span', { class: 'tag muted' }, 'in sospeso')),
      q.why && !q.done && h('div', { class: 'small muted', style: { marginTop: '4px' } }, q.why)),
    h('button', { class: 'btn small ghost', 'aria-label': 'Cambia o elimina', onclick: () => {
      if (q.src === 'app') { q.t = pickQuest(q.area, q.type, q.t); q.done = false; } else { S.quests = S.quests.filter(x => x !== q); }
      save(); render();
    } }, q.src === 'app' ? '↻' : '✕'));
  return [
    header(`${hello}, ${S.name}`, new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })),
    !storageOk && flat(P('Attenzione: questo browser non sta salvando i dati. Usa l\'app installata.')),
    card(h('div', { class: 'row between' }, h('h2', null, 'Missioni'), h('button', { class: 'btn small', onclick: addQuestSheet }, '+ La mia')),
      h('span', { class: 'mono' }, 'Main quest'), main.length ? main.map(questEl) : h('div', { class: 'empty' }, 'Nessuna'),
      h('span', { class: 'mono' }, 'Side quest'), side.length ? side.map(questEl) : h('div', { class: 'empty' }, 'Nessuna')),
    h('div', { class: 'row' },
      h('button', { class: 'btn grow' + (due ? ' primary' : ''), onclick: reviewSheet }, due ? `Ripassa ${due} carte` : 'Nessun ripasso oggi'),
      h('button', { class: 'btn grow', onclick: () => go('specchio') }, '✝ ' + ho.n)),
    S.cont.length ? card(h('div', { class: 'row between' }, h('h2', null, 'Da continuare'), S.cont.length > 4 && h('button', { class: 'btn small ghost', onclick: () => { qTab = 'cont'; go('quaderno'); } }, 'tutto')), S.cont.slice(0, 4).map(contRow)) : null,
    h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openTopic(dt.id) },
      h('span', { class: 'mono' }, 'Scoperta del giorno · ' + dt.c), h('h3', null, dt.n), dt.hk && P(dt.hk)),
    card(h('div', { class: 'row between' }, h('h2', null, 'Equilibrio'), h('span', { class: 'mono' }, 'ultimi 14 giorni')),
      Object.keys(AREAS).map(a => h('div', { class: 'bar' }, h('span', null, AREAS[a].n), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: (b[a] / max * 100) + '%', background: areaColor(a) } })), h('span', { class: 'n' }, b[a]))),
      P('Le missioni dell\'app puntano alle aree più scoperte. Main quest 3 punti, side quest 1, lezioni 2, letture e ascolti meno.', 'small muted'))
  ];
}

/* ======================= NOTIZIE ======================= */
let newsTab = 'Principali', newsCache = {};
function viewNotizie() {
  const tl = NEWS_TAGS.map(t => [t, t]).concat([['temi', 'I miei temi'], ['ascolta', '🎧 Ascolta'], ['percorsi', 'Percorsi']]);
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  if (newsTab === 'ascolta') body.append(...viewPodcasts());
  else if (newsTab === 'percorsi') {
    const ls = Object.values(allLessons()).filter(l => l.kind === 'notizia').sort((a, b) => (b.gen?.at || 0) - (a.gen?.at || 0));
    body.append(P('Le lezioni nate dalle notizie: «Capire al volo» e «Percorso completo».', 'small muted'), ...ls.map(lessonCard), h('button', { class: 'btn', onclick: importSheet }, 'Importa una lezione'));
  } else { body.append(h('div', { class: 'spin' })); loadNews(body); }
  return [header('Notizie', 'il mondo, con il perché'), tabs(tl, newsTab, k => { newsTab = k; }),
    newsTab === 'temi' && P('Temi: ' + S.niche.join(', ') + '. Li cambi da ⚙.', 'small muted'),
    !aiReady() && newsTab !== 'ascolta' && h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: needAI }, h('b', null, 'Attiva il motore gratuito'), P('Serve per «Capire al volo» e «Percorso completo» generati dall\'app.', 'small muted')),
    body];
}
async function loadNews(box) {
  const key = newsTab;
  try {
    if (!newsCache[key] || Date.now() - newsCache[key].t > 15 * 60e3) {
      const feeds = key === 'temi' ? S.niche.map(k => ({ name: k, url: GN('/search', k + ' when:3d') })) : S.feeds.filter(f => f.tag === key);
      if (!feeds.length) throw new Error('nessuna fonte');
      const res = await Promise.allSettled(feeds.map(f => fetchFeed(f.url).then(items => items.map(i => Object.assign(i, { feed: f.name })))));
      let items = res.filter(r => r.status === 'fulfilled').flatMap(r => r.value).filter(i => i.title);
      if (!items.length) throw new Error('feed');
      const lim = Date.now() - 4 * 864e5; items = items.filter(i => !Date.parse(i.date) || Date.parse(i.date) > lim);
      items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
      newsCache[key] = { t: Date.now(), cl: clusterNews(items).slice(0, 40), ok: res.filter(r => r.status === 'fulfilled').length, tot: feeds.length };
    }
    if (newsTab !== key || !box.isConnected) return;
    const c = newsCache[key];
    box.replaceChildren(h('span', { class: 'mono' }, `${c.cl.length} storie · ${c.ok}/${c.tot} fonti raggiunte · aggiornate ${fmtDate(c.t)}`), ...c.cl.map(newsCard));
  } catch (e) { if (box.isConnected) box.replaceChildren(netError('le fonti delle notizie')); }
}
const lessonForRef = ref => ref && Object.values(S.lessons).filter(l => l.gen && l.gen.ref === ref);
function newsCard(cl) {
  const it = cl.main;
  const done = lessonForRef(it.link) || [];
  const more = cl.items.length > 1 ? h('details', null, h('summary', { class: 'mono', style: { cursor: 'pointer' } }, `come ne parlano ${cl.items.length} testate`),
    h('div', { class: 'cluster' }, cl.items.slice(0, 10).map(i => h('a', { href: i.link, target: '_blank', rel: 'noopener' }, h('span', null, (i.src || i.feed) + ' · '), i.title)))) : null;
  return h('div', { class: 'card news' },
    h('div', { class: 'row' }, h('span', { class: 'src' }, [cl.srcs.slice(0, 3).join(' · ') + (cl.srcs.length > 3 ? ' +' + (cl.srcs.length - 3) : ''), fmtDate(it.date)].filter(Boolean).join(' · ')), cl.items.length >= 3 && h('span', { class: 'badge' }, 'in evidenza')),
    h('h3', null, it.title), it.desc && h('p', null, it.desc), more,
    done.length ? h('div', { class: 'sources' }, done.map(l => h('button', { class: 'btn small primary', onclick: () => openLesson(l.id) }, '▶ ' + (l.chapters.length > 4 ? 'Percorso' : 'Capire') + ' pronto'))) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn small primary', onclick: () => genNewsLesson(cl, 'quick') }, 'Capire al volo'),
      h('button', { class: 'btn small', onclick: () => genNewsLesson(cl, 'full') }, 'Percorso completo'),
      it.link && h('a', { class: 'btn small ghost', href: it.link, target: '_blank', rel: 'noopener', onclick: () => addLog('mondo', 'notizia', it.title, 0.5) }, 'Leggi'),
      h('button', { class: 'btn small ghost', 'aria-label': 'Ascolta il titolo', onclick: () => speak(it.title + '. ' + (it.desc || '')) }, '🔊')));
}
function lessonCard(L) {
  const p = S.progress[L.id];
  return h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openLesson(L.id) },
    h('div', { class: 'row' }, areaTag(L.area), p && p.done && h('span', { class: 'tag', style: { color: 'var(--ok)' } }, '✓ fatta'), h('span', { class: 'mono' }, (L.chapters || []).length + ' capitoli' + (L.gen ? ' · ' + fmtDay(L.gen.at) : ''))),
    h('h3', null, L.title), L.summary && P(L.summary, 'small muted'));
}

/* ---------- podcast ---------- */
function viewPodcasts() {
  const q = h('input', { type: 'search', placeholder: 'Aggiungi un podcast: cerca per nome' });
  const res = h('div');
  q.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !q.value.trim()) return;
    res.replaceChildren(h('div', { class: 'spin' }));
    podcastSearch(q.value.trim()).then(rs => res.replaceChildren(...rs.map(r => h('div', { class: 'ep' }, h('img', { src: r.art, alt: '' }), h('div', null, h('b', null, r.name)),
      h('button', { class: 'btn small', onclick: () => { if (!S.podcasts.some(p => p.id === r.id)) { S.podcasts.unshift({ name: r.title, id: r.id, art: r.art, title: r.title }); save(); } toast('Aggiunto'); render(); } }, '+'))))).catch(() => res.replaceChildren(netError('Apple Podcasts')));
  });
  return [q, res, P('Gli ultimi episodi dei tuoi podcast, da ascoltare qui mentre fai altro.', 'small muted'),
    ...S.podcasts.map(p => card(h('div', { class: 'row between' }, h('h3', null, p.title || p.name), h('button', { class: 'btn small ghost', 'aria-label': 'Rimuovi', onclick: () => { S.podcasts = S.podcasts.filter(x => x !== p); save(); render(); } }, '✕')),
      episodesBox(() => podcastEpisodes(p, 3), 'mondo')))];
}

/* ======================= SCOPRI E PASSIONI ======================= */
let scopriTab = 'esplora';
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
function catalogAdd(name, cat, why, from) {
  const known = TOPICS.find(t => t.n.toLowerCase() === String(name).toLowerCase()); if (known) return known.id;
  const id = 'c:' + slug(name);
  if (!S.catalog[id]) { S.catalog[id] = { id, n: name, c: cat && cat !== 'Wikipedia' ? cat : 'Scoperti', w: name, hk: why || '', r: [], from: from || null, at: Date.now() }; save(); }
  return id;
}
function topicOf(id) { return TOP[id] || S.catalog[id] || (String(id).startsWith('w:') ? { id, n: id.slice(2), c: 'Scoperti', w: id.slice(2), hk: '', r: [] } : null); }
function allTopics() { return TOPICS.concat(Object.values(S.catalog)); }
function dailyTopic() {
  const r = seeded('topic' + today());
  const catSeen = {}; for (const id in S.explored) { const t = topicOf(id); if (t) catSeen[t.c] = (catSeen[t.c] || 0) + S.explored[id]; }
  const pool = allTopics().filter(t => (S.interests[t.id] || 0) > -2);
  // mai visti e categorie poco esplorate pesano di più (allargare lo sguardo); l'interesse pesa un po' (approfondire)
  const ws = pool.map(t => (S.explored[t.id] ? 0.3 : 1) / (1 + (catSeen[t.c] || 0) * 0.4) * (1 + Math.max(0, S.interests[t.id] || 0) * 0.08));
  let x = r() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= ws[i]; if (x <= 0) return pool[i]; }
  return pool[0];
}
function viewScopri() {
  const lv = h('div', { class: 'card flat' },
    h('div', { class: 'row between' }, h('span', { class: 'mono' }, 'Barriera d\'ingresso'), h('b', null, ['', 'Solo un assaggio', 'Curioso', 'Voglio capire', 'Approfondito', 'Da esperto'][S.level])),
    h('input', { type: 'range', min: 1, max: 5, step: 1, value: S.level, 'aria-label': 'Livello', oninput: e => { S.level = +e.target.value; save(); render(); } }),
    h('div', { class: 'row' }, h('span', { class: 'mono' }, 'Modo'), ...[['orizzontale', '↔ Orizzontale'], ['verticale', '↕ Verticale']].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': S.mode === k ? 'true' : 'false', onclick: () => { S.mode = k; save(); render(); } }, l))),
    P(S.mode === 'orizzontale' ? 'Orizzontale: assaggi tanti argomenti collegati, saltando di ramo in ramo.' : 'Verticale: scegli un argomento e scendi di puntata in puntata, sempre più a fondo.', 'small muted'));
  const t = tabs([['esplora', 'Esplora'], ['passioni', '★ Passioni'], ['catalogo', 'Catalogo']], scopriTab, k => { scopriTab = k; });
  if (scopriTab === 'passioni') {
    const favs = S.favs.map(topicOf).filter(Boolean);
    return [header('Passioni', 'quello che ti accende'), t, lv,
      favs.length ? favs.map(x => h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openTopic(x.id) },
        h('div', { class: 'row between' }, h('h3', null, '★ ' + x.n), h('span', { class: 'mono' }, (S.series[x.id] || []).length + ' puntate · interesse ' + (S.interests[x.id] || 0))), x.hk && P(x.hk, 'small muted')))
        : h('div', { class: 'empty' }, 'Ancora nessuna passione. Negli argomenti tocca ★ su ciò che ti accende.'),
      Object.values(allLessons()).filter(l => l.kind === 'passione').map(lessonCard)];
  }
  if (scopriTab === 'catalogo') {
    const cats = {}; allTopics().forEach(x => (cats[x.c] = cats[x.c] || []).push(x));
    return [header('Catalogo', allTopics().length + ' argomenti, e crescono'), t,
      CATS.filter(c => cats[c]).map(c => flat(h('span', { class: 'mono' }, c),
        h('div', { class: 'chips' }, cats[c].map(x => h('button', { class: 'chip', onclick: () => openTopic(x.id), style: S.explored[x.id] ? { borderColor: 'var(--ink)' } : null }, (S.favs.includes(x.id) ? '★ ' : '') + x.n)))))];
  }
  const dt = dailyTopic();
  const search = h('input', { type: 'search', placeholder: 'Ti è venuta una curiosità? Scrivila e premi invio' });
  const results = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  search.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !search.value.trim()) return;
    const qv = search.value.trim();
    results.replaceChildren(h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left', borderColor: 'var(--ink)' }, onclick: () => openTopic(catalogAdd(qv, 'Scoperti', '')) }, h('b', null, 'Esplora «' + qv + '»'), P('Apri l\'argomento con lezione, podcast, libri e rami.', 'small muted')), h('div', { class: 'spin' }));
    wikiSearch(qv, 5).then(rs => { results.lastChild.remove(); results.append(...rs.map(r => h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openTopic(catalogAdd(r.title, 'Scoperti', r.snippet.slice(0, 140))) }, h('b', null, r.title), h('span', { class: 'small muted' }, r.snippet + '…')))); }).catch(() => results.lastChild.remove());
  });
  const fresh = Object.values(S.catalog).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10);
  return [header('Scopri', 'allarga lo sguardo'), t, lv,
    h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left', borderColor: 'var(--ink)' }, onclick: () => openTopic(dt.id) },
      h('span', { class: 'mono' }, 'Proposta del giorno · ' + dt.c), h('h2', null, dt.n), dt.hk && P(dt.hk, '')),
    search, results,
    fresh.length ? flat(h('span', { class: 'mono' }, 'Rami scoperti di recente'), h('div', { class: 'chips' }, fresh.map(x => h('button', { class: 'chip', onclick: () => openTopic(x.id) }, x.n)))) : null,
    flat(h('span', { class: 'mono' }, 'Tre idee a caso'), h('div', { class: 'chips' }, (() => { const r = seeded('tre' + today() + Object.keys(S.explored).length); const p = allTopics().filter(x => !S.explored[x.id]); return [0, 1, 2].map(() => p.splice(Math.floor(r() * p.length), 1)[0]).filter(Boolean); })().map(x => h('button', { class: 'chip', onclick: () => openTopic(x.id) }, x.n + ' →'))))];
}
function openTopic(id) {
  const t = topicOf(id); if (!t) return;
  S.explored[id] = (S.explored[id] || 0) + 1; bumpInterest([id], 1); addLog('scoperta', 'esplora', t.n, 0.5);
  contAdd({ type: 'topic', id, title: t.n, area: 'scoperta' });
  const series = (S.series[id] || []).map(x => S.lessons[x]).filter(Boolean);
  const favBtn = h('button', { class: 'btn small', 'aria-pressed': S.favs.includes(id) ? 'true' : 'false', onclick: () => {
    if (S.favs.includes(id)) S.favs = S.favs.filter(x => x !== id); else { S.favs.push(id); bumpInterest([id], 3); toast('Aggiunto alle passioni'); }
    favBtn.setAttribute('aria-pressed', S.favs.includes(id) ? 'true' : 'false'); save();
  } }, '★ Passione');
  const sum = h('div', null, h('div', { class: 'spin' }));
  wikiSummary(t.w).then(s => sum.replaceChildren(h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } },
    s.thumbnail && h('img', { class: 'thumb', src: s.thumbnail.source, alt: '', onerror: e => e.target.remove() }),
    h('div', { class: 'grow' }, P((S.level <= 2 ? (s.extract || '').split(/(?<=\.)\s/).slice(0, 2).join(' ') : s.extract) || '', 'small'), s.content_urls && linkBtn(s.content_urls.mobile.page, 'Wikipedia', 'ghost'))))).catch(() => sum.replaceChildren(P('Nessuna voce enciclopedica trovata.', 'small muted')));
  // rami: catalogo, figli scoperti, voci simili
  const kids = Object.values(S.catalog).filter(c => c.from === id);
  const ramiBox = h('div', { class: 'chips' }, t.r.map(r => TOP[r] || S.catalog[r]).filter(Boolean).concat(kids).map(x => h('button', { class: 'chip', onclick: () => { close(); openTopic(x.id); } }, x.n + ' →')));
  wikiRelated(t.w, 6).then(rel => ramiBox.append(...rel.filter(n => n.toLowerCase() !== t.n.toLowerCase()).map(n => h('button', { class: 'chip', style: { borderStyle: 'dashed' }, onclick: () => { const nid = catalogAdd(n, t.c, '', id); close(); openTopic(nid); } }, n + ' →')))).catch(() => { });
  const learn = card(h('span', { class: 'mono' }, S.mode === 'verticale' ? 'Impara · in verticale' : 'Impara'),
    series.length ? [series.map(l => h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openLesson(l.id) }, h('b', null, l.title), h('span', { class: 'mono' }, (S.progress[l.id]?.done ? '✓ fatta · ' : '') + l.chapters.length + ' capitoli'))),
      h('button', { class: 'btn primary', onclick: () => genTopicLesson(t) }, '↓ Puntata successiva' + (series[series.length - 1].next ? ': ' + series[series.length - 1].next : ''))]
      : [P('Una lezione interattiva su misura per il tuo livello: storie, schemi da toccare, quiz e una cosa da provare dal vivo.'), h('button', { class: 'btn primary', onclick: () => genTopicLesson(t) }, 'Crea la lezione interattiva')],
    h('button', { class: 'btn small ghost', onclick: () => askClaudeSheet('passione', t.n, t.hk) }, 'oppure chiedila a Claude'));
  const close = openSheet(t.n, pad(
    h('div', { class: 'row' }, h('span', { class: 'tag muted' }, t.c), h('span', { class: 'mono' }, S.mode + ' · livello ' + S.level)),
    t.hk && h('p', { style: { margin: 0, fontSize: '17px' } }, t.hk),
    h('div', { class: 'row' }, favBtn,
      h('button', { class: 'btn small', onclick: () => { bumpInterest([id], -3); contDone('topic', id); toast('Ok, te lo proporrò meno'); close(); } }, 'Non fa per me'),
      h('button', { class: 'btn small ghost', onclick: () => { contDone('topic', id); toast('Tolto da «Da continuare»'); } }, 'Fatto per ora')),
    learn,
    card(h('span', { class: 'mono' }, 'In due righe'), sum),
    card(h('span', { class: 'mono' }, '🎧 Ascolta'), episodesBox(() => episodeSearch(t.n, 4), 'scoperta', 'Nessun episodio in italiano su questo tema.')),
    card(h('span', { class: 'mono' }, '📚 Leggi'), (() => { const b = h('div', null, h('div', { class: 'spin' })); bookSearch(t.n, 4).then(bs => b.replaceChildren(...(bs.length ? bs.map(x => h('div', { style: { padding: '6px 0', borderTop: '1px solid var(--soft)' } }, h('a', { href: x.link, target: '_blank', rel: 'noopener' }, x.title), h('div', { class: 'mono' }, [x.authors, x.year].filter(Boolean).join(' · ')))) : [P('Nessun libro trovato.', 'small muted')]))).catch(() => b.replaceChildren(P('Ricerca libri non disponibile.', 'small muted'))); return b; })()),
    card(h('span', { class: 'mono' }, '▶ Guarda'), h('div', { class: 'row' }, linkBtn('https://www.youtube.com/results?search_query=' + encodeURIComponent(t.n + ' spiegato'), 'YouTube'), linkBtn('https://www.raiplay.it/ricerca.html?q=' + encodeURIComponent(t.n), 'RaiPlay'), linkBtn('https://www.raiplaysound.it/ricerca?q=' + encodeURIComponent(t.n), 'RaiPlay Sound'))),
    card(h('span', { class: 'mono' }, 'Rami · tratteggiati quelli nuovi'), ramiBox)
  ), () => render());
}

/* ======================= TECNICO ======================= */
let techQ = null;
function viewTecnico() {
  techQ = techQ || S.techKw[0];
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div', { class: 'spin' }));
  const inp = h('input', { type: 'search', placeholder: 'Cerca un argomento tecnico (meglio in inglese)' });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) { techQ = inp.value.trim(); render(); } });
  const q = techQ;
  searchPapers(q).then(ws => { if (techQ === q && list.isConnected) list.replaceChildren(...(ws.length ? ws.map(paperCard) : [h('div', { class: 'empty' }, 'Nessun risultato.')])); }).catch(() => list.replaceChildren(netError('OpenAlex')));
  return [header('Tecnico', 'paper resi digeribili'),
    h('div', { class: 'scrollx' }, S.techKw.map(k => h('button', { class: 'chip', 'aria-pressed': k === techQ ? 'true' : 'false', onclick: () => { techQ = k; render(); } }, k))),
    inp, P('Fonte: OpenAlex, catalogo aperto della ricerca. Ultimi due anni.', 'small muted'),
    Object.values(S.lessons).filter(l => l.kind === 'tecnico').slice(-3).reverse().map(lessonCard), list];
}
function paperCard(w) {
  const abs = abstractOf(w);
  const venue = w.primary_location?.source?.display_name || '';
  const link = w.open_access?.oa_url || w.doi || w.id;
  return card(
    h('div', { class: 'src mono' }, [w.publication_year, venue, (w.cited_by_count || 0) + ' citazioni', w.open_access?.is_oa ? 'open access' : null].filter(Boolean).join(' · ')),
    h('h3', null, stripTags(w.display_name)),
    abs && P(abs.slice(0, 220) + (abs.length > 220 ? '…' : ''), 'small muted'),
    h('div', { class: 'row' },
      abs && h('button', { class: 'btn small primary', onclick: () => genPaperLesson(w, abs, link) }, 'Spiegamelo'),
      abs && h('button', { class: 'btn small', onclick: () => lightRead(w, abs) }, 'Frase per frase'),
      link && linkBtn(link, 'Apri', 'ghost')));
}
function lightRead(w, abs) {
  const sents = abs.match(/[^.!?]+[.!?]+(\s|$)/g) || [abs];
  let i = 0;
  const host = pad();
  openSheet('Frase per frase', host);
  addLog('lavoro', 'paper', stripTags(w.display_name), 1);
  function show() {
    host.replaceChildren(h('span', { class: 'mono' }, stripTags(w.display_name)),
      card(h('span', { class: 'mono' }, `frase ${i + 1} di ${sents.length}`), h('div', { class: 'sent' }, sents[i].trim())),
      h('div', { class: 'row' }, h('button', { class: 'btn', disabled: i === 0, onclick: () => { i--; show(); } }, '‹'),
        h('button', { class: 'btn primary grow', disabled: i === sents.length - 1, onclick: () => { i++; show(); } }, 'Avanti ›'),
        h('button', { class: 'btn', onclick: () => speak(sents[i]) }, '🔊')),
      h('button', { class: 'btn small', onclick: () => { addCard('Dal paper «' + stripTags(w.display_name).slice(0, 80) + '»: cosa afferma questo passaggio?', sents[i].trim(), 'lavoro', 'Tecnico'); toast('Nel Quaderno'); } }, '+ Salva questa frase'));
  }
  show();
}

/* ======================= SPECCHIO ======================= */
function hourCard(o, current) {
  const kw = { lodi: 'Lodi', vespri: 'Vespri', compieta: 'Compieta', media: 'Ora Media', ufficio: 'Ufficio' }[o.k];
  const audio = h('div');
  const showAudio = () => audio.replaceChildren(episodesBox(async () => (await podcastEpisodes({ q: 'Liturgia del giorno breviario e vangelo TV Pater' }, 15)).filter(e => e.title.toLowerCase().includes(kw.toLowerCase())).slice(0, 1), 'fede', 'Audio di oggi non trovato.'));
  return h('div', { class: 'card' + (current ? ' hour' : '') },
    h('div', { class: 'row between' }, h('h2', null, o.n), h('span', { class: 'mono' }, current ? 'adesso · ' + o.when : o.when)),
    P(o.what, ''), h('div', { class: 'note contesto' }, h('span', { class: 'mono' }, 'Perché'), P(o.why)),
    h('details', null, h('summary', { class: 'mono', style: { cursor: 'pointer' } }, 'com\'è fatta'), h('ol', { class: 'small', style: { margin: '6px 0 0', paddingLeft: '1.3em' } }, o.parts.map(p => h('li', null, p)))),
    h('div', { class: 'row' }, h('a', { class: 'btn small primary', href: IBREV(o.slug), target: '_blank', rel: 'noopener', onclick: () => addLog('fede', 'liturgia', o.n, 2) }, 'Prega il testo di oggi'),
      h('button', { class: 'btn small', onclick: showAudio }, '🎧 Ascolta e prega'), h('button', { class: 'btn small ghost', onclick: () => { addLog('fede', 'liturgia', o.n, 2); toast('Segnata'); render(); } }, '✓ Pregata')),
    audio);
}
function viewSpecchio() {
  const cur = currentHour();
  const ref = h('input', { type: 'text', placeholder: 'Un brano a scelta, es. «Marco 4» o «Salmo 139»' });
  ref.addEventListener('keydown', e => { if (e.key === 'Enter' && ref.value.trim()) genFaithLesson('bible', ref.value.trim()); });
  const fq = h('input', { type: 'text', placeholder: 'Una tua domanda sulla fede…' });
  fq.addEventListener('keydown', e => { if (e.key === 'Enter' && fq.value.trim()) genFaithLesson('faith', fq.value.trim()); });
  const fede = Object.values(S.lessons).filter(l => l.kind === 'fede').sort((a, b) => (b.gen?.at || 0) - (a.gen?.at || 0));
  const jr = S.journal.slice(-4).reverse();
  return [header('Specchio', 'fermarsi, pregare, conoscersi'),
    hourCard(cur, true),
    h('details', { class: 'card flat' }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, 'Le altre Ore della giornata')),
      pad(...HOURS.filter(o => o !== cur).map(o => hourCard(o, false)))),
    card(h('h2', null, 'La Parola'), P('Scegli un brano: l\'app ti spiega contesto storico, parole chiave, come lo ha letto la Chiesa e cosa può dire a te.'),
      h('div', { class: 'chips' }, BIBLE.map(([r, t]) => h('button', { class: 'chip', title: t, onclick: () => genFaithLesson('bible', r, t) }, r + ' · ' + t))), ref,
      h('div', { class: 'row' }, linkBtn('https://www.vaticannews.va/it/vangelo-del-giorno-e-parola-del-giorno.html', 'Vangelo del giorno'), linkBtn('https://www.bibbiaedu.it/', 'Bibbia CEI', 'ghost'))),
    card(h('h2', null, 'Il perché della fede'), P('Domande serie, risposte con Scrittura, Catechismo, santi e anche le obiezioni.'),
      h('div', { class: 'chips' }, FAITH_Q.map(q => h('button', { class: 'chip', onclick: () => genFaithLesson('faith', q) }, q))), fq,
      linkBtn('https://www.vatican.va/archive/catechism_it/index_it.htm', 'Catechismo della Chiesa cattolica', 'ghost')),
    fede.length ? [h('h2', null, 'Le tue lezioni di fede'), fede.slice(0, 6).map(lessonCard)] : null,
    card(h('h2', null, 'Pratiche guidate'), Object.entries(GUIDES).map(([k, g]) => h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => guideSheet(k) }, h('b', null, g.n), h('span', { class: 'small muted' }, g.intro)))),
    card(h('div', { class: 'row between' }, h('h2', null, 'Diario'), h('button', { class: 'btn small', onclick: journalSheet }, '+ Scrivi')),
      jr.length ? jr.map(j => flat(h('span', { class: 'mono' }, j.d + (j.from ? ' · ' + j.from : '')), j.prompt && h('b', { class: 'small' }, j.prompt), h('div', { class: 'small' }, j.text)))
        : h('div', { class: 'empty' }, 'Le tue riflessioni, anche quelle delle lezioni, finiscono qui.'))];
}

/* ======================= QUADERNO ======================= */
let qTab = 'cont';
function viewQuaderno() {
  const due = dueCards().length;
  const t = tabs([['cont', 'Da continuare'], ['carte', 'Carte'], ['lezioni', 'Lezioni'], ['storico', 'Storico']], qTab, k => { qTab = k; });
  let body;
  if (qTab === 'cont') body = S.cont.length ? [card(S.cont.map(contRow))] : [h('div', { class: 'empty' }, 'Niente in sospeso. Lezioni, argomenti ed episodi lasciati a metà compaiono qui.')];
  else if (qTab === 'carte') {
    const flt = h('input', { type: 'search', placeholder: 'Cerca tra le carte' });
    const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
    const paint = () => {
      const q = flt.value.toLowerCase();
      const cs = S.cards.filter(c => !q || (c.front + c.back + c.from).toLowerCase().includes(q)).slice().reverse().slice(0, 150);
      box.replaceChildren(...(cs.length ? cs.map(c => h('details', { class: 'card flat' }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, c.front)),
        h('p', { style: { margin: '6px 0' } }, c.back), h('div', { class: 'row between' }, h('span', { class: 'mono' }, (c.from || '') + ' · ripasso ' + c.due),
          h('button', { class: 'btn small ghost', onclick: () => { S.cards = S.cards.filter(x => x !== c); save(); paint(); } }, 'Elimina'))))
        : [h('div', { class: 'empty' }, 'Nessuna carta. Lezioni, glossari e paper ti permettono di salvarne.')]));
    };
    flt.addEventListener('input', paint); paint();
    body = [h('div', { class: 'row' }, h('button', { class: 'btn grow' + (due ? ' primary' : ''), onclick: reviewSheet }, due ? `Ripassa ${due} carte` : 'Niente da ripassare oggi'), h('button', { class: 'btn', onclick: newCardSheet }, '+ Carta')), flt, box];
  } else if (qTab === 'lezioni') {
    const ls = Object.values(allLessons()).sort((a, b) => (b.gen?.at || 0) - (a.gen?.at || 0));
    body = [h('div', { class: 'row' }, h('button', { class: 'btn grow', onclick: importSheet }, 'Importa una lezione')),
      ls.map(L => h('div', null, lessonCard(L), S.lessons[L.id] && h('button', { class: 'btn small ghost', onclick: () => { delete S.lessons[L.id]; contDone('lesson', L.id); save(); render(); } }, 'Elimina')))];
  } else {
    const ev = S.log.slice(-80).reverse();
    body = [ev.length ? ev.map(e => h('div', { class: 'row', style: { borderTop: '1px solid var(--soft)', paddingTop: '6px' } }, h('span', { class: 'dotc', style: { background: areaColor(e.area) } }), h('span', { class: 'mono' }, e.d), h('span', { class: 'small grow' }, e.kind + ' · ' + e.title)))
      : h('div', { class: 'empty' }, 'Ancora nulla.')];
  }
  return [header('Quaderno', `${S.cards.length} carte · ${Object.keys(allLessons()).length} lezioni`), t, ...body];
}

/* ======================= IMPOSTAZIONI ======================= */
function settingsSheet() {
  const name = h('input', { type: 'text', value: S.name });
  const prov = h('select', null, [['gemini', 'Gemini (Google AI Studio) · consigliato'], ['openrouter', 'OpenRouter · modelli gratuiti']].map(([v, l]) => h('option', { value: v, selected: S.ai.provider === v ? true : null }, l)));
  const gkey = h('input', { type: 'text', value: S.ai.key, placeholder: 'Chiave Gemini (inizia con AIza…)', autocomplete: 'off' });
  const gmodel = h('select', null, h('option', { value: S.ai.model || '' }, S.ai.model || 'automatico (il Flash più recente)'));
  const okey = h('input', { type: 'text', value: S.ai.orKey, placeholder: 'Chiave OpenRouter (facoltativa, di riserva)', autocomplete: 'off' });
  const omodel = h('input', { type: 'text', value: S.ai.orModel });
  const status = h('div', { class: 'small muted' });
  const loadModels = async () => {
    status.textContent = 'Controllo la chiave…';
    try { const ms = await geminiModels(gkey.value.trim()); gmodel.replaceChildren(h('option', { value: '' }, 'automatico (' + (ms[0] || '?') + ')'), ...ms.map(m => h('option', { value: m, selected: m === S.ai.model ? true : null }, m))); status.textContent = '✓ Chiave valida: ' + ms.length + ' modelli disponibili.'; }
    catch (e) { status.textContent = '✗ ' + (e.message || 'chiave non valida'); }
  };
  const feeds = h('textarea', { style: { fontFamily: 'var(--f-mono)', fontSize: '11.5px', minHeight: '150px' } }); feeds.value = S.feeds.map(f => [f.tag, f.name, f.url].join(' | ')).join('\n');
  const niche = h('input', { type: 'text', value: S.niche.join(', ') });
  const tech = h('input', { type: 'text', value: S.techKw.join(', ') });
  const imp = h('textarea', { placeholder: 'Incolla qui un backup per ripristinarlo', style: { fontFamily: 'var(--f-mono)', fontSize: '12px' } });
  const close = openSheet('Impostazioni', pad(
    card(h('h3', null, 'Motore delle lezioni'),
      P('Ulisse crea lezioni, percorsi e spiegazioni con un modello linguistico gratuito. La chiave resta solo su questo telefono.'),
      h('label', { class: 'lab' }, 'Servizio principale'), prov,
      h('label', { class: 'lab' }, 'Chiave Gemini · ', h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'ottienila gratis qui')), gkey,
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: loadModels }, 'Verifica chiave e modelli')), status,
      h('label', { class: 'lab' }, 'Modello Gemini'), gmodel,
      h('label', { class: 'lab' }, 'Chiave OpenRouter · ', h('a', { href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noopener' }, 'ottienila qui'), ' (usata se Gemini esaurisce i limiti)'), okey,
      h('label', { class: 'lab' }, 'Modello OpenRouter'), omodel,
      P('Nel piano gratuito Google può usare i testi inviati per migliorare i modelli: le richieste di Ulisse contengono solo notizie e argomenti, non dati personali.', 'small muted')),
    card(h('label', { class: 'lab' }, 'Nome'), name,
      h('label', { class: 'lab' }, 'Fonti delle notizie (una per riga: sezione | nome | indirizzo RSS). Sezioni: ' + NEWS_TAGS.join(', ')), feeds,
      h('label', { class: 'lab' }, 'I miei temi (separati da virgola)'), niche,
      h('label', { class: 'lab' }, 'Argomenti tecnici (separati da virgola)'), tech),
    h('button', { class: 'btn primary', onclick: () => {
      S.name = name.value.trim() || S.name;
      S.ai.provider = prov.value; S.ai.key = gkey.value.trim(); S.ai.model = gmodel.value; S.ai.orKey = okey.value.trim(); S.ai.orModel = omodel.value.trim() || 'openrouter/free';
      const fs = feeds.value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p.length >= 3 && /^https?:/.test(p[2])).map(([tag, n, u]) => ({ tag: NEWS_TAGS.includes(tag) ? tag : 'Principali', name: n, url: u }));
      if (fs.length) S.feeds = fs;
      S.niche = niche.value.split(',').map(x => x.trim()).filter(Boolean);
      S.techKw = tech.value.split(',').map(x => x.trim()).filter(Boolean);
      newsCache = {}; techQ = null; save(); close(); render(); toast('Salvato');
    } }, 'Salva'),
    card(h('h3', null, 'Backup'),
      P('I dati restano su questo telefono. Ogni tanto copia il backup e salvalo in una nota o mandalo a te stesso via mail. Il backup contiene anche le chiavi: non condividerlo.', 'small muted'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => copyText(JSON.stringify(S)) }, 'Copia backup'),
        h('button', { class: 'btn', onclick: () => { try { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })), download: 'ulisse-backup-' + today() + '.json' }); document.body.append(a); a.click(); a.remove(); } catch (e) { toast('Download non disponibile qui'); } } }, 'Scarica file')),
      imp, h('button', { class: 'btn', onclick: () => { try { const d = JSON.parse(imp.value); if (!d.v) throw 0; localStorage.setItem(KEY, JSON.stringify(d)); S = load(); save(); close(); render(); toast('Backup ripristinato'); } catch (e) { toast('Backup non valido'); } } }, 'Ripristina')),
    flat(h('span', { class: 'mono' }, 'Ulisse v0.2'), P('Fonti gratuite: Google News e feed RSS, Wikipedia, OpenAlex, Apple Podcasts, Google Books, iBreviary. Codice: github.com/Torre28/Ulisse', 'small muted'))));
  if (gkey.value) loadModels();
}

/* ======================= NAVIGAZIONE ======================= */
const ICONS = {
  oggi: '<svg viewBox="0 0 24 24"><path d="M3 17h18M5 17l2-7h10l2 7M12 10V3l5 4h-5"/></svg>',
  notizie: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h6"/></svg>',
  scopri: '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 11l7.4-3.8M8.3 13l7.4 3.8"/></svg>',
  tecnico: '<svg viewBox="0 0 24 24"><path d="M3 12h3l2-6 4 12 3-8 2 2h4"/></svg>',
  specchio: '<svg viewBox="0 0 24 24"><path d="M12 3v18M6 9h12"/></svg>',
  quaderno: '<svg viewBox="0 0 24 24"><path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/></svg>'
};
const SECTIONS = { oggi: 'Oggi', notizie: 'Notizie', scopri: 'Scopri', tecnico: 'Tecnico', specchio: 'Specchio', quaderno: 'Quaderno' };
const VIEWS = { oggi: viewOggi, notizie: viewNotizie, scopri: viewScopri, tecnico: viewTecnico, specchio: viewSpecchio, quaderno: viewQuaderno };
let route = 'oggi';
function render() {
  if (document.querySelector('.sheet-bg')) return; // non ridisegnare sotto un foglio aperto
  const y = window.scrollY;
  app.replaceChildren(...VIEWS[route]().flat(Infinity).filter(Boolean));
  $('#nav').replaceChildren(...Object.entries(SECTIONS).map(([k, l]) => h('button', { 'aria-current': k === route ? 'page' : null, onclick: () => go(k) }, h('span', { html: ICONS[k] }), l)));
  window.scrollTo(0, y);
}
function go(k) {
  if (!VIEWS[k]) k = 'oggi';
  document.querySelectorAll('.sheet-bg').forEach(e => e.remove()); stopSpeak();
  route = k; try { if (location.hash !== '#' + k) history.replaceState(null, '', '#' + k); } catch (e) { }
  render(); window.scrollTo(0, 0);
}

/* ======================= MISSIONI, DIARIO, PRATICHE ======================= */
function pickQuest(area, type, avoid) {
  const list = QT[area][type].filter(t => t !== avoid);
  const r = seeded(today() + area + type + (avoid || ''));
  return list[Math.floor(r() * list.length)];
}
function ensureTodayQuests(force) {
  const d = today();
  if (force) S.quests = S.quests.filter(q => !(q.d === d && q.src === 'app' && !q.done));
  if (S.quests.some(q => q.d === d && q.src === 'app')) return;
  const b = balance(14), r = seeded(d);
  const order = Object.keys(AREAS).sort((x, y) => (b[x] - b[y]) || (r() - .5));
  // main: area più trascurata; side: seconda più trascurata
  S.quests.push({ id: uid(), d, src: 'app', type: 'main', area: order[0], t: pickQuest(order[0], 'main'), done: false, why: whyText(order[0], b) });
  S.quests.push({ id: uid(), d, src: 'app', type: 'side', area: order[1], t: pickQuest(order[1], 'side'), done: false, why: whyText(order[1], b) });
  save();
}
function whyText(a, b) { const n = b[a]; return n === 0 ? `Nelle ultime due settimane non hai fatto nulla in «${AREAS[a].n}».` : `«${AREAS[a].n}» è tra le aree meno curate nelle ultime due settimane (${n}).`; }


function addQuestSheet() {
  const t = h('input', { type: 'text', placeholder: 'Es. Finire il capitolo 2 della tesi' });
  let area = 'lavoro', type = 'main';
  const areaChips = h('div', { class: 'chips' }), typeChips = h('div', { class: 'chips' });
  const paint = () => {
    areaChips.replaceChildren(...Object.keys(AREAS).map(a => h('button', { class: 'chip', 'aria-pressed': a === area ? 'true' : 'false', onclick: () => { area = a; paint(); } }, AREAS[a].n)));
    typeChips.replaceChildren(...[['main', 'Main quest'], ['side', 'Side quest']].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': k === type ? 'true' : 'false', onclick: () => { type = k; paint(); } }, l)));
  };
  paint();
  const close = openSheet('Nuova missione', h('div', { class: 'card' }, h('label', { class: 'lab' }, 'Cosa vuoi fare'), t, h('label', { class: 'lab' }, 'Area'), areaChips, h('label', { class: 'lab' }, 'Tipo'), typeChips,
    h('button', { class: 'btn primary', onclick: () => { if (!t.value.trim()) return; S.quests.push({ id: uid(), d: today(), src: 'io', type, area, t: t.value.trim(), done: false }); save(); close(); render(); } }, 'Aggiungi')));
  setTimeout(() => t.focus(), 50);
}


function journalSheet() {
  const prompts = ['Cosa mi ha dato energia oggi?', 'Cosa ho evitato e perché?', 'Di cosa sono grato?', 'Cosa vorrei imparare se avessi tutto il tempo del mondo?', 'Con chi vorrei passare più tempo?'];
  const p = prompts[Math.floor(Math.random() * prompts.length)];
  const ta = h('textarea', { placeholder: p });
  const close = openSheet('Diario', h('div', { class: 'card' }, h('h3', null, p), ta, h('button', { class: 'btn primary', onclick: () => {
    if (!ta.value.trim()) return; S.journal.push({ id: uid(), d: today(), prompt: p, text: ta.value.trim() }); addLog('fede', 'diario', p); save(); close(); render();
  } }, 'Salva')));
}
function guideSheet(k) {
  const g = GUIDES[k], host = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  let timer = null, alive = true;
  openSheet(g.n, host, () => { alive = false; clearTimeout(timer); clearInterval(timer); });
  if (g.breath) {
    let mins = 3;
    const circle = h('div', { class: 'breath' }, 'pronto');
    const status = h('div', { class: 'mono', style: { textAlign: 'center' } }, '');
    const start = h('button', { class: 'btn primary', onclick: () => {
      start.disabled = true; const end = Date.now() + mins * 60e3; const phases = [['inspira', 4000, 1], ['trattieni', 4000, 1], ['espira', 6000, .6]]; let p = 0;
      const step = () => {
        if (!alive) return;
        if (Date.now() > end) { circle.textContent = 'fatto'; circle.style.transform = 'scale(.6)'; addLog(g.area, 'respiro', mins + ' minuti'); start.disabled = false; return; }
        const [l, ms, sc] = phases[p % 3]; circle.textContent = l; circle.style.transition = `transform ${ms}ms ease-in-out`; circle.style.transform = `scale(${sc})`;
        status.textContent = Math.ceil((end - Date.now()) / 60e3) + ' min rimasti'; p++; timer = setTimeout(step, ms);
      };
      step();
    } }, 'Inizia');
    const mchips = h('div', { class: 'chips' });
    const paint = () => mchips.replaceChildren(...[3, 5, 10].map(m => h('button', { class: 'chip', 'aria-pressed': m === mins ? 'true' : 'false', onclick: () => { mins = m; paint(); } }, m + ' min')));
    paint();
    host.append(h('p', { style: { margin: 0 } }, g.intro), mchips, circle, status, start);
    return;
  }
  let i = 0;
  const show = () => {
    clearInterval(timer);
    if (i >= g.steps.length) { addLog(g.area, 'pratica', g.n, 2); host.replaceChildren(h('div', { class: 'card' }, h('h3', null, 'Amen.'), h('p', { style: { margin: 0 } }, 'Se vuoi, scrivi una riga nel diario.'), h('button', { class: 'btn', onclick: journalSheet }, 'Scrivi nel diario'))); return; }
    const [t, tx, sec] = g.steps[i]; let left = sec;
    const clock = h('div', { class: 'mono' }, '');
    const tick = () => { clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (left-- <= 0) { clearInterval(timer); clock.textContent = 'quando vuoi, vai avanti'; } };
    host.replaceChildren(h('p', { class: 'small muted', style: { margin: 0 } }, g.intro),
      h('div', { class: 'card' }, h('span', { class: 'mono' }, `passo ${i + 1} di ${g.steps.length}`), h('h2', null, t), h('p', { style: { margin: 0, fontSize: '17px' } }, tx), clock),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => speak(t + '. ' + tx) }, '🔊'), h('button', { class: 'btn primary grow', onclick: () => { i++; stopSpeak(); show(); } }, i === g.steps.length - 1 ? 'Concludi' : 'Avanti ›')));
    tick(); timer = setInterval(tick, 1000);
  };
  show();
}


function newCardSheet() {
  const f = h('input', { type: 'text', placeholder: 'Domanda o concetto' }), b = h('textarea', { placeholder: 'Risposta o spiegazione breve' });
  const close = openSheet('Nuova carta', h('div', { class: 'card' }, f, b, h('button', { class: 'btn primary', onclick: () => { if (!f.value.trim()) return; addCard(f.value.trim(), b.value.trim(), 'scoperta', 'a mano'); close(); render(); } }, 'Salva')));
}


/* ======================= AVVIO ======================= */
S = load(); save();
window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (VIEWS[k] && k !== route) go(k); });
go(location.hash.slice(1) || 'oggi');
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nuova versione di Ulisse: chiudi e riapri l\'app', 5000); }); });
  }).catch(() => { });
}
