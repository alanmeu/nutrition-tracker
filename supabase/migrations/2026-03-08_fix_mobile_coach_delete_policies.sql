-- Fix RLS delete permissions used by coach mobile "x" buttons
-- - reports: owner coach can delete
-- - weekly_checkins: client or owner coach can delete

drop policy if exists "reports_delete_coach" on public.reports;
create policy "reports_delete_coach"
on public.reports
for delete
using (
  public.is_owner_coach()
);

drop policy if exists "weekly_checkins_delete_client_or_coach" on public.weekly_checkins;
create policy "weekly_checkins_delete_client_or_coach"
on public.weekly_checkins
for delete
using (
  client_id = auth.uid()
  or public.is_owner_coach()
);

