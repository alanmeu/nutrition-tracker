-- Create chat table + policies for coach/client messaging
-- Run this whole file in Supabase SQL Editor

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

alter table public.chat_messages enable row level security;

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

notify pgrst, 'reload schema';
