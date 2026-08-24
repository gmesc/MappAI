/* tools/demo-video/lab-video.js — la CATTURA del video, sopra il lab della guida (23/8/26).
 *
 * `Page.startScreencast` è l'unico modo di filmare l'app da qui: `captureScreenshot` dà un
 * fermo, e una registrazione dello schermo prenderebbe anche la scrivania. In più costringe il
 * renderer a produrre fotogrammi — è la contromisura della trappola 1 della GUIDA-ARCHITETTO.
 *
 * ⚠️ I fotogrammi arrivano SOLO quando la pagina ridisegna: nei momenti fermi non ne arriva
 * nessuno, e va bene — il montaggio tiene l'ultimo fermo per il tempo che manca (le durate
 * stanno in `frames.json`, prese dai timestamp veri).
 * ⚠️ Ogni fotogramma va confermato con `Page.screencastFrameAck`, o dopo pochi frame il flusso
 * si ferma e la scena esce di due secondi.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const lab = require('../guida-docenti/lab.js');

const FUORI = process.env.DEMO_DIR || path.join(process.env.HOME, 'Claude', 'MappAI - demo');
const GREZZI = path.join(FUORI, 'grezzi');

/** registra ciò che succede dentro `fn` in una cartella di fotogrammi */
async function registra(nome, fn, opz) {
    const o = Object.assign({ qualita: 90, maxL: 2560, maxA: 1440 }, opz || {});
    const dir = path.join(GREZZI, nome);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    const meta = [];
    const stacca = lab.suEvento('Page.screencastFrame', (p) => {
        try {
            fs.writeFileSync(path.join(dir, String(n).padStart(5, '0') + '.jpg'), Buffer.from(p.data, 'base64'));
            meta.push({ f: n, t: p.metadata.timestamp });
            n++;
        } catch (e) { /* un fotogramma perso non ferma la scena */ }
        lab.invia('Page.screencastFrameAck', { sessionId: p.sessionId });
    });
    const t0 = Date.now();
    await lab.invia('Page.startScreencast', { format: 'jpeg', quality: o.qualita, maxWidth: o.maxL, maxHeight: o.maxA, everyNthFrame: 1 });
    let errore = null;
    try { await fn(); } catch (e) { errore = e; }
    await lab.invia('Page.stopScreencast');
    stacca();
    const grezzi = (Date.now() - t0) / 1000;
    fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ nome, grezzi, fotogrammi: n, meta }, null, 1));
    console.log(`  🎬 ${nome}: ${n} fotogrammi in ${grezzi.toFixed(1)} s` + (errore ? ' — ⚠️ ' + errore.message : ''));
    if (errore) throw errore;
    return { dir, grezzi, fotogrammi: n };
}

/** un movimento del mouse lento fra due punti: senza, il puntatore salta e il video sembra
 *  una sequenza di scatti invece di una registrazione */
async function muoviPiano(da, a, ms) {
    const passi = Math.max(6, Math.round((ms || 500) / 30));
    for (let i = 1; i <= passi; i++) {
        const k = i / passi;
        /* ease-in-out: parte e arriva piano, come una mano */
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        await lab.muovi(Math.round(da.x + (a.x - da.x) * e), Math.round(da.y + (a.y - da.y) * e));
        await lab.pausa(30);
    }
}

/** porta il mouse al centro di un elemento, con calma, e ci clicca */
async function cliccaPiano(sel, opz) {
    const r = await lab.rect(sel);
    const a = { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
    const da = (opz && opz.da) || { x: a.x - 220, y: a.y + 140 };
    await muoviPiano(da, a, (opz && opz.ms) || 520);
    await lab.pausa(180);
    await lab.clicca(a);
    return a;
}

module.exports = { registra, muoviPiano, cliccaPiano, GREZZI, FUORI };
