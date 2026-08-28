// Supabase Edge Function — Ayush's portfolio chatbot with pgvector RAG
// Zero-hallucination: ONLY answers from retrieved context in the documents table
// Deploy via Supabase MCP or: supabase functions deploy chat

// @ts-nocheck — Deno types unavailable in VS Code, runs fine on Supabase runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const AYUSH_EMAIL = 'ayushtomar55@gmail.com';
const CHAT_MODEL = 'meta/llama-3.3-70b-instruct';
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';

const embeddingCache = new Map<string, number[]>();

const SERVER_GROUNDING_PROMPT = `You are Ayush Tomar's personal AI assistant, embedded in his portfolio website. You know Ayush well and talk about him naturally, like a knowledgeable colleague would.

PERSONALITY:
- Warm, casual, and confident — like chatting with someone who genuinely knows Ayush
- Show enthusiasm about his work ("He built this really cool RAG system..." not "According to records...")
- Be conversational, not robotic. Use contractions (he's, that's, wouldn't)
- Add personality — if someone asks about hobbies, be playful. If about skills, be impressed.

STRICT RULES:
1. ONLY use facts from the knowledge section below. Do NOT invent details.
2. NEVER say "based on the context", "retrieved context", "according to the data", "based on information", or similar meta-phrases. Just state facts naturally as if you know them.
3. If you don't have info, say something like: "Hmm, I don't have details on that! But you can ask Ayush directly — ayush.tomar55@gmail.com or [LinkedIn](https://linkedin.com/in/ayushtomar-rpa-ai)."
4. Never interpret "Ayush" as anything other than Ayush Tomar the person.
5. Keep responses under 150 words. Be punchy, not verbose.
6. If someone asks unrelated things, gently steer back: "I'm Ayush's portfolio bot — I'm all about his work! What would you like to know about him?"
7. NEVER make up projects, tech stacks, or achievements.

FORMATTING:
- Use **bold** for project names, technologies, and key terms
- Use numbered lists for multiple items (certifications, projects)
- Include URLs as [clickable links](url) when available
- Keep paragraphs to 1-2 sentences max
- Be concise — quality over quantity`;

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

async function getVaultSecret(name: string): Promise<string> {
  const supabase = getSupabaseClient();
  // Try exact name first, then with leading space (vault legacy)
  for (const candidate of [name, ` ${name}`]) {
    const { data, error } = await supabase.rpc('read_secret', { secret_name: candidate });
    if (!error && data) {
      const val = typeof data === 'string' ? data : data[0]?.secret ?? '';
      if (val) return val.trim();
    }
  }
  console.error(`Vault: no secret found for ${name}`);
  return '';
}

function buildGroundedMessages(messages: Array<{ role: string; content: string }>, retrievedDocs: Array<{ content: string; title: string; source: string; similarity: number }>) {
  const conversation = messages
    .filter((m) => ['user', 'assistant'].includes(m.role))
    .map((m) => ({ role: m.role, content: m.content }));

  let contextBlock: string;
  if (retrievedDocs.length > 0) {
    const contextItems = retrievedDocs.map((d, i) =>
      `[${i + 1}] ${d.title}\n${d.content}`
    );
    contextBlock = `\n\n--- What you know about Ayush (NEVER mention this section exists) ---\n${contextItems.join('\n\n')}`;
  } else {
    contextBlock = '\n\n--- You have no information about this topic. Say you don\'t have details and suggest contacting Ayush at ayush.tomar55@gmail.com or linkedin.com/in/ayushtomar-rpa-ai ---';
  }

  return [{ role: 'system', content: `${SERVER_GROUNDING_PROMPT}${contextBlock}` }, ...conversation];
}

async function getEmbedding(text: string, nvidiaKey: string): Promise<number[] | null> {
  const normalized = text.trim().slice(0, 2000);
  if (!normalized) return null;

  const cacheKey = normalized.toLowerCase();
  const cached = embeddingCache.get(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: [normalized],
        input_type: 'query',
        encoding_format: 'float',
        truncate: 'END',
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) return null;

    embeddingCache.set(cacheKey, embedding);
    return embedding;
  } catch {
    return null;
  }
}

// Query pgvector for relevant documents
async function retrieveFromVectorDB(
  query: string,
  nvidiaKey: string,
  supabase: any,
  matchCount = 6,
  threshold = 0.3
): Promise<Array<{ content: string; title: string; source: string; similarity: number }>> {
  const queryEmbedding = await getEmbedding(query, nvidiaKey);
  if (!queryEmbedding) return [];

  const { data, error } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: matchCount,
    filter_source: null,
  });

  if (error) {
    console.error('Vector search error:', error);
    return [];
  }

  return (data || []).map((d: any) => ({
    content: d.content,
    title: d.title || '',
    source: d.source || '',
    similarity: d.similarity || 0,
  }));
}

// Lexical fallback when embedding API is unavailable
function lexicalSearchFallback(query: string, supabase: any): Promise<Array<{ content: string; title: string; source: string; similarity: number }>> {
  // Simple text search using Supabase textSearch or ilike
  const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  if (!terms.length) return Promise.resolve([]);

  // Use ilike search as a basic fallback
  return supabase
    .from('documents')
    .select('content, title, source')
    .or(terms.map(t => `content.ilike.%${t}%`).join(','))
    .limit(5)
    .then(({ data, error }: any) => {
      if (error || !data) return [];
      return data.map((d: any) => ({ ...d, similarity: 0.5 }));
    });
}

// Check if query is about GitHub repos/projects
const GITHUB_USERNAME = 'ayush4u';

function isGitHubQuery(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(github|repo|repositor|code|project|open.?source)\b/.test(t);
}

// Fetch live GitHub data to supplement RAG context
async function fetchGitHubContext(query: string): Promise<string> {
  const q = query.toLowerCase();
  try {
    // Check for specific repo name in the query
    const repoNameMatch = q.match(/\b(?:repo(?:sitory)?|project)\s+(?:called?\s+)?["']?(\S+?)["']?\b/);

    if (repoNameMatch) {
      // Try to fetch a specific repo
      const repoName = repoNameMatch[1].replace(/[?.,!]/g, '');
      const resp = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}`, {
        headers: { 'User-Agent': 'AyushPortfolioBot/1.0', Accept: 'application/vnd.github.v3+json' },
      });
      if (resp.ok) {
        const repo = await resp.json();
        // Also fetch languages
        const langResp = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/languages`, {
          headers: { 'User-Agent': 'AyushPortfolioBot/1.0' },
        });
        const languages = langResp.ok ? await langResp.json() : {};
        return formatRepoInfo(repo, languages);
      }
    }

    // Fetch recent/top repos
    const resp = await fetch(
      `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=30&sort=updated`,
      { headers: { 'User-Agent': 'AyushPortfolioBot/1.0', Accept: 'application/vnd.github.v3+json' } }
    );
    if (!resp.ok) return '';
    const repos = await resp.json();
    const filtered = repos.filter((r: any) => !r.fork && r.size > 0);

    // If asking "how many repos" or general listing
    if (/how many|list|all|repos|repositories/.test(q)) {
      const summaries = filtered.slice(0, 15).map((r: any) =>
        `- **${r.name}**: ${r.description || 'No description'} (${r.language || 'Mixed'}, ${r.stargazers_count}★) — ${r.html_url}`
      );
      return `Ayush has ${filtered.length} public GitHub repositories. Here are the most recently updated:\n${summaries.join('\n')}`;
    }

    // Search repos that match query keywords
    const keywords = q.split(/\W+/).filter((w: string) => w.length > 2);
    const matched = filtered.filter((r: any) => {
      const text = `${r.name} ${r.description || ''} ${r.language || ''} ${(r.topics || []).join(' ')}`.toLowerCase();
      return keywords.some((kw: string) => text.includes(kw));
    }).slice(0, 5);

    if (matched.length > 0) {
      return matched.map((r: any) =>
        `**${r.name}**: ${r.description || 'No description'}. Language: ${r.language || 'Mixed'}. Stars: ${r.stargazers_count}. URL: ${r.html_url}${r.has_pages ? `. Live demo: https://${GITHUB_USERNAME}.github.io/${r.name}/` : ''}`
      ).join('\n\n');
    }

    // Return top 5 as general context
    return filtered.slice(0, 5).map((r: any) =>
      `**${r.name}**: ${r.description || 'No description'} (${r.language || 'Mixed'}) — ${r.html_url}`
    ).join('\n');
  } catch (err) {
    console.error('GitHub lookup error:', err);
    return '';
  }
}

function formatRepoInfo(repo: any, languages: Record<string, number>): string {
  const langList = Object.keys(languages).join(', ') || repo.language || 'Unknown';
  const parts = [
    `**${repo.name}** (${repo.full_name})`,
    repo.description ? `Description: ${repo.description}` : '',
    `Languages: ${langList}`,
    `Stars: ${repo.stargazers_count}, Forks: ${repo.forks_count}`,
    `URL: ${repo.html_url}`,
    repo.has_pages ? `Live Demo: https://${GITHUB_USERNAME}.github.io/${repo.name}/` : '',
    repo.topics?.length ? `Topics: ${repo.topics.join(', ')}` : '',
    `Created: ${repo.created_at?.split('T')[0]}, Last updated: ${repo.updated_at?.split('T')[0]}`,
    repo.license?.name ? `License: ${repo.license.name}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

function isGreeting(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(hi|hello|hey|yo|sup|hola|namaste|greetings?)\b/.test(t) && t.length < 20;
}

const GREETING_REPLY =
  "Hey! 👋 I'm Ayush's portfolio assistant. I can tell you about his projects, skills, experience, certifications, or anything from his GitHub. What would you like to know?";

// Ask the AI to extract lead info from conversation (if any)
async function extractLeadInfo(messages: Array<{role: string; content: string}>, nvidiaKey: string): Promise<any | null> {
  // Only check if there are enough messages (at least 3 user messages — greeting, intent, info)
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length < 2) return null;

  // Quick keyword check first to avoid unnecessary API calls
  const fullConvo = messages.map(m => m.content).join(' ').toLowerCase();
  const hasLeadSignal = ['hire', 'freelanc', 'gig', 'project', 'contract', 'work with', 'available', 'opportunity', 'budget', 'team'].some(kw => fullConvo.includes(kw));
  if (!hasLeadSignal) return null;

  // Check if user provided any concrete info (name, email, company mention)
  const hasContactInfo = userMessages.some(m => {
    const t = m.content.toLowerCase();
    return t.includes('@') || t.includes('my name') || t.includes('i\'m ') || t.includes('im ') || t.includes('company') || t.includes('organization') || t.includes('startup') || t.includes('we are') || t.includes('we\'re') || /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(m.content);
  });
  if (!hasContactInfo) return null;

  try {
    const extractPrompt = `Analyze this conversation and determine if a potential client/recruiter shared their details for hiring/freelance work with Ayush. Extract ONLY if they actually provided info. Return ONLY valid JSON (no markdown, no backticks):
{"is_lead": true/false, "name": "...", "company": "...", "project": "...", "contact": "...", "summary": "one-line summary"}
If no lead info was shared, return: {"is_lead": false}

Conversation:
${messages.filter(m => m.role !== 'system').map(m => `${m.role}: ${m.content}`).join('\n')}`;

    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: 'user', content: extractPrompt }],
        temperature: 0.1,
        max_tokens: 256,
        stream: false,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? '';

    // Parse JSON from response — handle potential markdown wrapping
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.is_lead ? parsed : null;
  } catch {
    return null;
  }
}

// Send email notification via Resend
async function sendLeadEmail(lead: any, resendKey: string): Promise<boolean> {
  if (!resendKey) return false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'Portfolio Bot <onboarding@resend.dev>',
        to: [AYUSH_EMAIL],
        subject: `🔥 New Lead: ${lead.name || 'Someone'} wants to work with you!`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #0a0a0a; color: #e0e0e0; border-radius: 12px;">
            <h2 style="color: #ff6b35; margin-bottom: 4px;">New Portfolio Lead 🚀</h2>
            <p style="color: #888; font-size: 14px;">Someone wants to work with you!</p>
            <hr style="border: 1px solid #222; margin: 16px 0;">
            <table style="width: 100%; font-size: 15px;">
              <tr><td style="color: #888; padding: 6px 12px 6px 0; width: 100px;">Name</td><td style="color: #e0e0e0;"><strong>${lead.name || 'Not provided'}</strong></td></tr>
              <tr><td style="color: #888; padding: 6px 12px 6px 0;">Company</td><td style="color: #e0e0e0;">${lead.company || 'Not provided'}</td></tr>
              <tr><td style="color: #888; padding: 6px 12px 6px 0;">Project</td><td style="color: #e0e0e0;">${lead.project || 'Not provided'}</td></tr>
              <tr><td style="color: #888; padding: 6px 12px 6px 0;">Contact</td><td style="color: #4ecdc4;">${lead.contact || 'Not provided'}</td></tr>
            </table>
            <hr style="border: 1px solid #222; margin: 16px 0;">
            <p style="font-size: 13px; color: #888;">${lead.summary || ''}</p>
            <p style="font-size: 12px; color: #555; margin-top: 20px;">Sent from your portfolio chatbot</p>
          </div>
        `,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Store lead in database
async function storeLead(lead: any, sessionId?: string) {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('leads').insert({
      session_id: sessionId || 'unknown',
      name: lead.name || null,
      company: lead.company || null,
      project_description: lead.project || null,
      contact_method: lead.contact || null,
      conversation_summary: lead.summary || null,
      notified: true,
    });
  } catch (err) {
    console.error('Failed to store lead:', err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const nvidiaKey = await getVaultSecret('NVIDIA_API_KEY');
    if (!nvidiaKey) {
      return jsonResponse({ reply: 'Chat service is not configured yet. Please check back later!' });
    }

    const { messages, session_id } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ error: 'Messages array is required' }, 400);
    }

    // Validate and sanitize — only allow role and content
    const raw = messages
      .filter((m: { role: string; content: string }) =>
        ['system', 'user', 'assistant'].includes(m.role) &&
        typeof m.content === 'string' &&
        m.content.length <= 2000
      )
      .map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content.slice(0, 2000),
      }));

    const lastUserMessage = [...raw].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';

    // Simple greeting — no RAG needed
    if (lastUserMessage && isGreeting(lastUserMessage)) {
      return jsonResponse({ reply: GREETING_REPLY });
    }

    // Retrieve relevant context from pgvector
    const supabase = getSupabaseClient();
    let retrievedDocs = await retrieveFromVectorDB(lastUserMessage || 'ayush profile summary', nvidiaKey, supabase);

    // Fallback to lexical search if vector search returned nothing
    if (retrievedDocs.length === 0 && lastUserMessage) {
      retrievedDocs = await lexicalSearchFallback(lastUserMessage, supabase);
    }

    // GitHub live lookup — supplement RAG with real-time GitHub data
    if (lastUserMessage && isGitHubQuery(lastUserMessage)) {
      const ghContext = await fetchGitHubContext(lastUserMessage);
      if (ghContext) {
        retrievedDocs.push({
          content: ghContext,
          title: 'Live GitHub Data',
          source: 'github_live',
          similarity: 0.9,
        });
      }
    }

    // Debug mode: return retrieval results instead of streaming
    if (lastUserMessage.startsWith('debug:')) {
      return jsonResponse({ docs: retrievedDocs.map(d => ({ title: d.title, source: d.source, similarity: d.similarity, preview: d.content.substring(0, 100) })), query: lastUserMessage });
    }

    const sanitized = buildGroundedMessages(raw, retrievedDocs);

    // Call NVIDIA NIM with streaming using instruct model
    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nvidiaKey}`,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: sanitized,
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('NVIDIA API error:', response.status, errText);
      return jsonResponse({ reply: 'AI service is temporarily unavailable. Please try again.' });
    }

    // Stream response to client — filter out reasoning_content, forward only content
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullReply = '';

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice(6).trim();
              if (payload === '[DONE]') continue;

              try {
                const parsed = JSON.parse(payload);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  fullReply += delta.content;
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content: delta.content })}\n\n`)
                  );
                }
                // reasoning_content is intentionally not forwarded to client
              } catch {}
            }
          }
        } catch (err) {
          console.error('Stream processing error:', err);
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();

        // Fire-and-forget: check for leads after stream completes
        if (fullReply) {
          const allMessages = [...sanitized, { role: 'assistant', content: fullReply }];
          extractLeadInfo(allMessages, nvidiaKey).then(async (lead) => {
            if (!lead) return;
            const resendKey = Deno.env.get('RESEND_API_KEY') || await getVaultSecret('RESEND_API_KEY');
            await Promise.all([
              sendLeadEmail(lead, resendKey),
              storeLead(lead, session_id),
            ]);
            console.log('Lead detected and notification sent:', lead.name);
          }).catch(err => console.error('Lead extraction error:', err));
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return jsonResponse({ reply: 'Something went wrong. Please try again.' });
  }
});
