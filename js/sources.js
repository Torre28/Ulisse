"use strict";
/* ======================================================================
   ULISSE · fonti gratuite: feed RSS, Google News, Wikipedia, OpenAlex,
   Apple Podcasts, Google Books
   ====================================================================== */

/* ---------------- feed RSS ---------------- */
function parseFeed(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const items = [...doc.querySelectorAll('item, entry')].slice(0, 40);
  if (!items.length) throw new Error('feed vuoto');
  return items.map(it => {
    let title = stripTags(it.querySelector('title')?.textContent);
    let src = stripTags(it.querySelector('source')?.textContent || '');
    // Google News: «Titolo - Testata»
    if (!src && / - [^-]{2,40}$/.test(title)) { const i = title.lastIndexOf(' - '); src = title.slice(i + 3); title = title.slice(0, i); }
    else if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
    const enc = it.querySelector('enclosure');
    return {
      title, src,
      link: it.querySelector('link')?.getAttribute('href') || it.querySelector('link')?.textContent?.trim(),
      date: it.querySelector('pubDate, updated, published')?.textContent,
      desc: stripTags(it.querySelector('description, summary')?.textContent).replace(title, '').slice(0, 360).trim(),
      audio: enc && /audio/.test(enc.getAttribute('type') || 'audio') ? enc.getAttribute('url') : null
    };
  });
}
async function fetchFeed(url) {
  try { return parseFeed(await fetchText(url)); }
  catch (e) {
    const j = await getJSON('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url));
    if (j.status !== 'ok') throw new Error('feed non raggiungibile');
    return j.items.map(it => ({ title: stripTags(it.title), link: it.link, date: it.pubDate, desc: stripTags(it.description).slice(0, 360), src: stripTags(it.author || ''), audio: it.enclosure?.link || null }));
  }
}

/* ---------------- raggruppa la stessa notizia da più testate ---------------- */
function tokenSet(t) { return new Set(keywords(t, 14).map(w => w.toLowerCase().slice(0, 7))); }
function clusterNews(items) {
  const cl = [];
  for (const it of items) {
    const ts = tokenSet(it.title);
    let best = null, bs = 0;
    for (const c of cl) {
      let inter = 0; for (const x of ts) if (c.ts.has(x)) inter++;
      const sc = inter / Math.max(1, Math.min(ts.size, c.ts.size));
      if (inter >= 2 && sc > bs) { bs = sc; best = c; }
    }
    if (best && bs >= 0.45) { best.items.push(it); for (const x of ts) best.ts.add(x); }
    else cl.push({ ts, items: [it] });
  }
  cl.forEach(c => { c.main = c.items[0]; c.srcs = [...new Set(c.items.map(i => i.src || i.feed).filter(Boolean))]; });
  // più fonti = notizia più importante; poi la più recente
  cl.sort((a, b) => (b.srcs.length - a.srcs.length) || ((Date.parse(b.main.date) || 0) - (Date.parse(a.main.date) || 0)));
  return cl;
}

/* notizie raccolte lato server ogni mezz'ora (ramo «dati» del repository) */
function repoPath() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  return m ? m[1] + '/' + (location.pathname.split('/')[1] || 'Ulisse') : 'Torre28/Ulisse';
}
let SRV = null, SRVt = 0, SRVjob = null;
(() => { try { const c = JSON.parse(localStorage.getItem('ulisse.srv') || 'null'); if (c && c.data) { SRV = c.data; SRVt = c.t; } } catch (e) { } })();
async function fetchServerNews() {
  const p = repoPath(), t = Math.floor(Date.now() / 300000);
  const urls = [`https://raw.githubusercontent.com/${p}/dati/notizie.json?t=${t}`, `https://cdn.jsdelivr.net/gh/${p}@dati/notizie.json`];
  let last;
  for (const u of urls) { try { const d = await getJSON(u, 12000); if (d && d.sezioni) return d; } catch (e) { last = e; } }
  throw last || new Error('notizie non raggiungibili');
}
/* mostra subito l'ultima copia salvata e la aggiorna in sottofondo: le notizie non restano mai bloccate */
async function serverNews() {
  const fresh = SRV && Date.now() - SRVt < 10 * 60e3;
  if (fresh) return SRV;
  if (!SRVjob) SRVjob = fetchServerNews().then(d => { SRV = d; SRVt = Date.now(); try { localStorage.setItem('ulisse.srv', JSON.stringify({ t: SRVt, data: d })); } catch (e) { } return d; }).finally(() => { SRVjob = null; });
  if (SRV && Date.now() - SRVt < 12 * 3600e3) { SRVjob.catch(() => { }); return SRV; }
  return SRVjob;
}

/* antefatti: cosa è uscito sullo stesso tema nelle ultime settimane */
async function priorNews(title, days = 30) {
  const pre = SRV && SRV.antefatti && SRV.antefatti[title];
  if (pre && pre.length) return pre;
  const kw = keywords(title, 5).join(' ');
  const items = await fetchFeed(GN('/search', kw + ' when:' + days + 'd'));
  return items.filter(i => i.title && i.title !== title).sort((a, b) => (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0)).slice(-18);
}

/* ---------------- Wikipedia ---------------- */
const WP = 'https://it.wikipedia.org';
const wikiSummary = t => getJSON(`${WP}/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, '_'))}`);
async function wikiSearch(q, n = 6) { const j = await getJSON(`${WP}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${n}&format=json&origin=*`); return j.query.search.map(s => ({ title: s.title, snippet: stripTags(s.snippet) })); }
async function wikiRelated(title, n = 6) { // voci simili per contenuto, non solo per parole
  const j = await getJSON(`${WP}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent('morelike:' + title)}&srlimit=${n}&srnamespace=0&format=json&origin=*`);
  return j.query.search.map(s => s.title).filter(t => !/^(Lista|Elenco|Anni|Disambigua)/i.test(t));
}
async function wikiSections(t) { const j = await getJSON(`${WP}/w/api.php?action=parse&page=${encodeURIComponent(t)}&prop=sections&redirects=1&format=json&origin=*`); return (j.parse?.sections || []).filter(s => s.toclevel === 1 && !/^(Note|Bibliografia|Voci correlate|Collegamenti esterni|Altri progetti|Filmografia)$/i.test(stripTags(s.line))); }
async function wikiSectionText(t, idx) {
  const j = await getJSON(`${WP}/w/api.php?action=parse&page=${encodeURIComponent(t)}&section=${idx}&prop=text&redirects=1&disableeditsection=1&format=json&origin=*`);
  const doc = new DOMParser().parseFromString(j.parse.text['*'], 'text/html');
  doc.querySelectorAll('sup, .reference, .mw-editsection, table, style, .thumb, figure, .noprint').forEach(e => e.remove());
  return [...doc.querySelectorAll('p, li')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(x => x.length > 40).slice(0, 20);
}
async function onThisDay() {
  const d = new Date(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  const j = await getJSON(`${WP}/api/rest_v1/feed/onthisday/events/${mm}/${dd}`, 9000);
  return (j.events || []).filter(e => e.text && e.pages && e.pages.length).map(e => ({ year: e.year, text: e.text, page: e.pages[0].titles?.normalized || e.pages[0].title, thumb: e.pages[0].thumbnail?.source }));
}
async function featuredToday() {
  const d = new Date();
  const j = await getJSON(`https://api.wikimedia.org/feed/v1/wikipedia/it/featured/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`, 9000);
  return j.tfa ? { title: j.tfa.titles?.normalized || j.tfa.title, extract: j.tfa.extract, thumb: j.tfa.thumbnail?.source } : null;
}
async function wikiContext(text, n = 3) { // estratti brevi da dare al modello come base
  const rs = await wikiSearch(keywords(text, 5).join(' '), n).catch(() => []);
  const out = [];
  for (const r of rs) { try { const s = await wikiSummary(r.title); if (s.extract) out.push({ title: s.title, extract: s.extract.slice(0, 900), url: s.content_urls?.mobile?.page }); } catch (e) { } }
  return out;
}

/* ---------------- OpenAlex (paper) ---------------- */
async function searchPapers(q) {
  const from = new Date(); from.setFullYear(from.getFullYear() - 2);
  const j = await getJSON(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=from_publication_date:${from.toISOString().slice(0, 10)},has_abstract:true&per_page=12`);
  return j.results || [];
}
function abstractOf(w) {
  const inv = w.abstract_inverted_index; if (!inv) return '';
  const arr = []; for (const [word, pos] of Object.entries(inv)) for (const p of pos) arr[p] = word;
  return arr.join(' ');
}

/* ---------------- Apple Podcasts (gratuito, senza chiave) ---------------- */
const IT = 'https://itunes.apple.com';
async function podcastResolve(p) { // trova id e copertina di un podcast
  if (p.id && p.art) return p;
  const j = p.id ? await getJSON(`${IT}/lookup?id=${p.id}`) : await getJSON(`${IT}/search?media=podcast&country=IT&limit=1&term=${encodeURIComponent(p.q || p.name)}`);
  const r = (j.results || [])[0]; if (!r) throw new Error('podcast non trovato');
  p.id = String(r.collectionId); p.art = r.artworkUrl100 || r.artworkUrl60; p.title = r.collectionName; p.feed = r.feedUrl; save();
  return p;
}
async function podcastEpisodes(p, n = 5) {
  await podcastResolve(p);
  const j = await getJSON(`${IT}/lookup?id=${p.id}&entity=podcastEpisode&limit=${n}`);
  return (j.results || []).filter(r => r.kind === 'podcast-episode' || r.wrapperType === 'podcastEpisode').map(r => ({
    title: r.trackName, show: r.collectionName || p.title || p.name, url: r.episodeUrl, date: r.releaseDate, art: r.artworkUrl160 || r.artworkUrl60 || p.art,
    dur: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : null, desc: stripTags(r.description || '').slice(0, 300)
  })).filter(e => e.url);
}
async function podcastSearch(term, n = 8) {
  const j = await getJSON(`${IT}/search?media=podcast&country=IT&limit=${n}&term=${encodeURIComponent(term)}`);
  return (j.results || []).map(r => ({ name: r.collectionName + ' · ' + (r.artistName || ''), id: String(r.collectionId), art: r.artworkUrl100, title: r.collectionName }));
}
const IT_W = new Set('il gli della delle dello degli nel nella sono è perché anche questo questa alla alle con non più come una per'.split(' '));
const XX_W = new Set('el los las y del está qué cómo también este esta para pero the and of to is in with que por une les des est dans der die und'.split(' '));
function looksItalian(t) { let a = 0, b = 0; for (const w of String(t || '').toLowerCase().split(/[^a-zàèéìòù]+/)) { if (IT_W.has(w)) a++; if (XX_W.has(w)) b++; } return a > 0 && a >= b * 1.5; }
async function episodeSearch(term, n = 6, strict) { // episodi su un tema, solo in italiano (e, se strict, che ne parlano davvero)
  const j = await getJSON(`${IT}/search?media=podcast&entity=podcastEpisode&country=IT&lang=it_it&limit=40&term=${encodeURIComponent(term)}`);
  const kw = keywords(term, 4).map(w => w.toLowerCase().slice(0, Math.max(4, w.length - 2)));
  const about = r => !strict || !kw.length || kw.every(k => ((r.trackName || '') + ' ' + (r.description || r.shortDescription || '')).toLowerCase().includes(k));
  return (j.results || []).filter(about).filter(r => looksItalian((r.trackName || '') + ' ' + (r.description || r.shortDescription || '') + ' ' + (r.collectionName || ''))).slice(0, n).map(r => ({ title: r.trackName, show: r.collectionName, url: r.episodeUrl, date: r.releaseDate, art: r.artworkUrl160 || r.artworkUrl60, dur: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : null })).filter(e => e.url);
}

/* ---------------- Google Books (ricerca libera, senza chiave) ---------------- */
async function bookSearch(term, n = 5) {
  try {
    const j = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('intitle:' + term)}&langRestrict=it&maxResults=${n}&printType=books&orderBy=relevance`, 8000);
    const out = (j.items || []).map(b => ({ title: b.volumeInfo.title + (b.volumeInfo.subtitle ? '. ' + b.volumeInfo.subtitle : ''), authors: (b.volumeInfo.authors || []).join(', '), year: (b.volumeInfo.publishedDate || '').slice(0, 4), link: b.volumeInfo.infoLink, desc: (b.volumeInfo.description || '').slice(0, 220) }));
    if (out.length) return out;
  } catch (e) { }
  // riserva: Open Library (gratuito, senza chiave)
  const j = await getJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(term)}&language=ita&limit=${n}&fields=title,author_name,first_publish_year,key`, 8000);
  return (j.docs || []).map(d => ({ title: d.title, authors: (d.author_name || []).slice(0, 2).join(', '), year: d.first_publish_year || '', link: 'https://openlibrary.org' + d.key }));
}
/* trova la voce giusta anche se il nome non coincide esattamente con il titolo */
async function wikiResolve(name) {
  try { const s = await wikiSummary(name); if (s.extract && s.type !== 'disambiguation') return s; } catch (e) { }
  const rs = await wikiSearch(name, 1); if (!rs[0]) throw new Error('nessuna voce');
  return wikiSummary(rs[0].title);
}


/* ---------------- brani pertinenti: da una voce lunga, solo ciò che serve rispetto a dove arrivi ---------------- */
async function wikiParagraphs(title) {
  const j = await getJSON(`${WP}/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&redirects=1&disableeditsection=1&format=json&origin=*`);
  const doc = new DOMParser().parseFromString(j.parse.text['*'], 'text/html');
  doc.querySelectorAll('sup, .reference, .mw-editsection, table, style, .thumb, figure, .noprint, .navbox, .metadata').forEach(e => e.remove());
  const out = []; let sec = 'Introduzione';
  for (const el of doc.querySelectorAll('h2, h3, p')) {
    if (/^H[23]$/.test(el.tagName)) { sec = el.textContent.replace(/\[.*?\]/g, '').trim(); continue; }
    if (/^(Note|Bibliografia|Voci correlate|Collegamenti esterni|Altri progetti)$/i.test(sec)) continue;
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (t.length > 120) out.push({ sec, text: t });
  }
  return { title: j.parse.title, paras: out };
}
function rankByContext(paras, contextText, n = 5) {
  const tok = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.slice(0, 7));
  const ctx = {}; tok(contextText).forEach(w => { ctx[w] = (ctx[w] || 0) + 1; });
  const df = {}; const toks = paras.map(p => { const s = new Set(tok(p.text + ' ' + p.sec)); s.forEach(w => { df[w] = (df[w] || 0) + 1; }); return s; });
  const N = paras.length || 1;
  const scored = paras.map((p, i) => {
    let sc = 0, hits = [];
    toks[i].forEach(w => { if (ctx[w]) { sc += Math.min(ctx[w], 3) * Math.log(1 + N / df[w]); hits.push(w); } });
    return { ...p, i, score: sc / Math.sqrt(1 + toks[i].size / 40), hits };
  }).filter(p => p.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i);
}
