// 识字 Zeichentrainer — the owner's report of all phones (v197). Deploy as the edge function "usage-report" with "Verify JWT" off.
// Secret: REPORT_PASSWORD (the app's owner password). The app sends {password}; the function checks it and answers with
// the latest report row of every phone plus today's relay calls, read with the service role (see report.sql).
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let payload: { password?: string };
  try { payload = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const want = Deno.env.get("REPORT_PASSWORD") || "";
  if (!want || String(payload.password || "") !== want) return json({ error: "wrong password" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), srv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(`${url}/rest/v1/rpc/usage_latest`, { method: "POST", headers: { "content-type": "application/json", apikey: srv!, authorization: `Bearer ${srv}` }, body: "{}" });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { ...CORS, "content-type": "application/json" } });
});
