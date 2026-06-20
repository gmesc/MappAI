/**
 * Infomaniak API Bridge for MappAI
 * Converts Gemini-style payloads to OpenAI/Infomaniak compatible payloads.
 */
window.InfomaniakBridge = {
    /**
     * Translates a Gemini payload to an OpenAI-compatible messages array.
     */
    translatePayload: function(geminiPayload, modelName = "google/gemma-4-31B-it") {
        const messages = [];

        // 1. Extract System Instruction
        if (geminiPayload.systemInstruction && geminiPayload.systemInstruction.parts) {
            const systemText = geminiPayload.systemInstruction.parts.map(p => p.text || '').join('\n').trim();
            if (systemText) {
                messages.push({ role: "system", content: systemText });
            }
        }

        // 2. Extract Contents (Conversation history)
        if (geminiPayload.contents) {
            geminiPayload.contents.forEach(item => {
                const role = item.role === 'model' ? 'assistant' : (item.role || 'user');

                // Avvisa se ci sono parti multimediali (audio/video/file) che Infomaniak non supporta
                const hasMediaParts = item.parts && item.parts.some(p => p.inline_data || p.file_data);
                if (hasMediaParts) {
                    console.warn("[InfomaniakBridge] Parti multimediali (audio/video/file_data) rilevate nel payload. " +
                        "Infomaniak non supporta file multimediali nativi: solo il testo estratto verrà inviato.");
                    if (window.showToast) {
                        window.showToast("⚠️ Infomaniak: file audio/video/immagini non supportati. Solo il testo estratto verrà analizzato.", "warning");
                    }
                }

                const content = item.parts.map(p => p.text || '').join('\n').trim();
                if (content) {
                    messages.push({ role, content });
                }
            });
        }

        // 3. Build OpenAI payload
        const maxTokens = geminiPayload.generationConfig?.maxOutputTokens || 4000;
        const isJsonMode = geminiPayload.generationConfig?.responseMimeType === "application/json";

        const openAIPayload = {
            model: modelName,
            messages: messages,
            temperature: 0.3,
            max_tokens: maxTokens,
            // Valori ridotti per non penalizzare la struttura JSON ripetitiva (nodi, links)
            frequency_penalty: 0.3,
            presence_penalty: 0.1,
        };

        // Abilita JSON mode nativo OpenAI quando richiesto.
        // Solo Gemma 4 e Kimi supportano json_schema su Infomaniak (verificato).
        // Apertus: niente function calling. Qwen: risponde vuoto con json_schema.
        const modelLower = modelName.toLowerCase();

        // Qwen3.5 è un modello "reasoning": di default spende i token a "pensare"
        // (reasoning_content) prima di produrre l'output, esaurendo il budget.
        // Per i task estrattivi di MappAI il thinking non serve → lo disabilitiamo.
        if (modelLower.includes('qwen')) {
            openAIPayload.chat_template_kwargs = { enable_thinking: false };
        }

        const supportsJsonMode = !modelLower.includes('apertus') && !modelLower.includes('qwen');
        if (isJsonMode && supportsJsonMode && geminiPayload.generationConfig?.responseSchema) {
            openAIPayload.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "mappai_response",
                    strict: false,
                    schema: window.InfomaniakBridge._geminiSchemaToJsonSchema(geminiPayload.generationConfig.responseSchema)
                }
            };
        }

        // 4. Handle JSON enforcement via testo (fallback per modelli senza json_object,
        //    cioè Apertus e Qwen su Infomaniak). Le istruzioni devono essere molto
        //    esplicite: questi modelli tendono ad aggiungere preamboli/spiegazioni.
        if (isJsonMode && !openAIPayload.response_format) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg) {
                // Inietta lo schema PRIMA, poi le regole di output, sempre in coda al messaggio.
                if (geminiPayload.generationConfig.responseSchema) {
                    const schemaStr = window.InfomaniakBridge._schemaToExample(geminiPayload.generationConfig.responseSchema);
                    lastMsg.content += `\n\nSTRUTTURA JSON ATTESA (rispetta ESATTAMENTE chiavi e nidificazione):\n${schemaStr}`;
                }
                lastMsg.content +=
                    "\n\nREGOLE DI OUTPUT TASSATIVE:" +
                    "\n1. Rispondi SOLO con il JSON, nient'altro." +
                    "\n2. NIENTE testo introduttivo (es. \"Ecco il JSON:\"), NIENTE spiegazioni finali." +
                    "\n3. NIENTE blocchi markdown (vietati ```json e ```)." +
                    "\n4. Il primo carattere della risposta deve essere { (o [) e l'ultimo } (o ]).";
            }
        }

        // 5. Ensure messages is never empty
        if (messages.length === 0) {
            messages.push({ role: "user", content: "Genera contenuto richiesto." });
        }

        return openAIPayload;
    },

    /**
     * Converte uno schema Gemini (tipi uppercase: OBJECT, ARRAY, STRING…)
     * in uno schema OpenAI/JSON Schema standard (tipi lowercase).
     */
    _geminiSchemaToJsonSchema: function(schema) {
        if (!schema) return {};
        const typeMap = { OBJECT: 'object', ARRAY: 'array', STRING: 'string', INTEGER: 'integer', NUMBER: 'number', BOOLEAN: 'boolean' };
        const result = { type: typeMap[schema.type] || 'object' };
        if (schema.type === 'OBJECT' && schema.properties) {
            result.properties = {};
            for (const [key, val] of Object.entries(schema.properties)) {
                result.properties[key] = window.InfomaniakBridge._geminiSchemaToJsonSchema(val);
            }
            if (schema.required) result.required = schema.required;
        } else if (schema.type === 'ARRAY' && schema.items) {
            result.items = window.InfomaniakBridge._geminiSchemaToJsonSchema(schema.items);
        }
        return result;
    },

    /**
     * Recursively converts a Gemini schema object into a formatted JSON string example
     */
    _schemaToExample: function(schema, indent = "") {
        if (!schema) return "{}";
        const nextIndent = indent + "  ";
        if (schema.type === "OBJECT") {
            let lines = ["{"];
            let props = Object.keys(schema.properties || {});
            props.forEach((key, idx) => {
                const val = window.InfomaniakBridge._schemaToExample(schema.properties[key], nextIndent);
                const comma = idx < props.length - 1 ? "," : "";
                lines.push(`${nextIndent}"${key}": ${val}${comma}`);
            });
            lines.push(`${indent}}`);
            return lines.join("\n");
        } else if (schema.type === "ARRAY") {
            const val = window.InfomaniakBridge._schemaToExample(schema.items, nextIndent);
            return `[\n${nextIndent}${val}\n${indent}]`;
        } else if (schema.type === "STRING") {
            return '"<string>"';
        } else if (schema.type === "INTEGER" || schema.type === "NUMBER") {
            return '0';
        } else if (schema.type === "BOOLEAN") {
            return 'true';
        }
        return 'null';
    },

    /**
     * Translates an OpenAI response back to Gemini-like structure for MappAI compatibility.
     */
    translateResponse: function(openAIResponse) {
        if (!openAIResponse.choices || !openAIResponse.choices[0]) {
            return { error: "Invalid response from Infomaniak" };
        }

        const choice = openAIResponse.choices[0];
        
        return {
            candidates: [
                {
                    content: {
                        parts: [
                            { text: choice.message.content }
                        ]
                    },
                    finishReason: choice.finish_reason === 'stop' ? 'STOP' : choice.finish_reason
                }
            ],
            usageMetadata: {
                promptTokenCount: openAIResponse.usage?.prompt_tokens || 0,
                candidatesTokenCount: openAIResponse.usage?.completion_tokens || 0,
                totalTokenCount: openAIResponse.usage?.total_tokens || 0
            }
        };
    }
};
