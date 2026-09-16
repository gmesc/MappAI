/* ═══════════════════════════════════════════════════════════════════════════
   Il reranker di Infomaniak, per gli strumenti a riga di comando (16/9/26).
   Lo usano prepara.mjs e verifica-infomaniak.mjs: una copia sola, perché è la
   parte rivista da quattro revisori (sicurezza della chiave, conformità all'API).

   LA CHIAVE si legge SOLO da INFOMANIAK_API_KEY. Non si stampa, non si scrive in
   nessun file, parte soltanto verso api.infomaniak.com (redirect rifiutati) ed è
   mascherata ALLA FONTE in ogni testo che arriva dal server.
   INFOMANIAK_PRODUCT_ID è facoltativo: se manca lo si chiede a GET /1/ai.
   L'API ammette 60 richieste al minuto: una chiamata ogni 1,1 secondi.
   ═══════════════════════════════════════════════════════════════════════════ */
import { performance } from 'node:perf_hooks';

export const MODELLO = 'BAAI/bge-reranker-v2-m3';
export const CHF_PER_TOKEN = 0.01 / 1e6;          // listino Infomaniak del 16/9/26, IVA esclusa
const UFFICIALE = 'https://api.infomaniak.com';
/* Solo per i test: un server finto su 127.0.0.1. Qualunque altro indirizzo è
   rifiutato, così la chiave non può essere dirottata altrove. */
const BASE = process.env.INFOMANIAK_BASE_URL_TEST || UFFICIALE;
const PAUSA_MS = BASE === UFFICIALE ? 1100 : 0;
const TIMEOUT_MS = 60000;
const TENTATIVI = 4;
export const CHIAVE = String(process.env.INFOMANIAK_API_KEY || '').trim();

export const dormi = ms => new Promise(r => setTimeout(r, ms));
export const pulisci = s => (CHIAVE && CHIAVE.length >= 8) ? String(s).split(CHIAVE).join('«chiave nascosta»') : String(s);

export class ErroreInfomaniak extends Error {}
const errore = m => new ErroreInfomaniak(pulisci(m));

export function controllaAmbiente() {
    if (BASE !== UFFICIALE && !/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) {
        throw errore('INFOMANIAK_BASE_URL_TEST ammette solo http://127.0.0.1:<porta> (serve ai test). Toglila con: unset INFOMANIAK_BASE_URL_TEST');
    }
    if (!CHIAVE) throw errore('Manca il token: in questo terminale INFOMANIAK_API_KEY è vuota. Impostala con il comando «read» del LEGGIMI, poi rilancia.');
}
export const indirizzo = () => BASE + '/2/ai/{product_id}/cohere/v2/rerank';

async function chiama(metodo, percorso, corpo) {
    let ultimo = '';
    for (let t = 1; t <= TENTATIVI; t++) {
        const inizio = performance.now();
        let res, testo;
        try {
            res = await fetch(BASE + percorso, {
                method: metodo,
                headers: { Authorization: 'Bearer ' + CHIAVE, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: corpo ? JSON.stringify(corpo) : undefined,
                signal: AbortSignal.timeout(TIMEOUT_MS),
                redirect: 'error'
            });
            testo = pulisci(await res.text());   // si maschera ALLA FONTE, prima di ogni taglio
        } catch (e) {
            ultimo = 'rete: ' + (e && e.name === 'TimeoutError' ? 'nessuna risposta in ' + TIMEOUT_MS / 1000 + ' s' : e.message);
            if (t < TENTATIVI) { await dormi(2000 * t); continue; }
            throw errore('Chiamata non riuscita dopo ' + TENTATIVI + ' tentativi (' + ultimo + ').');
        }
        const ms = performance.now() - inizio;
        let json = null;
        try { json = JSON.parse(testo); } catch (e) { /* risposta non JSON: la si riporta tagliata */ }
        if (res.status === 429 || res.status >= 500) {
            ultimo = 'HTTP ' + res.status;
            if (t < TENTATIVI) {
                const attesa = Number(res.headers.get('retry-after'));
                await dormi(attesa > 0 ? attesa * 1000 : (res.status === 429 ? 61000 : 5000 * t));
                continue;
            }
        }
        if (!res.ok) {
            const err = json && json.error;
            const base = typeof err === 'string' ? err : (err && (err.description || err.message || err.code)) || (json && json.message) || String(testo || '').slice(0, 300);
            const sotto = err && typeof err === 'object' && Array.isArray(err.errors)
                ? err.errors.map(x => x && ((x.description || x.code || '') + (x.context && x.context.attribute ? ' [' + x.context.attribute + ']' : ''))).filter(Boolean).join('; ') : '';
            const descr = base + (sotto ? ' — ' + sotto : '');
            if (res.status === 401) throw errore('HTTP 401: il token non è valido, è scaduto, o non ha accesso ad AI Tools. Dettaglio: ' + descr);
            if (res.status === 403) throw errore('HTTP 403: il token non ha il permesso per questo prodotto AI Tools. Dettaglio: ' + descr);
            if (res.status === 404) throw errore('HTTP 404: indirizzo o product_id non trovati. Dettaglio: ' + descr);
            throw errore('HTTP ' + res.status + ': ' + descr);
        }
        if (!json) throw errore('Risposta non leggibile (non è JSON): ' + String(testo || '').slice(0, 200));
        return { json, ms, tentativi: t };
    }
    throw errore('Chiamata non riuscita dopo ' + TENTATIVI + ' tentativi (' + ultimo + ').');
}

let _pid = null;
export async function productId() {
    if (_pid) return _pid;
    const dato = String(process.env.INFOMANIAK_PRODUCT_ID || '').trim();
    if (dato) {
        if (!/^\d+$/.test(dato)) throw errore('INFOMANIAK_PRODUCT_ID deve essere un numero, per esempio 12345.');
        return (_pid = dato);
    }
    const { json } = await chiama('GET', '/1/ai');
    const lista = Array.isArray(json.data) ? json.data : [];
    if (lista.length === 1 && lista[0].product_id != null) return (_pid = String(lista[0].product_id));
    if (!lista.length) throw errore('Il token non vede nessun prodotto AI Tools. Controlla che il token abbia accesso ad AI Tools.');
    throw errore('Il token vede più prodotti AI Tools: ' + lista.map(p => p.product_id + ' («' + (p.product_name || '?') + '», ' + (p.account_name || '?') + ')').join(' · ') +
        '. Scegline uno e rilancia con: export INFOMANIAK_PRODUCT_ID=<numero>');
}

let _ultima = 0;
/* Un voto per documento, nell'ordine dei documenti. Rispetta da sola la pausa fra
   una chiamata e l'altra. */
export async function rerank(query, documenti) {
    const pid = await productId();
    const attesa = _ultima + PAUSA_MS - Date.now();
    if (attesa > 0) await dormi(attesa);
    const { json, ms, tentativi } = await chiama('POST', '/2/ai/' + pid + '/cohere/v2/rerank', { model: MODELLO, query, documents: documenti });
    _ultima = Date.now();
    const voti = new Array(documenti.length).fill(null);
    (Array.isArray(json.results) ? json.results : []).forEach(r => {
        if (r && Number.isInteger(r.index) && r.index >= 0 && r.index < documenti.length && typeof r.relevance_score === 'number') voti[r.index] = r.relevance_score;
    });
    const mancanti = voti.filter(v => v === null).length;
    if (mancanti) throw errore('La risposta non ha il voto di ' + mancanti + ' frasi su ' + documenti.length + '.');
    return { voti, ms, tentativi, modello: json.model || null,
        token: json.usage && Number.isFinite(json.usage.total_tokens) ? json.usage.total_tokens : null };
}
