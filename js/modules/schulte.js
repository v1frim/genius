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

  /* компактна позначка режиму для таблиці результатів */
  function modeShort(mode) {
    if (!mode) return "клас.";
    return (mode.indexOf("s") >= 0 ? "🔀" : "") + (mode.indexOf("r") >= 0 ? "↩" : "");
  }

  /* орієнтири часу під конкретний розмір (ті ж пороги, що й в evaluate) */
  function benchmarkEl(size) {
    const n = size * size;
    return h("div", { class: "tiny", style: "margin-top:10px;line-height:1.9" },
      h("div", { class: "muted", style: "font-weight:800" }, "Орієнтир для " + size + "×" + size + ":"),
      h("div", { class: "tier-elite" }, "🏆 < " + Math.round(n * 0.8) + " с — феноменально"),
      h("div", { class: "tier-great" }, "🔥 < " + Math.round(n * 1.2) + " с — відмінно"),
      h("div", { class: "tier-good" }, "👍 < " + Math.round(n * 1.8) + " с — добре"),
      h("div", { class: "tier-mid" }, "⏳ < " + Math.round(n * 2.6) + " с — середньо"),
      h("div", { class: "tier-slow" }, "повільніше — тренуйся щодня"),
      h("div", { class: "muted", style: "margin-top:4px" }, "Дивись лише в центр таблиці!"));
  }

  /* оцінка часу для квадрата size×size */
  function evaluate(size, ms) {
    const n = size * size;
    const s = ms / 1000;
    if (s <= n * 0.8) return { text: "Феноменально! 🏆", cls: "tier-elite" };
    if (s <= n * 1.2) return { text: "Відмінно! 🔥", cls: "tier-great" };
    if (s <= n * 1.8) return { text: "Добре 👍", cls: "tier-good" };
    if (s <= n * 2.6) return { text: "Середньо — є куди рости", cls: "tier-mid" };
    return { text: "Повільно — тренуйся щодня", cls: "tier-slow" };
  }

  /* око-якір для центру таблиці (колір як у цифр) */
  const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#4a4458" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3.2" fill="#4a4458" stroke="none"/></svg>';

  function render(root) {
    let size = App.store.pref("schulte.size", 5);
    let opts = Object.assign(
      { shuffle: false, reverse: false, hideFound: true, dot: true, hint: true },
      App.store.pref("schulte.opts", {}));

    let cells = [];      // {num, btn}
    let numberCount = 0; // скільки клітинок із числами (на непарних з оком — на 1 менше)
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
      grid.style.setProperty("--fs", (42 / size).toFixed(2)); // шрифт пропорційний до клітинки
      const total = size * size;
      const odd = total % 2 === 1;
      const centerIdx = (total - 1) / 2;
      const eyeInCell = opts.dot && odd; // на непарних таблицях око займає центральну клітинку
      numberCount = eyeInCell ? total - 1 : total;
      const nums = App.ui.shuffle(Array.from({ length: numberCount }, function (_, i) { return i + 1; }));
      cells = [];
      let np = 0;
      for (let i = 0; i < total; i++) {
        if (eyeInCell && i === centerIdx) {
          const eye = h("div", { class: "schulte-cell eye-cell", "aria-hidden": "true", html: EYE_SVG });
          grid.append(eye);
          continue;
        }
        const num = nums[np++];
        const btn = h("button", { class: "schulte-cell" }, num);
        const cell = { num: num, btn: btn, found: false };
        btn.addEventListener("click", function () { onCell(cell); });
        grid.append(btn);
        cells.push(cell);
      }
      // на парних таблицях справжнього центру-клітинки немає — делікатне око-накладка
      if (opts.dot && !odd) grid.append(h("div", { class: "center-eye", html: EYE_SVG }));
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
      const all = Array.from({ length: numberCount }, function (_, i) { return i + 1; });
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
      stopBtn.style.display = "";
    }

    function stopRun() {
      if (!running) return;
      running = false;
      stopTimer();
      timerEl.textContent = "0.00 с";
      startBtn.textContent = "СТАРТ";
      stopBtn.style.display = "none";
      buildGrid();
      showIdleOverlay();
      updateInfo();
    }

    function finish() {
      running = false;
      stopTimer();
      stopBtn.style.display = "none";
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
            stopBtn.style.display = "none";
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
          optToggle("hideFound", "Затемнювати знайдені"),
          optToggle("dot", "Око в центрі", "Дивись на око в центрі, числа шукай периферійним зором"),
          optToggle("hint", "Показувати наступне число"))));

      const best = bestFor(size, modeKey(opts));
      const recent = App.store.records("schulte").slice(-8).reverse();
      const tbl = h("table", { class: "results" },
        h("tr", null, h("th", null, "Розмір"), h("th", null, "Режим"), h("th", null, "Час"), h("th", null, "Пом."), h("th", null, "Дата")),
        recent.map(function (r) {
          return h("tr", null,
            h("td", null, r.size + "×" + r.size),
            h("td", { title: modeLabel(r.mode || "") }, modeShort(r.mode || "")),
            h("td", { class: evaluate(r.size, r.timeMs).cls, style: "font-weight:800" }, App.ui.fmtMs(r.timeMs)),
            h("td", null, String(r.errors)),
            h("td", null, App.ui.fmtDate(r.date)));
        }));

      sidePanel.append(h("div", { class: "card" },
        h("h2", null, "Результати"),
        h("div", { class: "row between", style: "margin-bottom:10px" },
          h("div", { class: "muted", style: "font-weight:700" }, size + "×" + size + " · " + modeLabel(modeKey(opts))),
          h("div", { class: "yellow", style: "font-weight:900;font-size:1.1rem" }, best ? App.ui.fmtMs(best) : "—")),
        recent.length ? tbl : h("div", { class: "muted small" }, "Зіграй першу таблицю — результати з'являться тут."),
        benchmarkEl(size)));
    }

    function showIdleOverlay() {
      showOverlay([
        h("div", { style: "font-weight:800;font-size:1.15rem" }, "Знайди всі числа " + (opts.reverse ? "від більшого до 1" : "по порядку")),
        h("div", { class: "muted small" }, "Тримай погляд у центрі. Час пішов після кліку на старт."),
        h("button", { class: "btn green big", onclick: start }, "СТАРТ"),
      ]);
    }

    const startBtn = h("button", { class: "btn green big", onclick: start }, "СТАРТ");
    const stopBtn = h("button", { class: "btn ghost", style: "display:none", onclick: stopRun }, "СТОП");

    root.append(
      h("h1", { class: "page-title" }, "🔢 Таблиці Шульте"),
      h("div", { class: "page-sub" }, "Периферійний зір, швидкість пошуку та концентрація. Це твоє «все бачить»."),
      h("div", { class: "schulte-wrap fade-in" },
        h("div", { class: "schulte-board-zone" },
          h("div", { class: "row", style: "width:100%;max-width:470px;justify-content:space-between" }, timerEl, nextEl, errEl),
          grid,
          h("div", { class: "row" }, startBtn, stopBtn)),
        sidePanel));

    buildGrid();
    showIdleOverlay();
    renderSide();

    return function cleanup() { stopTimer(); };
  }

  return { id: "schulte", title: "Шульте", icon: "🔢", render: render };
})();
