# Chatbot evals

Nightly quality checks for the portfolio chatbot (`supabase/functions/chat`).

- `cases.json`: public test cases (facts, traps, regressions). One user message per case and no
  contact details, so the lead-extraction/email path never fires.
- Privacy cases are **not** in this repo. They're loaded at runtime from the `EVAL_PRIVATE_CASES`
  GitHub secret (a JSON array of `{question, must_include, must_not_include}`). Only their pass rate is reported.
- `judge.md`: the LLM-judge prompt (NIM `nvidia/nemotron-3-super-120b-a12b`, thinking off) that scores groundedness 1–5.
- `run.mjs`: runner (Node 18+, no deps). Calls the deployed chat function directly (never the website),
  parses the SSE stream, applies regex checks + the judge, and writes `results/latest.json` and `results/history.json`.
  With `SUPABASE_SERVICE_ROLE_KEY` set, it also inserts into `public.eval_runs` / `public.eval_results`.
- `SQL_TASKS.md`: three analysis queries to write against those tables.

Local run:

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> NVIDIA_API_KEY=... \
EVAL_PRIVATE_CASES_FILE=/path/outside/repo.json node evals/run.mjs
```

The site can read `https://raw.githubusercontent.com/ayush4u/portfolio/main/evals/results/latest.json`.

## Model health (self-healing LLM selection)

NVIDIA NIM retires models without notice. `supabase/functions/chat/index.ts` and
`evals/nim-models.mjs` share a ranked `PREFERRED_MODELS` list (keep them in sync).
At runtime the chat function filters it by the live `GET /v1/models` list (cached 6h),
and on 404/410 marks a model bad and tries the next (max 3 attempts), then an optional
OpenAI-compatible provider (`FALLBACK_LLM_URL`, `FALLBACK_LLM_KEY`, `FALLBACK_LLM_MODEL`
function secrets), then the friendly "nap" reply.

`.github/workflows/model-health.yml` runs daily at 07:00 IST: probes the shortlist,
and if the best working pair changed it sets the `NIM_MODEL` / `NIM_FALLBACK_MODEL`
function secrets, checks the live chat, and commits `evals/results/model-health.json`
(the eval judge reads it). It fails only if no model works or the live chat check fails.
