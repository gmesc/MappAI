#!/usr/bin/env node
'use strict';
/*
 * vault-estranei.js — la ricognizione dei vault, ripetibile.
 *
 * Nasce il 17/8/26 da una domanda di Giacomo: «perché in Project E ho dei .json
 * col nome di un'altra mappa?». La risposta stava sul disco, e trovarla ha
 * richiesto tre passate a mano. Questo script è quelle tre passate, scritte una
 * volta: si rilancia quando qualcosa non torna, invece di rifare l'indagine.
 *
 * SOLA LETTURA. Non tocca, non sposta, non cancella: dice e basta. Per i SET
 * l'app sa allineare la cartella da sé (nome dall'id, marchio della mappa,
 * dedup); per i MATERIALI no — PDF e HTML si accumulano apposta e non esiste
 * una lista di ciò che «dovrebbe» esserci, quindi a decidere è il docente.
 *
 * Usa le funzioni VERE di `mappai-files-core.js` (`materialeEstraneo`,
 * `setsDelVault`): una seconda copia della regola qui direbbe cose diverse
 * dall'app al primo ritocco.
 *
 *   node tools/diagnosi/vault-estranei.js [cartella Mappe]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const FC = require(path.join(__dirname, '..', '..', 'public', 'js', 'mappai-files-core.js'));

const BASE = process.argv[2] ||
    path.join(os.homedir(), 'Documents', FC.ROOT_FOLDER, FC.SUB.maps || 'Mappe');

function nfc(s) { try { return String(s == null ? '' : s).normalize('NFC').trim(); } catch (e) { return String(s || '').trim(); } }

/* Un vault è una cartella con `index.yaml`: è la stessa definizione che usa la
   scansione dell'app, non un'euristica sui nomi. */
function vaults(dir, out) {
    out = out || [];
    let voci; try { voci = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
    if (voci.some(v => v.isFile() && v.name === 'index.yaml')) out.push(dir);
    voci.filter(v => v.isDirectory()).forEach(v => vaults(path.join(dir, v.name), out));
    return out;
}

function etichetta(v) {
    try {
        for (const ln of fs.readFileSync(path.join(v, 'index.yaml'), 'utf8').split('\n')) {
            if (ln.startsWith('rootNodeLabel:')) return nfc(ln.slice(ln.indexOf(':') + 1));
        }
    } catch (e) { /* index illeggibile: si ripiega sul nome della cartella */ }
    return nfc(path.basename(v));
}

function nodi(v) {
    try { return fs.readdirSync(path.join(v, 'Nodi')).filter(f => f.endsWith('.md')).map(f => nfc(f.replace(/\.md$/, ''))); }
    catch (e) { return []; }
}

const trovati = vaults(BASE);
const lab = new Map(trovati.map(v => [v, etichetta(v)]));
const tutte = [...new Set([...lab.values()].filter(Boolean))];
const rel = v => v.replace(BASE + path.sep, '');

const setEstranei = [], setDoppi = [], nidi = [], matEstranei = [], nomiMuti = [];

for (const v of trovati) {
    const mia = lab.get(v);
    const ms = path.join(v, 'Materiale Studio');
    if (!fs.existsSync(ms)) continue;

    /* Un vault dentro «Materiale Studio»: non dovrebbe mai esistere. */
    ['index.yaml', 'links.json', 'Nodi', 'Materiale Studio'].forEach(x => {
        if (fs.existsSync(path.join(ms, x))) nidi.push([v, x]);
    });

    let file; try { file = fs.readdirSync(ms); } catch (e) { continue; }

    /* ── i SET ── */
    const letti = [];
    file.filter(f => f.endsWith('.json')).forEach(f => {
        try {
            const d = JSON.parse(fs.readFileSync(path.join(ms, f), 'utf8'));
            if (d && d.id) letti.push({ nome: f, set: d });
        } catch (e) { /* non è un set: non ci riguarda */ }
    });
    const tenuti = FC.setsDelVault(letti.map(x => x.set), mia);
    const tenutiId = new Set(tenuti.map(s => String(s.id)));
    letti.forEach(x => {
        const suo = nfc(x.set._mappa);
        if (suo && suo !== mia) setEstranei.push([v, x.nome, suo + ' (marchio)']);
        else if (!tenutiId.has(String(x.set.id))) setEstranei.push([v, x.nome, '?']);
    });
    const perId = {};
    letti.forEach(x => { (perId[x.set.id] = perId[x.set.id] || []).push(x.nome); });
    Object.keys(perId).forEach(id => { if (perId[id].length > 1) setDoppi.push([v, id, perId[id]]); });

    /* ── i MATERIALI ── */
    const nodiV = nodi(v);
    file.filter(f => /\.(pdf|html|mp3|wav)$/i.test(f)).forEach(f => {
        const estranea = FC.materialeEstraneo(f, mia, tutte, nodiV);
        if (estranea) matEstranei.push([v, f, estranea]);
        /* Un «Focus-…» porta per convenzione il nome di un NODO, non della
           mappa: segnalarlo come muto sarebbe rumore su un nome corretto. */
        else if (!/^Focus[-\s]/i.test(f) && !FC.nomeDiceLaMappa(f, mia)) nomiMuti.push([v, f]);
    });
}

function sezione(titolo, righe, disegna) {
    console.log('\n═══ ' + titolo + ' ═══');
    if (!righe.length) { console.log('  nessuno ✓'); return; }
    righe.forEach(disegna);
}

console.log(`vault esaminati: ${trovati.length}   (${BASE})`);
sezione('SET DI UN\'ALTRA MAPPA', setEstranei, ([v, f, l]) => console.log(`  ${rel(v)}\n      ${f}  → ${l}`));
sezione('SET DUPLICATI (stesso id, più file)', setDoppi, ([v, id, fs2]) => console.log(`  ${rel(v)}\n      ${id}: ${fs2.join(', ')}`));
sezione('VAULT ANNIDATI dentro «Materiale Studio»', nidi, ([v, x]) => console.log(`  ${rel(v)} → contiene «${x}»`));
sezione('MATERIALI DI UN\'ALTRA MAPPA', matEstranei, ([v, f, l]) => console.log(`  ${rel(v)}\n      ${f}  → è di «${l}»`));

/* Non è un difetto: è la convenzione vecchia, quando il nome non portava la
   mappa. Si segnala perché sono proprio questi i file che, spostati, non si
   riesce più ad attribuire — e perché rigenerandoli il nome diventa parlante. */
console.log(`\n═══ NOMI MUTI (non dicono a quale mappa appartengono) ═══`);
if (!nomiMuti.length) console.log('  nessuno ✓');
else {
    const perVault = {};
    nomiMuti.forEach(([v, f]) => { (perVault[rel(v)] = perVault[rel(v)] || []).push(f); });
    Object.keys(perVault).sort().forEach(k => console.log(`  ${k}\n      ${perVault[k].join('\n      ')}`));
}

const problemi = setEstranei.length + setDoppi.length + nidi.length + matEstranei.length;
console.log(`\n${problemi ? '⚠️  ' + problemi + ' cose da guardare' : 'TUTTO OK'}   ·   nomi muti: ${nomiMuti.length}`);
