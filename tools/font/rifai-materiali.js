#!/usr/bin/env node
/*
 * rifai-materiali.js — riscrive i materiali di un vault in un altro carattere
 * ---------------------------------------------------------------------------
 *   npx electron tools/font/rifai-materiali.js "<vault>" [carattere] [--scrivi]
 *
 *   # prova a vuoto (default: non tocca niente, dice cosa farebbe)
 *   npx electron tools/font/rifai-materiali.js "4R/Scienze/Elettricità - MM" testme-sans
 *   # e poi davvero
 *   npx electron tools/font/rifai-materiali.js "4R/Scienze/Elettricità - MM" testme-sans --scrivi
 *
 * ── CHE COSA RIFÀ, E CHE COSA NO ────────────────────────────────────────────
 * Un PDF non si ritinge: per cambiargli carattere va RICOSTRUITO dalla sua
 * sorgente. Quindi la domanda non è «quali file», è «di quali file la sorgente
 * è ancora su disco». Misurato sui due vault di Giacomo (51 materiali):
 *
 *   ✓ Quiz MC e V/F      la sorgente è il `set-*.json` accanto al PDF
 *   ✓ Sintesi .html      il file È la sua sorgente: si riscrive il carattere
 *                        e basta, senza ricostruire niente
 *   ✗ Domande aperte     la sorgente è la voce d'archivio in localStorage, che
 *                        su disco non c'è: da qui non si possono rifare
 *   ✗ Flashcard,
 *     Foglio dei nodi    li disegna jsPDF con una configurazione (formato,
 *                        quali card, quale profondità) che vive nel progetto,
 *                        non nel nome del file: ricostruirla sarebbe indovinare
 *   ✗ MM / KG / Studio   sono ISTANTANEE del disegno com'era inquadrato in quel
 *                        momento (zoom, layout, posizioni del force). Rifarle
 *                        non darebbe lo stesso foglio in un altro carattere:
 *                        darebbe un altro disegno. Per questi la strada è
 *                        riesportarli dalla mappa quando serve.
 *
 * ── COME LAVORA ─────────────────────────────────────────────────────────────
 * Apre l'app in una finestra nascosta e le fa costruire i documenti con le SUE
 * funzioni (`buildQuizSetHtml`, il costruttore della sintesi): nessuna copia
 * della logica qui dentro, o divergerebbe al primo ritocco. Il PDF esce dalla
 * stessa strada dell'app — finestra `data:` + `printToPDF`.
 *
 * ⚠️ Il file vecchio va nel CESTINO, non sovrascritto: un materiale di classe
 * si deve poter recuperare (è la stessa regola di `delete-vault-file`). E il
 * nuovo prende il nome con il carattere in coda — quello che ora `buildFileName`
 * dà a tutti i materiali generati — quindi il vecchio non resta lì accanto a
 * fare doppione.
 */
'use strict';
const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const RADICE = path.resolve(__dirname, '..', '..');
const MAPPE = path.join(require('os').homedir(), 'Documents', 'MappAI - file', 'Mappe');

const argv = process.argv.slice(2).filter(a => !a.startsWith('--type='));
const VAULT = argv[0];
const FONT = argv[1] || 'testme-sans';
const SCRIVI = process.argv.includes('--scrivi');

if (!VAULT) {
    console.error('uso: npx electron tools/font/rifai-materiali.js "<classe/materia/mappa>" [carattere] [--scrivi]');
    process.exit(1);
}

const DIR = path.join(MAPPE, VAULT, 'Materiale Studio');
if (!fs.existsSync(DIR)) { console.error('non trovo: ' + DIR); process.exit(1); }

const esiti = { rifatti: [], cestinati: [], saltati: [], errori: [] };

function _kindDelSet(s) {
    if (String(s.mode) === 'flashcard') return null;                 // jsPDF: fuori portata
    if (/vero/i.test(String(s.type))) return 'quiz_tf';
    if (/scelta|multipla/i.test(String(s.type))) return 'quiz_mc';
    return null;
}

/* Il dettaglio nel nome: l'angolo, e `auto` si scrive «misto» — è la
   convenzione che i file già sul disco usano (`…-misto.pdf`). */
function _dettaglio(s) {
    const a = String(s.angle || '').trim();
    if (!a || a === 'auto') return 'misto';
    return a;
}

/*
 * QUALE FILE HA PRODOTTO QUESTO SET — e perché non basta ricalcolare il nome.
 *
 * ⚠️ Trovato dalla prova a vuoto, prima che facesse danni: in questo vault DUE
 * set diversi (uno di luglio con 30 domande, uno del 17/8 con 25) hanno
 * entrambi `angle: auto`, quindi il nome ricalcolato è lo stesso — e il secondo
 * avrebbe cancellato il primo. Sono due materiali diversi, non due versioni:
 * il primo è stato scritto quando la convenzione non metteva il dettaglio nel
 * nome (`Quiz-MC-Elettricità.pdf`), il secondo con quella di adesso (`-misto`).
 *
 * Il legame che li distingue c'è, ed è esatto: il set porta la sua `date` e il
 * PDF la sua data di scrittura. Combaciano al SECONDO — misurato su nove file
 * su dieci. Si confrontano solo minuti e secondi perché il set è in UTC e il
 * file in ora locale, e lo scarto fra i due è sempre di ore intere.
 *
 * Trovato il file di partenza, il nome nuovo è il SUO col carattere in coda:
 * un materiale conserva il nome con cui è nato, invece di essere ribattezzato
 * da una convenzione arrivata dopo.
 */
/*
 * QUALE SET HA PRODOTTO QUESTO FILE.
 *
 * Il legame è esatto e sta nelle date: il set porta la sua `date`, il PDF la
 * sua data di scrittura, e combaciano al SECONDO (misurato su nove file su
 * dieci). Si confrontano solo minuti e secondi perché il set è in UTC e il file
 * in ora locale, e lo scarto fra i due è sempre di ore intere.
 *
 * ⚠️ Serve perché il nome NON basta a risalire al set: in questi vault due set
 * diversi hanno entrambi `angle: auto`, quindi ricalcolando il nome finiscono
 * sullo stesso file — ed è così che, alla prima stesura, un materiale di
 * luglio ha preso il posto di uno di agosto.
 */
function _setDelFile(pdf, sets) {
    const m = new Date(fs.statSync(path.join(DIR, pdf)).mtime);
    const chiave = m.getMinutes() * 60 + m.getSeconds();
    for (const s of sets) {
        const d = new Date(s.dati.date || 0);
        if (!s.dati.date || isNaN(d.getTime())) continue;
        if (d.getUTCMinutes() * 60 + d.getUTCSeconds() === chiave &&
            Math.abs(m - d) < 1000 * 60 * 60 * 36) return s;
        }
    return null;
}

/** Il nome col carattere in coda, prima dell'estensione. */
function _colCarattere(nome, etichetta) {
    return nome.replace(/(\.[A-Za-z0-9]+)$/, ' - ' + etichetta + '$1');
}

app.on('ready', async () => {
    console.log('\n══ ' + VAULT);
    console.log('   cartella: ' + DIR);
    console.log('   carattere: ' + FONT + (SCRIVI ? '   ·   SCRIVE SUL DISCO' : '   ·   prova a vuoto'));

    const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false } });
    await w.loadFile(path.join(RADICE, 'public', 'index.html'));
    await new Promise(r => setTimeout(r, 2500));

    const pronto = await w.webContents.executeJavaScript(`
        (async () => {
            if (!window.MappAIFont || !window.MappAIFontCore) return { ok: false, perche: 'moduli dei caratteri assenti' };
            if (!window.MappAIFontCore.valido(${JSON.stringify(FONT)})) {
                return { ok: false, perche: 'carattere ignoto: ' + ${JSON.stringify(FONT)} +
                    ' (i validi: ' + window.MappAIFontCore.elenco().map(f => f.id).join(', ') + ')' };
            }
            window.MappAIFont.imposta(${JSON.stringify(FONT)});
            await window.MappAIFont.precaricaIncorporabile();
            return { ok: true, etichetta: window.MappAIFontCore.font(${JSON.stringify(FONT)}).etichetta };
        })()`);
    if (!pronto.ok) { console.error('✗ ' + pronto.perche); app.quit(); return; }
    console.log('   → ' + pronto.etichetta + '\n');

    /* ── 1. I QUIZ ───────────────────────────────────────────────────────────
       ⚠️ Si parte dai FILE CHE ESISTONO, non dai set — e la prima stesura
       faceva il contrario, con un danno vero: in «Project E» un set di luglio
       il cui PDF era già stato cancellato si è preso il nome `-misto`, che
       appartiene al materiale di agosto, e quello vero è finito nel Cestino.
       Partendo dai set si RIGENERA anche ciò che il docente aveva tolto, e due
       set che calcolano lo stesso nome si contendono lo stesso file.
       Partendo dai file, ogni materiale che c'è ritrova la sua sorgente (dalla
       data, che combacia al secondo) e nessuno ne inventa di nuovi: «risalvare»
       vuol dire riscrivere quello che c'è, non generare quello che manca. */
    const pdfQuiz = fs.readdirSync(DIR)
        .filter(n => /^Quiz-(MC|VF)-/.test(n) && n.endsWith('.pdf') && !/ - [^-.]+\.pdf$/.test(n))
        .sort();
    const setDisponibili = fs.readdirSync(DIR).filter(n => n.startsWith('set-') && n.endsWith('.json'))
        .map(n => { try { return { file: n, dati: JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8')) }; }
                    catch (e) { return null; } })
        .filter(Boolean);

    for (const pdf of pdfQuiz) {
        const s = _setDelFile(pdf, setDisponibili);
        if (!s) { esiti.saltati.push(pdf + ': non trovo il set che l\'ha prodotto (la data non combacia con nessuno)'); continue; }
        const kind = _kindDelSet(s.dati);
        if (!kind) { esiti.saltati.push(pdf + ': ' + (s.dati.type || s.dati.mode) + ' — lo disegna jsPDF'); continue; }
        if (!(s.dati.items || []).length) { esiti.saltati.push(pdf + ': il suo set è senza domande'); continue; }

        const r = await w.webContents.executeJavaScript(`
            (function () {
                const set = ${JSON.stringify(s.dati)};
                return { html: window.buildQuizSetHtml(set, { includeAnswers: true, includeBar: false,
                    mapName: ${JSON.stringify(s.dati._mappa || '')} }) };
            })()`).catch(e => ({ errore: String(e).slice(0, 120) }));
        if (r.errore) { esiti.errori.push(pdf + ': ' + r.errore); continue; }

        /* Il nome è il SUO, col carattere in coda: un materiale conserva il nome
           con cui è nato invece di essere ribattezzato da una convenzione
           arrivata dopo. */
        await rifaiPdf(_colCarattere(pdf, pronto.etichetta), r.html, s.file, path.join(DIR, pdf));
    }

    // ── 2. le sintesi: il file È la sorgente, si riscrive il carattere ──────
    for (const f of fs.readdirSync(DIR).filter(n => /^Sintesi.*\.html$/i.test(n)).sort()) {
        const vecchio = path.join(DIR, f);
        const html = fs.readFileSync(vecchio, 'utf8');
        const r = await w.webContents.executeJavaScript(`
            (function () {
                const F = window.MappAIFont.cssDocumento('');
                return { blocco: window.MappAIFont.styleDocumento(''), stack: F.stack,
                         nome: window.MappAIPipelineCore.buildFileName('synthesis', null, false,
                             { mappa: ${JSON.stringify(f.replace(/^Sintesi-/, '').replace(/\.html$/i, ''))} }) };
            })()`);
        /* Si sostituisce il BLOCCO del carattere, non tutto il foglio: il resto
           del documento — testo, citazioni, audio incorporato — non si tocca. */
        let nuovo = html;
        const gia = /@font-face\{font-family:[^]*?:root\{--doc-font:[^}]*\}/;
        if (gia.test(nuovo)) nuovo = nuovo.replace(gia, r.blocco.trim());
        else nuovo = nuovo.replace(/<style>/i, '<style>\n' + r.blocco);
        /* I documenti scritti prima del 18/8 hanno il nome del carattere a
           chiare lettere: la variabile da sola non li raggiunge. */
        nuovo = nuovo.replace(/font-family:\s*'Space Mono',\s*monospace/g,
            "font-family:var(--doc-font, 'Space Mono', monospace)");
        if (nuovo === html) { esiti.saltati.push(f + ': già com\'era richiesto'); continue; }
        scrivi(path.join(DIR, r.nome), Buffer.from(nuovo, 'utf8'), f, vecchio);
    }

    stampaEsito();
    app.quit();

    // ── utilità ─────────────────────────────────────────────────────────────
    async function rifaiPdf(nome, html, daChi, vecchioFile) {
        const p = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
        try {
            await p.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
            await p.webContents.executeJavaScript(
                'Promise.race([document.fonts.ready, new Promise(r=>setTimeout(r,4000))]).then(()=>1)');
            const pdf = await p.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
            scrivi(path.join(DIR, nome), pdf, daChi, vecchioFile);
        } catch (e) {
            esiti.errori.push(daChi + ': ' + String(e).slice(0, 120));
        } finally { p.destroy(); }
    }

    function scrivi(dest, byte, daChi, vecchio) {
        const nome = path.basename(dest);
        if (!SCRIVI) {
            esiti.rifatti.push(nome + '   ← ' + daChi + (vecchio ? '   (nel Cestino: ' + path.basename(vecchio) + ')' : ''));
            return;
        }
        try {
            fs.writeFileSync(dest, byte);
            esiti.rifatti.push(nome + '   ← ' + daChi);
            if (vecchio && vecchio !== dest) {
                shell.trashItem(vecchio);
                esiti.cestinati.push(path.basename(vecchio));
            }
        } catch (e) { esiti.errori.push(nome + ': ' + String(e).slice(0, 120)); }
    }
});

function stampaEsito() {
    const b = (t, v) => { if (!v.length) return; console.log('\n' + t + ' (' + v.length + ')'); v.forEach(x => console.log('   ' + x)); };
    b(SCRIVI ? '✓ RIFATTI' : '✓ DA RIFARE', esiti.rifatti);
    b('🗑 NEL CESTINO', esiti.cestinati);
    b('— SALTATI', esiti.saltati);
    b('✗ ERRORI', esiti.errori);
    if (!SCRIVI) console.log('\n   (prova a vuoto: non ho toccato niente. Aggiungi --scrivi per farlo davvero.)');
    console.log('');
}
