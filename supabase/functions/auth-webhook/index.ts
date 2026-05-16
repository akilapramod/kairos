import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/errors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

type AuthHookPayload = {
  type: string;
  record?: {
    id: string;
    email?: string;
    phone?: string;
    raw_user_meta_data?: Record<string, string>;
  };
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  const hookSecret = Deno.env.get("SUPABASE_AUTH_HOOK_SECRET");
  if (hookSecret) {
    const provided = req.headers.get("x-supabase-hook-secret") ??
      req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== hookSecret) {
      return jsonError("Invalid hook secret", 401);
    }
  }

  let payload: AuthHookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const supabase = createServiceClient();
  const record = payload.record;

  if (!record?.id) {
    return jsonError("Missing record.id", 400);
  }

  if (payload.type === "INSERT" || payload.type === "user.created") {
    const phone = record.phone ??
      record.raw_user_meta_data?.phone ??
      null;
    const name = record.raw_user_meta_data?.name ??
      record.raw_user_meta_data?.full_name ??
      null;

    await supabase.from("users").upsert({
      id: record.id,
      phone: phone || null,
      name,
      email: record.email ?? null,
      is_active: true,
    }, { onConflict: "id" });

    await supabase.from("profiles").upsert(
      { user_id: record.id },
      { onConflict: "user_id" },
    );
  }

  if (payload.type === "DELETE" || payload.type === "user.deleted") {
    await supabase.from("users").update({ is_active: false }).eq(
      "id",
      record.id,
    );
  }

  return jsonResponse({ ok: true });
});
