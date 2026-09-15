// ==========================================
// USER PROFILE (SOTA) — estratto da app.js
// ==========================================
// Caricato DOPO app.js: usa appState/showToast/showPrompt/safeCreateIcons via scope globale.
// Il Vault Manager (stessa sezione originale) resta in app.js.
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
window.updateProfilesDropdown = function () {
    const select = document.getElementById('up-saved-profiles');
    if (!select) return;

    // Keep the first "+ Nuovo Profilo" option
    select.innerHTML = '<option value="">+ Nuovo Profilo</option>';

    appState.allProfiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nickname;
        opt.text = `${p.nickname} (${p.grade || 'Senza classe'})`;
        select.appendChild(opt);
    });

    // Select the current one if it exists
    if (appState.userProfile && appState.userProfile.nickname) {
        select.value = appState.userProfile.nickname;
    } else {
        select.value = "";
    }
};

window.loadSelectedProfile = function () {
    const select = document.getElementById('up-saved-profiles');
    const selectedNickname = select.value;

    if (!selectedNickname) {
        // Clear fields for a new profile
        appState.userProfile = { nickname: "", age: "", grade: "", system: "Ticino" };
        document.getElementById('up-age').value = "";
        document.getElementById('up-system').value = "Ticino";
        window.updateGradeOptions();
        document.getElementById('up-grade').value = "";
        return;
    }

    const profile = appState.allProfiles.find(p => p.nickname === selectedNickname);
    if (profile) {
        appState.userProfile = { ...profile };
        document.getElementById('up-age').value = profile.age || "";
        document.getElementById('up-system').value = profile.system || "Ticino";
        window.updateGradeOptions();
        if (profile.grade) {
            document.getElementById('up-grade').value = profile.grade;
        }
    }
};

window.updateGradeOptions = function () {
    const systemSelect = document.getElementById('up-system');
    const gradeSelect = document.getElementById('up-grade');
    const currentVal = gradeSelect.value;
    const system = systemSelect.value;

    gradeSelect.innerHTML = '';

    // Add default empty option
    const emptyOpt = document.createElement('option');
    emptyOpt.value = "";
    emptyOpt.text = "Classe...";
    gradeSelect.appendChild(emptyOpt);

    if (system === 'Liceo_Ticino') {
        for (let i = 1; i <= 4; i++) {
            const opt = document.createElement('option');
            const val = `${i}° Anno Liceo`;
            opt.value = val;
            opt.text = val;
            gradeSelect.appendChild(opt);
        }
    } else if (system === 'Liceo_Italia') {
        for (let i = 1; i <= 5; i++) {
            const opt = document.createElement('option');
            const val = `${i}° Anno Superiore`;
            opt.value = val;
            opt.text = val;
            gradeSelect.appendChild(opt);
        }
    } else {
        const maxGrade = system === 'Ticino' ? 4 : 3;
        for (let i = 1; i <= maxGrade; i++) {
            const opt = document.createElement('option');
            const val = `${i}a Media`;
            opt.value = val;
            opt.text = val;
            gradeSelect.appendChild(opt);
        }
    }

    // Restore previous value if it's still valid
    if (currentVal && Array.from(gradeSelect.options).some(o => o.value === currentVal)) {
        gradeSelect.value = currentVal;
    }
};

window.showUserProfileModal = function () {
    const modal = document.getElementById('user-profile-modal');
    const box = document.getElementById('user-profile-box');

    window.updateProfilesDropdown();

    // Fill fields
    document.getElementById('up-age').value = appState.userProfile.age || "";
    document.getElementById('up-system').value = appState.userProfile.system || "Ticino";

    // Update grade options based on system, then set value
    window.updateGradeOptions();
    if (appState.userProfile.grade) {
        document.getElementById('up-grade').value = appState.userProfile.grade;
    }

    modal.style.display = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
    window.safeCreateIcons();
};

window.closeUserProfileModal = function () {
    const modal = document.getElementById('user-profile-modal');
    const box = document.getElementById('user-profile-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.saveUserProfile = function () {
    /* Quale scheda si sta salvando lo dice la tendina, non un campo nome: con una
       voce scelta si MODIFICA quella (e la sua etichetta resta, comprese le schede
       vecchie che portano un nome vero); su «+ Nuovo Profilo» l'etichetta la conia
       l'app. Nessun nome chiesto all'allievo. */
    const select = document.getElementById('up-saved-profiles');
    const scelto = select ? select.value : '';
    const nickname = scelto
        || window.nuovaEtichettaProfilo(appState.allProfiles.map(p => p && p.nickname));

    appState.userProfile.nickname = nickname;
    appState.userProfile.age = document.getElementById('up-age').value.trim();
    appState.userProfile.grade = document.getElementById('up-grade').value;
    appState.userProfile.system = document.getElementById('up-system').value;

    // Update or add to allProfiles
    const existingIndex = appState.allProfiles.findIndex(p => p.nickname && p.nickname.toLowerCase() === nickname.toLowerCase());
    if (existingIndex >= 0) {
        appState.allProfiles[existingIndex] = { ...appState.userProfile };
    } else {
        appState.allProfiles.push({ ...appState.userProfile });
    }

    localStorage.setItem('mappai_user_profile', JSON.stringify(appState.userProfile));
    localStorage.setItem('mappai_all_profiles', JSON.stringify(appState.allProfiles));

    window.showToast(window.t('tst_profile_saved', "Profilo salvato correttamente!"), "success");
    window.closeUserProfileModal();
};

window.resetUserProfile = function () {
    const currentNickname = appState.userProfile.nickname;
    if (!currentNickname) {
        window.showToast(window.t('tst_no_profile', "Nessun profilo selezionato da eliminare."), "error");
        return;
    }

    window.showPrompt("Verifica Reset", "", (val) => {
        if (val.toLowerCase().trim() === "elimina") {
            // Remove from allProfiles
            appState.allProfiles = appState.allProfiles.filter(p => p.nickname !== currentNickname);
            localStorage.setItem('mappai_all_profiles', JSON.stringify(appState.allProfiles));

            // Clear current profile
            appState.userProfile = { nickname: "", age: "", grade: "", system: "Ticino" };
            localStorage.removeItem('mappai_user_profile');

            window.showToast(window.t('tst_profile_deleted', "Profilo eliminato."), "success");
            window.closeUserProfileModal();
        } else {
            window.showToast(window.t('tst_wrong_string', "Stringa errata. Reset annullato."));
        }
    }, "Scrivi 'elimina' per confermare la cancellazione di " + currentNickname + ":");
};
