const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-usage-core.js');
const v = (path, cls='4R') => ({ fullPath:path, folderName:'Omonimo', rootNodeLabel:'Omonimo', classDir:cls, discDir:'Storia' });
const p = (id, cls='4R') => ({ id, name:'Omonimo', vault:'Omonimo', classDir:cls, discDir:'Storia', created:123 });
const r = (id, name='Omonimo') => ({ projectId:id, project:name, inTok:10, outTok:2 });

test('elenco dal disco include vault senza chiamate; rimossi rimangono solo nello storico', () => {
 const records=[r('a'),r('removed')]; const vaults=[v('/a'),v('/empty','3A')]; const projects=[p('a'),p('removed','2B')];
 const before=JSON.stringify([records,vaults,projects]);
 const out=C.vaultProjects(records,vaults,projects);
 assert.equal(out.length,3);
 assert.deepEqual(out.filter(x=>x.nelVault).map(x=>x.records.length),[1,0]);
 assert.equal(out.find(x=>!x.nelVault).projectId,'removed');
 assert.equal(JSON.stringify([records,vaults,projects]),before);
 assert.equal(out.reduce((n,x)=>n+x.records.length,0),records.length);
});
test('omonimi in classi diverse mantengono identità e consumi separati', () => {
 const out=C.vaultProjects([r('a'),r('b'),r('b')],[v('/a','4R'),v('/b','3A')],[p('a','4R'),p('b','3A')]);
 assert.deepEqual(out.map(x=>[x.projectId,x.records.length]),[['a',1],['b',2]]);
});
test('duplicati e match ambigui non attribuiscono costi; vault duplicati non si contano due volte', () => {
 const out=C.vaultProjects([r('a'),r('b')],[v('/a'),v('/a')],[p('a'),p('b')]);
 assert.equal(out.filter(x=>x.nelVault).length,1);
 assert.equal(out[0].records.length,0);
 assert.equal(out.filter(x=>!x.nelVault).length,2);
 const repeated=C.vaultProjects([r('a')],[v('/a'),v('/b')],[p('a')]);
 assert.equal(repeated.filter(x=>x.nelVault).reduce((n,x)=>n+x.records.length,0),0);
});
test('ID vuoti e mancanti restano nello storico: nessuna chiave coincide con Tutti', () => {
 const records=[r('', 'Uno'),r(null,'Due'),r(undefined,'Uno')];
 const out=C.vaultProjects(records,[v('/a')],[p('a')]);
 assert.ok(out.every(x=>x.key!==''));
 assert.equal(out[0].records.length,0);
 assert.deepEqual(out.filter(x=>!x.nelVault).map(x=>x.records.length),[2,1]);
});
test('contenitore allievo non viene confuso con una mappa di classe o con altro allievo', () => {
 const out=C.vaultProjects([r('a')],[{...v('/stud'),studentDir:'Ada'},v('/class')],[p('a')]);
 assert.equal(out[0].records.length,0);
 assert.equal(out[1].records.length,1);
});
test('nessun vault disponibile: lo storico resta completo e i totali si riconciliano', () => {
 const records=[r('a'),r('b'),r(null)];
 const out=C.vaultProjects(records,null,[p('a')]);
 assert.ok(out.every(x=>!x.nelVault));
 assert.equal(C.aggregate(out.flatMap(x=>x.records)).totals.calls,C.aggregate(records).totals.calls);
});
