/* Таблиці Шульте: розміри 3×3–7×7, перемішування, зворотний порядок, марафон, рекорди */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.schulte = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const SIZES = [3, 4, 5, 6, 7];
  const MARATHON_CELLS = SIZES.reduce(function (s, x) { return s + x * x; }, 0); // 135 чисел за коло

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

  /* оцінка часу. Час на клітинку росте з розміром сітки (більша таблиця —
     складніший зоровий пошук), тож «феноменально»-поріг ∝ size⁴, а не просто
     к-сть клітинок × const. Решта тірів — кратні цьому порогу. */
  function eliteSec(size) { return size * size * size * size / 32; } // поріг «феноменально», с
  const MARATHON_ELITE = SIZES.reduce(function (s, sz) { return s + eliteSec(sz); }, 0);
  const TIER_MULT = { great: 1.5, good: 2.25, mid: 3.25 };

  function evalSec(elite, ms) {
    const s = ms / 1000;
    if (s <= elite) return { text: "Феноменально! 🏆", cls: "tier-elite" };
    if (s <= elite * TIER_MULT.great) return { text: "Відмінно! 🔥", cls: "tier-great" };
    if (s <= elite * TIER_MULT.good) return { text: "Добре 👍", cls: "tier-good" };
    if (s <= elite * TIER_MULT.mid) return { text: "Середньо — є куди рости", cls: "tier-mid" };
    return { text: "Повільно — тренуйся щодня", cls: "tier-slow" };
  }

  function evaluate(size, ms) { return evalSec(eliteSec(size), ms); }

  /* Штраф за помилки: 1 помилка = +1 секунда до результату.
     У записі зберігаємо ЧИСТИЙ час (timeMs) і кількість помилок, а результат (score) —
     завжди рахуємо на льоту. Так штраф однаково діє й на старі записи, без міграції. */
  const ERR_PENALTY_MS = 1000;
  function scoreOf(r) { return (r.timeMs || 0) + (r.errors || 0) * ERR_PENALTY_MS; }

  function evaluateRec(r) {
    const sc = scoreOf(r);
    return r.marathon ? evalSec(MARATHON_ELITE * r.games, sc) : evaluate(r.size, sc);
  }

  /* орієнтири часу (стовпчиком, кожен рівень своїм кольором) */
  function benchmarkEl(title, size) {
    const e = eliteSec(size);
    return h("div", { class: "tiny", style: "margin-top:10px;line-height:1.9" },
      h("div", { class: "muted", style: "font-weight:800" }, title),
      h("div", { class: "tier-elite" }, "🏆 < " + Math.round(e) + " с — феноменально"),
      h("div", { class: "tier-great" }, "🔥 < " + Math.round(e * TIER_MULT.great) + " с — відмінно"),
      h("div", { class: "tier-good" }, "👍 < " + Math.round(e * TIER_MULT.good) + " с — добре"),
      h("div", { class: "tier-mid" }, "⏳ < " + Math.round(e * TIER_MULT.mid) + " с — середньо"),
      h("div", { class: "tier-slow" }, "повільніше — тренуйся щодня"),
      h("div", { class: "muted", style: "margin-top:4px" }, "Дивись лише в центр таблиці!"));
  }

  /* око-якір для центру таблиці (колір як у цифр) */
  const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#4a4458" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3.2" fill="#4a4458" stroke="none"/></svg>';

  function render(root) {
    let size = App.store.pref("schulte.size", 5);
    let opts = Object.assign(
      { shuffle: false, reverse: false, hideFound: true, dot: true, hint: true, marathon: false },
      App.store.pref("schulte.opts", {}));
    let marathonGames = App.store.pref("schulte.marathonGames", 3);

    let cells = [];      // {num, btn}
    let numberCount = 0; // скільки клітинок із числами (на непарних з оком — на 1 менше)
    let seq = [];        // послідовність чисел, які треба натискати
    let seqIdx = 0;
    let errors = 0;
    let running = false;
    let startTs = 0;
    let timerInt = null;
    let marathon = null;     // {games, sizeIdx, game, totalMs, totalErrors}
    let nextTimeout = null;  // авто-перехід між іграми марафону

    const timerEl = h("div", { class: "timer-big" }, "0.00 с");
    const marathonEl = h("div", { class: "yellow", style: "font-weight:800;display:none" });
    const nextEl = h("div", { class: "muted", style: "font-weight:800;font-size:1.1rem;min-width:90px" }, "—");
    const errEl = h("div", { class: "muted", style: "font-weight:800" }, "");
    const recordEl = h("div", { class: "schulte-records" });
    const todayEl = h("div", { class: "tiny muted", style: "font-weight:700" });
    const grid = h("div", { class: "schulte-grid" });
    const sidePanel = h("div", { class: "schulte-side" });

    function savePrefs() {
      App.store.setPref("schulte.size", size);
      App.store.setPref("schulte.opts", opts);
      App.store.setPref("schulte.marathonGames", marathonGames);
    }

    function stopTimer() {
      if (timerInt) { clearInterval(timerInt); timerInt = null; }
    }

    function clearNext() {
      if (nextTimeout) { clearTimeout(nextTimeout); nextTimeout = null; }
    }

    function cancelMarathon() {
      marathon = null;
      clearNext();
      marathonEl.style.display = "none";
    }

    function showOverlay(content) {
      const old = grid.querySelector(".schulte-overlay");
      if (old) old.remove();
      if (content) grid.append(h("div", { class: "schulte-overlay" }, content));
    }

    function applySize(sz) {
      size = sz;
      App.store.setPref("schulte.size", size);
      buildGrid();
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
      errEl.textContent = errors ? "помилок: " + errors + " (+" + errors + " с)" : "";
      if (marathon) {
        marathonEl.style.display = "";
        marathonEl.textContent = "🏁 " + size + "×" + size + " · гра " + marathon.game + "/" + marathon.games;
      } else {
        marathonEl.style.display = "none";
      }
      updateRecord();
      updateToday();
    }

    /* найкращий час для розміру (будь-який режим, окремі ігри + ігри марафону) */
    function bestAnyMode(sz) {
      let best = null;
      App.store.records("schulte").forEach(function (r) {
        if (!r.marathon && r.size === sz) { const sc = scoreOf(r); if (best === null || sc < best) best = sc; }
      });
      return best;
    }

    /* рекорди по всіх розмірах — у hud, поточний підсвічений */
    function updateRecord() {
      recordEl.innerHTML = "";
      recordEl.append(h("div", { class: "tiny muted", style: "font-weight:800;margin-bottom:3px" }, "🏆 рекорди"));
      SIZES.forEach(function (sz) {
        const best = bestAnyMode(sz);
        recordEl.append(h("div", { class: "rec-row" + (sz === size ? " cur" : "") },
          h("span", null, sz + "×" + sz),
          h("span", null, best !== null ? App.ui.fmtMs(best) : "—")));
      });
    }

    /* зіграний час у Шульте за сьогодні (сума тривалостей завершених ігор) */
    function updateToday() {
      const ms = App.store.timeToday("schulte");
      todayEl.textContent = "🕐 сьогодні в Шульте: " + App.ui.fmtClock(ms / 1000);
    }

    /* показ таймера = чистий час + штраф за помилки (тому клік мимо одразу додає секунду) */
    function tick() {
      timerEl.textContent = App.ui.fmtMs(performance.now() - startTs + errors * ERR_PENALTY_MS);
    }

    /* запуск одного раунду на поточному розмірі */
    function startRound() {
      stopTimer();
      clearNext();
      buildGrid();
      const all = Array.from({ length: numberCount }, function (_, i) { return i + 1; });
      seq = opts.reverse ? all.slice().reverse() : all;
      seqIdx = 0;
      errors = 0;
      running = true;
      startTs = performance.now();
      timerInt = setInterval(tick, 47);
      showOverlay(null);
      updateInfo();
      stopBtn.style.display = "";
    }

    function start() {
      if (opts.marathon) {
        marathon = { games: marathonGames, sizeIdx: 0, game: 1, totalMs: 0, totalErrors: 0 };
        applySize(SIZES[0]);
        renderSide();
      }
      startRound();
    }

    function stopRun() {
      if (!running && !marathon && !nextTimeout) return;
      const wasMarathon = !!marathon;
      const done = marathon ? (marathon.done || 0) : 0;
      running = false;
      stopTimer();
      cancelMarathon();
      timerEl.textContent = "0.00 с";
      stopBtn.style.display = "none";
      buildGrid();
      showIdleOverlay();
      updateInfo();
      renderSide(); // показати щойно зараховані ігри марафону
      if (wasMarathon && done) App.ui.toast("Марафон зупинено · зараховано ігор: " + done);
    }

    function finish() {
      running = false;
      stopTimer();
      const rawMs = performance.now() - startTs;   // чистий час — він іде в облік зіграного
      const ms = rawMs + errors * ERR_PENALTY_MS;  // результат зі штрафом
      timerEl.textContent = App.ui.fmtMs(ms);
      if (marathon) { finishMarathonGame(rawMs, ms); return; }
      stopBtn.style.display = "none";
      const mode = modeKey(opts);
      const prevBest = bestFor(size, mode);
      App.store.addTime("schulte", rawMs);
      App.store.addRecord("schulte", { size: size, mode: mode, timeMs: Math.round(rawMs), errors: errors });
      const isRecord = prevBest === null || ms < prevBest;
      if (isRecord) App.ui.toast("🏆 Новий рекорд " + size + "×" + size + ": " + App.ui.fmtMs(ms));
      const ev = evaluate(size, ms);
      showOverlay([
        h("div", { class: "big-num" }, App.ui.fmtMs(ms)),
        h("div", { class: ev.cls, style: "font-weight:800;font-size:1.1rem" }, ev.text),
        errors ? h("div", { class: "muted" }, "Помилок: " + errors + " · чистий час " + App.ui.fmtMs(rawMs) + " +" + errors + " с штрафу") : null,
        isRecord ? h("div", { class: "yellow", style: "font-weight:900" }, "🏆 Особистий рекорд!") : null,
        h("button", { class: "btn green big", onclick: start }, "ЗАНОВО"),
      ]);
      renderSide();
      updateInfo();
    }

    /* завершення однієї гри марафону: гра зараховується окремим записом */
    function finishMarathonGame(rawMs, ms) {
      const mode = modeKey(opts);
      App.store.addTime("schulte", rawMs);
      App.store.addRecord("schulte", { size: size, mode: mode, timeMs: Math.round(rawMs), errors: errors, mar: true });
      marathon.totalMs += ms;
      marathon.totalErrors += errors;
      marathon.done = (marathon.done || 0) + 1;
      const finishedLabel = size + "×" + size;
      // що далі?
      if (marathon.game < marathon.games) {
        marathon.game++;
      } else if (marathon.sizeIdx < SIZES.length - 1) {
        marathon.sizeIdx++;
        marathon.game = 1;
        applySize(SIZES[marathon.sizeIdx]);
      } else {
        finishMarathon();
        return;
      }
      const nextLabel = SIZES[marathon.sizeIdx] + "×" + SIZES[marathon.sizeIdx] + " · гра " + marathon.game + "/" + marathon.games;
      showOverlay([
        h("div", { class: "big-num" }, App.ui.fmtMs(ms)),
        h("div", { class: "muted small" }, finishedLabel + " готово · разом " + App.ui.fmtMs(marathon.totalMs)),
        h("div", { class: "yellow", style: "font-weight:900" }, "Далі: " + nextLabel),
        h("button", { class: "btn green", onclick: continueMarathon }, "ДАЛІ (Space)"),
      ]);
      updateInfo();
      renderSide(); // оновити плитку розміру й показати зараховану гру в результатах
      nextTimeout = setTimeout(continueMarathon, 1400);
    }

    function continueMarathon() {
      if (!marathon) return;
      clearNext();
      startRound();
    }

    function finishMarathon() {
      const total = Math.round(marathon.totalMs);
      const totalErrors = marathon.totalErrors;
      const games = marathon.games;
      const done = marathon.done || 0;
      cancelMarathon();
      stopBtn.style.display = "none";
      const ev = evalSec(MARATHON_ELITE * games, total);
      showOverlay([
        h("div", { style: "font-weight:900;font-size:1.1rem" }, "🏁 Марафон пройдено!"),
        h("div", { class: "big-num" }, App.ui.fmtMs(total)),
        h("div", { class: ev.cls, style: "font-weight:800" }, ev.text),
        h("div", { class: "muted small" }, "3×3 → 7×7, " + done + " ігор · помилок: " + totalErrors),
        h("div", { class: "tiny muted" }, "Кожна гра зарахована окремо в результати"),
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
        tick(); // секунда штрафу видно на таймері одразу
        updateInfo();
      }
    }

    function bestFor(sz, mode) {
      let best = null;
      App.store.records("schulte").forEach(function (r) {
        if (!r.marathon && r.size === sz && (r.mode || "") === mode) {
          const sc = scoreOf(r);
          if (best === null || sc < best) best = sc;
        }
      });
      return best;
    }

    function setSize(sz) {
      if (sz === size && !marathon) return;
      cancelMarathon();
      running = false; stopTimer();
      stopBtn.style.display = "none";
      size = sz; savePrefs();
      buildGrid(); showIdleOverlay(); renderSide(); updateInfo();
      timerEl.textContent = "0.00 с";
    }

    /* лівий Shift — наступний розмір, правий — попередній */
    function onShift(e) {
      if (e.key !== "Shift") return;
      const tag = ((e.target && e.target.tagName) || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const i = SIZES.indexOf(size);
      if (e.code === "ShiftLeft") setSize(SIZES[(i + 1) % SIZES.length]);
      else if (e.code === "ShiftRight") setSize(SIZES[(i - 1 + SIZES.length) % SIZES.length]);
    }

    function renderSide() {
      sidePanel.innerHTML = "";

      const sizeChips = h("div", { class: "row" });
      SIZES.forEach(function (sz) {
        sizeChips.append(h("button", {
          class: "chip" + (sz === size ? " active" : ""),
          onclick: function () { setSize(sz); },
        }, sz + "×" + sz));
      });

      function optToggle(key, label, hintText) {
        const cb = h("input", {
          type: "checkbox",
          onchange: function () {
            opts[key] = cb.checked; savePrefs();
            if (!running && (key === "dot" || key === "marathon")) { buildGrid(); showIdleOverlay(); }
            updateInfo();
            renderSide();
          },
        });
        cb.checked = !!opts[key];
        return h("label", { class: "opt", title: hintText || "" }, cb, label);
      }

      /* повзунок кількості ігор на розмір у марафоні */
      const gamesVal = h("span", { class: "yellow", style: "font-weight:900" }, "×" + marathonGames);
      const gamesRange = h("input", { type: "range", min: 2, max: 10, step: 1, style: "flex:1" });
      gamesRange.value = marathonGames;
      gamesRange.addEventListener("input", function () {
        marathonGames = parseInt(gamesRange.value, 10);
        gamesVal.textContent = "×" + marathonGames;
      });
      gamesRange.addEventListener("change", function () {
        savePrefs();
        renderSide();
      });
      const marathonRow = h("div", {
        class: "row",
        style: "gap:10px;margin-top:4px;padding-left:26px;" + (opts.marathon ? "" : "display:none"),
      },
        h("span", { class: "tiny muted", style: "font-weight:700" }, "ігор на розмір:"),
        gamesRange, gamesVal);

      sidePanel.append(h("div", { class: "card" },
        h("h2", null, "Налаштування"),
        sizeChips,
        h("div", { style: "display:flex;flex-direction:column;gap:9px;margin-top:14px" },
          optToggle("shuffle", "Перемішувати після кліку", "Хардкор: цифри міняються місцями після кожного знайденого числа"),
          optToggle("reverse", "Зворотний порядок", "Шукай від найбільшого до 1"),
          optToggle("hideFound", "Затемнювати знайдені"),
          optToggle("dot", "Око в центрі", "Дивись на око в центрі, числа шукай периферійним зором"),
          optToggle("hint", "Показувати наступне число"),
          optToggle("marathon", "Марафон 3×3 → 7×7", "Проходиш усі розміри по черзі, по N ігор на кожному. Кожна гра зараховується окремо; наприкінці — сумарний час."),
          marathonRow),
        h("div", { class: "tiny muted", style: "margin-top:10px" },
          "Shift лівий / правий — наступний / попередній розмір · Space — старт",
          h("div", { style: "margin-top:4px" }, "⚠️ Помилка = +1 секунда до результату"))));

      // позначаємо ігри, що були особистим рекордом на момент гри (для свого розміру+режиму)
      const allRecs = App.store.records("schulte");
      const bestSoFar = {};
      const recordSet = new Set();
      allRecs.forEach(function (r) {
        const key = r.marathon ? ("M" + r.games + ":" + (r.mode || "")) : (r.size + ":" + (r.mode || ""));
        const prev = bestSoFar[key];
        const sc = scoreOf(r);
        if (prev === undefined || sc < prev) { bestSoFar[key] = sc; recordSet.add(r); }
      });

      const recent = allRecs.slice(-9).reverse();
      const tbl = h("table", { class: "results" },
        h("tr", null, h("th", null, "Розмір"), h("th", null, "Режим"), h("th", null, "Час"), h("th", null, "Пом."), h("th", null, "Дата")),
        recent.map(function (r) {
          // r.marathon — старий сумарний запис; r.mar — окрема гра марафону
          const isRec = recordSet.has(r);
          const sizeCell = (isRec ? "🏆 " : "") + (r.marathon ? "3→7" : r.size + "×" + r.size);
          const modeCell = r.marathon
            ? "🏁×" + r.games + (r.mode ? " " + modeShort(r.mode) : "")
            : (r.mar ? "🏁 " : "") + modeShort(r.mode || "");
          return h("tr", null,
            h("td", { class: isRec ? "yellow" : "", style: isRec ? "font-weight:900" : "", title: isRec ? "Особистий рекорд на момент гри" : "" }, sizeCell),
            h("td", { title: (r.marathon ? "марафон ×" + r.games + " · " : r.mar ? "марафон · " : "") + modeLabel(r.mode || "") }, modeCell),
            h("td", {
              class: evaluateRec(r).cls, style: "font-weight:800",
              title: r.errors ? "чистий час " + App.ui.fmtMs(r.timeMs) + " + " + r.errors + " с штрафу за помилки" : "",
            }, App.ui.fmtMs(scoreOf(r))),
            h("td", null, String(r.errors)),
            h("td", null, App.ui.fmtDate(r.date)));
        }));

      const flags = modeKey(opts);
      const headBest = bestFor(size, flags);

      sidePanel.append(h("div", { class: "card" },
        h("h2", null, "Результати"),
        h("div", { class: "row between", style: "margin-bottom:10px" },
          h("div", { class: "muted", style: "font-weight:700" }, size + "×" + size + " · рекорд"),
          h("div", { class: "yellow", style: "font-weight:900;font-size:1.1rem" }, headBest ? App.ui.fmtMs(headBest) : "—")),
        opts.marathon ? h("div", { class: "tiny muted", style: "margin:-4px 0 10px" }, "🏁 Марафон: кожна гра зараховується окремим рядком.") : null,
        recent.length ? tbl : h("div", { class: "muted small" }, "Зіграй першу таблицю — результати з'являться тут."),
        benchmarkEl("Орієнтир для " + size + "×" + size + ":", size)));
    }

    function showIdleOverlay() {
      showOverlay(opts.marathon ? [
        h("div", { style: "font-weight:800;font-size:1.15rem" }, "🏁 Марафон: 3×3 → 7×7"),
        h("div", { class: "muted small" }, "По " + marathonGames + " ігор на кожен розмір. Кожна гра — окремий результат, наприкінці сумарний час."),
        h("button", { class: "btn green big", onclick: start }, "СТАРТ"),
      ] : [
        h("div", { style: "font-weight:800;font-size:1.15rem" }, "Знайди всі числа " + (opts.reverse ? "від більшого до 1" : "по порядку")),
        h("div", { class: "muted small" }, "Тримай погляд у центрі. Час пішов після кліку на старт."),
        h("button", { class: "btn green big", onclick: start }, "СТАРТ"),
      ]);
    }

    const stopBtn = h("button", { class: "btn ghost", style: "display:none", onclick: stopRun }, "СТОП");

    root.append(
      h("h1", { class: "page-title" }, "🔢 Таблиці Шульте"),
      h("div", { class: "page-sub", style: "margin-bottom:12px" }, "Периферійний зір, швидкість пошуку та концентрація. Це твоє «все бачить»."),
      h("div", { class: "schulte-wrap fade-in" },
        h("div", { class: "schulte-stage" },
          h("div", { class: "schulte-hud" },
            timerEl, recordEl, marathonEl, nextEl, errEl,
            h("div", { class: "row", style: "margin-top:8px" }, stopBtn),
            todayEl),
          grid),
        sidePanel));

    buildGrid();
    showIdleOverlay();
    renderSide();
    updateInfo();

    App.primaryAction = function () {
      if (running) return false;
      if (marathon && nextTimeout) { continueMarathon(); return true; } // пропустити паузу між іграми
      if (!marathon) { start(); return true; }
      return false;
    };
    document.addEventListener("keydown", onShift);

    return function cleanup() {
      stopTimer();
      clearNext();
      document.removeEventListener("keydown", onShift);
    };
  }

  return { id: "schulte", title: "Шульте", icon: "🔢", render: render };
})();
