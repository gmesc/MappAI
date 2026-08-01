/* Costruisce public/dev/banco-layout.html incorporando D3, il modulo dei layout
   e i dati estratti dai vault. La pagina risultante è autoconsistente: si apre
   anche con un doppio clic, senza server.
   Uso:  node tools/banco-layout/build.js                                      */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'public', 'dev', 'banco-layout.html');

const read = p => fs.readFileSync(p, 'utf8');

let html = read(path.join(HERE, 'template.html'));
const d3 = read(path.join(ROOT, 'public', 'js', 'd3.v7.min.js'));   // già vendored nell'app
// FONTE UNICA dei motori: lo stesso file che carica l'app (vista studio).
// Se cambia per l'app, cambia anche qui — mai due copie che divergono.
const layouts = read(path.join(ROOT, 'public', 'js', 'mappai-studio-layouts.js'));
const draw = read(path.join(ROOT, 'public', 'js', 'mappai-studio-draw.js'));
const jspdf = read(path.join(ROOT, 'public', 'js', 'jspdf.umd.min.js'));
const svg2pdf = read(path.join(ROOT, 'public', 'js', 'vendor', 'svg2pdf.umd.min.js'));
const vaultparse = read(path.join(HERE, 'vaultparse.js'));
const data = read(path.join(HERE, 'data.json'));

// replace con FUNZIONE: i sorgenti contengono $ e $& che altrimenti verrebbero
// interpretati come riferimenti al match e corromperebbero il file
html = html.replace('/*__D3__*/', () => d3)
           .replace('/*__LAYOUTS__*/', () => layouts)
           .replace('/*__DRAW__*/', () => draw)
           .replace('/*__JSPDF__*/', () => jspdf)
           .replace('/*__SVG2PDF__*/', () => svg2pdf)
           .replace('/*__VAULTPARSE__*/', () => vaultparse)
           .replace('/*__DATA__*/', () => data);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log('scritto', path.relative(ROOT, OUT), '—', Math.round(html.length / 1024), 'KB');
