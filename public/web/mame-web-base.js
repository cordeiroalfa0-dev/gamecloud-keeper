/* Master Games Arcade Web - bridge da camada nativa para WebAssembly.
 * Mantém o renderer original e substitui somente as rotas do backend local.
 */
(() => {
  const API_PREFIX = "/api/";
  const NATIVE_API = "http://localhost:7777";
  const CATALOG_URLS = [
    "/roms-catalog.json",
    "https://raw.githubusercontent.com/cordeiroalfa0-dev/master-games-arcade-system/main/roms-manifest.json"
  ];
  const TITLES_URLS = [
    "/game-titles.json",
    "https://raw.githubusercontent.com/cordeiroalfa0-dev/master-games-arcade-system/main/dist/client/game-titles.json"
  ];
  const originalFetch = window.fetch.bind(window);
  let catalogPromise;
  let titlesPromise;
  const STORAGE = {
    recent: 'mga-recent-games-v1',
    favorites: 'mga-favorite-games-v1'
  };

  const readList = (key) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(value) ? value.filter(Boolean) : [];
    } catch { return []; }
  };
  const writeList = (key, list) => {
    try { localStorage.setItem(key, JSON.stringify([...new Set(list)].slice(0, 100))); } catch {}
  };
  const rememberRecent = (name) => {
    const value = String(name || '').trim();
    if (value) writeList(STORAGE.recent, [value, ...readList(STORAGE.recent)]);
  };
  const toggleFavorite = (name) => {
    const value = String(name || '').trim();
    const current = readList(STORAGE.favorites);
    const next = current.includes(value) ? current.filter((item) => item !== value) : [value, ...current];
    writeList(STORAGE.favorites, next);
    return next;
  };

  const jsonResponse = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });

  const fetchFirstJson = async (urls, errorMessage) => {
    let lastError;
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const response = await originalFetch(url, { cache: 'no-store', signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(errorMessage + (lastError ? ` (${lastError.message})` : ""));
  };

  const loadCatalog = async () => {
    if (!catalogPromise) {
      catalogPromise = fetchFirstJson(CATALOG_URLS, "Catálogo de ROMs indisponível");
    }
    return catalogPromise;
  };

  const loadTitles = async () => {
    if (!titlesPromise) {
      titlesPromise = fetchFirstJson(TITLES_URLS, "Nomes dos jogos indisponíveis")
        .catch(() => ({}));
    }
    return titlesPromise;
  };

  const cleanRomName = (name) =>
    String(name || "").replace(/\.(zip|7z|chd)$/i, "");

  const fileBase = (name) =>
    String(name || "")
      .toLowerCase()
      .replace(/\.(zip|7z|chd)$/i, "");

  // O core arcade do EmulatorJS utiliza FBNeo nesta configuração.
  // Cada ROM precisa pertencer ao romset compatível com a versão do core.
  const BIOS_RULES = [
    {
      bios: "neogeo.zip",
      games: new Set([
        "aof3", "bjourney", "breakers", "breakrev", "eightman",
        "fatfursp", "fatfury3", "garou", "kizuna", "kof94", "kof95",
        "kof96", "kof97", "kof98", "kof99", "kof2000", "kof2001",
        "kof2002", "kof2003", "lastbld2", "lbowling", "magdrop3",
        "matrim", "mslug", "mslug2", "mslug3", "mslug4", "mslug5",
        "mslugx", "samsho", "samsho2", "samsho3", "samsho4", "sengoku3",
        "sonicwi2", "sonicwi3", "svc", "svcsplus", "twinspri", "wakuwak7",
        "whp", "neobombe", "rbffspec", "rotd", "samsh5sp", "ninjamas",
        "kf2k2mp2", "kf2k5uni", "kf10thep", "kof2k4se", "strhoop",
        "ssideki3", "ssideki4", "tetrisp", "spinmast", "zedblade",
        "shocktr2", "sengoku3", "matrim", "puzzled", "kizuna", "pbobblen",
        "doubledr", "sailormn"
      ])
    },
    {
      bios: "pgm.zip",
      games: new Set([
        "dbz2", "martmast", "pcktgal", "sailormn", "savagere"
      ])
    },
    {
      bios: "qsound.zip",
      games: new Set([
        "avsp", "avspu", "ddsom", "ddtod", "dstlk", "hsf2", "megaman2",
        "msh", "mshvsf", "mvsc", "nwarr", "nwarru", "sfa", "sfa2", "sfa2u",
        "sfa3", "sfz2al", "sfz2ald", "sgemf", "spf2t", "ssf2", "ssf2t",
        "vhunt2", "vsav", "vsavj", "xmcota", "xmvsf", "xmvsfe", "xmvsfu",
        "xmvsfj", "xmvsfur1", "armwar", "cybots", "gigawing", "mmatrix",
        "progear"
      ])
    },
    {
      bios: "isgsm.zip",
      games: new Set(["isgsm"])
    }
  ];

  const biosForGame = (name) => {
    const base = fileBase(name);
    const rule = BIOS_RULES.find((entry) => entry.games.has(base));
    return rule?.bios || "";
  };

  const SYSTEM_FILES = new Set([
    "ar_bios.zip", "awbios.zip", "naomi.zip", "neogeo.zip", "nss.zip",
    "pgm.zip", "qsound.zip", "isgsm.zip", "dir.txt"
  ]);

  const isPlayableRom = (name) =>
    /\.(zip|7z|chd)$/i.test(String(name || "")) &&
    !SYSTEM_FILES.has(String(name || "").toLowerCase());

  const compatibilityFor = (name, files) => {
    const biosName = biosForGame(name);
    const bios = biosName && files.find((entry) => fileBase(entry?.name) === fileBase(biosName));
    return {
      rom: name,
      bios: biosName || null,
      biosAvailable: !!bios && !bios.skipDownload,
      biosUrl: bios && !bios.skipDownload ? `/${bios.name}` : null,
      core: /^(avsp|avspu|ddsom|ddtod|dstlk|hsf2|megaman2|msh|mshvsf|mvsc|nwarr|nwarru|sfa|sfa2|sfa2u|sfa3|sfz2al|sfz2ald|sgemf|spf2t|ssf2|ssf2t|vhunt2|vsav|vsavj|xmcota|xmvsf|xmvsfe|xmvsfu|xmvsfj|xmvsfur1|armwar|cybots|gigawing|mmatrix|progear)\.zip$/i.test(name) ? 'fbalpha2012_cps2' : 'arcade'
    };
  };

  async function resolveRom(romName, message) {
    const catalog = await loadCatalog();
    const files = Array.isArray(catalog.files) ? catalog.files : [];

    let item = files.find((entry) => entry?.name === romName);
    if (item?.duplicateOf) {
      const original = files.find((entry) => entry?.name === item.duplicateOf && !entry.skipDownload);
      if (original) item = original;
    }

    if (!item?.id || item.skipDownload) {
      throw new Error(`ROM não disponível para download: ${romName}`);
    }

    // IMPORTANTE: a URL da ROM precisa TERMINAR com o nome real do arquivo
    // (ex.: .../mslug.zip). O EmulatorJS usa o último segmento da URL como
    // nome do arquivo gravado no sistema de arquivos do core, e o FBNeo
    // identifica o romset por esse nome. Com `/api/rom?id=...&name=...`
    // o arquivo era gravado como "rom", sem extensão, e o core não
    // reconhecia o jogo nem casava com a BIOS.
    const romUrl =
      `/api/rom/${encodeURIComponent(item.id)}/${encodeURIComponent(item.name)}`;

    const biosName =
      item.bios ||
      item.biosName ||
      biosForGame(item.name);

    const bios = biosName && files.find(
      (entry) => fileBase(entry?.name) === fileBase(biosName)
    );

    // A BIOS precisa ser servida na RAIZ do site com o nome exato
    // (ex.: /neogeo.zip). Com EJS_dontExtractBIOS=true o EmulatorJS 4.2.3
    // grava a BIOS usando a própria URL como caminho no sistema de
    // arquivos: uma URL com query string ("/api/bios?id=...") gerava um
    // caminho inválido e a BIOS nunca chegava ao core. O rewrite da Vercel
    // encaminha /neogeo.zip, /pgm.zip e /isgsm.zip para /api/bios.
    const biosUrl =
      bios && !bios.skipDownload ? `/${bios.name}` : "";

    if (biosName && !biosUrl) {
      console.warn(
        `[MGA Web] BIOS ${biosName} não foi encontrada no catálogo para ${item.name}.`
      );
    }

    message.textContent = `CARREGANDO ${item.name}...`;
    rememberRecent(item.name);

    return {
      item,
      url: romUrl,
      biosUrl,
      biosName
    };
  }

  function createWebPlayer(
    romName,
    romUrl,
    message,
    overlay,
    biosUrl = "",
    biosName = ""
  ) {
    const iframe = document.createElement("iframe");
    iframe.title = `Master Games Arcade - ${cleanRomName(romName)}`;
    iframe.allow = "autoplay; fullscreen; gamepad";
    iframe.setAttribute("allowfullscreen", "true");
    iframe.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;border:0;background:#000;display:block;";

    const playerUrl = new URL("/web/player.html", location.origin);
    playerUrl.searchParams.set("rom", romUrl);
    playerUrl.searchParams.set("name", cleanRomName(romName));
    // O player é alterado junto com o bridge; versionar a URL evita que o
    // navegador reutilize uma versão antiga que ainda exibia o menu RetroArch.
    playerUrl.searchParams.set("v", "20260926-universal-controls-v13");
    if (biosUrl) playerUrl.searchParams.set("bios", biosUrl);
    if (biosName) playerUrl.searchParams.set("biosName", biosName);

    let closed = false;
    let closeInProgress = false;
    let exitDialog = null;

    const dismissExitDialog = () => {
      if (!exitDialog) return;
      exitDialog.remove();
      exitDialog = null;
    };

    const finishClose = () => {
      if (closed) return;
      closed = true;
      closeInProgress = false;
      dismissExitDialog();
      window.removeEventListener("message", onMessage);
      iframe.src = "about:blank";
      iframe.remove();
      overlay.remove();
      try {
        if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
      } catch {}
      try { screen.orientation?.unlock?.(); } catch {}
    };

    const requestSaveAndClose = () => {
      if (closed || closeInProgress) return;
      if (!iframe.contentWindow) return finishClose();
      closeInProgress = true;
      message.textContent = "SALVANDO A PARTIDA...";
      message.style.display = "grid";
      iframe.contentWindow.postMessage({ type: "mga-request-save-exit" }, location.origin);
      window.setTimeout(() => {
        if (closeInProgress && !closed) {
          message.textContent = "O salvamento demorou. Tente novamente ou saia sem salvar.";
          closeInProgress = false;
        }
      }, 30000);
    };

    const closePlayer = () => {
      if (closed || closeInProgress || exitDialog) return;

      const dialog = document.createElement("div");
      exitDialog = dialog;
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");
      dialog.setAttribute("aria-label", "Sair do jogo");
      dialog.style.cssText =
        "position:absolute;inset:0;z-index:30;display:grid;place-items:center;box-sizing:border-box;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:rgba(0,0,0,.78);backdrop-filter:blur(5px);font-family:monospace;touch-action:manipulation;";
      dialog.addEventListener("pointerdown", (event) => event.stopPropagation());

      const panel = document.createElement("div");
      panel.style.cssText =
        "width:min(420px,100%);box-sizing:border-box;padding:22px 18px;border:1px solid #00e5ff88;border-radius:12px;background:#080012;box-shadow:0 0 28px #00e5ff33;color:#fff;text-align:center;";

      const heading = document.createElement("h2");
      heading.textContent = "SAIR DO JOGO?";
      heading.style.cssText =
        "margin:0 0 10px;color:#00e5ff;font-size:18px;letter-spacing:.08em;";

      const description = document.createElement("p");
      description.textContent = "Quer salvar seu progresso antes de voltar à biblioteca?";
      description.style.cssText =
        "margin:0 0 18px;color:#d5d5dc;font-size:13px;line-height:1.5;";

      const actions = document.createElement("div");
      actions.style.cssText = "display:grid;gap:10px;";

      const makeAction = (label, border, color, handler) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = `min-height:48px;width:100%;padding:10px 14px;border:1px solid ${border};border-radius:8px;background:#10051b;color:${color};font:bold 13px monospace;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;`;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          handler();
        });
        return button;
      };

      actions.append(
        makeAction("Salvar e sair", "#00e5ff", "#6af4ff", () => {
          dismissExitDialog();
          requestSaveAndClose();
        }),
        makeAction("Sair sem salvar", "#ff2bd6", "#ff8ad8", finishClose),
        makeAction("Continuar jogando", "#ffffff44", "#eeeeee", dismissExitDialog)
      );
      panel.append(heading, description, actions);
      dialog.appendChild(panel);
      overlay.appendChild(dialog);
      actions.querySelector("button")?.focus({ preventScroll: true });
    };

    const onMessage = (event) => {
      if (
        event.origin !== location.origin ||
        event.source !== iframe.contentWindow
      ) return;

      if (event.data?.type === "mga-emulator-started") {
        message.remove();
      }

      if (event.data?.type === "mga-emulator-exit") {
        finishClose();
      }

      if (event.data?.type === "mga-emulator-exit-requested") {
        closePlayer();
      }

      if (event.data?.type === "mga-emulator-save-complete") {
        finishClose();
      }

      if (event.data?.type === "mga-emulator-save-failed") {
        closeInProgress = false;
        message.style.display = "grid";
        message.style.pointerEvents = "auto";
        message.innerHTML = "";
        const box = document.createElement("div");
        box.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:14px;max-width:520px;line-height:1.5;";
        const text = document.createElement("div");
        text.textContent = event.data.message || "Não foi possível salvar a partida.";
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;justify-content:center;";
        const retry = document.createElement("button");
        retry.textContent = "Tentar salvar novamente";
        retry.style.cssText = "padding:10px 14px;background:#08000f;border:1px solid #00e5ff;color:#00e5ff;font:bold 12px monospace;cursor:pointer;";
        retry.onclick = requestSaveAndClose;
        const exit = document.createElement("button");
        exit.textContent = "Sair sem salvar";
        exit.style.cssText = "padding:10px 14px;background:#08000f;border:1px solid #ff2bd6;color:#ff8ad8;font:bold 12px monospace;cursor:pointer;";
        exit.onclick = finishClose;
        actions.append(retry, exit);
        box.append(text, actions);
        message.appendChild(box);
      }

      if (event.data?.type === "mga-emulator-error") {
        message.style.display = "grid";
        message.style.pointerEvents = "auto";
        message.innerHTML = "";
        const box = document.createElement("div");
        box.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:14px;max-width:520px;line-height:1.5;";
        const text = document.createElement("div");
        text.textContent = event.data.message || "Erro ao iniciar o jogo.";
        const actions = document.createElement("div");
        actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;justify-content:center;";
        const retry = document.createElement("button");
        retry.textContent = "Tentar novamente";
        retry.style.cssText = "padding:10px 14px;background:#08000f;border:1px solid #00e5ff;color:#00e5ff;font:bold 12px monospace;cursor:pointer;";
        retry.onclick = () => {
          message.textContent = `PREPARANDO ${romName}...`;
          message.style.pointerEvents = "none";
          iframe.src = `${playerUrl.href}&retry=${Date.now()}`;
        };
        const exit = document.createElement("button");
        exit.textContent = "Voltar à biblioteca";
        exit.style.cssText = "padding:10px 14px;background:#08000f;border:1px solid #ff2bd6;color:#ff8ad8;font:bold 12px monospace;cursor:pointer;";
        exit.onclick = finishClose;
        actions.append(retry, exit);
        box.append(text, actions);
        message.appendChild(box);
      }
    };

    window.addEventListener("message", onMessage);

    iframe.onload = () => {
      // O player.html já exibe o estado de carregamento e o próprio botão
      // Start Game. Não mantenha a mensagem do launcher sobre o iframe,
      // pois ela pode esconder o botão que o usuário precisa clicar.
      message.style.display = "none";
    };

    iframe.src = playerUrl.href;
    overlay.querySelector("#mga-web-player-area").appendChild(iframe);

    return { closePlayer };
  }

  const enterMobileLandscape = (target) => {
    if (!matchMedia("(pointer: coarse)").matches) return;
    const lock = () => {
      try { screen.orientation?.lock?.("landscape").catch(() => {}); } catch {}
    };
    try {
      const element = target || document.documentElement;
      const req = element.requestFullscreen || element.webkitRequestFullscreen;
      if (!document.fullscreenElement && req) {
        const result = req.call(element, { navigationUI: "hide" });
        if (result?.then) result.then(lock).catch(() => {});
      } else {
        lock();
      }
    } catch {}
  };

  function showWebPlayer(romName) {
    return new Promise((resolve, reject) => {
      document.getElementById("mga-web-player")?.remove();

      const overlay = document.createElement("div");
      overlay.id = "mga-web-player";
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:#000;overflow:hidden;font-family:Arial,sans-serif;";

      const area = document.createElement("div");
      area.id = "mga-web-player-area";
      area.style.cssText = "position:absolute;inset:0;background:#000;";

      const bar = document.createElement("div");
      bar.style.cssText =
        "position:absolute;top:0;left:0;right:0;height:44px;z-index:20;display:flex;align-items:center;justify-content:space-between;padding:0 12px 0 14px;box-sizing:border-box;background:linear-gradient(180deg,#08000f 0%,rgba(8,0,15,.78) 72%,transparent 100%);color:#fff;pointer-events:none;";

      const brand = document.createElement("strong");
      brand.textContent = "MASTER GAMES ARCADE";
      brand.style.cssText =
        "font-family:monospace;color:#00e5ff;letter-spacing:1px;font-size:12px;text-shadow:0 0 8px #00e5ff;";
      bar.appendChild(brand);

      const navActions = document.createElement("div");
      navActions.style.cssText = "display:flex;align-items:center;gap:8px;";

      const btnSaves = document.createElement("button");
      btnSaves.type = "button";
      btnSaves.textContent = "💾 Saves";
      btnSaves.title = "Gerenciar Partidas Salvas";
      btnSaves.setAttribute("aria-label", "Partidas Salvas");
      btnSaves.style.cssText =
        "pointer-events:auto;height:34px;padding:0 12px;display:flex;align-items:center;justify-content:center;background:#0d001e;border:1px solid #00e5ff;box-shadow:0 0 8px #00e5ff55;color:#00e5ff;cursor:pointer;font-size:11px;font-weight:bold;font-family:monospace;border-radius:4px;";
      btnSaves.onclick = () => {
        const iframe = overlay.querySelector("iframe");
        iframe?.contentWindow?.postMessage({ type: "mga-open-saves" }, "*");
      };
      navActions.appendChild(btnSaves);

      let creditStartVisible = true;
      const btnCreditStart = document.createElement("button");
      btnCreditStart.type = "button";
      btnCreditStart.textContent = "OCULTAR C/S";
      btnCreditStart.title = "Ocultar Crédito e Start";
      btnCreditStart.setAttribute("aria-label", "Ocultar Crédito e Start");
      btnCreditStart.setAttribute("aria-pressed", "true");
      btnCreditStart.style.cssText =
        "pointer-events:auto;min-width:42px;height:34px;padding:0 8px;display:flex;align-items:center;justify-content:center;background:#0d001e;border:1px solid #00e5ff;box-shadow:0 0 8px #00e5ff55;color:#87f4ff;cursor:pointer;font-size:10px;font-weight:bold;font-family:monospace;border-radius:4px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;";
      btnCreditStart.onclick = () => {
        creditStartVisible = !creditStartVisible;
        const label = creditStartVisible ? "Ocultar Crédito e Start" : "Mostrar Crédito e Start";
        btnCreditStart.textContent = creditStartVisible ? "OCULTAR C/S" : "MOSTRAR C/S";
        btnCreditStart.title = label;
        btnCreditStart.setAttribute("aria-label", label);
        btnCreditStart.setAttribute("aria-pressed", String(creditStartVisible));
        overlay.querySelector("iframe")?.contentWindow?.postMessage(
          { type: "mga-set-credit-start-visible", visible: creditStartVisible },
          "*"
        );
      };
      navActions.appendChild(btnCreditStart);

      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "✕";
      close.title = "Fechar";
      close.setAttribute("aria-label", "Fechar");
      close.style.cssText =
        "pointer-events:auto;width:34px;height:34px;padding:0;display:grid;place-items:center;background:#16051d;border:1px solid #ff2bd6;box-shadow:0 0 10px #ff2bd655;color:#fff;cursor:pointer;font-size:20px;font-weight:bold;line-height:1;font-family:Arial,sans-serif;border-radius:4px;";
      navActions.appendChild(close);

      bar.appendChild(navActions);

      const message = document.createElement("div");
      message.id = "mga-rom-message";
      message.textContent = `PREPARANDO ${romName}...`;
      message.style.cssText =
        "position:absolute;inset:0;z-index:10;display:grid;place-items:center;background:#000;color:#00e5ff;font-family:monospace;font-size:16px;font-weight:bold;text-align:center;padding:24px;box-sizing:border-box;text-shadow:0 0 8px #00e5ff;pointer-events:none;";

      overlay.append(area, message, bar);
      document.body.appendChild(overlay);
      // O clique do card ainda está no mesmo gesto do usuário: solicitar
      // fullscreen no overlay (e não antes de criá-lo) aumenta a compatibilidade
      // com Chrome/Safari mobile e permite o lock horizontal.
      enterMobileLandscape(overlay);
      overlay.addEventListener("pointerdown", () => enterMobileLandscape(overlay), { once: true, passive: true });

      let player;
      let launchCancelled = false;
      close.onclick = () => {
        if (player) {
          player.closePlayer();
          return;
        }

        launchCancelled = true;
        overlay.remove();
        try {
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch?.(() => {});
          }
        } catch {}
        try {
          screen.orientation?.unlock?.();
        } catch {}
        resolve();
      };

      (async () => {
        try {
          const { item, url, biosUrl, biosName } =
            await resolveRom(romName, message);
          if (launchCancelled) return;
          player = createWebPlayer(
            item.name,
            url,
            message,
            overlay,
            biosUrl,
            biosName
          );
          resolve();
        } catch (error) {
          message.textContent =
            error?.message || "Falha ao iniciar a ROM.";
          reject(error);
        }
      })();
    });
  }

  window.MGA_WEB = Object.freeze({
    launch: showWebPlayer,
    version: "1.5.3"
  });

  window.fetch = async function(input, init) {
    const rawUrl =
      typeof input === "string" ? input : input?.url || "";

    let parsed;
    try {
      parsed = new URL(rawUrl, location.href);
    } catch {
      return originalFetch(input, init);
    }

    const isNativeApi = parsed.origin === NATIVE_API;
    const isLocalApi =
      parsed.origin === location.origin &&
      parsed.pathname.startsWith(API_PREFIX);

    if (!isNativeApi && !isLocalApi) {
      return originalFetch(input, init);
    }

    const path = parsed.pathname;
    const method = (init?.method || "GET").toUpperCase();

    if (path === "/api/health") {
      return jsonResponse({
        ok: true,
        port: 0,
        version: "web-wasm",
        installDir: "",
        romsDir: "WEB"
      });
    }

    if (path === "/api/config" && method === "GET") {
      return jsonResponse({
        mamePath: "WEBASSEMBLY",
        romsDir: "WEB",
        emulator: "arcade-fbneo"
      });
    }

    if (path === "/api/config" && method === "POST") {
      return jsonResponse({
        ok: true,
        mamePath: "WEBASSEMBLY",
        romsDir: "WEB",
        emulator: "arcade-fbneo"
      });
    }

    if (path === "/api/check-mame") {
      return jsonResponse({
        exists: true,
        path: "WEBASSEMBLY",
        currentRompath: "WEB",
        emulator: "arcade-fbneo"
      });
    }

    if (path === "/api/art") {
      const romParam = cleanRomName(parsed.searchParams.get("rom") || "");
      const clean = romParam.toLowerCase().replace(/\s*\(\d+\)$/, "").trim();

      const candidateUrls = [
        "https://cdn.jsdelivr.net/gh/cordeiroalfa0-dev/master-games-arcade-system@main/snaps/" + clean + ".png",
        "https://raw.githubusercontent.com/cordeiroalfa0-dev/master-games-arcade-system/main/snaps/" + clean + ".png"
      ];

      for (const artUrl of candidateUrls) {
        try {
          const res = await originalFetch(artUrl, { cache: "force-cache" });
          if (res.ok) {
            const blob = await res.blob();
            if (blob.size > 200) {
              return new Response(blob, {
                status: 200,
                headers: {
                  "Content-Type": res.headers.get("Content-Type") || "image/png",
                  "Cache-Control": "public, max-age=86400",
                  "Access-Control-Allow-Origin": "*"
                }
              });
            }
          }
        } catch {
          // continuar tentando candidatos
        }
      }

      return jsonResponse(
        { ok: false, available: false, url: null },
        404
      );
    }

    if (path === "/api/media" || path === "/api/video") {
      const romParam = cleanRomName(parsed.searchParams.get("rom") || "");
      const clean = romParam.toLowerCase().replace(/\s*\(\d+\)$/, "").trim();
      return jsonResponse({
        ok: true,
        rom: clean,
        snap: "https://cdn.jsdelivr.net/gh/cordeiroalfa0-dev/master-games-arcade-system@main/snaps/" + clean + ".png",
        icon: "https://cdn.jsdelivr.net/gh/cordeiroalfa0-dev/master-games-arcade-system@main/snaps/" + clean + ".png",
        video: "https://archive.org/download/mame-video-previews/" + clean + ".mp4"
      });
    }

    if (path === "/api/roms") {
      const catalog = await loadCatalog();

      const roms = (catalog.files || [])
        .filter((item) => !item?.skipDownload && !item?.duplicateOf)
        .map((item) => item.name)
        .filter(Boolean)
        .filter(isPlayableRom)
        .sort((a, b) => a.localeCompare(b));

      return jsonResponse({
        roms,
        path: "WEB",
        total: roms.length
      });
    }

    if (path === "/api/gamenames") {
      const [titles, catalog] = await Promise.all([
        loadTitles(),
        loadCatalog()
      ]);

      const names = { ...titles };

      for (const item of catalog.files || []) {
        const name = String(item?.name || "");
        if (!/\.(zip|7z|chd)$/i.test(name)) continue;

        const key = fileBase(name);
        if (key && !names[key]) {
          names[key] = key
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase());
        }
      }

      return jsonResponse({
        names,
        details: {},
        total: Object.keys(names).length
      });
    }

    if (path === "/api/roms/check" && method === "GET") {
      const catalog = await loadCatalog();
      const requested = parsed.searchParams.get("name") || "";
      const files = Array.isArray(catalog.files) ? catalog.files : [];
      const item = files.find((entry) => entry?.name === requested);
      if (!item) return jsonResponse({ ok: false, error: "ROM não encontrada no catálogo." }, 404);
      const resolved = item.duplicateOf || item.name;
      return jsonResponse({ ok: true, available: !item.skipDownload, duplicateOf: item.duplicateOf || null, resolved, ...compatibilityFor(resolved, files) });
    }

    if (path === "/api/bios/status" && method === "GET") {
      const catalog = await loadCatalog();
      const files = Array.isArray(catalog.files) ? catalog.files : [];
      const bios = [...new Set(BIOS_RULES.map((rule) => rule.bios))].map((name) => {
        const entry = files.find((file) => file?.name === name);
        return { name, available: !!entry && !entry.skipDownload, id: entry?.id || null };
      });
      const missing = bios.filter((entry) => !entry.available).map((entry) => entry.name);
      return jsonResponse({ ok: true, bios, ready: missing.length === 0, missing });
    }

    if (path === "/api/games/recent" && method === "GET") {
      return jsonResponse({ ok: true, games: readList(STORAGE.recent) });
    }

    if (path === "/api/games/favorites" && method === "GET") {
      return jsonResponse({ ok: true, games: readList(STORAGE.favorites) });
    }

    if (path === "/api/games/favorites" && method === "POST") {
      let body = {};
      try { body = JSON.parse(init.body || "{}"); } catch {}
      const games = toggleFavorite(body.name || body.romName);
      return jsonResponse({ ok: true, games });
    }

    if (path === "/api/gamepads" && method === "GET") {
      return jsonResponse({ ok: true, ...(window.MGA_Gamepads?.get?.() || { connected: 0, players: [] }) });
    }

    if (path === "/api/launch" && method === "POST") {
      let body = {};
      try {
        body = JSON.parse(init.body || "{}");
      } catch {}

      const romName = body.romName || "ROM";

      try {
        await showWebPlayer(romName);
        return jsonResponse({ ok: true, web: true, romName });
      } catch (error) {
        return jsonResponse(
          {
            ok: false,
            error: error?.message || "Falha no player WebAssembly"
          },
          500
        );
      }
    }

    if (path === "/api/roms/status") {
      return jsonResponse({
        running: false,
        completed: 0,
        total: 0,
        files: []
      });
    }

    if (path === "/api/roms/manifest") {
      const catalog = await loadCatalog();
      return jsonResponse(catalog);
    }

    if (
      path === "/api/set-rompath" ||
      path === "/api/reset-controls" ||
      path === "/api/test-mame"
    ) {
      return jsonResponse({ ok: true, web: true });
    }

    return originalFetch(input, init);
  };

  console.info(
    "[MGA Web] Bridge WebAssembly ativo — EmulatorJS FBNeo, ROM e BIOS por URL."
  );
})();
