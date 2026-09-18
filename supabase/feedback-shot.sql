-- 识字 Zeichentrainer — a screenshot with a feedback message (v511, H: "Unter Feedback bitte folgendes ermöglichen:
-- Screenshot anhängen"). Run once in the SQL Editor, after feedback.sql. Until this has run, the app sends the message
-- WITHOUT the picture (PostgREST answers 400 for the unknown column, sendFeedback retries without it) and the Feedback
-- row says so, so nothing is lost meanwhile.
alter table public.feedback add column if not exists shot text;
-- the insert policy has to allow the new column: the picture is base64 of a JPEG at most 1400 px on its long side,
-- which the app keeps under 900000 characters (FB_SHOT_B64) before it ever posts.
drop policy if exists "feedback insert" on public.feedback;
create policy "feedback insert" on public.feedback for insert to anon
  with check (char_length(text) <= 2000 and (shot is null or char_length(shot) <= 1000000));
-- and the owner's list hands it back, newest first — but the PICTURE only for the 20 newest messages that carry one.
-- The list returns up to 500 messages, and 500 pictures at up to a megabyte each would be a several-hundred-megabyte
-- answer on H's phone; 20 is what the Show panel renders in one look, and an older picture is still in the table and
-- can be read in the dashboard. A message whose picture the cap withheld keeps its text and simply shows none.
create or replace function public.feedback_list()
returns json language sql security definer as $$
  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json) from (
    select f.created_at, f.install, f.version, f.text,
           case when f.shot is not null and row_number() over (partition by (f.shot is not null) order by f.created_at desc) <= 20
                then f.shot end as shot
      from public.feedback f order by f.created_at desc limit 500
  ) t;
$$;
revoke all on function public.feedback_list() from anon, authenticated;
