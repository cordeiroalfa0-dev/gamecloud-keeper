ALTER TABLE public.mga_saves ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.mga_saves ADD COLUMN IF NOT EXISTS checkpoint_version bigint NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS mga_saves_user_rom_core_key ON public.mga_saves (user_id, rom, core);