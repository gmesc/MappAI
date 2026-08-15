/* tools/smoke/cdp.js — il ponte verso l'APP VIVA (15/8/26)
 *
 * `node tools/smoke/cdp.js "<espressione JS>" [attesaMs]` esegue l'espressione
 * nel renderer di MappAI e ne stampa il valore, le eccezioni e gli errori di
 * console. Serve perché il pannello browser non ha IPC, non ha disco e serve i
 * file dalla cache: quello che tocca vault, localStorage o finestre si può
 * misurare SOLO nell'app vera.
 *
 * Prima: `npx electron . --remote-debugging-port=9222` (o
 * `./node_modules/.bin/electron .` col medesimo flag).
 * ⚠️ Se la porta è occupata da un'istanza vecchia si parla con quella — e se il
 * suo renderer è morto, `Runtime.evaluate` non risponde MAI. `lsof -ti :9222`
 * prima di dare la colpa al codice.
 * ⚠️ `appState` e `StorageManager` sono const lessicali: da qui si vedono solo
 * i `window.*` (invariante 3).
 */
const http=require('http'), WS=require('ws');
function target(){return new Promise((ok,ko)=>{http.get('http://127.0.0.1:9222/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{const p=JSON.parse(d).filter(x=>x.type==='page');p.length?ok(p[0].webSocketDebuggerUrl):ko(new Error('nessuna pagina'));});}).on('error',ko);});}
async function run(espr, attesa){
  const url=await target(); const ws=new WS(url); let id=0; const attesi={};
  const errori=[];
  await new Promise(ok=>ws.on('open',ok));
  ws.on('message',m=>{const x=JSON.parse(m);
    if(x.id&&attesi[x.id]){attesi[x.id](x);delete attesi[x.id];}
    if(x.method==='Runtime.exceptionThrown') errori.push(x.params.exceptionDetails.text+' '+(x.params.exceptionDetails.exception||{}).description);
    if(x.method==='Runtime.consoleAPICalled'&&x.params.type==='error') errori.push((x.params.args||[]).map(a=>a.value||a.description||'').join(' '));});
  const manda=(method,params)=>new Promise(ok=>{const n=++id;attesi[n]=ok;ws.send(JSON.stringify({id:n,method,params}));});
  await manda('Runtime.enable',{});
  const r=await manda('Runtime.evaluate',{expression:espr,awaitPromise:true,returnByValue:true});
  if(attesa) await new Promise(ok=>setTimeout(ok,attesa));
  ws.close();
  const v=r.result&&r.result.result;
  return {valore: v?(v.value!==undefined?v.value:v.description):null, eccezione: r.result&&r.result.exceptionDetails?r.result.exceptionDetails.text:null, errori};
}
run(process.argv[2], parseInt(process.argv[3]||'0',10)).then(x=>console.log(JSON.stringify(x,null,1)),e=>{console.error('KO',e.message);process.exit(1);});
