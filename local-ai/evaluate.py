"""Real model benchmark. Requires prepare-eval.cjs output in a temporary directory."""
import argparse
import json
from pathlib import Path
import resource
import socket
import time
from worker import Engine, digest

# An attempted connection is a test failure even if a library catches it.
network_attempts = []
def no_network(*args, **kwargs):
    network_attempts.append(str(args[1:])[:100])
    raise RuntimeError('Evaluation is offline')
socket.socket.connect = no_network
socket.socket.connect_ex = no_network

p = argparse.ArgumentParser()
p.add_argument('--root', type=Path, required=True)
p.add_argument('--model', required=True)
p.add_argument('--device', default='mps')
args = p.parse_args()
config = json.loads((Path.home() / 'Library/Application Support/MappAI/local-ai/config.json').read_text())
config.update(embedding=args.model, device=args.device)
corpus = json.loads((args.root / 'corpus.json').read_text())
bank = json.loads((args.root / 'bank-resolved.json').read_text())
started = time.perf_counter()
engine = Engine(args.root / ('indexes-' + args.model.split('/')[-1]), config)
assert engine.models(), engine.model_error
cold_ms = (time.perf_counter() - started) * 1000
indexed = {}
for name, snap in corpus.items():
    req = {**snap, 'projectId': digest(name), 'records': [r for r in snap['records'] if r['origin'] in ['original', 'reference']]}
    t = time.perf_counter(); result = engine.sync(req); result['wallMs'] = (time.perf_counter() - t) * 1000
    t = time.perf_counter(); reused = engine.sync(req); result['reopenMs'] = (time.perf_counter() - t) * 1000
    assert reused['encoded'] == 0
    indexed[name] = result
    print(name, 'passages', result['count'], 'encode ms', round(result['wallMs']), flush=True)

def position(test, results):
    if not test['expected']:
        return None
    expected = test['expected'][0]
    for n, row in enumerate(results):
        if row.get('recordId', '').split(':')[:3] != expected['recordId'].split(':')[:3]:
            continue
        if ' '.join(expected['text'].split()) in ' '.join(row['text'].split()):
            return n + 1
    return None

rows = []
for test in bank['cases']:
    snap = corpus[test['project']]
    row = {'id': test['id'], 'split': test['split'], 'category': test['category'], 'hasEvidence': bool(test['expected']), 'methods': {}}
    row['methods']['legacy'] = {'position': position(test, test['baseline']), 'returned': len(test['baseline'])}
    for method in ['lexical', 'dense', 'hybrid', 'rerank']:
        t = time.perf_counter()
        result = engine.search({'projectId': digest(test['project']), 'revision': snap['revision'], 'query': test['query'], 'mode': 'evidence', 'method': method, 'limit': 20})
        row['methods'][method] = {'position': position(test, result['results']), 'returned': len(result['results']), 'ms': (time.perf_counter() - t) * 1000, 'splitPairs': result['splitPairs'], 'ids': [r['recordId'] for r in result['results']]}
    if indexed[test['project']]['count'] <= 30:
        t = time.perf_counter()
        result = engine.search({'projectId': digest(test['project']), 'revision': snap['revision'], 'query': test['query'], 'mode': 'evidence', 'method': 'direct', 'limit': 20})
        row['methods']['direct'] = {'position': position(test, result['results']), 'returned': len(result['results']), 'ms': (time.perf_counter() - t) * 1000}
    rows.append(row)
    print(test['id'], {k: v['position'] for k, v in row['methods'].items()}, flush=True)

def percentile(values, p):
    values = sorted(values)
    return values[min(len(values) - 1, int((len(values) - 1) * p))] if values else None
summary = {}
for split in ['development', 'verification']:
    subset = [r for r in rows if r['split'] == split]
    summary[split] = {}
    for method in ['legacy', 'lexical', 'dense', 'hybrid', 'rerank', 'direct']:
        available = [r for r in subset if method in r['methods']]
        positive = [r for r in available if r['hasEvidence']]
        if not positive: continue
        ranks = [r['methods'][method]['position'] for r in positive]
        times = [r['methods'][method]['ms'] for r in available if 'ms' in r['methods'][method]]
        summary[split][method] = {'n': len(positive), 'recall5': sum(p is not None and p <= 5 for p in ranks) / len(ranks), 'recall20': sum(p is not None and p <= 20 for p in ranks) / len(ranks), 'mrr20': sum(1 / p if p else 0 for p in ranks) / len(ranks), 'p50ms': percentile(times, .5), 'p95ms': percentile(times, .95), 'misses': [r['id'] for r in positive if not r['methods'][method]['position']], 'noEvidenceWithResults': [r['id'] for r in available if not r['hasEvidence'] and r['methods'][method]['returned']]}
import torch
report = {'model': args.model, 'device': args.device, 'annotationStatus': bank['annotationStatus'], 'manifest': engine.manifest, 'coldMs': cold_ms, 'maxRssBytes': resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, 'mpsAllocatedBytes': torch.mps.current_allocated_memory() if args.device == 'mps' else None, 'mpsDriverBytes': torch.mps.driver_allocated_memory() if args.device == 'mps' else None, 'networkAttempts': network_attempts, 'indexing': indexed, 'summary': summary, 'cases': rows}
assert not network_attempts, network_attempts
out = args.root / (args.model.split('/')[-1] + '-' + args.device + '.json')
out.write_text(json.dumps(report, indent=2))
print('REPORT', out, json.dumps(summary), flush=True)
