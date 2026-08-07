/* OFFICINA DEI MODALI — comportamento della pagina.
 * La pagina è generata da tools/officina/build.js; questo file è scritto a mano
 * perché è codice, non contenuto. Legge il core e il motore VERI dell'app.
 */
(function () {
    'use strict';
    var Core = window.MappAIModalCore, Modal = window.MappAIModal;
    if (!Core || !Modal) { console.error('[officina] core o motore mancanti'); return; }

    var KEY = 'officina_token';
    var T = {
        accento: '#4f46e5', accentoTenue: '#eef2ff', distruttivo: '#dc2626',
        testo: '#0f172a', testo2: '#475569', testo3: '#64748b',
        bordo: '#e2e8f0', fondoSez: '#f8fafc', fondo: '#ffffff',
        rBox: 16, rCampo: 10, rBtn: 10, pad: 22, gap: 12, ico: 20, btnFs: 14, btnGap: 8,
        btncase: 'none', label: 'dentro', icoScelta: '20',
        arch: {}   /* id archetipo → { taglia, layout } */
    };
    try { var r = localStorage.getItem(KEY); if (r) { var o = JSON.parse(r); for (var k in o) if (k in T) T[k] = o[k]; } } catch (e) { }
    function salva() { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch (e) { } }

    /* ── verdetti (§0 e §4) e assegnazioni (§5): lo stato della procedura ── */
    var KEYV = 'officina_verdetti', KEYA = 'officina_assegnazioni';
    var V = {}; try { var rv = localStorage.getItem(KEYV); if (rv) V = JSON.parse(rv) || {}; } catch (e) { }
    var A = {}; try { var ra = localStorage.getItem(KEYA); if (ra) A = JSON.parse(ra) || {}; } catch (e) { }
    function salvaV() { try { localStorage.setItem(KEYV, JSON.stringify(V)); } catch (e) { } }
    function salvaA() { try { localStorage.setItem(KEYA, JSON.stringify(A)); } catch (e) { } }
    var ITEMS = window.MM_VERD_ITEMS || [], REGISTRO = window.MM_REGISTRO || [], GRUPPI = window.MM_GRUPPI || [];
    function eschtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    /* ── i token diventano variabili CSS: pezzi, archetipi e uscita si
          aggiornano tutti dalla stessa fonte ─────────────────────────────── */
    function applicaToken() {
        var s = document.documentElement.style;
        s.setProperty('--mm-accent', T.accento);
        s.setProperty('--mm-accent-soft', T.accentoTenue);
        s.setProperty('--mm-danger', T.distruttivo);
        s.setProperty('--mm-testo', T.testo);
        s.setProperty('--mm-testo-2', T.testo2);
        s.setProperty('--mm-testo-3', T.testo3);
        s.setProperty('--mm-bordo', T.bordo);
        s.setProperty('--mm-fondo-sez', T.fondoSez);
        s.setProperty('--mm-r-box', T.rBox + 'px');
        s.setProperty('--mm-r-campo', T.rCampo + 'px');
        s.setProperty('--mm-r-btn', T.rBtn + 'px');
        s.setProperty('--mm-pad', T.pad + 'px');
        s.setProperty('--mm-gap', T.gap + 'px');
        s.setProperty('--mm-icona', T.ico + 'px');
        s.setProperty('--mm-icona-head', (T.icoScelta === 'uguale' ? T.ico : T.ico + 4) + 'px');
        s.setProperty('--mm-btn-fs', T.btnFs + 'px');
        s.setProperty('--mm-btn-gap', T.btnGap + 'px');

        var reg = document.getElementById('off-dinamico') || (function () {
            var st = document.createElement('style'); st.id = 'off-dinamico';
            document.head.appendChild(st); return st;
        })();
        reg.textContent = T.btncase === 'uppercase'
            ? '.mm-btn { text-transform:uppercase; letter-spacing:.2em; }'
            : '.mm-btn { text-transform:none; letter-spacing:normal; }';

        Modal.stile.etichette = T.label;
        salva();
    }

    /* ── contrasti ─────────────────────────────────────────────────────── */
    function disegnaContrasti() {
        var v = Core.verificaPaletta(T);
        var tb = document.getElementById('tab-contr');
        tb.innerHTML = v.esiti.map(function (e) {
            return '<tr><td>' + e.nome + '</td>' +
                '<td class="n ' + (e.ok ? 'ok' : 'ko') + '">' + (e.valore === null ? '—' : e.valore.toFixed(2)) + ':1</td>' +
                '<td style="width:1%"><span class="pill ' + (e.ok ? 'ok' : 'ko') + '">' + (e.ok ? 'ok' : 'sotto ' + e.soglia) + '</span></td></tr>';
        }).join('');
        var es = document.getElementById('contr-esito');
        es.textContent = v.falliti ? '— ' + v.falliti + ' sotto soglia' : '— tutti sopra soglia';
        es.style.color = v.falliti ? '#c2410c' : '#047857';
    }

    /* ── misure dei pezzi: lette dal layout, non dichiarate ────────────── */
    function misuraPezzi() {
        var b = document.querySelector('.pezzo .mm-btn--primario');
        var c = document.querySelector('.pezzo .mm-campo');
        if (b) {
            var h = Math.round(b.getBoundingClientRect().height);
            var ok = Core.bersaglioOk(h);
            document.getElementById('mis-btn').innerHTML =
                'altezza ' + h + 'px · corpo ' + getComputedStyle(b).fontSize +
                (ok.ok ? ' · bersaglio comodo' : ' · <b>sotto i 44px consigliati per il tocco</b>' + (ok.wcag ? '' : ' e sotto il minimo WCAG di 24px'));
        }
        if (c) {
            var hc = Math.round(c.getBoundingClientRect().height);
            document.getElementById('mis-campo').textContent =
                'altezza ' + hc + 'px · corpo ' + getComputedStyle(c).fontSize + ' · raggio ' + getComputedStyle(c).borderTopLeftRadius;
        }
    }

    /* ── cantiere ──────────────────────────────────────────────────────── */
    var ARCH = window.MM_ARCHETIPI || [];
    var selezionato = ARCH[0] ? ARCH[0].id : null;

    function schemaDi(a) {
        var s = JSON.parse(JSON.stringify(a.schema));
        var scelte = T.arch[a.id] || {};
        if (scelte.taglia) s.taglia = scelte.taglia;
        if (scelte.layout) s.layout = scelte.layout;
        return s;
    }

    function disegnaCantiere() {
        var host = document.getElementById('cantiere-lista');
        host.innerHTML = '';
        ARCH.forEach(function (a) {
            var sc = T.arch[a.id] || {};
            var tg = sc.taglia || a.schema.taglia || 'm';
            var lay = sc.layout || a.schema.layout || 'una';
            var sez = document.createElement('section');
            sez.className = 'arche';
            sez.id = 'arch-' + a.id;
            sez.innerHTML =
                '<div class="arche-h">' +
                '<h4>' + a.nome + '</h4>' +
                '<span class="stato ' + a.stato + '">' + a.stato.replace('-', ' ') + '</span>' +
                '<div class="arche-cmd">' +
                ['s', 'm', 'l', 'xl'].map(function (k) {
                    return '<button type="button" class="mini' + (k === tg ? ' on' : '') + '" data-taglia="' + k + '">' +
                        k.toUpperCase() + ' ' + Core.TAGLIE[k] + '</button>';
                }).join('') +
                ['una', 'due', 'tre', 'cruscotto', 'console'].map(function (k) {
                    return '<button type="button" class="mini' + (k === lay ? ' on' : '') + '" data-layout="' + k + '">' + k + '</button>';
                }).join('') +
                '<button type="button" class="mini" data-apri-modale="1">Apri ▸</button>' +
                '<button type="button" class="mini" data-schema="1">Schema</button>' +
                '</div>' +
                '<p class="q">' + a.quando + '</p></div>' +
                '<div class="palco"></div>' +
                '<div class="istanze"><b>' + a.istanze.length + ' modali di oggi:</b> <code>' +
                a.istanze.join('</code> <code>') + '</code></div>';

            var palco = sez.querySelector('.palco');
            var s = schemaDi(a);
            var check = Core.validaSchema(s);
            palco.appendChild(Modal.render(s));
            if (!check.ok || check.avvisi.length) {
                var av = document.createElement('div');
                av.style.cssText = 'position:absolute';
                var nota = document.createElement('p');
                nota.className = 'istanze';
                nota.style.cssText = 'background:#fff7ed;color:#9a3412;border-top:0';
                nota.innerHTML = (check.errori.concat(check.avvisi)).map(function (x) { return '⚠ ' + x; }).join('<br>');
                sez.insertBefore(nota, palco);
            }

            sez.addEventListener('click', function (e) {
                var b = e.target.closest('button'); if (!b) return;
                if (b.hasAttribute('data-taglia')) {
                    T.arch[a.id] = Object.assign({}, T.arch[a.id], { taglia: b.getAttribute('data-taglia') });
                    salva(); disegnaCantiere(); uscita();
                } else if (b.hasAttribute('data-layout')) {
                    T.arch[a.id] = Object.assign({}, T.arch[a.id], { layout: b.getAttribute('data-layout') });
                    salva(); disegnaCantiere(); uscita();
                } else if (b.hasAttribute('data-apri-modale')) {
                    Modal.open(schemaDi(a)).then(function (r) {
                        console.log('[officina] esito di', a.id, r);
                    });
                } else if (b.hasAttribute('data-schema')) {
                    selezionato = a.id; uscita();
                    document.getElementById('out-schema').scrollIntoView({ block: 'center' });
                }
            });
            host.appendChild(sez);
        });
        if (window.lucide && window.lucide.createIcons) { try { window.lucide.createIcons(); } catch (e) { } }
    }

    /* ── §0 e §4: i verdetti ───────────────────────────────────────────── */
    function statoVerdetti() {
        var el = document.getElementById('verd-stato'); if (!el) return;
        var dati = ITEMS.filter(function (i) { return V[i.id] && V[i.id].esito; });
        var vs = dati.filter(function (i) { return V[i.id].esito === 'validato'; }).length;
        el.textContent = dati.length + ' su ' + ITEMS.length + ' giudicati — ' + vs + ' validati, ' + (dati.length - vs) + ' invalidati';
    }

    function bindVerdetti() {
        document.querySelectorAll('[data-verd]').forEach(function (card) {
            var id = card.getAttribute('data-verd');
            var badge = card.querySelector('.badge-verd');
            var dest = card.querySelector('.verd-dest');
            var nota = card.querySelector('.verd-nota');
            function applica() {
                var s = V[id] || {};
                if (badge) {
                    badge.className = 'badge-verd' + (s.esito ? ' ' + s.esito : '');
                    badge.textContent = s.esito || 'da giudicare';
                }
                card.querySelectorAll('[data-esito]').forEach(function (b) {
                    b.classList.toggle('on-si', s.esito === 'validato' && b.getAttribute('data-esito') === 'validato');
                    b.classList.toggle('on-no', s.esito === 'invalidato' && b.getAttribute('data-esito') === 'invalidato');
                });
            }
            var s0 = V[id] || {};
            if (dest && s0.dest) dest.value = s0.dest;
            if (nota && s0.nota) nota.value = s0.nota;
            applica();
            card.querySelectorAll('[data-esito]').forEach(function (b) {
                b.addEventListener('click', function () {
                    var e = b.getAttribute('data-esito');
                    /* secondo click sullo stesso esito = torna «da giudicare» */
                    V[id] = Object.assign({}, V[id], { esito: (V[id] && V[id].esito === e) ? '' : e });
                    salvaV(); applica(); statoVerdetti(); uscita();
                });
            });
            if (dest) dest.addEventListener('change', function () {
                V[id] = Object.assign({}, V[id], { dest: dest.value }); salvaV(); uscita();
            });
            if (nota) nota.addEventListener('input', function () {
                V[id] = Object.assign({}, V[id], { nota: nota.value }); salvaV(); uscita();
            });
        });
        statoVerdetti();
    }

    /* misure lette dal layout, come per i pezzi: primo bottone/campo della scheda */
    function misuraFamiglie() {
        document.querySelectorAll('[data-verd]').forEach(function (card) {
            var out = card.querySelector('[data-mis]'); if (!out) return;
            var el = card.querySelector('.palchetto button, .palchetto input, .palchetto select, .palchetto textarea');
            if (!el) { out.textContent = ''; return; }
            var h = Math.round(el.getBoundingClientRect().height);
            var cs = getComputedStyle(el);
            var testo = 'altezza ' + h + 'px · corpo ' + cs.fontSize + ' · raggio ' + cs.borderTopLeftRadius;
            if (el.tagName === 'BUTTON' && Core.bersaglioOk && !Core.bersaglioOk(h).ok) testo += ' · sotto i 44px del tocco';
            out.textContent = testo;
        });
    }

    /* ── §5: il registro delle assegnazioni ────────────────────────────── */
    function statoAssegna() {
        var el = document.getElementById('ass-stato'); if (!el) return;
        var n = REGISTRO.filter(function (r) { var v2 = (A[r.id] !== undefined) ? A[r.id] : r.pre; return !!v2; }).length;
        el.textContent = n + ' su ' + REGISTRO.length + ' superfici';
    }

    function disegnaAssegnazioni() {
        var tab = document.getElementById('tab-assegna'); if (!tab) return;
        var opz = GRUPPI.map(function (g) { return '<option value="' + g.id + '">' + eschtml(g.nome) + '</option>'; }).join('');
        tab.innerHTML = '<thead><tr><th>Superficie</th><th>Tipo</th><th>Origine</th><th style="width:270px">Gruppo di stile</th></tr></thead><tbody>' +
            REGISTRO.map(function (r) {
                return '<tr><td>' + eschtml(r.nome) + '</td>' +
                    '<td><span class="tipo-pill ' + r.tipo + '">' + r.tipo + '</span></td>' +
                    '<td style="color:#94a3b8">' + eschtml(r.origine) + '</td>' +
                    '<td><select data-riga="' + r.id + '" aria-label="Gruppo di stile">' +
                    '<option value="">— senza casa —</option>' + opz + '</select></td></tr>';
            }).join('') + '</tbody>';
        tab.querySelectorAll('select[data-riga]').forEach(function (s) {
            var r = REGISTRO.filter(function (x) { return x.id === s.getAttribute('data-riga'); })[0];
            var v2 = (A[r.id] !== undefined) ? A[r.id] : r.pre;
            if (v2) s.value = v2;
            s.addEventListener('change', function () { A[r.id] = s.value; salvaA(); statoAssegna(); uscita(); });
        });
        statoAssegna();
    }

    /* ── uscita ────────────────────────────────────────────────────────── */
    function uscita() {
        var righe = [
            ':root {',
            '  /* colore */',
            '  --mm-accent:      ' + T.accento + ';',
            '  --mm-accent-soft: ' + T.accentoTenue + ';',
            '  --mm-danger:      ' + T.distruttivo + ';',
            '  --mm-testo:       ' + T.testo + ';',
            '  --mm-testo-2:     ' + T.testo2 + ';',
            '  --mm-testo-3:     ' + T.testo3 + ';',
            '  --mm-bordo:       ' + T.bordo + ';',
            '  --mm-fondo-sez:   ' + T.fondoSez + ';',
            '  /* forma */',
            '  --mm-r-box:       ' + T.rBox + 'px;',
            '  --mm-r-campo:     ' + T.rCampo + 'px;',
            '  --mm-r-btn:       ' + T.rBtn + 'px;',
            '  --mm-pad:         ' + T.pad + 'px;',
            '  --mm-gap:         ' + T.gap + 'px;',
            '  --mm-icona:       ' + T.ico + 'px;',
            '  --mm-icona-head:  ' + (T.icoScelta === 'uguale' ? T.ico : T.ico + 4) + 'px;',
            '  --mm-btn-fs:      ' + T.btnFs + 'px;',
            '  --mm-btn-gap:     ' + T.btnGap + 'px;',
            '  /* taglie */',
            '  --mm-s: 440px;  --mm-m: 600px;  --mm-l: 820px;  --mm-xl: 1160px;',
            '}',
            '',
            '.mm-btn { text-transform:' + (T.btncase === 'uppercase' ? 'uppercase; letter-spacing:.2em;' : 'none; letter-spacing:normal;') + ' }',
            '/* etichette dei campi: ' + (T.label === 'sopra' ? 'sopra il campo (.mm-label)' : 'solo segnaposto') + ' */'
        ];
        var v = Core.verificaPaletta(T);
        if (v.falliti) {
            righe.push('', '/* ⚠ ' + v.falliti + ' accostamenti sotto soglia:');
            v.esiti.filter(function (e) { return !e.ok; }).forEach(function (e) {
                righe.push('     ' + e.nome + ' = ' + (e.valore === null ? '?' : e.valore.toFixed(2)) + ':1 (serve ' + e.soglia + ') */');
            });
        }
        document.getElementById('out-css').textContent = righe.join('\n');

        var a = ARCH.filter(function (x) { return x.id === selezionato; })[0];
        if (a) {
            var s = schemaDi(a);
            document.getElementById('out-schema').textContent =
                '// ' + a.nome + ' — ' + a.istanze.length + ' modali di oggi\n' +
                'const esito = await MappAIModal.open(' + JSON.stringify(s, null, 2) + ');';
        }

        /* verdetti del §0/§4: solo le voci toccate, con nome e passo */
        var ov = document.getElementById('out-verdetti');
        if (ov) {
            var vObj = {};
            ITEMS.forEach(function (i) {
                var st = V[i.id]; if (!st || (!st.esito && !st.dest && !st.nota)) return;
                vObj[i.id] = { nome: i.nome, passo: i.passo, esito: st.esito || 'da giudicare', dest: st.dest || '', nota: st.nota || '' };
            });
            ov.textContent = Object.keys(vObj).length
                ? JSON.stringify(vObj, null, 2)
                : '// ancora nessun verdetto: si danno nelle schede del §0 e del §4';
        }

        /* assegnazioni del §5: superficie → gruppo */
        var oa = document.getElementById('out-assegna');
        if (oa) {
            var aObj = {};
            REGISTRO.forEach(function (r2) {
                var v3 = (A[r2.id] !== undefined) ? A[r2.id] : r2.pre;
                aObj[r2.nome] = v3 || '';
            });
            oa.textContent = JSON.stringify(aObj, null, 2);
        }
    }

    /* ── comandi ───────────────────────────────────────────────────────── */
    function legaColore(id, chiave) {
        var i = document.getElementById('c-' + id), v = document.getElementById('v-' + id);
        if (!i) return;
        i.value = T[chiave];
        v.textContent = T[chiave];
        i.addEventListener('input', function () {
            T[chiave] = i.value; v.textContent = i.value;
            applicaToken(); disegnaContrasti(); misuraPezzi(); uscita();
        });
    }
    function legaNumero(id, chiave, suffisso) {
        var i = document.getElementById('r-' + id), v = document.getElementById('v-r-' + id);
        if (!i) return;
        i.value = T[chiave];
        v.textContent = T[chiave] + (suffisso || 'px');
        i.addEventListener('input', function () {
            T[chiave] = Number(i.value); v.textContent = i.value + (suffisso || 'px');
            applicaToken(); misuraPezzi(); disegnaCantiere(); uscita();
        });
    }

    ['accento', 'accentoTenue', 'distruttivo', 'testo', 'testo2', 'testo3', 'bordo', 'fondoSez']
        .forEach(function (k) { legaColore(k, k); });
    legaNumero('box', 'rBox'); legaNumero('campo', 'rCampo'); legaNumero('btn', 'rBtn');
    legaNumero('pad', 'pad'); legaNumero('gap', 'gap'); legaNumero('ico', 'ico');
    legaNumero('btnfs', 'btnFs'); legaNumero('btngap', 'btnGap');

    document.querySelectorAll('[data-apri]').forEach(function (b) {
        var gruppo = b.getAttribute('data-apri');
        var chiave = gruppo === 'btncase' ? 'btncase' : gruppo === 'label' ? 'label' : 'icoScelta';
        if (T[chiave] === b.getAttribute('data-v')) {
            b.parentElement.querySelectorAll('[data-apri="' + gruppo + '"]').forEach(function (x) { x.classList.toggle('on', x === b); });
        }
        b.addEventListener('click', function () {
            T[chiave] = b.getAttribute('data-v');
            b.parentElement.querySelectorAll('[data-apri="' + gruppo + '"]').forEach(function (x) { x.classList.toggle('on', x === b); });
            applicaToken(); disegnaCantiere(); misuraPezzi(); uscita();
        });
    });

    document.querySelectorAll('[data-copia]').forEach(function (b) {
        b.addEventListener('click', function () {
            var pre = document.getElementById(b.getAttribute('data-copia'));
            function fatto() { b.textContent = 'Copiato ✓'; setTimeout(function () { b.textContent = 'Copia'; }, 1400); }
            if (navigator.clipboard) navigator.clipboard.writeText(pre.textContent).then(fatto, function () { });
        });
    });

    var bf = document.getElementById('btn-fuoco');
    if (bf) setTimeout(function () { try { bf.focus(); } catch (e) { } }, 100);

    applicaToken();
    disegnaContrasti();
    disegnaCantiere();
    bindVerdetti();
    disegnaAssegnazioni();
    misuraPezzi();
    misuraFamiglie();
    uscita();
    window.addEventListener('resize', function () { misuraPezzi(); misuraFamiglie(); });
    window.MMOfficina2 = {
        T: T, V: V, A: A, applicaToken: applicaToken, disegnaCantiere: disegnaCantiere,
        disegnaAssegnazioni: disegnaAssegnazioni, uscita: uscita
    };
})();
