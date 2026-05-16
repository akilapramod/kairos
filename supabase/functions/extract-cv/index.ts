import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extractText, getDocumentProxy } from "unpdf";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/errors.ts";
import { createServiceClient, invokeFunction } from "../_shared/supabase.ts";

type CvUploadRecord = {
  id: string;
  user_id: string;
  storage_path: string;
  status: string;
};

type WebhookPayload = {
  type: string;
  record?: CvUploadRecord;
  uploadId?: string;
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const uploadId = payload.uploadId ?? payload.record?.id;
  if (!uploadId) {
    return jsonError("Missing uploadId or record.id", 400);
  }

  const supabase = createServiceClient();

  const { data: upload, error: uploadError } = await supabase
    .from("cv_uploads")
    .select("id, user_id, storage_path, status")
    .eq("id", uploadId)
    .single();

  if (uploadError || !upload) {
    return jsonError("Upload not found", 404);
  }

  await supabase.from("cv_uploads").update({ status: "processing" }).eq(
    "id",
    uploadId,
  );

  try {
    const { data: file, error: downloadError } = await supabase.storage
      .from("cv-uploads")
      .download(upload.storage_path);

    if (downloadError || !file) {
      throw new Error(downloadError?.message ?? "Failed to download PDF");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const rawText = (text ?? "").trim();

    if (!rawText) {
      await supabase.from("cv_uploads").update({
        status: "error",
        error_message: "No extractable text in PDF (scanned/image PDFs need OCR)",
      }).eq("id", uploadId);
      return jsonError("No extractable text", 422);
    }

    await invokeFunction("parse-cv", { uploadId, rawText });

    return jsonResponse({ ok: true, uploadId, status: "processing" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    await supabase.from("cv_uploads").update({
      status: "error",
      error_message: message,
    }).eq("id", uploadId);
    return jsonError(message, 500);
  }
});
