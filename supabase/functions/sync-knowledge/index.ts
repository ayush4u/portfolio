// Supabase Edge Function — syncs GitHub repos + profile data into the documents vector table
// Run manually or on a schedule to keep the chatbot's knowledge base fresh
// Deploy: supabase functions deploy sync-knowledge

// @ts-nocheck — Deno types unavailable in VS Code, runs fine on Supabase runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const EMBEDDING_MODEL = 'nvidia/nv-embedqa-e5-v5';
const GITHUB_USERNAME = 'ayush4u';

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
  // Try exact name first, then with leading space (vault legacy)
  for (const candidate of [name, ` ${name}`]) {
    const { data, error } = await supabase.rpc('read_secret', { secret_name: candidate });
    if (!error && data) {
      const val = typeof data === 'string' ? data : data[0]?.secret ?? '';
      if (val) return val.trim();
    }
  }
  return '';
}

async function getEmbedding(text: string, nvidiaKey: string): Promise<number[] | null> {
  const normalized = text.trim().slice(0, 2000);
  if (!normalized) return null;
  try {
    const response = await fetch(`${NVIDIA_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nvidiaKey}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: [normalized], input_type: 'passage', encoding_format: 'float', truncate: 'END' }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// Rate-limited embedding with retries
async function getEmbeddingSafe(text: string, nvidiaKey: string, retries = 2): Promise<number[] | null> {
  for (let i = 0; i <= retries; i++) {
    const emb = await getEmbedding(text, nvidiaKey);
    if (emb) return emb;
    if (i < retries) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
  }
  return null;
}

async function upsertDocument(
  supabase: any,
  source: string,
  sourceId: string,
  title: string,
  content: string,
  metadata: Record<string, unknown>,
  embedding: number[]
) {
  const { error } = await supabase
    .from('documents')
    .upsert(
      { source, source_id: sourceId, title, content, metadata, embedding, updated_at: new Date().toISOString() },
      { onConflict: 'source,source_id' }
    );
  if (error) console.error(`Upsert failed for ${source}/${sourceId}:`, error.message);
  return !error;
}

// Split text into chunks of ~600 chars at sentence boundaries
function chunkText(text: string, maxLen = 600): string[] {
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxLen && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Fetch GitHub repos
async function fetchGitHubRepos(): Promise<any[]> {
  const resp = await fetch(
    `https://api.github.com/users/${GITHUB_USERNAME}/repos?per_page=100&sort=updated`,
    { headers: { 'User-Agent': 'AyushPortfolioBot/1.0', Accept: 'application/vnd.github.v3+json' } }
  );
  if (!resp.ok) { console.error('GitHub repos fetch failed:', resp.status); return []; }
  return resp.json();
}

// Fetch README for a repo
async function fetchReadme(repoName: string): Promise<string | null> {
  // Try main, then master branch
  for (const branch of ['main', 'master']) {
    try {
      const resp = await fetch(
        `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${repoName}/${branch}/README.md`,
        { headers: { 'User-Agent': 'AyushPortfolioBot/1.0' } }
      );
      if (resp.ok) {
        const text = await resp.text();
        // Strip markdown images and badges (keep text content)
        return text
          .replace(/!\[.*?\]\(.*?\)/g, '')
          .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    } catch {}
  }
  return null;
}

// Fetch languages for a repo
async function fetchLanguages(repoName: string): Promise<Record<string, number>> {
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/languages`,
      { headers: { 'User-Agent': 'AyushPortfolioBot/1.0', Accept: 'application/vnd.github.v3+json' } }
    );
    if (resp.ok) return resp.json();
  } catch {}
  return {};
}

// Profile chunks — verified facts about Ayush
const PROFILE_CHUNKS = [
  {
    id: 'bio',
    title: 'Ayush Tomar — Bio',
    content: 'Ayush Tomar is a Software Engineer based in Mumbai, India, with 4+ years of experience at Marsh McLennan in the pension domain. He specializes in Intelligent Automation using UiPath RPA, AI/ML workflows, and production-ready RAG systems. He is passionate about AGI, building products, and exploring cutting-edge AI technologies.',
  },
  {
    id: 'skills',
    title: 'Ayush Tomar — Technical Skills',
    content: 'Core technical skills: Python, JavaScript, TypeScript, React, Node.js, Three.js, GLSL shaders, WebGL. Cloud and infrastructure: AWS, Docker, Supabase, PostgreSQL, MongoDB, ChromaDB. AI/ML tools: TensorFlow, PyTorch, scikit-learn, OpenAI APIs, Groq, Hugging Face, UiPath RPA, LangChain. Frontend frameworks and tools: Next.js, Tailwind CSS, Vite, GSAP animations.',
  },
  {
    id: 'certifications',
    title: 'Ayush Tomar — Certifications',
    content: 'Professional certifications (7 total): 1) AWS Certified Cloud Practitioner (Amazon Web Services). 2) Advanced RPA Developer (UiPath Academy). 3) Professional Machine Learning Engineer (Google Cloud). 4) Claude Code in Action (Anthropic Education, April 2026, verify: https://verify.skilljar.com/c/z45xrycpcwer). 5) Introduction to Model Context Protocol (Anthropic Education, April 2026, verify: https://verify.skilljar.com/c/atxeopf3qctc). 6) Fundamentals of LLMs — The LLM Course (Hugging Face, April 2026). 7) Fundamentals of MCP — The MCP Course (Hugging Face, April 2026). These certifications span cloud computing, robotic process automation, machine learning, large language models, MCP (Model Context Protocol), and AI agent development.',
  },
  {
    id: 'education',
    title: 'Ayush Tomar — Education',
    content: 'Education: Bachelor of Engineering (B.E.) in Information Technology from Pillai HOC College of Engineering and Technology, affiliated with University of Mumbai.',
  },
  {
    id: 'experience-marsh',
    title: 'Ayush Tomar — Work Experience at Marsh McLennan',
    content: 'Ayush works at Marsh McLennan (a Fortune 500 company and global leader in risk, strategy, and people advisory) in Mumbai. He has 4+ years of experience in the pension domain, focusing on Intelligent Automation. His work includes building UiPath RPA automations, creating AI/ML-powered workflows, developing custom UiPath packages for email automation (reducing manual effort by ~40%), and building a RAG chatbot using OpenAI LLMs + embeddings + MongoDB vector store that improved query resolution by 35%.',
  },
  {
    id: 'contact',
    title: 'Ayush Tomar — Contact & Availability',
    content: 'Contact Ayush: Email ayush.tomar55@gmail.com, LinkedIn linkedin.com/in/ayushtomar-rpa-ai, GitHub github.com/ayush4u. Availability: generally weekday evenings IST and weekends. He is open to freelance, contract, and full-time roles. Portfolio: ayush4u.github.io/portfolio/',
  },
  {
    id: 'interests',
    title: 'Ayush Tomar — Interests & Hobbies',
    content: 'Outside work, Ayush enjoys building products, playing cricket, and exploring cafes and coffee culture. He is fascinated by how AI can augment human intelligence rather than replace it. He is currently exploring ways to make AGI beneficial for humanity while maintaining safety and ethical considerations.',
  },
  {
    id: 'work-focus',
    title: 'Ayush Tomar — Current Work Focus',
    content: 'Ayush is currently working on: Artificial General Intelligence (AGI) research, Robotic Process Automation (RPA) with UiPath and AI-powered agents, Machine Learning & Deep Learning with Python/TensorFlow/PyTorch, Full-Stack Development with React/Node.js/Three.js, and contributing to open-source projects. His tech stack includes Python, JavaScript, TypeScript, React, Node.js, MongoDB, and UiPath.',
  },
];

// Process a single GitHub repo: summary + README chunks
async function processRepo(
  repo: any,
  nvidiaKey: string,
  supabase: any,
  results: string[]
) {
  const name = repo.name as string;
  const fullName = repo.full_name as string;

  if (repo.fork || repo.size === 0) {
    results.push(`SKIP: ${name} (fork or empty)`);
    return;
  }

  const languages = await fetchLanguages(name);
  await new Promise(r => setTimeout(r, 300));

  const langList = Object.keys(languages).join(', ') || repo.language || 'Unknown';
  const repoUrl = repo.html_url;
  const description = repo.description || '';
  const stars = repo.stargazers_count || 0;
  const hasPages = repo.has_pages;
  const pagesUrl = hasPages ? `https://${GITHUB_USERNAME}.github.io/${name}/` : null;
  const createdAt = repo.created_at?.split('T')[0] || '';
  const topics = (repo.topics || []).join(', ');

  const repoSummary = [
    `GitHub Repository: ${name} (${fullName})`,
    description ? `Description: ${description}` : '',
    `Languages: ${langList}`,
    `URL: ${repoUrl}`,
    pagesUrl ? `Live Demo: ${pagesUrl}` : '',
    stars > 0 ? `Stars: ${stars}` : '',
    topics ? `Topics: ${topics}` : '',
    `Created: ${createdAt}`,
    repo.license?.name ? `License: ${repo.license.name}` : '',
  ].filter(Boolean).join('. ');

  const repoEmb = await getEmbeddingSafe(repoSummary, nvidiaKey);
  if (repoEmb) {
    await upsertDocument(supabase, 'github_repo', fullName, `GitHub: ${name}`, repoSummary, {
      url: repoUrl, languages: langList, stars, has_pages: hasPages, pages_url: pagesUrl, created_at: createdAt,
    }, repoEmb);
    results.push(`OK repo: ${name}`);
  } else {
    results.push(`SKIP repo: ${name} (embedding failed)`);
  }

  await new Promise(r => setTimeout(r, 1000));

  // README
  const readme = await fetchReadme(name);
  if (readme && readme.length > 50) {
    const cleanReadme = readme
      .replace(/```[\s\S]*?```/g, '[code block]')
      .replace(/#{1,6}\s/g, '')
      .replace(/\|.*\|/g, '')
      .replace(/-{3,}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_~`]/g, '')
      .replace(/\n{2,}/g, '\n')
      .trim();

    const chunks = chunkText(cleanReadme, 600);
    let chunkIdx = 0;
    for (const chunk of chunks.slice(0, 6)) {
      const chunkId = `${fullName}/readme/${chunkIdx}`;
      const chunkEmb = await getEmbeddingSafe(chunk, nvidiaKey);
      if (chunkEmb) {
        await upsertDocument(supabase, 'github_readme', chunkId, `${name} README (part ${chunkIdx + 1})`, chunk, { repo: fullName, url: repoUrl, chunk_index: chunkIdx }, chunkEmb);
        results.push(`OK readme: ${name}/${chunkIdx}`);
      }
      chunkIdx++;
      await new Promise(r => setTimeout(r, 1000));
    }
  } else {
    results.push(`SKIP readme: ${name} (none or too short)`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: string[] = [];

  try {
    // Parse mode: "profile", "repos", "repo:<name>", or "all" (default)
    let mode = 'all';
    let repoFilter = '';
    let repoOffset = 0;
    let repoLimit = 4; // Process max 4 repos per invocation to stay within compute limits
    try {
      const body = await req.json();
      if (body.mode) mode = body.mode;
      if (body.repo) repoFilter = body.repo;
      if (body.offset != null) repoOffset = body.offset;
      if (body.limit != null) repoLimit = body.limit;
    } catch {}

    const nvidiaKey = await getVaultSecret('NVIDIA_API_KEY');
    if (!nvidiaKey) {
      return new Response(JSON.stringify({ error: 'NVIDIA API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabaseClient();

    // === 1. Seed profile chunks ===
    if (mode === 'all' || mode === 'profile') {
      results.push('--- Profile chunks ---');
      for (const chunk of PROFILE_CHUNKS) {
        const emb = await getEmbeddingSafe(chunk.content, nvidiaKey);
        if (!emb) { results.push(`SKIP: ${chunk.id} (embedding failed)`); continue; }
        const ok = await upsertDocument(supabase, 'profile', chunk.id, chunk.title, chunk.content, {}, emb);
        results.push(ok ? `OK: ${chunk.id}` : `FAIL: ${chunk.id}`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // === 2. GitHub repos ===
    if (mode === 'all' || mode === 'repos' || repoFilter) {
      results.push('--- GitHub repos ---');
      const allRepos = await fetchGitHubRepos();
      results.push(`Found ${allRepos.length} total repos`);

      let repos: any[];
      if (repoFilter) {
        repos = allRepos.filter((r: any) => r.name === repoFilter);
      } else {
        // Filter out forks/empty, then apply offset + limit
        const eligible = allRepos.filter((r: any) => !r.fork && r.size > 0);
        repos = eligible.slice(repoOffset, repoOffset + repoLimit);
        results.push(`Processing repos ${repoOffset} to ${repoOffset + repos.length} of ${eligible.length}`);
      }

      for (const repo of repos) {
        await processRepo(repo, nvidiaKey, supabase, results);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    results.push(`\nDone in ${elapsed}s`);

    return new Response(JSON.stringify({ success: true, log: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Sync error:', err);
    return new Response(JSON.stringify({ error: String(err), log: results }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
