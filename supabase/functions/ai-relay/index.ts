// 识字 Zeichentrainer — the owner's AI relay (v191). Deploy as the Supabase edge function "ai-relay" with "Verify JWT" off.
// Secrets: DEEPSEEK_KEY, QWEN_KEY (Edge Functions → Secrets). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
// The app sends {provider, body} with its installation id in x-install; the function adds the key, forwards the
// OpenAI-style request, counts the call in relay_usage (see relay.sql) and refuses with 429 above the caps.

// Qwen has two kinds of key on two different endpoints, and the console hands them out side by side:
//   sk-ws-…  pay-as-you-go (按量付费)      → dashscope.aliyuncs.com
//   sk-sp-…  a Token Plan subscription (套餐) → token-plan.cn-beijing.maas.aliyuncs.com
// A key sent to the other one's endpoint answers 401 "Incorrect API key provided", which reads like a bad key
// and is not one. So the endpoint follows the key's own prefix and nobody has to keep the two in step by hand.
// QWEN_PLAN_URL overrides the Token Plan address without a redeploy of this file, should the console's path differ.
const QWEN_PAYG = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const QWEN_PLAN = Deno.env.get("QWEN_PLAN_URL") || "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions";
const qwenUrl = (k: string) => k.startsWith("sk-sp-") ? QWEN_PLAN : QWEN_PAYG;
// the key is trimmed: a newline picked up while pasting into the secrets form goes straight into the Bearer header
const PROVIDERS: Record<string, { url: (key: string) => string; key: string }> = {
  deepseek: { url: () => "https://api.deepseek.com/chat/completions", key: (Deno.env.get("DEEPSEEK_KEY") || "").trim() },
  qwen: { url: qwenUrl, key: (Deno.env.get("QWEN_KEY") || "").trim() },
};
const CAP_PER_PHONE = 200, CAP_ALL = 10000; // calls per day (v409: raised from 2000 for the class rollout — the per-phone cap still bounds the expensive picture calls)
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-install", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: { provider?: string; body?: unknown };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const pv = PROVIDERS[String(payload.provider || "")];
  if (!pv || !pv.key) return json({ error: "unknown provider" }, 400);
  const install = String(req.headers.get("x-install") || "");
  if (!/^[0-9a-f]{8,32}$/.test(install)) return json({ error: "no installation id" }, 400);
  // count first, so a refused call is counted too
  const url = Deno.env.get("SUPABASE_URL"), srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try {
    const r = await fetch(`${url}/rest/v1/rpc/relay_bump`, { method: "POST", headers: { "content-type": "application/json", apikey: srv!, authorization: `Bearer ${srv}` }, body: JSON.stringify({ p_install: install }) });
    const c = await r.json();
    if (!r.ok) return json({ error: "counter " + r.status }, 500);
    if (c.phone > CAP_PER_PHONE || c.all > CAP_ALL) return json({ error: "daily limit reached" }, 429);
  } catch (e) { return json({ error: "counter failed" }, 500); }
  const up = await fetch(pv.url(pv.key), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${pv.key}` }, body: JSON.stringify(payload.body || {}) });
  const text = await up.text();
  return new Response(text, { status: up.status, headers: { ...CORS, "content-type": up.headers.get("content-type") || "application/json" } });
});
