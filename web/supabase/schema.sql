-- BESPOKE marketplace schema for Supabase. Run once in the SQL editor.
-- Everything is locked down with row-level security: nobody reads a row unless a policy below says they may.

-- ---------------------------------------------------------------- profiles
-- One row per sign-up, keyed by the auth user id. Makers are public to signed-in people; customers are private.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('customer', 'maker')),
  name        text not null check (length(trim(name)) > 0),
  email       text not null,
  city        text not null default '',
  craft       text check (craft is null or craft in ('Fashion designer', 'Tailor', 'Boutique')),
  specialties text[] not null default '{}',
  bio         text,
  created_at  timestamptz not null default now()
);
create index profiles_role_idx on public.profiles (role);

-- Profiles are created by this trigger from the details sent at sign-up. That works even when the
-- project requires email confirmation, when the new person has no session yet.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, name, email, city, craft, specialties, bio)
  values (
    new.id,
    case when meta ->> 'role' = 'maker' then 'maker' else 'customer' end,
    coalesce(nullif(trim(meta ->> 'name'), ''), 'Unnamed'),
    new.email,
    coalesce(meta ->> 'city', ''),
    nullif(meta ->> 'craft', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(meta -> 'specialties', '[]'::jsonb))), '{}'),
    nullif(meta ->> 'bio', '')
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- requests
-- A design sent by a customer to a maker. The design is a frozen snapshot.
create table public.requests (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.profiles (id) on delete cascade,
  customer_name text not null,
  maker_id      uuid not null references public.profiles (id) on delete cascade,
  maker_name    text not null,
  design        jsonb not null,
  status        text not null default 'new' check (status in ('new', 'needs-info', 'accepted', 'in-progress', 'ready', 'declined')),
  missing       text[] not null default '{}',
  last_message  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index requests_customer_idx on public.requests (customer_id, updated_at desc);
create index requests_maker_idx on public.requests (maker_id, updated_at desc);

-- ---------------------------------------------------------------- messages
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  sender_name text not null,
  kind        text not null default 'text' check (kind in ('text', 'missing', 'status')),
  body        text not null check (length(trim(body)) > 0 and length(body) <= 2000),
  created_at  timestamptz not null default now()
);
create index messages_thread_idx on public.messages (request_id, created_at);

-- ---------------------------------------------------------------- reads
-- When each person last opened each thread. Unread is whatever the other party sent after that.
create table public.reads (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  request_id   uuid not null references public.requests (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- ---------------------------------------------------------------- helpers
-- True when the signed-in person is the customer or the maker of the request.
create function public.is_party(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.requests r
    where r.id = rid and auth.uid() in (r.customer_id, r.maker_id)
  )
$$;

-- True when the signed-in person is the maker of the request.
create function public.is_maker_of(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.requests r where r.id = rid and r.maker_id = auth.uid())
$$;

-- Every new message moves the request's activity forward, whoever sent it.
create function public.touch_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.requests
     set updated_at = new.created_at,
         last_message = case when length(new.body) > 140 then left(new.body, 139) || '…' else new.body end
   where id = new.request_id;
  return new;
end $$;

create trigger on_message_created after insert on public.messages
  for each row execute function public.touch_request();

-- Unread count per request for the signed-in person. Runs with their rights, so row-level security still applies.
create function public.unread_counts() returns table (request_id uuid, unread bigint)
language sql stable as $$
  select m.request_id, count(*)
    from public.messages m
    left join public.reads r on r.request_id = m.request_id and r.user_id = auth.uid()
   where m.sender_id <> auth.uid()
     and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
   group by m.request_id
$$;

-- Marks a thread read as of now, using the server's clock so it lines up with message times.
create function public.mark_read(rid uuid) returns void
language sql as $$
  insert into public.reads (user_id, request_id, last_read_at) values (auth.uid(), rid, now())
  on conflict (user_id, request_id) do update set last_read_at = now()
$$;

-- ---------------------------------------------------------------- row-level security
alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.messages enable row level security;
alter table public.reads    enable row level security;

-- Profiles: signed-in people see makers and themselves; each person edits only their own row.
create policy profiles_select on public.profiles for select to authenticated
  using (role = 'maker' or id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Role and email never change after sign-up.
revoke update on public.profiles from authenticated;
grant update (name, city, craft, specialties, bio) on public.profiles to authenticated;

-- Requests: only the two parties can see one; only a customer can create one, as themselves, and only for a maker.
create policy requests_select on public.requests for select to authenticated
  using (auth.uid() in (customer_id, maker_id));
create policy requests_insert on public.requests for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'new'
    and missing = '{}'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer')
    and exists (select 1 from public.profiles p where p.id = maker_id and p.role = 'maker')
  );
-- Only the maker changes a request, and only its status and missing details.
create policy requests_update on public.requests for update to authenticated
  using (maker_id = auth.uid()) with check (maker_id = auth.uid());
revoke update on public.requests from authenticated;
grant update (status, missing) on public.requests to authenticated;

-- Messages: both parties read; either may write as themselves; only the maker posts missing-detail and status notes.
create policy messages_select on public.messages for select to authenticated
  using (public.is_party(request_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_party(request_id)
    and (kind = 'text' or public.is_maker_of(request_id))
  );

-- Reads: each person manages only their own rows, for threads they are part of.
create policy reads_select on public.reads for select to authenticated
  using (user_id = auth.uid());
create policy reads_insert on public.reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_party(request_id));
create policy reads_update on public.reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- realtime
-- Changes stream to the browser, filtered by the policies above.
alter publication supabase_realtime add table public.requests, public.messages;
