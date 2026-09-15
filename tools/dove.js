#!/usr/bin/env node
/* ══ DOVE — dal testo che si VEDE al simbolo che lo FA ═════════════════════
   Il grafo (`graphify`) indicizza SIMBOLI; chi usa l'app ricorda PAROLE — il
   titolo di un modale, l'etichetta di un bottone, il messaggio di un errore.
   Questo script è il ponte, e non chiede di ricordare niente:

       node tools/dove.js "Condividi un materiale via QR"
       node tools/dove.js "il bottone QR non apre il modale"

   Tre passi, tutti deterministici (zero AI):
     1. trova le RIGHE che contengono quelle parole (le etichette italiane
        vivono nel codice come ripiego di `t('chiave', 'testo')`);
     2. risale alla FUNZIONE che le contiene — è il nome che il grafo conosce;
     3. interroga il grafo su quella funzione e stampa vicinato e comunità.

   ⚠️ Le righe del grafo INVECCHIANO (è del 20/8): qui la riga viene sempre dal
   file vero, mai dal grafo. Il grafo dice con CHI sta, non dove sta. */
const fs = require('fs'), path = require('path'), cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CARTELLE = ['public/js', 'public/traduzioni', 'public', 'tools', 'main.js', 'preload.js',
                  'live-server.js', 'collab-server.js', 'tutor-server.js'];
const ESCLUDI = /node_modules|graphify-out|vendor|\.min\.|voxel-proto\/maps|dist|tools\/dove\.js/;

/* Confronto tollerante: accenti, apostrofi curvi, maiuscole. «È» e «e'» sono la
   stessa lettera per chi cerca, non per `indexOf`. */
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[''`´]/g, "'").toLowerCase();

/* Parole che non discriminano: cercarle darebbe mille righe e zero segnale. */
const VUOTE = new Set(('il lo la i gli le un uno una di a da in con su per tra fra e o ma se che ' +
    'non si mi ti ci vi come dove quando quale quali cosa che cosa del della dei delle al alla ' +
    'ai alle dal dalla nel nella sul sulla piu meno molto poco tutto tutti apre apri non riesco ' +
    'funziona bottone modale finestra schermata problema errore bug the a of to in is').split(' '));

function file() {
    const out = [];
    const cammina = p => {
        if (ESCLUDI.test(p)) return;
        let st; try { st = fs.statSync(p); } catch (e) { return; }
        if (st.isDirectory()) { for (const f of fs.readdirSync(p)) cammina(path.join(p, f)); return; }
        if (/\.(js|html)$/.test(p)) out.push(p);
    };
    CARTELLE.forEach(c => cammina(path.join(ROOT, c)));
    return [...new Set(out)];
}

/* La funzione che CONTIENE la riga: si risale finché non si trova una
   dichiarazione. Le cinque forme sono quelle vive in questo repo. */
const DICH = [
    /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    /* ⚠️ serve la freccia o `function`: senza, `var lista = (…)` passa per una
       funzione e il simbolo che finisce nel grafo è un nome di variabile. */
    /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/,
    /^\s*([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?function/,
    /^\s*(?:window\.)?([A-Za-z_$][\w$.]*)\s*=\s*(?:async\s*)?function/,
    /^\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/
];
/* ⚠️ `if (x) {` combacia con la quinta forma: senza questa lista il simbolo
   trovato è «if», e il grafo non sa che farsene. */
const NON_NOMI = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do', 'try', 'with']);
function funzioneDi(righe, i) {
    for (let k = i; k >= 0 && k > i - 400; k--) {
        for (const re of DICH) {
            const m = righe[k].match(re);
            if (m) {
                const n = m[1].split('.').pop();
                if (NON_NOMI.has(n)) break;          // costrutto, non funzione: si continua a risalire
                return { nome: n, riga: k + 1 };
            }
        }
    }
    return null;
}

function cerca(domanda) {
    const parole = norm(domanda).split(/[^a-z0-9']+/).filter(p => p.length > 1 && !VUOTE.has(p));
    if (!parole.length) return [];
    /* Una parola sola discrimina poco: si pretende che sia una PAROLA INTERA
       (`qr` sì, `qr` dentro `qrcode` no) — o «QR» darebbe mezzo repo. */
    const sola = parole.length === 1 ? new RegExp('(^|[^a-z0-9])' + parole[0] + '($|[^a-z0-9])') : null;
    const frase = norm(domanda).trim();
    const esiti = [];
    for (const f of file()) {
        let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
        const nf = norm(txt);
        if (!parole.some(p => nf.includes(p))) continue;
        const righe = txt.split('\n');
        righe.forEach((r, i) => {
            const nr = norm(r);
            /* frase intera = certezza; altrimenti punteggio per parole presenti */
            let punti = nr.includes(frase) ? 100 : parole.filter(p => nr.includes(p)).length;
            if (sola) { if (!sola.test(nr)) return; punti = 2; }
            else if (punti < 2 && !nr.includes(frase)) return;
            if (/^\s*(\/\/|\*|\/\*)/.test(r)) punti -= 1;          // un commento vale meno del codice
            esiti.push({ file: path.relative(ROOT, f), riga: i + 1, punti, testo: r.trim().slice(0, 110) });
        });
    }
    return esiti.sort((a, b) => b.punti - a.punti).slice(0, 8);
}

function grafo(simbolo) {
    const py = path.join(ROOT, 'graphify-out/.graphify_python');
    if (!fs.existsSync(py)) return null;
    try {
        return cp.execSync(`${JSON.stringify(fs.readFileSync(py, 'utf8').trim())} -m graphify query ${JSON.stringify(simbolo)} --budget 600`,
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { return null; }
}

const domanda = process.argv.slice(2).join(' ');
if (!domanda) { console.log('uso: node tools/dove.js "il testo che vedi a schermo"'); process.exit(1); }

const esiti = cerca(domanda);
if (!esiti.length) {
    console.log('\nNiente trovato. Cita una parola che si LEGGE nell\'app — il titolo di un\n' +
                'modale, l\'etichetta di un bottone, il testo di un messaggio.\n' +
                'Es.:  npm run dove -- "Condividi un materiale via QR"\n');
    process.exit(0);
}

console.log(`\n🔎  ${domanda}\n`);
const simboli = [];
for (const e of esiti) {
    const righe = fs.readFileSync(path.join(ROOT, e.file), 'utf8').split('\n');
    const fn = funzioneDi(righe, e.riga - 1);
    if (fn && !simboli.includes(fn.nome)) simboli.push(fn.nome);
    console.log(`  ${e.file}:${e.riga}` + (fn ? `   dentro ${fn.nome}()  [def. riga ${fn.riga}]` : ''));
    console.log(`      ${e.testo}`);
}

const capo = simboli[0];
if (!capo) process.exit(0);
console.log(`\n🕸  Vicinato di ${capo}() nel grafo — chi altro tocca la stessa cosa:\n`);
const g = grafo(capo);
if (!g) { console.log('  (grafo non interrogabile: manca graphify-out/.graphify_python)'); process.exit(0); }
const nodi = g.split('\n').filter(r => r.startsWith('NODE')).slice(0, 14);
nodi.forEach(r => console.log('  ' + r.replace(/^NODE /, '').replace(/\[src=/, '← ').replace(/ loc=L\d+/, '').replace(/\]$/, '')));
console.log(`\n📖  Poi leggi stretto:  sed -n '<riga>,<riga+40>p' ${esiti[0].file}`);
console.log(`    Altri simboli in gioco: ${simboli.slice(1, 5).join(', ') || '—'}\n`);
