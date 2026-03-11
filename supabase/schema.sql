create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('coach', 'client')),
  name text not null default '',
  age integer not null default 30,
  sex text not null default 'male' check (sex in ('male', 'female')),
  height numeric not null default 170,
  weight numeric not null default 70,
  waist_cm numeric,
  hip_cm numeric,
  chest_cm numeric,
  arm_cm numeric,
  thigh_cm numeric,
  goal text not null default '',
  nap numeric not null default 1.4,
  bmr_method text not null default 'mifflin',
  deficit numeric not null default 20,
  coach_message text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists bmr_method text not null default 'mifflin';
alter table public.profiles
  add column if not exists waist_cm numeric;
alter table public.profiles
  add column if not exists hip_cm numeric;
alter table public.profiles
  add column if not exists chest_cm numeric;
alter table public.profiles
  add column if not exists arm_cm numeric;
alter table public.profiles
  add column if not exists thigh_cm numeric;

create table if not exists public.weights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  weight numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  message text not null default '',
  bilan jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_menus (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  notes text not null default '',
  plan jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create table if not exists public.client_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  image_path text not null,
  image_url text not null,
  caption text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  energy smallint not null check (energy between 1 and 10),
  hunger smallint not null check (hunger between 1 and 10),
  sleep smallint not null check (sleep between 1 and 10),
  stress smallint not null check (stress between 1 and 10),
  adherence smallint not null check (adherence between 1 and 10),
  score numeric(5,2) not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create table if not exists public.weekly_goals (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  goals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'cancelled')),
  meet_url text,
  google_event_id text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments
  drop constraint if exists appointments_client_id_week_start_key;

create unique index if not exists appointments_slot_unique
on public.appointments(starts_at)
where status in ('requested', 'confirmed');

create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  consumed_on date not null,
  fdc_id bigint,
  food_name text not null,
  brand_name text not null default '',
  quantity_g numeric(8,2) not null check (quantity_g > 0),
  calories_per_100g numeric(10,2) not null default 0,
  protein_per_100g numeric(10,2) not null default 0,
  carbs_per_100g numeric(10,2) not null default 0,
  fat_per_100g numeric(10,2) not null default 0,
  calories numeric(10,2) not null default 0,
  protein numeric(10,2) not null default 0,
  carbs numeric(10,2) not null default 0,
  fat numeric(10,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_logs_client_date_idx
on public.food_logs(client_id, consumed_on desc, created_at desc);

alter table public.appointments add column if not exists google_event_id text;

create table if not exists public.archived_clients (
  id uuid primary key default gen_random_uuid(),
  original_client_id uuid not null,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  archived_at timestamptz not null default now(),
  profile jsonb not null,
  weights jsonb not null default '[]'::jsonb,
  reports jsonb not null default '[]'::jsonb,
  weekly_menus jsonb not null default '[]'::jsonb,
  client_photos jsonb not null default '[]'::jsonb,
  weekly_checkins jsonb not null default '[]'::jsonb,
  weekly_goals jsonb not null default '[]'::jsonb
);

alter table public.archived_clients add column if not exists weekly_menus jsonb not null default '[]'::jsonb;
alter table public.archived_clients add column if not exists client_photos jsonb not null default '[]'::jsonb;
alter table public.archived_clients add column if not exists weekly_checkins jsonb not null default '[]'::jsonb;
alter table public.archived_clients add column if not exists weekly_goals jsonb not null default '[]'::jsonb;

create table if not exists public.client_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (client_id, snapshot_date)
);

create table if not exists public.app_config (
  id smallint primary key default 1 check (id = 1),
  owner_coach_id uuid unique references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  client_id uuid references public.profiles(id) on delete set null,
  type text not null default 'info',
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) > 0 and char_length(message) <= 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_client_created_idx
on public.chat_messages(client_id, created_at asc);

create index if not exists chat_messages_coach_created_idx
on public.chat_messages(coach_id, created_at asc);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'inactive' check (
    status in (
      'inactive',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'paused'
    )
  ),
  plan_code text not null default 'essential' check (plan_code in ('essential', 'premium')),
  stripe_price_id text,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.subscriptions add column if not exists plan_code text;
alter table public.subscriptions add column if not exists stripe_price_id text;
update public.subscriptions
set plan_code = coalesce(nullif(plan_code, ''), 'essential')
where plan_code is null or plan_code = '';
alter table public.subscriptions alter column plan_code set default 'essential';
alter table public.subscriptions alter column plan_code set not null;
alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
alter table public.subscriptions
  add constraint subscriptions_plan_code_check
  check (plan_code in ('essential', 'premium'));

create index if not exists subscriptions_status_idx on public.subscriptions(status);

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  content text not null default '',
  cover_image_url text not null default '',
  category text not null default 'Astuces',
  read_minutes smallint not null default 4 check (read_minutes between 1 and 60),
  is_published boolean not null default true,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_published_idx on public.blog_posts(is_published, published_at desc);

alter table public.profiles enable row level security;
alter table public.weights enable row level security;
alter table public.reports enable row level security;
alter table public.weekly_menus enable row level security;
alter table public.client_photos enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.weekly_goals enable row level security;
alter table public.appointments enable row level security;
alter table public.food_logs enable row level security;
alter table public.archived_clients enable row level security;
alter table public.client_snapshots enable row level security;
alter table public.app_config enable row level security;
alter table public.notifications enable row level security;
alter table public.chat_messages enable row level security;
alter table public.subscriptions enable row level security;
alter table public.blog_posts enable row level security;

create or replace function public.is_owner_coach()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_config c
    join public.profiles p on p.id = c.owner_coach_id
    where c.id = 1
      and p.id = auth.uid()
      and p.role = 'coach'
  );
$$;

revoke all on function public.is_owner_coach() from public;
grant execute on function public.is_owner_coach() to authenticated;

create or replace function public.notify_client(
  p_client_id uuid,
  p_type text,
  p_title text,
  p_body text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_owner_coach() then
    raise exception 'Only owner coach can notify a client';
  end if;

  insert into public.notifications (recipient_id, actor_id, client_id, type, title, body)
  values (p_client_id, auth.uid(), p_client_id, coalesce(p_type, 'info'), p_title, coalesce(p_body, ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.notify_client(uuid, text, text, text) from public;
grant execute on function public.notify_client(uuid, text, text, text) to authenticated;

create or replace function public.notify_owner_coach(
  p_type text,
  p_title text,
  p_body text default '',
  p_client_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_id uuid;
begin
  select owner_coach_id into v_owner from public.app_config where id = 1;
  if v_owner is null then
    raise exception 'owner_coach_id not set in app_config';
  end if;

  insert into public.notifications (recipient_id, actor_id, client_id, type, title, body)
  values (v_owner, auth.uid(), p_client_id, coalesce(p_type, 'info'), p_title, coalesce(p_body, ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.notify_owner_coach(text, text, text, uuid) from public;
grant execute on function public.notify_owner_coach(text, text, text, uuid) to authenticated;

drop policy if exists "app_config_owner_select" on public.app_config;
create policy "app_config_owner_select"
on public.app_config
for select
using (public.is_owner_coach());

drop policy if exists "app_config_owner_update" on public.app_config;
create policy "app_config_owner_update"
on public.app_config
for update
using (public.is_owner_coach())
with check (public.is_owner_coach());

drop policy if exists "notifications_select_recipient_or_owner" on public.notifications;
create policy "notifications_select_recipient_or_owner"
on public.notifications
for select
using (
  recipient_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "notifications_insert_authenticated" on public.notifications;
create policy "notifications_insert_authenticated"
on public.notifications
for insert
with check (actor_id = auth.uid());

drop policy if exists "notifications_update_recipient_or_owner" on public.notifications;
create policy "notifications_update_recipient_or_owner"
on public.notifications
for update
using (
  recipient_id = auth.uid()
  or public.is_owner_coach()
)
with check (
  recipient_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "notifications_delete_recipient_or_owner" on public.notifications;
create policy "notifications_delete_recipient_or_owner"
on public.notifications
for delete
using (
  recipient_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "chat_messages_select_client_or_owner" on public.chat_messages;
create policy "chat_messages_select_client_or_owner"
on public.chat_messages
for select
using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "chat_messages_insert_client_or_owner" on public.chat_messages;
create policy "chat_messages_insert_client_or_owner"
on public.chat_messages
for insert
with check (
  sender_id = auth.uid()
  and (
    client_id = auth.uid()
    or public.is_owner_coach()
  )
);

drop policy if exists "chat_messages_update_read_client_or_owner" on public.chat_messages;
create policy "chat_messages_update_read_client_or_owner"
on public.chat_messages
for update
using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
)
with check (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "chat_messages_delete_client_or_owner" on public.chat_messages;
create policy "chat_messages_delete_client_or_owner"
on public.chat_messages
for delete
using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "subscriptions_select_self_or_owner" on public.subscriptions;
create policy "subscriptions_select_self_or_owner"
on public.subscriptions
for select
using (
  user_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "subscriptions_update_owner_only" on public.subscriptions;
create policy "subscriptions_update_owner_only"
on public.subscriptions
for update
using (public.is_owner_coach())
with check (public.is_owner_coach());

drop policy if exists "blog_posts_select_published" on public.blog_posts;
create policy "blog_posts_select_published"
on public.blog_posts
for select
using (
  is_published = true
  or public.is_owner_coach()
);

drop policy if exists "blog_posts_insert_owner" on public.blog_posts;
create policy "blog_posts_insert_owner"
on public.blog_posts
for insert
with check (public.is_owner_coach());

drop policy if exists "blog_posts_update_owner" on public.blog_posts;
create policy "blog_posts_update_owner"
on public.blog_posts
for update
using (public.is_owner_coach())
with check (public.is_owner_coach());

drop policy if exists "blog_posts_delete_owner" on public.blog_posts;
create policy "blog_posts_delete_owner"
on public.blog_posts
for delete
using (public.is_owner_coach());

create or replace function public.appointment_week_start(p_starts_at timestamptz)
returns date
language sql
immutable
as $$
  select date_trunc('week', p_starts_at at time zone 'UTC')::date;
$$;

create or replace function public.set_appointment_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.coach_id is null then
    select owner_coach_id into v_owner from public.app_config where id = 1;
    if v_owner is null then
      raise exception 'owner_coach_id not set in app_config';
    end if;
    new.coach_id := v_owner;
  end if;

  new.week_start := public.appointment_week_start(new.starts_at);

  if new.ends_at is null then
    new.ends_at := new.starts_at + interval '45 minutes';
  end if;

  if new.ends_at <= new.starts_at then
    raise exception 'ends_at must be greater than starts_at';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.list_busy_appointment_slots(
  p_from timestamptz default now()
)
returns table(
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.starts_at, a.ends_at
  from public.appointments a
  where a.status in ('requested', 'confirmed')
    and a.starts_at >= p_from
    and (auth.uid() is null or a.client_id <> auth.uid())
  order by a.starts_at asc;
$$;

grant execute on function public.list_busy_appointment_slots(timestamptz) to authenticated;

drop trigger if exists trg_set_appointment_defaults on public.appointments;
create trigger trg_set_appointment_defaults
before insert or update on public.appointments
for each row
execute function public.set_appointment_defaults();

drop policy if exists "appointments_select_client_or_owner" on public.appointments;
create policy "appointments_select_client_or_owner"
on public.appointments
for select
using (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "appointments_insert_client_or_owner" on public.appointments;
create policy "appointments_insert_client_or_owner"
on public.appointments
for insert
with check (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "appointments_update_client_or_owner" on public.appointments;
create policy "appointments_update_client_or_owner"
on public.appointments
for update
using (
  client_id = auth.uid()
  or public.is_owner_coach()
)
with check (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "appointments_delete_client_or_owner" on public.appointments;
create policy "appointments_delete_client_or_owner"
on public.appointments
for delete
using (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "food_logs_select_client_or_owner" on public.food_logs;
create policy "food_logs_select_client_or_owner"
on public.food_logs
for select
using (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "food_logs_insert_client_or_owner" on public.food_logs;
create policy "food_logs_insert_client_or_owner"
on public.food_logs
for insert
with check (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "food_logs_update_client_or_owner" on public.food_logs;
create policy "food_logs_update_client_or_owner"
on public.food_logs
for update
using (
  client_id = auth.uid()
  or public.is_owner_coach()
)
with check (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "food_logs_delete_client_or_owner" on public.food_logs;
create policy "food_logs_delete_client_or_owner"
on public.food_logs
for delete
using (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "archived_clients_owner_select" on public.archived_clients;
create policy "archived_clients_owner_select"
on public.archived_clients
for select
using (public.is_owner_coach());

drop policy if exists "archived_clients_owner_insert" on public.archived_clients;
create policy "archived_clients_owner_insert"
on public.archived_clients
for insert
with check (public.is_owner_coach());

drop policy if exists "client_snapshots_owner_select" on public.client_snapshots;
create policy "client_snapshots_owner_select"
on public.client_snapshots
for select
using (public.is_owner_coach());

drop policy if exists "client_snapshots_owner_insert" on public.client_snapshots;
create policy "client_snapshots_owner_insert"
on public.client_snapshots
for insert
with check (public.is_owner_coach());

drop policy if exists "client_snapshots_owner_update" on public.client_snapshots;
create policy "client_snapshots_owner_update"
on public.client_snapshots
for update
using (public.is_owner_coach())
with check (public.is_owner_coach());

-- profiles
drop policy if exists "profiles_select_self_or_coach" on public.profiles;
create policy "profiles_select_self_or_coach"
on public.profiles
for select
using (
  auth.uid() = id
  or public.is_owner_coach()
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_self_or_coach" on public.profiles;
create policy "profiles_update_self_or_coach"
on public.profiles
for update
using (
  auth.uid() = id
  or public.is_owner_coach()
)
with check (
  auth.uid() = id
  or public.is_owner_coach()
);

-- weights
drop policy if exists "weights_select_self_or_coach" on public.weights;
create policy "weights_select_self_or_coach"
on public.weights
for select
using (
  user_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "weights_insert_self" on public.weights;
create policy "weights_insert_self"
on public.weights
for insert
with check (user_id = auth.uid());

drop policy if exists "weights_delete_self_or_coach" on public.weights;
create policy "weights_delete_self_or_coach"
on public.weights
for delete
using (
  user_id = auth.uid()
  or public.is_owner_coach()
);

-- reports
drop policy if exists "reports_select_client_or_coach" on public.reports;
create policy "reports_select_client_or_coach"
on public.reports
for select
using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "reports_insert_coach" on public.reports;
create policy "reports_insert_coach"
on public.reports
for insert
with check (
  coach_id = auth.uid()
  and public.is_owner_coach()
);

drop policy if exists "reports_delete_coach" on public.reports;
create policy "reports_delete_coach"
on public.reports
for delete
using (
  public.is_owner_coach()
);

-- weekly menus
drop policy if exists "weekly_menus_select_client_or_coach" on public.weekly_menus;
create policy "weekly_menus_select_client_or_coach"
on public.weekly_menus
for select
using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "weekly_menus_upsert_coach" on public.weekly_menus;
create policy "weekly_menus_upsert_coach"
on public.weekly_menus
for insert
with check (
  coach_id = auth.uid()
  and public.is_owner_coach()
);

drop policy if exists "weekly_menus_update_coach" on public.weekly_menus;
create policy "weekly_menus_update_coach"
on public.weekly_menus
for update
using (
  coach_id = auth.uid()
  and public.is_owner_coach()
)
with check (
  coach_id = auth.uid()
  and public.is_owner_coach()
);

drop policy if exists "weekly_menus_delete_coach" on public.weekly_menus;
create policy "weekly_menus_delete_coach"
on public.weekly_menus
for delete
using (
  coach_id = auth.uid()
  and public.is_owner_coach()
);

-- client photos
drop policy if exists "client_photos_select_client_or_coach" on public.client_photos;
create policy "client_photos_select_client_or_coach"
on public.client_photos
for select
using (
  client_id = auth.uid()
  or uploader_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "client_photos_insert_client" on public.client_photos;
create policy "client_photos_insert_client"
on public.client_photos
for insert
with check (
  client_id = auth.uid()
  and uploader_id = auth.uid()
);

drop policy if exists "client_photos_delete_owner_or_uploader" on public.client_photos;
create policy "client_photos_delete_owner_or_uploader"
on public.client_photos
for delete
using (
  uploader_id = auth.uid()
  or public.is_owner_coach()
);

-- weekly check-ins
drop policy if exists "weekly_checkins_select_client_or_coach" on public.weekly_checkins;
create policy "weekly_checkins_select_client_or_coach"
on public.weekly_checkins
for select
using (
  client_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "weekly_checkins_insert_self" on public.weekly_checkins;
create policy "weekly_checkins_insert_self"
on public.weekly_checkins
for insert
with check (
  client_id = auth.uid()
);

drop policy if exists "weekly_checkins_update_self" on public.weekly_checkins;
create policy "weekly_checkins_update_self"
on public.weekly_checkins
for update
using (
  client_id = auth.uid()
)
with check (
  client_id = auth.uid()
);

drop policy if exists "weekly_checkins_delete_client_or_coach" on public.weekly_checkins;
create policy "weekly_checkins_delete_client_or_coach"
on public.weekly_checkins
for delete
using (
  client_id = auth.uid()
  or public.is_owner_coach()
);

-- weekly goals
drop policy if exists "weekly_goals_select_client_or_coach" on public.weekly_goals;
create policy "weekly_goals_select_client_or_coach"
on public.weekly_goals
for select
using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
);

drop policy if exists "weekly_goals_insert_coach" on public.weekly_goals;
create policy "weekly_goals_insert_coach"
on public.weekly_goals
for insert
with check (
  coach_id = auth.uid()
  and public.is_owner_coach()
);

drop policy if exists "weekly_goals_update_client_or_coach" on public.weekly_goals;
create policy "weekly_goals_update_client_or_coach"
on public.weekly_goals
for update
using (
  client_id = auth.uid()
  or public.is_owner_coach()
)
with check (
  client_id = auth.uid()
  or public.is_owner_coach()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-photos',
  'client-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'blog-covers',
  'blog-covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "client_photos_storage_select" on storage.objects;
create policy "client_photos_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'client-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_owner_coach()
  )
);

drop policy if exists "client_photos_storage_insert" on storage.objects;
create policy "client_photos_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'client-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "client_photos_storage_delete" on storage.objects;
create policy "client_photos_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'client-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_owner_coach()
  )
);

drop policy if exists "blog_covers_storage_select" on storage.objects;
create policy "blog_covers_storage_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'blog-covers');

drop policy if exists "blog_covers_storage_insert_owner" on storage.objects;
create policy "blog_covers_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'blog-covers'
  and public.is_owner_coach()
);

drop policy if exists "blog_covers_storage_delete_owner" on storage.objects;
create policy "blog_covers_storage_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'blog-covers'
  and public.is_owner_coach()
);

create or replace function public.archive_and_delete_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_profile profiles%rowtype;
  v_weights jsonb;
  v_reports jsonb;
  v_weekly_menus jsonb;
  v_client_photos jsonb;
  v_weekly_checkins jsonb;
  v_weekly_goals jsonb;
begin
  if not public.is_owner_coach() then
    raise exception 'Only owner coach can archive clients';
  end if;

  select owner_coach_id into v_owner from public.app_config where id = 1;
  if v_owner is null then
    raise exception 'owner_coach_id not set in app_config';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_client_id and role = 'client';

  if not found then
    raise exception 'Client not found';
  end if;

  select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb)
  into v_weights
  from public.weights w
  where w.user_id = p_client_id;

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
  into v_reports
  from public.reports r
  where r.client_id = p_client_id;

  select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
  into v_weekly_menus
  from public.weekly_menus m
  where m.client_id = p_client_id;

  select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb)
  into v_client_photos
  from public.client_photos cp
  where cp.client_id = p_client_id;

  select coalesce(jsonb_agg(to_jsonb(wc)), '[]'::jsonb)
  into v_weekly_checkins
  from public.weekly_checkins wc
  where wc.client_id = p_client_id;

  select coalesce(jsonb_agg(to_jsonb(wg)), '[]'::jsonb)
  into v_weekly_goals
  from public.weekly_goals wg
  where wg.client_id = p_client_id;

  insert into public.archived_clients (
    original_client_id,
    coach_id,
    profile,
    weights,
    reports,
    weekly_menus,
    client_photos,
    weekly_checkins,
    weekly_goals
  )
  values (
    p_client_id,
    v_owner,
    to_jsonb(v_profile),
    v_weights,
    v_reports,
    v_weekly_menus,
    v_client_photos,
    v_weekly_checkins,
    v_weekly_goals
  );

  delete from public.profiles where id = p_client_id;
end;
$$;

revoke all on function public.archive_and_delete_client(uuid) from public;
grant execute on function public.archive_and_delete_client(uuid) to authenticated;

create or replace function public.create_client_snapshot(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_snapshot_id uuid;
  v_payload jsonb;
begin
  if not public.is_owner_coach() then
    raise exception 'Only owner coach can create snapshots';
  end if;

  select owner_coach_id into v_owner from public.app_config where id = 1;
  if v_owner is null then
    raise exception 'owner_coach_id not set in app_config';
  end if;

  if not exists (select 1 from public.profiles where id = p_client_id and role = 'client') then
    raise exception 'Client not found';
  end if;

  v_payload := jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_client_id),
    'weights', (select coalesce(jsonb_agg(to_jsonb(w)), '[]'::jsonb) from public.weights w where w.user_id = p_client_id),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from public.reports r where r.client_id = p_client_id),
    'weekly_menus', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.weekly_menus m where m.client_id = p_client_id),
    'client_photos', (select coalesce(jsonb_agg(to_jsonb(cp)), '[]'::jsonb) from public.client_photos cp where cp.client_id = p_client_id),
    'weekly_checkins', (select coalesce(jsonb_agg(to_jsonb(wc)), '[]'::jsonb) from public.weekly_checkins wc where wc.client_id = p_client_id),
    'weekly_goals', (select coalesce(jsonb_agg(to_jsonb(wg)), '[]'::jsonb) from public.weekly_goals wg where wg.client_id = p_client_id)
  );

  insert into public.client_snapshots (client_id, coach_id, snapshot_date, payload)
  values (p_client_id, v_owner, current_date, v_payload)
  on conflict (client_id, snapshot_date) do update
  set payload = excluded.payload,
      coach_id = excluded.coach_id
  returning id into v_snapshot_id;

  return v_snapshot_id;
end;
$$;

revoke all on function public.create_client_snapshot(uuid) from public;
grant execute on function public.create_client_snapshot(uuid) to authenticated;

create or replace function public.create_daily_snapshots()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_count integer := 0;
begin
  if not public.is_owner_coach() then
    raise exception 'Only owner coach can create snapshots';
  end if;

  for v_client_id in
    select id from public.profiles where role = 'client'
  loop
    perform public.create_client_snapshot(v_client_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.create_daily_snapshots() from public;
grant execute on function public.create_daily_snapshots() to authenticated;

create or replace function public.restore_archived_client(p_archive_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_archive public.archived_clients%rowtype;
  v_client_id uuid;
begin
  if not public.is_owner_coach() then
    raise exception 'Only owner coach can restore archived clients';
  end if;

  select owner_coach_id into v_owner from public.app_config where id = 1;
  if v_owner is null then
    raise exception 'owner_coach_id not set in app_config';
  end if;

  select * into v_archive from public.archived_clients where id = p_archive_id;
  if not found then
    raise exception 'Archive not found';
  end if;

  v_client_id := v_archive.original_client_id;

  insert into public.profiles (
    id, email, role, name, age, sex, height, weight, goal, nap, bmr_method, deficit, coach_message, updated_at, created_at
  )
  values (
    v_client_id,
    coalesce(v_archive.profile->>'email', concat(v_client_id::text, '@restored.local')),
    'client',
    coalesce(v_archive.profile->>'name', 'Client restaure'),
    coalesce((v_archive.profile->>'age')::int, 30),
    coalesce(v_archive.profile->>'sex', 'male'),
    coalesce((v_archive.profile->>'height')::numeric, 170),
    coalesce((v_archive.profile->>'weight')::numeric, 70),
    coalesce(v_archive.profile->>'goal', ''),
    coalesce((v_archive.profile->>'nap')::numeric, 1.4),
    coalesce(v_archive.profile->>'bmr_method', 'mifflin'),
    coalesce((v_archive.profile->>'deficit')::numeric, 20),
    coalesce(v_archive.profile->>'coach_message', ''),
    now(),
    now()
  )
  on conflict (id) do update
  set role = 'client',
      name = excluded.name,
      age = excluded.age,
      sex = excluded.sex,
      height = excluded.height,
      weight = excluded.weight,
      goal = excluded.goal,
      nap = excluded.nap,
      bmr_method = excluded.bmr_method,
      deficit = excluded.deficit,
      coach_message = excluded.coach_message,
      updated_at = now();

  insert into public.weights (user_id, date, weight, created_at)
  select v_client_id, x.date, x.weight, coalesce(x.created_at, now())
  from jsonb_to_recordset(v_archive.weights) as x(date date, weight numeric, created_at timestamptz)
  where not exists (
    select 1 from public.weights w
    where w.user_id = v_client_id and w.date = x.date and w.weight = x.weight
  );

  insert into public.reports (coach_id, client_id, date, message, bilan, created_at)
  select v_owner, v_client_id, x.date, coalesce(x.message, ''), coalesce(x.bilan, '{}'::jsonb), coalesce(x.created_at, now())
  from jsonb_to_recordset(v_archive.reports) as x(date date, message text, bilan jsonb, created_at timestamptz);

  insert into public.weekly_menus (coach_id, client_id, week_start, notes, plan, updated_at, created_at)
  select v_owner, v_client_id, x.week_start, coalesce(x.notes, ''), coalesce(x.plan, '{}'::jsonb), now(), now()
  from jsonb_to_recordset(v_archive.weekly_menus) as x(week_start date, notes text, plan jsonb)
  on conflict (client_id, week_start) do update
  set notes = excluded.notes,
      plan = excluded.plan,
      updated_at = now();

  insert into public.client_photos (client_id, uploader_id, image_path, image_url, caption, created_at)
  select
    v_client_id,
    v_client_id,
    x.image_path,
    x.image_url,
    coalesce(x.caption, ''),
    coalesce(x.created_at, now())
  from jsonb_to_recordset(v_archive.client_photos) as x(
    image_path text,
    image_url text,
    caption text,
    created_at timestamptz
  )
  where x.image_path is not null
    and x.image_url is not null
    and not exists (
      select 1
      from public.client_photos cp
      where cp.client_id = v_client_id
        and cp.image_path = x.image_path
    );

  insert into public.weekly_checkins (client_id, week_start, energy, hunger, sleep, stress, adherence, score, notes, created_at, updated_at)
  select
    v_client_id,
    x.week_start,
    coalesce(x.energy, 5),
    coalesce(x.hunger, 5),
    coalesce(x.sleep, 5),
    coalesce(x.stress, 5),
    coalesce(x.adherence, 5),
    coalesce(x.score, 5),
    coalesce(x.notes, ''),
    now(),
    now()
  from jsonb_to_recordset(v_archive.weekly_checkins) as x(
    week_start date,
    energy smallint,
    hunger smallint,
    sleep smallint,
    stress smallint,
    adherence smallint,
    score numeric,
    notes text
  )
  on conflict (client_id, week_start) do update
  set energy = excluded.energy,
      hunger = excluded.hunger,
      sleep = excluded.sleep,
      stress = excluded.stress,
      adherence = excluded.adherence,
      score = excluded.score,
      notes = excluded.notes,
      updated_at = now();

  insert into public.weekly_goals (coach_id, client_id, week_start, goals, updated_at, created_at)
  select v_owner, v_client_id, x.week_start, coalesce(x.goals, '[]'::jsonb), now(), now()
  from jsonb_to_recordset(v_archive.weekly_goals) as x(week_start date, goals jsonb)
  on conflict (client_id, week_start) do update
  set goals = excluded.goals,
      updated_at = now();

  delete from public.archived_clients where id = p_archive_id;

  return v_client_id;
end;
$$;

revoke all on function public.restore_archived_client(uuid) from public;
grant execute on function public.restore_archived_client(uuid) to authenticated;
