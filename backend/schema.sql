create table if not exists user_progress (
  user_id text primary key,
  state jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  schema_version integer not null default 1,
  last_client_updated_at timestamptz,
  current_day integer,
  completion_pct numeric,
  last_active_at timestamptz not null default now(),
  domain_strengths jsonb not null default '{}'::jsonb,
  audio_completion_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_progress_updated_at_idx
  on user_progress (updated_at desc);

create index if not exists user_progress_last_active_idx
  on user_progress (last_active_at desc);

create table if not exists progress_events (
  id bigserial primary key,
  user_id text not null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists progress_events_user_created_idx
  on progress_events (user_id, created_at desc);
