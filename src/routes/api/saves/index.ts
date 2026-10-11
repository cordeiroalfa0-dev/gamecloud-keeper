import { createFileRoute } from "@tanstack/react-router";

import { isSameOriginRequest } from "../../../lib/auth";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

// ~6MB decodificado — suficiente para um save state de arcade, evita abuso.
const MAX_STATE_B64_LEN = 8_000_000;
const MAX_ROM_LEN = 160;
const MAX_CORE_LEN = 80;
const MAX_DATE_STR_LEN = 80;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function readSaveSession(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  try {
    const db = await admin();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    return {
      uid: data.user.id,
      email: data.user.email ?? "",
      name: "",
      picture: "",
      exp: 0,
    };
  } catch {
    return null;
  }
}

async function get({ request }: { request: Request }) {
  const session = await readSaveSession(request);
  if (!session) return json({ ok: false, error: "Não autenticado." }, 401);

  const url = new URL(request.url);
  const rom = url.searchParams.get("rom") || "";
  const core = url.searchParams.get("core") || "";
  if (!rom || !core || rom.length > MAX_ROM_LEN || core.length > MAX_CORE_LEN) {
    return json({ ok: false, error: "rom e core são obrigatórios e devem ser válidos." }, 400);
  }

  const drive = await import("@/lib/google-drive-saves.server");
  const driveMode = drive.getGoogleDriveSavesMode();
  if (driveMode === "misconfigured") {
    return json(
      {
        ok: false,
        error: "A integração com Google Drive está configurada incompletamente no servidor.",
      },
      503,
    );
  }
  if (driveMode === "configured") {
    try {
      const data = await drive.readGoogleDriveSave(session.uid, rom, core);
      return json({ ok: true, save: data });
    } catch (error) {
      console.error("Google Drive save read failed:", error);
      return json({ ok: false, error: "Não foi possível ler o save na nuvem." }, 502);
    }
  }

  const db = await admin();
  const { data, error } = await db
    .from("mga_saves")
    .select("state_b64, preview, saved_at, checkpoint_version, date_str")
    .eq("user_id", session.uid)
    .eq("rom", rom)
    .eq("core", core)
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message }, 500);
  const save = data
    ? {
        stateB64: data.state_b64,
        preview: data.preview || "",
        savedAt: Number(data.saved_at),
        checkpointVersion: Number(data.checkpoint_version) || 0,
        dateStr: data.date_str || "",
      }
    : null;
  return json({ ok: true, save });
}

async function upsert({ request }: { request: Request }) {
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Origem inválida." }, 403);
  const session = await readSaveSession(request);
  if (!session) return json({ ok: false, error: "Não autenticado." }, 401);

  const body = await request.json().catch(() => null);
  const rom = String(body?.rom || "");
  const core = String(body?.core || "");
  const stateB64 = String(body?.stateB64 || "");
  // Saves não armazenam imagens: o estado binário é suficiente para restaurar a partida.
  const preview = "";
  const requestedSavedAt = Number(body?.savedAt);
  const savedAt =
    Number.isFinite(requestedSavedAt) && requestedSavedAt > 0 ? requestedSavedAt : Date.now();
  const requestedCheckpointVersion = Number(body?.checkpointVersion);
  const checkpointVersion =
    Number.isFinite(requestedCheckpointVersion) && requestedCheckpointVersion > 0
      ? requestedCheckpointVersion
      : savedAt;
  const dateStr = typeof body?.dateStr === "string" ? body.dateStr.slice(0, MAX_DATE_STR_LEN) : "";

  if (!rom || !core || rom.length > MAX_ROM_LEN || core.length > MAX_CORE_LEN) {
    return json({ ok: false, error: "Dados de save inválidos." }, 400);
  }
  if (!stateB64 || stateB64.length > MAX_STATE_B64_LEN) {
    return json({ ok: false, error: "Estado do save vazio ou grande demais." }, 413);
  }

  const drive = await import("@/lib/google-drive-saves.server");
  const driveMode = drive.getGoogleDriveSavesMode();
  if (driveMode === "misconfigured") {
    return json(
      {
        ok: false,
        error: "A integração com Google Drive está configurada incompletamente no servidor.",
      },
      503,
    );
  }
  if (driveMode === "configured") {
    try {
      const result = await drive.writeGoogleDriveSave(session.uid, rom, core, {
        stateB64,
        preview,
        savedAt,
        checkpointVersion,
        dateStr,
      });
      return json(
        {
          ok: true,
          storage: "google_drive",
          stored: result.stored,
          savedAt: result.save.savedAt,
          checkpointVersion: result.save.checkpointVersion,
          reason: result.stored ? undefined : "newer_remote",
        },
        result.stored ? 200 : 409,
      );
    } catch (error) {
      console.error("Google Drive save write failed:", error);
      return json({ ok: false, error: "Não foi possível gravar o save na nuvem." }, 502);
    }
  }

  const db = await admin();
  type UpsertRpc = (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ stored?: boolean; saved_at?: number; checkpoint_version?: number }> | null;
    error: { code?: string; message: string } | null;
  }>;
  const { data: result, error } = await (db.rpc as unknown as UpsertRpc)("mga_upsert_save", {
    p_user_id: session.uid,
    p_rom: rom,
    p_core: core,
    p_state_b64: stateB64,
    p_preview: preview,
    p_saved_at: savedAt,
    p_checkpoint_version: checkpointVersion,
    p_date_str: dateStr,
  });
  if (error) {
    // Compatibilidade temporária com ambientes que ainda não aplicaram a
    // migração da função atômica: valida antes e confirma depois do upsert.
    if (error.code !== "42883" && error.code !== "PGRST202") {
      return json({ ok: false, error: error.message }, 500);
    }
    const { data: current, error: readError } = await db
      .from("mga_saves")
      .select("saved_at, checkpoint_version")
      .eq("user_id", session.uid)
      .eq("rom", rom)
      .eq("core", core)
      .maybeSingle();
    if (readError) return json({ ok: false, error: readError.message }, 500);
    if (
      current &&
      (Number(current.saved_at) > savedAt ||
        (Number(current.saved_at) === savedAt &&
          Number(current.checkpoint_version || 0) > checkpointVersion))
    ) {
      return json(
        {
          ok: true,
          storage: "supabase",
          stored: false,
          reason: "newer_remote",
          savedAt: Number(current.saved_at),
          checkpointVersion: Number(current.checkpoint_version || 0),
        },
        409,
      );
    }
    const fallback = await db.from("mga_saves").upsert({
      user_id: session.uid,
      rom,
      core,
      state_b64: stateB64,
      preview,
      saved_at: savedAt,
      checkpoint_version: checkpointVersion,
      date_str: dateStr,
    });
    if (fallback.error) return json({ ok: false, error: fallback.error.message }, 500);
    return json({ ok: true, storage: "supabase", stored: true, savedAt, checkpointVersion });
  }
  const stored = Array.isArray(result) ? result[0]?.stored !== false : true;
  const remoteSavedAt = Array.isArray(result) ? Number(result[0]?.saved_at || savedAt) : savedAt;
  const remoteCheckpointVersion = Array.isArray(result)
    ? Number(result[0]?.checkpoint_version || checkpointVersion)
    : checkpointVersion;
  return json(
    {
      ok: true,
      storage: "supabase",
      stored,
      savedAt: remoteSavedAt,
      checkpointVersion: remoteCheckpointVersion,
      reason: stored ? undefined : "newer_remote",
    },
    stored ? 200 : 409,
  );
}

async function remove({ request }: { request: Request }) {
  if (!isSameOriginRequest(request)) return json({ ok: false, error: "Origem inválida." }, 403);
  const session = await readSaveSession(request);
  if (!session) return json({ ok: false, error: "Não autenticado." }, 401);

  const url = new URL(request.url);
  const rom = url.searchParams.get("rom") || "";
  const core = url.searchParams.get("core") || "";
  if (!rom || !core || rom.length > MAX_ROM_LEN || core.length > MAX_CORE_LEN) {
    return json({ ok: false, error: "Parâmetros inválidos." }, 400);
  }

  const drive = await import("@/lib/google-drive-saves.server");
  const driveMode = drive.getGoogleDriveSavesMode();
  if (driveMode === "misconfigured") {
    return json(
      {
        ok: false,
        error: "A integração com Google Drive está configurada incompletamente no servidor.",
      },
      503,
    );
  }
  if (driveMode === "configured") {
    try {
      await drive.deleteGoogleDriveSave(session.uid, rom, core);
      return json({ ok: true });
    } catch (error) {
      console.error("Google Drive save deletion failed:", error);
      return json({ ok: false, error: "Não foi possível excluir o save na nuvem." }, 502);
    }
  }

  const db = await admin();
  const { error } = await db
    .from("mga_saves")
    .delete()
    .eq("user_id", session.uid)
    .eq("rom", rom)
    .eq("core", core);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

// Nunca deixa uma falha inesperada (ex.: conexão interrompida no meio do envio)
// virar uma página de erro 500 — o player recebe JSON e tenta de novo depois.
function safe(handler: (ctx: { request: Request }) => Promise<Response>) {
  return async (ctx: { request: Request }) => {
    try {
      return await handler(ctx);
    } catch (error) {
      if (ctx.request.signal?.aborted) return json({ ok: false, error: "Envio interrompido." }, 499);
      console.error("Falha em /api/saves:", error);
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: message }, 503);
    }
  };
}

export const Route = createFileRoute("/api/saves/")({
  server: { handlers: { GET: safe(get), POST: safe(upsert), DELETE: safe(remove) } },
});
