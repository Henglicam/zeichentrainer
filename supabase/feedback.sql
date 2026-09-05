-- 识字 Zeichentrainer — feedback from the app (v212). Run once in the SQL Editor, after report.sql.
-- The app inserts one row per message with the publishable key (insert only); the owner reads them through the edge
-- function usage-report ({password, what:"feedback"}), which calls feedback_list with the service role.
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  install text,
  version int,
  text text not null
);
alter table public.feedback enable row level security;
drop policy if exists "feedback insert" on public.feedback;
create policy "feedback insert" on public.feedback for insert to anon with check (char_length(text) <= 2000);
create or replace function public.feedback_list()
returns json language sql security definer as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select f.created_at, f.install, f.version, f.text from public.feedback f order by f.created_at desc limit 500
  ) t;
$$;
revoke all on function public.feedback_list() from anon, authenticated;
