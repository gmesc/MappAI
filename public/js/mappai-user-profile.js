// ==========================================
// PROFILO ALLIEVO — estratto da app.js
// ==========================================
// Caricato DOPO app.js: usa MappAICabina/showToast via scope globale.
// 12/10/2026 (0087, lotto 10-modali, Giacomo: «profilo alla Cabina»): il modale
// #user-profile-modal è USCITO. I profili degli allievi vivono in Cabina › Allievi;
// qui resta l'etichetta progressiva (la leggono altri moduli) e il PONTE che porta
// «Gestisci profili» del profilo insegnante (mappai-teacher-profile.js) alla Cabina.
//
// ⚠️ Il NOME dell'allievo NON si chiede più (15/9/2026). Il campo «Come ti chiami?»
// era l'unico posto in cui l'app domandava a un minorenne come si chiama, e il suo
// valore finiva nel prompt del tutor — contro la frase del pannello Privacy «Il NOME
// dell'allievo non entra mai» (mappai-cabina.js, `cb_pv_allievi_d`).
// `nickname` RESTA la chiave locale del profilo — la leggono dieci moduli (pickers di
// CREA/INSEGNA/Cabina, live-classes, vault-manager, study-session) e le schede già
// salvate la portano — ma da qui in avanti la SCRIVE l'app, non l'allievo: è
// un'etichetta progressiva che non identifica nessuno.

/* Etichetta di un profilo nuovo: la prima «Studente N» libera.
   Stesso vocabolario di mappai-study-session.js («Studente Anonimo»).
   Pura: `presi` è la lista delle etichette già in uso. */
window.nuovaEtichettaProfilo = function (presi) {
    const usate = new Set((presi || [])
        .map(n => String(n == null ? '' : n).trim().toLowerCase())
        .filter(Boolean));
    for (let i = 1; ; i++) {
        const et = 'Studente ' + i;
        if (!usate.has(et.toLowerCase())) return et;
    }
};

/* Il ponte: chi chiamava il modale arriva in Cabina › Allievi. Sull'iPad (il reader
   copia questo file) la Cabina non c'è: un avviso e basta. `typeof` (inv. 3). */
window.showUserProfileModal = function () {
    if (window.MappAICabina && typeof window.MappAICabina.apri === 'function') {
        window.MappAICabina.apri('allievi');
        return;
    }
    const msg = window.t ? window.t('tst_profili_in_cabina', 'I profili degli allievi stanno in Cabina › Allievi.')
        : 'I profili degli allievi stanno in Cabina › Allievi.';
    if (window.showToast) window.showToast(msg, 'info');
};
