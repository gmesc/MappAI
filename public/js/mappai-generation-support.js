// ==========================================
// GENERATION SUPPORT — estratto da app.js
// ==========================================
// Helper post-generazione condivisi dai motori MM/KG (mappai-mm/kg-extraction.js):
// cross-link markers, dedup semantica, JSONL, feature flags, Phase 4/5, enrich desc,
// validate/split L1. Caricato DOPO app.js e PRIMA dei motori nell'ordine runtime non
// conta: tutte le chiamate sono a runtime via scope globale condiviso.
/**
 * DEDUP CONSERVATIVA (approccio B): rileva nodi con label semanticamente
 * identica (gestendo singolare/plurale, accenti, articoli) generati in rami
 * diversi del multipass. Tiene il nodo "canonico" (livello più basso, più vicino
 * alla radice), PRESERVA i contenuti del duplicato accodandoli al canonico, e
 * redirige i collegamenti del duplicato verso il canonico marcandoli come
 * cross-link (isCross). Il duplicato come nodo viene rimosso, ma né il contenuto
 * né le connessioni vanno persi.
 */
/**
 * Assegna il "group" (hub di appartenenza) a un nodo L2 con voto pesato a 2 hop:
 * - link DIRETTO verso un hub: peso 3 (evidenza forte)
 * - hub raggiungibile tramite UN nodo intermedio: peso 1 (evidenza di supporto)
 * Questo rende il grouping robusto agli errori del modello: anche se un nodo ha
 * un singolo link errato verso l'hub sbagliato, i vicini corretti spostano il voto
 * verso l'hub giusto. Fallback: BFS verso l'hub più vicino, poi group 1.
 */
/**
 * Marca i link laterali di un KG come cross-link (isCross=true).
 * Un link è GERARCHICO (ancoraggio a un hub) se collega esattamente un Super-Hub
 * (level 1) a un concetto. È LATERALE / di RAGIONAMENTO (concetto↔concetto o
 * hub↔hub) in tutti gli altri casi: sono questi i collegamenti che danno
 * ricchezza riflessiva al grafo e che vanno distinti dalla gerarchia per il
 * rendering (childrenOf usa !isCross) e per l'analisi strutturale.
 * Preserva gli isCross già impostati (es. da dedupeNodesAsCrossLinks).
 */
window.markKgCrossLinks = function (nodes, links) {
    const levelOf = {};
    (nodes || []).forEach(n => { levelOf[n.id] = n.level; });
    (links || []).forEach(l => {
        if (l.isCross === true) return; // già marcato altrove
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sHub = levelOf[sId] === 1;
        const tHub = levelOf[tId] === 1;
        const hierarchical = (sHub !== tHub); // XOR: esattamente uno è hub
        l.isCross = !hierarchical;
    });
    return links;
};

/**
 * Marca i cross-link in una MindMap.
 * In MM la gerarchia è esplicita: un link è gerarchico (parent→child) se
 * collega due nodi con |levelDiff| === 1 E stesso group (stessa macro-area).
 * Tutto il resto è cross-link: jump di livello, link tra rami diversi,
 * link tra nodi dello stesso livello, ecc.
 * Idempotente: non sovrascrive isCross se già impostato esplicitamente.
 */
window.markMmCrossLinks = function (nodes, links) {
    const levelOf = {}, groupOf = {};
    (nodes || []).forEach(n => { levelOf[n.id] = n.level; groupOf[n.id] = n.group; });
    (links || []).forEach(l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sLvl = levelOf[sId], tLvl = levelOf[tId];
        const sameGroup = groupOf[sId] === groupOf[tId];
        const adjacentLevels = (sLvl !== undefined && tLvl !== undefined)
            && Math.abs(sLvl - tLvl) === 1;
        /* ⚠️ IL TRONCO (16/8). La regola «stesso group» serve a riconoscere i
           salti fra RAMI diversi, ma il ROOT non sta in nessun ramo: ha
           `group: 0` e ogni L1 riceve un intero suo (è il colore della
           macro-area, vedi `_nextFreeGroup`). Quindi per gli archi ROOT→L1
           `sameGroup` è falso PER COSTRUZIONE, e senza questa deroga ogni
           MindMap si ritrovava i cinque archi che la tengono insieme marcati
           come cross-link: col filtro «solo gerarchia» il root restava
           isolato e i suoi L1 diventavano radici a sé.
           Misurato sul vault «4R › Geografia › Il Clima»: root group 0, L1
           group 1-5, tutti e 5 gli archi del tronco marcati isCross. */
        const tronco = (sLvl === 0 || tLvl === 0);
        const hierarchical = adjacentLevels && (sameGroup || tronco);
        l.isCross = !hierarchical;
    });
    return links;
};

/* LA RIPARAZIONE delle mappe già generate (16/8). Il difetto qui sopra ha
   scritto `isCross: true` sugli archi del tronco dentro i `links.json` già su
   disco: correggere la regola non basta, perché quei flag sono un DATO e
   nessuno li ricalcola finché non si preme il bottone LINK.
   Volutamente STRETTA: tocca solo gli archi fra un livello 0 e un livello 1 di
   una MindMap, dove «è gerarchia» non è un'euristica ma la definizione. Tutto
   il resto degli isCross resta com'è — compresi quelli messi a mano. */
window.repairRootHierarchy = function (nodes, links) {
    const levelOf = {};
    (nodes || []).forEach(n => { levelOf[n.id] = n.level; });
    let corretti = 0;
    (links || []).forEach(l => {
        if (l.isCross !== true) return;
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const a = levelOf[sId], b = levelOf[tId];
        if ((a === 0 && b === 1) || (a === 1 && b === 0)) { l.isCross = false; corretti++; }
    });
    return corretti;
};

window._assignHubGroup = function (nodeId, links, hubGroupMap) {
    const votes = {};
    const neighbors = [];
    links.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        let other = null;
        if (s === nodeId) other = t;
        else if (t === nodeId) other = s;
        if (other === null) return;
        if (hubGroupMap[other] !== undefined) {
            votes[hubGroupMap[other]] = (votes[hubGroupMap[other]] || 0) + 3; // diretto
        } else {
            neighbors.push(other);
        }
    });
    // 2° hop: hub collegati ai vicini non-hub
    neighbors.forEach(nb => {
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            let other = null;
            if (s === nb) other = t;
            else if (t === nb) other = s;
            if (other !== null && hubGroupMap[other] !== undefined) {
                votes[hubGroupMap[other]] = (votes[hubGroupMap[other]] || 0) + 1; // supporto
            }
        });
    });
    const voted = Object.keys(votes);
    if (voted.length > 0) {
        return parseInt(voted.sort((a, b) => votes[b] - votes[a])[0]);
    }
    // Fallback: BFS verso l'hub più vicino
    const visited = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
        const cur = queue.shift();
        if (hubGroupMap[cur] !== undefined && cur !== nodeId) return hubGroupMap[cur];
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (s === cur && !visited.has(t)) { visited.add(t); queue.push(t); }
            if (t === cur && !visited.has(s)) { visited.add(s); queue.push(s); }
        });
        if (visited.size > 50) break;
    }
    return 1;
};

window.dedupeNodesAsCrossLinks = function () {
    if (!appState.db || !Array.isArray(appState.db.nodes) || appState.db.nodes.length === 0) return;

    // Normalizzazione conservativa: minuscolo, accenti rimossi, articoli iniziali
    // rimossi, e ogni parola "stemmata" togliendo la vocale finale (così
    // "corsa"≈"corse", "stato"≈"stati"). Punteggiatura e spazi normalizzati.
    const normKey = (lbl) => {
        if (!lbl) return '';
        let s = String(lbl).toLowerCase().trim();
        s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); // togli accenti
        s = s.replace(/["'«»“”„().,;:!?\-]/g, ' ');
        s = s.replace(/\b(il|lo|la|i|gli|le|un|uno|una|del|della|dei|degli|delle|di|e|ed)\b/g, ' ');
        const words = s.split(/\s+/).filter(Boolean).map(w => w.length > 3 ? w.replace(/[aeiou]$/, '') : w);
        return words.sort().join(' '); // sort: indipendente dall'ordine delle parole
    };

    const nodes = appState.db.nodes;
    const groups = {};
    nodes.forEach(n => {
        const k = normKey(n.label);
        if (!k) return;
        (groups[k] = groups[k] || []).push(n);
    });

    const links = appState.db.links || [];
    const removedIds = new Set();
    let mergedCount = 0;

    Object.values(groups).forEach(group => {
        if (group.length < 2) return;

        // Canonico = livello più basso (più vicino alla radice); a parità, il più connesso
        const degree = (id) => links.filter(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return s === id || t === id;
        }).length;
        group.sort((a, b) => (parseInt(a.level) - parseInt(b.level)) || (degree(b.id) - degree(a.id)));
        const canonical = group[0];

        group.slice(1).forEach(dup => {
            if (dup.id === canonical.id) return;

            // Preserva il contenuto: accoda desc/chunks unici del duplicato al canonico
            if (dup.desc && canonical.desc && !canonical.desc.includes(dup.desc)) {
                canonical.desc = (canonical.desc + '\n\n' + dup.desc).trim();
            } else if (dup.desc && !canonical.desc) {
                canonical.desc = dup.desc;
            }
            if (Array.isArray(dup.chunks) && dup.chunks.length) {
                canonical.chunks = canonical.chunks || [];
                dup.chunks.forEach(c => { if (!canonical.chunks.includes(c)) canonical.chunks.push(c); });
            }

            // Redirige i link del duplicato verso il canonico, marcandoli cross-link
            links.forEach(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                if (s === dup.id) { l.source = canonical.id; l.isCross = true; }
                if (t === dup.id) { l.target = canonical.id; l.isCross = true; }
            });

            removedIds.add(dup.id);
            mergedCount++;
        });
    });

    if (mergedCount === 0) return;

    // Rimuovi i nodi duplicati e ripulisci i link (self-loop e duplicati esatti)
    appState.db.nodes = nodes.filter(n => !removedIds.has(n.id));
    const seen = new Set();
    appState.db.links = links.filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (s === t) return false; // self-loop creato dal redirect
        const key = s + '→' + t;
        if (seen.has(key)) return false; // link duplicato
        seen.add(key);
        return true;
    });

    console.info('[MappAI] Dedup: ' + mergedCount + ' doppioni cross-ramo trasformati in cross-link.');
};

/**
 * Estrae il primo blocco JSON bilanciato (oggetto {} o array []) da una stringa,
 * ignorando eventuali preamboli/postamboli testuali e gestendo correttamente
 * graffe/parentesi che compaiono DENTRO le stringhe (così non si confonde con
 * il testo dei valori). Restituisce la sottostringa JSON oppure null.
 *
 * Questo è il punto chiave per i modelli open source verbosi (es. Qwen3.5-122B),
 * che spesso scrivono "Ecco il JSON:" prima e una spiegazione dopo l'oggetto.
 */
// _extractBalancedJSON + salvageTruncatedJSON estratti in mappai-json-salvage.js
// (caricato PRIMA di app.js). Le funzioni qui delegano al modulo (comportamento invariato).
// REGOLA: mai JSON.parse diretto sull'output AI → vedi docs/rules/03-json-from-ai.md
function _extractBalancedJSON(text) { return window.MappAIJsonSalvage.extractBalancedJSON(text); }
function salvageTruncatedJSON(text) { return window.MappAIJsonSalvage.salvage(text); }

// ──────────────────────────────────────────────────────────────────────────
// FREEZE CHUNK VERBATIM (preparazione STEP 2 — chunks extra-pass)
// ──────────────────────────────────────────────────────────────────────────
//
// Interruttore reversibile (localStorage 'mappai_freeze_chunks'). Quando attivo,
// i chunk verbatim NON vengono salvati: né su node.chunks (→ niente sezione
// "## Fonti" nel vault), né in appState.db.sourcesDict (→ niente fonte nel modale).
//
// Implementazione: stripChunksIfFrozen() azzera n.chunks sugli oggetti nodo AI
// GREZZI prima che vengano consumati. A valle, sia `chunks: n.chunks || []` sia
// la popolazione di sourcesDict (entrambe leggono n.chunks) diventano no-op.
//
// NON tocca i prompt (i modelli continuano a generare chunk, ma vengono scartati)
// né il caricamento dei vault esistenti (i chunk già salvati restano leggibili).
// Comandi: MappAIMetrics.enableChunkFreeze() / .disableChunkFreeze() / .chunkFreezeStatus()
window.areChunksFrozen = function () {
    try { return localStorage.getItem('mappai_freeze_chunks') === '1'; }
    catch (e) { return false; }
};

window.stripChunksIfFrozen = function (nodeArr) {
    if (!Array.isArray(nodeArr) || !window.areChunksFrozen()) return nodeArr;
    let stripped = 0;
    nodeArr.forEach(n => {
        if (n && typeof n === 'object' && Array.isArray(n.chunks) && n.chunks.length) {
            n.chunks = [];
            stripped++;
        }
    });
    if (stripped) console.log(`[Freeze chunks] ${stripped} nodi: chunk verbatim scartati (non salvati)`);
    return nodeArr;
};

// ──────────────────────────────────────────────────────────────────────────
// JSONL parser (Strategia 1A — formato sezionato resistente al troncamento)
// ──────────────────────────────────────────────────────────────────────────
//
// Formato atteso (output del modello):
//
//   ===NODES===
//   {"id":"X","label":"A","level":2,"desc":"..."}
//   {"id":"Y","label":"B","level":2,"desc":"..."}
//   ===LINKS===
//   {"source":"X","target":"Y","rel":"include"}
//   {"source":"Y","target":"Z","rel":"causa"}
//
// Resilienza:
//   - Riga JSON malformata → scartata, le altre sopravvivono
//   - Troncamento a metà oggetto → si perde SOLO l'ultima riga di una sezione
//   - Section header alterato (es. "## NODES ##") → fallback su euristica
//   - Markdown ```...``` → rimosso automaticamente
//
// Restituisce: { nodes, links, meta: { recovered, lost, partial, sections } }
window.parseJSONLResponse = function (text) {
    const meta = { recovered: { nodes: 0, links: 0 }, lost: { nodes: 0, links: 0 }, partial: false, sections: [] };
    if (typeof text !== 'string' || !text.trim()) {
        return { nodes: [], links: [], meta };
    }

    // Pulizia preliminare: rimuovi fence markdown
    let cleaned = text
        .replace(/```jsonl?\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

    // Trova i marker di sezione (tollerante a varianti: ===NODES=== / ## NODES ## / [NODES])
    // Riconosce: NODES, LINKS, EDGES, RELATIONS, MERGES, CROSSLINKS (alias CROSS_LINKS, CROSS-LINKS).
    // Non consumare il newline: dopo una sezione vuota è anche l'inizio
    // dell'header successivo (MERGES vuoto seguito da CROSSLINKS).
    const sectionRegex = /^[ \t]*(?:===+|##+|\[)[ \t]*(NODES?|LINKS?|EDGES?|RELATIONS?|MERGES?|CROSS[-_ ]?LINKS?)[ \t]*(?:===+|##+|\])[ \t]*\r?$/gim;
    const markers = [];
    let m;
    const classifyKind = (label) => {
        const u = label.toUpperCase().replace(/[-_ ]/g, '');
        if (u === 'NODE' || u === 'NODES') return 'nodes';
        if (u === 'MERGE' || u === 'MERGES') return 'merges';
        if (u === 'CROSSLINK' || u === 'CROSSLINKS') return 'crosslinks';
        return 'links'; // LINKS, EDGES, RELATIONS
    };
    while ((m = sectionRegex.exec(cleaned)) !== null) {
        markers.push({ kind: classifyKind(m[1]), start: m.index, headerEnd: m.index + m[0].length });
    }

    // Normalizza le chiavi di un oggetto: rimuove spazi iniziali/finali.
    // Mistral Small produce sistematicamente "id ", "label ", "content " con
    // uno spazio finale → senza questo, obj.id sarebbe undefined.
    // Idempotente: se le chiavi sono già pulite, restituisce l'oggetto invariato
    // (no allocazione extra) per non penalizzare i provider corretti.
    const normalizeKeys = (obj) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
        let needsRebuild = false;
        for (const k of Object.keys(obj)) {
            if (k !== k.trim()) { needsRebuild = true; break; }
        }
        if (!needsRebuild) return obj;
        const out = {};
        for (const k of Object.keys(obj)) out[k.trim()] = obj[k];
        return out;
    };

    const parseLine = (line) => {
        const s = line.trim();
        if (!s || s.startsWith('//') || s.startsWith('#')) return null;
        // Rimuovi commenti in coda: "} // nota", "} # nota", "} <!-- nota -->"
        const noComment = s.replace(/\}\s*\/\/.*$/, '}').replace(/\}\s*#.*$/, '}').replace(/\}\s*<!--.*?-->\s*$/, '}').replace(/\}\s*<!--.*$/, '}').trim();
        // Normalizza chiavi con spazi ("desc ": → "desc":) prodotte da Mistral
        const spaceFixed = noComment.replace(/"([^"]+)"\s*:/g, (_, k) => '"' + k.trim() + '":');
        const trimmed = spaceFixed.replace(/,\s*$/, '');

        // Tentativo 1: parse diretto
        try {
            return normalizeKeys(JSON.parse(trimmed));
        } catch (e1) { /* fall through */ }

        // Tentativo 2: double-escape recovery (pattern frequente Mistral Small).
        // Il modello produce {\"id\":\"X\"} invece di {"id":"X"}. Rimuoviamo i
        // backslash davanti alle virgolette e riproviamo.
        if (trimmed.includes('\\"')) {
            try {
                const unescaped = trimmed.replace(/\\"/g, '"');
                return normalizeKeys(JSON.parse(unescaped));
            } catch (e2) { /* fall through */ }
        }

        // Tentativo 3: parser ha visto `\n` letterale dentro stringhe (errore tipico
        // quando il modello mette newline reale invece di \\n). Sostituisce \n con
        // spazio e riprova. Pattern visto su Mistral: "desc":"...\nseguito..."
        if (trimmed.includes('\n')) {
            try {
                const inlined = trimmed.replace(/\n/g, ' ');
                return normalizeKeys(JSON.parse(inlined));
            } catch (e3) { /* fall through */ }
        }

        return undefined; // undefined = riga rotta (vs null = riga vuota)
    };

    // Estendi meta.recovered/lost per tutte le sezioni note
    ['merges', 'crosslinks'].forEach(k => {
        if (meta.recovered[k] === undefined) meta.recovered[k] = 0;
        if (meta.lost[k] === undefined) meta.lost[k] = 0;
    });
    meta.lostSamples = meta.lostSamples || []; // primi 3 esempi di righe scartate

    // Validazione per tipo: rifiuta oggetti che mancano dei campi minimi.
    // Un nodo senza id o label è inutilizzabile (il consumer chiama normalizeLabel
    // e normalizeId che esplodono su undefined). Un link senza source/target è
    // irrilevante. I merges e crosslinks hanno requisiti propri.
    const isValid = (obj, kind) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        switch (kind) {
            case 'nodes':      return typeof obj.id === 'string' && obj.id.trim()
                                   && typeof obj.label === 'string' && obj.label.trim();
            case 'links': {
                if (typeof obj.source !== 'string' || !obj.source.trim()) return false;
                if (typeof obj.target !== 'string' || !obj.target.trim()) return false;
                // Filtra i "ghost link" di Apertus: usa "L5", "L4", "L3" ecc. come
                // placeholder generici per le foglie invece di ID reali. Pattern: target
                // è esattamente "L5" (o L4/L3/L2) oppure contiene "*" o "non specificato".
                const t = obj.target.trim();
                if (/^L\d+$/.test(t)) return false;
                if (t.includes('*') || t.toLowerCase().includes('non specificato')) return false;
                return true;
            }
            case 'merges':     return typeof obj.keep === 'string' && typeof obj.drop === 'string';
            case 'crosslinks': return typeof obj.source === 'string' && typeof obj.target === 'string';
            default:           return true;
        }
    };

    const parseSection = (raw, kind) => {
        const lines = raw.split('\n');
        const out = [];
        let lost = 0;
        for (const line of lines) {
            const r = parseLine(line);
            if (r === null) continue;            // riga vuota/commento → ignora
            if (Array.isArray(r) && r.length === 0) continue; // sezione esplicitamente vuota
            const trimmed = line.trim();
            if (r === undefined) {
                // riga JSON malformato → sample per debug
                lost++;
                if (meta.lostSamples.length < 3 && trimmed) {
                    meta.lostSamples.push({ kind, reason: 'json invalido', sample: trimmed.slice(0, 120) });
                }
                continue;
            }
            if (!isValid(r, kind)) {
                // Apertus a volte "narra" le foglie invece di ometterle: emette un oggetto
                // link con target assente/null e un commento esplicativo
                // (es. {"source":"L1_2_L3_A1","target":null} // Foglia: no figli).
                // Non è un link perso: è un modo (maldestro) di dire "qui non c'è link".
                // Lo scartiamo senza contarlo come "lost" per non inquinare le metriche
                // di recupero con falsi positivi (il grafo non ne risente: era già filtrato).
                if (kind === 'links' && typeof r.source === 'string' && r.source.trim()
                    && (r.target === null || r.target === undefined)) {
                    continue;
                }
                lost++;
                if (meta.lostSamples.length < 3) {
                    meta.lostSamples.push({ kind, reason: 'campi obbligatori mancanti', sample: trimmed.slice(0, 120) });
                }
                continue;
            }
            out.push(r);
        }
        meta.recovered[kind] = (meta.recovered[kind] || 0) + out.length;
        meta.lost[kind] = (meta.lost[kind] || 0) + lost;
        meta.sections.push({ kind, recovered: out.length, lost });
        return out;
    };

    if (markers.length === 0) {
        // Fallback: nessun marker trovato → prova a interpretare TUTTO come nodi
        // (es. il modello ha solo prodotto nodi senza header). Distingue nodes da
        // links guardando le chiavi: se ha "source"+"target" → link.
        const allParsed = cleaned.split('\n').map(parseLine).filter(o => o && typeof o === 'object');
        const nodes = [], links = [];
        for (const obj of allParsed) {
            if (obj.source && obj.target) links.push(obj);
            else if (obj.id) nodes.push(obj);
        }
        meta.recovered.nodes = nodes.length;
        meta.recovered.links = links.length;
        meta.partial = true; // no header → output non standard
        return { nodes, links, meta };
    }

    // Itera le sezioni in ordine, ognuna delimitata dall'inizio della successiva
    const sortedMarkers = [...markers].sort((a, b) => a.start - b.start);
    const nodes = [], links = [], merges = [], crosslinks = [];
    const bucket = { nodes, links, merges, crosslinks };
    for (let i = 0; i < sortedMarkers.length; i++) {
        const mk = sortedMarkers[i];
        const end = (i + 1 < sortedMarkers.length) ? sortedMarkers[i + 1].start : cleaned.length;
        const body = cleaned.slice(mk.headerEnd, end);
        const items = parseSection(body, mk.kind);
        bucket[mk.kind].push(...items);
    }

    // Se ci sono righe perse, marca come parziale (il chiamante può loggarlo)
    if (Object.values(meta.lost).some(v => v > 0)) meta.partial = true;

    return { nodes, links, merges, crosslinks, meta };
};

// Costruisce il prompt di espansione ramo nel formato JSONL sezionato.
// Mantiene tutte le regole del prompt JSON originale (id, label, content,
// desc, level, chunks) ma cambia il formato di output per resistere al
// troncamento. Usato in extractMindMapMultiPass quando isJSONLEnabled().
window.buildBranchPromptJSONL = function (branch, opts) {
    const { rootNodeLabel, maxMapLevel, userProfileStr, focusInjection, textParts, fileParts, siblingCatalog } = opts;
    const sc = siblingCatalog || '';
    // Lista livelli DINAMICA dal tetto (vedi mm-extraction: niente più "(L2,L3,L4,L5)" fisso)
    const _lvlList = Array.from({ length: Math.max(1, maxMapLevel - 1) }, (_, i) => 'L' + (i + 2)).join(', ');
    const _idEx = Array.from({ length: Math.max(1, maxMapLevel - 1) }, (_, i) => {
        const suff = ['A', 'A1', 'A1a', 'B2A', '1'][i] || String(i + 1);
        return `${branch.id}_L${i + 2}_${suff}`;
    }).join(', ');

    // ── C: Carta del ramo (gated dal flag branch boundaries; graceful se i campi mancano) ──
    const _ambitoPart = branch.ambito ? `\n- Ambito (concetti che DEVONO stare qui): ${branch.ambito}` : '';
    const _descPart = (branch.desc && !/^Categoria principale:/.test(branch.desc)) ? `\n- Descrizione: ${branch.desc}` : '';
    const _confiniPart = branch.confini ? `\n- Confini (NON sconfinare negli altri rami): ${branch.confini}` : '';
    const charter = (window.isBranchBoundariesEnabled && window.isBranchBoundariesEnabled() && (_ambitoPart || _descPart || _confiniPart))
        ? `\n📋 CARTA DEL RAMO "${branch.label}" — resta rigorosamente dentro questi confini:${_descPart}${_ambitoPart}${_confiniPart}\nApplica questi confini nelle tue scelte SENZA commentarli nell'output — niente note, spiegazioni o premesse: genera solo nodi e link.\n`
        : '';

    // ── D: Linking words significative (gated dal flag mappai_rich_rel_enabled) ──
    const relGuide = (window.isRichRelEnabled && window.isRichRelEnabled())
        ? `
🔗 LINKING WORDS — OGNI ARCO È UNA PROPOSIZIONE (stile concept-map)
Il campo "rel" NON deve quasi mai essere "include". Scegli il verbo/locuzione che rende la frase "GENITORE → rel → FIGLIO" una proposizione VERA e leggibile, supportata dalla fonte. Pesca dal vocabolario per famiglia:
${window.relVocab('perFamily')}
Usa i verbi di Gerarchia (comprende, è formato da, fa parte di) SOLO se non esiste una relazione più precisa. Evita "include"/"correlato a" salvo pura appartenenza gerarchica.
`
        : '';

    return `SEI UN MOTORE DI GENERAZIONE SOTTO-RAMI PER MAPPE MENTALI (Fase 3 - Dettagli del Ramo).
Hai il compito di sviluppare in profondità il sotto-ramo per la macro-area "${branch.label}" (ID di partenza: "${branch.id}") all'interno della Mappa Mentale su "${rootNodeLabel}".
${charter}
ISTRUZIONI PER IL RAMO:
1. Genera tutti i sotto-nodi gerarchici spingendoti AL MASSIMO fino al Livello ${maxMapLevel} (${_lvlList}), e solo fino al livello di dettaglio realmente coperto dalle fonti. NON superare MAI il Livello ${maxMapLevel}: se la fonte contiene dettaglio più fine, riassumilo dentro la desc del nodo di Livello ${maxMapLevel}.
2. Ciascun sotto-nodo generato deve definire:
   - "id": un ID unico in lettere maiuscole coerente con la gerarchia del ramo (es. ${_idEx}).
   - "label": titolo sintetico e focalizzato (max 3 parole).
   - "content": sintesi didattica brevissima (max 10 parole).
   - "desc": paragrafo descrittivo chiaro (50-80 parole quando la fonte lo permette, più corto altrimenti). Includi dati specifici dal testo (nomi, cifre, meccanismi concreti). Evita generalità: ogni desc deve essere comprensibile da sola, senza contesto aggiuntivo.
   - "level": assegna un intero da 2 a ${maxMapLevel} in base alla profondità concettuale (2 per primari, fino a ${maxMapLevel} per foglie).
   - "chunks": un array contenente da 1 a 2 citazioni testuali REALI, INTEGRALI e VERBATIM (minimo 10-15 parole) copiate fedelmente dalle fonti testuali originali.
3. Definisci i collegamenti ("links") in un rigoroso albero gerarchico genitore-figlio. Ogni nodo di livello N deve avere come sorgente ("source") il rispettivo genitore di livello N-1. Il Livello 2 ha come sorgente "${branch.id}". Non creare connessioni trasversali verso nodi di altri rami — quelle verranno aggiunte in una fase successiva.
${window.MM_FIDELITY_RULES_IT}${window.mapLangNote()}${relGuide}
⚠️ FORMATO DI OUTPUT — TASSATIVO ⚠️
NON restituire un singolo oggetto JSON. Restituisci DUE sezioni separate, OGNI OGGETTO SU UNA RIGA INDIPENDENTE:

===NODES===
{"id":"${branch.id}_L2_A","label":"Esempio","content":"breve (max 10 parole)","desc":"paragrafo descrittivo specifico e denso di 50-80 parole con dati concreti","level":2,"chunks":["citazione verbatim dalla fonte"]}
{"id":"${branch.id}_L2_B","label":"Altro","content":"breve","desc":"...","level":2,"chunks":["..."]}
===LINKS===
{"source":"${branch.id}","target":"${branch.id}_L2_A","rel":"${(window.isRichRelEnabled && window.isRichRelEnabled()) ? 'comprende' : 'include'}"}
{"source":"${branch.id}_L2_A","target":"${branch.id}_L3_A1","rel":"${(window.isRichRelEnabled && window.isRichRelEnabled()) ? 'è condizione di' : 'include'}"}

REGOLE TASSATIVE SUL FORMATO:
- UN oggetto JSON PER RIGA, niente array racchiudenti, niente virgole tra le righe
- Header sezione esattamente "===NODES===" e "===LINKS===" (tre uguali, maiuscolo)
- Nessun commento, nessun markdown, nessun testo prima o dopo le sezioni
- Se vai a capo dentro una stringa devi escaparlo come \\n
- Le CHIAVI JSON devono essere ESATTAMENTE: id, label, content, desc, level, chunks (senza spazi, senza spazi finali — NON "id ", NON "label ")
- Ogni virgoletta " dentro un valore stringa DEVE essere escapata come \\" (es: "desc":"Il \\"piano Wahlen\\" del 1940...")
- NIENTE prosa libera: se non sai cosa scrivere per un campo, scrivi "" (stringa vuota), NON una frase descrittiva fuori dal JSON
- Ogni riga deve INIZIARE con "{" e FINIRE con "}" — niente eccezioni
- ⛔ FOGLIE: i nodi foglia (livello ${maxMapLevel}) NON hanno figli — NON scrivere nessun link con "source" uguale all'ID di una foglia. NON usare "L5", "L${maxMapLevel}" o qualsiasi placeholder come "target" — usa solo ID reali definiti nella sezione NODES
- ⛔ NESSUN link con "target": null, "target": "L5", o "target" che contiene "*" — questi verranno scartati

${userProfileStr}
${focusInjection}${sc}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;
};

// ⚓ Blocco di fedeltà alla fonte — iniettato in TUTTI i prompt che generano
// label/desc dei nodi MM (Fase 3 inline, builder JSONL). Nato dal bug "desc
// romanzate" (5 lug 2026): il modello drammatizzava oltre la fonte ("come un
// funambolo", "terrore che Hitler...") e inventava nodi astratti a L4/L5
// quando la fonte era esaurita. Stessa regola replicata nel template
// MIND_MAP_FULL_TREE di prompts_config.json (il template MIND_MAP_BRANCH,
// non usato a runtime, è stato rimosso il 21/7/26 — vedi CLAUDE.md §8).
window.MM_FIDELITY_RULES_IT = `
⚓ REGOLA DI FEDELTÀ ALLA FONTE — PRIORITARIA SU OGNI ALTRA REGOLA ⚓
- TONO ESPOSITIVO da manuale scolastico: la 'desc' riporta SOLO fatti, dati e relazioni presenti nelle fonti.
- VIETATO nella 'desc': metafore e similitudini (es. "come un funambolo"), emozioni o motivazioni NON scritte nella fonte (es. "terrore", "paura" se la fonte non le nomina), amplificazioni retoriche, giudizi personali.
- Se la fonte dice poco su un concetto: scrivi una 'desc' più breve ma fedele. MAI gonfiare una descrizione per raggiungere un numero di parole.
- Il 'label' deve nominare un concetto ESPLICITO della fonte, non una tua astrazione interpretativa.
- PROFONDITÀ ONESTA: crea i livelli più profondi SOLO dove la fonte contiene davvero quel dettaglio; meglio un ramo più corto che nodi inventati.
- VERIFICA FINALE: ogni frase della 'desc' deve trovare riscontro nei 'chunks' o nel testo fonte; se non lo trova, riscrivila o eliminala.
`;

// Feature flag — abilita JSONL solo per Infomaniak e solo se opt-in via localStorage.
// Attivazione: localStorage.setItem('mappai_jsonl_enabled', '1')
// Disattivazione: localStorage.removeItem('mappai_jsonl_enabled')
window.isJSONLEnabled = function (context) {
    try {
        return localStorage.getItem('mappai_jsonl_enabled') === '1'
            && (context ? context.provider : appState?.aiProvider) === 'infomaniak';
    } catch (e) { return false; }
};

// ──────────────────────────────────────────────────────────────────────────
// FASE 4 — Consolidamento + Cross-link (Strategia B)
// ──────────────────────────────────────────────────────────────────────────
//
// Dopo che tutti i rami sono stati generati e il dedup deterministico è già
// passato, una chiamata AI riceve il grafo completo (id+label+desc[0:60])
// e produce due tipi di operazioni:
//   - MERGES: coppie (keep, drop) di nodi semanticamente equivalenti
//   - CROSSLINKS: relazioni tematiche tra rami diversi (causa, prerequisito, etc)
//
// Il risultato passa per `executeMerge` esistente (già robusto) per i merge
// e per push diretto su appState.db.links per i cross-link, con validazione
// (ID esistenti, no self-loop, no duplicati).
//
// Gated dal feature flag mappai_mm_phase4_enabled.

// ──────────────────────────────────────────────────────────────────────────
// FASE 1.5 — Validazione semantica delle macro-categorie L1
// ──────────────────────────────────────────────────────────────────────────
//
// Dopo che la Fase 1 ha prodotto la lista degli L1, una chiamata AI rapida
// verifica i tre antipattern più comuni e propone fusioni/sostituzioni:
//
//   - SINONIMI: due L1 che esprimono lo stesso concetto
//   - META-CATEGORIE: L1 che parlano del "come" invece che del "cosa"
//   - SOTTO-CAMPI dello stesso campo: 3 L1 tutte militari, ecc.
//
// L'output del Pass 1.5 sostituisce l1Data prima della costruzione di
// l1NodesData. Se la validazione fallisce o produce output invalido,
// degrada silenziosamente all'output originale (nessun crash).
//
// Gated dal feature flag mappai_l1_validation_enabled.

window.isL1ValidationEnabled = function () {
    try {
        return localStorage.getItem('mappai_l1_validation_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Fase 1.6 — split macro-categorie composte ("Neutralità e Difesa" → due aree atomiche).
// Pre-rami, quindi sicuro: nessun figlio da ridistribuire.
// Gated dal feature flag mappai_l1_split_enabled.
window.isL1SplitEnabled = function () {
    try {
        return localStorage.getItem('mappai_l1_split_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// ──────────────────────────────────────────────────────────────────────────
// STRATEGIA A — Confini di ramo (catalogo L1 fratelli nei prompt Fase 3)
// ──────────────────────────────────────────────────────────────────────────
//
// Inietta nel prompt di espansione ogni ramo la lista dei rami fratelli.
// Il modello sa quali concetti NON sono di sua competenza → riduce i
// duplicati cross-ramo (undeveloped_branch) e migliora la classificazione
// L2/L3 nelle macro-aree corrette.
//
// Gated dal feature flag mappai_branch_boundaries_enabled.

window.isBranchBoundariesEnabled = function () {
    try {
        return localStorage.getItem('mappai_branch_boundaries_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Linking words significative su ogni arco (stile concept-map): inietta il vocabolario
// dei verbi nel prompt di ramo. Vale per entrambi i provider, solo in mindmap.
// Gated dal feature flag mappai_rich_rel_enabled.
window.isRichRelEnabled = function () {
    try {
        return localStorage.getItem('mappai_rich_rel_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// ──────────────────────────────────────────────────────────────────────────
// EMBEDDING-DRIVEN SEMANTIC DEDUP (deterministico, no LLM)
// ──────────────────────────────────────────────────────────────────────────
// Google (gemini-embedding-001) o Infomaniak (bge-multilingual-gemma2),
// a seconda del provider attivo. Cosine similarity > threshold → merge
// automatico via window.executeMerge.
window.isSemanticDedupEnabled = function () {
    try {
        return localStorage.getItem('mappai_semantic_dedup_enabled') === '1'
            && (appState?.aiProvider === 'google' || appState?.aiProvider === 'infomaniak')
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

window.fetchEmbeddings = async function (texts, model) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const provider = appState.aiProvider;
    const result = await window.fetchEmbeddingsRequest({
        provider, texts, model: model || (provider === 'google' ? 'gemini-embedding-001' : 'bge_multilingual_gemma2'),
        apiKey: window.getSystemKey ? window.getSystemKey() : null,
        productId: appState.infomaniakProductId || document.getElementById('infomaniak-product-id')?.value || localStorage.getItem('infomaniak_product_id'),
        strictOrder: false
    });
    return result?.embeddings || [];
};

// Chiamato SOLO per le richieste remote: un hit della cache non passa qui.
window.fetchEmbeddingsRequest = async function ({ provider, apiKey, productId, model, texts, strictOrder = true, ...context }) {
    if (!Array.isArray(texts)) throw new Error('Testi embeddings non validi');
    if (typeof model !== 'string' || !model.trim()) throw new Error('Modello embeddings mancante');
    if (!apiKey) throw new Error('API key mancante');
    if (provider !== 'google' && provider !== 'infomaniak') throw new Error('Provider embeddings non supportato');
    if (texts.length === 0) return { embeddings: [], model, usage: null };
    const usageTarget = appState.generationUsage;
    const project = context.project !== undefined ? context.project : appState.rootNodeLabel;
    const projectId = context.projectId !== undefined ? context.projectId : (typeof StorageManager !== 'undefined' ? StorageManager.currentProjectId : null);
    let result;
    if (provider === 'google') {
        if (!window.electronAPI?.generateEmbeddingsGoogle) throw new Error('generateEmbeddingsGoogle IPC non disponibile (restart app richiesto?)');
        result = await window.electronAPI.generateEmbeddingsGoogle({ apiKey, model, texts });
    } else {
        if (!productId) throw new Error('Infomaniak product ID mancante');
        if (!window.electronAPI?.generateEmbeddingsInfomaniak) throw new Error('generateEmbeddingsInfomaniak IPC non disponibile (restart app richiesto?)');
        result = await window.electronAPI.generateEmbeddingsInfomaniak({ apiKey, productId, model, texts, ...(strictOrder ? { strictOrder: true } : {}) });
    }
    const input = result?.usage?.prompt_tokens ?? result?.usage?.total_tokens;
    const usageKnown = typeof input === 'number' && Number.isFinite(input) && input >= 0;
    const actualModel = typeof result?.model === 'string' && result.model.trim() ? result.model : null;
    const entry = { provider, model: actualModel || model, requestedModel: model, actualModel,
        inTok: usageKnown ? input : null, outTok: usageKnown ? 0 : null, usageKnown,
        project, projectId, ctx: { cat: 'other', sub: 'embeddings' }, phase: 'embeddings',
        ...(context.runId ? { runId: context.runId } : {}) };
    if (window.MappAIUsage) window.MappAIUsage.record(entry);
    if (usageTarget) {
        (usageTarget.costRecords || (usageTarget.costRecords = [])).push(entry);
        if (appState.generationUsage === usageTarget && window.updateCostDisplay) window.updateCostDisplay();
    }
    return result;
};

// cosineSimilarity estratto in mappai-math.js (caricato PRIMA di app.js).
window.cosineSimilarity = window.MappAIMath.cosineSimilarity;

window.executeSemanticDedup = async function (options = {}) {
    const giro = options.giro || (window.MappAIModelli && window.MappAIModelli.avvia());
    const { threshold = 0.85, maxMerges = 15 } = options;
    const report = { embeddingsRequested: 0, candidatesFound: 0, applied: 0, skipped: 0, errors: [] };

    const nodes = (appState.db.nodes || []).filter(n => n.level >= 2);
    if (nodes.length < 4) {
        console.log('[SemanticDedup] Mappa troppo piccola — skip');
        return report;
    }

    const texts = nodes.map(n => {
        const desc = (n.desc || n.content || '').replace(/\s+/g, ' ').slice(0, 100);
        return `${n.label}. ${desc}`.trim();
    });
    report.embeddingsRequested = texts.length;

    let embs;
    try {
        embs = giro ? await giro.embeddings(texts) : await window.fetchEmbeddings(texts);
    } catch (e) {
        if (giro) giro.verifica();
        console.warn('[SemanticDedup] Fetch embeddings fallito:', e.message);
        report.errors.push(e.message);
        return report;
    }
    if (embs.length !== nodes.length) {
        console.warn(`[SemanticDedup] Mismatch: ${embs.length} embeddings vs ${nodes.length} nodi`);
        return report;
    }

    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target
    });
    const parentOf = new Map();
    appState.db.links.forEach(l => {
        const { src, tgt } = getId(l);
        if (!parentOf.has(tgt)) parentOf.set(tgt, src);
    });
    const nodeMapById = new Map(appState.db.nodes.map(n => [n.id, n]));
    const l1Of = (nodeId) => {
        let cur = nodeId, hops = 0;
        while (cur && hops < 10) {
            const n = nodeMapById.get(cur);
            if (!n) return null;
            if (n.level === 1) return n.id;
            cur = parentOf.get(cur);
            hops++;
        }
        return null;
    };

    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const sim = window.cosineSimilarity(embs[i], embs[j]);
            if (sim < threshold) continue;
            const l1i = l1Of(nodes[i].id), l1j = l1Of(nodes[j].id);
            if (l1i && l1j && l1i === l1j) continue;
            candidates.push({ a: nodes[i], b: nodes[j], sim, l1a: l1i, l1b: l1j });
        }
    }
    candidates.sort((x, y) => y.sim - x.sim);
    report.candidatesFound = candidates.length;

    const consumed = new Set();
    for (const c of candidates.slice(0, maxMerges)) {
        if (consumed.has(c.a.id) || consumed.has(c.b.id)) { report.skipped++; continue; }
        let keep = c.a, drop = c.b;
        if (c.b.level < c.a.level) { keep = c.b; drop = c.a; }
        else if (c.b.level === c.a.level && c.b.label.length > c.a.label.length) { keep = c.b; drop = c.a; }
        try {
            window.executeMerge(drop, keep);
            consumed.add(drop.id);
            report.applied++;
            console.log(`%c[SemanticDedup] merge: "${drop.label}" → "${keep.label}" (sim=${c.sim.toFixed(3)})`, 'color:#10b981');
        } catch (e) {
            report.errors.push(e.message);
            report.skipped++;
        }
    }
    console.log('%c[SemanticDedup] Completato', 'color:#10b981;font-weight:bold', report);
    return report;
};

// ──────────────────────────────────────────────────────────────────────────
// FASE 5 — Riclassificazione semantica
// ──────────────────────────────────────────────────────────────────────────
//
// Dopo Phase 4, riguarda i nodi L2/L3 e propone spostamenti se sono finiti
// sotto una L1 sbagliata. Differenza con Phase 4:
//   - Phase 4 FONDE nodi (rimuove A, tiene B) e aggiunge cross-link
//   - Phase 5 SPOSTA il parent di un nodo (cambia l'L1 di appartenenza)
//
// Esempio reale dai run: "Minaccia invasione" appare sotto Neutralità Statale
// e Difesa Territoriale → Phase 5 sposta uno dei due sotto l'L1 corretta.
//
// Gated dal feature flag mappai_mm_phase5_enabled.

window.isPhase5Enabled = function () {
    try {
        return localStorage.getItem('mappai_mm_phase5_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Costruisce il prompt Fase 5. Per ogni nodo non-L0/L1 mostra il PATH
// gerarchico (es. "Svizzera > Difesa Territoriale > L2 > L3") + l'elenco
// degli L1 esistenti con il loro "ambito" (i loro figli diretti).
window.buildPhase5Prompt = function (nodes, links, l1NodesData) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target
    });
    // parent diretto di ogni nodo (primo source nei link che lo puntano)
    const parentOf = new Map();
    for (const l of links) {
        const { src, tgt } = getId(l);
        if (!parentOf.has(tgt)) parentOf.set(tgt, src);
    }
    // L1 di appartenenza (risale finché non trova un L1)
    const l1Of = (nodeId) => {
        let cur = nodeId, hops = 0;
        while (cur && hops < 10) {
            const n = nodeMap.get(cur);
            if (!n) return null;
            if (n.level === 1) return n.id;
            cur = parentOf.get(cur);
            hops++;
        }
        return null;
    };

    // Costruisci catalogo L1 con AMBITO semantico (se disponibile) + figli diretti
    const l1Catalog = l1NodesData.map(l1 => {
        const directChildren = links
            .filter(l => getId(l).src === l1.id)
            .map(l => nodeMap.get(getId(l).tgt))
            .filter(n => n && n.level === 2)
            .map(n => `"${n.label}"`)
            .slice(0, 8);
        const ambitoPart = l1.ambito ? `\n    ambito: ${l1.ambito}` : '';
        return `- ${l1.id} "${l1.label}"${ambitoPart}\n    contiene: ${directChildren.join(', ') || '(nessun figlio L2)'}`;
    }).join('\n');

    // Lista compatta dei nodi candidati alla riclassificazione (L2 e L3)
    const candidates = nodes
        .filter(n => n.level === 2 || n.level === 3)
        .map(n => {
            const myL1 = l1Of(n.id);
            const l1Label = nodeMap.get(myL1)?.label || '?';
            return `- ${n.id} (L${n.level}) "${n.label}" — attualmente sotto L1 "${l1Label}" (${myL1})`;
        })
        .join('\n');

    return `Sei un VALIDATORE DI CLASSIFICAZIONE per Mappe Mentali su "${appState.rootNodeLabel}".
Ti viene mostrata la struttura della mappa: gli L1 esistenti (con il loro ambito) e i nodi L2/L3 con la loro attuale appartenenza.
Il tuo compito è IDENTIFICARE i nodi L2/L3 che sono finiti sotto la L1 SBAGLIATA e proporre uno spostamento.

⚠️ REGOLA PRIMARIA — DEFAULT: NESSUNA RICLASSIFICAZIONE
Nella maggioranza dei casi i nodi sono già nel posto giusto. Proponi uno spostamento SOLO se sei SICURO al 90%+ che il nodo appartenga più chiaramente a un'altra L1. In dubbio NON toccare.

L1 ESISTENTI (e i loro ambiti tematici, dedotti dai figli L2):
${l1Catalog}

NODI CANDIDATI ALLA VALUTAZIONE (L2 e L3):
${candidates}

CRITERI DI RICLASSIFICAZIONE:
- Un nodo va spostato SOLO se la sua appartenenza tematica all'L1 di destinazione è NETTAMENTE più appropriata di quella attuale.
- "Minaccia invasione" appartiene a "Difesa Territoriale" più che a "Neutralità Statale" (la minaccia è il presupposto della difesa, non della neutralità).
- "Razionamento" appartiene a "Economia di Guerra" più che a "Difesa Militare".
- NON spostare un nodo se l'L1 attuale è "altrettanto valida" come destinazione.
- NON spostare L1 (sono la base).
- Massimo 8 riclassificazioni per chiamata.

FORMATO OUTPUT — TASSATIVO:
JSONL sezionato, ogni operazione su una riga. Niente markdown, niente commenti.

===RECLASSIFY===
{"node_id":"ID_DEL_NODO","from":"L1_ATTUALE","to":"L1_DESTINAZIONE","reason":"motivazione breve"}
{"node_id":"X","from":"L1_2","to":"L1_4","reason":"appartiene tematicamente a..."}

Se non trovi nodi mal classificati, restituisci una sola riga:
===RECLASSIFY===
(e basta — nessuna operazione)`;
};

// Esegue Phase 5. Per ogni riclassificazione valida:
//   1. Rimuove il link parent_attuale → node
//   2. Aggiunge il link nuovo_L1 → node
//   3. Aggiorna il group del nodo (e propaga al sottoalbero se serve)
window.executePhase5Reclassification = async function (giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'mm_phase5');
    const report = { applied: 0, skipped: 0, errors: [], parser: null };

    const apiKey = giro ? null : (window.getSystemKey ? window.getSystemKey() : null);
    if ((!apiKey && !giro)) {
        console.warn('[Phase5] API key non disponibile — skip');
        return report;
    }

    const nodes = appState.db.nodes || [];
    const links = appState.db.links || [];
    const l1NodesData = nodes.filter(n => n.level === 1);
    if (l1NodesData.length < 2 || nodes.length < 8) {
        console.log('[Phase5] Mappa troppo piccola per riclassificazione — skip');
        return report;
    }

    const prompt = window.buildPhase5Prompt(nodes, links, l1NodesData);
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: 'Sei un validatore di classificazione. Rispondi SOLO in JSONL sezionato come richiesto, default = nessuna riclassificazione.' }] },
        generationConfig: { temperature: 0.15, maxOutputTokens: maxOutputTokens(1500) }
    };

    let response;
    try {
        response = await callModelAPI(payload, apiKey);
    } catch (e) { if (giro) giro.verifica();
        console.warn('[Phase5] Chiamata AI fallita:', e.message);
        report.errors.push(e.message);
        return report;
    }

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Riutilizzo parseJSONLResponse esteso (riconosce sezioni custom):
    // estraggo manualmente la sezione RECLASSIFY perché non rientra in NODES/LINKS/MERGES/CROSSLINKS.
    const reclassifyOps = [];
    const cleaned = text.replace(/```jsonl?\s*/gi, '').replace(/```\s*/g, '').trim();
    const sectionMatch = /===\s*RECLASSIFY\s*===\s*\n([\s\S]*?)(?:\n===|\s*$)/i.exec(cleaned);
    if (sectionMatch) {
        for (const line of sectionMatch[1].split('\n')) {
            const s = line.trim();
            if (!s || s.startsWith('//')) continue;
            try {
                const obj = JSON.parse(s.replace(/,\s*$/, ''));
                if (obj && typeof obj.node_id === 'string' && typeof obj.to === 'string') {
                    reclassifyOps.push(obj);
                }
            } catch (e) { if (giro) giro.verifica(); /* riga rotta, skip */ }
        }
    }
    report.parser = { found: reclassifyOps.length };

    if (reclassifyOps.length === 0) {
        console.log('%c[Phase5] Nessuna riclassificazione proposta — mappa già coerente', 'color:#10b981');
        return report;
    }

    // Indice nodi e helper
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const nodeByIdNorm = new Map(nodes.map(n => [String(n.id).toUpperCase(), n.id]));
    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target
    });
    const resolveId = (raw) => nodeByIdNorm.get(String(raw || '').toUpperCase());

    // Helper: conta i figli L2 di un L1 (sottoalbero diretto)
    const countL2Children = (l1Id) => appState.db.links.filter(l => {
        const { src, tgt } = getId(l);
        if (src !== l1Id) return false;
        const tgtNode = nodeById.get(tgt);
        return tgtNode && tgtNode.level === 2;
    }).length;

    // Applica al massimo 8 riclassificazioni
    for (const op of reclassifyOps.slice(0, 8)) {
        try {
            const nodeId = resolveId(op.node_id);
            const toL1Id = resolveId(op.to);
            const node = nodeId ? nodeById.get(nodeId) : null;
            const toL1 = toL1Id ? nodeById.get(toL1Id) : null;
            if (!node || !toL1) {
                report.skipped++;
                report.errors.push(`ID non trovato: node=${op.node_id} to=${op.to}`);
                continue;
            }
            if (toL1.level !== 1) {
                report.skipped++;
                report.errors.push(`Destinazione non è un L1: ${toL1Id}`);
                continue;
            }
            if (node.level <= 1) {
                report.skipped++;
                report.errors.push(`Non sposto L0/L1: ${nodeId}`);
                continue;
            }

            // Safeguard: non svuotare il ramo di origine.
            // Se il nodo è L2 e il ramo sorgente ne ha ≤2, rifiuta lo spostamento
            // per evitare di lasciare rami completamente vuoti (come "Difesa Territoriale: 0 L2").
            if (node.level === 2 && op.from) {
                const fromL1Id = resolveId(op.from);
                if (fromL1Id) {
                    const childrenLeft = countL2Children(fromL1Id);
                    if (childrenLeft <= 2) {
                        report.skipped++;
                        report.errors.push(`Non svuoto L1 "${op.from}" (solo ${childrenLeft} L2 rimasti)`);
                        continue;
                    }
                }
            }

            // Rimuovi link parent attuale → node (solo i link gerarchici, non i cross-link)
            const beforeCount = appState.db.links.length;
            appState.db.links = appState.db.links.filter(l => {
                const { src, tgt } = getId(l);
                if (tgt !== nodeId) return true;
                // mantieni cross-link (isCross) e link da nodi non-L1 (gerarchia profonda)
                if (l.isCross) return true;
                const srcNode = nodeById.get(src);
                if (!srcNode) return true;
                if (srcNode.level !== 1) return true;
                // questo è il link L1_attuale → node, da rimuovere
                return false;
            });
            const removed = beforeCount - appState.db.links.length;

            // Aggiungi nuovo link L1_destinazione → node
            appState.db.links.push({
                source: toL1.id,
                target: node.id,
                rel: 'include',
                _phase5: true
            });

            // Aggiorna group del nodo (gli verrà ricalcolato il colore dal cluster)
            node.group = toL1.group;

            report.applied++;
        } catch (e) { if (giro) giro.verifica();
            report.errors.push(e.message);
            report.skipped++;
        }
    }

    console.log(
        '%c[Phase5] Riclassificazione completata',
        'color:#10b981;font-weight:bold',
        report
    );
    if (report.applied > 0) {
        console.log('   Operazioni applicate:', reclassifyOps.slice(0, report.applied)
            .map(o => `${o.node_id}: ${o.from} → ${o.to} (${o.reason})`));
    }
    return report;
};

// Arricchisce i nodi L1 con desc narrativa e confini espliciti tramite una
// micro-chiamata AI separata. Attivo solo se BranchBoundaries è ON e almeno
// un nodo ha ancora il desc placeholder (cioè il modello non l'ha generato da solo).
window.enrichL1Descs = async function (l1NodesData, rootNodeLabel, apiKey, giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    if (!window.isBranchBoundariesEnabled || !window.isBranchBoundariesEnabled()) return;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'enrich');
    const needsEnrich = l1NodesData.some(
        n => !n.confini || n.desc.startsWith('Categoria principale:')
    );
    if (!needsEnrich || (!apiKey && !giro)) return;

    window.showLoadingOverlay(true, 'Mappa HD - Arricchimento descrizioni rami L1...');

    const l1List = l1NodesData.map(n => {
        const ambitoPart = n.ambito ? ` (ambito: ${n.ambito})` : '';
        return `- "${n.label}"${ambitoPart}`;
    }).join('\n');

    // Lingua del prompt = lingua delle MAPPE (regola 14), stessa fonte del blocco
    // accessibilità (prima: documentElement.lang, sempre 'it' → ramo EN morto).
    const isIT = !(typeof window.getPromptLanguage === 'function' && window.getPromptLanguage() === 'en');
    // Regole di accessibilità desc (glossa + causa-effetto) — '' se registro ricco o
    // kill-switch. Inserite PRIMA della direttiva di formato JSON (mai istruzioni
    // di contenuto dopo lo schema — stessa regola di Focus+Lenses).
    const _adrL1 = window.accessibleDescRules ? window.accessibleDescRules() : '';
    const prompt = isIT
        ? `Hai una mappa mentale sul tema "${rootNodeLabel}" con queste macro-categorie di livello 1:\n\n${l1List}\n\nPer CIASCUNA categoria genera:\n- "desc": 40-60 parole in tono espositivo da manuale (niente metafore, niente giudizi) che spiegano COSA copre questa categoria, PERCHÉ esiste come categoria separata e QUALI concetti chiave contiene.\n- "confini": 1-2 frasi che indicano ESPLICITAMENTE cosa NON appartiene a questa categoria, con riferimento alle ALTRE categorie della lista.${_adrL1}\n\nRestituisci SOLO un Array JSON: [{"label": "...", "desc": "...", "confini": "..."}]\nNessun commento o testo aggiuntivo.`
        : `You have a mind map on the topic "${rootNodeLabel}" with these level 1 macro-categories:\n\n${l1List}\n\nFor EACH category generate:\n- "desc": 40-60 words in expository textbook tone (no metaphors, no judgments) explaining WHAT this category covers, WHY it exists as a separate category, and WHICH key concepts it contains.\n- "confini": 1-2 sentences explicitly stating what does NOT belong in this category, referencing the OTHER categories in the list.${_adrL1}\n\nReturn ONLY a JSON Array: [{"label": "...", "desc": "...", "confini": "..."}]\nNo comments or additional text.`;

    const payload = window.injectClassTuning({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: window.getMaxOutputTokens ? maxOutputTokens(2048) : 2048
        }
    });

    try {
        const data = await callModelAPI(payload, apiKey);
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const enriched = window.salvageTruncatedJSON(cleanText);
        if (!Array.isArray(enriched)) return;

        // Normalizzazione robusta: rimuove articoli iniziali, punteggiatura e
        // contenuto tra parentesi. Evita che un L1 resti col placeholder solo
        // perché il modello ha risposto con un label leggermente diverso
        // (es. "Commercio con l'Asse" vs "Commercio con l'Asse (Germania e Italia)").
        const normLbl = (s) => (s || '')
            .toLowerCase()
            .replace(/\([^)]*\)/g, ' ')                 // togli "(...)"
            .replace(/^(il|lo|la|i|gli|le|un|uno|una|l['']|dell['']|della|delle|dei|degli)\s+/i, '')
            .replace(/[^a-z0-9àèéìòù ]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const enrichedItems = enriched.filter(item => typeof item.label === 'string');
        const byExact = new Map(enrichedItems.map(item => [normLbl(item.label), item]));

        // Match fuzzy: esatto su label normalizzato, poi inclusione bidirezionale
        // (uno è prefisso/sottostringa dell'altro), che cattura le varianti con suffissi.
        const findItem = (node) => {
            const key = normLbl(node.label);
            if (byExact.has(key)) return byExact.get(key);
            return enrichedItems.find(item => {
                const ik = normLbl(item.label);
                return ik && key && (ik.includes(key) || key.includes(ik));
            }) || null;
        };

        let applied = 0, placeholdersLeft = 0;
        for (const node of l1NodesData) {
            const item = findItem(node);
            if (item) {
                if (typeof item.desc === 'string' && item.desc.trim()) node.desc = item.desc.trim();
                if (typeof item.confini === 'string' && item.confini.trim()) node.confini = item.confini.trim();
                node.aiDesc = node.desc;
                // I modali di studio ora leggono `desc || content` (desc = campo ricco),
                // quindi non serve più copiare desc su content: il modale mostra desc.
                applied++;
            }
            if (!node.desc || node.desc.startsWith('Categoria principale:')) placeholdersLeft++;
        }
        console.log(`[enrichL1Descs] ${applied}/${l1NodesData.length} nodi arricchiti` +
            (placeholdersLeft ? ` — ⚠️ ${placeholdersLeft} L1 ancora con desc placeholder` : ''));
    } catch (e) { if (giro) giro.verifica();
        console.warn('[enrichL1Descs] errore non bloccante:', e.message);
    }
};

// ──────────────────────────────────────────────────────────────────────────
// 3b — ARRICCHIMENTO DESC SOTTILI, ANCORATO ALLA FONTE (post-gen)
// ──────────────────────────────────────────────────────────────────────────
//
// I modali dei nodi sono lo strumento di studio principale per gli studenti
// BES/DSA → le desc devono essere ricche. Questo post-pass individua i nodi
// con desc sotto soglia (a QUALSIASI livello) O con groundedness bassa
// (desc romanzata: parole non riscontrabili nella fonte, via
// MappAIDescFidelity) e le riscrive FEDELI al documento sorgente (zero
// allucinazioni). Batched per contenere i token.
// Gated da `mappai_enrich_descs_enabled` (default OFF). Non bloccante.
window.isEnrichDescsEnabled = function () {
    try {
        return localStorage.getItem('mappai_enrich_descs_enabled') === '1'
            && (appState.extractionMode === 'mindmap' || !appState.extractionMode);
    } catch (e) { return false; }
};

// Conta le parole di una desc. Placeholder e vuoti contano 0 → sempre arricchiti.
window._descWordCount = function (s) {
    if (!s || typeof s !== 'string') return 0;
    if (s.startsWith('Categoria principale:')) return 0;
    return s.trim().split(/\s+/).filter(Boolean).length;
};

window.enrichThinDescs = async function (textParts, apiKey, giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    if (!window.isEnrichDescsEnabled || !window.isEnrichDescsEnabled()) return;
    if ((!apiKey && !giro)) return;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'enrich');

    const THRESHOLD = 35;       // parole minime perché una desc sia "ricca"
    const BATCH = 6;            // nodi per chiamata
    const SOURCE_CAP = 28000;   // caratteri di fonte per chiamata (~7k token)

    const nodes = appState.db.nodes || [];
    const links = appState.db.links || [];
    const idToNode = new Map(nodes.map(n => [n.id, n]));
    const linkId = (v) => (typeof v === 'object' && v) ? v.id : v;
    const parentNodeOf = (id) => {
        const link = links.find(l => linkId(l.target) === id && !l.isCross);
        return link ? (idToNode.get(linkId(link.source)) || null) : null;
    };

    const fullSource = (Array.isArray(textParts) ? textParts.join('\n\n') : String(textParts || ''));
    if (!fullSource.trim()) { console.warn('[enrichThinDescs] nessun testo fonte — skip'); return; }
    const source = fullSource.slice(0, SOURCE_CAP);

    // Gate fedeltà: desc lunghe ma poco ancorate alla fonte (romanzate) vanno
    // riscritte quanto quelle corte. Score sul testo pieno, prompt su quello cappato.
    const FIDELITY_MIN = 0.45;
    const fidelity = window.MappAIDescFidelity || null;
    const srcIndex = fidelity ? fidelity.buildSourceIndex(fullSource) : null;
    const isLowFidelity = (n) => {
        if (!srcIndex) return false;
        const s = fidelity.groundedness(n.desc, srcIndex);
        return s !== null && s < FIDELITY_MIN;
    };

    const thin = nodes.filter(n => (n.level ?? 0) >= 1
        && (window._descWordCount(n.desc) < THRESHOLD || isLowFidelity(n)));
    if (!thin.length) { console.log('[enrichThinDescs] nessuna desc sottile o romanzata — skip'); return; }

    // Lingua del prompt = lingua delle MAPPE (regola 14), stessa fonte del blocco
    // accessibilità (prima: documentElement.lang, sempre 'it' → ramo EN morto).
    const isIT = !(typeof window.getPromptLanguage === 'function' && window.getPromptLanguage() === 'en');
    let applied = 0;
    window.showLoadingOverlay(true, isIT ? `Arricchimento descrizioni (${thin.length} nodi)...` : `Enriching descriptions (${thin.length} nodes)...`);

    for (let i = 0; i < thin.length; i += BATCH) {
        const batch = thin.slice(i, i + BATCH);
        const listStr = batch.map((n, idx) => {
            const p = parentNodeOf(n.id);
            const ctx = p ? ` (sotto la categoria "${window.cleanLabel(p.label)}")` : '';
            return `${idx + 1}. "${window.cleanLabel(n.label)}"${ctx}`;
        }).join('\n');

        // Regole di accessibilità desc (glossa + causa-effetto) — '' se registro ricco o
        // kill-switch. Inserite PRIMA della direttiva di formato JSON (mai istruzioni
        // di contenuto dopo lo schema — stessa regola di Focus+Lenses).
        const _adr = window.accessibleDescRules ? window.accessibleDescRules() : '';

        const prompt = isIT
            ? `Sei un redattore didattico per studenti con DSA/BES. Basandoti ESCLUSIVAMENTE sul DOCUMENTO qui sotto, scrivi per ciascun concetto elencato una descrizione chiara di 50-80 parole, in frasi semplici, lineari e fedeli al documento. NON inventare fatti non presenti nel documento. TONO ESPOSITIVO da manuale: niente metafore né similitudini, niente emozioni o motivazioni che il documento non nomina, niente amplificazioni retoriche. Se il documento non contiene abbastanza informazioni su un concetto, scrivi una descrizione più breve ma corretta.\n\nDOCUMENTO:\n${source}\n\nCONCETTI DA DESCRIVERE:\n${listStr}${_adr}\n\nRestituisci SOLO un array JSON: [{"n": 1, "desc": "..."}]. Il campo "n" è il numero del concetto. Nessun altro testo.`
            : `You are an educational editor for students with learning disabilities (SLD/SEN). Based EXCLUSIVELY on the DOCUMENT below, write for each listed concept a clear 50-80 word description, in simple linear sentences faithful to the document. Do NOT invent facts not present in the document. EXPOSITORY TEXTBOOK TONE: no metaphors or similes, no emotions or motives the document does not name, no rhetorical amplification. If the document lacks enough information on a concept, write a shorter but accurate description.\n\nDOCUMENT:\n${source}\n\nCONCEPTS TO DESCRIBE:\n${listStr}${_adr}\n\nReturn ONLY a JSON array: [{"n": 1, "desc": "..."}]. The "n" field is the concept number. No other text.`;

        const payload = window.injectClassTuning({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: window.getMaxOutputTokens ? maxOutputTokens(2048) : 2048
            }
        });

        try {
            const data = await callModelAPI(payload, apiKey);
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            const arr = window.salvageTruncatedJSON(cleanText);
            if (!Array.isArray(arr)) continue;
            for (const item of arr) {
                const idx = parseInt(item && item.n);
                if (isNaN(idx) || idx < 1 || idx > batch.length) continue;
                const node = batch[idx - 1];
                if (item.desc && typeof item.desc === 'string') {
                    // Applica se più ricca in parole O più ancorata alla fonte:
                    // una riscrittura fedele può legittimamente essere più corta
                    // della desc romanzata che sostituisce.
                    const moreWords = window._descWordCount(item.desc) > window._descWordCount(node.desc);
                    const moreGrounded = srcIndex
                        && (fidelity.groundedness(item.desc, srcIndex) ?? 0) > (fidelity.groundedness(node.desc, srcIndex) ?? 0);
                    if (moreWords || moreGrounded) {
                        node.desc = item.desc.trim();
                        node.aiDesc = node.desc;
                        applied++;
                    }
                }
            }
        } catch (e) { if (giro) giro.verifica();
            console.warn(`[enrichThinDescs] batch ${Math.floor(i / BATCH) + 1} fallito:`, e.message);
        }
    }

    window.showLoadingOverlay(false);
    console.log(`%c[enrichThinDescs] ${applied}/${thin.length} desc riscritte (soglia ${THRESHOLD} parole o groundedness < ${FIDELITY_MIN}, ancorate alla fonte)`,
        'color:#10b981;font-weight:bold');
};

window.validateL1Categories = async function (l1Data, rootLabel, giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    if (!Array.isArray(l1Data) || l1Data.length < 3) return l1Data;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'l1_validation');
    const apiKey = giro ? null : (window.getSystemKey ? window.getSystemKey() : null);
    if ((!apiKey && !giro)) return l1Data;

    const listStr = l1Data
        .map((c, i) => `${i + 1}. "${c.label}" (rel: ${c.rel || 'include'})`)
        .join('\n');

    const prompt = `Sei un VALIDATORE CONSERVATIVO di macro-categorie per Mappe Mentali su "${rootLabel}".

CATEGORIE DA VALIDARE:
${listStr}

⚠️ REGOLA PRIMARIA — DEFAULT: NESSUNA MODIFICA ⚠️
Nella stragrande maggioranza dei casi la lista è già buona e va restituita INVARIATA.
Modifica SOLO se identifichi con CERTEZZA uno dei due antipattern qui sotto.
In ogni dubbio, NON toccare.

ANTIPATTERN 1 — Sinonimi tra L1 (raro, solo se EVIDENTI)
Due o più L1 esprimono lo STESSO concetto con parole diverse. Devi essere SICURO al 100%.
Esempio CHIARO: ["Difesa Militare", "Sicurezza Difensiva", "Misure Difensive"] → tieni solo "Difesa Militare".
NON è sinonimia: ["Difesa Militare", "Economia Bellica"] (campi diversi anche se entrambi sul periodo bellico).
Azione: rimuovi i duplicati, tieni il label più chiaro e specifico.

ANTIPATTERN 2 — Meta-categorie fuori livello (più frequente, segnale chiaro)
Una L1 parla del COME si studia il tema invece che di un ASPETTO del tema.
Segnali tipici: contiene parole come "Indagine", "Memoria", "Revisione", "Storiografia", "Analisi", "Studio", "Ricerca".
Azione: sostituisci con un aspetto concreto del tema (es. "Indagine Storica" → "Controversie Storiche", "Memoria Storica" → "Eredità Postbellica").

❌ COSE CHE NON DEVI FARE (anche se ti sembra "migliorabile"):
- NON allargare perimetri con "X e Y": "Difesa" → "Difesa e Sicurezza" è SBAGLIATO se non c'era una L1 "Sicurezza" da fondere.
- NON rimuovere qualificatori disciplinari: "Neutralità Statale" → "Neutralità" è SBAGLIATO (perde specificità).
- NON riformulare per "stile": "Commercio Oro" → "Commercio e Oro" è inutile cosmesi.
- NON aggiungere/togliere categorie se non c'è un antipattern certo.
- NON modificare il "rel" se non strettamente necessario.

REGOLE STRUTTURALI:
- Numero finale: tra 3 e 6 (preferibilmente lo stesso del numero di input).
- Ogni "rel" è un verbo italiano breve, default "include".
- NIENTE date, nomi tra parentesi, congiunzioni "e" inutili nei label.

FORMATO OUTPUT — TASSATIVO:
Restituisci SOLO un array JSON, identico per struttura all'input. Niente markdown, niente commenti, niente testo prima o dopo:
[{"label":"Categoria 1","rel":"include"},{"label":"Categoria 2","rel":"comprende"}]

Se la lista era già perfetta, restituiscila identica. Questa è la risposta CORRETTA nella maggioranza dei casi.`;

    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: 'Sei un consulente di organizzazione concettuale. Rispondi SOLO con un array JSON, nessun testo extra.' }] },
            generationConfig: { temperature: 0.2, maxOutputTokens: maxOutputTokens(1500) }
        };
        const response = await callModelAPI(payload, apiKey);
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanText = text.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        let refined;
        try {
            refined = salvageTruncatedJSON(cleanText);
        } catch (parseErr) { if (giro) giro.verifica();
            console.warn('[Phase 1.5] Parse fallito, mantengo L1 originali:', parseErr.message);
            return l1Data;
        }

        // Validazione output
        if (!Array.isArray(refined)) {
            console.warn('[Phase 1.5] Output non è un array, mantengo L1 originali');
            return l1Data;
        }
        const valid = refined.filter(c =>
            c && typeof c === 'object'
            && typeof c.label === 'string' && c.label.trim()
        );
        if (valid.length < 3) {
            console.warn(`[Phase 1.5] Solo ${valid.length} categorie valide (servono ≥3), mantengo L1 originali`);
            return l1Data;
        }
        // Normalizza rel mancante
        valid.forEach(c => { if (!c.rel || typeof c.rel !== 'string') c.rel = 'include'; });

        const before = l1Data.map(x => x.label);
        const after = valid.map(x => x.label);
        const changed = before.length !== after.length
            || before.some((b, i) => b !== after[i]);

        // ── Guard anti-overcorrection ──
        // Se il Pass 1.5 ha modificato più del 50% dei label, è probabile che abbia
        // applicato il pattern "X → X e Y" o riformulazioni cosmetiche invece di
        // veri fix di sinonimi/meta-categorie. In quel caso rigettiamo l'output
        // e teniamo l'originale (fail-safe contro Mistral over-creative).
        const beforeSet = new Set(before.map(s => s.toLowerCase().trim()));
        const unchanged = after.filter(a => beforeSet.has(a.toLowerCase().trim())).length;
        const modifiedRatio = 1 - (unchanged / Math.max(before.length, after.length));
        if (modifiedRatio > 0.5) {
            console.warn(
                `%c[Phase 1.5] Rigettato output: troppo aggressivo (${Math.round(modifiedRatio * 100)}% label modificati)`,
                'color:orange;font-weight:bold'
            );
            console.log('   Proposto (scartato):', after);
            console.log('   Mantengo originale: ', before);
            return l1Data;
        }

        if (changed) {
            console.log(
                `%c[Phase 1.5] L1 raffinati: ${l1Data.length} → ${valid.length}`,
                'color:#10b981;font-weight:bold'
            );
            console.log('   Prima:', before);
            console.log('   Dopo: ', after);
        } else {
            console.log(`%c[Phase 1.5] L1 già coerenti, nessuna modifica`, 'color:#6366f1');
        }
        return valid;
    } catch (e) { if (giro) giro.verifica();
        console.warn('[Phase 1.5] Errore non bloccante:', e.message);
        return l1Data;
    }
};

// Rileva un label che unisce due concetti distinti tramite congiunzione o separatore.
// Conservativo: solo "e"/"ed"/"e/o"/"and" come parola separata, oppure "/" o "&".
window._isCompoundLabel = function (label) {
    if (!label || typeof label !== 'string') return false;
    const s = label.trim();
    if (/[\/&]/.test(s)) return true;
    if (/(^|\s)(ed|e\/o|e|and)(\s)/i.test(s)) return true;
    return false;
};

// Fase 1.6 — split deterministico+AI delle macro-categorie composte.
// Per ogni L1 composta fa una piccola chiamata AI (array JSON semplice, Apertus-safe)
// che ritorna 2 aree atomiche (con label/rel/ambito/desc/confini) oppure 1 sola se la
// nozione è inscindibile. Degrada in modo sicuro: se l'output non è valido, tiene l'L1
// originale. Rispetta il tetto massimo di macro-aree (MAX_L1 = 7).
window.splitCompoundL1s = async function (l1Data, rootLabel, giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    if (!Array.isArray(l1Data) || l1Data.length === 0) return l1Data;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'l1_split');
    const MAX_L1 = 7;
    const compounds = l1Data.filter(c => c && window._isCompoundLabel(c.label));
    if (compounds.length === 0) {
        console.log('%c[Phase 1.6] Nessuna macro-area composta da spezzare', 'color:#6366f1');
        return l1Data;
    }
    const apiKey = giro ? null : (window.getSystemKey ? window.getSystemKey() : null);
    if ((!apiKey && !giro)) return l1Data;

    let result = [...l1Data];
    for (const comp of compounds) {
        if (result.length >= MAX_L1) {
            console.warn(`[Phase 1.6] Tetto ${MAX_L1} raggiunto, salto split di "${comp.label}"`);
            break;
        }
        const otherLabels = result.filter(c => c !== comp).map(c => c.label);
        const prompt = `La macro-categoria "${comp.label}" di una mappa mentale su "${rootLabel}" sembra unire due concetti distinti tramite una congiunzione.
Se i due concetti sono SEPARABILI, spezzala in DUE macro-categorie atomiche e mono-concetto (una per concetto).
Se invece è una nozione realmente INSCINDIBILE (un'unica entità che perde senso se divisa), restituiscila INVARIATA come singolo elemento.

Altre macro-aree già presenti (NON duplicarle): ${otherLabels.join(', ') || '(nessuna)'}

Per ogni macro-categoria risultante fornisci:
- "label": titolo BREVE e mono-concetto (max 3-4 parole, niente congiunzioni)
- "rel": verbo o locuzione breve che la lega al tema "${rootLabel}" (1-3 parole)
- "ambito": 3-5 parole-chiave separate da virgola
- "desc": 40-60 parole su cosa copre e perché è una categoria a sé
- "confini": 1-2 frasi su cosa NON va in questo ramo

Restituisci SOLO un array JSON (1 oggetto se inscindibile, 2 se separabile). Niente markdown, niente commenti:
[{"label":"...","rel":"...","ambito":"...","desc":"...","confini":"..."}]`;
        try {
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: 'Sei un consulente di organizzazione concettuale. Rispondi SOLO con un array JSON, nessun testo extra.' }] },
                // Phase 1.6 split: base 3000 → 6000 per gemini-2.5-flash.
                // Output atteso: 1-2 oggetti JSON L1 — non tronca mai.
                generationConfig: { temperature: 0.2, maxOutputTokens: maxOutputTokens(3000) }
            };
            const response = await callModelAPI(payload, apiKey);
            const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = text.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
            let parts;
            try { parts = salvageTruncatedJSON(cleanText); } catch (e) { if (giro) giro.verifica(); parts = null; }
            if (!Array.isArray(parts)) {
                console.warn(`[Phase 1.6] Output non valido per "${comp.label}", lo tengo intero`);
                continue;
            }
            const valid = parts.filter(c => c && typeof c === 'object' && typeof c.label === 'string' && c.label.trim());
            if (valid.length < 2) {
                console.log(`%c[Phase 1.6] "${comp.label}" giudicata inscindibile, invariata`, 'color:#6366f1');
                continue;
            }
            const replacement = valid.slice(0, 2);
            replacement.forEach(c => { if (!c.rel || typeof c.rel !== 'string') c.rel = comp.rel || 'include'; });
            const idx = result.indexOf(comp);
            if (idx === -1) continue;
            if (result.length - 1 + replacement.length > MAX_L1) {
                console.warn(`[Phase 1.6] Split di "${comp.label}" sforerebbe il tetto ${MAX_L1}, salto`);
                continue;
            }
            result.splice(idx, 1, ...replacement);
            console.log(`%c[Phase 1.6] "${comp.label}" → ${replacement.map(r => `"${r.label}"`).join(' + ')}`, 'color:#10b981;font-weight:bold');
        } catch (e) { if (giro) giro.verifica();
            console.warn(`[Phase 1.6] split "${comp.label}" non bloccante:`, e.message);
        }
    }
    return result;
};

window.isPhase4Enabled = function () {
    try {
        return localStorage.getItem('mappai_mm_phase4_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Costruisce il prompt Fase 4. Input compatto (solo id+label+desc breve)
// per minimizzare i token: il modello deve ragionare sulla struttura, non
// rileggere tutto il contenuto.
window.buildPhase4Prompt = function (nodes) {
    // Catalogo L1 con ambiti semantici (se disponibili dalla Fase 1)
    const l1List = nodes.filter(n => n.level === 1);
    const l1Catalog = l1List.length
        ? '\nMACRO-AREE L1 DELLA MAPPA (con i loro ambiti tematici):\n' +
          l1List.map(l1 => {
              const ambitoPart = l1.ambito ? ` — ambito: ${l1.ambito}` : '';
              return `- ${l1.id} "${l1.label}"${ambitoPart}`;
          }).join('\n') + '\n'
        : '';

    const compact = nodes
        .filter(n => n.level !== 0) // escludi root
        .map(n => {
            const desc = (n.desc || n.content || '').replace(/\s+/g, ' ').slice(0, 60);
            return `- ${n.id} (L${n.level ?? '?'}) "${n.label}" — ${desc}`;
        })
        .join('\n');

    return `SEI UN CONSOLIDATORE DI GRAFI CONCETTUALI per Mappe Mentali.
Ricevi l'elenco di tutti i nodi della mappa (generati in fasi precedenti ramo per ramo).
Devi produrre DUE risultati che migliorano la coerenza della mappa:

1. MERGES — CERCA ATTIVAMENTE DUPLICATI SEMANTICI CROSS-RAMO (priorità alta)
   I rami sono stati generati in isolamento: spesso lo stesso concetto compare in 2-3 rami
   con label leggermente diversi. Devi trovarli e fonderli.

   ESEMPI CONCRETI di duplicati da fondere SEMPRE:
   • "Oro Nazista" + "Oro controverso nazista" + "Oro tedesco" + "Oro saccheggiato" → STESSO concetto
   • "Politica Asilo" + "Politiche di Asilo" + "Politica dei Profughi" + "Restrizioni asilo" → fondere
   • "Dichiarazione Neutralità" + "Dichiarazione 1939" + "Neutralità Svizzera" (a livello L2/L3) → fondere
   • "Misure Difensive" + "Misure militari" + "Difesa militare" + "Difesa Frontiere" → fondere
   • "Minaccia Invasione" + "Minaccia tedesca" + "Pericolo Nazi" → fondere
   • "Commercio armi" + "Industria Armiera" + "Esportazioni belliche" → fondere

   REGOLA D'ORO: se due label condividono ≥1 parola-chiave centrale (oro, neutralità, difesa,
   profughi, commercio, asilo) E sono in rami diversi E descrivono lo stesso fenomeno,
   FONDILI. Non essere timido: 5-10 merge per mappa sono normali, non eccessivi.

   Per ogni merge indica:
   - "keep": ID del nodo CANONICO (preferisci quello con livello più alto se possibile,
     altrimenti l'etichetta più specifica e chiara)
   - "drop": ID del nodo da rimuovere
   - "reason": breve motivazione (es. "duplicato cross-ramo", "sinonimi")

2. CROSSLINKS — Aggiungi collegamenti TRA RAMI DIVERSI per esplicitare relazioni di:
   causa, prerequisito, conseguenza, contrasto, esempio-di. Solo tra nodi GIÀ esistenti
   nell'elenco (usa SOLO gli ID che trovi qui sotto). Non duplicare link che possono
   essere già impliciti nella gerarchia.

FORMATO DI OUTPUT — TASSATIVO ⚠️
Restituisci DUE sezioni JSONL, una riga JSON per oggetto, niente altro:

===MERGES===
{"keep":"ID_CANONICO","drop":"ID_DA_RIMUOVERE","reason":"duplicato cross-ramo"}
{"keep":"ID_X","drop":"ID_Y","reason":"sinonimi"}
===CROSSLINKS===
{"source":"ID_A","target":"ID_B","rel":"causa"}
{"source":"ID_C","target":"ID_D","rel":"prerequisito"}

REGOLE:
- Usa SOLO ID presenti nell'elenco sotto. Mai inventare nuovi ID.
- Massimo 20 merge per mappa (5-10 è normale, di più rischia overfit).
- Massimo 20 nuovi cross-link, scegli i più significativi pedagogicamente.
- Nessun commento, nessun markdown, nessun testo prima/dopo le sezioni.
- "rel" deve essere un verbo italiano SPECIFICO che esprima il TIPO reale di relazione:
  ${window.relVocab('flat')}.
  REGOLA QUALITÀ: preferisci verbi precisi e critici (es. "smaschera", "condanna",
  "è condizione di") invece di generici come "influenza" o "collega".
  ⚠️ Usa SOLO ID presenti nell'elenco nodi qui sotto — non inventare ID.
${window.mapLangNote()}
${l1Catalog}
ELENCO NODI DELLA MAPPA (cerca le parole-chiave ricorrenti per identificare duplicati,
e confronta i label con gli AMBITI degli L1 sopra per individuare nodi mal classificati):
${compact}`;
};

// Esegue la Fase 4: chiama l'AI, parse, applica merge e cross-link.
// Restituisce un report con cosa è stato applicato e cosa scartato.
window.executePhase4Consolidation = async function (giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'mm_phase4');
    const report = { merges: { applied: 0, skipped: 0, errors: [] },
                     crosslinks: { applied: 0, skipped: 0, errors: [] },
                     parser: null };

    const apiKey = giro ? null : (window.getSystemKey ? window.getSystemKey() : null);
    if ((!apiKey && !giro)) {
        console.warn('[Phase4] API key non disponibile — skip');
        return report;
    }

    const nodes = appState.db.nodes || [];
    if (nodes.length < 6) {
        console.log('[Phase4] Mappa troppo piccola (<6 nodi) — skip');
        return report;
    }

    const prompt = window.buildPhase4Prompt(nodes);
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: 'Sei un consolidatore semantico di grafi. Rispondi SOLO in JSONL come richiesto.' }] },
        // Phase 4 ha BISOGNO del thinking per fare merge di qualità:
        // con thinkingBudget:0 (budget ≤ 12288) genera merge aggressivi e non pensa
        // (run 9/6: 58 merge su 57 nodi → mappa collassata a 25).
        // Base 6500 → doubled = 13000 per gemini-2.5 → 13000 > soglia 12288
        // → thinking preservato automaticamente (consume ~3842 tok, output ~9158).
        generationConfig: { temperature: 0.2, maxOutputTokens: maxOutputTokens(6500) }
    };

    let response;
    try {
        response = await callModelAPI(payload, apiKey);
    } catch (e) { if (giro) giro.verifica();
        console.warn('[Phase4] Chiamata AI fallita:', e.message);
        report.parser = { error: e.message };
        return report;
    }

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = window.parseJSONLResponse(text);
    report.parser = parsed.meta;

    const validIds = new Set(nodes.map(n => n.id));
    const idByNorm = new Map();
    nodes.forEach(n => idByNorm.set(String(n.id).toUpperCase(), n.id));

    // ── Applica MERGES ──
    // Per ogni merge: valida ID, recupera oggetti nodo, chiama executeMerge(drop, keep)
    // (executeMerge(A, B) fonde A→B: A scompare, B sopravvive — quindi A=drop, B=keep)
    const consumedDrops = new Set();
    report._dropToKeep = new Map(); // drop_id → keep_id, per resolveId crosslinks
    for (const m of (parsed.merges || [])) {
        try {
            const keepId = idByNorm.get(String(m.keep || '').toUpperCase());
            const dropId = idByNorm.get(String(m.drop || '').toUpperCase());
            if (!keepId || !dropId) {
                report.merges.skipped++;
                report.merges.errors.push(`ID inesistente: keep=${m.keep} drop=${m.drop}`);
                continue;
            }
            if (keepId === dropId) { report.merges.skipped++; continue; }
            if (consumedDrops.has(dropId)) { report.merges.skipped++; continue; }
            const keepNode = appState.db.nodes.find(n => n.id === keepId);
            const dropNode = appState.db.nodes.find(n => n.id === dropId);
            if (!keepNode || !dropNode) { report.merges.skipped++; continue; }
            // Non fondere se uno dei due è il root
            if (keepNode.level === 0 || dropNode.level === 0) { report.merges.skipped++; continue; }
            window.executeMerge(dropNode, keepNode);
            consumedDrops.add(dropId);
            report._dropToKeep.set(dropId, keepId);
            report.merges.applied++;
        } catch (e) { if (giro) giro.verifica();
            report.merges.errors.push(e.message);
            report.merges.skipped++;
        }
    }

    // ── Applica CROSSLINKS ──
    // Validazione: ID esistenti dopo i merge, no self-loop, no duplicato di link esistente.
    const validIdsAfterMerge = new Set(appState.db.nodes.map(n => n.id));
    const existingLinks = new Set(
        appState.db.links.map(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return `${s}→${t}`;
        })
    );
    // dropToKeep traccia i merge REALMENTE applicati (non solo le proposte AI).
    // Più robusto di parsed.merges perché segue la chain effettiva post-executeMerge.
    const resolveId = (rawId) => {
        const norm = String(rawId || '').toUpperCase();
        let id = idByNorm.get(norm);
        if (!id) return null;
        // Segui la chain drop→keep finché il nodo esiste nel grafo post-merge
        let steps = 0;
        while (id && !validIdsAfterMerge.has(id) && steps < 10) {
            id = report._dropToKeep && report._dropToKeep.get(id);
            steps++;
        }
        return id && validIdsAfterMerge.has(id) ? id : null;
    };

    for (const cl of (parsed.crosslinks || [])) {
        const src = resolveId(cl.source);
        const tgt = resolveId(cl.target);
        if (!src || !tgt || src === tgt) { report.crosslinks.skipped++; continue; }
        const key = `${src}→${tgt}`, keyRev = `${tgt}→${src}`;
        if (existingLinks.has(key) || existingLinks.has(keyRev)) { report.crosslinks.skipped++; continue; }
        appState.db.links.push({
            source: src,
            target: tgt,
            rel: cl.rel || 'correlato a',
            isCross: true,
            _phase4: true
        });
        existingLinks.add(key);
        report.crosslinks.applied++;
    }

    const { _dropToKeep, ...reportLog } = report;
    console.log(
        '%c[Phase4] Consolidamento completato',
        'color:#10b981;font-weight:bold',
        JSON.stringify(reportLog)
    );
    return report;
};

// ============================================================================
// FASE 3.7 — DEEPENING SELETTIVO (residuo dalla fonte + verdetto anti-parafrasi)
// ============================================================================
// Storia: il pass nasceva per riempire la PROFONDITÀ mancante di un ramo e
// riceveva come materiale la SOLA desc del nodo padre → l'audit 20/7/26
// (mm_elvezia + mm_la_carta) ha misurato che ~40% dei nodi finali erano
// parafrasi del padre (id _D<n>, rel 'approfondisce'). Riscrittura in due mosse
// (MappAIDeepenCore, testato in tests/deepen-core.test.js):
//   P1 RESIDUO — il materiale per approfondire una foglia non è più la sua desc
//     (parafrasi per costruzione) ma le FRASI DELLA FONTE (textParts) che
//     parlano del tema della foglia e portano lessico non ancora nella sua desc.
//     Nessun residuo → niente approfondimento. Il contenuto guida la profondità,
//     non lo slider. (Lo slider resta come TETTO di profondità, non come gate.)
//   P2 VERDETTO — rete di sicurezza deterministica: ogni sotto-concetto proposto
//     è scartato se il suo lessico è in gran parte già nel "coperto" (desc del
//     padre + fratelli già accettati) o porta troppe poche parole nuove.
// Default ON. Kill-switch generale: localStorage 'mappai_deepening_enabled'.
// A/B col vecchio comportamento (materiale=desc, no verdetto): localStorage
// 'mappai_deepen_residue'='false'.

window.isDeepeningEnabled = function () {
    try { return localStorage.getItem('mappai_deepening_enabled') !== 'false'; }
    catch (e) { return true; }
};

// Profondità topologica per ramo L1 + istogramma livelli (deterministico, zero AI).
// Ritorna { depthByBranch: {l1Id: depthMax}, labelByBranch, histogram: {level: count} }.
window.computeBranchDepths = function () {
    const nodes = appState.db.nodes || [];
    const links = appState.db.links || [];
    const eid = v => (v && typeof v === 'object') ? v.id : v;
    const childrenOf = {};
    links.forEach(l => {
        if (l.isCross || l.isBridge) return;
        const s = eid(l.source), t = eid(l.target);
        (childrenOf[s] = childrenOf[s] || []).push(t);
    });
    const depthByBranch = {}, labelByBranch = {}, histogram = {};
    nodes.forEach(n => { histogram[n.level] = (histogram[n.level] || 0) + 1; });
    nodes.filter(n => n.level === 1).forEach(l1 => {
        let depth = 1;
        const seen = new Set([l1.id]);
        let frontier = [l1.id], lvl = 1;
        while (frontier.length) {
            const next = [];
            frontier.forEach(id => (childrenOf[id] || []).forEach(c => {
                if (!seen.has(c)) { seen.add(c); next.push(c); }
            }));
            if (next.length) { lvl++; depth = lvl; }
            frontier = next;
        }
        depthByBranch[l1.id] = depth;
        labelByBranch[l1.id] = l1.label;
    });
    return { depthByBranch, labelByBranch, histogram };
};

window.executeDeepeningPass = async function (textParts, apiKey, maxMapLevel, giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    if (!window.isDeepeningEnabled()) return;
    if ((!apiKey && !giro) || appState.extractionMode === 'kg') return;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'deepen');
    const target = parseInt(maxMapLevel);
    if (isNaN(target) || target < 3) return;

    const DC = window.MappAIDeepenCore;
    // Modalità residuo (P1+P2): default ON, richiede il core. Se il core manca o
    // il flag è spento, si torna al comportamento legacy (materiale = desc padre).
    let residueMode = false;
    try { residueMode = !!DC && localStorage.getItem('mappai_deepen_residue') !== 'false'; } catch (e) { if (giro) giro.verifica(); residueMode = !!DC; }

    // Corpus fonte per il residuo: le fonti testuali di questa generazione.
    const corpus = (Array.isArray(textParts) ? textParts : [textParts]).filter(Boolean).join('\n\n');
    if (residueMode && corpus.trim().length < 200) {
        // Senza fonte (es. vault riaperto) il residuo non è calcolabile: il pass
        // legacy qui produrrebbe solo parafrasi → meglio non scavare affatto.
        console.info('[Deepening] modalità residuo attiva ma fonte assente/troppo corta — skip (niente parafrasi).');
        return;
    }

    const MIN_MATERIAL_WORDS = 45;  // materiale minimo per la modalità legacy
    const MAX_CANDIDATES = 4;       // foglie per ramo per chiamata (controllo costi)

    const eid = v => (v && typeof v === 'object') ? v.id : v;
    const wordCount = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
    const parentText = n => ((n.label || '') + '. ' + (n.desc || n.content || '')).trim();
    const legacyMaterial = (n) => {
        const chunks = (appState.db.sourcesDict[n.id] || [])
            .map(c => c.text || c).filter(Boolean).join('\n');
        return ((n.desc || n.content || '') + '\n' + chunks).trim();
    };

    const { depthByBranch, labelByBranch } = window.computeBranchDepths();
    // P1: il gate NON è più la profondità del ramo ma la presenza di RESIDUO nelle
    // sue foglie. In legacy si conserva il vecchio gate (solo rami sotto-profondi).
    const branchIdsToScan = residueMode
        ? Object.keys(depthByBranch)
        : Object.keys(depthByBranch).filter(id => depthByBranch[id] < target);
    if (!branchIdsToScan.length) { console.info('[Deepening] nessun ramo da approfondire'); return; }

    const links = appState.db.links || [];
    const hasChildren = new Set(links.filter(l => !l.isCross && !l.isBridge).map(l => eid(l.source)));
    const childrenOf = {}, parentOf = {};
    links.forEach(l => {
        if (l.isCross || l.isBridge) return;
        (childrenOf[eid(l.source)] = childrenOf[eid(l.source)] || []).push(eid(l.target));
        if (parentOf[eid(l.target)] === undefined) parentOf[eid(l.target)] = eid(l.source);
    });
    const idToNode = new Map(appState.db.nodes.map(n => [n.id, n]));
    const existingLabels = new Set(appState.db.nodes.map(n => (n.label || '').toLowerCase().trim()));

    // Coperto esteso (P2): desc del nodo + di TUTTI gli antenati fino al L1.
    // Senza, un figlio che riformula il nonno o la radice del ramo passa il
    // verdetto ("Pergamena di Pergamo" al 76% col nonno, mappa 2A). Gli id
    // della catena servono al gate P3 per ESCLUDERE gli antenati dal confronto
    // (quel confronto è già di P2, con soglia più severa: senza esclusione un
    // figlio legittimo di un padre a desc corta cadrebbe sul Jaccard 0.55).
    const ancestorChain = (n) => {
        const parts = [], ids = new Set();
        let cur = n, hops = 0;
        while (cur && cur.id !== 'ROOT' && hops < 12) {
            parts.push((cur.label || '') + '. ' + (cur.desc || cur.content || ''));
            ids.add(cur.id);
            cur = idToNode.get(parentOf[cur.id]);
            hops++;
        }
        return { text: parts.join('\n'), ids };
    };

    // Gate anti-duplicato globale (P3): testi label+desc di TUTTI i nodi della
    // mappa, aggiornato a ogni inserimento → un candidato che rifà un nodo di
    // QUALSIASI ramo (anche un D appena creato in un ramo precedente) è scartato.
    const allNodeTexts = residueMode
        ? appState.db.nodes.filter(n => n.id !== 'ROOT').map(n => ({ id: n.id, text: (n.label || '') + ' ' + (n.desc || n.content || '') }))
        : null;

    // P1-bis: assegnazione globale frase→foglia. TUTTI i nodi competono (i non
    // approfondibili come assorbitori) → ogni frase della fonte finisce al più
    // in UNA foglia, quella dove è davvero a tema.
    let residueByLeaf = null;
    if (residueMode) {
        const competitors = appState.db.nodes
            .filter(n => n.id !== 'ROOT')
            .map(n => ({
                id: n.id,
                parentText: parentText(n),
                eligible: n.level >= 2 && n.level < target && !hasChildren.has(n.id)
            }));
        residueByLeaf = DC.assignResidues(competitors, corpus);
    }

    let totalAdded = 0, totalParaphrase = 0, totalDupes = 0;
    for (const l1Id of branchIdsToScan) {
        // discendenti del ramo (BFS gerarchico)
        const branchIds = new Set([l1Id]);
        let frontier = [l1Id];
        while (frontier.length) {
            const next = [];
            frontier.forEach(id => (childrenOf[id] || []).forEach(c => { if (!branchIds.has(c)) { branchIds.add(c); next.push(c); } }));
            frontier = next;
        }
        // foglie fra L2 e target-1; il MATERIALE è il residuo ASSEGNATO (P1-bis:
        // ogni frase vive in una sola foglia) in residueMode, il locale in legacy.
        const candidates = [...branchIds]
            .map(id => idToNode.get(id))
            .filter(n => n && n.level >= 2 && n.level < target && !hasChildren.has(n.id))
            .map(n => residueMode
                ? { n, material: residueByLeaf.get(n.id) || '' }
                : { n, material: legacyMaterial(n) })
            .filter(x => residueMode ? x.material.length > 0 : wordCount(x.material) >= MIN_MATERIAL_WORDS)
            .sort((a, b) => b.material.length - a.material.length)
            .slice(0, MAX_CANDIDATES);
        if (!candidates.length) {
            console.info(`[Deepening] ramo "${labelByBranch[l1Id]}": nessuna foglia con ${residueMode ? 'residuo dalla fonte' : 'materiale sufficiente'} — skip`);
            continue;
        }

        window.showLoadingOverlay(true, `Mappa HD - Fase 3.7: approfondimento ramo "${labelByBranch[l1Id]}"...`);
        const blocks = candidates.map((c, i) => {
            const already = (c.n.desc || c.n.content || '').slice(0, 260);
            return residueMode
                ? `### NODO ${i + 1} — id: ${c.n.id} — "${c.n.label}" (level ${c.n.level})\n`
                    + `GIÀ COPERTO dal nodo (NON ripeterlo): ${already}\n`
                    + `NUOVO MATERIALE DALLA FONTE (estrai i sotto-concetti SOLO da qui):\n${c.material.slice(0, 2200)}`
                : `### NODO ${i + 1} — id: ${c.n.id} — "${c.n.label}" (level ${c.n.level})\nMATERIALE DISPONIBILE:\n${c.material.slice(0, 2200)}`;
        }).join('\n\n');

        const prompt = residueMode
            ? `Stai APPROFONDENDO alcune foglie di una mappa mentale su "${appState.rootNodeLabel}".
Per ogni nodo qui sotto trovi due parti: ciò che il nodo GIÀ dice, e del NUOVO MATERIALE estratto dalla fonte. Estrai da 0 a 3 sotto-concetti che aggiungono informazione NUOVA rispetto a ciò che il nodo già dice.

⚓ REGOLE — PRIORITARIE:
- Usa SOLO il "NUOVO MATERIALE DALLA FONTE". NIENTE conoscenza esterna, niente inferenze.
- NON riformulare il "GIÀ COPERTO": se il nuovo materiale non aggiunge un dettaglio distinto, restituisci array vuoto. Meglio vuoto che una parafrasi.
- Ogni sotto-concetto = UN dato/attore/causa/data/luogo/meccanismo specifico assente dal "GIÀ COPERTO".
- desc: 30-60 parole, tono da manuale, solo fatti del nuovo materiale.
- label: max 4 parole, il concetto specifico.

${blocks}

Rispondi SOLO con JSON puro:
{"expansions":[{"parent":"<id del nodo>","children":[{"label":"...","desc":"...","children":[{"label":"...","desc":"..."}]}]}]}`
            : `Stai APPROFONDENDO alcune foglie di una mappa mentale su "${appState.rootNodeLabel}".
Per OGNI nodo elencato sotto, estrai 1-3 sotto-concetti PIÙ SPECIFICI del concetto padre, usando ESCLUSIVAMENTE il materiale fornito per quel nodo. Puoi annidare un ulteriore livello (figli di figli) solo se il materiale contiene davvero quel dettaglio.

⚓ REGOLA DI FEDELTÀ — PRIORITARIA:
- Ogni label e ogni desc devono trovare riscontro letterale nel MATERIALE del nodo. NIENTE conoscenza esterna, niente inferenze.
- Se il materiale di un nodo non contiene sotto-dettagli distinti, restituisci per quel nodo un array vuoto. Meglio vuoto che inventato.
- desc: 30-60 parole, tono espositivo da manuale, solo fatti presenti nel materiale.
- label: max 4 parole, concetto esplicito del materiale (un dato, un attore, una causa, una data, un luogo, un meccanismo).

${blocks}

Rispondi SOLO con JSON puro:
{"expansions":[{"parent":"<id del nodo>","children":[{"label":"...","desc":"...","children":[{"label":"...","desc":"..."}]}]}]}`;

        try {
            const response = await callModelAPI({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: buildSystemInstruction('Sei un estrattore di sotto-concetti fedele alla fonte. Rispondi solo JSON conforme.') }] },
                generationConfig: { temperature: 0.25, maxOutputTokens: maxOutputTokens(3000), responseMimeType: 'application/json' }
            }, apiKey);
            const raw = response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const data = salvageTruncatedJSON(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
            const expansions = (data && data.expansions) || [];

            let branchAdded = 0, branchParaphrase = 0, branchDupes = 0, seq = 0;
            // Ordine dei gate PER OGNI figlio, in sequenza (il coperto cresce solo
            // coi fratelli DAVVERO inseriti — mai con candidati poi bocciati):
            //   P2 parafrasi vs antenati+fratelli → label esatta → P3 duplicato
            //   globale (antenati esclusi: quel confronto è già di P2).
            const addChildren = (parentNode, kids, depthLeft, coveredBase, excludeIds) => {
                if (!Array.isArray(kids) || depthLeft <= 0) return;
                let covered = coveredBase;
                kids.slice(0, 3).forEach(kid => {
                    const label = String(kid.label || '').trim();
                    const desc = String(kid.desc || '').trim();
                    if (!label || existingLabels.has(label.toLowerCase())) return;
                    const kidText = label + ' ' + desc;
                    if (residueMode) {
                        const v = DC.paraphraseVerdict(kidText, covered);
                        if (!v.accept) { branchParaphrase++; return; }
                        const otherTexts = allNodeTexts.filter(t => !excludeIds.has(t.id)).map(t => t.text);
                        if (DC.isNearDuplicate(kidText, otherTexts) >= 0) { branchDupes++; return; }
                    }
                    const newId = `${parentNode.id}_D${++seq}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                    const newNode = {
                        id: newId, label, level: parentNode.level + 1,
                        group: parentNode.group, desc,
                        content: '', studyStatus: 'none'
                    };
                    appState.db.nodes.push(newNode);
                    appState.db.links.push({ source: parentNode.id, target: newId, rel: 'approfondisce' });
                    appState.db.sourcesDict[newId] = [{ title: parentNode.label, source: 'Approfondimento', text: newNode.desc }];
                    existingLabels.add(label.toLowerCase());
                    if (allNodeTexts) allNodeTexts.push({ id: newId, text: kidText });
                    branchAdded++;
                    if (residueMode) covered += '\n' + desc;
                    // annidati: gli antenati del nipote = coveredBase della catena +
                    // il nodo appena creato (NON i suoi fratelli/zii)
                    addChildren(newNode, kid.children, depthLeft - 1,
                        residueMode ? (coveredBase + '\n' + desc) : coveredBase,
                        residueMode ? new Set([...excludeIds, newId]) : excludeIds);
                });
            };
            expansions.forEach(exp => {
                const parentNode = idToNode.get(exp.parent) ||
                    candidates.map(c => c.n).find(n => n.id.toUpperCase() === String(exp.parent || '').toUpperCase());
                if (!parentNode) return;
                const chain = residueMode ? ancestorChain(parentNode) : { text: '', ids: null };
                addChildren(parentNode, exp.children, target - parentNode.level, chain.text, chain.ids);
            });
            totalAdded += branchAdded;
            totalParaphrase += branchParaphrase;
            totalDupes += branchDupes;
            const after = window.computeBranchDepths().depthByBranch[l1Id];
            const skips = [];
            if (branchParaphrase) skips.push(`${branchParaphrase} parafrasi`);
            if (branchDupes) skips.push(`${branchDupes} duplicati globali`);
            console.info(`[Deepening] ramo "${labelByBranch[l1Id]}": depth ${depthByBranch[l1Id]}→${after}, +${branchAdded} nodi${skips.length ? `, scartati: ${skips.join(' + ')}` : ''}`);
        } catch (e) { if (giro) giro.verifica();
            console.warn(`[Deepening] ramo "${labelByBranch[l1Id]}" fallito (non bloccante):`, e.message);
        }
    }
    if (totalAdded > 0 || totalParaphrase > 0 || totalDupes > 0) console.info(`[Deepening] Fase 3.7 completata: +${totalAdded} nodi${totalParaphrase ? `, ${totalParaphrase} parafrasi scartate (P2)` : ''}${totalDupes ? `, ${totalDupes} duplicati globali scartati (P3)` : ''}`);
};

// ── Profondità di GENERAZIONE (≠ filtro vista) ──────────────────────────────
// Decisione utente (21/7/26): due controlli separati. "Genera fino a"
// (mappai_gen_depth) è autoritativo sui DATI e guida Fase 3 + tetto; lo slider
// #level-slider resta il filtro di VISTA (mostra fino a). Fallback allo slider
// per retrocompatibilità, poi 5.
window.getGenDepth = function () {
    // Profondità AUTOMATICA (toggle #auto-depth-toggle): se attiva e il triage ha
    // prodotto un verdetto, la profondità-essenziale della scheda (mmTriage) governa
    // la generazione — il menu manuale è ignorato. Nessun verdetto (KG, triage OFF/
    // fallito) → fallback al valore manuale sotto.
    try {
        if (localStorage.getItem('mappai_auto_depth') === '1' &&
            typeof appState !== 'undefined' && appState && appState.mmTriage) {
            const ed = parseInt(appState.mmTriage.essentialDepth);
            if (ed >= 1 && ed <= 5) return ed;
        }
    } catch (e) { /* soft → manuale */ }
    const stored = parseInt(localStorage.getItem('mappai_gen_depth'));
    if (stored >= 1 && stored <= 5) return stored;
    const el = document.getElementById('level-slider');
    const sv = el ? parseInt(el.value) : NaN;
    return (sv >= 1 && sv <= 5) ? sv : 5;
};
window.setGenDepth = function (v) {
    const n = parseInt(v);
    if (n >= 1 && n <= 5) localStorage.setItem('mappai_gen_depth', String(n));
};
// ── Profondità automatica (toggle vicino al menu #gen-depth-select) ──────────
// Flag `mappai_auto_depth` (default OFF). ON → il triage sceglie il tetto dal
// tipo di scheda (essentialDepth) e il menu manuale è disattivato. Il triage
// (mappai-mm-triage.js) parte quando questo flag O «Adattiva» è attivo.
window.getAutoDepth = function () { return localStorage.getItem('mappai_auto_depth') === '1'; };
window.setAutoDepth = function (on) {
    localStorage.setItem('mappai_auto_depth', on ? '1' : '0');
    if (window.syncAutoDepthUI) window.syncAutoDepthUI();
};
window.syncAutoDepthUI = function () {
    const on = window.getAutoDepth();
    const btn = document.getElementById('auto-depth-toggle');
    const man = document.getElementById('manual-depth-toggle');
    const sel = document.getElementById('gen-depth-select');
    const hint = document.getElementById('auto-depth-hint');
    // ⚠️ Le due facce si governano INSIEME (5/8): «Profondità» è uno switch come
    // Single/Multi, non un bottone che si accende. La faccia attiva si marca come
    // le altre — `bg-white shadow-sm` + `aria-pressed` — così una sola regola CSS
    // (dentro il bento: fondo verde) vale per tutti e quattro gli switch invece di
    // avere una veste per questo comando e una per gli altri.
    const faccia = function (el, attiva) {
        if (!el) return;
        el.setAttribute('aria-pressed', attiva ? 'true' : 'false');
        el.classList.toggle('bg-white', attiva);
        el.classList.toggle('shadow-sm', attiva);
        el.classList.toggle('text-slate-700', attiva);
        el.classList.toggle('text-slate-500', !attiva);
        el.classList.toggle('hover:text-slate-700', !attiva);
    };
    faccia(btn, on);
    faccia(man, !on);
    if (sel) {
        sel.disabled = on;
        sel.classList.toggle('opacity-40', on);
        sel.classList.toggle('cursor-not-allowed', on);
        sel.classList.toggle('cursor-pointer', !on);
    }
    if (hint) hint.classList.toggle('hidden', !on);
};
// Il selettore «Profondità di generazione» vive nel form principale (sempre
// visibile): riflette il valore salvato al caricamento + lo stato del toggle auto.
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
        const sel = document.getElementById('gen-depth-select');
        if (sel && window.getGenDepth) sel.value = String(
            (parseInt(localStorage.getItem('mappai_gen_depth')) >= 1) ? parseInt(localStorage.getItem('mappai_gen_depth')) : 5);
        if (window.syncAutoDepthUI) window.syncAutoDepthUI();
    });
}

// ── TETTO DI PROFONDITÀ — applica foldBeyondDepth su appState ────────────────
// Rende "Genera fino a L{max}" una garanzia NEI DATI: i nodi oltre il tetto
// (che la Fase 3 può ancora produrre nonostante il prompt) vengono ripiegati
// nella desc dell'antenato-al-tetto invece di restare nascosti dal filtro vista.
// Deterministico, zero AI. Kill-switch: mappai_depth_ceiling === '0'.
window.applyDepthCeiling = function (maxMapLevel) {
    try {
        if (localStorage.getItem('mappai_depth_ceiling') === '0') return;
        if (appState.extractionMode === 'kg') return;         // il tetto ha senso solo sulle MM gerarchiche
        const DC = window.MappAIDeepenCore;
        const max = parseInt(maxMapLevel);
        if (!DC || !DC.foldBeyondDepth || !(max >= 1)) return;
        const before = appState.db.nodes.length;
        const res = DC.foldBeyondDepth(appState.db.nodes, appState.db.links, max);
        if (!res.removed.length) return;                       // niente da ripiegare
        const removedSet = new Set(res.removed);
        appState.db.nodes = res.nodes;
        appState.db.links = res.links;
        // pulizia collaterale: sourcesDict e customColors dei nodi ripiegati
        if (appState.db.sourcesDict) res.removed.forEach(id => { delete appState.db.sourcesDict[id]; });
        if (appState.db.customColors) res.removed.forEach(id => { delete appState.db.customColors[id]; });
        console.info(`[Tetto L${max}] ${before}→${appState.db.nodes.length} nodi · ${res.removed.length} ripiegati · ${res.report.appended} dettagli confluiti nelle desc · ${res.report.skippedDup} parafrasi scartate`);
    } catch (e) {
        console.warn('[Tetto profondità] errore non bloccante:', e.message);
    }
};

// ══════════════════════════════════════════════════════════════════════════
// PASSAGGIO DI COPERTURA — recupera ciò che la fonte diceva e la mappa non ha
// ══════════════════════════════════════════════════════════════════════════
//
// PERCHÉ ESISTE (12 settembre 2026). L'àncora sa dire quali frasi della fonte
// non sono finite in nessun nodo. Nella prima generazione vera la pagina
// economica del dossier stava al 13%: il meccanismo per cui la Germania aveva
// bisogno di valuta svizzera — il cuore di quella pagina — non era in mappa, e
// prima dell'àncora non c'era modo di accorgersene senza rileggere il PDF.
// Misurarlo non basta: qui si rimanda al modello SOLO quel residuo e gli si
// chiede di recuperarlo.
//
// UNA chiamata, e solo quando serve davvero: se la fonte è coperta il passaggio
// non parte e non costa niente.
//
// ⚠️ Si manda il RESIDUO, non il corpus: rimandare la fonte intera vorrebbe dire
// rifare la Fase 3, e il modello riprodurrebbe i concetti che ha già estratto
// invece di cercare quelli che ha saltato.
//
// ⚠️ Il genitore è vincolato da un `enum` sulle macro-aree vere, e poi RICONTROLLATO:
// un enum su Gemini è una richiesta, non una legge. Le proposte passano da
// `validaProposte` (genitore vero, nodo non già presente, prova dentro il residuo,
// desc non mozza) e sono capate a otto: questo passaggio recupera un buco, non
// raddoppia la mappa.
//
// Kill-switch: localStorage `mappai_copertura_enabled` = '0'.
window.isCoveragePassEnabled = function () {
    try { return localStorage.getItem('mappai_copertura_enabled') !== '0'; } catch (e) { return true; }
};

window.executeCoveragePass = async function (apiKey, opts, giro) {
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    const o = opts || {};
    const A = window.MappAIAnchorCore;
    const rep = appState._qualityReport;
    const esito = { fase: o.phase || 'iniziale', stato: 'saltato', motivoSkip: '', aggiunti: 0, idsAggiunti: [],
        scartate: [], pagine: [], frasiSelezionate: [], prima: rep && rep.copertura ? JSON.parse(JSON.stringify(rep.copertura)) : null, dopo: null };
    const salta = motivo => { esito.motivoSkip = motivo; return esito; };
    if (!A || !rep || !rep.copertura) return salta('misura della copertura non disponibile');
    if (!window.isCoveragePassEnabled()) return salta('recupero disattivato');
    if ((!apiKey && !giro)) return salta('chiave del provider non disponibile');
    const sel = A.orfanePerPassaggio(rep.copertura);
    esito.frasiSelezionate = sel.frasi;
    esito.pagine = sel.pagine;
    if (sel.frasi.length < 4) return salta(sel.pagine.length ? 'meno di quattro frasi residue selezionate' : 'nessuna pagina sotto la soglia di recupero');
    if (o.previous) {
        const precedenti = new Set((o.previous.frasiSelezionate || []).map(f => f.page + ':' + f.text));
        const nuove = sel.frasi.filter(f => !precedenti.has(f.page + ':' + f.text));
        const nuovaPagina = sel.pagine.some(p => !(o.previous.pagine || []).includes(p));
        esito.nuoveFrasi = nuove.length;
        // ponytail: una sola seconda chiamata, solo per un residuo cambiato
        // (almeno quattro frasi nuove o una pagina appena scesa sotto soglia).
        if (nuove.length < 4 && !(nuove.length && nuovaPagina)) return salta('residuo invariato o non significativo dopo arricchimento');
    }
    const rami = (appState.db.nodes || []).filter(n => (n.level || 0) === 1);
    if (!rami.length) return salta('nessuna macro-area disponibile');
    const catalogo = rami.map(r => {
        const guida = (r.ambito && r.ambito.trim()) || String(r.desc || '').slice(0, 120);
        return '- ' + r.id + ' — "' + (window.cleanLabel ? window.cleanLabel(r.label) : r.label) + '"' +
            (guida ? ' (' + guida + ')' : '');
    }).join('\n');

    const residuo = sel.frasi.map(f => '· ' + f.text).join('\n');
    const en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';

    const prompt = en
        ? `A mind map on "${appState.rootNodeLabel}" was built from a source document. These sentences of the source did NOT end up in any node:\n\n${residuo}\n\nThe map's macro-areas are:\n${catalogo}\n\nFor each distinct concept that lives ONLY in the sentences above, produce one node and attach it to the macro-area it belongs to.\n⚓ RULES — BINDING:\n- Use ONLY the sentences above. NO outside knowledge, no inference.\n- "evidenza": copy the sentence above that the node comes from. If a concept has no sentence, do not write that node.\n- Do not restate a macro-area: propose the SPECIFIC thing the source says and the map lost.\n- "desc": 30-60 words, textbook tone, only facts from those sentences.\n- "label": max 4 words.\n- If those sentences add nothing worth a node, return an empty list. Empty is better than invented.`
        : `Una mappa mentale su "${appState.rootNodeLabel}" è stata costruita da un documento. Queste frasi della fonte NON sono finite in nessun nodo:\n\n${residuo}\n\nLe macro-aree della mappa sono:\n${catalogo}\n\nPer ogni concetto distinto che vive SOLO nelle frasi qui sopra, scrivi un nodo e attaccalo alla macro-area a cui appartiene.\n⚓ REGOLE — VINCOLANTI:\n- Usa SOLO le frasi qui sopra. NIENTE conoscenza esterna, niente inferenze.\n- "evidenza": copia la frase qui sopra da cui il nodo nasce. Se un concetto non ha una frase, non scrivere quel nodo.\n- Non riformulare una macro-area: proponi la cosa SPECIFICA che la fonte dice e che la mappa ha perso.\n- "desc": 30-60 parole, tono da manuale, solo fatti presenti in quelle frasi.\n- "label": massimo 4 parole.\n- Se quelle frasi non aggiungono niente che meriti un nodo, restituisci una lista vuota. Meglio vuota che inventata.`;

    const schema = {
        type: 'OBJECT',
        properties: {
            nodi: {
                type: 'ARRAY',
                maxItems: 8,
                items: {
                    type: 'OBJECT',
                    properties: {
                        parent: { type: 'STRING', enum: rami.map(r => r.id) },
                        label: { type: 'STRING' },
                        desc: { type: 'STRING' },
                        evidenza: { type: 'STRING' }
                    },
                    required: ['parent', 'label', 'desc', 'evidenza']
                }
            }
        },
        required: ['nodi']
    };

    try {
        if (window.MappAIUsage) window.MappAIUsage.setContext('generation', 'copertura');
        if (window.showLoadingOverlay) {
            window.showLoadingOverlay(true, window.t('lo_copertura', 'Recupero le parti della fonte rimaste fuori…'));
        }
        const payload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: buildSystemInstruction('Sei un recuperatore di concetti fedele alla fonte. Rispondi solo JSON conforme allo schema.') }] },
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: maxOutputTokens(2500),
                responseMimeType: 'application/json',
                responseSchema: schema
            }
        };
        const resp = await callModelAPI(payload, apiKey);
        const raw = resp?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const data = salvageTruncatedJSON(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        const proposte = (data && Array.isArray(data.nodi)) ? data.nodi : [];
        if (!data || !Array.isArray(data.nodi)) throw new Error('risposta di copertura priva dell’elenco nodi');
        esito.stato = 'completato';
        if (!proposte.length) { esito.motivoSkip = 'nessuna proposta restituita'; return esito; }

        const v = A.validaProposte(proposte, {
            genitori: rami.map(r => r.id),
            etichette: (appState.db.nodes || []).map(n => n.label),
            frasi: sel.frasi,
            max: 8
        });
        if (v.scartate.length) {
            console.warn('[Copertura] ' + v.scartate.length + ' proposte scartate: ' +
                v.scartate.map(x => '«' + x.label + '» (' + x.perche + ')').join(' · '));
        }

        let n = 0;
        const ids = new Set(appState.db.nodes.map(n => n.id));
        v.proposte.forEach(pz => {
            const padre = rami.find(r => r.id === pz.parent);
            if (!padre) return;
            n++;
            let indice = n;
            while (ids.has(padre.id + '_C' + indice)) indice++;
            const id = padre.id + '_C' + indice;
            ids.add(id);
            esito.idsAggiunti.push(id);
            appState.db.nodes.push({
                id: id,
                label: String(pz.label).trim(),
                content: '',
                desc: String(pz.desc).trim(),
                aiDesc: String(pz.desc).trim(),
                level: (padre.level || 1) + 1,
                group: padre.group,
                chunks: [],
                studyStatus: 'none',
                _copertura: true          // da dove viene questo nodo, se un giorno serve saperlo
            });
            appState.db.links.push({ source: padre.id, target: id, rel: 'include' });
        });
        if (n) console.info('[Copertura] ' + n + ' nodi recuperati dalle pagine ' + sel.pagine.join(', '));
        esito.aggiunti = n;
        esito.scartate = v.scartate;
        if (!n) esito.motivoSkip = 'nessuna proposta accettata dai controlli';
        return esito;
    } catch (e) { if (giro) giro.verifica();
        console.warn('[Copertura] errore non bloccante:', e.message);
        esito.stato = 'errore';
        esito.motivoSkip = e.message;
        return esito;
    }
};

// ══════════════════════════════════════════════════════════════════════════
// IL GIUDICE — rilegge ogni ramo con davanti le frasi della fonte
// ══════════════════════════════════════════════════════════════════════════
//
// PERCHÉ ESISTE (12 settembre 2026). L'àncora misura la fedeltà LESSICALE e non
// vede l'errore che conta: sulla generazione vera esce 0,78-0,82 con ZERO nodi
// sotto soglia mentre la fonte dice che era LA GERMANIA ad avere bisogno di
// franchi svizzeri e la desc dice che era la Svizzera a ottenere valuta. Le
// parole vengono tutte dalla fonte: è il senso a essere girato, e per quello
// serve un lettore.
//
// ⚠️ CHE COSA È AUTORIZZATO A FARE, e perché così poco. Il progetto è passato da
// cinque proposte con altrettanti avversari incaricati di demolirle. Quattro su
// cinque hanno concluso che la riscrittura in prosa non è difendibile, e uno
// l'ha MISURATO: facendo girare le guardie sul caso vero, correggere «la
// Svizzera aveva bisogno di franchi» in «la Germania…» e fare lo scambio
// INVERSO danno numeri identici. Quindi il giudice:
//   · NON riscrive una desc in prosa, mai;
//   · può proporre una FORBICE — la porzione esatta sbagliata e che cosa
//     metterci — che il codice verifica con due confronti di stringa;
//   · non promuove mai un arco a un verbo causale: può solo togliere un verbo
//     che non regge;
//   · non tocca label, padri e livelli: quello sarebbe un secondo generatore.
//
// ⚠️ RICEVE ANCHE LE FRASI CHE L'ÀNCORA HA SCARTATO dalle stesse pagine. Senza,
// la prova che SMENTISCE un nodo non gli arriva: l'àncora dà a ogni nodo le
// frasi più vicine alla sua desc, cioè quelle che gli assomigliano — e una desc
// sbagliata assomiglia alla frase sbagliata. È il caso della commissione
// «formata nel 2002»: la frase che lo smentisce non era fra le sue citazioni.
//
// Due interruttori, entrambi SPENTI di partenza (a differenza dell'àncora e
// della copertura, che sono deterministiche e non riscrivono contenuto):
//   `mappai_giudice_enabled` = '1' → il giudice gira e scrive il rapporto;
//   `mappai_giudice_applica` = '1' → le forbici verificate si applicano davvero.
// Acceso solo il primo si ottiene il «segnala e basta», che è la modalità con
// cui vanno raccolti i numeri prima di lasciarlo scrivere.
window.isJudgeEnabled = function () {
    try { return localStorage.getItem('mappai_giudice_enabled') === '1'; } catch (e) { return false; }
};
window.isJudgeApplyEnabled = function () {
    try { return localStorage.getItem('mappai_giudice_applica') === '1'; } catch (e) { return false; }
};

window.executeJudgePass = async function (apiKey, opts, giro) {
    const callModelAPI = giro ? payload => giro.chat('giudice', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('giudice') : undefined);
    const o = opts || {};
    const J = window.MappAIJudgeCore, A = window.MappAIAnchorCore;
    const revisione = !!appState._reviewRequested;
    const abilitato = typeof o.enabled === 'boolean' ? o.enabled : (revisione || window.isJudgeEnabled());
    const applica = !revisione && (typeof o.apply === 'boolean' ? o.apply : window.isJudgeApplyEnabled());
    const nodi = (appState.db && appState.db.nodes) || [];
    // The root owns its description and outgoing links, in a separate pass.
    const rami = nodi.filter(n => (n.level || 0) === 1).concat(nodi.filter(n => (n.level || 0) === 0));
    const esito = { quando: new Date().toISOString(), stato: 'in-corso', motivoSkip: '',
        rami: 0, ramiPrevisti: rami.length, correzioni: [], applicate: 0, segnalati: [], scartati: [],
        linkTolti: [], applicaAcceso: applica, esitiRami: [],
        copertura: { nodiTotali: nodi.length, nodiEsaminati: [], nodiSaltati: [], linkEsaminati: [], linkSaltati: [] } };
    // Alias unico: il rapporto esiste anche se il passaggio non può partire.
    appState._giudiceReport = appState._judgeReport = esito;
    const salta = motivo => { esito.stato = 'saltato'; esito.motivoSkip = motivo; return esito; };
    if (!abilitato) return salta('giudice non richiesto');
    if (!J || !A) return salta('modulo del giudice o della fonte non disponibile');
    if ((!apiKey && !giro)) return salta('chiave del provider non disponibile');
    if (!rami.length) return salta('nessun ramo da esaminare');

    /* Tutte le frasi della fonte, con la loro pagina: servono a dare al giudice
       anche ciò che l'àncora NON ha scelto per quel nodo. */
    let tutte = [];
    const documenti = [];
    try {
        const registrate = Array.isArray(appState._generationSources);
        let fonti = registrate ? appState._generationSources : (appState._pdfPagine || []);
        if (!registrate && !fonti.some(f => Array.isArray(f && f.pages) && f.pages.length)) fonti = appState.sources || [];
        fonti.forEach((f, i) => {
            if (!f) return;
            const pages = Array.isArray(f.pages) && f.pages.length ? f.pages.map(p => ({ n: p.n || p.page || 0, text: p.text || p.content || '' }))
                : A.paginePiatte([typeof f === 'string' ? f : f.text || f.content || '']);
            const doc = { docId: String(f.documentId || f.docId || f.id || 'fonte-' + (i + 1)),
                title: f.title || f.nome || f.name || f.fileName || 'Fonte ' + (i + 1), pages };
            documenti.push(doc);
            A.frasiDaPagine(pages).forEach(frase => tutte.push(Object.assign({}, frase, { docId: doc.docId, title: doc.title })));
        });
    } catch (e) { if (giro) giro.verifica(); tutte = []; }
    if (!tutte.length) return salta('testo della fonte non disponibile');

    const eid = x => (x && typeof x === 'object') ? x.id : x;
    const perId = new Map(nodi.map(n => [n.id, n]));
    const proprietario = new Map();
    const perRamo = new Map();
    rami.forEach(ramo => {
        const figli = (ramo.level || 0) === 0 ? [] :
            (window.getDescendants ? window.getDescendants(ramo.id) : nodi.filter(n => n.level > 1 && n.group === ramo.group)) || [];
        const ids = [ramo.id].concat(figli.map(eid));
        perRamo.set(ramo.id, ids);
        ids.forEach(id => { if (!proprietario.has(id)) proprietario.set(id, ramo.id); });
    });
    const frammenti = {}, evidenze = {};
    nodi.forEach(n => {
        if (!String(n.desc || '').trim()) return;
        const cit = ((appState.db.sourcesDict || {})[n.id] || []).filter(e => e && e.verbatim && e.text);
        if (!cit.length) return;
        const contesto = new Set(), norm = text => String(text || '').replace(/\s+/g, ' ').trim();
        cit.forEach(c => {
            const id = c.docId || c.documentId;
            let pool = id ? documenti.filter(d => d.docId === String(id)) : documenti;
            const named = pool.filter(d => d.title === c.title);
            if (!id && named.length) pool = named;
            const page = Number(c.page || (String(c.source || '').match(/(?:pag(?:ina|e)?\.?|p\.)\s*(\d+)/i) || [])[1] || 0);
            pool.forEach(d => d.pages.filter(p => !page || Number(p.n) === page).forEach(p => {
                if (norm(c.text) && norm(p.text).includes(norm(c.text))) contesto.add(d.docId + '|' + p.n);
            }));
        });
        evidenze[n.id] = cit.map(e => ({ title: e.title || '', source: e.source || '', page: e.page || 0,
            docId: e.docId || e.documentId || '', text: e.text, verbatim: true }));
        tutte.filter(f => contesto.has(f.docId + '|' + f.page) && !cit.some(e => norm(e.text) === norm(f.text))).slice(0, 10)
            .forEach(f => evidenze[n.id].push({ docId: f.docId, title: f.title, page: f.page,
                source: f.page ? 'pagina ' + f.page : 'fonte senza pagine', text: f.text, verbatim: true }));
        frammenti[n.id] = evidenze[n.id].map(e => e.text);
    });
    const archiPerRamo = new Map(rami.map(r => [r.id, []]));
    (appState.db.links || []).forEach(l => {
        if (/^(include|includes|correlato a|related to|dettagli|approfondisce)$/i.test(String(l.rel || ''))) return;
        const source = eid(l.source), target = eid(l.target), owner = proprietario.get(source);
        if (!owner || !frammenti[source] || !frammenti[target]) {
            esito.copertura.linkSaltati.push({ source, target, rel: l.rel, motivo: 'ramo o evidenze degli estremi mancanti' });
            return;
        }
        // Anche i cross-group: il ramo della sorgente li esamina una sola volta.
        archiPerRamo.get(owner).push(l);
    });
    const letti = new Set();
    for (const ramo of rami) {
        const giudicabili = (perRamo.get(ramo.id) || []).map(id => perId.get(id))
            .filter(n => n && proprietario.get(n.id) === ramo.id && frammenti[n.id]).map(n => Object.assign({}, n));
        const archi = archiPerRamo.get(ramo.id) || [];
        const statoRamo = { id: ramo.id, label: ramo.label, stato: 'saltato', nodi: giudicabili.map(n => n.id), link: archi.length };
        esito.esitiRami.push(statoRamo);
        if (!giudicabili.length) { statoRamo.motivo = 'nessun nodo con descrizione e citazione'; continue; }
        const contesto = new Map(giudicabili.map(n => [n.id, n]));
        archi.forEach(l => [eid(l.source), eid(l.target)].forEach(id => contesto.set(id, perId.get(id))));
        const blocchi = Array.from(contesto.values()).map(n =>
            '### ' + n.id + ' — "' + (window.cleanLabel ? window.cleanLabel(n.label) : n.label) + '"\n' +
            'DESCRIZIONE: ' + n.desc + '\n' +
            'FRASI DELLA FONTE:\n' + evidenze[n.id].map(e =>
                '  RIFERIMENTO (non citare): ' + [e.title, e.source].filter(Boolean).join(' — ') + '\n' +
                '  TESTO CITABILE: ' + JSON.stringify(e.text)).join('\n')
        ).join('\n\n');
        const nessi = Array.from(new Map(archi.map(l => {
            const item = { source: eid(l.source), target: eid(l.target), rel: l.rel };
            return [JSON.stringify(item), item];
        })).values());
        const bloccoArchi = '\n\nNESSI DA CONTROLLARE (anche FRA RAMI DIVERSI):\n' +
            JSON.stringify(nessi) + '\nCopia esattamente ciascuna terna source/target/rel; aggiungi soltanto il verdetto e le prove.';
        const identitaNesso = (campo, description) => Object.assign({ type: 'STRING', description },
            nessi.length ? { enum: Array.from(new Set(nessi.map(l => l[campo]))) } : {});
        const citazione = { type: 'STRING', maxLength: 300,
            description: 'Copia solo il testo di un estratto continuo dal TESTO CITABILE del nodo indicato, senza riferimento, titolo, pagina, virgolette esterne o ellissi aggiunte.' };

        const tetto = Math.max(1, Math.min(4, Math.ceil(giudicabili.length / 3)));
        const schema = {
            type: 'OBJECT',
            properties: {
                nodi: {
                    type: 'ARRAY', maxItems: tetto,
                    items: {
                        type: 'OBJECT',
                        properties: {
                            id: { type: 'STRING', enum: giudicabili.map(n => n.id) },
                            tipo: { type: 'STRING', enum: J.TIPI },
                            problema: { type: 'STRING', maxLength: 220 },
                            prova: citazione,
                            brano_errato: { type: 'STRING', maxLength: 120 },
                            con: { type: 'STRING', maxLength: 160 }
                        },
                        required: ['id', 'tipo', 'problema', 'prova']
                    }
                },
                link: {
                    type: 'ARRAY', minItems: nessi.length, maxItems: nessi.length,
                    description: 'Un esito per ogni terna richiesta, compresi i nessi sostenuti; nessun duplicato. I difetti dei nodi appartengono esclusivamente a nodi.',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            source: identitaNesso('source', 'ID del nodo sorgente copiato dalla terna richiesta, non una frase della fonte.'),
                            target: identitaNesso('target', 'ID del nodo destinazione copiato dalla stessa terna richiesta.'),
                            rel: identitaNesso('rel', 'Verbo del collegamento copiato dalla stessa terna; non una categoria di difetto dei nodi.'),
                            valido: { type: 'BOOLEAN' }, problema: { type: 'STRING', maxLength: 180 },
                            prova_source: citazione, prova_target: citazione
                        },
                        required: ['source', 'target', 'rel', 'valido', 'prova_source', 'prova_target']
                    }
                }
            },
            required: ['nodi', 'link']
        };

        const prompt =
`Ogni nodo qui sotto ha una DESCRIZIONE scritta da un'AI e le FRASI DELLA FONTE da cui dovrebbe venire. Cerca i punti in cui la descrizione dice una cosa diversa da quella che la fonte dice.

${blocchi}${bloccoArchi}

CHE COSA CERCARE — sono errori di SENSO, non di parole. Le parole vengono quasi sempre dalla fonte: è il ruolo o il riferimento a essere girato.
· soggetto-invertito → chi fa l'azione è scambiato. Esempio reale: la fonte dice che la GERMANIA aveva bisogno di franchi svizzeri per comprare merci; la descrizione dice che era la Svizzera a ottenere valuta.
· data-attribuita-male → la data è giusta ma appiccicata alla cosa sbagliata. Esempio reale: «la commissione formata nel 2002», quando il 2002 è l'anno del suo rapporto.
· termine-sostituito → una parola tecnica rimpiazzata da una che significa un'altra cosa. Esempio reale: «militari internati» diventa «soldati prigionieri».
· fatto-contraddetto → le frasi qui sopra dicono un'altra cosa da quella che la descrizione afferma.
· nesso-non-nella-fonte → le frasi legano due cose diversamente da come le lega la descrizione.

⚠️ VEDI SOLO UNA PARTE DEL DOCUMENTO — le frasi di alcune pagine, non tutte. Perciò NON segnalare MAI che una cosa «non è nella fonte» o «non è menzionata»: da qui non lo puoi sapere, e il fatto quasi sempre sta in un'altra pagina. Segnala solo ciò che le frasi che hai davanti CONTRADDICONO.

CHE COSA NON È UN ERRORE, e non va segnalato: una semplificazione, una parola più facile, una frase più corta, un termine spiegato fra virgole, un dettaglio che qui non compare. Queste descrizioni sono scritte apposta per una quarta media. Se una descrizione non è contraddetta da queste frasi, non dire niente di quel nodo: si segnalano SOLO le eccezioni, e una lista vuota è una risposta giusta e frequente.

FORMATO: restituisci un oggetto con due elenchi distinti, "nodi" e "link". SOLO IN "nodi", "tipo" deve essere uno dei valori ammessi: ${J.TIPI.join(', ')}; "problema" è la spiegazione, non il tipo. Non usare "errore" come tipo. In "link" restituisci esattamente ${nessi.length} elementi, uno per ogni terna source/target/rel elencata, con valido booleano e le due prove. Le categorie di difetto dei nodi non sono valori di rel. Non mettere frasi in source/target e non aggiungere virgolette dentro gli identificativi. Non omettere i nessi sostenuti. Senza nessi restituisci link: [].

CITAZIONI: nei campi prova, prova_source e prova_target copia un estratto continuo del TESTO CITABILE dell'estremo pertinente. Escludi RIFERIMENTO, titolo del documento, pagina e le virgolette esterne usate per delimitare il testo. Non aggiungere (...) o altre parole e non unire frasi distanti. Non parafrasare e non correggere il testo della fonte.

PER OGNI SEGNALAZIONE:
· "prova": copia il pezzo di frase della fonte che dimostra l'errore, parola per parola, da una delle frasi qui sopra. Può usare le stesse parole della descrizione: confronta chi compie l’azione, su chi, quando e con quale grado di certezza. La somiglianza lessicale non prova né esclude un errore.
· "brano_errato" e "con": SOLO per soggetto-invertito, data-attribuita-male e termine-sostituito, e solo se bastano poche parole. "brano_errato" è la porzione ESATTA della descrizione da cambiare, copiata parola per parola; "con" è che cosa metterci. Non riscrivere la frase: cambia il pezzo sbagliato e basta. Se servono più di una decina di parole, lascia i due campi vuoti e segnala soltanto.

NESSI: per ciascuno dei nessi elencati, dimmi se la fonte lo sostiene. "valido": false solo se quelle frasi NON dicono quel legame. Non proporre verbi nuovi. Copia in "prova_source" e "prova_target" un estratto delle FRASI DELLA FONTE mostrate per ciascun estremo. I nodi esterni al ramo sono contesto per questi nessi: non segnalare correzioni ai nodi fuori dagli ID ammessi dallo schema.`;

        try {
            if (window.MappAIUsage) window.MappAIUsage.setContext('generation', 'giudice');
            const resp = await callModelAPI({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: buildSystemInstruction('Sei un revisore che confronta un testo con la sua fonte. Segnali solo le differenze di SENSO, mai di stile. Rispondi solo JSON conforme allo schema.') }] },
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: maxOutputTokens(2000),
                    responseMimeType: 'application/json',
                    responseSchema: schema
                }
            }, apiKey);
            const raw = resp?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const data = salvageTruncatedJSON(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
            if (!data || !Array.isArray(data.nodi) || (data.link !== undefined && !Array.isArray(data.link))) throw new Error('risposta del giudice priva degli elenchi previsti');
            esito.rami++;
            statoRamo.stato = 'completato';
            giudicabili.forEach(n => letti.add(n.id));
            const v = J.validaVerdetti((data && data.nodi) || [], { nodi: giudicabili, frammenti: frammenti, opts: { proposalOnly: !applica } });
            const vl = J.validaLink((data && data.link) || [], { links: archi, frammenti: frammenti });
            esito.copertura.linkEsaminati.push(...vl.esaminati);
            esito.copertura.linkSaltati.push(...vl.saltati);
            if (vl.saltati.length || v.scartati.length) {
                statoRamo.stato = 'parziale';
                statoRamo.motivo = 'risposta incompleta o verdetti non validi';
            }

            v.applicati.forEach(r => {
                r.ramo = ramo.label;
                r.evidenze = evidenze[r.id] || [];
                if (applica && !r.soloProposta) {
                    const n = nodi.find(x => x.id === r.id);
                    /* ⚠️ `aiDesc` NON si tocca: resta il testo PRE-giudice, che è
                       l'unico che l'editor sa già mostrare sotto la desc e da cui
                       «ripristina versione AI» fa tornare indietro. */
                    if (n && String(n.desc || '').replace(/\s+/g, ' ').trim() === r.prima) {
                        n.desc = r.dopo; n._giudicato = true; esito.applicate++;
                    } else { r.soloSegnalato = true; r.perche = 'descrizione cambiata dopo la richiesta al giudice'; }
                } else { r.soloSegnalato = true; }
                esito.correzioni.push(r);
            });
            v.segnalati.forEach(r => { r.ramo = ramo.label; r.evidenze = evidenze[r.id] || []; esito.segnalati.push(r); });
            v.scartati.forEach(r => esito.scartati.push(Object.assign({ ramo: ramo.label }, r)));
            vl.scartati.forEach(r => esito.scartati.push(Object.assign({ ramo: ramo.label, tipo: 'link' }, r)));

            vl.tolti.forEach(t => {
                t.ramo = ramo.label;
                t.evidenze = { source: evidenze[t.source] || [], target: evidenze[t.target] || [] };
                t.soloSegnalato = !applica;
                t.applicato = false;
                if (applica) {
                    (appState.db.links || []).forEach(l => {
                        if (eid(l.source) === t.source && eid(l.target) === t.target && l.rel === t.rel) {
                            l._relOriginale = l.rel;
                            l.rel = l.isCross ? 'correlato a' : 'include';
                            t.applicato = true;
                        }
                    });
                }
                esito.linkTolti.push(t);
            });
        } catch (e) { if (giro) giro.verifica();
            statoRamo.stato = 'errore';
            statoRamo.motivo = e.message;
            archi.forEach(l => esito.copertura.linkSaltati.push({ source: eid(l.source), target: eid(l.target), rel: l.rel,
                motivo: 'controllo del ramo non completato: ' + e.message }));
            console.warn('[Giudice] ramo «' + ramo.label + '» saltato:', e.message);
        }
    }

    esito.copertura.nodiEsaminati = Array.from(letti);
    esito.copertura.nodiSaltati = nodi.filter(n => !letti.has(n.id)).map(n => ({ id: n.id, label: n.label,
        motivo: !proprietario.has(n.id) ? 'nodo fuori dai rami esaminati' : (!frammenti[n.id] ? 'descrizione o citazione mancante' : 'ramo non completato') }));
    esito.stato = esito.esitiRami.every(r => r.stato === 'completato') && !esito.copertura.linkSaltati.length &&
        !esito.copertura.nodiSaltati.length ? 'completato' : 'parziale';
    console.info('[Giudice] ' + esito.rami + ' rami riletti · ' + esito.correzioni.length + ' proposte (' + esito.applicate + ' applicate)' +
        ' · ' + esito.segnalati.length + ' segnalazioni · ' + esito.linkTolti.length + ' nessi non sostenuti' +
        (esito.scartati.length ? ' · ' + esito.scartati.length + ' verdetti scartati' : ''));
    esito.correzioni.forEach(r => console.info('   [' + r.tipo + '] «' + r.label + '»: «' + r.brano + '» → «' + r.con + '»'));
    return esito;
};


// Fine comune dei due estrattori MM: le misure descrivono il testo finale,
// con al massimo due recuperi di fonte e un solo passaggio del giudice.
window.finalizeMindMapQuality = async function (textParts, apiKey, giro) {
    const report = { passaggi: [], arricchimento: { stato: 'in-corso' }, prima: null, dopoArricchimento: null, dopo: null };
    appState._coverageReport = report;
    appState._qualityReport = null;
    const misura = () => {
        try {
            if (window.applyAnchor) window.applyAnchor();
        } catch (e) { if (giro) giro.verifica(); report.erroreMisura = e.message; }
        return appState._qualityReport && appState._qualityReport.copertura
            ? JSON.parse(JSON.stringify(appState._qualityReport.copertura)) : null;
    };
    const recupera = async opts => {
        let r;
        try { r = await window.executeCoveragePass(apiKey, opts, giro); }
        catch (e) { if (giro) giro.verifica(); r = { fase: opts.phase, stato: 'errore', motivoSkip: e.message, aggiunti: 0 }; }
        if (r.aggiunti) {
            if (window.sanitizeMindMapTree) window.sanitizeMindMapTree();
            r.conservati = (r.idsAggiunti || []).filter(id => appState.db.nodes.some(n => n.id === id));
            r.dopo = misura();
        } else r.dopo = r.prima || null;
        report.passaggi.push(r);
        return r;
    };
    report.prima = misura();
    const iniziale = await recupera({ phase: 'iniziale' });
    const descPrima = new Map(appState.db.nodes.map(n => [n.id, n.desc]));
    try {
        await window.enrichThinDescs(textParts, apiKey, giro);
        report.arricchimento.stato = 'completato';
    } catch (e) { if (giro) giro.verifica(); report.arricchimento = { stato: 'errore', motivo: e.message }; }
    report.arricchimento.nodiCambiati = appState.db.nodes.filter(n => descPrima.get(n.id) !== n.desc).map(n => n.id);
    report.dopoArricchimento = misura();
    await recupera({ phase: 'dopo-arricchimento', previous: iniziale });
    /* Il reranker Infomaniak (se acceso) sceglie le citazioni qui: le descrizioni
       sono definitive, la copertura non è ancora fotografata e il giudice, che le
       legge, viene dopo. Un errore lascia le citazioni dell'àncora. */
    try { if (giro) giro.verifica(); if (window.applyRerankerCitations) await window.applyRerankerCitations(); }
    catch (e) { if (giro) giro.verifica(); console.warn('[Reranker] errore, restano le citazioni dell\'àncora:', e); }
    report.dopo = appState._qualityReport && appState._qualityReport.copertura
        ? JSON.parse(JSON.stringify(appState._qualityReport.copertura)) : null;
    if (appState._qualityReport) appState._qualityReport.recuperoCopertura = report;
    await window.executeJudgePass(apiKey, appState._reviewRequested ? { enabled: true, apply: false } : undefined, giro);
    return report;
};
