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
    App.modules.charisma,
    App.modules.chess,
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
      h("div", { id: "totalTime", class: "total-time" }, "⏱ зіграно сьогодні: " + App.ui.fmtClock(App.store.timeToday() / 1000)),
      h("div", null, "тренуйся щодня"));
  };

  function refreshTotalTime() {
    const el = document.getElementById("totalTime");
    if (el) el.textContent = "⏱ зіграно сьогодні: " + App.ui.fmtClock(App.store.timeToday() / 1000);
  }

  /* ---- зіграний час за сьогодні (сума тривалостей завершених ігор/сесій) ----
     Модулі додають час через App.store.addTime(розділ, ms) у момент завершення гри.
     Тут лише періодично оновлюємо бейдж розділу та суму в сайдбарі. */
  const TRAINER_IDS = ["schulte", "reading", "typing", "twisters", "arithmetic", "memory", "meditation"];
  let timeInt = null;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) App.store.save();
  });
  window.addEventListener("beforeunload", function () { App.store.save(); });

  function timeBadge() {
    let el = document.getElementById("sectionTime");
    if (!el) {
      el = h("div", { class: "section-time", id: "sectionTime" });
      const main = document.querySelector(".main");
      if (main) main.prepend(el);
    }
    return el;
  }

  function renderTimeBadge() {
    const badge = timeBadge();
    const id = currentId();
    if (TRAINER_IDS.indexOf(id) < 0) { badge.style.display = "none"; return; }
    badge.style.display = "";
    badge.textContent = "⏱ зіграно сьогодні: " + App.ui.fmtClock(App.store.timeToday(id) / 1000);
  }

  function startSectionTimer() {
    if (timeInt) clearInterval(timeInt);
    renderTimeBadge();
    timeInt = setInterval(function () {
      renderTimeBadge();
      refreshTotalTime();
    }, 1500);
  }

  function navigate() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    App.primaryAction = null; // модуль перевизначить, якщо підтримує Space-старт
    App.store.rollover();
    if (App.modules.dashboard.syncAutoTasks) App.modules.dashboard.syncAutoTasks();
    const id = currentId();
    const mod = MODULES.find(function (m) { return m.id === id; });
    const view = document.getElementById("view");
    view.innerHTML = "";
    renderNav();
    cleanup = mod.render(view) || null;
    App.renderSidebarFooter();
    App.store.save();
    startSectionTimer();
    window.scrollTo(0, 0);
  }

  function cycleSection(dir) {
    const ids = MODULES.map(function (m) { return m.id; });
    let i = ids.indexOf(currentId());
    i = (i + dir + ids.length) % ids.length;
    location.hash = "#/" + (ids[i] === "dashboard" ? "" : ids[i]);
  }

  /* Глобальні клавіші: Tab — перемикання розділів, Space — старт гри */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Tab") {
      e.preventDefault();
      cycleSection(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.code === "Space" || e.key === " ") {
      const t = e.target;
      const tag = (t && t.tagName || "").toLowerCase();
      const editable = tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable);
      if (editable) return; // у полях пробіл лишається пробілом
      if (typeof App.primaryAction === "function") {
        const acted = App.primaryAction();
        e.preventDefault(); // на сторінці гри Space не гортає сторінку
        // якщо щойно стартували — не даємо цьому ж натисканню одразу спрацювати як пауза
        if (acted) e.stopImmediatePropagation();
      }
    }
  });

  App.rerender = navigate; // дає змогу хмарній синхронізації перемалювати поточний екран
  App.store.load();
  window.addEventListener("hashchange", navigate);
  navigate();
})();
