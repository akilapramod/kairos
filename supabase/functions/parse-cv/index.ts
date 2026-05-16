import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/errors.ts";
import { parseCvWithMinimax } from "../_shared/minimax.ts";
import { toRenderCvYaml } from "../_shared/schemas.ts";
import { createServiceClient, invokeFunction } from "../_shared/supabase.ts";

type ParseBody = {
  uploadId: string;
  rawText: string;
  skipRender?: boolean;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  let body: ParseBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { uploadId, rawText, skipRender } = body;
  if (!uploadId || !rawText) {
    return jsonError("uploadId and rawText are required", 400);
  }

  const supabase = createServiceClient();

  const { data: upload, error: uploadError } = await supabase
    .from("cv_uploads")
    .select("id, user_id")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload) {
    return jsonError("Upload not found", 404);
  }

  try {
    const { data: parsed, modelUsed } = await parseCvWithMinimax(rawText);
    const yaml = toRenderCvYaml(parsed);

    await supabase.from("parsed_cv_data").upsert({
      upload_id: uploadId,
      structured_json: parsed,
      rendercv_yaml: yaml,
      model_used: modelUsed,
    }, { onConflict: "upload_id" });

    const skills = parsed.skills ?? [];
    const latestRole = parsed.experience[0]?.role ?? null;
    const latestEmployer = parsed.experience[0]?.company ?? null;

    await supabase.from("profiles").update({
      skills,
      current_role: latestRole,
      employer: latestEmployer,
      cv_yaml: yaml,
      projects: parsed.experience.map((e) => ({
        company: e.company,
        role: e.role,
        dates: e.dates,
        bullets: e.bullets,
      })),
    }).eq("user_id", upload.user_id);

    if (!skipRender) {
      await invokeFunction("render-cv", {
        uploadId,
        source: "parse-cv",
      });
    }

    return jsonResponse({ ok: true, uploadId, modelUsed });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Parse failed";
    await supabase.from("cv_uploads").update({
      status: "error",
      error_message: message,
    }).eq("id", uploadId);
    return jsonError(message, 500);
  }
});
