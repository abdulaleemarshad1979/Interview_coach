-- Interview Coach: Supabase (Postgres) schema.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- The API server uses the service-role key (bypasses RLS). RLS below protects direct client access:
-- owners may only read their own rows, and nothing is writable with the anon/authenticated keys.

create table if not exists public.profiles (
  id text primary key,                       -- roll number (e.g. 24P31A1201)
  owner_id text,
  roll_number text not null default '',
  name text not null default '',
  department text not null default '',
  class_section text not null default '',
  class_id text,
  attendance numeric,
  college_assessments jsonb not null default '[]',
  is_synced boolean not null default false,
  github_username text not null default '',
  resume_file_name text not null default '',
  avatar_url text not null default '',       -- /api/photo/<key> or a Supabase Storage URL; never inline base64
  photo_source_url text not null default '', -- portal photo URL used for the no-login background refresh
  assigned_proctor_id text,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_owner_idx on public.profiles (owner_id);
create index if not exists profiles_class_idx on public.profiles (class_id) where class_id is not null;

create table if not exists public.github_repos (
  owner_id text not null,
  repo_id bigint not null,
  data jsonb not null,                       -- name, description, languages, README excerpt, recent commits
  pushed_at text,
  synced_at timestamptz not null default now(),
  primary key (owner_id, repo_id)            -- the delta check is a set lookup on this key
);

create table if not exists public.interview_sessions (
  id uuid primary key,
  owner_id text not null,
  version integer not null default 0,
  schema_version integer not null default 1,
  -- denormalised so history lists never download the transcript payload
  state text not null,
  target_role text not null default '',
  mode text not null default '',
  answer_count integer not null default 0,
  overall_score integer,
  payload jsonb not null,
  operation jsonb,
  operation_expires_at bigint,
  requests jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists interview_sessions_owner_created_idx on public.interview_sessions (owner_id, created_at desc, id desc);

create table if not exists public.interview_turns (
  session_id uuid not null references public.interview_sessions (id) on delete cascade,
  turn_id uuid not null,
  seq integer not null,
  role text not null check (role in ('interviewer', 'candidate')),
  question_id text,
  body text not null,
  delivery jsonb,
  created_at timestamptz not null,
  primary key (session_id, turn_id)
);
create index if not exists interview_turns_order_idx on public.interview_turns (session_id, seq);

create table if not exists public.interview_expression_scores (
  session_id uuid primary key references public.interview_sessions (id) on delete cascade,
  owner_id text not null,
  delivery_score integer,
  eye_contact integer, presence integer, pacing integer, fluency integer, hesitation integer,
  words_per_minute numeric, fillers_per_100_words numeric,
  answers_with_camera integer not null default 0, answers_with_voice integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_reports (
  id uuid primary key,
  session_id uuid not null unique references public.interview_sessions (id) on delete cascade,
  owner_id text not null,
  overall_score integer,
  content_score integer,
  summary text not null default '',
  report jsonb not null,
  provider text, model text,
  created_at timestamptz not null default now()
);
create index if not exists interview_reports_owner_idx on public.interview_reports (owner_id, created_at desc);

create table if not exists public.discussion_sessions (
  id uuid primary key,
  owner_id text not null,
  payload jsonb not null,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discussion_sessions_owner_idx on public.discussion_sessions (owner_id, created_at desc);

-- Row Level Security: owners read their own rows; all writes go through the service role.
do $$
declare t text;
begin
  foreach t in array array['profiles','github_repos','interview_sessions','interview_turns','interview_expression_scores','interview_reports','discussion_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
drop policy if exists owner_read on public.profiles;
create policy owner_read on public.profiles for select to authenticated using (owner_id = auth.uid()::text);
drop policy if exists owner_read on public.github_repos;
create policy owner_read on public.github_repos for select to authenticated using (owner_id = auth.uid()::text);
drop policy if exists owner_read on public.interview_sessions;
create policy owner_read on public.interview_sessions for select to authenticated using (owner_id = auth.uid()::text);
drop policy if exists owner_read on public.interview_expression_scores;
create policy owner_read on public.interview_expression_scores for select to authenticated using (owner_id = auth.uid()::text);
drop policy if exists owner_read on public.interview_reports;
create policy owner_read on public.interview_reports for select to authenticated using (owner_id = auth.uid()::text);
drop policy if exists owner_read on public.discussion_sessions;
create policy owner_read on public.discussion_sessions for select to authenticated using (owner_id = auth.uid()::text);
drop policy if exists owner_read on public.interview_turns;
create policy owner_read on public.interview_turns for select to authenticated
  using (exists (select 1 from public.interview_sessions s where s.id = session_id and s.owner_id = auth.uid()::text));

-- Atomic state-machine operations (mirror the optimistic-concurrency rules of the Mongo store).
create or replace function public.now_ms() returns bigint language sql stable as
$$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function public.interview_claim(p_owner text, p_id uuid, p_version int, p_op jsonb)
returns setof public.interview_sessions language sql as $$
  update public.interview_sessions
     set operation = p_op, operation_expires_at = (p_op->>'expiresAt')::bigint, updated_at = now(),
         version = version + 1, payload = jsonb_set(payload, '{isProcessing}', 'true')
   where id = p_id and owner_id = p_owner and version = p_version
     and (operation is null or operation_expires_at <= public.now_ms())
  returning *;
$$;

-- One round trip persists the session row, the Q&A log, the expression scores and the report.
create or replace function public.interview_save(p_owner text, p_id uuid, p_op_id text, p_payload jsonb, p_requests jsonb, p_release boolean)
returns setof public.interview_sessions language plpgsql as $$
declare saved public.interview_sessions;
begin
  update public.interview_sessions s
     set payload = jsonb_set(p_payload, '{isProcessing}', to_jsonb(not p_release)), requests = p_requests,
         state = p_payload->>'state',
         answer_count = (select count(*) from jsonb_array_elements(p_payload->'turns') t where t->>'role' = 'candidate'),
         overall_score = nullif(p_payload#>>'{report,overallScore}', '')::int,
         updated_at = now(), version = s.version + 1,
         operation = case when p_release then null else s.operation end,
         operation_expires_at = case when p_release then null else s.operation_expires_at end
   where s.id = p_id and s.owner_id = p_owner and s.operation->>'id' = p_op_id and s.operation_expires_at > public.now_ms()
  returning * into saved;
  if not found then return; end if;

  insert into public.interview_turns (session_id, turn_id, seq, role, question_id, body, delivery, created_at)
  select p_id, (t.value->>'id')::uuid, t.ordinality - 1, t.value->>'role', t.value->>'questionId', t.value->>'text', t.value->'delivery', (t.value->>'createdAt')::timestamptz
    from jsonb_array_elements(p_payload->'turns') with ordinality as t(value, ordinality)
  on conflict (session_id, turn_id) do nothing;

  if p_payload->'report' is not null and jsonb_typeof(p_payload->'report') = 'object' then
    insert into public.interview_reports (id, session_id, owner_id, overall_score, content_score, summary, report, provider, model)
    values ((p_payload#>>'{report,id}')::uuid, p_id, p_owner, nullif(p_payload#>>'{report,overallScore}', '')::int,
            nullif(p_payload#>>'{report,contentScore}', '')::int, coalesce(p_payload#>>'{report,summary}', ''),
            p_payload->'report', p_payload#>>'{report,provider}', p_payload#>>'{report,model}')
    on conflict (session_id) do nothing;
    if p_payload#>'{report,delivery}' is not null then
      insert into public.interview_expression_scores (session_id, owner_id, delivery_score, eye_contact, presence, pacing, fluency, hesitation,
        words_per_minute, fillers_per_100_words, answers_with_camera, answers_with_voice)
      values (p_id, p_owner, nullif(p_payload#>>'{report,delivery,score}', '')::int,
        nullif(p_payload#>>'{report,delivery,components,eyeContact}', '')::int, nullif(p_payload#>>'{report,delivery,components,presence}', '')::int,
        nullif(p_payload#>>'{report,delivery,components,pacing}', '')::int, nullif(p_payload#>>'{report,delivery,components,fluency}', '')::int,
        nullif(p_payload#>>'{report,delivery,components,hesitation}', '')::int,
        nullif(p_payload#>>'{report,delivery,wordsPerMinute}', '')::numeric, nullif(p_payload#>>'{report,delivery,fillersPer100Words}', '')::numeric,
        coalesce(nullif(p_payload#>>'{report,delivery,answersWithCamera}', '')::int, 0), coalesce(nullif(p_payload#>>'{report,delivery,answersWithVoice}', '')::int, 0))
      on conflict (session_id) do nothing;
    end if;
  end if;
  return next saved;
end $$;

create or replace function public.interview_release(p_owner text, p_id uuid, p_op_id text, p_error jsonb)
returns void language sql as $$
  update public.interview_sessions
     set operation = null, operation_expires_at = null, updated_at = now(), version = version + 1,
         payload = jsonb_set(jsonb_set(payload, '{isProcessing}', 'false'), '{lastError}', coalesce(p_error, 'null'::jsonb))
   where id = p_id and owner_id = p_owner and operation->>'id' = p_op_id;
$$;

create or replace function public.interview_cancel(p_owner text, p_id uuid, p_expired_only boolean, p_version int)
returns setof public.interview_sessions language sql as $$
  update public.interview_sessions
     set operation = null, operation_expires_at = null, updated_at = now(), version = version + 1,
         payload = jsonb_set(payload, '{isProcessing}', 'false')
   where id = p_id and owner_id = p_owner and (p_version is null or version = p_version)
     and (not p_expired_only or operation is null or operation_expires_at <= public.now_ms())
  returning *;
$$;

-- Only the service role may call the state-machine functions.
revoke all on function public.interview_claim(text, uuid, int, jsonb), public.interview_save(text, uuid, text, jsonb, jsonb, boolean),
  public.interview_release(text, uuid, text, jsonb), public.interview_cancel(text, uuid, boolean, int) from public, anon, authenticated;
grant execute on function public.interview_claim(text, uuid, int, jsonb), public.interview_save(text, uuid, text, jsonb, jsonb, boolean),
  public.interview_release(text, uuid, text, jsonb), public.interview_cancel(text, uuid, boolean, int) to service_role;
