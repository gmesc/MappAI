#!/usr/bin/env node
/* ══ CENSIMENTO DELLO STILE — i numeri che il CSS usa DAVVERO ══════════════
   Zero AI, ~1 s. Legge i quattro fogli dell'app + il blocco @layer di
   index.html e stampa:
     1. il REGISTRO dei token (ogni `--x: valore`, con file:riga);
     2. per raggi · ombre · corpi · colori · z-index, quante volte compare ogni
        valore LETTERALE (cioè scritto a mano invece che come token), e dove;
     3. i letterali che hanno GIÀ un token equivalente → sono i candidati alla
        sostituzione.

       npm run stile                      # rapporto completo + budget per famiglia
       npm run stile -- --solo hex        # una sola famiglia: hex|raggi|ombre|fs|z
       npm run stile -- --min 3           # nasconde i valori usati meno di N volte
       npm run stile -- --vicino "#3b4a5f"   # ⟵ PRIMA di scrivere un valore nuovo:
                                          #   dice a quale token somiglia e se va riusato
       npm run stile -- --vicino 13px --come fs   # per le lunghezze, il RUOLO va detto

   La regola che questo script serve: docs/rules/09-stile-e-token.md.
   ⚠️ Conta le DICHIARAZIONI nel CSS, non che cosa il browser applica: la
   cascata (713 !important) la misura solo getComputedStyle nel banco. */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FOGLI = [
    'public/css/style.css',
    'public/css/mappai-modal-tokens.css',
    'public/css/mappai-stile-manifesto.css',
    'public/css/mappai-console-manifesto.css',
];

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SOLO = opt('--solo', null);
const VICINO = opt('--vicino', null);
const COME = opt('--come', null);   /* il RUOLO: raggi|fs|spazi|colore|ombre */
const MIN = Number(opt('--min', 1));

/* il blocco @layer components di index.html è CSS a tutti gli effetti */
function layerBlock() {
    const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    const m = html.match(/<style type="text\/tailwindcss">([\s\S]*?)<\/style>/);
    return m ? m[1] : '';
}

/* i commenti si tolgono PRIMA di contare: un `--token: 0` citato in un commento
   non è una dichiarazione. Le righe restano al loro posto (si sostituisce con
   spazi, non si cancella) così file:riga resta vero. */
const senzaCommenti = t => t.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
const sorgenti = FOGLI.map(f => ({ nome: f, testo: senzaCommenti(fs.readFileSync(path.join(ROOT, f), 'utf8')) }))
    .concat([{ nome: 'public/index.html (@layer)', testo: senzaCommenti(layerBlock()) }]);

const rigaDi = (testo, idx) => testo.slice(0, idx).split('\n').length;
const corto = n => n.replace('public/css/', '').replace('.css', '');

/* ── 1. registro dei token ─────────────────────────────────────────────── */
const token = {};                       // nome → [{file, riga, valore}]
for (const s of sorgenti) {
    /* ancorato a inizio riga: `.mm-btn--primario:hover` contiene `--primario:` e non è un token */
    const re = /^\s*(--[a-zA-Z][\w-]*)\s*:\s*([^;}]+)/gm; let m;
    while ((m = re.exec(s.testo))) {
        (token[m[1]] = token[m[1]] || []).push({ file: corto(s.nome), riga: rigaDi(s.testo, m.index), valore: m[2].trim().replace(/\s*!important/, '') });
    }
}
const V = require('./vicino');
/* la mappa nome→valore, per sciogliere gli alias (`--man-card: var(--mm-neutro)`) */
const mappaToken = {};
for (const [nome, decl] of Object.entries(token)) mappaToken[nome] = decl[0].valore;
const registro = Object.entries(token).map(([nome, decl]) => ({
    nome, file: decl[0].file, riga: decl[0].riga, valore: V.risolvi(decl[0].valore, mappaToken),
}));

/* ── --vicino: la domanda da fare PRIMA di aggiungere ──────────────────── */
if (VICINO) {
    const r = V.proponi(VICINO, registro, COME);
    if (!r.tipo) { console.error('Non è né un colore né una lunghezza: ' + VICINO); process.exit(1); }
    console.log('\n« ' + VICINO + ' »  (' + r.tipo + ')\n');
    if (!r.candidati.length) { console.log('nessun token confrontabile.'); process.exit(0); }
    const u = r.tipo === 'colore' ? 'ΔE ' : '';
    for (const c of r.candidati) {
        console.log('  ' + (u + c.d.toFixed(1) + (r.tipo === 'lunghezza' ? 'px' : '')).padEnd(9) +
            c.nome.padEnd(22) + c.valore.padEnd(12) + ('[' + V.famigliaDi(c.nome) + ']').padEnd(10) +
            c.file + ':' + c.riga);
    }
    /* ⚠️ Una lunghezza da sola non dice il suo ruolo: 12px può essere un raggio, un
       corpo o un passo, e proporre `--mm-gap` come raggio perché «vale 12 anche lui»
       è esattamente il modo di creare un token sbagliato con l'aria di riusarne uno. */
    if (r.tipo === 'lunghezza' && !COME)
        console.log('\n  ⚠️ Nessun ruolo dichiarato: i candidati mescolano raggi, corpi e spazi.\n' +
            '     Rilancia con --come raggi|fs|spazi per un confronto che valga qualcosa.');
    const primo = r.candidati[0];
    const testo = {
        riusa: '✋ RIUSA ' + primo.nome + ' — ' + r.verdetto.perche + '.\n   Se il ruolo è diverso ma il colore è lo stesso, il ruolo nuovo si dichiara come\n   ALIAS (--nuovo: var(' + primo.nome + ')), non come secondo valore.',
        motiva: '⚠️  ' + r.verdetto.perche.toUpperCase() + ' (' + primo.nome + ').\n   O lo riusi, o lo DERIVI (color-mix / calc da ' + primo.nome + '), o scrivi in\n   docs/rules/09-stile-e-token.md §3 perché è una decisione diversa.',
        nuovo: '✅ TOKEN NUOVO ammesso — ' + r.verdetto.perche + '.\n   Nome che dice il RUOLO (non il colore), nel foglio della sua superficie,\n   con un commento: data, perché, misura di contrasto. Poi una riga in §3.',
    }[r.verdetto.esito];
    console.log('\n' + testo + '\n\nLa procedura completa: docs/rules/09-stile-e-token.md §6 (lo stile elastico).');
    process.exit(0);
}

/* valore → nomi dei token che lo portano (per il passo 3) */
const tokenPerValore = {};
for (const [nome, decl] of Object.entries(token))
    for (const d of decl) (tokenPerValore[d.valore.toLowerCase()] = tokenPerValore[d.valore.toLowerCase()] || new Set()).add(nome);

/* ── 2. i letterali, per famiglia ──────────────────────────────────────── */
/* `tok` dice QUALI token sono candidati per la famiglia: un raggio da 12px non
   «ha già un token» perché esiste `--mm-gap: 12px` — stessa cifra, altra cosa. */
const FAMIGLIE = {
    raggi: { re: /border-radius\s*:\s*([^;!}]+)/g, norm: v => v.trim(), tok: /-r-|-r$|-raggio/ },
    ombre: { re: /box-shadow\s*:\s*([^;}]+)/g, norm: v => v.trim().replace(/\s+/g, ' ').replace(/\s*!important/, ''), tok: /ombra/ },
    fs: { re: /font-size\s*:\s*([^;!}]+)/g, norm: v => v.trim(), tok: /-fs\b|-fs-/ },
    hex: { re: /(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b/g, norm: v => v.toLowerCase(), tok: /./ },
    z: { re: /z-index\s*:\s*([^;!}]+)/g, norm: v => v.trim(), tok: /-z\b/ },
};

function censisci(fam) {
    const { re, norm } = FAMIGLIE[fam];
    const conta = {};                   // valore → {tot, dove:{file:n}, prima:'file:riga'}
    for (const s of sorgenti) {
        const g = new RegExp(re.source, 'g'); let m;
        while ((m = g.exec(s.testo))) {
            const v = norm(m[1]);
            if (v.startsWith('var(')) continue;             // già un token: non è un letterale
            const c = conta[v] = conta[v] || { tot: 0, dove: {}, prima: corto(s.nome) + ':' + rigaDi(s.testo, m.index) };
            c.tot++; c.dove[corto(s.nome)] = (c.dove[corto(s.nome)] || 0) + 1;
        }
    }
    return Object.entries(conta).sort((a, b) => b[1].tot - a[1].tot);
}

/* ── stampa ────────────────────────────────────────────────────────────── */
const pad = (s, n) => String(s).padStart(n);
if (!SOLO) {
    console.log('═══ 1. REGISTRO DEI TOKEN (' + Object.keys(token).length + ' nomi) ═══');
    const prefissi = {};
    for (const [nome, decl] of Object.entries(token)) {
        const p = (nome.match(/^--[a-z0-9]+/i) || [nome])[0];
        (prefissi[p] = prefissi[p] || []).push(nome + ' = ' + decl[0].valore + (decl.length > 1 ? '  (×' + decl.length + ')' : '') + '   ' + decl[0].file + ':' + decl[0].riga);
    }
    for (const [p, righe] of Object.entries(prefissi).sort()) {
        console.log('\n' + p + '-*  (' + righe.length + ')');
        righe.sort().forEach(r => console.log('   ' + r));
    }
    /* token dichiarati due volte con valori DIVERSI: due verità */
    const doppi = Object.entries(token).filter(([, d]) => new Set(d.map(x => x.valore)).size > 1);
    if (doppi.length) {
        console.log('\n⚠️  token dichiarati con valori DIVERSI (due verità):');
        doppi.forEach(([n, d]) => console.log('   ' + n + '  → ' + d.map(x => x.valore + ' @' + x.file + ':' + x.riga).join('  |  ')));
    }
}

for (const fam of Object.keys(FAMIGLIE)) {
    if (SOLO && SOLO !== fam) continue;
    const righe = censisci(fam).filter(([, c]) => c.tot >= MIN);
    console.log('\n═══ 2. ' + fam.toUpperCase() + ' — letterali (' + righe.length + ' valori distinti, min ' + MIN + ') ═══');
    for (const [v, c] of righe) {
        const eq = [...(tokenPerValore[v.toLowerCase()] || [])].filter(n => FAMIGLIE[fam].tok.test(n));
        console.log(pad(c.tot, 4) + '  ' + v.padEnd(fam === 'ombre' ? 60 : 22) + '  ' +
            Object.entries(c.dove).map(([f, n]) => f + ':' + n).join(' ') +
            (eq.length ? '   ← ha già un token: ' + eq.join(', ') : ''));
    }
}

if (!SOLO) {
    /* ── il TETTO per famiglia (§6): non impedisce niente, rende visibile la crescita.
          Si contano i VALORI DISTINTI, non i nomi: un alias (--man-card → var(--mm-neutro))
          è un nome in più che non fa crescere il sistema, ed è anzi il modo giusto di dare
          un nome nuovo a un valore vecchio. I tetti sono CONGELATI al 13/9/26 sui numeri di
          quel giorno: non sono un ideale, dicono «da qui non si cresce per inerzia». ── */
    const TETTO = { colore: 41, raggi: 4, fs: 4, ombre: 2, spazi: 15 };
    const perFam = {};
    for (const t of registro) {
        const fam = V.famigliaDi(t.nome);
        (perFam[fam] = perFam[fam] || { nomi: 0, valori: new Set() }).nomi++;
        /* un token il cui valore è ancora un var() non risolto punta a qualcos'altro: è un alias */
        if (!/^var\(/.test(t.valore)) perFam[fam].valori.add(t.valore.toLowerCase());
    }
    console.log('\n═══ 3. BUDGET DEI TOKEN — valori distinti / tetto 13-9-26 (§6) ═══');
    for (const [fam, tetto] of Object.entries(TETTO)) {
        const f = perFam[fam] || { nomi: 0, valori: new Set() };
        const n = f.valori.size;
        console.log(pad(n, 5) + ' / ' + String(tetto).padEnd(4) + fam.padEnd(9) +
            '(' + f.nomi + ' nomi, ' + (f.nomi - n) + ' alias)' +
            (n > tetto ? '   ⚠️ sopra il tetto: prima di aggiungerne uno, toglierne uno' : ''));
    }

    console.log('\n═══ 4. !important per foglio ═══');
    for (const s of sorgenti) console.log(pad((s.testo.match(/!important/g) || []).length, 5) + '  ' + corto(s.nome));
    console.log('\nLa regola: docs/rules/09-stile-e-token.md · il banco: public/dev/banco-token.html (node tools/stile/banco.js)');
}
