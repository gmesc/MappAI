// ==========================================
// STRUMENTI A11Y (sillabazione, interlinea, zoom testo, floating actions) — estratto da app.js
// ==========================================
// Caricato DOPO app.js. NB: isHyphenated/originalModalHtml (reset da closeSourceModal),
// currentZoomIdx/zooms (scritti da applyDirectZoom, letti dal DOMContentLoaded finale di
// app.js) sono let/const top-level qui: i riferimenti bare cross-script si risolvono a
// runtime via scope lessicale globale condiviso (pattern batches 2-6).
let isHyphenated = false;
let originalModalHtml = "";

window.toggleHyphenation = function (btn) {
    const body = document.getElementById('source-modal-body');
    if (!body) return;

    btn.classList.toggle('bg-indigo-100');
    isHyphenated = !isHyphenated;

    if (isHyphenated) {
        body.classList.add('hyphens-auto-force');
        /* Sezione Hypher commentata per usare il motore nativo del Mac
        if (!originalModalHtml) originalModalHtml = body.innerHTML;
        
        if (window.Hypher && window.itPatterns) {
            const hyphenator = new window.Hypher(window.itPatterns);
            const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while(node = walk.nextNode()) {
                if (node.nodeValue.trim() !== '') {
                    node.nodeValue = hyphenator.hyphenateText(node.nodeValue);
                }
            }
        }
        */
    } else {
        body.classList.remove('hyphens-auto-force');
        if (originalModalHtml) {
            body.innerHTML = originalModalHtml;
            originalModalHtml = "";
        }
    }
};

window.toggleFloatingActions = function () {
    const menu = document.getElementById('floating-actions-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        window.safeCreateIcons();
    }
};

// Close menu on click outside
document.addEventListener('click', (e) => {
    const container = document.getElementById('floating-actions-container');
    const menu = document.getElementById('floating-actions-menu');
    if (container && !container.contains(e.target) && menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
});

let currentLineHeightIdx = 0;
const lineHeights = [1.5, 2.0, 2.5];

window.cycleLineHeight = function () {
    currentLineHeightIdx = (currentLineHeightIdx + 1) % lineHeights.length;
    const lh = lineHeights[currentLineHeightIdx];
    const btn = document.getElementById('btn-line-height');
    if (btn) btn.innerHTML = `<i data-lucide="move-vertical" class="w-3 h-3"></i> INTERLINEA x${lh.toFixed(1)}`;

    // Applica a tutto il contenuto leggibile con forza !important
    const containers = document.querySelectorAll('.markdown-body, .note-text, #source-modal-body, .ai-result-content, .rich-desc');
    containers.forEach(c => {
        c.style.setProperty('line-height', lh, 'important');
        // Forza anche sui paragrafi e liste figli che potrebbero avere regole specifiche nel CSS
        const children = c.querySelectorAll('p, li, span, div');
        children.forEach(child => {
            child.style.setProperty('line-height', lh, 'important');
        });
    });
    window.safeCreateIcons();
};

let currentZoomIdx = localStorage.getItem('mappai-a11y-zoom') ? parseInt(localStorage.getItem('mappai-a11y-zoom')) : 0;
const zooms = [1.0, 1.5, 2.0];

window.cycleTextZoom = function () {
    window.applyTextZoom((currentZoomIdx + 1) % zooms.length);
};

window.applyTextZoom = function (idx) {
    currentZoomIdx = idx;
    localStorage.setItem('mappai-a11y-zoom', currentZoomIdx);
    const z = zooms[currentZoomIdx];

    const label = `Testo x${(z === 1.0 ? '1' : z)}`;
    const btnModal = document.getElementById('btn-text-zoom-modal');
    const btnPanel = document.getElementById('btn-text-zoom-panel');

    if (btnModal) btnModal.innerHTML = `<i data-lucide="zoom-in" class="w-6 h-6"></i>`;
    if (btnPanel) btnPanel.innerHTML = `<i data-lucide="zoom-in" class="w-4 h-4"></i> ${label}`;

    // On the landing page, force the zoom level to 1.0 to prevent any enlargement
    const isLandingVisible = !document.getElementById('map-view')?.classList.contains('active');
    const effectiveZ = isLandingVisible ? 1.0 : z;

    // Imposta la variabile CSS per permettere l'anti-zoom sui bottoni
    document.documentElement.style.setProperty('--app-zoom', effectiveZ);

    if (effectiveZ > 1.0) {
        document.body.classList.add('a11y-zoomed-modals');
    } else {
        document.body.classList.remove('a11y-zoomed-modals');
    }

    document.body.classList.remove('a11y-zoom-x1', 'a11y-zoom-x15', 'a11y-zoom-x2');
    if (effectiveZ === 1.0) {
        document.body.classList.add('a11y-zoom-x1');
    } else if (effectiveZ === 1.5) {
        document.body.classList.add('a11y-zoom-x15');
    } else if (effectiveZ === 2.0) {
        document.body.classList.add('a11y-zoom-x2');
    }

    // Zoom per tutti i contenitori primari e modali con testo
    const zoomSelectors = [
        '#sidebar',
        '#source-modal-content-box',
        '#ai-modal-content-box',
        '#study-player-modal > div',
        '#quiz-modal-content',
        '#app-guide-modal > div',
        '#app-tutorial-modal > div',
        '#config-ai-modal > div',
        '#merge-confirm-modal > div',
        '#validate-link-modal > div',
        '#user-profile-box',
        '#api-tutorial-modal > div',
        '#alert-box',
        '#prompt-box',
        '#confirm-box',
        '#study-config-modal > div',
        '#vault-manager-box',
        '#edit-node-box',
        '#contextual-ai-extension-modal > div',
        '#feedback-box'
    ];

    // Applica inline style per bypassare bug di Safari su calc/CSS variables
    const sourceBody = document.getElementById('source-modal-body');
    const aiBody = document.getElementById('ai-modal-body');
    const flashcardFront = document.getElementById('flashcard-front-text');
    const flashcardBack = document.getElementById('flashcard-back-text');
    const quizQuestion = document.getElementById('study-quiz-question');
    const quizOptions = document.querySelectorAll('#study-quiz-options .quiz-option');

    if (sourceBody) {
        if (effectiveZ === 1.0) sourceBody.style.removeProperty('font-size');
        else sourceBody.style.setProperty('font-size', `${effectiveZ * 16}px`, 'important');
    }
    if (aiBody) {
        if (effectiveZ === 1.0) aiBody.style.removeProperty('font-size');
        else aiBody.style.setProperty('font-size', `${effectiveZ * 16}px`, 'important');
    }
    if (flashcardFront) {
        if (effectiveZ === 1.0) flashcardFront.style.removeProperty('font-size');
        else flashcardFront.style.setProperty('font-size', `${effectiveZ * 24}px`, 'important');
    }
    if (flashcardBack) {
        if (effectiveZ === 1.0) flashcardBack.style.removeProperty('font-size');
        else flashcardBack.style.setProperty('font-size', `${effectiveZ * 18}px`, 'important');
    }
    if (quizQuestion) {
        if (effectiveZ === 1.0) quizQuestion.style.removeProperty('font-size');
        else quizQuestion.style.setProperty('font-size', `${effectiveZ * 20}px`, 'important');
    }
    quizOptions.forEach(opt => {
        if (effectiveZ === 1.0) opt.style.removeProperty('font-size');
        else opt.style.setProperty('font-size', `${effectiveZ * 13}px`, 'important');
    });

    // Ripristina root font size se era stato modificato
    document.documentElement.style.fontSize = '';

    // Forza reflow su iOS Safari per aggiornare le variabili CSS nei fogli di stile
    document.documentElement.classList.toggle('force-reflow');
    const _reflow = document.documentElement.offsetHeight;

    window.safeCreateIcons();
};

window.resetA11yTools = function () {
    currentLineHeightIdx = 0;
    currentZoomIdx = 0;
    const btnLh = document.getElementById('btn-line-height');
    const btnZModal = document.getElementById('btn-text-zoom-modal');
    const btnZPanel = document.getElementById('btn-text-zoom-panel');

    if (btnLh) btnLh.innerHTML = `<i data-lucide="move-vertical" class="w-3 h-3"></i> INTERLINEA x1.5`;
    if (btnZModal) btnZModal.innerHTML = `<i data-lucide="zoom-in" class="w-6 h-6"></i>`;
    if (btnZPanel) btnZPanel.innerHTML = `<i data-lucide="zoom-in" class="w-4 h-4"></i> Testo x1`;

    document.documentElement.style.setProperty('--app-zoom', 1);
    document.body.classList.remove('a11y-zoom-x1', 'a11y-zoom-x15', 'a11y-zoom-x2', 'a11y-zoomed-modals');
    document.body.classList.add('a11y-zoom-x1');

    const mainCard = document.querySelector('.glass-card.max-w-3xl');
    const body = document.getElementById('source-modal-body');
    const aiBody = document.getElementById('ai-modal-body');
    const flashcardFront = document.getElementById('flashcard-front-text');
    const flashcardBack = document.getElementById('flashcard-back-text');
    const quizQuestion = document.getElementById('study-quiz-question');
    const quizOptions = document.querySelectorAll('#study-quiz-options .quiz-option');

    if (mainCard) {
        mainCard.style.transform = '';
        mainCard.style.transformOrigin = '';
        mainCard.style.zoom = '';
    }
    if (body) {
        body.style.lineHeight = '';
        body.style.zoom = '';
        body.style.removeProperty('font-size');
    }
    if (aiBody) {
        aiBody.style.removeProperty('font-size');
    }
    if (flashcardFront) flashcardFront.style.removeProperty('font-size');
    if (flashcardBack) flashcardBack.style.removeProperty('font-size');
    if (quizQuestion) quizQuestion.style.removeProperty('font-size');
    quizOptions.forEach(opt => {
        opt.style.removeProperty('font-size');
    });
    document.documentElement.style.fontSize = '';
};
