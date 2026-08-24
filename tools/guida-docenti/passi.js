/* tools/guida-docenti/passi.js — i PASSI della campagna, in ordine di guida (22/8/26).
 * Ogni passo = uno o più scatti. Nome = «NN-capitolo-soggetto». I selettori vengono dai
 * sondaggi dal vivo del 22/8 e da fatti/*.md (file:riga là).
 * Capitoli: 02 cosa serve · 03 prima apertura · 04 classe · 05 CREA · 06 mappa · 07 ELABORA ·
 * 08 INSEGNA · 09 foto/dossier · 10 Cabina · 11 disco · 13 appendice QR. */
module.exports = function ({ passo, esito, lab, menuCosa, nascondiDev, fotoDi, CASA, LAB, VAULT_MM, VAULT_DOSSIER }) {
  const path = require('path');
  const PDF_FONTE = fotoDi('Scienze', VAULT_MM, 'Fonti/2.1 PROJECT E.pdf');
  const FOTO = fotoDi('Storia', VAULT_DOSSIER, 'Allegati/grind this heels.jpg');
  const J = { formato: 'jpeg', qualita: 88 };          // scatti interi: jpeg leggero
  const P = { formato: 'png' };                         // ritagli: png nitido

  /* ── navigazione: i gesti stanno in gesti.js, condivisi col demo video (inv. 6) ── */
  const g = require('./gesti.js')(lab);
  const { visibile, chiudiConferma, landing, cabinaChiudi, cabinaVoce, mostraTutti, apriMappa, boxInCima, aggiungiFile } = g;
  async function scattaBox(nome, margine) { const r = await boxInCima(); await lab.scatta(nome, Object.assign({ clip: { x: r.x - (margine || 10), y: r.y - (margine || 10), width: r.w + 2 * (margine || 10), height: r.h + 2 * (margine || 10) } }, P)); }

  /* ══════════════ 03 — LA PRIMA APERTURA ══════════════════════════════ */
  passo('03-blocco-beta', async () => {
    await landing();
    await lab.ls('mappai_beta_access_granted', null); await lab.ricarica(3500);
    await lab.finoA('document.querySelector("#machine-id-display") && !/CARICAMENTO/.test(document.querySelector("#machine-id-display").textContent)', 8000);
    await lab.scatta('03-blocco-beta', J);
    await lab.scatta('03-blocco-beta-riquadro', Object.assign({ sel: '#beta-lock-box', margine: 24 }, P));
    await lab.ls('mappai_beta_access_granted', 'true');
    await lab.ricarica(3500); await nascondiDev();     // il velo di blocco resta finché non si ricarica
  });
  // (niente passo «onboarding lingue»: è codice morto — fatti/i-buco-prima-apertura.md §0 — provato anche qui il 22/8:
  //  senza mappai_language/mappai_lang_onboarded il modale non compare, perché changeLanguage scrive la lingua prima del controllo)
  passo('03-landing-vuota', async () => {
    await landing(); await lab.pausa(4500);      // il toast della chiave mancante dura ~3,4 s
    await lab.scatta('03-landing-vuota', J);
    await lab.numeri([{ sel: '#btn-cabina', n: 1, dove: 'b' }, { sel: '.mn-briciole__l--menu', n: 2, dove: 'b' }]);
    await lab.scatta('03-landing-barra', Object.assign({ clip: { x: 0, y: 0, width: 520, height: 130 } }, P));
    await lab.pulito();
    await lab.clicca('.mn-briciole__l--menu'); await lab.pausa(400);
    await lab.numeri([{ sel: await lab.perTesto('Crea', 'body', 'button.mn-bric-menu__it'), n: 1, dove: 'r' }, { sel: await lab.perTesto('Elabora', 'body', 'button.mn-bric-menu__it'), n: 2, dove: 'r' }, { sel: await lab.perTesto('Insegna', 'body', 'button.mn-bric-menu__it'), n: 3, dove: 'r' }]);
    await lab.scatta('03-menu-cosa', Object.assign({ clip: { x: 0, y: 0, width: 420, height: 240 } }, P));
    await lab.pulito(); await lab.tasto('Escape'); await lab.pausa(300);
  });

  /* ══════════════ 05 — CREA ═════════════════════════════════════════════ */
  passo('05-crea-vuota', async () => {
    await landing(); await menuCosa('Crea');
    /* la pagina come la trova un tester che non ha ancora scelto niente: senza fonti,
       senza tema, col riquadro giallo vuoto. Una campagna ripetuta trova «Chi:» e
       «Cosa:» già compilati dal passo successivo — si azzerano qui, non a mano. */
    await lab.val(`(()=>{ ['mp-chi','mp-disc'].forEach(id=>{const s=document.getElementById(id); if(s){s.value=''; s.dispatchEvent(new Event('change',{bubbles:true}));}});
      const t=document.querySelector('#root-node-name'); if(t){t.value=''; t.dispatchEvent(new Event('input',{bubbles:true}));}
      document.querySelectorAll('#mn-files .mn-file__x, #mn-files button').forEach(b=>b.click()); return 1; })()`);
    /* il toast «Nessuna classe attiva: contenuti AI generici» nasce dal cambio dei due
       menu e finirebbe nello scatto: si aspetta che sparisca davvero, non a cronometro */
    await lab.finoA('![...document.querySelectorAll("body *")].some(e=>e.children.length===0 && /Nessuna classe attiva/.test(e.textContent))', 12000);
    await lab.pausa(600);
    await lab.val('window.scrollTo(0,0); document.querySelector("#landing-view")?.scrollTo(0,0)');
    await lab.scatta('05-crea-vuota', J);
  });
  passo('05-crea-fonte', async () => {
    await aggiungiFile('doc', [PDF_FONTE]); await lab.pausa(2500);
    await lab.finoA('document.querySelector("#mn-files") && /pronto|caricato/.test(document.querySelector("#sources-container")?.textContent||"")', 15000);
    await lab.pausa(500);
    await lab.cornice('#btn-src-doc', { etichetta: '«Documenti»' }); await lab.cornice('#mn-files', { etichetta: "l'elenco delle fonti" });
    await lab.scatta('05-crea-fonte', Object.assign({ clip: { x: 60, y: 200, width: 1350, height: 260 } }, P));
    await lab.pulito();
  });
  passo('05-crea-genere-tema', async () => {
    await lab.clicca('#root-node-name'); await lab.scrivi('Elettricità'); await lab.pausa(300);
    await lab.numeri([{ sel: '#mode-mindmap', n: 1 }, { sel: '#mode-kg', n: 2 }, { sel: '#root-node-name', n: 3 }]);
    await lab.scatta('05-crea-genere-tema', Object.assign({ clip: { x: 60, y: 370, width: 1350, height: 180 } }, P));
    await lab.pulito();
  });
  passo('05-crea-chi-cosa', async () => {
    await lab.val('(()=>{const s=document.querySelector("#mp-chi"); const o=[...s.options].find(o=>o.textContent.trim()==="4R"); if(!o) return 0; s.value=o.value; s.dispatchEvent(new Event("change",{bubbles:true})); return 1;})()');
    await lab.pausa(500);
    await lab.val('(()=>{const s=document.querySelector("#mp-disc"); const o=[...s.options].find(o=>o.textContent.trim()==="Scienze"); if(!o) return 0; s.value=o.value; s.dispatchEvent(new Event("change",{bubbles:true})); return 1;})()');
    await lab.pausa(600);
    await lab.tendinaFinta('#mp-chi', { largh: 210, allinea: 'sinistra' });
    await lab.scatta('05-crea-chi-tendina', Object.assign({ clip: { x: 90, y: 520, width: 480, height: 320 } }, P));
    await lab.pulito();
    /* ⚠️ i numeri a SINISTRA coprivano le etichette «Chi:» e «Cosa:» (misurato: il
       cerchio cade a x 125 e la parola comincia a 140): vanno a destra del menu, sul
       bordo del riquadro giallo, dove non c'è testo. */
    await lab.numeri([{ sel: '#mp-chi', n: 1, dove: 'r' }, { sel: '#mp-disc', n: 2, dove: 'r' }, { sel: '#mn-genera', n: 3, dove: 'tl' }]);
    /* la card verde mostra l'ICONA a riposo e l'etichetta solo sotto il puntatore
       (`.mn-card--genera > span { opacity: 0 }`, stile-manifesto.css:2213): senza
       hover la guida mostrerebbe un riquadro verde muto, mentre il testo parla
       della scritta «Genera materiali». Si passa il mouse davvero e si disegna il
       puntatore, così si capisce anche perché la scritta è lì. */
    const rg = await lab.rect('#mn-genera');
    const cx = Math.round(rg.x + rg.w / 2), cy = Math.round(rg.y + rg.h / 2);
    await lab.muovi(cx, cy); await lab.pausa(450);
    await lab.puntatore(cx + 90, cy + 26);
    await lab.scatta('05-crea-chi-cosa-genera', Object.assign({ clip: { x: 100, y: rg.y - 26, width: Math.round(rg.x + rg.w + 12 - 100), height: rg.h + 40 } }, P));
    await lab.pulito();
    await lab.muovi(20, 900);   /* via il puntatore: l'hover resterebbe acceso negli scatti dopo */
  });
  /* niente passo «05-crea-bento»: i riquadri a fondo scuro non esistono nella vista ridotta,
     che è la configurazione dei tester (campagna.js › vistaRidotta) — e la guida non ne parla più. */
  passo('05-crea-per-chi', async () => {
    // «Genera Mappa» (nessun materiale spuntato) → modale «Per chi è questa mappa?» — si fotografa e si annulla
    await lab.val('(()=>{document.querySelectorAll("#mn-bento input[type=checkbox]:checked").forEach(c=>{c.checked=false;c.dispatchEvent(new Event("change",{bubbles:true}));}); return 1;})()');
    await lab.pausa(600);
    const faccia = await lab.val('document.querySelector("#mn-genera")?.textContent.trim()');
    await lab.scatta('05-crea-genera-mappa', Object.assign({ sel: '#mn-genera', margine: 10 }, P));
    if (/Genera Mappa/i.test(faccia || '')) {
      await lab.clicca('#mn-genera'); await lab.pausa(1200);
      if (await visibile('#gen-class')) { await lab.scatta('05-crea-per-chi', J); const r = await lab.rect('#gen-class'); await lab.scatta('05-crea-per-chi-riquadro', Object.assign({ clip: { x: r.x - 60, y: r.y - 150, width: r.w + 120, height: r.h + 300 } }, P)); await lab.val('document.querySelector("[data-gcancel]")?.click()'); await lab.pausa(500); }
      else esito('Modale «Per chi è questa mappa?»', false, 'non comparso dopo «Genera Mappa» (forse manca la chiave e il toast ha fermato prima)');
    }
    await lab.val('(()=>{["mp-qt-mc","mp-qt-open","mp-syn-on"].forEach(id=>{const c=document.getElementById(id); if(c&&!c.checked){c.checked=true;c.dispatchEvent(new Event("change",{bubbles:true}));}}); return 1;})()');
    await lab.pausa(400);
  });

  /* ══════════════ 06 — LA MAPPA ════════════════════════════════════════ */
  passo('06-mappa-albero', async () => {
    await lab.ls('mappai_map_rel_labels', 'full');   // le parole sulle frecce intere, qualunque cosa abbia lasciato il giro prima
    await apriMappa('Elettricità');
    // la mappa si apre in ALBERO (vista a schede) e sotto la fisica non ha ancora allargato i cerchi:
    // si passa una volta alla mappa libera, la si lascia assestare, e si torna in ALBERO (un clic)
    await lab.clicca('#card-btn-layout'); await lab.pausa(900);   // ALBERO → FASCI
    await lab.clicca('#card-btn-layout'); await lab.pausa(900);   // FASCI → DAG
    await lab.clicca('#card-btn-layout'); await lab.pausa(8000);  // DAG → MAPPA, e la fisica si allarga
    await lab.val('window.resetZoom && window.resetZoom(); 1'); await lab.pausa(1500);
    await lab.clicca('#card-btn-layout'); await lab.pausa(4500);  // MAPPA → ALBERO (e il toast «Vista studio…» se ne va)
    await lab.scatta('06-mappa-albero', J);
    await lab.numeri([{ sel: '#sidebar-toggle-btn', n: 1 }, { sel: '#sidebar-tab-structure', n: 2, dove: 'b' }, { sel: '#map-control-card', n: 3, dove: 'tl' }, { sel: '#a11y-panel-toggle', n: 4 }, { sel: '#floating-actions-toggle', n: 5 }]);
    await lab.scatta('06-mappa-albero-numeri', J);
    await lab.pulito();
  });
  passo('06-mappa-barra', async () => {
    await lab.numeri([{ sel: '#map-control-card button:first-of-type', n: 1, dove: 't' }, { sel: '#card-btn-layout', n: 2, dove: 't' }, { sel: '#card-btn-labels', n: 3, dove: 't' }, { sel: '#level-slider', n: 4, dove: 't' }]);
    await lab.scatta('06-mappa-barra', Object.assign({ sel: '#map-control-card', margine: 40 }, P));
    await lab.pulito();
  });
  passo('06-mappa-layout-ciclo', async () => {
    for (const nome of ['fasci', 'dag', 'mappa']) {
      await lab.clicca('#card-btn-layout'); await lab.pausa(1800);
      // uscendo dalla vista a schede la fisica riparte dal centro: i cerchi si allargano in qualche secondo
      if (nome === 'mappa') { await lab.pausa(6000); await lab.val('window.resetZoom && window.resetZoom(); 1'); await lab.pausa(2500); await lab.val('(()=>{const s=document.querySelector("svg"); if(s) s.dispatchEvent(new MouseEvent("click",{bubbles:true})); return 1;})()'); await lab.pausa(1200); }
      await lab.scatta('06-mappa-layout-' + nome, J);
    }
  });
  passo('06-mappa-livelli-testo', async () => {
    await lab.val('(()=>{const s=document.querySelector("svg"); if(s) s.dispatchEvent(new MouseEvent("click",{bubbles:true})); return 1;})()'); await lab.pausa(600);   // via ogni evidenziazione
    await lab.val('(()=>{const s=document.querySelector("#level-slider"); s.value=1; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true})); return s.value;})()');
    await lab.pausa(2500); await lab.scatta('06-mappa-livello-1', J);
    await lab.val('(()=>{const s=document.querySelector("#level-slider"); s.value=s.max; s.dispatchEvent(new Event("input",{bubbles:true})); s.dispatchEvent(new Event("change",{bubbles:true})); return s.value;})()');
    await lab.pausa(1000);
    await lab.clicca('#card-btn-labels'); await lab.pausa(900); await lab.scatta('06-mappa-testo-no', Object.assign({ sel: '#map-control-card', margine: 30 }, P));
    await lab.clicca('#card-btn-labels'); await lab.pausa(900); await lab.clicca('#card-btn-labels'); await lab.pausa(900);
  });
  passo('06-mappa-nodo', async () => {
    const n = await lab.val('(()=>{const gs=[...document.querySelectorAll("svg g.node-group")].filter(g=>g.__data__&&g.__data__.level===1); const g=gs[0]; if(!g) return null; const r=g.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),label:g.__data__.label}})()');
    if (!n) throw new Error('nessun nodo L1 sul canvas');
    await lab.clicca(n); await lab.pausa(1800);
    await lab.scatta('06-mappa-scheda-focus', J);
    {
      const r = await lab.val('(()=>{let e=document.querySelector("#source-modal-title"); while(e&&e.getBoundingClientRect().width<innerWidth-120) e=e.parentElement; const b=e&&e.previousElementSibling?null:null; let box=document.querySelector("#source-modal-title"); let best=null; while(box){const w=box.getBoundingClientRect().width; if(w>=500&&w<innerWidth-100) best=box; box=box.parentElement;} if(!best) return null; const rr=best.getBoundingClientRect(); return {x:rr.x,y:rr.y,w:rr.width,h:rr.height};})()');
      if (r) await lab.scatta('06-mappa-scheda-focus-riquadro', Object.assign({ clip: { x: r.x - 12, y: r.y - 12, width: r.w + 24, height: r.h + 24 } }, P));
    }
    await lab.tasto('Escape'); await lab.pausa(600);
  });
  passo('06-mappa-tasto-destro', async () => {
    const n = await lab.val('(()=>{const gs=[...document.querySelectorAll("svg g.node-group")].filter(g=>g.__data__&&g.__data__.level===1); const g=gs[1]||gs[0]; if(!g) return null; const r=g.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
    await lab.tastoDestro(n); await lab.pausa(500);
    if (!(await visibile('#context-menu'))) {
      // il tasto destro via CDP non sempre produce `contextmenu`: lo si manda al nodo
      await lab.val(`(()=>{const gs=[...document.querySelectorAll("svg g.node-group")].filter(g=>g.__data__&&g.__data__.level===1); const g=gs[1]||gs[0]; g.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:${n.x},clientY:${n.y},button:2})); return 1;})()`);
      await lab.pausa(600);
    }
    if (await visibile('#context-menu')) { const r = await lab.rect('#context-menu'); await lab.scatta('06-mappa-menu-nodo', Object.assign({ clip: { x: Math.max(0, r.x - 260), y: Math.max(0, r.y - 40), width: r.w + 300, height: r.h + 80 } }, P)); }
    else esito('Menu contestuale del nodo', false, '#context-menu non visibile dopo il tasto destro');
    // «Edit Contenuto» → modale Modifica nodo
    const voce = await lab.val('(()=>{const m=document.querySelector("#context-menu"); if(!m) return null; const b=[...m.querySelectorAll("button, div, li")].find(e=>/Edit Contenuto/.test(e.textContent)&&e.children.length<3); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    if (voce) {
      await lab.clicca(voce); await lab.finoA('(()=>{const e=document.querySelector("#edit-node-modal"); return e && e.getBoundingClientRect().width>0 && getComputedStyle(e).opacity==="1";})()', 5000); await lab.pausa(500);
      if (await visibile('#edit-node-modal')) { await lab.scatta('06-mappa-modifica-nodo', J); await lab.val('(()=>{const b=[...document.querySelectorAll("#edit-node-modal button")].find(e=>/^Annulla$/.test(e.textContent.trim())); if(b) b.click(); return 1;})()'); await lab.pausa(700); }
      if (await visibile('#edit-node-modal')) { await lab.tasto('Escape'); await lab.pausa(500); }
    }
    await lab.val('document.querySelector("#context-menu")?.classList.add("hidden")');
  });
  passo('06-mappa-vista-studio', async () => {
    await lab.clicca('#sidebar-tab-vista'); await lab.pausa(900);
    await lab.scatta('06-mappa-pannello-vista', Object.assign({ clip: { x: 0, y: 0, width: 340, height: 956 } }, P));
    await lab.clicca('#sidebar-tab-structure'); await lab.pausa(400);
  });
  passo('06-mappa-a11y', async () => {
    await lab.clicca('#a11y-panel-toggle'); await lab.pausa(700);
    await lab.scatta('06-mappa-strumenti', Object.assign({ clip: { x: 1050, y: 0, width: 420, height: 520 } }, P));
    const testo = await lab.perTesto('Testo x1', '#a11y-panel', 'button'); await lab.clicca(testo); await lab.pausa(700);
    await lab.scatta('06-mappa-testo-x1-5', J);
    await lab.clicca(await lab.perTesto('Testo x1.5', '#a11y-panel', 'button')); await lab.pausa(400); await lab.clicca(await lab.perTesto('Testo x2', '#a11y-panel', 'button')); await lab.pausa(400);
    await lab.clicca('#a11y-panel-toggle'); await lab.pausa(400);
  });
  passo('06-mappa-azioni-rapide', async () => {
    await lab.finoA('(()=>{const e=document.querySelector("#floating-actions-toggle"); return e && e.getBoundingClientRect().width>0;})()', 5000);
    await lab.clicca('#floating-actions-toggle'); await lab.pausa(1500);
    if (await visibile('#floating-actions-menu')) {
      // il contenitore ha una transform: il rettangolo vero è quello dei bottoni
      const r = await lab.val('(()=>{const bs=[...document.querySelectorAll("#floating-actions-menu button, #floating-actions-menu a")].filter(b=>b.getBoundingClientRect().width>0); if(!bs.length) return null; const rs=bs.map(b=>b.getBoundingClientRect()); const x=Math.min(...rs.map(r=>r.left)), y=Math.min(...rs.map(r=>r.top)), x2=Math.max(...rs.map(r=>r.right)), y2=Math.max(...rs.map(r=>r.bottom)); return {x,y,w:x2-x,h:y2-y};})()');
      if (r) await lab.scatta('06-mappa-azioni-rapide', Object.assign({ clip: { x: Math.max(0, r.x - 30), y: Math.max(0, r.y - 30), width: r.w + 60, height: r.h + 110 } }, P));
    }
    await lab.clicca('#floating-actions-toggle'); await lab.pausa(400);
  });

  /* ══════════════ 07 — ELABORA ═════════════════════════════════════════ */
  passo('07-elabora-console', async () => {
    await landing(); await menuCosa('Elabora'); await mostraTutti();
    await lab.clicca(await lab.perTesto('Elettricità', 'body', 'button.mm-nav__v')); await lab.pausa(1800);
    await lab.scatta('07-elabora-console', J);
    await lab.numeri([{ sel: '.mn-filtro', n: 1, dove: 'r' }, { sel: 'button.mm-nav__v.is-attiva', n: 2, dove: 'r' }, { sel: '.mm-btn--primario', n: 3, dove: 'r' }, { sel: '.mm-tabg__t', n: 4, dove: 'r' }]);
    await lab.scatta('07-elabora-console-numeri', J);
    await lab.pulito();
  });
  passo('07-elabora-crea-documento', async () => {
    await lab.clicca(await lab.perTesto('Crea nuovo', 'body', 'button.mm-btn')); await lab.pausa(900);
    await scattaBox('07-elabora-crea-documento');
    await lab.clicca(await lab.perTesto('Quiz, Domande aperte e Flashcard', 'body', 'button, li, div[role=button]')); await lab.pausa(900);
    await scattaBox('07-elabora-tipo-quiz');
    await lab.clicca(await lab.perTesto('Domande aperte', 'body', 'button, li, div[role=button]')); await lab.pausa(900);
    await scattaBox('07-elabora-tu-o-ai');
    await lab.clicca(await lab.perTesto("Le genera l'AI", 'body', 'button, li, div[role=button]')); await lab.pausa(900);
    if (await lab.val('!![...document.querySelectorAll(".mm-box")].find(b=>/Da che cosa/.test(b.textContent))')) { await scattaBox('07-elabora-da-che-cosa'); await lab.clicca(await lab.perTesto('Dalla mappa', 'body', 'button, li, div[role=button]')); await lab.pausa(900); }
    await scattaBox('07-elabora-genera-ai', 12);
    await lab.tasto('Escape'); await lab.pausa(500); await lab.tasto('Escape'); await lab.pausa(400);
  });
  passo('07-elabora-anteprima-editor', async () => {
    // apri il gruppo «Quiz» → prima riga → anteprima → «Modifica» → editor
    const quiz = await lab.perTesto('Quiz', 'body', 'button.mm-tabg__t');
    const chiuso = await lab.val(`(()=>{const b=document.querySelector(${JSON.stringify(quiz)}); return b && b.getAttribute('aria-expanded')==='false';})()`);
    if (chiuso) { await lab.clicca(quiz); await lab.pausa(600); }
    await lab.val('document.querySelectorAll("[data-lab]").forEach(e=>e.removeAttribute("data-lab"))');
    const riga = await lab.perTesto('Scelta Multipla', 'body', 'tr.mm-tab__riga');
    await lab.clicca(riga); await lab.pausa(2500);
    await lab.scatta('07-elabora-anteprima', J);
    const mod = await lab.val('(()=>{const b=[...document.querySelectorAll(".de-bar button")].find(e=>/Modifica/.test(e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    if (mod) { await lab.clicca(mod); await lab.pausa(2000); await lab.scatta('07-elabora-editor-quiz', J); await lab.scatta('07-elabora-editor-barra', Object.assign({ sel: '.de-bar', margine: 10 }, P)); }
    else esito('Anteprima → «Modifica» (editor del quiz)', false, 'bottone «Modifica» non trovato nella barra');
    await lab.tasto('Escape'); await lab.pausa(900); await lab.tasto('Escape'); await lab.pausa(900);
  });
  passo('07-elabora-sintesi-editor', async () => {
    const sin = await lab.perTesto('Sintesi', 'body', 'button.mm-tabg__t');
    if (await lab.val(`(()=>{const b=document.querySelector(${JSON.stringify(sin)}); return b && b.getAttribute('aria-expanded')==='false';})()`)) { await lab.clicca(sin); await lab.pausa(600); }
    await lab.val('document.querySelectorAll("[data-lab]").forEach(e=>e.removeAttribute("data-lab"))');
    const riga = await lab.val('(()=>{const r=[...document.querySelectorAll("tr.mm-tab__riga")].find(t=>/^Sintesi/.test(t.textContent.trim())); if(!r) return null; const b=r.getBoundingClientRect(); return {x:Math.round(b.x+60),y:Math.round(b.y+b.height/2)};})()');
    if (!riga) throw new Error('riga Sintesi non trovata');
    await lab.clicca(riga); await lab.pausa(3000);
    await lab.scatta('07-elabora-sintesi-anteprima', J);
    const modS = await lab.val('(()=>{const b=[...document.querySelectorAll(".de-bar button")].find(e=>/Modifica/.test(e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    if (modS) { await lab.clicca(modS); await lab.pausa(2500); }
    await lab.scatta('07-elabora-sintesi-editor', J);
    const voce = await lab.val('(()=>{const b=[...document.querySelectorAll(".de-bar button")].find(e=>/Voce/.test(e.textContent)); return !!b;})()');
    esito('Editor della sintesi con bottone «Voce»', voce, voce ? 'barra .de-bar con Voce' : 'bottone «Voce» assente');
    await lab.scatta('07-elabora-sintesi-barra', Object.assign({ sel: '.de-bar', margine: 10 }, P));
    await lab.tasto('Escape'); await lab.pausa(900); await lab.tasto('Escape'); await lab.pausa(600);
  });
  passo('07-elabora-copia', async () => {
    const cp = await lab.val('(()=>{const b=[...document.querySelectorAll("button.mm-btn--quieto")].find(e=>/Fai una copia/.test(e.title||e.getAttribute("aria-label")||"")); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    if (!cp) throw new Error('icona «Fai una copia» non trovata');
    await lab.clicca(cp); await lab.pausa(900);
    await scattaBox('07-elabora-fai-una-copia');
    await lab.tasto('Escape'); await lab.pausa(500);
  });

  /* ══════════════ 08 — INSEGNA ═════════════════════════════════════════ */
  passo('08-insegna-console', async () => {
    await landing(); await menuCosa('Insegna'); await mostraTutti();
    await lab.pausa(800);
    await lab.scatta('08-insegna-console', J);
    await lab.clicca(await lab.perTesto('Elettricità', 'body', 'button.mm-nav__v')); await lab.pausa(1500);
    await lab.scatta('08-insegna-mappa-scelta', J);
    await lab.numeri([{ sel: '.mn-filtro', n: 1, dove: 'r' }, { sel: await lab.perTesto('Mappa', 'body', 'button.mn-cmd'), n: 2 }, { sel: await lab.perTesto('Elabora', 'body', 'button.mn-cmd'), n: 3 }, { sel: await lab.perTesto('QR', 'body', 'button.mn-cmd'), n: 4 }, { sel: await lab.perTesto('Cartella', 'body', 'button.mn-cmd'), n: 5 }, { sel: '.mm-tabg__t', n: 6, dove: 'r' }]);
    await lab.scatta('08-insegna-mappa-scelta-numeri', J);
    await lab.pulito();
  });
  passo('08-insegna-tabella-quiz', async () => {
    await lab.clicca(await lab.perTesto('Quiz', 'body', 'button.mm-tabg__t')); await lab.pausa(800);
    await lab.scatta('08-insegna-tabella-quiz', J);
    const r = await lab.val('(()=>{const t=[...document.querySelectorAll("tr.mm-tab__riga")].find(t=>t.getBoundingClientRect().width>0); if(!t) return null; const r=t.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})()');
    if (r) { await lab.scatta('08-insegna-riga-comandi', Object.assign({ clip: { x: r.x + r.w - 300, y: r.y - 40, width: 310, height: r.h + 52 } }, P)); }
  });
  passo('08-insegna-materiale-aperto', async () => {
    // un PDF dentro l'iframe si fotografa nero (il visore PDF non entra nella cattura): meglio una riga .html se c'è
    const riga = await lab.val('(()=>{const v=[...document.querySelectorAll("tr.mm-tab__riga")].filter(t=>t.getBoundingClientRect().width>0); const t=v.find(t=>/\\.html?$/i.test(t.getAttribute("data-azione")||""))||v[0]; if(!t) return null; const r=t.getBoundingClientRect(); return {x:Math.round(r.x+120),y:Math.round(r.y+r.height/2)};})()');
    if (!riga) throw new Error('nessuna riga visibile nelle tabelle');
    await lab.clicca(riga); await lab.pausa(5000);
    esito('INSEGNA: clic sulla riga apre il materiale nella tela', !!(await lab.val('!!document.querySelector(".mm-console__area iframe")')), '');
    await lab.scatta('08-insegna-materiale-aperto', J);
    const ind = await lab.val('(()=>{const b=[...document.querySelectorAll("button")].find(e=>/^Indietro$/.test(e.textContent.trim())&&e.getBoundingClientRect().width>0); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    if (ind) { await lab.clicca(ind); await lab.pausa(900); } else { await lab.tasto('Escape'); await lab.pausa(900); }
  });
  passo('08-insegna-qr', async () => {
    await lab.clicca(await lab.perTesto('QR', 'body', 'button.mn-cmd')); await lab.pausa(1200);
    if (await lab.val('!![...document.querySelectorAll(".mm-box")].find(b=>/Condividi un materiale via QR/.test(b.textContent))')) { await scattaBox('08-insegna-condividi-qr'); await lab.tasto('Escape'); await lab.pausa(500); }
    else { await lab.scatta('08-insegna-qr-esito', J); esito('«QR» dalla riga dei comandi', false, 'modale «Condividi un materiale via QR» non comparso'); await lab.tasto('Escape'); await lab.pausa(500); }
  });
  passo('08-insegna-stampabili', async () => {
    await lab.clicca(await lab.perTesto('Stampabili', 'body', 'button.mm-nav__v')); await lab.pausa(1200);
    const fogli = await lab.perTesto('Fogli dei nodi', 'body', 'button.mm-tabg__t'); await lab.clicca(fogli); await lab.pausa(700);
    await lab.scatta('08-insegna-stampabili', J);
  });

  /* ══════════════ 09 — LA FOTO: dossier già fatto, INSEGNA › Proietta ══ */
  passo('09-dossier-insegna-proietta', async () => {
    await landing(); await menuCosa('Insegna');
    await lab.val('(()=>{const b=[...document.querySelectorAll(".mn-filtri__tutte")].find(e=>e.getBoundingClientRect().width>0); if(b) b.click(); return 1;})()'); await lab.pausa(800);
    await lab.clicca(await lab.perTesto('grind this heels', 'body', 'button.mm-nav__v')); await lab.pausa(1500);
    await lab.scatta('09-dossier-insegna', J);
    const pro = await lab.val('(()=>{const b=[...document.querySelectorAll("button.mn-cmd")].find(e=>/Proietta/.test(e.title||e.getAttribute("aria-label")||e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    esito('«Proietta» compare sul dossier in INSEGNA', !!pro, pro ? 'cinque comandi' : 'manca (index.yaml dossier?)');
    if (!pro) return;
    await lab.clicca(pro); await lab.pausa(2000);
    const ok = await visibile('#pj-overlay');
    esito('Proietta: overlay con la foto', ok, ok ? '' : '#pj-overlay assente');
    if (!ok) return;
    await lab.scatta('09-proietta', J);
    await lab.clicca('[data-pj="split"]'); await lab.pausa(900);
    await lab.scatta('09-proietta-affianca', J);
    const hasFc = await lab.val('(()=>{const s=document.querySelector("select[data-pj=\\"sel-fc\\"]"); return s && s.options.length>1;})()');
    if (hasFc) { await lab.val('(()=>{const s=document.querySelector("select[data-pj=\\"sel-fc\\"]"); s.selectedIndex=1; s.dispatchEvent(new Event("change",{bubbles:true})); return 1;})()'); await lab.pausa(900); await lab.scatta('09-proietta-flashcard', J); }
    esito('Proietta: mazzo di flashcard affiancato', !!hasFc, hasFc ? '' : 'tendina «Flashcard…» vuota');
    await lab.tasto('Escape'); await lab.pausa(700);
    const ancora = await visibile('#pj-overlay');
    esito('Proietta: ESC chiude la proiezione', !ancora, ancora ? 'ESC (via CDP) non ha chiuso: chiuso col ×' : '');
    if (ancora) { await lab.clicca('[data-pj="chiudi"]'); await lab.pausa(700); }
  });
  passo('09-dossier-elabora', async () => {
    await menuCosa('Elabora');
    await lab.val('(()=>{const b=[...document.querySelectorAll(".mn-filtri__tutte")].find(e=>e.getBoundingClientRect().width>0); if(b) b.click(); return 1;})()'); await lab.pausa(800);
    await lab.clicca(await lab.perTesto('grind this heels', 'body', 'button.mm-nav__v')); await lab.pausa(2000);
    await lab.scatta('09-dossier-elabora', J);
    const foto = await visibile('.ec-foto-fonte');
    esito('ELABORA: anteprima della foto del dossier', foto, foto ? '' : '.ec-foto-fonte assente');
  });

  /* ══════════════ 10 — CABINA ══════════════════════════════════════════ */
  passo('10-cabina-profilo', async () => {
    await landing(); await cabinaVoce('Profilo insegnante');
    await lab.scatta('10-cabina-profilo', J);
    await lab.val('(()=>{const s=[...document.querySelectorAll(".mm-console__area h2, .mm-console__area h3, .mm-console__area [class*=sez__t]")].find(e=>/Gestione cartelle/.test(e.textContent)); if(s) s.scrollIntoView({block:"start"}); return !!s;})()'); await lab.pausa(700);
    await lab.scatta('10-cabina-gestione-cartelle', J);
  });
  passo('10-cabina-classi', async () => {
    await cabinaVoce('Classi'); await lab.scatta('10-cabina-classi', J);
    await lab.clicca(await lab.perTesto('Crea profilo', 'body', 'button')); await lab.pausa(1200);
    if (await visibile('#class-accounts-modal')) { await lab.scatta('10-cabina-nuova-classe', J); await lab.scatta('10-cabina-nuova-classe-riquadro', Object.assign({ sel: '#class-accounts-modal > div', margine: 10 }, P)); await lab.val('(()=>{const b=[...document.querySelectorAll("#class-accounts-modal button")].find(e=>/^Annulla$/.test(e.textContent.trim())); if(b) b.click(); return 1;})()'); await lab.pausa(600); await lab.tasto('Escape'); await lab.pausa(500); }
    else esito('Cabina › Classi › «Crea profilo»', false, 'finestra #class-accounts-modal non visibile');
    // profilo della 4R
    await cabinaVoce('Classi');
    const ges = await lab.val('(()=>{const b=[...document.querySelectorAll(".mm-console__area button")].find(e=>/Gestisci/.test(e.title||e.getAttribute("aria-label")||e.textContent)); if(!b) return null; const r=b.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    if (ges) { await lab.clicca(ges); await lab.pausa(1200); await lab.scatta('10-cabina-profilo-classe-4R', J); await lab.tasto('Escape'); await lab.pausa(600); }
  });
  passo('10-cabina-aspetto', async () => {
    await cabinaVoce('Aspetto e leggibilità'); await lab.scatta('10-cabina-aspetto', J);
  });
  passo('10-cabina-ai', async () => {
    await cabinaVoce('Impostazioni AI'); await lab.pausa(800);
    await lab.val('(()=>{const i=document.querySelector("#gemini-api-key-input"); if(i) i.type="password"; return 1;})()');
    await lab.scatta('10-cabina-impostazioni-ai', J);
  });
  passo('10-cabina-consumi', async () => { await cabinaVoce('Consumi AI'); await lab.pausa(1200); await lab.scatta('10-cabina-consumi', J); });
  passo('10-cabina-privacy', async () => { await cabinaVoce('Privacy'); await lab.scatta('10-cabina-privacy', J); });
  passo('10-cabina-segnalazione', async () => {
    await cabinaVoce('Segnalazione'); await lab.pausa(1000); await lab.scatta('10-cabina-segnalazione', J);
    await cabinaChiudi();
  });

  /* ══════════════ 13 — APPENDICE: Domande a scelta via QR ══════════════ */
  passo('13-qr-hub-live', async () => {
    await apriMappa('Elettricità');
    // una sessione rimasta viva da un giro precedente: si ferma, o il hub salterebbe dritto alla dashboard
    await lab.val('window.confirm = () => true; 1');
    if (await lab.val('!!(window.MappAILive && window.electronAPI && window.electronAPI.liveSessionInfo)')) {
      const viva = await lab.val('window.electronAPI.liveSessionInfo().then(i=>!!(i&&(i.active||i.port)))').catch(() => false);
      if (viva) { await lab.val('window.electronAPI.liveStopSession && window.electronAPI.liveStopSession()').catch(() => 0); await lab.pausa(1200); }
    }
    const live = await lab.val('(()=>{const b=[...document.querySelectorAll("#floating-actions-menu button, #floating-actions-menu a")].find(e=>/MappAI Live/.test(e.textContent)); return !!b;})()');
    await lab.clicca('#floating-actions-toggle'); await lab.pausa(600);
    await lab.clicca(await lab.perTesto('MappAI Live', '#floating-actions-menu', 'button, a')); await lab.pausa(1500);
    if (await visibile('#live-hub-modal')) { await lab.scatta('13-qr-hub-live', J); }
    else { esito('Hub «MappAI Live»', false, '#live-hub-modal non visibile'); return; }
    const card = await lab.val('(()=>{const c=[...document.querySelectorAll("#live-hub-modal .lh-card")].find(e=>/Domande a scelta/.test(e.textContent)); if(!c) return null; const r=c.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
    esito('Card «Domande a scelta» nel hub Live', !!card, card ? '' : 'assente (kill-switch?)');
    if (!card) return;
    await lab.clicca(card); await lab.pausa(1500);
    const setup = await lab.val('!![...document.querySelectorAll(".mm-box")].find(b=>/Domande a scelta/.test(b.textContent)&&/Avvia con QR/.test(b.textContent))');
    esito('Setup «Domande a scelta» (Avvia con QR)', setup, setup ? '' : 'il modale di setup non è comparso (classe attiva? materiali?)');
    if (setup) { await scattaBox('13-qr-setup'); }
    else await lab.scatta('13-qr-setup-esito', J);
  });
  passo('13-qr-sessione', async () => {
    const { execSync } = require('child_process');
    const fs = require('fs');
    if (!(await lab.val('!![...document.querySelectorAll(".mm-box")].find(b=>/Avvia con QR/.test(b.textContent))'))) throw new Error('il setup «Domande a scelta» non è aperto');
    // i confirm() nativi bloccano il renderer: si rispondono da soli
    await lab.val('window.confirm = () => true; 1');
    await lab.clicca(await lab.perTesto('Avvia con QR', 'body', 'button')); await lab.pausa(3500);
    const url = await lab.val('(()=>{const m=document.querySelector("#live-hub-modal"); if(!m) return null; const t=m.textContent.match(/https?:\\/\\/[0-9.]+:\\d+/); return t?t[0]:null;})()');
    esito('Domande a scelta: «Avvia con QR» apre la sessione live', !!url, url ? 'URL ' + url : 'nessun URL LAN nel pannello');
    if (!url) { await lab.scatta('13-qr-sessione-esito', J); return; }
    fs.writeFileSync(path.join(LAB, 'sessione.json'), JSON.stringify({ url, quando: new Date().toISOString() }, null, 2));
    await lab.scatta('13-qr-dashboard-attesa', J);
    await lab.scatta('13-qr-dashboard-riquadro', Object.assign({ sel: '#live-hub-modal > div', margine: 12 }, P));
    // il telefono: un Chrome headless guidato da telefono.js
    const { spawn } = require('child_process');
    for (const f of ['tel-entrato', 'tel-vai', 'tel-fine']) fs.rmSync(path.join(LAB, f), { force: true });
    const tel = spawn('node', [path.join(__dirname, 'telefono.js'), 'corsa'], { stdio: ['ignore', fs.openSync(path.join(LAB, 'telefono.log'), 'w'), fs.openSync(path.join(LAB, 'telefono.log'), 'a')] });
    const aspetta = async (f, s) => { for (let i = 0; i < s * 2; i++) { if (fs.existsSync(path.join(LAB, f))) return true; await lab.pausa(500); } return false; };
    if (!(await aspetta('tel-entrato', 90))) { console.log(fs.readFileSync(path.join(LAB, 'telefono.log'), 'utf8')); throw new Error('il telefono non è entrato in 90 s'); }
    await lab.pausa(3500);       // la dashboard si aggiorna ogni 3 s
    const entrati = await lab.val('(document.querySelector("#lv-count")||{}).textContent||""');
    esito('Allievo entrato dal telefono (emoji + numero)', /^[1-9]/.test(entrati.trim()), 'contatore «' + entrati.trim() + '»');
    await lab.scatta('13-qr-dashboard-entrato', J);
    // una sessione RIPRESA dal giro precedente può essere già «in corso»: allora «Avvia domande» non c'è
    if (await visibile('#lv-run')) { await lab.clicca('#lv-run'); await lab.pausa(1500); }
    else esito('Dashboard: «Avvia domande»', /in corso/.test(await lab.val('(document.querySelector("#lv-phase")||{}).textContent||""')), 'sessione ripresa già in corso: bottone assente per costruzione');
    await lab.scatta('13-qr-dashboard-in-corso', J);
    fs.writeFileSync(path.join(LAB, 'tel-vai'), '1');
    if (!(await aspetta('tel-fine', 240))) { try { tel.kill(); } catch (e) { /* */ } }
    console.log(fs.readFileSync(path.join(LAB, 'telefono.log'), 'utf8'));
    await lab.pausa(3500);
    const consegnato = await lab.val('/consegnato/i.test((document.querySelector("#lv-rosterlist")||{}).textContent||"")');
    esito('Consegna vista in dashboard («✓ consegnato»)', consegnato, '');
    await lab.scatta('13-qr-dashboard-consegnato', J);
    // chiudi la sessione → report
    await lab.clicca('#lv-close'); await lab.pausa(3500);
    const rep = await lab.val('!!document.querySelector("#lv-rep-x0")');
    esito('«Chiudi sessione» genera il report', rep, rep ? 'bottone «Report domande a scelta» presente' : '');
    await lab.scatta('13-qr-dashboard-chiusa', J);
    await lab.scatta('13-qr-dashboard-chiusa-riquadro', Object.assign({ sel: '#live-hub-modal > div', margine: 12 }, P));
    const cartelle = fs.existsSync(path.join(CASA, 'Attività di studio')) ? fs.readdirSync(path.join(CASA, 'Attività di studio', '4R')).filter((n) => /scelta/i.test(n)) : [];
    esito('Cartella della sessione in «Attività di studio/4R/»', cartelle.length > 0, cartelle.join(' · '));
    const dirSess = cartelle.length ? path.join(CASA, 'Attività di studio', '4R', cartelle[cartelle.length - 1]) : null;
    if (dirSess) { const f = fs.readdirSync(dirSess); esito('Nella cartella: session.json, results.json, report-scelta.html', f.includes('report-scelta.html'), f.join(' · ')); fs.writeFileSync(path.join(LAB, 'sessione.json'), JSON.stringify({ url, dir: dirSess, file: f }, null, 2)); }
    // ferma il server e chiudi il pannello
    const stop = await lab.val('(()=>{const b=document.querySelector("#lv-stop")||document.querySelector("#lv-end"); if(b){b.click(); return b.id;} return null;})()');
    await lab.pausa(1200);
    await lab.val('(()=>{const b=document.querySelector("#lv-end"); if(b) b.click(); return 1;})()'); await lab.pausa(800);
  });
  passo('13-qr-report', async () => {
    const fs = require('fs'); const { execSync } = require('child_process');
    const info = JSON.parse(fs.readFileSync(path.join(LAB, 'sessione.json'), 'utf8'));
    if (!info.dir || !fs.existsSync(path.join(info.dir, 'report-scelta.html'))) throw new Error('nessun report-scelta.html da fotografare');
    console.log(execSync('node ' + JSON.stringify(path.join(__dirname, 'telefono.js')) + ' report', { encoding: 'utf8', timeout: 60000 }));
  });
};
