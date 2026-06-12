/* Арифметичний тренажер: рівні складності, спринти, рекорди */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.arithmetic = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };
  const rndInt = function (a, b) { return App.ui.rndInt(a, b); };

  const MODES = [
    { id: "s60", label: "Спринт 60 с", seconds: 60 },
    { id: "s120", label: "Спринт 120 с", seconds: 120 },
    { id: "n20", label: "20 прикладів", count: 20 },
    { id: "free", label: "Без ліміту", free: true },
  ];
  const OPS = ["+", "−", "×", "÷"];

  function genTask(level, ops) {
    const op = App.ui.rnd(ops);
    let a, b, ans;
    if (op === "+") {
      const r = [[1, 9], [10, 99], [10, 99], [100, 999], [100, 999]][level - 1];
      a = rndInt(r[0], r[1]); b = rndInt(r[0], r[1]); ans = a + b;
    } else if (op === "−") {
      const r = [[1, 9], [10, 99], [10, 99], [100, 999], [100, 999]][level - 1];
      a = rndInt(r[0], r[1]); b = rndInt(r[0], r[1]);
      if (b > a) { const t = a; a = b; b = t; }
      ans = a - b;
    } else if (op === "×") {
      const pairs = [
        [[2, 5], [2, 5]],
        [[2, 9], [2, 9]],
        [[11, 19], [2, 9]],
        [[11, 29], [11, 29]],
        [[21, 99], [11, 29]],
      ][level - 1];
      a = rndInt(pairs[0][0], pairs[0][1]); b = rndInt(pairs[1][0], pairs[1][1]); ans = a * b;
    } else {
      const pairs = [
        [[2, 5], [1, 5]],
        [[2, 9], [2, 9]],
        [[2, 9], [11, 19]],
        [[3, 19], [11, 49]],
        [[11, 29], [11, 99]],
      ][level - 1];
      b = rndInt(pairs[0][0], pairs[0][1]); ans = rndInt(pairs[1][0], pairs[1][1]);
      a = b * ans;
    }
    return { text: a + " " + op + " " + b, answer: ans };
  }

  function render(root) {
    let level = App.store.pref("arith.level", 2);
    let ops = App.store.pref("arith.ops", ["+", "−"]);
    let modeId = App.store.pref("arith.mode", "s60");

    let running = false;
    let task = null;
    let correct = 0, wrong = 0, skipped = 0;
    let startTs = 0;
    let timerInt = null;
    let endsAt = 0;

    const playCard = h("div", { class: "card fade-in" });
    const recordsBox = h("div");

    function modeDef() { return MODES.find(function (m) { return m.id === modeId; }) || MODES[0]; }

    function savePrefs() {
      App.store.setPref("arith.level", level);
      App.store.setPref("arith.ops", ops);
      App.store.setPref("arith.mode", modeId);
    }

    function stopTimer() { if (timerInt) { clearInterval(timerInt); timerInt = null; } }

    function bestFor(mId, lvl) {
      let best = null;
      App.store.records("arithmetic").forEach(function (r) {
        if (r.mode === mId && r.level === lvl) {
          if (best === null || r.correct > best) best = r.correct;
        }
      });
      return best;
    }

    function renderIdle() {
      stopTimer();
      playCard.innerHTML = "";
      const best = bestFor(modeId, level);
      playCard.append(
        h("div", { style: "text-align:center;padding:20px 0" },
          h("div", { class: "muted", style: "font-weight:700;margin-bottom:6px" },
            modeDef().label + " · рівень " + level + " · " + ops.join(" ")),
          best !== null ? h("div", { class: "yellow", style: "font-weight:900;margin-bottom:14px" }, "Рекорд: " + best + " правильних") : null,
          h("button", { class: "btn green big", onclick: start }, "СТАРТ")));
    }

    const exprEl = h("div", { class: "arith-expr" });
    const answerIn = h("input", { class: "arith-input", type: "text", inputmode: "numeric", autocomplete: "off", placeholder: "Відповідь" });
    const statusLeft = h("span", { style: "font-weight:900;font-size:1.2rem" });
    const statusRight = h("span", { style: "font-weight:800" });

    function updateStatus() {
      const m = modeDef();
      if (m.seconds) statusLeft.textContent = "⏱ " + App.ui.fmtClock(Math.max(0, (endsAt - performance.now()) / 1000));
      else if (m.count) statusLeft.textContent = "Приклад " + (correct + wrong + skipped + 1) + " / " + m.count;
      else statusLeft.textContent = "⏱ " + App.ui.fmtClock((performance.now() - startTs) / 1000);
      statusRight.innerHTML = "";
      statusRight.append(
        h("span", { class: "accent" }, "✓ " + correct),
        "  ",
        h("span", { class: "danger-text" }, " ✗ " + wrong),
        "  ",
        h("span", { class: "muted" }, " ⤼ " + skipped));
    }

    function nextTask() {
      task = genTask(level, ops);
      exprEl.textContent = task.text + " = ?";
      answerIn.value = "";
      answerIn.focus();
      updateStatus();
      const m = modeDef();
      if (m.count && correct + wrong + skipped >= m.count) finish();
    }

    function flash(ok) {
      playCard.classList.remove("flash-ok", "flash-bad");
      void playCard.offsetWidth; // перезапуск анімації
      playCard.classList.add(ok ? "flash-ok" : "flash-bad");
    }

    function submit() {
      if (!running) return;
      const raw = answerIn.value.trim().replace(",", ".");
      if (raw === "") return;
      const val = Number(raw);
      if (val === task.answer) { correct++; flash(true); }
      else { wrong++; flash(false); App.ui.toast(task.text + " = " + task.answer, "info"); }
      nextTask();
    }

    function skip() {
      if (!running) return;
      skipped++;
      flash(false);
      App.ui.toast(task.text + " = " + task.answer, "info");
      nextTask();
    }

    function start() {
      if (!ops.length) { App.ui.toast("Обери хоча б одну операцію", "info"); return; }
      running = true;
      correct = 0; wrong = 0; skipped = 0;
      startTs = performance.now();
      const m = modeDef();
      playCard.innerHTML = "";
      playCard.append(
        h("div", { class: "row between", style: "margin-bottom:6px" }, statusLeft, statusRight),
        exprEl,
        h("div", { class: "row center", style: "gap:12px" },
          answerIn,
          h("button", { class: "btn green", onclick: submit }, "ОК"),
          h("button", { class: "btn ghost", onclick: skip }, "Пропустити")),
        m.free ? h("div", { class: "row center", style: "margin-top:14px" },
          h("button", { class: "btn ghost small", onclick: finish }, "Завершити")) : null);
      if (m.seconds) {
        endsAt = performance.now() + m.seconds * 1000;
        timerInt = setInterval(function () {
          updateStatus();
          if (performance.now() >= endsAt) finish();
        }, 200);
      } else {
        timerInt = setInterval(updateStatus, 500);
      }
      nextTask();
    }

    function finish() {
      if (!running) return;
      running = false;
      stopTimer();
      const seconds = Math.round((performance.now() - startTs) / 1000);
      const total = correct + wrong + skipped;
      const prevBest = bestFor(modeId, level);
      App.store.addTime("arithmetic", performance.now() - startTs);
      App.store.addRecord("arithmetic", {
        mode: modeId, level: level, ops: ops.join(""),
        correct: correct, wrong: wrong, skipped: skipped, seconds: seconds,
      });
      const isRecord = (modeId === "s60" || modeId === "s120") && (prevBest === null || correct > prevBest);
      if (isRecord) App.ui.toast("🏆 Новий рекорд: " + correct + " правильних!");
      playCard.innerHTML = "";
      playCard.append(h("div", { style: "text-align:center;padding:10px 0" },
        h("h2", null, "Готово!"),
        h("div", { class: "stat-cards", style: "margin:14px 0" },
          App.ui.statCard(String(correct), "правильних"),
          App.ui.statCard(String(wrong), "помилок"),
          App.ui.statCard(String(skipped), "пропущено"),
          App.ui.statCard(total ? Math.round(correct / total * 100) + "%" : "—", "влучність"),
          App.ui.statCard(App.ui.fmtClock(seconds), "час")),
        isRecord ? h("div", { class: "yellow", style: "font-weight:900;margin-bottom:10px" }, "🏆 Особистий рекорд!") : null,
        h("button", { class: "btn green big", onclick: start }, "ЗАНОВО")));
      renderRecords();
    }

    answerIn.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });

    /* налаштування */
    const levelChips = h("div", { class: "row" });
    [1, 2, 3, 4, 5].forEach(function (l) {
      levelChips.append(h("button", {
        class: "chip" + (l === level ? " active" : ""),
        onclick: function () {
          level = l; savePrefs();
          Array.prototype.forEach.call(levelChips.children, function (el, i) {
            el.classList.toggle("active", i + 1 === level);
          });
          if (!running) renderIdle();
        },
      }, String(l)));
    });

    const opChips = h("div", { class: "row" });
    OPS.forEach(function (op) {
      opChips.append(h("button", {
        class: "chip" + (ops.indexOf(op) >= 0 ? " active" : ""),
        onclick: function () {
          const i = ops.indexOf(op);
          if (i >= 0) ops.splice(i, 1); else ops.push(op);
          savePrefs();
          Array.prototype.forEach.call(opChips.children, function (el, j) {
            el.classList.toggle("active", ops.indexOf(OPS[j]) >= 0);
          });
          if (!running) renderIdle();
        },
      }, op));
    });

    const modeSel = h("select", null, MODES.map(function (m) {
      return h("option", { value: m.id }, m.label);
    }));
    modeSel.value = modeId;
    modeSel.addEventListener("change", function () {
      modeId = modeSel.value; savePrefs();
      if (!running) renderIdle();
    });

    function renderRecords() {
      recordsBox.innerHTML = "";
      const recs = App.store.records("arithmetic");
      const sprint = recs.filter(function (r) { return r.mode === "s60" && r.level === level; });
      recordsBox.append(h("div", { class: "card" },
        h("h2", null, "Прогрес: спринт 60 с, рівень " + level),
        App.ui.sparkline(sprint.slice(-25).map(function (r) { return r.correct; }), { w: 420, h: 60 }),
        recs.length ? h("table", { class: "results", style: "margin-top:12px" },
          h("tr", null, h("th", null, "Режим"), h("th", null, "Рів."), h("th", null, "✓"), h("th", null, "✗"), h("th", null, "Час"), h("th", null, "Дата")),
          recs.slice(-8).reverse().map(function (r) {
            const m = MODES.find(function (x) { return x.id === r.mode; });
            return h("tr", null,
              h("td", null, m ? m.label : r.mode),
              h("td", null, String(r.level)),
              h("td", { class: "accent", style: "font-weight:800" }, String(r.correct)),
              h("td", null, String(r.wrong)),
              h("td", null, App.ui.fmtClock(r.seconds)),
              h("td", null, App.ui.fmtDate(r.date)));
          })) : h("div", { class: "muted small", style: "margin-top:10px" }, "Зіграй перший спринт!")));
    }

    root.append(
      h("h1", { class: "page-title" }, "➗ Арифметика"),
      h("div", { class: "page-sub" }, "Усний рахунок — спринт для робочої пам'яті. Рівень 5 — справжній виклик."),
      h("div", { class: "card fade-in" },
        h("div", { class: "row", style: "gap:18px" },
          h("div", { class: "field" }, h("span", null, "Рівень"), levelChips),
          h("div", { class: "field" }, h("span", null, "Операції"), opChips),
          h("div", { class: "field" }, h("span", null, "Режим"), modeSel))),
      playCard,
      recordsBox);

    renderIdle();
    renderRecords();

    App.primaryAction = function () { if (!running) { start(); return true; } return false; };

    return function cleanup() { stopTimer(); running = false; };
  }

  return { id: "arithmetic", title: "Арифметика", icon: "➗", render: render };
})();
