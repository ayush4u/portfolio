// Supabase Edge Function — visitor tracking with email digest
// Tracks anonymous visits, detects returning visitors, sends daily email summary
// Deploy: supabase functions deploy track-visit

// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AYUSH_EMAIL = 'ayushtomar55@gmail.com';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function getVaultSecret(name: string): Promise<string> {
  const supabase = getSupabaseClient();
  for (const candidate of [name, ` ${name}`]) {
    const { data, error } = await supabase.rpc('read_secret', { secret_name: candidate });
    if (!error && data) {
      const val = typeof data === 'string' ? data : data[0]?.secret ?? '';
      if (val) return val.trim();
    }
  }
  return '';
}

// Resolve country from Cloudflare headers (available in Supabase Edge)
function getGeoFromHeaders(req: Request): { country: string; city: string } {
  return {
    country: req.headers.get('cf-ipcountry') || req.headers.get('x-country') || '',
    city: req.headers.get('cf-ipcity') || req.headers.get('x-city') || '',
  };
}

// Send email notification for notable visits
async function sendVisitNotification(
  resendKey: string,
  stats: { totalToday: number; uniqueToday: number; returningToday: number; latestVisitor: any }
): Promise<boolean> {
  if (!resendKey) return false;
  const v = stats.latestVisitor;
  const isReturning = v.is_returning;
  const visitLabel = isReturning ? `🔁 Returning visitor (visit #${v.visit_count})` : '🆕 New visitor';
  const geo = [v.country, v.city].filter(Boolean).join(', ') || 'Unknown location';

  try {
    const emailBody = {
      from: 'Portfolio Bot <onboarding@resend.dev>',
      to: [AYUSH_EMAIL],
      subject: `${isReturning ? '🔁' : '👁️'} Portfolio Visit — ${geo} (${stats.totalToday} today)`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #e0e0e0; border-radius: 12px;">
          <h2 style="color: #00e5ff; margin: 0 0 4px;">${visitLabel}</h2>
          <p style="color: #888; font-size: 13px; margin: 0 0 16px;">Someone just visited your portfolio</p>
          <hr style="border: 1px solid #222; margin: 0 0 16px;">
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <tr><td style="color: #888; padding: 6px 12px 6px 0; width: 120px;">Location</td><td style="color: #e0e0e0;">${geo}</td></tr>
            <tr><td style="color: #888; padding: 6px 12px 6px 0;">Page</td><td style="color: #4ecdc4;">${v.page_url || '/'}</td></tr>
            <tr><td style="color: #888; padding: 6px 12px 6px 0;">Referrer</td><td style="color: #e0e0e0;">${v.referrer || 'Direct'}</td></tr>
            <tr><td style="color: #888; padding: 6px 12px 6px 0;">Device</td><td style="color: #e0e0e0; font-size: 12px; word-break: break-all;">${(v.user_agent || '').substring(0, 120)}</td></tr>
          </table>
          <hr style="border: 1px solid #222; margin: 16px 0;">
          <div style="display: flex; gap: 24px; margin-top: 8px;">
            <div style="text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #00e5ff;">${stats.totalToday}</div>
              <div style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px;">visits today</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #22c55e;">${stats.uniqueToday}</div>
              <div style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px;">unique</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: #ff3366;">${stats.returningToday}</div>
              <div style="font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 1px;">returning</div>
            </div>
          </div>
          <p style="font-size: 11px; color: #555; margin-top: 20px; text-align: center;">Sent from your portfolio visitor tracker</p>
        </div>
      `,
    };

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify(emailBody),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Resend API error:', response.status, errBody);
    }
    return response.ok;
  } catch (err) {
    console.error('Resend fetch error:', err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { visitor_id, page_url, referrer, user_agent } = await req.json();

    if (!visitor_id || typeof visitor_id !== 'string' || visitor_id.length > 100) {
      return new Response(JSON.stringify({ error: 'Invalid visitor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseClient();
    const geo = getGeoFromHeaders(req);

    // Check if returning visitor
    const { data: existing } = await supabase
      .from('visitors')
      .select('id, visit_count')
      .eq('visitor_id', visitor_id)
      .order('created_at', { ascending: false })
      .limit(1);

    const isReturning = existing && existing.length > 0;
    const visitCount = isReturning ? (existing[0].visit_count || 1) + 1 : 1;

    // Insert visit record
    const { error: insertErr } = await supabase.from('visitors').insert({
      visitor_id: visitor_id.substring(0, 100),
      page_url: (page_url || '').substring(0, 500),
      referrer: (referrer || '').substring(0, 500),
      user_agent: (user_agent || '').substring(0, 500),
      country: geo.country,
      city: geo.city,
      is_returning: isReturning,
      visit_count: visitCount,
    });

    if (insertErr) {
      console.error('Insert visit error:', insertErr);
    }

    // Get today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count: totalToday } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString());

    const { data: uniqueData } = await supabase
      .rpc('count_unique_visitors_today', {});

    const { count: returningToday } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
      .eq('is_returning', true);

    const stats = {
      totalToday: totalToday || 0,
      uniqueToday: uniqueData || 0,
      returningToday: returningToday || 0,
      latestVisitor: {
        page_url,
        referrer,
        user_agent,
        is_returning: isReturning,
        visit_count: visitCount,
        country: geo.country,
        city: geo.city,
      },
    };

    // Send email notification — await result for debugging
    const resendKey = Deno.env.get('RESEND_API_KEY') || await getVaultSecret('RESEND_API_KEY');
    let emailSent = false;
    if (resendKey) {
      console.log('Resend key found, length:', resendKey.length, 'prefix:', resendKey.substring(0, 5));
      emailSent = await sendVisitNotification(resendKey, stats);
      console.log('Email sent result:', emailSent);
    } else {
      console.log('No Resend API key found');
    }

    return new Response(JSON.stringify({ ok: true, returning: isReturning, visits: visitCount, emailSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Track visit error:', err?.message || err);
    return new Response(JSON.stringify({ error: 'Internal error', detail: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
