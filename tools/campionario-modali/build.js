#!/usr/bin/env node
/* Campionario modali MappAI — generatore
 *
 *   node tools/campionario-modali/build.js
 *   → public/dev/campionario-modali.html
 *
 * Cosa fa:
 *  1. legge i modali STATICI direttamente da public/index.html (markup vero,
 *     copiato, non riscritto) e li neutralizza per mostrarli in pagina;
 *  2. aggiunge i campioni DINAMICI trascritti in samples-dinamici.js;
 *  3. scandisce index.html + public/js/*.js e produce le tabelle di audit
 *     (larghezze, sfondo, ESC/Invio, bottoni) con file:riga verificabile.
 *
 * Rigenerabile: se cambia un modale, si rilancia lo script.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'public/index.html');
const JSDIR = path.join(ROOT, 'public/js');
const OUT = path.join(ROOT, 'public/dev/campionario-modali.html');

const html = fs.readFileSync(INDEX, 'utf8');
/* La cache del browser è un bugiardo: se style.css cambia e la pagina serve la
   copia vecchia, il campionario mostra misure che sul disco non esistono più.
   Il marcatore viene dal mtime dei fogli → cambia solo quando cambiano loro. */
const vCss = [
    path.join(ROOT, 'public/css/style.css'),
    path.join(ROOT, 'public/css/mappai-modal-tokens.css')
].map(f => { try { return Math.round(fs.statSync(f).mtimeMs); } catch (e) { return 0; } }).join('-');
const lines = html.split('\n');

/* ── contenitori che il grep prende ma che modali NON sono ─────────────── */
const NOT_MODALS = new Set([
    'source-modal-header', 'source-modal-icon', 'source-modal-kinship',
    'modal-a11y-toolbar', 'study-modal-content', 'guide-modal-content',
    'merge-modal-description', 'source-modal-content-box', 'ai-modal-content-box',
    'quiz-modal-content'
]);

/* ── 1. estrazione blocchi statici ─────────────────────────────────────── */
function extractStatic() {
    const found = [];
    lines.forEach((ln, i) => {
        const m = ln.match(/<div\s+id="([a-zA-Z0-9_-]*(?:modal|overlay)[a-zA-Z0-9_-]*)"/);
        if (!m || NOT_MODALS.has(m[1])) return;
        const indent = ln.match(/^\s*/)[0].length;
        let end = lines.length - 1;
        for (let j = i + 1; j < lines.length; j++) {
            const l = lines[j];
            if (!l.trim()) continue;
            const ind = l.match(/^\s*/)[0].length;
            if (ind === indent && /^\s*<\/div>/.test(l)) { end = j; break; }
            if (ind <= indent && /<div\s+id="/.test(l)) { end = j - 1; break; }
        }
        const raw = lines.slice(i, end + 1).join('\n');
        found.push({ id: m[1], line: i + 1, raw, meta: metaOf(raw) });
    });
    return found;
}

function metaOf(block) {
    const widths = [...new Set([...block.matchAll(/max-w-\[?([a-z0-9.%]+)\]?/g)].map(x => x[1]))];
    const z = (block.match(/z-\[?(\d+)\]?/) || [])[1] || null;
    return {
        widths,
        z,
        backdrop: (block.match(/bg-(?:black|slate-900)\/\d+/) || [])[0] || '—',
        blur: /backdrop-blur/.test(block),
        radius: [...new Set([...block.matchAll(/rounded-(3xl|2xl|xl|lg|md)/g)].map(x => x[1]))],
        pm: (block.match(/class="pm-|class="[^"]*\bpm-/g) || []).length,
        campi: (block.match(/<input|<textarea|<select/g) || []).length,
        bottoni: [...new Set([...block.matchAll(/class="(btn_[a-z_0-9]+|pm-btn-[a-z]+)/g)].map(x => x[1]))]
    };
}

/* neutralizza il blocco perché si veda IN PAGINA senza essere un overlay */
function neutralize(raw) {
    const nl = raw.indexOf('>');
    let head = raw.slice(0, nl + 1);
    let rest = raw.slice(nl + 1);
    head = head.replace(/class="([^"]*)"/, (_, c) => {
        const keep = c.split(/\s+/).filter(x =>
            !/^(hidden|fixed|inset-0|opacity-0|z-\[|z-\d|bg-black\/|bg-slate-900\/|backdrop-blur|transition-opacity|duration-\d+|p-4|p-6|min-h-screen)/.test(x));
        return 'class="' + keep.concat(['flex', 'items-center', 'justify-center', 'w-full']).join(' ') + '"';
    });
    head = head.replace(/style="[^"]*"/, '');
    let out = head + rest;
    out = out.replace(/\bscale-95\b/g, '').replace(/\bopacity-0\b/g, '');
    out = out.replace(/\bhidden\b/g, '');            // sotto-blocchi nascosti: mostrali
    out = out.replace(/style="display:\s*none[^"]*"/g, '');
    out = out.replace(/\bonclick="/g, ' data-onclick="');   // niente handler morti
    out = out.replace(/\bonchange="/g, ' data-onchange="');
    out = out.replace(/\boninput="/g, ' data-oninput="');
    out = out.replace(/\bonsubmit="/g, ' data-onsubmit="');
    out = out.replace(/\bid="/g, ' data-orig-id="');        // niente id duplicati/collisioni
    return out;
}

/* ── normalizza una larghezza in px (i token Tailwind valgono px fissi) ── */
const TW_W = {
    sm: '384px', md: '448px', lg: '512px', xl: '576px',
    '2xl': '672px', '3xl': '768px', '4xl': '896px', '5xl': '1024px'
};
function normW(w) {
    if (!w) return null;
    const s = String(w).replace(/['"+\s{}$]|\|\||\(|\)/g, '');
    if (TW_W[s]) return TW_W[s];
    const m = s.match(/(\d+(?:\.\d+)?(?:px|vw|vh|ch))/);
    return m ? m[1] : null;
}

/* ── 2. scansione overlay dinamici ─────────────────────────────────────── */
function scanDynamic() {
    const rows = [];
    for (const f of fs.readdirSync(JSDIR)) {
        if (!f.endsWith('.js')) continue;
        if (/d3\.v7|jspdf|lucide|katex|pdf\.|qrcode|three|tailwind|\.min\.js/.test(f)) continue;
        const L = fs.readFileSync(path.join(JSDIR, f), 'utf8').split('\n');
        L.forEach((ln, i) => {
            if (!/position:\s*fixed;\s*inset:\s*0|fixed inset-0|position:fixed;inset:0/.test(ln)) return;
            let fn = '?';
            for (let j = i; j >= 0 && j > i - 400; j--) {
                const fm = L[j].match(/function\s+([A-Za-z0-9_$]+)\s*\(/)
                    || L[j].match(/([A-Za-z0-9_$.]+)\s*[:=]\s*(?:async\s*)?function\s*\(/)
                    || L[j].match(/([A-Za-z0-9_$]+)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/);
                if (fm) { fn = fm[1]; break; }
            }
            const win = L.slice(Math.max(0, i - 60), Math.min(L.length, i + 260)).join('\n');
            const widths = [...new Set([
                ...[...win.matchAll(/width:\s*min\(([^,)]+)/g)].map(x => x[1].trim()),
                ...[...win.matchAll(/max-width:\s*(\d+px)/g)].map(x => x[1]),
                ...[...win.matchAll(/max-w-\[(\d+px)\]/g)].map(x => x[1])
            ])].map(w => w.replace(/^['"+\s]*|['"+\s]*$/g, '').replace(/^\$\{[^|]*\|\|\s*'?/, '').replace(/'?\}?$/, ''));
            rows.push({
                file: 'public/js/' + f, line: i + 1, fn,
                width: normW(widths[0]) || widths[0] || '—',
                esc: /'Escape'|"Escape"/.test(win),
                enter: /'Enter'|"Enter"/.test(win),
                backdrop: /e\.target\s*===\s*(ov|overlay|modal|wrap|o)\b/.test(win),
                role: /role="dialog"/.test(win),
                radius: [...new Set([...win.matchAll(/border-radius:\s*(\d+px)/g)].map(x => x[1]))][0]
                    || ([...win.matchAll(/rounded-(2xl|xl|3xl)/g)].map(x => 'rounded-' + x[1])[0] || '—'),
                bg: (win.match(/rgba\(15,\s*23,\s*42,\s*\.?\d+\)/) || win.match(/rgba\(0,\s*0,\s*0,\s*\.?\d+\)/)
                    || win.match(/bg-slate-900\/\d+/) || win.match(/bg-black\/\d+/) || ['—'])[0]
            });
        });
    }
    return rows;
}

/* ── 2-bis. frequenze dei token già usati nel codice ───────────────────── */
/* Serve a estrarre le linee guida DAI FATTI: il valore da adottare è quello che
   il codice usa già di più, non quello che sembra bello. */
function tokenStats() {
    let js = '';
    for (const f of fs.readdirSync(JSDIR)) {
        if (!f.endsWith('.js') || /d3\.v7|jspdf|lucide|katex|pdf\.|qrcode|three|tailwind|\.min\.js/.test(f)) continue;
        js += fs.readFileSync(path.join(JSDIR, f), 'utf8') + '\n';
    }
    const css = fs.readFileSync(path.join(ROOT, 'public/css/style.css'), 'utf8');
    const tutto = js + html + css;
    const conta = (re, norm) => {
        const c = {};
        for (const m of tutto.matchAll(re)) {
            const k = (norm ? norm(m) : m[1]).toLowerCase();
            if (k) c[k] = (c[k] || 0) + 1;
        }
        return Object.entries(c).sort((a, b) => b[1] - a[1]);
    };
    return {
        colori: conta(/#(4f46e5|6366f1|4338ca|818cf8|0f172a|1e293b|334155|475569|64748b|94a3b8|cbd5e1|e2e8f0|f1f5f9|f8fafc|ffffff|fff|dc2626|ef4444|f87171|059669|10b981|34d399|f59e0b|d97706|c2410c)\b/g, m => '#' + m[1]),
        raggiInline: conta(/border-radius:\s*(\d+px|9+px)/g),
        raggiTw: conta(/\brounded-(3xl|2xl|xl|lg|md|sm|full)\b/g),
        icone: conta(/width:\s*(\d+)px;\s*height:\s*\1px/g, m => m[1] + 'px'),
        corpiBtn: conta(/font-size:\s*(\d+(?:\.\d+)?)px;[^"']*font-weight:\s*[67]00/g, m => m[1] + 'px')
    };
}

/* ── 3. blocco @layer components (btn_*, pm-*, modal_title…) ───────────── */
function layerBlock() {
    const start = html.indexOf('<style type="text/tailwindcss">');
    const end = html.indexOf('</style>', start);
    return html.slice(start, end + 8);
}

/* ── 4. pagina ─────────────────────────────────────────────────────────── */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const si = b => b === true ? '<span class="ok">sì</span>'
    : b === false ? '<span class="ko">no</span>'
        : '<span class="mid">' + esc(b) + '</span>';

const statics = extractStatic();
const dynRows = scanDynamic();
const dynSamples = require('./samples-dinamici.js');
const TS = tokenStats();
const PROPOSTE = require('./proposte.js');

/* etichette leggibili per i modali statici */
const NOMI = {
    'alert-modal': 'Errore / avviso', 'source-modal': 'Scheda del nodo (fonte)',
    'prompt-modal': 'Richiesta di un valore', 'link-family-modal': 'Nuovo link — famiglia',
    'study-config-modal': 'Configura sessione di studio', 'confirm-modal': 'Conferma',
    'user-profile-modal': 'Chi sei (profilo studente)', 'feedback-modal': 'Segnalazione',
    'vault-manager-modal': 'Gestore vault', 'edit-project-title-modal': 'Modifica titolo progetto',
    'layout-manager-modal': 'Fissa layout', 'dossier-print-modal': 'Opzioni stampa dossier',
    'layout-exit-confirm-modal': 'Uscita dal layout', 'edit-node-modal': 'Modifica nodo',
    'contextual-ai-extension-modal': 'Espandi con AI', 'study-player-modal': 'Player di studio',
    'quiz-modal': 'Quiz', 'loading-overlay': 'Caricamento (overlay)', 'ai-modal': 'Tutor AI',
    'api-tutorial-modal': 'Come ottenere la chiave API', 'config-ai-modal': 'Configurazione AI',
    'app-tutorial-modal': 'Metodi di studio attivo', 'app-guide-modal': 'Guida',
    'merge-confirm-modal': 'Unisci mappa', 'validate-link-modal': 'Valida link AI'
};

/* ESC: quali statici sono in closeActiveModals (app.js) */
const appjs = fs.readFileSync(path.join(JSDIR, 'app.js'), 'utf8');
const cutStart = appjs.indexOf('window.closeActiveModals');
const escSet = new Set([...appjs.slice(cutStart, cutStart + 2600).matchAll(/id:\s*'([a-z0-9-]+)'/g)].map(x => x[1]));

const nStatic = statics.length;
const nDyn = dynRows.length;
const escStatic = statics.filter(s => escSet.has(s.id)).length;
const escDyn = dynRows.filter(r => r.esc).length;
const entDyn = dynRows.filter(r => r.enter).length;
const allW = [...new Set(statics.flatMap(s => s.meta.widths).concat(dynRows.map(r => r.width))
    .map(normW).filter(Boolean))]
    .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
const allBg = [...new Set(statics.map(s => s.meta.backdrop).concat(dynRows.map(r => r.bg)).filter(x => x !== '—'))];

const sampleCard = (o) => `
<section class="camp" id="${o.anchor}">
  <div class="camp-head">
    <div><h3>${esc(o.nome)}</h3><code>${esc(o.src)}</code></div>
    <div class="chips">
      <span class="chip">largh. ${esc(o.larghezza)}</span>
      <span class="chip">${o.esc === true ? '⌨ ESC chiude' : o.esc === false ? '⌨ ESC no' : '⌨ ESC ' + esc(o.esc)}</span>
      <span class="chip">${o.enter ? '⏎ Invio conferma' : '⏎ Invio no'}</span>
      <span class="chip">${o.backdrop ? 'sfondo chiude' : 'sfondo non chiude'}</span>
      <div class="camp-tools">
        <select class="sz" aria-label="Taglia di prova per questo modale">
          <option value="">taglia originale</option>
          <option value="440">S · 440</option><option value="600">M · 600</option>
          <option value="820">L · 820</option><option value="1160">XL · 1160</option>
        </select>
        <div class="seg seg-ver">
          <button type="button" data-v="orig" class="on">originale</button>
          <button type="button" data-v="prop">proposta</button>
        </div>
        <button type="button" class="apri">Apri come modale</button>
        <span class="reso"></span>
      </div>
    </div>
  </div>
  ${o.note ? `<p class="nota">${esc(o.note)}</p>` : ''}
  <p class="prop-nota"></p>
  <div class="palco"><div class="palco-in" style="${o.wrapStyle || ''}">${o.html}</div></div>
</section>`;

const staticCards = statics.map(s => {
    const m = s.meta;
    return sampleCard({
        anchor: 's-' + s.id,
        nome: (NOMI[s.id] || s.id) + '  ·  #' + s.id,
        src: 'public/index.html:' + s.line,
        larghezza: m.widths.map(w => normW(w) === w ? w : (w + ' = ' + (normW(w) || '?'))).join(' / ') || '—',
        esc: escSet.has(s.id),
        enter: false,
        backdrop: false,
        note: [
            m.backdrop !== '—' ? 'sfondo ' + m.backdrop + (m.blur ? ' + blur' : '') : 'nessuno sfondo dichiarato',
            'raggio ' + (m.radius.join('/') || '—'),
            'z-index ' + (m.z || '—'),
            m.campi ? m.campi + ' campi' : 'nessun campo',
            m.bottoni.length ? 'bottoni: ' + m.bottoni.join(', ') : 'bottoni ad hoc (classi Tailwind inline)',
            m.pm ? m.pm + ' classi pm-*' : null
        ].filter(Boolean).join('  ·  '),
        html: neutralize(s.raw)
    });
}).join('\n');

const dynCards = dynSamples.map(d => sampleCard({
    anchor: d.id, nome: d.nome, src: d.src, larghezza: d.larghezza,
    esc: d.esc, enter: d.enter, backdrop: d.backdrop, note: d.note,
    wrapStyle: 'max-width:' + (String(d.larghezza).match(/(\d+)px/) ? String(d.larghezza).match(/(\d+)px/)[1] + 'px' : '640px'),
    html: d.html
})).join('\n');

const tabStatica = statics.map(s => `<tr>
  <td><b>${esc(NOMI[s.id] || s.id)}</b><br><code>#${esc(s.id)}</code></td>
  <td><code>index.html:${s.line}</code></td>
  <td>${esc(s.meta.widths.map(w => normW(w) === w ? w : (w + ' (' + (normW(w) || '?') + ')')).join(' / ') || '—')}</td>
  <td>${esc(s.meta.backdrop)}${s.meta.blur ? ' +blur' : ''}</td>
  <td>${esc(s.meta.radius.join('/') || '—')}</td>
  <td>${esc(s.meta.z || '—')}</td>
  <td>${si(escSet.has(s.id))}</td>
  <td>${s.meta.campi || '—'}</td>
  <td>${esc(s.meta.bottoni.join(', ') || 'inline')}</td></tr>`).join('');

const tabDinamica = dynRows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line).map(r => `<tr>
  <td><code>${esc(r.fn)}()</code></td>
  <td><code>${esc(r.file.replace('public/js/', ''))}:${r.line}</code></td>
  <td>${esc(r.width)}</td>
  <td>${esc(r.bg)}</td>
  <td>${esc(r.radius)}</td>
  <td>${si(r.esc)}</td>
  <td>${si(r.enter)}</td>
  <td>${si(r.backdrop)}</td>
  <td>${si(r.role)}</td></tr>`).join('');

const page = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Campionario modali — MappAI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap" rel="stylesheet">
<style>:root { --emoji-font: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif; }</style>
<script src="../js/tailwind.js"></script>
<link rel="stylesheet" href="../css/style.css?v=${vCss}">
<link rel="stylesheet" href="../css/mappai-modal-tokens.css?v=${vCss}">
<script src="../js/lucide.min.js"></script>
<script src="../js/mappai-icon-style.js"></script>
${layerBlock()}
<style>
  /* — pagina del campionario (non è UI di prodotto: cornice neutra) — */
  body { background:#eef1f6; color:#0f172a; margin:0; }
  .wrap { max-width:1320px; margin:0 auto; padding:0 22px 90px; }
  header.top { position:sticky; top:0; z-index:50; background:rgba(238,241,246,.94);
    backdrop-filter:blur(8px); border-bottom:1px solid #d7dde7; padding:14px 0 12px; margin-bottom:26px; }
  header.top .wrap { padding-bottom:0; }
  h1 { font-size:26px; font-weight:700; margin:0 0 4px; letter-spacing:-.01em; }
  .sub { font-size:12.5px; color:#64748b; margin:0 0 10px; }
  nav a { font-size:11.5px; font-weight:700; color:#475569; text-decoration:none; background:#fff;
    border:1px solid #d7dde7; border-radius:999px; padding:5px 11px; margin-right:6px; display:inline-block; margin-bottom:6px; }
  nav a:hover { border-color:#4f46e5; color:#4f46e5; }
  h2 { font-size:19px; font-weight:700; margin:44px 0 6px; padding-top:10px; }
  h2 .n { color:#94a3b8; font-weight:400; font-size:14px; }
  .lead { font-size:13px; color:#475569; line-height:1.65; max-width:78ch; margin:0 0 18px; }
  .grid-num { display:grid; grid-template-columns:repeat(auto-fit,minmax(168px,1fr)); gap:10px; margin:14px 0 8px; }
  .num { background:#fff; border:1px solid #dbe1ea; border-radius:14px; padding:12px 14px; }
  .num b { display:block; font-size:24px; line-height:1.1; }
  .num span { font-size:11px; color:#64748b; }
  .num.warn b { color:#c2410c; }
  section.camp { background:#fff; border:1px solid #dbe1ea; border-radius:16px; margin:0 0 18px; overflow:hidden; }
  .camp-head { display:flex; gap:14px; justify-content:space-between; align-items:flex-start; flex-wrap:wrap;
    padding:13px 16px; border-bottom:1px solid #eef1f6; }
  .camp-head h3 { margin:0; font-size:14px; font-weight:700; }
  .camp-head code { font-size:11px; color:#64748b; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; }
  .chip { font-size:10.5px; font-weight:700; background:#f1f5f9; color:#475569; border-radius:999px; padding:3px 9px; }
  .nota { margin:0; padding:9px 16px; font-size:11.5px; color:#64748b; background:#f8fafc; border-bottom:1px solid #eef1f6; line-height:1.6; }
  .palco { background:#334155; background-image:radial-gradient(#475569 1px, transparent 1px); background-size:14px 14px;
    padding:26px; display:flex; justify-content:center; overflow:auto; }
  .palco-in { width:100%; display:flex; justify-content:center; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #dbe1ea; border-radius:14px; overflow:hidden; font-size:11.5px; }
  th { text-align:left; background:#f8fafc; color:#64748b; font-size:10px; text-transform:uppercase; letter-spacing:.07em; padding:8px 9px; border-bottom:1px solid #e2e8f0; }
  td { padding:7px 9px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
  td code { font-size:10.5px; color:#64748b; }
  .ok { color:#047857; font-weight:700; } .ko { color:#c2410c; font-weight:700; } .mid { color:#a16207; font-weight:700; }
  .scroll { overflow-x:auto; }
  .prop { background:#fff; border:1px solid #dbe1ea; border-radius:16px; padding:18px 20px; margin-bottom:14px; }
  .prop h4 { margin:0 0 8px; font-size:13.5px; font-weight:700; }
  .prop ul { margin:0; padding-left:18px; font-size:12.5px; color:#334155; line-height:1.75; }
  .prop code { background:#f1f5f9; border-radius:5px; padding:1px 5px; font-size:11.5px; }
  .demo-btn { background:#4f46e5; color:#fff; border:0; border-radius:12px; padding:11px 18px; font-weight:700; font-size:12.5px; cursor:pointer; }
  .confronto { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; margin-bottom:8px; }
  .confronto .col { background:#fff; border:1px solid #dbe1ea; border-radius:14px; padding:14px 16px 16px; }
  .col-h { font-size:11.5px; font-weight:700; color:#0f172a; margin-bottom:12px; line-height:1.5; }
  .col-h span { display:block; font-weight:400; color:#94a3b8; font-size:10.5px; margin-top:2px; }
  .col-h code { font-size:11px; }
  .misura { margin-top:9px; font-size:10.5px; color:#c2410c; font-weight:700; }
  .scoperta { background:#fff7ed; border:1px solid #fed7aa; border-radius:14px; padding:14px 16px;
    font-size:12.5px; color:#7c2d12; line-height:1.7; margin:12px 0 8px; }
  .scoperta code { background:#ffedd5; border-radius:5px; padding:1px 5px; font-size:11.5px; }
  #mis-btn { margin-top:8px; font-size:11px; color:#9a3412; }
  #mis-btn div { padding:1px 0; }

  /* ── banco di prova ─────────────────────────────────────────────────── */
  .banco { background:#fff; border:1px solid #d7dde7; border-radius:14px; padding:10px 14px 12px; margin-top:10px; }
  .banco.chiuso .banco-body { display:none; }
  .banco-h { display:flex; align-items:center; gap:10px; cursor:pointer; }
  .banco-h b { font-size:12.5px; }
  .banco-h .stato { font-size:10.5px; color:#94a3b8; font-weight:700; margin-left:auto; }
  .banco-body { display:block; margin-top:11px; }
  .fila { display:flex; flex-wrap:wrap; align-items:center; gap:10px 18px; padding:8px 0; border-top:1px solid #f1f5f9; }
  .fila:first-child { border-top:0; padding-top:2px; }
  .fila-t { flex:0 0 100%; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#4f46e5; }
  @media (min-width:1100px) { .fila-t { flex:0 0 108px; color:#94a3b8; } }
  .grp { display:flex; align-items:center; gap:7px; }
  .grp > label.tit { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#94a3b8; }
  .seg { display:inline-flex; background:#f1f5f9; border-radius:999px; padding:2px; }
  .seg button { background:none; border:0; border-radius:999px; padding:4px 10px; font-size:11px !important;
    font-weight:700; color:#64748b; cursor:pointer; }
  .seg button.on { background:#fff; color:#4f46e5; box-shadow:0 1px 3px rgba(15,23,42,.14); }
  .chk { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; color:#475569; cursor:pointer; }
  .chk input { accent-color:#4f46e5; width:14px; height:14px; }
  .banco .reset { background:#fff; border:1px solid #e2e8f0; border-radius:9px; padding:5px 11px;
    font-size:11px !important; font-weight:700; color:#334155; cursor:pointer; }

  /* comandi per singolo campione */
  .camp-tools { display:flex; align-items:center; gap:7px; flex-wrap:wrap; margin-top:7px; }
  .camp-tools select { font-size:11px; border:1px solid #e2e8f0; border-radius:8px; padding:3px 6px; background:#fff; color:#334155; }
  .camp-tools .apri { background:#eef2ff; border:1px solid #c7d2fe; color:#4f46e5; border-radius:8px;
    padding:4px 10px; font-size:11px !important; font-weight:700; cursor:pointer; }
  .camp-tools .reso { font-size:10.5px; color:#94a3b8; font-weight:700; }

  /* taglia forzata su un campione */
  .camp[data-sz] .palco-in { max-width:var(--sz); }
  .camp[data-sz] .palco-in > *, .camp[data-sz] .mm-box { width:100% !important; max-width:100% !important; }

  /* velo: la platea diventa una finta pagina chiara + strato di velo */
  .palco { position:relative; }
  .palco-in { position:relative; z-index:2; }
  .velo { position:absolute; inset:0; z-index:1; pointer-events:none; background:var(--velo,transparent); }
  body[data-velo]:not([data-velo="orig"]) .palco { background:#f1f5f9;
    background-image:repeating-linear-gradient(180deg,#e2e8f0 0 8px,transparent 8px 26px); }

  /* raggio e ombra */
  body[data-radius="12"] .mm-box { border-radius:12px !important; }
  body[data-radius="16"] .mm-box { border-radius:16px !important; }
  body[data-radius="20"] .mm-box { border-radius:20px !important; }
  body[data-shadow="new"] .mm-box { box-shadow:0 25px 60px -12px rgba(0,0,0,.35) !important; }

  /* bottoni unificati */
  body[data-btn="uni"] .palco button[data-role="primary"] { background:#4f46e5 !important; background-image:none !important;
    color:#fff !important; border:0 !important; border-radius:12px !important; font-size:13px !important;
    font-weight:700 !important; letter-spacing:normal !important; text-transform:none !important;
    padding:10px 18px !important; height:auto !important; box-shadow:none !important; }
  body[data-btn="uni"] .palco button[data-role="secondary"] { background:#fff !important; background-image:none !important;
    color:#475569 !important; border:1px solid #e2e8f0 !important; border-radius:12px !important; font-size:13px !important;
    font-weight:700 !important; letter-spacing:normal !important; text-transform:none !important;
    padding:10px 18px !important; height:auto !important; box-shadow:none !important; }
  body[data-btn="uni"] .palco button[data-role="danger"] { background:#fff !important; background-image:none !important;
    color:#dc2626 !important; border:1px solid #fee2e2 !important; border-radius:12px !important; font-size:13px !important;
    font-weight:700 !important; text-transform:none !important; padding:10px 18px !important; height:auto !important; }

  /* campi unificati */
  body[data-fld="uni"] .palco input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),
  body[data-fld="uni"] .palco textarea,
  body[data-fld="uni"] .palco select { border:1px solid #e2e8f0 !important; border-radius:10px !important;
    padding:9px 11px !important; font-size:13px !important; background:#fff !important; color:#0f172a !important;
    height:auto !important; box-shadow:none !important; }

  /* anteprima «Apri come modale»: riusa le regole .palco qui sopra */
  .palco.prova { position:fixed; inset:0; z-index:4000; display:flex; align-items:center; justify-content:center;
    padding:26px; overflow:auto; background:var(--velo-live,rgba(15,23,42,.45)) !important; background-image:none !important; }
  .palco.prova .palco-in { max-width:var(--sz-live,none); }
  .confronto .col.scelta { border-color:#a7f3d0; background:#f0fdf9; box-shadow:0 0 0 3px rgba(4,120,87,.07); }
  .badge-ok { display:inline-block; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
    color:#047857; background:#d1fae5; border-radius:999px; padding:2px 7px; margin-left:4px; vertical-align:1px; }

  /* pelle della PROPOSTA — le variabili della versione proposta il 29/7:
     raggio 24, padding 28, icone 24, spazio 12, grigio terziario più chiaro,
     bottoni maiuscoli con spaziatura .2em. Sta tutto qui dentro: la pagina
     e l'Officina continuano a mostrare i token decisi. */
  .prop-skin { --mm-r-box:24px; --mm-r-campo:12px; --mm-r-btn:12px; --mm-pad:28px;
    --mm-icona:24px; --mm-icona-head:24px; --mm-btn-gap:12px; --mm-testo-3:#94a3b8; }
  .prop-skin .mm-btn { text-transform:uppercase; letter-spacing:.2em; }
  .prop-skin .mm-head__ico { border-radius:16px; }
  .seg-ver button[data-v="prop"].on { color:#047857; }
  .camp.in-prop .camp-head { background:#f0fdf9; }
  .camp .prop-nota { display:none; }
  .camp.in-prop .prop-nota { display:block; padding:8px 16px; font-size:11px; color:#047857;
    background:#f0fdf9; border-bottom:1px solid #d1fae5; }

  /* decisioni prese */
  .dec { display:grid; gap:8px; }
  .dec-r { display:flex; gap:11px; background:#fff; border:1px solid #dbe1ea; border-radius:13px;
    padding:11px 14px; font-size:12.5px; color:#334155; line-height:1.65; }
  .dec-r b { color:#0f172a; }
  .dec-r code { background:#f1f5f9; border-radius:4px; padding:0 4px; font-size:11.5px; }
  .dec-n { flex:0 0 22px; height:22px; border-radius:999px; background:#4f46e5; color:#fff;
    font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; margin-top:1px; }
  .dec-r.fatto { border-color:#a7f3d0; background:#f0fdf9; }
  .dec-r.fatto .dec-n { background:#047857; }
  .dec-ok { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em;
    color:#047857; background:#d1fae5; border-radius:999px; padding:2px 7px; margin-left:6px; }
  .dec-r.aperta { border-color:#fed7aa; background:#fff7ed; }
  .dec-r.aperta .dec-n { background:#c2410c; }
  .dec-cond { color:#c2410c; font-weight:700; }

  /* linee guida estratte */
  .lg-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }
  .lg { background:#fff; border:1px solid #dbe1ea; border-radius:14px; padding:13px 15px 14px; }
  .lg h4 { margin:0 0 9px; font-size:12px; font-weight:700; }
  .lg-t { border:0; font-size:11px; }
  .lg-t td { border:0; padding:2px 6px 2px 0; white-space:nowrap; }
  .lg-t td.n { color:#94a3b8; font-weight:700; text-align:right; width:38px; }
  .lg-t td.bar { width:100%; }
  .lg-t td.bar i { display:block; height:6px; border-radius:3px; background:#c7d2fe; }
  .lg-t tr:first-child td.bar i { background:#4f46e5; }
  .sw { display:inline-block; width:11px; height:11px; border-radius:3px; border:1px solid rgba(15,23,42,.15);
        vertical-align:-1px; margin-right:5px; }
  .lg-reg { margin:10px 0 0; font-size:11.5px; color:#475569; line-height:1.6; }
  .lg-reg code { background:#f1f5f9; border-radius:4px; padding:0 4px; }

  /* officina */
  .mm-off-box input::placeholder, .mm-off-box select { color:#64748b; opacity:1; }
  .off-ctrl { display:flex; flex-wrap:wrap; gap:10px 18px; background:#fff; border:1px solid #dbe1ea;
    border-radius:14px; padding:11px 14px; margin-bottom:12px; align-items:center; }
  .off-palco { border-radius:14px; }
  #off-css { background:#0f172a; color:#e2e8f0; border-radius:14px; padding:14px 16px; font-size:11px;
    line-height:1.65; overflow:auto; max-height:320px; margin:0; white-space:pre; }
  .off-out-h { display:flex; align-items:center; gap:10px; margin:16px 0 8px; }
  .off-out-h h3 { margin:0; font-size:13.5px; }
  .off-copy { background:#fff; border:1px solid #e2e8f0; border-radius:9px; padding:5px 11px;
    font-size:11px !important; font-weight:700; color:#334155; cursor:pointer; }

  .palco.prova .prova-hint { position:fixed; left:50%; transform:translateX(-50%); bottom:18px; z-index:4001;
    background:rgba(15,23,42,.9); color:#e2e8f0; border-radius:999px; padding:7px 15px; font-size:11px; font-weight:700; }
</style>
</head>
<body>

<header class="top"><div class="wrap">
  <h1>Campionario dei modali — MappAI</h1>
  <p class="sub">Generato da <code>tools/campionario-modali/build.js</code> leggendo il codice vero.
     ${nStatic} modali statici (<code>index.html</code>) + ${nDyn} overlay dinamici (<code>public/js</code>).</p>
  <nav>
    <a href="#numeri">Numeri</a><a href="#statici">Modali statici</a><a href="#dinamici">Modali dinamici</a>
    <a href="#tabelle">Tabelle di divergenza</a><a href="#tastiera">ESC / Invio</a><a href="#linee">Linee guida estratte</a><a href="#proposta">Proposta di standard</a><a href="#officina">Officina</a><a href="#piano">Piano di migrazione</a>
  </nav>

  <div class="banco" id="banco">
    <div class="banco-h" id="banco-h">
      <b>Banco di prova</b>
      <span style="font-size:11px;color:#64748b">applica i token ai campioni — stili inline su questa pagina, il codice non si tocca</span>
      <span class="stato" id="banco-stato">aperto &#9652;</span>
    </div>
    <div class="banco-body">

      <div class="fila"><span class="fila-t">Struttura</span>
        <div class="grp"><label class="tit">Taglia</label>
          <div class="seg" data-key="sz">
            <button type="button" data-v="orig" class="on">originale</button>
            <button type="button" data-v="440">S 440</button>
            <button type="button" data-v="600">M 600</button>
            <button type="button" data-v="820">L 820</button>
            <button type="button" data-v="1160">XL 1160</button>
          </div></div>
        <div class="grp"><label class="tit">Densità</label>
          <div class="seg" data-key="dens">
            <button type="button" data-v="orig" class="on">originale</button>
            <button type="button" data-v="16">compatta</button>
            <button type="button" data-v="22">normale</button>
            <button type="button" data-v="28">ariosa</button>
          </div></div>
      </div>

      <div class="fila"><span class="fila-t">Superficie</span>
        <div class="grp"><label class="tit">Velo</label>
          <div class="seg" data-key="velo">
            <button type="button" data-v="orig" class="on">originale</button>
            <button type="button" data-v="rgba(15,23,42,.45)">.45</button>
            <button type="button" data-v="rgba(15,23,42,.6)">.60</button>
            <button type="button" data-v="rgba(15,23,42,.8)">.80</button>
            <button type="button" data-v="rgba(0,0,0,.5)">nero .50</button>
          </div></div>
        <div class="grp"><label class="tit">Raggio riquadro</label>
          <div class="seg" data-key="rBox">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="8">8</button><button type="button" data-v="12">12</button>
            <button type="button" data-v="16">16</button><button type="button" data-v="20">20</button>
            <button type="button" data-v="24">24</button>
          </div></div>
        <div class="grp"><label class="tit">Ombra</label>
          <div class="seg" data-key="shadow">
            <button type="button" data-v="orig" class="on">originale</button>
            <button type="button" data-v="soft">morbida</button>
            <button type="button" data-v="new">proposta</button>
            <button type="button" data-v="flat">piatta (bordo)</button>
          </div></div>
      </div>

      <div class="fila"><span class="fila-t">Bottoni</span>
        <div class="grp"><label class="tit">Colore</label>
          <div class="seg" data-key="btn">
            <button type="button" data-v="orig" class="on">originali</button>
            <button type="button" data-v="uni">unificati</button>
          </div></div>
        <div class="grp"><label class="tit">Raggio</label>
          <div class="seg" data-key="rBtn">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="6">6</button><button type="button" data-v="8">8</button>
            <button type="button" data-v="10">10</button><button type="button" data-v="12">12</button>
            <button type="button" data-v="999">pill</button>
          </div></div>
        <div class="grp"><label class="tit">Etichetta</label>
          <div class="seg" data-key="btnAlign">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="flex-start">a sinistra</button>
            <button type="button" data-v="center">centrata</button>
            <button type="button" data-v="space-between">agli estremi</button>
          </div></div>
        <div class="grp"><label class="tit">Icona</label>
          <div class="seg" data-key="btnOrder">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="first">prima</button>
            <button type="button" data-v="last">dopo</button>
          </div></div>
        <div class="grp"><label class="tit">Spazio</label>
          <div class="seg" data-key="btnGap">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="4">4</button><button type="button" data-v="6">6</button>
            <button type="button" data-v="8">8</button><button type="button" data-v="12">12</button>
          </div></div>
        <div class="grp"><label class="tit">Testo</label>
          <div class="seg" data-key="btnCase">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="none">normale</button>
            <button type="button" data-v="uppercase">MAIUSCOLO</button>
          </div></div>
        <div class="grp"><label class="tit">Spaziatura</label>
          <div class="seg" data-key="btnTrack">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="0">0</button><button type="button" data-v="0.02em">.02</button>
            <button type="button" data-v="0.08em">.08</button><button type="button" data-v="0.2em">.2</button>
          </div></div>
        <div class="grp"><label class="tit">Corpo</label>
          <div class="seg" data-key="btnFs">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="12">12</button><button type="button" data-v="13">13</button>
            <button type="button" data-v="14">14</button><button type="button" data-v="16">16</button>
          </div></div>
        <div class="grp"><label class="chk"><input type="checkbox" id="opt-btnfs">
          corpo come dichiarato <span style="font-weight:400;color:#94a3b8">(aggira <code>button 16px !important</code>)</span></label></div>
      </div>

      <div class="fila"><span class="fila-t">Campi</span>
        <div class="grp"><label class="tit">Stile</label>
          <div class="seg" data-key="fld">
            <button type="button" data-v="orig" class="on">originali</button>
            <button type="button" data-v="uni">unificati</button>
          </div></div>
        <div class="grp"><label class="tit">Raggio</label>
          <div class="seg" data-key="rFld">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="6">6</button><button type="button" data-v="8">8</button>
            <button type="button" data-v="10">10</button><button type="button" data-v="12">12</button>
          </div></div>
      </div>

      <div class="fila"><span class="fila-t">Icone</span>
        <div class="grp"><label class="tit">Stile</label>
          <div class="seg" data-key="icone">
            <button type="button" data-v="lucide" class="on">Lucide SVG</button>
            <button type="button" data-v="android">Android emoji</button>
          </div></div>
        <div class="grp"><label class="tit">Dimensione</label>
          <div class="seg" data-key="icoSize">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="14">14</button><button type="button" data-v="16">16</button>
            <button type="button" data-v="18">18</button><button type="button" data-v="20">20</button>
            <button type="button" data-v="22">22</button><button type="button" data-v="24">24</button>
          </div></div>
        <div class="grp"><label class="tit">Colore</label>
          <div class="seg" data-key="icoColor">
            <button type="button" data-v="orig" class="on">orig.</button>
            <button type="button" data-v="#4f46e5">indigo</button>
            <button type="button" data-v="#475569">grigio</button>
            <button type="button" data-v="currentColor">del testo</button>
          </div></div>
      </div>

      <div class="fila"><span class="fila-t">Tastiera</span>
        <span style="font-size:11px;color:#94a3b8">vale per «Apri come modale»</span>
        <label class="chk"><input type="checkbox" id="k-esc" checked> ESC</label>
        <label class="chk"><input type="checkbox" id="k-enter" checked> Invio</label>
        <label class="chk"><input type="checkbox" id="k-trap" checked> focus trap</label>
        <label class="chk"><input type="checkbox" id="k-back" checked> clic sul velo</label>
        <button type="button" class="reset" id="banco-adotta" style="border-color:#c7d2fe;color:#4f46e5">Adotta le decisioni (29/7)</button>
        <button type="button" class="reset" id="banco-reset">Ripristina tutto</button>
      </div>
    </div>
  </div>
</div></header>

<div class="wrap">

<h2 id="numeri">1. I numeri <span class="n">— misurati, non stimati</span></h2>
<p class="lead">Ogni riga qui sotto viene da una scansione del codice: i modali statici sono i blocchi
<code>&lt;div id="…modal…"&gt;</code> di <code>index.html</code>, i dinamici sono gli overlay creati a runtime
(<code>position:fixed;inset:0</code>) nei moduli. La copertura di ESC per i modali statici è la lista
<code>closeActiveModals</code> in <code>app.js:55</code>: quello che non è in quella lista, con ESC non si chiude.</p>
<div class="grid-num">
  <div class="num"><b>${nStatic + nDyn}</b><span>modali totali</span></div>
  <div class="num warn"><b>${allW.length}</b><span>larghezze diverse</span></div>
  <div class="num warn"><b>${allBg.length}</b><span>sfondi (velo) diversi</span></div>
  <div class="num warn"><b>${escStatic}/${nStatic}</b><span>statici che ESC chiude</span></div>
  <div class="num warn"><b>${escDyn}/${nDyn}</b><span>dinamici che ESC chiude</span></div>
  <div class="num warn"><b>${entDyn}/${nDyn}</b><span>dinamici con Invio</span></div>
  <div class="num warn"><b>3</b><span>sistemi di bottoni</span></div>
</div>
<p class="lead">Larghezze in uso: <code>${esc(allW.join(' · '))}</code>.<br>
Veli in uso: <code>${esc(allBg.join(' · '))}</code>.</p>

<h2 id="statici">2. Modali statici <span class="n">— markup copiato da index.html, non riscritto</span></h2>
<p class="lead">Sono renderizzati con il CSS vero dell'app (<code>style.css</code> + il blocco
<code>@layer components</code> di <code>index.html</code>): quello che vedi è quello che l'app disegna.
Sono neutralizzati solo per stare in pagina (tolti <code>fixed/hidden/opacity-0/scale-95</code>, gli
<code>onclick</code> spostati su <code>data-onclick</code>, gli <code>id</code> su <code>data-orig-id</code>).
I corpi che l'app riempie via JS restano vuoti: è così che nascono.</p>
${staticCards}

<h2 id="dinamici">3. Modali dinamici <span class="n">— scocche trascritte dai moduli</span></h2>
<p class="lead">Questi non stanno in <code>index.html</code>: li costruisce il JS a runtime, con stili
<i>inline</i>. Le scocche qui sotto sono copiate dalle stringhe vere (stessi colori, raggi, misure)
in <code>tools/campionario-modali/samples-dinamici.js</code>; il contenuto è un esempio.</p>
${dynCards}

<h2 id="tabelle">4. Tabelle di divergenza</h2>
<p class="lead">Le due tabelle complete. Ordinabili a occhio: la colonna larghezza è quella su cui
c'è meno accordo.</p>
<h3 style="font-size:13.5px;margin:18px 0 8px">4.1 Statici (${nStatic})</h3>
<div class="scroll"><table>
<thead><tr><th>Modale</th><th>Sorgente</th><th>Larghezza</th><th>Velo</th><th>Raggio</th><th>z-index</th><th>ESC</th><th>Campi</th><th>Bottoni</th></tr></thead>
<tbody>${tabStatica}</tbody></table></div>

<h3 style="font-size:13.5px;margin:26px 0 8px">4.2 Dinamici (${nDyn})</h3>
<div class="scroll"><table>
<thead><tr><th>Funzione</th><th>Sorgente</th><th>Larghezza</th><th>Velo</th><th>Raggio</th><th>ESC</th><th>Invio</th><th>Sfondo chiude</th><th>role=dialog</th></tr></thead>
<tbody>${tabDinamica}</tbody></table></div>

<h3 style="font-size:13.5px;margin:26px 0 8px">4.3 Campi di testo a confronto</h3>
<p class="lead">Gli stessi tre campi, con i tre sistemi che oggi convivono. Bordo, raggio, corpo del
testo e altezza non coincidono: affiancati si vede quanto.</p>
<div class="confronto">
  <div class="col"><div class="col-h">A · <code>.form_input</code><br><span>index.html · landing e config AI</span></div>
    <label class="input_label_xs">Etichetta</label>
    <input class="form_input" value="Testo di prova">
    <div class="misura" data-misura="A"></div></div>
  <div class="col"><div class="col-h">B · Tailwind inline<br><span><code>border border-slate-300 rounded-lg p-2.5 text-sm</code> — prompt, edit nodo</span></div>
    <label class="modal_field_title">Etichetta</label>
    <input class="w-full border border-slate-300 rounded-lg p-2.5 text-sm focus_ring_standard" value="Testo di prova">
    <div class="misura" data-misura="B"></div></div>
  <div class="col scelta"><div class="col-h">C · <code>FLD</code> inline <span class="badge-ok">scelta adottata</span><br><span>live-classes, tutor, profilo insegnante</span></div>
    <span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">ETICHETTA</span>
    <input style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff" value="Testo di prova">
    <div class="misura" data-misura="C"></div></div>
</div>

<h3 style="font-size:13.5px;margin:26px 0 8px">4.4 Bottoni a confronto</h3>
<p class="lead">Tre grammatiche di colore. Nella prima «Annulla» è rosso (colore del pericolo) e
«Salva» verde; nella seconda il primario è indigo e l'annulla è bianco; nella terza cambia solo il raggio.
Uno dei tre deve vincere.</p>
<div class="confronto">
  <div class="col"><div class="col-h">A · <code>btn_annulla_action</code> / <code>btn_salva_action</code><br><span>prompt, modifica titolo, modifica nodo</span></div>
    <div class="flex gap-3 h-11"><button type="button" class="btn_annulla_action">Annulla</button><button type="button" class="btn_salva_action">Salva</button></div></div>
  <div class="col"><div class="col-h">B · <code>pm-btn-cancel</code> / <code>pm-btn-primary</code><br><span>stampa dossier, timeline, pipeline</span></div>
    <div class="flex gap-2"><button type="button" class="pm-btn-cancel">Annulla</button><button type="button" class="pm-btn-primary">Conferma</button></div></div>
  <div class="col scelta"><div class="col-h">C · bottoni inline dei moduli <span class="badge-ok">scelta adottata</span><br><span>hub, studio attivo, classi, editor documenti</span></div>
    <div style="display:flex;gap:8px">
      <button type="button" style="background:#fff;color:#334155;border:1px solid #e2e8f0;border-radius:10px;padding:9px 14px;font-weight:700;font-size:12px;cursor:pointer">Annulla</button>
      <button type="button" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:12px;cursor:pointer">Conferma</button></div></div>
</div>
<div class="scoperta">
  <b>Trovato misurando, non leggendo — e già corretto (29/7/2026).</b> In
  <code>public/css/style.css:87</code> c'era <code>button { font-size: 16px !important }</code> — una regola
  nata per bloccare i controlli contro lo zoom del testo, ma scritta su <code>button</code> nudo. Risultato:
  <b>ogni dimensione di carattere dichiarata sui bottoni sotto i 16px era lettera morta.</b> I <code>text-[12px]</code> di
  <code>pm-btn-primary</code> / <code>pm-btn-cancel</code> e i <code>font-size:12px</code> inline dei
  moduli vengono tutti resi a 16px; sopravvivono solo quelli scritti con <code>!important</code>
  (i 18px di <code>btn_salva_action</code>).<br><br>
  <b>Correzione applicata:</b> <code>button</code> è uscito dall'elenco dei controlli bloccati e ha una regola
  sua, <code>button { font-size: 16px }</code> senza <code>!important</code>. Un px assoluto è già immune allo
  zoom testo (che agisce sul <code>font-size</code> di <code>&lt;html&gt;</code>), quindi il blocco non serviva:
  i 157 bottoni senza taglia dichiarata restano a 16px, i ~104 che una taglia ce l'hanno ora la ottengono.
  <b>Da guardare in Electron</b>: è il cambio più visibile di tutta questa sessione.
  <div id="mis-btn"></div>
</div>

<h2 id="tastiera">5. ESC e Invio — lo stato di fatto</h2>
<p class="lead">Oggi il comportamento da tastiera non è una regola ma un'abitudine di chi ha scritto quel
modale. Tre meccanismi convivono e non si conoscono fra loro:</p>
<div class="prop"><h4>a) Lista centrale (statici)</h4><ul>
  <li><code>app.js:112</code> ascolta <code>keydown</code> globale e chiama <code>closeActiveModals()</code>,
      che scorre una lista scritta a mano di ${escSet.size} id.</li>
  <li>Chi non è in lista non risponde a ESC. Fra questi:
      <code>${esc(statics.filter(s => !escSet.has(s.id)).map(s => '#' + s.id).join(' · '))}</code>.</li>
  <li>Eccezione dichiarata: <code>layout-manager-modal</code> intercetta ESC e apre una conferma d'uscita.</li>
</ul></div>
<div class="prop"><h4>b) Handler per-modale (dinamici)</h4><ul>
  <li>${escDyn} overlay su ${nDyn} registrano un proprio <code>keydown</code> e lo rimuovono alla chiusura.</li>
  <li>Gli altri si chiudono solo con la × o con il clic sul velo. In tre casi (QR a schermo pieno)
      due copie quasi identiche divergono: <code>timeline-teacher.js</code> ha ESC, <code>live-teacher.js</code> no.</li>
</ul></div>
<div class="prop"><h4>c) Invio</h4><ul>
  <li>Solo ${entDyn} overlay dinamici legano Invio. <code>mappai-live-classes.js</code> ha l'impianto più
      completo (<code>_onEnter</code> dichiarato per schermata, listener in <i>capture</i>).</li>
  <li>Nei modali statici Invio funziona solo dove è stato cablato a mano sul singolo campo
      (<code>prompt-modal</code>, <code>link-family-modal</code>): il resto ignora Invio anche quando
      c'è un solo bottone primario ovvio.</li>
  <li>Nessun modale, statico o dinamico, tiene il fuoco prigioniero (focus trap): con Tab si esce
      dal modale e si va a finire sulla pagina sotto.</li>
</ul></div>

<h2 id="linee">5-bis. Le linee guida che il tuo codice già ha
  <span class="n">— contate, non inventate</span></h2>
<p class="lead">Prima di decidere che aspetto <i>dovrebbero</i> avere i modali conviene guardare che
aspetto hanno <b>di solito</b>. Le frequenze qui sotto vengono da tutto il codice dell'app
(<code>index.html</code> + <code>public/js/*.js</code> + <code>style.css</code>): dove un valore stravince,
la linea guida esiste già e va solo dichiarata; dove ci sono due valori appaiati, è lì che serve
la tua decisione.</p>
<div class="lg-grid">${
  [
    { t: 'Accento e grigi', d: TS.colori.slice(0, 10), reg: 'Accento unico <code>#4f46e5</code>. Il secondo indigo <code>#6366f1</code> è un doppione: tenerlo solo per gli stati hover.', pastiglia: true },
    { t: 'Raggi dichiarati inline', d: TS.raggiInline.slice(0, 7), reg: 'Due famiglie chiare: <b>10px</b> per campi e bottoni, <b>16px</b> per il riquadro. <code>999px</code> resta per le pastiglie.' },
    { t: 'Raggi Tailwind (index.html)', d: TS.raggiTw.slice(0, 6), reg: '<code>rounded-xl</code> (12px) domina, ma nei moduli JS vince 10px: è la stessa intenzione scritta in due scale diverse.' },
    { t: 'Icone quadrate', d: TS.icone.slice(0, 5), reg: '20 e 22 sono appaiati: decidere <b>20px nel corpo, 22px nella testata</b> oppure 20 ovunque.' }
  ].map(g => '<div class="lg"><h4>' + g.t + '</h4><table class="lg-t"><tbody>' +
    g.d.map(([v, n]) => '<tr><td>' + (g.pastiglia ? '<span class="sw" style="background:' + v + '"></span>' : '') +
      '<code>' + v + '</code></td><td class="n">' + n + '</td>' +
      '<td class="bar"><i style="width:' + Math.max(3, Math.round(100 * n / g.d[0][1])) + '%"></i></td></tr>').join('') +
    '</tbody></table><p class="lg-reg">' + g.reg + '</p></div>').join('')
}</div>
<p class="lead" style="margin-top:14px">Il bottone <b>«Adotta i consigliati»</b> del banco di prova
imposta esattamente questi valori: accento <code>#4f46e5</code>, riquadro 16, campi e bottoni 10,
icone 20 indigo, velo <code>.45</code>, densità 22, etichette centrate con 8px di spazio, testo
non maiuscolo. Guarda i campioni con quei valori addosso e poi decidi cosa non ti torna.</p>

<h2 id="proposta">6. Decisioni prese <span class="n">— 29 luglio 2026</span></h2>
<div class="dec">
  <div class="dec-r"><span class="dec-n">1</span><div><b>Un solo colore d'azione: l'indigo <code>#4f46e5</code>.</b>
    L'emerald smette di fare il primario (<code>btn_salva_action</code>, <code>validate-link</code>) e torna a
    significare stato positivo: badge, conferma avvenuta. Mai un bottone.</div></div>
  <div class="dec-r"><span class="dec-n">2</span><div><b>Il rosso solo per il distruttivo.</b>
    «Annulla» diventa bianco con bordo: oggi <code>btn_annulla_action</code> veste di rosso l'azione più innocua
    del modale, mentre l'unico rosso legittimo (<code>#dc2626</code>) è quello che cancella davvero.</div></div>
  <div class="dec-r"><span class="dec-n">3</span><div><b>Bottoni in tondo, spaziatura normale.</b>
    Via il MAIUSCOLO e il <code>letter-spacing:.2em</code>: il maiuscolo toglie il profilo della parola e la
    spaziatura larga spezza la lettura — costo diretto per gli utenti BES/DSA, che sono il pubblico dell'app.</div></div>
  <div class="dec-r"><span class="dec-n">4</span><div><b>Campi con il solo segnaposto</b>, niente etichetta sopra.
    <span class="dec-cond">Con due paletti tecnici obbligatori</span>: ogni campo porta <code>aria-label</code>
    (senza, appena si scrive il campo diventa muto per un lettore di schermo) e il segnaposto usa
    <code>#64748b</code> (4,76:1 su bianco) — il grigio chiaro abituale <code>#94a3b8</code> sta a 2,8:1,
    sotto soglia. Dove il contenuto non si capisce dal contesto, resta possibile una riga di aiuto
    <code>.mm-hint</code> sopra il campo.</div></div>
  <div class="dec-r"><span class="dec-n">5</span><div><b>Piè di pagina allineato a destra, bottoni a larghezza naturale.</b>
    Il <code>flex-1 / flex-2</code> di <code>pm-*</code> va bene a 600px, ma su un modale da 1160 rende «Conferma»
    largo mezzo schermo. A piena larghezza solo sotto i 480px.</div></div>
  <div class="dec-r"><span class="dec-n">6</span><div><b>Velo unico <code>rgba(15,23,42,.45)</code> + blur.</b>
    Lo <code>slate-900/80</code> di oggi spegne il contesto, e quando un modale ne apre un altro
    (config → tutorial) il fondo diventa nero.</div></div>
  <div class="dec-r fatto"><span class="dec-n">7</span><div><b>Sbloccato il corpo dei bottoni. <span class="dec-ok">già applicato al codice</span></b>
    <code>style.css:87</code> non applica più <code>font-size:16px !important</code> a <code>button</code> nudo:
    i controlli a11y restano bloccati, i bottoni hanno una regola propria senza <code>!important</code>.
    Senza questo passo ogni decisione tipografica sui bottoni sarebbe rimasta teoria.</div></div>
  <div class="dec-r"><span class="dec-n">8</span><div><b>Campi e bottoni: vince la <span class="badge-ok">variante C</span>, quella dei moduli.</b>
    Campo (<code>FLD</code> di live-classes / tutor / profilo insegnante): bordo <code>#e2e8f0</code>, raggio 10,
    padding 9×11, <code>font:inherit</code> → testo a <b>16px</b>, altezza 44. È il più leggibile dei tre
    (A stava a 12px, B a 14px) e già il più diffuso.
    Bottone (hub, classi, editor documenti): raggio 10, padding 9×14 (16 sul primario), corpo <b>12px</b> peso 700,
    secondario bianco con testo <code>#334155</code>.
    <span class="dec-cond">Da guardare</span>: 12px sul bottone contro 16px nel campo accanto è uno scarto forte,
    e su un'app BES/DSA il bottone è l'elemento da colpire. Fino a oggi quel 12px non si era mai visto
    (lo scartava <code>button 16px !important</code>). Nel banco c'è il comando <b>Corpo</b> per confrontare
    12 · 13 · 14 · 16 sui campioni veri: una riga sola da cambiare, <code>--mm-btn-fs</code>.</div></div>
  <div class="dec-r aperta"><span class="dec-n">?</span><div><b>Ancora da decidere: la taglia delle icone.</b>
    Nel codice 20px e 22px sono appaiati (18 usi contro 17). Nel file dei token: 20 nel corpo,
    22 nella testata. Provalo dal banco e dimmi se tenerle uguali.</div></div>
</div>
<p class="lead" style="margin-top:14px">Le decisioni vivono in
<code>public/css/mappai-modal-tokens.css</code> — scritto, <b>non ancora caricato</b> in
<code>index.html</code>. Il bottone <b>«Adotta le decisioni»</b> del banco mostra i campioni con questi
valori addosso. Quello che segue è la stessa cosa, per esteso.</p>

<h3 style="font-size:14px;margin:26px 0 10px">Lo standard, per esteso</h3>
<p class="lead"><b>Il <a href="#banco" style="color:#4f46e5">banco di prova</a> in cima alla pagina applica
tutto quello che segue ai campioni</b>, insieme o uno per uno (ogni scheda ha la sua taglia e il suo
«Apri come modale» per sentire ESC, Invio, Tab e clic sul velo). Nulla di ciò tocca il codice: è una
prova a schermo, e si azzera con «Ripristina tutto».<br><br>
Non è una riscrittura: è la scelta di UN valore per ogni asse su cui oggi ce ne sono
molti. Le misure proposte sono quelle già più frequenti nel codice, così la maggior parte dei modali
converge senza cambiare aspetto.</p>

<div class="prop"><h4>Taglie — 4, non ${allW.length}</h4><ul>
  <li><code>S = 440px</code> conferme, avvisi, richieste di un valore.</li>
  <li><code>M = 600px</code> form corti, opzioni di stampa, wizard a un passo. <i>(la taglia più usata oggi)</i></li>
  <li><code>L = 820px</code> wizard, hub a schede, elenchi.</li>
  <li><code>XL = 1160px</code> cruscotti a colonne (consumi, revisione, layout).</li>
  <li>Sempre <code>width:min(taglia, 94vw)</code> e <code>max-height:88vh</code> con scorrimento interno.</li>
</ul></div>

<div class="prop"><h4>Cornice</h4><ul>
  <li>Velo unico: <code>rgba(15,23,42,.45)</code> + <code>backdrop-blur-sm</code> — è già il più diffuso fra i dinamici;
      gli statici usano <code>bg-slate-900/80</code>, troppo scuro quando i modali si sovrappongono.</li>
  <li>Raggio <code>16px</code> (<code>rounded-2xl</code>), ombra <code>0 25px 60px -12px rgba(0,0,0,.35)</code>.</li>
  <li>Fondo del riquadro <code>#fff</code>; le sezioni interne <code>#f8fafc</code> con bordo <code>#e2e8f0</code>
      (è la <code>pm-section</code> che già esiste).</li>
  <li>z-index a scaglioni dichiarati: 2000 modali, 3000 modali sopra modali, 9000 overlay di sistema.</li>
</ul></div>

<div class="prop"><h4>Testata</h4><ul>
  <li><code>pm-icon-wrap</code> (icona Lucide indigo) + <code>pm-title</code> + <code>pm-subtitle</code>: un solo schema.</li>
  <li>La × in alto a destra sempre presente, sempre nello stesso punto, <code>aria-label="Chiudi"</code>.</li>
  <li>Mai emoji nei titoli (regola già in vigore): <code>&lt;i data-lucide&gt;</code> + <code>safeCreateIcons()</code>.</li>
</ul></div>

<div class="prop"><h4>Campi</h4><ul>
  <li>Un solo campo: <code>border 1px #e2e8f0</code>, raggio <code>10px</code>, padding <code>9px 11px</code>,
      corpo <code>13px</code>, fondo bianco, anello di fuoco <code>focus_ring_standard</code>.</li>
  <li>Etichetta sopra il campo: <code>11px</code>, grassetto, <code>#475569</code>. Mai etichette solo grigio chiaro:
      sotto 4,5:1 di contrasto.</li>
  <li>Le tre varianti di oggi (<code>form_input</code> 12px · campi Tailwind <code>p-2.5 text-sm</code> ·
      <code>FLD</code> inline dei moduli) confluiscono in questa.</li>
</ul></div>

<div class="prop"><h4>Bottoni — un sistema, non tre</h4><ul>
  <li>Primario <code>pm-btn-primary</code> (indigo 600, bianco), secondario <code>pm-btn-cancel</code> (bianco, bordo),
      distruttivo bianco con testo <code>#dc2626</code> e bordo <code>#fee2e2</code>.</li>
  <li>Il primario sta <b>a destra</b>, sempre; il distruttivo isolato a sinistra.</li>
  <li>Vanno in pensione: <code>btn_salva_action</code> (verde) e <code>btn_annulla_action</code> (rosso) —
      oggi «Annulla» è rosso come un'azione pericolosa, e «Salva» verde, mentre altrove il primario è indigo.</li>
  <li><b>Prima di toccare qualunque taglia di carattere</b>: restringere
      <code>button { font-size:16px !important }</code> (<code>style.css:87</code>) ai soli controlli che
      deve davvero bloccare (<code>.a11y-btn</code>, <code>.tts-button</code>, la toolbar), altrimenti ogni
      valore scritto nei modali continua a non avere effetto.</li>
</ul></div>

<div class="prop"><h4>Contratto tastiera (il punto che manca del tutto)</h4><ul>
  <li><b>ESC</b> chiude sempre. Se ci sono modifiche non salvate, ESC apre una conferma invece di chiudere.</li>
  <li><b>Invio</b> attiva l'azione primaria, tranne quando il fuoco è in una <code>textarea</code>.</li>
  <li><b>Tab</b> resta dentro il modale (focus trap) e al primo aprirsi il fuoco va sul primo campo,
      o sul bottone primario se non ci sono campi.</li>
  <li>Alla chiusura il fuoco torna sull'elemento che ha aperto il modale.</li>
  <li>Il clic sul velo chiude solo i modali senza dati in scrittura.</li>
  <li>Una sola funzione (<code>openModal(...)</code>) che fa tutto questo, invece di ${escDyn + escStatic} handler sparsi.</li>
</ul></div>

<div class="prop"><h4>Prova il contratto</h4>
  <p style="font-size:12.5px;color:#475569;margin:0 0 12px;line-height:1.7">
     Questo è l'unico pezzo <i>vivo</i> della pagina: un modale che implementa la proposta.
     ESC chiude, Invio conferma, Tab non esce, il fuoco torna al bottone.</p>
  <button class="demo-btn" id="demo-open">Apri il modale campione</button>
</div>

<h2 id="officina">7. Officina <span class="n">— il modale campione costruito dai token</span></h2>
<p class="lead">Qui non c'è codice esistente da rispettare: il modale viene disegnato da zero con i
valori scelti nel banco di prova. Serve a decidere le cose che sui campioni reali non si possono
provare senza deformarli — impaginazione della testata, corpo a più colonne, cruscotto con barra
laterale, disposizione del piè di pagina, posizione delle etichette dei campi.
In fondo trovi il CSS che ne risulta, pronto da incollare.</p>

<div class="off-ctrl">
  <div class="grp"><label class="tit">Testata</label>
    <div class="seg" data-off="testata">
      <button type="button" data-v="a" class="on">icona in riquadro</button>
      <button type="button" data-v="b">icona in linea</button>
      <button type="button" data-v="c">titolo centrato</button>
    </div></div>
  <div class="grp"><label class="tit">Corpo</label>
    <div class="seg" data-off="corpo">
      <button type="button" data-v="1" class="on">1 colonna</button>
      <button type="button" data-v="2">2 colonne</button>
      <button type="button" data-v="3">3 colonne</button>
      <button type="button" data-v="dash">cruscotto</button>
    </div></div>
  <div class="grp"><label class="tit">Barra laterale</label>
    <div class="seg" data-off="side">
      <button type="button" data-v="200">200</button>
      <button type="button" data-v="240" class="on">240</button>
      <button type="button" data-v="280">280</button>
    </div></div>
  <div class="grp"><label class="tit">Piè di pagina</label>
    <div class="seg" data-off="footer">
      <button type="button" data-v="dx" class="on">a destra</button>
      <button type="button" data-v="full">a piena larghezza</button>
      <button type="button" data-v="split">distruttivo a sinistra</button>
    </div></div>
  <div class="grp"><label class="tit">Etichette dei campi</label>
    <div class="seg" data-off="label">
      <button type="button" data-v="sopra" class="on">sopra</button>
      <button type="button" data-v="linea">in linea</button>
      <button type="button" data-v="dentro">solo segnaposto</button>
    </div></div>
</div>

<div class="palco off-palco"><div class="velo"></div><div class="palco-in" id="off-host"></div></div>

<div class="off-out-h"><h3>CSS risultante</h3>
  <button type="button" class="off-copy" id="off-copy">Copia</button>
  <span style="font-size:11px;color:#94a3b8">variabili + classi <code>pm-*</code> riscritte sui valori scelti</span>
</div>
<pre id="off-css"></pre>

<h2 id="piano">8. Piano di migrazione <span class="n">— uno alla volta, mai tutti insieme</span></h2>
<p class="lead">69 modali non si riscrivono in un pomeriggio, e non serve: la maggior parte delle
decisioni si applica cambiando poche classi condivise. L'ordine sotto è pensato perché ogni passo sia
verificabile da solo e reversibile con un <code>git revert</code>.</p>
<div class="dec">
  <div class="dec-r fatto"><span class="dec-n">1</span><div><b>Sbloccare il corpo dei bottoni.</b>
    <span class="dec-ok">fatto</span> <code>style.css:87</code>. Da guardare in Electron: ~104 bottoni
    cambiano dimensione, è il passo più visibile di tutti.</div></div>
  <div class="dec-r fatto"><span class="dec-n">2</span><div><b>Caricare <code>mappai-modal-tokens.css</code>.</b>
    <span class="dec-ok">fatto</span> In <code>index.html</code> subito dopo <code>style.css</code>.
    Verificato a pagina caricata: le variabili <code>--mm-*</code> risolvono, le 34 regole <code>.mm-*</code>
    ci sono e <b>colpiscono zero elementi</b> — nessun modale le usa ancora. È la rete prima del salto.</div></div>
  <div class="dec-r"><span class="dec-n">3</span><div><b>Riscrivere <code>pm-btn-primary</code> /
    <code>pm-btn-cancel</code> e mandare in pensione <code>btn_salva_action</code> /
    <code>btn_annulla_action</code></b> (decisioni 1-2-3-5). Sono 8 usi di salva e 7 di annulla in
    <code>index.html</code>: un pomeriggio, e copre i modali più visti.</div></div>
  <div class="dec-r"><span class="dec-n">4</span><div><b>Una sola funzione <code>openModal()</code></b> con il
    contratto tastiera (ESC, Invio, focus trap, ritorno del fuoco, velo). Sostituisce la lista a mano
    <code>closeActiveModals</code> e i 18 handler ESC sparsi nei moduli. Qui si guadagna di più:
    oggi 9 modali statici su 25 non rispondono a ESC.</div></div>
  <div class="dec-r"><span class="dec-n">5</span><div><b>Portare i modali sulle quattro taglie</b>
    (440 / 600 / 820 / 1160) e sul velo unico. Meccanico: si sostituisce la classe del contenitore.
    Le 29 larghezze di oggi sono quasi tutte a un passo da una delle quattro.</div></div>
  <div class="dec-r"><span class="dec-n">6</span><div><b>Campi al solo segnaposto</b> (decisione 4) —
    per ultimo, perché tocca ogni singolo form e richiede di scrivere un <code>aria-label</code> sensato
    campo per campo. Farlo di fretta significa consegnare form muti ai lettori di schermo.</div></div>
</div>
<p class="lead" style="margin-top:14px">Dopo ogni passo: rilancia
<code>node tools/campionario-modali/build.js</code> e riapri questa pagina. I numeri della §1 sono la
misura del progresso — quando «larghezze diverse» scende da 29 a 4 e «statici che ESC chiude» arriva a
25/25, la migrazione è finita.</p>

</div><!--/wrap-->

<script>
  window.MM_PROPOSTE = ${JSON.stringify(PROPOSTE)};
  if (window.lucide && lucide.createIcons) lucide.createIcons();

  /* ── demo del contratto proposto ─────────────────────────────────── */
  var opener = null;
  function openDemo() {
    opener = document.activeElement;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.45);' +
      'backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML =
      '<div role="dialog" aria-modal="true" aria-labelledby="demo-t" style="background:#fff;border-radius:16px;' +
      'width:min(600px,94vw);max-height:88vh;overflow:auto;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);padding:22px 24px">' +
      '<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">' +
      '<div class="pm-icon-wrap"><i data-lucide="sparkles" class="w-5 h-5 text-indigo-600"></i></div>' +
      '<div style="flex:1"><div class="pm-title" id="demo-t">Modale campione</div>' +
      '<div class="pm-subtitle">taglia M · velo unico · contratto tastiera</div></div>' +
      '<button type="button" class="d-x" aria-label="Chiudi" style="background:none;border:none;cursor:pointer;' +
      'color:#94a3b8;font-size:22px;line-height:1;padding:2px 4px">×</button></div>' +
      '<div class="pm-section" style="margin-bottom:12px">' +
      '<span class="pm-section-title">Un campo</span>' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">Nome</label>' +
      '<input class="d-first" value="Prova" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;' +
      'padding:9px 11px;font:inherit;font-size:13px;color:#0f172a;background:#fff">' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#475569;margin:10px 0 4px">Nota (Invio va a capo)</label>' +
      '<textarea rows="2" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;' +
      'font:inherit;font-size:13px;color:#0f172a;background:#fff"></textarea></div>' +
      '<div style="display:flex;gap:8px"><button type="button" class="pm-btn-cancel d-cancel">Annulla</button>' +
      '<button type="button" class="pm-btn-primary d-ok">Conferma</button></div></div>';

    function close() {
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      if (opener && opener.focus) opener.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault(); ov.querySelector('.d-ok').click(); return;
      }
      if (e.key === 'Tab') {  /* focus trap */
        var f = ov.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    ov.querySelector('.d-x').onclick = close;
    ov.querySelector('.d-cancel').onclick = close;
    ov.querySelector('.d-ok').onclick = function () { close(); };
    document.addEventListener('keydown', onKey, true);
    if (window.lucide && lucide.createIcons) lucide.createIcons();
    var first = ov.querySelector('.d-first'); if (first) first.focus();
  }
  document.getElementById('demo-open').addEventListener('click', openDemo);

  /* ══════════════════════════════════════════════════════════════════════
     OFFICINA — modale campione disegnato dai token scelti nel banco.
     È l'unico posto dove si possono provare impaginazioni (colonne, cruscotto,
     testata, piè di pagina) senza deformare i modali reali.
     ══════════════════════════════════════════════════════════════════════ */
  (function () {
    var host = document.getElementById('off-host');
    if (!host) return;
    var OKEY = 'campionario_officina';
    var O = { testata: 'a', corpo: '1', side: '240', footer: 'dx', label: 'dentro' };
    try { var r = localStorage.getItem(OKEY); if (r) { var o = JSON.parse(r); for (var k in o) if (k in O) O[k] = o[k]; } } catch (e) { }

    function P() { return (window.MMBanco && window.MMBanco.P) || {}; }
    function val(k, def) { var v = P()[k]; return (!v || v === 'orig') ? def : v; }
    var OMBRE = {
      soft: '0 10px 30px -10px rgba(15,23,42,.25)',
      new: '0 25px 60px -12px rgba(0,0,0,.35)',
      flat: '0 0 0 1px #e2e8f0'
    };

    function tok() {
      var p = P();
      var rBtn = val('rBtn', '10');
      return {
        rBox: val('rBox', '16') + 'px',
        pad: val('dens', '22') + 'px',
        ombra: OMBRE[p.shadow] || OMBRE.new,
        rBtn: (rBtn === '999' ? '999' : rBtn) + 'px',
        rFld: val('rFld', '10') + 'px',
        ico: val('icoSize', '20'),
        icoC: val('icoColor', '#4f46e5') === 'currentColor' ? 'currentColor' : val('icoColor', '#4f46e5'),
        gap: val('btnGap', '8') + 'px',
        align: val('btnAlign', 'center'),
        dir: p.btnOrder === 'last' ? 'row-reverse' : 'row',
        tcase: val('btnCase', 'none'),
        track: (p.btnTrack === 'orig' || p.btnTrack === '0') ? 'normal' : p.btnTrack,
        fs: (p.btnFs && p.btnFs !== 'orig' ? p.btnFs : '12') + 'px'
      };
    }

    function ico(nome, px, colore) {
      return '<i data-lucide="' + nome + '" style="width:' + px + 'px;height:' + px + 'px;color:' +
        colore + ';flex:0 0 auto"></i>';
    }
    function btn(testo, ruolo, t, icona) {
      var c = ruolo === 'primary' ? 'background:#4f46e5;color:#fff;border:0;padding:9px 16px'
        : ruolo === 'danger' ? 'background:#fff;color:#dc2626;border:1px solid #fee2e2;padding:9px 14px'
          : 'background:#fff;color:#334155;border:1px solid #e2e8f0;padding:9px 14px';
      return '<button type="button" data-role="' + ruolo + '" style="' + c + ';border-radius:' + t.rBtn +
        ';font-size:' + t.fs + ';font-weight:700;cursor:pointer;display:inline-flex;' +
        'flex-direction:' + t.dir + ';align-items:center;justify-content:' + t.align + ';gap:' + t.gap +
        ';text-transform:' + t.tcase + ';letter-spacing:' + t.track + '">' +
        (icona ? ico(icona, Math.round(t.ico * 0.8), ruolo === 'primary' ? '#fff' : t.icoC) : '') +
        '<span>' + testo + '</span></button>';
    }
    function campo(etichetta, t, tipo) {
      /* variante C: font ereditato (16px), altezza 44 */
      var stile = 'width:100%;border:1px solid #e2e8f0;border-radius:' + t.rFld +
        ';padding:9px 11px;font:inherit;color:#0f172a;background:#fff';
      /* DECISIONE 4 (segnaposto): il campo resta senza etichetta visibile, ma
         porta sempre aria-label — altrimenti per un lettore di schermo è muto,
         perché il segnaposto sparisce appena si scrive. */
      var aria = ' aria-label="' + etichetta + '"';
      var input = tipo === 'select'
        ? '<select' + aria + ' style="' + stile + '"><option>' + (O.label === 'dentro' ? etichetta : 'Scegli…') + '</option></select>'
        : '<input class="mm-off-campo"' + aria + ' placeholder="' + (O.label === 'dentro' ? etichetta : 'Testo di prova') + '" style="' + stile + '">';
      if (O.label === 'dentro') return '<div style="margin-bottom:10px">' + input + '</div>';
      if (O.label === 'linea') {
        return '<label style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
          '<span style="flex:0 0 120px;font-size:11px;font-weight:700;color:#475569;text-align:right">' + etichetta + '</span>' +
          input + '</label>';
      }
      return '<label style="display:block;margin-bottom:10px">' +
        '<span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + etichetta + '</span>' +
        input + '</label>';
    }
    function sezione(titolo, dentro, t) {
      return '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:' +
        (parseInt(t.rBox, 10) - 4) + 'px;padding:13px 15px">' +
        '<span style="display:block;font-size:10px;font-weight:700;text-transform:uppercase;' +
        'letter-spacing:.08em;color:#94a3b8;margin-bottom:9px">' + titolo + '</span>' + dentro + '</div>';
    }

    function testataHtml(t) {
      if (O.testata === 'c') {
        return '<div style="text-align:center;margin-bottom:16px">' +
          '<div style="font-size:16px;font-weight:800;color:#0f172a">Titolo del modale</div>' +
          '<div style="font-size:11.5px;color:#94a3b8;margin-top:2px">contesto o nome del progetto</div></div>';
      }
      if (O.testata === 'b') {
        return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">' +
          ico('sparkles', t.ico, t.icoC) +
          '<div style="flex:1"><div style="font-size:16px;font-weight:800;color:#0f172a">Titolo del modale</div></div>' +
          '<button type="button" aria-label="Chiudi" style="background:none;border:0;color:#94a3b8;font-size:22px;line-height:1;cursor:pointer;padding:2px 4px">×</button></div>';
      }
      return '<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">' +
        '<div style="width:40px;height:40px;border-radius:' + Math.min(14, parseInt(t.rBox, 10)) + 'px;background:#eef2ff;' +
        'display:flex;align-items:center;justify-content:center;flex:0 0 auto">' + ico('sparkles', t.ico, t.icoC) + '</div>' +
        '<div style="flex:1"><div style="font-size:15px;font-weight:800;color:#0f172a;line-height:1.35">Titolo del modale</div>' +
        '<div style="font-size:11.5px;color:#94a3b8">contesto o nome del progetto</div></div>' +
        '<button type="button" aria-label="Chiudi" style="background:none;border:0;color:#94a3b8;font-size:22px;line-height:1;cursor:pointer;padding:2px 4px">×</button></div>';
    }

    function corpoHtml(t) {
      if (O.corpo === 'dash') {
        var tile = function (etichetta) {
          return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:' + (parseInt(t.rBox, 10) - 6) +
            'px;padding:11px 13px"><div style="font-size:9.5px;font-weight:700;text-transform:uppercase;' +
            'letter-spacing:.08em;color:#94a3b8">' + etichetta + '</div>' +
            '<div style="font-size:19px;font-weight:800;color:#0f172a;line-height:1.2">—</div></div>';
        };
        return '<div style="display:flex;gap:14px;align-items:stretch;min-height:190px">' +
          '<aside style="flex:0 0 ' + O.side + 'px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:' +
          (parseInt(t.rBox, 10) - 4) + 'px;padding:11px">' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:8px">Elenco</div>' +
          ['Voce attiva', 'Seconda voce', 'Terza voce'].map(function (v, i) {
            return '<div style="border-radius:9px;padding:7px 9px;font-size:12px;font-weight:' + (i === 0 ? '700' : '400') +
              ';color:' + (i === 0 ? '#4f46e5' : '#475569') + ';background:' + (i === 0 ? '#eef2ff' : 'transparent') + '">' + v + '</div>';
          }).join('') + '</aside>' +
          '<main style="flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;align-content:start">' +
          tile('Chiamate') + tile('Token') + tile('Costo') +
          '<div style="grid-column:1/-1">' + sezione('Dettaglio', campo('Filtro', t) + campo('Periodo', t, 'select'), t) + '</div>' +
          '</main></div>';
      }
      var n = parseInt(O.corpo, 10) || 1;
      var blocchi = [
        sezione('Sezione uno', campo('Nome', t) + campo('Tipo', t, 'select'), t),
        sezione('Sezione due', campo('Etichetta', t) +
          '<label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#334155;cursor:pointer">' +
          '<input type="checkbox" checked style="accent-color:#4f46e5;margin-top:2px"><span>Opzione con una riga di spiegazione</span></label>', t),
        sezione('Sezione tre', campo('Valore', t) + campo('Scelta', t, 'select'), t)
      ].slice(0, Math.max(1, n === 1 ? 2 : n));
      return '<div style="display:grid;grid-template-columns:repeat(' + n + ',1fr);gap:12px">' + blocchi.join('') + '</div>';
    }

    function footerHtml(t) {
      if (O.footer === 'full') {
        return '<div style="display:flex;gap:8px;margin-top:16px">' +
          '<div style="flex:1;display:flex">' + btn('Annulla', 'secondary', t) + '</div>' +
          '<div style="flex:2;display:flex">' + btn('Conferma', 'primary', t, 'check') + '</div></div>';
      }
      if (O.footer === 'split') {
        return '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px">' +
          btn('Elimina', 'danger', t, 'trash-2') +
          '<div style="display:flex;gap:8px">' + btn('Annulla', 'secondary', t) + btn('Conferma', 'primary', t, 'check') + '</div></div>';
      }
      return '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">' +
        btn('Annulla', 'secondary', t) + btn('Conferma', 'primary', t, 'check') + '</div>';
    }

    function larghezza() {
      var sz = P().sz;
      if (sz && sz !== 'orig') return sz + 'px';
      return O.corpo === 'dash' ? '1160px' : O.corpo === '3' ? '820px' : O.corpo === '2' ? '820px' : '600px';
    }

    function disegna() {
      var t = tok();
      host.style.maxWidth = larghezza();
      host.innerHTML = '<div class="mm-off-box" role="dialog" aria-modal="true" style="background:#fff;border-radius:' + t.rBox +
        ';box-shadow:' + t.ombra + ';padding:' + t.pad + ';width:100%">' +
        testataHtml(t) + corpoHtml(t) + footerHtml(t) + '</div>';
      if (window.lucide && window.lucide.createIcons) { try { window.lucide.createIcons(); } catch (e) { } }
      if (window.getIconStyle && window.getIconStyle() === 'android' && window._emojifyIcons) window._emojifyIcons(host);
      cssFuori(t);
      try { localStorage.setItem(OKEY, JSON.stringify(O)); } catch (e) { }
    }

    /* ── CSS risultante: variabili + pm-* riscritte sui valori scelti ─── */
    function cssFuori(t) {
      var pre = document.getElementById('off-css'); if (!pre) return;
      var velo = P().velo && P().velo !== 'orig' ? P().velo : 'rgba(15,23,42,.45)';
      var lines = [
        ':root {',
        '  --mm-accent:      #4f46e5;      /* accento unico (202 occorrenze nel codice) */',
        '  --mm-accent-soft: #eef2ff;',
        '  --mm-testo:       #0f172a;',
        '  --mm-testo-2:     #475569;',
        '  --mm-testo-3:     #94a3b8;',
        '  --mm-bordo:       #e2e8f0;',
        '  --mm-fondo-sez:   #f8fafc;',
        '  --mm-velo:        ' + velo + ';',
        '  --mm-r-box:       ' + t.rBox + ';',
        '  --mm-r-campo:     ' + t.rFld + ';',
        '  --mm-r-btn:       ' + t.rBtn + ';',
        '  --mm-ombra:       ' + t.ombra + ';',
        '  --mm-pad:         ' + t.pad + ';',
        '  --mm-icona:       ' + t.ico + 'px;',
        '  --mm-btn-gap:     ' + t.gap + ';',
        '  --mm-btn-fs:      ' + t.fs + ';   /* variante C: 12px come nei moduli */',
        '  --mm-s:  440px;  --mm-m: 600px;  --mm-l: 820px;  --mm-xl: 1160px;',
        '}',
        '',
        '.mm-overlay {',
        '  position: fixed; inset: 0; z-index: 2000; display: flex;',
        '  align-items: center; justify-content: center; padding: 18px;',
        '  background: var(--mm-velo); backdrop-filter: blur(3px);',
        '}',
        '.mm-box {',
        '  background: #fff; border-radius: var(--mm-r-box); box-shadow: var(--mm-ombra);',
        '  width: min(var(--mm-m), 94vw); max-height: 88vh; overflow-y: auto; padding: var(--mm-pad);',
        '}',
        '.mm-box--s  { width: min(var(--mm-s), 94vw); }',
        '.mm-box--l  { width: min(var(--mm-l), 94vw); }',
        '.mm-box--xl { width: min(var(--mm-xl), 94vw); }',
        '',
        '/* testata — variante «' + ({ a: 'icona in riquadro', b: 'icona in linea', c: 'titolo centrato' }[O.testata]) + '» */',
        '.mm-head { display:flex; align-items:flex-start; gap:12px; margin-bottom:16px;' +
        (O.testata === 'c' ? ' text-align:center; justify-content:center;' : '') + ' }',
        '.mm-head__ico { width:40px; height:40px; border-radius:14px; background:var(--mm-accent-soft);',
        '                display:flex; align-items:center; justify-content:center; flex:0 0 auto; }',
        '.mm-head__ico svg, .mm-head svg { width:var(--mm-icona); height:var(--mm-icona); color:' + t.icoC + '; }',
        '.mm-title    { font-size:15px; font-weight:800; color:var(--mm-testo); line-height:1.35; }',
        '.mm-subtitle { font-size:11.5px; color:var(--mm-testo-3); }',
        '',
        '/* corpo — ' + (O.corpo === 'dash' ? 'cruscotto con barra laterale ' + O.side + 'px' : O.corpo + ' colonna/e') + ' */',
        O.corpo === 'dash'
          ? '.mm-body { display:flex; gap:14px; align-items:stretch; }\\n.mm-body__side { flex:0 0 ' + O.side + 'px; }\\n.mm-body__main { flex:1; display:grid; grid-template-columns:repeat(3,1fr); gap:10px; align-content:start; }'
          : '.mm-body { display:grid; grid-template-columns:repeat(' + (parseInt(O.corpo, 10) || 1) + ',1fr); gap:12px; }',
        '.mm-sez  { background:var(--mm-fondo-sez); border:1px solid var(--mm-bordo);',
        '           border-radius:calc(var(--mm-r-box) - 4px); padding:13px 15px; }',
        '.mm-sez__t { display:block; font-size:10px; font-weight:700; text-transform:uppercase;',
        '           letter-spacing:.08em; color:var(--mm-testo-3); margin-bottom:9px; }',
        '',
        '/* campi — etichetta ' + ({ sopra: 'sopra il campo', linea: 'in linea a sinistra', dentro: 'solo come segnaposto' }[O.label]) + ' */',
        '/* variante C: font ereditato → 16px, altezza 44px */',
        '.mm-campo { width:100%; border:1px solid var(--mm-bordo); border-radius:var(--mm-r-campo);',
        '            padding:9px 11px; font:inherit; color:var(--mm-testo); background:#fff; }',
        '.mm-campo::placeholder { color:var(--mm-testo-3); opacity:1; }',
        '.mm-campo:focus { outline:none; box-shadow:0 0 0 2px #a5b4fc; }',
        '.mm-label { display:block; font-size:11px; font-weight:700; color:var(--mm-testo-2); margin-bottom:4px; }',
        '',
        '/* bottoni — piè di pagina «' + ({ dx: 'a destra', full: 'a piena larghezza', split: 'distruttivo a sinistra' }[O.footer]) + '» */',
        '.mm-btn {',
        '  display:inline-flex; flex-direction:' + t.dir + '; align-items:center; justify-content:' + t.align + ';',
        '  gap:var(--mm-btn-gap); border-radius:var(--mm-r-btn); padding:9px 14px;',
        '  font-size:var(--mm-btn-fs); font-weight:700; text-transform:' + t.tcase + '; letter-spacing:' + t.track + '; cursor:pointer;',
        '}',
        '.mm-btn svg { width:calc(var(--mm-icona) * .8); height:calc(var(--mm-icona) * .8); }',
        '.mm-btn--primary   { background:var(--mm-accent); color:#fff; border:0; padding:9px 16px; }',
        '.mm-btn--secondary { background:#fff; color:#334155; border:1px solid var(--mm-bordo); }',
        '.mm-btn--danger    { background:#fff; color:#dc2626; border:1px solid #fee2e2; }',
        '.mm-foot {' + (O.footer === 'full'
          ? ' display:flex; gap:8px; margin-top:16px; } .mm-foot .mm-btn--secondary{flex:1} .mm-foot .mm-btn--primary{flex:2}'
          : O.footer === 'split'
            ? ' display:flex; justify-content:space-between; gap:8px; margin-top:16px; }'
            : ' display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }'),
        '',
        '/* ⚠ perché queste misure abbiano effetto sui bottoni, in style.css:87',
        '   la regola  button { font-size:16px !important }  va ristretta ai soli',
        '   controlli a11y (.a11y-btn, .tts-button, #modal-a11y-toolbar). */'
      ];
      pre.textContent = lines.join('\\n');
    }

    document.querySelectorAll('.seg[data-off]').forEach(function (seg) {
      var key = seg.getAttribute('data-off');
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        O[key] = b.getAttribute('data-v');
        seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        disegna();
      });
      seg.querySelectorAll('button').forEach(function (x) {
        x.classList.toggle('on', x.getAttribute('data-v') === O[key]);
      });
    });

    document.getElementById('off-copy').addEventListener('click', function () {
      var pre = document.getElementById('off-css');
      var t = this;
      function fatto() { t.textContent = 'Copiato ✓'; setTimeout(function () { t.textContent = 'Copia'; }, 1400); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pre.textContent).then(fatto, function () { });
      else {
        var s = window.getSelection(), r = document.createRange();
        r.selectNodeContents(pre); s.removeAllRanges(); s.addRange(r);
        try { document.execCommand('copy'); fatto(); } catch (e) { }
      }
    });

    window.MMOfficina = { disegna: disegna, O: O };
    disegna();
  })();

  /* ══════════════════════════════════════════════════════════════════════
     BANCO DI PROVA — applica i token ai campioni.
     Gli stili vanno INLINE con priorità important: contro le utility Tailwind
     dei campioni una regola di foglio non è affidabile (specificità e ordine
     variano da modale a modale). Ogni elemento conserva il proprio stile
     iniziale in data-css0 e viene ripristinato prima di ogni applicazione.
     ══════════════════════════════════════════════════════════════════════ */
  (function () {
    var KEY = 'campionario_modali_prefs';
    var DEF = {
      sz: 'orig', dens: 'orig', velo: 'orig', rBox: 'orig', shadow: 'orig',
      btn: 'orig', rBtn: 'orig', btnAlign: 'orig', btnOrder: 'orig', btnGap: 'orig',
      btnCase: 'orig', btnTrack: 'orig', btnFs: 'orig', btnfs: false,
      fld: 'orig', rFld: 'orig', icoSize: 'orig', icoColor: 'orig',
      esc: true, enter: true, trap: true, back: true, aperto: true, perCamp: {}
    };
    /* DECISIONI PRESE il 29/7/2026 (§6). Sono anche i valori più frequenti
       nel codice: la decisione ha dichiarato quello che l'app già faceva. */
    var CONSIGLIATI = {
      sz: 'orig', dens: '22', velo: 'rgba(15,23,42,.45)', rBox: '16', shadow: 'new',
      btn: 'uni', rBtn: '10', btnAlign: 'center', btnOrder: 'first', btnGap: '8',
      btnCase: 'none', btnTrack: '0', btnFs: '12', fld: 'uni', rFld: '10', icoSize: '20', icoColor: '#4f46e5'
    };
    var P = {}; for (var d in DEF) P[d] = DEF[d];
    try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); for (var k in o) if (k in DEF) P[k] = o[k]; } } catch (e) { }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }

    /* ── individua il riquadro vero del campione ───────────────────────── */
    function trasparente(el) {
      var c = getComputedStyle(el).backgroundColor;
      return c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    }
    function boxOf(sec) {
      var host = sec.querySelector('.palco-in');
      if (!host || !host.firstElementChild) return null;
      var el = host.firstElementChild;
      while (el.children.length === 1 && trasparente(el)) el = el.firstElementChild;
      return el;
    }

    /* ── ruolo di un bottone ───────────────────────────────────────────── */
    function ruoloDi(b) {
      var t = (b.textContent || '').trim().toLowerCase();
      if (!t || t.length <= 2) return 'icona';
      if (/elimina|cancella|rimuovi|svuota|delete/.test(t)) return 'danger';
      if (/annulla|indietro|chiudi|cancel|non ora|ho capito/.test(t)) return 'secondary';
      var cl = String(b.className || '');
      if (/pm-btn-primary|btn_salva_action|btn_confirm_action/.test(cl)) return 'primary';
      var bg = getComputedStyle(b).backgroundColor;
      if (/rgb\(79, 70, 229\)|rgb\(99, 102, 241\)|rgb\(52, 211, 153\)|rgb\(16, 185, 129\)|rgb\(220, 38, 38\)/.test(bg)) return 'primary';
      var par = b.parentElement;
      if (par && par.lastElementChild === b && par.querySelectorAll('button').length > 1) return 'primary';
      return 'secondary';
    }
    function corpoDichiarato(b) {
      if (b.getAttribute('data-inline-fs')) return b.getAttribute('data-inline-fs');
      var cl = String(b.className || '');
      var m = /text-\[(\d+(?:\.\d+)?)px\]/.exec(cl);
      if (m) return m[1] + 'px';
      if (/pm-btn-(primary|cancel)/.test(cl)) return '12px';
      if (/btn_(salva|annulla)_action/.test(cl)) return '18px';
      if (/btn_confirm_action/.test(cl)) return '14px';
      if (/btn_header_setting/.test(cl)) return '12px';
      return '';
    }

    /* ── memoria dello stile iniziale ──────────────────────────────────── */
    function ricorda(el) {
      if (el.getAttribute('data-css0') === null) el.setAttribute('data-css0', el.getAttribute('style') || '');
    }
    function ripristina(el) {
      var s = el.getAttribute('data-css0');
      if (s) el.setAttribute('style', s); else el.removeAttribute('style');
    }
    function imp(el, prop, val) { if (val) el.style.setProperty(prop, val, 'important'); }

    var sezioni = [].slice.call(document.querySelectorAll('section.camp'));

    function prepara() {
      sezioni.forEach(function (sec) {
        var b = boxOf(sec);
        if (b) { b.classList.add('mm-box'); ricorda(b); }
        var palco = sec.querySelector('.palco');
        if (palco && !palco.querySelector('.velo')) {
          var v = document.createElement('div'); v.className = 'velo';
          palco.insertBefore(v, palco.firstChild);
        }
        var host = sec.querySelector('.palco-in');
        if (host && host.getAttribute('data-mw0') === null) host.setAttribute('data-mw0', host.style.maxWidth || '');
        sec.querySelectorAll('.palco button').forEach(function (bt) {
          bt.setAttribute('type', 'button');
          bt.setAttribute('data-inline-fs', (bt.style && bt.style.fontSize) || '');
          bt.setAttribute('data-role', ruoloDi(bt));
          bt.setAttribute('data-dich', corpoDichiarato(bt));
          ricorda(bt);
        });
        sec.querySelectorAll('.palco input, .palco textarea, .palco select').forEach(ricorda);
        sec.querySelectorAll('.palco svg.lucide, .palco span.lucide-emoji').forEach(ricorda);
      });
    }

    /* ── i tre pennelli ────────────────────────────────────────────────── */
    var OMBRE = {
      soft: '0 10px 30px -10px rgba(15,23,42,.25)',
      new: '0 25px 60px -12px rgba(0,0,0,.35)',
      flat: '0 0 0 1px #e2e8f0'
    };
    /* La proposta ha una pelle sua (.prop-skin): il banco governa gli
       ORIGINALI, non ci dipinge sopra — altrimenti raggio, padding e icone
       della proposta verrebbero riscritti dai token del banco. */
    function inProposta(el) { return !!(el.closest && el.closest('.prop-skin')); }

    function pennelloBox(box) {
      ripristina(box);
      if (inProposta(box)) return;
      if (P.rBox !== 'orig') imp(box, 'border-radius', P.rBox + 'px');
      if (P.shadow !== 'orig') imp(box, 'box-shadow', OMBRE[P.shadow]);
      if (P.dens !== 'orig') imp(box, 'padding', P.dens + 'px');
    }
    /* VARIANTE C — il bottone dei moduli: raggio 10, 9px 14px (16 sul primario),
       corpo 12px, peso 700. Il grigio del secondario è #334155, non #475569. */
    var COLORI = {
      primary: { bg: '#4f46e5', fg: '#fff', bd: '0', pad: '9px 16px' },
      secondary: { bg: '#fff', fg: '#334155', bd: '1px solid #e2e8f0', pad: '9px 14px' },
      danger: { bg: '#fff', fg: '#dc2626', bd: '1px solid #fee2e2', pad: '9px 14px' }
    };
    function pennelloBtn(b) {
      ripristina(b);
      if (inProposta(b)) return;
      var ruolo = b.getAttribute('data-role');
      if (P.btn === 'uni' && COLORI[ruolo]) {
        var c = COLORI[ruolo];
        imp(b, 'background-image', 'none');
        imp(b, 'background-color', c.bg);
        imp(b, 'color', c.fg);
        imp(b, 'border', c.bd);
        imp(b, 'font-size', (P.btnFs && P.btnFs !== 'orig' ? P.btnFs : '12') + 'px');
        imp(b, 'font-weight', '700');
        imp(b, 'padding', c.pad);
        imp(b, 'height', 'auto');
        imp(b, 'box-shadow', 'none');
        imp(b, 'text-transform', 'none');
        imp(b, 'letter-spacing', 'normal');
      }
      if (ruolo !== 'icona') {
        if (P.rBtn !== 'orig') imp(b, 'border-radius', P.rBtn === '999' ? '999px' : P.rBtn + 'px');
        if (P.btnAlign !== 'orig') { imp(b, 'display', 'inline-flex'); imp(b, 'align-items', 'center'); imp(b, 'justify-content', P.btnAlign); }
        if (P.btnOrder !== 'orig') { imp(b, 'display', 'inline-flex'); imp(b, 'flex-direction', P.btnOrder === 'last' ? 'row-reverse' : 'row'); }
        if (P.btnGap !== 'orig') imp(b, 'gap', P.btnGap + 'px');
        if (P.btnCase !== 'orig') imp(b, 'text-transform', P.btnCase);
        if (P.btnTrack !== 'orig') imp(b, 'letter-spacing', P.btnTrack === '0' ? 'normal' : P.btnTrack);
      }
      if (P.btnFs && P.btnFs !== 'orig') imp(b, 'font-size', P.btnFs + 'px');
      if (P.btnfs) { var dd = b.getAttribute('data-dich'); if (dd) imp(b, 'font-size', dd); }
    }
    function pennelloFld(f) {
      ripristina(f);
      if (inProposta(f)) return;
      if (P.fld === 'uni') {
        /* VARIANTE C — il campo dei moduli (FLD): font ereditato → 16px, h 44px */
        imp(f, 'border', '1px solid #e2e8f0');
        imp(f, 'padding', '9px 11px');
        imp(f, 'font-size', 'inherit');
        imp(f, 'font-weight', 'inherit');
        imp(f, 'background-color', '#fff');
        imp(f, 'color', '#0f172a');
        imp(f, 'height', 'auto');
        imp(f, 'box-shadow', 'none');
        imp(f, 'border-radius', '10px');
      }
      if (P.rFld !== 'orig') imp(f, 'border-radius', P.rFld + 'px');
    }
    function pennelloIcona(i) {
      ripristina(i);
      if (inProposta(i)) return;
      var emoji = i.classList.contains('lucide-emoji');
      if (P.icoSize !== 'orig') {
        if (emoji) imp(i, 'font-size', P.icoSize + 'px');
        else { imp(i, 'width', P.icoSize + 'px'); imp(i, 'height', P.icoSize + 'px'); }
      }
      if (P.icoColor !== 'orig' && !emoji) imp(i, 'color', P.icoColor);
    }

    function misura() {
      sezioni.forEach(function (sec) {
        var b = sec.querySelector('.mm-box'), out = sec.querySelector('.reso');
        if (!b || !out) return;
        var r = b.getBoundingClientRect();
        out.textContent = 'reso ' + Math.round(r.width) + ' × ' + Math.round(r.height) + ' px';
      });
    }

    function applica() {
      document.body.setAttribute('data-velo', P.velo === 'orig' ? 'orig' : 'on');
      document.documentElement.style.setProperty('--velo', P.velo === 'orig' ? 'transparent' : P.velo);

      sezioni.forEach(function (sec) {
        var per = P.perCamp[sec.id] || '';
        var v = per || (P.sz !== 'orig' ? P.sz : '');
        var host = sec.querySelector('.palco-in');
        if (v) { sec.setAttribute('data-sz', ''); sec.style.setProperty('--sz', v + 'px'); if (host) host.style.maxWidth = v + 'px'; }
        else {
          sec.removeAttribute('data-sz'); sec.style.removeProperty('--sz');
          /* in modalità proposta la taglia la porta la classe mm-box--*: il
             tetto del campione originale la strozzerebbe (un cruscotto da 1160
             dentro un contenitore da 600). */
          if (host) host.style.maxWidth = sec.getAttribute('data-ver') === 'prop' ? '' : (host.getAttribute('data-mw0') || '');
        }
        var s = sec.querySelector('select.sz'); if (s) s.value = per;

        var box = sec.querySelector('.mm-box'); if (box) pennelloBox(box);
        sec.querySelectorAll('.palco button').forEach(pennelloBtn);
        sec.querySelectorAll('.palco input, .palco textarea, .palco select').forEach(function (f) {
          if (f.type === 'checkbox' || f.type === 'radio' || f.type === 'range') return;
          pennelloFld(f);
        });
        sec.querySelectorAll('.palco svg.lucide, .palco span.lucide-emoji').forEach(pennelloIcona);
      });

      document.querySelectorAll('.seg').forEach(function (seg) {
        var key = seg.getAttribute('data-key');
        if (key === 'icone') return;
        seg.querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('on', b.getAttribute('data-v') === String(P[key]));
        });
      });
      var cb = document.getElementById('opt-btnfs'); if (cb) cb.checked = !!P.btnfs;
      ['esc', 'enter', 'trap', 'back'].forEach(function (k) {
        var e = document.getElementById('k-' + k); if (e) e.checked = !!P[k];
      });
      if (window.MMOfficina) window.MMOfficina.disegna();
      misura();
      save();
    }

    /* ── pannello ─────────────────────────────────────────────────────── */
    var banco = document.getElementById('banco');
    var stato = document.getElementById('banco-stato');
    function apriChiudi(v) {
      P.aperto = v; banco.classList.toggle('chiuso', !v);
      stato.textContent = v ? 'aperto ▴' : 'chiuso ▾';
      save();
    }
    document.getElementById('banco-h').addEventListener('click', function () { apriChiudi(!P.aperto); });

    document.querySelectorAll('.seg').forEach(function (seg) {
      var key = seg.getAttribute('data-key');
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var v = b.getAttribute('data-v');
        if (key === 'icone') {
          seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
          if (window.setIconStyle) window.setIconStyle(v, true);
          setTimeout(function () { prepara(); applica(); }, 30);   // le icone sono nodi nuovi
          return;
        }
        P[key] = v; applica();
      });
    });

    document.getElementById('opt-btnfs').addEventListener('change', function (e) { P.btnfs = e.target.checked; applica(); });
    ['esc', 'enter', 'trap', 'back'].forEach(function (k) {
      document.getElementById('k-' + k).addEventListener('change', function (e) { P[k] = e.target.checked; save(); });
    });
    document.getElementById('banco-reset').addEventListener('click', function () {
      for (var k in DEF) if (k !== 'aperto') P[k] = DEF[k];
      P.perCamp = {}; applica();
    });
    document.getElementById('banco-adotta').addEventListener('click', function () {
      for (var k in CONSIGLIATI) P[k] = CONSIGLIATI[k];
      applica();
    });

    sezioni.forEach(function (sec) {
      var s = sec.querySelector('select.sz');
      if (s) s.addEventListener('change', function () {
        if (s.value) P.perCamp[sec.id] = s.value; else delete P.perCamp[sec.id];
        applica();
      });
      var a = sec.querySelector('.apri');
      if (a) a.addEventListener('click', function () { apriProva(sec, a); });
    });

    /* ── «Apri come modale» ───────────────────────────────────────────── */
    function apriProva(sec, opener) {
      var box = sec.querySelector('.mm-box'); if (!box) return;
      var ov = document.createElement('div');
      ov.className = 'palco prova';
      ov.style.setProperty('--velo-live', P.velo === 'orig' ? 'rgba(15,23,42,.45)' : P.velo);
      var per = P.perCamp[sec.id] || (P.sz !== 'orig' ? P.sz : '');
      ov.style.setProperty('--sz-live', per ? per + 'px' : 'none');

      var inn = document.createElement('div'); inn.className = 'palco-in';
      var clone = box.cloneNode(true);
      if (per) { clone.style.setProperty('width', '100%', 'important'); clone.style.setProperty('max-width', '100%', 'important'); }
      inn.appendChild(clone); ov.appendChild(inn);

      var hint = document.createElement('div'); hint.className = 'prova-hint';
      hint.textContent = 'ESC ' + (P.esc ? 'chiude' : 'inattivo') + ' · Invio ' + (P.enter ? 'conferma' : 'inattivo') +
        ' · Tab ' + (P.trap ? 'resta dentro' : 'esce') + ' · velo ' + (P.back ? 'chiude' : 'non chiude');
      ov.appendChild(hint);

      function chiudi() {
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        if (opener && opener.focus) opener.focus();
      }
      function fuocabili() {
        return [].slice.call(clone.querySelectorAll('button, input:not([type=hidden]), textarea, select, [tabindex]:not([tabindex="-1"])'))
          .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
      }
      function onKey(e) {
        if (e.key === 'Escape' && P.esc) { e.preventDefault(); chiudi(); return; }
        if (e.key === 'Enter' && P.enter && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          var prim = clone.querySelector('button[data-role="primary"]');
          if (prim) prim.click(); else chiudi();
          return;
        }
        if (e.key === 'Tab' && P.trap) {
          var f = fuocabili(); if (!f.length) return;
          var primo = f[0], ultimo = f[f.length - 1];
          if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
          else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
        }
      }
      ov.addEventListener('click', function (e) { if (e.target === ov && P.back) chiudi(); });
      clone.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button');
        if (b && /annulla|chiudi|indietro|conferma|salva|avvia|procedi|ho capito/i.test((b.textContent || '').trim())) chiudi();
      });
      document.body.appendChild(ov);
      document.addEventListener('keydown', onKey, true);
      var primoCampo = clone.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, select')
        || clone.querySelector('button[data-role="primary"]') || clone;
      if (primoCampo.focus) { try { primoCampo.focus({ preventScroll: true }); } catch (e2) { primoCampo.focus(); } }
    }

    window.MMBanco = { P: P, DEF: DEF, CONSIGLIATI: CONSIGLIATI, applica: applica, misura: misura, prepara: prepara, OMBRE: OMBRE };
    prepara();
    if (window.getIconStyle && window.setIconStyle) {
      var st = window.getIconStyle();
      document.querySelectorAll('.seg[data-key="icone"] button').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-v') === st);
      });
      if (st === 'android') { window.setIconStyle('android', true); prepara(); }
    }
    apriChiudi(!!P.aperto);
    applica();
    window.addEventListener('resize', misura);
  })();

  /* ══════════════════════════════════════════════════════════════════════
     ORIGINALE ↔ PROPOSTA — un toggle per ogni campione.
     Dove esiste una proposta scritta a mano (window.MM_PROPOSTE) si mostra
     quella; altrimenti se ne genera una BOZZA leggendo il modale originale:
     titolo → mm-head, riquadri → mm-sez, campi → mm-campo, bottoni → mm-btn.
     È un primo getto onesto, non un ridisegno: serve a vedere quanto della
     forma attuale sopravvive ai token, e dove invece serve pensarci.
     ══════════════════════════════════════════════════════════════════════ */
  (function () {
    var MANO = window.MM_PROPOSTE || {};
    var originali = {};       /* id → innerHTML del campione originale */
    var TAGLIE = [440, 600, 820, 1160];

    function testo(el) { return (el && el.textContent || '').replace(/\\s+/g, ' ').trim(); }
    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function tagliaVicina(w) {
      var best = TAGLIE[0];
      TAGLIE.forEach(function (t) { if (Math.abs(t - w) < Math.abs(best - w)) best = t; });
      return best;
    }
    function nomeIcona(box) {
      var svg = box.querySelector('svg.lucide');
      if (svg) { var n = null; svg.classList.forEach(function (c) { if (c.indexOf('lucide-') === 0) n = c.slice(7); }); if (n) return n; }
      var i = box.querySelector('i[data-lucide]');
      if (i) return i.getAttribute('data-lucide');
      var e = box.querySelector('span.lucide-emoji[data-icon]');
      if (e) return e.getAttribute('data-icon');
      return 'square';
    }

    /* etichetta di un campo: aria-label, o la label che lo contiene, o il
       testo che lo precede, o il segnaposto. Se non c'è niente, si dichiara. */
    function etichettaDi(c) {
      var a = c.getAttribute('aria-label'); if (a) return a;
      var lab = c.closest('label');
      if (lab) { var t = testo(lab); if (t) return t.slice(0, 60); }
      var prev = c.previousElementSibling;
      while (prev && !testo(prev)) prev = prev.previousElementSibling;
      if (prev) return testo(prev).slice(0, 60);
      if (c.placeholder) return c.placeholder;
      return '(campo senza etichetta)';
    }

    function campoHtml(c) {
      var et = esc(etichettaDi(c));
      var tag = c.tagName.toLowerCase();
      var inner;
      if (tag === 'select') {
        inner = '<select class="mm-campo" aria-label="' + et + '">' +
          [].slice.call(c.options).slice(0, 6).map(function (o) { return '<option>' + esc(o.textContent) + '</option>'; }).join('') +
          '</select>';
      } else if (tag === 'textarea') {
        inner = '<textarea class="mm-campo" rows="' + (c.rows || 2) + '" aria-label="' + et + '">' + esc(c.value) + '</textarea>';
      } else {
        inner = '<input class="mm-campo" type="' + (c.type === 'number' ? 'number' : 'text') + '" value="' + esc(c.value) +
          '" placeholder="' + esc(c.placeholder || '') + '" aria-label="' + et + '">';
      }
      return '<label style="display:block;margin-bottom:10px"><span class="mm-label">' + et + '</span>' + inner + '</label>';
    }

    function spuntaHtml(c) {
      var lab = c.closest('label');
      var t = lab ? testo(lab) : testo(c.parentElement);
      return '<label style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;padding:3px 0">' +
        '<input type="' + c.type + '"' + (c.checked ? ' checked' : '') + ' style="accent-color:var(--mm-accent);margin-top:2px;flex:0 0 auto">' +
        '<span style="font-size:12.5px;font-weight:700;color:var(--mm-testo-2)">' + esc(t.slice(0, 90) || 'opzione') + '</span></label>';
    }

    /* ── bozza automatica ─────────────────────────────────────────────── */
    function bozza(sec, box) {
      var titolo = testo(box.querySelector('.pm-title, h1, h2, h3, .modal_title')) ||
        (sec.querySelector('.camp-head h3') ? testo(sec.querySelector('.camp-head h3')).split('·')[0].trim() : 'Modale');
      var sub = testo(box.querySelector('.pm-subtitle'));
      var icona = nomeIcona(box);
      var w = Math.round(box.getBoundingClientRect().width) || 600;
      var taglia = tagliaVicina(w);

      /* contenitori che nell'originale fanno già da «sezione» */
      var blocchi = [].slice.call(box.querySelectorAll('.pm-section, .mm-sez, [class*="bg-slate-50"], [class*="bg-indigo-50"]'))
        .filter(function (b, i, arr) { return !arr.some(function (o) { return o !== b && o.contains(b); }); });
      if (!blocchi.length) blocchi = [box];

      var visti = [];      /* niente deve sparire nel passaggio: si tiene il conto */
      function btnHtml(b) {
        var r = b.getAttribute('data-role') || 'secondary';
        if (r === 'icona') return '';
        return '<button type="button" class="mm-btn mm-btn--' + r + '" data-role="' + r + '">' +
          esc(testo(b).slice(0, 34)) + '</button>';
      }

      var sezioni = blocchi.map(function (b, i) {
        var tit = testo(b.querySelector('.pm-section-title, [class*="uppercase"]')) || ('Sezione ' + (i + 1));
        var dentro = '';
        [].slice.call(b.querySelectorAll('input, select, textarea')).forEach(function (c) {
          if (c.type === 'hidden' || c.type === 'file') return;
          visti.push(c);
          dentro += (c.type === 'checkbox' || c.type === 'radio') ? spuntaHtml(c) : campoHtml(c);
        });
        /* i bottoni che vivono DENTRO un riquadro restano lì: nel piè di pagina
           vanno solo le azioni finali, non i «Come ottenerla?» di mezzo modale */
        var bs = [].slice.call(b.querySelectorAll('button[data-role]')).map(btnHtml).filter(Boolean);
        if (bs.length) { visti = visti.concat([].slice.call(b.querySelectorAll('button[data-role]')));
          dentro += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">' + bs.join('') + '</div>'; }
        if (!dentro) {
          var t = testo(b).slice(0, 220);
          dentro = '<p style="margin:0;font-size:12.5px;color:var(--mm-testo-2);line-height:1.65">' + esc(t || '—') + '</p>';
        }
        return '<div class="mm-sez"><span class="mm-sez__t">' + esc(tit.slice(0, 48)) + '</span>' + dentro + '</div>';
      });

      /* campi rimasti fuori da ogni riquadro: nessuna perdita silenziosa */
      var orfani = [].slice.call(box.querySelectorAll('input, select, textarea')).filter(function (c) {
        return c.type !== 'hidden' && c.type !== 'file' && visti.indexOf(c) < 0;
      });
      if (orfani.length) {
        var dentroO = orfani.map(function (c) {
          return (c.type === 'checkbox' || c.type === 'radio') ? spuntaHtml(c) : campoHtml(c);
        }).join('');
        sezioni.push('<div class="mm-sez"><span class="mm-sez__t">Altri campi</span>' + dentroO + '</div>');
      }

      var col = sezioni.length >= 6 ? 3 : sezioni.length >= 3 ? 2 : 1;
      if (taglia <= 600) col = 1;

      var bottoni = [].slice.call(box.querySelectorAll('button[data-role]'))
        .filter(function (b) { return b.getAttribute('data-role') !== 'icona' && visti.indexOf(b) < 0; });
      var pie = bottoni.length
        ? bottoni.map(function (b) {
          var r = b.getAttribute('data-role');
          return '<button type="button" class="mm-btn mm-btn--' + r + '" data-role="' + r + '">' + esc(testo(b).slice(0, 34)) + '</button>';
        }).join('')
        : '<button type="button" class="mm-btn mm-btn--primary" data-role="primary">Ho capito</button>';

      return '<div class="mm-box' + (taglia === 600 ? '' : ' mm-box--' + (taglia === 440 ? 's' : taglia === 820 ? 'l' : 'xl')) +
        '" role="dialog" aria-modal="true">' +
        '<div class="mm-head"><div class="mm-head__ico"><i data-lucide="' + esc(icona) + '"></i></div>' +
        '<div style="flex:1"><div class="mm-title">' + esc(titolo.slice(0, 70)) + '</div>' +
        (sub ? '<div class="mm-subtitle">' + esc(sub.slice(0, 90)) + '</div>' : '') + '</div>' +
        '<button type="button" class="mm-close" aria-label="Chiudi">×</button></div>' +
        '<div class="mm-body' + (col > 1 ? ' mm-body--' + col : '') + '">' + sezioni.join('') + '</div>' +
        '<div class="mm-foot" style="justify-content:flex-end">' + pie + '</div></div>';
    }

    /* ── scambio ──────────────────────────────────────────────────────── */
    function mostra(sec, quale) {
      var host = sec.querySelector('.palco-in');
      if (originali[sec.id] === undefined) originali[sec.id] = host.innerHTML;

      if (quale === 'prop') {
        var box = sec.querySelector('.mm-box');
        var html = MANO[sec.id] || bozza(sec, box);
        host.innerHTML = '<div class="prop-skin">' + html + '</div>';
        sec.setAttribute('data-ver', 'prop');
        sec.classList.add('in-prop');
        var nota = sec.querySelector('.prop-nota');
        if (nota) nota.textContent = MANO[sec.id]
          ? 'Proposta ridisegnata a mano: cambia l’impaginazione, non solo la vernice.'
          : 'Bozza automatica: il contenuto dell’originale rimontato sui token. Serve a vedere cosa sopravvive, non è un ridisegno.';
      } else {
        host.innerHTML = originali[sec.id];
        sec.removeAttribute('data-ver');
        sec.classList.remove('in-prop');
      }
      if (window.lucide && window.lucide.createIcons) { try { window.lucide.createIcons(); } catch (e) { } }
      if (window.getIconStyle && window.getIconStyle() === 'android' && window._emojifyIcons) window._emojifyIcons(host);
      if (window.MMBanco) { window.MMBanco.prepara(); window.MMBanco.applica(); }
    }

    document.querySelectorAll('section.camp').forEach(function (sec) {
      var seg = sec.querySelector('.seg-ver');
      if (!seg) return;
      if (MANO[sec.id]) {
        var b = seg.querySelector('button[data-v="prop"]');
        b.textContent = 'proposta ✱';
        b.title = 'Ridisegnata a mano';
      }
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        mostra(sec, b.getAttribute('data-v'));
      });
    });

    window.MMProposte = { mostra: mostra, mano: Object.keys(MANO) };
  })();

  /* misure vere dei tre campi a confronto (§4.3): lette dal layout, non stimate */
  document.querySelectorAll('.confronto .misura').forEach(function (m) {
    var inp = m.parentElement.querySelector('input');
    if (!inp) return;
    var cs = getComputedStyle(inp);
    m.textContent = 'altezza ' + Math.round(inp.getBoundingClientRect().height) + 'px · corpo ' +
      cs.fontSize + ' · raggio ' + cs.borderTopLeftRadius + ' · bordo ' + cs.borderTopColor;
  });

  /* misure vere dei bottoni a confronto: dichiarato vs reso */
  (function () {
    var host = document.getElementById('mis-btn'); if (!host) return;
    document.querySelectorAll('.confronto .col button').forEach(function (b) {
      var c = getComputedStyle(b);
      var dich = b.style.fontSize || (/btn_(salva|annulla)/.test(b.className) ? '18px (con !important)' : '12px (classe pm-*)');
      var d = document.createElement('div');
      d.textContent = '· ' + (b.className || 'bottone inline') + ' — dichiarato ' + dich +
        ', reso ' + c.fontSize + ', altezza ' + Math.round(b.getBoundingClientRect().height) + 'px';
      host.appendChild(d);
    });
  })();

  /* i campioni sono vetrina: nessun clic deve fare nulla */
  document.querySelectorAll('.palco').forEach(function (p) {
    p.addEventListener('submit', function (e) { e.preventDefault(); });
  });
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');
console.log('scritto:', path.relative(ROOT, OUT));
console.log('  statici:', nStatic, '· dinamici scansionati:', nDyn, '· campioni dinamici resi:', dynSamples.length);
console.log('  larghezze diverse:', allW.length, '· veli diversi:', allBg.length);
console.log('  ESC statici:', escStatic + '/' + nStatic, '· ESC dinamici:', escDyn + '/' + nDyn, '· Invio dinamici:', entDyn + '/' + nDyn);
