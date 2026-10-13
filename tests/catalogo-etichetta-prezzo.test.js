'use strict';
/*
 * `priceLabel` (mappai-catalogo-core.js): il COSTO che il docente legge accanto
 * a ogni modello nella scelta per fase e nel pannello della configurazione AI.
 *
 * Il contratto: un prezzo ignoto si dichiara ignoto (mai uno zero inventato),
 * un servizio a tempo mostra la sua unità, un modello chat mostra ingresso E
 * uscita, un embedding solo l'ingresso — perché l'uscita non la fattura.
 * I numeri sono quelli del listino (verificato in catalogo-infomaniak.test.js).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-catalogo-core.js');

test('prezzo ignoto: lo dice, non inventa uno zero', () => {
    for (const id of ['Qwen/future-8b', '', undefined, null]) {
        assert.equal(C.priceLabel(id), 'Prezzo non disponibile', String(id));
    }
});

test('gratuito: né zero CHF né «prezzo ignoto»', () => {
    assert.equal(C.priceLabel('mini_lm_l12_v2'), 'Gratuito');
});

test('al minuto: tariffa e unità del listino, senza conversione in token', () => {
    assert.equal(C.priceLabel('Whisper V3'), '0.006 CHF / min');
    assert.equal(C.priceLabel('flux schnell'), '0.3 CHF / min', 'il nome si riconosce senza badare alle maiuscole');
});

test('chat: ingresso e uscita, per milione di token', () => {
    assert.equal(C.priceLabel('google/gemma-4-31B-it'), '0.2 CHF / 1M ingresso · 0.4 CHF / 1M uscita');
    assert.equal(C.priceLabel('moonshotai/Kimi-K2.6'), '0.6 CHF / 1M ingresso · 3 CHF / 1M uscita');
});

test('embeddings (e reranker): solo l\'ingresso, l\'uscita non si paga', () => {
    assert.equal(C.priceLabel('Qwen/Qwen3-Embedding-8B'), '0.07 CHF / 1M ingresso');
    assert.equal(C.priceLabel('bge_multilingual_gemma2'), '0.065 CHF / 1M ingresso', 'anche col nome alias');
    assert.equal(C.priceLabel('BAAI/bge-reranker-v2-m3'), '0.01 CHF / 1M ingresso');
});

test('le parole passano dal traduttore con la loro chiave; i numeri no', () => {
    const t = (chiave) => '[' + chiave + ']';
    assert.equal(C.priceLabel('Qwen/future-8b', t), '[catalog_price_unknown]');
    assert.equal(C.priceLabel('mini_lm_l12_v2', t), '[catalog_free]');
    assert.equal(C.priceLabel('google/gemma-4-31B-it', t), '0.2 CHF / 1M [catalog_input] · 0.4 CHF / 1M [catalog_output]');
    assert.equal(C.priceLabel('Whisper V3', t), '0.006 CHF / min');
});
