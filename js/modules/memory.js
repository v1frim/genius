/* Пам'ять: цифровий діапазон (digit span) + зорова матриця */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.memory = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  /* ---------- digit span ---------- */

  function renderSpan(root) {
    let reverse = App.store.pref("span.reverse", false);
    let len = 4;
    let round = 0;
    const ROUNDS = 10;
    let bestLen = 0;
    let digits = "";
    let timeouts = [];
    let sessionStart = 0;

    const box = h("div");

    function later(fn, ms) { timeouts.push(setTimeout(fn, ms)); }

    function clearTimeouts() {
      timeouts.forEach(clearTimeout);
      timeouts = [];
    }

    function genDigits(n) {
      let s = String(App.ui.rndInt(1, 9));
      for (let i = 1; i < n; i++) s += String(App.ui.rndInt(0, 9));
      return s;
    }

    function spanBest(mode) {
      let b = 0;
      App.store.records("digitSpan").forEach(function (r) {
        if ((r.mode || "fwd") === mode && typeof r.best === "number" && r.best > b) b = r.best;
      });
      return b;
    }

    function intro() {
      clearTimeouts();
      box.innerHTML = "";
      const revCb = h("input", {
        type: "checkbox",
        onchange: function () {
          reverse = revCb.checked;
          App.store.setPref("span.reverse", reverse);
        },
      });
      revCb.checked = reverse;
      const bf = spanBest("fwd"), br = spanBest("rev");
      box.append(h("div", { class: "card", style: "text-align:center" },
        h("h2", null, "Цифровий діапазон"),
        h("div", { class: "muted", style: "max-width:520px;margin:0 auto 14px" },
          "Запам'ятай число, що з'явиться на мить, і введи його" + (reverse ? " у зворотному порядку" : "") +
          ". Відповів правильно — наступне буде довшим. " + ROUNDS + " раундів, починаємо з 4 цифр."),
        h("div", { class: "row center", style: "margin-bottom:16px" },
          h("label", { class: "opt" }, revCb, "Зворотний порядок (складніше, сильніше качає робочу пам'ять)")),
        (bf || br) ? h("div", { class: "yellow", style: "font-weight:900;margin-bottom:12px" },
          "Рекорд — прямий: " + (bf || "—") + " · зворотний: " + (br || "—")) : null,
        h("button", {
          class: "btn green big", onclick: function () {
            len = 4; round = 0; bestLen = 0;
            sessionStart = performance.now();
            playRound();
          },
        }, "СТАРТ")));
    }

    function playRound() {
      clearTimeouts();
      round++;
      digits = genDigits(len);
      box.innerHTML = "";
      const disp = h("div", { class: "digit-display" }, digits.split("").join(" "));
      box.append(h("div", { class: "card", style: "text-align:center" },
        h("div", { class: "muted small", style: "font-weight:800" }, "Раунд " + round + " / " + ROUNDS + " · " + len + " цифр"),
        disp));
      const showMs = 600 + 350 * len;
      later(function () {
        disp.textContent = "• • •";
        askAnswer();
      }, showMs);
    }

    function askAnswer() {
      const card = box.querySelector(".card");
      const input = h("input", {
        class: "arith-input", type: "text", inputmode: "numeric",
        placeholder: reverse ? "У зворотному порядку" : "Що там було?",
        style: "width:280px",
      });
      const okBtn = h("button", { class: "btn green", onclick: check }, "ОК");
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); check(); }
      });
      card.append(h("div", { class: "row center", style: "gap:10px;margin-top:6px" }, input, okBtn));
      input.focus();

      function check() {
        const expected = reverse ? digits.split("").reverse().join("") : digits;
        const got = input.value.replace(/\s+/g, "");
        if (!got) return;
        const ok = got === expected;
        if (ok) {
          bestLen = Math.max(bestLen, len);
          len++;
        } else {
          len = Math.max(3, len - 1);
        }
        card.append(h("div", {
          class: ok ? "accent" : "danger-text",
          style: "font-weight:900;margin-top:10px;font-size:1.1rem",
        }, ok ? "✓ Точно!" : "✗ Було: " + digits.split("").join(" ")));
        later(round >= ROUNDS ? finishSession : playRound, ok ? 700 : 1600);
      }
    }

    function finishSession() {
      clearTimeouts();
      if (sessionStart) { App.store.addTime("memory", performance.now() - sessionStart); sessionStart = 0; }
      const prevBest = App.store.best("digitSpan", "best", "max");
      App.store.addRecord("digitSpan", { best: bestLen, mode: reverse ? "rev" : "fwd" });
      if (bestLen && (prevBest === null || bestLen > prevBest)) {
        App.ui.toast("🏆 Новий рекорд діапазону: " + bestLen + " цифр!");
      }
      box.innerHTML = "";
      box.append(h("div", { class: "card", style: "text-align:center" },
        h("h2", null, "Сесію завершено"),
        h("div", { class: "big-num yellow", style: "margin:10px 0" }, bestLen + " цифр"),
        h("div", { class: "muted small", style: "margin-bottom:14px" },
          bestLen >= 9 ? "Рівень мнемоніста! 🏆" :
            bestLen >= 7 ? "Вище середнього. Ціль — 9+." :
              "Середній рівень людини 5–7. Тренуй щодня — діапазон росте."),
        h("button", { class: "btn green big", onclick: intro }, "ЩЕ СЕСІЮ")));
      renderSpanStats();
    }

    const statsBox = h("div");
    function renderSpanStats() {
      statsBox.innerHTML = "";
      const recs = App.store.records("digitSpan");
      if (!recs.length) return;
      statsBox.append(h("div", { class: "card" },
        h("h2", null, "Динаміка діапазону (ціль 9)"),
        App.ui.sparkline(recs.slice(-30).map(function (r) { return r.best; }), { w: 420, h: 60, goal: 9 })));
    }

    intro();
    renderSpanStats();
    root.append(box, statsBox);
    return function cleanup() { clearTimeouts(); };
  }

  /* ---------- зорова матриця ---------- */

  function renderMatrix(root) {
    let level = 1;
    let lives = 3;
    let timeouts = [];
    let gameStart = 0;
    const box = h("div");
    const statsBox = h("div");

    function later(fn, ms) { timeouts.push(setTimeout(fn, ms)); }
    function clearTimeouts() { timeouts.forEach(clearTimeout); timeouts = []; }

    function cellsForLevel(l) { return l + 2; }
    function sideForCells(c) {
      if (c <= 4) return 3;
      if (c <= 7) return 4;
      if (c <= 11) return 5;
      if (c <= 16) return 6;
      return 7;
    }

    function intro() {
      clearTimeouts();
      level = 1; lives = 3;
      box.innerHTML = "";
      const best = App.store.best("visualMemory", "best", "max");
      box.append(h("div", { class: "card", style: "text-align:center" },
        h("h2", null, "Зорова матриця"),
        h("div", { class: "muted", style: "max-width:520px;margin:0 auto 14px" },
          "На мить підсвітяться клітинки — запам'ятай їх і відтвори кліками. " +
          "З кожним рівнем клітинок більше. 3 життя. Це тренування «фотографічного» погляду."),
        best ? h("div", { class: "yellow", style: "font-weight:900;margin-bottom:12px" }, "Твій рекорд: рівень " + best) : null,
        h("button", {
          class: "btn green big",
          onclick: function () { gameStart = performance.now(); playRound(); },
        }, "СТАРТ")));
    }

    function playRound() {
      clearTimeouts();
      box.innerHTML = "";
      const count = cellsForLevel(level);
      const side = sideForCells(count);
      const total = side * side;
      const litSet = {};
      App.ui.shuffle(Array.from({ length: total }, function (_, i) { return i; }))
        .slice(0, count)
        .forEach(function (i) { litSet[i] = true; });

      const grid = h("div", { class: "vm-grid", style: "grid-template-columns:repeat(" + side + ",1fr)" });
      const cells = [];
      let inputPhase = false;
      let found = 0;
      let failed = false;

      for (let i = 0; i < total; i++) {
        (function (idx) {
          const cell = h("button", { class: "vm-cell" });
          cell.addEventListener("click", function () {
            if (!inputPhase || failed) return;
            if (litSet[idx]) {
              if (cell.classList.contains("hit")) return;
              cell.classList.add("hit");
              found++;
              if (found >= count) {
                level++;
                later(playRound, 600);
                inputPhase = false;
              }
            } else {
              cell.classList.add("miss");
              failed = true;
              inputPhase = false;
              lives--;
              Object.keys(litSet).forEach(function (k) { cells[k].classList.add("lit"); });
              later(lives <= 0 ? finishSession : playRound, 1300);
            }
          });
          cells.push(cell);
          grid.append(cell);
        })(i);
      }

      box.append(h("div", { class: "card", style: "text-align:center" },
        h("div", { class: "row between", style: "margin-bottom:14px" },
          h("span", { style: "font-weight:900" }, "Рівень " + level + " · " + count + " клітинок"),
          h("span", null, "❤️".repeat(lives) + "🖤".repeat(3 - lives))),
        grid));

      Object.keys(litSet).forEach(function (k) { cells[k].classList.add("lit"); });
      later(function () {
        cells.forEach(function (c) { c.classList.remove("lit"); });
        inputPhase = true;
      }, 500 + 130 * count);
    }

    function finishSession() {
      clearTimeouts();
      if (gameStart) { App.store.addTime("memory", performance.now() - gameStart); gameStart = 0; }
      const best = level;
      const prevBest = App.store.best("visualMemory", "best", "max");
      App.store.addRecord("visualMemory", { best: best });
      if (prevBest === null || best > prevBest) App.ui.toast("🏆 Рекорд зорової матриці: рівень " + best);
      box.innerHTML = "";
      box.append(h("div", { class: "card", style: "text-align:center" },
        h("h2", null, "Гру завершено"),
        h("div", { class: "big-num yellow", style: "margin:10px 0" }, "Рівень " + best),
        h("div", { class: "muted small", style: "margin-bottom:14px" },
          best >= 12 ? "Фотографічна пам'ять не за горами! 🏆" : "Ціль — рівень 12+. Дивись на матрицю як на одну картинку, а не окремі клітинки."),
        h("button", { class: "btn green big", onclick: intro }, "ЩЕ РАЗ")));
      renderMatrixStats();
    }

    function renderMatrixStats() {
      statsBox.innerHTML = "";
      const recs = App.store.records("visualMemory");
      if (!recs.length) return;
      const best = App.store.best("visualMemory", "best", "max");
      statsBox.append(h("div", { class: "card" },
        h("h2", null, "Динаміка матриці (ціль 12)"),
        h("div", { class: "row", style: "gap:24px;align-items:center" },
          h("div", null,
            h("div", { class: "big-num yellow" }, best ? String(best) : "—"),
            h("div", { class: "tiny muted" }, "рекорд (рівень)")),
          App.ui.sparkline(recs.slice(-30).map(function (r) { return r.best; }), { w: 360, h: 60, goal: 12 }))));
    }

    intro();
    renderMatrixStats();
    root.append(box, statsBox);
    return function cleanup() { clearTimeouts(); };
  }

  /* ---------- каркас ---------- */

  function render(root) {
    let tab = "span";
    let innerCleanup = null;

    function build() {
      if (innerCleanup) { innerCleanup(); innerCleanup = null; }
      root.innerHTML = "";
      root.append(
        h("h1", { class: "page-title" }, "🧠 Пам'ять та увага"),
        h("div", { class: "page-sub" }, "Робоча пам'ять — найближча до інтелекту тренована навичка. Зорова матриця — твоє «все бачить»."),
        App.ui.tabBar([
          { id: "span", label: "🔢 Цифровий діапазон" },
          { id: "matrix", label: "👁️ Зорова матриця" },
        ], tab, function (id) { tab = id; build(); }));
      const body = h("div", { class: "fade-in" });
      root.append(body);
      innerCleanup = tab === "span" ? renderSpan(body) : renderMatrix(body);
    }

    build();
    // Space тисне видиму зелену кнопку (СТАРТ / ЩЕ РАЗ); під час вводу фокус у полі — обробник не спрацює
    App.primaryAction = function () {
      const btn = root.querySelector("button.btn.green.big");
      if (btn && btn.offsetParent !== null) { btn.click(); return true; }
      return false;
    };
    return function cleanup() { if (innerCleanup) innerCleanup(); };
  }

  return { id: "memory", title: "Пам'ять", icon: "🧠", render: render };
})();
