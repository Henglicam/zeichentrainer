-- 识字 Zeichentrainer — the all-users report (v197). Run once in the SQL Editor, after relay.sql.
-- The latest report row of every phone, with today's relay calls; read by the edge function usage-report with the service role.
create or replace function public.usage_latest()
returns json language sql security definer as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select distinct on (r.data->>'install') r.data->>'install' as install, r.created_at, r.data,
      -- the relay counts under "<install>:<provider>" since 2026-09-14, so the total is a sum over that phone's rows
      -- (the bare id is still matched, for rows written before that day). The per-provider counts feed the near-cap warning.
      coalesce((select sum(u.calls) from public.relay_usage u where u.day = current_date
        and (u.install = r.data->>'install' or u.install like r.data->>'install' || ':%')), 0) as relay_today,
      coalesce((select u.calls from public.relay_usage u where u.day = current_date and u.install = r.data->>'install' || ':qwen'), 0) as relay_qwen,
      coalesce((select u.calls from public.relay_usage u where u.day = current_date and u.install = r.data->>'install' || ':deepseek'), 0) as relay_deepseek
    from public.reports r
    order by r.data->>'install', r.created_at desc
  ) t;
$$;
revoke all on function public.usage_latest() from anon, authenticated;
