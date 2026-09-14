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
const PROVIDERS: Record<string, { url: (key: string) => string; key: string; cap: number }> = {
  deepseek: { url: () => "https://api.deepseek.com/chat/completions", key: (Deno.env.get("DEEPSEEK_KEY") || "").trim(), cap: 400 },
  qwen: { url: qwenUrl, key: (Deno.env.get("QWEN_KEY") || "").trim(), cap: 80 },
};
// A backstop against a runaway or abuse, not a budget guard — the Token Plan is PREPAID and cannot be overspent, and
// DeepSeek at 8,000 calls is about ¥2. 10000 guarded nothing (twice the whole week's Qwen quota in one day); 2000 is
// the number v409 had to raise because it locked the whole class out on their first day, so it must stay above that.
const CAP_ALL = 6000;
// The owner's own phone is the one that tests the app, so it is not capped per provider — but never past CAP_ALL.
// Its installation id lives in the secrets beside the keys and NOT in this public file: anyone who read it here
// could claim the exemption by setting x-install. Unset = nobody is exempt, which is the safe default.
const OWNER_INSTALL = (Deno.env.get("OWNER_INSTALL") || "").trim();
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-install", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

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
  try {
    const r = await fetch(`${url}/rest/v1/rpc/relay_bump`, { method: "POST", headers: { "content-type": "application/json", apikey: srv!, authorization: `Bearer ${srv}` }, body: JSON.stringify({ p_install: `${install}:${name}` }) });
    const c = await r.json();
    if (!r.ok) return json({ error: "counter " + r.status }, 500);
    const cap = (OWNER_INSTALL && install === OWNER_INSTALL) ? Infinity : pv.cap;
    if (c.phone > cap || c.all > CAP_ALL) return json({ error: "daily limit reached" }, 429);
  } catch (e) { return json({ error: "counter failed" }, 500); }
  const up = await fetch(pv.url(pv.key), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pv.key}` }, body: JSON.stringify(payload.body || {}) });
  const text = await up.text();
  return new Response(text, { status: up.status, headers: { ...CORS, "content-type": up.headers.get("content-type") || "application/json" } });
});
