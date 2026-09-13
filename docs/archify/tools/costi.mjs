// Aggrega il registro consumi AI (JSONL, una riga per chiamata) per cat/sub.
// Uso: node docs/archify/tools/costi.mjs [percorso consumi-ai.jsonl] → JSON su stdout.
// Prezzi USD per 1M token, presi da MODEL_KB (mappai-ui-modals.js); modelli ignoti → tariffa flash.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const file = process.argv[2] || path.join(os.homedir(), 'Documents/MappAI - file/Registro consumi AI/consumi-ai.jsonl');
const PRICE = { 'gemini-2.5-flash': [0.15, 0.60], 'gemini-2.5-pro': [1.25, 10], 'gemini-flash-lite': [0.10, 0.40] };
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
const agg = {};
for (const r of rows) {
  const k = `${r.cat || '?'}/${r.sub || '?'}`;
  const a = agg[k] ||= { calls: 0, inTok: 0, outTok: 0, thoughts: 0, usd: 0, maxTokens: 0, gens: new Set() };
  const [pi, po] = PRICE[r.model] || PRICE['gemini-2.5-flash'];
  a.calls++; a.inTok += r.inTok || 0; a.outTok += r.outTok || 0; a.thoughts += r.thoughts || 0;
  a.usd += ((r.inTok || 0) * pi + ((r.outTok || 0) + (r.thoughts || 0)) * po) / 1e6;
  if (r.stop === 'MAX_TOKENS') a.maxTokens++;
  a.gens.add(`${r.project || ''}|${(r.ts || '').slice(0, 13)}`); // ponytail: "generazione" ≈ progetto+ora, non c'è un id di run
}
const total = Object.values(agg).reduce((s, a) => s + a.usd, 0);
const out = Object.fromEntries(Object.entries(agg).sort((x, y) => y[1].usd - x[1].usd).map(([k, a]) => [k, {
  calls: a.calls, inTok: a.inTok, outTok: a.outTok, thoughts: a.thoughts, usd: +a.usd.toFixed(2), share: +(100 * a.usd / total).toFixed(1),
  inPerCall: Math.round(a.inTok / a.calls), gens: a.gens.size, callsPerGen: +(a.calls / a.gens.size).toFixed(1), maxTokens: a.maxTokens,
}]));
console.log(JSON.stringify({ file, calls: rows.length, from: rows[0]?.ts, to: rows.at(-1)?.ts, totalUsd: +total.toFixed(2), byPhase: out }, null, 2));
