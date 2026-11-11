#!/usr/bin/env python3
"""Notizie per l'app, raccolte lato server ogni mezz'ora.

I browser non possono leggere direttamente i feed RSS dei giornali (blocco CORS),
quindi questo script li scarica su GitHub Actions, raggruppa le storie, aggiunge
gli antefatti delle più importanti e pubblica un unico notizie.json sul ramo
«dati», che l'app legge da raw.githubusercontent.com.
"""
import json, os, sys, time
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import redazione as R

# fonti gratuite: si prova il loro feed RSS (con intestazioni da browser) e, se non risponde,
# si ripiega su Google News limitato al loro sito. Lo stato di ognuna finisce in notizie.json
FONTI_LIBERE = {
    'Il Post': ('https://www.ilpost.it/feed/', 'ilpost.it'),
    'ANSA': ('https://www.ansa.it/sito/ansait_rss.xml', 'ansa.it'),
    'Rai News': (None, 'rainews.it'),
    'AGI': (None, 'agi.it'),
    'Adnkronos': (None, 'adnkronos.com'),
    'Open': ('https://www.open.online/feed/', 'open.online'),
    'Fanpage': (None, 'fanpage.it'),
    'Avvenire': (None, 'avvenire.it'),
    'Sky TG24': (None, 'tg24.sky.it'),
    'Euronews': (None, 'it.euronews.com'),
    'Agenzia Dire': (None, 'dire.it'),
    'Valigia Blu': ('https://www.valigiablu.it/feed/', 'valigiablu.it'),
}
SEZIONI = {
    'Principali': [R.CFG['feed'][0]],
    'Italia': ['https://news.google.com/rss/headlines/section/topic/NATION?hl=it&gl=IT&ceid=IT:it'],
    'Mondo': ['https://news.google.com/rss/headlines/section/topic/WORLD?hl=it&gl=IT&ceid=IT:it'],
    'Economia': ['https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=it&gl=IT&ceid=IT:it'],
    'Scienza': ['https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=it&gl=IT&ceid=IT:it'],
}
# temi: ricerca ragionata (sinonimi ed esclusioni) + filtro di pertinenza sul titolo,
# così «spazio» vuol dire spazio cosmico e non «spazio teatrale»
TEMI = {
    'Spazio e astronomia': ('(spazio OR spaziale OR astronauti OR NASA OR ESA OR ASI OR razzo OR satellite OR Marte OR Luna OR SpaceX OR telescopio OR asteroide OR galassia) -teatro -teatrale -"spazio espositivo"',
                            r'spazial|astronaut|nasa|\besa\b|\basi\b|razz|satellit|marte|lunar|\bluna\b|spacex|telescop|asteroid|galassi|orbita|cosm|stellar|pianet|cometa|artemis|iss\b'),
    'Elettronica e semiconduttori': ('(semiconduttori OR chip OR microchip OR transistor OR STMicroelectronics OR TSMC OR Nvidia OR Intel OR fonderia OR "Chips Act" OR 5G OR 6G OR radiofrequenza)',
                                     r'semicondutt|\bchip|microchip|transistor|stmicro|tsmc|nvidia|intel\b|fonderi|chips act|\b5g\b|\b6g\b|radiofrequen|elettronic|wafer|antenn'),
    'Intelligenza artificiale': ('("intelligenza artificiale" OR OpenAI OR Anthropic OR ChatGPT OR Gemini OR "AI Act" OR algoritmi)', r'intelligenza artificiale|\bia\b|\bai\b|openai|anthropic|chatgpt|gemini|claude|llm|algoritm|ai act|robot'),
    'Fiorentina': ('Fiorentina calcio', r'fiorentin|\bviola\b|franchi|commisso|palladino'),
    'Firenze': ('Firenze', r'firenz|fiorentin|toscan|palazzo vecchio|funaro'),
    'Toscana': ('Toscana', r'toscan|firenz|pisa|siena|livorno|lucca|arezzo|prato|pistoia|grosseto|massa|carrara|giani'),
    'Clima e ambiente': ('(clima OR "cambiamento climatico" OR riscaldamento globale OR COP OR emissioni OR alluvione OR siccità OR biodiversità)', r'clim|riscaldamento|emission|alluvion|siccit|biodivers|\bcop\d|ambient|ghiacci|inquinament|co2'),
    'Energia': ('(energia OR rinnovabili OR fotovoltaico OR nucleare OR gas OR bollette OR petrolio OR idrogeno)', r'energi|rinnovabil|fotovolt|nuclear|\bgas\b|bollett|petroli|idrogeno|eolic|elettricit'),
    'Scienza e medicina': ('(scienziati OR ricerca scientifica OR studio pubblicato OR medicina OR vaccino OR scoperta OR fisica OR biologia)', r'scienz|ricercat|studio|medicin|vaccin|scopert|fisic|biolog|genet|cellul|cancro|tumor|neuro'),
    'Chiesa e Papa': ('(Papa OR Vaticano OR Chiesa cattolica OR vescovi OR CEI OR Leone XIV)', r'papa\b|pontefic|vatican|chiesa|vescov|\bcei\b|leone xiv|cardinal|diocesi|sinod'),
    'Europa e UE': ('("Unione europea" OR Commissione europea OR Parlamento europeo OR von der Leyen OR Bruxelles)', r'europe|\bue\b|bruxelles|von der leyen|strasburgo|eurozona'),
    'Medio Oriente': ('(Israele OR Gaza OR Palestina OR Iran OR Libano OR Siria OR "Medio Oriente")', r'israel|gaza|palestin|iran|liban|siri|medio oriente|hamas|hezbollah|cisgiordani'),
    'Ucraina e Russia': ('(Ucraina OR Russia OR Zelensky OR Putin OR Kiev OR Mosca)', r'ucrain|russ|zelensk|putin|kiev|kyiv|mosca|cremlino'),
    'Stati Uniti': ('("Stati Uniti" OR Casa Bianca OR Trump OR Congresso USA OR Washington)', r'stati uniti|\busa\b|casa bianca|trump|washington|congresso|americ'),
    'Cina e Asia': ('(Cina OR Pechino OR Xi Jinping OR Taiwan OR Giappone OR India OR Corea)', r'cin[ae]\b|cines|pechino|xi jinping|taiwan|giappon|india|core[ae]'),
    'Economia italiana': ('(Istat OR PIL OR inflazione OR manovra OR occupazione OR tasse OR Borsa di Milano OR spread)', r'istat|\bpil\b|inflazion|manovra|occupazion|tass|borsa|spread|lavor|salari|pension'),
    'Tecnologia': ('(tecnologia OR smartphone OR Apple OR Google OR Microsoft OR Meta OR cybersicurezza OR app)', r'tecnolog|smartphone|apple|google|microsoft|meta\b|cyber|hacker|\bapp\b|software|digital'),
    'Cultura e libri': ('(libro OR romanzo OR mostra OR museo OR scrittore OR premio letterario OR Strega)', r'libr|romanz|mostra|muse|scrittor|premio|letterari|strega|poesi|arte\b|artist'),
    'Formula 1 e motori': ('("Formula 1" OR F1 OR Ferrari OR Gran Premio OR MotoGP)', r'formula 1|\bf1\b|ferrari|gran premio|gp\b|motogp|leclerc|hamilton|verstappen|bagnaia'),
}
TESTATE = {
    'Corriere della Sera': 'corriere.it', 'la Repubblica': 'repubblica.it', 'Il Sole 24 Ore': 'ilsole24ore.com', 'La Stampa': 'lastampa.it',
    'Il Messaggero': 'ilmessaggero.it', 'Avvenire': 'avvenire.it', 'Il Post': 'ilpost.it', 'Il Fatto Quotidiano': 'ilfattoquotidiano.it',
    'Domani': 'editorialedomani.it', 'Il Foglio': 'ilfoglio.it', 'Internazionale': 'internazionale.it', 'La Nazione': 'lanazione.it',
    'Il Giornale': 'ilgiornale.it', 'Libero': 'liberoquotidiano.it', 'ISPI': 'ispionline.it', 'Limes': 'limesonline.com', 'Wired Italia': 'wired.it',
    'Le Scienze': 'lescienze.it', 'Milano Finanza': 'milanofinanza.it', 'Il Manifesto': 'ilmanifesto.it',
}
NOMI = {'ilpost': 'Il Post', 'ansa': 'ANSA', 'news.google': 'Google News'}


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None


def vangelo():
    """Vangelo del giorno con il commento e la preghiera guidata di Get Up and Walk (gesuiti).
    Si tiene solo ciò che è un commento a un brano dei Vangeli e si segnala se è di oggi."""
    import re, email.utils
    import xml.etree.ElementTree as ET
    from datetime import timedelta
    try:
        root = ET.fromstring(R.get('https://getupandwalk.gesuiti.it/feed/', browser=True).encode('utf-8'))
    except Exception as e:
        R.log('Get Up and Walk non raggiungibile:', e)
        return []
    oggi = datetime.now(timezone(timedelta(hours=1))).strftime('%Y-%m-%d')
    out = []
    for it in root.iter('item'):
        html_ = it.findtext('{http://purl.org/rss/1.0/modules/content/}encoded') or it.findtext('description') or ''
        text_all = R.strip(html_)
        ref = re.search(r'commento (?:di|a) ((?:Mt|Mc|Lc|Gv)\s?\d+[,.:]\s?[\d\-.,a-z ]+)', text_all + ' ' + (it.findtext('title') or ''))
        if not ref:
            continue  # non è un commento al Vangelo: si scarta
        paras = [R.strip(p) for p in re.findall(r'<p[^>]*>(.*?)</p>', html_, re.S)]
        if len([p for p in paras if len(p) > 40]) < 4 and it.findtext('link'):
            try:
                page = R.get(it.findtext('link'), browser=True)
                body = page.split('entry-content', 1)[-1] if 'entry-content' in page else page
                paras = [R.strip(p) for p in re.findall(r'<p[^>]*>(.*?)</p>', body, re.S)]
            except Exception as e:
                R.log('pagina Get Up and Walk non leggibile:', e)
        paras = [p for p in paras if len(p) > 2][:60]
        try:
            d = email.utils.parsedate_to_datetime(it.findtext('pubDate')).astimezone(timezone(timedelta(hours=1))).strftime('%Y-%m-%d')
        except Exception:
            d = ''
        out.append({'title': R.strip(it.findtext('title')), 'ref': ref.group(1).strip(' .,'), 'link': it.findtext('link'), 'date': d, 'oggi': d == oggi, 'paras': paras})
        if len(out) >= 3:
            break
    return out


def libere(res):
    out, res['fonti'] = [], {}
    recent = time.time() - 2 * 86400
    for nome, (rss, dominio) in FONTI_LIBERE.items():
        its, via = [], None
        if rss:
            try:
                its = [i for i in R.parse_rss(R.get(rss, browser=True)) if i['title']]
                via = 'rss'
            except Exception as e:
                R.log('feed diretto non raggiungibile:', nome, str(e)[:80])
        if not its:
            try:
                its = R.parse_rss(R.get(R.gn_search(f'site:{dominio} when:1d')))
                via = 'google'
            except Exception as e:
                R.log('fonte non raggiungibile:', nome, str(e)[:80])
        its = [dict(i, src=nome, feed=nome) for i in its if not i['ts'] or i['ts'] > recent][:20]
        res['fonti'][nome] = {'ok': bool(its), 'n': len(its), 'via': via}
        out += its
        time.sleep(0.3)
    R.log('fonti libere:', {k: v['n'] for k, v in res['fonti'].items()})
    return out


def main(out):
    res = {'aggiornato': datetime.now(timezone.utc).isoformat(), 'sezioni': {}}
    recent = time.time() - 4 * 86400
    for tag, urls in SEZIONI.items():
        items = []
        for u in urls:
            try:
                feed = next((v for k, v in NOMI.items() if k in u), 'web')
                items += [dict(i, feed=feed) for i in R.parse_rss(R.get(u))]
            except Exception as e:
                R.log('feed non raggiungibile:', u, e)
        items = [i for i in items if i['title'] and (not i['ts'] or i['ts'] > recent)]
        items.sort(key=lambda i: -i['ts'])
        if tag == 'Principali':
            items += libere(res)
            items.sort(key=lambda i: -i['ts'])
        res['sezioni'][tag] = [{'title': i['title'], 'src': i['src'], 'link': i['link'], 'date': iso(i['ts']), 'desc': i['desc'], 'feed': i['feed']} for i in items[:140 if tag == 'Principali' else 80]]
    import re as _re
    res['temi'] = {}
    for nome, (q, must) in TEMI.items():
        try:
            its = R.parse_rss(R.get(R.gn_search(q + ' when:4d')))
            rx = _re.compile(must, _re.I)
            its = [i for i in its if rx.search(i['title'] + ' ' + i['desc'])]
            its.sort(key=lambda i: -i['ts'])
            res['temi'][nome] = [{'title': i['title'], 'src': i['src'], 'link': i['link'], 'date': iso(i['ts']), 'desc': i['desc'], 'feed': nome} for i in its[:30]]
        except Exception as e:
            R.log('tema non raggiungibile:', nome, e)
        time.sleep(0.5)
    res['vangelo'] = vangelo()
    try:
        res['liturgia'] = R.liturgia()
    except Exception as e:
        R.log('liturgia non disponibile:', e)
    res['testate'] = {}
    for nome, dominio in TESTATE.items():  # per chi ha un abbonamento: le ultime della sua testata
        try:
            its = R.parse_rss(R.get(R.gn_search(f'site:{dominio} when:2d')))
            its.sort(key=lambda i: -i['ts'])
            res['testate'][nome] = [{'title': i['title'], 'src': nome, 'link': i['link'], 'date': iso(i['ts']), 'desc': i['desc'], 'feed': nome} for i in its[:30]]
        except Exception as e:
            R.log('testata non raggiungibile:', nome, e)
        time.sleep(0.4)
    # antefatti per le storie principali (servono al «Capire al volo» sul telefono)
    prior = {}
    tops = []
    for tag, k in (('Principali', 15), ('Italia', 6), ('Mondo', 6), ('Economia', 4), ('Scienza', 3)):
        tops += R.cluster([dict(i, ts=0) for i in res['sezioni'][tag]])[:k]
    seen = set()
    for c in tops:
        if c['main']['title'] in seen:
            continue
        seen.add(c['main']['title'])
        t = c['main']['title']
        prior[t] = [{'title': p['title'], 'src': p['src'], 'date': iso(p['ts'])} for p in R.prior_news(t, 30)]
        time.sleep(1)
    res['antefatti'] = prior
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    R.log('notizie:', {k: len(v) for k, v in res['sezioni'].items()}, '· antefatti per', len(prior), 'storie')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'notizie.json')
