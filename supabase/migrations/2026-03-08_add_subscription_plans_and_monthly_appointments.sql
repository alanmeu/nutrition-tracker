-- Nutri Cloud: plans abonnement (Essentiel/Premium) + RDV mensuels

-- 1) Subscriptions: ajouter plan/prix Stripe
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

-- 2) Appointments: retirer la contrainte 1 RDV / semaine
-- La limite est maintenant geree par plan (1 ou 4 RDV / mois) dans l'app.
alter table public.appointments
  drop constraint if exists appointments_client_id_week_start_key;

