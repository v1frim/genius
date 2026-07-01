/* Медіа: фільми/серіали, книги, фрази (практика). 3 під-вкладки.
   Стан: state.media = { films:[{id,title,watched}], books:[{id,title,read}],
   phrases:[{id,text}], phraseSessions, init }. Сідається з App.data.defaultMedia. */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.media = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };
  function uid(p) { return (p || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  /* ISO-номер тижня — для щотижневої ротації рекомендацій */
  function isoWeek(d) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 3);
    const firstThu = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round((t - firstThu) / 604800000);
  }

  function render(root) {
    const st = App.store.state;
    if (!st.media || typeof st.media !== "object") st.media = {};
    const m = st.media;
    if (!m.init) {
      const d = App.data.defaultMedia || { films: [], books: [], phrases: [] };
      m.films = JSON.parse(JSON.stringify(d.films || []));
      m.books = JSON.parse(JSON.stringify(d.books || []));
      m.phrases = JSON.parse(JSON.stringify(d.phrases || []));
      m.phraseSessions = 0;
      m.init = true;
      App.store.save();
    }
    m.films = m.films || []; m.books = m.books || []; m.phrases = m.phrases || [];
    m.phraseSessions = m.phraseSessions || 0;
    const save = function () { App.store.save(); };

    let tab = App.store.pref("media.tab", "films");
    let recCycle = 0;
    const content = h("div");

    /* спільний рядок: чекбокс + редагований заголовок + видалення */
    function checkRow(obj, doneKey, cls, onDel) {
      const cb = h("input", { type: "checkbox" }); cb.checked = !!obj[doneKey];
      const titleIn = h("input", { class: "media-title" + (obj[doneKey] ? " done" : ""), value: obj.title || "" });
      titleIn.addEventListener("input", function () { obj.title = titleIn.value; });
      titleIn.addEventListener("change", save);
      cb.addEventListener("change", function () { obj[doneKey] = cb.checked; titleIn.classList.toggle("done", obj[doneKey]); save(); if (onDel) onDel(); });
      const row = h("div", { class: "media-item" }, cb, titleIn,
        h("button", { class: "btn-mini", title: "Видалити", onclick: function () { row.remove(); onDel(true); } }, "✕"));
      return row;
    }

    /* ---------- Фільми ---------- */
    function renderFilms() {
      content.innerHTML = "";
      const listEl = h("div", { class: "media-list" });
      m.films.slice().sort(function (a, b) { return (a.watched ? 1 : 0) - (b.watched ? 1 : 0); }).forEach(function (f) {
        listEl.append(checkRow(f, "watched", null, function (del) { if (del) { const i = m.films.indexOf(f); if (i >= 0) m.films.splice(i, 1); } save(); }));
      });
      const addIn = h("input", { class: "media-add", placeholder: "+ фільм / серіал…" });
      function addFilm() { const t = addIn.value.trim(); if (!t) return; m.films.push({ id: uid("f"), title: t, watched: false }); addIn.value = ""; save(); renderFilms(); }
      addIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addFilm(); } });

      const pool = App.data.filmRecs || [];
      const recEl = h("div", { class: "media-list" });
      if (pool.length) {
        const start = ((isoWeek(new Date()) + recCycle) * 7) % pool.length;
        for (let i = 0; i < Math.min(7, pool.length); i++) {
          const title = pool[(start + i) % pool.length];
          recEl.append(h("div", { class: "media-item" },
            h("span", { class: "media-title", style: "flex:1" }, title),
            h("button", {
              class: "btn small", title: "Додати у «хочу подивитись»",
              onclick: function () {
                if (m.films.some(function (x) { return (x.title || "").toLowerCase() === title.toLowerCase(); })) { App.ui.toast("Уже в списку", "info"); return; }
                m.films.push({ id: uid("f"), title: title, watched: false }); save(); App.ui.toast("Додано ✓"); renderFilms();
              },
            }, "+ у список")));
        }
      }

      content.append(
        h("div", { class: "card fade-in" },
          h("h2", null, "🎬 Хочу подивитись"),
          m.films.length ? listEl : h("div", { class: "muted small" }, "Порожньо — додай нижче."),
          h("div", { class: "row", style: "gap:8px;margin-top:10px" }, addIn, h("button", { class: "btn green small", onclick: addFilm }, "Додати"))),
        h("div", { class: "card fade-in" },
          h("div", { class: "row between", style: "margin-bottom:8px" },
            h("h2", { style: "margin:0" }, "✨ Рекомендації тижня"),
            h("button", { class: "btn ghost small", onclick: function () { recCycle++; renderFilms(); } }, "🔄 наступні 7")),
          recEl,
          h("div", { class: "tiny muted", style: "margin-top:8px" }, "Ротаційна добірка (7 щотижня). Не «свіжі релізи» наживо — доливай батчами, і пул оновиться.")));
    }

    /* ---------- Книги ---------- */
    function renderBooks() {
      content.innerHTML = "";
      const countEl = h("span", { class: "tiny muted" });
      function updateCount() { countEl.textContent = "прочитано " + m.books.filter(function (b) { return b.read; }).length + " / " + m.books.length; }
      const listEl = h("div", { class: "media-list" });
      m.books.slice().sort(function (a, b) { return (a.read ? 1 : 0) - (b.read ? 1 : 0); }).forEach(function (b) {
        listEl.append(checkRow(b, "read", null, function (del) { if (del) { const i = m.books.indexOf(b); if (i >= 0) m.books.splice(i, 1); } updateCount(); save(); }));
      });
      updateCount();
      const addIn = h("input", { class: "media-add", placeholder: "+ книга…" });
      function addBook() { const t = addIn.value.trim(); if (!t) return; m.books.push({ id: uid("b"), title: t, read: false }); addIn.value = ""; save(); renderBooks(); }
      addIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addBook(); } });
      content.append(h("div", { class: "card fade-in" },
        h("div", { class: "row between", style: "margin-bottom:8px" }, h("h2", { style: "margin:0" }, "📚 Книги"), countEl),
        m.books.length ? listEl : h("div", { class: "muted small" }, "Порожньо — додай нижче."),
        h("div", { class: "row", style: "gap:8px;margin-top:10px" }, addIn, h("button", { class: "btn green small", onclick: addBook }, "Додати"))));
    }

    /* ---------- Фрази ---------- */
    let session = null;
    function renderPhrases() {
      content.innerHTML = "";
      const todayMin = Math.round((App.store.timeToday("phrases") || 0) / 60000);
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
        const zarBtn = h("button", { class: "btn green", onclick: function () { completeSession(); } }, "✓ Зарахувати +10 хв");
        session.phrases.forEach(function (p) {
          const cb = h("input", { type: "checkbox" }); cb.checked = session.checked.has(p.id);
          const textEl = h("span", { class: "phrase-text" + (session.checked.has(p.id) ? " done" : "") }, p.text);
          cb.addEventListener("change", function () {
            if (cb.checked) session.checked.add(p.id); else session.checked.delete(p.id);
            textEl.classList.toggle("done", cb.checked);
            zarBtn.disabled = session.checked.size < session.phrases.length;
          });
          rows.append(h("label", { class: "phrase-row" }, cb, textEl));
        });
        zarBtn.disabled = session.checked.size < session.phrases.length;
        practiceBox.append(rows,
          h("div", { class: "row center", style: "gap:12px;margin-top:14px" },
            h("button", { class: "btn ghost small", onclick: function () { session = null; renderSession(); } }, "Скасувати"), zarBtn));
      }
      function startSession() {
        if (!m.phrases.length) { App.ui.toast("Немає фраз", "info"); return; }
        session = { phrases: App.ui.shuffle(m.phrases).slice(0, Math.min(8, m.phrases.length)), checked: new Set() };
        renderSession();
      }
      function completeSession() {
        App.store.addTime("phrases", 10 * 60000);
        m.phraseSessions = (m.phraseSessions || 0) + 1;
        save();
        App.ui.toast("🗣 +10 хв практики зараховано!");
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
          const row = h("div", { class: "media-item" },
            h("span", { class: "media-title", style: "flex:1" }, p.text),
            h("button", { class: "btn-mini", title: "Видалити", onclick: function () { const i = m.phrases.indexOf(p); if (i >= 0) m.phrases.splice(i, 1); row.remove(); save(); } }, "✕"));
          list.append(row);
        });
        manageBox.append(h("div", { class: "row", style: "gap:8px;margin-bottom:8px" }, addIn, h("button", { class: "btn small", onclick: addPhrase }, "Додати")), list);
      }

      content.append(
        h("div", { class: "card fade-in" },
          h("h2", null, "🗣 Практика фраз"),
          h("div", { class: "stat-cards", style: "margin:10px 0" },
            App.ui.statCard(String(m.phraseSessions || 0), "сесій усього"),
            App.ui.statCard(todayMin + " хв", "практика сьогодні"),
            App.ui.statCard(String(m.phrases.length), "фраз у базі")),
          h("div", { class: "tiny muted", style: "margin-bottom:10px" }, "Відмічай усі 8 галочками — тоді зарахується +10 хв практики."),
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
      function (id) {
        tab = id; App.store.setPref("media.tab", id);
        Array.prototype.forEach.call(tabs.children, function (el, i) { el.classList.toggle("active", IDS[i] === tab); });
        renderTab();
      });

    root.append(
      h("h1", { class: "page-title" }, "🎬 Медіа"),
      h("div", { class: "page-sub" }, "Фільми й серіали, книги та фрази для практики."),
      tabs, content);

    renderTab();
    return null;
  }

  return { id: "media", title: "Медіа", icon: "🎬", render: render };
})();
