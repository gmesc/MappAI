/* OFFICINA — LE FAMIGLIE ESISTENTI (passi 1 e 2 della procedura dei verdetti)
 *
 * Ogni famiglia è un modo in cui il codice di oggi scrive un bottone o un campo.
 * Il CSS qui è TRASCRITTO dal codice vero (per le regole Tailwind `@apply`, il
 * valore è quello che Tailwind produce), con l'origine dichiarata file:riga.
 * Le classi hanno prefisso `fam-` per non collidere con nulla.
 *
 * Il giudizio (valida / invalida + «confluisce in» + nota) si dà nella pagina
 * e si esporta in §6: niente stati automatici, conta che qualcuno l'abbia visto.
 */
'use strict';

module.exports = {

    /* dove può confluire una famiglia invalidata: le voci della tendina */
    destinazioni: [
        'mm-btn (ogni bottone al ruolo suo: primario/secondario/…)',
        'mm-btn--primario', 'mm-btn--secondario', 'mm-btn--distruttivo', 'mm-btn--quieto',
        'mm-campo', 'mm-sez',
        'token nuovo: barra strumenti (--mm-bar-*)',
        'token nuovo: topbar documento (--mm-doc-*)',
        'token nuovo: player (--mm-player-*)',
        'fuori perimetro (altri token)', 'da pensionare'
    ],

    bottoni: [
        {
            id: 'b-mm',
            nome: '.mm-btn — i token del 29/7',
            origine: 'public/css/mappai-modal-tokens.css',
            metro: true,
            html: '<button class="mm-btn mm-btn--primario">Conferma</button>' +
                '<button class="mm-btn mm-btn--secondario">Annulla</button>' +
                '<button class="mm-btn mm-btn--distruttivo">Elimina</button>' +
                '<button class="mm-btn mm-btn--quieto">Salta</button>',
            css: '',
            problemi: [],
            proposta: 'È il metro: le altre famiglie si giudicano contro questo. Corpo 12px ancora in discussione (--mm-btn-fs).'
        },
        {
            id: 'b-pm',
            nome: '.pm-btn-primary / .pm-btn-cancel — modali statici',
            origine: 'public/index.html:243-244',
            html: '<div style="display:flex;gap:8px;width:100%"><button class="fam-pm-cancel">Annulla</button><button class="fam-pm-primary">Conferma</button></div>',
            css: '.fam-pm-primary{flex:2;padding:10px 20px;background:#4f46e5;color:#fff;border:0;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}' +
                '.fam-pm-primary:hover{background:#4338ca}' +
                '.fam-pm-cancel{flex:1;padding:10px 16px;border:1px solid #e2e8f0;color:#64748b;border-radius:12px;font-size:12px;font-weight:700;cursor:pointer;background:#fff}' +
                '.fam-pm-cancel:hover{background:#f8fafc}',
            problemi: [
                'flex-1 / flex-2: su un modale da 1160px il primario diventa largo mezzo schermo (contro la decisione 5)',
                'raggio 12 contro il 10 dei token'
            ],
            proposta: 'Confluisce in mm-btn--primario / --secondario a larghezza naturale (passo ③ del piano del campionario).'
        },
        {
            id: 'b-salva',
            nome: '.btn_salva_action / .btn_annulla_action',
            origine: 'public/index.html:165-166',
            html: '<button class="fam-salva">SALVA</button><button class="fam-annulla">ANNULLA</button>',
            css: '.fam-salva,.fam-annulla{padding:0 32px;font-size:18px;color:#fff;font-weight:700;letter-spacing:.2em;border:0;border-radius:12px;height:48px;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}' +
                '.fam-salva{background:#34d399}.fam-salva:hover{background:#10b981}' +
                '.fam-annulla{background:#f87171}.fam-annulla:hover{background:#ef4444}',
            problemi: [
                '«Annulla» ROSSO: il rosso promette una perdita — contro la decisione 2',
                'verde come colore d’azione — contro la decisione 1 (l’emerald è stato positivo, non bottone)',
                'letter-spacing .2em spezza il profilo della parola — costo BES/DSA (decisione 3)'
            ],
            proposta: 'Da pensionare: mm-btn--primario (indigo) + mm-btn--secondario bianco (passo ③ del piano).'
        },
        {
            id: 'b-moduli',
            nome: 'Bottone dei moduli — variante C',
            origine: 'mappai-live-classes.js:236 · menu-hubs · landing-teach',
            html: '<button class="fam-mod fam-mod--p">Salva</button><button class="fam-mod fam-mod--s">Annulla</button>',
            css: '.fam-mod{border:0;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:700;font-size:12px}' +
                '.fam-mod--p{background:#4f46e5;color:#fff}' +
                '.fam-mod--s{background:#fff;color:#334155;border:1px solid #e2e8f0}',
            problemi: [
                'alto ~34px: sotto i 44 consigliati per il tocco (reperto dell’officina)',
                'corpo 12px accanto a campi da 16px: scarto forte, visibile solo dal 29/7 (prima lo scartava button 16px !important)'
            ],
            proposta: 'È la BASE scelta per mm-btn: già assorbita nei token. Verdetto = conferma della scelta.'
        },
        {
            id: 'b-de',
            nome: '.de-btn — barra dell’editor documenti',
            origine: 'mappai-doc-editor.js:1902-1905',
            html: '<button class="fam-de">‹ Documenti</button><button class="fam-de">Annulla</button><button class="fam-de">Nel vault</button><button class="fam-de">Stampa</button><button class="fam-de fam-de--p">Salva</button>',
            css: ".fam-de{display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;border-radius:9px;padding:6px 11px;font:700 11px 'Space Mono',monospace;cursor:pointer}" +
                '.fam-de:hover{background:#eef2ff;color:#4f46e5}' +
                '.fam-de--p{background:#4f46e5;border-color:#4f46e5;color:#fff}.fam-de--p:hover{background:#4338ca;color:#fff}',
            problemi: [
                'corpo 11px e altezza ~28px: una barra fitta di comandi piccoli',
                'quarta geometria in campo (raggio 9, dopo 8, 10 e 12)'
            ],
            proposta: 'Candidata a diventare il token «barra strumenti» (--mm-bar-*): una barra NON è un piè di modale, i suoi bottoni possono restare più compatti — ma con una taglia decisa, non ereditata dal caso.'
        },
        {
            id: 'b-topbar',
            nome: 'Bottoni della topbar dei stampati',
            origine: 'mappai-quiz-print.js:64-91 (QP_PRINT_BAR, clonata in live-reports e tutor-reports)',
            html: '<button class="fam-tb">🖨 Stampa / Esporta PDF</button><button class="fam-tb fam-tb--s">✕ Chiudi</button>',
            css: '.fam-tb{background:#4f46e5;color:#fff;border:0;border-radius:8px;padding:6px 16px;cursor:pointer;font-size:11px;font-weight:700;font-family:monospace}' +
                '.fam-tb--s{background:#f1f5f9;color:#475569;font-weight:400;padding:6px 12px}',
            problemi: [
                'emoji nei bottoni (🖨 / ✕): contro la regola dell’11/7 «icone Lucide, mai emoji» — le topbar sono rimaste fuori',
                'font-family:monospace di sistema, non Space Mono',
                'accento variabile per documento (accentColor): ogni stampato ha una topbar di colore diverso'
            ],
            proposta: 'Confluisce nel token «topbar documento» (--mm-doc-*), con icone Lucide e accento unico.'
        },
        {
            id: 'b-landing',
            nome: '.btn_quick_action — card della landing',
            origine: 'public/index.html:158',
            html: '<button class="fam-land">GENERA<br>MAPPA</button>',
            css: '.fam-land{padding:0 32px;font-size:20px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;color:#64748b;text-align:center;font-weight:700;letter-spacing:.2em;background:#f1f5f9;border-radius:16px;gap:16px;height:192px;min-width:170px;border:0;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.05)}' +
                '.fam-land:hover{background:#34d399;color:#fff}',
            problemi: [
                'grigio→emerald è il patto grafico della landing (§10.16), non dei modali: qui il verdetto serve a FORMALIZZARE il confine, non a cambiarla'
            ],
            proposta: 'Fuori perimetro: governata dai token della landing. Il verdetto mette il confine per iscritto.'
        }
    ],

    campi: [
        {
            id: 'c-mm',
            nome: '.mm-campo — i token del 29/7',
            origine: 'public/css/mappai-modal-tokens.css',
            metro: true,
            html: '<input class="mm-campo" placeholder="Nome della classe" aria-label="Nome della classe">',
            css: '',
            problemi: [],
            proposta: 'Il metro dei campi. Il bordo #e2e8f0 (1,23:1) è il punto ancora debole: si decide al passo 1 dei fondamentali.'
        },
        {
            id: 'c-fld',
            nome: 'FLD dei moduli — variante C (già scelta)',
            origine: 'mappai-live-classes.js:247 (input) · :511 (tendina)',
            html: '<div style="display:flex;flex-direction:column;gap:8px;width:100%">' +
                '<input class="fam-fld" placeholder="Sezione (es. A)" aria-label="Sezione">' +
                '<select class="fam-fld" aria-label="Esempio di tendina"><option>Tendina dei moduli</option></select>' +
                '<textarea class="fam-fld" rows="2" aria-label="Note" placeholder="Note per l’AI"></textarea></div>',
            css: '.fam-fld{width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff}',
            problemi: [
                'bordo #e2e8f0 su bianco = 1,23:1: il perimetro del campo non si percepisce (reperto dell’officina)',
                'textarea: Invio deve scrivere, mai confermare il modale (contratto tastiera)'
            ],
            proposta: 'È la base di mm-campo: già assorbita nei token. Resta da decidere il bordo.'
        },
        {
            id: 'c-landing',
            nome: '.landing-input — campi della landing',
            origine: 'public/css/style.css:1071',
            html: '<input class="fam-lin" placeholder="Di cosa parla la tua mappa?" aria-label="Argomento">',
            css: '.fam-lin{width:100%;background:rgba(255,255,255,.9);border:1.5px solid #c7d2fe;border-radius:12px;padding:14px 16px;font-size:16px;color:#0f172a}' +
                '.fam-lin::placeholder{color:#64748b}',
            problemi: [
                'bordo indaco chiaro #c7d2fe: percepibile (meglio del bordo dei modali) ma fuori dalla palette dei token',
                'segnaposto già corretto a #64748b il 29/7 (era #94a3b8 = 2,8:1)'
            ],
            proposta: 'Fuori perimetro: campo della landing (§10.16). Il verdetto formalizza il confine.'
        },
        {
            id: 'c-de',
            nome: 'Strumenti di riga dell’editor documenti',
            origine: 'mappai-doc-editor.js:1904-1912',
            html: '<span class="fam-destyle"><button class="fam-desbtn">B</button><button class="fam-desbtn"><i>I</i></button><button class="fam-desbtn"><u>U</u></button><span class="fam-desep"></span><button class="fam-desbtn" style="color:#dc2626">A</button></span>',
            css: '.fam-destyle{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px}' +
                ".fam-desbtn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:#475569;border-radius:6px;cursor:pointer;font:700 13px 'Space Mono',monospace}" +
                '.fam-desbtn:hover{background:#e0e7ff;color:#4f46e5}' +
                '.fam-desep{width:1px;height:18px;background:#e2e8f0;margin:0 3px}',
            problemi: [
                'bersagli 26×26: sopra il minimo WCAG (24) ma ben sotto i 44 consigliati per il tocco',
                'i campi veri sono contenteditable senza bordo: il perimetro si scopre solo al passaggio'
            ],
            proposta: 'Confluisce nel token «barra strumenti» (--mm-bar-*) insieme ai .de-btn: taglia dei bersagli da decidere lì.'
        }
    ]
};
