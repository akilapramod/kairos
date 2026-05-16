import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { AuthError, isServiceRoleRequest, requireUser } from "../_shared/auth.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/errors.ts";
import { callCvPipeline } from "../_shared/pipeline.ts";
import { createServiceClient } from "../_shared/supabase.ts";

type GenerateBody = {
  applicationId?: string;
  userId?: string;
  jobId?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  let body: GenerateBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const service = createServiceClient();
  const pipelineSecretOk =
    req.headers.get("x-cv-pipeline-secret") === Deno.env.get("CV_PIPELINE_SECRET");
  const isServiceCall = isServiceRoleRequest(req) || pipelineSecretOk;

  let userId = body.userId;
  let jobId = body.jobId;
  let applicationId = body.applicationId;

  if (!isServiceCall) {
    try {
      const { user } = await requireUser(req);
      userId = user.id;
    } catch (e) {
      if (e instanceof AuthError) return jsonError(e.message, e.status);
      throw e;
    }
  }

  if (applicationId) {
    const { data: app, error } = await service.from("applications")
      .select("id, user_id, job_id")
      .eq("id", applicationId)
      .single();
    if (error || !app) return jsonError("Application not found", 404);
    if (userId && app.user_id !== userId) return jsonError("Forbidden", 403);
    userId = app.user_id;
    jobId = app.job_id;
  }

  if (!userId || !jobId) {
    return jsonError("applicationId or (userId + jobId) required", 400);
  }

  const [{ data: profile }, { data: job }] = await Promise.all([
    service.from("profiles").select("*").eq("user_id", userId).single(),
    service.from("jobs").select("*").eq("id", jobId).single(),
  ]);

  if (!profile) return jsonError("Profile not found", 404);
  if (!job) return jsonError("Job not found", 404);

  const { data: upload, error: uploadError } = await service.from("cv_uploads")
    .insert({
      user_id: userId,
      original_filename: `tailored_${job.company}_${job.id}.pdf`,
      storage_path: `${userId}/tailored/${jobId}.pdf`,
      status: "processing",
    })
    .select("id")
    .single();

  if (uploadError || !upload) {
    return jsonError(uploadError?.message ?? "Failed to create upload record", 500);
  }

  const { data: renderJob, error: jobError } = await service.from("render_jobs")
    .insert({
      upload_id: upload.id,
      application_id: applicationId ?? null,
      status: "processing",
    })
    .select("id")
    .single();

  if (jobError || !renderJob) {
    return jsonError(jobError?.message ?? "Failed to create render job", 500);
  }

  const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/render-callback`;
  const theme = Deno.env.get("RENDERCV_THEME") ?? "EngineeringResumes";

  const pipelineRes = await callCvPipeline("/tailor", {
    jobId: renderJob.id,
    uploadId: upload.id,
    userId,
    applicationId,
    profile,
    job,
    theme,
    callbackUrl,
  });

  if (!pipelineRes.ok) {
    const errText = await pipelineRes.text();
    await service.from("render_jobs").update({
      status: "error",
      error_message: errText,
    }).eq("id", renderJob.id);
    return jsonError(`CV pipeline error: ${errText}`, 502);
  }

  return jsonResponse({
    ok: true,
    jobId: renderJob.id,
    uploadId: upload.id,
    applicationId,
    status: "processing",
  }, 202);
});
