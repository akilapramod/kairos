import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function renderPdfFromYaml(
  yaml: string,
  theme: string,
): Promise<Uint8Array> {
  const workDir = await mkdtemp(join(tmpdir(), "kairos-render-"));

  const yamlPath = join(workDir, "cv.yaml");
  await writeFile(yamlPath, yaml, "utf8");

  try {
    await execFileAsync("rendercv", [
      "render",
      yamlPath,
      "--output-format",
      "pdf",
      "--theme",
      theme,
    ], { cwd: workDir, timeout: 120_000 });

    const pdfPath = join(workDir, "cv.pdf");
    const buf = await readFile(pdfPath);
    return new Uint8Array(buf);
  } catch {
    return minimalPdfPlaceholder();
  }
}

function minimalPdfPlaceholder(): Uint8Array {
  const text = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF";
  return new TextEncoder().encode(text);
}

export function buildYamlFromStructured(
  structured: Record<string, unknown>,
  theme: string,
): string {
  const name = String(structured.name ?? "Candidate");
  const skills = Array.isArray(structured.skills)
    ? structured.skills.join(", ")
    : "";
  return [
    "cv:",
    `  name: ${JSON.stringify(name)}`,
    "  sections:",
    skills ? `    skills:\n      details: ${JSON.stringify(skills)}` : "",
    `# theme: ${theme}`,
  ].filter(Boolean).join("\n");
}
