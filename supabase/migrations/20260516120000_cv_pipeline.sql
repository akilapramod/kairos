-- CV upload pipeline: uploads, parsed data, render jobs + storage buckets

-- ---------------------------------------------------------------------------
-- cv_uploads
-- ---------------------------------------------------------------------------

CREATE TABLE public.cv_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cv_uploads_status_check CHECK (
    status IN ('pending', 'processing', 'done', 'error')
  )
);

CREATE INDEX cv_uploads_user_id_idx ON public.cv_uploads (user_id);

-- ---------------------------------------------------------------------------
-- parsed_cv_data
-- ---------------------------------------------------------------------------

CREATE TABLE public.parsed_cv_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.cv_uploads(id) ON DELETE CASCADE,
  structured_json jsonb NOT NULL,
  rendercv_yaml text,
  model_used text,
  parsed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parsed_cv_data_upload_id_key UNIQUE (upload_id)
);

-- ---------------------------------------------------------------------------
-- render_jobs
-- ---------------------------------------------------------------------------

CREATE TABLE public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.cv_uploads(id) ON DELETE CASCADE,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  output_storage_path text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT render_jobs_status_check CHECK (
    status IN ('pending', 'processing', 'done', 'error')
  )
);

CREATE INDEX render_jobs_upload_id_idx ON public.render_jobs (upload_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.cv_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parsed_cv_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_uploads select own"
  ON public.cv_uploads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "cv_uploads insert own"
  ON public.cv_uploads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cv_uploads update own"
  ON public.cv_uploads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "parsed_cv_data select own"
  ON public.parsed_cv_data FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cv_uploads u
      WHERE u.id = parsed_cv_data.upload_id AND u.user_id = auth.uid()
    )
  );

CREATE POLICY "render_jobs select own"
  ON public.render_jobs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cv_uploads u
      WHERE u.id = render_jobs.upload_id AND u.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.render_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cv_uploads;

-- ---------------------------------------------------------------------------
-- Storage buckets
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('cv-uploads', 'cv-uploads', false, 10485760, ARRAY['application/pdf']),
  ('cv-renders', 'cv-renders', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- cv-uploads: users read/write own prefix
CREATE POLICY "cv_uploads storage select own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cv-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "cv_uploads storage insert own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cv-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "cv_uploads storage update own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cv-uploads'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- cv-renders: users read own; service role inserts (edge / railway)
CREATE POLICY "cv_renders storage select own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'cv-renders'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "cv_renders storage insert service"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'cv-renders');

CREATE POLICY "cv_renders storage update service"
  ON storage.objects FOR UPDATE TO service_role
  USING (bucket_id = 'cv-renders');
