/* Griglia di misure sui dati veri, senza browser.
   Uso:  node tools/banco-layout/test.js                                      */
const path = require('path');
const L = require(path.resolve(__dirname, '..', '..', 'public', 'js', 'mappai-studio-layouts.js'));
const d3 = require(path.resolve(__dirname, '..', '..', 'public', 'js', 'd3.v7.min.js'));
const D = require('./data.json');
const SETS = {
  'MM':            {nodes:D.mm.nodes, links:D.mm.links},
  'MM gerarchia':  {nodes:D.mm.nodes, links:D.mm.links.filter(l=>!l.isCross)},
  'KG semantico':  {nodes:D.kg.nodes.filter(n=>!/^COMM_/.test(n.id)), links:D.kg.links.filter(l=>l.isCross)},
  'KG completo':   {nodes:D.kg.nodes, links:D.kg.links}
};
function row(label, set, opt){
  const r = L.run(set.nodes, set.links, d3, opt);
  const m = L.measure(r, opt.mode==='td');
  return {label,
    sub:r.stats.subRighe, liv:r.stats.livelli,
    lxa: m.larghezza+'x'+m.altezza, rapp:m.rapporto, area:m.areaMpx,
    incr:m.incroci, suCard:m.archiSuCard, sovr:m.cardSovrapposte,
    aree:m.areeAccavallate, arco:m.arcoMedio};
}
function table(rows){
  const k=Object.keys(rows[0]);
  const w=k.map(c=>Math.max(c.length,...rows.map(r=>String(r[c]).length)));
  console.log(k.map((c,i)=>c.padEnd(w[i])).join(' | '));
  console.log(w.map(x=>'-'.repeat(x)).join('-+-'));
  rows.forEach(r=>console.log(k.map((c,i)=>String(r[c]).padEnd(w[i])).join(' | ')));
}

for (const [name,set] of Object.entries(SETS)) {
  console.log('\n############ '+name+' ('+set.nodes.length+' nodi, '+set.links.length+' archi)');
  ['dag','td'].forEach(mode=>{
    const rows=[];
    [1,2,3,4].forEach(k=>{
      rows.push(row(mode.toUpperCase()+' ↓ sub'+k, set, {mode, orient:'td', subRows:k}));
    });
    [1,2].forEach(k=>{
      rows.push(row(mode.toUpperCase()+' → sub'+k, set, {mode, orient:'lr', subRows:k}));
    });
    table(rows);
  });
}

console.log('\n############ instradamento (KG semantico, DAG ↓ sub1)');
table(['curva','dritto','orto'].map(rt =>
  row('rout '+rt, SETS['KG semantico'], {mode:'dag', orient:'td', subRows:1, routing:rt})));

console.log('\n############ respiro verticale (KG semantico, DAG ↓ sub2)');
table([60,96,140,200].map(g =>
  row('gapLayer '+g, SETS['KG semantico'], {mode:'dag', orient:'td', subRows:2, gapLayer:g})));

console.log('\n############ auto sub-righe');
table(Object.entries(SETS).map(([n,s]) =>
  row('auto '+n, s, {mode:'dag', orient:'td', subRows:'auto'})));
