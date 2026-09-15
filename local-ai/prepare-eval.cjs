// Read only TEMP COPIES. Source text and model outputs stay outside Git.
const fs = require('node:fs'), path = require('node:path');
const C = require('../public/js/mappai-local-search-core');
const root = process.argv[2];
if (!root || !path.resolve(root).startsWith('/private/tmp/')) throw Error('Use temporary project copies');
const names = ['Officina Elettrica', 'Officina Project E', '10 Svizzera e 2a GM'];
const corpus = {};
for (const name of names) {
  const r = JSON.parse(fs.readFileSync(path.join(root, 'projects', name, 'pipeline.json'))).review;
  corpus[name] = C.snapshot({ db: r.approvedSnapshot || r.baseSnapshot, sources: r.sources, review: r, scope: name });
}
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'italian-bank.json')));
for (const test of bank.cases) {
  const record = corpus[test.project].records.find(r => r.origin === 'original' && r.page === test.page);
  test.expected = [];
  if (test.needle) {
    const normalize = x => x.replace(/\s+/g, ' ').trim();
    if (!record || !normalize(record.text).includes(normalize(test.needle))) throw Error('Evidence missing: ' + test.id);
    // Record an exact raw excerpt, preserving OCR defects and all signs/numbers.
    const escaped = test.needle.trim().split(/\s+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const match = record.text.match(new RegExp(escaped));
    if (!match) throw Error('Locator missing: ' + test.id);
    test.expected = [{ recordId: record.recordId, start: [...record.text.slice(0, match.index)].length, end: [...record.text.slice(0, match.index + match[0].length)].length, text: match[0] }];
  }
  test.baseline = C.lexical(corpus[test.project].records, test.query, 'evidence');
}
fs.writeFileSync(path.join(root, 'corpus.json'), JSON.stringify(corpus));
fs.writeFileSync(path.join(root, 'bank-resolved.json'), JSON.stringify(bank, null, 2));
console.log(Object.fromEntries(Object.entries(corpus).map(([k, v]) => [k, { records: v.records.length, diagnostics: v.diagnostics }])));
console.log(bank.cases.length + ' cases; annotation status: ' + bank.annotationStatus);
