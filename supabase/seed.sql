-- Demo seed: Kavindu Perera persona
-- Requires a matching auth user in public.users (create via Dashboard Auth or seed-demo script).
-- Fixed demo user id — replace if your test auth user uses a different UUID.

-- Demo user UUID (create auth user with this id via Admin API, or run packages/db/scripts/seed-demo.ts)
-- 00000000-0000-4000-8000-000000000001

INSERT INTO public.jobs (
  id,
  source_name,
  external_id,
  title,
  company,
  location,
  url,
  description,
  posted_at
)
VALUES (
  '00000000-0000-4000-8000-000000000010',
  'greenhouse',
  'wise-junior-fullstack-demo',
  'Junior Full-Stack Developer',
  'Wise',
  'Remote',
  'https://wise.jobs/demo/junior-fullstack',
  'Build product features with React and Node. Fintech experience valued. Remote-first team.',
  now() - interval '6 minutes'
)
ON CONFLICT (source_name, external_id) DO UPDATE SET
  title = EXCLUDED.title,
  company = EXCLUDED.company,
  location = EXCLUDED.location,
  url = EXCLUDED.url,
  description = EXCLUDED.description,
  posted_at = EXCLUDED.posted_at;

-- Profile + application only when demo user exists
DO $$
DECLARE
  demo_user_id uuid := '00000000-0000-4000-8000-000000000001';
  demo_job_id uuid := '00000000-0000-4000-8000-000000000010';
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE id = demo_user_id) THEN
    INSERT INTO public.profiles (
      user_id,
      current_role,
      experience_years,
      employer,
      skills,
      target_roles,
      work_preference,
      career_goal,
      projects
    )
    VALUES (
      demo_user_id,
      'Junior Full-Stack Developer',
      1.5,
      'PayEase LK',
      ARRAY['React', 'Next.js', 'TypeScript', 'Node.js', 'PostgreSQL', 'Supabase', 'Tailwind CSS'],
      ARRAY['Junior Full-Stack Developer', 'Frontend Developer', 'Full-Stack Engineer'],
      'Remote',
      'Land a remote role at a product-focused international startup paying in USD.',
      '[]'::jsonb
    )
    ON CONFLICT (user_id) DO UPDATE SET
      current_role = EXCLUDED.current_role,
      experience_years = EXCLUDED.experience_years,
      employer = EXCLUDED.employer,
      skills = EXCLUDED.skills,
      target_roles = EXCLUDED.target_roles,
      work_preference = EXCLUDED.work_preference,
      career_goal = EXCLUDED.career_goal;

    IF NOT EXISTS (
      SELECT 1 FROM public.applications
      WHERE user_id = demo_user_id AND job_id = demo_job_id
    ) THEN
      INSERT INTO public.applications (
        user_id,
        job_id,
        match_score,
        match_reasons,
        status,
        notified_at
      )
      VALUES (
        demo_user_id,
        demo_job_id,
        87,
        ARRAY[
          'Strong React/Next.js overlap',
          'Fintech background (PayEase) maps to Wise',
          'Remote preference matches listing'
        ],
        'pending',
        now()
      );
    END IF;
  END IF;
END $$;
