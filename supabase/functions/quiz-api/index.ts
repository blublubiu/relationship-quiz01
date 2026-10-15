import { createClient } from "npm:@supabase/supabase-js@2";
import { getQuizContent } from "./quiz-content.ts";

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const sessionTtl = 8 * 60 * 60;
const loginFailures = new Map<string, { count: number; blockedUntil: number }>();
const encoder = new TextEncoder();

function response(data: unknown, status = 200, origin = "") {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-admin-token");
    headers.set("Access-Control-Max-Age", "86400");
  }
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

function normalizeCode(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const raw = [...bytes].map((byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
  return raw.match(/.{4}/g)!.join("-");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function constantTimeEqual(a: string, b: string) {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return mismatch === 0;
}

function serviceKey() {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const values = JSON.parse(keys);
      if (values.default) return values.default;
      const first = Object.values(values)[0];
      if (typeof first === "string") return first;
    } catch { /* use the legacy key below */ }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("Supabase server key is not configured.");
  return legacy;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  serviceKey(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function readBody(req: Request) {
  try {
    const value = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error("请求格式无效。");
  }
}

async function requireAdmin(req: Request) {
  const token = req.headers.get("x-admin-token") ?? "";
  if (!token) return false;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  const { data, error } = await supabase.from("quiz_admin_sessions")
    .select("token_hash")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function failureResponse(reason: string, origin: string) {
  if (reason === "exhausted") return response({ valid: false, error: "这个密码的可用次数已用完。" }, 403, origin);
  return response({ valid: false, error: "密码无效或已停用，请检查后重试。" }, 404, origin);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (origin && !allowedOrigins.includes(origin)) {
    return response({ error: "请求来源尚未加入 Supabase 允许列表。" }, 403);
  }
  if (req.method === "OPTIONS") return response({}, 204, origin);

  try {
    const url = new URL(req.url);
    const route = url.pathname.slice(url.pathname.indexOf("/quiz-api") + "/quiz-api".length);

    if (req.method === "POST" && route === "/api/access") {
      const codePayload = await readBody(req);
      const code = normalizeCode(codePayload.code);
      if (code.length !== 12) return failureResponse("invalid", origin);
      const { data, error } = await supabase.from("quiz_access_codes")
        .select("max_uses,used_count,disabled_at")
        .eq("code_hash", await sha256(code))
        .maybeSingle();
      if (error) throw error;
      if (!data || data.disabled_at !== null) return failureResponse("invalid", origin);
      if (data.used_count >= data.max_uses) return failureResponse("exhausted", origin);
      return response({ valid: true, remaining: data.max_uses - data.used_count, content: getQuizContent() }, 200, origin);
    }

    if (req.method === "POST" && route === "/api/start") {
      const payload = await readBody(req);
      const code = normalizeCode(payload.code);
      if (code.length !== 12) return response({ error: "密码格式无效，请重新输入。" }, 400, origin);
      const { data, error } = await supabase.rpc("quiz_consume_access_code", {
        code_hash_input: await sha256(code),
      });
      if (error) throw error;
      if (!data?.ok) return failureResponse(data?.reason ?? "invalid", origin);
      return response({ ok: true, remaining: data.remaining }, 200, origin);
    }

    if (req.method === "POST" && route === "/api/admin/login") {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const state = loginFailures.get(ip) ?? { count: 0, blockedUntil: 0 };
      const now = Math.floor(Date.now() / 1000);
      if (state.blockedUntil > now) return response({ error: "尝试次数过多，请稍后再试。" }, 429, origin);
      const payload = await readBody(req);
      const expected = Deno.env.get("ADMIN_PASSWORD") ?? "";
      if (expected.length < 12 || !constantTimeEqual(String(payload.password ?? ""), expected)) {
        state.count += 1;
        if (state.count >= 8) state.blockedUntil = now + 300;
        loginFailures.set(ip, state);
        return response({ error: "管理员密码不正确。" }, 401, origin);
      }
      loginFailures.delete(ip);
      const token = randomToken();
      const { error } = await supabase.from("quiz_admin_sessions").insert({
        token_hash: await sha256(token),
        created_at: now,
        expires_at: now + sessionTtl,
      });
      if (error) throw error;
      return response({ ok: true, token, expires_in: sessionTtl }, 200, origin);
    }

    if (req.method === "GET" && route === "/api/admin/session") {
      try {
        return response({ authenticated: await requireAdmin(req) }, 200, origin);
      } catch {
        return response({ authenticated: false }, 200, origin);
      }
    }

    if (route.startsWith("/api/admin/") && !await requireAdmin(req)) {
      return response({ error: "请先登录管理后台。" }, 401, origin);
    }

    if (req.method === "POST" && route === "/api/admin/logout") {
      const token = req.headers.get("x-admin-token") ?? "";
      if (token) {
        const { error } = await supabase.from("quiz_admin_sessions")
          .update({ revoked_at: Math.floor(Date.now() / 1000) })
          .eq("token_hash", await sha256(token)).is("revoked_at", null);
        if (error) throw error;
      }
      return response({ ok: true }, 200, origin);
    }

    if (req.method === "POST" && route === "/api/admin/batches") {
      const payload = await readBody(req);
      const count = Number(payload.count ?? 1);
      const maxUses = Number(payload.max_uses ?? 5);
      if (!Number.isInteger(count) || count < 1 || count > 500) {
        return response({ error: "每批可生成 1 到 500 个密码。" }, 400, origin);
      }
      if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 5) {
        return response({ error: "单个密码的可用次数需在 1 到 5 次之间。" }, 400, origin);
      }
      const label = String(payload.label ?? "").trim().slice(0, 80) || `密码批次 ${new Date().toLocaleString("zh-CN")}`;
      const batchId = crypto.randomUUID();
      const createdAt = Math.floor(Date.now() / 1000);
      const codes = Array.from({ length: count }, () => createCode());
      const { error: batchError } = await supabase.from("quiz_batches").insert({
        id: batchId, label, created_at: createdAt, max_uses: maxUses, code_count: count,
      });
      if (batchError) throw batchError;
      const rows = await Promise.all(codes.map(async (password) => ({
        id: crypto.randomUUID(), batch_id: batchId, code_hash: await sha256(password),
        max_uses: maxUses, used_count: 0, created_at: createdAt,
      })));
      const { error: codesError } = await supabase.from("quiz_access_codes").insert(rows);
      if (codesError) {
        await supabase.from("quiz_batches").delete().eq("id", batchId);
        throw codesError;
      }
      return response({ batch_id: batchId, label, created_at: createdAt,
        codes: codes.map((password) => ({ password, max_uses: maxUses })) }, 201, origin);
    }

    if (req.method === "GET" && route === "/api/admin/codes") {
      const { data, error } = await supabase.from("quiz_access_codes")
        .select("id,batch_id,max_uses,used_count,created_at,disabled_at,quiz_batches(label)")
        .order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return response({ codes: (data ?? []).map((item: any) => ({
        id: item.id,
        batch_id: item.batch_id,
        batch: item.quiz_batches?.label ?? "未命名批次",
        max_uses: item.max_uses,
        used_count: item.used_count,
        remaining: Math.max(0, item.max_uses - item.used_count),
        created_at: item.created_at,
        status: item.disabled_at !== null ? "disabled" : item.used_count >= item.max_uses ? "exhausted" : "active",
      })) }, 200, origin);
    }

    const disableMatch = route.match(/^\/api\/admin\/codes\/([0-9a-f-]{36})\/disable$/i);
    if (req.method === "POST" && disableMatch) {
      const { data, error } = await supabase.from("quiz_access_codes")
        .update({ disabled_at: Math.floor(Date.now() / 1000) })
        .eq("id", disableMatch[1]).is("disabled_at", null).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return response({ error: "密码不存在或已经停用。" }, 404, origin);
      return response({ ok: true }, 200, origin);
    }

    return response({ error: "找不到这个接口。" }, 404, origin);
  } catch (error) {
    console.error("quiz-api error", error);
    return response({ error: "服务暂时无法完成请求，请稍后重试。" }, 500, origin);
  }
});
