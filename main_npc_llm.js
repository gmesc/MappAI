// ============================================================================
// main_npc_llm.js — NpcLlmService
// LLM locale on-device per gli NPC narranti del prato (node-llama-cpp).
//
// CommonJS. La dipendenza node-llama-cpp è ESM e VIENE CARICATA SOLO al primo
// uso effettivo (dynamic import lazy in ensureLoaded). Così main.js può fare
// `require('./main_npc_llm')` senza crashare anche se la dipendenza non è ancora
// installata: il servizio resta dormiente finché un NPC non lo richiede.
//
// Vedi docs/game-design/NPC_SYSTEM_SDS.md §2.
// ============================================================================
const os = require('os');

let _llamaModule = null; // cache del modulo ESM, importato una sola volta
async function _loadModule() {
    if (!_llamaModule) _llamaModule = await import('node-llama-cpp');
    return _llamaModule;
}

class NpcLlmService {
    constructor() {
        this.llama = null;
        this.model = null;
        this.modelPath = null;
        this.npcs = new Map();            // npcId -> { context, session, lastUsed }
        this._queue = Promise.resolve();  // mutex: una inferenza per volta
        this.maxNpcs = 6;                 // cap sessioni vive (KV cache limitata su 16GB)
        this.contextSize = 2048;          // dialogo NPC breve → KV piccolo
    }

    isLoaded() { return !!this.model; }

    // Carica il modello (una volta). RAM guard prima del load per evitare swap.
    async ensureLoaded(modelPath) {
        if (this.model && this.modelPath === modelPath) return;
        if (this.model && this.modelPath !== modelPath) await this.dispose(); // cambio modello
        if (!modelPath) throw new Error('NPC_NO_MODEL_PATH');

        const free = os.freemem();
        if (free < 2.5e9) throw new Error('LOW_RAM'); // <2.5GB liberi → rischio swap

        const { getLlama } = await _loadModule();
        this.llama = await getLlama();
        this.model = await this.llama.loadModel({ modelPath });
        this.modelPath = modelPath;
    }

    // Recupera (o crea) la sessione di un NPC. Una sessione = una conversazione
    // con storia propria → la chat resta sul topic dell'NPC.
    async _getNpc(npcId, systemPrompt) {
        let npc = this.npcs.get(npcId);
        if (npc) { npc.lastUsed = Date.now(); return npc; }

        // evict LRU se oltre il cap
        if (this.npcs.size >= this.maxNpcs) {
            let oldestId = null, oldest = Infinity;
            for (const [id, n] of this.npcs) {
                if (n.lastUsed < oldest) { oldest = n.lastUsed; oldestId = id; }
            }
            if (oldestId) await this._disposeNpc(oldestId);
        }

        const { LlamaChatSession } = await _loadModule();
        const context = await this.model.createContext({ contextSize: this.contextSize });
        const session = new LlamaChatSession({
            contextSequence: context.getSequence(),
            systemPrompt
        });
        npc = { context, session, lastUsed: Date.now() };
        this.npcs.set(npcId, npc);
        return npc;
    }

    // Genera la storia di priming o continua il dialogo.
    // onChunk(token) opzionale per lo streaming typewriter verso il renderer.
    async prompt({ npcId, systemPrompt, userText, temperature = 0.6, maxTokens = 220 }, onChunk) {
        const run = async () => {
            const npc = await this._getNpc(npcId, systemPrompt);
            return npc.session.prompt(userText, {
                temperature,
                maxTokens,
                onTextChunk: onChunk ? (chunk) => onChunk(chunk) : undefined
            });
        };
        // mutex: l'Air non regge inferenze grandi in parallelo.
        // run anche sul ramo reject → un errore precedente non blocca la coda.
        this._queue = this._queue.then(run, run);
        return this._queue;
    }

    // Genera un'AZIONE strutturata vincolata da JSON-schema (grammar GBNF di
    // node-llama-cpp). Per gli NPC del dungeon che devono decidere/agire:
    // l'output è SEMPRE un JSON valido conforme allo schema → niente parsing rotto,
    // niente azioni illegali. Es. schema: { azione, verso, battuta }.
    async promptStructured({ npcId, systemPrompt, userText, schema, temperature = 0.4, maxTokens = 300 }) {
        const run = async () => {
            if (!this.llama) throw new Error('NPC_NOT_LOADED');
            const npc = await this._getNpc(npcId, systemPrompt);
            const grammar = await this.llama.createGrammarForJsonSchema(schema);
            const res = await npc.session.prompt(userText, { temperature, maxTokens, grammar });
            try { return grammar.parse(res); } catch (e) { return res; } // fallback: testo grezzo
        };
        this._queue = this._queue.then(run, run);
        return this._queue;
    }

    async _disposeNpc(npcId) {
        const npc = this.npcs.get(npcId);
        if (!npc) return;
        try { await npc.context.dispose(); } catch (e) { /* best-effort */ }
        this.npcs.delete(npcId);
    }

    // Resetta la conversazione di un NPC (es. al cambio mappa).
    resetNpc(npcId) { return this._disposeNpc(npcId); }

    async dispose() {
        for (const id of [...this.npcs.keys()]) await this._disposeNpc(id);
        try { await this.model?.dispose(); } catch (e) { /* best-effort */ }
        this.model = null;
        this.modelPath = null;
        this.llama = null;
    }

    status() {
        return {
            loaded: this.isLoaded(),
            modelPath: this.modelPath,
            activeNpcs: this.npcs.size,
            freeRamMB: Math.round(os.freemem() / 1e6),
            totalRamMB: Math.round(os.totalmem() / 1e6)
        };
    }
}

module.exports = new NpcLlmService();
