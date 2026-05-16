import { z } from "zod";

export const parsedCvSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).default([]),
  experience: z.array(
    z.object({
      company: z.string().optional(),
      role: z.string().optional(),
      dates: z.string().optional(),
      bullets: z.array(z.string()).default([]),
    }),
  ).default([]),
  education: z.array(
    z.object({
      institution: z.string().optional(),
      degree: z.string().optional(),
      dates: z.string().optional(),
    }),
  ).default([]),
});

export type ParsedCv = z.infer<typeof parsedCvSchema>;

export function toRenderCvYaml(data: ParsedCv): string {
  const lines: string[] = ["cv:", "  name: " + JSON.stringify(data.name ?? "")];

  if (data.email) lines.push("  email: " + JSON.stringify(data.email));
  if (data.phone) lines.push("  phone: " + JSON.stringify(data.phone));
  if (data.summary) {
    lines.push("  sections:");
    lines.push("    summary:");
    lines.push("      body: " + JSON.stringify(data.summary));
  }

  if (data.skills.length > 0) {
    lines.push("    skills:");
    lines.push("      label: Skills");
    lines.push("      details: " + JSON.stringify(data.skills.join(", ")));
  }

  if (data.experience.length > 0) {
    lines.push("    experience:");
    for (const exp of data.experience) {
      lines.push("      - company: " + JSON.stringify(exp.company ?? ""));
      lines.push("        position: " + JSON.stringify(exp.role ?? ""));
      if (exp.dates) lines.push("        date: " + JSON.stringify(exp.dates));
      if (exp.bullets.length > 0) {
        lines.push("        highlights:");
        for (const b of exp.bullets) {
          lines.push("          - " + JSON.stringify(b));
        }
      }
    }
  }

  return lines.join("\n");
}
