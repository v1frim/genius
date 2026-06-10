/* Роутер і навігація */
(function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const MODULES = [
    App.modules.dashboard,
    App.modules.schulte,
    App.modules.reading,
    App.modules.typing,
    App.modules.twisters,
    App.modules.arithmetic,
    App.modules.memory,
    App.modules.meditation,
    App.modules.goals,
    App.modules.settings,
  ];

  let cleanup = null;

  function currentId() {
    const m = location.hash.match(/^#\/([\w-]*)/);
    const id = m && m[1] ? m[1] : "dashboard";
    return MODULES.some(function (mod) { return mod.id === id; }) ? id : "dashboard";
  }

  function renderNav() {
    const nav = document.getElementById("nav");
    nav.innerHTML = "";
    const active = currentId();
    MODULES.forEach(function (mod) {
      nav.append(h("a", {
        class: "nav-item" + (mod.id === active ? " active" : ""),
        href: "#/" + (mod.id === "dashboard" ? "" : mod.id),
      },
        h("span", { class: "ico" }, mod.icon),
        h("span", { class: "label" }, mod.title)));
    });
  }

  App.renderSidebarFooter = function () {
    const el = document.getElementById("sidebarFooter");
    el.innerHTML = "";
    const streak = App.modules.dashboard.calcStreak();
    const pct = App.modules.dashboard.todayPct();
    el.append(
      h("div", { class: "streak-mini" }, "🔥 " + streak + " дн. · " + pct + "%"),
      h("div", null, "тренуйся щодня"));
  };

  function navigate() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    App.store.rollover();
    const id = currentId();
    const mod = MODULES.find(function (m) { return m.id === id; });
    const view = document.getElementById("view");
    view.innerHTML = "";
    renderNav();
    cleanup = mod.render(view) || null;
    App.renderSidebarFooter();
    window.scrollTo(0, 0);
  }

  App.store.load();
  window.addEventListener("hashchange", navigate);
  navigate();
})();
