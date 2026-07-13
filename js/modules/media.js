/* Медіа: фільми/серіали, книги, фрази (практика). 3 під-вкладки.
   Стан: state.media = { films:[{id,title,year,watched}], books:[{id,title,read}],
   phrases:[{id,text}], phrasesTotalDone, phrasesDoneIds:[], init, mediaMetaV }. */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.media = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };
  function uid(p) { return (p || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function isoWeek(d) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    return 1 + Math.round((t - new Date(t.getFullYear(), 0, 4)) / 604800000);
  }
  function autogrow(ta) { ta.style.height = "auto"; ta.style.height = (ta.scrollHeight + 2) + "px"; }
  const MEDIA_META_V = 2; // бампати, коли додаємо нові дані (роки, нові фрази) до стартової добірки

  function render(root) {
    const st = App.store.state;
    if (!st.media || typeof st.media !== "object") st.media = {};
    const m = st.media;
    let changed = false;
    if (!m.init) {
      const d = App.data.defaultMedia || { films: [], books: [], phrases: [] };
      m.films = JSON.parse(JSON.stringify(d.films || []));
      m.books = JSON.parse(JSON.stringify(d.books || []));
      m.phrases = JSON.parse(JSON.stringify(d.phrases || []));
      m.init = true; changed = true;
    }
    m.films = m.films || []; m.books = m.books || []; m.phrases = m.phrases || [];
    m.phrasesTotalDone = m.phrasesTotalDone || 0;
    if (!Array.isArray(m.phrasesDoneIds)) { m.phrasesDoneIds = []; changed = true; }
    if (m.mediaMetaV !== MEDIA_META_V) { // донести нові стартові дані на наявний стан
      (App.data.defaultMedia && App.data.defaultMedia.films || []).forEach(function (dd) {
        const f = m.films.find(function (x) { return x.id === dd.id; });
        if (f && !f.year && dd.year) f.year = dd.year;
      });
      // v2: долити нові фрази з добірки (за id; видалені вручну не нав'язуються повторно)
      const have = {};
      m.phrases.forEach(function (p) { have[p.id] = true; });
      (App.data.defaultMedia && App.data.defaultMedia.phrases || []).forEach(function (dp) {
        if (!have[dp.id] && (!m.mediaMetaV || m.mediaMetaV < 2)) m.phrases.push({ id: dp.id, text: dp.text });
      });
      m.mediaMetaV = MEDIA_META_V; changed = true;
    }
    if (changed) App.store.save();
    const save = function () { App.store.save(); };

    let tab = App.store.pref("media.tab", "films");
    let recCycle = 0;
    const content = h("div");

    /* ---------- Фільми ---------- */
    function renderFilms() {
      content.innerHTML = "";
      const listEl = h("div", { class: "media-list" });
      function filmRow(f) {
        const cb = h("input", { type: "checkbox" }); cb.checked = !!f.watched;
        const titleIn = h("input", { class: "media-title" + (f.watched ? " done" : ""), value: f.title || "" });
        titleIn.addEventListener("input", function () { f.title = titleIn.value; });
        titleIn.addEventListener("change", save);
        cb.addEventListener("change", function () { f.watched = cb.checked; titleIn.classList.toggle("done", f.watched); save(); });
        const row = h("div", { class: "media-item" }, cb, titleIn,
          h("button", { class: "btn-mini", title: "Видалити", onclick: function () { const i = m.films.indexOf(f); if (i >= 0) m.films.splice(i, 1); row.remove(); save(); } }, "✕"));
        return row;
      }
      m.films.slice().sort(function (a, b) { return (a.watched ? 1 : 0) - (b.watched ? 1 : 0); }).forEach(function (f) { listEl.append(filmRow(f)); });
      const addTitle = h("input", { class: "media-add", placeholder: "+ фільм / серіал…" });
      function addFilm() { const t = addTitle.value.trim(); if (!t) return; m.films.push({ id: uid("f"), title: t, watched: false }); addTitle.value = ""; save(); renderFilms(); }
      addTitle.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addFilm(); } });

      const pool = App.data.filmRecs || [];
      const recEl = h("div", { class: "media-list" });
      if (pool.length) {
        const start = ((isoWeek(new Date()) + recCycle) * 7) % pool.length;
        for (let i = 0; i < Math.min(7, pool.length); i++) {
          const r = pool[(start + i) % pool.length];
          recEl.append(h("div", { class: "media-item" },
            h("span", { class: "media-title", style: "flex:1" }, r.title + (r.year ? " (" + r.year + ")" : "")),
            h("button", {
              class: "btn small", title: "Додати у «хочу подивитись»",
              onclick: function () {
                const full = r.title + (r.year ? " (" + r.year + ")" : "");
                if (m.films.some(function (x) { return (x.title || "").toLowerCase() === full.toLowerCase(); })) { App.ui.toast("Уже в списку", "info"); return; }
                m.films.push({ id: uid("f"), title: full, watched: false }); save(); App.ui.toast("Додано ✓"); renderFilms();
              },
            }, "+ у список")));
        }
      }

      content.append(
        h("div", { class: "card fade-in" },
          h("h2", null, "🎬 Хочу подивитись"),
          m.films.length ? listEl : h("div", { class: "muted small" }, "Порожньо — додай нижче."),
          h("div", { class: "row", style: "gap:8px;margin-top:10px" }, addTitle, h("button", { class: "btn green small", onclick: addFilm }, "Додати"))),
        h("div", { class: "card fade-in" },
          h("div", { class: "row between", style: "margin-bottom:8px" },
            h("h2", { style: "margin:0" }, "✨ Рекомендації тижня"),
            h("button", { class: "btn ghost small", onclick: function () { recCycle++; renderFilms(); } }, "🔄 наступні 7")),
          recEl,
          h("div", { class: "tiny muted", style: "margin-top:8px" }, "Ротаційна добірка (7 щотижня). Не «свіжі релізи» наживо — доливай батчами.")));
    }

    /* ---------- Книги (2 секції) ---------- */
    function renderBooks() {
      content.innerHTML = "";
      function bookRow(b) {
        const cb = h("input", { type: "checkbox" }); cb.checked = !!b.read;
        const titleIn = h("input", { class: "media-title" + (b.read ? " done" : ""), value: b.title || "" });
        titleIn.addEventListener("input", function () { b.title = titleIn.value; });
        titleIn.addEventListener("change", save);
        cb.addEventListener("change", function () { b.read = cb.checked; save(); renderBooks(); }); // переносимо між секціями
        return h("div", { class: "media-item" }, cb, titleIn,
          h("button", { class: "btn-mini", title: "Видалити", onclick: function () { const i = m.books.indexOf(b); if (i >= 0) m.books.splice(i, 1); save(); renderBooks(); } }, "✕"));
      }
      const unread = m.books.filter(function (b) { return !b.read; });
      const read = m.books.filter(function (b) { return b.read; });
      const unreadEl = h("div", { class: "media-list" }); unread.forEach(function (b) { unreadEl.append(bookRow(b)); });
      const readEl = h("div", { class: "media-list" }); read.forEach(function (b) { readEl.append(bookRow(b)); });
      const addIn = h("input", { class: "media-add", placeholder: "+ книга…" });
      function addBook() { const t = addIn.value.trim(); if (!t) return; m.books.push({ id: uid("b"), title: t, read: false }); addIn.value = ""; save(); renderBooks(); }
      addIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addBook(); } });

      content.append(
        h("div", { class: "card fade-in" },
          h("div", { class: "row between", style: "margin-bottom:8px" }, h("h2", { style: "margin:0" }, "📚 Хочу прочитати"), h("span", { class: "tiny muted" }, unread.length + " книг")),
          unread.length ? unreadEl : h("div", { class: "muted small" }, "Усе прочитано 🎉"),
          h("div", { class: "row", style: "gap:8px;margin-top:10px" }, addIn, h("button", { class: "btn green small", onclick: addBook }, "Додати"))),
        read.length ? h("div", { class: "card fade-in" },
          h("div", { class: "row between", style: "margin-bottom:8px" }, h("h2", { style: "margin:0" }, "✓ Прочитано"), h("span", { class: "tiny muted" }, read.length + " книг")),
          readEl) : null);
    }

    /* ---------- Фрази ---------- */
    let session = null;
    function renderPhrases() {
      content.innerHTML = "";
      const practiceBox = h("div");
      const manageBox = h("div", { style: "display:none;margin-top:10px" });
      let manageShown = false;

      function renderSession() {
        practiceBox.innerHTML = "";
        if (!session) {
          practiceBox.append(h("div", { class: "row center", style: "padding:8px 0" },
            h("button", { class: "btn green big", onclick: function () { startSession(); } }, "🎲 Дати 8 фраз")));
          return;
        }
        const rows = h("div", { class: "phrase-list" });
        const zarBtn = h("button", { class: "btn green", onclick: function () { completeSession(); } }, "✓ Зарахувати");
        session.phrases.forEach(function (p) {
          const cb = h("input", { type: "checkbox" }); cb.checked = session.checked.has(p.id);
          const textIn = h("textarea", { class: "phrase-text-in" + (session.checked.has(p.id) ? " done" : ""), rows: 1 }, p.text || "");
          textIn.addEventListener("input", function () { p.text = textIn.value; autogrow(textIn); }); // редагуємо корпус
          textIn.addEventListener("change", save);
          cb.addEventListener("change", function () { if (cb.checked) session.checked.add(p.id); else session.checked.delete(p.id); textIn.classList.toggle("done", cb.checked); zarBtn.disabled = session.checked.size < session.phrases.length; });
          rows.append(h("div", { class: "phrase-row" }, cb, textIn));
        });
        zarBtn.disabled = session.checked.size < session.phrases.length;
        practiceBox.append(rows,
          h("div", { class: "row center", style: "gap:12px;margin-top:14px" },
            h("button", { class: "btn ghost small", onclick: function () { session = null; renderSession(); } }, "Скасувати"), zarBtn));
        Array.prototype.forEach.call(rows.querySelectorAll("textarea"), autogrow);
      }
      function startSession() {
        if (!m.phrases.length) { App.ui.toast("Немає фраз", "info"); return; }
        session = { phrases: App.ui.shuffle(m.phrases).slice(0, Math.min(8, m.phrases.length)), checked: new Set() };
        renderSession();
      }
      function completeSession() {
        m.phrasesTotalDone = (m.phrasesTotalDone || 0) + session.phrases.length;
        const doneSet = new Set(m.phrasesDoneIds);
        session.phrases.forEach(function (p) { doneSet.add(p.id); });
        m.phrasesDoneIds = Array.from(doneSet);
        App.store.addTime("phrases", 10 * 60000); // час іде в денний облік (тут не показуємо)
        save();
        App.ui.toast("🗣 Зараховано! Пройдено " + session.phrases.length + " фраз");
        session = null;
        renderPhrases();
      }
      function renderManage() {
        manageBox.innerHTML = "";
        const addIn = h("input", { class: "media-add", placeholder: "+ нова фраза…" });
        function addPhrase() { const t = addIn.value.trim(); if (!t) return; m.phrases.push({ id: uid("p"), text: t }); addIn.value = ""; save(); renderPhrases(); }
        addIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addPhrase(); } });
        const list = h("div", { class: "phrase-manage" });
        m.phrases.forEach(function (p) {
          const textIn = h("textarea", { class: "phrase-text-in", rows: 1 }, p.text || "");
          textIn.addEventListener("input", function () { p.text = textIn.value; autogrow(textIn); });
          textIn.addEventListener("change", save);
          const row = h("div", { class: "media-item phrase-manage-row" }, textIn,
            h("button", { class: "btn-mini", title: "Видалити", onclick: function () { const i = m.phrases.indexOf(p); if (i >= 0) m.phrases.splice(i, 1); row.remove(); save(); } }, "✕"));
          list.append(row);
        });
        manageBox.append(h("div", { class: "row", style: "gap:8px;margin-bottom:8px" }, addIn, h("button", { class: "btn small", onclick: addPhrase }, "Додати")), list);
        Array.prototype.forEach.call(list.querySelectorAll("textarea"), autogrow);
      }

      content.append(
        h("div", { class: "card fade-in" },
          h("h2", null, "🗣 Практика фраз"),
          h("div", { class: "stat-cards", style: "margin:10px 0" },
            App.ui.statCard(String(m.phrasesTotalDone || 0), "пройдено всього"),
            App.ui.statCard(String((m.phrasesDoneIds || []).length), "унікальних пройдено"),
            App.ui.statCard(String(m.phrases.length), "фраз у базі")),
          h("div", { class: "tiny muted", style: "margin-bottom:10px" }, "Відмічай усі 8 галочками — і сесія зарахується. Текст фрази можна тут-таки відредагувати."),
          practiceBox),
        h("div", { class: "card fade-in" },
          h("button", { class: "btn ghost small", onclick: function () { manageShown = !manageShown; manageBox.style.display = manageShown ? "" : "none"; if (manageShown) renderManage(); } }, "⚙️ Керувати фразами (" + m.phrases.length + ")"),
          manageBox));
      renderSession();
    }

    function renderTab() { if (tab === "films") renderFilms(); else if (tab === "books") renderBooks(); else renderPhrases(); }

    const IDS = ["films", "books", "phrases"];
    const tabs = App.ui.tabBar(
      [{ id: "films", label: "🎬 Фільми" }, { id: "books", label: "📚 Книги" }, { id: "phrases", label: "🗣 Фрази" }],
      tab,
      function (id) { tab = id; App.store.setPref("media.tab", id); Array.prototype.forEach.call(tabs.children, function (el, i) { el.classList.toggle("active", IDS[i] === tab); }); renderTab(); });

    root.append(
      h("h1", { class: "page-title" }, "🎬 Медіа"),
      h("div", { class: "page-sub" }, "Фільми й серіали, книги та фрази для практики."),
      tabs, content);
    renderTab();
    return null;
  }

  return { id: "media", title: "Медіа", icon: "🎬", render: render };
})();
