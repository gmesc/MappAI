const http = require('http'), WS = require('ws');
const port = Number(process.argv[2]);
http.get('http://127.0.0.1:' + port + '/json/list', r => { let s=''; r.on('data',c=>s+=c); r.on('end',()=> { const targets=JSON.parse(s), target=targets.find(t=>t.url?.includes('index.html'))||targets[0]; const ws=new WS(target.webSocketDebuggerUrl);ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:process.argv[3],awaitPromise:true,returnByValue:true}})));ws.on('message',b=>{const m=JSON.parse(b);if(m.id===1){console.log(JSON.stringify(m));ws.close();}}); });});
