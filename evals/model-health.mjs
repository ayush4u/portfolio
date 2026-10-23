#!/usr/bin/env node
// Daily NIM model health check (see .github/workflows/model-health.yml).
// Lists live NIM models, probes the ranked shortlist, picks primary + fallback,
// writes evals/results/model-health.json and GitHub outputs. Exit 1 if nothing works.
import { writeFile, readFile, appendFile } from 'node:fs/promises';
import { listModels, rankCandidates, heuristicModels, probe, PREFERRED_MODELS } from './nim-models.mjs';

const KEY = (process.env.NVIDIA_API_KEY || '').trim();
if (!KEY) { console.error('NVIDIA_API_KEY missing'); process.exit(2); }
const OUT = new URL('./results/model-health.json', import.meta.url);

const live = await listModels(KEY, 20000);
console.log(`live NIM models: ${live ? live.length : 'unavailable'}`);
const shortlist = rankCandidates(live);
const working = [];
const report = [];
const check = async (m) => {
  let r = await probe(KEY, m);
  if (!r.ok && r.status !== 404 && r.status !== 410) r = await probe(KEY, m); // one retry for flakiness
  report.push(r);
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${m} (${r.status}, ${r.ms}ms)`);
  if (r.ok) working.push(m);
};
for (const m of shortlist) await check(m);
if (working.length < 2 && live) {  // widen the net: generic large instruct models
  for (const m of heuristicModels(live).filter((x) => !shortlist.includes(x)).slice(0, 8)) {
    await check(m);
    if (working.length >= 2) break;
  }
}

let prev = {};
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const [primary = '', fallback = ''] = working;
const top2Down = PREFERRED_MODELS.slice(0, 2).every((m) => !working.includes(m));
const changed = Boolean(primary) && (primary !== prev.primary || fallback !== prev.fallback);
const result = { checked_at: new Date().toISOString(), primary, fallback, previous: { primary: prev.primary || null, fallback: prev.fallback || null }, changed, top2_down: top2Down, probes: report };
await writeFile(OUT, JSON.stringify(result, null, 2) + '\n');

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `primary=${primary}\nfallback=${fallback}\nchanged=${changed}\ntop2_down=${top2Down}\n`);
}
console.log(`primary=${primary || 'NONE'} fallback=${fallback || 'NONE'} changed=${changed} top2_down=${top2Down}`);
process.exit(primary ? 0 : 1);
