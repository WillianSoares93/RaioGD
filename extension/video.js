// Botão "Baixar este vídeo" sobre os <video> da página, com painel de qualidades (vídeo) e formatos de áudio.
// Quem analisa e baixa é o Raio (via background.js). Este script só desenha a interface.
(() => {
  "use strict";
  if (globalThis.__pydmVideoLoaded) return;
  globalThis.__pydmVideoLoaded = true;

  const MIN_W = 240, MIN_H = 135;   // vídeos menores (miniaturas, anúncios) são ignorados
  const HIDE_MS = 1000;

  let host = null, root = null, btn = null, panel = null;
  let current = null;               // <video> sobre o qual o botão está
  let panelOpen = false, busy = false, token = 0;
  let hideTimer = 0, posTimer = 0, lastMove = 0;
  let cfgCache = { t: 0, on: false };

  // ---------- utilidades ----------
  function fmtSize(n) {
    if (!n || n <= 0) return "";
    const u = ["B", "KB", "MB", "GB"];
    let i = 0, v = n;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return "~" + (i >= 2 ? v.toFixed(1) : Math.round(v)) + " " + u[i];
  }

  // No YouTube só as páginas de vídeo; a página inicial tem prévias que não são vídeos baixáveis.
  function pageSupported(loc) {
    if (/(^|\.)youtube\.com$/i.test(loc.hostname)) return /^\/(watch|shorts|embed|live)(\/|$)/.test(loc.pathname);
    return true;
  }

  // Endereços http(s) do próprio <video> (blob: não dá para baixar direto).
  function directSources(v, base) {
    const out = new Set();
    const add = (u) => {
      if (!u) return;   // vazio resolveria para a própria URL da página
      try {
        const a = new URL(u, base);
        if (a.protocol === "http:" || a.protocol === "https:") out.add(a.href);
      } catch (e) { /* ignora */ }
    };
    if (v) {
      add(v.currentSrc); add(v.src);
      if (v.querySelectorAll) v.querySelectorAll("source[src]").forEach((s) => add(s.src));
    }
    return [...out].filter(Boolean).slice(0, 4);
  }

  function send(msg) {
    try {
      return Promise.resolve(chrome.runtime.sendMessage(msg)).catch(() => null);
    } catch (e) {   // extensão recarregada: o contexto deste script ficou inválido
      return Promise.resolve(null);
    }
  }

  async function enabled() {
    if (Date.now() - cfgCache.t < 15000) return cfgCache.on;
    const c = await send({ type: "video-config" });
    cfgCache = { t: Date.now(), on: !!(c && c.online && c.enabled) };
    return cfgCache.on;
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- interface (Shadow DOM: o CSS da página não mexe nela e vice-versa) ----------
  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box;font-family:"Segoe UI",Roboto,Arial,sans-serif}
    .wrap{position:absolute;right:0;top:0;display:flex;flex-direction:column;align-items:flex-end;pointer-events:none}
    .btn{pointer-events:auto;display:flex;align-items:center;gap:8px;cursor:pointer;border:1px solid rgba(255,255,255,.22);
      border-radius:999px;padding:6px 14px 6px 7px;background:linear-gradient(135deg,#2f7bff,#0a248c);color:#fff;
      font-size:13px;font-weight:600;letter-spacing:.01em;box-shadow:0 4px 14px rgba(10,36,140,.55);
      transition:transform .12s ease,box-shadow .12s ease,filter .12s ease}
    .btn:hover{filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 6px 18px rgba(10,36,140,.7)}
    .btn:active{transform:translateY(0);filter:brightness(.98)}
    .arrow{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;
      background:rgba(255,255,255,.16)}
    .arrow svg{width:14px;height:14px;display:block}
    .panel{pointer-events:auto;margin-top:8px;width:380px;max-width:92vw;overflow:auto;background:#fff;color:#1b1f2a;
      border:1px solid rgba(15,23,42,.14);border-radius:14px;box-shadow:0 12px 36px rgba(8,16,60,.38);font-size:13px;
      animation:pop .14s ease-out}
    @keyframes pop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
    .panel[hidden]{display:none}
    .head{display:flex;align-items:center;gap:8px;padding:10px 12px;color:#fff;font-weight:600;
      background:linear-gradient(135deg,#2f7bff,#0a248c)}
    .logo{display:flex;flex:none}
    .logo svg{width:16px;height:16px;display:block}
    .title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .x{flex:none;cursor:pointer;border:0;background:none;font-size:15px;line-height:1;color:#fff;opacity:.8;padding:2px 4px;
      border-radius:6px}
    .x:hover{opacity:1;background:rgba(255,255,255,.18)}
    .sec{padding:10px 12px 4px;font-size:11px;font-weight:700;letter-spacing:.06em;color:#0a248c;text-transform:uppercase}
    .row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 12px;cursor:pointer;
      transition:background .1s ease}
    .row:hover{background:#eaf1ff}
    .row:active{background:#d9e6ff}
    .size{color:#4a5568;white-space:nowrap;background:#eef1f7;border-radius:999px;padding:1px 9px;font-size:12px}
    .msg{padding:14px 12px;line-height:1.45}
    .warn{padding:9px 12px;background:#fff8e1;color:#7a5b00;font-size:12px;border-top:1px solid #f0e2a8;line-height:1.4}
    .ok{color:#188038;font-weight:600}
    .err{color:#b3261e}
    @media (prefers-color-scheme:dark){
      .panel{background:#151a2c;color:#e8ecf8;border-color:rgba(255,255,255,.12)}
      .sec{color:#8fb0ff}
      .row:hover{background:#202a4d}
      .row:active{background:#2a3763}
      .size{background:#232b47;color:#aab4d4}
      .warn{background:#2a2410;color:#f2d98a;border-top-color:#4a3f14}
      .ok{color:#5fd38a}
      .err{color:#ff8a80}
    }
  `;

  // ícones desenhados em SVG (sem imagens externas)
  const SVG_NS = "http://www.w3.org/2000/svg";
  function svgIcon(kind) {
    const s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(SVG_NS, "path");
    if (kind === "bolt") {            // o raio da marca
      p.setAttribute("d", "M13.5 2 5 13.2h5.6L9.4 22 19 9.6h-5.8z");
      p.setAttribute("fill", "#ffc933");
    } else {                          // seta de download
      p.setAttribute("d", "M12 4v10m0 0 4.5-4.5M12 14 7.5 9.5M5.5 19.5h13");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "#fff");
      p.setAttribute("stroke-width", "2.4");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    s.append(p);
    return s;
  }
  function iconBox(cls, kind) {
    const e = el("span", cls);
    e.append(svgIcon(kind));
    return e;
  }

  function ensureUi() {
    if (host) return;
    host = document.createElement("pydm-video-ui");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;display:none;left:0;top:0;width:0;height:0;";
    root = host.attachShadow({ mode: "closed" });
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      const st = el("style"); st.textContent = CSS; root.append(st);
    }
    const wrap = el("div", "wrap");
    btn = el("button", "btn");
    btn.type = "button";
    btn.append(iconBox("arrow", "download"), el("span", "", "Baixar este vídeo"));
    panel = el("div", "panel");
    panel.hidden = true;
    wrap.append(btn, panel);
    root.append(wrap);
    document.documentElement.append(host);

    btn.addEventListener("click", (e) => {
      if (!e.isTrusted) return;   // ignora cliques fabricados pela página
      e.stopPropagation();
      panelOpen ? closePanel() : openPanel();
    });
    host.addEventListener("mouseenter", cancelHide);
    host.addEventListener("mouseleave", scheduleHide);
  }

  function place() {
    if (!current || !host) return;
    const r = current.getBoundingClientRect();
    const visible = current.isConnected && r.width >= MIN_W && r.height >= MIN_H &&
      r.bottom > 48 && r.top < innerHeight - 48 && r.right > 48 && r.left < innerWidth - 48;
    if (!visible || document.fullscreenElement) { hideAll(); return; }
    const x = Math.min(r.right, innerWidth) - 10;
    const y = Math.max(r.top, 0) + 10;
    host.style.left = x + "px";
    host.style.top = y + "px";
    panel.style.maxHeight = Math.max(160, innerHeight - y - 70) + "px";
  }

  function cancelHide() { clearTimeout(hideTimer); hideTimer = 0; }
  function scheduleHide() {
    if (panelOpen) return;
    cancelHide();
    hideTimer = setTimeout(hideAll, HIDE_MS);
  }
  function hideAll() {
    cancelHide();
    closePanel();
    if (host) host.style.display = "none";
    current = null;
    if (posTimer) { clearInterval(posTimer); posTimer = 0; }
  }

  async function show(v) {
    if (!pageSupported(location)) return;
    if (current === v && host && host.style.display === "block") { cancelHide(); return; }
    if (!(await enabled())) return;
    current = v;
    ensureUi();
    host.style.display = "block";
    place();
    cancelHide();
    if (!posTimer) posTimer = setInterval(place, 150);
  }

  // ---------- painel ----------
  function closePanel() {
    panelOpen = false;
    token++;
    if (panel) panel.hidden = true;
  }

  function header(text) {
    const h = el("div", "head");
    h.append(iconBox("logo", "bolt"));
    const t = el("span", "title", text);
    t.title = text;
    const x = el("button", "x", "\u2715");
    x.type = "button";
    x.addEventListener("click", (e) => { if (e.isTrusted) closePanel(); });
    h.append(t, x);
    return h;
  }

  function showMessage(title, text, cls) {
    panel.replaceChildren(header(title), el("div", "msg " + (cls || ""), text));
  }

  async function openPanel() {
    const v = current;
    if (!v) return;
    panelOpen = true;
    panel.hidden = false;
    showMessage("Baixar este vídeo", "Analisando o vídeo...");
    const my = ++token;
    const res = await send({ type: "media-formats", url: location.href, referrer: document.referrer });
    if (my !== token || !panelOpen) return;   // o painel foi fechado ou reaberto enquanto analisava
    render(res, directSources(v, location.href));
  }

  function optionRow(res, opt) {
    const row = el("div", "row");
    row.append(el("span", "", opt.label), el("span", "size", fmtSize(opt.size)));
    row.addEventListener("click", (e) => { if (e.isTrusted) pick(res, opt); });
    return row;
  }

  function directRow(u) {
    let ext = "";
    try { ext = (new URL(u).pathname.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || ""; } catch (e) { /* ignora */ }
    const row = el("div", "row");
    row.append(el("span", "", "Arquivo do vídeo" + (ext ? " (" + ext.toUpperCase() + ")" : "")), el("span", "size", "direto"));
    row.addEventListener("click", async (e) => {
      if (!e.isTrusted || busy) return;
      busy = true;
      const r = await send({ type: "download-direct", url: u, referrer: document.referrer || location.href });
      busy = false;
      done(r && r.ok, "Adicionado ao Raio", r && r.message);
    });
    return row;
  }

  function render(res, direct) {
    if (!res || res.ok === false) {
      const text = !res ? "Não consegui falar com o Raio. Ele está aberto?" :
        (res.message || "Não foi possível analisar este vídeo.");
      const parts = [header("Baixar este vídeo"), el("div", "msg err", text)];
      if (direct.length) {
        parts.push(el("div", "sec", "Arquivo da página"));
        direct.forEach((u) => parts.push(directRow(u)));
      }
      panel.replaceChildren(...parts);
      return;
    }
    const parts = [header(res.title || document.title || "Baixar este vídeo")];
    if (res.live) parts.push(el("div", "warn", "Esta página parece uma transmissão ao vivo; o download pode não terminar."));
    if (res.video.length) {
      parts.push(el("div", "sec", "Vídeo"));
      res.video.forEach((o) => parts.push(optionRow(res, o)));
    }
    if (res.audio.length) {
      parts.push(el("div", "sec", "Somente áudio"));
      res.audio.forEach((o) => parts.push(optionRow(res, o)));
    }
    if (!res.ffmpeg) {
      parts.push(el("div", "warn", "Sem o ffmpeg só aparecem as qualidades que já trazem som e não dá para " +
        "converter em MP3/WAV. Instale em Raio > Opções > Vídeo."));
    }
    if (res.deno === false && /(^|\.)youtube\.com$/i.test(location.hostname)) {
      parts.push(el("div", "warn", "O YouTube exige o Deno para liberar todas as qualidades. " +
        "Instale em Raio > Opções > Vídeo."));
    }
    panel.replaceChildren(...parts);
  }

  async function pick(res, opt) {
    if (busy) return;
    busy = true;
    const title = (res.title || document.title || "").replace(/ - YouTube$/, "");
    const r = await send({
      type: "media-download", url: location.href, referrer: document.referrer,
      id: opt.id, title, est: opt.size || 0
    });
    busy = false;
    done(r && r.ok, "Adicionado ao Raio: " + opt.label, r && r.message);
  }

  function done(ok, okText, errText) {
    if (!panelOpen) return;
    if (ok) {
      showMessage("Raio", "\u2713 " + okText, "ok");
      setTimeout(() => { if (panelOpen) closePanel(); }, 1600);
    } else {
      showMessage("Raio", errText || "Não foi possível enviar ao Raio. Ele está aberto?", "err");
    }
  }

  // ---------- detecção do vídeo sob o mouse ----------
  function qualifies(v) {
    const r = v.getBoundingClientRect();
    if (r.width < MIN_W || r.height < MIN_H) return false;
    const cs = getComputedStyle(v);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }

  function videoAt(x, y) {
    for (const e of document.elementsFromPoint(x, y)) {
      if (e.tagName === "VIDEO" && qualifies(e)) return e;
    }
    return null;
  }

  addEventListener("mousemove", (e) => {
    const now = Date.now();
    if (now - lastMove < 100) return;   // não precisa checar a cada pixel
    lastMove = now;
    if (document.fullscreenElement) return;
    if (host && e.composedPath().includes(host)) { cancelHide(); return; }
    const v = videoAt(e.clientX, e.clientY);
    if (v) show(v); else scheduleHide();
  }, true);

  // clicar fora (ou Esc) fecha o painel
  addEventListener("mousedown", (e) => {
    if (panelOpen && !(host && e.composedPath().includes(host))) closePanel();
  }, true);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && panelOpen) closePanel(); }, true);
  addEventListener("scroll", () => place(), true);
  addEventListener("resize", () => place());
  document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement) hideAll(); });

  // gancho de teste (não existe no navegador)
  if (globalThis.__PYDM_TEST__) {
    Object.assign(globalThis.__PYDM_TEST__, {
      fmtSize, pageSupported, directSources, show, openPanel, closePanel, hideAll, place,
      state: () => ({ host, panel, btn, current, panelOpen })
    });
  }
})();
