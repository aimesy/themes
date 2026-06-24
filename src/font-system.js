(function () {
  if (window.AMYCFontSystem) return;

  const root = document.documentElement;
  const fontKey = "amyc-font-system";
  const sizeKey = "amyc-font-size";
  const lineKey = "amyc-font-line";
  const spaceKey = "amyc-font-space";
  const customCssKey = "amyc-custom-css";
  const syncViewersKey = "amyc-sync-viewers";
  const storageEventName = "amyc:display-persistence-change";
  const defaultPrefs = { font: "clerk", size: 1, line: 1, space: 0 };
  let currentPrefs = { ...defaultPrefs };
  const legacyKeys = {
    font: "sfsc-font-system",
    size: "sfsc-font-size",
    line: "sfsc-font-line",
    space: "sfsc-font-space",
  };
  const fonts = ["clerk", "hyper", "open"];
  const names = { clerk: "Clerk", hyper: "Hyper", open: "Open" };
  const notes = { clerk: "Court serif", hyper: "Accessible", open: "Dyslexic" };

  function readStorage(key) {
    try { return window.localStorage.getItem(key); } catch { return ""; }
  }

  function writeStorage(key, value) {
    try { window.localStorage.setItem(key, value); } catch {}
  }

  function viewerId() {
    const configured =
      root.dataset.amycViewer ||
      root.dataset.viewer ||
      document.body?.dataset.amycViewer ||
      document.body?.dataset.viewer ||
      document.querySelector("[data-amyc-viewer]")?.getAttribute("data-amyc-viewer") ||
      document.querySelector("[data-viewer-id]")?.getAttribute("data-viewer-id") ||
      location.pathname ||
      "default";
    const normalized = String(configured).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized || "default";
  }

  function scopedStorageKey(key) {
    return `amyc-viewer:${viewerId()}:${key}`;
  }

  function syncAcrossViewers() {
    return readStorage(syncViewersKey) !== "0";
  }

  function activeStorageKey(key) {
    return syncAcrossViewers() ? key : scopedStorageKey(key);
  }

  function readPref(key) {
    if (syncAcrossViewers()) return readStorage(key);
    const scoped = readStorage(scopedStorageKey(key));
    return scoped == null ? readStorage(key) : scoped;
  }

  function writePref(key, value) {
    writeStorage(activeStorageKey(key), value);
  }

  function updatePersistenceControls() {
    const synced = syncAcrossViewers();
    document.querySelectorAll("[data-amyc-sync-viewers]").forEach((input) => {
      input.checked = synced;
      input.setAttribute("aria-checked", synced ? "true" : "false");
    });
  }

  function persistCurrentPrefs() {
    writePref(fontKey, currentPrefs.font);
    writePref(sizeKey, String(currentPrefs.size));
    writePref(lineKey, String(currentPrefs.line));
    writePref(spaceKey, String(currentPrefs.space));
    writePref(customCssKey, document.getElementById("amyc-custom-css")?.textContent || "");
  }

  function setSyncAcrossViewers(enabled, source = "font") {
    writeStorage(syncViewersKey, enabled ? "1" : "0");
    persistCurrentPrefs();
    updatePersistenceControls();
    window.dispatchEvent(new CustomEvent(storageEventName, {
      detail: { synced: enabled, source },
    }));
  }

  function migrateLegacy() {
    const pairs = [
      [fontKey, legacyKeys.font],
      [sizeKey, legacyKeys.size],
      [lineKey, legacyKeys.line],
      [spaceKey, legacyKeys.space],
    ];
    for (const [next, old] of pairs) {
      if (!readStorage(next) && readStorage(old)) writeStorage(next, readStorage(old));
    }
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function normalizeFont(value) {
    return fonts.includes(value) ? value : defaultPrefs.font;
  }

  function ensureCustomCssStyle() {
    let style = document.getElementById("amyc-custom-css");
    if (!style) {
      style = document.createElement("style");
      style.id = "amyc-custom-css";
      document.head.appendChild(style);
    }
    return style;
  }

  function applyCustomCss(value) {
    const css = value || "";
    ensureCustomCssStyle().textContent = css;
    document.querySelectorAll("[data-amyc-css-status]").forEach((node) => {
      node.textContent = css.trim() ? "Applied" : "Empty";
    });
    document.querySelectorAll("[data-amyc-custom-css]").forEach((input) => {
      if (input.value !== css) input.value = css;
    });
  }

  function readPrefs() {
    return {
      font: normalizeFont(readPref(fontKey)),
      size: clampNumber(readPref(sizeKey), -2, 4, defaultPrefs.size),
      line: clampNumber(readPref(lineKey), 0, 4, defaultPrefs.line),
      space: clampNumber(readPref(spaceKey), 0, 4, defaultPrefs.space),
    };
  }

  function resetFontPrefs() {
    writePref(fontKey, defaultPrefs.font);
    writePref(sizeKey, String(defaultPrefs.size));
    writePref(lineKey, String(defaultPrefs.line));
    writePref(spaceKey, String(defaultPrefs.space));
    applyFontPrefs();
  }

  function snapRangeToMarkers(input) {
    const points = String(input.dataset.snapPoints || "")
      .split(",")
      .map((point) => Number(point.trim()))
      .filter((point) => Number.isFinite(point));
    const threshold = Number(input.dataset.snapThreshold || 0);
    const value = Number(input.value);
    if (!points.length || !Number.isFinite(threshold) || !Number.isFinite(value)) return false;
    let nearest = points[0];
    let distance = Math.abs(value - nearest);
    for (const point of points.slice(1)) {
      const nextDistance = Math.abs(value - point);
      if (nextDistance < distance) {
        nearest = point;
        distance = nextDistance;
      }
    }
    if (distance > threshold) return false;
    input.value = String(nearest);
    return nearest !== value;
  }

  function applyFontPrefs() {
    const prefs = readPrefs();
    currentPrefs = prefs;
    root.dataset.fontSystem = prefs.font;
    root.style.setProperty("--amyc-font-adjust", `${prefs.size * 0.035}rem`);
    root.style.setProperty("--amyc-line-extra", String(prefs.line * 0.045));
    root.style.setProperty("--amyc-letter-extra", `${prefs.space * 0.012}em`);
    root.style.setProperty("--sfsc-font-adjust", `${prefs.size * 0.035}rem`);
    root.style.setProperty("--sfsc-line-extra", String(prefs.line * 0.045));
    root.style.setProperty("--sfsc-letter-extra", `${prefs.space * 0.012}em`);
    document.querySelectorAll("[data-amyc-font-size]").forEach((input) => { input.value = String(prefs.size); });
    document.querySelectorAll("[data-amyc-font-line]").forEach((input) => { input.value = String(prefs.line); });
    document.querySelectorAll("[data-amyc-font-space]").forEach((input) => { input.value = String(prefs.space); });
    document.querySelectorAll("[data-amyc-font-spectrum]").forEach((input) => { input.value = String(fonts.indexOf(prefs.font)); });
    document.querySelectorAll("[data-amyc-font-size-value]").forEach((node) => {
      node.textContent = prefs.size > 0 ? `+${prefs.size}` : String(prefs.size);
    });
    document.querySelectorAll("[data-amyc-font-current]").forEach((node) => { node.textContent = names[prefs.font]; });
    document.querySelectorAll("[data-font-choice]").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.fontChoice === prefs.font ? "true" : "false");
    });
    document.querySelectorAll("[data-font-toggle]").forEach((button) => {
      button.setAttribute("aria-label", `Font settings: ${names[prefs.font]}`);
      button.setAttribute("title", `Font settings: ${names[prefs.font]}`);
    });
    updatePersistenceControls();
  }

  function closePanels(except) {
    document.querySelectorAll(".amyc-display-panel").forEach((panel) => {
      if (panel !== except) panel.hidden = true;
    });
    document.querySelectorAll("[data-font-toggle], [data-custom-css-toggle]").forEach((button) => {
      const controls = button.getAttribute("aria-controls");
      const panel = controls ? document.getElementById(controls) : null;
      button.setAttribute("aria-expanded", panel && !panel.hidden ? "true" : "false");
    });
  }

  function fontPanelHtml(id) {
    return `
      <div class="amyc-display-panel amyc-font-panel" id="${id}" hidden>
        <div class="amyc-display-panel-head">
          <span>Reader Display</span>
          <span data-amyc-font-current></span>
        </div>
        <div class="amyc-font-grid">
          <div class="amyc-font-size">
            <span class="amyc-font-size-label">A+</span>
            <span class="amyc-font-size-wrap amyc-snap-track is-vertical" style="--snap-default: 50%;">
              <span class="amyc-snap amyc-snap-min" aria-hidden="true"></span>
              <span class="amyc-snap amyc-snap-default" aria-hidden="true"></span>
              <span class="amyc-snap amyc-snap-max" aria-hidden="true"></span>
              <input class="amyc-font-size-input" type="range" min="-2" max="4" step="1" data-amyc-font-size data-snap-points="-2,1,4" data-snap-threshold="1" aria-label="Font size">
            </span>
            <span class="amyc-font-size-value" data-amyc-font-size-value></span>
          </div>
          <div class="amyc-font-main">
            <div class="amyc-font-spectrum-row amyc-snap-track" style="--snap-default: ${(fonts.indexOf(defaultPrefs.font) / (fonts.length - 1)) * 100}%;">
              <span class="amyc-snap amyc-snap-min" aria-hidden="true"></span>
              <span class="amyc-snap amyc-snap-default" aria-hidden="true"></span>
              <span class="amyc-snap amyc-snap-max" aria-hidden="true"></span>
              <input class="amyc-font-spectrum" type="range" min="0" max="${fonts.length - 1}" step="1" data-amyc-font-spectrum data-snap-points="0,${fonts.indexOf(defaultPrefs.font)},${fonts.length - 1}" aria-label="Font spectrum">
            </div>
            <div class="amyc-font-options">
              ${fonts.map((font) => `
                <button type="button" class="amyc-font-choice" data-font-choice="${font}" aria-pressed="false">
                  <b>${names[font]}</b><span>${notes[font]}</span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
        <div class="amyc-font-sliders">
          <label class="amyc-font-slider"><span>Line</span><span class="amyc-inline-snap-track amyc-snap-track" style="--snap-default: 25%;"><span class="amyc-snap amyc-snap-min" aria-hidden="true"></span><span class="amyc-snap amyc-snap-default" aria-hidden="true"></span><span class="amyc-snap amyc-snap-max" aria-hidden="true"></span><input class="amyc-font-adjust" type="range" min="0" max="4" step="1" data-amyc-font-line data-snap-points="0,1,4" data-snap-threshold="1"></span></label>
          <label class="amyc-font-slider"><span>Space</span><span class="amyc-inline-snap-track amyc-snap-track" style="--snap-default: 0%;"><span class="amyc-snap amyc-snap-min" aria-hidden="true"></span><span class="amyc-snap amyc-snap-default" aria-hidden="true"></span><span class="amyc-snap amyc-snap-max" aria-hidden="true"></span><input class="amyc-font-adjust" type="range" min="0" max="4" step="1" data-amyc-font-space data-snap-points="0,4" data-snap-threshold="1"></span></label>
        </div>
        <div class="amyc-font-actions">
          <button class="hbtn" type="button" data-amyc-font-reset>Reset font</button>
          <label class="theme-persistence-toggle">
            <input type="checkbox" data-amyc-sync-viewers>
            <span>Sync viewers</span>
          </label>
        </div>
      </div>
    `;
  }

  function cssPanelHtml(id) {
    return `
      <div class="amyc-display-panel amyc-custom-css-panel" id="${id}" hidden>
        <div class="amyc-display-panel-head">
          <span>Custom CSS</span>
          <span data-amyc-css-status></span>
        </div>
        <textarea data-amyc-custom-css spellcheck="false" aria-label="Custom CSS"></textarea>
        <div class="amyc-custom-css-actions">
          <button class="hbtn" type="button" data-amyc-css-apply>Apply CSS</button>
          <button class="hbtn" type="button" data-amyc-css-reset>Reset CSS</button>
        </div>
      </div>
    `;
  }

  function installDisplayControls(strip, index) {
    const theme = strip.querySelector("[data-theme-toggle]");
    if (!theme || strip.querySelector("[data-font-toggle]")) return;
    const fontId = `amyc-font-panel-${index}`;
    const cssId = `amyc-css-panel-${index}`;
    const fontButton = document.createElement("button");
    fontButton.className = "font-toggle";
    fontButton.type = "button";
    fontButton.textContent = "Aa";
    fontButton.dataset.fontToggle = "";
    fontButton.setAttribute("aria-expanded", "false");
    fontButton.setAttribute("aria-controls", fontId);
    const cssButton = document.createElement("button");
    cssButton.className = "custom-css-toggle";
    cssButton.type = "button";
    cssButton.textContent = "</>";
    cssButton.dataset.customCssToggle = "";
    cssButton.setAttribute("aria-label", "Custom CSS");
    cssButton.setAttribute("title", "Custom CSS");
    cssButton.setAttribute("aria-expanded", "false");
    cssButton.setAttribute("aria-controls", cssId);
    theme.insertAdjacentElement("afterend", fontButton);
    fontButton.insertAdjacentElement("afterend", cssButton);
    strip.insertAdjacentHTML("beforeend", fontPanelHtml(fontId) + cssPanelHtml(cssId));
  }

  function findDisplayHosts() {
    const hosts = [];
    document.querySelectorAll("[data-display-controls], .display-controls, .status-strip, .cs-status-strip").forEach((host) => {
      if (!hosts.includes(host)) hosts.push(host);
    });
    return hosts;
  }

  function bindDisplayControls() {
    findDisplayHosts().forEach(installDisplayControls);
    applyFontPrefs();
    applyCustomCss(readPref(customCssKey) || "");
  }

  function bindEvents() {
    function storeFontInput(target) {
      if (target.matches("[data-amyc-font-spectrum]")) {
        writePref(fontKey, fonts[Number(target.value)] || defaultPrefs.font);
      } else if (target.matches("[data-amyc-font-size]")) {
        writePref(sizeKey, target.value);
      } else if (target.matches("[data-amyc-font-line]")) {
        writePref(lineKey, target.value);
      } else if (target.matches("[data-amyc-font-space]")) {
        writePref(spaceKey, target.value);
      } else {
        return false;
      }
      applyFontPrefs();
      return true;
    }

    document.addEventListener("click", (event) => {
      const fontToggle = event.target.closest("[data-font-toggle]");
      const cssToggle = event.target.closest("[data-custom-css-toggle]");
      if (fontToggle || cssToggle) {
        const button = fontToggle || cssToggle;
        const panel = document.getElementById(button.getAttribute("aria-controls") || "");
        if (!panel) return;
        const opening = panel.hidden;
        closePanels(opening ? panel : null);
        panel.hidden = !opening;
        button.setAttribute("aria-expanded", opening ? "true" : "false");
        if (opening) {
          const firstField = panel.querySelector("input[type=\"range\"], textarea");
          if (firstField) firstField.focus();
        }
        return;
      }
      if (event.target.closest(".amyc-display-panel")) return;
      closePanels();
    });

    document.addEventListener("input", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      storeFontInput(target);
    });

    document.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (target.matches("[data-amyc-sync-viewers]")) {
        setSyncAcrossViewers(target.checked, "font");
        return;
      }
      if (snapRangeToMarkers(target)) {
        storeFontInput(target);
      }
    });

    document.addEventListener("click", (event) => {
      const choice = event.target.closest("[data-font-choice]");
      if (choice) {
        writePref(fontKey, choice.dataset.fontChoice || defaultPrefs.font);
        applyFontPrefs();
        return;
      }
      if (event.target.closest("[data-amyc-font-reset]")) {
        resetFontPrefs();
        return;
      }
      if (event.target.closest("[data-amyc-css-apply]")) {
        const panel = event.target.closest(".amyc-custom-css-panel");
        const input = panel?.querySelector("[data-amyc-custom-css]");
        const value = input ? input.value : "";
        writePref(customCssKey, value);
        applyCustomCss(value);
        return;
      }
      if (event.target.closest("[data-amyc-css-reset]")) {
        writePref(customCssKey, "");
        applyCustomCss("");
      }
    });

    window.addEventListener(storageEventName, (event) => {
      if (event.detail?.source === "font") return;
      persistCurrentPrefs();
      updatePersistenceControls();
    });
  }

  function init() {
    migrateLegacy();
    if (!readPref(fontKey)) writePref(fontKey, defaultPrefs.font);
    if (!readPref(sizeKey)) writePref(sizeKey, String(defaultPrefs.size));
    if (!readPref(lineKey)) writePref(lineKey, String(defaultPrefs.line));
    if (!readPref(spaceKey)) writePref(spaceKey, String(defaultPrefs.space));
    applyFontPrefs();
    applyCustomCss(readPref(customCssKey) || "");
    bindEvents();
    bindDisplayControls();
  }

  window.AMYCFontSystem = { applyFontPrefs, applyCustomCss, bindDisplayControls };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
