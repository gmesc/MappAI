/*
 * mappai-accesso-allievi.js — packet 0134 (28/10/2026)
 *
 * UN SOLO ACCESSO per gli allievi. Le cinque pagine da cui un allievo entra in un'attività live — Mappa LIVE
 * (public/collab/student.html), Quiz e «Completa la timeline» (public/live/student.html), Domande aperte
 * (public/live/scelta.html), «Costruisci la timeline» (public/live/timeline-build.html) e Chiedi e Rispondi
 * (public/tutor/student.html) — si erano divise perché ognuna aveva la sua copia del CSS e del markup. Qui stanno
 * le sei righe del modello (Mappa LIVE per singoli, screenshot 1 di Giacomo):
 *   1. il progetto (il titolo);
 *   2. la classe (assente se il server la manda vuota: D5);
 *   3. il nome dell'attività, più piccolo, quello delle barre dei report (il server lo manda pronto in `attivita`);
 *   4. la griglia delle 12 emoji, o le tre file da 4 dei gruppi (D1), o il campo «Nome del gruppo» (D8);
 *   5. il campo del numero, o l'anteprima delle tre emoji del gruppo (D7);
 *   6. «Entra»;
 * e sotto la riga dell'errore. Griglia, campo, anteprima ed «Entra» hanno UNA regola di larghezza: il 75% del lato
 * più corto della finestra (D4). La chiamata a /api/join e i suoi messaggi restano della pagina: i tre server
 * rispondono in modo diverso.
 *
 * Le righe di testo NON fissano un carattere: ereditano quello della pagina (Space Mono, o quello del docente nel
 * LIVE, `--live-font`). Il carattere delle emoji (`--emoji`) sta solo nelle celle e nell'anteprima, dove le emoji
 * restano TESTO dentro i bottoni: così `mappai-emoji-prova.js` le trova e su WebKit le cambia in immagini (0099).
 *
 * ES5 di proposito, come mappai-emoji-prova.js: le pagine degli allievi girano anche su iPad vecchi.
 * Modulo UMD: `stile()` e `html()` sono puri e si provano in Node (tests/accesso-allievi-0134.test.js);
 * `monta()` ed `errore()` sono la sola parte che tocca il DOM.
 */
(function () {
    'use strict';

    var NUMERO = 'Il tuo numero (es. 07)';               // D6: il testo del modello, in tutte le pagine
    var NOME_GRUPPO = 'Nome del gruppo (es. I Galli)';
    // le etichette delle file dei gruppi; `frutti` per le sessioni di Mappa LIVE aperte prima del 15/9/2026
    var FILE = { animali: 'Animali', cibo: 'Cibo', frutti: 'Frutti', mezzi: 'Mezzi' };
    var AVVISI = {
        emoji: 'Tocca la tua emoji.',
        numero: 'Scrivi il tuo numero.',
        combo: 'Scegli un\'emoji per ogni fila.',
        nome: 'Scrivi il nome del gruppo.'
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* Il CSS delle sei righe. `--ma-l` è la larghezza comune: il 75% del lato corto, in svw/svh dove ci sono
       (su Safari per iOS `vh` conta l'altezza SENZA le barre, e il bottone finirebbe sotto il bordo).
       La pagina che ospita l'accesso scorre in verticale se le righe non ci stanno (telefono in orizzontale). */
    function stile() {
        return [
            '.ma-pagina{display:flex;flex-direction:column;min-height:100vh;min-height:100svh;box-sizing:border-box;',
            'padding:16px;background-color:#fafbff;background-image:radial-gradient(#ddd6fe 1px,transparent 1px);',
            'background-size:24px 24px}',
            '.ma-accesso{--ma-l:min(75vw, 75vh);margin:auto;display:flex;flex-direction:column;align-items:center;',
            'gap:10px;text-align:center;color:var(--mm-testo,#404040)}',
            '@supports (width:1svh){.ma-accesso{--ma-l:min(75svw, 75svh)}}',
            '.ma-accesso *{box-sizing:border-box}',
            '.ma-progetto{margin:0;font-size:22px;font-weight:700;line-height:1.25;max-width:var(--ma-l);overflow-wrap:anywhere}',
            '.ma-classe{margin:0;font-size:15px;font-weight:700;color:#4f46e5}',
            '.ma-attivita{margin:0;font-size:13px;color:#64748b}',
            /* la regola di larghezza, UNA (D4) */
            '.ma-griglia,.ma-gruppi,.ma-campo,.ma-anteprima,.ma-entra{width:var(--ma-l)}',
            '.ma-griglia{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}',
            '.ma-gruppi{display:flex;flex-direction:column;gap:8px}',
            '.ma-fila__et{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;line-height:1.2;margin-bottom:4px}',
            '.ma-accesso .ma-cella{aspect-ratio:1/1;min-width:44px;min-height:44px;margin:0;padding:0;display:flex;',
            'align-items:center;justify-content:center;border:2px solid var(--mm-bordo,#cbd5e1);border-radius:14px;',
            'background:#fff;cursor:pointer;line-height:1;font-size:calc((var(--ma-l) - 30px) / 8);',
            'font-family:var(--emoji,\'MappAI Emoji\',\'Noto Color Emoji\',\'Apple Color Emoji\',\'Segoe UI Emoji\',sans-serif)}',
            '.ma-accesso .ma-cella[aria-pressed="true"]{border-color:#4f46e5;background:#eef2ff}',
            '.ma-accesso .ma-campo{margin:0;padding:13px 16px;border-radius:12px;border:2px solid var(--mm-bordo,#cbd5e1);',
            'background:#fff;color:var(--mm-testo,#404040);font:inherit;font-size:16px;text-align:center;outline:none}',
            '.ma-accesso .ma-campo:focus{border-color:#6366f1}',
            '.ma-accesso .ma-anteprima{min-height:40px;display:flex;align-items:center;justify-content:center;',
            'font-size:28px;line-height:1;',
            'font-family:var(--emoji,\'MappAI Emoji\',\'Noto Color Emoji\',\'Apple Color Emoji\',\'Segoe UI Emoji\',sans-serif)}',
            '.ma-accesso .ma-entra{margin:0;min-height:48px;padding:13px;border:0;border-radius:12px;background:#4f46e5;',
            'color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer}',
            '.ma-errore{max-width:var(--ma-l);font-size:13px;color:#dc2626}.ma-errore:empty{display:none}'
        ].join('');
    }

    function cella(e, premuta, fila) {
        return '<button type="button" class="ma-cella" data-key="' + esc(e.key) + '" aria-pressed="' + (premuta ? 'true' : 'false') +
            '" aria-label="' + esc(e.label || e.key) + '"' + (fila == null ? '' : ' data-fila="' + fila + '"') + '>' + esc(e.emoji) + '</button>';
    }

    function anteprima(gruppi, combo) {
        var out = '', i, j, it;
        if (!combo || !gruppi || combo.length !== gruppi.length) return '';
        for (i = 0; i < gruppi.length; i++) {
            it = null;
            for (j = 0; j < (gruppi[i].items || []).length; j++) if (gruppi[i].items[j].key === combo[i]) it = gruppi[i].items[j];
            if (!it) return '';
            out += it.emoji;
        }
        return out;
    }

    /* Le sei righe, come stringa. Senza `modo` escono solo le righe di testo e l'errore: è la forma che la pagina
       usa quando la sessione non si legge («Sessione non valida…»). */
    function html(o) {
        o = o || {};
        var pre = o.preseleziona || {}, out = [], i, k;
        out.push('<div class="ma-accesso">');
        if (o.progetto) out.push('<h1 class="ma-progetto">' + esc(o.progetto) + '</h1>');
        if (o.classe) out.push('<p class="ma-classe">' + esc(o.classe) + '</p>');
        if (o.attivita) out.push('<p class="ma-attivita">' + esc(o.attivita) + '</p>');
        if (o.modo === 'singolo') {
            out.push('<div class="ma-griglia" role="group" aria-label="La tua emoji">');
            for (i = 0; i < (o.emoji || []).length; i++) out.push(cella(o.emoji[i], o.emoji[i].key === pre.emojiKey));
            out.push('</div>');
            out.push('<input class="ma-campo ma-numero" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" ' +
                'autocomplete="off" placeholder="' + NUMERO + '" aria-label="Il tuo numero"' +
                (pre.num ? ' value="' + esc(pre.num) + '"' : '') + '>');
        } else if (o.modo === 'gruppo-emoji') {
            out.push('<div class="ma-gruppi">');
            for (i = 0; i < (o.gruppi || []).length; i++) {
                var g = o.gruppi[i], et = FILE[g.set] || g.set;
                out.push('<div class="ma-fila"><div class="ma-fila__et">' + esc(et) + '</div>' +
                    '<div class="ma-griglia" role="group" aria-label="' + esc(et) + '">');
                for (k = 0; k < (g.items || []).length; k++) out.push(cella(g.items[k], pre.combo && pre.combo[i] === g.items[k].key, i));
                out.push('</div></div>');
            }
            out.push('</div>');
            out.push('<div class="ma-anteprima" aria-live="polite">' + esc(anteprima(o.gruppi, pre.combo)) + '</div>');
        } else if (o.modo === 'gruppo-nome') {
            out.push('<input class="ma-campo ma-nome" type="text" maxlength="30" autocomplete="off" placeholder="' + NOME_GRUPPO +
                '" aria-label="Nome del gruppo"' + (pre.nick ? ' value="' + esc(pre.nick) + '"' : '') + '>');
        }
        if (o.modo) out.push('<button type="button" class="ma-entra">Entra</button>');
        out.push('<div class="ma-errore" role="alert">' + esc(o.errore || '') + '</div>');
        out.push('</div>');
        return out.join('');
    }

    // ── Nel browser ────────────────────────────────────────────────────────

    var corrente = null;   // l'ultimo accesso montato: `errore()` scrive lì

    function tutte(base, sel) { return base ? base.querySelectorAll(sel) : []; }

    function mettiStile(doc) {
        if (doc.getElementById('ma-stile')) return;
        var s = doc.createElement('style');
        s.id = 'ma-stile';
        s.textContent = stile();
        doc.head.appendChild(s);
    }

    /* Scrive stile e righe in `contenitore` e consegna a `o.entra(scelta)` che cosa ha scelto l'allievo:
       { emojiKey, num } (singolo), { combo } (gruppo-emoji) o { nick } (gruppo-nome) — le stesse cose che le pagine
       mandavano già a /api/join. `num` sono le sole cifre scritte: il formato lo decide la pagina, come prima. */
    function monta(contenitore, o) {
        o = o || {};
        var doc = contenitore.ownerDocument, pre = o.preseleziona || {};
        var stato = { emojiKey: pre.emojiKey || null, combo: (pre.combo || []).slice() };
        mettiStile(doc);
        contenitore.innerHTML = '<div class="ma-pagina">' + html(o) + '</div>';
        var radice = contenitore.querySelector('.ma-accesso');
        corrente = radice;

        var celle = tutte(radice, '.ma-cella'), i;
        for (i = 0; i < celle.length; i++) celle[i].onclick = scegli;
        function scegli() {
            var b = this, fila = b.getAttribute('data-fila'), j, altre;
            altre = fila == null ? celle : tutte(radice, '.ma-cella[data-fila="' + fila + '"]');
            for (j = 0; j < altre.length; j++) altre[j].setAttribute('aria-pressed', altre[j] === b ? 'true' : 'false');
            if (fila == null) stato.emojiKey = b.getAttribute('data-key');
            else {
                stato.combo[Number(fila)] = b.getAttribute('data-key');
                radice.querySelector('.ma-anteprima').textContent = anteprima(o.gruppi, stato.combo);
            }
            errore('');
        }

        var entra = radice.querySelector('.ma-entra');
        if (entra) entra.onclick = function () {
            var campo, num, nick, j;
            if (o.modo === 'singolo') {
                num = (radice.querySelector('.ma-numero').value || '').replace(/\D/g, '');
                if (!stato.emojiKey) return errore(AVVISI.emoji);
                if (!num) return errore(AVVISI.numero);
                errore('');
                return o.entra && o.entra({ emojiKey: stato.emojiKey, num: num });
            }
            if (o.modo === 'gruppo-emoji') {
                for (j = 0; j < (o.gruppi || []).length; j++) if (!stato.combo[j]) return errore(AVVISI.combo);
                errore('');
                return o.entra && o.entra({ combo: stato.combo.slice(0, o.gruppi.length) });
            }
            nick = (radice.querySelector('.ma-nome').value || '').replace(/^\s+|\s+$/g, '');
            if (!nick) return errore(AVVISI.nome);
            errore('');
            return o.entra && o.entra({ nick: nick });
        };
        // «Invio» nel campo vale come «Entra»
        var campi = tutte(radice, '.ma-campo');
        for (i = 0; i < campi.length; i++) campi[i].onkeydown = function (ev) {
            if ((ev.key === 'Enter' || ev.keyCode === 13) && entra) { ev.preventDefault(); entra.onclick(); }
        };
        return { radice: radice, errore: errore };
    }

    /* Il messaggio sotto «Entra», nell'ultimo accesso montato; vuoto, la riga sparisce. */
    function errore(testo) {
        var r = corrente && corrente.querySelector('.ma-errore');
        if (!r) return;
        r.textContent = testo || '';
        // vuota non occupa spazio (l'iPad in orizzontale, a gruppi, sta al limite): piena, la si porta in vista
        if (testo && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' });
    }

    var API = { stile: stile, html: html, monta: monta, errore: errore, NUMERO: NUMERO };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window === 'undefined') return;
    window.MappAIAccesso = API;
})();
