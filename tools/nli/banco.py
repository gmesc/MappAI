#!/usr/bin/env python3
"""Banco locale NLI. Il server non conosce né scrive il percorso del vault."""
import argparse
import hashlib
import json
import os
import secrets
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = 'MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7'
LABELS = ('entailment', 'neutral', 'contradiction')
DEFAULT_DATA = ROOT / 'runs' / 'svizzera' / 'campione.json'

def now():
    return datetime.now(timezone.utc).isoformat()

def fingerprint(row):
    # Gold e note non entrano nell'input del modello, ma fanno parte dell'esperimento.
    return hashlib.sha256(json.dumps({k: row.get(k) for k in
        ('id', 'mode', 'premise', 'hypothesis', 'references', 'expected')}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def edit_revision(row):
    return hashlib.sha256(json.dumps(row, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def excluded(row):
    return row.get('quality') == 'exclude' or row.get('expected') == 'excluded'

def evaluation_rows(rows):
    """La proposta cambia solo frase/gold: premessa e riferimenti restano comuni."""
    expanded = []
    for row in rows:
        expanded.append(row)
        if row.get('proposalHypothesis', '').strip():
            expanded.append(dict(row, id=row['id']+'::proposal', variant='proposal',
                                 hypothesis=row['proposalHypothesis'], expected=row.get('proposalExpected', ''),
                                 quality=''))
        if row.get('curation'):
            chosen = dict(row['curation'], id=row['id']+'::selected', mode='scelti', group=row.get('group'))
            expanded.extend(evaluation_rows([chosen]))
    return expanded

def report_metrics(rows, predictions):
    return {variant: {m: metrics([r for r in rows if (r.get('variant') == 'proposal') == (variant == 'proposal')], predictions, m)
                      for m in ('manuale', 'evidence', 'scelti')} for variant in ('original', 'proposal')}

def curate(data, row, payload):
    """Validate source excerpts, derive the shared premise and keep old annotations."""
    if row['mode'] != 'evidence' or not isinstance(payload, dict):
        raise ValueError('La selezione va associata a un caso Evidence.')
    excerpts = payload.get('excerpts')
    if not isinstance(excerpts, list) or len(excerpts) > 50:
        raise ValueError('Selezione non valida: massimo 50 estratti.')
    verified = []
    for item in excerpts:
        if not isinstance(item, dict) or not isinstance(item.get('text'), str) or not isinstance(item.get('enabled'), bool):
            raise ValueError('Estratto non valido.')
        text = item['text'].strip()
        if not text or len(text) > 30000:
            raise ValueError('Estratto vuoto o troppo lungo.')
        if item.get('origin') == 'automatic':
            ref = next((r for r in row['references'] if r.get('id') == item.get('evidenceId')
                        and r.get('text') == text and r['sourceId'] == item.get('sourceId') and r['page'] == item.get('page')), None)
            if ref is None:
                raise ValueError('Il passaggio automatico non corrisponde al recupero conservato.')
        elif item.get('origin') == 'manual':
            ref = next((p for p in data['pages'] if p['sourceId'] == item.get('sourceId') and p['page'] == item.get('page')
                        and ' '.join(text.split()) in ' '.join(p['text'].split())), None)
            if ref is None:
                raise ValueError('La citazione deve provenire dalla pagina indicata: copia le parole originali, senza parafrasi.')
        else:
            raise ValueError('Origine della citazione non riconosciuta.')
        verified.append(dict(sourceId=ref['sourceId'], page=ref['page'], title=ref['title'], text=text,
                             enabled=item['enabled'], origin=item['origin'], evidenceId=item.get('evidenceId') if item['origin'] == 'automatic' else None))
    premise = '\n\n'.join(x['text'] for x in verified if x['enabled'])
    if len(premise) > 30000:
        raise ValueError('Selezione troppo lunga.')
    previous = row.get('curation', row)
    result = dict(excerpts=verified, premise=premise, references=[x for x in verified if x['enabled']],
                  hypothesis=row['hypothesis'], quality=payload.get('quality', previous.get('quality', '')),
                  note=str(payload.get('note', previous.get('note', '')))[:4000],
                  proposalHypothesis=str(payload.get('proposalHypothesis', previous.get('proposalHypothesis', ''))).strip(),
                  expected=payload.get('expected', ''), proposalExpected=payload.get('proposalExpected', ''))
    if result['quality'] not in ('', 'good', 'improve', 'exclude') or any(result[k] not in ('',)+LABELS for k in ('expected','proposalExpected')):
        raise ValueError('Giudizio non riconosciuto.')
    if len(result['proposalHypothesis']) > 4000:
        raise ValueError('Proposta troppo lunga.')
    if result['quality'] == 'exclude' and not result['note'].strip():
        raise ValueError('Indica il motivo dell’esclusione.')
    if (result['expected'] or result['proposalExpected']) and not premise:
        raise ValueError('Aggiungi almeno un passaggio prima di assegnare i giudizi.')
    if result['proposalExpected'] and not result['proposalHypothesis']:
        raise ValueError('Scrivi la proposta prima di assegnare il suo giudizio.')
    # Confirmation is tied to the exact draft context; stale clients cannot carry old gold.
    changed = premise != previous['premise'] or not row.get('curation')
    if changed and (result['expected'] or result['proposalExpected']) and payload.get('confirmedPremise') != premise:
        raise ValueError('I passaggi sono cambiati: riconferma i giudizi sulla nuova selezione.')
    old = row.get('curation')
    if old and any(old.get(k) != v for k, v in result.items()):
        row.setdefault('curationHistory', []).append(json.loads(json.dumps(old)))
    result['annotatedAt'] = now()
    row['curation'] = result
    return row

def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def read_data(path):
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('schema') != 'mappai-banco-nli@1':
        raise ValueError('Formato del campione non riconosciuto.')
    ids = [r['id'] for r in data['rows']]
    if len(ids) != len(set(ids)):
        raise ValueError('Identificatori duplicati nel campione.')
    return data

def update_row(data, payload):
    row = next((r for r in data['rows'] if r['id'] == payload.get('id')), None)
    if row is None:
        raise ValueError('Caso inesistente.')
    if 'curation' in payload:
        return curate(data, row, payload['curation'])
    expected = payload.get('expected', row.get('expected', ''))
    if expected not in ('', 'excluded') + LABELS:
        raise ValueError('Giudizio non riconosciuto.')
    quality = payload.get('quality', row.get('quality', 'exclude' if row.get('expected') == 'excluded' else ''))
    if quality not in ('', 'good', 'improve', 'exclude'):
        raise ValueError('Valutazione della formulazione non riconosciuta.')
    hypothesis = str(payload.get('hypothesis', row['hypothesis'])).strip()
    premise = str(payload.get('premise', row['premise'])).strip()
    if row['mode'] == 'evidence' and (hypothesis != row['hypothesis'] or premise != row['premise']):
        raise ValueError('La prova Evidence conserva query e passaggi automatici: usa la prova manuale per modificarli.')
    if len(hypothesis) > 4000 or len(premise) > 30000:
        raise ValueError('Testo troppo lungo.')
    references = row['references']
    if row['mode'] == 'manuale':
        # La premessa resta un estratto originale continuo, senza parafrasi.
        references = [{k: p[k] for k in ('sourceId', 'title', 'page')} for p in data['pages'] if premise and premise in p['text']]
        if premise and not references:
            raise ValueError('Il passaggio deve essere copiato esattamente da una pagina mostrata, senza riscriverlo.')
    if expected in LABELS and (not hypothesis or not premise):
        raise ValueError('Per assegnare un giudizio servono affermazione e passaggio. Senza fonte, salva solo la nota oppure escludi il caso.')
    note = str(payload.get('note', row.get('note', '')))[:4000]
    if (expected == 'excluded' or quality == 'exclude') and not note.strip():
        raise ValueError('Indica il motivo dell’esclusione.')
    proposal = str(payload.get('proposalHypothesis', row.get('proposalHypothesis', ''))).strip()
    proposal_expected = payload.get('proposalExpected', row.get('proposalExpected', ''))
    if proposal_expected not in ('',) + LABELS or len(proposal) > 4000:
        raise ValueError('Proposta troppo lunga o giudizio della proposta non riconosciuto.')
    if proposal_expected in LABELS and (not proposal or not premise):
        raise ValueError('Per valutare la proposta servono una frase alternativa e il passaggio comune.')
    row.update(hypothesis=hypothesis, premise=premise, references=references, expected=expected, quality=quality,
               note=note, annotatedAt=now())
    if proposal or proposal_expected or 'proposalHypothesis' in row:
        row.update(proposalHypothesis=proposal, proposalExpected=proposal_expected)
    return row

def metrics(rows, predictions, mode):
    selected = [r for r in rows if r['mode'] == mode]
    by_id = {p['id']: p for p in predictions}
    matrix = {gold: {pred: 0 for pred in LABELS} for gold in LABELS}
    evaluated = errors = stale = correct = 0
    for row in selected:
        p = by_id.get(row['id'])
        if not p or row['expected'] not in LABELS or excluded(row):
            continue
        if p.get('fingerprint') != fingerprint(row):
            stale += 1
            continue
        if p.get('error'):
            errors += 1
            continue
        predicted = p['predicted']
        matrix[row['expected']][predicted] += 1
        evaluated += 1
        correct += row['expected'] == predicted
    tp = matrix['entailment']['entailment']
    accepted = sum(matrix[g]['entailment'] for g in LABELS)
    contradicted = sum(matrix['contradiction'].values())
    return dict(total=len(selected), annotated=sum(r['expected'] in LABELS and not excluded(r) for r in selected),
                excluded=sum(excluded(r) for r in selected), evaluated=evaluated, errors=errors,
                stale=stale, correct=correct, accuracy=correct/evaluated if evaluated else None,
                supportPrecision=tp/accepted if accepted else None,
                contradictionRecall=matrix['contradiction']['contradiction']/contradicted if contradicted else None,
                falseContradictions=matrix['entailment']['contradiction'], matrix=matrix)

class NLI:
    def __init__(self):
        # Solo il download dei pesi usa la rete; gli input non lasciano questo processo.
        os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'
        import torch
        import transformers
        from transformers import AutoTokenizer, AutoModelForSequenceClassification
        self.torch = torch
        cache = str(ROOT / 'cache')
        revision_file = ROOT / 'cache' / 'model-revision.json'
        pinned = json.loads(revision_file.read_text())['revision'] if revision_file.exists() else None
        self.model = AutoModelForSequenceClassification.from_pretrained(MODEL, revision=pinned, cache_dir=cache, trust_remote_code=False)
        revision = self.model.config._commit_hash
        if not revision:
            raise ValueError('Impossibile identificare la revisione dei pesi.')
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL, revision=revision, cache_dir=cache, trust_remote_code=False)
        self.model.eval()
        self.limit = min(int(self.model.config.max_position_embeddings), int(self.tokenizer.model_max_length))
        self.labels = [self.model.config.id2label[i].lower() for i in range(3)]
        if set(self.labels) != set(LABELS):
            raise ValueError('Etichette del modello inattese: ' + str(self.labels))
        atomic_json(revision_file, {'model': MODEL, 'revision': revision})
        self.metadata = dict(model=MODEL, revision=revision, device='cpu', maxTokens=self.limit,
                             torch=torch.__version__, transformers=transformers.__version__, python=sys.version.split()[0],
                             rule='argmax; nessuna soglia calibrata; punteggi non certificano la verità')

    def predict(self, row):
        inputs = self.tokenizer(row['premise'], row['hypothesis'], return_tensors='pt', truncation=False)
        count = inputs['input_ids'].shape[1]
        if count > self.limit:
            raise ValueError(f'Input di {count} token, limite {self.limit}: non eseguito, nessun troncamento. Scegli un passaggio più breve nella prova manuale.')
        with self.torch.inference_mode():
            scores = self.model(**inputs).logits[0].softmax(-1).tolist()
        probabilities = dict(zip(self.labels, scores))
        return dict(predicted=max(probabilities, key=probabilities.get), scores=probabilities, tokens=count)

class Bench:
    def __init__(self, path):
        self.path = path
        self.data = read_data(path)
        self.lock = threading.RLock()
        self.engine = None
        self.job = {'running': False, 'message': 'Pronto. Prima salva i tuoi giudizi, poi avvia la prova.'}
        self.latest = path.parent / 'ultimo-risultato.json'

    def state(self):
        with self.lock:
            results = json.loads(self.latest.read_text()) if self.latest.exists() else {}
            predictions = results.get('predictions', [])
            # Evitare risultati obsoleti nella scheda; lo storico resta nei file dei giri.
            expanded = evaluation_rows(self.data['rows'])
            current = {r['id']: fingerprint(r) for r in expanded if not excluded(r)}
            visible = [p for p in predictions if p.get('fingerprint') == current.get(p['id'])]
            view = json.loads(json.dumps(self.data))
            for r, original in zip(view['rows'], self.data['rows']):
                r['editRevision'] = edit_revision(original)
            return dict(data=view, job=self.job, predictions=visible, model=results.get('model'),
                        metrics=report_metrics(expanded, predictions)['original'],
                        proposalMetrics=report_metrics(expanded, predictions)['proposal'])

    def save(self, payload):
        with self.lock:
            if self.job['running']:
                raise ValueError('Attendi la fine della prova prima di cambiare i giudizi.')
            row = next((r for r in self.data['rows'] if r['id'] == payload.get('id')), None)
            if row is None or payload.get('editRevision') != edit_revision(row):
                raise ValueError('Questa scheda è stata aggiornata altrove o usa la vecchia pagina. Copia le modifiche non salvate e ricarica: nessun dato è stato sovrascritto.')
            updated = json.loads(json.dumps(self.data))
            update_row(updated, payload)
            changed = next(r for r in updated['rows'] if r['id'] == row['id'])
            if len(changed.get('curationHistory', [])) > len(row.get('curationHistory', [])):
                changed['curationHistory'][-1]['results'] = [p for p in self.state()['predictions']
                    if p['id'] in (row['id']+'::selected', row['id']+'::selected::proposal')]
            atomic_json(self.path, updated)
            self.data = updated

    def start(self):
        with self.lock:
            if self.job['running']:
                raise ValueError('Una prova è già in corso.')
            rows = json.loads(json.dumps([r for r in evaluation_rows(self.data['rows']) if r['expected'] in LABELS and not excluded(r)]))
            if not rows:
                raise ValueError('Salva almeno un giudizio di riferimento prima di avviare il modello.')
            self.job = {'running': True, 'message': 'Caricamento del modello. Al primo avvio vengono scaricati i pesi pubblici.'}
            threading.Thread(target=self.run, args=(rows,), daemon=True).start()

    def run(self, rows):
        started = time.monotonic()
        try:
            if self.engine is None:
                self.engine = NLI()
            predictions = []
            for i, row in enumerate(rows):
                with self.lock:
                    self.job['message'] = f'Confronto {i+1} di {len(rows)}'
                result = dict(id=row['id'], fingerprint=fingerprint(row))
                try:
                    result.update(self.engine.predict(row))
                except Exception as exc:
                    result['error'] = str(exc)
                predictions.append(result)
            report = dict(createdAt=now(), seconds=round(time.monotonic()-started, 2), model=self.engine.metadata,
                          provenance=self.data['provenance'], rows=rows, predictions=predictions)
            separated = report_metrics(rows, predictions)
            report['metrics'] = separated['original']
            report['proposalMetrics'] = separated['proposal']
            name = 'giro-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json'
            atomic_json(self.path.parent / name, report)
            atomic_json(self.latest, report)
            message = f'Prova conclusa: {len(rows)} casi, {sum(bool(p.get("error")) for p in predictions)} non eseguiti. Risultati salvati in {name}.'
        except Exception as exc:
            message = 'Prova non eseguita: ' + str(exc) + '. I tuoi giudizi sono conservati.'
        with self.lock:
            self.job = {'running': False, 'message': message}

def serve(path, port, open_browser):
    import fcntl
    # Un solo scrittore del campione; un secondo avvio non perde annotazioni.
    lockfile = path.with_suffix('.lock').open('a')
    try:
        fcntl.flock(lockfile, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise ValueError('Questo campione è già aperto in un altro banco.')
    bench = Bench(path)
    token = secrets.token_urlsafe(32)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, code, data, kind='application/json; charset=utf-8'):
            content = data.encode() if isinstance(data, str) else json.dumps(data, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header('Content-Type', kind)
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(content)

        def allowed(self):
            return self.headers.get('Host') == f'127.0.0.1:{self.server.server_port}'

        def do_GET(self):
            if not self.allowed():
                return self.reply(403, {'error': 'Host non consentito'})
            if self.path == '/':
                return self.reply(200, (ROOT / 'index.html').read_text().replace('__TOKEN__', token), 'text/html; charset=utf-8')
            if self.path == '/api/state':
                return self.reply(200, bench.state())
            if self.path == '/api/export':
                return self.reply(200, bench.state())
            self.reply(404, {'error': 'Pagina inesistente'})

        def do_POST(self):
            if not self.allowed() or self.headers.get('X-Banco-Token') != token:
                return self.reply(403, {'error': 'Richiesta non consentita'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 100000:
                    raise ValueError('Richiesta troppo grande o vuota.')
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict):
                    raise ValueError('La richiesta deve contenere un oggetto.')
                if self.path == '/api/save':
                    bench.save(payload)
                elif self.path == '/api/run':
                    bench.start()
                else:
                    return self.reply(404, {'error': 'Azione inesistente'})
                self.reply(200, bench.state())
            except (ValueError, TypeError, KeyError) as exc:
                self.reply(400, {'error': str(exc)})
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    url = f'http://127.0.0.1:{server.server_port}/'
    print('Banco NLI:', url, '\nCampione:', path, '\nPer chiudere: Ctrl+C', flush=True)
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        lockfile.close()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', type=Path, help='Cartella progetto da leggere una sola volta')
    parser.add_argument('--data', type=Path, default=DEFAULT_DATA)
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if args.prepare:
        if args.data.exists():
            parser.error('Il campione esiste già: scegli un altro --data per conservare annotazioni e storico.')
        project, output = args.prepare.resolve(), args.data.resolve()
        if output.is_relative_to(project):
            parser.error('Il banco non scrive dentro il progetto originale.')
        result = subprocess.run(['node', str(ROOT / 'esporta.js'), str(project)], capture_output=True, text=True, check=True)
        atomic_json(output, json.loads(result.stdout))
        print('Campione creato:', output)
    else:
        serve(args.data.resolve(), args.port, not args.no_browser)

if __name__ == '__main__':
    main()
