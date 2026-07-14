/*
 * mappai-net-mode.js — toggle "Rete studenti: WiFi aula / Internet" (variante WEB)
 * ---------------------------------------------------------------------------
 * Componente condiviso dai wizard delle attività QR (Studio attivo live,
 * Lavagna, Tutor, Timeline, Materiali). La scelta è per-sessione con memoria
 * dell'ultima (localStorage 'mappai_net_mode'); il payload degli start IPC
 * porta netMode:'lan'|'web' e main.js (maybeRelay) fa il resto.
 *
 *  - get()/set(m)        → modalità corrente ('lan' default storico)
 *  - enabled()           → kill-switch: mappai_web_mode='0' nasconde tutto
 *  - fieldHtml(prefix)   → blocco label+2 bottoni da concatenare nel body
 *  - bind(ov, prefix)    → aggancia i click (chiamare dopo il mount del modale)
 *  - checkFallback(r)    → toast se il relay era irraggiungibile (r.relayFallback)
 *  - baseForPaths(info)  → base per URL con path esplicito (file, pagine):
 *                          in web mode toglie /j/<code> → resta l'origin relay
 *  - lanLineHtml(info)   → riga secondaria con gli URL LAN (dashboard, web mode)
 *
 * Caricato in index.html dopo app.js (regola 2). Stringhe via window.t
 * (fallback IT inline, chiavi EN in en_translations.js — regola 13).
 */
(function () {
    'use strict';

    var KEY = 'mappai_net_mode';
    var NM = {};

    function tt(k, f) { return (typeof window.t === 'function') ? window.t(k, f) : f; }
    function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    NM.enabled = function () {
        try { return localStorage.getItem('mappai_web_mode') !== '0'; } catch (e) { return true; }
    };

    NM.get = function () {
        if (!NM.enabled()) return 'lan';
        try { return localStorage.getItem(KEY) === 'web' ? 'web' : 'lan'; } catch (e) { return 'lan'; }
    };

    NM.set = function (m) {
        try { localStorage.setItem(KEY, m === 'web' ? 'web' : 'lan'); } catch (e) { /* no-op */ }
    };

    // Blocco UI da concatenare nel body del wizard (stile bottoni .lv-mode /
    // tq-prov-btn). prefix distingue i wizard ('lv','cl','tq','tl','mat').
    NM.fieldHtml = function (prefix) {
        if (!NM.enabled()) return '';
        var cur = NM.get();
        function btn(m, icon, label) {
            var sel = cur === m;
            return '<button type="button" data-m="' + m + '" class="' + prefix + '-net-btn" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:2px solid ' + (sel ? '#4f46e5' : '#e2e8f0') + ';background:' + (sel ? '#eef2ff' : '#fff') + ';border-radius:10px;padding:9px;cursor:pointer;font-weight:700;font-size:12px;color:#334155">' +
                '<i data-lucide="' + icon + '" style="width:14px;height:14px"></i>' + escHtml(label) + '</button>';
        }
        return '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:12px 0 5px">' + escHtml(tt('net_mode_label', 'Rete studenti')) + '</label>' +
            '<div style="display:flex;gap:8px">' +
            btn('lan', 'wifi', tt('net_mode_lan', 'WiFi aula')) +
            btn('web', 'globe', tt('net_mode_web', 'Internet')) + '</div>' +
            '<div class="' + prefix + '-net-hint" style="font-size:11px;color:#94a3b8;margin-top:5px;' + (cur === 'web' ? '' : 'display:none') + '">' +
            escHtml(tt('net_web_hint', 'Gli allievi usano la LORO connessione (dati o WiFi qualunque): la sessione passa dal relay MappAI su server svizzero. Serve internet sul PC.')) + '</div>';
    };

    NM.bind = function (ov, prefix) {
        if (!ov) return;
        var btns = ov.querySelectorAll('.' + prefix + '-net-btn');
        btns.forEach(function (b) {
            b.onclick = function () {
                var m = b.getAttribute('data-m');
                NM.set(m);
                btns.forEach(function (x) {
                    var on = x === b;
                    x.style.borderColor = on ? '#4f46e5' : '#e2e8f0';
                    x.style.background = on ? '#eef2ff' : '#fff';
                });
                var hint = ov.querySelector('.' + prefix + '-net-hint');
                if (hint) hint.style.display = (m === 'web') ? '' : 'none';
            };
        });
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    // Dopo l'avvio: se il main è caduto in fallback LAN, avvisa il docente
    // (la sessione è comunque partita, in modalità WiFi aula).
    NM.checkFallback = function (r) {
        if (r && r.relayFallback && window.showToast) {
            window.showToast(tt('net_web_fallback', 'Relay non raggiungibile: sessione avviata in modalità WiFi aula'), 'warning');
        }
    };

    // Base per URL con PATH ESPLICITO (QR per-file, timeline-build):
    // - LAN: urls[0] = http://<ip>:<porta> → base + path funziona come oggi
    // - WEB: urls[0] = https://<relay>/j/<code> → serve l'ORIGIN nudo (il
    //   relay instrada per token nel path/query, /j/<code> è solo l'ingresso)
    NM.baseForPaths = function (info) {
        var base = (info && info.urls && info.urls[0]) || '';
        if (info && info.netMode === 'web') return base.replace(/\/j\/[A-Z2-9]+\/?$/i, '');
        return base;
    };

    // Riga secondaria con gli URL LAN nelle dashboard (solo web mode):
    // utile se un device è comunque sulla rete dell'aula.
    NM.lanLineHtml = function (info) {
        if (!info || info.netMode !== 'web' || !info.lanUrls || !info.lanUrls.length) return '';
        return '<div style="font-size:10.5px;color:#cbd5e1;margin-top:3px;word-break:break-all">' +
            escHtml(tt('net_lan_line', 'LAN:')) + ' ' + info.lanUrls.map(escHtml).join(' · ') + '</div>';
    };

    window.MappAINetMode = NM;
    console.log('[MappAINetMode] toggle rete WiFi/Internet caricato');
})();
