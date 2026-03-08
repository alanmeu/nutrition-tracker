-- Enforce monthly appointment limits by subscription plan:
-- essential = 1 appointment/month
-- premium   = 4 appointments/month

create or replace function public.enforce_appointment_monthly_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit int;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_count int;
begin
  select coalesce(s.plan_code, 'essential')
  into v_plan
  from public.subscriptions s
  where s.user_id = new.client_id;

  v_limit := case when v_plan = 'premium' then 4 else 1 end;

  v_month_start := date_trunc('month', new.starts_at);
  v_month_end := v_month_start + interval '1 month';

  select count(*)
  into v_count
  from public.appointments a
  where a.client_id = new.client_id
    and a.status in ('requested', 'confirmed')
    and a.starts_at >= v_month_start
    and a.starts_at < v_month_end
    and (tg_op = 'INSERT' or a.id <> new.id);

  if v_count >= v_limit then
    raise exception 'Monthly appointment limit reached for plan %', v_plan;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_appointment_monthly_limit on public.appointments;

create trigger trg_enforce_appointment_monthly_limit
before insert or update of starts_at, status
on public.appointments
for each row
execute function public.enforce_appointment_monthly_limit();

