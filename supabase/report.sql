-- 识字 Zeichentrainer — the all-users report (v197). Run once in the SQL Editor, after relay.sql.
-- The latest report row of every phone, with today's relay calls; read by the edge function usage-report with the service role.
create or replace function public.usage_latest()
returns json language sql security definer as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select distinct on (r.data->>'install') r.data->>'install' as install, r.created_at, r.data,
      coalesce((select u.calls from public.relay_usage u where u.install = r.data->>'install' and u.day = current_date), 0) as relay_today
    from public.reports r
    order by r.data->>'install', r.created_at desc
  ) t;
$$;
revoke all on function public.usage_latest() from anon, authenticated;
