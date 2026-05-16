import type { Request, Response, NextFunction } from "express";

export function requireSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const expected = process.env.CV_PIPELINE_SECRET;
  if (!expected) {
    res.status(500).json({ error: "CV_PIPELINE_SECRET not configured" });
    return;
  }

  const provided = req.header("x-cv-pipeline-secret") ??
    req.header("authorization")?.replace(/^Bearer\s+/i, "");

  if (provided !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
