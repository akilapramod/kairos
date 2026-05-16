import type { Request, Response } from "express";
import { notifyCallback } from "./callback.js";
import { buildYamlFromStructured, renderPdfFromYaml } from "./rendercv.js";
import { createServiceClient } from "./supabase.js";

type TailorBody = {
  jobId: string;
  uploadId: string;
  userId: string;
  applicationId?: string;
  profile: Record<string, unknown>;
  job: Record<string, unknown>;
  theme?: string;
  callbackUrl: string;
};

export async function handleTailor(req: Request, res: Response): Promise<void> {
  const body = req.body as TailorBody;
  const {
    jobId,
    uploadId,
    userId,
    applicationId,
    profile,
    job,
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
      const structured = {
        name: profile.user_id ? "Candidate" : "Candidate",
        summary: `Tailored for ${job.title} at ${job.company}`,
        skills: profile.skills ?? [],
        experience: [
          {
            company: profile.employer ?? "",
            role: profile.current_role ?? "",
            bullets: [
              `Targeting: ${job.title}`,
              String(job.description ?? "").slice(0, 200),
            ],
          },
        ],
      };

      const cvYaml = typeof profile.cv_yaml === "string" && profile.cv_yaml
        ? profile.cv_yaml
        : buildYamlFromStructured(structured, theme);

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

      const cvVersionUrl = signed?.signedUrl ?? outputPath;

      if (applicationId) {
        await supabase.from("applications").update({
          cv_version_url: cvVersionUrl,
        }).eq("id", applicationId);
      }

      await notifyCallback(callbackUrl, {
        jobId,
        uploadId,
        userId,
        applicationId,
        status: "done",
        outputStoragePath: outputPath,
        cvVersionUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tailor failed";
      await notifyCallback(callbackUrl, {
        jobId,
        uploadId,
        userId,
        applicationId,
        status: "error",
        errorMessage: message,
      }).catch(() => undefined);
    }
  })();
}
