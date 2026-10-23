// Self-healing NVIDIA NIM model selection (Node). PREFERRED_MODELS is shared with
// supabase/functions/chat/index.ts via supabase/functions/_shared/models.json. NIM has retired models twice and /v1/models still
// lists some that 404, so: live list + probe + mark-bad-on-404 + fall through.
import { readFileSync } from 'node:fs';

export const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

// Ranked list: single source in supabase/functions/_shared/models.json (also used by the chat edge function).
export const PREFERRED_MODELS = JSON.parse(
  readFileSync(new URL('../supabase/functions/_shared/models.json', import.meta.url), 'utf8'),
).preferred;

const EXCLUDE = /embed|rerank|retriever|vision|-vl|vlm|guard|safety|reward|code|starcoder|parse|clip|translate|detector|calibration|omni|deplot|kosmos|fuyu|neva|vila|diffusion|synthetic/i;
const INCLUDE = /instruct|nemotron|-it$|chat/i;
const sizeOf = (id) => Math.max(0, ...[...id.matchAll(/(\d+(?:\.\d+)?)b\b/gi)].map((m) => Number(m[1])));

// Generic large chat model from the live list, by name heuristics, biggest first.
export function heuristicModels(liveIds) {
  return liveIds.filter((id) => INCLUDE.test(id) && !EXCLUDE.test(id)).sort((a, b) => sizeOf(b) - sizeOf(a));
}

export async function listModels(key, timeoutMs = 8000) {
  try {
    const r = await fetch(`${NIM_BASE}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return ((await r.json()).data || []).map((m) => m.id);
  } catch { return null; }
}

// Healed choice written daily by model-health (evals/results/model-health.json).
export function healedModels() {
  try {
    const j = JSON.parse(readFileSync(new URL('./results/model-health.json', import.meta.url), 'utf8'));
    return [j.primary, j.fallback].filter(Boolean);
  } catch { return []; }
}

// Ordered candidate list: overrides, preferred present in live list, then heuristics.
export function rankCandidates(liveIds, overrides = [], bad = new Set()) {
  const pref = [...new Set([...overrides.filter(Boolean), ...PREFERRED_MODELS])];
  let out;
  if (!liveIds) out = pref;
  else {
    const live = new Set(liveIds);
    out = pref.filter((m) => live.has(m));
    if (!out.length) out = heuristicModels(liveIds);
  }
  return out.filter((m) => !bad.has(m));
}

// Non-streaming chat with fall-through. Returns { model, data } or throws.
const bad = new Set();
let cached = null;
export async function nimChat(key, body, { overrides = [], attempts = 3, timeoutMs = 60000 } = {}) {
  if (!cached) cached = await listModels(key);
  const cands = rankCandidates(cached, overrides, bad).slice(0, attempts);
  let lastErr = new Error('no NIM candidates');
  for (const model of cands) {
    try {
      const r = await fetch(`${NIM_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ ...body, model, chat_template_kwargs: { enable_thinking: false } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.status === 404 || r.status === 410) { bad.add(model); lastErr = new Error(`${model} HTTP ${r.status}`); continue; }
      if (!r.ok) { lastErr = new Error(`${model} HTTP ${r.status}`); continue; }
      return { model, data: await r.json() };
    } catch (e) { lastErr = new Error(`${model}: ${e.message || e}`); }
  }
  throw lastErr;
}

// 1-token-ish probe (some models need room before emitting content).
export async function probe(key, model, timeoutMs = 30000) {
  const t = Date.now();
  try {
    const r = await fetch(`${NIM_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with just: OK' }], max_tokens: 16, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t;
    if (!r.ok) return { model, ok: false, status: r.status, ms };
    const j = await r.json();
    return { model, ok: Array.isArray(j.choices) && j.choices.length > 0, status: r.status, ms };
  } catch (e) { return { model, ok: false, status: String(e.name || e), ms: Date.now() - t }; }
}
