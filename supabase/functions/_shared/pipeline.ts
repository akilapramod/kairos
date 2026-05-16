export async function callCvPipeline(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const baseUrl = Deno.env.get("CV_PIPELINE_URL");
  const secret = Deno.env.get("CV_PIPELINE_SECRET");

  if (!baseUrl || !secret) {
    throw new Error("CV_PIPELINE_URL or CV_PIPELINE_SECRET not set");
  }

  const url = `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cv-pipeline-secret": secret,
    },
    body: JSON.stringify(body),
  });
}
