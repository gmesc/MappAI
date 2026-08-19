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
        '.sc-wrap{display:flex;flex-direction:column;height:100%;min-height:0;background:#fafbff;color:#0f172a}',
        '.sc-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px max(16px,env(safe-area-inset-left));background:#fff;border-bottom:1px solid #e2e8f0}',
        '.sc-cnt{font-size:13px;font-weight:700;color:#334155}',
        '.sc-cnt b{color:#4f46e5}',
        '.sc-cnt.ko b{color:#b45309}',
        '.sc-hint{font-size:12px;color:#475569;flex:1;min-width:140px}',
        '.sc-list{flex:1;overflow-y:auto;padding:16px max(16px,env(safe-area-inset-right)) 24px max(16px,env(safe-area-inset-left))}',
        '.sc-ramo{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:18px 0 8px}',
        '.sc-ramo:first-child{margin-top:0}',
        '.sc-q{background:#fff;border:2px solid #e2e8f0;border-radius:14px;margin-bottom:10px;overflow:hidden}',
        '.sc-q.on{border-color:#4f46e5}',
        '.sc-take{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;background:none;border:0;padding:14px 16px;min-height:56px;font:inherit;color:inherit;cursor:pointer}',
        '.sc-take:focus-visible{outline:3px solid #6366f1;outline-offset:-3px}',
        '.sc-mark{flex:0 0 auto;width:26px;height:26px;border-radius:8px;border:2px solid #cbd5e1;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;background:#fff}',
        '.sc-q.on .sc-mark{background:#4f46e5;border-color:#4f46e5}',
        '.sc-txt{flex:1;font-size:16px;line-height:1.45}',
        '.sc-body{padding:0 16px 16px;border-top:1px solid #eef2ff}',
        '.sc-lbl{font-size:12px;font-weight:700;color:#475569;margin:14px 0 6px}',
        '.sc-ta{width:100%;min-height:110px;padding:12px 14px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;color:#0f172a;font-size:16px;line-height:1.5;resize:vertical}',
        '.sc-ta:focus{border-color:#6366f1;outline:none}',
        '.sc-opt{display:block;width:100%;text-align:left;padding:13px 15px;margin-bottom:8px;min-height:48px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;font-size:16px;color:#0f172a}',
        '.sc-opt[aria-checked="true"]{border-color:#4f46e5;background:#eef2ff;font-weight:700}',
        '.sc-chips{display:flex;flex-wrap:wrap;gap:8px}',
        '.sc-chip{min-height:44px;padding:10px 14px;border-radius:999px;border:2px solid #e2e8f0;background:#fff;font-size:13px;font-weight:700;color:#334155}',
        '.sc-chip[aria-pressed="true"]{border-color:#4f46e5;background:#eef2ff;color:#4f46e5}',
        '.sc-nota{width:100%;padding:10px 12px;border-radius:10px;border:2px solid #e2e8f0;background:#fff;font-size:14px;color:#0f172a}',
        '.sc-nota:focus{border-color:#6366f1;outline:none}',
        '.sc-foot{padding:12px max(16px,env(safe-area-inset-left)) max(14px,env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e2e8f0;display:flex;flex-direction:column;gap:10px}',
        /* Le osservazioni stanno in fondo e si scrivono ALLA FINE: da aperte
           costavano 74px di schermo mentre si sta ancora scegliendo (misurato:
           il piè si prendeva il 30% di un telefono). Nascono su una riga e
           crescono con quello che si scrive. */
        '.sc-oss{width:100%;min-height:44px;max-height:180px;padding:11px 13px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;font-size:15px;line-height:1.5;resize:vertical;field-sizing:content}',
        '.sc-oss:focus{border-color:#6366f1;outline:none}',
        '.sc-go{width:100%;min-height:52px;border-radius:12px;background:#4f46e5;color:#fff;font-size:17px;font-weight:700}',
        '.sc-go[disabled]{opacity:.55}',
        '.sc-esito{flex:1;overflow-y:auto;padding:24px max(20px,env(safe-area-inset-left))}',
        '.sc-esito h2{font-size:20px;font-weight:700;margin-bottom:6px}',
        '.sc-esito p{color:#475569;font-size:14px;line-height:1.6;margin-bottom:14px}',
        '.sc-riga{display:flex;align-items:center;gap:10px;margin-bottom:8px}',
        '.sc-riga .n{font-size:13px;font-weight:700;color:#334155;flex:0 0 132px}',
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
        '.sc-nav__b{flex:0 0 auto;width:64px;min-height:48px;border-radius:12px;border:2px solid #e2e8f0;background:#fff;font-size:22px;font-weight:700;color:#4f46e5}',
        '.sc-nav__b[disabled]{opacity:.4;color:#94a3b8}',
        '.sc-nav__n{flex:1;text-align:center;font-size:14px;font-weight:700;color:#334155}',
        '.sc-go--quieto{background:#fff;color:#4f46e5;border:2px solid #e2e8f0}'
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
        /* le domande LASCIATE: la risposta non si butta, esce dal conteggio.
           Riprendendo la domanda torna dov'era — buttarla sarebbe l'unico gesto
           di questa schermata che distrugge del lavoro. */
        stato.bozze = stato.bozze || {};
        var onCambia = o.onCambia || function () { };
        var onConsegna = o.onConsegna || function () { };
        var chiedi = o.chiedi || function (testo) { return Promise.resolve(window.confirm(testo)); };

        /* Il percorso serve? Lo dice il core guardando le aree, non un flag. */
        var conPassi = S().passiUtili(pool, cfg);
        if (!stato.fase) stato.fase = conPassi ? 'aree' : 'scegli';
        /* uno stato vecchio può dire «aree» su un vault che aree non ne ha:
           lasciarlo lì vorrebbe dire una schermata vuota senza uscita */
        if (!conPassi && stato.fase === 'aree') stato.fase = 'scegli';

        var wrap, top, cnt, hint, list, foot;
        var iRisposta = 0;                      /* la domanda corrente nel passo ③ */

        /* ── il salvataggio: si accumula e si manda dopo una pausa ────────────
           Un colpo di rete per tasto premuto è quello che rende una pagina
           inutilizzabile su una LAN di scuola. 600ms è l'attesa di una pausa
           vera nella scrittura, non di un carattere. */
        var attese = {};
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
            top.appendChild(cnt); top.appendChild(hint);
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
                    esc(_t(t, 'sc_aree_scelte', 'argomenti')) +
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
                    ? _t(t, 'sc_ko_aree', 'Hai scelto {n} argomenti su {m} consigliati.').replace('{n}', m.scelte).replace('{m}', m.minimo)
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
            hint.textContent = _t(t, 'sc_hint_leggi', 'Leggi ogni domanda e dì che cosa ti fa venire in mente. Poi prendi quelle a cui vuoi rispondere.');
            var vive = attivo();
            function conta() {
                var n = S().conteggio(vive, stato);
                cnt.className = 'sc-cnt' + (n.scelte < cfg.minimo ? ' ko' : '');
                cnt.innerHTML = esc(_t(t, 'sc_lette', 'Lette')) + ': <b>' + n.lette + '</b>/' + n.totale +
                    ' · ' + esc(_t(t, 'sc_scelte', 'scelte')) + ': <b>' + n.scelte + '</b>' +
                    (cfg.minimo ? ' ' + esc(_t(t, 'sc_su_minimo', 'su')) + ' ' + cfg.minimo : '');
                return n;
            }
            if (conPassi) top.appendChild(comando('‹ ' + _t(t, 'sc_cambia_aree', 'Cambia argomenti'), function () { vaiA('aree'); }));

            function card(v) {
                var art = document.createElement('article');
                art.className = 'sc-q'; art.setAttribute('data-id', v.id);
                var take = document.createElement('button');
                take.type = 'button'; take.className = 'sc-take';
                take.setAttribute('aria-expanded', 'false');
                take.innerHTML = '<span class="sc-mark" aria-hidden="true"></span><span class="sc-txt">' + esc(v.testo) + '</span>';
                var body = document.createElement('div'); body.className = 'sc-body'; body.hidden = true;
                art.appendChild(take); art.appendChild(body);

                function dipingi() {
                    var presa = !!stato.risposte[v.id];
                    var l = stato.letture[v.id];
                    art.classList.toggle('on', presa);
                    art.classList.toggle('letta', !!(l && l.chip));
                    take.querySelector('.sc-mark').textContent = presa ? '✓' : (l && l.chip ? '·' : '');
                }
                /* il tocco APRE, non prende: aprire è considerarla, ed è il
                   gesto che questa attività vuole far fare con calma */
                take.onclick = function () {
                    var chiuso = body.hidden;
                    if (chiuso && !body.childNodes.length) corpo();
                    body.hidden = !chiuso;
                    take.setAttribute('aria-expanded', chiuso ? 'true' : 'false');
                };

                function corpo() {
                    var l = stato.letture[v.id] || {};
                    var lc = document.createElement('div'); lc.className = 'sc-lbl';
                    lc.textContent = _t(t, 'sc_richiamo', 'Che cosa ti fa venire in mente?');
                    body.appendChild(lc);
                    var chips = document.createElement('div'); chips.className = 'sc-chips';
                    S().CHIP.forEach(function (k) {
                        var c = document.createElement('button');
                        c.type = 'button'; c.className = 'sc-chip';
                        c.setAttribute('aria-pressed', String(l.chip === k));
                        c.textContent = etChip(t, k);
                        c.onclick = function () {
                            var ll = stato.letture[v.id] || (stato.letture[v.id] = {});
                            ll.chip = (ll.chip === k) ? '' : k;      /* secondo tocco = tolgo */
                            chips.querySelectorAll('.sc-chip').forEach(function (x, xi) {
                                x.setAttribute('aria-pressed', String(S().CHIP[xi] === ll.chip));
                            });
                            dipingi(); conta(); salva(v.id, true);
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

                    var pre = bottone('', function () {
                        if (stato.risposte[v.id]) {
                            stato.bozze[v.id] = stato.risposte[v.id];
                            delete stato.risposte[v.id];
                        } else {
                            stato.risposte[v.id] = stato.bozze[v.id] || {};
                            delete stato.bozze[v.id];
                        }
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
            conta();
            foot.appendChild(bottone(_t(t, 'sc_comincia', 'Comincia a rispondere'), function () {
                var n = S().conteggio(vive, stato);
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
                foot.appendChild(bottone('‹ ' + _t(t, 'sc_torna_scegli', 'Torna alle domande'), function () { vaiA('scegli'); }, 'sc-go sc-go--quieto'));
                return;
            }
            if (iRisposta >= mie.length) iRisposta = mie.length - 1;
            if (iRisposta < 0) iRisposta = 0;
            var v = mie[iRisposta];
            var r = stato.risposte[v.id] || (stato.risposte[v.id] = {});

            hint.textContent = '';
            cnt.innerHTML = esc(_t(t, 'sc_di', 'Domanda')) + ' <b>' + (iRisposta + 1) + '</b> ' +
                esc(_t(t, 'sc_su', 'di')) + ' ' + mie.length;
            top.appendChild(comando('‹ ' + _t(t, 'sc_torna_scegli', 'Torna alle domande'), function () { vaiA('scegli'); }));

            var q = document.createElement('div'); q.className = 'sc-dom';
            q.textContent = v.testo;
            list.appendChild(q);
            if (v.traccia) {
                var tr = document.createElement('div'); tr.className = 'sc-lbl';
                tr.textContent = v.traccia; list.appendChild(tr);
            }

            /* IL CAMPO DELLA RISPOSTA è l'unica cosa che cambia fra i due
               generi: una casella dove scrivere, o le opzioni da toccare. */
            if (v.tipo === 'mc') {
                (v.opzioni || []).forEach(function (testo, oi) {
                    var b = document.createElement('button');
                    b.type = 'button'; b.className = 'sc-opt'; b.setAttribute('role', 'radio');
                    b.setAttribute('aria-checked', String(r.scelta === oi));
                    b.textContent = testo;
                    b.onclick = function () {
                        r.scelta = oi;
                        list.querySelectorAll('.sc-opt').forEach(function (x, xi) { x.setAttribute('aria-checked', String(xi === oi)); });
                        salva(v.id, true);
                    };
                    list.appendChild(b);
                });
            } else {
                var ta = document.createElement('textarea');
                ta.className = 'sc-ta'; ta.value = r.testo || '';
                ta.setAttribute('aria-label', _t(t, 'sc_aria_risposta', 'La tua risposta'));
                ta.oninput = function () { r.testo = ta.value; salva(v.id); };
                list.appendChild(ta);
            }

            if (cfg.autovalutazione) {
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
                eco.textContent = _t(t, 'sc_eco', 'Leggendola avevi detto:') + ' ' + etChip(t, l.chip);
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
            foot.appendChild(bottone(_t(t, 'sc_consegna', 'Consegna'), function () {
                var v2 = S().validaConsegna(attivo(), stato, cfg);
                if (v2.ok) return onConsegna(stato);
                var righe = v2.motivi.map(function (m) {
                    if (m.id === 'sotto_minimo') return _t(t, 'sc_ko_min', 'Hai scritto {n} risposte su {m} chieste.').replace('{n}', m.scritte).replace('{m}', m.minimo);
                    return _t(t, 'sc_ko_vuote', 'Hai preso {n} domande senza rispondere.').replace('{n}', m.quante);
                });
                Promise.resolve(chiedi(righe.join('\n') + '\n\n' + _t(t, 'sc_ko_ok', 'Consegni lo stesso?')))
                    .then(function (si) { if (si) onConsegna(stato); });
            }));
        }

        function disegna() {
            scheletro();
            if (!pool.length) {
                vuoto(_t(t, 'sc_pool_vuoto', 'Non ci sono ancora domande per questa mappa. Generale con «Genera materiali», poi torna qui.'));
                return;
            }
            if (stato.fase === 'aree') return passoAree();
            if (stato.fase === 'rispondi') return passoRispondi();
            return passoScegli();
        }

        disegna();
        return {
            /* il chiamante può forzare il ridisegno quando lo stato cambia da
               fuori (il rientro, il secondo giro) */
            aggiorna: disegna,
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
