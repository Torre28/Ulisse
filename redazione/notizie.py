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

SEZIONI = {
    'Principali': [R.CFG['feed'][0], 'https://www.ilpost.it/feed/', 'https://www.ansa.it/sito/ansait_rss.xml'],
    'Italia': ['https://news.google.com/rss/headlines/section/topic/NATION?hl=it&gl=IT&ceid=IT:it'],
    'Mondo': ['https://news.google.com/rss/headlines/section/topic/WORLD?hl=it&gl=IT&ceid=IT:it'],
    'Economia': ['https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=it&gl=IT&ceid=IT:it'],
    'Scienza': ['https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=it&gl=IT&ceid=IT:it'],
}
NOMI = {'ilpost': 'Il Post', 'ansa': 'ANSA', 'news.google': 'Google News'}


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None


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
        res['sezioni'][tag] = [{'title': i['title'], 'src': i['src'], 'link': i['link'], 'date': iso(i['ts']), 'desc': i['desc'], 'feed': i['feed']} for i in items[:80]]
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
