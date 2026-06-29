/* Харизма: добірка YouTube-каналів-наставників.
   Показує ОСТАННЄ відео з кожного каналу без API-ключа:
   - channelId резолвиться з @handle (HTML) і кешується назавжди в localStorage;
     поле channelId у CHANNELS можна захардкодити пізніше (надійніше за резолв).
   - останнє відео береться з RSS-стрічки каналу (feeds/videos.xml).
   - усі запити йдуть через CORS-проксі з резервним fallback і таймаутом.
   Кеш відео — localStorage, TTL 30 хв; кнопка «Оновити» ігнорує кеш. */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.charisma = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  /* channelId лиши порожнім — резолвиться й кешується автоматично.
     Коли з'ясуєш UC... — впиши сюди, тоді резолв не знадобиться. */
  const CHANNELS = [
    { handle: "charismaoncommand_ru", name: "Charisma on Command", channelId: "" },
    { handle: "panfer",              name: "Panfer",              channelId: "" },
    { handle: "marnikinrys-ru",      name: "Marnikinrys",         channelId: "" },
  ];

  const LS_IDS = "genius.charisma.ids";        // { handle: "UC..." } — назавжди
  const LS_VID = "genius.charisma.videos";     // { handle: {title,url,published,fetchedAt} }
  const TTL = 30 * 60 * 1000;                  // свіжість кешу відео — 30 хв
  const TIMEOUT = 10000;                       // таймаут одного запиту

  const PROXIES = [
    function (url) { return "https://corsproxy.io/?" + encodeURIComponent(url); },
    function (url) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(url); },
  ];

  /* ---------- localStorage (окремо від синхронізованого genius.v1) ---------- */
  function lsGet(key, def) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* квота */ } }

  function idMap() { return lsGet(LS_IDS, {}); }
  function saveId(handle, id) { const m = idMap(); m[handle] = id; lsSet(LS_IDS, m); }
  function vidMap() { return lsGet(LS_VID, {}); }
  function saveVid(handle, v) { const m = vidMap(); m[handle] = v; lsSet(LS_VID, m); }

  /* ---------- чисті хелпери ---------- */
  function channelUrl(ch) { return "https://www.youtube.com/@" + ch.handle + "/videos"; }

  function openUrl(url) {
    // через клік по <a target="_blank">, щоб не блокувались попапи
    const a = h("a", { href: url, target: "_blank", rel: "noopener" });
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* hours -> {text, cls, isNew} */
  function freshness(published) {
    const hours = (Date.now() - new Date(published).getTime()) / 3600000;
    let text;
    if (hours < 1) text = "щойно";
    else if (hours < 24) text = Math.floor(hours) + " год тому";
    else text = Math.floor(hours / 24) + " дн тому";
    let cls;
    if (hours < 24) cls = "g";
    else if (hours < 72) cls = "y";
    else if (hours < 168) cls = "o";
    else cls = "r";
    return { text: text, cls: cls, isNew: hours < 24 };
  }

  function buildRow(ch, data) {
    // data: {loading:true} | {error:true} | {video:{...}}
    const v = data.video;
    const play = h("button", {
      class: "yt-play", title: "Дивитися",
      onclick: function (e) { e.stopPropagation(); openUrl(v ? v.url : channelUrl(ch)); },
    }, "▶");

    const name = h("div", { class: "yt-name" }, ch.name);

    let titleEl, badge = null, isNew = false;
    if (data.loading) {
      titleEl = h("div", { class: "yt-title muted" }, "завантаження…");
    } else if (data.error) {
      titleEl = h("div", { class: "yt-title danger" }, "не вдалося завантажити");
    } else {
      titleEl = h("a", {
        class: "yt-title", href: v.url, target: "_blank", rel: "noopener",
        onclick: function (e) { e.stopPropagation(); },   // клік по відео ≠ клік по каналу
      }, v.title);
      if (v.published) {
        const f = freshness(v.published);
        isNew = f.isNew;
        badge = h("span", { class: "yt-ago " + f.cls }, f.text);
      }
    }

    const right = h("div", { class: "yt-right" },
      isNew ? h("span", { class: "yt-new" }, "NEW") : null,
      badge);

    return h("div", {
      class: "yt-row" + (isNew ? " fresh" : ""),
      title: "Відкрити канал на YouTube",
      onclick: function () { openUrl(channelUrl(ch)); },
    }, play, h("div", { class: "yt-main" }, name, titleEl), right);
  }

  /* ---------- рендер ---------- */
  function render(root) {
    const state = { cancelled: false, timers: [], controllers: [] };

    function sleep(ms) {
      return new Promise(function (resolve) {
        const t = setTimeout(resolve, ms);
        state.timers.push(t);
      });
    }

    // fetch через проксі з fallback і таймаутом
    async function proxyFetch(url) {
      let lastErr;
      for (let i = 0; i < PROXIES.length; i++) {
        if (state.cancelled) throw new Error("cancelled");
        const ctrl = new AbortController();
        state.controllers.push(ctrl);
        const timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT);
        try {
          const res = await fetch(PROXIES[i](url), { signal: ctrl.signal });
          clearTimeout(timer);
          if (!res.ok) { lastErr = new Error("HTTP " + res.status); continue; }
          const text = await res.text();
          if (text && text.length > 20) return text;
          lastErr = new Error("порожня відповідь");
        } catch (e) {
          clearTimeout(timer);
          lastErr = e;
        }
      }
      throw lastErr || new Error("усі проксі недоступні");
    }

    async function resolveChannelId(ch) {
      if (ch.channelId) return ch.channelId;                 // захардкоджено
      const cached = idMap()[ch.handle];
      if (cached) return cached;                             // вже резолвили колись
      const html = await proxyFetch("https://www.youtube.com/@" + ch.handle);
      const m = html.match(/"externalId":"(UC[\w-]{22})"/) ||
                html.match(/"channelId":"(UC[\w-]{22})"/) ||
                html.match(/channel\/(UC[\w-]{22})/);
      if (!m) throw new Error("channelId не знайдено");
      saveId(ch.handle, m[1]);
      return m[1];
    }

    async function fetchLatest(ch) {
      const id = await resolveChannelId(ch);
      const xml = await proxyFetch("https://www.youtube.com/feeds/videos.xml?channel_id=" + id);
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const entry = doc.querySelector("entry");
      if (!entry) throw new Error("стрічка порожня");
      const titleEl = entry.querySelector("title");
      const linkEl = entry.querySelector("link");
      const pubEl = entry.querySelector("published");
      const title = (titleEl && titleEl.textContent || "").trim() || "(без назви)";
      const url = (linkEl && linkEl.getAttribute("href")) || channelUrl(ch);
      const published = (pubEl && pubEl.textContent || "").trim();
      return { title: title, url: url, published: published };
    }

    // до 2 спроб із паузою ~800мс (кожна спроба сама перебирає 2 проксі)
    async function fetchWithRetry(ch) {
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (state.cancelled) throw new Error("cancelled");
        if (attempt) await sleep(800);
        try { return await fetchLatest(ch); }
        catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("не вдалося");
    }

    // DOM-хости рядків (по одному на канал) — щоб точково перемальовувати
    const hosts = {};
    function setRow(ch, data) {
      const host = hosts[ch.handle];
      if (!host) return;
      host.innerHTML = "";
      host.append(buildRow(ch, data));
    }

    async function refresh(force) {
      if (force) refreshBtn.disabled = true;
      try {
        for (let i = 0; i < CHANNELS.length; i++) {
          if (state.cancelled) return;
          const ch = CHANNELS[i];
          const cache = vidMap()[ch.handle];
          const fresh = cache && (Date.now() - cache.fetchedAt) < TTL;

          if (cache && !force) {
            setRow(ch, { video: cache });        // показуємо кеш одразу
            if (fresh) continue;                 // ще свіжий — мережа не потрібна
          } else {
            setRow(ch, { loading: true });
          }

          try {
            const v = await fetchWithRetry(ch);
            if (state.cancelled) return;
            v.fetchedAt = Date.now();
            saveVid(ch.handle, v);
            setRow(ch, { video: v });
          } catch (e) {
            if (state.cancelled) return;
            // лишаємо старий кеш, якщо був; інакше — помилка для цього каналу
            setRow(ch, cache ? { video: cache } : { error: true });
          }
          await sleep(200);                      // пауза між каналами
        }
      } finally {
        if (!state.cancelled) refreshBtn.disabled = false;
      }
    }

    /* шапка картки */
    const refreshBtn = h("button", { class: "btn ghost small", onclick: function () { refresh(true); } }, "↻ Оновити");
    const openAllBtn = h("button", { class: "btn green small", onclick: function () { CHANNELS.forEach(function (ch) { openUrl(channelUrl(ch)); }); } }, "▶ Відкрити всі");

    const listEl = h("div", { class: "yt-list" });
    CHANNELS.forEach(function (ch) {
      const host = h("div");
      hosts[ch.handle] = host;
      host.append(buildRow(ch, { loading: true }));
      listEl.append(host);
    });

    root.append(
      h("h1", { class: "page-title" }, "🎤 Харизма"),
      h("div", { class: "page-sub" }, "Канали-наставники з харизми, впевненості та комунікації."),
      h("div", { class: "card fade-in" },
        h("div", { class: "row between", style: "margin-bottom:14px" },
          h("h2", null, "YouTube-канали"),
          h("div", { class: "row", style: "gap:8px" }, refreshBtn, openAllBtn)),
        listEl,
        h("div", { class: "tiny muted", style: "margin-top:12px" },
          "Останнє відео з кожного каналу. Перше завантаження може бути повільнішим (через проксі).")));

    refresh(false);

    return function cleanup() {
      state.cancelled = true;
      state.timers.forEach(function (t) { clearTimeout(t); });
      state.controllers.forEach(function (c) { try { c.abort(); } catch (e) { /* ignore */ } });
    };
  }

  return { id: "charisma", title: "Харизма", icon: "🎤", render: render };
})();
