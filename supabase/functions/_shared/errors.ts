import { corsHeaders } from "./cors.ts";

export function jsonResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonError(
  message: string,
  status = 400,
): Response {
  return jsonResponse({ error: message }, status);
}
