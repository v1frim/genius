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
      h("div", { id: "totalTime", class: "total-time" }, "⏱ всього сьогодні: " + App.ui.fmtClock(App.store.timeToday() / 1000)),
      h("div", null, "тренуйся щодня"));
  };

  function refreshTotalTime() {
    const el = document.getElementById("totalTime");
    if (el) el.textContent = "⏱ всього сьогодні: " + App.ui.fmtClock(App.store.timeToday() / 1000);
  }

  /* ---- облік часу, приділеного розділу за сьогодні ---- */
  let timeInt = null;
  let lastActivity = Date.now();
  let saveTick = 0;
  ["mousemove", "keydown", "mousedown", "touchstart", "wheel"].forEach(function (ev) {
    document.addEventListener(ev, function () { lastActivity = Date.now(); }, { passive: true });
  });
  // пасивні розділи (RSVP, медитація) пінгують активність, щоб лічильник часу не засинав
  App.markActive = function () { lastActivity = Date.now(); };
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
    const ms = App.store.timeToday(currentId());
    timeBadge().textContent = "⏱ сьогодні в розділі: " + App.ui.fmtClock(ms / 1000);
  }

  function startSectionTimer() {
    if (timeInt) clearInterval(timeInt);
    renderTimeBadge();
    timeInt = setInterval(function () {
      if (document.hidden) return;
      if (Date.now() - lastActivity > 120000) return; // простій > 2 хв — не рахуємо
      App.store.addTime(currentId(), 1000);
      renderTimeBadge();
      refreshTotalTime();
      if (++saveTick % 8 === 0) App.store.save(); // зберігаємо раз на ~8 с
    }, 1000);
  }

  function navigate() {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    App.primaryAction = null; // модуль перевизначить, якщо підтримує Space-старт
    App.store.rollover();
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

  App.store.load();
  window.addEventListener("hashchange", navigate);
  navigate();
})();
