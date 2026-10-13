'use strict';
/*
 * Il nucleo puro dell'HTML sicuro (public/js/mappai-html-sicuro.js).
 * I testi di un vault ricevuto, di un PDF di terzi o di una risposta del modello
 * entrano nella finestra principale, dove ogni codice ha `window.electronAPI`:
 * qui si prova che restano TESTO, con i vettori classici. Il giudice è un parser
 * HTML vero (cheerio → parse5, lo stesso algoritmo del browser).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cheerio = require('cheerio');
const H = require('../public/js/mappai-html-sicuro.js');

const VETTORI = [
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    "' onmouseover='alert(1)",
    '&amp; già presente, &lt;b&gt; e &#39;',
    '</div></p><svg onload=alert(1)>',
    'javascript:alert(1)',
    "L'etichetta \"tra virgolette\" con l’apostrofo tipografico",
    'riga uno\nriga due\t\u2028fine',
    ''
];

// ── esc ─────────────────────────────────────────────────────────────────────

test('esc: i cinque caratteri, sempre (anche la & di un entità già scritta)', () => {
    assert.equal(H.esc(`<a href="x" title='y'>&amp;</a>`),
        '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;amp;&lt;/a&gt;');
    assert.equal(H.esc(null), '');
    assert.equal(H.esc(undefined), '');
    assert.equal(H.esc(2), '2');
});

test('esc: ogni vettore torna IDENTICO come testo e come valore di attributo, senza creare elementi', () => {
    for (const v of VETTORI) {
        const $ = cheerio.load('<div id="t" data-x="' + H.esc(v) + '" title=\'' + H.esc(v) + '\'>' + H.esc(v) + '</div>');
        const el = $('#t');
        assert.equal(el.attr('data-x'), v, 'attributo fra virgolette doppie: ' + JSON.stringify(v));
        assert.equal(el.attr('title'), v, 'attributo fra apici: ' + JSON.stringify(v));
        assert.equal(el.text(), v, 'testo: ' + JSON.stringify(v));
        assert.equal(el.children().length, 0, 'nessun elemento nato dal dato: ' + JSON.stringify(v));
        assert.deepEqual(Object.keys(el[0].attribs).sort(), ['data-x', 'id', 'title']);
    }
});

// ── evidenzia ───────────────────────────────────────────────────────────────

test('evidenzia: la stessa <mark> di highlightQuery, senza distinguere le maiuscole', () => {
    assert.equal(H.evidenzia('La Rivoluzione e la RIVOLUZIONE', 'rivoluzione'),
        'La <mark class="' + H.CLASSE_MARK + '">Rivoluzione</mark> e la <mark class="' + H.CLASSE_MARK + '">RIVOLUZIONE</mark>');
    assert.equal(H.CLASSE_MARK, 'bg-black text-white px-1 rounded font-bold');
});

test('evidenzia: senza ricerca è solo escape; il testo del dato non diventa mai markup', () => {
    assert.equal(H.evidenzia('<img src=x onerror=alert(1)>', ''), H.esc('<img src=x onerror=alert(1)>'));
    const html = H.evidenzia('<img src=x onerror=alert(1)> sole <b>', 'sole');
    const $ = cheerio.load('<p>' + html + '</p>');
    assert.equal($('img').length, 0);
    assert.equal($('b').length, 0);
    assert.equal($('mark').length, 1);
    assert.equal($('p').text(), '<img src=x onerror=alert(1)> sole <b>');
});

test('evidenzia: una ricerca «amp», «lt» o «br» non entra più dentro un entità o un tag', () => {
    const $ = cheerio.load('<p>' + H.evidenzia('A & B < C, lampo', 'amp') + '</p>');
    assert.equal($('p').text(), 'A & B < C, lampo');
    assert.equal($('mark').length, 1);
    assert.equal($('mark').text(), 'amp');
    const lt = cheerio.load('<p>' + H.evidenzia('x < y', 'lt') + '</p>');
    assert.equal(lt('p').text(), 'x < y');
    assert.equal(lt('mark').length, 0);
});

test('evidenzia: i caratteri speciali delle regex si cercano alla lettera', () => {
    assert.equal(H.evidenzia('costa 3.50 (circa) o 3x50', '3.50 (circa)'),
        'costa <mark class="' + H.CLASSE_MARK + '">3.50 (circa)</mark> o 3x50');
    assert.equal(H.evidenzia('a+b', '+'), 'a<mark class="' + H.CLASSE_MARK + '">+</mark>b');
});

test('togliEvidenziazioniVecchie: via solo la <mark> esatta che il vecchio openSourceModal scriveva nei dati', () => {
    const m = '<mark class="bg-black text-white px-1 rounded font-bold">';
    assert.equal(H.togliEvidenziazioniVecchie('La ' + m + 'rivoluzione</mark> del 1789'), 'La rivoluzione del 1789');
    // aperto due volte con la stessa ricerca: marcature annidate
    assert.equal(H.togliEvidenziazioniVecchie('La ' + m + m + 'rivoluzione</mark></mark> del 1789'), 'La rivoluzione del 1789');
    // un testo senza quella marcatura torna identico, anche se contiene altro HTML
    const altro = 'Una <mark>vera</mark> frase con </mark> e <b>';
    assert.equal(H.togliEvidenziazioniVecchie(altro), altro);
    assert.equal(H.togliEvidenziazioniVecchie(undefined), '');
});

// ── valutaLink ──────────────────────────────────────────────────────────────

test('valutaLink: pagine web, posta e documenti sul computer si aprono (con la href del parser)', () => {
    const casi = [
        ['https://www.insegnai.ch/mappai.html', 'web'],
        ['HTTP://example.org/a b?x=1&y=2', 'web'],
        ['  https://example.org/  ', 'web'],
        ['mailto:giacomo@insegnai.ch?subject=Ciao mondo', 'posta'],
        ['file:///Users/docente/Documenti/Verifica finale.pdf', 'file'],
        ['file:///Users/docente/Documenti/Perché%20no.DOCX', 'file'],
        ['file://localhost/Users/docente/foto.JPG', 'file'],
        ['file://C:\\Users\\docente\\lezione.pptx', 'file'],
        ['FILE:///tmp/audio.m4a#t=10', 'file']
    ];
    for (const [url, tipo] of casi) {
        const v = H.valutaLink(url);
        assert.equal(v.ok, true, url + ' → ' + JSON.stringify(v));
        assert.equal(v.tipo, tipo, url);
        assert.equal(v.url, new URL(url.trim()).href, url);
    }
    assert.equal(H.valutaLink('file:///Users/docente/Verifica finale.pdf').url, 'file:///Users/docente/Verifica%20finale.pdf');
});

test('valutaLink: javascript:, data:, vbscript: e schemi ignoti no — maiuscole, spazi, TAB e controlli compresi', () => {
    const rifiutati = [
        'javascript:alert(1)', 'JaVaScRiPt:alert(1)', '  javascript:alert(1)', '\tjavascript:alert(1)',
        'java\tscript:alert(1)', 'java\nscript:alert(1)', '\u0001javascript:alert(1)', 'javascript&colon;alert(1)',
        'data:text/html,<script>alert(1)</script>', 'DATA:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)',
        'smb://server/share', 'afp://server/share', 'ftp://example.org/x.pdf', 'x-apple.systempreferences:com.apple.preference',
        'ms-msdt:/id', 'search-ms:query=x', 'vscode://file/x', 'blob:https://x/1', 'about:blank'
    ];
    for (const url of rifiutati) {
        const v = H.valutaLink(url);
        assert.equal(v.ok, false, JSON.stringify(url) + ' doveva essere rifiutato');
        assert.ok(v.url === undefined, 'un link rifiutato non porta una href da aprire');
    }
    assert.equal(H.valutaLink('JaVa\tScRiPt:alert(1)').schema, 'javascript:');
    assert.equal(H.valutaLink('smb://server/share').motivo, 'schema');
});

test('valutaLink: un file: verso programmi, script, cartelle o la rete no', () => {
    const casi = {
        'file:///Applications/Calculator.app': 'file-tipo',
        'file:///Applications/Calculator.app/': 'file-tipo',
        'file:///Users/x/Allegati/lancia.command': 'file-tipo',
        'file:///Users/x/Allegati/impostazioni.terminal': 'file-tipo',
        'file:///Users/x/installa.pkg': 'file-tipo',
        'file:///C:/Users/x/setup.exe': 'file-tipo',
        'file:///C:/Users/x/setup.exe.': 'file-tipo',
        'file:///C:/Users/x/macro.docm': 'file-tipo',
        'file:///Users/x/collegamento.webloc': 'file-tipo',
        'file:///Users/x/Documenti': 'file-tipo',
        'file:///C:/x/evil.exe:doc.pdf': 'file-tipo',
        'file:///tmp/doc.exe%00.pdf': 'file-nome',
        'file:///tmp/doc%0A.pdf': 'file-nome',
        'file:///tmp/rotto%E0%A4%A.pdf': 'file-nome',
        'file://server/share/doc.pdf': 'file-rete',
        'file:////server/share/doc.pdf': 'file-rete',
        'file:///%5C%5Cserver%5Cshare%5Cdoc.pdf': 'file-rete'
    };
    for (const [url, motivo] of Object.entries(casi)) {
        const v = H.valutaLink(url);
        assert.equal(v.ok, false, url + ' doveva essere rifiutato');
        assert.equal(v.motivo, motivo, url);
    }
});

test('valutaLink: vuoto, senza schema o non stringa no', () => {
    for (const url of ['', '   ', null, undefined, 'www.example.org', '/Users/x/doc.pdf', '../Allegati/doc.pdf', 42]) {
        assert.equal(H.valutaLink(url).ok, false, JSON.stringify(url));
    }
});

// ── sanificaTutor ───────────────────────────────────────────────────────────

function soloListaBianca(html) {
    const $ = cheerio.load('<div id="r">' + html + '</div>');
    const ammessi = new Set('p br strong b em i u s del ins mark small sup sub code pre blockquote hr ul ol li h1 h2 h3 h4 h5 h6 table thead tbody tr th td'.split(' '));
    $('#r *').each((_, el) => {
        assert.ok(ammessi.has(el.tagName), 'tag fuori lista: ' + el.tagName + ' in ' + html);
        assert.deepEqual(Object.keys(el.attribs), [], 'attributi su <' + el.tagName + '> in ' + html);
    });
    return $;
}

test('sanificaTutor: la formattazione chiesta dal prompt resta, gli attributi no', () => {
    const out = H.sanificaTutor('<p onclick="x()">Ciao <strong style="color:red">studente</strong></p><ul><li>uno</li><li>due</li></ul>');
    assert.equal(out, '<p>Ciao <strong>studente</strong></p><ul><li>uno</li><li>due</li></ul>');
    soloListaBianca(out);
    assert.equal(H.sanificaTutor('<em>a</em><br/><b>b</b><h3>T</h3><ol><li>x</ol>'), '<em>a</em><br><b>b</b><h3>T</h3><ol><li>x</li></ol>');
});

test('sanificaTutor: i vettori classici diventano testo inerte o spariscono', () => {
    const vettori = [
        '<img src=x onerror=alert(1)>',
        '"><script>alert(1)</script>',
        '<svg onload=alert(1)><circle/></svg>',
        '<a href="javascript:alert(1)">clicca</a>',
        '<a href="  JaVaScRiPt:alert(1)">clicca</a>',
        '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
        '<img alt="a>b" src=x onerror=alert(1)>dopo',
        '<b <img src=x onerror=alert(1)>ciao</b>',
        '<scr<script>ipt>alert(1)</script>',
        '<textarea><img src=x onerror=alert(1)></textarea>',
        '<style>body{display:none}</style>visibile',
        '<p style="background:url(javascript:alert(1))">x</p>',
        '</div></div><p>fuga</p>',
        '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
        '<!--><img src=x onerror=alert(1)>-->'
    ];
    for (const v of vettori) {
        const out = H.sanificaTutor(v);
        const $ = soloListaBianca(out);
        assert.equal($('img, script, svg, a, iframe, style, textarea, math').length, 0, v + ' → ' + out);
        assert.ok(!/<(?!\/?(p|br|strong|b|em|i|u|s|del|ins|mark|small|sup|sub|code|pre|blockquote|hr|ul|ol|li|h[1-6]|table|thead|tbody|tr|th|td)>)/.test(out), 'un «<» che non apre un tag ammesso: ' + out);
    }
    assert.equal(H.sanificaTutor('<a href="javascript:alert(1)">clicca</a>'), 'clicca');
    assert.equal(H.sanificaTutor('<script>alert(1)</script>dopo'), 'dopo');
    assert.equal(H.sanificaTutor('<SCRIPT type="x">alert(1)</SCRIPT >dopo'), 'dopo');
});

test('sanificaTutor: tag aperti richiusi, chiusure orfane ignorate, niente paragrafi vuoti in più', () => {
    assert.equal(H.sanificaTutor('<blockquote>aperto'), '<blockquote>aperto</blockquote>');
    assert.equal(H.sanificaTutor('</ul></p>testo</li>'), 'testo');
    assert.equal(H.sanificaTutor('<p>a<p>b'), '<p>a</p><p>b</p>');
    assert.equal(H.sanificaTutor('<p>testo<ul><li>x</li></ul></p>'), '<p>testo</p><ul><li>x</li></ul>');
    assert.equal(H.sanificaTutor('<ul><li>a<li>b</ul>'), '<ul><li>a</li><li>b</li></ul>');
    assert.equal(H.sanificaTutor('<b><i>x</b>y</i>'), '<b><i>x</i></b>y');
    // il browser, rileggendo, non aggiunge paragrafi vuoti
    const $ = cheerio.load('<div id="r">' + H.sanificaTutor('<p>a<p>b<ul><li>c</ul></p>') + '</div>');
    assert.equal($('#r p').length, 2);
    assert.equal($('#r p').filter((_, el) => $(el).text() === '').length, 0);
});

test('sanificaTutor: le entità scritte dal modello restano, la & sciolta e i «<» di testo diventano testo', () => {
    assert.equal(H.sanificaTutor('perch&egrave; &amp; &#39;x&#39; &#x3C;b&#x3E;'), 'perch&egrave; &amp; &#39;x&#39; &#x3C;b&#x3E;');
    assert.equal(H.sanificaTutor('Tom & Jerry, x < y, 3 > 2'), 'Tom &amp; Jerry, x &lt; y, 3 &gt; 2');
    const $ = cheerio.load('<div id="r">' + H.sanificaTutor('&lt;img src=x onerror=alert(1)&gt; &egrave;') + '</div>');
    assert.equal($('#r img').length, 0);
    assert.equal($('#r').text(), '<img src=x onerror=alert(1)> è');
});

test('sanificaTutor: con i grassetti di parseSimpleMarkdown PRIMA, la lista bianca resta l\'ultima parola', () => {
    // la stessa trasformazione di window.parseSimpleMarkdown (mappai-ai-tutor.js)
    const md = t => t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
    assert.equal(H.sanificaTutor(md('**Bravo**, *quasi*\nriprova')), '<strong>Bravo</strong>, <em>quasi</em><br>riprova');
    const out = H.sanificaTutor(md('<img alt="*x*" src=y onerror=alert(1)>**ok**'));
    soloListaBianca(out);
    assert.equal(out, '<strong>ok</strong>');
    assert.equal(H.sanificaTutor(null), '');
});

// ── dalla revisione del ramo (25/9) ──────────────────────────────────────────
test('sanificaTutor resta lineare: «<» senza «>» e virgolette aperte non costano il quadrato', () => {
    const casi = ['<a'.repeat(131072), '<a "'.repeat(65536), "<a '".repeat(65536), '<!'.repeat(131072), '<a "' + 'x'.repeat(200000)];
    for (const c of casi) {
        const t0 = Date.now();
        H.sanificaTutor(c);
        assert.ok(Date.now() - t0 < 1500, 'prima: 256 KB di «<a» = 26 s a thread fermo');
    }
    // un valore fra virgolette con dentro un tag resta UN tag, e fuori lista se ne va intero
    assert.equal(H.sanificaTutor('<img alt="<em>x</em>" src=y onerror=alert(1)><strong>ok</strong>'), '<strong>ok</strong>');
});

test('valutaLink: un «%» nudo nel nome (i link che compone l\'app) non è un rifiuto; un NUL nascosto sì', () => {
    assert.equal(H.valutaLink('file:///Users/x/sconto 50%.pdf').ok, true);
    assert.equal(H.valutaLink('file:///x/doc.exe%00%.pdf').ok, false);
    assert.equal(H.valutaLink('file:///tmp/rotto%E0%A4%A.pdf').ok, false);
    assert.equal(H.valutaLink('file:///x/a%5c..%5cb%.pdf').ok, false);
});

test('togliEvidenziazioniVecchie: le <mark> annidate dal codice vecchio se ne vanno tutte', () => {
    // due ricerche del codice vecchio: «mercato», poi «text», che colpiva una parola DENTRO la classe
    const C = 'bg-black text-white px-1 rounded font-bold';
    const annidata = '<mark class="bg-black <mark class="' + C + '">text</mark>-white px-1 rounded font-bold">mercato</mark>';
    assert.equal(H.togliEvidenziazioniVecchie(annidata), 'mercato', 'con un giro solo restava la <mark> esterna come testo');
    assert.equal(H.togliEvidenziazioniVecchie('niente da togliere'), 'niente da togliere');
});

test('sanificaTutor: nemmeno «</script» o «</textarea» senza «>» costano il quadrato (seconda revisione, 25/9)', () => {
    for (const c of ['<script>' + '</script'.repeat(32768), '<textarea>' + '</textarea'.repeat(32768)]) {
        const t0 = Date.now();
        H.sanificaTutor(c);
        assert.ok(Date.now() - t0 < 1500, 'prima: 2,9 s e 4,4 s');
    }
});

test('togliEvidenziazioniVecchie: migliaia di livelli costruiti apposta non bloccano la scheda', () => {
    const C = 'bg-black text-white px-1 rounded font-bold';
    const annidata = ('<mark class="' + C + '">').repeat(8000) + 'x' + '</mark>'.repeat(8000);
    const t0 = Date.now();
    const out = H.togliEvidenziazioniVecchie(annidata);
    assert.ok(Date.now() - t0 < 1000, 'prima: 1,2 s');
    assert.equal(out, 'x');
});
