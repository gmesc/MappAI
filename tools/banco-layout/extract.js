/* Rigenera data.json leggendo due vault veri (Nodi/*.md + links.json).
   Uso:   node tools/banco-layout/extract.js
          node tools/banco-layout/extract.js "<cartella>" "<vault MM>" "<vault KG>"
   Serve solo se vuoi cambiare le mappe precotte: data.json è già nel repo.
   Il parsing vive in vaultparse.js, lo STESSO modulo che usa la pagina quando
   carichi una cartella a mano: una sola implementazione, nessuna divergenza. */
const fs = require('fs'), path = require('path'), os = require('os');
const VP = require('./vaultparse.js');

const BASE = process.argv[2] ||
  path.join(os.homedir(), 'Documents', 'MappAI - file', 'Mappe', '4R', 'Scienze');
const VAULT_MM = process.argv[3] || 'Elettricità - MM';
const VAULT_KG = process.argv[4] || 'Elettricità - KG';

function readVault(dir) {
  const root = path.join(BASE, dir);
  const files = [];
  const nodiDir = path.join(root, 'Nodi');
  if (fs.existsSync(nodiDir)) {
    fs.readdirSync(nodiDir).filter(f => f.endsWith('.md')).forEach(f => {
      files.push({ path: 'Nodi/' + f, text: fs.readFileSync(path.join(nodiDir, f), 'utf8') });
    });
  }
  ['links.json', 'index.yaml'].forEach(f => {
    const p = path.join(root, f);
    if (fs.existsSync(p)) files.push({ path: f, text: fs.readFileSync(p, 'utf8') });
  });
  // il nome della cartella non è deducibile dai percorsi (qui sono già
  // relativi al vault): lo si passa esplicitamente
  return VP.fromVaultFiles(files, dir);
}

const mm = readVault(VAULT_MM);
const kg = readVault(VAULT_KG);

function report(name, d) {
  console.log(name, '| cartella', d.folder, '| nodi', d.nodes.length, '| link', d.links.length,
    '| cross', d.links.filter(l => l.isCross).length,
    '| avvisi:', d.avvisi.length ? d.avvisi.join(' ; ') : 'nessuno');
}
report('MM', mm); report('KG', kg);

fs.writeFileSync(path.join(__dirname, 'data.json'), JSON.stringify({ mm, kg }, null, 1));
console.log('scritto data.json');
