-- 识字 Zeichentrainer — the relay's counter (v191). Run once in the SQL Editor.
create table if not exists public.relay_usage (
  install text not null,
  day date not null default current_date,
  calls int not null default 0,
  primary key (install, day)
);
alter table public.relay_usage enable row level security; -- no policy: only the service role (the function) touches it

create or replace function public.relay_bump(p_install text)
returns json language plpgsql security definer as $$
declare v_phone int; v_all int;
begin
  insert into public.relay_usage (install, day, calls) values (p_install, current_date, 1)
    on conflict (install, day) do update set calls = relay_usage.calls + 1
    returning calls into v_phone;
  select coalesce(sum(calls), 0) into v_all from public.relay_usage where day = current_date;
  return json_build_object('phone', v_phone, 'all', v_all);
end $$;
revoke all on function public.relay_bump(text) from anon, authenticated;
