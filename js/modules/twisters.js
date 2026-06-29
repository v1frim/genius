/* Скоромовки: колекція + генератор випадкових, лічильник практики */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.twisters = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const DIFFS = [
    { id: 0, label: "Всі" },
    { id: 1, label: "Легкі" },
    { id: 2, label: "Середні" },
    { id: 3, label: "Складні" },
  ];

  function generateTwister() {
    const bank = App.ui.rnd(App.data.twisterBanks);
    const tpl = App.ui.rndInt(1, 3);
    const name = App.ui.rnd(bank.names);
    const verb = App.ui.rnd(bank.verbs);
    const obj = App.ui.rnd(bank.objects);
    const place = App.ui.rnd(bank.places);
    let s;
    if (tpl === 1) {
      s = name + " " + verb + " " + obj + " " + place + ".";
    } else if (tpl === 2) {
      let name2 = App.ui.rnd(bank.names);
      let guard = 0;
      while (name2 === name && guard++ < 10) name2 = App.ui.rnd(bank.names);
      let obj2 = App.ui.rnd(bank.objects);
      guard = 0;
      while (obj2 === obj && guard++ < 10) obj2 = App.ui.rnd(bank.objects);
      s = name + " " + verb + " " + obj + ", а " + name2 + " " + App.ui.rnd(bank.verbs) + " " + obj2 + ".";
    } else {
      s = App.ui.rnd(bank.adjs) + " " + name + " " + verb + " " + obj + " " + place + ".";
    }
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function render(root) {
    let mode = App.store.pref("twisters.mode", "collection"); // collection | generator
    let diff = App.store.pref("twisters.diff", 0);
    let order = [];
    let shownTs = performance.now();
    let activeMs = 0;                 // активний час показу поточної скоромовки
    let visible = !document.hidden;   // час рахуємо лише коли вкладка видима
    let orderPos = 0;
    let current = null;

    function onVisibility() {
      if (document.hidden) {
        if (visible) { activeMs += performance.now() - shownTs; visible = false; }
      } else if (!visible) {
        shownTs = performance.now(); visible = true;
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    // Клавіатура: Enter → «Прочитав ×5», Space → «Пропустити».
    // preventDefault гасить і прокрутку, і нативну активацію кнопки у фокусі (без подвійного спрацювання).
    function onKey(e) {
      const t = e.target;
      const tag = (t && t.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (t && t.isContentEditable)) return;
      if (e.key === "Enter") { e.preventDefault(); countIt(); }
      else if (e.code === "Space" || e.key === " ") { e.preventDefault(); next(); }
    }
    document.addEventListener("keydown", onKey);

    const display = h("div", { class: "twister-card fade-in" });
    const counterEl = h("div", { class: "muted", style: "font-weight:800" });
    const diffEl = h("div", { class: "diff-dots yellow", style: "font-weight:900" });

    function filtered() {
      return App.data.twisters.filter(function (t) { return !diff || t.diff === diff; });
    }

    function rebuildOrder() {
      const list = filtered();
      order = App.ui.shuffle(list.map(function (_, i) { return i; }));
      orderPos = 0;
    }

    function next() {
      if (mode === "generator") {
        current = { text: generateTwister(), diff: 2, generated: true };
      } else {
        const list = filtered();
        if (!list.length) { current = { text: "Немає скоромовок цієї складності", diff: 1 }; return show(); }
        if (orderPos >= order.length) rebuildOrder();
        current = list[order[orderPos]];
        orderPos++;
      }
      show();
    }

    function show() {
      display.textContent = current.text;
      diffEl.textContent = current.generated ? "🎲 згенеровано" : "складність: " + "●".repeat(current.diff) + "○".repeat(3 - current.diff);
      shownTs = performance.now();
      activeMs = 0;
      visible = !document.hidden;
      updateCounter();
    }

    function updateCounter() {
      const st = App.store.state;
      const today = st.twisterByDay[App.store.todayStr()] || 0;
      counterEl.textContent = "Сьогодні: " + today + " · Всього: " + st.twisterTotal;
    }

    function countIt() {
      const st = App.store.state;
      st.twisterTotal++;
      const today = App.store.todayStr();
      st.twisterByDay[today] = (st.twisterByDay[today] || 0) + 1;
      // зіграний час = активний показ скоромовки до «прочитав» (без часу в інших вкладках; стеля 2 хв)
      const onScreen = activeMs + (visible ? performance.now() - shownTs : 0);
      App.store.addTime("twisters", Math.min(onScreen, 120000));
      App.store.save();
      if ((st.twisterByDay[today]) === 5) App.ui.toast("👄 5 скоромовок сьогодні — задачу виконано!");
      next();
    }

    const modeChips = h("div", { class: "row" },
      h("button", {
        class: "chip" + (mode === "collection" ? " active" : ""),
        onclick: function () { mode = "collection"; App.store.setPref("twisters.mode", mode); refreshChips(); rebuildOrder(); next(); },
      }, "📚 Колекція (" + App.data.twisters.length + ")"),
      h("button", {
        class: "chip" + (mode === "generator" ? " active" : ""),
        onclick: function () { mode = "generator"; App.store.setPref("twisters.mode", mode); refreshChips(); next(); },
      }, "🎲 Генератор"));

    const diffChips = h("div", { class: "row" });
    DIFFS.forEach(function (d) {
      diffChips.append(h("button", {
        class: "chip" + (d.id === diff ? " active" : ""),
        onclick: function () {
          diff = d.id; App.store.setPref("twisters.diff", diff);
          refreshChips(); rebuildOrder(); next();
        },
      }, d.label));
    });

    function refreshChips() {
      modeChips.children[0].classList.toggle("active", mode === "collection");
      modeChips.children[1].classList.toggle("active", mode === "generator");
      Array.prototype.forEach.call(diffChips.children, function (el, i) {
        el.classList.toggle("active", DIFFS[i].id === diff);
      });
      diffChips.style.display = mode === "generator" ? "none" : "";
    }

    root.append(
      h("h1", { class: "page-title" }, "👄 Скоромовки"),
      h("div", { class: "page-sub" }, "Дикція і артикуляція — фундамент впевненого мовлення і харизми."),
      h("div", { class: "card fade-in" },
        h("div", { class: "row between" }, modeChips, diffChips)),
      h("div", { class: "card fade-in" },
        display,
        h("div", { class: "row between", style: "margin-top:14px" }, diffEl, counterEl),
        h("div", { class: "row center", style: "margin-top:14px;gap:14px" },
          h("button", { class: "btn ghost", onclick: next }, "Пропустити"),
          h("button", { class: "btn green big", onclick: countIt }, "✓ ПРОЧИТАВ ×5"))),
      h("div", { class: "card fade-in" },
        h("h2", null, "Як тренуватися"),
        h("div", { class: "small", style: "line-height:1.7;color:var(--muted)" },
          "1. Прочитай повільно і чітко, проговорюючи кожен звук." , h("br"),
          "2. Прискорюйся лише без втрати чіткості — швидкість без дикції не рахується.", h("br"),
          "3. Кожну скоромовку — п'ять разів поспіль, вголос і чітко.", h("br"),
          "4. Складні місця повтори окремо 5 разів. Щодня 5 скоромовок — і за місяць дикція зміниться.")));

    refreshChips();
    rebuildOrder();
    next();

    return function cleanup() {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("keydown", onKey);
    };
  }

  return { id: "twisters", title: "Скоромовки", icon: "👄", render: render };
})();
