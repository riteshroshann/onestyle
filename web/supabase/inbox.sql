-- BESPOKE inbox additions. Run once in the SQL editor, after schema.sql. Additive and safe to run twice.
-- The site works without it; it adds read sync across devices and the typing indicator.

-- ---------------------------------------------------------------- read receipts follow you
-- Opening a thread on your phone clears its unread badge on your laptop. Realtime applies reads_select,
-- so each person only ever hears about their own rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reads'
  ) then
    alter publication supabase_realtime add table public.reads;
  end if;
end $$;

-- ---------------------------------------------------------------- typing indicator
-- The inbox broadcasts "typing" on a private channel named typing:<request id>. Private channels are closed
-- unless a policy opens them, so only the customer and the maker of that request may listen or send.
-- requests_select already limits the lookup to requests the person is a party to.
drop policy if exists typing_listen on realtime.messages;
create policy typing_listen on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (select 1 from public.requests r where 'typing:' || r.id::text = (select realtime.topic()))
  );

drop policy if exists typing_send on realtime.messages;
create policy typing_send on realtime.messages for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (select 1 from public.requests r where 'typing:' || r.id::text = (select realtime.topic()))
  );

