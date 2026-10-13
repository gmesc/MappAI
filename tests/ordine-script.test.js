'use strict';
/*
 * ordine-script.test.js — l'ordine di caricamento in index.html È una dipendenza
 * (invariante 5, trappola 51), e i test in Node non la vedono: lì `require`
 * risolve tutto, in qualunque ordine.
 *
 * Guasto d'origine (packet 0030): dal commit 39e8325 dell'11/9/2026
 * `mappai-anchor-core.js` era caricato PRIMA di `mappai-boilerplate-core.js`.
 * L'àncora legge `root.MappAIBoilerplate` AL CARICAMENTO (nel ramo browser del
 * suo UMD, `root.X = factory(root.A, root.B)`), lo trovava indefinito, e il
 * filtro delle righe strutturali non girava: «1) La Svizzera commerciava…»
 * passava nelle citazioni, «C IRCUITO IN SERIE» entrava come frase. I test,
 * tutti in Node, erano verdi.
 *
 * La regola: ogni script di index.html che legge `root.NOME` al caricamento
 * deve venire DOPO lo script che definisce `NOME`.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, '..', 'public');

// Gli script di una pagina, nell'ordine, coi commenti HTML tolti (uno script
// commentato non si carica).
function scriptDellaPagina(html) {
    const senzaCommenti = html.replace(/<!--[\s\S]*?-->/g, '');
    return [...senzaCommenti.matchAll(/<script\b[^>]*\bsrc="([^"?#]+)[^"]*"/g)]
        .map(m => m[1])
        .filter(src => !/^(?:https?:)?\/\//.test(src));
}

// Chi legge che cosa al caricamento: il ramo browser dell'UMD dei core,
// `root.Esportato = factory(root.A, root.B, …)`.
function letturaAlCaricamento(code) {
    const m = code.match(/root\.([A-Za-z_$][\w$]*)\s*=\s*factory\(([^)]*)\)/);
    if (!m) return null;
    return { esporta: m[1], legge: [...m[2].matchAll(/root\.([A-Za-z_$][\w$]*)/g)].map(x => x[1]) };
}

function definisce(code, nome) {
    return new RegExp('(?:root|window|self|globalThis)\\.' + nome.replace(/\$/g, '\\$') + '\\s*=(?!=)').test(code);
}

// → [{ lettore, nome, definitore, problema: 'dopo' | 'nessuno' }]
function violazioni(scripts) {
    const out = [];
    scripts.forEach((s, i) => {
        const l = letturaAlCaricamento(s.code);
        if (!l) return;
        for (const nome of l.legge) {
            const j = scripts.findIndex(x => definisce(x.code, nome));
            if (j < 0) out.push({ lettore: s.src, nome, definitore: null, problema: 'nessuno' });
            else if (j > i) out.push({ lettore: s.src, nome, definitore: scripts[j].src, problema: 'dopo' });
        }
    });
    return out;
}

function caricaPagina(file) {
    const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
    return scriptDellaPagina(html).map(src => {
        const p = path.join(PUBLIC, src);
        return { src, code: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '' };
    });
}

test('index.html: nessun core è caricato prima di un modulo che lui legge al caricamento', () => {
    const scripts = caricaPagina('index.html');
    const lettori = scripts.filter(s => letturaAlCaricamento(s.code) && letturaAlCaricamento(s.code).legge.length);
    assert.ok(lettori.length >= 10, 'il test deve vedere i core che leggono al caricamento, o non prova niente (visti: ' + lettori.length + ')');
    const v = violazioni(scripts);
    assert.deepStrictEqual(v, [], v.map(x => x.lettore + ' legge ' + x.nome + (x.definitore ? ', definito DOPO da ' + x.definitore : ', che nessuno script della pagina definisce')).join('\n'));
});

test('index.html: boilerplate-core prima dell\'àncora e di evidence-core (il guasto del 0030)', () => {
    const src = caricaPagina('index.html').map(s => s.src);
    const pos = nome => src.indexOf('js/' + nome);
    assert.ok(pos('mappai-boilerplate-core.js') >= 0 && pos('mappai-anchor-core.js') >= 0 && pos('mappai-evidence-core.js') >= 0);
    assert.ok(pos('mappai-boilerplate-core.js') < pos('mappai-anchor-core.js'));
    assert.ok(pos('mappai-deepen-core.js') < pos('mappai-anchor-core.js'));
    assert.ok(pos('mappai-boilerplate-core.js') < pos('mappai-evidence-core.js'));
});

test('il controllo vede davvero l\'ordine sbagliato (controprova sull\'ordine dell\'11/9)', () => {
    const scripts = caricaPagina('index.html');
    const i = scripts.findIndex(s => s.src === 'js/mappai-anchor-core.js');
    const j = scripts.findIndex(s => s.src === 'js/mappai-boilerplate-core.js');
    const vecchio = scripts.slice();
    const [bp] = vecchio.splice(j, 1);
    vecchio.splice(vecchio.findIndex(s => s.src === 'js/mappai-anchor.js') + 1, 0, bp);   // dov'era prima del 0030
    assert.ok(i >= 0 && j >= 0);
    assert.deepStrictEqual(violazioni(vecchio), [{ lettore: 'js/mappai-anchor-core.js', nome: 'MappAIBoilerplate', definitore: 'js/mappai-boilerplate-core.js', problema: 'dopo' }]);
    // e uno script commentato non conta come caricato
    assert.deepStrictEqual(scriptDellaPagina('<!-- <script src="js/a.js"></script> --><script src="js/b.js?v=1"></script><script src="https://x/y.js"></script>'), ['js/b.js']);
});
