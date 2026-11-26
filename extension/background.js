const API = "http://127.0.0.1:9614";
const MODS_TTL = 3000;   // ms: por quanto tempo vale a tecla segurada no último clique
const CONTEXTS = ["link", "video", "audio", "image", "page", "selection"];
const DEFAULT_CFG = {
  title: "Baixar com o Raio",
  menu: { link: true, video: true, audio: true, image: true, page: false }
};

let lastMods = { mods: "", t: 0 };

function badge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: color || "#888" });
}

// O service worker dorme e acorda: o estado "ligado" é sempre lido do storage
// (antes ele era lido de forma assíncrona e um download podia ser capturado com a captura desligada).
async function isEnabled() {
  const v = await chrome.storage.local.get({ enabled: true });
  return v.enabled;
}
// Ícone colorido = captura ligada; cinza + "OFF" = desligada.
const ICONS_ON = { 16: "icons/16.png", 32: "icons/32.png", 48: "icons/48.png", 128: "icons/128.png" };
const ICONS_OFF = { 16: "icons/16-off.png", 32: "icons/32-off.png", 48: "icons/48-off.png", 128: "icons/128-off.png" };
async function refreshBadge() {
  const on = await isEnabled();
  badge(on ? "" : "OFF");
  Promise.resolve(chrome.action.setIcon({ path: on ? ICONS_ON : ICONS_OFF })).catch(() => {});
  Promise.resolve(chrome.action.setTitle({
    title: on ? "Raio: captura de downloads ligada (clique para desligar)"
              : "Raio: captura de downloads desligada (clique para ligar)"
  })).catch(() => {});
}
refreshBadge();

// Clique no ícone: liga/desliga a captura
chrome.action.onClicked.addListener(async () => {
  await chrome.storage.local.set({ enabled: !(await isEnabled()) });
  refreshBadge();
});

// ---------- mídias detectadas na rede (como o IDM): vídeos, áudios e listas HLS/DASH que a página pediu ----------
// O yt-dlp não conhece todos os sites. Aqui a extensão guarda os endereços de mídia que a própria página pediu para
// o painel "Baixar este vídeo" oferecê-los quando o yt-dlp não reconhece o endereço da página. Só olha o tipo e o
// tamanho das respostas; a lista de cada aba fica na memória do navegador (storage.session) e some ao navegar.
const SNIFF_MAX = 25;                      // endereços guardados por aba
const SNIFF_MIN_BYTES = 300 * 1024;        // arquivos menores são pedaços de stream, propagandas e ícones
const SNIFF_SEGMENT_BYTES = 4 * 1024 * 1024;   // abaixo disso, arquivos "numerados" (seg-1, seg-2...) contam como um só
const SNIFF_SERIES = 3;                    // 3 ou mais arquivos com o mesmo padrão numerado = pedaços de um stream: não são listados
const SNIFF_TTL = 30 * 60 * 1000;
const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|mp3|m4a|aac|flac|ogg|oga|opus|wav)$/i;
const SEGMENT_EXT = /\.(ts|m4s|m4f|cmfv|cmfa|cmft)$/i;
const SNIFF_SKIP_HOST = /(^|\.)(youtube\.com|youtu\.be|googlevideo\.com|ytimg\.com)$/i;   // o YouTube é com o yt-dlp

function headerOf(headers, name) {
  const h = (headers || []).find((x) => x && x.name && x.name.toLowerCase() === name);
  return h && h.value ? String(h.value) : "";
}

// Resposta de rede -> {url, kind, mime, size, ext, key, t} se parecer um vídeo/áudio baixável; senão null.
function classifyMedia(d, now) {
  if (!d || (d.statusCode !== 200 && d.statusCode !== 206)) return null;
  let u;
  try { u = new URL(d.url); } catch (e) { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (SNIFF_SKIP_HOST.test(u.hostname)) return null;
  const mime = headerOf(d.responseHeaders, "content-type").split(";")[0].trim().toLowerCase();
  if (/^(text\/html|text\/javascript|application\/javascript|application\/json)$/.test(mime)) return null;
  const path = u.pathname.toLowerCase();
  const t = now || Date.now();
  const base = u.origin + u.pathname;
  if (/mpegurl|dash\+xml/.test(mime) || /\.(m3u8|mpd)$/.test(path)) {
    const ext = /m3u8|mpegurl/.test(path + mime) ? "m3u8" : "mpd";
    return { url: d.url, kind: "manifest", mime, size: 0, ext, key: base, t };
  }
  if (SEGMENT_EXT.test(path)) return null;                          // pedaços de HLS/DASH
  const known = MEDIA_EXT.test(path);
  const generic = mime === "" || mime === "application/octet-stream" || mime === "binary/octet-stream";
  if (!/^(video|audio)\//.test(mime) && !(known && generic)) return null;
  if (/^video\/(mp2t|iso\.segment)$/.test(mime)) return null;      // pedaços de HLS/DASH
  const total = headerOf(d.responseHeaders, "content-range").match(/\/(\d+)\s*$/);   // 206: tamanho do arquivo inteiro
  const size = total ? Number(total[1]) : (Number(headerOf(d.responseHeaders, "content-length")) || 0);
  if (size && size < SNIFF_MIN_BYTES) return null;
  if (!size && !known) return null;
  const ext = (path.match(MEDIA_EXT) || [])[1] || (mime.split("/")[1] || "").replace(/^x-/, "");
  // pedaços "numerados" de um mesmo stream viram uma entrada só (a mais recente)
  const key = size && size < SNIFF_SEGMENT_BYTES ? base.replace(/\d+/g, "#") : base;
  return { url: d.url, kind: "file", mime, size, ext: ext.toLowerCase(), key, base, n: 1, t };
}

// Acrescenta uma entrada à lista da aba: tira as velhas e a repetida (mesmo key), mais nova primeiro, no máximo SNIFF_MAX.
function mergeSniffed(list, entry, now) {
  const t = now || Date.now();
  const prev = (list || []).find((e) => e.key === entry.key);
  // mesmo padrão numerado com endereços diferentes: conta quantos (uma série é um stream em pedaços)
  const n = prev ? (prev.n || 1) + (prev.base && entry.base && prev.base !== entry.base ? 1 : 0) : (entry.n || 1);
  const out = (list || []).filter((e) => t - e.t < SNIFF_TTL && e.key !== entry.key);
  out.unshift({ ...entry, n });
  return out.slice(0, SNIFF_MAX);
}

// Sites de streaming costumam autenticar o pedido do vídeo com um token em cabeçalho (Authorization, X-...), que o
// yt-dlp não tem. Guardamos só esses cabeçalhos do próprio pedido da página, na memória do service worker e, junto da
// mídia, na storage.session; eles NUNCA vão para o script da página e só são enviados ao Raio (127.0.0.1) quando o
// usuário escolhe baixar aquele item.
const SNIFF_HDR = /^(authorization|origin|x-[a-z0-9-]{1,40})$/i;
const canonHeader = (n) => n.toLowerCase().replace(/(^|-)([a-z])/g, (m, a, b) => a + b.toUpperCase());

function pickHeaders(requestHeaders) {
  const out = {};
  for (const h of requestHeaders || []) {
    if (h && h.name && h.value && SNIFF_HDR.test(h.name) && String(h.value).length <= 8192) out[canonHeader(h.name)] = String(h.value);
  }
  return out;
}

const pendingHdr = new Map();                 // requestId -> cabeçalhos (vive poucos segundos)
chrome.webRequest.onSendHeaders.addListener((d) => {
  if (d.tabId < 0) return;
  const h = pickHeaders(d.requestHeaders);
  if (Object.keys(h).length) {
    pendingHdr.set(d.requestId, h);
    setTimeout(() => pendingHdr.delete(d.requestId), 60000);
  }
}, { urls: ["http://*/*", "https://*/*"], types: ["media", "xmlhttprequest", "other"] }, ["requestHeaders", "extraHeaders"]);

let sniffSeq = 0;
let sniffQueue = Promise.resolve();
async function sniffAdd(tabId, entry) {
  if (!(await isEnabled())) return;
  const k = "sn:" + tabId;
  const cur = (await chrome.storage.session.get(k))[k] || [];
  await chrome.storage.session.set({ [k]: mergeSniffed(cur, entry) });
}

chrome.webRequest.onHeadersReceived.addListener((d) => {
  if (d.tabId < 0) return;
  const e = classifyMedia(d);
  if (e) {
    e.id = Date.now().toString(36) + "-" + (++sniffSeq);
    const extra = pendingHdr.get(d.requestId);
    if (extra) e.extra = extra;
    sniffQueue = sniffQueue.then(() => sniffAdd(d.tabId, e)).catch(() => {});
  }
  pendingHdr.delete(d.requestId);
}, { urls: ["http://*/*", "https://*/*"], types: ["media", "xmlhttprequest", "other"] }, ["responseHeaders"]);

// página nova na aba = lista nova (mudar de rota sem recarregar, como nos sites de streaming, não limpa)
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") chrome.storage.session.remove("sn:" + tabId).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => { chrome.storage.session.remove("sn:" + tabId).catch(() => {}); });

// Cabeçalhos de autorização guardados para uma mídia detectada nesta aba (vazio se não houver).
async function sniffedExtra(sender, msg) {
  if (!sender || !sender.tab || !msg) return {};
  const k = "sn:" + sender.tab.id;
  const list = (await chrome.storage.session.get(k))[k] || [];
  const e = list.find((x) => (msg.sid && x.id === msg.sid) || x.url === msg.url);
  return e && e.extra ? e.extra : {};
}

// ---------- mensagens dos scripts das páginas (keys.js e video.js) ----------
async function pydmJson(path, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 5000);
  try {
    const r = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal
    });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const OFFLINE = { ok: false, error: "offline", message: "Não consegui falar com o Raio. Ele está aberto?" };

// Dados do navegador que o Raio usa (no YouTube o yt-dlp usa as próprias identidades, então não manda cookies).
async function pageInfo(msg) {
  const url = String(msg.url || "");
  if (!/^https?:\/\//i.test(url)) throw new Error("url");
  const yt = /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(url).hostname);
  let cookie = "";
  if (!yt) cookie = (await chrome.cookies.getAll({ url })).map(c => `${c.name}=${c.value}`).join("; ");
  return { url, referrer: String(msg.referrer || ""), cookie, userAgent: navigator.userAgent };
}

const HANDLERS = {
  // o painel só aparece se o Raio estiver aberto e com o recurso ligado nas Opções
  "video-config": async () => {
    try {
      const c = await pydmJson("/config", null, 1500);
      return { online: true, enabled: !!(c.video && c.video.enabled) };
    } catch (e) {
      return { online: false, enabled: false };
    }
  },
  // lista as qualidades de vídeo e os formatos de áudio (o Raio roda o yt-dlp; pode levar alguns segundos)
  "media-formats": async (msg, sender) => pydmJson("/media/formats",
    { ...(await pageInfo(msg)), extra: await sniffedExtra(sender, msg) }, 120000),
  "media-download": async (msg, sender) => pydmJson("/media/download", {
    ...(await pageInfo(msg)), id: String(msg.id || ""), title: String(msg.title || ""), est: Number(msg.est) || 0,
    extra: await sniffedExtra(sender, msg)
  }, 10000),
  // endereços de vídeo/áudio/stream que a página pediu na rede (para sites que o yt-dlp não reconhece)
  "media-sniffed": async (msg, sender) => {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    if (tabId == null) return { list: [] };
    const k = "sn:" + tabId;
    const now = Date.now();
    const list = ((await chrome.storage.session.get(k))[k] || [])
      .filter((e) => now - e.t < SNIFF_TTL && (e.n || 1) < SNIFF_SERIES);
    return { list: list.map(({ id, url, kind, mime, size, ext, t }) => ({ id, url, kind, mime, size, ext, t })) };
  },
  // arquivo de vídeo com endereço direto: baixa pelo motor normal do Raio
  "download-direct": async (msg, sender) => {
    const ok = await sendToPyDM(String(msg.url || ""), String(msg.referrer || ""),
      { manual: true, extra: await sniffedExtra(sender, msg) });
    return { ok };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || sender.id !== chrome.runtime.id) return;
  if (msg.type === "mods") {               // teclas segurando o clique (keys.js)
    lastMods = { mods: String(msg.mods || ""), t: Date.now() };
    return;
  }
  const handler = HANDLERS[msg.type];
  if (!handler) return;
  handler(msg, sender).then(sendResponse, () => sendResponse(OFFLINE));
  return true;                              // resposta assíncrona
});

// Retorna true se o Raio aceitou o link. 409 = Raio ignorou (filtros/teclas): o navegador baixa normalmente.
async function sendToPyDM(url, referrer, extra) {
  const cookies = await chrome.cookies.getAll({ url });
  const cookie = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const r = await fetch(API + "/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url, referrer: referrer || "", cookie, userAgent: navigator.userAgent, ...(extra || {})
    })
  });
  return r.ok;
}

// Captura automática de downloads
chrome.downloads.onCreated.addListener(async (item) => {
  const mods = Date.now() - lastMods.t < MODS_TTL ? lastMods.mods : "";
  if (!(await isEnabled())) return;
  const url = item.finalUrl || item.url;
  if (!/^https?:/i.test(url)) return;          // ignora blob:, data:, file:
  const filename = (item.filename || "").split(/[\\/]/).pop();
  try {
    if (await sendToPyDM(url, item.referrer, { mods, filename, mime: item.mime || "" })) {
      await chrome.downloads.cancel(item.id);   // cancela o download do navegador
      await chrome.downloads.erase({ id: item.id });
    }
  } catch (e) {
    // Raio fechado: o navegador continua o download normalmente
  }
});

// ---------- menu de clique direito (configurado nas Opções do Raio) ----------
let syncing = Promise.resolve();
function syncMenu(force) {
  syncing = syncing.then(() => doSync(force)).catch(() => {});
  return syncing;
}

async function doSync(force) {
  const saved = (await chrome.storage.local.get({ menuCfg: null })).menuCfg;
  let cfg;
  try {
    const r = await fetch(API + "/config");
    if (!r.ok) throw new Error("http " + r.status);
    cfg = await r.json();
  } catch (e) {
    if (!force) return;                          // Raio fechado: mantém o menu atual
    cfg = saved || DEFAULT_CFG;
  }
  if (!force && JSON.stringify(cfg) === JSON.stringify(saved)) return;   // nada mudou
  const contexts = Object.keys(cfg.menu || {}).filter(k => cfg.menu[k] && CONTEXTS.includes(k));
  await chrome.contextMenus.removeAll();
  if (contexts.length) {
    chrome.contextMenus.create({ id: "pydm", title: cfg.title || DEFAULT_CFG.title, contexts });
  }
  await chrome.storage.local.set({ menuCfg: cfg });
}

chrome.runtime.onInstalled.addListener(() => syncMenu(true));
chrome.runtime.onStartup.addListener(() => syncMenu(true));
chrome.alarms.get("pydm-sync", (a) => {
  if (!a) chrome.alarms.create("pydm-sync", { periodInMinutes: 1 });
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "pydm-sync") syncMenu(false); });

chrome.contextMenus.onClicked.addListener(async (info) => {
  const url = info.linkUrl || info.srcUrl || info.pageUrl;
  if (!url || !/^https?:/i.test(url)) return;
  try {
    await sendToPyDM(url, info.pageUrl, { manual: true });   // menu de contexto: ignora os filtros
    badge("✓", "#188038");
  } catch (e) {
    badge("!", "#d93025");                      // Raio não está aberto
  }
  setTimeout(refreshBadge, 3000);
});

// gancho de teste (não existe no navegador)
if (globalThis.__PYDM_TEST__) {
  Object.assign(globalThis.__PYDM_TEST__, { classifyMedia, mergeSniffed, headerOf, HANDLERS, SNIFF_MAX, SNIFF_TTL, SNIFF_SERIES, pickHeaders, sniffedExtra });
}
