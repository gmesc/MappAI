/**
 * MappAI - misuratore — ponte renderer ↔ main.
 * Unica superficie esposta al renderer. Ogni canale è dichiarato in
 * specs/013-misuratore/contracts/ipc-and-snapshot.md.
 *
 * La chiave AI non compare qui in lettura: si imposta e se ne chiede lo stato,
 * ma non viene mai restituita al renderer (FR-034, contracts/ipc).
 */
const { contextBridge, ipcRenderer } = require('electron');

const invoca = (canale) => (...args) => ipcRenderer.invoke(canale, ...args);

contextBridge.exposeInMainWorld('misAPI', {
    // radice dati
    datiRadice: invoca('dati-radice'),
    apriCartellaDati: invoca('apri-cartella-dati'),

    // import — riempiti nella Phase 3
    scegliVault: invoca('scegli-vault'),
    scegliPdf: invoca('scegli-pdf'),
    scegliCartellaClasse: invoca('scegli-cartella-classe'),
    importa: invoca('importa'),
    contestoMappai: invoca('contesto-mappai'),

    // elementi
    elementiLista: invoca('elementi-lista'),
    elementoLeggiCorpi: invoca('elemento-leggi-corpi'),
    elementoElimina: invoca('elemento-elimina'),
    elementoAggiorna: invoca('elemento-aggiorna'),

    // report
    reportLista: invoca('report-lista'),
    reportSalva: invoca('report-salva'),
    reportApri: invoca('report-apri'),
    reportMostraCartella: invoca('report-mostra-cartella'),
    reportElimina: invoca('report-elimina'),
    reportLeggi: invoca('report-leggi'),

    // profili
    profiliLista: invoca('profili-lista'),
    profiloSalva: invoca('profilo-salva'),
    profiloRipristina: invoca('profilo-ripristina'),

    // pdf e AI — riempiti nelle Phase 6 e 10
    pdfEstrai: invoca('pdf-estrai'),
    aiProsa: invoca('ai-prosa'),
    aiChiaveImposta: invoca('ai-chiave-imposta'),
    aiChiaveStato: invoca('ai-chiave-stato'),
});
