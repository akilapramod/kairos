export async function notifyCallback(
  callbackUrl: string,
  body: Record<string, unknown>,
): Promise<void> {
  const secret = process.env.CV_PIPELINE_SECRET;
  if (!secret) throw new Error("CV_PIPELINE_SECRET not set");

  const res = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cv-pipeline-secret": secret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Callback failed (${res.status}): ${text}`);
  }
}
