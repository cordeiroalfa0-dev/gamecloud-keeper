CREATE TABLE IF NOT EXISTS public.mga_saves (
  user_id uuid NOT NULL,
  rom text NOT NULL,
  core text NOT NULL,
  state_b64 text NOT NULL,
  preview text NOT NULL DEFAULT '',
  saved_at bigint NOT NULL,
  checkpoint_version bigint NOT NULL DEFAULT 0,
  date_str text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rom, core)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mga_saves TO authenticated;
GRANT ALL ON public.mga_saves TO service_role;

ALTER TABLE public.mga_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_manage_own_saves" ON public.mga_saves;
CREATE POLICY "users_manage_own_saves" ON public.mga_saves
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mga_upsert_save(
  p_user_id uuid,
  p_rom text,
  p_core text,
  p_state_b64 text,
  p_preview text,
  p_saved_at bigint,
  p_checkpoint_version bigint,
  p_date_str text
)
RETURNS TABLE(stored boolean, saved_at bigint, checkpoint_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_saved_at bigint;
  cur_checkpoint bigint;
BEGIN
  SELECT s.saved_at, s.checkpoint_version INTO cur_saved_at, cur_checkpoint
  FROM public.mga_saves s
  WHERE s.user_id = p_user_id AND s.rom = p_rom AND s.core = p_core
  FOR UPDATE;

  IF FOUND AND (cur_saved_at > p_saved_at OR (cur_saved_at = p_saved_at AND cur_checkpoint > p_checkpoint_version)) THEN
    RETURN QUERY SELECT false, cur_saved_at, cur_checkpoint;
    RETURN;
  END IF;

  INSERT INTO public.mga_saves (user_id, rom, core, state_b64, preview, saved_at, checkpoint_version, date_str, updated_at)
  VALUES (p_user_id, p_rom, p_core, p_state_b64, p_preview, p_saved_at, p_checkpoint_version, p_date_str, now())
  ON CONFLICT (user_id, rom, core) DO UPDATE SET
    state_b64 = EXCLUDED.state_b64,
    preview = EXCLUDED.preview,
    saved_at = EXCLUDED.saved_at,
    checkpoint_version = EXCLUDED.checkpoint_version,
    date_str = EXCLUDED.date_str,
    updated_at = now();

  RETURN QUERY SELECT true, p_saved_at, p_checkpoint_version;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, bigint, text) TO authenticated, service_role;