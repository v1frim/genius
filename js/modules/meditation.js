/* Медитація: дихальний пейсер, таймер сесій, журнал до 1000 медитацій */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.meditation = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const PRESETS = [
    { id: "box", label: "Бокс 4-4-4-4", phases: [4, 4, 4, 4] },
    { id: "478", label: "Сон 4-7-8", phases: [4, 7, 8, 0] },
    { id: "coherent", label: "Когерентне 5-5", phases: [5, 0, 5, 0] },
    { id: "custom", label: "Свій ритм", phases: null },
  ];
  const PHASE_NAMES = ["Вдих", "Затримка", "Видих", "Затримка"];
  const PHASE_SCALE = [1.6, 1.6, 1.0, 1.0];

  function render(root) {
    let presetId = App.store.pref("med.preset", "box");
    let customPhases = App.store.pref("med.custom", [4, 4, 6, 2]);
    let soundOn = App.store.pref("med.sound", true);

    /* --- пейсер --- */
    let pacerRunning = false;
    let phaseIdx = 0;
    let phaseLeft = 0;
    let pacerInt = null;

    const circle = h("div", { class: "breath-circle" }, "🫁");
    const phaseEl = h("div", { class: "breath-phase" }, "Натисни «Почати дихати»");

    function currentPhases() {
      if (presetId === "custom") return customPhases;
      const p = PRESETS.find(function (x) { return x.id === presetId; });
      return p.phases;
    }

    function nextPhase() {
      const phases = currentPhases();
      let guard = 0;
      do {
        phaseIdx = (phaseIdx + 1) % 4;
        guard++;
      } while (phases[phaseIdx] === 0 && guard < 5);
      startPhase();
    }

    function startPhase() {
      const phases = currentPhases();
      phaseLeft = phases[phaseIdx];
      phaseEl.textContent = PHASE_NAMES[phaseIdx] + " — " + phaseLeft;
      circle.style.transitionDuration = phases[phaseIdx] + "s";
      circle.style.transform = "scale(" + PHASE_SCALE[phaseIdx] + ")";
      circle.textContent = String(phaseLeft);
      if (soundOn) App.ui.beep(phaseIdx === 0 ? 392 : phaseIdx === 2 ? 262 : 330, 140, 0.05);
    }

    function pacerTick() {
      if (!pacerRunning) return;
      phaseLeft--;
      if (phaseLeft <= 0) { nextPhase(); return; }
      circle.textContent = String(phaseLeft);
      phaseEl.textContent = PHASE_NAMES[phaseIdx] + " — " + phaseLeft;
    }

    function startPacer() {
      if (pacerRunning) { stopPacer(); return; }
      const phases = currentPhases();
      if (!phases || phases.every(function (s) { return !s; })) { App.ui.toast("Задай тривалість фаз", "info"); return; }
      pacerRunning = true;
      phaseIdx = phases[0] ? 0 : 2;
      startPhase();
      pacerInt = setInterval(pacerTick, 1000);
      pacerBtn.textContent = "ЗУПИНИТИ";
      pacerBtn.classList.remove("green");
    }

    function stopPacer() {
      pacerRunning = false;
      if (pacerInt) { clearInterval(pacerInt); pacerInt = null; }
      circle.style.transitionDuration = "1.2s";
      circle.style.transform = "scale(1)";
      circle.textContent = "🫁";
      phaseEl.textContent = "Пауза. Подихай у своєму ритмі.";
      pacerBtn.textContent = "ПОЧАТИ ДИХАТИ";
      pacerBtn.classList.add("green");
    }

    const pacerBtn = h("button", { class: "btn green big", onclick: startPacer }, "ПОЧАТИ ДИХАТИ");

    const presetChips = h("div", { class: "row center" });
    const customRow = h("div", { class: "row center", style: presetId === "custom" ? "margin-top:10px" : "display:none" });
    ["Вдих", "Затримка", "Видих", "Затримка"].forEach(function (name, i) {
      const inp = h("input", { type: "number", min: 0, max: 30, style: "width:74px;text-align:center" });
      inp.value = customPhases[i];
      inp.addEventListener("change", function () {
        customPhases[i] = Math.max(0, parseInt(inp.value, 10) || 0);
        App.store.setPref("med.custom", customPhases);
      });
      customRow.append(h("div", { class: "field" }, h("span", null, name), inp));
    });
    PRESETS.forEach(function (p) {
      presetChips.append(h("button", {
        class: "chip" + (p.id === presetId ? " active" : ""),
        onclick: function () {
          presetId = p.id;
          App.store.setPref("med.preset", presetId);
          Array.prototype.forEach.call(presetChips.children, function (el, i) {
            el.classList.toggle("active", PRESETS[i].id === presetId);
          });
          customRow.style.display = presetId === "custom" ? "" : "none";
          if (pacerRunning) { stopPacer(); startPacer(); }
        },
      }, p.label));
    });

    const soundCb = h("input", {
      type: "checkbox",
      onchange: function () { soundOn = soundCb.checked; App.store.setPref("med.sound", soundOn); },
    });
    soundCb.checked = soundOn;

    /* --- таймер сесії --- */
    let sessRunning = false;
    let sessStart = 0;
    let sessInt = null;

    const sessClock = h("div", { class: "big-num", style: "font-variant-numeric:tabular-nums" }, "00:00");

    function sessTick() {
      sessClock.textContent = App.ui.fmtClock((performance.now() - sessStart) / 1000);
    }

    function toggleSession() {
      if (!sessRunning) {
        sessRunning = true;
        sessStart = performance.now();
        sessInt = setInterval(sessTick, 500);
        sessBtn.textContent = "ЗАВЕРШИТИ І ЗБЕРЕГТИ";
        sessBtn.classList.remove("green");
      } else {
        const minutes = Math.round((performance.now() - sessStart) / 60000);
        sessRunning = false;
        if (sessInt) { clearInterval(sessInt); sessInt = null; }
        sessBtn.textContent = "ПОЧАТИ СЕСІЮ";
        sessBtn.classList.add("green");
        sessClock.textContent = "00:00";
        if (minutes < 1) {
          App.ui.toast("Сесія коротша за хвилину — не зберігаю", "info");
          return;
        }
        addEntry(minutes);
        App.ui.toast("🧘 +" + minutes + " хв. Так тримати!");
      }
    }

    const sessBtn = h("button", { class: "btn green big", onclick: toggleSession }, "ПОЧАТИ СЕСІЮ");

    function addEntry(minutes) {
      const prevLongest = App.store.best("meditation", "minutes", "max");
      App.store.addRecord("meditation", { minutes: minutes });
      if (prevLongest !== null && minutes > prevLongest) App.ui.toast("🏆 Найдовша медитація: " + minutes + " хв!");
      renderStats();
    }

    /* --- статистика та журнал --- */
    const statsBox = h("div");

    function renderStats() {
      statsBox.innerHTML = "";
      const recs = App.store.records("meditation");
      const goal = (App.store.state.goals || []).find(function (g) { return g.id === "medCount"; });
      const base = goal ? (goal.base || 0) : 0;
      const totalCount = base + recs.length;
      const totalMin = recs.reduce(function (s, r) { return s + (r.minutes || 0); }, 0);
      const longest = App.store.best("meditation", "minutes", "max") || 0;

      statsBox.append(h("div", { class: "card" },
        h("h2", null, "Шлях до 1000 медитацій"),
        h("div", { class: "stat-cards", style: "margin-bottom:12px" },
          App.ui.statCard(String(totalCount), "сесій всього (з базою " + base + ")"),
          App.ui.statCard(String(totalMin), "хвилин у журналі"),
          App.ui.statCard(longest + " хв", "найдовша (ціль 180)"),
          App.ui.statCard(String(recs.filter(function (r) { return r.date === App.store.todayStr(); }).length), "сьогодні")),
        App.ui.progressBar(totalCount / 1000 * 100),
        h("div", { class: "tiny muted", style: "margin-top:6px" }, totalCount + " / 1000")));

      const manualIn = h("input", { type: "number", min: 1, max: 600, placeholder: "хв", style: "width:90px" });
      statsBox.append(h("div", { class: "card" },
        h("div", { class: "row between" },
          h("h2", { style: "margin:0" }, "Журнал"),
          h("div", { class: "row" },
            manualIn,
            h("button", {
              class: "btn small", onclick: function () {
                const m = parseInt(manualIn.value, 10);
                if (!m || m < 1) { App.ui.toast("Вкажи тривалість у хвилинах", "info"); return; }
                addEntry(m);
                manualIn.value = "";
              },
            }, "➕ Додати вручну"))),
        recs.length ? h("table", { class: "results", style: "margin-top:10px" },
          h("tr", null, h("th", null, "Дата"), h("th", null, "Хвилин"), h("th", null, "")),
          recs.slice(-8).reverse().map(function (r) {
            return h("tr", null,
              h("td", null, App.ui.fmtDate(r.date)),
              h("td", { style: "font-weight:800" }, String(r.minutes)),
              h("td", null, h("button", {
                class: "t-del", title: "Видалити запис",
                onclick: function () {
                  if (!confirm("Видалити запис " + r.minutes + " хв?")) return;
                  const list = App.store.state.records.meditation;
                  const i = list.indexOf(r);
                  if (i >= 0) list.splice(i, 1);
                  App.store.save();
                  renderStats();
                },
              }, "✕")));
          })) : h("div", { class: "muted small", style: "margin-top:10px" }, "Перша сесія — найважча. Почни з 10 хвилин.")));
    }

    root.append(
      h("h1", { class: "page-title" }, "🧘 Медитація та дихання"),
      h("div", { class: "page-sub" }, "Усвідомленість — це фундамент: «все відчуває» починається тут."),
      h("div", { class: "grid-2 fade-in" },
        h("div", { class: "card" },
          h("h2", null, "Дихальний пейсер"),
          presetChips,
          customRow,
          h("div", { class: "breath-stage" }, circle, phaseEl),
          h("div", { class: "row center", style: "gap:16px" },
            pacerBtn,
            h("label", { class: "opt" }, soundCb, "Звук фаз")),
          h("div", { class: "tiny muted", style: "margin-top:12px;text-align:center" },
            "Бокс — для фокусу · 4-7-8 — перед сном (твоя ціль «засинати за 5 хв») · Когерентне — фонове спокійне дихання.")),
        h("div", { class: "card", style: "text-align:center" },
          h("h2", null, "Таймер сесії"),
          h("div", { style: "padding:30px 0" }, sessClock),
          sessBtn,
          h("div", { class: "tiny muted", style: "margin-top:14px" },
            "Сесія збережеться в журнал і зарахується до цілі «1000 медитацій»."))),
      statsBox);

    renderStats();

    return function cleanup() {
      if (pacerInt) clearInterval(pacerInt);
      if (sessInt) clearInterval(sessInt);
    };
  }

  return { id: "meditation", title: "Медитація", icon: "🧘", render: render };
})();
