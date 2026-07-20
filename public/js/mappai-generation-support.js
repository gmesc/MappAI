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
        const hierarchical = adjacentLevels && sameGroup;
        l.isCross = !hierarchical;
    });
    return links;
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
    const sectionRegex = /(?:^|\n)\s*(?:===+|##+|\[)\s*(NODES?|LINKS?|EDGES?|RELATIONS?|MERGES?|CROSS[-_ ]?LINKS?)\s*(?:===+|##+|\])\s*(?:\n|$)/gi;
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
1. Genera tutti i sotto-nodi gerarchici spingendoti fino al Livello ${maxMapLevel} (L2, L3, L4, L5), fino al livello di dettaglio realmente coperto dalle fonti.
2. Ciascun sotto-nodo generato deve definire:
   - "id": un ID unico in lettere maiuscole coerente con la gerarchia del ramo (es. ${branch.id}_L2_A, ${branch.id}_L3_A1, ${branch.id}_L4_A1a, ${branch.id}_L5_1).
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
// quando la fonte era esaurita. Stessa regola replicata nei template
// MIND_MAP_FULL_TREE / MIND_MAP_BRANCH di prompts_config.json.
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
window.isJSONLEnabled = function () {
    try {
        return localStorage.getItem('mappai_jsonl_enabled') === '1'
            && appState?.aiProvider === 'infomaniak';
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
    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) throw new Error('API key mancante');

    if (appState.aiProvider === 'google') {
        if (!window.electronAPI?.generateEmbeddingsGoogle) {
            throw new Error('generateEmbeddingsGoogle IPC non disponibile (restart app richiesto?)');
        }
        const result = await window.electronAPI.generateEmbeddingsGoogle({
            apiKey,
            model: model || 'gemini-embedding-001',
            texts
        });
        return result?.embeddings || [];
    }

    if (!window.electronAPI?.generateEmbeddingsInfomaniak) {
        throw new Error('generateEmbeddingsInfomaniak IPC non disponibile (restart app richiesto?)');
    }
    const productId = appState.infomaniakProductId
        || document.getElementById('infomaniak-product-id')?.value
        || localStorage.getItem('infomaniak_product_id');
    if (!productId) throw new Error('Infomaniak product ID mancante');
    const result = await window.electronAPI.generateEmbeddingsInfomaniak({
        apiKey, productId,
        model: model || 'bge_multilingual_gemma2',
        texts
    });
    return result?.embeddings || [];
};

// cosineSimilarity estratto in mappai-math.js (caricato PRIMA di app.js).
window.cosineSimilarity = window.MappAIMath.cosineSimilarity;

window.executeSemanticDedup = async function (options = {}) {
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
        embs = await window.fetchEmbeddings(texts);
    } catch (e) {
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
window.executePhase5Reclassification = async function () {
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'mm_phase5');
    const report = { applied: 0, skipped: 0, errors: [], parser: null };

    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) {
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
        generationConfig: { temperature: 0.15, maxOutputTokens: window.getMaxOutputTokens(1500) }
    };

    let response;
    try {
        response = await window.fetchModelAPI(payload, apiKey);
    } catch (e) {
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
            } catch (e) { /* riga rotta, skip */ }
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
        } catch (e) {
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
window.enrichL1Descs = async function (l1NodesData, rootNodeLabel, apiKey) {
    if (!window.isBranchBoundariesEnabled || !window.isBranchBoundariesEnabled()) return;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'enrich');
    const needsEnrich = l1NodesData.some(
        n => !n.confini || n.desc.startsWith('Categoria principale:')
    );
    if (!needsEnrich || !apiKey) return;

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
            maxOutputTokens: window.getMaxOutputTokens ? window.getMaxOutputTokens(2048) : 2048
        }
    });

    try {
        const data = await window.fetchModelAPI(payload, apiKey);
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
    } catch (e) {
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

window.enrichThinDescs = async function (textParts, apiKey) {
    if (!window.isEnrichDescsEnabled || !window.isEnrichDescsEnabled()) return;
    if (!apiKey) return;
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
                maxOutputTokens: window.getMaxOutputTokens ? window.getMaxOutputTokens(2048) : 2048
            }
        });

        try {
            const data = await window.fetchModelAPI(payload, apiKey);
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
        } catch (e) {
            console.warn(`[enrichThinDescs] batch ${Math.floor(i / BATCH) + 1} fallito:`, e.message);
        }
    }

    window.showLoadingOverlay(false);
    console.log(`%c[enrichThinDescs] ${applied}/${thin.length} desc riscritte (soglia ${THRESHOLD} parole o groundedness < ${FIDELITY_MIN}, ancorate alla fonte)`,
        'color:#10b981;font-weight:bold');
};

window.validateL1Categories = async function (l1Data, rootLabel) {
    if (!Array.isArray(l1Data) || l1Data.length < 3) return l1Data;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'l1_validation');
    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) return l1Data;

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
            generationConfig: { temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(1500) }
        };
        const response = await window.fetchModelAPI(payload, apiKey);
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanText = text.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        let refined;
        try {
            refined = salvageTruncatedJSON(cleanText);
        } catch (parseErr) {
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
    } catch (e) {
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
window.splitCompoundL1s = async function (l1Data, rootLabel) {
    if (!Array.isArray(l1Data) || l1Data.length === 0) return l1Data;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'l1_split');
    const MAX_L1 = 7;
    const compounds = l1Data.filter(c => c && window._isCompoundLabel(c.label));
    if (compounds.length === 0) {
        console.log('%c[Phase 1.6] Nessuna macro-area composta da spezzare', 'color:#6366f1');
        return l1Data;
    }
    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) return l1Data;

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
                generationConfig: { temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(3000) }
            };
            const response = await window.fetchModelAPI(payload, apiKey);
            const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = text.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
            let parts;
            try { parts = salvageTruncatedJSON(cleanText); } catch (e) { parts = null; }
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
        } catch (e) {
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
window.executePhase4Consolidation = async function () {
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'mm_phase4');
    const report = { merges: { applied: 0, skipped: 0, errors: [] },
                     crosslinks: { applied: 0, skipped: 0, errors: [] },
                     parser: null };

    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) {
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
        generationConfig: { temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(6500) }
    };

    let response;
    try {
        response = await window.fetchModelAPI(payload, apiKey);
    } catch (e) {
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
        } catch (e) {
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
// FASE 3.7 — DEEPENING SELETTIVO (P2 iterative-deepening + P3 depth-aware retry)
// ============================================================================
// Problema: lo slider "Profondità" entrava nella pipeline solo come frase nel
// prompt di Fase 3 → il modello, spinto anche dalla regola ⚓ di fedeltà
// ("meglio un ramo corto che nodi inventati"), collassa in larghezza (L2-L3).
// Soluzione: dopo il tree-sanitizer si misura la profondità TOPOLOGICA reale
// di ogni ramo L1 (BFS dalla radice, soli link gerarchici). Se un ramo è sotto
// lo slider, si "scava" nelle sue foglie dense usando SOLO il materiale locale
// del nodo (desc + fonti) come contesto: profondità dove la fonte la sostiene,
// zero conflitto con la regola di fedeltà. Default ON, disattivabile con
// localStorage.setItem('mappai_deepening_enabled','false').

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

window.executeDeepeningPass = async function (textParts, apiKey, maxMapLevel) {
    if (!window.isDeepeningEnabled()) return;
    if (!apiKey || appState.extractionMode === 'kg') return;
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'deepen');
    const target = parseInt(maxMapLevel);
    if (isNaN(target) || target < 3) return;

    const MIN_MATERIAL_WORDS = 45;  // materiale minimo perché una foglia sia "scavabile"
    const MAX_CANDIDATES = 4;       // foglie per ramo per chiamata (controllo costi)

    const eid = v => (v && typeof v === 'object') ? v.id : v;
    const wordCount = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
    const nodeMaterial = (n) => {
        const chunks = (appState.db.sourcesDict[n.id] || [])
            .map(c => c.text || c).filter(Boolean).join('\n');
        return ((n.desc || n.content || '') + '\n' + chunks).trim();
    };

    const { depthByBranch, labelByBranch } = window.computeBranchDepths();
    const shallow = Object.keys(depthByBranch).filter(id => depthByBranch[id] < target);
    if (!shallow.length) { console.info('[Deepening] tutti i rami raggiungono già L' + target); return; }

    const links = appState.db.links || [];
    const hasChildren = new Set(links.filter(l => !l.isCross && !l.isBridge).map(l => eid(l.source)));
    // Appartenenza al ramo: BFS discendente da ogni L1 sotto-profondo
    const childrenOf = {};
    links.forEach(l => {
        if (l.isCross || l.isBridge) return;
        (childrenOf[eid(l.source)] = childrenOf[eid(l.source)] || []).push(eid(l.target));
    });
    const idToNode = new Map(appState.db.nodes.map(n => [n.id, n]));
    const existingLabels = new Set(appState.db.nodes.map(n => (n.label || '').toLowerCase().trim()));

    let totalAdded = 0;
    for (const l1Id of shallow) {
        // raccogli discendenti del ramo
        const branchIds = new Set([l1Id]);
        let frontier = [l1Id];
        while (frontier.length) {
            const next = [];
            frontier.forEach(id => (childrenOf[id] || []).forEach(c => { if (!branchIds.has(c)) { branchIds.add(c); next.push(c); } }));
            frontier = next;
        }
        // foglie dense fra L2 e target-1, ordinate per ricchezza di materiale
        const candidates = [...branchIds]
            .map(id => idToNode.get(id))
            .filter(n => n && n.level >= 2 && n.level < target && !hasChildren.has(n.id))
            .map(n => ({ n, material: nodeMaterial(n) }))
            .filter(x => wordCount(x.material) >= MIN_MATERIAL_WORDS)
            .sort((a, b) => b.material.length - a.material.length)
            .slice(0, MAX_CANDIDATES);
        if (!candidates.length) {
            console.info(`[Deepening] ramo "${labelByBranch[l1Id]}": depth ${depthByBranch[l1Id]}<${target} ma nessuna foglia con materiale sufficiente — onestà verso la fonte, skip`);
            continue;
        }

        window.showLoadingOverlay(true, `Mappa HD - Fase 3.7: approfondimento ramo "${labelByBranch[l1Id]}"...`);
        const blocks = candidates.map((c, i) =>
            `### NODO ${i + 1} — id: ${c.n.id} — "${c.n.label}" (level ${c.n.level})\nMATERIALE DISPONIBILE:\n${c.material.slice(0, 2200)}`
        ).join('\n\n');

        const prompt = `Stai APPROFONDENDO alcune foglie di una mappa mentale su "${appState.rootNodeLabel}".
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
            const response = await window.fetchModelAPI({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: buildSystemInstruction('Sei un estrattore di sotto-concetti fedele alla fonte. Rispondi solo JSON conforme.') }] },
                generationConfig: { temperature: 0.25, maxOutputTokens: window.getMaxOutputTokens(3000), responseMimeType: 'application/json' }
            }, apiKey);
            const raw = response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
            const data = salvageTruncatedJSON(raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
            const expansions = (data && data.expansions) || [];

            let branchAdded = 0, seq = 0;
            const addChildren = (parentNode, kids, depthLeft) => {
                if (!Array.isArray(kids) || depthLeft <= 0) return;
                kids.slice(0, 3).forEach(kid => {
                    const label = String(kid.label || '').trim();
                    if (!label || existingLabels.has(label.toLowerCase())) return;
                    const newId = `${parentNode.id}_D${++seq}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                    const newNode = {
                        id: newId, label, level: parentNode.level + 1,
                        group: parentNode.group, desc: String(kid.desc || '').trim(),
                        content: '', studyStatus: 'none'
                    };
                    appState.db.nodes.push(newNode);
                    appState.db.links.push({ source: parentNode.id, target: newId, rel: 'approfondisce' });
                    appState.db.sourcesDict[newId] = [{ title: parentNode.label, source: 'Approfondimento', text: newNode.desc }];
                    existingLabels.add(label.toLowerCase());
                    branchAdded++;
                    addChildren(newNode, kid.children, depthLeft - 1);
                });
            };
            expansions.forEach(exp => {
                const parentNode = idToNode.get(exp.parent) ||
                    candidates.map(c => c.n).find(n => n.id.toUpperCase() === String(exp.parent || '').toUpperCase());
                if (!parentNode) return;
                addChildren(parentNode, exp.children, target - parentNode.level);
            });
            totalAdded += branchAdded;
            const after = window.computeBranchDepths().depthByBranch[l1Id];
            console.info(`[Deepening] ramo "${labelByBranch[l1Id]}": depth ${depthByBranch[l1Id]}→${after}, +${branchAdded} nodi`);
        } catch (e) {
            console.warn(`[Deepening] ramo "${labelByBranch[l1Id]}" fallito (non bloccante):`, e.message);
        }
    }
    if (totalAdded > 0) console.info(`[Deepening] Fase 3.7 completata: +${totalAdded} nodi di approfondimento`);
};
