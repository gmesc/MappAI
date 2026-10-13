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

// ── 0061: una cartella che dichiara il suo id (ADR 0013) ─────────────────────
// Gli id sono nella forma che l'app conia: quelli dei casi sopra ('a', 'b') sono
// fuori forma e restano sul ripiego per posizione, come oggi.
const PV='proj_1789000000010', PN='proj_1789000000011', PX='proj_1789000000012';
const vi=(path,projectId,over)=>({...v(path),projectId,...over});
test('0061: U1. una cartella che dichiara il suo id riceve i suoi consumi, anche con due voci nella stessa posizione', () => {
 const records=[r(PN),r(PN),r(PV)];
 // la vecchia orfana (PV) e la nuova (PN) stanno nella stessa posizione: per posizione nessuna delle due vincerebbe
 const out=C.vaultProjects(records,[vi('/nuova',PN)],[p(PV),p(PN)]);
 const riga=out.find(x=>x.nelVault);
 assert.equal(riga.records.length,2);
 assert.ok(riga.records.every(x=>x.projectId===PN));
 assert.equal(riga.projectId,PN);
 assert.equal(riga.created,123);
 assert.deepEqual(out.filter(x=>!x.nelVault).map(x=>[x.projectId,x.records.length]),[[PV,1]]);
});
test('0061: U2. due cartelle con lo stesso id: nessuna riceve i record, che restano nello storico', () => {
 const records=[r(PN),r(PN)];
 // la voce sta nella posizione della prima; la seconda è una copia in un'altra classe
 const out=C.vaultProjects(records,[vi('/prima',PN),vi('/copia',PN,{classDir:'3A'})],[p(PN)]);
 assert.deepEqual(out.filter(x=>x.nelVault).map(x=>x.records.length),[0,0]);
 assert.equal(out.filter(x=>!x.nelVault).reduce((n,x)=>n+x.records.length,0),2);
});
test('0061: U3. una cartella con id e senza voce riceve i record con quell\'id, non quelli dell\'omonima', () => {
 const records=[r(PX),r(PV),r(PV)];
 // l'omonima PV sta nella stessa posizione, con un altro id; nessuna voce PX
 const out=C.vaultProjects(records,[vi('/x',PX)],[p(PV)]);
 const riga=out.find(x=>x.nelVault);
 assert.deepEqual(riga.records.map(x=>x.projectId),[PX]);
 assert.equal(riga.projectId,PX);
 assert.equal(riga.created,null);
 assert.deepEqual(out.filter(x=>!x.nelVault).map(x=>[x.projectId,x.records.length]),[[PV,2]]);
});
// Aggiunta del 30/09 (§6, scelta B di Giacomo): la guardia D3 portata ai consumi.
test('0061: U4. i record di una voce vanno una volta sola: alla cartella che dichiara il suo id, non anche per posizione', () => {
 const records=[r(PN),r(PN)];
 // la voce PN registra 4R/Storia/Omonimo; la cartella che la dichiara ora sta in 4R/Geografia; in 4R/Storia c'è una cartella senza id
 const out=C.vaultProjects(records,[vi('/geografia',PN,{discDir:'Geografia'}),v('/storia')],[p(PN)]);
 const geo=out.find(x=>x.key==='vault:/geografia'), sto=out.find(x=>x.key==='vault:/storia');
 assert.equal(geo.records.length,2,'alla cartella che dichiara PN');
 assert.equal(sto.records.length,0,'la cartella senza id non riceve i record di una voce che ha già la sua casa');
 assert.equal(out.reduce((n,x)=>n+x.records.length,0),records.length,'ogni record contato una volta sola');
});

/* 0093 (D) — il giro della guida («Elettricità», 4R, 13/10): 14 chiamate della MAPPA col
   `projectId` vuoto e il giro A, 16 dei materiali e 5 del giudice col progetto e il giro B.
   La cartella dichiara i due giri (index.yaml › generationUsage.costRecords, portati da
   get-all-vaults in `runIds`). La Cabina ne contava 21; devono essere 35. */
const PG='proj_1791852544512', GA='modelli-mv5yqkqv-1', GB='modelli-mv5yx9y7-2';
const giro=(n,pid,run,phase)=>Array.from({length:n},()=>({projectId:pid,project:'Elettricità',inTok:10,outTok:2,phase,runId:run}));
const guida=()=>[].concat(giro(14,'',GA,'mappa'),giro(16,PG,GB,'materiali'),giro(5,PG,GB,'giudice'));
const vg=(path,runIds,projectId=PG)=>({fullPath:path,folderName:'Elettricità',rootNodeLabel:'Elettricità',classDir:'4R',discDir:'Scienze',projectId,runIds});
test('0093 D: le chiamate della mappa vanno al progetto della cartella che dichiara il loro giro: 35, non 21', () => {
 const records=guida(), before=JSON.stringify(records);
 const prima=C.vaultProjects(records,[vg('/el')],[]);
 assert.equal(prima[0].records.length,21,'senza i giri della cartella: come oggi');
 const out=C.vaultProjects(records,[vg('/el',[GA,GB])],[]);
 assert.equal(out[0].projectId,PG);
 assert.equal(out[0].records.length,35);
 assert.equal(out.filter(x=>!x.nelVault).length,0,'niente resta nello storico');
 assert.deepEqual(out[0].records.map(x=>x.phase),records.map(x=>x.phase),'nell\'ordine del registro');
 assert.equal(JSON.stringify(records),before,'il registro non si riscrive');
});
test('0093 D: una riga senza giro resta nello storico; un giro dichiarato da due cartelle non si lega', () => {
 const senza={projectId:'',project:'Senza titolo',inTok:1,outTok:1};
 const out=C.vaultProjects(guida().concat([senza]),[vg('/el',[GA,GB])],[]);
 assert.equal(out[0].records.length,35);
 assert.deepEqual(out.filter(x=>!x.nelVault).map(x=>x.records.length),[1]);
 const due=C.vaultProjects(guida(),[vg('/el',[GA,GB]),vg('/copia',[GA],'proj_1791852544999')],[]);
 assert.equal(due.find(x=>x.key==='vault:/el').records.length,21,'il giro A è conteso: nessuno lo prende');
 assert.equal(due.filter(x=>!x.nelVault).reduce((n,x)=>n+x.records.length,0),14);
});
test('0093 D: una cartella senza identità non riceve le chiamate del suo giro', () => {
 const out=C.vaultProjects(guida(),[vg('/el',[GA,GB],null)],[]);
 assert.equal(out[0].projectId,null);
 assert.equal(out[0].records.length,0);
});

/* 0093 (D) — la metà in main.js: `get-all-vaults` vero (estratto come in
   identita-cartella.test.js) su una cartella temporanea con l'index.yaml della guida
   ridotto all'osso: l'identità in colonna 0 e i consumi della generazione coi due giri. */
function getAllVaults(base) {
 const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'), handlers={};
 const ctx=vm.createContext({fs,path,Buffer,console:{log(){},warn(){},error(){}},yaml:require('js-yaml'),
  FilesCore:require('../public/js/mappai-files-core.js'),ipcMain:{handle:(n,fn)=>{handlers[n]=fn;}},
  _contaNodiInCartella:()=>0,mapsBaseDir:()=>path.join(base,'Mappe'),studentsBaseDir:()=>path.join(base,'Allievi')});
 for (const name of ['_vaultWalkMd','_vaultPruneEmptyDirs','walkMappe']) {
  const s=source.indexOf('function '+name+'('); assert.ok(s>=0,name);
  vm.runInContext(source.slice(s,source.indexOf('\n}',s)+2),ctx);
 }
 const s=source.indexOf("ipcMain.handle('get-all-vaults',"); assert.ok(s>=0);
 vm.runInContext(source.slice(s,source.indexOf('\n});',s)+4),ctx);
 return handlers['get-all-vaults'];
}
test('0093 D: get-all-vaults porta i giri dei consumi della cartella; con quelli «Elettricità» ha 35 chiamate', async t => {
 const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'mappai-0093-'));
 t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const el=path.join(base,'Mappe','4R','Scienze','Elettricità'), vecchio=path.join(base,'Mappe','4R','Scienze','Vecchio');
 fs.mkdirSync(el,{recursive:true}); fs.mkdirSync(vecchio,{recursive:true});
 const riga=(run,phase,pid)=>'    - provider: infomaniak\n      project: Elettricità\n      projectId: "'+pid+'"\n      phase: '+phase+'\n      runId: '+run+'\n';
 fs.writeFileSync(path.join(el,'index.yaml'),'projectId: '+PG+'\nextractionMode: mindmap\nrootNodeLabel: Elettricità\n'+
  'generationUsage:\n  costRecords:\n'+riga(GA,'mappa','')+riga(GA,'mappa','')+riga(GB,'materiali',PG));
 fs.writeFileSync(path.join(vecchio,'index.yaml'),'extractionMode: mindmap\nrootNodeLabel: Vecchio\n');
 const vaults=await getAllVaults(base)();
 const v=vaults.find(x=>x.fullPath===el), w=vaults.find(x=>x.fullPath===vecchio);
 assert.equal(v.projectId,PG);
 assert.deepEqual(Array.from(v.runIds),[GA,GB],'distinti, nell\'ordine del file');
 assert.equal('runIds' in w,false,'senza consumi nessun campo in più');
 const out=C.vaultProjects(guida(),vaults,[]);
 assert.equal(out.find(x=>x.key==='vault:'+el).records.length,35);
});
