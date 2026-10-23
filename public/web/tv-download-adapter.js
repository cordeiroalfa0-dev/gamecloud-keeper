/* TV-only verified downloads and ultra-lightweight emulation settings. */
(()=>{
  let emulatorClass;
  Object.defineProperty(window, 'EmulatorJS', {
    configurable: true,
    get: () => emulatorClass,
    set: Class => {
      emulatorClass = Class;
      const original = Class.prototype.downloadFile;
      Class.prototype.downloadFile = async function(path, progress, withoutPath, options) {
        const key = typeof path === 'string' ? new URL(path, location.origin).href : null;
        const blob = key && window.MGA_verifiedDownloads?.get(key);
        if (!blob) return original.call(this, path, progress, withoutPath, options);
        const headers = { 'content-length': String(blob.size) };
        if (options?.method === 'HEAD') return { headers };
        const data = new Uint8Array(await blob.arrayBuffer());
        window.MGA_verifiedDownloads.delete(key);
        return { headers, data };
      };
    }
  });
})();

(()=>{
  let Manager;
  Object.defineProperty(window, 'EJS_GameManager', {
    configurable: true,
    get: () => Manager,
    set: Class => {
      Manager = Class;
      const original = Class.prototype.getRetroArchCfg;
      Class.prototype.getRetroArchCfg = function() {
        // Configurações críticas para CPUs fracas de Smart TV (Tizen, webOS, Android TV):
        // 1. audio_sync desativado ou tolerante: evita que quedas de FPS travem o core
        // 2. vsync e hard sync desativados
        // 3. rewind e shaders completamente desativados
        // 4. audio_latency maior (512ms) para evitar engasgos no áudio
        const base = original ? original.call(this) : '';
        return base + '\n' +
          'audio_latency = 512\n' +
          'audio_sync = false\n' +
          'audio_rate_control = false\n' +
          'video_vsync = false\n' +
          'video_hard_sync = false\n' +
          'video_frame_delay = 0\n' +
          'video_smooth = false\n' +
          'video_threaded = true\n' +
          'rewind_enable = false\n' +
          'autosave_interval = 0\n';
      };
    }
  });

  const descriptor = Object.getOwnPropertyDescriptor(window, 'EmulatorJS');
  if (descriptor) {
    Object.defineProperty(window, 'EmulatorJS', {
      configurable: true,
      get: descriptor.get,
      set: Class => {
        descriptor.set(Class);
        const original = Class.prototype.preGetSetting;
        Class.prototype.preGetSetting = function(key) {
          const forced = {
            webgl2Enabled: 'disabled',
            vsync: 'disabled',
            rewindEnabled: 'disabled',
            shader: 'disabled',
            ejs_threads: 'disabled',
            audio_latency: '512'
          };
          return Object.prototype.hasOwnProperty.call(forced, key) ? forced[key] : original.call(this, key);
        };
      }
    });
  }

  window.EJS_forceLegacyCores = true;
  window.EJS_threads = false;
  window.EJS_CacheLimit = 0;

  // Desativa qualquer estilo que force processamento de GPU na TV
  const css = document.createElement('style');
  css.textContent = `
    body.mga-tv-mode #game,
    body.mga-tv-mode #game *,
    body.mga-tv-mode #game::before,
    body.mga-tv-mode #game::after {
      filter: none !important;
      backdrop-filter: none !important;
      box-shadow: none !important;
      text-shadow: none !important;
      transform: none !important;
    }
    body.mga-tv-mode #game::before,
    body.mga-tv-mode #game::after {
      display: none !important;
    }
    body.mga-tv-mode #game canvas {
      image-rendering: auto !important;
    }
  `;
  document.head.appendChild(css);
})();
