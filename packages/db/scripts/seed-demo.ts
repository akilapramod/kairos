/**
 * Upsert Kavindu demo data using the service role.
 *
 * Usage (from repo root, with .env.local loaded):
 *   pnpm exec tsx packages/db/scripts/seed-demo.ts
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY
 * Optional: DEMO_USER_ID (default below), DEMO_USER_PHONE, DEMO_USER_EMAIL
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types.js";

const DEMO_USER_ID =
  process.env.DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001";
const DEMO_JOB_ID = "00000000-0000-4000-8000-000000000010";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = process.env.DEMO_USER_EMAIL ?? "kavindu.demo@kairos.local";
  const phone = process.env.DEMO_USER_PHONE ?? "+94770000001";

  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      id: DEMO_USER_ID,
      email,
      phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { name: "Kavindu Perera" },
    });

  if (authError && !authError.message.includes("already")) {
    console.error("auth.admin.createUser:", authError.message);
    process.exit(1);
  }

  const userId = authUser?.user?.id ?? DEMO_USER_ID;

  const { error: userError } = await supabase.from("users").upsert(
    {
      id: userId,
      phone,
      name: "Kavindu Perera",
      email,
      is_active: true,
    },
    { onConflict: "id" },
  );
  if (userError) {
    console.error("users upsert:", userError.message);
    process.exit(1);
  }

  const { error: jobError } = await supabase.from("jobs").upsert(
    {
      id: DEMO_JOB_ID,
      source_name: "greenhouse",
      external_id: "wise-junior-fullstack-demo",
      title: "Junior Full-Stack Developer",
      company: "Wise",
      location: "Remote",
      url: "https://wise.jobs/demo/junior-fullstack",
      description:
        "Build product features with React and Node. Fintech experience valued. Remote-first team.",
      posted_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    },
    { onConflict: "source_name,external_id" },
  );
  if (jobError) {
    console.error("jobs upsert:", jobError.message);
    process.exit(1);
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      user_id: userId,
      current_role: "Junior Full-Stack Developer",
      experience_years: 1.5,
      employer: "PayEase LK",
      skills: [
        "React",
        "Next.js",
        "TypeScript",
        "Node.js",
        "PostgreSQL",
        "Supabase",
        "Tailwind CSS",
      ],
      target_roles: [
        "Junior Full-Stack Developer",
        "Frontend Developer",
        "Full-Stack Engineer",
      ],
      work_preference: "Remote",
      career_goal:
        "Land a remote role at a product-focused international startup paying in USD.",
      projects: [],
    },
    { onConflict: "user_id" },
  );
  if (profileError) {
    console.error("profiles upsert:", profileError.message);
    process.exit(1);
  }

  const { data: existingApp } = await supabase
    .from("applications")
    .select("id")
    .eq("user_id", userId)
    .eq("job_id", DEMO_JOB_ID)
    .maybeSingle();

  if (!existingApp) {
    const { error: appError } = await supabase.from("applications").insert({
      user_id: userId,
      job_id: DEMO_JOB_ID,
      match_score: 87,
      match_reasons: [
        "Strong React/Next.js overlap",
        "Fintech background (PayEase) maps to Wise",
        "Remote preference matches listing",
      ],
      status: "pending",
      notified_at: new Date().toISOString(),
    });
    if (appError) {
      console.error("applications insert:", appError.message);
      process.exit(1);
    }
  }

  console.log("Demo seed complete for user", userId);
}

main();
