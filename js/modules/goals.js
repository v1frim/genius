/* Цілі: твої + рекомендовані тренером, прогрес, авто-підтягування рекордів */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.goals = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const AUTO = {
    readingBest: function () { return App.modules.reading.bestTestWpm() || 0; },
    typingBest: function () { return App.store.best("typing", "cpm", "max") || 0; },
    medCount: function () { return App.store.records("meditation").length; },
    medLongest: function () { return App.store.best("meditation", "minutes", "max") || 0; },
    spanBest: function () { return App.store.best("digitSpan", "best", "max") || 0; },
    visualBest: function () { return App.store.best("visualMemory", "best", "max") || 0; },
  };

  function autoValue(g) {
    const fn = AUTO[g.auto];
    const v = fn ? fn() : 0;
    if (g.autoMode === "count") return (g.base || 0) + v;
    return Math.max(g.base || 0, v);
  }

  function currentValue(g) {
    if (g.qualitative) return g.done ? 1 : 0;
    if (g.auto) return autoValue(g);
    return g.current || 0;
  }

  function progressPct(g) {
    if (g.qualitative) return g.done ? 100 : 0;
    const cur = currentValue(g);
    if (g.direction === "down") {
      const start = g.start !== undefined ? g.start : cur;
      if (start <= g.target) return cur <= g.target ? 100 : 0;
      return Math.max(0, Math.min(100, (start - cur) / (start - g.target) * 100));
    }
    if (!g.target) return 0;
    return Math.max(0, Math.min(100, cur / g.target * 100));
  }

  function fmtNum(n) {
    if (typeof n !== "number") return String(n);
    return n.toLocaleString("uk-UA");
  }

  function render(root) {
    const goals = App.store.state.goals;

    function rerender() {
      root.innerHTML = "";
      build();
    }

    function goalCard(g) {
      const isRec = g.group === "rec";
      const badges = [];
      if (g.auto) badges.push(h("span", { class: "badge auto", title: "Підтягується з рекордів автоматично" }, "авто"));
      if (isRec) badges.push(h("span", { class: "badge rec", title: "Рекомендація тренера" }, "реком."));

      const head = h("div", { class: "g-head" },
        h("span", { style: "font-size:1.3rem" }, g.emoji || "🎯"),
        h("span", { class: "g-title" }, g.title, " ", badges));

      const bodyKids = [head];

      if (!g.active) {
        // картка-рекомендація
        if (g.note) bodyKids.push(h("div", { class: "g-note" }, g.note));
        bodyKids.push(h("div", { class: "row", style: "margin-top:10px" },
          h("button", {
            class: "btn small green",
            onclick: function () { g.active = true; App.store.save(); rerender(); App.ui.toast("Ціль додано! 🎯"); },
          }, "➕ Взяти в роботу")));
        return h("div", { class: "goal-card" }, bodyKids);
      }

      if (g.qualitative) {
        const cb = h("input", {
          type: "checkbox",
          onchange: function () { g.done = cb.checked; App.store.save(); rerender(); },
        });
        cb.checked = !!g.done;
        head.append(h("span", { class: "spacer" }),
          h("label", { class: "opt" }, cb, g.done ? "Досягнуто! 🏆" : "У процесі"));
      } else {
        const cur = currentValue(g);
        head.append(h("span", { class: "spacer" }),
          h("span", { class: "g-nums" },
            fmtNum(cur) + " / " + fmtNum(g.target) + (g.unit ? " " + g.unit : "")));

        const controls = h("div", { class: "g-controls" });
        if (g.auto) {
          controls.append(h("button", {
            class: "btn-mini", title: "Підправити поточне значення (базу)",
            onclick: function () {
              const raw = prompt("Поточне значення для «" + g.title + "»:", String(cur));
              if (raw === null) return;
              const val = Number(raw.replace(/\s+/g, "").replace(",", "."));
              if (isNaN(val)) { App.ui.toast("Це не число", "info"); return; }
              const fn = AUTO[g.auto];
              const autoV = fn ? fn() : 0;
              g.base = g.autoMode === "count" ? Math.max(0, val - autoV) : val;
              App.store.save(); rerender();
            },
          }, "✎"));
        } else {
          const input = h("input", { type: "text", inputmode: "numeric" });
          input.value = String(g.current || 0);
          input.addEventListener("change", function () {
            const val = Number(input.value.replace(/\s+/g, "").replace(",", "."));
            if (isNaN(val)) { input.value = String(g.current || 0); return; }
            g.current = val;
            App.store.save(); rerender();
          });
          controls.append(
            h("button", {
              class: "btn-mini", onclick: function () {
                g.current = Math.max(0, (g.current || 0) - 1);
                App.store.save(); rerender();
              },
            }, "−"),
            input,
            h("button", {
              class: "btn-mini", onclick: function () {
                g.current = (g.current || 0) + 1;
                App.store.save(); rerender();
              },
            }, "+"));
        }
        head.append(controls);
      }

      const delBtn = h("button", {
        class: "t-del", title: "Видалити ціль", style: "align-self:flex-start",
        onclick: function () {
          if (!confirm("Видалити ціль «" + g.title + "»?")) return;
          const i = goals.indexOf(g);
          if (i >= 0) goals.splice(i, 1);
          App.store.save(); rerender();
        },
      }, "✕");
      head.append(delBtn);

      if (!g.qualitative) bodyKids.push(h("div", { style: "margin-top:10px" }, App.ui.progressBar(progressPct(g))));
      if (g.note) bodyKids.push(h("div", { class: "g-note" }, g.note));

      return h("div", { class: "goal-card" }, bodyKids);
    }

    function build() {
      const active = goals.filter(function (g) { return g.active; });
      const recs = goals.filter(function (g) { return !g.active; });

      const numeric = active.filter(function (g) { return !g.qualitative; });
      const avgPct = numeric.length
        ? Math.round(numeric.reduce(function (s, g) { return s + progressPct(g); }, 0) / numeric.length)
        : 0;
      const doneCount = active.filter(function (g) { return g.qualitative && g.done; }).length;

      root.append(
        h("h1", { class: "page-title" }, "🎯 Цілі"),
        h("div", { class: "page-sub" }, "Рекорди з тренажерів підтягуються сюди автоматично. Решту онови вручну."),
        h("div", { class: "card fade-in" },
          h("div", { class: "row", style: "gap:24px" },
            h("div", null, h("div", { class: "big-num accent" }, avgPct + "%"), h("div", { class: "tiny muted" }, "середній прогрес числових цілей")),
            h("div", null, h("div", { class: "big-num" }, String(active.length)), h("div", { class: "tiny muted" }, "активних цілей")),
            h("div", null, h("div", { class: "big-num yellow" }, String(doneCount)), h("div", { class: "tiny muted" }, "досягнуто віх")),
          ),
          h("div", { style: "margin-top:12px" }, App.ui.progressBar(avgPct))));

      root.append(h("h2", { style: "margin:18px 0 12px" }, "Мої цілі"));
      const list = h("div", { class: "fade-in" });
      active.forEach(function (g) { list.append(goalCard(g)); });
      root.append(list);

      /* нова ціль */
      const emojiIn = h("input", { type: "text", placeholder: "🎯", style: "width:54px;text-align:center" });
      const titleIn = h("input", { type: "text", placeholder: "Назва цілі…", style: "flex:1;min-width:170px" });
      const curIn = h("input", { type: "number", placeholder: "зараз", style: "width:90px" });
      const targetIn = h("input", { type: "number", placeholder: "ціль", style: "width:90px" });
      const unitIn = h("input", { type: "text", placeholder: "одиниця", style: "width:110px" });
      root.append(h("div", { class: "card" },
        h("h3", null, "Додати свою ціль"),
        h("div", { class: "row" },
          emojiIn, titleIn, curIn, targetIn, unitIn,
          h("button", {
            class: "btn small green",
            onclick: function () {
              const title = titleIn.value.trim();
              if (!title) { App.ui.toast("Введи назву цілі", "info"); return; }
              const target = Number(targetIn.value);
              const goal = {
                id: "u" + Date.now(),
                emoji: emojiIn.value.trim() || "🎯",
                title: title,
                group: "mine",
                active: true,
              };
              if (target > 0) {
                goal.target = target;
                goal.current = Number(curIn.value) || 0;
                goal.unit = unitIn.value.trim();
              } else {
                goal.qualitative = true;
                goal.done = false;
              }
              goals.push(goal);
              App.store.save(); rerender();
            },
          }, "Додати")),
        h("div", { class: "tiny muted", style: "margin-top:8px" }, "Без числа-цілі — буде віха з чекбоксом.")));

      if (recs.length) {
        root.append(
          h("h2", { style: "margin:18px 0 4px" }, "💡 Рекомендовано тренером"),
          h("div", { class: "page-sub" }, "Цілі, які найсильніше прокачують «геніальність». Бери в роботу по 1–2 за раз."),
        );
        const recList = h("div", { class: "fade-in" });
        recs.forEach(function (g) { recList.append(goalCard(g)); });
        root.append(recList);
      }
    }

    build();
    return null;
  }

  return { id: "goals", title: "Цілі", icon: "🎯", render: render };
})();
