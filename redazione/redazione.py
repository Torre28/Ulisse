#!/usr/bin/env python3
"""Redazione notturna di Ulisse.

Ogni notte, su GitHub Actions, legge le notizie principali, raccoglie antefatti e
contesto (Google News, Wikipedia) e fa scrivere a un modello aperto che gira in
locale (Ollama) le lezioni del giorno, un capitolo alla volta. Salva tutto in
contenuti/ e aggiorna contenuti/indice.json, che l'app legge al mattino.

Solo libreria standard di Python. Uso:
  python3 redazione/redazione.py            # esecuzione normale
  python3 redazione/redazione.py --prova    # dati e modello finti, per i test
"""
import ast, email.utils, hashlib, html, json, os, re, shutil, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, 'redazione', 'config.json'), encoding='utf-8'))
PIANI = json.load(open(os.path.join(ROOT, 'prompts', 'piani.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'contenuti')
PROVA = '--prova' in sys.argv
OLLAMA = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')
MODEL = os.environ.get('MODELLO') or CFG['modello']
START = time.time()
DEADLINE = START + CFG['minuti_disponibili'] * 60
OGGI = datetime.now(timezone(timedelta(hours=1))).strftime('%Y-%m-%d')
UA = 'Mozilla/5.0 (Ulisse; redazione notturna; +https://github.com/Torre28/Ulisse)'


def log(*a):
    print(f'[{(time.time() - START) / 60:5.1f} min]', *a, flush=True)


# ------------------------------------------------------------------ rete
def get(url, timeout=25, tries=2):
    if PROVA:
        return FINTI.get(url)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:  # rete instabile: riprova una volta
            last = e
            time.sleep(2)
    raise last


def get_json(url):
    return json.loads(get(url))


def strip(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


# ------------------------------------------------------------------ notizie
def parse_rss(xml):
    root = ET.fromstring(xml.encode('utf-8'))
    out = []
    for it in root.iter('item'):
        title = strip(it.findtext('title'))
        src = strip(it.findtext('source') or '')
        if not src and re.search(r' - [^-]{2,40}$', title):
            title, src = title.rsplit(' - ', 1)
        elif src and title.endswith(' - ' + src):
            title = title[:-(len(src) + 3)]
        date = it.findtext('pubDate')
        try:
            ts = email.utils.parsedate_to_datetime(date).timestamp() if date else 0
        except Exception:
            ts = 0
        desc = strip(it.findtext('description')).replace(title, '').strip()[:360]
        out.append({'title': title, 'src': src, 'link': (it.findtext('link') or '').strip(), 'ts': ts, 'desc': desc})
    return out


STOP = set('alla alle allo agli dalla dalle dallo dagli della delle dello degli nella nelle nello negli sulla sulle sullo sugli come cosa sono dopo prima anche ancora oggi ieri domani questo questa questi queste quello quella quelli quelle molto tutti tutte tutto ogni loro dove quando perché perche sempre senza contro mentre però pero quindi infatti essere stato stata stati state viene vengono fatto fare fanno ecco ovvero secondo verso circa sotto sopra presso tra fra per con una uno gli dei del dal nel sul che chi non più piu già gia sua suo sue suoi nuovo nuova nuovi nuove anni anno mesi mese giorni giorno ore video foto news live ultime ultima'.split())


def keywords(text, n=6):
    words = re.sub(r'[«»"“”:,.;!?()\[\]\'’\-–—|/]', ' ', text or '').split()
    out = []
    for w in words:
        l = w.lower()
        if len(l) < 4 or l in STOP or l.isdigit() or any(o.lower() == l for o in out):
            continue
        out.append(w)
    out.sort(key=lambda w: 0 if w[:1].isupper() else 1)  # nomi propri prima
    return out[:n]


def cluster(items):
    cl = []
    for it in items:
        ts = {w.lower()[:7] for w in keywords(it['title'], 14)}
        best, bs = None, 0
        for c in cl:
            inter = len(ts & c['ts'])
            sc = inter / max(1, min(len(ts), len(c['ts'])))
            if inter >= 2 and sc > bs:
                best, bs = c, sc
        if best and bs >= 0.45:
            best['items'].append(it)
            best['ts'] |= ts
        else:
            cl.append({'ts': ts, 'items': [it]})
    for c in cl:
        c['main'] = c['items'][0]
        c['srcs'] = list(dict.fromkeys(i['src'] for i in c['items'] if i['src']))
    cl.sort(key=lambda c: (-len(c['srcs']), -c['main']['ts']))
    return cl


def gn_search(q):
    return 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q': q, 'hl': 'it', 'gl': 'IT', 'ceid': 'IT:it'})


def prior_news(title, days):
    try:
        items = parse_rss(get(gn_search(' '.join(keywords(title, 5)) + f' when:{days}d')))
    except Exception as e:
        log('antefatti non disponibili:', e)
        return []
    items = [i for i in items if i['title'] != title]
    items.sort(key=lambda i: i['ts'])
    return items[-18:]


def wiki_context(text, n=3):
    out = []
    try:
        q = urllib.parse.quote(' '.join(keywords(text, 5)))
        res = get_json(f'https://it.wikipedia.org/w/api.php?action=query&list=search&srsearch={q}&srlimit={n}&format=json')['query']['search']
        for r in res:
            try:
                s = get_json('https://it.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(r['title'].replace(' ', '_')))
                if s.get('extract'):
                    out.append({'title': s['title'], 'extract': s['extract'][:900], 'url': s.get('content_urls', {}).get('mobile', {}).get('page', '')})
            except Exception:
                pass
    except Exception as e:
        log('wikipedia non disponibile:', e)
    return out


def day(ts):
    return datetime.fromtimestamp(ts).strftime('%d/%m/%Y') if ts else ''


# ------------------------------------------------------------------ modello
def llm(system, user, max_tok):
    if PROVA:
        return json.dumps(FINTO_LLM(user))
    body = {'model': MODEL, 'stream': False, 'format': 'json', 'think': False,
            'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
            'options': {'num_ctx': CFG['contesto_token'], 'num_predict': max_tok, 'temperature': 0.5}}
    for attempt in range(2):
        try:
            req = urllib.request.Request(OLLAMA + '/api/chat', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=3600) as r:
                return json.loads(r.read())['message']['content']
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'replace')
            if 'think' in msg and 'think' in body:  # modello senza modalità di ragionamento
                body.pop('think')
                continue
            raise RuntimeError(msg)
    raise RuntimeError('chiamata al modello fallita')


def loose_json(txt):
    t = re.sub(r'^\s*```(?:json)?|```\s*$', '', txt.strip())
    a, b = t.find('{'), t.rfind('}')
    if a >= 0 and b > a:
        t = t[a:b + 1]
    try:
        return json.loads(t)
    except Exception:
        return json.loads(re.sub(r',\s*([}\]])', r'\1', t))


def ask_json(system, user, max_tok):
    last = None
    for _ in range(2):
        try:
            return loose_json(llm(system, user, max_tok))
        except Exception as e:
            last = e
            log('  risposta non valida, riprovo:', str(e)[:120])
    raise last


KNOWN = {'text', 'note', 'steps', 'timeline', 'compare', 'glossary', 'quiz', 'slider', 'reflect', 'links'}


def clean_chapter(ch, plan):
    if isinstance(ch, dict) and 'chapter' in ch and isinstance(ch['chapter'], dict):
        ch = ch['chapter']
    if not isinstance(ch, dict):
        ch = {}
    blocks = [b for b in (ch.get('blocks') or []) if isinstance(b, dict) and b.get('type') in KNOWN]
    for b in blocks:
        if b['type'] == 'quiz':
            try:
                b['correct'] = int(b.get('correct', 0))
            except Exception:
                b['correct'] = 0
        if b['type'] == 'links':
            b['items'] = [l for l in b.get('items', []) if isinstance(l, dict) and str(l.get('url', '')).startswith('http')]
    if not blocks:
        raise ValueError('capitolo senza blocchi')
    return {'label': ch.get('label') or plan['label'], 'title': ch.get('title') or plan['label'], 'depth': plan['depth'], 'blocks': blocks}


def build_lesson(kind_plan, kind_meta, context, chapter_tok=2600):
    """Scrive la lezione capitolo per capitolo: risposte brevi = JSON più affidabile su un modello piccolo."""
    plan = PIANI['piani'][kind_plan]
    plan_txt = '\n'.join(f"{i + 1}. {p['label']} ({p['depth']}): {p['spec']}" for i, p in enumerate(plan))
    chapters = []
    for i, p in enumerate(plan):
        done = ', '.join('«' + c['title'] + '»' for c in chapters) or 'nessuno'
        user = (f"{context}\n\nPIANO DELLA LEZIONE:\n{plan_txt}\n\nCapitoli già scritti: {done}. Non ripeterne i contenuti.\n"
                f"Scrivi ADESSO SOLO il capitolo {i + 1} «{p['label']}» ({p['depth']}).\nIndicazioni: {p['spec']}\n\n"
                f"Rispondi con un JSON così: {PIANI['schema_capitolo']}\n{PIANI['blocchi']}")
        ch = clean_chapter(ask_json(PIANI['sys'], user, chapter_tok), p)
        chapters.append(ch)
        log(f'  capitolo {i + 1}/{len(plan)}: {ch["title"]}')
    titles = '\n'.join(f"- {c['label']}: {c['title']}" for c in chapters)
    meta = ask_json(PIANI['sys'], f"{context}\n\nLa lezione ha questi capitoli:\n{titles}\n\nOra scrivi i metadati. {PIANI['meta'][kind_meta]}\nRispondi con un JSON così: {PIANI['schema_meta']}", 1800)
    lesson = {k: meta.get(k) for k in ('title', 'summary', 'tags', 'cards', 'branches', 'next') if meta.get(k)}
    lesson['cards'] = [c for c in lesson.get('cards', []) if isinstance(c, dict) and c.get('q') and c.get('a')]
    lesson['branches'] = [b for b in lesson.get('branches', []) if isinstance(b, dict) and b.get('name')]
    lesson['chapters'] = chapters
    return lesson


# ------------------------------------------------------------------ contesti
def level():
    return PIANI['livelli'][CFG.get('livello', 2)]


def news_context(c, prior, wiki):
    it = c['main']
    s = [f"Livello del lettore: {level()}. Oggi è il {datetime.now().strftime('%d/%m/%Y')}.",
         f"NOTIZIA: «{it['title']}»", '', '### Come ne parlano le testate (oggi)']
    s += [f"- [{i['src']}] {i['title']}{' — ' + i['desc'] if i['desc'] else ''} ({day(i['ts'])}) {i['link']}" for i in c['items'][:8]]
    if prior:
        s += ['', '### Notizie delle ultime settimane sullo stesso tema (dalla più vecchia)']
        s += [f"- {day(i['ts'])} [{i['src']}] {i['title']}" for i in prior]
    if wiki:
        s += ['', '### Voci di Wikipedia collegate'] + [f"- {w['title']}: {w['extract']} ({w['url']})" for w in wiki]
    return '\n'.join(s)


def load_js_array(path, name):
    """Legge un array di dati da un file JavaScript dell'app (stessa sintassi di Python)."""
    src = open(os.path.join(ROOT, path), encoding='utf-8').read()
    i = src.index(f'const {name} = [') + len(f'const {name} = ')
    depth, j = 0, i
    for j in range(i, len(src)):
        if src[j] == '[':
            depth += 1
        elif src[j] == ']':
            depth -= 1
            if depth == 0:
                break
    return ast.literal_eval(src[i:j + 1])


# ------------------------------------------------------------------ salvataggio
def save_lesson(lesson, meta):
    d = os.path.join(OUT, OGGI)
    os.makedirs(d, exist_ok=True)
    lid = 'n-' + OGGI + '-' + hashlib.sha1((meta.get('ref') or lesson['title']).encode()).hexdigest()[:8]
    lesson.update({'id': lid, 'area': meta['area'], 'kind': meta['kind'],
                   'gen': {'at': int(time.time() * 1000), 'model': MODEL, 'ref': meta.get('ref'), 'topic': meta.get('topic'), 'notte': True}})
    rel = f'contenuti/{OGGI}/{lid}.json'
    json.dump(lesson, open(os.path.join(ROOT, rel), 'w', encoding='utf-8'), ensure_ascii=False)
    item = {'id': lid, 'kind': meta['kind'], 'mode': meta.get('mode'), 'title': lesson['title'], 'summary': lesson.get('summary', ''),
            'date': OGGI, 'ref': meta.get('ref'), 'headline': meta.get('headline'), 'srcs': meta.get('srcs', []), 'topic': meta.get('topic'),
            'chapters': len(lesson['chapters']), 'file': rel}
    INDEX['items'] = [x for x in INDEX['items'] if x['id'] != lid] + [item]
    write_index()
    log('  salvata:', lesson['title'])


def write_index():
    INDEX['aggiornato'] = datetime.now(timezone.utc).isoformat()
    INDEX['modello'] = MODEL
    json.dump(INDEX, open(os.path.join(OUT, 'indice.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def tidy():
    keep = (datetime.now() - timedelta(days=CFG['giorni_da_tenere'])).strftime('%Y-%m-%d')
    for name in os.listdir(OUT):
        if re.match(r'\d{4}-\d{2}-\d{2}$', name) and name < keep:
            shutil.rmtree(os.path.join(OUT, name))
    INDEX['items'] = [x for x in INDEX['items'] if x['date'] >= keep]


def time_left(minutes_needed):
    return time.time() + minutes_needed * 60 < DEADLINE


# ------------------------------------------------------------------ lavoro della notte
def main():
    global INDEX
    os.makedirs(OUT, exist_ok=True)
    try:
        INDEX = json.load(open(os.path.join(OUT, 'indice.json'), encoding='utf-8'))
    except Exception:
        INDEX = {'items': []}
    tidy()
    done_refs = {x.get('ref') for x in INDEX['items']}

    # 1. notizie del giorno
    items = []
    for u in CFG['feed']:
        try:
            items += parse_rss(get(u))
        except Exception as e:
            log('feed non raggiungibile:', u, e)
    recent = time.time() - 2 * 86400
    items = [i for i in items if i['title'] and (not i['ts'] or i['ts'] > recent)]
    items.sort(key=lambda i: -i['ts'])
    stories = [c for c in cluster(items) if c['main']['link'] not in done_refs]
    log(f'{len(items)} notizie, {len(stories)} storie nuove')

    jobs = []
    for c in stories[:CFG['percorsi_completi']]:
        jobs.append(('notizia_completa', c, 50))
    if CFG.get('scoperta_del_giorno'):
        jobs.append(('scoperta', None, 25))
    if CFG.get('parola_del_giorno'):
        jobs.append(('bibbia', None, 25))
    for c in stories[CFG['percorsi_completi']:CFG['percorsi_completi'] + CFG['capire_al_volo']]:
        jobs.append(('notizia_rapida', c, 15))
    if CFG.get('passioni'):
        jobs.append(('passione', None, 25))

    for kind, c, est in jobs:
        if not time_left(est):
            log('tempo finito, mi fermo qui')
            break
        try:
            if kind.startswith('notizia'):
                quick = kind == 'notizia_rapida'
                log(('Capire al volo: ' if quick else 'Percorso completo: ') + c['main']['title'])
                ctx = news_context(c, prior_news(c['main']['title'], 14 if quick else 45), wiki_context(c['main']['title'] + ' ' + c['main']['desc'], 2 if quick else 4))
                L = build_lesson(kind, 'notizia', ctx, 1800 if quick else 2600)
                save_lesson(L, {'area': 'mondo', 'kind': 'notizia', 'mode': 'quick' if quick else 'full', 'ref': c['main']['link'], 'headline': c['main']['title'], 'srcs': c['srcs'][:6]})
            elif kind == 'scoperta':
                topics = load_js_array('js/data.js', 'TOPICS')
                used = {x.get('topic') for x in INDEX['items']}
                pool = [t for t in topics if t[0] not in used] or topics
                t = pool[int(hashlib.sha1(OGGI.encode()).hexdigest(), 16) % len(pool)]
                log('Scoperta del giorno:', t[1])
                wiki = wiki_context(t[3], 2)
                ctx = f"Argomento: «{t[1]}» ({t[4]}). Livello del lettore: {level()}. È il primo incontro con l'argomento.\n" + '\n'.join(f"- {w['title']}: {w['extract']}" for w in wiki)
                L = build_lesson('scoperta', 'scoperta', ctx)
                save_lesson(L, {'area': 'scoperta', 'kind': 'passione', 'mode': 'scoperta', 'topic': t[0], 'ref': 'topic:' + t[0] + ':' + OGGI})
            elif kind == 'bibbia':
                bible = load_js_array('js/data.js', 'BIBLE')
                n = (datetime.now() - datetime(2026, 1, 1)).days % len(bible)
                ref, title = bible[n]
                log('Parola del giorno:', ref)
                ctx = f"Brano: {ref} («{title}»). Livello: {level()}. Il lettore è un cattolico che vuole capire più a fondo."
                L = build_lesson('bibbia', 'bibbia', ctx)
                save_lesson(L, {'area': 'fede', 'kind': 'fede', 'mode': 'parola', 'ref': 'bibbia:' + ref + ':' + OGGI, 'headline': ref})
            elif kind == 'passione':
                name = CFG['passioni'][(datetime.now() - datetime(2026, 1, 1)).days % len(CFG['passioni'])]
                prev = [x['title'] for x in INDEX['items'] if x.get('topic') == 'p:' + name]
                log('Passione, nuova puntata:', name)
                serie = (f"Puntate già fatte: {', '.join(prev)}. Vai più a fondo senza ripetere." if prev else "È la prima puntata della serie.")
                ctx = f"Argomento: «{name}». Livello del lettore: {level()}. {serie}"
                L = build_lesson('scoperta', 'scoperta', ctx)
                save_lesson(L, {'area': 'scoperta', 'kind': 'passione', 'mode': 'serie', 'topic': 'p:' + name, 'ref': 'passione:' + name + ':' + OGGI})
        except Exception as e:
            log('  saltata per errore:', str(e)[:200])
    write_index()
    log('fatto:', len([x for x in INDEX['items'] if x['date'] == OGGI]), 'lezioni oggi')


# ------------------------------------------------------------------ dati finti per --prova
FINTI = {}
if PROVA:
    rss = '<rss><channel>' + ''.join(
        f'<item><title>{t} - {s}</title><link>https://ex.com/{i}</link><pubDate>{email.utils.formatdate(time.time() - i * 600)}</pubDate><description>{d}</description><source url="x">{s}</source></item>'
        for i, (t, s, d) in enumerate([('Legge sicurezza, il Senato approva il decreto tra le proteste', 'Corriere', 'Via libera'), ('Decreto sicurezza approvato al Senato, opposizioni in piazza', 'Repubblica', ''), ('Terremoto in Giappone, scossa forte', 'Rai News', ''), ('Borsa di Milano in rialzo', 'Sky TG24', '')])) + '</channel></rss>'

    class _F(dict):
        def get(self, url, d=None):
            if 'wikipedia' in url and 'summary' in url:
                return json.dumps({'title': 'Voce', 'extract': 'Estratto di prova.', 'content_urls': {'mobile': {'page': 'https://it.m.wikipedia.org/wiki/Voce'}}})
            if 'wikipedia' in url:
                return json.dumps({'query': {'search': [{'title': 'Voce'}]}})
            return rss
    FINTI = _F()

    def FINTO_LLM(user):
        if 'metadati' in user:
            return {'title': 'Lezione di prova', 'summary': 'Riassunto', 'tags': ['prova'], 'cards': [{'q': 'D?', 'a': 'R.'}], 'branches': [{'name': 'Ramo', 'why': 'perché'}], 'next': 'Dopo'}
        m = re.search(r'SOLO il capitolo (\d+) «([^»]+)»', user)
        return {'label': m.group(2), 'title': 'Titolo ' + m.group(1), 'blocks': [{'type': 'text', 'md': 'Testo.'}, {'type': 'quiz', 'q': 'Q', 'options': ['a', 'b'], 'correct': '1', 'explain': 'x'}, {'type': 'fantasia'}]}

if __name__ == '__main__':
    main()
