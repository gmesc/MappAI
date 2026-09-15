/* ══ VICINO — «questo valore nuovo assomiglia a un token che ho già?» ═══════
   Il pezzo elastico del sistema: non impedisce di aggiungere, ma OBBLIGA a
   sapere che cosa si sta duplicando. È la risposta alla domanda che fa
   esplodere i design system — «serve un grigio un filo più chiaro» — chiesta
   PRIMA di scrivere l'hex, non sei mesi dopo in un censimento.

   Modulo puro (zero I/O, zero dipendenze): lo usa `censimento.js --vicino` e lo
   prova `tests/stile-vicino.test.js`.

   ⚠️ La distanza fra due colori è ΔE*76 (Lab euclidea), non CIEDE2000: più
   rozza sui blu molto saturi, esatta a sufficienza per la domanda vera di
   questo progetto, che è «questi due grigi sono lo stesso grigio?»
   (#f1f5f9 vs #f1f4f8 → ΔE 0,6: erano due token per lo stesso colore).
   Se un giorno servisse decidere fra due accenti saturi vicini, si passa a
   CIEDE2000 — e solo allora. */
'use strict';

/* ── colore ──────────────────────────────────────────────────────────────── */
const NOMI = { white: '#ffffff', black: '#000000', transparent: null };

function aRgb(v) {
    if (!v) return null;
    v = String(v).trim().toLowerCase();
    if (NOMI[v] !== undefined) return NOMI[v] ? aRgb(NOMI[v]) : null;
    let m = v.match(/^#([0-9a-f]{3})$/);
    if (m) return m[1].split('').map(c => parseInt(c + c, 16));
    m = v.match(/^#([0-9a-f]{6})$/);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = v.match(/^rgba?\(([^)]+)\)/);
    if (m) {
        const n = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
        return n.length >= 3 ? n.slice(0, 3) : null;
    }
    return null;
}

const aHex = rgb => '#' + rgb.map(v => ('0' + Math.round(v).toString(16)).slice(-2)).join('');

function aLab([r, g, b]) {
    const lin = c => { c /= 255; return c <= .04045 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    const [R, G, B] = [lin(r), lin(g), lin(b)];
    /* sRGB → XYZ (D65) → Lab */
    const X = (R * .4124 + G * .3576 + B * .1805) / .95047;
    const Y = (R * .2126 + G * .7152 + B * .0722);
    const Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
    const f = t => t > .008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
    const [fx, fy, fz] = [f(X), f(Y), f(Z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** ΔE*76 fra due colori CSS. null se uno dei due non è un colore. */
function distanzaColore(a, b) {
    const ra = aRgb(a), rb = aRgb(b);
    if (!ra || !rb) return null;
    const [la, lb] = [aLab(ra), aLab(rb)];
    return Math.sqrt(la.reduce((s, v, i) => s + (v - lb[i]) ** 2, 0));
}

/* ── lunghezze ───────────────────────────────────────────────────────────── */
/** px da un valore CSS semplice (px, rem a 16, valori interi). null se non misurabile. */
function aPx(v) {
    const m = String(v).trim().match(/^(-?[\d.]+)(px|rem|em)?$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}

/* ── verdetti ────────────────────────────────────────────────────────────── */
/* ΔE 2,3 è la soglia sotto cui l'occhio umano non distingue due tinte (JND).
   Sotto 2: è lo STESSO colore scritto due volte. Fino a 5: due colori che
   nessuno riconoscerà come due decisioni — se ci si aggiunge un token, il
   motivo va scritto. Le lunghezze: 2px di differenza su un raggio o un corpo
   non si vedono, si contano solo nel foglio di stile. */
const SOGLIE = { colore: { stesso: 2, quasi: 5 }, lunghezza: { stesso: 2, quasi: 4 } };

function verdetto(d, tipo) {
    const s = SOGLIE[tipo];
    if (d <= s.stesso) return { esito: 'riusa', perche: 'indistinguibile da un token che esiste già' };
    if (d <= s.quasi) return { esito: 'motiva', perche: 'troppo vicino a un token esistente per essere una decisione diversa' };
    return { esito: 'nuovo', perche: 'nessun token esprime questo valore' };
}

/**
 * Dato un valore e il registro dei token, restituisce i candidati ordinati per
 * distanza e il verdetto sul più vicino.
 * @param {string} valore           es. '#3b4a5f' | '13px' | '1rem'
 * @param {Array<{nome,valore,file,riga}>} token   registro (valori già risolti)
 * @param {string} [famiglia]       filtra i candidati per ruolo: 'raggi'|'fs'|'colore'…
 */
function proponi(valore, token, famiglia) {
    const tipo = aRgb(valore) ? 'colore' : (aPx(valore) !== null ? 'lunghezza' : null);
    if (!tipo) return { tipo: null, candidati: [], verdetto: null };

    const dist = t => tipo === 'colore' ? distanzaColore(valore, t.valore)
        : (aPx(t.valore) === null ? null : Math.abs(aPx(valore) - aPx(t.valore)));

    const candidati = token
        .map(t => ({ ...t, d: dist(t) }))
        .filter(t => t.d !== null && (!famiglia || famigliaDi(t.nome) === famiglia))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);

    return { tipo, candidati, verdetto: candidati.length ? verdetto(candidati[0].d, tipo) : null };
}

/** Il RUOLO che il nome di un token dichiara — serve a non proporre `--mm-gap`
 *  come raggio solo perché vale anche lui 12px (stessa cifra, altra cosa). */
function famigliaDi(nome) {
    if (/-r-|-r$|-raggio/.test(nome)) return 'raggi';
    if (/-fs\b|-fs-/.test(nome)) return 'fs';
    if (/ombra/.test(nome)) return 'ombre';
    if (/-gap|-pad|-h$|-h-|altezza/.test(nome)) return 'spazi';
    return 'colore';
}

/** Risolve `var(--x, ripiego)` finché non arriva a un valore vero.
 *  Senza, `--man-card: var(--mm-neutro, #f1f4f8)` non sarebbe confrontabile. */
function risolvi(valore, mappa, giri = 0) {
    const m = String(valore).trim().match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)$/);
    if (!m || giri > 5) return String(valore).trim();
    const puntato = mappa[m[1]];
    return risolvi(puntato !== undefined ? puntato : (m[2] || valore), mappa, giri + 1);
}

module.exports = { distanzaColore, aPx, aHex, aRgb, proponi, verdetto, famigliaDi, risolvi, SOGLIE };
