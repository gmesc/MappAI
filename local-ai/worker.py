"""Offline JSONL worker. stdout is protocol only; SQLite is disposable project cache."""
import os
os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false')
import argparse
import contextlib
import hashlib
import importlib.metadata
import json
from pathlib import Path
import queue
import re
import sqlite3
import sys
import threading
import time

SCHEMA = 1
MAX_LINE = 32 * 1024 * 1024

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()

def aliases(text):
    return text.replace('Ω', ' ohm ').replace('Ω', ' ohm ').replace('µ', ' micro ').replace('²', '2').replace('³', '3')

class Cancelled(Exception):
    pass

class Engine:
    def __init__(self, root, config, progress=lambda value: None, check=lambda: None):
        self.root, self.config = Path(root), config
        self.root.mkdir(parents=True, exist_ok=True)
        self.progress, self.check = progress, check
        self.encoder = self.reranker = None
        self.model_error = None
        self.device = config.get('device', 'cpu')
        self.batch = max(1, min(16, config.get('batch', 4)))
        self.manifest = {'schema': SCHEMA, 'extractor': 'mappai-snapshot-v1', 'segmentation': 'token-offset-paragraph-v1', 'normalization': 'raw-no-rewrite', 'chunkTokens': config.get('chunkTokens', 320), 'pairTokens': config.get('pairTokens', 1024), 'normalizedVectors': True, 'dtype': 'float32', 'device': self.device}

    def models(self):
        if self.encoder is not None:
            return True
        if self.model_error:
            return False
        try:
            with contextlib.redirect_stdout(sys.stderr):
                import numpy as np
                import torch
                from sentence_transformers import SentenceTransformer, CrossEncoder
                self.np = np
                if self.device == 'mps' and not torch.backends.mps.is_available():
                    raise RuntimeError('mps_unavailable: configure device=cpu explicitly')
                name = self.config['embedding']
                model = self.config['models'][name]
                rank = self.config['models'][self.config['reranker']]
                if not Path(model['path']).is_dir() or not Path(rank['path']).is_dir():
                    raise RuntimeError('model_missing: run setup')
                encoder = SentenceTransformer(model['path'], device=self.device, local_files_only=True, trust_remote_code=False)
                reranker = CrossEncoder(rank['path'], device=self.device, local_files_only=True, trust_remote_code=False, max_length=self.manifest['pairTokens'])
                # Check actual device operations before promoting the semantic path.
                encoder.encode(['prova locale'], normalize_embeddings=True, show_progress_bar=False)
                reranker.predict([('prova', 'prova locale')], show_progress_bar=False)
                self.encoder, self.reranker = encoder, reranker
                self.prefix = 'passage: ' if name.startswith('intfloat/') else ''
                self.query_prefix = 'query: ' if self.prefix else ''
                self.manifest.update(model=name, revision=model['revision'], tokenizer=model['revision'], reranker=self.config['reranker'], rerankerRevision=rank['revision'], dimensions=encoder.get_embedding_dimension(), prefix=self.prefix, queryPrefix=self.query_prefix, libraries={k: importlib.metadata.version(k) for k in ['sentence-transformers', 'transformers', 'torch', 'numpy', 'tokenizers', 'huggingface-hub']})
                return True
        except Exception as exc:
            self.encoder = self.reranker = None
            self.model_error = str(exc)
            return False

    def connect(self, project):
        if not re.fullmatch('[a-f0-9]{64}', project):
            raise ValueError('invalid_project')
        db = sqlite3.connect(self.root / (project + '.sqlite'))
        try:
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT); CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, hash TEXT, data TEXT, vector BLOB); CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED, text, tokenize="unicode61");')
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError('index_corrupt: remove cache and rebuild')
            return db
        except Exception:
            db.close()
            raise

    def chunks(self, record, semantic):
        raw = record['text']
        if not raw.strip():
            return []
        if semantic:
            offsets = self.encoder.tokenizer(raw, add_special_tokens=False, return_offsets_mapping=True)['offset_mapping']
        else:
            offsets = [(m.start(), m.end()) for m in re.finditer(r'\S+', raw)]
        cap = self.manifest['chunkTokens'] if semantic else 220
        result, i = [], 0
        while i < len(offsets):
            stop = min(i + cap, len(offsets))
            start = 0 if i == 0 else offsets[i][0]
            end = len(raw) if stop == len(offsets) else offsets[stop][0]
            # Prefer a paragraph/sentence boundary in the last third of a window.
            if stop < len(offsets):
                low = offsets[min(i + cap * 2 // 3, stop - 1)][0]
                boundaries = list(re.finditer(r'\n\s*\n|[.!?;]\s+', raw[low:end]))
                if boundaries:
                    end = low + boundaries[-1].end()
                    stop = next((j for j in range(i + 1, stop + 1) if offsets[j][0] >= end), stop)
                    end = offsets[stop][0]
            text = raw[start:end]
            chunk = {**record, 'recordId': record['recordId'] + ':' + str(len(result)), 'text': text, 'rawLocator': {'start': start, 'end': end, 'units': 'unicode-codepoints'}, 'textHash': digest(text), 'tokenCount': stop - i, 'segmented': len(offsets) > cap}
            result.append(chunk)
            i = stop
        for n, chunk in enumerate(result):
            chunk['previousId'] = result[n - 1]['recordId'] if n else None
            chunk['nextId'] = result[n + 1]['recordId'] if n + 1 < len(result) else None
        return result

    def sync(self, req):
        semantic = self.models()
        self.check()
        records = req['records']
        if len(records) > 20000:
            raise ValueError('too_many_records')
        rows = [{**c, 'projectId': req['projectId']} for r in records for c in self.chunks(r, semantic)]
        source_groups = {}
        for row in rows:
            if row.get('sourceId'):
                source_groups.setdefault((row['origin'], row['sourceId']), []).append(row)
        for group in source_groups.values():
            group.sort(key=lambda r: (r.get('page', 0), r['rawLocator']['start']))
            for i, row in enumerate(group):
                row['previousId'] = group[i - 1]['recordId'] if i else None
                row['nextId'] = group[i + 1]['recordId'] if i + 1 < len(group) else None
        if len(rows) > 30000 or len({r['recordId'] for r in rows}) != len(rows):
            raise ValueError('invalid_records')
        manifest = {**self.manifest, 'semantic': semantic}
        db = self.connect(req['projectId'])
        try:
            old_meta = dict(db.execute('SELECT key,value FROM meta'))
            compatible = old_meta.get('manifest') == json.dumps(manifest, sort_keys=True)
            old = {rid: (h, v) for rid, h, v in db.execute('SELECT id,hash,vector FROM records')} if compatible else {}
            vectors, changed = {}, []
            for row in rows:
                if row['recordId'] in old and old[row['recordId']][0] == row['textHash']:
                    vectors[row['recordId']] = old[row['recordId']][1]
                else:
                    changed.append(row)
            for offset in range(0, len(changed), self.batch):
                self.check()
                batch = changed[offset:offset + self.batch]
                if semantic:
                    with contextlib.redirect_stdout(sys.stderr):
                        values = self.encoder.encode([self.prefix + r['text'] for r in batch], batch_size=self.batch, normalize_embeddings=True, show_progress_bar=False)
                    for row, vector in zip(batch, values):
                        vectors[row['recordId']] = vector.astype('float32').tobytes()
                self.progress({'stage': 'indexing', 'done': min(offset + self.batch, len(changed)), 'total': len(changed)})
            self.check()
            # All publication, including removals/config changes, is one atomic transaction.
            with db:
                db.execute('DELETE FROM records')
                db.execute('DELETE FROM search')
                db.executemany('INSERT INTO records VALUES (?,?,?,?)', [(r['recordId'], r['textHash'], json.dumps(r, ensure_ascii=False), vectors.get(r['recordId'])) for r in rows])
                db.executemany('INSERT INTO search VALUES (?,?)', [(r['recordId'], aliases(r['text'])) for r in rows])
                for key, value in {'manifest': json.dumps(manifest, sort_keys=True), 'revision': req['revision'], 'diagnostics': json.dumps(req.get('diagnostics', []))}.items():
                    db.execute('INSERT OR REPLACE INTO meta VALUES (?,?)', (key, value))
                self.check()
            return {'status': 'ready' if semantic and not req.get('diagnostics') else 'partial', 'revision': req['revision'], 'count': len(rows), 'encoded': len(changed) if semantic else 0, 'reused': len(rows) - len(changed), 'semantic': semantic, 'manifest': manifest, 'diagnostics': req.get('diagnostics', []) + ([self.model_error] if self.model_error else [])}
        finally:
            db.close()

    def search(self, req):
        semantic = self.models()
        db = self.connect(req['projectId'])
        try:
            meta = dict(db.execute('SELECT key,value FROM meta'))
            if meta.get('revision') != req['revision']:
                return {'status': 'stale', 'revision': meta.get('revision'), 'results': []}
            origins = req.get('origins') or (['original', 'reference'] if req['mode'] == 'evidence' else ['generated', 'teacher'])
            allowed = {'original', 'reference'} if req['mode'] == 'evidence' else {'generated', 'teacher'}
            if not set(origins) <= allowed:
                raise ValueError('invalid_origin_filter')
            rows = {rid: (json.loads(data), vector) for rid, data, vector in db.execute('SELECT id,data,vector FROM records') if json.loads(data)['origin'] in origins}
            compatible = json.loads(meta.get('manifest', '{}')) == {**self.manifest, 'semantic': semantic}
            semantic = semantic and compatible and all(v is not None for _, v in rows.values())
            method = req.get('method', 'rerank')
            words = list(dict.fromkeys(re.findall(r'\w+', aliases(req['query']), re.UNICODE)))[:64]
            match = ' OR '.join('"' + w + '"' for w in words)
            lexical = [rid for rid, in db.execute('SELECT id FROM search WHERE search MATCH ? ORDER BY bm25(search)', (match,)) if rid in rows][:20] if match else []
            dense, scores = [], {}
            if semantic and rows and method != 'lexical':
                self.check()
                if len(self.encoder.tokenizer(self.query_prefix + req['query'])['input_ids']) > self.encoder.max_seq_length:
                    raise ValueError('query_too_long')
                with contextlib.redirect_stdout(sys.stderr):
                    q = self.encoder.encode([self.query_prefix + req['query']], normalize_embeddings=True, show_progress_bar=False)[0]
                keys = list(rows)
                matrix = self.np.stack([self.np.frombuffer(rows[k][1], dtype='float32') for k in keys])
                values = matrix @ q
                scores = dict(zip(keys, map(float, values)))
                dense = sorted(keys, key=lambda k: -scores[k])[:20]
            fusion = {}
            for ranking in [lexical, dense]:
                for n, rid in enumerate(ranking):
                    fusion[rid] = fusion.get(rid, 0) + 1 / (60 + n + 1)
            ranking = lexical if method == 'lexical' else dense if method == 'dense' else sorted(fusion, key=lambda k: -fusion[k])
            reranked, split_count = {}, 0
            if semantic and method in ('rerank', 'direct'):
                candidates = list(rows) if method == 'direct' and len(rows) <= 30 else ranking[:30]
                tok = self.reranker.tokenizer
                query_len = len(tok(req['query'], add_special_tokens=False)['input_ids'])
                room = self.manifest['pairTokens'] - query_len - tok.num_special_tokens_to_add(pair=True)
                if room < 32:
                    raise ValueError('query_too_long_for_reranker')
                pairs, owners = [], []
                for rid in candidates:
                    raw = rows[rid][0]['text']
                    offsets = tok(raw, add_special_tokens=False, return_offsets_mapping=True)['offset_mapping']
                    split_count += int(len(offsets) > room)
                    for i in range(0, len(offsets), max(1, room - 32)):
                        end = min(i + room, len(offsets))
                        piece = raw[offsets[i][0]:offsets[end - 1][1]]
                        # Verify the actual pair, including specials; never silently truncate.
                        if len(tok(req['query'], piece)['input_ids']) > self.manifest['pairTokens']:
                            raise ValueError('pair_too_long')
                        pairs.append((req['query'], piece)); owners.append(rid)
                        if end == len(offsets):
                            break
                for i in range(0, len(pairs), self.batch):
                    self.check()
                    with contextlib.redirect_stdout(sys.stderr):
                        values = self.reranker.predict(pairs[i:i + self.batch], batch_size=self.batch, show_progress_bar=False)
                    for rid, value in zip(owners[i:i + self.batch], values):
                        reranked[rid] = max(reranked.get(rid, -float('inf')), float(value))
                ranking = sorted(candidates, key=lambda k: -reranked.get(k, -float('inf')))
            self.check()
            results = []
            for rid in ranking[:min(20, req.get('limit', 5))]:
                row = rows[rid][0]
                neighbors = []
                for key in ['previousId', 'nextId']:
                    if row.get(key) in rows:
                        neighbors.append(rows[row[key]][0])
                results.append({**row, 'neighbors': neighbors, 'scores': {'dense': scores.get(rid), 'rrf': fusion.get(rid), 'reranker': reranked.get(rid)}})
            return {'status': 'ready' if semantic and not json.loads(meta.get('diagnostics', '[]')) else 'partial', 'revision': req['revision'], 'semantic': semantic, 'method': method if semantic else 'lexical', 'results': results, 'diagnostics': json.loads(meta.get('diagnostics', '[]')) + ([self.model_error or 'index_incompatible'] if not semantic else []), 'splitPairs': split_count, 'candidates': {'lexical': lexical, 'dense': dense, 'hybrid': sorted(fusion, key=lambda k: -fusion[k])[:20]}}
        finally:
            db.close()


def serve(root, config):
    work = queue.Queue(maxsize=16)
    cancelled = set()
    current = [None]
    output_lock = threading.Lock()
    def emit(value):
        with output_lock:
            print(json.dumps(value, ensure_ascii=False, allow_nan=False), flush=True)
    def check():
        if current[0] in cancelled:
            raise Cancelled()
    engine = Engine(root, config, lambda value: emit({'id': current[0], 'progress': value}), check)
    def run():
        while True:
            req = work.get()
            if req is None:
                return
            current[0] = req.get('id')
            started = time.perf_counter()
            try:
                check()
                method = req.get('method')
                if method == 'sync':
                    result = engine.sync(req)
                elif method == 'search':
                    result = engine.search({**req, 'method': req.get('ranking', 'rerank')})
                elif method == 'status':
                    result = {'status': 'ready' if engine.models() else 'unavailable', 'manifest': engine.manifest, 'diagnostics': [engine.model_error] if engine.model_error else [], 'pid': os.getpid()}
                else:
                    raise ValueError('invalid_method')
                emit({'id': current[0], 'result': {**result, 'elapsedMs': round((time.perf_counter() - started) * 1000, 2)}})
            except Cancelled:
                emit({'id': current[0], 'result': {'status': 'cancelled', 'results': []}})
            except Exception as exc:
                emit({'id': current[0], 'error': str(exc)[:2000]})
            finally:
                cancelled.discard(current[0]); current[0] = None
    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    while True:
        line = sys.stdin.buffer.readline(MAX_LINE + 1)
        if not line:
            break
        if len(line) > MAX_LINE:
            emit({'id': None, 'error': 'message_too_large'}); break
        req = None
        try:
            req = json.loads(line)
            if not isinstance(req, dict) or not isinstance(req.get('id'), str):
                raise ValueError('invalid_request')
            if req.get('method') == 'cancel':
                cancelled.add(req.get('target')); continue
            work.put_nowait(req)
        except Exception as exc:
            emit({'id': req.get('id') if isinstance(locals().get('req'), dict) else None, 'error': str(exc)[:200]})
    # stdin closes when Electron exits: the daemon thread cannot leave an orphan.

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', required=True)
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    serve(args.root, config)
