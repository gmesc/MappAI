/* tools/demo-video/sintesi.js — la SINTESI CON VOCE per i DSA, filmata (23/8/26).
 *
 * È il materiale VERO del vault: `Sintesi-Elettricità - TestMe Sans.html`, 8,3 MB con dentro
 * l'audio (`data:audio/mpeg`) e i 22 `cues` del karaoke. Nessuna chiamata all'AI, nessun costo:
 * la voce è già stata registrata il 17/8.
 *
 * Si filma in Chrome HEADLESS e non dentro l'app, per tre ragioni: è il file che l'allievo
 * apre da solo (è la scena che raccontiamo), un iframe non si pilota dal documento che lo
 * ospita, e headless non si ferma se una finestra lo copre (trappola 1-2).
 *
 *   node tools/demo-video/sintesi.js [secondi]
 */
'use strict';
process.env.MAPPAI_PORTA = process.env.SINTESI_PORTA || '9466';
const path = require('path');
process.env.IMG_DIR = path.join(process.env.DEMO_DIR || path.join(process.env.HOME, 'Claude', 'MappAI - demo'), 'carte');
const fs = require('fs');
const { spawn } = require('child_process');
const lab = require('../guida-docenti/lab.js');
const video = require('./lab-video.js');
const { MAPPA, CLASSE, SCENE } = require('./copione.js');

const CASA = path.join(process.env.HOME, 'Documents', 'MappAI - file');
const STUDIO = path.join(CASA, 'Mappe', CLASSE, MAPPA.materia, MAPPA.vault, 'Materiale Studio');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILO = path.join(process.env.DEMO_DIR || path.join(process.env.HOME, 'Claude', 'MappAI - demo'), 'lab', 'chrome-sintesi');
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

function fileSintesi() {
    const f = fs.readdirSync(STUDIO).filter((n) => /^Sintesi-.*\.html$/i.test(n));
    if (!f.length) throw new Error('nessuna sintesi in ' + STUDIO);
    /* la più pesante è quella con l'audio dentro */
    return f.map((n) => ({ n, s: fs.statSync(path.join(STUDIO, n)).size })).sort((a, b) => b.s - a.s)[0].n;
}

async function chromePronto() {
    for (let i = 0; i < 60; i++) {
        try { const r = await fetch('http://127.0.0.1:' + process.env.MAPPAI_PORTA + '/json/list'); if (r.ok) return true; } catch (e) { /* non ancora */ }
        await pausa(250);
    }
    return false;
}

async function gira(secondi) {
    const nome = fileSintesi();
    const url = 'file://' + encodeURI(path.join(STUDIO, nome));
    fs.rmSync(PROFILO, { recursive: true, force: true });
    const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + process.env.MAPPAI_PORTA,
        '--user-data-dir=' + PROFILO, '--no-first-run', '--no-default-browser-check',
        '--autoplay-policy=no-user-gesture-required', '--mute-audio',
        /* ⚠️ i fotogrammi escono grandi quanto la FINESTRA, non quanto il deviceScaleFactor:
           con --window-size=1280,720 il video usciva a 1280×720. Misurato: finestra 2560×1440
           + --force-device-scale-factor=2 + emulazione 1280×720 @2 → JPEG 2560×1440 (2K). */
        '--allow-file-access-from-files', '--window-size=2560,1440', '--force-device-scale-factor=2',
        '--hide-scrollbars', 'about:blank'],
        { detached: true, stdio: 'ignore' });
    ch.unref();
    if (!(await chromePronto())) throw new Error('Chrome headless non risponde su :' + process.env.MAPPAI_PORTA);
    await lab.collega(/.*/);
    await lab.invia('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
    await lab.invia('Page.navigate', { url });
    /* 8 MB di base64 da decodificare: si aspetta l'audio, non un cronometro */
    await lab.finoA('!!document.querySelector("#ap-audio") && document.readyState==="complete"', 60000);
    await lab.pausa(2500);
    const dur = await lab.val('(()=>{const a=document.querySelector("#ap-audio"); return a? (a.duration||0) : 0})()');
    console.log('  · ' + nome + ' — audio di ' + Math.round(dur) + ' s');

    const durata = secondi || (SCENE.find((s) => s.id === '08-sintesi') || {}).secondi || 30;
    const esito = await video.registra('08-sintesi', async () => {
        /* si parte da un punto in cui il testo è già cominciato: la prima riga è il titolo,
           e il karaoke sul titolo non si vede muovere */
        await lab.val('(()=>{const a=document.querySelector("#ap-audio"); if(a) a.currentTime=6; return 1})()');
        await lab.pausa(300);
        await lab.val('(()=>{const b=document.querySelector(".ap-play"); if(b) b.click(); return 1})()');
        await lab.pausa(1200);
        /* ⚠️ In headless l'audio può non avanzare da solo: se il tempo non si muove, lo si
           muove a mano (un `currentTime` che cambia scatena `timeupdate`, e il karaoke segue).
           Il video mostra l'evidenziazione VERA, non un'animazione finta. */
        const t1 = await lab.val('(()=>{const a=document.querySelector("#ap-audio"); return a?a.currentTime:0})()');
        await lab.pausa(1500);
        const t2 = await lab.val('(()=>{const a=document.querySelector("#ap-audio"); return a?a.currentTime:0})()');
        const avanza = (t2 - t1) > 0.3;
        console.log('  · l\'audio ' + (avanza ? 'avanza da solo' : 'NON avanza in headless: lo spingo io'));
        if (!avanza) {
            await lab.val(`(()=>{const a=document.querySelector('#ap-audio'); window.__spinta=setInterval(function(){ a.currentTime += 0.12; }, 120); return 1})()`);
        }
        await lab.pausa(Math.max(0, durata * 1000 - 4000));
        await lab.val('(()=>{ if(window.__spinta) clearInterval(window.__spinta); return 1})()');
    });
    lab.chiudi();
    try { process.kill(ch.pid); } catch (e) { /* già morto */ }
    return esito;
}

if (require.main === module) {
    gira(Number(process.argv[2]) || 0).then(() => process.exit(0)).catch((e) => { console.error('KO', e.message); process.exit(1); });
}
module.exports = { gira, fileSintesi, STUDIO };
