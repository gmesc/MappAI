/* tools/demo-video/gira.js — GIRA le scene del demo sull'app VERA (23/8/26).
 *
 *   npx electron . --remote-debugging-port=9222          # l'app, coi dati veri
 *   node tools/demo-video/gira.js                        # tutte le scene
 *   node tools/demo-video/gira.js --solo 04              # una sola
 *   node tools/demo-video/gira.js --senza-chiave         # la generazione si taglia (nessuna chiamata AI)
 *   node tools/demo-video/gira.js --elenco
 *
 * Che cosa scrive sul disco di Giacomo: SOLO il vault «Elettricità - demo» della scena 3, e
 * solo se la chiave Gemini c'è. Niente altro viene salvato, sovrascritto o cancellato.
 */
'use strict';
process.env.MAPPAI_PORTA = process.env.APP_PORTA || '9222';
const path = require('path');
const FUORI = process.env.DEMO_DIR || path.join(process.env.HOME, 'Claude', 'MappAI - demo');
process.env.IMG_DIR = path.join(FUORI, 'scatti');
const fs = require('fs');
const { spawnSync } = require('child_process');
const lab = require('../guida-docenti/lab.js');
const video = require('./lab-video.js');
const M = require('./montaggio-core.js');
const { SCENE, SFOGLIO, PAROLE_AL_SECONDO } = require('./copione.js');

const argv = process.argv.slice(2);
const opz = {
    solo: (argv.indexOf('--solo') >= 0 ? argv[argv.indexOf('--solo') + 1] : ''),
    senzaChiave: argv.includes('--senza-chiave'),
    elenco: argv.includes('--elenco'),
};
const GIRO = path.join(FUORI, 'giro.json');

function leggiGiro() { try { return JSON.parse(fs.readFileSync(GIRO, 'utf8')); } catch (e) { return { clip: {} }; } }
function scriviGiro(g) { fs.mkdirSync(FUORI, { recursive: true }); fs.writeFileSync(GIRO, JSON.stringify(g, null, 1)); }

(async () => {
    const difetti = M.valida(SCENE, SFOGLIO);
    if (difetti.length) { console.error('copione con difetti:\n  · ' + difetti.join('\n  · ')); process.exit(2); }

    if (opz.elenco) {
        let t = 0;
        SCENE.forEach((s) => {
            M.clipDi(s).forEach((c) => { console.log(`${String(t).padStart(3)}s  ${c.id.padEnd(16)} ${c.tipo.padEnd(8)} ${c.secondi}s`); t += c.secondi; });
        });
        return;
    }

    /* i cartelli e le slide non hanno bisogno dell'app: si fanno sempre, sono secondi */
    if (!opz.solo || /01|06|09/.test(opz.solo)) {
        console.log('▶ cartelli e slide');
        const r = spawnSync('node', [path.join(__dirname, 'carte.js')], { stdio: 'inherit' });
        if (r.status !== 0) throw new Error('carte.js ha fallito');
    }

    /* il filtro vale anche per le PARTI (04a, 04b): una scena entra se lei o una sua
       parte comincia così, e più sotto si girano solo le clip che combaciano */
    const combacia = (id) => !opz.solo || id.startsWith(opz.solo);
    const scene = SCENE.filter((s) => combacia(s.id) || M.clipDi(s).some((c) => combacia(c.id)));
    const appScene = scene.filter((s) => s.tipo === 'app' && s.id !== '08-sintesi');
    const giro = leggiGiro();
    giro.quando = new Date().toISOString();
    giro.senzaChiave = opz.senzaChiave;

    if (appScene.length) {
        await lab.collega();
        /* ── il carattere del video: TM SANS (scelta di Giacomo, 23/8) ────────────
           L'app di Giacomo può stare su un altro carattere: si legge quello che c'è,
           si imposta `testme-sans` (la chiave vera di `mappai_font_app`, catalogo in
           mappai-font-core.js) e ALLA FINE si rimette il valore di prima — il video
           non deve cambiare una preferenza dell'app vera. Il cambio è vivo subito
           (setFont riscrive le variabili), niente ricarica. */
        const fontPrima = await lab.val('localStorage.getItem("mappai_font_app")');
        await lab.val('(window.MappAIFont && window.MappAIFont.setFont) ? (window.MappAIFont.setFont("testme-sans"), 1) : (localStorage.setItem("mappai_font_app","testme-sans"), location.reload(), 0)');
        await lab.pausa(1500);
        /* 2K: la finestra dell'app è già Retina; si emula 1280×720 @2 e si MISURA che cosa
           esce davvero — i fotogrammi sono grandi quanto la superficie, non quanto il fattore
           di scala (misurato il 23/8 su Chrome headless: window-size piccola = video piccolo). */
        await lab.metrica(1280, 720, 2);
        await lab.pausa(1200);
        const chiave = await lab.val('!!localStorage.getItem("gemini_api_key")');
        const senzaChiave = opz.senzaChiave || !chiave;
        if (!chiave) console.log('  ⚠️ nessuna chiave Gemini nell\'app: la scena 3 si ferma prima di generare');
        const gesti = require('./scene.js')({ senzaChiave });

        for (const s of scene.filter((x) => x.tipo === 'app' && x.id !== '08-sintesi')) {
            for (const c of M.clipDi(s)) {
                if (!combacia(s.id) && !combacia(c.id)) continue;
                if (c.tipo !== 'app') continue;        /* le parti «studio» nascono dai PDF, in monta.js */
                console.log('▶ ' + c.id);
                /* la PREPARAZIONE sta fuori dalla registrazione: aprire una mappa dura dieci
                   secondi che nel video non ci vanno */
                if (c.gesto === 'scenaProgetto') await gesti.preparaProgetto();
                if (c.gesto === 'scenaMappa') await gesti.apriMappa(require('./copione.js').MAPPA.titolo);
                if (c.gesto === 'scenaClasse' || c.gesto === 'scenaCorreggere' || c.gesto === 'scenaProietta') await gesti.landing();
                await gesti.nascondiDev();
                const esito = await video.registra(c.id, () => gesti[c.gesto]());
                giro.clip[c.id] = { grezzi: esito.grezzi, fotogrammi: esito.fotogrammi, secondi: c.secondi, tipo: 'app' };
                scriviGiro(giro);
            }
        }
        /* il carattere torna quello di prima del giro */
        if (fontPrima) await lab.val(`window.MappAIFont && window.MappAIFont.setFont && window.MappAIFont.setFont(${JSON.stringify(fontPrima)}); 1`);
        else await lab.val('localStorage.removeItem("mappai_font_app"); window.MappAIFont && window.MappAIFont.setFont && window.MappAIFont.setFont("space-mono"); 1');
        lab.chiudi();
    }

    /* la sintesi gira in un processo suo: headless ha la sua porta CDP */
    if (!opz.solo || opz.solo.startsWith('08')) {
        console.log('▶ 08-sintesi (Chrome headless, sul file vero del vault)');
        const r = spawnSync('node', [path.join(__dirname, 'sintesi.js')], { stdio: 'inherit' });
        if (r.status !== 0) throw new Error('sintesi.js ha fallito');
        const f = JSON.parse(fs.readFileSync(path.join(video.GREZZI, '08-sintesi', 'frames.json'), 'utf8'));
        giro.clip['08-sintesi'] = { grezzi: f.grezzi, fotogrammi: f.fotogrammi, secondi: 30, tipo: 'app' };
        scriviGiro(giro);
    }

    /* il copione da leggere: si rigenera a ogni giro, così i tempi non divergono mai */
    fs.writeFileSync(path.join(FUORI, 'copione-da-leggere.md'),
        M.copioneMd(SCENE, PAROLE_AL_SECONDO, { file: 'demo-mappai-4min.mp4' }));
    console.log('\n— giro scritto in ' + path.relative(process.env.HOME, GIRO));
    console.log('— ora: node tools/demo-video/monta.js');
})().catch((e) => { console.error('KO', e.message); process.exit(1); });
