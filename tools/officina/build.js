#!/usr/bin/env node
/* OFFICINA DEI MODALI — generatore
 *
 *   node tools/officina/build.js   →   public/dev/officina.html
 *
 * Quattro piani:
 *   1. FONDAMENTALI — paletta (picker + contrasti calcolati), tipografia,
 *      raggi, spaziature, ombra, icone. Ogni token con nome, valore e motivo.
 *   2. PEZZI — bottoni, campi, spunte, tendine, sezioni, testate: varianti e
 *      STATI (riposo, fuoco, disabilitato, errore), con le misure a fianco.
 *   3. CANTIERE — i 14 archetipi che assorbono i 69 modali censiti. L'anteprima
 *      è disegnata dal MOTORE VERO (`mappai-modal.js`): quello che si vede qui
 *      è quello che l'app produrrà, non un disegno che gli somiglia.
 *   4. USCITA — il CSS dei token e lo schema JSON, pronti da copiare.
 *
 * La pagina carica i file veri dell'app (tokens + core + motore) con un
 * marcatore di versione preso dal loro mtime: non può mostrare una copia
 * diversa da quella su cui si sta lavorando.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public/dev/officina.html');
const ARCHETIPI = require('./archetipi.js');
const FAMIGLIE = require('./famiglie.js');
const FINESTRE = require('./finestre.js');
const BENTO = require('../../public/js/mappai-bento-composizione.js');

/* ⚠️ Il marcatore anti-cache deve dipendere da OGNI file che la pagina serve:
   senza il foglio del manifesto e i due script del §7, si modificava il CSS e la
   pagina continuava a mostrare il vecchio — misurando cose non più vere. */
const v = ['public/css/mappai-modal-tokens.css', 'public/js/mappai-modal-core.js',
    'public/js/mappai-modal.js', 'public/dev/officina.js',
    'public/css/mappai-stile-manifesto.css', 'public/js/mappai-bento-composizione.js',
    'public/dev/officina-bento.js']
    .map(f => { try { return Math.round(fs.statSync(path.join(ROOT, f)).mtimeMs); } catch (e) { return 0; } }).join('-');

/* ── copertura: quanti dei modali censiti sono assegnati a un archetipo ── */
function censimento() {
    const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    const NON = new Set(['source-modal-header', 'source-modal-icon', 'source-modal-kinship', 'modal-a11y-toolbar',
        'study-modal-content', 'guide-modal-content', 'merge-modal-description',
        'source-modal-content-box', 'ai-modal-content-box', 'quiz-modal-content']);
    const statici = [...new Set([...html.matchAll(/<div\s+id="([a-zA-Z0-9_-]*(?:modal|overlay)[a-zA-Z0-9_-]*)"/g)]
        .map(m => m[1]).filter(id => !NON.has(id)))];
    let dinamici = 0;
    const dir = path.join(ROOT, 'public/js');
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.js') || /\.min\.js|d3\.v7|jspdf|katex|pdf\.|qrcode|three|tailwind/.test(f)) continue;
        const src = fs.readFileSync(path.join(dir, f), 'utf8');
        dinamici += (src.match(/position:\s*fixed;\s*inset:\s*0|fixed inset-0|position:fixed;inset:0/g) || []).length;
    }
    return { statici, dinamici };
}
const CENS = censimento();
const nIstanze = ARCHETIPI.reduce((a, x) => a + x.istanze.length, 0);
const coperti = CENS.statici.filter(id => ARCHETIPI.some(a => a.istanze.some(i => i.indexOf(id) >= 0)));
const scoperti = CENS.statici.filter(id => !coperti.includes(id));

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── §0: schede dei verdetti — la procedura «prima si giudica, poi si disegna» ── */
const DEST = FAMIGLIE.destinazioni;
const famCss = FAMIGLIE.bottoni.concat(FAMIGLIE.campi).map(f => f.css || '').join('\n')
    + '\n' + FINESTRE.map(f => f.mockCss || '').join('\n');

function verdCmd() {
    return `<div class="verd-cmd">
    <button type="button" class="mini" data-esito="validato">✓ Valida</button>
    <button type="button" class="mini" data-esito="invalidato">✗ Invalida</button>
    <select class="verd-dest" aria-label="Confluisce in"><option value="">confluisce in…</option>${DEST.map(d => `<option>${esc(d)}</option>`).join('')}</select>
    <input class="verd-nota" placeholder="nota — il perché" aria-label="Nota del verdetto">
  </div>`;
}
function cardVerdetto(x) {
    return `<div class="card verd" data-verd="${x.id}">
  <div class="verd-h"><h4>${esc(x.nome)}</h4><span class="badge-verd">da giudicare</span></div>
  <p class="orig">${esc(x.origine || '')}</p>
  <div class="palchetto">${x.html || ''}</div>
  <p class="misura" data-mis></p>
  ${(x.problemi && x.problemi.length) ? '<ul class="probs">' + x.problemi.map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>' : ''}
  ${x.proposta ? `<p class="prop">${esc(x.proposta)}</p>` : ''}
  ${verdCmd()}
</div>`;
}

/* passo 3 — le superfici dei MODALI (le finestre hanno la loro sezione, §4) */
const SUPERFICI = [
    {
        id: 's-taglie', nome: 'Le 4 taglie dei modali',
        origine: 'mappai-modal-core.js — S 440 · M 600 · L 820 · XL 1160 (qui in scala 1:8)',
        html: '<div class="tag-demo"><span style="width:55px">S</span><span style="width:75px">M</span><span style="width:102px">L</span><span style="width:145px">XL</span></div>',
        problemi: ['nel codice di oggi le larghezze sono 29 diverse'],
        proposta: 'Le schede vere si provano nel Cantiere (§3): qui si mette per iscritto che quattro bastano.'
    },
    {
        id: 's-velo', nome: 'Velo unico',
        origine: 'decisione 6 — rgba(15,23,42,.45) + blur',
        html: '<div class="velo-demo">il contesto resta leggibile sotto il velo</div>',
        problemi: ['14 veli diversi censiti nel campionario'],
        proposta: ''
    }
];

/* passo 4 — icone: taglia, emoji residue, posizione */
const ICONE = [
    {
        id: 'ico-taglia', nome: 'Taglia: 20 nel corpo · 22 in testata',
        origine: 'la divergenza aperta del 29/7 — nel codice 18 usi di 20px contro 17 di 22px',
        html: '<span class="ico-demo"><i data-lucide="printer" style="width:20px;height:20px"></i><em>20</em></span>' +
            '<span class="ico-demo"><i data-lucide="printer" style="width:22px;height:22px"></i><em>22</em></span>',
        problemi: [],
        proposta: 'Nei token oggi: 20 nel corpo, 22 in testata. Qui si valida o si sceglie «20 ovunque» (comando in §1).'
    },
    {
        id: 'ico-emoji', nome: 'Emoji residue nei bottoni (topbar dei stampati)',
        origine: 'mappai-quiz-print.js:80 — regola dell’11/7: «icone Lucide, mai emoji»',
        html: '<button class="fam-tb">🖨 Stampa</button><em style="font-size:11px;color:#94a3b8">→</em>' +
            '<button class="fam-tb"><i data-lucide="printer" style="width:14px;height:14px;vertical-align:-2px"></i> Stampa</button>',
        problemi: ['le topbar dei stampati sono rimaste fuori dalla conversione emoji → Lucide'],
        proposta: 'Invalidare l’emoji chiude il cerchio: la regola vale anche per le finestre-documento.'
    },
    {
        id: 'ico-pos', nome: 'Posizione: sempre a sinistra del testo',
        origine: 'prassi di fatto nel codice, mai messa per iscritto',
        html: '<button class="mm-btn mm-btn--secondario"><i data-lucide="printer"></i><span>Stampa</span></button>' +
            '<em style="font-size:11px;color:#94a3b8">vs</em>' +
            '<button class="mm-btn mm-btn--secondario"><span>Stampa</span><i data-lucide="printer"></i></button>',
        problemi: [],
        proposta: 'Un verdetto qui la trasforma da abitudine a regola.'
    }
];

/* ── §5: il registro delle assegnazioni — ogni superficie nota, una riga ── */
function registro() {
    const righe = [];
    CENS.statici.forEach(id => {
        const a = ARCHETIPI.find(x => x.istanze.some(i => i.indexOf(id) >= 0));
        righe.push({ id: 'st-' + id, nome: id, tipo: 'statico', origine: 'index.html', pre: a ? a.id : '' });
    });
    ARCHETIPI.forEach(a => a.istanze.forEach(i => {
        if (CENS.statici.some(sid => i.indexOf(sid) >= 0)) return;          // già in riga come statico
        const key = 'dy-' + i.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '');
        if (righe.some(r => r.id === key)) return;
        righe.push({ id: key, nome: i, tipo: 'overlay', origine: 'moduli js', pre: a.id });
    }));
    FINESTRE.forEach(f => (f.istanze || []).forEach(i => {
        const key = 'fw-' + i.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
        if (righe.some(r => r.id === key)) return;
        righe.push({ id: key, nome: i, tipo: 'finestra', origine: f.nome, pre: f.id });
    }));
    return righe;
}
const REGISTRO = registro();
const GRUPPI = ARCHETIPI.map(a => ({ id: a.id, nome: 'Modale · ' + a.nome }))
    .concat(FINESTRE.map(f => ({ id: f.id, nome: 'Finestra · ' + f.nome })))
    .concat([{ id: 'fuori', nome: 'Fuori perimetro' }]);
const VERD_ITEMS = []
    .concat(FAMIGLIE.bottoni.map(x => ({ id: x.id, nome: x.nome, passo: 'bottoni' })))
    .concat(FAMIGLIE.campi.map(x => ({ id: x.id, nome: x.nome, passo: 'campi' })))
    .concat(SUPERFICI.map(x => ({ id: x.id, nome: x.nome, passo: 'superfici' })))
    .concat(ICONE.map(x => ({ id: x.id, nome: x.nome, passo: 'icone' })))
    .concat(FINESTRE.map(x => ({ id: x.id, nome: x.nome, passo: 'finestre' })));

/* ══════════════════════════════════════════════════════════════════════════ */
const page = `<!DOCTYPE html>
<!-- ⚠️ La classe «manifesto» sta sul TAG HTML, non solo sul contenitore
     dell'anteprima. Il foglio della veste ha due famiglie di selettori: le vecchie
     partono da .manifesto (e la classe sul contenitore bastava), le nuove — tutte
     quelle degli strumenti e dei controlli granulari — da html.manifesto, che
     senza questa classe non aggancia NIENTE. Risultato: il banco mostrava una
     disposizione delle voci che a schermo non esiste, cioè il difetto che un banco
     serve a non far succedere.
     Verificato che sia innocuo per il resto della pagina: gli 81 campioni .mm-*
     delle altre sezioni non cambiano di un pixel (le regole globali della veste
     sono ancorate a id della landing, che qui non esistono). -->
<html lang="it" class="manifesto">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Officina dei modali e delle finestre — MappAI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<style>:root { --emoji-font: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif; }</style>

<!-- i file VERI dell'app: l'anteprima non può divergere dal prodotto -->
<link rel="stylesheet" href="../css/mappai-modal-tokens.css?v=${v}">

<!-- §7 lavora sul bento VERO di COSTRUISCI: serve il suo foglio, e le regole
     vivono sotto html.manifesto (la classe la mette lo script della sezione). -->
<link rel="stylesheet" href="../css/mappai-stile-manifesto.css?v=${v}">

<!-- CSS delle famiglie esistenti e dei mock finestre: TRASCRITTO dal codice
     vero (origini in tools/officina/famiglie.js e finestre.js) -->
<style>${famCss}</style>
<script src="../js/lucide.min.js"></script>
<script src="../js/mappai-modal-core.js?v=${v}"></script>
<script src="../js/mappai-modal.js?v=${v}"></script>

<style>
  * { font-family: 'Space Mono', var(--emoji-font), monospace; box-sizing: border-box; }
  body { margin:0; background:#eef1f6; color:#0f172a; }
  .wrap { max-width:1320px; margin:0 auto; padding:0 22px 90px; }
  header.top { position:sticky; top:0; z-index:60; background:rgba(238,241,246,.95);
    backdrop-filter:blur(8px); border-bottom:1px solid #d7dde7; padding:13px 0 11px; margin-bottom:22px; }
  header.top .wrap { padding-bottom:0; }
  h1 { font-size:24px; font-weight:700; margin:0 0 3px; }
  .sub { font-size:12px; color:#64748b; margin:0 0 9px; }
  nav a { font-size:11.5px; font-weight:700; color:#475569; text-decoration:none; background:#fff;
    border:1px solid #d7dde7; border-radius:999px; padding:5px 11px; margin-right:6px; display:inline-block; }
  nav a:hover { border-color:#4f46e5; color:#4f46e5; }
  h2 { font-size:18px; margin:38px 0 4px; }
  h2 .n { color:#94a3b8; font-weight:400; font-size:13px; }
  h3 { font-size:13.5px; margin:22px 0 8px; }
  .lead { font-size:12.5px; color:#475569; line-height:1.7; max-width:80ch; margin:0 0 16px; }
  .card { background:#fff; border:1px solid #dbe1ea; border-radius:14px; padding:14px 16px; margin-bottom:12px; }
  .griglia { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; }

  /* piano 1 — token */
  .tok { display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #f1f5f9; }
  .tok:last-child { border-bottom:0; }
  .tok input[type=color] { width:34px; height:26px; border:1px solid #cbd5e1; border-radius:7px; padding:1px; background:#fff; cursor:pointer; }
  .tok input[type=range] { flex:1; accent-color:#4f46e5; }
  .tok label { font-size:11.5px; font-weight:700; flex:0 0 118px; }
  .tok .val { font-size:11px; color:#64748b; font-weight:700; min-width:56px; text-align:right; }
  .tok .perche { font-size:10.5px; color:#94a3b8; flex:1 1 100%; margin:0 0 0 128px; line-height:1.5; }
  table.contr { width:100%; border-collapse:collapse; font-size:11.5px; }
  table.contr td { padding:5px 7px; border-bottom:1px solid #f1f5f9; }
  table.contr td.n { text-align:right; font-weight:700; }
  .ok { color:#047857; } .ko { color:#c2410c; }
  .pill { display:inline-block; font-size:9.5px; font-weight:700; text-transform:uppercase;
    letter-spacing:.06em; border-radius:999px; padding:2px 7px; }
  .pill.ok { background:#d1fae5; color:#047857; } .pill.ko { background:#ffedd5; color:#c2410c; }


  /* §7 — bento */
  .bn-cmd { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
  .bn-b { font-family:inherit; font-size:11.5px; font-weight:700; padding:7px 12px; border-radius:9px;
    border:1px solid #d7dde7; background:#fff; color:#334155; cursor:pointer; }
  .bn-b:hover { border-color:#4f46e5; color:#4f46e5; }
  .bn-b--ko:hover { border-color:#dc2626; color:#dc2626; }
  .bn-nota { font-size:11px; color:#94a3b8; }
  .bn-out { width:100%; height:180px; font-family:inherit; font-size:11px; border:1px solid #d7dde7;
    border-radius:10px; padding:10px; background:#0f172a; color:#7dd3fc; margin-bottom:12px; }
  .bn-wrap { display:grid; grid-template-columns:300px minmax(0,1fr); gap:16px; align-items:start; }
  .bn-h4 { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; margin:14px 0 7px; }
  .bn-h4:first-child { margin-top:0; }
  .bn-inv { background:#fff; border:1px dashed #cbd5e1; border-radius:12px; padding:9px; min-height:70px;
    display:flex; flex-direction:column; gap:6px; }
  .bn-inv.bn-over, .bn-drop.bn-over { border-color:#4f46e5; background:#eef2ff; }
  .bn-voce { display:flex; align-items:center; gap:6px; background:#f8fafc; border:1px solid #e2e8f0;
    border-radius:8px; padding:5px 8px; cursor:grab; }
  .bn-voce--dentro { display:block; }
  .bn-voce__c { display:flex; align-items:center; gap:5px; margin-top:4px; }
  .bn-voce--dentro .bn-et { width:100%; font-size:11.5px; }
  .bn-voce.bn-drag { opacity:.45; }
  .bn-voce--ko { background:#fef2f2; border-color:#fecaca; color:#b91c1c; }
  .bn-voce__t { font-size:11.5px; font-weight:700; flex:1; }
  .bn-tipo { font-size:9.5px; font-weight:700; color:#64748b; background:#e2e8f0; border-radius:999px; padding:1px 6px; }
  .bn-fig { color:#b45309; font-weight:700; }
  .bn-sposta { font-family:inherit; font-size:10px; border:1px solid #e2e8f0; border-radius:6px;
    background:#fff; color:#475569; max-width:96px; }
  .bn-griglia { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:10px; align-items:start; }
  .bn-mod { background:#fff; border:1px solid #dbe1ea; border-radius:12px; padding:9px; }
  .bn-mod__h { display:flex; gap:5px; align-items:center; margin-bottom:6px; }
  .bn-tit { flex:1; min-width:0; font-family:inherit; font-size:11.5px; font-weight:700; border:1px solid #e2e8f0;
    border-radius:7px; padding:4px 7px; }
  .bn-span { font-size:10px; color:#94a3b8; font-weight:700; display:flex; align-items:center; gap:3px; }
  .bn-col { font-family:inherit; font-size:10.5px; border:1px solid #e2e8f0; border-radius:6px; }
  .bn-x { border:none; background:none; color:#cbd5e1; font-size:17px; line-height:1; cursor:pointer; padding:0 3px; }
  .bn-x:hover { color:#dc2626; }
  .bn-master { font-size:10px; color:#b45309; margin-bottom:5px; }
  .bn-drop { display:flex; flex-direction:column; gap:5px; min-height:52px; border:1px dashed #e2e8f0;
    border-radius:9px; padding:6px; }
  .bn-vuoto { font-size:10.5px; color:#cbd5e1; }
  .bn-d { background:#fff; border:1px solid #dbe1ea; border-radius:11px; padding:9px 12px; margin-bottom:8px;
    font-size:11.5px; line-height:1.6; }
  .bn-d b { font-size:10px; letter-spacing:.08em; color:#94a3b8; display:block; margin-bottom:3px; }
  .bn-d ul { margin:0; padding-left:16px; }
  .bn-d--ko { border-color:#fecaca; color:#b91c1c; } .bn-d--ko b { color:#b91c1c; }
  .bn-d--av { border-color:#fed7aa; color:#b45309; } .bn-d--av b { color:#b45309; }
  .bn-d--ok { border-color:#a7f3d0; color:#047857; } .bn-d--ok b { color:#047857; }
  table.bn-corpi { width:100%; border-collapse:collapse; font-size:11px; background:#fff;
    border:1px solid #dbe1ea; border-radius:10px; overflow:hidden; }
  table.bn-corpi th { background:#f8fafc; font-size:9.5px; letter-spacing:.08em; color:#94a3b8; text-align:left; padding:5px 8px; }
  table.bn-corpi td { padding:5px 8px; border-top:1px solid #f1f5f9; }
  tr.bn-fuori td { background:#fff7ed; color:#b45309; }
  .bn-grip { cursor:grab; color:#cbd5e1; font-size:13px; line-height:1; user-select:none; }
  .bn-grip:active { cursor:grabbing; }
  .bn-su, .bn-giu { border:none; background:none; color:#94a3b8; cursor:pointer; font-size:11px; padding:0 2px; line-height:1; }
  .bn-su:hover, .bn-giu:hover { color:#4f46e5; }
  .bn-su[disabled], .bn-giu[disabled] { color:#e2e8f0; cursor:default; }
  .bn-mod.bn-over { outline:2px dashed #4f46e5; outline-offset:2px; }
  .bn-asp { display:flex; flex-wrap:wrap; gap:5px 7px; align-items:center; margin:0 0 6px;
    padding:5px 6px; background:#f8fafc; border-radius:8px; font-size:9.5px; color:#94a3b8; font-weight:700; }
  .bn-asp label { display:flex; align-items:center; gap:3px; }
  .bn-c { width:26px; height:20px; border:1px solid #cbd5e1; border-radius:5px; padding:1px; background:#fff; cursor:pointer; }
  .bn-h, .bn-bp, .bn-w { font-family:inherit; font-size:10px; width:44px; border:1px solid #e2e8f0; border-radius:5px; padding:2px 4px; }
  .bn-w { width:40px; }
  .bn-ico { font-family:inherit; font-size:10px; max-width:78px; border:1px solid #e2e8f0; border-radius:5px; }
  .bn-k { margin-left:auto; color:#047857; }
  .bn-k--ko { color:#c2410c; }
  /* la seconda riga dell'aspetto: quello che succede DENTRO il riquadro
     (disposizione delle voci, colonna delle etichette, colori dei bottoni).
     Sfondo appena diverso dalla prima riga: sono due livelli, non due gruppi
     di comandi qualunque. */
  .bn-int { background:#f1f5f9; }
  .bn-int .bn-k { margin-left:6px; }
  .bn-int .bn-k:first-of-type { margin-left:auto; }
  .bn-voci-n, .bn-et-pos { font-family:inherit; font-size:10px; border:1px solid #e2e8f0; border-radius:5px; }
  .bn-colmin, .bn-et-w { font-family:inherit; font-size:10px; width:44px; border:1px solid #e2e8f0; border-radius:5px; padding:2px 4px; }
  .bn-et { flex:1; min-width:0; font-family:inherit; font-size:11px; font-weight:700; border:1px solid transparent;
    background:transparent; border-radius:5px; padding:2px 4px; }
  .bn-et:hover, .bn-et:focus { border-color:#cbd5e1; background:#fff; }
  /* il pop-up informativo della voce: riga sua, sotto l'etichetta — è una frase,
     non un'etichetta breve, e in linea coi comandi non si riuscirebbe a leggerla */
  .bn-aiuto { display:block; width:100%; margin:2px 0 4px; font-family:inherit; font-size:10.5px; font-weight:400;
    color:#475569; border:1px solid transparent; background:transparent; border-radius:5px; padding:2px 4px; }
  .bn-aiuto:hover, .bn-aiuto:focus { border-color:#cbd5e1; background:#fff; }
  .bn-aiuto::placeholder { color:#cbd5e1; }
  .bn-etq { display:flex; align-items:center; gap:3px; }
  .bn-preview { background:#fff; border:1px solid #dbe1ea; border-radius:12px; padding:14px; }

  /* piano 2 — pezzi */
  .pezzo { border:1px solid #dbe1ea; background:#fff; border-radius:12px; padding:12px 14px; }
  .pezzo h4 { margin:0 0 10px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#94a3b8; }
  .riga-pezzi { display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; }
  .misura { font-size:10.5px; color:#94a3b8; margin-top:7px; }
  .misura b { color:#c2410c; }

  /* piano 3 — cantiere */
  .arche { background:#fff; border:1px solid #dbe1ea; border-radius:14px; margin-bottom:12px; overflow:hidden; }
  .arche-h { display:flex; gap:12px; align-items:flex-start; padding:12px 15px; border-bottom:1px solid #eef1f6; flex-wrap:wrap; }
  .arche-h h4 { margin:0; font-size:14px; }
  .arche-h .q { font-size:11.5px; color:#64748b; line-height:1.6; flex:1 1 100%; margin-top:3px; }
  .stato { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; border-radius:999px; padding:3px 8px; }
  .stato.da-fare { background:#f1f5f9; color:#64748b; }
  .stato.bozza { background:#fef3c7; color:#a16207; }
  .stato.approvato { background:#d1fae5; color:#047857; }
  .arche-cmd { display:flex; gap:6px; flex-wrap:wrap; margin-left:auto; }
  .mini { background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:4px 9px; font-size:11px; font-weight:700; color:#334155; cursor:pointer; }
  .mini.on { border-color:#4f46e5; color:#4f46e5; background:#eef2ff; }
  .palco { background:#334155; background-image:radial-gradient(#475569 1px, transparent 1px);
    background-size:14px 14px; padding:24px; display:flex; justify-content:center; overflow:auto; }
  /* senza questo il flex comprime il riquadro fino al contenuto minimo:
     un cruscotto da 1160 finiva renderizzato a 44px di larghezza */
  .palco > .mm-box { flex:0 0 auto; }
  .istanze { padding:9px 15px; font-size:11px; color:#64748b; background:#f8fafc; border-top:1px solid #eef1f6; line-height:1.7; }
  .istanze code { background:#eef1f6; border-radius:4px; padding:0 4px; }

  /* piano 4 — uscita */
  pre.out { background:#0f172a; color:#e2e8f0; border-radius:14px; padding:14px 16px; font-size:11px;
    line-height:1.6; overflow:auto; max-height:340px; margin:0; white-space:pre; }
  .out-h { display:flex; align-items:center; gap:10px; margin:14px 0 8px; }
  .copia { background:#fff; border:1px solid #e2e8f0; border-radius:9px; padding:5px 11px; font-size:11px; font-weight:700; color:#334155; cursor:pointer; }

  /* piano 0 — i verdetti */
  .verd-h { display:flex; align-items:center; gap:8px; justify-content:space-between; }
  .verd-h h4 { margin:0; font-size:12.5px; line-height:1.4; }
  .badge-verd { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
    border-radius:999px; padding:3px 8px; background:#f1f5f9; color:#64748b; flex:0 0 auto; }
  .badge-verd.validato { background:#d1fae5; color:#047857; }
  .badge-verd.invalidato { background:#ffedd5; color:#c2410c; }
  .orig { font-size:10px; color:#94a3b8; margin:4px 0 8px; line-height:1.5; }
  .palchetto { background:#eef1f6; border:1px solid #e2e8f0; border-radius:10px; padding:14px;
    display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .probs { margin:8px 0 0; padding-left:16px; font-size:11px; color:#9a3412; line-height:1.6; }
  .prop { font-size:11px; color:#475569; line-height:1.6; margin:8px 0 0; }
  .verd-cmd { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; align-items:center; }
  .verd-cmd .mini.on-si { border-color:#047857; color:#047857; background:#d1fae5; }
  .verd-cmd .mini.on-no { border-color:#c2410c; color:#c2410c; background:#ffedd5; }
  .verd-dest, .verd-nota { border:1px solid #e2e8f0; border-radius:8px; padding:5px 8px;
    font-size:11px; font-family:inherit; color:#334155; background:#fff; }
  .verd-nota { flex:1; min-width:120px; }
  .tag-demo { display:flex; gap:6px; align-items:flex-end; }
  .tag-demo span { display:inline-flex; align-items:center; justify-content:center; height:34px;
    background:#fff; border:1px solid #cbd5e1; border-radius:6px; font-size:10px; font-weight:700; color:#64748b; }
  .velo-demo { width:100%; height:56px; border-radius:8px; background:rgba(15,23,42,.45);
    display:flex; align-items:center; justify-content:center; color:#fff; font-size:10px; }
  .ico-demo { display:inline-flex; align-items:center; gap:5px; background:#fff; border:1px solid #e2e8f0;
    border-radius:8px; padding:7px 10px; }
  .ico-demo em { font-style:normal; font-size:10px; color:#94a3b8; font-weight:700; }
  .ico-demo svg { color:#4f46e5; }

  /* piano 4 — finestre */
  .palco--chiaro { background:#eef1f6; background-image:none; }
  .fin-mock { width:100%; max-width:540px; }

  /* piano 5 — assegnazioni */
  table.assegna { width:100%; border-collapse:collapse; font-size:11px; }
  table.assegna th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.06em;
    color:#94a3b8; padding:8px 10px; border-bottom:1px solid #e2e8f0; background:#f8fafc; }
  table.assegna td { padding:6px 10px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
  table.assegna select { border:1px solid #e2e8f0; border-radius:7px; padding:4px 6px; font-size:11px;
    font-family:inherit; color:#334155; background:#fff; max-width:250px; }
  .tipo-pill { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
    border-radius:999px; padding:2px 7px; }
  .tipo-pill.statico { background:#eef2ff; color:#4f46e5; }
  .tipo-pill.overlay { background:#fef3c7; color:#a16207; }
  .tipo-pill.finestra { background:#d1fae5; color:#047857; }
</style>
</head>
<body>

<header class="top"><div class="wrap">
  <h1>Officina dei modali e delle finestre</h1>
  <p class="sub">Prima si giudica l'esistente (§0), poi si scelgono i token (§1) e si disegna col motore vero
     (<code>mappai-modal.js</code>). ${ARCHETIPI.length} archetipi per ${CENS.statici.length} modali statici e ${CENS.dinamici} overlay dinamici
     + ${FINESTRE.length} famiglie di finestre-documento censite il 30/7.</p>
  <nav><a href="#verdetti">0 · Verdetti</a><a href="#fondamentali">1 · Fondamentali</a><a href="#pezzi">2 · Pezzi</a><a href="#cantiere">3 · Cantiere</a><a href="#finestre">4 · Finestre</a><a href="#assegnazioni">5 · Assegnazioni</a><a href="#bento">7 · Bento</a><a href="#uscita">6 · Uscita</a><a href="rotta-ui.html" style="border-color:#4f46e5;color:#4f46e5">↗ Rotta</a></nav>
</div></header>

<div class="wrap">

<!-- ═══════════════════════════════ 0 ═══════════════════════════════ -->
<h2 id="verdetti">0. I verdetti <span class="n">— prima si giudica l'esistente, poi si disegna</span></h2>
<p class="lead">La procedura in quattro passi: <b>bottoni → campi → superfici → icone</b>. Ogni scheda mostra un
pezzo COM'È OGGI — CSS trascritto dal codice, origine dichiarata file:riga — con le misure lette dal layout e i
problemi noti. Il giudizio è tuo: <b>Valida</b> = resta com'è (la tendina al massimo documenta una parentela);
<b>Invalida + tendina</b> = ordine di migrazione — chi lo sostituisce. La tendina è vincolante solo con Invalida.
I giudizi restano in questa macchina (localStorage) ed escono in §6 come JSON da mettere nel repo.</p>
<div class="card"><b>Avanzamento:</b> <span id="verd-stato">—</span></div>

<h3>Passo 1 · Bottoni <span class="n">— ${FAMIGLIE.bottoni.length} famiglie trovate nel codice</span></h3>
<div class="griglia">${FAMIGLIE.bottoni.map(cardVerdetto).join('\n')}</div>

<h3>Passo 2 · Campi <span class="n">— input, textarea, tendine, strumenti di riga</span></h3>
<div class="griglia">${FAMIGLIE.campi.map(cardVerdetto).join('\n')}</div>

<h3>Passo 3 · Superfici <span class="n">— taglie e velo; le finestre-documento sono in §4, col verdetto lì</span></h3>
<div class="griglia">${SUPERFICI.map(cardVerdetto).join('\n')}</div>

<h3>Passo 4 · Icone <span class="n">— taglia, emoji residue, posizione</span></h3>
<div class="griglia">${ICONE.map(cardVerdetto).join('\n')}</div>

<!-- ═══════════════════════════════ 1 ═══════════════════════════════ -->
<h2 id="fondamentali">1. Fondamentali <span class="n">— ogni token ha un valore e un motivo</span></h2>
<p class="lead">Muovi un comando e cambia tutto quello che sta sotto: pezzi, archetipi, CSS in uscita.
I contrasti si aggiornano a ogni tocco — un accostamento si sceglie guardando il numero, non l'effetto che fa.</p>

<div class="griglia">
  <div class="card"><h3 style="margin-top:0">Colore</h3>
    <div class="tok"><label>Accento</label><input type="color" id="c-accento" value="#4f46e5"><span class="val" id="v-accento">#4f46e5</span>
      <p class="perche">Il colore dell'azione. Uno solo: 202 occorrenze contro le 97 del secondo indigo.</p></div>
    <div class="tok"><label>Accento tenue</label><input type="color" id="c-accentoTenue" value="#eef2ff"><span class="val" id="v-accentoTenue">#eef2ff</span></div>
    <div class="tok"><label>Distruttivo</label><input type="color" id="c-distruttivo" value="#dc2626"><span class="val" id="v-distruttivo">#dc2626</span>
      <p class="perche">Solo per ciò che si perde. Mai per «Annulla».</p></div>
    <div class="tok"><label>Testo</label><input type="color" id="c-testo" value="#0f172a"><span class="val" id="v-testo">#0f172a</span></div>
    <div class="tok"><label>Testo 2</label><input type="color" id="c-testo2" value="#475569"><span class="val" id="v-testo2">#475569</span></div>
    <div class="tok"><label>Testo 3</label><input type="color" id="c-testo3" value="#64748b"><span class="val" id="v-testo3">#64748b</span>
      <p class="perche">Sottotitoli e segnaposto. È il colore che decide se un campo vuoto si legge.</p></div>
    <div class="tok"><label>Bordo</label><input type="color" id="c-bordo" value="#e2e8f0"><span class="val" id="v-bordo">#e2e8f0</span>
      <p class="perche">DECISA il 31/7: i CAMPI non hanno bordo (riempimento + fuoco). Questo governa solo i riquadri, decorativo.</p></div>
    <div class="tok"><label>Fondo sezione</label><input type="color" id="c-fondoSez" value="#f8fafc"><span class="val" id="v-fondoSez">#f8fafc</span></div>
  </div>

  <div class="card"><h3 style="margin-top:0">Contrasti <span class="n" id="contr-esito"></span></h3>
    <table class="contr"><tbody id="tab-contr"></tbody></table>
    <p class="perche" style="margin:9px 0 0">Soglie WCAG 2.1: 4,5:1 per il testo, 3:1 per bordi e icone che portano informazione.</p>
  </div>

  <div class="card"><h3 style="margin-top:0">Forma</h3>
    <div class="tok"><label>Raggio riquadro</label><input type="range" id="r-box" min="0" max="28" value="16"><span class="val" id="v-r-box">16px</span></div>
    <div class="tok"><label>Raggio campo</label><input type="range" id="r-campo" min="0" max="20" value="10"><span class="val" id="v-r-campo">10px</span></div>
    <div class="tok"><label>Raggio bottone</label><input type="range" id="r-btn" min="0" max="24" value="10"><span class="val" id="v-r-btn">10px</span></div>
    <div class="tok"><label>Padding</label><input type="range" id="r-pad" min="12" max="36" value="22"><span class="val" id="v-r-pad">22px</span></div>
    <div class="tok"><label>Spazio</label><input type="range" id="r-gap" min="6" max="24" value="12"><span class="val" id="v-r-gap">12px</span></div>
    <div class="tok"><label>Icona</label><input type="range" id="r-ico" min="14" max="28" value="20"><span class="val" id="v-r-ico">20px</span></div>
    <div class="tok"><label>Corpo bottone</label><input type="range" id="r-btnfs" min="11" max="18" value="12"><span class="val" id="v-r-btnfs">12px</span></div>
    <div class="tok"><label>Spazio bottone</label><input type="range" id="r-btngap" min="4" max="16" value="8"><span class="val" id="v-r-btngap">8px</span></div>
  </div>

  <div class="card"><h3 style="margin-top:0">Le tre aperte <span class="n">decidile guardando</span></h3>
    <div class="tok"><label>Bottoni</label>
      <button type="button" class="mini on" data-apri="btncase" data-v="none">testo normale</button>
      <button type="button" class="mini" data-apri="btncase" data-v="uppercase">MAIUSCOLO .2em</button></div>
    <p class="perche" style="margin-left:0">Decisione 3 diceva tondo; il CSS che hai passato dice maiuscolo.</p>
    <div class="tok"><label>Etichette</label>
      <button type="button" class="mini on" data-apri="label" data-v="dentro">solo segnaposto</button>
      <button type="button" class="mini" data-apri="label" data-v="sopra">sopra il campo</button></div>
    <p class="perche" style="margin-left:0">CONFERMATA il 31/7 (solo segnaposto) + regola: un gruppo di 2+ campi porta il TITOLO di sezione — il core avvisa se manca.</p>
    <div class="tok"><label>Icone</label>
      <button type="button" class="mini on" data-apri="ico" data-v="20">20 bottoni · 24 testata</button>
      <button type="button" class="mini" data-apri="ico" data-v="uguale">stessa taglia ovunque</button></div>
    <p class="perche" style="margin-left:0">DECISA il 31/7: 20 nei bottoni e nel corpo, 24 in testata.</p>
  </div>
</div>

<!-- ═══════════════════════════════ 2 ═══════════════════════════════ -->
<h2 id="pezzi">2. I pezzi <span class="n">— varianti e stati</span></h2>
<p class="lead">Gli stati sono metà del disordine di oggi: un bottone disabilitato senza motivo, un campo in errore
che si distingue solo dal colore, un fuoco da tastiera invisibile. Qui ci sono tutti, e si guardano insieme.</p>

<div class="griglia">
  <div class="pezzo"><h4>Bottoni · ruoli</h4>
    <div class="riga-pezzi">
      <button class="mm-btn mm-btn--primario">Conferma</button>
      <button class="mm-btn mm-btn--secondario">Annulla</button>
      <button class="mm-btn mm-btn--distruttivo">Elimina</button>
      <button class="mm-btn mm-btn--quieto">Salta</button>
    </div>
    <p class="misura" id="mis-btn"></p></div>

  <div class="pezzo"><h4>Bottoni · stati</h4>
    <div class="riga-pezzi">
      <button class="mm-btn mm-btn--primario">riposo</button>
      <button class="mm-btn mm-btn--primario" id="btn-fuoco">con fuoco</button>
      <button class="mm-btn mm-btn--primario" disabled>disabilitato</button>
      <button class="mm-btn mm-btn--primario"><i data-lucide="loader-2"></i><span>in corso</span></button>
    </div>
    <p class="misura">Il fuoco da tastiera ha un anello proprio: senza, chi naviga con Tab non sa dov'è.</p></div>

  <div class="pezzo"><h4>Campi · stati</h4>
    <div class="riga-pezzi" style="flex-direction:column;align-items:stretch">
      <input class="mm-campo" placeholder="Nome della classe" aria-label="Nome della classe">
      <input class="mm-campo" value="4R" aria-label="Compilato">
      <div><input class="mm-campo is-errore" value="4" aria-label="In errore"><span class="mm-errore">Manca la sezione (es. 4R)</span></div>
      <input class="mm-campo" value="non modificabile" disabled aria-label="Disabilitato">
    </div>
    <p class="misura" id="mis-campo"></p></div>

  <div class="pezzo"><h4>Scelte</h4>
    <label class="mm-opz"><input type="checkbox" checked><span><span class="mm-opz__t">Con descrizione</span><span class="mm-opz__d">La riga di aiuto sta sotto, non a destra</span></span></label>
    <label class="mm-opz"><input type="checkbox"><span><span class="mm-opz__t">Senza descrizione</span></span></label>
    <label class="mm-opz"><input type="radio" name="p"><span><span class="mm-opz__t">Una scelta fra tante</span></span></label>
    <select class="mm-campo" aria-label="Esempio di tendina" style="margin-top:8px"><option>Tendina</option></select></div>

  <div class="pezzo"><h4>Sezione</h4>
    <div class="mm-sez"><span class="mm-sez__t">Titolo di sezione</span>
      <p class="mm-testo" style="margin:0">Il riquadro raggruppa. Se ce n'è uno solo, probabilmente non serve.</p></div>
    <div class="mm-sez mm-sez--accento" style="margin-top:9px"><span class="mm-sez__t">In evidenza</span>
      <p class="mm-testo" style="margin:0">Per il dato che governa la scelta.</p></div></div>

  <div class="pezzo"><h4>Testata</h4>
    <div class="mm-head" style="margin:0">
      <div class="mm-head__ico"><i data-lucide="sparkles"></i></div>
      <div class="mm-head__testi"><div class="mm-title">Titolo del modale</div>
        <div class="mm-subtitle">contesto, nome del progetto, passo</div></div>
      <button class="mm-close" aria-label="Chiudi">&times;</button></div></div>
</div>

<!-- ═══════════════════════════════ 3 ═══════════════════════════════ -->
<h2 id="cantiere">3. Il cantiere <span class="n">— ${ARCHETIPI.length} forme per ${CENS.statici.length + CENS.dinamici} modali</span></h2>
<p class="lead">Ogni scheda è disegnata dal motore vero a partire dal suo schema. Cambia taglia e impaginazione
e guarda cosa succede; premi <b>Apri</b> per provarla come modale vero, con ESC, Invio, Tab e velo.
Sotto ogni scheda, quali modali di oggi ci confluiscono.</p>
<div class="card" style="font-size:12px;color:#475569;line-height:1.7">
  <b>Copertura:</b> ${nIstanze} modali reali assegnati a un archetipo · ${coperti.length}/${CENS.statici.length} statici coperti per nome.
  ${scoperti.length ? 'Ancora senza casa: <code>' + scoperti.map(esc).join('</code> <code>') + '</code>' : 'Nessuno scoperto.'}
</div>
<div id="cantiere-lista"></div>

<!-- ═══════════════════════════════ 4 ═══════════════════════════════ -->
<h2 id="finestre">4. Le finestre-documento <span class="n">— la categoria che mancava al campionario</span></h2>
<p class="lead">Salvataggio, stampa, playback dei documenti generati: pagine aperte con <code>window.open</code>,
PDF headless, l'editor di ELABORA, i player audio, le pagine condivise via QR. Il censimento del campionario non le
vedeva (contava solo modali di index.html e overlay <code>position:fixed</code>). Ogni famiglia ha il mock col CSS
vero trascritto, le istanze reali, i token che le servirebbero — e il suo verdetto.</p>
${FINESTRE.map(f => `<section class="arche verd" data-verd="${f.id}" id="fin-${f.id}">
  <div class="arche-h"><h4>${esc(f.nome)}</h4><span class="badge-verd">da giudicare</span>
    <span class="stato ${f.stato}">${f.stato.replace('-', ' ')}</span>
    <p class="q"><b>${esc(f.apertura)}</b><br>${esc(f.quando)}</p></div>
  ${f.mock ? `<div class="palco palco--chiaro"><div class="fin-mock">${f.mock}</div></div>` : ''}
  ${(f.tokenNuovi && f.tokenNuovi.length) ? `<div class="istanze"><b>Token che le servirebbero:</b> ${f.tokenNuovi.map(t => '<code>' + esc(t) + '</code>').join(' ')}</div>` : ''}
  <div class="istanze"><b>${f.istanze.length} superfici di oggi:</b> <code>${f.istanze.map(esc).join('</code> <code>')}</code></div>
  <div class="istanze" style="background:#fff">${verdCmd()}</div>
</section>`).join('\n')}

<!-- ═══════════════════════════════ 5 ═══════════════════════════════ -->
<h2 id="assegnazioni">5. Assegnazioni <span class="n">— ogni superficie ha una casa</span></h2>
<p class="lead">Tutte le superfici note — modali statici, overlay dinamici, finestre-documento — una riga ciascuna,
con il gruppo di stile assegnato dalla tendina. Le preassegnazioni vengono da <code>archetipi.js</code> e
<code>finestre.js</code>; quando ogni riga ha una casa, la migrazione ha un perimetro finito.</p>
<div class="card"><b>Assegnate:</b> <span id="ass-stato">—</span></div>
<div class="card" style="padding:0;overflow-x:auto"><table class="assegna" id="tab-assegna"></table></div>

<!-- ═══════════════════════════════ 6 ═══════════════════════════════ -->

<!-- ═══════════════════════════════ 7 ═══════════════════════════════ -->
<h2 id="bento">7. Il bento di COSTRUISCI <span class="n">— dove va ogni opzione, e quanto spazio prende</span></h2>
<p class="lead">Il bento ha sostituito il modale «Genera materiali»: le sue card portano gli <b>id veri</b> dei campi,
quindi <code>MappAIPipeline._readConfig()</code> resta l'unico posto che legge la configurazione. Comporlo vuol dire
decidere <b>dove</b> mettere quei campi — non riscriverli. Trascina una voce in un modulo (o usa la tendina
«sposta in…», che fa la stessa cosa da tastiera). Di ogni modulo si sceglie <b>icona, titolo, colonne, altezza, fondo,
colore del testo e bordo</b>; di ogni voce si riscrive l'<b>etichetta</b> e — per i campi — la <b>larghezza</b>. I moduli si
riordinano con la maniglia ⠿ o con le frecce. ⚠️ Una voce che resta nell'<b>inventario</b> non viene montata:
quell'opzione sparisce dall'interfaccia e la pipeline usa il suo default. È così che erano spariti i preset.</p>

<p class="lead"><b>Gli STRUMENTI</b> (5/8) — i quattro gruppi <i>Fonti · Contenuto · Motore · Apri</i>
dell'inventario sono le funzioni che la <b>vista compatta nasconde</b>: le altre quattro fonti, le macro-aree a
mano, il focus, le lenti, il picker disciplina, «adatta al livello», multi-pass, la logica della profondità,
«genera fino a», la pipeline A/B, la stima dei costi, Apri Vault, Apri JSON, Analisi (docente), Dev self-test.
Finché stavano solo in un blocco CSS di nascondimenti non si potevano nemmeno discutere; da qui si trascinano in
un modulo come ogni altra voce, e appaiono nel bento sotto le righe.
⚠️ Un modulo-strumento accoglie l'<b>elemento vero</b>, spostato dal suo posto nel form: <b>non</b> una copia.
Un toggle clonato sarebbe un secondo controllo per lo stesso stato, che divergerebbe al primo clic — la stessa
ragione per cui il tema centrale e lo slider dei nodi sono stati spostati, non ridisegnati. Conseguenza da
sapere: l'elemento esce dal suo posto storico <b>anche nella vista piena</b>. Una casa sola per ogni controllo.
Nell'anteprima qui sotto uno strumento si mostra come il posto che occuperà, col nome della funzione e il
selettore: il banco serve a decidere <b>dove</b> va, non a simulare il controllo.</p>

<div class="bn-cmd">
  <button type="button" id="bn-nuovo" class="bn-b">+ Nuovo modulo</button>
  <button type="button" id="bn-json" class="bn-b">Mostra il JSON</button>
  <button type="button" id="bn-reset" class="bn-b bn-b--ko">Torna alla composizione di partenza</button>
  <span class="bn-nota">Le modifiche si applicano subito all'app: <code>localStorage.mappai_bento_layout</code>.
    Per renderle definitive, incolla il JSON in <code>public/js/mappai-bento-composizione.js</code> (era
    indicato un percorso sbagliato). ⚠️ Il banco riparte dalla composizione del <b>codice</b> quando questa
    cambia — id, ordine, colonne, altezze o voci: il lavoro che avevi in corso non si perde, viene messo da
    parte e un bottone lo riprende. Serve a non ritoccare per mezz'ora una versione vecchia credendo che le
    correzioni non arrivino.</span>
</div>
<textarea id="bn-out" class="bn-out" style="display:none" spellcheck="false" aria-label="JSON della composizione"></textarea>

<!-- Le due righe SOPRA il bento (5/8). Stavano impaginate con due numeri scritti
     nel CSS (340px | 1fr), quindi «due colonne» non voleva dire niente e non si
     poteva ritoccare qui come tutto il resto. Ora sono un dato in
     MappAIBento.RIGHE e usano la STESSA griglia del bento, così le colonne si
     allineano ai riquadri sotto.
     ATTENZIONE: questo markup vive in un template literal di build.js — niente
     backtick e niente interpolazioni qui dentro, o la stringa si chiude a metà
     (ci sono cascato scrivendo proprio questo avvertimento). -->
<h3 class="bn-h4" style="margin-top:22px">Le righe sopra il bento <span class="n">— stessa griglia a 4 colonne</span></h3>
<p class="lead" style="margin-top:4px">COSTRUISCI non è solo il bento: sopra ci sono la riga delle <b>fonti</b>
(bottoni | elenco dei file) e quella del <b>genere</b> (Mappa/Knowledge Graph | tema centrale oppure slider dei nodi).
Gli span devono <b>chiudere le quattro colonne</b>: se non le chiudono resta del bianco a destra — è il difetto da cui
questo dato è nato. <code>vuoto</code> = quante colonne prende la parte sinistra quando la destra non ha ancora niente
da dire (senza file i bottoni si distendono, altrimenti restano due colonne di bianco).</p>
<div id="bn-righe" class="bn-inv" style="margin-bottom:6px"></div>

<div class="bn-wrap">
  <div class="bn-col1">
    <h3 class="bn-h4">Inventario <span class="n">— non montate</span></h3>
    <div id="bn-inventario" class="bn-inv"></div>
    <h3 class="bn-h4">Diagnosi</h3>
    <div id="bn-diagnosi"></div>
  </div>
  <div class="bn-col2">
    <h3 class="bn-h4">Composizione <span class="n">— trascina qui</span></h3>
    <div id="bn-griglia" class="bn-griglia"></div>
    <h3 class="bn-h4">Anteprima <span class="n">— classi vere dell'app</span></h3>
    <div id="bn-preview" class="bn-preview manifesto"></div>
  </div>
</div>

<h2 id="uscita">6. Uscita</h2>
<div class="out-h"><h3 style="margin:0">CSS dei token</h3><button class="copia" data-copia="out-css">Copia</button></div>
<pre class="out" id="out-css"></pre>
<div class="out-h"><h3 style="margin:0">Schema dell'archetipo selezionato</h3><button class="copia" data-copia="out-schema">Copia</button>
  <span style="font-size:11px;color:#94a3b8">questo è ciò che si scrive nel codice per aprire quel modale</span></div>
<pre class="out" id="out-schema"></pre>
<div class="out-h"><h3 style="margin:0">Verdetti</h3><button class="copia" data-copia="out-verdetti">Copia</button>
  <span style="font-size:11px;color:#94a3b8">i giudizi del §0 e del §4 — da salvare nel repo quando la procedura è finita</span></div>
<pre class="out" id="out-verdetti"></pre>
<div class="out-h"><h3 style="margin:0">Assegnazioni</h3><button class="copia" data-copia="out-assegna">Copia</button>
  <span style="font-size:11px;color:#94a3b8">superficie → gruppo di stile (§5)</span></div>
<pre class="out" id="out-assegna"></pre>

</div>

<script>
  window.MM_ARCHETIPI = ${JSON.stringify(ARCHETIPI)};
  window.MM_VERD_ITEMS = ${JSON.stringify(VERD_ITEMS)};
  window.MM_REGISTRO = ${JSON.stringify(REGISTRO)};
  window.MM_GRUPPI = ${JSON.stringify(GRUPPI)};
</script>
<script src="../js/mappai-bento-composizione.js?v=${v}"></script>
<script src="officina-bento.js?v=${v}"></script>
<script src="officina.js?v=${v}"></script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
console.log('scritto:', path.relative(ROOT, OUT));
console.log('  archetipi:', ARCHETIPI.length, '· istanze assegnate:', nIstanze);
console.log('  censiti: statici', CENS.statici.length, '· dinamici', CENS.dinamici);
console.log('  statici coperti per nome:', coperti.length, '· scoperti:', scoperti.length, scoperti.join(' '));
console.log('  verdetti da dare:', VERD_ITEMS.length,
    '(bottoni', FAMIGLIE.bottoni.length, '· campi', FAMIGLIE.campi.length,
    '· superfici', SUPERFICI.length, '· icone', ICONE.length, '· finestre', FINESTRE.length + ')');
console.log('  registro assegnazioni:', REGISTRO.length, 'superfici ·', REGISTRO.filter(r => r.pre).length, 'preassegnate');
