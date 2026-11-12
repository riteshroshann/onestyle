-- BESPOKE studio designs for Supabase. Run once, after schema.sql.
-- A signed-in person's designs, so the studio resumes the latest one on any device. Only the owner can see or change them.

create table public.designs (
  id           uuid primary key,
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null default '' check (length(title) <= 120),
  spec         jsonb not null,
  msgs         jsonb not null default '[]'::jsonb,
  measurements jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index designs_owner_idx on public.designs (owner_id, updated_at desc);

alter table public.designs enable row level security;
create policy designs_select on public.designs for select to authenticated using (owner_id = auth.uid());
create policy designs_insert on public.designs for insert to authenticated with check (owner_id = auth.uid());
create policy designs_update on public.designs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy designs_delete on public.designs for delete to authenticated using (owner_id = auth.uid());
