// 识字 Zeichentrainer — the owner's AI relay (v191). Deploy as the Supabase edge function "ai-relay" with "Verify JWT" off.
// Secrets: DEEPSEEK_KEY, QWEN_KEY, OWNER_INSTALL (Edge Functions → Secrets). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// are set by Supabase. The app sends {provider, body} with its installation id in x-install; the function adds the key,
// forwards the OpenAI-style request, counts the call in relay_usage (see relay.sql) and refuses with 429 above the caps.

// Qwen has two kinds of key on two different endpoints, and the console hands them out side by side:
//   sk-ws-…  pay-as-you-go (按量付费)      → dashscope.aliyuncs.com
//   sk-sp-…  a Token Plan subscription (套餐) → token-plan.cn-beijing.maas.aliyuncs.com
// A key sent to the other one's endpoint answers 401 "Incorrect API key provided", which reads like a bad key
// and is not one. So the endpoint follows the key's own prefix and nobody has to keep the two in step by hand.
// QWEN_PLAN_URL overrides the Token Plan address without a redeploy of this file, should the console's path differ.
const QWEN_PAYG = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const QWEN_PLAN = Deno.env.get("QWEN_PLAN_URL") || "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
const qwenUrl = (k: string) => k.startsWith("sk-sp-") ? QWEN_PLAN : QWEN_PAYG;

// The per-phone cap is PER PROVIDER, because the two cost nothing alike (2026-09-14, H: "Aber hab ich heute echt schon
// 200 calls gemacht?"). Measured from his Bailian console the same morning: 29,000 tokens is 0.3 % of the 7-day Token
// Plan quota, so ~10M tokens a week, ~1.4M a day, ~700 Qwen picture calls a day. A DeepSeek text check is ~500 tokens
// on a separate PAY-AS-YOU-GO account at well under ¥0.01; a Qwen picture call is ~2,000 tokens off that fixed weekly
// quota. One cap over both let the cheap calls push the phone out of the expensive ones — H's own morning spent its
// 200 on text checks and refusals and then could not read a rice cooker, while 99.7 % of the quota sat unused.
// The cap lives on the provider so a new provider cannot be added without one; a provider with cap 0 is refused,
// which is the right way to fail for a budget guard.
// NO SCHEMA CHANGE: relay_usage is keyed (install, day), so counting under "<install>:<provider>" gives each provider
// its own row and its own count, while relay_bump's own sum over the day stays a true total across everything.
// Since v817 these caps are the FALLBACK: once budget.sql has run, relay_config's deepseek_cap and qwen_cap rule (the app's
// RELAY_CAPS is the same fallback, named there; the owner's phone reads the live caps from x-relay-caps).
const PROVIDERS: Record<string, { url: (key: string) => string; key: string; cap: number }> = {
  deepseek: { url: () => "https://api.deepseek.com/chat/completions", key: (Deno.env.get("DEEPSEEK_KEY") || "").trim(), cap: 400 },
  qwen: { url: qwenUrl, key: (Deno.env.get("QWEN_KEY") || "").trim(), cap: 80 },
};
// A backstop against a runaway or abuse; the budget guard is relay_config's monthly ceiling (v817) — the Token Plan is PREPAID and cannot be overspent, and
// DeepSeek at 8,000 calls is about ¥2. 10000 guarded nothing (twice the whole week's Qwen quota in one day); 2000 is
// the number v409 had to raise because it locked the whole class out on their first day, so it must stay above that.
const CAP_ALL = 6000;
// The owner's own phone is the one that tests the app, so it is not capped per provider — but never past CAP_ALL.
// Its installation id lives in the secrets beside the keys and NOT in this public file: anyone who read it here
// could claim the exemption by setting x-install. Unset = nobody is exempt, which is the safe default.
const OWNER_INSTALL = (Deno.env.get("OWNER_INSTALL") || "").trim();
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-install", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(o), { status, headers: { ...CORS, ...extra, "content-type": "application/json" } });
// The budget (v817, H: "Können wir da noch irgendeinen Sicherheitsschalter für mich einbauen, dass ich dann nicht riesige
// Kosten kriege?" and "der User [muss] Bescheid wissen, warum es langsamer wird"). relay_check (budget.sql) counts the call
// and hands back the owner's row of relay_config — the switch, the monthly ceiling in euros, the share of it from which every
// phone's allowance halves, the caps and the prices — with this month's estimated spend. A refusal says WHY in `reason`
// and until WHEN in `until` (a UTC date): "paused" the owner's switch, "month" the ceiling, "all" CAP_ALL, "phone" this
// phone's allowance. The app turns that into a sentence the learner can act on. Every answer carries x-relay-mode; the
// owner's phone (OWNER_INSTALL) also gets the month's spend, the ceiling and the caps, which Owner tools shows. After a
// good answer its tokens are priced and added to relay_spend. Without budget.sql the function falls back to relay_bump and
// the constants above, as before v817.
type Check = { phone: number; all: number; paused?: boolean; cap_eur?: number | null; spent_eur?: number; reduce_at?: number | null;
  caps?: Record<string, number | null> | null; prices?: Record<string, number[]> | null };
const dayUTC = (add: number) => new Date(Date.now() + add * 864e5).toISOString().slice(0, 10);
const nextMonthUTC = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); };
const EXPOSE = "x-relay-mode, x-relay-left, x-relay-spend, x-relay-cap, x-relay-caps";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: { provider?: string; body?: unknown };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const name = String(payload.provider || ""), pv = PROVIDERS[name];
  if (!pv || !pv.key) return json({ error: "unknown provider" }, 400);
  const install = String(req.headers.get("x-install") || "");
  if (!/^[0-9a-f]{8,32}$/.test(install)) return json({ error: "no installation id" }, 400);
  // count first, so a refused call is counted too
  const url = Deno.env.get("SUPABASE_URL"), srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const rpc = (fn: string, args: unknown) => fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json", apikey: srv!, authorization: `Bearer ${srv}` }, body: JSON.stringify(args) });
  let c: Check = { phone: 0, all: 0 }, budget = true;
  try {
    let r = await rpc("relay_check", { p_install: install, p_provider: name });
    if (r.status === 404) { budget = false; r = await rpc("relay_bump", { p_install: `${install}:${name}` }); } // budget.sql not run yet
    c = await r.json();
    if (!r.ok) return json({ error: "counter " + r.status }, 500);
  } catch (e) { return json({ error: "counter failed" }, 500); }
  const owner = !!OWNER_INSTALL && install === OWNER_INSTALL;
  const capEur = budget && c.cap_eur != null ? +c.cap_eur : Infinity, spent = +(c.spent_eur || 0);
  const reduced = spent >= capEur * (c.reduce_at != null ? +c.reduce_at : 0.8);
  const caps: Record<string, number> = {};
  for (const [k, v] of Object.entries(PROVIDERS)) caps[k] = c.caps && c.caps[k] != null ? +c.caps[k]! : v.cap;
  const cap = owner ? Infinity : reduced ? Math.ceil(caps[name] / 2) : caps[name];
  const mode = c.paused ? "paused" : spent >= capEur ? "month" : reduced ? "reduced" : "normal";
  const hdr: Record<string, string> = { "Access-Control-Expose-Headers": EXPOSE, "x-relay-mode": mode };
  if (owner && budget) Object.assign(hdr, { "x-relay-spend": spent.toFixed(2), "x-relay-cap": Number.isFinite(capEur) ? String(capEur) : "",
    "x-relay-caps": Object.entries(caps).map(([k, v]) => `${k}=${v}`).join(",") });
  const refuse = (reason: string, until: string, error: string) => json({ error, reason, until }, 429, hdr);
  if (c.paused) return refuse("paused", "", "paused by the owner");
  if (spent >= capEur) return refuse("month", nextMonthUTC(), "monthly budget reached");
  if (c.all > CAP_ALL) return refuse("all", dayUTC(1), "daily limit reached");
  if (c.phone > cap) return refuse("phone", dayUTC(1), "daily limit reached");
  if (Number.isFinite(cap)) hdr["x-relay-left"] = String(Math.max(0, cap - c.phone));
  // What the provider did, in this function's own log (2026-09-29, H's 22-line board: seven relay calls each ended at
  // 75.0 s with nothing in the log, and whether Qwen answered late, closed the line or the worker was retired could not
  // be told apart). Never the text: provider, request bytes, status, seconds, answer length. A call that is cut before
  // its answer logs "closed" with the reason and answers the phone with 502 instead of crashing the worker in silence.
  const bodyText = JSON.stringify(payload.body || {}), t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${name} <- ${bodyText.length} bytes`);
  let up: Response, text: string;
  try {
    up = await fetch(pv.url(pv.key), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pv.key}` }, body: bodyText });
    text = await up.text();
  } catch (e) {
    const why = String((e as Error)?.message || e).slice(0, 200);
    console.log(`${name} closed after ${secs()} s: ${why}`);
    return json({ error: `${name} closed the line after ${secs()} s: ${why}` }, 502);
  }
  console.log(`${name} -> ${up.status} in ${secs()} s, ${text.length} chars`);
  // the answer's price: its tokens at relay_config's rates (DeepSeek reports the cache hits apart; a provider that does not,
  // pays the full input rate). A failure here costs the estimate one call, never the answer.
  if (budget && up.ok) {
    try {
      const u = JSON.parse(text).usage || {}, p = (c.prices && c.prices[name]) || [0, 0, 0];
      const inTok = +u.prompt_tokens || 0, hit = Math.min(+u.prompt_cache_hit_tokens || 0, inTok), outTok = +u.completion_tokens || 0;
      const usd = ((inTok - hit) * (+p[0] || 0) + hit * (+p[1] || 0) + outTok * (+p[2] || 0)) / 1e6;
      await rpc("relay_spend_add", { p_provider: name, p_usd: usd });
    } catch (e) { console.log(`${name} spend not counted: ${String((e as Error)?.message || e).slice(0, 120)}`); }
  }
  return new Response(text, { status: up.status, headers: { ...CORS, ...hdr, "content-type": up.headers.get("content-type") || "application/json" } });
});
