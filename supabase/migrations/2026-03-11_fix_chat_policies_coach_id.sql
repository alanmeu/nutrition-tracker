-- Fix chat policies so coach linked in chat_messages.coach_id can read/update/delete
-- even if app_config owner_coach_id is not set or mismatched.

drop policy if exists "chat_messages_select_client_or_owner" on public.chat_messages;
create policy "chat_messages_select_client_or_owner"
on public.chat_messages
for select
using (
  client_id = auth.uid()
  or coach_id = auth.uid()
  or public.is_owner_coach()
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
