/* Швидкочитання: RSVP на випадкових статтях Вікіпедії + тест швидкості з питаннями */
window.App = window.App || {};
App.modules = App.modules || {};

App.modules.reading = (function () {
  const h = function () { return App.ui.h.apply(null, arguments); };

  function words(text) { return text.trim().split(/\s+/); }

  /* індекс літери оптимального розпізнавання (як у Spritz) */
  function orpIndex(len) {
    if (len <= 1) return 0;
    if (len <= 4) return 1;
    if (len <= 8) return 2;
    if (len <= 13) return 3;
    return 4;
  }

  /* ---------- генерація питань із прочитаного ---------- */

  function mkQuestion(q, correct, distractors) {
    const options = App.ui.shuffle([correct].concat(distractors));
    return { q: q, options: options, correct: options.indexOf(correct) };
  }

  /* унікальні «змістовні» слова (від 5 літер) у порядку появи */
  function poolWords(text) {
    if (!text) return [];
    const seen = {};
    const out = [];
    (text.match(/[А-Яа-яҐґЄєІіЇї'’]{5,}/g) || []).forEach(function (w) {
      const k = w.toLowerCase();
      if (!seen[k]) { seen[k] = true; out.push(w); }
    });
    return out;
  }

  /* слово для пропуску: не перше в реченні, з малої, від 5 літер.
     Перевага словам, для яких є дистрактори зі схожим закінченням (менш вгадуваний варіант). */
  function pickClozeWord(sentence, dWords) {
    const first = (sentence.trim().split(/\s+/)[0] || "").toLowerCase();
    const cand = (sentence.match(/[А-Яа-яҐґЄєІіЇї'’]{5,}/g) || [])
      .filter(function (w) { return w.toLowerCase() !== first && w[0] === w[0].toLowerCase(); });
    if (!cand.length) return null;
    if (dWords && dWords.length) {
      const good = cand.filter(function (w) {
        const end = w.toLowerCase().slice(-2);
        return dWords.filter(function (x) {
          return x.toLowerCase() !== w.toLowerCase() && x.toLowerCase().slice(-2) === end;
        }).length >= 2;
      });
      if (good.length) return App.ui.rnd(good);
    }
    return App.ui.rnd(cand);
  }

  /* власні назви: слова з великої літери НЕ на початку речення (імена, міста, річки) */
  function properNouns(text) {
    if (!text) return [];
    const seen = {}, out = [];
    (text.match(/(?<=[^.!?…«"'’(\n]\s)[А-ЯҐЄІЇ][а-яґєіїʼ'’-]{2,}/g) || []).forEach(function (w) {
      const k = w.toLowerCase();
      if (!seen[k]) { seen[k] = true; out.push(w); }
    });
    return out;
  }

  /* «про кого йшлося», коли власних назв немає */
  const SUBJECTS = [
    { label: "хлопчик або юнак", re: /хлопч|хлопец|хлопц|парубок|\bюнак|юнк/gi },
    { label: "дівчина або дівчинка", re: /дівчин|дівча|\bдівк/gi },
    { label: "дідусь або старий чоловік", re: /\bдід\b|дідус|\bстарий\b|старець|\bстарого\b/gi },
    { label: "бабуся або стара жінка", re: /бабус|\bбаба\b|\bстара\b/gi },
    { label: "жінка або мати", re: /жінк|жінц|\bмати\b|матір|\bмама\b|\bмами\b/gi },
    { label: "чоловік або батько", re: /чоловік|\bбатьк/gi },
    { label: "кіт або собака", re: /\bкіт\b|\bкота\b|\bкоти\b|собак|\bпес\b|\bпса\b|цуцен|кошен/gi },
    { label: "дитина", re: /дитин|\bмалюк/gi },
  ];

  function subjectQuestion(text) {
    const counts = SUBJECTS.map(function (s) {
      const m = text.match(s.re);
      return { label: s.label, n: m ? m.length : 0 };
    });
    const present = counts.filter(function (c) { return c.n > 0; }).sort(function (a, b) { return b.n - a.n; });
    if (!present.length) return null;
    const correct = present[0].label;
    const presentLabels = present.map(function (c) { return c.label; });
    const absent = App.ui.shuffle(SUBJECTS.map(function (s) { return s.label; })
      .filter(function (l) { return presentLabels.indexOf(l) < 0; }));
    let ds = absent.slice(0, 2);
    if (ds.length < 2) {
      ds = ds.concat(App.ui.shuffle(presentLabels.filter(function (l) { return l !== correct; })).slice(0, 2 - ds.length));
    }
    if (ds.length < 2) return null;
    return mkQuestion("Про кого здебільшого йшлося в тексті?", correct, ds);
  }

  /* питання про дійову особу: ім'я/назва або «про кого» */
  function whoQuestion(read) {
    const mine = properNouns(read.text);
    if (mine.length) {
      const dpn = App.ui.shuffle(properNouns(read.distractorText || "").filter(function (w) {
        return mine.every(function (m) { return m.toLowerCase() !== w.toLowerCase(); });
      }));
      if (dpn.length >= 2) {
        return mkQuestion("Чиє ім'я або яка назва згадувались у тексті?", App.ui.rnd(mine), dpn.slice(0, 2));
      }
    }
    return subjectQuestion(read.text);
  }

  function clozeQuestion(sentence, dWords) {
    const word = pickClozeWord(sentence, dWords);
    if (!word) return null;
    const ds = pickDistractors(word, dWords, 2);
    if (ds.length < 2) return null;
    return mkQuestion("Яке слово пропущено: «" + clipAround(sentence.replace(word, "___"), 150) + "»", word, ds);
  }

  /* дистрактори зі схожим закінченням (граматично правдоподібні), потім будь-які */
  function pickDistractors(word, pool, n) {
    const w = word.toLowerCase();
    const end = w.slice(-2);
    const diff = pool.filter(function (x) { return x.toLowerCase() !== w; });
    const same = App.ui.shuffle(diff.filter(function (x) { return x.toLowerCase().slice(-2) === end; }));
    const rest = App.ui.shuffle(diff.filter(function (x) { return x.toLowerCase().slice(-2) !== end; }));
    const pick = [];
    same.concat(rest).forEach(function (x) {
      if (pick.length < n && !pick.some(function (p) { return p.toLowerCase() === x.toLowerCase(); })) pick.push(x);
    });
    return pick;
  }

  function numDistractors(n) {
    let a, b;
    if (n >= 1000 && n <= 2100) { // схоже на рік
      a = n + App.ui.rndInt(1, 25);
      b = n - App.ui.rndInt(1, 25);
    } else {
      const d = Math.max(1, Math.round(n * 0.2));
      a = n + App.ui.rndInt(1, d + 2);
      b = Math.max(0, n - App.ui.rndInt(1, d + 2));
    }
    if (b === n || b === a) b = a + App.ui.rndInt(1, 9);
    return [String(a), String(b)];
  }

  function clip(s, max) {
    s = s.trim();
    return s.length <= max ? s : s.slice(0, max).trim() + "…";
  }

  function clipAround(s, max) {
    if (s.length <= max) return s;
    const i = Math.max(0, s.indexOf("___"));
    const start = Math.max(0, Math.min(i - Math.floor(max / 2), s.length - max));
    return (start > 0 ? "…" : "") + s.slice(start, start + max).trim() + "…";
  }

  function sentences(text) {
    return (text.match(/[^.!?…]+[.!?…]+/g) || [])
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 35 && s.length <= 170 && /\s/.test(s); });
  }

  /* 3 питання різного стилю: пізнавання речення + cloze + про дійову особу. */
  function buildQuiz(read) {
    const out = [];
    const dText = read.distractorText || "";
    const mine = App.ui.shuffle(sentences(read.text));
    const others = App.ui.shuffle(sentences(dText));
    const dWords = poolWords(dText);

    // 1) пізнавання речення
    if (mine.length && others.length >= 2) {
      out.push(mkQuestion("Яке речення було в тексті?",
        clip(mine[0], 150), [clip(others[0], 150), clip(others[1], 150)]));
    }

    // 2) cloze — пропуск слова (одне)
    let cloze = null;
    for (let i = 1; i < mine.length && !cloze; i++) cloze = clozeQuestion(mine[i], dWords);
    if (cloze) out.push(cloze);

    // 3) про дійову особу: ім'я/назва або «про кого йшлося»
    const who = whoQuestion(read);
    if (who) out.push(who);

    // добиваємо до 3, якщо чогось забракло
    for (let i = 1; i < mine.length && out.length < 3; i++) {
      const cz = clozeQuestion(mine[i], dWords);
      if (cz && !out.some(function (q) { return q.q === cz.q; })) out.push(cz);
    }
    if (out.length < 3) {
      const numSents = mine.filter(function (s) { return /\d{2,4}/.test(s); });
      if (numSents.length) {
        const s = App.ui.rnd(numSents);
        const num = s.match(/\d{2,4}/)[0];
        out.push(mkQuestion("Яке число пропущено: «" + clipAround(s.replace(num, "___"), 150) + "»",
          num, numDistractors(parseInt(num, 10))));
      }
    }

    return out.slice(0, 3);
  }

  /* ---------- RSVP ---------- */

  const LENGTHS = [
    { id: "s", label: "Короткий", words: 130, maxFetch: 8 },
    { id: "m", label: "Середній", words: 280, maxFetch: 14 },
    { id: "l", label: "Довгий", words: 550, maxFetch: 24 },
  ];

  function renderRSVP(root) {
    let wpm = App.store.pref("rsvp.wpm", 250);
    let chunk = App.store.pref("rsvp.chunk", 1);
    let accel = App.store.pref("rsvp.accel", 0); // +сл/хв за хвилину
    let fontPx = App.store.pref("rsvp.font", 46);
    let orpOn = App.store.pref("rsvp.orp", false);
    let lenId = App.store.pref("rsvp.len", "m");
    let quizOn = App.store.pref("rsvp.quiz", true);
    let adaptOn = App.store.pref("rsvp.adapt", false);
    let src = App.store.pref("rsvp.src", "prose"); // "prose" | "wiki"

    let tokens = [];
    let idx = 0;
    let running = false, paused = false;
    let timeoutId = null;
    let activeMs = 0;
    let startWpm = wpm;
    let wikiLoading = false;
    let disposed = false;
    let lastRead = null; // {titles, text, distractorTitles, distractorText}

    const wordEl = h("div", { class: "rsvp-word", style: "font-size:" + fontPx + "px;display:flex;align-items:baseline;width:100%" });
    const stage = h("div", { class: "rsvp-stage" }, wordEl);
    const progFill = h("div");
    const prog = h("div", { class: "progress thin", style: "margin-top:12px" }, progFill);
    const statusEl = h("div", { class: "row between muted small", style: "margin-top:8px;font-weight:700" });
    const wpmVal = h("span", { class: "yellow", style: "font-weight:900" }, wpm + " сл/хв");
    const wikiInfo = h("div", { class: "tiny muted", style: "margin-top:10px;display:none" });
    const quizBox = h("div");

    function lenDef() {
      return LENGTHS.find(function (l) { return l.id === lenId; }) || LENGTHS[1];
    }

    function setWpm(v) {
      wpm = Math.max(60, Math.min(1500, Math.round(v)));
      wpmRange.value = wpm;
      wpmVal.textContent = wpm + " сл/хв";
    }

    const wpmRange = h("input", { type: "range", min: 60, max: 1000, step: 10, style: "flex:1" });
    wpmRange.value = wpm;
    wpmRange.addEventListener("input", function () {
      setWpm(parseInt(wpmRange.value, 10));
      App.store.setPref("rsvp.wpm", wpm);
    });

    const lenChips = h("div", { class: "row" });
    LENGTHS.forEach(function (l) {
      lenChips.append(h("button", {
        class: "chip" + (l.id === lenId ? " active" : ""),
        title: "≈ " + l.words + " слів",
        onclick: function () {
          lenId = l.id;
          App.store.setPref("rsvp.len", lenId);
          Array.prototype.forEach.call(lenChips.children, function (el, i) {
            el.classList.toggle("active", LENGTHS[i].id === lenId);
          });
        },
      }, l.label));
    });

    const srcChips = h("div", { class: "row" });
    [{ id: "prose", label: "📖 Художні" }, { id: "wiki", label: "🎲 Вікіпедія" }].forEach(function (s) {
      srcChips.append(h("button", {
        class: "chip" + (s.id === src ? " active" : ""),
        title: s.id === "prose" ? "Уривки художньої прози — плавний текст без імен і дат" : "Випадкові статті Вікіпедії — більше фактів, імен і дат",
        onclick: function () {
          src = s.id; App.store.setPref("rsvp.src", src);
          Array.prototype.forEach.call(srcChips.children, function (el, i) {
            el.classList.toggle("active", (i === 0 ? "prose" : "wiki") === src);
          });
        },
      }, s.label));
    });

    const chunkChips = h("div", { class: "row" });
    [1, 2, 3].forEach(function (c) {
      const chip = h("button", {
        class: "chip" + (c === chunk ? " active" : ""),
        onclick: function () {
          chunk = c; App.store.setPref("rsvp.chunk", c);
          Array.prototype.forEach.call(chunkChips.children, function (el, i) {
            el.classList.toggle("active", i === c - 1);
          });
        },
      }, c === 1 ? "1 слово" : c + " слова");
      chunkChips.append(chip);
    });

    const accelSel = h("select", null,
      h("option", { value: "0" }, "без розгону"),
      h("option", { value: "10" }, "+10 сл/хв за хвилину"),
      h("option", { value: "20" }, "+20 сл/хв за хвилину"),
      h("option", { value: "40" }, "+40 сл/хв за хвилину"));
    accelSel.value = String(accel);
    accelSel.addEventListener("change", function () {
      accel = parseInt(accelSel.value, 10);
      App.store.setPref("rsvp.accel", accel);
    });

    const fontRange = h("input", { type: "range", min: 28, max: 76, step: 2 });
    fontRange.value = fontPx;
    fontRange.addEventListener("input", function () {
      fontPx = parseInt(fontRange.value, 10);
      wordEl.style.fontSize = fontPx + "px"; // слово-приклад одразу показує реальний розмір
      App.store.setPref("rsvp.font", fontPx);
    });

    function showIdle() {
      wordEl.innerHTML = "";
      wordEl.append(h("span", { style: "flex:1;text-align:center;color:var(--muted)" }, "приклад"));
      statusEl.innerHTML = "";
      statusEl.append(
        h("span", null, "Натисни СТАРТ — текст приїде сам"),
        h("span", null, "слово вище показує обраний розмір шрифту"));
    }

    function showChunk() {
      const slice = tokens.slice(idx, idx + chunk);
      wordEl.innerHTML = "";
      if (chunk === 1 && orpOn && slice.length === 1) {
        const w = slice[0];
        const oi = Math.min(orpIndex(w.length), w.length - 1);
        wordEl.append(
          h("span", { style: "flex:1;text-align:right" }, w.slice(0, oi)),
          h("span", { class: "orp" }, w.charAt(oi)),
          h("span", { style: "flex:1;text-align:left" }, w.slice(oi + 1)));
      } else {
        wordEl.append(h("span", { style: "flex:1;text-align:center" }, slice.join(" ")));
      }
      progFill.style.width = (idx / tokens.length * 100) + "%";
      statusEl.innerHTML = "";
      statusEl.append(
        h("span", null, "слово " + Math.min(idx + chunk, tokens.length) + " з " + tokens.length),
        h("span", null, "≈ " + App.ui.fmtClock(activeMs / 1000), " · темп ", wpmVal));
    }

    function delayFor(slice) {
      let d = 60000 / wpm * slice.length;
      const last = slice[slice.length - 1] || "";
      if (/[.!?…:;]$/.test(last)) d *= 1.5;
      else if (/[,—]$/.test(last)) d *= 1.25;
      if (last.length > 9) d *= 1.2;
      return d;
    }

    function tick() {
      if (!running || paused) return;
      if (idx >= tokens.length) { finish(); return; }
      showChunk();
      const slice = tokens.slice(idx, idx + chunk);
      const d = delayFor(slice);
      activeMs += d;
      if (accel) setWpm(wpm + accel * (d / 60000));
      idx += chunk;
      timeoutId = setTimeout(tick, d);
    }

    function beginRun(text) {
      if (disposed) return;
      tokens = words(text);
      if (tokens.length < 5) { App.ui.toast("Текст закороткий", "info"); return; }
      idx = 0; activeMs = 0; running = true; paused = false; startWpm = wpm;
      startBtn.style.display = "none";
      pauseBtn.style.display = "";
      stopBtn.style.display = "";
      tick();
    }

    function start() {
      if (running) return;
      quizBox.innerHTML = "";
      wikiInfo.style.display = "none";
      if (src === "wiki") startWiki();
      else startProse();
    }

    /* художні уривки: випадкова стрічка з кількох уривків до потрібної довжини */
    function startProse() {
      const def = lenDef();
      const pool = App.ui.shuffle(App.data.proseExcerpts);
      const parts = [];
      let total = 0, i = 0;
      while (i < pool.length && total < def.words) {
        parts.push(pool[i]);
        total += pool[i].split(/\s+/).length;
        i++;
      }
      const distract = pool.slice(i, i + 5); // невикористані уривки — на дистрактори для питань
      lastRead = { titles: [], text: parts.join(" "), distractorTitles: [], distractorText: distract.join(" ") };
      beginRun(lastRead.text);
    }

    function fetchRandomSummaries(n) {
      const reqs = [];
      for (let i = 0; i < n; i++) {
        reqs.push(fetch("https://uk.wikipedia.org/api/rest_v1/page/random/summary", {
          headers: { Accept: "application/json" },
        }).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }));
      }
      return Promise.all(reqs);
    }

    /* нескінченне джерело текстів: випадкові статті української Вікіпедії */
    async function startWiki() {
      if (wikiLoading) return;
      wikiLoading = true;
      startBtn.disabled = true;
      startBtn.textContent = "ЗАВАНТАЖУЮ…";
      try {
        const def = lenDef();
        const parts = [];
        const titles = [];
        let total = 0;
        let fetched = 0;
        while (total < def.words && fetched < def.maxFetch) {
          const batch = Math.min(4, def.maxFetch - fetched);
          fetched += batch;
          const sums = await fetchRandomSummaries(batch);
          sums.forEach(function (j) {
            const extract = (j.extract || "").trim();
            const wc = extract ? extract.split(/\s+/).length : 0;
            if (wc < 20 || total >= def.words) return; // пропускаємо статті-заглушки
            titles.push(j.title);
            parts.push(extract);
            total += wc;
          });
        }
        if (!parts.length) throw new Error("порожні статті");
        // ще дві статті — на дистрактори для питань
        let dTitles = [];
        let dText = "";
        try {
          const ds = await fetchRandomSummaries(2);
          ds.forEach(function (j) {
            dTitles.push(j.title);
            dText += " " + (j.extract || "");
          });
        } catch (e) { /* питання просто будуть коротші */ }
        lastRead = { titles: titles, text: parts.join(" "), distractorTitles: dTitles, distractorText: dText };
        wikiInfo.textContent = "📚 Статті: " + titles.join(" · ");
        wikiInfo.style.display = "";
        beginRun(lastRead.text);
      } catch (e) {
        App.ui.toast("Не вдалося отримати статті з Вікіпедії — перевір інтернет", "info");
      } finally {
        wikiLoading = false;
        startBtn.disabled = false;
        startBtn.textContent = "СТАРТ";
      }
    }

    function pauseToggle() {
      if (!running) return;
      paused = !paused;
      pauseBtn.textContent = paused ? "▶ Далі (пробіл)" : "⏸ Пауза (пробіл)";
      if (paused) { if (timeoutId) clearTimeout(timeoutId); }
      else tick();
    }

    function saveRecord(avg, wordsRead, seconds, comp) {
      const rec = {
        kind: "rsvp", rsvpWpm: Math.round(wpm), avgWpm: avg,
        words: wordsRead, seconds: seconds,
      };
      if (comp !== null && comp !== undefined) rec.comp = comp;
      App.store.addRecord("reading", rec);
    }

    function stopAll(saveIt) {
      running = false; paused = false;
      if (timeoutId) clearTimeout(timeoutId);
      startBtn.style.display = "";
      pauseBtn.style.display = "none";
      pauseBtn.textContent = "⏸ Пауза (пробіл)";
      stopBtn.style.display = "none";
      if (saveIt && idx > 20) {
        const minutes = activeMs / 60000;
        const avg = Math.round(Math.min(idx, tokens.length) / Math.max(minutes, 0.01));
        App.store.addTime("reading", activeMs); // частково прочитане теж зіграний час
        saveRecord(avg, Math.min(idx, tokens.length), Math.round(activeMs / 1000), null);
      }
    }

    function finish() {
      const wordsRead = tokens.length;
      const minutes = activeMs / 60000;
      const avg = Math.round(wordsRead / Math.max(minutes, 0.01));
      const seconds = Math.round(activeMs / 1000);
      App.store.addTime("reading", activeMs);
      stopAll(false);
      wordEl.innerHTML = "";
      wordEl.append(h("span", { style: "flex:1;text-align:center;font-size:1.4rem" },
        "✅ " + wordsRead + " слів · середній темп " + avg + " сл/хв"));
      if (accel && wpm > startWpm) App.store.setPref("rsvp.wpm", Math.round(wpm));
      const qs = quizOn && lastRead ? buildQuiz(lastRead) : [];
      if (qs.length >= 2) {
        showQuiz(qs, avg, wordsRead, seconds);
      } else {
        saveRecord(avg, wordsRead, seconds, null);
        App.ui.toast("Сесію збережено: " + avg + " сл/хв");
      }
    }

    function showQuiz(qs, avg, wordsRead, seconds) {
      quizBox.innerHTML = "";
      const answers = new Array(qs.length).fill(-1);
      const optEls = [];
      let checked = false;
      const list = h("div");
      qs.forEach(function (q, qi) {
        const opts = h("div");
        optEls.push(opts);
        q.options.forEach(function (opt, oi) {
          opts.append(h("div", {
            class: "q-option",
            onclick: function () {
              if (checked) return;
              answers[qi] = oi;
              Array.prototype.forEach.call(opts.children, function (el, i) {
                el.classList.toggle("sel", i === oi);
              });
              checkBtn.disabled = answers.indexOf(-1) >= 0;
            },
          }, opt));
        });
        list.append(h("div", { style: "margin-bottom:14px" },
          h("h3", null, (qi + 1) + ". " + q.q), opts));
      });
      const resultLine = h("div", { style: "font-weight:900" });
      const againBtn = h("button", { class: "btn", style: "display:none", onclick: start }, "ЩЕ ТЕКСТ");
      const checkBtn = h("button", {
        class: "btn green", disabled: true,
        onclick: function () {
          if (checked) return;
          checked = true;
          checkBtn.style.display = "none";
          let correct = 0;
          qs.forEach(function (q, qi) {
            Array.prototype.forEach.call(optEls[qi].children, function (el, oi) {
              if (oi === q.correct) el.classList.add("ok");
              else if (oi === answers[qi]) el.classList.add("bad");
            });
            if (answers[qi] === q.correct) correct++;
          });
          const comp = Math.round(correct / qs.length * 100);
          const eff = Math.round(avg * comp / 100);
          resultLine.append("Розуміння: " + correct + "/" + qs.length + " (" + comp + "%) · ефективна швидкість " + eff + " сл/хв");
          saveRecord(avg, wordsRead, seconds, comp);
          // режим адаптації: 0 помилок → +10, 1 → 0, 2 → −10, 3 → −20 сл/хв на наступний текст
          if (adaptOn) {
            const wrong = qs.length - correct;
            const delta = (1 - wrong) * 10;
            if (delta !== 0) {
              const before = wpm;
              setWpm(wpm + delta);
              App.store.setPref("rsvp.wpm", wpm);
              App.ui.toast("📈 Адаптація: " + before + " → " + wpm + " сл/хв");
            } else {
              App.ui.toast("Адаптація: темп лишається " + wpm + " сл/хв");
            }
          } else {
            App.ui.toast("Збережено: " + avg + " сл/хв · розуміння " + comp + "%");
          }
          againBtn.style.display = "";
        },
      }, "ПЕРЕВІРИТИ");
      quizBox.append(h("div", { class: "card inner", style: "margin-top:14px" },
        h("h2", null, "🧐 Перевірка розуміння"),
        h("div", { class: "tiny muted", style: "margin:-6px 0 12px" },
          "Питання згенеровані з щойно прочитаного — перевір, що реально засвоїв."),
        list,
        h("div", { class: "row", style: "gap:14px" }, checkBtn, againBtn, resultLine)));
      quizBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    const startBtn = h("button", { class: "btn green big", onclick: start }, "СТАРТ");
    const pauseBtn = h("button", { class: "btn", style: "display:none", onclick: pauseToggle }, "⏸ Пауза (пробіл)");
    const stopBtn = h("button", { class: "btn ghost", style: "display:none", onclick: function () { stopAll(true); } }, "Стоп");

    function onKey(e) {
      if (!running) return;
      if (e.code === "Space") { e.preventDefault(); pauseToggle(); }
      else if (e.code === "Escape") stopAll(true);
      else if (e.code === "ArrowUp" || e.code === "ArrowRight") { setWpm(wpm + 10); App.store.setPref("rsvp.wpm", wpm); }
      else if (e.code === "ArrowDown" || e.code === "ArrowLeft") { setWpm(wpm - 10); App.store.setPref("rsvp.wpm", wpm); }
    }
    document.addEventListener("keydown", onKey);

    const orpCb = h("input", {
      type: "checkbox",
      onchange: function () {
        orpOn = orpCb.checked;
        App.store.setPref("rsvp.orp", orpOn);
      },
    });
    orpCb.checked = orpOn;

    const quizCb = h("input", {
      type: "checkbox",
      onchange: function () {
        quizOn = quizCb.checked;
        App.store.setPref("rsvp.quiz", quizOn);
        if (!quizOn && adaptOn) { adaptOn = false; adaptCb.checked = false; App.store.setPref("rsvp.adapt", false); }
      },
    });
    quizCb.checked = quizOn;

    const adaptCb = h("input", {
      type: "checkbox",
      onchange: function () {
        adaptOn = adaptCb.checked;
        App.store.setPref("rsvp.adapt", adaptOn);
        if (adaptOn && !quizOn) { quizOn = true; quizCb.checked = true; App.store.setPref("rsvp.quiz", true); }
      },
    });
    adaptCb.checked = adaptOn;

    root.append(
      h("div", { class: "card" },
        h("div", { class: "row", style: "gap:14px" },
          h("div", { class: "field" }, h("span", null, "Джерело"), srcChips),
          h("div", { class: "field" }, h("span", null, "Довжина тексту"), lenChips),
          h("div", { class: "field" }, h("span", null, "Слів за раз"), chunkChips),
          h("div", { class: "field" }, h("span", null, "Розгін"), accelSel),
          h("div", { class: "field", style: "min-width:130px" }, h("span", null, "Розмір шрифту"), fontRange)),
        h("div", { class: "row", style: "margin-top:12px;gap:16px" },
          h("span", { class: "muted", style: "font-weight:800" }, "Темп:"), wpmRange, wpmVal,
          h("label", {
            class: "opt",
            title: "Слово зсувається так, щоб червона літера завжди була в одній точці екрана — око взагалі не рухається. Корисно на високих темпах.",
          }, orpCb, "Літера-якір (ORP)"),
          h("label", {
            class: "opt",
            title: "Після тексту — 3 питання, згенеровані з прочитаного",
          }, quizCb, "Питання після тексту"),
          h("label", {
            class: "opt",
            title: "Темп наступного тексту росте за безпомилкові відповіді: 0 помилок +10, 1 помилка 0, 2 помилки −10, 3 помилки −20 сл/хв",
          }, adaptCb, "Адаптація темпу")),
        wikiInfo),
      h("div", { class: "card" },
        stage, prog, statusEl,
        h("div", { class: "row center", style: "margin-top:16px" }, startBtn, pauseBtn, stopBtn),
        quizBox,
        h("div", { class: "tiny muted", style: "margin-top:10px;text-align:center" },
          "«Художні» — плавні уривки прози; «Вікіпедія» — випадкові статті з фактами. Пробіл — старт/пауза · Esc — стоп · ↑/↓ — темп на льоту.")));

    showIdle();

    App.primaryAction = function () { if (!running) { start(); return true; } return false; };

    return function cleanup() {
      disposed = true;
      if (timeoutId) clearTimeout(timeoutId);
      running = false;
      document.removeEventListener("keydown", onKey);
    };
  }

  /* ---------- тест швидкості ---------- */

  function renderTest(root) {
    let textIdx = App.store.pref("readtest.idx", 0);
    let phase = "intro"; // intro | reading | questions | result
    let startTs = 0;
    let readMs = 0;
    let answers = [];
    let timerInt = null;

    const box = h("div");

    function setPhase(p) { phase = p; draw(); }

    function draw() {
      if (timerInt) { clearInterval(timerInt); timerInt = null; }
      box.innerHTML = "";
      const t = App.data.readingTexts[textIdx];
      const wcount = words(t.text).length;

      if (phase === "intro") {
        const sel = h("select", null, App.data.readingTexts.map(function (tt, i) {
          return h("option", { value: String(i) }, tt.title);
        }));
        sel.value = String(textIdx);
        sel.addEventListener("change", function () {
          textIdx = parseInt(sel.value, 10);
          App.store.setPref("readtest.idx", textIdx);
          draw();
        });
        box.append(h("div", { class: "card", style: "text-align:center" },
          h("h2", null, "Тест швидкості читання"),
          h("div", { class: "row center", style: "margin:10px 0" }, sel),
          h("div", { class: "muted", style: "margin-bottom:6px" }, "«" + t.title + "» · " + wcount + " слів · 3 питання після тексту"),
          h("div", { class: "small muted", style: "margin-bottom:16px" }, "Читай один раз, уважно, без повернень. Швидкість без розуміння не рахується!"),
          h("button", {
            class: "btn green big", onclick: function () {
              startTs = performance.now();
              setPhase("reading");
            },
          }, "ПОЧАТИ ЧИТАННЯ")));
      }

      if (phase === "reading") {
        const timerEl = h("span", { class: "yellow", style: "font-weight:900" }, "0:00");
        timerInt = setInterval(function () {
          timerEl.textContent = App.ui.fmtClock((performance.now() - startTs) / 1000);
        }, 250);
        box.append(h("div", { class: "card" },
          h("div", { class: "row between", style: "margin-bottom:12px" },
            h("h2", { style: "margin:0" }, t.title), timerEl),
          h("div", { class: "reading-text-view" }, t.text),
          h("div", { class: "row center", style: "margin-top:14px" },
            h("button", {
              class: "btn green big", onclick: function () {
                readMs = performance.now() - startTs;
                answers = new Array(t.questions.length).fill(-1);
                setPhase("questions");
              },
            }, "ПРОЧИТАВ ✓"))));
      }

      if (phase === "questions") {
        const qBox = h("div");
        t.questions.forEach(function (q, qi) {
          const opts = h("div");
          q.options.forEach(function (opt, oi) {
            const optEl = h("div", {
              class: "q-option",
              onclick: function () {
                answers[qi] = oi;
                Array.prototype.forEach.call(opts.children, function (el, i) {
                  el.classList.toggle("sel", i === oi);
                });
                doneBtn.disabled = answers.indexOf(-1) >= 0;
              },
            }, opt);
            opts.append(optEl);
          });
          qBox.append(h("div", { style: "margin-bottom:18px" },
            h("h3", null, (qi + 1) + ". " + q.q), opts));
        });
        const doneBtn = h("button", {
          class: "btn green big", disabled: true,
          onclick: function () { setPhase("result"); },
        }, "РЕЗУЛЬТАТ");
        box.append(h("div", { class: "card" },
          h("h2", null, "Питання на розуміння"), qBox,
          h("div", { class: "row center" }, doneBtn)));
      }

      if (phase === "result") {
        const minutes = readMs / 60000;
        const wpm = Math.round(wcount / Math.max(minutes, 0.01));
        let correct = 0;
        t.questions.forEach(function (q, qi) { if (answers[qi] === q.correct) correct++; });
        const comp = Math.round(correct / t.questions.length * 100);
        const eff = Math.round(wpm * comp / 100);
        const prevBest = bestTestWpm();
        App.store.addTime("reading", readMs);
        App.store.addRecord("reading", { kind: "test", wpm: wpm, comp: comp, effWpm: eff, words: wcount, textId: t.id, seconds: Math.round(readMs / 1000) });
        if (prevBest === null || wpm > prevBest) App.ui.toast("🏆 Новий рекорд читання: " + wpm + " сл/хв");
        box.append(h("div", { class: "card", style: "text-align:center" },
          h("h2", null, "Результат"),
          h("div", { class: "stat-cards", style: "margin:14px 0" },
            App.ui.statCard(wpm + "", "слів за хвилину"),
            App.ui.statCard(comp + "%", "розуміння (" + correct + "/" + t.questions.length + ")"),
            App.ui.statCard(eff + "", "ефективна швидкість")),
          h("div", { class: "muted small", style: "margin-bottom:14px" },
            comp < 67 ? "Розуміння просіло — наступного разу трохи повільніше." :
              (wpm >= 400 ? "Ціль 400+ узята! Тримай розуміння і нарощуй далі." : "До цілі 400 сл/хв лишилось " + Math.max(0, 400 - wpm) + ". Тренуй RSVP на +30% від цього темпу.")),
          h("div", { class: "row center" },
            h("button", {
              class: "btn green", onclick: function () {
                textIdx = (textIdx + 1) % App.data.readingTexts.length;
                App.store.setPref("readtest.idx", textIdx);
                setPhase("intro");
              },
            }, "Інший текст"))));
      }
    }

    draw();
    root.append(box);
    return function cleanup() { if (timerInt) clearInterval(timerInt); };
  }

  function bestTestWpm() {
    let best = null;
    App.store.records("reading").forEach(function (r) {
      if (r.kind === "test" && typeof r.wpm === "number") {
        if (best === null || r.wpm > best) best = r.wpm;
      }
    });
    return best;
  }

  function bestRsvpWpm() {
    let best = null;
    App.store.records("reading").forEach(function (r) {
      if (r.kind === "rsvp") {
        const v = r.avgWpm || r.rsvpWpm;
        if (typeof v === "number" && (best === null || v > best)) best = v;
      }
    });
    return best;
  }

  /* ---------- результати ---------- */

  function renderResults(root) {
    const recs = App.store.records("reading");
    const tests = recs.filter(function (r) { return r.kind === "test"; });
    const rsvps = recs.filter(function (r) { return r.kind === "rsvp"; });
    const totalWords = recs.reduce(function (s, r) { return s + (r.words || 0); }, 0);
    const best = bestTestWpm();
    const bestRsvp = bestRsvpWpm();

    root.append(h("div", { class: "card" },
      h("h2", null, "Підсумки"),
      h("div", { class: "stat-cards" },
        App.ui.statCard(best || "—", "рекорд тесту, сл/хв"),
        App.ui.statCard(bestRsvp || "—", "найкращий RSVP-темп"),
        App.ui.statCard(tests.length ? tests[tests.length - 1].comp + "%" : "—", "останнє розуміння"),
        App.ui.statCard(String(rsvps.length), "RSVP-сесій"),
        App.ui.statCard(String(totalWords), "слів прочитано"))));

    root.append(h("div", { class: "card" },
      h("h2", null, "Швидкість у тестах (ціль 400)"),
      App.ui.sparkline(tests.map(function (r) { return r.wpm; }), { w: 480, h: 70, goal: 400 })));

    const recent = recs.slice(-12).reverse();
    root.append(h("div", { class: "card" },
      h("h2", null, "Останні сесії"),
      recent.length ? h("table", { class: "results" },
        h("tr", null, h("th", null, "Тип"), h("th", null, "Темп"), h("th", null, "Розуміння"), h("th", null, "Слів"), h("th", null, "Дата")),
        recent.map(function (r) {
          return h("tr", null,
            h("td", null, r.kind === "test" ? "📏 тест" : "⚡ RSVP"),
            h("td", null, (r.kind === "test" ? r.wpm : (r.avgWpm || r.rsvpWpm)) + " сл/хв"),
            h("td", null, r.comp != null ? r.comp + "%" : "—"),
            h("td", null, String(r.words || "—")),
            h("td", null, App.ui.fmtDate(r.date)));
        })) : h("div", { class: "muted small" }, "Поки порожньо. Пройди тест або RSVP-сесію.")));
  }

  /* ---------- каркас сторінки ---------- */

  function render(root) {
    let tab = "rsvp";
    let innerCleanup = null;

    function build() {
      if (innerCleanup) { innerCleanup(); innerCleanup = null; }
      App.primaryAction = null; // лише RSVP-вкладка вмикає Space-старт
      root.innerHTML = "";
      root.append(
        h("h1", { class: "page-title" }, "📖 Швидкочитання"),
        h("div", { class: "page-sub" }, "RSVP прибирає регресії і глушить внутрішній голос. Прогрес заміряй лише тестом із питаннями."),
        App.ui.tabBar([
          { id: "rsvp", label: "⚡ RSVP-тренажер" },
          { id: "test", label: "📏 Тест швидкості" },
          { id: "results", label: "📊 Результати" },
        ], tab, function (id) { tab = id; build(); }));
      const body = h("div", { class: "fade-in" });
      root.append(body);
      if (tab === "rsvp") innerCleanup = renderRSVP(body);
      else if (tab === "test") innerCleanup = renderTest(body);
      else renderResults(body);
    }

    build();
    return function cleanup() { if (innerCleanup) innerCleanup(); };
  }

  return { id: "reading", title: "Швидкочитання", icon: "📖", render: render, bestTestWpm: bestTestWpm };
})();
