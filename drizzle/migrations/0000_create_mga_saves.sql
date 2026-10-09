CREATE TABLE public.mga_saves (
  user_id UUID NOT NULL,
  rom TEXT NOT NULL,
  core TEXT NOT NULL,
  state_b64 TEXT NOT NULL,
  preview TEXT,
  saved_at BIGINT NOT NULL,
  date_str TEXT,
  PRIMARY KEY (user_id, rom, core)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mga_saves TO authenticated;
GRANT ALL ON public.mga_saves TO service_role;
ALTER TABLE public.mga_saves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own saves select" ON public.mga_saves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own saves insert" ON public.mga_saves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own saves update" ON public.mga_saves FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own saves delete" ON public.mga_saves FOR DELETE TO authenticated USING (auth.uid() = user_id);