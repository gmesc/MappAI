/* tools/demo-video/carte.js — i CARTELLI e le SLIDE del demo, resi in PNG (23/8/26).
 *
 * Un cartello è una pagina HTML nei token della veste manifesto (verde #41e6aa con testo
 * SCURO — bianco su quel verde fa 1,6:1, inv. 16 —, nero #404040, card #f1f4f8) resa da un
 * Chrome HEADLESS con la sua porta CDP. Headless perché una finestra coperta non produce
 * fotogrammi (trappola 1-2): è la stessa ragione per cui il telefono della guida è headless.
 *
 * Caratteri: i .ttf VERI dell'app (public/fonts), non un font di sistema che somiglia — il
 * video e l'app devono sembrare la stessa cosa.
 *
 *   node tools/demo-video/carte.js            # rifà tutti i cartelli e le slide
 */
'use strict';
process.env.MAPPAI_PORTA = process.env.CARTE_PORTA || '9455';
/* ⚠️ `IMG_DIR` va scritto PRIMA di require('lab.js'): lab legge la cartella una volta sola, al
   caricamento. Scrivendolo dopo, i PNG del demo finivano fra le 95 foto della guida docenti. */
process.env.IMG_DIR = process.env.DEMO_CARTE
    || require('path').join(process.env.DEMO_DIR || require('path').join(process.env.HOME, 'Claude', 'MappAI - demo'), 'carte');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');
const lab = require('../guida-docenti/lab.js');
const { SCENE, ANGOLI, MAPPA } = require('./copione.js');
const D = require('./domande-core.js');

const REPO = path.join(__dirname, '..', '..');
const FONTS = path.join(REPO, 'public', 'fonts');
const CASA = path.join(process.env.HOME, 'Documents', 'MappAI - file');
const STUDIO = path.join(CASA, 'Mappe', '4R', MAPPA.materia, MAPPA.vault, 'Materiale Studio');
const FUORI = process.env.DEMO_DIR || path.join(process.env.HOME, 'Claude', 'MappAI - demo');
const CARTE = path.join(FUORI, 'carte');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILO = path.join(FUORI, 'lab', 'chrome-carte');
const L = 2560, A = 1440;                       /* 2K, come chiesto: 1280×720 @2× */

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/* i dati della formazione: li riempie Giacomo, il video si rifà in un comando */
function formazione() {
    const f = path.join(__dirname, 'formazione.json');
    return JSON.parse(fs.readFileSync(f, 'utf8'));
}

/* ── il foglio di stile, uno solo per cartelli e slide ───────────────────── */
function stile() {
    const url = (n) => 'file://' + path.join(FONTS, n);
    return `
@font-face{font-family:'Atkinson';src:url('${url('Atkinson-Regular.ttf')}') format('truetype');font-weight:400}
@font-face{font-family:'Atkinson';src:url('${url('Atkinson-Bold.ttf')}') format('truetype');font-weight:700}
@font-face{font-family:'TestMe';src:url('${url('TestMeSans-Regular.ttf')}') format('truetype');font-weight:400}
@font-face{font-family:'TestMe';src:url('${url('TestMeSans-Bold.ttf')}') format('truetype');font-weight:700}
@font-face{font-family:'Space Mono';src:url('${url('SpaceMono-Regular.ttf')}') format('truetype');font-weight:400}
@font-face{font-family:'Space Mono';src:url('${url('SpaceMono-Bold.ttf')}') format('truetype');font-weight:700}
:root{--verde:#41e6aa;--viola:#8100f4;--nero:#404040;--card:#f1f4f8;--linea:#d9dee5;--muto:#5b6069}
*{box-sizing:border-box;margin:0}
html,body{width:1280px;height:720px;overflow:hidden}
body{background:#fff;color:var(--nero);font-family:'Atkinson',sans-serif;display:flex;flex-direction:column;
     justify-content:center;padding:0 92px;gap:22px}
.occhiello{font-family:'Space Mono',monospace;font-size:17px;font-weight:700;letter-spacing:.2em;
     text-transform:uppercase;color:var(--muto)}
h1{font-size:64px;line-height:1.08;letter-spacing:-.02em;white-space:pre-line;font-weight:700}
h1 em{font-style:normal;background:linear-gradient(transparent 58%, var(--verde) 58%)}
.sotto{font-size:26px;line-height:1.45;color:var(--muto);max-width:60ch;white-space:pre-line}
.riga{height:8px;width:120px;background:var(--verde);border-radius:99px}
/* il cartello della formazione */
.griglia{display:flex;gap:18px;flex-wrap:wrap;margin-top:6px}
.pt{background:var(--card);border-radius:16px;padding:16px 22px;font-size:22px;font-weight:700}
.piede{font-family:'Space Mono',monospace;font-size:20px;color:var(--nero);margin-top:10px}
.piede b{color:var(--viola)}
/* le slide degli angoli */
/* ⚠️ Sette righe devono stare in 720px: misurato, con la carta a 20/26 e il testo a 25px le
   ultime due uscivano dal fondo. I numeri qui sotto sono quelli che entrano. */
body.slide{justify-content:flex-start;padding:40px 76px;gap:10px}
.slide h2{font-size:33px;line-height:1.1;font-weight:700}
.slide .area{font-family:'Space Mono',monospace;font-size:16px;letter-spacing:.12em;text-transform:uppercase;color:var(--viola);font-weight:700}
.carta{background:var(--card);border-radius:14px;padding:11px 18px;display:flex;gap:18px;align-items:center}
.carta .ang{font-family:'Space Mono',monospace;font-size:15px;font-weight:700;text-transform:uppercase;
     letter-spacing:.08em;color:var(--nero);background:var(--verde);border-radius:99px;padding:6px 14px;flex:0 0 auto;min-width:184px;text-align:center}
.carta .q{font-size:20px;line-height:1.32}
.pila{display:flex;flex-direction:column;gap:9px;margin-top:4px}
.spento{opacity:.16}
`;
}

function pagina(corpo, classe) {
    return `<!doctype html><meta charset="utf-8"><style>${stile()}</style><body class="${classe || ''}">${corpo}</body>`;
}

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

/* ── i cartelli del copione ─────────────────────────────────────────────── */
function cartaScena(scena) {
    const c = scena.carta || {};
    if (c.daFormazione) {
        const f = formazione();
        return pagina(`
      <div class="occhiello">${esc(f.occhiello)}</div>
      <h1>${esc(f.titolo).replace(/\*(.+?)\*/g, '<em>$1</em>')}</h1>
      <div class="sotto">${esc(f.sotto)}</div>
      <div class="griglia">${(f.punti || []).map((p) => `<div class="pt">${esc(p)}</div>`).join('')}</div>
      <div class="piede">${esc(f.quando)} · ${esc(f.dove)} · <b>${esc(f.contatto)}</b></div>`);
    }
    return pagina(`
    <div class="occhiello">${esc(c.occhiello || '')}</div>
    <div class="riga"></div>
    <h1>${esc(c.titolo || scena.titolo)}</h1>
    <div class="sotto">${esc(c.sotto || '')}</div>`);
}

/* ── le slide comparative: la stessa area dai sette angoli ───────────────── */
function leggiAngoli() {
    const perAngolo = {};
    for (const ang of ANGOLI) {
        const pdf = path.join(STUDIO, `Domande-aperte-${MAPPA.titolo}-${ang}.pdf`);
        if (!fs.existsSync(pdf)) { console.log('  · niente PDF per l\'angolo ' + ang); continue; }
        const testo = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8', maxBuffer: 32e6 });
        perAngolo[ang] = D.leggi(testo);
    }
    return perAngolo;
}

/** una slide per angolo, CUMULATIVA: la riga nuova si accende e le precedenti restano.
 *  Così in video le sette domande si impilano invece di sostituirsi. */
function slideAngoli() {
    const perAngolo = leggiAngoli();
    const { area, angoli } = D.areaComune(perAngolo);
    if (!area) throw new Error('nessuna area comune fra gli angoli: i PDF delle domande aperte ci sono?');
    const righe = D.confronto(perAngolo, area, ANGOLI);
    console.log(`  · area «${area}» presente in ${angoli} angoli, ${righe.length} domande da confrontare`);
    return righe.map((_, i) => ({
        nome: `slide-angoli-${String(i + 1).padStart(2, '0')}`,
        html: pagina(`
      <div class="area">${esc(area)}</div>
      <h2>La stessa cosa, chiesta in ${righe.length} modi</h2>
      <div class="pila">${righe.map((r, j) => `
        <div class="carta ${j <= i ? '' : 'spento'}"><div class="ang">${esc(r.angolo)}</div><div class="q">${esc(r.testo)}</div></div>`).join('')}</div>`, 'slide'),
    }));
}

/* ── il Chrome headless che le fotografa ────────────────────────────────── */
async function chromePronto() {
    for (let i = 0; i < 40; i++) {
        try { const r = await fetch('http://127.0.0.1:' + process.env.MAPPAI_PORTA + '/json/list'); if (r.ok) return true; } catch (e) { /* non ancora */ }
        await pausa(250);
    }
    return false;
}

async function rendi(pezzi) {
    fs.mkdirSync(CARTE, { recursive: true });
    fs.rmSync(PROFILO, { recursive: true, force: true });
    const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + process.env.MAPPAI_PORTA,
        '--user-data-dir=' + PROFILO, '--no-first-run', '--no-default-browser-check',
        '--allow-file-access-from-files', '--window-size=1280,720', '--hide-scrollbars', 'about:blank'],
        { detached: true, stdio: 'ignore' });
    ch.unref();
    if (!(await chromePronto())) throw new Error('Chrome headless non risponde su :' + process.env.MAPPAI_PORTA);
    await lab.collega(/.*/);
    await lab.invia('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 2, mobile: false });
    for (const p of pezzi) {
        const f = path.join(CARTE, p.nome + '.html');
        fs.writeFileSync(f, p.html);
        await lab.invia('Page.navigate', { url: 'file://' + f });
        await lab.pausa(700);                       /* i .ttf locali: senza pausa esce il ripiego */
        await lab.scatta(p.nome, { formato: 'png' });
    }
    lab.chiudi();
    try { process.kill(ch.pid); } catch (e) { /* già morto */ }
    /* il PNG di lab.scatta esce a 2560×1440 (1280×720 @2×): è la misura del video */
    return pezzi.map((p) => path.join(CARTE, p.nome + '.png'));
}

async function tutte() {
    const pezzi = SCENE.filter((s) => s.tipo === 'carta').map((s) => ({ nome: s.id, html: cartaScena(s) }));
    console.log('— cartelli:', pezzi.map((p) => p.nome).join(', '));
    const slide = slideAngoli();
    console.log('— slide degli angoli:', slide.length);
    const fatti = await rendi(pezzi.concat(slide));
    console.log(`— ${fatti.length} PNG in ${path.relative(process.env.HOME, CARTE)}`);
    return fatti;
}

if (require.main === module) tutte().catch((e) => { console.error('KO', e.message); process.exit(1); });
module.exports = { tutte, slideAngoli, cartaScena, CARTE, L, A };
