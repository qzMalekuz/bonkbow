-- Core schema: profiles + scores + leaderboard + purchases (skins) + rooms (multiplayer).
-- Run in the Supabase SQL editor (or `supabase db push`) on a fresh project.
-- Auth → Providers → enable **Web3 Wallet** (Sign in with Solana). Add the app
-- identity URL (src/solana/config.ts) to the allowed URLs. Also enable
-- "Allow anonymous sign-ins" (guest leaderboard identity before wallet sign-in).
-- Database → Replication: enable realtime for public.rooms (or keep the
-- publication line at the bottom).

-- ───────────────────────────── profiles ──────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  wallet_address text unique,            -- Solana address from Sign in with Solana
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "select own profile" on public.profiles;
create policy "select own profile" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (auth.uid() = id);
-- No client INSERT policy: rows are created by the trigger below.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- wallet_address is SERVER-DERIVED from the Sign in with Solana identity
-- (auth.identities.provider = 'web3'; identity_data->>'address' is the wallet
-- that signed the SIWS message, provider_id is 'web3:solana:<address>').
-- Clients can never set or change it — otherwise anyone could claim another
-- player's address and hijack their purchases.
create or replace function public.sync_wallet_from_identity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  addr text;
begin
  if new.provider = 'web3' then
    addr := coalesce(new.identity_data ->> 'address', regexp_replace(new.provider_id, '^web3:[^:]+:', ''));
    if addr is null or addr = '' then
      return new;
    end if;
    insert into public.profiles (id, wallet_address, updated_at)
    values (new.user_id, addr, now())
    on conflict (id) do update
      set wallet_address = excluded.wallet_address, updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_web3_identity_created on auth.identities;
create trigger on_web3_identity_created
  after insert on auth.identities
  for each row execute function public.sync_wallet_from_identity();

-- Reject client-side edits of wallet_address (PostgREST runs as anon/authenticated;
-- triggers and edge functions using the service role are not affected).
create or replace function public.protect_wallet_address()
returns trigger
language plpgsql
as $$
begin
  if new.wallet_address is distinct from old.wallet_address
     and current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'wallet_address is managed by Sign in with Solana';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_wallet on public.profiles;
create trigger profiles_protect_wallet
  before update on public.profiles
  for each row execute function public.protect_wallet_address();

-- ───────────────────────────── scores ────────────────────────────────────────
create table if not exists public.scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  wallet_address text,
  score integer not null check (score >= 0 and score < 100000),
  created_at timestamptz not null default now()
);
create index if not exists scores_user_id_idx on public.scores (user_id);
create index if not exists scores_score_idx on public.scores (score desc);

-- The leaderboard key comes from the caller's verified profile, never the client.
create or replace function public.stamp_score_wallet()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  select wallet_address into new.wallet_address from public.profiles where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists scores_stamp_wallet on public.scores;
create trigger scores_stamp_wallet
  before insert on public.scores
  for each row execute function public.stamp_score_wallet();

alter table public.scores enable row level security;
drop policy if exists "insert own score" on public.scores;
create policy "insert own score" on public.scores
  for insert with check (auth.uid() = user_id);
drop policy if exists "select own scores" on public.scores;
create policy "select own scores" on public.scores
  for select using (auth.uid() = user_id);

create or replace view public.leaderboard
with (security_invoker = false) as
  select wallet_address, max(score) as best
  from public.scores
  where wallet_address is not null
  group by wallet_address
  order by best desc
  limit 100;
grant select on public.leaderboard to anon, authenticated;

-- ───────────────────────────── purchases (skins) ─────────────────────────────
-- Written ONLY by the verify-purchase edge function (service role) after the
-- SOL or SKR transfer is confirmed on-chain. Clients can read their own rows.
create table if not exists public.purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  skin_id text not null,
  signature text not null unique,        -- idempotency: one grant per transaction
  currency text not null default 'SOL' check (currency in ('SOL', 'SKR')),
  lamports bigint not null check (lamports > 0), -- base units of `currency`
  wallet_address text not null,
  created_at timestamptz not null default now()
);
-- Upgrade path for databases created before SKR payments existed.
alter table public.purchases add column if not exists currency text not null default 'SOL';
create index if not exists purchases_user_id_idx on public.purchases (user_id);

alter table public.purchases enable row level security;
drop policy if exists "select own purchases" on public.purchases;
create policy "select own purchases" on public.purchases
  for select using (auth.uid() = user_id);
-- No INSERT/UPDATE/DELETE policies: service role only.

-- ───────────────────────────── rooms (multiplayer) ───────────────────────────
-- A room is a 6-char code two players meet at. Gameplay traffic (shots,
-- results, presence) goes over Supabase Realtime broadcast on channel
-- `room:<code>`; the row only holds membership + the layout seed.
create table if not exists public.rooms (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references public.profiles (id) on delete cascade,
  guest_id uuid references public.profiles (id) on delete set null,
  seed integer not null,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  winner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rooms_created_at_idx on public.rooms (created_at);

alter table public.rooms enable row level security;
drop policy if exists "members select room" on public.rooms;
create policy "members select room" on public.rooms
  for select using (auth.uid() = host_id or auth.uid() = guest_id or status = 'waiting');
drop policy if exists "host inserts room" on public.rooms;
create policy "host inserts room" on public.rooms
  for insert with check (auth.uid() = host_id);
drop policy if exists "members update room" on public.rooms;
create policy "members update room" on public.rooms
  for update using (auth.uid() = host_id or auth.uid() = guest_id);

-- Atomic join: only fills an empty seat on a waiting room. Returns the row.
create or replace function public.join_room(p_code text)
returns public.rooms
language plpgsql security definer set search_path = public
as $$
declare
  r public.rooms;
begin
  update public.rooms
     set guest_id = auth.uid(), status = 'playing', updated_at = now()
   where code = upper(p_code)
     and status = 'waiting'
     and guest_id is null
     and host_id <> auth.uid()
  returning * into r;
  if r.code is null then
    raise exception 'room not available';
  end if;
  return r;
end;
$$;
revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

-- Realtime on rooms so the host sees the guest arrive.
alter table public.rooms replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

-- Housekeeping: drop stale waiting rooms (call from a cron or ignore).
create or replace function public.purge_stale_rooms()
returns void language sql security definer as $$
  delete from public.rooms where status = 'waiting' and created_at < now() - interval '1 hour';
$$;
