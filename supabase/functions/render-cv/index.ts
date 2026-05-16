import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthError, isServiceRoleRequest, requireUser } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/errors.ts";
import { callCvPipeline } from "../_shared/pipeline.ts";
import { createServiceClient } from "../_shared/supabase.ts";

type RenderBody = {
  uploadId: string;
  structuredJson?: Record<string, unknown>;
  source?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  let body: RenderBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { uploadId, structuredJson } = body;
  if (!uploadId) {
    return jsonError("uploadId is required", 400);
  }

  const service = createServiceClient();
  const isServiceCall = isServiceRoleRequest(req);

  let userId: string;

  if (isServiceCall) {
    const { data: upload } = await service.from("cv_uploads").select("user_id")
      .eq("id", uploadId).single();
    if (!upload) return jsonError("Upload not found", 404);
    userId = upload.user_id;
  } else {
    try {
      const { user } = await requireUser(req);
      userId = user.id;
      const { data: upload } = await service.from("cv_uploads")
        .select("user_id").eq("id", uploadId).single();
      if (!upload || upload.user_id !== userId) {
        return jsonError("Forbidden", 403);
      }
    } catch (e) {
      if (e instanceof AuthError) return jsonError(e.message, e.status);
      throw e;
    }
  }

  const { data: parsed } = await service.from("parsed_cv_data")
    .select("structured_json, rendercv_yaml")
    .eq("upload_id", uploadId)
    .maybeSingle();

  const yaml = parsed?.rendercv_yaml ?? null;
  const json = structuredJson ?? parsed?.structured_json;

  if (!yaml && !json) {
    return jsonError("No parsed CV data for upload", 400);
  }

  const { data: job, error: jobError } = await service.from("render_jobs")
    .insert({
      upload_id: uploadId,
      status: "processing",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return jsonError(jobError?.message ?? "Failed to create render job", 500);
  }

  const theme = Deno.env.get("RENDERCV_THEME") ?? "EngineeringResumes";
  const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/render-callback`;

  const pipelineRes = await callCvPipeline("/render", {
    jobId: job.id,
    uploadId,
    userId,
    yaml,
    structuredJson: json,
    theme,
    callbackUrl,
  });

  if (!pipelineRes.ok) {
    const errText = await pipelineRes.text();
    await service.from("render_jobs").update({
      status: "error",
      error_message: errText,
    }).eq("id", job.id);
    return jsonError(`CV pipeline error: ${errText}`, 502);
  }

  return jsonResponse(
    { ok: true, jobId: job.id, status: "processing" },
    202,
  );
});
