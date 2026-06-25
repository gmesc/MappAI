// ==========================================
// POMODORO & STATS LOGIC
// ==========================================
// Estratto da app.js (refactor/app-js-decomposition).
// Caricato DOPO app.js: usa appState/safeCreateIcons/showToast via scope globale.
// NOTA: il monkey-patch di renderGraph che chiama window.updateStudyStats()
// resta in app.js (è glue render+storage, dipende da StorageManager).
let pomodoroInterval;
let pomodoroDuration = 25 * 60;
let pomodoroTimeLeft = 25 * 60;
let isPomodoroRunning = false;

window.setPomodoroDuration = function (mins) {
    pomodoroDuration = mins * 60;
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    pomodoroTimeLeft = pomodoroDuration;

    const btn = document.getElementById('pomodoro-btn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current"></i>`;
        btn.className = "p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition shadow-sm flex items-center justify-center";
    }
    updatePomodoroDisplay();
    if (window.safeCreateIcons) window.safeCreateIcons();

    const p15 = document.getElementById('pomodoro-preset-15');
    const p25 = document.getElementById('pomodoro-preset-25');
    if (p15 && p25) {
        if (mins === 15) {
            p15.className = "px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 transition font-bold";
            p25.className = "px-2.5 py-1 text-slate-500 rounded-md hover:bg-slate-50 transition font-bold";
        } else {
            p25.className = "px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 transition font-bold";
            p15.className = "px-2.5 py-1 text-slate-500 rounded-md hover:bg-slate-50 transition font-bold";
        }
    }
};

window.togglePomodoro = function () {
    const btn = document.getElementById('pomodoro-btn');
    if (isPomodoroRunning) {
        clearInterval(pomodoroInterval);
        isPomodoroRunning = false;
        btn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current"></i>`;
        btn.className = "p-2 bg-amber-50 text-amber-600 rounded-lg border border-amber-200 hover:bg-amber-100 transition shadow-sm flex items-center justify-center";
    } else {
        isPomodoroRunning = true;
        btn.innerHTML = `<i data-lucide="pause" class="w-4 h-4 fill-current"></i>`;
        btn.className = "p-2 bg-slate-50 text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-100 transition shadow-sm flex items-center justify-center";
        pomodoroInterval = setInterval(() => {
            if (pomodoroTimeLeft > 0) {
                pomodoroTimeLeft--;
                updatePomodoroDisplay();
            } else {
                window.resetPomodoro();
                try {
                    let sessions = parseInt(localStorage.getItem('mappai_pomodoro_sessions') || '0', 10);
                    sessions++;
                    localStorage.setItem('mappai_pomodoro_sessions', sessions.toString());
                    window.updatePomodoroSessionsDisplay();
                } catch (e) {
                    console.error("Error updating pomodoro sessions", e);
                }
                window.showToast("Tempo scaduto! Fai una pausa.", "success");
            }
        }, 1000);
    }
    if (window.safeCreateIcons) window.safeCreateIcons();
};

window.resetPomodoro = function () {
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    pomodoroTimeLeft = pomodoroDuration;
    const btn = document.getElementById('pomodoro-btn');
    btn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current"></i>`;
    btn.className = "p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition shadow-sm flex items-center justify-center";
    updatePomodoroDisplay();
    if (window.safeCreateIcons) window.safeCreateIcons();
};

function updatePomodoroDisplay() {
    const m = Math.floor(pomodoroTimeLeft / 60).toString().padStart(2, '0');
    const s = (pomodoroTimeLeft % 60).toString().padStart(2, '0');
    const pTime = document.getElementById('pomodoro-time');
    if (pTime) pTime.innerText = `${m}:${s}`;
}

window.updatePomodoroSessionsDisplay = function () {
    try {
        const count = localStorage.getItem('mappai_pomodoro_sessions') || '0';
        const badge = document.getElementById('pomodoro-sessions-badge');
        if (badge) {
            badge.innerText = `Sessioni: ${count}`;
        }
    } catch (e) {
        console.error("Error displaying pomodoro sessions", e);
    }
};

window.resetPomodoroSessions = function () {
    if (confirm("Sei sicuro di voler azzerare le sessioni di Pomodoro completate?")) {
        try {
            localStorage.setItem('mappai_pomodoro_sessions', '0');
            window.updatePomodoroSessionsDisplay();
            window.showToast("Sessioni azzerate", "info");
        } catch (e) {
            console.error("Error resetting pomodoro sessions", e);
        }
    }
};


window.updateStudyStats = function () {
    let done = 0, review = 0, todo = 0, total = 0;
    if (!appState || !appState.db || !appState.db.nodes) return;

    appState.db.nodes.forEach(n => {
        if (n.level === 0) return; // exclude root
        total++;
        if (n.studyStatus === 'done') done++;
        else if (n.studyStatus === 'review') review++;
        else if (n.studyStatus === 'todo') todo++;
    });

    const statsDone = document.getElementById('stats-done');
    if (statsDone) statsDone.innerText = done;
    const statsReview = document.getElementById('stats-review');
    if (statsReview) statsReview.innerText = review;
    const statsTodo = document.getElementById('stats-todo');
    if (statsTodo) statsTodo.innerText = todo;

    const perc = total === 0 ? 0 : Math.round((done / total) * 100);
    const progText = document.getElementById('study-progress-text');
    if (progText) progText.innerText = `${perc}%`;
    const progBar = document.getElementById('study-progress-bar');
    if (progBar) progBar.style.width = `${perc}%`;
};
