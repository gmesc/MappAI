import hashlib
import json
import unittest
from evaluation_metrics import position, validate_reviewed_bank


class ReviewedBankTests(unittest.TestCase):
    def test_alternatives_and_boundaries(self):
        expected = [{'recordId': 'source:s:0', 'text': 'A', 'start': 0, 'end': 1}, {'recordId': 'source:s:0', 'text': 'B', 'start': 2, 'end': 3}]
        self.assertEqual(position({'expected': expected}, [{'recordId': 'source:s:0:1', 'text': 'B', 'rawLocator': {'start': 2, 'end': 3}}]), 1)
        self.assertIsNone(position({'expected': expected}, [{'recordId': 'source:s:1:0', 'text': 'A'}]))
        self.assertIsNone(position({'expected': expected}, [{'recordId': 'source:s:0:0', 'text': 'B', 'rawLocator': {'start': 4, 'end': 5}}]))

    def test_corpus_identity_human_status_and_unicode(self):
        corpus = {'p': {'records': [{'recordId': 'source:s:0', 'origin': 'original', 'text': 'Ω 🧪 B'}]}}
        raw = json.dumps(corpus).encode()
        bank = {'schema': 2, 'corpusSha256': hashlib.sha256(raw).hexdigest(), 'cases': [{'id': 'i', 'project': 'p', 'split': 'development', 'expected': [{'recordId': 'source:s:0', 'text': 'B', 'start': 4, 'end': 5}], 'humanReview': {'reviewer': 'QA', 'sourceChecked': True}}]}
        validate_reviewed_bank(bank, corpus, raw)
        with self.assertRaises(ValueError): validate_reviewed_bank(bank, corpus, raw + b' ')
        bank['cases'][0]['expected'][0]['start'] = 3
        with self.assertRaises(ValueError): validate_reviewed_bank(bank, corpus, raw)


if __name__ == '__main__':
    unittest.main()
