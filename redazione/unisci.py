#!/usr/bin/env python3
"""Unisce il lavoro dei giri paralleli di «Capire al volo» in un unico indice.

Uso: python3 redazione/unisci.py <cartella base> <cartella parte 1> [<parte 2> ...]
Ogni cartella contiene contenuti/indice.json e le lezioni. Il risultato va in <base>.
"""
import json, os, shutil, sys
from datetime import datetime, timedelta

base, parts = sys.argv[1], sys.argv[2:]
os.makedirs(os.path.join(base, 'contenuti'), exist_ok=True)
idx_path = os.path.join(base, 'contenuti', 'indice.json')
try:
    idx = json.load(open(idx_path, encoding='utf-8'))
except Exception:
    idx = {'items': []}
items = {x['id']: x for x in idx.get('items', [])}
for p in parts:
    try:
        pi = json.load(open(os.path.join(p, 'contenuti', 'indice.json'), encoding='utf-8'))
    except Exception:
        continue
    for x in pi.get('items', []):
        src = os.path.join(p, x['file'])
        if os.path.exists(src):
            dst = os.path.join(base, x['file'])
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
            items[x['id']] = x
    idx['modello'] = pi.get('modello', idx.get('modello'))
keep = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
idx['items'] = [x for x in items.values() if x['date'] >= keep or '/argomenti/' in x['file']]
for name in os.listdir(os.path.join(base, 'contenuti')):
    if name[:2] == '20' and name < keep:
        shutil.rmtree(os.path.join(base, 'contenuti', name), ignore_errors=True)
idx['aggiornato'] = datetime.utcnow().isoformat() + 'Z'
json.dump(idx, open(idx_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('indice unito:', len(idx['items']), 'contenuti')
