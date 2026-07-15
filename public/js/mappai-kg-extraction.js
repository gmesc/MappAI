// ==========================================
// KG EXTRACTION ENGINE — estratto da app.js
// ==========================================
// Strategie di generazione Knowledge Graph: single-pass, Community (GraphRAG),
// multi-pass. Caricato DOPO app.js: usa appState, fetchModelAPI, getMaxOutputTokens,
// salvageTruncatedJSON, buildSystemInstruction, KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION,
// markKgCrossLinks, resetVaultState (mappai-vault-manager.js), initD3Visualization,
// showGenerationReport e gli helper window.* via scope globale condiviso.
// Chiamato solo da startGeneration (routing) a runtime.
// Estrae il testo dalla risposta AI in modo sicuro.
// Gestisce: candidates mancanti, thinking mode (Gemini 2.5+ restituisce
// parts[0] con thought:true prima del testo reale), safety blocks.
function extractResponseText(response) {
    const candidate = response?.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
        const reason = response?.promptFeedback?.blockReason
            || candidate?.finishReason
            || 'candidates vuoti o assenti';
        throw new Error(`Risposta AI non valida (${reason}). Riprova o cambia modello.`);
    }
    // Gemini 2.5 thinking mode: la prima part può avere thought:true (reasoning interno).
    // Cerchiamo la prima part con testo non-reasoning.
    const textPart = candidate.content.parts.find(p => !p.thought && p.text != null)
        ?? candidate.content.parts[0];
    const text = textPart?.text;
    if (!text) throw new Error('Risposta AI: nessun testo nelle parts. Riprova o cambia modello.');
    return text;
}


// Su Infomaniak responseMimeType + responseSchema non sono supportati nativamente:
// il bridge li converte in un reminder testuale che annacqua le regole vere del
// prompt (es. il blocco RELAZIONI) → grafi a stella, relazioni generiche (Causa C, §8).
// Su Infomaniak ci affidiamo a salvageTruncatedJSON, come già per la MindMap.
// Su Infomaniak, Fase 1 KG DEVE mantenere responseSchema perché:
// - Senza schema, GEMMA genera JSON sporco (chiavi non quotate, commenti, escape doppio)
// - salvageTruncatedJSON recupera solo righe valide, scarta il resto → nodi persi
// - Fase 1 schema è semplice (id/label/level), non dilisce le istruzioni di contenuto
// - Fatto empirico (8/6/26): senza schema Fase 1→5 nodi (crash), con schema Fase 1→30+ concetti
//
// Fasi 2 e 3 rimangono schema-OFF perché è dove il vocabolario relazionale vive
// (Causa C risolta: generic relations 36%→0%, relTypes diversi).
function _kgGenerationConfig(base, schema, phase = null) {
    if (appState.aiProvider === 'infomaniak') {
        // Fase 1: reintroduce schema per JSON compatto/validato
        if (phase === 1) return { ...base, responseMimeType: "application/json", responseSchema: schema };
        // Fasi 2+: schema OFF (Causa C già vinta lì)
        return { ...base };
    }
    // Google: sempre con schema
    return { ...base, responseMimeType: "application/json", responseSchema: schema };
}

async function extractKnowledgeGraphSinglePass(textParts, fileParts, apiKey) {
    window.resetVaultState();
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'kg_single');
    let kgKeywords = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v).join(', ');

    let userProfileStr = '';
    if (appState.userProfile) {
        userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
    }

    if (appState.studentMode) {
        userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
    }

    const maxNodesVal = parseInt(document.getElementById('kg-nodes-slider').value) || 20;
    const minNodesVal = Math.max(10, maxNodesVal - 5);
    const maxNodesStr = `${minNodesVal}-${maxNodesVal}`;

    const promptKey = appState.studentMode ? "KNOWLEDGE_GRAPH_SINGLE_STUDENT" : "KNOWLEDGE_GRAPH_SINGLE";

    var promptText = window.fillPromptTemplate(promptKey, {
        rootNodeLabel: appState.rootNodeLabel,
        optionalKeywords: kgKeywords ? `Focalizza le relazioni su questi Super-Hub semantici (se pertinenti): ${kgKeywords}.\\n` : '',
        userProfileInjection: userProfileStr,
        focusTopic: appState.focusTopic ? '\n\nISTRUZIONI AGGIUNTIVE (leggere prima di generare il JSON):\n' + appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').replace(/⚡|📅|👤|📍|🔑|❓|🗂️|📊|🧮|⚗️|📐|🔄|💬/g, '').replace(/\[([A-Z\s]+)\]:/g, '$1:').replace(/:{2,}/g, ':').trim() + '\n' : '',
        textParts: textParts.join('\\n\\n'),
        maxNodes: maxNodesStr
    });

    const schema = {
        type: "OBJECT", properties: {
            nodes: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, label: { type: "STRING" }, content: { type: "STRING" }, desc: { type: "STRING" }, level: { type: "INTEGER" }, chunks: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "label", "content", "desc", "level", "chunks"] } },
            links: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, target: { type: "STRING" }, rel: { type: "STRING", enum: window.getKgRelEnum() } }, required: ["source", "target", "rel"] } }
        }, required: ["nodes", "links"]
    };

    const payload = {
        contents: [{ parts: [...fileParts, { text: promptText }] }],
        systemInstruction: { parts: [{ text: buildSystemInstruction(KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION) }] },
        generationConfig: _kgGenerationConfig({ temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(8192) }, schema, 1)
    };


    try {
        window.showLoadingOverlay(true, `${appState.aiProvider === 'google' ? 'Google Studio' : 'Infomaniak'}: Analisi e formattazione Knowledge Graph...`);
        const data = await window.fetchModelAPI(payload, apiKey);
        let rawText = extractResponseText(data);
        let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();

        let rawData = salvageTruncatedJSON(cleanText);

        // Normalizzazione e forzatura livelli
        const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
        const existingHubs = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v);

        if (rawData.nodes) {
            rawData.nodes.forEach(n => {
                n.studyStatus = 'none';

                // 1. Se è un Hub manuale dell'utente -> Forza L1 (sempre)
                // 2. Se l'IA ha proposto un Hub (L1) -> Permetti L1
                // 3. Altrimenti (L2, L3, L4...) -> Forza L2 per pulizia KG
                const isManualHub = existingHubs.some(h => normalizeLabel(h) === normalizeLabel(n.label));
                const aiWantsHub = (parseInt(n.level) === 1);

                if (isManualHub || aiWantsHub) {
                    n.level = 1;
                } else {
                    n.level = 2;
                }

                if (!n.desc) n.desc = n.content || "";
                n.aiDesc = n.desc;
            });

            // Post-processing di salvataggio: se l'IA è stata testarda e ha fatto < 3 Hub, promuoviamo noi i nodi più connessi
            let currentHubs = rawData.nodes.filter(n => n.level === 1);
            if (currentHubs.length < 3 && rawData.nodes.length > 5) {
                // Calcola il grado di connessione di ogni nodo
                const degreeMap = {};
                rawData.nodes.forEach(n => degreeMap[n.id] = 0);
                (rawData.links || []).forEach(l => {
                    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                    if (degreeMap[sourceId] !== undefined) degreeMap[sourceId]++;
                    if (degreeMap[targetId] !== undefined) degreeMap[targetId]++;
                });

                // Ordina i nodi L2 per grado di connessione decrescente
                const candidates = rawData.nodes
                    .filter(n => n.level === 2)
                    .sort((a, b) => degreeMap[b.id] - degreeMap[a.id]);

                // Promuovi i nodi migliori finché non abbiamo 3-4 Hub
                let neededHubs = Math.max(3, Math.min(5, Math.floor(rawData.nodes.length / 4))) - currentHubs.length;
                for (let i = 0; i < neededHubs && i < candidates.length; i++) {
                    candidates[i].level = 1;
                }
            }

            // Assegna group unico incrementale a ogni Hub L1
            let groupIdx = 1;
            rawData.nodes.filter(n => n.level === 1).forEach(hub => {
                hub.group = groupIdx++;
            });

            // Assegna group ai nodi L2 basandosi sulle connessioni (BFS verso Hub più vicino)
            const hubGroupMap = {};
            rawData.nodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });
            const rawLinks = rawData.links || [];

            rawData.nodes.filter(n => n.level === 2).forEach(node => {
                node.group = window._assignHubGroup(node.id, rawLinks, hubGroupMap);
            });
        }

        appState.db = rawData;
        const validNodeIds = new Set(appState.db.nodes.map(n => n.id));
        // Filtra link con nodi inesistenti, self-loop e duplicati bidirezionali
        const _spSeen = new Set();
        appState.db.links = (appState.db.links || []).filter(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (!validNodeIds.has(s) || !validNodeIds.has(t)) return false;
            if (s === t) return false;
            const key = [s, t].sort().join('||');
            if (_spSeen.has(key)) return false;
            _spSeen.add(key);
            return true;
        });
        window.markKgCrossLinks(appState.db.nodes, appState.db.links);

        // Arricchimento desc sottili ancorato alla fonte (gated, default OFF).
        // Mode-agnostico: agisce su appState.db.nodes (level >= 1 → tutti i nodi KG).
        try {
            await window.enrichThinDescs(textParts, apiKey);
        } catch (e) {
            console.warn('[enrichThinDescs] errore non bloccante (KG single-pass):', e.message);
        }

        // Freeze chunk verbatim (se attivo): azzera i chunk prima di costruire sourcesDict
        window.stripChunksIfFrozen(appState.db.nodes);
        appState.db.sourcesDict = {};
        appState.db.nodes.forEach(n => {
            if (n.chunks && n.chunks.length > 0) appState.db.sourcesDict[n.id] = n.chunks.map(c => ({ title: "Estratto Fonte", source: "Documento", text: c }));
        });

        window.showLoadingOverlay(false);
        window.switchToMapLayout();
        setTimeout(() => { initD3Visualization(); }, 200);
        setTimeout(() => { window.showGenerationReport(); }, 1500);
    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Graph", err.message);
    }
}

// ============================================================================
// MODALITÀ COMMUNITY KG — ispirata a MiniMAP (insegnai.ch/minimap)
// ----------------------------------------------------------------------------
// Lezioni portate da MiniMAP (vedi analisi 8/6/26):
//  1. SINGLE-PASS: una sola chiamata. Nodi e link nascono insieme → nessun
//     drift di ID tra fasi, nessuna cucitura che perde nodi.
//  2. MODELLO A COMUNITÀ (non albero): l'LLM fa lui la community detection
//     (3-6 macro-temi). Ogni concetto appartiene a una comunità ma NON è
//     "figlio" di un hub → niente god-node, comunità naturalmente bilanciate
//     (risolve lo squilibrio "26 L2 su un ramo, 0 sugli altri").
//  3. PROMPT MINIMALE: poche regole chiare → attenzione del modello non diluita.
//  4. LINK LATERALI concetto↔concetto come struttura primaria (il valore di
//     ragionamento), non la stella hub→concetto.
//
// Adattamento per MappAI: creiamo un nodo-hub sintetico per comunità (level 1,
// con summary come desc di studio) per ancorare il rendering hub-and-spoke e
// la modalità studio, MA preserviamo tutti i link laterali del modello come
// cross-link (isCross=true). Così uniamo struttura a comunità + ragionamento.
//
// Provider: single-pass usa _kgGenerationConfig(..., 1) → schema ON anche su
// Infomaniak (in single-pass un JSON malformato perde TUTTO: la pulizia del
// JSON ha priorità sul rischio di qualche relazione generica dal bridge).
// ============================================================================
async function extractKnowledgeGraphCommunity(textParts, fileParts, apiKey) {
    window.resetVaultState();
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'kg_community');

    const maxNodesVal = parseInt(document.getElementById('kg-nodes-slider').value) || 20;
    const minNodesVal = Math.max(10, maxNodesVal - 5);

    let userProfileStr = '';
    if (appState.userProfile) {
        userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO: Età ${appState.userProfile.age} anni, scuola ${appState.userProfile.grade} (${appState.userProfile.system}). ADATTA IL LINGUAGGIO a questa età: frasi brevi, parole semplici, esempi concreti. Evita linguaggio accademico.`;
    }
    if (appState.studentMode) {
        userProfileStr += `\n\n[MODALITÀ STUDENTE]: le 'label' dei nodi devono avere AL MASSIMO 3 parole chiave.`;
    }
    const focusStr = appState.focusTopic
        ? '\n\nISTRUZIONI AGGIUNTIVE (leggere prima di generare il JSON):\n' +
          appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').replace(/⚡|📅|👤|📍|🔑|❓|🗂️|📊|🧮|⚗️|📐|🔄|💬/g, '').replace(/\[([A-Z\s]+)\]:/g, '$1:').replace(/:{2,}/g, ':').trim() + '\n'
        : '';

    // --- Prompt minimale, ispirato al system_prompt di MiniMAP ---
    // Coppia IT/EN scelta dalla lingua mappe (percorso default su Google).
    const _communityLang = (typeof window.getPromptLanguage === 'function') ? window.getPromptLanguage() : 'it';
    const systemPrompt = (_communityLang === 'en') ? `You are an expert GraphRAG extractor. You analyze a text and produce an explorable Knowledge Graph. Audience: middle-school students, including students with special educational needs (SEN/dyslexia).

RULES:
1. 'communities': split the content into 3-6 coherent macro-themes. For each: id (integer), name (2-4 words), summary (2-3 sentences that explain the theme to a student).
2. 'nodes': extract from ${minNodesVal} to ${maxNodesVal} key concepts. For each:
   - id: short name of the concept (max 3 words), UNIQUE
   - community: the id of the community it belongs to
   - icon: one single representative emoji
   - desc: a clear 3-4 sentence explanation with concrete data from the text (names, dates, numbers, examples). Tuned to the student.
3. 'links': LOGICAL relations between concepts. Connect concepts from DIFFERENT communities whenever the text justifies it (that is where reasoning is born). For each: source (concept id), target (concept id), label.
   - The 'label' MUST be a MEANINGFUL verb/relation, for example: ${window.relVocab('flat')}.
   - It is FORBIDDEN to use "related to", "linked to", "associated with" or generic relations.
   - Distribute concepts EVENLY across communities: no community may remain empty.${userProfileStr}${window.mapLangNote()}` : `Sei un esperto estrattore GraphRAG. Analizzi un testo e produci un Knowledge Graph esplorabile. Pubblico: studenti di scuola media, anche con DSA/BES.

REGOLE:
1. 'communities': dividi il contenuto in 3-6 macro-temi coerenti. Per ciascuno: id (intero), name (2-4 parole), summary (2-3 frasi che spiegano il tema a uno studente).
2. 'nodes': estrai da ${minNodesVal} a ${maxNodesVal} concetti chiave. Per ciascuno:
   - id: nome breve del concetto (max 3 parole), UNIVOCO
   - community: l'id della comunità a cui appartiene
   - icon: una sola emoji rappresentativa
   - desc: spiegazione chiara di 3-4 frasi con dati concreti dal testo (nomi, date, numeri, esempi). Tarata sullo studente.
3. 'links': relazioni LOGICHE tra concetti. Collega concetti di comunità DIVERSE quando il testo lo giustifica (è qui che nasce il ragionamento). Per ciascuno: source (id concetto), target (id concetto), label.
   - La 'label' DEVE essere un verbo/relazione SIGNIFICATIVA, ad esempio: ${window.relVocab('flat')}.
   - VIETATO usare "correlato a", "collegato a", "associato a" o relazioni generiche.
   - Distribuisci i concetti in modo BILANCIATO tra le comunità: nessuna comunità deve restare vuota.${userProfileStr}${window.mapLangNote()}`;

    const schema = {
        type: "OBJECT",
        properties: {
            communities: {
                type: "ARRAY", items: {
                    type: "OBJECT", properties: {
                        id: { type: "INTEGER" }, name: { type: "STRING" }, summary: { type: "STRING" }
                    }, required: ["id", "name", "summary"]
                }
            },
            nodes: {
                type: "ARRAY", items: {
                    type: "OBJECT", properties: {
                        id: { type: "STRING" }, community: { type: "INTEGER" },
                        icon: { type: "STRING" }, desc: { type: "STRING" }
                    }, required: ["id", "community", "desc"]
                }
            },
            links: {
                type: "ARRAY", items: {
                    type: "OBJECT", properties: {
                        source: { type: "STRING" }, target: { type: "STRING" }, label: { type: "STRING" }
                    }, required: ["source", "target", "label"]
                }
            }
        },
        required: ["communities", "nodes", "links"]
    };

    const userText = `Titolo del progetto: ${appState.rootNodeLabel || '(senza titolo)'}\n${focusStr}\nTesto da analizzare:\n\n${textParts.join('\n\n')}`;

    const payload = {
        contents: [{ parts: [...fileParts, { text: userText }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        // phase=1 → schema ON anche su Infomaniak: in single-pass la pulizia JSON è prioritaria.
        generationConfig: _kgGenerationConfig({ temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(8192) }, schema, 1)
    };

    try {
        window.showLoadingOverlay(true, `${appState.aiProvider === 'google' ? 'Google Studio' : 'Infomaniak'}: Knowledge Graph a comunità (GraphRAG)...`, 'kg');
        const data = await window.fetchModelAPI(payload, apiKey);
        let rawText = extractResponseText(data);
        let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        const parsed = salvageTruncatedJSON(cleanText);

        const rawConcepts = Array.isArray(parsed.nodes) ? parsed.nodes : [];
        const rawComms = Array.isArray(parsed.communities) ? parsed.communities : [];
        const rawLinks = Array.isArray(parsed.links) ? parsed.links : [];
        if (rawConcepts.length === 0) throw new Error("Nessun concetto estratto dal testo.");

        // --- Costruzione comunità (con fallback se l'LLM le omette) ---
        const commById = {};
        rawComms.forEach((c, i) => {
            const cid = (c.id !== undefined && c.id !== null) ? parseInt(c.id) : (i + 1);
            commById[cid] = { id: cid, name: (c.name || `Tema ${cid}`).trim(), summary: (c.summary || '').trim() };
        });
        // Comunità mancanti citate dai nodi → creale al volo
        rawConcepts.forEach(n => {
            const cid = parseInt(n.community);
            if (!isNaN(cid) && !commById[cid]) commById[cid] = { id: cid, name: `Tema ${cid}`, summary: '' };
        });
        const commIds = Object.keys(commById).map(Number);
        // Se nessuna comunità valida, mettine una sola di default
        if (commIds.length === 0) { commById[1] = { id: 1, name: appState.rootNodeLabel || 'Concetti', summary: '' }; commIds.push(1); }

        // group sequenziale 1..N per i colori; mappa commId → group
        const commToGroup = {};
        let g = 1;
        commIds.forEach(cid => { commToGroup[cid] = g++; });

        const finalNodes = [];
        const finalLinks = [];

        // 1. Nodo-hub sintetico per ogni comunità (level 1)
        Object.values(commById).forEach(c => {
            finalNodes.push({
                id: `COMM_${c.id}`,
                label: c.name,
                desc: c.summary || c.name,
                content: c.summary || c.name,
                aiDesc: c.summary || '',
                level: 1,
                group: commToGroup[c.id],
                icon: '🗂️',
                isCommunityHub: true,
                studyStatus: 'none',
                chunks: []
            });
        });

        // 2. Nodi-concetto (level 2) + link di appartenenza verso il loro hub
        const conceptIds = new Set();
        rawConcepts.forEach(n => {
            const id = String(n.id || '').trim();
            if (!id || conceptIds.has(id)) return;
            conceptIds.add(id);
            let cid = parseInt(n.community);
            if (isNaN(cid) || !commById[cid]) cid = commIds[0];
            const desc = (n.desc || n.description || '').trim();
            finalNodes.push({
                id,
                label: id,
                desc,
                content: desc,
                aiDesc: desc,
                level: 2,
                group: commToGroup[cid],
                icon: (n.icon || '📌'),
                studyStatus: 'none',
                chunks: []
            });
            // link di appartenenza (gerarchico, leggero)
            finalLinks.push({ source: `COMM_${cid}`, target: id, rel: 'fa parte di' });
        });

        // 3. Link laterali concetto↔concetto (il ragionamento — diventano cross-link)
        const seen = new Set();
        rawLinks.forEach(l => {
            const s = String(typeof l.source === 'object' ? l.source.id : l.source || '').trim();
            const t = String(typeof l.target === 'object' ? l.target.id : l.target || '').trim();
            if (!conceptIds.has(s) || !conceptIds.has(t) || s === t) return;
            const key = [s, t].sort().join('||');
            if (seen.has(key)) return;
            seen.add(key);
            let rel = String(l.label || l.rel || '').trim();
            // scarta relazioni generiche (regola MiniMAP)
            if (!rel || /^(correlato a|collegato a|associato a|relazionato a|legato a)$/i.test(rel)) rel = 'è in relazione con';
            finalLinks.push({ source: s, target: t, rel });
        });

        appState.db = { nodes: finalNodes, links: finalLinks, sourcesDict: {}, customColors: {} };
        window.markKgCrossLinks(appState.db.nodes, appState.db.links);

        // Arricchimento desc sottili (gated) + freeze chunk (gated) — come gli altri path
        try { await window.enrichThinDescs(textParts, apiKey); }
        catch (e) { console.warn('[enrichThinDescs] errore non bloccante (KG community):', e.message); }
        window.stripChunksIfFrozen(appState.db.nodes);

        // Popola sourcesDict dalle desc (arricchite o originali).
        // Community KG non genera chunk verbatim: le desc ancorate alla fonte
        // sono il sostituto funzionale per vault Obsidian, modale "Fonti" e
        // metrica sourceCov. Gli hub sintetici (COMM_*) non hanno fonte propria.
        appState.db.nodes.forEach(n => {
            if (n.isCommunityHub) return;
            const text = (n.desc || n.content || '').trim();
            if (text) appState.db.sourcesDict[n.id] = [{ title: n.label, source: 'Fonte analizzata', text }];
        });

        window.showLoadingOverlay(false);
        window.switchToMapLayout();
        setTimeout(() => { initD3Visualization(); }, 200);
        setTimeout(() => { window.showGenerationReport(); }, 1500);
    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Graph (Community)", err.message);
    }
}

async function extractKnowledgeGraphMultiPass(textParts, fileParts, apiKey) {
    window.resetVaultState();
    if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'kg_multipass');
    let kgKeywords = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v).join(', ');

    let userProfileStr = '';
    if (appState.userProfile) {
        userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
    }

    if (appState.studentMode) {
        userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
    }

    const maxNodesVal = parseInt(document.getElementById('kg-nodes-slider').value) || 20;
    const minNodesVal = Math.max(10, maxNodesVal - 5);

    const focusInjection = appState.focusTopic
        ? '\n\nISTRUZIONI AGGIUNTIVE OBBLIGATORIE:\n' +
        appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').replace(/⚡|📅|👤|📍|🔑|❓|🗂️|📊|🧮|⚗️|📐|🔄|💬/g, '').replace(/\[([A-Z\s]+)\]:/g, '$1:').replace(/:{2,}/g, ':').trim() + '\n'
        : '';

    try {
        // ==========================================
        // FASE 1: ESTRAZIONE CONCETTI (SCHELETRO)
        // ==========================================
        window.showLoadingOverlay(true, "Fase 1/3 (HD): Estrazione dei Concetti e dei Super-Hub...");

        const p1PromptText = `SEI UN MOTORE DI ESTRAZIONE CONCETTUALE DI ALTO LIVELLO (Fase 1 di 3 - Scheletro del KG).
Hai il compito di leggere il seguente testo ed estrarre esattamente tra i ${minNodesVal} e ${maxNodesVal} concetti o entità fondamentali per descrivere il tema "${appState.rootNodeLabel}".

ISTRUZIONI:
1. Per ogni concetto, estrai:
   - "id": un ID unico e parlante in lettere maiuscole (es. FOTOSINTESI, CELLULOSA, TEORIA_COESIONE).
   - "label": un titolo sintetico e chiaro (massimo 3 parole).
   - "level": assegna valore 1 per i 3-5 concetti macro-aree principali (Super-Hub), e 2 per tutti gli altri concetti specifici di dettaglio.
2. Rispetta la lingua italiana.
3. Se l'utente ha indicato delle parole chiave di interesse (se pertinenti): [${kgKeywords}], includile assolutamente come Super-Hub (level 1) o concetti principali.

Restituisci SOLO un oggetto JSON con chiave "nodes". Nessun commento, nessun blocco markdown.
Formato richiesto:
{
  "nodes": [
    { "id": "ID_CONCETTO", "label": "Nome Concetto", "level": 1 o 2 }
  ]
}
${focusInjection}
FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

        const p1Schema = {
            type: "OBJECT",
            properties: {
                nodes: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            label: { type: "STRING" },
                            level: { type: "INTEGER" }
                        },
                        required: ["id", "label", "level"]
                    }
                }
            },
            required: ["nodes"]
        };

        const p1Payload = {
            contents: [{ parts: [...fileParts, { text: p1PromptText }] }],
            systemInstruction: { parts: [{ text: "Sei un analizzatore di testi accademico. Rispondi solo in JSON puro conforme allo schema richiesto." }] },
            generationConfig: _kgGenerationConfig({ temperature: 0.15, maxOutputTokens: window.getMaxOutputTokens(2000) }, p1Schema, 1)
        };

        const p1Response = await window.fetchModelAPI(p1Payload, apiKey);
        let p1Raw = extractResponseText(p1Response);
        let p1Clean = p1Raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        let p1Data = salvageTruncatedJSON(p1Clean);

        if (!p1Data.nodes || p1Data.nodes.length === 0) {
            throw new Error("Impossibile estrarre lo scheletro dei nodi concettuali.");
        }

        const extractedNodes = p1Data.nodes;

        // ==========================================
        // FASE 2: ESTRAZIONE RELAZIONI (TOPOGRAFIA)
        // ==========================================
        window.showLoadingOverlay(true, "Fase 2/3 (HD): Mappatura e Connessione Relazionale...");

        const conceptsListStr = extractedNodes.map(n => `- ID: "${n.id}" (Label: "${n.label}", Livello: ${n.level})`).join('\n');

        const p2PromptText = `SEI UN MOTORE DI ANALISI DI COLLEGAMENTI RETICOLARI (Fase 2 di 3 - Topografia del KG).
Ti fornisco una lista di concetti già estratti da un testo per il tema "${appState.rootNodeLabel}".
Il tuo unico compito è leggere il testo originario e tracciare tutte le relazioni logico-causali, temporali o strutturali significative che legano questi concetti tra di loro.

CONCETTI DISPONIBILI (Usa ESCLUSIVAMENTE questi ID esatti):
${conceptsListStr}

ISTRUZIONI:
1. Crea relazioni ('links') collegando gli ID forniti. Usa ESCLUSIVAMENTE gli ID esatti presenti nella lista soprastante. NON inventare nuovi ID.
2. Ciascun collegamento deve definire:
   - "source": l'ID di origine esatto.
   - "target": l'ID di destinazione esatto.
   - "rel": una brevissima parola o locuzione di collegamento in italiano. Scegli il verbo/locuzione PIÙ PRECISO tra (esempi, non esaustivi): ${window.relVocab('flat')}. Massimo 3 parole.
3. MULTI-LINK OBBLIGATORIO: ogni concetto di livello 2 deve avere ALMENO 2 collegamenti, di cui ALMENO UNO verso il Super-Hub (livello 1) tematicamente CORRETTO. Esempio: un personaggio sovietico va collegato al Super-Hub "Unione Sovietica", non a quello sbagliato. Avere più link riduce gli errori di classificazione. Nessun nodo deve restare isolato/orfano.
4. ACCURATEZZA: verifica che ogni collegamento a un Super-Hub sia semanticamente corretto. Un nodo va collegato all'hub a cui APPARTIENE realmente secondo il testo, non a un hub a caso.

Restituisci SOLO un oggetto JSON con chiave "links". Nessun commento, nessun blocco markdown.${window.mapLangNote()}
Formato richiesto:
{
  "links": [
    { "source": "ID_A", "target": "ID_B", "rel": "relazione" }
  ]
}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

        const p2Schema = {
            type: "OBJECT",
            properties: {
                links: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            source: { type: "STRING" },
                            target: { type: "STRING" },
                            rel: { type: "STRING", enum: window.getKgRelEnum() }
                        },
                        required: ["source", "target", "rel"]
                    }
                }
            },
            required: ["links"]
        };

        const p2Payload = {
            contents: [{ parts: [...fileParts, { text: p2PromptText }] }],
            systemInstruction: { parts: [{ text: "Sei un cartografo di concetti. Rispondi solo in JSON puro conforme allo schema richiesto." }] },
            // 4096 invece di 3000: la Fase 2 deve generare ≥2 link per nodo.
            // Su 35 nodi × 2 link × ~15 token/link ≈ 1050 token minimi, ma
            // GEMMA su Infomaniak è verboso nel JSON → serve margine abbondante.
            generationConfig: _kgGenerationConfig({ temperature: 0.15, maxOutputTokens: window.getMaxOutputTokens(4096) }, p2Schema, 2)
        };

        const p2Response = await window.fetchModelAPI(p2Payload, apiKey);
        let p2Raw = extractResponseText(p2Response);
        let p2Clean = p2Raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        let p2Data = salvageTruncatedJSON(p2Clean);

        // Sanitizza rel: rimuove artefatti Unicode (es. "। " Devanagari da GEMMA),
        // spazi multipli e caratteri non-latin all'inizio. Lascia intatto il resto.
        // Deduplica: GEMMA a volte genera A→B e B→A per lo stesso concetto, oppure
        // duplicati esatti. D3 li disegna sulla stessa linea → le label si sovrappongono
        // producendo testo illeggibile (es. "déllipartàeodil"). Teniamo il primo link
        // per ogni coppia non-ordinata (source, target), indipendentemente dalla direzione.
        const _seenPairs = new Set();
        const extractedLinks = (p2Data.links || [])
            .map(l => ({
                ...l,
                rel: (l.rel || 'fa parte di')
                    .replace(/^[ऀ-ॿ \t\r\n।॥]+/, '') // strip Devanagari prefix
                    .replace(/\s+/g, ' ')
                    .trim() || 'fa parte di'
            }))
            .filter(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                if (!s || !t || s === t) return false; // scarta self-loop
                const key = [s, t].sort().join('||');
                if (_seenPairs.has(key)) return false; // scarta duplicato
                _seenPairs.add(key);
                return true;
            });

        // ==========================================
        // FASE 3: ARRICCHIMENTO DETTAGLI IN BATCH
        // ==========================================
        const batchSize = 7;
        const totalNodes = extractedNodes.length;
        const totalBatches = Math.ceil(totalNodes / batchSize);
        const enrichedNodesMap = {};

        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
            const start = batchIdx * batchSize;
            const end = Math.min(start + batchSize, totalNodes);
            const batchNodes = extractedNodes.slice(start, end);
            const batchNodesStr = batchNodes.map(n => `- ID: "${n.id}" (Label: "${n.label}")`).join('\n');

            window.showLoadingOverlay(true, `Fase 3/3 (HD): Arricchimento dettagli (Batch ${batchIdx + 1}/${totalBatches})...`);

            const p3PromptText = `SEI UN ARRICCHITORE CONCETTUALE DIDATTICO (Fase 3 di 3 - Dettagli e Citazioni).
Stiamo realizzando un Knowledge Graph per uno studente.
Il tuo compito è arricchire i seguenti concetti specifici leggendo le fonti originali.

CONCETTI DA COMPLETARE IN QUESTO BATCH:
${batchNodesStr}
${userProfileStr}

ISTRUZIONI PER OGNI CONCETTO:
1. Genera "content": una sintesi concettuale brevissima (massimo 10 parole).
2. Genera "desc": una descrizione scientifica o storica approfondita ma chiarissima (da 50 a 80 parole, con dati concreti dal testo: nomi, date, numeri, esempi specifici) tarata sul profilo dello studente indicato.
3. Genera "chunks": un array contenente da 1 a 2 citazioni testuali REALI, INTEGRALI e VERBATIM (frasi intere di almeno 10-15 parole) copiate fedelmente e integralmente dal testo originale delle fonti che giustificano e supportano il concetto trattato. NON inventare o riassumere le citazioni!

Restituisci SOLO un oggetto JSON con chiave "enrichedNodes". Nessun commento, nessun blocco markdown.
Formato richiesto:
{
  "enrichedNodes": [
    {
      "id": "ID_CONCETTO",
      "content": "Sintesi didattica",
      "desc": "Spiegazione dettagliata ed estesa...",
      "chunks": ["Citazione verbatim 1 dal testo", "Citazione verbatim 2 dal testo"]
    }
  ]
}
${focusInjection}
FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

            const p3Schema = {
                type: "OBJECT",
                properties: {
                    enrichedNodes: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                id: { type: "STRING" },
                                content: { type: "STRING" },
                                desc: { type: "STRING" },
                                chunks: { type: "ARRAY", items: { type: "STRING" } }
                            },
                            required: ["id", "content", "desc", "chunks"]
                        }
                    }
                },
                required: ["enrichedNodes"]
            };

            const p3Payload = {
                contents: [{ parts: [...fileParts, { text: p3PromptText }] }],
                systemInstruction: { parts: [{ text: "Sei un redattore accademico e divulgatore didattico. Rispondi solo in JSON puro conforme allo schema richiesto." }] },
                generationConfig: _kgGenerationConfig({ temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(5000) }, p3Schema, 3)
            };

            try {
                const p3Response = await window.fetchModelAPI(p3Payload, apiKey);
                let p3Raw = extractResponseText(p3Response);
                let p3Clean = p3Raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let p3Data = salvageTruncatedJSON(p3Clean);

                if (p3Data.enrichedNodes) {
                    p3Data.enrichedNodes.forEach(node => {
                        enrichedNodesMap[node.id] = node;
                    });
                }
            } catch (batchErr) {
                console.error(`Errore nel batch ${batchIdx + 1}:`, batchErr);
                // Auto-healing fallback per questo batch
                batchNodes.forEach(node => {
                    enrichedNodesMap[node.id] = {
                        id: node.id,
                        content: node.label,
                        desc: `Approfondimento su ${node.label} estratto dalle fonti biologiche/storiche di studio.`,
                        chunks: ["Citazione estratta in corso di elaborazione."]
                    };
                });
            }
        }

        // ==========================================
        // ASSEMBLAGGIO FINALE E PULIZIA
        // ==========================================
        const finalNodes = extractedNodes.map(node => {
            const enriched = enrichedNodesMap[node.id] || {};
            return {
                id: node.id,
                label: node.label,
                level: node.level,
                content: enriched.content || node.label,
                desc: enriched.desc || `Dettaglio concettuale per ${node.label}.`,
                chunks: enriched.chunks || [],
                aiDesc: enriched.desc || `Dettaglio concettuale per ${node.label}.`,
                studyStatus: 'none'
            };
        });

        // Freeze chunk verbatim (se attivo): azzera i chunk prima del consumo
        window.stripChunksIfFrozen(finalNodes);

        // Normalizzazione e forzatura livelli
        const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
        const existingHubs = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v);

        finalNodes.forEach(n => {
            const isManualHub = existingHubs.some(h => normalizeLabel(h) === normalizeLabel(n.label));
            const aiWantsHub = (parseInt(n.level) === 1);
            if (isManualHub || aiWantsHub) {
                n.level = 1;
            } else {
                n.level = 2;
            }
        });

        // Post-processing di salvataggio: se abbiamo < 3 Hub, ne promuoviamo
        let currentHubs = finalNodes.filter(n => n.level === 1);
        if (currentHubs.length < 3 && finalNodes.length > 5) {
            const degreeMap = {};
            finalNodes.forEach(n => degreeMap[n.id] = 0);
            extractedLinks.forEach(l => {
                const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                if (degreeMap[sourceId] !== undefined) degreeMap[sourceId]++;
                if (degreeMap[targetId] !== undefined) degreeMap[targetId]++;
            });

            const candidates = finalNodes
                .filter(n => n.level === 2)
                .sort((a, b) => degreeMap[b.id] - degreeMap[a.id]);

            let neededHubs = Math.max(3, Math.min(5, Math.floor(finalNodes.length / 4))) - currentHubs.length;
            for (let i = 0; i < neededHubs && i < candidates.length; i++) {
                candidates[i].level = 1;
            }
        }

        // Assegna group unico incrementale a ogni Hub L1
        let groupIdx = 1;
        finalNodes.filter(n => n.level === 1).forEach(hub => {
            hub.group = groupIdx++;
        });

        // Assegna group ai nodi L2 basandosi sulle connessioni (BFS verso Hub più vicino)
        const hubGroupMap = {};
        finalNodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });
        const rawLinks = extractedLinks;

        finalNodes.filter(n => n.level === 2).forEach(node => {
            node.group = window._assignHubGroup(node.id, rawLinks, hubGroupMap);
        });

        // Auto-healing: garantisci che nessun nodo L2 sia orfano di link.
        // Usa _assignHubGroup (voto BFS 2-hop) per trovare l'hub più probabile
        // invece di uno casuale, e "fa parte di" come rel (più onesto di
        // "correlato a" — stiamo esplicitamente collegando al hub tematico).
        const validNodeIds = new Set(finalNodes.map(n => n.id));
        let finalLinks = rawLinks.filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        const linkedNodes = new Set();
        finalLinks.forEach(l => { linkedNodes.add(l.source); linkedNodes.add(l.target); });

        const hubs = finalNodes.filter(n => n.level === 1);
        if (hubs.length > 0) {
            // Ricostruisci hubGroupMap aggiornato con i link validi
            const healHubMap = {};
            finalNodes.filter(n => n.level === 1).forEach(h => { healHubMap[h.id] = h.id; });
            finalNodes.forEach(node => {
                if (node.level === 2 && !linkedNodes.has(node.id)) {
                    // Scegli l'hub tematicamente più vicino tramite BFS (2-hop)
                    const bestGroupId = window._assignHubGroup(node.id, finalLinks, healHubMap);
                    const bestHub = finalNodes.find(h => h.level === 1 && h.id === bestGroupId)
                        || hubs[0];
                    finalLinks.push({
                        source: bestHub.id,
                        target: node.id,
                        rel: "fa parte di"
                    });
                    linkedNodes.add(node.id);
                }
            });
        }

        window.markKgCrossLinks(finalNodes, finalLinks);

        appState.db = {
            nodes: finalNodes,
            links: finalLinks,
            sourcesDict: {},
            customColors: {}
        };

        // Arricchimento desc sottili ancorato alla fonte (gated, default OFF).
        // Va dopo l'assemblaggio finale: agisce sul set di nodi consolidato.
        try {
            await window.enrichThinDescs(textParts, apiKey);
        } catch (e) {
            console.warn('[enrichThinDescs] errore non bloccante (KG multi-pass):', e.message);
        }

        appState.db.nodes.forEach(n => {
            if (n.chunks && n.chunks.length > 0) appState.db.sourcesDict[n.id] = n.chunks.map(c => ({ title: "Estratto Fonte", source: "Documento", text: c }));
        });

        window.showLoadingOverlay(false);
        window.switchToMapLayout();
        setTimeout(() => { initD3Visualization(); }, 200);
        setTimeout(() => { window.showGenerationReport(); }, 1500);

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Graph HD", err.message);
    }
}
