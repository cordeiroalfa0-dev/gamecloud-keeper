import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [drive, route, bridge, player, env, readme] = await Promise.all([
  readFile(new URL("../src/lib/google-drive-saves.server.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/routes/api/saves/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../public/mame-web.js", import.meta.url), "utf8"),
  readFile(new URL("../public/web/player.html", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
]);

assert.match(drive, /GOOGLE_DRIVE_CLIENT_ID/);
assert.match(drive, /GOOGLE_DRIVE_CLIENT_SECRET/);
assert.match(drive, /GOOGLE_DRIVE_REFRESH_TOKEN/);
assert.match(drive, /oauth2\.googleapis\.com\/token/);

// A conexão do Google Drive ligada ao projeto (gateway) é o caminho preferido.
assert.match(drive, /connector-gateway\.lovable\.dev\/google_drive/);
assert.match(drive, /LOVABLE_API_KEY/);
assert.match(drive, /GOOGLE_DRIVE_API_KEY/);
assert.match(drive, /X-Connection-Api-Key/);

// O save é gravado na nuvem (banco) e no Google Drive ao mesmo tempo.
assert.match(route, /writeDatabaseSave\(/);
assert.match(route, /writeGoogleDriveSave\(/);
assert.match(route, /readDatabaseSave\(/);
assert.match(route, /readGoogleDriveSave\(/);
assert.match(route, /newerSave\(/);
assert.match(route, /driveStored/);

assert.match(route, /readSession\(request\)/);
assert.match(route, /readSaveSession\(request\)/);
assert.match(bridge, /mga-cloud-access-token/);
assert.match(bridge, /mga-player-ready/);
assert.match(player, /cloudHeaders\(\)/);
assert.match(player, /mga-player-ready/);
assert.match(env, /GOOGLE_DRIVE_CLIENT_ID=/);
assert.match(env, /GOOGLE_DRIVE_CLIENT_SECRET=/);
assert.match(env, /GOOGLE_DRIVE_REFRESH_TOKEN=/);
assert.match(readme, /GOOGLE_DRIVE_CLIENT_ID/);

console.log("cloud-save-contract: ok");
