#!/usr/bin/env node
/* CENSIMENTO — dove la maniglia della colonna sconfina nell'area, e su CHE COSA
   finisce sopra. Per ogni console e per ogni stato (colonna aperta/chiusa):
   quali elementi dell'area intersecano il rettangolo della maniglia, e chi è
   davvero in cima nel punto del contatto (elementFromPoint = la verità).

   ⚠️ NON è un banco come gli altri di questa cartella: qui serve l'APP VERA
   (la maniglia, la console e il layout esistono solo lì). Si lancia l'app col
   debug remoto e poi questo script:
       npx electron . --remote-debugging-port=9222
       node tools/smoke/censimento-maniglia-cdp.js
   ⚠️ Fra una console e l'altra ci vuole `Page.reload`: le console non si aprono
   una sopra l'altra, e senza ricarica si rimisura quella di prima scrivendo un
   censimento FALSO (successo il 14/8: diceva «Crea nuovo» anche in INSEGNA).
   Piano di lavoro: docs/HANDOFF-maniglia-layout.md                           */
'use strict';
const http=require('http'), fs=require('fs');
const path=require('path');
const WebSocket=require(path.join(__dirname,'..','..','node_modules','ws'));
function jget(u){return new Promise((res,rej)=>{http.get(u,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>res(JSON.parse(b)));}).on('error',rej);});}
let seq=0;const pending=new Map();let ws;
function send(m,p){return new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method:m,params:p||{}}));});}
async function ev(e){const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails.exception&&r.exceptionDetails.exception.description||r.exceptionDetails.text).slice(0,300));return r.result&&r.result.value;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/* Chi tocca la maniglia, dentro l'area: rettangoli che si intersecano + chi è
   in cima nel punto. Si guardano solo gli elementi FOGLIA o interattivi: i
   contenitori si intersecano sempre e non dicono niente. */
const SONDA = `(function(){
  var man=document.querySelector('.mm-console__man');
  var area=document.querySelector('.mm-console__area');
  if(!man||!area) return { stato:'niente console' };
  var rm=man.getBoundingClientRect();
  var toccati=[];
  area.querySelectorAll('*').forEach(function(el){
    var r=el.getBoundingClientRect();
    if(!r.width||!r.height) return;
    if(r.right<=rm.left||r.left>=rm.right||r.bottom<=rm.top||r.top>=rm.bottom) return;
    var interattivo = /^(BUTTON|INPUT|SELECT|A|TEXTAREA)$/.test(el.tagName) || el.hasAttribute('data-azione') || el.isContentEditable;
    var foglia = el.children.length===0;
    if(!interattivo && !foglia) return;
    toccati.push({
      tag: el.tagName.toLowerCase(),
      classe: (el.getAttribute('class')||'').split(' ').slice(0,3).join('.'),
      testo: (el.textContent||'').trim().slice(0,28),
      interattivo: interattivo,
      coperturaPx: Math.round(Math.min(rm.right,r.right)-Math.max(rm.left,r.left))
    });
  });
  var cx=rm.left+rm.width/2, cy=rm.top+rm.height/2;
  var inCima=document.elementFromPoint(cx,cy);
  var dxDestra=document.elementFromPoint(rm.right+3, cy);
  var h1=document.querySelector('.mm-box--console .mm-head__t, .mm-box--console .mm-head h1, .mm-box--console .mm-head__titolo');
  var primo=null;
  area.querySelectorAll('button,input,select,a,[data-azione],.de-bar,.mn-bento-area').forEach(function(el){
    var r=el.getBoundingClientRect(); if(!r.width||!r.height) return;
    if(!primo||r.top<primo.top-2||(Math.abs(r.top-primo.top)<=2&&r.left<primo.left)) primo={el:el,top:r.top,left:r.left};
  });
  return {
    console: h1?(h1.textContent||'').trim().slice(0,32):'(senza titolo)',
    primoContenuto: primo?{tag:primo.el.tagName.toLowerCase(),classe:(primo.el.getAttribute('class')||'').split(' ')[0],x:Math.round(primo.left),y:Math.round(primo.top),testo:(primo.el.textContent||'').trim().slice(0,22)}:null,
    maniglia:{x1:Math.round(rm.left),x2:Math.round(rm.right),y1:Math.round(rm.top),y2:Math.round(rm.bottom)},
    area:{x1:Math.round(area.getBoundingClientRect().left)},
    sconfina: Math.max(0, Math.round(rm.right - area.getBoundingClientRect().left)),
    inCimaAlCentro: inCima ? (inCima.closest('.mm-console__man') ? 'MANIGLIA' : (inCima.tagName.toLowerCase()+'.'+(inCima.getAttribute('class')||'').split(' ')[0])) : '?',
    subitoADestra: dxDestra ? (dxDestra.tagName.toLowerCase()+'.'+(dxDestra.getAttribute('class')||'').split(' ')[0]) : '?',
    toccati: toccati
  };
})()`;

(async()=>{
  const ts=await jget('http://127.0.0.1:9222/json');
  const page=ts.find(t=>t.type==='page'&&/index\.html/.test(t.url));
  ws=new WebSocket(page.webSocketDebuggerUrl,{maxPayload:64*1024*1024});
  await new Promise(r=>ws.on('open',r));
  ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.rej(new Error(m.error.message)):p.res(m.result);}});
  await send('Page.enable'); await send('Page.reload',{ignoreCache:true}); await sleep(6000);
  for(let i=0;i<60;i++){ if(await ev(`!!(window.MappAIElaboraConsole&&window.MappAITeach&&window.openCabina&&window.directLoadVault)`)) break; await sleep(1000); }
  console.log('finestra: ' + await ev(`window.innerWidth+'×'+window.innerHeight`));

  const vp='/Users/giacomomeschini/Documents/MappAI - file/Mappe/4R/Geografia/Il Clima';
  await ev(`window.directLoadVault(${JSON.stringify(vp)})`);
  await ev(`(function(){return new Promise(function(res){var g=0;(function w(){var s=(typeof appState!=='undefined')?appState:window.appState;if(s&&s.activeVaultPath===${JSON.stringify(vp)}&&s.db&&(s.db.nodes||[]).length)return res(1);if(++g>120)return res(0);setTimeout(w,200);})();});})()`);

  const esiti = [];
  async function censisci(nome){
    for (const stato of ['aperta','chiusa']) {
      if (stato==='chiusa') { await ev(`(function(){var h=document.querySelector('.mm-console__man'); if(h) h.click(); return !!h;})()`); await sleep(900); }
      const r = await ev(SONDA);
      esiti.push({ vista: nome+' · colonna '+stato, r: r });
      const tocc = (r.toccati||[]);
      const inter = tocc.filter(t=>t.interattivo);
      console.log('\n▸ ' + nome + ' · colonna ' + stato);
      console.log('   console misurata: «' + (r.console||'?') + '»');
      console.log('   maniglia ' + JSON.stringify(r.maniglia) + ' · sconfina nell\'area di ' + r.sconfina + 'px');
      if (r.primoContenuto) console.log('   primo contenuto dell\'area: ' + r.primoContenuto.tag + '.' + r.primoContenuto.classe + ' «' + r.primoContenuto.testo + '» a x=' + r.primoContenuto.x + ' y=' + r.primoContenuto.y);
      console.log('   in cima al centro: ' + r.inCimaAlCentro + ' · subito a destra: ' + r.subitoADestra);
      if (!tocc.length) console.log('   nessun elemento dell\'area sotto la maniglia ✔');
      tocc.forEach(t=>console.log('   ' + (t.interattivo?'⚠ ':'  ') + t.tag + '.' + t.classe + '  «' + t.testo + '»  copertura ' + t.coperturaPx + 'px'));
    }
    /* si riapre per la vista successiva */
    await ev(`(function(){var b=document.querySelector('.mm-box--console'); if(b&&b.classList.contains('is-nav-chiusa')){var h=document.querySelector('.mm-console__man'); if(h) h.click();} return true;})()`);
    await sleep(700);
  }

  async function ricarica(){
    await send('Page.reload',{ignoreCache:true}); await sleep(6000);
    for(let i=0;i<60;i++){ if(await ev(`!!(window.MappAIElaboraConsole&&window.MappAITeach&&window.openCabina&&window.directLoadVault)`)) break; await sleep(1000); }
    await ev(`window.directLoadVault(${JSON.stringify(vp)})`);
    await ev(`(function(){return new Promise(function(res){var g=0;(function w(){var s=(typeof appState!=='undefined')?appState:window.appState;if(s&&s.activeVaultPath===${JSON.stringify(vp)}&&s.db&&(s.db.nodes||[]).length)return res(1);if(++g>120)return res(0);setTimeout(w,200);})();});})()`);
  }

  /* 1. ELABORA: elenco (nessun documento) */
  await ev(`(function(){window.MappAIElaboraConsole.open();return true;})()`); await sleep(1600);
  await ev(`(function(){var n=document.querySelector('.mm-nav__v[data-nav^="prog:"]');if(n)n.click();return !!n;})()`); await sleep(2500);
  await censisci('ELABORA · elenco documenti');
  /* 2. ELABORA: documento aperto (barra dell'editor) */
  await ev(`window.MappAIDocEditor.openCausal('')`); await sleep(1500);
  await censisci('ELABORA · documento aperto');
  /* chiude la console */
  await ev(`(function(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));var x=document.querySelector('.mm-head__x'); if(x) x.click(); return true;})()`); await sleep(1200);

  /* 3. INSEGNA — da pagina ricaricata, altrimenti si misura la console di prima */
  await ricarica();
  await ev(`(function(){ window.MappAITeach.openConsole && window.MappAITeach.openConsole(); return true; })()`); await sleep(4000);
  await censisci('INSEGNA');

  /* 4. CABINA */
  await ricarica();
  await ev(`(function(){ window.openCabina && window.openCabina('profilo'); return true; })()`); await sleep(3000);
  await censisci('CABINA · profilo');

  var fuori = process.env.TMPDIR ? (process.env.TMPDIR + 'censimento-maniglia.json') : '/tmp/censimento-maniglia.json';
  fs.writeFileSync(fuori, JSON.stringify(esiti,null,2));
  console.log('\ndati: ' + fuori);
  ws.close();process.exit(0);
})().catch(e=>{console.log('KO: '+e.message);process.exit(1);});
