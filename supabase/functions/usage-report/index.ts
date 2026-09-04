// 识字 Zeichentrainer — the owner's report of all phones (v197). Deploy as the edge function "usage-report" with "Verify JWT" off.
// No secret needed: the app sends {password}, the function hashes it (SHA-256) and compares with PASSWORD_HASH — the same
// hash the app's unlock uses (ADMIN_HASH in app.js; a new password is a new hash here and there). It answers with the
// latest report row of every phone plus today's relay calls, read with the service role (see report.sql).
// (v198: a REPORT_PASSWORD secret was tried first and never reached the function on H's project — "wrong password" every time.)
const PASSWORD_HASH = "ee3467fab5716e0f004d387a016bddadc4570c2336c58fc6c872c351fd23a7d6";
async function sha256(s: string) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: { password?: string };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (await sha256(String(payload.password || "")) !== PASSWORD_HASH) return json({ error: "wrong password" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${url}/rest/v1/rpc/usage_latest`, { method: "POST", headers: { "content-type": "application/json", apikey: srv!, authorization: `Bearer ${srv}` }, body: "{}" });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { ...CORS, "content-type": "application/json" } });
});
