"""Voti di BAAI/bge-reranker-v2-m3 LOCALE, per prepara.mjs --reranker locale (16/9/26).

Gira col runtime Python installato dal banco (~/Library/Application Support/MappAI/
local-ai), senza rete: HF_HUB_OFFLINE e TRANSFORMERS_OFFLINE li imposta chi lo lancia.
Entrata: {"richieste": [{"query": "...", "documenti": ["...", ...]}, ...]}
Uscita:  {"modello": "...", "revisione": "...", "voti": [[...], ...]}
"""
import glob, json, os, sys

from sentence_transformers import CrossEncoder
import torch

entrata, uscita = sys.argv[1], sys.argv[2]
radice = os.path.expanduser('~/Library/Application Support/MappAI/local-ai/models/models--BAAI--bge-reranker-v2-m3/snapshots')
cartelle = sorted(glob.glob(os.path.join(radice, '*')))
if not cartelle:
    sys.exit('Modello locale non trovato in ' + radice)
dispositivo = 'mps' if torch.backends.mps.is_available() else 'cpu'
modello = CrossEncoder(cartelle[-1], device=dispositivo, max_length=1024)
dati = json.load(open(entrata, encoding='utf-8'))
voti = []
for k, r in enumerate(dati['richieste']):
    punteggi = modello.predict([(r['query'], d) for d in r['documenti']], batch_size=16)
    voti.append([round(float(v), 6) for v in punteggi])
    print('\r  reranker locale: %d / %d nodi' % (k + 1, len(dati['richieste'])), end='', file=sys.stderr, flush=True)
print('', file=sys.stderr)
json.dump({'modello': 'BAAI/bge-reranker-v2-m3', 'revisione': os.path.basename(cartelle[-1]), 'dispositivo': dispositivo, 'voti': voti},
          open(uscita, 'w', encoding='utf-8'), ensure_ascii=False)
