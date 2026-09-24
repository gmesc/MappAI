/* Catalogo e tariffe Infomaniak: fonte unica, nessun prezzo dedotto dal nome. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAICatalogo = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const DATE = '2026-09-22';
    const SOURCE = 'https://www.infomaniak.com/en/hosting/ai-services/prices';
    // CHF per milione di token, IVA esclusa. ID esatti; alias verificati sotto.
    const PRICES = {
        'google/gemma-4-31b-it': ['chat', .20, .40],
        'mistralai/mistral-small-4-119b-2603': ['chat', .20, .75],
        'mistralai/ministral-3-14b-instruct-2512': ['chat', .30, .40],
        'qwen/qwen3.5-122b-a10b-fp8': ['chat', .40, 3.20],
        'qwen/qwen3.5-397b-a17b-fp8': ['chat', .80, 3.60],
        'moonshotai/kimi-k2.6': ['chat', .60, 3],
        'swiss-ai/apertus-v1.5-70b': ['chat', .70, 2.50],
        'nvidia/nvidia-nemotron-3-nano-30b-a3b-fp8': ['chat', .05, .20],
        'baai/bge-multilingual-gemma2': ['embeddings', .065, 0],
        'mini_lm_l12_v2': ['embeddings', 0, 0],
        'qwen/qwen3-embedding-8b': ['embeddings', .07, 0],
        'baai/bge-reranker-v2-m3': ['reranking', .01, 0],
        'qwen/qwen3-reranker-0.6b': ['reranking', .009, 0],
        // Nomi commerciali del listino: non sono alias inventati per gli ID API.
        'whisper v3': ['audio', .006, null, 'minute'],
        'flux schnell': ['image', .30, null, 'minute'],
        'photomaker v2': ['image', .30, null, 'minute']
    };
    const ALIASES = {
        'bge_multilingual_gemma2': 'baai/bge-multilingual-gemma2',
        'bge-multilingual-gemma2': 'baai/bge-multilingual-gemma2'
    };
    function canonical(id) {
        const key = String(id || '').trim().toLowerCase();
        return ALIASES[key] || key;
    }
    function kb(id) {
        const p = PRICES[canonical(id)];
        return { tier: '🇨🇭 Swiss Made', caps: p && p[0] === 'chat' ? ['text', 'json'] : [],
            kind: p ? p[0] : null, currency: 'CHF', unit: p && p[3] || 'million_tokens',
            inputCost: p && !p[3] ? p[1] : null, outputCost: p && !p[3] ? p[2] : null,
            minuteCost: p && p[3] === 'minute' ? p[1] : null,
            priceKnown: !!p, free: !!p && p[1] === 0 && p[2] === 0,
            priceDate: DATE, priceSource: SOURCE, note: 'Infomaniak · ' + DATE };
    }
    function catalogue(product, lists) {
        const all = new Map();
        const add = (id, role, raw, fromProduct) => {
            if (typeof id !== 'string' || !id.trim()) return;
            const key = canonical(id), price = kb(id);
            let row = all.get(key);
            if (!row) {
                row = { id, displayName: id, provider: 'infomaniak', roles: [],
                    availability: 'catalogue', kb: price, infoStatus: '', fetchedAt: new Date().toISOString() };
                all.set(key, row);
            }
            if (fromProduct) { row.id = id; row.displayName = id; row.availability = 'product'; }
            if (role && !row.roles.includes(role)) row.roles.push(role);
            if (price.kind && !row.roles.includes(price.kind)) row.roles.push(price.kind);
            if (raw && typeof raw.info_status === 'string') row.infoStatus = raw.info_status;
            // Il catalogo generale può dire coming_soon anche per modelli già esposti dal prodotto.
            // Conservare l'informazione, senza farle annullare l'elenco autenticato del prodotto.
            if (row.availability !== 'product' && ['coming_soon', 'unavailable', 'disabled', 'retired', 'deprecated'].includes(row.infoStatus)) row.availability = 'unavailable';
        };
        (product || []).forEach(m => add(m.id, null, m, true));
        for (const role of ['all', 'chat', 'embeddings']) {
            ((lists && lists[role]) || []).forEach(m => add(m.name, role === 'all' ? null : role, m, false));
        }
        return Array.from(all.values());
    }
    function forPhase(rows, phase) {
        const role = phase === 'embeddings' ? 'embeddings' : 'chat';
        return (rows || []).filter(row => {
            const roles = Array.isArray(row.roles) ? row.roles : [kb(row.id).kind];
            const kind = kb(row.id).kind;
            return row.availability !== 'unavailable' && roles.includes(role) && (!kind || kind === role);
        });
    }
    function priceLabel(id, t) {
        const translate = t || ((key, fallback) => fallback), p = kb(id);
        if (!p.priceKnown) return translate('catalog_price_unknown', 'Prezzo non disponibile');
        if (p.free) return translate('catalog_free', 'Gratuito');
        if (p.unit === 'minute') return p.minuteCost + ' CHF / min';
        return p.inputCost + ' CHF / 1M ' + translate('catalog_input', 'ingresso') +
            (p.kind === 'chat' ? ' · ' + p.outputCost + ' CHF / 1M ' + translate('catalog_output', 'uscita') : '');
    }
    return { DATE, SOURCE, canonical, kb, catalogue, forPhase, priceLabel };
}));
