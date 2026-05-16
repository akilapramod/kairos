import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createUserClient } from "./supabase.ts";

export async function requireUser(
  req: Request,
): Promise<{ user: User; supabase: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing Authorization header", 401);
  }

  const supabase = createUserClient(authHeader);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("Invalid or expired session", 401);
  }

  return { user, supabase };
}

export function requirePipelineSecret(req: Request): void {
  const expected = Deno.env.get("CV_PIPELINE_SECRET");
  if (!expected) {
    throw new AuthError("CV_PIPELINE_SECRET not configured", 500);
  }

  const provided = req.headers.get("x-cv-pipeline-secret") ??
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== expected) {
    throw new AuthError("Invalid pipeline secret", 401);
  }
}

export function isServiceRoleRequest(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) return false;
  const auth = req.headers.get("Authorization");
  return auth === `Bearer ${key}`;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}
