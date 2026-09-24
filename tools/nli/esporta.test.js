'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../../public/js/mappai-evidence-core');
const {esporta} = require('./esporta');

test('NLI export reads original sources, keeps link identity and modes, refuses stale sources', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mappai-nli-'));
  try {
    const sources=[{nome:'Test.pdf',pages:[{n:1,text:'La commissione speciale pubblicò il rapporto conclusivo nel 2002. La commissione speciale venne istituita nel 1996.'}]}];
    const links=[{source:'a',target:'b',rel:'pubblicò'},{source:'a',target:'b',rel:'precede'}];
    const p={review:{sources,baseSnapshot:{nodes:[{id:'a',label:'La commissione'},{id:'b',label:'il rapporto'}],links},initial:{report:{copertura:{linkSaltati:links}}}}};
    fs.writeFileSync(path.join(root,'pipeline.json'),JSON.stringify(p));
    fs.writeFileSync(path.join(root,'evidenze.json'),JSON.stringify(E.costruisciIndice(sources)));
    const before=fs.readFileSync(path.join(root,'pipeline.json'),'utf8');
    const exported=esporta(root);
    assert.equal(exported.rows.length,4);
    assert.equal(new Set(exported.rows.map(r=>r.id)).size,4);
    assert.equal(exported.rows.filter(r=>r.expected).length,0);
    assert.equal(exported.rows[0].premise,'');
    assert.ok(exported.rows[1].premise.includes('commissione'));
    assert.equal(fs.readFileSync(path.join(root,'pipeline.json'),'utf8'),before);
    p.review.sources[0].pages[0].text='Documento sostituito';
    fs.writeFileSync(path.join(root,'pipeline.json'),JSON.stringify(p));
    assert.throws(()=>esporta(root),/non corrisponde/);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
