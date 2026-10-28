/*
 * mappai-scelta-view.js — la superficie delle attività «a scelta»
 * ---------------------------------------------------------------------------
 * Una SOLA superficie per tre posti: la pagina servita al telefono (Live), il
 * modale dell'app (Studio attivo) e il banco. Non è un risparmio di righe: è
 * che due copie della stessa schermata divergono al primo ritocco (inv. 6), e
 * qui la schermata È l'attività — l'elenco da cui si sceglie, il campo dove si
 * scrive, il contatore, la consegna.
 *
 * Non fa richieste di rete e non conosce il disco: il TRASPORTO si inietta
 * (`onCambia`, `onConsegna`). In Live quelle due funzioni chiamano il server,
 * in-app scrivono una bozza in `localStorage`.
 *
* Non mostra MAI l'angolo di una domanda: è il punto dell'attività. Al telefono
 * l'angolo non arriva nemmeno (`MappAIScelta.pubblico`); in-app c'è nel pool ma
 * questa view non lo legge, e dopo la consegna lo dice `mostraEsito`.
 * ⚠️ Salvo `mostraAngolo` (6/9): è l'esercizio INVERSO di MappAI studente — si
 * legge la stessa domanda in tutti i tagli per trovare la propria porta. Con
 * esso arrivano `chip` (vocabolario e colori), `raggruppa`, `chipPrende` e `senzaAree`:
 * opzioni di `monta()`, mai di `cfg` (che fa il giro del server e viene
 * coerce a booleano da `normalizzaCfg`). Tutte spente per default.
 *
 * Il CSS se lo porta dietro (iniettato una volta): la pagina dello studente non
 * carica `style.css`, e una veste scritta due volte è la stessa divergenza.
 */
(function () {
    'use strict';
    if (typeof window === 'undefined') return;
    if (window.MappAISceltaView) return;      /* due caricamenti = due ascolti (trappola 22) */

    var S = function () { return window.MappAIScelta; };
    function _t(fn, k, f) { try { return fn ? (fn(k, f) || f) : f; } catch (e) { return f; } }
    function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

    /* ── LA VESTE ────────────────────────────────────────────────────────────
       Gli stessi colori della pagina Live (`student.html`): fondo #fafbff, testo
       #0f172a, indigo #4f46e5 per ciò che si tocca. Contrasti sopra 4,5:1 e
       bersagli da 44px — si lavora col pollice (inv. 16). */
    var CSS = [
        /* ⚠️ `box-sizing` se lo dichiara la view: la pagina che la ospita può non
           avere nessuna regola globale, e un campo `width:100%` col suo
           imbottitura sborda di 14px — misurato a 390px, cioè su un telefono. */
        '.sc-wrap,.sc-wrap *{box-sizing:border-box}',
        '.sc-wrap{display:flex;flex-direction:column;height:100%;min-height:0;background:#fafbff;color:var(--mm-testo, #404040)}',
        '.sc-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px max(16px,env(safe-area-inset-left));background:#fff;border-bottom:1px solid var(--mm-bordo, #cbd5e1)}',
        /* 0126: col `contatore` fuori la riga vuota si nasconde, e `display:flex` qui sopra vincerebbe sul [hidden] del browser */
        '.sc-top[hidden]{display:none}',
        '.sc-cnt{font-size:13px;font-weight:700;color:var(--mm-testo, #404040)}',
        '.sc-cnt b{color:#4f46e5}',
        '.sc-cnt.ko b{color:#b45309}',
        '.sc-hint{font-size:12px;color:#475569;flex:1;min-width:140px}',
        '.sc-list{flex:1;overflow-y:auto;padding:16px max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}',
        '.sc-ramo{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:18px 0 8px}',
        '.sc-ramo:first-child{margin-top:0}',
        '.sc-q{background:#fff;border:2px solid var(--mm-bordo, #cbd5e1);border-radius:14px;margin-bottom:10px;overflow:hidden}',
        '.sc-q.on{border-color:#4f46e5}',
        '.sc-take{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;background:none;border:0;padding:14px 16px;min-height:56px;font:inherit;color:inherit;cursor:pointer}',
        '.sc-take:focus-visible{outline:3px solid #6366f1;outline-offset:-3px}',
        '.sc-mark{flex:0 0 auto;width:26px;height:26px;border-radius:8px;border:2px solid #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;background:#fff}',
        '.sc-q.on .sc-mark{background:#4f46e5;border-color:#4f46e5}',
        '.sc-txt{flex:1;font-size:16px;line-height:1.45}',
        /* il taglio sulla card: SOLO con `mostraAngolo` (l'esercizio inverso, 6/9) */
        '.sc-ang{display:block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;margin-bottom:3px}',
        /* l'intestazione di una riga «Domanda i» quando si raggruppa per posizione */
        '.sc-riga{font-size:12px;font-weight:700;color:var(--mm-testo, #404040);margin:12px 0 6px}',
        '.sc-body{padding:0 16px 16px;border-top:1px solid #eef2ff}',
        '.sc-lbl{font-size:12px;font-weight:700;color:#475569;margin:14px 0 6px}',
        '.sc-ta{width:100%;min-height:110px;padding:12px 14px;border-radius:12px;border:2px solid var(--mm-bordo, #cbd5e1);background:#fff;color:var(--mm-testo, #404040);font-size:16px;line-height:1.5;resize:vertical}',
        '.sc-ta:focus{border-color:#6366f1;outline:none}',
        /* 0116: la casella delle domande aperte semplici ha le misure di quella del quiz LIVE (#qopen di student.html) */
        '.sc-ta--live{min-height:130px;padding:14px 16px;font-size:19px}',
        /* 0116: la schermata finale delle aperte semplici = #done di student.html */
        '.sc-fine{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:26px;text-align:center}',
        '.sc-fine__big{font-size:64px}',
        '.sc-fine h2{font-size:22px;font-weight:700;margin:0}',
        '.sc-fine p{color:#64748b;font-size:14px;max-width:340px;margin:0}',
        '.sc-fine__top{display:flex;align-items:stretch;justify-content:center;gap:10px}',
        '.sc-fine__recap{background:#fff;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:14px;padding:16px 22px;font-size:15px}',
        '.sc-fine__salva{width:54px;border-radius:12px;font-size:24px;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center}',
        '.sc-opt{display:block;width:100%;text-align:left;padding:13px 15px;margin-bottom:8px;min-height:48px;border-radius:12px;border:2px solid var(--mm-bordo, #cbd5e1);background:#fff;font-size:16px;color:var(--mm-testo, #404040)}',
        '.sc-opt[aria-checked="true"]{border-color:#4f46e5;background:#eef2ff;font-weight:700}',
        /* 0126: i criteri da leggere (`criteri: 'leggi'`): un elenco, non bottoni — non si toccano */
        '.sc-crit{margin:0 0 8px;padding-left:22px;list-style:disc;font-size:16px;line-height:1.5;color:var(--mm-testo, #404040)}',
        /* il pallino e lo spazio dicono dove finisce un criterio che va a capo (l'app azzera gli elenchi) */
        '.sc-crit li{margin-bottom:8px}',
        /* gate del 25/10 (Giacomo): in modalità semplice i criteri hanno il corpo della casella (.sc-ta--live) */
        '.sc-crit--live{font-size:19px}',
        '.sc-chips{display:flex;flex-wrap:wrap;gap:8px}',
        '.sc-chip{min-height:44px;padding:10px 14px;border-radius:999px;border:2px solid var(--mm-bordo, #cbd5e1);background:#fff;font-size:13px;font-weight:700;color:var(--mm-testo, #404040)}',
        '.sc-chip[aria-pressed="true"]{border-color:#4f46e5;background:#eef2ff;color:#4f46e5}',
        '.sc-nota{width:100%;padding:10px 12px;border-radius:10px;border:2px solid var(--mm-bordo, #cbd5e1);background:#fff;font-size:14px;color:var(--mm-testo, #404040)}',
        '.sc-nota:focus{border-color:#6366f1;outline:none}',
        '.sc-foot{padding:12px max(16px,env(safe-area-inset-left)) max(14px,env(safe-area-inset-bottom));background:#fff;border-top:1px solid var(--mm-bordo, #cbd5e1);display:flex;flex-direction:column;gap:10px}',
        /* Le osservazioni stanno in fondo e si scrivono ALLA FINE: da aperte
           costavano 74px di schermo mentre si sta ancora scegliendo (misurato:
           il piè si prendeva il 30% di un telefono). Nascono su una riga e
           crescono con quello che si scrive. */
        '.sc-oss{width:100%;min-height:44px;max-height:180px;padding:11px 13px;border-radius:12px;border:2px solid var(--mm-bordo, #cbd5e1);background:#fff;font-size:15px;line-height:1.5;resize:vertical;field-sizing:content}',
        '.sc-oss:focus{border-color:#6366f1;outline:none}',
        '.sc-go{width:100%;min-height:52px;border-radius:12px;background:#4f46e5;color:#fff;font-size:17px;font-weight:700}',
        '.sc-go[disabled]{opacity:.55}',
        /* l'esito immediato (una riga sotto la domanda, mai un modale) lo disegna
           mappai-quiz-mc-view.js: qui si risponde una domanda alla volta e il modale la coprirebbe */
        '.sc-esito{flex:1;overflow-y:auto;padding:24px max(20px,env(safe-area-inset-left))}',
        '.sc-esito h2{font-size:20px;font-weight:700;margin-bottom:6px}',
        '.sc-esito p{color:#475569;font-size:14px;line-height:1.6;margin-bottom:14px}',
        '.sc-riga{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
        '.sc-riga .n{font-size:13px;font-weight:700;color:var(--mm-testo, #404040);flex:0 0 132px}',
        '.sc-barra{flex:1;height:12px;border-radius:999px;background:#f1f5f9;overflow:hidden}',
        '.sc-barra i{display:block;height:100%;background:#4f46e5}',
        '.sc-riga .v{font-size:13px;font-weight:700;color:#4f46e5;flex:0 0 34px;text-align:right}',
        '.sc-riga.zero .v{color:#b45309}',
        '.sc-vuoto{color:#64748b;font-size:15px;text-align:center;padding:40px 10px;line-height:1.6}',
        /* ── i pezzi del percorso a tre passi ──────────────────────────────── */
        /* la seconda riga di una card-area: «7 domande», il numero che rende la
           scelta informata invece che a occhio */
        '.sc-sub{display:block;font-size:12px;font-weight:700;color:#64748b;margin-top:4px}',
        /* una domanda già GIUDICATA ma non presa: il pallino dice «l'ho letta»,
           che è metà dell'esercizio e non deve sembrare uguale a «non l'ho
           nemmeno aperta» */
        '.sc-q.letta{border-color:#c7d2fe}',
        '.sc-q.letta .sc-mark{border-color:#4f46e5;color:#4f46e5;background:#eef2ff}',
        '.sc-cmd{min-height:44px;padding:0 10px;border-radius:10px;background:none;border:0;font-size:13px;font-weight:700;color:#4f46e5}',
        '.sc-cmd:focus-visible{outline:3px solid #6366f1;outline-offset:-3px}',
        '.sc-prendi{width:100%;min-height:48px;margin-top:14px;border-radius:12px;border:2px solid #4f46e5;background:#fff;color:#4f46e5;font-size:15px;font-weight:700}',
        '.sc-prendi.on{background:#4f46e5;color:#fff}',
        /* passo ③: la domanda in grande, come nel player Live */
        '.sc-dom{font-size:21px;font-weight:700;line-height:1.45;margin-bottom:18px}',
        '.sc-eco{margin-top:14px;font-size:13px;color:#475569}',
        '.sc-nav{display:flex;align-items:center;gap:12px}',
        '.sc-nav__b{flex:0 0 auto;width:64px;min-height:48px;border-radius:12px;border:2px solid var(--mm-bordo, #cbd5e1);background:#fff;font-size:22px;font-weight:700;color:#4f46e5}',
        '.sc-nav__b[disabled]{opacity:.4;color:var(--mm-testo-3, #64748b)}',
        '.sc-nav__n{flex:1;text-align:center;font-size:14px;font-weight:700;color:var(--mm-testo, #404040)}',
        '.sc-go--quieto{background:#fff;color:#4f46e5;border:2px solid var(--mm-bordo, #cbd5e1)}',
        /* 0126, allargamento 4: la scelta su misura dell'iPad, solo con le opzioni (`aPagine`,
           `chipVelo`, `leggiDomande`) — domande e chip a 19 px, il ramo a 25 */
        '.sc--pagine .sc-txt{font-size:19px;line-height:1.45}',
        '.sc-ramo--titolo{font-size:25px;font-weight:700;line-height:1.25;color:var(--mm-testo, #404040);margin:4px 0 14px}',
        '.sc-ramo-testa{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:4px 0 14px}',
        '.sc-ramo-testa .sc-ramo--titolo{margin:0}',
        '.sc-ramo-n{flex:none;font-size:16px;font-weight:700;color:var(--mm-testo-3, #64748b)}',
        '.sc-q--voce{display:grid;grid-template-columns:1fr auto;align-items:start}',
        '.sc-q--voce .sc-body{grid-column:1/-1}',
        /* il 🔊 ha la cornice del quiz (`.qmc .tts` di mappai-quiz-mc-view.js); qui solo dove sta */
        '.sc-q--voce > .sc-tts{margin:6px 8px 6px 0}',
        /* `leggiRisposta`: l'elemento e il suo 🔊 sulla stessa riga, come la domanda del quiz (`.q-head`) */
        '.sc-voce-riga{display:flex;align-items:flex-start;gap:10px}',
        '.sc-voce-riga > :first-child{flex:1;min-width:0}',
        /* la casella non sta più in una riga di testo, che le dava lo spazio sotto: «Confermo» lo dichiara */
        '.sc-voce-riga + .sc-go{margin-top:12px}',
        /* i criteri da spuntare come le opzioni del quiz (`.opt-row`): il 🔊 alto quanto il riquadro */
        '.sc-voce-riga--opt{align-items:stretch;gap:8px;margin-bottom:8px}',
        '.sc-voce-riga--opt > .sc-opt{margin-bottom:0}',
        '.sc-giudizio{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center}',
        '.sc-giudizio__fondo{position:absolute;inset:0;background:rgba(15,23,42,.45)}',
        '.sc-giudizio__box{position:relative;display:flex;flex-direction:column;gap:14px;width:min(560px,88vw);padding:24px;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.3)}',
        '.sc-giudizio__q{font-size:19px;line-height:1.45;font-weight:700;color:var(--mm-testo, #404040);margin-bottom:6px}',
        '.sc-giudizio .sc-chip{width:100%;min-height:60px;font-size:19px}'
    ].join('\n');

    function css() {
        if (document.getElementById('sc-css')) return;
        var s = document.createElement('style');
        s.id = 'sc-css'; s.textContent = CSS;
        document.head.appendChild(s);
    }

    /* Le etichette dei chip e degli angoli. Stanno qui e non nel core perché il
       core non parla all'utente; passano da `t()` con l'italiano come ripiego
       inline (inv. 14). */
    /* ⚠️ Le etichette dicono ATTIVAZIONE, non preferenza: l'esercizio è
       riconoscere quali richiami riaccendono qualcosa, non quali domande
       piacciono di più. Le chiavi vivono in `MappAIScelta.CHIP`. */
    function etChip(t, k) {
        return {
            subito: _t(t, 'sc_chip_subito', 'mi viene in mente subito'),
            partenza: _t(t, 'sc_chip_partenza', 'so da dove partire'),
            vago: _t(t, 'sc_chip_vago', 'mi dice qualcosa, ma vago'),
            niente: _t(t, 'sc_chip_niente', 'non mi accende niente')
        }[k] || k;
    }
    function etAngolo(t, k) {
        if (!k) return _t(t, 'sc_ang_ignoto', 'taglio non dichiarato');
        if (k === 'auto') return _t(t, 'sc_ang_misto', 'misto');
        if (window.quizAngleLabel) { try { return window.quizAngleLabel(k); } catch (e) { } }
        return k;
    }

    /* ══ MONTAGGIO — TRE PASSI ══════════════════════════════════════════════
       ① AREE     dichiara dove ti senti sicuro (e riduci il campo)
       ② LEGGI    leggi i richiami, di' che cosa ti accendono, prendi le tue
       ③ RISPONDI una alla volta, poi consegna
       I tre passi non sono tre funzioni: è questa che sceglie il corpo, così il
       contatore, il piè e la veste restano una scrittura sola (inv. 6). */
    function monta(host, o) {
        css();
        o = o || {};
        var t = o.t;
        var cfg = S().normalizzaCfg(o.cfg);
        /* ⚠️ Il pool arriva GIÀ CAMPIONATO (`unaPerAngolo`): a farlo è chi
           trasporta, perché in Live il pool campionato è anche quello che si
           serve al telefono. Qui non si tocca. */
        var pool = (o.pool || []).slice();
        var stato = o.stato || {};
        stato.risposte = stato.risposte || {};
        stato.letture = stato.letture || {};     /* che cosa mi ha acceso, anche se non la prendo */
        stato.aree = stato.aree || [];

        /* ── LE OPZIONI DI MAPPAI STUDENTE (6/9), tutte spente per default ──
           `chip`         [{k, et, colore}]: vocabolario e colori dei chip; senza, i quattro storici
           `mostraAngolo` il taglio sulla card
           `raggruppa`    'domanda-per-angoli' = per ramo, riga i = la i-esima domanda di ogni foglio
           `chipPrende`   la chiave del chip che PRENDE la domanda (il verde): niente bottone a parte
           `hint`         la frase in testa al passo ②, se chi monta ne vuole una sua
           `criteri`      (16/9) le aperte che portano `criteri` NON mostrano la traccia:
                          dopo «Ho risposto» la risposta si blocca e i criteri compaiono
                          come spunte (`r.criteriVisti`, `r.spunte`), al posto della
                          scala a tre livelli. Sono la soluzione: mai prima.
                          (0126) `'leggi'`: stesso momento e stesso blocco, ma i criteri
                          si LEGGONO e basta — niente spunte, niente punteggio. Il segno
                          è `r.criteriLetti`, non `criteriVisti`: con quello
                          `punteggioCriteri` darebbe 0 a ogni risposta letta.
           `contatore`    (0126) un elemento di chi monta: il contatore si disegna lì
                          invece che nella riga in testa, e la riga, rimasta senza
                          suggerimento né comandi, non si mostra. MappAI Studente lo
                          mette nella barra della × del pannello accanto alla mappa. */
        var CHIPS = (Array.isArray(o.chip) && o.chip.length)
            ? o.chip.map(function (c) { return { k: String(c.k), et: c.et || etChip(t, c.k), colore: c.colore || '', testo: c.testo || '' }; })
            : S().CHIP.map(function (k) { return { k: k, et: etChip(t, k), colore: '' }; });
        var VOC = (Array.isArray(o.chip) && o.chip.length) ? CHIPS.map(function (c) { return c.k; }) : undefined;
        function etChipDi(k) {
            for (var i = 0; i < CHIPS.length; i++) if (CHIPS[i].k === k) return CHIPS[i].et;
            return etChip(t, k);
        }
        /* il colore va INLINE: la stringa CSS è iniettata una volta sola con
           guardia `#sc-css`, un secondo blocco con lo stesso id non entra */
        function dipingiChip(btn, ch, premuto) {
            btn.setAttribute('aria-pressed', String(!!premuto));
            if (!ch || !ch.colore) return;
            /* `testo` (0126): un colore pieno troppo chiaro per scriverci sul bianco porta il suo colore
               leggibile; senza, il testo è del colore del chip, come prima */
            btn.style.borderColor = ch.colore; btn.style.color = ch.testo || ch.colore;
            btn.style.background = premuto ? 'color-mix(in srgb, ' + ch.colore + ' 14%, white)' : '';
        }
        /* le domande LASCIATE: la risposta non si butta, esce dal conteggio.
           Riprendendo la domanda torna dov'era — buttarla sarebbe l'unico gesto
           di questa schermata che distrugge del lavoro. */
        stato.bozze = stato.bozze || {};
        var onCambia = o.onCambia || function () { };
        /* ── «Correggi subito» ────────────────────────────────────────────────
           Il verdetto lo calcola CHI TRASPORTA (in Live il server, che è l'unico
           ad avere le soluzioni): qui si mostra e basta. `stato.verdetti` non
           esiste finché il docente non accende la leva, e senza non cambia
           niente. */
        var verdetti = o.verdetti || {};
        var onConsegna = o.onConsegna || function () { };
        var chiedi = o.chiedi || function (testo) { return Promise.resolve(window.confirm(testo)); };

        /* Il percorso serve? Lo dice il core guardando le aree, non un flag. */
        /* `senzaAree` (7/9): chi monta ha già scelto l'ambito altrove (la prova su
           misura di MappAI studente) — niente passo ① e niente «Cambia argomenti» */
        /* 0116 `semplice`: niente da scegliere — tutte le domande sono prese e si
           parte da «rispondi». La regola sta nel core (`avvioSemplice`). */
        var semplice = !!(cfg && cfg.semplice);
        var conPassi = !semplice && !o.senzaAree && S().passiUtili(pool, cfg);
        if (semplice) S().avvioSemplice(pool, stato);
        if (!stato.fase) stato.fase = conPassi ? 'aree' : 'scegli';
        /* uno stato vecchio può dire «aree» su un vault che aree non ne ha:
           lasciarlo lì vorrebbe dire una schermata vuota senza uscita */
        if (!conPassi && stato.fase === 'aree') stato.fase = 'scegli';

        var wrap, top, cnt, hint, list, foot;
        var iRisposta = 0;                      /* la domanda corrente nel passo ③ */
        var contatore = (o.contatore && typeof o.contatore.appendChild === 'function') ? o.contatore : null;
        /* 0126, allargamento 4 (Giacomo, 26/10, la scelta su misura sull'iPad: «ridurre il carico
           cognitivo […] rendere più leggibili i testi»). Tutte spente di serie:
           `aPagine`      con `raggruppa: 'domanda-per-angoli'`: una serie di tagli alla volta, il
                          ramo in testa, «‹ n / N ›» per ramo
           `chipVelo`     con `chipPrende`: il tocco su una domanda apre un velo coi chip, uno
                          sopra l'altro; scelto un chip si chiude
           `leggiDomande` il 🔊 su ogni domanda da scegliere
           `senzaTorna`   nella risposta niente «‹ Torna alle domande»
           `onFase(f)`    a ogni disegno, il passo: 'aree' | 'scegli' | 'rispondi'
           `confermo`     il bottone sotto la casella dice «Confermo» (i criteri appaiono lo stesso), e
                          l'invito dei criteri da spuntare «Clicca sui concetti importanti…»
           `leggiRisposta` il 🔊 accanto alla domanda, alla casella della risposta e a ogni criterio */
        var aPagine = !!o.aPagine && o.raggruppa === 'domanda-per-angoli';
        var chipVelo = !!o.chipVelo && !!o.chipPrende;
        var iSerie = 0;                         /* la serie corrente con `aPagine` */
        /* il 🔊: legge con la voce del browser (`MappAIQuizMcView.parla`) il testo che `testo()` dà al tocco.
           Ha la cornice del 🔊 del quiz (Giacomo, 26/10: «un frame uguale a quello che hanno nella modalità
           semplice e che è uguale anche a quello dei quiz»): la classe `tts` dentro un `.qmc`, col foglio
           del quiz — che qui si mette se il quiz non l'ha ancora messo (stesso id: non si raddoppia) */
        function bottoneVoce(testo, etichetta) {
            var Q = window.MappAIQuizMcView;
            if (Q && Q.CSS && !document.getElementById('qmc-css')) {
                var st = document.createElement('style'); st.id = 'qmc-css'; st.textContent = Q.CSS;
                (document.head || document.documentElement).appendChild(st);
            }
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'tts sc-tts'; b.textContent = '🔊';
            b.setAttribute('aria-label', etichetta);
            b.onclick = function (ev) {
                if (ev && ev.stopPropagation) ev.stopPropagation();
                var Q = window.MappAIQuizMcView; if (Q && Q.parla) Q.parla(testo());
            };
            return b;
        }
        /* `leggiRisposta`: l'elemento e il suo 🔊 sulla stessa riga; senza, l'elemento com'è */
        function conVoce(el, testo, etichetta, classe) {
            if (!o.leggiRisposta) return el;
            var riga = document.createElement('div'); riga.className = 'sc-voce-riga qmc' + (classe ? ' ' + classe : '');
            riga.appendChild(el); riga.appendChild(bottoneVoce(testo, etichetta));
            return riga;
        }

        /* ── il salvataggio: si accumula e si manda dopo una pausa ────────────
           Un colpo di rete per tasto premuto è quello che rende una pagina
           inutilizzabile su una LAN di scuola. 600ms è l'attesa di una pausa
           vera nella scrittura, non di un carattere. */
        var attese = {};
        /* ⚠️ Prima di consegnare i salvataggi in coda si buttano, non si
           aspettano: lo stato intero viaggia già con la consegna, e un
           `/api/stato` che arriva DOPO il `/api/finish` rimetterebbe lo studente
           fra quelli che stanno ancora lavorando. */
        function svuotaAttese() {
            Object.keys(attese).forEach(function (k) { clearTimeout(attese[k]); delete attese[k]; });
        }
        function salva(id, subito) {
            if (attese[id]) clearTimeout(attese[id]);
            var manda = function () { delete attese[id]; try { onCambia(id, stato.risposte[id] || null, stato); } catch (e) { } };
            if (subito) return manda();
            attese[id] = setTimeout(manda, 600);
        }

        function attivo() { return conPassi ? S().filtraPerAree(pool, stato.aree) : pool; }
        function prese() { return attivo().filter(function (v) { return !!stato.risposte[v.id]; }); }
        function vaiA(fase) { stato.fase = fase; salva('__fase', true); disegna(); }

        /* ── i pezzi comuni ─────────────────────────────────────────────────── */
        function scheletro() {
            host.innerHTML = '';
            wrap = document.createElement('div'); wrap.className = 'sc-wrap';
            top = document.createElement('div'); top.className = 'sc-top';
            cnt = document.createElement('div'); cnt.className = 'sc-cnt';
            hint = document.createElement('div'); hint.className = 'sc-hint';
            if (contatore) { contatore.innerHTML = ''; contatore.appendChild(cnt); } else top.appendChild(cnt);
            top.appendChild(hint);
            list = document.createElement('div'); list.className = 'sc-list';
            foot = document.createElement('div'); foot.className = 'sc-foot';
            wrap.appendChild(top); wrap.appendChild(list); wrap.appendChild(foot);
            host.appendChild(wrap);
        }
        function bottone(testo, fn, cls) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = cls || 'sc-go'; b.textContent = testo;
            b.onclick = fn; return b;
        }
        function comando(testo, fn) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'sc-cmd'; b.textContent = testo;
            b.onclick = fn; return b;
        }
        function vuoto(testo) {
            list.innerHTML = '<div class="sc-vuoto">' + esc(testo) + '</div>';
        }

        /* ══ ① LE AREE ═══════════════════════════════════════════════════════
           Non è «riduci il carico»: è dichiarare dove ci si sente sicuri, che è
           già una risposta — e nel report vale quanto le altre. */
        function passoAree() {
            hint.textContent = _t(t, 'sc_hint_aree', 'Scegli gli argomenti su cui ti senti più sicuro: leggerai solo le domande di quelli.');
            var elenco = S().aree(pool).filter(function (a) { return a.ramo; });
            function conta() {
                var q = S().filtraPerAree(pool, stato.aree).length;
                var sotto = stato.aree.length < cfg.minimoAree;
                cnt.className = 'sc-cnt' + (sotto ? ' ko' : '');
                cnt.innerHTML = '<b>' + stato.aree.length + '</b> ' +
                    esc(stato.aree.length === 1 ? _t(t, 'sc_area_scelta', 'argomento') : _t(t, 'sc_aree_scelte', 'argomenti')) +
                    (cfg.minimoAree ? ' ' + esc(_t(t, 'sc_su_minimo', 'su')) + ' ' + cfg.minimoAree : '') +
                    ' · <b>' + q + '</b> ' + esc(_t(t, 'sc_da_leggere', 'domande da leggere'));
            }
            elenco.forEach(function (a) {
                var art = document.createElement('article'); art.className = 'sc-q';
                var b = document.createElement('button');
                b.type = 'button'; b.className = 'sc-take';
                b.innerHTML = '<span class="sc-mark" aria-hidden="true"></span>' +
                    '<span class="sc-txt">' + esc(a.ramo) +
                    '<span class="sc-sub">' + a.quante + ' ' + esc(_t(t, 'sc_domande', 'domande')) + '</span></span>';
                function dipingi() {
                    var on = stato.aree.indexOf(a.ramo) >= 0;
                    art.classList.toggle('on', on);
                    b.setAttribute('aria-pressed', on ? 'true' : 'false');
                    b.querySelector('.sc-mark').textContent = on ? '✓' : '';
                }
                b.onclick = function () {
                    var k = stato.aree.indexOf(a.ramo);
                    if (k >= 0) stato.aree.splice(k, 1); else stato.aree.push(a.ramo);
                    dipingi(); conta(); salva('__aree', true);
                };
                dipingi();
                art.appendChild(b); list.appendChild(art);
            });
            if (!elenco.length) vuoto(_t(t, 'sc_no_aree', 'Questa mappa non dichiara i suoi argomenti: si passa direttamente alle domande.'));
            conta();
            foot.appendChild(bottone(_t(t, 'sc_vai_domande', 'Vai alle domande'), function () {
                var v = S().validaAree(pool, stato, cfg);
                if (v.ok) return vaiA('scegli');
                /* come la consegna: si dice che cosa manca e si lascia decidere.
                   Il minimo qui è un consiglio di metodo, non un requisito. */
                var m = v.motivi[0];
                var testo = (m.id === 'sotto_minimo_aree')
                    ? (m.scelte === 1
                        ? _t(t, 'sc_ko_area1', 'Hai scelto un argomento solo, ne sono consigliati {m}.').replace('{m}', m.minimo)
                        : _t(t, 'sc_ko_aree', 'Hai scelto {n} argomenti su {m} consigliati.').replace('{n}', m.scelte).replace('{m}', m.minimo))
                    : _t(t, 'sc_ko_aree_vuote', 'Gli argomenti scelti non hanno domande.');
                Promise.resolve(chiedi(testo + '\n\n' + _t(t, 'sc_ko_aree_ok', 'Vai avanti lo stesso?')))
                    .then(function (si) { if (si) vaiA('scegli'); });
            }));
        }

        /* ══ ② LEGGI E SCEGLI ════════════════════════════════════════════════
           Il cuore: ogni domanda è un RICHIAMO, e leggerla è già esercizio. Si
           apre per considerarla, si dice che cosa ha acceso, e si prende — o no.
           Le due cose sono indipendenti: «non mi accende niente» è un giudizio
           che vale su una domanda che non si prende. */
        function passoScegli() {
            hint.textContent = o.hint || (o.raggruppa === 'domanda-per-angoli'
                ? _t(t, 'sc_hint_angoli', 'Leggi la domanda in tutti i suoi tagli, poi dì per ognuno che cosa ti succede.')
                : _t(t, 'sc_hint_leggi', 'Leggi ogni domanda e dì che cosa ti fa venire in mente. Poi prendi quelle a cui vuoi rispondere.'));
            var vive = attivo();
            function conta() {
                var n = S().conteggio(vive, stato, VOC);
                cnt.className = 'sc-cnt' + (n.scelte < cfg.minimo ? ' ko' : '');
                /* col velo le prese sono le domande «la so» (il chip che prende): il contatore lo dice
                   col nome del chip e senza il minimo (Giacomo, 26/10: «Lette: n/36 · la so: n» e togli «su 1») */
                var prende = chipVelo ? CHIPS.filter(function (x) { return x.k === o.chipPrende; })[0] : null;
                cnt.innerHTML = esc(_t(t, 'sc_lette', 'Lette')) + ': <b>' + n.lette + '</b>/' + n.totale +
                    ' · ' + esc(prende ? prende.et : _t(t, 'sc_scelte', 'scelte')) + ': <b>' + n.scelte + '</b>' +
                    (cfg.minimo && !prende ? ' ' + esc(_t(t, 'sc_su_minimo', 'su')) + ' ' + cfg.minimo : '');
                return n;
            }
            if (conPassi) top.appendChild(comando('‹ ' + _t(t, 'sc_cambia_aree', 'Cambia argomenti'), function () { vaiA('aree'); }));

            function card(v) {
                var art = document.createElement('article');
                art.className = 'sc-q'; art.setAttribute('data-id', v.id);
                var take = document.createElement('button');
                take.type = 'button'; take.className = 'sc-take';
                take.setAttribute('aria-expanded', 'false');
                /* `chipVelo`: niente casella della spunta, il giudizio lo dice il colore della
                   cornice (Giacomo, 26/10: «togli il box per la spunta») */
                take.innerHTML = (chipVelo ? '' : '<span class="sc-mark" aria-hidden="true"></span>') + '<span class="sc-txt">' +
                    ((o.mostraAngolo && v.angle) ? '<span class="sc-ang">' + esc(etAngolo(t, v.angle)) + '</span>' : '') +
                    esc(v.testo) + '</span>';
                var body = document.createElement('div'); body.className = 'sc-body'; body.hidden = true;
                art.appendChild(take);
                if (o.leggiDomande) {
                    art.classList.add('sc-q--voce', 'qmc');
                    art.appendChild(bottoneVoce(function () { return v.testo; }, _t(t, 'qmc_ascolta_domanda', 'Ascolta la domanda')));
                }
                art.appendChild(body);

                function dipingi() {
                    var presa = !!stato.risposte[v.id];
                    var l = stato.letture[v.id];
                    art.classList.toggle('on', presa);
                    art.classList.toggle('letta', !!(l && l.chip));
                    if (chipVelo) {
                        /* «dopo aver scelto l'opzione la domanda avrà il frame con il colore
                           dell'opzione scelta» (Giacomo, 26/10) */
                        var ch = l && l.chip ? CHIPS.filter(function (x) { return x.k === l.chip; })[0] : null;
                        art.style.borderColor = (ch && ch.colore) || '';
                        /* «il BG […] ha anche lui il colore dell'opzione ma con opacity 15%» */
                        art.style.background = (ch && ch.colore) ? 'color-mix(in srgb, ' + ch.colore + ' 15%, transparent)' : '';
                        return;
                    }
                    take.querySelector('.sc-mark').textContent = presa ? '✓' : (l && l.chip ? '·' : '');
                }
                /* il tocco APRE, non prende: aprire è considerarla, ed è il
                   gesto che questa attività vuole far fare con calma */
                take.onclick = function () {
                    if (chipVelo) return velo();
                    var chiuso = body.hidden;
                    if (chiuso && !body.childNodes.length) corpo();
                    body.hidden = !chiuso;
                    take.setAttribute('aria-expanded', chiuso ? 'true' : 'false');
                };

                /* PRENDERE una domanda, o lasciarla: la risposta in corso si
                   parcheggia in `bozze`, non si butta */
                function prendi(si) {
                    if (si && !stato.risposte[v.id]) {
                        stato.risposte[v.id] = stato.bozze[v.id] || {};
                        delete stato.bozze[v.id];
                    } else if (!si && stato.risposte[v.id]) {
                        stato.bozze[v.id] = stato.risposte[v.id];
                        delete stato.risposte[v.id];
                    }
                }
                /* il giudizio: il secondo tocco sullo stesso chip lo toglie */
                function giudica(k) {
                    var ll = stato.letture[v.id] || (stato.letture[v.id] = {});
                    ll.chip = (ll.chip === k) ? '' : k;
                    /* il chip verde PRENDE la domanda (MappAI studente):
                       qui il giudizio e la scelta sono lo stesso gesto */
                    if (o.chipPrende) prendi(ll.chip === o.chipPrende);
                    dipingi(); conta(); salva(v.id, true);
                    return ll.chip;
                }
                /* `chipVelo`: i chip in un velo a centro schermo, uno sopra l'altro; il tocco
                   fuori chiude senza cambiare niente */
                function velo() {
                    var l = stato.letture[v.id] || {};
                    var ve = document.createElement('div'); ve.className = 'sc-giudizio';
                    ve.setAttribute('role', 'dialog'); ve.setAttribute('aria-modal', 'true');
                    ve.setAttribute('aria-label', v.testo);
                    var fondo = document.createElement('div'); fondo.className = 'sc-giudizio__fondo';
                    fondo.onclick = function () { ve.remove(); };
                    var box = document.createElement('div'); box.className = 'sc-giudizio__box';
                    /* in cima la domanda: il velo copre la carta, si rilegge mentre si sceglie */
                    var dq = document.createElement('div'); dq.className = 'sc-giudizio__q';
                    dq.textContent = v.testo; box.appendChild(dq);
                    CHIPS.forEach(function (ch) {
                        var c = document.createElement('button');
                        c.type = 'button'; c.className = 'sc-chip';
                        c.textContent = ch.et;
                        dipingiChip(c, ch, l.chip === ch.k);
                        c.onclick = function () { giudica(ch.k); ve.remove(); };
                        box.appendChild(c);
                    });
                    ve.appendChild(fondo); ve.appendChild(box);
                    wrap.appendChild(ve);
                }
                function corpo() {
                    var l = stato.letture[v.id] || {};
                    var lc = document.createElement('div'); lc.className = 'sc-lbl';
                    lc.textContent = o.chipPrende
                        ? _t(t, 'sc_perche', 'Perché:')
                        : _t(t, 'sc_richiamo', 'Che cosa ti fa venire in mente?');
                    body.appendChild(lc);
                    var chips = document.createElement('div'); chips.className = 'sc-chips';
                    CHIPS.forEach(function (ch) {
                        var c = document.createElement('button');
                        c.type = 'button'; c.className = 'sc-chip';
                        c.textContent = ch.et;
                        dipingiChip(c, ch, l.chip === ch.k);
                        c.onclick = function () {
                            var k = giudica(ch.k);
                            /* per CHIAVE, non per indice: con un vocabolario diverso
                               l'indice accendeva il chip sbagliato */
                            chips.querySelectorAll('.sc-chip').forEach(function (x, xi) {
                                dipingiChip(x, CHIPS[xi], CHIPS[xi].k === k);
                            });
                        };
                        chips.appendChild(c);
                    });
                    body.appendChild(chips);

                    var nota = document.createElement('input');
                    nota.className = 'sc-nota'; nota.type = 'text'; nota.value = l.nota || '';
                    nota.placeholder = _t(t, 'sc_nota_ph', '…oppure scrivilo con parole tue (facoltativo)');
                    nota.setAttribute('aria-label', _t(t, 'sc_richiamo', 'Che cosa ti fa venire in mente?'));
                    nota.style.marginTop = '8px';
                    nota.oninput = function () {
                        var ll = stato.letture[v.id] || (stato.letture[v.id] = {});
                        ll.nota = nota.value; salva(v.id);
                    };
                    body.appendChild(nota);

                    if (o.chipPrende) return;    /* prende il chip: niente bottone a parte (inv. 21) */
                    var pre = bottone('', function () {
                        prendi(!stato.risposte[v.id]);
                        etichettaPresa(); dipingi(); conta(); salva(v.id, true);
                    }, 'sc-prendi');
                    function etichettaPresa() {
                        var presa = !!stato.risposte[v.id];
                        pre.textContent = presa
                            ? '✓ ' + _t(t, 'sc_presa', 'La rispondo — tocca per lasciarla')
                            : _t(t, 'sc_prendi', 'Rispondo a questa');
                        pre.classList.toggle('on', presa);
                        pre.setAttribute('aria-pressed', presa ? 'true' : 'false');
                    }
                    etichettaPresa();
                    body.appendChild(pre);
                }

                dipingi();
                return art;
            }

            if (!vive.length) {
                vuoto(_t(t, 'sc_no_domande', 'Gli argomenti scelti non hanno domande: torna indietro e scegline altri.'));
            } else if (aPagine) {
                serie(S().perDomandaPerAngoli(vive));
            } else if (o.raggruppa === 'domanda-per-angoli') {
                S().perDomandaPerAngoli(vive).forEach(function (g) {
                    var h = document.createElement('div'); h.className = 'sc-ramo';
                    h.textContent = g.ramo || _t(t, 'sc_senza_ramo', 'Altre domande');
                    list.appendChild(h);
                    g.righe.forEach(function (r) {
                        var hr = document.createElement('div'); hr.className = 'sc-riga';
                        hr.textContent = _t(t, 'sc_domanda_n', 'Domanda {n}').replace('{n}', r.i + 1) +
                            ' · ' + r.celle.length + ' ' + _t(t, 'sc_tagli', 'tagli');
                        list.appendChild(hr);
                        r.celle.forEach(function (v) { list.appendChild(card(v)); });
                    });
                });
            } else if (cfg.perRamo) {
                S().perRamo(vive).forEach(function (g) {
                    var h = document.createElement('div'); h.className = 'sc-ramo';
                    h.textContent = g.ramo || _t(t, 'sc_senza_ramo', 'Altre domande');
                    list.appendChild(h);
                    g.domande.forEach(function (v) { list.appendChild(card(v)); });
                });
            } else {
                vive.forEach(function (v) { list.appendChild(card(v)); });
            }
            /* `aPagine`: una serie alla volta (i tagli della stessa domanda), il ramo in testa a 25 px,
               sotto le frecce col numeratore della serie NEL RAMO; dopo l'ultima del ramo, il ramo dopo */
            function serie(gruppi) {
                var tutte = [];
                gruppi.forEach(function (g, gi) {
                    g.righe.forEach(function (r, i) { tutte.push({ ramo: g.ramo, celle: r.celle, n: i + 1, di: g.righe.length, rn: gi + 1 }); });
                });
                if (iSerie >= tutte.length) iSerie = tutte.length - 1;
                if (iSerie < 0) iSerie = 0;
                var s = tutte[iSerie];
                wrap.classList.add('sc--pagine');
                var h = document.createElement('h2'); h.className = 'sc-ramo--titolo';
                h.textContent = s.ramo || _t(t, 'sc_senza_ramo', 'Altre domande');
                /* a destra del titolo, sul margine, il ramo su quanti sono (Giacomo, 26/10: «il contatore
                   n/N per aiutare a capire lo stato di avanzamento»); le frecce contano le serie nel ramo */
                var rn = document.createElement('span'); rn.className = 'sc-ramo-n';
                rn.textContent = s.rn + '/' + gruppi.length;
                var testa = document.createElement('div'); testa.className = 'sc-ramo-testa';
                testa.appendChild(h); testa.appendChild(rn);
                list.appendChild(testa);
                s.celle.forEach(function (v) { list.appendChild(card(v)); });
                var nav = document.createElement('div'); nav.className = 'sc-nav';
                var pre = bottone('‹', function () { iSerie--; disegna(); }, 'sc-nav__b');
                pre.setAttribute('aria-label', _t(t, 'sc_serie_prec', 'Serie precedente'));
                pre.disabled = iSerie === 0;
                var suc = bottone('›', function () { iSerie++; disegna(); }, 'sc-nav__b');
                suc.setAttribute('aria-label', _t(t, 'sc_serie_succ', 'Serie successiva'));
                suc.disabled = iSerie >= tutte.length - 1;
                var qui = document.createElement('span'); qui.className = 'sc-nav__n';
                qui.textContent = s.n + ' / ' + s.di;
                nav.appendChild(pre); nav.appendChild(qui); nav.appendChild(suc);
                foot.appendChild(nav);
            }
            conta();
            foot.appendChild(bottone(_t(t, 'sc_comincia', 'Comincia a rispondere'), function () {
                var n = S().conteggio(vive, stato, VOC);
                if (n.scelte) { iRisposta = 0; return vaiA('rispondi'); }
                Promise.resolve(chiedi(_t(t, 'sc_nessuna_presa', 'Non hai preso nessuna domanda: non ci sarà niente a cui rispondere.') +
                    '\n\n' + _t(t, 'sc_ko_aree_ok', 'Vai avanti lo stesso?')))
                    .then(function (si) { if (si) vaiA('rispondi'); });
            }));
        }

        /* ══ ③ RISPONDI ══════════════════════════════════════════════════════
           Una alla volta (scelta di Giacomo): su un telefono una risposta lunga
           in mezzo a una colonna di sei diventa un rotolo, e il «3 di 6» dice
           quanto manca — che è ciò che tiene su chi scrive. La consegna però non
           aspetta l'ultima: chi ha finito deve poter chiudere da dove si trova. */
        function passoRispondi() {
            var mie = prese();
            if (!mie.length) {
                hint.textContent = '';
                vuoto(_t(t, 'sc_nessuna_presa2', 'Non hai preso nessuna domanda. Torna indietro e scegline qualcuna.'));
                if (!semplice) foot.appendChild(bottone('‹ ' + _t(t, 'sc_torna_scegli', 'Torna alle domande'), function () { vaiA('scegli'); }, 'sc-go sc-go--quieto'));
                return;
            }
            if (iRisposta >= mie.length) iRisposta = mie.length - 1;
            if (iRisposta < 0) iRisposta = 0;
            var v = mie[iRisposta];
            var r = stato.risposte[v.id] || (stato.risposte[v.id] = {});

            hint.textContent = '';
            cnt.innerHTML = esc(_t(t, 'sc_di', 'Domanda')) + ' <b>' + (iRisposta + 1) + '</b> ' +
                esc(_t(t, 'sc_su', 'di')) + ' ' + mie.length;
            if (!semplice && !o.senzaTorna) top.appendChild(comando('‹ ' + _t(t, 'sc_torna_scegli', 'Torna alle domande'), function () { vaiA('scegli'); }));

            /* la scelta multipla ha la veste del quiz LIVE (domanda col 🔊, opzioni grandi, esito sotto):
               la disegna mappai-quiz-mc-view.js, la stessa riga di codice che sta dietro il telefono */
            var QMC = window.MappAIQuizMcView;
            /* 0116, gate del 21/10 (Giacomo): in modalità semplice anche la domanda
               aperta ha la veste del quiz LIVE — stesso corpo e il 🔊 per sentirla */
            function domandaQuiz() { var qh = document.createElement('div'); list.appendChild(qh); QMC.domanda(qh, v.testo); }
            if (v.tipo === 'mc' || (semplice && QMC)) {
                domandaQuiz();
            } else if (o.leggiRisposta && QMC) {
                /* 0126 `leggiRisposta`: anche in Meta la veste di Semplice, stesso corpo e stesso 🔊 (Giacomo, 26/10) */
                domandaQuiz();
            } else {
                var q = document.createElement('div'); q.className = 'sc-dom';
                q.textContent = v.testo;
                list.appendChild(q);
            }
            var conCriteri = !!(o.criteri && v.tipo !== 'mc' && v.criteri && v.criteri.length);
            var daLeggere = conCriteri && o.criteri === 'leggi';    /* 0126: i criteri senza spunte */
            /* 0116: la traccia è la correzione del docente (`guide`): in modalità semplice mai */
            if (v.traccia && !conCriteri && !semplice) {
                var tr = document.createElement('div'); tr.className = 'sc-lbl';
                tr.textContent = v.traccia; list.appendChild(tr);
            }

            /* IL CAMPO DELLA RISPOSTA è l'unica cosa che cambia fra i due
               generi: una casella dove scrivere, o le opzioni da toccare. */
            if (v.tipo === 'mc') {
                var qo = document.createElement('div'); list.appendChild(qo);
                QMC.opzioni(qo, v.opzioni || [], {
                    scelta: r.scelta, radio: true,
                    bloccata: !!verdetti[v.id],            /* già corretta: non si ripensa */
                    onScegli: function (oi) { r.scelta = oi; QMC.segna(qo, oi); salva(v.id, true); }
                });
            } else {
                var ta = document.createElement('textarea');
                ta.className = 'sc-ta' + (semplice ? ' sc-ta--live' : ''); ta.value = r.testo || '';
                ta.setAttribute('aria-label', _t(t, 'sc_aria_risposta', 'La tua risposta'));
                ta.oninput = function () { r.testo = ta.value; salva(v.id); if (vedi) vedi.disabled = !S().scritta(r); };
                /* il 🔊 della risposta legge quello che c'è scritto al momento del tocco */
                list.appendChild(conVoce(ta, function () { return ta.value; }, _t(t, 'sc_ascolta_risposta', 'Ascolta la tua risposta')));
                var vedi = null;
                if (conCriteri && !(daLeggere ? r.criteriLetti : r.criteriVisti)) {
                    /* 0126 `confermo` (spenta di serie; Giacomo, 26/10: «da 'Ho risposto: controlla i criteri' in
                       'Confermo', i criteri appaiono indipendentemente dal testo del bottone») */
                    vedi = bottone(o.confermo ? _t(t, 'sc_confermo', 'Confermo')
                        : daLeggere ? _t(t, 'sc_crit_mostra', 'Ho risposto: mostra i criteri') : _t(t, 'sc_crit_vedi', 'Ho risposto: controlla coi criteri'), function () {
                        if (!S().scritta(r)) return;
                        if (daLeggere) r.criteriLetti = true;
                        else { r.criteriVisti = true; r.spunte = v.criteri.map(function () { return false; }); }
                        salva(v.id, true); disegna();
                    }, 'sc-go sc-go--quieto');
                    vedi.disabled = !S().scritta(r);
                    list.appendChild(vedi);
                } else if (daLeggere) {
                    /* come sotto, la risposta non si ritocca; i criteri si leggono e basta */
                    ta.readOnly = true;
                    var ll = document.createElement('div'); ll.className = 'sc-lbl';
                    ll.textContent = _t(t, 'sc_crit_leggi', 'I criteri della risposta');
                    list.appendChild(ll);
                    var ul = document.createElement('ul'); ul.className = 'sc-crit' + (semplice ? ' sc-crit--live' : '');
                    v.criteri.forEach(function (testo) {
                        var li = document.createElement('li');
                        if (o.leggiRisposta) {
                            var sp = document.createElement('span'); sp.textContent = testo;
                            li.appendChild(conVoce(sp, function () { return testo; }, _t(t, 'sc_ascolta_criterio', 'Ascolta il criterio')));
                        } else li.textContent = testo;
                        ul.appendChild(li);
                    });
                    list.appendChild(ul);
                } else if (conCriteri) {
                    /* visti i criteri, la risposta non si ritocca: sarebbe copiarli */
                    ta.readOnly = true;
                    var lc = document.createElement('div'); lc.className = 'sc-lbl';
                    /* con `confermo` l'invito di Giacomo (26/10): «Clicca sui concetti importanti che hai usato anche tu.» */
                    lc.textContent = o.confermo ? _t(t, 'sc_crit_concetti', 'Clicca sui concetti importanti che hai usato anche tu.')
                        : _t(t, 'sc_crit', 'Che cosa c\'è nella tua risposta? Spunta ciò che hai scritto.');
                    list.appendChild(lc);
                    v.criteri.forEach(function (testo, ci) {
                        var cb = document.createElement('button');
                        cb.type = 'button'; cb.className = 'sc-opt'; cb.setAttribute('role', 'checkbox');
                        cb.setAttribute('aria-checked', String(!!(r.spunte && r.spunte[ci])));
                        cb.textContent = testo;
                        cb.onclick = function () {
                            r.spunte = r.spunte || [];
                            r.spunte[ci] = !r.spunte[ci];
                            cb.setAttribute('aria-checked', String(r.spunte[ci]));
                            salva(v.id, true);
                        };
                        list.appendChild(conVoce(cb, function () { return testo; }, _t(t, 'sc_ascolta_criterio', 'Ascolta il criterio'), 'sc-voce-riga--opt'));
                    });
                }
            }

            /* l'esito della domanda corrente, se è già stato dato */
            var vd = verdetti[v.id];
            if (vd) {
                var vh = document.createElement('div'); list.appendChild(vh);
                QMC.verdetto(vh, vd, {
                    giusto: _t(t, 'sc_giusto', 'Giusto'), sbagliato: _t(t, 'sc_sbagliato', 'Sbagliato'), corretta: _t(t, 'sc_corretta', 'corretta')
                });
            }

            if (cfg.autovalutazione && !conCriteri) {
                var la = document.createElement('div'); la.className = 'sc-lbl';
                la.textContent = _t(t, 'sc_auto', 'Quanto ti senti sicuro di questa risposta?');
                list.appendChild(la);
                var box = document.createElement('div'); box.className = 'sc-chips';
                [[3, _t(t, 'sc_auto_3', 'sicuro')], [2, _t(t, 'sc_auto_2', 'così così')], [1, _t(t, 'sc_auto_1', 'ho tirato a indovinare')]]
                    .forEach(function (p) {
                        var b = document.createElement('button');
                        b.type = 'button'; b.className = 'sc-chip';
                        b.setAttribute('aria-pressed', String(r.auto === p[0]));
                        b.textContent = p[1];
                        b.onclick = function () {
                            r.auto = p[0];
                            box.querySelectorAll('.sc-chip').forEach(function (x, xi) {
                                x.setAttribute('aria-pressed', String([3, 2, 1][xi] === r.auto));
                            });
                            salva(v.id, true);
                        };
                        box.appendChild(b);
                    });
                list.appendChild(box);
            }

            /* il giudizio dato leggendo si MOSTRA e basta: si è già espresso,
               richiederlo qui sarebbe chiederlo a memoria */
            var l = stato.letture[v.id];
            if (l && l.chip) {
                var eco = document.createElement('div'); eco.className = 'sc-eco';
                eco.textContent = _t(t, 'sc_eco', 'Leggendola avevi detto:') + ' ' + etChipDi(l.chip);
                list.appendChild(eco);
            }

            /* la navigazione, e la consegna che non aspetta l'ultima domanda */
            var nav = document.createElement('div'); nav.className = 'sc-nav';
            var pre = bottone('‹', function () { iRisposta--; disegna(); }, 'sc-nav__b');
            pre.setAttribute('aria-label', _t(t, 'sc_prec', 'Domanda precedente'));
            pre.disabled = iRisposta === 0;
            var suc = bottone('›', function () { iRisposta++; disegna(); }, 'sc-nav__b');
            suc.setAttribute('aria-label', _t(t, 'sc_succ', 'Domanda successiva'));
            suc.disabled = iRisposta >= mie.length - 1;
            var qui = document.createElement('span'); qui.className = 'sc-nav__n';
            qui.textContent = (iRisposta + 1) + ' / ' + mie.length;
            nav.appendChild(pre); nav.appendChild(qui); nav.appendChild(suc);
            foot.appendChild(nav);

            if (cfg.osservazioni) {
                var lo = document.createElement('div'); lo.className = 'sc-lbl'; lo.style.margin = '0';
                /* ⚠️ L'invito sta nell'ETICHETTA, non nel segnaposto: con
                   `field-sizing: content` è il contenuto a dare l'altezza, e un
                   segnaposto di due righe fa nascere il campo alto 94px. */
                lo.textContent = _t(t, 'sc_oss', 'Osservazioni — perché proprio queste? (facoltativo)');
                var oss = document.createElement('textarea');
                oss.className = 'sc-oss'; oss.value = stato.note || ''; oss.rows = 1;
                oss.setAttribute('aria-label', _t(t, 'sc_oss', 'Osservazioni — perché proprio queste? (facoltativo)'));
                oss.oninput = function () { stato.note = oss.value; salva('__note'); };
                foot.appendChild(lo); foot.appendChild(oss);
            }
            /* 0116, gate del 21/10 (Giacomo): in modalità semplice «Consegna» c'è solo
               all'ultima domanda, come nel quiz a scelta multipla. 0126 `consegnaAllaFine`
               (spenta di serie): così anche con la scelta delle domande — Giacomo, in Meta
               sull'iPad: «solo dopo che sono arrivato all'ultima domanda selezionata» */
            if (semplice && iRisposta < mie.length - 1) return;
            if (o.consegnaAllaFine && iRisposta < mie.length - 1) return;
            foot.appendChild(bottone(_t(t, 'sc_consegna', 'Consegna'), function () {
                var v2 = S().validaConsegna(attivo(), stato, cfg);
                if (v2.ok) { svuotaAttese(); return onConsegna(stato); }
                var righe = v2.motivi.map(function (m) {
                    if (m.id === 'sotto_minimo') return _t(t, 'sc_ko_min', 'Hai scritto {n} risposte su {m} chieste.').replace('{n}', m.scritte).replace('{m}', m.minimo);
                    /* in modalità semplice nessuna domanda è stata «presa»: sono tutte sue */
                    if (semplice) return _t(t, 'sc_ko_vuote_s', 'Hai lasciato {n} domande senza risposta.').replace('{n}', m.quante);
                    return _t(t, 'sc_ko_vuote', 'Hai preso {n} domande senza rispondere.').replace('{n}', m.quante);
                });
                Promise.resolve(chiedi(righe.join('\n') + '\n\n' + _t(t, 'sc_ko_ok', 'Consegni lo stesso?')))
                    .then(function (si) { if (si) { svuotaAttese(); onConsegna(stato); } });
            }));
        }

        function disegna() {
            passo();
            /* 0126: col contatore fuori, la riga in testa senza suggerimento né comandi è una riga vuota */
            if (contatore) top.hidden = !hint.textContent && !top.querySelector('button');
            if (typeof o.onFase === 'function') o.onFase((stato.fase === 'rispondi' || semplice) ? 'rispondi' : stato.fase);
        }
        function passo() {
            scheletro();
            if (!pool.length) {
                vuoto(_t(t, 'sc_pool_vuoto', 'Non ci sono ancora domande per questa mappa. Generale con «Genera materiali», poi torna qui.'));
                return;
            }
            if (stato.fase === 'aree') return passoAree();
            if (stato.fase === 'rispondi' || semplice) return passoRispondi();
            return passoScegli();
        }

        disegna();
        return {
            /* il chiamante può forzare il ridisegno quando lo stato cambia da
               fuori (il rientro, il secondo giro) */
            aggiorna: disegna,
            /* il verdetto arriva dopo la risposta, in asincrono: chi trasporta
               lo consegna qui e la schermata si riscrive */
            verdetto: function (id, v) { if (id && v) { verdetti[id] = v; disegna(); } },
            vaiA: vaiA,
            stato: stato
        };
    }

    /* ══ L'ESITO — che cosa ho scelto, senza saperlo ═════════════════════════
       Il profilo arriva da fuori: in Live lo calcola il server alla consegna
       (l'angolo non deve viaggiare prima), in-app il core in locale. */
    function mostraEsito(host, o) {
        css();
        o = o || {};
        var t = o.t, p = o.profilo || { righe: [], conteggio: {} }, cfg = S().normalizzaCfg(o.cfg);
        host.innerHTML = '';
        /* 0116, gate del 21/10 (Giacomo): in modalità semplice la chiusura è la
           schermata finale del quiz LIVE (student.html, #done): 🎉, «Hai finito!»,
           il riquadro delle risposte e, accanto, il 💾 per salvare la scheda con
           tutte le domande e le risposte (`o.onSalva`, lo collega chi monta) */
        if (cfg.semplice) {
            var nn = p.conteggio || {};
            var fine = document.createElement('div'); fine.className = 'sc-fine';
            fine.innerHTML = '<div class="sc-fine__big">🎉</div>' +
                '<h2>' + esc(_t(t, 'sc_finito', 'Hai finito!')) + '</h2>' +
                '<div class="sc-fine__top"><div class="sc-fine__recap">' + esc(_t(t, 'sc_risposte', 'Risposte:')) + ' <b>' + (nn.scritte || 0) + '</b> / ' + (nn.totale || 0) + '</div></div>' +
                '<p>' + esc(_t(t, 'sc_finito_d', 'Consegnato. Puoi salvare le tue risposte.')) + '</p>';
            if (typeof o.onSalva === 'function') {
                var salvaB = document.createElement('button');
                salvaB.type = 'button'; salvaB.className = 'sc-fine__salva'; salvaB.textContent = '💾';
                salvaB.setAttribute('aria-label', _t(t, 'sc_salva', 'Salva le mie risposte'));
                salvaB.title = _t(t, 'sc_salva', 'Salva le mie risposte');
                salvaB.onclick = function () { o.onSalva(); };
                fine.querySelector('.sc-fine__top').appendChild(salvaB);
            }
            host.appendChild(fine);
            /* 0126, gate del 25/10 (Giacomo): «Hai finito!» largo la frazione `titoloLargo` di chi
               monta (sull'iPad il 70% del pannello) e l'emoji cresce nella stessa proporzione; come
               `fitTitolo` del quiz LIVE (student.html), che lo porta al 90% dello schermo: si misura
               a 100px e si scala. Senza l'opzione restano le misure del CSS. */
            if (o.titoloLargo > 0) {
                var h2 = fine.querySelector('h2'), big = fine.querySelector('.sc-fine__big');
                var adatta = function () {
                    if (!fine.isConnected) { window.removeEventListener('resize', adatta); return; }
                    h2.style.whiteSpace = 'nowrap'; h2.style.fontSize = '100px';
                    var w = h2.scrollWidth, W = host.clientWidth;
                    if (!(w > 0 && W > 0)) return;
                    var fs = Math.max(22, Math.floor(100 * o.titoloLargo * W / w));
                    h2.style.fontSize = fs + 'px';
                    /* l'emoji cresce col titolo, ma non oltre un quinto dell'altezza di chi monta (gate
                       del 25/10: nel pannello in verticale, largo e basso, «Risposte» e il 💾 andavano sotto) */
                    var e = 64 * fs / 22, H = host.clientHeight;
                    if (H > 0) e = Math.min(e, H * 0.2);
                    big.style.fontSize = Math.round(e) + 'px';
                };
                adatta();
                window.addEventListener('resize', adatta);
            }
            return;
        }
        var wrap = document.createElement('div'); wrap.className = 'sc-wrap';
        var box = document.createElement('div'); box.className = 'sc-esito';
        wrap.appendChild(box); host.appendChild(wrap);

        var h = document.createElement('h2');
        h.textContent = _t(t, 'sc_fatto', 'Consegnato');
        box.appendChild(h);
        var n = p.conteggio || {};
        var sub = document.createElement('p');
        sub.textContent = _t(t, 'sc_fatto_d', '{n} risposte scritte su {tot} domande.')
            .replace('{n}', n.scritte || 0).replace('{tot}', n.totale || 0);
        box.appendChild(sub);

        if (cfg.reveal && p.righe && p.righe.length) {
            var titolo = document.createElement('p');
            titolo.innerHTML = '<b>' + esc(_t(t, 'sc_profilo', 'Le domande che hai scelto avevano questi tagli')) + '</b>';
            box.appendChild(titolo);
            var max = Math.max.apply(null, p.righe.map(function (r) { return r.totale || 0; })) || 1;
            p.righe.forEach(function (r) {
                var riga = document.createElement('div');
                riga.className = 'sc-riga' + (r.scelte ? '' : ' zero');
                riga.innerHTML = '<span class="n">' + esc(etAngolo(t, r.angle)) + '</span>' +
                    '<span class="sc-barra"><i style="width:' + Math.round(100 * (r.scelte / max)) + '%"></i></span>' +
                    '<span class="v">' + r.scelte + '/' + r.totale + '</span>';
                box.appendChild(riga);
            });
            if (p.maiPresi && p.maiPresi.length) {
                var mp = document.createElement('p');
                mp.style.marginTop = '12px';
                mp.textContent = _t(t, 'sc_mai', 'Non hai preso nessuna domanda di questo taglio: {a}.')
                    .replace('{a}', p.maiPresi.map(function (a) { return etAngolo(t, a); }).join(', '));
                box.appendChild(mp);
            }
        }

        /* «perché no?» e il secondo giro: due passi IN PIÙ, e si vedono solo se
           il docente li ha accesi. Il primo chiede una riga, il secondo riapre
           UNA domanda — non l'elenco intero, o sarebbe un secondo compito. */
        if (o.evitata && (cfg.perche_no || cfg.secondo_giro)) {
            var sep = document.createElement('p');
            sep.style.marginTop = '18px';
            sep.innerHTML = '<b>' + esc(_t(t, 'sc_evitata', 'Una che non hai preso')) + '</b>';
            box.appendChild(sep);
            var q = document.createElement('div');
            q.className = 'sc-q'; q.style.marginBottom = '12px';
            q.innerHTML = '<div class="sc-take" style="cursor:default"><span class="sc-txt">' + esc(o.evitata.testo) + '</span></div>';
            box.appendChild(q);

            if (cfg.perche_no) {
                var lb = document.createElement('div'); lb.className = 'sc-lbl';
                lb.textContent = _t(t, 'sc_perche_no', 'Perché questa no?');
                var inp = document.createElement('input');
                inp.className = 'sc-nota'; inp.type = 'text';
                inp.setAttribute('aria-label', _t(t, 'sc_perche_no', 'Perché questa no?'));
                inp.oninput = function () { if (o.onPercheNo) o.onPercheNo(o.evitata.id, inp.value); };
                box.appendChild(lb); box.appendChild(inp);
            }
            if (cfg.secondo_giro && o.onSecondoGiro) {
                var b2 = document.createElement('button');
                b2.type = 'button'; b2.className = 'sc-go'; b2.style.marginTop = '14px';
                b2.textContent = _t(t, 'sc_secondo', 'Prova a rispondere anche a questa');
                b2.onclick = function () { o.onSecondoGiro(o.evitata); };
                box.appendChild(b2);
            }
        }
    }

    window.MappAISceltaView = { monta: monta, mostraEsito: mostraEsito, etAngolo: etAngolo, etChip: etChip, CSS: CSS };
}());
