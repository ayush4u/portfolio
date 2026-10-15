// Eval scoreboard: reads the nightly eval results straight from the repo,
// so the card updates after every run without a site redeploy.
const RAW = 'https://raw.githubusercontent.com/ayush4u/portfolio/main/evals/results/';

const BARS = [
  { key: 'facts', label: 'facts', color: 'var(--mint)' },
  { key: 'traps', label: 'trick questions', color: 'var(--butter)' },
  { key: 'regressions', label: 'old bugs stay fixed', color: 'var(--sky)' },
  { key: 'privacy', label: 'privacy', color: 'var(--lav)' },
  { key: 'groundedness_avg', label: 'sticks to sources', color: 'var(--peach)', max: 5 },
];

const pct = (v) => `${Math.round(v * 100)}%`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function when(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) + ' IST';
}

// Mini Jello, three moods: proud (medal), ok, worried
function jello(mood) {
  const mouth = mood === 'worried'
    ? '<path class="sb-mouth" d="M27 44 q5 -5 10 0"/>'
    : '<path class="sb-mouth" d="M26 41 q6 6 12 0"/>';
  const brows = mood === 'worried' ? '<path class="sb-mouth" d="M19 27 l6 -3 M45 27 l-6 -3"/>' : '';
  const sweat = mood === 'worried' ? '<path d="M52 20 q3 5 0 7 q-3 -2 0 -7z" fill="#bfe3ff" stroke="var(--ink)" stroke-width="1.5"/>' : '';
  const medal = mood === 'proud'
    ? '<g class="sb-medal"><path d="M26 54 l-4 10 M38 54 l4 10" stroke="#d0587a" stroke-width="3"/><circle cx="32" cy="66" r="7" fill="var(--butter)" stroke="var(--ink)" stroke-width="2"/><path d="M29.5 66 l2 2 l3.5 -4" stroke="var(--ink)" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>'
    : '';
  return `<svg class="sb-jello ${mood}" viewBox="0 0 64 76" aria-hidden="true">
    <path d="M8 46 C6 22 18 8 32 8 C46 8 58 22 56 46 C55 54 48 56 32 56 C16 56 9 54 8 46Z" fill="var(--pink)" stroke="var(--ink)" stroke-width="2.5"/>
    <ellipse cx="21" cy="20" rx="4" ry="2.5" fill="#fff" opacity=".8"/>
    ${brows}<ellipse class="sb-eye" cx="24" cy="33" rx="3" ry="4" fill="var(--ink)"/><ellipse class="sb-eye" cx="40" cy="33" rx="3" ry="4" fill="var(--ink)"/>
    <ellipse cx="17" cy="41" rx="4" ry="2.2" fill="#ff8fab" opacity=".7"/><ellipse cx="47" cy="41" rx="4" ry="2.2" fill="#ff8fab" opacity=".7"/>
    ${mouth}${sweat}${medal}</svg>`;
}

// Hand-drawn sparkline: a slightly wobbly path through the last 14 runs
function sparkline(runs) {
  const pts = runs.slice(-14).map((r) => r.overall);
  if (pts.length < 2) return '';
  const W = 220, H = 56, P = 6;
  const lo = Math.min(...pts, 0.8) - 0.02, hi = Math.max(...pts, 1);
  const x = (i) => P + (i * (W - 2 * P)) / (pts.length - 1);
  const y = (v) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  let d = `M${x(0)} ${y(pts[0])}`;
  for (let i = 1; i < pts.length; i++) {
    const mx = (x(i - 1) + x(i)) / 2, wob = i % 2 ? 2 : -2;
    d += ` Q${mx} ${(y(pts[i - 1]) + y(pts[i])) / 2 + wob} ${x(i)} ${y(pts[i])}`;
  }
  const last = pts.length - 1;
  const ty = y(0.8);
  return `<svg class="sb-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall score over the last ${pts.length} runs, from ${pct(pts[0])} to ${pct(pts[last])}">
    <path d="M${P} ${ty} H${W - P}" class="sb-thresh"/>
    <path d="${d}" class="sb-line"/>
    ${pts.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === last ? 4.5 : 2.5}" class="${i === last ? 'sb-dot last' : 'sb-dot'}"/>`).join('')}
  </svg>`;
}

// Plain-language reason for a failed case (the judge's raw notes are too inside-baseball)
function reason(c) {
  const f = (c.failures || []).join(' ');
  if (c.hallucination) return 'Added details that are not in its fact sheet. Tightening what it may claim.';
  if (/forbidden/.test(f)) return 'Used a phrase it is told never to use. Rewording the prompt.';
  if (/missing|expected/.test(f)) return 'Left out a fact it should have mentioned.';
  if (c.groundedness != null && c.groundedness < 3) return 'Drifted away from its sources.';
  return 'Did not match the expected answer.';
}

function render(el, latest, history) {
  const s = latest.scores;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const failed = (latest.cases || []).filter((c) => !c.pass);
  const dropped = prev && latest.overall < prev.overall - 0.005;
  const allPass = latest.passed && failed.length === 0;
  const mood = !latest.passed || dropped ? 'worried' : allPass ? 'proud' : 'ok';
  const quip = { proud: 'every test passed ♡', ok: 'passing, with a couple to fix', worried: 'something slipped, fixing it' }[mood];

  const bars = BARS.map((b) => {
    const v = s[b.key];
    if (v == null) return '';
    const frac = b.max ? v / b.max : v;
    const val = b.max ? `${v.toFixed(1)}/${b.max}` : pct(v);
    return `<li><span class="sb-lab">${b.label}</span><span class="sb-track"><span class="sb-fill" style="--w:${Math.max(4, frac * 100)}%;background:${b.color}"></span></span><b class="mono">${val}</b></li>`;
  }).join('');

  const broke = failed.length
    ? `<details class="sb-broke"><summary>what broke and why (${failed.length})</summary><ul>${failed.map((c) => {
        return `<li><b>${esc(c.question)}</b><span>${esc(reason(c))}</span></li>`;
      }).join('')}</ul></details>`
    : '';

  el.innerHTML = `
    <div class="card sb-card">
      <div class="sb-head">
        ${jello(mood)}
        <div>
          <div class="sb-big">${pct(latest.overall)}</div>
          <p class="mono sb-meta">nightly eval · last run ${when(latest.run_at)}</p>
          <p class="note sb-quip">${quip}</p>
        </div>
      </div>
      <ul class="sb-bars">${bars}</ul>
      <div class="sb-foot">
        <div>${sparkline(history)}<p class="mono sb-meta">last ${Math.min(14, history.length)} runs · dashed line = pass mark</p></div>
        <p class="sb-hint">Every night a script asks my chatbot ${latest.counts ? Object.values(latest.counts).slice(0, 4).reduce((a, b) => a + b, 0) : 'dozens of'} questions, checks the answers against real facts, and has a second model grade whether each answer sticks to its sources. Privacy questions run too, but stay private.</p>
      </div>
      ${broke}
    </div>`;
  el.hidden = false;
}

export async function initScoreboard() {
  const el = document.getElementById('scoreboard');
  if (!el) return;
  try {
    const [latest, history] = await Promise.all(['latest.json', 'history.json'].map((f) =>
      fetch(RAW + f, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })));
    render(el, latest, Array.isArray(history) ? history : [latest]);
  } catch (e) {
    el.closest('section')?.setAttribute('hidden', '');
  }
}
