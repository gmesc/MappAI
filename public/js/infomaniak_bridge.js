/**
 * Infomaniak API Bridge for MappAI
 * Converts Gemini-style payloads to OpenAI/Infomaniak compatible payloads.
 */
window.InfomaniakBridge = {
    /**
     * Translates a Gemini payload to an OpenAI-compatible messages array.
     */
    translatePayload: function(geminiPayload, modelName = "mistral24b") {
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
                const content = item.parts.map(p => p.text || '').join('\n').trim();
                if (content) {
                    messages.push({ role, content });
                }
            });
        }

        // 3. Build OpenAI payload
        const openAIPayload = {
            model: modelName,
            messages: messages,
            temperature: geminiPayload.generationConfig?.temperature || 0.7,
            top_p: geminiPayload.generationConfig?.topP || 1.0,
            max_completion_tokens: geminiPayload.generationConfig?.maxOutputTokens || 32768,
            max_tokens: geminiPayload.generationConfig?.maxOutputTokens || 32768,
        };

        // 4. Handle JSON enforcement
        if (geminiPayload.generationConfig?.responseMimeType === "application/json") {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg) {
                if (!lastMsg.content.toLowerCase().includes("json")) {
                    lastMsg.content += "\n\nIMPORTANT: Return ONLY a valid JSON object. Do not wrap in markdown code blocks.";
                }
                
                // Inject schema if present so Infomaniak's model knows exactly what to output
                if (geminiPayload.generationConfig.responseSchema) {
                    const schemaStr = window.InfomaniakBridge._schemaToExample(geminiPayload.generationConfig.responseSchema);
                    lastMsg.content += `\n\nEXPECTED JSON FORMAT EXACTLY LIKE THIS:\n\`\`\`json\n${schemaStr}\n\`\`\``;
                }
            }
        }

        // 5. Ensure messages is never empty
        if (messages.length === 0) {
            messages.push({ role: "user", content: "Genera contenuto richiesto." });
        }

        return openAIPayload;
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
