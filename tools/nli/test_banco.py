import copy
import json
from pathlib import Path
import tempfile
import unittest
import re
import subprocess
import sys
import urllib.request
import urllib.error
from unittest.mock import patch
import banco


def sample():
    page = dict(sourceId='s', title='Fonte', page=1, text='La commissione nacque nel 1996. Pubblicò nel 2002.')
    row = dict(id='a-manuale', group='a', mode='manuale', hypothesis='La commissione nacque nel 2002.',
               premise='', references=[], expected='', note='')
    return dict(schema='mappai-banco-nli@1', pages=[page], rows=[row], provenance={})


class BenchTests(unittest.TestCase):
    def test_annotation_requires_verbatim_and_independent_gold(self):
        data = sample()
        with self.assertRaisesRegex(ValueError, 'esattamente'):
            banco.update_row(data, dict(id='a-manuale', premise='Nacque nel 2000.', expected='contradiction'))
        row = banco.update_row(data, dict(id='a-manuale', premise='La commissione nacque nel 1996.', expected='contradiction'))
        self.assertEqual(row['references'][0]['page'], 1)
        automatic = copy.deepcopy(row)
        automatic.update(id='a-evidence', mode='evidence', expected='')
        data['rows'].append(automatic)
        with self.assertRaisesRegex(ValueError, 'conserva'):
            banco.update_row(data, dict(id='a-evidence', premise='altro'))
        self.assertEqual(automatic['expected'], '')

    def test_empty_missing_exclusions_do_not_become_neutral(self):
        data = sample()
        with self.assertRaisesRegex(ValueError, 'servono'):
            banco.update_row(data, dict(id='a-manuale', expected='neutral'))
        with self.assertRaisesRegex(ValueError, 'motivo'):
            banco.update_row(data, dict(id='a-manuale', expected='excluded'))
        banco.update_row(data, dict(id='a-manuale', expected='excluded', note='Freccia non interpretabile'))
        m = banco.metrics(data['rows'], [], 'manuale')
        self.assertEqual((m['excluded'], m['evaluated'], m['accuracy']), (1, 0, None))

    def test_metrics_exclude_errors_and_stale_and_separate_modes(self):
        rows, predictions = [], []
        for i, (gold, predicted) in enumerate([('entailment','entailment'), ('neutral','entailment'),
                                             ('contradiction','contradiction'), ('entailment','contradiction')]):
            r = dict(sample()['rows'][0], id=str(i), expected=gold, premise='Testo')
            rows.append(r)
            predictions.append(dict(id=r['id'], fingerprint=banco.fingerprint(r), predicted=predicted))
        m = banco.metrics(rows, predictions, 'manuale')
        self.assertEqual((m['accuracy'],m['supportPrecision'],m['contradictionRecall'],m['falseContradictions']),(.5,.5,1,1))
        predictions[0]['error'] = 'too long'
        rows[1]['hypothesis'] = 'Changed'
        m = banco.metrics(rows, predictions, 'manuale')
        self.assertEqual((m['evaluated'],m['errors'],m['stale']),(2,1,1))
        self.assertEqual(banco.metrics(rows, predictions, 'evidence')['evaluated'],0)

    def test_persistence_real_run_path_with_fake_engine_keeps_history(self):
        class FakeNLI:
            metadata = {'model': 'fixture-not-real'}
            def predict(self, row):
                return dict(predicted='contradiction', scores=dict(contradiction=.8, neutral=.1, entailment=.1), tokens=20)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'campione.json'
            banco.atomic_json(path, sample())
            bench = banco.Bench(path)
            with self.assertRaisesRegex(ValueError,'almeno'):
                bench.start()
            bench.save(dict(id='a-manuale', editRevision=bench.state()['data']['rows'][0]['editRevision'], premise='La commissione nacque nel 1996.', expected='contradiction'))
            with patch.object(banco,'NLI',FakeNLI):
                bench.run(copy.deepcopy(bench.data['rows']))
            self.assertEqual(bench.state()['metrics']['manuale']['accuracy'],1)
            bench.save(dict(id='a-manuale', editRevision=bench.state()['data']['rows'][0]['editRevision'], hypothesis='Nuova affermazione', expected='neutral'))
            self.assertEqual(bench.state()['predictions'],[])
            self.assertEqual(len(list(Path(temp).glob('giro-*.json'))),1)
            resumed = banco.Bench(path)
            self.assertEqual(resumed.data['rows'][0]['hypothesis'],'Nuova affermazione')

    def test_quality_is_independent_and_excluded_gold_is_preserved(self):
        data = sample()
        row = banco.update_row(data, dict(id='a-manuale', quality='improve', note='Riscrivere il verbo'))
        self.assertEqual(row['expected'], '')
        banco.update_row(data, dict(id=row['id'], premise='La commissione nacque nel 1996.', expected='contradiction'))
        banco.update_row(data, dict(id=row['id'], quality='exclude'))
        self.assertEqual(row['expected'], 'contradiction')
        self.assertEqual(banco.metrics(data['rows'], [], 'manuale')['annotated'], 0)
        banco.update_row(data, dict(id=row['id'], quality='good'))
        self.assertEqual(banco.metrics(data['rows'], [], 'manuale')['annotated'], 1)
        self.assertEqual(row['note'], 'Riscrivere il verbo')

    def test_stale_pages_and_disk_failure_do_not_overwrite_annotations(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'campione.json'
            original = sample()
            original['rows'][0]['note'] = 'Nota precedente'
            banco.atomic_json(path, original)
            bench = banco.Bench(path)
            self.assertEqual(bench.data, original)
            revision = bench.state()['data']['rows'][0]['editRevision']
            bench.save(dict(id='a-manuale', editRevision=revision, note='Nota nuova', quality='improve'))
            for payload in [dict(id='a-manuale'), dict(id='a-manuale', editRevision=revision, note='Vecchia scheda')]:
                with self.assertRaisesRegex(ValueError, 'sovrascritto'):
                    bench.save(payload)
            self.assertEqual(bench.data['rows'][0]['note'], 'Nota nuova')
            self.assertEqual(bench.data['rows'][0]['expected'], '')
            revision = bench.state()['data']['rows'][0]['editRevision']
            before = copy.deepcopy(bench.data)
            with patch.object(banco, 'atomic_json', side_effect=OSError('disco')):
                with self.assertRaises(OSError):
                    bench.save(dict(id='a-manuale', editRevision=revision, note='Non salvata'))
            self.assertEqual(bench.data, before)
            self.assertEqual(json.loads(path.read_text()), before)

    def test_proposal_same_premise_independent_gold_results_and_history(self):
        class FakeNLI:
            metadata = {'model': 'fixture-not-real'}
            def predict(self, row):
                return dict(predicted='entailment', scores=dict(entailment=.8, neutral=.1, contradiction=.1), tokens=20)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'campione.json'
            data = sample()
            original = data['rows'][0]
            original.update(mode='evidence', premise=data['pages'][0]['text'], expected='contradiction', note='Nota da conservare')
            banco.atomic_json(path, data)
            bench = banco.Bench(path)
            def save(**values):
                bench.save(dict(id=original['id'], editRevision=bench.state()['data']['rows'][0]['editRevision'], **values))
            save(proposalHypothesis='La commissione nacque nel 1996.')
            self.assertEqual(bench.data['rows'][0]['proposalExpected'], '')
            self.assertEqual(bench.data['rows'][0]['expected'], 'contradiction')
            save(proposalExpected='entailment')
            with patch.object(banco.threading, 'Thread') as thread:
                bench.start()
                rows = thread.call_args.kwargs['args'][0]
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0]['premise'], rows[1]['premise'])
            self.assertEqual(rows[0]['references'], rows[1]['references'])
            self.assertEqual([r['expected'] for r in rows], ['contradiction', 'entailment'])
            with patch.object(banco, 'NLI', FakeNLI):
                bench.run(rows)
            state = bench.state()
            self.assertEqual(state['metrics']['evidence']['accuracy'], 0)
            self.assertEqual(state['proposalMetrics']['evidence']['accuracy'], 1)
            self.assertEqual(len(state['predictions']), 2)
            save(proposalHypothesis='Nuova proposta', proposalExpected='neutral')
            self.assertEqual([p['id'] for p in bench.state()['predictions']], [original['id']])
            self.assertEqual(bench.state()['proposalMetrics']['evidence']['stale'], 1)
            save(quality='exclude')
            expanded = banco.evaluation_rows(bench.data['rows'])
            self.assertEqual([r['id'] for r in expanded if not banco.excluded(r)], [original['id']+'::proposal'])
            self.assertEqual(banco.Bench(path).data['rows'][0]['note'], 'Nota da conservare')
            report = json.loads(next(Path(temp).glob('giro-*.json')).read_text())
            self.assertEqual(report['rows'][1]['hypothesis'], 'La commissione nacque nel 1996.')
            with self.assertRaisesRegex(ValueError, 'servono'):
                save(proposalHypothesis='', proposalExpected='entailment')
            save(proposalHypothesis='', proposalExpected='')
            self.assertEqual(len(banco.evaluation_rows(bench.data['rows'])), 1)
            self.assertEqual(bench.data['rows'][0]['hypothesis'], original['hypothesis'])

    def test_mixed_excerpts_provenance_reconfirmation_and_separate_history(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'campione.json'
            data = sample()
            legacy = copy.deepcopy(data['rows'][0])
            r = data['rows'][0]
            r.update(id='a-evidence', mode='evidence', premise='La commissione nacque nel 1996.', expected='contradiction',
                     note='Nota salvata', proposalHypothesis='Nacque nel 1996.', proposalExpected='entailment')
            r['references']=[dict(data['pages'][0], id='ev1', text=r['premise'])]
            data['rows'].append(legacy)
            banco.atomic_json(path, data)
            bench=banco.Bench(path)
            auto=dict(r['references'][0], evidenceId='ev1', origin='automatic', enabled=False)
            manual=dict(sourceId='s', page=1, origin='manual', enabled=True, text='Pubblicò nel 2002.')
            def save(c):
                bench.save(dict(id=r['id'], editRevision=bench.state()['data']['rows'][0]['editRevision'], curation=c))
            with self.assertRaisesRegex(ValueError, 'riconferma'):
                save(dict(excerpts=[auto,manual], expected='neutral'))
            save(dict(excerpts=[auto,manual]))
            chosen=bench.data['rows'][0]['curation']
            self.assertEqual((chosen['note'],chosen['proposalHypothesis'],chosen['expected'],chosen['proposalExpected']),
                             ('Nota salvata','Nacque nel 1996.','',''))
            self.assertEqual(chosen['references'][0]['title'],'Fonte')
            save(dict(excerpts=[auto,manual],expected='neutral',proposalExpected='neutral'))
            expanded=banco.evaluation_rows(bench.data['rows'])
            curated=[x for x in expanded if x['mode']=='scelti']
            self.assertEqual(len(curated),2)
            self.assertEqual(curated[0]['premise'],curated[1]['premise'])
            predictions=[dict(id=x['id'],fingerprint=banco.fingerprint(x),predicted='neutral') for x in curated]
            banco.atomic_json(bench.latest,dict(predictions=predictions))
            self.assertEqual(bench.state()['metrics']['scelti']['evaluated'],1)
            auto['enabled']=True
            save(dict(excerpts=[auto,manual]))
            self.assertEqual(bench.state()['predictions'],[])
            last=bench.data['rows'][0]['curationHistory'][-1]
            self.assertEqual(last['expected'],'neutral')
            self.assertEqual(len(last['results']),2)
            self.assertEqual(last['premise'],'Pubblicò nel 2002.')
            self.assertEqual(bench.data['rows'][0]['expected'],'contradiction')
            self.assertEqual(bench.data['rows'][1],legacy)
            self.assertEqual(banco.Bench(path).data,bench.data)
            before=copy.deepcopy(bench.data)
            for excerpt in [dict(manual,text='Una parafrasi inventata'),dict(manual,page=99),dict(auto,text='testo alterato')]:
                with self.assertRaises(ValueError): save(dict(excerpts=[excerpt]))
            self.assertEqual(bench.data,before)
            with self.assertRaisesRegex(ValueError,'almeno un passaggio'):
                save(dict(excerpts=[],expected='neutral',confirmedPremise=''))

    def test_overlength_never_calls_model(self):
        class Tensor:
            shape = (1, 513)
        engine = banco.NLI.__new__(banco.NLI)
        engine.limit = 512
        engine.tokenizer = lambda *a, **kw: {'input_ids': Tensor()}
        with self.assertRaisesRegex(ValueError,'nessun troncamento'):
            engine.predict(dict(premise='text', hypothesis='claim'))

    def test_http_save_restart_and_write_protection(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'campione.json'
            banco.atomic_json(path, sample())
            proc = subprocess.Popen([sys.executable, str(Path(banco.__file__)), '--data',str(path),'--port','0','--no-browser'],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                url = proc.stdout.readline().strip().split('Banco NLI: ')[1]
                with urllib.request.urlopen(url) as response:
                    html = response.read().decode()
                token = re.search(r"'X-Banco-Token':'([^']+)'", html).group(1)
                with urllib.request.urlopen(url+'api/state') as response:
                    revision = json.load(response)['data']['rows'][0]['editRevision']
                body = json.dumps(dict(id='a-manuale',editRevision=revision,premise='La commissione nacque nel 1996.',expected='contradiction')).encode()
                request = urllib.request.Request(url+'api/save',data=body,headers={'Content-Type':'application/json'})
                with self.assertRaises(urllib.error.HTTPError) as failure:
                    urllib.request.urlopen(request)
                self.assertEqual(failure.exception.code,403)
                request.add_header('X-Banco-Token',token)
                with urllib.request.urlopen(request) as response:
                    self.assertEqual(json.load(response)['data']['rows'][0]['expected'],'contradiction')
                self.assertEqual(banco.Bench(path).data['rows'][0]['references'][0]['page'],1)
                forged = urllib.request.Request(url+'api/state',headers={'Host':'attacker.invalid'})
                with self.assertRaises(urllib.error.HTTPError) as failure:
                    urllib.request.urlopen(forged)
                self.assertEqual(failure.exception.code,403)
            finally:
                proc.terminate()
                proc.communicate(timeout=5)

if __name__ == '__main__':
    unittest.main()
