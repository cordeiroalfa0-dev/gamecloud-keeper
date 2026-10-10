-- 0005: corrige dois problemas da migração 0004.
--
-- 1) A função mga_upsert_save grava na coluna updated_at, mas bancos criados
--    pelas migrações 0000/0001 não possuem essa coluna (a 0004 usa
--    CREATE TABLE IF NOT EXISTS e não a adiciona). Sem ela, todo save falha.
-- 2) A 0004 concedeu EXECUTE a "authenticated" numa função SECURITY DEFINER que
--    recebe p_user_id como parâmetro: qualquer usuário logado poderia gravar no
--    save de outro. Somente o servidor (service_role) deve chamá-la.
--
-- Seguro de executar mais de uma vez.

ALTER TABLE public.mga_saves
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

REVOKE ALL ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mga_upsert_save(uuid, text, text, text, text, bigint, bigint, text)
  TO service_role;
