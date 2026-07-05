# MappAI — MindMap Multi-Pass Generation Pipeline
**ML Engineer Onboarding Reference**
_Last updated: 25 June 2026 — post Phase-1 desc-runaway fix_

---

## 1. Quick Orientation

MappAI is an Electron desktop app (Node.js main process, Vanilla JS renderer).
All extraction logic lives in `public/js/app.js` (~16 000 lines, monolith).
No ES modules — all functions share one lexical scope via `<script>` tags.

Two generation modes exist; this document covers **MindMap** only.
The KG pipeline (knowledge-graph) is a separate code path (`extractKnowledgeGraphCommunity`,
`extractKnowledgeGraphSinglePass`, `extractKnowledgeGraphMultiPass`) and is not documented here.

Two MindMap sub-modes:
| Mode | Function | Trigger |
|---|---|---|
| **Multi-pass** | `extractMindMapMultiPass` | `appState.multiPassMode === true` |
| **Iterative** | `extractMindMapIterative` | default |

The token-budget, thinking, and truncation systems are shared between both modes.

---

## 2. Full Pipeline — ASCII Diagram

```
USER INPUT (PDF / URL / YouTube / DOCX / free text / audio / video)
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SOURCE INGESTION                                                      │
│  for each source →                                                    │
│    text/url/youtube/docx  → textParts[]  (plain strings)             │
│    pdf/audio/video        → fileParts[]  (inline_data or file_data)  │
│  truncation guard: SOURCE_CAP on each source                         │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│ DISPATCH  startGeneration()                                          │
│  mode=mindmap + multiPassMode=true  → extractMindMapMultiPass()      │
│  mode=mindmap + multiPassMode=false → extractMindMapIterative()      │
└────────────────┬─────────────────────────────────────────────────────┘
                 │
  ┌──────────────┤  MULTI-PASS PATH
  │              ▼
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ PHASE 1 — L1 Macro-area identification                       │
  │  │  prompt: L1_MACRO_CATEGORIES_IT  (from prompts_config.json)  │
  │  │  schema: schemaL1 (label, rel, ambito, confini — NO desc)     │
  │  │  budget: getMaxOutputTokens(4096) → 8192 on gemini-2.5        │
  │  │  thinking: OFF (budget ≤ 12288)                               │
  │  │  output: raw L1 array → nodes[] with placeholder desc        │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼  [if mappai_l1_validation_enabled]
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ PHASE 1.5 — L1 conservative validation                       │
  │  │  budget: getMaxOutputTokens(1500) → 3000                     │
  │  │  guard: reject output if >50% labels changed                 │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼  [if mappai_l1_split_enabled]
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ PHASE 1.6 — Compound L1 splitting                            │
  │  │  detect "X e Y" / "X & Y" / "X / Y" labels                  │
  │  │  LLM splits each compound → 2 atomic areas                   │
  │  │  tetto MAX_L1 = 7                                            │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼  [if any L1 has placeholder desc]
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ enrichL1Descs — post-Phase-1 desc regeneration               │
  │  │  1 LLM call per L1 with placeholder "Categoria principale: X"│
  │  │  generates: desc (40-60 words) + confini                     │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ PHASE 3 — Branch expansion (loop, 1 call per L1)             │
  │  │  prompt: MIND_MAP_BRANCH_IT                                  │
  │  │  sibling catalog injected (mappai_branch_boundaries_enabled)  │
  │  │  schema: schemaBranch (nodes + links, no chunks)             │
  │  │  budget: getMaxOutputTokens(4096) → 8192 on gemini-2.5        │
  │  │  thinking: OFF (budget ≤ 12288)                              │
  │  │  JSONL path: parseJSONLResponse → ===NODES=== + ===LINKS===  │
  │  │  JSON path: salvageTruncatedJSON fallback                    │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ DEDUP — node deduplication across branches                   │
  │  │  cosine similarity on labels (optional enrichment)           │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼  [if mappai_mm_phase4_enabled]
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ PHASE 4 — Consolidation (merges + cross-links)               │
  │  │  budget: getMaxOutputTokens(6500) → 13000 on gemini-2.5      │
  │  │  thinking: ON (budget > 12288)                               │
  │  │  JSONL: ===MERGES=== + ===CROSSLINKS=== sections            │
  │  │  max 20 merges, max 20 cross-links                          │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼  [if mappai_mm_phase5_enabled]
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ PHASE 5 — Reclassification of misplaced L2/L3               │
  │  │  budget: getMaxOutputTokens(1500) → 3000                    │
  │  │  thinking: OFF (budget ≤ 12288)                             │
  │  │  JSONL: ===RECLASSIFY=== section                            │
  │  │  safeguard: skip if source branch ≤ 2 L2 children           │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ TreeSanitizer — deterministic graph repair (0 AI calls)      │
  │  │  mappai-tree-sanitizer.js, 7 steps                           │
  │  │  see §9 below                                                │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  │              ▼  [if mappai_enrich_descs_enabled]
  │  ┌───────────────────────────────────────────────────────────────┐
  │  │ enrichThinDescs — final desc safety net                      │
  │  │  threshold: < 35 words                                       │
  │  │  batch: 6 nodes per call                                     │
  │  │  source-anchored: no hallucination, max SOURCE_CAP 28000 ch  │
  │  └───────────────────────────────────────────────────────────────┘
  │              │
  └──────────────┤  ITERATIVE PATH (extractMindMapIterative)
                 │    single large call, full tree at once
                 │    same Phase 1 schema + budget
                 │    no Phase 3/4/5 loop
                 │
                 ▼
         RENDER (D3.js) + VAULT SAVE
```

---

## 3. Source Ingestion

**Entry point:** `app.js` ~L.2370

For each `appState.sources` entry the ingestion loop builds two arrays:
- `textParts: string[]` — plain text for text-native sources
- `fileParts: object[]` — Gemini `inline_data` or `file_data` objects for binary sources

| Source type | Processing | Output array |
|---|---|---|
| `text` | raw string | `textParts` |
| `url` | fetched HTML → stripped text | `textParts` |
| `youtube` | transcript fetch | `textParts` |
| `docx` | extracted text (via main process IPC) | `textParts` |
| `pdf` | PDF.js text extraction OR inline binary | `textParts` or `fileParts` |
| `audio` | file binary → `inline_data` | `fileParts` |
| `video` | file binary → `inline_data` | `fileParts` |

Per-source character cap (`SOURCE_CAP`) prevents a single oversized source from dominating
the prompt. `enrichThinDescs` uses a separate `SOURCE_CAP = 28000` to keep its re-enrichment
call within budget.

Both arrays are passed into `extractMindMapMultiPass(textParts, fileParts, ...)`.

---

## 4. Pipeline Dispatch

**Entry point:** `startGeneration()` ~L.2542

```javascript
if (appState.extractionMode === 'mindmap') {
    if (appState.multiPassMode) await extractMindMapMultiPass(...)
    else await extractMindMapIterative(...)
} else {
    // KG routing (not this document)
}
```

`MappAITruncationTracker.reset()` is called here before any LLM call.

---

## 5. Phase 1 — L1 Macro-area Identification

**Code location:** `app.js` ~L.2602 (iterative) and ~L.3148 (multiPass)

### Purpose
Identify 3-7 thematically distinct macro-areas that cover the source material.
Each L1 must be **monotopic** — if a candidate covers two ideas joined by a conjunction
("Neutralità e Difesa"), the template rule forces it to split before Phase 1 ends.

### Template
`L1_MACRO_CATEGORIES_IT` from `prompts_config.json`.

Key structural rules enforced by the template text:
- **ATOMICITÀ**: if a natural macro-area has two concepts joined by conjunction → split into two separate L1 nodes
- **TETTO 3-7**: generate 3 to 7 L1 areas, never fewer, never more
- **ambito / confini**: each L1 declares what content belongs to it (`ambito`) and what explicitly does NOT (`confini`), preventing Phase 3 branches from trespassing on each other

Variant `L1_MACRO_CATEGORIES_BERT_IT` exists (experimental, PERTINENZA rule for geographic anti-drift).
Selected by `localStorage.mappai_mm_logic`:
- `'mappai'` → standard template (default)
- `'bert'` → BERT variant
One-time migration at boot coerces `'bert'` → `'mappai'` (migration flag `mappai_mm_logic_migrated`).

### Schema — schemaL1

```javascript
const schemaL1 = {
    type: "ARRAY",
    maxItems: 7,          // hard cap on L1 count
    items: {
        type: "OBJECT",
        properties: {
            label:   { type: "STRING", maxLength: 60  },
            rel:     { type: "STRING", maxLength: 30  },
            ambito:  { type: "STRING", maxLength: 120 },
            // desc intentionally ABSENT — see §13 failure modes
            confini: { type: "STRING", maxLength: 180 }
        },
        required: ["label", "rel"]
    }
};
```

**Why `desc` is absent:** Gemini treats `maxLength` and `maxItems` as soft advisory constraints.
A `desc` field with narrative content (40-60 words target) caused the model to fill the entire
output budget on the first L1 item, exhausting tokens before emitting remaining L1 nodes.
`desc` is regenerated post-hoc by `enrichL1Descs` instead.
See §13 for the full failure mode analysis.

### Token budget
```javascript
const budget = window.getMaxOutputTokens(4096);
// gemini-2.5/3  → min(4096×2, 16384) = 8192
// other Google  → 4096
// Infomaniak    → 4096 (no multiplier)
```

Thinking is **OFF** (budget 8192 ≤ threshold 12288).

### Output
Raw JSON array parsed via `salvageTruncatedJSON`.
Each L1 becomes an `appState.db.nodes` entry (level=1, group=index) with
`desc = 'Categoria principale: ' + label` as placeholder (triggers `enrichL1Descs`).

---

## 6. Phase 1.5 — L1 Conservative Validation

**Gate:** `localStorage.mappai_l1_validation_enabled === 'true'`
**Code:** `validateL1Categories` ~L.4957

Conservative LLM call: can rename, reorder, or slightly merge L1 nodes.
**Anti-overcorrection guard:** if the returned set modifies >50% of original labels, the
result is discarded and the original Phase 1 output is kept unchanged.
Default behaviour: no change (explicit no-op JSON returned by model).

Budget: `getMaxOutputTokens(1500)` → 3000 on gemini-2.5. Thinking OFF.

---

## 7. Phase 1.6 — Compound L1 Splitting

**Gate:** `localStorage.mappai_l1_split_enabled === 'true'`
**Code:** `splitCompoundL1s` ~L.5093

Detection: `_isCompoundLabel(label)` — true if label contains ` e `, ` ed `, ` & `, or `/`.

For each compound label: one LLM call asking for either 2 atomic areas or 1 if inseparable.
Total L1 count is capped at `MAX_L1 = 7` after splitting.

This phase is the structured enforcement of the ATOMICITÀ rule when Phase 1 fails to split
a compound label on its own.

Budget: `getMaxOutputTokens(3000)` → 6000 on gemini-2.5. Thinking OFF.

---

## 8. enrichL1Descs — Post-Phase-1 Desc Regeneration

**Gate:** triggered automatically if any L1 node has `desc` matching `/^Categoria principale:/i`
(the placeholder set in Phase 1 node construction).
**Code:** `enrichL1Descs` ~L.4780

One LLM call per affected L1, asking for:
- `desc`: 40-60 word narrative explaining the thematic scope
- `confini`: explicit content boundaries (what does NOT belong here)

This separation (Phase 1 generates structure, enrichL1Descs generates description) was the key
architectural fix for the Phase 1 token runaway bug.

---

## 9. Phase 3 — Branch Expansion Loop

**Code:** `app.js` ~L.3377

One LLM call per L1 node, generating the full subtree (L2/L3/L4/L5 nodes + links).

### Sibling catalog injection
**Gate:** `localStorage.mappai_branch_boundaries_enabled === 'true'`

`buildSiblingL1Catalog` injects into each branch prompt the labels, `ambito`, and `confini`
of all OTHER L1 sibling areas. This prevents the model from placing content in the wrong
branch (anti-sconfinamento / anti-spillover).

### Schema — schemaBranch

```javascript
const schemaBranch = {
    nodes: {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                id:      { type: "STRING" },
                label:   { type: "STRING" },
                content: { type: "STRING" },   // short legacy field
                desc:    { type: "STRING" },   // rich study paragraph
                level:   { type: "INTEGER" }
            },
            required: ["id", "label", "level"]
        }
    },
    links: {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                source: { type: "STRING" },
                target: { type: "STRING" },
                rel:    { type: "STRING" }
            }
        }
    }
    // chunks field intentionally ABSENT (caused token inflation: model reproduced verbatim source text)
}
```

**Why `chunks` was removed:** When `chunks` was required, the model reproduced verbatim source
excerpts per node, inflating branch responses to 5000+ tokens for moderate branches.
`sourcesDict` is populated via a fallback from `desc` content post-generation.

### Budget
```javascript
const budget = window.getMaxOutputTokens(4096);
// gemini-2.5 → 8192
```

Thinking OFF (8192 ≤ 12288).

### Response parsing
Two paths based on `mappai_jsonl_enabled` flag:
- **JSON path** (default): raw JSON → `salvageTruncatedJSON`
- **JSONL path**: `parseJSONLResponse` → sections `===NODES===` + `===LINKS===`

Both paths record truncation events via `MappAITruncationTracker.record(evt)`.

---

## 10. Phase 4 — Consolidation (Merges + Cross-links)

**Gate:** `localStorage.mappai_mm_phase4_enabled === 'true'`
**Code:** `buildPhase4Prompt` ~L.5183, `executePhase4Consolidation` ~L.5264

### Purpose
After all branches are generated independently, Phase 4 looks for:
- **Duplicate nodes** that appear in multiple branches under different labels → merge
- **Semantic cross-links** connecting concepts across branches that belong together

### Input to LLM
Compact catalog of ALL nodes (id, level, label, first 60 chars of desc) +
`l1Catalog` with `ambito` for context.

### Output format — JSONL
```
===MERGES===
{"drop":"node_id_A","keep":"node_id_B","reason":"..."}
===CROSSLINKS===
{"source":"node_id_X","target":"node_id_Y","rel":"causa","reason":"..."}
```

Parsed by `parseJSONLResponse` with section keys `merges` + `crosslinks`.

### Budget
```javascript
getMaxOutputTokens(6500) → 13000 on gemini-2.5
```

**Thinking is ON** (13000 > 12288 threshold). This is intentional: Phase 4 requires
genuine semantic reasoning across the full node catalog to detect non-obvious duplicates.
Thinking tokens are consumed from the budget, not the output count.

### Application
- Merges: `executeMerge(drop, keep)` from `mappai-node-merge.js` (remaps all links, recalcs levels + groups)
- Cross-links: added as new `appState.db.links` with the specified `rel`
- ID resolution: `idByNorm` map handles model returning normalized/fuzzy IDs
- Max: 20 merges, 20 cross-links per run

---

## 11. Phase 5 — Reclassification

**Gate:** `localStorage.mappai_mm_phase5_enabled === 'true'`
**Code:** `buildPhase5Prompt` ~L.4543, `executePhase5Reclassification` ~L.4627

Identifies L2/L3 nodes placed in the wrong macro-area. For example, a node "Treaty of Paris"
placed under "Military Defense" when it semantically belongs under "Political Neutrality".

### Output format
```
===RECLASSIFY===
{"nodeId":"...", "fromL1":"...", "toL1":"...", "reason":"..."}
```

### Safeguard
Will not reclassify if the source branch has ≤ 2 L2 children (would leave branch near-empty).

Budget: `getMaxOutputTokens(1500)` → 3000. Thinking OFF.

---

## 12. TreeSanitizer

**File:** `public/js/mappai-tree-sanitizer.js` (312 lines)
**Gate:** enabled by default; `localStorage.mappai_tree_sanitizer_disabled === 'true'` disables
**Namespace:** `window.MappAITreeSanitizer` + `window.sanitizeMindMapTree()`

Zero AI calls. 7 deterministic repair steps applied in order:

| Step | Name | Action |
|---|---|---|
| 1 | Normalize D3 objects | Resolve D3 link `.source`/`.target` from object references to string IDs |
| 2 | Dissolve solitary wrapper L1 | If ONE Phase-1 L1 node has ≥2 children → promote children to L1, merge wrapper desc into ROOT |
| 3 | Remove L1→L1 links | Phase 4 cross-links sometimes create L1-to-L1 connections (semantically invalid in MindMap) |
| 4 | Single-parent enforcement | Nodes with multiple parents → `_pickBestParent` keeps parent whose L1 label most closely matches node's ID prefix |
| 5 | BFS level recalculation | Re-derives `node.level` from graph structure (not from LLM-assigned values) |
| 6 | Group renumber after dissolve | Re-assigns `node.group` integers after wrapper dissolution changes L1 count |
| 7 | Group propagation from L1 ancestor | Walk each subtree from L1 root; every descendant inherits `group` of its L1 ancestor |

The sanitizer is idempotent — running it twice produces the same result.

---

## 13. enrichThinDescs — Final Desc Safety Net

**Gate:** `localStorage.mappai_enrich_descs_enabled === 'true'`
**Code:** `enrichThinDescs` ~L.4891

After all generation phases, nodes whose `desc` is under 35 words get a rewrite.

- Batch: 6 nodes per LLM call
- Budget: `getMaxOutputTokens(2048)` → 4096
- Source-anchored: source text (capped at `SOURCE_CAP = 28000` chars) is injected → no hallucination, rewrites stay faithful to source
- Target: 50-80 word rich study paragraphs

This is the last gate before render. A node that escaped Phase 1 enrichment and Phase 3
desc generation will be caught here.

---

## 14. Token Budget System

### `getMaxOutputTokens(base)` — `app.js` ~L.1780

```javascript
window.getMaxOutputTokens = function(baseTokens) {
    if (!baseTokens) baseTokens = 4096;
    const model = /* from DOM #ai-model-select or localStorage */;

    if (appState.aiProvider === 'infomaniak') {
        if (model.includes('qwen') || model.includes('kimi'))
            return Math.max(baseTokens, 16384);
        if (model.includes('mistral'))
            return Math.max(baseTokens, 8192);
        return baseTokens;   // gemma, apertus: no multiplier
    }

    // Google
    if (model.includes('gemini-2.5') || model.includes('gemini-3'))
        return Math.min(baseTokens * 2, 16384);

    return baseTokens;
};
```

### Per-phase budget table

| Phase | Base | gemini-2.5 effective | Thinking |
|---|---|---|---|
| Phase 1 (L1 gen) | 4096 | **8192** | OFF |
| Phase 1.5 (validate) | 1500 | 3000 | OFF |
| Phase 1.6 (split) | 3000 | 6000 | OFF |
| enrichL1Descs | ~1000/L1 | ~2000/L1 | OFF |
| Phase 3 (branch) | 4096 | **8192** | OFF |
| Phase 4 (consolidation) | 6500 | **13000** | **ON** |
| Phase 5 (reclassify) | 1500 | 3000 | OFF |
| enrichThinDescs | 2048 | 4096 | OFF |
| KG Community | 8192 | **16384** | **ON** |

### Thinking budget injection — `fetchModelAPI` ~L.1894

Thinking is injected (suppressed) automatically:

```javascript
if (appState.aiProvider === 'google'
    && model.match(/gemini-2\.5|gemini-3/)
    && maxOutputTokens > 0
    && maxOutputTokens <= 12288)
{
    payload.generationConfig.thinkingConfig = { thinkingBudget: 0 };
}
```

**Why suppress thinking for most phases:**
- Thinking tokens come out of `maxOutputTokens`
- A 8192 budget with unconstrained thinking → only ~2000 tokens left for actual JSON output
- Phases 1/3/5 need maximum JSON output tokens, not reasoning
- Phase 4 at 13000 > 12288 → thinking preserved intentionally (quality merges need reasoning)
- KG Community at ~16000 > 12288 → thinking preserved

**Critical invariant:** if you adjust any phase budget, verify whether it crosses the 12288 threshold.
Crossing upward enables thinking (may reduce JSON output headroom).
Crossing downward disables thinking (may improve JSON output volume).

---

## 15. Truncation Management

### `MappAITruncationTracker` — `app.js` ~L.1819

Tracks truncation events per generation run.

```javascript
MappAITruncationTracker.reset()           // call at generation start
MappAITruncationTracker.record(evt)       // call after each LLM response
MappAITruncationTracker.report()          // returns {total, byPhase, truncated}
```

Each `evt` has: `phase`, `model`, `finishReason`, `tokensOut`, `maxTokens`, `truncated`.

### `_detectTruncation(response)` — `app.js` ~L.1840

Provider-specific finish-reason mapping:

| Provider | Truncation signal |
|---|---|
| Google (Gemini) | `finishReason === 'MAX_TOKENS'` |
| Infomaniak (OpenAI-compat) | `finish_reason === 'length'` |

### `salvageTruncatedJSON` — extracted to `mappai-json-salvage.js`

Stack-based bracket balancer. Given a response that ends mid-JSON, it:
1. Strips markdown fences (` ```json ` etc.)
2. Fixes unquoted keys
3. Removes trailing commas
4. Tracks open `{` / `[` with a stack
5. At the last complete closing bracket, truncates the string and closes remaining open brackets
6. Returns the largest valid prefix

Used as the fallback for ALL `JSON.parse` calls on AI responses.
**Never use `JSON.parse` directly** on AI output — always call `salvageTruncatedJSON` first.

### `parseJSONLResponse` — `app.js` ~L.4034

Section-aware JSONL parser for Phase 3 (JSONL mode), Phase 4, and Phase 5 responses.

Architecture:
1. Splits on section header regex: `===SECTION_NAME===`
2. For each section, attempts 3 parse strategies per line:
   - **Direct**: `JSON.parse(line)` after `salvageTruncatedJSON`
   - **Double-escape recovery**: fixes `\\n` → `\n` inside strings (Mistral artifact)
   - **Inline newline removal**: collapses embedded newlines in JSON strings
3. `normalizeKeys` handles Mistral key-space bugs: `"source id"` → `"sourceId"`, etc.
4. Recovered/lost counts per section are logged for diagnostics

Supported section names: `NODES`, `LINKS`, `MERGES`, `CROSSLINKS`, `RECLASSIFY`.

---

## 16. Provider Differences

| Feature | Google (Gemini) | Infomaniak (OpenAI-compat) |
|---|---|---|
| `responseMimeType: "application/json"` | ✅ supported | ❌ converted to text reminder → harmful, distorts context |
| `responseSchema` | ✅ enforced | ❌ causes empty response (0 chars) on some models |
| Streaming | optional | ✅ SSE mandatory (bypasses Gateway Timeout) |
| `temperature` | respected | hardcoded 0.3 in bridge (ignores payload value) |
| Thinking | ✅ `thinkingConfig.thinkingBudget` | N/A |
| `getMaxOutputTokens` multiplier | ×2 on gemini-2.5/3 (cap 16384) | depends on model (Qwen/Kimi: max 16384, Mistral: max 8192, others: base) |
| JSON schema enforcement | hard (output matches schema) | soft (model may deviate) |

**Key rule:** do NOT add `responseMimeType` or `responseSchema` to any payload sent to Infomaniak.
See `docs/rules/03-json-from-ai.md` for the full rule.

The `window.InfomaniakBridge.translatePayload(geminiPayload, model)` function in
`infomaniak_bridge.js` converts Gemini-format payloads to OpenAI-compat format.

---

## 17. Feature Flags

All flags are `localStorage` keys. All default OFF unless noted.

| Flag key | Phase affected | Default | Console command |
|---|---|---|---|
| `mappai_l1_validation_enabled` | Phase 1.5 | OFF | `MappAIMetrics.enableL1Validation()` |
| `mappai_l1_split_enabled` | Phase 1.6 | OFF | `MappAIMetrics.enableL1Split()` |
| `mappai_branch_boundaries_enabled` | Phase 3 sibling catalog + enrichL1Descs | OFF | `MappAIMetrics.enableBranchBoundaries()` |
| `mappai_jsonl_enabled` | Phase 3 JSONL path | OFF | `MappAIMetrics.enableJSONL()` |
| `mappai_mm_phase4_enabled` | Phase 4 | OFF | `MappAIMetrics.enablePhase4()` |
| `mappai_mm_phase5_enabled` | Phase 5 | OFF | `MappAIMetrics.enablePhase5()` |
| `mappai_enrich_descs_enabled` | enrichThinDescs | OFF | `MappAIMetrics.enableEnrichDescs()` |
| `mappai_freeze_chunks` | sourcesDict save | OFF | `MappAIMetrics.enableChunkFreeze()` |
| `mappai_tree_sanitizer_disabled` | TreeSanitizer | ON (disabled=false) | (set manually) |
| `mappai_dissolve_wrapper_l1` | TreeSanitizer step 2 | OFF | (set manually) |
| `mappai_kg_community_mode` | KG routing | OFF | `MappAIMetrics.enableCommunityKG()` |
| `mappai_mm_logic` | L1 template selection | `'mappai'` | (set manually) |

`MappAIMetrics.report()` copies a markdown metrics report to clipboard.

---

## 18. Schema Reference Summary

### schemaL1 (Phase 1 output per item)
```
label    STRING  maxLength:60   — thematic label, must be atomic
rel      STRING  maxLength:30   — relation to parent (root node)
ambito   STRING  maxLength:120  — what content belongs in this branch
confini  STRING  maxLength:180  — what content does NOT belong here
```
`desc` intentionally absent (runaway risk). Regenerated by `enrichL1Descs`.

### schemaBranch (Phase 3 output)
```
nodes[]:
  id      STRING   — unique per-generation ID (e.g. "L1_0_L2_A")
  label   STRING
  content STRING   — short legacy summary (kept for backwards compat)
  desc    STRING   — rich study paragraph (50-80 words target)
  level   INTEGER  — 2-5 (L1 is the parent, generated separately)

links[]:
  source  STRING   — node ID
  target  STRING   — node ID
  rel     STRING   — relation verb
```
`chunks` absent — caused verbatim source reproduction and token inflation.

### JSONL sections (Phases 4, 5)
```
Phase 4 ===MERGES===:    {"drop":"id","keep":"id","reason":"..."}
Phase 4 ===CROSSLINKS===:{"source":"id","target":"id","rel":"...","reason":"..."}
Phase 5 ===RECLASSIFY===:{"nodeId":"id","fromL1":"id","toL1":"id","reason":"..."}
```

---

## 19. Known Failure Modes & Mitigations

### F1 — Phase 1 token runaway (RESOLVED — June 2026)
**Symptom:** `finishReason=MAX_TOKENS`, only 1 L1 node generated, rest truncated.
**Pattern:** `out=5988/6000`, `out=8180/8192` — always budget−12 tokens.
**Root cause:** Gemini treats `maxLength` and `maxItems` as soft advisory constraints.
A long-form `desc` field (~40-60 word narrative) causes the model to write 6000-8000 tokens
on a single L1 item, exhausting the entire budget. `maxLength` limits string length,
but the model still consumes tokens up to the budget ceiling.
**Fix:** Remove `desc` from `schemaL1` entirely. Regenerate via `enrichL1Descs` post-Phase-1.
**Lesson:** Never include narrative/long-form fields in schemas where the model might be token-constrained.
Keep Phase 1 schema to short, bounded fields only.

### F2 — Gemini Pro response truncation
**Symptom:** `"Unexpected end of JSON input"` on Pro model responses.
**Cause:** `maxOutputTokens` too low for large KG responses on Pro models.
**Fix:** Increase `maxOutputTokens` to 16384 for Pro models.

### F3 — Infomaniak `responseSchema` → empty response
**Symptom:** 0-character response on Kimi-K2.6 when `responseSchema` is in payload.
**Fix:** Never include `responseSchema` in payloads going to Infomaniak.
The bridge converts `responseMimeType` to a text reminder, which distorts context;
`responseSchema` causes empty output. Both removed from KG phases for Infomaniak.

### F4 — Phase 4 CROSSLINKS only, no real merges
**Symptom:** Phase 4 generates semantic cross-links but doesn't detect true duplicates.
**Cause:** Phase 4 can only find what Phase 3 created. If Phase 3 generated genuinely
distinct nodes (good outcome), Phase 4 correctly produces few merges.
**Current status:** Under evaluation. May disable `===CROSSLINKS===` section in Phase 4
and rely only on `===MERGES===` — cross-links should emerge from merge semantics, not
be generated synthetically.

### F5 — Post-Phase-5 id/level label mismatch
**Symptom:** A node reclassified from L3 to a different branch retains its old ID
(e.g. `L1_0_L3_B1`) while its level is now 2 or 3 under the new parent.
**Impact:** Cosmetic / diagnostic only. No functional breakage.
**Status:** Known, not prioritized.

### F6 — KG + Infomaniak/GEMMA → sparse graph (13 nodes instead of expected ~38)
**Symptom:** Only 13 nodes generated, density ~1.31 vs expected ~2.0.
**Cause:** `responseMimeType:"application/json"` converted by bridge to text reminder,
misaligns model attention on JSON structure.
**Status:** Open. Branch needed to conditionally remove `responseMimeType`+`responseSchema`
when `aiProvider==='infomaniak'`.

---

## 20. Diagnostics & Testing

### MAPPAI_TRACE mode
Forwards all renderer `console.log/warn/error` to the terminal:
```bash
MAPPAI_TRACE=1 npm start 2>&1 | tee /tmp/run.log
```
Implemented in `main.js` via `mainWindow.webContents.on('console-message', ...)`.

### MappAIMetrics toolkit (browser console)
```javascript
MappAIMetrics.report()          // markdown metrics to clipboard
MappAIMetrics.enablePhase4()    // toggle flags at runtime
MappAIMetrics.disablePhase4()
```
Output includes: total tokens (in/out), truncation count by phase,
node count, maxLevel, density, cross-link %, relation type count,
sourceCov %, generic relation %.

### MappAIStructureAnalyzer (browser console)
```javascript
MappAIStructureAnalyzer.analyzeCurrentMap()
// returns: { suggestions, stats }
// stats: { density, mode, topology }
```
Zero AI calls. Runs structural heuristics: god nodes, leaf isolation,
underutilized clusters, Tarjan bridges (on networked graphs), betweenness.

### Validated production baseline (9 June 2026 — gemini-2.5-flash)

**Multi-pass MindMap:**
- `truncated: 0/22` branch calls
- 77 nodes, 6 L1, maxLevel 5
- density 1.221, 25.5% cross-links
- sourceCov 90.9%, 0% generic relations

**KG Community:**
- ~38 nodes, density ~1.7, ~47% cross-links
- ~29 relation types, 0% generic
- sourceCov ~89%

---

## 21. File Map

| File | What's in it | Lines (approx) |
|---|---|---|
| `public/js/app.js` | Monolith: all extraction phases, AI client, state, D3 render | ~16 000 |
| `public/js/mappai-tree-sanitizer.js` | TreeSanitizer — 7 deterministic steps | 312 |
| `public/js/mappai-node-merge.js` | executeMerge, executeRelink, _recalcLevels/_Groups | ~400 |
| `public/js/dev-console-metrics.js` | MappAIMetrics + DevSelfTest + feature flag toggles | ~170 |
| `public/js/infomaniak_bridge.js` | Gemini→OpenAI payload translation | ~200 |
| `public/js/admin_prompts.js` | Template resolution (fillPromptTemplate) | ~150 |
| `prompts_config.json` | Active prompt templates | — |
| `public/prompts_default.json` | Default prompt templates (reset target) | — |
| `main.js` | Electron main process, IPC handlers, MAPPAI_TRACE | ~970 |

---

_Document maintained by Giacomo Meschini — giacomo@insegnai.ch_
_For questions on AI provider integration: see `docs/rules/01-ai-client.md` and `docs/rules/02-infomaniak-bridge.md`_
_For JSON recovery rules: `docs/rules/03-json-from-ai.md`_
_For token budget rules: `docs/rules/05-token-budget-and-thinking.md`_
