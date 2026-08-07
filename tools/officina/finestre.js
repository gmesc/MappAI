/* OFFICINA — LE FAMIGLIE DI FINESTRE-DOCUMENTO (la categoria mancata dal
 * campionario: censita il 30/7/26)
 *
 * Il censimento dell'officina contava solo i modali di index.html e gli overlay
 * `position:fixed; inset:0` dei moduli. Le superfici che gestiscono i DOCUMENTI
 * GENERATI (salvataggio, stampa, playback audio) non sono né l'uno né l'altro:
 * pagine aperte con window.open, PDF headless, l'editor di ELABORA, i player.
 * Qui hanno un nome, un modo d'apertura, le istanze reali e i token che
 * servirebbero loro. Il verdetto si dà in pagina, come per le famiglie.
 *
 * I mock usano il CSS VERO trascritto (stessa regola di famiglie.js), con una
 * sola adattatura dichiarata: le barre `position:fixed` diventano statiche per
 * stare dentro la scheda.
 */
'use strict';

module.exports = [

    {
        id: 'w-stampato',
        nome: 'Pagina-documento stampabile',
        stato: 'da-fare',
        apertura: 'window.open + document.write · topbar fissa (QP_PRINT_BAR)',
        quando: 'Un documento che si guarda e si stampa. La topbar è la SOLA interfaccia: tutto il resto è foglio. Oggi la barra esiste per clonazione — copiata in 3 file, con accento diverso per documento.',
        istanze: [
            'printQuizSet (mappai-quiz-print.js:332)',
            'printFlashcardSet (mappai-quiz-print.js:363)',
            'Timeline _renderTimeline (mappai-timeline.js:1093) — topbar + comandi vivi verso window.opener',
            'buildCredentialCardsHtml (mappai-live-reports.js)',
            'report domande / studenti live (mappai-live-teacher.js:648)',
            'report tutor (mappai-tutor-reports.js)',
            'report consumi AI (mappai-usage-dashboard.js:309)',
            'sintesi stampabile (_buildSynthesisPrintHtml, mappai-branch-synthesis.js)'
        ],
        tokenNuovi: ['--mm-doc-topbar-h (oggi 52px)', '--mm-doc-accent (oggi varia per documento)', '--mm-doc-page-w (oggi 800px)', 'icone Lucide al posto di 🖨 / ✕'],
        mock: '<div class="fam-tbbar"><span style="font-weight:700;color:#4f46e5">MappAI · Quiz — La Fotosintesi</span>' +
            '<span style="display:flex;gap:8px"><button class="fam-tb">🖨 Stampa / Esporta PDF</button><button class="fam-tb fam-tb--s">✕ Chiudi</button></span></div>' +
            '<div class="fam-foglio"><div class="fam-foglio-h">IL QUIZ · intestazione centrata, bordo sotto indaco</div><div class="fam-riga"></div><div class="fam-riga" style="width:70%"></div><div class="fam-riga" style="width:85%"></div></div>' +
            '<p class="fam-nota-mock">Nell’originale la barra è fissa a tutta larghezza (position:fixed, z-index 100) e sparisce in stampa (.no-print).</p>',
        mockCss: '.fam-tbbar{position:relative;background:#fff;border:1px solid #e2e8f0;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;font-family:monospace;font-size:12px;border-radius:8px 8px 0 0;flex-wrap:wrap;gap:6px}' +
            '.fam-foglio{background:#f8fafc;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px;padding:14px}' +
            '.fam-foglio-h{background:#fff;border-radius:10px;border-bottom:2px solid #4f46e5;text-align:center;font-size:10px;color:#64748b;padding:12px 8px;margin-bottom:10px}' +
            '.fam-riga{height:7px;border-radius:4px;background:#e2e8f0;margin:7px 0}' +
            '.fam-nota-mock{font-size:10px;color:#94a3b8;margin:7px 0 0;line-height:1.5}'
    },

    {
        id: 'w-pdf',
        nome: 'PDF headless (senza interfaccia propria)',
        stato: 'da-fare',
        apertura: 'IPC html-to-pdf (finestra offscreen + printToPDF) oppure jsPDF diretto',
        quando: 'Il file nasce già finito: non c’è finestra da disegnare. La UI sta tutta nel modale di opzioni A MONTE (archetipo 5 «Opzioni di stampa») e nel FOGLIO, la cui geometria vive nei core (nodesheet-core). Verdetto qui = confermare che questa famiglia NON ha bisogno di token propri.',
        istanze: [
            'dossier PDF (mappai-print-dossier.js:1314)',
            'foglio dei nodi (mappai-print-dossier.js:42 + editor nodesheet)',
            'foglio flashcard (printFlashcardSheet, jsPDF)',
            'pipeline «Genera materiali» — passi C e D (mappai-material-pipeline.js)'
        ],
        tokenNuovi: [],
        mock: '<div class="fam-a4"><div class="fam-a4-t">A4</div><div class="fam-riga"></div><div class="fam-riga" style="width:60%"></div><div class="fam-riga" style="width:80%"></div></div>',
        mockCss: '.fam-a4{width:120px;aspect-ratio:210/297;background:#fff;border:1px solid #e2e8f0;border-radius:4px;padding:10px;box-shadow:0 2px 8px rgba(15,23,42,.08)}' +
            '.fam-a4-t{font-size:9px;font-weight:700;color:#94a3b8;margin-bottom:6px}'
    },

    {
        id: 'w-editor',
        nome: 'Editor di documenti (ELABORA)',
        stato: 'da-fare',
        apertura: 'overlay in-app #elab-doc-host (modalità «Documenti» di ELABORA)',
        quando: 'Si scrive e si salva: quiz, flashcard, sintesi, foglio dei nodi. Barra azioni in alto (‹ Documenti · Annulla · HTML · Nel vault · Stampa · Salva) + strumenti di riga. È «sporco» per definizione: uscire con modifiche pendenti chiede conferma.',
        istanze: [
            'editor quiz (mappai-doc-editor.js, kind quiz)',
            'editor flashcard (kind flashcards)',
            'editor sintesi a blocchi (kind synthesis)',
            'editor foglio dei nodi (kind nodesheet)'
        ],
        tokenNuovi: ['--mm-bar-h (altezza barra)', '--mm-bar-btn (taglia bottoni barra, oggi 11px/~28px)', 'regola «sporco»: conferma su ESC/velo condivisa col motore dei modali'],
        mock: '<div class="fam-debar"><button class="fam-de">‹ Documenti</button><span style="flex:1"></span>' +
            '<button class="fam-de">Annulla</button><button class="fam-de">Nel vault</button><button class="fam-de">Stampa</button><button class="fam-de fam-de--p">Salva</button></div>' +
            '<div class="fam-foglio" style="border-radius:0 0 8px 8px"><div class="fam-riga" style="width:40%;height:11px"></div><div class="fam-riga"></div><div class="fam-riga" style="width:75%"></div></div>',
        mockCss: '.fam-debar{display:flex;gap:6px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:8px 8px 0 0;padding:8px 10px;flex-wrap:wrap}'
    },

    {
        id: 'w-player',
        nome: 'Player audio (TTS + voce naturale)',
        stato: 'da-fare',
        apertura: 'chip dentro modali e documenti (mai-tts-chip) · <audio> nelle pagine QR',
        quando: 'Il chip a segmenti governa la lettura: −10s · play/pausa · +5s · velocità, più scrub karaoke. Stessa faccia per voce di sistema e voce naturale (Gemini). I bersagli e la taglia sono da tokenizzare.',
        istanze: [
            'lettore voce di sistema (mappai-tts-reader.js:515-518, chip)',
            'lettore voce naturale della sintesi (mappai-branch-synthesis.js:1031)',
            'player <audio> delle pagine condivise via QR (sintesi con WAV)'
        ],
        tokenNuovi: ['--mm-player-h (oggi 40px: sotto i 44 del tocco)', '--mm-player-seg (larghezza minima segmento, oggi 46px)', 'colori: oggi indigo pieno su bianco, fuori discussione?'],
        mock: '<span class="fam-tts"><button class="fam-tts-seg"><i data-lucide="rotate-ccw"></i><span>10</span></button>' +
            '<button class="fam-tts-seg"><i data-lucide="play"></i></button>' +
            '<button class="fam-tts-seg"><i data-lucide="rotate-cw"></i><span>5</span></button>' +
            '<button class="fam-tts-seg">×1.2</button></span>',
        mockCss: '.fam-tts{display:inline-flex;align-items:stretch;height:40px;border-radius:9999px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 4px 6px -1px rgba(15,23,42,.12);overflow:hidden}' +
            '.fam-tts-seg{display:inline-flex;align-items:center;justify-content:center;gap:2px;min-width:46px;padding:0 12px;border:0;background:transparent;color:#4f46e5;cursor:pointer;font-family:inherit;font-weight:700;font-size:12px;border-left:1px solid #eef2ff}' +
            '.fam-tts-seg:first-child{border-left:0}.fam-tts-seg:hover{background:#eef2ff}' +
            '.fam-tts-seg svg{width:16px;height:16px}.fam-tts-seg span{font-size:10px;font-weight:700}'
    },

    {
        id: 'w-qr',
        nome: 'Pagina condivisa via QR',
        stato: 'da-fare',
        apertura: 'live-server /files/*.html — telefono dello studente, nessun login',
        quando: 'Documento autoconsistente letto da mobile: sintesi con player integrato, materiali. Niente topbar: tipografia di lettura + player. Aderisce alle regole delle pagine-documento (29/7: colonna unica, contrasto ≥4,5:1) ma su schermo stretto.',
        istanze: [
            'sintesi condivisa con audio (mappai-branch-synthesis.js → MappAILive.shareDocWithAudioQr)',
            'materiali pubblicati (mappai-live-teacher.js, archivio a fine sessione)',
            'public/live/materials.html (elenco dei file)'
        ],
        tokenNuovi: ['eredita i token pagina-documento + player; breakpoint mobile da fissare'],
        mock: '<div class="fam-phone"><div class="fam-riga" style="width:55%;height:10px"></div><div class="fam-riga"></div><div class="fam-riga" style="width:85%"></div>' +
            '<div style="margin-top:8px;display:flex;justify-content:center"><span style="font-size:10px;color:#4f46e5;font-weight:700">🔊 Voce naturale</span></div></div>',
        mockCss: '.fam-phone{width:110px;border:2px solid #cbd5e1;border-radius:14px;background:#fff;padding:12px 10px}'
    },

    {
        id: 'w-fuori',
        nome: 'Fuori perimetro (per ora)',
        stato: 'da-fare',
        apertura: 'pagine LAN degli studenti · strumenti voxel',
        quando: 'Mondi grafici con un patto proprio: le pagine studente (telefono, stile MappAI mobile già rifinito) e gli strumenti voxel (gioco). Si elencano perché il perimetro sia una DECISIONE scritta, non una dimenticanza. Verdetto qui = confermare l’esclusione o riportarle dentro.',
        istanze: [
            'public/live/student.html (quiz live)',
            'public/tutor/student.html (Chatta e Scrivi)',
            'public/collab/student.html (lavagna)',
            'tools/voxel-proto/studio.html · editor.html · garden.html · proto.html'
        ],
        tokenNuovi: [],
        mock: '',
        mockCss: ''
    }
];
