import { createFileRoute } from "@tanstack/react-router";

import { isSameOriginRequest, readSession } from "../../../lib/auth";

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

type StoredSave = {
  stateB64: string;
  preview: string;
  savedAt: number;
  checkpointVersion: number;
  dateStr: string;
};

type WriteResult = { stored: boolean; savedAt: number; checkpointVersion: number };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function readSaveSession(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return readSession(request);

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

// O save mais recente vence, independente de onde ele estava guardado.
function newerSave(a: StoredSave | null, b: StoredSave | null): StoredSave | null {
  if (!a) return b;
  if (!b) return a;
  if (b.savedAt > a.savedAt) return b;
  if (b.savedAt === a.savedAt && b.checkpointVersion > a.checkpointVersion) return b;
  return a;
}

async function readDatabaseSave(
  uid: string,
  rom: string,
  core: string,
): Promise<StoredSave | null> {
  const db = await admin();
  const { data, error } = await db
    .from("mga_saves")
    .select("state_b64, preview, saved_at, checkpoint_version, date_str")
    .eq("user_id", uid)
    .eq("rom", rom)
    .eq("core", core)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? {
        stateB64: data.state_b64,
        preview: data.preview || "",
        savedAt: Number(data.saved_at),
        checkpointVersion: Number(data.checkpoint_version) || 0,
        dateStr: data.date_str || "",
      }
    : null;
}

type DatabaseWrite = { ok: true; result: WriteResult } | { ok: false; error: string };

async function writeDatabaseSave(
  uid: string,
  rom: string,
  core: string,
  payload: {
    stateB64: string;
    preview: string;
    savedAt: number;
    checkpointVersion: number;
    dateStr: string;
  },
): Promise<DatabaseWrite> {
  const db = await admin();
  type UpsertRpc = (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: Array<{ stored?: boolean; saved_at?: number; checkpoint_version?: number }> | null;
    error: { code?: string; message: string } | null;
  }>;
  const { data: result, error } = await (db.rpc as unknown as UpsertRpc)("mga_upsert_save", {
    p_user_id: uid,
    p_rom: rom,
    p_core: core,
    p_state_b64: payload.stateB64,
    p_preview: payload.preview,
    p_saved_at: payload.savedAt,
    p_checkpoint_version: payload.checkpointVersion,
    p_date_str: payload.dateStr,
  });
  if (error) {
    // Compatibilidade temporária com ambientes que ainda não aplicaram a
    // migração da função atômica: valida antes e confirma depois do upsert.
    if (error.code !== "42883" && error.code !== "PGRST202") {
      return { ok: false, error: error.message };
    }
    const { data: current, error: readError } = await db
      .from("mga_saves")
      .select("saved_at, checkpoint_version")
      .eq("user_id", uid)
      .eq("rom", rom)
      .eq("core", core)
      .maybeSingle();
    if (readError) return { ok: false, error: readError.message };
    if (
      current &&
      (Number(current.saved_at) > payload.savedAt ||
        (Number(current.saved_at) === payload.savedAt &&
          Number(current.checkpoint_version || 0) > payload.checkpointVersion))
    ) {
      return {
        ok: true,
        result: {
          stored: false,
          savedAt: Number(current.saved_at),
          checkpointVersion: Number(current.checkpoint_version || 0),
        },
      };
    }
    const fallback = await db.from("mga_saves").upsert({
      user_id: uid,
      rom,
      core,
      state_b64: payload.stateB64,
      preview: payload.preview,
      saved_at: payload.savedAt,
      checkpoint_version: payload.checkpointVersion,
      date_str: payload.dateStr,
    });
    if (fallback.error) return { ok: false, error: fallback.error.message };
    return {
      ok: true,
      result: {
        stored: true,
        savedAt: payload.savedAt,
        checkpointVersion: payload.checkpointVersion,
      },
    };
  }
  const stored = Array.isArray(result) ? result[0]?.stored !== false : true;
  return {
    ok: true,
    result: {
      stored,
      savedAt: Array.isArray(result) ? Number(result[0]?.saved_at || payload.savedAt) : payload.savedAt,
      checkpointVersion: Array.isArray(result)
        ? Number(result[0]?.checkpoint_version || payload.checkpointVersion)
        : payload.checkpointVersion,
    },
  };
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

  let databaseSave: StoredSave | null;
  try {
    databaseSave = await readDatabaseSave(session.uid, rom, core);
  } catch (error) {
    console.error("Database save read failed:", error);
    return json({ ok: false, error: "Não foi possível ler o save na nuvem." }, 500);
  }

  if (driveMode !== "configured") {
    return json({ ok: true, save: databaseSave, storage: "database" });
  }

  // Google Drive é lido em paralelo com o banco; o mais recente dos dois vence.
  let driveSave: StoredSave | null = null;
  try {
    driveSave = await drive.readGoogleDriveSave(session.uid, rom, core);
  } catch (error) {
    console.error("Google Drive save read failed:", error);
  }

  const save = newerSave(databaseSave, driveSave);
  return json({ ok: true, save, storage: "database+google_drive" });
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

  const payload = { stateB64, preview, savedAt, checkpointVersion, dateStr };

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

  // O banco grava sempre; o Google Drive grava quando está configurado. Assim o
  // save fica na nuvem e no Drive ao mesmo tempo.
  const databaseWrite = await writeDatabaseSave(session.uid, rom, core, payload);

  let driveStored: boolean | null = null;
  let driveError: unknown = null;
  if (driveMode === "configured") {
    try {
      const result = await drive.writeGoogleDriveSave(session.uid, rom, core, payload);
      driveStored = result.stored;
    } catch (error) {
      driveError = error;
      console.error("Google Drive save write failed:", error);
    }
  }

  if (!databaseWrite.ok && driveStored === null) {
    return json({ ok: false, error: databaseWrite.error }, 500);
  }
  if (!databaseWrite.ok && driveStored !== true) {
    return json(
      {
        ok: false,
        error: driveError instanceof Error ? driveError.message : databaseWrite.error,
      },
      502,
    );
  }

  const stored = databaseWrite.ok ? databaseWrite.result.stored : driveStored === true;
  const accepted = stored || driveStored === true;
  const savedAtResult = databaseWrite.ok ? databaseWrite.result.savedAt : savedAt;
  const checkpointResult = databaseWrite.ok
    ? databaseWrite.result.checkpointVersion
    : checkpointVersion;
  // Só anuncia o Drive quando a gravação nele realmente aconteceu.
  const storage = driveStored === true ? "database+google_drive" : "database";

  return json(
    {
      ok: true,
      storage,
      stored: accepted,
      driveStored: driveStored === true,
      savedAt: savedAtResult,
      checkpointVersion: checkpointResult,
      reason: accepted ? undefined : "newer_remote",
    },
    accepted ? 200 : 409,
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

  const db = await admin();
  const { error } = await db
    .from("mga_saves")
    .delete()
    .eq("user_id", session.uid)
    .eq("rom", rom)
    .eq("core", core);
  if (error) return json({ ok: false, error: error.message }, 500);

  if (driveMode === "configured") {
    try {
      await drive.deleteGoogleDriveSave(session.uid, rom, core);
    } catch (error) {
      console.error("Google Drive save deletion failed:", error);
    }
  }
  return json({ ok: true });
}

// Nunca deixa uma falha inesperada (ex.: conexão interrompida no meio do envio)
// virar uma página de erro 500 — o player recebe JSON e tenta de novo depois.
function safe(handler: (ctx: { request: Request }) => Promise<Response>) {
  return async (ctx: { request: Request }) => {
    try {
      return await handler(ctx);
    } catch (error) {
      if (ctx.request.signal?.aborted)
        return json({ ok: false, error: "Envio interrompido." }, 499);
      console.error("Falha em /api/saves:", error);
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: message }, 503);
    }
  };
}

export const Route = createFileRoute("/api/saves/")({
  server: { handlers: { GET: safe(get), POST: safe(upsert), DELETE: safe(remove) } },
});
