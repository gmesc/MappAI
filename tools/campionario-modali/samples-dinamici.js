/* Campionario modali — CAMPIONI DINAMICI
 *
 * Ogni voce è la scocca REALE del modale, trascritta dalla stringa che il modulo
 * costruisce a runtime (stessi stili inline, stessi colori, stesse misure).
 * `src` punta al file:riga da cui è copiata: se lì cambia qualcosa, questo file
 * va aggiornato — il generatore non può leggere stringhe concatenate a runtime.
 *
 * Campi:
 *   id, nome, src, larghezza, esc, enter, backdrop (click sullo sfondo chiude),
 *   note  — comportamento tastiera osservato NEL CODICE, non supposto
 *   html  — markup del riquadro (SENZA l'overlay: lo mette il generatore)
 */
'use strict';

const HUB_CARD = (icon, title) =>
    `<button type="button" style="display:flex;gap:10px;align-items:center;width:100%;text-align:left;background:#fff;
        border:1px solid #e2e8f0;border-radius:12px;padding:13px 14px;cursor:pointer;transition:border-color .15s">
        <i data-lucide="${icon}" style="width:20px;height:20px;color:#4f46e5;flex:0 0 auto"></i>
        <span style="font-weight:700;font-size:13.5px;color:#0f172a">${title}</span>
    </button>`;

const HUB_SECTION = (txt) =>
    `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:14px 0 8px">${txt}</div>`;

/* scocca condivisa da menu-hubs / tutor-teacher / live-teacher / collab-teacher */
const hubShell = (icon, title, body, bg) => `
<div style="background:${bg || '#f8fafc'};border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);
     width:100%;max-height:88vh;overflow-y:auto;padding:20px 24px" role="dialog" aria-modal="true">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#0f172a">
      <i data-lucide="${icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto"></i>${title}</div>
    <button type="button" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px" aria-label="Chiudi">×</button>
  </div>
  ${body}
</div>`;

const FLD = 'width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff';
const clsBtn = (label, style) =>
    `<button type="button" style="border:none;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:700;font-size:12px;${style}">${label}</button>`;

module.exports = [

    /* ─────────────────────────────────────────────── hub (menu azioni) */
    {
        id: 'dyn-hub',
        nome: 'Hub «Materiali di studio» (buildHubModal)',
        src: 'public/js/mappai-menu-hubs.js:85',
        larghezza: '760px', esc: true, enter: false, backdrop: true,
        note: 'ESC rimuove l’overlay. Invio: nessun binding. Nessun focus trap, il fuoco resta dove era.',
        html: hubShell('folder-open', 'Materiali di studio',
            HUB_SECTION('Stampati') +
            `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                ${HUB_CARD('layout-grid', 'Foglio dei nodi')}${HUB_CARD('file-text', 'Sintesi di ramo')}
                ${HUB_CARD('printer', 'Stampa dossier')}${HUB_CARD('calendar-clock', 'Timeline')}</div>` +
            HUB_SECTION('Jigsaw') +
            `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                ${HUB_CARD('upload', 'Esporta pezzo')}${HUB_CARD('puzzle', 'Ricomponi')}</div>`)
    },

    /* ─────────────────────────────────────── launcher Studio attivo */
    {
        id: 'dyn-active-study',
        nome: 'Studio attivo — launcher (buildModal)',
        src: 'public/js/mappai-active-study.js:1534',
        larghezza: '980px (default 520px)', esc: false, enter: false, backdrop: true,
        note: 'Nessun ESC. Dichiara font-family:system-ui inline, ma la regola globale ' +
              '`* { font-family: Space Mono !important }` di style.css la sovrascrive: a schermo è Space Mono.',
        html: `
<div role="dialog" aria-modal="true" style="background:#fff;border-radius:16px;width:100%;max-height:84vh;overflow:auto;
     box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px;font-family:system-ui,sans-serif">
  <h3 style="display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:18px;color:#0f172a;font-weight:700">
    <i data-lucide="puzzle" style="width:22px;height:22px;color:#4f46e5"></i>Studio attivo — scegli una modalità</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:0 0 8px">Modalità di studio</div>
      <div style="display:grid;gap:8px">
        ${HUB_CARD('pencil-line', 'Ricostruisci la mappa')}
        ${HUB_CARD('git-branch', 'Riordina i rami')}
        ${HUB_CARD('list-checks', 'Indice corrotto')}
      </div>
    </div>
    <div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:0 0 8px">Viste ed esercizi rapidi</div>
      <div style="display:grid;gap:8px">
        ${HUB_CARD('target', 'Heat map padronanza')}
        ${HUB_CARD('flame', 'Mappa di lavoro')}
        ${HUB_CARD('trending-up', 'Progressi')}
      </div>
    </div>
  </div>
  <div style="display:flex;justify-content:flex-end;margin-top:18px">
    <button type="button" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600;margin-left:8px">Annulla</button>
  </div>
</div>`
    },

    /* ─────────────────────────────────────── Account classi (schermata 1) */
    {
        id: 'dyn-classi',
        nome: 'Account classi e studenti — scheda classe',
        src: 'public/js/mappai-live-classes.js:210',
        larghezza: '720px', esc: false, enter: true, backdrop: true,
        note: 'Invio conferma la schermata corrente (_onEnter, keydown in capture). ESC NON chiude.',
        html: hubShell('users', 'Account classi e studenti', `
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px">
    <div><div style="font-weight:800;font-size:15px;color:#0f172a">4R</div>
      <div style="font-size:12px;color:#94a3b8">2026/2027 · 20 allievi</div></div>
    ${clsBtn('Stampa credenziali', 'background:#fff;color:#334155;border:1px solid #e2e8f0')}
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:12px">
    <span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">NOME CLASSE</span>
    <div style="display:flex;gap:10px">
      <select style="${FLD};flex:0 0 190px"><option>4ª</option></select>
      <input value="R" style="${FLD}">
    </div>
    <div style="font-size:11px;color:#94a3b8;margin-top:8px">Nome classe: 4R · Scuola Media<br>
      Cambiare grado o sezione rinomina la classe. I materiali e le sessioni già create restano legati al vecchio nome.</div>
  </div>
  <div style="background:#eef2ff;border:1px solid #e0e7ff;border-radius:12px;padding:14px;margin-bottom:12px">
    <div style="font-size:11px;font-weight:800;color:#4f46e5;letter-spacing:.06em;margin-bottom:6px">🎯 TARATURA AI</div>
    <div style="font-size:12px;color:#64748b;margin-bottom:8px">Guida la generazione AI (mappe, quiz, cloze) al livello di questa classe. Adatta il linguaggio, non i fatti.</div>
    <select style="${FLD};margin-bottom:8px"><option>Semplice (BES/DSA, primo biennio)</option></select>
    <textarea rows="2" style="${FLD}">È una classe inclusiva con 5 allievi BES.</textarea>
  </div>
  <div style="font-size:12px;color:#94a3b8;margin-bottom:8px">Aggiungi i nomi (facoltativo): appariranno nei report al posto di emoji+numero.</div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:6px 12px;max-height:150px;overflow:auto">
    ${['🐼 08', '🦋 10', '🐢 00', '🦊 01'].map(r => `
    <div style="display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px dashed #e2e8f0">
      <span style="font-size:15px">${r.split(' ')[0]}</span>
      <span style="font-weight:700;color:#4f46e5;font-size:12px">${r.split(' ')[1]}</span>
      <input placeholder="Nome (facoltativo)" style="border:none;border-bottom:1px dashed #cbd5e1;flex:1;padding:4px 2px;font:inherit;font-size:12px">
    </div>`).join('')}
  </div>
  <div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px">
    ${clsBtn('Elimina classe', 'background:#fff;color:#dc2626;border:1px solid #fee2e2')}
    <div style="display:flex;gap:8px">${clsBtn('Indietro', 'background:#fff;color:#334155;border:1px solid #e2e8f0')}${clsBtn('Salva nomi', 'background:#4f46e5;color:#fff')}</div>
  </div>`)
    },

    /* ─────────────────────────────────── Genera materiali (schermata 2) */
    {
        id: 'dyn-pipeline',
        nome: 'Genera materiali (pipeline)',
        src: 'public/js/mappai-material-pipeline.js:499',
        larghezza: '600px', esc: true, enter: false, backdrop: false,
        note: 'Ibrido: scocca Tailwind (come i modali statici) + header e bottoni `pm-*`. ' +
              'ESC chiude; il clic sullo sfondo no.',
        html: `
<div class="bg-white rounded-2xl shadow-2xl w-full max-h-[80vh] overflow-y-auto p-6 relative">
  <button type="button" class="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>
  <div class="flex items-center gap-3 mb-5"><div class="pm-icon-wrap"><i data-lucide="package" class="w-5 h-5 text-indigo-600"></i></div>
    <div><div class="pm-title">Genera materiali</div>
      <div class="pm-subtitle">Mappa + quiz + fogli nodi + sintesi, archiviati nel vault</div></div></div>
  <div class="space-y-3">
    <div class="bg-slate-50 rounded-xl px-4 py-3.5 border border-slate-100">
      <span class="block text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-2">Classe destinataria</span>
      <select class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 bg-white"><option>4R</option></select>
      <span class="block text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-2" style="margin-top:12px">Preset</span>
      <div class="flex gap-2 items-center flex-wrap">
        <select class="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 bg-white"><option>full ++</option></select>
        <button type="button" class="pm-btn-cancel" style="flex:none;padding:6px 12px">Applica</button>
        <button type="button" class="pm-btn-cancel" style="flex:none;padding:6px 12px">Salva</button>
        <button type="button" class="pm-btn-cancel" style="flex:none;padding:6px 12px">Elimina</button>
      </div>
    </div>
    <div class="bg-slate-50 rounded-xl px-4 py-3.5 border border-slate-100">
      <label class="flex items-center gap-2.5 cursor-pointer select-none"><input type="checkbox" checked class="w-[17px] h-[17px] accent-indigo-600 shrink-0">
        <span class="text-[13.5px] font-bold text-slate-800">Quiz e flashcard</span></label>
      <div class="flex gap-4 flex-wrap mt-2.5">
        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked class="w-[16px] h-[16px] accent-indigo-600"><span class="text-[12.5px] font-semibold text-slate-700">Scelta multipla</span></label>
        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked class="w-[16px] h-[16px] accent-indigo-600"><span class="text-[12.5px] font-semibold text-slate-700">Vero/Falso</span></label>
        <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked class="w-[16px] h-[16px] accent-indigo-600"><span class="text-[12.5px] font-semibold text-slate-700">Flashcard</span></label>
      </div>
    </div>
    <div class="bg-slate-50 rounded-xl px-4 py-3.5 border border-slate-100">
      <label class="flex items-start gap-2 cursor-pointer select-none"><input type="radio" name="mp-demo" checked class="mt-1 accent-indigo-600">
        <span><span class="text-[12.5px] font-semibold text-slate-700">Entrambi</span>
        <span class="text-[11px] text-slate-400">— mappa sul grado + materiali [VERDE]</span></span></label>
    </div>
  </div>
  <div class="text-[11px] text-slate-500 mt-4 mb-2">Stima chiamate AI: ~20 (A 5 · B 9 · C 2 · D 4)</div>
  <div class="flex gap-2">
    <button type="button" class="pm-btn-cancel">Annulla</button>
    <button type="button" class="pm-btn-primary"><i data-lucide="play" class="w-4 h-4"></i>Avvia</button>
  </div>
</div>`
    },

    /* ─────────────────────────────────────── editor documenti (ELABORA) */
    {
        id: 'dyn-docedit',
        nome: 'Editor documenti — modale di scelta (_modal)',
        src: 'public/js/mappai-doc-editor.js:890',
        larghezza: '560px', esc: true, enter: false, backdrop: false,
        note: 'ESC chiude. Bottoni con stili inline propri (raggio 10px), diversi da `pm-btn-*`.',
        html: `
<div role="dialog" aria-modal="true" style="background:#fff;border-radius:14px;width:100%;max-height:86vh;overflow:auto;
     box-shadow:0 24px 60px rgba(0,0,0,.28);padding:20px">
  <h3 style="margin:0 0 4px;font-size:16px;font-weight:800;color:#0f172a">Tipo di blocco</h3>
  <p style="margin:0 0 14px;font-size:12px;color:#64748b">Scegli come deve essere impaginato questo blocco nella sintesi.</p>
  <div style="display:grid;gap:8px">
    ${['Titolo', 'Sottotitolo', 'Paragrafo', 'Elenco', 'Nota'].map(x => `
    <button type="button" style="display:block;width:100%;text-align:left;background:#f8fafc;border:1px solid #e2e8f0;
      border-radius:10px;padding:10px 12px;cursor:pointer">
      <span style="display:block;font-size:13px;font-weight:700;color:#0f172a">${x}</span>
      <span style="display:block;font-size:11px;color:#94a3b8">descrizione del tipo di blocco</span></button>`).join('')}
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
    <button type="button" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:12px;cursor:pointer">Annulla</button>
    <button type="button" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:12px;cursor:pointer">Applica</button>
  </div>
</div>`
    },

    /* ─────────────────────────────────────────────── dashboard consumi */
    {
        id: 'dyn-usage',
        nome: 'Consumi AI — dashboard',
        src: 'public/js/mappai-usage-dashboard.js:317',
        larghezza: '1160px · h 88vh', esc: true, enter: false, backdrop: true,
        note: 'Scocca Tailwind a tutta altezza (h-[88vh]) con sidebar interna. ESC chiude.',
        html: `
<div class="bg-white rounded-2xl shadow-2xl w-full h-[420px] flex flex-col overflow-hidden" role="dialog" aria-modal="true">
  <div class="px-6 py-4 border-b border-slate-200 flex items-center gap-3 flex-wrap">
    <div class="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><i data-lucide="coins" class="w-5 h-5"></i></div>
    <div class="min-w-0"><h2 class="text-base font-black text-slate-900 leading-tight">Consumi AI</h2>
      <p class="text-[11px] text-slate-400">Registro locale di token e costi delle generazioni AI</p></div>
    <div class="flex-1"></div>
    <label class="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold">Tasso USD→CHF
      <input type="number" value="0.90" class="w-20 border border-slate-300 rounded-lg px-2 py-1 text-xs text-right"></label>
    <button type="button" class="p-2 rounded-lg border border-slate-200 text-slate-500"><i data-lucide="printer" class="w-4 h-4"></i></button>
    <button type="button" class="p-2 rounded-lg border border-slate-200 text-slate-500"><i data-lucide="x" class="w-4 h-4"></i></button>
  </div>
  <div class="flex-1 flex min-h-0">
    <aside class="w-60 shrink-0 border-r border-slate-200 overflow-y-auto p-3 bg-slate-50/50">
      <div class="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">Documenti</div>
      <div class="rounded-lg px-2.5 py-2 bg-indigo-50 text-indigo-700 text-[12px] font-bold">Tutte le mappe</div>
      <div class="rounded-lg px-2.5 py-2 text-slate-600 text-[12px]">La Fotosintesi · 1.24 CHF</div>
    </aside>
    <main class="flex-1 overflow-y-auto p-5 bg-slate-50/30">
      <div class="grid grid-cols-3 gap-3">
        ${['Chiamate', 'Token in', 'Costo totale'].map(k => `
        <div class="bg-white border border-slate-200 rounded-xl p-3">
          <div class="text-[10px] uppercase tracking-widest text-slate-400 font-bold">${k}</div>
          <div class="text-lg font-black text-slate-800">—</div></div>`).join('')}
      </div>
    </main>
  </div>
</div>`
    },

    /* ─────────────────────────────────────── impostazioni cartella file */
    {
        id: 'dyn-files',
        nome: 'Cartella dei file — impostazioni',
        src: 'public/js/mappai-files-settings.js:27',
        larghezza: '540px', esc: true, enter: false, backdrop: true,
        note: 'ESC chiude. Header senza icona: solo titolo in grassetto.',
        html: `
<div role="dialog" aria-modal="true" style="background:#fff;border-radius:16px;width:100%;max-height:88vh;overflow:auto;
     box-shadow:0 24px 60px rgba(0,0,0,.3);padding:22px 24px">
  <div style="font-weight:800;font-size:16px;color:#0f172a;margin-bottom:6px">Cartella dei file MappAI</div>
  <div style="font-size:12px;color:#64748b;line-height:1.6;margin-bottom:14px">
    Tutti i dati (mappe, attività, classi, file condivisi) vivono in una sola cartella madre.</div>
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px;font-size:12px;color:#334155;margin-bottom:14px">
    <code>~/Documents/MappAI - file</code></div>
  <label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#334155;margin-bottom:14px">
    <input type="checkbox" checked style="margin-top:2px"> <span>Sposta i dati esistenti nella nuova cartella</span></label>
  <div style="display:flex;justify-content:flex-end;gap:8px">
    <button type="button" style="background:#fff;color:#334155;border:1px solid #e2e8f0;border-radius:10px;padding:9px 14px;font-weight:700;font-size:12px;cursor:pointer">Annulla</button>
    <button type="button" style="background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:9px 14px;font-weight:700;font-size:12px;cursor:pointer">Conferma</button>
  </div>
</div>`
    },

    /* ─────────────────────────────────────────────── wizard QR (Tutor) */
    {
        id: 'dyn-tutor',
        nome: 'Tutor QR — wizard di avvio',
        src: 'public/js/mappai-tutor-teacher.js:40',
        larghezza: '640px', esc: false, enter: false, backdrop: true,
        note: 'Stessa scocca di menu-hubs ma SENZA ESC: si chiude solo con × o clic sullo sfondo. ' +
              'Identico problema in live-teacher.js:36, collab-teacher.js:85, timeline-teacher.js:35.',
        html: hubShell('message-circle', 'Chatta e Scrivi — Tutor AI', `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:10px">
    <span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">CLASSE</span>
    <select style="${FLD}"><option>4R — 20 allievi</option></select>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:10px">
    <span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:6px">MODALITÀ DEL TUTOR</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${['Socratico', 'Spiega tu', 'Interroga tu', 'Dubbio', 'Collega', 'Ripasso'].map((m, i) => `
      <button type="button" style="border:1px solid ${i === 0 ? '#4f46e5' : '#e2e8f0'};background:${i === 0 ? '#eef2ff' : '#fff'};
        color:${i === 0 ? '#4f46e5' : '#334155'};border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer">${m}</button>`).join('')}
    </div>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin-bottom:12px">
    <span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">SCAMBI MASSIMI</span>
    <input type="number" value="6" style="${FLD};max-width:120px">
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px">
    ${clsBtn('Annulla', 'background:#fff;color:#334155;border:1px solid #e2e8f0')}
    ${clsBtn('Avvia sessione', 'background:#4f46e5;color:#fff')}
  </div>`)
    },

    /* ─────────────────────────────────────────────────── checkpoint L1 */
    {
        id: 'dyn-checkpoint',
        nome: 'Checkpoint macro-aree (L1)',
        src: 'public/js/mappai-l1-checkpoint.js:149',
        larghezza: '680px', esc: true, enter: false, backdrop: true,
        note: 'ESC chiude — ma la chiusura equivale ad «Annulla» su una generazione già pagata.',
        html: `
<div role="dialog" aria-modal="true" style="background:#fff;border-radius:16px;width:100%;max-height:86vh;overflow:auto;
     box-shadow:0 24px 60px rgba(0,0,0,.3);padding:20px 22px">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
    <i data-lucide="git-branch" style="width:22px;height:22px;color:#4f46e5"></i>
    <div><div style="font-weight:800;font-size:16px;color:#0f172a">Macro-aree proposte</div>
      <div style="font-size:11px;color:#94a3b8">Controlla i rami prima di espanderli: puoi rinominarli o toglierli.</div></div>
  </div>
  ${['Struttura della foglia', 'Fase luminosa', 'Ciclo di Calvin'].map(x => `
  <div style="display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:8px">
    <input value="${x}" style="${FLD};flex:1">
    <button type="button" style="background:#fff;border:1px solid #fee2e2;color:#dc2626;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:12px;font-weight:700">Togli</button>
  </div>`).join('')}
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
    <button type="button" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:12px;cursor:pointer">Annulla</button>
    <button type="button" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:9px 16px;font-weight:700;font-size:12px;cursor:pointer">Continua</button>
  </div>
</div>`
    },

    /* ─────────────────────────────────────────────── QR a schermo pieno */
    {
        id: 'dyn-qr',
        nome: 'QR a schermo intero (proiettore)',
        src: 'public/js/mappai-live-teacher.js:581 · timeline-teacher.js:330 · collab-teacher.js:503',
        larghezza: '100vw (fullscreen)', esc: 'parziale', enter: false, backdrop: false,
        note: 'Tre copie quasi identiche in tre moduli. ESC c’è in timeline-teacher, NON in live-teacher.',
        html: `
<div style="background:#0f172a;border-radius:16px;width:100%;padding:28px;display:flex;flex-direction:column;align-items:center;gap:14px">
  <div style="color:#e2e8f0;font-size:15px;font-weight:800;letter-spacing:.04em">Inquadra il QR con il telefono</div>
  <div style="width:190px;height:190px;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11px">QR</div>
  <div style="color:#94a3b8;font-size:13px">http://192.168.1.24:8767/?s=…</div>
  <button type="button" style="background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer">Chiudi</button>
</div>`
    },

    /* ─────────────────────────────────────────────── profilo insegnante */
    {
        id: 'dyn-teacher',
        nome: 'Profilo insegnante',
        src: 'public/js/mappai-teacher-profile.js:73',
        larghezza: '520px', esc: false, enter: false, backdrop: true,
        note: 'Nessun ESC, nessun Invio: si esce solo con × o clic sullo sfondo.',
        html: hubShell('user-round', 'Profilo insegnante', `
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;display:grid;gap:10px">
    <div><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">NOME</span>
      <input value="Giacomo Meschini" style="${FLD}"></div>
    <div><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">SEDE</span>
      <input value="SM Bellinzona" style="${FLD}"></div>
  </div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
    ${clsBtn('Annulla', 'background:#fff;color:#334155;border:1px solid #e2e8f0')}
    ${clsBtn('Salva', 'background:#4f46e5;color:#fff')}
  </div>`)
    },

    /* ─────────────────────────────────────────────── revisione mappa */
    {
        id: 'dyn-correction',
        nome: 'Revisione mappa (correction mode)',
        src: 'public/js/mappai-correction-mode.js:80',
        larghezza: '1080px', esc: false, enter: false, backdrop: true,
        note: 'Il più largo dopo la dashboard consumi. Nessun ESC.',
        html: `
<div style="background:#fff;border-radius:16px;width:100%;max-height:420px;overflow:auto;box-shadow:0 24px 60px rgba(0,0,0,.3);padding:20px">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <i data-lucide="clipboard-check" style="width:22px;height:22px;color:#4f46e5"></i>
    <div style="font-weight:800;font-size:16px;color:#0f172a">Correzioni raccolte</div></div>
  <table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="text-align:left;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.08em">
      <th style="padding:6px 8px">Nodo</th><th style="padding:6px 8px">Tipo</th><th style="padding:6px 8px">Nota</th><th style="padding:6px 8px">Azioni</th></tr></thead>
    <tbody>${[1, 2, 3].map(i => `
      <tr style="border-top:1px solid #e2e8f0"><td style="padding:8px">Nodo ${i}</td><td style="padding:8px">desc</td>
      <td style="padding:8px;color:#64748b">testo della correzione annotata</td>
      <td style="padding:8px"><button type="button" style="background:#f1f5f9;border:0;border-radius:8px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer">Apri</button></td></tr>`).join('')}
    </tbody></table>
</div>`
    }
];
