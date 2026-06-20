/*
 * mappai-json-salvage.js — Parsing robusto del JSON prodotto dall'AI (Tier 1 extraction)
 * --------------------------------------------------------------------------------------
 * Estratto da app.js senza alterarne il comportamento. Parser PURO (eccetto un riferimento
 * opzionale al tracker di troncamento, reso Node-safe con guard `typeof window`).
 * Modulo UMD: browser (window.*) + Node (require) per i test.
 *
 * Caricare in index.html PRIMA di app.js. Vedi docs/rules/03-json-from-ai.md
 *
 * API: window.MappAIJsonSalvage = { salvage, extractBalancedJSON }
 * Alias globali: window.salvageTruncatedJSON  (= salvage)
 *
 * REGOLA: mai JSON.parse diretto sull'output di un modello → usare sempre salvage().
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') {
        window.MappAIJsonSalvage = api;
        window.salvageTruncatedJSON = api.salvage;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function _extractBalancedJSON(text) {
        if (!text) return null;
        // Cerca il primo carattere di apertura ( { oppure [ )
        const startMatch = text.search(/[{\[]/);
        if (startMatch === -1) return null;

        const openChar = text[startMatch];
        const closeChar = openChar === '{' ? '}' : ']';
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = startMatch; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (escaped) { escaped = false; }
                else if (ch === '\\') { escaped = true; }
                else if (ch === '"') { inString = false; }
                continue;
            }
            if (ch === '"') { inString = true; continue; }
            // Conta solo le aperture/chiusure dello stesso tipo della radice,
            // così non ci confondiamo con array dentro oggetti o viceversa.
            if (ch === openChar) { depth++; }
            if (ch === closeChar) {
                depth--;
                if (depth === 0) {
                    // Trovato il blocco bilanciato completo
                    return text.slice(startMatch, i + 1);
                }
            }
        }
        // Nessuna chiusura bilanciata trovata (probabile troncamento):
        // restituiamo dal primo carattere di apertura fino alla fine,
        // lasciando al salvataggio per troncamento il compito di chiudere.
        return text.slice(startMatch);
    }

    function salvageTruncatedJSON(text) {
        const original = text || '';
        let cleaned = original;

        // Rimuovi blocchi markdown ```json ... ``` (e fence generiche)
        cleaned = cleaned.replace(/```json\s*/gi, '');
        cleaned = cleaned.replace(/```\s*/g, '');

        // Estrai il primo blocco JSON bilanciato, scartando preamboli/postamboli
        // testuali (cruciale per Qwen/Apertus che aggiungono testo attorno).
        const extracted = _extractBalancedJSON(cleaned);
        if (extracted) {
            cleaned = extracted;
        }

        // NB: NON tocchiamo più le chiavi non quotate con una regex globale:
        // quel passaggio corrompeva i valori-stringa contenenti ":" (es. "Nota: ..."),
        // generando JSON invalidi anche da output validi. La quotatura delle chiavi
        // è gestita in modo sicuro solo nel ramo di fallback qui sotto.

        // Rimuovi virgole trailing prima di } o ] (sicuro: agisce solo fuori dalle stringhe
        // nella stragrande maggioranza dei casi reali)
        cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

        const tryParse = (s) => {
            try { return { ok: true, value: JSON.parse(s) }; }
            catch (e) { return { ok: false, error: e }; }
        };

        // Tentativo 1: parse diretto del blocco pulito
        let attempt = tryParse(cleaned);
        if (attempt.ok) return attempt.value;

        // Tentativo 2: quota chiavi non quotate SOLO se il parse fallisce
        // (alcuni modelli usano {label: "x"}). Applicato a una copia per non
        // rischiare di rompere il caso già funzionante.
        let withQuotedKeys = cleaned.replace(
            /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
            '$1"$2":'
        );
        attempt = tryParse(withQuotedKeys);
        if (attempt.ok) return attempt.value;

        // Tentativo 3: salvataggio da troncamento.
        // Funziona sia per radici oggetto {} sia per radici array [].
        // Diagnostica: l'ultimo evento del tracker ci dice se questo testo
        // proviene da una risposta troncata (MAX_TOKENS / length).
        const _lastTrunc = (typeof window !== 'undefined')
            ? window.MappAITruncationTracker?.currentRun?.slice(-1)[0]
            : undefined;
        if (_lastTrunc?.truncated) {
            console.warn(
                "[MappAI JSON] Parse fallito → causa CONFERMATA: troncamento " +
                `(finishReason=${_lastTrunc.finishReason}, ` +
                `out=${_lastTrunc.candidateTokens}/${_lastTrunc.requestedMax}tok, ` +
                `model=${_lastTrunc.model}). Salvataggio in corso..."`
            );
        } else {
            console.warn("[MappAI JSON] Parse fallito (NON da troncamento). Tento il salvataggio...");
        }
        let tempText = withQuotedKeys;

        while (tempText.length > 0) {
            // Cerca l'ultima chiusura utile (oggetto o array). Se non c'è alcuna
            // chiusura (troncamento brutale a metà stringa), proviamo comunque a
            // bilanciare l'intero testo invece di arrenderci.
            const lastClose = Math.max(tempText.lastIndexOf('}'), tempText.lastIndexOf(']'));
            const sliceEnd = lastClose === -1 ? tempText.length : lastClose + 1;

            let salvaged = tempText.substring(0, sliceEnd);
            // Rimuovi un'eventuale chiave/proprietà incompleta in coda (es. ,"label" oppure ,"label":)
            salvaged = salvaged.replace(/,\s*"[^"]*"\s*:?\s*$/, '');
            salvaged = salvaged.replace(/,(\s*[}\]])/g, '$1');

            // Bilancia le chiusure mancanti usando uno STACK (così l'ordine di
            // chiusura è corretto sia per { ... [ sia per [ ... {), ignorando
            // graffe/parentesi che compaiono dentro le stringhe.
            let inStr = false, esc = false;
            const stack = [];
            for (let i = 0; i < salvaged.length; i++) {
                const c = salvaged[i];
                if (inStr) {
                    if (esc) esc = false;
                    else if (c === '\\') esc = true;
                    else if (c === '"') inStr = false;
                    continue;
                }
                if (c === '"') inStr = true;
                else if (c === '{' || c === '[') stack.push(c);
                else if (c === '}' || c === ']') stack.pop();
            }
            // Se siamo finiti dentro una stringa aperta, chiudila
            if (inStr) salvaged += '"';
            // Chiudi nell'ordine inverso di apertura
            while (stack.length > 0) {
                salvaged += stack.pop() === '{' ? '}' : ']';
            }

            const salvageAttempt = tryParse(salvaged);
            if (salvageAttempt.ok) return salvageAttempt.value;

            // Se non c'era alcuna chiusura, evitiamo il loop infinito
            if (lastClose === -1) break;
            // Riprova tagliando l'ultima chiusura problematica
            tempText = tempText.substring(0, lastClose);
        }

        // Diagnostica permanente: aiuta l'utente a capire cosa ha prodotto il modello
        // (utile soprattutto con i modelli open source di Infomaniak).
        const head = original.slice(0, 800);
        const tail = original.length > 300 ? original.slice(-300) : '';
        console.error(
            "[MappAI JSON] Salvataggio JSON fallito completamente.\n" +
            "Lunghezza testo: " + original.length + " caratteri.\n" +
            "--- PRIMI 800 CARATTERI ---\n" + head +
            (tail ? "\n--- ULTIMI 300 CARATTERI ---\n" + tail : "")
        );
        throw attempt.error || new Error("Impossibile parsare la risposta JSON del modello.");
    }

    return { salvage: salvageTruncatedJSON, extractBalancedJSON: _extractBalancedJSON };
});
