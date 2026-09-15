// Benchmark the actual legacy baseline, separately from model inference.
const fs = require('fs'), path = require('path'), { performance } = require('perf_hooks');
const C = require('../public/js/mappai-local-search-core');
const root = process.argv[2], corpus = JSON.parse(fs.readFileSync(path.join(root, 'corpus.json'))), bank = JSON.parse(fs.readFileSync(path.join(root, 'bank-resolved.json')));
const times = {};
for (const test of bank.cases) { C.lexical(corpus[test.project].records, test.query, 'evidence'); const values=[]; for(let i=0;i<5;i++){const t=performance.now();C.lexical(corpus[test.project].records,test.query,'evidence');values.push(performance.now()-t);} times[test.id]=values.sort((a,b)=>a-b)[2]; }
fs.writeFileSync(path.join(root,'legacy-timing.json'),JSON.stringify(times,null,2));
