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
        '.sc-vuoto{color:#64748b;font-size:15px;text-align:center;padding:40px 10px;line-height:1.6}'
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
    function etChip(t, k) {
        return {
            so: _t(t, 'sc_chip_so', 'la so'),
            curioso: _t(t, 'sc_chip_curioso', 'mi incuriosisce'),
            chiara: _t(t, 'sc_chip_chiara', 'è più chiara'),
            altre_oscure: _t(t, 'sc_chip_altre', 'le altre non le capisco')
        }[k] || k;
    }
    function etAngolo(t, k) {
        if (!k) return _t(t, 'sc_ang_ignoto', 'taglio non dichiarato');
        if (k === 'auto') return _t(t, 'sc_ang_misto', 'misto');
        if (window.quizAngleLabel) { try { return window.quizAngleLabel(k); } catch (e) { } }
        return k;
    }

    /* ══ MONTAGGIO ══════════════════════════════════════════════════════════ */
    function monta(host, o) {
        css();
        o = o || {};
        var t = o.t;
        var cfg = S().normalizzaCfg(o.cfg);
        var pool = (o.pool || []).slice();
        var stato = o.stato || {};
        stato.risposte = stato.risposte || {};
        /* le domande LASCIATE: la risposta non si butta, esce dal conteggio.
           Riprendendo la domanda torna dov'era — buttarla sarebbe l'unico gesto
           di questa schermata che distrugge del lavoro. */
        stato.bozze = stato.bozze || {};
        var onCambia = o.onCambia || function () { };
        var onConsegna = o.onConsegna || function () { };
        var chiedi = o.chiedi || function (testo) { return Promise.resolve(window.confirm(testo)); };

        host.innerHTML = '';
        var wrap = document.createElement('div'); wrap.className = 'sc-wrap';
        var top = document.createElement('div'); top.className = 'sc-top';
        var cnt = document.createElement('div'); cnt.className = 'sc-cnt';
        var hint = document.createElement('div'); hint.className = 'sc-hint';
        hint.textContent = _t(t, 'sc_hint', 'Leggi tutte le domande e scegli quelle a cui vuoi rispondere.');
        top.appendChild(cnt); top.appendChild(hint);
        var list = document.createElement('div'); list.className = 'sc-list';
        var foot = document.createElement('div'); foot.className = 'sc-foot';
        wrap.appendChild(top); wrap.appendChild(list); wrap.appendChild(foot);
        host.appendChild(wrap);

        if (!pool.length) {
            list.innerHTML = '<div class="sc-vuoto">' +
                esc(_t(t, 'sc_pool_vuoto', 'Non ci sono ancora domande per questa mappa. Generale con «Genera materiali», poi torna qui.')) + '</div>';
            return { aggiorna: function () { } };
        }

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

        function conta() {
            var n = S().conteggio(pool, stato);
            var sotto = n.scritte < cfg.minimo;
            cnt.className = 'sc-cnt' + (sotto ? ' ko' : '');
            cnt.innerHTML = esc(_t(t, 'sc_scelte', 'Scelte')) + ': <b>' + n.scelte + '</b> · ' +
                esc(_t(t, 'sc_scritte', 'scritte')) + ': <b>' + n.scritte + '</b>' +
                (cfg.minimo ? ' · ' + esc(_t(t, 'sc_minimo', 'minimo')) + ' ' + cfg.minimo : '');
            return n;
        }

        /* ── una domanda ─────────────────────────────────────────────────────
           La card è chiusa finché non la si prende: l'elenco resta leggibile
           anche con quaranta domande, ed è quello che si scorre per scegliere. */
        function card(v) {
            var art = document.createElement('article');
            art.className = 'sc-q'; art.setAttribute('data-id', v.id);
            var take = document.createElement('button');
            take.type = 'button'; take.className = 'sc-take';
            take.setAttribute('aria-pressed', 'false');
            take.innerHTML = '<span class="sc-mark" aria-hidden="true"></span><span class="sc-txt">' + esc(v.testo) + '</span>';
            var body = document.createElement('div'); body.className = 'sc-body'; body.hidden = true;
            art.appendChild(take); art.appendChild(body);

            function presa() { return !!stato.risposte[v.id]; }
            function dipingi() {
                var on = presa();
                art.classList.toggle('on', on);
                take.setAttribute('aria-pressed', on ? 'true' : 'false');
                take.querySelector('.sc-mark').textContent = on ? '✓' : '';
                body.hidden = !on;
            }

            take.onclick = function () {
                if (presa()) {
                    stato.bozze[v.id] = stato.risposte[v.id];
                    delete stato.risposte[v.id];
                } else {
                    stato.risposte[v.id] = stato.bozze[v.id] || {};
                    delete stato.bozze[v.id];
                    if (!body.childNodes.length) corpo();
                }
                dipingi(); conta(); salva(v.id, true);
            };

            function corpo() {
                var r = stato.risposte[v.id] || {};
                /* IL CAMPO DELLA RISPOSTA è l'unica cosa che cambia fra i due
                   generi: una casella dove scrivere, o le opzioni da toccare.
                   Tutto il resto — scelta, chip, contatore — è identico, ed è
                   la ragione per cui questa view è una sola. */
                if (v.tipo === 'mc') {
                    var lab = document.createElement('div'); lab.className = 'sc-lbl';
                    lab.textContent = _t(t, 'sc_scegli_opzione', 'La tua risposta');
                    body.appendChild(lab);
                    (v.opzioni || []).forEach(function (testo, oi) {
                        var b = document.createElement('button');
                        b.type = 'button'; b.className = 'sc-opt'; b.setAttribute('role', 'radio');
                        b.setAttribute('aria-checked', String(r.scelta === oi));
                        b.textContent = testo;
                        b.onclick = function () {
                            var rr = stato.risposte[v.id]; if (!rr) return;
                            rr.scelta = oi;
                            body.querySelectorAll('.sc-opt').forEach(function (x, xi) { x.setAttribute('aria-checked', String(xi === oi)); });
                            conta(); salva(v.id, true);
                        };
                        body.appendChild(b);
                    });
                } else {
                    if (v.traccia) {
                        var tr = document.createElement('div'); tr.className = 'sc-lbl';
                        tr.textContent = v.traccia; body.appendChild(tr);
                    }
                    var ta = document.createElement('textarea');
                    ta.className = 'sc-ta'; ta.value = r.testo || '';
                    ta.setAttribute('aria-label', _t(t, 'sc_aria_risposta', 'La tua risposta'));
                    ta.oninput = function () {
                        var rr = stato.risposte[v.id]; if (!rr) return;
                        rr.testo = ta.value; conta(); salva(v.id);
                    };
                    body.appendChild(ta);
                }

                /* «perché questa?»: quattro chip, perché sul telefono una
                   riflessione per domanda si scrive solo se costa un tocco. */
                var lc = document.createElement('div'); lc.className = 'sc-lbl';
                lc.textContent = _t(t, 'sc_perche', 'Perché hai scelto questa?');
                body.appendChild(lc);
                var chips = document.createElement('div'); chips.className = 'sc-chips';
                S().CHIP.forEach(function (k) {
                    var c = document.createElement('button');
                    c.type = 'button'; c.className = 'sc-chip';
                    c.setAttribute('aria-pressed', String(r.chip === k));
                    c.textContent = etChip(t, k);
                    c.onclick = function () {
                        var rr = stato.risposte[v.id]; if (!rr) return;
                        rr.chip = (rr.chip === k) ? '' : k;      /* secondo tocco = tolgo */
                        chips.querySelectorAll('.sc-chip').forEach(function (x, xi) {
                            x.setAttribute('aria-pressed', String(S().CHIP[xi] === rr.chip));
                        });
                        salva(v.id, true);
                    };
                    chips.appendChild(c);
                });
                body.appendChild(chips);

                var nota = document.createElement('input');
                nota.className = 'sc-nota'; nota.type = 'text'; nota.value = r.nota || '';
                nota.placeholder = _t(t, 'sc_nota_ph', '…oppure scrivilo con parole tue (facoltativo)');
                nota.setAttribute('aria-label', _t(t, 'sc_perche', 'Perché hai scelto questa?'));
                nota.style.marginTop = '8px';
                nota.oninput = function () {
                    var rr = stato.risposte[v.id]; if (!rr) return;
                    rr.nota = nota.value; salva(v.id);
                };
                body.appendChild(nota);

                if (cfg.autovalutazione) {
                    var la = document.createElement('div'); la.className = 'sc-lbl';
                    la.textContent = _t(t, 'sc_auto', 'Quanto ti senti sicuro di questa risposta?');
                    body.appendChild(la);
                    var box = document.createElement('div'); box.className = 'sc-chips';
                    [[3, _t(t, 'sc_auto_3', 'sicuro')], [2, _t(t, 'sc_auto_2', 'così così')], [1, _t(t, 'sc_auto_1', 'ho tirato a indovinare')]]
                        .forEach(function (p) {
                            var b = document.createElement('button');
                            b.type = 'button'; b.className = 'sc-chip';
                            b.setAttribute('aria-pressed', String(r.auto === p[0]));
                            b.textContent = p[1];
                            b.onclick = function () {
                                var rr = stato.risposte[v.id]; if (!rr) return;
                                rr.auto = p[0];
                                box.querySelectorAll('.sc-chip').forEach(function (x, xi) {
                                    x.setAttribute('aria-pressed', String([3, 2, 1][xi] === rr.auto));
                                });
                                salva(v.id, true);
                            };
                            box.appendChild(b);
                        });
                    body.appendChild(box);
                }
            }

            if (presa()) { corpo(); }
            dipingi();
            return art;
        }

        /* L'elenco: per macro-area se il docente l'ha chiesto — che è il modo in
           cui la mappa è fatta — altrimenti di fila. */
        if (cfg.perRamo) {
            S().perRamo(pool).forEach(function (g) {
                var h = document.createElement('div'); h.className = 'sc-ramo';
                h.textContent = g.ramo || _t(t, 'sc_senza_ramo', 'Altre domande');
                list.appendChild(h);
                g.domande.forEach(function (v) { list.appendChild(card(v)); });
            });
        } else {
            pool.forEach(function (v) { list.appendChild(card(v)); });
        }

        /* ── il piè: le osservazioni e la consegna ────────────────────────── */
        if (cfg.osservazioni) {
            var lo = document.createElement('div'); lo.className = 'sc-lbl';
            lo.style.margin = '0';
            /* ⚠️ L'invito sta nell'ETICHETTA, non nel segnaposto: con
               `field-sizing: content` è il contenuto a dare l'altezza, e un
               segnaposto di due righe faceva nascere il campo alto 94px —
               un terzo di telefono occupato da un invito, mentre si sta ancora
               scegliendo. Misurato: 94 → 44. */
            lo.textContent = _t(t, 'sc_oss', 'Osservazioni — perché proprio queste? (facoltativo)');
            var oss = document.createElement('textarea');
            oss.className = 'sc-oss'; oss.value = stato.note || '';
            oss.rows = 1;
            oss.setAttribute('aria-label', _t(t, 'sc_oss', 'Osservazioni — perché proprio queste? (facoltativo)'));
            oss.oninput = function () { stato.note = oss.value; salva('__note'); };
            foot.appendChild(lo); foot.appendChild(oss);
        }
        var go = document.createElement('button');
        go.type = 'button'; go.className = 'sc-go';
        go.textContent = _t(t, 'sc_consegna', 'Consegna');
        go.onclick = function () {
            var v = S().validaConsegna(pool, stato, cfg);
            if (v.ok) return onConsegna(stato);
            /* Non è un divieto: si dice che cosa manca e si lascia decidere.
               Bloccare la consegna vorrebbe dire tenere in ostaggio un lavoro
               che è comunque suo. */
            var righe = v.motivi.map(function (m) {
                if (m.id === 'sotto_minimo') return _t(t, 'sc_ko_min', 'Hai scritto {n} risposte su {m} chieste.').replace('{n}', m.scritte).replace('{m}', m.minimo);
                return _t(t, 'sc_ko_vuote', 'Hai preso {n} domande senza rispondere.').replace('{n}', m.quante);
            });
            Promise.resolve(chiedi(righe.join('\n') + '\n\n' + _t(t, 'sc_ko_ok', 'Consegni lo stesso?')))
                .then(function (si) { if (si) onConsegna(stato); });
        };
        foot.appendChild(go);

        conta();
        return {
            /* il chiamante può forzare il ridisegno del contatore quando le
               risposte cambiano da fuori (il rientro, il secondo giro) */
            aggiorna: conta,
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
