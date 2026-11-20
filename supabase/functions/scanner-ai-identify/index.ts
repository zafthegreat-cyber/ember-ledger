// scanner-ai-identify (Nov 20 2026): AI card/product identification for paid members.
// Logic and checks live in core.mjs (tested by scripts/test-scanner-ai-identify.mjs).
//
// Secret (Supabase -> Edge Functions -> Secrets), set by the owner, never in code:
//   ANTHROPIC_API_KEY   from console.anthropic.com
// Optional:
//   SCANNER_AI_MODEL    defaults to claude-opus-5-5
//   SCANNER_AI_DAILY_LIMIT  defaults to 40 per member per UTC day
import Anthropic from "npm:@anthropic-ai/sdk";
import { AI_SCAN_DAILY_LIMIT, AI_SCAN_SCHEMA, AI_SCAN_SYSTEM, aiScanUserText, createAiScanHandler } from "./core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MODEL = Deno.env.get("SCANNER_AI_MODEL") || "claude-opus-5-5";
const LIMIT = Number(Deno.env.get("SCANNER_AI_DAILY_LIMIT")) || AI_SCAN_DAILY_LIMIT;

const service = (path: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}${path}`, {
  ...init,
  signal: AbortSignal.timeout(8000),
  headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json", ...(init.headers ?? {}) },
});

let client: Anthropic | null = null;
const anthropic = () => {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new Error("AI scans are not set up yet.");
  client ??= new Anthropic({ timeout: 45_000, maxRetries: 1 });
  return client;
};

Deno.serve(createAiScanHandler({
  limit: LIMIT,
  isReady: () => Boolean(Deno.env.get("ANTHROPIC_API_KEY")),
  async getUser(token: string) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: String(user.id) } : null;
  },
  async getProfile(userId: string) {
    const res = await service(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=tier,plan_tier,app_role,user_role,is_minor&limit=1`);
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] ?? null : null;
  },
  async takeScan(userId: string, limit: number) {
    const res = await service("/rest/v1/rpc/code3_take_ai_scan", { method: "POST", body: JSON.stringify({ p_user: userId, p_limit: limit }) });
    if (!res.ok) throw new Error("Usage check failed.");
    return Number(await res.json());
  },
  async returnScan(userId: string) {
    await service("/rest/v1/rpc/code3_return_ai_scan", { method: "POST", body: JSON.stringify({ p_user: userId }) });
  },
  async identify({ kind, mediaType, data, hint }: { kind: string; mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string; hint: string }) {
    const response = await anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: AI_SCAN_SYSTEM,
      output_config: { effort: "medium", format: { type: "json_schema", schema: AI_SCAN_SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: aiScanUserText(kind, hint) },
        ],
      }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`No result (${response.stop_reason}).`);
    const text = response.content.find((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text");
    if (!text) throw new Error("No result.");
    return text.text;
  },
}));
