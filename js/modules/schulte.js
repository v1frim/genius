/* Таблиці Шульте: розміри 3×3–7×7, перемішування, зворотний порядок, рекорди */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.schulte = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  function modeKey(opts) {
    return (opts.shuffle ? "s" : "") + (opts.reverse ? "r" : "");
  }

  function modeLabel(mode) {
    if (!mode) return "класика";
    const parts = [];
    if (mode.indexOf("s") >= 0) parts.push("перемішування");
    if (mode.indexOf("r") >= 0) parts.push("зворотний");
    return parts.join(" + ");
  }

  /* оцінка часу для квадрата size×size */
  function evaluate(size, ms) {
    const n = size * size;
    const s = ms / 1000;
    if (s <= n * 0.8) return { text: "Феноменально! 🏆", cls: "accent" };
    if (s <= n * 1.2) return { text: "Відмінно! 🔥", cls: "accent" };
    if (s <= n * 1.8) return { text: "Добре 👍", cls: "yellow" };
    if (s <= n * 2.6) return { text: "Середньо — є куди рости", cls: "muted" };
    return { text: "Повільно — тренуйся щодня", cls: "muted" };
  }

  function render(root) {
    let size = App.store.pref("schulte.size", 5);
    let opts = Object.assign(
      { shuffle: false, reverse: false, hideFound: true, dot: true, hint: true },
      App.store.pref("schulte.opts", {}));

    let cells = [];      // {num, btn}
    let seq = [];        // послідовність чисел, які треба натискати
    let seqIdx = 0;
    let errors = 0;
    let running = false;
    let startTs = 0;
    let timerInt = null;

    const timerEl = h("div", { class: "timer-big" }, "0.00 с");
    const nextEl = h("div", { class: "muted", style: "font-weight:800;font-size:1.1rem;min-width:90px" }, "—");
    const errEl = h("div", { class: "muted", style: "font-weight:800" }, "");
    const grid = h("div", { class: "schulte-grid" });
    const sidePanel = h("div", { class: "schulte-side" });

    function savePrefs() {
      App.store.setPref("schulte.size", size);
      App.store.setPref("schulte.opts", opts);
    }

    function stopTimer() {
      if (timerInt) { clearInterval(timerInt); timerInt = null; }
    }

    function showOverlay(content) {
      const old = grid.querySelector(".schulte-overlay");
      if (old) old.remove();
      if (content) grid.append(h("div", { class: "schulte-overlay" }, content));
    }

    function buildGrid() {
      grid.innerHTML = "";
      grid.style.gridTemplateColumns = "repeat(" + size + ", 1fr)";
      const nums = App.ui.shuffle(Array.from({ length: size * size }, function (_, i) { return i + 1; }));
      cells = nums.map(function (num) {
        const btn = h("button", { class: "schulte-cell" }, num);
        const cell = { num: num, btn: btn, found: false };
        btn.addEventListener("click", function () { onCell(cell); });
        grid.append(btn);
        return cell;
      });
      if (opts.dot) grid.append(h("div", { class: "center-dot" }));
    }

    function reshuffleRemaining() {
      const freeCells = cells.filter(function (c) { return !c.found; });
      const nums = App.ui.shuffle(freeCells.map(function (c) { return c.num; }));
      freeCells.forEach(function (c, i) {
        c.num = nums[i];
        c.btn.textContent = nums[i];
      });
    }

    function updateInfo() {
      nextEl.textContent = running ? "шукай: " + seq[seqIdx] : "—";
      if (!opts.hint) nextEl.textContent = running ? "🙈" : "—";
      errEl.textContent = errors ? "помилок: " + errors : "";
    }

    function start() {
      stopTimer();
      buildGrid();
      const all = Array.from({ length: size * size }, function (_, i) { return i + 1; });
      seq = opts.reverse ? all.slice().reverse() : all;
      seqIdx = 0;
      errors = 0;
      running = true;
      startTs = performance.now();
      timerInt = setInterval(function () {
        timerEl.textContent = App.ui.fmtMs(performance.now() - startTs);
      }, 47);
      showOverlay(null);
      updateInfo();
      startBtn.textContent = "ЗАНОВО";
    }

    function finish() {
      running = false;
      stopTimer();
      const ms = performance.now() - startTs;
      timerEl.textContent = App.ui.fmtMs(ms);
      const mode = modeKey(opts);
      const prevBest = bestFor(size, mode);
      App.store.addRecord("schulte", { size: size, mode: mode, timeMs: Math.round(ms), errors: errors });
      const isRecord = prevBest === null || ms < prevBest;
      if (isRecord) App.ui.toast("🏆 Новий рекорд " + size + "×" + size + ": " + App.ui.fmtMs(ms));
      const ev = evaluate(size, ms);
      showOverlay([
        h("div", { class: "big-num" }, App.ui.fmtMs(ms)),
        h("div", { class: ev.cls, style: "font-weight:800;font-size:1.1rem" }, ev.text),
        errors ? h("div", { class: "muted" }, "Помилок: " + errors) : null,
        isRecord ? h("div", { class: "yellow", style: "font-weight:900" }, "🏆 Особистий рекорд!") : null,
        h("button", { class: "btn green big", onclick: start }, "ЗАНОВО"),
      ]);
      renderSide();
      updateInfo();
    }

    function onCell(cell) {
      if (!running || cell.found) return;
      if (cell.num === seq[seqIdx]) {
        seqIdx++;
        cell.found = true;
        if (opts.hideFound) cell.btn.classList.add("found");
        if (seqIdx >= seq.length) { finish(); return; }
        if (opts.shuffle) {
          cell.btn.classList.add("found"); // у режимі перемішування знайдені завжди ховаються
          reshuffleRemaining();
        }
        updateInfo();
      } else {
        errors++;
        cell.btn.classList.add("flash-err");
        setTimeout(function () { cell.btn.classList.remove("flash-err"); }, 220);
        updateInfo();
      }
    }

    function bestFor(sz, mode) {
      let best = null;
      App.store.records("schulte").forEach(function (r) {
        if (r.size === sz && (r.mode || "") === mode) {
          if (best === null || r.timeMs < best) best = r.timeMs;
        }
      });
      return best;
    }

    function renderSide() {
      sidePanel.innerHTML = "";

      const sizeChips = h("div", { class: "row" });
      [3, 4, 5, 6, 7].forEach(function (sz) {
        sizeChips.append(h("button", {
          class: "chip" + (sz === size ? " active" : ""),
          onclick: function () {
            size = sz; savePrefs();
            running = false; stopTimer();
            buildGrid(); showIdleOverlay(); renderSide(); updateInfo();
            timerEl.textContent = "0.00 с";
            startBtn.textContent = "СТАРТ";
          },
        }, sz + "×" + sz));
      });

      function optToggle(key, label, hintText) {
        const cb = h("input", {
          type: "checkbox",
          onchange: function () {
            opts[key] = cb.checked; savePrefs();
            if (!running && (key === "dot")) { buildGrid(); showIdleOverlay(); }
            updateInfo();
            renderSide();
          },
        });
        cb.checked = !!opts[key];
        return h("label", { class: "opt", title: hintText || "" }, cb, label);
      }

      sidePanel.append(h("div", { class: "card" },
        h("h2", null, "Налаштування"),
        sizeChips,
        h("div", { style: "display:flex;flex-direction:column;gap:9px;margin-top:14px" },
          optToggle("shuffle", "Перемішувати після кліку", "Хардкор: цифри міняються місцями після кожного знайденого числа"),
          optToggle("reverse", "Зворотний порядок", "Шукай від найбільшого до 1"),
          optToggle("hideFound", "Ховати знайдені"),
          optToggle("dot", "Точка в центрі", "Тримай погляд у центрі, шукай периферійним зором"),
          optToggle("hint", "Показувати наступне число"))));

      const best = bestFor(size, modeKey(opts));
      const recent = App.store.records("schulte").slice(-8).reverse();
      const tbl = h("table", { class: "results" },
        h("tr", null, h("th", null, "Розмір"), h("th", null, "Режим"), h("th", null, "Час"), h("th", null, "Пом."), h("th", null, "Дата")),
        recent.map(function (r) {
          return h("tr", null,
            h("td", null, r.size + "×" + r.size),
            h("td", null, modeLabel(r.mode || "")),
            h("td", null, App.ui.fmtMs(r.timeMs)),
            h("td", null, String(r.errors)),
            h("td", null, App.ui.fmtDate(r.date)));
        }));

      sidePanel.append(h("div", { class: "card" },
        h("h2", null, "Результати"),
        h("div", { class: "row between", style: "margin-bottom:10px" },
          h("div", { class: "muted", style: "font-weight:700" }, size + "×" + size + " · " + modeLabel(modeKey(opts))),
          h("div", { class: "yellow", style: "font-weight:900;font-size:1.1rem" }, best ? App.ui.fmtMs(best) : "—")),
        recent.length ? tbl : h("div", { class: "muted small" }, "Зіграй першу таблицю — результати з'являться тут."),
        h("div", { class: "tiny muted", style: "margin-top:10px" },
          "Орієнтир для 5×5: < 20 с — феноменально, < 30 с — відмінно, < 45 с — добре. Дивись лише в центр таблиці!")));
    }

    function showIdleOverlay() {
      showOverlay([
        h("div", { style: "font-weight:800;font-size:1.15rem" }, "Знайди всі числа " + (opts.reverse ? "від більшого до 1" : "по порядку")),
        h("div", { class: "muted small" }, "Тримай погляд у центрі. Час пішов після кліку на старт."),
        h("button", { class: "btn green big", onclick: start }, "СТАРТ"),
      ]);
    }

    const startBtn = h("button", { class: "btn green big", onclick: start }, "СТАРТ");

    root.append(
      h("h1", { class: "page-title" }, "🔢 Таблиці Шульте"),
      h("div", { class: "page-sub" }, "Периферійний зір, швидкість пошуку та концентрація. Це твоє «все бачить»."),
      h("div", { class: "schulte-wrap fade-in" },
        h("div", { class: "schulte-board-zone" },
          h("div", { class: "row", style: "width:100%;max-width:470px;justify-content:space-between" }, timerEl, nextEl, errEl),
          grid,
          h("div", { class: "row" }, startBtn)),
        sidePanel));

    buildGrid();
    showIdleOverlay();
    renderSide();

    return function cleanup() { stopTimer(); };
  }

  return { id: "schulte", title: "Шульте", icon: "🔢", render: render };
})();
