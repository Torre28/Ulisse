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
PIANI['sys'] = PIANI['sys'].replace('{{ESEMPIO}}', PIANI.get('esempio', ''))
PROVA = '--prova' in sys.argv
def _arg(name, default):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default
PARTE, PARTI = _arg('--parte', 0), _arg('--parti', 1)  # giri paralleli: ognuno prende una fetta delle storie
GROQ_KEY = os.environ.get('GROQ_API_KEY', '')
GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile']
USE_GROQ = False  # attivato per i lavori di qualità (percorsi notturni) se c'è la chiave
RAPIDO = '--rapido' in sys.argv  # giro rapido: solo «Capire al volo» sulle notizie nuove, ogni due ore
OUT = os.environ.get('RAPIDI_DIR') if RAPIDO and os.environ.get('RAPIDI_DIR') else os.path.join(ROOT, 'contenuti')
OLLAMA = os.environ.get('OLLAMA_URL', 'http://127.0.0.1:11434')
MODEL = os.environ.get('MODELLO') or (CFG['modello_rapido'] if RAPIDO else CFG['modello'])
START = time.time()
DEADLINE = START + (CFG['minuti_rapidi'] if RAPIDO else CFG['minuti_disponibili']) * 60
OGGI = datetime.now(timezone(timedelta(hours=1))).strftime('%Y-%m-%d')
UA = 'Mozilla/5.0 (Ulisse; redazione notturna; +https://github.com/Torre28/Ulisse)'


def log(*a):
    print(f'[{(time.time() - START) / 60:5.1f} min]', *a, flush=True)


# ------------------------------------------------------------------ rete
BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def get(url, timeout=25, tries=2, browser=False):
    if PROVA:
        return FINTI.get(url)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA if browser else UA, 'Accept-Language': 'it-IT,it;q=0.9'})
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


# ------------------------------------------------------------------ liturgia del giorno (Vatican News)
def liturgia(day=None):
    """Letture, Vangelo e commento dei Papi dalla pagina «Parola del giorno» di Vatican News."""
    d = day or datetime.now(timezone(timedelta(hours=1)))
    url = f"https://www.vaticannews.va/it/vangelo-del-giorno-e-parola-del-giorno/{d:%Y/%m/%d}.html"
    page = get(url, browser=True)
    page = re.sub(r'(?is)<(script|style|noscript|header|footer|nav)[^>]*>.*?</\1>', ' ', page)
    page = re.sub(r'(?i)<br\s*/?>|</(p|div|h\d|li|section)>', '\n', page)
    lines = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', ' ', page)).split('\n')]
    lines = [re.sub(r'\s+', ' ', l) for l in lines if l.strip()]

    def section(start, stops):
        try:
            i = next(k for k, l in enumerate(lines) if l.lower().startswith(start.lower()))
        except StopIteration:
            return []
        out = []
        for l in lines[i + 1:]:
            if any(l.lower().startswith(x.lower()) for x in stops):
                break
            out.append(l)
        return out
    STOPS = ['Letture del Giorno', 'Vangelo del Giorno', 'Le Parole dei Papi', 'Altri eventi', 'Santo del giorno', "L'ATTIVITÀ DEL PAPA"]
    letture = section('Letture del Giorno', STOPS)
    vangelo = section('Vangelo del Giorno', STOPS)
    papi = section('Le Parole dei Papi', STOPS)
    ref = next((m.group(0) for l in vangelo[:4] for m in [re.search(r'\b(Mt|Mc|Lc|Gv)\s?\d+[,.]\s?[\d\-.,a-z]+', l)] if m), '')
    if not vangelo:
        raise RuntimeError('pagina della liturgia senza Vangelo')
    return {'date': d.strftime('%Y-%m-%d'), 'link': url, 'letture': letture[:80], 'vangelo': vangelo[:80], 'ref': ref, 'papi': papi[:30]}


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
_groq_window = []  # (istante, token stimati) dell'ultimo minuto


def groq(system, user, max_tok):
    """Groq gratuito: ~8000 token al minuto per modello. Si rispetta il ritmo e si cambia modello se serve."""
    est = (len(system) + len(user)) // 3 + max_tok
    while True:
        now = time.time()
        _groq_window[:] = [(t, n) for t, n in _groq_window if now - t < 62]
        if sum(n for _, n in _groq_window) + est <= 7500 or not _groq_window:
            break
        time.sleep(3)
    _groq_window.append((time.time(), est))
    for model in GROQ_MODELS:
        body = {'model': model, 'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}],
                'temperature': 0.5, 'max_completion_tokens': max_tok, 'response_format': {'type': 'json_object'}}
        if 'gpt-oss' in model:
            body['reasoning_effort'] = 'low'
        try:
            req = urllib.request.Request('https://api.groq.com/openai/v1/chat/completions', data=json.dumps(body).encode(),
                                         headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY, 'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())['choices'][0]['message']['content']
        except urllib.error.HTTPError as e:
            log('  groq', model, e.code, e.read().decode('utf-8', 'replace')[:120])
            if e.code == 429:
                time.sleep(5)
            continue
        except Exception as e:
            log('  groq', model, str(e)[:120])
    raise RuntimeError('groq non disponibile')


def llm(system, user, max_tok):
    if PROVA:
        return json.dumps(FINTO_LLM(user))
    if USE_GROQ and GROQ_KEY:
        try:
            return groq(system, user, min(max_tok, 3500))
        except Exception as e:
            log('  ripiego sul modello locale:', str(e)[:80])
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


KNOWN = {'text', 'note', 'steps', 'timeline', 'compare', 'glossary', 'slider', 'reflect', 'links', 'map'}
GEO = {}


def geocode(name, country=''):
    """Coordinate da OpenStreetMap (Nominatim), al massimo una richiesta al secondo."""
    q = (name + (', ' + country if country and country.lower() not in name.lower() else '')).strip()
    if q in GEO:
        return GEO[q]
    GEO[q] = None
    if PROVA:
        GEO[q] = [43.77, 11.25]
        return GEO[q]
    try:
        time.sleep(1.1)
        r = get_json('https://nominatim.openstreetmap.org/search?' + urllib.parse.urlencode({'q': q, 'format': 'json', 'limit': 1, 'accept-language': 'it'}))
        if r:
            GEO[q] = [round(float(r[0]['lat']), 4), round(float(r[0]['lon']), 4)]
    except Exception as e:
        log('  geocodifica non riuscita:', q, str(e)[:80])
    return GEO[q]


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
        if b['type'] == 'map':
            for pl in b.get('places', []) or []:
                if isinstance(pl, dict) and pl.get('name') and 'lat' not in pl:
                    ll = geocode(pl['name'], pl.get('country', ''))
                    if ll:
                        pl['lat'], pl['lon'] = ll
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
    # ogni ramo ha la sua scheda: aprendolo si trova già qualcosa di sostanzioso da leggere
    for b in lesson['branches'][:4]:
        if not time_left(3):
            break
        try:
            card = ask_json(PIANI['sys'], f"{context}\n\nLezione: «{lesson.get('title', '')}».\n" + PIANI['ramo'].format(name=b['name'], why=b.get('why', '')) + f"\nRispondi con un JSON così: {PIANI['schema_ramo']}", 1400)
            if card.get('md'):
                b['md'], b['facts'], b['link'] = card['md'], [f for f in card.get('facts', []) if isinstance(f, str)][:8], card.get('link', '')
                log('  ramo:', b['name'])
        except Exception as e:
            log('  ramo saltato:', str(e)[:80])
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
def save_lesson(lesson, meta, folder=None):
    d = os.path.join(OUT, folder or OGGI)
    os.makedirs(d, exist_ok=True)
    lid = 'n-' + OGGI + '-' + hashlib.sha1((meta.get('ref') or lesson['title']).encode()).hexdigest()[:8]
    lesson.update({'id': lid, 'area': meta['area'], 'kind': meta['kind'],
                   'gen': {'at': int(time.time() * 1000), 'model': MODEL, 'ref': meta.get('ref'), 'topic': meta.get('topic'), 'notte': True}})
    rel = f'contenuti/{folder or OGGI}/{lid}.json'
    json.dump(lesson, open(os.path.join(d, lid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
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
    keep = (datetime.now() - timedelta(days=2 if RAPIDO else CFG['giorni_da_tenere'])).strftime('%Y-%m-%d')
    for name in os.listdir(OUT):
        if re.match(r'\d{4}-\d{2}-\d{2}$', name) and name < keep:
            shutil.rmtree(os.path.join(OUT, name))
    INDEX['items'] = [x for x in INDEX['items'] if x['date'] >= keep or '/argomenti/' in x.get('file', '')]


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
    if RAPIDO:  # solo le storie nuove, le più riprese dai giornali per prime
        stories = [c for c in stories if c['main']['title'] not in {x.get('headline') for x in INDEX['items']}]
        mine = stories[PARTE::PARTI][:max(1, CFG['rapidi_per_giro'] // PARTI)]
        jobs = [('notizia_rapida', c, 8) for c in mine]
        if PARTE == PARTI - 1:
            jobs += [('argomento', None, 10)] * CFG.get('argomenti_per_giro', 0)
    for c in ([] if RAPIDO else stories[:CFG['percorsi_completi']]):
        jobs.append(('notizia_completa', c, 50))
    if CFG.get('scoperta_del_giorno') and not RAPIDO:
        jobs.append(('scoperta', None, 25))
    if CFG.get('parola_del_giorno') and not RAPIDO:
        jobs.append(('bibbia', None, 25))
    for c in ([] if RAPIDO else stories[CFG['percorsi_completi']:CFG['percorsi_completi'] + CFG['capire_al_volo']]):
        jobs.append(('notizia_rapida', c, 15))
    if CFG.get('passioni') and not RAPIDO:
        jobs.append(('passione', None, 25))

    for kind, c, est in jobs:
        if not time_left(est):
            log('tempo finito, mi fermo qui')
            break
        try:
            global USE_GROQ
            USE_GROQ = bool(GROQ_KEY) and not RAPIDO and kind in ('notizia_completa', 'bibbia', 'scoperta', 'passione')
            if kind.startswith('notizia'):
                quick = kind == 'notizia_rapida'
                log(('Capire al volo: ' if quick else 'Percorso completo: ') + c['main']['title'])
                ctx = news_context(c, prior_news(c['main']['title'], 14 if quick else 45), wiki_context(c['main']['title'] + ' ' + c['main']['desc'], 2 if quick or USE_GROQ else 4))
                if USE_GROQ:
                    ctx = ctx[:6000]
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
            elif kind == 'argomento':
                topics = load_js_array('js/data.js', 'TOPICS')
                have = {x.get('topic') for x in INDEX['items']}
                todo = [t for t in topics if t[0] not in have]
                if not todo:
                    continue
                t = todo[0]
                log('Argomento del catalogo:', t[1])
                wiki = wiki_context(t[3], 2)
                ctx = f"Argomento: «{t[1]}» ({t[4]}). Livello del lettore: {level()}. È il primo incontro con l'argomento.\n" + '\n'.join(f"- {w['title']}: {w['extract']}" for w in wiki)
                L = build_lesson('scoperta', 'scoperta', ctx)
                save_lesson(L, {'area': 'scoperta', 'kind': 'passione', 'mode': 'scoperta', 'topic': t[0], 'ref': 'topic:' + t[0]}, folder='argomenti')
            elif kind == 'bibbia':
                # la Parola del giorno è il Vangelo della liturgia di oggi, con il suo testo davanti
                lit = liturgia()
                ref, title = lit['ref'] or 'Vangelo del giorno', 'il Vangelo di oggi'
                log('Parola del giorno (Vangelo di oggi):', ref)
                ctx = (f"Brano: {ref}, il Vangelo della Messa di oggi {lit['date']}. Livello: {level()}. Il lettore è un cattolico che vuole capire più a fondo.\n"
                       f"### Testo del Vangelo di oggi\n" + '\n'.join(lit['vangelo'])[:3500] +
                       ("\n### Le altre letture di oggi\n" + '\n'.join(lit['letture'])[:1500] if lit['letture'] else '') +
                       ("\n### Commento dei Papi (Vatican News)\n" + '\n'.join(lit['papi'])[:1200] if lit['papi'] else ''))
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
        if 'scheda di approfondimento' in user:
            return {'md': 'Scheda del ramo.', 'facts': ['fatto 1'], 'link': 'collegato'}
        m = re.search(r'SOLO il capitolo (\d+) «([^»]+)»', user)
        return {'label': m.group(2), 'title': 'Titolo ' + m.group(1), 'blocks': [{'type': 'text', 'md': 'Testo.'}, {'type': 'map', 'places': [{'name': 'Roma', 'country': 'Italia', 'group': 'A'}], 'groups': [{'name': 'A', 'countries': ['Italy']}]}, {'type': 'quiz', 'q': 'Q', 'options': ['a', 'b'], 'correct': '1', 'explain': 'x'}, {'type': 'fantasia'}]}

if __name__ == '__main__':
    main()
