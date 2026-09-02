create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  duration_sec integer not null,
  piece_title text not null,
  accuracy real not null,
  stars integer not null,
  source text not null default 'desktop'
);

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own sessions" on public.sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
