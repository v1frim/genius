/* Головна: щоденні/щотижневі задачі, стрік, швидкий доступ, рекорди */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.dashboard = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const WEEKDAYS = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTHS = ["січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"];
  const PASS_PCT = 70; // день зараховано, якщо виконано стільки % щоденних задач

  let editMode = false;

  function dailyTasks() { return App.store.state.tasks.filter(function (t) { return t.period === "daily"; }); }
  function weeklyTasks() { return App.store.state.tasks.filter(function (t) { return t.period === "weekly"; }); }

  function taskKey(t) { return (t.period === "daily" ? "d:" : "w:") + t.id; }

  /* Автозарахування задач за реальною грою. Ключ — id стандартної задачі;
     умова рахується із сьогоднішніх (чи тижневих) записів/часу. */
  function recsToday(cat) {
    const today = App.store.todayStr();
    return App.store.records(cat).filter(function (r) { return r.date === today; });
  }
  function recsThisWeek(cat) {
    const mon = App.store.mondayStr();
    return App.store.records(cat).filter(function (r) { return r.date >= mon; });
  }
  const TASK_TRACKERS = {
    schulte: function () { const n = recsToday("schulte").filter(function (r) { return r.size === 5; }).length; return { done: n >= 3, sub: n + "/3" }; },
    rsvp: function () { const m = Math.floor(App.store.timeToday("reading") / 60000); return { done: m >= 10, sub: m + "/10 хв" }; },
    typing: function () { const n = recsToday("typing").filter(function (r) { return (r.source || "ua") === "ua"; }).length; return { done: n >= 3, sub: n + "/3" }; },
    twisters: function () { const n = App.store.state.twisterByDay[App.store.todayStr()] || 0; return { done: n >= 5, sub: n + "/5" }; },
    arith: function () { const n = recsToday("arithmetic").filter(function (r) { return r.mode === "s60"; }).length; return { done: n >= 1, sub: n + "/1" }; },
    memory: function () { const n = recsToday("digitSpan").length; return { done: n >= 1, sub: n ? "✓" : "0/1" }; },
    med: function () { const m = Math.floor(App.store.timeToday("meditation") / 60000); return { done: m >= 15, sub: m + "/15 хв" }; },
    rtest: function () { const n = recsThisWeek("reading").filter(function (r) { return r.kind === "test"; }).length; return { done: n >= 1, sub: n ? "✓" : "0/1" }; },
    longmed: function () { const n = recsThisWeek("meditation").filter(function (r) { return (r.minutes || 0) >= 45; }).length; return { done: n >= 1, sub: n ? "✓" : "0/1" }; },
    // Англійська: «плани» Oxford 1000 зі спільного localStorage (App.oxford). 1 план = 4 бали.
    engPlanDay: function () { const pl = App.oxford ? App.oxford.plansToday() : 0; return { done: pl >= 2, sub: Math.min(pl, 2) + "/2" }; },
    engPlanWeek: function () { const pl = App.oxford ? App.oxford.plansThisWeek() : 0; return { done: pl >= 14, sub: Math.min(pl, 14) + "/14" }; },
  };
  function taskAuto(t) { const fn = TASK_TRACKERS[t.id]; return fn ? fn() : null; }
  function taskDone(t) {
    const a = taskAuto(t);
    return (a && a.done) || !!App.store.state.taskState[taskKey(t)];
  }
  function syncAutoTasks() {
    const st = App.store.state;
    if (!st || !st.tasks) return;
    let changed = false;
    st.tasks.forEach(function (t) {
      const a = taskAuto(t);
      if (a && a.done && !st.taskState[taskKey(t)]) { st.taskState[taskKey(t)] = true; changed = true; }
    });
    if (changed) App.store.save();
  }

  function todayPct() {
    const tasks = dailyTasks();
    if (!tasks.length) return 0;
    const done = tasks.filter(taskDone).length;
    return Math.round(done / tasks.length * 100);
  }

  function calcStreak() {
    const hist = {};
    App.store.state.taskHistory.forEach(function (e) { hist[e.date] = e.pct; });
    let streak = 0;
    const d = new Date();
    if (todayPct() >= PASS_PCT) streak++; // сьогодні вже зараховано
    d.setDate(d.getDate() - 1);
    for (let i = 0; i < 999; i++) {
      const key = App.store.dateStr(d);
      if (hist[key] >= PASS_PCT) { streak++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return streak;
  }

  function renderTaskRow(t, rerender) {
    const st = App.store.state;
    const key = taskKey(t);
    const auto = taskAuto(t);
    const done = auto ? (auto.done || !!st.taskState[key]) : !!st.taskState[key];
    const cb = h("input", { type: "checkbox" });
    cb.checked = done;
    if (auto) {
      cb.disabled = true;
      cb.title = "Відмічається автоматично за твоєю грою";
    } else {
      cb.addEventListener("change", function () {
        if (cb.checked) st.taskState[key] = true;
        else delete st.taskState[key];
        App.store.save();
        rerender();
      });
    }
    const kids = [
      cb,
      h("span", null, t.emoji || "•"),
      h("span", { class: "t-title" }, t.title),
    ];
    if (auto) kids.push(h("span", { class: "badge auto", title: "Зараховується грою автоматично" }, auto.done ? "авто ✓" : "авто " + auto.sub));
    if (t.link) {
      const external = t.link.indexOf("http") === 0;
      kids.push(h("a", {
        class: "t-link",
        href: t.link,
        target: external ? "_blank" : null,
        rel: external ? "noopener" : null,
        title: external ? "Відкрити сайт" : "Перейти до тренажера",
      }, external ? "🔗" : "➜"));
    }
    if (editMode) {
      kids.push(h("button", {
        class: "t-del", title: "Видалити задачу",
        onclick: function () {
          if (!confirm("Видалити задачу «" + t.title + "»?")) return;
          st.tasks = st.tasks.filter(function (x) { return x !== t; });
          delete st.taskState[key];
          App.store.save();
          rerender();
        },
      }, "✕"));
    }
    return h("div", { class: "task-row" + (done ? " done" : "") }, kids);
  }

  function renderAddForm(rerender) {
    const titleIn = h("input", { type: "text", placeholder: "Нова задача…", style: "flex:1;min-width:180px" });
    const emojiIn = h("input", { type: "text", placeholder: "🙂", style: "width:56px;text-align:center" });
    const periodSel = h("select", null,
      h("option", { value: "daily" }, "Щодня"),
      h("option", { value: "weekly" }, "Щотижня"));
    return h("div", { class: "row", style: "margin-top:10px" },
      emojiIn, titleIn, periodSel,
      h("button", {
        class: "btn small green",
        onclick: function () {
          const title = titleIn.value.trim();
          if (!title) { App.ui.toast("Введи назву задачі", "info"); return; }
          App.store.state.tasks.push({
            id: "u" + Date.now(),
            emoji: emojiIn.value.trim() || "🔸",
            title: title,
            period: periodSel.value,
          });
          App.store.save();
          rerender();
        },
      }, "Додати"));
  }

  function renderHistory() {
    const hist = App.store.state.taskHistory.slice(-13);
    const bars = h("div", { class: "history-bars" });
    hist.forEach(function (e) {
      const fill = h("div", { class: "bar-fill", title: e.date + ": " + e.pct + "%" });
      fill.style.height = Math.max(4, e.pct) + "%";
      bars.append(h("div", { class: "hb" + (e.pct >= PASS_PCT ? " good" : "") },
        fill, h("span", { class: "hb-lbl" }, App.ui.fmtDate(e.date))));
    });
    const pct = todayPct();
    const todayFill = h("div", { class: "bar-fill", title: "Сьогодні: " + pct + "%" });
    todayFill.style.height = Math.max(4, pct) + "%";
    bars.append(h("div", { class: "hb" + (pct >= PASS_PCT ? " good" : "") },
      todayFill, h("span", { class: "hb-lbl" }, "сьогодні")));
    return bars;
  }

  function bestSummaries() {
    const s = App.store;
    const items = [];
    const sch = s.records("schulte").filter(function (r) { return r.size === 5 && r.mode === ""; });
    if (sch.length) {
      let best = null;
      sch.forEach(function (r) { if (best === null || r.timeMs < best) best = r.timeMs; });
      items.push({ ico: "🔢", title: "Шульте 5×5", sub: "рекорд " + App.ui.fmtMs(best), href: "#/schulte" });
    } else items.push({ ico: "🔢", title: "Шульте", sub: "почни з 5×5", href: "#/schulte" });

    const readBest = s.best("reading", "wpm", "max");
    items.push({ ico: "📖", title: "Швидкочитання", sub: readBest ? "рекорд " + readBest + " сл/хв" : "ціль 400 сл/хв", href: "#/reading" });

    const typeBest = s.best("typing", "cpm", "max");
    items.push({ ico: "⌨️", title: "Друк", sub: typeBest ? "рекорд " + typeBest + " зн/хв" : "ціль 400 зн/хв", href: "#/typing" });

    const arithBest = s.best("arithmetic", "correct", "max");
    items.push({ ico: "➗", title: "Арифметика", sub: arithBest ? "рекорд " + arithBest + " за спринт" : "спринт 60 с", href: "#/arithmetic" });

    const spanBest = s.best("digitSpan", "best", "max");
    items.push({ ico: "🧠", title: "Пам'ять", sub: spanBest ? "діапазон " + spanBest + " цифр" : "виміряй діапазон", href: "#/memory" });

    const medCount = s.records("meditation").length;
    items.push({ ico: "🧘", title: "Медитація", sub: medCount ? medCount + " сесій у журналі" : "почни журнал", href: "#/meditation" });
    return items;
  }

  function render(root) {
    const st = App.store.state;

    function rerender() {
      root.innerHTML = "";
      build();
      if (App.renderSidebarFooter) App.renderSidebarFooter();
    }

    function build() {
      const now = new Date();
      const pct = todayPct();
      const streak = calcStreak();

      root.append(
        h("div", { class: "day-header fade-in" },
          h("div", null,
            h("h1", { class: "page-title" }, "Сьогодні"),
            h("div", { class: "page-sub", style: "margin-bottom:0" },
              WEEKDAYS[now.getDay()] + ", " + now.getDate() + " " + MONTHS[now.getMonth()] + " " + now.getFullYear())),
          h("div", { class: "spacer" }),
          h("div", { class: "streak-badge" }, h("span", { class: "fire" }, "🔥"), streak + " дн. стрік"),
          h("div", { class: "streak-badge" }, h("span", { class: "fire" }, pct >= PASS_PCT ? "✅" : "📋"), pct + "% дня")
        )
      );

      const dailyCard = h("div", { class: "card" },
        h("div", { class: "row between" },
          h("h2", null, "Щоденні задачі"),
          h("button", {
            class: "btn small ghost",
            onclick: function () { editMode = !editMode; rerender(); },
          }, editMode ? "Готово" : "Редагувати")),
        App.ui.progressBar(pct),
        h("div", { style: "margin-top:10px" }, dailyTasks().map(function (t) { return renderTaskRow(t, rerender); })),
        editMode ? renderAddForm(rerender) : null,
        editMode ? h("div", { class: "row", style: "margin-top:10px" },
          h("button", {
            class: "btn small ghost",
            onclick: function () {
              if (!confirm("Повернути стандартний список задач? Твої власні задачі зникнуть.")) return;
              st.tasks = JSON.parse(JSON.stringify(App.data.defaultTasks));
              st.taskState = {};
              App.store.save();
              rerender();
            },
          }, "Відновити стандартні")) : null
      );

      const weeklyCard = h("div", { class: "card" },
        h("h2", null, "Щотижневі задачі"),
        h("div", null, weeklyTasks().map(function (t) { return renderTaskRow(t, rerender); }))
      );

      root.append(h("div", { class: "grid-2 fade-in" }, dailyCard, weeklyCard));

      root.append(h("div", { class: "card fade-in" },
        h("h2", null, "Останні 14 днів"),
        renderHistory(),
        h("div", { class: "tiny muted", style: "margin-top:8px" },
          "День зараховується у стрік, якщо виконано ≥ " + PASS_PCT + "% щоденних задач.")));

      const quick = h("div", { class: "quick-grid fade-in" });
      bestSummaries().forEach(function (it) {
        quick.append(h("a", { class: "quick-card", href: it.href },
          h("div", { class: "q-ico" }, it.ico),
          h("div", { class: "q-title" }, it.title),
          h("div", { class: "q-sub" }, it.sub)));
      });
      root.append(h("h2", { style: "margin:6px 0 12px" }, "Тренажери"), quick);

      root.append(h("div", { class: "card fade-in", style: "margin-top:18px" },
        h("h2", null, "Зовнішні інструменти"),
        h("div", { class: "row", style: "gap:18px" },
          h("a", { class: "ext", href: "https://www.chess.com/lessons", target: "_blank", rel: "noopener" }, "♟️ Шахи: уроки на chess.com"),
          h("a", { class: "ext", href: "https://www.youtube.com/@charismaoncommand_ru", target: "_blank", rel: "noopener" }, "🎭 Харизма: Charisma on Command"))));
    }

    build();
    return null;
  }

  return { id: "dashboard", title: "Головна", icon: "🏠", render: render, todayPct: todayPct, calcStreak: calcStreak, syncAutoTasks: syncAutoTasks };
})();
