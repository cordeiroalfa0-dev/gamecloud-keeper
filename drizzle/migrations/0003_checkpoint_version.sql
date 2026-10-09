ALTER TABLE public.mga_saves
  ADD COLUMN IF NOT EXISTS checkpoint_version BIGINT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.mga_upsert_save(
  p_user_id uuid, p_rom text, p_core text, p_state_b64 text,
  p_preview text, p_saved_at bigint, p_checkpoint_version bigint, p_date_str text
) RETURNS TABLE(stored boolean, saved_at bigint, checkpoint_version bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_saved bigint;
  v_version bigint;
BEGIN
  INSERT INTO public.mga_saves AS s
    (user_id, rom, core, state_b64, preview, saved_at, checkpoint_version, date_str)
  VALUES
    (p_user_id, p_rom, p_core, p_state_b64, p_preview, p_saved_at, p_checkpoint_version, p_date_str)
  ON CONFLICT (user_id, rom, core) DO UPDATE
    SET state_b64 = EXCLUDED.state_b64,
        preview = EXCLUDED.preview,
        saved_at = EXCLUDED.saved_at,
        checkpoint_version = EXCLUDED.checkpoint_version,
        date_str = EXCLUDED.date_str
    WHERE (s.saved_at, s.checkpoint_version) <=
          (EXCLUDED.saved_at, EXCLUDED.checkpoint_version)
  RETURNING mga_saves.saved_at, mga_saves.checkpoint_version
    INTO v_saved, v_version;

  IF v_saved IS NULL THEN
    SELECT m.saved_at, m.checkpoint_version
      INTO v_saved, v_version
      FROM public.mga_saves m
     WHERE m.user_id = p_user_id AND m.rom = p_rom AND m.core = p_core;
    RETURN QUERY SELECT false, v_saved, v_version;
  ELSE
    RETURN QUERY SELECT true, v_saved, v_version;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, bigint, text)
  TO service_role;
