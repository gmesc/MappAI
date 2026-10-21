'use strict';
/*
 * La prova del font emoji (packet 0099, 15/10/2026) — `public/js/mappai-emoji-prova.js`.
 *
 * `MappAIEmoji.ttf` è solo COLRv1 + OT-SVG con glifi di base vuoti: un browser
 * che non legge nessuno dei due disegna il vuoto (bottoni senza emoji, Bedigliora
 * 14/10). La prova disegna due emoji su un canvas col solo font locale e, se non
 * lasciano inchiostro, toglie `'MappAI Emoji'` da `--emoji`. Qui: la logica con un
 * canvas finto (inchiostro / vuoto / canvas assente / niente document.fonts) e il
 * cablaggio nelle sette pagine che mostrano le emoji agli allievi.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const P = require(path.join(ROOT, 'public/js/mappai-emoji-prova.js'));

const STACK = "'MappAI Emoji','Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif";

/* document/window finti: il canvas «ha inchiostro» se `inchiostro` è true. */
function finto({ inchiostro, canvas = true, fonts = 'ok' }) {
    const attr = {}; const stile = {};
    const ctx = {
        clearRect() {}, fillText() {},
        getImageData: () => ({ data: new Uint8ClampedArray(inchiostro ? [0, 0, 0, 255] : [0, 0, 0, 0]) })
    };
    const doc = {
        createElement: () => ({ getContext: () => (canvas ? ctx : null) }),
        documentElement: {
            style: { setProperty: (k, v) => { stile[k] = v; } },
            setAttribute: (k, v) => { attr[k] = v; }
        }
    };
    if (fonts === 'ok') doc.fonts = { load: () => Promise.resolve([]) };
    if (fonts === 'rifiuta') doc.fonts = { load: () => Promise.reject(new Error('404')) };
    const win = { getComputedStyle: () => ({ getPropertyValue: () => ' ' + STACK }) };
    return { doc, win, attr, stile };
}

test('inchiostro sul canvas → il font locale resta, lo stack non si tocca', async () => {
    const f = finto({ inchiostro: true });
    assert.equal(await P.esegui(f.doc, f.win), 'locale');
    assert.equal(f.attr['data-emoji'], 'locale');
    assert.equal(f.stile['--emoji'], undefined);
});

test('canvas vuoto (COLRv1/SVG non letti) → --emoji perde \'MappAI Emoji\', il resto dello stack resta', async () => {
    const f = finto({ inchiostro: false });
    assert.equal(await P.esegui(f.doc, f.win), 'sistema');
    assert.equal(f.attr['data-emoji'], 'sistema');
    assert.equal(f.stile['--emoji'], "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif");
});

test('il caricamento del font fallisce (404, rete): si prova lo stesso, e senza inchiostro si ripiega', async () => {
    const f = finto({ inchiostro: false, fonts: 'rifiuta' });
    assert.equal(await P.esegui(f.doc, f.win), 'sistema');
    assert.ok(!/MappAI Emoji/.test(f.stile['--emoji']));
});

test('nel dubbio si cade sulle emoji di sistema: niente canvas, niente document.fonts', async () => {
    const senzaCanvas = finto({ inchiostro: true, canvas: false });
    assert.equal(await P.esegui(senzaCanvas.doc, senzaCanvas.win), 'sistema');
    assert.ok(senzaCanvas.stile['--emoji']);
    const senzaFonts = finto({ inchiostro: true, fonts: 'assente' });
    await new Promise(r => P.esegui(senzaFonts.doc, senzaFonts.win).then(r));
    assert.equal(senzaFonts.attr['data-emoji'], 'sistema');
    assert.ok(!/MappAI Emoji/.test(senzaFonts.stile['--emoji']));
});

test('se --emoji non è leggibile si usa la riserva intera, senza il font locale', () => {
    const f = finto({ inchiostro: false });
    f.win.getComputedStyle = () => ({ getPropertyValue: () => '' });
    P.togliLocale(f.doc, f.win);
    assert.equal(f.stile['--emoji'], "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji'");
});

test('le emoji provate sono fra le 27 di identità (EMOJI_SET): una fonte sola', () => {
    global.window = {};
    const LC = require(path.join(ROOT, 'public/js/mappai-live-core.js')) || global.window.MappAILiveCore;
    const set = LC.EMOJI_SET.map(e => e.emoji);
    for (const c of P.PROVE) assert.ok(set.includes(c), c + ' non è in EMOJI_SET');
});

test('il file è ES5: niente let/const/frecce/template, per girare dove il resto non gira', () => {
    const src = fs.readFileSync(path.join(ROOT, 'public/js/mappai-emoji-prova.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/\b(let|const)\s/.test(src), 'let/const');
    assert.ok(!/=>/.test(src), 'freccia');
    assert.ok(!/`/.test(src), 'template literal');
});

/* Le sette pagine che disegnano le emoji agli allievi. */
const PAGINE = [
    'public/live/student.html', 'public/live/scelta.html', 'public/live/timeline-build.html',
    'public/live/file.html', 'public/live/materials.html',
    'public/collab/student.html', 'public/tutor/student.html'
];

for (const rel of PAGINE) {
    test('cablaggio ' + rel + ': carica la prova e mette il font locale SOLO dentro --emoji', () => {
        const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        assert.equal((html.match(/src="\/public\/js\/mappai-emoji-prova\.js(\?v=[\w.-]+)?"/g) || []).length, 1, 'script mancante o doppio');
        assert.ok(html.indexOf('mappai-emoji-prova.js') < html.indexOf('</head>'), 'lo script sta nel <head>');
        // fuori da @font-face e dalla definizione di --emoji, il nome del font non compare in nessuno stack
        const fuori = html.split('\n').filter(r => /'MappAI Emoji'/.test(r))
            .filter(r => !/@font-face/.test(r) && !/--emoji\s*:/.test(r) && !/^\s*(\/\*|\*|<!--)/.test(r) && !/⚠️|PRIMA di Noto|font locale/.test(r));
        assert.deepEqual(fuori, [], 'stack scritto a mano con il font locale: deve usare var(--emoji)');
        assert.match(html, /--emoji\s*:\s*'MappAI Emoji'/, '--emoji definito in :root');
    });
}

/* ── le immagini sui motori WebKit (packet 0099, 16/10) ────────────────────
   DOM finto minimo: nodi con genitore, replaceChild, TreeWalker sui nodi di testo. */
class N {
    constructor(tipo, nome, valore) { this.nodeType = tipo; this.nodeName = nome; this.nodeValue = valore; this.childNodes = []; this.parentNode = null; this.className = ''; this.attrs = {}; this.style = {}; }
    appendChild(c) {
        if (c.nodeType === 11) { const f = c.childNodes.slice(); c.childNodes = []; f.forEach(x => this.appendChild(x)); return c; }
        if (c.parentNode) c.parentNode.childNodes.splice(c.parentNode.childNodes.indexOf(c), 1);
        c.parentNode = this; this.childNodes.push(c); return c;
    }
    replaceChild(nuovo, vecchio) {
        const i = this.childNodes.indexOf(vecchio);
        const lista = nuovo.nodeType === 11 ? nuovo.childNodes.slice() : [nuovo];
        lista.forEach(x => { x.parentNode = this; });
        this.childNodes.splice(i, 1, ...lista); vecchio.parentNode = null;
    }
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'class') this.className = v; }
    set id(v) { this.attrs.id = v; }
    get id() { return this.attrs.id; }
    get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(c => c.textContent).join(''); }
    set textContent(v) { this.childNodes = []; if (this.nodeType === 1) this.appendChild(new N(3, '#text', v)); else this.nodeValue = v; }
}
function testi(base, out = []) { for (const c of base.childNodes) { if (c.nodeType === 3) out.push(c); else testi(c, out); } return out; }
function paginaFinta() {
    const html = new N(1, 'HTML'); const head = new N(1, 'HEAD'); const body = new N(1, 'BODY');
    html.appendChild(head); html.appendChild(body);
    const doc = {
        documentElement: html, head, body,
        createElement: (n) => new N(1, n.toUpperCase()),
        createTextNode: (v) => new N(3, '#text', v),
        createDocumentFragment: () => new N(11, '#fragment'),
        createTreeWalker: (base) => { const l = testi(base); let i = 0; return { nextNode: () => l[i++] || null }; },
        getElementById: (id) => { const t = (n) => { if (n.attrs && n.attrs.id === id) return n; for (const c of n.childNodes) { const r = t(c); if (r) return r; } return null; }; return t(html); },
        addEventListener() {}
    };
    html.style = { setProperty() {} };
    return { doc, html, body };
}
const bottone = (doc, testo) => { const b = doc.createElement('button'); b.appendChild(doc.createTextNode(testo)); return b; };

test('eWebKit: iPhone/iPad (anche Chrome per iOS) e Safari sì; Chrome, Android, Edge, Firefox no', () => {
    const ua = {
        iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/155.0.8059.37 Mobile/15E148 Safari/604.1',
        iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1',
        macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15',
        chrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
        android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        androidVecchio: 'Mozilla/5.0 (Linux; Android 4.4; Nexus 5) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Mobile Safari/537.36',
        edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
        firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'
    };
    assert.equal(P.eWebKit(ua.iphoneChrome), true);
    assert.equal(P.eWebKit(ua.iphoneSafari), true);
    assert.equal(P.eWebKit(ua.macSafari), true);
    for (const k of ['chrome', 'android', 'androidVecchio', 'edge', 'firefox']) assert.equal(P.eWebKit(ua[k]), false, k);
    assert.equal(P.eWebKit(''), false);
    assert.equal(P.eWebKit(undefined), false);
});

test('dividi: ogni emoji delle 27 diventa un pezzo, il resto del testo resta, VS16 incluso', () => {
    const p = P.dividi('🦊 07 e ⛵️ ok 🙂');
    assert.deepEqual(p.map(x => x.t), ['emo', 'testo', 'emo', 'testo']);
    assert.equal(p[0].cp, 0x1F98A);
    assert.equal(p[1].v, ' 07 e ');
    assert.equal(p[2].v, '⛵️');
    assert.equal(p[2].cp, 0x26F5);
    assert.equal(p[3].v, ' ok 🙂');                      // la 🙂 non è fra le 27: resta testo
    assert.deepEqual(P.dividi('solo testo'), [{ t: 'testo', v: 'solo testo' }]);
    assert.deepEqual(P.dividi('').map(x => x.t), ['testo']);
    assert.deepEqual(P.dividi('🦊🐼').map(x => x.cp), [0x1F98A, 0x1F43C]);     // due di fila
});

test('avvolgiSotto: il testo resta (textContent identico), ogni emoji ha span e immagine, il resto non si tocca', () => {
    const { doc, body } = paginaFinta();
    const b = bottone(doc, '🦊'); body.appendChild(b);
    const riga = doc.createElement('div'); riga.appendChild(doc.createTextNode('🐼 03 e 🙂')); body.appendChild(riga);
    const sc = doc.createElement('script'); sc.appendChild(doc.createTextNode('var x="🦊"')); body.appendChild(sc);
    const ta = doc.createElement('textarea'); ta.appendChild(doc.createTextNode('🦊')); body.appendChild(ta);
    const prima = body.textContent;
    assert.equal(P.avvolgiSotto(doc, body), 2);
    assert.equal(body.textContent, prima, 'il testo deve restare identico');
    assert.equal(b.textContent, '🦊');
    const span = b.childNodes[0];
    assert.equal(span.className, 'mappai-emo');
    assert.equal(span.attrs['data-e'], '🦊');
    assert.equal(span.style.backgroundImage, 'url(/public/fonts/emoji/1f98a.svg?v=0108)');
    assert.equal(riga.childNodes.length, 2);                      // lo span della 🐼 + il testo « 03 e 🙂»
    assert.equal(sc.textContent, 'var x="🦊"');
    assert.equal(sc.childNodes[0].nodeType, 3);                   // script e textarea intatti
    assert.equal(ta.childNodes[0].nodeType, 3);
    assert.equal(P.avvolgiSotto(doc, body), 0, 'una seconda passata non fa niente (nessun annidamento)');
});

test('avviaImmagini: stile una volta sola, emoji già in pagina avvolte, e quelle aggiunte dopo dall\'osservatore', () => {
    const { doc, html, body } = paginaFinta();
    body.appendChild(bottone(doc, '🐸'));
    let callback;
    const win = { MutationObserver: function (cb) { callback = cb; this.observe = () => {}; } };
    P.avviaImmagini(doc, win);
    P.avviaImmagini(doc, win);
    assert.equal(doc.head.childNodes.length, 1, 'lo stile si aggiunge una volta');
    assert.match(doc.head.childNodes[0].textContent, /\.mappai-emo\{/);
    assert.equal(html.attrs['data-emoji'], 'immagini');
    assert.equal(body.childNodes[0].childNodes[0].className, 'mappai-emo');
    // il codice della pagina aggiunge un bottone e cambia un testo
    const nuovo = bottone(doc, '🦁'); body.appendChild(nuovo);
    const t = body.childNodes[0].childNodes[0].childNodes[0];       // il testo dentro uno span: l'osservatore lo salta
    callback([{ type: 'childList', addedNodes: [nuovo] }, { type: 'characterData', target: t }]);
    assert.equal(nuovo.childNodes[0].className, 'mappai-emo');
    assert.equal(nuovo.textContent, '🦁');
    assert.equal(body.childNodes[0].childNodes[0].childNodes.length, 1, 'niente annidamento');
});

test('rete di salvataggio: se l\'immagine non arriva non si avvolge niente e lo stack ripiega sulle emoji di sistema', () => {
    const { doc, html, body } = paginaFinta();
    body.appendChild(bottone(doc, '🦊'));
    let stile = null;
    html.style = { setProperty: (k, v) => { stile = [k, v]; } };
    const win = { getComputedStyle: () => ({ getPropertyValue: () => STACK }), Image: function () { setTimeout(() => this.onerror(), 0); } };
    P.eseguiImmagini(doc, win);
    return new Promise(r => setTimeout(r, 20)).then(() => {
        assert.equal(html.attrs['data-emoji'], 'sistema');
        assert.equal(stile[0], '--emoji');
        assert.ok(!/MappAI Emoji/.test(stile[1]));
        assert.equal(body.childNodes[0].childNodes[0].nodeType, 3, 'testo intatto');
    });
});

test('rete di salvataggio, lato buono: se l\'immagine arriva si avvolge', () => {
    const { doc, html, body } = paginaFinta();
    body.appendChild(bottone(doc, '🦊'));
    const win = { Image: function () { setTimeout(() => this.onload(), 0); } };   // niente MutationObserver: ok lo stesso
    P.eseguiImmagini(doc, win);
    return new Promise(r => setTimeout(r, 20)).then(() => {
        assert.equal(html.attrs['data-emoji'], 'immagini');
        assert.equal(body.childNodes[0].childNodes[0].className, 'mappai-emo');
    });
});

/* ── packet 0108 (16/10/2026): le emoji decorative entrano nel set ────────── */
test('0108: le emoji decorative delle pagine (⚠️, 💡, 📎…) sono avvolte come le 27', () => {
    const { doc, body } = paginaFinta();
    const riga = doc.createElement('div');
    riga.appendChild(doc.createTextNode('💡 suggerimento e 📎 allegato'));
    body.appendChild(riga);
    const prima = body.textContent;
    assert.equal(P.avvolgiSotto(doc, body), 1);
    assert.equal(body.textContent, prima, 'il testo deve restare identico');
    const span = riga.childNodes.filter(n => n.className === 'mappai-emo');
    assert.equal(span.length, 2);
    assert.equal(span[0].style.backgroundImage, 'url(/public/fonts/emoji/1f4a1.svg?v=0108)');
    assert.equal(span[1].style.backgroundImage, 'url(/public/fonts/emoji/1f4ce.svg?v=0108)');
});

test('0108: una sequenza con U+FE0F (⚠️) resta intera dentro lo span', () => {
    const pezzi = P.dividi('⚠️ attenzione');
    assert.equal(pezzi[0].t, 'emo');
    assert.equal(pezzi[0].v, '\u26A0\uFE0F');
    assert.equal(pezzi[0].cp, 0x26A0);
    assert.equal(pezzi[1].v, ' attenzione');
});

test('0108: ogni pagina chiede il font e la prova con la versione, così un telefono non tiene quelli vecchi', () => {
    for (const rel of PAGINE) {
        const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        assert.match(html, /MappAIEmoji\.ttf\?v=0108'/, rel + ': font senza ?v=');
        assert.match(html, /mappai-emoji-prova\.js\?v=0108"/, rel + ': prova senza ?v=');
    }
});
