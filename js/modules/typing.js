/* Клавотренажер з українською розкладкою: зн/хв, точність, рекорди */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.typing = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  const SOURCES = [
    { id: "ua", label: "🇺🇦 Українські речення" },
    { id: "twist", label: "👄 Скоромовки" },
    { id: "en", label: "🇬🇧 English" },
    { id: "custom", label: "✍️ Свій текст" },
  ];
  const LENGTHS = [
    { id: "s", label: "Короткий", chars: 130 },
    { id: "m", label: "Середній", chars: 300 },
    { id: "l", label: "Довгий", chars: 550 },
  ];

  function buildText(sourceId, targetChars, customText) {
    if (sourceId === "custom") {
      return customText.trim().replace(/\s+/g, " ");
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
    let pos = 0;
    let errors = 0;
    let totalKeys = 0;
    let startTs = 0;
    let started = false;
    let finished = false;
    let statInt = null;

    const cpmEl = h("span", { class: "yellow", style: "font-weight:900;font-size:1.2rem" }, "0");
    const accEl = h("span", { style: "font-weight:800" }, "100%");
    const errEl = h("span", { style: "font-weight:800" }, "0");
    const progFill = h("div");

    const hiddenInput = h("input", { class: "hidden-input", type: "text", autocomplete: "off", spellcheck: "false" });
    const textBox = h("div", { class: "type-text blurred", tabindex: "0" });
    const resultBox = h("div");

    const customArea = h("textarea", { rows: 3, placeholder: "Встав свій текст для друку…", style: sourceId === "custom" ? "margin-top:10px" : "display:none" });
    customArea.value = App.store.pref("typing.customText", "");

    function newText() {
      const lenDef = LENGTHS.find(function (l) { return l.id === lengthId; }) || LENGTHS[1];
      if (sourceId === "custom") App.store.setPref("typing.customText", customArea.value);
      text = buildText(sourceId, lenDef.chars, customArea.value);
      if (!text || text.length < 10) {
        text = "Встав довший текст у поле вище і натисни «Новий текст».";
      }
      chars = Array.from(text);
      pos = 0; errors = 0; totalKeys = 0; started = false; finished = false;
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

    function minutes() { return (performance.now() - startTs) / 60000; }

    function updateLive() {
      if (!started || finished) return;
      const m = Math.max(minutes(), 1 / 60);
      cpmEl.textContent = String(Math.round(pos / m));
      accEl.textContent = totalKeys ? Math.round((totalKeys - errors) / totalKeys * 100) + "%" : "100%";
      errEl.textContent = String(errors);
      progFill.style.width = (pos / chars.length * 100) + "%";
    }

    function finish() {
      finished = true;
      const m = Math.max(minutes(), 1 / 60);
      const cpm = Math.round(chars.length / m);
      const wordCount = text.split(/\s+/).length;
      const wpm = Math.round(wordCount / m);
      const acc = totalKeys ? Math.round((totalKeys - errors) / totalKeys * 100) : 100;
      const prevBest = App.store.best("typing", "cpm", "max");
      App.store.addRecord("typing", { cpm: cpm, wpm: wpm, accuracy: acc, errors: errors, chars: chars.length, source: sourceId });
      if (prevBest === null || cpm > prevBest) App.ui.toast("🏆 Новий рекорд друку: " + cpm + " зн/хв");
      progFill.style.width = "100%";
      resultBox.innerHTML = "";
      resultBox.append(h("div", { class: "card inner", style: "text-align:center;margin-top:14px" },
        h("div", { class: "stat-cards" },
          App.ui.statCard(String(cpm), "зн/хв"),
          App.ui.statCard(String(wpm), "слів/хв"),
          App.ui.statCard(acc + "%", "точність"),
          App.ui.statCard(App.ui.fmtClock(m * 60), "час")),
        h("div", { class: "muted small", style: "margin:10px 0" },
          cpm >= 400 ? "Ціль 400 зн/хв узята! 🔥" :
            (acc < 95 ? "Спершу точність 97%+, швидкість прийде сама." : "До цілі 400 зн/хв лишилось " + (400 - cpm) + ".")),
        h("button", { class: "btn green", onclick: newText }, "ЩЕ РАЗ")));
      renderRecords();
    }

    function onInput() {
      const val = hiddenInput.value;
      hiddenInput.value = "";
      if (!val || finished) return;
      Array.from(val).forEach(function (c) {
        if (finished) return;
        if (!started) {
          started = true;
          startTs = performance.now();
        }
        totalKeys++;
        const expected = chars[pos];
        if (c === expected) {
          spans[pos].classList.remove("cur", "err");
          spans[pos].classList.add("ok");
          pos++;
          if (pos >= chars.length) { updateLive(); finish(); return; }
          spans[pos].classList.add("cur");
          spans[pos].scrollIntoView({ block: "nearest" });
        } else {
          errors++;
          const sp = spans[pos];
          sp.classList.add("err");
          setTimeout(function () { sp.classList.remove("err"); }, 300);
        }
      });
      updateLive();
    }

    hiddenInput.addEventListener("input", onInput);
    hiddenInput.addEventListener("focus", function () { textBox.classList.remove("blurred"); });
    hiddenInput.addEventListener("blur", function () { textBox.classList.add("blurred"); });
    textBox.addEventListener("click", function () { hiddenInput.focus(); });
    textBox.addEventListener("focus", function () { hiddenInput.focus(); });

    statInt = setInterval(updateLive, 500);

    const recordsBox = h("div");

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
      h("div", { class: "page-sub" }, "Як клавогонки, але з українською. Помилка не пропускає далі — натисни правильну клавішу."),
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
          "Не забудь перемкнути розкладку на потрібну мову. Клік по тексту — і друкуй.")),
      recordsBox);

    newText();
    renderRecords();

    return function cleanup() { if (statInt) clearInterval(statInt); };
  }

  return { id: "typing", title: "Друк", icon: "⌨️", render: render };
})();
