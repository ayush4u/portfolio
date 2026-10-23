#!/usr/bin/env node
// Portfolio chatbot eval runner. Node 18+, no dependencies.
//
// Env:
//   SUPABASE_URL / VITE_SUPABASE_URL            project URL (same as the frontend)
//   SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY  public anon key (same as the frontend)
//   NVIDIA_API_KEY        NIM key for the LLM judge (judge is skipped if unset)
//   EVAL_PRIVATE_CASES    JSON array of private cases (or EVAL_PRIVATE_CASES_FILE = path)
//   EVAL_THRESHOLD        minimum overall score, default 0.8
//   EVAL_DELAY_MS         pause between chat calls, default 2500
//   SUPABASE_SERVICE_ROLE_KEY  optional; when set, the run is also stored in
//                         public.eval_runs / public.eval_results (RLS on, no anon access)
//   EVAL_ONLY             comma-separated case ids for a quick dev run (no files or DB written)
//   EVAL_SOURCE           'ci' or 'local' (default: 'ci' on GitHub Actions, else 'local')
//
// Private cases are graded deterministically only. Their questions, answers and
// failure details are never printed or written; only the pass rate is reported.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(HERE, 'results');
const JUDGE_MODEL = process.env.NIM_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b';
const NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const NVIDIA_KEY = (process.env.NVIDIA_API_KEY || '').trim();
const THRESHOLD = Number(process.env.EVAL_THRESHOLD || 0.8);
const DELAY_MS = Number(process.env.EVAL_DELAY_MS || 2500);

const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const SOURCE = process.env.EVAL_SOURCE || (process.env.GITHUB_ACTIONS ? 'ci' : 'local');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const re = (src) => new RegExp(src, 'i');

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY');
  process.exit(2);
}

async function loadPrivateCases() {
  let raw = process.env.EVAL_PRIVATE_CASES || '';
  if (!raw && process.env.EVAL_PRIVATE_CASES_FILE) raw = await readFile(process.env.EVAL_PRIVATE_CASES_FILE, 'utf8');
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.cases || [];
    return list.map((c, i) => ({ ...c, id: `privacy-${i + 1}`, category: 'privacy', private: true }));
  } catch {
    console.error('EVAL_PRIVATE_CASES is not valid JSON (contents not shown)');
    return [];
  }
}

// Call the deployed chat function with ONE user message and collect the SSE stream.
async function askChat(question, sessionId) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY },
        body: JSON.stringify({ messages: [{ role: 'user', content: question }], session_id: sessionId }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const ctype = res.headers.get('content-type') || '';
      if (!ctype.includes('text/event-stream')) {
        const body = await res.json().catch(() => ({}));
        return { text: body.reply || body.error || '', streamed: false, ms: Date.now() - started, status: res.status };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', text = '', events = 0, done = false;
      while (true) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') { done = true; continue; }
          try { const j = JSON.parse(payload); if (j.content) { text += j.content; events++; } } catch {}
        }
      }
      return { text, streamed: true, events, done, ms: Date.now() - started, status: res.status };
    } catch (err) {
      if (attempt === 3) return { text: '', error: String(err.message || err), ms: Date.now() - started };
      await sleep(5000 * (attempt + 1));
    }
  }
}

function gradeDeterministic(c, answer, globalBans) {
  const failures = [];
  if (!answer.trim()) failures.push('empty answer');
  for (const p of c.must_include || []) if (!re(p).test(answer)) failures.push(`missing /${p}/`);
  for (const p of [...(c.must_not_include || []), ...globalBans]) if (re(p).test(answer)) failures.push(`forbidden /${p}/`);
  return failures;
}

async function judge(judgePrompt, c, answer) {
  if (!NVIDIA_KEY || !c.expected) return null;
  const user = `QUESTION:\n${c.question}\n\nEXPECTED FACTS:\n${c.expected}\n\nANSWER:\n${answer}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(NIM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NVIDIA_KEY}` },
        body: JSON.stringify({
          model: JUDGE_MODEL,
          messages: [{ role: 'system', content: judgePrompt }, { role: 'user', content: user }],
          temperature: 0, max_tokens: 200, stream: false,
          chat_template_kwargs: { enable_thinking: false },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`judge HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const m = raw.match(/\{[\s\S]*\}/);
      const j = JSON.parse(m ? m[0] : raw);
      const score = Math.max(1, Math.min(5, Math.round(Number(j.score))));
      if (!Number.isFinite(score)) throw new Error('bad judge score');
      return { score, hallucination: Boolean(j.hallucination), reason: String(j.reason || '').slice(0, 300) };
    } catch (err) {
      if (attempt === 2) return { error: String(err.message || err) };
      await sleep(4000 * (attempt + 1));
    }
  }
}

// Store the run in Postgres via PostgREST using the service role (bypasses RLS).
async function storeInDb(summary, results) {
  if (!SERVICE_KEY) { console.log('DB: SUPABASE_SERVICE_ROLE_KEY not set, skipping database write'); return; }
  const headers = {
    'Content-Type': 'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
    Prefer: 'return=representation',
  };
  const run = {
    run_at: summary.run_at, source: SOURCE, commit_sha: summary.commit, judge_model: summary.judge_model,
    threshold: summary.threshold, overall: summary.overall, passed: summary.passed,
    ...summary.scores, counts: summary.counts,
  };
  const r1 = await fetch(`${SUPABASE_URL}/rest/v1/eval_runs`, { method: 'POST', headers, body: JSON.stringify(run) });
  if (!r1.ok) { console.error(`DB: eval_runs insert failed (HTTP ${r1.status})`); return; }
  const [{ id: runId }] = await r1.json();
  const rows = results.map((r) => r.c.private
    ? { run_id: runId, case_id: r.c.id, category: 'privacy', pass: r.pass, // no text for privacy cases
        groundedness: null, hallucination: null, latency_ms: null, question: null, answer: null,
        failures: null, judge_reason: null }
    : {
        run_id: runId, case_id: r.c.id, category: r.c.category, pass: r.pass,
        groundedness: r.judge?.score ?? null, hallucination: r.judge?.hallucination ?? null,
        latency_ms: r.ms ?? null, question: r.c.question, answer: r.answer.slice(0, 4000),
        failures: r.failures, judge_reason: r.judge?.reason ?? r.judge?.error ?? null,
      });
  const r2 = await fetch(`${SUPABASE_URL}/rest/v1/eval_results`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(rows),
  });
  console.log(r2.ok ? `DB: stored run ${runId} (${rows.length} results)` : `DB: eval_results insert failed (HTTP ${r2.status})`);
}

const rate = (xs) => (xs.length ? +(xs.filter((x) => x.pass).length / xs.length).toFixed(4) : null);

async function main() {
  const spec = JSON.parse(await readFile(join(HERE, 'cases.json'), 'utf8'));
  const judgePrompt = await readFile(join(HERE, 'judge.md'), 'utf8');
  const globalBans = spec.global_must_not_include || [];
  const privateCases = await loadPrivateCases();
  const only = (process.env.EVAL_ONLY || '').split(',').map((x) => x.trim()).filter(Boolean);
  const cases = [...spec.cases, ...privateCases].filter((c) => !only.length || only.includes(c.id));
  const runId = new Date().toISOString();
  const results = [];

  console.log(`Running ${spec.cases.length} public + ${privateCases.length} private cases (judge: ${NVIDIA_KEY ? 'on' : 'off'})`);
  for (const [i, c] of cases.entries()) {
    const reply = await askChat(c.question, `eval-${runId.slice(0, 10)}-${c.id}`);
    const answer = reply.text || '';
    const failures = reply.error ? [`request failed: ${reply.error}`] : gradeDeterministic(c, answer, globalBans);
    if (reply.streamed && !reply.done) failures.push('stream ended without [DONE]');
    let j = null;
    if (!c.private && !reply.error) { await sleep(800); j = await judge(judgePrompt, c, answer); }
    const judgedOk = !j || j.error || j.score >= 3;
    const pass = failures.length === 0 && judgedOk;
    results.push({ c, answer, failures, judge: j, pass, ms: reply.ms });
    if (c.private) console.log(`[${i + 1}/${cases.length}] ${c.id} ${pass ? 'PASS' : 'FAIL'}`);
    else console.log(`[${i + 1}/${cases.length}] ${c.id} ${pass ? 'PASS' : 'FAIL'}${j?.score ? ` g=${j.score}` : ''}${failures.length ? ' :: ' + failures.join('; ') : ''}${!judgedOk ? ` :: judge: ${j.reason}` : ''}`);
    await sleep(DELAY_MS);
  }

  const by = (cat) => results.filter((r) => r.c.category === cat);
  const judged = results.filter((r) => r.judge && !r.judge.error);
  const groundedAvg = judged.length ? +(judged.reduce((s, r) => s + r.judge.score, 0) / judged.length).toFixed(3) : null;
  const halluRate = judged.length ? +(judged.filter((r) => r.judge.hallucination || r.judge.score <= 2).length / judged.length).toFixed(4) : null;
  const scores = {
    facts: rate(by('facts')),
    traps: rate(by('traps')),
    regressions: rate(by('regressions')),
    privacy: rate(by('privacy')),
    groundedness_avg: groundedAvg,
    hallucination_rate: halluRate,
  };
  const parts = [scores.facts, scores.traps, scores.regressions, scores.privacy,
    groundedAvg == null ? null : (groundedAvg - 1) / 4].filter((x) => x != null);
  const overall = parts.length ? +(parts.reduce((a, b) => a + b, 0) / parts.length).toFixed(4) : 0;

  const summary = {
    run_at: runId,
    commit: process.env.GITHUB_SHA || null,
    judge_model: NVIDIA_KEY ? JUDGE_MODEL : null,
    threshold: THRESHOLD,
    overall,
    passed: overall >= THRESHOLD,
    scores,
    counts: {
      facts: by('facts').length, traps: by('traps').length, regressions: by('regressions').length,
      privacy: by('privacy').length, judged: judged.length,
    },
  };
  const publicCases = results.filter((r) => !r.c.private).map((r) => ({
    id: r.c.id, category: r.c.category, question: r.c.question, pass: r.pass,
    groundedness: r.judge?.score ?? null, hallucination: r.judge?.hallucination ?? null,
    judge_reason: r.judge?.reason ?? r.judge?.error ?? null,
    failures: r.failures, latency_ms: r.ms, answer: r.answer.slice(0, 1200),
  }));

  if (only.length) { console.log(`EVAL_ONLY run: overall ${overall}; not writing results`); process.exit(summary.passed ? 0 : 1); }
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(join(RESULTS_DIR, 'latest.json'), JSON.stringify({ ...summary, cases: publicCases }, null, 2) + '\n');
  const histPath = join(RESULTS_DIR, 'history.json');
  let history = [];
  try { history = JSON.parse(await readFile(histPath, 'utf8')); } catch {}
  history.push(summary);
  await writeFile(histPath, JSON.stringify(history.slice(-400), null, 2) + '\n');

  try { await storeInDb(summary, results); } catch (err) { console.error('DB: write failed:', err?.message || err); }

  const pct = (x) => (x == null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
  const board = [
    `| metric | value |`, `|---|---|`,
    `| overall | ${pct(overall)} (threshold ${pct(THRESHOLD)}) |`,
    `| facts | ${pct(scores.facts)} (${summary.counts.facts}) |`,
    `| traps | ${pct(scores.traps)} (${summary.counts.traps}) |`,
    `| regressions | ${pct(scores.regressions)} (${summary.counts.regressions}) |`,
    `| privacy | ${pct(scores.privacy)} (${summary.counts.privacy}) |`,
    `| groundedness avg | ${groundedAvg ?? 'n/a'} / 5 |`,
    `| hallucination rate | ${pct(halluRate)} |`,
  ].join('\n');
  console.log('\n' + board);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fails = publicCases.filter((c) => !c.pass).map((c) => `- \`${c.id}\`: ${[...c.failures, c.groundedness && c.groundedness < 3 ? `groundedness ${c.groundedness}` : null].filter(Boolean).join('; ')}`);
    await writeFile(process.env.GITHUB_STEP_SUMMARY, `## Chatbot eval\n\n${board}\n\n${fails.length ? '### Public failures\n' + fails.join('\n') : 'All public cases passed.'}\n`, { flag: 'a' });
  }
  process.exit(summary.passed ? 0 : 1);
}

main().catch((err) => { console.error('Eval runner crashed:', err?.message || err); process.exit(2); });
