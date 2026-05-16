import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/errors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  return jsonResponse({ ok: true, service: "kairos-edge", version: "1.0.0" });
});
