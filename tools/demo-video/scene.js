/* tools/demo-video/scene.js — i GESTI di ogni scena del demo (23/8/26).
 *
 * Gira sull'app VERA (`npx electron . --remote-debugging-port=9222`), coi vault veri della 4R.
 * Regola: si LEGGE, non si scrive. Le uniche due scritture sono dichiarate nel piano —
 * il vault «Elettricità - demo» che la scena 3 genera, e niente altro. Nessun materiale
 * dell'utente viene salvato, sovrascritto o cancellato (inv. 13).
 *
 * I gesti di navigazione vengono da `tools/guida-docenti/gesti.js`: una fonte sola (inv. 6).
 */
'use strict';
const path = require('path');
const lab = require('../guida-docenti/lab.js');
const video = require('./lab-video.js');
const { MAPPA, DOSSIER, DEMO, CLASSE } = require('./copione.js');

const CASA = path.join(process.env.HOME, 'Documents', 'MappAI - file');
const vaultDi = (materia, vault, dentro) => path.join(CASA, 'Mappe', CLASSE, materia, vault, dentro || '');
const PDF_FONTE = vaultDi(MAPPA.materia, MAPPA.vault, 'Fonti/2.1 PROJECT E.pdf');

module.exports = function (opz) {
    const g = require('../guida-docenti/gesti.js')(lab);
    const { visibile, landing, menuCosa, cabinaVoce, cabinaChiudi, mostraTutti, apriMappa, aggiungiFile, nascondiDev } = g;
    const senzaChiave = !!(opz && opz.senzaChiave);

    /* ── 02 · LA CLASSE ────────────────────────────────────────────────────
       Non si CREA una classe (scriverebbe sul disco di Giacomo): si mostra il gesto —
       «Crea profilo» col suo modulo e la taratura — e poi il profilo VERO della 4R, che è
       la classe di tutto il video, con Scienze e Storia fra le discipline. */
    async function scenaClasse() {
        await landing();
        await cabinaVoce('Classi');
        await lab.pausa(1400);
        const crea = await lab.perTesto('Crea profilo', 'body', 'button');
        await video.cliccaPiano(crea);
        await lab.pausa(1600);
        if (await visibile('#class-accounts-modal')) {
            /* si riempie il modulo per far vedere che il nome nasce da grado + sezione, poi
               si ANNULLA: il video non deve lasciare una classe finta nel profilo vero */
            await lab.val(`(()=>{const s=document.querySelector('#class-accounts-modal select'); if(s){s.selectedIndex=Math.min(4,s.options.length-1); s.dispatchEvent(new Event('change',{bubbles:true}));} return 1;})()`);
            await lab.pausa(1500);
            await lab.val(`(()=>{const b=[...document.querySelectorAll('#class-accounts-modal button')].find(e=>/^Annulla$/.test(e.textContent.trim())); if(b) b.click(); return 1;})()`);
            await lab.pausa(900);
        }
        await lab.tasto('Escape'); await lab.pausa(600);
        await cabinaVoce('Classi'); await lab.pausa(900);
        /* il profilo della 4R: le discipline e la «🎯 Taratura AI» */
        const ges = await lab.val('(()=>{const b=[...document.querySelectorAll(".mm-console__area button")].find(e=>/Gestisci/.test(e.title||e.getAttribute("aria-label")||e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
        if (ges) { await video.muoviPiano({ x: ges.x - 260, y: ges.y + 120 }, ges, 600); await lab.clicca(ges); await lab.pausa(2200); }
        await lab.pausa(2500);
        await lab.tasto('Escape'); await lab.pausa(800);
        /* la Cabina resta aperta e copre la briciola: si chiude QUI, o la scena dopo
           trova «menu della briciola non visibile» (misurato al primo giro) */
        await cabinaChiudi(); await lab.pausa(600);
    }

    /* ── 03 · IL PROGETTO ──────────────────────────────────────────────────
       Genera DAVVERO, ma la sola mappa: i materiali di partenza (scelta multipla + domande
       aperte per sette angolazioni) sarebbero un quarto d'ora e 60-80 richieste della quota
       di Giacomo. Le spunte si spengono PRIMA di entrare in scena, così la card è già blu
       «Genera Mappa» e non cambia colore sotto gli occhi di chi guarda. */
    async function preparaProgetto() {
        await landing(); await menuCosa('Crea');
        await lab.val('(()=>{document.querySelectorAll("#mn-bento input[type=checkbox]:checked").forEach(c=>{c.checked=false;c.dispatchEvent(new Event("change",{bubbles:true}));}); return 1;})()');
        await lab.pausa(700);
        /* la pagina come la trova chi comincia: niente fonti, niente tema */
        await lab.val(`(()=>{ const t=document.querySelector('#root-node-name'); if(t){t.value=''; t.dispatchEvent(new Event('input',{bubbles:true}));}
      document.querySelectorAll('#mn-files button').forEach(b=>b.click()); return 1; })()`);
        await lab.pausa(600);
    }

    async function scenaProgetto() {
        /* 1. la fonte */
        await aggiungiFile('doc', [PDF_FONTE]);
        await lab.finoA('/pronto|caricato/.test(document.querySelector("#sources-container")?.textContent||"")', 15000);
        await lab.pausa(1200);
        /* 2. il tema */
        await video.cliccaPiano('#root-node-name');
        await lab.scrivi(DEMO.titolo);
        await lab.pausa(900);
        /* 3. per chi */
        await lab.val(`(()=>{const s=document.querySelector("#mp-chi"); const o=[...s.options].find(o=>o.textContent.trim()===${JSON.stringify(CLASSE)}); if(o){s.value=o.value; s.dispatchEvent(new Event("change",{bubbles:true}));} return 1;})()`);
        await lab.pausa(900);
        await lab.val(`(()=>{const s=document.querySelector("#mp-disc"); const o=[...s.options].find(o=>o.textContent.trim()===${JSON.stringify(MAPPA.materia)}); if(o){s.value=o.value; s.dispatchEvent(new Event("change",{bubbles:true}));} return 1;})()`);
        await lab.pausa(1200);
        /* 4. genera */
        const r = await lab.rect('#mn-genera');
        await video.muoviPiano({ x: r.x + 80, y: r.y + r.h + 120 }, { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }, 700);
        await lab.pausa(600);
        if (senzaChiave) { await lab.pausa(2500); return; }        /* senza chiave: si taglia qui */
        await lab.clicca('#mn-genera'); await lab.pausa(1500);
        /* «Per chi è questa mappa?»: le tendine sono già compilate, si conferma */
        if (await visibile('#gen-class')) {
            await lab.pausa(1800);
            await lab.val('(()=>{const b=[...document.querySelectorAll("#gen-class button, [data-gok]")].find(e=>/^Genera$/.test(e.textContent.trim())); if(b) b.click(); return 1;})()');
            await lab.pausa(1500);
        }
        /* il velo con le fasi vere: si resta finché la mappa non è sullo schermo (tetto 6 min) */
        await lab.finoA('document.querySelector("#map-control-card") && document.querySelectorAll("svg g.node-group").length>0', 360000);
        await lab.pausa(3000);
    }

    /* ── 04 · LA MAPPA IN CLASSE ──────────────────────────────────────────
       Le viste, i livelli, la scheda di un nodo, e la proiezione di una fonte iconografica. */
    async function scenaMappa() {
        /* le tre viste: il bottone cicla ALBERO → FASCI → DAG → MAPPA */
        for (const _ of ['fasci', 'dag']) { await lab.clicca('#card-btn-layout'); await lab.pausa(2600); }
        await lab.clicca('#card-btn-layout'); await lab.pausa(5000);     /* mappa libera: la fisica si allarga */
        await lab.val('window.resetZoom && window.resetZoom(); 1'); await lab.pausa(2200);
        /* i livelli: prima i rami, poi tutto */
        await lab.val('(()=>{const s=document.querySelector("#level-slider"); s.value=1; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true})); return 1;})()');
        await lab.pausa(2600);
        await lab.val('(()=>{const s=document.querySelector("#level-slider"); s.value=s.max; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true})); return 1;})()');
        await lab.pausa(2200);
        /* una voce: la Scheda Focus */
        const nodo = await lab.val('(()=>{const g=[...document.querySelectorAll("svg g.node-group")].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0;}); const e=g[Math.min(2,g.length-1)]; if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
        if (nodo) { await video.muoviPiano({ x: nodo.x - 200, y: nodo.y + 160 }, nodo, 650); await lab.clicca(nodo); await lab.pausa(3800); await lab.tasto('Escape'); await lab.pausa(1000); }
    }

    /* la proiezione sta in una scena sua dentro la 04: si entra da INSEGNA sul dossier */
    async function scenaProietta() {
        await landing(); await menuCosa('Insegna'); await mostraTutti();
        await lab.clicca(await lab.perTesto(DOSSIER.vault, 'body', 'button.mm-nav__v')); await lab.pausa(1600);
        const pro = await lab.val('(()=>{const b=[...document.querySelectorAll("button.mn-cmd")].find(e=>/Proietta/.test(e.title||e.getAttribute("aria-label")||e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
        if (!pro) return;
        await video.muoviPiano({ x: pro.x - 200, y: pro.y + 140 }, pro, 600);
        await lab.clicca(pro); await lab.pausa(2600);
        if (await visibile('#pj-overlay')) {
            /* lo stato della proiezione PERSISTE fra un'apertura e l'altra: se il pannello
               «Affianca» è rimasto aperto da un giro precedente, si chiude col suo toggle —
               o tutta la scena esce con una colonna bianca a destra (misurato, due volte) */
            const pannello = await lab.val('(()=>{const m=document.querySelector("#pj-overlay .pj-mat"); return !!(m && m.getBoundingClientRect().width>0);})()');
            if (pannello) { await lab.clicca('[data-pj="split"]'); await lab.pausa(700); }
            /* la foto sola, a tutto schermo: È la scena. Niente «Affianca» nel video — su
               questo vault le tendine del pannello sono vuote (i set li ricorda il computer
               che li ha generati: l'acerbo dichiarato dalla guida docenti, cap. 9) e un
               pannello bianco in un video promozionale racconta la cosa sbagliata. */
            await lab.pausa(1600);
            /* lo zoom della lezione: la rotellina ingrandisce dove sta il mouse */
            const area = await lab.rect('#pj-overlay .pj-img-area');
            const cx = Math.round(area.x + area.w * 0.45), cy = Math.round(area.y + area.h * 0.45);
            await video.muoviPiano({ x: cx - 200, y: cy + 150 }, { x: cx, y: cy }, 500);
            for (let i = 0; i < 3; i++) { await lab.rotella('#pj-overlay .pj-img-area', -140); await lab.pausa(500); }
            await lab.pausa(900);
            for (let i = 0; i < 2; i++) { await lab.rotella('#pj-overlay .pj-img-area', 140); await lab.pausa(400); }
            await lab.val('(()=>{const b=[...document.querySelectorAll("#pj-overlay .pj-zoombar button")].find(e=>/Adatta/.test(e.textContent)); if(b) b.click(); return 1;})()');
            await lab.pausa(1200);
            await lab.tasto('Escape'); await lab.pausa(700);
            if (await visibile('#pj-overlay')) { await lab.clicca('[data-pj="chiudi"]'); await lab.pausa(700); }
        }
    }

    /* ── 07 · CORREGGERE ──────────────────────────────────────────────────
       Si apre l'editor di un quiz VERO, si riscrive una domanda, e si esce SENZA salvare:
       il documento di Giacomo resta com'era (inv. 18 al contrario — qui non si tocca nulla). */
    async function scenaCorreggere() {
        await landing(); await menuCosa('Elabora'); await mostraTutti();
        await lab.clicca(await lab.perTesto(MAPPA.titolo, 'body', 'button.mm-nav__v')); await lab.pausa(2200);
        const quiz = await lab.perTesto('Quiz', 'body', 'button.mm-tabg__t');
        if (await lab.val(`(()=>{const b=document.querySelector(${JSON.stringify(quiz)}); return b && b.getAttribute('aria-expanded')==='false';})()`)) { await lab.clicca(quiz); await lab.pausa(900); }
        await lab.val('document.querySelectorAll("[data-lab]").forEach(e=>e.removeAttribute("data-lab"))');
        const riga = await lab.perTesto('Scelta Multipla', 'body', 'tr.mm-tab__riga');
        await video.cliccaPiano(riga); await lab.pausa(3000);
        const mod = await lab.val('(()=>{const b=[...document.querySelectorAll(".de-bar button")].find(e=>/Modifica/.test(e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
        if (mod) {
            await video.muoviPiano({ x: mod.x - 180, y: mod.y + 120 }, mod, 520);
            await lab.clicca(mod); await lab.pausa(2600);
            /* una correzione VISIBILE ma non salvata: si scrive in coda alla prima domanda */
            const campo = await lab.val('(()=>{const e=document.querySelector(".de-list [contenteditable], .de-list textarea, .de-list input[type=text]"); if(!e) return null; e.scrollIntoView({block:"center"}); const r=e.getBoundingClientRect(); return {x:Math.round(r.x+Math.min(r.width-20,260)),y:Math.round(r.y+r.height/2)};})()');
            if (campo) { await video.muoviPiano({ x: campo.x - 200, y: campo.y + 120 }, campo, 520); await lab.clicca(campo); await lab.pausa(500); await lab.scrivi(' (con l\'esempio della lampadina)'); await lab.pausa(1800); }
            /* il puntatore sulla barra: «Crea PDF» si mostra, non si preme */
            const pdf = await lab.val('(()=>{const b=[...document.querySelectorAll(".de-bar button")].find(e=>/Crea PDF/.test(e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
            if (pdf) { await video.muoviPiano({ x: pdf.x - 240, y: pdf.y + 160 }, pdf, 700); await lab.pausa(1800); }
        }
        /* fuori senza salvare: due ESC e, se compare, «Esci senza salvare» */
        await lab.tasto('Escape'); await lab.pausa(900);
        await lab.val('(()=>{const b=[...document.querySelectorAll("button")].find(e=>/senza salvare|Esci/i.test(e.textContent.trim())&&e.getBoundingClientRect().width>0); if(b) b.click(); return 1;})()');
        await lab.pausa(900); await lab.tasto('Escape'); await lab.pausa(600);
    }

    return { scenaClasse, preparaProgetto, scenaProgetto, scenaMappa, scenaProietta, scenaCorreggere, apriMappa, landing, nascondiDev, PDF_FONTE, vaultDi };
};
