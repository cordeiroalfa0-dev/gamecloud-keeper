CREATE OR REPLACE FUNCTION public.mga_upsert_save(
  p_user_id uuid, p_rom text, p_core text, p_state_b64 text,
  p_preview text, p_saved_at bigint, p_date_str text
) RETURNS TABLE(stored boolean, saved_at bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saved bigint;
BEGIN
  INSERT INTO public.mga_saves AS s (user_id, rom, core, state_b64, preview, saved_at, date_str)
  VALUES (p_user_id, p_rom, p_core, p_state_b64, p_preview, p_saved_at, p_date_str)
  ON CONFLICT (user_id, rom, core) DO UPDATE
    SET state_b64 = EXCLUDED.state_b64, preview = EXCLUDED.preview,
        saved_at = EXCLUDED.saved_at, date_str = EXCLUDED.date_str
    WHERE s.saved_at <= EXCLUDED.saved_at
  RETURNING s.saved_at INTO v_saved;
  IF v_saved IS NULL THEN
    SELECT m.saved_at INTO v_saved FROM public.mga_saves m
      WHERE m.user_id = p_user_id AND m.rom = p_rom AND m.core = p_core;
    RETURN QUERY SELECT false, v_saved;
  ELSE
    RETURN QUERY SELECT true, v_saved;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, text) TO service_role;