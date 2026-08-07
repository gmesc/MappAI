#!/usr/bin/env node
/* ROTTA UI — la regia del riordino
 *
 *   node tools/officina/rotta.js   →   public/dev/rotta-ui.html
 *
 * La pagina che risponde a «mi sento perso»: NON un quarto strumento di
 * lavoro, ma il posto che tiene insieme gli altri tre (campionario ·
 * officina · mockup console) e mette le decisioni IN FILA.
 *
 * Tre fonti, tutte nel repo:
 *   - tools/officina/audit-ui-dati.json — l'audit integrale del 31/7
 *     (8 lenti in parallelo, 95 finding, numeri riverificati da un
 *     controllore scettico: 82/86 confermati, 4 corretti)
 *   - tools/officina/{archetipi,famiglie,finestre}.js — lo stato del sistema
 *   - localStorage (a runtime): avanzamento di verdetti e assegnazioni
 *     dell'officina, e delle decisioni di questa pagina.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public/dev/rotta-ui.html');

const AUDIT = require('./audit-ui-dati.json');
const ARCHETIPI = require('./archetipi.js');
const FAMIGLIE = require('./famiglie.js');
const FINESTRE = require('./finestre.js');

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const nFinding = AUDIT.audits.reduce((a, x) => a + x.findings.length, 0);
const nAlta = AUDIT.audits.reduce((a, x) => a + x.findings.filter(f => f.gravita === 'alta').length, 0);
const vEsiti = (AUDIT.verifica && AUDIT.verifica.esiti) || [];
const vOk = vEsiti.filter(e => e.ok).length;
const nVerdetti = FAMIGLIE.bottoni.length + FAMIGLIE.campi.length + 2 + 3 + FINESTRE.length;

/* ══════════════════════════════════════════════════════════════════════════
   LA CODA DELLE DECISIONI — il cuore della pagina.
   Ogni voce: cosa si decide, il consiglio del designer, dove si decide,
   cosa sblocca. L'ordine È il percorso: si parte dall'alto.
   ══════════════════════════════════════════════════════════════════════════ */
const CODA = [
    {
        fase: 'FASE 1 — Fondamenta ✓ CHIUSA il 31/7 (spunta pure le cinque righe)',
        voci: [
            {
                id: 'verdetti', titolo: 'Dare i ' + nVerdetti + ' verdetti sull\'esistente',
                consiglio: 'DECISA il 31/7 — 22/22 verdetti dati e salvati in tools/officina/verdetti-2026-07-31.json. Tutti i bottoni convergono su mm-btn, tutti i campi su mm-campo (COMPRESA la landing), barre → --mm-bar-*, topbar stampati → --mm-doc-*, player → --mm-player-*. w-fuori invalidato: pagine studente e voxel rientreranno in una fase futura.',
                dove: 'officina.html#verdetti', doveNome: 'Officina §0 + §4',
                sblocca: 'Il piano di migrazione con un perimetro finito: senza verdetti, ogni modale nuovo continua a nascere fuori standard.'
            },
            {
                id: 'bordo', titolo: 'Il bordo dei campi (oggi 1,23:1 — non si percepisce)',
                consiglio: 'DECISA il 31/7 — bordo INVISIBILE per scelta: il campo si riconosce dal riempimento (grigio su fondo bianco, bianco nei riquadri), dal raggio e dall\'anello di fuoco; l\'errore resta col bordo rosso. Applicata in mappai-modal-tokens.css; nella verifica paletta il bordo è ora decorativo.',
                dove: 'officina.html#fondamentali', doveNome: 'Officina §1 (picker Bordo)',
                sblocca: 'mm-campo definitivo. È il difetto che l\'officina stessa ha trovato per prima.'
            },
            {
                id: 'corpo-btn', titolo: 'Corpo dei bottoni: 12px → 13px + padding 12',
                consiglio: 'DECISA il 31/7 — corpo 14px (scelto da Giacomo nell\'officina) + padding verticale 13: bersaglio ~45px, sopra il minimo 44 per iPad. Applicata: --mm-btn-fs 14 e --mm-btn-pad-y 13 nei token.',
                dove: 'officina.html#fondamentali', doveNome: 'Officina §1 (slider Corpo bottone)',
                sblocca: 'mm-btn definitivo → passo ③ del campionario (pensionamento btn_salva/btn_annulla).'
            },
            {
                id: 'etichette', titolo: 'Etichette dei campi: RIAPRIRE la decisione 4 (segnaposto → sopra)',
                consiglio: 'DECISA il 31/7 — solo segnaposto CONFERMATA, con la regola di accompagnamento: un gruppo di 2+ campi porta il TITOLO di sezione, che resta leggibile anche a campi compilati. Il core ora emette un avviso se manca.',
                dove: 'officina.html#fondamentali', doveNome: 'Officina §1 (le tre aperte)',
                sblocca: 'La forma definitiva di ogni form. Da qui in poi i campi non si toccano più.'
            },
            {
                id: 'icone', titolo: 'Icone: ratificare 20 corpo / 22 testata',
                consiglio: 'DECISA il 31/7 — 20px nei bottoni e nel corpo, 24px in testata. Applicata: --mm-icona 20 / --mm-icona-head 24; le icone nei bottoni non sono più ridotte all\'80%.',
                dove: 'officina.html#verdetti', doveNome: 'Officina §0 passo 4',
                sblocca: 'Chiude l\'ultima divergenza del 29/7.'
            }
        ]
    },
    {
        fase: 'FASE 2 — Architettura (le console: dove vivono le cose)',
        voci: [
            {
                id: 'console-abc', titolo: 'Quante console: A (unica) · B (tre tematiche) · C (dentro modale)',
                consiglio: 'B. Misurato: A e B identiche (0 troncature), C taglia le celle. Ma A mette 16 voci in sidebar — il gestionale che spaventa il docente poco esperto, l\'opposto dell\'asciugatura fatta finora. B tiene ogni sidebar a 6 voci e converge verso A gratis, se un giorno servirà.',
                dove: 'console-mockup.html#v-b-registro', doveNome: 'Mockup gruppi A/B/C',
                sblocca: 'La casa di Registro (classi/allievi), Documenti e AI/consumi.'
            },
            {
                id: 'console-d', titolo: 'Il menu esporta/esci: D1 (griglia) o D2 (dominio + prodotti)',
                consiglio: 'D2. La griglia (D1) è solo un menu più grosso; il valore vero della console è affiancare le AZIONI ai DOCUMENTI GIÀ PRODOTTI — la vista che il menu di oggi non può dare. Il bottone della mappa apre la console sul dominio più usato; «Annulla» e «Home» stanno nel piè, sempre nello stesso posto.',
                dove: 'console-mockup.html#v-d2-mappa', doveNome: 'Mockup gruppo D',
                sblocca: 'Il pensionamento del floating-actions-menu e dei 3 hub-card che apre.'
            },
            {
                id: 'console-e', titolo: 'La «Cabina» per i 4 bottoni dell\'header della landing',
                consiglio: 'Sì. Risolve tre finding in un colpo: i 4 bottoni solo-icona senza nome accessibile (le voci di navigazione i nomi ce li hanno), config-ai-modal orfano, e consumi+config separati che parlano della stessa spesa. Guida e Tutorial diventano voci, non bottoni.',
                dove: 'console-mockup.html#v-e1-cabina', doveNome: 'Mockup gruppo E',
                sblocca: 'Header della landing: da 4 icone mute a 1 ingresso con nome.'
            },
            {
                id: 'assegnazioni', titolo: 'Completare le assegnazioni (ogni superficie una casa)',
                consiglio: 'Con le console decise restano ~5 righe dubbie su 95 (study-config → Cabina/tips, i fuori-perimetro da confermare). Dieci minuti di tendine.',
                dove: 'officina.html#assegnazioni', doveNome: 'Officina §5',
                sblocca: 'Il perimetro FINITO della migrazione: da qui è solo esecuzione.'
            }
        ]
    },
    {
        fase: 'FASE 3 — Esecuzione (non richiede decisioni: ordine di lavoro proposto)',
        voci: [
            {
                id: 'adozione', titolo: 'Accendere il motore: primi 6 overlay della landing su Modal.open',
                consiglio: 'Il motore ha 0 chiamanti (audit): il contratto tastiera esiste ma nessuno lo usa. Primi casi: i 6 overlay di landing-teach (pickClass, pickMap, pickDoc, editGrade…) che oggi non ripristinano il fuoco e non hanno trap. Nel passaggio: t() nel motore (oggi «Annulla»/«Salva» sono hardcoded — finding i18n).',
                dove: 'officina.html#cantiere', doveNome: 'Cantiere (archetipi pronti)', sblocca: ''
            },
            {
                id: 'pensionamento', titolo: 'Pensionare le famiglie invalidate + CTA landing su indigo',
                consiglio: 'btn_salva/btn_annulla/pm-btn → mm-btn; le due CTA della landing (oggi emerald 1,92:1 + blu) su indigo; via i 18 tracking-[0.2em] e l\'uppercase dalle famiglie; veli unificati su --mm-velo (oggi 6 varianti).',
                dove: '', doveNome: '', sblocca: ''
            },
            {
                id: 'finestre-token', titolo: 'Token delle finestre: --mm-doc-* · --mm-bar-* · --mm-player-*',
                consiglio: 'La topbar di stampa è clonata in 13 file con 3 glifi stampante diversi e 4 etichette diverse: UNA printBar condivisa (esiste già come API in MappAIQuizPrint), icone lucide, accento unico, Space Mono anche in barra. Player: bersagli da 20px a 44px — lo usano gli studenti sul telefono.',
                dove: 'officina.html#finestre', doveNome: 'Officina §4', sblocca: ''
            },
            {
                id: 'a11y', titolo: 'A11y trasversale: fuoco visibile, nomi, micro-testi',
                consiglio: ':focus-visible globale (oggi i soli 3 selettori esistenti lo SOPPRIMONO); aria-label sui 26 bottoni solo-icona; micro-testi 9-10px delle tabelle a ≥11px; text-slate-400 (2,56:1, 106 usi) → slate-500+. Per un\'app BES/DSA questa è sostanza, non compliance.',
                dove: '', doveNome: '', sblocca: ''
            },
            {
                id: 'css', titolo: 'Pulizia CSS: prima il morto, poi la guerra',
                consiglio: 'Subito: ~107 righe di #projects-bar (elemento rimosso il 12/7), regole vuote, z-index in scala (oggi fino a 2147483647). Poi, progressivamente, i 713 !important (59% delle dichiarazioni): si sgonfiano DA SOLI man mano che le superfici migrano ai token — non è un progetto a parte, è l\'effetto della migrazione.',
                dove: '', doveNome: '', sblocca: ''
            }
        ]
    }
];

/* quick wins dall'audit: correzioni senza decisione di design */
const QUICK = [
    { t: 'Radio del motore: il campo `gruppo` veniva scartato → tutti i radio nello stesso gruppo', stato: 'fatto', nota: 'corretto il 31/7 + test di regressione' },
    { t: '«File condivisi» orfano: renderSharedMat cerca un contenitore che refresh() non crea più (~110 righe a vuoto)', stato: 'da-fare', nota: 'decidere: reintegro come modale elenco, o rimozione' },
    { t: 'aria-label + data-tip sui 4 bottoni header della landing', stato: 'da-fare', nota: 'MappAITips esiste già; ponte verso la Cabina' },
    { t: 'Refuso «Apri Vault Vault Markdown» · «Resetta»/«Azzera» nello stesso pannello · chiave btn_new_project che mostra «Nuovo Grafo»', stato: 'da-fare', nota: 'copy, 10 minuti' },
    { t: '4 chiavi t() dei moduli del 29/7 mancanti da en_translations.js', stato: 'da-fare', nota: 'regola 13' },
    { t: 'confirmDeleteText anche nel cestino di pickDoc (oggi conferma generica)', stato: 'da-fare', nota: 'coerenza con la regola §10.15' },
    { t: 'PIN/ATTR: maiuscolo cablato senza data-i18n, «ATTR» opaco per il target', stato: 'da-fare', nota: 'rinominare + tradurre' }
];

/* ══════════════════════════════════════════════════════════════════════════ */
const grBadge = g => '<span class="gr ' + g + '">' + g + '</span>';

const auditHtml = AUDIT.audits.map((a, i) => {
    const alte = a.findings.filter(f => f.gravita === 'alta').length;
    return `<details class="lente"${alte >= 4 ? ' open' : ''}>
  <summary><b>${esc(a.area.split('—')[0].trim())}</b>
    <span class="conta">${a.findings.length} finding · ${alte} alta</span></summary>
  ${a.findings.map(f => `<div class="find g-${f.gravita}">
     ${grBadge(f.gravita)}
     <div class="find-t">
       <p class="claim">${esc(f.claim)}</p>
       <p class="evid">${esc(f.evidenza)}</p>
       <p class="prop">→ ${esc(f.proposta)}</p>
     </div></div>`).join('')}
</details>`;
}).join('\n');

const codaHtml = CODA.map(fase => `
  <h3 class="fase">${esc(fase.fase)}</h3>
  ${fase.voci.map(v => `<div class="dec" data-dec="${v.id}">
    <label class="dec-check"><input type="checkbox" data-dec-box="${v.id}"><span></span></label>
    <div class="dec-corpo">
      <p class="dec-t">${esc(v.titolo)}</p>
      <p class="dec-c"><b>Consiglio:</b> ${esc(v.consiglio)}</p>
      ${v.doveNome ? `<p class="dec-dove">Si decide in: <a href="${esc(v.dove)}">${esc(v.doveNome)}</a>${v.sblocca ? ' · <b>sblocca:</b> ' + esc(v.sblocca) : ''}</p>` : (v.sblocca ? `<p class="dec-dove"><b>sblocca:</b> ${esc(v.sblocca)}</p>` : '')}
    </div></div>`).join('')}`).join('\n');

const page = `<!DOCTYPE html>
<html lang="it"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Rotta UI — la regia del riordino</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<style>
  :root { --emoji-font:'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif; }
  * { font-family:'Space Mono', var(--emoji-font), monospace; box-sizing:border-box; }
  body { margin:0; background:#eef1f6; color:#0f172a; }
  .wrap { max-width:1000px; margin:0 auto; padding:0 22px 90px; }
  header.top { position:sticky; top:0; z-index:60; background:rgba(238,241,246,.96);
    backdrop-filter:blur(8px); border-bottom:1px solid #d7dde7; padding:13px 0 11px; margin-bottom:20px; }
  header.top .wrap { padding-bottom:0; }
  h1 { font-size:23px; margin:0 0 3px; }
  .sub { font-size:12px; color:#64748b; margin:0 0 9px; line-height:1.6; }
  nav a { font-size:11.5px; font-weight:700; color:#475569; text-decoration:none; background:#fff;
    border:1px solid #d7dde7; border-radius:999px; padding:5px 11px; margin-right:6px; display:inline-block; margin-bottom:4px; }
  nav a:hover { border-color:#4f46e5; color:#4f46e5; }
  h2 { font-size:18px; margin:36px 0 6px; }
  h2 .n { color:#94a3b8; font-weight:400; font-size:13px; }
  .lead { font-size:12.5px; color:#475569; line-height:1.7; max-width:82ch; margin:0 0 14px; }
  .card { background:#fff; border:1px solid #dbe1ea; border-radius:14px; padding:14px 16px; margin-bottom:12px; }

  /* bussola */
  .strum { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }
  .strum a.s { display:block; background:#fff; border:1px solid #dbe1ea; border-radius:12px;
    padding:12px 14px; text-decoration:none; color:inherit; }
  .strum a.s:hover { border-color:#4f46e5; }
  .strum b { font-size:12.5px; color:#0f172a; }
  .strum p { font-size:11px; color:#64748b; line-height:1.55; margin:5px 0 0; }
  .viva { font-size:11px; color:#64748b; margin-top:6px; }
  .viva b { color:#4f46e5; }

  /* audit */
  .stat { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
  .stat .t { background:#fff; border:1px solid #dbe1ea; border-radius:12px; padding:10px 16px; }
  .stat .t b { display:block; font-size:20px; }
  .stat .t span { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; }
  details.lente { background:#fff; border:1px solid #dbe1ea; border-radius:14px; margin-bottom:10px; overflow:hidden; }
  details.lente summary { cursor:pointer; padding:12px 15px; font-size:13px; display:flex; gap:10px;
    align-items:baseline; flex-wrap:wrap; list-style:none; }
  details.lente summary::-webkit-details-marker { display:none; }
  details.lente summary:before { content:'▸'; color:#94a3b8; }
  details.lente[open] summary:before { content:'▾'; }
  .conta { font-size:11px; color:#94a3b8; margin-left:auto; }
  .find { display:flex; gap:10px; padding:10px 15px; border-top:1px solid #f1f5f9; align-items:flex-start; }
  .gr { flex:0 0 auto; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
    border-radius:999px; padding:2px 8px; margin-top:2px; }
  .gr.alta { background:#fee2e2; color:#b91c1c; } .gr.media { background:#fef3c7; color:#a16207; }
  .gr.bassa { background:#f1f5f9; color:#64748b; }
  .claim { font-size:12px; line-height:1.6; margin:0 0 3px; }
  .evid { font-size:10px; color:#94a3b8; margin:0 0 3px; line-height:1.5; }
  .prop { font-size:11px; color:#047857; margin:0; line-height:1.55; }
  body.solo-alta .find:not(.g-alta) { display:none; }
  .mini { background:#fff; border:1px solid #d7dde7; border-radius:999px; padding:5px 12px;
    font-size:11.5px; font-weight:700; color:#475569; cursor:pointer; }
  .mini.on { border-color:#4f46e5; color:#4f46e5; background:#eef2ff; }

  /* coda */
  .fase { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; margin:24px 0 8px; }
  .dec { display:flex; gap:12px; background:#fff; border:1px solid #dbe1ea; border-radius:14px;
    padding:13px 15px; margin-bottom:9px; align-items:flex-start; }
  .dec.decisa { opacity:.55; }
  .dec.decisa .dec-t { text-decoration:line-through; }
  .dec-check input { width:18px; height:18px; accent-color:#4f46e5; margin-top:2px; cursor:pointer; }
  .dec-t { font-size:13px; font-weight:700; margin:0 0 5px; }
  .dec-c { font-size:11.5px; color:#475569; line-height:1.65; margin:0 0 5px; }
  .dec-dove { font-size:11px; color:#94a3b8; margin:0; line-height:1.6; }
  .dec-dove a { color:#4f46e5; font-weight:700; }
  .avanz { height:8px; background:#e2e8f0; border-radius:999px; overflow:hidden; margin:8px 0 4px; }
  .avanz div { height:100%; background:#4f46e5; width:0; transition:width .3s; }

  /* quick wins */
  .qw { display:flex; gap:10px; padding:8px 0; border-bottom:1px solid #f1f5f9; font-size:11.5px;
    line-height:1.6; align-items:flex-start; }
  .qw:last-child { border-bottom:0; }
  .qw .st { flex:0 0 auto; font-size:9px; font-weight:700; text-transform:uppercase; border-radius:999px;
    padding:2px 8px; margin-top:2px; }
  .qw .st.fatto { background:#d1fae5; color:#047857; } .qw .st.da-fare { background:#f1f5f9; color:#64748b; }
  .qw .nota { color:#94a3b8; }
</style></head><body>

<header class="top"><div class="wrap">
  <h1>Rotta UI — la regia del riordino</h1>
  <p class="sub">Audit del ${esc(AUDIT.data || '2026-07-31')}: 8 lenti in parallelo, ${nFinding} finding,
  numeri riverificati (${vOk}/${vEsiti.length} confermati). Questa pagina non è un altro strumento:
  tiene in fila gli strumenti che esistono già e le decisioni da prendere, dall'alto verso il basso.</p>
  <nav>
    <a href="#bussola">1 · Bussola</a><a href="#audit">2 · Audit</a>
    <a href="#coda">3 · La coda delle decisioni</a><a href="#quick">4 · Quick wins</a>
  </nav>
</div></header>

<div class="wrap">

<h2 id="bussola">1. La bussola <span class="n">— cosa esiste e a cosa serve</span></h2>
<p class="lead">Quattro pagine, quattro mestieri. Se ti chiedi «dove si fa X», la risposta è qui.</p>
<div class="strum">
  <a class="s" href="campionario-modali.html"><b>Campionario</b>
    <p>La FOTOGRAFIA: i 69 modali di oggi resi col CSS vero, le divergenze misurate. Si consulta, non si decide.</p></a>
  <a class="s" href="officina.html"><b>Officina</b>
    <p>Il BANCO: qui si DECIDE — verdetti sull'esistente (§0/§4), token col picker (§1), archetipi col motore vero (§3), assegnazioni (§5), JSON in uscita (§6).</p>
    <p class="viva" id="viva-officina">…</p></a>
  <a class="s" href="console-mockup.html"><b>Mockup console</b>
    <p>Il CONFRONTO: 9 varianti di console alle larghezze vere, misurate. Si sceglie A/B/C, D1/D2, E.</p></a>
  <a class="s" href="rotta-ui.html"><b>Rotta (questa pagina)</b>
    <p>La REGIA: l'audit, l'ordine delle decisioni, l'avanzamento. Quando tutto qui sotto è spuntato, il riordino è deciso e resta solo l'esecuzione.</p></a>
</div>

<h2 id="audit">2. L'audit <span class="n">— ${nFinding} finding, ${nAlta} di gravità alta</span></h2>
<div class="stat">
  <div class="t"><b>${nFinding}</b><span>finding</span></div>
  <div class="t"><b>${nAlta}</b><span>gravità alta</span></div>
  <div class="t"><b>${vOk}/${vEsiti.length}</b><span>numeri confermati</span></div>
  <div class="t"><b>713</b><span>!important in style.css</span></div>
  <div class="t"><b>0</b><span>modali già sui token mm-*</span></div>
</div>
<p class="lead">Il quadro in una frase: <b>le decisioni giuste sono già state prese, ma vivono solo nei
token</b> — il codice reale le contraddice ancora quasi ovunque (colori d'azione, maiuscolo, veli,
bersagli, fuoco da tastiera). Il problema non è disegnare: è che la migrazione non è ancora partita
e ogni superficie nuova nasce fuori standard. Da qui l'ordine della coda in §3.
<button class="mini" id="btn-solo-alta" style="margin-left:8px">solo gravità alta</button></p>
${auditHtml}
<p class="lead" style="margin-top:10px">Nota di metodo: 4 numeri sono stati corretti dal verificatore
(fra cui lo z-index massimo, che non è 999999 ma <b>2147483647</b> sulla lente d'ingrandimento).
I dati grezzi sono in <code>tools/officina/audit-ui-dati.json</code>.</p>

<h2 id="coda">3. La coda delle decisioni <span class="n">— in ordine: si parte dall'alto</span></h2>
<p class="lead">Ogni riga: la decisione, il mio consiglio, il posto dove si decide guardando (mai al buio).
La spunta è tua e resta su questa macchina. Fase 1 e 2 sono DECISIONI (tue); la fase 3 è esecuzione (mia),
elencata perché tu veda dove porta.</p>
<div class="card"><b>Avanzamento:</b> <span id="dec-stato">—</span>
  <div class="avanz"><div id="dec-barra"></div></div></div>
${codaHtml}

<h2 id="quick">4. Quick wins <span class="n">— correzioni senza decisione di design</span></h2>
<div class="card">
${QUICK.map(q => `<div class="qw"><span class="st ${q.stato}">${q.stato.replace('-', ' ')}</span>
  <span>${esc(q.t)} <span class="nota">· ${esc(q.nota)}</span></span></div>`).join('')}
</div>

</div>

<script>
(function(){
  'use strict';
  /* filtro gravità */
  var b = document.getElementById('btn-solo-alta');
  b.addEventListener('click', function(){
    document.body.classList.toggle('solo-alta');
    b.classList.toggle('on');
  });

  /* spunte della coda — localStorage, come i verdetti dell'officina */
  var KEY = 'rotta_stato';
  var S = {}; try { var r = localStorage.getItem(KEY); if (r) S = JSON.parse(r) || {}; } catch(e){}
  var boxes = [].slice.call(document.querySelectorAll('[data-dec-box]'));
  function stato(){
    var n = boxes.filter(function(x){ return x.checked; }).length;
    document.getElementById('dec-stato').textContent = n + ' su ' + boxes.length + ' decise';
    document.getElementById('dec-barra').style.width = (boxes.length ? Math.round(n/boxes.length*100) : 0) + '%';
  }
  boxes.forEach(function(x){
    var id = x.getAttribute('data-dec-box');
    x.checked = !!S[id];
    x.closest('.dec').classList.toggle('decisa', x.checked);
    x.addEventListener('change', function(){
      S[id] = x.checked;
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){}
      x.closest('.dec').classList.toggle('decisa', x.checked);
      stato();
    });
  });
  stato();

  /* avanzamento vivo dell'officina (stessa origine → stesso localStorage) */
  try {
    var v = JSON.parse(localStorage.getItem('officina_verdetti') || '{}');
    var dati = Object.keys(v).filter(function(k){ return v[k] && v[k].esito; }).length;
    var a = JSON.parse(localStorage.getItem('officina_assegnazioni') || '{}');
    document.getElementById('viva-officina').innerHTML =
      'Adesso: <b>' + dati + '/${nVerdetti}</b> verdetti dati · <b>' + Object.keys(a).length + '</b> assegnazioni toccate';
  } catch(e){}
})();
</script>
</body></html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
console.log('scritto:', path.relative(ROOT, OUT));
console.log('  finding:', nFinding, '· alta:', nAlta, '· numeri verificati:', vOk + '/' + vEsiti.length);
console.log('  decisioni in coda:', CODA.reduce((a, f) => a + f.voci.length, 0), '· quick wins:', QUICK.length);
