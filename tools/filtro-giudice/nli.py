"""Filtro delle segnalazioni del Giudice — passo 4: NLI locale (26/9/26).

Lo stesso modello del banco NLI (tools/nli, packet 0016):
MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7, caricato dalla cache del banco
PER PERCORSO (local_files_only), così non scrive lock né scarica niente.
Va lanciato con l'interprete del banco: tools/nli/.venv/bin/python.

Entrata: {"coppie": [{"premessa": "...", "ipotesi": "..."}, ...]}
Uscita:  {"modello", "revisione", "etichette", "prob": [{"entailment", "neutral", "contradiction"}, ...]}
"""
import glob, json, os, sys

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

entrata, uscita, cache = sys.argv[1], sys.argv[2], sys.argv[3]
cartelle = sorted(glob.glob(os.path.join(cache, 'models--MoritzLaurer--mDeBERTa-v3-base-xnli-multilingual-nli-2mil7', 'snapshots', '*')))
if not cartelle:
    sys.exit('Modello NLI non trovato in ' + cache)
snap = cartelle[-1]
tok = AutoTokenizer.from_pretrained(snap, local_files_only=True)
mod = AutoModelForSequenceClassification.from_pretrained(snap, local_files_only=True).eval()
etichette = [mod.config.id2label[i].lower() for i in range(mod.config.num_labels)]
coppie = json.load(open(entrata, encoding='utf-8'))['coppie']
prob = []
with torch.no_grad():
    for i in range(0, len(coppie), 16):
        lotto = coppie[i:i + 16]
        enc = tok([c['premessa'] for c in lotto], [c['ipotesi'] for c in lotto],
                  truncation=True, max_length=512, padding=True, return_tensors='pt')
        righe = torch.softmax(mod(**enc).logits, -1).tolist()
        prob += [dict(zip(etichette, [round(x, 5) for x in r])) for r in righe]
        print('\r  NLI: %d / %d coppie' % (min(i + 16, len(coppie)), len(coppie)), end='', file=sys.stderr, flush=True)
print('', file=sys.stderr)
json.dump({'modello': 'MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7', 'revisione': os.path.basename(snap),
           'etichette': etichette, 'prob': prob}, open(uscita, 'w', encoding='utf-8'), ensure_ascii=False)
