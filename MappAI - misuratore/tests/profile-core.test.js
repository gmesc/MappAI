const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const P = require('../public/js/core/mis-profile-core.js');
const PREDEFINITO_PATH = path.join(__dirname, '..', 'public', 'profili', 'predefinito.json');

function predefinito() {
    return JSON.parse(fs.readFileSync(PREDEFINITO_PATH, 'utf8'));
}
function errori(res) { return res.errori.map(e => e.vincolo + ':' + e.campo); }

// ── Il profilo predefinito deve essere valido: se non lo è, non parte niente ──
test('il profilo predefinito è valido', () => {
    const res = P.validate(predefinito());
    assert.strictEqual(res.ok, true, 'errori: ' + JSON.stringify(res.errori, null, 2));
});

test('il profilo predefinito ha gli 8 componenti dell’Allegato A e pesi che sommano a 100', () => {
    const p = predefinito();
    assert.strictEqual(p.componenti.length, 8);
    const somma = p.componenti.reduce((a, c) => a + c.peso, 0);
    assert.strictEqual(somma, 100);
    assert.deepStrictEqual(p.componenti.map(c => c.peso), [22, 12, 12, 8, 12, 15, 9, 10]);
});

test('il componente 8 esiste ed è quello dei nessi logici', () => {
    const c = P.componente(predefinito(), 8);
    assert.ok(c, 'componente 8 assente');
    assert.match(c.nome.toLowerCase(), /nessi logici/);
    // due piani: lessicale (ovunque) e strutturale (solo grafo)
    assert.strictEqual(c.metriche.length, 2);
    assert.strictEqual(c.metriche[1].richiede, 'grafo');
});

test('il componente 6 è moderato dal fattore di sostanza', () => {
    const c = P.componente(predefinito(), 6);
    assert.strictEqual(c.moderatoDa, 'fattoreSostanza');
});

test('la velocità di lettura è 120 parole al minuto', () => {
    assert.strictEqual(P.param(predefinito(), 'velocitaLetturaPpm'), 120);
});

// ── Vincoli di validazione (FR-033-ter) ─────────────────────────────────────
test('pesi che non sommano a 100 → rifiuto', () => {
    const p = predefinito();
    p.componenti[0].peso = 40;
    const res = P.validate(p);
    assert.strictEqual(res.ok, false);
    assert.ok(errori(res).some(e => e.startsWith('somma:')), errori(res).join(' | '));
});

test('ancoraggi non monotòni → rifiuto', () => {
    const p = predefinito();
    p.componenti[1].metriche[0].ancoraggi = [[25, 0], [18, 80], [12, 40]];
    const res = P.validate(p);
    assert.strictEqual(res.ok, false);
    assert.ok(errori(res).some(e => e.startsWith('monotonia:')), errori(res).join(' | '));
});

test('parametro senza «limite» → rifiuto', () => {
    const p = predefinito();
    delete p.parametri.parolaLungaMinChar.limite;
    const res = P.validate(p);
    assert.strictEqual(res.ok, false);
    assert.ok(errori(res).some(e => e === 'documentazione:parametri.parolaLungaMinChar.limite'),
        errori(res).join(' | '));
});

test('componente senza «motivo» → rifiuto', () => {
    const p = predefinito();
    delete p.componenti[3].motivo;
    const res = P.validate(p);
    assert.strictEqual(res.ok, false);
    assert.ok(errori(res).some(e => e.startsWith('documentazione:')), errori(res).join(' | '));
});

test('valore fuori dall’intervallo dichiarato → rifiuto', () => {
    const p = predefinito();
    p.parametri.parolaLungaMinChar.valore = 99;
    const res = P.validate(p);
    assert.strictEqual(res.ok, false);
    assert.ok(errori(res).some(e => e.startsWith('intervallo:')), errori(res).join(' | '));
});

test('profilo assente → rifiuto senza eccezioni', () => {
    assert.strictEqual(P.validate(null).ok, false);
    assert.strictEqual(P.validate(undefined).ok, false);
    assert.strictEqual(P.validate('non un profilo').ok, false);
});

// ── derive: mai modifica in loco (FR-055, principio II) ─────────────────────
test('derive non muta il profilo di partenza', () => {
    const base = predefinito();
    const copiaPrima = JSON.stringify(base);
    const nuovo = P.derive(base, { parametri: { velocitaLetturaPpm: 150 } }, { adesso: '2026-07-28' });
    assert.strictEqual(JSON.stringify(base), copiaPrima, 'il profilo base è stato modificato');
    assert.strictEqual(P.param(nuovo, 'velocitaLetturaPpm'), 150);
    assert.strictEqual(P.param(base, 'velocitaLetturaPpm'), 120);
});

test('derive registra la catena di derivazione e cambia identificativo', () => {
    const base = predefinito();
    const nuovo = P.derive(base, { parametri: { velocitaLetturaPpm: 150 } }, { adesso: '2026-07-28' });
    assert.strictEqual(nuovo.derivatoDa, base.id);
    assert.notStrictEqual(nuovo.id, base.id);
    assert.match(nuovo.id, /^personale-[0-9a-f]{8}$/);
});

test('derive produce un profilo ancora valido', () => {
    const nuovo = P.derive(predefinito(), { pesi: { 1: 20, 8: 12 } }, { adesso: '2026-07-28' });
    const res = P.validate(nuovo);
    assert.strictEqual(res.ok, true, JSON.stringify(res.errori));
});

// ── fingerprint: deterministica sui valori, insensibile ai testi ────────────
test('fingerprint è deterministica', () => {
    const a = P.fingerprint(predefinito());
    const b = P.fingerprint(predefinito());
    assert.strictEqual(a, b);
});

test('fingerprint cambia se cambia una soglia', () => {
    const p = predefinito();
    const prima = P.fingerprint(p);
    p.parametri.velocitaLetturaPpm.valore = 150;
    assert.notStrictEqual(P.fingerprint(p), prima);
});

test('fingerprint NON cambia se cambia solo la formulazione di un motivo', () => {
    // Altrimenti riscrivere una spiegazione spezzerebbe le serie dell'ANDAMENTO.
    const p = predefinito();
    const prima = P.fingerprint(p);
    p.componenti[0].motivo = 'Formulazione diversa, stessa sostanza.';
    p.parametri.parolaLungaMinChar.limite = 'Riscritto.';
    assert.strictEqual(P.fingerprint(p), prima);
});

// ── describe e limiti: unica fonte dei testi (FR-054) ──────────────────────
test('describe copre tutti i componenti e tutti i parametri', () => {
    const p = predefinito();
    const sez = P.describe(p);
    const comp = sez.find(s => /Componenti/.test(s.sezione));
    const soglie = sez.find(s => /Soglie/.test(s.sezione));
    assert.strictEqual(comp.voci.length, 8);
    assert.strictEqual(soglie.voci.length, Object.keys(p.parametri).length);
});

test('ogni voce di describe porta definizione, motivo e limite', () => {
    P.describe(predefinito()).forEach(s => {
        s.voci.forEach(v => {
            ['definizione', 'motivo', 'limite'].forEach(c => {
                assert.ok(v[c] && String(v[c]).trim(),
                    'voce «' + v.nome + '» senza ' + c);
            });
        });
    });
});

test('limitiDichiarati restituisce un limite per ogni componente e ogni parametro', () => {
    const p = predefinito();
    const l = P.limitiDichiarati(p);
    assert.strictEqual(l.length, p.componenti.length + Object.keys(p.parametri).length);
    assert.ok(l.every(x => x.testo && x.origine));
});
