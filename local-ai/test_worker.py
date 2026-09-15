"""Deterministic storage/protocol tests. Fake embeddings are NOT a semantic evaluation."""
import json
from pathlib import Path
import re
import tempfile
import subprocess
import sys
import unittest
import numpy as np
from worker import Engine, Cancelled, digest

class Tokenizer:
    def __call__(self, text, second=None, **options):
        matches = list(re.finditer(r'\S+', text))
        return {'offset_mapping': [(m.start(), m.end()) for m in matches], 'input_ids': list(range(len(matches) + (len(second.split()) if second else 0) + (0 if options.get('add_special_tokens') is False else 3)))}
    def num_special_tokens_to_add(self, pair=False): return 3

class Encoder:
    tokenizer = Tokenizer()
    max_seq_length = 512
    def encode(self, texts, **kwargs):
        vectors = np.array([[len(s) + 1, sum(map(ord, s)) % 17 + 1] for s in texts], dtype='float32')
        return vectors / np.linalg.norm(vectors, axis=1, keepdims=True)

class Ranker:
    tokenizer = Tokenizer()
    def predict(self, pairs, **kwargs): return np.array([len(set(a.split()) & set(b.split())) for a, b in pairs])

class StorageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.e = Engine(self.tmp.name, {'device': 'cpu', 'chunkTokens': 20, 'pairTokens': 64})
        self.e.encoder, self.e.reranker, self.e.np = Encoder(), Ranker(), np
        self.e.prefix = self.e.query_prefix = ''
        self.e.manifest['dimensions'] = 2
        self.req = {'projectId': digest('a'), 'revision': 'v1', 'records': [self.record('a', 'La corrente scorre solo nel circuito chiuso.'), self.record('b', 'Resistenza elettrica ohm Ω.')], 'diagnostics': []}
    def record(self, rid, text, origin='original'):
        return {'recordId': rid, 'text': text, 'origin': origin, 'sourceId': 'doc', 'page': 1}
    def search(self, **extra):
        return self.e.search({**self.req, 'query': 'corrente circuito', 'mode': 'evidence', **extra})
    def test_incremental_reopen_metadata_and_removal(self):
        first = self.e.sync(self.req); self.assertEqual(first['encoded'], 2)
        self.assertEqual(self.e.sync(self.req)['encoded'], 0)
        self.req['records'][0]['text'] += ' Non è sempre aperto.'; self.req['revision'] = 'v2'
        self.assertEqual(self.e.sync(self.req)['encoded'], 1)
        self.req['records'][0]['page'] = 5
        self.assertEqual(self.e.sync(self.req)['encoded'], 0)
        self.req['records'].pop(); self.e.sync(self.req)
        self.assertTrue(all(r['page'] == 5 for r in self.search()['results']))
        self.assertEqual(len(self.search()['results']), 1)
    def test_cancel_before_publication_preserves_last_index(self):
        self.e.sync(self.req)
        self.req['revision'] = 'v2'; self.req['records'][0]['text'] = 'changed'
        def cancel(value): raise Cancelled()
        self.e.progress = cancel
        with self.assertRaises(Cancelled): self.e.sync(self.req)
        self.assertEqual(self.search()['status'], 'stale')
        self.assertEqual(self.search(revision='v1')['results'][0]['text'], 'La corrente scorre solo nel circuito chiuso.')
    def test_exception_inside_transaction_rolls_back(self):
        self.e.sync(self.req)
        calls = [0]
        def fail():
            calls[0] += 1
            if calls[0] == 3: raise Cancelled()
        self.e.check = fail
        self.req['revision'] = 'v2'
        with self.assertRaises(Cancelled): self.e.sync(self.req)
        self.e.check = lambda: None
        self.assertEqual(self.search(revision='v1')['status'], 'ready')
    def test_isolation_origin_filter_and_incompatible_manifest(self):
        self.req['records'].append(self.record('c', 'PRIVATE GENERATED', 'generated'))
        self.e.sync(self.req)
        self.assertTrue(all(r['origin'] == 'original' for r in self.search()['results']))
        self.assertEqual(self.search(projectId=digest('b'))['status'], 'stale')
        with self.assertRaises(ValueError): self.search(origins=['generated'])
        self.e.manifest['model'] = 'different'
        self.assertFalse(self.search()['semantic'])
        self.assertEqual(self.e.sync(self.req)['encoded'], 3)
    def test_neighbor_context_crosses_pages_without_crossing_sources(self):
        self.req['records'][1]['page'] = 2
        self.e.sync(self.req)
        found = self.search(method='lexical')['results'][0]
        self.assertEqual(found['neighbors'][0]['page'], 2)

    def test_segments_are_exact_and_pairs_never_truncate(self):
        raw = 'α Ω 😀 ' + ' '.join('parola' + str(i) for i in range(180))
        self.e.manifest['chunkTokens'] = 120
        self.req['records'] = [self.record('long', raw)]
        self.e.sync(self.req)
        result = self.search(query='parola179')
        self.assertGreater(result['splitPairs'], 0)
        for row in result['results']:
            loc = row['rawLocator']; self.assertEqual(raw[loc['start']:loc['end']], row['text'])
        with self.assertRaises(ValueError): self.search(query='query ' * 50)
    def test_process_crash_during_publication_keeps_last_committed_revision(self):
        self.e.sync(self.req)
        request = {**self.req, 'revision': 'after-crash'}
        script = """
import os, json
from worker import Engine
engine = Engine(ROOT, {})
engine.model_error = 'model_missing'
calls = [0]
def check():
    calls[0] += 1
    if calls[0] == 4: os._exit(77)
engine.check = check
engine.sync(REQUEST)
""".replace('ROOT', repr(self.tmp.name)).replace('REQUEST', repr(request))
        result = subprocess.run([sys.executable, '-c', script], cwd=Path(__file__).parent)
        self.assertEqual(result.returncode, 77)
        self.assertEqual(self.search()['status'], 'ready')
        self.assertTrue(self.search()['results'])

    def test_corrupt_cache_is_not_silently_overwritten(self):
        file = Path(self.tmp.name) / (self.req['projectId'] + '.sqlite'); file.write_bytes(b'corrupted')
        with self.assertRaises(Exception): self.e.sync(self.req)
        self.assertEqual(file.read_bytes(), b'corrupted')
    def test_missing_model_and_empty_scan_are_explicit(self):
        self.e.encoder = self.e.reranker = None; self.e.model_error = 'model_missing'
        self.req['records'] = []; self.req['diagnostics'] = [{'code': 'empty_page', 'page': 1}]
        result = self.e.sync(self.req)
        self.assertEqual(result['status'], 'partial'); self.assertEqual(result['count'], 0)
        self.assertFalse(self.search()['semantic'])

if __name__ == '__main__': unittest.main()
