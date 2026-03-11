-- Allow client and linked coach to delete a full chat history

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
