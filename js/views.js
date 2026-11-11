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

/* ======================= CONTENUTI DI STANOTTE ======================= */
const PREP_ICON = { notizia: '📰', passione: '🧭', fede: '✝' };
function prepRow(p) {
  const mode = { full: 'percorso completo', quick: 'capire al volo', scoperta: 'scoperta del giorno', parola: 'Parola del giorno', serie: 'nuova puntata' }[p.mode] || p.kind;
  const done = S.progress[p.id]?.done;
  return h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openPrepared(p) },
    h('span', { class: 'mono' }, (PREP_ICON[p.kind] || '·') + ' ' + mode + ' · ' + p.chapters + ' capitoli' + (done ? ' · ✓ fatta' : '')),
    h('b', null, p.title), p.headline && p.headline !== p.title ? h('span', { class: 'small muted' }, p.headline) : (p.summary ? h('span', { class: 'small muted' }, p.summary) : null));
}

/* ======================= SESSIONE A TEMPO ======================= */
let sessMin = null;
const doneToday = id => S.log.some(e => e.d === today() && e.ref === id);
function sessionPlan(min) {
  const cand = [];
  const latest = PREP.items.slice().sort((a, b) => (b.date + (b.id || '')).localeCompare(a.date + (a.id || '')));
  const seen = id => S.progress[id] && S.progress[id].done;
  const due = dueCards().length;
  if (due) cand.push({ id: 'ripasso', ico: '🗂', t: `Ripassa ${Math.min(due, 15)} carte`, min: Math.max(2, Math.min(8, Math.ceil(Math.min(due, 15) * 0.4))), run: reviewSheet, pr: 9 });
  const want = p => -((5 - ((S.selfRate || {})[themeOf({ kind: 'notizia', title: p.title, tags: [] })] || 3)));
  latest.filter(p => p.kind === 'notizia' && p.mode !== 'full' && !seen(p.id)).sort((a, b) => want(a) - want(b)).slice(0, 4).forEach((p, i) => cand.push({ id: p.id, ico: '📰', t: p.title, min: 6, run: () => openPrepared(p), pr: 8 - i }));
  latest.filter(p => p.kind === 'notizia' && p.mode === 'full' && !seen(p.id)).slice(0, 2).forEach((p, i) => cand.push({ id: p.id, ico: '🧭', t: 'Percorso: ' + p.title, min: 22, run: () => openPrepared(p), pr: 6 - i }));
  const sc = latest.find(p => p.kind === 'passione' && !seen(p.id)); if (sc) cand.push({ id: sc.id, ico: '✨', t: sc.title, min: 12, run: () => openPrepared(sc), pr: 7 });
  const pa = latest.find(p => p.mode === 'parola' && !seen(p.id)); if (pa) cand.push({ id: pa.id, ico: '✝', t: 'La Parola: ' + (pa.headline || pa.title), min: 12, run: () => openPrepared(pa), pr: 5 });
  const ho = currentHour(); cand.push({ id: 'ora-' + ho.k, ico: '🕯', t: ho.n, min: ho.k === 'ufficio' ? 20 : 10, run: () => go('specchio'), pr: 4 });
  const c = S.cont.find(x => x.type === 'lesson'); if (c) cand.push({ id: 'c-' + c.id, ico: '↩', t: 'Riprendi: ' + c.title, min: 8, run: () => openLesson(c.id), pr: 7.5 });
  cand.sort((a, b) => b.pr - a.pr);
  const out = []; let tot = 0;
  for (const x of cand) { if (tot + x.min <= min + 3) { out.push(x); tot += x.min; } }
  return { items: out, tot };
}
function sessionCard() {
  const chips = h('div', { class: 'time-chips' }, [5, 15, 30, 60].map(m => h('button', { class: 'chip', 'aria-pressed': sessMin === m ? 'true' : 'false', onclick: () => { sessMin = sessMin === m ? null : m; render(); } }, m === 60 ? '1 ora+' : m + ' min')));
  if (!sessMin) return h('div', { class: 'card hero' }, h('span', { class: 'mono' }, 'Quanto tempo hai adesso?'), chips, P('Ti preparo un percorso su misura con quello che è già pronto: si apre all\'istante.', 'small'));
  const plan = sessionPlan(sessMin);
  return h('div', { class: 'card hero' }, h('div', { class: 'row between' }, h('span', { class: 'mono' }, `Il tuo percorso · circa ${plan.tot} min`), h('button', { class: 'btn small', onclick: () => { sessMin = null; render(); } }, '✕')), chips,
    plan.items.length ? h('div', null, plan.items.map(x => h('div', { class: 'sess' + (doneToday(x.id) ? ' done' : '') }, h('div', { class: 'ico' }, x.ico), h('div', null, h('b', null, x.t), h('span', { class: 'min' }, x.min + ' min')),
      h('button', { class: 'btn small primary', onclick: () => { S.log.push({ d: today(), t: Date.now(), area: 'scoperta', kind: 'sessione', title: x.t, w: 0, ref: x.id }); save(); x.run(); } }, '▶')))) : P('Non c\'è ancora nulla di pronto: torna dopo il prossimo giro della redazione.', 'small'));
}
/* competenze: crescono con lezioni, capitoli letti e ripassi */
function themeOf(L) {
  if (L.kind === 'fede') return 'Fede e Scrittura';
  if (L.kind === 'tecnico') return 'Tecnica e ricerca';
  if (L.kind === 'passione') { const t = L.gen && L.gen.topic && topicOf(L.gen.topic); return t ? t.n : (L.tags || [])[0] || 'Scoperte'; }
  const tg = (L.tags || []).map(x => String(x).toLowerCase()).join(' ') + ' ' + (L.title || '').toLowerCase();
  if (/elezion|governo|parlament|senato|camera|partit|legge|ministr|premier|costituz|meloni|referendum/.test(tg)) return 'Politica italiana';
  if (/guerra|ucraina|russia|israele|gaza|cina|usa|nato|ue|europa|diplomaz|esteri/.test(tg)) return 'Esteri e geopolitica';
  if (/econom|borsa|inflaz|banc|mercat|tass|lavoro|pil|bce/.test(tg)) return 'Economia';
  if (/scien|ricerc|spazio|clima|salute|tecnolog/.test(tg)) return 'Scienza e tecnologia';
  return 'Attualità';
}
const THEMES = ['Politica italiana', 'Esteri e geopolitica', 'Economia', 'Scienza e tecnologia', 'Storia', 'Fede e Scrittura', 'Tecnica e ricerca', 'Cultura e arte'];
function skills() { // solo ciò che hai confermato di aver letto e capito, più i ripassi
  const pts = {};
  for (const [id, pr] of Object.entries(S.progress)) { if (!(pr.read || (pr.done && !pr.skimmed))) continue; const L = allLessons()[id]; if (!L) continue; const th = themeOf(L); pts[th] = (pts[th] || 0) + 10 + (pr.seen || []).length * 2; }
  for (const c of S.cards) { if (!c.reps) continue; const L = Object.values(allLessons()).find(l => l.title === c.from); if (L) { const th = themeOf(L); pts[th] = (pts[th] || 0) + Math.min(c.reps, 5); } }
  return Object.entries(pts).map(([n, p]) => { const lv = Math.floor(Math.sqrt(p / 12)) + 1, lo = (lv - 1) ** 2 * 12, hi = lv ** 2 * 12; return { n, p, lv, frac: (p - lo) / (hi - lo) }; }).sort((a, b) => b.p - a.p);
}
const LV_NAME = ['', 'Curioso', 'Informato', 'Consapevole', 'Esperto', 'Maestro'];
/* punti esperienza della giornata: tutto ciò che fai pesa, letture confermate e missioni di più */
function xpOf(day) { return Math.round(S.log.filter(e => e.d === day && e.kind !== 'sessione').reduce((a, e) => a + (e.w || 1) * 10, 0)); }
function streak() { let n = 0; for (let i = 0; i < 400; i++) { if (xpOf(daysAgo(i)) > 0) n++; else if (i > 0) break; } return n; }
const GOAL_CATS = ['Attualità e politica', 'Economia', 'Scienza e tecnologia', 'Passioni', 'Lavoro e studio', 'Fede', 'Relazioni', 'Corpo'];
const GOAL_ICON = { 'Attualità e politica': '📰', 'Economia': '📈', 'Scienza e tecnologia': '🔬', 'Passioni': '✨', 'Lavoro e studio': '🛠', 'Fede': '✝', 'Relazioni': '🤝', 'Corpo': '🚶' };
function catOf(e) {
  if (e.area === 'mondo') return e.th === 'Economia' ? 'Economia' : e.th === 'Scienza e tecnologia' ? 'Scienza e tecnologia' : 'Attualità e politica';
  return { scoperta: 'Passioni', lavoro: 'Lavoro e studio', fede: 'Fede', famiglia: 'Relazioni', amici: 'Relazioni', corpo: 'Corpo' }[e.area] || 'Passioni';
}
function myGoalCats() { return S.goalCats || ['Attualità e politica', 'Economia', 'Passioni', 'Lavoro e studio', 'Fede']; }
function xpByCat(day) { const o = {}; for (const e of S.log) if (e.d === day && e.kind !== 'sessione') { const c = catOf(e); o[c] = (o[c] || 0) + (e.w || 1) * 10; } return o; }
function ringSvg(pct, label, size = 84, stroke = 9) {
  const R = (size - stroke) / 2 - 1, C = 2 * Math.PI * R, c = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(--soft)" stroke-width="${stroke}"/><circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="var(--terra)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C * Math.min(1, pct)} ${C}" transform="rotate(-90 ${c} ${c})"/><text x="${c}" y="${c + 5}" text-anchor="middle" font-family="JetBrains Mono" font-size="${size > 60 ? 15 : 11}" fill="var(--ink)">${label}</text></svg>`;
}
function dayCard() {
  const cats = myGoalCats(), per = S.catGoal || 20, goal = cats.length * per;
  const by = xpByCat(today()), xp = xpOf(today());
  const days = Array.from({ length: 14 }, (_, i) => daysAgo(13 - i)), vals = days.map(xpOf), mx = Math.max(goal, ...vals);
  const W = 300, H = 60, bw = W / 14 - 4;
  const bars = days.map((d, i) => `<rect x="${i * (W / 14) + 2}" y="${H - vals[i] / mx * (H - 8)}" width="${bw}" height="${Math.max(1, vals[i] / mx * (H - 8))}" rx="3" fill="${vals[i] >= goal ? 'var(--terra)' : 'var(--line)'}"/>`).join('');
  const doneCats = cats.filter(c => (by[c] || 0) >= per).length;
  return card(h('div', { class: 'row between' }, h('h2', null, 'La tua giornata'), h('div', { class: 'row' }, h('span', { class: 'mono' }, '🔥 ' + streak() + ' giorni'), h('button', { class: 'btn small ghost', onclick: goalSettings }, '⚙'))),
    h('div', { class: 'row', style: { flexWrap: 'nowrap', gap: '14px' } },
      h('div', { html: ringSvg(xp / goal, xp) }),
      h('div', { class: 'grow' }, P(doneCats === cats.length ? 'Tutti gli obiettivi di oggi raggiunti!' : `${doneCats} obiettivi su ${cats.length} raggiunti · ${xp}/${goal} punti`, 'small'),
        h('div', { html: `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${bars}</svg>` }), h('span', { class: 'mono' }, 'ultimi 14 giorni'))),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(92px,1fr))', gap: '8px' } }, cats.map(c => h('div', { style: { textAlign: 'center' } },
      h('div', { html: ringSvg((by[c] || 0) / per, (GOAL_ICON[c] || '') , 56, 6) }), h('div', { class: 'small', style: { lineHeight: 1.2 } }, c), h('span', { class: 'mono' }, (by[c] || 0) + '/' + per)))));
}
function goalSettings() {
  const box = pad();
  const paint = () => box.replaceChildren(card(P('Scegli su cosa vuoi crescere ogni giorno: ogni area ha il suo obiettivo, e insieme fanno l\'obiettivo generale.', 'small'),
    h('div', { class: 'chips' }, GOAL_CATS.map(c => h('button', { class: 'chip', 'aria-pressed': myGoalCats().includes(c) ? 'true' : 'false', onclick: () => { const cur = myGoalCats(); S.goalCats = cur.includes(c) ? cur.filter(x => x !== c) : cur.concat(c); if (!S.goalCats.length) S.goalCats = [c]; save(); paint(); } }, (GOAL_ICON[c] || '') + ' ' + c))),
    h('label', { class: 'lab' }, 'Punti per area al giorno'),
    h('div', { class: 'chips' }, [10, 20, 30, 50].map(v => h('button', { class: 'chip', 'aria-pressed': (S.catGoal || 20) === v ? 'true' : 'false', onclick: () => { S.catGoal = v; save(); paint(); } }, v))),
    P('Una lezione letta e confermata vale 20 punti, una missione principale 30, una secondaria 10, un ripasso o una preghiera 10-20.', 'small muted')));
  paint(); openSheet('Obiettivi del giorno', box, () => render());
}
function selfRateSheet() {
  S.selfRate = S.selfRate || {};
  const rows = THEMES.map(th => {
    const stars = h('div', { class: 'row' });
    const paint = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map(n => h('button', { class: 'chip', 'aria-pressed': (S.selfRate[th] || 0) >= n ? 'true' : 'false', onclick: () => { S.selfRate[th] = n; save(); paint(); } }, '★')));
    paint();
    return h('div', null, h('b', { class: 'small' }, th), stars);
  });
  openSheet('Quanto ne sai?', pad(card(P('Dai un voto sincero a quanto conosci ogni tema: le spiegazioni generate partiranno dal tuo livello e il percorso di Oggi ti proporrà prima i temi in cui vuoi crescere.', 'small'), ...rows,
    P('1 = ne so pochissimo · 5 = lo conosco bene', 'small muted'))), () => render());
}
function levelForTheme(th) { const r = (S.selfRate || {})[th]; return r ? Math.max(1, Math.min(5, r)) : S.level; }
function skillsCard() {
  const sk = skills().slice(0, 6), sr = S.selfRate || {};
  return card(h('div', { class: 'row between' }, h('h2', null, 'Il tuo sapere'), h('button', { class: 'btn small', onclick: selfRateSheet }, 'Autovalutati')),
    sk.length ? sk.map(x => h('div', { class: 'lvl' }, h('span', null, x.n + (sr[x.n] ? ' · ' + '★'.repeat(sr[x.n]) : '')), h('span', { class: 'mono' }, 'liv. ' + x.lv + ' · ' + (LV_NAME[Math.min(x.lv, 5)] || 'Maestro')), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: Math.round(x.frac * 100) + '%' } }))))
      : P('Cresce con le lezioni che confermi di aver letto e capito e con i ripassi.', 'small muted'));
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
    header(S.name ? `${hello}, ${S.name}` : hello, new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })),
    !storageOk && flat(P('Attenzione: questo browser non sta salvando i dati. Usa l\'app installata.')),
    sessionCard(),
    card(h('div', { class: 'row between' }, h('h2', null, 'Missioni'), h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: questSettings }, '⚙'), h('button', { class: 'btn small', onclick: addQuestSheet }, '+ La mia'))),
      S.autoQuests === false ? h('div', { class: 'note contesto' }, h('span', { class: 'mono' }, 'Stai trascurando'), h('div', { class: 'chips' }, neglected().slice(0, 3).map(a => h('button', { class: 'chip', title: 'Aggiungi una missione suggerita', onclick: () => { S.quests.push({ id: uid(), d, src: 'io', type: 'side', area: a, t: pickQuest(a, 'side'), done: false }); save(); render(); } }, '+ ' + AREAS[a].n)))) : null,
      h('span', { class: 'mono' }, 'Main quest'), main.length ? main.map(questEl) : h('div', { class: 'empty' }, 'Nessuna'),
      h('span', { class: 'mono' }, 'Side quest'), side.length ? side.map(questEl) : h('div', { class: 'empty' }, 'Nessuna')),
    h('div', { class: 'row' },
      h('button', { class: 'btn grow' + (due ? ' primary' : ''), onclick: reviewSheet }, due ? `Ripassa ${due} carte` : 'Nessun ripasso oggi'),
      h('button', { class: 'btn grow', onclick: () => go('specchio') }, '✝ ' + ho.n)),
    prepLatest().length ? card(h('div', { class: 'row between' }, h('h2', null, 'Preparato stanotte'), h('span', { class: 'mono' }, fmtDay(prepLatest()[0].date))),
      prepLatest().slice(0, 4).map(prepRow), prepLatest().length > 4 && h('button', { class: 'btn small ghost', onclick: () => { newsTab = 'percorsi'; go('notizie'); } }, 'tutti i ' + prepLatest().length + ' contenuti')) : null,
    S.cont.length ? card(h('div', { class: 'row between' }, h('h2', null, 'Da continuare'), S.cont.length > 4 && h('button', { class: 'btn small ghost', onclick: () => { qTab = 'cont'; go('quaderno'); } }, 'tutto')), S.cont.slice(0, 4).map(contRow)) : null,
    h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openTopic(dt.id) },
      h('span', { class: 'mono' }, 'Scoperta del giorno · ' + dt.c), h('h3', null, dt.n), dt.hk && P(dt.hk)),
    dayCard(),
    skillsCard(),
    card(h('div', { class: 'row between' }, h('h2', null, 'Equilibrio'), h('span', { class: 'mono' }, 'ultimi 14 giorni')),
      Object.keys(AREAS).map(a => h('div', { class: 'bar' }, h('span', null, AREAS[a].n), h('div', { class: 'track' }, h('div', { class: 'fill', style: { width: (b[a] / max * 100) + '%', background: areaColor(a) } })), h('span', { class: 'n' }, b[a]))),
      P('Le missioni dell\'app puntano alle aree più scoperte. Main quest 3 punti, side quest 1, lezioni 2, letture e ascolti meno.', 'small muted'))
  ];
}

/* ======================= NOTIZIE ======================= */
let newsTab = 'Principali', temaSel = 'tutti', newsCache = (() => { try { return JSON.parse(localStorage.getItem('ulisse.news') || '{}'); } catch (e) { return {}; } })();
function viewNotizie() {
  const tl = NEWS_TAGS.map(t => [t, t]).concat([['temi', 'I miei temi'], ['testate', '📰 Le mie testate'], ['ascolta', '🎧 Ascolta'], ['percorsi', 'Percorsi']]);
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  if (newsTab === 'ascolta') body.append(...viewPodcasts());
  else if (newsTab === 'percorsi') {
    const ids = new Set(PREP.items.map(p => p.id));
    const ls = Object.values(S.lessons).filter(l => l.kind === 'notizia' && !ids.has(l.id)).sort((a, b) => (b.gen?.at || 0) - (a.gen?.at || 0));
    const byDay = {}; PREP.items.filter(p => p.kind === 'notizia').forEach(p => (byDay[p.date] = byDay[p.date] || []).push(p));
    body.append(P('Percorsi preparati ogni notte dalla redazione automatica, più quelli che hai creato tu.', 'small muted'),
      ...Object.keys(byDay).sort().reverse().map(d => card(h('span', { class: 'mono' }, 'Stanotte · ' + fmtDay(d)), byDay[d].map(prepRow))),
      ls.length ? h('h3', null, 'Creati da te') : null, ...ls.map(lessonCard), h('button', { class: 'btn', onclick: importSheet }, 'Importa una lezione'));
  } else if (newsTab === 'testate') {
    const mine = (S.testate || []).concat((S.feedsCustom || []).map(f => f.name));
    if (!mine.length) body.append(card(P('Hai un abbonamento a un giornale? Aggiungilo: le sue notizie entrano nell\'app e nelle spiegazioni, e aprendo un articolo lo leggi per intero sul sito dove hai già fatto l\'accesso.'), testatePicker()));
    else {
      body.append(h('div', { class: 'scrollx' }, mine.map(t => h('button', { class: 'chip', 'aria-pressed': temaSel === t ? 'true' : 'false', onclick: () => { temaSel = t; render(); } }, t)), h('button', { class: 'chip', onclick: () => openSheet('Le mie testate', card(testatePicker())) }, '＋ / modifica')));
      if (!mine.includes(temaSel)) temaSel = mine[0];
      const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div', { class: 'spin' }));
      body.append(box); loadNews(box, 'testata:' + temaSel);
    }
  } else if (newsTab === 'temi') {
    const mine = (S.temi || []).concat(S.niche || []);
    if (!mine.length) body.append(card(P('Scegli gli argomenti da seguire: ognuno diventa una sezione con le notizie che ne parlano davvero.'), temiPicker()));
    else {
      body.append(h('div', { class: 'scrollx' }, mine.map(t => h('button', { class: 'chip', 'aria-pressed': temaSel === t ? 'true' : 'false', onclick: () => { temaSel = t; render(); } }, t)), h('button', { class: 'chip', onclick: () => openSheet('I miei temi', card(temiPicker())) }, '＋ / modifica')));
      if (!mine.includes(temaSel)) temaSel = mine[0];
      const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div', { class: 'spin' }));
      body.append(box); loadNews(box, 'tema:' + temaSel);
    }
  } else { body.append(h('div', { class: 'spin' })); loadNews(body); }
  return [header('Notizie', 'il mondo, con il perché'), tabs(tl, newsTab, k => { newsTab = k; }),

    newsTab === 'Principali' && prepLatest().some(p => p.kind === 'notizia') ? h('details', { class: 'card', open: true }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, 'Percorsi di stanotte')), pad(...prepLatest().filter(p => p.kind === 'notizia').map(prepRow))) : null,
    body];
}
const newsJobs = {};
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, ko) => setTimeout(() => ko(new Error('tempo scaduto')), ms))]); }
async function fetchNewsFor(key) {
  let items = [], ok = 0, tot = 0, srv = null;
  srv = await withTimeout(serverNews(), 9000).catch(() => null);
  if (key.startsWith('testata:')) {
    const name = key.slice(8), custom = (S.feedsCustom || []).find(f => f.name === name);
    if (custom) { const xs = await withTimeout(fetchFeed(custom.url), 20000).catch(() => []); items = xs.map(i => Object.assign(i, { feed: name, src: i.src || name })); ok = items.length ? 1 : 0; tot = 1; srv = null; }
    else if (srv && srv.testate && srv.testate[name]) { items = srv.testate[name].slice(); ok = tot = 1; }
  } else if (key.startsWith('tema:')) {
    const name = key.slice(5);
    if (srv && srv.temi && srv.temi[name]) { items = srv.temi[name].slice(); ok = tot = 1; }
    else if (!TEMI_NOMI.includes(name)) { // parola chiave personale: ricerca diretta (può non funzionare su tutti i browser)
      const xs = await withTimeout(fetchFeed(GN('/search', name + ' when:3d')), 20000).catch(() => []);
      items = xs.map(i => Object.assign(i, { feed: name })); ok = items.length ? 1 : 0; tot = 1; srv = null;
    }
  } else if (srv && (srv.sezioni[key] || []).length) {
    items = srv.sezioni[key].slice(); ok = tot = 1;
    // le testate a cui sei abbonato entrano nel flusso principale
    if (key === 'Principali' && srv.testate) for (const t of S.testate || []) items = items.concat((srv.testate[t] || []).slice(0, 8));
  }
  else {
    const feeds = key === 'temi' ? [] : S.feeds.filter(f => f.tag === key);
    tot = feeds.length;
    const res = await Promise.allSettled(feeds.map(f => withTimeout(fetchFeed(f.url), 20000).then(xs => xs.map(i => Object.assign(i, { feed: f.name })))));
    ok = res.filter(r => r.status === 'fulfilled').length;
    items = res.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  }
  items = items.filter(i => i.title);
  if (!items.length) throw new Error('nessuna notizia');
  const lim = Date.now() - 4 * 864e5; items = items.filter(i => !Date.parse(i.date) || Date.parse(i.date) > lim);
  items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return { t: Date.now(), cl: clusterNews(items).slice(0, 40), ok, tot, srv: !!(srv && ok) };
}
function testatePicker() {
  const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const paint = () => {
    const nm = h('input', { type: 'text', placeholder: 'Nome (es. Corriere Fiorentino)' }), url = h('input', { type: 'text', placeholder: 'Indirizzo del feed RSS (facoltativo)' });
    box.replaceChildren(h('span', { class: 'mono' }, 'Testate principali'),
      h('div', { class: 'chips' }, TESTATE_NOMI.map(t => h('button', { class: 'chip', 'aria-pressed': (S.testate || []).includes(t) ? 'true' : 'false', onclick: () => { S.testate = (S.testate || []).includes(t) ? S.testate.filter(x => x !== t) : (S.testate || []).concat(t); save(); paint(); } }, t))),
      h('span', { class: 'mono' }, 'Altra testata con feed RSS'),
      h('div', { class: 'chips' }, (S.feedsCustom || []).map(f => h('button', { class: 'chip', onclick: () => { S.feedsCustom = S.feedsCustom.filter(x => x !== f); save(); paint(); } }, f.name + ' ✕'))), nm, url,
      h('button', { class: 'btn small', onclick: () => { if (!nm.value.trim() || !/^https?:/.test(url.value.trim())) { toast('Serve nome e indirizzo del feed'); return; } S.feedsCustom = (S.feedsCustom || []).concat({ name: nm.value.trim(), url: url.value.trim() }); save(); paint(); } }, '+ Aggiungi'),
      P('Gli articoli si aprono sul sito della testata: se lì hai fatto l\'accesso con il tuo abbonamento, li leggi per intero. L\'app non conserva le tue credenziali.', 'small muted'),
      h('button', { class: 'btn primary', onclick: () => { closeAllSheets(); newsCache = {}; render(); } }, 'Fatto'));
  };
  paint(); return box;
}
function temiPicker() {
  const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  const paint = () => {
    const kw = h('input', { type: 'text', placeholder: 'Oppure una parola chiave tua, poi invio' });
    kw.addEventListener('keydown', e => { if (e.key === 'Enter' && kw.value.trim()) { S.niche = (S.niche || []).concat(kw.value.trim()); save(); paint(); } });
    box.replaceChildren(h('span', { class: 'mono' }, 'Argomenti curati (ricerca ragionata, niente omonimi)'),
      h('div', { class: 'chips' }, TEMI_NOMI.map(t => h('button', { class: 'chip', 'aria-pressed': (S.temi || []).includes(t) ? 'true' : 'false', onclick: () => { S.temi = (S.temi || []).includes(t) ? S.temi.filter(x => x !== t) : (S.temi || []).concat(t); save(); paint(); } }, t))),
      h('span', { class: 'mono' }, 'Parole chiave tue (ricerca semplice)'),
      h('div', { class: 'chips' }, (S.niche || []).map(t => h('button', { class: 'chip', onclick: () => { S.niche = S.niche.filter(x => x !== t); save(); paint(); } }, t + ' ✕'))), kw,
      h('button', { class: 'btn primary', onclick: () => { closeAllSheets(); newsCache = {}; render(); } }, 'Fatto'));
  };
  paint(); return box;
}
async function loadNews(box, forceKey) {
  const key = forceKey || newsTab;
  try {
    if (!newsCache[key] || Date.now() - newsCache[key].t > 15 * 60e3) {
      newsJobs[key] = newsJobs[key] || fetchNewsFor(key).finally(() => { delete newsJobs[key]; });
      if (!newsCache[key]) newsCache[key] = await newsJobs[key];
      else newsJobs[key].then(c => { newsCache[key] = c; try { localStorage.setItem('ulisse.news', JSON.stringify(newsCache)); } catch (e) { } if (box.isConnected && !document.querySelector('.sheet-bg')) render(); }).catch(() => { });
      try { localStorage.setItem('ulisse.news', JSON.stringify(newsCache)); } catch (e) { }
    }
    if ((!forceKey && newsTab !== key) || !box.isConnected) return;
    const c = newsCache[key];
    box.replaceChildren(h('div', { class: 'row between' }, h('span', { class: 'mono' }, `${c.cl.length} storie · ${c.srv ? 'raccolte dalla redazione' : c.ok + '/' + c.tot + ' fonti raggiunte'} · ${fmtDate(c.t)}`),
      h('button', { class: 'btn small ghost', onclick: () => { delete newsCache[key]; render(); } }, '↻')), ...c.cl.map(newsCard));
  } catch (e) {
    if (box.isConnected) box.replaceChildren(netError('le notizie'), h('button', { class: 'btn', onclick: () => { delete newsCache[key]; render(); } }, 'Riprova'));
  }
}
const lessonForRef = ref => ref && Object.values(S.lessons).filter(l => l.gen && l.gen.ref === ref);
function newsCard(cl) {
  const it = cl.main;
  const done = lessonForRef(it.link) || [];
  const night = prepForNews(it, 'quick'), nightFull = prepForNews(it, 'full');
  const more = cl.items.length > 1 ? h('details', null, h('summary', { class: 'mono', style: { cursor: 'pointer' } }, `come ne parlano ${cl.items.length} testate`),
    h('div', { class: 'cluster' }, cl.items.slice(0, 10).map(i => h('a', { href: i.link, target: '_blank', rel: 'noopener' }, h('span', null, (i.src || i.feed) + ' · '), i.title)))) : null;
  return h('div', { class: 'card news' },
    h('div', { class: 'row' }, h('span', { class: 'src' }, [cl.srcs.slice(0, 3).join(' · ') + (cl.srcs.length > 3 ? ' +' + (cl.srcs.length - 3) : ''), fmtDate(it.date)].filter(Boolean).join(' · ')), cl.items.length >= 3 && h('span', { class: 'badge' }, 'in evidenza')),
    h('h3', null, it.title), it.desc && h('p', null, it.desc), more,
    (night || nightFull) ? h('div', { class: 'row' }, night && h('span', { class: 'pill-ready' }, '⚡ capire al volo pronto'), nightFull && h('span', { class: 'pill-ready' }, '🧭 percorso pronto')) : null,
    done.length ? h('div', { class: 'sources' }, done.map(l => h('button', { class: 'btn small primary', onclick: () => openLesson(l.id) }, '▶ ' + (l.chapters.length > 4 ? 'Percorso' : 'Capire') + ' pronto'))) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn small primary', onclick: () => genNewsLesson(cl, 'quick') }, 'Capire · 5 min'),
      h('button', { class: 'btn small', onclick: () => genNewsLesson(cl, 'full') }, 'Percorso · 20 min'),
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
    results.replaceChildren(h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left', borderColor: 'var(--terra)' }, onclick: () => openTopic(catalogAdd(qv, 'Scoperti', '')) }, h('b', null, 'Esplora «' + qv + '»'), P('Lezione, voce, podcast e libri su questo argomento.', 'small muted')));
  });
  const ready = PREP.items.filter(p => p.kind === 'passione').sort((a, b) => b.date.localeCompare(a.date));
  const readyFor = id => ready.find(p => p.topic === id);
  const dtReady = readyFor(dt.id);
  const otd = h('div', null, h('div', { class: 'spin' }));
  onThisDay().then(ev => {
    const r = seeded('otd' + today()); const pick = ev.slice().sort(() => r() - .5).slice(0, 5).sort((a, b) => a.year - b.year);
    otd.replaceChildren(...pick.map(e => h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openTopic(catalogAdd(e.page, 'Storia', e.text.slice(0, 140))) },
      h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } }, e.thumb ? h('img', { class: 'thumb', src: e.thumb, alt: '', style: { width: '56px', height: '56px' }, onerror: ev2 => ev2.target.remove() }) : null,
        h('div', null, h('span', { class: 'mono' }, e.year), h('div', { class: 'small' }, e.text))))));
  }).catch(() => otd.replaceChildren(P('Non disponibile ora.', 'small muted')));
  const tfa = h('div');
  featuredToday().then(f => { if (f) tfa.replaceChildren(h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => openTopic(catalogAdd(f.title, 'Scoperti', '')) },
    h('span', { class: 'mono' }, 'La voce del giorno'), h('div', { class: 'row', style: { flexWrap: 'nowrap', alignItems: 'flex-start' } }, f.thumb ? h('img', { class: 'thumb', src: f.thumb, alt: '' }) : null, h('div', null, h('h3', null, f.title), P((f.extract || '').split(/(?<=\.)\s/).slice(0, 2).join(' '), 'small muted'))))); }).catch(() => { });
  const fresh = Object.values(S.catalog).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 10);
  return [header('Scopri', 'allarga lo sguardo'), t,
    h('div', { class: 'card hero' }, h('span', { class: 'mono' }, 'Proposta del giorno · ' + dt.c), h('h2', null, dt.n), dt.hk && P(dt.hk, ''),
      h('div', { class: 'row' }, dtReady ? h('button', { class: 'btn primary', onclick: () => openPrepared(dtReady) }, '▶ Lezione pronta · ' + dtReady.chapters + ' capitoli') : null, h('button', { class: 'btn', onclick: () => openTopic(dt.id) }, 'Esplora'))),
    ready.length ? [h('h2', null, 'Pronte da scoprire'), h('div', { class: 'scrollx', style: { gap: '10px' } }, ready.slice(0, 12).map(p => h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left', minWidth: '230px', maxWidth: '260px' }, onclick: () => openPrepared(p) },
      h('span', { class: 'mono' }, (topicOf(p.topic) || {}).c || 'Scoperta'), h('b', null, p.title), p.summary && h('span', { class: 'small muted' }, p.summary), h('span', { class: 'pill-ready' }, '~' + (p.chapters * 3) + ' min'))))] : null,
    tfa,
    card(h('h2', null, 'Accadde oggi'), P('Tocca un evento per scoprirne la storia.', 'small muted'), otd),
    search, results,
    fresh.length ? flat(h('span', { class: 'mono' }, 'Rami che hai scoperto'), h('div', { class: 'chips' }, fresh.map(x => h('button', { class: 'chip', onclick: () => openTopic(x.id) }, x.n)))) : null,
    h('details', { class: 'card flat' }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, 'Livello e modo di esplorare')), lv)];
}
function openTopic(id) {
  const t = topicOf(id); if (!t) return;
  S.explored[id] = (S.explored[id] || 0) + 1; bumpInterest([id], 1); addLog('scoperta', 'esplora', t.n, 0.5);
  contAdd({ type: 'topic', id, title: t.n, area: 'scoperta' });
  const series = (S.series[id] || []).map(x => S.lessons[x]).filter(Boolean);
  const nightly = PREP.items.filter(p => p.topic === id || (p.kind === 'passione' && p.title && p.title.toLowerCase().includes(String(t.n).toLowerCase())));
  const favBtn = h('button', { class: 'btn small', 'aria-pressed': S.favs.includes(id) ? 'true' : 'false', onclick: () => {
    if (S.favs.includes(id)) S.favs = S.favs.filter(x => x !== id); else { S.favs.push(id); bumpInterest([id], 3); toast('Aggiunto alle passioni'); }
    favBtn.setAttribute('aria-pressed', S.favs.includes(id) ? 'true' : 'false'); save();
  } }, '★ Passione');
  const sum = h('div', null, h('div', { class: 'spin' }));
  wikiResolve(t.w || t.n).then(s => sum.replaceChildren(h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } },
    s.thumbnail && h('img', { class: 'thumb', src: s.thumbnail.source, alt: '', onerror: e => e.target.remove() }),
    h('div', { class: 'grow' }, P(s.extract || '', 'small'))), wikiReader(s.title || t.w))).catch(() => sum.replaceChildren(P('Nessuna voce enciclopedica trovata.', 'small muted')));
  // rami: catalogo, figli scoperti, voci simili
  const kids = Object.values(S.catalog).filter(c => c.from === id);
  const ramiBox = h('div', { class: 'chips' }, t.r.map(r => TOP[r] || S.catalog[r]).filter(Boolean).concat(kids).map(x => h('button', { class: 'chip', onclick: () => { openTopic(x.id); } }, x.n + ' →')));
  wikiRelated(t.w, 6).then(rel => ramiBox.append(...rel.filter(n => n.toLowerCase() !== t.n.toLowerCase()).map(n => h('button', { class: 'chip', style: { borderStyle: 'dashed' }, onclick: () => { const nid = catalogAdd(n, t.c, '', id); openTopic(nid); } }, n + ' →')))).catch(() => { });
  const learn = card(h('span', { class: 'mono' }, S.mode === 'verticale' ? 'Impara · in verticale' : 'Impara'), nightly.map(prepRow),
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
    card(h('span', { class: 'mono' }, 'Dall\'enciclopedia'), sum),
    card(h('span', { class: 'mono' }, '🎧 Ascolta'), episodesBox(() => episodeSearch(t.n, 4, true), 'scoperta', 'Nessun episodio in italiano davvero su questo tema.')),
    card(h('span', { class: 'mono' }, '📚 Leggi'), (() => { const b = h('div', null, h('div', { class: 'spin' })); bookSearch(t.n, 4).then(bs => b.replaceChildren(...(bs.length ? bs.map(x => h('div', { style: { padding: '6px 0', borderTop: '1px solid var(--soft)' } }, h('a', { href: x.link, target: '_blank', rel: 'noopener' }, x.title), h('div', { class: 'mono' }, [x.authors, x.year].filter(Boolean).join(' · ')))) : [P('Nessun libro trovato.', 'small muted')]))).catch(() => b.replaceChildren(P('Ricerca libri non disponibile.', 'small muted'))); return b; })()),
    otherSources(t.n, ({ Storia: 'Storia', Spirito: 'Fede e Scrittura', Tecnica: 'Scienza e tecnologia', 'Cielo e Terra': 'Scienza e tecnologia', Vita: 'Scienza e tecnologia', Mente: 'Scienza e tecnologia', Società: 'Politica italiana' })[t.c] || 'default'),
    card(h('span', { class: 'mono' }, '▶ Guarda e consulta'), h('div', { class: 'row' }, linkBtn('https://www.youtube.com/results?search_query=' + encodeURIComponent(t.n + ' spiegato documentario'), 'Video su YouTube'), linkBtn('https://www.treccani.it/enciclopedia/ricerca/' + encodeURIComponent(t.n) + '/', 'Enciclopedia Treccani'))),
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
    h('div', { class: 'scrollx' }, S.techKw.map(k => h('button', { class: 'chip', 'aria-pressed': k === techQ ? 'true' : 'false', onclick: () => { techQ = k; render(); } }, k)), h('button', { class: 'chip', onclick: techTopicsSheet }, '＋ / modifica')),
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
let specTab = 'oggi', litTab = 'vangelo';
function liturgyCard() {
  const box = h('div', null, h('div', { class: 'spin' }));
  serverNews().then(srv => {
    const L = srv.liturgia;
    if (!L) { box.replaceChildren(P('Le letture di oggi non sono ancora arrivate.', 'small muted'), linkBtn('https://www.vaticannews.va/it/vangelo-del-giorno-e-parola-del-giorno.html', 'Apri Vatican News')); return; }
    const paint = () => {
      const txt = { vangelo: L.vangelo, letture: L.letture, papi: L.papi }[litTab] || [];
      box.replaceChildren(
        h('div', { class: 'row' }, h('span', { class: 'pill-ready' }, L.date === today() ? '✓ di oggi' : 'del ' + fmtDay(L.date)), L.ref && h('span', { class: 'mono' }, 'Vangelo: ' + L.ref)),
        h('div', { class: 'chips' }, [['vangelo', 'Vangelo'], ['letture', 'Letture'], ['papi', 'Commento dei Papi']].filter(([k]) => (L[k] || []).length).map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': litTab === k ? 'true' : 'false', onclick: () => { litTab = k; paint(); } }, l))),
        h('div', { class: 'prose' }, txt.map((t, n) => n < 2 && litTab !== 'papi' ? h('p', { class: 'mono', style: { margin: '0 0 .4em' } }, t) : h('p', null, t))),
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => speak(txt.join(' ')) }, '🔊 Ascolta'), linkBtn(L.link, 'Fonte: Vatican News', 'ghost')));
    };
    paint();
  }).catch(() => box.replaceChildren(linkBtn('https://www.vaticannews.va/it/vangelo-del-giorno-e-parola-del-giorno.html', 'Apri le letture su Vatican News')));
  return card(h('h2', null, 'Le letture di oggi'), box);
}
function gospelCard() {
  const box = h('div');
  serverNews().then(srv => {
    const g = (srv.vangelo || [])[0];
    if (!g || !(g.paras || []).length) { box.replaceChildren(linkBtn('https://getupandwalk.gesuiti.it/', 'Prega su Get Up and Walk')); return; }
    box.replaceChildren(
      h('div', { class: 'row' }, h('span', { class: 'pill-ready' }, g.oggi ? '✓ di oggi' : 'del ' + fmtDay(g.date)), h('span', { class: 'mono' }, g.ref)),
      h('h3', null, g.title),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => gospelPrayer(g) }, 'Prega con il Vangelo'), linkBtn(g.link, 'Apri l\'originale', 'ghost')));
  }).catch(() => box.replaceChildren(linkBtn('https://getupandwalk.gesuiti.it/', 'Prega su Get Up and Walk')));
  return h('div', { class: 'card hero' }, h('span', { class: 'mono' }, 'Preghiera guidata sul Vangelo · Get Up and Walk, gesuiti'), box);
}
function gospelPrayer(g) {
  const steps = []; let cur = [];
  for (const p of g.paras) { cur.push(p); if (cur.join(' ').length > 420 || /^(Come un amico|Recito|Mi preparo|Chiedo|Leggo|Immagino|Mi metto)/i.test(p)) { steps.push(cur); cur = []; } }
  if (cur.length) steps.push(cur);
  let i = 0;
  const host = pad();
  openSheet(g.ref, host);
  addLog('fede', 'vangelo', g.ref, 2);
  const show = () => {
    const done = i >= steps.length;
    host.replaceChildren(h('div', { class: 'read-progress' }, h('div', { style: { width: Math.round(Math.min(i + 1, steps.length) / steps.length * 100) + '%' } })),
      done ? card(h('h3', null, 'Amen.'), P('Se vuoi, lascia una riga nel diario su ciò che ti ha toccato.'), h('button', { class: 'btn', onclick: journalSheet }, 'Scrivi nel diario'), linkBtn(g.link, 'Fonte: Get Up and Walk', 'ghost'))
        : card(h('span', { class: 'mono' }, `passo ${i + 1} di ${steps.length}`), h('div', { class: 'prose' }, steps[i].map(t => h('p', null, t)))),
      !done && h('div', { class: 'row' }, h('button', { class: 'btn', disabled: i === 0, onclick: () => { i--; stopSpeak(); show(); } }, '‹'), h('button', { class: 'btn', onclick: () => speak(steps[i].join(' ')) }, '🔊'), h('button', { class: 'btn primary grow', onclick: () => { i++; stopSpeak(); show(); } }, i === steps.length - 1 ? 'Concludi' : 'Avanti ›')));
    host.parentElement && (host.parentElement.scrollTop = 0);
  };
  show();
}
function viewSpecchio() {
  const cur = currentHour();
  const t = tabs([['oggi', 'Oggi'], ['ore', 'Liturgia delle Ore'], ['parola', 'La Parola'], ['pratiche', 'Pratiche'], ['diario', 'Diario']], specTab, k => { specTab = k; });
  let body;
  if (specTab === 'oggi') {
    const pa = prepLatest().find(p => p.mode === 'parola');
    body = [gospelCard(), liturgyCard(),
      pa ? card(h('span', { class: 'mono' }, 'Approfondisci il Vangelo di oggi'), prepRow(pa)) : null,
      h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => { specTab = 'ore'; render(); } }, h('span', { class: 'mono' }, 'Adesso · ' + cur.when), h('b', null, cur.n), P(cur.what.split('. ')[0] + '.', 'small muted'))];
  } else if (specTab === 'ore') {
    body = [hourCard(cur, true), h('h3', null, 'Le altre Ore'), ...HOURS.filter(o => o !== cur).map(o => h('details', { class: 'card flat' }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, o.n), h('span', { class: 'mono' }, ' · ' + o.when)), hourCard(o, false)))];
  } else if (specTab === 'parola') {
    const ref = h('input', { type: 'text', placeholder: 'Un brano a scelta, es. «Marco 4» o «Salmo 139»' });
    ref.addEventListener('keydown', e => { if (e.key === 'Enter' && ref.value.trim()) genFaithLesson('bible', ref.value.trim()); });
    const fq = h('input', { type: 'text', placeholder: 'Una tua domanda sulla fede…' });
    fq.addEventListener('keydown', e => { if (e.key === 'Enter' && fq.value.trim()) genFaithLesson('faith', fq.value.trim()); });
    const fede = Object.values(allLessons()).filter(l => l.kind === 'fede' && l.chapters).sort((a, b) => (b.gen?.at || 0) - (a.gen?.at || 0));
    body = [card(h('h2', null, 'Esplora un brano'), P('Contesto storico, parole chiave, come lo ha letto la Chiesa e cosa può dire a te.', 'small muted'),
        h('details', null, h('summary', { class: 'mono', style: { cursor: 'pointer' } }, BIBLE.length + ' brani suggeriti'), h('div', { class: 'chips', style: { marginTop: '8px' } }, BIBLE.map(([r, tt]) => h('button', { class: 'chip', title: tt, onclick: () => genFaithLesson('bible', r, tt) }, r + ' · ' + tt)))), ref,
        linkBtn('https://www.bibbiaedu.it/', 'Bibbia CEI', 'ghost')),
      card(h('h2', null, 'Il perché della fede'), P('Domande serie, risposte con Scrittura, Catechismo, santi e anche le obiezioni.', 'small muted'),
        h('details', null, h('summary', { class: 'mono', style: { cursor: 'pointer' } }, FAITH_Q.length + ' domande'), h('div', { class: 'chips', style: { marginTop: '8px' } }, FAITH_Q.map(q => h('button', { class: 'chip', onclick: () => genFaithLesson('faith', q) }, q)))), fq,
        linkBtn('https://www.vatican.va/archive/catechism_it/index_it.htm', 'Catechismo della Chiesa cattolica', 'ghost')),
      fede.length ? [h('h3', null, 'Le tue lezioni di fede'), fede.slice(0, 10).map(lessonCard)] : null];
  } else if (specTab === 'pratiche') {
    body = Object.entries(GUIDES).map(([k, g]) => h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => guideSheet(k) }, h('h3', null, g.n), h('span', { class: 'small muted' }, g.intro)));
  } else {
    const jr = S.journal.slice().reverse();
    body = [h('button', { class: 'btn primary', onclick: journalSheet }, '+ Scrivi nel diario'),
      jr.length ? jr.slice(0, 40).map(j => flat(h('span', { class: 'mono' }, j.d + (j.from ? ' · ' + j.from : '')), j.prompt && h('b', { class: 'small' }, j.prompt), h('div', { class: 'small' }, j.text)))
        : h('div', { class: 'empty' }, 'Le tue riflessioni, anche quelle delle lezioni, finiscono qui.')];
  }
  return [header('Specchio', 'fermarsi, pregare, conoscersi'), t, ...[body].flat(Infinity).filter(Boolean)];
}

/* ======================= QUADERNO ======================= */
let qTab = 'cont', qSearch = '';
function noteSheet(n) {
  n = n || {};
  const isNew = !n.id;
  const title = h('input', { type: 'text', value: n.title || '', placeholder: 'Titolo' });
  const text = h('textarea', { placeholder: 'Scrivi la tua nota… (supporta **grassetto** ed elenchi con - )', style: { minHeight: '220px' } }); text.value = n.text || '';
  const tags = h('input', { type: 'text', value: (n.tags || []).join(', '), placeholder: 'Etichette, separate da virgola' });
  const close = openSheet(isNew ? 'Nuova nota' : 'Nota', pad(card(title, text, tags, n.from ? h('span', { class: 'mono' }, 'da: ' + n.from) : null,
    h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: () => {
      if (!title.value.trim() && !text.value.trim()) return;
      const note = Object.assign(n, { id: n.id || uid(), title: title.value.trim() || 'Senza titolo', text: text.value, tags: tags.value.split(',').map(x => x.trim()).filter(Boolean), at: Date.now(), created: n.created || Date.now() });
      S.notes = S.notes || []; if (isNew) S.notes.unshift(note); save(); toast('Nota salvata'); close();
    } }, 'Salva'), !isNew && h('button', { class: 'btn', onclick: () => { S.notes = S.notes.filter(x => x !== n); save(); close(); } }, 'Elimina')))), () => render());
}
function notesMarkdown(list) {
  return '# Note di Ulisse\n\n' + list.map(n => `## ${n.title}\n\n_${new Date(n.at).toLocaleDateString('it-IT')}${n.from ? ' · da «' + n.from + '»' : ''}${(n.tags || []).length ? ' · ' + n.tags.map(t => '#' + t.replace(/\s+/g, '-')).join(' ') : ''}_\n\n${n.text}\n`).join('\n');
}
function download(name, text, type) {
  try { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); } catch (e) { copyText(text); }
}
function exportSheet() {
  const notes = S.notes || [];
  const cardsCsv = 'domanda;risposta;origine;prossimo ripasso\n' + S.cards.map(c => [c.front, c.back, c.from, c.due].map(x => '"' + String(x || '').replace(/"/g, '""') + '"').join(';')).join('\n');
  openSheet('Esporta', pad(card(
    h('h3', null, 'Note (' + notes.length + ')'), P('In Markdown: si apre con Obsidian, Notion, Google Docs, Word e qualsiasi editor di testo.', 'small muted'),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => download('ulisse-note-' + today() + '.md', notesMarkdown(notes), 'text/markdown') }, 'Scarica .md'), h('button', { class: 'btn', onclick: () => copyText(notesMarkdown(notes)) }, 'Copia testo'))),
    card(h('h3', null, 'Carte di ripasso (' + S.cards.length + ')'), P('In CSV: si apre con Excel o Fogli Google, o si importa in Anki.', 'small muted'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => download('ulisse-carte-' + today() + '.csv', cardsCsv, 'text/csv') }, 'Scarica .csv'))),
    card(h('h3', null, 'Diario (' + S.journal.length + ')'), h('button', { class: 'btn', onclick: () => download('ulisse-diario-' + today() + '.md', '# Diario\n\n' + S.journal.map(j => `## ${j.d}${j.prompt ? ' · ' + j.prompt : ''}\n\n${j.text}\n`).join('\n'), 'text/markdown') }, 'Scarica .md'))));
}
function viewQuaderno() {
  const due = dueCards().length;
  const notes = S.notes || [];
  const search = h('input', { type: 'search', placeholder: 'Cerca in note, carte, lezioni e diario', value: qSearch });
  const t = tabs([['cont', 'Da continuare'], ['note', 'Note · ' + notes.length], ['carte', 'Carte · ' + S.cards.length], ['lezioni', 'Lezioni'], ['storico', 'Storico']], qTab, k => { qTab = k; });
  const results = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const doSearch = () => {
    qSearch = search.value; const q = qSearch.toLowerCase().trim();
    if (!q) { results.replaceChildren(); body.hidden = false; return; }
    body.hidden = true;
    const hit = s => String(s || '').toLowerCase().includes(q);
    const out = [];
    notes.filter(n => hit(n.title) || hit(n.text) || (n.tags || []).some(hit)).forEach(n => out.push(h('button', { class: 'card flat', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => noteSheet(n) }, h('span', { class: 'mono' }, '📝 nota'), h('b', null, n.title), h('span', { class: 'small muted' }, n.text.slice(0, 140)))));
    S.cards.filter(c => hit(c.front) || hit(c.back)).slice(0, 30).forEach(c => out.push(h('details', { class: 'card flat' }, h('summary', null, h('span', { class: 'mono' }, '🗂 carta · '), h('b', null, c.front)), P(c.back))));
    Object.values(allLessons()).filter(l => l.chapters && (hit(l.title) || hit(l.summary))).slice(0, 20).forEach(l => out.push(lessonCard(l)));
    S.journal.filter(j => hit(j.text) || hit(j.prompt)).forEach(j => out.push(flat(h('span', { class: 'mono' }, '✎ diario · ' + j.d), P(j.text))));
    results.replaceChildren(...(out.length ? out : [h('div', { class: 'empty' }, 'Nessun risultato.')]));
  };
  search.addEventListener('input', doSearch);
  let bodyKids;
  if (qTab === 'cont') bodyKids = S.cont.length ? [card(S.cont.map(contRow))] : [h('div', { class: 'empty' }, 'Niente in sospeso. Lezioni e argomenti lasciati a metà compaiono qui.')];
  else if (qTab === 'note') {
    const tagsAll = [...new Set(notes.flatMap(n => n.tags || []))];
    bodyKids = [h('div', { class: 'row' }, h('button', { class: 'btn primary grow', onclick: () => noteSheet() }, '+ Nuova nota'), h('button', { class: 'btn', onclick: exportSheet }, 'Esporta')),
      tagsAll.length ? h('div', { class: 'chips' }, tagsAll.map(tg => h('button', { class: 'chip', onclick: () => { search.value = tg; doSearch(); } }, '#' + tg))) : null,
      notes.length ? notes.map(n => h('button', { class: 'card', style: { cursor: 'pointer', textAlign: 'left' }, onclick: () => noteSheet(n) }, h('span', { class: 'mono' }, new Date(n.at).toLocaleDateString('it-IT') + (n.from ? ' · ' + n.from : '')), h('b', null, n.title), n.text && h('div', { class: 'small muted' }, n.text.slice(0, 200)), (n.tags || []).length ? h('div', { class: 'chips' }, n.tags.map(tg => h('span', { class: 'tag muted' }, '#' + tg))) : null))
        : h('div', { class: 'empty' }, 'Nessuna nota. Puoi scriverne una qui o con «📝 Nota» dentro ogni lezione.')];
  } else if (qTab === 'carte') {
    const cs = S.cards.slice().reverse().slice(0, 200);
    bodyKids = [h('div', { class: 'row' }, h('button', { class: 'btn grow' + (due ? ' primary' : ''), onclick: reviewSheet }, due ? `Ripassa ${due} carte` : 'Niente da ripassare oggi'), h('button', { class: 'btn', onclick: newCardSheet }, '+ Carta'), h('button', { class: 'btn', onclick: exportSheet }, 'Esporta')),
      cs.length ? cs.map(c => h('details', { class: 'card flat' }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, c.front)),
        h('p', { style: { margin: '6px 0' } }, c.back), h('div', { class: 'row between' }, h('span', { class: 'mono' }, (c.from || '') + ' · ripasso ' + c.due),
          h('button', { class: 'btn small ghost', onclick: () => { S.cards = S.cards.filter(x => x !== c); save(); render(); } }, 'Elimina')))) : h('div', { class: 'empty' }, 'Nessuna carta.')];
  } else if (qTab === 'lezioni') {
    const ls = Object.values(allLessons()).filter(l => l.chapters).sort((a, b) => (b.gen?.at || 0) - (a.gen?.at || 0));
    const groups = {}; ls.forEach(l => (groups[themeOf(l)] = groups[themeOf(l)] || []).push(l));
    bodyKids = [h('button', { class: 'btn', onclick: importSheet }, 'Importa una lezione'),
      Object.entries(groups).map(([g, list]) => h('details', { class: 'card flat', open: true }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, g + ' · ' + list.length)),
        pad(...list.map(L => h('div', null, lessonCard(L), S.lessons[L.id] && h('button', { class: 'btn small ghost', onclick: () => { delete S.lessons[L.id]; contDone('lesson', L.id); save(); render(); } }, 'Elimina'))))))];
  } else {
    const ev = S.log.filter(e => e.kind !== 'sessione').slice(-100).reverse();
    bodyKids = [ev.length ? ev.map(e => h('div', { class: 'row', style: { borderTop: '1px solid var(--soft)', paddingTop: '6px' } }, h('span', { class: 'dotc', style: { background: areaColor(e.area) } }), h('span', { class: 'mono' }, e.d), h('span', { class: 'small grow' }, e.kind + ' · ' + e.title)))
      : h('div', { class: 'empty' }, 'Ancora nulla.')];
  }
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, ...bodyKids.flat(Infinity).filter(Boolean));
  if (qSearch) setTimeout(doSearch, 0);
  return [header('Quaderno', `${notes.length} note · ${S.cards.length} carte · ${Object.values(allLessons()).filter(l => l.chapters).length} lezioni`), search, results, t, body];
}

/* ======================= IMPOSTAZIONI ======================= */
function engineCard() {
  const status = h('div', { class: 'small' });
  const prog = h('div', { class: 'small muted' });
  const sel = h('select', { disabled: true }, h('option', null, S.ai.localModel || 'caricamento elenco…'));
  const gpu = hasWebGPU();
  if (gpu) localModels().then(ms => {
    const def = defaultLocal(ms);
    sel.replaceChildren(...ms.map(m => h('option', { value: m.id, selected: m.id === (S.ai.localModel || def) ? true : null }, m.id.replace(/-q4f(16|32)_1-MLC$/, '') + ' · ~' + (m.mb >= 1000 ? (m.mb / 1000).toFixed(1) + ' GB' : m.mb + ' MB'))));
    sel.disabled = false;
  }).catch(() => sel.replaceChildren(h('option', null, 'elenco non disponibile (serve la rete)')));
  sel.addEventListener('change', () => { S.ai.localModel = sel.value; save(); });
  const test = h('button', { class: 'btn small primary', disabled: !gpu || null, onclick: async () => {
    test.disabled = true; S.ai.localModel = sel.value || S.ai.localModel; save();
    status.textContent = 'Scarico e preparo il modello (solo la prima volta, poi resta sul telefono)…';
    onEngineProgress = r => { prog.textContent = Math.round((r.progress || 0) * 100) + '% · ' + (r.text || '').slice(0, 120); };
    try {
      const t0 = Date.now(); const out = await localCall('Rispondi solo con JSON.', 'Scrivi {"saluto": "una frase di benvenuto in italiano"}', 60);
      status.textContent = '✓ Pronto. Risposta di prova in ' + Math.round((Date.now() - t0) / 1000) + ' s: ' + out.slice(0, 90);
    } catch (e) { status.textContent = '✗ ' + (e.message || e); }
    onEngineProgress = null; test.disabled = false;
  } }, 'Scarica e prova');
  return card(h('h3', null, 'Motore sul telefono'),
    P(gpu ? 'Un modello linguistico gira direttamente qui, gratis, senza account né limiti, anche offline una volta scaricato. Serve per le richieste al momento: «Capire al volo», lezioni su un argomento, paper, Bibbia.' : 'Questo browser non supporta WebGPU, quindi il modello sul telefono non è disponibile. Su Android usa Chrome aggiornato; su iPhone serve iOS 26 o successivo. I contenuti preparati stanotte funzionano comunque.'),
    gpu && h('label', { class: 'lab' }, 'Modello: più è grande, più scrive bene ma più è lento e pesante'), gpu && sel,
    gpu && h('div', { class: 'row' }, test), status, prog,
    P('Consiglio: su Android 1,5-2 miliardi di parametri (circa 1-1,5 GB); su iPhone i modelli più piccoli. Le lezioni brevi richiedono qualche minuto.', 'small muted'));
}
function settingsSheet() {
  const name = h('input', { type: 'text', value: S.name, placeholder: 'Come ti chiami?' });
  const gkey = h('input', { type: 'text', value: S.ai.key, placeholder: 'Facoltativa: chiave Gemini (AIza…)', autocomplete: 'off' });
  const groqKey = h('input', { type: 'text', value: S.ai.groqKey || '', placeholder: 'gsk_…', autocomplete: 'off' });
  const groqStatus = h('div', { class: 'small muted' });
  const useG = h('input', { type: 'checkbox', checked: S.ai.provider === 'gemini' ? true : null });
  const feeds = h('textarea', { style: { fontFamily: 'var(--f-mono)', fontSize: '11.5px', minHeight: '150px' } }); feeds.value = S.feeds.map(f => [f.tag, f.name, f.url].join(' | ')).join('\n');
  const niche = h('input', { type: 'text', value: S.niche.join(', ') });
  const tech = h('input', { type: 'text', value: S.techKw.join(', ') });
  const imp = h('textarea', { placeholder: 'Incolla qui un backup per ripristinarlo', style: { fontFamily: 'var(--f-mono)', fontSize: '12px' } });
  const night = prepLatest();
  const close = openSheet('Impostazioni', pad(
    card(h('h3', null, 'Redazione notturna'),
      P('Ogni notte un modello aperto, su un computer gratuito di GitHub, prepara i percorsi sulle notizie principali, la scoperta e la Parola del giorno. Li trovi la mattina, uguali per tutti quelli che usano l\'app.'),
      P(night.length ? `Ultima edizione: ${fmtDay(night[0].date)} · ${night.length} contenuti · modello ${PREP.modello || ''}` : 'Nessuna edizione ancora disponibile.', 'small muted')),
    card(h('h3', null, 'Quale motore usare al momento'),
      h('div', { class: 'chips' }, [['veloce', '⚡ Veloce (Groq)'], ['telefono', '📱 Sul telefono (lento, offline)']].map(([k, l]) => h('button', { class: 'chip', 'aria-pressed': (S.ai.mode || 'veloce') === k ? 'true' : 'false', onclick: ev => { S.ai.mode = k; save(); ev.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === ev.currentTarget ? 'true' : 'false')); } }, l))),
      P('Veloce: 10-20 secondi, scrive meglio, serve la chiave Groq. Sul telefono: nessun account e funziona offline, ma un capitolo richiede minuti e il modello è piccolo. I contenuti preparati in anticipo sono gli stessi in entrambi i casi.', 'small muted')),
    card(h('h3', null, 'Motore veloce · Groq (consigliato)'),
      P('Per le notizie non ancora pronte: spiegazione completa in 10-20 secondi. Gratis con un account Groq (niente carta di credito); se un modello raggiunge il limite del minuto l\'app passa da sola a un altro, e in ultimo al modello sul telefono. Groq non usa i tuoi dati per addestrare i modelli.', 'small'),
      h('label', { class: 'lab' }, 'Chiave Groq · ', h('a', { href: 'https://console.groq.com/keys', target: '_blank', rel: 'noopener' }, 'creala qui gratis')), groqKey,
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => {
        groqStatus.textContent = 'Provo…'; const old = S.ai.groqKey; S.ai.groqKey = groqKey.value.trim();
        try { const t0 = Date.now(); const out = await groqCall('Rispondi solo con JSON.', 'Scrivi {"ok": "pronto"}', 50); groqStatus.textContent = '✓ Funziona: risposta in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s'; }
        catch (e) { groqStatus.textContent = '✗ ' + (e.message || e); S.ai.groqKey = old; }
      } }, 'Prova la chiave')), groqStatus),
    engineCard(),
    card(h('h3', null, 'Lettura'), h('label', { class: 'lab' }, 'Dimensione del testo'),
      h('div', { class: 'chips' }, [[0.92, 'Piccolo'], [1, 'Normale'], [1.1, 'Grande'], [1.22, 'Molto grande']].map(([v, l]) => h('button', { class: 'chip', 'aria-pressed': (S.fontScale || 1) === v ? 'true' : 'false', onclick: ev => { S.fontScale = v; save(); applyLook(); ev.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === ev.currentTarget ? 'true' : 'false')); } }, l))),
      h('label', { class: 'lab' }, 'Aspetto'),
      h('div', { class: 'chips' }, [['auto', 'Come il telefono'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([v, l]) => h('button', { class: 'chip', 'aria-pressed': (S.theme || 'auto') === v ? 'true' : 'false', onclick: ev => { S.theme = v; save(); applyLook(); ev.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === ev.currentTarget ? 'true' : 'false')); } }, l)))),
    card(h('label', { class: 'lab' }, 'Nome'), name,
      h('label', { class: 'lab' }, 'Fonti delle notizie (una per riga: sezione | nome | indirizzo RSS). Sezioni: ' + NEWS_TAGS.join(', ')), feeds,
      h('label', { class: 'lab' }, 'I miei temi (separati da virgola)'), niche,
      h('label', { class: 'lab' }, 'Argomenti tecnici (separati da virgola)'), tech),
    h('details', { class: 'card flat' }, h('summary', { style: { cursor: 'pointer' } }, h('b', null, 'Avanzate: servizio esterno facoltativo')),
      pad(P('Se un giorno vorrai più qualità e velocità, puoi usare una chiave gratuita di Google Gemini al posto del modello sul telefono. Non è necessaria.', 'small muted'), gkey, h('label', { class: 'row small' }, useG, 'Usa Gemini invece del modello sul telefono'))),
    h('button', { class: 'btn primary', onclick: () => {
      S.name = name.value.trim();
      S.ai.groqKey = groqKey.value.trim();
      S.ai.key = gkey.value.trim(); S.ai.provider = useG.checked && S.ai.key ? 'gemini' : 'locale';
      const fs = feeds.value.split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p.length >= 3 && /^https?:/.test(p[2])).map(([tag, n, u]) => ({ tag: NEWS_TAGS.includes(tag) ? tag : 'Principali', name: n, url: u }));
      if (fs.length) S.feeds = fs;
      S.niche = niche.value.split(',').map(x => x.trim()).filter(Boolean);
      S.techKw = tech.value.split(',').map(x => x.trim()).filter(Boolean);
      newsCache = {}; techQ = null; save(); close(); render(); toast('Salvato');
    } }, 'Salva'),
    card(h('h3', null, 'Backup'),
      P('I tuoi dati (missioni, carte, lezioni, diario) restano su questo telefono. Ogni tanto copia il backup e salvalo in una nota o mandalo a te stesso.', 'small muted'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => copyText(JSON.stringify(S)) }, 'Copia backup'),
        h('button', { class: 'btn', onclick: () => { try { const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S)], { type: 'application/json' })), download: 'ulisse-backup-' + today() + '.json' }); document.body.append(a); a.click(); a.remove(); } catch (e) { toast('Download non disponibile qui'); } } }, 'Scarica file')),
      imp, h('button', { class: 'btn', onclick: () => { try { const d = JSON.parse(imp.value); if (!d.v) throw 0; localStorage.setItem(KEY, JSON.stringify(d)); S = load();
applyLook();
for (const [id, L] of Object.entries(S.lessons)) if (L.gen && L.gen.notte) { S.prepMeta = S.prepMeta || {}; S.prepMeta[id] = { title: L.title, kind: L.kind, area: L.area, tags: L.tags || [], gen: { topic: L.gen.topic } }; delete S.lessons[id]; }
save(); close(); render(); toast('Backup ripristinato'); } catch (e) { toast('Backup non valido'); } } }, 'Ripristina')),
    flat(h('span', { class: 'mono' }, 'Ulisse v1.2'), P('Fonti gratuite: Google News e feed RSS, Wikipedia, OpenAlex, Apple Podcasts, Google Books, iBreviary. Modelli aperti via Ollama (notte) e WebLLM (telefono). Codice: github.com/Torre28/Ulisse', 'small muted'))));
}

/* primo avvio: per chi riceve l'app da un amico */
function welcomeSheet() {
  const name = h('input', { type: 'text', placeholder: 'Il tuo nome' });
  const tech = h('input', { type: 'text', placeholder: 'Es. intelligenza artificiale, energia solare' });
  const close = openSheet('Benvenuto in Ulisse', pad(card(
    P('Un compagno per il tempo libero: le notizie con il loro perché, nuove passioni da scoprire, paper resi digeribili, preghiera e piccole missioni per tenere in equilibrio la vita.', ''),
    h('label', { class: 'lab' }, 'Come ti chiami?'), name,
    h('label', { class: 'lab' }, 'Su cosa vorresti diventare esperto? (facoltativo, separati da virgola)'), tech,
    P('Tutto quello che fai resta solo su questo telefono.', 'small muted'),
    h('button', { class: 'btn primary', onclick: () => {
      S.name = name.value.trim(); if (tech.value.trim()) S.techKw = tech.value.split(',').map(x => x.trim()).filter(Boolean);
      S.onboarded = true; save(); close(); render();
    } }, 'Iniziamo'))));
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
  closeAllSheets();
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
  if (S.autoQuests === false) return;
  const mine = S.quests.filter(q => q.d === d && q.src === 'app');
  const want = { main: S.nMain || 2, side: S.nSide || 3 };
  const order = neglected();
  // le aree più trascurate ricevono le missioni principali, le successive quelle secondarie
  let k = 0;
  for (const type of ['main', 'side']) {
    let have = mine.filter(q => q.type === type).length;
    while (have < want[type] && k < order.length * 2) {
      const a = order[k % order.length]; k++;
      if (mine.some(q => q.area === a && q.type === type)) continue;
      const q = { id: uid(), d, src: 'app', type, area: a, t: pickQuest(a, type), done: false, why: whyText(a, balance(14)) };
      S.quests.push(q); mine.push(q); have++;
    }
  }
  save();
}
function neglected() { const b = balance(14), r = seeded(today()); return Object.keys(AREAS).sort((x, y) => (b[x] - b[y]) || (r() - .5)); }
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
S = load();
for (const [id, L] of Object.entries(S.lessons)) if (L.gen && L.gen.notte) { S.prepMeta = S.prepMeta || {}; S.prepMeta[id] = { title: L.title, kind: L.kind, area: L.area, tags: L.tags || [], gen: { topic: L.gen.topic } }; delete S.lessons[id]; }
save();
loadPiani().catch(() => { });
loadPrep().then(() => { render(); setTimeout(prefetchPrepared, 1500); });
window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (VIEWS[k] && k !== route) go(k); });
go(location.hash.slice(1) || 'oggi');
if (!S.onboarded) welcomeSheet();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => { const nw = reg.installing; nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Nuova versione di Ulisse: chiudi e riapri l\'app', 5000); }); });
  }).catch(() => { });
}

function questSettings() {
  const close = openSheet('Missioni', pad(card(
    h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: S.autoQuests !== false ? true : null, onchange: e => { S.autoQuests = e.target.checked; if (!S.autoQuests) S.quests = S.quests.filter(q => !(q.src === 'app' && q.d === today() && !q.done)); save(); } }), 'Missioni proposte dall\'app (puntano alle aree che trascuri)'),
    h('label', { class: 'lab' }, 'Quante main quest al giorno'), h('div', { class: 'chips' }, [1, 2, 3].map(n => h('button', { class: 'chip', 'aria-pressed': (S.nMain || 2) === n ? 'true' : 'false', onclick: ev => { S.nMain = n; save(); ev.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === ev.currentTarget ? 'true' : 'false')); } }, n))),
    h('label', { class: 'lab' }, 'Quante side quest al giorno'), h('div', { class: 'chips' }, [2, 3, 4, 5].map(n => h('button', { class: 'chip', 'aria-pressed': (S.nSide || 3) === n ? 'true' : 'false', onclick: ev => { S.nSide = n; save(); ev.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === ev.currentTarget ? 'true' : 'false')); } }, n))),
    P('Se le spegni restano solo le tue, ma l\'app continua a dirti quali aree stai trascurando.', 'small muted'),
    h('button', { class: 'btn primary', onclick: () => { close(); ensureTodayQuests(); render(); } }, 'Fatto'))));
}

function techTopicsSheet() {
  const box = pad();
  const paint = () => {
    const inp = h('input', { type: 'text', placeholder: 'Nuovo argomento (meglio in inglese), poi invio' });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) { S.techKw.push(inp.value.trim()); save(); paint(); } });
    box.replaceChildren(card(P('Gli argomenti su cui vuoi restare aggiornato: per ognuno l\'app cerca i paper degli ultimi due anni.', 'small'),
      h('div', { class: 'chips' }, S.techKw.map(k => h('button', { class: 'chip', onclick: () => { S.techKw = S.techKw.filter(x => x !== k); save(); paint(); } }, k + ' ✕'))), inp,
      h('button', { class: 'btn primary', onclick: () => { closeAllSheets(); techQ = S.techKw[0] || null; render(); } }, 'Fatto')));
  };
  paint(); openSheet('Argomenti tecnici', box);
}

/* dimensione del testo e tema chiaro/scuro scelti dall'utente */
function applyLook() {
  document.documentElement.style.fontSize = ((S && S.fontScale) || 1) * 100 + '%';
  document.body.style.fontSize = ((S && S.fontScale) || 1) * 17 + 'px';
  document.documentElement.dataset.theme = (S && S.theme) || 'auto';
}
