#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   IL CONFRONTO DI DUE GIRI DI DOMANDE (21/9/26, passo 6 del piano Evidence).

   Prende le due tracce che MappAI scrive costruendo i fogli di domande —
   `misura-evidenze.json`, una per giro, in
   ~/Library/Application Support/MappAI/MappAI-Pipeline/<runId>/ — e stampa i due
   numeri del piano SUI SOLI NODI IN COMUNE: quante domande portano un
   identificatore valido e quante sono scartate, per motivo. Più la fedeltà
   sulle sopravvissute e la copertura del pacchetto servito.

   Uso:
     node tools/misura-evidenze/confronta.mjs <giro spento> <giro acceso>
     node tools/misura-evidenze/confronta.mjs --autoprova [--mostra]

   Ogni argomento è la CARTELLA del giro o direttamente il suo
   `misura-evidenze.json`. L'ordine è quello della misura: prima il giro con
   l'interruttore spento, poi quello con l'interruttore acceso.

   ⚠️ Qui non si conta niente: i conti li fa `MappAIPipelineCore.confrontaGiri`,
   provato in Node (invariante 4). Questo file legge, stampa e basta.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const QUI = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(QUI, '..', '..');
const PC = createRequire(import.meta.url)(join(REPO, 'public/js/mappai-pipeline-core.js'));
const FILE = 'misura-evidenze.json';
const esci = (m) => { console.error('\n✗ ' + m); process.exit(1); };

// ── lettura ────────────────────────────────────────────────────────────────
function leggiGiro(percorso) {
    let p = resolve(percorso.replace(/^~(?=\/)/, process.env.HOME || '~'));
    try { if (statSync(p).isDirectory()) p = join(p, FILE); }
    catch (e) { esci('Non trovo «' + percorso + '»: ' + e.message); }
    let g;
    try { g = JSON.parse(readFileSync(p, 'utf8')); }
    catch (e) { esci('Non leggo ' + p + ': ' + e.message); }
    if (g.schema !== PC.SCHEMA_MISURA) {
        console.warn('⚠ ' + p + ' dichiara lo schema «' + (g.schema || 'nessuno') +
            '», non «' + PC.SCHEMA_MISURA + '»: la lettura prosegue, i campi potrebbero non esserci tutti.');
    }
    return g;
}

// ── stampa ─────────────────────────────────────────────────────────────────
const pct = (q) => Math.round(q * 100) + '%';
const col = (s, n) => String(s).padStart(n);
const eti = (s, n) => String(s).padEnd(n);
const LARG = 44, NUM = 11;

function riga(etichetta, a, b) {
    console.log('  ' + eti(etichetta, LARG) + '|' + col(a, NUM) + ' |' + col(b, NUM));
}

function stampa(v) {
    const [A, B] = v.giri;
    console.log('\nIL CONFRONTO DI DUE GIRI DI DOMANDE\n');
    [['primo giro  ', A], ['secondo giro', B]].forEach(([q, g]) => {
        console.log('  ' + q + ' · evidenze ' + (g.interruttore === 'acceso' ? 'ACCESE ' : 'SPENTE ') +
            ' · ' + (g.progetto || '—') + ' · ' + (g.nodi) + ' nodi' +
            (g.modello ? ' · ' + g.modello : '') + (g.runId ? '\n                 ' + g.runId : ''));
    });

    console.log('\n  Nodi in comune: ' + v.comuni + (v.comuni ? ' — il confronto è tutto qui sotto.' : ''));
    if (v.soloA.length) console.log('  Scartati perché solo nel primo giro (' + v.soloA.length + '): ' + v.soloA.join(' · '));
    if (v.soloB.length) console.log('  Scartati perché solo nel secondo giro (' + v.soloB.length + '): ' + v.soloB.join(' · '));
    if (!v.comuni) { stampaAvvisi(v); return; }

    const a = v.totali.a, b = v.totali.b;
    const capo = (g) => (g.interruttore === 'acceso' ? 'ACCESE' : 'SPENTE');
    console.log('');
    console.log('  ' + eti('sui ' + v.comuni + ' nodi in comune', LARG) + '|' + col(capo(A), NUM) + ' |' + col(capo(B), NUM));
    console.log('  ' + '─'.repeat(LARG + NUM * 2 + 3));
    riga('fogli di domande', a.fogli, b.fogli);
    riga('domande ricevute dal modello', a.ricevute, b.ricevute);
    riga('con un identificatore valido', a.conId, b.conId);
    riga('scartate', a.scartate, b.scartate);
    const motivi = [...new Set([...Object.keys(a.perMotivo), ...Object.keys(b.perMotivo)])].sort();
    motivi.forEach(m => riga('  · ' + m, a.perMotivo[m] || 0, b.perMotivo[m] || 0));
    riga('sopravvissute', a.tenute, b.tenute);
    const fa = v.totali.fedelta.a, fb = v.totali.fedelta.b;
    riga('fedeltà: prova verificata per uguaglianza',
        fa.perUguaglianza + '/' + fa.sopravvissute + ' ' + pct(fa.quota),
        fb.perUguaglianza + '/' + fb.sopravvissute + ' ' + pct(fb.quota));
    const ca = v.totali.copertura.a, cb = v.totali.copertura.b;
    riga('evidenze servite che hanno dato una domanda',
        ca.serviti ? ca.usati + '/' + ca.serviti + ' ' + pct(ca.quota) : '—',
        cb.serviti ? cb.usati + '/' + cb.serviti + ' ' + pct(cb.quota) : '—');

    console.log('\n  Nodo per nodo (ricevute · con id · scartate):');
    const largo = Math.max(...v.nodi.map(n => n.area.length), 10);
    v.nodi.forEach(n => {
        console.log('    ' + eti(n.area, largo + 2) +
            col(n.a.ricevute + ' → ' + n.b.ricevute, 10) +
            col(n.a.conId + ' → ' + n.b.conId, 12) +
            col(n.a.scartate + ' → ' + n.b.scartate, 12));
    });
    stampaAvvisi(v);
}

function stampaAvvisi(v) {
    if (!v.avvisi.length) return;
    console.log('');
    v.avvisi.forEach(x => console.log('  ⚠ ' + x));
}

// ── l'autoprova: due tracce finte, nessun Electron ─────────────────────────
/* Le stesse due tracce stanno nel LEGGIMI. Servono a provare che il comando
   dica il vero su un caso di cui si conosce la risposta: due nodi in comune,
   uno per giro fuori dal confronto, e il nodo «Neutralità armata» scritto in
   NFC in un giro e in NFD nell'altro — identico a schermo, diverso per `===`
   (trappola 25). Se la normalizzazione saltasse, i nodi in comune sarebbero 1. */
const EV = (n) => 'ev-626f5dbd6c6c4bff-' + n;
function tracceFinte() {
    const spento = {
        runId: '20260921_150210_svizzera_e_2a_gm_evidenze-off',
        progetto: 'Svizzera e 2a GM', quando: '2026-09-21T15:02:10.000Z',
        interruttore: 'spento', provider: 'infomaniak', modello: 'mistralai/Mistral-Small-4-119B-2603',
        fogli: [
            {
                area: 'Neutralità armata'.normalize('NFC'), tipo: 'Scelta Multipla', angolo: 'causa',
                ids: [], caratteri: 3120,
                ricevute: [1, 2, 3, 4].map(i => ({ q: 'Domanda ' + i, evidenza: 'una frase delle descrizioni' })),
                tenute: [1, 2, 3].map(i => ({ q: 'Domanda ' + i, evidenza: 'una frase delle descrizioni' })),
                scartati: [{ q: 'Domanda 4', evidenza: 'una frase che nel materiale non c\'è', quota: 0.31 }]
            },
            {
                area: 'Commercio con l\'Asse', tipo: 'Scelta Multipla', angolo: 'causa',
                ids: [], caratteri: 2890,
                ricevute: [1, 2, 3, 4].map(i => ({ q: 'Domanda ' + i, evidenza: 'una frase delle descrizioni' })),
                tenute: [1, 2, 3].map(i => ({ q: 'Domanda ' + i, evidenza: 'una frase delle descrizioni' })),
                scartati: [{ q: 'Domanda 4', evidenza: 'un fatto aggiunto dal modello', quota: 0.28 }]
            },
            {
                area: 'Politica d\'asilo', tipo: 'Scelta Multipla', angolo: 'causa',
                ids: [], caratteri: 2100,
                ricevute: [1, 2].map(i => ({ q: 'Domanda ' + i, evidenza: 'una frase delle descrizioni' })),
                tenute: [1, 2].map(i => ({ q: 'Domanda ' + i, evidenza: 'una frase delle descrizioni' })),
                scartati: []
            }
        ]
    };
    const acceso = {
        runId: '20260921_152944_svizzera_e_2a_gm_evidenze-on',
        progetto: 'Svizzera e 2a GM', quando: '2026-09-21T15:29:44.000Z',
        interruttore: 'acceso', provider: 'infomaniak', modello: 'mistralai/Mistral-Small-4-119B-2603',
        fogli: [
            {
                area: 'Neutralità armata'.normalize('NFD'), tipo: 'Scelta Multipla', angolo: 'causa',
                ids: [EV(12), EV(13), EV(14)], caratteri: 4210, query: 'neutralità armata esercito mobilitazione', unitaScartate: 2,
                ricevute: [
                    { q: 'Domanda 1', evidenzaId: EV(12) }, { q: 'Domanda 2', evidenzaId: EV(13) },
                    { q: 'Domanda 3' }, { q: 'Domanda 4', evidenzaId: EV(99) }
                ],
                tenute: [{ q: 'Domanda 1', evidenzaId: EV(12) }, { q: 'Domanda 2', evidenzaId: EV(13) }],
                scartati: [
                    { q: 'Domanda 3', evidenza: '', motivo: 'id-assente' },
                    { q: 'Domanda 4', evidenza: EV(99), motivo: 'id-sconosciuto' }
                ]
            },
            {
                area: 'Commercio con l\'Asse', tipo: 'Scelta Multipla', angolo: 'causa',
                ids: [EV(31), EV(32)], caratteri: 3980, query: 'commercio carbone materie prime', unitaScartate: 1,
                ricevute: [
                    { q: 'Domanda 1', evidenzaId: EV(31) }, { q: 'Domanda 2', evidenzaId: EV(32) },
                    { q: 'Domanda 3', evidenzaId: EV(31) }, { q: 'Domanda 4', evidenza: 'la frase copiata al posto dell\'id' }
                ],
                tenute: [
                    { q: 'Domanda 1', evidenzaId: EV(31) }, { q: 'Domanda 2', evidenzaId: EV(32) },
                    { q: 'Domanda 3', evidenzaId: EV(31) }
                ],
                scartati: [{ q: 'Domanda 4', evidenza: 'la frase copiata al posto dell\'id', motivo: 'id-frase-copiata' }]
            },
            {
                area: 'Oro della Reichsbank', tipo: 'Scelta Multipla', angolo: 'causa',
                ids: [EV(55)], caratteri: 1800, query: 'oro reichsbank banca nazionale', unitaScartate: 0,
                ricevute: [{ q: 'Domanda 1', evidenzaId: EV(55) }],
                tenute: [{ q: 'Domanda 1', evidenzaId: EV(55) }],
                scartati: []
            }
        ]
    };
    return [PC.riassuntoScarti(spento), PC.riassuntoScarti(acceso)];
}

function autoprova(mostra) {
    const [A, B] = tracceFinte();
    if (mostra) {
        console.log('\n── la traccia finta del giro SPENTO ──\n' + JSON.stringify(A, null, 2));
        console.log('\n── la traccia finta del giro ACCESO ──\n' + JSON.stringify(B, null, 2));
    }
    const v = PC.confrontaGiri(A, B);
    stampa(v);
    const atteso = [
        ['nodi in comune', v.comuni, 2],
        ['solo nel primo giro', v.soloA.length, 1],
        ['solo nel secondo giro', v.soloB.length, 1],
        ['domande ricevute, spento', v.totali.a.ricevute, 8],
        ['domande ricevute, acceso', v.totali.b.ricevute, 8],
        ['con un id valido, spento', v.totali.a.conId, 0],
        ['con un id valido, acceso', v.totali.b.conId, 5],
        ['scartate, spento', v.totali.a.scartate, 2],
        ['scartate, acceso', v.totali.b.scartate, 3],
        ['scarti id-assente, acceso', v.totali.b.perMotivo['id-assente'] || 0, 1],
        ['scarti id-sconosciuto, acceso', v.totali.b.perMotivo['id-sconosciuto'] || 0, 1],
        ['scarti id-frase-copiata, acceso', v.totali.b.perMotivo['id-frase-copiata'] || 0, 1],
        ['scarti a somiglianza, spento', v.totali.a.perMotivo[PC.MOTIVO_SOMIGLIANZA] || 0, 2],
        ['fedeltà, spento', v.totali.fedelta.a.quota, 0],
        ['fedeltà, acceso', v.totali.fedelta.b.quota, 1],
        ['evidenze servite, acceso', v.totali.copertura.b.serviti, 5],
        ['evidenze usate, acceso', v.totali.copertura.b.usati, 4]
    ];
    const rotti = atteso.filter(([, avuto, atteso]) => avuto !== atteso);
    console.log('\n── autoprova ──');
    if (rotti.length) {
        rotti.forEach(([n, avuto, att]) => console.log('  ✗ ' + n + ': ' + avuto + ', atteso ' + att));
        console.error('\n✗ autoprova FALLITA: ' + rotti.length + ' numeri su ' + atteso.length + ' non tornano.');
        process.exit(1);
    }
    console.log('  ✓ ' + atteso.length + ' numeri su ' + atteso.length + ' come attesi, comprese le due grafie di «Neutralità armata» (NFC e NFD) riconosciute come lo stesso nodo.');
}

// ── ingresso ───────────────────────────────────────────────────────────────
const argomenti = process.argv.slice(2);
if (argomenti.includes('--autoprova')) {
    autoprova(argomenti.includes('--mostra'));
} else {
    const percorsi = argomenti.filter(a => !a.startsWith('--'));
    if (percorsi.length !== 2) {
        esci('Servono due giri. Esempi:\n' +
            '  node tools/misura-evidenze/confronta.mjs "~/Library/Application Support/MappAI/MappAI-Pipeline/<giro spento>" "…/<giro acceso>"\n' +
            '  node tools/misura-evidenze/confronta.mjs --autoprova');
    }
    stampa(PC.confrontaGiri(leggiGiro(percorsi[0]), leggiGiro(percorsi[1])));
}
