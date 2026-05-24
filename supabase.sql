create table if not exists public.boards (
  id text primary key,
  data jsonb not null default '{"months": {}, "posts": []}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.boards enable row level security;

create policy "Anyone with anon key can read boards"
on public.boards
for select
to anon
using (true);

create policy "Anyone with anon key can insert boards"
on public.boards
for insert
to anon
with check (true);

create policy "Anyone with anon key can update boards"
on public.boards
for update
to anon
using (true)
with check (true);
