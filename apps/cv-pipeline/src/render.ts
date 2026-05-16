import type { Request, Response } from "express";
import { notifyCallback } from "./callback.js";
import { buildYamlFromStructured, renderPdfFromYaml } from "./rendercv.js";
import { createServiceClient } from "./supabase.js";

type RenderBody = {
  jobId: string;
  uploadId: string;
  userId: string;
  yaml?: string | null;
  structuredJson?: Record<string, unknown>;
  theme?: string;
  callbackUrl: string;
};

export async function handleRender(req: Request, res: Response): Promise<void> {
  const body = req.body as RenderBody;
  const {
    jobId,
    uploadId,
    userId,
    yaml,
    structuredJson,
    theme = process.env.RENDERCV_THEME ?? "EngineeringResumes",
    callbackUrl,
  } = body;

  if (!jobId || !uploadId || !userId || !callbackUrl) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  res.status(202).json({ ok: true, jobId, status: "processing" });

  void (async () => {
    try {
      const cvYaml = yaml ??
        (structuredJson
          ? buildYamlFromStructured(structuredJson, theme)
          : null);

      if (!cvYaml) {
        throw new Error("No YAML or structuredJson provided");
      }

      const pdf = await renderPdfFromYaml(cvYaml, theme);
      const outputPath = `${userId}/${jobId}.pdf`;
      const supabase = createServiceClient();

      const { error: uploadError } = await supabase.storage
        .from("cv-renders")
        .upload(outputPath, pdf, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from("cv-renders")
        .createSignedUrl(outputPath, 3600);

      await notifyCallback(callbackUrl, {
        jobId,
        uploadId,
        userId,
        status: "done",
        outputStoragePath: outputPath,
        cvVersionUrl: signed?.signedUrl ?? outputPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed";
      await notifyCallback(callbackUrl, {
        jobId,
        uploadId,
        userId,
        status: "error",
        errorMessage: message,
      }).catch(() => undefined);
    }
  })();
}
