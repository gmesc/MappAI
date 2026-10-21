'use strict';
/*
 * Packet 0108 (16/10/2026) — le emoji senza Google Fonts.
 *
 * Fino al 16/10 le sette pagine degli allievi, i report e le tessere di MappAI Live
 * e il cruscotto dei consumi chiedevano Noto Color Emoji a fonts.googleapis.com. In
 * aula senza rete (o dietro il filtro della scuola) le emoji cadevano su quelle di
 * sistema, e il PDF delle tessere usciva con le emoji Apple: un'identità diversa da
 * quella che l'allievo vede sul telefono. Ora tutto viene dal set locale dello 0099
 * esteso: `public/fonts/MappAIEmoji.ttf` per le pagine, e i suoi byte incorporati
 * (`public/js/vendor/mappai-emoji-incorpora.js`) per i documenti, che nascono da un
 * indirizzo `data:` dove un percorso al font non arriva.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const NOVE = [
    'public/live/student.html', 'public/live/scelta.html', 'public/live/timeline-build.html',
    'public/live/file.html', 'public/live/materials.html',
    'public/collab/student.html', 'public/tutor/student.html',
    'public/js/mappai-live-reports.js', 'public/js/mappai-usage-dashboard.js',
];

test('nessuno dei nove file chiede qualcosa a Google Fonts', () => {
    for (const rel of NOVE) {
        // il nome del dominio può restare nei commenti che raccontano la storia; un indirizzo no
        assert.doesNotMatch(leggi(rel), /https?:\/\/fonts\.(googleapis|gstatic)\.com/, rel);
    }
});

/* ── i documenti: report e tessere ───────────────────────────────────────── */
const LR = require(path.join(ROOT, 'public/js/mappai-live-reports.js'));
const META = { mapTitle: 'Prova', sessionId: 'x', startedAt: Date.now() };
const FACCIA = /@font-face\{font-family:'MappAI Emoji';src:url\(data:font\/woff;base64,([A-Za-z0-9+/=]+)\) format\('woff'\)/;

function documenti() {
    const out = [['tessere', LR.buildCredentialCardsHtml({ name: '2A', year: '2026',
        students: [{ emoji: '🦊', emojiKey: 'volpe', num: '07', name: 'Ada' }] })]];
    out.push(['tessere per il PDF', LR.buildCredentialCardsHtml({ name: '2A', students: [] }, { perPdf: true })]);
    for (const nome of ['buildQuestionsReportHtml', 'buildStudentsReportHtml',
        'buildTimelineWorkshopReportHtml', 'buildSceltaReportHtml']) {
        let html = null;
        try { html = LR[nome](META, {}); } catch (e) { html = null; }  // i dati vuoti non contano: serve la testa
        if (html) out.push([nome, html]);
    }
    return out;
}

test('ogni documento porta dentro i byte di MappAI Emoji, e niente <link> alla rete', () => {
    const docs = documenti();
    assert.ok(docs.length >= 2, 'nessun documento costruito');
    for (const [nome, html] of docs) {
        assert.match(html, FACCIA, nome + ': manca la @font-face incorporata');
        assert.doesNotMatch(html, /<link[^>]+fonts\./, nome + ': <link> a un servizio di caratteri');
    }
});

test("le emoji dei documenti hanno 'MappAI Emoji' nello stack effettivo (corpo e tessera)", () => {
    const html = documenti()[0][1];
    assert.match(html, /body\{font-family:'Space Mono','MappAI Emoji',/);
    assert.match(html, /\.cred-emoji\{[^}]*font-family:'MappAI Emoji',/);
});

test('nel browser il modulo dei report carica da sé il file incorporato', () => {
    assert.match(leggi('public/js/mappai-live-reports.js'), /'vendor\/mappai-emoji-incorpora\.js'/);
});

/* ── il file incorporato è lo stesso font ────────────────────────────────── */
function cmapDa(buf) {
    const dentro = new Set();
    const n = buf.readUInt16BE(2);
    for (let i = 0; i < n; i++) {
        const sub = buf.readUInt32BE(4 + i * 8 + 4);
        const formato = buf.readUInt16BE(sub);
        if (formato === 12) {
            const gruppi = buf.readUInt32BE(sub + 12);
            for (let g = 0; g < gruppi; g++) {
                const o = sub + 16 + g * 12;
                for (let c = buf.readUInt32BE(o); c <= buf.readUInt32BE(o + 4); c++) dentro.add(c);
            }
        } else if (formato === 4) {
            const segX2 = buf.readUInt16BE(sub + 6);
            for (let s = 0; s < segX2 / 2; s++) {
                const fine = buf.readUInt16BE(sub + 14 + s * 2);
                const inizio = buf.readUInt16BE(sub + 16 + segX2 + s * 2);
                if (inizio === 0xFFFF) continue;
                for (let c = inizio; c <= fine; c++) dentro.add(c);
            }
        }
    }
    return dentro;
}
function tabelleTtf(b) {
    const t = {};
    for (let i = 0; i < b.readUInt16BE(4); i++) {
        const r = 12 + i * 16;
        t[b.toString('ascii', r, r + 4)] = b.subarray(b.readUInt32BE(r + 8), b.readUInt32BE(r + 8) + b.readUInt32BE(r + 12));
    }
    return t;
}
function tabelleWoff(b) {
    assert.equal(b.toString('ascii', 0, 4), 'wOFF', 'non è un WOFF');
    const t = {};
    for (let i = 0; i < b.readUInt16BE(12); i++) {
        const r = 44 + i * 20;
        const off = b.readUInt32BE(r + 4), comp = b.readUInt32BE(r + 8), orig = b.readUInt32BE(r + 12);
        const dati = b.subarray(off, off + comp);
        t[b.toString('ascii', r, r + 4)] = comp < orig ? zlib.inflateSync(dati) : dati;
    }
    return t;
}

test('il file incorporato ha le stesse emoji di MappAIEmoji.ttf, senza la tabella SVG', () => {
    const INC = require(path.join(ROOT, 'public/js/vendor/mappai-emoji-incorpora.js'));
    const b64 = INC.facce().match(FACCIA)[1];
    const woff = tabelleWoff(Buffer.from(b64, 'base64'));
    const ttf = tabelleTtf(fs.readFileSync(path.join(ROOT, 'public/fonts/MappAIEmoji.ttf')));
    assert.deepEqual([...cmapDa(woff.cmap)].sort(), [...cmapDa(ttf.cmap)].sort(),
        'file incorporato e font divergono: rilanciare python3 tools/font/emoji-sottoinsieme.py');
    assert.ok(woff.COLR, 'manca COLR: Electron non disegnerebbe niente');
    assert.ok(!woff['SVG '], 'la tabella SVG non serve a Electron e pesa');
    const kb = fs.statSync(path.join(ROOT, 'public/js/vendor/mappai-emoji-incorpora.js')).size / 1024;
    assert.ok(kb < 200, kb.toFixed(0) + ' KB: ogni report se li porta dentro');
});
