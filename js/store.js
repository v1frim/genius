/* Глобальний стан + збереження у localStorage */
window.App = window.App || {};

App.store = (function () {
  const KEY = 'genius.v1';
  const RECORD_CATS = ['schulte', 'reading', 'typing', 'arithmetic', 'digitSpan', 'visualMemory', 'meditation'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayStr() { return dateStr(new Date()); }

  function mondayStr() {
    const d = new Date();
    const shift = (d.getDay() + 6) % 7; // пн = 0
    d.setDate(d.getDate() - shift);
    return dateStr(d);
  }

  function emptyState() {
    const records = {};
    RECORD_CATS.forEach(function (c) { records[c] = []; });
    return {
      version: 1,
      records: records,
      tasks: null,          // заповнюється з App.data.defaultTasks при першому запуску
      taskState: {},        // {'d:id' | 'w:id' : true}
      taskHistory: [],      // [{date, done, total, pct}]
      lastDailyReset: null,
      lastWeeklyReset: null,
      goals: null,          // заповнюється з App.data.defaultGoals
      twisterTotal: 0,
      twisterByDay: {},     // {'YYYY-MM-DD': count}
      timeByDay: {},        // {'YYYY-MM-DD': {schulte: ms, reading: ms, ...}} — час у розділах
      prefs: {},            // налаштування модулів (wpm, рівень тощо)
    };
  }

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : emptyState();
    } catch (e) {
      console.error('Не вдалося прочитати збереження', e);
      state = emptyState();
    }
    // підстрахування для старих/пошкоджених збережень
    const fresh = emptyState();
    Object.keys(fresh).forEach(function (k) {
      if (state[k] === undefined) state[k] = fresh[k];
    });
    RECORD_CATS.forEach(function (c) {
      if (!Array.isArray(state.records[c])) state.records[c] = [];
    });
    // прибрати фізично неможливі рекорди друку — спадок старого бага таймера
    // (недорахований час давав сотні-тисячі зн/хв; людина не друкує понад ~1500)
    state.records.typing = state.records.typing.filter(function (r) {
      return !(typeof r.cpm === 'number' && r.cpm > 1500);
    });
    if (!state.tasks) state.tasks = JSON.parse(JSON.stringify(App.data.defaultTasks));
    if (!state.goals) state.goals = JSON.parse(JSON.stringify(App.data.defaultGoals));
    ensureEngPlanTasks();
    rollover();
    save();
  }

  /* Авто-задачі «планів» англійської (інтеграція з Oxford 1000): один щоденний
     трекер на 2 плани (X/2) і один щотижневий на 14 (X/14). Прибирає старий ручний
     пункт «Англійська: за своєю системою» та попередній дворядковий варіант.
     Версійний прапор робить онову одноразовою, але самовиправною; після неї
     користувач може видалити трекери назовсім — повторно не додаються. */
  function ensureEngPlanTasks() {
    if (state.engPlanV >= 2) return;
    var drop = { eng: 1, engPlan1: 1, engPlan2: 1 };
    state.tasks = state.tasks.filter(function (t) { return !drop[t.id]; });
    if (state.taskState) Object.keys(drop).forEach(function (id) { delete state.taskState['d:' + id]; });
    var defs = [
      { id: 'engPlanDay', emoji: '🇬🇧', title: 'Англійська: 2 плани (по 4 бали)', period: 'daily', link: 'https://v1frim.github.io/Oxford_1000/' },
      { id: 'engPlanWeek', emoji: '🇬🇧', title: 'Англійська: 14 планів за тиждень', period: 'weekly', link: 'https://v1frim.github.io/Oxford_1000/' },
    ];
    var have = {};
    state.tasks.forEach(function (t) { have[t.id] = true; });
    defs.forEach(function (def) { if (!have[def.id]) state.tasks.push(def); });
    delete state.engPlanInit;
    state.engPlanV = 2;
  }

  /* Перенесення дня/тижня: фіксуємо вчорашній прогрес і скидаємо чекбокси */
  function rollover() {
    const today = todayStr();
    if (state.lastDailyReset !== today) {
      if (state.lastDailyReset) {
        const dailyIds = state.tasks.filter(function (t) { return t.period === 'daily'; }).map(function (t) { return t.id; });
        const done = dailyIds.filter(function (id) { return state.taskState['d:' + id]; }).length;
        if (dailyIds.length) {
          state.taskHistory.push({
            date: state.lastDailyReset,
            done: done,
            total: dailyIds.length,
            pct: Math.round(done / dailyIds.length * 100),
          });
          if (state.taskHistory.length > 400) state.taskHistory = state.taskHistory.slice(-400);
        }
        Object.keys(state.taskState).forEach(function (k) {
          if (k.indexOf('d:') === 0) delete state.taskState[k];
        });
      }
      state.lastDailyReset = today;
    }
    const mon = mondayStr();
    if (state.lastWeeklyReset !== mon) {
      Object.keys(state.taskState).forEach(function (k) {
        if (k.indexOf('w:') === 0) delete state.taskState[k];
      });
      state.lastWeeklyReset = mon;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Не вдалося зберегти', e);
    }
  }

  function addRecord(cat, data) {
    const rec = Object.assign({ date: todayStr(), ts: Date.now() }, data);
    state.records[cat].push(rec);
    if (state.records[cat].length > 500) state.records[cat] = state.records[cat].slice(-500);
    save();
    return rec;
  }

  function records(cat) { return state.records[cat] || []; }

  function best(cat, field, mode) {
    const list = records(cat);
    if (!list.length) return null;
    let val = null;
    list.forEach(function (r) {
      if (typeof r[field] !== 'number') return;
      if (val === null) { val = r[field]; return; }
      val = mode === 'min' ? Math.min(val, r[field]) : Math.max(val, r[field]);
    });
    return val;
  }

  /* зіграний час у розділі за день (сума тривалостей завершених ігор) */
  function addTime(cat, ms) {
    if (!ms || ms < 0) return;
    if (!state.timeByDay) state.timeByDay = {};
    const d = todayStr();
    if (!state.timeByDay[d]) state.timeByDay[d] = {};
    state.timeByDay[d][cat] = (state.timeByDay[d][cat] || 0) + Math.round(ms);
    // прибираємо записи, старші ~120 днів
    const keys = Object.keys(state.timeByDay);
    if (keys.length > 140) {
      keys.sort();
      keys.slice(0, keys.length - 140).forEach(function (k) { delete state.timeByDay[k]; });
    }
    save();
  }

  function timeToday(cat) {
    const d = state.timeByDay && state.timeByDay[todayStr()];
    if (!d) return 0;
    return cat ? (d[cat] || 0) : Object.keys(d).reduce(function (s, k) { return s + d[k]; }, 0);
  }

  function pref(key, fallback) {
    return state.prefs[key] !== undefined ? state.prefs[key] : fallback;
  }

  function setPref(key, val) {
    state.prefs[key] = val;
    save();
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(text) {
    const parsed = JSON.parse(text); // кидає виняток, якщо JSON битий
    if (!parsed || typeof parsed !== 'object' || !parsed.records) {
      throw new Error('Це не схоже на експорт із цього сайту');
    }
    state = parsed;
    save();
    load();
  }

  function resetAll() {
    state = emptyState();
    save();
    load();
  }

  return {
    load: load,
    save: save,
    rollover: function () { rollover(); save(); },
    get state() { return state; },
    addRecord: addRecord,
    records: records,
    best: best,
    pref: pref,
    setPref: setPref,
    addTime: addTime,
    timeToday: timeToday,
    todayStr: todayStr,
    mondayStr: mondayStr,
    dateStr: dateStr,
    exportJSON: exportJSON,
    importJSON: importJSON,
    resetAll: resetAll,
  };
})();
