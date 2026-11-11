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
let SRV = null, SRVt = 0;
async function serverNews() {
  if (SRV && Date.now() - SRVt < 10 * 60e3) return SRV;
  SRV = await getJSON(`https://raw.githubusercontent.com/${repoPath()}/dati/notizie.json?t=${Math.floor(Date.now() / 300000)}`); SRVt = Date.now();
  return SRV;
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
async function episodeSearch(term, n = 6) { // episodi su un tema, solo in italiano
  const j = await getJSON(`${IT}/search?media=podcast&entity=podcastEpisode&country=IT&lang=it_it&limit=40&term=${encodeURIComponent(term)}`);
  return (j.results || []).filter(r => looksItalian((r.trackName || '') + ' ' + (r.description || r.shortDescription || '') + ' ' + (r.collectionName || ''))).slice(0, n).map(r => ({ title: r.trackName, show: r.collectionName, url: r.episodeUrl, date: r.releaseDate, art: r.artworkUrl160 || r.artworkUrl60, dur: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 60000) : null })).filter(e => e.url);
}

/* ---------------- Google Books (ricerca libera, senza chiave) ---------------- */
async function bookSearch(term, n = 5) {
  const j = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(term)}&langRestrict=it&maxResults=${n}&printType=books`);
  return (j.items || []).map(b => ({ title: b.volumeInfo.title, authors: (b.volumeInfo.authors || []).join(', '), year: (b.volumeInfo.publishedDate || '').slice(0, 4), link: b.volumeInfo.infoLink, desc: (b.volumeInfo.description || '').slice(0, 220) }));
}
