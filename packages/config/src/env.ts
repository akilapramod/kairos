import { z } from "zod";

const serverSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  MINIMAX_API_KEY: z.string().min(1).optional(),
  MINIMAX_GROUP_ID: z.string().min(1).optional(),
  WA_SESSION_PATH: z.string().min(1).optional(),
  POLLING_INTERVAL_MS: z.coerce.number().positive().optional(),
  MATCH_SCORE_THRESHOLD: z.coerce.number().min(0).max(100).optional(),
  RENDERCV_THEME: z.string().min(1).optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

export function parseServerEnv(
  env: Record<string, string | undefined> = process.env,
): ServerEnv {
  return serverSchema.parse(env);
}

export function parseClientEnv(
  env: Record<string, string | undefined> = process.env,
): ClientEnv {
  return clientSchema.parse(env);
}

/**
 * Validates server + public Supabase vars together (e.g. Next.js root).
 * NEXT_PUBLIC_* must match SUPABASE_URL / SUPABASE_ANON_KEY when both are set.
 */
export function parseAppEnv(
  env: Record<string, string | undefined> = process.env,
): ServerEnv & ClientEnv {
  const parsed = {
    ...parseServerEnv(env),
    ...parseClientEnv(env),
  };

  if (env.SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_URL) {
    if (env.SUPABASE_URL !== env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error(
        "SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL must be the same",
      );
    }
  }

  if (env.SUPABASE_ANON_KEY && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (env.SUPABASE_ANON_KEY !== env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error(
        "SUPABASE_ANON_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY must be the same",
      );
    }
  }

  return parsed;
}
