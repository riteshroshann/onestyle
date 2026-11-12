-- BESPOKE moodboards for Supabase. Run once, after schema.sql.
-- A board's scene lives in a row; its pictures live in the private "boards" storage bucket under the owner's id.
-- Only the owner can see or change either.

create table public.boards (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (length(title) <= 120),
  elements    jsonb not null default '[]'::jsonb,
  files       jsonb not null default '{}'::jsonb,   -- file id -> { path, mimeType, created }
  pictures    int  not null default 0,
  notes       int  not null default 0,
  cover       text check (cover is null or length(cover) <= 40000),  -- a tiny JPEG data URL for the history list
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index boards_owner_idx on public.boards (owner_id, updated_at desc);

alter table public.boards enable row level security;
create policy boards_select on public.boards for select to authenticated using (owner_id = auth.uid());
create policy boards_insert on public.boards for insert to authenticated with check (owner_id = auth.uid());
create policy boards_update on public.boards for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy boards_delete on public.boards for delete to authenticated using (owner_id = auth.uid());

-- Pictures: private, images only, 5 MB each, and every path starts with the owner's id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('boards', 'boards', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy board_files_select on storage.objects for select to authenticated
  using (bucket_id = 'boards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy board_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'boards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy board_files_update on storage.objects for update to authenticated
  using (bucket_id = 'boards' and (storage.foldername(name))[1] = auth.uid()::text);
create policy board_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'boards' and (storage.foldername(name))[1] = auth.uid()::text);
