(() => {
  if (window.AmycBugReport?.loaded) return;

  const root = document.documentElement;
  const runtime = {
    loaded: true,
    errors: [],
    active: null,
    lastInteraction: null,
  };
  const syncViewersKey = "amyc-sync-viewers";
  window.AmycBugReport = runtime;

  const autoContextDataKeys = new Set([
    "barNumber",
    "case",
    "caseNumber",
    "caseTitle",
    "courtDate",
    "department",
    "departmentName",
    "docKey",
    "documentKey",
    "documentId",
    "docketId",
    "docketNumber",
    "entityId",
    "entityKey",
    "entityKind",
    "attorneyId",
    "attorneyName",
    "firmId",
    "firmName",
    "filingId",
    "hearingDate",
    "itemId",
    "itemKey",
    "judgeId",
    "judgeName",
    "litigantId",
    "litigantName",
    "matterId",
    "matterKey",
    "orderId",
    "packetId",
    "packetKey",
    "partyName",
    "personName",
    "prefix",
    "profileCaseRow",
    "recordId",
    "recordKey",
    "recordKind",
    "recordTitle",
    "recordType",
    "rowHash",
    "rulingId",
    "sha256",
    "sourceId",
    "status",
    "xref",
    "year",
  ]);

  const autoContextAttrs = [
    "data-bug-report-context",
    "data-bar-number",
    "data-case",
    "data-case-number",
    "data-doc-key",
    "data-document-id",
    "data-document-key",
    "data-docket-id",
    "data-docket-number",
    "data-attorney-id",
    "data-entity-id",
    "data-entity-key",
    "data-filing-id",
    "data-firm-id",
    "data-item-id",
    "data-item-key",
    "data-judge-id",
    "data-litigant-id",
    "data-matter-id",
    "data-matter-key",
    "data-order-id",
    "data-packet-id",
    "data-packet-key",
    "data-profile-case-row",
    "data-record-id",
    "data-record-key",
    "data-record-kind",
    "data-row-hash",
    "data-ruling-id",
    "data-sha256",
    "data-source-id",
    "data-xref",
  ];

  const autoContextSelector = autoContextAttrs.map((attr) => `[${attr}]`).join(",");
  const recordContainerSelector = [
    "article",
    "li",
    "tr",
    "[role='article']",
    "[role='listitem']",
    "[role='row']",
    ".record",
    ".row",
    ".card",
  ].join(",");

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function clip(value, limit = 180) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
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

  function readPref(key) {
    if (syncAcrossViewers()) return readStorage(key);
    const scoped = readStorage(scopedStorageKey(key));
    return scoped == null ? readStorage(key) : scoped;
  }

  function allStorageKeys() {
    try {
      return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index)).filter(Boolean);
    } catch {
      return [];
    }
  }

  function publicStorageSnapshot() {
    const keys = allStorageKeys().sort();
    const values = {};
    for (const key of keys) {
      if (!/^(amyc|sfsc|tentatives|cividx)[.:_-]/i.test(key) && !/^amyc-/i.test(key)) continue;
      if (/token|secret|password|credential|key/i.test(key)) {
        values[key] = "[redacted key]";
      } else if (/(^|:)amyc-custom-css$/i.test(key)) {
        values[key] = readStorage(key)?.trim() ? "[present]" : "";
      } else {
        values[key] = clip(readStorage(key), 500);
      }
    }
    return { keys, values };
  }

  function trackError(entry) {
    runtime.errors.push({
      time: new Date().toISOString(),
      ...entry,
    });
    runtime.errors = runtime.errors.slice(-20);
  }

  window.addEventListener("error", (event) => {
    trackError({
      type: "error",
      message: event.message || "",
      source: event.filename || "",
      line: event.lineno || null,
      column: event.colno || null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    trackError({
      type: "unhandledrejection",
      message: clip(event.reason?.message || event.reason || "Unhandled rejection", 600),
      stack: clip(event.reason?.stack || "", 1000),
    });
  });

  function configFrom(button) {
    const globalConfig = window.AMYC_BUG_REPORT || {};
    return {
      app: button.dataset.bugReportApp || globalConfig.app || document.querySelector("meta[name='application-name']")?.content || document.title || "AMYC app",
      repo: button.dataset.bugReportRepo || globalConfig.repo || "",
      endpoint: button.dataset.bugReportEndpoint || globalConfig.endpoint || "",
      labels: button.dataset.bugReportLabels || globalConfig.labels || "bug,site-report",
      mailto: button.dataset.bugReportMailto || globalConfig.mailto || "me@amyc.us",
      context: globalConfig.context || null,
    };
  }

  function sanitizedContextValue(value, key = "", depth = 0, seen = new WeakSet()) {
    if (/token|secret|password|credential|authorization|cookie|session/i.test(key)) return "[redacted]";
    if (value == null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return clip(value, 1000);
    if (typeof value === "bigint") return String(value);
    if (typeof value === "function" || typeof value === "symbol") return undefined;
    if (depth >= 6) return "[depth limit]";
    if (typeof value !== "object") return clip(value, 1000);
    if (seen.has(value)) return "[circular]";
    seen.add(value);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString();
    if (value instanceof Element) return {
      selector: selectorFor(value),
      label: elementLabel(value),
    };
    if (Array.isArray(value)) {
      return value.slice(0, 50)
        .map((item) => sanitizedContextValue(item, "", depth + 1, seen))
        .filter((item) => item !== undefined);
    }
    const out = {};
    Object.entries(value).slice(0, 80).forEach(([childKey, childValue]) => {
      const sanitized = sanitizedContextValue(childValue, childKey, depth + 1, seen);
      if (sanitized !== undefined) out[childKey] = sanitized;
    });
    return out;
  }

  function captureConfiguredContext(active) {
    if (!active.config.context) return null;
    try {
      return typeof active.config.context === "function"
        ? active.config.context({ sourceButton: active.sourceButton })
        : active.config.context;
    } catch (error) {
      return { captureError: clip(error?.message || error || "Context provider failed", 500) };
    }
  }

  function mergeContextObjects(base, override) {
    const out = {};
    if (base && typeof base === "object" && !Array.isArray(base)) Object.assign(out, base);
    if (override && typeof override === "object" && !Array.isArray(override)) {
      Object.assign(out, override);
    } else if (override != null) {
      out.appContext = override;
    }
    return out;
  }

  function captureContext(active) {
    const automatic = automaticContext(active);
    const configured = captureConfiguredContext(active);
    const merged = mergeContextObjects(automatic, configured);
    if (!Object.keys(merged).length) return null;
    return sanitizedContextValue(merged);
  }

  function safeSelectorUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  function attrSelector(el) {
    const attrs = ["data-testid", "data-test", "data-view", "data-panel", "data-cs-tab", "aria-label", "name", "type"];
    for (const attr of attrs) {
      const value = el.getAttribute(attr);
      if (!value || value.length > 80) continue;
      const selector = `${el.tagName.toLowerCase()}[${attr}="${String(value).replace(/"/g, '\\"')}"]`;
      if (safeSelectorUnique(selector)) return selector;
    }
    return "";
  }

  function selectorFor(el) {
    if (!(el instanceof Element)) return "";
    if (el.id) {
      const selector = `#${cssEscape(el.id)}`;
      if (safeSelectorUnique(selector)) return selector;
    }
    const attr = attrSelector(el);
    if (attr) return attr;

    const parts = [];
    let current = el;
    while (current && current.nodeType === 1 && current !== document.documentElement) {
      let part = current.tagName.toLowerCase();
      const classNames = Array.from(current.classList || [])
        .filter((name) => !/^bug-report/.test(name))
        .slice(0, 2);
      if (classNames.length) part += `.${classNames.map(cssEscape).join(".")}`;
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children).filter((sibling) => sibling.tagName === current.tagName);
        if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
      parts.unshift(part);
      const selector = parts.join(" > ");
      if (safeSelectorUnique(selector)) return selector;
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function elementLabel(el) {
    const role = el.getAttribute("role");
    const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt") || "";
    const id = el.id ? `#${el.id}` : "";
    const classes = Array.from(el.classList || [])
      .filter((name) => !/^bug-report/.test(name))
      .slice(0, 2)
      .map((name) => `.${name}`)
      .join("");
    const text = clip(el.innerText || el.textContent || "", 90);
    return clip([el.tagName.toLowerCase() + id + classes, role ? `role=${role}` : "", label, text].filter(Boolean).join(" | "), 180);
  }

  function inlineContextDataset(el) {
    const raw = el.getAttribute("data-bug-report-context");
    if (!raw || raw === "true") return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return sanitizedContextValue(parsed) || {};
      }
    } catch {
      // Plain string markers are still useful when an app cannot emit JSON.
    }
    return { bugReportContext: clip(raw, 500) };
  }

  function contextDataset(el) {
    if (!(el instanceof Element)) return {};
    const data = inlineContextDataset(el);
    Object.entries(el.dataset || {}).forEach(([key, value]) => {
      if (!value || !autoContextDataKeys.has(key)) return;
      data[key] = clip(value, 500);
    });
    return sanitizedContextValue(data) || {};
  }

  function hasAutoContext(el) {
    return el instanceof Element
      && autoContextAttrs.some((attr) => el.hasAttribute(attr));
  }

  function visibleElement(el) {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
  }

  function hrefFor(el) {
    if (!(el instanceof Element)) return "";
    const link = el.matches("a[href]") ? el : el.querySelector("a[href]");
    return link?.href || "";
  }

  function elementContext(el, { includeRect = false, allowPlain = false } = {}) {
    if (!(el instanceof Element)) return null;
    const data = contextDataset(el);
    if (!allowPlain && !Object.keys(data).length && !el.hasAttribute("data-bug-report-context")) return null;
    const rect = el.getBoundingClientRect();
    const context = {
      selector: selectorFor(el),
      label: elementLabel(el),
      text: clip(el.innerText || el.textContent || "", 500),
    };
    if (Object.keys(data).length) context.data = data;
    const role = el.getAttribute("role");
    const aria = el.getAttribute("aria-label");
    const title = el.getAttribute("title");
    const href = hrefFor(el);
    if (role) context.role = clip(role, 80);
    if (aria) context.ariaLabel = clip(aria, 180);
    if (title) context.title = clip(title, 180);
    if (href) context.href = href;
    if (includeRect) {
      context.rect = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }
    return context;
  }

  function closestContextElement(target) {
    if (!(target instanceof Element) || reporterOwns(target)) return null;
    let fallback = null;
    let current = target;
    let depth = 0;
    while (current && current !== document.documentElement && depth < 10) {
      if (reporterOwns(current)) return null;
      if (hasAutoContext(current)) return current;
      if (!fallback && current.matches?.(recordContainerSelector)) fallback = current;
      current = current.parentElement;
      depth += 1;
    }
    if (fallback?.querySelector?.(autoContextSelector)) return fallback;
    return null;
  }

  function rememberInteraction(target, eventType) {
    const element = closestContextElement(target);
    if (!element) return;
    runtime.lastInteraction = {
      eventType,
      capturedAt: new Date().toISOString(),
      page: {
        url: location.href,
        pathname: location.pathname,
        hash: location.hash,
      },
      ...elementContext(element, { includeRect: true, allowPlain: true }),
    };
  }

  function sectionLabel(el) {
    return el.getAttribute("data-bug-report-section")
      || el.getAttribute("data-view-title")
      || el.getAttribute("aria-label")
      || el.getAttribute("title")
      || el.innerText
      || el.textContent
      || "";
  }

  function visibleSection() {
    const selectors = [
      "[data-bug-report-section]",
      "[data-view-title]",
      "[aria-current='page']",
      "h1",
      "h2",
      "h3",
    ].join(",");
    const headings = Array.from(document.querySelectorAll(selectors))
      .filter((el) => !reporterOwns(el) && visibleElement(el))
      .map((el) => ({ el, rect: el.getBoundingClientRect() }))
      .sort((a, b) => Math.abs(a.rect.top - 140) - Math.abs(b.rect.top - 140));
    return headings.length ? clip(sectionLabel(headings[0].el), 220) : "";
  }

  function visibleRecords(limit = 8) {
    const seen = new Set();
    return Array.from(document.querySelectorAll(autoContextSelector))
      .filter((el) => !reporterOwns(el) && visibleElement(el))
      .map((el) => elementContext(el, { includeRect: true }))
      .filter((context) => {
        if (!context) return false;
        const key = JSON.stringify([context.data || {}, context.href || "", context.text || ""]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  function automaticContext(active) {
    const context = {
      route: {
        url: location.href,
        pathname: location.pathname,
        hash: location.hash,
        visibleSection: visibleSection(),
      },
    };
    const activeElement = closestContextElement(document.activeElement);
    if (activeElement) context.activeElement = elementContext(activeElement, { includeRect: true, allowPlain: true });
    if (runtime.lastInteraction?.page?.url === location.href) {
      context.lastInteraction = runtime.lastInteraction;
    }
    const annotatedRecords = (active.annotations || [])
      .map((annotation) => annotation.context)
      .filter(Boolean);
    if (annotatedRecords.length) context.annotatedRecords = annotatedRecords;
    const records = visibleRecords();
    if (records.length) context.visibleRecords = records;
    Object.keys(context.route).forEach((key) => {
      if (!context.route[key]) delete context.route[key];
    });
    if (!Object.keys(context.route).length) delete context.route;
    return context;
  }

  function assetList(selector, attr) {
    return Array.from(document.querySelectorAll(selector))
      .map((el) => el.getAttribute(attr))
      .filter(Boolean)
      .slice(0, 30);
  }

  function captureState(active) {
    const storage = publicStorageSnapshot();
    return {
      app: active.config.app,
      createdAt: new Date().toISOString(),
      description: active.textarea.value.trim(),
      context: captureContext(active),
      page: {
        title: document.title,
        url: location.href,
        origin: location.origin,
        pathname: location.pathname,
        hash: location.hash,
        referrer: document.referrer || "",
        visibilityState: document.visibilityState,
        historyLength: history.length,
      },
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: Array.from(navigator.languages || []),
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        online: navigator.onLine,
        devicePixelRatio: window.devicePixelRatio,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: {
          width: window.screen?.width,
          height: window.screen?.height,
          availWidth: window.screen?.availWidth,
          availHeight: window.screen?.availHeight,
        },
      },
      scroll: { x: window.scrollX, y: window.scrollY },
      theme: {
        theme: root.dataset.theme || "",
        tone: root.dataset.themeTone || "",
        storedTheme: readPref("amyc-theme") || "",
        lightness: readPref("amyc-lightness") || "",
        customCss: !!readPref("amyc-custom-css")?.trim(),
        syncViewers: syncAcrossViewers(),
        viewerId: viewerId(),
      },
      storage,
      assets: {
        stylesheets: assetList('link[rel~="stylesheet"]', "href"),
        scripts: assetList("script[src]", "src"),
      },
      annotations: active.annotations.map((annotation) => ({ ...annotation })),
      errors: runtime.errors.slice(),
    };
  }

  function reportText(report, includeJson = true) {
    const annotationLines = report.annotations.length
      ? report.annotations.map((annotation) => {
        const note = annotation.note ? `\n   Note: ${annotation.note}` : "";
        return `${annotation.index}. \`${annotation.selector}\`\n   ${annotation.label}${note}`;
      }).join("\n")
      : "No page elements selected.";
    const themeBits = [report.theme.theme, report.theme.tone, report.theme.lightness ? `lightness ${report.theme.lightness}` : ""].filter(Boolean).join(", ") || "not captured";
    const contextJson = report.context && typeof report.context === "object" && Object.keys(report.context).length
      ? JSON.stringify(report.context, null, 2)
      : "";
    const base = [
      "### What happened",
      report.description || "[No description provided. See the automatically captured record context below.]",
      "",
      "### Page",
      `- URL: ${report.page.url}`,
      `- Title: ${report.page.title}`,
      `- Theme: ${themeBits}`,
      `- Viewport: ${report.browser.viewport.width} x ${report.browser.viewport.height} @ ${report.browser.devicePixelRatio}`,
      "",
      "### Record context",
      contextJson ? `\`\`\`json\n${contextJson}\n\`\`\`` : "No record context captured.",
      "",
      "### Annotated elements",
      annotationLines,
    ].join("\n");
    if (!includeJson) return base;
    return `${base}\n\n<details>\n<summary>Captured browser state</summary>\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n</details>\n`;
  }

  function contextIssueTitle(context) {
    if (!context || typeof context !== "object") return "";
    const record = context.activeRecord;
    if (record && typeof record === "object") {
      const kind = String(record.kind || "record").replaceAll("_", " ");
      const label = record.displayName || record.name || record.title || record.caseNumber || record.id || record.key;
      if (label) return `${kind}: ${label}`;
    }
    const inferred = [
      context.lastInteraction,
      context.activeElement,
      ...(Array.isArray(context.annotatedRecords) ? context.annotatedRecords : []),
      ...(Array.isArray(context.visibleRecords) ? context.visibleRecords : []),
    ].find((item) => item && typeof item === "object");
    if (inferred) {
      const data = inferred.data && typeof inferred.data === "object" ? inferred.data : {};
      const kind = String(data.recordKind || data.entityKind || data.recordType || "record").replaceAll("_", " ");
      const label =
        data.recordTitle ||
        data.caseTitle ||
        data.caseNumber ||
        data.recordId ||
        data.recordKey ||
        data.entityKey ||
        data.entityId ||
        data.barNumber ||
        data.rowHash ||
        data.documentKey ||
        data.docKey ||
        data.sha256 ||
        data.attorneyName ||
        data.firmName ||
        data.judgeName ||
        data.litigantName ||
        data.partyName ||
        data.personName ||
        inferred.title ||
        inferred.ariaLabel ||
        inferred.text;
      if (label) return `${kind}: ${label}`;
    }
    return "";
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function downloadJson(report) {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `bug-report-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function openGitHubIssue(config, report, fullBody) {
    const title = `[${config.app}] ${clip(report.description || contextIssueTitle(report.context) || "Bug report", 70)}`;
    const labels = config.labels || "bug";
    const params = new URLSearchParams({ title, body: fullBody, labels });
    const url = `https://github.com/${config.repo}/issues/new?${params.toString()}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function setStatus(active, message) {
    active.status.textContent = message;
  }

  function updatePreview(active) {
    const report = captureState(active);
    active.preview.textContent = JSON.stringify(report, null, 2);
  }

  function renderMarkers(active) {
    for (const marker of active.markers) marker.remove();
    active.markers = [];
    for (const annotation of active.annotations) {
      const marker = document.createElement("div");
      marker.className = "bug-report-marker";
      marker.textContent = annotation.index;
      marker.style.left = `${annotation.rect.x}px`;
      marker.style.top = `${annotation.rect.y}px`;
      document.body.appendChild(marker);
      active.markers.push(marker);
    }
  }

  function renderAnnotations(active) {
    active.list.replaceChildren();
    if (!active.annotations.length) {
      const empty = document.createElement("div");
      empty.className = "bug-report-empty";
      empty.textContent = "No elements selected yet.";
      active.list.appendChild(empty);
      renderMarkers(active);
      updatePreview(active);
      return;
    }
    for (const annotation of active.annotations) {
      const row = document.createElement("div");
      row.className = "bug-report-annotation";
      const index = document.createElement("span");
      index.className = "bug-report-index";
      index.textContent = annotation.index;
      const main = document.createElement("div");
      main.className = "bug-report-ann-main";
      const label = document.createElement("div");
      label.className = "bug-report-ann-label";
      label.textContent = annotation.label;
      const selector = document.createElement("div");
      selector.className = "bug-report-ann-selector";
      selector.textContent = annotation.selector;
      const note = document.createElement("input");
      note.className = "bug-report-note";
      note.type = "text";
      note.placeholder = "annotation note";
      note.value = annotation.note || "";
      note.addEventListener("input", () => {
        annotation.note = note.value;
        updatePreview(active);
      });
      main.append(label, selector, note);
      row.append(index, main);
      active.list.appendChild(row);
    }
    renderMarkers(active);
    updatePreview(active);
  }

  function removeHover(active) {
    if (active.hover) {
      active.hover.remove();
      active.hover = null;
    }
  }

  function updateHover(active, el) {
    if (!active.hover) {
      active.hover = document.createElement("div");
      active.hover.className = "bug-report-hover";
      document.body.appendChild(active.hover);
    }
    const rect = el.getBoundingClientRect();
    active.hover.style.left = `${rect.left}px`;
    active.hover.style.top = `${rect.top}px`;
    active.hover.style.width = `${Math.max(0, rect.width)}px`;
    active.hover.style.height = `${Math.max(0, rect.height)}px`;
  }

  function reporterOwns(target) {
    return !!target.closest?.(".bug-report-shell, .bug-report-hover, .bug-report-marker, [data-bug-report]");
  }

  document.addEventListener("pointerdown", (event) => rememberInteraction(event.target, "pointerdown"), true);
  document.addEventListener("focusin", (event) => rememberInteraction(event.target, "focusin"), true);

  function cancelPicking(active) {
    if (!active.picking) return;
    active.picking = false;
    active.pickButton.setAttribute("aria-pressed", "false");
    active.shell.classList.remove("is-picking");
    document.body.classList.remove("bug-report-picking");
    document.removeEventListener("mouseover", active.pickOver, true);
    document.removeEventListener("click", active.pickClick, true);
    document.removeEventListener("keydown", active.pickKey, true);
    removeHover(active);
    setStatus(active, "Element selection off.");
  }

  function addAnnotation(active, el) {
    const rect = el.getBoundingClientRect();
    const contextEl = closestContextElement(el) || el;
    active.annotations.push({
      index: active.annotations.length + 1,
      selector: selectorFor(el),
      label: elementLabel(el),
      text: clip(el.innerText || el.textContent || "", 220),
      context: sanitizedContextValue(elementContext(contextEl, { includeRect: true, allowPlain: true })),
      rect: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
      note: "",
    });
    renderAnnotations(active);
  }

  function startPicking(active) {
    if (active.picking) {
      cancelPicking(active);
      return;
    }
    active.picking = true;
    active.pickButton.setAttribute("aria-pressed", "true");
    active.shell.classList.add("is-picking");
    document.body.classList.add("bug-report-picking");
    setStatus(active, "Click any page element to attach it. Press Escape to cancel.");

    active.pickOver = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || reporterOwns(target)) return;
      updateHover(active, target);
    };
    active.pickClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || reporterOwns(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      addAnnotation(active, target);
      cancelPicking(active);
      setStatus(active, "Element attached.");
    };
    active.pickKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelPicking(active);
      }
    };
    document.addEventListener("mouseover", active.pickOver, true);
    document.addEventListener("click", active.pickClick, true);
    document.addEventListener("keydown", active.pickKey, true);
  }

  function closeReporter(active) {
    cancelPicking(active);
    for (const marker of active.markers || []) marker.remove();
    removeHover(active);
    active.shell.remove();
    runtime.active = null;
    active.sourceButton?.focus?.();
  }

  async function sendReport(active) {
    const report = captureState(active);
    const hasContext = report.context && typeof report.context === "object" && Object.keys(report.context).length;
    if (!report.description && !hasContext && !report.annotations.length) {
      setStatus(active, "Add a short description first.");
      active.textarea.focus();
      return;
    }

    if (active.config.endpoint) {
      try {
        const response = await fetch(active.config.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(report),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setStatus(active, "Report sent.");
        return;
      } catch (error) {
        setStatus(active, `Endpoint failed: ${error.message || error}.`);
      }
    }

    if (active.config.repo) {
      const full = reportText(report, true);
      if (full.length < 6400) {
        openGitHubIssue(active.config, report, full);
        setStatus(active, "Opened a GitHub issue draft.");
      } else {
        let copied = false;
        try {
          await copyText(JSON.stringify(report, null, 2));
          copied = true;
        } catch {
          copied = false;
        }
        const note = copied
          ? "Full JSON report was copied to the clipboard because it was too long for the issue URL."
          : "Full JSON report was too long for the issue URL and could not be copied automatically.";
        openGitHubIssue(active.config, report, `${reportText(report, false)}\n\n${note}`);
        setStatus(active, copied ? "Copied full JSON and opened a GitHub issue draft." : "Opened a GitHub issue draft; full JSON copy failed.");
      }
      return;
    }

    const body = reportText(report, false);
    if (active.config.mailto) {
      const subject = encodeURIComponent(`[${active.config.app}] Bug report`);
      const mailBody = encodeURIComponent(body);
      window.location.href = `mailto:${encodeURIComponent(active.config.mailto)}?subject=${subject}&body=${mailBody}`;
      setStatus(active, "Opened your email client.");
      return;
    }

    await copyText(JSON.stringify(report, null, 2));
    setStatus(active, "Copied report JSON.");
  }

  function button(text, className = "") {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `bug-report-action${className ? ` ${className}` : ""}`;
    el.textContent = text;
    return el;
  }

  function buildReporter(sourceButton) {
    const config = configFrom(sourceButton);
    const shell = document.createElement("div");
    shell.className = "bug-report-shell";
    const backdrop = document.createElement("div");
    backdrop.className = "bug-report-backdrop";
    const modal = document.createElement("section");
    modal.className = "bug-report-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "bug-report-title");

    const head = document.createElement("div");
    head.className = "bug-report-head";
    const title = document.createElement("strong");
    title.id = "bug-report-title";
    title.textContent = "Report a Bug";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "bug-report-close";
    close.setAttribute("aria-label", "Close bug report");
    close.textContent = "x";
    head.append(title, close);

    const body = document.createElement("div");
    body.className = "bug-report-body";
    const field = document.createElement("label");
    field.className = "bug-report-field";
    const label = document.createElement("span");
    label.className = "bug-report-label";
    label.textContent = "What happened?";
    const textarea = document.createElement("textarea");
    textarea.className = "bug-report-textarea";
    textarea.placeholder = "Describe the bug, what you expected, and what you were doing.";
    field.append(label, textarea);

    const hint = document.createElement("div");
    hint.className = "bug-report-hint";
    hint.innerHTML = "Use <kbd>Select element</kbd> to attach page elements. The report includes browser state, route, record context when available, theme, viewport, and recent runtime errors.";

    const list = document.createElement("div");
    list.className = "bug-report-annotations";

    const previewBox = document.createElement("details");
    previewBox.className = "bug-report-preview";
    const summary = document.createElement("summary");
    summary.textContent = "Captured state";
    const preview = document.createElement("pre");
    previewBox.append(summary, preview);
    body.append(field, hint, list, previewBox);

    const actions = document.createElement("div");
    actions.className = "bug-report-actions";
    const pickButton = button("Select Element");
    pickButton.setAttribute("aria-pressed", "false");
    const clearButton = button("Clear");
    const copyButton = button("Copy");
    const downloadButton = button("Download");
    const sendButton = button("Send", "primary");
    const status = document.createElement("span");
    status.className = "bug-report-status";
    status.setAttribute("aria-live", "polite");
    status.textContent = config.repo ? `Will draft an issue in ${config.repo}.` : "Will copy or email the report.";
    actions.append(pickButton, clearButton, copyButton, downloadButton, sendButton, status);

    modal.append(head, body, actions);
    shell.append(backdrop, modal);
    document.body.appendChild(shell);

    const active = {
      sourceButton,
      config,
      shell,
      modal,
      textarea,
      list,
      preview,
      status,
      pickButton,
      annotations: [],
      markers: [],
      picking: false,
      hover: null,
      pickOver: null,
      pickClick: null,
      pickKey: null,
    };

    close.addEventListener("click", () => closeReporter(active));
    backdrop.addEventListener("click", () => closeReporter(active));
    shell.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeReporter(active);
    });
    textarea.addEventListener("input", () => updatePreview(active));
    pickButton.addEventListener("click", () => startPicking(active));
    clearButton.addEventListener("click", () => {
      active.annotations = [];
      renderAnnotations(active);
      setStatus(active, "Annotations cleared.");
    });
    copyButton.addEventListener("click", async () => {
      await copyText(JSON.stringify(captureState(active), null, 2));
      setStatus(active, "Copied report JSON.");
    });
    downloadButton.addEventListener("click", () => {
      downloadJson(captureState(active));
      setStatus(active, "Downloaded report JSON.");
    });
    sendButton.addEventListener("click", () => {
      sendReport(active);
    });

    runtime.active = active;
    renderAnnotations(active);
    textarea.focus();
  }

  function wireButton(button) {
    if (button.dataset.bugReportReady === "true") return;
    button.dataset.bugReportReady = "true";
    if (!button.getAttribute("type")) button.setAttribute("type", "button");
    if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", "Report a bug");
    if (!button.getAttribute("title")) button.setAttribute("title", "Report a bug");
    button.addEventListener("click", () => {
      if (runtime.active) closeReporter(runtime.active);
      buildReporter(button);
    });
  }

  ready(() => {
    document.querySelectorAll("[data-bug-report]").forEach(wireButton);
  });
})();
