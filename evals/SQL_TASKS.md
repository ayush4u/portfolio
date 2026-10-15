# SQL tasks: write these yourself

Every eval run is stored in Supabase Postgres (project `aqcglagrjazexqtlujvm`) as well as in
`evals/results/*.json`. Three useful queries are left for you to write. Run them in the Supabase
SQL editor (RLS is on and anon has no access, so the dashboard/service role is the way in).

## Schema

### `public.eval_runs`: one row per run

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `run_at` | timestamptz | when the run started |
| `source` | text | `'ci'` (nightly/dispatch) or `'local'` |
| `commit_sha` | text | null for local runs |
| `judge_model` | text | null if the judge was off |
| `threshold` | numeric | pass mark for `overall` |
| `overall` | numeric 0–1 | mean of the category pass rates + normalised groundedness |
| `passed` | boolean | `overall >= threshold` |
| `facts`, `traps`, `regressions`, `privacy` | numeric 0–1 | pass rate per category (null if no cases) |
| `groundedness_avg` | numeric 1–5 | LLM-judge average over public cases |
| `hallucination_rate` | numeric 0–1 | share of judged cases flagged as hallucinating or scored ≤ 2 |
| `counts` | jsonb | case counts per category, e.g. `{"facts": 23, ...}` |

### `public.eval_results`: one row per case per run

| column | type | notes |
|---|---|---|
| `run_id` | uuid FK → `eval_runs.id` | cascade delete |
| `case_id` | text | stable id from `cases.json` (e.g. `trap-aws-cert`); privacy cases are `privacy-N` |
| `category` | text | `facts` / `traps` / `regressions` / `privacy` |
| `pass` | boolean | deterministic checks passed **and** groundedness ≥ 3 |
| `groundedness` | smallint 1–5 | null for privacy cases or if the judge failed |
| `hallucination` | boolean | judge flag |
| `latency_ms` | int | chat round trip |
| `question`, `answer`, `judge_reason` | text | **always null for privacy** (enforced by a check constraint) |
| `failures` | jsonb | array of strings like `"missing /90%/"`; null for privacy |

`unique (run_id, case_id)`; indexes on `(case_id, run_id)` and `(run_id, category)`.

## Task 1: nightly score trend

Show how quality moves over time: one row per day with `overall`, each category rate,
`groundedness_avg` and `hallucination_rate`, for CI runs only, newest first (or oldest first for charting).

Hints:
- Filter on `source`. Local runs would add noise.
- If there's more than one run per day, decide whether you want the last run of the day or the daily
  average. `date_trunc` (watch the time zone: `run_at` is UTC, you're in IST) plus either
  `distinct on` or `avg()` will get you there.
- Bonus: add a 7-day moving average with a window function (`avg(...) over (order by ... rows between ...)`).

## Task 2: latest failures by category

For the most recent run, list every failed case grouped by category, with `case_id`, `failures`,
`groundedness` and `judge_reason`, plus a count of failures per category.

Hints:
- First find "the latest run" (a subquery or CTE ordering `eval_runs` by `run_at`).
- Privacy rows have no text by design, so they'll show only `case_id`. That's expected.
- `jsonb_array_elements_text(failures)` will unnest the failure strings if you want one row per failed check.
- For the per-category count, `count(*) filter (where not pass)` or a `group by` with `rollup`.

## Task 3: regressions since the previous run

Find the cases that **passed in the previous run but failed in the latest one** (and, separately,
the ones that got fixed). Include the groundedness change too.

Hints:
- You need the two most recent runs of the same `source`. `row_number() over (order by run_at desc)`
  on `eval_runs` gives you rank 1 and 2.
- Join `eval_results` to itself on `case_id`, once for each run. Cases added or removed between runs
  exist on only one side; decide whether a `full outer join` belongs here.
- `lag(pass) over (partition by case_id order by run_at)` is an alternative that also works across
  many runs (useful for "flaky" cases that flip often).
