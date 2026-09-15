"""Passage matching for both exploratory and human-reviewed evaluation banks."""
import hashlib


def position(test, results):
    for rank, row in enumerate(results, 1):
        for expected in test['expected']:
            rid = row.get('recordId', '')
            if rid != expected['recordId'] and not rid.startswith(expected['recordId'] + ':'):
                continue
            locator = row.get('rawLocator')
            if locator and not (locator['start'] <= expected['start'] and locator['end'] >= expected['end']):
                continue
            if ' '.join(expected['text'].split()) in ' '.join(row['text'].split()):
                return rank
    return None


def validate_reviewed_bank(bank, corpus, corpus_bytes):
    if bank.get('schema') != 2 or not bank.get('cases'):
        raise ValueError('Reviewed bank must contain completed cases')
    if hashlib.sha256(corpus_bytes).hexdigest() != bank.get('corpusSha256'):
        raise ValueError('Reviewed bank belongs to another corpus snapshot')
    ids = set()
    for case in bank['cases']:
        if case['id'] in ids:
            raise ValueError('Duplicate reviewed case')
        ids.add(case['id'])
        review = case.get('humanReview', {})
        if not review.get('reviewer') or review.get('sourceChecked') is not True:
            raise ValueError('Human review is incomplete')
        if not case.get('expected') and (not review.get('noEvidence') or not review.get('notes')):
            raise ValueError('Missing absence assessment')
        if case.get('expected') and review.get('noEvidence'):
            raise ValueError('Contradictory absence assessment')
        if case['project'] not in corpus or case['split'] not in ('development', 'verification'):
            raise ValueError('Unknown project or split')
        pages = {r['recordId']: r['text'] for r in corpus[case['project']]['records'] if r['origin'] in ('original', 'reference')}
        for expected in case.get('expected', []) + case.get('partial', []):
            raw = pages.get(expected['recordId'], '')
            start, end = expected['start'], expected['end']
            if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start < end <= len(raw) or raw[start:end] != expected['text']:
                raise ValueError('Reviewed passage does not match archived source')
