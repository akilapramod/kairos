import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requirePipelineSecret } from "../_shared/auth.ts";
import { AuthError } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/errors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

type CallbackBody = {
  jobId: string;
  uploadId: string;
  userId: string;
  status: "done" | "error";
  outputStoragePath?: string;
  errorMessage?: string;
  applicationId?: string;
  cvVersionUrl?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    requirePipelineSecret(req);
  } catch (e) {
    if (e instanceof AuthError) return jsonError(e.message, e.status);
    throw e;
  }

  let body: CallbackBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const {
    jobId,
    uploadId,
    status,
    outputStoragePath,
    errorMessage,
    applicationId,
    cvVersionUrl,
  } = body;

  if (!jobId || !uploadId) {
    return jsonError("jobId and uploadId are required", 400);
  }

  const supabase = createServiceClient();
  const now = new Date().toISOString();

  if (status === "error") {
    await supabase.from("render_jobs").update({
      status: "error",
      error_message: errorMessage ?? "Render failed",
      completed_at: now,
    }).eq("id", jobId);

    await supabase.from("cv_uploads").update({
      status: "error",
      error_message: errorMessage ?? "Render failed",
    }).eq("id", uploadId);

    return jsonResponse({ ok: true, status: "error" });
  }

  await supabase.from("render_jobs").update({
    status: "done",
    output_storage_path: outputStoragePath ?? null,
    completed_at: now,
  }).eq("id", jobId);

  await supabase.from("cv_uploads").update({
    status: "done",
    error_message: null,
  }).eq("id", uploadId);

  if (applicationId && cvVersionUrl) {
    await supabase.from("applications").update({
      cv_version_url: cvVersionUrl,
    }).eq("id", applicationId);
  }

  return jsonResponse({ ok: true, status: "done" });
});
