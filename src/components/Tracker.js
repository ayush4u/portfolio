// Anonymous visitor tracker — sends a ping to Supabase edge function on each visit
// Uses localStorage to generate a stable anonymous visitor ID (no cookies, no PII)

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function getVisitorId() {
  const key = 'portfolio_vid';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function trackVisit() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  // Don't track on localhost / dev
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  const payload = {
    visitor_id: getVisitorId(),
    page_url: location.pathname + location.hash,
    referrer: document.referrer || '',
    user_agent: navigator.userAgent,
  };

  // Fire-and-forget — don't block the page
  fetch(`${SUPABASE_URL}/functions/v1/track-visit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'apikey': SUPABASE_KEY,
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silently fail — visitor tracking is non-critical
  });
}
