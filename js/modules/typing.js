/* Клавотренажер з українською розкладкою: зн/хв, точність, рекорди */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.typing = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const SOURCES = [
    { id: "ua", label: "🇺🇦 Українські речення" },
    { id: "passages", label: "📚 Зв'язні тексти" },
    { id: "twist", label: "👄 Скоромовки" },
    { id: "en", label: "🇬🇧 English" },
    { id: "custom", label: "✍️ Свій текст" },
  ];
  const LENGTHS = [
    { id: "s", label: "Короткий", chars: 130 },
    { id: "m", label: "Середній", chars: 300 },
    { id: "l", label: "Довгий", chars: 550 },
  ];
  const MAX_CPM = 1500; // фізична стеля зн/хв; вище — зіпсований запис, не зберігаємо

  function buildText(sourceId, targetChars, customText) {
    if (sourceId === "custom") {
      return customText.trim().replace(/\s+/g, " ");
    }
    if (sourceId === "passages") {
      const pool = App.data.passages || [];
      if (!pool.length) return "";
      const withW = pool.map(function (p) { return { text: p.text, w: p.text.split(/\s+/).length }; });
      let cand;
      if (targetChars <= 130) cand = withW.filter(function (x) { return x.w <= 95; });
      else if (targetChars <= 300) cand = withW.filter(function (x) { return x.w > 95 && x.w <= 140; });
      else cand = withW.filter(function (x) { return x.w > 140; });
      if (!cand.length) cand = withW;
      return App.ui.rnd(cand).text; // один цілий зв'язний текст
    }
    let bank;
    if (sourceId === "ua") bank = App.data.typingUA;
    else if (sourceId === "en") bank = App.data.typingEN;
    else bank = App.data.twisters.map(function (t) { return t.text; });
    const pool = App.ui.shuffle(bank);
    let out = "";
    let i = 0;
    while (out.length < targetChars && i < pool.length) {
      out += (out ? " " : "") + pool[i];
      i++;
    }
    return out;
  }

  function render(root) {
    let sourceId = App.store.pref("typing.source", "ua");
    let lengthId = App.store.pref("typing.length", "m");

    let text = "";
    let chars = [];
    let spans = [];
    let typedState = [];   // на кожен індекс: "ok" | "wrong" | null
    let pos = 0;           // індекс наступного символу (курсор)
    let totalKeys = 0;     // усі натискання друкованих клавіш
    let wrongKeys = 0;     // помилкові натискання (для точності)
    let started = false;
    let finished = false;
    let statInt = null;
    // пауза таймера при втраті фокусу
    let accumMs = 0;
    let runStart = 0;
    let focused = false;
    let lastHint = 0;

    const cpmEl = h("span", { class: "yellow", style: "font-weight:900;font-size:1.2rem" }, "0");
    const accEl = h("span", { style: "font-weight:800" }, "100%");
    const errEl = h("span", { style: "font-weight:800" }, "0");
    const progFill = h("div");

    const hiddenInput = h("input", { class: "hidden-input", type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false" });
    const textBox = h("div", { class: "type-text blurred", tabindex: "0" });
    const resultBox = h("div");

    const customArea = h("textarea", { rows: 3, placeholder: "Встав свій текст для друку…", style: sourceId === "custom" ? "margin-top:10px" : "display:none" });
    customArea.value = App.store.pref("typing.customText", "");

    /* нормалізація: ґ↔г, будь-яке тире → "-", будь-який апостроф → "'", лапки → '"', nbsp → пробіл */
    const RE_APOS = /[’‘ʼ`´']/;
    const RE_DASH = /[—–−‒‐‑\-]/;
    const RE_QUOTE = /[«»„“”]/;
    function norm(ch) {
      if (ch === "ґ") return "г";
      if (ch === "Ґ") return "Г";
      if (ch === " ") return " ";
      if (RE_APOS.test(ch)) return "'";
      if (RE_DASH.test(ch)) return "-";
      if (RE_QUOTE.test(ch)) return '"';
      return ch;
    }
    function matches(typed, expected) {
      return typed === expected || norm(typed) === norm(expected);
    }

    function newText() {
      const lenDef = LENGTHS.find(function (l) { return l.id === lengthId; }) || LENGTHS[1];
      if (sourceId === "custom") App.store.setPref("typing.customText", customArea.value);
      text = buildText(sourceId, lenDef.chars, customArea.value);
      if (!text) {
        text = "Встав свій текст у поле вище і натисни «Новий текст».";
      }
      chars = Array.from(text);
      typedState = chars.map(function () { return null; });
      pos = 0; totalKeys = 0; wrongKeys = 0; started = false; finished = false;
      accumMs = 0; runStart = 0;
      resultBox.innerHTML = "";
      cpmEl.textContent = "0"; accEl.textContent = "100%"; errEl.textContent = "0";
      progFill.style.width = "0%";
      textBox.innerHTML = "";
      textBox.append(hiddenInput);
      spans = chars.map(function (c, i) {
        const sp = h("span", { class: i === 0 ? "cur" : "" }, c);
        textBox.append(sp);
        return sp;
      });
      hiddenInput.value = "";
      hiddenInput.focus();
    }

    function elapsedMs() {
      return accumMs + ((focused && started && !finished) ? performance.now() - runStart : 0);
    }

    function correctCount() {
      let c = 0;
      for (let i = 0; i < pos; i++) if (typedState[i] === "ok") c++;
      return c;
    }

    function allCorrect() {
      for (let i = 0; i < chars.length; i++) if (typedState[i] !== "ok") return false;
      return true;
    }

    function updateLive() {
      if (!started || finished) return;
      const m = Math.max(elapsedMs() / 60000, 1 / 60);
      cpmEl.textContent = String(Math.round(correctCount() / m));
      accEl.textContent = totalKeys ? Math.round((totalKeys - wrongKeys) / totalKeys * 100) + "%" : "100%";
      errEl.textContent = String(wrongKeys);
      progFill.style.width = (pos / chars.length * 100) + "%";
    }

    function hintFix() {
      const now = performance.now();
      if (now - lastHint < 1500) return;
      lastHint = now;
      App.ui.toast("Є помилки — зітри їх клавішею ⌫ (Backspace), щоб завершити", "info");
    }

    function typeChar(ch) {
      if (finished) return;
      if (pos >= chars.length) { hintFix(); return; } // дійшов до кінця з помилками — треба виправити
      if (!started) { started = true; focused = true; runStart = performance.now(); }
      totalKeys++;
      const ok = matches(ch, chars[pos]);
      if (!ok) wrongKeys++;
      typedState[pos] = ok ? "ok" : "wrong";
      spans[pos].classList.remove("cur");
      spans[pos].classList.add(ok ? "ok" : "wrong");
      pos++;
      if (pos < chars.length) {
        spans[pos].classList.add("cur");
        spans[pos].scrollIntoView({ block: "nearest" });
      } else if (allCorrect()) {
        updateLive();
        finish();
        return;
      }
      updateLive();
    }

    function backspace() {
      if (finished || pos <= 0) return;
      if (pos < chars.length) spans[pos].classList.remove("cur");
      pos--;
      typedState[pos] = null;
      spans[pos].classList.remove("ok", "wrong");
      spans[pos].classList.add("cur");
      spans[pos].scrollIntoView({ block: "nearest" });
      updateLive();
    }

    function finish() {
      const elapsed = elapsedMs(); // зчитати ДО finished=true, інакше живий відрізок обнулиться
      finished = true;
      const m = Math.max(elapsed / 60000, 1 / 60);
      const cpm = Math.round(chars.length / m);
      const wordCount = text.split(/\s+/).length;
      const wpm = Math.round(wordCount / m);
      const acc = totalKeys ? Math.round((totalKeys - wrongKeys) / totalKeys * 100) : 100;
      const prevBest = App.store.best("typing", "cpm", "max");
      App.store.addTime("typing", elapsed);
      // захист від зіпсованих значень (нереальна швидкість) — не псуємо рекорд
      if (cpm <= MAX_CPM) {
        App.store.addRecord("typing", { cpm: cpm, wpm: wpm, accuracy: acc, errors: wrongKeys, chars: chars.length, source: sourceId, length: lengthId });
        if (prevBest === null || cpm > prevBest) App.ui.toast("🏆 Новий рекорд друку: " + cpm + " зн/хв");
      }
      progFill.style.width = "100%";
      resultBox.innerHTML = "";
      const againBtn = h("button", { class: "btn green", onclick: newText }, "ЩЕ РАЗ");
      resultBox.append(h("div", { class: "card inner", style: "text-align:center;margin-top:14px" },
        h("div", { class: "stat-cards" },
          App.ui.statCard(String(cpm), "зн/хв"),
          App.ui.statCard(String(wpm), "слів/хв"),
          App.ui.statCard(acc + "%", "точність"),
          App.ui.statCard(App.ui.fmtClock(m * 60), "час")),
        h("div", { class: "muted small", style: "margin:10px 0" },
          cpm >= 400 ? "Ціль 400 зн/хв узята! 🔥" :
            (acc < 95 ? "Спершу точність 97%+, швидкість прийде сама." : "До цілі 400 зн/хв лишилось " + (400 - cpm) + ".")),
        againBtn));
      renderRecords();
      // фокус на «ЩЕ РАЗ» — щоб Space/Enter одразу запускали наступний текст
      textBox.classList.remove("blurred");
      againBtn.focus({ preventScroll: true });
    }

    function onKeyDown(e) {
      if (finished) return;
      if (e.key === "Backspace") { e.preventDefault(); backspace(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return; // не чіпаємо комбінації
      if (e.key && e.key.length === 1) { e.preventDefault(); typeChar(e.key); }
      else if (e.key === "Enter") { e.preventDefault(); typeChar("\n"); }
    }

    hiddenInput.addEventListener("keydown", onKeyDown);
    hiddenInput.addEventListener("input", function () { hiddenInput.value = ""; }); // глушимо IME/вставку
    hiddenInput.addEventListener("focus", function () {
      textBox.classList.remove("blurred");
      focused = true;
      if (started && !finished) runStart = performance.now();
    });
    hiddenInput.addEventListener("blur", function () {
      if (!finished) textBox.classList.add("blurred"); // після фінішу лишаємо текст чітким (фокус іде на «ЩЕ РАЗ»)
      if (focused && started && !finished) accumMs += performance.now() - runStart; // пауза таймера
      focused = false;
    });
    textBox.addEventListener("mousedown", function (e) { e.preventDefault(); hiddenInput.focus(); });

    statInt = setInterval(updateLive, 300);

    const recordsBox = h("div");

    function recLen(r) {
      if (r.length) return r.length;
      const c = typeof r.chars === "number" ? r.chars : 300;
      return c < 215 ? "s" : c < 425 ? "m" : "l"; // межі між цілями 130/300/550
    }

    function renderMatrix() {
      const recs = App.store.records("typing").filter(function (r) {
        return typeof r.cpm === "number" && r.cpm <= MAX_CPM;
      });
      const best = {}; // best[source][lenId] = record; для custom — best.custom.x
      let top = 0;
      recs.forEach(function (r) {
        const src = r.source || "ua";
        const key = src === "custom" ? "x" : recLen(r);
        best[src] = best[src] || {};
        if (!best[src][key] || r.cpm > best[src][key].cpm) best[src][key] = r;
        if (r.cpm > top) top = r.cpm;
      });
      function cell(rec) {
        if (!rec) return h("td", { class: "muted" }, "—");
        const isTop = rec.cpm === top;
        return h("td", { style: isTop ? "color:var(--yellow);font-weight:900" : "font-weight:800" },
          (isTop ? "🏆 " : "") + rec.cpm,
          h("span", { class: "muted small" }, " · " + rec.accuracy + "%"));
      }
      const rows = ["ua", "twist", "en"].map(function (srcId) {
        const src = SOURCES.find(function (s) { return s.id === srcId; });
        const row = best[srcId] || {};
        return h("tr", null, h("td", null, src.label), cell(row.s), cell(row.m), cell(row.l));
      });
      const cRec = (best.custom || {}).x;
      const customRow = h("tr", null,
        h("td", null, SOURCES.find(function (s) { return s.id === "custom"; }).label),
        cRec
          ? h("td", { colspan: "3", style: "text-align:center;font-weight:800" }, String(cRec.cpm),
            h("span", { class: "muted small" }, " · " + cRec.accuracy + "% · будь-яка довжина"))
          : h("td", { colspan: "3", class: "muted", style: "text-align:center" }, "—"));
      return h("div", { class: "card" },
        h("h2", null, "🏆 Рекорди за режимами"),
        h("div", { class: "muted small", style: "margin-bottom:10px" },
          "Найкраща швидкість (зн/хв) для кожного джерела й довжини."),
        h("table", { class: "results" },
          h("tr", null, h("th", null, "Джерело"), h("th", null, "Короткий"), h("th", null, "Середній"), h("th", null, "Довгий")),
          rows, customRow));
    }

    function renderRecords() {
      recordsBox.innerHTML = "";
      const recs = App.store.records("typing");
      const best = App.store.best("typing", "cpm", "max");
      recordsBox.append(h("div", { class: "card" },
        h("h2", null, "Прогрес (ціль 400 зн/хв)"),
        h("div", { class: "row", style: "gap:24px;align-items:center" },
          h("div", null,
            h("div", { class: "big-num yellow" }, best ? String(best) : "—"),
            h("div", { class: "tiny muted" }, "рекорд зн/хв")),
          App.ui.sparkline(recs.slice(-25).map(function (r) { return r.cpm; }), { w: 380, h: 64, goal: 400 })),
        recs.length ? h("table", { class: "results", style: "margin-top:12px" },
          h("tr", null, h("th", null, "зн/хв"), h("th", null, "Точність"), h("th", null, "Знаків"), h("th", null, "Джерело"), h("th", null, "Дата")),
          recs.slice(-8).reverse().map(function (r) {
            const src = SOURCES.find(function (s) { return s.id === r.source; });
            return h("tr", null,
              h("td", { style: "font-weight:800" }, String(r.cpm)),
              h("td", null, r.accuracy + "%"),
              h("td", null, String(r.chars)),
              h("td", null, src ? src.label : r.source),
              h("td", null, App.ui.fmtDate(r.date)));
          })) : null));
      recordsBox.append(renderMatrix());
    }

    const sourceSel = h("select", null, SOURCES.map(function (s) {
      return h("option", { value: s.id }, s.label);
    }));
    sourceSel.value = sourceId;
    sourceSel.addEventListener("change", function () {
      sourceId = sourceSel.value;
      App.store.setPref("typing.source", sourceId);
      customArea.style.display = sourceId === "custom" ? "" : "none";
      newText();
    });

    const lenChips = h("div", { class: "row" });
    LENGTHS.forEach(function (l) {
      lenChips.append(h("button", {
        class: "chip" + (l.id === lengthId ? " active" : ""),
        onclick: function () {
          lengthId = l.id;
          App.store.setPref("typing.length", lengthId);
          Array.prototype.forEach.call(lenChips.children, function (el, i) {
            el.classList.toggle("active", LENGTHS[i].id === lengthId);
          });
          newText();
        },
      }, l.label));
    });

    root.append(
      h("h1", { class: "page-title" }, "⌨️ Клавотренажер"),
      h("div", { class: "page-sub" }, "Як клавогонки, але з українською. Помилки підсвічуються червоним — друкуй далі, а виправляй клавішею ⌫."),
      h("div", { class: "card fade-in" },
        h("div", { class: "row", style: "gap:14px" },
          h("div", { class: "field" }, h("span", null, "Джерело"), sourceSel),
          h("div", { class: "field" }, h("span", null, "Довжина"), lenChips),
          h("div", { class: "spacer" }),
          h("button", { class: "btn", onclick: newText }, "🔄 Новий текст")),
        customArea),
      h("div", { class: "card fade-in" },
        h("div", { class: "row", style: "gap:22px;margin-bottom:12px;font-weight:700" },
          h("span", { class: "muted" }, "Швидкість: ", cpmEl, " зн/хв"),
          h("span", { class: "muted" }, "Точність: ", accEl),
          h("span", { class: "muted" }, "Помилки: ", errEl)),
        h("div", { class: "progress thin", style: "margin-bottom:14px" }, progFill),
        textBox,
        resultBox,
        h("div", { class: "tiny muted", style: "margin-top:10px" },
          "Клік по тексту — і друкуй. «ґ» зараховує й «г»; довге тире — і апостроф ' приймаються спрощено. Курсор поза текстом — таймер на паузі.")),
      recordsBox);

    newText();
    renderRecords();

    return function cleanup() { if (statInt) clearInterval(statInt); };
  }

  return { id: "typing", title: "Друк", icon: "⌨️", render: render };
})();
