/* tools/guida-docenti/gesti.js — i GESTI di navigazione dell'app, in un posto solo (23/8/26).
 *
 * Erano dentro `passi.js` e `campagna.js`, e servono anche al demo video
 * (`tools/demo-video/`): due copie sarebbero due verità che divergono al primo cambio di
 * selettore (inv. 6). Qui non ci sono scatti né copioni — solo «vai lì», «apri quello».
 *
 *   const gesti = require('./gesti.js')(lab);
 *   await gesti.menuCosa('Crea');
 *
 * Ogni funzione porta con sé la trappola che l'ha resa così: si legge il commento prima di
 * «semplificarla».
 */
'use strict';

module.exports = function (lab) {
    /** un elemento c'è ED è a schermo (larghezza, altezza, visibility) */
    const visibile = (sel) => lab.val(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';})()`);

    /** il pallino del Dev self-test non è roba da docenti: fuori da ogni fotogramma */
    async function nascondiDev() { await lab.val('(()=>{const b=document.getElementById("dst-btn"); if(b) b.style.display="none"; return 1})()'); }

    /** il menu «Cosa» della briciola: il bottone più a SINISTRA fra quelli visibili (la briciola
     *  porta la stessa classe su «4R» e «Scienze», e la landing sotto una console ha la sua,
     *  coperta) */
    async function menuCosa(voce) {
        const pt = await lab.val(`(()=>{const els=[...document.querySelectorAll('.mn-briciole__l--menu')].filter(e=>{const r=e.getBoundingClientRect(); if(!r.width) return false; const p=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return p&&(e.contains(p)||e===p);});
      const e=els.sort((a,b)=>a.getBoundingClientRect().x-b.getBoundingClientRect().x)[0]; if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
        if (!pt) throw new Error('menu della briciola non visibile (una finestra sopra?)');
        await lab.clicca(pt); await lab.pausa(350);
        await lab.clicca(await lab.perTesto(voce, 'body', 'button.mn-bric-menu__it')); await lab.pausa(1200);
        await nascondiDev();
    }

    /** la conferma «riprendi la generazione?» che un `pipeline.json` nel vault fa comparire */
    async function chiudiConferma() { if (await visibile('#mpr-no')) { await lab.clicca('#mpr-no'); await lab.pausa(600); } }

    /** torna alla landing da qualunque stato: mappa aperta → Home (ricarica); console → briciola «Crea» */
    async function landing() {
        if (await visibile('#map-control-card')) {
            await lab.val('window.backToLanding && window.backToLanding()'); await lab.pausa(1500);
            await lab.finoA('document.readyState==="complete" && !!window.safeCreateIcons && !document.documentElement.classList.contains("mn-boot")', 20000); await lab.pausa(800);
        }
        if (await visibile('.mm-box--console')) { await menuCosa('Crea'); }
        await nascondiDev();
    }

    async function cabinaChiudi() {
        const c = await lab.val('(()=>{const b=[...document.querySelectorAll(".mm-head__ico")].find(e=>/^Chiudi/.test(e.title||e.getAttribute("aria-label")||"")); if(!b) return 0; b.click(); return 1})()');
        if (c) { await lab.pausa(700); const esci = await lab.val('(()=>{const b=[...document.querySelectorAll(".mm-overlay button")].find(e=>e.textContent.trim()==="Esci"); if(!b) return 0; b.click(); return 1})()'); if (esci) await lab.pausa(700); }
    }

    async function cabinaVoce(testo) {
        /* la Cabina è aperta solo se c'è il suo bottone «Chiudi — Cabina» (anche INSEGNA/ELABORA
           hanno una colonna .mm-nav__v) */
        const aperta = await lab.val('!![...document.querySelectorAll(".mm-head__ico")].find(e=>/^Chiudi/.test(e.title||e.getAttribute("aria-label")||"")&&e.getBoundingClientRect().width>0)');
        if (!aperta) {
            const inConsole = await lab.val('(()=>{const b=[...document.querySelectorAll(".mm-head__ico--cabina")].find(e=>e.getBoundingClientRect().width>0); if(b){b.click(); return 1;} return 0;})()');
            if (!inConsole) await lab.clicca('#btn-cabina');
            await lab.pausa(1200);
        }
        await lab.clicca(await lab.perTesto(testo, 'body', 'button.mm-nav__v')); await lab.pausa(900);
    }

    /** i filtri Classe?/Materia? restano da una console all'altra: «mostra tutti» prima di cercare una mappa */
    async function mostraTutti() { await lab.val('(()=>{const b=[...document.querySelectorAll(".mn-filtri__tutte")].find(e=>e.getBoundingClientRect().width>0); if(b) b.click(); return 1;})()'); await lab.pausa(700); }

    async function apriMappa(nome) {
        await landing(); await menuCosa('Insegna'); await mostraTutti();
        await lab.clicca(await lab.perTesto(nome, 'body', 'button.mm-nav__v')); await lab.pausa(900);
        await lab.clicca(await lab.perTesto('Mappa', 'body', 'button.mn-cmd')); await lab.pausa(4500);
        await chiudiConferma(); await nascondiDev();
        await lab.finoA('document.querySelector("#map-control-card") && document.querySelectorAll("svg g.node-group").length>0', 15000);
        await lab.pausa(1500);
    }

    /** rettangolo dell'ultima finestra del motore dei modali (quella in cima) */
    async function boxInCima() {
        const r = await lab.val('(()=>{const b=[...document.querySelectorAll(".mm-box")].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;}); const e=b[b.length-1]; if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})()');
        if (!r) throw new Error('nessuna finestra del motore visibile');
        return r;
    }

    /** mette un file VERO nella fonte «Documenti» senza aprire il Finder: si spegne `click()`
     *  sull'input per la durata del gesto (il Finder nativo bloccherebbe il renderer) */
    async function aggiungiFile(tipo, percorsi) {
        await lab.val(`(()=>{ HTMLInputElement.prototype.__click = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function(){}; window.addSource(${JSON.stringify(tipo)}); HTMLInputElement.prototype.click = HTMLInputElement.prototype.__click; return 1; })()`);
        await lab.pausa(300);
        const sel = await lab.val('(()=>{const r=[...document.querySelectorAll("#sources-container .source-entry")]; const e=r[r.length-1]&&r[r.length-1].querySelector("input[type=file]"); if(!e) return null; e.id=e.id||("__src"+Date.now()); return "#"+e.id;})()');
        if (!sel) throw new Error('riga fonte senza input file');
        await lab.fileIn(sel, percorsi);
        /* ⚠️ NIENTE `change` a mano qui: `DOM.setFileInputFiles` lo spara già lui (misurato
           il 24/8 — `processSourceFile` girava 2 volte, 1 sola senza questa riga). Con un PDF
           il doppio giro non si vedeva; con una FOTO impilava DUE modali «Che cosa sai di
           questa fonte?», e il passo 09, che aspetta la sparizione di quel testo, non finiva
           mai. Se un giorno l'evento non arrivasse più, rimettere il dispatch CONDIZIONATO
           al fatto che la riga della fonte sia rimasta vuota, mai incondizionato. */
    }

    return { visibile, nascondiDev, menuCosa, chiudiConferma, landing, cabinaChiudi, cabinaVoce, mostraTutti, apriMappa, boxInCima, aggiungiFile };
};
