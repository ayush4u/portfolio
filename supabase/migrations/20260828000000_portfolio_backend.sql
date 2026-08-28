-- Portfolio backend schema.
-- All application schema changes must be made through timestamped migrations.

create extension if not exists vector with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_created_at_idx
  on public.chat_messages (session_id, created_at);

alter table public.chat_messages enable row level security;

-- The browser only needs to write its own messages. Never expose conversation
-- history to another anonymous visitor.
drop policy if exists "Allow anonymous insert" on public.chat_messages;
drop policy if exists "Allow read own session" on public.chat_messages;
create policy "Anonymous visitors can insert chat messages"
  on public.chat_messages
  for insert
  to anon, authenticated
  with check (char_length(session_id) between 1 and 128);

grant select, insert on public.chat_messages to anon, authenticated;

create table if not exists public.visitors (
  id bigint generated always as identity primary key,
  visitor_id text not null,
  page_url text not null default '',
  referrer text not null default '',
  user_agent text not null default '',
  country text not null default '',
  city text not null default '',
  is_returning boolean not null default false,
  visit_count integer not null default 1 check (visit_count > 0),
  created_at timestamptz not null default now()
);

create index if not exists visitors_visitor_id_created_at_idx
  on public.visitors (visitor_id, created_at desc);
create index if not exists visitors_created_at_idx
  on public.visitors (created_at desc);

alter table public.visitors enable row level security;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  name text,
  company text,
  project_description text,
  contact_method text,
  conversation_summary text,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

-- NVIDIA's nv-embedqa-e5-v5 model returns 1024-dimensional vectors.
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  title text not null default '',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists documents_embedding_hnsw_idx
  on public.documents using hnsw (embedding extensions.vector_cosine_ops);

alter table public.documents enable row level security;

create or replace function public.match_documents(
  query_embedding extensions.vector(1024),
  match_threshold double precision,
  match_count integer,
  filter_source text default null
)
returns table (
  id uuid,
  content text,
  title text,
  source text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
set search_path = ''
as $$
  select
    d.id,
    d.content,
    d.title,
    d.source,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents as d
  where (filter_source is null or d.source = filter_source)
    and 1 - (d.embedding <=> query_embedding) >= match_threshold
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 0);
$$;

create or replace function public.count_unique_visitors_today()
returns bigint
language sql
stable
set search_path = ''
as $$
  select count(distinct v.visitor_id)
  from public.visitors as v
  where v.created_at >= date_trunc('day', now());
$$;

-- Edge Functions check their runtime secrets first. This provides backwards
-- compatibility with secrets that were previously stored in Supabase Vault.
create or replace function public.read_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select v.decrypted_secret
  from vault.decrypted_secrets as v
  where v.name = secret_name
  limit 1;
$$;

revoke all on function public.match_documents(extensions.vector, double precision, integer, text) from public, anon, authenticated;
revoke all on function public.count_unique_visitors_today() from public, anon, authenticated;
revoke all on function public.read_secret(text) from public, anon, authenticated;

grant execute on function public.match_documents(extensions.vector, double precision, integer, text) to service_role;
grant execute on function public.count_unique_visitors_today() to service_role;
grant execute on function public.read_secret(text) to service_role;
