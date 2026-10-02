-- 识字 Shízì — the relay's budget and the owner's emergency switch (v817). Run once in the SQL Editor, after relay.sql.
-- H, 2026-10-02: "Können wir da noch irgendeinen Sicherheitsschalter für mich einbauen, dass ich dann nicht riesige Kosten kriege?"
--
-- What the owner changes afterwards, in Table Editor → relay_config → the one row (no redeploy, it holds from the next call):
--   paused         the emergency switch. Tick it and save: the free AI stops for every phone, the owner's own included.
--   month_cap_eur  the monthly ceiling in euros. Reached, the free AI pauses until the 1st of next month.
--   reduce_at      from this share of the ceiling (0.8 = 80 %) every phone's daily allowance halves.
--   deepseek_cap   free text checks a phone a day.        qwen_cap   free picture readings a phone a day.
--   *_usd          the providers' prices in US dollars per million tokens, and eur_per_usd. The DeepSeek defaults are the
--                  higher of the published 2026 rates, so the estimate errs high; qwen is 0 because the Token Plan is prepaid
--                  (on a pay-as-you-go sk-ws- key, put its prices here). The spend is an estimate from the tokens each answer
--                  reports, not the provider's invoice.
-- The month's estimated spend per provider is in relay_spend. Phones without a key of their own see why the AI waits.

create table if not exists public.relay_config (
  id int primary key default 1 check (id = 1),
  paused boolean not null default false,
  month_cap_eur numeric not null default 15,
  reduce_at numeric not null default 0.8,
  deepseek_cap int not null default 100,
  qwen_cap int not null default 10,
  eur_per_usd numeric not null default 0.9,
  deepseek_in_usd numeric not null default 0.30,
  deepseek_hit_usd numeric not null default 0.03,
  deepseek_out_usd numeric not null default 1.20,
  qwen_in_usd numeric not null default 0,
  qwen_hit_usd numeric not null default 0,
  qwen_out_usd numeric not null default 0
);
insert into public.relay_config (id) values (1) on conflict (id) do nothing;
alter table public.relay_config enable row level security; -- no policy: only the service role (the function) reads it

create table if not exists public.relay_spend (
  month text not null,
  provider text not null,
  calls int not null default 0,
  usd numeric not null default 0,
  primary key (month, provider)
);
alter table public.relay_spend enable row level security;

-- One call: count it for the phone and the provider (as relay_bump does, under "<install>:<provider>"), and answer with
-- everything the function decides on — the phone's and everyone's count today, the switch, the ceiling, this month's
-- estimated spend in euros, the caps and the prices.
create or replace function public.relay_check(p_install text, p_provider text)
returns json language plpgsql security definer as $$
declare v_phone int; v_all int; c public.relay_config; v_usd numeric;
begin
  insert into public.relay_usage (install, day, calls) values (p_install || ':' || p_provider, current_date, 1)
    on conflict (install, day) do update set calls = relay_usage.calls + 1
    returning calls into v_phone;
  select coalesce(sum(calls), 0) into v_all from public.relay_usage where day = current_date;
  select * into c from public.relay_config where id = 1;
  select coalesce(sum(usd), 0) into v_usd from public.relay_spend where month = to_char(current_date, 'YYYY-MM');
  return json_build_object(
    'phone', v_phone, 'all', v_all,
    'paused', coalesce(c.paused, false),
    'cap_eur', c.month_cap_eur,
    'spent_eur', round(v_usd * coalesce(c.eur_per_usd, 0.9), 4),
    'reduce_at', c.reduce_at,
    'caps', json_build_object('deepseek', c.deepseek_cap, 'qwen', c.qwen_cap),
    'prices', json_build_object(
      'deepseek', json_build_array(c.deepseek_in_usd, c.deepseek_hit_usd, c.deepseek_out_usd),
      'qwen', json_build_array(c.qwen_in_usd, c.qwen_hit_usd, c.qwen_out_usd)));
end $$;

-- After an answer: add its estimated cost to this month's row of the provider.
create or replace function public.relay_spend_add(p_provider text, p_usd numeric)
returns void language sql security definer as $$
  insert into public.relay_spend (month, provider, calls, usd)
    values (to_char(current_date, 'YYYY-MM'), p_provider, 1, greatest(coalesce(p_usd, 0), 0))
    on conflict (month, provider) do update set calls = relay_spend.calls + 1, usd = relay_spend.usd + excluded.usd;
$$;

revoke all on function public.relay_check(text, text) from public, anon, authenticated;
revoke all on function public.relay_spend_add(text, numeric) from public, anon, authenticated;
grant execute on function public.relay_check(text, text) to service_role;
grant execute on function public.relay_spend_add(text, numeric) to service_role;
