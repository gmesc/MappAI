"""Smoke reale su esempi sintetici; non annota né esegue il campione del docente."""
import json
from datetime import datetime, timezone
from pathlib import Path
from banco import Bench, ROOT, atomic_json

def main():
    premise = 'La commissione fu istituita nel 1996. Pubblicò il rapporto nel 2002.'
    cases = [('La commissione fu istituita nel 1996.', 'entailment'),
             ('La commissione fu istituita nel 2002.', 'contradiction'),
             ('La commissione aveva cinque membri.', 'neutral')]
    rows = [dict(id='sintetico-'+str(i), mode='manuale', hypothesis=text, premise=premise,
                 expected=gold, references=[{'title':'Fixture sintetica', 'page':1}]) for i,(text,gold) in enumerate(cases)]
    path = ROOT/'runs'/('smoke-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))/'campione.json'
    atomic_json(path, dict(schema='mappai-banco-nli@1', rows=rows, pages=[], provenance={'kind':'synthetic-smoke-only'}))
    bench = Bench(path)
    bench.run(rows)
    state = bench.state()
    print(json.dumps({'path':str(path), 'job':state['job'], 'model':state['model'], 'metrics':state['metrics'],
                      'predictions':state['predictions']}, ensure_ascii=False, indent=2))
    if len(state['predictions']) != 3 or any(p.get('error') for p in state['predictions']):
        raise SystemExit('Smoke incompleto: non è una misura del progetto.')

if __name__ == '__main__':
    main()
