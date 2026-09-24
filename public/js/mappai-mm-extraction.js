// ==========================================
// MINDMAP EXTRACTION ENGINE — estratto da app.js
// ==========================================
// Pipeline di generazione MindMap: iterativa (single-pass full tree) e multi-pass
// (Fase 1 L1 -> 1.5 validate -> 1.6 split -> 3 branch -> 4 merge -> 5 reclassify).
// Caricato DOPO app.js: tutti gli helper restano in app.js e si risolvono a runtime
// via scope globale condiviso — buildSystemInstruction, MIND_MAP_SYSTEM_INSTRUCTION,
// salvageTruncatedJSON, parseJSONLResponse, buildBranchPromptJSONL, isJSONL/Phase*
// /L1*Enabled, executePhase4Consolidation, executePhase5Reclassification,
// enrichL1Descs, enrichThinDescs, validateL1Categories, splitCompoundL1s,
// executeSemanticDedup, markMmCrossLinks, dedupeNodesAsCrossLinks,
// resetVaultState (mappai-vault-manager.js), initD3Visualization,
// showGenerationReport, fetchModelAPI, getMaxOutputTokens, fillPromptTemplate, ...
// Chiamato solo da startGeneration (routing) a runtime. Schemi (schemaL1/schemaBranch)
// sono locali alle funzioni e si spostano col blocco.
async function extractMindMapIterative(textParts, fileParts, apiKey, giro) {
    if (giro) giro.verifica();
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    try {
        const rootId = "ROOT";

        window.resetVaultState();

        appState.db = {
            nodes: [{ id: rootId, label: appState.rootNodeLabel, content: "Argomento principale dello studio.", level: 0, chunks: [], studyStatus: 'none', desc: "Argomento principale dello studio." }],
            links: [],
            sourcesDict: {},
            customColors: {}
        };
        if (giro) giro.iniziaMappa();

        if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'mm_iterative');
        window.showLoadingOverlay(true, `${(giro ? giro.fase('mappa').provider : appState.aiProvider) === 'google' ? 'Google Studio' : 'Infomaniak'}: Analisi introduttiva dell'argomento principale...`);
        try {
            const payloadL0 = {
                contents: [{ parts: [{ text: `Analizza le fonti testuali e scrivi un chiaro ed esaustivo paragrafo introduttivo in Italiano (max 40 parole) che spieghi a livello generale il tema: "${appState.rootNodeLabel}".\n\nFONTI:\n${textParts.slice(0, 3).join('\n')}` }] }],
                generationConfig: { temperature: 0.2, responseMimeType: "text/plain", maxOutputTokens: maxOutputTokens(512) }
            };
            const dataL0 = await callModelAPI(payloadL0, apiKey);
            const l0Text = dataL0.candidates && dataL0.candidates[0] && dataL0.candidates[0].content && dataL0.candidates[0].content.parts && dataL0.candidates[0].content.parts[0].text;
            if (l0Text) {
                appState.db.nodes[0].content = l0Text.trim();
                appState.db.nodes[0].desc = l0Text.trim();
            }
        } catch (e) { if (giro) giro.verifica(); console.log("L0 fallito", e); }

        let l1Data = Array.from(document.querySelectorAll('.l1-topic-input'))
            .map(i => i.value.trim())
            .filter(v => v)
            .map(lbl => ({ label: lbl, rel: "include" }));

        const autoGenerateL1 = document.getElementById('l1-auto-generate-toggle').checked;
        // Slider densità rimosso dalla UI: se assente → 0 (nessun minimo forzato di sotto-rami).
        const maxBranches = parseInt(document.getElementById('branches-slider')?.value) || 0;

        if (l1Data.length === 0 || autoGenerateL1) {
            window.showLoadingOverlay(true, `${(giro ? giro.fase('mappa').provider : appState.aiProvider) === 'google' ? 'Google Studio' : 'Infomaniak'}: Individuazione delle Macro-Categorie...`);
            let promptL1 = window.fillPromptTemplate("L1_MACRO_CATEGORIES", {
                rootNodeLabel: appState.rootNodeLabel,
                optionalL1Labels: l1Data.length > 0 ? `Devi ASSOLUTAMENTE includere le seguenti categorie richieste dall'utente: ${JSON.stringify(l1Data.map(x => x.label))}.\\n` : '',
                focusTopic: appState.focusTopic ? '\n\nISTRUZIONI AGGIUNTIVE (leggere prima di generare il JSON):\n' + appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').replace(/⚡|📅|👤|📍|🔑|❓|🗂️|📊|🧮|⚗️|📐|🔄|💬/g, '').replace(/\[([A-Z\s]+)\]:/g, '$1:').replace(/:{2,}/g, ':').trim() + '\n' : '',
                /* L'INDICE DEL DOCUMENTO in coda alle fonti (11/9): i titoli veri
                   del PDF, che `extractPdfPages` riconosce dall'altezza del testo.
                   Prima la Fase 1 riceveva un blocco piatto e sceglieva le
                   macro-aree senza sapere di quante sezioni fosse fatto il
                   documento — misurato: la pagina economica di un dossier di sei
                   pagine sparita da due mappe su due. Vuoto se le fonti non sono
                   PDF o se i titoli non si distinguono. */
                textParts: textParts.join('\\n') + (appState._docOutline || '')
            });

            const schemaL1 = {
                type: "ARRAY",
                maxItems: 7,  // CRITICO: senza questo il modello riempie l'array fino al budget
                              // (riprodotto a -12 tok dal limite con budget 6000/8192/12000)
                items: {
                    type: "OBJECT",
                    properties: {
                        label:   { type: "STRING", maxLength: 60   },  // max 3-4 parole
                        rel:     { type: "STRING", maxLength: 30   },  // 1-3 parole
                        ambito:  { type: "STRING", maxLength: 120  },  // 3-5 keyword
                        // desc RIMOSSA dallo schema Fase 1: era l'unico campo long-form
                        // ("narrativa 40-60 parole") e andava in RUNAWAY (il modello scriveva
                        // ~8000 tok di desc su un singolo L1 → MAX_TOKENS, 1 solo L1 salvato).
                        // maxItems/maxLength sono soft su Gemini → non fermano il runaway.
                        // desc+confini ricchi vengono rigenerati dopo da enrichL1Descs (call dedicata).
                        confini: { type: "STRING", maxLength: 180  }   // 1 frase
                    },
                    required: ["label", "rel"]
                }
            };

            // Su Infomaniak responseMimeType + responseSchema non sono supportati nativamente
            // (il bridge li converte in un reminder testuale che spesso manda in confusione
            // i modelli come Kimi-K2.6 → risposta vuota). Su Google si usa lo schema.
            const payloadL1 = (giro ? giro.fase('mappa').provider : appState.aiProvider) === 'infomaniak'
                ? {
                    contents: [{ parts: [{ text: promptL1 }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: maxOutputTokens(4096) }
                  }
                : {
                    contents: [{ parts: [{ text: promptL1 }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: maxOutputTokens(4096), responseMimeType: "application/json", responseSchema: schemaL1 }
                  };

            const dataL1 = await callModelAPI(payloadL1, apiKey);
            const candidateL1 = dataL1.candidates && dataL1.candidates[0];
            if (candidateL1 && candidateL1.content && candidateL1.content.parts) {
                let rawL1 = candidateL1.content.parts[0].text;
                let cleanL1Text = rawL1.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let generatedL1s = salvageTruncatedJSON(cleanL1Text);
                generatedL1s.forEach(gL1 => {
                    if (typeof gL1 === 'string') gL1 = { label: gL1, rel: "include" };
                    if (!l1Data.some(existing => existing.label.toLowerCase() === gL1.label.toLowerCase())) {
                        l1Data.push(gL1);
                    } else {
                        // Se l'IA ha trovato una relazione migliore per un label manuale, aggiorniamola
                        let existing = l1Data.find(x => x.label.toLowerCase() === gL1.label.toLowerCase());
                        if (existing && existing.rel === "include") existing.rel = gL1.rel;
                    }
                });
            }
        }

        if (l1Data.length === 0) l1Data = [{ label: "Concetti Principali", rel: "include" }];

        // Fase 1.5 — validazione semantica delle macro-categorie (gated dal flag).
        // Se trova sinonimi o meta-categorie, propone una lista raffinata.
        // Se la validazione fallisce, mantiene la lista originale (no-op safe).
        if (window.isL1ValidationEnabled && window.isL1ValidationEnabled()) {
            try {
                window.showLoadingOverlay(true, 'Mappa HD - Fase 1.5: validazione macro-categorie...');
                l1Data = await window.validateL1Categories(l1Data, appState.rootNodeLabel, giro);
            } catch (e) { if (giro) giro.verifica();
                console.warn('[Phase 1.5] errore non bloccante:', e.message);
            }
        }

        // Fase 1.6 — split macro-categorie composte (gated dal flag mappai_l1_split_enabled).
        // Pre-rami: spezza "Neutralità e Difesa" → "Neutralità" + "Difesa".
        if (window.isL1SplitEnabled && window.isL1SplitEnabled()) {
            try {
                window.showLoadingOverlay(true, 'Mappa HD - Fase 1.6: macro-aree atomiche...');
                l1Data = await window.splitCompoundL1s(l1Data, appState.rootNodeLabel, giro);
            } catch (e) { if (giro) giro.verifica();
                console.warn('[Phase 1.6] split non bloccante:', e.message);
            }
        }

        // Checkpoint L1 — materializza le macro-aree (cartella bus) e, se il flag
        // mappai_l1_checkpoint_enabled è attivo, mette in pausa per la revisione umana
        // prima di espandere i rami. Flag spento → no-op (proceed:true, dati invariati).
        if (window.l1Checkpoint) {
            const _cp = await window.l1Checkpoint(l1Data, { mode: 'mindmap' });
            if (!_cp.proceed) {
                window.showLoadingOverlay(false);
                if (window.showToast) window.showToast('Generazione annullata al checkpoint L1', 'info');
                return;
            }
            l1Data = _cp.l1Data;
            window._mappaiRunId = _cp.runId;
            window.showLoadingOverlay(true, 'Mappa HD: espansione dei rami...');
        }

        let l1NodesData = [];
        l1Data.forEach((item, idx) => {
            let l1Id = `L1_${idx}`;
            // Assegniamo un gruppo unico (idx + 1) per garantire colori diversi agli Hub
            let nodeObj = {
                id: l1Id,
                label: item.label,
                // content: usa il label come fallback leggibile.
                // Verrà aggiornato da enrichL1Descs con la prima frase del desc ricco.
                content: item.label,
                desc: (typeof item.desc === 'string' && item.desc.trim()) ? item.desc.trim() : `Categoria principale: ${item.label}`,
                level: 1,
                group: idx + 1,
                chunks: [],
                studyStatus: 'none',
                // Ambito semantico: parole-chiave che descrivono cosa questa L1 deve
                // contenere. Usato in Branch Boundaries, Phase 4 e Phase 5 per evitare
                // duplicati cross-ramo e classificazioni errate.
                ambito: (typeof item.ambito === 'string' && item.ambito.trim()) ? item.ambito.trim() : '',
                // Confini narrativi: cosa NON va in questo ramo (genera con PASS A, iniettato nel siblingCatalog).
                confini: (typeof item.confini === 'string' && item.confini.trim()) ? item.confini.trim() : ''
            };
            l1NodesData.push(nodeObj);
            appState.db.nodes.push(nodeObj);
            appState.db.links.push({ source: rootId, target: l1Id, rel: item.rel || "include" });
        });

        await window.enrichL1Descs(l1NodesData, appState.rootNodeLabel, apiKey, giro);
        const schemaBranch = {
            type: "OBJECT",
            properties: {
                nodes: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            label: { type: "STRING" },
                            content: { type: "STRING" },
                            desc: { type: "STRING" },
                            level: { type: "INTEGER" }
                            // chunks rimosso (stesso motivo del multi-pass)
                        },
                        required: ["id", "label", "content", "desc", "level"]
                    }
                },
                links: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            source: { type: "STRING" },
                            target: { type: "STRING" },
                            rel: { type: "STRING" }
                        },
                        required: ["source", "target", "rel"]
                    }
                }
            },
            required: ["nodes", "links"]
        };


        let l1LabelsStr = l1NodesData.map(n => `- ID: ${n.id} | Etichetta: "${n.label}"`).join('\n');

        window.showLoadingOverlay(true, `${(giro ? giro.fase('mappa').provider : appState.aiProvider) === 'google' ? 'Google Studio' : 'Infomaniak'}: Generazione dell'intero albero della mappa in corso...`);

        let userProfileStr = '';
        if (window.MappAITune && window.MappAITune.armed && appState.userProfile && appState.userProfile.nickname) {
            userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
        }

        if (appState.studentMode) {
            userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
        }

        let optionalMaxBranches = maxBranches > 0 ? `\nDEVI ASSOLUTAMENTE generare ALMENO ${maxBranches} sotto-rami per ogni macro-area per popolare l'albero in modo folto e dettagliato.` : '';

        let promptKey = "MIND_MAP_FULL_TREE";
        let promptFullTree = window.fillPromptTemplate(promptKey, {
            rootNodeLabel: appState.rootNodeLabel,
            l1LabelsStr: l1LabelsStr,
            optionalMaxBranches: optionalMaxBranches,
            userProfileStr: userProfileStr,
            focusTopic: appState.focusTopic ? '\n\nISTRUZIONI AGGIUNTIVE (leggere prima di generare il JSON):\n' + appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').replace(/⚡|📅|👤|📍|🔑|❓|🗂️|📊|🧮|⚗️|📐|🔄|💬/g, '').replace(/\[([A-Z\s]+)\]:/g, '$1:').replace(/:{2,}/g, ':').trim() + '\n' : '',
            textParts: textParts.join('\n\n')
        });

        const payloadTree = {
            contents: [{ parts: [...fileParts, { text: promptFullTree }] }],
            systemInstruction: { parts: [{ text: buildSystemInstruction(MIND_MAP_SYSTEM_INSTRUCTION) }] },
            generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: schemaBranch, maxOutputTokens: maxOutputTokens(8192) }
        };

        try {
            const dataTree = await callModelAPI(payloadTree, apiKey);
            const cand = dataTree.candidates && dataTree.candidates[0];
            if (cand && cand.content && cand.content.parts) {
                let rawText = cand.content.parts[0].text;
                let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let branchData = salvageTruncatedJSON(cleanText);

                const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
                const normalizeId = (id) => typeof id === 'string' ? id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') : id;
                const aiToRealIdMap = {};

                // Estrattore robusto per mappare l'appartenenza a una macro-area L1
                const extractL1Branch = (nodeId) => {
                    if (!nodeId) return null;
                    const cleanId = nodeId.toUpperCase();

                    // 1. Formato esplicito L1_X (es. L1_3, L1_3_L2_A)
                    const m1 = cleanId.match(/L1_(\d+)/);
                    if (m1) return `L1_${m1[1]}`;

                    // 2. Formato implicito LX_Y_... (es. L2_3_2, L3_3_2_1)
                    const m2 = cleanId.match(/^L\d+_(\d+)/);
                    if (m2) return `L1_${m2[1]}`;

                    return null;
                };

                // Risolutore matematico per gerarchie ID strutturate (es: L3_3_2_1 -> L2_3_2)
                const findParentIdByIdStructure = (nodeId, level) => {
                    if (!nodeId || level <= 1) return null;
                    const cleanId = nodeId.toUpperCase();

                    const match = cleanId.match(/^L\d+_([\d_]+)$/);
                    if (match) {
                        const parts = match[1].split('_');
                        if (parts.length > 1) {
                            parts.pop();
                            const parentLevel = level - 1;
                            const parentId = `L${parentLevel}_${parts.join('_')}`;

                            const parentExists = appState.db.nodes.some(n => n.id.toUpperCase() === parentId);
                            if (parentExists) return parentId;
                        }
                    }
                    return null;
                };

                // COSTRUZIONE STRUTTURA GERARCHICA DI SICUREZZA (FAILSAFE HIERARCHY RECONSTRUCTION)
                const lastNodeInBranch = {};
                // Inizializza con i nodi L1 correnti
                appState.db.nodes.forEach(node => {
                    if (node.level === 1) {
                        const l1Id = node.id.toUpperCase();
                        lastNodeInBranch[l1Id] = { 1: l1Id };
                    }
                });

                if (branchData.nodes && Array.isArray(branchData.nodes)) {
                    // Freeze chunk verbatim (se attivo): azzera i chunk prima del consumo
                    window.stripChunksIfFrozen(branchData.nodes);
                    // Pre-calculate parent mapping from links to aggregate chunks
                    const parentMap = {};
                    if (branchData.links) {
                        branchData.links.forEach(l => { parentMap[l.target] = l.source; });
                    }

                    branchData.nodes.forEach(n => {
                        n.id = normalizeId(n.id);
                        let existingNode = appState.db.nodes.find(x => normalizeId(x.id) === n.id);
                        let realMatch = !existingNode ? appState.db.nodes.find(ex => normalizeLabel(ex.label) === normalizeLabel(n.label)) : null;

                        let targetId = n.id;
                        if (existingNode) {
                            if (n.content) existingNode.content = n.content;
                            if (n.desc) existingNode.desc = n.desc;
                            aiToRealIdMap[n.id] = existingNode.id;
                            targetId = existingNode.id;
                        } else if (realMatch) {
                            aiToRealIdMap[n.id] = realMatch.id;
                            if (n.content && !realMatch.content) realMatch.content = n.content;
                            if (n.desc && !realMatch.desc) realMatch.desc = n.desc;
                            targetId = realMatch.id;
                        } else {
                            aiToRealIdMap[n.id] = n.id;
                            let nodeLevel = parseInt(n.level);
                            if (isNaN(nodeLevel)) nodeLevel = 2;

                            const desc = n.desc || n.content || "";
                            appState.db.nodes.push({
                                ...n,
                                level: nodeLevel,
                                studyStatus: 'none',
                                desc,
                                aiDesc: desc,
                                chunks: n.chunks || []
                            });
                        }

                        // Registra nel tracker gerarchico per ramo L1
                        const l1Branch = extractL1Branch(targetId);
                        if (l1Branch) {
                            if (!lastNodeInBranch[l1Branch]) lastNodeInBranch[l1Branch] = { 1: l1Branch };
                            lastNodeInBranch[l1Branch][n.level] = targetId;
                        }

                        // Citations logic — priorità: chunks (se presenti) → desc → content
                        if (n.chunks && n.chunks.length > 0) {
                            let l1ParentName = "Documento";
                            let currentP = n.id;
                            let sP = 0;
                            while (parentMap[currentP] && sP < 10) {
                                sP++;
                                let pId = normalizeId(parentMap[currentP]);
                                let mappedPId = aiToRealIdMap[pId] || pId;
                                let pNode = appState.db.nodes.find(x => normalizeId(x.id) === mappedPId);
                                if (pNode && pNode.level === 1) { l1ParentName = pNode.label; break; }
                                currentP = pId;
                            }
                            appState.db.sourcesDict[targetId] = n.chunks.map(c => ({ title: "Testo di origine", source: l1ParentName, text: c }));
                        } else {
                            // Fallback: chunks rimosso dallo schema → usa desc per sourcesDict
                            // (necessario quando enrichThinDescs è disabilitato)
                            const srcText = (n.desc || n.content || '').trim();
                            if (srcText && !appState.db.sourcesDict[targetId]) {
                                appState.db.sourcesDict[targetId] = [{ title: n.label || 'Nodo', source: 'Fonte analizzata', text: srcText }];
                            }
                        }
                    });
                }

                if (branchData.links && Array.isArray(branchData.links)) {
                    const findNodeId = (idOrLabel) => {
                        if (!idOrLabel) return null;
                        const cleaned = idOrLabel.toString().trim();
                        const upper = cleaned.toUpperCase();

                        // 1. Cerca per ID esatto
                        let found = appState.db.nodes.find(n => n.id.toUpperCase() === upper);
                        if (found) return found.id;

                        // 2. Cerca tramite mappatura aiToRealIdMap
                        if (aiToRealIdMap[upper]) {
                            let mappedNode = appState.db.nodes.find(n => n.id === aiToRealIdMap[upper]);
                            if (mappedNode) return mappedNode.id;
                        }

                        // 3. Cerca per Etichetta (Label) normalizzata
                        const norm = normalizeLabel(cleaned);
                        found = appState.db.nodes.find(n => normalizeLabel(n.label) === norm);
                        if (found) return found.id;

                        // 4. Cerca per ID normalizzato
                        found = appState.db.nodes.find(n => normalizeLabel(n.id) === norm);
                        if (found) return found.id;

                        return null;
                    };

                    branchData.links.forEach(l => {
                        if (l.source && l.target) {
                            let s = findNodeId(l.source);
                            let t = findNodeId(l.target);

                            // Fallback se il resolver semantico fallisce
                            if (!s) s = aiToRealIdMap[normalizeId(l.source)] || normalizeId(l.source);
                            if (!t) t = aiToRealIdMap[normalizeId(l.target)] || normalizeId(l.target);

                            if (s && t && s !== t) {
                                const sExists = appState.db.nodes.some(nx => nx.id === s);
                                const tExists = appState.db.nodes.some(nx => nx.id === t);

                                if (sExists && tExists) {
                                    // Evita duplicati di link
                                    const linkExists = appState.db.links.some(lk => lk.source === s && lk.target === t);
                                    if (!linkExists) {
                                        appState.db.links.push({ source: s, target: t, rel: l.rel || "include" });
                                    }
                                }
                            }
                        }
                    });
                }

                // 2. AUTO-LINK ORPHANED NODES (FAILSAFE COSTRUZIONE RAMI)
                // Collega qualsiasi nodo gerarchico a cui sono mancati i link a causa di troncamento JSON o ID impliciti
                appState.db.nodes.forEach(node => {
                    if (node.level > 1) {
                        const hasIncomingLink = appState.db.links.some(lk => {
                            const tid = typeof lk.target === 'object' ? lk.target.id : lk.target;
                            return tid === node.id;
                        });

                        if (!hasIncomingLink) {
                            // A. Prova tramite la struttura matematica dell'ID (es: L3_3_2_1 -> L2_3_2)
                            let parentId = findParentIdByIdStructure(node.id, node.level);

                            // B. Fallback tramite stack-tracking del ramo L1
                            if (!parentId) {
                                const l1Branch = extractL1Branch(node.id);
                                if (l1Branch && lastNodeInBranch[l1Branch]) {
                                    let parentLevel = node.level - 1;
                                    while (parentLevel >= 1 && !parentId) {
                                        if (lastNodeInBranch[l1Branch][parentLevel]) {
                                            parentId = lastNodeInBranch[l1Branch][parentLevel];
                                        }
                                        parentLevel--;
                                    }
                                }
                            }

                            if (parentId && parentId !== node.id) {
                                appState.db.links.push({
                                    source: parentId,
                                    target: node.id,
                                    rel: "include"
                                });
                                console.log(`Failsafe Link Creato: ${parentId} -> ${node.id}`);
                            }
                        }
                    }
                });

                // ASSEGNAZIONE GRUPPI (COLORI) AUTOMATICA PER NUOVI NODI
                const hubGroupMap = {};
                appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });

                appState.db.nodes.forEach(node => {
                    if (node.level > 1 && (!node.group || node.group === 0)) {
                        // Cerca l'Hub L1 più vicino tramite i link
                        const visited = new Set([node.id]);
                        const queue = [node.id];
                        let foundGroup = null;
                        while (queue.length > 0 && !foundGroup) {
                            const cur = queue.shift();
                            if (hubGroupMap[cur]) { foundGroup = hubGroupMap[cur]; break; }
                            appState.db.links.forEach(l => {
                                const sid = typeof l.source === 'object' ? l.source.id : l.source;
                                const tid = typeof l.target === 'object' ? l.target.id : l.target;
                                if (sid === cur && !visited.has(tid)) { visited.add(tid); queue.push(tid); }
                                if (tid === cur && !visited.has(sid)) { visited.add(sid); queue.push(sid); }
                            });
                        }
                        if (foundGroup) node.group = foundGroup;
                    }
                });
            }
        } catch (e) { if (giro) giro.verifica();
            console.warn("Errore durante la generazione single-pass:", e);
            window.showToast(window.t('tst_tree_error', "Errore durante la generazione dell'albero."), "error");
        }

        // Tetto di profondità (anche in iterativa): il template full-tree può
        // generare oltre il tetto scelto → ripiega nei dati, poi ri-sanitizza.
        if (window.applyDepthCeiling) {
            window.applyDepthCeiling(window.getGenDepth ? window.getGenDepth() : 5);
            if (window.sanitizeMindMapTree) window.sanitizeMindMapTree();
        }

        try {
            if (giro) await window.finalizeMindMapQuality(textParts, apiKey, giro);
            else await window.finalizeMindMapQuality(textParts, apiKey);
        } catch (e) { if (giro) giro.verifica(); console.warn('[Qualità] errore non bloccante:', e.message); }

        const validNodeIds = new Set(appState.db.nodes.map(n => n.id));
        appState.db.links = appState.db.links.filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        window.showLoadingOverlay(false);
        /* «pronta» e non «passa al canvas»: se il docente si è spostato in una
           console mentre generavamo, la mappa non gli strappa la schermata —
           avvisa, e il progetto resta marcato NUOVO negli elenchi. Il grafo si
           disegna solo se il canvas si vede davvero. */
        if (window.mappaPronta()) setTimeout(() => { initD3Visualization(); }, 200);

        // Show Generation Report
        setTimeout(() => { window.showGenerationReport(); }, 1500);

    } catch (err) { if (giro) giro.verifica();
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Mappa", err.message);
    }
}

async function extractMindMapMultiPass(textParts, fileParts, apiKey, giro) {
    if (giro) giro.verifica();
    const callModelAPI = giro ? payload => giro.chat('mappa', payload) : window.fetchModelAPI;
    const maxOutputTokens = base => window.getMaxOutputTokens(base, giro ? giro.fase('mappa') : undefined);
    try {
        const rootId = "ROOT";
        window.resetVaultState();

        appState.db = {
            nodes: [{ id: rootId, label: appState.rootNodeLabel, content: "Argomento principale dello studio.", level: 0, chunks: [], studyStatus: 'none', desc: "Argomento principale dello studio." }],
            links: [],
            sourcesDict: {},
            customColors: {}
        };
        if (giro) giro.iniziaMappa();

        // Fase 1: Introduzione L0
        if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'mm_phase1');
        window.showLoadingOverlay(true, "Mappa HD - Fase 1/3: Analisi introduttiva dell'argomento principale...");
        try {
            const payloadL0 = {
                contents: [{ parts: [{ text: `Analizza le fonti testuali e scrivi un chiaro ed esaustivo paragrafo introduttivo in Italiano (max 40 parole) che spieghi a livello generale il tema: "${appState.rootNodeLabel}".\n\nFONTI:\n${textParts.slice(0, 3).join('\n')}` }] }],
                generationConfig: { temperature: 0.2, responseMimeType: "text/plain", maxOutputTokens: maxOutputTokens(512) }
            };
            const dataL0 = await callModelAPI(payloadL0, apiKey);
            const l0Text = dataL0.candidates && dataL0.candidates[0] && dataL0.candidates[0].content && dataL0.candidates[0].content.parts && dataL0.candidates[0].content.parts[0].text;
            if (l0Text) {
                appState.db.nodes[0].content = l0Text.trim();
                appState.db.nodes[0].desc = l0Text.trim();
            }
        } catch (e) { if (giro) giro.verifica(); console.warn("L0 fallito", e); }

        // Fase 2: Macro-Categorie L1
        let l1Data = Array.from(document.querySelectorAll('.l1-topic-input'))
            .map(i => i.value.trim())
            .filter(v => v)
            .map(lbl => ({ label: lbl, rel: "include" }));

        const autoGenerateL1 = document.getElementById('l1-auto-generate-toggle').checked;

        if (l1Data.length === 0 || autoGenerateL1) {
            window.showLoadingOverlay(true, "Mappa HD - Fase 2/3: Individuazione delle Macro-Categorie...");
            let promptL1 = window.fillPromptTemplate("L1_MACRO_CATEGORIES", {
                rootNodeLabel: appState.rootNodeLabel,
                optionalL1Labels: l1Data.length > 0 ? `Devi ASSOLUTAMENTE includere le seguenti categorie richieste dall'utente: ${JSON.stringify(l1Data.map(x => x.label))}.\\n` : '',
                focusTopic: appState.focusTopic ? '\n\nISTRUZIONI AGGIUNTIVE (leggere prima di generare il JSON):\n' + appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').replace(/⚡|📅|👤|📍|🔑|❓|🗂️|📊|🧮|⚗️|📐|🔄|💬/g, '').replace(/\[([A-Z\s]+)\]:/g, '$1:').replace(/:{2,}/g, ':').trim() + '\n' : '',
                /* L'INDICE DEL DOCUMENTO in coda alle fonti (11/9): i titoli veri
                   del PDF, che `extractPdfPages` riconosce dall'altezza del testo.
                   Prima la Fase 1 riceveva un blocco piatto e sceglieva le
                   macro-aree senza sapere di quante sezioni fosse fatto il
                   documento — misurato: la pagina economica di un dossier di sei
                   pagine sparita da due mappe su due. Vuoto se le fonti non sono
                   PDF o se i titoli non si distinguono. */
                textParts: textParts.join('\\n') + (appState._docOutline || '')
            });

            const schemaL1 = {
                type: "ARRAY",
                maxItems: 7,  // CRITICO: senza questo il modello riempie l'array fino al budget
                              // (riprodotto a -12 tok dal limite con budget 6000/8192/12000)
                items: {
                    type: "OBJECT",
                    properties: {
                        label:   { type: "STRING", maxLength: 60   },  // max 3-4 parole
                        rel:     { type: "STRING", maxLength: 30   },  // 1-3 parole
                        ambito:  { type: "STRING", maxLength: 120  },  // 3-5 keyword
                        // desc RIMOSSA dallo schema Fase 1: era l'unico campo long-form
                        // ("narrativa 40-60 parole") e andava in RUNAWAY (il modello scriveva
                        // ~8000 tok di desc su un singolo L1 → MAX_TOKENS, 1 solo L1 salvato).
                        // maxItems/maxLength sono soft su Gemini → non fermano il runaway.
                        // desc+confini ricchi vengono rigenerati dopo da enrichL1Descs (call dedicata).
                        confini: { type: "STRING", maxLength: 180  }   // 1 frase
                    },
                    required: ["label", "rel"]
                }
            };

            // Su Infomaniak responseMimeType + responseSchema non sono supportati nativamente
            // (il bridge li converte in un reminder testuale che spesso manda in confusione
            // i modelli come Kimi-K2.6 → risposta vuota). Su Google si usa lo schema.
            const payloadL1 = (giro ? giro.fase('mappa').provider : appState.aiProvider) === 'infomaniak'
                ? {
                    contents: [{ parts: [{ text: promptL1 }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: maxOutputTokens(4096) }
                  }
                : {
                    contents: [{ parts: [{ text: promptL1 }] }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: maxOutputTokens(4096), responseMimeType: "application/json", responseSchema: schemaL1 }
                  };

            const dataL1 = await callModelAPI(payloadL1, apiKey);
            const candidateL1 = dataL1.candidates && dataL1.candidates[0];
            if (candidateL1 && candidateL1.content && candidateL1.content.parts) {
                let rawL1 = candidateL1.content.parts[0].text;
                let cleanL1Text = rawL1.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let generatedL1s = salvageTruncatedJSON(cleanL1Text);
                generatedL1s.forEach(gL1 => {
                    if (typeof gL1 === 'string') gL1 = { label: gL1, rel: "include" };
                    if (!l1Data.some(existing => existing.label.toLowerCase() === gL1.label.toLowerCase())) {
                        l1Data.push(gL1);
                    } else {
                        let existing = l1Data.find(x => x.label.toLowerCase() === gL1.label.toLowerCase());
                        if (existing && existing.rel === "include") existing.rel = gL1.rel;
                    }
                });
            }
        }

        if (l1Data.length === 0) l1Data = [{ label: "Concetti Principali", rel: "include" }];

        // Fase 1.5 — validazione semantica delle macro-categorie (gated dal flag).
        // Se trova sinonimi o meta-categorie, propone una lista raffinata.
        // Se la validazione fallisce, mantiene la lista originale (no-op safe).
        if (window.isL1ValidationEnabled && window.isL1ValidationEnabled()) {
            try {
                window.showLoadingOverlay(true, 'Mappa HD - Fase 1.5: validazione macro-categorie...');
                l1Data = await window.validateL1Categories(l1Data, appState.rootNodeLabel, giro);
            } catch (e) { if (giro) giro.verifica();
                console.warn('[Phase 1.5] errore non bloccante:', e.message);
            }
        }

        // Fase 1.6 — split macro-categorie composte (gated dal flag mappai_l1_split_enabled).
        // Pre-rami: spezza "Neutralità e Difesa" → "Neutralità" + "Difesa".
        if (window.isL1SplitEnabled && window.isL1SplitEnabled()) {
            try {
                window.showLoadingOverlay(true, 'Mappa HD - Fase 1.6: macro-aree atomiche...');
                l1Data = await window.splitCompoundL1s(l1Data, appState.rootNodeLabel, giro);
            } catch (e) { if (giro) giro.verifica();
                console.warn('[Phase 1.6] split non bloccante:', e.message);
            }
        }

        // Checkpoint L1 — materializza le macro-aree (cartella bus) e, se il flag
        // mappai_l1_checkpoint_enabled è attivo, mette in pausa per la revisione umana
        // prima di espandere i rami. Flag spento → no-op (proceed:true, dati invariati).
        if (window.l1Checkpoint) {
            const _cp = await window.l1Checkpoint(l1Data, { mode: 'mindmap' });
            if (!_cp.proceed) {
                window.showLoadingOverlay(false);
                if (window.showToast) window.showToast('Generazione annullata al checkpoint L1', 'info');
                return;
            }
            l1Data = _cp.l1Data;
            window._mappaiRunId = _cp.runId;
            window.showLoadingOverlay(true, 'Mappa HD: espansione dei rami...');
        }

        let l1NodesData = [];
        l1Data.forEach((item, idx) => {
            let l1Id = `L1_${idx}`;
            let nodeObj = {
                id: l1Id,
                label: item.label,
                // content: usa il label come fallback leggibile.
                // Verrà aggiornato da enrichL1Descs con la prima frase del desc ricco.
                content: item.label,
                desc: (typeof item.desc === 'string' && item.desc.trim()) ? item.desc.trim() : `Categoria principale: ${item.label}`,
                level: 1,
                group: idx + 1,
                chunks: [],
                studyStatus: 'none',
                // Ambito semantico: parole-chiave che descrivono cosa questa L1 deve
                // contenere. Usato in Branch Boundaries, Phase 4 e Phase 5 per evitare
                // duplicati cross-ramo e classificazioni errate.
                ambito: (typeof item.ambito === 'string' && item.ambito.trim()) ? item.ambito.trim() : '',
                // Confini narrativi: cosa NON va in questo ramo (genera con PASS A, iniettato nel siblingCatalog).
                confini: (typeof item.confini === 'string' && item.confini.trim()) ? item.confini.trim() : ''
            };
            l1NodesData.push(nodeObj);
            appState.db.nodes.push(nodeObj);
            appState.db.links.push({ source: rootId, target: l1Id, rel: item.rel || "include" });
        });

        await window.enrichL1Descs(l1NodesData, appState.rootNodeLabel, apiKey, giro);
        // Fase 3: Generazione dei rami Branch-by-Branch (Multi-Pass HD)
        const schemaBranch = {
            type: "OBJECT",
            properties: {
                nodes: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            label: { type: "STRING" },
                            content: { type: "STRING" },
                            desc: { type: "STRING" },
                            level: { type: "INTEGER" }
                            // chunks rimosso: era required → l'AI riproduceva testo verbatim
                            // dalla fonte (con \n\n\n\n dal PDF) → inflation 8180/8192 tok
                            // su rami lunghi. sourcesDict ora popolato da desc (fallback inline
                            // + enrichThinDescs). sourceCov invariato.
                        },
                        required: ["id", "label", "content", "desc", "level"]
                    }
                },
                links: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            source: { type: "STRING" },
                            target: { type: "STRING" },
                            rel: { type: "STRING" }
                        },
                        required: ["source", "target", "rel"]
                    }
                }
            },
            required: ["nodes", "links"]
        };

        let userProfileStr = '';
        if (window.MappAITune && window.MappAITune.armed && appState.userProfile && appState.userProfile.nickname) {
            userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
        }

        if (appState.studentMode) {
            userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
        }

        // Le Extraction Lenses (date, cronologia, ecc.) vanno iniettate ANCHE nella
        // fase di espansione dei rami: è qui che vivono i dettagli (L2-L5) come le date.
        // Senza questa iniezione le lenses agivano solo sulle macro-aree (Fase 1).
        const focusInjection = appState.focusTopic
            ? '\n\nISTRUZIONI AGGIUNTIVE OBBLIGATORIE (applica a OGNI sotto-nodo del ramo):\n' +
            appState.focusTopic.replace(/[`"{}[\]\\]/g, ' ').replace(/⚡|📅|👤|📍|🔑|❓|🗂️|📊|🧮|⚗️|📐|🔄|💬/g, '').replace(/\[([A-Z\s]+)\]:/g, '$1:').replace(/:{2,}/g, ':').trim() + '\n'
            : '';

        const totalBranches = l1NodesData.length;
        const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
        const normalizeId = (id) => typeof id === 'string' ? id.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '') : id;

        // Strategia A — catalogo dei rami fratelli, da iniettare in ogni prompt Fase 3.
        // Quando si espande il ramo X, mostra i label degli ALTRI L1 + il rel di ognuno.
        // Il modello sa quali aree NON sono di sua competenza → evita di creare L2 che
        // appartengono ad altri rami (problema undeveloped_branch).
        // Gated dal feature flag mappai_branch_boundaries_enabled (default ON se non MM-specific issue).
        const buildSiblingL1Catalog = (currentBranchId, completedL2s = {}) => {
            if (!window.isBranchBoundariesEnabled || !window.isBranchBoundariesEnabled()) return '';
            const siblings = l1NodesData.filter(n => n.id !== currentBranchId);
            if (siblings.length === 0) return '';
            const lines = siblings.map(s => {
                const ambitoPart = s.ambito ? ` — ambito: ${s.ambito}` : '';
                // desc esclusa dal catalog: 40-60 parole × N fratelli saturano Apertus.
                // confini (breve) è sufficiente come segnale di confine.
                const confiniPart = s.confini ? `\n    confini: ${s.confini}` : '';
                const l2Labels = completedL2s[s.id];
                const statusPart = l2Labels && l2Labels.length > 0
                    ? ` (GIÀ SVILUPPATO) — concetti già mappati: ${l2Labels.join(', ')}`
                    : ` (ramo futuro — non anticiparlo)`;
                return `- "${s.label}"${ambitoPart}${confiniPart}${statusPart}`;
            }).join('\n');
            return `\n\n⚠️ ALTRI RAMI DELLA MAPPA (NON di tua competenza):
${lines}

REGOLA TASSATIVA SUI CONFINI DI RAMO:
Stai sviluppando SOLO il ramo "${currentBranchId}". Se un concetto rientra nell'AMBITO di un altro ramo qui sopra, NON crearlo come tuo sotto-nodo.

REGOLA ANTI-DUPLICATI (critica per la qualità della mappa):
I concetti elencati come "già mappati" nei rami GIÀ SVILUPPATI esistono già nella mappa. NON ricrearli con lo stesso label o un sinonimo diretto — se sono rilevanti per il tuo ramo, verranno collegati da crosslink nella fase successiva.

Esempi di errori GRAVI da evitare:
- Se stai sviluppando "Neutralità Statale" e ti vengono in mente "Oro Nazista" o "Commercio Germania", quelli rientrano in un ramo dedicato al commercio/oro: NON crearli qui.
- Se stai sviluppando "Difesa Militare" e ti vengono in mente "Razionamento" o "Piano Wahlen", quelli appartengono al ramo economico: NON crearli qui.
- Se un concetto contiene una PAROLA-CHIAVE che compare nell'AMBITO di un altro ramo (es. "oro" → ramo "Rapporto Oro Nazista"), quasi sempre appartiene a quel ramo.

Quando un concetto è davvero al confine tra due rami, scegli quello che lo descrive più SPECIFICAMENTE per dominio (non per associazione superficiale).`;
        };

        const aiToRealIdMap = {};
        const lastNodeInBranch = {};
        const maxMapLevel = window.getGenDepth ? window.getGenDepth() : (parseInt(document.getElementById('level-slider').value) || 5);
        const completedBranchL2s = {}; // { branchId: ['label1', 'label2', ...] } — aggiornato dopo ogni ramo

        // Inizializza tracciamento dei rami
        l1NodesData.forEach(n => {
            lastNodeInBranch[n.id.toUpperCase()] = { 1: n.id };
        });

        for (let idx = 0; idx < totalBranches; idx++) {
            const branch = l1NodesData[idx];
            window.showLoadingOverlay(true, `Mappa HD - Fase 3/3: Generazione Ramo "${branch.label}" (Ramo ${idx + 1}/${totalBranches})...`);

            // ── Strategia 1A — JSONL per Infomaniak (gated da feature flag) ──
            // Quando attivo: prompt JSONL sezionato + parser tollerante al troncamento.
            // Altrimenti: prompt JSON monolitico originale + salvageTruncatedJSON.
            const useJSONL = window.isJSONLEnabled && window.isJSONLEnabled(giro ? giro.fase('mappa') : undefined);

            // Strategia A — calcola il catalogo dei rami fratelli per questo branch
            const siblingCatalog = buildSiblingL1Catalog(branch.id, completedBranchL2s);

            // Lista livelli DINAMICA dal tetto scelto: senza, il prompt scriveva
            // sempre "(L2, L3, L4, L5)" contraddicendo il numero maxMapLevel →
            // il modello generava L4/L5 anche con lo slider a 3.
            const _lvlList = Array.from({ length: Math.max(1, maxMapLevel - 1) }, (_, i) => 'L' + (i + 2)).join(', ');
            const _idEx = Array.from({ length: Math.max(1, maxMapLevel - 1) }, (_, i) => {
                const suff = ['A', 'A1', 'A1a', 'B2A', '1'][i] || String(i + 1);
                return `${branch.id}_L${i + 2}_${suff}`;
            }).join(', ');

            const promptBranch = useJSONL
                ? window.buildBranchPromptJSONL(branch, {
                    rootNodeLabel: appState.rootNodeLabel,
                    maxMapLevel,
                    userProfileStr,
                    focusInjection,
                    textParts,
                    fileParts,
                    siblingCatalog
                })
                : `SEI UN MOTORE DI GENERAZIONE SOTTO-RAMI PER MAPPE MENTALI (Fase 3 - Dettagli del Ramo).
Hai il compito di sviluppare in profondità il sotto-ramo per la macro-area "${branch.label}" (ID di partenza: "${branch.id}") all'interno della Mappa Mentale su "${appState.rootNodeLabel}".

ISTRUZIONI PER IL RAMO:
1. Genera tutti i sotto-nodi gerarchici spingendoti AL MASSIMO fino al Livello ${maxMapLevel} (${_lvlList}), e solo fino al livello di dettaglio realmente coperto dalle fonti. NON superare MAI il Livello ${maxMapLevel}: se la fonte contiene dettaglio più fine, riassumilo dentro la desc del nodo di Livello ${maxMapLevel}, senza creare nodi più profondi.
2. Ciascun sotto-nodo generato deve definire:
   - "id": un ID unico in lettere maiuscole coerente con la gerarchia del ramo (es. ${_idEx}).
   - "label": titolo sintetico e focalizzato (max 3 parole).
   - "content": sintesi didattica brevissima (max 10 parole).
   - "desc": descrizione scientifica o storica chiarissima (da 30 a 50 parole), in tono espositivo e fedele alle fonti, tarata sul profilo dello studente indicato.
   - "level": assegna un intero da 2 a ${maxMapLevel} in base alla profondità concettuale (2 per primari, fino a ${maxMapLevel} per foglie).
   - "chunks": un array contenente da 1 a 2 citazioni testuali REALI, INTEGRALI e VERBATIM (minimo 10-15 parole) copiate fedelmente dalle fonti testuali originali.
3. Definisci i collegamenti ("links") in un rigoroso albero gerarchico genitore-figlio. Ogni nodo di livello N deve avere come sorgente ("source") il rispettivo genitore di livello N-1. Il Livello 2 ha come sorgente "${branch.id}". Non creare mai connessioni trasversali.
${window.MM_FIDELITY_RULES_IT}
Restituisci SOLO un oggetto JSON con chiavi "nodes" e "links". Nessun commento, nessun blocco markdown.
Formato richiesto:
{
  "nodes": [
    { "id": "ID_NODO", "label": "Label", "content": "Sintesi", "desc": "Descrizione...", "level": 2 o 3, "chunks": ["Citazione"] }
  ],
  "links": [
    { "source": "ID_PADRE", "target": "ID_FIGLIO", "rel": "include" }
  ]
}

${userProfileStr}
${focusInjection}${siblingCatalog}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

            // In modalità JSONL rimuoviamo responseMimeType/responseSchema:
            // Infomaniak non li supporta nativamente e in plain text il modello
            // segue meglio le istruzioni di formato del prompt.
            const payloadBranch = useJSONL
                ? {
                    contents: [{ parts: [...fileParts, { text: promptBranch }] }],
                    systemInstruction: { parts: [{ text: buildSystemInstruction("Sei un ordinatore gerarchico di concetti per mappe mentali. Rispondi in JSONL sezionato come richiesto, una riga per oggetto.") }] },
                    generationConfig: { temperature: 0.25, maxOutputTokens: maxOutputTokens(4096) }
                  }
                : {
                    contents: [{ parts: [...fileParts, { text: promptBranch }] }],
                    systemInstruction: { parts: [{ text: buildSystemInstruction("Sei un ordinatore gerarchico di concetti per mappe mentali. Rispondi solo in JSON conforme allo schema.") }] },
                    generationConfig: { temperature: 0.25, responseMimeType: "application/json", responseSchema: schemaBranch, maxOutputTokens: maxOutputTokens(4096) }
                  };

            try {
                if (window.MappAIUsage) window.MappAIUsage.setContext('map', 'mm_phase3');
                const dataBranch = await callModelAPI(payloadBranch, apiKey);
                const cand = dataBranch.candidates && dataBranch.candidates[0];
                if (cand && cand.content && cand.content.parts) {
                    let rawText = cand.content.parts[0].text;
                    let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();

                    let branchData;
                    if (useJSONL) {
                        // Path JSONL: parser tollerante che recupera anche output troncati
                        const parsed = window.parseJSONLResponse(cleanText);
                        branchData = { nodes: parsed.nodes, links: parsed.links };
                        console.log(
                            `%c[JSONL] Ramo "${branch.label}":`,
                            'color:#10b981;font-weight:bold',
                            `${parsed.nodes.length} nodi, ${parsed.links.length} link recuperati`,
                            parsed.meta.partial ? `(⚠️ persi: ${parsed.meta.lost.nodes}N/${parsed.meta.lost.links}L)` : '✓ integro'
                        );
                        // Mostra esempi delle righe scartate per capire COSA è andato storto
                        if (parsed.meta.lostSamples && parsed.meta.lostSamples.length) {
                            console.warn('[JSONL] Esempi righe scartate:', parsed.meta.lostSamples);
                        }
                    } else {
                        // Path JSON legacy + salvage
                        branchData = salvageTruncatedJSON(cleanText);
                    }

                    if (branchData.nodes && Array.isArray(branchData.nodes)) {
                        // Freeze chunk verbatim (se attivo): azzera i chunk prima del consumo
                        window.stripChunksIfFrozen(branchData.nodes);
                        // Pre-calcola parent mapping
                        const parentMap = {};
                        if (branchData.links) {
                            branchData.links.forEach(l => { parentMap[l.target] = l.source; });
                        }

                        branchData.nodes.forEach(n => {
                            n.id = normalizeId(n.id);
                            let existingNode = appState.db.nodes.find(x => normalizeId(x.id) === n.id);
                            // Non dedupare con il nodo L1 del ramo stesso: causerebbe un self-loop
                            // (source=L1_X → target=L1_X) che viene scartato, svuotando il ramo.
                            let realMatch = !existingNode ? appState.db.nodes.find(ex =>
                                normalizeLabel(ex.label) === normalizeLabel(n.label) && ex.id !== branch.id
                            ) : null;

                            let targetId = n.id;
                            if (existingNode) {
                                if (n.content) existingNode.content = n.content;
                                if (n.desc) existingNode.desc = n.desc;
                                aiToRealIdMap[n.id] = existingNode.id;
                                targetId = existingNode.id;
                            } else if (realMatch) {
                                aiToRealIdMap[n.id] = realMatch.id;
                                if (n.content && !realMatch.content) realMatch.content = n.content;
                                if (n.desc && !realMatch.desc) realMatch.desc = n.desc;
                                targetId = realMatch.id;
                            } else {
                                aiToRealIdMap[n.id] = n.id;
                                let nodeLevel = parseInt(n.level);
                                if (isNaN(nodeLevel)) nodeLevel = 2;

                                const desc = n.desc || n.content || "";
                                appState.db.nodes.push({
                                    ...n,
                                    level: nodeLevel,
                                    studyStatus: 'none',
                                    desc,
                                    aiDesc: desc,
                                    chunks: n.chunks || []
                                });
                            }

                            // Registra nel tracker
                            const cleanId = targetId.toUpperCase();
                            const m1 = cleanId.match(/L1_(\d+)/);
                            const l1Branch = m1 ? `L1_${m1[1]}` : branch.id;
                            if (!lastNodeInBranch[l1Branch]) lastNodeInBranch[l1Branch] = { 1: l1Branch };
                            lastNodeInBranch[l1Branch][n.level] = targetId;

                            // Citazioni — priorità: chunks → desc → content
                            if (n.chunks && n.chunks.length > 0) {
                                let l1ParentName = branch.label;
                                appState.db.sourcesDict[targetId] = n.chunks.map(c => ({ title: "Testo di origine", source: l1ParentName, text: c }));
                            } else {
                                // Fallback desc (chunks rimosso dallo schema)
                                const srcText = (n.desc || n.content || '').trim();
                                if (srcText && !appState.db.sourcesDict[targetId]) {
                                    appState.db.sourcesDict[targetId] = [{ title: n.label || 'Nodo', source: branch.label || 'Fonte analizzata', text: srcText }];
                                }
                            }
                        });
                    }

                    if (branchData.links && Array.isArray(branchData.links)) {
                        const findNodeId = (idOrLabel) => {
                            if (!idOrLabel) return null;
                            const cleaned = idOrLabel.toString().trim();
                            const upper = cleaned.toUpperCase();

                            let found = appState.db.nodes.find(n => n.id.toUpperCase() === upper);
                            if (found) return found.id;

                            if (aiToRealIdMap[upper]) {
                                let mappedNode = appState.db.nodes.find(n => n.id === aiToRealIdMap[upper]);
                                if (mappedNode) return mappedNode.id;
                            }

                            const norm = normalizeLabel(cleaned);
                            found = appState.db.nodes.find(n => normalizeLabel(n.label) === norm);
                            if (found) return found.id;

                            return null;
                        };

                        branchData.links.forEach(l => {
                            if (l.source && l.target) {
                                let s = findNodeId(l.source);
                                let t = findNodeId(l.target);

                                if (!s) s = aiToRealIdMap[normalizeId(l.source)] || normalizeId(l.source);
                                if (!t) t = aiToRealIdMap[normalizeId(l.target)] || normalizeId(l.target);

                                if (s && t && s !== t) {
                                    const sExists = appState.db.nodes.some(nx => nx.id === s);
                                    const tExists = appState.db.nodes.some(nx => nx.id === t);

                                    if (sExists && tExists) {
                                        const linkExists = appState.db.links.some(lk => lk.source === s && lk.target === t);
                                        if (!linkExists) {
                                            appState.db.links.push({ source: s, target: t, rel: l.rel || "include" });
                                        }
                                    }
                                }
                            }
                        });
                    }
                }

                // Registra i label L2 di questo ramo per i rami successivi (anti-duplicati)
                completedBranchL2s[branch.id] = appState.db.nodes
                    .filter(n => n.level === 2 && appState.db.links.some(l => l.source === branch.id && l.target === n.id))
                    .map(n => window.cleanLabel ? window.cleanLabel(n.label) : n.label);
            } catch (branchErr) { if (giro) giro.verifica();
                console.error(`Errore nel ramo ${branch.label}:`, branchErr);
                // Fallback auto-healing per questo ramo
                const fallbackL2Id = `${branch.id}_L2_FALLBACK`;
                appState.db.nodes.push({
                    id: fallbackL2Id,
                    label: `Approfondimento ${branch.label}`,
                    content: `Sotto-ramo di ${branch.label}`,
                    desc: `Studio analitico per la macro-area ${branch.label}.`,
                    level: 2,
                    chunks: [],
                    studyStatus: 'none'
                });
                appState.db.links.push({ source: branch.id, target: fallbackL2Id, rel: "dettagli" });
            }
        }

        // PULIZIA NODI GARBAGE: alcuni modelli (es. Mistral piccoli) emettono nodi
        // spazzatura con livelli invalidi (negativi, NaN) o ID/label segnaposto (DUMMY).
        // Vanno rimossi PRIMA del ri-collegamento, altrimenti restano orfani.
        const isGarbageNode = (n) => {
            const lvl = parseInt(n.level);
            if (isNaN(lvl) || lvl < 0) return true;
            const id = (n.id || '').toUpperCase();
            const lbl = (n.label || '').toUpperCase();
            if (!id) return true;
            if (id.includes('DUMMY') || lbl.includes('DUMMY')) return true;
            return false;
        };
        const garbageIds = new Set(appState.db.nodes.filter(isGarbageNode).map(n => n.id));
        if (garbageIds.size > 0) {
            console.info('[MappAI] Rimossi ' + garbageIds.size + ' nodi garbage (livelli invalidi/DUMMY).');
            appState.db.nodes = appState.db.nodes.filter(n => !isGarbageNode(n));
            appState.db.links = appState.db.links.filter(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                return !garbageIds.has(s) && !garbageIds.has(t);
            });
        }

        // AUTO-LINK ORPHANED NODES
        const findParentIdByIdStructure = (nodeId, level) => {
            if (!nodeId || level <= 1) return null;
            const cleanId = nodeId.toUpperCase();
            const match = cleanId.match(/^L\d+_([\d_]+)$/);
            if (match) {
                const parts = match[1].split('_');
                if (parts.length > 1) {
                    parts.pop();
                    const parentLevel = level - 1;
                    const parentId = `L${parentLevel}_${parts.join('_')}`;
                    const parentExists = appState.db.nodes.some(n => n.id.toUpperCase() === parentId);
                    if (parentExists) return parentId;
                }
            }
            return null;
        };

        const extractL1Branch = (nodeId) => {
            if (!nodeId) return null;
            const cleanId = nodeId.toUpperCase();
            const m1 = cleanId.match(/L1_(\d+)/);
            if (m1) return `L1_${m1[1]}`;
            const m2 = cleanId.match(/^L\d+_(\d+)/);
            if (m2) return `L1_${m2[1]}`;
            return null;
        };

        appState.db.nodes.forEach(node => {
            if (node.level > 1) {
                const hasIncomingLink = appState.db.links.some(lk => {
                    const tid = typeof lk.target === 'object' ? lk.target.id : lk.target;
                    return tid === node.id;
                });

                if (!hasIncomingLink) {
                    let parentId = findParentIdByIdStructure(node.id, node.level);
                    if (!parentId) {
                        const l1Branch = extractL1Branch(node.id);
                        if (l1Branch && lastNodeInBranch[l1Branch]) {
                            let parentLevel = node.level - 1;
                            while (parentLevel >= 1 && !parentId) {
                                if (lastNodeInBranch[l1Branch][parentLevel]) {
                                    parentId = lastNodeInBranch[l1Branch][parentLevel];
                                }
                                parentLevel--;
                            }
                        }
                    }

                    if (parentId && parentId !== node.id) {
                        appState.db.links.push({
                            source: parentId,
                            target: node.id,
                            rel: "include"
                        });
                    }
                }
            }
        });

        // ASSEGNAZIONE GRUPPI (COLORI) AUTOMATICA PER NUOVI NODI
        const hubGroupMap = {};
        appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });

        appState.db.nodes.forEach(node => {
            if (node.level > 1 && (!node.group || node.group === 0)) {
                const visited = new Set([node.id]);
                const queue = [node.id];
                let foundGroup = null;
                while (queue.length > 0 && !foundGroup) {
                    const cur = queue.shift();
                    if (hubGroupMap[cur]) { foundGroup = hubGroupMap[cur]; break; }
                    appState.db.links.forEach(l => {
                        const sid = typeof l.source === 'object' ? l.source.id : l.source;
                        const tid = typeof l.target === 'object' ? l.target.id : l.target;
                        if (sid === cur && !visited.has(tid)) { visited.add(tid); queue.push(tid); }
                        if (tid === cur && !visited.has(sid)) { visited.add(sid); queue.push(sid); }
                    });
                }
                if (foundGroup) node.group = foundGroup;
            }
        });

        // Deduplica i doppioni cross-ramo (es. "Corse agli armamenti" L1 vs
        // "Corsa agli armamenti" L5) trasformandoli in cross-link verso il nodo canonico.
        window.dedupeNodesAsCrossLinks();

        // Fase 4 — consolidamento + cross-link semantici (Strategia B).
        // Gated dal feature flag mappai_mm_phase4_enabled. Va eseguita DOPO il dedup
        // deterministico (per non duplicare lavoro su sinonimi banali) e PRIMA del
        // filtro link orfani (così cross-link nuovi vengono inclusi nella pulizia finale).
        if (window.isPhase4Enabled && window.isPhase4Enabled()) {
            try {
                window.showLoadingOverlay(true, 'Mappa HD - Consolidamento finale (Fase 4)...');
                await window.executePhase4Consolidation(giro);
            } catch (e) { if (giro) giro.verifica();
                console.warn('[Phase4] Errore non bloccante:', e.message);
            }
        }

        // Fase 5 — riclassificazione semantica (Pass 5).
        // Riguarda i nodi L2/L3 e sposta quelli mal classificati sotto la L1 corretta.
        // Va eseguita DOPO Phase 4 (così agisce su un grafo già consolidato).
        if (window.isPhase5Enabled && window.isPhase5Enabled()) {
            try {
                window.showLoadingOverlay(true, 'Mappa HD - Riclassificazione (Fase 5)...');
                await window.executePhase5Reclassification(giro);
            } catch (e) { if (giro) giro.verifica();
                console.warn('[Phase5] Errore non bloccante:', e.message);
            }
        }

        // Tree-sanitizer: impone single-parent, rimuove L1→L1, ricalcola livelli
        // e group. Deterministico, zero AI. Solo su mindmap.
        if (window.sanitizeMindMapTree) window.sanitizeMindMapTree();

        // Fase 3.7 — deepening selettivo (P2+P3): misura la profondità topologica
        // reale di ogni ramo (post-sanitizer); se sotto lo slider, scava le foglie
        // dense usando SOLO il loro materiale locale (fedeltà ⚓ preservata).
        // Ri-sanitizza dopo: i nuovi nodi entrano nel ricalcolo BFS di livelli/group.
        try {
            if (window.executeDeepeningPass) {
                // Triage adattivo (opt-in): se attivo, essentialDepth cappa il TARGET del
                // deepening (mai oltre il tetto utente maxMapLevel). Tassonomico (2) →
                // target<3 → il deepening non parte (nessun nodo _D di parafrasi);
                // procedurale (3) → scava solo le foglie sotto L3. Assente/null → maxMapLevel
                // (comportamento identico a oggi). Il tetto di Fase 3 resta maxMapLevel.
                let deepTarget = maxMapLevel;
                try {
                    const et = appState.mmTriage && parseInt(appState.mmTriage.essentialDepth);
                    if (et >= 2 && et <= 5) deepTarget = Math.min(maxMapLevel, et);
                } catch (e) { if (giro) giro.verifica(); /* verdetto assente → tetto utente */ }
                await window.executeDeepeningPass(textParts, apiKey, deepTarget, giro);
                if (window.sanitizeMindMapTree) window.sanitizeMindMapTree();
            }
        } catch (e) { if (giro) giro.verifica();
            console.warn('[Deepening] errore non bloccante:', e.message);
        }

        // Tetto di profondità: garanzia deterministica che nessun nodo superi
        // maxMapLevel nei DATI (la Fase 3 può ancora sforare). Ripiega il
        // dettaglio oltre il tetto nelle desc. Dopo, ri-sanitizza.
        if (window.applyDepthCeiling) {
            window.applyDepthCeiling(maxMapLevel);
            if (window.sanitizeMindMapTree) window.sanitizeMindMapTree();
        }

        try {
            if (giro) await window.finalizeMindMapQuality(textParts, apiKey, giro);
            else await window.finalizeMindMapQuality(textParts, apiKey);
        } catch (e) { if (giro) giro.verifica(); console.warn('[Qualità] errore non bloccante:', e.message); }

        const validNodeIds = new Set(appState.db.nodes.map(n => n.id));
        appState.db.links = appState.db.links.filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        window.showLoadingOverlay(false);
        /* «pronta» e non «passa al canvas»: se il docente si è spostato in una
           console mentre generavamo, la mappa non gli strappa la schermata —
           avvisa, e il progetto resta marcato NUOVO negli elenchi. Il grafo si
           disegna solo se il canvas si vede davvero. */
        if (window.mappaPronta()) setTimeout(() => { initD3Visualization(); }, 200);
        setTimeout(() => { window.showGenerationReport(); }, 1500);

    } catch (err) { if (giro) giro.verifica();
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Mappa HD", err.message);
    }
}
