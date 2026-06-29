/* Шахи: облік зіграних партій (з тренером / з реальними гравцями) і тренажерів/задач.
   Граєш на chess.com (зовнішнє) — відмічаєш тут кнопками +/−.
   Дані: state.chess.byDay = { 'YYYY-MM-DD': {trainer, players, puzzles} };
   «всього» = сума по днях. Між пристроями мерджиться як timeByDay (max по дню/категорії). */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.chess = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const CATS = [
    { key: "trainer", emoji: "🤖", label: "Партії з тренером", hint: "Бот, коуч або ШІ-тренер" },
    { key: "players", emoji: "👥", label: "Партії з гравцями", hint: "Реальні суперники" },
    { key: "puzzles", emoji: "🧩", label: "Тренажери й задачі", hint: "Задачі, уроки, вправи" },
  ];

  const LINKS = [
    { url: "https://www.chess.com/home", label: "♟️ chess.com", cls: "green" },
    { url: "https://www.chess.com/play", label: "▶ Грати" },
    { url: "https://www.chess.com/puzzles", label: "🧩 Задачі" },
    { url: "https://www.chess.com/lessons", label: "📚 Уроки" },
  ];

  function store() {
    const st = App.store.state;
    if (!st.chess || typeof st.chess !== "object") st.chess = { byDay: {} };
    if (!st.chess.byDay || typeof st.chess.byDay !== "object") st.chess.byDay = {};
    return st.chess;
  }
  function todayObj() {
    const c = store();
    const d = App.store.todayStr();
    if (!c.byDay[d]) c.byDay[d] = { trainer: 0, players: 0, puzzles: 0 };
    return c.byDay[d];
  }
  function total(cat) {
    const byDay = store().byDay;
    let s = 0;
    Object.keys(byDay).forEach(function (d) { s += (byDay[d] && byDay[d][cat]) || 0; });
    return s;
  }
  function last14() {
    const arr = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const o = store().byDay[App.store.dateStr(dt)];
      arr.push(o ? (o.trainer || 0) + (o.players || 0) + (o.puzzles || 0) : 0);
    }
    return arr;
  }

  function render(root) {
    const todaySpans = {};
    const totalSpans = {};
    const grandEl = h("span", { style: "font-weight:900;color:var(--yellow)" }, "0");
    const sparkHost = h("div", { class: "chess-spark" });

    function refresh() {
      const d = todayObj();
      let grand = 0;
      CATS.forEach(function (c) {
        todaySpans[c.key].textContent = d[c.key] || 0;
        const tot = total(c.key);
        totalSpans[c.key].textContent = tot;
        grand += tot;
      });
      grandEl.textContent = grand;
      sparkHost.innerHTML = "";
      sparkHost.append(App.ui.sparkline(last14(), { color: "#8ed44a", w: 340, h: 56 }));
    }

    function bump(cat, delta) {
      const d = todayObj();
      d[cat] = Math.max(0, (d[cat] || 0) + delta);
      App.store.save();
      refresh();
    }

    const rows = CATS.map(function (c) {
      const todaySpan = h("span", { class: "chess-count" }, "0");
      const totalSpan = h("span", { style: "font-weight:800" }, "0");
      todaySpans[c.key] = todaySpan;
      totalSpans[c.key] = totalSpan;
      return h("div", { class: "chess-row" },
        h("div", { class: "chess-ico" }, c.emoji),
        h("div", { class: "chess-meta" },
          h("div", { class: "chess-label" }, c.label),
          h("div", { class: "tiny muted" }, c.hint, " · всього: ", totalSpan)),
        h("div", { class: "chess-ctrl" },
          h("button", { class: "btn-mini", title: "−1", onclick: function () { bump(c.key, -1); } }, "−"),
          todaySpan,
          h("button", { class: "btn-mini plus", title: "+1", onclick: function () { bump(c.key, 1); } }, "+")));
    });

    root.append(
      h("h1", { class: "page-title" }, "♟️ Шахи"),
      h("div", { class: "page-sub" }, "Облік партій і тренувань. Граєш на chess.com — відмічаєш тут."),
      h("div", { class: "card fade-in" },
        h("div", { class: "row between", style: "margin-bottom:8px" },
          h("h2", null, "Сьогодні"),
          h("div", { class: "tiny muted" }, "усього партій і задач: ", grandEl)),
        rows),
      h("div", { class: "card fade-in" },
        h("h2", null, "Динаміка (останні 14 днів)"),
        sparkHost),
      h("div", { class: "card fade-in" },
        h("h2", null, "Грати та вчитися"),
        h("div", { class: "row", style: "gap:10px;flex-wrap:wrap" },
          LINKS.map(function (l) {
            return h("a", {
              class: "btn small " + (l.cls || "ghost"),
              href: l.url, target: "_blank", rel: "noopener",
            }, l.label);
          }))));

    refresh();
    return null;
  }

  return { id: "chess", title: "Шахи", icon: "♟️", render: render };
})();
