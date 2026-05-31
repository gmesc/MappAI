/**
 * mappai-quiz-print.js
 * Stampa quiz e flashcard come pagine HTML per MappAI
 * Dipende da: app.js (appState, cleanLabel, showToast)
 */

function escHtmlQP(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── CSS comuni quiz e flashcard ──────────────────────────

const QP_BASE_STYLES = `
* { -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important; }
body {
    font-family: 'Space Mono', monospace;
    font-size: 11px;
    color: #1e293b;
    margin: 0 auto;
    padding: 24px 32px;
    max-width: 800px;
    background: #f8fafc;
}
.qp-header {
    text-align: center;
    padding: 28px 16px 20px;
    background: white;
    border-radius: 16px;
    margin-bottom: 28px;
    border-bottom: 2px solid #4f46e5;
    page-break-after: avoid;
}
.qp-title { font-size:20px; font-weight:900; color:#1e293b; }
.qp-subtitle { font-size:10px; color:#64748b; margin-top:4px; }
.qp-badge {
    display:inline-block; margin-top:8px;
    background:#ede9fe; color:#4f46e5;
    border-radius:999px; padding:2px 12px;
    font-size:10px; font-weight:bold;
}
.qp-footer {
    text-align:center; margin-top:32px;
    font-size:9px; color:#94a3b8;
    border-top:1px solid #f1f5f9; padding-top:12px;
}
.no-print { display:block; }
@media print {
    .no-print { display:none !important; }
    body { background:white; padding:10px; }
    .qp-header { box-shadow:none; }
}
`;

const QP_PRINT_BAR = (accentColor, label) => `
<div class="no-print" style="
    position:fixed; top:0; left:0; right:0;
    background:white; border-bottom:1px solid #e2e8f0;
    padding:10px 24px; display:flex;
    align-items:center; justify-content:space-between;
    z-index:100; font-family:monospace; font-size:12px;">
    <span style="font-weight:bold;color:${accentColor};">
        MappAI · ${label}
    </span>
    <div style="display:flex;gap:8px;">
        <button onclick="window.print()"
                style="background:${accentColor};color:white;
                       border:none;border-radius:8px;
                       padding:6px 16px;cursor:pointer;
                       font-size:11px;font-weight:bold;">
            🖨 Stampa / Esporta PDF
        </button>
        <button onclick="window.close()"
                style="background:#f1f5f9;color:#475569;
                       border:none;border-radius:8px;
                       padding:6px 12px;cursor:pointer;
                       font-size:11px;">
            ✕ Chiudi
        </button>
    </div>
</div>
<div style="height:52px;" class="no-print"></div>`;

// ── STAMPA QUIZ ──────────────────────────────────────────

window.printQuizSet = function (setId) {
    const sets = appState?.db?.studySets || [];
    const set = setId
        ? sets.find(s => s.id === setId)
        : sets[sets.length - 1]; // ultimo set generato

    if (!set || !set.items?.length) {
        showToast('Nessun quiz trovato', 'warning');
        return;
    }

    const rootNode = appState.nodes?.find(n => n.level === 0);
    const mapName = rootNode ? cleanLabel(rootNode.label) : 'MappAI';
    const now = new Date().toLocaleString('it-IT');
    const accentColor = '#4f46e5';

    // Genera HTML domande
    let questionsHtml = '';
    set.items.forEach((item, idx) => {
        const letters = ['A', 'B', 'C', 'D', 'E'];

        questionsHtml += `
        <div class="quiz-item" style="
            background:white; border-radius:12px;
            padding:16px 20px; margin-bottom:16px;
            border-left:4px solid ${accentColor};
            page-break-inside:avoid;">

            <div style="
                font-size:9px; font-weight:700;
                text-transform:uppercase;
                letter-spacing:0.06em;
                color:${accentColor}; margin-bottom:6px;">
                Domanda ${idx + 1}
            </div>

            <div style="
                font-size:12px; font-weight:bold;
                color:#1e293b; margin-bottom:12px;
                line-height:1.5;">
                ${escHtmlQP(item.question)}
            </div>

            <div style="display:flex; flex-direction:column; gap:6px;">
                ${(item.options || []).map((opt, oi) => `
                <div style="
                    display:flex; align-items:flex-start;
                    gap:8px; padding:7px 10px;
                    border-radius:7px;
                    background:${oi === item.correctIndex
                ? '#ecfdf5'
                : '#f8fafc'};
                    border:1px solid ${oi === item.correctIndex
                ? '#6ee7b7'
                : '#e2e8f0'};">
                    <span style="
                        flex-shrink:0; width:20px; height:20px;
                        border-radius:50%;
                        background:${oi === item.correctIndex
                ? '#059669'
                : '#e2e8f0'};
                        color:${oi === item.correctIndex
                ? 'white'
                : '#64748b'};
                        font-size:9px; font-weight:bold;
                        display:flex; align-items:center;
                        justify-content:center;">
                        ${letters[oi]}
                    </span>
                    <span style="
                        font-size:10px; color:#1e293b;
                        line-height:1.4;">
                        ${escHtmlQP(opt)}
                        ${oi === item.correctIndex
                ? '<span style="color:#059669;font-weight:bold;margin-left:6px;">✓</span>'
                : ''}
                    </span>
                </div>`).join('')}
            </div>

            ${item.explanation ? `
            <div style="
                margin-top:10px; padding:8px 12px;
                background:#f0f9ff; border-radius:6px;
                border-left:3px solid #0ea5e9;
                font-size:9px; color:#0369a1;
                line-height:1.5;">
                <strong>Spiegazione:</strong>
                ${escHtmlQP(item.explanation)}
            </div>` : ''}
        </div>`;
    });

    // Versione senza risposte (per test)
    let blankQuestionsHtml = '';
    set.items.forEach((item, idx) => {
        const letters = ['A', 'B', 'C', 'D', 'E'];
        blankQuestionsHtml += `
        <div class="quiz-item" style="
            background:white; border-radius:12px;
            padding:16px 20px; margin-bottom:16px;
            border-left:4px solid #94a3b8;
            page-break-inside:avoid;">
            <div style="
                font-size:9px; font-weight:700;
                text-transform:uppercase;
                letter-spacing:0.06em;
                color:#64748b; margin-bottom:6px;">
                Domanda ${idx + 1}
            </div>
            <div style="
                font-size:12px; font-weight:bold;
                color:#1e293b; margin-bottom:12px;
                line-height:1.5;">
                ${escHtmlQP(item.question)}
            </div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                ${(item.options || []).map((opt, oi) => `
                <div style="
                    display:flex; align-items:flex-start;
                    gap:8px; padding:7px 10px;
                    border-radius:7px;
                    background:#f8fafc;
                    border:1px solid #e2e8f0;">
                    <span style="
                        flex-shrink:0; width:20px; height:20px;
                        border-radius:50%; background:#e2e8f0;
                        color:#64748b; font-size:9px;
                        font-weight:bold; display:flex;
                        align-items:center; justify-content:center;">
                        ${letters[oi]}
                    </span>
                    <span style="font-size:10px; color:#1e293b; line-height:1.4;">
                        ${escHtmlQP(opt)}
                    </span>
                </div>`).join('')}
            </div>
            <div style="
                margin-top:10px; height:28px;
                border-bottom:1px dashed #cbd5e1;
                font-size:9px; color:#94a3b8;">
                Risposta: ____
            </div>
        </div>`;
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Quiz — ${escHtmlQP(set.title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital@0;1&display=swap"
          rel="stylesheet">
    <style>
        ${QP_BASE_STYLES}
        .quiz-section-title {
            font-size:13px; font-weight:900;
            color:#4f46e5; margin:24px 0 12px;
            padding-bottom:4px;
            border-bottom:2px solid #e2e8f0;
            page-break-after:avoid;
        }
    </style>
</head>
<body>
    ${QP_PRINT_BAR(accentColor, 'Quiz')}

    <div class="qp-header">
        <div class="qp-title">${escHtmlQP(set.title)}</div>
        <div class="qp-subtitle">
            ${escHtmlQP(mapName)} · Quiz · ${now}
        </div>
        <div class="qp-badge">
            ${set.items.length} domande
        </div>
    </div>

    <div class="quiz-section-title">
        📋 Quiz con Risposte Corrette
    </div>
    ${questionsHtml}

    <div class="quiz-section-title" style="margin-top:40px;
         page-break-before:always;">
        ✏️ Foglio di Verifica (senza risposte)
    </div>
    ${blankQuestionsHtml}

    <div class="qp-footer">
        MappAI by insegnai.ch ·
        Generato il ${now}
    </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
        showToast('Popup bloccato — abilita i popup', 'warning');
        return;
    }
    win.document.write(fullHtml);
    win.document.close();
    showToast(
        `✓ Quiz stampabile aperto — ${set.items.length} domande`,
        'success'
    );
};

// ── STAMPA FLASHCARD ─────────────────────────────────────

window.printFlashcardSet = function (setId) {
    const sets = appState?.db?.studySets || [];
    const set = setId
        ? sets.find(s => s.id === setId)
        : sets.find(s => s.mode === 'flashcard')
        || sets[sets.length - 1];

    if (!set || !set.items?.length) {
        showToast('Nessuna flashcard trovata', 'warning');
        return;
    }

    const rootNode = appState.nodes?.find(n => n.level === 0);
    const mapName = rootNode ? cleanLabel(rootNode.label) : 'MappAI';
    const now = new Date().toLocaleString('it-IT');
    const accentColor = '#059669';

    let cardsHtml = '';
    set.items.forEach((item, idx) => {
        // Layout carta fisica — fronte e retro
        // Stampa su foglio A4: 2 colonne, 4 righe = 8 flashcard per pagina
        cardsHtml += `
        <div class="fc-card" style="
            background:white;
            border-radius:12px;
            border:1.5px solid #e2e8f0;
            overflow:hidden;
            break-inside:avoid;
            page-break-inside:avoid;">

            <!-- FRONTE -->
            <div style="
                padding:14px 16px;
                border-bottom:1px dashed #e2e8f0;
                min-height:80px;
                display:flex; flex-direction:column;
                justify-content:center;">
                <div style="
                    font-size:8px; font-weight:700;
                    text-transform:uppercase;
                    letter-spacing:0.06em;
                    color:${accentColor};
                    margin-bottom:6px;">
                    ${String(idx + 1).padStart(2, '0')} · Domanda
                </div>
                <div style="
                    font-size:11px; font-weight:bold;
                    color:#1e293b; line-height:1.4;">
                    ${escHtmlQP(item.question)}
                </div>
            </div>

            <!-- RETRO -->
            <div style="
                padding:12px 16px;
                background:#f0fdf4;
                min-height:60px;
                display:flex; flex-direction:column;
                justify-content:center;">
                <div style="
                    font-size:8px; font-weight:700;
                    text-transform:uppercase;
                    letter-spacing:0.06em;
                    color:#64748b; margin-bottom:4px;">
                    Risposta
                </div>
                <div style="
                    font-size:10px; color:#1e293b;
                    line-height:1.4;">
                    ${escHtmlQP(
            item.options?.[item.correctIndex]
            || item.answer
            || '—'
        )}
                </div>
                ${item.explanation ? `
                <div style="
                    margin-top:6px; font-size:9px;
                    color:#475569; font-style:italic;
                    line-height:1.3;">
                    ${escHtmlQP(item.explanation.slice(0, 120))}
                    ${item.explanation.length > 120 ? '…' : ''}
                </div>` : ''}
            </div>
        </div>`;
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>Flashcard — ${escHtmlQP(set.title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital@0;1&display=swap"
          rel="stylesheet">
    <style>
        ${QP_BASE_STYLES}
        .fc-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }
        @media print {
            .fc-grid {
                grid-template-columns: 1fr 1fr;
            }
        }
        .fc-instructions {
            background:#f0fdf4;
            border-radius:10px;
            padding:12px 16px;
            margin-bottom:20px;
            font-size:10px;
            color:#374151;
            border-left:3px solid ${accentColor};
        }
    </style>
</head>
<body>
    ${QP_PRINT_BAR(accentColor, 'Flashcard')}

    <div class="qp-header">
        <div class="qp-title">${escHtmlQP(set.title)}</div>
        <div class="qp-subtitle">
            ${escHtmlQP(mapName)} · Flashcard · ${now}
        </div>
        <div class="qp-badge" style="background:#dcfce7;color:#059669;">
            ${set.items.length} carte
        </div>
    </div>

    <div class="fc-instructions">
        ✂️ <strong>Come usare:</strong>
        Ritaglia ogni carta lungo il bordo.
        La parte superiore è la domanda, quella inferiore la risposta.
        Piega lungo la linea tratteggiata per nascondere la risposta
        durante il ripasso.
    </div>

    <div class="fc-grid">
        ${cardsHtml}
    </div>

    <div class="qp-footer">
        MappAI by insegnai.ch · ${now}
    </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
        showToast('Popup bloccato — abilita i popup', 'warning');
        return;
    }
    win.document.write(fullHtml);
    win.document.close();
    showToast(
        `✓ Flashcard stampabili aperte — ${set.items.length} carte`,
        'success'
    );
};

// ── STAMPA TUTTI I SET ───────────────────────────────────

window.printAllStudySets = function () {
    const sets = appState?.db?.studySets || [];
    if (sets.length === 0) {
        showToast('Nessun set di studio trovato', 'warning');
        return;
    }

    // Apri una finestra per ogni set
    sets.forEach((set, idx) => {
        setTimeout(() => {
            if (set.mode === 'flashcard' ||
                set.type === 'Flashcard') {
                window.printFlashcardSet(set.id);
            } else {
                window.printQuizSet(set.id);
            }
        }, idx * 300); // delay per non bloccare i popup
    });
};

console.log('[MappAI] mappai-quiz-print.js caricato ✓');