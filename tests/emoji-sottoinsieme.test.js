'use strict';
/*
 * Il font emoji locale (15/9/2026) — `public/fonts/MappAIEmoji.ttf`.
 *
 * Le emoji che l'app usa per l'IDENTITÀ non sono decorazione: 🦊 07 è un
 * allievo, 🐱🍎🚂 è il codice d'accesso di un gruppo. Noto Color Emoji intero
 * pesa 23,9 MB e arriva dalla rete; il sottoinsieme di 27 glifi pesa 254 KB e
 * sta sul disco. Questo test è la guardia del guasto che non si vede finché non
 * sei in aula: **qualcuno aggiunge un'emoji a `EMOJI_SET` o a `GROUP_EMOJI` e
 * non rilancia `tools/font/emoji-sottoinsieme.py`** — a schermo comparirebbe il
 * ripiego di sistema, o un rettangolo vuoto, proprio sul codice per entrare.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FONT = path.join(ROOT, 'public/fonts/MappAIEmoji.ttf');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

global.window = {};
const LIVE = require(path.join(ROOT, 'public/js/mappai-live-core.js'))
    || window.MappAILiveCore;
const COLLAB = require(path.join(ROOT, 'public/js/mappai-collab-core.js'))
    || window.MappAICollabCore;

/* Legge la `cmap` del .ttf senza dipendenze: i formati 4 e 12 bastano per un
   font di emoji (il 12 copre i codepoint sopra U+FFFF, che sono quasi tutte). */
function codepointDelFont(file) {
    const b = fs.readFileSync(file);
    const numTables = b.readUInt16BE(4);
    let cmapOff = 0;
    for (let i = 0; i < numTables; i++) {
        const rec = 12 + i * 16;
        if (b.toString('ascii', rec, rec + 4) === 'cmap') cmapOff = b.readUInt32BE(rec + 8);
    }
    assert.ok(cmapOff, 'il font non ha una tabella cmap');
    const dentro = new Set();
    const n = b.readUInt16BE(cmapOff + 2);
    for (let i = 0; i < n; i++) {
        const sub = cmapOff + b.readUInt32BE(cmapOff + 4 + i * 8 + 4);
        const formato = b.readUInt16BE(sub);
        if (formato === 12) {
            const gruppi = b.readUInt32BE(sub + 12);
            for (let g = 0; g < gruppi; g++) {
                const o = sub + 16 + g * 12;
                for (let c = b.readUInt32BE(o); c <= b.readUInt32BE(o + 4); c++) dentro.add(c);
            }
        } else if (formato === 4) {
            const segX2 = b.readUInt16BE(sub + 6);
            for (let s = 0; s < segX2 / 2; s++) {
                const fine = b.readUInt16BE(sub + 14 + s * 2);
                const inizio = b.readUInt16BE(sub + 16 + segX2 + s * 2);
                if (inizio === 0xFFFF) continue;
                for (let c = inizio; c <= fine; c++) dentro.add(c);
            }
        }
    }
    return dentro;
}

const attese = () => {
    const out = new Map();  // emoji → da dove viene
    for (const it of LIVE.EMOJI_SET) out.set(it.emoji, `EMOJI_SET/${it.key}`);
    for (const s of COLLAB.GROUP_EMOJI)
        for (const it of s.items) if (!out.has(it.emoji)) out.set(it.emoji, `GROUP_EMOJI/${s.set}/${it.key}`);
    return out;
};

test('il font locale esiste e non è cresciuto oltre il ragionevole', () => {
    assert.ok(fs.existsSync(FONT), 'manca public/fonts/MappAIEmoji.ttf — rilancia tools/font/emoji-sottoinsieme.py');
    const kb = fs.statSync(FONT).size / 1024;
    assert.ok(kb > 50, `${kb.toFixed(0)} KB: troppo piccolo, i glifi a colori non ci sono`);
    assert.ok(kb < 600, `${kb.toFixed(0)} KB: il sottoinsieme sta diventando il font intero (23,9 MB). Rivedere l'elenco`);
});

test('OGNI emoji di identità è dentro il font — è il test che scopre il font non rigenerato', () => {
    const dentro = codepointDelFont(FONT);
    const mancanti = [];
    for (const [emoji, dove] of attese()) {
        for (const c of emoji) if (!dentro.has(c.codePointAt(0))) mancanti.push(`${emoji} (${dove})`);
    }
    assert.deepEqual(mancanti, [],
        'mancano nel font: ' + mancanti.join(', ') +
        '\n→ python3 tools/font/emoji-sottoinsieme.py');
});

test('il font non porta glifi che nessuno usa', () => {
    const dentro = codepointDelFont(FONT);
    const usati = new Set();
    for (const emoji of attese().keys()) for (const c of emoji) usati.add(c.codePointAt(0));
    // .notdef e simili non stanno nella cmap, quindi il confronto è pulito.
    const extra = [...dentro].filter(c => !usati.has(c)).map(c => String.fromCodePoint(c));
    assert.deepEqual(extra, [], 'glifi di troppo: ' + extra.join(' '));
});

test("le pagine che mostrano le identità mettono 'MappAI Emoji' PRIMA nello stack", () => {
    // Il guasto tipico (CLAUDE.md globale): si dichiara il font e non lo si mette
    // nello stack effettivo → l'emoji prende il glifo dal primo font che ce l'ha,
    // cioè quello di sistema, e il @font-face non serve a niente.
    const pagine = ['public/live/student.html', 'public/live/scelta.html',
        'public/live/materials.html', 'public/live/file.html', 'public/live/timeline-build.html',
        'public/collab/student.html', 'public/tutor/student.html'];
    for (const p of pagine) {
        const html = leggi(p);
        assert.match(html, /@font-face[^}]*MappAIEmoji\.ttf/, `${p}: manca il @font-face`);
        assert.match(html, /'MappAI Emoji'\s*,\s*'Noto Color Emoji'/,
            `${p}: 'MappAI Emoji' non precede Noto in nessuno stack`);
    }
});

// 16/9/2026 — l'app ha il suo file (le 27 + l'interfaccia); gli allievi NO.
const FONT_APP = path.join(ROOT, 'public/fonts/MappAIEmojiApp.ttf');

test("index.html carica MappAIEmojiApp.ttf, che contiene tutte le 27", () => {
    const html = leggi('public/index.html');
    assert.match(html, /@font-face[^}]*'MappAI Emoji'[^}]*MappAIEmojiApp\.ttf/);
    const app = codepointDelFont(FONT_APP);
    for (const c of codepointDelFont(FONT)) assert.ok(app.has(c), `manca ${String.fromCodePoint(c)} in MappAIEmojiApp.ttf`);
});

test("le pagine QR degli allievi NON scaricano il font dell'app: solo le 27", () => {
    for (const p of ['public/live/student.html', 'public/live/scelta.html', 'public/live/materials.html',
        'public/live/file.html', 'public/live/timeline-build.html', 'public/collab/student.html',
        'public/tutor/student.html']) {
        assert.doesNotMatch(leggi(p), /MappAIEmojiApp/, `${p} scaricherebbe 1,4 MB invece di 258 KB`);
    }
});
