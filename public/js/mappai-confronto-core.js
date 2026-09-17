/* ═══════════════════════════════════════════════════════════════════════════
   CONFRONTARE DUE TESTI — dove sono le differenze (17/9/26)

   PERCHÉ. In «Rivedi i materiali» la bozza originale e l'anteprima con le
   decisioni stavano una sotto l'altra, intere: per trovare che cosa cambiava
   bisognava rileggere due volte paragrafi lunghi. Giacomo si è fermato a 3
   materiali su 5 per questo (17/9).

   CHE COSA FA. `confronta(a, b)` allinea i due testi FRASE per frase e, dentro le
   frasi cambiate, PAROLA per parola. Restituisce righe affiancabili:
     { tipo: 'uguale', a, b, inizioParagrafo }
     { tipo: 'cambiata', a: [pezzi], b: [pezzi], inizioParagrafo }
   con pezzi { t, tipo: 'uguale' | 'tolto' | 'aggiunto' }. La formattazione non
   conta: `pulisci` toglie **, ##, _ e backtick, e i trattini degli elenchi
   diventano puntini; i richiami alle note ([1]) restano, fanno parte del testo.

   Modulo puro (UMD), testato in Node: tests/confronto-core.test.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIConfrontoCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const testo = v => String(v == null ? '' : v);
    const chiave = s => s.replace(/\s+/g, ' ').trim();

    /* Una riga senza simboli di formattazione Markdown. */
    function pulisciRiga(riga) {
        return riga
            .replace(/^\s{0,3}#{1,6}\s+/, '')
            .replace(/^(\s*)[-*+]\s+/, '$1• ')
            .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
            .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,;:!?]|$)/g, '$1$2')
            .replace(/`+/g, '').replace(/\*\*/g, '');
    }
    function pulisci(valore) { return testo(valore).split('\n').map(pulisciRiga).join('\n'); }

    /* Le frasi, con il segno di inizio paragrafo. Una riga è un paragrafo; dentro,
       si taglia dopo . ! ? … ; : seguiti da spazio. «pag. 3» si spezza male: per
       un confronto è innocuo, la stessa regola vale per i due testi. */
    function frasi(valore) {
        const out = [];
        pulisci(valore).split('\n').forEach(riga => {
            if (!riga.trim()) return;
            riga.trim().split(/(?<=[.!?…;:])\s+(?=\S)/).forEach((f, k) => out.push({ t: f, inizioParagrafo: k === 0 }));
        });
        return out;
    }

    /* Allineamento di due sequenze per chiave: LCS classica.
       ponytail: tabella n×m; oltre 4 milioni di celle si rinuncia all'allineamento
       fine (tutto «cambiato»). I materiali veri stanno sotto le 300 frasi. */
    function allinea(A, B, k) {
        const n = A.length, m = B.length;
        if (n * m > 4e6) return [...A.map(x => ['-', x]), ...B.map(x => ['+', x])];
        const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
        for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
            L[i][j] = k(A[i]) === k(B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        const ops = [];
        let i = 0, j = 0;
        while (i < n && j < m) {
            if (k(A[i]) === k(B[j])) { ops.push(['=', A[i], B[j]]); i++; j++; }
            else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', A[i++]]);
            else ops.push(['+', B[j++]]);
        }
        while (i < n) ops.push(['-', A[i++]]);
        while (j < m) ops.push(['+', B[j++]]);
        return ops;
    }

    /* Parola per parola: ogni parola si porta dietro il suo spazio, così i pezzi
       rimessi in fila ridanno il testo. Pezzi vicini dello stesso tipo si fondono. */
    function parole(a, b) {
        const tok = s => s.match(/\S+\s*/g) || [];
        const ops = allinea(tok(a), tok(b), x => x.trim());
        const pa = [], pb = [];
        const spingi = (lista, t, tipo) => {
            const ultimo = lista[lista.length - 1];
            if (ultimo && ultimo.tipo === tipo) ultimo.t += t; else lista.push({ t, tipo });
        };
        ops.forEach(([op, x, y]) => {
            if (op === '=') { spingi(pa, x, 'uguale'); spingi(pb, y, 'uguale'); }
            else if (op === '-') spingi(pa, x, 'tolto');
            else spingi(pb, x, 'aggiunto');
        });
        return { a: pa, b: pb };
    }

    function confronta(a, b) {
        const ops = allinea(frasi(a), frasi(b), f => chiave(f.t));
        const righe = [];
        for (let k = 0; k < ops.length;) {
            if (ops[k][0] === '=') {
                righe.push({ tipo: 'uguale', a: ops[k][1].t, b: ops[k][2].t, inizioParagrafo: ops[k][2].inizioParagrafo });
                k++; continue;
            }
            // un blocco di frasi tolte e aggiunte consecutive diventa UNA riga cambiata
            const tolte = [], aggiunte = [];
            while (k < ops.length && ops[k][0] !== '=') { (ops[k][0] === '-' ? tolte : aggiunte).push(ops[k][1]); k++; }
            const p = parole(tolte.map(f => f.t).join(' '), aggiunte.map(f => f.t).join(' '));
            righe.push({ tipo: 'cambiata', a: p.a, b: p.b, inizioParagrafo: (aggiunte[0] || tolte[0]).inizioParagrafo });
        }
        return { righe, modifiche: righe.filter(r => r.tipo === 'cambiata').length };
    }

    return { pulisci, frasi, confronta };
}));
